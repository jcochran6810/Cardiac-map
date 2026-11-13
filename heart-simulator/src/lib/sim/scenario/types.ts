/**
 * Scenario simulator types.
 *
 * A scenario is a scripted patient: a starting rhythm and vitals, what the patient and the team say,
 * how each intervention changes the patient (rhythm, vitals, dialog), timed or conditional events,
 * the critical interventions the learner's role is expected to perform (with time targets), and the
 * harmful choices that cost points. The engine (engine.ts) is pure and deterministic: the same
 * choices always give the same patient and the same score.
 */
import type { LearningLevel } from '@/store/useAppStore';
import type { ReadKind, Verdict } from './reads';

/**
 * Where a case happens: an ambulance call (EMT and paramedic), the emergency department (ER nurse and ER doctor) or the
 * cath lab (tech, nurse and cardiologist). The setting decides which actions are offered (Intervention.settings) and how
 * the defaults answer: who comes when you call for help, when a hand-off is allowed, who the teammate beside you is.
 */
export type Setting = 'field' | 'ed' | 'cathlab';

export type Category = 'assess' | 'monitor' | 'imaging' | 'airway' | 'access' | 'meds' | 'devices' | 'resus' | 'procedure' | 'team';

export interface Intervention {
  id: string;
  label: string;
  category: Category;
  /** Roles whose scope includes this intervention */
  roles: LearningLevel[];
  /** Settings where it is offered (default: all) */
  settings?: Setting[];
  /** Scenario minutes it takes */
  minutes: number;
  /** Dose, route or a short how-to */
  detail?: string;
  /**
   * The detail where one setting needs other words (e.g. the ED's heparin dose next to the lab's PCI dose): it replaces
   * `detail` in that setting (interventionsFor and the engine's log read it through detailFor)
   */
  detailBySetting?: Partial<Record<Setting, string>>;
  repeatable?: boolean;
  maxTimes?: number;
  /** IV/IO medication or fluid: needs vascular access first */
  needsAccess?: boolean;
}

export interface Vitals {
  sbp: number;
  dbp: number;
  spo2: number;
  rr: number;
  etco2: number;
  /** 0–10 */
  pain: number;
  gcs: number;
  /** mg/dL */
  glucose: number;
  /** °C */
  temp: number;
}

/**
 * Who says a line. `feedback`: the simulator's own feedback — it checks each of your reads the moment you give it
 * (self-paced: no instructor needed). `operator`: the cardiologist at the table in a cath lab case (shown as
 * "Cardiologist") — never in an emergency department case. The emergency department's own voices: `physician` (the ED
 * physician, who gives the orders when the learner is the ER nurse), `nurse` (the ED nurse, who does the nursing when the
 * learner is the ER doctor), `consultant` (cardiology, on the phone or at the bedside) and `ems` (the crew that brought
 * the patient in). `dispatch`, `scene` and `partner` belong to the field.
 */
export type Speaker =
  | 'dispatch' | 'scene' | 'patient' | 'partner' | 'team' | 'operator' | 'monitor' | 'you' | 'hospital' | 'system' | 'feedback'
  | 'physician' | 'nurse' | 'consultant' | 'ems';
export type Tone = 'info' | 'good' | 'warn' | 'bad';

export interface LogEntry {
  minute: number;
  who: Speaker;
  text: string;
  tone?: Tone;
}

export type Severity = 'minor' | 'major' | 'critical';
export type EndReason = 'complete' | 'death' | 'stopped';

export interface Penalty {
  id: string;
  minute: number;
  points: number;
  severity: Severity;
  text: string;
}

