import { describe, expect, it } from 'vitest';
import { ECGEngine } from '@/lib/ecg/engine';
import { ECG_PROFILES } from '@/lib/ecg/profiles';
import { HEMO_PROFILES, HemoModel } from '@/lib/physiology/hemodynamics';

const T = 20_000;

function run(profile: string, hr = 0, override?: Parameters<HemoModel['setOverride']>[0]) {
  const engine = new ECGEngine(profile, hr);
  engine.ensure(T + 2_000);
  const model = new HemoModel(engine);
  if (override !== undefined) model.setOverride(override);
  return { engine, s: model.summary(T) };
}
const summary = (...args: Parameters<typeof run>) => run(...args).s;

describe('hemodynamic summary', () => {
  it('gives a physiological picture in normal sinus rhythm', () => {
    const s = summary('normal-sinus', 72);
    expect(s.noOutput).toBe(false);
    expect(s.sbp).toBeGreaterThan(s.map);
    expect(s.map).toBeGreaterThan(s.dbp);
    expect(s.edv).toBeGreaterThan(s.esv);
    expect(s.ef).toBeGreaterThan(0);
    expect(s.ef).toBeLessThan(100);
    expect(s.co).toBeGreaterThan(0);
  });

  it('derives EF and MAP from the displayed numbers (within rounding)', () => {
    const s = summary('normal-sinus', 72);
    expect(Math.abs(s.ef - ((s.edv - s.esv) / s.edv) * 100)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(s.map - (s.dbp + (s.sbp - s.dbp) / 3))).toBeLessThanOrEqual(1);
  });

  it.each(['vf', 'asystole'])('%s produces no output', (id) => {
    const s = summary(id);
    expect(s.noOutput).toBe(true);
    expect(s.sv).toBe(0);
    expect(s.ef).toBe(0);
    expect(s.co).toBe(0);
  });

  it.each([60, 100])('computes cardiac output from stroke volume × measured rate at %i bpm', (hr) => {
    const { engine, s } = run('normal-sinus', hr);
    // from the displayed numbers, within their rounding (stroke volume to 1 mL, output to 0.1 L/min)
    const rate = engine.heartRate(T);
    expect(Math.abs(s.co - (s.sv * rate) / 1000)).toBeLessThanOrEqual(0.05 + (0.5 * rate) / 1000 + 1e-9);
  });

  it('never gives a pulseless rhythm output, even with a heart-failure override', () => {
    const s = summary('vf', 0, 'hfref');
    expect(s.noOutput).toBe(true);
    expect(s.co).toBe(0);
  });

  it('lowers the ejection fraction when the patient has HFrEF', () => {
    expect(summary('normal-sinus', 72, 'hfref').ef).toBeLessThan(summary('normal-sinus', 72).ef);
  });
});

describe('hemodynamic profiles', () => {
  it.each(Object.entries(HEMO_PROFILES))('%s has systolic > diastolic pressure and EDV ≥ ESV', (_, p) => {
    expect(p.sbp).toBeGreaterThan(p.dbp);
    expect(p.edv).toBeGreaterThanOrEqual(p.esv);
  });
});

describe('finger plethysmogram', () => {
  const trace = (profile: string, hr = 0, from = 12_000, to = 20_000) => {
    const engine = new ECGEngine(profile, hr);
    engine.ensure(to + 2_000);
    const model = new HemoModel(engine);
    const ys: number[] = [];
    for (let t = from; t < to; t += 5) ys.push(model.pleth(t));
    return { engine, model, ys };
  };

  it('pulses once per beat between a flat baseline and a peak near 1', () => {
    const { ys } = trace('normal-sinus', 72);
    expect(Math.max(...ys)).toBeGreaterThan(0.85);
    expect(Math.max(...ys)).toBeLessThan(1.2);
    expect(Math.min(...ys)).toBeLessThan(0.12);
    // upstrokes through half height: one per beat (72/min for 8 s ≈ 9–10)
    let ups = 0;
    for (let i = 1; i < ys.length; i++) if (ys[i - 1] < 0.5 && ys[i] >= 0.5) ups++;
    expect(ups).toBeGreaterThanOrEqual(8);
    expect(ups).toBeLessThanOrEqual(11);
  });

  it('has a dicrotic notch on the way down (a dip, then a small second wave)', () => {
    const { engine, model } = trace('normal-sinus', 72);
    const v = engine.vent[engine.lastVentIndex(15_000)];
    const ev = model.eventsAt(v.t + 100)!;
    const at = (ms: number) => model.pleth(ev.ac + 200 + ms);
    expect(at(80)).toBeGreaterThan(at(5));
    expect(at(80)).toBeGreaterThan(at(260));
  });

  it('is flat when the heart has no output', () => {
    expect(Math.max(...trace('vf').ys)).toBe(0);
    expect(Math.max(...trace('asystole').ys)).toBe(0);
  });

  it('shows beat-to-beat pulse variation in atrial fibrillation', () => {
    const { ys } = trace('atrial-fibrillation', 130);
    const peaks: number[] = [];
    for (let i = 1; i < ys.length - 1; i++) if (ys[i] > ys[i - 1] && ys[i] >= ys[i + 1] && ys[i] > 0.3) peaks.push(ys[i]);
    expect(Math.max(...peaks) - Math.min(...peaks)).toBeGreaterThan(0.08);
  });
});

