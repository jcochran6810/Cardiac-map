'use client';

/**
 * The case simulator's state, and its side effects on the shared monitor: while a scenario runs,
 * the scenario (not the learning workspace) decides the rhythm, the vitals and the NIBP reading.
 * Entering the simulator saves the workspace's ECG settings; leaving it puts them back.
 */
import { create } from 'zustand';
import { setRhythm } from '@/lib/rhythm';
import { perform, readEcg, review, start, stop, takeHint } from '@/lib/sim/scenario/engine';
import { SCENARIO_BY_ID } from '@/lib/sim/scenario/scenarios';
import type { Review, SimState } from '@/lib/sim/scenario/types';
import { resetCode, setNibpReading, setScriptedVitals, useDefibStore, type ScriptedVitals } from '@/lib/sim/defib';
import { sim } from '@/lib/sim/simulation';
import type { LearningLevel } from '@/store/useAppStore';
import { useECGStore, type ECGLayout, type ECGLead } from '@/store/useECGStore';
import { useTimelineStore } from '@/store/useTimelineStore';

const BEST_KEY = 'cardiosim.sim.best';

interface SimStore {
  scenarioId: string | null;
  state: SimState | null;
  review: Review | null;
  /** the review page is showing (once the case has ended) */
  reviewOpen: boolean;
  /** phones and tablets: the action list is open over the case */
  sheetOpen: boolean;
  /** counts case starts, so a Back-button history entry knows which run it belongs to */
  run: number;
  /** best score per scenario and role ("scenarioId:role" → percent), kept on this device */
  best: Record<string, number>;
  startScenario: (id: string, role: LearningLevel) => void;
  act: (interventionId: string) => void;
  /** your read of the 12-lead that is waiting for one */
  read: (optionId: string) => void;
  hint: () => void;
  /** end the case now and see the review */
  endScenario: () => void;
  /** back to the case list */
  closeScenario: () => void;
  setReviewOpen: (open: boolean) => void;
  setSheetOpen: (open: boolean) => void;
}

