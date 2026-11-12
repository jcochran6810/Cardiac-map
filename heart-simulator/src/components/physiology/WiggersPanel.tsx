'use client';

import React, { useEffect, useRef, useState } from 'react';
import { sim } from '@/lib/sim/simulation';
import { cycleEvents } from '@/lib/ecg/engine';
import type { HemoSummary } from '@/lib/physiology/hemodynamics';
import HeartSoundsButton, { HeardLegend } from '@/components/ui/HeartSoundsButton';
import { auscultate, type SoundKind } from '@/lib/physiology/heartSounds';
import { useBlind } from '@/store/useECGStore';

const SOUND_LABEL: Record<SoundKind, string> = { s1: 'S1', s2: 'S2', s3: 'S3', s4: 'S4', snap: 'OS' };

/**
 * Live Wiggers diagram (ECG, aortic/LV/LA pressure, LV volume, phonocardiogram)
 * plus a pressure–volume loop, all derived from the same beat events as the ECG.
 */

const WINDOW_MS = 2600;
const COLORS = {
  ecg: '#3ef08a', aop: '#f87171', lvp: '#fbbf24', lap: '#38bdf8', lvv: '#c084fc', phono: '#e2e8f0',
  grid: 'rgba(148,163,184,0.12)', text: '#94a3b8', systole: 'rgba(239,68,68,0.06)', event: 'rgba(226,232,240,0.35)',
};

