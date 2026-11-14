import { describe, expect, it } from 'vitest';
import { CONDITION_TO_PROFILE, ECG_PROFILES, PROFILE_ALIASES, P_TEMPLATES, QRS_TEMPLATES, prForRate, qtForRR, resolveProfile, stLevel } from '@/lib/ecg/profiles';
import { ECGEngine } from '@/lib/ecg/engine';
import { HEMO_PROFILES, HemoModel } from '@/lib/physiology/hemodynamics';
import { soundsHeard } from '@/lib/physiology/heartSounds';
import { answerFor, judgeRead, partialFor } from '@/lib/sim/scenario/reads';
import { ECG_PROFILE_IDS } from '@/types/content';

describe('QT correction (Fridericia)', () => {
  it('returns QTc unchanged at 60 bpm (RR 1000 ms)', () => {
    expect(qtForRR(420, 1000)).toBeCloseTo(420, 9);
  });

  it('applies Fridericia: QT = QTc × ∛(RR in seconds)', () => {
    expect(qtForRR(400, 500)).toBeCloseTo(400 * Math.cbrt(0.5), 6);
    expect(qtForRR(440, 1600)).toBeCloseTo(440 * Math.cbrt(1.6), 6);
  });

  it('lengthens QT as the RR interval grows', () => {
    let last = 0;
    for (const rr of [400, 600, 800, 1000, 1300, 1600, 2000]) {
      const qt = qtForRR(440, rr);
      expect(qt).toBeGreaterThan(last);
      last = qt;
    }
  });

  it('clamps to a physiological 220–640 ms and floors RR at 250 ms', () => {
    expect(qtForRR(900, 3000)).toBe(640);
    expect(qtForRR(200, 250)).toBe(220);
    expect(qtForRR(440, 100)).toBe(qtForRR(440, 250));
  });
});

describe('PR interval vs rate', () => {
  it('has no PR without a conducted P wave', () => {
    expect(prForRate(0, 80)).toBe(0);
  });

  it('is unchanged up to 75 bpm, then shortens but never below 100 ms', () => {
    expect(prForRate(160, 60)).toBe(160);
    expect(prForRate(160, 75)).toBe(160);
    expect(prForRate(160, 120)).toBeLessThan(160);
    expect(prForRate(160, 400)).toBe(100);
  });
});

describe('rhythm profiles', () => {
  const profiles = Object.entries(ECG_PROFILES);

  it('falls back to normal sinus rhythm for missing or unknown ids', () => {
    for (const id of [null, undefined, '', 'no-such-rhythm']) expect(resolveProfile(id).id).toBe('normal-sinus');
  });

  it('resolves every legacy alias to an existing profile', () => {
    for (const [alias, target] of Object.entries(PROFILE_ALIASES)) {
      expect(ECG_PROFILES[target], `${alias} → ${target}`).toBeDefined();
      expect(resolveProfile(alias).id).toBe(target);
    }
  });

  it('maps every library condition to an existing rhythm profile', () => {
    for (const [condition, target] of Object.entries(CONDITION_TO_PROFILE)) {
      expect(ECG_PROFILES[target], `${condition} → ${target}`).toBeDefined();
    }
  });

  it.each(profiles)('%s is internally consistent', (key, p) => {
    expect(p.id).toBe(key);
    expect(p.minHR).toBeLessThanOrEqual(p.defaultHR);
    expect(p.defaultHR).toBeLessThanOrEqual(p.maxHR);
    expect(p.p === 'none' || p.p in P_TEMPLATES).toBe(true);
    expect(p.qrs in QRS_TEMPLATES).toBe(true);
    expect(p.hemo in HEMO_PROFILES).toBe(true);
    expect(p.findings.length).toBeGreaterThan(0);
  });

  it('electrical alternans is declared for the profiles whose ECG signs list it, as the fraction by which every other QRS shrinks', () => {
    for (const p of Object.values(ECG_PROFILES)) {
      const taught = p.findings.some((f) => /electrical alternans/i.test(f)) || /alternans/i.test(p.headline);
      expect(p.alternans !== undefined, p.id).toBe(taught);
      if (p.alternans !== undefined) {
        expect(p.alternans).toBeGreaterThanOrEqual(0.2);
        expect(p.alternans).toBeLessThanOrEqual(0.5);
        // the beats in between keep the profile's own voltage: it must already be a low-voltage picture
        expect(p.qrsScale).toBeLessThan(0.6);
      }
    }
  });

  it('inferior STEMI with heart block carries the same injury current and T wave as inferior STEMI', () => {
    const [stemi, chb] = [ECG_PROFILES['inferior-stemi'], ECG_PROFILES['inferior-stemi-chb']];
    expect(chb.rhythm).toBe('chb');
    expect(chb.injury).toEqual(stemi.injury);
    expect(chb.t).toEqual(stemi.t);
  });

  it('gives pulseless rhythms no cardiac output', () => {
    expect(ECG_PROFILES.vf.hemo).toBe('no-output');
    expect(ECG_PROFILES.asystole.hemo).toBe('no-output');
  });
});

