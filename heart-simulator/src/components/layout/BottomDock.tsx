'use client';

import React, { useState } from 'react';
import { useTimelineStore } from '@/store/useTimelineStore';
import { useECGStore } from '@/store/useECGStore';
import dynamic from 'next/dynamic';

const ECGRenderer = dynamic(() => import('@/components/ecg/ECGRenderer'), { ssr: false });

export default function BottomDock() {
  const {
    playing, togglePlay, heartRate, setHeartRate,
    speed, setSpeed, frozen, freeze, unfreeze,
    currentPhase, cycleProgress,
  } = useTimelineStore();

  const {
    displayMode, setDisplayMode, gain, setGain, sweepSpeed, setSweepSpeed,
    showBeatMarkers, toggleBeatMarkers, showAnnotations, toggleAnnotations,
    caliperMode, toggleCalipers, activeProfileId,
  } = useECGStore();

  const [expanded, setExpanded] = useState(true);

  return (
    <div className={`bg-cardiac-panel border-t border-slate-700 flex flex-col shrink-0 transition-all ${
      expanded ? 'h-64' : 'h-10'
    }`}>
      {/* Control bar */}
      <div className="h-10 flex items-center px-3 gap-3 shrink-0 border-b border-slate-700/50">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-slate-400 hover:text-white text-xs"
        >
          {expanded ? '▼ ECG' : '▲ ECG'}
        </button>

        {/* Play controls */}
        <button
          onClick={togglePlay}
          className="w-7 h-7 flex items-center justify-center bg-cardiac-surface rounded-full text-white hover:bg-cardiac-accent transition-colors"
        >
          {playing ? '⏸' : '▶'}
        </button>

        <button
          onClick={frozen ? unfreeze : freeze}
          className={`px-2 py-1 text-xs rounded ${
            frozen ? 'bg-red-900/50 text-red-400' : 'bg-cardiac-surface text-slate-400 hover:text-white'
          }`}
        >
          {frozen ? 'FROZEN' : 'Freeze'}
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
            className="w-20 h-1 accent-cardiac-red"
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
            <option value={2}>2x</option>
          </select>
        </div>

        {/* Phase indicator */}
        <div className="flex items-center gap-2 ml-2">
          <div className="w-2 h-2 rounded-full bg-cardiac-red animate-pulse" />
          <span className="text-[10px] text-slate-400 capitalize">{currentPhase.replace(/-/g, ' ')}</span>
        </div>

        {/* ECG Controls */}
        <div className="flex items-center gap-1 ml-auto">
          <select
            value={displayMode}
            onChange={(e) => setDisplayMode(e.target.value as any)}
            className="bg-cardiac-surface text-[10px] text-slate-300 rounded px-1 py-0.5"
          >
            <option value="scrolling">Scroll</option>
            <option value="frozen">Freeze</option>
            <option value="scrub">Scrub</option>
            <option value="compare">Compare</option>
          </select>

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

          <button
            onClick={toggleCalipers}
            className={`px-1.5 py-0.5 text-[10px] rounded ${
              caliperMode ? 'bg-cardiac-accent/20 text-cardiac-accent' : 'text-slate-500 hover:text-white'
            }`}
          >
            Calipers
          </button>

          <button
            onClick={toggleAnnotations}
            className={`px-1.5 py-0.5 text-[10px] rounded ${
              showAnnotations ? 'bg-cardiac-accent/20 text-cardiac-accent' : 'text-slate-500 hover:text-white'
            }`}
          >
            Labels
          </button>
        </div>

        {/* Active profile */}
        <div className="text-[10px] text-slate-500 capitalize">
          {activeProfileId.replace(/-/g, ' ')}
        </div>
      </div>

      {/* ECG display */}
      {expanded && (
        <div className="flex-1 min-h-0">
          <ECGRenderer compact={false} />
        </div>
      )}
    </div>
  );
}
