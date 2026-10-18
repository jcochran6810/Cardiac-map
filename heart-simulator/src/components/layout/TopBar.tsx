'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useAppStore, LEVEL_LABELS, type LearningLevel } from '@/store/useAppStore';
import { useTutorStore } from '@/store/useTutorStore';
import { useContent, searchLibrary, type SearchHit } from '@/lib/content';
import { openById } from '@/lib/actions';
import { CASE_DATA } from '@/data/caseData';
import { IconBook, IconChevron, IconClose, IconDownload, IconHelp, IconPanelLeft, IconQuiz, IconSearch, IconTutor } from '@/components/ui/icons';
import { ModeTabs } from '@/components/layout/ModeNav';
import { InstallButton } from '@/components/ui/InstallApp';
import ScopeCard from '@/components/ui/ScopeCard';
import { Button, IconButton } from '@/components/ui/Button';

const KIND_STYLE: Record<SearchHit['kind'], string> = {
  structure: 'bg-sky-500/15 text-sky-300',
  condition: 'bg-rose-500/15 text-rose-300',
  procedure: 'bg-violet-500/15 text-violet-300',
  medication: 'bg-emerald-500/15 text-emerald-300',
  case: 'bg-amber-500/15 text-amber-300',
};

const CASES = Object.values(CASE_DATA).map((c) => ({ id: c.id, title: c.title }));

export default function TopBar() {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
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
  // Phones and small tablets: the search field is hidden behind an icon and opens over the whole bar
  const [searchOpen, setSearchOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scopeButtonRef = useRef<HTMLButtonElement>(null);
  const resultsOpen = open && q.trim().length >= 2;

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
        // Below 768 px the field is behind the search icon, so open it first
        if (window.matchMedia('(max-width: 767px)').matches) flushSync(() => setSearchOpen(true));
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (resultsOpen) document.getElementById(`library-result-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, resultsOpen]);

  const choose = (h: SearchHit) => {
    openById(h.id);
    closeSearch();
  };

  return (
    <header className="workspace-header" aria-label="Simulator tools">
      <div className="workspace-brand">
        {mode === 'learn' && (
          <Button onClick={toggleLeftPanel} active={leftPanelOpen} aria-pressed={leftPanelOpen} aria-label="Library: conditions, anatomy, drugs, procedures" title="Library: conditions, anatomy, drugs and procedures" className="px-2 gap-1.5">
            <IconBook size={18} /><span className="text-[13px]">Library</span>
          </Button>
        )}
        <button onClick={() => setMode('home')} className={`items-center gap-2 rounded-md ${mode === 'learn' ? 'hidden sm:flex' : 'flex'}`} title="Home" aria-label="CardioSim home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.webp" alt="" width={22} height={32} className="h-8 w-auto drop-shadow-[0_2px_6px_rgba(220,38,38,0.35)]" />
          <span className={`leading-tight text-left ${mode === 'learn' ? 'hidden xl:block' : 'hidden xs:block lg:hidden xl:block'}`}>
            <span className="block text-sm font-semibold tracking-tight text-ui-text">CardioSim</span>
          </span>
        </button>
        <ModeTabs />
      </div>

      <RoleMenu level={learningLevel} onChange={setLearningLevel} />

      <div
        className="workspace-role hidden sm:flex"
        title="Choose your role — guidance stays within that role's scope of practice"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && scopeOpen) { e.stopPropagation(); setScopeOpen(false); scopeButtonRef.current?.focus(); }
        }}
      >
        <label htmlFor="learner-role" className="sr-only">Learner role</label>
        <select id="learner-role" value={learningLevel} onChange={(e) => setLearningLevel(Number(e.target.value) as LearningLevel)}>
          {([1, 2, 3, 4, 5] as LearningLevel[]).map((l) => (
            <option key={l} value={l}>{compact ? LEVEL_LABELS[l].short : LEVEL_LABELS[l].long}</option>
          ))}
        </select>
        <Button ref={scopeButtonRef} variant="outline" active={scopeOpen} onClick={() => setScopeOpen((v) => !v)} aria-expanded={scopeOpen} aria-controls={scopeOpen ? 'role-scope' : undefined} title="What this role may and may not do">Scope</Button>
        {scopeOpen && (
          <section id="role-scope" className="workspace-scope" aria-label="Scope of practice">
            <ScopeCard level={learningLevel} />
            <IconButton onClick={() => { setScopeOpen(false); scopeButtonRef.current?.focus(); }} className="absolute top-2 right-2" aria-label="Close scope">✕</IconButton>
          </section>
        )}
      </div>

      {/* Global search — inline from 768 px; below that it opens over the whole bar */}
      <div
        className={`workspace-search ${
          searchOpen ? 'max-md:absolute max-md:inset-0 max-md:z-[60] max-md:max-w-none max-md:min-w-0 max-md:flex max-md:items-center max-md:gap-2 max-md:px-2 max-md:bg-ui-panel' : 'max-md:hidden'
        }`}
      >
        <div className="relative flex-1 min-w-0">
          <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            ref={inputRef}
            type="search"
            placeholder="Search anatomy, conditions, drugs…  ( / )"
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => { setOpen(false); setSearchOpen(false); }, 150)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.max(0, Math.min(hits.length - 1, a + 1))); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              if (e.key === 'Enter' && hits[active]) choose(hits[active]);
              if (e.key === 'Escape') { e.stopPropagation(); closeSearch(); }
            }}
            role="combobox"
            aria-expanded={resultsOpen}
            aria-controls={resultsOpen ? 'library-results' : undefined}
            aria-activedescendant={resultsOpen && hits[active] ? `library-result-${active}` : undefined}
            aria-label="Search"
            aria-autocomplete="list"
          />
        </div>
        {searchOpen && (
          <IconButton onClick={closeSearch} className="md:hidden" aria-label="Close search"><IconClose size={18} /></IconButton>
        )}
        {resultsOpen && (
          <div id="library-results" className="workspace-results" role="listbox" aria-label="Library results">
            {!lib && <div className="px-3 py-2 text-xs text-slate-400">Loading library…</div>}
            {lib && hits.length === 0 && <div className="px-3 py-2 text-xs text-slate-400">No matches for “{q}”.</div>}
            {hits.map((h, i) => (
              <button
                key={`${h.kind}-${h.id}`}
                id={`library-result-${i}`}
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(h)}
                onMouseEnter={() => setActive(i)}
                className="workspace-result"
                role="option"
                aria-selected={i === active}
              >
                <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide shrink-0 ${KIND_STYLE[h.kind]}`}>{h.kind}</span>
                <span className="text-slate-100 truncate min-w-0">{h.name}</span>
                <span className="ml-auto hidden sm:block text-xs text-ui-muted truncate capitalize max-w-[45%]">{h.sub}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <nav className="workspace-actions" aria-label="Learning tools">
        <IconButton onClick={openSearch} className="md:hidden" aria-label="Search" title="Search ( / )"><IconSearch size={18} /></IconButton>
        <Button onClick={() => setQuizOpen(true)} className="hidden sm:inline-flex short:inline-flex" aria-label="Quiz yourself" title="Quiz yourself (Q)"><IconQuiz size={18} /><span className="hidden xl:inline">Quiz</span></Button>
        <Button onClick={toggleTutor} active={tutorOpen} aria-pressed={tutorOpen} className="hidden sm:inline-flex short:inline-flex" aria-label="Ask the tutor" title="Ask the tutor (T)"><IconTutor size={18} /><span className="hidden xl:inline">Tutor</span></Button>
        <InstallButton className="ui-button ui-button--quiet hidden md:inline-flex text-emerald-300">
          <IconDownload size={18} /><span className="hidden xl:inline">Install</span>
        </InstallButton>
        <IconButton onClick={() => setHelpOpen(true)} className="hidden xs:inline-flex" aria-label="Help and keyboard shortcuts" title="Help & keyboard shortcuts (?)"><IconHelp size={18} /></IconButton>
        {mode === 'learn' && (
          <Button onClick={toggleRightPanel} active={rightPanelOpen} aria-pressed={rightPanelOpen} aria-label="Info panel: details of what you selected" title="Info panel: details of what you selected" className="px-2 gap-1.5">
            <IconPanelLeft size={18} className="scale-x-[-1]" /><span className="text-[13px]">Info</span>
          </Button>
        )}
      </nav>
    </header>
  );
}

