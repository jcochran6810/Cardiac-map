import type { Effect, Line, Scenario, ScenarioEvent, SimState, Timing } from '../types';
import { arrestEtco2, bpAfter, count, firstDone, has, mapOf, ventilated } from '../kit';
import { askCritical, askEvents, type LabAsk } from '../labKit';
import { ECG_TO_ACTIVATION, ED_MD, ED_RN, edNurse, edOrder, physicianDispo } from '../edKit';

/**
 * A witnessed, monitored cardiac arrest in the emergency department. A 61-year-old man came in 40 minutes ago with two
 * hours of chest pressure; his triage 12-lead was read as non-diagnostic, his first troponin is pending, and he is on the
 * monitor in bed 9 waiting for the physician when he slumps over (minute 0). The rhythm is VF from an evolving inferior
 * STEMI (an RCA occlusion the triage tracing did not yet show). It is refractory: it converts at the fourth shock, once
 * epinephrine and an antiarrhythmic are on board, and he comes back comatose and hypotensive, with the respiratory
 * therapist bagging far too fast. After ROSC the 12-lead shows the occlusion: the hospital has its own cath lab, in house
 * and between cases.
 *
 * The ER nurse is his nurse: calls the code (which brings the team and the crash cart), starts compressions, shocks as soon
 * as the pads are on (ACLS, no order needed), resumes compressions at once, starts the IV, gives the ACLS drugs per
 * protocol, keeps the 2-minute cycles, attaches capnography, then gives the norepinephrine the physician orders, slows the
 * bagging, records the 12-lead and shows it to the physician, checks the neuro status and hands off. The computer ED
 * physician leads the code, places the tube, thinks through the causes, activates the lab and orders temperature control.
 *
 * The ER doctor leads the code from the moment they walk in (the nurse is on the chest and the pads are on): the shock at
 * once, compressions after every shock, the drugs at the right shocks, an airway placed while the compressions go on, the
 * Hs and Ts; after ROSC the pressor, the ventilation, the 12-lead, the cath lab, temperature control. A computer nurse does
 * the nursing (the IV, the drugs on the doctor's word, the time-keeping).
 *
 * How the engine's clock is read here: a 'cpr' action is one 2-minute cycle that ends at a rhythm check. Everything else
 * done in the arrest (a line, a drug, the airway, capnography) is done while a teammate keeps compressing — except what
 * stops the compressions: a pulse check, stopping to reassess, or anything done at a rhythm check while the shock waits.
 */

/** Minutes from activating the cath lab to the room being ready: a weekday afternoon, the team in house between cases */
const CATH_MINUTES = 10;

/** Minutes of VF without a first shock after which the waves get finer and it takes one more shock to convert */
const LATE_FIRST_SHOCK = 3;

/** Minutes into the arrest when, with no code called, the charge nurse comes in from the central station and calls it */
const CODE_BY_TEAM = 3;

/** Minutes pulseless before he dies: a witnessed in-hospital arrest is worked for a long time */
const DEATH_AFTER = 30;

/** EtCO₂ in the last minute of compressions on the heart the converting shock has organized (ventilated): ROSC is coming */
const CONVERTED_ETCO2 = 34;

/** His vitals at ROSC: comatose, the pressure low (MAP 61), and the bag going far too fast (100 % oxygen, CO₂ blown off) */
const ROSC_VITALS = { sbp: 84, dbp: 50, spo2: 100, rr: 28, etco2: 24, gcs: 3, pain: 0 };

/** The rhythm after the converting shock (no pulse yet: a stunned heart), and once he has a pulse */
const CONVERTED_RHYTHM = { profile: 'inferior-stemi', hr: 96 };
const ROSC_RHYTHM = { profile: 'inferior-stemi', hr: 108 };

/** The ER nurse's run (the computer physician decides) and the ER doctor's run (a computer nurse does the nursing) */
const nurseRun = (s: SimState) => s.role === 6;
const doctorRun = (s: SimState) => s.role === 7;

const vf = (s: SimState) => !s.pulse && s.rhythm.profile === 'vf';

/** Shocks delivered to the VF so far, by anyone: each sets the flag `shock-<n>` at the moment it was delivered */
function vfShocks(s: SimState): number {
  let n = 0;
  while (has(s, `shock-${n + 1}`)) n++;
  return n;
}

/** A 2-minute CPR cycle was started at or after this minute */
const cprSince = (s: SimState, minute: number) => s.performed.some((p) => p.id === 'cpr' && p.minute >= minute);

/** The last shock to the VF has had no CPR cycle after it yet */
function shockedNoCpr(s: SimState): boolean {
  const n = vfShocks(s);
  return n > 0 && !cprSince(s, s.flags[`shock-${n}`]);
}

/**
 * A shock now would be stacked on the last one: under 2 minutes after it, with no CPR cycle in between. It is no new step
 * of the algorithm (it does not count as the next shock for the drugs or the conversion), only lost compression time.
 * After 2 minutes of something done while a teammate compresses (a line, the airway), the next shock is a rhythm check's
 */
function stacked(s: SimState): boolean {
  if (!vf(s) || !shockedNoCpr(s)) return false;
  return s.minute - s.flags[`shock-${vfShocks(s)}`] < 2;
}

/**
 * The shock is due now: VF with the pads on, and either no shock yet or a full CPR cycle since the last one — the rhythm
 * check. Anything else done now (a line, the airway, another cycle of compressions) holds the shock back
 */
function shockDue(s: SimState): boolean {
  if (!vf(s) || !has(s, 'pads')) return false;
  const n = vfShocks(s);
  return n === 0 || cprSince(s, s.flags[`shock-${n}`]);
}

/** Since when the shock has been due (null if it is not): the pads going on, or the end of the cycle after the last shock */
function dueSince(s: SimState): number | null {
  if (!shockDue(s)) return null;
  const n = vfShocks(s);
  if (n === 0) return s.flags.pads;
  const cycle = s.performed.find((p) => p.id === 'cpr' && p.minute >= s.flags[`shock-${n}`]);
  return cycle ? cycle.minute + 2 : null;
}

/** The converting shock has happened and a CPR cycle has run since it: the rhythm check now shows organized complexes */
const cycleSinceConversion = (s: SimState) => has(s, 'converted') && cprSince(s, s.flags.converted);

/** Pulse checks since the last CPR cycle began (or since minute 0) */
function checksSinceCpr(s: SimState): number {
  const last = s.performed.filter((p) => p.id === 'cpr').at(-1)?.minute ?? -1;
  return s.performed.filter((p) => p.id === 'pulse-check' && p.minute > last).length;
}

/**
 * Minutes since the last dose of arrest epinephrine — the learner's, or the one the physician had the charge nurse give —
 * or null (judged before this dose is recorded)
 */
function sinceLastEpi(s: SimState): number | null {
  const mine = s.performed.filter((p) => p.id === 'epinephrine').at(-1)?.minute;
  const doses = [mine, s.flags['team-epi']].filter((m): m is number => m !== undefined);
  return doses.length ? s.minute - Math.max(...doses) : null;
}

/**
 * The learner's first dose of these drugs from the second shock on, before ROSC — unless a teammate had to give it first
 * (the flag `team`): then the learner's later dose is a second one, not the one that was due
 */
function ownDose(s: SimState, ids: string[], team: string): number | null {
  const at = s.performed.find((p) => ids.includes(p.id) && p.minute >= s.flags['shock-2'] && p.minute < (s.flags.rosc ?? Infinity))?.minute ?? null;
  if (at === null) return null;
  return team in s.flags && s.flags[team] <= at ? null : at;
}

/** Amiodarone doses in this arrest, the learner's and the one the physician had the charge nurse push */
const amioDoses = (s: SimState) => count(s, 'amio-arrest') + (has(s, 'team-amio') ? 1 : 0);

/**
 * His EtCO₂ in the arrest, with the flags this action adds: the shared rule (almost nothing with no breaths, then the blood
 * flow), and the climb in the cycle after the converting shock once he is ventilated. Every action that changes it writes
 * it into the vitals, so the monitor and the capnography line always read the same number
 */
function arrestCo2(s: SimState, ...add: string[]): number {
  const flags = { ...s.flags, ...Object.fromEntries(add.map((f) => [f, s.minute])) };
  if ('converted' in flags && 'post-convert-cycle' in flags && ventilated({ flags })) return CONVERTED_ETCO2;
  return arrestEtco2({ flags });
}

/**
 * Whether this shock converts the VF. Refractory VF from an occluded artery: it needs three cycles of CPR, epinephrine and
 * an antiarrhythmic, and then the fourth shock works; without the antiarrhythmic the fifth, without either the sixth. A first
 * shock that came late (the waves gone fine) costs one more
 */
function converts(s: SimState, n: number): boolean {
  if (count(s, 'cpr') < 3) return false;
  const epi = has(s, 'epi');
  const anti = has(s, 'amiodarone') || has(s, 'lidocaine');
  const needed = (epi && anti ? 4 : epi ? 5 : 6) + (has(s, 'late-shock') ? 1 : 0);
  return n >= needed;
}

/**
 * A shock to the VF, by the learner (manual or the AED) or by a teammate. The converting shock organizes the rhythm but
 * leaves a stunned heart with no pulse yet: compressions are what it needs next, and the pulse is felt at the next rhythm
 * check. The line says what the defibrillator does, never what the trace shows: reading it is the learner's job
 */
