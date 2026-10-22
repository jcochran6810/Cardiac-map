'use client';

import React from 'react';
import { useAppStore, LEVEL_LABELS, type LearningLevel } from '@/store/useAppStore';
import { bestKey, useSimStore } from '@/store/useSimStore';
import { SCENARIOS } from '@/lib/sim/scenario/scenarios';
import { openCategory } from '@/lib/actions';
import type { Scenario } from '@/lib/sim/scenario/types';
import { SETTING_LABEL, DIFFICULTY_STYLE, gradeStyle } from './simStyles';

const ROLES: LearningLevel[] = [1, 2, 3, 4, 5];

/** Choose your role and a case */
export default function ScenarioPicker() {
  const role = useAppStore((s) => s.learningLevel);
  const setRole = useAppStore((s) => s.setLearningLevel);
  const best = useSimStore((s) => s.best);
  const startScenario = useSimStore((s) => s.startScenario);
  const mine = SCENARIOS.filter((sc) => sc.roles.includes(role));
  const studyLab = () => openCategory('cathlab');
  const others = SCENARIOS.filter((sc) => !sc.roles.includes(role));

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 py-5 sm:px-6 sm:py-7">
        <h1 className="text-xl sm:text-2xl font-semibold text-white">Case simulator</h1>
        <p className="mt-1.5 text-sm text-slate-300 max-w-3xl leading-relaxed">
          Treat a patient from the first minute to the hand-off. You see what a real provider sees — the patient, the monitor and
          the 12-lead — and you choose every step yourself.
        </p>

        <ol className="mt-4 grid sm:grid-cols-3 gap-2">
          <Step n={1} title="Read the patient">The story, the monitor and the 12-lead show what you would see.</Step>
          <Step n={2} title="Choose what to do">Every action in your scope is listed, right or wrong. Each one takes time, and the patient responds.</Step>
          <Step n={3} title="Get your score">When every critical step is done the case ends: your score, your times and what to fix.</Step>
        </ol>

        <div className="mt-6">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5">You are playing as</div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Your role">
            {ROLES.map((l) => (
              <button
                key={l}
                onClick={() => setRole(l)}
                role="radio"
                aria-checked={l === role}
                className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                  l === role ? 'bg-cardiac-accent/20 border-cardiac-accent/60 text-cardiac-accent font-semibold' : 'border-slate-600 text-slate-200 hover:bg-cardiac-surface'
                }`}
              >
                {LEVEL_LABELS[l].short}
              </button>
            ))}
          </div>
        </div>

        <h2 className="mt-6 text-sm font-semibold text-white">Cases for {LEVEL_LABELS[role].long}</h2>
        {role >= 3 && (
          <button onClick={studyLab} className="mt-2 w-full text-left flex items-center gap-3 p-3 rounded-xl border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20">
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-cyan-100">Study before you scrub in: the cath lab catalog →</span>
              <span className="block text-xs text-cyan-200/75 leading-snug mt-0.5">Every view, catheter, wire, balloon, stent, lab drug, pressure and complication these cases use — and what the tech, the nurse and the cardiologist each do.</span>
            </span>
          </button>
        )}
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          {mine.map((sc) => (
            <CaseCard key={sc.id} sc={sc} best={best[bestKey(sc.id, role)]} onStart={() => startScenario(sc.id, role)} />
          ))}
        </div>

        {others.length > 0 && (
          <>
            <h2 className="mt-7 text-sm font-semibold text-slate-300">Cases for other roles</h2>
            <p className="text-xs text-slate-500 mt-0.5">Switch role to play these — each role sees only the actions in its own scope of practice.</p>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              {others.map((sc) => (
                <CaseCard
                  key={sc.id}
                  sc={sc}
                  dim
                  onStart={() => { setRole(sc.roles[0]); startScenario(sc.id, sc.roles[0]); }}
                  startLabel={`Play as ${LEVEL_LABELS[sc.roles[0]].short} →`}
                />
              ))}
            </div>
          </>
        )}
        <p className="mt-6 text-[11px] text-slate-500 leading-relaxed">
          Teaching simulation only: simplified patients, typical adult doses and generic protocols. Always follow your local protocols and medical direction.
        </p>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 p-3 rounded-lg bg-cardiac-panel/70 border border-slate-700">
      <span className="w-6 h-6 shrink-0 rounded-full bg-cardiac-accent/20 text-cardiac-accent text-xs font-bold flex items-center justify-center">{n}</span>
      <div>
        <div className="text-[13px] font-semibold text-white">{title}</div>
        <div className="text-xs text-slate-400 leading-snug mt-0.5">{children}</div>
      </div>
    </li>
  );
}

function CaseCard({ sc, best, onStart, dim = false, startLabel = 'Start case →' }: { sc: Scenario; best?: number; onStart: () => void; dim?: boolean; startLabel?: string }) {
  return (
    <div className={`flex flex-col p-4 rounded-xl border bg-cardiac-panel ${dim ? 'border-slate-700/70 opacity-80' : 'border-slate-600'}`}>
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wider">
        <span className="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300">{SETTING_LABEL[sc.setting]}</span>
        <span className={`px-1.5 py-0.5 rounded border ${DIFFICULTY_STYLE[sc.difficulty]}`}>{sc.difficulty}</span>
        <span className="text-slate-500 normal-case tracking-normal">{sc.roles.map((r) => LEVEL_LABELS[r].short).join(' · ')}</span>
      </div>
      <h3 className="mt-2 text-[15px] font-semibold text-white leading-snug">{sc.title}</h3>
      <p className="mt-1 text-xs text-slate-300 leading-relaxed flex-1">{sc.summary}</p>
      <div className="mt-3 flex items-center gap-3">
        <button onClick={onStart} className="px-3.5 py-2 rounded-lg bg-cardiac-accent text-slate-950 text-sm font-semibold hover:bg-amber-400">
          {startLabel}
        </button>
        {best !== undefined && (
          <span className={`text-xs ${gradeStyle(best).text}`} title="Your best score for this case as this role (kept on this device)">Best: {best}%</span>
        )}
      </div>
    </div>
  );
}
