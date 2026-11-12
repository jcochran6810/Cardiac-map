/**
 * Beat-by-beat hemodynamic model (Wiggers diagram / PV loop).
 *
 * Driven by the same ventricular/atrial events as the ECG, so:
 *  - filling (and therefore stroke volume) depends on the preceding diastolic time
 *    (Frank-Starling) → AF short-RR beats eject less (pulse deficit);
 *  - the atrial kick only contributes when atrial contraction lands in late diastole
 *    (lost in AF; mistimed in AV dissociation → cannon A waves);
 *  - valve lesions change the shape of the curves (AS gradient, MR v-wave, MS gradient…);
 *  - systole shortens with rate and early filling is fast, so moderate tachycardia preserves
 *    stroke volume while very fast rates (SVT, VT) or slow-filling lesions (MS) cut it;
 *  - a simple baroreflex adjusts arterial tone so mean pressure is defended when output changes.
 * A mechanical cycle runs from one mitral closure to the next, and every phase starts from the pressure
 * and volume the one before it ended with, so the traces have no steps — whatever the rhythm does.
 * Each profile's representative values apply at its reference rate (refHR).
 * Values are representative teaching values, not patient-specific predictions.
 */
import { ECGEngine, VentEvent, CycleEvents, cycleEvents, noise1 } from '@/lib/ecg/engine';
import { QRS_TEMPLATES, type HemoProfile } from '@/lib/ecg/profiles';

export interface HemoParams {
  label: string;
  edv: number;
  esv: number;
  sbp: number;
  dbp: number;
  lvedp: number;
  laMean: number;
  /** Peak LV–aortic systolic gradient (AS fixed, HCM dynamic) */
  gradient: number;
  gradientType: 'none' | 'fixed' | 'dynamic';
  /** Regurgitant fraction of total LV stroke volume into the LA */
  mr: number;
  /** Mean diastolic LA–LV gradient (mitral stenosis) */
  msGradient: number;
  /** LV relaxation time constant (ms): how slowly the last of the systolic pressure dies away in early diastole */
  tauRelax: number;
  /** Aortic Windkessel time constant (ms) */
  tauAorta: number;
  /** Atrial kick as a fraction of normal filling */
  kick: number;
  s3: boolean;
  s4: boolean;
  murmur: 'none' | 'as' | 'mr' | 'ms' | 'hcm';
  /** Fraction by which inspiration cuts LV filling, and so stroke volume (large in tamponade: pulsus paradoxus) */
  respVar: number;
  /** Heart rate at which the representative values above apply */
  refHR: number;
  /** External (pericardial) pressure added to LV diastolic pressure — tamponade */
  pericardial?: number;
  noOutput?: boolean;
}

const BASE: HemoParams = {
  label: 'Normal', edv: 120, esv: 50, sbp: 120, dbp: 78, lvedp: 9, laMean: 9, gradient: 0, gradientType: 'none',
  mr: 0, msGradient: 0, tauRelax: 38, tauAorta: 1900, kick: 0.2, s3: false, s4: false, murmur: 'none', respVar: 0.03, refHR: 72,
};

export const HEMO_PROFILES: Record<HemoProfile, HemoParams> = {
  normal: BASE,
  'aortic-stenosis': { ...BASE, label: 'Severe aortic stenosis', edv: 125, esv: 52, sbp: 112, dbp: 72, lvedp: 20, laMean: 16, gradient: 70, gradientType: 'fixed', tauRelax: 55, s4: true, murmur: 'as', kick: 0.3 },
  'mitral-regurgitation': { ...BASE, label: 'Chronic severe mitral regurgitation', edv: 185, esv: 72, sbp: 112, dbp: 68, lvedp: 14, laMean: 18, mr: 0.5, s3: true, murmur: 'mr', refHR: 85 },
  'mitral-stenosis': { ...BASE, label: 'Severe mitral stenosis', edv: 100, esv: 42, sbp: 104, dbp: 70, lvedp: 6, laMean: 24, msGradient: 12, murmur: 'ms', kick: 0.3, refHR: 80 },
  hfref: { ...BASE, label: 'HFrEF (LVEF ~25%)', edv: 220, esv: 165, sbp: 102, dbp: 66, lvedp: 24, laMean: 24, mr: 0.15, tauRelax: 60, s3: true, murmur: 'mr', kick: 0.15, refHR: 95 },
  hfpef: { ...BASE, label: 'HFpEF (stiff LV)', edv: 108, esv: 44, sbp: 152, dbp: 86, lvedp: 22, laMean: 20, tauRelax: 70, s4: true, kick: 0.3, refHR: 80 },
  hcm: { ...BASE, label: 'Obstructive HCM', edv: 100, esv: 28, sbp: 118, dbp: 74, lvedp: 18, laMean: 16, gradient: 55, gradientType: 'dynamic', mr: 0.08, tauRelax: 70, s4: true, murmur: 'hcm', kick: 0.3, refHR: 66 },
  // Low-output states: the stroke volumes give a cardiac index well under 2.2 L/min/m² at their usual rates
  // (shock ~28 mL × 118/min ≈ 3.3 L/min; tamponade and PE ~30 mL from a small, underfilled but vigorous LV).
  // Tamponade's values are those at end-expiration: every inspiration halves LV filling, so the systolic
  // pressure swings by well over 10 mmHg (pulsus paradoxus) and the averages are lower.
  shock: { ...BASE, label: 'Cardiogenic shock', edv: 190, esv: 162, sbp: 80, dbp: 52, lvedp: 28, laMean: 26, tauRelax: 65, s3: true, kick: 0.12, refHR: 118 },
  tamponade: { ...BASE, label: 'Cardiac tamponade', edv: 62, esv: 24, sbp: 90, dbp: 68, lvedp: 19, laMean: 19, respVar: 0.5, kick: 0.1, refHR: 118, pericardial: 16 },
  pe: { ...BASE, label: 'Acute PE with RV strain (underfilled LV)', edv: 58, esv: 26, sbp: 96, dbp: 66, lvedp: 5, laMean: 5, refHR: 114 },
  stemi: { ...BASE, label: 'Acute MI (reduced EF)', edv: 135, esv: 76, sbp: 126, dbp: 80, lvedp: 18, laMean: 16, tauRelax: 55, s4: true, kick: 0.25, refHR: 85 },
  'no-output': { ...BASE, label: 'No effective output', edv: 140, esv: 140, sbp: 20, dbp: 12, lvedp: 12, laMean: 12, noOutput: true, kick: 0 },
};

