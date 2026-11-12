'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useCourseStore, type StepAnswer } from '@/store/useCourseStore';
import { useAppStore, LEVEL_LABELS } from '@/store/useAppStore';
import { useSceneStore } from '@/store/useSceneStore';
import { useECGStore } from '@/store/useECGStore';
import { useContent } from '@/lib/content';
import { checksIn, exitLesson, findLesson, finishLesson, gotoStep, optionOrder, pickableOnHeart, startLesson } from '@/lib/courses';
import { kindOf, nameOf, openById } from '@/lib/actions';
import { goBack, useBackNavStore } from '@/lib/backNav';
import type { StepCheck } from '@/types/course';
import { IconBack, IconCheck, IconChevron, IconClose } from '@/components/ui/icons';

/** after this many wrong taps the answer is shown on the heart / the 12-lead */
const TRIES = 2;

/** Leave the lesson for the screen it was opened from (the course list or the main menu), like the Back button */
function leave() {
  const prev = useBackNavStore.getState().previous;
  if (prev && !prev.lesson && (prev.mode === 'courses' || prev.mode === 'home')) goBack();
  else exitLesson();
}

const KIND_LABEL: Record<string, string> = {
  structure: 'Anatomy', condition: 'Condition', procedure: 'Procedure', medication: 'Drug', cathlab: 'Cath lab', case: 'Case study',
};

/**
 * A lesson, one step at a time: what to know, what to look at on the heart or the tracing beside it,
 * and a quick check. Sits beside the pictures on wide screens and between them on upright phones and tablets.
 */
export default function LessonPlayer({ style, side = false }: { style?: React.CSSProperties; side?: boolean }) {
  const lib = useContent();
  const active = useCourseStore((s) => s.active);
  const answers = useCourseStore((s) => s.answers);
  const finished = useCourseStore((s) => s.finished);
  const role = useAppStore((s) => s.learningLevel);
  const scrollRef = useRef<HTMLDivElement>(null);

  // a new step starts at its top
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [active?.step, finished]);

  const found = active && lib ? findLesson(active.course, active.lesson, lib.courses) : null;
  // a check is open (not answered, and its answer not yet shown): the app must not give the answer away elsewhere
  const at = found && active ? Math.min(active.step, found.lesson.steps.length - 1) : 0;
  const openCheck = found?.lesson.steps[at]?.check;
  const given = answers[at];
  const waiting = !!openCheck && !finished && !(given && (given.solved || openCheck.kind === 'choice' || given.tries >= TRIES));
  useEffect(() => {
    useECGStore.getState().setBlind('lesson', waiting);
    return () => useECGStore.getState().setBlind('lesson', false);
  }, [waiting]);
  // "tap the …" a part that can only be picked by its name tag: every tag is offered, even in a small view that would thin them out
  const view = useAppStore((s) => s.viewMode);
  const tapping = waiting && openCheck?.kind === 'tap' && !openCheck.targets.some((id) => pickableOnHeart(view, id));
  useEffect(() => {
    useSceneStore.getState().setAllLabels(tapping);
    return () => useSceneStore.getState().setAllLabels(false);
  }, [tapping]);
  if (!active) return null;
  if (!found) {
    return <aside style={style} className="h-full flex items-center justify-center bg-cardiac-panel text-sm text-slate-400">Loading the lesson…</aside>;
  }
  const { course, lesson, index } = found;
  const n = lesson.steps.length;
  const i = Math.min(active.step, n - 1);
  const step = lesson.steps[i];
  const answer = answers[i];
  const last = i === n - 1;
  const next = course.lessons[index + 1] ?? null;

  return (
    <aside
      style={style}
      className={`h-full min-h-0 min-w-0 flex flex-col bg-cardiac-panel ${side ? 'border-r border-slate-700 shrink-0' : 'w-full'}`}
      aria-label={`Lesson: ${lesson.title}`}
    >
      {/* ── where you are ── */}
      <header className="shrink-0 px-3 pt-2 pb-2 border-b border-slate-700/80">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wider text-cardiac-accent truncate">{course.title}</div>
            <div className="text-[13px] font-semibold text-white leading-tight truncate">{lesson.title}</div>
          </div>
          <span className="shrink-0 text-[11px] text-slate-400 tabular-nums" aria-label={`Step ${i + 1} of ${n}`}>{finished ? 'Done' : `${i + 1} / ${n}`}</span>
          <button
            onClick={leave}
            className="shrink-0 w-8 h-8 touch:w-10 touch:h-10 -mr-1 flex items-center justify-center rounded-md text-slate-400 hover:text-white hover:bg-cardiac-surface"
            aria-label="Leave the lesson (your place is kept)"
            title="Leave the lesson (your place is kept)"
          >
            <IconClose size={18} />
          </button>
        </div>
        <ol className="mt-1.5 flex gap-1" aria-hidden>
          {lesson.steps.map((s, k) => (
            <li key={k} className={`h-1 flex-1 rounded-full ${finished || k < i ? 'bg-emerald-500/80' : k === i ? 'bg-cardiac-accent' : 'bg-slate-700'}`} />
          ))}
        </ol>
      </header>

      {/* ── the step ── */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-3">
        {finished ? (
          <Finished
            lessonTitle={lesson.title}
            goal={lesson.goal}
            correct={Object.values(answers).filter((a) => a.ok).length}
            total={checksIn(lesson)}
            nextTitle={next?.title ?? null}
            onNext={() => next && startLesson(course.id, next.id, 0)}
            onAgain={() => startLesson(course.id, lesson.id, 0)}
            courseDone={!next}
            courseTitle={course.title}
          />
        ) : (
          <>
            <h2 className="text-lg sm:text-xl font-semibold text-white leading-snug">{step.title}</h2>
            <div className="mt-2 space-y-2.5">
              {step.text.map((p, k) => <p key={k} className="text-[15px] leading-relaxed text-slate-200">{p}</p>)}
            </div>
            {step.look && (
              <div className="mt-3 flex gap-2 p-2.5 rounded-lg bg-sky-500/10 border border-sky-500/30">
                <span className="shrink-0 mt-0.5 text-sky-300" aria-hidden><EyeIcon /></span>
                <p className="text-[13px] leading-snug text-sky-100"><span className="font-semibold">Look: </span>{step.look}</p>
              </div>
            )}
            {step.roleNote?.[role] && (
              <div className="mt-3 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                <div className="text-[10px] uppercase tracking-wider text-emerald-300">For {LEVEL_LABELS[role].short}</div>
                <p className="mt-0.5 text-[13px] leading-snug text-emerald-50">{step.roleNote[role]}</p>
              </div>
            )}
            {step.check && <Check key={`${lesson.id}-${i}`} step={i} check={step.check} answer={answer} />}
            {step.more && step.more.length > 0 && (!step.check || answer) && <More ids={step.more} />}
          </>
        )}
      </div>

      {/* ── back / next ── */}
      {!finished && (
        <footer className="shrink-0 flex items-center gap-2 px-3 py-2 border-t border-slate-700/80 bg-cardiac-panel">
          <button
            onClick={() => gotoStep(i - 1)}
            disabled={i === 0}
            className="h-10 px-3 rounded-lg border border-slate-600 text-sm text-slate-200 hover:bg-cardiac-surface disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <IconBack size={16} /> Back
          </button>
          <span className="flex-1 text-[11px] text-slate-500 text-center truncate">{waiting ? 'Answer the question — or skip it' : ''}</span>
          <button
            onClick={() => (last ? finishLesson() : gotoStep(i + 1))}
            className={`h-10 px-4 rounded-lg text-sm font-semibold flex items-center gap-1 ${
              waiting ? 'border border-slate-600 text-slate-200 hover:bg-cardiac-surface' : 'bg-cardiac-accent text-slate-950 hover:bg-amber-400'
            }`}
          >
            {waiting ? 'Skip' : last ? 'Finish' : 'Next'} <IconChevron size={16} />
          </button>
        </footer>
      )}
    </aside>
  );
}

