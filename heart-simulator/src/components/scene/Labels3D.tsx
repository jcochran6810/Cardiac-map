'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { LANDMARK_BY_ID, HEART_CENTER, type Landmark } from '@/lib/anatomy/landmarks';
import { CONDUCTION_IDS } from '@/lib/anatomy/categories';
import type { ViewMode } from '@/store/useAppStore';

/** Which labels appear in each view when "Labels" is on */
export const LABEL_SETS: Record<ViewMode, string[]> = {
  external: [
    'right-atrium', 'right-atrial-appendage', 'left-atrial-appendage', 'left-atrium', 'right-ventricle', 'left-ventricle',
    'svc', 'ivc', 'ascending-aorta', 'aortic-arch', 'descending-aorta', 'pulmonary-trunk', 'pulmonary-veins',
    'lad-proximal', 'lad-mid', 'rca-proximal', 'rca-mid', 'lcx-proximal', 'om1', 'pda', 'coronary-sinus', 'apex',
  ],
  sectioned: [
    'right-atrium', 'left-atrium', 'right-ventricle', 'left-ventricle', 'tricuspid-valve', 'mitral-valve', 'aortic-valve',
    'interventricular-septum', 'interatrial-septum', 'svc', 'ascending-aorta', 'pulmonary-trunk', 'anterolateral-papillary-muscle',
    'moderator-band', 'chordae-tendineae', 'apex',
  ],
  xray: [
    'right-atrium', 'left-atrium', 'right-ventricle', 'left-ventricle', 'tricuspid-valve', 'mitral-valve', 'aortic-valve', 'pulmonary-valve',
    'interventricular-septum', 'interatrial-septum', 'svc', 'ivc', 'ascending-aorta', 'pulmonary-trunk',
  ],
  conduction: [
    'sa-node', 'bachmanns-bundle', 'av-node', 'bundle-of-his', 'right-bundle-branch', 'left-bundle-branch',
    'left-anterior-fascicle', 'left-posterior-fascicle', 'purkinje-fibers',
  ],
  activation: ['right-ventricle', 'left-ventricle', 'apex', 'right-atrial-appendage', 'left-atrial-appendage', 'pulmonary-trunk', 'coronary-sinus'],
  territories: [
    'lad-proximal', 'lad-mid', 'lad-distal', 'd1', 'lcx-proximal', 'om1', 'om2', 'rca-proximal', 'rca-mid', 'rca-distal', 'pda',
    'posterolateral-branch', 'am-branch',
  ],
};

export function anchorFor(l: Landmark, mode: ViewMode): [number, number, number] {
  if (mode === 'sectioned' && l.section) return l.section;
  return l.pos;
}

/** Is this landmark meaningfully visible in the given view? */
function relevant(l: Landmark, mode: ViewMode): boolean {
  switch (mode) {
    case 'external':
    case 'territories':
    case 'activation':
      return l.surface;
    case 'sectioned':
      return !!l.section;
    case 'conduction':
      return CONDUCTION_IDS.includes(l.id) || !l.surface;
    case 'xray':
      return true;
  }
}

interface Props {
  mode: ViewMode;
  labelsVisible: boolean;
  selectedId: string | null;
  highlightIds: string[];
  onSelect: (id: string) => void;
}

type Kind = 'selected' | 'highlight' | 'normal';

