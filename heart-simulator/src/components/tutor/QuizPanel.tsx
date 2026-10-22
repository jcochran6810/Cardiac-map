'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore, LEVEL_LABELS, type LearningLevel } from '@/store/useAppStore';
import { useECGStore } from '@/store/useECGStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { useLearningStore } from '@/store/useLearningStore';
import { useContent } from '@/lib/content';
import { kindOf, nameOf, openById, showRhythm } from '@/lib/actions';
import type { QuizQuestion, QuizTopic } from '@/types/content';
import { IconClose, IconQuiz } from '@/components/ui/icons';

const TOPIC_LABEL: Record<QuizTopic, string> = {
  anatomy: 'Anatomy', physiology: 'Physiology', ecg: 'ECG', 'rhythm-id': 'Rhythm ID (live)', conduction: 'Conduction', coronary: 'Coronary',
  ischemia: 'Ischaemia', arrhythmia: 'Arrhythmia', acls: 'ACLS', pharmacology: 'Pharmacology', hemodynamics: 'Hemodynamics',
  valvular: 'Valvular', 'heart-failure': 'Heart failure', cardiomyopathy: 'Cardiomyopathy', pericardial: 'Pericardial', congenital: 'Congenital', procedures: 'Procedures',
};

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function QuizPanel() {
  const quizOpen = useAppStore((s) => s.quizOpen);
  const setQuizOpen = useAppStore((s) => s.setQuizOpen);
  const level = useAppStore((s) => s.learningLevel);
  const lib = useContent();
  const recordQuizAttempt = useLearningStore((s) => s.recordQuizAttempt);
  const attempts = useLearningStore((s) => s.quizAttempts);

  const [topic, setTopic] = useState<QuizTopic | 'all'>('all');
  const [maxLevel, setMaxLevel] = useState<LearningLevel>(level);
  const [deck, setDeck] = useState<QuizQuestion[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const saved = useRef<{ profile: string; hr: number } | null>(null);

  useEffect(() => { setMaxLevel(level); }, [level]);

  // Remember and restore the monitor so the quiz doesn't hijack the learner's rhythm
  useEffect(() => {
    if (quizOpen) {
      saved.current = { profile: useECGStore.getState().activeProfileId, hr: useTimelineStore.getState().heartRate };
    } else if (saved.current) {
      showRhythm(saved.current.profile, saved.current.hr);
      saved.current = null;
      setDeck(null);
    }
  }, [quizOpen]);

  const pool = useMemo(() => {
    if (!lib) return [];
    return lib.quiz.filter((q) => forRole(q.level, q.topic, maxLevel) && (topic === 'all' || q.topic === topic));
  }, [lib, maxLevel, topic]);

  const q = deck?.[idx] ?? null;

  useEffect(() => {
    if (q?.ecgProfile) {
      showRhythm(q.ecgProfile, q.heartRate);
      useECGStore.getState().setBottomView('ecg');
      useECGStore.getState().setInspectLead(null);
      useTimelineStore.getState().play();
    }
  }, [q]);

  if (!quizOpen) return null;

  const start = () => {
    setDeck(shuffle(pool).slice(0, 10));
    setIdx(0);
    setChoice(null);
    setScore(0);
  };
  const pick = (i: number) => {
    if (!q || choice !== null) return;
    setChoice(i);
    const ok = i === q.correctIndex;
    if (ok) setScore((s) => s + 1);
    recordQuizAttempt(q.id, ok);
  };
  const recent = attempts.slice(-50);
  const accuracy = recent.length ? Math.round((recent.filter((a) => a.correct).length / recent.length) * 100) : null;
  const topics = Array.from(new Set(lib?.quiz.map((x) => x.topic) ?? [])) as QuizTopic[];

  return (
    <div className="fixed right-2 top-16 z-40 w-[min(30rem,calc(100vw-1rem))] max-h-[calc(100dvh-var(--dock-h,340px)-5rem)] min-h-[280px] bg-cardiac-panel/95 border border-slate-600 rounded-xl flex flex-col shadow-2xl backdrop-blur phone:inset-x-0 phone:top-12 short:top-11 phone:bottom-0 phone:w-full phone:max-h-none phone:min-h-0 phone:rounded-none phone:border-x-0 phone:border-b-0 phone:animate-slide-in-up" role="dialog" aria-label="Quiz">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-violet-500/20 text-violet-300 flex items-center justify-center"><IconQuiz size={14} /></div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-white">Quiz</div>
            <div className="text-[10px] text-slate-400">{accuracy !== null ? `Recent accuracy ${accuracy}% (${recent.length} answered)` : 'Test yourself — rhythm questions play on the live monitor'}</div>
          </div>
        </div>
        <button onClick={() => setQuizOpen(false)} className="p-1 touch:p-2 text-slate-400 hover:text-white" aria-label="Close quiz"><IconClose size={16} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 text-xs min-h-0">
        {!lib && <p className="text-slate-400">Loading questions…</p>}
        {lib && !deck && (
          <div className="space-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Questions for</div>
              <div className="flex flex-wrap gap-1">
                {([1, 2, 3, 4, 5] as LearningLevel[]).map((l) => (
                  <button key={l} onClick={() => setMaxLevel(l)} className={`px-2 py-1 touch:py-2 touch:px-3 rounded text-[10px] border ${maxLevel === l ? 'bg-violet-500/25 border-violet-400/60 text-violet-100' : 'border-slate-600 text-slate-300 hover:text-white'}`}>
                    {LEVEL_LABELS[l].short}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Topic</div>
              <div className="flex flex-wrap gap-1">
                <button onClick={() => setTopic('all')} className={`px-2 py-1 touch:py-2 touch:px-3 rounded text-[10px] border ${topic === 'all' ? 'bg-violet-500/25 border-violet-400/60 text-violet-100' : 'border-slate-600 text-slate-300 hover:text-white'}`}>All topics</button>
                {topics.map((t) => (
                  <button key={t} onClick={() => setTopic(t)} className={`px-2 py-1 touch:py-2 touch:px-3 rounded text-[10px] border ${topic === t ? 'bg-violet-500/25 border-violet-400/60 text-violet-100' : 'border-slate-600 text-slate-300 hover:text-white'}`}>
                    {TOPIC_LABEL[t] ?? t}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={start} disabled={!pool.length} className="w-full py-2 rounded-lg bg-violet-500 text-white font-semibold hover:bg-violet-400 disabled:opacity-40">
              Start {Math.min(10, pool.length)} questions
            </button>
            <p className="text-[10px] text-slate-500">{pool.length} questions available with these filters.</p>
          </div>
        )}

        {deck && q && (
          <div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1.5">
              <span>Question {idx + 1} of {deck.length} · {TOPIC_LABEL[q.topic]} · {LEVEL_LABELS[q.level].short}</span>
              <span>Score {score}</span>
            </div>
            <div className="h-1 rounded-full bg-slate-700 mb-2 overflow-hidden"><div className="h-full bg-violet-400" style={{ width: `${(idx / deck.length) * 100}%` }} /></div>
            {q.ecgProfile && (
              <div className="mb-2 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/25 text-[10px] text-emerald-200">
                ▶ The live ECG below is showing this rhythm — study the strip (try Inspect or Calipers).
              </div>
            )}
            <p className="text-sm text-white leading-relaxed">{q.question}</p>
            <div className="mt-2 space-y-1.5">
              {q.options.map((o, i) => {
                const answered = choice !== null;
                const correct = i === q.correctIndex;
                return (
                  <button
                    key={i}
                    onClick={() => pick(i)}
                    disabled={answered}
                    className={`w-full text-left p-2 touch:p-3 rounded-md border leading-snug transition-colors ${
                      !answered ? 'bg-cardiac-dark/70 border-slate-600 hover:border-violet-400/60 text-slate-200'
                        : correct ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-100'
                          : choice === i ? 'bg-red-500/15 border-red-500/50 text-red-100' : 'bg-cardiac-dark/40 border-slate-700 text-slate-500'
                    }`}
                  >
                    <span className="font-mono mr-1.5 text-slate-500">{String.fromCharCode(65 + i)}</span>{o}
                  </button>
                );
              })}
            </div>
            {choice !== null && (
              <div className="mt-2 p-2 rounded-md bg-cardiac-dark border border-slate-700">
                <div className={`font-semibold mb-1 ${choice === q.correctIndex ? 'text-emerald-300' : 'text-red-300'}`}>{choice === q.correctIndex ? 'Correct' : 'Not quite'}</div>
                <p className="text-slate-300 leading-relaxed">{q.explanation}</p>
                {q.relatedIds && q.relatedIds.filter((id) => kindOf(id)).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {q.relatedIds.filter((id) => kindOf(id)).map((id) => (
                      <button key={id} onClick={() => openById(id)} className="px-1.5 py-0.5 touch:px-2.5 touch:py-1.5 rounded border border-sky-500/30 bg-sky-500/10 text-sky-300 text-[10px] hover:bg-sky-500/20">{nameOf(id)}</button>
                    ))}
                  </div>
                )}
                <div className="flex justify-end mt-2">
                  <button
                    onClick={() => { setIdx((i) => i + 1); setChoice(null); }}
                    className="px-3 py-1 touch:px-4 touch:py-2 rounded bg-violet-500 text-white text-[11px] font-semibold hover:bg-violet-400"
                  >
                    {idx + 1 >= deck.length ? 'See results' : 'Next →'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {deck && !q && (
          <div className="text-center py-4">
            <div className="text-3xl font-bold text-white">{score}/{deck.length}</div>
            <p className="text-slate-400 mt-1">{score === deck.length ? 'Perfect round!' : score >= deck.length * 0.7 ? 'Strong work.' : 'Review the explanations and try again.'}</p>
            <div className="flex justify-center gap-2 mt-3">
              <button onClick={start} className="px-3 py-1.5 rounded bg-violet-500 text-white font-semibold hover:bg-violet-400">New round</button>
              <button onClick={() => setDeck(null)} className="px-3 py-1.5 rounded border border-slate-600 text-slate-300 hover:text-white">Change filters</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Which questions suit a role. EMT and paramedic sets are cumulative (BLS ⊂ ALS). Cath lab staff
 * get BLS plus the ACLS / rhythm questions they are certified in, but not prehospital-protocol
 * questions; the cardiologist sees everything.
 */
function forRole(qLevel: number, topic: string, role: LearningLevel): boolean {
  if (role === 5) return true;
  if (role <= 2) return qLevel <= role;
  if (qLevel === 1 || (qLevel >= 3 && qLevel <= role)) return true;
  return qLevel === 2 && ['acls', 'rhythm-id', 'ecg', 'pharmacology'].includes(topic);
}