function vfShock(s: SimState, by: 'manual' | 'aed' | 'team'): Effect {
  const n = vfShocks(s) + 1;
  const delivered: Line = by === 'aed'
    ? ['monitor', 'AED: "Shock advised." Shock delivered. "Begin CPR."']
    : ['monitor', 'Shock delivered: 200 J.'];
  // a stacked shock changes nothing and is not the next step of the algorithm (the harm scores it)
  if (by !== 'team' && stacked(s)) return { say: [delivered], flags: ['pads', 'monitor', 'shocked', 'stacked'] };
  const flags = ['pads', 'monitor', 'shocked', `shock-${n}`];
  if (by === 'team') {
    const who: Line = nurseRun(s)
      ? ['physician', 'We are not waiting any longer — charging… everybody clear! Shocking. Back on the chest!', 'warn']
      : ['nurse', 'Doctor, I am shocking per protocol — charging… everybody clear! Back on the chest!', 'warn'];
    flags.push(`team-shock-${n}`);
    if (converts(s, n)) return { say: [who, delivered], rhythm: CONVERTED_RHYTHM, flags: [...flags, 'converted'] };
    return { say: [who, delivered], flags };
  }
  if (converts(s, n)) return { say: [delivered], rhythm: CONVERTED_RHYTHM, flags: [...flags, 'converted'] };
  return { say: [delivered], flags };
}

/** The defibrillator is on the crash cart in the hallway until the code is called */
const noCart: Effect = {
  blocked: true,
  say: [['system', 'The defibrillator is on the crash cart in the hallway: call the code — it brings the cart and the team to the bedside.']],
};

/** A pulse: ROSC, found by the learner at the rhythm check or by a teammate at the next one */
function rosc(s: SimState, by: 'you' | 'team'): Effect {
  const tube = has(s, 'airway') ? 'through the tube' : 'with the mask';
  return {
    say: [
      by === 'you'
        ? ['you', 'Rhythm check, then the carotid for no more than 10 seconds: a pulse — ROSC.', 'good']
        : ['team', 'The tech feels a femoral pulse at the rhythm check — he has a pulse: ROSC. (It was there to feel at the check before this cycle.)', 'good'],
      ['monitor', `BP ${ROSC_VITALS.sbp}/${ROSC_VITALS.dbp}.`],
      ['team', `The respiratory therapist, caught up in the moment, is squeezing the bag fast — about ${ROSC_VITALS.rr} breaths a minute ${tube}.`, 'warn'],
    ],
    rhythm: ROSC_RHYTHM, pulse: true, phase: 'rosc', vitals: ROSC_VITALS,
    flags: ['overbagging', ...(by === 'team' ? ['rosc-by-team'] : [])],
  };
}

/**
 * After ROSC, slowing the bag and turning the oxygen down (2025 AHA: SpO₂ 90–98 %, PaCO₂ 35–45 mmHg, about 10 breaths a
 * minute to start): by taking the bag, or by reading the capnography and calling it out
 */
function fixVentilation(s: SimState, how: 'bvm' | 'capno'): Effect {
  const v = s.vitals;
  const tube = has(s, 'airway') ? 'through the tube' : 'with the mask';
  const say: Line[] = how === 'capno'
    ? [
      ['monitor', `EtCO₂ ${v.etco2} mmHg, the waveform coming ${v.rr} times a minute.`, 'warn'],
      ['you', 'Too low, and too fast: you have the respiratory therapist slow to 1 breath every 6 seconds, slow squeezes, and turn the oxygen down to keep the SpO₂ between 90 and 98 %.'],
    ]
    : [['you', nurseRun(s)
      ? `You take the bag from the respiratory therapist: 1 breath every 6 seconds ${tube}, slow squeezes, and the oxygen turned down from 100 % to keep the SpO₂ between 90 and 98 %.`
      : `You stop the fast bagging: "1 breath every 6 seconds ${tube}, slow squeezes — and turn the oxygen down to keep his saturation between 90 and 98 %." The respiratory therapist slows to 10 a minute.`]];
  return {
    say: [...say, ['monitor', 'Over the next minutes: EtCO₂ 38 mmHg, SpO₂ 96%.', 'good']],
    vitals: { rr: 10, etco2: 38, spo2: 96 }, clear: ['overbagging'],
    flags: ['ventilated', 'vent-ok', ...(how === 'capno' ? ['capno'] : [])],
  };
}

/**
 * How he is being breathed for once a tube goes in after ROSC: the new tube does not slow the respiratory therapist down —
 * the fast bagging goes on until someone slows it (bvm or capnography), so the trap stays the learner's to see
 */
function bagging(s: SimState): Line[] {
  return has(s, 'overbagging')
    ? [['team', `The respiratory therapist bags through the new tube — still about ${s.vitals.rr} breaths a minute.`, 'warn']]
    : [['you', 'Ventilated 1 breath every 6 seconds through the tube.']];
}

/** Norepinephrine for the low pressure after ROSC: up to a MAP of 77 (it never lowers a pressure that is already higher) */
function pressorEffect(s: SimState): Effect {
  const bp = { sbp: Math.max(s.vitals.sbp, 104), dbp: Math.max(s.vitals.dbp, 64) };
  return {
    say: [
      [edNurse(s), edNurse(s) === 'you'
        ? 'Norepinephrine running at 0.05 mcg/kg/min through the IV, titrated to the MAP.'
        : 'Norepinephrine running at 0.05 micrograms per kilo per minute, doctor — titrating to a MAP of 65 or more.'],
      ['monitor', `BP ${bp.sbp}/${bp.dbp}, MAP ${mapOf(bp)}.`, 'good'],
    ],
    vitals: bp, flags: ['pressor', 'pressor-running'],
  };
}

/** The interventional cardiologist, once the lab is activated: temperature control goes on, or starts, as he comes up */
const cardiologyReady = (s: SimState) =>
  `Interventional cardiology: "I have seen the tracing — we are ready for him in a few minutes. Comatose does not change that. Keep his MAP at 65 or more, ${has(s, 'temp-control') ? 'keep the temperature control going' : 'and if he does not follow commands, start temperature control — it goes on in the lab'}, and I will give the heparin in the lab."`;

/** The ER nurse's report to the ED physician: in the arrest it brings the code; after ROSC, the 12-lead decides the lab */
function report(s: SimState): Effect {
  const flags = ['physician-notified'];
  if (!s.pulse) {
    if (!has(s, 'help')) return { say: [['physician', 'Bed 9? On my way — calling the code now!', 'warn']], flags: [...flags, 'help', 'cart'] };
    return { say: [['physician', 'I am here — keep going.']], flags };
  }
  if (has(s, 'ecg12') && has(s, 'ecg-stemi') && !has(s, 'alert')) {
    const d = physicianDispo(s, 'cathLab', 'Let me see — thank you. That is new since his triage tracing: I am activating the cath lab now. He goes straight in, comatose or not; the team is in house, about 10 minutes.', CATH_MINUTES);
    return { ...d, flags: [...flags, ...(d.flags ?? [])] };
  }
  if (!has(s, 'ecg12') && !has(s, 'alert')) return { say: [['physician', 'Thanks. I want his 12-lead the moment you have it.']], flags };
  return { say: [['physician', has(s, 'alert') ? 'Thanks — he goes to the lab as soon as they call for him.' : 'Thanks — keep me posted.']], flags };
}

// The ED physician's order in the ER nurse's run: norepinephrine after ROSC is no ACLS-protocol drug, so it needs the order

const PRESSOR_ORDER: LabAsk = edOrder({
  id: 'pressor', when: (s) => s.pulse && has(s, 'rosc'),
  ask: 'Good — he has a pulse. His MAP is 61: start norepinephrine at 0.05 micrograms per kilo per minute through that IV and titrate to a MAP of 65 or more. Read it back to me.',
  accept: ['pressor'],
  thanks: 'Norepinephrine at 0.05, titrating to a MAP of 65 or more — thank you.',
  fallback: 'The norepinephrine is not up yet — charge nurse, hang it, please.',
  fallbackEffect: (s) => {
    const bp = { sbp: Math.max(s.vitals.sbp, 104), dbp: Math.max(s.vitals.dbp, 64) };
    return { say: [['monitor', `BP ${bp.sbp}/${bp.dbp}, MAP ${mapOf(bp)}.`]], vitals: bp, flags: ['pressor'] };
  },
  gives: 'pressor-running', points: 10,
  label: 'After ROSC: norepinephrine on the physician\'s order, titrated to a MAP of 65 or more',
  why: 'After ROSC avoid hypotension: a MAP of 65 mmHg or more (2025 AHA). His is 61. A vasopressor infusion is no ACLS-protocol drug: the ER nurse starts it on the physician\'s order, reads the dose back (closed loop), and titrates it to the MAP.',
});

/**
 * Shocks a teammate gives when the learner leaves a due shock undelivered: the physician once it has waited more than 2
 * minutes, the nurse more than 3. Strictly more: a learner who spent one cycle (or one 2-minute line) on something else
 * is back at the defibrillator at its end and gets that shock — late, and their own — rather than a teammate's shock
 * landing at the same moment and turning theirs into a stacked one
 */
const TEAM_SHOCKS: ScenarioEvent[] = Array.from({ length: 8 }, (_, i) => ({
  id: `team-shock-${i + 1}`,
  when: (s: SimState) => {
    const since = vfShocks(s) === i ? dueSince(s) : null;
    return since !== null && s.minute - since > (nurseRun(s) ? 2 : 3);
  },
  effect: (s: SimState) => vfShock(s, 'team'),
}));

