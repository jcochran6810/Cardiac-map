'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { sim } from '@/lib/sim/simulation';
import type { V3 } from '@/lib/anatomy/landmarks';

/**
 * Animated conduction system. Every segment's activation window is computed from
 * the live rhythm events, so the wave stops at the AV node on a dropped beat,
 * skips the His bundle for PVCs/VT, shows a blocked bundle in BBB, uses an
 * accessory pathway in WPW, circles the tricuspid annulus in flutter, and
 * fragments chaotically in AF.
 */

type SegKey =
  | 'sa-ra' | 'internodal' | 'bachmann' | 'la-post' | 'av' | 'his'
  | 'rbb' | 'lbb' | 'laf' | 'lpf' | 'pk-lv-apex' | 'pk-lv-lat' | 'pk-lv-inf' | 'pk-rv' | 'pk-rv-apex' | 'accessory';

const SA: V3 = [-0.37, -0.08, 0.38];
const AVN: V3 = [-0.1, 0.15, -0.02];
const HIS0: V3 = [-0.07, 0.1, -0.06];
const HISB: V3 = [-0.02, 0.02, -0.15];
const LBB: V3 = [0.05, 0.0, -0.23];
const RBB_MB: V3 = [-0.25, -0.33, -0.52];
const LAF_END: V3 = [0.3, -0.18, -0.48];
const LPF_END: V3 = [0.2, 0.22, -0.52];

const SEGMENTS: { key: SegKey; pts: V3[]; color: string; radius: number }[] = [
  { key: 'sa-ra', pts: [SA, [-0.48, -0.05, 0.2], [-0.52, 0.05, 0.0]], color: '#fbbf24', radius: 0.011 },
  { key: 'internodal', pts: [SA, [-0.34, 0.08, 0.2], [-0.22, 0.17, 0.06], AVN], color: '#fbbf24', radius: 0.011 },
  { key: 'bachmann', pts: [SA, [-0.15, -0.16, 0.33], [0.12, -0.13, 0.3], [0.35, -0.2, 0.18]], color: '#fbbf24', radius: 0.011 },
  { key: 'la-post', pts: [[0.12, -0.13, 0.3], [0.15, 0.25, 0.25], [0.26, 0.45, 0.1]], color: '#fbbf24', radius: 0.01 },
  { key: 'av', pts: [AVN, HIS0], color: '#f59e0b', radius: 0.016 },
  { key: 'his', pts: [HIS0, [-0.05, 0.06, -0.1], HISB], color: '#f97316', radius: 0.014 },
  { key: 'rbb', pts: [HISB, [-0.07, -0.05, -0.3], [-0.12, -0.2, -0.45], RBB_MB], color: '#ef4444', radius: 0.011 },
  { key: 'lbb', pts: [HISB, LBB], color: '#ef4444', radius: 0.013 },
  { key: 'laf', pts: [LBB, [0.15, -0.15, -0.35], LAF_END], color: '#ef4444', radius: 0.01 },
  { key: 'lpf', pts: [LBB, [0.12, 0.12, -0.38], LPF_END], color: '#ef4444', radius: 0.01 },
  { key: 'pk-lv-apex', pts: [LAF_END, [0.25, -0.2, -0.7], [0.12, -0.2, -0.88]], color: '#fb7185', radius: 0.008 },
  { key: 'pk-lv-lat', pts: [LAF_END, [0.48, -0.05, -0.45], [0.52, 0.1, -0.3]], color: '#fb7185', radius: 0.008 },
  { key: 'pk-lv-inf', pts: [LPF_END, [0.35, 0.35, -0.6], [0.2, 0.4, -0.75]], color: '#fb7185', radius: 0.008 },
  { key: 'pk-rv', pts: [RBB_MB, [-0.4, -0.25, -0.45], [-0.42, -0.1, -0.3]], color: '#fb7185', radius: 0.008 },
  { key: 'pk-rv-apex', pts: [[-0.12, -0.2, -0.45], [-0.05, -0.3, -0.75], [0.05, -0.3, -0.88]], color: '#fb7185', radius: 0.008 },
  { key: 'accessory', pts: [[0.43, 0.06, 0.05], [0.46, 0.04, -0.04], [0.45, 0.03, -0.14]], color: '#a78bfa', radius: 0.014 },
];

