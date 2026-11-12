'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { GLOSSARY, GLOSSARY_GROUPS, type GlossaryGroup, type GlossaryTerm } from '@/data/glossary';
import { kindOf, nameOf, openById } from '@/lib/actions';
import { IconClose, IconSearch } from '@/components/ui/icons';

const SORTED = [...GLOSSARY].sort((a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }));

/** Does the term (its name, other names or definition) contain every word typed? */
export function matchesTerm(term: GlossaryTerm, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${term.term} ${(term.aka ?? []).join(' ')} ${term.def}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

/**
 * Glossary: the words of cardiology in one or two plain sentences each, with a way on to the page that
 * teaches the term properly. Opens over whatever screen the learner is on, so a word can be looked up mid-lesson.
 */
export default function Glossary() {
  const open = useAppStore((s) => s.glossaryOpen);
  const termId = useAppStore((s) => s.glossaryTerm);
  const close = () => useAppStore.getState().setGlossaryOpen(false);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<GlossaryGroup | 'all'>('all');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // opened at a term (from search): start with everything listed and that term in view
  useEffect(() => {
    if (!open) return;
    setQ('');
    setGroup('all');
    const id = window.setTimeout(() => {
      if (termId) document.getElementById(`term-${termId}`)?.scrollIntoView({ block: 'start' });
      else listRef.current?.scrollTo({ top: 0 });
    }, 0);
    return () => window.clearTimeout(id);
  }, [open, termId]);

  // Escape closes it (the field keeps the keyboard, so the app-wide shortcut handler does not see the key)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); useAppStore.getState().setGlossaryOpen(false); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  const shown = useMemo(() => SORTED.filter((t) => (group === 'all' || t.group === group) && matchesTerm(t, q)), [q, group]);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 phone:p-0" onClick={close} role="dialog" aria-modal="true" aria-label="Glossary">
      <div
        className="w-full max-w-2xl h-[85dvh] flex flex-col bg-cardiac-panel border border-slate-600 rounded-xl shadow-2xl phone:max-w-none phone:h-full phone:rounded-none phone:border-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between pl-4 pr-2 py-2 border-b border-slate-700">
          <div>
            <h2 className="text-sm font-semibold text-white">Glossary</h2>
            <p className="text-[11px] text-slate-400">{GLOSSARY.length} terms in plain words</p>
          </div>
          <button onClick={close} className="w-9 h-9 touch:w-11 touch:h-11 flex items-center justify-center rounded-md text-slate-400 hover:text-white hover:bg-cardiac-surface" aria-label="Close the glossary"><IconClose size={18} /></button>
        </div>

        <div className="shrink-0 px-3 sm:px-4 pt-3 pb-2 border-b border-slate-700/70 space-y-2">
          <label className="flex items-center gap-2 h-10 px-3 rounded-lg bg-cardiac-dark border border-slate-600 focus-within:border-cardiac-accent/70">
            <IconSearch size={16} className="shrink-0 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              inputMode="search"
              enterKeyHint="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Find a term…"
              // the box around it shows the focus (its border turns amber)
              className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder:text-slate-500 outline-none focus-visible:outline-none"
              aria-label="Find a term"
            />
            {q && (
              <button type="button" onClick={() => { setQ(''); inputRef.current?.focus(); }} className="shrink-0 -mr-1.5 w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white" aria-label="Clear">
                <IconClose size={14} />
              </button>
            )}
          </label>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar scroll-fade-r -mx-1 px-1" role="group" aria-label="Show one topic">
            {[{ id: 'all' as const, label: 'All' }, ...GLOSSARY_GROUPS].map((g) => (
              <button
                key={g.id}
                onClick={() => setGroup(g.id)}
                aria-pressed={group === g.id}
                className={`shrink-0 px-2.5 py-1 touch:min-h-[36px] rounded-full border text-[12px] whitespace-nowrap transition-colors ${
                  group === g.id ? 'bg-cardiac-accent/20 border-cardiac-accent/50 text-cardiac-accent' : 'border-slate-600 text-slate-300 hover:text-white hover:border-slate-400'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-2">
          {shown.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">
              No term matches “{q}”. Try the search on the main menu: it covers the whole library.
            </p>
          )}
          <dl>
            {shown.map((t) => (
              <div key={t.id} id={`term-${t.id}`} className={`py-2.5 border-b border-slate-700/60 scroll-mt-2 ${t.id === termId && !q ? 'rounded-lg bg-cardiac-accent/10 -mx-2 px-2' : ''}`}>
                <dt className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[15px] font-semibold text-white">{t.term}</span>
                  {t.aka && t.aka.length > 0 && <span className="text-[12px] text-slate-400">also: {t.aka.join(', ')}</span>}
                </dt>
                <dd className="mt-0.5 text-[14px] leading-snug text-slate-200">
                  {t.def}
                  {t.see && kindOf(t.see) && (
                    <button
                      onClick={() => { close(); openById(t.see!); }}
                      className="ml-1.5 text-[13px] text-sky-300 hover:text-sky-200 hover:underline whitespace-nowrap"
                    >
                      {nameOf(t.see)} →
                    </button>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <p className="py-3 text-[11px] text-slate-500 leading-snug">
            Short definitions for learning. For patient care follow your protocols and current guidelines.
          </p>
        </div>
      </div>
    </div>
  );
}
