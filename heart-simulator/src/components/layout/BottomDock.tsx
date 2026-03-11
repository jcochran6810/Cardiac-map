'use client';

import React, { useState } from 'react';
import { useTimelineStore } from '@/store/useTimelineStore';
import { useECGStore } from '@/store/useECGStore';
import dynamic from 'next/dynamic';

const ECGRenderer = dynamic(() => import('@/components/ecg/ECGRenderer'), { ssr: false });

export default function BottomDock({ style }: { style?: React.CSSProperties }) {
  const {
    playing, togglePlay, heartRate, setHeartRate,
    speed, setSpeed,
    currentPhase,
  } = useTimelineStore();

  const {
    gain, setGain,
    activeProfileId,
  } = useECGStore();

  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      style={collapsed ? { width: 40 } : style}
      className="bg-cardiac-panel border-l border-slate-700 flex flex-col shrink-0 transition-all"
    >
      {/* Top control bar */}
      <div className={`flex items-center px-2 py-2 gap-2 shrink-0 border-b border-slate-700/50 ${
        collapsed ? 'flex-col' : 'flex-row flex-wrap'
      }`}>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-slate-400 hover:text-white text-xs"
        >
          {collapsed ? '◀' : '▶'}
        </button>

        {!collapsed && (
          <>
            {/* Play controls */}
            <button
              onClick={togglePlay}
              className="w-7 h-7 flex items-center justify-center bg-cardiac-surface rounded-full text-white hover:bg-cardiac-accent transition-colors"
            >
              {playing ? '⏸' : '▶'}
            </button>

            {/* Heart rate */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-slate-500">HR:</span>
              <input
                type="range"
                min={20}
                max={200}
                value={heartRate}
                onChange={(e) => setHeartRate(Number(e.target.value))}
                className="w-16 h-1 accent-cardiac-red"
              />
              <span className="text-xs text-cardiac-red font-mono w-8">{heartRate}</span>
            </div>

            {/* Speed */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-slate-500">Speed:</span>
              <select
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="bg-cardiac-surface text-xs text-slate-300 rounded px-1 py-0.5 border-0"
              >
                <option value={0.25}>0.25x</option>
                <option value={0.5}>0.5x</option>
                <option value={1}>1x</option>
              </select>
            </div>

            {/* Gain */}
            <div className="flex items-center gap-0.5">
              <span className="text-[10px] text-slate-500">Gain:</span>
              <input
                type="range"
                min={5}
                max={20}
                value={gain}
                onChange={(e) => setGain(Number(e.target.value))}
                className="w-12 h-1 accent-cardiac-accent"
              />
            </div>

            {/* Active profile */}
            <div className="text-[10px] text-slate-500 capitalize">
              {activeProfileId.replace(/-/g, ' ')}
            </div>
          </>
        )}
      </div>

      {/* ECG display — 12 leads in 2x6 grid */}
      {!collapsed && (
        <div className="flex-1 min-h-0 relative">
          <ECGRenderer compact={false} verticalStack={true} />

          {/* Phase indicator — fixed position overlay, does not affect layout */}
          <div className="absolute top-1 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-cardiac-dark/80 rounded-full px-2 py-0.5 pointer-events-none z-10">
            <div className="w-2 h-2 rounded-full bg-cardiac-red animate-pulse" />
            <span className="text-[10px] text-slate-300 capitalize whitespace-nowrap">{currentPhase.replace(/-/g, ' ')}</span>
          </div>

          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] text-slate-600 pointer-events-none whitespace-nowrap">
            Drag left/right to scrub ECG
          </div>
        </div>
      )}
    </div>
  );
}
