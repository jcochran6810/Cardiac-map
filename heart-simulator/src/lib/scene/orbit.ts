/**
 * How the 3D heart turns under the pointer and the rotate buttons.
 *
 * The camera orbits the heart (three.js OrbitControls, world +y superior). These helpers keep that feeling the
 * same on every device: a drag turns the heart the same number of degrees per pixel on any screen size, the
 * smoothing settles in the same time at any frame rate, a press that moves is never mistaken for a click, and
 * the buttons turn the heart exactly the way a drag in that direction would.
 */
import * as THREE from 'three';

/** Degrees the heart turns per CSS pixel dragged (a finger moves less precisely than a mouse) */
export const DEG_PER_PX = { mouse: 0.4, touch: 0.5 } as const;

/** OrbitControls turns 2π × rotateSpeed per element height dragged; the rotateSpeed that gives `degPerPx` */
export function rotateSpeedFor(degPerPx: number, elementHeight: number): number {
  return (degPerPx * Math.max(1, elementHeight)) / 360;
}

/** Share of the remaining motion applied per 60 fps frame: the heart follows the pointer closely, without a jolt */
export const DAMPING_PER_FRAME = 0.25;

/** OrbitControls' dampingFactor for a frame lasting `dt` seconds, so slow devices settle as quickly as fast ones */
export function dampingFor(dt: number, perFrame = DAMPING_PER_FRAME): number {
  if (!(dt > 0)) return perFrame;
  return Math.min(1, 1 - (1 - perFrame) ** (Math.min(dt, 0.25) * 60));
}

/** Auto-rotate speed: one turn every 24 s */
export const AUTO_ROTATE_DEG_PER_S = 15;

/** OrbitControls auto-rotates autoRotateSpeed × 2π / 3600 per update; the value that turns `degPerSec` in `dt` */
export function autoRotateSpeedFor(degPerSec: number, dt: number): number {
  return 10 * degPerSec * frameTime(dt);
}

/** A frame's duration for motion that runs on its own, capped so a stall (or a hidden tab) can't make it jump */
export function frameTime(dt: number): number {
  return Math.min(Math.max(dt, 0), 0.25);
}

/** Stay this far (radians) off straight above / below, where a sideways drag would only spin the picture */
export const POLAR_MARGIN = 0.15;

/** How far the pivot may be panned from the heart's centre (world units; the heart is about 1.2 × 2 units) */
export const PAN_RADIUS = 0.6;

/** A press that travels further than this (CSS px) is a drag, not a click; fingers wobble more than a mouse */
export function clickSlop(pointerType: string): number {
  return pointerType === 'mouse' ? 5 : 10;
}

/** Tells a click from a drag by the whole distance the press travelled, not just where it ended */
export class PressTracker {
  travel = 0;
  pointers = 0;
  pointerType = 'mouse';
  private x = 0;
  private y = 0;

  /** `primary` marks the first pointer of a gesture: it always starts a new press, even if an earlier release was missed */
  down(x: number, y: number, pointerType: string, primary = true) {
    if (primary) this.pointers = 0;
    if (this.pointers === 0) {
      this.travel = 0;
      this.pointerType = pointerType;
    } else {
      this.travel = Infinity; // a second finger: pinch or two-finger drag, never a click
    }
    this.pointers++;
    this.x = x;
    this.y = y;
  }

  move(x: number, y: number) {
    if (this.pointers === 0) return;
    this.travel += Math.hypot(x - this.x, y - this.y);
    this.x = x;
    this.y = y;
  }

  up() {
    this.pointers = Math.max(0, this.pointers - 1);
  }

  /** The current (or last) press moved too far to count as a click */
  get dragged(): boolean {
    return this.travel > clickSlop(this.pointerType);
  }
}

/** One tap of a rotate button turns the heart 30°; holding one keeps turning it at 60° a second */
export const TURN_STEP = Math.PI / 6;
export const TURN_RATE = Math.PI / 3;

export type TurnDirection = 'left' | 'right' | 'up' | 'down';

/** A rotate button's turn as [around the vertical axis (+ = right), over the top (+ = up)], in units of a step */
export const TURN_AXES: Record<TurnDirection, [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, 1],
  down: [0, -1],
};

/**
 * The camera's offset from the pivot after turning the heart as a drag would: `dTheta` around the vertical axis
 * (+ = the heart turns right, as when dragged to the right) and `dPhi` over the top (+ = the front of the heart
 * turns up, as when dragged upwards). The polar angle stays within the margins OrbitControls keeps.
 */
export function turnOffset(offset: THREE.Vector3, dTheta: number, dPhi: number): THREE.Vector3 {
  const s = new THREE.Spherical().setFromVector3(offset);
  s.theta -= dTheta;
  s.phi = THREE.MathUtils.clamp(s.phi + dPhi, POLAR_MARGIN, Math.PI - POLAR_MARGIN);
  return new THREE.Vector3().setFromSpherical(s);
}

/** Pull a panned pivot back within `radius` of the centre; returns the correction to apply to pivot and camera alike */
export function panCorrection(target: THREE.Vector3, center: THREE.Vector3, radius = PAN_RADIUS): THREE.Vector3 | null {
  const off = target.clone().sub(center);
  const len = off.length();
  if (len <= radius) return null;
  return off.multiplyScalar(radius / len - 1);
}
