'use client';

import React from 'react';
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
    selectedLead,
    inspectLead,
    setInspectLead,
  } = useECGStore();

  return (
    <div
      style={style}
      className="bg-cardiac-panel border-t border-slate-700 flex flex-col shrink-0"
    >
      {/* Horizontal control bar */}
      <div className="flex items-center px-3 py-1.5 gap-3 shrink-0 border-b border-slate-700/50">
        {/* Play controls */}
        <button
          onClick={togglePlay}
          className="w-7 h-7 flex items-center justify-center bg-cardiac-surface rounded-full text-white hover:bg-cardiac-accent transition-colors shrink-0"
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
          </select>
        </div>

        {/* Gain */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-slate-500">Gain:</span>
          <input
            type="range"
            min={5}
            max={20}
            value={gain}
            onChange={(e) => setGain(Number(e.target.value))}
            className="w-16 h-1 accent-cardiac-accent"
          />
        </div>

        {/* Phase indicator */}
        <div className="flex items-center gap-1.5 ml-2">
          <div className="w-2 h-2 rounded-full bg-cardiac-red animate-pulse" />
          <span className="text-[10px] text-slate-300 capitalize whitespace-nowrap">{currentPhase.replace(/-/g, ' ')}</span>
        </div>

        {/* Inspect button — shown when a lead is selected */}
        {(selectedLead || inspectLead) && (
          <button
            onClick={() => {
              if (inspectLead) {
                setInspectLead(null);
              } else if (selectedLead) {
                setInspectLead(selectedLead);
              }
            }}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              inspectLead
                ? 'bg-cardiac-red/20 text-cardiac-red border border-cardiac-red/40'
                : 'bg-cardiac-accent/20 text-cardiac-accent border border-cardiac-accent/40'
            }`}
          >
            {inspectLead ? `Close (${inspectLead})` : `Inspect ${selectedLead}`}
          </button>
        )}

        {/* Active profile */}
        <div className="text-[10px] text-slate-500 capitalize ml-auto">
          {activeProfileId.replace(/-/g, ' ')}
        </div>
      </div>

      {/* Full-width 12-lead ECG display — standard 4x3 bisect layout */}
      <div className="flex-1 min-h-0 relative">
        <ECGRenderer compact={false} verticalStack={false} inspectLead={inspectLead} />
      </div>
    </div>
  );
}
