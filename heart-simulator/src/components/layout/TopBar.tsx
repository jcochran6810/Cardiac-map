'use client';

import React from 'react';
import { useAppStore, LearningLevel } from '@/store/useAppStore';
import { useTutorStore } from '@/store/useTutorStore';
import { useLearningStore } from '@/store/useLearningStore';
import { useECGStore } from '@/store/useECGStore';
import { useConditionStore } from '@/store/useConditionStore';
import { CONDITION_IDS } from '@/data/conditionData';
import { PROCEDURE_IDS } from '@/data/procedureData';
import { MEDICATION_IDS } from '@/data/medicationData';
import { CASE_LIST, STRUCTURE_NAV_COUNT } from '@/data/navigation';

const LEVELS: { value: LearningLevel; label: string }[] = [
  { value: 1, label: 'EMT' },
  { value: 2, label: 'Paramedic' },
  { value: 3, label: 'ED/ICU' },
  { value: 4, label: 'Cardiology' },
  { value: 5, label: 'Interventional' },
];

const CATALOGUE_SIZE = STRUCTURE_NAV_COUNT + CONDITION_IDS.length + PROCEDURE_IDS.length + MEDICATION_IDS.length + CASE_LIST.length;

export default function TopBar() {
  const {
    learningLevel, setLearningLevel,
    labelsVisible, toggleLabels, dissectionEnabled, toggleDissection,
    compareMode, toggleCompare, hemodynamicsOpen, toggleHemodynamics,
    searchQuery, setSearchQuery, resetView,
  } = useAppStore();
  const { tutorOpen, toggleTutor } = useTutorStore();
  const { setCompareProfile } = useECGStore();
  const { setCompareCondition } = useConditionStore();
  const progress = useLearningStore((s) => s.getCompletionPercentage(CATALOGUE_SIZE));
  const seenCount = useLearningStore((s) => s.structuresViewed.length + s.conditionsStudied.length + s.proceduresReviewed.length + s.medicationsViewed.length + s.casesCompleted.length);

  const handleCompare = () => {
    if (compareMode) {
      // Leaving compare mode clears the overlay
      setCompareProfile(null);
      setCompareCondition(null);
    }
    toggleCompare();
  };

  const handleReset = () => {
    resetView();
    setCompareProfile(null);
    setCompareCondition(null);
  };

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
        title="Learning level — content depth and tab order adapt to it"
        className="bg-cardiac-surface text-xs text-slate-200 rounded px-2 py-1 border border-slate-600 focus:outline-none focus:border-cardiac-accent shrink-0"
      >
        {LEVELS.map((l) => (
          <option key={l.value} value={l.value}>{l.label}</option>
        ))}
      </select>

      {/* Search — full-width */}
      <div className="flex-1 max-w-2xl relative">
        <input
          type="text"
          placeholder="Search anatomy, conditions, procedures, medications, cases..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-cardiac-dark text-xs text-slate-200 rounded px-3 py-1.5 border border-slate-600 focus:outline-none focus:border-cardiac-accent placeholder-slate-500"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs" title="Clear search">×</button>
        )}
      </div>

      {/* Progress */}
      <div className="hidden md:flex items-center gap-1.5 shrink-0" title={`${seenCount} of ${CATALOGUE_SIZE} topics opened — progress is saved in this browser`}>
        <div className="w-16 h-1.5 bg-cardiac-dark rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-[10px] text-slate-400">{progress}%</span>
      </div>

      {/* Quick toggles */}
      <div className="flex gap-1 ml-auto shrink-0">
        <ToggleBtn active={labelsVisible} onClick={toggleLabels} label="Labels" title="Show/hide labels on the 3D heart" />
        <ToggleBtn active={dissectionEnabled} onClick={toggleDissection} label="Dissect" title="View modes, layers and clip planes" />
        <ToggleBtn active={compareMode} onClick={handleCompare} label="Compare" title="Overlay a second condition's ECG (select two conditions)" />
        <ToggleBtn active={hemodynamicsOpen} onClick={toggleHemodynamics} label="Hemo" title="Live pressure/volume hemodynamics panel" />
        <ToggleBtn active={tutorOpen} onClick={toggleTutor} label="🎓 Tutor" title="Open the AI tutor" />
        <button
          onClick={handleReset}
          className="px-2 py-1 text-xs text-slate-400 hover:text-white bg-cardiac-surface rounded transition-colors"
        >
          Reset
        </button>
      </div>
    </header>
  );
}

function ToggleBtn({ active, onClick, label, title }: { active: boolean; onClick: () => void; label: string; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`px-2 py-1 text-xs rounded transition-colors whitespace-nowrap ${
        active
          ? 'bg-cardiac-accent/20 text-cardiac-accent border border-cardiac-accent/40'
          : 'text-slate-400 hover:text-white bg-cardiac-surface'
      }`}
    >
      {label}
    </button>
  );
}