interface BeatHemo {
  ev: CycleEvents;
  params: HemoParams;
  edv: number;
  esv: number;
  sv: number;
  /** aortic pressure at aortic valve opening */
  pd: number;
  /** systolic peak */
  ps: number;
  /** end-systolic (dicrotic notch) pressure */
  pes: number;
  kick: boolean;
  /** when the atrial contraction that topped up this beat's filling began (null without an atrial kick) */
  kickAt: number | null;
  /** volume a whole atrial contraction adds to this beat's filling… */
  kickFull: number;
  /** …and what this one added: the part of it that fell between mitral opening and mitral closure */
  kickVol: number;
  /** volume taken in just before this beat when it followed too soon for the ventricle to fill */
  topUp: number;
  floor: number;
  /** effective arterial (Windkessel) time constant for this beat */
  tau: number;
  /** running (baroreflex-sensed) forward stroke volume and cycle length */
  svAvg: number;
  rrAvg: number;
  /** mean LA pressure for the filling period that ended at this beat */
  laMean: number;
  /** LV pressure at this beat's mitral closure, handed over by the cycle before it */
  lvp0: number;
  /** LA pressure handed over the same way (null for a first beat: nothing came before it) */
  lap0: number | null;
}

export interface HemoSample {
  lvp: number;
  aop: number;
  lap: number;
  lvv: number;
  phono: number;
}

export interface HemoSummary {
  sbp: number;
  dbp: number;
  map: number;
  edv: number;
  esv: number;
  sv: number;
  ef: number;
  co: number;
  lvedp: number;
  laMean: number;
  label: string;
  noOutput: boolean;
}

function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Diastolic pressure–volume relation (EDPVR) for a parameter set (+ any pericardial constraint) */
function edpvr(p: HemoParams, v: number): number {
  const ext = p.pericardial ?? 0;
  const va = p.esv - 25;
  const k = Math.log(Math.max(1.4, (p.lvedp - ext) / 2.5)) / Math.max(40, p.edv - va);
  return ext + 2.5 * Math.exp(k * (v - va));
}

/** Fraction of passive filling completed after d ms of open-mitral diastole */
function fillFraction(d: number, stenotic: boolean): number {
  if (d <= 0) return 0;
  // MS: slow, diastole-long filling across the narrowed orifice — tachycardia hurts most
  if (stenotic) return 1 - Math.exp(-d / 260);
  // Rapid early filling (~75%, τ≈70 ms) plus slow diastasis
  return 0.75 * (1 - Math.exp(-d / 70)) + 0.25 * (1 - Math.exp(-d / 500));
}

/** Height of the LA v wave above the LA baseline (giant in mitral regurgitation) */
function vWave(p: HemoParams): number {
  return 6 + p.mr * 55;
}

/**
 * Aortic pressure through ejection (s = 0..1): a fast upstroke to the peak (~30% of ejection; late in AS =
 * pulsus tardus), then a decline to the end-systolic pressure.
 */
function ejectionPressure(b: BeatHemo, s: number): number {
  const p = b.params;
  const peakAt = p.gradientType === 'fixed' ? 0.5 : 0.3;
  const up = s < peakAt ? Math.sin((Math.PI / 2) * (s / peakAt)) : 1 - (1 - (b.pes - b.pd) / Math.max(1, b.ps - b.pd)) * smooth(peakAt, 1, s);
  let aop = b.pd + (b.ps - b.pd) * up;
  // spike-and-dome: early peak, mid-systolic dip as obstruction develops
  if (p.gradientType === 'dynamic') aop -= (b.ps - b.pd) * 0.28 * Math.exp(-Math.pow((s - 0.55) / 0.16, 2));
  return aop;
}

