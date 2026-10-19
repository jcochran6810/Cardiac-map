'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Environment, Lightformer, useGLTF } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { CENTER as BVH_CENTER, MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { useSceneStore } from '@/store/useSceneStore';
import { useAppStore, type ViewMode } from '@/store/useAppStore';
import { useECGStore } from '@/store/useECGStore';
import { sim } from '@/lib/sim/simulation';
import { createHeartMaterial, heartUniforms } from './heartMaterial';
import ConductionSystem from './ConductionSystem';
import FlowParticles from './FlowParticles';
import Labels3D, { anchorFor } from './Labels3D';
import LeadVector from './LeadVector';
import { FRAME_EULER, TILT_EULER, modelToWorld } from '@/lib/anatomy/frames';
import { HEART_CENTER, LANDMARK_BY_ID, LANDMARKS, PROFILE_TERRITORY, SURFACE_REGIONS } from '@/lib/anatomy/landmarks';
import { structureCategory } from '@/lib/anatomy/categories';
import CArmTracker from '@/components/scene/CArmTracker';
import {
  ATRIAL_PATTERNS, VENT_PATTERNS, buildGraph, computeActivation, ventPatternKey, type MeshGraph, type Region,
} from '@/lib/anatomy/activation';
import {
  AUTO_ROTATE_DEG_PER_S, DEG_PER_PX, POLAR_MARGIN, PressTracker, autoRotateSpeedFor, dampingFor, frameTime,
  panCorrection, rotateSpeedFor, turnOffset,
} from '@/lib/scene/orbit';

const CLOSED_URL = '/models/heart_closed.glb';
const OPEN_URL = '/models/heart_open.glb';
useGLTF.preload(CLOSED_URL);
useGLTF.preload(OPEN_URL);

const CENTER_WORLD = modelToWorld(HEART_CENTER);
const DEFAULT_DISTANCE = 3.7;

/** The press in progress on the 3D view (or the last one): a press that moved is a turn, never a pick */
const press = new PressTracker();

// ─── Error boundary: a WebGL/asset failure must never take down the whole app ─────────

class SceneErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error('3D scene error:', error);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-cardiac-dark text-center p-6">
          <div className="max-w-sm">
            <div className="text-4xl mb-3 text-cardiac-red">♥</div>
            <h3 className="text-sm font-semibold text-white mb-1">The 3D view could not start</h3>
            <p className="text-xs text-slate-400 mb-3">
              Your browser or device may not support WebGL, or the model failed to load. The ECG, hemodynamics and all
              learning content still work.
            </p>
            <button
              onClick={() => this.setState({ error: null })}
              className="px-3 py-1.5 text-xs rounded bg-cardiac-surface text-white hover:bg-cardiac-accent hover:text-slate-900"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Geometry preparation ──────────────────────────────────────────────────

function extractMesh(scene: THREE.Object3D): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  scene.traverse((o) => {
    if (!found && (o as THREE.Mesh).isMesh) found = o as THREE.Mesh;
  });
  return found;
}

function usePreparedModels() {
  const closed = useGLTF(CLOSED_URL);
  const open = useGLTF(OPEN_URL);
  return useMemo(() => {
    const cm = extractMesh(closed.scene)!;
    const om = extractMesh(open.scene)!;
    // The GLB files ship without normals; compute smooth normals for proper lighting
    const cg = cm.geometry.clone();
    cg.computeVertexNormals();
    cg.computeBoundingSphere();
    // The sectioned specimen is stored rotated 90° about its long axis; bring it into the same frame
    const og = om.geometry.clone();
    og.rotateZ(Math.PI / 2);
    og.computeVertexNormals();
    og.computeBoundingSphere();
    const cmap = (cm.material as THREE.MeshStandardMaterial).map ?? null;
    const omap = (om.material as THREE.MeshStandardMaterial).map ?? null;
    if (cmap) cmap.anisotropy = 8;
    if (omap) omap.anisotropy = 8;
    // Surface graph for activation-time maps (exterior mesh only)
    const index = cg.index ? cg.index.array : Array.from({ length: cg.attributes.position.count }, (_, i) => i);
    const graph = buildGraph(cg.attributes.position.array, index, ATRIAL_REFS);
    const nv = cg.attributes.position.count;
    cg.setAttribute('aLatV', new THREE.BufferAttribute(new Float32Array(nv).fill(-1), 1));
    cg.setAttribute('aLatA', new THREE.BufferAttribute(new Float32Array(nv).fill(-1), 1));
    return {
      closedGeo: cg,
      openGeo: og,
      graph,
      closedMat: createHeartMaterial(cmap, { lat: true }),
      openMat: createHeartMaterial(omap, { interior: true }),
    };
  }, [closed.scene, open.scene]);
}

