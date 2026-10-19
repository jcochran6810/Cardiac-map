import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';
import {
  AUTO_ROTATE_DEG_PER_S, DAMPING_PER_FRAME, DEG_PER_PX, PAN_RADIUS, POLAR_MARGIN, PressTracker, TURN_AXES, TURN_STEP,
  autoRotateSpeedFor, dampingFor, panCorrection, rotateSpeedFor, turnOffset,
} from '@/lib/scene/orbit';
import { useSceneStore } from '@/store/useSceneStore';

type Listener = (e: unknown) => void;

/** Just enough of a DOM element for OrbitControls to listen to pointer events in a Node test */
function fakeElement(height: number) {
  const on: Record<string, Listener[]> = {};
  const docOn: Record<string, Listener[]> = {};
  const add = (map: Record<string, Listener[]>) => (type: string, f: Listener) => { (map[type] ??= []).push(f); };
  const remove = (map: Record<string, Listener[]>) => (type: string, f: Listener) => { map[type] = (map[type] ?? []).filter((g) => g !== f); };
  const ownerDocument = { addEventListener: add(docOn), removeEventListener: remove(docOn) };
  const el = {
    style: {} as Record<string, string>,
    clientHeight: height,
    clientWidth: height * 1.5,
    ownerDocument,
    addEventListener: add(on),
    removeEventListener: remove(on),
    setPointerCapture() {},
    releasePointerCapture() {},
  };
  const mouse = (x: number, y: number) => ({ pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: y, pageX: x, pageY: y, preventDefault() {} });
  /** a left-button drag of (dx, dy) pixels in `steps` moves */
  const drag = (dx: number, dy: number, steps = 10) => {
    on.pointerdown?.forEach((f) => f(mouse(0, 0)));
    for (let i = 1; i <= steps; i++) docOn.pointermove?.forEach((f) => f(mouse((dx * i) / steps, (dy * i) / steps)));
    docOn.pointerup?.forEach((f) => f(mouse(dx, dy)));
  };
  return { el, drag };
}

/** OrbitControls on a camera 3.7 units in front of the origin, connected to a fake canvas `height` px tall */
function controlsFor(height: number) {
  const camera = new THREE.PerspectiveCamera(38, 1.5, 0.05, 50);
  camera.position.set(0, 0, 3.7);
  const { el, drag } = fakeElement(height);
  const controls = new OrbitControls(camera, el as unknown as HTMLElement);
  controls.update();
  return { camera, controls, drag };
}

const azimuth = (v: THREE.Vector3) => new THREE.Spherical().setFromVector3(v).theta;
const polar = (v: THREE.Vector3) => new THREE.Spherical().setFromVector3(v).phi;
const deg = (r: number) => (r * 180) / Math.PI;

describe('drag speed', () => {
  it('turns the heart the same degrees per pixel on a phone, a laptop and a large screen', () => {
    for (const h of [200, 389, 514, 900, 1400]) {
      const { camera, controls, drag } = controlsFor(h);
      controls.rotateSpeed = rotateSpeedFor(DEG_PER_PX.mouse, h);
      drag(100, 0);
      expect(Math.abs(deg(azimuth(camera.position)))).toBeCloseTo(100 * DEG_PER_PX.mouse, 4);
    }
  });

  it('a finger turns it a little further per pixel than a mouse, and both stay controllable', () => {
    expect(DEG_PER_PX.touch).toBeGreaterThan(DEG_PER_PX.mouse);
    // a full-width swipe on a phone is about half a turn, not several turns
    expect(390 * DEG_PER_PX.touch).toBeGreaterThan(150);
    expect(390 * DEG_PER_PX.touch).toBeLessThan(270);
  });
});

describe('smoothing', () => {
  it('is the 60 fps value at 60 fps', () => {
    expect(dampingFor(1 / 60)).toBeCloseTo(DAMPING_PER_FRAME, 6);
  });

  it('settles in the same time at any frame rate', () => {
    const remainingAfter = (fps: number, seconds: number) => (1 - dampingFor(1 / fps)) ** Math.round(fps * seconds);
    for (const fps of [15, 20, 30, 120]) expect(remainingAfter(fps, 0.2)).toBeCloseTo(remainingAfter(60, 0.2), 6);
    // at 60 fps the heart has caught up with the pointer within a fifth of a second
    expect(remainingAfter(60, 0.2)).toBeLessThan(0.05);
  });

  it('never exceeds 1 and survives odd frame times', () => {
    expect(dampingFor(5)).toBeLessThanOrEqual(1);
    expect(dampingFor(-1)).toBe(DAMPING_PER_FRAME);
    expect(dampingFor(0)).toBe(DAMPING_PER_FRAME);
  });
});

describe('auto-rotate', () => {
  it(`turns ${AUTO_ROTATE_DEG_PER_S}° a second whatever the frame rate`, () => {
    for (const fps of [5, 20, 30, 60, 144]) {
      const { camera, controls } = controlsFor(500);
      controls.autoRotate = true;
      for (let i = 0; i < fps; i++) {
        controls.autoRotateSpeed = autoRotateSpeedFor(AUTO_ROTATE_DEG_PER_S, 1 / fps);
        controls.update();
      }
      expect(Math.abs(deg(azimuth(camera.position)))).toBeCloseTo(AUTO_ROTATE_DEG_PER_S, 3);
    }
  });
});

