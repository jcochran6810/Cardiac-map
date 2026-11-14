import type { Effect, Line, Scenario, SimState, Speaker } from '../types';
import { atRate, bpAfter, count, firstDone, has, line, orderedFlag } from '../kit';
import { askCritical, askEvents, type LabAsk } from '../labKit';
import { DOOR_TO_ECG, ED_MD, ED_RN, ED_TEAM, edOrder, physicianDispo, physicianOrder } from '../edKit';
import { NITRATE_RULES, SEDATIVE_RULES } from '../rules/acs';
import { LIDOCAINE_RULES, RATE_RULES, yieldToHeavier } from '../rules/rhythm';

/**
 * Pulmonary embolism with shock, in the emergency department. A 52-year-old woman, four days after a 15-hour flight and
 * on oral estrogen for hot flashes, with a sore left calf, gets up from the couch, cannot get her breath and faints. A
 * BLS crew brings her in: a fast rate, a low pressure, a low SpO₂, distended neck veins, clear lungs — and on the
 * bedside ultrasound a huge right ventricle squeezing a small left one. 2026 AHA/ACC acute PE Clinical Category E1
 * (persistent hypotension with shock): systemic thrombolysis is reasonable (class 2a) when the bleeding risk allows,
 * and hers does — no surgery, no injury, no stroke, no bleeding, and her husband caught her when she fainted.
 *
 * The ER nurse (role 6): ESI 1, the monitor and a non-rebreather, the ED physician to the bedside at once, two large-bore
 * IVs and labs, the 12-lead; then the physician's orders — heparin, norepinephrine, and alteplase 100 mg over 2 hours
 * after the bleeding checklist and a baseline neuro check — the checks during the infusion, and the bleeding she finds
 * reported. The ER doctor (role 7): the computer nurse does the nursing; the doctor scans the heart, anticoagulates at
 * once, holds the pressure up with norepinephrine (not liters of fluid), checks the contraindications, gives alteplase,
 * calls the PE response team and admits her to the ICU — without intubating her or sending her to the scanner in shock.
 *
 * Delay matters: without a vasopressor the right ventricle starts to fail at minute 14 (24 with one), and without the
 * lytic she arrests in PEA 6 minutes later (4 with nothing holding the pressure). Two fluid boluses or nitroglycerin
 * make it fail at once; a third bolus, or an intubation or a trip to the scanner with nothing holding the pressure up,
 * arrests her. In the arrest: CPR, epinephrine and the lytic as a bolus — with the clot dissolving, she comes back.
 */

/** Her weight (kg): the heparin and norepinephrine doses are worked out from it */
const WEIGHT = 70;

/** The right ventricle starts to fail at this minute with nothing holding the pressure up, and at the next one with a vasopressor */
const FAILS_UNSUPPORTED = 14;
const FAILS_SUPPORTED = 24;

/** Minutes from the failing right ventricle to the arrest without a lytic: with a vasopressor running, and without one */
const ARREST_SUPPORTED = 6;
const ARREST_UNSUPPORTED = 4;

/** Minutes a push of push-dose epinephrine holds the pressure: a bridge to the infusion, not a treatment */
const PUSH_LASTS = 6;

/** Minutes from the lytic (or from ROSC, if later) until the clot has broken up enough to unload the right ventricle */
const LYSIS_MINUTES = 10;

/** The ER nurse's run: the physician comes by himself at this minute if nobody calls him, and scans for this long */
const MD_COMES_BY = 8;
const SCAN_MINUTES = 3;

/** Minutes into the alteplase infusion when the old IV site starts to ooze, and when the computer physician decides on the ICU */
const OOZE_AFTER = 4;
const DISPO_AFTER = 3;

/** Minutes from the ICU accepting her until the bed is ready and the ICU team comes down for her */
const ICU_MINUTES = 10;

/** The ER doctor's goal for the lytic (minutes from arrival): the item's target, and the line for an arrest that came first */
const LYTIC_BY = 20;

/** Two-minute CPR cycles started since a flag was set (the cycle being started now is not counted yet) */
function cyclesSince(s: SimState, flag: string): number {
  const from = s.flags[flag];
  if (from === undefined) return 0;
  return s.performed.filter((p) => p.id === 'cpr' && p.minute >= from).length;
}

/** A vasopressor is holding her pressure up: the infusion, or a push of push-dose epinephrine in the last few minutes */
function supported(s: SimState): boolean {
  if (has(s, 'pressor')) return true;
  const push = s.performed.filter((p) => p.id === 'push-epi').at(-1);
  return push !== undefined && s.minute - push.minute <= PUSH_LASTS;
}

/** The right ventricle has started to fail: the step before the arrest */
const failing = (s: SimState) => has(s, 'rv-failing');

/** When the fibrinolytic was started (by the learner, or by the computer physician), or null */
function lyticStart(s: SimState): number | null {
  const own = s.performed.find((p) => p.id === 'alteplase' || p.id === 'tnk');
  if (own) return own.minute;
  return s.flags.lytic ?? null;
}

/** Her own account of what happened (OPQRST), while she can talk */
const OPQRST = 'It came on all at once, about forty minutes ago, when I got up off the couch. I couldn\'t get my breath, everything went gray, and then I was on the floor. Now there\'s a sharp pain on the right side of my chest when I breathe in — 4 out of 10. I just can\'t get enough air.';

/** Her history (SAMPLE), with every bleeding risk a lytic needs answered: none */
const SAMPLE = 'No allergies. I take estrogen tablets for hot flashes — for about a year — and nothing else. I flew home from Manila four days ago, fifteen hours on the plane, and my left calf has been sore and swollen since yesterday. No operations, no injuries, no bleeding problems — no stomach ulcers, no blood in my stool or urine. I\'ve never had a stroke or bleeding in my head, and I\'m not on any blood thinner. When I fainted my husband caught me: I didn\'t hit my head. My periods stopped two years ago. Toast this morning.';

/** The first lytic went in during the arrest (a push), not as the 2-hour infusion with a pulse */
const lyticInArrest = (s: SimState) => has(s, 'arrest-lytic');

/**
 * She arrested early from a wrong step (a third bolus, nitroglycerin, the tube, the scanner) before the lytic was due and
 * before any was given: the lytic in the arrest is then the doctor's item, not the infusion that never had its chance. An
 * arrest that came from waiting (no lytic in time) leaves the infusion item missed
 */
const provokedEarly = (s: SimState) => {
  const at = s.flags['provoked-arrest'];
  const l = lyticStart(s);
  return at !== undefined && at < LYTIC_BY && (l === null || l >= at);
};

/**
 * The nurse's first 12-lead has just been recorded and the engine will ask for her read once the events have run: the
 * physician keeps his scan result (which names what she has) until she has read the tracing
 */
const readComing = (s: SimState) => s.performed.at(-1)?.id === 'ecg12' && s.lastEcg === null;

/** The teammate at the bedside who speaks up: a tech in the nurse's run, the nurse in the doctor's */
const helper = (s: SimState): Speaker => (s.role === 6 ? 'team' : 'nurse');

/** A history she cannot give (in the arrest, on the ventilator, too drowsy): her husband answers from the doorway */
function history(s: SimState, own: string, husband: string, flag: string): Effect {
  if (s.pulse && s.vitals.gcs >= 13 && !has(s, 'rsi')) return { say: [['patient', own]], flags: [flag] };
  return { say: [['team', `Her husband, at the door: "${husband}"`]], flags: [flag] };
}

/**
 * Who gives it: the ER nurse gives it herself (on the physician's order); the ER doctor orders it and the computer nurse
 * gives it
 */
function given(s: SimState, order: string, done: string): Line[] {
  return s.role === 7 ? [['you', order], ['nurse', done]] : [['you', done]];
}

/** Only a patient awake enough to talk says how she feels */
const awake = (s: SimState, text: string): Line[] => (s.pulse && s.vitals.gcs >= 13 ? [['patient', text]] : []);

/** A dose in units, written as the order is said: 5,600 */
const units = (n: number) => n.toLocaleString('en-US');

/** The numbers at the bedside (the monitor shows them; the learner reads the tracing) */
const numbers = (s: SimState) => `BP ${s.vitals.sbp}/${s.vitals.dbp} · pulse ${s.rhythm.hr} · RR ${s.vitals.rr} · SpO₂ ${s.vitals.spo2}%`;

/** What she says when reassessed */
function statusText(s: SimState): string {
  if (!s.pulse) return 'Unresponsive.';
  if (has(s, 'rsi')) return 'Sedated and paralyzed on the ventilator.';
  if (has(s, 'lysis-response')) return has(s, 'rosc') ? 'Awake now, a little muddled: "Where… am I? …It\'s easier to breathe."' : '"I can breathe a little easier… I don\'t feel so faint."';
  if (has(s, 'rosc')) return 'Moans and opens her eyes to her name.';
  if (failing(s)) return '"I\'m going to pass out… I can\'t get any air…"';
  if (supported(s) && has(s, 'o2')) return '"Still so short of breath… but I don\'t feel quite so faint."';
  return '"I can\'t get my breath… I feel like I\'m going to faint again."';
}

/** Return of circulation: the lytic is working on the clot, but the right ventricle is still struggling */
function rosc(s: SimState): Effect {
  const bp = has(s, 'pressor') ? { sbp: 94, dbp: 58 } : { sbp: 80, dbp: 48 };
  const tubed = has(s, 'rsi') || has(s, 'airway');
  const breathing = has(s, 'rsi') ? 'Still sedated and paralyzed on the ventilator.' : tubed ? 'She is moving against the tube.' : 'She gasps, then breathes on her own, fast and shallow.';
  return {
    say: [
      ['you', 'Pulse check at the end of the cycle: a carotid pulse — ROSC.', 'good'],
      [helper(s), breathing],
      ...(has(s, 'capno') ? [line('monitor', 'EtCO₂ rises to 28 mmHg.')] : []),
    ],
    rhythm: { profile: 'pulmonary-embolism', hr: 126 }, pulse: true, phase: 'rosc',
    vitals: { ...bp, spo2: 88, rr: tubed ? 16 : 28, etco2: 28, gcs: has(s, 'rsi') ? 3 : 10, pain: 0 },
    flags: ['cpr'],
  };
}

/**
 * The arrest: the right ventricle gives out behind the clot (organized complexes on the monitor, no pulse). The EtCO₂ is
 * left as it was, so the monitor and the capnography line both read the shared arrest rule (kit's arrestEtco2).
 * `provoked`: a wrong step brought it on (see provokedEarly). The physician's orders still open for the infusions lapse —
 * the code is run now, and the lytic comes as the arrest's own push order — so nobody hangs a 2-hour drip during CPR
 */
function arrest(s: SimState, why: string, provoked: boolean): Effect {
  const lapsed = [RN_HEPARIN, RN_PRESSOR, RN_ALTEPLASE].filter((a) => has(s, `asked-${a.id}`) && !has(s, a.gives)).map((a) => a.gives);
  return {
    say: [[helper(s), why, 'bad'], ['monitor', 'Monitor alarm.', 'bad']],
    rhythm: { profile: 'pea', hr: 118 }, pulse: false, phase: 'arrest',
    vitals: { sbp: 0, dbp: 0, gcs: 3, rr: 0 }, flags: ['pe-arrest', ...(provoked ? ['provoked-arrest'] : []), ...lapsed],
  };
}

