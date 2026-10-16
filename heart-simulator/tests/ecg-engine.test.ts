import { describe, expect, it } from 'vitest';
import { ECGEngine, cycleEvents, noise1 } from '@/lib/ecg/engine';

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
    expect(e.vent.map((v) => v.t)).toEqual(past);
    e.ensure(T);
    expect(e.vent.length).toBeGreaterThan(past.length);
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

describe('noise', () => {
  it('stays within ±1', () => {
    for (let x = -50; x < 50; x += 0.37) {
      const n = noise1(x);
      expect(n).toBeGreaterThanOrEqual(-1);
      expect(n).toBeLessThanOrEqual(1);
    }
  });
});
