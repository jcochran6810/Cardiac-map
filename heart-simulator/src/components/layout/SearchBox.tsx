'use client';

import React, { forwardRef, useEffect, useMemo, useState } from 'react';
import { useContent, searchLibrary, type SearchExtra, type SearchHit } from '@/lib/content';
import { openById, openTool, openTreatment } from '@/lib/actions';
import { openTrainer } from '@/lib/drillRun';
import { useAppStore } from '@/store/useAppStore';
import { useTutorStore } from '@/store/useTutorStore';
import { SCENARIOS } from '@/lib/sim/scenario/scenarios';
import { startLesson } from '@/lib/courses';
import { CASE_DATA } from '@/data/caseData';
import { GLOSSARY } from '@/data/glossary';
import { IconSearch } from '@/components/ui/icons';

const KIND_STYLE: Record<SearchHit['kind'], string> = {
  structure: 'bg-sky-500/15 text-sky-300',
  condition: 'bg-rose-500/15 text-rose-300',
  procedure: 'bg-violet-500/15 text-violet-300',
  medication: 'bg-emerald-500/15 text-emerald-300',
  cathlab: 'bg-cyan-500/15 text-cyan-300',
  case: 'bg-amber-500/15 text-amber-300',
  lesson: 'bg-orange-500/15 text-orange-300',
  tool: 'bg-teal-500/15 text-teal-300',
  simcase: 'bg-amber-500/15 text-amber-300',
  term: 'bg-slate-500/25 text-slate-200',
};

/** What each kind of result is called (the same words the main menu uses) */
const KIND_LABEL: Record<SearchHit['kind'], string> = {
  structure: 'Anatomy', condition: 'Condition', procedure: 'Procedure', medication: 'Drug', cathlab: 'Cath lab',
  case: 'Case study', lesson: 'Lesson', tool: 'Tool', simcase: 'Simulator', term: 'Glossary',
};

/** The tools and screens, with the words people use for them */
const TOOLS: (SearchExtra & { open: () => void })[] = [
  { kind: 'tool', id: 'tool:heart', name: '3D heart', sub: 'Tool', keys: ['3d', 'model', 'anatomy viewer', 'rotate'], open: () => openTool('heart') },
  { kind: 'tool', id: 'tool:ecg', name: '12-lead ECG', sub: 'Tool', keys: ['12 lead', 'twelve lead', 'ecg', 'ekg', 'tracing', 'strip', 'monitor'], open: () => openTool('ecg') },
  { kind: 'tool', id: 'tool:lab', name: 'Electrode lab', sub: 'Tool', keys: ['electrode', 'lead placement', 'cable', 'reversal', 'v1', 'limb leads'], open: () => openTool('lab') },
  { kind: 'tool', id: 'tool:defib', name: 'Defibrillator', sub: 'Tool', keys: ['defib', 'defibrillation', 'aed', 'cardioversion', 'pacing', 'pacer', 'shock', 'cpr', 'code', 'monitor'], open: () => openTool('defib') },
  { kind: 'tool', id: 'tool:wiggers', name: 'Pressure & volume', sub: 'Tool', keys: ['wiggers', 'pv loop', 'pressure volume', 'hemodynamics', 'heart sounds'], open: () => openTool('wiggers') },
  { kind: 'tool', id: 'tool:meds', name: 'Give a medication', sub: 'Tool', keys: ['give meds', 'medication', 'drug', 'push', 'dose'], open: () => openTreatment('avnrt') },
  { kind: 'tool', id: 'tool:trainer', name: 'Rhythm trainer', sub: 'Practice', keys: ['rhythm', 'practice', 'drill', 'strip', 'recognition'], open: openTrainer },
  { kind: 'tool', id: 'tool:courses', name: 'Courses', sub: 'Guided lessons', keys: ['course', 'lesson', 'learn', 'tutorial', 'guided'], open: () => useAppStore.getState().setMode('courses') },
  { kind: 'tool', id: 'tool:sim', name: 'Case simulator', sub: 'Treat a patient', keys: ['simulator', 'case', 'scenario', 'patient', 'practice'], open: () => useAppStore.getState().setMode('simulator') },
  { kind: 'tool', id: 'tool:quiz', name: 'Quiz', sub: 'Practice', keys: ['quiz', 'questions', 'test'], open: () => useAppStore.getState().setQuizOpen(true) },
  { kind: 'tool', id: 'tool:glossary', name: 'Glossary', sub: 'Terms in plain words', keys: ['glossary', 'dictionary', 'definition', 'terms', 'what does', 'meaning'], open: () => useAppStore.getState().setGlossaryOpen(true) },
  { kind: 'tool', id: 'tool:tutor', name: 'Tutor', sub: 'Ask a question', keys: ['tutor', 'ask', 'question', 'help me'], open: () => useTutorStore.getState().setTutorOpen(true) },
];
const TOOL_BY_ID = Object.fromEntries(TOOLS.map((t) => [t.id, t]));
const SIM_CASES: SearchExtra[] = SCENARIOS.map((sc) => ({ kind: 'simcase', id: `sim:${sc.id}`, name: sc.title, sub: 'Simulator case', keys: [sc.summary] }));
// a term is found by its name and its other names only (its definition would match half the library's words)
const TERMS: SearchExtra[] = GLOSSARY.map((g) => ({ kind: 'term', id: `term:${g.id}`, name: g.term, sub: g.def, keys: g.aka ?? [] }));
const EXTRAS: SearchExtra[] = [...TOOLS, ...SIM_CASES, ...TERMS];

