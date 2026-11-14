/**
 * The medication session of the Learn view: the doses given to the patient on screen and their effects,
 * played on the shared simulation clock so the live 12-lead changes as each effect arrives.
 *
 * The plan for each dose comes from `src/lib/sim/meds.ts`. Its steps fire in simulation time from
 * SimulationDriver (`tickMeds`): rhythm and rate changes go through `setRhythm`, interval changes (PR, QRS,
 * QT, …) are combined across drugs and handed to the ECG engine as modifiers. Skip ahead brings the next
 * step forward in drug time instead of jumping the clock, so the tracing keeps running in real time. The store keeps what
 * skip-ahead has brought forward (`skipped`): a dose's time (`Given.at`) and the push's `now` are in drug time, sim time
 * plus that, so the interval between two doses is the time the drugs have really had.
 *
 * The learner can also say what the patient has that the monitor cannot show — a history (`problems`, in the case
 * simulator's words) and an age — and the drugs are judged on it too. They belong to the patient: another condition
 * clears them; "Reset patient" (the same patient, untreated again) keeps them, as it keeps the weight.
 *
 * A session belongs to one patient. It ends when another patient is shown (`showRhythm`: a condition, a case, a
 * quiz strip, a lesson step, a defibrillator scenario) and when the case simulator takes the monitor. The main menu
 * and the course list are not another patient: the clock keeps running there, and so do the effects still to come.
 *
 * A VT with a pulse presents as stable or unstable, and the drugs are judged on the blood pressure on the monitor.
 * The VT rhythm's own heart is the failing one of an unstable VT, so on a condition page the learner chooses: stable
 * (the default — the VT the drug cards teach — with a normal heart behind it, as the case simulator and the
 * defibrillator trainer give a stable VT) or unstable (the rhythm's own heart: hypotensive, in shock).
 */
import { create } from 'zustand';
import { sim } from '@/lib/sim/simulation';
import { onNewPatient, setRhythm } from '@/lib/rhythm';
import { combineMods, type RhythmMods } from '@/lib/ecg/mods';
import { standardPlacement } from '@/lib/ecg/placement';
import { CONDITION_TO_PROFILE, resolveProfile, type HemoProfile } from '@/lib/ecg/profiles';
import { setBaseline, useDefibStore } from '@/lib/sim/defib';
import { MED_BY_ID, fmtDose, planDose, type DosePlan, type EffectStep, type Given, type MedId } from '@/lib/sim/meds';
import type { Problem } from '@/lib/sim/scenario/types';
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

/** How a VT with a pulse presents: stable (a normal heart behind it) or unstable (hypotensive, in shock) */
export type VtPresentation = 'stable' | 'unstable';

/**
 * A rhythm that can present either way: a VT with a pulse whose own heart is the failing one of an unstable VT (the
 * VT profile). The same test as the case simulator's caseBaseline.
 */
export function presentsEitherWay(profileId: string): boolean {
  const p = resolveProfile(profileId);
  return p.rhythm === 'vt' && p.hemo === 'shock';
}

interface MedState {
  /** the condition (patient) this session belongs to */
  conditionId: string | null;
  kg: number;
  /** how this condition's VT presents (only VT with a pulse has the choice) */
  vt: VtPresentation;
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
  /** what the patient has that the monitor cannot show (the history the learner sets) */
  problems: Problem[];
  /** age in years (null: not set — the doses are those for an adult under 75) */
  age: number | null;
  /** drug time that skip-ahead has brought forward (ms): drug time = sim time + this */
  skipped: number;

  setKg: (kg: number) => void;
  /** choose how the VT presents, and put the heart that goes with it behind the monitor */
  setVt: (vt: VtPresentation) => void;
  give: (drug: MedId, dose: number) => DosePlan;
  /** add or remove one item of the history */
  toggleProblem: (problem: Problem) => void;
  /** set the age (null clears it) */
  setAge: (age: number | null) => void;
  skipAhead: () => void;
  reset: (conditionId?: string | null) => void;
}

const nextOf = (): MedState['next'] => (pending.length ? { fireAt: pending[0].fireAt, since: pending[0].step.at, drug: pending[0].dose.drug } : null);