/**
 * Picking hit-tests the mesh on every pointer move; with 60–100k triangles that took ~10 ms a test and made
 * dragging stutter. A bounding-volume tree makes each test a fraction of a millisecond. It is built once, when
 * the browser is idle, and only for a mesh that is in use (until then picking falls back to the plain test).
 */
function useIdleBvh(geometry: THREE.BufferGeometry, active: boolean) {
  useEffect(() => {
    if (!active || geometry.boundsTree) return;
    const build = () => { if (!geometry.boundsTree) geometry.boundsTree = new MeshBVH(geometry, { strategy: BVH_CENTER, maxLeafTris: 10 }); };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(build, { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(build, 400);
    return () => window.clearTimeout(id);
  }, [geometry, active]);
}

// ─── Activation-time maps ───────────────────────────────────────────────────

const ATRIAL_REGION: Record<string, Region> = {
  'right-atrium': 3, 'right-atrial-appendage': 3, 'left-atrium': 4, 'left-atrial-appendage': 4, 'pulmonary-veins': 4,
};
const ATRIAL_REFS = SURFACE_REGIONS.filter((r) => [
  'right-atrium', 'right-atrial-appendage', 'left-atrium', 'left-atrial-appendage', 'pulmonary-veins', 'pulmonary-trunk',
  'ascending-aorta', 'aortic-arch', 'descending-aorta', 'svc', 'ivc', 'coronary-sinus',
].includes(r.id)).flatMap((r) => r.pts.map((p) => ({ p, r: (ATRIAL_REGION[r.id] ?? 0) as Region })));

/** Keeps the per-vertex activation-time attributes matched to the beat being shown */
function ActivationSync({ geometry, graph }: { geometry: THREE.BufferGeometry; graph: MeshGraph }) {
  const cache = useRef(new Map<string, { data: Float32Array; min: number }>());
  const current = useRef({ v: '', a: '' });
  const fill = (key: string, chamber: 'v' | 'a'): { data: Float32Array; min: number } | null => {
    const id = `${chamber}:${key}`;
    const hit = cache.current.get(id);
    if (hit) return hit;
    const pattern = chamber === 'v' ? VENT_PATTERNS[key] : ATRIAL_PATTERNS[key];
    if (!pattern) return null;
    const map = computeActivation(graph, pattern);
    const nv = graph.vertNode.length;
    const out = new Float32Array(nv);
    let min = 1;
    for (let i = 0; i < nv; i++) {
      const t = map.t[graph.vertNode[i]];
      out[i] = Number.isFinite(t) && map.maxT > 0 ? t / map.maxT : -1;
      if (out[i] >= 0 && out[i] < min) min = out[i];
    }
    const entry = { data: out, min };
    cache.current.set(id, entry);
    return entry;
  };
  const apply = (name: 'aLatV' | 'aLatA', entry: { data: Float32Array; min: number } | null) => {
    const attr = geometry.getAttribute(name) as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    if (entry) arr.set(entry.data); else arr.fill(-1);
    attr.needsUpdate = true;
    if (name === 'aLatV') heartUniforms.uLatVMin.value = entry?.min ?? 0;
    else heartUniforms.uLatAMin.value = entry?.min ?? 0;
  };
  useFrame(() => {
    const t = sim.time;
    const m = sim.engine.mechanics(t);
    const v = m.lastVent;
    const vKey = !v || m.fibrillating === 'ventricles' ? null : ventPatternKey(v.conduction, v.kind);
    const a = m.lastAtrial;
    const rhythm = sim.engine.segmentAt(t).profile.rhythm;
    const aKey = !a || m.fibrillating === 'atria' || rhythm === 'flutter' || rhythm === 'af' ? null : a.kind;
    if ((vKey ?? '-') !== current.current.v) {
      current.current.v = vKey ?? '-';
      apply('aLatV', vKey ? fill(vKey, 'v') : null);
    }
    if ((aKey ?? '-') !== current.current.a) {
      current.current.a = aKey ?? '-';
      apply('aLatA', aKey ? fill(aKey, 'a') : null);
    }
    const qrsMs = v ? Math.round(v.qrsDur) : 0;
    const pMs = a ? Math.round(a.template.duration) : 0;
    useSceneStore.getState().setActivation({
      vent: vKey,
      atria: aKey,
      qrsMs,
      pMs,
      vFirstMs: Math.round(heartUniforms.uLatVMin.value * qrsMs),
      aFirstMs: Math.round(heartUniforms.uLatAMin.value * pMs),
    });
  });
  return null;
}

// ─── Per-frame uniform sync with the rhythm engine ─────────────────────────

const V_ORIGINS: Record<string, [number, number, number]> = {
  normal: [0.04, -0.02, -0.38],
  rbbb: [0.12, 0.0, -0.36],
  'rbbb-lafb': [0.15, 0.12, -0.42],
  lbbb: [-0.12, -0.12, -0.42],
  preexcited: [0.45, 0.04, -0.1],
  paced: [-0.04, -0.32, -0.82],
};
const ECTOPIC: Record<string, [number, number, number]> = {
  pvc: [0.02, -0.45, 0.02],
  vt: [0.42, 0.25, -0.55],
  escape: [0.0, 0.0, -0.4],
  torsades: [0.1, -0.1, -0.6],
};
const SA_POS: [number, number, number] = [-0.37, -0.08, 0.38];
const AVN_POS: [number, number, number] = [-0.1, 0.15, -0.02];

function UniformSync({ viewMode }: { viewMode: ViewMode }) {
  const selectedId = useSceneStore((s) => s.selectedStructureId);
  useFrame(() => {
    const t = sim.time;
    const m = sim.engine.mechanics(t);
    const seg = sim.engine.segmentAt(t);
    const U = heartUniforms;
    U.uTime.value = t / 1000;
    // Pulseless rhythms (PEA, pulseless VT) show electrical activity without effective contraction
    U.uVent.value = m.ventContraction * (seg.profile.hemo === 'no-output' && seg.profile.rhythm !== 'vf' ? 0.12 : 1);
    U.uAtria.value = m.fibrillating === 'atria' ? 0 : m.atrialContraction;
    U.uAtriaFib.value = m.fibrillating === 'atria' || seg.profile.rhythm === 'flutter' ? 1 : 0;
    U.uVentFib.value = m.fibrillating === 'ventricles' ? 1 : seg.profile.rhythm === 'torsades' ? 0.6 : 0;
    U.uActA.value = m.atrialActivation;
    U.uActV.value = m.ventActivation;
    U.uRepol.value = m.repolarization;
    if (m.lastAtrial) U.uAOrigin.value.set(...(m.lastAtrial.kind === 'retrograde' ? AVN_POS : SA_POS));
    if (m.lastVent) {
      const v = m.lastVent;
      const o = v.conduction === 'ectopic' ? ECTOPIC[v.kind] ?? ECTOPIC.pvc : V_ORIGINS[v.conduction] ?? V_ORIGINS.normal;
      U.uVOrigin.value.set(...o);
    }
    U.uGlow.value = viewMode === 'conduction' ? 1.1 : viewMode === 'xray' ? 0.9 : viewMode === 'territories' ? 0.25 : viewMode === 'activation' ? 1.0 : 0.55;
    U.uLatMap.value = viewMode === 'activation' ? 1 : 0;
    U.uTerritory.value = viewMode === 'territories' ? 1 : 0;
    const terr = PROFILE_TERRITORY[seg.profile.id];
    U.uCulprit.value.set(terr === 'LAD' ? 1 : 0, terr === 'LCx' ? 1 : 0, terr === 'RCA' ? 1 : 0);
    U.uXray.value = viewMode === 'xray' || viewMode === 'conduction' ? 1 : 0;
    const l = selectedId ? LANDMARK_BY_ID[selectedId] : null;
    if (l && (l.surface || viewMode === 'sectioned')) {
      const a = anchorFor(l, viewMode);
      U.uSelect.value.set(a[0], a[1], a[2]);
      U.uSelectOn.value = 1;
    } else U.uSelectOn.value = 0;
  });
  return null;
}

// ─── Heart model ───────────────────────────────────────────────────────────

function HeartModel({ viewMode, onHover, onPick }: {
  viewMode: ViewMode;
  onHover: (id: string | null, e?: ThreeEvent<PointerEvent>) => void;
  onPick: (id: string) => void;
}) {
  const { closedGeo, openGeo, closedMat, openMat, graph } = usePreparedModels();
  const xray = viewMode === 'xray' || viewMode === 'conduction';
  const sectioned = viewMode === 'sectioned';
  useIdleBvh(closedGeo, !sectioned);
  useIdleBvh(openGeo, sectioned);

  useEffect(() => {
    closedMat.transparent = xray;
    closedMat.depthWrite = !xray;
    closedMat.side = xray ? THREE.DoubleSide : THREE.FrontSide;
    closedMat.needsUpdate = true;
  }, [xray, closedMat]);

  const pick = useCallback((local: THREE.Vector3): string | null => {
    if (sectioned) {
      let best: string | null = null;
      let bd = 0.2;
      for (const l of LANDMARKS) {
        if (!l.section) continue;
        const d = local.distanceTo(new THREE.Vector3(...l.section));
        if (d < bd) { bd = d; best = l.id; }
      }
      return best;
    }
    let best: string | null = null;
    let bd = Infinity;
    for (const r of SURFACE_REGIONS) {
      for (const p of r.pts) {
        const d = (local.x - p[0]) ** 2 + (local.y - p[1]) ** 2 + (local.z - p[2]) ** 2;
        if (d < bd) { bd = d; best = r.id; }
      }
    }
    return bd < 0.09 ? best : null;
  }, [sectioned]);

  const handleMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const local = e.object.worldToLocal(e.point.clone());
    onHover(pick(local), e);
  };
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (press.dragged) return; // the press turned the heart
    const local = e.object.worldToLocal(e.point.clone());
    const id = pick(local);
    if (id) onPick(id);
  };
  const hoverOut = () => onHover(null);

  return (
    <>
      <ActivationSync geometry={closedGeo} graph={graph} />
      {/* Only the mesh that can be picked carries pointer handlers, so the hidden one is never hit-tested */}
      <mesh
        geometry={closedGeo}
        material={closedMat}
        visible={!sectioned}
        userData={{ leadTarget: true }}
        raycast={acceleratedRaycast}
        onPointerMove={!sectioned && !xray ? handleMove : undefined}
        onPointerOut={!sectioned && !xray ? hoverOut : undefined}
        onClick={!sectioned && !xray ? handleClick : undefined}
        renderOrder={xray ? 2 : 0}
      />
      <mesh
        geometry={openGeo}
        material={openMat}
        visible={sectioned}
        userData={{ leadTarget: true }}
        raycast={acceleratedRaycast}
        onPointerMove={sectioned ? handleMove : undefined}
        onPointerOut={sectioned ? hoverOut : undefined}
        onClick={sectioned ? handleClick : undefined}
      />
    </>
  );
}

