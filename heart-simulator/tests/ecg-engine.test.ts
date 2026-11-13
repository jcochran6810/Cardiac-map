import { describe, expect, it } from 'vitest';
import { ECGEngine, cycleEvents, noise1 } from '@/lib/ecg/engine';
import type { RhythmMods } from '@/lib/ecg/mods';
import { ECG_PROFILES } from '@/lib/ecg/profiles';
import { LEAD_VECTORS, dot, type StandardLead } from '@/lib/ecg/vector';

const T = 30_000; // 30 s of simulated rhythm

function engine(profile: string, hr: number) {
  const e = new ECGEngine(profile, hr);
  e.ensure(T);
  return e;
}

describe('beat scheduling', () => {
  it.each(['normal-sinus', 'atrial-fibrillation', 'mobitz-i', 'third-degree-avb', 'vt', 'paced'])('%s: atrial and ventricular events are strictly increasing', (id) => {
    const e = engine(id, 0);
    for (const list of [e.vent, e.atrial]) {
      for (let i = 1; i < list.length; i++) expect(list[i].t).toBeGreaterThan(list[i - 1].t);
    }
    expect(e.vent.length).toBeGreaterThan(0);
  });

  it('is deterministic: the same rhythm produces the same beats', () => {
    const a = engine('atrial-fibrillation', 110);
    const b = engine('atrial-fibrillation', 110);
    expect(a.vent.map((v) => v.t)).toEqual(b.vent.map((v) => v.t));
  });

  it('keeps past beats and drops scheduled future beats when the rhythm changes', () => {
    const e = engine('normal-sinus', 72);
    const past = e.vent.filter((v) => v.t <= 10_000).map((v) => v.t);
    e.setRhythm('sinus-tachycardia', 130, 10_000);
    expect(e.vent.filter((v) => v.t <= 10_000).map((v) => v.t)).toEqual(past);
    // at most the QRS of a P wave that is already on the screen is still to come
    const pending = e.vent.filter((v) => v.t > 10_000);
    expect(pending.length).toBeLessThanOrEqual(1);
    expect(pending.every((v) => v.pTime! <= 10_000)).toBe(true);
    e.ensure(T);
    expect(e.vent.length).toBeGreaterThan(past.length + 10);
  });

  it('goes on beating however long a rhythm is left running (old beats are discarded, new ones keep coming)', () => {
    const e = new ECGEngine('avnrt', 200);
    let t = 0;
    for (; t < 40 * 60_000; t += 1000) e.ensure(t + 4000);
    expect(e.vent.length).toBeLessThan(3200);
    expect(e.heartRate(t)).toBe(200);
    expect(e.vent.at(-1)!.t).toBeGreaterThan(t);
    // the last minutes are still there to drag back through
    expect(e.keptFrom).toBeGreaterThan(0);
    expect(e.keptFrom).toBeLessThan(t - 4 * 60_000);
    expect(e.vent[0].t).toBeLessThan(e.keptFrom + 400);
    expect(e.atrial[0].t).toBeLessThan(e.keptFrom + 400);
  });

  it('finds the rhythm at any moment of a long recording without walking through every change made since', () => {
    const e = new ECGEngine('normal-sinus', 60);
    // a long session: every step of a dragged rate slider is a change of its own
    let t = 0;
    for (let k = 0; k < 3000; k++) {
      t += 40;
      e.setRhythm('normal-sinus', 60 + (k % 60), t);
    }
    expect(e.segments.length).toBeGreaterThan(2900);
    // the same answer as looking through them one by one
    for (const at of [0, 39, 40, 41, 60_000, 60_020, t - 1, t, t + 5000]) {
      const want = [...e.segments].reverse().find((s) => s.start <= at) ?? e.segments[0];
      expect(e.segmentAt(at)).toBe(want);
    }
    // dragged back to the beginning: every sample drawn asks for the rhythm at that moment
    let reads = 0;
    e.segments = new Proxy(e.segments, {
      get(list, key, self) {
        if (typeof key === 'string' && /^\d+$/.test(key)) reads++;
        return Reflect.get(list, key, self);
      },
    });
    expect(e.segmentAt(100).hr).toBe(61);
    expect(reads).toBeLessThan(40);
  });

  it('ignores a setRhythm call that changes nothing', () => {
    const e = engine('normal-sinus', 72);
    const before = e.vent.length;
    e.setRhythm('normal-sinus', 72, 5_000);
    expect(e.vent.length).toBe(before);
    expect(e.segments.length).toBe(1);
  });
});

