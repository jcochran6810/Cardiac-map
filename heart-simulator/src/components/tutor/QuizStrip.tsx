'use client';

import React, { useEffect, useRef, useState } from 'react';
import { sim } from '@/lib/sim/simulation';
import { useTimelineStore } from '@/store/useTimelineStore';
import { ALL_LEADS, type StandardLead } from '@/lib/ecg/vector';
import { eraseSpan, windowStart, xInWindow } from '@/lib/ecg/sweep';
import { IconPlay } from '@/components/ui/icons';

/** Seconds across the strip, at least: a monitor's six-second rhythm strip (a wide, short strip shows more) */
const SECONDS = 6;
/** The grid is ECG paper at 25 mm/s and 10 mm/mV, so a large box is 0.2 s and 0.5 mV whatever the strip's size */
const MM_PER_S = 25;
const MM_PER_MV = 10;
/** Height in mm of paper: about 2 mV above the baseline and 1.3 below */
const HEIGHT_MM = 34;
const BASELINE = 0.6;
/** blank gap kept ahead of the sweep, in px */
const GAP = 10;
/** the ECG drawer's monitor colors */
const COLORS = { bg: '#04070c', minor: 'rgba(255,70,70,0.09)', major: 'rgba(255,70,70,0.26)', trace: '#3ef08a' };

/**
 * A small live rhythm strip for the quiz card. A phone's quiz covers the whole screen, and the main menu has no ECG
 * drawer, so the strip a question asks about is drawn here: one lead (`startLead`, the first one the question names,
 * until the learner picks another), sweeping with the simulation like the monitor, on calibrated paper so the boxes
 * can be counted.
 */