const CASES = Object.values(CASE_DATA).map((c) => ({ id: c.id, title: c.title }));

interface Props {
  /** element id prefix, so the top bar's and the main menu's boxes never share ids */
  id: string;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  /** after a result is opened, or Escape / leaving the field */
  onDone?: () => void;
}

/** Search everything — the library, the guided lessons, the tools and the simulator cases — and open a result */
const SearchBox = forwardRef<HTMLInputElement, Props>(function SearchBox(
  { id, className = '', inputClassName = '', placeholder = 'Search anatomy, conditions, drugs…', onDone }, ref,
) {
  const lib = useContent();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const resultsOpen = open && q.trim().length >= 2;
  const hits = useMemo(() => (lib ? searchLibrary(lib, CASES, q, 24, EXTRAS) : []), [lib, q]);

  useEffect(() => {
    if (resultsOpen) document.getElementById(`${id}-result-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, resultsOpen, id]);

  const close = () => {
    setQ('');
    setOpen(false);
    onDone?.();
  };
  const choose = (h: SearchHit) => {
    if (h.kind === 'lesson') {
      const [course, lesson] = h.id.split('/');
      startLesson(course, lesson);
    } else if (h.kind === 'tool') TOOL_BY_ID[h.id]?.open();
    // a simulator case is started from its own screen, where the role and the briefing are
    else if (h.kind === 'simcase') useAppStore.getState().setMode('simulator');
    else if (h.kind === 'term') useAppStore.getState().setGlossaryOpen(true, h.id.slice(5));
    else openById(h.id);
    close();
    (document.activeElement as HTMLElement | null)?.blur();
  };

  return (
    <div className={`workspace-search ${className}`}>
      <div className="relative flex-1 min-w-0">
        <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          ref={ref}
          type="search"
          placeholder={placeholder}
          value={q}
          className={inputClassName}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => { setOpen(false); onDone?.(); }, 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.max(0, Math.min(hits.length - 1, a + 1))); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            if (e.key === 'Enter' && hits[active]) choose(hits[active]);
            if (e.key === 'Escape') { e.stopPropagation(); close(); e.currentTarget.blur(); }
          }}
          role="combobox"
          aria-expanded={resultsOpen}
          aria-controls={resultsOpen ? `${id}-results` : undefined}
          aria-activedescendant={resultsOpen && hits[active] ? `${id}-result-${active}` : undefined}
          aria-label="Search the library"
          aria-autocomplete="list"
        />
      </div>
      {resultsOpen && (
        <div id={`${id}-results`} className="workspace-results" role="listbox" aria-label="Library results">
          {!lib && <div className="px-3 py-2 text-xs text-slate-400">Loading library…</div>}
          {lib && hits.length === 0 && <div className="px-3 py-2 text-xs text-slate-400">No matches for “{q}”.</div>}
          {hits.map((h, i) => (
            <button
              key={`${h.kind}-${h.id}`}
              id={`${id}-result-${i}`}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(h)}
              onMouseEnter={() => setActive(i)}
              className="workspace-result"
              role="option"
              aria-selected={i === active}
            >
              <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide shrink-0 ${KIND_STYLE[h.kind]}`}>{KIND_LABEL[h.kind]}</span>
              <span className="text-slate-100 truncate min-w-0">{h.name}</span>
              <span className="ml-auto hidden sm:block text-xs text-ui-muted truncate capitalize max-w-[45%]">{h.sub}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

export default SearchBox;
