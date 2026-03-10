'use client';

import React from 'react';
import { useAppStore, AppMode, LearningLevel } from '@/store/useAppStore';
import { useTutorStore } from '@/store/useTutorStore';

const MODES: { value: AppMode; label: string; icon: string }[] = [
  { value: 'explore', label: 'Explore', icon: '🔍' },
  { value: 'physiology', label: 'Physiology', icon: '💓' },
  { value: 'pathology', label: 'Pathology', icon: '⚕️' },
  { value: 'imaging', label: 'Imaging', icon: '📷' },
  { value: 'procedure', label: 'Procedures', icon: '🔧' },
  { value: 'case', label: 'Cases', icon: '📋' },
  { value: 'tutor', label: 'Tutor', icon: '🎓' },
];

const LEVELS: { value: LearningLevel; label: string }[] = [
  { value: 1, label: 'EMT' },
  { value: 2, label: 'Paramedic' },
  { value: 3, label: 'ED/ICU' },
  { value: 4, label: 'Cardiology' },
  { value: 5, label: 'Interventional' },
];

export default function TopBar() {
  const {
    mode, setMode, learningLevel, setLearningLevel,
    labelsVisible, toggleLabels, dissectionEnabled, toggleDissection,
    compareMode, toggleCompare, searchQuery, setSearchQuery, resetView,
  } = useAppStore();
  const { toggleTutor } = useTutorStore();

  return (
    <header className="h-12 bg-cardiac-panel border-b border-slate-700 flex items-center px-3 gap-2 shrink-0 z-50">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-3">
        <div className="w-7 h-7 rounded-full bg-cardiac-red flex items-center justify-center text-white text-xs font-bold">
          ♥
        </div>
        <span className="text-sm font-semibold text-white hidden lg:block">CardioSim</span>
      </div>

      {/* Learning Level */}
      <select
        value={learningLevel}
        onChange={(e) => setLearningLevel(Number(e.target.value) as LearningLevel)}
        className="bg-cardiac-surface text-xs text-slate-200 rounded px-2 py-1.5 border border-slate-600 focus:outline-none focus:border-cardiac-accent"
      >
        {LEVELS.map((l) => (
          <option key={l.value} value={l.value}>{l.label}</option>
        ))}
      </select>

      {/* Mode Tabs */}
      <div className="flex gap-0.5 bg-cardiac-dark rounded-md p-0.5 ml-2">
        {MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => {
              setMode(m.value);
              if (m.value === 'tutor') toggleTutor();
            }}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              mode === m.value
                ? 'bg-cardiac-accent text-cardiac-dark font-semibold'
                : 'text-slate-400 hover:text-white hover:bg-cardiac-surface'
            }`}
          >
            <span className="hidden xl:inline mr-1">{m.icon}</span>
            {m.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex-1 max-w-xs ml-3">
        <input
          type="text"
          placeholder="Search anatomy, conditions, meds..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-cardiac-dark text-xs text-slate-200 rounded px-3 py-1.5 border border-slate-600 focus:outline-none focus:border-cardiac-accent placeholder-slate-500"
        />
      </div>

      {/* Quick toggles */}
      <div className="flex gap-1 ml-auto">
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
