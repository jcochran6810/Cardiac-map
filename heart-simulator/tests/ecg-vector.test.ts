import { describe, expect, it } from 'vitest';
import { ALL_LEADS, EXTRA_LEADS, LEAD_VECTORS, frontal, leadDirection, norm, pulse, rotateAbout, rotateFrontal, type Vec3 } from '@/lib/ecg/vector';
import { add, expectVec, length } from './helpers';

describe('lead vectors (hexaxial reference system)', () => {
  it("obeys Einthoven's law: I + III = II", () => {
    expectVec(add(LEAD_VECTORS.I, LEAD_VECTORS.III), LEAD_VECTORS.II);
  });

  it('augmented leads sum to zero: aVR + aVL + aVF = 0', () => {
    expectVec(add(add(LEAD_VECTORS.aVR, LEAD_VECTORS.aVL), LEAD_VECTORS.aVF), [0, 0, 0]);
  });

  it('places lead I at 0° and lead II at +60° in the frontal plane', () => {
    expectVec(frontal(0), LEAD_VECTORS.I);
    expectVec(frontal(60), LEAD_VECTORS.II);
    expectVec(rotateFrontal(LEAD_VECTORS.I, 60), LEAD_VECTORS.II);
  });

  it('gives every lead a unit-length direction', () => {
    for (const lead of [...ALL_LEADS, ...EXTRA_LEADS]) expect(length(leadDirection(lead))).toBeCloseTo(1, 12);
  });
});

describe('vector helpers', () => {
  it('normalises to unit length and leaves the zero vector finite', () => {
    expect(length(norm([3, -4, 12]))).toBeCloseTo(1, 12);
    expect(norm([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('rotateFrontal keeps length and the anteroposterior (y) component', () => {
    const v: Vec3 = [0.3, -0.7, 0.4];
    for (const deg of [-90, -30, 15, 90, 180]) {
      const r = rotateFrontal(v, deg);
      expect(length(r)).toBeCloseTo(length(v), 12);
      expect(r[1]).toBe(v[1]);
    }
  });

  it('rotateAbout keeps length, fixes the axis and is periodic over 2π', () => {
    const v: Vec3 = [0.2, 0.5, -0.9];
    const axis: Vec3 = [1, 2, 3];
    expect(length(rotateAbout(v, axis, 1.1))).toBeCloseTo(length(v), 12);
    expectVec(rotateAbout(axis, axis, 0.8), axis);
    expectVec(rotateAbout(v, axis, 2 * Math.PI), v);
  });

  it('pulse() scales its direction to the requested magnitude', () => {
    expect(length(pulse(40, 10, [1, 1, 0], 1.7).v)).toBeCloseTo(1.7, 12);
  });
});
