import { create } from 'zustand';

export type ECGDisplayMode = 'scrolling' | 'frozen' | 'scrub' | 'compare';
export type ECGLead = 'I' | 'II' | 'III' | 'aVR' | 'aVL' | 'aVF' | 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6';

interface ECGState {
  activeProfileId: string;
  compareProfileId: string | null;
  displayMode: ECGDisplayMode;
  visibleLeads: ECGLead[];
  gain: number;
  sweepSpeed: number;
  showBeatMarkers: boolean;
  showAnnotations: boolean;
  caliperMode: boolean;
  caliperPoints: { x: number; lead: ECGLead }[];
  selectedLead: ECGLead | null;

  setActiveProfile: (id: string) => void;
  setCompareProfile: (id: string | null) => void;
  setDisplayMode: (mode: ECGDisplayMode) => void;
  toggleLead: (lead: ECGLead) => void;
  setGain: (gain: number) => void;
  setSweepSpeed: (speed: number) => void;
  toggleBeatMarkers: () => void;
  toggleAnnotations: () => void;
  toggleCalipers: () => void;
  addCaliperPoint: (x: number, lead: ECGLead) => void;
  clearCalipers: () => void;
  selectLead: (lead: ECGLead | null) => void;
}

const ALL_LEADS: ECGLead[] = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];

export const useECGStore = create<ECGState>((set) => ({
  activeProfileId: 'normal-sinus',
  compareProfileId: null,
  displayMode: 'scrolling',
  visibleLeads: ALL_LEADS,
  gain: 10,
  sweepSpeed: 25,
  showBeatMarkers: true,
  showAnnotations: true,
  caliperMode: false,
  caliperPoints: [],
  selectedLead: null,

  setActiveProfile: (id) => set({ activeProfileId: id }),
  setCompareProfile: (id) => set({ compareProfileId: id }),
  setDisplayMode: (mode) => set({ displayMode: mode }),
  toggleLead: (lead) => set((s) => ({
    visibleLeads: s.visibleLeads.includes(lead)
      ? s.visibleLeads.filter((l) => l !== lead)
      : [...s.visibleLeads, lead],
  })),
  setGain: (gain) => set({ gain }),
  setSweepSpeed: (sweepSpeed) => set({ sweepSpeed }),
  toggleBeatMarkers: () => set((s) => ({ showBeatMarkers: !s.showBeatMarkers })),
  toggleAnnotations: () => set((s) => ({ showAnnotations: !s.showAnnotations })),
  toggleCalipers: () => set((s) => ({ caliperMode: !s.caliperMode, caliperPoints: [] })),
  addCaliperPoint: (x, lead) => set((s) => ({
    caliperPoints: s.caliperPoints.length >= 2 ? [{ x, lead }] : [...s.caliperPoints, { x, lead }],
  })),
  clearCalipers: () => set({ caliperPoints: [] }),
  selectLead: (lead) => set((s) => ({ selectedLead: s.selectedLead === lead ? null : lead })),
}));
