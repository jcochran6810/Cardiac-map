import type { Effect, Line, Scenario, SimState, Speaker } from '../types';
import { PADS, allOf, bpAfter, firstDone, has, line, orderedFlag, paced } from '../kit';
import { askCritical, askEvents, type LabAsk } from '../labKit';
import { DOOR_TO_ECG, ED_MD, ED_RN, edNurse, physicianDispo } from '../edKit';
import { INTERVENTION_BY_ID } from '../interventions';
import { LIDOCAINE_RULES, RATE_RULES, yieldToHeavier } from '../rules/rhythm';

/**
 * Complete heart block in the emergency department. A 78-year-old woman comes in by a basic (BLS) ambulance after two
 * faints: a slow, wide escape at 34, a systolic in the low 80s, confused. Under it: an old bundle branch block that has
 * gone on to complete block, a beta-blocker, and three days of vomiting and diarrhea on lisinopril and spironolactone
 * with kidneys that cannot keep up — a potassium of 6.9 (the BRASH picture: bradycardia, renal failure, AV-nodal
 * blockade, shock, hyperkalemia). The rate is fixed with the pacer, the potassium with calcium and insulin, and the
 * block itself, which very likely outlasts both, with a transvenous wire tonight and a permanent pacemaker tomorrow.
 *
 * The ER nurse (6) receives her, calls the physician, puts the pads on, gets the line, the 12-lead and the labs, gives
 * atropine, the analgesia and the potassium drugs on the computer physician's orders, paces on the physician's direction,
 * confirms capture with a pulse and a pressure — and reports the critical potassium at once. The ER doctor (7) has a
 * computer nurse for the monitor, the pads, the line and the 12-lead, and makes every decision: atropine or straight to
 * pacing, the analgesia, the potassium, the wire, cardiology and the CCU.
 */

/** The escape rate an epinephrine infusion brings her to (it speeds the escape a little; it does not pace) */
const PRESSOR_RATE = 44;

/** Pacing (or an infusion) never lowers a pressure that is already higher */
const atLeast = (s: SimState, sbp: number, dbp: number) => ({ sbp: Math.max(s.vitals.sbp, sbp), dbp: Math.max(s.vitals.dbp, dbp) });

/** Who notices a change beside the learner: the computer nurse in the doctor's run, a colleague in the nurse's */
const teammate = (s: SimState): Speaker => (s.role === 7 ? 'nurse' : 'team');

/** The transcutaneous pacer is driving the heart now (not the wire, and not only firing) */
const tcpActive = (s: SimState) => s.rhythm.profile === 'tcp';

/** Something has been given for the potassium: calcium (minutes), insulin with dextrose or high-dose albuterol (a shift) */
const kTreated = (s: SimState) => has(s, 'calcium') || has(s, 'insulin') || has(s, 'albuterol-hyperk');

/**
 * Left untreated, the potassium (and the acidosis with it) has raised the pacing threshold: a pacer fires but only now and
 * then brings a beat, whether through the pads or a wire, until calcium is given
 */
const thresholdHigh = (s: SimState) => has(s, 'k-rising') && !kTreated(s);

/** The minute the potassium became a problem the learner must treat: the result, or the pacer failing without one */
const kNeeded = (s: SimState) => has(s, 'k-known') || has(s, 'k-rising') || has(s, 'calcium');

/**
 * The potassium was left until it stopped the pacer: the pacer failed (k-rising) and the result had not been in for long
 * enough to treat it before (it was never measured, or it was known and left). Calcium given only then is no longer the
 * calcium "at once" the doctor's item asks for
 */
const kLeftToFail = (s: SimState) => {
  if (!has(s, 'k-rising')) return false;
  const known = s.flags['k-known'];
  // only a result that came in during the last few minutes before the pacer failed had no time to be treated
  return known === undefined || known > s.flags['k-rising'] || known <= s.flags['k-rising'] - 4;
};

/** A critical potassium the nurse has not passed on to the physician yet */
const kPending = (s: SimState) => has(s, 'k-known') && !has(s, 'k-reported');

/**
 * When the blood for the bedside potassium was drawn: the nurse draws it herself in her run; in the doctor's run the
 * computer nurse draws it with the IV, once the doctor has ordered it
 */
const drawnAt = (s: SimState): number | undefined => {
  if (!has(s, 'labs')) return undefined;
  if (s.role !== 7) return s.flags.labs;
  return has(s, 'iv') ? Math.max(s.flags.labs, s.flags.iv) : undefined;
};

/** A pulse felt at the paced rate, and a pressure: mechanical capture (the screen only shows electrical capture) */
const PULSE_FELT = ['pulse-check', 'vitals'];
const PRESSURE_TAKEN = ['nibp', 'vitals', 'bp-both-arms', 'reassess'];
const confirmedAfter = (s: SimState, flag: string) => allOf(firstDone(s, PULSE_FELT, flag), firstDone(s, PRESSURE_TAKEN, flag));
const captureConfirmed = (s: SimState) => has(s, 'tcp') && confirmedAfter(s, 'tcp') !== null;

/**
 * Minutes before the pacer goes on that a fentanyl dose still counts as analgesia for it: 25 mcg IV acts within a minute
 * or two and lasts 30–60 minutes, so a dose given while the pads were readied is on board when the pacer starts
 */
const PREMEDICATION = 10;

/** The learner's first fentanyl dose that covers the pacing (from just before the pacer, or after it), or undefined */
function pacingDose(s: SimState, on: number) {
  return s.performed.find((p) => p.id === 'fentanyl' && p.minute >= on - PREMEDICATION);
}

/**
 * The minute she got analgesia for the pacing: fentanyl from just before the pacer went on (a dose to start with is good
 * care too) — counted from the moment pacing began, so an early dose is on time
 */
function analgesiaFor(s: SimState): number | null {
  const on = s.flags.tcp;
  if (on === undefined) return null;
  const dose = pacingDose(s, on);
  return dose ? Math.max(dose.minute, on) : null;
}

/**
 * The pacer goes on (`on`: the minute it is running): wide beats at 70 after every spike, a pressure back, and pain — less
 * of it when fentanyl went in while the pads were readied
 */
function paceOn(s: SimState, on: number, lead: Line[] = []): Effect {
  if (thresholdHigh(s)) {
    // the potassium has pushed the threshold beyond what the pads can reach: spikes, and only now and then a beat
    return {
      say: [...lead, ['monitor', 'Pacer on: rate 70, output turned all the way up to 140 mA.'], line(edNurse(s), `Spikes march across the screen at 70, but only an occasional one brings a beat: femoral pulse ${s.rhythm.hr}.`, 'bad')],
      flags: ['pads', 'monitor', 'tcp', 'lost-capture'],
    };
  }
  const premedicated = pacingDose(s, on) !== undefined;
  return {
    say: [...lead, ['monitor', 'Pacer on: rate 70, output turned up to 90 mA.'], premedicated
      ? ['patient', 'She winces with each thump: "I can feel it… but I can bear it."']
      : ['patient', '"Ow! What is that? It thumps right through me!"', 'bad']],
    rhythm: { profile: 'tcp', hr: 70 }, vitals: { ...atLeast(s, 98, 58), gcs: 15, pain: premedicated ? 3 : 7 },
    flags: ['pads', 'monitor', 'paced', 'tcp', ...(premedicated ? ['analgesia'] : [])],
  };
}

/** The transvenous wire floated through the right internal jugular sheath (`who` places it) */
function wireIn(s: SimState, who: Speaker): Effect {
  const flags = ['temp-wire', 'wire-in', 'central', 'venous', 'iv'];
  if (thresholdHigh(s)) {
    return {
      say: [[who, 'Balloon-tipped pacing wire floated through the introducer sheath to the right ventricle — but even at the full 20 mA only an occasional spike brings a beat: the threshold is far too high.', 'bad']],
      flags: [...flags, 'lost-capture'],
    };
  }
  const bp = atLeast(s, 100, 62);
  const standby = has(s, 'tcp') ? ' The transcutaneous pacer goes to standby; the pads stay on as a backup.' : '';
  return {
    say: [
      [who, `Balloon-tipped pacing wire floated through the introducer sheath, ECG-guided, to the right ventricular apex: threshold 0.8 mA; pacing at 70, output 3 mA.${standby}`],
      // the physician who places it checks it; in the nurse's run the nurse checks it herself
      ...(who === 'you' ? [line('you', 'Femoral pulse 70 with every paced beat.', 'good')] : []),
      ['monitor', `Heart rate 70. BP ${bp.sbp}/${bp.dbp}.`],
    ],
    rhythm: { profile: 'paced', hr: 70 }, vitals: { ...bp, gcs: 15, pain: Math.min(s.vitals.pain, 1) }, flags: [...flags, 'paced'],
  };
}