/** The summary averaged over two breaths (the numbers swing with respiration in tamponade) */
function steady(profile: string, hr = 0, from = 30_000, to = 40_000) {
  const engine = new ECGEngine(profile, hr);
  engine.ensure(to + 4_000);
  const model = new HemoModel(engine);
  const keys = ['sbp', 'dbp', 'map', 'sv', 'ef', 'co'] as const;
  const sum = { sbp: 0, dbp: 0, map: 0, sv: 0, ef: 0, co: 0 };
  let n = 0;
  for (let t = from; t < to; t += 250, n++) {
    const s = model.summary(t);
    for (const k of keys) sum[k] += s[k];
  }
  for (const k of keys) sum[k] /= n;
  return sum;
}

describe('arterial pressure and cardiac output', () => {
  it.each([
    ['avnrt', [180, 200, 220, 240]],
    ['vt', [170, 200, 220, 250]],
  ] as const)('mean pressure does not rise while output falls as %s gets faster', (id, rates) => {
    const rows = rates.map((hr) => steady(id, hr));
    for (let k = 1; k < rows.length; k++) {
      if (rows[k].co <= rows[k - 1].co) expect(rows[k].map).toBeLessThanOrEqual(rows[k - 1].map + 1);
      if (rows[k].co < rows[k - 1].co - 0.3) expect(rows[k].map).toBeLessThan(rows[k - 1].map);
    }
  });

  it('a tachycardia too fast for the ventricle to fill is hypotensive with a narrow pulse pressure', () => {
    const s = steady('avnrt', 240);
    expect(s.co).toBeLessThan(3);
    expect(s.map).toBeLessThan(80);
    expect(s.sbp - s.dbp).toBeLessThan(10);
    // ventricular flutter rates: next to no stroke volume, so next to no pulse
    const vt = steady('vt', 250);
    expect(vt.map).toBeLessThan(steady('vt', 200).map - 4);
    expect(vt.sbp - vt.dbp).toBeLessThan(8);
    expect(vt.sbp).toBeLessThan(60);
  });

  it('ventricular tachycardia stays hypotensive at every rate it can be set to', () => {
    for (const hr of [120, 150, 170, 200, 220, 250]) expect(steady('vt', hr).sbp).toBeLessThan(90);
  });

  // Body surface area ~1.9 m²: a cardiac index under 2.2 L/min/m² is a cardiac output under ~4.2 L/min
  it.each(['tamponade', 'pulmonary-embolism', 'cardiogenic-shock'])('%s has a low cardiac output and index beside its low blood pressure', (id) => {
    const s = steady(id);
    expect(s.co).toBeGreaterThan(2.5);
    expect(s.co).toBeLessThan(3.9);
    expect(s.co / 1.9).toBeLessThan(2.1);
    expect(s.sbp).toBeLessThan(100);
  });

  it('tamponade shows pulsus paradoxus: the systolic pressure falls by more than 10 mmHg with each inspiration', () => {
    const swing = (id: string) => {
      const engine = new ECGEngine(id);
      engine.ensure(46_000);
      const model = new HemoModel(engine);
      // the systolic peak of every beat over two breaths
      const peaks = engine.vent.filter((v) => v.t > 30_000 && v.t < 40_000).map((v) => {
        let peak = 0;
        for (let t = v.t + 80; t < v.t + 420; t += 2) peak = Math.max(peak, model.sample(t).aop);
        return peak;
      });
      return { fall: Math.max(...peaks) - Math.min(...peaks), highest: Math.max(...peaks) };
    };
    const tamponade = swing('tamponade');
    expect(tamponade.fall).toBeGreaterThan(10);
    expect(tamponade.fall).toBeLessThan(25);
    // hypotensive all through the breath
    expect(tamponade.highest).toBeLessThan(90);
    // a normal heart: a few mmHg at most
    expect(swing('normal-sinus').fall).toBeLessThan(6);
  });

  it('gives each heart the ejection fraction its label promises', () => {
    // small, underfilled but vigorous ventricles
    expect(steady('tamponade').ef).toBeGreaterThanOrEqual(50);
    expect(steady('pulmonary-embolism').ef).toBeGreaterThanOrEqual(50);
    // pump failure
    expect(steady('cardiogenic-shock').ef).toBeLessThan(22);
    const hfref = steady('hfref').ef; // "LVEF ~25%"
    expect(hfref).toBeGreaterThan(21);
    expect(hfref).toBeLessThan(29);
    const mi = steady('anterior-stemi').ef; // "reduced EF"
    expect(mi).toBeGreaterThan(35);
    expect(mi).toBeLessThan(50);
    expect(steady('hfpef').ef).toBeGreaterThanOrEqual(50); // preserved
    expect(steady('hcm').ef).toBeGreaterThanOrEqual(65); // hyperdynamic
    const normal = steady('normal-sinus', 72).ef;
    expect(normal).toBeGreaterThan(54);
    expect(normal).toBeLessThan(66);
  });
});

