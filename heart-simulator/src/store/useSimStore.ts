'use client';

/**
 * The case simulator's state, and its side effects on the shared monitor: while a scenario runs,
 * the scenario (not the learning workspace) decides the rhythm, the vitals and the NIBP reading.
 * Entering the simulator saves the workspace's ECG settings; leaving it puts them back.
 */
import { create } from 'zustand';
import { setRhythm, showRhythm } from '@/lib/rhythm';
import { answerRead, perform, review, start, stop, takeHint } from '@/lib/sim/scenario/engine';
import { arrestEtco2, palpable, ventilated } from '@/lib/sim/scenario/kit';
import { SCENARIO_BY_ID } from '@/lib/sim/scenario/scenarios';
import type { Review, SimState } from '@/lib/sim/scenario/types';
import { resetCode, setBaseline, setNibpReading, setScriptedVitals, useDefibStore, type ScriptedVitals } from '@/lib/sim/defib';
import { resolveProfile, type HemoProfile } from '@/lib/ecg/profiles';
import type { AnyLead } from '@/lib/ecg/vector';
import { scrubTo, sim } from '@/lib/sim/simulation';
import type { LearningLevel } from '@/store/useAppStore';
import { useECGStore, type ECGLayout, type ECGLead } from '@/store/useECGStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { untreatedRhythm } from '@/store/useMedStore';

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
  /** your read of the test that is waiting for one */
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

/**
 * Whether the EtCO₂ in `next` is a number left from before an arrest: the patient lost the pulse (in this step, or
 * earlier with nothing since) and the case did not give a number for the arrest. A case that starts in arrest, or
 * that sets one when the pulse goes or later (no breaths yet, the first breaths, ventilated CPR), gives its own.
 */
export function staleEtco2(prev: SimState | null, next: SimState, wasStale: boolean): boolean {
  if (next.pulse || !prev || prev.scenarioId !== next.scenarioId) return false;
  if (next.vitals.etco2 !== prev.vitals.etco2) return false;
  return prev.pulse || wasStale;
}

/**
 * What the monitor's sensors would show for this patient. In cardiac arrest the case's own EtCO₂ is what the
 * capnograph reads; only a number left from before the arrest (`stale`: a perfusing 30–40, which during CPR would
 * look like ROSC) gives way to the shared arrest rule (arrestEtco2 in the scenario kit), which the engine's
 * capnography line reads too. A patient on a continuous-flow LVAD perfuses with almost no pulsation: the pleth is nearly
 * flat (and the NIBP cannot read: see show), while the ECG, the SpO₂ number, the capnograph and an arterial line work.
 */
export function monitorVitals(s: SimState, stale = false): ScriptedVitals {
  const v = s.vitals;
  if (s.pulse) return { pulse: true, sbp: v.sbp, dbp: v.dbp, spo2: v.spo2, rr: v.rr, etco2: v.etco2, ...(s.lvad ? { continuousFlow: true } : {}) };
  return { pulse: false, sbp: 0, dbp: 0, spo2: v.spo2, rr: ventilated(s) ? 10 : 0, etco2: stale ? arrestEtco2(s) : v.etco2 };
}

/**
 * The heart behind the monitor's pressure waveforms and the heart sounds. The VT profile's own heart is the failing
 * one of an unstable VT (cardiogenic shock: a small pleth, an S3); in a case the patient's numbers say whether this
 * VT is stable, so a VT with a pulse and a systolic of 90 or more gets the normal heart a stable VT has (as the
 * defibrillator trainer's stable VT does). Every other rhythm keeps its own.
 */
export function caseBaseline(s: SimState): HemoProfile | null {
  const p = resolveProfile(s.rhythm.profile);
  return s.pulse && p.rhythm === 'vt' && p.hemo === 'shock' && s.vitals.sbp >= 90 ? 'normal' : null;
}

