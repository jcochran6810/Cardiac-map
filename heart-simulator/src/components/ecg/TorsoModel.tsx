'use client';

import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html, OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { sim } from '@/lib/sim/simulation';
import { ELECTRODES, ELECTRODE_COLORS, type Electrode } from '@/lib/ecg/electrodes';
import { LEAD_VIEWS, isBipolar } from '@/lib/ecg/leadViews';
import type { StandardLead } from '@/lib/ecg/vector';
import { FRAME_EULER, TILT_EULER } from '@/lib/anatomy/frames';
import { HEART_CENTER } from '@/lib/anatomy/landmarks';
import {
  ELECTRODE_SITES_3D, HEART_IN_TORSO, HEART_SCALE_IN_TORSO, TORSO_BOTTOM, TORSO_TOP, surfacePoint, type P3,
} from '@/lib/anatomy/torso';

/**
 * 3D mannequin for the electrode lab: the ten electrodes on a torso (limb electrodes on the
 * shoulders and lower abdomen), a beating heart behind the sternum, and the selected lead's view
 * as a line from its (+) electrode through the heart.
 */

const BEAM = '#22d3ee';
const v3 = (p: P3) => new THREE.Vector3(p[0], p[1], p[2]);
/** Screen offset (px) of each electrode's label, so neighbours such as V5 / V6 don't overlap */
const LABEL_SHIFT: Record<Electrode, [number, number]> = {
  RA: [0, -15], LA: [0, -15], RL: [0, 15], LL: [0, 15],
  V1: [-11, -13], V2: [11, -13], V3: [4, -14], V4: [0, 14], V5: [-2, -14], V6: [14, 10],
};
const HEART = v3(HEART_IN_TORSO);

export interface TorsoModelProps {
  /** cable attached at each site */
  cableAt: Record<Electrode, Electrode>;
  scheme: 'aha' | 'iec';
  /** cables are hidden (mystery): show every site with its own colour */
  hidden: boolean;
  /** cable picked for a swap */
  picked: Electrode | null;
  lead: StandardLead | null;
  onSite: (site: Electrode) => void;
}

/** Torso surface as a closed mesh (rings of the superellipse profile, capped at the pelvis) */
function useTorsoGeometry() {
  return useMemo(() => {
    const rows = 56;
    const cols = 72;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= rows; i++) {
      const y = TORSO_BOTTOM + ((TORSO_TOP - TORSO_BOTTOM) * i) / rows;
      for (let j = 0; j < cols; j++) pos.push(...surfacePoint(y, (2 * Math.PI * j) / cols));
    }
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const a = i * cols + j;
        const b = i * cols + ((j + 1) % cols);
        const c = a + cols;
        const d = b + cols;
        idx.push(a, d, b, a, c, d);
      }
    }
    const bottom = pos.length / 3;
    pos.push(0, TORSO_BOTTOM, 0);
    for (let j = 0; j < cols; j++) idx.push(bottom, j, (j + 1) % cols);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, []);
}

/** Capsule joining two points */
function Limb({ a, b, r, material }: { a: P3; b: P3; r: number; material: THREE.Material }) {
  const s = useMemo(() => {
    const A = v3(a);
    const B = v3(b);
    const d = B.clone().sub(A);
    return {
      position: A.clone().add(B).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()),
      len: d.length(),
    };
  }, [a, b]);
  return (
    <mesh position={s.position} quaternion={s.quaternion} material={material}>
      <capsuleGeometry args={[r, s.len, 6, 18]} />
    </mesh>
  );
}

function Body() {
  const torso = useTorsoGeometry();
  const skin = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#d9c4b6', roughness: 0.62, metalness: 0, transparent: true, opacity: 0.5, depthWrite: false,
  }), []);
  const landmark = useMemo(() => new THREE.MeshBasicMaterial({ color: '#8b6f62', transparent: true, opacity: 0.7 }), []);
  // Sternum and clavicles on the skin: the landmarks the electrode sites are measured from
  const sternum = useMemo(() => {
    const pts = [0.58, 0.45, 0.3, 0.15, 0.06].map((y) => v3(surfacePoint(y, Math.PI / 2)).multiplyScalar(1.004));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.008, 6, false);
  }, []);
  const clavicles = useMemo(() => [-1, 1].map((side) => {
    const pts = [
      [0.035 * side, 0.6, 0.11],
      [0.16 * side, 0.565, 0.13],
      [0.3 * side, 0.545, 0.1],
      [0.37 * side, 0.53, 0.04],
    ].map((p) => v3(p as P3));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.01, 6, false);
  }), []);
  return (
    <group>
      <mesh geometry={torso} material={skin} renderOrder={2} />
      <mesh position={[0, 0.71, -0.005]} material={skin} renderOrder={2}>
        <cylinderGeometry args={[0.068, 0.082, 0.16, 24]} />
      </mesh>
      <mesh position={[0, 0.885, 0.01]} scale={[0.125, 0.16, 0.145]} material={skin} renderOrder={2}>
        <sphereGeometry args={[1, 32, 24]} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[0.375 * s, 0.48, -0.01]} material={skin} renderOrder={2}>
            <sphereGeometry args={[0.1, 24, 18]} />
          </mesh>
          <Limb a={[0.405 * s, 0.45, -0.01]} b={[0.49 * s, 0.07, -0.02]} r={0.075} material={skin} />
          <Limb a={[0.49 * s, 0.07, -0.02]} b={[0.55 * s, -0.3, 0.05]} r={0.062} material={skin} />
          <mesh position={[0.565 * s, -0.4, 0.06]} scale={[0.045, 0.07, 0.03]} material={skin}>
            <sphereGeometry args={[1, 16, 12]} />
          </mesh>
          <Limb a={[0.17 * s, -0.58, 0]} b={[0.2 * s, -1.02, 0.01]} r={0.13} material={skin} />
        </group>
      ))}
      <mesh geometry={sternum} material={landmark} />
      {clavicles.map((g, i) => <mesh key={i} geometry={g} material={landmark} />)}
    </group>
  );
}