describe('monitor readouts', () => {
  it.each([50, 72, 110, 150])('sinus rhythm at %i bpm reads back within 3 percent', (hr) => {
    const e = engine('normal-sinus', hr);
    expect(Math.abs(e.heartRate(T - 100) - hr) / hr).toBeLessThanOrEqual(0.03);
  });

  it('measures the ventricular rate rather than echoing the setting (Mobitz I drops beats)', () => {
    const e = engine('mobitz-i', 80);
    expect(e.heartRate(T - 100)).toBeLessThan(80);
  });

  it('shows a varying rate in atrial fibrillation', () => {
    const e = engine('atrial-fibrillation', 110);
    const rates = new Set([12_000, 16_000, 20_000, 24_000, 28_000].map((t) => e.heartRate(t)));
    expect(rates.size).toBeGreaterThan(1);
  });

  it.each(['vf', 'asystole'])('%s shows no heart rate and no QT', (id) => {
    const e = engine(id, 0);
    expect(e.heartRate(T - 100)).toBe(0);
    const iv = e.intervals(T - 100);
    expect(iv.qt).toBeNull();
    expect(iv.qtc).toBeNull();
  });

  it.each(['vf', 'asystole'])('%s after a beating rhythm: no QRS width is read from the last beat before it', (id) => {
    const e = engine('lbbb', 72);
    expect(e.intervals(9_900).qrs).toBeGreaterThan(120);
    e.setRhythm(id, 0, 10_000);
    e.ensure(T);
    for (const t of [10_100, 12_000, T - 100]) {
      const iv = e.intervals(t);
      expect(iv.qrs).toBeNull();
      expect(iv.pr).toBeNull();
      expect(iv.qt).toBeNull();
      expect(iv.qtc).toBeNull();
    }
    // the recording before it still reads as it was
    expect(e.intervals(9_900).qrs).toBeGreaterThan(120);
  });
});

describe('mechanical cycle timing', () => {
  it.each([60, 72, 100, 140])('at %i bpm every beat runs QRS → MC → AO → AC → MO in order', (hr) => {
    const e = engine('normal-sinus', hr);
    for (let i = 0; i < e.vent.length - 1; i++) {
      const ev = cycleEvents(e.vent[i], e.vent[i + 1]);
      expect(ev.qrs).toBeLessThan(ev.mc);
      expect(ev.mc).toBeLessThan(ev.ao);
      expect(ev.ao).toBeLessThan(ev.ac);
      expect(ev.ac).toBeLessThan(ev.mo);
      expect(ev.mo).toBeLessThan(ev.nextMc);
    }
  });

  it('assumes a 600 ms diastole after the last scheduled beat', () => {
    const e = engine('normal-sinus', 72);
    const ev = cycleEvents(e.vent[e.vent.length - 1], null);
    expect(ev.nextMc).toBe(ev.mo + 600);
  });
});

/**
 * What the simulation driver does: the selected rhythm, rate and drug effects are applied every frame
 * and beats are scheduled 4 s ahead.
 */
function play(
  e: ECGEngine, profile: string, rate: (t: number) => number, from: number, to: number,
  mods: (t: number) => RhythmMods | null = () => null,
) {
  for (let t = from; t < to; t += 16) {
    e.setRhythm(profile, rate(t), t, mods(t));
    e.ensure(t + 4000);
  }
}

/** A rate slider dragged from `a` to `b` over `ms`, starting at t0 */
const drag = (a: number, b: number, t0: number, ms: number) => (t: number) => Math.round(a + (b - a) * Math.min(1, Math.max(0, (t - t0) / ms)));

/** RR intervals of the beats that begin in a window */
function rrIn(e: ECGEngine, from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = 1; i < e.vent.length; i++) if (e.vent[i].t >= from && e.vent[i].t < to) out.push(e.vent[i].t - e.vent[i - 1].t);
  return out;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const spread = (xs: number[]) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2))) / mean(xs);