describe('click or drag', () => {
  it('a still press is a click; a press that moved is a drag even if it came back to where it started', () => {
    const p = new PressTracker();
    p.down(100, 100, 'mouse');
    p.move(102, 101);
    p.up();
    expect(p.dragged).toBe(false);

    p.down(100, 100, 'mouse');
    for (const x of [115, 130, 115, 101]) p.move(x, 100);
    p.up();
    expect(p.dragged).toBe(true); // ends 1 px from the start, but it turned the heart
  });

  it('a finger may wobble more than a mouse before a tap becomes a drag', () => {
    const p = new PressTracker();
    p.down(50, 50, 'touch');
    p.move(57, 50);
    expect(p.dragged).toBe(false);
    p.down(50, 50, 'mouse');
    p.move(57, 50);
    expect(p.dragged).toBe(true);
  });

  it('a second finger (pinch) is never a tap, and a missed release cannot block the next tap', () => {
    const p = new PressTracker();
    p.down(10, 10, 'touch', true);
    p.down(80, 80, 'touch', false);
    expect(p.dragged).toBe(true);
    p.up();
    expect(p.pointers).toBe(1); // one release was lost
    p.down(10, 10, 'touch', true);
    p.up();
    expect(p.pointers).toBe(0);
    expect(p.dragged).toBe(false);
  });
});

describe('rotate buttons', () => {
  const start = new THREE.Vector3(0, 0, 3.7);

  it('each arrow turns the heart the way a drag in that direction does', () => {
    for (const [dir, [dx, dy]] of [['right', [80, 0]], ['left', [-80, 0]], ['up', [0, -80]], ['down', [0, 80]]] as const) {
      const { camera, controls, drag } = controlsFor(500);
      controls.rotateSpeed = rotateSpeedFor(DEG_PER_PX.mouse, 500);
      drag(dx, dy);
      const [a, b] = TURN_AXES[dir];
      const byButton = turnOffset(start, a * TURN_STEP, b * TURN_STEP);
      expect(Math.sign(azimuth(byButton))).toBe(Math.sign(Math.round(azimuth(camera.position) * 1e6)));
      expect(Math.sign(Math.round((polar(byButton) - Math.PI / 2) * 1e6))).toBe(Math.sign(Math.round((polar(camera.position) - Math.PI / 2) * 1e6)));
    }
  });

  it('a step is 30°, keeps the distance, and twelve steps come back round', () => {
    let v = start.clone();
    const first = turnOffset(v, TURN_STEP, 0);
    expect(deg(v.angleTo(first))).toBeCloseTo(30, 6);
    expect(first.length()).toBeCloseTo(3.7, 6);
    for (let i = 0; i < 12; i++) v = turnOffset(v, TURN_STEP, 0);
    expect(v.distanceTo(start)).toBeLessThan(1e-9);
  });

  it('stops short of straight above and below, like dragging does', () => {
    let v = start.clone();
    for (let i = 0; i < 10; i++) v = turnOffset(v, 0, -TURN_STEP);
    expect(polar(v)).toBeCloseTo(POLAR_MARGIN, 6);
    for (let i = 0; i < 20; i++) v = turnOffset(v, 0, TURN_STEP);
    expect(polar(v)).toBeCloseTo(Math.PI - POLAR_MARGIN, 6);
  });

  it('a tap queues a 30° step and a hold sets a steady turn; release stops it', () => {
    const s = useSceneStore.getState();
    const before = s.turn?.nonce ?? 0;
    s.turnHeart('left');
    s.turnHeart('left');
    const t = useSceneStore.getState().turn!;
    expect(t.nonce).toBe(before + 2); // two quick taps are two steps
    expect(t.dTheta).toBeCloseTo(-TURN_STEP, 9);
    s.spinHeart('up');
    expect(useSceneStore.getState().spin!.dPhi).toBeGreaterThan(0);
    s.spinHeart(null);
    expect(useSceneStore.getState().spin).toBeNull();
  });
});

describe('selection and the camera', () => {
  it('picking a part on the heart does not move the camera; opening one from the library does', () => {
    const s = useSceneStore.getState();
    const n = s.focusNonce;
    s.selectStructure('left-atrium', false);
    expect(useSceneStore.getState().focusNonce).toBe(n);
    s.selectStructure('left-atrium');
    expect(useSceneStore.getState().focusNonce).toBe(n + 1);
    s.selectStructure(null);
  });
});

describe('pan limit', () => {
  const center = new THREE.Vector3(0.1, 0.2, 0);

  it('leaves a pivot on the heart alone', () => {
    expect(panCorrection(center.clone().add(new THREE.Vector3(0.3, 0, 0)), center)).toBeNull();
  });

  it('brings a pivot panned off the heart back to the edge of the allowed radius', () => {
    const t = center.clone().add(new THREE.Vector3(0, 2, 0));
    t.add(panCorrection(t, center)!);
    expect(t.distanceTo(center)).toBeCloseTo(PAN_RADIUS, 9);
  });
});
