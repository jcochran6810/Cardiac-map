/**
 * Event-driven ECG + cardiac-cycle engine.
 *
 * A rhythm generator schedules atrial (P) and ventricular (QRS-T) events in
 * absolute time. Lead voltages are computed by summing the dipole pulses of
 * nearby events and projecting onto each lead. The 3D heart, conduction
 * overlay, hemodynamic charts and ECG all read from the same event list, so the
 * picture, the waveform and the mechanics are always in step — including for
 * irregular rhythms (AF), dropped beats (Mobitz) and AV dissociation (CHB/VT).
 */
import {
  AnyLead, DipolePulse, LEAD_VECTORS, Vec3, dot, norm, rotateAbout, scale,
} from './vector';
import {
  ECGProfile, P_TEMPLATES, PTemplate, QRS_TEMPLATES, QRSTemplate, RhythmKind, TWaveSpec,
  prForRate, qtForRR, resolveProfile,
} from './profiles';
import { applyMods, modsKey, type RhythmMods } from './mods';

export type VentKind = 'conducted' | 'pvc' | 'escape' | 'paced' | 'svt' | 'junctional' | 'vt' | 'torsades';

export interface AtrialEvent {
  /** P onset (ms) */
  t: number;
  kind: 'sinus' | 'retrograde';
  template: PTemplate;
  conducted: boolean;
  /** For PR-segment injury (pericarditis): end time of the PR segment */
  prEnd?: number;
  prSegment?: Vec3;
  scale: number;
  /**
   * When the beat this wave is part of began, if that is before the wave itself (the retrograde P after an SVT
   * beat, the blocked sinus P that goes with a PVC). A beat that has begun is finished: see ECGEngine.setRhythm.
   */
  onset?: number;
  /** Place in the rhythm's repeating pattern (Wenckebach group, every-4th PVC, alternans), so a change of rate carries on from it */
  n?: number;
}

export interface VentEvent {
  /** QRS onset (ms) */
  t: number;
  kind: VentKind;
  pulses: DipolePulse[];
  qrsDur: number;
  qt: number;
  tw: { v: Vec3; tp: number; rise: number; fall: number };
  st?: Vec3;
  /** P onset that conducted this beat (for conduction animation) */
  pTime?: number;
  spike?: boolean;
  conduction: NonNullable<QRSTemplate['conduction']>;
  /** Hemodynamic weighting: 1 = normal contraction; < 1 for ectopic/dyssynchronous beats */
  efficiency: number;
  /** Cycle length (ms) used for rate-dependent timing (QT, ejection time) */
  rr: number;
  /** Cycle length the QT was worked out from, where that is not `rr` (atrial fibrillation: the average cycle) */
  qtRR?: number;
  /** When this beat began, if that is before its QRS and it has no `pTime` (the retrograde P ahead of a junctional beat, the blocked P ahead of a late PVC) */
  onset?: number;
  /** Isovolumic relaxation override (ms) — short when LA pressure is high (mitral stenosis) */
  ivrt?: number;
}

interface Segment {
  start: number;
  /** the rhythm profile with any drug effects applied */
  profile: ECGProfile;
  hr: number;
  /** key of the drug modifiers in force (empty when none) */
  mods: string;
  /**
   * When this rhythm began. It is carried over while only the rate or a drug effect changes, so that flutter
   * waves, the twisting of torsades and the coarse-to-fine decay of VF run on without a jump.
   */
  origin: number;
}

/** Rhythms whose P waves come from the sinus node, whether or not they reach the ventricles */
const SINUS_P: ReadonlySet<RhythmKind> = new Set<RhythmKind>(['sinus', 'pvc', 'wenckebach', 'mobitz2', 'paced', 'chb', 'vpaced', 'vt']);

/** The T wave is over by this fraction of the cycle: a QT cannot outlast the RR interval it sits in */
const QT_ROOM = 0.9;
/** Shortest JT (end of QRS to end of T), ms: keeps the T wave of a wide beat clear of its QRS */
const MIN_JT = 140;
/** How much of the recording is kept once it is trimmed, ms */
const KEEP_MS = 5 * 60000;

// ─── Deterministic noise helpers ───────────────────────────────────────────

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One repeatable draw in [0, 1) for a moment in time (the same moment always gives the same draw) */
function unit(t: number): number {
  return mulberry32(Math.round(t * 16))();
}