// ─── Camera rig: presets, focusing on a selection, rotate buttons, user override ───────────

function CameraRig({ viewMode }: { viewMode: ViewMode }) {
  const { camera } = useThree();
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const preset = useSceneStore((s) => s.cameraPreset);
  const setCameraPreset = useSceneStore((s) => s.setCameraPreset);
  const focusNonce = useSceneStore((s) => s.focusNonce);
  const turn = useSceneStore((s) => s.turn);
  // a tap already handled (or made before this view was opened) is not replayed
  const turnSeen = useRef(useSceneStore.getState().turn?.nonce ?? 0);
  const anim = useRef<{ from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; t: number; dur: number } | null>(null);

  const start = useCallback((to: THREE.Vector3, target: THREE.Vector3, dur = 0.7) => {
    if (!controls) return;
    anim.current = { from: camera.position.clone(), to, tFrom: controls.target.clone(), tTo: target, t: 0, dur };
  }, [camera, controls]);

  useEffect(() => {
    if (!controls) return;
    const cancel = () => { anim.current = null; };
    controls.addEventListener('start', cancel);
    return () => { controls.removeEventListener('start', cancel); };
  }, [controls]);

  useEffect(() => {
    if (!preset || !controls) return;
    const d = new THREE.Vector3(...preset.dir).normalize();
    start(CENTER_WORLD.clone().add(d.multiplyScalar(preset.distance ?? DEFAULT_DISTANCE)), CENTER_WORLD.clone());
    setCameraPreset(null);
  }, [preset, controls, start, setCameraPreset]);

  useEffect(() => {
    const id = useSceneStore.getState().selectedStructureId;
    if (!id || !controls) return;
    const l = LANDMARK_BY_ID[id];
    if (!l) return;
    const anchor = modelToWorld(anchorFor(l, viewMode));
    let dir: THREE.Vector3;
    if (viewMode === 'sectioned') dir = new THREE.Vector3(0.15, 0.1, 1).normalize();
    else if (l.surface && viewMode !== 'xray' && viewMode !== 'conduction') dir = anchor.clone().sub(CENTER_WORLD).normalize();
    else dir = camera.position.clone().sub(CENTER_WORLD).normalize();
    const target = anchor.clone().lerp(CENTER_WORLD, 0.45);
    const keep = panCorrection(target, CENTER_WORLD);
    if (keep) target.add(keep);
    start(target.clone().add(dir.multiplyScalar(2.9)), target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNonce, controls]);

  // A tap of a rotate button turns 30° from where the camera is heading, so quick taps add up
  useEffect(() => {
    if (!turn || !controls || turn.nonce === turnSeen.current) return;
    turnSeen.current = turn.nonce;
    const a = anim.current;
    const pivot = (a ? a.tTo : controls.target).clone();
    const offset = (a ? a.to : camera.position).clone().sub(pivot);
    start(pivot.clone().add(turnOffset(offset, turn.dTheta, turn.dPhi)), pivot, 0.3);
  }, [turn, controls, camera, start]);

  useFrame((_, dt) => {
    if (!controls) return;
    // A rotate button held down keeps turning the heart, once the 30° step of the first tap has played
    const spin = useSceneStore.getState().spin;
    if (spin && !anim.current) {
      const step = frameTime(dt);
      const offset = turnOffset(camera.position.clone().sub(controls.target), spin.dTheta * step, spin.dPhi * step);
      camera.position.copy(controls.target).add(offset);
      controls.update();
      return;
    }
    const a = anim.current;
    if (!a) return;
    a.t = Math.min(1, a.t + dt / a.dur);
    const k = a.t < 0.5 ? 4 * a.t ** 3 : 1 - (-2 * a.t + 2) ** 3 / 2;
    // interpolate on a sphere around the target so the camera arcs instead of cutting through the heart
    const tgt = a.tFrom.clone().lerp(a.tTo, k);
    const r0 = a.from.clone().sub(a.tFrom);
    const r1 = a.to.clone().sub(a.tTo);
    const len = THREE.MathUtils.lerp(r0.length(), r1.length(), k);
    const dir = r0.normalize().lerp(r1.normalize(), k);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    camera.position.copy(tgt).add(dir.normalize().multiplyScalar(len));
    controls.target.copy(tgt);
    controls.update();
    if (a.t >= 1) anim.current = null;
  });
  return null;
}

// ─── Controls tuning: the same feel on every screen and device ─────────────

/**
 * OrbitControls measures a drag against the canvas height and smooths per frame, so small screens turned too
 * fast and slow devices drifted on after the pointer stopped. Each frame this sets the turn rate in degrees per
 * pixel, the smoothing and auto-rotate per second, and keeps the pivot on the heart (a pan can't lose it).
 * A press that starts turning the heart switches off hover hit-tests until it ends.
 */
function ControlsTuning() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const el = useThree((s) => s.events.connected) as HTMLElement | null | undefined;
  const setEvents = useThree((s) => s.setEvents);
  const height = useRef(500);
  height.current = useThree((s) => s.size.height);

  const turnRate = useCallback(() => {
    if (controls) controls.rotateSpeed = rotateSpeedFor(DEG_PER_PX[press.pointerType === 'mouse' ? 'mouse' : 'touch'], height.current);
  }, [controls]);

  useEffect(() => {
    if (!el) return;
    let dragging = false;
    const startDrag = () => {
      dragging = true;
      setEvents({ enabled: false });
      el.style.cursor = 'grabbing';
    };
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      el.style.cursor = '';
      // after the click that ends the press, so that click is not hit-tested either
      window.setTimeout(() => setEvents({ enabled: true }), 0);
    };
    const move = (e: PointerEvent) => {
      press.move(e.clientX, e.clientY);
      if (!dragging && press.dragged) startDrag();
    };
    const stopListening = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    const up = () => {
      press.up();
      if (press.pointers > 0) return;
      stopListening();
      endDrag();
    };
    const down = (e: PointerEvent) => {
      press.down(e.clientX, e.clientY, e.pointerType, e.isPrimary);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      turnRate();
      if (!dragging && press.dragged) startDrag();
    };
    el.addEventListener('pointerdown', down);
    return () => {
      el.removeEventListener('pointerdown', down);
      stopListening();
      endDrag();
    };
  }, [el, setEvents, turnRate]);

  useFrame((_, dt) => {
    if (!controls) return;
    controls.dampingFactor = dampingFor(dt);
    controls.autoRotateSpeed = autoRotateSpeedFor(AUTO_ROTATE_DEG_PER_S, dt);
    turnRate();
  }, -2);

  // after the controls' own update: a pan that strays off the heart moves pivot and camera back together
  useFrame(() => {
    if (!controls) return;
    const back = panCorrection(controls.target, CENTER_WORLD);
    if (!back) return;
    controls.target.add(back);
    camera.position.add(back);
  });
  return null;
}

