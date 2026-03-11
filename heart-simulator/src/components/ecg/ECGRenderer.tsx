'use client';

import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { useECGStore, ECGLead } from '@/store/useECGStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { generateBeatSample, getLeadParams, CONDITION_MODIFIERS, generateVFibSample, generateAFibSample, generateFlutterBaseline } from '@/lib/ecg/waveformEngine';

const LEAD_ORDER: ECGLead[] = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
const GRID_COLOR = 'rgba(220, 38, 38, 0.15)';
const GRID_MAJOR_COLOR = 'rgba(220, 38, 38, 0.3)';
const TRACE_COLOR = '#10B981';
const COMPARE_COLOR = '#3B82F6';

interface ECGRendererProps {
  width?: number;
  height?: number;
  compact?: boolean;
}

export default function ECGRenderer({ width, height, compact = false }: ECGRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const scrollOffsetRef = useRef(0);

  const { activeProfileId, compareProfileId, displayMode, visibleLeads, gain, sweepSpeed, showBeatMarkers, showAnnotations, caliperMode } = useECGStore();
  const { time, heartRate, playing, frozen } = useTimelineStore();

  const conditionMod = useMemo(() => {
    return CONDITION_MODIFIERS[activeProfileId] || {};
  }, [activeProfileId]);

  const compareMod = useMemo(() => {
    if (!compareProfileId) return null;
    return CONDITION_MODIFIERS[compareProfileId] || {};
  }, [compareProfileId]);

  const drawGrid = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    // Minor grid (1mm = 5px at 25mm/s)
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
    // Major grid (5mm = 25px)
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
    const samplesPerPixel = 1;
    const rrPixels = (60 / heartRate) * sweepSpeed * 4;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    for (let px = 0; px < w; px++) {
      const t = ((px + scrollOffset) % rrPixels) / rrPixels;
      let sample: number;

      if (activeProfileId === 'ventricular-fibrillation' || activeProfileId === 'vfib') {
        sample = generateVFibSample(t);
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

    // Use logical (CSS) dimensions since ctx.scale(devicePixelRatio) is already applied
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);

    drawGrid(ctx, w, h);

    const leads = compact ? visibleLeads.slice(0, 4) : visibleLeads;
    const rows = compact ? Math.min(leads.length, 4) : Math.ceil(leads.length / (leads.length > 6 ? 3 : 2));
    const cols = compact ? 1 : (leads.length > 6 ? 3 : leads.length > 3 ? 2 : 1);
    const cellW = w / cols;
    const cellH = h / rows;

    if (displayMode === 'scrolling' && playing && !frozen) {
      scrollOffsetRef.current += 1.5;
    }

    leads.forEach((lead, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = col * cellW;
      const cy = row * cellH;

      drawLead(ctx, lead, cx, cy, cellW, cellH, scrollOffsetRef.current, conditionMod, TRACE_COLOR);

      if (compareMod) {
        drawLead(ctx, lead, cx, cy, cellW, cellH, scrollOffsetRef.current, compareMod, COMPARE_COLOR);
      }
    });

    // Draw solid dividing lines between lead cells
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.lineWidth = 1.5;
    // Vertical dividers between columns
    for (let c = 1; c < cols; c++) {
      const x = c * cellW;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    // Horizontal dividers between rows
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
  }, [drawGrid, drawLead, visibleLeads, displayMode, playing, frozen, heartRate, conditionMod, compareMod, compact]);

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
