import { describe, expect, it } from 'vitest';
import { AHA17, WALL_LEADS, wallOf } from '@/lib/anatomy/aha17';
import { CONDUCTION_IDS, CORONARY_IDS, structureCategory } from '@/lib/anatomy/categories';
import { LANDMARKS, LANDMARK_BY_ID, PROFILE_TERRITORY, TERRITORY_STRUCTURES } from '@/lib/anatomy/landmarks';
import { VENT_PATTERNS, ventPatternKey } from '@/lib/anatomy/activation';
import { ECG_PROFILES, QRS_TEMPLATES } from '@/lib/ecg/profiles';

describe('AHA 17-segment model', () => {
  it('numbers segments 1–17 exactly once', () => {
    expect(AHA17.map((s) => s.n).sort((a, b) => a - b)).toEqual(Array.from({ length: 17 }, (_, i) => i + 1));
  });

  it('assigns 7 segments to the LAD, 5 to the RCA and 5 to the LCx (Cerqueira 2002)', () => {
    const count = (t: string) => AHA17.filter((s) => s.territory === t).length;
    expect([count('LAD'), count('RCA'), count('LCx')]).toEqual([7, 5, 5]);
  });

  it('covers a full 360° in each ring', () => {
    for (const level of ['basal', 'mid', 'apical'] as const) {
      const span = AHA17.filter((s) => s.level === level).reduce((sum, s) => sum + (s.a1 - s.a0), 0);
      expect(span).toBe(360);
    }
  });

  it('links every segment to the ECG leads facing its wall', () => {
    for (const seg of AHA17) expect(WALL_LEADS[wallOf(seg)], seg.name).toBeDefined();
  });
});

describe('structure catalogue', () => {
  it('keeps coronary and conduction structures separate and categorised', () => {
    expect(CORONARY_IDS.filter((id) => CONDUCTION_IDS.includes(id))).toEqual([]);
    for (const id of CORONARY_IDS) expect(structureCategory(id)).toBe('coronary');
    for (const id of CONDUCTION_IDS) expect(structureCategory(id)).toBe('conduction');
    expect(structureCategory('left-ventricle')).toBe('anatomy');
  });

  it('has a unique 3D landmark for every coronary and conduction structure', () => {
    expect(new Set(LANDMARKS.map((l) => l.id)).size).toBe(LANDMARKS.length);
    for (const id of [...CORONARY_IDS, ...CONDUCTION_IDS]) expect(LANDMARK_BY_ID[id], id).toBeDefined();
  });

  it('only uses coronary structures for perfusion territories, and real rhythms for culprit lesions', () => {
    for (const ids of Object.values(TERRITORY_STRUCTURES)) for (const id of ids) expect(CORONARY_IDS).toContain(id);
    for (const profile of Object.keys(PROFILE_TERRITORY)) expect(ECG_PROFILES[profile], profile).toBeDefined();
  });
});

describe('activation map patterns', () => {
  it('has an activation pattern for every conducted QRS type', () => {
    const conductions = Object.values(QRS_TEMPLATES).map((q) => q.conduction ?? 'normal');
    for (const c of conductions) if (c !== 'ectopic') expect(ventPatternKey(c, 'conducted')).toBe(c);
  });

  it('falls back sensibly: torsades has no map, unknown ectopy maps as a PVC, unknown conduction as normal', () => {
    expect(ventPatternKey('ectopic', 'torsades')).toBeNull();
    expect(ventPatternKey('ectopic', 'mystery')).toBe('pvc');
    expect(ventPatternKey('mystery', 'conducted')).toBe('normal');
    expect(VENT_PATTERNS.normal).toBeDefined();
  });
});
