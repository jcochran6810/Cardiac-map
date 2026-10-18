/**
 * Mannequin torso for the electrode lab, and where the ten ECG electrodes sit on it.
 *
 * Frame (same axes as the 3D heart's world frame): +x patient's LEFT, +y SUPERIOR, +z ANTERIOR.
 * Units: the torso is about 1.26 tall from the pelvis to the base of the neck (1 unit ≈ 40 cm).
 *
 * Each horizontal cross-section is a superellipse with half-width a(y) and half-depth b(y),
 * interpolated smoothly between the profile key frames. Electrodes are placed on that exact
 * surface, so they always sit on the skin whatever the profile.
 *
 * Limb electrodes use torso (Mason–Likar) sites: RA / LA in the infraclavicular fossae near the
 * shoulders, LL / RL on the lower abdomen. This is how monitoring, EMS and cath-lab ECGs are
 * usually recorded; a resting diagnostic 12-lead places them on the limbs.
 */
import type { Electrode } from '@/lib/ecg/electrodes';

export type P3 = [number, number, number];

/** [height y, half-width a, half-depth b] from the pelvis up to the base of the neck */
const PROFILE: [number, number, number][] = [
  [-0.62, 0.33, 0.2],
  [-0.48, 0.36, 0.215],
  [-0.32, 0.325, 0.2],
  [-0.16, 0.3, 0.19],
  [0.0, 0.315, 0.2],
  [0.16, 0.35, 0.215],
  [0.3, 0.365, 0.22],
  [0.42, 0.375, 0.2],
  [0.5, 0.385, 0.17],
  [0.56, 0.3, 0.135],
  [0.605, 0.17, 0.105],
  [0.64, 0.085, 0.08],
];

export const TORSO_BOTTOM = PROFILE[0][0];
export const TORSO_TOP = PROFILE[PROFILE.length - 1][0];
/** Superellipse exponent: 2 is an ellipse, higher is boxier */
const EXPONENT = 2.5;

/** Catmull–Rom interpolation of the profile at height y */
export function profileAt(y: number): { a: number; b: number } {
  const n = PROFILE.length;
  const yy = Math.min(TORSO_TOP, Math.max(TORSO_BOTTOM, y));
  let i = 0;
  while (i < n - 2 && PROFILE[i + 1][0] < yy) i++;
  const p0 = PROFILE[Math.max(0, i - 1)];
  const p1 = PROFILE[i];
  const p2 = PROFILE[i + 1];
  const p3 = PROFILE[Math.min(n - 1, i + 2)];
  const t = (yy - p1[0]) / (p2[0] - p1[0]);
  const cr = (k: 1 | 2) => {
    const v0 = p0[k], v1 = p1[k], v2 = p2[k], v3 = p3[k];
    return 0.5 * (2 * v1 + (-v0 + v2) * t + (2 * v0 - 5 * v1 + 4 * v2 - v3) * t * t + (-v0 + 3 * v1 - 3 * v2 + v3) * t ** 3);
  };
  return { a: cr(1), b: cr(2) };
}

const spow = (v: number, e: number) => Math.sign(v) * Math.abs(v) ** e;

/** Surface point at height y and angle θ (0 = patient's left side, π/2 = front, π = right side) */
export function surfacePoint(y: number, theta: number): P3 {
  const { a, b } = profileAt(y);
  const e = 2 / EXPONENT;
  return [a * spow(Math.cos(theta), e), y, b * spow(Math.sin(theta), e)];
}

/** Outward unit normal at (y, θ), from the surface's tangents */
export function surfaceNormal(y: number, theta: number): P3 {
  const h = 1e-3;
  const p = surfacePoint(y, theta);
  const pt = surfacePoint(y, theta + h);
  const py = surfacePoint(y + h, theta);
  const tu: P3 = [pt[0] - p[0], pt[1] - p[1], pt[2] - p[2]];
  const tv: P3 = [py[0] - p[0], py[1] - p[1], py[2] - p[2]];
  // tv × tu points outward for θ increasing anticlockwise seen from above
  const n: P3 = [tv[1] * tu[2] - tv[2] * tu[1], tv[2] * tu[0] - tv[0] * tu[2], tv[0] * tu[1] - tv[1] * tu[0]];
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / l, n[1] / l, n[2] / l];
}

/** Angle θ on the front of the torso (0..π) where the surface reaches the given x at height y */
export function frontTheta(y: number, x: number): number {
  let lo = 0;
  let hi = Math.PI;
  // x(θ) falls monotonically from +a to −a across the front
  for (let k = 0; k < 50; k++) {
    const mid = (lo + hi) / 2;
    if (surfacePoint(y, mid)[0] > x) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export interface ElectrodeSite3D {
  pos: P3;
  normal: P3;
}

// Landmarks on this torso: sternum at x = 0, 4th intercostal space ≈ y 0.215, 5th ≈ y 0.135
const ICS4 = 0.215;
const ICS5 = 0.135;
const front = (y: number, x: number): ElectrodeSite3D => {
  const th = frontTheta(y, x);
  return { pos: surfacePoint(y, th), normal: surfaceNormal(y, th) };
};
const around = (y: number, thetaDeg: number): ElectrodeSite3D => {
  const th = (thetaDeg * Math.PI) / 180;
  return { pos: surfacePoint(y, th), normal: surfaceNormal(y, th) };
};

const v2 = front(ICS4, 0.05);
const v4 = front(ICS5, 0.17);

export const ELECTRODE_SITES_3D: Record<Electrode, ElectrodeSite3D> = {
  RA: front(0.45, -0.27),
  LA: front(0.45, 0.27),
  RL: front(-0.28, -0.25),
  LL: front(-0.28, 0.25),
  V1: front(ICS4, -0.05),
  V2: v2,
  // midway between V2 and V4, projected back onto the skin
  V3: front((v2.pos[1] + v4.pos[1]) / 2, (v2.pos[0] + v4.pos[0]) / 2),
  V4: v4,
  V5: around(ICS5, 38), // anterior axillary line
  V6: around(ICS5, 4), // midaxillary line
};

/** Heart centre inside the torso: behind the sternum, a little to the left */
export const HEART_IN_TORSO: P3 = [0.045, 0.2, 0.03];
/** Scale applied to the heart model (2 units long) so it is about fist-sized in the torso */
export const HEART_SCALE_IN_TORSO = 0.13;
