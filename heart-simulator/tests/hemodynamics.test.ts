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

  it('a tachycardia too fast for the ventricle to fill leaves only a small stroke volume and a weak, narrow pulse', () => {
    const s = steady('avnrt', 240);
    const rest = steady('avnrt', 160);
    // under a third of a resting stroke volume, and the output falls although the rate rises
    expect(s.sv).toBeLessThan(25);
    expect(s.co).toBeLessThan(rest.co - 1.5);
    expect(s.sbp - s.dbp).toBeLessThan(15);
    // …but a healthy heart still has a pulse at 240/min (the defibrillator calls one from 10 mmHg and 15 mL)
    expect(s.sbp - s.dbp).toBeGreaterThanOrEqual(10);
    expect(s.sv).toBeGreaterThanOrEqual(15);
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
    const swing = (id: string, hr = 0) => {
      const engine = new ECGEngine(id, hr);
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
    // whatever the heart rate
    for (const hr of [90, 150]) expect(swing('tamponade', hr).fall).toBeGreaterThan(10);
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

  it.each(([
    ['normal-sinus', 70], ['normal-sinus', 40], ['sinus-tachycardia', 0], ['first-degree-avb', 0], ['mobitz-i', 0],
    ['mobitz-ii', 0], ['third-degree-avb', 0], ['inferior-stemi-chb', 0], ['pvcs', 0], ['tcp', 0], ['paced', 0],
    ['hfpef', 0], ['mitral-stenosis', 0], ['mitral-regurgitation', 0], ['aortic-stenosis', 0], ['hcm', 0],
  ] as const).map(([id, hr]) => [id, hr || ECG_PROFILES[id].defaultHR] as const))('%s at %i/min: the LV volume only ever rises between mitral opening and closure, beat after beat', (id, hr) => {
    const { engine, model } = heart(id, hr, 24_000);
    for (let i = engine.lastVentIndex(12_000); i < engine.lastVentIndex(20_000); i++) {
      const mo = model.eventsAt(engine.vent[i].t + 60)!.mo;
      const nextMc = model.eventsAt(engine.vent[i + 1].t + 60)!.mc;
      let prev = model.sample(mo).lvv;
      for (let t = mo + 2; t < nextMc; t += 2) {
        const v = model.sample(t).lvv;
        // (no notch when the next P wave begins: its contraction only adds)
        expect(v, `beat ${i}, ${t - mo} ms after mitral opening`).toBeGreaterThanOrEqual(prev - 0.01);
        prev = v;
      }
    }
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

/** Beat k's aortic pressure as its valve opens, its systolic peak and when that comes, and its highest LV pressure */
function beatPressures(model: HemoModel, engine: ECGEngine, k: number) {
  const ev = model.eventsAt(engine.vent[k].t + 60)!;
  const start = model.sample(ev.ao).aop;
  let peak = -Infinity, peakAt = ev.ao, lv = -Infinity;
  for (let t = ev.ao; t <= ev.ac; t++) {
    const s = model.sample(t);
    if (s.aop > peak) { peak = s.aop; peakAt = t; }
    lv = Math.max(lv, s.lvp);
  }
  return { ev, start, peak, pulse: peak - start, peakAt: (peakAt - ev.ao) / (ev.ac - ev.ao), lv, gradient: lv - peak };
}

/** LV volume at the start and end of beat k's ejection (end-diastolic and end-systolic volume) */
function beatVolumes(model: HemoModel, engine: ECGEngine, k: number) {
  const ev = model.eventsAt(engine.vent[k].t + 60)!;
  return { edv: model.sample(ev.mc).lvv, esv: model.sample(ev.mo).lvv, sv: model.sample(ev.mc).lvv - model.sample(ev.mo).lvv };
}

describe('valve lesions on the pressure traces', () => {
  it('severe aortic stenosis: a small, slow-rising, late-peaking pulse (pulsus parvus et tardus)', () => {
    const look = (id: string) => {
      const engine = new ECGEngine(id);
      engine.ensure(26_000);
      const model = new HemoModel(engine);
      const k = engine.lastVentIndex(20_000);
      const b = beatPressures(model, engine, k);
      // steepest rise of the aortic pressure (mmHg per ms)
      let slope = 0;
      for (let t = b.ev.ao; t < b.ev.ac; t++) slope = Math.max(slope, model.sample(t + 1).aop - model.sample(t).aop);
      return { ...b, slope, s: model.summary(20_000) };
    };
    const as = look('aortic-stenosis');
    const normal = look('normal-sinus');
    // parvus: a narrow pulse pressure, though the stroke volume is normal
    expect(as.s.sbp - as.s.dbp).toBeLessThan(30);
    expect(normal.s.sbp - normal.s.dbp).toBeGreaterThan(36);
    expect(as.s.sv).toBeGreaterThan(60);
    // tardus: the peak comes late in ejection and the upstroke is slow
    expect(as.peakAt).toBeGreaterThan(0.55);
    expect(normal.peakAt).toBeLessThan(0.4);
    expect(as.slope).toBeLessThan(normal.slope / 2);
    // …and the ventricle still works far above the aorta (severe: a large gradient)
    expect(as.gradient).toBeGreaterThan(50);
  });

  it('mitral regurgitation: the leak goes on through isovolumic relaxation, until the mitral valve opens', () => {
    const engine = new ECGEngine('mitral-regurgitation');
    engine.ensure(26_000);
    const model = new HemoModel(engine);
    const ev = model.eventsAt(engine.vent[engine.lastVentIndex(20_000)].t + 60)!;
    let prev = model.sample(ev.ac).lvv;
    for (let t = ev.ac + 2; t <= ev.mo; t += 2) {
      const v = model.sample(t).lvv;
      expect(v).toBeLessThanOrEqual(prev + 0.01);
      prev = v;
    }
    expect(model.sample(ev.ac).lvv - model.sample(ev.mo).lvv).toBeGreaterThan(2);
    // a competent valve: the volume really is constant
    const n = new ECGEngine('normal-sinus', 72);
    n.ensure(26_000);
    const nm = new HemoModel(n);
    const nev = nm.eventsAt(n.vent[n.lastVentIndex(20_000)].t + 60)!;
    expect(Math.abs(nm.sample(nev.ac).lvv - nm.sample(nev.mo).lvv)).toBeLessThan(0.01);
  });
});

describe('beat-to-beat changes in pressure and volume', () => {
  const after = (profile: string, hr: number, override?: Parameters<HemoModel['setOverride']>[0]) => {
    const engine = new ECGEngine(profile, hr);
    engine.ensure(30_000);
    const model = new HemoModel(engine);
    if (override) model.setOverride(override);
    // the PVCs, the beats that end their pauses, and the ordinary beats in between (not the one after a strong beat)
    const ks = engine.vent.map((_, k) => k).filter((k) => engine.vent[k].t > 12_000 && engine.vent[k].t < 24_000);
    const post = ks.filter((k) => engine.vent[k - 1].kind === 'pvc');
    const ordinary = ks.filter((k) => engine.vent[k].kind === 'conducted' && engine.vent[k - 1].kind !== 'pvc' && engine.vent[k - 2].kind !== 'pvc');
    expect(post.length).toBeGreaterThan(2);
    expect(ordinary.length).toBeGreaterThan(2);
    return { engine, model, post, ordinary };
  };

  it.each([60, 76, 100])('the beat after a PVC at %i/min fills more, ejects more and peaks higher than an ordinary beat (post-extrasystolic potentiation)', (hr) => {
    const { engine, model, post, ordinary } = after('pvcs', hr);
    const top = Math.max(...ordinary.map((k) => beatPressures(model, engine, k).peak));
    const usual = beatVolumes(model, engine, ordinary[0]);
    for (const k of post) {
      const v = beatVolumes(model, engine, k);
      // the purple line peaks higher than on any other beat and falls further
      expect(v.edv).toBeGreaterThan(usual.edv + 5);
      expect(v.esv).toBeLessThan(usual.esv - 3);
      expect(v.sv).toBeGreaterThan(usual.sv * 1.15);
      const b = beatPressures(model, engine, k);
      // a lower diastolic after the long pause, a much bigger pulse and a higher systolic peak
      expect(b.pulse).toBeGreaterThan(beatPressures(model, engine, ordinary[0]).pulse + 8);
      expect(b.peak).toBeGreaterThan(top + 3);
    }
  });

  it('obstructive HCM: after a PVC the gradient rises but the aortic pulse falls (Brockenbrough–Braunwald–Morrow)', () => {
    const { engine, model, post, ordinary } = after('pvcs', 76, 'hcm');
    const o = beatPressures(model, engine, ordinary[0]);
    for (const k of post) {
      const b = beatPressures(model, engine, k);
      expect(b.gradient).toBeGreaterThan(o.gradient + 15);
      expect(b.lv).toBeGreaterThan(o.lv + 10);
      expect(b.pulse).toBeLessThan(o.pulse - 2);
      expect(b.peak).toBeLessThan(o.peak);
    }
    // a fixed stenosis, by contrast: the gradient and the pulse both rise
    const as = after('pvcs', 76, 'aortic-stenosis');
    const ao = beatPressures(as.model, as.engine, as.ordinary[0]);
    for (const k of as.post) {
      const b = beatPressures(as.model, as.engine, k);
      expect(b.gradient).toBeGreaterThan(ao.gradient + 10);
      expect(b.pulse).toBeGreaterThan(ao.pulse + 5);
    }
  });

  it('PVCs do not raise the mean arterial pressure: the strong beats only make up for the weak ones', () => {
    const mean = (id: string, hr: number) => {
      const engine = new ECGEngine(id, hr);
      engine.ensure(44_000);
      const model = new HemoModel(engine);
      let sum = 0, n = 0;
      for (let t = 30_000; t < 40_000; t += 2, n++) sum += model.sample(t).aop;
      return sum / n;
    };
    for (const hr of [60, 76]) expect(mean('pvcs', hr)).toBeLessThan(mean('normal-sinus', hr) + 2.5);
  });

  it('complete heart block: each escape beat fills and ejects according to where the drifting P wave falls', () => {
    for (const id of ['third-degree-avb', 'inferior-stemi-chb']) {
      const engine = new ECGEngine(id);
      engine.ensure(70_000);
      const model = new HemoModel(engine);
      const late: number[] = [];
      const lost: number[] = [];
      for (let k = engine.lastVentIndex(14_000); k < engine.lastVentIndex(64_000); k++) {
        const v = engine.vent[k];
        const sv = beatVolumes(model, engine, k).sv;
        const p = engine.atrial[engine.lastAtrialIndex(v.t)];
        const pr = v.t - p.t;
        // a P wave a normal PR interval before the QRS: the atria top the ventricle up just before it contracts
        if (pr > 100 && pr < 250) late.push(sv);
        // a P wave just after the last beat or long before this one: its contraction is wasted on early filling
        else if (pr > 550) lost.push(sv);
      }
      expect(late.length, id).toBeGreaterThan(2);
      expect(lost.length, id).toBeGreaterThan(2);
      expect(Math.min(...late), id).toBeGreaterThan(Math.max(...lost) + 4);
    }
  });
});

describe('a pulse to feel (the defibrillator reads the summary)', () => {
  /** The defibrillator's rule: a palpable pulse needs a pulse pressure of ~10 mmHg and a stroke volume of ~15 mL behind it */
  const palpable = (s: ReturnType<HemoModel['summary']>) => !s.noOutput && s.sbp >= 50 && s.sbp - s.dbp >= 10 && s.sv >= 15;
  const always = (profile: string, hr: number, override?: Parameters<HemoModel['setOverride']>[0]) => {
    const engine = new ECGEngine(profile, hr);
    engine.ensure(44_000);
    const model = new HemoModel(engine);
    if (override) model.setOverride(override);
    const checks: boolean[] = [];
    for (let t = 30_000; t < 40_000; t += 250) checks.push(palpable(model.summary(t)));
    return checks.every(Boolean) ? 'pulse' : checks.some(Boolean) ? 'sometimes' : 'none';
  };

  it.each([
    // VT in a diseased ventricle: a (weak) pulse at the usual rates, none at flutter rates
    ['vt', 150, null, 'pulse'], ['vt', 170, null, 'pulse'], ['vt', 180, null, 'pulse'], ['vt', 250, null, 'none'],
    // the same VT in a normal heart is tolerated up to ~200
    ['vt', 150, 'normal', 'pulse'], ['vt', 200, 'normal', 'pulse'],
    // SVT, and the defibrillator scenarios' unstable patients: hypotensive but with a pulse
    ['avnrt', 180, null, 'pulse'], ['avnrt', 210, null, 'pulse'], ['avnrt', 190, 'shock', 'pulse'],
    ['atrial-fibrillation', 160, 'shock', 'pulse'], ['third-degree-avb', 34, 'hfref', 'pulse'],
    ['sinus-bradycardia', 38, 'hfref', 'pulse'], ['tamponade', 118, null, 'pulse'], ['cardiogenic-shock', 118, null, 'pulse'],
  ] as const)('%s at %i/min (heart: %s) → %s', (id, hr, override, expected) => {
    expect(always(id, hr, override ?? undefined)).toBe(expected);
  });

  it.each([140, 150, 160])('fast AF at %i/min in cardiogenic shock keeps a (weak, irregular) pulse minute after minute', (hr) => {
    // the unstable-AF patient: some short cycles eject next to nothing, but a pulse check never finds no pulse
    const engine = new ECGEngine('atrial-fibrillation', hr);
    engine.ensure(184_000);
    const model = new HemoModel(engine);
    model.setOverride('shock');
    const lost: number[] = [];
    for (let t = 5_000; t < 180_000; t += 100) if (!palpable(model.summary(t))) lost.push(t);
    expect(lost).toEqual([]);
  });

  it('pre-excited AF at its default rate keeps a palpable pulse minute after minute; driven faster, it loses it', () => {
    // the awake patient racing down an accessory pathway: a pulse check, the cuff and the oximeter must not flicker
    const at = (hr: number) => {
      const engine = new ECGEngine('af-wpw', hr);
      engine.ensure(184_000);
      const model = new HemoModel(engine);
      let lost = 0;
      for (let t = 5_000; t < 180_000; t += 100) if (!palpable(model.summary(t))) lost++;
      return lost;
    };
    expect(at(ECG_PROFILES['af-wpw'].defaultHR)).toBe(0);
    // an AV-nodal blocker speeds it further (×1.12 and on): the pulse comes and goes, then is gone
    expect(at(250)).toBeGreaterThan(500);
  });
});
