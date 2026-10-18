'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { sim } from '@/lib/sim/simulation';
import { LEAD_VECTORS, norm, type StandardLead, type Vec3 } from '@/lib/ecg/vector';
import { isStandard, leadField } from '@/lib/ecg/electrodes';
import { LEAD_VIEWS } from '@/lib/ecg/leadViews';
import { bodyToWorld } from '@/lib/anatomy/frames';
import { useECGStore } from '@/store/useECGStore';
import { useAppStore } from '@/store/useAppStore';
import { useSceneStore } from '@/store/useSceneStore';

/**
 * The selected lead's view of the heart, plus the instantaneous cardiac dipole ("vector").
 *
 * A lead looks at the heart from its positive pole. The view line starts at an eye marker on the
 * (+) side, runs as a solid beam with arrows moving inward to where it meets the heart wall (ring
 * and wall name), continues through the heart (seen through the muscle) and leaves toward (−).
 * Everything is in the BODY frame (not tilted with the heart). The bead on the line is the dipole's
 * projection, i.e. exactly what the lead records: toward (+) the trace goes up.
 */

const BEAM = '#22d3ee';
const START_R = 1.45;
const END_R = 1.35;

type Hit = { entry: THREE.Vector3; exit: THREE.Vector3; normal: THREE.Vector3 };

/** Cylinder transform joining a → b */
function segment(a: THREE.Vector3, b: THREE.Vector3) {
  const d = b.clone().sub(a);
  const len = Math.max(1e-4, d.length());
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return { position: a.clone().add(b).multiplyScalar(0.5), quaternion: q, len };
}

function Rod({ a, b, r, color, opacity = 1, xray = false, order = 0, additive = false }: {
  a: THREE.Vector3; b: THREE.Vector3; r: number; color: string; opacity?: number; xray?: boolean; order?: number; additive?: boolean;
}) {
  const s = useMemo(() => segment(a, b), [a, b]);
  return (
    <mesh position={s.position} quaternion={s.quaternion} renderOrder={order}>
      <cylinderGeometry args={[r, r, s.len, 14, 1, true]} />
      <meshBasicMaterial
        color={color} transparent={opacity < 1 || xray} opacity={opacity} depthTest={!xray} depthWrite={!xray && opacity >= 1}
        toneMapped={false} blending={additive ? THREE.AdditiveBlending : THREE.NormalBlending}
      />
    </mesh>
  );
}