// ─── Scene contents ────────────────────────────────────────────────────────

function SceneContents({ onHover }: { onHover: (id: string | null, e?: ThreeEvent<PointerEvent>) => void }) {
  const viewMode = useAppStore((s) => s.viewMode);
  const labelsVisible = useAppStore((s) => s.labelsVisible);
  const showFlow = useAppStore((s) => s.showFlow);
  const showVector = useAppStore((s) => s.showVector);
  const autoRotate = useAppStore((s) => s.autoRotate);
  const selectedId = useSceneStore((s) => s.selectedStructureId);
  const highlightIds = useSceneStore((s) => s.highlightIds);
  const selectedLead = useECGStore((s) => s.selectedLead);

  // The structure was picked on the heart, so it is already in view: select it without moving the camera
  const onPick = useCallback((id: string) => {
    useSceneStore.getState().selectStructure(id, false);
    const app = useAppStore.getState();
    const cat = structureCategory(id);
    if (app.activePanelCategory !== cat) app.setActivePanelCategory(cat);
  }, []);

  const conductionVisible = viewMode === 'conduction' || viewMode === 'xray';

  return (
    <>
      <UniformSync viewMode={viewMode} />
      <CameraRig viewMode={viewMode} />
      <group rotation={TILT_EULER}>
        <group rotation={FRAME_EULER}>
          <HeartModel viewMode={viewMode} onHover={onHover} onPick={onPick} />
          {conductionVisible && <ConductionSystem emphasis={viewMode === 'conduction' ? 1 : 0.6} />}
          {viewMode === 'sectioned' && showFlow && <FlowParticles />}
          <Labels3D
            mode={viewMode}
            labelsVisible={labelsVisible}
            selectedId={selectedId}
            highlightIds={highlightIds}
            onSelect={(id, keyboard) => { if (keyboard || !press.dragged) onPick(id); }}
          />
        </group>
      </group>
      <LeadVector center={CENTER_WORLD} lead={selectedLead} showVector={showVector || !!selectedLead} />
      <CArmTracker />
      {/* rotateSpeed, dampingFactor and autoRotateSpeed are set every frame by ControlsTuning */}
      <OrbitControls
        makeDefault
        target={CENTER_WORLD}
        enableDamping
        zoomSpeed={0.9}
        panSpeed={0.6}
        minDistance={1.6}
        maxDistance={8}
        minPolarAngle={POLAR_MARGIN}
        maxPolarAngle={Math.PI - POLAR_MARGIN}
        autoRotate={autoRotate}
      />
      <ControlsTuning />
    </>
  );
}