describe('a live change of rate, rhythm or drug effect', () => {
  const T0 = 20_000;

  it('dragging the sinus rate up: every P wave keeps its QRS and the beats close up without a gap', () => {
    const e = new ECGEngine('normal-sinus', 72);
    play(e, 'normal-sinus', drag(72, 100, T0, 3000), 0, T0 + 9000);
    const ps = e.atrial.filter((a) => a.t > T0 - 2000 && a.t < T0 + 8000);
    expect(ps.length).toBeGreaterThan(12);
    for (const a of ps) {
      const qrs = e.vent.find((v) => v.pTime === a.t);
      expect(qrs, `P at ${Math.round(a.t - T0)} ms`).toBeDefined();
      expect(qrs!.t - a.t).toBeGreaterThan(140);
      expect(qrs!.t - a.t).toBeLessThan(170);
    }
    // no pause and no early beat: every cycle lies between the old one (833 ms) and the new one (600 ms)
    for (const rr of rrIn(e, T0 - 1000, T0 + 8000)) {
      expect(rr).toBeGreaterThan(600 * 0.97);
      expect(rr).toBeLessThan(833 * 1.03);
    }
  });

  it('dragging the sinus rate down: the cycles lengthen, with no run of P waves', () => {
    const e = new ECGEngine('normal-sinus', 72);
    play(e, 'normal-sinus', drag(72, 50, T0, 2000), 0, T0 + 9000);
    for (const a of e.atrial.filter((x) => x.t > T0 - 2000 && x.t < T0 + 8000)) expect(e.vent.some((v) => v.pTime === a.t)).toBe(true);
    for (const rr of rrIn(e, T0 - 1000, T0 + 8000)) {
      expect(rr).toBeGreaterThan(833 * 0.97);
      expect(rr).toBeLessThan(1200 * 1.03);
    }
  });

  it.each([[72, 80], [104, 96], [60, 150], [150, 60]])('one change of rate (%i → %i) at any moment of the cycle inserts no early beat and drops none', (a, b) => {
    const [short, long] = [60000 / Math.max(a, b), 60000 / Math.min(a, b)];
    for (let k = 0; k < 120; k++) {
      const now = T0 + k * 37;
      const e = new ECGEngine('normal-sinus', a);
      e.ensure(now + 4000);
      e.setRhythm('normal-sinus', b, now);
      e.ensure(now + 6000);
      for (const p of e.atrial.filter((x) => x.t > now - 1500 && x.t < now + 4000)) expect(e.vent.some((v) => v.pTime === p.t), `switch at +${k * 37}`).toBe(true);
      for (const rr of rrIn(e, now - 1500, now + 4000)) {
        expect(rr, `switch at +${k * 37}`).toBeGreaterThan(short * 0.97);
        expect(rr, `switch at +${k * 37}`).toBeLessThan(long * 1.03);
      }
    }
  });

  it('a drug that lengthens the PR interval leaves no P wave without its QRS (first-degree AV block)', () => {
    for (let k = 0; k < 120; k++) {
      const now = T0 + k * 41;
      const e = new ECGEngine('first-degree-avb', 68);
      e.ensure(now + 4000);
      e.setRhythm('first-degree-avb', 68, now, { prAdd: 30 });
      e.ensure(now + 6000);
      for (const p of e.atrial.filter((x) => x.t > now - 1500 && x.t < now + 4000)) {
        const qrs = e.vent.find((v) => v.pTime === p.t);
        expect(qrs, `switch at +${k * 41}`).toBeDefined();
        expect([290, 320]).toContain(Math.round(qrs!.t - p.t));
      }
    }
  });

  it('atrial fibrillation stays irregular and on the new rate while its rate is dragged', () => {
    const e = new ECGEngine('atrial-fibrillation', 150);
    play(e, 'atrial-fibrillation', drag(150, 100, T0, 3000), 0, T0 + 64_000);
    const during = rrIn(e, T0, T0 + 3000);
    expect(during.length).toBeGreaterThan(4);
    expect(Math.max(...during) - Math.min(...during)).toBeGreaterThan(80);
    const after = rrIn(e, T0 + 3000, T0 + 63_000);
    expect(Math.abs(60000 / mean(after) - 100)).toBeLessThan(4);
    expect(spread(after)).toBeGreaterThan(0.15);
  });

  it('complete heart block: the escape rhythm keeps coming while its rate is dragged', () => {
    const e = new ECGEngine('third-degree-avb', 36);
    play(e, 'third-degree-avb', drag(36, 30, T0, 2000), 0, T0 + 12_000);
    for (const rr of rrIn(e, T0 - 2000, T0 + 11_000)) {
      expect(rr).toBeGreaterThan((60000 / 36) * 0.98);
      expect(rr).toBeLessThan((60000 / 30) * 1.02);
    }
    // the atria are not disturbed: P waves march through at their own rate
    const pp = e.atrial.filter((a) => a.t > T0 - 3000 && a.t < T0 + 9000).map((a) => a.t);
    for (let i = 1; i < pp.length; i++) {
      expect(pp[i] - pp[i - 1]).toBeGreaterThan(700);
      expect(pp[i] - pp[i - 1]).toBeLessThan(880);
    }
  });

  it('a beat that has begun is finished, and the new rhythm starts one of its own cycles later', () => {
    const e = new ECGEngine('normal-sinus', 72);
    e.ensure(T0 + 4000);
    const p = e.atrial.filter((a) => a.t < T0).at(-1)!;
    const now = p.t + 80; // the P wave is on the screen, its QRS is still to come
    e.setRhythm('vt', 170, now);
    e.ensure(now + 6000);
    const conducted = e.vent.find((v) => v.pTime === p.t);
    expect(conducted).toBeDefined();
    const firstVT = e.vent.find((v) => v.kind === 'vt')!;
    expect(firstVT.t - conducted!.t).toBeGreaterThanOrEqual(60000 / 170 - 2);
    expect(firstVT.t - conducted!.t).toBeGreaterThan(conducted!.qt);
    expect(firstVT.t - conducted!.t).toBeLessThan(700);
    // the sinus node carries on underneath (AV dissociation): the next P one sinus cycle after the last
    const nextP = e.atrial.find((a) => a.t > p.t)!;
    expect(nextP.t - p.t).toBeGreaterThan(650);
    expect(nextP.t - p.t).toBeLessThan(900);
  });

  it.each(['vf', 'asystole'])('%s: no QRS can follow once the ventricles have stopped beating', (id) => {
    const e = new ECGEngine('normal-sinus', 72);
    e.ensure(T0 + 4000);
    const now = e.atrial.filter((a) => a.t < T0).at(-1)!.t + 80;
    e.setRhythm(id, 0, now);
    e.ensure(now + 6000);
    expect(e.vent.filter((v) => v.t > now)).toEqual([]);
    expect(e.atrial.filter((a) => a.t > now)).toEqual([]);
  });

  it.each([['atrial-fibrillation', 140], ['avnrt', 180], ['vt', 170], ['atrial-flutter', 150], ['torsades', 230], ['junctional', 48]])(
    'after %s, a rate nudged before the first sinus beat has come does not bring that beat early',
    (from, hr) => {
      for (const off of [0, 137, 300]) {
        const now = T0 + off;
        const e = new ECGEngine(from, hr);
        e.ensure(now + 4000);
        const last = e.vent.filter((v) => v.t <= now).at(-1)!;
        e.setRhythm('normal-sinus', 70, now); // converted to sinus rhythm…
        e.ensure(now + 4000);
        e.setRhythm('normal-sinus', 72, now + 16); // …and the rate slider touched on the next frame
        e.ensure(now + 6000);
        const first = e.vent.find((v) => v.t > last.t)!;
        expect(first.kind).toBe('conducted');
        // one sinus cycle after the last beat of the rhythm before, as without the nudge
        expect(first.t - last.t, `switch at +${off}`).toBeGreaterThanOrEqual(60000 / 72 - 2);
        expect(first.t - last.t, `switch at +${off}`).toBeLessThan(2 * (60000 / 70));
        expect(e.atrial.some((a) => a.t === first.pTime)).toBe(true);
      }
    },
  );

  it('Wenckebach keeps its 4:3 groups across a change of rate (the PR never shortens without a dropped beat)', () => {
    for (let k = 0; k < 60; k++) {
      const now = T0 + k * 53;
      const e = new ECGEngine('mobitz-i', 80);
      e.ensure(now + 4000);
      e.setRhythm('mobitz-i', 84, now);
      e.ensure(now + 9000);
      const ps = e.atrial.filter((a) => a.t > now - 6000 && a.t < now + 8000);
      let run = 0;
      let lastPR = 0;
      let groups = 0;
      for (const p of ps) {
        const qrs = e.vent.find((v) => v.pTime === p.t);
        if (!qrs) {
          if (groups++ > 0) expect(run, `switch at +${k * 53}`).toBe(3);
          run = 0;
          lastPR = 0;
        } else {
          run++;
          expect(qrs.t - p.t, `switch at +${k * 53}`).toBeGreaterThan(lastPR);
          lastPR = qrs.t - p.t;
        }
      }
      expect(groups).toBeGreaterThan(2);
    }
  });

  it('atrial flutter: the flutter waves run on unbroken when the conduction ratio changes', () => {
    const e = new ECGEngine('atrial-flutter', 150);
    e.ensure(T0 + 4000);
    const first = e.vent[0].t;
    e.setRhythm('atrial-flutter', 75, T0 + 333);
    e.ensure(T0 + 12_000);
    // every QRS sits at the same point of a 200 ms flutter cycle, before and after
    for (const v of e.vent) expect((v.t - first) % 200).toBeCloseTo(0, 6);
    expect(e.dipole(T0 + 2000)[2]).toBeCloseTo(new ECGEngine('atrial-flutter', 150).dipole(T0 + 2000 - 12 * 200)[2], 1);
    for (const rr of rrIn(e, T0 + 1500, T0 + 11_000)) expect(rr).toBeCloseTo(800, 6);
  });

  // one profile of every kind of rhythm, plus plain sinus rhythm, a long PR, a wide escape and VT with a pulse — and the
  // plain atrial fibrillation and PVCs beside their pre-excited and long-QT variants
  const KINDS = Array.from(new Set([
    ...Array.from(new Map(Object.values(ECG_PROFILES).map((p) => [p.rhythm, p.id])).values()),
    'normal-sinus', 'first-degree-avb', 'third-degree-avb', 'vt', 'atrial-fibrillation', 'pvcs',
  ]));

  it.each(KINDS)('from %s to any other rhythm: the past is kept, nothing lands in it, and no QRS falls on the T wave before it', (from) => {
    for (const to of KINDS) {
      for (const now of [T0, T0 + 137, T0 + 419]) {
        const e = new ECGEngine(from, 0);
        e.ensure(now + 4000);
        const pastV = e.vent.filter((v) => v.t < now).map((v) => v.t);
        const pastA = e.atrial.filter((a) => a.t < now).map((a) => a.t);
        e.setRhythm(to, 0, now);
        e.ensure(now + 8000);
        const label = `${from} → ${to} at +${now - T0}`;
        expect(e.vent.slice(0, pastV.length).map((v) => v.t), label).toEqual(pastV);
        expect(e.atrial.filter((a) => a.t < now).map((a) => a.t), label).toEqual(pastA);
        for (const list of [e.vent, e.atrial]) {
          for (let i = 1; i < list.length; i++) expect(list[i].t > list[i - 1].t, label).toBe(true);
        }
        for (let i = Math.max(1, pastV.length - 2); i < e.vent.length; i++) {
          const gap = e.vent[i].t - e.vent[i - 1].t;
          if (gap <= e.vent[i - 1].qt) expect.fail(`${label}: QRS ${Math.round(gap)} ms after a beat with a QT of ${Math.round(e.vent[i - 1].qt)}`);
        }
      }
    }
  });
});