export default function WiggersPanel() {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const loopRef = useRef<HTMLCanvasElement>(null);
  const [summary, setSummary] = useState<HemoSummary>(() => sim.hemo.summary(sim.time));
  // The panel can be a wide strip under the heart or a narrow column beside a lesson: lay out by its own width
  const rootRef = useRef<HTMLDivElement>(null);
  const [stack, setStack] = useState(false);
  const blind = useBlind();
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setStack(e.contentRect.width < 620));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setSummary(sim.hemo.summary(sim.time)), 400);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const chart = chartRef.current!;
    const loop = loopRef.current!;
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
      const T = sim.time;
      const { engine, hemo } = sim;

      // ── Wiggers chart ────────────────────────────────────────
      const { ctx, W, H } = fit(chart);
      if (W < 50 || H < 50) return;
      ctx.fillStyle = '#060a10';
      ctx.fillRect(0, 0, W, H);
      const left = 44;
      const right = W - 8;
      const plotW = right - left;
      const pxPerMs = plotW / WINDOW_MS;
      const t0 = T - WINDOW_MS;
      const X = (t: number) => left + (t - t0) * pxPerMs;

      const rows = { ecg: [4, 0.17], press: [0.19, 0.6], vol: [0.62, 0.81], phono: [0.83, 0.99] } as const;
      const band = (k: keyof typeof rows) => ({ y0: rows[k][0] < 1 ? rows[k][0] * H : rows[k][0], y1: rows[k][1] * H });

      // Systole shading + valve events for beats in view
      const vi0 = Math.max(0, engine.lastVentIndex(t0) - 1);
      const vi1 = engine.lastVentIndex(T);
      const press = band('press');
      const vol = band('vol');
      ctx.font = '9px ui-sans-serif, system-ui, sans-serif';
      for (let i = vi0; i <= vi1 && i >= 0; i++) {
        const v = engine.vent[i];
        const ev = cycleEvents(v, engine.vent[i + 1] ?? null);
        const xs = X(ev.mc);
        const xe = X(Math.min(ev.ac, T));
        if (xe > left && xs < right) {
          ctx.fillStyle = COLORS.systole;
          ctx.fillRect(Math.max(left, xs), press.y0, Math.min(right, xe) - Math.max(left, xs), vol.y1 - press.y0);
        }
        // each pair of events is only ~50 ms apart: the second label of a pair sits a line lower so they never collide
        const marks: [number, string, number][] = [[ev.mc, 'MC', 9], [ev.ao, 'AO', 19], [ev.ac, 'AC', 9], [ev.mo, 'MO', 19]];
        for (const [t, label, dy] of marks) {
          if (t > T || t < t0) continue;
          const x = X(t);
          ctx.strokeStyle = COLORS.event;
          ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(x, press.y0); ctx.lineTo(x, H - 2); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = COLORS.text;
          ctx.fillText(label, x + 2, press.y0 + dy);
        }
      }

      // Pressure scale
      const sNow = hemo.summary(T);
      // (headroom for the LV peak above the aorta behind an outflow obstruction: aortic stenosis and obstructive HCM, not mitral stenosis)
      const pMax = Math.max(140, Math.ceil((sNow.sbp + (/aortic stenosis|HCM/i.test(sNow.label) ? 80 : 30)) / 20) * 20);
      const PY = (p: number) => press.y1 - (p / pMax) * (press.y1 - press.y0 - 12);
      ctx.strokeStyle = COLORS.grid;
      ctx.fillStyle = COLORS.text;
      // fewer grid lines when the band is short, so the numbers never print on top of each other
      let tick = pMax > 160 ? 40 : 20;
      while ((press.y1 - press.y0 - 12) / (pMax / tick) < 12) tick *= 2;
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
      const e = band('ecg');
      const eMid = e.y0 + (e.y1 - e.y0) * 0.62;
      line(ecgY, (v) => eMid - v * (e.y1 - e.y0) * 0.45, COLORS.ecg, 1.2);
      line(lap, PY, COLORS.lap);
      line(aop, PY, COLORS.aop, 1.8);
      line(lvp, PY, COLORS.lvp, 1.6);
      const vMax = 260;
      const VY = (v: number) => vol.y1 - (v / vMax) * (vol.y1 - vol.y0 - 4);
      ctx.strokeStyle = COLORS.grid;
      [50, 150, 250].forEach((v) => { const y = VY(v); ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke(); ctx.fillStyle = COLORS.text; ctx.fillText(String(v), 22, y + 3); });
      line(lvv, VY, COLORS.lvv, 1.6);
      const ph = band('phono');
      const phMid = (ph.y0 + ph.y1) / 2;
      line(pho, (v) => phMid - v * (ph.y1 - ph.y0) * 0.42, COLORS.phono, 0.9);

      // Heart sound labels: S1 and S2 on the top row, the extra sounds (S3, S4, an opening snap) one row down in amber
      for (const snd of auscultate(engine, hemo, t0, T).sounds) {
        const extra = snd.kind !== 's1' && snd.kind !== 's2';
        ctx.fillStyle = extra ? '#fbbf24' : COLORS.text;
        ctx.fillText(SOUND_LABEL[snd.kind], X(snd.t) + (snd.kind === 's4' ? -14 : 3), ph.y0 + (extra ? 19 : 9));
      }

      // Channel labels
      ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = COLORS.ecg; ctx.fillText('ECG II', left + 4, e.y0 + 10);
      ctx.fillStyle = COLORS.lvv; ctx.fillText('LV volume (mL)', left + 4, vol.y0 + 10);
      ctx.fillStyle = COLORS.phono; ctx.fillText('Heart sounds', left + 4, ph.y1 - 4);
      const legend: [string, string][] = [['Aortic', COLORS.aop], ['LV', COLORS.lvp], ['LA (mmHg)', COLORS.lap]];
      let lx = right - 178;
      ctx.fillStyle = 'rgba(6,10,16,0.75)';
      ctx.fillRect(lx - 6, press.y0 + 14, 180, 14);
      legend.forEach(([l, c]) => {
        ctx.fillStyle = c; ctx.fillRect(lx, press.y0 + 19, 10, 3);
        ctx.fillStyle = '#cbd5e1'; ctx.fillText(l, lx + 13, press.y0 + 24);
        lx += ctx.measureText(l).width + 26;
      });
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath(); ctx.moveTo(right, 2); ctx.lineTo(right, H - 2); ctx.stroke();

      // ── PV loop ──────────────────────────────────────────────
      const L = fit(loop);
      const lc = L.ctx;
      lc.fillStyle = '#060a10';
      lc.fillRect(0, 0, L.W, L.H);
      const pad = 26;
      const vx = (v: number) => pad + (v / vMax) * (L.W - pad - 8);
      const py = (p: number) => L.H - pad - (p / pMax) * (L.H - pad - 10);
      lc.strokeStyle = COLORS.grid;
      lc.fillStyle = COLORS.text;
      lc.font = '9px ui-sans-serif, system-ui, sans-serif';
      for (let v = 0; v <= vMax; v += 50) { const x = vx(v); lc.beginPath(); lc.moveTo(x, 6); lc.lineTo(x, L.H - pad); lc.stroke(); lc.fillText(String(v), x - 6, L.H - pad + 11); }
      for (let p = 0; p <= pMax; p += 40) { const y = py(p); lc.beginPath(); lc.moveTo(pad, y); lc.lineTo(L.W - 6, y); lc.stroke(); lc.fillText(String(p), 3, y + 3); }
      lc.fillText('LV volume (mL)', L.W / 2 - 30, L.H - 3);
      lc.save(); lc.translate(10, L.H / 2 + 30); lc.rotate(-Math.PI / 2); lc.fillText('LV pressure (mmHg)', 0, 0); lc.restore();
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

  return (
    <div ref={rootRef} className={`absolute inset-0 flex ${stack ? 'flex-col' : ''}`}>
      <div className="flex-1 min-w-0 min-h-0 relative">
        <canvas ref={chartRef} className="absolute inset-0 w-full h-full" aria-label="Wiggers diagram" role="img" />
      </div>
      {/* PV loop + numbers: a column beside the chart, or a strip under it on phones */}
      <div className={`shrink-0 border-slate-700 flex ${stack ? 'h-[44%] flex-row border-t' : 'w-[260px] flex-col border-l'}`}>
        <div className="relative flex-1 min-h-0 min-w-0">
          <canvas ref={loopRef} className="absolute inset-0 w-full h-full" aria-label="Pressure-volume loop" role="img" />
        </div>
        <div className={`p-2 grid gap-x-2 gap-y-1 text-[11px] border-slate-700 bg-cardiac-dark/50 ${stack ? 'w-[11.5rem] shrink-0 grid-cols-2 content-start border-l overflow-y-auto' : 'grid-cols-3 border-t'}`}>
          <Stat label="BP" value={summary.noOutput ? 'no pulse' : `${summary.sbp}/${summary.dbp}`} warn={summary.noOutput || summary.sbp < 90} />
          <Stat label="MAP" value={`${summary.map}`} warn={summary.map < 65} />
          {/* red below a cardiac index of about 2.2 L/min/m² for an average adult (1.9 m²) */}
          <Stat label="CO L/min" value={summary.co.toFixed(1)} warn={summary.co < 4.2} />
          <Stat label="EDV / ESV" value={`${summary.edv}/${summary.esv}`} />
          <Stat label="Fwd SV mL" value={`${summary.sv}`} />
          <Stat label="EF" value={`${summary.ef}%`} warn={summary.ef < 40} />
          <Stat label="LVEDP" value={summary.noOutput ? '—' : `~${summary.lvedp}`} warn={!summary.noOutput && summary.lvedp >= 18} />
          <Stat label="LA mean" value={summary.noOutput ? '—' : `~${summary.laMean}`} warn={!summary.noOutput && summary.laMean >= 18} />
          {!stack && <Stat label="Pulse pr." value={summary.noOutput ? '—' : `${summary.sbp - summary.dbp}`} warn={!summary.noOutput && summary.sbp - summary.dbp < 25} />}
          {/* the model's name is the answer to "what is this?": hidden while a question is open */}
          <div className={`${stack ? 'col-span-2' : 'col-span-3'} text-slate-400 leading-snug`}>
            Model: <span className="text-slate-200">{blind ? 'hidden while a question is open' : summary.label}</span>
          </div>
          <HeartSoundsButton className={`${stack ? 'col-span-2' : 'col-span-3'} mt-0.5`} />
          <HeardLegend className={stack ? 'col-span-2' : 'col-span-3'} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <div className="text-slate-500 leading-none">{label}</div>
      <div className={`font-mono font-semibold ${warn ? 'text-red-400' : 'text-slate-100'}`}>{value}</div>
    </div>
  );
}
