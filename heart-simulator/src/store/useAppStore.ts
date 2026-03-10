import { create } from 'zustand';

export type AppMode = 'explore' | 'physiology' | 'pathology' | 'imaging' | 'procedure' | 'case' | 'tutor';
export type LearningLevel = 1 | 2 | 3 | 4 | 5;
export type ViewMode = 'external' | 'internal' | 'cutaway' | 'sectional' | 'dissection' | 'coronary' | 'conduction' | 'perfusion' | 'wall-motion' | 'procedure-overlay' | 'imaging-correlation';
export type DetailLevel = 'low' | 'standard' | 'high';

interface AppState {
  mode: AppMode;
  learningLevel: LearningLevel;
  viewMode: ViewMode;
  detailLevel: DetailLevel;
  labelsVisible: boolean;
  dissectionEnabled: boolean;
  compareMode: boolean;
  searchQuery: string;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  rightPanelTab: string;
  highContrastMode: boolean;
  reducedMotion: boolean;

  setMode: (mode: AppMode) => void;
  setLearningLevel: (level: LearningLevel) => void;
  setViewMode: (mode: ViewMode) => void;
  setDetailLevel: (level: DetailLevel) => void;
  toggleLabels: () => void;
  toggleDissection: () => void;
  toggleCompare: () => void;
  setSearchQuery: (query: string) => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  setRightPanelTab: (tab: string) => void;
  resetView: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  mode: 'explore',
  learningLevel: 1,
  viewMode: 'external',
  detailLevel: 'standard',
  labelsVisible: true,
  dissectionEnabled: false,
  compareMode: false,
  searchQuery: '',
  leftPanelOpen: true,
  rightPanelOpen: true,
  rightPanelTab: 'overview',
  highContrastMode: false,
  reducedMotion: false,

  setMode: (mode) => set({ mode }),
  setLearningLevel: (learningLevel) => set({ learningLevel }),
  setViewMode: (viewMode) => set({ viewMode }),
  setDetailLevel: (detailLevel) => set({ detailLevel }),
  toggleLabels: () => set((s) => ({ labelsVisible: !s.labelsVisible })),
  toggleDissection: () => set((s) => ({ dissectionEnabled: !s.dissectionEnabled })),
  toggleCompare: () => set((s) => ({ compareMode: !s.compareMode })),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setRightPanelTab: (rightPanelTab) => set({ rightPanelTab }),
  resetView: () => set({
    viewMode: 'external',
    labelsVisible: true,
    dissectionEnabled: false,
    compareMode: false,
    searchQuery: '',
  }),
}));