function hash1(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth 1D value noise in [-1, 1] */
export function noise1(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return (hash1(i) * (1 - u) + hash1(i + 1) * u) * 2 - 1;
}

function gauss(dt: number, w: number): number {
  const z = dt / w;
  return Math.exp(-0.5 * z * z);
}

function logistic(x: number, w: number): number {
  return 1 / (1 + Math.exp(-x / w));
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// ─── Beat builders ─────────────────────────────────────────────────────────

function buildT(spec: TWaveSpec, qt: number) {
  const rise = (spec.rise ?? 0.14) * qt;
  const fall = (spec.fall ?? 0.085) * qt;
  return { v: scale(norm(spec.dir), spec.mag), tp: qt - 2.5 * fall, rise, fall };
}

function buildVent(
  t: number,
  kind: VentKind,
  profile: ECGProfile,
  templateId: string,
  rr: number,
  opts: {
    pTime?: number; amp?: number; rotate?: { axis: Vec3; angle: number }; useProfileT?: boolean; spike?: boolean;
    /** cycle length the QT follows, when that is not `rr` */
    qtRR?: number;
    /** time until the next QRS, when that is not `rr` */
    room?: number;
  } = {},
): VentEvent {
  const tpl = QRS_TEMPLATES[templateId] ?? QRS_TEMPLATES.normal;
  const widen = kind === 'conducted' || kind === 'svt' || kind === 'junctional' ? profile.qrsWiden ?? 1 : 1;
  const amp = (opts.amp ?? 1) * (kind === 'conducted' || kind === 'svt' || kind === 'junctional' ? profile.qrsScale ?? 1 : 1);
  let pulses = tpl.pulses.map((p) => ({ t: p.t * widen, w: p.w * widen, v: scale(p.v, amp), w2: p.w2 }));
  if (opts.rotate) {
    const { axis, angle } = opts.rotate;
    pulses = pulses.map((p) => ({ ...p, v: rotateAbout(p.v, axis, angle) }));
  }
  const qrsDur = tpl.duration * widen;
  // Fridericia for the cycle length; a wide QRS still needs a short JT after it; and whatever the formula says,
  // the T wave is over before the next beat is due (at very fast rates the QT has to shorten with the cycle)
  const qt = Math.min(Math.max(qtForRR(profile.qtc, opts.qtRR ?? rr), qrsDur + MIN_JT), QT_ROOM * (opts.room ?? rr));
  const useProfile = opts.useProfileT ?? (kind === 'conducted' || kind === 'svt' || kind === 'junctional');
  const tSpec: TWaveSpec = useProfile && profile.t ? profile.t : tpl.t;
  let tw = buildT(tSpec, qt);
  if (opts.rotate) tw = { ...tw, v: rotateAbout(tw.v, opts.rotate.axis, opts.rotate.angle) };
  if (useProfile && profile.qrsScale && profile.qrsScale < 0.6 && !profile.t) tw = { ...tw, v: scale(tw.v, profile.qrsScale) };
  let st: Vec3 | undefined;
  if (useProfile && profile.injury) st = profile.injury;
  if (tpl.st) st = st ? [st[0] + tpl.st[0], st[1] + tpl.st[1], st[2] + tpl.st[2]] : tpl.st;
  const efficiency = kind === 'conducted' || kind === 'svt' || kind === 'junctional'
    ? (tpl.conduction === 'lbbb' ? 0.85 : 1)
    : kind === 'paced' ? 0.85 : kind === 'torsades' ? 0.15 : kind === 'vt' ? 0.6 : 0.7;
  return {
    t, kind, pulses, qrsDur, qt, tw, st,
    pTime: opts.pTime,
    spike: opts.spike,
    conduction: tpl.conduction ?? 'normal',
    efficiency,
    rr,
    qtRR: opts.qtRR,
    ivrt: profile.hemo === 'mitral-stenosis' ? 65 : undefined,
  };
}

function buildAtrial(t: number, profile: ECGProfile, kind: 'sinus' | 'retrograde', conducted: boolean, prEnd?: number): AtrialEvent {
  const tplId = kind === 'retrograde' ? 'retrograde' : profile.p === 'none' ? 'normal' : profile.p;
  return {
    t,
    kind,
    template: P_TEMPLATES[tplId] ?? P_TEMPLATES.normal,
    conducted,
    prEnd,
    prSegment: profile.prSegment,
    scale: 1,
  };
}

// ─── Rhythm generators ─────────────────────────────────────────────────────

interface Generator {
  cursor: number;
  step(): void;
}

export class ECGEngine {
  atrial: AtrialEvent[] = [];
  vent: VentEvent[] = [];
  segments: Segment[] = [];
  /** The recording before this time has been discarded (0 while all of it is still kept) */
  keptFrom = 0;
  private gen: Generator | null = null;

  constructor(profileId = 'normal-sinus', hr = 72) {
    this.setRhythm(profileId, hr, 0);
  }

  get current(): Segment {
    return this.segments[this.segments.length - 1];
  }

  /**
   * Switch rhythm/rate (and drug effects, see ecg/mods.ts) at time `now`. Past events are preserved so the
   * strip shows the transition. With `from` earlier than `now` the rhythm is rewritten from `from` instead, so
   * the recent past — everything already on screen — shows the new rhythm too (a learner opening a condition).
   */
  setRhythm(profileId: string, hr: number, now: number, mods: RhythmMods | null = null, from = now) {
    const base = resolveProfile(profileId);
    const key = modsKey(mods);
    const rate = hr > 0 ? hr : base.defaultHR;
    const start = Math.max(0, Math.min(from, now));
    const cur = this.segments[this.segments.length - 1];
    // Nothing to change. That holds too when `now` lies before the start of this rhythm: the playhead was dragged
    // back into the recording, which is replayed as it was recorded — only an explicit rewrite (`from` before
    // `now`) or a real change made there replaces it.
    if (cur && cur.profile.id === base.id && cur.hr === rate && cur.mods === key && (cur.start <= start || from >= now)) return;
    const profile = applyMods(base, mods);

    // A beat that has begun is finished: once its P wave is on the screen its QRS follows (and so does the
    // retrograde P of a QRS already drawn), so a change of rate, rhythm or drug never leaves a P wave without
    // its QRS. Everything scheduled after that is dropped. In VF and asystole the ventricles have stopped
    // beating, so there nothing more follows.
    const stopped = profile.rhythm === 'vf' || profile.rhythm === 'asystole';
    this.atrial = this.atrial.filter((e) => (stopped ? e.t : e.onset ?? e.t) <= start);
    this.vent = this.vent.filter((e) => (stopped ? e.t : e.onset ?? e.pTime ?? e.t) <= start);
    // Segments that start later (a change made after dragging back, or inside the rewritten past) are discarded
    this.segments = this.segments.filter((s) => s.start < start);
    const before = this.segments[this.segments.length - 1];
    const seg: Segment = {
      start, profile, hr: rate, mods: key,
      origin: before && before.profile.rhythm === profile.rhythm ? before.origin : start,
    };
    this.segments.push(seg);
    this.gen = this.createGenerator(seg, before);
  }

  /** Make sure events exist up to `until` ms. */
  ensure(until: number) {
    if (!this.gen) return;
    let guard = 0;
    while (this.gen.cursor < until && guard++ < 5000) this.gen.step();
    this.prune(until);
  }

  private prune(until: number) {
    if (this.vent.length < 3000 && this.atrial.length < 3000) return;
    const cutoff = until - KEEP_MS;
    // In place: the running generator goes on adding beats to these same lists
    this.atrial.splice(0, ECGEngine.lastIndex(this.atrial, cutoff) + 1);
    this.vent.splice(0, ECGEngine.lastIndex(this.vent, cutoff) + 1);
    this.keptFrom = Math.max(this.keptFrom, cutoff);
  }

  /** The rhythm in force at time `t`: the latest segment that had begun by then (the first one for any earlier time) */
  segmentAt(t: number): Segment {
    // Segments are in order of their start. A binary search, because every step of a dragged rate slider adds
    // one: looking back into a long recording must not walk through all of them for every sample that is drawn.
    let lo = 0;
    let hi = this.segments.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.segments[mid].start <= t) lo = mid;
      else hi = mid - 1;
    }
    return this.segments[lo];
  }

  // ─── Generators ──────────────────────────────────────────────────────────

  /**
   * Schedules the beats of a segment. `before` is the rhythm in force until then: what a monitor shows at a
   * change is the last beat, then the next one a full cycle of the NEW rhythm later — never an extra early beat,
   * and never before the last T wave is over. A pacemaker that simply carries on (the sinus node through a change
   * of rate, an escape focus, flutter waves) keeps its own time.
   */
  private createGenerator(seg: Segment, before?: Segment): Generator {
    const { profile } = seg;
    const hr = seg.hr;
    const start = seg.start;
    const was = before?.profile.rhythm;
    const rng = mulberry32(Math.floor(start) * 9301 + 49297);
    const lastV = this.vent[this.vent.length - 1];
    const lastA = this.atrial[this.atrial.length - 1];
    const rrNominal = hr > 0 ? 60000 / hr : 1000;
    // The same kind of rhythm carries on: only its rate or a drug effect changed
    const same = was === profile.rhythm;
    // The sinus node was setting the atrial rate and still does: its next P comes one sinus cycle after its last
    const sinusOn = !!lastA && lastA.kind === 'sinus' && !!was && SINUS_P.has(was);
    // The last T wave has to be over before the next QRS (the same room a QT is given within its own cycle)
    const tOver = lastV ? lastV.t + lastV.qt / QT_ROOM : Number.NEGATIVE_INFINITY;
    // Earliest next beat of a ventricular (or AV-nodal) pacemaker: one new cycle after the last beat
    const vReady = lastV ? Math.max(start, lastV.t + rrNominal, tOver) : start + 120;
    const aReady = lastA ? Math.max(start, lastA.t + 200) : start + 50;
    const pr = prForRate(profile.pr, hr);
    const atrial = this.atrial;
    const vent = this.vent;
    let lastQRS = lastV ? lastV.t : start - rrNominal;
    let lastQT = lastV ? lastV.qt : 0;

    const pushV = (e: VentEvent) => {
      vent.push(e);
      lastQRS = e.t;
      lastQT = e.qt;
    };
    const pushA = (e: AtrialEvent) => {
      // A wave kept from a beat in progress can lie a little ahead: the list stays in time order
      let i = atrial.length;
      while (i > 0 && atrial[i - 1].t > e.t) i--;
      atrial.splice(i, 0, e);
    };

    switch (profile.rhythm) {
      case 'sinus':
      case 'pvc':
      case 'wenckebach':
      case 'mobitz2':
      case 'paced': {
        const av = profile.rhythm === 'paced' ? 160 : pr;
        const pReady = sinusOn ? lastA.t + rrNominal : lastA ? lastA.t + 200 : start + 50;
        // The QRS that follows the P needs the ventricles ready: after the last T wave and, when another
        // pacemaker fired the last beat (VT, an escape rhythm, AF, SVT), one new cycle after that beat. What
        // counts is the beat itself, not the rhythm in force until now: a second change (the rate nudged just
        // after the rhythm was chosen) can arrive before this rhythm has had a beat of its own.
        const ownBeat = !!lastV && (lastV.pTime !== undefined || lastV.kind === 'pvc');
        const vFloor = lastV && !(sinusOn && ownBeat) ? Math.max(tOver, lastV.t + rrNominal) : tOver;
        let nextP = Math.max(start, pReady, vFloor - av);
        let n = same && lastA?.n !== undefined ? lastA.n + 1 : 0;
        const rsa = hr < 100 ? 0.025 : 0.008;
        return {
          get cursor() { return nextP; },
          step() {
            const rr = rrNominal * (1 + rsa * Math.sin((2 * Math.PI * nextP) / 4600));
            const idx = n++;
            const p = (conducted: boolean, prEnd?: number): AtrialEvent => ({ ...buildAtrial(nextP, profile, 'sinus', conducted, prEnd), n: idx });
            // Electrical alternans: the heart swings in the effusion, so every other QRS is smaller
            const amp = profile.alternans && idx % 2 ? 1 - profile.alternans : 1;
            const conduct = (delay: number) => {
              pushA(p(true, nextP + delay));
              pushV(buildVent(nextP + delay, 'conducted', profile, profile.qrs, rr, { pTime: nextP, amp }));
            };
            if (profile.avBlock && profile.rhythm !== 'paced') {
              // Every P blocked at the AV node (adenosine): P waves march on without QRS complexes
              pushA(p(false));
            } else if (profile.rhythm === 'pvc' && idx % 4 === 3) {
              // The PVC arrives early — but after the T wave before it, not on it, which at fast sinus rates
              // leaves it only a little early. The sinus P on schedule is blocked (full compensatory pause).
              const pvcT = Math.max(start, lastQRS + Math.max(rrNominal * 0.6, lastQT + 20));
              const onset = Math.min(pvcT, nextP);
              // One beat: whichever of the two is drawn first, the other follows
              pushV({ ...buildVent(pvcT, 'pvc', profile, 'pvc', rr * 0.6, { room: nextP + rr + pr - pvcT }), onset });
              pushA({ ...p(false), onset });
            } else if (profile.rhythm === 'wenckebach') {
              const cyc = idx % 4;
              if (cyc === 3) pushA(p(false));
              else conduct(pr + [0, 95, 140][cyc]);
            } else if (profile.rhythm === 'mobitz2') {
              if (idx % 4 === 3) pushA(p(false));
              else conduct(pr);
            } else if (profile.rhythm === 'paced') {
              pushA(p(true, nextP + av));
              pushV(buildVent(nextP + av, 'paced', profile, 'paced', rr, { pTime: nextP, spike: true }));
            } else {
              conduct(pr);
            }
            nextP += rr;
          },
        };
      }

      case 'chb': {
        const atrialRR = 60000 / 76;
        let nextP = sinusOn ? Math.max(start, lastA.t + atrialRR) : aReady + rng() * 300;
        // A new escape focus takes a moment to wake up; one that is already running keeps its time
        let nextV = same ? vReady : Math.max(vReady, start + 400);
        // The escape beats carry the profile's ST-T where it has one (the injury current of an infarct, a drug
        // effect); otherwise the secondary T wave of the escape complex itself
        const useProfileT = !!(profile.injury || profile.t);
        return {
          get cursor() { return Math.min(nextP, nextV); },
          step() {
            if (nextP <= nextV) {
              pushA(buildAtrial(nextP, profile, 'sinus', false));
              nextP += atrialRR * (1 + 0.02 * Math.sin(nextP / 3100));
            } else {
              const rr = rrNominal * (1 + 0.015 * (rng() - 0.5));
              pushV(buildVent(nextV, 'escape', profile, profile.qrs, rr, { useProfileT }));
              nextV += rr;
            }
          },
        };
      }

      case 'vpaced': {
        // Fixed-rate ventricular pacing (transcutaneous) with independent atrial activity
        const atrialRR = 60000 / 74;
        let nextP = sinusOn ? Math.max(start, lastA.t + atrialRR) : aReady + rng() * 300;
        let nextV = same ? vReady : Math.max(vReady, start + 300);
        return {
          get cursor() { return Math.min(nextP, nextV); },
          step() {
            if (nextP <= nextV) {
              pushA(buildAtrial(nextP, profile, 'sinus', false));
              nextP += atrialRR * (1 + 0.02 * Math.sin(nextP / 2900));
            } else {
              pushV(buildVent(nextV, 'paced', profile, 'paced', rrNominal, { spike: true, useProfileT: false }));
              nextV += rrNominal;
            }
          },
        };
      }

      case 'vt': {
        const atrialRR = 60000 / 82;
        let nextP = sinusOn ? Math.max(start, lastA.t + atrialRR) : aReady + rng() * 400;
        let nextV = vReady;
        return {
          get cursor() { return Math.min(nextP, nextV); },
          step() {
            if (nextP <= nextV) {
              // AV dissociation: sinus P waves continue independently
              pushA(buildAtrial(nextP, profile, 'sinus', false));
              nextP += atrialRR;
            } else {
              pushV(buildVent(nextV, 'vt', profile, profile.qrs, rrNominal, { useProfileT: false }));
              nextV += rrNominal * (1 + 0.01 * (rng() - 0.5));
            }
          },
        };
      }

      case 'af': {
        // The QT follows the average rate, not the cycle just before each beat: it adapts over many beats, so
        // in AF it hardly moves from beat to beat
        const beatAt = (t: number, prev: number) =>
          buildVent(t, 'conducted', profile, profile.qrs, Math.max(300, t - prev), { qtRR: rrNominal, room: rrNominal });
        const qt = beatAt(0, -rrNominal).qt;
        // Irregularly irregular: no pattern, wide spread of RR intervals. For uniform r, s = (0.62 + 0.8·r²) / 0.887
        // averages 1 and is never below S_MIN. The AV node lets nothing through sooner than ~300 ms after a beat,
        // nor before the T wave is over; where that limit cuts into the spread (fast rates) the short cycles bunch
        // up against it and the rest are scaled so the average rate stays on the one asked for.
        const S_MIN = 0.62 / 0.887;
        const shortest = Math.max(Math.min(300, 0.9 * rrNominal), qt + 10, S_MIN * rrNominal);
        // The cycle after a beat depends only on when that beat fell, so re-applying the rhythm (a rate slider
        // being dragged) does not draw again and again until a short one comes up
        const gap = (after: number) => {
          const r = unit(after);
          const s = (0.62 + 0.8 * r * r) / 0.887;
          return shortest + ((rrNominal - shortest) * (s - S_MIN)) / (1 - S_MIN);
        };
        let nextV = lastV ? Math.max(start, lastV.t + gap(lastV.t), tOver) : start + 120;
        return {
          get cursor() { return nextV; },
          step() {
            pushV(beatAt(nextV, lastQRS));
            nextV += gap(nextV);
          },
        };
      }

      case 'flutter': {
        const fPeriod = 200; // 300/min
        // 2:1 to 4:1 at the rates the slider offers; a drug that blocks the AV node (adenosine) drives the
        // rate setting lower, giving the long runs of flutter waves that unmask the diagnosis
        const ratio = Math.max(2, Math.min(hr < 70 ? 10 : 4, Math.round(300 / Math.max(30, hr))));
        const fr = 250; // F-wave to QRS latency
        const origin = seg.origin;
        // Each QRS follows a flutter wave: the first one not before the ventricles are ready (one new cycle after
        // the last beat), counted from where the flutter waves began so a change of ratio keeps their rhythm
        const ready = lastV ? Math.max(start, lastV.t + ratio * fPeriod, tOver) : start + 120;
        let k = Math.max(0, Math.ceil((ready - fr - origin) / fPeriod - 1e-6));
        return {
          get cursor() { return origin + k * fPeriod + fr; },
          step() {
            const t = origin + k * fPeriod + fr;
            pushV(buildVent(t, 'conducted', profile, profile.qrs, fPeriod * ratio));
            k += ratio;
          },
        };
      }

      case 'svt': {
        let nextV = vReady;
        return {
          get cursor() { return nextV; },
          step() {
            const e = buildVent(nextV, 'svt', profile, profile.qrs, rrNominal);
            pushV(e);
            // Retrograde P buried at the end of the QRS (pseudo-r′ in V1, pseudo-S inferiorly)
            pushA({ ...buildAtrial(nextV + 42, profile, 'retrograde', false), onset: nextV });
            nextV += rrNominal;
          },
        };
      }

      case 'junctional': {
        // the retrograde P comes 70 ms ahead of the QRS: not before this rhythm starts
        let nextV = Math.max(vReady, start + 70);
        return {
          get cursor() { return nextV - 70; },
          step() {
            pushA(buildAtrial(nextV - 70, profile, 'retrograde', false));
            pushV({ ...buildVent(nextV, 'junctional', profile, profile.qrs, rrNominal), onset: nextV - 70 });
            nextV += rrNominal;
          },
        };
      }

      case 'torsades': {
        let nextV = vReady;
        const origin = seg.origin;
        const axis = norm([0.55, -0.6, 0.55]);
        return {
          get cursor() { return nextV; },
          step() {
            const el = nextV - origin;
            const angle = (2 * Math.PI * el) / 2600;
            const env = 0.35 + 0.65 * Math.abs(Math.sin((Math.PI * el) / 2600));
            const rr = rrNominal * (1 + 0.08 * (rng() - 0.5));
            pushV(buildVent(nextV, 'torsades', profile, 'torsades', rr, { amp: env, rotate: { axis, angle }, useProfileT: false }));
            nextV += rr;
          },
        };
      }

      case 'vf':
      case 'asystole':
      default: {
        let c = start;
        return { get cursor() { return c; }, step() { c = Number.POSITIVE_INFINITY; } };
      }
    }
  }

  // ─── Search helpers ──────────────────────────────────────────────────────

  /** Index of last event with e.t <= t (or -1) */
  private static lastIndex<T extends { t: number }>(arr: T[], t: number): number {
    let lo = 0;
    let hi = arr.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid].t <= t) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  }

  lastVentIndex(t: number) {
    return ECGEngine.lastIndex(this.vent, t);
  }

  lastAtrialIndex(t: number) {
    return ECGEngine.lastIndex(this.atrial, t);
  }

  // ─── Sampling ────────────────────────────────────────────────────────────

  private dipoleBuf: Vec3 = [0, 0, 0];

  /** Total cardiac dipole (mV) at time t. Returned vector is reused — copy if you need to keep it. */
  dipole(t: number): Vec3 {
    const d = this.dipoleBuf;
    d[0] = 0; d[1] = 0; d[2] = 0;

    // Atrial events (P wave + PR-segment injury)
    let i = ECGEngine.lastIndex(this.atrial, t + 5);
    for (; i >= 0; i--) {
      const a = this.atrial[i];
      const dt = t - a.t;
      if (dt > 400) break;
      for (const p of a.template.pulses) {
        const g = gauss(dt - p.t, p.w) * a.scale;
        if (g > 1e-4) { d[0] += p.v[0] * g; d[1] += p.v[1] * g; d[2] += p.v[2] * g; }
      }
      if (a.prSegment && a.prEnd) {
        const on = logistic(dt - a.template.duration * 0.55, 8) * (1 - logistic(t - a.prEnd, 6));
        d[0] += a.prSegment[0] * on; d[1] += a.prSegment[1] * on; d[2] += a.prSegment[2] * on;
      }
    }

    // Ventricular events (QRS + ST + T)
    let j = ECGEngine.lastIndex(this.vent, t + 5);
    for (; j >= 0; j--) {
      const v = this.vent[j];
      const dt = t - v.t;
      if (dt > v.qt + 260) {
        if (dt > 1400) break;
        continue;
      }
      for (const p of v.pulses) {
        const g = gauss(dt - p.t, p.w);
        if (g > 1e-4) { d[0] += p.v[0] * g; d[1] += p.v[1] * g; d[2] += p.v[2] * g; }
      }
      const tw = v.tw;
      const tg = dt < tw.tp ? gauss(dt - tw.tp, tw.rise) : gauss(dt - tw.tp, tw.fall);
      d[0] += tw.v[0] * tg; d[1] += tw.v[1] * tg; d[2] += tw.v[2] * tg;
      if (v.st) {
        const on = logistic(dt - v.qrsDur + 6, 5);
        const off = dt < tw.tp ? 1 : gauss(dt - tw.tp, tw.fall * 1.15);
        const shape = (0.75 + 0.25 * smoothstep(v.qrsDur, tw.tp, dt)) * on * off;
        d[0] += v.st[0] * shape; d[1] += v.st[1] * shape; d[2] += v.st[2] * shape;
      }
      if (v.spike) {
        const g = gauss(dt + 1.5, 1.2) * 1.4;
        d[0] += 0.4 * g; d[1] += -0.35 * g; d[2] += -0.85 * g;
      }
    }

    // Continuous rhythm signals
    const seg = this.segmentAt(t);
    const r = seg.profile.rhythm;
    if (r === 'af') {
      const s1 = 0.055 * Math.sin(2 * Math.PI * 6.3 * t / 1000 + 2.5 * noise1(t / 700)) + 0.03 * Math.sin(2 * Math.PI * 8.7 * t / 1000 + 3 * noise1(t / 500 + 17));
      const s2 = 0.04 * Math.sin(2 * Math.PI * 7.4 * t / 1000 + 2.5 * noise1(t / 650 + 41));
      const amp = 0.75 + 0.35 * noise1(t / 1300 + 5);
      d[0] += amp * (0.05 * s1 + 0.6 * s2); d[1] += amp * (-0.8 * s1 - 0.3 * s2); d[2] += amp * (-0.6 * s1 - 0.2 * s2);
    } else if (r === 'flutter') {
      const ph = (((t - seg.origin) % 200) + 200) % 200 / 200;
      const g = ph < 0.72 ? ph / 0.72 : (1 - ph) / 0.28;
      const a = 0.19 * (g - 0.45);
      d[0] += 0.1 * a; d[1] += -0.5 * a; d[2] += 0.86 * a;
    } else if (r === 'vf') {
      const el = t - seg.origin;
      const coarse = 0.35 + 0.65 * Math.exp(-el / 90000);
      const env = coarse * (0.55 + 0.45 * noise1(t / 900));
      const f1 = Math.sin(2 * Math.PI * 4.6 * t / 1000 + 4 * noise1(t / 600));
      const f2 = Math.sin(2 * Math.PI * 6.1 * t / 1000 + 4 * noise1(t / 450 + 11));
      const f3 = Math.sin(2 * Math.PI * 3.7 * t / 1000 + 3 * noise1(t / 800 + 29));
      d[0] += env * (0.45 * f1 + 0.2 * f3); d[1] += env * (0.3 * f2 - 0.15 * f1); d[2] += env * (-0.4 * f2 + 0.35 * f3);
    }
    return d;
  }

  /** Voltage in mV for a lead at time t (includes realistic baseline wander and noise) */
  voltage(lead: AnyLead, t: number): number {
    const v = dot(this.dipole(t), this.leads[lead]);
    return v + this.artifact(lead, t) + (this.external ? this.external(t, lead) : 0);
  }

  /** Project a precomputed dipole */
  project(d: Vec3, lead: AnyLead, t: number): number {
    return dot(d, this.leads[lead]) + this.artifact(lead, t) + (this.external ? this.external(t, lead) : 0);
  }

  /** Extra signal on the recording (CPR compressions, non-capturing pacer spikes, shock artefact) */
  external: ((t: number, lead: AnyLead) => number) | null = null;

  /** Effective lead vectors (changed by electrode misplacement); defaults to correct placement */
  private leads: Record<AnyLead, Vec3> = LEAD_VECTORS;

  setLeadField(field: Partial<Record<AnyLead, Vec3>> | null) {
    this.leads = field ? { ...LEAD_VECTORS, ...field } : LEAD_VECTORS;
  }

  private artifact(lead: AnyLead, t: number): number {
    const k = lead.length * 13 + lead.charCodeAt(lead.length - 1);
    return 0.018 * Math.sin((2 * Math.PI * t) / 5200 + k) + 0.006 * noise1(t / 7 + k * 31);
  }

  // ─── Derived measurements ────────────────────────────────────────────────

  /** Monitor-style ventricular rate from the last few RR intervals */
  heartRate(t: number): number {
    const seg = this.segmentAt(t);
    if (seg.profile.rhythm === 'vf' || seg.profile.rhythm === 'asystole') return 0;
    const i = this.lastVentIndex(t);
    if (i < 1) return seg.hr;
    if (t - this.vent[i].t > 3500) return 0;
    let sum = 0;
    let n = 0;
    // only average beats belonging to the current rhythm segment
    for (let k = i; k > 0 && n < 4 && this.vent[k - 1].t >= seg.start; k--, n++) sum += this.vent[k].t - this.vent[k - 1].t;
    if (!n) {
      if (seg.profile.rateControl === 'ventricular') return seg.hr;
      const ratio = seg.profile.rhythm === 'wenckebach' || seg.profile.rhythm === 'mobitz2' ? 0.75 : 1;
      return Math.round(seg.hr * ratio);
    }
    return Math.round(60000 / (sum / n));
  }

  /** Atrial rate (P waves per minute) where meaningful */
  atrialRate(t: number): number | null {
    const seg = this.segmentAt(t);
    if (seg.profile.rhythm === 'flutter') return 300;
    if (seg.profile.rhythm === 'af') return null;
    const i = this.lastAtrialIndex(t);
    if (i < 2 || this.atrial[i - 2].t < seg.start) return null;
    const dt = (this.atrial[i].t - this.atrial[i - 2].t) / 2;
    return dt > 0 ? Math.round(60000 / dt) : null;
  }

  /** Fridericia-corrected QT of one beat (ms), or null where no QT can be measured (VT, torsades: no T wave apart from the QRS) */
  qtcOf(v: VentEvent): number | null {
    if (v.kind === 'vt' || v.kind === 'torsades') return null;
    // corrected with the cycle the QT belongs to, not the average of the last few beats (which swings in AF)
    return v.qt / Math.cbrt((v.qtRR ?? v.rr) / 1000);
  }

  /** Intervals of the current rhythm at the current rate, read from its latest beat */
  intervals(t: number) {
    const seg = this.segmentAt(t);
    const p = seg.profile;
    let i = this.lastVentIndex(t);
    // read the rhythm's own beats: a PVC among them has intervals of its own
    while (i > 0 && this.vent[i].kind === 'pvc') i--;
    const v = i >= 0 ? this.vent[i] : null;
    const rate = this.heartRate(t);
    const rr = rate > 0 ? 60000 / rate : 1000;
    const hasP = !['af', 'flutter', 'vf', 'asystole', 'torsades', 'svt', 'junctional', 'vt', 'chb', 'vpaced'].includes(p.rhythm);
    // VF and asystole have no beats: nothing to measure (the last beat before them is not of this rhythm)
    const noBeats = p.rhythm === 'vf' || p.rhythm === 'asystole';
    // …and VT and torsades have no T wave that can be told from the QRS: no QT to report
    const noQT = noBeats || p.rhythm === 'vt' || p.rhythm === 'torsades';
    const qt = v ? v.qt : Math.min(qtForRR(p.qtc, rr), QT_ROOM * rr);
    const qtc = v ? this.qtcOf(v) : qt / Math.cbrt(rr / 1000);
    let pr: number | null = hasP ? (p.rhythm === 'paced' ? 160 : prForRate(p.pr, seg.hr)) : null;
    if (p.rhythm === 'wenckebach') pr = null;
    return {
      pr,
      qrs: v && !noBeats ? Math.round(v.qrsDur) : null,
      qt: noQT || qtc === null ? null : Math.round(qt),
      qtc: noQT || qtc === null ? null : Math.round(qtc),
      rr: Math.round(rr),
    };
  }

  // ─── Mechanical cycle ────────────────────────────────────────────────────

  mechanics(t: number): MechanicalState {
    const seg = this.segmentAt(t);
    const rhythm = seg.profile.rhythm;
    const vi = this.lastVentIndex(t);
    const ai = this.lastAtrialIndex(t);
    const v = vi >= 0 ? this.vent[vi] : null;
    const next = vi + 1 < this.vent.length ? this.vent[vi + 1] : null;
    const prev = vi >= 1 ? this.vent[vi - 1] : null;
    const a = ai >= 0 ? this.atrial[ai] : null;

    const out: MechanicalState = {
      phase: 'diastasis',
      atrialActivation: -1,
      ventActivation: -1,
      repolarization: 0,
      atrialContraction: 0,
      ventContraction: 0,
      mitralOpen: 1,
      aorticOpen: 0,
      fibrillating: null,
      lastVent: v,
      lastAtrial: a,
      events: null,
    };

    if (rhythm === 'vf') {
      out.phase = 'fibrillation';
      out.fibrillating = 'ventricles';
      out.mitralOpen = 0.6;
      out.ventContraction = 0.05 + 0.04 * noise1(t / 60);
      return out;
    }

    // Atrial electrical + mechanical activity
    if (a) {
      const da = t - a.t;
      if (da >= 0 && da <= a.template.duration) out.atrialActivation = da / a.template.duration;
      const cStart = a.t + 70;
      const cDur = 110;
      if (t >= cStart && t <= cStart + cDur) out.atrialContraction = Math.sin((Math.PI * (t - cStart)) / cDur);
    }
    if (rhythm === 'af') {
      out.fibrillating = 'atria';
      out.atrialContraction = 0.12 + 0.08 * noise1(t / 40);
    } else if (rhythm === 'flutter') {
      const ph = (((t - seg.origin) % 200) + 200) % 200 / 200;
      out.atrialContraction = 0.25 + 0.2 * Math.sin(ph * 2 * Math.PI);
      out.atrialActivation = ph;
    }

    if (!v || rhythm === 'asystole') {
      out.phase = rhythm === 'asystole' ? 'arrest' : 'diastasis';
      out.mitralOpen = 1;
      return out;
    }

    const ev = cycleEvents(v, next);
    out.events = ev;
    const dv = t - v.t;
    if (dv <= v.qrsDur) out.ventActivation = dv / v.qrsDur;
    const tStart = v.t + v.tw.tp - 2.2 * v.tw.rise;
    const tEnd = v.t + v.tw.tp + 2.5 * v.tw.fall;
    if (t >= tStart && t <= tEnd) out.repolarization = (t - tStart) / (tEnd - tStart);

    // Ventricular contraction envelope (0 relaxed → 1 maximal squeeze at end-systole)
    const rise = smoothstep(ev.mc - 10, ev.ac - 30, t);
    const fall = 1 - smoothstep(ev.ac - 20, ev.mo + 70, t);
    const prevBeatFall = prev ? 1 - smoothstep(cycleEvents(prev, v).ac - 20, cycleEvents(prev, v).mo + 70, t) : 0;
    out.ventContraction = Math.max(rise * fall, prevBeatFall) * (0.35 + 0.65 * v.efficiency);

    // Valves
    out.aorticOpen = smoothstep(ev.ao - 5, ev.ao + 20, t) * (1 - smoothstep(ev.ac - 15, ev.ac, t));
    out.mitralOpen = t < ev.mc
      ? 1 - smoothstep(ev.mc - 20, ev.mc, t)
      : smoothstep(ev.mo, ev.mo + 30, t) * (1 - (next ? smoothstep(ev.nextMc - 20, ev.nextMc, t) : 0));

    // Electrical activity without a pulse (PEA, pulseless VT, torsades): the wave still sweeps the ventricles, but
    // they barely move, the aortic valve stays shut and there is nothing to hear
    if (seg.profile.hemo === 'no-output') {
      out.phase = 'pulseless';
      out.ventContraction *= 0.12;
      out.aorticOpen = 0;
      out.mitralOpen = 0.6;
      out.events = null;
      return out;
    }

    // Phase label (ventricular-centred)
    if (t < ev.mc) out.phase = prevPhase(t, prev, v);
    else if (t < ev.ao) out.phase = 'isovolumetric-contraction';
    else if (t < ev.ao + 0.4 * (ev.ac - ev.ao)) out.phase = 'rapid-ejection';
    else if (t < ev.ac) out.phase = 'reduced-ejection';
    else if (t < ev.mo) out.phase = 'isovolumetric-relaxation';
    else if (t < ev.mo + 140) out.phase = 'rapid-filling';
    else out.phase = 'diastasis';

    if (out.phase === 'diastasis' || out.phase === 'rapid-filling') {
      if (out.atrialContraction > 0.05 && rhythm !== 'af' && rhythm !== 'flutter') out.phase = 'atrial-systole';
    }
    return out;
  }
}

