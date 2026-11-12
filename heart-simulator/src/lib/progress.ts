/**
 * What the learner has done so far, across the whole app, for the main menu's progress strip.
 * Pure: the stores hand in what they keep on the device.
 */
import type { Course } from '@/types/course';
import type { LessonProgress } from '@/store/useCourseStore';
import { DRILL_SETS, mastery, type DrillStats } from '@/lib/drill';

export interface ProgressSummary {
  lessons: { done: number; total: number };
  rhythms: { mastered: number; total: number };
  /** simulator cases offered to this role: how many have a score, and the average of the best scores */
  cases: { done: number; total: number; average: number | null };
  /** the most recent quiz answers (up to 50) */
  quiz: { answered: number; right: number };
  /** nothing done anywhere yet */
  empty: boolean;
}

export function summarize(input: {
  courses: Course[];
  lessonProgress: Record<string, LessonProgress>;
  drillStats: DrillStats;
  /** ids of the simulator cases this role can play */
  caseIds: string[];
  /** best score per "scenarioId:role" */
  best: Record<string, number>;
  role: number;
  quizAttempts: { correct: boolean }[];
}): ProgressSummary {
  let lessonsDone = 0;
  let lessonsTotal = 0;
  for (const c of input.courses) {
    for (const l of c.lessons) {
      lessonsTotal++;
      if (input.lessonProgress[`${c.id}/${l.id}`]?.done) lessonsDone++;
    }
  }
  let mastered = 0;
  let rhythms = 0;
  for (const s of DRILL_SETS) {
    const m = mastery(s, input.drillStats);
    mastered += m.mastered;
    rhythms += m.total;
  }
  const scores = input.caseIds.map((id) => input.best[`${id}:${input.role}`]).filter((x): x is number => typeof x === 'number');
  const recent = input.quizAttempts.slice(-50);
  const right = recent.filter((a) => a.correct).length;
  return {
    lessons: { done: lessonsDone, total: lessonsTotal },
    rhythms: { mastered, total: rhythms },
    cases: { done: scores.length, total: input.caseIds.length, average: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null },
    quiz: { answered: recent.length, right },
    empty: lessonsDone === 0 && mastered === 0 && scores.length === 0 && recent.length === 0 && Object.keys(input.drillStats).length === 0,
  };
}
