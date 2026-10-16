'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Environment, Lightformer, useGLTF } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
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

const CLOSED_URL = '/models/heart_closed.glb';
const OPEN_URL = '/models/heart_open.glb';
useGLTF.preload(CLOSED_URL);
useGLTF.preload(OPEN_URL);

const CENTER_WORLD = modelToWorld(HEART_CENTER);
const DEFAULT_DISTANCE = 3.7;

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
    return {
      closedGeo: cg,
      openGeo: og,
      closedMat: createHeartMaterial(cmap),
      openMat: createHeartMaterial(omap, { interior: true }),
    };
  }, [closed.scene, open.scene]);
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
    U.uVent.value = m.ventContraction;
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
    U.uGlow.value = viewMode === 'conduction' ? 1.1 : viewMode === 'xray' ? 0.9 : viewMode === 'territories' ? 0.25 : 0.55;
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
  const { closedGeo, openGeo, closedMat, openMat } = usePreparedModels();
  const xray = viewMode === 'xray' || viewMode === 'conduction';
  const sectioned = viewMode === 'sectioned';

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
    if (e.delta > 4) return; // was a drag
    const local = e.object.worldToLocal(e.point.clone());
    const id = pick(local);
    if (id) onPick(id);
  };

  return (
    <>
      <mesh
        geometry={closedGeo}
        material={closedMat}
        visible={!sectioned}
        onPointerMove={!sectioned && !xray ? handleMove : undefined}
        onPointerOut={() => onHover(null)}
        onClick={!sectioned && !xray ? handleClick : undefined}
        renderOrder={xray ? 2 : 0}
      />
      <mesh
        geometry={openGeo}
        material={openMat}
        visible={sectioned}
        onPointerMove={sectioned ? handleMove : undefined}
        onPointerOut={() => onHover(null)}
        onClick={sectioned ? handleClick : undefined}
      />
    </>
  );
}

// ─── Camera rig: presets, focusing on a selection, user override ───────────

function CameraRig({ viewMode }: { viewMode: ViewMode }) {
  const { camera } = useThree();
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const preset = useSceneStore((s) => s.cameraPreset);
  const setCameraPreset = useSceneStore((s) => s.setCameraPreset);
  const focusNonce = useSceneStore((s) => s.focusNonce);
  const anim = useRef<{ from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; t: number } | null>(null);

  const start = useCallback((to: THREE.Vector3, target: THREE.Vector3) => {
    if (!controls) return;
    anim.current = { from: camera.position.clone(), to, tFrom: controls.target.clone(), tTo: target, t: 0 };
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
    start(target.clone().add(dir.multiplyScalar(2.9)), target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNonce, controls]);

  useFrame((_, dt) => {
    const a = anim.current;
    if (!a || !controls) return;
    a.t = Math.min(1, a.t + dt / 0.7);
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

  const onPick = useCallback((id: string) => {
    useSceneStore.getState().selectStructure(id);
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
            onSelect={onPick}
          />
        </group>
      </group>
      <LeadVector center={CENTER_WORLD} lead={selectedLead} showVector={showVector || !!selectedLead} />
      <OrbitControls
        makeDefault
        target={CENTER_WORLD}
        enableDamping
        dampingFactor={0.1}
        rotateSpeed={0.6}
        zoomSpeed={0.8}
        panSpeed={0.6}
        minDistance={1.6}
        maxDistance={8}
        autoRotate={autoRotate}
        autoRotateSpeed={0.8}
      />
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
    <div ref={wrapRef} className="w-full h-full relative heart-stage">
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
        className={`absolute top-0 left-0 pointer-events-none z-20 px-2 py-1 rounded bg-black/80 text-white text-[11px] shadow whitespace-nowrap transition-opacity ${hoverName ? 'opacity-100' : 'opacity-0'}`}
      >
        {hoverName}
        <span className="text-slate-400"> · click for details</span>
      </div>
    </div>
  );
}
