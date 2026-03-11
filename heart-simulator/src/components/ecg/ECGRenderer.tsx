'use client';

import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { useECGStore, ECGLead } from '@/store/useECGStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { generateBeatSample, getLeadParams, CONDITION_MODIFIERS, generateVFibSample, generateAFibSample, generateFlutterBaseline } from '@/lib/ecg/waveformEngine';

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

// Playhead offset: 3 major grid squares (75px) from left edge of each cell
const PLAYHEAD_OFFSET = 75;

// Phase label lookup for the playhead
const PHASE_LABELS: Record<string, string> = {
  'atrial-systole': 'P wave',
  'isovolumetric-contraction': 'PR seg',
  'rapid-ejection': 'QRS',
  'reduced-ejection': 'QRS',
  'isovolumetric-relaxation': 'ST seg',
  'rapid-filling': 'T wave',
  'diastasis': 'Baseline',
  'atrial-relaxation': 'Baseline',
};

interface ECGRendererProps {
  width?: number;
  height?: number;
  compact?: boolean;
  verticalStack?: boolean;
}

export default function ECGRenderer({ width, height, compact = false, verticalStack = false }: ECGRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  // dragOffsetRef holds only the manual drag offset; auto-scroll is computed from time
  const dragOffsetRef = useRef(0);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const lastDragXRef = useRef(0);

  const { activeProfileId, compareProfileId, displayMode, visibleLeads, gain, sweepSpeed, showBeatMarkers, showAnnotations, caliperMode, selectedLead, selectLead } = useECGStore();
  const { time, heartRate, speed, playing, frozen, currentPhase, cycleProgress } = useTimelineStore();

  // Track layout for click detection
  const layoutRef = useRef<{ leads: ECGLead[]; cols: number; rows: number; cellW: number; cellH: number }>({
    leads: [], cols: 1, rows: 1, cellW: 0, cellH: 0,
  });

  const conditionMod = useMemo(() => {
    return CONDITION_MODIFIERS[activeProfileId] || {};
  }, [activeProfileId]);

  const compareMod = useMemo(() => {
    if (!compareProfileId) return null;
    return CONDITION_MODIFIERS[compareProfileId] || {};
  }, [compareProfileId]);

  // Mouse drag handlers for scrubbing + click-to-select lead
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      dragStartXRef.current = e.clientX;
      lastDragXRef.current = e.clientX;
      canvas.style.cursor = 'grabbing';
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - lastDragXRef.current;
      dragOffsetRef.current -= dx * 2;
      lastDragXRef.current = e.clientX;
    };

    const onMouseUp = (e: MouseEvent) => {
      const wasDrag = Math.abs(e.clientX - dragStartXRef.current) > 5;
      isDraggingRef.current = false;
      canvas.style.cursor = 'grab';

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

    canvas.style.cursor = 'grab';
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseLeave);

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [selectLead]);

  const drawGrid = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const gridSize = 5;
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 0.5;
    for (let x = 0; x < w; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    const majorSize = 25;
    ctx.strokeStyle = GRID_MAJOR_COLOR;
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += majorSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += majorSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }, []);

  const drawLead = useCallback((
    ctx: CanvasRenderingContext2D,
    lead: ECGLead,
    x: number,
    y: number,
    w: number,
    h: number,
    scrollOffset: number,
    mods: Partial<Record<string, number>>,
    color: string,
  ) => {
    const params = getLeadParams(lead);
    Object.assign(params, mods);

    const gainScale = gain * 8;
    const baseline = y + h / 2;
    const rrPixels = (60 / heartRate) * sweepSpeed * 4;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    for (let px = 0; px < w; px++) {
      const t = ((px + scrollOffset) % rrPixels) / rrPixels;
      let sample: number;

      if (activeProfileId === 'ventricular-fibrillation' || activeProfileId === 'vfib') {
        sample = generateVFibSample(t);
      } else if (activeProfileId === 'torsades') {
        // Torsades: sinusoidal amplitude modulation (twisting) with wide QRS
        const modulationFreq = 0.15;
        const envelope = 0.3 + 0.7 * Math.abs(Math.sin(2 * Math.PI * modulationFreq * (px + scrollOffset) * 0.01));
        sample = generateBeatSample(t, params) * envelope;
      } else if (activeProfileId === 'atrial-fibrillation' || activeProfileId === 'afib') {
        sample = generateAFibSample(t, params);
      } else if (activeProfileId === 'atrial-flutter' || activeProfileId === 'aflutter') {
        const beat = generateBeatSample(t, params);
        const flutter = generateFlutterBaseline(t + scrollOffset * 0.001, 300);
        sample = beat + flutter;
      } else {
        sample = generateBeatSample(t, params);
      }

      const py = baseline - sample * gainScale;

      if (px === 0) {
        ctx.moveTo(x + px, py);
      } else {
        ctx.lineTo(x + px, py);
      }
    }
    ctx.stroke();

    // Lead label
    ctx.fillStyle = '#94A3B8';
    ctx.font = compact ? '9px sans-serif' : '11px sans-serif';
    ctx.fillText(lead, x + 3, y + 12);
  }, [gain, sweepSpeed, heartRate, activeProfileId, compact]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);

    drawGrid(ctx, w, h);

    // Use standard 12-lead bisect order when showing all 12 leads
    const useStandard12 = visibleLeads.length === 12;
    const leads = compact
      ? visibleLeads.slice(0, 4)
      : (useStandard12 ? STANDARD_12_ORDER : visibleLeads);

    let rows: number;
    let cols: number;
    if (useStandard12 && !compact) {
      // Standard 12-lead bisect: 4 columns × 3 rows
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

    // Store layout for click detection
    layoutRef.current = { leads: leads as ECGLead[], cols, rows, cellW, cellH };

    // Compute scroll offset synced to timeline time so the playhead
    // correlates exactly with the 3D model's cardiac cycle phase.
    // pxPerMs = pixels scrolled per millisecond of timeline time
    const rrPixels = (60 / heartRate) * sweepSpeed * 4;
    const cycleDurationMs = (60 / heartRate) * 1000;
    const pxPerMs = rrPixels / cycleDurationMs;

    // scrollOffset: time-based auto-scroll minus playhead offset, plus any manual drag
    const scrollOffset = (time * pxPerMs) - PLAYHEAD_OFFSET + dragOffsetRef.current;

    leads.forEach((lead, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = col * cellW;
      const cy = row * cellH;

      // Highlight selected lead cell
      if (selectedLead === lead) {
        ctx.fillStyle = SELECTED_BG;
        ctx.fillRect(cx, cy, cellW, cellH);
        ctx.strokeStyle = SELECTED_BORDER;
        ctx.lineWidth = 2;
        ctx.strokeRect(cx + 1, cy + 1, cellW - 2, cellH - 2);
      }

      drawLead(ctx, lead as ECGLead, cx, cy, cellW, cellH, scrollOffset, conditionMod, TRACE_COLOR);

      if (compareMod) {
        drawLead(ctx, lead as ECGLead, cx, cy, cellW, cellH, scrollOffset, compareMod, COMPARE_COLOR);
      }
    });

    // ─── Draw playhead line in each cell ──────────────────────────
    const playheadX = PLAYHEAD_OFFSET;
    if (playheadX > 0 && playheadX < cellW) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          if (idx >= leads.length) continue;

          const cx = c * cellW;
          const cy = r * cellH;
          const lineX = cx + playheadX;

          // Glow
          ctx.strokeStyle = PLAYHEAD_GLOW;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(lineX, cy);
          ctx.lineTo(lineX, cy + cellH);
          ctx.stroke();

          // Solid line
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

    // ─── Playhead label (top of canvas, once) ─────────────────────
    const phaseLabel = PHASE_LABELS[currentPhase] || currentPhase;
    const labelX = PLAYHEAD_OFFSET;
    // Draw phase label badge
    ctx.font = 'bold 9px sans-serif';
    const textWidth = ctx.measureText(phaseLabel).width;
    const badgeW = textWidth + 8;
    const badgeH = 14;
    const badgeX = labelX - badgeW / 2;
    const badgeY = 1;

    ctx.fillStyle = 'rgba(245, 158, 11, 0.85)';
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 3);
    ctx.fill();

    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.fillText(phaseLabel, labelX, badgeY + 10.5);
    ctx.textAlign = 'left'; // reset

    // ─── Draw solid dividing lines between lead cells ─────────────
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.7)';
    ctx.lineWidth = 2.5;
    for (let c = 1; c < cols; c++) {
      const x = c * cellW;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let r = 1; r < rows; r++) {
      const y = r * cellH;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Heart rate display
    ctx.fillStyle = '#F59E0B';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`HR: ${heartRate} bpm`, w - 120, 18);

    if (displayMode === 'frozen') {
      ctx.fillStyle = 'rgba(220, 38, 38, 0.8)';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('FROZEN', w - 120, 36);
    }

    animRef.current = requestAnimationFrame(render);
  }, [drawGrid, drawLead, visibleLeads, displayMode, playing, frozen, heartRate, speed, time, currentPhase, cycleProgress, conditionMod, compareMod, compact, verticalStack, selectedLead, sweepSpeed]);

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
    animRef.current = requestAnimationFrame(render);

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(animRef.current);
    };
  }, [render]);

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