describe('pressure and volume traces', () => {
  const SIGNALS = ['lvp', 'aop', 'lap', 'lvv'] as const;

  /**
   * The largest step in each trace, sampled every millisecond: a change from one sample to the next that is
   * bigger than the changes just before and after it. A steep but continuous slope scores ~0; a jump scores its size.
   */
  function steps(model: HemoModel, from: number, to: number) {
    const worst = { lvp: 0, aop: 0, lap: 0, lvv: 0 };
    const xs: ReturnType<HemoModel['sample']>[] = [];
    for (let t = from; t <= to; t++) xs.push(model.sample(t));
    for (let k = 1; k + 2 < xs.length; k++) {
      for (const s of SIGNALS) {
        const d = Math.abs(xs[k + 1][s] - xs[k][s]);
        const around = Math.max(Math.abs(xs[k][s] - xs[k - 1][s]), Math.abs(xs[k + 2][s] - xs[k + 1][s]));
        worst[s] = Math.max(worst[s], d - around);
      }
    }
    return worst;
  }

  function expectNoSteps(model: HemoModel, from: number, to: number) {
    const w = steps(model, from, to);
    for (const s of SIGNALS) expect(w[s], `${s} jumps`).toBeLessThan(1);
  }

  const heart = (profile: string, hr = 0, until = 26_000) => {
    const engine = new ECGEngine(profile, hr);
    engine.ensure(until);
    return { engine, model: new HemoModel(engine) };
  };

  it.each([
    'normal-sinus', 'hfpef', 'hcm', 'cardiogenic-shock', 'anterior-stemi', 'hfref', 'aortic-stenosis',
    'mitral-regurgitation', 'mitral-stenosis', 'tamponade', 'pulmonary-embolism',
  ])('%s: the LV pressure falls to the LA pressure as the mitral valve opens, with no step', (id) => {
    const { engine, model } = heart(id);
    const v = engine.vent[engine.lastVentIndex(15_000)];
    const mo = model.eventsAt(v.t + 100)!.mo;
    // the valve opens when the two pressures cross…
    const at = model.sample(mo);
    expect(Math.abs(at.lvp - at.lap)).toBeLessThan(1.5);
    // …and the LV pressure runs straight through that moment
    expect(Math.abs(model.sample(mo + 1).lvp - model.sample(mo - 1).lvp)).toBeLessThan(3);
    // it goes on falling to its early-diastolic minimum, then rises as the ventricle fills
    const early = model.sample(mo + 60).lvp;
    expect(early).toBeLessThan(at.lvp);
    // with the mitral valve open the LA pressure stays at or above the LV pressure
    for (let t = mo; t < mo + 150; t += 5) {
      const s = model.sample(t);
      expect(s.lap).toBeGreaterThanOrEqual(s.lvp - 0.01);
    }
  });

  it('slow relaxation (HFpEF) leaves a higher early-diastolic LV pressure than a normal heart', () => {
    const minimum = (id: string) => {
      const { engine, model } = heart(id);
      const v = engine.vent[engine.lastVentIndex(15_000)];
      const mo = model.eventsAt(v.t + 100)!.mo;
      let lo = Infinity;
      for (let t = mo; t < mo + 250; t += 2) lo = Math.min(lo, model.sample(t).lvp);
      return lo;
    };
    expect(minimum('normal-sinus')).toBeLessThan(8);
    expect(minimum('hfpef')).toBeGreaterThan(minimum('normal-sinus') + 3);
  });

  it.each(Object.keys(ECG_PROFILES))('%s: no trace jumps at its usual rate', (id) => {
    expectNoSteps(heart(id).model, 14_000, 20_000);
  });

  it.each([
    ['normal-sinus', 40], ['normal-sinus', 180], ['sinus-tachycardia', 150], ['avnrt', 220], ['avnrt', 240],
    ['vt', 120], ['vt', 200], ['vt', 250], ['atrial-fibrillation', 60], ['atrial-fibrillation', 150],
    ['atrial-fibrillation', 180], ['hfpef', 120], ['third-degree-avb', 25], ['mitral-stenosis', 130], ['pvcs', 110],
  ] as const)('%s at %i/min: no trace jumps', (id, hr) => {
    expectNoSteps(heart(id, hr).model, 14_000, 20_000);
  });

  it('the traces stay continuous through cardiac arrest, return of circulation and a change of rhythm', () => {
    const engine = new ECGEngine('normal-sinus', 72);
    const model = new HemoModel(engine);
    engine.ensure(14_000);
    engine.setRhythm('vf', 0, 10_000);
    engine.ensure(24_000);
    engine.setRhythm('asystole', 0, 16_000);
    engine.ensure(26_000);
    engine.setRhythm('sinus-tachycardia', 108, 22_000);
    engine.ensure(34_000);
    engine.setRhythm('vt', 180, 30_000);
    engine.ensure(40_000);
    engine.setRhythm('atrial-fibrillation', 130, 36_000);
    engine.ensure(46_000);
    expectNoSteps(model, 8_000, 42_000);
  });

  it('fills steadily through diastole: the atrial kick arrives with the P wave, not when the mitral valve opens', () => {
    const { engine, model } = heart('normal-sinus', 72);
    const i = engine.lastVentIndex(15_000);
    const mo = model.eventsAt(engine.vent[i].t + 100)!.mo;
    const nextMc = model.eventsAt(engine.vent[i + 1].t + 100)!.mc;
    let prev = model.sample(mo).lvv;
    for (let t = mo + 1; t < nextMc; t++) {
      const v = model.sample(t).lvv;
      expect(v).toBeGreaterThanOrEqual(prev - 0.01);
      prev = v;
    }
    // the last ~fifth of filling comes from the atria, after the P wave
    const p = engine.atrial[engine.lastAtrialIndex(engine.vent[i + 1].t)];
    const before = model.sample(p.t + 60).lvv;
    const edv = model.sample(nextMc).lvv;
    expect(edv - before).toBeGreaterThan(8);
    expect(edv - before).toBeLessThan(25);
  });
});