export type CyclePhase =
  | 'atrial-systole'
  | 'isovolumetric-contraction'
  | 'rapid-ejection'
  | 'reduced-ejection'
  | 'isovolumetric-relaxation'
  | 'rapid-filling'
  | 'diastasis'
  | 'fibrillation'
  | 'pulseless'
  | 'arrest';

export interface CycleEvents {
  /** QRS onset */
  qrs: number;
  /** Mitral (and tricuspid) closure — S1 */
  mc: number;
  /** Aortic (and pulmonic) valve opening */
  ao: number;
  /** Aortic closure — S2 (≈ end of T wave) */
  ac: number;
  /** Mitral opening */
  mo: number;
  /** Next beat's mitral closure (end of diastole) */
  nextMc: number;
}

export function cycleEvents(v: VentEvent, next: VentEvent | null): CycleEvents {
  const wide = v.qrsDur > 125;
  const hr = 60000 / Math.max(250, Math.min(2400, v.rr || 833));
  const mc = v.t + (wide ? 70 : 45);
  // Isovolumic contraction shortens a little with rate; prolonged with dyssynchronous (wide) activation
  const ao = mc + (wide ? 60 : Math.max(38, Math.min(55, 50 - 0.1 * (hr - 72))));
  // LV ejection time falls with heart rate (Weissler: LVET ≈ 413 − 1.7·HR ms). At rest Q–S2 ≈ QT,
  // so S2 lands near the end of the T wave; at fast rates systole shortens to preserve diastole.
  const lvet = Math.max(150, Math.min(340, 415 - 1.7 * hr));
  const ac = ao + lvet;
  const mo = ac + (v.ivrt ?? Math.max(50, Math.min(90, 80 - 0.3 * (hr - 72))));
  const nextMc = next ? next.t + (next.qrsDur > 125 ? 70 : 45) : mo + 600;
  return { qrs: v.t, mc, ao, ac, mo, nextMc };
}

