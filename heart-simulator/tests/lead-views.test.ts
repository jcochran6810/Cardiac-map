import { describe, expect, it } from 'vitest';
import { ALL_LEADS } from '@/lib/ecg/vector';
import { ELECTRODES } from '@/lib/ecg/electrodes';
import { LEAD_VIEWS, describePoles, isBipolar, leadForElectrode } from '@/lib/ecg/leadViews';
import {
  ELECTRODE_SITES_3D, HEART_IN_TORSO, TORSO_BOTTOM, TORSO_TOP, profileAt, surfacePoint,
} from '@/lib/anatomy/torso';

describe('lead views', () => {
  it('describes every standard lead', () => {
    for (const l of ALL_LEADS) {
      expect(LEAD_VIEWS[l].wall.length).toBeGreaterThan(3);
      expect(LEAD_VIEWS[l].artery.length).toBeGreaterThan(2);
    }
  });

  it('groups contiguous leads by wall', () => {
    for (const l of ['II', 'III', 'aVF'] as const) expect(LEAD_VIEWS[l].wall).toMatch(/Inferior/);
    for (const l of ['I', 'aVL'] as const) expect(LEAD_VIEWS[l].wall).toMatch(/High lateral/);
    for (const l of ['V5', 'V6'] as const) expect(LEAD_VIEWS[l].wall).toMatch(/Low lateral/);
    for (const l of ['V1', 'V2'] as const) expect(LEAD_VIEWS[l].wall).toMatch(/Septum/);
    for (const l of ['V3', 'V4'] as const) expect(LEAD_VIEWS[l].wall).toMatch(/Anterior/);
  });

  it('uses the Einthoven poles for the bipolar limb leads', () => {
    expect([LEAD_VIEWS.I.positive, LEAD_VIEWS.I.negative]).toEqual(['LA', 'RA']);
    expect([LEAD_VIEWS.II.positive, LEAD_VIEWS.II.negative]).toEqual(['LL', 'RA']);
    expect([LEAD_VIEWS.III.positive, LEAD_VIEWS.III.negative]).toEqual(['LL', 'LA']);
    expect(ALL_LEADS.filter(isBipolar)).toEqual(['I', 'II', 'III']);
    expect(describePoles('I')).toBe('LA (+) against RA (−)');
    expect(describePoles('V1')).toMatch(/Wilson central terminal/);
  });

  it('maps a tapped electrode to the lead it explores; the right leg is ground', () => {
    expect(leadForElectrode('RA')).toBe('aVR');
    expect(leadForElectrode('LA')).toBe('aVL');
    expect(leadForElectrode('LL')).toBe('aVF');
    expect(leadForElectrode('RL')).toBeNull();
    expect(leadForElectrode('V4')).toBe('V4');
  });
});

describe('mannequin electrode placement', () => {
  const S = ELECTRODE_SITES_3D;

  it('puts every electrode on the skin, facing outward', () => {
    for (const e of ELECTRODES) {
      const { pos, normal } = S[e];
      const { a, b } = profileAt(pos[1]);
      // superellipse equation |x/a|^n + |z/b|^n = 1 (n = 2.5)
      const f = Math.abs(pos[0] / a) ** 2.5 + Math.abs(pos[2] / b) ** 2.5;
      expect(f).toBeCloseTo(1, 3);
      // the normal points away from the body's long axis
      expect(normal[0] * pos[0] + normal[2] * pos[2]).toBeGreaterThan(0);
      expect(Math.hypot(...normal)).toBeCloseTo(1, 6);
    }
  });

  it('uses torso (Mason–Likar) sites: arms on the upper chest near the shoulders, legs on the lower abdomen', () => {
    for (const e of ['RA', 'LA'] as const) {
      expect(S[e].pos[1]).toBeGreaterThan(0.38);
      expect(S[e].pos[2]).toBeGreaterThan(0); // front of the body
    }
    for (const e of ['RL', 'LL'] as const) {
      expect(S[e].pos[1]).toBeLessThan(-0.15);
      expect(S[e].pos[1]).toBeGreaterThan(TORSO_BOTTOM);
      expect(S[e].pos[2]).toBeGreaterThan(0);
    }
    // patient's right is −x
    expect(S.RA.pos[0]).toBeLessThan(0);
    expect(S.LA.pos[0]).toBeGreaterThan(0);
    expect(S.RL.pos[0]).toBeLessThan(0);
    expect(S.LL.pos[0]).toBeGreaterThan(0);
  });

  it('places the precordial electrodes in order around the left chest', () => {
    expect(S.V1.pos[0]).toBeLessThan(0); // right sternal border
    expect(S.V2.pos[0]).toBeGreaterThan(0); // left sternal border
    expect(S.V1.pos[1]).toBeCloseTo(S.V2.pos[1], 6); // same intercostal space
    // V4–V6 on one horizontal line, one space lower than V1/V2
    expect(S.V5.pos[1]).toBeCloseTo(S.V4.pos[1], 6);
    expect(S.V6.pos[1]).toBeCloseTo(S.V4.pos[1], 6);
    expect(S.V4.pos[1]).toBeLessThan(S.V2.pos[1]);
    // V3 between V2 and V4
    expect(S.V3.pos[0]).toBeGreaterThan(S.V2.pos[0]);
    expect(S.V3.pos[0]).toBeLessThan(S.V4.pos[0]);
    // moving round to the side: V6 is the most lateral and the least anterior
    const order = ['V2', 'V3', 'V4', 'V5', 'V6'] as const;
    for (let i = 1; i < order.length; i++) expect(S[order[i]].pos[0]).toBeGreaterThan(S[order[i - 1]].pos[0]);
    expect(S.V6.pos[2]).toBeLessThan(S.V5.pos[2]);
    expect(Math.abs(S.V6.pos[2])).toBeLessThan(0.06);
  });

  it('keeps the heart inside the chest, behind the sternum and left of the midline', () => {
    const [x, y, z] = HEART_IN_TORSO;
    const { a, b } = profileAt(y);
    expect(Math.abs(x / a) ** 2.5 + Math.abs(z / b) ** 2.5).toBeLessThan(0.3);
    expect(x).toBeGreaterThan(0);
    expect(y).toBeGreaterThan(S.V4.pos[1]);
    expect(y).toBeLessThan(TORSO_TOP);
    expect(surfacePoint(y, Math.PI / 2)[2]).toBeGreaterThan(z);
  });
});