/** LV pressure above the aortic pressure during ejection (s = 0..1): the AS or HCM gradient, a few mmHg otherwise */
function ejectionGradient(b: BeatHemo, s: number): number {
  const p = b.params;
  if (p.gradientType === 'fixed') return p.gradient * Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.05)), 1.1) * (b.sv / Math.max(1, p.edv - p.esv));
  if (p.gradientType === 'dynamic') return p.gradient * Math.pow(smooth(0.15, 0.7, s), 1.3) * (1 - smooth(0.85, 1, s));
  return 4 * Math.sin(Math.PI * s) - 2 * smooth(0.7, 1, s);
}

/** The dicrotic notch and the small rebound after it, dt ms after aortic closure (starts from 0: no step at closure) */
function dicrotic(dt: number): number {
  return -5 * Math.exp(-Math.pow((dt - 12) / 10, 2)) * (1 - Math.exp(-dt / 4)) + 2.5 * Math.exp(-Math.pow((dt - 45) / 22, 2));
}

/**
 * No ventricular beat for this long is a standstill, not a slow rhythm: the monitor's heart rate reads 0 after
 * the same wait.
 */
const STANDSTILL_MS = 3500;

/** …or, in a rhythm slower than that, more than twice its own cycle: longer than this after beat b, no beat is coming */
function pauseLimit(b: BeatHemo): number {
  return Math.max(STANDSTILL_MS, 2.2 * b.rrAvg);
}

/** Arrested heart: what the ventricle fills to and the pressures settle at once nothing is pumped */
const ARREST = { settle: 300, aorta: 1900, aop: 10, lap: 8 };

/** Fraction of its volume an atrial contraction that began at c0 has delivered by time t (it lasts ~110 ms) */
function atrialEmptying(c0: number, t: number): number {
  return smooth(c0, c0 + 110, t);
}

/** Open-mitral diastolic time for a narrow-QRS beat at a given steady heart rate (matches cycleEvents) */
function nominalDiastole(hr: number, stenotic: boolean): number {
  const rr = 60000 / hr;
  const ivct = Math.max(38, Math.min(55, 50 - 0.1 * (hr - 72)));
  const lvet = Math.max(150, Math.min(340, 415 - 1.7 * hr));
  const ivrt = stenotic ? 65 : Math.max(50, Math.min(90, 80 - 0.3 * (hr - 72)));
  return Math.max(20, rr - ivct - lvet - ivrt);
}

export class HemoModel {
  private cache = new WeakMap<VentEvent, BeatHemo>();
  /** Patient's underlying heart (e.g. reduced EF) overriding the rhythm profile's default; never overrides no-output rhythms */
  private override: HemoProfile | null = null;
  constructor(private engine: ECGEngine) {}

  setOverride(h: HemoProfile | null) {
    if (h === this.override) return;
    this.override = h;
    this.cache = new WeakMap();
  }

  get baseline(): HemoProfile | null {
    return this.override;
  }

  private paramsAt(t: number): HemoParams {
    const base = HEMO_PROFILES[this.engine.segmentAt(t).profile.hemo] ?? BASE;
    if (base.noOutput || !this.override) return base;
    return HEMO_PROFILES[this.override] ?? base;
  }

  private beat(i: number): BeatHemo | null {
    const vent = this.engine.vent;
    if (i < 0 || i >= vent.length) return null;
    const hit = this.cache.get(vent[i]);
    if (hit) return hit;
    // Walk back to the nearest cached beat (bounded), then compute forward
    let start = i;
    while (start > 0 && i - start < 24 && !this.cache.get(vent[start - 1])) start--;
    let prev: BeatHemo | null = start > 0 ? this.cache.get(vent[start - 1]) ?? null : null;
    for (let k = start; k <= i; k++) {
      const b = this.computeBeat(k, prev);
      this.cache.set(vent[k], b);
      prev = b;
    }
    return prev;
  }