// ─── The check at the end of a step ────────────────────────────────────────

function Check({ step, check, answer }: { step: number; check: StepCheck; answer: StepAnswer | undefined }) {
  // for tap / lead checks: the name of what was tapped wrongly last
  const [wrong, setWrong] = useState<string | null>(null);
  const solved = !!answer?.solved;
  const revealed = !solved && !!answer && answer.tries >= TRIES;

  // "Tap the …": listen for picks on the 3D heart
  useEffect(() => {
    if (check.kind !== 'tap' || solved || revealed) return;
    return useSceneStore.subscribe((s, prev) => {
      const id = s.selectedStructureId;
      if (!id || id === prev.selectedStructureId) return;
      const right = check.targets.includes(id as never);
      const a = useCourseStore.getState().answer(step, right);
      if (right) setWrong(null);
      else {
        setWrong(nameOf(id));
        // out of tries: show it on the heart
        if (a.tries >= TRIES) useSceneStore.getState().selectStructure(check.targets[0]);
      }
    });
  }, [check, step, solved, revealed]);

  // "Tap a lead that …": listen for picks on the 12-lead
  useEffect(() => {
    if (check.kind !== 'lead' || solved || revealed) return;
    return useECGStore.subscribe((s, prev) => {
      const lead = s.selectedLead;
      if (!lead || lead === prev.selectedLead) return;
      const right = check.targets.includes(lead);
      const a = useCourseStore.getState().answer(step, right);
      if (right) setWrong(null);
      else {
        setWrong(`lead ${lead}`);
        if (a.tries >= TRIES) useECGStore.setState({ selectedLead: check.targets[0] });
      }
    });
  }, [check, step, solved, revealed]);

  const done = check.kind === 'choice' ? !!answer : solved || revealed;
  const right = check.kind === 'choice' ? !!answer?.ok : solved;

  return (
    <section className="mt-4 p-3 rounded-xl bg-cardiac-dark/70 border border-slate-600" aria-live="polite">
      <div className="text-[10px] uppercase tracking-wider text-cardiac-accent">Check</div>
      <p className="mt-0.5 text-[15px] font-semibold text-white leading-snug">{check.question}</p>

      {check.kind === 'choice' && (
        <div className="mt-2.5 grid gap-1.5">
          {optionOrder(check.question, check.options.length, check.fixed).map((k) => {
            const o = check.options[k];
            const picked = answer?.picked === k;
            const isAnswer = k === check.answer;
            const tone = !answer ? 'border-slate-600 text-slate-100 hover:border-slate-400 hover:bg-cardiac-surface/60'
              : isAnswer ? 'border-emerald-500/70 bg-emerald-500/15 text-emerald-50'
                : picked ? 'border-rose-500/70 bg-rose-500/15 text-rose-50' : 'border-slate-700 text-slate-400';
            return (
              <button
                key={k}
                disabled={!!answer}
                onClick={() => useCourseStore.getState().answer(step, isAnswer, k)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm leading-snug transition-colors flex items-start gap-2 ${tone}`}
              >
                <span className="flex-1">{o}</span>
                {answer && isAnswer && <IconCheck size={16} className="shrink-0 mt-0.5 text-emerald-300" />}
                {answer && picked && !isAnswer && <IconClose size={16} className="shrink-0 mt-0.5 text-rose-300" />}
              </button>
            );
          })}
        </div>
      )}

      {check.kind !== 'choice' && !done && (
        <p className="mt-2 text-[13px] text-slate-300">
          {check.kind === 'tap' ? 'Tap it on the 3D heart (or tap its name tag).' : 'Tap the lead on the 12-lead.'}
          {wrong && <span className="block mt-1 text-rose-300">That is the {wrong}. Try again.</span>}
        </p>
      )}

      {done && (
        <div className={`mt-2.5 p-2.5 rounded-lg text-[13px] leading-snug ${right ? 'bg-emerald-500/10 text-emerald-50' : 'bg-rose-500/10 text-rose-50'}`}>
          <span className="font-semibold">
            {right ? (answer && answer.tries > 1 ? 'Right. ' : 'Correct. ') : check.kind === 'choice' ? 'Not quite. ' : 'It is ringed for you now. '}
          </span>
          {check.explain}
        </div>
      )}
    </section>
  );
}

// ─── Where to read more ────────────────────────────────────────────────────

function More({ ids }: { ids: string[] }) {
  const open = (id: string) => {
    // leave the lesson (its place is kept) and open the library page; Back returns to the lesson
    exitLesson('stay');
    openById(id);
  };
  return (
    <section className="mt-4">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">Read more in the library</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {ids.map((id) => (
          <button key={id} onClick={() => open(id)} className="px-2.5 py-1.5 rounded-lg border border-slate-600 text-xs text-slate-200 hover:border-sky-400 hover:text-white">
            <span className="text-slate-500">{KIND_LABEL[kindOf(id) ?? ''] ?? ''}</span> {nameOf(id)}
          </button>
        ))}
      </div>
    </section>
  );
}

// ─── Lesson finished ───────────────────────────────────────────────────────

function Finished({ lessonTitle, goal, correct, total, nextTitle, onNext, onAgain, courseDone, courseTitle }: {
  lessonTitle: string; goal: string; correct: number; total: number; nextTitle: string | null;
  onNext: () => void; onAgain: () => void; courseDone: boolean; courseTitle: string;
}) {
  const all = total > 0 && correct === total;
  return (
    <div className="py-2 text-center">
      <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-300"><IconCheck size={30} /></div>
      <h2 className="mt-3 text-xl font-semibold text-white">Lesson complete</h2>
      <p className="mt-1 text-sm text-slate-300">{lessonTitle}</p>
      {total > 0 && (
        <p className="mt-3 text-[15px] text-slate-100">
          <span className="text-2xl font-bold tabular-nums text-white">{correct}</span>
          <span className="text-slate-400"> of {total} checks right first time</span>
        </p>
      )}
      <p className="mt-3 text-[13px] text-slate-400 leading-snug max-w-sm mx-auto">You should now be able to: {goal.charAt(0).toLowerCase() + goal.slice(1)}</p>
      {courseDone && <p className="mt-3 text-sm font-semibold text-emerald-300">That was the last lesson of “{courseTitle}”.</p>}
      <div className="mt-4 grid gap-2 max-w-xs mx-auto">
        {nextTitle && (
          <button onClick={onNext} className="h-11 px-4 rounded-lg bg-cardiac-accent text-slate-950 text-sm font-semibold hover:bg-amber-400">
            Next lesson: {nextTitle} →
          </button>
        )}
        <button onClick={() => exitLesson()} className={`h-11 px-4 rounded-lg text-sm font-semibold ${nextTitle ? 'border border-slate-600 text-slate-200 hover:bg-cardiac-surface' : 'bg-cardiac-accent text-slate-950 hover:bg-amber-400'}`}>
          Back to the courses
        </button>
        {!all && <button onClick={onAgain} className="h-10 px-4 rounded-lg text-sm text-slate-300 hover:text-white">Do this lesson again</button>}
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