const ECTOPIC_ORIGIN: Record<string, V3> = {
  pvc: [0.02, -0.45, 0.02],
  vt: [0.42, 0.25, -0.55],
  escape: [0.0, 0.0, -0.4],
  torsades: [0.1, -0.1, -0.6],
  paced: [-0.04, -0.32, -0.82],
};

const trailVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const trailFrag = /* glsl */ `
uniform float uProgress;
uniform float uFade;
uniform float uBase;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float lead = uProgress;
  float behind = step(vUv.x, lead);
  float tail = smoothstep(lead - 0.5, lead, vUv.x);
  float edge = exp(-abs(vUv.x - lead) * 24.0) * step(0.001, uProgress);
  float a = (behind * (0.25 + 0.6 * tail) * uFade + edge * 1.4 * uFade) * step(0.001, uProgress);
  a = max(a, uBase);
  gl_FragColor = vec4(uColor * (1.0 + edge), a);
}
`;

interface Win { start: number; end: number; blocked?: boolean; reverse?: boolean }

function windowsFor(t: number): Partial<Record<SegKey, Win>> & { focus?: V3; focusAge?: number; blocked: SegKey[]; flutter?: number; af?: boolean } {
  const e = sim.engine;
  const out: Partial<Record<SegKey, Win>> & { focus?: V3; focusAge?: number; blocked: SegKey[]; flutter?: number; af?: boolean } = { blocked: [] };
  const seg = e.segmentAt(t);
  const rhythm = seg.profile.rhythm;
  if (rhythm === 'af') out.af = true;
  if (rhythm === 'flutter') out.flutter = (((t - seg.start) % 200) + 200) % 200 / 200;

  const ai = e.lastAtrialIndex(t);
  const a = ai >= 0 ? e.atrial[ai] : null;
  if (a && t - a.t < 600 && rhythm !== 'af' && rhythm !== 'flutter') {
    if (a.kind === 'retrograde') {
      out.internodal = { start: a.t, end: a.t + 60, reverse: true };
      out['sa-ra'] = { start: a.t + 30, end: a.t + 90, reverse: true };
      out.bachmann = { start: a.t + 20, end: a.t + 90, reverse: false };
    } else {
      out['sa-ra'] = { start: a.t, end: a.t + 55 };
      out.internodal = { start: a.t + 5, end: a.t + 45 };
      out.bachmann = { start: a.t + 10, end: a.t + 70 };
      out['la-post'] = { start: a.t + 45, end: a.t + 95 };
      // AV node: slow conduction until the QRS — or a block if this P was not conducted
      const vi = e.lastVentIndex(t + 400);
      let conductedTo = null as null | number;
      for (let k = vi; k >= 0 && k > vi - 3; k--) if (e.vent[k].pTime === a.t) conductedTo = e.vent[k].t;
      if (conductedTo !== null) out.av = { start: a.t + 45, end: conductedTo - 12 };
      else if (rhythm !== 'vt' && rhythm !== 'chb') out.av = { start: a.t + 45, end: a.t + 160, blocked: true };
      else out.av = { start: a.t + 45, end: a.t + 130, blocked: true };
    }
  }

  const vi = e.lastVentIndex(t);
  const v = vi >= 0 ? e.vent[vi] : null;
  if (v && t - v.t < 400) {
    const tv = v.t;
    const c = v.conduction;
    if (c === 'ectopic' || c === 'paced') {
      out.focus = ECTOPIC_ORIGIN[v.kind] ?? ECTOPIC_ORIGIN.pvc;
      out.focusAge = t - tv;
      const late = { start: tv + 40, end: tv + 140 };
      out['pk-lv-apex'] = late; out['pk-lv-lat'] = late; out['pk-lv-inf'] = late; out['pk-rv'] = late; out['pk-rv-apex'] = late;
    } else {
      if (c === 'preexcited') out.accessory = { start: tv - 10, end: tv + 25 };
      if (out.av && !out.av.blocked && v.pTime === undefined) delete out.av;
      if (v.kind === 'junctional' || v.kind === 'svt') out.av = { start: tv - 60, end: tv - 12 };
      out.his = { start: tv - 12, end: tv + 6 };
      const rbbBlocked = c === 'rbbb' || c === 'rbbb-lafb';
      const lbbBlocked = c === 'lbbb';
      const lafBlocked = c === 'rbbb-lafb' || lbbBlocked;
      out.rbb = rbbBlocked ? { start: tv + 6, end: tv + 18, blocked: true } : { start: tv + 6, end: tv + 30 };
      out.lbb = lbbBlocked ? { start: tv + 6, end: tv + 14, blocked: true } : { start: tv + 6, end: tv + 18 };
      out.laf = lafBlocked ? { start: tv + 16, end: tv + 22, blocked: true } : { start: tv + 16, end: tv + 36 };
      out.lpf = lbbBlocked ? { start: tv + 16, end: tv + 22, blocked: true } : { start: tv + 16, end: tv + 38 };
      const lvLate = lbbBlocked ? 60 : 0;
      const rvLate = rbbBlocked ? 55 : 0;
      const lafLate = c === 'rbbb-lafb' ? 35 : 0;
      out['pk-lv-apex'] = { start: tv + 34 + lvLate, end: tv + 80 + lvLate };
      out['pk-lv-lat'] = { start: tv + 34 + lvLate + lafLate, end: tv + 85 + lvLate + lafLate };
      out['pk-lv-inf'] = { start: tv + 36 + lvLate, end: tv + 82 + lvLate };
      out['pk-rv'] = { start: tv + 30 + rvLate, end: tv + 75 + rvLate };
      out['pk-rv-apex'] = { start: tv + 28 + rvLate, end: tv + 70 + rvLate };
      if (rbbBlocked) out.blocked.push('rbb');
      if (lbbBlocked) out.blocked.push('lbb');
      if (lafBlocked && !lbbBlocked) out.blocked.push('laf');
    }
  }
  if (out.av?.blocked) out.blocked.push('av');
  return out;
}