export default function Labels3D({ mode, labelsVisible, selectedId, highlightIds, onSelect }: Props) {
  const g3 = useRef<THREE.Group>(null);
  const dotRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pillRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const { size } = useThree();

  const items = useMemo(() => {
    const out: { l: Landmark; kind: Kind }[] = [];
    const seen = new Set<string>();
    const push = (id: string, kind: Kind) => {
      const l = LANDMARK_BY_ID[id];
      if (!l || seen.has(id)) return;
      if (kind !== 'selected' && !relevant(l, mode)) return;
      seen.add(id);
      out.push({ l, kind });
    };
    if (selectedId) push(selectedId, 'selected');
    highlightIds.forEach((id) => push(id, 'highlight'));
    if (labelsVisible) LABEL_SETS[mode].forEach((id) => push(id, 'normal'));
    return out;
  }, [mode, labelsVisible, selectedId, highlightIds]);

  const tmpA = useMemo(() => new THREE.Vector3(), []);
  const tmpN = useMemo(() => new THREE.Vector3(), []);
  const tmpC = useMemo(() => new THREE.Vector3(), []);
  const center = useMemo(() => new THREE.Vector3(...HEART_CENTER), []);

  useFrame(({ camera }) => {
    const g = g3.current;
    if (!g) return;
    const occluding = mode === 'external' || mode === 'territories' || mode === 'activation';
    const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
    for (const { l, kind } of items) {
      const dot = dotRefs.current[l.id];
      const pill = pillRefs.current[l.id];
      if (!dot || !pill) continue;
      const a = anchorFor(l, mode);
      tmpA.set(a[0], a[1], a[2]);
      // facing test for surface labels (cheap stand-in for occlusion)
      let alpha = 1;
      if (occluding && l.surface) {
        tmpN.copy(tmpA).sub(center).normalize().transformDirection(g.matrixWorld);
        tmpC.copy(tmpA).applyMatrix4(g.matrixWorld);
        const facing = tmpN.dot(camera.position.clone().sub(tmpC).normalize());
        alpha = facing > 0.05 ? 1 : facing > -0.15 ? 0.25 + (facing + 0.15) * 3.5 : 0;
      } else if (mode === 'sectioned') {
        alpha = camera.position.z > -0.5 ? 1 : 0;
      }
      if (kind === 'selected') alpha = Math.max(alpha, 0.9);
      // screen-space de-cluttering
      tmpC.copy(tmpA).applyMatrix4(g.matrixWorld).project(camera);
      const sx = (tmpC.x * 0.5 + 0.5) * size.width;
      const sy = (-tmpC.y * 0.5 + 0.5) * size.height;
      const text = pill.textContent ?? '';
      const w = text.length * (kind === 'selected' ? 7 : 6) + 14;
      const h = kind === 'selected' ? 20 : 16;
      let dy = 0;
      let ok = alpha < 0.05;
      if (!ok) {
        for (const off of [0, 16, -16, 32, -32, 48]) {
          const box = { x0: sx + 8, x1: sx + 8 + w, y0: sy - h + off - 6, y1: sy + off - 6 };
          if (!placed.some((p) => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0)) {
            placed.push(box);
            dy = off;
            ok = true;
            break;
          }
        }
        if (!ok && kind === 'normal') alpha = 0;
        else if (!ok) { placed.push({ x0: sx + 8, x1: sx + 8 + w, y0: sy - h - 6, y1: sy - 6 }); }
      }
      dot.style.opacity = String(alpha);
      pill.style.transform = `translateY(${dy}px)`;
      pill.style.pointerEvents = alpha > 0.3 ? 'auto' : 'none';
    }
  });

  return (
    <group ref={g3}>
      {items.map(({ l, kind }) => {
        const p = anchorFor(l, mode);
        return (
          <Html key={`${l.id}-${kind}`} position={p} zIndexRange={kind === 'selected' ? [40, 30] : kind === 'highlight' ? [29, 20] : [19, 0]} style={{ pointerEvents: 'none' }}>
            <div ref={(el) => { dotRefs.current[l.id] = el; }} className="relative transition-opacity duration-150" style={{ transform: 'translate(-4px, -4px)' }}>
              <span
                className={`absolute left-0 top-0 rounded-full ${kind === 'selected' ? 'w-2.5 h-2.5 bg-sky-400 ring-2 ring-sky-200/60' : kind === 'highlight' ? 'w-2 h-2 bg-amber-400' : 'w-1.5 h-1.5 bg-white/80'}`}
              />
              <button
                ref={(el) => { pillRefs.current[l.id] = el; }}
                onClick={() => onSelect(l.id)}
                className={`absolute whitespace-nowrap rounded px-1.5 py-0.5 font-medium shadow-lg border backdrop-blur-sm transition-transform duration-200 ${
                  kind === 'selected'
                    ? 'left-3 -top-6 text-xs bg-sky-500/90 text-white border-sky-300/60'
                    : kind === 'highlight'
                      ? 'left-2.5 -top-4 text-[10px] bg-amber-500/85 text-slate-950 border-amber-300/60'
                      : 'left-2 -top-3.5 text-[10px] bg-slate-950/70 text-slate-100 border-white/10 hover:bg-slate-800/90'
                }`}
              >
                {kind === 'normal' ? l.short ?? l.name : l.name}
              </button>
            </div>
          </Html>
        );
      })}
    </group>
  );
}