export interface SimState {
  scenarioId: string;
  role: LearningLevel;
  /** scenario clock, minutes since first patient contact */
  minute: number;
  rhythm: { profile: string; hr: number };
  vitals: Vitals;
  /**
   * the patient has a perfusing circulation (not in cardiac arrest). With a continuous-flow LVAD (`lvad`) that circulation
   * is the pump's, and it has no pulse to feel
   */
  pulse: boolean;
  /**
   * the patient lives on a continuous-flow left ventricular assist device (Scenario.initial.lvad). While the pump runs
   * (`pulse` true) there is no palpable pulse, no cuff or NIBP pressure and only a Doppler MAP (the mean of `vitals`);
   * the monitor's pleth is nearly flat. Whether the pump is perfusing is judged as the 2025 AHA durable LVAD algorithm
   * does (engine lvadPerfusing): awake (GCS 9 or more) or a Doppler MAP over 50. An unresponsive LVAD patient with a MAP of
   * 50 or less is not perfusing even with `pulse` true: compressions and the AED are right, not penalized. The pressure
   * rules read the MAP (engine lowPressure: under 60), not the systolic. Absent for every other patient
   */
  lvad?: true;
  phase: string;
  /** flag → minute it was first set (e.g. monitor, iv, rosc, vf) */
  flags: Record<string, number>;
  /** scheduled clock times, e.g. arrival at hospital */
  timers: Record<string, number>;
  /** intervention id → times performed */
  counts: Record<string, number>;
  performed: { id: string; minute: number }[];
  log: LogEntry[];
  penalties: Penalty[];
  /** fired event ids */
  fired: string[];
  ended: null | { reason: EndReason; minute: number };
  /** a test waiting for your read (12-lead, pressures, …): nothing else can be done until you give it */
  pendingRead: PendingRead | null;
  /** reads asked for while another one was waiting */
  queuedReads: PendingRead[];
  /** your reads and how the feedback judged them */
  reads: { kind: ReadKind; minute: number; answer: string; chosen: string; verdict: Verdict }[];
  /** cine runs recorded (cath lab), newest last: the view (intervention id and name) and the real image for it, if the app has one */
  images: { minute: number; id?: string; view: string; image?: string }[];
  /**
   * the last 12-lead recorded: when, and the rhythm and rate on it (an unchanged repeat needs no new read, and keeps the
   * rate of the tracing it repeats: see ecgChanged in engine.ts). Whether any tracing so far met STEMI criteria is the
   * flag 'ecg-stemi': a later tracing that hides the ST elevation does not undo it
   */
  lastEcg: null | { minute: number; profile: string; hr: number };
}

export type Line = [Speaker, string] | [Speaker, string, Tone];

/** A read the learner owes: the right option, half-right options, and the explanation the feedback gives */
export interface PendingRead {
  kind: ReadKind;
  minute: number;
  answer: string;
  partial?: string[];
  /** the question shown to the learner (defaults to the read kind's question) */
  prompt?: string;
  explain: string;
  /** the real image this read is about: its run number (1-based) in SimState.images */
  run?: number;
}

/** What an intervention or event does to the patient */
export interface Effect {
  say?: Line[];
  vitals?: Partial<Vitals>;
  rhythm?: { profile: string; hr: number };
  pulse?: boolean;
  phase?: string;
  flags?: string[];
  clear?: string[];
  timers?: Record<string, number>;
  /** the intervention could not be performed: no time passes and it is not counted */
  blocked?: boolean;
  end?: EndReason;
  /** ask the learner to read what this showed (pressures, FFR, sizing, a sudden change, an angiogram) */
  read?: Omit<PendingRead, 'minute'>;
  /** a cine run: the view (intervention id and name), and the real angiogram for it when the app has one (a key of CATH_IMAGES) */
  image?: { id?: string; view: string; image?: string };
}

/** Scenario-specific response; return null to fall back to the default response */
export type Responder = (s: SimState) => Effect | null;

export interface ScenarioEvent {
  id: string;
  when: (s: SimState) => boolean;
  effect: (s: SimState) => Effect;
}

export interface Critical {
  id: string;
  label: string;
  /** why it matters (shown in the review when missed) */
  why: string;
  /** interventions that satisfy it, or a function returning the minute it was achieved */
  done: string[] | ((s: SimState) => number | null);
  /** only count performances at or after this flag was set (e.g. a repeat ECG after ROSC) */
  after?: string;
  roles?: LearningLevel[];
  points?: number;
  /** full marks only if achieved by this clock minute, or within N minutes of a flag */
  target?: { by?: number; within?: { flag: string; minutes: number } };
  /** the item only applies if this is true at the end (e.g. only if VF happened) */
  applies?: (s: SimState) => boolean;
  /** interventions a function-style `done` looks for (lets the library find the cases that use an action) */
  uses?: string[];
}

