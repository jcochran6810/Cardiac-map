'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { useConditionStore } from '@/store/useConditionStore';
import { computeHemodynamics, getConditionParams, hasHemodynamicPreset, type HemodynamicSnapshot } from '@/lib/physiology/cardiacCycle';
import { CONDITION_SHORT_NAMES } from '@/data/navigation';

/**
 * Live hemodynamics overlay: pressure and volume curves for one beat with a
 * cursor synced to the same beat progress that drives the ECG playhead and
 * the 3D contraction, plus valve states and derived numbers.
 */

const CURVE_SAMPLES = 120;
const CURVE_END = 1.2; // progress units drawn (a beat's events end at 1.0)

export default function HemodynamicsPanel() {
  const { hemodynamicsOpen, toggleHemodynamics } = useAppStore();
  const { selectedConditionId } = useConditionStore();
  const heartRate = useTimelineStore((s) => s.heartRate);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [snap, setSnap] = useState<HemodynamicSnapshot | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const params = useMemo(() => getConditionParams(selectedConditionId, heartRate), [selectedConditionId, heartRate]);

  // Pre-compute one beat's curves whenever the parameters change
  const curves = useMemo(() => {
    const lvp: number[] = [], aop: number[] = [], lap: number[] = [], lvv: number[] = [];
    for (let i = 0; i <= CURVE_SAMPLES; i++) {
      const p = (i / CURVE_SAMPLES) * CURVE_END;
      const h = computeHemodynamics(p, params);
      lvp.push(h.lv.pressure); aop.push(h.aorticPressure); lap.push(h.laPressure); lvv.push(h.lv.volume);
    }
    const pMax = Math.max(160, ...lvp, ...aop) * 1.05;
    const vMax = Math.max(...lvv) * 1.1;
    const vMin = Math.min(...lvv) * 0.7;
    return { lvp, aop, lap, lvv, pMax, vMax, vMin };
  }, [params]);

  useEffect(() => {
    if (!hemodynamicsOpen) return;
    let raf = 0;
    let lastUi = 0;
    const draw = (now: number) => {
      const t = useTimelineStore.getState();
      const progress = t.cycleProgress;
      const h = computeHemodynamics(progress, params, { atrialKick: t.beatHasP, ventricularBeat: t.beatHasQRS && !t.fibrillating });
      if (now - lastUi > 120) { setSnap(h); lastUi = now; }

      const canvas = canvasRef.current;
      if (canvas && !collapsed) {
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth, hgt = canvas.clientHeight;
        if (canvas.width !== w * dpr || canvas.height !== hgt * dpr) {
          canvas.width = w * dpr; canvas.height = hgt * dpr;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, w, hgt);
          const pad = 4;
          const pressureH = hgt * 0.62;
          const volumeTop = pressureH + 6;
          const volumeH = hgt - volumeTop - pad;
          const xOf = (i: number) => pad + (i / CURVE_SAMPLES) * (w - 2 * pad);
          const yP = (v: number) => pad + (1 - v / curves.pMax) * (pressureH - 2 * pad);
          const yV = (v: number) => volumeTop + (1 - (v - curves.vMin) / (curves.vMax - curves.vMin)) * (volumeH - pad);

          // Grid / separators
          ctx.strokeStyle = 'rgba(148,163,184,0.15)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(pad, pressureH); ctx.lineTo(w - pad, pressureH); ctx.stroke();
          [50, 100, 150].forEach((g) => { if (g < curves.pMax) { ctx.beginPath(); ctx.moveTo(pad, yP(g)); ctx.lineTo(w - pad, yP(g)); ctx.stroke(); } });

          const line = (arr: number[], y: (v: number) => number, color: string, width = 1.5) => {
            ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
            arr.forEach((v, i) => { const x = xOf(i); if (i === 0) ctx.moveTo(x, y(v)); else ctx.lineTo(x, y(v)); });
            ctx.stroke();
          };
          line(curves.lap, yP, '#60a5fa', 1);
          line(curves.aop, yP, '#f59e0b', 1.5);
          line(curves.lvp, yP, '#ef4444', 1.8);
          line(curves.lvv, yV, '#34d399', 1.5);

          // Cursor synced with the ECG playhead / 3D heart
          const cx = xOf(Math.min(progress, CURVE_END) / CURVE_END * CURVE_SAMPLES);
          ctx.strokeStyle = 'rgba(245,158,11,0.7)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(cx, pad); ctx.lineTo(cx, hgt - pad); ctx.stroke(); ctx.setLineDash([]);
          const dot = (y: number, color: string) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, y, 2.5, 0, Math.PI * 2); ctx.fill(); };
          dot(yP(h.lv.pressure), '#ef4444'); dot(yP(h.aorticPressure), '#f59e0b'); dot(yV(h.lv.volume), '#34d399');

          // Axis labels
          ctx.fillStyle = '#94a3b8'; ctx.font = '8px monospace';
          ctx.fillText('mmHg', pad + 1, pad + 8);
          ctx.fillText('LV vol (mL)', pad + 1, volumeTop + 8);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [hemodynamicsOpen, params, curves, collapsed]);

  if (!hemodynamicsOpen) return null;

  const presetLabel = selectedConditionId && hasHemodynamicPreset(selectedConditionId)
    ? (CONDITION_SHORT_NAMES[selectedConditionId] ?? selectedConditionId)
    : 'Normal physiology';

  const Valve = ({ label, open }: { label: string; open: boolean }) => (
    <span className={`px-1 rounded text-[9px] font-mono ${open ? 'bg-emerald-500/25 text-emerald-300' : 'bg-cardiac-dark text-slate-500'}`} title={`${label} valve ${open ? 'open' : 'closed'}`}>{label}</span>
  );

  return (
    <div className="absolute top-2 right-2 z-10 w-56 bg-cardiac-panel/95 backdrop-blur-sm border border-slate-700 rounded-lg text-xs shadow-lg">
      <div className="flex items-center justify-between px-2 py-1 border-b border-slate-700/60">
        <button onClick={() => setCollapsed((c) => !c)} className="text-[10px] font-semibold text-white flex items-center gap-1">
          <span className="text-slate-500">{collapsed ? '▶' : '▼'}</span> Hemodynamics
        </button>
        <button onClick={toggleHemodynamics} className="text-slate-500 hover:text-white text-sm leading-none" title="Close">×</button>
      </div>
      <div className="px-2 pt-1 text-[9px] text-slate-500 truncate" title={presetLabel}>{presetLabel}</div>

      {!collapsed && (
        <>
          <canvas ref={canvasRef} className="w-full h-28 block" />
          <div className="px-2 pb-1 flex gap-2 text-[9px]">
            <span className="text-red-400">— LVP</span>
            <span className="text-amber-400">— AoP</span>
            <span className="text-blue-400">— LAP</span>
            <span className="text-emerald-400">— LV vol</span>
          </div>
        </>
      )}

      {snap && (
        <div className="px-2 pb-2 space-y-1">
          <div className="grid grid-cols-3 gap-1 font-mono">
            <Stat label="LVP" value={snap.lv.pressure.toFixed(0)} color="text-red-400" />
            <Stat label="AoP" value={snap.aorticPressure.toFixed(0)} color="text-amber-400" />
            <Stat label="LAP" value={snap.laPressure.toFixed(0)} color="text-blue-400" />
            <Stat label="LV vol" value={`${snap.lv.volume.toFixed(0)}`} color="text-emerald-400" />
            <Stat label="EF" value={`${(snap.ejectionFraction * 100).toFixed(0)}%`} color="text-white" />
            <Stat label="CO" value={`${snap.cardiacOutput.toFixed(1)}`} color="text-white" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-slate-500">{snap.phase}</span>
            <div className="flex gap-1">
              <Valve label="T" open={snap.tricuspidValve.open} />
              <Valve label="P" open={snap.pulmonaryValve.open} />
              <Valve label="M" open={snap.mitralValve.open} />
              <Valve label="A" open={snap.aorticValve.open} />
            </div>
          </div>
          <div className="text-[9px] text-slate-600">
            SV {snap.strokeVolume.toFixed(0)} mL · BP {params.aorticSystolic}/{params.aorticDiastolic}
            {params.aorticGradient > 0 && ` · AV gradient ${params.aorticGradient}`}
            {params.mitralRegurgitant && ' · MR'}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-cardiac-dark rounded px-1 py-0.5">
      <div className="text-[8px] text-slate-500 uppercase">{label}</div>
      <div className={`text-[11px] ${color}`}>{value}</div>
    </div>
  );
}
