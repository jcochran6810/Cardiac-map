'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useAppStore, LEVEL_LABELS, type LearningLevel } from '@/store/useAppStore';
import { useTutorStore } from '@/store/useTutorStore';
import { useContent, searchLibrary, type SearchHit } from '@/lib/content';
import { openById } from '@/lib/actions';
import { CASE_DATA } from '@/data/caseData';
import { IconChevron, IconClose, IconHeart, IconHelp, IconPanelLeft, IconQuiz, IconSearch, IconTutor } from '@/components/ui/icons';
import ScopeCard from '@/components/ui/ScopeCard';

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
  const [scopeOpen, setScopeOpen] = useState(false);
  // Phones: the search field is hidden behind an icon and opens over the whole bar
  const [searchOpen, setSearchOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const openSearch = () => {
    flushSync(() => setSearchOpen(true));
    inputRef.current?.focus(); // inside the tap so phones raise the keyboard
  };
  const closeSearch = () => {
    setQ('');
    setOpen(false);
    setSearchOpen(false);
    inputRef.current?.blur();
  };

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
    closeSearch();
  };

  return (
    <header className="relative h-12 short:h-11 bg-cardiac-panel/95 border-b border-slate-700/80 flex items-center px-1.5 sm:px-3 gap-1 sm:gap-3 shrink-0 z-50">
      <button
        onClick={toggleLeftPanel}
        className={`p-1.5 max-sm:p-2 touch:p-2 rounded hover:bg-cardiac-surface ${leftPanelOpen ? 'text-slate-200' : 'text-slate-500'}`}
        title="Toggle navigator panel"
        aria-label="Toggle navigator panel"
      >
        <IconPanelLeft />
      </button>

      <div className="hidden sm:flex items-center gap-2 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-rose-500 to-red-700 flex items-center justify-center text-white shadow-lg shadow-red-900/40">
          <IconHeart size={15} />
        </div>
        <div className="hidden md:block leading-tight">
          <div className="text-sm font-semibold text-white">CardioSim</div>
          <div className="text-[9px] text-slate-400 -mt-0.5">Cardiac anatomy · ECG · physiology</div>
        </div>
      </div>

      <RoleMenu level={learningLevel} onChange={setLearningLevel} />

      <div className="relative hidden sm:flex items-center gap-1 shrink-0">
      <label className="flex items-center gap-1.5 shrink-0" title="Choose your role — guidance stays within that role's scope of practice">
        <span className="text-[10px] text-slate-400 hidden lg:inline">Role</span>
        <select
          value={learningLevel}
          onChange={(e) => setLearningLevel(Number(e.target.value) as LearningLevel)}
          className="bg-cardiac-surface text-xs text-slate-100 rounded-md px-2 py-1 border border-slate-600 focus:outline-none focus:ring-1 focus:ring-cardiac-accent"
          aria-label="Learner role"
        >
          {([1, 2, 3, 4, 5] as LearningLevel[]).map((l) => (
            <option key={l} value={l}>{compact ? LEVEL_LABELS[l].short : LEVEL_LABELS[l].long}</option>
          ))}
        </select>
      </label>
      <button
        onClick={() => setScopeOpen((v) => !v)}
        className={`px-1.5 py-1 touch:py-1.5 rounded text-[10px] border ${scopeOpen ? 'border-cardiac-accent text-cardiac-accent' : 'border-slate-600 text-slate-300 hover:text-white'}`}
        title="What this role may and may not do"
        aria-expanded={scopeOpen}
      >
        Scope
      </button>
      {scopeOpen && (
        <div className="fixed left-1/2 -translate-x-1/2 top-[3.25rem] lg:absolute lg:left-0 lg:top-full lg:translate-x-0 lg:mt-1 w-[min(calc(100vw-1rem),560px)] max-h-[calc(100dvh-4rem)] overflow-y-auto z-[70] rounded-lg border border-slate-600 bg-cardiac-panel shadow-2xl p-3">
          <ScopeCard level={learningLevel} />
          <button onClick={() => setScopeOpen(false)} className="absolute top-2 right-2 text-slate-500 hover:text-white text-xs" aria-label="Close scope">✕</button>
        </div>
      )}
      </div>

      {/* Global search — inline on tablets and up; on phones it opens over the whole bar */}
      <div
        className={`relative flex-1 max-w-xl min-w-0 ${
          searchOpen ? 'max-sm:absolute max-sm:inset-0 max-sm:z-[60] max-sm:max-w-none max-sm:flex max-sm:items-center max-sm:gap-2 max-sm:px-2 max-sm:bg-cardiac-panel' : 'max-sm:hidden'
        }`}
      >
        <div className="relative flex-1 min-w-0">
        <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          ref={inputRef}
          type="search"
          placeholder="Search anatomy, conditions, procedures, drugs, cases…  ( / )"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => { setOpen(false); setSearchOpen(false); }, 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(hits.length - 1, a + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            if (e.key === 'Enter' && hits[active]) choose(hits[active]);
            if (e.key === 'Escape') closeSearch();
          }}
          className="w-full bg-cardiac-dark text-xs text-slate-100 rounded-md pl-8 pr-3 py-1.5 touch:py-2 border border-slate-600 focus:outline-none focus:ring-1 focus:ring-cardiac-accent placeholder-slate-500"
          aria-label="Search"
          aria-autocomplete="list"
        />
        </div>
        {searchOpen && (
          <button onClick={closeSearch} className="sm:hidden p-2 text-slate-300 hover:text-white shrink-0" aria-label="Close search">
            <IconClose size={18} />
          </button>
        )}
        {open && q.trim().length >= 2 && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-cardiac-panel border border-slate-600 rounded-lg shadow-2xl overflow-hidden max-h-[60vh] overflow-y-auto z-50" role="listbox">
            {!lib && <div className="px-3 py-2 text-xs text-slate-400">Loading library…</div>}
            {lib && hits.length === 0 && <div className="px-3 py-2 text-xs text-slate-400">No matches for “{q}”.</div>}
            {hits.map((h, i) => (
              <button
                key={`${h.kind}-${h.id}`}
                onMouseDown={(e) => { e.preventDefault(); choose(h); }}
                onMouseEnter={() => setActive(i)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 touch:py-3 text-left text-xs ${i === active ? 'bg-cardiac-surface' : ''}`}
                role="option"
                aria-selected={i === active}
              >
                <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide shrink-0 ${KIND_STYLE[h.kind]}`}>{h.kind}</span>
                <span className="text-slate-100 truncate min-w-0">{h.name}</span>
                <span className="hidden sm:block ml-auto text-[10px] text-slate-500 truncate capitalize max-w-[45%]">{h.sub}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-0.5 sm:gap-1 ml-auto shrink-0">
        <TopButton onClick={openSearch} title="Search" className="sm:hidden"><IconSearch size={17} /></TopButton>
        <TopButton onClick={() => setQuizOpen(true)} title="Quiz yourself (Q)"><IconQuiz size={15} /><span className="hidden sm:inline">Quiz</span></TopButton>
        <TopButton onClick={toggleTutor} active={tutorOpen} title="Ask the tutor (T)"><IconTutor size={15} /><span className="hidden sm:inline">Tutor</span></TopButton>
        <TopButton onClick={() => setHelpOpen(true)} title="Help & keyboard shortcuts (?)" className="hidden xs:flex"><IconHelp size={15} /></TopButton>
        <button
          onClick={toggleRightPanel}
          className={`p-1.5 max-sm:p-2 touch:p-2 rounded hover:bg-cardiac-surface ${rightPanelOpen ? 'text-slate-200' : 'text-slate-500'}`}
          title="Toggle info panel"
          aria-label="Toggle info panel"
        >
          <IconPanelLeft className="scale-x-[-1]" />
        </button>
      </div>
    </header>
  );
}

function TopButton({ children, onClick, title, active, className = '' }: { children: React.ReactNode; onClick: () => void; title: string; active?: boolean; className?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`flex items-center justify-center gap-1.5 px-2 py-1.5 max-sm:w-9 max-sm:h-9 max-sm:px-0 touch:py-2 rounded-md text-xs transition-colors ${
        active ? 'bg-cardiac-accent/20 text-cardiac-accent' : 'text-slate-300 hover:text-white hover:bg-cardiac-surface'
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** Phones: the role picker and its scope of practice share one menu (no room for both in the bar). */
function RoleMenu({ level, onChange }: { level: LearningLevel; onChange: (l: LearningLevel) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sm:hidden shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 h-9 pl-2.5 pr-1.5 rounded-md text-xs border ${open ? 'border-cardiac-accent text-cardiac-accent' : 'border-slate-600 text-slate-100 bg-cardiac-surface'}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Choose your role — guidance stays within that role's scope of practice"
      >
        {LEVEL_LABELS[level].short}
        <IconChevron size={13} className={`transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[65] bg-black/40 animate-fade-in" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="fixed left-2 right-2 top-[3.25rem] z-[70] max-h-[calc(100dvh-4rem)] overflow-y-auto rounded-xl border border-slate-600 bg-cardiac-panel shadow-2xl" role="dialog" aria-label="Choose your role">
            <div className="flex items-center justify-between px-3 pt-2.5">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Your role</div>
              <button onClick={() => setOpen(false)} className="p-1.5 -mr-1.5 text-slate-400 hover:text-white" aria-label="Close"><IconClose size={16} /></button>
            </div>
            <div className="px-2 pb-2 grid gap-1" role="radiogroup">
              {([1, 2, 3, 4, 5] as LearningLevel[]).map((l) => (
                <button
                  key={l}
                  onClick={() => onChange(l)}
                  role="radio"
                  aria-checked={l === level}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-left text-sm ${l === level ? 'bg-cardiac-accent/20 text-cardiac-accent font-semibold' : 'text-slate-200 hover:bg-cardiac-surface'}`}
                >
                  <span className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ${l === level ? 'border-cardiac-accent bg-cardiac-accent' : 'border-slate-500'}`} />
                  {LEVEL_LABELS[l].long}
                </button>
              ))}
            </div>
            <div className="border-t border-slate-700 p-3">
              <ScopeCard level={level} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