export interface Harm {
  id: string;
  actions: string[];
  /** judged on the state just before the intervention takes effect (and on what the case says the patient has) */
  when?: (s: SimState, sc: Scenario) => boolean;
  points: number;
  severity: Severity;
  text: string;
  roles?: LearningLevel[];
  /**
   * Built-in safety rules this scenario rule stands in for, because it already covers the same mistake in its
   * own words (e.g. nitroglycerin in an RV infarct also covers nitroglycerin with a low pressure): one mistake,
   * one penalty. A scenario rule with the same id as a built-in one replaces it anyway.
   */
  replaces?: string[];
}

/**
 * Something the patient has that decides whether a drug is indicated or dangerous. The engine's built-in safety rules
 * cannot read it from the tracing or the vitals, so the case says so (Scenario.problems); the learner never sees the list.
 * Without it, calcium, bicarbonate, insulin and high-dose albuterol count as given with no indication, and nothing
 * stops procainamide in a failing heart — so a case where one of these is right must list the problem behind it.
 */
export type Problem =
  | 'hyperkalemia'
  | 'metabolic-acidosis'
  | 'hypocalcemia'
  | 'beta-blocker-overdose'
  /** calcium-channel blocker */
  | 'ccb-overdose'
  /** tricyclics and other sodium-channel blockers: a wide QRS that bicarbonate narrows */
  | 'sodium-channel-blocker-overdose'
  /**
   * heart failure with a reduced ejection fraction (40 % or less), decompensated or not: IV diltiazem and verapamil are
   * harmful (2023 ACC/AHA/ACCP/HRS AF guideline: 3 — Harm) and procainamide is to be avoided
   */
  | 'heart-failure'
  | 'long-qt'
  /** fluid on the lungs (e.g. hypertensive acute pulmonary edema): a fluid bolus or raised legs add to it */
  | 'pulmonary-edema'
  /** acute intoxication with cocaine, methamphetamine or another sympathomimetic: no beta-blocker (unopposed alpha) */
  | 'sympathomimetic-toxicity'
  /** an acute aortic dissection: antithrombotic and fibrinolytic drugs make the tear bleed */
  | 'aortic-dissection'
  /** major bleeding (e.g. a retroperitoneal bleed): what a transfusion of packed red cells treats */
  | 'bleeding'
  /** cardiac tamponade: what a pericardiocentesis treats (in the emergency department the built-in rule reads it) */
  | 'tamponade'
  /** a pulmonary embolism: with a STEMI, the indication for a fibrinolytic in the emergency department (high risk, or in arrest) */
  | 'pulmonary-embolism';

export type FactKey =
  | 'opqrst' | 'sample' | 'pde5' | 'lungs' | 'perfusion' | 'neuro' | 'ecg12' | 'ecgRight' | 'ecgPosterior'
  | 'labs' | 'echo' | 'ownNitro' | 'allergies'
  /** what the poison center advises (field: the 'poison-control' call) */
  | 'poisonControl'
  /** the blood pressure in each arm ('bp-both-arms'; default: the same pressure in both) */
  | 'bpArms'
  /** the LVAD check: pump hum, controller display and alarms, power and driveline ('lvad-check') */
  | 'lvad'
  /** what the VAD team says on the phone ('call-vad') */
  | 'vadTeam'
  /** the urgent CT ('ct-urgent') */
  | 'ct'
  /** emergency department: the EMS crew's hand-off report ('ems-handoff'; none: the patient came in on their own) */
  | 'ems'
  /** emergency department: the triage nurse's level and reason ('triage'; default: an ESI level from the vitals) */
  | 'triage'
  /** emergency department: the portable chest X-ray ('cxr') */
  | 'cxr'
  /** emergency department: the physician's bedside ultrasound of the heart, lungs, IVC and aorta ('pocus'; falls back to 'echo') */
  | 'pocus'
  /** emergency department: what the cardiology consultant says ('consult-cardiology') */
  | 'consult'
  /** emergency department: the repeat high-sensitivity troponin, 1–3 hours after the first ('troponin-repeat'; the first is in 'labs') */
  | 'troponin'
  | 'angio' | 'lvgram' | 'lvedp' | 'rhc' | 'ivus' | 'oct' | 'ffr' | 'final';

