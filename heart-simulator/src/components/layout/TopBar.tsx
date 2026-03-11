'use client';

import React from 'react';
import { useAppStore, LearningLevel } from '@/store/useAppStore';

const LEVELS: { value: LearningLevel; label: string }[] = [
  { value: 1, label: 'EMT' },
  { value: 2, label: 'Paramedic' },
  { value: 3, label: 'ED/ICU' },
  { value: 4, label: 'Cardiology' },
  { value: 5, label: 'Interventional' },
];

export default function TopBar() {
  const {
    learningLevel, setLearningLevel,
    labelsVisible, toggleLabels, dissectionEnabled, toggleDissection,
    compareMode, toggleCompare, searchQuery, setSearchQuery, resetView,
  } = useAppStore();

  return (
    <header className="h-10 bg-cardiac-panel border-b border-slate-700 flex items-center px-3 gap-3 shrink-0 z-50">
      {/* Logo */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-6 h-6 rounded-full bg-cardiac-red flex items-center justify-center text-white text-[10px] font-bold">
          ♥
        </div>
        <span className="text-xs font-semibold text-white hidden lg:block">CardioSim</span>
      </div>

      {/* Learning Level */}
      <select
        value={learningLevel}
        onChange={(e) => setLearningLevel(Number(e.target.value) as LearningLevel)}
        className="bg-cardiac-surface text-xs text-slate-200 rounded px-2 py-1 border border-slate-600 focus:outline-none focus:border-cardiac-accent shrink-0"
      >
        {LEVELS.map((l) => (
          <option key={l.value} value={l.value}>{l.label}</option>
        ))}
      </select>

      {/* Search — full-width */}
      <div className="flex-1 max-w-2xl">
        <input
          type="text"
          placeholder="Search anatomy, conditions, procedures, medications..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-cardiac-dark text-xs text-slate-200 rounded px-3 py-1.5 border border-slate-600 focus:outline-none focus:border-cardiac-accent placeholder-slate-500"
        />
      </div>

      {/* Quick toggles */}
      <div className="flex gap-1 ml-auto shrink-0">
        <ToggleBtn active={labelsVisible} onClick={toggleLabels} label="Labels" />
        <ToggleBtn active={dissectionEnabled} onClick={toggleDissection} label="Dissect" />
        <ToggleBtn active={compareMode} onClick={toggleCompare} label="Compare" />
        <button
          onClick={resetView}
          className="px-2 py-1 text-xs text-slate-400 hover:text-white bg-cardiac-surface rounded transition-colors"
        >
          Reset
        </button>
      </div>
    </header>
  );
}

function ToggleBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 text-xs rounded transition-colors ${
        active
          ? 'bg-cardiac-accent/20 text-cardiac-accent border border-cardiac-accent/40'
          : 'text-slate-400 hover:text-white bg-cardiac-surface'
      }`}
    >
      {label}
    </button>
  );
}
