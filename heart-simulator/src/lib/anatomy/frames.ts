/**
 * Coordinate frames used by the 3D scene.
 *
 * model frame : +x patient's left, +y posterior, +z superior   (GLB files, landmarks)
 * body frame  : same axes as the model frame but WITHOUT the anatomical tilt (ECG lead vectors)
 * world frame : +x patient's left, +y superior, +z anterior (towards the viewer)  — three.js Y-up
 *
 * The heart is tilted into its anatomical position (apex pointing left, inferior and anterior),
 * which places the long axis at about +60° in the frontal plane — the normal QRS axis.
 */
import * as THREE from 'three';
import type { V3 } from './landmarks';

export const FRAME_EULER = new THREE.Euler(-Math.PI / 2, 0, 0);
export const TILT_EULER = new THREE.Euler(-0.2, 0, 0.38);

const FRAME = new THREE.Matrix4().makeRotationFromEuler(FRAME_EULER);
const MODEL_TO_WORLD = new THREE.Matrix4().makeRotationFromEuler(TILT_EULER).multiply(FRAME);

export function modelToWorld(v: V3 | THREE.Vector3): THREE.Vector3 {
  const p = v instanceof THREE.Vector3 ? v.clone() : new THREE.Vector3(v[0], v[1], v[2]);
  return p.applyMatrix4(MODEL_TO_WORLD);
}

/** Body-frame vector (ECG dipole / lead axis) → world direction */
export function bodyToWorld(v: V3 | [number, number, number]): THREE.Vector3 {
  return new THREE.Vector3(v[0], v[1], v[2]).applyMatrix4(FRAME);
}
