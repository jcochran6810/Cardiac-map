import { create } from 'zustand';
import type { QuizQuestion } from '@/types/content';

/**
 * The quiz round under way. It lives here rather than in the quiz panel so that closing the quiz, pressing Back or
 * opening the tutor only puts the round aside: opening the quiz again returns to the same question with the same
 * score. Only "End round" (or finishing it and starting another) ends it.
 */
interface QuizRoundState {
  /** this round's questions, or null before a round starts (the topic and level filters show instead) */
  deck: QuizQuestion[] | null;
  /** the question on screen; equal to deck.length once the round is over (the results show) */
  idx: number;
  /** the option picked for the question on screen, or null while it is still open */
  choice: number | null;
  score: number;

  start: (deck: QuizQuestion[]) => void;
  /** Answer the question on screen. Returns whether it was right, or null if there is nothing to answer. */
  pick: (option: number) => boolean | null;
  /** On to the next question (or the results after the last) once this one is answered */
  next: () => void;
  /** Back to the filters: the round is over */
  end: () => void;
}

export const useQuizStore = create<QuizRoundState>((set, get) => ({
  deck: null,
  idx: 0,
  choice: null,
  score: 0,

  start: (deck) => set({ deck, idx: 0, choice: null, score: 0 }),
  pick: (option) => {
    const { deck, idx, choice, score } = get();
    const q = deck?.[idx];
    if (!q || choice !== null || option < 0 || option >= q.options.length) return null;
    const ok = option === q.correctIndex;
    set({ choice: option, score: score + (ok ? 1 : 0) });
    return ok;
  },
  next: () => {
    const { deck, idx, choice } = get();
    if (!deck || choice === null || idx >= deck.length) return;
    set({ idx: idx + 1, choice: null });
  },
  end: () => set({ deck: null, idx: 0, choice: null, score: 0 }),
}));

/** How many of the round's questions have been answered so far */
export function answeredSoFar(s: Pick<QuizRoundState, 'deck' | 'idx' | 'choice'>): number {
  if (!s.deck) return 0;
  return Math.min(s.deck.length, s.idx + (s.choice !== null ? 1 : 0));
}
