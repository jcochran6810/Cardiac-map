import { expect } from 'vitest';
import type { Vec3 } from '@/lib/ecg/vector';

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const length = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);

/** Component-wise equality within floating-point noise */
export function expectVec(actual: Vec3, expected: Vec3, digits = 9) {
  actual.forEach((x, i) => expect(x).toBeCloseTo(expected[i], digits));
}
