'use client';

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useSceneStore } from '@/store/useSceneStore';

/**
 * Reports the C-arm projection equivalent to the current camera direction.
 * World frame: +x patient's left, +y superior, +z anterior. The viewer stands where the
 * image detector would be, so LAO = detector toward the patient's left and cranial =
 * detector toward the head (same convention as SlicerHeart's Virtual Cath Lab and
 * standard angiography: primary angle = atan2(left, anterior), secondary = asin(superior)).
 */
export default function CArmTracker() {
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const last = useRef(0);
  const dir = useRef(new THREE.Vector3());
  useFrame(({ camera, clock }) => {
    const now = clock.elapsedTime;
    if (now - last.current < 0.2) return;
    last.current = now;
    const target = controls?.target ?? new THREE.Vector3();
    dir.current.copy(camera.position).sub(target).normalize();
    const primary = Math.round((Math.atan2(dir.current.x, dir.current.z) * 180) / Math.PI);
    const secondary = Math.round((Math.asin(Math.max(-1, Math.min(1, dir.current.y))) * 180) / Math.PI);
    useSceneStore.getState().setCarm(primary, secondary);
  });
  return null;
}

export function formatCarm(primary: number, secondary: number): string {
  const p = Math.abs(primary) < 3 ? 'AP' : `${primary > 0 ? 'LAO' : 'RAO'} ${Math.abs(primary)}°`;
  const s = Math.abs(secondary) < 3 ? '' : ` · ${secondary > 0 ? 'CRA' : 'CAU'} ${Math.abs(secondary)}°`;
  return p + s;
}