  private computeBeat(i: number, prev: BeatHemo | null): BeatHemo {
    const vent = this.engine.vent;
    const v = vent[i];
    const next = i + 1 < vent.length ? vent[i + 1] : null;
    const ev = cycleEvents(v, next);
    // A next beat whose mitral closure comes before this ejection is due to end cuts it short there
    if (next && ev.ac > ev.nextMc) ev.ac = ev.nextMc;
    const seg = this.engine.segmentAt(v.t);
    const p = this.paramsAt(v.t);
    const stenotic = p.msGradient > 0;
    const sv0 = p.edv - p.esv;
    const kickVol = p.kick * sv0;
    const prevEsv = prev && prev.params === p ? prev.esv : p.esv;
    const refDiastole = nominalDiastole(p.refHR, stenotic);
    const prevMo = prev ? prev.ev.mo : ev.mc - refDiastole;
    const diast = Math.max(0, ev.mc - prevMo);
    // Breathing: inspiration fills the right heart at the expense of the left. Normally that is hardly noticeable;
    // in tamponade the two ventricles share a fixed space, so LV filling — and with it the stroke volume and the
    // systolic pressure — falls markedly with every inspiration (pulsus paradoxus).
    const resp = 1 - p.respVar * (0.5 + 0.5 * Math.sin((2 * Math.PI * v.t) / 5000));
    // Frank–Starling: passive filling scaled so the reference rate reproduces the profile's EDV
    const fill = resp * (sv0 - kickVol) * fillFraction(diast, stenotic) / fillFraction(refDiastole, stenotic);
    // Atrial kick only if an organised atrial contraction falls in diastole (it may fuse with early
    // filling at fast rates); lost in AF/flutter and with retrograde or dissociated P waves
    let kickAt: number | null = null;
    if (seg.profile.rhythm !== 'af' && seg.profile.rhythm !== 'flutter') {
      const ai = this.engine.lastAtrialIndex(ev.mc - 20);
      for (let k = ai; k >= 0 && k > ai - 3; k--) {
        const a = this.engine.atrial[k];
        const c0 = a.t + 70;
        if (c0 > prevMo - 20 && c0 < ev.mc - 25 && a.kind === 'sinus') { kickAt = c0; break; }
        if (c0 < prevMo) break;
      }
    }
    const kick = kickAt !== null;
    // …and it adds only what it pushes through an open mitral valve: a contraction cut off by mitral closure
    // (a P wave just before the QRS) or begun before the valve opens gives part of its volume
    const kickFull = resp * kickVol;
    const kicked = kickAt === null ? 0 : kickFull * (atrialEmptying(kickAt, ev.mc) - atrialEmptying(kickAt, Math.max(kickAt, prevMo)));
    const filled = prevEsv + fill + kicked;
    // Preload reserve is limited: the ventricle can only dilate a little beyond its usual EDV. A beat that
    // follows too soon to fill still takes in a few mL.
    let edv = Math.max(prevEsv + 5, Math.min(p.edv + 0.15 * sv0, filled));
    if (p.noOutput) edv = p.edv;
    const topUp = p.noOutput ? 0 : Math.max(0, edv - filled);
    // Disease profiles already include their usual conduction (e.g. LBBB in HFrEF), so only beats
    // that differ from it (ectopic, VT) are penalised; in a normal heart LBBB/pacing costs a little.
    const usualLbbb = p !== BASE && QRS_TEMPLATES[seg.profile.qrs]?.conduction === 'lbbb';
    const contractile = p.noOutput ? 0.05 : Math.min(1, v.efficiency / (usualLbbb ? 0.85 : 1));
    const sv = Math.max(0, (edv - p.esv) * contractile);
    const esv = edv - sv;
    const forwardSv = sv * (1 - p.mr);
    const fwd0 = Math.max(1, sv0 * (1 - p.mr));
    const ppBase = p.sbp - p.dbp;
    const pp = ppBase * Math.min(1.8, forwardSv / fwd0);

    // Baroreflex: arterial tone adapts (over several beats) so mean pressure is largely defended
    // when output changes; beat-to-beat variation (AF, PVCs, dropped beats) still shows through.
    const nominal = 60000 / Math.max(30, seg.hr || p.refHR);
    const cycle = prev ? Math.max(150, v.t - this.engine.vent[i - 1].t) : nominal;
    const same = !!prev && prev.params === p && prev.ev.qrs >= seg.start;
    const svAvg = same ? prev!.svAvg + (forwardSv - prev!.svAvg) * 0.45 : forwardSv;
    const rrAvg = same ? prev!.rrAvg + (cycle - prev!.rrAvg) * 0.45 : nominal;
    const coRatio = Math.max(0.05, (svAvg * 60000 / rrAvg) / (fwd0 * p.refHR));
    const map0 = p.dbp + ppBase / 3;
    const mapTarget = map0 * Math.pow(coRatio, coRatio < 1 ? 0.3 : 0.12);
    const ppAvg = ppBase * Math.min(1.8, svAvg / fwd0);
    const floor = p.noOutput ? 10 : 6;
    const pdTarget = Math.max(floor + 4, mapTarget - ppAvg / 3);
    // The arterial time constant is the one that brings the pressure down to that diastolic target in the time
    // the aorta really has to run off between two ejections. At very fast rates that is under 100 ms: assuming
    // more would leave the diastolic (and so the mean) pressure too high just as the output collapses.
    const runoff = Math.max(40, rrAvg - (ev.ac - ev.ao));
    const x = Math.max(0.05, Math.min(0.97, (pdTarget - floor) / (pdTarget + 0.62 * ppAvg - floor)));
    const tau = p.noOutput ? p.tauAorta : Math.max(300, Math.min(6000, -runoff / Math.log(x)));
    // This beat ejects into whatever the run-off after the last one has left
    const pd = prev ? this.runoff(prev, this.arrestFrom(prev, v.t), ev.ao) : p.noOutput ? Math.max(ARREST.aop, pdTarget) : pdTarget;
    const ps = pd + pp;
    const pes = pd + 0.62 * pp;
    // MS: the transmitral gradient climbs as diastole shortens (flow must cross in less time)
    const laMean = stenotic
      ? p.laMean + p.msGradient * (Math.min(2.5, Math.max(0.6, refDiastole / Math.max(60, diast))) - 1)
      : Math.max(p.laMean, edpvr(p, edv) - 3);
    const b: BeatHemo = { ev, params: p, edv, esv, sv, pd, ps, pes, kick, kickAt, kickFull, kickVol: kicked, topUp, floor, tau, svAvg, rrAvg, laMean, lvp0: edpvr(p, edv), lap0: null };
    if (prev) {
      // The cycle before this one runs on until this beat's mitral closure: take the pressures over from it
      const end = this.chambers(prev, b, ev.mc, this.arrestFrom(prev, v.t));
      b.lvp0 = end.lvp;
      b.lap0 = end.lap;
    }
    return b;
  }