function loadBest(): Record<string, number> {
  try {
    const v = JSON.parse(window.localStorage.getItem(BEST_KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

export const bestKey = (scenarioId: string, role: number) => `${scenarioId}:${role}`;

/** What the monitor's sensors would show for this patient */
export function monitorVitals(s: SimState): ScriptedVitals {
  const v = s.vitals;
  if (s.pulse) return { pulse: true, sbp: v.sbp, dbp: v.dbp, spo2: v.spo2, rr: v.rr, etco2: v.etco2 };
  const ventilated = 'ventilated' in s.flags || 'airway' in s.flags;
  return { pulse: false, sbp: 0, dbp: 0, spo2: v.spo2, rr: ventilated ? 10 : 0, etco2: 'cpr' in s.flags ? 18 : v.etco2 };
}

/** Which monitor channels are connected */
export function attached(s: SimState) {
  const f = s.flags;
  return { ecg: 'monitor' in f || 'pads' in f || 'ecg12' in f, pleth: 'monitor' in f, co2: 'capno' in f || 'airway' in f };
}

// ─── Side effects on the shared monitor ─────────────────────────────────────

let saved: null | {
  profile: string; hr: number; layout: ECGLayout; keyLeads: boolean; inspect: ECGLead | null;
  lab: boolean; playing: boolean; speed: number;
} = null;

/** Show this patient on the monitor and the 12-lead */
function show(s: SimState, prev: SimState | null) {
  if (!prev || prev.rhythm.profile !== s.rhythm.profile || prev.rhythm.hr !== s.rhythm.hr) setRhythm(s.rhythm.profile, s.rhythm.hr);
  setScriptedVitals(monitorVitals(s));
  const newLines = prev ? s.log.slice(prev.log.length) : [];
  const last = s.performed.at(-1);
  if (prev && last && s.performed.length > prev.performed.length) {
    if (last.id === 'nibp') setNibpReading(s.pulse ? { sbp: s.vitals.sbp, dbp: s.vitals.dbp } : 'fail');
    if (newLines.some((l) => /shock delivered|synchronised shock/i.test(l.text))) useDefibStore.setState({ lastShock: sim.time });
  }
}

/** Called when the simulator screen opens */
export function enterSimulator() {
  const ecg = useECGStore.getState();
  const tl = useTimelineStore.getState();
  if (!saved) {
    saved = {
      profile: ecg.activeProfileId, hr: tl.heartRate, layout: ecg.layout, keyLeads: ecg.showKeyLeads,
      inspect: ecg.inspectLead, lab: ecg.electrodeLab, playing: tl.playing, speed: tl.speed,
    };
  }
  // The learner reads the tracings themselves: no highlighted key leads, no labelled lead
  ecg.setLayout('simultaneous');
  ecg.setInspectLead(null);
  ecg.setElectrodeLab(false);
  if (ecg.showKeyLeads) ecg.toggleKeyLeads();
  tl.setSpeed(1);
  tl.play();
  const s = useSimStore.getState().state;
  if (s) show(s, null);
}

/** Called when the simulator screen closes: the workspace gets its own monitor back */
export function leaveSimulator() {
  setScriptedVitals(null);
  setNibpReading(null);
  if (!saved) return;
  const ecg = useECGStore.getState();
  const tl = useTimelineStore.getState();
  setRhythm(saved.profile, saved.hr);
  ecg.setLayout(saved.layout);
  ecg.setInspectLead(saved.inspect);
  ecg.setElectrodeLab(saved.lab);
  if (ecg.showKeyLeads !== saved.keyLeads) ecg.toggleKeyLeads();
  tl.setSpeed(saved.speed);
  if (saved.playing) tl.play(); else tl.pause();
  saved = null;
}

export const useSimStore = create<SimStore>((set, get) => {
  const finish = (s: SimState) => {
    const sc = SCENARIO_BY_ID[s.scenarioId];
    const r = review(sc, s);
    const key = bestKey(s.scenarioId, s.role);
    const best = { ...get().best };
    if (s.ended?.reason !== 'stopped' && r.percent > (best[key] ?? -1)) {
      best[key] = r.percent;
      try { window.localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch { /* storage unavailable */ }
    }
    return { review: r, best };
  };
  const update = (next: SimState) => {
    const prev = get().state;
    if (next === prev) return;
    show(next, prev);
    set({ state: next, ...(next.ended ? { ...finish(next), sheetOpen: false } : {}) });
  };

  return {
    scenarioId: null,
    state: null,
    review: null,
    reviewOpen: false,
    sheetOpen: false,
    run: 0,
    best: typeof window === 'undefined' ? {} : loadBest(),

    startScenario: (id, role) => {
      const sc = SCENARIO_BY_ID[id];
      if (!sc) return;
      // a fresh monitor: no NIBP, shock or code timers left over from before
      resetCode(true);
      setNibpReading(null);
      const s = start(sc, sc.roles.includes(role) ? role : sc.roles[0]);
      show(s, null);
      set((st) => ({ scenarioId: id, state: s, review: null, reviewOpen: false, sheetOpen: false, run: st.run + 1 }));
    },
    act: (id) => {
      const { state } = get();
      if (!state || state.ended) return;
      update(perform(SCENARIO_BY_ID[state.scenarioId], state, id));
    },
    read: (optionId) => {
      const { state } = get();
      if (!state?.pendingRead) return;
      update(readEcg(SCENARIO_BY_ID[state.scenarioId], state, optionId));
    },
    hint: () => {
      const { state } = get();
      if (!state || state.ended) return;
      update(takeHint(SCENARIO_BY_ID[state.scenarioId], state));
    },
    endScenario: () => {
      const { state } = get();
      if (!state || state.ended) return;
      update(stop(state));
    },
    closeScenario: () => {
      setScriptedVitals(null);
      setNibpReading(null);
      set({ scenarioId: null, state: null, review: null, reviewOpen: false, sheetOpen: false });
    },
    setReviewOpen: (reviewOpen) => set((st) => ({ reviewOpen: reviewOpen && !!st.state?.ended })),
    setSheetOpen: (sheetOpen) => set((st) => ({ sheetOpen: sheetOpen && !!st.state && !st.state.ended })),
  };
});
