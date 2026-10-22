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

export type PanelCategory = 'anatomy' | 'coronary' | 'conduction' | 'conditions' | 'procedures' | 'medications' | 'cathlab' | 'cases';

/** Top-level screens: the main menu, the learning workspace (library, 3D heart, ECG) and the case simulator */
export type AppMode = 'home' | 'learn' | 'simulator';

/**
 * The 3D heart slides down from the top of the learning screen and the ECG slides up from the bottom.
 *  closed – only its bar shows
 *  open   – it shares the screen with the reading
 *  full   – it takes the whole screen (the reading is hidden until it is shrunk or closed)
 */
export type DrawerState = 'closed' | 'open' | 'full';

/** Learner roles — each is held strictly to its scope of practice (see lib/scope.ts) */
export const LEVEL_LABELS: Record<LearningLevel, { short: string; long: string }> = {
  1: { short: 'EMT', long: 'EMT (NREMT · BLS)' },
  2: { short: 'Paramedic', long: 'Paramedic (NREMT · ALS)' },
  3: { short: 'Cath Lab Tech', long: 'Cath Lab Tech (RCIS)' },
  4: { short: 'Cath Lab RN', long: 'Cath Lab Nurse (RN)' },
  5: { short: 'Cardiologist', long: 'Cardiologist (incl. interventional / EP)' },
};

interface AppState {
  mode: AppMode;
  learningLevel: LearningLevel;
  viewMode: ViewMode;
  labelsVisible: boolean;
  showFlow: boolean;
  showVector: boolean;
  autoRotate: boolean;
  searchQuery: string;
  /** The library list: a column beside the reading on desktops; on tablets and phones a page of its own */
  listOpen: boolean;
  heart: DrawerState;
  ecg: DrawerState;
  rightPanelTab: string;
  activePanelCategory: PanelCategory;
  helpOpen: boolean;
  quizOpen: boolean;
  /** tablets and phones: the library list and the reading are separate pages */
  compact: boolean;
  /** phone-sized screen (either orientation): denser controls, full-screen sheets */
  phone: boolean;
  /** phone on its side: an opened drawer takes the whole screen, and the heart and ECG sit side by side */
  short: boolean;

  setMode: (mode: AppMode) => void;
  setLearningLevel: (level: LearningLevel) => void;
  setViewMode: (mode: ViewMode) => void;
  toggleLabels: () => void;
  toggleFlow: () => void;
  toggleVector: () => void;
  toggleAutoRotate: () => void;
  setSearchQuery: (query: string) => void;
  setListOpen: (open: boolean) => void;
  setHeart: (state: DrawerState) => void;
  setEcg: (state: DrawerState) => void;
  /** the bars' buttons: open (full on a phone on its side) or close */
  toggleHeart: () => void;
  toggleEcg: () => void;
  setRightPanelTab: (tab: string) => void;
  setActivePanelCategory: (cat: PanelCategory) => void;
  setHelpOpen: (open: boolean) => void;
  setQuizOpen: (open: boolean) => void;
  setCompact: (compact: boolean) => void;
  setPhone: (phone: boolean) => void;
  setShort: (short: boolean) => void;
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
  mode: 'home',
  learningLevel: loadLevel(),
  viewMode: 'external',
  labelsVisible: true,
  showFlow: true,
  showVector: false,
  autoRotate: false,
  searchQuery: '',
  listOpen: true,
  heart: 'closed',
  ecg: 'closed',
  rightPanelTab: 'overview',
  activePanelCategory: 'anatomy',
  helpOpen: false,
  quizOpen: false,
  compact: false,
  phone: false,
  short: false,

  setMode: (mode) => set({ mode }),
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
  setListOpen: (listOpen) => set({ listOpen }),
  setHeart: (heart) => set({ heart }),
  setEcg: (ecg) => set({ ecg }),
  toggleHeart: () => set((s) => ({ heart: s.heart === 'closed' ? (s.short ? 'full' : 'open') : 'closed' })),
  toggleEcg: () => set((s) => ({ ecg: s.ecg === 'closed' ? (s.short ? 'full' : 'open') : 'closed' })),
  setRightPanelTab: (rightPanelTab) => set({ rightPanelTab }),
  setActivePanelCategory: (activePanelCategory) => set({ activePanelCategory, rightPanelTab: 'overview' }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  setQuizOpen: (quizOpen) => set({ quizOpen }),
  setCompact: (compact) => set({ compact }),
  setPhone: (phone) => set({ phone }),
  setShort: (short) => set({ short }),
  resetView: () => set({ viewMode: 'external', labelsVisible: true, searchQuery: '' }),
}));
