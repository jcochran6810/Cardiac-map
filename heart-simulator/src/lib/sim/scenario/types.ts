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

export type Setting = 'field' | 'cathlab';

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

/** `fto`: the field training officer (or, in the cath lab, the preceptor) who checks your 12-lead reads */
export type Speaker = 'dispatch' | 'scene' | 'patient' | 'partner' | 'team' | 'operator' | 'monitor' | 'you' | 'hospital' | 'system' | 'fto';
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
  /** the patient has a perfusing pulse */
  pulse: boolean;
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
  /** your reads and how the FTO / preceptor judged them */
  reads: { kind: ReadKind; minute: number; answer: string; chosen: string; verdict: Verdict }[];
  /** cine runs recorded (cath lab), newest last: the view (intervention id and name) and the real image for it, if the app has one */
  images: { minute: number; id?: string; view: string; image?: string }[];
  /** the last 12-lead recorded: when, and the rhythm on it (an unchanged repeat needs no new read) */
  lastEcg: null | { minute: number; profile: string };
}

export type Line = [Speaker, string] | [Speaker, string, Tone];

/** A read the learner owes: the right option, half-right options, and the explanation the FTO gives */
export interface PendingRead {
  kind: ReadKind;
  minute: number;
  answer: string;
  partial?: string[];
  /** what the FTO / preceptor asks (defaults to the read kind's question) */
  prompt?: string;
  explain: string;
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
}

export interface Harm {
  id: string;
  actions: string[];
  /** judged on the state just before the intervention takes effect */
  when?: (s: SimState) => boolean;
  points: number;
  severity: Severity;
  text: string;
  roles?: LearningLevel[];
}

export type FactKey =
  | 'opqrst' | 'sample' | 'pde5' | 'lungs' | 'perfusion' | 'neuro' | 'ecg12' | 'ecgRight' | 'ecgPosterior'
  | 'labs' | 'echo' | 'ownNitro' | 'allergies'
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
  initial: { rhythm: { profile: string; hr: number }; vitals: Vitals; pulse?: boolean; phase?: string };
  /** answers to history and test questions */
  facts: Partial<Record<FactKey, string | ((s: SimState) => string)>>;
  /** real angiogram / fluoroscopy images for this patient: cine view id → key of CATH_IMAGES (added as they become available) */
  images?: Partial<Record<string, string>>;
  /** what the patient says when reassessed */
  status?: (s: SimState) => string;
  respond: Partial<Record<string, Responder>>;
  events: ScenarioEvent[];
  critical: Critical[];
  harms: Harm[];
  timings?: Timing[];
  /** minutes of transport to the PCI-capable heart centre (field scenarios) */
  transportMinutes?: number;
  /** minutes of transport to the nearest emergency department (default 8) */
  nearestMinutes?: number;
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
  timings: { label: string; minute: number | null; target?: number; met: boolean | null }[];
  wentWell: ReviewItem[];
  toFix: (ReviewItem & { kind: 'missed' | 'late' | 'harm' | 'read' | 'hint'; severity?: Severity })[];
  /** every read: what kind, what you said, what it was */
  reads: { kind: ReadKind; minute: number; chosen: string; answer: string; verdict: Verdict }[];
  /** hints taken during the run */
  hints: number;
  teaching: string[];
}
