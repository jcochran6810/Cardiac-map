'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { CASE_DATA } from '@/data/caseData';
import { useCaseStore } from '@/store/useCaseStore';
import { useLearningStore } from '@/store/useLearningStore';
import { hash01 } from '@/lib/ecg/waveformEngine';

/**
 * Interactive case walkthrough. At each step the learner picks the next
 * action from the correct guideline step, a documented pitfall (harmful) and
 * an out-of-sequence step (premature). Scoring feeds the learning record.
 */

interface Choice {
  text: string;
  kind: 'correct' | 'pitfall' | 'premature';
}

const stripNumber = (s: string) => s.replace(/^\s*\d+[.)]\s*/, '');

function buildChoices(caseId: string, stepIndex: number): Choice[] {
  const c = CASE_DATA[caseId];
  const guidelines = c.guidelines.map(stripNumber);
  const correct: Choice = { text: guidelines[stepIndex], kind: 'correct' };

  const pitfallIdx = Math.floor(hash01(stepIndex * 31 + caseId.length) * c.pitfalls.length);
  const pitfall: Choice = { text: c.pitfalls[pitfallIdx], kind: 'pitfall' };

  const later = guidelines.slice(stepIndex + 2);
  const choices: Choice[] = [correct, pitfall];
  if (later.length > 0) {
    const lIdx = Math.floor(hash01(stepIndex * 17 + 3) * later.length);
    choices.push({ text: later[lIdx], kind: 'premature' });
  } else if (c.pitfalls.length > 1) {
    const alt = (pitfallIdx + 1) % c.pitfalls.length;
    choices.push({ text: c.pitfalls[alt], kind: 'pitfall' });
  }

  // Deterministic shuffle so the correct answer is not always first
  return choices
    .map((ch, i) => ({ ch, k: hash01(stepIndex * 101 + i * 7 + caseId.length * 13) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.ch);
}

const FEEDBACK: Record<Choice['kind'], { title: string; cls: string; points: number }> = {
  correct: { title: 'Correct — that is the next step.', cls: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300', points: 10 },
  premature: { title: 'Not yet — that step comes later. Do the time-critical action first.', cls: 'border-yellow-500/50 bg-yellow-500/10 text-yellow-300', points: 2 },
  pitfall: { title: 'Harmful — this is a documented pitfall for this presentation.', cls: 'border-red-500/50 bg-red-500/10 text-red-300', points: -5 },
};

export default function CaseSimulator({ caseId }: { caseId: string }) {
  const c = CASE_DATA[caseId];
  const { score, addScore, completeCase, caseComplete, startCase, caseHistory, transitionState } = useCaseStore();
  const { markCaseCompleted } = useLearningStore();

  const [stepIndex, setStepIndex] = useState(0);
  const [picked, setPicked] = useState<Choice | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [stability, setStability] = useState(50);

  // Reset local state when the case changes
  useEffect(() => { setStepIndex(0); setPicked(null); setAttempts(0); setStability(50); }, [caseId]);

  const totalSteps = c.guidelines.length;
  const choices = useMemo(() => buildChoices(caseId, Math.min(stepIndex, totalSteps - 1)), [caseId, stepIndex, totalSteps]);
  const maxScore = totalSteps * 10;

  const pick = (choice: Choice) => {
    if (picked || caseComplete) return;
    setPicked(choice);
    setAttempts((a) => a + 1);
    const fb = FEEDBACK[choice.kind];
    addScore(fb.points);
    setStability((s) => Math.max(0, Math.min(100, s + (choice.kind === 'correct' ? 8 : choice.kind === 'pitfall' ? -15 : -3))));
    transitionState(`${choice.kind}-${stepIndex}`);
  };

  const advance = () => {
    if (!picked) return;
    if (picked.kind !== 'correct') {
      // Let the learner retry the same step after reading the feedback
      setPicked(null);
      return;
    }
    if (stepIndex + 1 >= totalSteps) {
      completeCase();
      markCaseCompleted(caseId, Math.max(0, score));
    } else {
      setStepIndex((i) => i + 1);
      setPicked(null);
    }
  };

  const restart = () => {
    startCase(caseId, 'initial');
    setStepIndex(0); setPicked(null); setAttempts(0); setStability(50);
  };

  const stabilityColor = stability > 66 ? 'bg-emerald-500' : stability > 33 ? 'bg-yellow-500' : 'bg-red-500';

  if (caseComplete) {
    const pct = Math.round((Math.max(0, score) / maxScore) * 100);
    return (
      <div className="space-y-3">
        <div className="p-3 rounded-lg border border-cardiac-accent/40 bg-cardiac-accent/10">
          <p className="text-[10px] font-semibold text-cardiac-accent uppercase tracking-wider">Case complete</p>
          <p className="text-2xl font-bold text-white mt-1">{Math.max(0, score)} <span className="text-xs text-slate-400 font-normal">/ {maxScore} points ({pct}%)</span></p>
          <p className="text-slate-400 mt-1">{attempts} decisions across {totalSteps} steps · {caseHistory.filter((h) => h.startsWith('pitfall')).length} pitfalls chosen.</p>
        </div>
        <div>
          <h4 className="text-[10px] font-semibold text-cardiac-accent uppercase tracking-wider mb-1">Disposition</h4>
          <p className="text-slate-400 leading-relaxed">{c.disposition}</p>
        </div>
        <div>
          <h4 className="text-[10px] font-semibold text-cardiac-accent uppercase tracking-wider mb-1">Debrief — teaching points</h4>
          <ul className="space-y-1">
            {c.teaching.map((t, i) => <li key={i} className="flex gap-2"><span className="text-cardiac-accent">•</span><span className="text-slate-400 leading-relaxed">{t}</span></li>)}
          </ul>
        </div>
        <button onClick={restart} className="w-full py-1.5 rounded bg-cardiac-surface text-slate-200 hover:bg-cardiac-accent/20 hover:text-cardiac-accent text-xs">↻ Run again</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Status */}
      <div className="flex items-center gap-3 text-[10px]">
        <span className="text-slate-500">Step <span className="text-white">{stepIndex + 1}</span>/{totalSteps}</span>
        <span className="text-slate-500">Score <span className={score >= 0 ? 'text-emerald-400' : 'text-red-400'}>{score}</span></span>
        <div className="flex-1 flex items-center gap-1">
          <span className="text-slate-500">Patient</span>
          <div className="flex-1 h-1.5 bg-cardiac-dark rounded overflow-hidden"><div className={`h-full ${stabilityColor} transition-all`} style={{ width: `${stability}%` }} /></div>
        </div>
      </div>

      {/* Situation */}
      <div className="p-2 bg-cardiac-dark rounded">
        <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1">Situation</p>
        <p className="text-slate-300 leading-relaxed">{stepIndex === 0 ? c.presentation : `Previous action completed: ${stripNumber(c.guidelines[stepIndex - 1])}`}</p>
      </div>

      {/* Question */}
      <div>
        <p className="text-xs font-semibold text-white mb-2">What is your next step?</p>
        <div className="space-y-1.5">
          {choices.map((ch, i) => {
            const isPicked = picked?.text === ch.text;
            const revealed = picked !== null;
            const cls = revealed
              ? ch.kind === 'correct'
                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200'
                : isPicked
                  ? FEEDBACK[ch.kind].cls
                  : 'border-slate-700 text-slate-500'
              : 'border-slate-700 bg-cardiac-dark text-slate-300 hover:border-cardiac-accent/50 hover:text-white';
            return (
              <button key={i} onClick={() => pick(ch)} disabled={revealed} className={`w-full text-left p-2 rounded border text-xs leading-relaxed transition-colors ${cls}`}>
                <span className="text-slate-500 mr-1">{String.fromCharCode(65 + i)}.</span>{ch.text}
              </button>
            );
          })}
        </div>
      </div>

      {/* Feedback */}
      {picked && (
        <div className={`p-2 rounded border ${FEEDBACK[picked.kind].cls}`}>
          <p className="font-semibold">{FEEDBACK[picked.kind].title}</p>
          <p className="text-[10px] mt-0.5 opacity-80">{FEEDBACK[picked.kind].points > 0 ? '+' : ''}{FEEDBACK[picked.kind].points} points</p>
          <button onClick={advance} className="mt-2 w-full py-1 rounded bg-cardiac-panel text-slate-200 hover:text-white text-xs">
            {picked.kind === 'correct' ? (stepIndex + 1 >= totalSteps ? 'Finish case ▶' : 'Continue ▶') : 'Try again ↻'}
          </button>
        </div>
      )}

      <button onClick={restart} className="text-[10px] text-slate-500 hover:text-slate-300">Restart case</button>
    </div>
  );
}