/** The alteplase: 100 mg over 2 hours with a pulse (the heparin drip paused while it runs), a 50 mg push in the arrest */
function alteplase(s: SimState, by: 'learner' | 'physician'): Effect {
  if (!s.pulse) {
    const lines: Line[] = by === 'physician'
      ? [['physician', 'Alteplase 50 mg IV push, flushed. Keep compressing — it needs circulation to reach the clot.']]
      : given(s, 'Alteplase 50 mg IV push, now — and keep the compressions going: it needs circulation to reach the clot.', 'Alteplase 50 mg IV push, flushed; compressions go on.');
    return { say: lines, flags: ['lytic', 'alteplase', 'arrest-lytic'] };
  }
  const paused = has(s, 'heparin') ? '; the heparin drip paused while it runs' : '';
  // the computer nurse records the baseline neuro check before she hangs it; the ER nurse does her own ('neuro')
  const lines: Line[] = by === 'physician'
    ? [['physician', `I've gone through the checklist with her myself: alteplase 100 mg running over 2 hours${paused}.`]]
    : s.role === 7
      ? [['you', 'Alteplase 100 mg IV over 2 hours.'], ['nurse', `Baseline neuro check normal. Alteplase 100 mg running over 2 hours on a pump${paused}.`]]
      : [['you', `Alteplase 100 mg running over 2 hours on a pump${paused}.`], ...unordered(s)];
  // the charge nurse who catches an unordered lytic before the physician is in the room brings him
  const fetch = s.role === 6 && !has(s, orderedFlag('alteplase')) && !has(s, 'md-bedside') ? ['physician-notified'] : [];
  return { say: lines, flags: ['lytic', 'alteplase', 'alteplase-infusion', 'lytic-watch', ...(has(s, 'heparin') ? ['heparin-paused'] : []), ...fetch] };
}

/**
 * The ER nurse hangs a fibrinolytic nobody has ordered: the physician (or, before he is in the room, the charge nurse who
 * fetches him) says so at once. It is in and cannot be taken back, so from here it is watched like any lytic
 */
function unordered(s: SimState): Line[] {
  if (s.role !== 6 || has(s, orderedFlag('alteplase'))) return [];
  return has(s, 'md-bedside')
    ? [['physician', 'Who ordered alteplase? A fibrinolytic is my decision — after I have examined her and gone through the bleeding risks with her. It is in now, so we watch her closely; never give a drug I have not ordered.', 'bad']]
    : [['team', 'The charge nurse, at the door: "Alteplase? Nobody has ordered that — I\'m getting the physician in here now."', 'bad']];
}

/** A drug that slows the heart or weakens its squeeze: the fast rate is what keeps her output up */
function slower(s: SimState, drug: string, dHr: number, flag: string): Effect | null {
  if (!s.pulse) return null;
  const bp = bpAfter(s, dHr > 0 ? -14 : -10, dHr > 0 ? -8 : -6);
  const hr = Math.max(100, s.rhythm.hr - dHr);
  return {
    say: [
      ...given(s, `${drug} — order given.`, `${drug} given.`),
      ['monitor', dHr > 0 ? `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.` : `BP ${bp.sbp}/${bp.dbp}.`, 'bad'],
      [helper(s), 'She is grayer, and she says she is going to pass out.', 'bad'],
    ],
    vitals: { ...bp, gcs: Math.min(s.vitals.gcs, 14) }, ...(dHr > 0 ? { rhythm: atRate(s, hr) } : {}), flags: [flag],
  };
}

/** Nitroglycerin: the preload goes, and with it the pressure — to 66/40, or further down from a pressure already lower */
function nitroCrash(s: SimState, high: boolean): Effect | null {
  if (!s.pulse) return null;
  const fall = bpAfter(s, high ? -20 : -12, high ? -10 : -8);
  const sbp = Math.min(66, fall.sbp);
  const dbp = Math.min(40, fall.dbp);
  return {
    say: [
      ['you', `Nitroglycerin ${high ? '0.8' : '0.4'} mg sublingual.`],
      ...awake(s, '"Everything\'s going dark…"'),
      ['monitor', `BP ${sbp}/${dbp}.`, 'bad'],
      [helper(s), 'She has gone gray and slumped down in the bed.', 'bad'],
    ],
    vitals: { sbp, dbp, gcs: Math.min(s.vitals.gcs, 13) },
    flags: high ? ['nitro', 'nitro-high'] : ['nitro'],
  };
}

