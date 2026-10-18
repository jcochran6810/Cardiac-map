'use client';

import React from 'react';
import { bestKey, leaveSimulator, useSimStore } from '@/store/useSimStore';
import { useAppStore, LEVEL_LABELS } from '@/store/useAppStore';
import { SCENARIO_BY_ID } from '@/lib/sim/scenario/scenarios';
import { clockText } from '@/lib/sim/scenario/engine';
import type { Review } from '@/lib/sim/scenario/types';
import { openCondition } from '@/lib/actions';
import { useContent } from '@/lib/content';
import { IconCheck, IconFlag } from '@/components/ui/icons';
import { gradeStyle } from './simStyles';

const KIND_LABEL: Record<Review['toFix'][number]['kind'], string> = { harm: 'Harmful choice', missed: 'Missed', late: 'Too late', hint: 'Hint' };
const KIND_STYLE: Record<Review['toFix'][number]['kind'], string> = {
  harm: 'bg-red-500/20 text-red-200',
  missed: 'bg-amber-500/20 text-amber-200',
  late: 'bg-yellow-500/15 text-yellow-200',
  hint: 'bg-slate-600/40 text-slate-300',
};

/** The scored review at the end of a case */
export default function ReviewReport({ onBack }: { onBack: () => void }) {
  const state = useSimStore((s) => s.state)!;
  const review = useSimStore((s) => s.review)!;
  const best = useSimStore((s) => s.best[bestKey(state.scenarioId, state.role)]);
  const startScenario = useSimStore((s) => s.startScenario);
  const closeScenario = useSimStore((s) => s.closeScenario);
  const lib = useContent();
  const sc = SCENARIO_BY_ID[state.scenarioId];
  const g = gradeStyle(review.percent);
  const conditionName = sc.conditionId ? lib?.conditions[sc.conditionId]?.name : undefined;

  const learn = () => {
    // hand the monitor back to the workspace before the condition loads its own ECG
    leaveSimulator();
    closeScenario();
    useAppStore.getState().setMode('learn');
    if (sc.conditionId) openCondition(sc.conditionId);
  };

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-5 sm:px-6 sm:py-7">
        <div className="text-[11px] uppercase tracking-wider text-slate-400">Case review · {LEVEL_LABELS[state.role].long}</div>
        <h1 className="text-lg sm:text-xl font-semibold text-white mt-0.5">{sc.title}</h1>

        <div className={`mt-3 flex flex-wrap items-center gap-4 rounded-xl border p-4 ${g.box}`}>
          <ScoreRing percent={review.percent} color={g.ring} />
          <div className="min-w-0 flex-1">
            <div className={`text-xl font-bold ${g.text}`}>{review.grade}</div>
            <p className="text-sm text-slate-200 mt-0.5">{review.outcome}</p>
            <p className="text-xs text-slate-400 mt-1">
              {fmt(review.earned)} of {review.max} points for the critical steps{review.penaltyPoints > 0 ? `, minus ${review.penaltyPoints} for harmful choices${review.hints ? ' and hints' : ''}` : ''}.
              {best !== undefined && state.ended?.reason !== 'stopped' && ` Your best: ${best}%.`}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => startScenario(sc.id, state.role)} className="px-4 py-2.5 rounded-lg bg-cardiac-accent text-slate-950 text-sm font-semibold hover:bg-amber-400">Try this case again</button>
          <button onClick={closeScenario} className="px-4 py-2.5 rounded-lg border border-slate-600 text-sm text-slate-200 hover:bg-cardiac-surface">Choose another case</button>
          <button onClick={onBack} className="px-4 py-2.5 rounded-lg border border-slate-600 text-sm text-slate-200 hover:bg-cardiac-surface">See the case story</button>
          {sc.conditionId && (
            <button onClick={learn} className="px-4 py-2.5 rounded-lg border border-rose-500/40 text-sm text-rose-200 hover:bg-rose-500/10">
              Learn about {conditionName ?? 'this condition'} →
            </button>
          )}
        </div>

        <Section title="What to fix" empty="Nothing — every critical step was done on time, with no harmful choices.">
          {review.toFix.map((t, i) => (
            <li key={i} className="p-2.5 rounded-lg bg-cardiac-panel border border-slate-700">
              <div className="flex items-start gap-2">
                <span className={`shrink-0 mt-px px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${KIND_STYLE[t.kind]}`}>{KIND_LABEL[t.kind]}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-white leading-snug">{t.label}</div>
                  {t.detail && t.detail !== t.label && <p className="text-xs text-slate-300 leading-relaxed mt-0.5">{t.detail}</p>}
                </div>
                <span className={`shrink-0 text-xs font-mono ${t.kind === 'late' ? 'text-yellow-300' : 'text-red-300'}`}>
                  {t.kind === 'late' ? `½ · ${fmt(t.points)}` : `−${fmt(t.points)}`}
                </span>
              </div>
            </li>
          ))}
        </Section>

        <Section title="What went well" empty="No critical steps done yet.">
          {review.wentWell.map((w, i) => (
            <li key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-cardiac-panel/70 border border-slate-700/70">
              <IconCheck size={14} className="text-emerald-400 shrink-0" />
              <span className="text-[13px] text-slate-200 flex-1 min-w-0">{w.label}</span>
              <span className="text-[11px] text-slate-500 font-mono shrink-0">{w.detail} · +{fmt(w.points)}</span>
            </li>
          ))}
        </Section>

        {review.timings.length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-white">Your times</h2>
            <div className="mt-2 overflow-hidden rounded-lg border border-slate-700">
              <table className="w-full text-[13px]">
                <thead className="bg-cardiac-panel text-[10px] uppercase tracking-wider text-slate-400">
                  <tr><th className="text-left px-3 py-1.5 font-medium">Step</th><th className="text-right px-3 py-1.5 font-medium">You</th><th className="text-right px-3 py-1.5 font-medium">Goal</th></tr>
                </thead>
                <tbody>
                  {review.timings.map((t) => (
                    <tr key={t.label} className="border-t border-slate-700/70">
                      <td className="px-3 py-1.5 text-slate-200">{t.label}</td>
                      <td className={`px-3 py-1.5 text-right font-mono ${t.met === false ? 'text-red-300' : t.met ? 'text-emerald-300' : 'text-slate-200'}`}>
                        {t.minute === null ? 'not done' : clockText(t.minute)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-slate-400">{t.target !== undefined ? `≤ ${clockText(t.target)}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-6 p-3 rounded-xl bg-cardiac-panel border border-slate-700">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-white"><IconFlag size={14} className="text-cardiac-accent" /> Teaching points</h2>
          <ul className="mt-2 space-y-1.5">
            {review.teaching.map((t) => (
              <li key={t} className="flex gap-2 text-[13px] text-slate-300 leading-relaxed"><span className="text-cardiac-accent shrink-0">•</span>{t}</li>
            ))}
          </ul>
        </div>
        <p className="mt-5 text-[11px] text-slate-500">Teaching simulation only — follow your local protocols and medical direction.</p>
      </div>
    </div>
  );
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <div className="mt-6">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      {children.length ? <ul className="mt-2 grid gap-1.5">{children}</ul> : <p className="mt-1.5 text-xs text-slate-400">{empty}</p>}
    </div>
  );
}

function ScoreRing({ percent, color }: { percent: number; color: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" className="shrink-0" role="img" aria-label={`Score ${percent} percent`}>
      <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(148,163,184,0.25)" strokeWidth="8" />
      <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(c * percent) / 100} ${c}`} transform="rotate(-90 44 44)" />
      <text x="44" y="50" textAnchor="middle" fontSize="20" fontWeight="700" fill="#f8fafc">{percent}%</text>
    </svg>
  );
}