describe('hemodynamic summary when the beats stop or have only just returned', () => {
  it('follows the falling arterial pressure through a ventricular standstill instead of holding the last reading', () => {
    const engine = new ECGEngine('normal-sinus', 72);
    const model = new HemoModel(engine);
    engine.ensure(24_000);
    // every P wave blocked (adenosine): P waves march on, the ventricles stand still
    engine.setRhythm('normal-sinus', 72, 20_000, { avBlock: true });
    engine.ensure(34_000);
    const last = engine.vent[engine.vent.length - 1].t;
    // an ordinary diastole: still the last beats' reading
    const soon = model.summary(last + 600);
    expect(soon.noOutput).toBe(false);
    expect(soon.sbp).toBeGreaterThan(110);
    for (const dt of [5_000, 9_000]) {
      const s = model.summary(last + dt);
      const trace = model.sample(last + dt).aop;
      expect(s.noOutput).toBe(true);
      expect(Math.abs(s.sbp - trace)).toBeLessThanOrEqual(1);
      expect(s.sbp).toBeLessThan(40);
      expect(s.sv).toBe(0);
      expect(s.co).toBe(0);
    }
  });

  it('builds the pressure up beat by beat after an arrest, without averaging in the beats before it', () => {
    const engine = new ECGEngine('normal-sinus', 72);
    const model = new HemoModel(engine);
    engine.ensure(14_000);
    engine.setRhythm('vf', 0, 10_000);
    engine.ensure(74_000);
    engine.setRhythm('sinus-tachycardia', 108, 70_000);
    engine.ensure(90_000);
    const first = engine.vent.find((v) => v.t >= 70_000)!;
    // just after the first beat: its own pressures, measured on the trace
    const t = first.t + 500;
    let peak = 0;
    for (let x = first.t; x <= t; x += 2) peak = Math.max(peak, model.sample(x).aop);
    const s = model.summary(t);
    expect(s.noOutput).toBe(false);
    expect(Math.abs(s.sbp - peak)).toBeLessThanOrEqual(2);
    // …and it recovers over the next beats
    expect(model.summary(first.t + 12_000).sbp).toBeGreaterThan(s.sbp + 20);
  });
});