function LeadBeam({ center, dir, lead, reversed }: { center: THREE.Vector3; dir: THREE.Vector3; lead: StandardLead; reversed: boolean }) {
  const scene = useThree((s) => s.scene);
  const viewMode = useAppStore((s) => s.viewMode);
  const [hit, setHit] = useState<Hit | null>(null);
  const tries = useRef(0);
  const chevrons = useRef<(THREE.Mesh | null)[]>([]);
  const ring = useRef<THREE.Group>(null);

  // Find where the view line meets the heart wall (and leaves it) on the visible heart mesh
  useEffect(() => { setHit(null); tries.current = 0; }, [dir, viewMode]);
  useFrame(() => {
    if (hit || tries.current > 90) return;
    tries.current++;
    const targets: THREE.Object3D[] = [];
    scene.traverseVisible((o) => { if (o.userData.leadTarget) targets.push(o); });
    if (!targets.length) return;
    scene.updateMatrixWorld();
    const rc = new THREE.Raycaster();
    rc.set(center.clone().addScaledVector(dir, 3), dir.clone().negate());
    const a = rc.intersectObjects(targets, false)[0];
    rc.set(center.clone().addScaledVector(dir, -3), dir.clone());
    const b = rc.intersectObjects(targets, false)[0];
    if (!a || !b) {
      if (tries.current > 30) setHit({ entry: dir.clone().multiplyScalar(0.7), exit: dir.clone().multiplyScalar(-0.7), normal: dir.clone() });
      return;
    }
    const n = a.face ? a.face.normal.clone().transformDirection(a.object.matrixWorld) : dir.clone();
    if (n.dot(dir) < 0) n.negate();
    setHit({ entry: a.point.clone().sub(center), exit: b.point.clone().sub(center), normal: n.normalize() });
  });

  const start = useMemo(() => dir.clone().multiplyScalar(START_R), [dir]);
  const end = useMemo(() => dir.clone().multiplyScalar(-END_R), [dir]);
  const entry = hit?.entry ?? dir.clone().multiplyScalar(0.7);
  const exit = hit?.exit ?? dir.clone().multiplyScalar(-0.7);
  const ringQuat = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), hit?.normal ?? dir),
    [hit, dir],
  );
  const coneQuat = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate()), [dir]);
  const view = LEAD_VIEWS[lead];

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    chevrons.current.forEach((m, i) => {
      if (!m) return;
      const k = (t * 0.55 + i / 3) % 1;
      m.position.lerpVectors(start, entry, k);
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.sin(Math.PI * k) * 0.95;
    });
    if (ring.current) ring.current.scale.setScalar(1 + 0.18 * Math.sin(t * 4));
  });

  return (
    <group>
      {/* solid beam from the viewpoint to the heart wall, with a soft glow */}
      <Rod a={start} b={entry} r={0.02} color={BEAM} order={12} />
      <Rod a={start} b={entry} r={0.055} color={BEAM} opacity={0.22} additive order={11} />
      {/* the same line seen through the heart, and on toward the negative pole */}
      <Rod a={start} b={entry} r={0.012} color={BEAM} opacity={0.55} xray order={13} />
      <Rod a={entry} b={exit} r={0.014} color={BEAM} opacity={0.6} xray order={13} />
      <Rod a={exit} b={end} r={0.008} color="#94a3b8" opacity={0.55} xray order={13} />
      {/* arrows travelling inward: the direction the lead looks */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(m) => { chevrons.current[i] = m; }} quaternion={coneQuat} renderOrder={14}>
          <coneGeometry args={[0.055, 0.12, 18]} />
          <meshBasicMaterial color="#ecfeff" transparent depthTest={false} toneMapped={false} />
        </mesh>
      ))}
      {/* eye marker where the view starts */}
      <mesh position={start} renderOrder={14}>
        <sphereGeometry args={[0.07, 24, 24]} />
        <meshBasicMaterial color={BEAM} depthTest={false} toneMapped={false} />
      </mesh>
      <mesh position={start} renderOrder={13}>
        <sphereGeometry args={[0.13, 24, 24]} />
        <meshBasicMaterial color={BEAM} transparent opacity={0.25} depthTest={false} toneMapped={false} />
      </mesh>
      {/* ring on the wall this lead faces */}
      <group position={entry} quaternion={ringQuat}>
        <group ref={ring}>
          <mesh renderOrder={12}>
            <torusGeometry args={[0.13, 0.016, 12, 48]} />
            <meshBasicMaterial color={BEAM} toneMapped={false} />
          </mesh>
          <mesh renderOrder={13}>
            <torusGeometry args={[0.13, 0.01, 12, 48]} />
            <meshBasicMaterial color={BEAM} transparent opacity={0.35} depthTest={false} toneMapped={false} />
          </mesh>
        </group>
      </group>
      <Html position={start.clone().multiplyScalar(1.13).toArray()} center style={{ pointerEvents: 'none' }} zIndexRange={[45, 40]}>
        <div className="px-1.5 py-0.5 rounded bg-cyan-400 text-slate-950 text-center leading-tight whitespace-nowrap shadow">
          <div className="text-[12px] font-bold">{lead} (+)</div>
          <div className="text-[9px] font-semibold">looks from here</div>
        </div>
      </Html>
      <Html position={entry.clone().addScaledVector(hit?.normal ?? dir, 0.28).toArray()} center style={{ pointerEvents: 'none' }} zIndexRange={[44, 40]}>
        <div className={`px-1.5 py-0.5 rounded bg-slate-950/85 border text-[10px] font-semibold whitespace-nowrap ${reversed ? 'border-amber-400/80 text-amber-200' : 'border-cyan-400/70 text-cyan-100'}`}>
          {reversed ? 'Cables reversed: not its usual view' : view.short}
        </div>
      </Html>
      <Html position={end.clone().multiplyScalar(1.1).toArray()} center style={{ pointerEvents: 'none' }} zIndexRange={[43, 40]}>
        <div className="px-1.5 py-0.5 rounded bg-slate-700/90 text-slate-200 text-[10px] whitespace-nowrap">(−)</div>
      </Html>
    </group>
  );
}

/** Turn the camera so the view line is seen from the side and fits on screen */
function useFrameLeadView(center: THREE.Vector3, dir: THREE.Vector3 | null, lead: StandardLead | null) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  useEffect(() => {
    if (!dir || !lead) return;
    const offset = camera.position.clone().sub(center);
    const dist = offset.length();
    const camDir = offset.normalize();
    let target = camDir.clone();
    if (Math.abs(camDir.dot(dir)) > 0.75) {
      // looking along the line: swing to a front-ish view from the side of the (+) pole
      const f = new THREE.Vector3(0, 0.25, 1).normalize();
      let perp = f.clone().addScaledVector(dir, -f.dot(dir));
      if (perp.length() < 0.35) {
        const g = new THREE.Vector3(0.7, 0.45, 0.55).normalize();
        perp = g.addScaledVector(dir, -g.dot(dir));
      }
      target = perp.normalize().addScaledVector(dir, 0.45).normalize();
    }
    const fits = (d: number) => {
      const cam = camera.clone();
      cam.position.copy(center).addScaledVector(target, d);
      cam.lookAt(center);
      cam.updateMatrixWorld();
      return [dir.clone().multiplyScalar(START_R * 1.13), dir.clone().multiplyScalar(-END_R)].every((p) => {
        const s = p.add(center).project(cam);
        return Math.abs(s.x) < 0.72 && Math.abs(s.y) < 0.8; // room for the labels
      });
    };
    let d = dist;
    for (const cand of [dist, 4.4, 5.2, 6.2, 7.4]) {
      if (cand < dist) continue;
      d = cand;
      if (fits(cand)) break;
    }
    if (target.distanceTo(camDir) < 1e-3 && Math.abs(d - dist) < 1e-3) return;
    useSceneStore.getState().setCameraPreset({ dir: target.toArray() as [number, number, number], distance: d, label: `Lead ${lead}`, short: lead, group: 'anatomic' });
    // only when the lead (or its direction) changes, not on every camera move
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir, lead]);
}

