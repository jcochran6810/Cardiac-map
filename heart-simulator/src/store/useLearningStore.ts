import { create } from 'zustand';

/**
 * Learner progress, persisted to localStorage (per browser). Tracks what has
 * been studied and quiz/case performance so the UI can show progress.
 */
interface LearningProgress {
  structuresViewed: string[];
  conditionsStudied: string[];
  proceduresReviewed: string[];
  medicationsReviewed: string[];
  cathlabStudied: string[];
  casesCompleted: string[];
  caseScores: Record<string, { correct: number; total: number }>;
  quizAttempts: { questionId: string; correct: boolean; timestamp: number }[];
}

interface LearningState extends LearningProgress {
  markStructureViewed: (id: string) => void;
  markConditionStudied: (id: string) => void;
  markProcedureReviewed: (id: string) => void;
  markMedicationReviewed: (id: string) => void;
  markCathLabStudied: (id: string) => void;
  markCaseCompleted: (id: string, correct: number, total: number) => void;
  recordQuizAttempt: (questionId: string, correct: boolean) => void;
  resetProgress: () => void;
}

const KEY = 'cardiosim.progress.v2';
const EMPTY: LearningProgress = {
  structuresViewed: [],
  conditionsStudied: [],
  proceduresReviewed: [],
  medicationsReviewed: [],
  cathlabStudied: [],
  casesCompleted: [],
  caseScores: {},
  quizAttempts: [],
};

function load(): LearningProgress {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

function save(s: LearningProgress) {
  try {
    const { structuresViewed, conditionsStudied, proceduresReviewed, medicationsReviewed, cathlabStudied, casesCompleted, caseScores, quizAttempts } = s;
    window.localStorage.setItem(KEY, JSON.stringify({
      structuresViewed, conditionsStudied, proceduresReviewed, medicationsReviewed, cathlabStudied, casesCompleted, caseScores,
      quizAttempts: quizAttempts.slice(-500),
    }));
  } catch {
    /* storage unavailable (private mode) — progress lives for this session only */
  }
}

const add = (arr: string[], id: string) => (arr.includes(id) ? arr : [...arr, id]);

export const useLearningStore = create<LearningState>((set, get) => {
  const upd = (patch: Partial<LearningProgress>) => {
    set(patch);
    save(get());
  };
  return {
    ...load(),
    markStructureViewed: (id) => { if (!get().structuresViewed.includes(id)) upd({ structuresViewed: add(get().structuresViewed, id) }); },
    markConditionStudied: (id) => { if (!get().conditionsStudied.includes(id)) upd({ conditionsStudied: add(get().conditionsStudied, id) }); },
    markProcedureReviewed: (id) => { if (!get().proceduresReviewed.includes(id)) upd({ proceduresReviewed: add(get().proceduresReviewed, id) }); },
    markMedicationReviewed: (id) => { if (!get().medicationsReviewed.includes(id)) upd({ medicationsReviewed: add(get().medicationsReviewed, id) }); },
    markCathLabStudied: (id) => { if (!get().cathlabStudied.includes(id)) upd({ cathlabStudied: add(get().cathlabStudied, id) }); },
    markCaseCompleted: (id, correct, total) => upd({
      casesCompleted: add(get().casesCompleted, id),
      caseScores: { ...get().caseScores, [id]: { correct, total } },
    }),
    recordQuizAttempt: (questionId, correct) => upd({ quizAttempts: [...get().quizAttempts, { questionId, correct, timestamp: Date.now() }] }),
    resetProgress: () => upd({ ...EMPTY }),
  };
});
