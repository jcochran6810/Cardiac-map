import type { Critical, Effect, Line, Scenario, SimState, Speaker } from '../types';
import { atRate, bpAfter, count, firstDone, has, line, orderedFlag } from '../kit';
import { askCritical, askDone, askEvents, type LabAsk } from '../labKit';
import { DOOR_TO_ECG, ED_MD, ED_RN, ED_TEAM, edOrder, physicianDispo } from '../edKit';
import { ANTITHROMBOTIC_RULES, LYTIC_RULES, NITRATE_RULES, SEDATIVE_RULES } from '../rules/acs';

/**
 * Cardiac tamponade from a malignant pericardial effusion, in the emergency department. A 58-year-old woman with breast
 * cancer that has spread to her lungs and bones has been more and more breathless for two days, has slept sitting up, has
 * hardly eaten or drunk, and nearly fainted getting into the car. Her husband wheels her up to triage: a low pressure with a
 * narrow pulse pressure (84/68), a fast rate, distended neck veins, faint heart sounds (Beck's triad), a pulse that fades
 * each time she breathes in (pulsus paradoxus), clear lungs, and a 12-lead with low voltage and electrical alternans. The
 * bedside ultrasound shows a large effusion with the right atrium and right ventricle collapsing.
 *
 * The ER nurse (role 6): ESI 1, the monitor and oxygen, a manual pressure (the pulsus), the neck veins, the heart sounds and
 * the lungs, the ED physician to the bedside with an SBAR, two large-bore IVs and labs, the 12-lead within 10 minutes; then
 * the physician's orders — a fluid bolus, the set-up for the drain (pads on, the crash cart open), a vasopressor when her
 * pressure slides — the call-out of the extra beats the needle sets off, and the pressure rechecked after the drain. The
 * ER doctor (role 7): a computer nurse does the nursing; the doctor examines, scans, gives a fluid bolus, drains the
 * pericardium under ultrasound at the bedside (she is in shock, and the cardiologist is tied up in the cath lab), and
 * consults cardiology and admits her to the CCU — without intubating her, sending her to the scanner or giving anything
 * that takes away preload.
 *
 * The traps are the usual answers for a breathless patient with chest heaviness: nitroglycerin, CPAP or a bag, intubation
 * first, a drug to slow the "fast heart", a sedative, holding the fluid and waiting for a CT (2015 ESC pericardial
 * guideline: vasodilators and diuretics are not recommended in tamponade; Adler et al., Nat Rev Dis Primers 2023; Spodick,
 * N Engl J Med 2003; Sagristà-Sauleda et al., Circulation 2008). The effusion keeps building: her pressure slides at minute
 * 11, again at 15 with no fluid, she crashes at 19 and arrests in PEA at 23 — or as soon as something drops her systolic
 * under 62. Only the drain fixes it: in the arrest, a pericardiocentesis brings her back.
 */

/** The effusion keeps building: her pressure slides at this minute (undrained), and again at the next one with no fluid */
const WORSE_AT = 11;
const WORSE_DRY_AT = 15;
/** Still undrained: she is barely rousable, then her heart cannot fill at all (PEA) */
const CRASH_AT = 19;
const ARREST_AT = 23;
/** A systolic under this, with the heart already squeezed, stops it */
const ARREST_SBP = 62;

/** Minutes a push of push-dose epinephrine holds the pressure: a bridge to the infusion */
const PUSH_LASTS = 6;

/** The ER nurse's run: the physician comes by himself at this minute if nobody calls him, and scans for this long */
const MD_COMES_BY = 6;
const SCAN_MINUTES = 3;
/** Minutes from the set-up being ready to the needle going in (gown, gloves, chlorhexidine, the local anesthetic) */
const NEEDLE_PREP = 2;
/** Minutes the physician needs to notice the extra beats himself if nobody calls them out */
const CALLOUT_WAIT = 1;
/** Minutes after the drain until the physician has talked to cardiology and the CCU */
const DISPO_AFTER = 3;

const drained = (s: SimState) => has(s, 'drained');

/** The nurse's run: the set-up has been ready long enough — the physician's needle is going in (or is in) */
const needleDue = (s: SimState) => has(s, 'setup-ready') && s.minute >= s.flags['setup-ready'] + NEEDLE_PREP;

/**
 * When the ER doctor's needle went in (the start of the procedure; the flag 'drained' is set as it ends), or null: what has
 * to come before the drain is judged against it
 */
const needleAt = (s: SimState) => firstDone(s, ['pericardiocentesis']);

/** The teammate at the bedside who speaks up: a tech or the charge nurse in the nurse's run, the nurse in the doctor's */
const helper = (s: SimState): Speaker => (s.role === 6 ? 'team' : 'nurse');

/** The ER nurse gives it herself (on the physician's order); the ER doctor orders it and the computer nurse gives it */
function given(s: SimState, order: string, done: string): Line[] {
  return s.role === 7 ? [['you', order], ['nurse', done]] : [['you', done]];
}

/** Only a patient awake enough to talk says how she feels */
const awake = (s: SimState, text: string): Line[] => (s.pulse && s.vitals.gcs >= 13 ? [['patient', text]] : []);

/** Her own words while she can talk; her husband's once she cannot (the crash, the arrest, a tube) */
const history = (own: string, husband: string) => (s: SimState) => (s.pulse && s.vitals.gcs >= 13 ? own : `Her husband answers for her: "${husband}"`);

/** The ER nurse's 12-lead while the physician's needle is in: blocked (no time passes) */
const noEcgNow: Effect = {
  blocked: true,
  say: [['system', 'Not while the needle is in: watch the monitor and the pressure, and call out what you see. The 12-lead can wait until the fluid is off.']],
};

/** 500 mL boluses in so far: the learner's, and the one another nurse hung when the order went unanswered */
const boluses = (s: SimState) => count(s, 'fluid') + (has(s, 'team-bolus') ? 1 : 0);

/** The numbers at the bedside (the monitor shows them; the learner reads the tracing) */
const numbers = (s: SimState) => `BP ${s.vitals.sbp}/${s.vitals.dbp} · pulse ${s.rhythm.hr} · RR ${s.vitals.rr} · SpO₂ ${s.vitals.spo2}%`;

