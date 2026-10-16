'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore, LEVEL_LABELS, type LearningLevel } from '@/store/useAppStore';
import { useTutorStore } from '@/store/useTutorStore';
import { useContent, searchLibrary, type SearchHit } from '@/lib/content';
import { openById } from '@/lib/actions';
import { CASE_DATA } from '@/data/caseData';
import { IconHeart, IconHelp, IconPanelLeft, IconQuiz, IconSearch, IconTutor } from '@/components/ui/icons';
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
  const inputRef = useRef<HTMLInputElement>(null);
  const scopeButtonRef = useRef<HTMLButtonElement>(null);
  const resultsOpen = open && q.trim().length >= 2;

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

  useEffect(() => {
    if (resultsOpen) document.getElementById(`library-result-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, resultsOpen]);

  const choose = (h: SearchHit) => {
    openById(h.id);
    setQ('');
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <header className="workspace-header" aria-label="Simulator tools">
      <div className="workspace-brand">
        <IconButton onClick={toggleLeftPanel} active={leftPanelOpen} aria-pressed={leftPanelOpen} aria-label="Toggle navigator panel" title="Toggle navigator panel"><IconPanelLeft size={18} /></IconButton>
        <div className="workspace-brandmark" aria-hidden="true"><IconHeart size={20} /></div>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight text-ui-text">CardioSim</div>
          <div className="hidden lg:block text-xs text-ui-muted mt-0.5">Anatomy · ECG · physiology</div>
        </div>
      </div>

      <div className="workspace-role" onKeyDown={(e) => {
        if (e.key === 'Escape' && scopeOpen) { e.stopPropagation(); setScopeOpen(false); scopeButtonRef.current?.focus(); }
      }}>
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

      {/* Global search */}
      <div className="workspace-search">
        <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          ref={inputRef}
          type="search"
          placeholder="Search anatomy, conditions, drugs…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.max(0, Math.min(hits.length - 1, a + 1))); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            if (e.key === 'Enter' && hits[active]) choose(hits[active]);
            if (e.key === 'Escape') { e.stopPropagation(); setQ(''); setOpen(false); inputRef.current?.blur(); }
          }}
          role="combobox"
          aria-expanded={resultsOpen}
          aria-controls={resultsOpen ? "library-results" : undefined}
          aria-activedescendant={resultsOpen && hits[active] ? `library-result-${active}` : undefined}
          aria-label="Search"
          aria-autocomplete="list"
        />
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
                <span className="text-slate-100 truncate">{h.name}</span>
                <span className="ml-auto hidden sm:block text-xs text-ui-muted truncate capitalize">{h.sub}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <nav className="workspace-actions" aria-label="Learning tools">
        <Button onClick={() => setQuizOpen(true)} aria-label="Quiz yourself" title="Quiz yourself (Q)"><IconQuiz size={18} /><span className="hidden sm:inline">Quiz</span></Button>
        <Button onClick={toggleTutor} active={tutorOpen} aria-pressed={tutorOpen} aria-label="Ask the tutor" title="Ask the tutor (T)"><IconTutor size={18} /><span className="hidden sm:inline">Tutor</span></Button>
        <IconButton onClick={() => setHelpOpen(true)} aria-label="Help and keyboard shortcuts" title="Help & keyboard shortcuts (?)"><IconHelp size={18} /></IconButton>
        <IconButton onClick={toggleRightPanel} active={rightPanelOpen} aria-pressed={rightPanelOpen} aria-label="Toggle info panel" title="Toggle info panel"><IconPanelLeft size={18} className="scale-x-[-1]" /></IconButton>
      </nav>
    </header>
  );
}
