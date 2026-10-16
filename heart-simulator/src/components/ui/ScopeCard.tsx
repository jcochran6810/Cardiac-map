'use client';

import React from 'react';
import { SCOPES } from '@/lib/scope';
import type { LearningLevel } from '@/store/useAppStore';

/** What a role may and may not do — shown wherever role-specific guidance appears */
export default function ScopeCard({ level, compact = false }: { level: LearningLevel; compact?: boolean }) {
  const s = SCOPES[level];
  return (
    <div className="text-[11px] leading-snug">
      <div className="text-white font-semibold">{s.role} — scope of practice</div>
      <div className="text-slate-400 text-[10px]">{s.credential}</div>
      <div className="text-slate-500 text-[10px] mt-0.5">{s.framework}</div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <div className="text-[9px] uppercase tracking-wider text-emerald-300 mb-0.5">Within scope</div>
          <ul className="space-y-0.5">
            {(compact ? s.can.slice(0, 5) : s.can).map((c) => <li key={c} className="flex gap-1.5 text-slate-200"><span className="text-emerald-400">✓</span><span>{c}</span></li>)}
          </ul>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wider text-rose-300 mb-0.5">Outside scope</div>
          <ul className="space-y-0.5">
            {s.mustNot.map((c) => <li key={c} className="flex gap-1.5 text-slate-300"><span className="text-rose-400">✕</span><span>{c}</span></li>)}
          </ul>
          <div className="mt-1.5 text-[10px] text-slate-400"><b className="text-slate-300">Escalate to:</b> {s.escalateTo}</div>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-slate-500">Your state law, local protocols, medical direction, facility policy and credentialing define your actual scope.</p>
    </div>
  );
}