  sample(t: number): HemoSample {
    const engine = this.engine;
    const i = engine.lastVentIndex(t);
    if (i < 0) {
      const pNow = this.paramsAt(t);
      return { lvp: edpvr(pNow, pNow.edv), aop: pNow.dbp, lap: pNow.laMean, lvv: pNow.edv, phono: 0 };
    }
    const bi = this.beat(i)!;
    // The very first beat has no cycle before it: the ventricle waits, filled, for its first contraction
    if (i === 0 && t < bi.ev.mc) {
      const nb = this.beat(1);
      return { lvp: bi.lvp0, aop: this.paramsAt(t).dbp, lap: this.la(bi, nb, t, bi.lvp0), lvv: bi.edv, phono: this.phono(t, bi, nb) };
    }
    // A mechanical cycle runs from one mitral closure (S1) to the next: in the few ms between a QRS and its S1
    // the heart is still in the cycle of the beat before (filling — or, when beats come very early, still
    // relaxing or even ejecting)
    const j = t < bi.ev.mc ? i - 1 : i;
    const b = j === i ? bi : this.beat(j)!;
    const nb = j === i ? this.beat(i + 1) : bi;
    const stop = this.arrestFrom(b, nb ? nb.ev.qrs : Infinity);
    const c = this.chambers(b, nb, t, stop);
    let aop: number;
    if (t >= b.ev.ac) aop = this.runoff(b, stop, t);
    else if (t >= b.ev.ao) aop = ejectionPressure(b, (t - b.ev.ao) / (b.ev.ac - b.ev.ao));
    else {
      // until this beat's aortic valve opens the aorta is still running off after the beat before
      const pb = this.beat(j - 1);
      aop = pb ? this.runoff(pb, this.arrestFrom(pb, b.ev.qrs), t) : this.paramsAt(t).dbp;
    }
    return { lvp: c.lvp, aop, lap: c.lap, lvv: c.lvv, phono: t > stop ? 0 : this.phono(t, bi, this.beat(i + 1)) };
  }

