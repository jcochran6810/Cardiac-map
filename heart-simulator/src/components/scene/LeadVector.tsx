'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { sim } from '@/lib/sim/simulation';
import { leadDirection, LEAD_VECTORS, type AnyLead } from '@/lib/ecg/vector';
import { bodyToWorld } from '@/lib/anatomy/frames';

/**
 * ECG lead axis + the instantaneous cardiac dipole ("vector"), drawn in the BODY
 * frame (not tilted with the heart). The yellow arrow is the electrical vector at
 * this instant; the bead on the lead axis is its projection — i.e. exactly what
 * that lead records. When the arrow points toward the (+) electrode the lead
 * deflects upward.
 */
export default function LeadVector({ center, lead, showVector }: { center: THREE.Vector3; lead: AnyLead | null; showVector: boolean }) {
  const arrowRef = useRef<THREE.ArrowHelper>(null);
  const beadRef = useRef<THREE.Mesh>(null);
  const shadowRef = useRef<THREE.Line>(null);

  const axisDir = useMemo(() => (lead ? bodyToWorld(leadDirection(lead)).normalize() : null), [lead]);
  const axisLine = useMemo(() => {
    if (!axisDir) return null;
    const g = new THREE.BufferGeometry().setFromPoints([axisDir.clone().multiplyScalar(-1.55), axisDir.clone().multiplyScalar(1.55)]);
    return new THREE.Line(g, new THREE.LineDashedMaterial({ color: '#f59e0b', dashSize: 0.06, gapSize: 0.035, transparent: true, opacity: 0.9, depthTest: false }));
  }, [axisDir]);
  if (axisLine) axisLine.computeLineDistances();

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
    if (beadRef.current && axisDir && lead) {
      // projection onto the lead axis = lead voltage (body-frame lead vector includes lead gain)
      const L = LEAD_VECTORS[lead];
      const v = d[0] * L[0] + d[1] * L[1] + d[2] * L[2];
      const len = Math.max(-1.4, Math.min(1.4, v * 0.65));
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
      <primitive object={arrow} ref={arrowRef} />
      {axisLine && axisDir && lead && (
        <>
          <primitive object={axisLine} />
          <primitive object={shadow} ref={shadowRef} />
          <mesh ref={beadRef} renderOrder={21}>
            <sphereGeometry args={[0.045, 16, 16]} />
            <meshBasicMaterial color="#34d399" depthTest={false} />
          </mesh>
          <Html position={axisDir.clone().multiplyScalar(1.72).toArray()} center style={{ pointerEvents: 'none' }}>
            <div className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 text-[11px] font-bold whitespace-nowrap shadow">{lead} (+)</div>
          </Html>
          <Html position={axisDir.clone().multiplyScalar(-1.72).toArray()} center style={{ pointerEvents: 'none' }}>
            <div className="px-1.5 py-0.5 rounded bg-slate-700/90 text-slate-200 text-[10px] whitespace-nowrap">(−)</div>
          </Html>
        </>
      )}
    </group>
  );
}
