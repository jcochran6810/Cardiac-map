'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import { useECGStore, ECGLead } from '@/store/useECGStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { sampleECG, rhythmKindFor } from '@/lib/ecg/waveformEngine';
import { ecgFeatureAt } from '@/lib/physiology/cycleTiming';

// Standard 12-lead bisect layout: 4 columns × 3 rows
// Col 0: Limb leads, Col 1: Augmented, Col 2: Right precordial, Col 3: Left precordial
const STANDARD_12_ORDER: ECGLead[] = [
  'I',   'aVR', 'V1', 'V4',
  'II',  'aVL', 'V2', 'V5',
  'III', 'aVF', 'V3', 'V6',
];

const GRID_COLOR = 'rgba(220, 38, 38, 0.15)';
const GRID_MAJOR_COLOR = 'rgba(220, 38, 38, 0.3)';
const TRACE_COLOR = '#10B981';
const COMPARE_COLOR = '#3B82F6';
const SELECTED_BG = 'rgba(245, 158, 11, 0.08)';
const SELECTED_BORDER = 'rgba(245, 158, 11, 0.6)';
const PLAYHEAD_COLOR = 'rgba(245, 158, 11, 0.35)';
const PLAYHEAD_GLOW = 'rgba(245, 158, 11, 0.12)';

// ECG paper geometry: 1 small box = 5 px = 1 mm. 1 large box = 25 px = 5 mm.
// At 25 mm/s one large box is 0.2 s; at 10 mm/mV one millivolt is 10 mm = 50 px.
const PX_PER_MM = 5;

// Playhead offset: 3 major grid squares (75px) from the left edge of each lead cell
const PLAYHEAD_OFFSET = 75;

interface ECGRendererProps {
  width?: number;
  height?: number;
  compact?: boolean;
  verticalStack?: boolean;
  inspectLead?: string | null;
}

