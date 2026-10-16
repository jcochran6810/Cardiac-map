/**
 * Cardiac dipole (vectorcardiographic) model.
 *
 * Body frame matches the 3D heart model:
 *   +x = patient's LEFT, +y = POSTERIOR (−y anterior), +z = SUPERIOR (−z inferior)
 *
 * Every wave (P, QRS, ST injury, T) is described as a set of time-varying dipole
 * components. The voltage seen by a lead is the dot product of the dipole with
 * that lead's axis vector. This means lead relationships (Einthoven's law,
 * aVR being negative, R-wave progression, reciprocal ST depression opposite an
 * injury current) emerge automatically instead of being hand-coded per lead.
 */

export type Vec3 = [number, number, number];

export const ALL_LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'] as const;
export const EXTRA_LEADS = ['V4R', 'V7', 'V8', 'V9'] as const;
export type StandardLead = (typeof ALL_LEADS)[number];
export type ExtraLead = (typeof EXTRA_LEADS)[number];
export type AnyLead = StandardLead | ExtraLead;

export function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

export function scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Direction from a frontal-plane angle (degrees, 0° = patient's left, +90° = inferior) plus a posterior component */
export function frontal(angleDeg: number, posterior = 0): Vec3 {
  const a = (angleDeg * Math.PI) / 180;
  return [Math.cos(a), posterior, -Math.sin(a)];
}

/** Precordial electrode direction: horizontal angle (0° = left/V6, 90° = straight anterior), with a small inferior tilt */
function precordial(angleDeg: number, inferiorTilt: number): Vec3 {
  const a = (angleDeg * Math.PI) / 180;
  return [Math.cos(a), -Math.sin(a), -inferiorTilt];
}

const I: Vec3 = [1, 0, 0];
const II: Vec3 = frontal(60);
const III: Vec3 = [II[0] - I[0], II[1] - I[1], II[2] - I[2]];

/**
 * Lead vectors. Augmented leads are derived exactly from I/II/III
 * (aVR = −(I+II)/2, aVL = (I−III)/2, aVF = (II+III)/2). Precordial leads get
 * extra gain because the electrodes sit close to the heart.
 */
export const LEAD_VECTORS: Record<AnyLead, Vec3> = {
  I,
  II,
  III,
  aVR: scale([I[0] + II[0], I[1] + II[1], I[2] + II[2]], -0.5),
  aVL: scale([I[0] - III[0], I[1] - III[1], I[2] - III[2]], 0.5),
  aVF: scale([II[0] + III[0], II[1] + III[1], II[2] + III[2]], 0.5),
  V1: scale(precordial(115, 0.0), 1.25),
  V2: scale(precordial(94, 0.0), 1.6),
  V3: scale(precordial(75, 0.05), 1.6),
  V4: scale(precordial(60, 0.15), 1.5),
  V5: scale(precordial(30, 0.2), 1.3),
  V6: scale(precordial(0, 0.2), 0.95),
  V4R: scale(precordial(140, 0.15), 1.1),
  V7: scale(precordial(-30, 0.2), 1.0),
  V8: scale(precordial(-55, 0.2), 0.95),
  V9: scale(precordial(-75, 0.2), 0.9),
};

/** Unit direction of each lead's positive pole (for drawing lead axes in 3D) */
export function leadDirection(lead: AnyLead): Vec3 {
  return norm(LEAD_VECTORS[lead]);
}

/** Lead groupings for territory teaching */
export const LEAD_GROUPS: Record<string, StandardLead[]> = {
  inferior: ['II', 'III', 'aVF'],
  lateral: ['I', 'aVL', 'V5', 'V6'],
  highLateral: ['I', 'aVL'],
  septal: ['V1', 'V2'],
  anterior: ['V3', 'V4'],
};

/** A Gaussian-in-time dipole pulse */
export interface DipolePulse {
  /** centre time (ms) relative to the wave's anchor */
  t: number;
  /** Gaussian sigma (ms) */
  w: number;
  /** dipole vector, mV */
  v: Vec3;
  /** optional different sigma after the peak (asymmetric waves such as T) */
  w2?: number;
}

export function pulse(t: number, w: number, dir: Vec3, magnitude: number, w2?: number): DipolePulse {
  return { t, w, v: scale(norm(dir), magnitude), w2 };
}

/** Rotate a vector about the y (anteroposterior) axis — used for axis deviation */
export function rotateFrontal(v: Vec3, degrees: number): Vec3 {
  const a = (degrees * Math.PI) / 180;
  // positive degrees rotate toward inferior (clockwise in standard hexaxial view)
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

/** Rotate a vector about an arbitrary unit axis (Rodrigues) */
export function rotateAbout(v: Vec3, axis: Vec3, radians: number): Vec3 {
  const k = norm(axis);
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const kv = dot(k, v);
  const cross: Vec3 = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
  return [
    v[0] * c + cross[0] * s + k[0] * kv * (1 - c),
    v[1] * c + cross[1] * s + k[1] * kv * (1 - c),
    v[2] * c + cross[2] * s + k[2] * kv * (1 - c),
  ];
}