export default function HeartScene() {
  const [hoverName, setHoverName] = useState<string | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const onHover = useCallback((id: string | null, e?: ThreeEvent<PointerEvent>) => {
    if (useSceneStore.getState().hoveredStructureId !== id) useSceneStore.getState().hoverStructure(id);
    setHoverName(id ? LANDMARK_BY_ID[id]?.name ?? id : null);
    if (e && tipRef.current && wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect();
      tipRef.current.style.transform = `translate(${e.nativeEvent.clientX - r.left + 14}px, ${e.nativeEvent.clientY - r.top + 12}px)`;
    }
    if (wrapRef.current) wrapRef.current.style.cursor = id ? 'pointer' : '';
  }, []);

  return (
    <div ref={wrapRef} className="w-full h-full relative heart-stage cursor-grab">
      <SceneErrorBoundary>
        <Canvas
          camera={{ position: [CENTER_WORLD.x, CENTER_WORLD.y, CENTER_WORLD.z + DEFAULT_DISTANCE], fov: 38, near: 0.05, far: 50 }}
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
        >
          <hemisphereLight args={['#fff4ec', '#2b1414', 0.55]} />
          <directionalLight position={[2.5, 3.5, 4.5]} intensity={2.1} color="#fff1e6" />
          <directionalLight position={[-4, 1.5, -3]} intensity={1.1} color="#a9c1ff" />
          <directionalLight position={[0, -3, 3]} intensity={0.45} color="#ffd9cc" />
          <Suspense fallback={null}>
            {/* Local studio environment — no network fetch (works offline / behind firewalls) */}
            <Environment resolution={128} frames={1}>
              <Lightformer intensity={2.2} position={[0, 4, 4]} scale={[7, 2.5, 1]} form="rect" />
              <Lightformer intensity={1.1} position={[-5, 1, 1]} rotation-y={Math.PI / 2} scale={[4, 4, 1]} color="#ffd9cc" />
              <Lightformer intensity={0.9} position={[5, -1, -2]} rotation-y={-Math.PI / 2} scale={[4, 4, 1]} color="#a8c4ff" />
              <Lightformer intensity={0.5} position={[0, -4, 0]} rotation-x={-Math.PI / 2} scale={[6, 6, 1]} color="#ffb0a0" />
            </Environment>
            <SceneContents onHover={onHover} />
          </Suspense>
        </Canvas>
      </SceneErrorBoundary>
      <div
        ref={tipRef}
        className={`absolute top-0 left-0 pointer-events-none z-20 touch:hidden px-2 py-1 rounded bg-black/80 text-white text-[11px] shadow whitespace-nowrap transition-opacity ${hoverName ? 'opacity-100' : 'opacity-0'}`}
      >
        {hoverName}
        <span className="text-slate-400"> · click for details</span>
      </div>
    </div>
  );
}