export default function ECGRenderer({ width, height, compact = false, verticalStack = false, inspectLead = null }: ECGRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  // dragOffsetRef holds only the manual drag offset (px); auto-scroll is computed from time
  const dragOffsetRef = useRef(0);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const lastDragXRef = useRef(0);

  const { activeProfileId, compareProfileId, displayMode, visibleLeads, gain, sweepSpeed, selectedLead, selectLead } = useECGStore();
  // Timeline values change every frame; they are read directly inside the draw
  // loop (not subscribed) so this component does not re-render 60x per second.

  // Track layout for click detection
  const layoutRef = useRef<{ leads: ECGLead[]; cols: number; rows: number; cellW: number; cellH: number }>({
    leads: [], cols: 1, rows: 1, cellW: 0, cellH: 0,
  });

  // Mouse drag handlers for scrubbing + click-to-select lead
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Pointer events cover mouse, pen and touch with one code path
    const onMouseDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      isDraggingRef.current = true;
      dragStartXRef.current = e.clientX;
      lastDragXRef.current = e.clientX;
      canvas.style.cursor = 'grabbing';
      try { canvas.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    };

    const onMouseMove = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - lastDragXRef.current;
      dragOffsetRef.current -= dx * 2;
      lastDragXRef.current = e.clientX;
    };

    const onMouseUp = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const wasDrag = Math.abs(e.clientX - dragStartXRef.current) > 8;
      isDraggingRef.current = false;
      canvas.style.cursor = 'grab';
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* not captured */ }

      // If it was a click (not a drag), detect which lead was clicked
      if (!wasDrag) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const layout = layoutRef.current;
        if (layout.cellW > 0 && layout.cellH > 0) {
          const col = Math.floor(x / layout.cellW);
          const row = Math.floor(y / layout.cellH);
          const idx = row * layout.cols + col;
          if (idx >= 0 && idx < layout.leads.length) {
            selectLead(layout.leads[idx]);
          }
        }
      }
    };

    const onMouseLeave = () => {
      isDraggingRef.current = false;
      canvas.style.cursor = 'grab';
    };

    const onDoubleClick = () => {
      // Double-click re-centres the strip on the live playhead
      dragOffsetRef.current = 0;
    };

    canvas.style.cursor = 'grab';
    canvas.style.touchAction = 'none'; // scrubbing must not scroll the page
    canvas.addEventListener('pointerdown', onMouseDown);
    canvas.addEventListener('pointermove', onMouseMove);
    canvas.addEventListener('pointerup', onMouseUp);
    canvas.addEventListener('pointercancel', onMouseLeave);
    canvas.addEventListener('dblclick', onDoubleClick);

    return () => {
      canvas.removeEventListener('pointerdown', onMouseDown);
      canvas.removeEventListener('pointermove', onMouseMove);
      canvas.removeEventListener('pointerup', onMouseUp);
      canvas.removeEventListener('pointercancel', onMouseLeave);
      canvas.removeEventListener('dblclick', onDoubleClick);
    };
  }, [selectLead]);

  const drawGrid = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const gridSize = PX_PER_MM;
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = 0; x < w; x += gridSize) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0; y < h; y += gridSize) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();

    const majorSize = PX_PER_MM * 5;
    ctx.strokeStyle = GRID_MAJOR_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < w; x += majorSize) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0; y < h; y += majorSize) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
  }, []);

  const drawLead = useCallback((
    ctx: CanvasRenderingContext2D,
    lead: ECGLead,
    x: number,
    y: number,
    w: number,
    h: number,
    scrollOffsetPx: number,
    pxPerMs: number,
    profileId: string,
    heartRate: number,
    color: string,
  ) => {
    const pxPerMv = gain * PX_PER_MM;       // 10 mm/mV → 50 px per mV
    const baseline = y + h * 0.58;

    // 1 mV calibration pulse at the left edge of the cell
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 2, baseline);
    ctx.lineTo(x + 4, baseline);
    ctx.lineTo(x + 4, baseline - pxPerMv);
    ctx.lineTo(x + 10, baseline - pxPerMv);
    ctx.lineTo(x + 10, baseline);
    ctx.lineTo(x + 12, baseline);
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();

    const startPx = 12;
    for (let px = startPx; px < w; px++) {
      const tMs = (px - PLAYHEAD_OFFSET + scrollOffsetPx) / pxPerMs;
      const sample = tMs < 0 ? 0 : sampleECG(tMs, lead, profileId, heartRate);
      const py = baseline - sample * pxPerMv;
      if (px === startPx) ctx.moveTo(x + px, py);
      else ctx.lineTo(x + px, py);
    }
    ctx.stroke();

    // Lead label
    ctx.fillStyle = '#94A3B8';
    ctx.font = compact ? '9px sans-serif' : 'bold 11px sans-serif';
    ctx.fillText(lead, x + 14, y + 12);
  }, [gain, compact]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { time, heartRate, cycleProgress, beatHasQRS, beatHasP, fibrillating, frozen } = useTimelineStore.getState();

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);

    drawGrid(ctx, w, h);

    // Inspect mode: show only one lead, full size
    const isInspecting = inspectLead && visibleLeads.includes(inspectLead as ECGLead);

    // Use standard 12-lead bisect order when showing all 12 leads
    const useStandard12 = !isInspecting && !verticalStack && visibleLeads.length === 12;
    const leads = isInspecting
      ? [inspectLead as ECGLead]
      : compact
        ? visibleLeads.slice(0, 4)
        : (useStandard12 ? STANDARD_12_ORDER : visibleLeads);

    let rows: number;
    let cols: number;
    if (isInspecting) {
      cols = 1;
      rows = 1;
    } else if (useStandard12 && !compact) {
      cols = 4;
      rows = 3;
    } else if (verticalStack) {
      cols = 2;
      rows = Math.ceil(leads.length / cols);
    } else {
      rows = compact ? Math.min(leads.length, 4) : Math.ceil(leads.length / (leads.length > 6 ? 3 : 2));
      cols = compact ? 1 : (leads.length > 6 ? 3 : leads.length > 3 ? 2 : 1);
    }

    const cellW = w / cols;
    const cellH = h / rows;

    layoutRef.current = { leads: leads as ECGLead[], cols, rows, cellW, cellH };

    // Sweep: 25 mm/s → 125 px/s → 0.125 px per ms. The strip is scrolled by
    // simulation time so the sample under the playhead is exactly the sample
    // the 3D model and the hemodynamics engine are showing.
    const pxPerMs = (sweepSpeed * PX_PER_MM) / 1000;
    const scrollOffsetPx = time * pxPerMs + dragOffsetRef.current;

    leads.forEach((lead, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = col * cellW;
      const cy = row * cellH;

      if (selectedLead === lead) {
        ctx.fillStyle = SELECTED_BG;
        ctx.fillRect(cx, cy, cellW, cellH);
        ctx.strokeStyle = SELECTED_BORDER;
        ctx.lineWidth = 2;
        ctx.strokeRect(cx + 1, cy + 1, cellW - 2, cellH - 2);
      }

      if (compareProfileId) {
        drawLead(ctx, lead as ECGLead, cx, cy, cellW, cellH, scrollOffsetPx, pxPerMs, compareProfileId, heartRate, COMPARE_COLOR);
      }
      drawLead(ctx, lead as ECGLead, cx, cy, cellW, cellH, scrollOffsetPx, pxPerMs, activeProfileId, heartRate, TRACE_COLOR);
    });

    // ─── Playhead line in each cell ───────────────────────────────
    const playheadX = PLAYHEAD_OFFSET;
    const scrubbed = Math.abs(dragOffsetRef.current) > 0.5;
    if (playheadX > 0 && playheadX < cellW) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          if (idx >= leads.length) continue;
          const lineX = c * cellW + playheadX;
          const cy = r * cellH;

          ctx.strokeStyle = PLAYHEAD_GLOW;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(lineX, cy);
          ctx.lineTo(lineX, cy + cellH);
          ctx.stroke();

          ctx.strokeStyle = PLAYHEAD_COLOR;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(lineX, cy);
          ctx.lineTo(lineX, cy + cellH);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    // ─── Playhead label (what the live heart is doing right now) ──
    const kind = rhythmKindFor(activeProfileId);
    let phaseLabel: string;
    const feature = ecgFeatureAt(cycleProgress);
    if (fibrillating) phaseLabel = 'V-Fib';
    else if (!beatHasQRS && (feature === 'QRS' || feature === 'ST seg' || feature === 'T wave')) phaseLabel = 'Blocked P';
    else if (!beatHasP && (feature === 'P wave' || feature === 'PR seg')) phaseLabel = kind === 'afib' ? 'f waves' : kind === 'aflutter' ? 'F waves' : kind === 'complete-block' ? 'AV dissociation' : 'No P';
    else phaseLabel = feature;
    if (scrubbed) phaseLabel = `${phaseLabel} · scrubbed (dbl-click to resync)`;

    ctx.font = 'bold 9px sans-serif';
    const textWidth = ctx.measureText(phaseLabel).width;
    const badgeW = textWidth + 8;
    const badgeH = 14;
    const badgeX = Math.max(2, PLAYHEAD_OFFSET - badgeW / 2);
    ctx.fillStyle = 'rgba(245, 158, 11, 0.85)';
    ctx.beginPath();
    ctx.roundRect(badgeX, 1, badgeW, badgeH, 3);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.textAlign = 'left';
    ctx.fillText(phaseLabel, badgeX + 4, 11.5);

    // ─── Solid dividing lines between lead cells ──────────────────
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.7)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let c = 1; c < cols; c++) { ctx.moveTo(c * cellW, 0); ctx.lineTo(c * cellW, h); }
    for (let r = 1; r < rows; r++) { ctx.moveTo(0, r * cellH); ctx.lineTo(w, r * cellH); }
    ctx.stroke();

    // Heart rate + paper settings
    ctx.fillStyle = '#F59E0B';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`HR ${fibrillating ? '---' : heartRate} bpm`, w - 8, 18);
    ctx.fillStyle = '#64748B';
    ctx.font = '9px monospace';
    ctx.fillText(`${sweepSpeed} mm/s  ${gain} mm/mV`, w - 8, 30);
    ctx.textAlign = 'left';

    if (displayMode === 'frozen' || frozen) {
      ctx.fillStyle = 'rgba(220, 38, 38, 0.8)';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('FROZEN', w - 120, 44);
    }
  }, [drawGrid, drawLead, visibleLeads, displayMode, activeProfileId, compareProfileId, compact, verticalStack, selectedLead, sweepSpeed, gain, inspectLead]);

  // Keep the latest render function in a ref so a single persistent
  // requestAnimationFrame loop can call it without being re-created (and
  // cancelled) every time the timeline advances.
  const renderRef = useRef(render);
  useEffect(() => { renderRef.current = render; }, [render]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        canvas.width = w * window.devicePixelRatio;
        canvas.height = h * window.devicePixelRatio;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      }
    });

    resizeObserver.observe(canvas.parentElement!);
    const loop = () => {
      renderRef.current();
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <div className="w-full h-full relative ecg-grid">
      <canvas
        ref={canvasRef}
        className="w-full h-full ecg-canvas"
        style={{ width: width || '100%', height: height || '100%' }}
      />
    </div>
  );
}