function Segment({ seg, matRef }: { seg: (typeof SEGMENTS)[number]; matRef: (m: THREE.ShaderMaterial | null) => void }) {
  const curve = useMemo(() => new THREE.CatmullRomCurve3(seg.pts.map((p) => new THREE.Vector3(...p))), [seg]);
  const tube = useMemo(() => new THREE.TubeGeometry(curve, 48, seg.radius, 8, false), [curve, seg.radius]);
  const glow = useMemo(() => new THREE.TubeGeometry(curve, 48, seg.radius * 2.4, 8, false), [curve, seg.radius]);
  const mat = useMemo(
    () => new THREE.ShaderMaterial({
      uniforms: { uProgress: { value: 0 }, uFade: { value: 1 }, uBase: { value: 0.32 }, uColor: { value: new THREE.Color(seg.color) } },
      vertexShader: trailVert, fragmentShader: trailFrag, transparent: true, depthWrite: false, depthTest: false,
    }),
    [seg.color],
  );
  const glowMat = useMemo(
    () => new THREE.ShaderMaterial({
      uniforms: { uProgress: { value: 0 }, uFade: { value: 0.35 }, uBase: { value: 0.0 }, uColor: { value: new THREE.Color(seg.color) } },
      vertexShader: trailVert, fragmentShader: trailFrag, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    }),
    [seg.color],
  );
  return (
    <group>
      <mesh geometry={tube} material={mat} renderOrder={10} ref={() => matRef(mat)} />
      <mesh geometry={glow} material={glowMat} renderOrder={11} ref={() => matRef(glowMat)} />
    </group>
  );
}

