import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';
import {
  AUTO_ROTATE_DEG_PER_S, DAMPING_PER_FRAME, DEG_PER_PX, HEART_WIDTH, MOUSE_BUTTONS, PAN_RADIUS, PressTracker, TOUCHES,
  autoRotateSpeedFor, dampingFor, fitDistance, panCorrection, rotateSpeedFor,
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
  /** raw events: `down` and `wheel` on the element, `move` and `up` on the document (as OrbitControls listens) */
  const fire = {
    down: (e: unknown) => on.pointerdown?.forEach((f) => f(e)),
    move: (e: unknown) => docOn.pointermove?.forEach((f) => f(e)),
    up: (e: unknown) => docOn.pointerup?.forEach((f) => f(e)),
    wheel: (e: unknown) => on.wheel?.forEach((f) => f(e)),
  };
  return { el, drag, fire };
}

/** OrbitControls on a camera 3.7 units in front of the origin, connected to a fake canvas `height` px tall */
function controlsFor(height: number) {
  const camera = new THREE.PerspectiveCamera(38, 1.5, 0.05, 50);
  camera.position.set(0, 0, 3.7);
  const { el, drag, fire } = fakeElement(height);
  const controls = new OrbitControls(camera, el as unknown as HTMLElement);
  // as HeartScene sets them
  Object.assign(controls.touches, TOUCHES);
  Object.assign(controls.mouseButtons, MOUSE_BUTTONS);
  controls.update();
  return { camera, controls, drag, fire };
}

const azimuth = (v: THREE.Vector3) => new THREE.Spherical().setFromVector3(v).theta;
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

describe('standard gestures', () => {
  const finger = (id: number, x: number, y: number) => ({ pointerId: id, pointerType: 'touch', button: 0, clientX: x, clientY: y, pageX: x, pageY: y, preventDefault() {} });
  const button = (b: number, x: number, y: number) => ({ pointerId: 9, pointerType: 'mouse', button: b, clientX: x, clientY: y, pageX: x, pageY: y, preventDefault() {} });
  const distance = (c: THREE.Camera, t: THREE.Vector3) => c.position.distanceTo(t);

  it('one finger turns the heart (and does not zoom or pan)', () => {
    const { camera, controls, fire } = controlsFor(500);
    fire.down(finger(1, 100, 200));
    for (let x = 110; x <= 200; x += 10) fire.move(finger(1, x, 200));
    fire.up(finger(1, 200, 200));
    expect(Math.abs(deg(azimuth(camera.position)))).toBeGreaterThan(10);
    expect(distance(camera, controls.target)).toBeCloseTo(3.7, 6);
    expect(controls.target.length()).toBeCloseTo(0, 9);
  });

  it('two fingers pinched apart zoom in, pinched together zoom out', () => {
    const { camera, controls, fire } = controlsFor(500);
    fire.down(finger(1, 150, 200));
    fire.down(finger(2, 250, 200));
    for (let k = 1; k <= 5; k++) { fire.move(finger(1, 150 - 10 * k, 200)); fire.move(finger(2, 250 + 10 * k, 200)); }
    fire.up(finger(1, 100, 200));
    fire.up(finger(2, 300, 200));
    const zoomedIn = distance(camera, controls.target);
    expect(zoomedIn).toBeLessThan(3.6);

    fire.down(finger(3, 100, 200));
    fire.down(finger(4, 300, 200));
    for (let k = 1; k <= 8; k++) { fire.move(finger(3, 100 + 10 * k, 200)); fire.move(finger(4, 300 - 10 * k, 200)); }
    fire.up(finger(3, 180, 200));
    fire.up(finger(4, 220, 200));
    expect(distance(camera, controls.target)).toBeGreaterThan(zoomedIn + 0.3);
  });

  it('two fingers dragged together pan the heart without turning it', () => {
    const { camera, controls, fire } = controlsFor(500);
    fire.down(finger(1, 150, 200));
    fire.down(finger(2, 250, 200));
    for (let k = 1; k <= 6; k++) { fire.move(finger(1, 150 + 10 * k, 200)); fire.move(finger(2, 250 + 10 * k, 200)); }
    fire.up(finger(1, 210, 200));
    fire.up(finger(2, 310, 200));
    expect(controls.target.x).toBeLessThan(-0.1); // the heart follows the fingers to the right: the view moves left
    expect(Math.abs(controls.target.y)).toBeLessThan(1e-6);
    expect(camera.position.clone().sub(controls.target).normalize().z).toBeCloseTo(1, 6); // still looking straight on
  });

  it('with a mouse the wheel zooms and the right button pans', () => {
    const { camera, controls, fire } = controlsFor(500);
    fire.wheel({ deltaY: -100, deltaMode: 0, preventDefault() {} });
    controls.update();
    expect(distance(camera, controls.target)).toBeLessThan(3.7);
    fire.down(button(2, 100, 100));
    for (let y = 110; y <= 160; y += 10) fire.move(button(2, 100, y));
    fire.up(button(2, 100, 160));
    expect(controls.target.y).toBeGreaterThan(0.05); // dragged down: the heart moves down, the view up
  });
});

describe('framing', () => {
  const visibleWidth = (d: number, aspect: number) => 2 * d * Math.tan((38 * Math.PI) / 360) * aspect;

  it('wide views keep the usual distance', () => {
    expect(fitDistance(1.8, 38, 3.7)).toBe(3.7);
    expect(fitDistance(1.2, 38, 3.7)).toBe(3.7);
  });

  it('a phone held upright backs the camera off so the whole heart fits across', () => {
    for (const aspect of [0.45, 0.56, 0.75]) {
      const d = fitDistance(aspect, 38, 3.7);
      expect(d).toBeGreaterThan(3.7);
      expect(visibleWidth(d, aspect)).toBeCloseTo(HEART_WIDTH, 6);
      expect(d).toBeLessThan(8); // inside the controls' zoom range, so pinching out still works
    }
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