/** In the ER doctor's run the nurse asks once a due shock has waited a minute */
const SHOCK_PROMPTS: ScenarioEvent[] = Array.from({ length: 8 }, (_, i) => ({
  id: `md-shock-prompt-${i + 1}`,
  when: (s: SimState) => {
    const since = doctorRun(s) && vfShocks(s) === i ? dueSince(s) : null;
    return since !== null && s.minute - since >= 1;
  },
  effect: () => ({ say: [['nurse', 'Doctor — the pads are on and the defibrillator is charged. Do you want to shock?', 'warn']] }),
}));

/** The time goals: the code called, the first shock, the 12-lead after ROSC, the cath lab, the pressure */
const TIMINGS: Timing[] = [
  { label: 'Code called', actions: ['call-help', 'notify-physician'], flag: 'help', target: 1 },
  // the in-hospital benchmark is a first shock within 2 minutes of the collapse: one 2-minute cycle of compressions while
  // the pads go on, then the shock at the first rhythm check
  { label: 'First shock', actions: ['defib', 'aed'], flag: 'shock-1', target: 2.5 },
  { label: 'First epinephrine (after the second shock)', actions: ['epinephrine'], flag: 'epi', from: 'arrest' },
  { label: 'ROSC', actions: [], flag: 'rosc' },
  { label: 'MAP 65 or more after ROSC', actions: ['pressor', 'fluid', 'push-epi'], flag: 'pressor-running', from: 'rosc', target: 5 },
  { label: '12-lead after ROSC', actions: ['ecg12', 'ecg12-repeat'], from: 'rosc', target: 10 },
  { ...ECG_TO_ACTIVATION, target: 10 },
];

