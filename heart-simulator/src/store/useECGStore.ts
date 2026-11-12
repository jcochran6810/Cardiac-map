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
  /**
   * the learner's last tap on a lead, counted even when it toggles the lead's outline off: a lesson's
   * "tap a lead" check answers on each tap (a new object every time)
   */
  leadTap: { lead: ECGLead } | null;
  inspectLead: ECGLead | null;
  bottomView: BottomView;
  /** Which cable is attached to which electrode site (misplacement teaching) */
  placement: Placement;
  /** Mystery mode: the misplacement is not disclosed */
  placementHidden: boolean;
  electrodeLab: boolean;
  /**
   * Who has a question open about the tracing (a quiz strip, a lesson's check, the rhythm trainer). While anyone
   * does, the app keeps its own reading to itself: no rhythm name, interpretation or key-lead tint.
   */
  blindBy: string[];
  /** a "work out the rate" question is open: the app's own heart-rate numbers are hidden too */
  rateHidden: boolean;

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
  setBlind: (who: string, on: boolean) => void;
  setRateHidden: (on: boolean) => void;
}

export const useECGStore = create<ECGState>((set) => ({
  activeProfileId: 'normal-sinus',
  // Live 12-lead (every lead sweeps at once, like a monitor); 'standard' is the paper printout
  layout: 'simultaneous',
  theme: 'monitor',
  gain: 10,
  sweepSpeed: 25,
  showKeyLeads: true,
  showAnnotations: true,
  caliperMode: false,
  selectedLead: null,
  leadTap: null,
  inspectLead: null,
  bottomView: 'ecg',
  placement: STANDARD_PLACEMENT,
  placementHidden: false,
  electrodeLab: false,
  blindBy: [],
  rateHidden: false,

  setActiveProfile: (activeProfileId) => set({ activeProfileId }),
  setLayout: (layout) => set({ layout }),
  setTheme: (theme) => set({ theme }),
  setGain: (gain) => set({ gain }),
  setSweepSpeed: (sweepSpeed) => set({ sweepSpeed }),
  toggleKeyLeads: () => set((s) => ({ showKeyLeads: !s.showKeyLeads })),
  toggleAnnotations: () => set((s) => ({ showAnnotations: !s.showAnnotations })),
  toggleCalipers: () => set((s) => ({ caliperMode: !s.caliperMode })),
  selectLead: (lead) => set((s) => ({ selectedLead: s.selectedLead === lead ? null : lead, leadTap: lead ? { lead } : s.leadTap })),
  setInspectLead: (inspectLead) => set({ inspectLead }),
  setBottomView: (bottomView) => set({ bottomView }),
  setPlacementState: (placement, placementHidden) => set({ placement, placementHidden }),
  revealPlacement: () => set({ placementHidden: false }),
  setElectrodeLab: (electrodeLab) => set({ electrodeLab }),
  setBlind: (who, on) => set((s) => {
    const has = s.blindBy.includes(who);
    if (on === has) return s;
    return { blindBy: on ? [...s.blindBy, who] : s.blindBy.filter((w) => w !== who) };
  }),
  setRateHidden: (rateHidden) => set((s) => (s.rateHidden === rateHidden ? s : { rateHidden })),
}));

/** True while a "work out the rate" question is open */
export const useRateHidden = () => useECGStore((s) => s.rateHidden);

/** True while a question about the tracing is open: components hide whatever would give the answer away */

export const useBlind = () => useECGStore((s) => s.blindBy.length > 0);
