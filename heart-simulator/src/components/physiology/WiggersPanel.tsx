'use client';

import React, { useEffect, useRef, useState } from 'react';
import { sim } from '@/lib/sim/simulation';
import { cycleEvents } from '@/lib/ecg/engine';
import type { HemoSummary } from '@/lib/physiology/hemodynamics';
import HeartSoundsButton, { HeardLegend } from '@/components/ui/HeartSoundsButton';
import { auscultate, type SoundKind } from '@/lib/physiology/heartSounds';
import { useBlind } from '@/store/useECGStore';
import { LOOP_MIN_HEIGHT, chartRows, placeEventLabels, placeSoundLabels, rowLoopWidth, wiggersLayout, type ValveEvent } from './wiggersLayout';

const SOUND_LABEL: Record<SoundKind, string> = { s1: 'S1', s2: 'S2', s3: 'S3', s4: 'S4', snap: 'OS' };

/**
 * Live Wiggers diagram (ECG, aortic/LV/LA pressure, LV volume, phonocardiogram)
 * plus a pressure–volume loop, all derived from the same beat events as the ECG.
 */

const WINDOW_MS = 2600;
const BG = '#060a10';
const COLORS = {
  ecg: '#3ef08a', aop: '#f87171', lvp: '#fbbf24', lap: '#38bdf8', lvv: '#c084fc', phono: '#e2e8f0',
  grid: 'rgba(148,163,184,0.12)', text: '#94a3b8', label: '#cbd5e1', systole: 'rgba(239,68,68,0.06)', event: 'rgba(226,232,240,0.35)',
};
const FONT = 'ui-sans-serif, system-ui, sans-serif';
/** The pressure lines' key: above the chart, so it never covers the curves or the valve-event labels */
const PRESSURE_KEY: [string, string][] = [['Aortic', COLORS.aop], ['LV', COLORS.lvp], ['LA', COLORS.lap]];

/** Text with a dark halo, so a dashed line or a trace passing behind it never cuts through the letters */
function haloText(c: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  c.lineJoin = 'round';
  c.lineWidth = 3;
  c.strokeStyle = BG;
  c.strokeText(text, x, y);
  c.fillStyle = color;
  c.fillText(text, x, y);
}