  /**
   * When the heart stops pumping in the cycle that follows beat b (`until` = the next beat's QRS, if there is
   * one): 200 ms after its mitral valve opens when the beat itself gave no output (PEA, pulseless VT), otherwise
   * when a rhythm without output (VF, asystole…) begins before the next beat. Infinity while it goes on beating.
   */
  private arrestFrom(b: BeatHemo, until: number): number {
    const settled = b.ev.mo + 200;
    if (b.params.noOutput) return settled;
    const segs = this.engine.segments;
    // first rhythm segment that starts after this beat (segments are in time order)
    let lo = 0;
    let hi = segs.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (segs[mid].start > b.ev.qrs) hi = mid;
      else lo = mid + 1;
    }
    for (let k = lo; k < segs.length && segs[k].start < until; k++) {
      if ((HEMO_PROFILES[segs[k].profile.hemo] ?? BASE).noOutput) return Math.max(settled, segs[k].start);
    }
    return Infinity;
  }

  /**
   * LV pressure and volume and LA pressure at t, anywhere in the cycle from beat b's mitral closure to the next
   * beat's. `stop` is when the heart stops pumping in this cycle (see arrestFrom).
   */
  private chambers(b: BeatHemo, nb: BeatHemo | null, t: number, stop: number): { lvp: number; lvv: number; lap: number } {
    // (a next beat that comes before the output has stopped: an ordinary cycle)
    if (stop === Infinity || (nb && nb.ev.mc <= stop)) {
      const lv = this.lv(b, nb, t);
      return { lvp: lv.lvp, lvv: lv.lvv, lap: this.la(b, nb, t, lv.lvp) };
    }
    // The beat before an arrest is drawn without looking ahead to the beat that ends it (which may be minutes
    // away and appears only once the rhythm is restored): what is already on the screen never changes afterwards
    const lv = this.lv(b, null, Math.min(t, stop));
    let { lvp, lvv } = lv;
    let lap = this.la(b, null, Math.min(t, stop), lvp);
    const still = HEMO_PROFILES['no-output'];
    const settle = (from: number, to: number, ms: number) => to + (from - to) * Math.exp(-ms / ARREST.settle);
    if (t > stop) {
      // Nothing is pumped any more: the ventricle fills to the arrested heart's volume and the pressures settle
      // at its resting values, starting from where they were when the output stopped
      const rest = edpvr(still, still.edv);
      lvp = settle(lvp, rest, t - stop);
      lap = settle(lap, Math.max(rest, ARREST.lap), t - stop);
      lvv = settle(lvv, still.edv, t - stop);
    }
    // The first beat after the arrest sets off from its own end-diastolic volume: the difference is taken up
    // in the moments before it
    if (nb && t > nb.ev.qrs - 300) {
      const stopped = t > stop ? lv.lvv : this.lv(b, null, stop).lvv;
      lvv += (nb.edv - settle(stopped, still.edv, nb.ev.mc - stop)) * smooth(nb.ev.qrs - 300, nb.ev.mc, t);
    }
    return { lvp, lvv, lap };
  }

  /**
   * LV pressure and volume from beat b's mitral closure until the next beat's (nb, if it is known yet).
   * Each phase starts from the pressure and volume the phase before it ended with.
   */
  private lv(b: BeatHemo, nb: BeatHemo | null, t: number): { lvp: number; lvv: number } {
    const p = b.params;
    const ev = b.ev;
    if (t < ev.ao) {
      // isovolumic contraction: from the pressure the last cycle left behind up to the aortic pressure
      const s = Math.max(0, (t - ev.mc) / (ev.ao - ev.mc));
      return {
        lvp: b.lvp0 + (b.pd - b.lvp0) * (0.5 - 0.5 * Math.cos(Math.PI * s)),
        lvv: b.edv - (p.mr > 0 ? b.sv * p.mr * 0.25 * s : 0),
      };
    }
    // The same heart goes on beating — unless a new rhythm brings another one with it (VT in a failing ventricle
    // after sinus rhythm in a normal one): then this cycle is drawn for the heart it belongs to, and the next
    // beat's volume is taken over just before that beat
    const same = !!nb && nb.params === p;
    const filling = !nb || ev.mo < nb.ev.mc;
    // A next beat that begins before the ventricle has had time to fill (even before this beat's mitral valve
    // has opened) takes in the few mL it ejects just before its own mitral closure
    const owed = !nb ? 0 : same ? (filling ? nb.topUp : nb.edv - b.esv) : nb.edv - (filling ? b.edv : b.esv);
    const unfilled = nb ? owed * smooth(nb.ev.qrs, nb.ev.mc, t) : 0;
    if (t < ev.ac) {
      const s = (t - ev.ao) / (ev.ac - ev.ao);
      const mrPre = p.mr > 0 ? b.sv * p.mr * 0.25 : 0;
      return {
        lvp: ejectionPressure(b, s) + ejectionGradient(b, s),
        lvv: b.edv - mrPre - (b.sv - mrPre) * (1 - Math.pow(1 - s, 2.2)) + unfilled,
      };
    }
    // Isovolumic relaxation. The mitral valve opens when the LV pressure has fallen to the LA pressure (the top
    // of the v wave), so the pressure falls from its end-systolic value to exactly that level by mitral opening.
    const start = b.pes + ejectionGradient(b, 1);
    const rest = edpvr(p, b.esv);
    const cross = Math.max(rest + 1, (nb ? nb.laMean : b.laMean) - 2 + vWave(p));
    const ivrt = Math.max(1, ev.mo - ev.ac);
    // (a beat with next to no output never gets above the LA pressure: it just relaxes at its own rate)
    const tau = start > cross + 0.5 ? ivrt / Math.log((start - rest) / (cross - rest)) : p.tauRelax;
    if (t < ev.mo) return { lvp: rest + (start - rest) * Math.exp(-(t - ev.ac) / tau), lvv: b.esv + unfilled };

    // Filling toward the next beat's EDV
    const s = t - ev.mo;
    const stenotic = p.msGradient > 0;
    const span = Math.max(1, (nb ? nb.ev.mc : ev.mo + 4000) - ev.mo);
    const passive = Math.min(1, fillFraction(s, stenotic) / Math.max(1e-3, fillFraction(span, stenotic)));
    // the atrial kick arrives while the atria contract (after the P wave), through the open mitral valve
    let kicked = 0;
    if (same && nb.kickAt !== null) {
      kicked = nb.kickFull * Math.max(0, atrialEmptying(nb.kickAt, t) - atrialEmptying(nb.kickAt, Math.max(nb.kickAt, ev.mo)));
    }
    const passiveTarget = same ? nb.edv - nb.kickVol - nb.topUp : b.edv;
    // (the pressure goes with the volume this heart holds itself, not with one taken over for another heart)
    const own = b.esv + (passiveTarget - b.esv) * passive + kicked + (same ? unfilled : 0);
    // The ventricle is still relaxing as it starts to fill: what is left of its systolic pressure at mitral
    // opening dies away at the heart's own relaxation rate (slowly in a stiff or ischaemic ventricle, which keeps
    // the early diastolic pressure up), on top of the passive pressure for the volume and a little early suction
    const left = (start - rest) * Math.exp(-ivrt / tau);
    const lvp = edpvr(p, own) + left * Math.exp(-s / p.tauRelax) - 2.5 * Math.exp(-s / 50) * (1 - Math.exp(-s / 15));
    return { lvp, lvv: same ? own : own + unfilled };
  }

  /** Aortic pressure running off after beat b's aortic closure (`stop`: when the heart stops pumping, see arrestFrom) */
  private runoff(b: BeatHemo, stop: number, t: number): number {
    const decay = (dt: number) => b.floor + (b.pes - b.floor) * Math.exp(-dt / b.tau) + dicrotic(dt);
    if (t <= stop) return decay(t - b.ev.ac);
    // no more beats: from where it was, the pressure drains away toward the arrested circulation's
    return ARREST.aop + (decay(stop - b.ev.ac) - ARREST.aop) * Math.exp(-(t - stop) / ARREST.aorta);
  }

  /** LA pressure in the cycle from beat b's mitral closure to the next beat's; lvp is the LV pressure at t */
  private la(b: BeatHemo, nb: BeatHemo | null, t: number, lvp: number): number {
    const lap = this.laWaves(b, nb, t, lvp);
    if (b.lap0 === null) return lap;
    // start from the pressure the last cycle ended with; the difference fades in early systole
    return lap + (b.lap0 - this.laWaves(b, nb, b.ev.mc, b.lvp0)) * Math.exp(-(t - b.ev.mc) / 60);
  }

  private laWaves(b: BeatHemo, nb: BeatHemo | null, t: number, lvp: number): number {
    const p = b.params;
    const ev = b.ev;
    const laMean = nb ? nb.laMean : b.laMean;
    let lap = laMean - 2;
    // a wave (or cannon a wave if the atrium contracts against a closed mitral valve). Every atrial contraction
    // runs its course: the last two are looked at, in case a new P wave begins before the wave before it is over.
    // (AF and flutter have no P waves, so no a waves.)
    const ai = this.engine.lastAtrialIndex(t);
    for (let k = ai; k >= 0 && k > ai - 2; k--) {
      const c0 = this.engine.atrial[k].t + 70;
      if (t >= c0 && t <= c0 + 160) {
        const closed = (c0 >= ev.mc && c0 <= ev.mo);
        const amp = (closed ? 14 : 5) * (p.s4 ? 1.6 : 1);
        lap += amp * Math.sin((Math.PI * (t - c0)) / 160);
      }
    }
    // c wave at mitral closure (and the first of the next one), x descent through ejection
    lap += 2 * Math.exp(-Math.pow((t - ev.mc - 25) / 18, 2));
    if (nb) lap += 2 * Math.exp(-Math.pow((t - nb.ev.mc - 25) / 18, 2));
    if (t > ev.ao && t < ev.ac) lap -= 3 * Math.sin((Math.PI * (t - ev.ao)) / (ev.ac - ev.ao));
    // v wave builds during ventricular systole, peaks at mitral opening; giant v in MR
    const vAmp = vWave(p);
    if (t >= ev.ao && t < ev.mo) lap += vAmp * smooth(ev.ao, ev.mo, t);
    else if (t >= ev.mo) {
      const s = t - ev.mo;
      // y descent as the atrium empties
      lap += vAmp * Math.exp(-s / (p.msGradient > 0 ? 260 : 70)) - 2 * Math.exp(-Math.pow((s - 90) / 60, 2)) * smooth(0, 60, s);
      // With the mitral valve open the LA stays above the LV: just above it normally, by the stenotic gradient
      // in MS (which builds up as flow across the valve starts)
      const msGrad = p.msGradient + (laMean - p.laMean);
      const short = lvp + (1 + msGrad) * smooth(0, 40, s) - lap;
      // (eased in over the first ms: the two pressures normally meet at mitral opening, and where they do not —
      // the heart changed under a new rhythm — the LA pressure must not jump)
      if (short > 0) lap += short * smooth(0, 15, s);
    }
    return lap;
  }

  private phono(t: number, b: BeatHemo, nb: BeatHemo | null): number {
    const p = b.params;
    const ev = b.ev;
    if (p.noOutput) return 0;
    let s = 0;
    const burst = (center: number, width: number, freq: number, amp: number) => {
      const d = t - center;
      if (Math.abs(d) > width * 2.5) return 0;
      return amp * Math.exp(-Math.pow(d / width, 2)) * Math.sin(2 * Math.PI * freq * d / 1000);
    };
    const nz = (t2: number) => noise1(t2 / 2.2) * 0.7 + noise1(t2 / 1.1 + 50) * 0.3;
    s += burst(ev.mc + 12, 14, 55, 1.0); // S1
    s += burst(ev.ac + 6, 11, 75, 0.9); // S2
    if (p.s3) s += burst(ev.mo + 80, 22, 30, 0.55); // end of rapid filling, ~150 ms after A2
    if (p.s4 && nb && nb.kick) s += burst(nb.ev.mc - 75, 20, 28, 0.5);
    if (p.murmur === 'as' && t > ev.ao && t < ev.ac) {
      const x = (t - ev.ao) / (ev.ac - ev.ao);
      s += 0.55 * Math.pow(Math.sin(Math.PI * Math.min(1, x * 1.1)), 1.4) * nz(t);
    } else if (p.murmur === 'hcm' && t > ev.ao && t < ev.ac) {
      const x = (t - ev.ao) / (ev.ac - ev.ao);
      s += 0.5 * smooth(0.1, 0.65, x) * (1 - smooth(0.85, 1, x)) * nz(t);
    } else if (p.murmur === 'mr' && t > ev.mc + 20 && t < ev.ac + 10) {
      s += 0.38 * nz(t);
    } else if (p.murmur === 'ms' && t > ev.mo + 40) {
      const end = nb ? nb.ev.mc : ev.mo + 600;
      if (t < end) {
        const x = (t - ev.mo) / Math.max(1, end - ev.mo);
        const presystolic = nb && nb.kick ? smooth(0.7, 0.98, x) * 0.5 : 0;
        s += (0.28 * (1 - x * 0.6) + presystolic) * (noise1(t / 4.5) * 0.8);
      }
      s += burst(ev.mo + 4, 7, 90, 0.6); // opening snap at mitral opening (short A2–OS = severe MS)
    }
    return s;
  }

  summary(t: number): HemoSummary {
    const p = this.paramsAt(t);
    const i = this.engine.lastVentIndex(t);
    const hr = this.engine.heartRate(t);
    const last = i >= 0 ? this.beat(i)! : null;
    // No beats, a rhythm without output, or the ventricles standing still in a rhythm that normally perfuses
    // (a long pause, every P wave blocked): report the pressures as they are now — the arterial pressure
    // running off — not the reading of beats that are no longer coming.
    if (!last || p.noOutput || t - last.ev.qrs > pauseLimit(last)) {
      const s = this.sample(t);
      return { sbp: Math.round(s.aop), dbp: Math.round(s.aop), map: Math.round(s.aop), edv: Math.round(s.lvv), esv: Math.round(s.lvv), sv: 0, ef: 0, co: 0, lvedp: Math.round(s.lvp), laMean: Math.round(s.lap), label: p.label, noOutput: true };
    }
    // Average the last few beats of this run: not across a standstill or an arrest (the first beats after one
    // build the pressure up again), nor across a change of heart
    let n = 0, sbp = 0, dbp = 0, edv = 0, esv = 0, sv = 0, la = 0;
    for (let k = i; k >= 0 && n < 4; k--, n++) {
      const b = this.beat(k)!;
      if (n > 0 && (b.params !== last.params || this.engine.vent[k + 1].t - b.ev.qrs > pauseLimit(b))) break;
      sbp += b.ps; dbp += b.pd; edv += b.edv; esv += b.esv; sv += b.sv * (1 - b.params.mr); la += b.laMean;
    }
    sbp /= n; dbp /= n; edv /= n; esv /= n; sv /= n; la /= n;
    const totalSv = edv - esv;
    return {
      sbp: Math.round(sbp), dbp: Math.round(dbp), map: Math.round(dbp + (sbp - dbp) / 3),
      edv: Math.round(edv), esv: Math.round(esv), sv: Math.round(sv),
      ef: Math.round((totalSv / Math.max(1, edv)) * 100),
      co: Math.round(((sv * hr) / 1000) * 10) / 10,
      lvedp: Math.round(edpvr(last.params, edv)), laMean: Math.round(la), label: p.label, noOutput: false,
    };
  }

  /**
   * Finger plethysmogram (the pulse-oximeter waveform), 0 at the baseline and ~1 at the peak of a normal pulse.
   * Each ejection reaches the fingertip `delay` ms later as a volume pulse: a quick upstroke, a rounded peak, the
   * dicrotic notch as the aortic valve closes, a small dicrotic wave and a slow run-off. A pulse is as big as its
   * beat's pulse pressure, so weak beats (PVCs, short cycles in AF, pulsus alternans) show as small pulses or none.
   */
  pleth(t: number, delay = 200): number {
    const i = this.engine.lastVentIndex(t - delay);
    if (i < 0) return 0;
    let y = 0;
    for (let k = i; k >= 0 && k > i - 4; k--) {
      const b = this.beat(k)!;
      const x = t - (b.ev.ao + delay);
      if (x > 2600) break;
      if (x <= 0 || b.params.noOutput) continue;
      const pp = b.ps - b.pd;
      if (pp < 3) continue;
      const amp = Math.min(1.3, Math.pow(pp / 40, 0.6));
      const ej = Math.max(120, b.ev.ac - b.ev.ao);
      const rise = Math.min(150, 0.45 * ej);
      // run-off time constant chosen so the pulse has fallen to ~45% when the aortic valve closes (the notch)
      const tau = (ej - rise) / 0.8;
      const main = x < rise ? smooth(0, rise, x) : Math.exp(-(x - rise) / tau);
      const dicrotic = 0.13 * Math.exp(-Math.pow((x - ej - 75) / 55, 2)) - 0.05 * Math.exp(-Math.pow((x - ej - 5) / 22, 2));
      y += amp * (main + dicrotic);
    }
    return Math.max(0, y);
  }

  /** Events of the beat in progress at t (for labelling the Wiggers diagram) */
  eventsAt(t: number): CycleEvents | null {
    const i = this.engine.lastVentIndex(t);
    if (i < 0) return null;
    return this.beat(i)?.ev ?? null;
  }
}
