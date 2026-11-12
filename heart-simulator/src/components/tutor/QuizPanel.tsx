'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore, LEVEL_LABELS, type LearningLevel } from '@/store/useAppStore';
import { useECGStore } from '@/store/useECGStore';
import { useLearningStore } from '@/store/useLearningStore';
import { useTutorStore } from '@/store/useTutorStore';
import { answeredSoFar, useQuizStore } from '@/store/useQuizStore';
import { useContent } from '@/lib/content';
import { endQuizStrips, kindOf, nameOf, openById, showEcg, showQuizStrip } from '@/lib/actions';
import type { QuizTopic } from '@/types/content';
import { IconClose, IconQuiz } from '@/components/ui/icons';
import QuizStrip from '@/components/tutor/QuizStrip';
import { useDialogFocus } from '@/components/tutor/useDialogFocus';

const TOPIC_LABEL: Record<QuizTopic, string> = {
  anatomy: 'Anatomy', physiology: 'Physiology', ecg: 'ECG', 'rhythm-id': 'Rhythm ID (live)', conduction: 'Conduction', coronary: 'Coronary',
  ischemia: 'Ischemia', arrhythmia: 'Arrhythmia', acls: 'ACLS', pharmacology: 'Pharmacology', hemodynamics: 'Hemodynamics',
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

/** a filter chip: 12 px text, and at least 40 px tall on a touch screen */
const chip = (on: boolean) => `px-2.5 py-1 touch:px-3 touch:min-h-10 rounded text-xs border ${on ? 'bg-violet-500/25 border-violet-400/60 text-violet-100' : 'border-slate-600 text-slate-300 hover:text-white'}`;

export default function QuizPanel() {
  const quizOpen = useAppStore((s) => s.quizOpen);
  const setQuizOpen = useAppStore((s) => s.setQuizOpen);
  const level = useAppStore((s) => s.learningLevel);
  // The ECG drawer can sit under the quiz only on the learning screen of a tablet or a computer (a phone's quiz fills
  // the screen; the other screens have no drawer). When it is up on the tracing the quiz points at it; anywhere else
  // the card draws the strip itself.
  const drawerPossible = useAppStore((s) => s.mode === 'learn' && !s.phone);
  const drawerUp = useAppStore((s) => s.ecg !== 'closed');
  const drawerOnTracing = useECGStore((s) => s.bottomView === 'ecg' && !s.electrodeLab);
  const ecgInView = drawerPossible && drawerUp && drawerOnTracing;
  const lib = useContent();
  const recordQuizAttempt = useLearningStore((s) => s.recordQuizAttempt);
  const attempts = useLearningStore((s) => s.quizAttempts);
  const round = useQuizStore();
  const { deck, idx, choice, score } = round;

  const [topic, setTopic] = useState<QuizTopic | 'all'>('all');
  const [maxLevel, setMaxLevel] = useState<LearningLevel>(level);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** what a keyboard or screen-reader user should land on: the question, or the results */
  const readRef = useRef<HTMLElement | null>(null);

  useEffect(() => { setMaxLevel(level); }, [level]);

  // The quiz only borrows the monitor for its strips: closing it hands the monitor back if a strip took it, and
  // leaves it alone if none did (drugs given in Give meds keep acting). The round itself is kept (useQuizStore):
  // opening the quiz again returns to the same question with the same score.
  useEffect(() => {
    if (quizOpen) return;
    endQuizStrips();
    setConfirmEnd(false);
  }, [quizOpen]);

  // The quiz and the tutor open in the same place (all of a phone's screen): opening the tutor puts the quiz away,
  // round and all, and the tutor does the same the other way round
  useEffect(() => useTutorStore.subscribe((s, prev) => {
    if (s.tutorOpen && !prev.tutorOpen && useAppStore.getState().quizOpen) useAppStore.getState().setQuizOpen(false);
  }), []);

  useDialogFocus(quizOpen, () => panelRef.current);

  const pool = useMemo(() => {
    if (!lib) return [];
    return lib.quiz.filter((q) => forRole(q.level, q.topic, maxLevel) && (topic === 'all' || q.topic === topic));
  }, [lib, maxLevel, topic]);

  const q = deck?.[idx] ?? null;

  // a strip question puts its rhythm on the monitor — again when the quiz is reopened on it
  useEffect(() => {
    if (quizOpen && q?.ecgProfile) showQuizStrip(q.ecgProfile, q.heartRate);
  }, [q, quizOpen]);

  // while a strip question is unanswered the ECG panel must not name the rhythm
  const asking = quizOpen && !!q?.ecgProfile && choice === null;
  useEffect(() => {
    useECGStore.getState().setBlind('quiz', asking);
    return () => useECGStore.getState().setBlind('quiz', false);
  }, [asking]);

  // a new question (or the results, or the filters again): start reading at its top
  useEffect(() => {
    if (!useAppStore.getState().quizOpen) return;
    scrollRef.current?.scrollTo({ top: 0 });
    const active = document.activeElement;
    // the button that moved on has gone; a learner who has clicked elsewhere keeps their place
    if (active && active !== document.body && !panelRef.current?.contains(active)) return;
    (readRef.current ?? panelRef.current)?.focus({ preventScroll: true });
  }, [deck, idx]);

  if (!quizOpen) return null;

  const start = () => {
    setConfirmEnd(false);
    round.start(shuffle(pool).slice(0, 10));
  };
  const pick = (i: number) => {
    if (!q) return;
    const ok = round.pick(i);
    if (ok !== null) recordQuizAttempt(q.id, ok);
  };
  const changeTopic = () => {
    // nothing answered yet: nothing to lose
    if (answeredSoFar(round) === 0) round.end();
    else setConfirmEnd(true);
  };
  const recent = attempts.slice(-50);
  const accuracy = recent.length ? Math.round((recent.filter((a) => a.correct).length / recent.length) * 100) : null;
  const topics = Array.from(new Set(lib?.quiz.map((x) => x.topic) ?? [])) as QuizTopic[];
  const answered = answeredSoFar(round);

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      className="fixed right-2 top-16 z-40 w-[min(30rem,calc(100vw-1rem))] max-h-[max(calc(100dvh-var(--dock-h,340px)-5rem),min(70dvh,520px))] min-h-[280px] bg-cardiac-panel/95 border border-slate-600 rounded-xl flex flex-col shadow-2xl backdrop-blur focus:outline-none phone:inset-x-0 phone:top-12 short:top-11 phone:bottom-0 phone:w-full phone:max-h-none phone:min-h-0 phone:rounded-none phone:border-x-0 phone:border-b-0 phone:animate-slide-in-up"
      role="dialog"
      aria-labelledby="quiz-title"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-violet-500/20 text-violet-300 flex items-center justify-center"><IconQuiz size={14} /></div>
          <div className="leading-tight">
            <h2 id="quiz-title" className="text-sm font-semibold text-white">Quiz</h2>
            <div className="text-xs text-slate-400">{accuracy !== null ? `Recent accuracy ${accuracy}% (${recent.length} answered)` : 'Test yourself — rhythm questions play a live strip'}</div>
          </div>
        </div>
        <button onClick={() => setQuizOpen(false)} className="p-1 touch:p-3 text-slate-400 hover:text-white" aria-label="Close quiz"><IconClose size={16} /></button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 text-[13px] min-h-0">
        {!lib && <p className="text-slate-400">Loading questions…</p>}
        {lib && !deck && (
          <div className="space-y-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-400 mb-1">Questions for</div>
              <div className="flex flex-wrap gap-1.5">
                {([1, 2, 3, 4, 5] as LearningLevel[]).map((l) => (
                  <button key={l} onClick={() => setMaxLevel(l)} aria-pressed={maxLevel === l} className={chip(maxLevel === l)}>
                    {LEVEL_LABELS[l].short}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-400 mb-1">Topic</div>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setTopic('all')} aria-pressed={topic === 'all'} className={chip(topic === 'all')}>All topics</button>
                {topics.map((t) => (
                  <button key={t} onClick={() => setTopic(t)} aria-pressed={topic === t} className={chip(topic === t)}>
                    {TOPIC_LABEL[t] ?? t}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={start} disabled={!pool.length} className="w-full py-2 touch:py-3 rounded-lg bg-violet-500 text-white text-sm font-semibold hover:bg-violet-400 disabled:opacity-40">
              Start {Math.min(10, pool.length)} questions
            </button>
            <p className="text-xs text-slate-400">{pool.length} questions available with these filters.</p>
          </div>
        )}

        {deck && q && (
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-1.5">
              <span className="min-w-0">Question {idx + 1} of {deck.length} · {TOPIC_LABEL[q.topic]} · {LEVEL_LABELS[q.level].short}</span>
              <span className="ml-auto shrink-0 tabular-nums">Score {score}</span>
              {!confirmEnd && (
                <button onClick={changeTopic} className="shrink-0 px-2 py-1 touch:min-h-10 rounded text-violet-300 underline underline-offset-2 hover:text-violet-100">
                  Change topic
                </button>
              )}
            </div>
            {confirmEnd && (
              <div className="mb-2 p-2 rounded-md bg-cardiac-dark border border-violet-400/40" role="alert">
                <p className="text-slate-200">End this round and choose another topic? The round&rsquo;s score ({score} of {answered}) is not kept; every answer still counts toward your accuracy.</p>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => { setConfirmEnd(false); round.end(); }} className="px-3 py-1.5 touch:min-h-10 rounded bg-violet-500 text-white text-xs font-semibold hover:bg-violet-400">End round</button>
                  <button onClick={() => setConfirmEnd(false)} className="px-3 py-1.5 touch:min-h-10 rounded border border-slate-600 text-slate-200 text-xs hover:text-white">Keep going</button>
                </div>
              </div>
            )}
            <div className="h-1 rounded-full bg-slate-700 mb-2 overflow-hidden"><div className="h-full bg-violet-400" style={{ width: `${(idx / deck.length) * 100}%` }} /></div>
            {q.ecgProfile && (ecgInView ? (
              <div className="mb-2 px-2 py-1.5 rounded bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-200">
                ▶ The live ECG below is showing this rhythm — study the strip (try Inspect or Calipers).
              </div>
            ) : (
              <>
                <QuizStrip key={q.id} />
                {drawerPossible && (
                  <button onClick={() => showEcg('ecg')} className="-mt-1 mb-2 px-1 py-1 touch:min-h-10 text-xs text-emerald-300 underline underline-offset-2 hover:text-emerald-100">
                    Show all 12 leads below (Inspect, Calipers)
                  </button>
                )}
              </>
            ))}
            <p ref={(el) => { readRef.current = el; }} tabIndex={-1} className="text-sm touch:text-[15px] text-white leading-relaxed focus:outline-none">{q.question}</p>
            <div className="mt-2 space-y-1.5">
              {q.options.map((o, i) => {
                const isAnswered = choice !== null;
                const correct = i === q.correctIndex;
                return (
                  <button
                    key={i}
                    onClick={() => pick(i)}
                    disabled={isAnswered}
                    className={`w-full text-left p-2 touch:p-3 rounded-md border text-[13px] touch:text-sm leading-snug transition-colors ${
                      !isAnswered ? 'bg-cardiac-dark/70 border-slate-600 hover:border-violet-400/60 text-slate-200'
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
                <p className="text-slate-300 leading-relaxed touch:text-sm">{q.explanation}</p>
                {q.relatedIds && q.relatedIds.filter((id) => kindOf(id)).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {q.relatedIds.filter((id) => kindOf(id)).map((id) => (
                      <button key={id} onClick={() => openById(id)} className="px-2 py-1 touch:px-3 touch:min-h-10 rounded border border-sky-500/30 bg-sky-500/10 text-sky-300 text-xs hover:bg-sky-500/20">{nameOf(id)}</button>
                    ))}
                  </div>
                )}
                <div className="flex justify-end mt-2">
                  <button
                    onClick={round.next}
                    className="px-3 py-1.5 touch:px-4 touch:min-h-10 rounded bg-violet-500 text-white text-xs touch:text-sm font-semibold hover:bg-violet-400"
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
            <div ref={(el) => { readRef.current = el; }} tabIndex={-1} className="text-3xl font-bold text-white focus:outline-none">{score}/{deck.length}</div>
            <p className="text-slate-400 mt-1">{score === deck.length ? 'Perfect round!' : score >= deck.length * 0.7 ? 'Strong work.' : 'Review the explanations and try again.'}</p>
            <div className="flex justify-center gap-2 mt-3">
              <button onClick={start} className="px-3 py-1.5 touch:min-h-10 rounded bg-violet-500 text-white font-semibold hover:bg-violet-400">New round</button>
              <button onClick={round.end} className="px-3 py-1.5 touch:min-h-10 rounded border border-slate-600 text-slate-300 hover:text-white">Change filters</button>
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