/** The monitor line after something moves the rate and the pressure: numbers only, never the rhythm's name */
const rateBp = (hr: number, bp: { sbp: number; dbp: number }, tone?: Line[2]): Line => line('monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`, tone);

/** A vasopressor is holding her pressure up: the infusion, or a push of push-dose epinephrine in the last few minutes */
function supported(s: SimState): boolean {
  if (has(s, 'pressor')) return true;
  const push = s.performed.filter((p) => p.id === 'push-epi').at(-1);
  return push !== undefined && s.minute - push.minute <= PUSH_LASTS;
}

/**
 * mmHg the systolic falls each time she breathes in (pulsus paradoxus), as a manual cuff finds it: it grows as the effusion
 * tightens, can never be more than the gap down to the diastolic, and is gone once the fluid is off
 */
function pulsus(s: SimState): number {
  if (drained(s)) return 4;
  const want = has(s, 'crashing') ? 18 : has(s, 'worse') ? 16 : 14;
  return Math.min(want, s.vitals.sbp - s.vitals.dbp - 2);
}

/**
 * The fall is wider than her pulse pressure (a narrow one after a drop): the sounds, and the pulse at the wrist, vanish
 * altogether each time she breathes in. Said that way, never as a small fall that would read as normal
 */
const pulsusLost = (s: SimState) => !drained(s) && pulsus(s) < (has(s, 'crashing') ? 18 : has(s, 'worse') ? 16 : 14);

/** What she has found about the pulsus, in the SBAR */
const pulsusWords = (s: SimState) => (pulsusLost(s)
  ? 'a pulse that disappears each time she breathes in'
  : `a systolic that falls ${pulsus(s)} mmHg each time she breathes in`);

/** What she says when reassessed */
function statusText(s: SimState): string {
  if (!s.pulse) return 'Unresponsive.';
  if (has(s, 'rsi')) return 'Sedated and paralyzed on the ventilator.';
  if (drained(s) && s.vitals.gcs < 13) return 'Opens her eyes to her name and squeezes your hand.';
  if (drained(s)) return has(s, 'rosc') ? '"What happened…? I can breathe now."' : '"I can breathe again… that\'s so much better."';
  if (has(s, 'crashing')) return '"…" She barely opens her eyes to her name.';
  if (has(s, 'worse')) return '"I feel like I\'m going to pass out… I can\'t get my breath."';
  if (s.vitals.sbp >= 90) return '"The dizziness is a little better. I still can\'t get a full breath."';
  return '"I can\'t get my breath… and I feel faint."';
}

/**
 * The fluid comes off: 650 mL of blood-stained fluid through a pigtail drain left in the sac. The pressure comes back at
 * once, the rate slows, the alternans on the monitor is gone (a plain fast sinus rhythm), and the vasopressor can come down
 */
function drainEffect(s: SimState, how: Line[]): Effect {
  const arrested = !s.pulse;
  const bp = arrested ? { sbp: 98, dbp: 62 } : { sbp: 116, dbp: 74 };
  const hr = arrested ? 118 : 106;
  // a tube in (the ventilator breathes for her; after RSI she is sedated and paralyzed), the arrest (she comes round over
  // minutes: the 'waking' event), a sedative still acting, or awake at once
  const tube = has(s, 'airway');
  const gcs = has(s, 'rsi') ? 3 : arrested ? 10 : has(s, 'procedural-sedation') || has(s, 'benzodiazepine') ? Math.max(s.vitals.gcs, 13) : 15;
  const after: Line[] = arrested
    ? [['you', tube ? 'Pulse check: a carotid pulse — ROSC.' : 'Pulse check: a carotid pulse — ROSC. She gasps, then breathes on her own.', 'good']]
    : awake(s, '"Oh… I can breathe. That\'s so much better."');
  // the nurse's run: an order still open when the fluid came off is overtaken by it — the physician stands it down (no
  // fallback after the drain), and the vasopressor bridge is over: a dose from now on would need a new order
  const open = (id: string, gives: string) => s.role === 6 && has(s, `asked-${id}`) && !has(s, gives);
  const standDown = [open('rn-fluid', 'fluid-given') && 'fluid-given', open('rn-setup', 'setup-ready') && 'setup-ready', open('rn-pressor', 'pressor-given') && 'pressor-given']
    .filter((f): f is string => !!f);
  return {
    say: [
      ...how,
      rateBp(hr, bp, 'good'),
      ...after,
      ...(has(s, 'pressor') && !arrested ? [line(helper(s), 'The norepinephrine is coming down — and off, as her pressure holds.')] : []),
      ...(open('rn-pressor', 'pressor-given') && !arrested ? [line('physician', 'Hold the norepinephrine — her pressure\'s back.')] : []),
    ],
    rhythm: { profile: 'sinus-tachycardia', hr },
    vitals: { ...bp, spo2: 96, rr: tube ? 16 : 20, gcs, pain: 1, etco2: 34 },
    ...(arrested ? { pulse: true, phase: 'rosc' } : {}),
    flags: ['drained', 'pericardiocentesis', ...standDown],
    clear: [orderedFlag('pressor'), orderedFlag('push-epi')],
  };
}

/**
 * The heart can no longer fill at all: organized complexes on the monitor, no pulse (PEA). The EtCO₂ is left as it was, so
 * the case monitor and the capnography line both read the shared arrest rule (kit's arrestEtco2)
 */
function arrestEffect(s: SimState, why: string): Effect {
  return {
    say: [[helper(s), why, 'bad'], ['monitor', 'Monitor alarm.', 'bad']],
    rhythm: { profile: 'pea', hr: 112 }, pulse: false, phase: 'arrest',
    vitals: { sbp: 0, dbp: 0, gcs: 3, rr: 0 }, flags: ['tamponade-arrest'],
  };
}

/** A fluid bolus: the first fills the squeezed heart a little, the second a little more, more only raises the pressure in the sac */
function bolus(s: SimState, lead: Line[]): Effect {
  const n = boluses(s);
  if (n >= 2) {
    return { say: [...lead, [helper(s), 'Her neck veins are even fuller — and the pressure has not moved.', 'warn'], line('monitor', `BP ${s.vitals.sbp}/${s.vitals.dbp}.`)], flags: ['fluid'] };
  }
  const bp = n === 0 ? bpAfter(s, 8, 3) : bpAfter(s, 4, 2);
  const hr = Math.max(110, s.rhythm.hr - 4);
  return { say: [...lead, rateBp(hr, bp), ...awake(s, '"The dizziness is a little better."')], vitals: bp, rhythm: atRate(s, hr), flags: ['fluid'] };
}

/** The bridge to the drain: her own adrenaline is already working flat out, so the gain is real but small */
function pressorEffect(s: SimState, lead: Line[]): Effect {
  const bp = bpAfter(s, 14, 8);
  const hr = Math.min(150, s.rhythm.hr + 4);
  return { say: [...lead, rateBp(hr, bp)], vitals: bp, rhythm: atRate(s, hr), flags: ['pressor'] };
}

/**
 * Anything that takes away the blood filling her heart — a vasodilator, positive pressure in the chest, a sedative that blunts
 * the drive holding her vessels tight, a drug that slows the rate her output depends on — drops a pressure with nothing in
 * reserve. The drop is permanent for the case
 */
function drop(s: SimState, dSbp: number, dDbp: number, dHr: number) {
  const bp = bpAfter(s, -dSbp, -dDbp);
  const hr = Math.max(40, Math.min(150, s.rhythm.hr + dHr));
  return { bp, hr };
}

/** Nitroglycerin: no coronary pain to relieve, and it pools the blood her squeezed heart lives on */
function nitroCrash(s: SimState, high: boolean): Effect | null {
  if (!s.pulse || drained(s)) return null;
  const { bp, hr } = high ? drop(s, 20, 10, 6) : drop(s, 14, 8, 6);
  const dose = `Nitroglycerin ${high ? '0.8' : '0.4'} mg`;
  return {
    say: [...given(s, `${dose} sublingual.`, `${dose} under her tongue.`), ...awake(s, '"Everything\'s going gray… I\'m going to pass out."'), rateBp(hr, bp, 'bad'), [helper(s), 'She has gone gray and slumped in the bed.', 'bad']],
    vitals: { ...bp, gcs: Math.min(s.vitals.gcs, 14) }, rhythm: atRate(s, hr), flags: high ? ['nitro', 'nitro-high'] : ['nitro'],
  };
}

/** An opioid or a sedative before the drain: nothing it treats, and it blunts the drive that holds her pressure up */
function sedativeDrop(s: SimState, order: string, done: string, flags: string[]): Effect | null {
  if (!s.pulse || drained(s)) return null;
  const { bp } = drop(s, 10, 6, 0);
  return {
    say: [...given(s, order, done), [helper(s), 'She is drowsy now, and her breathing is slower and shallower.', 'bad'], line('monitor', `BP ${bp.sbp}/${bp.dbp}.`, 'bad')],
    vitals: { ...bp, rr: Math.max(14, s.vitals.rr - 4), gcs: Math.min(s.vitals.gcs, 13) }, flags,
  };
}

/** A drug that slows the heart: the fast rate is what keeps a little output going through a heart that cannot fill */
function rateDrop(s: SimState, drug: string, dHr: number, flag: string): Effect | null {
  if (!s.pulse) return null;
  // once the fluid is off the heart fills again: the drop is the usual one, not a collapse
  const after = drained(s);
  const { bp, hr } = drop(s, after ? 12 : dHr > 0 ? 18 : 10, after ? 8 : dHr > 0 ? 10 : 6, after ? -Math.min(dHr, 10) : -dHr);
  return {
    say: [
      ...given(s, `${drug} — order given.`, `${drug} given.`), rateBp(hr, bp, 'bad'),
      after ? [helper(s), 'Her pressure has dropped again.', 'warn'] : [helper(s), 'She has gone gray — she is barely with us!', 'bad'],
    ],
    vitals: { ...bp, gcs: after ? s.vitals.gcs : Math.min(s.vitals.gcs, 13) }, ...(dHr > 0 ? { rhythm: atRate(s, hr) } : {}), flags: [flag],
  };
}

/** What the 12-lead shows: the explanation after the read (the profile on the tracing decides the answer) */
function ecgText(s: SimState): string {
  if (s.rhythm.profile === 'pvcs') return `Premature ventricular complexes (every fourth beat) at ${s.rhythm.hr}: the needle is touching the heart. Pull it back and they stop.`;
  if (s.rhythm.profile !== 'tamponade') return `Sinus tachycardia ${s.rhythm.hr}: the electrical alternans has gone now that the fluid is off, and the complexes are a little taller than before. No ST elevation.`;
  return `Sinus tachycardia ${s.rhythm.hr} with low voltage (small QRS complexes in every limb lead and across the chest leads) and electrical alternans: the height of the QRS alternates from beat to beat as the heart swings in a large pericardial effusion. No ST elevation: it does not meet STEMI criteria. With a low pressure, distended neck veins and faint heart sounds (Beck's triad) and a pulse that fades on breathing in (pulsus paradoxus), it points to cardiac tamponade.`;
}

/** The physician's bedside scan, in words */
const SCAN_WORDS = 'Bedside ultrasound: a large pericardial effusion all around the heart, 2.5 cm deep, the heart swinging in it; the right atrium caves in during systole and the right ventricular free wall collapses in early diastole; the IVC is 2.3 cm and does not narrow with breathing; the left ventricle is small and squeezes hard. Both lungs slide, with A-lines; the aortic root is not dilated. The fluid is deepest and closest to the skin at the left parasternal window.';

/** A real echo (apical four-chamber view) of a large effusion squeezing the right heart: a key of CATH_IMAGES */
const SCAN_IMAGE = 'tamponade-echo';

/** The ER doctor's first scan: the real image and a read; what the image does not show, in words */
const SCAN_ALONGSIDE = 'Also on the scan: the IVC is 2.3 cm and does not narrow with breathing; both lungs slide, with A-lines; the aortic root is not dilated; the fluid is deepest and closest to the skin at the left parasternal window.';
const SCAN_READ = {
  kind: 'clinical' as const,
  answer: 'clin-tamponade',
  prompt: 'What does the bedside ultrasound show?',
  explain: 'A large pericardial effusion all around the heart, with the right atrium caving in during systole and the right ventricle collapsing in early diastole, and a wide IVC that does not narrow with breathing: cardiac tamponade. With a systolic in the 80s, it is tamponade with shock — it needs draining now, here. (The picture is a real echo from another patient, whose effusion came from a chest wound; hers looks the same.)',
};

// ─── The ER nurse's orders from the (computer) ED physician ───────────────────

const RN_FLUID: LabAsk = edOrder({
  // the order comes once there is a line to run it through (the scan's words ask for the lines), or after 2 minutes anyway:
  // a nurse who called him first and is still putting the lines in has her full 2 minutes to hang it
  id: 'rn-fluid', when: (s) => s.pulse && has(s, 'md-scan') && !drained(s) && (has(s, 'iv') || s.minute >= s.flags['md-scan'] + 2), early: true,
  ask: 'It\'s tamponade — a big effusion squeezing her right heart, and she\'s in shock. I\'m going to drain it here, now. While I set up: 500 mL of saline, fast, through a pressure bag. Keep her sitting up, and nothing that drops her pressure — no nitro.',
  accept: ['fluid'],
  thanks: 'Good. The bolus keeps her heart filling until the fluid is off.', fallback: 'The other nurse is hanging the bolus — I need it in now.', gives: 'fluid-given',
  // her bolus counts toward the ones in so far (boluses), so a later one of the learner's is the second, not the first
  fallbackEffect: (s) => {
    if (!s.pulse || drained(s)) return {};
    const e = bolus(s, [['team', 'The other nurse runs in 500 mL of saline through a pressure bag.']]);
    return { ...e, flags: [...(e.flags ?? []), 'team-bolus'] };
  },
  label: 'A fluid bolus, as ordered', points: 10,
  why: 'A heart squeezed by fluid only puts out what fills it: a 500 mL bolus raises the output in about half of patients with tamponade — most of all those with a systolic under 100, like her — and leaves it unchanged or lower in the rest (Sagristà-Sauleda, Circulation 2008); she has also hardly drunk for two days. Hang it at once and reassess: a bridge to the drain, not a treatment.',
});

const RN_SETUP: LabAsk = edOrder({
  // pads and the monitor matter most in an arrest: if she arrests before they are on, the team puts them on (not held; the
  // order itself is only given with a pulse)
  id: 'rn-setup', when: (s) => s.pulse && has(s, 'fluid-given') && !drained(s), early: true, holdInArrest: false,
  ask: 'Now set me up to drain it. The tech is bringing the pericardiocentesis tray and the ultrasound: the pads on her if they\'re not on yet — below her right collarbone and on her left side, clear of where my needle goes — and open the crash cart. Then watch the monitor while I\'m in.',
  accept: ['pads'],
  thanks: 'Thanks. Call out anything you see on the monitor while I\'m in.', fallback: 'I\'m putting the pads on her myself — nobody goes near her heart with a needle without them.', gives: 'setup-ready',
  fallbackEffect: () => ({ say: [['team', 'The charge nurse puts the pads on her, below the right collarbone and on her left side, and opens the crash cart.']], flags: ['pads', 'monitor'] }),
  label: 'Set up for the drain: pads on, the crash cart open', points: 10,
  why: 'A needle near the heart can set off arrhythmias, and a patient in tamponade can arrest at any moment: the pads on (clear of the needle\'s way in below the breastbone and at the left of it), the crash cart open, the monitor and the pressure cycling every few minutes, and the tray and the ultrasound at the bedside.',
});

const RN_PRESSOR: LabAsk = edOrder({
  // not once his needle is going in: the fluid is about to come off, and he has both hands on the probe and the needle
  id: 'rn-pressor', when: (s) => s.pulse && has(s, 'md-scan') && has(s, 'worse') && !drained(s) && !needleDue(s) && (has(s, 'worse-reported') || s.minute >= s.flags.worse + 2),
  ask: 'Her pressure\'s sliding while I\'m getting in. Start norepinephrine at 0.05 micrograms per kilo per minute, titrated to a MAP of 65 — a bridge until the fluid\'s off. Push-dose epinephrine 20 micrograms if the drip isn\'t ready.',
  accept: ['pressor', 'push-epi'],
  thanks: 'Thanks — that buys us the minutes.', fallback: 'I\'ll start the norepinephrine myself.', gives: 'pressor-given',
  fallbackEffect: (s) => (s.pulse && !drained(s) ? pressorEffect(s, [['physician', 'Norepinephrine running at 0.05.']]) : {}),
  label: 'A vasopressor as a bridge, as ordered', points: 10,
  why: 'The effusion keeps building and fluid alone cannot keep up: norepinephrine (or push-dose epinephrine) holds the pressure for the minutes until the drain. Her own adrenaline is already working flat out, so it buys time, not a cure.',
});

const RN_ASKS = [RN_FLUID, RN_SETUP, RN_PRESSOR];

/** The drain or the arrest came within `minutes` of `flag`, before the nurse had her full time to act on it */
function overtaken(s: SimState, flag: string, minutes: number): boolean {
  const from = s.flags[flag];
  return from !== undefined && ['drained', 'arrest'].some((f) => s.flags[f] !== undefined && s.flags[f] >= from && s.flags[f] < from + minutes);
}

/**
 * The nurse's item for an order: what she gave counts until the fluid came off; an order the drain or the arrest overtook
 * before her 2 minutes were up is not scored (the physician stood it down) — unless she had already carried it out
 */
function orderItem(a: LabAsk): Critical {
  const done = (s: SimState) => {
    const m = askDone(s, a);
    return m !== null && (!drained(s) || m <= s.flags.drained) ? m : null;
  };
  return { ...askCritical(a), done, applies: (s) => has(s, `asked-${a.id}`) && (done(s) !== null || !overtaken(s, `asked-${a.id}`, a.within ?? 2)) };
}

/** Order-only drugs: for the ER nurse the clinical harm also covers the missing order (one mistake, one penalty) */
const noOrder = (ids: string[]) => ids.map((id) => `rn-without-order-${id}`);

export const edTamponade: Scenario = {
  id: 'tamponade-ed',
  title: 'Too breathless to lie down',
  summary: '58-year-old woman with breast cancer, more and more breathless for two days, wheeled in from the car pale and faint. Find out why her pressure is so low — and what would make it worse.',
  setting: 'ed',
  roles: [6, 7],
  difficulty: 'advanced',
  conditionId: 'cardiac-tamponade',
  briefing: {
    default: [
      ['team', 'Tuesday, 2:15 in the afternoon. Triage brings a 58-year-old woman straight back to resuscitation bay 1: two days of worsening breathlessness, and she nearly fainted getting into the car. Her husband is with her.'],
      ['team', 'She sits bolt upright, leaning forward with her hands on her knees, pale and sweaty, breathing fast. A port bulges under the skin below her right collarbone.'],
      ['patient', '"I can\'t… lie back… I can\'t get a breath."'],
    ],
    6: [
      ['team', 'Tuesday, 2:15 in the afternoon. A man wheels his wife up to the triage desk from the car: "She can\'t get her breath — it\'s been getting worse for two days, and she nearly fainted getting into the car."'],
      ['team', 'She is 58, sitting bolt upright in the wheelchair and leaning forward with her hands on her knees, pale and sweaty, breathing fast. A port bulges under the skin below her right collarbone.'],
      ['patient', '"I can\'t… lie back… I can\'t get a breath."'],
      ['team', 'You are the triage nurse, and she will be your patient: the assessment, the monitor, the lines and the drugs on the physician\'s orders — and you call the physician. The ED physician is in the department. Your hospital has cardiology, a cath lab, cardiothoracic surgery, oncology and a CCU.'],
    ],
    7: [
      ['team', 'Tuesday, 2:15 in the afternoon. Triage brings a 58-year-old woman straight back to resuscitation bay 1: two days of worsening breathlessness, and she nearly fainted getting into the car. Triage pressure 84/68, pulse 128. Her husband is with her.'],
      ['team', 'She sits bolt upright, leaning forward with her hands on her knees, pale and sweaty, breathing fast. A port bulges under the skin below her right collarbone.'],
      ['patient', '"I can\'t… lie back… I can\'t get a breath."'],
      ['nurse', 'I\'ll get her on the monitor and oxygen, two lines in and the 12-lead. Tell me what you want.'],
      ['team', 'You are the ED physician: the diagnosis, the orders and the procedures are yours; the nurse does the nursing on your orders. Your hospital has cardiology, a cath lab, cardiothoracic surgery, oncology and a CCU.'],
    ],
  },
  initial: {
    // the 'tamponade' profile: sinus tachycardia with low voltage and electrical alternans. 84/68: a narrow pulse pressure
    rhythm: { profile: 'tamponade', hr: 128 },
    vitals: { sbp: 84, dbp: 68, spo2: 91, rr: 28, etco2: 30, pain: 3, gcs: 15, glucose: 118, temp: 37.0 },
  },
  // the built-in rule for the ER doctor's needle reads it: a pericardiocentesis is right for her
  problems: ['tamponade'],
  // the doctor's first bedside scan shows a real echo of a large effusion squeezing the right heart
  images: { pocus: SCAN_IMAGE },
  facts: {
    opqrst: history(
      'It\'s not pain really — a heavy, full feeling in the middle of my chest, 3 out of 10, since yesterday. It\'s the breathing: it got worse and worse over two days, and I can\'t lie back at all — I slept sitting up in a chair last night. Getting into the car I nearly blacked out.',
      'She\'s had a heavy feeling in her chest since yesterday, but it\'s the breathing — worse and worse for two days. She slept sitting up in a chair, and she nearly blacked out getting into the car.',
    ),
    sample: history(
      'No allergies. Breast cancer — the left breast, five years ago: surgery, chemotherapy and radiation. It came back last spring, in my bones and my lungs; I have chemotherapy every three weeks at the cancer center, the last one 12 days ago, through the port. Medicines: the chemo, a pill for nausea, and a shot for my bones. No blood thinners — not even aspirin. I\'ve hardly eaten or drunk anything for two days. No fever, no cough.',
      'No allergies. Breast cancer five years ago, and it came back last spring in her bones and lungs — chemo every three weeks through the port, the last one 12 days ago. A nausea pill and a shot for her bones; no blood thinners, not even aspirin. She\'s hardly eaten or drunk for two days.',
    ),
    pde5: 'No.',
    allergies: 'No allergies.',
    // the heart sounds are heard with the stethoscope on the chest, as the lungs are
    lungs: (s) => {
      if (!s.pulse) return 'Breath sounds on both sides with each squeeze of the bag.';
      if (drained(s)) return 'Clear on both sides, a little quieter at the left base; the heart sounds are louder now.';
      return 'Breathing fast, but the lungs are clear: no crackles, no wheezes; breath sounds a little quieter at the left base. With the stethoscope on her chest the heart sounds are faint and distant.';
    },
    perfusion: (s) => {
      if (!s.pulse) return 'No pulse. Neck veins distended.';
      if (drained(s)) return 'Pinker and warmer; the neck veins have come down to a few centimeters above the collarbone sitting up; a strong radial pulse that no longer fades on breathing in.';
      if (has(s, 'crashing')) return 'Gray, cold and mottled. The neck veins bulge up to the jaw. No radial pulse — only a faint, fast carotid.';
      return 'Pale, cool and clammy; capillary refill 4 seconds. The neck veins are distended up to the angle of the jaw, even sitting upright. The radial pulse is fast and weak, and it fades each time she breathes in. No leg swelling.';
    },
    neuro: (s) => (has(s, 'crashing') ? 'Opens her eyes only to a loud voice; mumbles.' : has(s, 'worse') && !drained(s) ? 'Alert but slow to answer; no focal deficit.' : 'Alert and oriented; no focal deficit.'),
    labs: 'Drawn and sent: CBC, chemistries, PT/INR and aPTT, type and screen, high-sensitivity troponin, BNP and a lactate. Bedside venous gas: lactate 3.8 mmol/L, hemoglobin 10.6 g/dL, potassium 4.3.',
    cxr: 'Portable chest X-ray: a large, globular heart shadow — much bigger than on her staging scan two months ago — with clear lung fields; a small left pleural effusion; no pneumothorax; the port tip at the junction of the superior vena cava and the right atrium.',
    pocus: (s) => (drained(s)
      ? 'Repeat bedside ultrasound: only a thin rim of fluid left around the heart, the pigtail drain in the sac; the right heart fills normally; the IVC is smaller and narrows with each breath.'
      : SCAN_WORDS),
    ct: (s) => (drained(s)
      ? 'Radiology: a small residual pericardial effusion around the drain; no pulmonary embolism; metastases in both lungs and the spine.'
      : 'Radiology: a large pericardial effusion all around the heart, the right heart chambers flattened, contrast refluxing into the IVC and the hepatic veins; no pulmonary embolism; metastases in both lungs and the spine.'),
    // what cardiology says when the ER doctor calls: before the drain, and after it
    consult: (s) => (drained(s)
      ? 'Cardiology: "Good work. We\'ll take her to the CCU with the drain in: the output every hour, an echo in the morning, and the drain stays until it puts out very little — leaving it in makes a malignant effusion less likely to come back. Send the fluid for cytology, a cell count and cultures. If it comes back, cardiothoracic surgery can make a window; I\'ll let oncology know."'
      : 'Cardiology: "Tamponade with shock — don\'t wait for us. The interventional cardiologist is scrubbed in a STEMI and won\'t be free for 45 minutes. Drain it now under ultrasound and leave a pigtail drain in; then she comes to the CCU."'),
    ecg12: ecgText,
  },
  status: statusText,
  respond: {
    // the triage nurse's level, in her own words: a low pressure with a fast rate in a breathless patient is ESI 1
    triage: (s) => (s.pulse ? {
      say: [['you', `ESI 1: a pressure of ${s.vitals.sbp}/${s.vitals.dbp} with a pulse of ${s.rhythm.hr} in a breathless woman who nearly fainted — she needs a life-saving intervention now. Straight to the resuscitation bay, the physician to the bedside, a 12-lead within 10 minutes.`]],
      flags: ['triage', 'esi-1'],
    } : null),
    // the manual cuff hears what the NIBP cannot: the sounds come and go with her breathing (pulsus paradoxus)
    vitals: (s) => {
      if (!s.pulse) return null;
      const v = s.vitals;
      const p = pulsus(s);
      const sounds = drained(s)
        ? `the sounds no longer come and go with her breathing (a fall of only ${p} mmHg as she breathes in)`
        : pulsusLost(s)
          ? `the sounds come and go with her breathing: heard at ${v.sbp} only while she breathes out, and lost altogether each time she breathes in, all the way down to ${v.dbp} — the pulse at her wrist disappears with every breath in`
          : `the sounds come and go with her breathing: first heard at ${v.sbp}, but only while she breathes out; with every beat only from ${v.sbp - p} down — a fall of ${p} mmHg each time she breathes in`;
      return { say: [['you', `BP ${v.sbp}/${v.dbp} by hand — ${sounds} · pulse ${s.rhythm.hr}${drained(s) ? '' : ', weak'} · RR ${v.rr} · SpO₂ ${v.spo2}%`]], flags: ['bp'] };
    },
    // two large-bore lines for the bolus and a drip (not the port: a bolus runs slowly through it)
    iv: () => ({ say: [['you', 'Two large-bore IVs: an 18 G in each antecubital; blood drawn from the first. The port stays for later — a bolus runs slowly through it.']], flags: ['iv'] }),
    // anterior–lateral, so the pads stay clear of the needle's way in below the breastbone and at the left of it
    pads: () => ({ say: [['you', 'Pads on: one below the right collarbone, the other on her left side below the armpit (anterior–lateral) — clear of the lower breastbone and the left edge of it, where the needle will go.']], flags: ['pads', 'monitor'] }),
    // while the needle is in, the nurse watches the monitor and calls what she sees: no 12-lead on a moving target
    ecg12: (s) => (s.role === 6 && has(s, 'needle-in') && !drained(s) ? noEcgNow : null),
    'ecg12-repeat': (s) => (s.role === 6 && has(s, 'needle-in') && !drained(s) ? noEcgNow : null),
    // the nurse calls the physician: at once, with what she has found — then with each change, and during the needle
    'notify-physician': (s) => {
      if (!s.pulse) return { say: [['physician', 'I\'m here — keep the compressions going. I\'m going in with the needle.']], flags: ['physician-notified'] };
      if (has(s, 'needle-in') && !drained(s)) {
        return {
          say: [
            ['you', `Early, wide beats on the monitor since the needle went in — ${numbers(s)}.`],
            ['physician', 'Pulling back a couple of millimeters… they\'ve stopped. Good call — keep watching.'],
          ],
          flags: ['physician-notified', 'ectopy-called', ...(has(s, 'worse') ? ['worse-reported'] : [])],
        };
      }
      if (has(s, 'worse') && !drained(s) && has(s, 'md-bedside') && !has(s, 'worse-reported')) {
        return {
          say: [['you', `SBAR: her pressure is sliding — ${numbers(s)}; she is grayer and slower to answer, and the pulse fades more as she breathes in.`], ['physician', 'Thanks — I see it. Let\'s hold her up until the fluid\'s off.']],
          flags: ['physician-notified', 'worse-reported'],
        };
      }
      if (drained(s) && !has(s, 'drain-reported')) {
        return {
          say: [
            ['you', `After the drain: ${numbers(s)}; she is ${s.vitals.gcs >= 13 ? 'talking in full sentences' : 'opening her eyes to her name'}, and the drain is draining.`],
            ['physician', 'Good. Vitals every 15 minutes, the drain output every hour, and call me at once if the pressure falls or the drain stops.'],
          ],
          flags: ['physician-notified', 'drain-reported'],
        };
      }
      if (!has(s, 'md-bedside')) {
        // only what she has found or been told
        const found = [
          ...(has(s, 'perfusion') ? ['distended neck veins'] : []),
          ...(has(s, 'lungs') ? ['clear lungs and faint heart sounds'] : []),
          ...(count(s, 'vitals') > 0 ? [pulsusWords(s)] : []),
          ...(has(s, 'sample') ? ['metastatic breast cancer on chemotherapy'] : []),
        ];
        return {
          say: [['you', `SBAR: 58-year-old woman in bay 1, two days of worsening breathlessness and a near-faint; ${numbers(s)}${found.length ? `; ${found.join(', ')}` : ''}. I need you at the bedside now.`], ['physician', 'Coming now.']],
          flags: ['physician-notified'],
        };
      }
      return { say: [['physician', 'Thanks — keep the checks coming, and call me with any change.']], flags: ['physician-notified'] };
    },
    // the heart only puts out what fills it: the first bolus fills it, the second a little, more only fills the sac's pressure
    fluid: (s) => {
      if (!s.pulse) return { say: given(s, '500 mL of saline, wide open.', '500 mL of saline running wide open; compressions go on.'), flags: ['fluid'] };
      if (drained(s)) {
        const bp = bpAfter(s, 4, 2);
        return { say: [...given(s, '500 mL saline bolus.', '500 mL of saline in.'), line('monitor', `BP ${bp.sbp}/${bp.dbp}.`)], vitals: bp, flags: ['fluid'] };
      }
      return bolus(s, boluses(s) === 0
        ? given(s, '500 mL saline bolus, fast, through a pressure bag.', '500 mL of saline in through a pressure bag.')
        : given(s, 'Another 500 mL bolus.', `Another 500 mL in — ${(boluses(s) + 1) * 500} mL in all.`));
    },
    pressor: (s) => {
      if (!s.pulse) return null;
      if (has(s, 'pressor')) return { say: [['you', 'The norepinephrine is already running: titrated up to a MAP of 65.']], flags: ['pressor'] };
      return pressorEffect(s, given(s, 'Norepinephrine: start at 0.05 mcg/kg/min, titrate to a MAP of 65.', 'Norepinephrine running at 0.05 mcg/kg/min on a pump, through the right antecubital 18 G; titrating to a MAP of 65.'));
    },
    'push-epi': (s) => {
      // 10–20 mcg is a dose for a low pressure with a pulse: in the arrest it is not the 1 mg the algorithm calls for
      if (!s.pulse) return { say: [['you', 'Push-dose epinephrine, 10–20 mcg — a dose for a low pressure with a pulse. In cardiac arrest the dose is 1 mg.', 'warn']], flags: ['push-epi-arrest'] };
      const bp = bpAfter(s, 12, 6);
      const hr = Math.min(150, s.rhythm.hr + 6);
      return { say: [...given(s, 'Push-dose epinephrine 20 mcg IV.', 'Push-dose epinephrine 20 mcg IV, flushed.'), rateBp(hr, bp), [helper(s), 'That buys a few minutes: an infusion keeps it there.']], vitals: bp, rhythm: atRate(s, hr), flags: ['push-epi'] };
    },
    nitro: (s) => nitroCrash(s, false),
    'nitro-high': (s) => nitroCrash(s, true),
    // positive pressure in the chest pushes back against the blood trying to reach her squeezed right heart
    cpap: (s) => {
      if (!s.pulse || drained(s)) return null;
      const { bp, hr } = drop(s, 10, 6, 6);
      return {
        say: [['you', 'CPAP mask on at 5 cmH₂O.'], ...awake(s, '"I can\'t… I\'m blacking out — take it off!"'), rateBp(hr, bp, 'bad'), [helper(s), 'Her pressure dropped as soon as it went on, and her saturation did not move. Taking it off.', 'bad']],
        vitals: { ...bp, gcs: Math.min(s.vitals.gcs, 14) }, rhythm: atRate(s, hr), flags: ['cpap'],
      };
    },
    // before the drain the few breaths that get in drop her pressure; once it is off she simply pushes the mask away
    bvm: (s) => {
      if (!s.pulse || s.vitals.gcs <= 8 || drained(s)) return null;
      const { bp } = drop(s, 6, 4, 0);
      return { say: [['patient', 'She fights the mask, gasping: "Let me breathe!" — the few squeezes that got in turned her gray.', 'bad'], line('monitor', `BP ${bp.sbp}/${bp.dbp}.`, 'bad')], vitals: bp };
    },
    // the induction drug and positive-pressure ventilation take away the preload a squeezed heart lives on
    rsi: (s) => {
      if (!s.pulse || drained(s)) return null;
      const flags = ['airway', 'ventilated', 'sedation', 'rsi'];
      const tube: Line = ['you', 'Preoxygenated; induction drug and paralytic pushed; tube through the cords on the first pass; on the ventilator.'];
      if (!supported(s)) {
        const down = arrestEffect(s, 'As the ventilator starts, her pressure falls away — and now there is no pulse!');
        return { ...down, say: [tube, ...(down.say ?? [])], flags: [...flags, ...(down.flags ?? [])] };
      }
      const sbp = Math.min(s.vitals.sbp, 64);
      const dbp = Math.min(s.vitals.dbp, 50);
      return {
        say: [tube, line('monitor', `BP ${sbp}/${dbp}.`, 'bad'), [helper(s), 'Her pressure crashed as soon as the ventilator started — she is mottled.', 'bad']],
        vitals: { sbp, dbp, gcs: 3, rr: 16, spo2: Math.max(s.vitals.spo2, 96) }, flags: [...flags, 'crashing'],
      };
    },
    // the scanner is no place for a patient in shock: with nothing holding her pressure up, she arrests on the table
    'ct-urgent': (s) => {
      if (!s.pulse || drained(s)) return null;
      const ct = 'Radiology: a large pericardial effusion all around the heart, the right heart chambers flattened, contrast refluxing into the IVC and the hepatic veins; no pulmonary embolism; metastases in both lungs and the spine.';
      if (s.vitals.sbp < 90 && !supported(s)) {
        const down = arrestEffect(s, 'In the scanner, lying back for the contrast, she stops responding — not breathing normally! We\'re wheeling her back.');
        return { ...down, say: [['hospital', `${ct} The scan finished just as she went off.`], ...(down.say ?? [])], flags: ['ct', ...(down.flags ?? [])] };
      }
      const bp = bpAfter(s, -8, -4);
      return {
        say: [['team', 'Scanned and back: she could not lie flat on the table, and her pressure sagged the whole time.', 'warn'], line('monitor', `BP ${bp.sbp}/${bp.dbp}.`, 'bad'), ['hospital', ct]],
        vitals: bp, flags: ['ct'],
      };
    },
    // she cannot breathe lying down; the fluid bolus, not her legs, is how the team fills her heart
    'legs-up': (s) => {
      if (!s.pulse || drained(s)) return null;
      const spo2 = Math.max(80, s.vitals.spo2 - 3);
      return {
        say: [['you', 'Laid flat with her legs raised.'], ...awake(s, '"I can\'t breathe lying down!"'), [helper(s), 'Sitting her back up.'], line('monitor', `SpO₂ ${spo2}%.`)],
        vitals: { spo2 }, flags: ['legs-up'],
      };
    },
    fentanyl: (s) => sedativeDrop(s, 'Fentanyl 50 mcg IV.', 'Fentanyl 50 mcg IV.', ['analgesia']),
    midazolam: (s) => sedativeDrop(s, 'Midazolam 1 mg IV.', 'Midazolam 1 mg IV.', ['benzodiazepine', 'sedation']),
    'procedural-sedation': (s) => {
      if (!s.pulse || drained(s)) return null;
      const down = sedativeDrop(s, 'Etomidate 0.15 mg/kg IV.', 'Etomidate 0.15 mg/kg IV.', ['sedation', 'procedural-sedation']);
      return down && { ...down, vitals: { ...down.vitals, gcs: 9 } };
    },
    metoprolol: (s) => rateDrop(s, 'Metoprolol 5 mg IV', 18, 'beta-blocker'),
    diltiazem: (s) => rateDrop(s, 'Diltiazem IV', 18, 'diltiazem'),
    'amio-infusion': (s) => rateDrop(s, 'Amiodarone 150 mg over 10 minutes', 0, 'amiodarone'),
    procainamide: (s) => rateDrop(s, 'Procainamide at 30 mg/min', 0, 'procainamide'),
    // bearing down raises the pressure in her chest and cuts the blood coming back to the heart
    vagal: (s) => {
      if (!s.pulse || s.vitals.gcs < 13) return { blocked: true, say: [['system', 'A vagal maneuver needs an awake patient who can bear down.']] };
      const { bp } = drop(s, 6, 4, 0);
      return { say: [['you', 'Modified Valsalva: she bears down.'], [helper(s), 'She went gray for a moment — and the rate did not change.', 'bad'], line('monitor', `BP ${bp.sbp}/${bp.dbp}.`)], vitals: bp, flags: ['vagal'] };
    },
    // the ER doctor's bedside scan: the first one shows the real echo and asks what it shows
    pocus: (s) => {
      if (!s.pulse) return { say: [['you', 'Ultrasound during the 10-second pulse check: a large pericardial effusion, the heart barely moving inside it; compressions resume.']], flags: ['pocus'] };
      if (drained(s)) return null;
      if (!has(s, 'pocus')) {
        return {
          say: [['you', 'Bedside ultrasound: the apical four-chamber view is on the screen.'], ['you', SCAN_ALONGSIDE]],
          image: { id: 'pocus', view: 'Bedside ultrasound: apical four-chamber view', image: SCAN_IMAGE }, read: SCAN_READ, flags: ['pocus'],
        };
      }
      return { say: [['you', SCAN_WORDS]], flags: ['pocus'] };
    },
    // the ER doctor drains it at the bedside under ultrasound (in the arrest, at once, with or without the probe)
    pericardiocentesis: (s) => {
      if (drained(s)) return null;
      if (!s.pulse) {
        const how = has(s, 'pocus')
          ? 'Pericardiocentesis during the pulse check, under the probe: a long needle at the left parasternal window, aspirating as it goes — blood-stained fluid back; 300 mL off and a drain left in.'
          : 'Emergency pericardiocentesis without imaging: a long needle below the xiphoid, aimed at the left shoulder and aspirating as it goes — blood-stained fluid back; 300 mL off and a drain left in.';
        return drainEffect(s, [['you', how]]);
      }
      // with a pulse the needle goes in only under the physician's own ultrasound: the engine's rule asks for the scan first
      if (!has(s, 'pocus')) return null;
      return {
        ...drainEffect(s, [
          ['nurse', 'Pads on, below her right collarbone and on her left side, clear of your window; the crash cart is open, and the pressure cycling every 3 minutes.'],
          ['you', 'Ultrasound-guided pericardiocentesis: lidocaine to the skin; an 18 G needle in-plane under the probe at the left parasternal window, where the fluid is deepest and closest; dark, blood-stained fluid back, and agitated saline swirls in the sac — the needle is in the right place. A wire, then a pigtail drain left in: 650 mL off.'],
          ['nurse', 'A few extra beats as you went in — gone now. Fluid sent for cytology, a cell count and cultures.'],
        ]),
        flags: ['drained', 'pericardiocentesis', 'pads', 'monitor'],
      };
    },
    // cardiothoracic surgery: a window under general anesthesia is for an effusion that comes back, not a patient in shock
    'call-surgery': (s) => ({
      say: [['consultant', drained(s)
        ? 'Cardiothoracic surgery: "Thanks — we\'ll see her in the CCU. If the effusion comes back once the drain is out, we can make a pericardial window."'
        : 'Cardiothoracic surgery: "She\'s too sick for a general anesthetic right now — induction could arrest her. Drain it with the needle; we\'ll see her about a pericardial window if it comes back."']],
      flags: ['surgery-called'],
    }),
    admit: (s) => {
      if (!s.pulse) return null;
      return { say: [['hospital', 'The CCU accepts her under cardiology: a monitored bed, the drain output every hour, an echo in the morning.']], flags: ['dispo', 'admit'] };
    },
    // the Hs and Ts against what the team knows about her
    'hs-ts': (s) => ({
      say: [['you', s.pulse
        ? `Shock with distended neck veins and clear lungs is obstructive until proven otherwise. Tension pneumothorax: air moves on both sides and the trachea is midline${has(s, 'pocus') ? ', both lungs slide' : ''} — no. Pulmonary embolism: possible with cancer — but faint heart sounds, a pulse that fades on breathing in and small, alternating complexes point to fluid around the heart${has(s, 'pocus') ? ', and the scan shows it' : ''}. Hypovolemia adds to it: two days of hardly drinking. Tamponade fits best.`
        : 'Hs and Ts: tamponade fits best — metastatic cancer, full neck veins, faint heart sounds and a pulse that faded on breathing in before she arrested. CPR, epinephrine and fluid cannot fill a heart squeezed shut: drain it now.']],
      flags: ['hs-ts'],
    }),
  },
  events: [
    // ── the ER doctor's run: the computer nurse does the nursing ──
    {
      id: 'rn-setup',
      when: (s) => s.role === 7 && s.pulse && s.minute >= 1,
      effect: (s) => {
        const done: string[] = [];
        if (!has(s, 'monitor')) done.push('monitor on');
        if (!has(s, 'o2')) done.push('oxygen by nasal cannula at 4 liters');
        if (!has(s, 'iv')) done.push('two 18-gauge IVs, one in each arm');
        if (!has(s, 'labs')) done.push('labs drawn: CBC, chemistries, coags, type and screen, troponin, BNP and a lactate');
        const spo2 = Math.max(s.vitals.spo2, 94);
        return {
          say: [['nurse', done.length ? `${done.join('; ').replace(/^./, (c) => c.toUpperCase())}.` : 'Everything is on and drawn.'], line('monitor', `SpO₂ ${spo2}%.`)],
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

    // ── the ER nurse's run: the computer ED physician examines, decides, orders and drains ──
    {
      id: 'md-bedside',
      // not once he has run her arrest and drained it: he is already there. A call for help brings him in as well (the
      // department's call-help: the physician, the charge nurse and another nurse come into the room)
      when: (s) => s.role === 6 && s.pulse && !drained(s) && !has(s, 'md-arrest') && (has(s, 'physician-notified') || has(s, 'help') || s.minute >= MD_COMES_BY),
      effect: (s) => ({
        say: [has(s, 'physician-notified') || has(s, 'help')
          ? line('physician', 'Here. Keep going with what you\'re doing — I\'m going to scan her heart.')
          : line('physician', `The charge nurse sent me: her systolic is ${s.vitals.sbp} and she is gray. Next time call me the moment a patient like this rolls in. I'm going to scan her heart.`, 'warn')],
        flags: ['md-bedside'],
      }),
    },
    {
      id: 'md-scan',
      when: (s) => s.role === 6 && s.pulse && !drained(s) && has(s, 'md-bedside') && s.minute >= s.flags['md-bedside'] + SCAN_MINUTES,
      effect: (s) => ({
        say: [
          ['physician', 'Bedside ultrasound: a large effusion all the way around her heart, two and a half centimeters, and the heart swinging in it. The right atrium caves in with every beat and the right ventricle collapses as it tries to fill. The IVC is wide and doesn\'t move with breathing; the left ventricle squeezes hard; both lungs slide.'],
          // no line yet: his fluid order waits for one (RN_FLUID)
          ...(has(s, 'iv') ? [] : [line('physician', 'Get two large-bore lines in her now — she\'s going to need fluid.', 'warn')]),
        ],
        flags: ['md-scan', 'pocus'],
      }),
    },
    ...RN_ASKS.flatMap(askEvents),
    {
      // the needle goes in; it touches the heart, and the monitor shows it — the nurse calls it out
      id: 'md-needle',
      // he waits for a 12-lead she is recording to finish, so the tracing is hers to read, not the needle's extra beats
      when: (s) => s.role === 6 && s.pulse && !drained(s) && needleDue(s) && !['ecg12', 'ecg12-repeat'].includes(s.performed.at(-1)?.id ?? ''),
      effect: (s) => ({
        say: [
          ['physician', 'Local anesthetic in the skin. Needle in under the probe at the left parasternal window, aspirating as I go…'],
          ['monitor', 'Monitor alarm: early, wide beats as the needle advances.', 'warn'],
        ],
        rhythm: { profile: 'pvcs', hr: s.rhythm.hr }, flags: ['needle-in', 'needle-ectopy'],
      }),
    },
    {
      // pulled back a little, the needle is in the fluid: a wire, a pigtail drain, and the fluid comes off
      id: 'md-drain',
      when: (s) => s.role === 6 && s.pulse && has(s, 'needle-in') && !drained(s) && (has(s, 'ectopy-called') || s.minute >= s.flags['needle-ectopy'] + CALLOUT_WAIT),
      effect: (s) => drainEffect(s, [
        ...(has(s, 'ectopy-called') ? [] : [line('physician', 'Extra beats on the monitor — I\'m touching the heart. Pulling back… Call them out the moment you see them.', 'warn')]),
        ['physician', 'There — dark, blood-stained fluid. Wire in, pigtail drain in: 650 mL off. Send the fluid for cytology, a cell count and cultures.'],
      ]),
    },
    {
      // the computer physician decides where she goes once the fluid is off
      id: 'md-dispo',
      when: (s) => s.role === 6 && s.pulse && drained(s) && s.minute >= s.flags.drained + DISPO_AFTER,
      effect: (s) => physicianDispo(s, 'admit', 'Cardiology has accepted her to the CCU with the drain in: the output every hour and an echo in the morning. Stay with her until the CCU nurse comes for her.'),
    },
    {
      // the physician runs the code; the ER nurse compresses and gives the ACLS drugs
      id: 'md-arrest',
      when: (s) => s.role === 6 && !s.pulse,
      effect: () => ({
        say: [['physician', 'She has no pulse — start compressions! Pads on, epinephrine 1 mg. Her heart can\'t fill: I\'m going in with the needle now.', 'warn']],
        flags: ['md-arrest', 'physician-notified'],
      }),
    },
    {
      // the drain in the arrest: a needle under the xiphoid, during the compressions
      id: 'md-arrest-drain',
      when: (s) => s.role === 6 && !s.pulse && has(s, 'md-arrest')
        && (s.performed.some((p) => p.id === 'cpr' && p.minute >= s.flags.arrest) || s.minute >= s.flags.arrest + 2),
      effect: (s) => drainEffect(s, [['physician', 'Needle in below the xiphoid while you compress, aspirating as I go — blood-stained fluid back. 300 mL off, a drain left in. Stop compressions: pulse check.']]),
    },

    {
      // a short PEA arrest drained at once: she comes round over a few minutes (not with a tube in: she stays sedated)
      id: 'waking',
      when: (s) => s.pulse && drained(s) && has(s, 'rosc') && !has(s, 'airway') && s.vitals.gcs < 14 && s.minute >= s.flags.rosc + 4,
      effect: (s) => ({
        say: [[helper(s), 'She is waking up: eyes open, she knows where she is, and she squeezes both hands.', 'good']],
        vitals: { gcs: 14 },
      }),
    },

    // ── both runs: the effusion keeps building until it is drained ──
    {
      id: 'worse',
      when: (s) => s.pulse && !drained(s) && s.minute >= WORSE_AT,
      effect: (s) => {
        const bp = bpAfter(s, -10, -4);
        const hr = Math.min(150, s.rhythm.hr + 6);
        return {
          say: [[helper(s), 'She is going gray again and slower to answer; her pulse is barely there at the wrist.', 'bad'], rateBp(hr, bp, 'bad')],
          vitals: { ...bp, gcs: Math.min(s.vitals.gcs, 14), rr: Math.min(34, s.vitals.rr + 2), spo2: Math.max(80, s.vitals.spo2 - 1) },
          rhythm: atRate(s, hr), flags: ['worse'],
        };
      },
    },
    {
      // a heart that was never given fluid has nothing left to fill with: the pressure slides once more
      id: 'worse-dry',
      when: (s) => s.pulse && !drained(s) && !has(s, 'fluid') && s.minute >= WORSE_DRY_AT,
      effect: (s) => {
        const bp = bpAfter(s, -8, -4);
        return { say: [[helper(s), 'She is drifting off — I can hardly feel a pulse at her wrist.', 'bad'], line('monitor', `BP ${bp.sbp}/${bp.dbp}.`, 'bad')], vitals: { ...bp, gcs: Math.min(s.vitals.gcs, 13) }, flags: ['worse-dry'] };
      },
    },
    {
      id: 'crash',
      when: (s) => s.pulse && !drained(s) && !has(s, 'crashing') && s.minute >= CRASH_AT,
      effect: (s) => {
        const sbp = Math.max(ARREST_SBP, Math.min(s.vitals.sbp - 8, 68));
        const dbp = Math.max(40, Math.min(s.vitals.dbp - 6, sbp - 10, 56));
        const hr = Math.min(150, s.rhythm.hr + 6);
        return {
          say: [[helper(s), 'She is slumping in the bed — she only opens her eyes when I shout her name.', 'bad'], rateBp(hr, { sbp, dbp }, 'bad')],
          vitals: { sbp, dbp, gcs: 11, rr: 32, spo2: Math.max(80, s.vitals.spo2 - 3) }, rhythm: atRate(s, hr), flags: ['crashing'],
        };
      },
    },
    {
      // the heart can no longer fill: left undrained, or tipped over by something that took her last reserve of pressure
      id: 'arrest',
      when: (s) => s.pulse && !drained(s) && (s.vitals.sbp < ARREST_SBP || s.minute >= ARREST_AT),
      effect: (s) => arrestEffect(s, 'She\'s gone limp — not responding, not breathing normally!'),
    },
  ],
  critical: [
    // ── the ER nurse ──
    { id: 'rn-triage', label: 'Triage: ESI 1', roles: ED_RN, points: 5, done: ['triage'], target: { by: 3 }, why: 'A systolic of 84 with a pulse of 128 in a breathless patient who nearly fainted: she needs a life-saving intervention now — ESI 1, the resuscitation bay, and the physician to the bedside.' },
    {
      id: 'rn-monitor-o2', label: 'Monitor on and oxygen', roles: ED_RN, points: 10, target: { by: 4 },
      why: 'A low pressure, a fast rate and an SpO₂ of 91 %: the monitor and pulse oximetry at once, and oxygen by cannula or mask — not by positive pressure.',
      done: (s) => { const m = firstDone(s, ['monitor', 'pads']); const o = firstDone(s, ['o2-nc', 'o2-nrb']); return m === null || o === null ? null : Math.max(m, o); },
      uses: ['monitor', 'o2-nc', 'o2-nrb'],
    },
    {
      id: 'rn-pulsus', label: 'A manual blood pressure, listening as she breathes', roles: ED_RN, points: 10, done: ['vitals'], target: { by: 5 },
      why: 'Her pressure is 84/68: low, with a narrow pulse pressure. Only a manual cuff finds a pulsus paradoxus — the sounds that come and go with breathing: note where they first appear (only on breathing out) and where they are heard with every beat. A fall of more than 10 mmHg is abnormal; the NIBP cannot show it.',
    },
    {
      id: 'rn-assess', label: 'Look for the cause of the low pressure: neck veins, heart sounds and lungs', roles: ED_RN, points: 10, target: { by: 6 },
      why: 'A low pressure, distended neck veins and faint heart sounds are Beck\'s triad; with clear lungs and a pulse that fades on breathing in, the shock is obstructive — the heart cannot fill — not the wet lungs of a failing pump or the flat neck veins of blood loss. Report what you find.',
      done: (s) => { const p = firstDone(s, ['perfusion']); const l = firstDone(s, ['lungs']); return p === null || l === null ? null : Math.max(p, l); },
      uses: ['perfusion', 'lungs'],
    },
    {
      id: 'rn-notify', label: 'Get the ED physician to the bedside now (SBAR, or a call for help)', roles: ED_RN, points: 10, done: ['notify-physician', 'call-help'], target: { by: 5 },
      why: 'Shock is the physician\'s at once: call with the numbers and what you found (SBAR), and say you need them at the bedside now — or call for help and have them come — and do not finish all your own tasks first.',
    },
    { id: 'rn-iv', label: 'Two large-bore IVs', roles: ED_RN, points: 5, done: ['iv', 'io'], target: { by: 8 }, why: 'A patient in shock needs two 18 G lines (or larger): fluid runs fast through them, and a drip may follow. A port is no line for a fast bolus.' },
    { id: 'rn-labs', label: 'Labs: CBC, chemistries, coags, type and screen, troponin, BNP, lactate', roles: ED_RN, points: 5, done: ['labs'], target: { by: 10 }, why: 'The platelets and the coags before any procedure, a type and screen, a lactate for the shock, the troponin and BNP for the heart.' },
    { id: 'rn-ecg', label: '12-lead ECG within 10 minutes', roles: ED_RN, points: 10, done: ['ecg12'], target: { by: 10 }, why: 'Chest heaviness, breathlessness and a low pressure need a 12-lead within 10 minutes of arrival: it looks for a STEMI or an arrhythmia as the cause — and shows what the cause does to the tracing.' },
    { id: 'rn-history', label: 'SAMPLE history: her illnesses, medicines and blood thinners', roles: ED_RN, points: 5, done: ['sample'], target: { by: 12 }, why: 'What she has, and what she takes (blood thinners above all), changes what the physician does next: a cancer that has spread can cause shock in several ways, and two days of hardly drinking makes any of them worse.' },
    ...RN_ASKS.map(orderItem),
    {
      id: 'rn-report-worse', label: 'Report the falling pressure to the physician', roles: ED_RN, points: 5, uses: ['notify-physician'],
      // not scored when the drain (or the arrest) came before her 2 minutes to report it were up
      applies: (s) => has(s, 'worse') && (has(s, 'worse-reported') || !overtaken(s, 'worse', 2)), target: { within: { flag: 'worse', minutes: 2 } },
      done: (s) => s.flags['worse-reported'] ?? null,
      why: 'Speak up the moment a patient in shock slides (SBAR, closed loop): the pressure, the rate, how she looks and what you think she needs. The physician at the bedside, busy with the set-up, may not have seen it.',
    },
    {
      id: 'rn-callout', label: 'During the needle: call out the extra beats on the monitor', roles: ED_RN, points: 10, uses: ['notify-physician'],
      applies: (s) => has(s, 'needle-ectopy'), target: { within: { flag: 'needle-ectopy', minutes: 1 } },
      done: (s) => s.flags['ectopy-called'] ?? null,
      why: 'Extra beats as the needle advances mean it is touching the heart muscle: the physician, eyes on the ultrasound, pulls back a little. Watch the monitor and the pressure the whole time the needle is in, and say what you see at once.',
    },
    {
      id: 'rn-after-drain', label: 'After the drain: recheck the pressure', roles: ED_RN, points: 5,
      done: ['vitals', 'nibp', 'reassess'], after: 'drained', applies: (s) => has(s, 'drained'), target: { within: { flag: 'drained', minutes: 5 } },
      why: 'The pressure should come up as the fluid comes off: recheck it at once (by hand, for the pulsus), then every 15 minutes, with the drain output. A pressure that falls again, or a drain that stops, means the fluid is coming back — or bleeding.',
    },

    // ── the ER doctor ──
    {
      id: 'md-exam', label: 'Look for the cause of the low pressure: neck veins, heart sounds and lungs', roles: ED_MD, points: 10, target: { by: 5 },
      why: 'Distended neck veins, faint heart sounds and a low pressure are Beck\'s triad; with clear lungs and a pulse that fades on breathing in, the shock is obstructive — the heart cannot fill — not the wet lungs of a failing pump or the flat neck veins of blood loss.',
      done: (s) => { const p = firstDone(s, ['perfusion']); const l = firstDone(s, ['lungs']); return p === null || l === null ? null : Math.max(p, l); },
      uses: ['perfusion', 'lungs'],
    },
    {
      id: 'md-history', label: 'SAMPLE history: her illnesses and any blood thinners', roles: ED_MD, points: 5, target: { by: 10 }, uses: ['sample'],
      why: 'A cancer that has spread can cause shock in several ways, and two days of hardly drinking makes any of them worse. Ask about blood thinners before any procedure — in shock they do not stop one, but they change how it is done.',
      done: (s) => { const h = firstDone(s, ['sample']); const d = needleAt(s); return h !== null && (d === null || h < d) ? h : null; },
    },
    {
      id: 'md-pocus', label: 'Point-of-care ultrasound for the cause of the shock', roles: ED_MD, points: 15, done: ['pocus'], target: { by: 8 },
      why: 'Shock with full neck veins and clear lungs: the bedside scan tells the causes apart in minutes — what is around the heart and whether it squeezes the right heart, how each ventricle looks and squeezes, the IVC, the lungs, the aortic root. In a patient too unstable to travel, a clear answer on it is enough to act on.',
    },
    {
      // a bridge, not the treatment (5 points, not 10): a doctor who drains at once has not failed her
      id: 'md-fluid', label: 'A fluid bolus before the drain', roles: ED_MD, points: 5, target: { by: 10 }, uses: ['fluid'],
      why: 'A heart squeezed by fluid only puts out what fills it: a 500 mL bolus raises the output in about half of patients with tamponade — most of all those with a systolic under 100, like her — and leaves it unchanged or lower in the rest (Sagristà-Sauleda, Circulation 2008); she is also dry. One bolus while the tray is opened, then reassess: a bridge to the drain, not a treatment.',
      done: (s) => { const f = firstDone(s, ['fluid']); const d = needleAt(s); return f !== null && (d === null || f < d) ? f : null; },
    },
    {
      id: 'md-drain', label: 'Drain it now: ultrasound-guided pericardiocentesis at the bedside', roles: ED_MD, points: 20, done: ['pericardiocentesis'], target: { by: 14 },
      why: 'Tamponade with shock needs the fluid off now: only draining it fixes it. Under ultrasound, at the window where the fluid is deepest and closest to the skin (often left parasternal or apical; below the xiphoid is the classic one), with a pigtail drain left in. When the cardiologist can be there at once, or the patient is stable enough, it is done in the cath lab with echo and fluoroscopy — fluoroscopy helps in a malignant effusion — but a patient in shock is drained by whoever can do it first.',
    },
    {
      id: 'md-bridge', label: 'When the pressure falls again: a vasopressor bridge (or the drain)', roles: ED_MD, points: 10, uses: ['pressor', 'push-epi', 'pericardiocentesis'],
      applies: (s) => has(s, 'worse'), target: { within: { flag: 'worse', minutes: 5 } },
      why: 'The effusion keeps building, and fluid alone cannot keep up: norepinephrine or push-dose epinephrine holds the pressure for the minutes to the drain. It is a bridge, not a cure — her own adrenaline is already working flat out.',
      // an infusion started earlier is still running when she slides; a push-dose given earlier has worn off
      done: (s) => {
        const from = s.flags.worse;
        if (from === undefined) return null;
        if (s.performed.some((p) => p.id === 'pressor' && p.minute < from)) return from;
        return s.performed.find((p) => ['pressor', 'push-epi', 'pericardiocentesis'].includes(p.id) && p.minute >= from)?.minute ?? null;
      },
    },
    {
      id: 'md-consult', label: 'Consult cardiology (cardiothoracic surgery for a window if it comes back)', roles: ED_MD, points: 5, done: ['consult-cardiology', 'call-surgery'],
      why: 'Cardiology takes her to the CCU with the drain in: the output every hour, an echo in the morning, the drain left in until it puts out very little (a malignant effusion comes back less often with extended drainage), the fluid sent for cytology. Cardiothoracic surgery makes a pericardial window if it comes back.',
    },
    { id: 'md-admit', label: 'Admit her to the CCU', roles: ED_MD, points: 5, done: ['admit'], why: 'A fresh pericardial drain, a pressure just recovered and an effusion that can come back: the CCU, under cardiology, with oncology told.' },
    {
      id: 'md-arrest-drain', label: 'She arrests: drain the pericardium at once', roles: ED_MD, points: 15, uses: ['pericardiocentesis'],
      applies: (s) => has(s, 'arrest'), target: { within: { flag: 'arrest', minutes: 5 } },
      why: 'PEA in tamponade: CPR, epinephrine and fluid cannot fill a heart squeezed shut — tamponade is one of the Ts, and only the drain treats it. Under the probe during a pulse check if it is at hand, blind below the xiphoid if not.',
      done: (s) => (s.flags.arrest === undefined ? null : firstDone(s, ['pericardiocentesis'], 'arrest')),
    },

    // ── both: the arrest, if delay or a wrong step brings it, and the hand-off ──
    {
      id: 'arrest-cpr', label: 'She arrests: high-quality CPR at once', roles: ED_TEAM, points: 10, done: ['cpr'], after: 'arrest', target: { within: { flag: 'arrest', minutes: 1 } }, applies: (s) => has(s, 'arrest'),
      why: 'Unresponsive and not breathing normally: compressions at once, 100–120 a minute, 5–6 cm deep, full recoil, as few pauses as possible — while the cause is drained.',
    },
    { id: 'handoff', label: 'Hand-off to the CCU team', roles: ED_TEAM, points: 5, done: ['handoff'], why: 'The story, the low pressure with its narrow pulse pressure, Beck\'s triad and the pulsus, the 12-lead, the scan, what was given (the fluid, any vasopressor) and what was held (nitroglycerin, CPAP, sedation, a tube), the drain — how much came off and what it looked like — and the pressure since.' },
  ],
  harms: [
    {
      id: 'nitro-tamponade', actions: ['nitro', 'nitro-high'], roles: ED_TEAM, when: (s) => s.pulse && !drained(s), points: 15, severity: 'critical',
      // whatever her pressure: after a bolus her systolic can be over 90, and nitroglycerin is still wrong for her
      replaces: [...NITRATE_RULES, ...noOrder(['nitro-high'])],
      text: 'Nitroglycerin for a woman whose heart cannot fill. A vasodilator pools the blood in the veins, and a heart squeezed by fluid lives on the blood coming back to it: the pressure crashes. Vasodilators and diuretics are not recommended in tamponade (2015 ESC pericardial guideline) and can tip a large effusion into it. Her chest heaviness is the effusion, not a blocked artery — and the chest pain standing order excludes a systolic under 90 anyway.',
    },
    {
      // after the drain the crash is gone, but there is still nothing for it to treat. Like the one above, it stands in for the
      // built-in nitrate rules, which its words cover: one dose, one penalty. The nurse's 0.4 mg needs no order; her 0.8 mg is
      // the rule below
      id: 'nitro-no-indication', actions: ['nitro', 'nitro-high'], roles: ED_TEAM, when: (s, _sc, id) => s.pulse && drained(s) && (s.role !== 6 || id === 'nitro'),
      points: 3, severity: 'minor', replaces: [...NITRATE_RULES, ...noOrder(['nitro-high'])],
      text: 'Nitroglycerin with nothing to treat. Her chest heaviness was the effusion, now drained: nitroglycerin is for coronary ischemia (and 0.8 mg, which no standing order covers, for hypertensive pulmonary edema), and here it only takes preload from a heart that has just started to fill again.',
    },
    {
      // the nurse's 0.8 mg also stands for the missing order, at the order's weight, and says so
      id: 'nitro-no-indication-rn', actions: ['nitro-high'], roles: ED_RN, when: (s) => s.pulse && drained(s), points: 5, severity: 'major',
      replaces: [...NITRATE_RULES, ...noOrder(['nitro-high'])],
      text: 'High-dose nitroglycerin with no order, and nothing to treat. Her chest heaviness was the tamponade, now drained: nitroglycerin is for coronary ischemia, and 0.8 mg — for hypertensive pulmonary edema — is on no standing order. Here it only takes preload from a heart that has just started to fill again. Tell the physician what you see instead.',
    },
    {
      id: 'cpap-tamponade', actions: ['cpap'], roles: ED_TEAM, when: (s) => s.pulse && !drained(s), points: 8, severity: 'major',
      text: 'CPAP for a patient in tamponade. Positive pressure in the chest pushes back against the blood returning to her already squeezed right heart: the output falls, and it can bring on PEA. Her breathlessness comes from a heart that cannot fill, not wet lungs (they are clear): oxygen by cannula or mask, sitting up.',
    },
    {
      id: 'bvm-breathing', actions: ['bvm'], roles: ED_TEAM, when: (s) => s.pulse && s.vitals.gcs > 8, points: 5, severity: 'major',
      text: 'Bag-mask breaths for a patient who is breathing on her own. She fights the mask, and every squeeze that gets in raises the pressure in her chest and cuts the blood returning to her heart — the blood a heart squeezed by fluid lives on. Oxygen by mask; if breaths must ever be given, small and gentle ones.',
    },
    {
      id: 'intubation-tamponade', actions: ['rsi'], roles: ED_MD, when: (s) => s.pulse && !drained(s), points: 15, severity: 'critical',
      replaces: ['rsi-unresuscitated', 'rsi-no-indication'],
      text: 'Intubating a patient in tamponade before the drain. The induction drug takes away the adrenaline holding her vessels tight, and positive-pressure ventilation cuts the blood returning to a heart that cannot fill: the pressure collapses, and she can arrest around the tube (Spodick, N Engl J Med 2003). Oxygen by mask holds her; drain the fluid first. If a tube cannot wait, have the needle ready, the vasopressor running, a reduced dose of a stable induction drug and small breaths with little PEEP.',
    },
    {
      // after the drain: the built-in rule's indication test, in this case's place (the one above replaces it)
      id: 'rsi-no-indication', actions: ['rsi'], roles: ED_MD, points: 10, severity: 'major',
      when: (s) => s.pulse && drained(s) && s.vitals.gcs >= 13 && s.vitals.spo2 >= 92 && s.vitals.rr >= 10 && s.vitals.rr <= 30 && s.vitals.sbp >= 90,
      text: 'Rapid sequence intubation without an indication. Once the fluid is off she is awake, breathing comfortably with a normal oxygen saturation and pressure: a tube brings only its risks — a failed airway, aspiration, a falling pressure and the ventilator.',
    },
    {
      id: 'ct-before-drain', actions: ['ct-urgent'], roles: ED_MD, when: (s) => s.pulse && !drained(s), points: 10, severity: 'major', replaces: ['ct-unstable'],
      text: 'Sending her to the CT scanner before the drain. A patient in tamponade with shock can arrest on the table, flat on her back, far from the resuscitation bay — and the bedside ultrasound has already shown the effusion squeezing her right heart. Drain it here first; a CT can wait until she is stable.',
    },
    {
      id: 'rate-slowing-tamponade', actions: ['metoprolol', 'diltiazem'], roles: ED_MD, when: (s) => s.pulse && !drained(s), points: 15, severity: 'critical',
      text: 'A drug to slow her heart. Her sinus tachycardia is compensation: while the effusion squeezes her heart, the fast rate is the only thing keeping her output up as each beat fills so little — a beta-blocker or diltiazem takes it away and drops the pressure, and can stop her heart. A sinus tachycardia in shock is never the problem to treat.',
    },
    {
      id: 'rate-slowing-tamponade-rn', actions: ['metoprolol', 'diltiazem'], roles: ED_RN, when: (s) => s.pulse && !drained(s), points: 15, severity: 'critical',
      replaces: noOrder(['metoprolol', 'diltiazem']),
      text: 'A drug to slow her heart, with no order. Her sinus tachycardia is compensation — while the effusion squeezes her heart, the fast rate is the only thing keeping her output up: a beta-blocker or diltiazem drops the pressure and can stop her heart — and neither is on a standing order. Tell the physician what you see instead.',
    },
    {
      // once the fluid is off the heart fills again: still wrong, no longer a collapse (for the nurse it also stands for the order)
      id: 'rate-slowing-after-drain', actions: ['metoprolol', 'diltiazem'], roles: ED_TEAM, when: (s) => s.pulse && drained(s), points: 8, severity: 'major',
      replaces: noOrder(['metoprolol', 'diltiazem']),
      text: 'A drug to slow her heart just after the drain. The sinus tachycardia that kept her alive is settling by itself as her heart fills again; a beta-blocker or diltiazem only drops the pressure of a heart just freed from tamponade, and with an effusion that can come back. A sinus tachycardia after shock is never the problem to treat — and neither drug is given without a physician\'s order.',
    },
    {
      id: 'antiarrhythmic-tamponade', actions: ['amio-infusion', 'procainamide', 'lidocaine'], roles: ED_MD, when: (s) => s.pulse, points: 8, severity: 'major', replaces: ['procainamide-hypotension'],
      text: 'An antiarrhythmic for a sinus tachycardia (or for the extra beats a needle sets off). There is no arrhythmia to convert — the fast rate is her compensation, and extra beats with the needle in mean pull it back: amiodarone and procainamide drop a pressure that has little in reserve, and lidocaine treats nothing she has.',
    },
    {
      id: 'antiarrhythmic-tamponade-rn', actions: ['amio-infusion', 'procainamide', 'lidocaine'], roles: ED_RN, when: (s) => s.pulse, points: 8, severity: 'major',
      replaces: [...noOrder(['amio-infusion', 'procainamide', 'lidocaine']), 'procainamide-hypotension'],
      text: 'An antiarrhythmic with no order, for a sinus tachycardia or the extra beats a needle sets off. The fast rate is her compensation; extra beats with the needle in mean the physician pulls back — call them out. Amiodarone and procainamide drop a pressure that has little in reserve, lidocaine treats nothing she has, and with a pulse none of them is on a standing order.',
    },
    {
      id: 'adenosine-sinus', actions: ['adenosine6', 'adenosine12'], roles: ED_MD, when: (s) => s.pulse, points: 3, severity: 'minor',
      text: 'Adenosine for a sinus tachycardia. It only stops a rhythm whose circuit runs through the AV node: this one comes from the sinus node, driven by shock, and the pause it brings does nothing for her.',
    },
    {
      // the nurse's version also stands for the missing order, at the order's weight (one mistake, one penalty)
      id: 'adenosine-sinus-rn', actions: ['adenosine6', 'adenosine12'], roles: ED_RN, when: (s) => s.pulse, points: 5, severity: 'major', replaces: noOrder(['adenosine6', 'adenosine12']),
      text: 'Adenosine with no order, for a sinus tachycardia. It only stops a rhythm whose circuit runs through the AV node: this one comes from the sinus node, driven by shock, and the pause it brings does nothing for her — and with a pulse it is on no standing order.',
    },
    {
      id: 'sedative-tamponade', actions: ['midazolam', 'fentanyl'], roles: ED_MD, when: (s) => s.pulse && !drained(s), points: 5, severity: 'major', replaces: SEDATIVE_RULES,
      text: 'An opioid or a sedative in obstructive shock. Her distress is the effusion, not pain that needs an opioid, and her own adrenaline is what keeps her vessels tight and her pressure up: an opioid or a sedative blunts it and slows her breathing. The needle needs only local anesthetic.',
    },
    {
      id: 'sedation-tamponade', actions: ['procedural-sedation'], roles: ED_MD, when: (s) => s.pulse, points: 8, severity: 'major', replaces: ['sedation-no-procedure'],
      text: 'Procedural sedation for this patient. A pericardiocentesis is done awake, with local anesthetic: sedation takes away the adrenaline holding her pressure up and can arrest her before the needle is in — and once the fluid is off there is nothing left to sedate for.',
    },
    {
      id: 'sedative-tamponade-rn', actions: ['midazolam', 'fentanyl'], roles: ED_RN, when: (s) => s.pulse, points: 5, severity: 'major',
      replaces: [...SEDATIVE_RULES, ...noOrder(['midazolam', 'fentanyl'])],
      text: 'Midazolam or fentanyl with no order. Before the drain her distress is the effusion, and her own adrenaline is what holds her pressure up: a sedative or an opioid blunts it and slows her breathing. Reassure her, keep her sitting up — and tell the physician if you think she needs more.',
    },
    {
      id: 'legs-up-orthopnea', actions: ['legs-up'], roles: ED_TEAM, when: (s) => s.pulse && !drained(s), points: 2, severity: 'minor',
      text: 'Laying her flat with her legs up. She cannot breathe lying down: let her sit up, leaning forward, as she wants to. The fluid bolus is the way to fill her heart.',
    },
    {
      id: 'vagal-tamponade', actions: ['vagal'], roles: ED_TEAM, when: (s) => s.pulse, points: 2, severity: 'minor',
      text: 'A vagal maneuver for a sinus tachycardia in shock. Bearing down raises the pressure in her chest and cuts the blood returning to a heart that cannot fill, and there is no reentry circuit to break.',
    },
    {
      id: 'antithrombotic-tamponade', actions: ['heparin', 'p2y12'], roles: ED_MD, points: 8, severity: 'major',
      text: 'An anticoagulant or antiplatelet loading dose for a patient with a large, blood-stained effusion and a needle going into her pericardium (or a fresh drain in it). There is no acute coronary syndrome to treat: it only adds bleeding into the sac and from the needle track.',
    },
    {
      id: 'antithrombotic-tamponade-rn', actions: ['heparin', 'p2y12'], roles: ED_RN, points: 8, severity: 'major', replaces: [...noOrder(['heparin', 'p2y12']), ...ANTITHROMBOTIC_RULES],
      text: 'Heparin or a P2Y12 loading dose with no order, for a patient with a large effusion and a needle going into her pericardium (or a fresh drain in it). Neither is on the chest pain standing order, and there is no coronary syndrome to treat: it only adds bleeding into the sac.',
    },
    {
      id: 'lytic-tamponade', actions: ['tnk', 'alteplase'], roles: ED_TEAM, points: 15, severity: 'critical', replaces: [...LYTIC_RULES, ...noOrder(['alteplase'])],
      text: 'A fibrinolytic for a patient with a large pericardial effusion. There is no STEMI and no pulmonary embolism to dissolve: a lytic can turn the effusion into a hemorrhage around the heart, and the needle track into a bleed.',
    },
    {
      // before anyone knows the cause, aspirin on the chest pain standing order is no mistake; once the effusion is seen it treats nothing
      id: 'aspirin-tamponade', actions: ['aspirin'], roles: ED_TEAM, when: (s) => has(s, 'pocus') || has(s, 'md-scan') || has(s, 'ct'), points: 2, severity: 'minor',
      text: 'Aspirin once the cause is known to be fluid around the heart. Her chest heaviness is the effusion, not a coronary: aspirin treats nothing she has, and with a needle going into her pericardium (or a drain in it) it only adds bleeding.',
    },
    {
      // the bolus another nurse hung on the physician's order counts toward the three
      id: 'fluid-overload-tamponade', actions: ['fluid'], roles: ED_TEAM, when: (s) => s.pulse && !drained(s) && boluses(s) >= 2, points: 3, severity: 'minor',
      text: 'A third fluid bolus. The first 500 mL fills a dry, squeezed heart a little; after that, more volume only raises the pressure in the sac and the neck veins. Reassess after each bolus — the drain is the treatment.',
    },
    {
      id: 'epi-im-no-anaphylaxis', actions: ['epi-im'], roles: ED_TEAM, when: (s) => s.pulse, points: 3, severity: 'minor',
      text: 'IM epinephrine without anaphylaxis. 0.3–0.5 mg in the thigh is the anaphylaxis dose; for a low pressure in shock, push-dose epinephrine or an infusion IV, which can be titrated — on the physician\'s order.',
    },
    {
      id: 'transfer-tamponade', actions: ['transfer'], roles: ED_MD, when: (s) => s.pulse && drained(s), points: 3, severity: 'minor',
      text: 'Transferring her out of a hospital that has everything she needs — cardiology, a CCU, cardiothoracic surgery and her oncologists. A transport only adds risk to a patient with a fresh pericardial drain: admit her.',
    },
    {
      // the main mistake has to cost something real: sending her on undrained, wherever to
      id: 'dispo-undrained', actions: ['admit', 'transfer'], roles: ED_MD, when: (s) => s.pulse && !drained(s), points: 10, severity: 'major',
      text: 'Sending her out of the department with the fluid still on. Tamponade with shock is drained where she is, now: she can arrest in the elevator, in the CCU before anyone is ready, or in an ambulance far from a needle — and the cardiologist is tied up for the next 45 minutes.',
    },
    {
      // one penalty for the drug that has no place in PEA: for the nurse it also stands for the missing order of those that
      // need one even in an arrest (lidocaine and the arrest dose of amiodarone are the code leader's, with no order)
      id: 'antiarrhythmic-pea', actions: ['amio-arrest', 'amio-infusion', 'lidocaine', 'procainamide', 'adenosine6', 'adenosine12', 'metoprolol', 'diltiazem'],
      roles: ED_TEAM, when: (s) => !s.pulse, points: 3, severity: 'minor',
      replaces: ['procainamide-in-arrest', ...noOrder(['amio-infusion', 'adenosine6', 'adenosine12', 'procainamide', 'metoprolol', 'diltiazem'])],
      text: 'A rate or rhythm drug in PEA. Amiodarone and lidocaine are for VF or pulseless VT that shocks have not fixed; the others are for tachycardias with a pulse. CPR, epinephrine and the cause — here the fluid around the heart, and the needle to drain it.',
    },
  ],
  timings: [
    DOOR_TO_ECG,
    { label: 'Bedside ultrasound', actions: ['pocus'], flag: 'pocus' },
    // the nurse's runs: the physician's fallback counts as the team's time
    { label: 'Fluid bolus', actions: ['fluid'], flag: 'fluid', target: 12 },
    { label: 'Arrival to the drain', actions: ['pericardiocentesis'], flag: 'drained' },
    { label: 'CPR after the arrest', actions: ['cpr'], target: 1, from: 'arrest' },
  ],
  teaching: [
    'Cardiac tamponade is fluid in the sac around the heart under enough pressure to stop the chambers filling — obstructive shock. A slow effusion (cancer, kidney failure, hypothyroidism, after pericarditis or radiation) can stretch the sac to a liter or more before it tips over; dehydration, vasodilators and IV diuretics can tip it (Adler et al., Nat Rev Dis Primers 2023). Lung and breast cancer and lymphoma are the commonest causes of a malignant effusion.',
    'Beck\'s triad: a low pressure (with a narrow pulse pressure), distended neck veins and faint, distant heart sounds — often incomplete. Add a fast rate, breathlessness and orthopnea with clear lungs, and a pulsus paradoxus: a fall of more than 10 mmHg in systolic pressure as she breathes in, found with a manual cuff (where the sounds first appear, only on breathing out, and where they are heard with every beat).',
    'The 12-lead: sinus tachycardia, low voltage and electrical alternans — QRS complexes that alternate in height as the heart swings in a large effusion. No ST elevation: no STEMI behind the chest heaviness (a 12-lead without one does not rule out a coronary cause on its own, but here the scan finds the real one).',
    'Shock with full neck veins and clear lungs means the right heart cannot fill or empty: tamponade, a tension pneumothorax, a massive pulmonary embolism (cancer raises its risk too) — or a right ventricular infarct. The bedside ultrasound tells them apart: a large effusion with the right atrium caving in during systole and the right ventricle collapsing in early diastole, and a wide IVC that does not narrow with breathing, is tamponade.',
    'Keep the blood coming back to the heart: let her sit up as she wants to, oxygen by cannula or mask, and a 500 mL fluid bolus, then reassess — it raises the output in about half of patients with tamponade, mostly those with a systolic under 100, leaves it unchanged or lower in the rest, and raises the pressure in the sac too (Sagristà-Sauleda et al., Circulation 2008). More volume is no substitute for the drain. A vasopressor (norepinephrine, or push-dose epinephrine) is a bridge when the pressure keeps falling.',
    'Hold what takes away preload or drive: nitroglycerin and other vasodilators, diuretics (both not recommended in tamponade: 2015 ESC), sedatives and opioids, and any drug that slows the heart — the tachycardia is the compensation. Positive pressure (CPAP, bagging a patient who breathes, intubation) cuts the blood returning to the right heart: induction and the ventilator can arrest her (Spodick, N Engl J Med 2003). Drain first; if a tube cannot wait, the needle ready and the vasopressor running.',
    'Do not send a patient in tamponade with shock to the CT scanner: she cannot lie flat, she can arrest on the table, and the bedside ultrasound already has the answer.',
    'Only draining the fluid fixes it. Tamponade with shock is drained now by whoever can do it first: in the emergency department, the physician\'s ultrasound-guided pericardiocentesis at the window where the fluid is deepest and closest to the skin, with a pigtail drain left in. In a patient stable enough to wait, cardiology drains it in the cath lab with echo and fluoroscopy (which helps in a malignant effusion); a surgical window is for an effusion that comes back or a loculated one, and surgery comes first for blood from a torn aorta, a chest wound or a ruptured heart, or bleeding a needle cannot control.',
    'After the drain: the pressure comes up at once and the pulsus goes. Leave the drain in until it puts out very little (extended drainage makes a malignant effusion less likely to come back), send the fluid for cytology, a cell count and cultures, and admit to the CCU under cardiology, with oncology and cardiothoracic surgery told.',
    'Tamponade is one of the Ts of PEA: narrow, fast complexes with no pulse favor a mechanical cause. CPR, epinephrine and fluid cannot fill a heart squeezed shut — the arrest needs a drain, at once: under the probe during a pulse check, or blind below the xiphoid.',
    'The ER nurse: ESI 1, the monitor and oxygen, a manual pressure for the pulsus, the neck veins, heart sounds and lungs, the physician to the bedside with SBAR, two large-bore lines and labs, the 12-lead within 10 minutes — then the bolus and the vasopressor on the physician\'s order, the pads on and the crash cart open before the needle, the monitor watched and the extra beats called out while it is in, and the pressure rechecked once the fluid is off. Never nitroglycerin from the chest pain standing order for a systolic under 90.',
  ],
};