export default function QuizStrip({ startLead = 'II' }: { startLead?: StandardLead }) {
  const [lead, setLead] = useState<StandardLead>(startLead);
  /** seconds across the strip as drawn (more than SECONDS when its height is capped, on a phone on its side) */
  const [shown, setShown] = useState(SECONDS);
  const playing = useTimelineStore((s) => s.playing);
  const togglePlay = useTimelineStore((s) => s.togglePlay);
  const wrapRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLCanvasElement>(null);
  const traceRef = useRef<HTMLCanvasElement>(null);
  const leadRef = useRef(lead);
  leadRef.current = lead;

  useEffect(() => {
    const wrap = wrapRef.current;
    const gridCanvas = gridRef.current;
    const traceCanvas = traceRef.current;
    if (!wrap || !gridCanvas || !traceCanvas) return;
    const grid = gridCanvas.getContext('2d');
    const trace = traceCanvas.getContext('2d');
    if (!grid || !trace) return;
    const engine = sim.engine;
    /** ms across the strip */
    let page = SECONDS * 1000;
    let W = 0;
    let H = 0;
    let dpr = 1;
    let pxPerMm = 1;
    let pxPerMs = 0;
    let pxPerMv = 0;
    let sized = false;
    let lastT = -1;
    let lastEpoch = -1;
    let lastLead = '';
    // the pen's last point, so each frame's piece joins the last one
    let pen: { t: number; x: number; y: number } | null = null;
    let raf = 0;

    const resize = () => {
      W = wrap.clientWidth;
      H = wrap.clientHeight;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      for (const c of [gridCanvas, traceCanvas]) {
        c.width = Math.max(1, Math.round(W * dpr));
        c.height = Math.max(1, Math.round(H * dpr));
      }
      // square boxes: as large as the width allows for six seconds, unless the height is the limit (then more seconds fit)
      pxPerMm = Math.max(0.5, Math.min(W / (SECONDS * MM_PER_S), H / HEIGHT_MM));
      pxPerMs = (pxPerMm * MM_PER_S) / 1000;
      pxPerMv = pxPerMm * MM_PER_MV;
      page = W / pxPerMs;
      setShown(Math.round(page / 1000));
      grid.setTransform(dpr, 0, 0, dpr, 0, 0);
      grid.fillStyle = COLORS.bg;
      grid.fillRect(0, 0, W, H);
      // small boxes only where they are big enough to see
      const minor = pxPerMm >= 3;
      const line = (x0: number, y0: number, x1: number, y1: number, major: boolean) => {
        grid.strokeStyle = major ? COLORS.major : COLORS.minor;
        grid.lineWidth = major ? 0.9 : 0.5;
        grid.beginPath();
        grid.moveTo(x0, y0);
        grid.lineTo(x1, y1);
        grid.stroke();
      };
      for (let i = 0; i * pxPerMm <= W; i++) {
        if (i % 5 && !minor) continue;
        const x = Math.round(i * pxPerMm) + 0.5;
        line(x, 0, x, H, i % 5 === 0);
      }
      // horizontal lines counted from the baseline, so it sits on a large-box line
      const base = H * BASELINE;
      for (let i = -Math.ceil(base / pxPerMm); i * pxPerMm <= H - base; i++) {
        if (i % 5 && !minor) continue;
        const y = Math.round(base + i * pxPerMm) + 0.5;
        line(0, y, W, y, i % 5 === 0);
      }
      sized = W >= 20 && H >= 10;
      lastT = -1;
    };

    const yAt = (t: number) => Math.max(1, Math.min(H - 1, H * BASELINE - engine.voltage(leadRef.current, t) * pxPerMv));

    /** Draw times [u, v] of the sweep that starts at ws */
    const drawRange = (ws: number, u: number, v: number) => {
      trace.setTransform(dpr, 0, 0, dpr, 0, 0);
      trace.strokeStyle = COLORS.trace;
      trace.lineWidth = 1.35;
      trace.lineJoin = 'round';
      trace.lineCap = 'round';
      const step = 0.5 / pxPerMs;
      // pacing spikes are only a millisecond or two wide: plot each one so the sampler cannot step over it
      const spikes: number[] = [];
      for (let k = Math.max(0, engine.lastVentIndex(u - 2)); k < engine.vent.length && engine.vent[k].t <= v + 2; k++) {
        if (engine.vent[k].spike && engine.vent[k].t >= u) spikes.push(engine.vent[k].t - 1.5);
      }
      trace.beginPath();
      let first = true;
      let si = 0;
      const plot = (t: number) => {
        const x = xInWindow(t, ws, page, pxPerMs);
        if (x === null) return;
        const y = yAt(t);
        if (first) {
          if (pen && Math.abs(pen.t - t) <= step * 2.5 && x >= pen.x) trace.moveTo(pen.x, pen.y);
          else trace.moveTo(x, y);
          first = false;
        }
        trace.lineTo(x, y);
        pen = { t, x, y };
      };
      for (let t = u; t <= v; t += step) {
        while (si < spikes.length && spikes[si] < t) plot(spikes[si++]);
        plot(t);
      }
      plot(v);
      trace.stroke();
    };

    const clear = ([d0, d1]: [number, number]) => {
      trace.setTransform(1, 0, 0, 1, 0, 0);
      if (d1 > d0) trace.clearRect(d0, 0, d1 - d0, traceCanvas.height);
    };

    /** Draw (a, b], erasing a short gap ahead of the pen */
    const advance = (a: number, b: number) => {
      for (let k = Math.floor(a / page); k <= Math.floor(b / page); k++) {
        const ws = k * page;
        const u = Math.max(a, ws);
        const v = Math.min(b, ws + page);
        if (v <= u) continue;
        if (u === ws) pen = null;
        clear(eraseSpan((u - ws) * pxPerMs, (v - ws) * pxPerMs, GAP, dpr, traceCanvas.width, u === ws));
        drawRange(ws, u, v);
      }
    };

    /** The whole strip as it stands at T: this sweep up to the pen, the last one beyond the gap */
    const redraw = (T: number) => {
      clear([0, traceCanvas.width]);
      pen = null;
      const ws = windowStart(T, 0, page);
      const prevFrom = T + GAP / pxPerMs - page;
      if (ws > prevFrom && ws > 0) {
        drawRange(ws - page, Math.max(0, prevFrom), ws);
        pen = null;
      }
      if (T > ws) drawRange(ws, ws, T);
    };

    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!sized) return;
      const T = sim.time;
      if (lastT < 0 || sim.epoch !== lastEpoch || leadRef.current !== lastLead || T < lastT || T - lastT > 1500) redraw(T);
      else if (T > lastT) advance(lastT, T);
      lastT = T;
      lastEpoch = sim.epoch;
      lastLead = leadRef.current;
    };

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <figure className="mb-2">
      <figcaption className="flex items-center gap-2 mb-1 text-xs text-slate-300">
        <span className="font-semibold text-emerald-200">Live strip</span>
        <label className="flex items-center gap-1 text-slate-400">
          Lead
          <select
            value={lead}
            onChange={(e) => setLead(e.target.value as StandardLead)}
            className="bg-cardiac-dark border border-slate-600 rounded px-1.5 py-0.5 touch:py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-400"
          >
            {ALL_LEADS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <span className="ml-auto text-slate-400 tabular-nums">{shown} s · 25 mm/s</span>
        <button
          type="button"
          onClick={togglePlay}
          className="w-7 h-7 touch:w-10 touch:h-10 shrink-0 flex items-center justify-center rounded-full bg-cardiac-surface text-white hover:bg-emerald-500 hover:text-slate-950 transition-colors"
          aria-label={playing ? 'Pause the strip' : 'Play the strip'}
          title={playing ? 'Pause' : 'Play'}
        >
          {playing
            ? <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><rect x="2" y="1" width="3" height="10" rx="1" /><rect x="7" y="1" width="3" height="10" rx="1" /></svg>
            : <IconPlay size={12} />}
        </button>
      </figcaption>
      <div
        ref={wrapRef}
        className="relative w-full rounded-md overflow-hidden border border-slate-700"
        // six seconds across; never more than about a quarter of the screen's height (a phone on its side)
        style={{ aspectRatio: `${SECONDS * MM_PER_S} / ${HEIGHT_MM}`, maxHeight: 'min(24dvh, 128px)', background: COLORS.bg }}
        role="img"
        aria-label={`Live ECG strip, lead ${lead}, ${shown} seconds across, 25 millimeters per second`}
      >
        <canvas ref={gridRef} className="absolute inset-0 w-full h-full" />
        <canvas ref={traceRef} className="absolute inset-0 w-full h-full" />
      </div>
    </figure>
  );
}