function HeartInChest() {
  const { scene } = useGLTF('/models/heart_closed.glb');
  const geo = useMemo(() => {
    let g: THREE.BufferGeometry | null = null;
    scene.traverse((o) => { if (!g && (o as THREE.Mesh).isMesh) g = (o as THREE.Mesh).geometry; });
    const c = (g as THREE.BufferGeometry | null)?.clone() ?? new THREE.SphereGeometry(1);
    c.computeVertexNormals();
    return c;
  }, [scene]);
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    // gentle beat in step with the simulation
    const m = sim.engine.mechanics(sim.time);
    group.current?.scale.setScalar(HEART_SCALE_IN_TORSO * (1 - 0.07 * m.ventContraction));
  });
  return (
    <group ref={group} position={HEART} scale={HEART_SCALE_IN_TORSO}>
      <group rotation={TILT_EULER}>
        <group rotation={FRAME_EULER}>
          <mesh geometry={geo} position={[-HEART_CENTER[0], -HEART_CENTER[1], -HEART_CENTER[2]]} renderOrder={1}>
            <meshStandardMaterial color="#c0392b" emissive="#4a0d0d" roughness={0.45} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

function ElectrodeDisc({ site, cable, color, label, ring, pole, onSite }: {
  site: Electrode; cable: Electrode; color: string; label: string; ring: string | null; pole: '+' | '−' | null; onSite: (s: Electrode) => void;
}) {
  const { pos, normal } = ELECTRODE_SITES_3D[site];
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), v3(normal)), [normal]);
  const at = useMemo(() => v3(pos).addScaledVector(v3(normal), 0.006), [pos, normal]);
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 6) return; // a drag to rotate, not a tap
    onSite(site);
  };
  const over = (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; };
  const out = () => { document.body.style.cursor = ''; };
  return (
    <group position={at} quaternion={q}>
      <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={5}>
        <cylinderGeometry args={[0.03, 0.03, 0.008, 28]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.007]} renderOrder={6}>
        <sphereGeometry args={[0.009, 12, 12]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.8} roughness={0.25} />
      </mesh>
      {ring && (
        <mesh renderOrder={6}>
          <torusGeometry args={[0.042, 0.006, 10, 40]} />
          <meshBasicMaterial color={ring} toneMapped={false} />
        </mesh>
      )}
      {/* generous invisible tap target */}
      <mesh onClick={click} onPointerOver={over} onPointerOut={out}>
        <sphereGeometry args={[0.055, 10, 10]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <Html position={[0, 0, 0.01]} center style={{ pointerEvents: 'none' }} zIndexRange={[20, 10]}>
        <div
          className="text-[9px] font-bold leading-none px-1 py-px rounded bg-slate-950/70 text-slate-100 whitespace-nowrap"
          style={{ transform: `translate(${LABEL_SHIFT[site][0]}px, ${LABEL_SHIFT[site][1]}px)` }}
        >
          {label}{cable !== site ? ' ⚠' : ''}
          {pole && <span className={pole === '+' ? 'text-cyan-300' : 'text-slate-300'}> {pole}</span>}
        </div>
      </Html>
    </group>
  );
}

function Rod({ a, b, r, color, opacity = 1 }: { a: THREE.Vector3; b: THREE.Vector3; r: number; color: string; opacity?: number }) {
  const s = useMemo(() => {
    const d = b.clone().sub(a);
    return {
      position: a.clone().add(b).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()),
      len: d.length(),
    };
  }, [a, b]);
  return (
    <mesh position={s.position} quaternion={s.quaternion} renderOrder={9}>
      <cylinderGeometry args={[r, r, s.len, 12, 1, true]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthTest={false} toneMapped={false} />
    </mesh>
  );
}

