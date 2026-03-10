import { create } from 'zustand';

interface ProcedureState {
  selectedProcedureId: string | null;
  currentStepIndex: number;
  procedurePlaying: boolean;
  showFluoroscopy: boolean;
  showDeviceOverlay: boolean;

  selectProcedure: (id: string | null) => void;
  setStep: (index: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  toggleProcedurePlaying: () => void;
  toggleFluoroscopy: () => void;
  toggleDeviceOverlay: () => void;
  resetProcedure: () => void;
}

export const useProcedureStore = create<ProcedureState>((set) => ({
  selectedProcedureId: null,
  currentStepIndex: 0,
  procedurePlaying: false,
  showFluoroscopy: false,
  showDeviceOverlay: false,

  selectProcedure: (id) => set({ selectedProcedureId: id, currentStepIndex: 0, procedurePlaying: false }),
  setStep: (index) => set({ currentStepIndex: index }),
  nextStep: () => set((s) => ({ currentStepIndex: s.currentStepIndex + 1 })),
  prevStep: () => set((s) => ({ currentStepIndex: Math.max(0, s.currentStepIndex - 1) })),
  toggleProcedurePlaying: () => set((s) => ({ procedurePlaying: !s.procedurePlaying })),
  toggleFluoroscopy: () => set((s) => ({ showFluoroscopy: !s.showFluoroscopy })),
  toggleDeviceOverlay: () => set((s) => ({ showDeviceOverlay: !s.showDeviceOverlay })),
  resetProcedure: () => set({ currentStepIndex: 0, procedurePlaying: false }),
}));
