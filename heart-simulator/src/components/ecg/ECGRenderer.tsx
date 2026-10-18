'use client';

import React, { useEffect, useRef, useState } from 'react';
import { sim, scrubTo } from '@/lib/sim/simulation';
import { useECGStore, ECGLead, ECGLayout } from '@/store/useECGStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { resolveProfile } from '@/lib/ecg/profiles';
import { windowStart, xInWindow } from '@/lib/ecg/sweep';

/**
 * Calibrated, sweeping 12-lead ECG.
 *
 * - Grid is true ECG paper: 1 mm minor / 5 mm major boxes, 25 (or 50) mm/s, 5/10/20 mm/mV.
 * - The live 12-lead ('simultaneous', the default) sweeps all four columns at once, like a
 *   monitor's 12-lead screen, so every lead moves with every beat.
 * - The printout ('standard') prints sequential 2.5 s columns (I-II-III | aVR-aVL-aVF | V1-V3 |
 *   V4-V6), exactly like a paper 12-lead. Both have a continuous lead II rhythm strip.
 * - A sweep cursor with an erase bar moves left→right; the cursor is "now", which is the
 *   same instant the 3D heart is showing.
 * - Each strip is drawn incrementally into its own offscreen canvas, so per-frame cost is tiny.
 */

const STANDARD_COLUMNS: ECGLead[][] = [
  ['I', 'II', 'III'],
  ['aVR', 'aVL', 'aVF'],
  ['V1', 'V2', 'V3'],
  ['V4', 'V5', 'V6'],
];
const MONITOR_LEADS: ECGLead[] = ['II', 'V1', 'V5'];

const THEMES = {
  monitor: {
    bg: '#04070c', minor: 'rgba(255,70,70,0.09)', major: 'rgba(255,70,70,0.26)', trace: '#3ef08a',
    label: '#a8b8cc', cursor: 'rgba(255,255,255,0.85)', cal: '#3ef08a', sep: 'rgba(148,163,184,0.45)',
    key: 'rgba(245,158,11,0.07)', keyLabel: '#f59e0b', sel: 'rgba(56,189,248,0.9)', annot: '#fbbf24',
  },
  paper: {
    bg: '#fff6f4', minor: 'rgba(235,90,90,0.22)', major: 'rgba(215,45,45,0.5)', trace: '#111827',
    label: '#1f2937', cursor: 'rgba(30,64,175,0.8)', cal: '#111827', sep: 'rgba(30,41,59,0.6)',
    key: 'rgba(245,158,11,0.12)', keyLabel: '#b45309', sel: 'rgba(37,99,235,0.9)', annot: '#b45309',
  },
};

interface Strip {
  lead: ECGLead;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  offset: number;
  dur: number;
  page: number;
  canvas: HTMLCanvasElement;
  overflow: number;
  lastT: number;
  lastX: number;
  lastY: number;
  hasLast: boolean;
}

interface Layout {
  key: string;
  W: number;
  H: number;
  dpr: number;
  pxPerMm: number;
  pxPerMs: number;
  pxPerMv: number;
  calMargin: number;
  strips: Strip[];
  grid: HTMLCanvasElement;
  cellStrips: Strip[];
}

type Caliper = { t: number; v: number; strip: number };