/**
 * The profiles the case simulator added for what its patients have (follow-ups 44, 61, 115, 125, 144, 155): each resolves,
 * draws, carries the read its pattern names, and shows the feature it was added for
 */
describe('the case simulator\'s added profiles', () => {
  const ADDED = ['pea-narrow', 'paced-vvi', 'takotsubo-lvoto', 'hyperkalemia-moderate', 'hyperkalemia-severe'];
  /** The beats of a rhythm once it has settled, at its usual rate */
  const beats = (id: string, hr = 0) => {
    const engine = new ECGEngine(id, hr);
    engine.ensure(14_000);
    return { engine, vent: engine.vent.filter((v) => v.t > 4_000 && v.t < 12_000), atrial: engine.atrial.filter((a) => a.t > 4_000 && a.t < 12_000) };
  };

  it.each(ADDED)('%s resolves, is a listed profile id and draws beats', (id) => {
    expect(resolveProfile(id).id).toBe(id);
    expect(ECG_PROFILE_IDS as readonly string[]).toContain(id);
    const { engine, vent } = beats(id);
    expect(vent.length).toBeGreaterThan(3);
    let peak = 0;
    for (let t = 4_000; t < 12_000; t += 1) peak = Math.max(peak, Math.abs(engine.voltage('II', t)));
    expect(peak).toBeGreaterThan(0.3);
  });

  it('each is read as its pattern: a paced rhythm, the Takotsubo pattern, hyperkalemia; PEA is found at the pulse check, not on a 12-lead', () => {
    expect(answerFor('paced-vvi').id).toBe('paced');
    expect(judgeRead('paced-vvi', 'tcp')).toBe('partial');
    expect(answerFor('takotsubo-lvoto').id).toBe('takotsubo');
    expect(answerFor('hyperkalemia-moderate').id).toBe('hyperkalaemia');
    expect(answerFor('hyperkalemia-severe').id).toBe('hyperkalaemia');
    expect(() => answerFor('pea-narrow')).toThrow();
  });

  it('PEA from a mechanical cause is narrow and fast, with no output', () => {
    const p = ECG_PROFILES['pea-narrow'];
    expect([p.rhythm, p.qrs, p.hemo, p.defaultHR]).toEqual(['sinus', 'normal', 'no-output', 110]);
    expect(ECG_PROFILES.pea.qrs).toBe('ivcd');
    for (const v of beats('pea-narrow').vent) expect(v.qrsDur).toBeLessThan(110);
    expect(p.findings.join(' ')).toMatch(/tamponade.*tension pneumothorax.*PE.*blood loss/);
  });

  it('a temporary RV wire paces the ventricles only: a spike before every beat, and the P waves march through on their own', () => {
    const { vent, atrial } = beats('paced-vvi', 70);
    expect(vent.every((v) => v.kind === 'paced' && v.spike)).toBe(true);
    // the atria keep their own rate, faster than the paced one, and conduct none of the beats
    expect(atrial.length).toBeGreaterThan(vent.length);
    expect(atrial.every((a) => !a.conducted)).toBe(true);
    // the DDD pacemaker tracks every P wave instead
    expect(beats('paced', 72).vent.every((v) => v.pTime !== undefined)).toBe(true);
  });

  it('hyperkalemia at three stages: the QRS about 110, 135 and 230 ms; the T wave smaller at the lower potassium; no P waves in the sine wave', () => {
    const qrs = (id: string) => Math.round(beats(id).vent[0].qrsDur);
    expect(qrs('hyperkalemia-moderate')).toBeGreaterThanOrEqual(105);
    expect(qrs('hyperkalemia-moderate')).toBeLessThanOrEqual(115);
    expect(qrs('hyperkalemia')).toBeGreaterThan(qrs('hyperkalemia-moderate'));
    expect(qrs('hyperkalemia-severe')).toBeGreaterThan(200);
    expect(ECG_PROFILES['hyperkalemia-moderate'].t!.mag).toBeLessThan(ECG_PROFILES.hyperkalemia.t!.mag);
    // no P waves at all in the sine wave (its findings and both cases' reads say so): an atrial template with nothing to
    // draw, where the earlier stages keep their flattened (or small) P waves
    expect(ECG_PROFILES['hyperkalemia-severe'].p).toBe('absent');
    expect(P_TEMPLATES.absent.pulses).toEqual([]);
    const severe = beats('hyperkalemia-severe').atrial;
    expect(severe.length).toBeGreaterThan(2);
    for (const a of severe) expect(a.template.pulses).toEqual([]);
    for (const a of beats('hyperkalemia').atrial) expect(a.template.pulses.length).toBeGreaterThan(0);
    // the sine wave: the T wave begins before the wide QRS has ended
    const v = beats('hyperkalemia-severe').vent[0];
    expect(v.tw.tp - 2 * v.tw.rise).toBeLessThan(v.qrsDur);
  });

  it('HFpEF draws the strain its read names: lateral ST depression, with no ST elevation a STEMI read would take', () => {
    const p = ECG_PROFILES.hfpef;
    for (const lead of ['I', 'V5', 'V6'] as const) expect(stLevel(p, lead), lead).toBeLessThan(-0.4);
    expect(stLevel(p, 'V1')).toBeGreaterThan(0);
    expect(stLevel(p, 'V1')).toBeLessThan(1);
    expect(answerFor('hfpef').id).toBe('lvh');
  });

  it('Takotsubo with outflow obstruction: the same 12-lead, over a stunned heart with a dynamic gradient and the HCM murmur', () => {
    const [plain, lvoto] = [ECG_PROFILES.takotsubo, ECG_PROFILES['takotsubo-lvoto']];
    expect(lvoto.injury).toEqual(plain.injury);
    expect([lvoto.qrs, lvoto.qtc]).toEqual([plain.qrs, plain.qtc]);
    const h = HEMO_PROFILES['takotsubo-lvoto'];
    expect([h.gradientType, h.murmur]).toEqual(['dynamic', 'hcm']);
    const { engine } = beats('takotsubo-lvoto');
    const model = new HemoModel(engine);
    expect(model.summary(10_000).ef).toBeLessThan(50);
    expect(soundsHeard(engine, model, 10_000).murmur).toBe('hcm');
    // the pressure inside the LV runs well above the aortic pressure in late systole
    let gradient = 0;
    for (let t = 9_000; t < 11_000; t += 2) {
      const x = model.sample(t);
      gradient = Math.max(gradient, x.lvp - x.aop);
    }
    expect(gradient).toBeGreaterThan(30);
  });

  it('half credit for the right rhythm under a pattern (follow-ups 31, 39, 40, 42, 111); the wrong rhythm stays wrong', () => {
    expect(partialFor('aortic-dissection')).toEqual(['nsr', 'sinus-tach']);
    expect(partialFor('aortic-stenosis')).toEqual(['nsr']);
    expect(partialFor('hfpef')).toEqual(['nsr', 'sinus-tach']);
    expect(partialFor('pulmonary-embolism')).toEqual(['sinus-tach', 'incomplete-rbbb']);
    expect(partialFor('tamponade')).toEqual(['sinus-tach']);
    // before the angiogram an anterior STEMI read is the safe one for a Takotsubo tracing
    for (const id of ['takotsubo', 'takotsubo-lvoto']) expect(judgeRead(id, 'stemi-anterior'), id).toBe('partial');
    expect(judgeRead('tamponade', 'sinus-tach')).toBe('partial');
    expect(judgeRead('tamponade', 'nsr')).toBe('wrong');
    expect(judgeRead('pulmonary-embolism', 'afib')).toBe('wrong');
    expect(judgeRead('tamponade', 'low-voltage')).toBe('correct');
  });
});
