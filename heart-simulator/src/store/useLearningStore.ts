import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface LearningProgress {
  structuresViewed: string[];
  conditionsStudied: string[];
  proceduresReviewed: string[];
  medicationsViewed: string[];
  casesCompleted: string[];
  caseScores: Record<string, number>;
  quizAttempts: { questionId: string; correct: boolean; timestamp: number }[];
  totalStudyTimeMs: number;
}

interface LearningState extends LearningProgress {
  markStructureViewed: (id: string) => void;
  markConditionStudied: (id: string) => void;
  markProcedureReviewed: (id: string) => void;
  markMedicationViewed: (id: string) => void;
  markCaseCompleted: (id: string, score: number) => void;
  recordQuizAttempt: (questionId: string, correct: boolean) => void;
  addStudyTime: (ms: number) => void;
  /** Fraction (0-100) of the catalogue the learner has opened, given the catalogue size. */
  getCompletionPercentage: (total: number) => number;
  resetProgress: () => void;
}

const EMPTY: LearningProgress = {
  structuresViewed: [],
  conditionsStudied: [],
  proceduresReviewed: [],
  medicationsViewed: [],
  casesCompleted: [],
  caseScores: {},
  quizAttempts: [],
  totalStudyTimeMs: 0,
};

const addUnique = (list: string[], id: string) => (list.includes(id) ? list : [...list, id]);

export const useLearningStore = create<LearningState>()(
  persist(
    (set, get) => ({
      ...EMPTY,

      markStructureViewed: (id) => set((s) => ({ structuresViewed: addUnique(s.structuresViewed, id) })),
      markConditionStudied: (id) => set((s) => ({ conditionsStudied: addUnique(s.conditionsStudied, id) })),
      markProcedureReviewed: (id) => set((s) => ({ proceduresReviewed: addUnique(s.proceduresReviewed, id) })),
      markMedicationViewed: (id) => set((s) => ({ medicationsViewed: addUnique(s.medicationsViewed, id) })),
      markCaseCompleted: (id, score) => set((s) => ({
        casesCompleted: addUnique(s.casesCompleted, id),
        caseScores: { ...s.caseScores, [id]: Math.max(score, s.caseScores[id] ?? 0) },
      })),
      recordQuizAttempt: (questionId, correct) => set((s) => ({
        quizAttempts: [...s.quizAttempts, { questionId, correct, timestamp: Date.now() }],
      })),
      addStudyTime: (ms) => set((s) => ({ totalStudyTimeMs: s.totalStudyTimeMs + ms })),
      getCompletionPercentage: (total) => {
        const s = get();
        const seen = s.structuresViewed.length + s.conditionsStudied.length +
          s.proceduresReviewed.length + s.medicationsViewed.length + s.casesCompleted.length;
        return total > 0 ? Math.min(100, Math.round((seen / total) * 100)) : 0;
      },
      resetProgress: () => set({ ...EMPTY }),
    }),
    {
      name: 'cardiosim-progress',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        structuresViewed: s.structuresViewed,
        conditionsStudied: s.conditionsStudied,
        proceduresReviewed: s.proceduresReviewed,
        medicationsViewed: s.medicationsViewed,
        casesCompleted: s.casesCompleted,
        caseScores: s.caseScores,
        quizAttempts: s.quizAttempts,
        totalStudyTimeMs: s.totalStudyTimeMs,
      }),
    },
  ),
);