/** Phones: the role picker and its scope of practice share one menu (no room for both in the bar). */
function RoleMenu({ level, onChange }: { level: LearningLevel; onChange: (l: LearningLevel) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sm:hidden shrink-0 min-w-0">
      <Button
        variant="outline"
        active={open}
        onClick={() => setOpen((v) => !v)}
        className="px-2.5 gap-1 text-ui-text"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Choose your role — guidance stays within that role's scope of practice"
      >
        {LEVEL_LABELS[level].short}
        <IconChevron size={13} className={`transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-[65] bg-black/40 animate-fade-in" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute left-2 right-2 top-[calc(100%+4px)] z-[70] max-h-[calc(100dvh-4rem)] overflow-y-auto rounded-xl border border-ui-border bg-ui-panel shadow-2xl" role="dialog" aria-label="Choose your role">
            <div className="flex items-center justify-between px-3 pt-2.5">
              <div className="text-[11px] uppercase tracking-wider text-ui-muted">Your role</div>
              <IconButton onClick={() => setOpen(false)} className="-mr-1.5" aria-label="Close"><IconClose size={16} /></IconButton>
            </div>
            <div className="px-2 pb-2 grid gap-1" role="radiogroup">
              {([1, 2, 3, 4, 5] as LearningLevel[]).map((l) => (
                <button
                  key={l}
                  onClick={() => onChange(l)}
                  role="radio"
                  aria-checked={l === level}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-left text-sm ${l === level ? 'bg-cardiac-accent/20 text-cardiac-accent font-semibold' : 'text-slate-200 hover:bg-ui-raised'}`}
                >
                  <span className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ${l === level ? 'border-cardiac-accent bg-cardiac-accent' : 'border-slate-500'}`} />
                  {LEVEL_LABELS[l].long}
                </button>
              ))}
            </div>
            <div className="border-t border-ui-border/60 p-3">
              <ScopeCard level={level} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
