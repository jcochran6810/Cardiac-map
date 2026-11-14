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
  /** minutes it takes during CPR, when shorter (e.g. a drug pushed between compressions) */
  arrestMinutes?: number;
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
  /** every action performed, in order; `shocked`: a shock was actually delivered (not a SYNC that never fired, not "no shock advised") */
  performed: { id: string; minute: number; shocked?: true }[];
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
  /**
   * a preventable deterioration the case charges (e.g. the pressure falls because no fluid was given): added to the
   * penalties once per id, at the minute the effect applies
   */
  penalty?: Omit<Penalty, 'minute'>;
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
  /**
   * judged on the state just before the intervention takes effect (and on what the case says the patient has); `id` is
   * the action being judged (one of `actions`), for a rule that covers several
   */
  when?: (s: SimState, sc: Scenario, id: string) => boolean;
  points: number;
  severity: Severity;
  text: string;
  roles?: LearningLevel[];
  /**
   * Built-in rules this case rule stands in for while it applies: when its action, role and `when` all match the action
   * being judged, the listed built-ins are not charged for it (one mistake, one penalty). In any other state the built-ins
   * still apply. A case rule with the same id as a built-in replaces it for the actions it lists — a deliberate exemption.
   */
  replaces?: string[];
  /**
   * A wrong answer to a team request (labKit askHarm): when it charges an act together with another rule that judges the
   * same drug or device, only the heavier of them charges — on a tie, the wrong answer (the case's words). The checks
   * before a nitrate are mistakes of their own and charge beside it (engine harmsFor)
   */
  wrongAnswer?: true;
}

/**
 * Something the patient has that decides whether a drug is indicated or dangerous. The engine's built-in safety rules
 * cannot read it from the tracing or the vitals, so the case says so (Scenario.problems); the learner never sees the list.
 * Without it, calcium, bicarbonate, insulin and high-dose albuterol count as given with no indication, and nothing
 * stops procainamide in a failing heart — so a case where one of these is right must list the problem behind it.
 */