function buildLayout(
  W: number, H: number, dpr: number, layout: ECGLayout, inspect: ECGLead | null,
  speed: number, gain: number, themeKey: keyof typeof THEMES,
): Layout {
  const theme = THEMES[themeKey];
  const key = `${W}x${H}@${dpr}|${layout}|${inspect}|${speed}|${gain}|${themeKey}`;
  const strips: Omit<Strip, 'canvas' | 'overflow' | 'lastT' | 'lastX' | 'lastY' | 'hasLast'>[] = [];
  let pxPerMm: number;

  if (inspect) {
    pxPerMm = Math.max(3, Math.min(10, H / 26));
    const cal = 7 * pxPerMm;
    let dur = ((W - cal) / (pxPerMm * speed)) * 1000;
    if (dur < 3000) {
      pxPerMm = (W - 7 * pxPerMm) / (3 * speed);
      dur = 3000;
    }
    const calM = 7 * pxPerMm;
    strips.push({ lead: inspect, label: inspect, x: calM, y: 0, w: W - calM, h: H, offset: 0, dur, page: dur });
  } else if (layout === 'monitor') {
    const rowH = H / 3;
    pxPerMm = Math.max(2, Math.min(8, rowH / 20));
    const calM = 7 * pxPerMm;
    const dur = ((W - calM) / (pxPerMm * speed)) * 1000;
    MONITOR_LEADS.forEach((lead, r) => {
      strips.push({ lead, label: lead, x: calM, y: r * rowH, w: W - calM, h: rowH, offset: 0, dur, page: dur });
    });
  } else {
    const rowH = H / 4;
    const est = Math.min((W * 0.96) / 4 / (2.5 * speed), rowH / 17);
    pxPerMm = Math.max(2, est);
    const calM = 7 * pxPerMm;
    const colW = (W - calM) / 4;
    const dur = (colW / (pxPerMm * speed)) * 1000;
    const page = layout === 'standard' ? dur * 4 : dur;
    STANDARD_COLUMNS.forEach((col, c) => {
      col.forEach((lead, r) => {
        strips.push({
          lead, label: lead, x: calM + c * colW, y: r * rowH, w: colW, h: rowH,
          offset: layout === 'standard' ? c * dur : 0, dur, page,
        });
      });
    });
    strips.push({ lead: 'II', label: 'II', x: calM, y: 3 * rowH, w: W - calM, h: rowH, offset: 0, dur: dur * 4, page: dur * 4 });
  }

  const calMargin = strips[0].x;
  const pxPerMs = (pxPerMm * speed) / 1000;
  const pxPerMv = pxPerMm * gain;

  // Grid canvas (static)
  const grid = document.createElement('canvas');
  grid.width = Math.max(1, Math.round(W * dpr));
  grid.height = Math.max(1, Math.round(H * dpr));
  const g = grid.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = theme.bg;
  g.fillRect(0, 0, W, H);
  const minorOk = pxPerMm >= 3;
  for (let i = 0, x = 0; x <= W; i++, x = i * pxPerMm) {
    if (i % 5 !== 0 && !minorOk) continue;
    g.strokeStyle = i % 5 === 0 ? theme.major : theme.minor;
    g.lineWidth = i % 5 === 0 ? 0.9 : 0.5;
    g.beginPath(); g.moveTo(Math.round(x) + 0.5, 0); g.lineTo(Math.round(x) + 0.5, H); g.stroke();
  }
  for (let i = 0, y = 0; y <= H; i++, y = i * pxPerMm) {
    if (i % 5 !== 0 && !minorOk) continue;
    g.strokeStyle = i % 5 === 0 ? theme.major : theme.minor;
    g.lineWidth = i % 5 === 0 ? 0.9 : 0.5;
    g.beginPath(); g.moveTo(0, Math.round(y) + 0.5); g.lineTo(W, Math.round(y) + 0.5); g.stroke();
  }
  // Calibration pulses (1 mV × 200 ms) at the start of each row
  const rowsDone = new Set<number>();
  g.strokeStyle = theme.cal;
  g.lineWidth = 1.4;
  for (const s of strips) {
    if (rowsDone.has(s.y)) continue;
    rowsDone.add(s.y);
    const base = s.y + s.h * 0.62;
    const x0 = 1.5 * pxPerMm;
    const pw = 0.2 * 1000 * pxPerMs;
    g.beginPath();
    g.moveTo(x0 - pxPerMm, base);
    g.lineTo(x0, base);
    g.lineTo(x0, base - pxPerMv);
    g.lineTo(x0 + pw, base - pxPerMv);
    g.lineTo(x0 + pw, base);
    g.lineTo(x0 + pw + pxPerMm, base);
    g.stroke();
  }

  const full: Strip[] = strips.map((s) => {
    const overflow = Math.round(s.h * 0.55);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(s.w * dpr));
    c.height = Math.max(1, Math.round((s.h + overflow * 2) * dpr));
    return { ...s, canvas: c, overflow, lastT: 0, lastX: 0, lastY: 0, hasLast: false };
  });

  return { key, W, H, dpr, pxPerMm, pxPerMs, pxPerMv, calMargin, strips: full, grid, cellStrips: full };
}

/** Map time → x for a strip, or null if that time is not displayed in that strip */
function xFor(s: Strip, t: number, pxPerMs: number): number | null {
  return xInWindow(t, windowStart(t, s.offset, s.page), s.dur, pxPerMs);
}

