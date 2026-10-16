import { describe, expect, it } from 'vitest';
import { CONDITION_TO_PROFILE, ECG_PROFILES, PROFILE_ALIASES, P_TEMPLATES, QRS_TEMPLATES, prForRate, qtForRR, resolveProfile } from '@/lib/ecg/profiles';
import { HEMO_PROFILES } from '@/lib/physiology/hemodynamics';

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

  it('gives pulseless rhythms no cardiac output', () => {
    expect(ECG_PROFILES.vf.hemo).toBe('no-output');
    expect(ECG_PROFILES.asystole.hemo).toBe('no-output');
  });
});