/** A sedative: it takes away the fear that is driving her pressure, and some of her breathing with it */
function sedative(s: SimState, drug: string, flags: string[]): Effect | null {
  if (!s.pulse) return null;
  const bp = bpAfter(s, -12, -8);
  return {
    say: [...given(s, `${drug} — order given.`, `${drug} given.`), [helper(s), 'She is drowsy now, and her breathing is slower and shallower.', 'bad'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`, 'bad']],
    vitals: { ...bp, gcs: Math.min(s.vitals.gcs, 13), rr: Math.max(16, s.vitals.rr - 6), spo2: Math.max(70, s.vitals.spo2 - 3) }, flags,
  };
}

// ─── The ER nurse's orders from the (computer) ED physician ───────────────────

const RN_HEPARIN: LabAsk = edOrder({
  // not again for a dose already in (given without his order, he still does not double it), nor on top of a lytic
  id: 'rn-heparin', when: (s) => s.pulse && has(s, 'md-scan') && !has(s, 'heparin') && !has(s, 'lytic') && !has(s, 'arrest'),
  ask: `Heparin now: 80 units per kilo IV — she's ${WEIGHT} kilos, so ${units(80 * WEIGHT)} units — then a drip at 18 units per kilo per hour. That's the dose for a clot in the lungs, not the chest pain dose.`,
  accept: ['heparin'],
  thanks: 'Thanks. That keeps the clot from growing while we deal with it.', fallback: 'I\'ll get the heparin in myself.', gives: 'heparin-given',
  // a lytic hung in the meantime: the heparin waits for the end of the infusion
  fallbackEffect: (s) => (has(s, 'lytic')
    ? { say: [['physician', 'The alteplase is running now: the heparin waits until it ends.']] }
    : { say: [['physician', `Heparin ${units(80 * WEIGHT)} units IV, and the drip running.`]], flags: ['heparin'] }),
  label: 'Heparin, as ordered (the PE dose)', points: 10,
  why: 'With a pulmonary embolism this likely, anticoagulation starts at once — while the imaging and the decisions follow. Unfractionated heparin, because a lytic or a procedure may follow (it is short-acting and reversible): 80 units/kg, then 18 units/kg/h. Read the dose back and have a second nurse check it.',
});

const RN_PRESSOR: LabAsk = edOrder({
  id: 'rn-pressor', when: (s) => s.pulse && has(s, 'md-scan') && !has(s, 'pressor') && !has(s, 'arrest'),
  ask: 'Start norepinephrine at 0.05 micrograms per kilo per minute through your best line, titrated to a MAP of 65 or more. No fluid boluses for her: her right heart is already overfilled.',
  accept: ['pressor'],
  thanks: 'Good — keep it at a MAP of 65 or more.', fallback: 'I\'ll start the norepinephrine myself.', gives: 'pressor-given',
  fallbackEffect: (s) => (s.pulse ? { say: [['physician', 'Norepinephrine running.']], vitals: { sbp: Math.max(s.vitals.sbp, 98), dbp: Math.max(s.vitals.dbp, 60) }, flags: ['pressor'] } : {}),
  label: 'Norepinephrine, as ordered', points: 10,
  why: 'A failing right ventricle lives on the aortic pressure that perfuses it: norepinephrine is the first vasopressor, titrated to a MAP of 65 or more. A large-bore IV in a big arm vein is fine to start it; check the site for leaks often.',
});

const RN_ALTEPLASE: LabAsk = edOrder({
  // once the heparin is in and the pressure held — whoever gave them
  id: 'rn-alteplase', when: (s) => s.pulse && has(s, 'md-scan') && has(s, 'heparin') && has(s, 'pressor') && !has(s, 'lytic') && !has(s, 'arrest'),
  ask: 'Her pressure is holding on the norepinephrine, but this clot will kill her if it stays: I\'m giving her alteplase, 100 milligrams over 2 hours. Before it goes in, go through the bleeding checklist with her — any bleeding, surgery or injury, a stroke, a head injury when she fainted, blood thinners — and get me a baseline neuro check. Then hang it, and pause the heparin drip while it runs.',
  accept: ['alteplase'],
  thanks: 'Thanks. Vitals and a neuro check every 15 minutes while it runs, and tell me at once about any bleeding.', fallback: 'I\'ll hang the alteplase myself.', gives: 'alteplase-given',
  fallbackEffect: (s) => alteplase(s, 'physician'),
  label: 'Alteplase 100 mg over 2 hours, as ordered', points: 10, wait: 6, within: 4,
  why: 'Systemic thrombolysis for a pulmonary embolism with shock (2026 AHA/ACC Clinical Category E1): the physician decides, the nurse checks it is safe and runs it — 100 mg over 2 hours on a pump, the heparin drip paused until the infusion ends.',
});

const RN_ARREST_LYTIC: LabAsk = edOrder({
  // an order for the arrest itself: not held while there is no pulse
  id: 'rn-arrest-lytic', when: (s) => !s.pulse && has(s, 'md-arrest') && !has(s, 'lytic'), holdInArrest: false,
  ask: 'The clot is what stopped her heart: alteplase 50 milligrams IV push, now. Then keep the compressions going — it needs circulation to work.',
  accept: ['alteplase'],
  thanks: 'Alteplase is in. Keep compressing.', fallback: 'I\'ll push the alteplase myself.', gives: 'arrest-lytic-given',
  fallbackEffect: (s) => alteplase(s, 'physician'),
  label: 'Alteplase push in the arrest, as ordered', points: 10, wait: 2,
  why: 'A cardiac arrest from a pulmonary embolism: systemic thrombolysis may be considered (2025 AHA), commonly alteplase 50 mg IV push — and then the compressions go on, because the drug needs blood flow to reach the clot.',
});

const RN_ASKS = [RN_HEPARIN, RN_PRESSOR, RN_ALTEPLASE, RN_ARREST_LYTIC];

// ─── Harms worded twice: the doctor's, and the nurse's (who also has no order for the drug) ──────────────────

/** Order-only drugs: for the ER nurse the clinical harm also covers the missing order (one mistake, one penalty) */
const noOrder = (ids: string[]) => ids.map((id) => `rn-without-order-${id}`);

export const edPeLysis: Scenario = {
  id: 'pulmonary-embolism-lysis-ed',
  title: 'She fainted and cannot catch her breath',
  summary: '52-year-old woman brought in after a faint at home: breathless, gray and with a low pressure. Find out why — and treat it before her heart gives out.',
  setting: 'ed',
  roles: [6, 7],
  difficulty: 'advanced',
  conditionId: 'pulmonary-embolism',
  briefing: {
    default: [
      ['team', 'Resuscitation bay 2: a BLS crew brings in a 52-year-old woman who fainted at home and cannot catch her breath. Pale, sweaty, breathing fast, her lips dusky; a nasal cannula on.'],
      ['patient', '"I can\'t… get my breath…"'],
    ],
    6: [
      ['team', 'Charge nurse: "Bay 2 is yours: a BLS crew is rolling in a 52-year-old woman who fainted at home and can\'t catch her breath. The ED physician is two bays down with another patient."'],
      ['team', 'She comes through the door pale and sweaty, breathing fast, her lips dusky; a nasal cannula on. A tech is in the room with you.'],
      ['patient', '"I can\'t… get my breath…"'],
      ['team', 'You are her nurse: the assessment, the monitor, the lines and the drugs on the physician\'s orders — and you call the physician. The hospital has an ICU, a cath lab and interventional radiology, cardiac surgery and an ECMO team.'],
    ],
    7: [
      ['team', 'Resuscitation bay 2: a BLS crew brings in a 52-year-old woman who fainted at home and cannot catch her breath. Pale, sweaty, breathing fast, her lips dusky; a nasal cannula on.'],
      ['patient', '"I can\'t… get my breath…"'],
      ['nurse', 'I\'ll get her on the monitor and two lines in. Tell me what you want.'],
      ['team', 'You are the ED physician: the diagnosis, the orders and the procedures are yours; the nurse does the nursing on your orders. The hospital has an ICU, a cath lab and interventional radiology, cardiac surgery and an ECMO team.'],
    ],
  },
  initial: {
    // the 'pulmonary-embolism' profile: sinus tachycardia with S1Q3T3, an incomplete RBBB and T inversion V1–V4
    rhythm: { profile: 'pulmonary-embolism', hr: 128 },
    // a low EtCO₂ for her fast breathing: the clot leaves part of the lung ventilated but not perfused (dead space)
    vitals: { sbp: 82, dbp: 50, spo2: 86, rr: 30, etco2: 24, pain: 4, gcs: 15, glucose: 112, temp: 37.2 },
  },
  // the built-in fibrinolytic rule reads it: a pulmonary embolism with shock is an indication in the department
  problems: ['pulmonary-embolism', 'pe-high-risk'],
  facts: {
    ems: 'BLS crew: "52-year-old woman. Her husband says she got up from the couch, said she couldn\'t breathe and passed out in the kitchen — he caught her, she didn\'t hit her head, out maybe ten seconds. On our arrival: BP 84/52, pulse 130, breathing 30, SpO₂ 84 % on room air, 86 % on 4 liters by cannula; glucose 112; lungs clear. No IV — we\'re BLS and were six minutes out. She flew home from Manila four days ago, and her left calf has been sore since yesterday."',
    opqrst: OPQRST,
    sample: SAMPLE,
    pde5: 'No.',
    allergies: 'No allergies.',
    lungs: (s) => (s.pulse ? 'Clear and equal on both sides — no crackles, no wheezes. She breathes fast and shallow.' : 'Equal breath sounds with each squeeze of the bag; no crackles.'),
    perfusion: (s) => {
      if (!s.pulse) return 'No pulse. Neck veins distended.';
      if (has(s, 'lysis-response')) return 'Pinker and warmer; neck veins still full but lower; a stronger radial pulse. Her left calf is swollen.';
      if (failing(s)) return 'Gray, cool and mottled; neck veins bulging up to the jaw; a weak, thready radial pulse. Her left calf is swollen, warm and tender.';
      return 'Pale, cool and clammy, lips dusky; neck veins distended while she sits up; fast, weak radial pulses. Her left calf is swollen, warm and tender — bigger than the right.';
    },
    // the baseline before a lytic is the awake exam; in the arrest, on the ventilator or drowsy there is less to test
    neuro: (s) => {
      if (!s.pulse) return 'No response; pupils mid-size and equal.';
      if (has(s, 'rsi')) return 'Sedated and paralyzed: pupils equal and reactive — no more of the exam can be tested.';
      if (s.vitals.gcs < 14) return 'Drowsy: opens her eyes to her name and moves all four limbs; pupils equal and reactive.';
      return 'Alert and oriented, pupils equal and reactive, no facial droop, no arm drift, speech clear: a normal baseline neuro exam.';
    },
    labs: 'Drawn and sent: CBC, chemistries, PT/INR and aPTT, fibrinogen, type and screen, high-sensitivity troponin, BNP. Bedside venous gas: lactate 4.6 mmol/L; hemoglobin 13.2 g/dL.',
    troponin: 'Repeat high-sensitivity troponin: 186 ng/L, up from 142 — the strained right ventricle is being injured.',
    cxr: 'Portable chest X-ray: clear lungs, a normal heart size, no pneumothorax, a normal mediastinum.',
    // the physician's bedside scan: the right ventricle failing behind the clot, and the clot's source in the leg
    pocus: (s) => {
      if (!s.pulse) return 'Ultrasound during the 10-second pulse check: a huge right ventricle, the left one small and empty; no pericardial effusion. Compressions resume.';
      if (has(s, 'lysis-response')) return 'Repeat bedside ultrasound: the right ventricle is still large but squeezing better, and the left ventricle is filling again. No pericardial effusion.';
      return 'Bedside ultrasound: the right ventricle is bigger than the left and barely moving at its free wall while the apex still squeezes; the septum is pushed flat into the left ventricle (a "D" in the short axis); the left ventricle is small and hyperdynamic. No pericardial effusion. Both lungs slide, with A-lines. The IVC is 2.4 cm and does not narrow with breathing. The aortic root is not dilated. The left femoral vein does not compress: a clot in the leg.';
    },
    ct: 'Radiology: CT pulmonary angiography shows a saddle embolus across the main pulmonary artery, with clot into both lower lobes; the right ventricle is 1.8 times the size of the left, and the septum bows toward the left ventricle.',
    // what the PE response team says, when the ER doctor calls (consult-cardiology)
    consult: (s) => (has(s, 'lytic')
      ? 'Cardiology, for the PE response team: "Agree — a high-risk PE with shock, no contraindication: systemic lysis was the right call. We\'ll see her in the ICU. If her pressure has not come up in the next hour or two, or she bleeds, we\'ll take her for catheter-directed therapy, and ECMO is on standby."'
      : 'Cardiology, for the PE response team: "Persistent shock with a failing right ventricle and no contraindication: give the alteplase now — it is the fastest way to unload her right heart. Don\'t wait for us or for the cath lab. If she does not respond, or she bleeds, we\'ll take her for catheter-directed therapy, and ECMO is on standby."'),
    // what the profile draws: P pulmonale, an S in I, a Q and inverted T in III, an incomplete RBBB, T inversion V1–V4
    ecg12: (s) => `Sinus tachycardia ${s.rhythm.hr} with right heart strain: tall, peaked P waves in II, an S wave in I with a Q wave and an inverted T wave in III (S1Q3T3), an incomplete right bundle branch block and T waves inverted in V1–V4. No ST elevation that meets STEMI criteria. In a woman who fainted, breathless and hypotensive four days after a long flight, this is a large pulmonary embolism straining the right ventricle until proven otherwise. S1Q3T3 is classic but insensitive: a normal 12-lead would not have ruled it out.`,
  },
  status: statusText,
  respond: {
    // her own words while she can talk; in the arrest, on the ventilator or too drowsy, her husband's
    opqrst: (s) => history(s, OPQRST,
      'It came on all at once when she got up off the couch — she said she couldn\'t breathe, went gray and dropped. She\'d been complaining of a pain on the right side of her chest when she breathed in.', 'opqrst'),
    sample: (s) => history(s, SAMPLE,
      'No allergies. Only her estrogen tablets for hot flashes. We flew back from Manila four days ago, and her left calf has been sore since yesterday. No operations, no falls, no bleeding problems, never a stroke, no blood thinners — and I caught her when she fainted: she didn\'t hit her head.', 'sample'),
    // the clot leaves lung that is ventilated but not perfused: oxygen helps, but does not bring her to normal
    'o2-nrb': (s) => {
      if (!s.pulse) return null;
      const spo2 = Math.max(s.vitals.spo2, failing(s) || has(s, 'rosc') ? 88 : 91);
      return { say: [['monitor', `Non-rebreather at 15 L/min. SpO₂ ${spo2}%.`]], vitals: { spo2 }, flags: ['o2'] };
    },
    'o2-nc': (s) => {
      if (!s.pulse) return null;
      const spo2 = Math.max(s.vitals.spo2, 87);
      return {
        say: [['monitor', `Nasal cannula at 4 L/min. SpO₂ ${spo2}%.`], ...(spo2 < 90 ? [line(helper(s), 'Still under 90, and she is working hard to breathe. A non-rebreather would give her more.', 'warn')] : [])],
        vitals: { spo2 }, flags: ['o2'],
      };
    },
    // two large-bore lines: one for the drips, one for everything else
    iv: () => ({ say: [['you', 'Two large-bore IVs: an 18 G in each antecubital; blood drawn from the first.']], flags: ['iv'] }),
    // the nurse calls the physician: at once, with what she has found — then with each change
    'notify-physician': (s) => {
      if (!s.pulse) return { say: [['physician', 'I\'m here — keep compressing. I\'m running the code.']], flags: ['physician-notified'] };
      if (has(s, 'ooze') && !has(s, 'ooze-reported')) {
        return {
          say: [
            ['you', `SBAR: oozing through the dressing at the left-arm IV since the alteplase started; pressure on it. Neuro check unchanged, no headache; ${numbers(s)}.`],
            ['physician', 'Good call. Firm pressure and a fresh dressing: oozing at a line does not stop the alteplase. Tell me at once about a headache, any change in her neuro check, blood in her urine or vomit, or a falling pressure — those stop it.'],
          ],
          flags: ['physician-notified', 'ooze-reported'],
        };
      }
      if (!has(s, 'md-bedside')) {
        // only what she has found or been told
        const found = [
          ...(has(s, 'lungs') ? ['clear lungs'] : []),
          ...(has(s, 'perfusion') ? ['distended neck veins'] : []),
          ...(has(s, 'ems-report') || has(s, 'sample') ? ['a long flight four days ago and a sore calf'] : []),
        ];
        return {
          say: [['you', `SBAR: 52-year-old woman in bay 2, a faint at home and sudden breathlessness; ${numbers(s)}${found.length ? `; ${found.join(', ')}` : ''}. I need you at the bedside now.`], ['physician', 'Coming now.']],
          flags: ['physician-notified'],
        };
      }
      return { say: [['physician', 'Thanks — keep the checks coming, and call me with any change.']], flags: ['physician-notified'] };
    },
    // one small bolus is tolerated; after that every bit of volume goes into a right ventricle that is already overfilled,
    // pushes the septum into the left ventricle and empties it
    fluid: (s) => {
      if (!s.pulse) return null;
      // the ED physician said no boluses when he ordered the norepinephrine
      const against: Line[] = s.role === 6 && has(s, 'asked-rn-pressor')
        ? [['physician', 'I said no fluid for her — her right heart is already overfilled. Stop it, and tell me if you think she needs volume.', 'warn']]
        : [];
      if (count(s, 'fluid') === 0) {
        const bp = bpAfter(s, 4, 2);
        return {
          say: [...given(s, '500 mL saline bolus.', '500 mL of saline in.'), ['monitor', `BP ${bp.sbp}/${bp.dbp}.`], [helper(s), 'Hardly any change — and her neck veins look fuller.'], ...against],
          vitals: bp, flags: ['fluid'],
        };
      }
      const bp = bpAfter(s, -6, -4);
      const spo2 = Math.max(70, s.vitals.spo2 - 2);
      return {
        say: [
          ...given(s, 'Another 500 mL saline bolus.', `Another 500 mL in — ${(count(s, 'fluid') + 1) * 500} mL in all.`),
          ['monitor', `BP ${bp.sbp}/${bp.dbp}. SpO₂ ${spo2}%.`, 'bad'],
          [helper(s), 'Her neck veins are bulging up to her jaw, and she is getting grayer.', 'bad'],
          ...against,
        ],
        vitals: { ...bp, spo2 }, flags: ['fluid'],
      };
    },
    // norepinephrine: the pressure that perfuses the struggling right ventricle (titrated to a MAP of 65 or more)
    pressor: (s) => {
      if (!s.pulse) return null;
      if (has(s, 'pressor')) return { say: [['you', 'The norepinephrine is already running: titrated up to a MAP of 65 or more.']], flags: ['pressor'] };
      const target = failing(s) || has(s, 'rosc') ? { sbp: 92, dbp: 58 } : { sbp: 100, dbp: 62 };
      const bp = { sbp: Math.max(s.vitals.sbp, target.sbp), dbp: Math.max(s.vitals.dbp, target.dbp) };
      return {
        say: [
          ...given(s, 'Norepinephrine: start at 0.05 mcg/kg/min, titrate to a MAP of 65 or more.', `Norepinephrine running at 0.05 mcg/kg/min through ${has(s, 'central') ? 'the central line' : 'the right antecubital 18 G'}, on a pump; titrating to a MAP of 65 or more.`),
          ['monitor', `BP ${bp.sbp}/${bp.dbp}.`, 'good'],
          ...awake(s, '"I don\'t feel quite so faint."'),
        ],
        vitals: bp, flags: ['pressor'],
      };
    },
    'push-epi': (s) => {
      // 10–20 mcg is a dose for a low pressure with a pulse: in the arrest it is not the 1 mg the algorithm calls for
      if (!s.pulse) return { say: [['you', 'Push-dose epinephrine, 10–20 mcg — a dose for a low pressure with a pulse. In cardiac arrest the dose is 1 mg.', 'warn']], flags: ['push-epi-arrest'] };
      const bp = bpAfter(s, 14, 8);
      const hr = Math.min(150, s.rhythm.hr + 4);
      return {
        say: [...given(s, 'Push-dose epinephrine 10 mcg IV.', 'Push-dose epinephrine 10 mcg IV.'), ['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`], [helper(s), 'That buys a few minutes: an infusion keeps it there.']],
        vitals: bp, rhythm: atRate(s, hr), flags: ['push-epi'],
      };
    },
    // the VTE dose: 80 units/kg, then 18 units/kg/h — higher than the ACS dose on the action's label
    heparin: (s) => {
      const extra = has(s, 'alteplase-infusion') ? ' — with the alteplase running.' : '.';
      return {
        say: given(s,
          `Heparin, the dose for a clot in the lungs (not the ACS dose): 80 units/kg IV — ${units(80 * WEIGHT)} units — then 18 units/kg/h (${units(18 * WEIGHT)} units an hour)${extra}`,
          `Heparin ${units(80 * WEIGHT)} units IV push (80 units/kg), then the drip at ${units(18 * WEIGHT)} units an hour — dose checked with a second nurse${extra}`),
        flags: ['heparin'],
      };
    },
    alteplase: (s) => {
      if (has(s, 'lytic')) return { say: [['you', 'A second fibrinolytic dose.'], [helper(s), 'Wait — she already has a lytic in!', 'bad']], flags: ['second-lytic'] };
      return alteplase(s, 'learner');
    },
    // tenecteplase is used off-label for a pulmonary embolism in the US; alteplase is the approved regimen
    tnk: (s) => {
      if (has(s, 'lytic')) return { say: [['you', 'A second fibrinolytic dose.'], [helper(s), 'Wait — she already has a lytic in!', 'bad']], flags: ['second-lytic'] };
      return {
        say: [...given(s, 'Tenecteplase IV push, weight-based (off-label for a pulmonary embolism in the US: alteplase is the approved regimen).', s.pulse ? 'Tenecteplase pushed and flushed.' : 'Tenecteplase pushed and flushed; compressions go on.')],
        flags: ['lytic', 'tnk', ...(s.pulse ? ['lytic-watch'] : ['arrest-lytic'])],
      };
    },
    // a venodilator takes away the preload a pressure-overloaded right ventricle lives on (as in an RV infarct)
    nitro: (s) => nitroCrash(s, false),
    'nitro-high': (s) => nitroCrash(s, true),
    // positive pressure squeezes the venous return and loads the right ventricle further; her lungs are not wet
    cpap: (s) => {
      if (!s.pulse) return null;
      const bp = bpAfter(s, -12, -8);
      return {
        say: [
          ['you', 'CPAP mask on at 5 cmH₂O.'],
          ...awake(s, '"It\'s pushing against me — I can\'t — take it off!"'),
          ['monitor', `BP ${bp.sbp}/${bp.dbp}. SpO₂ ${s.vitals.spo2}%.`, 'bad'],
          [helper(s), 'Her pressure dropped as soon as it went on, and her saturation did not move. Taking it off — back on the non-rebreather.', 'bad'],
        ],
        vitals: bp, flags: ['cpap'],
      };
    },
    // drugs to take the airway: induction and positive pressure collapse a failing right ventricle
    rsi: (s) => {
      if (!s.pulse) return null;
      const flags = ['airway', 'ventilated', 'sedation', 'rsi'];
      if (!supported(s) && !has(s, 'lytic')) {
        const down = arrest(s, 'As the ventilator starts her pressure falls to the 50s — and now there is no pulse!', true);
        return { ...down, say: [['you', 'Preoxygenated; induction drug and paralytic pushed; tube through the cords on the first pass; on the ventilator.'], ...(down.say ?? [])], flags: [...flags, ...(down.flags ?? [])] };
      }
      const sbp = Math.min(s.vitals.sbp, 64);
      const dbp = Math.min(s.vitals.dbp, 38);
      return {
        say: [
          ['you', 'Preoxygenated; a reduced dose of induction drug and the paralytic; tube through the cords on the first pass; on the ventilator.'],
          ['monitor', `BP ${sbp}/${dbp}.`, 'bad'],
          [helper(s), 'Her pressure crashed as soon as the ventilator started — she is mottled.', 'bad'],
        ],
        vitals: { sbp, dbp, gcs: 3, rr: 16, spo2: Math.max(s.vitals.spo2, 90) }, flags: [...flags, 'rv-failing', 'rv-provoked'],
      };
    },
    // the scanner is no place for a patient in shock: with nothing holding her pressure up, she arrests on the table
    'ct-urgent': (s) => {
      if (!s.pulse || s.vitals.sbp >= 90) return null;
      if (!supported(s)) {
        const down = arrest(s, 'In the scanner, as the contrast goes in, she stops responding — not breathing normally! We\'re wheeling her back.', true);
        return { ...down, say: [['hospital', 'Radiology: a saddle embolus across the main pulmonary artery — the scan finished just as she went off.'], ...(down.say ?? [])], flags: ['ct', ...(down.flags ?? [])] };
      }
      return {
        say: [['team', 'Scanned and back: her pressure sagged on the table and the norepinephrine had to go up.', 'warn'], ['hospital', 'Radiology: a saddle embolus across the main pulmonary artery, with clot into both lower lobes; the right ventricle is 1.8 times the left.']],
        flags: ['ct', 'rv-failing', 'rv-provoked'],
      };
    },
    // the right ventricle is already full (distended neck veins): raising the legs adds nothing, and lying flat she cannot breathe
    'legs-up': (s) => {
      if (!s.pulse) return null;
      return { say: [['you', 'Laid flat with her legs raised.'], ...awake(s, '"I can\'t breathe lying down!"'), [helper(s), 'Her pressure has not moved, and her neck veins are fuller. Sitting her back up.']], flags: ['legs-up'] };
    },
    metoprolol: (s) => slower(s, 'Metoprolol 5 mg IV', 12, 'beta-blocker'),
    diltiazem: (s) => slower(s, 'Diltiazem IV', 10, 'diltiazem'),
    'amio-infusion': (s) => slower(s, 'Amiodarone 150 mg over 10 minutes', 0, 'amiodarone'),
    procainamide: (s) => slower(s, 'Procainamide at 30 mg/min', 0, 'procainamide'),
    // bearing down cuts the venous return of a heart that depends on it; the fast rate is not a circuit to break
    vagal: (s) => {
      if (!s.pulse || s.vitals.gcs < 13) return { blocked: true, say: [['system', 'A vagal maneuver needs an awake patient who can bear down.']] };
      const bp = bpAfter(s, -6, -4);
      return { say: [['you', 'Modified Valsalva: she bears down.'], [helper(s), 'She went gray for a moment — and the rate did not change.', 'bad'], ['monitor', `Heart rate ${s.rhythm.hr}. BP ${bp.sbp}/${bp.dbp}.`]], vitals: bp, flags: ['vagal'] };
    },
    midazolam: (s) => sedative(s, 'Midazolam 1 mg IV', ['benzodiazepine', 'sedation']),
    // deep sedation takes away the adrenaline holding her pressure up, and her breathing with it
    'procedural-sedation': (s) => {
      if (!s.pulse) return null;
      const bp = bpAfter(s, -16, -10);
      return {
        say: [['you', 'Etomidate 0.15 mg/kg IV.'], [helper(s), 'She is barely rousable, breathing slow and shallow — and gray.', 'bad'], ['monitor', `BP ${bp.sbp}/${bp.dbp}. SpO₂ ${Math.max(70, s.vitals.spo2 - 5)}%.`, 'bad']],
        vitals: { ...bp, gcs: Math.min(s.vitals.gcs, 9), rr: Math.max(12, s.vitals.rr - 12), spo2: Math.max(70, s.vitals.spo2 - 5) }, flags: ['sedation', 'procedural-sedation'],
      };
    },
    // pleuritic pain: a small dose of fentanyl is fair once the pressure is held up; it blunts the drive that holds it
    fentanyl: (s) => {
      if (!s.pulse) return null;
      const bp = bpAfter(s, -4, -2);
      const pain = Math.max(0, s.vitals.pain - 3);
      return { say: [...given(s, 'Fentanyl 25 mcg IV.', 'Fentanyl 25 mcg IV.'), ...awake(s, '"That takes the edge off the pain when I breathe."'), ['monitor', `BP ${bp.sbp}/${bp.dbp}.`]], vitals: { ...bp, pain }, flags: ['analgesia'] };
    },
    // the arrest: compressions and epinephrine carry the lytic to the clot; with it dissolving, she comes back
    cpr: (s) => {
      if (s.pulse) return null;
      const cycles = cyclesSince(s, 'arrest') + 1;
      const onLytic = has(s, 'lytic') ? cyclesSince(s, 'lytic') + 1 : 0;
      const epi = s.flags.epi !== undefined && s.flags.epi >= s.flags.arrest;
      if (cycles >= 3 && onLytic >= 2 && epi) return rosc(s);
      return null;
    },
    // there is no fluid around her heart: the needle comes back dry (the built-in rule scores it). With a pulse and no scan
    // yet, the engine's own block stands: the needle goes in under ultrasound
    pericardiocentesis: (s) => {
      if (s.pulse && !has(s, 'pocus')) return null;
      return {
        say: [['you', s.pulse
          ? 'Needle in below the xiphoid under ultrasound: no fluid comes back — a dry tap. Needle out; there is no effusion to drain.'
          : 'Subxiphoid needle during the compressions: no fluid comes back — a dry tap. Needle out.', 'bad']],
        flags: ['pericardiocentesis'],
      };
    },
    // the Hs and Ts against what the team knows about her: the facts, and a conclusion only once a scan has shown the heart
    'hs-ts': (s) => ({
      say: [['you', `Hs and Ts against what you know. Hypoxia: SpO₂ ${s.pulse ? `${s.vitals.spo2}%` : 'unreadable'}${has(s, 'o2') ? ' on oxygen' : ''} — a result of the cause more than the cause. Hypovolemia: no bleeding, no vomiting, and her neck veins are full, not flat. Hydrogen ion and potassium: nothing in her history${has(s, 'labs') ? '; the lactate is high from the shock' : ''}. Hypothermia: she is warm. Tension pneumothorax: equal breath sounds, the trachea midline${has(s, 'pocus') ? ', both lungs sliding' : ''}. Tamponade: ${has(s, 'pocus') ? 'no effusion on the ultrasound' : 'no trauma, no recent heart procedure'}. Toxins: only estrogen tablets. Thrombosis, coronary or pulmonary: a long flight four days ago, estrogen, a swollen calf, a faint, full neck veins with clear lungs${has(s, 'pocus') ? ', and a huge right ventricle on the scan — a clot in the lungs is the likeliest cause' : ''}.`]],
      flags: ['hs-ts'],
    }),
    // the ICU takes her once the bed is ready; until then she stays in the department on the monitor
    admit: (s) => {
      if (!s.pulse) return null;
      return {
        say: [['hospital', 'ICU accepts her: the intensivist and the PE response team will see her there. The bed will be ready in about 10 minutes — until then she stays with you on the monitor.']],
        flags: ['dispo', 'admit'],
      };
    },
    reassess: (s) => {
      if (!s.pulse) return null;
      // during the lytic: the 15-minute neuro and bleeding check (the nurse's, in the doctor's run)
      const check = `Neuro check unchanged: alert, pupils equal, no drift, no headache. ${has(s, 'ooze') ? 'The left-arm IV site is oozing under the dressing' : 'IV sites dry'}; no blood in the urine or at the gums.`;
      const checks: Line[] = has(s, 'lytic-watch') && !has(s, 'rsi') ? [[s.role === 7 ? 'nurse' : 'you', check]] : [];
      return { say: [['you', numbers(s)], ...checks, ['patient', statusText(s)]] };
    },
    // she leaves for the ICU only once the bed and the team are ready
    handoff: (s) => {
      if (!s.pulse || !has(s, 'admit') || has(s, 'icu-ready')) return null;
      return { blocked: true, say: [['system', 'The ICU bed is not ready yet: stay with her on the monitor and keep reassessing; the ICU team will come for her.']] };
    },
  },
  events: [
    // ── the ER doctor's run: the computer nurse does the nursing ──
    {
      id: 'rn-setup',
      when: (s) => s.role === 7 && s.pulse && s.minute >= 1,
      effect: (s) => {
        const done: string[] = [];
        if (!has(s, 'monitor')) done.push('monitor on');
        if (!has(s, 'o2')) done.push('non-rebreather at 15 liters');
        if (!has(s, 'iv')) done.push('two 18-gauge IVs, one in each arm');
        if (!has(s, 'labs')) done.push('labs drawn: CBC, chemistries, coags, type and screen, troponin, BNP and a lactate');
        const spo2 = Math.max(s.vitals.spo2, 91);
        return {
          say: [['nurse', done.length ? `${done.join('; ').replace(/^./, (c) => c.toUpperCase())}.` : 'Everything is on and drawn.'], ['monitor', `SpO₂ ${spo2}%.`]],
          vitals: { spo2 }, flags: ['monitor', 'o2', 'iv', 'labs'],
        };
      },
    },
    {
      // the computer nurse's 12-lead: the doctor reads it (the engine asks for the read)
      id: 'rn-ecg',
      when: (s) => s.role === 7 && s.pulse && s.minute >= 3 && !has(s, 'ecg12'),
      effect: () => ({ say: [['nurse', '12-lead done — it is on the screen.']], flags: ['ecg12', 'monitor'] }),
    },

    // ── the ER nurse's run: the computer ED physician examines, decides and orders ──
    {
      id: 'md-bedside',
      // her call (SBAR), or a call for help that brings him into the room with the charge nurse
      when: (s) => s.role === 6 && s.pulse && !has(s, 'arrest') && (has(s, 'physician-notified') || has(s, 'help') || s.minute >= MD_COMES_BY),
      effect: (s) => ({
        say: [has(s, 'lytic') && !has(s, orderedFlag('alteplase'))
          // fetched because a lytic went in that nobody ordered
          ? line('physician', 'Alteplase is already running? A fibrinolytic is my decision — after I have examined her and gone through the bleeding risks with her. It cannot be taken back now: we watch her closely. I\'m going to scan her heart.', 'bad')
          : has(s, 'physician-notified') || has(s, 'help')
          ? line('physician', 'Here. Keep going with what you\'re doing — I\'m going to scan her heart.')
          : line('physician', 'The charge nurse sent me: she is gray and her pressure is in the 80s. Next time call me the moment a patient like this rolls in. I\'m going to scan her heart.', 'warn')],
        flags: ['md-bedside'],
      }),
    },
    {
      id: 'md-scan',
      // his scan result names what she has: it waits while her first 12-lead is still to be read
      when: (s) => s.role === 6 && s.pulse && !has(s, 'arrest') && has(s, 'md-bedside') && s.minute >= s.flags['md-bedside'] + SCAN_MINUTES && !readComing(s),
      effect: () => ({
        say: [['physician', 'Bedside ultrasound: her right ventricle is bigger than the left and barely moving, the septum pushed flat into a small, hyperdynamic left ventricle. No fluid around the heart, both lungs slide, the aortic root is normal, and the IVC is wide and does not move with breathing. Her left femoral vein will not compress — there is clot in it. With the faint, the low pressure and the oxygen, this is a big pulmonary embolism with shock, and her right heart is failing.']],
        flags: ['md-scan', 'pocus'],
      }),
    },
    ...RN_ASKS.flatMap(askEvents),
    {
      // the physician runs the code; the ER nurse compresses and gives the ACLS drugs
      id: 'md-arrest',
      when: (s) => s.role === 6 && !s.pulse && (cyclesSince(s, 'arrest') > 0 || s.minute >= s.flags.arrest + 1),
      effect: (s) => ({
        say: [['physician', cyclesSince(s, 'arrest') > 0
          ? 'Good compressions. Epinephrine 1 mg now, and every 3 to 5 minutes. Pads on, and we look at the rhythm at each pulse check.'
          : 'She has no pulse — start compressions! Epinephrine 1 mg as soon as you can, and pads on.', cyclesSince(s, 'arrest') > 0 ? 'info' : 'warn']],
        flags: ['md-arrest', 'physician-notified'],
      }),
    },
    {
      id: 'arrest-epi-fallback',
      when: (s) => s.role === 6 && !s.pulse && s.minute >= s.flags.arrest + 5 && !(s.flags.epi !== undefined && s.flags.epi >= s.flags.arrest),
      effect: () => ({ say: [['team', 'Another nurse pushes epinephrine 1 mg IV and flushes it.', 'warn']], flags: ['epi'] }),
    },
    {
      id: 'md-post-rosc',
      when: (s) => s.role === 6 && s.pulse && has(s, 'rosc') && !has(s, 'pressor'),
      effect: () => physicianOrder('She\'s back. Norepinephrine now, titrated to a MAP of 65 or more — her right heart still needs the pressure.', ['pressor']),
    },
    {
      // the computer physician decides where she goes once the lytic is in
      id: 'md-dispo',
      // (he has scanned her, or run her arrest), in words that say what is running
      when: (s) => s.role === 6 && s.pulse && has(s, 'lytic') && (has(s, 'md-scan') || has(s, 'md-arrest')) && s.minute >= Math.max(s.flags.lytic, s.flags.rosc ?? 0) + DISPO_AFTER,
      effect: (s) => {
        const drips = [...(has(s, 'alteplase-infusion') ? ['the alteplase'] : []), ...(has(s, 'pressor') ? ['the norepinephrine'] : [])];
        return physicianDispo(s, 'admit', `I've talked to the PE response team and the ICU: she goes up${drips.length ? ` on ${drips.join(' and ')}` : ''}. The bed will be ready in about 10 minutes — stay with her until then.`);
      },
    },
    {
      // a little bleeding at an old puncture: expected with a lytic, reported, and no reason to stop it
      id: 'ooze',
      when: (s) => s.pulse && has(s, 'lytic-watch') && s.minute >= s.flags['lytic-watch'] + OOZE_AFTER,
      effect: (s) => ({
        say: [s.role === 6
          ? ['team', 'The tech: "Her left-arm IV is oozing — there\'s blood through the dressing."', 'warn']
          : ['nurse', 'Her left-arm IV is oozing through the dressing — I\'m holding pressure and changing it. Neuro check unchanged, no headache.', 'warn']],
        flags: ['ooze'],
      }),
    },

    // ── both runs: the patient ──
    {
      // too much fluid, nitroglycerin, or too long without the lytic: the right ventricle starts to give out
      id: 'rv-fails',
      when: (s) => s.pulse && !has(s, 'arrest') && !has(s, 'lytic') && !failing(s) && (
        count(s, 'fluid') >= 2
        || has(s, 'nitro')
        || (!supported(s) && s.minute >= FAILS_UNSUPPORTED)
        || s.minute >= FAILS_SUPPORTED),
      effect: (s) => {
        // worse, never better: a pressure already lower stays where it is
        const target = supported(s) ? { sbp: 86, dbp: 52 } : { sbp: 72, dbp: 44 };
        const sbp = Math.min(s.vitals.sbp, target.sbp);
        const dbp = Math.min(s.vitals.dbp, target.dbp);
        const hr = Math.min(150, Math.max(s.rhythm.hr, 138));
        const spo2 = Math.max(70, s.vitals.spo2 - 4);
        return {
          say: [
            ...awake(s, '"I\'m going to pass out… I can\'t get any air…"'),
            [helper(s), 'She is going gray and mottled, and her neck veins are bulging.', 'bad'],
            ['monitor', `Monitor alarm: heart rate ${hr}, SpO₂ ${spo2}%, BP ${sbp}/${dbp}.`, 'bad'],
          ],
          vitals: { sbp, dbp, spo2, gcs: Math.min(s.vitals.gcs, 13), rr: Math.max(s.vitals.rr, 34) }, rhythm: atRate(s, hr),
          flags: ['rv-failing', ...(count(s, 'fluid') >= 2 || has(s, 'nitro') ? ['rv-provoked'] : [])],
        };
      },
    },
    {
      // the failing right ventricle stops: a third bolus, or time without the lytic
      id: 'arrest',
      when: (s) => s.pulse && !has(s, 'arrest') && failing(s) && (
        count(s, 'fluid') >= 3
        || (!has(s, 'lytic') && s.minute >= s.flags['rv-failing'] + (supported(s) ? ARREST_SUPPORTED : ARREST_UNSUPPORTED))),
      effect: (s) => arrest(s, has(s, 'rsi') ? 'The ventilator is alarming, she is mottled — I can\'t feel a pulse!' : 'She\'s gone limp — not responding, not breathing normally!',
        count(s, 'fluid') >= 3 || has(s, 'rv-provoked')),
    },
    {
      // the clot breaks up enough to unload the right ventricle: the pressure, the oxygen and the rate come back toward normal
      id: 'lysis-response',
      when: (s) => s.pulse && has(s, 'lytic') && s.minute >= Math.max(s.flags.lytic, s.flags.rosc ?? 0) + LYSIS_MINUTES,
      effect: (s) => {
        const bp = has(s, 'pressor') ? { sbp: 112, dbp: 70 } : { sbp: 102, dbp: 64 };
        const gcs = has(s, 'rsi') ? 3 : has(s, 'rosc') ? 13 : 15;
        return {
          say: [['monitor', `Heart rate 104. BP ${bp.sbp}/${bp.dbp}. SpO₂ 95%.`, 'good'], ...(gcs >= 13 && !has(s, 'rsi') ? [line('patient', '"I can breathe a little easier."')] : [])],
          // with blood reaching the lungs again there is less dead space: the EtCO₂ comes up
          vitals: { ...bp, spo2: 95, rr: has(s, 'rsi') ? 16 : 22, gcs, pain: 2, etco2: 32 }, rhythm: atRate(s, 104),
          flags: ['lysis-response'], clear: ['rv-failing'],
        };
      },
    },
    {
      id: 'icu-ready',
      when: (s) => has(s, 'admit') && s.minute >= s.flags.admit + ICU_MINUTES,
      effect: () => ({ say: [['hospital', 'ICU: the bed is ready — the ICU nurse and the intensivist are coming down for her.']], flags: ['icu-ready'] }),
    },
  ],
  critical: [
    // ── the ER nurse ──
    { id: 'rn-triage', label: 'Triage: ESI 1', roles: ED_RN, points: 5, done: ['triage'], target: { by: 3 }, why: 'A low pressure and an SpO₂ under 90 after a faint: she needs a life-saving intervention now — ESI 1, the resuscitation bay, and the physician to the bedside.' },
    {
      id: 'rn-monitor-o2', label: 'Monitor on and high-flow oxygen (non-rebreather)', roles: ED_RN, points: 10, target: { by: 4 },
      why: 'A fast rate, a low pressure and an SpO₂ of 86 %: the monitor and pulse oximetry at once, and a non-rebreather at 15 L/min (aim for 90 % or more — a cannula does not get her there).',
      done: (s) => { const m = firstDone(s, ['monitor', 'pads']); const o = firstDone(s, ['o2-nrb']); return m === null || o === null ? null : Math.max(m, o); },
      uses: ['monitor', 'o2-nrb'],
    },
    // a call for help into the resuscitation bay brings him as surely as the SBAR call
    { id: 'rn-notify', label: 'Get the ED physician to the bedside now (SBAR)', roles: ED_RN, points: 10, done: ['notify-physician', 'call-help'], target: { by: 5 }, why: 'Shock after a faint is the physician\'s at once: call with the numbers and what you see (SBAR), or call for help into the room, and say you need them at the bedside now — do not wait to finish your own tasks.' },
    { id: 'rn-iv', label: 'Two large-bore IVs', roles: ED_RN, points: 10, done: ['iv', 'io'], target: { by: 8 }, why: 'A patient in shock needs two 18 G lines (or larger): one for the drips she may need, one for everything else — and every drug she needs goes in through them.' },
    { id: 'rn-labs', label: 'Labs: CBC, chemistries, coags, type and screen, troponin, BNP, lactate', roles: ED_RN, points: 5, done: ['labs'], target: { by: 10 }, why: 'The coags and a type and screen before any anticoagulant or procedure, a lactate for the shock, the troponin and BNP for the strain on the heart.' },
    { id: 'rn-ecg', label: '12-lead ECG within 10 minutes', roles: ED_RN, points: 10, done: ['ecg12'], target: { by: 10 }, why: 'A faint, breathlessness and a low pressure need a 12-lead: it looks for a STEMI or an arrhythmia as the cause, and for strain on the right heart.' },
    ...RN_ASKS.map(askCritical),
    {
      id: 'rn-lytic-checks', label: 'Before the alteplase: the bleeding checklist and a baseline neuro check', roles: ED_RN, points: 10,
      applies: (s) => has(s, 'asked-rn-alteplase'), target: { within: { flag: 'asked-rn-alteplase', minutes: 3 } },
      why: 'A fibrinolytic can bleed anywhere — in the head above all. Before it goes in, ask about bleeding, surgery or injury, a stroke or a bleed in the head, a head injury in the faint and blood thinners, and record a baseline neuro exam to compare every check against.',
      done: (s) => {
        const history = firstDone(s, ['sample']);
        const neuro = firstDone(s, ['neuro']);
        if (history === null || neuro === null) return null;
        const at = Math.max(history, neuro);
        const start = lyticStart(s);
        return start === null || at <= start ? at : null;
      },
      uses: ['sample', 'neuro'],
    },
    {
      id: 'rn-lytic-monitor', label: 'During the infusion: vital signs and a neuro check every 15 minutes', roles: ED_RN, points: 5,
      done: ['reassess', 'nibp', 'vitals'], after: 'alteplase-infusion', target: { within: { flag: 'alteplase-infusion', minutes: 15 } }, applies: (s) => has(s, 'alteplase-infusion'),
      why: 'While the alteplase runs: the pressure, the rhythm and the oxygen, a neuro check against the baseline, and a look for bleeding (IV sites, gums, urine) — every 15 minutes. A headache or a neuro change stops the infusion.',
    },
    {
      id: 'rn-report-ooze', label: 'Report the bleeding to the physician', roles: ED_RN, points: 5,
      done: ['notify-physician'], after: 'ooze', target: { within: { flag: 'ooze', minutes: 3 } }, applies: (s) => has(s, 'ooze'),
      why: 'Any bleeding during a lytic is reported (SBAR): pressure on an oozing site, and the physician decides — minor oozing at a line does not stop the alteplase; a headache, a neuro change or bleeding inside the body does.',
    },

    // ── the ER doctor ──
    {
      id: 'md-pocus', label: 'Point-of-care ultrasound for the cause of the shock', roles: ED_MD, points: 15, done: ['pocus'], target: { by: 8 },
      why: 'Shock after a faint: the bedside scan tells the causes apart in minutes — how each ventricle looks and squeezes, an effusion, a lung that does not slide, the IVC, the aortic root, a leg vein that will not compress. In a patient too unstable to travel, a clear answer on it, with a story that fits, is enough to treat without waiting for CT.',
    },
    {
      id: 'md-heparin', label: 'Heparin at once (80 units/kg, then 18 units/kg/h)', roles: ED_MD, points: 10, target: { by: 12 }, uses: ['heparin'],
      why: 'Anticoagulation starts as soon as a pulmonary embolism is likely, before the imaging and the decisions: it stops the clot from growing while the lytic dissolves it. Unfractionated heparin when a lytic or a procedure may follow (short-acting, reversible); the drip is paused while the alteplase runs.',
      // after a lytic pushed in the arrest, the heparin that follows it counts (late by then, rarely missed)
      done: (s) => { const h = firstDone(s, ['heparin']); const l = lyticStart(s); return h !== null && (l === null || h <= l || lyticInArrest(s)) ? h : null; },
    },
    {
      id: 'md-pressor', label: 'Norepinephrine for the low pressure (MAP 65 or more)', roles: ED_MD, points: 15, done: ['pressor'], target: { by: 12 },
      why: 'A failing right ventricle lives on the aortic pressure that perfuses it: norepinephrine is the first vasopressor, titrated to a MAP of 65 or more — not liters of fluid into a ventricle that is already overfilled.',
    },
    {
      id: 'md-check', label: 'Screen for contraindications before the lytic', roles: ED_MD, points: 10, uses: ['sample'],
      // in an arrest the lytic is pushed without a history: the screen is for the infusion given with a pulse
      applies: (s) => !lyticInArrest(s),
      why: 'Before any fibrinolytic: a bleed in the head ever, a stroke within 3 months, a brain tumor or vascular malformation, active bleeding, recent surgery or trauma (a head injury in the faint), a possible aortic dissection, blood thinners. She has none — and her husband caught her when she fainted.',
      done: (s) => { const h = firstDone(s, ['sample']); const l = lyticStart(s); return h !== null && (l === null || h <= l) ? h : null; },
    },
    {
      id: 'md-lytic', label: 'Systemic thrombolysis (alteplase 100 mg over 2 hours, or tenecteplase)', roles: ED_MD, points: 20, target: { by: LYTIC_BY }, uses: ['alteplase', 'tnk'],
      // given with a pulse (a push in the arrest is 'md-arrest-lytic', not this); an early arrest a wrong step brought on
      // before the lytic was due leaves only the arrest's item — the wrong step is scored as its own harm
      done: (s) => (lyticInArrest(s) ? null : firstDone(s, ['alteplase', 'tnk'])),
      applies: (s) => !provokedEarly(s),
      why: 'A pulmonary embolism with persistent shock (2026 AHA/ACC Clinical Category E1) and no contraindication: systemic thrombolysis is reasonable (class 2a) and the fastest way to unload the right ventricle — alteplase 100 mg over 2 hours, the approved regimen. Catheter-directed therapy or surgery are for a patient who cannot have it or does not respond.',
    },
    {
      id: 'md-pert', label: 'Call the PE response team (cardiology)', roles: ED_MD, points: 5, done: ['consult-cardiology'], target: { by: 20 },
      why: 'The 2026 AHA/ACC guideline recommends the PE response team for Clinical Categories C to E: they plan the rescue if the lytic fails or she bleeds — catheter-directed therapy, surgery or ECMO.',
    },
    { id: 'md-admit', label: 'Admit her to the ICU', roles: ED_MD, points: 5, done: ['admit'], why: 'Two drips, a lytic running and a right ventricle that can still fail: the ICU, with the PE response team following her.' },

    // ── the arrest, if delay or a wrong step brings it ──
    {
      id: 'arrest-cpr', label: 'She arrests: high-quality CPR at once', roles: ED_TEAM, points: 10, done: ['cpr'], after: 'arrest', target: { within: { flag: 'arrest', minutes: 1 } }, applies: (s) => has(s, 'arrest'),
      why: 'Unresponsive and not breathing normally: compressions at once, 100–120 a minute, 5–6 cm deep, full recoil, as few pauses as possible.',
    },
    {
      id: 'arrest-epi', label: 'Epinephrine 1 mg IV as soon as possible', roles: ED_TEAM, points: 10, target: { within: { flag: 'arrest', minutes: 5 } }, applies: (s) => has(s, 'arrest'), uses: ['epinephrine'],
      why: 'A non-shockable arrest: epinephrine 1 mg as soon as possible, then every 3–5 minutes (the ACLS protocol: the ER nurse needs no separate order).',
      done: (s) => (s.flags.arrest === undefined ? null : s.performed.find((p) => p.id === 'epinephrine' && p.minute >= s.flags.arrest && p.minute < (s.flags.rosc ?? Infinity))?.minute ?? null),
    },
    {
      id: 'md-arrest-lytic', label: 'A lytic in the arrest (the clot is the cause)', roles: ED_MD, points: 15, target: { within: { flag: 'arrest', minutes: 6 } },
      applies: (s) => has(s, 'arrest') && !(s.flags.lytic !== undefined && s.flags.lytic <= s.flags.arrest), uses: ['alteplase', 'tnk'],
      why: 'A cardiac arrest from a suspected pulmonary embolism: systemic thrombolysis may be considered (2025 AHA) — commonly alteplase 50 mg IV push — and ECMO-supported CPR is reasonable where it is available. Keep the compressions going: the drug needs blood flow to reach the clot.',
      done: (s) => (s.flags.arrest === undefined ? null : firstDone(s, ['alteplase', 'tnk'], 'arrest')),
    },
    {
      id: 'post-rosc-pressor', label: 'After ROSC: norepinephrine to a MAP of 65 or more', roles: ED_TEAM, points: 10, applies: (s) => has(s, 'rosc'), uses: ['pressor'],
      why: 'The clot is still there, and her pressure after ROSC barely perfuses the right ventricle: a vasopressor, not fluid.',
      // an infusion running from before the arrest goes on after it
      done: (s) => (s.flags.rosc === undefined ? null : has(s, 'pressor') && s.flags.pressor <= s.flags.rosc ? s.flags.rosc : firstDone(s, ['pressor'], 'rosc')),
    },
    { id: 'handoff', label: 'Hand-off to the ICU team', roles: ED_TEAM, points: 5, done: ['handoff'], why: 'The faint and the story, the scan, the 12-lead, every drug and when — the heparin, the norepinephrine, the alteplase and when it ends (then the heparin restarts) — the bleeding seen, and the rescue plan if she worsens.' },
  ],
  harms: yieldToHeavier([
    {
      // before anyone has looked at her IVC one small bolus is a fair try; after the doctor's own scan shows it full, it is not
      id: 'fluid-full-ivc', actions: ['fluid'], roles: ED_MD, when: (s) => s.pulse && count(s, 'fluid') === 0 && has(s, 'pocus'), points: 3, severity: 'minor',
      text: 'A fluid bolus after your own scan showed a wide IVC that does not narrow with breathing. Her right heart is already full: volume only stretches it further and pushes the septum into the left ventricle. A small bolus (500 mL or less) is for a low central venous pressure; hers is high — support the pressure with norepinephrine.',
    },
    {
      // the ED physician said no boluses when he ordered the norepinephrine
      id: 'fluid-against-order', actions: ['fluid'], roles: ED_RN, when: (s) => s.pulse && count(s, 'fluid') === 0 && has(s, 'asked-rn-pressor'), points: 5, severity: 'major',
      text: 'A fluid bolus after the physician said no boluses for her. Her neck veins and wide IVC say her right heart is already overfilled, and he had ordered norepinephrine instead. If you think she needs volume, say so (SBAR) — do not give what the plan rules out.',
    },
    {
      // one small bolus is tolerated; a second is beyond the 500 mL that cautious volume loading allows
      id: 'fluid-loading-pe', actions: ['fluid'], roles: ED_TEAM, when: (s) => s.pulse && count(s, 'fluid') >= 1, points: 10, severity: 'major',
      text: 'More than 500 mL of fluid for a failing right ventricle. Distended neck veins, a wide IVC and clear lungs say her right heart is already overfilled: more volume stretches it further, pushes the septum into the left ventricle and empties it, and the pressure falls. At most one small bolus, and only with a low central venous pressure; support the pressure with norepinephrine.',
    },
    {
      id: 'nitro-pe', actions: ['nitro', 'nitro-high'], roles: ED_TEAM, when: (s) => s.pulse, points: 15, severity: 'critical',
      replaces: [...NITRATE_RULES, ...noOrder(['nitro-high'])],
      text: 'Nitroglycerin for a patient in obstructive shock. Her chest pain is pleuritic, not ischemic — the chest pain standing order does not cover it — and a pressure-overloaded right ventricle lives on its preload: a venodilator takes it away and the pressure crashes, as it does in an RV infarct. No nitrates.',
    },
    {
      id: 'intubation-pe', actions: ['rsi'], roles: ED_MD, when: (s) => s.pulse && !has(s, 'arrest'), points: 15, severity: 'critical', replaces: ['rsi-unresuscitated', 'rsi-preload-dependent'],
      text: 'Intubating a patient whose right ventricle is failing. The induction drug drops the pressure, and positive-pressure ventilation cuts the venous return and raises the pressure the right ventricle pumps against: it collapses, and the patient arrests around the tube. The 2026 AHA/ACC PE guideline says deep sedation and mechanical ventilation should not be performed unless clinically indicated (3: Harm); oxygen by mask holds her. If a tube cannot be avoided: the vasopressor running first, a reduced dose of a stable induction drug, small breaths with little PEEP, and the ECMO team ready.',
    },
    {
      // after an arrest the tube may be needed: the built-in rule's words, for a low pressure with nothing holding it up
      id: 'rsi-unresuscitated-rosc', actions: ['rsi'], roles: ED_MD, when: (s) => s.pulse && has(s, 'arrest') && s.vitals.sbp < 90 && !has(s, 'pressor') && !has(s, 'push-epi'), points: 8, severity: 'major',
      text: 'Rapid sequence intubation with a low blood pressure and nothing to hold it up. The induction drug and positive-pressure ventilation drop the pressure further, and the patient can arrest around the tube: resuscitate before you intubate — push-dose epinephrine or an infusion running — and give a reduced dose of the most stable induction drug.',
    },
    {
      id: 'ct-in-shock-pe', actions: ['ct-urgent'], roles: ED_MD, when: (s) => s.pulse && s.vitals.sbp < 90, points: 10, severity: 'major', replaces: ['ct-unstable'],
      text: 'Sending her to the CT scanner in shock. With a systolic under 90 she can arrest on the table, far from the resuscitation bay — and a bedside ultrasound showing a failing right ventricle, in a patient this likely to have a pulmonary embolism, is enough to treat it. Hold the pressure up first; scan only once she is stable enough to travel, and never let the scan delay the lytic.',
    },
    {
      // a systolic under 90 is where most CPAP protocols stop; above it the mask is still not what she needs
      id: 'cpap-pe', actions: ['cpap'], roles: ED_TEAM, when: (s) => s.pulse && s.vitals.sbp < 90, replaces: ['cpap-hypotension', 'cpap-preload-dependent', 'cpap-vomiting', 'cpap-drowsy', 'cpap-no-indication'], points: 8, severity: 'major',
      text: 'CPAP with clear lungs and a low pressure. Positive pressure cuts the blood returning to the heart and raises the resistance the right ventricle pumps against: her pressure falls, and her saturation does not improve, because her lungs are not wet — the clot is the problem. A non-rebreather (high-flow nasal oxygen if that is not enough), and let her breathe on her own.',
    },
    {
      id: 'cpap-pe-held', actions: ['cpap'], roles: ED_TEAM, when: (s) => s.pulse && s.vitals.sbp >= 90, replaces: ['cpap-preload-dependent', 'cpap-hypotension', 'cpap-vomiting', 'cpap-drowsy', 'cpap-no-indication'], points: 3, severity: 'minor',
      text: 'CPAP for a patient whose saturation a non-rebreather already holds at 90 % or more. Her lungs are clear: positive pressure does nothing for a clot, and it cuts the blood returning to a right ventricle that lives on it — her pressure falls. If she needs more oxygen, high-flow nasal oxygen first.',
    },
    {
      // the fast rate is her compensation, not an arrhythmia; it stands in for the low-pressure procainamide rule
      id: 'rate-control-pe', actions: ['metoprolol', 'diltiazem', 'amio-infusion', 'procainamide'], roles: ED_MD, when: (s) => s.pulse, points: 10, severity: 'major',
      replaces: ['procainamide-hypotension', ...RATE_RULES],
      text: 'A drug to slow or convert her rhythm. Her sinus tachycardia is how a failing right ventricle keeps any output at all: beta-blockers, diltiazem, amiodarone and procainamide weaken the squeeze, drop the pressure and can bring on the arrest.',
    },
    {
      // the nurse's version also stands for the missing order (and, like the doctor's, for the low-pressure procainamide rule)
      id: 'rate-control-pe-rn', actions: ['metoprolol', 'diltiazem', 'amio-infusion', 'procainamide'], roles: ED_RN, when: (s) => s.pulse, points: 10, severity: 'major',
      replaces: [...noOrder(['metoprolol', 'diltiazem', 'amio-infusion', 'procainamide']), 'procainamide-hypotension', ...RATE_RULES],
      text: 'A drug to slow or convert her rhythm, with no order. Her sinus tachycardia is how a failing right ventricle keeps any output at all: beta-blockers, diltiazem, amiodarone and procainamide weaken the squeeze, drop the pressure and can bring on the arrest — and none of them is on a standing order. Tell the physician what you see instead.',
    },
    {
      // the doctor's, and the nurse's vagal maneuver (it needs no order); her drugs are the rule below
      id: 'no-arrhythmia-pe', actions: ['adenosine6', 'adenosine12', 'lidocaine', 'vagal'], roles: ED_TEAM,
      when: (s, _sc, id) => s.pulse && (s.role !== 6 || id === 'vagal'), points: 3, severity: 'minor',
      replaces: [...LIDOCAINE_RULES, ...RATE_RULES, 'vagal-slow'],
      text: 'A vagal maneuver, adenosine or lidocaine for a fast rate that is not an arrhythmia. Hers is sinus tachycardia, the body\'s answer to a low pressure and low oxygen: nothing to break, and bearing down or a pause cuts the output she has left.',
    },
    {
      // the nurse's version also stands for the missing order, at the order's weight, and says so
      id: 'no-arrhythmia-pe-rn', actions: ['adenosine6', 'adenosine12', 'lidocaine'], roles: ED_RN, when: (s) => s.pulse, points: 5, severity: 'major',
      replaces: [...noOrder(['adenosine6', 'adenosine12', 'lidocaine']), ...LIDOCAINE_RULES, ...RATE_RULES],
      text: 'Adenosine or lidocaine with no order, for a fast rate that is not an arrhythmia. Hers is sinus tachycardia, the body\'s answer to a low pressure and low oxygen: nothing to break — and with a pulse neither drug is on a standing order. Tell the physician what you see instead.',
    },
    {
      id: 'sedation-pe', actions: ['midazolam', 'procedural-sedation'], roles: ED_MD, when: (s) => s.pulse, points: 5, severity: 'major', replaces: [...SEDATIVE_RULES, 'sedation-no-procedure'],
      text: 'Sedation for a patient in obstructive shock. Her fear and fast breathing come from the shock and the low oxygen: a sedative takes away the adrenaline that is holding her pressure up and slows her breathing (2026 AHA/ACC: no deep sedation unless clinically indicated — 3: Harm). Oxygen, a vasopressor and calm reassurance.',
    },
    {
      id: 'sedation-pe-rn', actions: ['midazolam'], roles: ED_RN, points: 5, severity: 'major', replaces: [...SEDATIVE_RULES, ...noOrder(['midazolam'])],
      text: 'Midazolam with no order, for a patient in obstructive shock. Her fear and fast breathing come from the shock and the low oxygen: a sedative takes away the adrenaline that is holding her pressure up and slows her breathing. Oxygen, reassurance — and the physician, if you think she needs more.',
    },
    {
      id: 'opioid-hypotension', actions: ['fentanyl'], roles: ED_MD, when: (s) => s.pulse && s.vitals.sbp < 90, points: 3, severity: 'minor',
      text: 'Fentanyl with a systolic under 90. An opioid blunts the drive that is holding her pressure up: support the pressure first, then a small dose for the pleuritic pain if she needs it.',
    },
    {
      // once the cause is known, aspirin treats nothing she has and adds bleeding to the lytic
      id: 'aspirin-pe', actions: ['aspirin'], roles: ED_TEAM, when: (s) => has(s, 'pocus') || has(s, 'md-scan') || has(s, 'ct') || has(s, 'lytic'), points: 2, severity: 'minor',
      text: 'Aspirin once the cause is a pulmonary embolism. Her chest pain is pleuritic, not a coronary: aspirin treats nothing she has, and with heparin and a lytic it only adds bleeding.',
    },
    {
      // heparin follows a tenecteplase bolus or an arrest push; it is the 2-hour alteplase infusion it must not run with
      id: 'heparin-extra', actions: ['heparin'], roles: ED_TEAM, when: (s) => has(s, 'heparin') || has(s, 'alteplase-infusion'), points: 3, severity: 'minor',
      text: 'Heparin on top of a dose already in, or while the alteplase runs. The heparin goes in first, at once; the drip is paused during the 2-hour alteplase infusion and restarted when it ends (once the aPTT is under twice normal) — heparin during the lytic only adds bleeding.',
    },
    {
      // with a pulse the bedside scan (or CT) comes before a lytic; in the arrest the bar is lower (2025 AHA: suspected PE)
      id: 'lytic-before-imaging', actions: ['alteplase', 'tnk'], roles: ED_MD, when: (s) => s.pulse && !has(s, 'lytic') && !has(s, 'pocus') && !has(s, 'ct'), points: 10, severity: 'major',
      text: 'A fibrinolytic before any imaging. Shock after a faint can also be tamponade, an aortic dissection, a bleed or a large MI — and a lytic is lethal in a dissection. In a patient too unstable for CT, a bedside ultrasound showing the right ventricle failing (no effusion, a normal aortic root) is the minimum before systemic lysis; it takes three minutes.',
    },
    {
      id: 'rn-lytic-without-order', actions: ['alteplase'], roles: ED_RN, when: (s) => !has(s, orderedFlag('alteplase')), points: 15, severity: 'critical', replaces: noOrder(['alteplase']),
      text: 'A fibrinolytic with no order. Whether she gets a lytic — and when — is the physician\'s decision, after he has examined her and weighed her bleeding risk: it can bleed into the brain, and once it is in it cannot be taken back. The ER nurse prepares it, checks it is safe, runs it on the order and watches her; tell the physician what you see and what you think she needs (SBAR).',
    },
    {
      id: 'second-lytic', actions: ['alteplase', 'tnk'], roles: ED_TEAM, when: (s) => has(s, 'lytic'), points: 15, severity: 'critical',
      text: 'A second fibrinolytic on top of the first. One full dose is the treatment; a second only adds bleeding — in the head above all. A patient who does not respond to the lytic goes to the PE response team for catheter-directed therapy, surgery or ECMO.',
    },
    {
      id: 'transfer-pe', actions: ['transfer'], roles: ED_MD, when: (s) => s.pulse, replaces: ['transfer-unstable'], points: 3, severity: 'minor',
      text: 'Transferring her out of a hospital that has everything she needs — an ICU, a PE response team, catheter-directed therapy, cardiac surgery and ECMO. A transport of a patient in shock, on a lytic and a vasopressor, only adds risk: admit her to your ICU.',
    },
    {
      // one penalty for the drug that has no place in PEA. The ER nurse's lidocaine and arrest dose of amiodarone need no
      // order in an arrest (they are the code leader's): her other drugs are the twin below, which also stands for the order
      id: 'antiarrhythmic-pea', actions: ['amio-arrest', 'amio-infusion', 'lidocaine', 'adenosine6', 'adenosine12', 'procainamide', 'metoprolol', 'diltiazem'],
      roles: ED_TEAM, when: (s, _sc, id) => !s.pulse && (s.role !== 6 || ['amio-arrest', 'lidocaine'].includes(id)), points: 3, severity: 'minor',
      replaces: [
        'procainamide-in-arrest', ...noOrder(['amio-infusion', 'adenosine6', 'adenosine12', 'procainamide', 'metoprolol', 'diltiazem']),
        ...LIDOCAINE_RULES, ...RATE_RULES, 'amiodarone-arrest-long-qt',
      ],
      text: 'A rate or rhythm drug in PEA. Amiodarone and lidocaine are for VF or pulseless VT that shocks have not fixed; the others are for tachycardias with a pulse. CPR, epinephrine and the cause — here the clot, and a lytic for it.',
    },
    {
      // the nurse's version also stands for the missing order, at the order's weight, and says so
      id: 'antiarrhythmic-pea-rn', actions: ['amio-infusion', 'adenosine6', 'adenosine12', 'procainamide', 'metoprolol', 'diltiazem'],
      roles: ED_RN, when: (s) => !s.pulse, points: 5, severity: 'major',
      replaces: [
        'procainamide-in-arrest', ...noOrder(['amio-infusion', 'adenosine6', 'adenosine12', 'procainamide', 'metoprolol', 'diltiazem']),
        ...LIDOCAINE_RULES, ...RATE_RULES, 'amiodarone-arrest-long-qt',
      ],
      text: 'A rate or rhythm drug in PEA, with no order. An amiodarone infusion, procainamide, adenosine, metoprolol and diltiazem are for tachycardias with a pulse — and even in an arrest they are given only on the physician\'s order (the code leader\'s ACLS drugs are epinephrine, and amiodarone 300 mg or lidocaine for VF or pulseless VT that shocks have not fixed). CPR, epinephrine and the cause — here the clot, and a lytic for it.',
    },
  ]),
  timings: [
    DOOR_TO_ECG,
    { label: 'Heparin in', actions: ['heparin'], flag: 'heparin' },
    // the nurse's runs: the physician's fallback counts as the team's time
    { label: 'Vasopressor running', actions: ['pressor', 'push-epi'], flag: 'pressor', target: 15 },
    { label: 'Arrival to alteplase', actions: ['alteplase', 'tnk'], flag: 'lytic' },
    { label: 'CPR after the arrest', actions: ['cpr'], target: 1, from: 'arrest' },
  ],
  deathAfter: 20,
  teaching: [
    'Think of a pulmonary embolism with sudden breathlessness, a faint, pleuritic chest pain, a fast rate and a low SpO₂ — above all with a risk factor: a long flight or other immobility, estrogen (the pill, hormone therapy, pregnancy), recent surgery, cancer, a previous clot, a swollen calf.',
    'Read the shock: distended neck veins with clear lungs and a low pressure is obstructive shock — a pulmonary embolism, tamponade or a tension pneumothorax. The bedside ultrasound tells them apart: a huge right ventricle squeezing a small left one, a wide IVC and a leg vein that will not compress is a pulmonary embolism with shock.',
    'Severity (2026 AHA/ACC acute PE guideline): persistent or recurrent hypotension with cardiogenic shock is Clinical Category E1; refractory shock, often with cardiac arrest, is E2. In category E, systemic thrombolysis with anticoagulation is reasonable (class 2a) when the bleeding risk allows; catheter-directed therapy, mechanical thrombectomy or surgical embolectomy are the alternatives when it does not or it fails, and VA-ECMO is reasonable for E2. The PE response team is recommended for categories C to E.',
    'A patient this likely to have a pulmonary embolism, in shock, with a failing right ventricle on the bedside ultrasound, can be treated without CT — but not without any imaging: the scan also rules out tamponade and a dissection, which a lytic would make fatal. Never send a hypotensive patient to the scanner, and never let a scan delay the lytic.',
    'Anticoagulate at once, as soon as a pulmonary embolism is likely: unfractionated heparin when a lytic or a procedure may follow (80 units/kg, then 18 units/kg/h — not the ACS dose); low-molecular-weight heparin is preferred for most other patients.',
    'Alteplase 100 mg IV over 2 hours is the approved regimen: pause the heparin drip while it runs and restart it at the end, once the aPTT is under twice normal. Before it: the bleeding checklist (a bleed in the head ever, a stroke within 3 months, active bleeding, recent surgery or trauma — a head injury in the faint — a possible aortic dissection, blood thinners) and a baseline neuro exam.',
    'During the infusion (the ER nurse): vital signs and a neuro check every 15 minutes, no new punctures or IM injections, and every bleed reported — pressure on oozing lines; a headache, a neuro change, bleeding inside the body or a falling pressure stop the infusion.',
    'Support the right ventricle: oxygen to an SpO₂ of 90 % or more; norepinephrine first for the low pressure, to a MAP of 65 or more; at most one small fluid bolus (500 mL or less), and only with a low central venous pressure. Liters of fluid overdistend the right ventricle and lower the output.',
    'Avoid what takes away preload or adds pressure in the chest: no nitrates, no CPAP for clear lungs (high-flow nasal oxygen if a mask is not enough), and no deep sedation or intubation unless clinically indicated — induction drugs and positive-pressure ventilation can collapse a failing right ventricle (2026 AHA/ACC: 3, Harm). If a tube cannot be avoided: the vasopressor running first, a reduced dose of a stable induction drug, and ECMO ready. Her sinus tachycardia is compensation: never slow it.',
    'If she arrests: PEA, often narrow and fast at first — CPR, epinephrine 1 mg as soon as possible, and a lytic for the clot (2025 AHA: systemic thrombolysis may be considered for a suspected pulmonary embolism, commonly alteplase 50 mg IV push; ECMO-supported CPR is reasonable where available). Keep the compressions going after the lytic: it needs blood flow to reach the clot.',
    'The ER nurse calls the physician at once with SBAR, starts two large-bore lines and the labs (coags and a type and screen before a lytic), records the 12-lead within 10 minutes, and gives the heparin, the vasopressor and the alteplase on the physician\'s order — the decision on a lytic is the physician\'s; checking that it is safe, running it and watching her is the nurse\'s.',
  ],
};
