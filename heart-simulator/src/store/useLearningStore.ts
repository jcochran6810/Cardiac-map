import { create } from 'zustand';

interface LearningProgress {
  structuresViewed: string[];
  conditionsStudied: string[];
  proceduresReviewed: string[];
  casesCompleted: string[];
  quizAttempts: { questionId: string; correct: boolean; timestamp: number }[];
  totalStudyTimeMs: number;
}

interface LearningState extends LearningProgress {
  markStructureViewed: (id: string) => void;
  markConditionStudied: (id: string) => void;
  markProcedureReviewed: (id: string) => void;
  markCaseCompleted: (id: string) => void;
  recordQuizAttempt: (questionId: string, correct: boolean) => void;
  addStudyTime: (ms: number) => void;
  getCompletionPercentage: () => number;
}

export const useLearningStore = create<LearningState>((set, get) => ({
  structuresViewed: [],
  conditionsStudied: [],
  proceduresReviewed: [],
  casesCompleted: [],
  quizAttempts: [],
  totalStudyTimeMs: 0,

  markStructureViewed: (id) => set((s) => ({
    structuresViewed: s.structuresViewed.includes(id) ? s.structuresViewed : [...s.structuresViewed, id],
  })),
  markConditionStudied: (id) => set((s) => ({
    conditionsStudied: s.conditionsStudied.includes(id) ? s.conditionsStudied : [...s.conditionsStudied, id],
  })),
  markProcedureReviewed: (id) => set((s) => ({
    proceduresReviewed: s.proceduresReviewed.includes(id) ? s.proceduresReviewed : [...s.proceduresReviewed, id],
  })),
  markCaseCompleted: (id) => set((s) => ({
    casesCompleted: s.casesCompleted.includes(id) ? s.casesCompleted : [...s.casesCompleted, id],
  })),
  recordQuizAttempt: (questionId, correct) => set((s) => ({
    quizAttempts: [...s.quizAttempts, { questionId, correct, timestamp: Date.now() }],
  })),
  addStudyTime: (ms) => set((s) => ({ totalStudyTimeMs: s.totalStudyTimeMs + ms })),
  getCompletionPercentage: () => {
    const s = get();
    const total = s.structuresViewed.length + s.conditionsStudied.length +
      s.proceduresReviewed.length + s.casesCompleted.length;
    return Math.min(100, (total / 500) * 100);
  },
}));
