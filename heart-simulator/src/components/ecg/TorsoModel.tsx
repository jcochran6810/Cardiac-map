'use client';

import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Environment, Html, Lightformer, OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { sim } from '@/lib/sim/simulation';
import { ELECTRODES, ELECTRODE_COLORS, type Electrode } from '@/lib/ecg/electrodes';
import { LEAD_VIEWS, isBipolar } from '@/lib/ecg/leadViews';
import type { StandardLead } from '@/lib/ecg/vector';
import { FRAME_EULER, TILT_EULER } from '@/lib/anatomy/frames';
import { HEART_CENTER } from '@/lib/anatomy/landmarks';
import {
  HUMAN_ELECTRODE_SITES, HUMAN_EYES, HUMAN_HEART_CENTER, HUMAN_HEART_SCALE, HUMAN_LANDMARKS, type P3,
} from '@/lib/anatomy/humanBody';

/**
 * 3D patient for the electrode lab: an adult male body (MakeHuman CC0 base mesh, built by
 * scripts/build-human-model.py) with the ten electrodes on the skin (limb electrodes on the
 * shoulders and lower abdomen), the heart beating behind a see-through window in the chest, and
 * the selected lead's view as a line from its (+) electrode through the heart. Units are metres.
 */

const HUMAN_URL = '/models/human-v1.glb'; // versioned: the service worker caches models forever
const BEAM = '#22d3ee';
const v3 = (p: P3) => new THREE.Vector3(p[0], p[1], p[2]);
/** Screen offset (px) of each electrode's label, so neighbours such as V5 / V6 don't overlap */
const LABEL_SHIFT: Record<Electrode, [number, number]> = {
  RA: [-4, -15], LA: [4, -15], RL: [0, 15], LL: [0, 15],
  V1: [-14, -10], V2: [-2, -14], V3: [14, -11], V4: [0, 14], V5: [8, -13], V6: [16, 7],
};
const HEART = v3(HUMAN_HEART_CENTER);
/** What the camera frames: lower abdomen to the chin, shoulder to shoulder */
const FRAME_CENTER = new THREE.Vector3(0, 0.44, 0.03);

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