/** The selected lead's view: from its (+) electrode through the heart (bipolar leads: parallel to − → +) */
function LeadLine({ lead, siteOf }: { lead: StandardLead; siteOf: (cable: Electrode) => Electrode }) {
  const view = LEAD_VIEWS[lead];
  const geo = useMemo(() => {
    const pos = v3(ELECTRODE_SITES_3D[siteOf(view.positive)].pos);
    if (isBipolar(lead)) {
      const neg = v3(ELECTRODE_SITES_3D[siteOf(view.negative as Electrode)].pos);
      const u = pos.clone().sub(neg).normalize();
      return { start: HEART.clone().addScaledVector(u, 0.5), end: HEART.clone().addScaledVector(u, -0.3), pair: [neg, pos] as const };
    }
    const u = HEART.clone().sub(pos).normalize();
    return { start: pos, end: HEART.clone().addScaledVector(u, 0.3), pair: null };
  }, [lead, siteOf, view]);
  const chevrons = useRef<(THREE.Mesh | null)[]>([]);
  const dir = useMemo(() => HEART.clone().sub(geo.start).normalize(), [geo]);
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir), [dir]);
  useFrame(({ clock }) => {
    chevrons.current.forEach((m, i) => {
      if (!m) return;
      const k = (clock.elapsedTime * 0.55 + i / 3) % 1;
      m.position.lerpVectors(geo.start, HEART, k);
      (m.material as THREE.MeshBasicMaterial).opacity = Math.sin(Math.PI * k);
    });
  });
  return (
    <group>
      {geo.pair && (
        <>
          {/* the two electrodes this bipolar lead measures between */}
          <Rod a={geo.pair[0]} b={geo.pair[1]} r={0.005} color="#f8fafc" opacity={0.75} />
        </>
      )}
      <Rod a={geo.start} b={HEART} r={0.009} color={BEAM} />
      <Rod a={geo.start} b={HEART} r={0.022} color={BEAM} opacity={0.25} />
      <Rod a={HEART} b={geo.end} r={0.005} color="#94a3b8" opacity={0.7} />
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(m) => { chevrons.current[i] = m; }} quaternion={q} renderOrder={10}>
          <coneGeometry args={[0.022, 0.05, 14]} />
          <meshBasicMaterial color="#ecfeff" transparent depthTest={false} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={geo.start} renderOrder={10}>
        <sphereGeometry args={[0.022, 16, 16]} />
        <meshBasicMaterial color={BEAM} depthTest={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Frame the electrode area (lower abdomen to the neck, shoulder to shoulder) whatever the panel's shape */
function CameraFit() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const { width, height } = useThree((s) => s.size);
  useEffect(() => {
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const d = Math.max(0.66 / t, 0.62 / (t * (width / Math.max(1, height))));
    camera.position.set(0, 0.16, Math.min(3.4, d));
    camera.lookAt(0, 0.1, 0);
  }, [camera, width, height]);
  return null;
}

function Scene({ cableAt, scheme, hidden, picked, lead, onSite }: TorsoModelProps) {
  const colors = ELECTRODE_COLORS[scheme];
  // where each cable is attached (inverse of cableAt)
  const siteOf = useMemo(() => {
    const m = {} as Record<Electrode, Electrode>;
    for (const s of ELECTRODES) m[cableAt[s]] = s;
    return (c: Electrode) => m[c];
  }, [cableAt]);
  const view = lead ? LEAD_VIEWS[lead] : null;
  const posSite = view ? siteOf(view.positive) : null;
  const negSite = view && isBipolar(lead!) ? siteOf(view.negative as Electrode) : null;
  return (
    <>
      <CameraFit />
      <hemisphereLight args={['#fff4ec', '#1e293b', 0.9]} />
      <directionalLight position={[1.5, 2, 3]} intensity={1.6} />
      <directionalLight position={[-2, 0.5, -2]} intensity={0.6} color="#a9c1ff" />
      <Suspense fallback={null}>
        <HeartInChest />
      </Suspense>
      <Body />
      {ELECTRODES.map((site) => {
        const cable = cableAt[site];
        const c = colors[cable];
        const ring = picked === cable ? '#38bdf8'
          : site === posSite ? BEAM
            : site === negSite ? '#e2e8f0'
              : !hidden && cable !== site ? '#f59e0b' : null;
        const pole = site === posSite ? '+' : site === negSite ? '−' : null;
        return <ElectrodeDisc key={site} site={site} cable={cable} color={c.fill} label={c.label} ring={ring} pole={pole} onSite={onSite} />;
      })}
      {lead && <LeadLine lead={lead} siteOf={siteOf} />}
      <OrbitControls
        target={[0, 0.1, 0]}
        enablePan={false}
        minDistance={1.1}
        maxDistance={3.6}
        minPolarAngle={Math.PI * 0.28}
        maxPolarAngle={Math.PI * 0.68}
        rotateSpeed={0.7}
      />
    </>
  );
}

class GLBoundary extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export default function TorsoModel(props: TorsoModelProps & { fallback: React.ReactNode; className?: string }) {
  const { fallback, className, ...rest } = props;
  return (
    <div className={className ?? 'w-full h-[290px]'}>
      <GLBoundary fallback={fallback}>
        <Canvas
          camera={{ position: [0, 0.16, 2.75], fov: 34, near: 0.05, far: 20 }}
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: true }}
          style={{ touchAction: 'none' }}
        >
          <Scene {...rest} />
        </Canvas>
      </GLBoundary>
    </div>
  );
}