/** Calcium chloride 1 g, or calcium gluconate 3 g (the same calcium, gentler on a peripheral vein): either answers */
const CALCIUMS = ['calcium-chloride', 'calcium-gluconate'];

/** Calcium: the membrane steadied within minutes — a pacer whose threshold had climbed brings every beat again */
function calcium(s: SimState, who: Speaker, gluconate = false): Effect {
  const given = line(who, gluconate ? 'Calcium gluconate 3 g IV over 5–10 minutes; the line flushed.' : 'Calcium chloride 1 g IV, in slowly over a few minutes; the line flushed.');
  const burns: Line[] = s.vitals.gcs >= 13 && !gluconate ? [['patient', '"That burns going up my arm."']] : [];
  if (has(s, 'lost-capture')) {
    const bp = atLeast(s, 96, 58);
    return {
      say: [given, line(edNurse(s), 'Within a minute every spike brings a beat again: femoral pulse 70.', 'good'), ['monitor', `Heart rate 70. BP ${bp.sbp}/${bp.dbp}.`]],
      rhythm: { profile: has(s, 'wire-in') ? 'paced' : 'tcp', hr: 70 }, vitals: { ...bp, gcs: 14 }, flags: ['calcium', 'paced'], clear: ['lost-capture'],
    };
  }
  // her own slow beats come a little faster once the potassium's hold on the conduction eases; a pacer keeps its rate. With
  // the epinephrine infusion running, the escape the potassium had slowed comes back to the rate the infusion gave it
  if (!paced(s) && s.rhythm.profile === 'third-degree-avb') {
    const onPressor = has(s, 'pressor');
    const hr = Math.max(s.rhythm.hr, onPressor ? PRESSOR_RATE : Math.min(38, s.rhythm.hr + 4));
    const bp = onPressor ? atLeast(s, 90, 54) : null;
    return {
      say: [given, ...burns, ['monitor', bp ? `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.` : `Heart rate ${hr}.`]],
      rhythm: { profile: 'third-degree-avb', hr }, ...(bp ? { vitals: { ...bp, gcs: Math.max(s.vitals.gcs, 13) } } : {}), flags: ['calcium'],
    };
  }
  return { say: [given, ...burns], flags: ['calcium'] };
}

/**
 * Insulin with dextrose: the potassium shifts into the cells over 15–30 minutes (dextrose first, so a delay cannot leave
 * insulin alone). Her kidneys clear insulin slowly and she has never had it: the glucose is checked at 30 minutes and then
 * every hour (ACEP)
 */
function insulin(s: SimState, who: Speaker): Effect {
  const slow: Line[] = has(s, 'lost-capture')
    ? [line(edNurse(s), 'It takes 15 to 30 minutes to bring the potassium down: the pacer still brings only an occasional beat.', 'warn')]
    : [];
  return { say: [[who, 'Dextrose 25 g (D50 50 mL), then regular insulin 10 units IV — the dose double-checked; glucose rechecked at 30 minutes, then every hour.'], ...slow], flags: ['insulin'] };
}

/** A drug that suppresses the escape: the only thing keeping her alive slows to 22 — unless a pacer holds the rate */
function suppressed(s: SimState, drug: string): Effect {
  if (paced(s)) {
    const bp = bpAfter(s, -8, -4);
    return { say: [[edNurse(s), `${drug} in.`], ['monitor', `The paced rate stays at 70; BP ${bp.sbp}/${bp.dbp}.`, 'bad']], vitals: bp };
  }
  const v = s.vitals;
  return {
    say: [[edNurse(s), `${drug} in.`], ['monitor', 'Heart rate falls to 22!', 'bad'], ['patient', 'She stops answering and her eyes roll back.', 'bad']],
    rhythm: { profile: 'third-degree-avb', hr: 22 }, vitals: { sbp: Math.min(v.sbp, 58), dbp: Math.min(v.dbp, 32), gcs: Math.min(v.gcs, 9) },
  };
}

/** Beta- and calcium-channel blockers deepen the block — and, paced, still weaken the squeeze and drop the pressure */
function blocker(s: SimState, drug: string): Effect {
  if (!paced(s)) return suppressed(s, drug);
  const bp = bpAfter(s, -14, -8);
  return { say: [[edNurse(s), `${drug} in.`], ['monitor', `The paced rate stays at 70, but the BP falls to ${bp.sbp}/${bp.dbp}.`, 'bad']], vitals: bp };
}

// ─── The ED physician's orders, in the ER nurse's run ──────────────────────

/** The physician is at the bedside (called by the nurse, or come on their own) */
const mdHere = (s: SimState) => has(s, 'md-present');

/** What the physician sees on walking in, and what they still need from the nurse (the pads, a line) */
function mdSees(s: SimState): string {
  if (tcpActive(s)) return 'She is paced at 70 already.';
  const confused = s.vitals.gcs < 15 ? ' and confused' : '';
  const needs = [!has(s, 'pads') && 'pads on her', !has(s, 'iv') && 'a line'].filter((x): x is string => !!x);
  const want = needs.length ? ` I want ${needs.join(' and ')}, now.` : '';
  return `A heart rate of ${s.rhythm.hr}, ${s.vitals.sbp} systolic${confused}.${want}`;
}

// each order is given only while it still has something to do: not for a drug the nurse has already given (that is scored
// as given without an order), and not for atropine once she is paced
const ATROPINE: LabAsk = {
  id: 'atropine', role: 6, speaker: 'physician',
  when: (s) => mdHere(s) && has(s, 'iv') && !has(s, 'atropine') && !has(s, 'tcp') && !has(s, 'paced') && !has(s, 'pressor'),
  ask: 'Atropine 1 mg IV now, please — and keep the pacer ready.',
  accept: ['atropine'],
  thanks: 'Thank you. Watch the rate.',
  fallback: 'I will push the atropine myself — we cannot wait.',
  fallbackEffect: () => ({ say: [['monitor', 'No change in heart rate.']], flags: ['atropine'] }),
  gives: 'atropine-given',
  // one dose: a second needs a second order
  doses: 1,
  label: 'Atropine 1 mg on the physician\'s order',
  why: 'One dose of atropine is first-line for unstable bradycardia (2025 AHA) while the pacer is readied. With a slow, wide escape below the AV node it rarely works — and when it does not, pacing comes next, not more atropine.',
};

const ANALGESIA: LabAsk = {
  id: 'analgesia', role: 6, speaker: 'physician',
  // an IV order: it waits for the line
  when: (s) => tcpActive(s) && has(s, 'iv') && !has(s, 'analgesia') && (has(s, 'analgesia-requested') || s.minute >= s.flags.tcp + 4),
  ask: 'Fentanyl 25 micrograms IV for the pacing pain, and again in 5 minutes if she needs it; midazolam 0.5 to 1 mg if she is still distressed.',
  accept: ['fentanyl'],
  thanks: 'Good. Keep an eye on her pressure and her breathing.',
  fallback: 'She is in agony — I will give the fentanyl myself.',
  fallbackEffect: () => ({ say: [['patient', '"That\'s easier…"']], vitals: { pain: 2 }, flags: ['analgesia'] }),
  gives: 'analgesia-given',
  // the dose and the one repeat the order allows
  doses: 2,
  label: 'Fentanyl for the pacing, on the order',
  why: 'Transcutaneous pacing hurts with every beat: a small opioid dose, repeated as needed and titrated to the pressure.',
  wait: 3,
};

/** The physician knows the potassium is high: the nurse's report, the screen, or the pacer failing on it */
const kWithMd = (s: SimState) => mdHere(s) && (has(s, 'k-reported') || has(s, 'k-md-found') || has(s, 'k-rising'));

const CALCIUM: LabAsk = {
  id: 'calcium', role: 6, speaker: 'physician',
  when: (s) => kWithMd(s) && !has(s, 'calcium'),
  ask: 'Calcium chloride 1 gram IV, slowly over a few minutes — now.',
  // calcium gluconate 3 g is the same calcium (what a peripheral line takes more kindly)
  accept: CALCIUMS,
  thanks: 'Thank you. That buys us time while the potassium comes down.',
  fallback: 'I will push the calcium myself.',
  fallbackEffect: (s) => calcium(s, 'physician'),
  gives: 'calcium-given',
  doses: 1,
  label: 'Calcium on the physician\'s order',
  why: 'A potassium of 6.9 with a conduction block: IV calcium steadies the heart\'s membranes within minutes and lasts 30–60 minutes, while the potassium is brought down.',
};

