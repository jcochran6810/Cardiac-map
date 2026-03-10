import { create } from 'zustand';

interface CaseState {
  activeCaseId: string | null;
  currentStateId: string | null;
  caseHistory: string[];
  score: number;
  caseComplete: boolean;
  showDebrief: boolean;

  startCase: (caseId: string, initialStateId: string) => void;
  transitionState: (stateId: string) => void;
  addScore: (points: number) => void;
  completeCase: () => void;
  showDebriefPanel: () => void;
  resetCase: () => void;
}

export const useCaseStore = create<CaseState>((set) => ({
  activeCaseId: null,
  currentStateId: null,
  caseHistory: [],
  score: 0,
  caseComplete: false,
  showDebrief: false,

  startCase: (caseId, initialStateId) => set({
    activeCaseId: caseId,
    currentStateId: initialStateId,
    caseHistory: [initialStateId],
    score: 0,
    caseComplete: false,
    showDebrief: false,
  }),
  transitionState: (stateId) => set((s) => ({
    currentStateId: stateId,
    caseHistory: [...s.caseHistory, stateId],
  })),
  addScore: (points) => set((s) => ({ score: s.score + points })),
  completeCase: () => set({ caseComplete: true }),
  showDebriefPanel: () => set({ showDebrief: true }),
  resetCase: () => set({
    activeCaseId: null,
    currentStateId: null,
    caseHistory: [],
    score: 0,
    caseComplete: false,
    showDebrief: false,
  }),
}));