describe('QT interval', () => {
  const rates = (id: string) => [ECG_PROFILES[id].minHR, ECG_PROFILES[id].defaultHR, ECG_PROFILES[id].maxHR];

  it.each(Object.keys(ECG_PROFILES))('%s: every T wave is over before the next QRS, at any rate', (id) => {
    for (const hr of rates(id)) {
      const e = engine(id, hr);
      for (let i = 1; i < e.vent.length; i++) {
        expect(e.vent[i - 1].qt, `${id} at ${hr}: beat ${i}`).toBeLessThan(e.vent[i].t - e.vent[i - 1].t);
      }
    }
  });

  it.each(Object.keys(ECG_PROFILES))('%s: the QT readout is shorter than the RR interval beside it', (id) => {
    for (const hr of rates(id)) {
      const e = engine(id, hr);
      for (const t of [T - 6000, T - 4100, T - 2300, T - 100]) {
        const iv = e.intervals(t);
        if (iv.qt !== null) expect(iv.qt, `${id} at ${hr}`).toBeLessThan(iv.rr);
      }
    }
  });

  it.each(['vt', 'pvt', 'torsades'])('%s: no QT is reported (no T wave can be told from the QRS)', (id) => {
    for (const hr of rates(id)) {
      const iv = engine(id, hr).intervals(T - 100);
      expect(iv.qt).toBeNull();
      expect(iv.qtc).toBeNull();
      expect(iv.qrs).toBeGreaterThan(120);
    }
  });

  it.each([60, 112, 150, 180])('atrial fibrillation at %i/min: the QTc readout is steady from beat to beat', (hr) => {
    const e = new ECGEngine('atrial-fibrillation', hr);
    e.ensure(60_000);
    const qtc = Array.from({ length: 80 }, (_, k) => e.intervals(15_000 + k * 517).qtc!);
    expect(Math.max(...qtc) - Math.min(...qtc)).toBeLessThanOrEqual(4);
    expect(Math.abs(qtc[0] - 420)).toBeLessThanOrEqual(4);
  });

  it.each(['lbbb', 'rbbb', 'normal-sinus', 'hfref'])('%s: QTc does not drift with the heart rate', (id) => {
    const qtc = ECG_PROFILES[id].qtc;
    for (const hr of [50, 72, 100, 130, 150, 180]) {
      const iv = engine(id, hr).intervals(T - 100);
      const rr = 60000 / hr;
      expect(iv.qtc, `${id} at ${hr}`).toBeLessThanOrEqual(qtc + 6);
      expect(iv.qt, `${id} at ${hr}`).toBeLessThan(0.92 * rr);
      // only a long QT in a very short cycle reads lower: it has to end before the next beat
      if (qtc * Math.cbrt(rr / 1000) < 0.9 * rr * 0.99) expect(iv.qtc, `${id} at ${hr}`).toBeGreaterThanOrEqual(qtc - 6);
    }
  });

  it('reads the QT and QRS of the sinus beats, not of a PVC', () => {
    const e = engine('pvcs', 76);
    for (let t = 12_000; t < 24_000; t += 250) {
      const iv = e.intervals(t);
      expect(iv.qrs).toBeLessThan(120);
      expect(Math.abs(iv.qtc! - 420)).toBeLessThanOrEqual(6);
    }
  });

  it('a PVC waits for the end of the T wave before it, even at fast sinus rates', () => {
    for (const hr of [76, 110, 140, 180]) {
      const e = engine('pvcs', hr);
      const pvcs = e.vent.map((v, i) => ({ v, i })).filter(({ v, i }) => v.kind === 'pvc' && i > 0);
      expect(pvcs.length).toBeGreaterThan(3);
      for (const { v, i } of pvcs) {
        expect(v.t - e.vent[i - 1].t, `at ${hr}`).toBeGreaterThan(e.vent[i - 1].qt);
        // still early: before the next sinus beat would have come
        expect(v.t - e.vent[i - 1].t, `at ${hr}`).toBeLessThan(60000 / hr);
      }
    }
  });
});

