'use client';

import React from 'react';
import { angleText } from '@/lib/cathlab/views';

/**
 * Where the C-arm is for a view: on the left, the patient seen from the feet (the image detector swings
 * toward the patient's right for RAO, left for LAO); on the right, seen from the side (the detector
 * tilts toward the head for cranial, the feet for caudal). The X-ray tube is always opposite the detector.
 */
export default function CArmDiagram({ rot, ang, className = '' }: { rot: number; ang: number; className?: string }) {
  const r = (rot * Math.PI) / 180;
  const a = (ang * Math.PI) / 180;
  // seen from the feet: centre (50, 56); the patient's right is on the viewer's left
  const det1 = { x: 50 + 36 * Math.sin(r), y: 56 - 36 * Math.cos(r) };
  const tube1 = { x: 50 - 36 * Math.sin(r), y: 56 + 36 * Math.cos(r) };
  // seen from the side: centre (152, 56), head on the left
  const det2 = { x: 152 - 34 * Math.sin(a), y: 56 - 34 * Math.cos(a) };
  const tube2 = { x: 152 + 34 * Math.sin(a), y: 56 + 34 * Math.cos(a) };
  const rotLabel = rot === 0 ? 'AP' : `${rot < 0 ? 'RAO' : 'LAO'} ${Math.abs(rot)}°`;
  const angLabel = ang === 0 ? 'no tilt' : `${ang > 0 ? 'cranial' : 'caudal'} ${Math.abs(ang)}°`;
  return (
    <svg viewBox="0 0 204 104" className={className} role="img" aria-label={`C-arm position: ${angleText({ rot, ang })}`}>
      {/* from the feet */}
      <circle cx="50" cy="56" r="36" className="fill-none stroke-slate-700" strokeDasharray="2 3" />
      <ellipse cx="50" cy="58" rx="24" ry="14" className="fill-slate-700/80 stroke-slate-500" />
      <circle cx="50" cy="68" r="3" className="fill-slate-500" />
      <path d="M48 55 q6 -7 12 0 q-6 6 -12 0z" className="fill-rose-400/80" />
      <text x="20" y="62" className="fill-slate-400 text-[8px]" textAnchor="middle">R</text>
      <text x="80" y="62" className="fill-slate-400 text-[8px]" textAnchor="middle">L</text>
      <line x1={tube1.x} y1={tube1.y} x2={det1.x} y2={det1.y} className="stroke-sky-300/40" strokeWidth="5" />
      <rect x={det1.x - 9} y={det1.y - 3} width="18" height="6" rx="1.5" transform={`rotate(${rot} ${det1.x} ${det1.y})`} className="fill-sky-300" />
      <circle cx={tube1.x} cy={tube1.y} r="3.5" className="fill-amber-300" />
      <text x="50" y="102" className="fill-slate-200 text-[9px] font-semibold" textAnchor="middle">{rotLabel}</text>

      {/* from the side */}
      <circle cx="152" cy="56" r="34" className="fill-none stroke-slate-700" strokeDasharray="2 3" />
      <rect x="128" y="52" width="52" height="11" rx="5.5" className="fill-slate-700/80 stroke-slate-500" />
      <circle cx="124" cy="57" r="6" className="fill-slate-700/80 stroke-slate-500" />
      <text x="124" y="76" className="fill-slate-400 text-[7px]" textAnchor="middle">head</text>
      <text x="180" y="76" className="fill-slate-400 text-[7px]" textAnchor="middle">feet</text>
      <line x1={tube2.x} y1={tube2.y} x2={det2.x} y2={det2.y} className="stroke-sky-300/40" strokeWidth="5" />
      <rect x={det2.x - 9} y={det2.y - 3} width="18" height="6" rx="1.5" transform={`rotate(${-ang} ${det2.x} ${det2.y})`} className="fill-sky-300" />
      <circle cx={tube2.x} cy={tube2.y} r="3.5" className="fill-amber-300" />
      <text x="152" y="102" className="fill-slate-200 text-[9px] font-semibold" textAnchor="middle">{angLabel}</text>
    </svg>
  );
}
