import { describe, expect, it } from 'vitest';
import { ECGEngine } from '@/lib/ecg/engine';
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
    expect(s.co).toBeCloseTo((s.sv * engine.heartRate(T)) / 1000, 1);
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