export const useMedStore = create<MedState>((set, get) => ({
  conditionId: null,
  kg: 80,
  vt: 'stable',
  given: [],
  log: [],
  marks: [],
  mods: null,
  next: null,
  last: null,
  problems: [],
  age: null,
  skipped: 0,

  setKg: (kg) => set({ kg: Math.max(40, Math.min(200, Math.round(kg))) }),

  setVt: (vt) => {
    set({ vt });
    applyVtHeart();
  },

  give: (drug, dose) => {
    const t = sim.time;
    const ecg = useECGStore.getState();
    const tl = useTimelineStore.getState();
    const s = get();
    const before = onMonitor();
    if (!s.given.length) untreated = before;
    // drug time: the sim clock plus what skip-ahead has brought forward
    const now = t + s.skipped;
    // the blood pressure on the monitor decides, e.g., whether VT is stable and whether nitrates are safe
    const plan = planDose(drug, {
      ...before, kg: s.kg, given: s.given, sbp: sim.hemo.summary(t).sbp, now, age: s.age ?? undefined, problems: s.problems,
      conditionId: s.conditionId ?? undefined,
    }, dose);
    const pushed: Dose = { drug, before, own: null };
    for (const step of plan.steps) pending.push({ fireAt: t + step.at, step, dose: pushed });
    pending.sort((a, b) => a.fireAt - b.fireAt);
    const def = MED_BY_ID[drug];
    const label = `${def.name} ${fmtDose(dose)} ${def.unit}`;
    set({
      given: [...s.given, { id: drug, dose, at: now }],
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

  toggleProblem: (problem) => {
    const { problems } = get();
    set({ problems: problems.includes(problem) ? problems.filter((x) => x !== problem) : [...problems, problem] });
  },

  setAge: (age) => set({ age: age === null || !Number.isFinite(age) ? null : Math.max(18, Math.min(110, Math.round(age))) }),

  skipAhead: () => {
    if (!pending.length) return;
    const lead = pending[0].fireAt - sim.time - 1500;
    if (lead <= 0) return;
    for (const p of pending) p.fireAt -= lead;
    set({ next: nextOf(), skipped: get().skipped + lead });
  },

  reset: (conditionId) => {
    pending.length = 0;
    modsByDrug.clear();
    untreated = null;
    // another condition is another patient: its history and age are not this one's
    const other = conditionId !== undefined && conditionId !== get().conditionId;
    set({
      conditionId: conditionId === undefined ? get().conditionId : conditionId, given: [], log: [], marks: [], mods: null, next: null, last: null, skipped: 0,
      ...(other ? { problems: [], age: null } : {}),
    });
  },
}));

/**
 * Put the heart that goes with the chosen VT presentation behind the monitor: stable — a normal heart (the pressure
 * holds at the usual VT rates; a very fast VT still drops it); unstable — the VT rhythm's own failing one. Only for a
 * condition whose patient is such a VT, and only while that VT is on the monitor: a VT that a drug has caused on
 * another condition's page keeps its own heart, and so does the rhythm a drug has turned this VT into.
 * Showing a rhythm starts a new patient with the rhythm's own heart, so this is called again after every new patient.
 * A defibrillator scenario's patient is not this condition's: its own heart stays (the scenario's story says how its
 * VT presents). A new patient ends the scenario, so the condition's own VT shown again gets the chosen heart.
 */
export function applyVtHeart(conditionId = useMedStore.getState().conditionId) {
  if (useDefibStore.getState().scenario) return;
  const profileId = conditionId ? CONDITION_TO_PROFILE[conditionId] : undefined;
  if (!profileId || !presentsEitherWay(profileId)) return;
  if (useECGStore.getState().activeProfileId !== resolveProfile(profileId).id) return;
  const want: HemoProfile | null = useMedStore.getState().vt === 'stable' ? 'normal' : null;
  if (sim.hemo.baseline !== want) setBaseline(want);
}

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

/**
 * The drug effects on the intervals to draw on the tracing now. They belong to the patient on the monitor, wherever
 * the learner is — the main menu and the course list included, where the clock keeps running — except in the case
 * simulator, whose patient has been given none of them (the session ends as it takes the monitor).
 */
export function drugMods(): RhythmMods | null {
  return useAppStore.getState().mode === 'simulator' ? null : useMedStore.getState().mods;
}

/**
 * The patient before the first dose of this session (null when nothing has been given). Whatever borrows the monitor
 * for another patient — a quiz strip — hands it back to this rhythm: the doses are forgotten once another patient
 * has been shown, so the treated rhythm would be a patient who was never given anything.
 */
export function untreatedRhythm(): { profileId: string; hr: number } | null {
  return useMedStore.getState().given.length && untreated ? { ...untreated } : null;
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