describe('rhythm details', () => {
  /** ST level 60 ms after the QRS against the baseline just before it, in mm at 10 mm/mV, averaged over beats (washes out dissociated P waves) */
  function stMm(e: ECGEngine, lead: StandardLead): number {
    const beats = e.vent.filter((v) => v.t > 6000 && v.t < e.vent.at(-1)!.t - 3000);
    const level = (t: number) => dot(e.dipole(t), LEAD_VECTORS[lead]);
    return 10 * mean(beats.map((v) => level(v.t + v.qrsDur + 60) - level(v.t - 20)));
  }

  it('inferior STEMI with complete heart block shows the ST elevation on its escape beats', () => {
    const e = new ECGEngine('inferior-stemi-chb', 42);
    e.ensure(60_000);
    const mm = (lead: StandardLead) => stMm(e, lead);
    expect(mm('III')).toBeGreaterThanOrEqual(1);
    expect(mm('II')).toBeGreaterThanOrEqual(0.8);
    expect(mm('aVF')).toBeGreaterThanOrEqual(1);
    expect(mm('III')).toBeGreaterThan(mm('II'));
    expect(mm('aVL')).toBeLessThanOrEqual(-0.7);
    // the beats are still a dissociated, narrow escape
    expect(e.vent.every((v) => v.kind === 'escape' && v.pTime === undefined && v.qrsDur < 120)).toBe(true);
  });

  it('complete heart block without infarction has no ST shift', () => {
    const e = engine('third-degree-avb', 36);
    expect(e.vent.every((v) => v.st === undefined)).toBe(true);
    expect(Math.abs(stMm(e, 'III'))).toBeLessThan(0.5);
  });

  it('a drug effect on the ST segment and T wave reaches escape beats too (reperfusion in inferior STEMI with heart block)', () => {
    const e = new ECGEngine('inferior-stemi-chb', 42);
    e.setRhythm('inferior-stemi-chb', 42, 0, { stScale: 0.25 });
    e.ensure(T);
    const mm = stMm(e, 'III');
    expect(mm).toBeGreaterThan(0.1);
    expect(mm).toBeLessThan(0.8);
  });

  it('tamponade: the QRS height alternates from beat to beat (electrical alternans)', () => {
    const peak = (e: ECGEngine, i: number) => {
      const v = e.vent[i];
      let max = 0;
      for (let t = v.t; t < v.t + v.qrsDur; t += 1) max = Math.max(max, Math.abs(dot(e.dipole(t), LEAD_VECTORS.II)));
      return max;
    };
    const e = engine('tamponade', 118);
    const first = e.lastVentIndex(10_000);
    const heights = Array.from({ length: 12 }, (_, k) => peak(e, first + k));
    for (let k = 2; k < heights.length; k++) expect(heights[k]).toBeCloseTo(heights[k - 2], 1);
    for (let k = 1; k < heights.length; k++) {
      const ratio = Math.max(heights[k], heights[k - 1]) / Math.min(heights[k], heights[k - 1]);
      expect(ratio).toBeGreaterThan(1.3);
      expect(ratio).toBeLessThan(1.7);
    }
    // and not in a heart that is not swinging
    const n = engine('normal-sinus', 118);
    const i = n.lastVentIndex(10_000);
    expect(peak(n, i) / peak(n, i + 1)).toBeCloseTo(1, 1);
    // the voltage stays low: even the taller beats are under half the normal height, and under 10 mm peak to peak in every chest lead
    expect(Math.max(...heights)).toBeLessThan(0.5 * peak(n, i));
    for (const lead of ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'] as const) {
      for (let k = first; k < first + 2; k++) {
        const v = e.vent[k];
        const ys = Array.from({ length: Math.ceil(v.qrsDur) + 10 }, (_, ms) => dot(e.dipole(v.t - 5 + ms), LEAD_VECTORS[lead]));
        expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1);
      }
    }
  });

  it('the alternation is not reset by a change of rate', () => {
    const e = new ECGEngine('tamponade', 118);
    play(e, 'tamponade', drag(118, 126, 20_000, 1500), 0, 30_000);
    const amp = (i: number) => Math.hypot(...e.vent[i].pulses[2].v);
    for (let i = e.lastVentIndex(18_000); i < e.lastVentIndex(26_000); i++) {
      const ratio = amp(i + 1) / amp(i);
      expect(Math.abs(ratio - 1)).toBeGreaterThan(0.3);
      // small after large, large after small — never two alike in a row
      expect(ratio > 1).toBe(amp(i) < amp(i - 1));
    }
  });

  it.each([50, 80, 112, 150, 180])('atrial fibrillation set to %i/min averages that rate', (hr) => {
    const e = new ECGEngine('atrial-fibrillation', hr);
    e.ensure(600_000);
    const rr = rrIn(e, 5000, 595_000);
    expect(Math.abs(60000 / mean(rr) - hr) / hr).toBeLessThan(0.03);
    // and stays irregularly irregular (the fastest rates leave the least room for it)
    expect(spread(rr)).toBeGreaterThan(hr > 160 ? 0.07 : 0.12);
    expect(Math.min(...rr)).toBeGreaterThanOrEqual(300);
  });
});

describe('noise', () => {
  it('stays within ±1', () => {
    for (let x = -50; x < 50; x += 0.37) {
      const n = noise1(x);
      expect(n).toBeGreaterThanOrEqual(-1);
      expect(n).toBeLessThanOrEqual(1);
    }
  });
});
