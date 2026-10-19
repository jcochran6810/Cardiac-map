'use client';

import React from 'react';
import { useMedStore } from '@/store/useMedStore';
import { useAppStore } from '@/store/useAppStore';
import { MED_BY_ID } from '@/lib/sim/meds';
import { IconPill } from '@/components/ui/icons';
import { TONE, fmtClock, useNextEffect } from './GiveMedication';

/**
 * A strip above the live ECG while a drug is acting: the latest effect, the time to the next one, Skip ahead,
 * and a way back to the Give meds tab (on phones the info drawer closes so the tracing can be watched).
 */
export default function MedEffectBar() {
  const log = useMedStore((s) => s.log);
  const last = useMedStore((s) => s.last);
  const skipAhead = useMedStore((s) => s.skipAhead);
  const next = useNextEffect();
  if (!log.length || !last) return null;
  const latest = log[log.length - 1];
  const v = last.plan.verdict.tone;
  const chip = v === 'good' ? 'bg-emerald-500/20 text-emerald-200' : v === 'caution' ? 'bg-amber-500/20 text-amber-200' : 'bg-red-500/20 text-red-200';
  const details = () => {
    const app = useAppStore.getState();
    app.setRightPanelTab('treat');
    app.setPanels(app.compact ? false : app.leftPanelOpen, true);
  };
  return (
    <div className="shrink-0 flex items-center gap-2 px-2 py-1 border-b border-slate-700 bg-sky-950/60 text-[11px] min-w-0" role="status" aria-live="polite">
      <IconPill size={13} className="text-sky-300 shrink-0" />
      <span className={`shrink-0 px-1.5 rounded ${chip}`}>{MED_BY_ID[last.drug].name}</span>
      <span className="font-mono text-slate-400 shrink-0">{latest.tone === 'push' ? 'given' : `+${fmtClock(latest.since)}`}</span>
      <span className={`truncate min-w-0 ${TONE[latest.tone]}`} title={latest.text}>{latest.text}</span>
      <span className="ml-auto flex items-center gap-2 shrink-0">
        {next && <span className="hidden sm:inline text-slate-400">next in {fmtClock(next.inMs)}</span>}
        {next && next.inMs > 3000 && (
          <button onClick={skipAhead} className="px-1.5 py-0.5 touch:py-1.5 rounded border border-sky-500/40 text-sky-200 hover:bg-sky-500/20" title="Bring the next effect forward (the tracing keeps running in real time)">
            Skip ⏩
          </button>
        )}
        <button onClick={details} className="px-1.5 py-0.5 touch:py-1.5 rounded border border-slate-600 text-slate-200 hover:bg-white/10">Details</button>
      </span>
    </div>
  );
}
