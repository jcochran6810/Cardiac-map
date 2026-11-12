'use client';

import React, { useState } from 'react';
import { useAppStore, LEVEL_LABELS, type LearningLevel } from '@/store/useAppStore';
import { lessonKey, useCourseStore } from '@/store/useCourseStore';
import { useContent } from '@/lib/content';
import { courseProgress, coursesFor, nextLesson, startLesson } from '@/lib/courses';
import type { Course } from '@/types/course';
import { IconCheck, IconChevron, IconPlay } from '@/components/ui/icons';

const ROLES: LearningLevel[] = [1, 2, 3, 4, 5];
const LEVEL_TEXT: Record<Course['level'], { label: string; tone: string }> = {
  beginner: { label: 'Start here', tone: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10' },
  core: { label: 'Core', tone: 'text-sky-300 border-sky-500/40 bg-sky-500/10' },
  advanced: { label: 'Advanced', tone: 'text-violet-300 border-violet-500/40 bg-violet-500/10' },
};

/** The course list: short guided lessons, grouped into courses, with what is done and what comes next */
export default function CoursesScreen() {
  const lib = useContent();
  const role = useAppStore((s) => s.learningLevel);
  const setRole = useAppStore((s) => s.setLearningLevel);
  const progress = useCourseStore((s) => s.progress);
  const list = lib ? coursesFor(role, lib.courses) : [];
  // the first course with something left to do starts unfolded
  const firstOpen = list.find((c) => nextLesson(c, progress))?.id ?? list[0]?.id ?? null;
  const [open, setOpen] = useState<string | null | undefined>(undefined);
  const openId = open === undefined ? firstOpen : open;
  const mine = list.filter((c) => c.roles.includes(role));
  const others = list.filter((c) => !c.roles.includes(role));

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-cardiac-dark" aria-label="Courses">
      <div className="max-w-3xl mx-auto px-4 pt-4 pb-12 sm:px-6 sm:pt-7">
        <h1 className="text-xl sm:text-2xl font-semibold text-white">Courses</h1>
        <p className="mt-1 text-sm text-slate-300 leading-snug">
          Short guided lessons. Each step explains one idea in plain words, sets up the 3D heart and the ECG to show it, and checks you have it.
          Leave whenever you like — your place is kept.
        </p>

        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5">Courses for</div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Your role">
            {ROLES.map((l) => (
              <button
                key={l}
                onClick={() => { setRole(l); setOpen(undefined); }}
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

        {!lib && <p className="mt-8 text-sm text-slate-400">Loading the courses…</p>}

        <div className="mt-5 space-y-3">
          {mine.map((c) => <CourseCard key={c.id} course={c} open={openId === c.id} onToggle={() => setOpen(openId === c.id ? null : c.id)} />)}
        </div>
        {others.length > 0 && (
          <>
            <h2 className="mt-8 text-sm font-semibold text-white">More courses</h2>
            <p className="text-xs text-slate-400 mt-0.5">Written for other roles first — open to everyone.</p>
            <div className="mt-2.5 space-y-3">
              {others.map((c) => <CourseCard key={c.id} course={c} open={openId === c.id} onToggle={() => setOpen(openId === c.id ? null : c.id)} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CourseCard({ course, open, onToggle }: { course: Course; open: boolean; onToggle: () => void }) {
  const progress = useCourseStore((s) => s.progress);
  const { done, total, minutesLeft } = courseProgress(course, progress);
  const upNext = nextLesson(course, progress);
  const level = LEVEL_TEXT[course.level];
  const complete = done === total;
  return (
    <section className={`rounded-2xl border bg-cardiac-panel ${open ? 'border-slate-500' : 'border-slate-700'}`}>
      <button onClick={onToggle} aria-expanded={open} className="w-full text-left p-3.5 sm:p-4 flex items-start gap-3">
        <span className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${complete ? 'bg-emerald-500/20 text-emerald-300' : 'bg-cardiac-accent/15 text-cardiac-accent'}`}>
          {complete ? <IconCheck size={22} /> : <span className="text-sm font-bold tabular-nums">{done}/{total}</span>}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[15px] sm:text-base font-semibold text-white leading-tight">{course.title}</span>
            <span className={`px-1.5 py-0.5 rounded border text-[10px] uppercase tracking-wider ${level.tone}`}>{level.label}</span>
          </span>
          <span className="block mt-1 text-xs sm:text-[13px] text-slate-400 leading-snug">{course.summary}</span>
          <span className="mt-2 flex items-center gap-2">
            <span className="flex-1 h-1.5 rounded-full bg-cardiac-dark overflow-hidden">
              <span className="block h-full bg-emerald-500/80 transition-[width]" style={{ width: `${(done / Math.max(1, total)) * 100}%` }} />
            </span>
            <span className="text-[11px] text-slate-500 whitespace-nowrap">
              {complete ? 'Finished' : `${total - done} lesson${total - done === 1 ? '' : 's'} · about ${minutesLeft} min left`}
            </span>
          </span>
        </span>
        <IconChevron size={18} className={`shrink-0 mt-1 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <ol className="px-2 pb-2 sm:px-3 sm:pb-3">
          {course.lessons.map((l, k) => {
            const p = progress[lessonKey(course.id, l.id)];
            const isNext = upNext?.id === l.id;
            const started = !!p && !p.done && p.step > 0;
            return (
              <li key={l.id}>
                <button
                  onClick={() => startLesson(course.id, l.id)}
                  className={`w-full text-left flex items-center gap-3 px-2.5 py-2.5 rounded-xl border transition-colors ${
                    isNext ? 'border-cardiac-accent/50 bg-cardiac-accent/10 hover:border-cardiac-accent' : 'border-transparent hover:bg-cardiac-surface/50'
                  }`}
                >
                  <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                    p?.done ? 'bg-emerald-500/25 text-emerald-300' : isNext ? 'bg-cardiac-accent text-slate-950' : 'bg-cardiac-dark text-slate-400 border border-slate-600'
                  }`}>
                    {p?.done ? <IconCheck size={15} /> : k + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-white leading-tight">{l.title}</span>
                    <span className="block mt-0.5 text-xs text-slate-400 leading-snug">{l.goal}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[11px] text-slate-500 whitespace-nowrap">{l.minutes} min</span>
                    {p?.done && p.total > 0 && <span className="block text-[11px] text-emerald-300/90 whitespace-nowrap">{p.correct}/{p.total} right</span>}
                    {started && <span className="block text-[11px] text-cardiac-accent whitespace-nowrap">step {p.step + 1} of {l.steps.length}</span>}
                  </span>
                  <span className={`shrink-0 hidden xs:flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs font-semibold ${isNext ? 'bg-cardiac-accent text-slate-950' : 'border border-slate-600 text-slate-200'}`}>
                    {!p?.done && <IconPlay size={14} />}{p?.done ? 'Review' : started ? 'Continue' : 'Start'}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
