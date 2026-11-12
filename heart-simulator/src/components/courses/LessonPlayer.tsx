'use client';

import React, { useEffect, useRef, useState } from 'react';
import { lessonKey, useCourseStore, type StepAnswer } from '@/store/useCourseStore';
import { useAppStore, LEVEL_LABELS } from '@/store/useAppStore';
import { useSceneStore } from '@/store/useSceneStore';
import { useECGStore } from '@/store/useECGStore';
import { useContent } from '@/lib/content';
import {
  checkHidesRhythm, checksIn, drawersFor, effectiveShow, exitLesson, findLesson, finishLesson, gotoStep, isApplyingStep, midSentence, openLesson,
  optionOrder, pickableOnHeart, startLesson, thatIs,
} from '@/lib/courses';
import { ALL_LEADS } from '@/lib/ecg/vector';
import { PLACEMENT_PRESETS, STANDARD_PLACEMENT, applyPreset } from '@/lib/ecg/electrodes';
import { applyPlacement } from '@/lib/ecg/placement';
import { kindOf, nameOf, openById } from '@/lib/actions';
import { goBack, useBackNavStore } from '@/lib/backNav';
import type { LessonStep, StepCheck } from '@/types/course';
import { IconBack, IconCheck, IconChevron, IconClose } from '@/components/ui/icons';

/** after this many wrong taps the answer is shown on the heart / the 12-lead */
const TRIES = 2;

/** Leave the lesson for the screen it was opened from (the course list or the main menu), like the Back button */
function leave() {
  const prev = useBackNavStore.getState().previous;
  if (prev && !prev.lesson && (prev.mode === 'courses' || prev.mode === 'home')) goBack();
  else exitLesson();
}