/** Skin: soft sheen, a little colour at the nipples, and a see-through window over the heart */
function useSkinMaterial() {
  return useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({
      color: '#c9977b', roughness: 0.58, metalness: 0, sheen: 0.35, sheenRoughness: 0.55, sheenColor: new THREE.Color('#ffd9c7'),
      transparent: true, depthWrite: true,
    });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uHeart = { value: HEART.clone() };
      shader.uniforms.uNipples = { value: HUMAN_LANDMARKS.nipples.map(v3) };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSkinPos;')
        .replace('#include <fog_vertex>', '#include <fog_vertex>\nvSkinPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSkinPos;\nuniform vec3 uHeart;\nuniform vec3 uNipples[2];')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float nd = min(distance(vSkinPos, uNipples[0]), distance(vSkinPos, uNipples[1]));
          diffuseColor.rgb = mix(diffuseColor.rgb * vec3(0.74, 0.58, 0.55), diffuseColor.rgb, smoothstep(0.008, 0.015, nd));
          // window onto the heart, front of the chest only
          float hd = length((vSkinPos.xy - uHeart.xy) * vec2(1.0, 0.85));
          float front = smoothstep(uHeart.z, uHeart.z + 0.03, vSkinPos.z);
          float win = (1.0 - smoothstep(0.04, 0.078, hd)) * front;
          // the skin thins to tissue at the window's edge
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.3, 0.27), win * 0.45);
          diffuseColor.a *= 1.0 - win * 0.72;`);
    };
    return m;
  }, []);
}

/** Eyeball texture: sclera, iris and pupil centred on +z (u = 0.25 on a three.js sphere) */
function useEyeMaterial() {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#efe9e2';
    g.fillRect(0, 0, 256, 128);
    const iris = g.createRadialGradient(64, 64, 4, 64, 64, 21);
    iris.addColorStop(0, '#2b1a10');
    iris.addColorStop(0.45, '#5a3a22');
    iris.addColorStop(0.9, '#3f2716');
    iris.addColorStop(1, '#1d130c');
    g.fillStyle = iris;
    g.beginPath(); g.arc(64, 64, 21, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0b0705';
    g.beginPath(); g.arc(64, 64, 8, 0, Math.PI * 2); g.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
  }, []);
}

function HumanBody() {
  const { scene } = useGLTF(HUMAN_URL);
  const skin = useSkinMaterial();
  const eye = useEyeMaterial();
  const cloth = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1f2a3d', roughness: 0.85, side: THREE.DoubleSide }), []);
  // the inside of the body, seen through the chest window behind the heart
  const cavity = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4d1717', roughness: 0.9, side: THREE.BackSide }), []);
  const parts = useMemo(() => {
    const out: Record<string, THREE.BufferGeometry> = {};
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        const g = m.geometry.clone();
        g.computeVertexNormals(); // the GLB ships positions only
        out[m.name || m.parent?.name || 'body'] = g;
      }
    });
    return out;
  }, [scene]);
  return (
    <group>
      {parts.body && <mesh geometry={parts.body} material={cavity} />}
      {parts.body && <mesh geometry={parts.body} material={skin} renderOrder={3} />}
      {parts.shorts && <mesh geometry={parts.shorts} material={cloth} />}
      {HUMAN_EYES.map((e, i) => (
        <mesh key={i} position={e.center} material={eye}>
          <sphereGeometry args={[e.radius * 0.98, 32, 24]} />
        </mesh>
      ))}
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
    group.current?.scale.setScalar(HUMAN_HEART_SCALE * (1 - 0.07 * m.ventContraction));
  });
  return (
    <group ref={group} position={HEART} scale={HUMAN_HEART_SCALE}>
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
  const { pos, normal } = HUMAN_ELECTRODE_SITES[site];
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), v3(normal)), [normal]);
  const at = useMemo(() => v3(pos).addScaledVector(v3(normal), 0.0022), [pos, normal]);
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
        <cylinderGeometry args={[0.016, 0.016, 0.003, 28]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.0025]} renderOrder={6}>
        <sphereGeometry args={[0.0042, 12, 12]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.8} roughness={0.25} />
      </mesh>
      {ring && (
        <mesh renderOrder={6}>
          <torusGeometry args={[0.0215, 0.0028, 10, 40]} />
          <meshBasicMaterial color={ring} toneMapped={false} />
        </mesh>
      )}
      {/* generous invisible tap target */}
      <mesh onClick={click} onPointerOver={over} onPointerOut={out}>
        <sphereGeometry args={[0.03, 10, 10]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <Html position={[0, 0, 0.004]} center style={{ pointerEvents: 'none' }} zIndexRange={[20, 10]}>
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
    const pos = v3(HUMAN_ELECTRODE_SITES[siteOf(view.positive)].pos);
    if (isBipolar(lead)) {
      const neg = v3(HUMAN_ELECTRODE_SITES[siteOf(view.negative as Electrode)].pos);
      const u = pos.clone().sub(neg).normalize();
      return { start: HEART.clone().addScaledVector(u, 0.17), end: HEART.clone().addScaledVector(u, -0.1), pair: [neg, pos] as const };
    }
    const u = HEART.clone().sub(pos).normalize();
    return { start: pos, end: HEART.clone().addScaledVector(u, 0.1), pair: null };
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
          <Rod a={geo.pair[0]} b={geo.pair[1]} r={0.0016} color="#f8fafc" opacity={0.8} />
        </>
      )}
      <Rod a={geo.start} b={HEART} r={0.0026} color={BEAM} />
      <Rod a={geo.start} b={HEART} r={0.0068} color={BEAM} opacity={0.25} />
      <Rod a={HEART} b={geo.end} r={0.0016} color="#94a3b8" opacity={0.75} />
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(m) => { chevrons.current[i] = m; }} quaternion={q} renderOrder={10}>
          <coneGeometry args={[0.0065, 0.015, 14]} />
          <meshBasicMaterial color="#ecfeff" transparent depthTest={false} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={geo.start} renderOrder={10}>
        <sphereGeometry args={[0.0065, 16, 16]} />
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
    const d = Math.max(0.27 / t, 0.24 / (t * (width / Math.max(1, height))));
    camera.position.set(FRAME_CENTER.x, FRAME_CENTER.y + 0.04, FRAME_CENTER.z + Math.min(2, d));
    camera.lookAt(FRAME_CENTER);
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
      <hemisphereLight args={['#fff1e8', '#2a2230', 0.75]} />
      <directionalLight position={[0.8, 1.6, 1.4]} intensity={1.9} color="#fff3ea" />
      <directionalLight position={[-1.2, 0.7, 0.6]} intensity={0.55} color="#d6e2ff" />
      <directionalLight position={[0.2, 1.2, -1.5]} intensity={1.1} color="#ffe2d2" />
      <Suspense fallback={null}>
        <Environment resolution={64} frames={1}>
          <Lightformer intensity={1.4} position={[0, 3, 3]} scale={[6, 2, 1]} form="rect" />
          <Lightformer intensity={0.6} position={[-4, 1, 0]} rotation-y={Math.PI / 2} scale={[4, 4, 1]} color="#ffd9cc" />
        </Environment>
        <HeartInChest />
        <HumanBody />
      </Suspense>
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
        target={FRAME_CENTER}
        enablePan={false}
        minDistance={0.35}
        maxDistance={2.2}
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
          camera={{ position: [0, 0.48, 1.0], fov: 34, near: 0.02, far: 20 }}
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
