import { create } from 'zustand';
import type { StandardLead } from '@/lib/ecg/vector';

export type ECGLead = StandardLead;
export type ECGLayout = 'standard' | 'simultaneous' | 'monitor';
export type ECGTheme = 'monitor' | 'paper';
export type BottomView = 'ecg' | 'wiggers';

interface ECGState {
  activeProfileId: string;
  layout: ECGLayout;
  theme: ECGTheme;
  /** mm/mV */
  gain: 5 | 10 | 20;
  /** mm/s */
  sweepSpeed: 25 | 50;
  showKeyLeads: boolean;
  showAnnotations: boolean;
  caliperMode: boolean;
  selectedLead: ECGLead | null;
  inspectLead: ECGLead | null;
  bottomView: BottomView;

  setActiveProfile: (id: string) => void;
  setLayout: (layout: ECGLayout) => void;
  setTheme: (theme: ECGTheme) => void;
  setGain: (gain: 5 | 10 | 20) => void;
  setSweepSpeed: (speed: 25 | 50) => void;
  toggleKeyLeads: () => void;
  toggleAnnotations: () => void;
  toggleCalipers: () => void;
  selectLead: (lead: ECGLead | null) => void;
  setInspectLead: (lead: ECGLead | null) => void;
  setBottomView: (v: BottomView) => void;
}

export const useECGStore = create<ECGState>((set) => ({
  activeProfileId: 'normal-sinus',
  layout: 'standard',
  theme: 'monitor',
  gain: 10,
  sweepSpeed: 25,
  showKeyLeads: true,
  showAnnotations: true,
  caliperMode: false,
  selectedLead: null,
  inspectLead: null,
  bottomView: 'ecg',

  setActiveProfile: (activeProfileId) => set({ activeProfileId }),
  setLayout: (layout) => set({ layout }),
  setTheme: (theme) => set({ theme }),
  setGain: (gain) => set({ gain }),
  setSweepSpeed: (sweepSpeed) => set({ sweepSpeed }),
  toggleKeyLeads: () => set((s) => ({ showKeyLeads: !s.showKeyLeads })),
  toggleAnnotations: () => set((s) => ({ showAnnotations: !s.showAnnotations })),
  toggleCalipers: () => set((s) => ({ caliperMode: !s.caliperMode })),
  selectLead: (lead) => set((s) => ({ selectedLead: s.selectedLead === lead ? null : lead })),
  setInspectLead: (inspectLead) => set({ inspectLead }),
  setBottomView: (bottomView) => set({ bottomView }),
}));
