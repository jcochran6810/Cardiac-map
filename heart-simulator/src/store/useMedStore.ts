/**
 * The medication session of the Learn view: the doses given to the patient on screen and their effects,
 * played on the shared simulation clock so the live 12-lead changes as each effect arrives.
 *
 * The plan for each dose comes from `src/lib/sim/meds.ts`. Its steps fire in simulation time from
 * SimulationDriver (`tickMeds`): rhythm and rate changes go through `setRhythm`, interval changes (PR, QRS,
 * QT, …) are combined across drugs and handed to the ECG engine as modifiers. Skip ahead brings the next
 * step forward in drug time instead of jumping the clock, so the tracing keeps running in real time.
 *
 * A session belongs to one patient. It ends when another patient is shown (`showRhythm`: a condition, a case, a
 * quiz strip, a lesson step, a defibrillator scenario) and when the case simulator takes the monitor. The main menu
 * and the course list are not another patient: the clock keeps running there, and so do the effects still to come.
 */
import { create } from 'zustand';
import { sim } from '@/lib/sim/simulation';
import { onNewPatient, setRhythm } from '@/lib/rhythm';
import { combineMods, type RhythmMods } from '@/lib/ecg/mods';
import { standardPlacement } from '@/lib/ecg/placement';
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

interface Rhythm {
  profileId: string;
  hr: number;
}

/** One push of a drug */
interface Dose {
  drug: MedId;
  /** the rhythm on the monitor when the dose was given, for effects that wear off */
  before: Rhythm;
  /** the rhythm this dose last put on the monitor itself (null until it changes it) */
  own: Rhythm | null;
}

interface Pending {
  fireAt: number;
  step: EffectStep;
  dose: Dose;
}

// Not React state: read every frame by the simulation loop
const pending: Pending[] = [];
const modsByDrug = new Map<MedId, RhythmMods>();
/** the rhythm the patient had before the first dose of this session */
let untreated: Rhythm | null = null;

const onMonitor = (): Rhythm => ({ profileId: useECGStore.getState().activeProfileId, hr: useTimelineStore.getState().heartRate });
const same = (a: Rhythm, b: Rhythm) => a.profileId === b.profileId && a.hr === b.hr;

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

const nextOf = (): MedState['next'] => (pending.length ? { fireAt: pending[0].fireAt, since: pending[0].step.at, drug: pending[0].dose.drug } : null);

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
    const before = onMonitor();
    if (!s.given.length) untreated = before;
    // the blood pressure on the monitor decides, e.g., whether VT is stable and whether nitrates are safe
    const plan = planDose(drug, { ...before, kg: s.kg, given: s.given, sbp: sim.hemo.summary(t).sbp }, dose);
    const pushed: Dose = { drug, before, own: null };
    for (const step of plan.steps) pending.push({ fireAt: t + step.at, step, dose: pushed });
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
    // …on cables that are where they belong: a reversal left over from the electrode lab would falsify what the drug does
    standardPlacement();
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
    untreated = null;
    set({ conditionId: conditionId === undefined ? get().conditionId : conditionId, given: [], log: [], marks: [], mods: null, next: null, last: null });
  },
}));

function apply(job: Pending) {
  const { step, dose } = job;
  const { drug } = dose;
  if (step.mods !== undefined) {
    if (step.mods) modsByDrug.set(drug, step.mods);
    else modsByDrug.delete(drug);
  }
  let note = step.note;
  let mark = step.mark;
  const now = onMonitor();
  if (step.restore) {
    // A dose wearing off takes back what that dose did, nothing else. If the monitor no longer shows what it left
    // there (a later dose took effect, a shock, the learner's own hand on the rate), there is nothing of it to undo.
    if (dose.own && same(now, dose.own)) setRhythm(dose.before.profileId, dose.before.hr);
    else {
      // a later transient dose that started from this one's effect must now wear off to where this one would have
      if (dose.own) for (const p of pending) if (p.dose !== dose && same(p.dose.before, dose.own)) p.dose.before = dose.before;
      note = `${MED_BY_ID[drug].name} has worn off. The rhythm has changed since it was given, so nothing changes now.`;
      mark = undefined;
    }
  } else if (step.profile !== undefined || step.hr !== undefined) {
    // The step was worked out for the rhythm on the monitor at the push (or the one this dose has turned it into).
    // If something else ended that rhythm first — another drug, a shock — the step must not act on the new one:
    // "the SVT slows to 166" is not something to do to the sinus rhythm adenosine has just restored.
    if (now.profileId !== dose.before.profileId && now.profileId !== dose.own?.profileId) {
      note = `${MED_BY_ID[drug].name}: the rhythm it was given for has changed since (another drug or a shock acted first), so the change expected here does not happen.`;
      mark = undefined;
    } else {
      const profileId = step.profile ?? now.profileId;
      let hr = step.hr;
      // a new rhythm comes at its own usual rate unless the step gives one: torsades does not run at the sinus rate before it
      if (hr === undefined) hr = profileId === now.profileId ? now.hr : undefined;
      else if (step.profile === undefined) {
        // A rate worked out for the rate this dose expected. If another effect has moved the rate meanwhile, the
        // step still only moves it its own way: a drug that slows never speeds the heart up to "its" rate.
        const expected = (dose.own ?? dose.before).hr;
        if (now.hr !== expected) hr = hr < expected ? Math.min(now.hr, hr) : hr > expected ? Math.max(now.hr, hr) : now.hr;
      }
      setRhythm(profileId, hr);
      dose.own = onMonitor();
    }
  }
  const s = useMedStore.getState();
  useMedStore.setState({
    mods: combineMods(Array.from(modsByDrug.values())),
    log: [...s.log, { t: job.fireAt, since: step.at, drug, text: note, tone: step.tone }].slice(-60),
    marks: mark ? [...s.marks, { t: job.fireAt, label: mark }].slice(-30) : s.marks,
  });
}

/** Called every frame by SimulationDriver: fire the effects that are due */
export function tickMeds(t: number) {
  if (!pending.length) return;
  let fired = false;
  while (pending.length && pending[0].fireAt <= t) {
    apply(pending.shift()!);
    fired = true;
  }
  if (fired) useMedStore.setState({ next: nextOf() });
}

// A new patient has been given nothing.
onNewPatient(() => {
  const s = useMedStore.getState();
  if (pending.length || modsByDrug.size || s.given.length || s.log.length || s.mods) s.reset();
});

// The case simulator takes the monitor for a patient of its own, so the session ends there. The monitor first goes
// back to the rhythm from before the first dose: that is what the simulator keeps and hands back afterwards — an
// untreated patient, which is what a session with no doses in it must show.
useAppStore.subscribe((app, was) => {
  if (app.mode !== 'simulator' || was.mode === 'simulator') return;
  const s = useMedStore.getState();
  if (!s.given.length) return;
  const back = untreated;
  s.reset();
  if (back) setRhythm(back.profileId, back.hr);
});