export type Problem =
  /**
   * a high potassium: what calcium, insulin with dextrose and high-dose albuterol treat (bicarbonate only with a metabolic
   * acidosis — KDIGO 2020 — or in the arrest)
   */
  | 'hyperkalemia'
  /** a metabolic acidosis: one of bicarbonate's indications */
  | 'metabolic-acidosis'
  /** a low calcium: one of calcium's indications */
  | 'hypocalcemia'
  /** a beta-blocker overdose: glucagon, calcium and high-dose insulin */
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
  /** a long QT, congenital or acquired (a QT-prolonging drug, a low potassium or magnesium, Takotsubo, a slow rate): no QT-prolonging drug */
  | 'long-qt'
  /** fluid on the lungs (e.g. hypertensive acute pulmonary edema): a fluid bolus or raised legs add to it */
  | 'pulmonary-edema'
  /** acute intoxication with cocaine, methamphetamine or another sympathomimetic: no beta-blocker (unopposed alpha) */
  | 'sympathomimetic-toxicity'
  /** an acute aortic dissection: antithrombotic and fibrinolytic drugs make the tear bleed */
  | 'aortic-dissection'
  /**
   * active major bleeding (e.g. a retroperitoneal bleed) or a bleeding diathesis (not menses): what a transfusion of
   * packed red cells treats; antithrombotics, lytics and GP IIb/IIIa make it worse
   */
  | 'bleeding'
  /** cardiac tamponade: what a pericardiocentesis treats (in the emergency department the built-in rule reads it) */
  | 'tamponade'
  /** a pulmonary embolism: with a STEMI, the indication for a fibrinolytic in the emergency department (high risk, or in arrest) */
  | 'pulmonary-embolism'
  /**
   * an acute coronary syndrome (STEMI or NSTE-ACS, or one being ruled in): oxygen only for an SpO₂ under 90 % (2025 ACC/AHA
   * ACS), and no IV beta-blocker with signs of shock risk
   */
  | 'acs'
  /**
   * shock from pump failure (infarct-related), even while a pressor holds the systolic over 90: routine IABP brings no
   * benefit, verapamil is contraindicated, and an LV gram adds contrast and volume
   */
  | 'cardiogenic-shock'
  /**
   * an inferior MI with right-ventricular involvement (ST elevation in V4R): preload-dependent — no nitrates or diuretics,
   * positive pressure only when it is needed (intubate when the patient needs it); fluid helps
   */
  | 'rv-infarction'
  /**
   * severe aortic stenosis, a fixed outflow obstruction: no nitrates or vasodilators outside invasive monitoring (2014
   * AHA/ACC valve guideline: 2b with it), no Impella, and care with anything that drops the preload
   */
  | 'severe-aortic-stenosis'
  /**
   * dynamic LV outflow obstruction (obstructive HCM, Takotsubo with SAM, a small hypertrophied ventricle after TAVR): in
   * hypotension no catecholamines, inotropes, nitrates or diuretics — fluid and phenylephrine (2024 AHA/ACC HCM; a cautious
   * low-dose diuretic for volume overload without hypotension may be considered, 2b)
   */
  | 'lvot-obstruction'
  /**
   * a PE with incipient cardiopulmonary failure (2026 AHA/ACC category D: transient hypotension, or normotensive
   * hypoperfusion — lactate, oliguria) or established failure (E: persistent hypotension or shock, refractory shock or
   * arrest): systemic lysis is reasonable in E (2a) and may be considered in D (2b) when the bleeding risk is acceptable
   */
  | 'pe-high-risk'
  /**
   * a PDE-5 inhibitor within its window (avanafil 12 h, sildenafil or vardenafil 24 h, tadalafil 48 h; for erections,
   * pulmonary hypertension or the prostate), or riociguat: no nitrate or nitroprusside
   */
  | 'pde5-inhibitor'
  /** a true aspirin or NSAID allergy (anaphylaxis, angioedema, urticaria) or aspirin-exacerbated asthma */
  | 'aspirin-allergy'
  /** heparin-induced thrombocytopenia, now or before */
  | 'hit'
  /** platelets under 100,000 */
  | 'thrombocytopenia'
  /** any intracranial hemorrhage, now or ever */
  | 'intracranial-hemorrhage'
  /**
   * an ischemic stroke within 3 months: an absolute contraindication to a lytic for a STEMI (2013 ACCF/AHA, kept in 2025
   * ACC/AHA ACS). A stroke under way now is 'stroke'; a TIA is not this one (see prior-stroke)
   */
  | 'recent-stroke'
  /**
   * an ischemic stroke more than 3 months ago, or a TIA within 6 months (2017 ESC STEMI): a relative contraindication to a
   * lytic, never an absolute one
   */
  | 'prior-stroke'
  /** an intracranial lesion (AVM, aneurysm, tumor); significant head or face trauma within 3 months; or brain or spinal surgery within 2 months */
  | 'intracranial-risk'
  /** warfarin or a DOAC on board */
  | 'oral-anticoagulant'
  /** major surgery or trauma within 3 weeks: a relative contraindication to a lytic, and within eptifibatide's 6 weeks too */
  | 'recent-surgery'
  /**
   * major surgery 3 to 6 weeks ago: past a lytic's 3 weeks but within the 6 weeks the eptifibatide label rules it out for
   * (Integrilin label: major surgery within the previous 6 weeks)
   */
  | 'surgery-within-6-weeks'
  /** internal bleeding within 2–4 weeks, or an active peptic ulcer, not bleeding now */
  | 'recent-bleeding'
  /** pregnant, or within a week after delivery */
  | 'pregnancy'
  /**
   * kidney failure on dialysis, little or no urine: furosemide has nothing to work on, eptifibatide is contraindicated,
   * and magnesium accumulates
   */
  | 'dialysis'
  /**
   * severe kidney disease not on dialysis: CKD stage 4–5, or an AKI with the creatinine at least twice baseline (KDIGO
   * stage 2–3). Magnesium accumulates, eptifibatide runs at half the infusion (CrCl under 50), insulin is 5 units
   */
  | 'renal-failure'
  /** unfractionated heparin given before the case opens: protamine has something to reverse */
  | 'heparin-on-board'
  /** enoxaparin within 12 h */
  | 'lmwh-on-board'
  /** a low magnesium: what IV magnesium replaces */
  | 'hypomagnesemia'
  /** a low potassium (under 4 mEq/L for sotalol) */
  | 'hypokalemia'
  /**
   * a transplanted, denervated heart: atropine does not work and can cause high-grade block (2018 ACC/AHA/HRS: 3 — Harm);
   * adenosine starts at 3 mg
   */
  | 'heart-transplant'
  /** dipyridamole or carbamazepine on board: adenosine starts at 3 mg */
  | 'adenosine-potentiator'
  /**
   * asthma or another bronchospastic lung disease (history, e.g. COPD with wheezing): adenosine is to be avoided (label
   * warning); labetalol (with any obstructive airway disease) and sotalol are contraindicated; β1-selective blockers only
   * with caution
   */
  | 'asthma'
  /**
   * active wheezing now (asthma, COPD, anaphylaxis): what 2.5–5 mg albuterol and a steroid treat, and a contraindication
   * like 'asthma'
   */
  | 'bronchospasm'
  /**
   * anaphylaxis or an anaphylactoid (e.g. contrast) reaction: epinephrine first — IM, or small IV boluses where the patient
   * is monitored (ACR) — then fluid, oxygen and the adjuncts
   */
  | 'anaphylaxis'
  /**
   * AF or flutter for 48 h or more (or of unknown onset) without 3 weeks of anticoagulation or a TEE: no elective
   * cardioversion (2023 ACC/AHA/ACCP/HRS AF, COR 1)
   */
  | 'af-over-48h'
  /** digoxin toxicity: no elective cardioversion (VT/VF); digoxin Fab */
  | 'digoxin-toxicity'
  /** a pacemaker or ICD: pads at least 8 cm from the generator (or front-and-back); check the device afterwards */
  | 'implanted-device'
  /** septal rupture, or papillary-muscle rupture with acute MR, after an MI: an IABP is a bridge to surgery */
  | 'mechanical-complication'
  /** moderate or severe aortic regurgitation */
  | 'aortic-regurgitation'
  /** a mechanical aortic valve */
  | 'mechanical-aortic-valve'
  /** a thrombus in the left ventricle */
  | 'lv-thrombus'
  /** a ventricular septal rupture */
  | 'ventricular-septal-rupture'
  /** severe iliofemoral disease or an aortofemoral graft */
  | 'peripheral-artery-disease'
  /** a heavy thrombus (e.g. stent thrombosis): bail-out aspiration is fair */
  | 'large-thrombus-burden'
  /** an acute stroke now (not history) */
  | 'stroke'
  /** an earlier allergic-like reaction to iodinated contrast (not shellfish, not "iodine"): premedicate (ACR) */
  | 'contrast-allergy'
  /** an earlier reaction to protamine */
  | 'protamine-allergy'
  /** NPH or protamine-zinc insulin, an earlier protamine dose, a fish allergy or a vasectomy */
  | 'protamine-sensitized'
  /** severe agitation that endangers the patient or the crew (e.g. stimulant toxicity): what restraint and sedation are for */
  | 'severe-agitation'
  /**
   * a seizure under way (status epilepticus, or one that has not stopped): a benzodiazepine (midazolam) is its first
   * treatment, given even to a drowsy patient or one breathing poorly — with the airway supported (2016 AES status
   * epilepticus guideline)
   */
  | 'seizure'
  /** systemic lupus erythematosus: procainamide is contraindicated (procainamide label: it can cause or worsen drug-induced lupus) */
  | 'lupus'
  /**
   * a pheochromocytoma: glucagon is contraindicated — it releases catecholamines from the tumor and can bring a
   * hypertensive crisis (GlucaGen label)
   */
  | 'pheochromocytoma'
  /**
   * an insulinoma: glucagon raises the glucose at first, then the tumor's insulin release can bring a rebound hypoglycemia
   * (GlucaGen label: contraindicated) — glucose checks after any dose
   */
  | 'insulinoma'
  /**
   * significant right-ventricular failure: an Impella that unloads only the left ventricle cannot fill from a failing right
   * one (Impella instructions for use: a contraindication)
   */
  | 'rv-failure'
  /** a rupture of the left-ventricular free wall: no pump may go into the ventricle (Impella instructions for use) */
  | 'lv-rupture';

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
  /** count only shocks actually delivered (SimState.performed `shocked`), not a SYNC that never fired or "no shock advised" */
  shocksOnly?: boolean;
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
  /**
   * emergency department: this department cannot get the patient to PCI within 120 minutes of first medical contact, so a
   * fibrinolytic is the reperfusion
   */
  noTimelyPci?: boolean;
  /** emergency department: the patient may go home now; without it a discharge is unsafe */
  dischargeOk?: (s: SimState) => boolean;
  /** what the hospital says when the ambulance arrives (field): fixed words, or words that depend on the patient's state */
  arrival?: string | ((s: SimState) => string);
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
