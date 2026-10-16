'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { sim } from '@/lib/sim/simulation';
import type { V3 } from '@/lib/anatomy/landmarks';

/**
 * Blood-flow particles inside the sectioned heart. Each stream only moves when
 * its valve is open (AV valves in diastole, semilunar valves in systole), so
 * learners can see filling vs ejection and which valves are open in each phase.
 */

interface Stream {
  pts: V3[];
  color: string;
  valve: 'av' | 'semilunar' | 'venous';
  count: number;
  speed: number;
}

const OXY = '#ff4d4d';
const DEOXY = '#4d7dff';

const STREAMS: Stream[] = [
  // Points sit just in front of the first visible surface of the cut specimen (ray-tested against the mesh)
  // venous return (continuous, slows during atrial systole)
  { pts: [[-0.27, -0.19, 0.76], [-0.37, -0.17, 0.42], [-0.41, 0.2, 0.16]], color: DEOXY, valve: 'venous', count: 10, speed: 0.0011 },
  { pts: [[-0.5, 0.05, -0.15], [-0.44, 0.27, 0.04]], color: DEOXY, valve: 'venous', count: 6, speed: 0.0011 },
  { pts: [[0.58, 0.07, 0.22], [0.46, 0.1, 0.16]], color: OXY, valve: 'venous', count: 6, speed: 0.0011 },
  // AV valves: atria → ventricles during diastole
  { pts: [[-0.42, 0.23, 0.12], [-0.32, 0.18, -0.1], [-0.29, -0.29, -0.36], [-0.24, -0.25, -0.62]], color: DEOXY, valve: 'av', count: 18, speed: 0.0026 },
  { pts: [[0.45, 0.11, 0.15], [0.32, 0.07, -0.06], [0.27, -0.04, -0.32], [0.2, -0.18, -0.6]], color: OXY, valve: 'av', count: 18, speed: 0.0026 },
  // semilunar valves: ventricles → great arteries during ejection
  { pts: [[0.2, -0.18, -0.6], [0.12, -0.09, -0.28], [0.04, -0.35, -0.02], [0.04, -0.43, 0.3], [0.08, -0.41, 0.72]], color: OXY, valve: 'semilunar', count: 22, speed: 0.0034 },
  { pts: [[-0.2, -0.12, -0.58], [-0.06, -0.38, -0.22], [0.1, -0.55, 0.1], [0.3, -0.35, 0.38]], color: DEOXY, valve: 'semilunar', count: 18, speed: 0.0034 },
];

function StreamMesh({ stream }: { stream: Stream }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const curve = useMemo(() => new THREE.CatmullRomCurve3(stream.pts.map((p) => new THREE.Vector3(...p))), [stream]);
  const offsets = useMemo(() => Array.from({ length: stream.count }, (_, i) => i / stream.count + (Math.sin(i * 12.9898) * 0.5 + 0.5) * 0.04), [stream.count]);
  const jitter = useMemo(() => Array.from({ length: stream.count }, (_, i) => new THREE.Vector3(Math.sin(i * 3.1) * 0.025, Math.cos(i * 1.7) * 0.012, Math.sin(i * 5.3) * 0.025)), [stream.count]);
  const phase = useRef(0);
  const lastT = useRef(sim.time);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const m = sim.engine.mechanics(sim.time);
    let open: number;
    if (stream.valve === 'av') open = m.mitralOpen;
    else if (stream.valve === 'semilunar') open = m.aorticOpen;
    else open = 0.55 - 0.35 * m.atrialContraction;
    if (m.phase === 'fibrillation' || m.phase === 'arrest') open = stream.valve === 'venous' ? 0.08 : 0;
    const dt = Math.max(0, Math.min(100, sim.time - lastT.current));
    lastT.current = sim.time;
    phase.current = (phase.current + dt * stream.speed * open) % 1;
    if (matRef.current) matRef.current.opacity = 0.25 + 0.7 * Math.min(1, open * 1.3);
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < stream.count; i++) {
      const s = (offsets[i] + phase.current) % 1;
      curve.getPointAt(s, tmp);
      dummy.position.copy(tmp).add(jitter[i]);
      const fadeEnds = Math.min(1, s * 8, (1 - s) * 8);
      dummy.scale.setScalar(0.6 + 0.6 * fadeEnds);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, stream.count]} renderOrder={5}>
      <sphereGeometry args={[0.017, 8, 8]} />
      <meshBasicMaterial ref={matRef} color={stream.color} transparent depthWrite={false} />
    </instancedMesh>
  );
}

export default function FlowParticles() {
  return (
    <group>
      {STREAMS.map((s, i) => (
        <StreamMesh key={i} stream={s} />
      ))}
    </group>
  );
}
