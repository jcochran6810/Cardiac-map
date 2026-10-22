'use client';

import React, { forwardRef, useEffect, useMemo, useState } from 'react';
import { useContent, searchLibrary, type SearchHit } from '@/lib/content';
import { openById } from '@/lib/actions';
import { CASE_DATA } from '@/data/caseData';
import { IconSearch } from '@/components/ui/icons';

const KIND_STYLE: Record<SearchHit['kind'], string> = {
  structure: 'bg-sky-500/15 text-sky-300',
  condition: 'bg-rose-500/15 text-rose-300',
  procedure: 'bg-violet-500/15 text-violet-300',
  medication: 'bg-emerald-500/15 text-emerald-300',
  cathlab: 'bg-cyan-500/15 text-cyan-300',
  case: 'bg-amber-500/15 text-amber-300',
};

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

/** Search the whole library (anatomy, conditions, drugs, procedures, cath lab, cases) and open a result */
const SearchBox = forwardRef<HTMLInputElement, Props>(function SearchBox(
  { id, className = '', inputClassName = '', placeholder = 'Search anatomy, conditions, drugs…', onDone }, ref,
) {
  const lib = useContent();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const resultsOpen = open && q.trim().length >= 2;
  const hits = useMemo(() => (lib ? searchLibrary(lib, CASES, q) : []), [lib, q]);

  useEffect(() => {
    if (resultsOpen) document.getElementById(`${id}-result-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, resultsOpen, id]);

  const close = () => {
    setQ('');
    setOpen(false);
    onDone?.();
  };
  const choose = (h: SearchHit) => {
    openById(h.id);
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
              <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide shrink-0 ${KIND_STYLE[h.kind]}`}>{h.kind}</span>
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
