'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore, LEVEL_LABELS, type LearningLevel } from '@/store/useAppStore';
import { useTutorStore } from '@/store/useTutorStore';
import { useContent, searchLibrary, type SearchHit } from '@/lib/content';
import { openById } from '@/lib/actions';
import { CASE_DATA } from '@/data/caseData';
import { IconHeart, IconHelp, IconPanelLeft, IconQuiz, IconSearch, IconTutor } from '@/components/ui/icons';

const KIND_STYLE: Record<SearchHit['kind'], string> = {
  structure: 'bg-sky-500/15 text-sky-300',
  condition: 'bg-rose-500/15 text-rose-300',
  procedure: 'bg-violet-500/15 text-violet-300',
  medication: 'bg-emerald-500/15 text-emerald-300',
  case: 'bg-amber-500/15 text-amber-300',
};

const CASES = Object.values(CASE_DATA).map((c) => ({ id: c.id, title: c.title }));

export default function TopBar() {
  const learningLevel = useAppStore((s) => s.learningLevel);
  const setLearningLevel = useAppStore((s) => s.setLearningLevel);
  const toggleLeftPanel = useAppStore((s) => s.toggleLeftPanel);
  const toggleRightPanel = useAppStore((s) => s.toggleRightPanel);
  const leftPanelOpen = useAppStore((s) => s.leftPanelOpen);
  const compact = useAppStore((s) => s.compact);
  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen);
  const setQuizOpen = useAppStore((s) => s.setQuizOpen);
  const setHelpOpen = useAppStore((s) => s.setHelpOpen);
  const tutorOpen = useTutorStore((s) => s.tutorOpen);
  const toggleTutor = useTutorStore((s) => s.toggleTutor);

  const lib = useContent();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const hits = useMemo(() => (lib ? searchLibrary(lib, CASES, q) : []), [lib, q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const choose = (h: SearchHit) => {
    openById(h.id);
    setQ('');
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <header className="h-12 bg-cardiac-panel/95 border-b border-slate-700/80 flex items-center px-2 sm:px-3 gap-2 sm:gap-3 shrink-0 z-50">
      <button
        onClick={toggleLeftPanel}
        className={`p-1.5 rounded hover:bg-cardiac-surface ${leftPanelOpen ? 'text-slate-200' : 'text-slate-500'}`}
        title="Toggle navigator panel"
        aria-label="Toggle navigator panel"
      >
        <IconPanelLeft />
      </button>

      <div className="flex items-center gap-2 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-rose-500 to-red-700 flex items-center justify-center text-white shadow-lg shadow-red-900/40">
          <IconHeart size={15} />
        </div>
        <div className="hidden md:block leading-tight">
          <div className="text-sm font-semibold text-white">CardioSim</div>
          <div className="text-[9px] text-slate-400 -mt-0.5">Cardiac anatomy · ECG · physiology</div>
        </div>
      </div>

      <label className="flex items-center gap-1.5 shrink-0" title="Choose your training level — content emphasis changes to match">
        <span className="text-[10px] text-slate-400 hidden lg:inline">Level</span>
        <select
          value={learningLevel}
          onChange={(e) => setLearningLevel(Number(e.target.value) as LearningLevel)}
          className="bg-cardiac-surface text-xs text-slate-100 rounded-md px-2 py-1 border border-slate-600 focus:outline-none focus:ring-1 focus:ring-cardiac-accent"
          aria-label="Learner level"
        >
          {([1, 2, 3, 4, 5] as LearningLevel[]).map((l) => (
            <option key={l} value={l}>{compact ? LEVEL_LABELS[l].short : LEVEL_LABELS[l].long}</option>
          ))}
        </select>
      </label>

      {/* Global search */}
      <div className="relative flex-1 max-w-xl min-w-0">
        <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          ref={inputRef}
          type="search"
          placeholder="Search anatomy, conditions, procedures, drugs, cases…  ( / )"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(hits.length - 1, a + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            if (e.key === 'Enter' && hits[active]) choose(hits[active]);
            if (e.key === 'Escape') { setQ(''); inputRef.current?.blur(); }
          }}
          className="w-full bg-cardiac-dark text-xs text-slate-100 rounded-md pl-8 pr-3 py-1.5 border border-slate-600 focus:outline-none focus:ring-1 focus:ring-cardiac-accent placeholder-slate-500"
          aria-label="Search"
          aria-autocomplete="list"
        />
        {open && q.trim().length >= 2 && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-cardiac-panel border border-slate-600 rounded-lg shadow-2xl overflow-hidden max-h-[60vh] overflow-y-auto z-50" role="listbox">
            {!lib && <div className="px-3 py-2 text-xs text-slate-400">Loading library…</div>}
            {lib && hits.length === 0 && <div className="px-3 py-2 text-xs text-slate-400">No matches for “{q}”.</div>}
            {hits.map((h, i) => (
              <button
                key={`${h.kind}-${h.id}`}
                onMouseDown={(e) => { e.preventDefault(); choose(h); }}
                onMouseEnter={() => setActive(i)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs ${i === active ? 'bg-cardiac-surface' : ''}`}
                role="option"
                aria-selected={i === active}
              >
                <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide shrink-0 ${KIND_STYLE[h.kind]}`}>{h.kind}</span>
                <span className="text-slate-100 truncate">{h.name}</span>
                <span className="ml-auto text-[10px] text-slate-500 truncate capitalize">{h.sub}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 ml-auto shrink-0">
        <TopButton onClick={() => setQuizOpen(true)} title="Quiz yourself (Q)"><IconQuiz size={15} /><span className="hidden sm:inline">Quiz</span></TopButton>
        <TopButton onClick={toggleTutor} active={tutorOpen} title="Ask the tutor (T)"><IconTutor size={15} /><span className="hidden sm:inline">Tutor</span></TopButton>
        <TopButton onClick={() => setHelpOpen(true)} title="Help & keyboard shortcuts (?)"><IconHelp size={15} /></TopButton>
        <button
          onClick={toggleRightPanel}
          className={`p-1.5 rounded hover:bg-cardiac-surface ${rightPanelOpen ? 'text-slate-200' : 'text-slate-500'}`}
          title="Toggle info panel"
          aria-label="Toggle info panel"
        >
          <IconPanelLeft className="scale-x-[-1]" />
        </button>
      </div>
    </header>
  );
}

function TopButton({ children, onClick, title, active }: { children: React.ReactNode; onClick: () => void; title: string; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs transition-colors ${
        active ? 'bg-cardiac-accent/20 text-cardiac-accent' : 'text-slate-300 hover:text-white hover:bg-cardiac-surface'
      }`}
    >
      {children}
    </button>
  );
}
