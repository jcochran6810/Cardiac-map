'use client';

import React, { useMemo, useState } from 'react';
import { useSimStore } from '@/store/useSimStore';
import { READ_GROUPS, READ_OPTIONS } from '@/lib/sim/scenario/reads';
import { IconSearch } from '@/components/ui/icons';

/**
 * "What does this 12-lead show?" — the learner reads the tracing and picks from every interpretation
 * the app knows; the FTO answers at once in the case story and above the 12-lead.
 * `ReadList` fills the action column on large screens; `ReadBar` is the compact phone version.
 */
export function ReadList({ who }: { who: string }) {
  const read = useSimStore((s) => s.read);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const f = q.trim().toLowerCase();
  const groups = useMemo(
    () => READ_GROUPS.map((g) => ({ g, items: READ_OPTIONS.filter((o) => o.group === g && (!f || o.label.toLowerCase().includes(f))) })).filter((x) => x.items.length),
    [f],
  );
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="shrink-0 px-3 pt-3 pb-2 border-b border-slate-700 space-y-2">
        <div className="text-sm font-semibold text-white">What does this 12-lead show?</div>
        <p className="text-[11px] text-slate-400 leading-snug">
          Your {who} wants your read before you go on. Look at it lead by lead — rate, rhythm, axis, intervals, then the ST segments — and choose one.
        </p>
        <div className="relative">
          <IconSearch size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="search"
            placeholder="Find a read (e.g. STEMI, block, flutter)"
            className="w-full h-9 bg-cardiac-dark text-[13px] text-slate-100 rounded-lg pl-8 pr-2 border border-slate-600 focus:outline-none focus:border-cardiac-accent placeholder-slate-500"
            aria-label="Find a read"
          />
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3" role="radiogroup" aria-label="Your 12-lead read">
        {groups.map(({ g, items }) => (
          <section key={g} className="pt-2">
            <h3 className="sticky top-0 z-10 px-1 py-1 text-[10px] uppercase tracking-wider text-slate-400 bg-cardiac-panel">{g}</h3>
            <div className="grid gap-1">
              {items.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setPicked(o.id)}
                  onDoubleClick={() => read(o.id)}
                  role="radio"
                  aria-checked={picked === o.id}
                  className={`w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-lg border text-[13px] leading-snug transition-colors ${
                    picked === o.id ? 'border-cardiac-accent bg-cardiac-accent/15 text-white' : 'border-slate-600/80 bg-cardiac-dark/60 text-slate-100 hover:border-slate-400'
                  }`}
                >
                  <span className={`w-3.5 h-3.5 shrink-0 rounded-full border-2 ${picked === o.id ? 'border-cardiac-accent bg-cardiac-accent' : 'border-slate-500'}`} />
                  {o.label}
                </button>
              ))}
            </div>
          </section>
        ))}
        {groups.length === 0 && <p className="px-2 py-6 text-center text-xs text-slate-500">No read matches “{q}”.</p>}
      </div>
      <div className="shrink-0 p-3 border-t border-slate-700">
        <button
          onClick={() => picked && read(picked)}
          disabled={!picked}
          className="w-full h-11 rounded-lg bg-cardiac-accent text-slate-950 font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {picked ? 'Check my read' : 'Choose your read'}
        </button>
      </div>
    </div>
  );
}

export function ReadBar({ who }: { who: string }) {
  const read = useSimStore((s) => s.read);
  const [picked, setPicked] = useState('');
  return (
    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
      <label htmlFor="ecg-read" className="text-[12px] font-semibold text-white leading-tight">
        Your {who} asks: what does this 12-lead show?
      </label>
      <div className="flex gap-2">
        <select
          id="ecg-read"
          value={picked}
          onChange={(e) => setPicked(e.target.value)}
          className="flex-1 min-w-0 h-12 rounded-xl bg-cardiac-dark border border-slate-500 text-[14px] text-slate-100 px-2"
        >
          <option value="" disabled>Choose your read…</option>
          {READ_GROUPS.map((g) => (
            <optgroup key={g} label={g}>
              {READ_OPTIONS.filter((o) => o.group === g).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </optgroup>
          ))}
        </select>
        <button
          onClick={() => picked && read(picked)}
          disabled={!picked}
          className="px-4 h-12 rounded-xl bg-cardiac-accent text-slate-950 font-semibold disabled:opacity-40"
        >
          Check
        </button>
      </div>
    </div>
  );
}