/** The result card's "Back to the courses": the course list, whether the lesson was opened from it or from the main menu */
function toCourses() {
  const prev = useBackNavStore.getState().previous;
  if (prev && !prev.lesson && !prev.overlay && prev.mode === 'courses') goBack();
  else exitLesson('courses');
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
  // a result card shown again (Back to a finished lesson), not one reached by finishing a run just now
  const restored = useCourseStore((s) => s.restored);
  // the lesson's saved progress: its best finished run, for a restored result card whose own answers are not known
  const saved = useCourseStore((s) => (s.active ? s.progress[lessonKey(s.active.course, s.active.lesson)] : undefined));
  const role = useAppStore((s) => s.learningLevel);
  const scrollRef = useRef<HTMLDivElement>(null);

  const titleRef = useRef<HTMLHeadingElement>(null);
  // a new step starts at its top, and a screen reader hears its title (focus moves there after Next or Back)
  const firstStep = useRef(true);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    if (firstStep.current) { firstStep.current = false; return; }
    titleRef.current?.focus({ preventScroll: true });
  }, [active?.step, finished]);

  const found = active && lib ? findLesson(active.course, active.lesson, lib.courses) : null;
  // a check is open (not answered, and its answer not yet shown): the app must not give the answer away elsewhere
  const at = found && active ? Math.min(active.step, found.lesson.steps.length - 1) : 0;
  const openStep = found?.lesson.steps[at];
  const openCheck = openStep?.check;
  const given = answers[at];
  const waiting = !!openCheck && !finished && !(given && (given.solved || openCheck.kind === 'choice' || given.tries >= TRIES));
  // the rhythm's name (and the cycle box) go only for a question the name would answer — never for "tap the …" on the heart
  const hides = waiting && !!found && checkHidesRhythm(openStep, effectiveShow(found.lesson.steps, at).rhythm);
  useEffect(() => {
    useECGStore.getState().setBlind('lesson', hides);
    return () => useECGStore.getState().setBlind('lesson', false);
  }, [hides]);
  // "work out the rate": the rate numbers go too
  const hideRate = waiting && openCheck?.kind === 'choice' && !!openCheck.hideRate;
  useEffect(() => {
    useECGStore.getState().setRateHidden(hideRate);
    return () => useECGStore.getState().setRateHidden(false);
  }, [hideRate]);
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
            <div className="text-[11px] uppercase tracking-wider text-cardiac-accent truncate">{course.title}</div>
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
            steps={lesson.steps}
            answers={answers}
            total={checksIn(lesson)}
            best={restored && saved?.done && saved.total === checksIn(lesson) ? saved.correct : null}
            nextTitle={next?.title ?? null}
            // the next lesson resumes where it was left if a run is under way; a finished one starts from the top
            onNext={() => next && openLesson(course.id, next.id)}
            onAgain={() => startLesson(course.id, lesson.id, 0)}
            courseDone={!next}
            courseTitle={course.title}
          />
        ) : (
          <>
            <h2 ref={titleRef} tabIndex={-1} className="text-lg sm:text-xl font-semibold text-white leading-snug outline-none">{step.title}</h2>
            <div className="mt-2 space-y-2.5">
              {step.text.map((p, k) => <p key={k} className="text-[15px] leading-relaxed text-slate-200">{p}</p>)}
            </div>
            {step.look && (
              <div className="mt-3 flex gap-2 p-2.5 rounded-lg bg-sky-500/10 border border-sky-500/30">
                <span className="shrink-0 mt-0.5 text-sky-300" aria-hidden><EyeIcon /></span>
                <div className="min-w-0">
                  <p className="text-[13px] leading-snug text-sky-100"><span className="font-semibold">Look: </span>{step.look}</p>
                  <LabShortcuts look={step.look} lab={effectiveShow(lesson.steps, i).ecg === 'lab'} />
                  <OtherPicture steps={lesson.steps} index={i} />
                </div>
              </div>
            )}
            {step.roleNote?.[role] && (
              <div className="mt-3 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                <div className="text-[11px] uppercase tracking-wider text-emerald-300">For {LEVEL_LABELS[role].short}</div>
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
          <span className="flex-1 min-w-0 text-[12px] text-slate-400 text-center truncate">{waiting ? 'Answer, or skip' : ''}</span>
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
  // tapped the heart's surface where only name tags can be picked (an artery, a node): not held against the learner
  const [surface, setSurface] = useState<string | null>(null);
  const boxRef = useRef<HTMLElement>(null);
  const solved = !!answer?.solved;
  const revealed = !solved && !!answer && answer.tries >= TRIES;
  const view = useAppStore((s) => s.viewMode);
  // can any right answer be picked by tapping the heart itself, or only by its name tag?
  const byTagOnly = check.kind === 'tap' && !check.targets.some((id) => pickableOnHeart(view, id));
  // after a tap on the heart or the tracing the feedback may be below the fold (an upright phone): bring it into view
  const showFeedback = () => requestAnimationFrame(() => boxRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));

  // "Tap the …": every tap on the 3D heart or a name tag counts — also a second tap on the same tag, or a tap on
  // the part the step itself ringed (the selection does not change, but the count of selections does)
  useEffect(() => {
    if (check.kind !== 'tap' || solved || revealed) return;
    // ringing the answer after the last wrong try is the lesson pointing, not the learner tapping
    let revealing = false;
    return useSceneStore.subscribe((s, prev) => {
      const id = s.selectedStructureId;
      if (s.selectCount === prev.selectCount || !id || isApplyingStep() || revealing) return;
      const right = check.targets.includes(id as never);
      // the answer has no surface of its own to tap (an artery, part of the wiring): a tap that landed on the chamber
      // underneath is a near miss on the name tag, not a wrong answer
      if (!right && byTagOnly && pickableOnHeart(view, id)) {
        setWrong(null);
        setSurface(midSentence(nameOf(id)));
        showFeedback();
        return;
      }
      setSurface(null);
      const a = useCourseStore.getState().answer(step, right);
      if (right) setWrong(null);
      else {
        setWrong(thatIs(nameOf(id)));
        // out of tries: show it on the heart
        if (a.tries >= TRIES) {
          revealing = true;
          try { useSceneStore.getState().selectStructure(check.targets[0]); } finally { revealing = false; }
        }
      }
      showFeedback();
    });
  }, [check, step, solved, revealed, byTagOnly, view]);

  // "Tap a lead that …": every tap on a lead counts, even one that turns an outlined lead's outline off
  useEffect(() => {
    if (check.kind !== 'lead' || solved || revealed) return;
    return useECGStore.subscribe((s, prev) => {
      const tap = s.leadTap;
      if (!tap || tap === prev.leadTap || isApplyingStep()) return;
      const lead = tap.lead;
      const right = check.targets.includes(lead as never);
      const a = useCourseStore.getState().answer(step, right);
      // the tapped lead stays outlined (a tap on the lead the step outlined would otherwise clear it)
      if (s.selectedLead !== lead) useECGStore.setState({ selectedLead: lead });
      if (right) setWrong(null);
      else {
        setWrong(`That is lead ${lead}`);
        if (a.tries >= TRIES) useECGStore.setState({ selectedLead: check.targets[0] });
      }
      showFeedback();
    });
  }, [check, step, solved, revealed]);

  const done = check.kind === 'choice' ? !!answer : solved || revealed;
  const right = check.kind === 'choice' ? !!answer?.ok : solved;

  return (
    <section ref={boxRef} className="mt-4 p-3 rounded-xl bg-cardiac-dark/70 border border-slate-600 scroll-mb-2" aria-live="polite">
      <div className="text-[11px] uppercase tracking-wider text-cardiac-accent">Check</div>
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
          {check.kind === 'tap' ? (byTagOnly ? 'Tap its name tag on the 3D heart.' : 'Tap it on the 3D heart (or tap its name tag).') : 'Tap the lead on the 12-lead, or pick it below.'}
          {wrong && <span className="block mt-1 text-rose-300">{wrong}. Try again.</span>}
          {surface && <span className="block mt-1 text-amber-200">You tapped the surface of the {surface}. Tap the name tag of the part you mean.</span>}
        </p>
      )}

      {/* the leads as buttons too: for the keyboard and screen readers, and for a screen where the 12-lead is small or hidden */}
      {check.kind === 'lead' && !done && (
        <div className="mt-2 grid grid-cols-6 gap-1" role="group" aria-label="Leads">
          {ALL_LEADS.map((l) => (
            <button
              key={l}
              onClick={() => useECGStore.getState().selectLead(l)}
              className="h-9 touch:h-10 rounded-md border border-slate-600 text-[13px] font-semibold text-slate-100 hover:border-slate-400 hover:bg-cardiac-surface/60"
            >
              {l}
            </button>
          ))}
        </div>
      )}

      {done && (
        <div className={`mt-2.5 p-2.5 rounded-lg text-[13px] leading-snug ${right ? 'bg-emerald-500/10 text-emerald-50' : 'bg-rose-500/10 text-rose-50'}`}>
          <span className="font-semibold">
            {right ? (answer && answer.tries > 1 ? 'Right. ' : 'Correct. ')
              : check.kind === 'choice' ? 'Not quite. ' : check.kind === 'lead' ? 'It is outlined for you now. ' : 'It is ringed for you now. '}
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
      <div className="text-[11px] uppercase tracking-wider text-slate-400">Read more in the library</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {ids.map((id) => (
          <button key={id} onClick={() => open(id)} className="px-2.5 py-1.5 rounded-lg border border-slate-600 text-xs text-slate-200 hover:border-sky-400 hover:text-white">
            <span className="text-slate-400">{KIND_LABEL[kindOf(id) ?? ''] ?? ''}</span> {nameOf(id)}
          </button>
        ))}
      </div>
    </section>
  );
}

// ─── Lesson finished ───────────────────────────────────────────────────────

function Finished({ lessonTitle, goal, steps, answers, total, best, nextTitle, onNext, onAgain, courseDone, courseTitle }: {
  lessonTitle: string; goal: string; steps: LessonStep[]; answers: Record<number, StepAnswer>; total: number;
  /** the best finished run's score, for a result card shown again (null: none saved, or the card of a run just finished) */
  best: number | null;
  nextTitle: string | null; onNext: () => void; onAgain: () => void; courseDone: boolean; courseTitle: string;
}) {
  // A card shown again with no answers kept (progress saved by an older version): the score is the best run's, and no
  // check is listed as skipped on the strength of answers that are simply not known. The card of a run just finished
  // (best is null) always scores and lists that run's own answers, every check skipped included.
  const known = Object.keys(answers).length > 0 || best === null;
  const correct = known ? steps.filter((s, k) => s.check && answers[k]?.ok).length : best ?? 0;
  // the checks to look at again: answered wrong at the first try, or skipped
  const review = known ? steps.flatMap((s, k) => (s.check && !answers[k]?.ok ? [{ k, title: s.title, skipped: !answers[k] }] : [])) : [];
  return (
    <div className="py-2 text-center">
      <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-300"><IconCheck size={30} /></div>
      <h2 className="mt-3 text-xl font-semibold text-white">Lesson complete</h2>
      <p className="mt-1 text-sm text-slate-300">{lessonTitle}</p>
      {total > 0 && (
        <p className="mt-3 text-[15px] text-slate-100">
          <span className="text-2xl font-bold tabular-nums text-white">{correct}</span>
          <span className="text-slate-400"> of {total} checks right first time{known ? '' : ' (your best run)'}</span>
        </p>
      )}
      <div className="mt-4 grid gap-2 max-w-xs mx-auto">
        {nextTitle && (
          <button onClick={onNext} className="min-h-11 px-4 py-2 rounded-lg bg-cardiac-accent text-slate-950 text-sm font-semibold hover:bg-amber-400 leading-snug">
            Next lesson: {nextTitle}&nbsp;→
          </button>
        )}
        <button onClick={toCourses} className={`h-11 px-4 rounded-lg text-sm font-semibold ${nextTitle ? 'border border-slate-600 text-slate-200 hover:bg-cardiac-surface' : 'bg-cardiac-accent text-slate-950 hover:bg-amber-400'}`}>
          Back to the courses
        </button>
        <button onClick={onAgain} className="h-10 px-4 rounded-lg text-sm text-slate-300 hover:text-white">Do this lesson again</button>
      </div>
      {review.length > 0 && (
        <div className="mt-4 max-w-sm mx-auto text-left">
          <div className="text-[11px] uppercase tracking-wider text-slate-400">Worth another look</div>
          <ul className="mt-1.5 grid gap-1">
            {review.map((r) => (
              <li key={r.k}>
                <button onClick={() => gotoStep(r.k)} className="w-full min-h-10 px-2.5 py-1.5 rounded-lg border border-slate-600 text-left text-[13px] text-slate-200 hover:border-sky-400 hover:text-white flex items-center gap-2">
                  <span className="shrink-0 text-slate-400 tabular-nums">Step {r.k + 1}</span>
                  <span className="flex-1 min-w-0 truncate">{r.title}</span>
                  <span className={`shrink-0 text-[11px] ${r.skipped ? 'text-slate-400' : 'text-rose-300'}`}>{r.skipped ? 'skipped' : 'missed'}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-4 text-[13px] text-slate-400 leading-snug max-w-sm mx-auto">You should now be able to: {goal.charAt(0).toLowerCase() + goal.slice(1)}</p>
      {courseDone && <p className="mt-3 text-sm font-semibold text-emerald-300">That was the last lesson of “{courseTitle}”.</p>}
    </div>
  );
}

// ─── The electrode lab's buttons, in the step ──────────────────────────────

/**
 * A step in the electrode lab that says "Tap "LA ↔ RA"" gets that button here too: on a small screen the lab's own
 * buttons are below the patient, out of sight.
 */
function LabShortcuts({ look, lab }: { look: string; lab: boolean }) {
  const placement = useECGStore((s) => s.placement);
  if (!lab) return null;
  const presets = PLACEMENT_PRESETS.filter((p) => look.includes(`"${p.label}"`));
  const reset = look.includes('"Reset placement"');
  if (!presets.length && !reset) return null;
  const on = (p: (typeof PLACEMENT_PRESETS)[number]) => JSON.stringify(placement) === JSON.stringify(applyPreset(p));
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {presets.map((p) => (
        <button
          key={p.id}
          onClick={() => applyPlacement(applyPreset(p))}
          aria-pressed={on(p)}
          className={`min-h-9 px-2.5 rounded-md border text-[12px] font-semibold ${on(p) ? 'border-amber-400 bg-amber-500/20 text-amber-100' : 'border-sky-500/50 text-sky-100 hover:bg-sky-500/15'}`}
        >
          {p.label}
        </button>
      ))}
      {reset && (
        <button onClick={() => applyPlacement(STANDARD_PLACEMENT)} className="min-h-9 px-2.5 rounded-md border border-sky-500/50 text-[12px] font-semibold text-sky-100 hover:bg-sky-500/15">
          Reset placement
        </button>
      )}
    </div>
  );
}

// ─── The other picture, on a phone on its side ─────────────────────────────

/**
 * A phone on its side shows one picture beside the lesson. When the step uses both but only one is open (the
 * learner closed one, or the step's own pick), offer the other: the two then sit side by side.
 */
function OtherPicture({ steps, index }: { steps: LessonStep[]; index: number }) {
  const short = useAppStore((s) => s.short);
  const heart = useAppStore((s) => s.heart);
  const ecg = useAppStore((s) => s.ecg);
  // the closed bottom panel is named by what it would open on
  const panel = useECGStore((s) => (s.bottomView === 'ecg' ? (s.electrodeLab ? 'lab' : s.layout === 'monitor' ? 'monitor' : 'ecg') : s.bottomView));
  if (!short) return null;
  const want = drawersFor(effectiveShow(steps, index), false);
  if (!want.heart || !want.ecg) return null;
  const missing = heart === 'closed' ? 'heart' : ecg === 'closed' ? 'ecg' : null;
  if (!missing) return null;
  return (
    <button
      onClick={() => (missing === 'heart' ? useAppStore.getState().setHeart('full') : useAppStore.getState().setEcg('full'))}
      className="mt-1.5 min-h-9 px-2.5 rounded-md border border-sky-500/50 text-[12px] font-semibold text-sky-100 hover:bg-sky-500/15"
    >
      {missing === 'heart' ? 'Show the 3D heart too' : `Show the ${PANEL_NAME[panel]} too`}
    </button>
  );
}

const PANEL_NAME = { ecg: 'ECG', monitor: 'monitor', lab: 'electrode lab', wiggers: 'pressure & volume', defib: 'defibrillator' } as const;

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
