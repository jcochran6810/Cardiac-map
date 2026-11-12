import { create } from 'zustand';

/**
 * Guided courses: the lesson being taken, and what has been finished (kept on this device).
 * The lessons themselves are in `src/data/courses/`; what a step shows is applied by `src/lib/courses.ts`.
 */
export interface LessonProgress {
  /** the step the learner had reached (to resume) */
  step: number;
  done: boolean;
  /** checks answered right at the first try, of all the checks in the lesson (the best finished run) */
  correct: number;
  total: number;
  /** when it was last opened (ms since 1970), to offer "continue" */
  at: number;
}

export interface StepAnswer {
  /** right at the first try */
  ok: boolean;
  /** answered right in the end (after however many tries) */
  solved: boolean;
  tries: number;
  /** choice checks: the option picked first */
  picked?: number;
}

export interface ActiveLesson {
  course: string;
  lesson: string;
  step: number;
}

interface CourseState {
  active: ActiveLesson | null;
  /** answers given in this run of the active lesson, by step index */
  answers: Record<number, StepAnswer>;
  /** the last step is done: the lesson's result card is showing */
  finished: boolean;
  progress: Record<string, LessonProgress>;

  begin: (course: string, lesson: string, step: number) => void;
  setStep: (step: number) => void;
  /** record one try at the current step's check; returns the answer so far */
  answer: (step: number, right: boolean, picked?: number) => StepAnswer;
  /** the learner finished the last step: store the result (`total` checks in the lesson) */
  finish: (total: number) => void;
  /** leave the lesson (progress so far is kept) */
  end: () => void;
  resetProgress: () => void;
}

const KEY = 'cardiosim.courses.v1';
export const lessonKey = (course: string, lesson: string) => `${course}/${lesson}`;

function load(): Record<string, LessonProgress> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, LessonProgress>) : {};
  } catch {
    return {};
  }
}

function save(progress: Record<string, LessonProgress>) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    /* storage unavailable (private mode): progress lasts for this visit only */
  }
}

export const useCourseStore = create<CourseState>((set, get) => {
  const touch = (key: string, patch: Partial<LessonProgress>) => {
    const old = get().progress[key] ?? { step: 0, done: false, correct: 0, total: 0, at: 0 };
    const progress = { ...get().progress, [key]: { ...old, ...patch, at: Date.now() } };
    set({ progress });
    save(progress);
  };
  return {
    active: null,
    answers: {},
    finished: false,
    progress: load(),

    begin: (course, lesson, step) => {
      set({ active: { course, lesson, step }, answers: {}, finished: false });
      touch(lessonKey(course, lesson), { step });
    },
    setStep: (step) => {
      const a = get().active;
      if (!a) return;
      set({ active: { ...a, step }, finished: false });
      touch(lessonKey(a.course, a.lesson), { step });
    },
    answer: (step, right, picked) => {
      const prev = get().answers[step];
      const next: StepAnswer = prev
        ? { ...prev, tries: prev.solved ? prev.tries : prev.tries + 1, solved: prev.solved || right }
        : { ok: right, solved: right, tries: 1, picked };
      set({ answers: { ...get().answers, [step]: next } });
      return next;
    },
    finish: (total) => {
      const a = get().active;
      if (!a) return;
      const key = lessonKey(a.course, a.lesson);
      const correct = Object.values(get().answers).filter((x) => x.ok).length;
      const old = get().progress[key];
      // keep the best finished run's score
      const best = old?.done && old.total === total ? Math.max(old.correct, correct) : correct;
      set({ finished: true });
      touch(key, { step: 0, done: true, correct: best, total });
    },
    end: () => set({ active: null, answers: {}, finished: false }),
    resetProgress: () => {
      set({ progress: {} });
      save({});
    },
  };
});