/** `scrub`: dragging scrubs through time (pausing the simulation); the case simulator turns it off */
export default function ECGRenderer({ scrub = true }: { scrub?: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrubRef = useRef(scrub);
  scrubRef.current = scrub;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layoutRef = useRef<Layout | null>(null);
  const caliperRef = useRef<Caliper[]>([]);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let size = { W: 0, H: 0 };
    let lastT = -1;
    let lastEpoch = -1;
    let lastProfile = '';

    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      size = { W: Math.floor(r.width), H: Math.floor(r.height) };
    });
    ro.observe(wrap);

    const engine = sim.engine;

    /** Draw times [u, v] of the window starting at ws (x is measured from ws, never with a modulo) */
    const drawRange = (L: Layout, s: Strip, ws: number, u: number, v: number, color: string) => {
      const c = s.canvas.getContext('2d')!;
      c.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
      const base = s.overflow + s.h * 0.62;
      const step = 0.5 / L.pxPerMs;
      // Collect pacing spikes so they are never skipped by the sampler
      const spikes: number[] = [];
      const vi0 = engine.lastVentIndex(u - 2);
      for (let k = Math.max(0, vi0); k < engine.vent.length && engine.vent[k].t <= v + 2; k++) {
        if (engine.vent[k].spike && engine.vent[k].t >= u) spikes.push(engine.vent[k].t - 1.5);
      }
      c.strokeStyle = color;
      c.lineWidth = 1.35;
      c.lineJoin = 'round';
      c.beginPath();
      let first = true;
      let si = 0;
      const plot = (t: number) => {
        const x = xInWindow(t, ws, s.dur, L.pxPerMs);
        if (x === null) return;
        const y = base - engine.voltage(s.lead, t) * L.pxPerMv;
        if (first) {
          if (s.hasLast && Math.abs(s.lastT - t) <= step * 2.5 && x >= s.lastX) c.moveTo(s.lastX, s.lastY);
          else c.moveTo(x, y);
          first = false;
        }
        c.lineTo(x, y);
        s.lastT = t; s.lastX = x; s.lastY = y; s.hasLast = true;
      };
      for (let t = u; t <= v; t += step) {
        while (si < spikes.length && spikes[si] < t) { plot(spikes[si]); si++; }
        plot(t);
      }
      plot(v);
      c.stroke();
    };

    const clearRange = (L: Layout, s: Strip, x0: number, x1: number) => {
      const c = s.canvas.getContext('2d')!;
      c.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
      c.clearRect(Math.max(0, x0 - 0.5), 0, Math.min(s.w, x1) - Math.max(0, x0 - 0.5) + 1, s.h + s.overflow * 2);
    };

    /** Draw times (a, b] into strip s, erasing a short gap ahead of the cursor */
    const advance = (L: Layout, s: Strip, a: number, b: number, color: string, gapPx: number) => {
      // Visible windows are [k*page + offset, k*page + offset + dur]
      const k0 = Math.floor((a - s.offset) / s.page);
      const k1 = Math.floor((b - s.offset) / s.page);
      for (let k = k0; k <= k1; k++) {
        const ws = k * s.page + s.offset;
        const we = ws + s.dur;
        const u = Math.max(a, ws);
        const v = Math.min(b, we);
        if (v <= u) continue;
        const xu = (u - ws) * L.pxPerMs;
        const xv = (v - ws) * L.pxPerMs;
        if (u === ws) s.hasLast = false;
        clearRange(L, s, xu, xv + gapPx);
        drawRange(L, s, ws, u, v, color);
      }
    };

    const fullRedraw = (L: Layout, T: number, color: string) => {
      const gapMs = 14 / L.pxPerMs;
      for (const s of L.strips) {
        const c = s.canvas.getContext('2d')!;
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, s.canvas.width, s.canvas.height);
        s.hasLast = false;
        const k = Math.floor((T - s.offset) / s.page);
        const ws = k * s.page + s.offset;
        const we = ws + s.dur;
        // previous page portion (to the right of the cursor)
        const prevStart = Math.max(Math.min(T, we) + gapMs, ws) - s.page;
        const prevEnd = we - s.page;
        if (prevEnd > prevStart && prevEnd > 0) {
          drawRange(L, s, ws - s.page, Math.max(0, prevStart), prevEnd, color);
          s.hasLast = false;
        }
        // current page up to the cursor
        const curEnd = Math.min(T, we);
        if (curEnd > ws) drawRange(L, s, ws, Math.max(0, ws), curEnd, color);
      }
    };

    const render = () => {
      raf = requestAnimationFrame(render);
      const { W, H } = size;
      if (W < 20 || H < 20) return;
      const ecg = useECGStore.getState();
      const dpr = window.devicePixelRatio || 1;
      const key = `${W}x${H}@${dpr}|${ecg.layout}|${ecg.inspectLead}|${ecg.sweepSpeed}|${ecg.gain}|${ecg.theme}`;
      let L = layoutRef.current;
      const theme = THEMES[ecg.theme];
      const T = sim.time;
      let needFull = false;
      if (!L || L.key !== key) {
        if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
          canvas.width = Math.round(W * dpr);
          canvas.height = Math.round(H * dpr);
        }
        L = buildLayout(W, H, dpr, ecg.layout, ecg.inspectLead, ecg.sweepSpeed, ecg.gain, ecg.theme);
        layoutRef.current = L;
        caliperRef.current = [];
        needFull = true;
      }
      if (sim.epoch !== lastEpoch || T < lastT || T - lastT > 1500) needFull = true;
      lastEpoch = sim.epoch;

      if (needFull) {
        fullRedraw(L, T, theme.trace);
      } else if (T > lastT) {
        const gapPx = 14;
        for (const s of L.strips) advance(L, s, lastT, T, theme.trace, gapPx);
      }
      lastT = T;

      // ── Composite ─────────────────────────────────────────────
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(L.grid, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const profile = resolveProfile(engine.segmentAt(T).profile.id);
      if (profile.id !== lastProfile) lastProfile = profile.id;
      const keyLeads = ecg.showKeyLeads && !ecg.inspectLead ? new Set(profile.keyLeads ?? []) : new Set<string>();

      L.strips.forEach((s, i) => {
        const isRhythm = !ecg.inspectLead && ecg.layout !== 'monitor' && i === L!.strips.length - 1;
        if (keyLeads.has(s.lead) && !isRhythm) {
          ctx.fillStyle = theme.key;
          ctx.fillRect(s.x, s.y, s.w, s.h);
        }
        ctx.drawImage(s.canvas, s.x, s.y - s.overflow, s.w, s.h + s.overflow * 2);
      });

      // Separators + labels
      ctx.strokeStyle = theme.sep;
      ctx.lineWidth = 1;
      ctx.font = `600 ${Math.max(10, Math.min(13, L.pxPerMm * 2.4))}px ui-sans-serif, system-ui, sans-serif`;
      L.strips.forEach((s, i) => {
        const isRhythm = !ecg.inspectLead && ecg.layout !== 'monitor' && i === L!.strips.length - 1;
        if (s.x > L!.calMargin + 1) {
          ctx.beginPath();
          ctx.moveTo(s.x + 0.5, s.y + s.h * 0.35);
          ctx.lineTo(s.x + 0.5, s.y + s.h * 0.85);
          ctx.stroke();
        }
        const highlight = keyLeads.has(s.lead) && !isRhythm;
        ctx.fillStyle = highlight ? theme.keyLabel : theme.label;
        ctx.fillText(isRhythm ? `${s.label} (rhythm strip)` : s.label, s.x + 5, s.y + 14);
        if (ecg.selectedLead === s.lead && !isRhythm) {
          ctx.strokeStyle = theme.sel;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(s.x + 1, s.y + 1, s.w - 2, s.h - 2);
          ctx.strokeStyle = theme.sep;
          ctx.lineWidth = 1;
        }
      });

      // Sweep cursor
      ctx.strokeStyle = theme.cursor;
      ctx.lineWidth = 1.2;
      for (const s of L.strips) {
        const k = Math.floor((T - s.offset) / s.page);
        const ws = k * s.page + s.offset;
        if (T >= ws && T <= ws + s.dur) {
          const x = s.x + (T - ws) * L.pxPerMs;
          ctx.beginPath();
          ctx.moveTo(x, s.y + 3);
          ctx.lineTo(x, s.y + s.h - 3);
          ctx.stroke();
        }
      }

      // Inspect-mode annotations: label the waves and intervals of the last complete beat
      if (ecg.inspectLead && ecg.showAnnotations) drawAnnotations(ctx, L, T, theme.annot);

      // Calipers
      if (caliperRef.current.length) drawCalipers(ctx, L, caliperRef.current, theme.sel);

      // Footer
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillStyle = theme.label;
      ctx.textAlign = 'right';
      ctx.fillText(`${ecg.sweepSpeed} mm/s · ${ecg.gain} mm/mV`, W - 6, H - 5);
      ctx.textAlign = 'left';
    };

    const drawAnnotations = (c: CanvasRenderingContext2D, L: Layout, T: number, color: string) => {
      const s = L.strips[0];
      const k = Math.floor((T - s.offset) / s.page);
      const ws = k * s.page + s.offset;
      // last ventricular beat whose T wave is complete and on screen
      let vi = engine.lastVentIndex(T);
      while (vi >= 0 && engine.vent[vi].t + engine.vent[vi].qt > T) vi--;
      if (vi < 0) return;
      const v = engine.vent[vi];
      if (v.t < ws) return;
      const X = (t: number) => s.x + (t - ws) * L.pxPerMs;
      const base = s.y + s.h * 0.62;
      const yBr = s.y + s.h - 26;
      c.strokeStyle = color;
      c.fillStyle = color;
      c.lineWidth = 1;
      c.font = '600 11px ui-sans-serif, system-ui, sans-serif';
      const bracket = (t0: number, t1: number, y: number, label: string) => {
        const x0 = X(t0), x1 = X(t1);
        c.beginPath();
        c.moveTo(x0, y - 4); c.lineTo(x0, y); c.lineTo(x1, y); c.lineTo(x1, y - 4);
        c.stroke();
        c.textAlign = 'center';
        c.fillText(label, (x0 + x1) / 2, y + 12);
        c.textAlign = 'left';
      };
      const markAt = (t: number, label: string) => {
        const y = base - engine.voltage(s.lead, t) * L.pxPerMv;
        const ly = Math.min(y, base) - 10;
        c.textAlign = 'center';
        c.fillText(label, X(t), Math.max(s.y + 26, ly));
        c.textAlign = 'left';
      };
      // P wave + PR interval if this beat was conducted from a visible P
      const ai = v.pTime !== undefined ? engine.atrial.findIndex((a) => a.t === v.pTime) : -1;
      const a = ai >= 0 ? engine.atrial[ai] : null;
      if (a && a.t >= ws) {
        markAt(a.t + a.template.duration * 0.45, 'P');
        bracket(a.t, v.t, yBr - 44, `PR ${Math.round(v.t - a.t)} ms`);
      }
      // QRS
      let rT = v.t;
      let rV = -1e9;
      for (let t = v.t; t < v.t + v.qrsDur; t += 2) {
        const y = engine.voltage(s.lead, t);
        if (y > rV) { rV = y; rT = t; }
      }
      markAt(rT, 'QRS');
      bracket(v.t, v.t + v.qrsDur, yBr - 22, `QRS ${Math.round(v.qrsDur)} ms`);
      // T wave + QT
      markAt(v.t + v.tw.tp, 'T');
      const rr = vi > 0 ? v.t - engine.vent[vi - 1].t : 60000 / Math.max(1, engine.heartRate(T));
      const qtc = v.qt / Math.cbrt(rr / 1000);
      bracket(v.t, v.t + v.qt, yBr, `QT ${Math.round(v.qt)} ms (QTcF ${Math.round(qtc)})`);
      // ST measurement point (J + 60 ms)
      const jx = X(v.t + v.qrsDur + 60);
      c.setLineDash([3, 3]);
      c.beginPath(); c.moveTo(jx, s.y + 20); c.lineTo(jx, s.y + s.h - 50); c.stroke();
      c.setLineDash([]);
      const stv = engine.voltage(s.lead, v.t + v.qrsDur + 60) - engine.voltage(s.lead, v.t - 15);
      c.fillText(`ST ${stv >= 0 ? '+' : ''}${(stv * 10).toFixed(1)} mm`, jx + 4, s.y + 30);
    };

    const drawCalipers = (c: CanvasRenderingContext2D, L: Layout, pts: Caliper[], color: string) => {
      const s = L.strips[pts[0].strip] ?? L.strips[0];
      const T = sim.time;
      const k = Math.floor((T - s.offset) / s.page);
      const ws = k * s.page + s.offset;
      const base = s.y + s.h * 0.62;
      const toXY = (p: Caliper) => {
        let x = xFor(s, p.t, L.pxPerMs);
        if (x === null) x = (p.t - ws) * L.pxPerMs;
        return { x: s.x + x, y: base - p.v * L.pxPerMv };
      };
      c.strokeStyle = color;
      c.fillStyle = color;
      c.lineWidth = 1.2;
      const xy = pts.map(toXY);
      xy.forEach((p) => {
        c.beginPath(); c.moveTo(p.x, s.y + 4); c.lineTo(p.x, s.y + s.h - 4); c.stroke();
      });
      if (pts.length === 2) {
        const dt = Math.abs(pts[1].t - pts[0].t);
        const dv = pts[1].v - pts[0].v;
        const midX = (xy[0].x + xy[1].x) / 2;
        c.beginPath(); c.moveTo(xy[0].x, s.y + 24); c.lineTo(xy[1].x, s.y + 24); c.stroke();
        const txt = `${Math.round(dt)} ms · ${dt > 0 ? Math.round(60000 / dt) : '–'} bpm · Δ ${dv >= 0 ? '+' : ''}${dv.toFixed(2)} mV`;
        c.font = '600 11px ui-sans-serif, system-ui, sans-serif';
        const tw = c.measureText(txt).width;
        c.fillStyle = 'rgba(2,6,23,0.85)';
        c.fillRect(midX - tw / 2 - 6, s.y + 28, tw + 12, 18);
        c.fillStyle = color;
        c.textAlign = 'center';
        c.fillText(txt, midX, s.y + 41);
        c.textAlign = 'left';
      }
    };

    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // ── Pointer interaction: click = select lead / caliper, drag = scrub time ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let down: { x: number; y: number; t: number } | null = null;
    let dragging = false;
    // Touch screens get no reliable dblclick, so double-taps are detected here
    let pointerType = 'mouse';
    let lastTap: { at: number; strip: number } | null = null;

    const stripAt = (x: number, y: number) => {
      const L = layoutRef.current;
      if (!L) return -1;
      return L.strips.findIndex((s) => x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h);
    };

    const toggleInspect = (idx: number) => {
      const L = layoutRef.current;
      const ecg = useECGStore.getState();
      if (ecg.inspectLead) ecg.setInspectLead(null);
      else if (idx >= 0 && L) ecg.setInspectLead(L.strips[idx].lead);
    };

    const onDown = (e: PointerEvent) => {
      pointerType = e.pointerType;
      const r = canvas.getBoundingClientRect();
      down = { x: e.clientX - r.left, y: e.clientY - r.top, t: sim.time };
      dragging = false;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const r = canvas.getBoundingClientRect();
      const dx = e.clientX - r.left - down.x;
      if (!dragging && Math.abs(dx) > 5) {
        dragging = true;
        if (!scrubRef.current) return;
        useTimelineStore.getState().pause();
        setHint('Scrubbing — the 3D heart follows the cursor');
      }
      if (dragging && scrubRef.current && layoutRef.current) {
        scrubTo(down.t + dx / layoutRef.current.pxPerMs);
      }
    };
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (!dragging) {
        const idx = stripAt(x, y);
        const L = layoutRef.current;
        const ecg = useECGStore.getState();
        if (e.pointerType !== 'mouse' && !ecg.caliperMode) {
          const now = performance.now();
          if (lastTap && now - lastTap.at < 350 && lastTap.strip === idx) {
            lastTap = null;
            toggleInspect(idx);
            down = null;
            return;
          }
          lastTap = { at: now, strip: idx };
        }
        if (idx >= 0 && L) {
          const s = L.strips[idx];
          if (ecg.caliperMode) {
            const k = Math.floor((sim.time - s.offset) / s.page);
            let t = k * s.page + s.offset + (x - s.x) / L.pxPerMs;
            if (t > sim.time) t -= s.page;
            const v = (s.y + s.h * 0.62 - y) / L.pxPerMv;
            const pts = caliperRef.current;
            caliperRef.current = pts.length >= 2 ? [{ t, v, strip: idx }] : [...pts, { t, v, strip: idx }];
          } else {
            ecg.selectLead(s.lead);
          }
        }
      } else {
        setHint(null);
      }
      down = null;
      dragging = false;
    };
    const onCancel = () => {
      if (dragging) setHint(null);
      down = null;
      dragging = false;
    };
    const onDbl = (e: MouseEvent) => {
      if (pointerType !== 'mouse') return; // handled as a double-tap in onUp
      const r = canvas.getBoundingClientRect();
      toggleInspect(stripAt(e.clientX - r.left, e.clientY - r.top));
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('dblclick', onDbl);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('dblclick', onDbl);
    };
  }, []);

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="block w-full h-full cursor-crosshair touch-none"
        aria-label={`12-lead ECG. Click or tap a lead to select it, double-click or double-tap to inspect${scrub ? ', drag to scrub through time' : ''}.`}
        role="img"
      />
      {hint && (
        <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] px-2 py-0.5 rounded bg-black/70 text-sky-200 pointer-events-none">
          {hint}
        </div>
      )}
    </div>
  );
}