function prevPhase(t: number, prev: VentEvent | null, v: VentEvent): CyclePhase {
  if (!prev) return 'diastasis';
  const ev = cycleEvents(prev, v);
  if (t < ev.ac) return 'reduced-ejection';
  if (t < ev.mo) return 'isovolumetric-relaxation';
  if (t < ev.mo + 140) return 'rapid-filling';
  return 'diastasis';
}

export interface MechanicalState {
  phase: CyclePhase;
  /** 0..1 progress of atrial depolarisation (P wave), −1 when inactive */
  atrialActivation: number;
  /** 0..1 progress of ventricular depolarisation (QRS), −1 when inactive */
  ventActivation: number;
  /** 0..1 progress through the T wave */
  repolarization: number;
  atrialContraction: number;
  ventContraction: number;
  mitralOpen: number;
  aorticOpen: number;
  fibrillating: 'atria' | 'ventricles' | null;
  lastVent: VentEvent | null;
  lastAtrial: AtrialEvent | null;
  events: CycleEvents | null;
}

export const PHASE_LABELS: Record<CyclePhase, string> = {
  'atrial-systole': 'Atrial systole (atrial kick)',
  'isovolumetric-contraction': 'Isovolumetric contraction',
  'rapid-ejection': 'Rapid ejection',
  'reduced-ejection': 'Reduced ejection',
  'isovolumetric-relaxation': 'Isovolumetric relaxation',
  'rapid-filling': 'Rapid (passive) filling',
  diastasis: 'Diastasis (slow filling)',
  fibrillation: 'Fibrillation — no effective contraction',
  pulseless: 'Electrical activity — no pulse',
  arrest: 'No electrical or mechanical activity',
};

