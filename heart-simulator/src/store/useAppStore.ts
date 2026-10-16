import { create } from 'zustand';

export type LearningLevel = 1 | 2 | 3 | 4 | 5;

/**
 * 3D view modes:
 *  external    – photoreal exterior with coronary vessels
 *  sectioned   – four-chamber cut specimen showing valves, chordae, septum, with blood flow
 *  xray        – translucent heart revealing internal landmarks
 *  conduction  – translucent heart with the conduction system animated from the live ECG
 *  territories – coronary perfusion territories (LAD / LCx / RCA) painted on the surface
 *  activation  – epicardial activation-time (isochronal) map of the current beat
 */
export type ViewMode = 'external' | 'sectioned' | 'xray' | 'conduction' | 'territories' | 'activation';

export type PanelCategory = 'anatomy' | 'coronary' | 'conduction' | 'conditions' | 'procedures' | 'medications' | 'cases';

export const LEVEL_LABELS: Record<LearningLevel, { short: string; long: string }> = {
  1: { short: 'EMT', long: 'EMT / BLS' },
  2: { short: 'Paramedic', long: 'Paramedic / ALS' },
  3: { short: 'ED / ICU', long: 'ED / ICU / Acute care' },
  4: { short: 'Cardiology', long: 'Cardiology / Advanced' },
  5: { short: 'Interventional', long: 'Interventional / EP / Structural' },
};

interface AppState {
  learningLevel: LearningLevel;
  viewMode: ViewMode;
  labelsVisible: boolean;
  showFlow: boolean;
  showVector: boolean;
  autoRotate: boolean;
  searchQuery: string;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  rightPanelTab: string;
  activePanelCategory: PanelCategory;
  helpOpen: boolean;
  quizOpen: boolean;
  /** small-screen layout: side panels become mutually exclusive drawers */
  compact: boolean;

  setLearningLevel: (level: LearningLevel) => void;
  setViewMode: (mode: ViewMode) => void;
  toggleLabels: () => void;
  toggleFlow: () => void;
  toggleVector: () => void;
  toggleAutoRotate: () => void;
  setSearchQuery: (query: string) => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  setRightPanelTab: (tab: string) => void;
  setActivePanelCategory: (cat: PanelCategory) => void;
  setHelpOpen: (open: boolean) => void;
  setQuizOpen: (open: boolean) => void;
  setCompact: (compact: boolean) => void;
  setPanels: (left: boolean, right: boolean) => void;
  resetView: () => void;
}

function loadLevel(): LearningLevel {
  if (typeof window === 'undefined') return 2;
  try {
    const v = Number(window.localStorage.getItem('cardiosim.level'));
    return v >= 1 && v <= 5 ? (v as LearningLevel) : 2;
  } catch {
    return 2;
  }
}

export const useAppStore = create<AppState>((set) => ({
  learningLevel: loadLevel(),
  viewMode: 'external',
  labelsVisible: true,
  showFlow: true,
  showVector: false,
  autoRotate: false,
  searchQuery: '',
  leftPanelOpen: true,
  rightPanelOpen: true,
  rightPanelTab: 'overview',
  activePanelCategory: 'anatomy',
  helpOpen: false,
  quizOpen: false,
  compact: false,

  setLearningLevel: (learningLevel) => {
    try { window.localStorage.setItem('cardiosim.level', String(learningLevel)); } catch { /* storage unavailable */ }
    set({ learningLevel });
  },
  setViewMode: (viewMode) => set({ viewMode }),
  toggleLabels: () => set((s) => ({ labelsVisible: !s.labelsVisible })),
  toggleFlow: () => set((s) => ({ showFlow: !s.showFlow })),
  toggleVector: () => set((s) => ({ showVector: !s.showVector })),
  toggleAutoRotate: () => set((s) => ({ autoRotate: !s.autoRotate })),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen, rightPanelOpen: s.compact && !s.leftPanelOpen ? false : s.rightPanelOpen })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen, leftPanelOpen: s.compact && !s.rightPanelOpen ? false : s.leftPanelOpen })),
  setRightPanelTab: (rightPanelTab) => set({ rightPanelTab }),
  setActivePanelCategory: (activePanelCategory) => set({ activePanelCategory, rightPanelTab: 'overview' }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  setQuizOpen: (quizOpen) => set({ quizOpen }),
  setCompact: (compact) => set({ compact }),
  setPanels: (leftPanelOpen, rightPanelOpen) => set({ leftPanelOpen, rightPanelOpen }),
  resetView: () => set({ viewMode: 'external', labelsVisible: true, searchQuery: '' }),
}));