/** Which monitor channels are connected */
export function attached(s: SimState) {
  const f = s.flags;
  // in the cath lab, the pressure from the arterial sheath shows once it is in and the transducers are zeroed;
  // a wedged guide damps it until it is backed out
  const art = 'access' in f && 'transducer' in f ? ('damped' in f && !('repositioned' in f) ? 'damped' as const : true) : false;
  return { ecg: 'monitor' in f || 'pads' in f || 'ecg12' in f, pleth: 'monitor' in f, co2: 'capno' in f || 'airway' in f, art };
}

// ─── Side effects on the shared monitor ─────────────────────────────────────

/**
 * A pacer that fires without capturing (the case flag 'pacer-no-capture': a wire out of the ventricle, a threshold a high
 * potassium has pushed out of reach): its spikes are drawn at the set rate over the patient's own rhythm, which is what the
 * 12-lead is read as. The rate is the case's timer 'pacer-rate', or 70.
 */
export const NO_CAPTURE_FLAG = 'pacer-no-capture';
export const NO_CAPTURE_RATE = 70;

/** Spans of monitor time with spikes that bring no beat: one spike every `period` ms from `start` until `end` */
const noCapture: { start: number; end: number; period: number }[] = [];
/** What the recording carried before the case's spikes were laid over it (the defibrillator's artefacts), put back after */
let beneath: ((t: number, lead: AnyLead) => number) | null = null;

/** The leads in which a spike from the right ventricle points down (as the defibrillator draws its pacer spikes) */
const SPIKE_DOWN: ReadonlySet<string> = new Set(['aVR', 'aVL']);

/** The recording's extra signals: whatever was there, and the case's non-capturing pacer spikes */
export function caseArtefacts(t: number, lead: AnyLead): number {
  let v = beneath ? beneath(t, lead) : 0;
  for (let i = noCapture.length - 1; i >= 0; i--) {
    const p = noCapture[i];
    if (t < p.start) continue;
    if (t >= p.end) break;
    const dt = (t - p.start) % p.period;
    v += (SPIKE_DOWN.has(lead) ? -1 : 1) * (2.2 * Math.exp(-Math.pow(dt / 1.4, 2)) + 0.25 * Math.exp(-dt / 35) * (dt > 2 ? 1 : 0));
    break;
  }
  return v;
}

/** The spans of non-capturing spikes on the monitor now (for the tests) */
export const noCaptureSpans = () => noCapture.map((p) => ({ ...p }));

/** Start or stop the spikes as the case says the pacer fires without capture, at its rate */
function syncNoCapture(s: SimState) {
  const on = NO_CAPTURE_FLAG in s.flags;
  const period = 60000 / (s.timers['pacer-rate'] ?? NO_CAPTURE_RATE);
  const last = noCapture[noCapture.length - 1];
  const open = !!last && last.end === Infinity;
  if (open && (!on || last.period !== period)) last.end = sim.time;
  if (on && !(open && last.period === period)) noCapture.push({ start: sim.time, end: Infinity, period });
  // laid over whatever else the recording carries, and kept on top if that was installed after it
  if (noCapture.length && sim.engine.external !== caseArtefacts) {
    beneath = sim.engine.external;
    sim.engine.external = caseArtefacts;
  }
}

/** No case spikes on the monitor any more: the recording gets back what it carried before */
function clearNoCapture() {
  noCapture.length = 0;
  if (sim.engine.external === caseArtefacts) sim.engine.external = beneath;
  beneath = null;
}

let saved: null | {
  profile: string; hr: number; layout: ECGLayout; keyLeads: boolean; inspect: ECGLead | null;
  playing: boolean; speed: number;
} = null;

/** The EtCO₂ of the case on the monitor is still the one from before its arrest (see staleEtco2) */
let etco2Stale = false;

