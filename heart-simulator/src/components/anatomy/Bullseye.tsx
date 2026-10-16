'use client';

import React, { useState } from 'react';
import { AHA17, TERRITORY_COLORS, WALL_LEADS, wallOf, type Segment17, type Territory } from '@/lib/anatomy/aha17';

const RADII: Record<Segment17['level'], [number, number]> = { apex: [0, 13], apical: [13, 26], mid: [26, 39], basal: [39, 52] };

function arc(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) {
  const p = (r: number, a: number) => [cx + r * Math.cos((a * Math.PI) / 180), cy - r * Math.sin((a * Math.PI) / 180)];
  const large = a1 - a0 > 180 ? 1 : 0;
  const [x0, y0] = p(r1, a0);
  const [x1, y1] = p(r1, a1);
  const [x2, y2] = p(r0, a1);
  const [x3, y3] = p(r0, a0);
  return `M${x0} ${y0} A${r1} ${r1} 0 ${large} 0 ${x1} ${y1} L${x2} ${y2} A${r0} ${r0} 0 ${large} 1 ${x3} ${y3} Z`;
}

/**
 * AHA 17-segment bull's-eye (polar map) coloured by coronary territory.
 * The culprit territory pulses when an acute MI profile is active.
 */
export default function Bullseye({ culprit, size = 128 }: { culprit?: Territory; size?: number }) {
  const [hover, setHover] = useState<Segment17 | null>(null);
  const c = 60;
  return (
    <div className="flex flex-col items-center" style={{ width: size + 8 }}>
      <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label="AHA 17-segment bull's-eye">
        {AHA17.map((s) => {
          const [r0, r1] = RADII[s.level];
          const d = s.level === 'apex' ? undefined : arc(c, c, r0, r1, s.a0, s.a1);
          const isCulprit = culprit === s.territory;
          const fill = TERRITORY_COLORS[s.territory];
          const mid = ((s.a0 + s.a1) / 2) * (Math.PI / 180);
          const rm = s.level === 'apex' ? 0 : (r0 + r1) / 2;
          const common = {
            fill,
            fillOpacity: hover?.n === s.n ? 0.95 : isCulprit ? 0.85 : 0.55,
            stroke: '#0b1220',
            strokeWidth: 1,
            onMouseEnter: () => setHover(s),
            onMouseLeave: () => setHover(null),
            className: isCulprit ? 'bullseye-culprit' : undefined,
            style: { cursor: 'default' },
          };
          return (
            <g key={s.n}>
              {s.level === 'apex' ? <circle cx={c} cy={c} r={r1} {...common} /> : <path d={d} {...common} />}
              <text x={c + rm * Math.cos(mid)} y={c - rm * Math.sin(mid) + 2.5} textAnchor="middle" fontSize="7" fill="#0b1220" fontWeight={700} pointerEvents="none">{s.n}</text>
            </g>
          );
        })}
        <text x={c} y={6} textAnchor="middle" fontSize="6" fill="#94a3b8">Anterior</text>
        <text x={c} y={118} textAnchor="middle" fontSize="6" fill="#94a3b8">Inferior</text>
        <text x={3} y={c + 2} fontSize="6" fill="#94a3b8">Sept</text>
        <text x={117} y={c + 2} textAnchor="end" fontSize="6" fill="#94a3b8">Lat</text>
      </svg>
      <div className="h-7 text-[9px] leading-tight text-center text-slate-300">
        {hover ? (
          <>
            <b className="text-white">{hover.n}. {hover.name}</b> · {hover.territory}
            <br />
            <span className="text-slate-400">Leads: {WALL_LEADS[wallOf(hover)]}</span>
          </>
        ) : (
          <span className="text-slate-500">AHA 17-segment model · hover a segment</span>
        )}
      </div>
    </div>
  );
}