export default function WiggersPanel() {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const loopRef = useRef<HTMLCanvasElement>(null);
  const [summary, setSummary] = useState<HemoSummary>(() => sim.hemo.summary(sim.time));
  // The panel can be a wide strip under the heart, a short strip under the 3D heart and a reading, or a narrow column
  // beside a lesson: lay out by its own size
  const rootRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 1000, h: 600 });
  const blind = useBlind();
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      const h = Math.round(e.contentRect.height);
      setBox((b) => (b.w === w && b.h === h ? b : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const mode = wiggersLayout(box.w, box.h);
  const stack = mode === 'stack';

  useEffect(() => {
    const id = window.setInterval(() => setSummary(sim.hemo.summary(sim.time)), 400);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let raf = 0;

    const fit = (c: HTMLCanvasElement) => {
      const r = c.parentElement!.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const W = Math.floor(r.width);
      const H = Math.floor(r.height);
      if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
        c.width = Math.round(W * dpr);
        c.height = Math.round(H * dpr);
      }
      const ctx = c.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { ctx, W, H };
    };

    const render = () => {
      raf = requestAnimationFrame(render);
      const chart = chartRef.current;
      const loop = loopRef.current;
      if (!chart || !loop) return;
      const T = sim.time;
      const { engine, hemo } = sim;

      // ── Wiggers chart ────────────────────────────────────────
      const { ctx, W, H } = fit(chart);
      if (W < 50 || H < 50) return;
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);
      const left = 44;
      const right = W - 8;
      const plotW = right - left;
      const pxPerMs = plotW / WINDOW_MS;
      const t0 = T - WINDOW_MS;
      const X = (t: number) => left + (t - t0) * pxPerMs;

      const rows = chartRows(H);
      const { lane, press, vol } = rows;
      const labelFont = `600 ${rows.font}px ${FONT}`;

      // Systole shading + valve events for beats in view
      const vi0 = Math.max(0, engine.lastVentIndex(t0) - 1);
      const vi1 = engine.lastVentIndex(T);
      const marks: { x: number; label: ValveEvent }[] = [];
      for (let i = vi0; i <= vi1 && i >= 0; i++) {
        const v = engine.vent[i];
        const ev = cycleEvents(v, engine.vent[i + 1] ?? null);
        const xs = X(ev.mc);
        const xe = X(Math.min(ev.ac, T));
        if (xe > left && xs < right) {
          ctx.fillStyle = COLORS.systole;
          ctx.fillRect(Math.max(left, xs), lane.y0, Math.min(right, xe) - Math.max(left, xs), vol.y1 - lane.y0);
        }
        for (const [t, label] of [[ev.mc, 'MC'], [ev.ao, 'AO'], [ev.ac, 'AC'], [ev.mo, 'MO']] as [number, ValveEvent][]) {
          if (t <= T && t >= t0) marks.push({ x: X(t), label });
        }
      }
      // The labels sit in their own lane above the pressure curves, staggered on two rows (each pair of events is only
      // ~50 ms apart). A second-row label's line starts under the first row, so it never strikes through its partner.
      ctx.font = labelFont;
      ctx.strokeStyle = COLORS.event;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      for (const m of marks) {
        const top = m.label === 'AO' || m.label === 'MO' ? rows.laneRows[0] + 4 : lane.y0;
        ctx.beginPath(); ctx.moveTo(m.x, top); ctx.lineTo(m.x, H - 2); ctx.stroke();
      }
      ctx.setLineDash([]);
      for (const p of placeEventLabels(marks, (l) => ctx.measureText(l).width)) {
        haloText(ctx, p.item.label, p.x, rows.laneRows[p.row], COLORS.label);
      }

      // Pressure scale
      const sNow = hemo.summary(T);
      // (headroom for the LV peak above the aorta behind an outflow obstruction: aortic stenosis and obstructive HCM, not mitral stenosis)
      const pMax = Math.max(140, Math.ceil((sNow.sbp + (/aortic stenosis|HCM/i.test(sNow.label) ? 80 : 30)) / 20) * 20);
      const PY = (p: number) => press.y1 - (p / pMax) * (press.y1 - press.y0 - 4);
      ctx.strokeStyle = COLORS.grid;
      ctx.fillStyle = COLORS.text;
      ctx.font = `10px ${FONT}`;
      // fewer grid lines when the band is short, so the numbers never print on top of each other
      let tick = pMax > 160 ? 40 : 20;
      while ((press.y1 - press.y0 - 4) / (pMax / tick) < 12) tick *= 2;
      for (let p = 0; p <= pMax; p += tick) {
        const y = PY(p);
        ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
        ctx.fillText(String(p), 6, y + 3);
      }

      // Sample everything once across the window
      const step = 2;
      const n = Math.floor(plotW / step) + 1;
      const ecgY: number[] = [];
      const aop: number[] = [];
      const lvp: number[] = [];
      const lap: number[] = [];
      const lvv: number[] = [];
      const pho: number[] = [];
      for (let k = 0; k < n; k++) {
        const t = t0 + (k * step) / pxPerMs;
        ecgY.push(engine.voltage('II', t));
        const s = hemo.sample(t);
        aop.push(s.aop); lvp.push(s.lvp); lap.push(s.lap); lvv.push(s.lvv); pho.push(s.phono);
      }
      const line = (vals: number[], toY: (v: number) => number, color: string, width = 1.4) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        vals.forEach((v, k) => {
          const x = left + k * step;
          const y = toY(v);
          if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
      };
      const e = rows.ecg;
      const eMid = e.y0 + (e.y1 - e.y0) * 0.62;
      line(ecgY, (v) => eMid - v * (e.y1 - e.y0) * 0.45, COLORS.ecg, 1.2);
      line(lap, PY, COLORS.lap);
      line(aop, PY, COLORS.aop, 1.8);
      line(lvp, PY, COLORS.lvp, 1.6);
      const vMax = 260;
      const VY = (v: number) => vol.y1 - (v / vMax) * (vol.y1 - vol.y0 - 4);
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      // (the volume numbers only where the row is tall enough for them not to print on top of each other)
      const volNumbers = VY(150) - VY(250) >= 11;
      [50, 150, 250].forEach((v) => { const y = VY(v); ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke(); if (volNumbers) { ctx.fillStyle = COLORS.text; ctx.fillText(String(v), 22, y + 3); } });
      line(lvv, VY, COLORS.lvv, 1.6);
      const ph = rows.phono;
      const phMid = (ph.y0 + ph.y1) / 2;
      line(pho, (v) => phMid - v * (ph.y1 - ph.y0) * 0.42, COLORS.phono, 0.9);

      // Channel labels (the ECG's in the margin when its row is too short to hold it above the trace)
      ctx.font = `600 11px ${FONT}`;
      haloText(ctx, 'ECG II', e.y1 - e.y0 < 30 ? 4 : left + 4, e.y0 + 11, COLORS.ecg);
      haloText(ctx, 'LV volume (mL)', left + 4, vol.y0 + 11, COLORS.lvv);
      const soundName = 'Heart sounds';
      const soundNameY = rows.soundRows.length > 1 ? ph.y1 - 3 : rows.soundRows[0];
      const soundNameEnd = left + 4 + ctx.measureText(soundName).width;
      haloText(ctx, soundName, left + 4, soundNameY, COLORS.phono);

      // Heart sound labels: S1 and S2 in grey, the extra sounds (S3, S4, an opening snap) in amber — on a row of their own
      // when the sound trace is tall enough. None is written over the row's name.
      ctx.font = labelFont;
      const heard = auscultate(engine, hemo, t0, T).sounds.map((s) => ({ x: X(s.t), kind: s.kind }));
      const taken = rows.soundRows.map((y) => (Math.abs(y - soundNameY) < rows.font + 1 ? soundNameEnd : -Infinity));
      for (const p of placeSoundLabels(heard, (k) => ctx.measureText(SOUND_LABEL[k]).width, rows.soundRows.length, { taken })) {
        const extra = p.item.kind !== 's1' && p.item.kind !== 's2';
        haloText(ctx, SOUND_LABEL[p.item.kind], p.x, rows.soundRows[p.row], extra ? '#fbbf24' : COLORS.label);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(right, 2); ctx.lineTo(right, H - 2); ctx.stroke();

      // ── PV loop ──────────────────────────────────────────────
      const L = fit(loop);
      const lc = L.ctx;
      lc.fillStyle = BG;
      lc.fillRect(0, 0, L.W, L.H);
      if (L.W < 60 || L.H < 60) return;
      // room on the left for the pressure numbers and the axis title beside them, and under the plot for the volumes
      const padL = 36;
      const padB = 28;
      const padT = 8;
      const padR = 10;
      const vx = (v: number) => padL + (v / vMax) * (L.W - padL - padR);
      const py = (p: number) => L.H - padB - (p / pMax) * (L.H - padB - padT);
      lc.strokeStyle = COLORS.grid;
      lc.lineWidth = 1;
      lc.fillStyle = COLORS.text;
      lc.font = `10px ${FONT}`;
      // fewer gridlines when the loop is small, so the numbers never run into each other
      const vStep = (L.W - padL - padR) / (vMax / 50) >= 26 ? 50 : 100;
      for (let v = 0; v <= vMax; v += vStep) {
        const x = vx(v);
        lc.beginPath(); lc.moveTo(x, padT); lc.lineTo(x, L.H - padB); lc.stroke();
        const s = String(v);
        lc.fillText(s, x - lc.measureText(s).width / 2, L.H - padB + 12);
      }
      let pStep = 40;
      while ((L.H - padB - padT) / (pMax / pStep) < 14) pStep *= 2;
      for (let p = 0; p <= pMax; p += pStep) {
        const y = py(p);
        lc.beginPath(); lc.moveTo(padL, y); lc.lineTo(L.W - padR, y); lc.stroke();
        const s = String(p);
        lc.fillText(s, padL - 4 - lc.measureText(s).width, y + 3);
      }
      const xTitle = 'LV volume (mL)';
      lc.fillText(xTitle, (padL + L.W - padR) / 2 - lc.measureText(xTitle).width / 2, L.H - 3);
      const yFull = 'LV pressure (mmHg)';
      const yTitle = lc.measureText(yFull).width <= L.H - padB - padT ? yFull : 'mmHg';
      lc.save();
      lc.translate(10, (padT + L.H - padB) / 2 + lc.measureText(yTitle).width / 2);
      lc.rotate(-Math.PI / 2);
      lc.fillText(yTitle, 0, 0);
      lc.restore();
      // trail: older fades
      const pts = Math.min(lvv.length, Math.floor(lvv.length * 0.75));
      for (let k = lvv.length - pts + 1; k < lvv.length; k++) {
        const a = (k - (lvv.length - pts)) / pts;
        lc.strokeStyle = `rgba(251,191,36,${0.15 + 0.85 * a})`;
        lc.lineWidth = 1.6;
        lc.beginPath();
        lc.moveTo(vx(lvv[k - 1]), py(lvp[k - 1]));
        lc.lineTo(vx(lvv[k]), py(lvp[k]));
        lc.stroke();
      }
      const last = lvv.length - 1;
      lc.fillStyle = '#fff';
      lc.beginPath(); lc.arc(vx(lvv[last]), py(lvp[last]), 3.5, 0, Math.PI * 2); lc.fill();
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, []);

  // the model's name is the answer to "what is this?": hidden while a question is open
  const model = blind ? 'Hidden while a question is open' : summary.label;

  return (
    <div ref={rootRef} className={`absolute inset-0 flex ${stack ? 'flex-col' : ''}`}>
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {/* what is on the chart, and the key to its pressure lines: outside the plot, so it never covers a curve or a label */}
        <div className="shrink-0 flex items-center gap-x-3 px-2 py-px border-b border-slate-800 text-[11px] touch:text-xs leading-tight" style={{ background: BG }}>
          <span className={`min-w-0 flex-1 truncate ${blind ? 'text-slate-400' : 'text-slate-200'}`} title={model}>
            {!stack && <span className="text-slate-400">Model: </span>}
            {model}
          </span>
          <span className="shrink-0 flex items-center gap-2 text-slate-300">
            {PRESSURE_KEY.map(([name, color]) => (
              <span key={name} className="flex items-center gap-1">
                <span aria-hidden className="w-2.5 h-[3px] rounded-full" style={{ background: color }} />
                {name}
              </span>
            ))}
            <span className="text-slate-500">mmHg</span>
          </span>
        </div>
        <div className="relative flex-1 min-h-0">
          <canvas ref={chartRef} className="absolute inset-0 w-full h-full" aria-label="Wiggers diagram" role="img" />
        </div>
      </div>
      {/* PV loop + numbers: a strip under the chart (phones), a column beside it, or side by side beside it when the panel is short */}
      <div className={`shrink-0 flex border-slate-700 ${stack ? 'h-[44%] border-t' : mode === 'column' ? 'w-[260px] flex-col border-l' : 'border-l'}`}>
        <div
          className={`relative min-w-0 min-h-0 ${mode === 'row' ? 'shrink-0' : 'flex-1'}`}
          style={mode === 'row' ? { width: rowLoopWidth(box.w, box.h) } : mode === 'column' ? { minHeight: LOOP_MIN_HEIGHT } : undefined}
        >
          <canvas ref={loopRef} className="absolute inset-0 w-full h-full" aria-label="Pressure-volume loop" role="img" />
        </div>
        {/* Listen and what it plays come first, so they stay in sight when the strip is short and the numbers scroll */}
        <div className={`min-h-0 overflow-y-auto overscroll-contain border-slate-700 bg-cardiac-dark/50 ${mode === 'column' ? 'border-t' : 'shrink-0 border-l'} ${stack ? 'w-[13.5rem] p-1.5 space-y-1' : mode === 'row' ? 'w-56 p-2 space-y-1.5' : 'p-2 space-y-1.5'}`}>
          <HeartSoundsButton className="w-full" />
          <HeardLegend />
          <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-[11px]">
            <Stat label="BP" value={summary.noOutput ? 'no pulse' : `${summary.sbp}/${summary.dbp}`} warn={summary.noOutput || summary.sbp < 90} />
            <Stat label="MAP" value={`${summary.map}`} warn={summary.map < 65} />
            {/* red below a cardiac index of about 2.2 L/min/m² for an average adult (1.9 m²) */}
            <Stat label="CO L/min" value={summary.co.toFixed(1)} warn={summary.co < 4.2} />
            <Stat label="EDV / ESV" value={`${summary.edv}/${summary.esv}`} />
            <Stat label="Fwd SV mL" value={`${summary.sv}`} />
            <Stat label="EF" value={`${summary.ef}%`} warn={summary.ef < 40} />
            <Stat label="LVEDP" value={summary.noOutput ? '—' : `~${summary.lvedp}`} warn={!summary.noOutput && summary.lvedp >= 18} />
            <Stat label="LA mean" value={summary.noOutput ? '—' : `~${summary.laMean}`} warn={!summary.noOutput && summary.laMean >= 18} />
            <Stat label="Pulse pr." value={summary.noOutput ? '—' : `${summary.sbp - summary.dbp}`} warn={!summary.noOutput && summary.sbp - summary.dbp < 25} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-slate-500 leading-none truncate">{label}</div>
      <div className={`font-mono font-semibold ${warn ? 'text-red-400' : 'text-slate-100'}`}>{value}</div>
    </div>
  );
}