export default function ConductionSystem({ emphasis = 1 }: { emphasis?: number }) {
  const mats = useRef<Record<string, THREE.ShaderMaterial[]>>({});
  const focusRef = useRef<THREE.Mesh>(null);
  const blockRefs = useRef<Record<string, THREE.Group | null>>({});
  const flutterRef = useRef<THREE.Mesh>(null);
  const afRef = useRef<THREE.Points>(null);

  const flutterCurve = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      pts.push(new THREE.Vector3(-0.36, -0.08 + 0.17 * Math.cos(a), -0.04 + 0.15 * Math.sin(a)));
    }
    return new THREE.CatmullRomCurve3(pts, true);
  }, []);
  const flutterGeo = useMemo(() => new THREE.TubeGeometry(flutterCurve, 80, 0.016, 8, true), [flutterCurve]);
  const flutterMat = useMemo(
    () => new THREE.ShaderMaterial({
      uniforms: { uProgress: { value: 0 }, uFade: { value: 1 }, uBase: { value: 0.12 }, uColor: { value: new THREE.Color('#fbbf24') } },
      vertexShader: trailVert, fragmentShader: trailFrag, transparent: true, depthWrite: false, depthTest: false,
    }),
    [],
  );
  const afGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = 160;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const left = i % 2 === 0;
      pos[i * 3] = left ? -0.42 + Math.random() * 0.3 : 0.0 + Math.random() * 0.4;
      pos[i * 3 + 1] = -0.15 + Math.random() * 0.6;
      pos[i * 3 + 2] = -0.02 + Math.random() * 0.36;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);

  useFrame(() => {
    const t = sim.time;
    const w = windowsFor(t);
    for (const seg of SEGMENTS) {
      const win = w[seg.key];
      let prog = 0;
      let fade = 1;
      if (win) {
        if (t >= win.start && t <= win.end) prog = (t - win.start) / Math.max(1, win.end - win.start);
        else if (t > win.end && t < win.end + 180) { prog = 1; fade = 1 - (t - win.end) / 180; }
        if (win.blocked && prog > 0) prog = Math.min(prog, 0.45);
        if (win.reverse && prog > 0) prog = 1 - prog;
      }
      for (const m of mats.current[seg.key] ?? []) {
        m.uniforms.uProgress.value = prog;
        m.uniforms.uFade.value = fade * emphasis;
      }
      const blk = blockRefs.current[seg.key];
      if (blk) blk.visible = w.blocked.includes(seg.key);
    }
    if (focusRef.current) {
      const f = w.focus;
      focusRef.current.visible = !!f && (w.focusAge ?? 999) < 220;
      if (f) {
        focusRef.current.position.set(...f);
        const s = 0.5 + ((w.focusAge ?? 0) / 220) * 2.5;
        focusRef.current.scale.setScalar(s);
        (focusRef.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - (w.focusAge ?? 0) / 220);
      }
    }
    if (flutterRef.current) {
      flutterRef.current.visible = w.flutter !== undefined;
      flutterMat.uniforms.uProgress.value = w.flutter ?? 0;
    }
    if (afRef.current) {
      afRef.current.visible = !!w.af;
      const m = afRef.current.material as THREE.PointsMaterial;
      m.opacity = 0.5 + 0.4 * Math.sin(t * 0.09);
      afRef.current.rotation.z = Math.sin(t * 0.013) * 0.02;
    }
  });

  return (
    <group>
      {SEGMENTS.map((seg) => (
        <Segment
          key={seg.key}
          seg={seg}
          matRef={(m) => {
            if (!m) return;
            const arr = (mats.current[seg.key] ||= []);
            if (!arr.includes(m)) arr.push(m);
          }}
        />
      ))}
      {/* Block markers (red ✕) */}
      {(['av', 'rbb', 'lbb', 'laf'] as SegKey[]).map((k) => {
        const seg = SEGMENTS.find((s) => s.key === k)!;
        const mid = new THREE.CatmullRomCurve3(seg.pts.map((p) => new THREE.Vector3(...p))).getPoint(k === 'av' ? 0.6 : 0.5);
        return (
          <group key={k} position={mid} ref={(g) => { blockRefs.current[k] = g; }} visible={false}>
            <mesh rotation={[0, 0, Math.PI / 4]} renderOrder={12}>
              <boxGeometry args={[0.09, 0.016, 0.016]} />
              <meshBasicMaterial color="#ef4444" depthTest={false} />
            </mesh>
            <mesh rotation={[0, 0, -Math.PI / 4]} renderOrder={12}>
              <boxGeometry args={[0.09, 0.016, 0.016]} />
              <meshBasicMaterial color="#ef4444" depthTest={false} />
            </mesh>
          </group>
        );
      })}
      {/* Ectopic focus / pacing lead tip pulse */}
      <mesh ref={focusRef} visible={false} renderOrder={12}>
        <sphereGeometry args={[0.045, 16, 16]} />
        <meshBasicMaterial color="#c084fc" transparent depthTest={false} />
      </mesh>
      {/* Flutter macro-reentry around the tricuspid annulus */}
      <mesh ref={flutterRef} geometry={flutterGeo} material={flutterMat} visible={false} renderOrder={10} />
      {/* AF: chaotic multiple wavelets */}
      <points ref={afRef} geometry={afGeo} visible={false} renderOrder={10}>
        <pointsMaterial color="#fbbf24" size={0.03} transparent depthTest={false} sizeAttenuation />
      </points>
      {/* Node markers */}
      {[SA, AVN].map((p, i) => (
        <mesh key={i} position={p} renderOrder={12}>
          <sphereGeometry args={[0.03, 16, 16]} />
          <meshBasicMaterial color="#fde68a" depthTest={false} />
        </mesh>
      ))}
    </group>
  );
}
