import { describe, expect, it } from 'vitest';
import { summarize } from '@/lib/progress';
import { DRILL_SETS, MASTERED, statKey } from '@/lib/drill';
import type { Course } from '@/types/course';

const lesson = (id: string) => ({ id, title: id, goal: 'A goal for this lesson.', minutes: 5, steps: [] });
const COURSES: Course[] = [
  { id: 'a', title: 'A', summary: '', roles: [1], level: 'beginner', lessons: [lesson('one'), lesson('two')] },
  { id: 'b', title: 'B', summary: '', roles: [2], level: 'core', lessons: [lesson('one')] },
];
const done = { step: 0, done: true, correct: 1, total: 2, at: 1 };
const rhythms = DRILL_SETS.reduce((n, s) => n + s.items.length, 0);

describe('progress summary', () => {
  it('is empty for a new learner', () => {
    const p = summarize({ courses: COURSES, lessonProgress: {}, drillStats: {}, caseIds: ['x', 'y'], best: {}, role: 2, quizAttempts: [] });
    expect(p.empty).toBe(true);
    expect(p).toMatchObject({ lessons: { done: 0, total: 3 }, rhythms: { mastered: 0, total: rhythms }, cases: { done: 0, total: 2, average: null }, quiz: { answered: 0, right: 0 } });
  });

  it('counts finished lessons, mastered rhythms, this role\'s case scores and the recent quiz answers', () => {
    const attempts = [...Array(60).fill({ correct: false }), ...Array(40).fill({ correct: true })];
    const p = summarize({
      courses: COURSES,
      lessonProgress: { 'a/one': done, 'a/two': { ...done, done: false, step: 3 }, 'b/one': done, 'gone/lesson': done },
      drillStats: { [statKey('core', 'vf')]: { seen: 4, right: 4, box: MASTERED }, [statKey('core', 'vt')]: { seen: 2, right: 1, box: 1 } },
      caseIds: ['x', 'y', 'z'],
      // another role's score for the same case does not count
      best: { 'x:2': 80, 'y:2': 91, 'z:1': 100 },
      role: 2,
      quizAttempts: attempts,
    });
    expect(p.empty).toBe(false);
    expect(p.lessons).toEqual({ done: 2, total: 3 });
    expect(p.rhythms.mastered).toBe(1);
    expect(p.cases).toEqual({ done: 2, total: 3, average: 86 });
    // only the last 50 answers: 10 wrong, then 40 right
    expect(p.quiz).toEqual({ answered: 50, right: 40 });
  });

  it('is not empty once anything at all has been tried', () => {
    const base = { courses: COURSES, lessonProgress: {}, drillStats: {}, caseIds: [], best: {}, role: 1, quizAttempts: [] };
    expect(summarize({ ...base, quizAttempts: [{ correct: false }] }).empty).toBe(false);
    expect(summarize({ ...base, drillStats: { [statKey('core', 'vf')]: { seen: 1, right: 0, box: 0 } } }).empty).toBe(false);
  });
});