export const PHASE_DESCRIPTIONS: Record<CyclePhase, string> = {
  'atrial-systole': 'Atria contract after the P wave, topping up ventricular filling (~20–30% of filling volume). AV valves open, semilunar valves closed.',
  'isovolumetric-contraction': 'Begins at S1 (mitral/tricuspid closure) just after the QRS. All four valves closed; pressure rises with no change in volume.',
  'rapid-ejection': 'LV pressure exceeds aortic pressure and the aortic valve opens. Most of the stroke volume is ejected. Corresponds to the ST segment.',
  'reduced-ejection': 'Ejection slows as ventricular repolarization (T wave) begins. Aortic pressure starts to fall.',
  'isovolumetric-relaxation': 'Starts at S2 (aortic/pulmonic closure, ~end of T wave). All valves closed; pressure falls with no change in volume.',
  'rapid-filling': 'Ventricular pressure drops below atrial pressure, the AV valves open and blood rushes in (an S3 here is normal in the young, pathological in HF / volume overload).',
  diastasis: 'Slow filling as atrial and ventricular pressures equalize. Shortens first when heart rate rises.',
  fibrillation: 'Disorganized electrical activity: the ventricles quiver, no stroke volume, no pulse. CPR + defibrillation.',
  pulseless: 'The ventricles are being activated but are not pumping: no stroke volume, no pulse, no heart sounds (PEA, pulseless VT, torsades). CPR, a shock if the rhythm is shockable, and the cause.',
  arrest: 'No electrical activity and no contraction. CPR, epinephrine, reversible causes.',
};
