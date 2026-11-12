import { create } from 'zustand';
import { DRILL_SET_BY_ID, grade, nextQuestion, statKey, type DrillQuestion, type DrillStats } from '@/lib/drill';

/**
 * Rhythm trainer: the set being practised, the tracing on screen and what the learner has shown they know
 * (kept on this device). Putting the tracing on the monitor is done by `src/lib/drillRun.ts`.
 */
interface DrillState {
  /** the trainer has the learning screen (its set list, or a set in play) */
  open: boolean;
  setId: string | null;
  question: DrillQuestion | null;
  /** the answer given to the tracing on screen (a profile id, or 'unsure') */
  picked: string | null;
  /** this visit: questions answered, answered right, and right answers in a row */
  asked: number;
  right: number;
  streak: number;
  stats: DrillStats;
  /** longest run of right answers per set */
  best: Record<string, number>;

  show: () => void;
  begin: (setId: string, rng?: () => number) => void;
  answer: (profile: string) => boolean;
  next: (rng?: () => number) => void;
  /** back to the list of sets */
  leaveSet: () => void;
  close: () => void;
  resetStats: () => void;
}

const KEY = 'cardiosim.drill.v1';

function load(): { stats: DrillStats; best: Record<string, number> } {
  if (typeof window === 'undefined') return { stats: {}, best: {} };
  try {
    const raw = window.localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as Partial<{ stats: DrillStats; best: Record<string, number> }>) : {};
    return { stats: v.stats ?? {}, best: v.best ?? {} };
  } catch {
    return { stats: {}, best: {} };
  }
}

function save(stats: DrillStats, best: Record<string, number>) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ stats, best }));
  } catch {
    /* storage unavailable: progress lasts for this visit only */
  }
}

export const useDrillStore = create<DrillState>((set, get) => ({
  open: false,
  setId: null,
  question: null,
  picked: null,
  asked: 0,
  right: 0,
  streak: 0,
  ...load(),

  show: () => set({ open: true }),
  begin: (setId, rng = Math.random) => {
    const s = DRILL_SET_BY_ID[setId];
    if (!s) return;
    set({ open: true, setId, picked: null, asked: 0, right: 0, streak: 0, question: nextQuestion(s, get().stats, null, rng) });
  },
  answer: (profile) => {
    const { setId, question, picked } = get();
    if (!setId || !question || picked) return false;
    const ok = profile === question.profile;
    const key = statKey(setId, question.profile);
    const stats = { ...get().stats, [key]: grade(get().stats[key], ok) };
    const streak = ok ? get().streak + 1 : 0;
    const best = streak > (get().best[setId] ?? 0) ? { ...get().best, [setId]: streak } : get().best;
    set({ picked: profile, asked: get().asked + 1, right: get().right + (ok ? 1 : 0), streak, stats, best });
    save(stats, best);
    return ok;
  },
  next: (rng = Math.random) => {
    const { setId, question } = get();
    const s = setId ? DRILL_SET_BY_ID[setId] : null;
    if (!s) return;
    set({ picked: null, question: nextQuestion(s, get().stats, question?.profile ?? null, rng) });
  },
  leaveSet: () => set({ setId: null, question: null, picked: null }),
  close: () => set({ open: false, setId: null, question: null, picked: null }),
  resetStats: () => {
    set({ stats: {}, best: {} });
    save({}, {});
  },
}));