const SHIFT: LabAsk = {
  id: 'shift', role: 6, speaker: 'physician',
  when: (s) => kWithMd(s) && !has(s, 'insulin'),
  ask: 'Then dextrose 25 grams and regular insulin 10 units IV, and her glucose at 30 minutes and every hour after. Hold her metoprolol, lisinopril and spironolactone.',
  accept: ['insulin-dextrose'],
  thanks: 'Thank you.',
  fallback: 'I will give the dextrose and insulin myself.',
  fallbackEffect: (s) => insulin(s, 'physician'),
  gives: 'shift-given',
  label: 'Insulin with dextrose on the physician\'s order',
  why: 'Insulin moves potassium into the cells within 15–30 minutes; the dextrose goes first so she never has insulin without it.',
  wait: 4,
  // ordered with the calcium, to follow it: the calcium goes in over a few minutes first
  within: 4,
};

export const edHeartBlock: Scenario = {
  id: 'complete-heart-block-ed',
  title: 'Two faints before breakfast',
  summary: '78-year-old woman brought in after fainting twice, with a pulse in the 30s, a low pressure and confusion. Get the rate up safely — and find out why it fell.',
  setting: 'ed',
  roles: [6, 7],
  difficulty: 'advanced',
  conditionId: 'third-degree-av-block',
  briefing: {
    default: [
      ['team', 'Resus 2: a basic ambulance crew is bringing in a 78-year-old woman who fainted twice at home this morning — a pulse in the 30s.'],
    ],
    6: [
      ['team', 'Charge nurse: "Resus 2 is yours: a basic ambulance crew is bringing in a 78-year-old woman who fainted twice at home this morning — a pulse in the 30s. The ED physician is in resus 1 with a trauma; call when you need them."'],
      ['ems', 'The crew wheels her in: pale, eyes half-closed, asking where she is.'],
    ],
    7: [
      ['team', 'Resus 2: a basic ambulance crew is bringing in a 78-year-old woman who fainted twice at home this morning — a pulse in the 30s. Her nurse is at the bedside with you.'],
      ['ems', 'The crew wheels her in: pale, eyes half-closed, asking where she is.'],
    ],
  },
  initial: {
    rhythm: { profile: 'third-degree-avb', hr: 34 },
    vitals: { sbp: 82, dbp: 46, spo2: 94, rr: 18, etco2: 34, pain: 0, gcs: 14, glucose: 118, temp: 36.6 },
  },
  // BRASH: the potassium, kidneys failing on top of stage 3 disease (creatinine 2.6, 1.2 last spring: KDIGO stage 2) and
  // the acidosis that comes with them (the analyzer's bicarbonate 17: KDIGO 2020 allows bicarbonate for it)
  problems: ['hyperkalemia', 'renal-failure', 'metabolic-acidosis'],
  facts: {
    ems: 'EMS: "78-year-old woman, fainted twice this morning — her daughter found her on the kitchen floor the second time; both times she came round within a minute. Pulse 32 to 36 on our oximeter the whole way, BP 80 over 48, confused about the date and where she is. No chest pain, no trouble breathing. Three days of vomiting and diarrhea, the daughter says. Two liters of oxygen; no IV — we are a basic unit, and the paramedics were 20 minutes out, so we came straight here: 8 minutes. Her pill bottles are in this bag."',
    opqrst: '"No pain. I just went dizzy and gray, and then I was on the floor — twice. I\'ve felt so weak since this stomach bug."',
    pde5: '"No."',
    lungs: 'Clear on both sides.',
    perfusion: (s) => (paced(s)
      ? 'Color coming back; hands warmer; capillary refill 2–3 seconds; femoral pulses at 70.'
      : 'Pale, with cool hands; dry mouth and skin that tents; capillary refill 4 seconds. Irregular cannon waves in the neck veins; no leg swelling.'),
    neuro: (s) => (s.vitals.gcs >= 15
      ? 'Awake and oriented now; moves everything; no facial droop or slurred speech.'
      : 'Confused about the date and the place, but follows commands; moves everything; no facial droop or slurred speech.'),
    ecg12: (s) => {
      if (s.rhythm.profile === 'tcp') return 'Transcutaneous pacing at 70: every spike is followed by a wide QRS and a T wave — electrical capture. Mechanical capture is checked at the femoral pulse and with a pressure.';
      if (s.rhythm.profile === 'paced') return 'Ventricular pacing at 70 from the transvenous wire: a spike before every wide QRS.';
      return `Complete heart block: P waves at about 75/min march through at their own rate; a regular, wide escape at ${s.rhythm.hr}/min has no relationship to them. A wide escape comes from below the AV node — slow, unreliable, and unlikely to answer to atropine. No ST elevation in II, III or aVF: no inferior STEMI behind the block. A normal-looking T wave does not rule out a high potassium: measure it.`;
    },
    cxr: (s) => (has(s, 'wire-in')
      ? 'Portable chest X-ray: the pacing wire runs from the right internal jugular sheath down to the right ventricular apex; no pneumothorax; normal heart size; clear lungs.'
      : 'Portable chest X-ray: normal heart size, clear lungs, no edema.'),
    pocus: (s) => (has(s, 'wire-in')
      ? 'Bedside ultrasound: the wire tip sits in the right ventricle; no pericardial effusion; the lungs slide on both sides (no pneumothorax).'
      : 'Bedside ultrasound: the left ventricle squeezes well; no pericardial effusion; the right ventricle normal in size; the IVC is small and collapses with each breath — she is dry; the lungs slide, with A-lines.'),
    consult: (s) => {
      if (!has(s, 'ecg12')) return 'Cardiology: "Send me the 12-lead and her potassium, and call me back."';
      if (!has(s, 'k-known')) return 'Cardiology: "With an old bundle branch block, a block like this rarely goes away: she will most likely need a permanent pacemaker. But what is her potassium? On lisinopril and spironolactone, with three days of vomiting and diarrhea, I want it before anything else — call me back with it, and keep the rate up."';
      // a reversible cause is treated first (2018 ACC/AHA/HRS); the block that stays once it is gone gets the pacemaker
      // what holds her rate until then: the wire already in, or one floated now (the pads hurt and can fail; an infusion is
      // no bridge to tomorrow)
      const wire = 'please float a transvenous wire through a right internal jugular sheath now (keep the left side free for the permanent device).';
      const bridge = has(s, 'wire-in')
        ? 'The transvenous wire you have in will hold her until then.'
        : has(s, 'tcp') ? `Transcutaneous pacing will not hold her for hours: ${wire}`
          : has(s, 'pressor') ? `An infusion will not hold her for hours: ${wire}`
            : `Get her rate up now — pace her — and then ${wire}`;
      return `Cardiology: "Treat the potassium and hold her metoprolol, lisinopril and spironolactone. With her old bundle branch block this block is very unlikely to go away once the potassium is normal and the metoprolol has worn off: if it is still there tomorrow, she gets a permanent pacemaker. ${bridge} Admit her to the CCU; I'll see her there."`;
    },
  },
  status: (s) => {
    if (has(s, 'lost-capture')) return 'Gray and barely answering.';
    if (s.rhythm.profile === 'paced') return '"I feel much better — and that thumping has stopped."';
    if (tcpActive(s)) return has(s, 'analgesia') ? '"That\'s better. I can think again."' : '"Ow — every thump goes right through me! Make it stop!"';
    if (s.vitals.gcs < 13) return 'Barely responding.';
    if (has(s, 'pressor')) return '"A bit less dizzy…"';
    return '"I feel like I\'m going to black out again."';
  },
  respond: {
    // front and back: the pacing pads many protocols prefer (front and side works too)
    pads: (s) => (has(s, 'pads')
      ? { blocked: true, say: [['system', 'The pads are already on her, front and back.']] }
      : { say: [['you', 'Pads on: front and back (anterior–posterior), connected to the monitor-defibrillator; the pacer is ready.']], flags: ['pads', 'monitor', 'pads-ap'] }),
    // in the doctor's run the nurse has already done these
    monitor: (s) => (has(s, 'monitor') ? { blocked: true, say: [['system', 'She is already on the monitor.']] } : null),
    iv: (s) => (has(s, 'iv') ? { blocked: true, say: [['system', s.role === 7 ? 'The nurse already has a line in.' : 'She already has a line in.']] } : null),
    sample: () => ({
      say: [
        ['patient', '"My pills? The heart one, the water one, the pressure one… I take them all, every day — even with this stomach bug."'],
        ['you', 'From her pill bottles, and her daughter on the phone: metoprolol tartrate 25 mg twice a day, lisinopril 20 mg, spironolactone 25 mg, atorvastatin and aspirin 81 mg. No digoxin, no diltiazem or verapamil. No allergies. High blood pressure, kidney disease (stage 3), and a "bundle branch block" on her ECG last spring that her cardiologist was watching; no pacemaker. Three days of vomiting and diarrhea, eating and drinking almost nothing — and still taking every pill.'],
      ],
      flags: ['sample'],
    }),
    // blood for a fast potassium on the bedside analyzer, the rest to the lab (no digoxin level: she takes none)
    labs: (s) => ({
      say: [['you', s.role === 7
        ? 'Labs ordered: a venous gas with a potassium on the bedside analyzer now, then a chemistry panel, magnesium, CBC and a troponin.'
        : 'Blood drawn: a venous gas with a potassium on the bedside analyzer, and a chemistry panel, magnesium, CBC and troponin to the lab.']],
      flags: ['labs'],
    }),
    // the escape sits below the AV node: blocking the vagus does nothing for it
    atropine: (s) => (s.pulse && !paced(s) ? { say: [[edNurse(s), 'Atropine 1 mg IV, pushed and flushed.'], ['monitor', 'No change in heart rate.']], flags: ['atropine'] } : null),
    // the pacer runs once the action is done (it takes a minute)
    pace: (s) => (s.pulse && !paced(s) && s.rhythm.hr < 50 ? paceOn(s, s.minute + INTERVENTION_BY_ID.pace.minutes) : null),
    'pulse-check': (s) => {
      if (has(s, 'lost-capture')) return { say: [['you', `Femoral pulse ${s.rhythm.hr} — the pacer fires at 70, but most spikes bring no beat.`, 'bad']] };
      if (tcpActive(s)) return { say: [['you', 'On the screen a wide complex follows every spike; in the groin, a femoral pulse at 70 with each one — mechanical capture. (The groin, not the neck: the pacer\'s muscle twitch can feel like a carotid pulse.)', 'good']] };
      if (s.rhythm.profile === 'paced') return { say: [['you', 'Femoral pulse 70 with every paced beat.', 'good']] };
      return null;
    },
    fentanyl: (s) => {
      if (!s.pulse) return null;
      // the pads thumping her chest — capturing, or firing at full output on a raised threshold — is what it treats
      if (tcpActive(s) || (has(s, 'lost-capture') && !has(s, 'wire-in'))) {
        return { say: [[edNurse(s), 'Fentanyl 25 mcg IV.'], ['patient', '"That\'s easier — thank you."', 'good']], vitals: { pain: 2 }, flags: ['analgesia'] };
      }
      // before the pacer starts there is no pacing pain yet: the dose is on board when it does (paceOn), not analgesia for
      // a pacer that may come much later
      if (!has(s, 'tcp')) {
        const rr = Math.min(s.vitals.rr, Math.max(10, s.vitals.rr - 1));
        return { say: [[edNurse(s), 'Fentanyl 25 mcg IV.'], ...(s.vitals.gcs >= 13 ? [['patient', '"I feel a bit floaty."'] as Line] : [])], vitals: { rr } };
      }
      return null;
    },
    // a single deep dose wears off in minutes; hours of pacing need analgesia that lasts
    'procedural-sedation': (s) => {
      if (!tcpActive(s)) return null;
      const bp = bpAfter(s, -8, -4);
      return {
        say: [
          ['you', 'Etomidate 0.15 mg/kg IV: she sleeps through the pacer for a few minutes — then wakes with it still thumping.'],
          ['monitor', `BP ${bp.sbp}/${bp.dbp}.`],
          ['team', 'Pacing goes on for hours: she needs analgesia that lasts — fentanyl in small doses, with a little midazolam if she is distressed.', 'warn'],
        ],
        vitals: bp, flags: ['sedation', 'procedural-sedation'],
      };
    },
    'calcium-chloride': (s) => (s.pulse ? calcium(s, edNurse(s)) : null),
    'calcium-gluconate': (s) => (s.pulse ? calcium(s, edNurse(s), true) : null),
    'insulin-dextrose': (s) => insulin(s, edNurse(s)),
    // epinephrine (or dopamine) speeds the escape a little and squeezes harder: a bridge, not the answer
    pressor: (s) => {
      if (!s.pulse || paced(s)) return null;
      const bp = atLeast(s, 94, 56);
      const hr = Math.max(s.rhythm.hr, PRESSOR_RATE);
      return {
        say: [[edNurse(s), 'Epinephrine infusion started at 2 micrograms a minute, titrating up.'], ['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`]],
        rhythm: { profile: 'third-degree-avb', hr }, vitals: { ...bp, gcs: 15 }, flags: ['pressor'],
      };
    },
    // the ventricular escape is all that keeps her alive: lidocaine, amiodarone and procainamide suppress it
    lidocaine: (s) => suppressed(s, 'Lidocaine'),
    'amio-infusion': (s) => suppressed(s, 'Amiodarone'),
    'amio-arrest': (s) => (s.pulse ? suppressed(s, 'Amiodarone 300 mg') : null),
    procainamide: (s) => suppressed(s, 'Procainamide'),
    metoprolol: (s) => blocker(s, 'Metoprolol 5 mg'),
    esmolol: (s) => blocker(s, 'Esmolol'),
    labetalol: (s) => blocker(s, 'Labetalol 20 mg'),
    diltiazem: (s) => blocker(s, 'Diltiazem'),
    // the AV node already conducts nothing: adenosine has nothing to treat, and in a heart this sick it can suppress the
    // escape for seconds; a pacer's hold on the ventricles it does not touch
    adenosine3: (s) => (paced(s) ? { say: [['monitor', 'No change: the pacer keeps the heart rate at 70.']] } : { say: [['monitor', 'Four seconds with no QRS complexes… then beats return at 30.', 'bad']], rhythm: { profile: 'third-degree-avb', hr: 30 } }),
    adenosine6: (s) => (paced(s) ? { say: [['monitor', 'No change: the pacer keeps the heart rate at 70.']] } : { say: [['monitor', 'Six seconds with no QRS complexes… then beats return at 30.', 'bad']], rhythm: { profile: 'third-degree-avb', hr: 30 } }),
    adenosine12: (s) => (paced(s) ? { say: [['monitor', 'No change: the pacer keeps the heart rate at 70.']] } : { say: [['monitor', 'Eight seconds with no QRS complexes… then beats return at 30.', 'bad']], rhythm: { profile: 'third-degree-avb', hr: 30 } }),
    // her metoprolol dose is an everyday one: glucagon (for an overdose, and in BRASH only when the rest fails) does nothing
    // for the rate here, and she vomits. Not scored: it is a listed rescue in BRASH, but it is no answer to this rate
    glucagon: (s) => ({
      say: [[edNurse(s), 'Glucagon 5 mg IV over 3 minutes.'], ['patient', '"I\'m going to be sick…" — and vomits.', 'bad'], ['monitor', 'No change in heart rate.']],
      vitals: { glucose: s.vitals.glucose + 30 }, flags: ['glucagon'],
    }),
    'temp-wire': (s) => (has(s, 'venous') && s.pulse ? wireIn(s, 'you') : null),
    // this hospital has cardiology, a CCU and pacemaker implants: nothing to transfer her for
    transfer: () => ({ blocked: true, say: [['system', 'Not needed: this hospital has cardiology on call, a CCU and pacemaker implants. Consult cardiology and admit her — moving a pacer-dependent patient between hospitals only adds risk.']] }),
    admit: (s) => (s.pulse ? { say: [['hospital', 'The CCU accepts her: a monitored bed with a nurse who can manage the pacing wire is being readied.']], flags: ['dispo', 'admit'] } : null),
    // the nurse's report brings the physician, and each report gets the physician's answer to what it says (the call that
    // brings them carries the same report: the pacing, a potassium in hand, the pain)
    'notify-physician': (s) => {
      const said: Line[] = [];
      const flags = ['physician-notified'];
      if (!mdHere(s)) {
        said.push(['physician', `The ED physician comes straight over: "Thank you for calling. ${mdSees(s)}"`]);
        flags.push('md-present');
      }
      if (tcpActive(s) && !captureConfirmed(s)) said.push(['physician', 'Is it really capturing? The screen can fool you — feel a femoral pulse and get me a pressure.', 'warn']);
      else if (tcpActive(s) && !has(s, 'capture-reported')) {
        said.push(['physician', `A pulse at 70 with the pacer, and ${s.vitals.sbp} systolic — good.`]);
        flags.push('capture-reported');
      }
      if (kPending(s)) {
        // reported late, or after the physician found it, it still reaches them: the review scores the delay
        said.push(['physician', has(s, 'k-md-found')
          ? 'Yes — I saw the 6.9. A critical value comes to me the moment you have it.'
          : s.minute <= s.flags['k-known'] + 3
            ? '6.9 — with this rhythm. Thank you for telling me straight away.'
            : '6.9 — with this rhythm. Thank you; a critical value comes to me the moment you have it.']);
        flags.push('k-reported');
      }
      if (tcpActive(s) && !has(s, 'analgesia') && !has(s, 'analgesia-requested')) {
        said.push(['physician', 'Pacing hurts — I\'ll order something for it.']);
        flags.push('analgesia-requested');
      }
      if (!said.length) said.push(['physician', 'Thanks — keep watching her, and tell me the moment anything changes.']);
      return { say: said, flags };
    },
  },
  events: [
    // ─── Both runs ───────────────────────────────────────────────────────
    {
      // left slow, the escape slows further and the pressure falls
      id: 'worse',
      when: (s) => s.minute >= 10 && !has(s, 'paced') && !has(s, 'pressor') && s.rhythm.profile === 'third-degree-avb',
      effect: (s) => {
        const hr = Math.min(s.rhythm.hr, 28);
        const sbp = Math.min(s.vitals.sbp, 68);
        const dbp = Math.min(s.vitals.dbp, 38);
        return {
          say: [[teammate(s), 'She is getting harder to rouse.', 'bad'], ['monitor', `Heart rate ${hr}. BP ${sbp}/${dbp}.`, 'bad']],
          rhythm: { profile: 'third-degree-avb', hr }, vitals: { sbp, dbp, gcs: Math.min(s.vitals.gcs, 12) },
        };
      },
    },
    {
      // the bedside analyzer: the fast potassium, two and a half minutes after the blood is drawn
      id: 'k-result',
      when: (s) => drawnAt(s) !== undefined && s.minute >= drawnAt(s)! + 2.5,
      effect: (s) => ({
        say: [[edNurse(s), 'Bedside analyzer: potassium 6.9 — a critical value. Creatinine 2.6 (1.2 last spring), BUN 58, bicarbonate 17, glucose 118, ionized calcium normal.', 'warn']],
        flags: ['k-known'],
      }),
    },
    {
      id: 'lab-rest',
      when: (s) => has(s, 'labs') && s.minute >= s.flags.labs + 15,
      // a troponin below the 99th percentile: no infarct behind the block (a repeat in 1–3 hours all the same)
      effect: () => ({ say: [['hospital', 'Lab: magnesium 2.3 mg/dL, hemoglobin 12.6 g/dL, high-sensitivity troponin 8 ng/L (below the 99th percentile).']] }),
    },
    {
      // paced and in pain: she says so, loudly
      id: 'pain',
      when: (s) => tcpActive(s) && !has(s, 'analgesia') && s.minute >= s.flags.tcp + 3,
      effect: () => ({ say: [['patient', '"Ow — every thump goes right through my chest! Take it off!" She reaches for the pads.', 'bad']] }),
    },
    {
      // the potassium left untreated: the pacing threshold climbs, and a pacer that held her stops bringing beats
      id: 'k-rising',
      when: (s) => s.minute >= 24 && !kTreated(s),
      effect: (s) => {
        const pacing = has(s, 'tcp') || has(s, 'wire-in');
        const hr = pacing ? 28 : Math.min(s.rhythm.hr, 26);
        const who = teammate(s);
        // above 7 the pacing threshold climbs (Barold and Herweg, Europace 2014): a repeat gas shows it has gone on rising
        const hint: Line = has(s, 'k-known')
          ? [who, 'A repeat gas: potassium 7.4 — and nothing has been given for it yet.', 'warn']
          : [who, s.role === 7 ? 'Should I run a potassium? She is on spironolactone and lisinopril, and three days of vomiting…' : 'Has anyone checked a potassium on her?', 'warn'];
        return {
          say: [
            ['monitor', 'Monitor alarm.', 'bad'],
            [who, pacing
              ? `The pacer is still firing at 70 — but her femoral pulse is down to ${hr}, and she is gray and barely answering.`
              : `Her pulse is down to ${hr}, and she is gray and barely answering.`, 'bad'],
            hint,
          ],
          rhythm: { profile: 'third-degree-avb', hr },
          vitals: { sbp: Math.min(s.vitals.sbp, 66), dbp: Math.min(s.vitals.dbp, 36), gcs: Math.min(s.vitals.gcs, 11) },
          flags: ['k-rising', ...(pacing ? ['lost-capture'] : [])],
        };
      },
    },

    // ─── The ER nurse's run: the ED physician ──────────────────────────────
    {
      // not called: the physician sees her on the central monitor
      id: 'md-arrives',
      when: (s) => s.role === 6 && !mdHere(s) && s.minute >= 5,
      effect: (s) => ({
        say: [['physician', `The ED physician hurries in: "I saw her on the central monitor. Why wasn't I called? ${mdSees(s)}"`, 'warn']],
        flags: ['md-present', 'md-not-called'],
      }),
    },
    {
      // the nurse paced before giving the atropine ordered: the pacer has made it pointless, and the physician cancels it
      id: 'atropine-moot',
      when: (s) => s.role === 6 && has(s, 'asked-atropine') && !has(s, 'atropine-given') && has(s, 'tcp'),
      effect: () => ({ say: [['physician', 'She is paced — leave the atropine.']], flags: ['atropine-given', 'atropine-moot'] }),
    },
    ...askEvents(ATROPINE),
    {
      // atropine has done nothing (or there is still no line to give it): the physician directs pacing
      id: 'md-pace',
      when: (s) => s.role === 6 && mdHere(s) && !has(s, 'paced') && !has(s, 'tcp') && (has(s, 'atropine') || s.minute >= s.flags['md-present'] + 6),
      effect: (s) => ({
        say: [['physician', has(s, 'atropine')
          ? 'No change with the atropine. Pace her: rate 70, and turn the output up until every spike is followed by a beat on the screen.'
          : 'Still no line, and we are not waiting for one: pace her — rate 70, output up until every spike is followed by a beat on the screen.']],
        flags: ['asked-pace'],
      }),
    },
    {
      id: 'md-pace-fallback',
      when: (s) => s.role === 6 && has(s, 'asked-pace') && !has(s, 'tcp') && s.minute >= s.flags['asked-pace'] + 3,
      effect: (s) => paceOn(s, s.minute, [['physician', 'I\'ll start the pacer myself.', 'warn']]),
    },
    ...askEvents(ANALGESIA),
    {
      // the analgesia order allows a little midazolam too, if she is still distressed
      id: 'md-midazolam-prn',
      when: (s) => s.role === 6 && has(s, 'asked-analgesia'),
      effect: () => ({ flags: [orderedFlag('midazolam')] }),
    },
    {
      // no blood sent yet: the physician asks for it
      id: 'md-labs',
      when: (s) => s.role === 6 && mdHere(s) && !has(s, 'labs') && s.minute >= s.flags['md-present'] + 8,
      effect: () => ({ say: [['physician', 'Has any blood gone off? I want a potassium on her — she is on spironolactone and lisinopril.', 'warn']] }),
    },
    {
      // the critical value not passed on: the physician finds it on the screen
      id: 'k-md-found',
      when: (s) => s.role === 6 && mdHere(s) && has(s, 'k-known') && !has(s, 'k-reported') && s.minute >= s.flags['k-known'] + 5,
      effect: () => ({
        say: [['physician', 'I just saw her potassium on the screen — 6.9. A critical value comes to me the moment you have it, please.', 'warn']],
        flags: ['k-md-found'],
      }),
    },
    ...askEvents(CALCIUM),
    ...askEvents(SHIFT),
    {
      // the rate is held and the potassium treated (or it has waited long enough): the physician places the wire
      id: 'md-wire',
      when: (s) => s.role === 6 && mdHere(s) && (has(s, 'paced') || has(s, 'pressor')) && (kTreated(s) || s.minute >= 20),
      effect: () => ({
        say: [['physician', 'She will need pacing for hours. I\'ve spoken to cardiology: with her old bundle branch block they expect her to need the pacer still once the potassium is normal and the metoprolol has worn off, and then she gets a permanent pacemaker — tomorrow. I\'m placing a right internal jugular sheath and floating a transvenous wire now: keep the pads on and the pacer running until the wire takes over.']],
        flags: ['md-wire', 'consult'],
      }),
    },
    {
      id: 'md-wire-in',
      when: (s) => s.role === 6 && has(s, 'md-wire') && s.minute >= s.flags['md-wire'] + 11,
      effect: (s) => wireIn(s, 'physician'),
    },
    {
      id: 'md-dispo',
      when: (s) => s.role === 6 && has(s, 'wire-in') && s.minute >= s.flags['wire-in'] + 0.5,
      effect: (s) => physicianDispo(s, 'admit', 'Cardiology accepts her to the CCU: hold her metoprolol, lisinopril and spironolactone, recheck the potassium in an hour, and a permanent pacemaker tomorrow if she still needs the pacer. Give report to the CCU nurse when they are ready for her.'),
    },

    // ─── The ER doctor's run: the ED nurse ─────────────────────────────────
    {
      id: 'rn-pads',
      when: (s) => s.role === 7 && s.minute >= 0.5 && !has(s, 'pads'),
      effect: (s) => ({
        say: [['nurse', 'Monitor on, and pacing pads on her — front and back, so the pacer is ready if you want it.'], ['monitor', `Monitor attached: heart rate ${s.rhythm.hr}.`]],
        flags: ['pads', 'monitor', 'pads-ap'],
      }),
    },
    {
      // the nurse's 12-lead: the engine asks the doctor to read it (a doctor who paced first gets the paced tracing: the
      // block is still on the monitor strip, and the department's door-to-ECG time is kept)
      id: 'rn-ecg',
      when: (s) => s.role === 7 && s.minute >= 2 && !has(s, 'ecg12'),
      effect: () => ({ say: [['nurse', '12-lead done — it is on the screen.']], flags: ['ecg12', 'monitor'] }),
    },
    {
      id: 'rn-iv',
      when: (s) => s.role === 7 && s.minute >= 3 && !has(s, 'iv'),
      // a large vein for the calcium chloride; the left arm, as the permanent pacemaker usually goes on the left
      effect: (s) => ({
        say: [['nurse', has(s, 'labs')
          ? 'IV in: 18 G in the left forearm, flushed. The blood you ordered is drawn: the potassium is running on the bedside analyzer, the rest is on its way to the lab.'
          : 'IV in: 18 G in the left forearm, flushed. Blood drawn and held — tell me what labs you want.']],
        flags: ['iv'],
      }),
    },
  ],
  critical: [
    // ─── The ER nurse ──────────────────────────────────────────────────────
    {
      id: 'rn-ems', label: 'Take the EMS hand-off at the bedside', roles: ED_RN, done: ['ems-handoff'], points: 5, target: { by: 2 },
      why: 'The crew saw her at home: two faints, a pulse in the 30s the whole way, three days of vomiting and diarrhea, and a bag of pill bottles.',
    },
    {
      id: 'rn-pads', label: 'Monitor and pacing pads on at once — front and back', roles: ED_RN, done: PADS, points: 10, target: { by: 4 },
      why: 'A pulse of 34 with a low pressure and confusion is unstable bradycardia: with the pads on, she can be paced within seconds of the decision. Front and back (anterior–posterior) is the placement many pacing protocols prefer.',
    },
    {
      // the call that brought the physician: once they have come on their own (the central monitor), a later report is no call
      id: 'rn-call', label: 'Bring the ED physician to the bedside now', roles: ED_RN, points: 10, target: { by: 3 },
      done: (s) => (has(s, 'md-not-called') ? null : firstDone(s, ['notify-physician'])), uses: ['notify-physician'],
      why: 'Hypotension, confusion and fainting with a slow rate need a physician now: atropine, pacing and the decisions behind them are on the physician\'s order and direction. Call (SBAR, closed loop) as soon as you see her.',
    },
    { id: 'rn-iv', label: 'IV access', roles: ED_RN, done: ['iv', 'io'], points: 5, target: { by: 7 }, why: 'For atropine, the analgesia and the potassium drugs.' },
    {
      id: 'rn-ecg', label: '12-lead within 10 minutes of arrival', roles: ED_RN, done: ['ecg12'], points: 5, target: { by: 10 },
      why: 'It shows the block and her own rhythm before the pacer hides it — and whether an inferior STEMI is the cause.',
    },
    // a nurse who paced before giving the atropine ordered has made it pointless: the item drops out
    { ...askCritical(ATROPINE), applies: (s) => has(s, 'asked-atropine') && !has(s, 'atropine-moot') },
    {
      id: 'rn-pace', label: 'Transcutaneous pacing as soon as the physician directs it', roles: ED_RN, done: ['pace'], points: 15,
      target: { within: { flag: 'asked-pace', minutes: 2 } },
      why: 'Atropine-resistant unstable bradycardia needs pacing now (2025 AHA): rate 70, the output raised until every spike is followed by a wide beat. The ER nurse paces per ACLS and facility policy, with the physician directing.',
    },
    {
      id: 'rn-capture', label: 'Confirm capture: a femoral pulse at the paced rate, and a pressure', roles: ED_RN, points: 10,
      done: (s) => confirmedAfter(s, 'tcp'), uses: [...PULSE_FELT, ...PRESSURE_TAKEN],
      target: { within: { flag: 'tcp', minutes: 3 } }, applies: (s) => has(s, 'tcp'),
      why: 'The screen shows only electrical capture, and a big pacing artifact can mimic even that. Mechanical capture is a pulse at the paced rate — at the groin, since the pacer\'s muscle twitch can feel like a carotid pulse — and a pressure that came up with it.',
    },
    {
      id: 'rn-analgesia', label: 'Speak up for analgesia, and give it on the order', roles: ED_RN, points: 10,
      done: analgesiaFor, uses: ['fentanyl', 'notify-physician'],
      target: { within: { flag: 'tcp', minutes: 4 } }, applies: (s) => has(s, 'tcp'),
      why: 'Transcutaneous pacing hurts with every beat. Tell the physician she is in pain and ask for analgesia (it needs an order), then give it — a small dose of fentanyl, titrated to her pressure and breathing.',
    },
    {
      id: 'rn-labs', label: 'Labs, with a potassium on the bedside analyzer', roles: ED_RN, done: ['labs'], points: 5, target: { by: 10 },
      why: 'Lisinopril, spironolactone, kidney disease and three days of vomiting and diarrhea: a high potassium is likely, and it slows conduction and raises the pacing threshold. (A digoxin level too, if she took digoxin — she does not.)',
    },
    {
      id: 'rn-k-report', label: 'Report the critical potassium to the physician at once', roles: ED_RN, points: 10,
      // the report that reached the physician (late, or after they found it on the screen, it is late). It applies too when
      // the blood was never drawn and the pacer failed on the potassium: it never reached the physician
      done: (s) => (has(s, 'k-reported') ? firstDone(s, ['notify-physician'], 'k-known') : null), uses: ['notify-physician'],
      target: { within: { flag: 'k-known', minutes: 3 } }, applies: (s) => has(s, 'k-known') || has(s, 'k-rising'),
      why: 'A potassium of 6.9 in a patient with a conduction block is an emergency: report a critical value to the physician the moment you have it, read it back, and get the orders.',
    },
    askCritical(CALCIUM),
    askCritical(SHIFT),
    {
      id: 'rn-meds', label: 'Her medicines: the beta-blocker, the drugs that raise potassium — and no digoxin', roles: ED_RN, done: ['sample'], points: 5,
      why: 'Metoprolol, lisinopril and spironolactone, kept up through three days of vomiting: the physician needs the list to find the cause, and they must be held.',
    },
    {
      id: 'rn-wire-check', label: 'When the wire takes over: a pulse and a pressure again', roles: ED_RN, points: 5,
      done: (s) => confirmedAfter(s, 'wire-in'), uses: [...PULSE_FELT, ...PRESSURE_TAKEN],
      target: { within: { flag: 'wire-in', minutes: 3 } }, applies: (s) => has(s, 'wire-in'),
      why: 'Every change of pacing source is checked the same way: a pulse at the paced rate and a pressure. The pads stay on as a backup.',
    },
    { id: 'rn-handoff', label: 'Hand-off to the CCU nurse', roles: ED_RN, done: ['handoff'], points: 5, why: 'The rhythm and the pacing settings, the potassium and what was given for it, the drugs held, the analgesia, and the plan for a permanent pacemaker.' },

    // ─── The ER doctor ─────────────────────────────────────────────────────
    {
      id: 'md-ems', label: 'Take the EMS hand-off at the bedside', roles: ED_MD, done: ['ems-handoff'], points: 5, target: { by: 2 },
      why: 'Two faints, a pulse in the 30s the whole way, three days of vomiting and diarrhea, and a bag of pill bottles.',
    },
    {
      id: 'md-meds', label: 'Look for the cause: her medicines (SAMPLE)', roles: ED_MD, done: ['sample'], points: 10, target: { by: 10 },
      why: 'The causes to look for: a high potassium, a beta-blocker, a calcium-channel blocker, digoxin, an inferior MI. Hers: metoprolol, with lisinopril and spironolactone kept up through three days of vomiting and diarrhea — and no digoxin.',
    },
    {
      id: 'md-first', label: 'Atropine 1 mg while the pacer is readied — or straight to pacing', roles: ED_MD, done: ['atropine', 'pace', 'pressor'], points: 5, target: { by: 6 },
      why: 'Atropine is first-line for unstable bradycardia (2025 AHA), but it is unlikely to work for a wide escape from below the AV node: one dose, and it must not delay pacing.',
    },
    {
      id: 'md-rate', label: 'Raise the rate: transcutaneous pacing (or an epinephrine or dopamine infusion)', roles: ED_MD, points: 20, target: { by: 8 },
      done: (s) => [s.flags.paced, s.flags.pressor].filter((m): m is number => m !== undefined).sort((a, b) => a - b)[0] ?? null,
      uses: ['pace', 'pressor'],
      why: 'When atropine fails: transcutaneous pacing and/or epinephrine 2–10 mcg/min or dopamine 5–20 mcg/kg/min (2025 AHA).',
    },
    {
      id: 'md-capture', label: 'Confirm capture: a femoral pulse at the paced rate, and a pressure', roles: ED_MD, points: 10,
      done: (s) => confirmedAfter(s, 'tcp'), uses: [...PULSE_FELT, ...PRESSURE_TAKEN],
      target: { within: { flag: 'tcp', minutes: 3 } }, applies: (s) => has(s, 'tcp'),
      why: 'The screen shows only electrical capture, and a big pacing artifact can mimic even that. Mechanical capture is a pulse at the paced rate — at the groin, not the neck — and a pressure that came up with it.',
    },
    {
      id: 'md-analgesia', label: 'Analgesia for the pacing', roles: ED_MD, points: 10,
      done: analgesiaFor, uses: ['fentanyl'],
      target: { within: { flag: 'tcp', minutes: 3 } }, applies: (s) => has(s, 'tcp'),
      why: 'Transcutaneous pacing hurts with every beat: fentanyl in small doses (25 mcg, repeated), titrated to her pressure, with a little midazolam if she is distressed.',
    },
    {
      id: 'md-labs', label: 'Labs now, with a potassium on the bedside analyzer', roles: ED_MD, done: ['labs'], points: 5, target: { by: 8 },
      why: 'Lisinopril, spironolactone, kidney disease and three days of vomiting: the potassium is the cause you can fix in minutes — and a normal-looking ECG does not rule it out. (A digoxin level too for a patient who takes it.)',
    },
    {
      // calcium given only after the potassium stopped the pacer (never measured, or known and left) is not "at once"
      id: 'md-calcium', label: 'Potassium 6.9 with a conduction block: IV calcium at once', roles: ED_MD, points: 10,
      done: (s) => {
        const m = firstDone(s, CALCIUMS);
        return m !== null && kLeftToFail(s) && m >= s.flags['k-rising'] ? null : m;
      },
      uses: CALCIUMS,
      target: { within: { flag: 'k-known', minutes: 4 } }, applies: kNeeded,
      why: 'Calcium steadies the heart\'s membranes within minutes (it does not lower the potassium): calcium chloride 1 g through a good vein, or calcium gluconate, repeated if the ECG does not improve. A high potassium also raises the pacing threshold.',
    },
    {
      id: 'md-shift', label: 'Shift the potassium: insulin with dextrose', roles: ED_MD, done: ['insulin-dextrose'], points: 5,
      target: { within: { flag: 'k-known', minutes: 6 } }, applies: kNeeded,
      why: 'Insulin moves potassium into the cells within 15–30 minutes, with dextrose (the ACEP algorithm uses 5 units for kidney disease or a patient who has never had insulin, and checks the glucose at 30 minutes and every hour); albuterol 10–20 mg adds to it. Hold the drugs that raised it, and give fluid to the dry, failing kidneys.',
    },
    {
      // the consult that gives the plan: cardiology asks for the potassium before anything else
      id: 'md-consult', label: 'Consult cardiology with the 12-lead and the potassium: a permanent pacemaker', roles: ED_MD, done: ['consult-cardiology'], after: 'k-known', points: 5,
      why: 'Third-degree block that is not from a reversible cause needs a permanent pacemaker (2018 ACC/AHA/HRS: class 1). Block that comes with a beta-blocker or a high potassium often stays, or comes back, once they are gone (Zeltser, JACC 2004) — with her old bundle branch block, expect it to. Call with the 12-lead and the potassium: the consultant needs both.',
    },
    {
      id: 'md-wire', label: 'A transvenous pacing wire through a central line', roles: ED_MD, done: ['temp-wire'], points: 15, target: { by: 35 },
      why: 'Transcutaneous pacing is a bridge: it hurts, and it can lose capture. For the hours until a permanent pacemaker, float a transvenous wire through a right internal jugular (or femoral) introducer sheath — keeping the left side free for the permanent device.',
    },
    {
      id: 'md-wire-film', label: 'Check the wire: a chest film (or ultrasound) for its position and a pneumothorax', roles: ED_MD, done: ['cxr', 'pocus'], after: 'wire-in', points: 5,
      why: 'Confirm the wire sits in the right ventricle and that the neck line has not dropped a lung.',
    },
    { id: 'md-admit', label: 'Admit her to the CCU', roles: ED_MD, done: ['admit'], points: 5, why: 'A pacing wire, a potassium being corrected and, very likely, a permanent pacemaker tomorrow: a monitored bed with nurses who manage temporary pacing.' },
    { id: 'md-handoff', label: 'Hand-off', roles: ED_MD, done: ['handoff'], points: 5, why: 'The rhythm and the pacing settings, the potassium and what was given for it, the drugs held, and the plan.' },
  ],
  harms: yieldToHeavier([
    {
      id: 'escape-suppressant', actions: ['lidocaine', 'amio-infusion', 'amio-arrest', 'procainamide'], when: (s) => s.pulse, points: 20, severity: 'critical',
      replaces: ['arrest-amio-with-pulse', 'procainamide-slow', 'procainamide-hypotension', ...LIDOCAINE_RULES, ...RATE_RULES],
      text: 'Lidocaine, amiodarone or procainamide for a wide escape rhythm. The wide beats are the only thing keeping her alive: suppressing them can leave no rhythm at all. A slow wide rhythm needs a faster rate (pacing), never an antiarrhythmic.',
    },
    {
      id: 'av-blocker', actions: ['metoprolol', 'esmolol', 'labetalol', 'metoprolol-po', 'diltiazem'], when: (s) => s.pulse, replaces: RATE_RULES, points: 15, severity: 'critical',
      text: 'A beta-blocker or a calcium-channel blocker in complete heart block. They slow conduction further and weaken the squeeze — her own metoprolol is part of why she is here.',
    },
    {
      id: 'adenosine-block', actions: ['adenosine3', 'adenosine6', 'adenosine12'], replaces: RATE_RULES, points: 10, severity: 'major',
      text: 'Adenosine in complete heart block. It has nothing to treat — the AV node already conducts nothing — and it can suppress the slow escape that is left, for seconds of standstill.',
    },
    {
      // the trap: the first dose did nothing, and more of it only delays the pacer. The nurse's order was for one dose
      // (doses: 1), so a second also has no order: this rule is the one penalty for it
      id: 'atropine-repeat', actions: ['atropine'], when: (s) => s.pulse && has(s, 'atropine') && !paced(s) && !has(s, 'pressor') && s.vitals.sbp < 90,
      points: 5, severity: 'major', replaces: ['rn-without-order-atropine', 'atropine-infranodal-repeat'],
      text: 'Atropine again while she stays hypotensive. A wide escape from below the AV node rarely answers to atropine — the first dose showed it. Pace her (or start an epinephrine or dopamine infusion) instead of pushing more: every minute at 34 with a pressure in the 80s costs perfusion. (In the ER nurse\'s run, a second dose also needs a new order.)',
    },
    {
      // the trap: electrical capture taken for a pulse
      id: 'capture-unconfirmed', actions: ['notify-physician', 'consult-cardiology', 'central-line', 'admit', 'handoff'],
      // a nurse who calls with a critical potassium in hand is reporting the potassium, not the pacing
      when: (s) => tcpActive(s) && !captureConfirmed(s) && !(s.role === 6 && kPending(s)), points: 5, severity: 'major',
      text: 'Calling the pacing a success from the monitor alone. Spikes followed by wide complexes are electrical capture — and a big pacing artifact can mimic even that. Before you report it or move on, feel a femoral pulse at the paced rate and take a pressure: that is mechanical capture.',
    },
    {
      // the trap: going on with other work after she has cried out with the pacer and nothing has been given for it (the
      // nurse who has asked for an order has done her part)
      id: 'no-analgesia', actions: ['reassess', 'sample', 'opqrst', 'labs', 'ecg12', 'ecg12-repeat', 'cxr', 'pocus', 'consult-cardiology', 'central-line', 'admit', 'handoff', 'triage', 'lungs', 'perfusion', 'neuro', 'hs-ts'],
      when: (s) => tcpActive(s) && !has(s, 'analgesia') && s.vitals.gcs >= 9 && s.fired.includes('pain') && !(s.role === 6 && has(s, 'analgesia-requested')),
      points: 5, severity: 'major',
      text: 'Pacing an awake patient without analgesia. Every paced beat hurts — she feels each one through the chest wall. Fentanyl in small doses (and a little midazolam if she is distressed) as soon as the pacer is on; the ER nurse asks the physician for the order.',
    },
    {
      id: 'k-untreated', actions: ['admit', 'handoff'], roles: ED_MD, when: (s) => !kTreated(s), points: 10, severity: 'major',
      text: 'Sending her on with her potassium untreated. With lisinopril, spironolactone, kidney disease and three days of vomiting, a high potassium is the cause you can fix in minutes — it slows conduction, raises the pacing threshold and can stop the heart. Measure it (the bedside analyzer), and treat 6.9 with calcium and insulin with dextrose before she leaves.',
    },
    {
      id: 'k-not-reported', actions: ['handoff'], roles: ED_RN, when: (s) => !has(s, 'k-reported'), points: 8, severity: 'major',
      text: 'Handing her over without having reported her potassium to the physician. A critical value goes to the physician the moment it is known (read back, closed loop): a potassium of 6.9 slows conduction and raises the pacing threshold.',
    },
    {
      id: 'cpap-no-indication', actions: ['cpap'], when: (s) => s.pulse, replaces: ['cpap-hypotension', 'cpap-vomiting', 'cpap-preload-dependent', 'cpap-drowsy'], points: 5, severity: 'major',
      text: 'CPAP without breathing trouble. Her lungs are clear and her oxygen is fine; the positive pressure cuts the blood returning to the heart, and with a systolic in the 80s it deepens the shock.',
    },
    {
      // the built-in rule, same id, for the physician: her own metoprolol is the AV-nodal blockade of BRASH, and glucagon is a
      // listed rescue there once the rate support has failed (Farkas 2020) — so it is scored only before pacing or an infusion
      // has been tried. (The nurse's dose with no order is the order rule's: the built-in, skipped for her then)
      id: 'glucagon-no-indication', actions: ['glucagon'], roles: ED_MD, when: (s) => !has(s, 'paced') && !has(s, 'pressor'), points: 3, severity: 'minor',
      text: 'Glucagon before the rate support has been tried. Her metoprolol dose is an everyday one, not an overdose: in BRASH glucagon (or high-dose insulin) is a rescue only once pacing or an epinephrine infusion and the potassium treatments have failed (Farkas 2020). First it brings vomiting, not a faster escape.',
    },
    {
      // the same id as the built-in rule: a low pressure here is the slow rate's, and the tube does not treat it
      id: 'rsi-no-indication', actions: ['rsi'], roles: ED_MD, when: (s) => s.pulse && s.vitals.gcs >= 9, points: 10, severity: 'major', replaces: ['rsi-unresuscitated'],
      text: 'Rapid sequence intubation for a low pressure that comes from a slow heart. She protects her airway and oxygenates; the induction drug and positive pressure drop the pressure further and can stop a heart beating 34 times a minute. Fix the rate (pacing) first.',
    },
  ]),
  timings: [
    DOOR_TO_ECG,
    { label: 'Pads on', actions: [], flag: 'pads', target: 4 },
    { label: 'Pacing (or an infusion) started', actions: ['pace', 'pressor'], flag: 'paced', target: 8 },
    { label: 'Critical potassium to calcium', actions: CALCIUMS, flag: 'calcium', from: 'k-known', target: 4 },
    { label: 'Transvenous wire in', actions: ['temp-wire'], flag: 'wire-in' },
  ],
  teaching: [
    'Unstable bradycardia — a low pressure, an acute change in mental status, signs of shock, ischemic chest pain or acute heart failure (2025 AHA), and fainting from the slow rate — is treated now: atropine 1 mg IV (every 3–5 minutes, at most 3 mg); if it fails, transcutaneous pacing and/or an epinephrine (2–10 mcg/min) or dopamine (5–20 mcg/kg/min) infusion; then expert consultation and a transvenous wire.',
    'Atropine acts on the sinus and AV nodes. A wide escape comes from below the AV node and rarely answers to it: one dose while the pads go on, and no repeated doses that delay the pacer. After a heart transplant, do not use it.',
    'Transcutaneous pacing: pads front and back (front and side works too), rate about 70, the output raised until every spike is followed by a wide QRS and a T wave (electrical capture), then a little above. Confirm mechanical capture: a femoral pulse at the paced rate (a carotid can be faked by the muscle twitch), a pressure, a pulse oximeter waveform at the paced rate. A monitor can count pacing spikes as beats.',
    'Pacing hurts: give analgesia (fentanyl 25 mcg, repeated) and a little sedation if needed, titrated to the pressure. It is a bridge: for hours of pacing, a transvenous wire through a right internal jugular or femoral introducer sheath — the left side kept free for the permanent device — and a chest film or ultrasound for its position and a pneumothorax.',
    'Look for the cause: a high potassium, beta-blockers, calcium-channel blockers, digoxin (a level if the patient takes it; digoxin immune Fab for toxicity), an inferior STEMI on the 12-lead. The ECG cannot rule out a high potassium: measure it — a bedside analyzer gives it in minutes.',
    'A potassium of 6.9 with a conduction block: IV calcium first (calcium chloride 1 g through a good vein, or calcium gluconate), repeated if the ECG does not improve; then insulin with dextrose (dextrose first; the ACEP algorithm gives 5 units of insulin to a patient with kidney disease or who has never had insulin, like her, and 10 to others, and checks the glucose at 30 minutes and then every hour) and albuterol 10–20 mg nebulized; stop what raised it; fluid for dry, failing kidneys; dialysis if it will not come down. A high potassium raises the pacing threshold: a pacer that held can stop bringing beats until calcium is given.',
    'BRASH — bradycardia, renal failure, AV-nodal blockade, shock, hyperkalemia: a beta-blocker and a modestly high potassium together, in a patient who is dry, can slow the heart more than either alone. Treat both: fluid for the dry patient, the potassium treatments, and the rate supported (pacing, or an epinephrine infusion); glucagon or high-dose insulin only if those fail (Farkas et al., J Emerg Med 2020). Glucagon is no answer to an everyday beta-blocker dose: it brings vomiting, not a faster escape.',
    'Never give lidocaine, amiodarone or procainamide for a slow wide escape — it is what keeps the patient alive. Beta-blockers and calcium-channel blockers slow the escape and weaken the squeeze; adenosine has nothing to treat and can suppress the escape for seconds.',
    'Third-degree AV block that is not from a reversible cause needs a permanent pacemaker (2018 ACC/AHA/HRS, class 1). Block that came with a beta-blocker or a high potassium often stays, or returns, once they are gone (Zeltser, JACC 2004) — so treat the cause, wait for the block to resolve or not, and expect the pacemaker when there is old conduction disease behind it.',
    'The ER nurse calls the physician the moment she sees an unstable patient, puts the pads on, gets the line, the 12-lead and the labs, gives each drug on an order, paces with the physician directing, confirms capture with a pulse and a pressure after every change of pacing source, speaks up for analgesia, and reports a critical value at once — read back, closed loop.',
  ],
};