export default function LeadVector({ center, lead, showVector }: { center: THREE.Vector3; lead: StandardLead | null; showVector: boolean }) {
  const placement = useECGStore((s) => s.placement);
  const hidden = useECGStore((s) => s.placementHidden);
  const beadRef = useRef<THREE.Mesh>(null);
  const shadowRef = useRef<THREE.Line>(null);

  // The lead vector actually recorded: a cable reversal turns the view (LA/RA swapped makes lead I
  // look from the right). Mystery mode keeps the standard view so it does not give the answer away.
  const L: Vec3 | null = useMemo(() => {
    if (!lead) return null;
    const std = LEAD_VECTORS[lead];
    if (hidden || isStandard(placement)) return std;
    const eff = leadField(placement)[lead];
    return Math.hypot(...eff) > 0.2 * Math.hypot(...std) ? eff : std;
  }, [lead, placement, hidden]);
  const axisDir = useMemo(() => (L ? bodyToWorld(norm(L)).normalize() : null), [L]);
  // A reversal that turns the view well away from the lead's usual side
  const reversed = useMemo(() => {
    if (!lead || !L) return false;
    const a = norm(L);
    const b = norm(LEAD_VECTORS[lead]);
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] < 0.7;
  }, [lead, L]);
  useFrameLeadView(center, axisDir, lead);

  const arrow = useMemo(() => {
    const a = new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(), 0.5, 0xfde047, 0.12, 0.07);
    (a.line.material as THREE.LineBasicMaterial).depthTest = false;
    (a.cone.material as THREE.MeshBasicMaterial).depthTest = false;
    a.line.renderOrder = 20;
    a.cone.renderOrder = 20;
    return a;
  }, []);
  const shadow = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    return new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#fde047', transparent: true, opacity: 0.35, depthTest: false }));
  }, []);

  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const d = sim.engine.dipole(sim.time);
    tmp.copy(bodyToWorld([d[0], d[1], d[2]]));
    const mag = tmp.length();
    const visible = showVector && mag > 0.03;
    arrow.visible = visible;
    if (visible) {
      arrow.setDirection(tmp.clone().normalize());
      arrow.setLength(0.25 + mag * 0.65, 0.12, 0.07);
    }
    if (beadRef.current && axisDir && L) {
      // projection onto the lead axis = lead voltage (the lead vector includes lead gain)
      const v = d[0] * L[0] + d[1] * L[1] + d[2] * L[2];
      const len = Math.max(-1.3, Math.min(1.3, v * 0.65));
      beadRef.current.position.copy(axisDir).multiplyScalar(len);
      beadRef.current.visible = Math.abs(v) > 0.02;
      (beadRef.current.material as THREE.MeshBasicMaterial).color.set(v >= 0 ? '#34d399' : '#f87171');
      if (shadowRef.current && visible) {
        const tip = tmp.clone().normalize().multiplyScalar(0.25 + mag * 0.65);
        const pos = shadow.geometry.attributes.position as THREE.BufferAttribute;
        pos.setXYZ(0, tip.x, tip.y, tip.z);
        pos.setXYZ(1, beadRef.current.position.x, beadRef.current.position.y, beadRef.current.position.z);
        pos.needsUpdate = true;
        shadowRef.current.visible = true;
      } else if (shadowRef.current) shadowRef.current.visible = false;
    }
  });

  return (
    <group position={center}>
      <primitive object={arrow} />
      {axisDir && lead && (
        <>
          <LeadBeam center={center} dir={axisDir} lead={lead} reversed={reversed} />
          <primitive object={shadow} ref={shadowRef} />
          <mesh ref={beadRef} renderOrder={21}>
            <sphereGeometry args={[0.05, 16, 16]} />
            <meshBasicMaterial color="#34d399" depthTest={false} />
          </mesh>
        </>
      )}
    </group>
  );
}
