'use client';

import React from 'react';
import { useTimelineStore } from '@/store/useTimelineStore';
import { useECGStore } from '@/store/useECGStore';
import { useAppStore } from '@/store/useAppStore';
import { useConditionStore } from '@/store/useConditionStore';
import { PROFILE_NAMES, rhythmKindFor } from '@/lib/ecg/waveformEngine';
import { CONDITION_DATA, CONDITION_IDS } from '@/data/conditionData';
import dynamic from 'next/dynamic';

const ECGRenderer = dynamic(() => import('@/components/ecg/ECGRenderer'), { ssr: false });

const RHYTHM_OPTIONS = Object.keys(PROFILE_NAMES);

export default function BottomDock({ style }: { style?: React.CSSProperties }) {
  const {
    playing, togglePlay, heartRate, setHeartRate,
    speed, setSpeed, currentPhase, fibrillating, beatHasQRS, beatHasP, refresh,
  } = useTimelineStore();

  const {
    gain, setGain,
    activeProfileId, setActiveProfile,
    compareProfileId, setCompareProfile,
    selectedLead, inspectLead, setInspectLead,
  } = useECGStore();
  const { setCompareMode } = useAppStore();
  const { setCompareCondition } = useConditionStore();

  // Picking a rhythm also applies the characteristic rate of the matching condition
  const applyRhythm = (profileId: string) => {
    setActiveProfile(profileId);
    const cond = CONDITION_IDS.map((id) => CONDITION_DATA[id]).find((c) => c.ecgProfile === profileId);
    if (cond?.heartRate) setHeartRate(cond.heartRate);
    refresh();
  };

  const rhythmKind = rhythmKindFor(activeProfileId);
  const rhythmNote = rhythmKind === 'afib' ? 'irregularly irregular'
    : rhythmKind === 'mobitz-i' ? 'progressive PR → dropped beat'
    : rhythmKind === 'mobitz-ii' ? '3:2 conduction'
    : rhythmKind === 'complete-block' ? 'AV dissociation (atria ~78/min)'
    : rhythmKind === 'pvcs' ? 'every 4th beat ectopic'
    : rhythmKind === 'aflutter' ? 'F waves 300/min'
    : rhythmKind === 'vfib' ? 'no cardiac output'
    : rhythmKind === 'torsades' ? 'twisting polymorphic VT'
    : null;

  const phaseText = fibrillating ? 'fibrillating' : currentPhase.replace(/-/g, ' ');
  const beatNote = !fibrillating && !beatHasQRS ? 'blocked beat' : !fibrillating && !beatHasP ? 'no atrial kick' : null;

  const clearCompare = () => {
    setCompareProfile(null);
    setCompareCondition(null);
    setCompareMode(false);
  };

  return (
    <div style={style} className="bg-cardiac-panel border-t border-slate-700 flex flex-col shrink-0">
      {/* Horizontal control bar */}
      <div className="flex items-center px-3 py-1.5 gap-3 shrink-0 border-b border-slate-700/50 overflow-x-auto">
        {/* Play controls */}
        <button
          onClick={togglePlay}
          title={playing ? 'Pause' : 'Play'}
          className="w-7 h-7 flex items-center justify-center bg-cardiac-surface rounded-full text-white hover:bg-cardiac-accent transition-colors shrink-0"
        >
          {playing ? '⏸' : '▶'}
        </button>

        {/* Heart rate */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] text-slate-500">HR:</span>
          <input
            type="range"
            min={20}
            max={220}
            value={heartRate}
            onChange={(e) => setHeartRate(Number(e.target.value))}
            className="w-20 h-1 accent-cardiac-red"
          />
          <span className="text-xs text-cardiac-red font-mono w-8">{fibrillating ? '---' : heartRate}</span>
        </div>

        {/* Speed */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] text-slate-500">Speed:</span>
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="bg-cardiac-surface text-xs text-slate-300 rounded px-1 py-0.5 border-0"
          >
            <option value={0.1}>0.1x</option>
            <option value={0.25}>0.25x</option>
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
          </select>
        </div>

        {/* Gain */}
        <div className="flex items-center gap-1 shrink-0" title="Gain (mm/mV)">
          <span className="text-[10px] text-slate-500">Gain:</span>
          <input
            type="range"
            min={5}
            max={20}
            value={gain}
            onChange={(e) => setGain(Number(e.target.value))}
            className="w-16 h-1 accent-cardiac-accent"
          />
          <span className="text-[10px] text-slate-400 font-mono w-6">{gain}</span>
        </div>

        {/* Rhythm picker */}
        <div className="flex items-center gap-1 shrink-0" title="Rhythm shown on the ECG and driving the 3D heart">
          <span className="text-[10px] text-slate-500">Rhythm:</span>
          <select
            value={activeProfileId}
            onChange={(e) => applyRhythm(e.target.value)}
            className="bg-cardiac-surface text-xs text-emerald-300 rounded px-1 py-0.5 border-0 max-w-[180px]"
          >
            {RHYTHM_OPTIONS.map((id) => <option key={id} value={id}>{PROFILE_NAMES[id]}</option>)}
          </select>
          {rhythmNote && <span className="text-[10px] text-slate-500 hidden xl:inline">({rhythmNote})</span>}
        </div>

        {/* Compare legend */}
        {compareProfileId && (
          <div className="flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded bg-cardiac-dark border border-slate-700">
            <span className="w-3 h-0.5 bg-emerald-400 inline-block" />
            <span className="text-[10px] text-slate-400">{PROFILE_NAMES[activeProfileId] ?? activeProfileId}</span>
            <span className="text-[10px] text-slate-600">vs</span>
            <span className="w-3 h-0.5 bg-blue-400 inline-block" />
            <span className="text-[10px] text-slate-400">{PROFILE_NAMES[compareProfileId] ?? compareProfileId}</span>
            <button onClick={clearCompare} className="text-slate-500 hover:text-white text-xs ml-1" title="Clear comparison">×</button>
          </div>
        )}

        {/* Phase indicator */}
        <div className="flex items-center gap-1.5 ml-2 shrink-0">
          <div className={`w-2 h-2 rounded-full ${fibrillating ? 'bg-red-500 animate-ping' : 'bg-cardiac-red animate-pulse'}`} />
          <span className="text-[10px] text-slate-300 capitalize whitespace-nowrap">{phaseText}</span>
          {beatNote && <span className="text-[10px] text-yellow-400 whitespace-nowrap">· {beatNote}</span>}
        </div>

        {/* Inspect button — shown when a lead is selected */}
        {(selectedLead || inspectLead) && (
          <button
            onClick={() => {
              if (inspectLead) setInspectLead(null);
              else if (selectedLead) setInspectLead(selectedLead);
            }}
            className={`px-3 py-1 text-xs rounded transition-colors shrink-0 ${
              inspectLead
                ? 'bg-cardiac-red/20 text-cardiac-red border border-cardiac-red/40'
                : 'bg-cardiac-accent/20 text-cardiac-accent border border-cardiac-accent/40'
            }`}
          >
            {inspectLead ? `Close (${inspectLead})` : `Inspect ${selectedLead}`}
          </button>
        )}

        <div className="text-[10px] text-slate-600 ml-auto shrink-0 hidden lg:block">
          drag to scrub · click a lead to select · dbl-click to resync
        </div>
      </div>

      {/* Full-width 12-lead ECG display — standard 4x3 bisect layout */}
      <div className="flex-1 min-h-0 relative">
        <ECGRenderer compact={false} verticalStack={false} inspectLead={inspectLead} />
      </div>
    </div>
  );
}
