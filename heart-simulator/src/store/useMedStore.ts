/**
 * The medication session of the Learn view: the doses given to the patient on screen and their effects,
 * played on the shared simulation clock so the live 12-lead changes as each effect arrives.
 *
 * The plan for each dose comes from `src/lib/sim/meds.ts`. Its steps fire in simulation time from
 * SimulationDriver (`tickMeds`): rhythm and rate changes go through `setRhythm`, interval changes (PR, QRS,
 * QT, …) are combined across drugs and handed to the ECG engine as modifiers. Skip ahead brings the next
 * step forward in drug time instead of jumping the clock, so the tracing keeps running in real time.
 */
import { create } from 'zustand';
import { sim } from '@/lib/sim/simulation';
import { setRhythm } from '@/lib/rhythm';
import { combineMods, type RhythmMods } from '@/lib/ecg/mods';
import { MED_BY_ID, fmtDose, planDose, type DosePlan, type EffectStep, type Given, type MedId } from '@/lib/sim/meds';
import { useECGStore } from '@/store/useECGStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { useAppStore } from '@/store/useAppStore';

export interface MedLogEntry {
  /** simulation time it happened (ms) */
  t: number;
  /** drug time: ms after that dose was given */
  since: number;
  drug: MedId;
  text: string;
  tone: 'push' | EffectStep['tone'];
}

export interface MedMark {
  t: number;
  label: string;
}

interface Pending {
  fireAt: number;
  step: EffectStep;
  drug: MedId;
  /** the rhythm on the monitor when the dose was given, for effects that wear off */
  restoreTo: { profileId: string; hr: number };
}

// Not React state: read every frame by the simulation loop
const pending: Pending[] = [];
const modsByDrug = new Map<MedId, RhythmMods>();

interface MedState {
  /** the condition (patient) this session belongs to */
  conditionId: string | null;
  kg: number;
  given: Given[];
  log: MedLogEntry[];
  /** labels drawn on the ECG strip where they happened */
  marks: MedMark[];
  /** combined drug effects on the intervals, handed to the ECG engine */
  mods: RhythmMods | null;
  /** the next effect still to come: when (sim time) and its drug time */
  next: { fireAt: number; since: number; drug: MedId } | null;
  /** the last dose and how it was judged */
  last: { drug: MedId; dose: number; plan: DosePlan } | null;

  setKg: (kg: number) => void;
  give: (drug: MedId, dose: number) => DosePlan;
  skipAhead: () => void;
  reset: (conditionId?: string | null) => void;
}

const nextOf = (): MedState['next'] => (pending.length ? { fireAt: pending[0].fireAt, since: pending[0].step.at, drug: pending[0].drug } : null);

export const useMedStore = create<MedState>((set, get) => ({
  conditionId: null,
  kg: 80,
  given: [],
  log: [],
  marks: [],
  mods: null,
  next: null,
  last: null,

  setKg: (kg) => set({ kg: Math.max(40, Math.min(200, Math.round(kg))) }),

  give: (drug, dose) => {
    const t = sim.time;
    const ecg = useECGStore.getState();
    const tl = useTimelineStore.getState();
    const s = get();
    const restoreTo = { profileId: ecg.activeProfileId, hr: tl.heartRate };
    // the blood pressure on the monitor decides, e.g., whether VT is stable and whether nitrates are safe
    const plan = planDose(drug, { ...restoreTo, kg: s.kg, given: s.given, sbp: sim.hemo.summary(t).sbp }, dose);
    for (const step of plan.steps) pending.push({ fireAt: t + step.at, step, drug, restoreTo });
    pending.sort((a, b) => a.fireAt - b.fireAt);
    const def = MED_BY_ID[drug];
    const label = `${def.name} ${fmtDose(dose)} ${def.unit}`;
    set({
      given: [...s.given, { id: drug, dose, at: t }],
      log: [...s.log, { t, since: 0, drug, text: `${label} — ${def.route}`, tone: 'push' as const }].slice(-60),
      marks: [...s.marks, { t, label }].slice(-30),
      last: { drug, dose, plan },
      next: nextOf(),
    });
    // Watch it happen: the live 12-lead, running
    if (ecg.bottomView !== 'ecg') ecg.setBottomView('ecg');
    if (ecg.layout === 'monitor') ecg.setLayout('simultaneous');
    if (ecg.electrodeLab) ecg.setElectrodeLab(false);
    if (!tl.playing) tl.play();
    return plan;
  },

  skipAhead: () => {
    if (!pending.length) return;
    const lead = pending[0].fireAt - sim.time - 1500;
    if (lead <= 0) return;
    for (const p of pending) p.fireAt -= lead;
    set({ next: nextOf() });
  },

  reset: (conditionId) => {
    pending.length = 0;
    modsByDrug.clear();
    set({ conditionId: conditionId === undefined ? get().conditionId : conditionId, given: [], log: [], marks: [], mods: null, next: null, last: null });
  },
}));

function apply(job: Pending) {
  const { step, drug } = job;
  if (step.mods !== undefined) {
    if (step.mods) modsByDrug.set(drug, step.mods);
    else modsByDrug.delete(drug);
  }
  if (step.restore) setRhythm(job.restoreTo.profileId, job.restoreTo.hr);
  else if (step.profile !== undefined || step.hr !== undefined) {
    setRhythm(step.profile ?? useECGStore.getState().activeProfileId, step.hr ?? useTimelineStore.getState().heartRate);
  }
  const s = useMedStore.getState();
  useMedStore.setState({
    mods: combineMods(Array.from(modsByDrug.values())),
    log: [...s.log, { t: job.fireAt, since: step.at, drug, text: step.note, tone: step.tone }].slice(-60),
    marks: step.mark ? [...s.marks, { t: job.fireAt, label: step.mark }].slice(-30) : s.marks,
  });
}

/** Called every frame by SimulationDriver: fire the effects that are due */
export function tickMeds(t: number) {
  if (!pending.length) return;
  // The case simulator (or Home) has the monitor now: drop what was still to come
  if (useAppStore.getState().mode !== 'learn') {
    pending.length = 0;
    modsByDrug.clear();
    useMedStore.setState({ mods: null, next: null });
    return;
  }
  let fired = false;
  while (pending.length && pending[0].fireAt <= t) {
    apply(pending.shift()!);
    fired = true;
  }
  if (fired) useMedStore.setState({ next: nextOf() });
}