export interface Timing {
  label: string;
  /** intervention ids (first time any was done) */
  actions: string[];
  /** or the minute a flag was set (e.g. something a teammate did) */
  flag?: string;
  /** goal, minutes from the start (or from `from`) */
  target?: number;
  from?: string;
}

export interface Scenario {
  id: string;
  title: string;
  /** one line for the picker */
  summary: string;
  setting: Setting;
  roles: LearningLevel[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  /** related library condition, for "learn about this" */
  conditionId?: string;
  /** opening lines, per role (falls back to `default`) */
  briefing: { default: Line[] } & Partial<Record<LearningLevel, Line[]>>;
  initial: {
    rhythm: { profile: string; hr: number }; vitals: Vitals; pulse?: boolean; phase?: string;
    /**
     * the patient lives on a continuous-flow LVAD (SimState.lvad): give `vitals` a narrow pulse pressure around the MAP the
     * Doppler should read (e.g. 84/72 → Doppler MAP 76; a pulse pressure down to 2 mmHg is kept as written, e.g. 80/76 → 77);
     * `pulse` stays true while the pump runs. The safety rules judge low pressure by the MAP (under 60) and, for CPR and the
     * AED, perfusion by GCS 9 or more or a MAP over 50; a case that wants skin, capillary refill or EtCO₂ to decide says so in
     * its own respond handlers
     */
    lvad?: boolean;
  };
  /** answers to history and test questions */
  facts: Partial<Record<FactKey, string | ((s: SimState) => string)>>;
  /** real angiogram / fluoroscopy images for this patient: cine view id → key of CATH_IMAGES (added as they become available) */
  images?: Partial<Record<string, string>>;
  /** what the patient has that the built-in drug safety rules need to know (see Problem) */
  problems?: Problem[];
  /** what the patient says when reassessed */
  status?: (s: SimState) => string;
  respond: Partial<Record<string, Responder>>;
  events: ScenarioEvent[];
  critical: Critical[];
  harms: Harm[];
  timings?: Timing[];
  /** minutes of transport to the PCI-capable heart center (field scenarios) */
  transportMinutes?: number;
  /** minutes of transport to the nearest emergency department (default 8) */
  nearestMinutes?: number;
  /**
   * emergency department: minutes from activating the cath lab ('cath-lab-activate', or a case event that sets the timer
   * `cathReady`) to the team being ready for the patient (default 20). The flag 'cath-ready' is set then, and the hand-off
   * to the cath lab team waits for it
   */
  cathLabMinutes?: number;
  arrival?: string;
  /** minutes pulseless without ROSC before the patient dies (default 15) */
  deathAfter?: number;
  /** extra condition for finishing, on top of all critical items done */
  completeWhen?: (s: SimState) => boolean;
  teaching: string[];
}

export interface ReviewItem {
  label: string;
  detail: string;
  points: number;
}

export interface Review {
  percent: number;
  earned: number;
  max: number;
  penaltyPoints: number;
  grade: 'Excellent' | 'Competent' | 'Needs practice' | 'Unsafe';
  outcome: string;
  /** critical items for this role never done (a hand-off can end the case with some still missing) */
  missed: number;
  timings: { label: string; minute: number | null; target?: number; met: boolean | null }[];
  wentWell: ReviewItem[];
  /** `actions`: the interventions the item is about (to link the learner to what to study) */
  toFix: (ReviewItem & { kind: 'missed' | 'late' | 'harm' | 'read' | 'hint'; severity?: Severity; actions?: string[] })[];
  /** every read: what kind, what you said, what it was */
  reads: { kind: ReadKind; minute: number; chosen: string; answer: string; verdict: Verdict }[];
  /** hints taken during the run */
  hints: number;
  teaching: string[];
}
