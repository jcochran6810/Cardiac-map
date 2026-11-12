import { describe, expect, it } from 'vitest';
import { ECGEngine } from '@/lib/ecg/engine';
import { HemoModel } from '@/lib/physiology/hemodynamics';
import { auscultate, soundsHeard, type Auscultation } from '@/lib/physiology/heartSounds';

const FROM = 10_000;
const TO = 20_000;

function listen(profile: string, hr = 0): Auscultation & { engine: ECGEngine; hemo: HemoModel } {
  const engine = new ECGEngine(profile, hr);
  engine.ensure(TO + 3_000);
  const hemo = new HemoModel(engine);
  return { ...auscultate(engine, hemo, FROM, TO), engine, hemo };
}
const kinds = (a: Auscultation) => a.sounds.map((s) => s.kind);
const count = (a: Auscultation, k: string) => a.sounds.filter((s) => s.kind === k).length;

describe('heart sounds', () => {
  it('a normal heart goes lub-dub once per beat and nothing else', () => {
    const a = listen('normal-sinus', 72);
    expect(new Set(kinds(a))).toEqual(new Set(['s1', 's2']));
    expect(a.murmurs).toEqual([]);
    // 72/min for 10 s: 12 beats
    expect(count(a, 's1')).toBeGreaterThanOrEqual(11);
    expect(count(a, 's1')).toBeLessThanOrEqual(13);
    expect(Math.abs(count(a, 's1') - count(a, 's2'))).toBeLessThanOrEqual(1);
    // they alternate, and systole (S1→S2) is shorter than diastole (S2→S1) at a resting rate
    const s = a.sounds;
    for (let i = 1; i < s.length; i++) expect(s[i].kind).not.toBe(s[i - 1].kind);
    const i1 = s.findIndex((x) => x.kind === 's1');
    const systole = s[i1 + 1].t - s[i1].t;
    const diastole = s[i1 + 2].t - s[i1 + 1].t;
    expect(systole).toBeGreaterThan(250);
    expect(systole).toBeLessThan(420);
    expect(diastole).toBeGreaterThan(systole);
  });

  it('gives each sound exactly once when listened to in back-to-back windows', () => {
    const { engine, hemo, sounds, murmurs } = listen('mitral-stenosis');
    const pieces: Auscultation = { sounds: [], murmurs: [] };
    for (let t = FROM; t < TO; t += 137) {
      const a = auscultate(engine, hemo, t, Math.min(TO, t + 137));
      pieces.sounds.push(...a.sounds);
      pieces.murmurs.push(...a.murmurs);
    }
    expect(pieces.sounds.map((s) => `${s.kind}@${Math.round(s.t)}`).sort()).toEqual(sounds.map((s) => `${s.kind}@${Math.round(s.t)}`).sort());
    expect(pieces.murmurs.length).toBe(murmurs.length);
  });

  it('is silent when the heart has no output', () => {
    for (const p of ['vf', 'asystole', 'pea']) {
      const a = listen(p);
      expect(a.sounds, p).toEqual([]);
      expect(a.murmurs, p).toEqual([]);
      expect(soundsHeard(a.engine, a.hemo, 15_000).silent).toBe(true);
    }
  });

  it('aortic stenosis: a murmur inside systole, between S1 and S2', () => {
    const a = listen('aortic-stenosis');
    expect(a.murmurs.length).toBeGreaterThan(5);
    for (const m of a.murmurs) {
      expect(m.kind).toBe('as');
      const s1 = [...a.sounds].reverse().find((s) => s.kind === 's1' && s.t <= m.t0 + 1);
      const s2 = a.sounds.find((s) => s.kind === 's2' && s.t >= m.t0);
      if (s1) expect(m.t0).toBeGreaterThan(s1.t);
      if (s2) expect(m.t1).toBeLessThanOrEqual(s2.t);
      expect(m.t1 - m.t0).toBeGreaterThan(150);
    }
  });

  it('mitral regurgitation: a murmur through all of systole, with an S3', () => {
    const a = listen('mitral-regurgitation');
    expect(a.murmurs.every((m) => m.kind === 'mr')).toBe(true);
    const m = a.murmurs[2];
    const s1 = [...a.sounds].reverse().find((s) => s.kind === 's1' && s.t <= m.t0)!;
    const s2 = a.sounds.find((s) => s.kind === 's2' && s.t > m.t0)!;
    // starts with S1 and runs up to S2
    expect(m.t0 - s1.t).toBeLessThan(30);
    expect(Math.abs(m.t1 - s2.t)).toBeLessThan(30);
    expect(count(a, 's3')).toBeGreaterThan(5);
  });

  it('mitral stenosis: an opening snap just after S2, then a diastolic rumble up to the next S1', () => {
    const a = listen('mitral-stenosis');
    expect(count(a, 'snap')).toBeGreaterThan(5);
    const snap = a.sounds.find((s) => s.kind === 'snap' && s.t > FROM + 1000)!;
    const s2 = [...a.sounds].reverse().find((s) => s.kind === 's2' && s.t < snap.t)!;
    expect(snap.t - s2.t).toBeGreaterThan(30);
    expect(snap.t - s2.t).toBeLessThan(130);
    const m = a.murmurs.find((x) => x.t0 > snap.t)!;
    expect(m.kind).toBe('ms');
    const nextS1 = a.sounds.find((s) => s.kind === 's1' && s.t > m.t0)!;
    expect(m.t1).toBeLessThanOrEqual(nextS1.t);
    // in sinus rhythm the atrial contraction makes it swell again before S1
    expect(m.presystolic).toBe(true);
  });

  it('a failing, dilated ventricle has an S3 after S2; a stiff one has an S4 before S1', () => {
    const hfref = listen('hfref');
    expect(count(hfref, 's3')).toBeGreaterThan(5);
    const s3 = hfref.sounds.find((s) => s.kind === 's3' && s.t > FROM + 1000)!;
    const s2 = [...hfref.sounds].reverse().find((s) => s.kind === 's2' && s.t < s3.t)!;
    expect(s3.t - s2.t).toBeGreaterThan(100);
    expect(s3.t - s2.t).toBeLessThan(220);

    const hfpef = listen('hfpef');
    expect(count(hfpef, 's4')).toBeGreaterThan(5);
    const s4 = hfpef.sounds.find((s) => s.kind === 's4' && s.t > FROM + 1000)!;
    const s1 = hfpef.sounds.find((s) => s.kind === 's1' && s.t > s4.t)!;
    expect(s1.t - s4.t).toBeGreaterThan(50);
    expect(s1.t - s4.t).toBeLessThan(130);
  });

  it('there is no S4 without an atrial contraction (atrial fibrillation in a stiff heart)', () => {
    const engine = new ECGEngine('atrial-fibrillation', 100);
    engine.ensure(TO + 3_000);
    const hemo = new HemoModel(engine);
    hemo.setOverride('hfpef');
    const a = auscultate(engine, hemo, FROM, TO);
    expect(a.sounds.some((s) => s.kind === 's4')).toBe(false);
    expect(soundsHeard(engine, hemo, 15_000).extra).not.toContain('s4');
    // the same heart in sinus rhythm does have one
    expect(soundsHeard(listen('hfpef').engine, listen('hfpef').hemo, 15_000).extra).toContain('s4');
  });

  it('names what is heard for the legend', () => {
    const as = listen('aortic-stenosis');
    expect(soundsHeard(as.engine, as.hemo, 15_000)).toMatchObject({ murmur: 'as', silent: false });
    const n = listen('normal-sinus');
    expect(soundsHeard(n.engine, n.hemo, 15_000)).toEqual({ extra: [], murmur: null, silent: false });
  });
});
