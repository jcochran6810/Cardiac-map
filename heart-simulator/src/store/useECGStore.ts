import { create } from 'zustand';
import type { StandardLead } from '@/lib/ecg/vector';
import { STANDARD_PLACEMENT, type Placement } from '@/lib/ecg/electrodes';

export type ECGLead = StandardLead;
export type ECGLayout = 'standard' | 'simultaneous' | 'monitor';
export type ECGTheme = 'monitor' | 'paper';
export type BottomView = 'ecg' | 'wiggers' | 'defib';

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
  /** Which cable is attached to which electrode site (misplacement teaching) */
  placement: Placement;
  /** Mystery mode: the misplacement is not disclosed */
  placementHidden: boolean;
  electrodeLab: boolean;

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
  setPlacementState: (p: Placement, hidden: boolean) => void;
  revealPlacement: () => void;
  setElectrodeLab: (open: boolean) => void;
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
  placement: STANDARD_PLACEMENT,
  placementHidden: false,
  electrodeLab: false,

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
  setPlacementState: (placement, placementHidden) => set({ placement, placementHidden }),
  revealPlacement: () => set({ placementHidden: false }),
  setElectrodeLab: (electrodeLab) => set({ electrodeLab }),
}));