/** Show this patient on the monitor and the 12-lead */
function show(s: SimState, prev: SimState | null) {
  // a new (or resumed) case fills the monitor with the patient's rhythm; changes during the case sweep in, as on a real monitor
  if (!prev) {
    clearNoCapture();
    showRhythm(s.rhythm.profile, s.rhythm.hr);
  }
  else if (prev.rhythm.profile !== s.rhythm.profile || prev.rhythm.hr !== s.rhythm.hr) setRhythm(s.rhythm.profile, s.rhythm.hr);
  // after the rhythm: showing a new patient's rhythm drops any baseline, so the case's is set again here
  const baseline = caseBaseline(s);
  if (sim.hemo.baseline !== baseline) setBaseline(baseline);
  setScriptedVitals(monitorVitals(s, etco2Stale));
  syncNoCapture(s);
  const newLines = prev ? s.log.slice(prev.log.length) : [];
  const last = s.performed.at(-1);
  if (prev && last && s.performed.length > prev.performed.length) {
    // the cuff reads only a pulse it can feel: none in arrest, none over a continuous-flow LVAD
    if (last.id === 'nibp') setNibpReading(palpable(s) ? { sbp: s.vitals.sbp, dbp: s.vitals.dbp } : 'fail');
    if (newLines.some((l) => /shock delivered|synchroni[sz]ed shock/i.test(l.text))) useDefibStore.setState({ lastShock: sim.time });
    if ((last.id === 'ecg12' || last.id === 'ecg12-repeat') && s.lastEcg?.minute === s.minute) {
      // a 12-lead records 10 s of the rhythm the patient has now: skip ahead so the tracing does not
      // still show the last seconds of the rhythm before (e.g. VF just after the shock)
      sim.engine.setRhythm(useECGStore.getState().activeProfileId, useTimelineStore.getState().heartRate, sim.time);
      scrubTo(sim.time + 10500);
    }
  }
}

/** Called when the simulator screen opens */
export function enterSimulator() {
  const ecg = useECGStore.getState();
  const tl = useTimelineStore.getState();
  if (!saved) {
    // The doses given in Give meds end when the case takes the monitor, so the workspace gets back its patient from
    // before the first of them: the rhythm a drug produced, with no dose on record, would be a patient never treated
    // (a condition page's "Practice it" button gets here before the case starts and before the screen changes)
    const back = untreatedRhythm();
    saved = {
      profile: back?.profileId ?? ecg.activeProfileId, hr: back?.hr ?? tl.heartRate, layout: ecg.layout, keyLeads: ecg.showKeyLeads,
      inspect: ecg.inspectLead, playing: tl.playing, speed: tl.speed,
    };
  }
  // The learner reads the tracings themselves: no highlighted key leads, no labeled lead
  ecg.setLayout('simultaneous');
  ecg.setInspectLead(null);
  ecg.setElectrodeLab(false);
  if (ecg.showKeyLeads) ecg.toggleKeyLeads();
  tl.setSpeed(1);
  tl.play();
  const s = useSimStore.getState().state;
  if (s) show(s, null);
}

/**
 * Called when the simulator screen closes: the workspace gets its own monitor back. The electrode lab stays shut —
 * it is a tool of its own, and on a phone it would take the whole screen over whatever opens next; Back to the lab's
 * own page opens it again.
 */
export function leaveSimulator() {
  setScriptedVitals(null);
  setNibpReading(null);
  clearNoCapture();
  if (!saved) return;
  const ecg = useECGStore.getState();
  const tl = useTimelineStore.getState();
  showRhythm(saved.profile, saved.hr);
  ecg.setLayout(saved.layout);
  ecg.setInspectLead(saved.inspect);
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
    etco2Stale = staleEtco2(prev, next, etco2Stale);
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
      etco2Stale = false;
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
      update(answerRead(SCENARIO_BY_ID[state.scenarioId], state, optionId));
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
      clearNoCapture();
      etco2Stale = false;
      if (sim.hemo.baseline !== null) setBaseline(null);
      set({ scenarioId: null, state: null, review: null, reviewOpen: false, sheetOpen: false });
    },
    setReviewOpen: (reviewOpen) => set((st) => ({ reviewOpen: reviewOpen && !!st.state?.ended })),
    setSheetOpen: (sheetOpen) => set((st) => ({ sheetOpen: sheetOpen && !!st.state && !st.state.ended })),
  };
});