export const edVfArrest: Scenario = {
  id: 'vf-arrest-ed',
  title: 'Code blue in bed 9',
  summary: 'A 61-year-old man waiting in the emergency department with chest pain goes unresponsive on the monitor. Run the code as his nurse or lead it as the physician — then everything that comes after the pulse.',
  setting: 'ed',
  roles: [6, 7],
  difficulty: 'advanced',
  conditionId: 'ventricular-fibrillation',
  briefing: {
    default: [
      ['team', 'Tuesday, 2:10 in the afternoon. Bed 9: a 61-year-old man who walked in 40 minutes ago with two hours of chest pressure. His triage 12-lead was read as non-diagnostic, his first troponin is pending, and he is on the monitor, waiting to be seen.'],
      ['monitor', 'Monitor alarm.', 'bad'],
      ['team', 'He has slumped sideways, eyes rolled back, with a few gasping breaths. He does not respond. His wife is screaming for help.'],
    ],
    6: [
      ['team', 'Tuesday, 2:10 in the afternoon. Bed 9: a 61-year-old man who walked in 40 minutes ago with two hours of chest pressure. His triage 12-lead was read as non-diagnostic, his first troponin is pending, and he is on the monitor, waiting to be seen.'],
      ['monitor', 'Monitor alarm.', 'bad'],
      ['team', 'You are his nurse. You step into the room: he has slumped sideways, eyes rolled back, with a few gasping breaths. He does not respond. His wife is screaming for help.'],
      ['team', 'The crash cart with the defibrillator is in the hallway; the ED physician is two beds down. Your hospital has a cath lab, in house this afternoon.'],
    ],
    7: [
      ['team', 'Tuesday, 2:10 in the afternoon. A code is called overhead for bed 9: a 61-year-old man who walked in 40 minutes ago with two hours of chest pressure. His triage 12-lead was read as non-diagnostic; his first troponin is pending.'],
      ['nurse', 'Doctor! He went unresponsive about 40 seconds ago — gasping, no pulse. I\'m on compressions.'],
      ['team', 'The charge nurse has the pads on his chest and the defibrillator on; a tech is ready to take over compressions; respiratory therapy is at the head of the bed with a bag. No line yet. You are the ED physician: you lead this code. Your hospital has a cath lab, in house this afternoon.'],
    ],
  },
  initial: {
    rhythm: { profile: 'vf', hr: 0 }, pulse: false, phase: 'arrest',
    // nobody has given him a breath yet, so a capnograph would measure almost nothing (the shared arrest rule)
    vitals: { sbp: 0, dbp: 0, spo2: 82, rr: 0, etco2: 3, pain: 0, gcs: 3, glucose: 142, temp: 36.6 },
  },
  // what the built-in safety rules read (types.ts Problem)
  problems: ['acs'],
  facts: {
    opqrst: 'His wife: "It started about two hours ago, after lunch — a heavy pressure in the middle of his chest, up into his jaw. He thought it was indigestion. It eased a little when we got here, then he said it was coming back, just before he went."',
    sample: 'His wife: "High blood pressure and cholesterol — he takes lisinopril and atorvastatin. He smokes. No allergies. No blood thinners. A stress test five years ago was fine. He had lunch at noon. About 200 pounds."',
    pde5: 'His wife: "No — nothing like that."',
    allergies: 'His wife: "No allergies."',
    lungs: (s) => {
      if (s.pulse) return 'Equal breath sounds on both sides with each breath; a few crackles at both bases.';
      return ventilated(s) ? 'Equal breath sounds on both sides with each breath; the chest rises evenly; trachea midline.' : 'Nothing to hear: no one has given him a breath yet. Trachea midline.';
    },
    perfusion: (s) => (s.pulse
      ? 'Pale and cool; capillary refill 4 seconds; a weak radial pulse. Neck veins flat.'
      : 'Gray and mottled; no pulses. Neck veins flat; no bleeding anywhere.'),
    ecg12: (s) => `Sinus tachycardia ${s.rhythm.hr}: ST elevation in II, III and aVF (more in III than in II) with reciprocal ST depression in aVL and I — an inferior STEMI, an RCA occlusion. It was not on his triage tracing 40 minutes ago: the occlusion evolved while he waited, and it caused the arrest. ST elevation after ROSC means emergent coronary angiography, comatose or awake.`,
    ecgRight: 'V4R: no ST elevation.',
    labs: 'Sent: a blood gas, lactate, electrolytes, CBC, coagulation studies, type and screen. Back from his triage draw: potassium 4.1, magnesium 2.0, creatinine 0.9, hemoglobin 14.6; the first high-sensitivity troponin is above the upper reference limit.',
    troponin: 'Repeat high-sensitivity troponin drawn — the result is about an hour away.',
    cxr: (s) => (has(s, 'airway')
      ? 'Portable chest X-ray: the tube tip 4 cm above the carina; no pneumothorax; normal heart size; mild vascular congestion; a normal mediastinum.'
      : 'Portable chest X-ray: no pneumothorax; normal heart size; mild vascular congestion; a normal mediastinum.'),
    pocus: (s) => {
      if (s.pulse) return 'Bedside ultrasound: the inferior wall barely moves while the rest of the left ventricle squeezes; no pericardial effusion; the right ventricle is normal in size; both lungs slide.';
      // the probe is on the chest before the pause and the look is kept inside the 10-second rhythm check
      if (has(s, 'converted')) return 'Ultrasound at the rhythm check, the probe ready before the pause, under 10 seconds: the ventricles are squeezing again, weakly; no pericardial effusion; compressions resume.';
      return 'Ultrasound at the rhythm check, the probe ready before the pause, under 10 seconds: no pericardial effusion; the right ventricle is not dilated; the ventricles quiver without squeezing. Compressions resume.';
    },
    consult: (s) => (has(s, 'alert') ? cardiologyReady(s) : 'Interventional cardiology: "Send me his 12-lead now. If it shows ST elevation, activate the lab — he comes straight in, comatose or not."'),
    ct: 'Radiology: head CT — no bleeding, no early sign of brain swelling.',
  },
  status: (s) => {
    if (!s.pulse) return 'Unresponsive, no pulse.';
    if (has(s, 'overbagging')) return `Comatose; being bagged about ${s.vitals.rr} times a minute.`;
    return `Comatose (GCS ${s.vitals.gcs}); ventilated ${s.vitals.rr} times a minute ${has(s, 'airway') ? 'through the tube' : 'with the bag'}.`;
  },
  respond: {
    // ─── the code ───
    'call-help': (s) => {
      if (has(s, 'help')) return { say: [['team', 'More hands come in: a second nurse for the drugs and a pharmacist.']], flags: ['help'] };
      return {
        say: [['team', '"Code blue, emergency department bed 9!" — overhead. The ED physician, the charge nurse with the crash cart and a tech run in; respiratory therapy is right behind them.']],
        flags: ['help', 'cart', 'physician-notified'],
      };
    },
    'notify-physician': report,
    // the defibrillator, its pads and the pacer come on the crash cart
    pads: (s) => (has(s, 'cart') ? null : noCart),
    cardiovert: (s) => (has(s, 'cart') ? null : noCart),
    pace: (s) => (has(s, 'cart') ? null : noCart),
    defib: (s) => {
      if (!has(s, 'cart')) return noCart;
      return vf(s) ? vfShock(s, 'manual') : null;
    },
    aed: (s) => {
      if (!has(s, 'cart')) return noCart;
      return vf(s) ? vfShock(s, 'aed') : null;
    },
    // 2-minute cycles, a rhythm check at the end of each: the timekeeping is called out, and a fresh compressor takes over
    cpr: (s) => {
      if (s.pulse) return null;
      if (has(s, 'converted')) {
        // the learner went on compressing past the rhythm check after the converting shock: a teammate finds the pulse
        if (cycleSinceConversion(s)) return rosc(s, 'team');
        const rise: Line[] = has(s, 'capno') && ventilated(s) ? [['monitor', `EtCO₂ rose to ${CONVERTED_ETCO2} mmHg over the last minute of compressions.`, 'good']] : [];
        return {
          say: [['you', '2 minutes of compressions: 100–120 a minute, 5–6 cm deep, full recoil. Two minutes — hands off for the rhythm check, under 10 seconds.'], ...rise],
          vitals: { etco2: arrestCo2(s, 'cpr', 'post-convert-cycle') }, flags: ['cpr', 'post-convert-cycle'],
        };
      }
      if (nurseRun(s) && !has(s, 'help')) {
        return {
          say: [['you', 'You start compressions alone: 100–120 a minute, 5–6 cm deep, full recoil — but nobody has called the code, and the crash cart with the defibrillator is still in the hallway.', 'warn']],
          vitals: { etco2: arrestCo2(s, 'cpr') }, flags: ['cpr'],
        };
      }
      return {
        say: [['you', doctorRun(s)
          ? '2 minutes of compressions: 100–120 a minute, 5–6 cm deep, full recoil. The nurse calls the 2-minute mark: a fresh compressor takes over — hands off for the rhythm check, under 10 seconds.'
          : '2 minutes of compressions: 100–120 a minute, 5–6 cm deep, full recoil. You call the 2-minute mark: the tech takes over compressions — hands off for the rhythm check, under 10 seconds.']],
        vitals: { etco2: arrestCo2(s, 'cpr') }, flags: ['cpr'],
      };
    },
    'pulse-check': (s) => {
      if (s.pulse) return null;
      if (cycleSinceConversion(s)) return rosc(s, 'you');
      if (shockedNoCpr(s)) {
        return { say: [['you', 'No carotid pulse yet — and nobody was pushing on his chest while you felt for one.', 'bad']], flags: ['pulseless-confirmed'] };
      }
      return { say: [['you', 'No carotid pulse (checked for no more than 10 seconds).', 'bad']], flags: ['pulseless-confirmed'] };
    },
    bvm: (s) => {
      if (!s.pulse) {
        return {
          say: [['you', has(s, 'airway')
            ? 'Ventilating through the tube, 1 breath every 6 seconds; compressions continuous.'
            : 'Bag-mask with 15 L/min of oxygen and an oral airway: 2 breaths, each over 1 second, after every 30 compressions; the chest rises.']],
          vitals: { etco2: arrestCo2(s, 'ventilated') }, flags: ['ventilated'],
        };
      }
      if (has(s, 'overbagging')) return fixVentilation(s, 'bvm');
      if (s.vitals.gcs > 8) return null;
      return { say: [['you', `Still 1 breath every 6 seconds ${has(s, 'airway') ? 'through the tube' : 'with the mask'}; SpO₂ ${s.vitals.spo2}%.`]], flags: ['ventilated'] };
    },
    // capnography reads only what is breathed out, and in the arrest it measures the blood flow the compressions make
    capno: (s) => {
      if (s.pulse) return has(s, 'overbagging') ? fixVentilation(s, 'capno') : null;
      const etco2 = arrestCo2(s);
      const say: Line[] = !ventilated(s)
        ? [['monitor', `EtCO₂ ${etco2} mmHg: almost no waveform.`], ['you', 'Nobody has given him a breath yet: with no breaths there is nothing breathed out to measure. Once he is ventilated it shows how well the compressions are working.']]
        : etco2 === CONVERTED_ETCO2
          ? [['monitor', `EtCO₂ ${etco2} mmHg, and climbing.`, 'good']]
          : has(s, 'cpr')
            ? [['monitor', `EtCO₂ ${etco2} mmHg during compressions: blood is moving. A low or falling number means push harder, or switch compressors.`]]
            : [['monitor', `EtCO₂ ${etco2} mmHg: almost no blood is reaching the lungs — compressions.`]];
      return { say, vitals: { etco2 }, flags: ['capno'] };
    },
    // the ER doctor's airway: while the compressions go on, never at the rhythm check or before the shock
    airway: (s) => {
      if (!s.pulse) {
        const etco2 = arrestCo2(s, 'airway', 'ventilated');
        if (shockDue(s)) {
          return {
            say: [['you', 'You intubate before the shock: the compressions stop for the laryngoscope — 40 seconds hands-off before the tube passes — and the shock waits all that time. Confirmed with waveform capnography.', 'bad']],
            vitals: { etco2 }, flags: ['airway', 'ventilated', 'capno'],
          };
        }
        return {
          say: [['you', 'Endotracheal tube placed with the video laryngoscope while the compressions go on — no pause; confirmed with waveform capnography. Ventilating 1 breath every 6 seconds, compressions continuous.']],
          vitals: { etco2 }, flags: ['airway', 'ventilated', 'capno'],
        };
      }
      // one tube is enough: an RSI (or this) already placed it
      if (has(s, 'airway')) return { blocked: true, say: [['system', 'He already has a tube, confirmed on the capnography. If the breaths are too fast, slow them: 1 breath every 6 seconds.']] };
      if (s.vitals.gcs > 8) return null;
      return {
        say: [['you', 'Endotracheal tube placed with the video laryngoscope; confirmed with waveform capnography.'], ...bagging(s)],
        flags: ['airway', 'ventilated', 'capno'],
      };
    },
    // the drug-assisted tube after ROSC: not on top of a tube already in, and the bagging through it stays as fast as it was
    rsi: (s) => {
      if (!s.pulse) return null;
      if (has(s, 'airway')) return { blocked: true, say: [['system', 'He already has a tube, confirmed on the capnography: no second airway. If the breaths are too fast, slow them: 1 breath every 6 seconds.']] };
      const bp = bpAfter(s, -14, -8);
      return {
        say: [
          ['you', 'Preoxygenated; a reduced dose of etomidate, then rocuronium; the tube through the cords on the first pass with the video laryngoscope, confirmed with waveform capnography.'],
          ['monitor', `BP ${bp.sbp}/${bp.dbp}.`],
          ...bagging(s),
        ],
        vitals: { ...bp, gcs: 3 }, flags: ['airway', 'ventilated', 'sedation', 'rsi', 'capno'],
      };
    },
    // in the code the nurse has the dose drawn up before it is due, calls it out to the leader, gives it and calls the time
    epinephrine: (s) => {
      if (s.pulse) return null;
      return {
        say: [[edNurse(s), edNurse(s) === 'you'
          ? 'You call it out — "Epinephrine 1 milligram going in" — and push it: flushed with 20 mL, the arm raised; you call out the time.'
          : 'Epinephrine 1 milligram in, doctor — flushed. The next dose is due in 3 to 5 minutes.']],
        flags: ['epi'],
      };
    },
    'amio-arrest': (s) => {
      if (s.pulse) return null;
      // counting the dose the charge nurse pushed for the physician: 300 mg, then 150 mg, and no more
      if (amioDoses(s) >= 2) return { blocked: true, say: [['system', 'Amiodarone 300 mg and 150 mg are both in: that is the full arrest dose.']] };
      const dose = amioDoses(s) === 0 ? '300' : '150';
      return {
        say: [[edNurse(s), edNurse(s) === 'you'
          ? `You call it out — "Amiodarone ${dose} milligrams going in" — and push it, flushed; you call out the time.`
          : `Amiodarone ${dose} milligrams in, doctor — flushed.`]],
        flags: ['amiodarone'],
      };
    },
    lidocaine: (s) => {
      if (s.pulse) return null;
      const dose = count(s, 'lidocaine') === 0 ? '100 mg (about 1 mg/kg)' : '50 mg';
      return { say: [[edNurse(s), edNurse(s) === 'you' ? `Lidocaine ${dose} IV pushed and flushed.` : `Lidocaine ${dose} in, doctor.`]], flags: ['lidocaine'] };
    },
    // the infusion is the dose for VT with a pulse: in the arrest it is not the antiarrhythmic dose and does not count as one
    'amio-infusion': (s) => (s.pulse ? null : {
      say: [['you', 'Amiodarone 150 mg running over 10 minutes — the dose for a tachycardia with a pulse. In cardiac arrest the dose is a 300 mg push.', 'warn']],
      flags: ['amio-infusion-in-arrest'],
    }),
    'push-epi': (s) => (s.pulse ? null : {
      say: [['you', 'Push-dose epinephrine, 10–20 mcg — the dose for a low pressure with a pulse. In cardiac arrest the dose is 1 mg.', 'warn']],
      flags: ['push-epi'],
    }),
    adenosine6: (s) => (s.pulse ? null : { say: [['you', 'Adenosine 6 mg pushed — it has no place in cardiac arrest, and nothing changes.']], flags: ['adenosine'] }),
    adenosine12: (s) => (s.pulse ? null : { say: [['you', 'Adenosine 12 mg pushed — it has no place in cardiac arrest, and nothing changes.']], flags: ['adenosine'] }),
    'hs-ts': (s) => ({
      say: [['you', `Hs and Ts. Hypoxia: ${ventilated(s) ? 'he is being ventilated with oxygen' : 'he needs breaths with oxygen'}. Hypovolemia: no bleeding, no fluid loss. Hydrogen ion: a few minutes of arrest, treated by CPR and ventilation. Potassium: 4.1 on his triage blood. Hypothermia: no. Tension pneumothorax: equal breath sounds, trachea midline. Tamponade: ${has(s, 'pocus') ? 'no effusion on the ultrasound' : 'nothing to suggest it — an ultrasound within a pulse check would settle it'}. Toxins: nothing he takes. Thrombosis: two hours of chest pressure before he collapsed — a coronary occlusion is the likeliest cause, and a 12-lead the moment he has a pulse will show it; nothing points to a pulmonary embolism.`]],
      flags: ['hs-ts'],
    }),
    // stopping the code to assess or triage helps no one: the rhythm check is the assessment
    triage: () => ({ blocked: true, say: [['system', 'He was triaged on arrival (ESI 2, chest pain). Now he is a resuscitation: the code, compressions and the defibrillator come first.']] }),

    // he is on the monitor already: its alarm is what brought the nurse in
    monitor: () => ({ blocked: true, say: [['system', 'He is already on the monitor: its alarm is what brought you to the bedside.']] }),

    // ─── after ROSC ───
    // no infusion in the arrest: with no circulation there is no pressure to titrate it to (and it is one infusion: tried
    // now, it could not be started after ROSC, when it is needed)
    pressor: (s) => (s.pulse ? pressorEffect(s) : {
      blocked: true,
      say: [['system', 'Not in cardiac arrest: with no circulation there is no pressure to titrate an infusion to. The arrest drug is epinephrine 1 mg every 3–5 minutes; the infusion comes after ROSC, for a MAP under 65.']],
    }),
    fluid: (s) => {
      if (!s.pulse) return null;
      const bp = bpAfter(s, 10, 6);
      return { say: [['monitor', `500 mL in. BP ${bp.sbp}/${bp.dbp}, MAP ${mapOf(bp)}.`]], vitals: bp, flags: ['fluid'] };
    },
    neuro: (s) => {
      // during CPR there is nothing for a neuro exam to find — and it is done once: spent now, it could not be done after
      // ROSC, when it decides on temperature control
      if (!s.pulse) return { blocked: true, say: [['system', 'Not during CPR: he is unresponsive with no pulse, and a neuro exam has nothing to tell you. Check it once he has a pulse — it decides on temperature control.']] };
      const exam = `GCS ${s.vitals.gcs} (E1 V1 M1): no response to voice or pain; pupils 3 mm, equal, reacting sluggishly; temperature ${s.vitals.temp} °C.`;
      if (doctorRun(s)) {
        return {
          say: [['you', `${exam} He does not follow commands: you order temperature control — a feedback-controlled device holding the target you choose (36 °C here; anywhere from 32 to 37.5 °C fits the guideline) for at least 36 hours, then fever prevention — with sedation as he needs it, and an EEG in the ICU.`]],
          flags: ['neuro-rosc', 'temp-control'],
        };
      }
      return { say: [['you', exam]], flags: ['neuro-rosc'] };
    },
    'o2-nrb': (s) => (s.pulse && s.vitals.gcs <= 8 ? { say: [['you', 'He is already being bagged with oxygen: a mask on top adds nothing.']] } : null),
    'o2-nc': (s) => (s.pulse && s.vitals.gcs <= 8 ? { say: [['you', 'He is already being bagged with oxygen: a cannula adds nothing.']] } : null),
    // once the lab is activated he goes there: not to a bed upstairs or another hospital (nothing done, nothing scored)
    admit: (s) => (has(s, 'alert')
      ? { blocked: true, say: [['system', 'He is going to your cath lab: the ICU bed is booked for after the procedure. Keep caring for him until the lab calls for him.']] }
      : null),
    transfer: (s) => (has(s, 'alert')
      ? { blocked: true, say: [['system', 'Your own cath lab is activated and its team is in house: there is nowhere faster to send him.']] }
      : null),
  },
  events: [
    // ─── both runs ───
    { id: 'on-monitor', when: () => true, effect: (s) => ({ flags: doctorRun(s) ? ['monitor', 'pads', 'help', 'cart', 'cpr'] : ['monitor'] }) },
    {
      // minutes of VF with no shock: the waves get finer, and the heart harder to convert (listed before the teammates' shocks)
      id: 'late-shock', when: (s) => vf(s) && vfShocks(s) === 0 && s.minute >= LATE_FIRST_SHOCK,
      effect: () => ({ say: [['monitor', 'The waves on the trace are getting smaller.', 'warn']], flags: ['late-shock'] }),
    },
    ...TEAM_SHOCKS,
    ...SHOCK_PROMPTS,
    {
      // left alone, the respiratory therapist keeps blowing off his CO₂
      id: 'overbagging-worse', when: (s) => s.pulse && has(s, 'overbagging') && s.minute >= s.flags.rosc + 4,
      effect: () => ({ say: [['monitor', 'EtCO₂ 20 mmHg.', 'warn'], ['team', 'The respiratory therapist is still squeezing the bag fast.', 'warn']], vitals: { etco2: 20 } }),
    },

    // ─── the ER nurse's run: the computer ED physician leads ───
    {
      // nobody codes alone in a department: the alarm at the central station and his wife's cries bring the charge nurse,
      // who calls it. The code goes on, but the call was not the learner's
      id: 'rn-code-by-team', when: (s) => nurseRun(s) && !s.pulse && !has(s, 'help') && s.minute >= CODE_BY_TEAM,
      effect: () => ({
        say: [['team', 'The charge nurse runs in — the alarm at the central station and his wife\'s cries: "Has nobody called this? Code blue, bed 9!" She hits the code button: the ED physician, the crash cart and a tech come in.', 'warn']],
        flags: ['help', 'cart', 'physician-notified', 'code-by-team'],
      }),
    },
    {
      id: 'rn-md-here', when: (s) => nurseRun(s) && has(s, 'help'),
      effect: () => ({ say: [['physician', 'I am here, and I will lead. You are my primary nurse: tell me what you see, and call the times.']] }),
    },
    {
      // the charge nurse puts the pads on while someone is on the chest
      id: 'rn-pads', when: (s) => nurseRun(s) && !s.pulse && has(s, 'help') && !has(s, 'pads') && s.minute >= s.flags.help + 1.5,
      effect: () => ({ say: [['team', 'The charge nurse has the pads on his chest, anterior–lateral, and the defibrillator on.']], flags: ['pads', 'monitor'] }),
    },
    {
      // the physician's airway, placed while the compressions go on
      id: 'rn-md-tube', when: (s) => nurseRun(s) && !s.pulse && vfShocks(s) >= 2 && !has(s, 'airway'),
      effect: (s) => ({
        say: [['physician', 'I am putting a tube in during this cycle — nobody stops compressing for me. … Tube is in, with the video laryngoscope and no pause. Bag it at 1 breath every 6 seconds, and confirm it on the capnography.']],
        vitals: { etco2: arrestCo2(s, 'airway', 'ventilated') }, flags: ['airway', 'ventilated'],
      }),
    },
    {
      id: 'rn-md-epi', when: (s) => nurseRun(s) && !s.pulse && vfShocks(s) >= 2 && !has(s, 'epi') && s.minute >= s.flags['shock-2'] + 4,
      effect: (s) => ({
        say: [['physician', `Where is the epinephrine? It was due after the second shock. Charge nurse — ${has(s, 'iv') ? '' : 'an IO in the humerus, then '}1 milligram now.`, 'warn']],
        flags: ['epi', 'team-epi', 'iv'],
      }),
    },
    {
      id: 'rn-md-amio', when: (s) => nurseRun(s) && !s.pulse && vfShocks(s) >= 3 && !has(s, 'amiodarone') && !has(s, 'lidocaine') && s.minute >= s.flags['shock-3'] + 4,
      effect: () => ({ say: [['physician', 'Three shocks and he is no different: amiodarone 300 milligrams — charge nurse, push it now.', 'warn']], flags: ['amiodarone', 'team-amio'] }),
    },
    {
      id: 'rn-md-causes', when: (s) => nurseRun(s) && !s.pulse && vfShocks(s) >= 3,
      effect: () => ({ say: [['physician', 'Let\'s think about why. Two hours of chest pressure before he went down: this is his heart until proven otherwise. His potassium on the triage blood was 4.1.']] }),
    },
    ...askEvents(PRESSOR_ORDER),
    {
      // the post-arrest 12-lead recorded but never shown: the physician finds it on the screen
      id: 'rn-md-sees-ecg', when: (s) => nurseRun(s) && has(s, 'ecg12') && has(s, 'ecg-stemi') && !has(s, 'alert') && s.minute >= s.flags.ecg12 + 4,
      effect: (s) => physicianDispo(s, 'cathLab', 'Is this his 12-lead, sitting on the screen? A post-arrest 12-lead comes to me the moment it prints. I am activating the cath lab now.', CATH_MINUTES),
    },
    {
      id: 'rn-md-wants-ecg', when: (s) => nurseRun(s) && s.pulse && has(s, 'rosc') && !has(s, 'ecg12') && s.minute >= s.flags.rosc + 10,
      effect: () => ({ say: [['physician', 'He has had a pulse for 10 minutes — where is his 12-lead?', 'warn']] }),
    },
    {
      // nobody recorded it: the physician does, and acts on it (no 'ecg12' flag: it is not the nurse's tracing to read)
      id: 'rn-md-records-ecg', when: (s) => nurseRun(s) && s.pulse && has(s, 'rosc') && !has(s, 'ecg12') && !has(s, 'alert') && s.minute >= s.flags.rosc + 12,
      effect: (s) => {
        const d = physicianDispo(s, 'cathLab', 'I have recorded his 12-lead myself. I am activating the cath lab now.', CATH_MINUTES);
        return { ...d, flags: [...(d.flags ?? []), 'physician-ecg'] };
      },
    },
    {
      id: 'rn-md-temp', when: (s) => nurseRun(s) && has(s, 'neuro-rosc') && !has(s, 'temp-control'),
      effect: () => ({
        say: [['physician', 'GCS 3 and not following commands: temperature control. Cooling pads on and the device set to hold him at 36 °C — at least 36 hours, then no fever. The lab can keep it running.']],
        flags: ['temp-control'],
      }),
    },
    {
      id: 'rn-md-temp-late', when: (s) => nurseRun(s) && s.pulse && has(s, 'rosc') && !has(s, 'temp-control') && s.minute >= s.flags.rosc + 12,
      effect: () => ({
        say: [['physician', 'Has anyone checked his neuro status? I did: GCS 3, he does not follow commands. Temperature control — pads on, 36 °C.', 'warn']],
        flags: ['temp-control'],
      }),
    },

    // ─── the ER doctor's run: a computer nurse does the nursing ───
    {
      id: 'md-iv', when: (s) => doctorRun(s) && !s.pulse && !has(s, 'iv') && s.minute >= 1.5,
      effect: () => ({ say: [['nurse', 'IV in, doctor — 18 gauge in the left antecubital, flushed. Ready for drugs.']], flags: ['iv'] }),
    },
    {
      id: 'md-epi-prompt', when: (s) => doctorRun(s) && !s.pulse && vfShocks(s) >= 2 && !has(s, 'epi') && s.minute >= s.flags['shock-2'] + 3,
      effect: () => ({ say: [['nurse', 'Doctor — it has been 3 minutes since the second shock. Do you want epinephrine?', 'warn']] }),
    },
    {
      id: 'md-amio-prompt', when: (s) => doctorRun(s) && !s.pulse && vfShocks(s) >= 3 && !has(s, 'amiodarone') && !has(s, 'lidocaine') && s.minute >= s.flags['shock-3'] + 3,
      effect: () => ({ say: [['nurse', 'Doctor — that was the third shock. An antiarrhythmic?', 'warn']] }),
    },
    {
      id: 'md-bp-falls', when: (s) => doctorRun(s) && s.pulse && has(s, 'rosc') && firstDone(s, ['pressor', 'fluid', 'push-epi'], 'rosc') === null && s.minute >= s.flags.rosc + 5,
      effect: () => ({ say: [['monitor', 'BP 76/44.', 'bad'], ['nurse', 'Doctor — his pressure is down to 76 over 44.', 'bad']], vitals: { sbp: 76, dbp: 44 } }),
    },
    {
      id: 'md-ecg-prompt', when: (s) => doctorRun(s) && s.pulse && has(s, 'rosc') && !has(s, 'ecg12') && s.minute >= s.flags.rosc + 10,
      effect: () => ({ say: [['nurse', 'Doctor — a 12-lead, now that he has a pulse?', 'warn']] }),
    },
    {
      id: 'md-cath-prompt', when: (s) => doctorRun(s) && has(s, 'ecg12') && has(s, 'ecg-stemi') && !has(s, 'alert') && s.minute >= s.flags.ecg12 + 8,
      effect: () => ({ say: [['nurse', 'Doctor — are we calling the cath lab?', 'warn']] }),
    },
    {
      id: 'md-ic-callback', when: (s) => doctorRun(s) && has(s, 'alert') && s.minute >= s.flags.alert + 1,
      effect: (s) => ({ say: [['consultant', cardiologyReady(s)]], flags: ['ic-called'] }),
    },
  ],
  critical: [
    // ─── the ER nurse ───
    {
      id: 'rn-code', label: 'Call the code: the team and the defibrillator to the bedside', roles: ED_RN, points: 10, target: { by: 1 },
      why: 'Unresponsive, gasping and no pulse is a cardiac arrest: call the code at once (the code button, a shout, overhead) — it brings the physician, more hands and the crash cart with the defibrillator. Nobody runs a code alone.',
      // a code the charge nurse had to call for you is not yours
      done: (s) => {
        const at = firstDone(s, ['call-help', 'notify-physician']);
        return at !== null && (!has(s, 'code-by-team') || at < s.flags['code-by-team']) ? at : null;
      },
      uses: ['call-help', 'notify-physician'],
    },
    {
      id: 'rn-cpr', label: 'Start compressions at once', roles: ED_RN, points: 10, target: { by: 1.5 }, done: ['cpr'],
      why: 'High-quality compressions from the first minute: 100–120 a minute, 5–6 cm deep, full recoil, as few pauses as possible — until the defibrillator is ready, and again the moment each shock is delivered.',
    },
    {
      id: 'rn-shock', label: 'First shock as soon as the defibrillator is ready', roles: ED_RN, points: 15, target: { by: 2.5 },
      why: 'Witnessed VF is shocked the moment the pads are on — ACLS lets the ER nurse defibrillate without waiting for an order. In hospital, a first shock more than 2 minutes after the collapse was linked to far fewer survivors (22 % vs 39 % to discharge; Chan, NEJM 2008).',
      // a shock the physician had to give for you does not count as yours
      done: (s) => (has(s, 'team-shock-1') ? null : firstDone(s, ['defib', 'aed'])), uses: ['defib', 'aed'],
    },
    {
      id: 'rn-access', label: 'IV access (IO if the IV fails), without holding up the shock', roles: ED_RN, points: 5, done: ['iv', 'io'],
      why: 'For the epinephrine and the antiarrhythmic: IV first, IO if an IV cannot be placed quickly (2025 AHA). It goes in while a teammate compresses — never instead of the shock.',
    },
    {
      id: 'rn-epi', label: 'Epinephrine 1 mg after the second shock, per the ACLS protocol', roles: ED_RN, points: 10,
      target: { within: { flag: 'shock-2', minutes: 2 } }, applies: (s) => has(s, 'shock-2'),
      why: 'In VF the shock is the treatment: epinephrine comes once defibrillation has failed — after the second shock — then every 3–5 minutes. It is on the ACLS protocol: the nurse has it drawn up before it is due, calls it out to the code leader (closed loop), pushes it during the compressions and calls out the time — without waiting to be asked.',
      // a dose the physician had to have the charge nurse give is not yours
      done: (s) => ownDose(s, ['epinephrine'], 'team-epi'),
      uses: ['epinephrine'],
    },
    {
      id: 'rn-antiarrhythmic', label: 'Amiodarone 300 mg (or lidocaine) when the third shock has not worked', roles: ED_RN, points: 10,
      target: { within: { flag: 'shock-3', minutes: 2 } }, applies: (s) => has(s, 'shock-3'),
      why: 'VF that persists after the third shock gets amiodarone 300 mg (then 150 mg) or lidocaine 1–1.5 mg/kg (then 0.5–0.75 mg/kg), pushed during the compressions that follow the shock.',
      // given for the VF: from the second shock on, before ROSC, and before the physician had to have it pushed
      done: (s) => ownDose(s, ['amio-arrest', 'lidocaine'], 'team-amio'),
      uses: ['amio-arrest', 'lidocaine'],
    },
    {
      id: 'rn-ventilate', label: 'Breaths with oxygen: bag-mask 30:2, then 1 breath every 6 seconds through the tube', roles: ED_RN, points: 5,
      why: 'Compressions move blood; breaths put oxygen in it. Bag-mask with high-flow oxygen at 30:2, each breath over 1 second, just enough to see the chest rise — and once the tube is in, 1 breath every 6 seconds without stopping the compressions.',
      done: (s) => s.performed.find((p) => p.id === 'bvm' && p.minute < (s.flags.rosc ?? Infinity))?.minute ?? null, uses: ['bvm'],
    },
    {
      id: 'rn-capno', label: 'Waveform capnography on the bag or the tube', roles: ED_RN, points: 5, done: ['capno'],
      why: 'It confirms the tube, shows how well the compressions are working (a low or falling EtCO₂: push harder or switch compressors), and an abrupt, sustained rise signals ROSC.',
    },
    askCritical(PRESSOR_ORDER),
    {
      id: 'rn-show', label: 'Show the 12-lead to the physician the moment it prints', roles: ED_RN, points: 10,
      target: { within: { flag: 'ecg12', minutes: 2 } }, applies: (s) => has(s, 'ecg12'),
      why: 'A post-arrest 12-lead decides whether he goes to the cath lab now: take it to the physician at once (SBAR, closed loop). One left on the screen delays everything after it.',
      done: (s) => firstDone(s, ['notify-physician'], 'ecg12'), uses: ['notify-physician'],
    },
    {
      id: 'rn-neuro', label: 'After ROSC: neuro check — does he follow commands?', roles: ED_RN, points: 5, after: 'rosc', applies: (s) => has(s, 'rosc'), done: ['neuro'],
      why: 'GCS, pupils and whether he follows commands, with his temperature: a patient who does not follow commands after ROSC needs temperature control, and the physician needs the exam to order it.',
    },

    // ─── the ER doctor ───
    {
      id: 'md-shock', label: 'Shock at once: the pads are on', roles: ED_MD, points: 15, target: { by: 1 },
      why: 'The pads are on and the defibrillator is ready: witnessed VF is shocked now, not after another round of compressions, a line or an airway. In hospital, a first shock more than 2 minutes after the collapse was linked to far fewer survivors (22 % vs 39 % to discharge; Chan, NEJM 2008).',
      done: (s) => (has(s, 'team-shock-1') ? null : firstDone(s, ['defib', 'aed'])), uses: ['defib', 'aed'],
    },
    {
      id: 'md-epi', label: 'Epinephrine 1 mg after the second shock', roles: ED_MD, points: 10,
      target: { within: { flag: 'shock-2', minutes: 2 } }, applies: (s) => has(s, 'shock-2'),
      why: 'In VF epinephrine comes once defibrillation has failed — after the second shock — then every 3–5 minutes (2025 AHA). Given in the first 2 minutes after the first shock in an in-hospital VF arrest, it was linked to fewer survivors (Andersen, BMJ 2016).',
      done: (s) => ownDose(s, ['epinephrine'], 'team-epi'),
      uses: ['epinephrine'],
    },
    {
      id: 'md-antiarrhythmic', label: 'Amiodarone 300 mg or lidocaine 1–1.5 mg/kg after the third shock', roles: ED_MD, points: 10,
      target: { within: { flag: 'shock-3', minutes: 2 } }, applies: (s) => has(s, 'shock-3'),
      why: 'For VF that persists after the third shock: amiodarone 300 mg (then 150 mg) or lidocaine 1–1.5 mg/kg (then 0.5–0.75 mg/kg) — either one (2025 AHA). Moving the pads (vector change) or double sequential defibrillation for VF that persists after 3 or more shocks: their usefulness is not established (2025 AHA).',
      done: (s) => ownDose(s, ['amio-arrest', 'lidocaine'], 'team-amio'),
      uses: ['amio-arrest', 'lidocaine'],
    },
    {
      id: 'md-ventilate', label: 'Breaths with oxygen in the arrest: bag-mask 30:2, or an airway placed while compressions go on', roles: ED_MD, points: 5,
      why: 'A bag-mask at 30:2 is fine in the first minutes of VF; the shocks and the compressions come first. An advanced airway (supraglottic or a tube, whichever the team places best) goes in while the compressions go on, then 1 breath every 6 seconds with continuous compressions.',
      done: (s) => s.performed.find((p) => (p.id === 'bvm' || p.id === 'airway') && p.minute < (s.flags.rosc ?? Infinity))?.minute ?? null, uses: ['bvm', 'airway'],
    },
    {
      id: 'md-airway', label: 'A secure airway for a comatose patient: placed during compressions, or once there is a pulse', roles: ED_MD, points: 5, done: ['airway', 'rsi'],
      why: 'He will be comatose after ROSC and on his way to the cath lab: he needs a tube. Placed during the arrest it goes in without stopping compressions; placed after ROSC, resuscitate the pressure first.',
    },
    {
      id: 'md-capno', label: 'Waveform capnography: confirm the airway, watch the compressions', roles: ED_MD, points: 5,
      why: 'Continuous waveform capnography confirms the tube (2025 AHA: Class 1), shows CPR quality, and an abrupt sustained rise signals ROSC. A low number alone is never a reason to stop.',
      done: (s) => s.flags.capno ?? null, uses: ['capno', 'airway'],
    },
    {
      id: 'md-hs-ts', label: 'Look for the reversible causes (Hs and Ts)', roles: ED_MD, points: 5, done: ['hs-ts'],
      why: 'Refractory VF has a cause: two hours of chest pressure point to a coronary occlusion; his potassium was normal; breath sounds are equal. The cause decides what comes after ROSC.',
    },
    {
      id: 'md-post-bp', label: 'After ROSC: MAP 65 or more — a vasopressor (and fluid)', roles: ED_MD, points: 10, after: 'rosc', applies: (s) => has(s, 'rosc'),
      target: { within: { flag: 'rosc', minutes: 5 } }, done: ['pressor', 'fluid', 'push-epi'],
      why: 'His pressure after ROSC is 84/50, a MAP of 61. Avoid hypotension: a MAP of 65 mmHg or more (2025 AHA), with norepinephrine (no vasopressor is preferred over another) and fluid if he needs it.',
    },
    {
      id: 'md-activate', label: 'Read the STEMI after ROSC and activate the cath lab — comatose or not', roles: ED_MD, points: 15, applies: (s) => has(s, 'rosc'),
      target: { within: { flag: 'ecg12', minutes: 10 } }, done: ['cath-lab-activate'],
      why: 'ST elevation after ROSC means emergent coronary angiography, whether the patient is awake or comatose (2025 AHA: Class 1; 2025 ACC/AHA ACS guideline). His occlusion caused the arrest: opening it is the treatment, and coma does not change it.',
    },
    {
      id: 'md-temperature', label: 'Not following commands after ROSC: temperature control', roles: ED_MD, points: 5, after: 'rosc', applies: (s) => has(s, 'rosc'), done: ['neuro'],
      why: 'Check whether he follows commands: an adult who does not after ROSC gets deliberate temperature control at a chosen target between 32 and 37.5 °C (Class 1) for at least 36 hours (2a), with active fever prevention after (2025 AHA).',
    },

    // ─── both ───
    {
      id: 'rosc-check', label: 'At the rhythm check after the converting shock: a pulse check, 10 seconds or less', points: 5, applies: (s) => has(s, 'converted'),
      why: 'After a shock, 2 minutes of compressions come first; at the rhythm check, organized complexes call for a pulse check (no more than 10 seconds) — that is how ROSC is found, not by feeling for a pulse right after the shock.',
      done: (s) => {
        if (!has(s, 'converted')) return null;
        const cycle = s.performed.find((p) => p.id === 'cpr' && p.minute >= s.flags.converted);
        if (!cycle) return null;
        return s.performed.find((p) => p.id === 'pulse-check' && p.minute >= cycle.minute + 2)?.minute ?? null;
      },
      uses: ['pulse-check'],
    },
    {
      id: 'post-ventilation', label: 'After ROSC: slow the breaths to 10 a minute, oxygen to an SpO₂ of 90–98 %', points: 10, applies: (s) => has(s, 'rosc'),
      target: { within: { flag: 'rosc', minutes: 3 } },
      why: 'He is being bagged 28 times a minute on 100 % oxygen. After ROSC: 1 breath every 6 seconds to start, a PaCO₂ of 35–45 mmHg (EtCO₂ guides it), and the oxygen titrated to an SpO₂ of 90–98 % (2025 AHA). Hyperventilation narrows the brain\'s vessels, and the pressure in the chest cuts the blood returning to the heart.',
      done: (s) => firstDone(s, ['bvm', 'capno'], 'rosc'), uses: ['bvm', 'capno'],
    },
    {
      id: 'post-ecg', label: '12-lead as soon as there is a pulse', points: 10, after: 'rosc', applies: (s) => has(s, 'rosc'),
      target: { within: { flag: 'rosc', minutes: 10 } }, done: ['ecg12', 'ecg12-repeat'],
      why: 'Every patient with ROSC gets a 12-lead as soon as possible: ST elevation means emergent coronary angiography. His shows the inferior STEMI that caused the arrest — new since his triage tracing.',
    },
    {
      id: 'handoff', label: 'Hand-off to the cath lab team', points: 5, applies: (s) => has(s, 'rosc'), done: ['handoff'],
      why: 'SBAR with the times: the collapse, each shock, each drug and its time, the airway, ROSC, the post-arrest pressure and the norepinephrine, the 12-lead, the neuro exam and the temperature control, the IV and his allergies (none).',
    },
  ],
  harms: [
    {
      id: 'airway-before-shock', actions: ['airway'], when: (s) => shockDue(s), points: 8, severity: 'major',
      text: 'Intubating while the shock waits. The defibrillator was ready and the rhythm called for a shock: the laryngoscope stopped the compressions and held the shock back. Shock first; place the airway while the compressions go on after it — a bag-mask at 30:2 is fine until then (2025 AHA: weigh the airway against the compression fraction, above all in VF).',
    },
    {
      // a 3-minute bedside ultrasound at the rhythm check holds the shock back just as a line does
      id: 'line-before-shock', actions: ['iv', 'io', 'central-line', 'pocus'], when: (s) => shockDue(s), points: 8, severity: 'major',
      text: 'A line or an ultrasound before the shock. The defibrillator was ready and the rhythm called for a shock: in hospital, each minute of delay to the shock was linked to fewer survivors (Chan, NEJM 2008), and no drug or scan works as well as the shock. Shock, then start the line while a teammate compresses — and look with the ultrasound only within a 10-second rhythm check.',
    },
    {
      id: 'pulse-check-after-shock', actions: ['pulse-check'], when: (s) => !s.pulse && shockedNoCpr(s), points: 5, severity: 'major',
      text: 'A pulse check right after the shock. Even a shock that works leaves a heart that cannot pump yet: resume compressions at once for 2 minutes, then check the rhythm — and the pulse only if the complexes are organized.',
    },
    {
      id: 'second-pulse-check', actions: ['pulse-check'], when: (s) => !s.pulse && checksSinceCpr(s) >= 1, points: 5, severity: 'major',
      text: 'A second pulse check before the next cycle of compressions. Every check is a pause in the only blood flow he has: one check, no more than 10 seconds, then straight back on the chest.',
    },
    {
      id: 'pause-in-arrest', actions: ['reassess', 'vitals', 'primary'], when: (s) => !s.pulse && (count(s, 'cpr') > 0 || vfShocks(s) > 0), points: 3, severity: 'minor',
      text: 'Stopping the resuscitation to reassess. In cardiac arrest the assessment is the 2-minute rhythm check (and a pulse check of 10 seconds or less when the complexes are organized); anything more stops the compressions.',
    },
    {
      id: 'no-shock-at-rhythm-check', actions: ['cpr'], when: (s) => shockDue(s) && vfShocks(s) > 0, points: 8, severity: 'major',
      text: 'Another cycle of compressions without the shock. At the rhythm check the trace still called for a shock: the defibrillator comes first at every check, then compressions resume at once.',
    },
    {
      // also a shock straight after a teammate's: it does not count as the next shock of the algorithm (see stacked)
      id: 'stacked-shock', actions: ['defib', 'aed'], when: (s) => stacked(s), points: 5, severity: 'major',
      text: 'A second shock with no compressions after the first. Stacked shocks are not used outside a few cath lab situations: one shock, then 2 minutes of compressions at once — the heart needs that blood flow before the next shock can work.',
    },
    {
      // the only pulseless rhythm here besides the VF is the organized one the converting shock leaves: he has a pulse by
      // the rhythm check, so the built-in "asystole and PEA" wording would not fit
      id: 'shock-organized', actions: ['defib', 'cardiovert'], when: (s) => !s.pulse && !vf(s), points: 10, severity: 'major',
      replaces: ['shock-nonshockable'],
      text: 'A shock for organized complexes. The VF had converted: organized complexes at the rhythm check call for a pulse check (10 seconds or less), not another shock — he had a pulse, and an unsynchronized shock on a beating heart can throw it back into VF.',
    },
    {
      id: 'epi-before-second-shock', actions: ['epinephrine'], when: (s) => !s.pulse && vfShocks(s) < 2, points: 3, severity: 'minor',
      text: 'Epinephrine before the second shock. In VF the shock is the treatment: epinephrine comes once defibrillation has failed — after the second shock — then every 3–5 minutes. Given within 2 minutes of the first shock in an in-hospital VF arrest, it was linked to fewer survivors (Andersen, BMJ 2016).',
    },
    {
      id: 'epi-too-soon', actions: ['epinephrine'], when: (s) => !s.pulse && (sinceLastEpi(s) ?? Infinity) < 3, points: 3, severity: 'minor',
      text: 'Epinephrine again less than 3 minutes after the last dose. The interval is 3–5 minutes: stacked doses add up to high-dose epinephrine, which brings no benefit and drives up the oxygen demand of an ischemic heart.',
    },
    {
      id: 'antiarrhythmic-before-shock', actions: ['amio-arrest', 'lidocaine'], when: (s) => !s.pulse && vfShocks(s) === 0, points: 3, severity: 'minor',
      text: 'An antiarrhythmic before any shock. Amiodarone and lidocaine are for VF that shocks have not fixed: the shock comes first.',
    },
    {
      // the nurse's version is the built-in rule: an infusion without an order
      id: 'amio-infusion-in-arrest', actions: ['amio-infusion'], roles: ED_MD, when: (s) => !s.pulse, points: 3, severity: 'minor',
      text: 'An amiodarone infusion in cardiac arrest. 150 mg over 10 minutes is the dose for a tachycardia with a pulse; in VF the dose is a 300 mg push (then 150 mg), given during compressions.',
    },
    {
      id: 'push-epi-in-arrest', actions: ['push-epi'], roles: ED_MD, when: (s) => !s.pulse, points: 3, severity: 'minor',
      text: 'Push-dose epinephrine in cardiac arrest. 10–20 mcg is the dose for a low pressure with a pulse; the arrest dose is 1 mg every 3–5 minutes.',
    },
    {
      id: 'adenosine-in-arrest', actions: ['adenosine6', 'adenosine12'], roles: ED_MD, when: (s) => !s.pulse, points: 3, severity: 'minor',
      text: 'Adenosine in cardiac arrest. It is for a regular narrow-complex tachycardia with a pulse; in VF it treats nothing.',
    },
    {
      // in the arrest it has no role; after ROSC he is comatose, hypotensive or pressor-dependent, with no pain to report
      id: 'nitrate', actions: ['nitro', 'nitro-high'], points: 8, severity: 'major',
      replaces: ['nitro-hypotension', 'nitro-high-not-hypertensive', 'rn-without-order-nitro-high'],
      text: 'Nitroglycerin in the arrest or after ROSC. In the arrest it has no role; after ROSC his pressure is low, or held up only by norepinephrine, and nitrates drop it further. The ischemia is treated by opening the artery in the cath lab.',
    },
    {
      id: 'rate-drug', actions: ['metoprolol', 'diltiazem'], points: 8, severity: 'major',
      replaces: ['rn-without-order-metoprolol', 'rn-without-order-diltiazem'],
      text: 'A beta-blocker or diltiazem in the arrest or after ROSC. His fast rate after ROSC is the body\'s answer to the arrest, the epinephrine and a low pressure: these drugs weaken the squeeze and drop a pressure that is barely held up, and can bring the arrest back.',
    },
    {
      id: 'lytic-pci-here', actions: ['tnk', 'alteplase'], points: 15, severity: 'critical',
      replaces: ['lytic-no-indication', 'rn-without-order-alteplase'],
      text: 'A fibrinolytic in a hospital whose own cath lab can open the artery. During CPR routine fibrinolysis does not improve survival (TROICA); after ROSC, primary PCI opens more arteries with fewer bleeds — and after minutes of compressions a fibrinolytic adds a real risk of bleeding into the chest and the brain.',
    },
    {
      id: 'admit-no-cath', actions: ['admit'], roles: ED_MD, when: (s) => !has(s, 'alert'), points: 15, severity: 'critical',
      text: 'Admitting a resuscitated patient without the cath lab. His arrest came from a coronary occlusion: ST elevation after ROSC means emergent coronary angiography, comatose or not (2025 AHA: Class 1). A 12-lead first, then the lab — the ICU comes after.',
    },
    {
      id: 'transfer-pci-here', actions: ['transfer'], roles: ED_MD, when: (s) => !has(s, 'alert'), points: 10, severity: 'major',
      text: 'Transferring a post-arrest STEMI out of a hospital with its own cath lab. A transfer adds an hour or more to opening the artery: activate your own lab.',
    },
  ],
  timings: TIMINGS,
  cathLabMinutes: CATH_MINUTES,
  deathAfter: DEATH_AFTER,
  completeWhen: (s) => has(s, 'rosc'),
  teaching: [
    'In hospital, a witnessed collapse on the monitor: call the code (it brings the team and the defibrillator), start compressions, and shock as soon as the pads are on. A first shock more than 2 minutes after the collapse was linked to far fewer survivors (22 % vs 39 % to discharge; Chan, NEJM 2008). The ER nurse defibrillates per ACLS without waiting for an order.',
    'After every shock: compressions at once for 2 minutes — no pulse or rhythm check right after it (even a shock that works leaves a heart that cannot pump yet). Check the rhythm every 2 minutes, switch compressors at each check, keep every pause under 10 seconds, and charge the defibrillator during the compressions so the pre-shock pause is seconds.',
    'Shockable rhythms (2025 AHA): shock → CPR and IV access (IO if the IV fails) → shock → CPR with epinephrine 1 mg every 3–5 minutes → shock → CPR with amiodarone 300 mg (then 150 mg) or lidocaine 1–1.5 mg/kg (then 0.5–0.75 mg/kg). Epinephrine within 2 minutes of the first shock in an in-hospital VF arrest was linked to fewer survivors (Andersen, BMJ 2016). For VF that persists after 3 or more shocks, moving the pads (vector change) or double sequential defibrillation: their usefulness is not established (2025 AHA) — not a standard step.',
    'The airway: a bag-mask at 30:2 with oxygen is fine early in VF. An advanced airway (supraglottic or a tube — whichever the team places most reliably) goes in while the compressions go on, never at the rhythm check or before the shock; confirm it with waveform capnography, then 1 breath every 6 seconds with continuous compressions.',
    'Capnography in the arrest: a low or falling EtCO₂ means improve the compressions (push harder, switch compressors); an abrupt, sustained rise (often to 40 mmHg or more) suggests ROSC. Never stop a resuscitation on EtCO₂ alone.',
    'Refractory VF has a cause — think through the Hs and Ts: hypovolemia, hypoxia, hydrogen ion, hypo-/hyperkalemia, hypothermia; tension pneumothorax, tamponade, toxins, thrombosis (coronary or pulmonary). Chest pain before the collapse points to a coronary occlusion.',
    'After ROSC (2025 AHA): 100 % oxygen until the saturation reads reliably, then titrate to an SpO₂ of 90–98 % (the 2020 target was 92–98 %); ventilate to a PaCO₂ of 35–45 mmHg, starting at 1 breath every 6 seconds — hyperventilation narrows the brain\'s vessels and cuts the return of blood to the heart; avoid hypotension: a MAP of 65 mmHg or more, with a vasopressor (none is preferred) and fluid as needed.',
    'A 12-lead as soon as there is a pulse: ST elevation after ROSC means emergent coronary angiography, comatose or awake (Class 1). Compare it with earlier tracings: an occlusion can evolve after a non-diagnostic triage 12-lead — repeat the 12-lead every 15–30 minutes while chest pain goes on.',
    'A patient who does not follow commands after ROSC gets temperature control: a chosen target between 32 and 37.5 °C for at least 36 hours, then active fever prevention (2025 AHA), with EEG monitoring. Coma does not delay the cath lab: temperature control goes on there.',
    'In a hospital with its own cath lab: no fibrinolytic (routine lysis during CPR does not help — TROICA — and after ROSC primary PCI is better), no transfer, and no ICU admission in place of the lab.',
    'Who does what: the ER nurse recognizes the arrest, calls the code, compresses, defibrillates and gives the ACLS drugs per protocol, keeps the 2-minute times, attaches capnography, records the 12-lead and shows it at once, and starts drugs beyond the protocol (norepinephrine) on the physician\'s order. The ER doctor leads with closed-loop orders: the shocks and the drugs at the right moments, the airway without stopping compressions, the Hs and Ts, and after ROSC the pressure, the ventilation, the 12-lead, the cath lab and temperature control.',
  ],
};
