import type { Effect, Line, Scenario, ScenarioEvent, SimState, Timing } from '../types';
import { allOf, bpAfter, firstDone, has, shocks, PADS } from '../kit';
import { askCritical, askEvents, type LabAsk } from '../labKit';
import { DOOR_TO_ECG, ECG_TO_ACTIVATION, ED_MD, ED_RN, edNurse, edOrder, physicianDispo } from '../edKit';

/**
 * A walk-in anterior STEMI in a PCI-capable emergency department, on a Saturday evening (the cath lab team is on call from
 * home). He walks up to triage with an hour of chest pressure. The ER nurse triages him, records the 12-lead within 10
 * minutes and shows it to the ED physician at once, puts him on the monitor and pads, gives aspirin on the chest pain
 * standing order, and the heparin, the P2Y12 and the opioid on the physician's orders. The ER doctor reads the 12-lead and
 * activates the cath lab without waiting for a troponin or a repeat tracing, and orders aspirin, heparin, the P2Y12 the
 * interventional cardiologist asks for and something for the pain. Both have the same trap to find: the "pill for my
 * prostate" he takes every morning is tadalafil, so no nitroglycerin. He has crackles at both bases, so no IV
 * beta-blocker. About 15 minutes in, while the lab team is on its way, he goes into VF on the monitor. A lab left
 * unactivated 10 minutes after the tracing costs more than points: his pump fails further (more breathless, the saturation
 * falling), and stays that way.
 */

/** Minutes from activation until the on-call team has the room ready (after hours: within 30) */
const CATH_MINUTES = 20;

/** The clock minute at which he fibrillates, whatever has been done (the lab cannot be ready by then) */
const VF_MINUTE = 15;

/** His vitals once a shock brings him back: awake, a little drowsy, the pressure holding */
const ROSC_VITALS = { sbp: 112, dbp: 70, spo2: 93, rr: 18, etco2: 38, gcs: 14 };

/** Only a patient awake enough to talk says how he feels */
const awake = (s: SimState, text: string): Line[] => (s.pulse && s.vitals.gcs >= 13 ? [['patient', `"${text}"`]] : []);

/** The ER nurse's run: the computer ED physician decides. The ER doctor's run: a computer nurse does the nursing */
const nurseRun = (s: SimState) => s.role === 6;
const doctorRun = (s: SimState) => s.role === 7;

/** Someone (the learner or the computer physician) knows about the tadalafil */
const pde5Known = (s: SimState) => has(s, 'pde5-reported') || has(s, 'physician-knows-pde5');

/** Minute of the first nitrate (0.4 or 0.8 mg), or null */
const firstNitrate = (s: SimState) => firstDone(s, ['nitro', 'nitro-high']);

/**
 * He was asked about the erectile-dysfunction drugs before any nitrate went in (or none ever did): the minute, or null. A
 * question asked only after the nitrate is no screen — the 'nitro-pde5' harm scores that mistake, so the item drops out
 * then (one mistake, one penalty) instead of being listed as done
 */
function askedBeforeNitrate(s: SimState): number | null {
  const asked = firstDone(s, ['ask-pde5']);
  const nitrate = firstNitrate(s);
  return asked !== null && (nitrate === null || asked <= nitrate) ? asked : null;
}
const pde5ItemApplies = (s: SimState) => firstNitrate(s) === null || askedBeforeNitrate(s) !== null;

/** The nurse called for help (or called the physician) once he arrested */
const calledForHelp = (s: SimState) => firstDone(s, ['call-help', 'notify-physician'], 'arrest') !== null;

/**
 * A shock for the VF. Witnessed and monitored, it converts with the first shock delivered within 2 minutes (or after a
 * cycle of CPR); a first shock that comes later fails, and CPR then the next one bring him back. He comes back still
 * occluded: the same ST elevation, a faster rate
 */
function shock(s: SimState, aed: boolean): Effect | null {
  if (s.pulse || s.rhythm.profile !== 'vf') return null;
  const delivered = aed ? 'AED: "Shock advised." Shock delivered.' : 'Shock delivered: 200 J.';
  const early = has(s, 'cpr') || (s.timers.arrestAt !== undefined && s.minute - s.timers.arrestAt <= 2);
  if (!early && shocks(s) === 0) return { say: [['monitor', `${delivered} No change on the monitor — resume CPR.`]], flags: ['pads', 'monitor', 'shocked'] };
  return {
    say: [
      ['monitor', delivered],
      ['you', 'An organized rhythm on the monitor and a carotid pulse — ROSC.', 'good'],
      ['patient', 'Groans and opens his eyes: "What… what happened?"'],
    ],
    // lungs that had already filled (a blocker, or the wait for the lab) stay wet after the shock
    rhythm: { profile: 'anterior-stemi', hr: 108 }, pulse: true, phase: 'rosc',
    vitals: has(s, 'worse-hf') ? { ...ROSC_VITALS, spo2: 90, rr: 24 } : ROSC_VITALS, flags: ['pads', 'monitor', 'shocked'],
  };
}

/**
 * Nitroglycerin on top of the tadalafil he took this morning: both raise the cyclic GMP that relaxes the vessels, so the
 * pressure falls far more than nitroglycerin alone would drop it — and the chest pain barely changes
 */
function nitrate(s: SimState, high: boolean): Effect | null {
  if (!s.pulse) return null;
  const bp = has(s, 'nitro-crash') ? bpAfter(s, -16, -10) : bpAfter(s, high ? -66 : -58, high ? -40 : -36);
  return {
    say: [['monitor', `BP ${bp.sbp}/${bp.dbp}.`, 'bad'], ...awake(s, 'Whoa… I feel faint — the room is spinning.')],
    vitals: { ...bp, pain: Math.max(0, s.vitals.pain - 1) },
    flags: high ? ['nitro', 'nitro-high', 'nitro-crash'] : ['nitro', 'nitro-crash'],
  };
}

/**
 * IV metoprolol or diltiazem with crackles at both bases: both take away output the failing anterior wall needs (and
 * diltiazem opens the vessels too), so the pressure falls, the lungs fill and the oxygen drops below 90 %
 */
function failingPump(s: SimState, slower: number, flag: string): Effect | null {
  if (!s.pulse) return null;
  const bp = bpAfter(s, -16, -10);
  const hr = Math.min(s.rhythm.hr, Math.max(60, s.rhythm.hr - slower));
  const spo2 = Math.max(85, s.vitals.spo2 - 5);
  return {
    say: [['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}. SpO₂ ${spo2}%.`, 'bad'], ...awake(s, 'I can\'t get my breath…')],
    vitals: { ...bp, spo2, rr: Math.min(30, s.vitals.rr + 4) }, rhythm: { ...s.rhythm, hr }, flags: [flag, 'worse-hf'],
  };
}

/** The ER nurse's report to the ED physician (SBAR): the 12-lead, the tadalafil, the arrest — each answered once */
function report(s: SimState): Effect {
  const flags = ['physician-notified'];
  if (!s.pulse) {
    return { say: [['physician', has(s, 'pads') ? 'Coming! The pads are on him: shock now, then straight back to compressions.' : 'Coming! Pads on and shock now, then straight back to compressions.', 'warn']], flags };
  }
  const say: Line[] = [];
  let dispo: Effect = {};
  if (!has(s, 'ecg12') && !has(s, 'alert')) {
    say.push(['physician', 'An hour of chest pressure, pale and sweaty? Get me a 12-lead right now — before anything else — and put him on the monitor. I\'m coming.', 'warn']);
  }
  if (has(s, 'ecg-stemi') && !has(s, 'alert')) {
    dispo = physicianDispo(s, 'cathLab', 'Let me see — thank you. I\'m activating the cath lab now: one call, and the team is on its way in. Aspirin on the standing order if he hasn\'t had it; I\'ll have orders for you in a minute.', CATH_MINUTES);
  }
  if (has(s, 'pde5-asked') && !has(s, 'pde5-reported')) {
    say.push(['physician', 'Tadalafil this morning? Then no nitroglycerin — not within 48 hours of it. Good catch.']);
    flags.push('pde5-reported');
  }
  if (!say.length && !dispo.say) {
    say.push(['physician', has(s, 'rosc')
      ? 'Thanks. Keep the pads on him; he still goes to the lab the moment it is ready.'
      : 'Thanks — keep me posted. The lab team is on its way.']);
  }
  return { ...dispo, say: [...(dispo.say ?? []), ...say], flags: [...flags, ...(dispo.flags ?? [])] };
}

// The ED physician's orders in the ER nurse's run: each sets `ordered:<id>`, so the nurse may then give it. A drug that is
// already in is not ordered again (given without an order, the built-in 'rn-without-order-<id>' rule has scored it)

/** When the physician steps in on an order the nurse has not carried out, and there is no line yet, the charge nurse starts one */
const lineFor = (s: SimState): Effect => (has(s, 'iv') ? {} : { say: [['team', 'The charge nurse puts an 18-gauge in his right forearm.']], flags: ['iv'] });

const HEPARIN_ORDER: LabAsk = edOrder({
  id: 'heparin', when: (s) => has(s, 'alert') && s.minute >= s.flags.alert + 2 && !has(s, 'heparin'),
  ask: 'Interventional cardiology called back. Heparin 4,000 units IV push now, please — 60 units a kilo, capped at 4,000 — and hang the drip at 1,000 an hour. The lab tops it up.',
  accept: ['heparin'],
  thanks: 'Thanks — write the time on the tape for the lab.',
  fallback: 'I need that heparin in now — the charge nurse is pushing it.',
  fallbackEffect: (s) => { const line = lineFor(s); return { say: line.say, flags: [...(line.flags ?? []), 'heparin'] }; },
  gives: 'heparin-given', points: 10,
  // an IV push: a nurse without a line yet needs 2 minutes to start one first
  within: 3, wait: 4,
  label: 'Heparin on the physician\'s order',
  why: 'An anticoagulant goes with the aspirin for every STEMI on its way to primary PCI: unfractionated heparin 60 units/kg (at most 4,000) in the department, topped up in the lab to an ACT of 250–300 s. The ER nurse gives it on the order, reads the dose back and records the time for the lab.',
});

const P2Y12_ORDER: LabAsk = edOrder({
  id: 'p2y12', when: (s) => (has(s, 'heparin-given') || (has(s, 'alert') && s.minute >= s.flags.alert + 4)) && !has(s, 'p2y12'),
  ask: 'And ticagrelor 180 milligrams by mouth, please — the interventional cardiologist wants him loaded before the lab.',
  accept: ['p2y12'],
  thanks: 'Thanks.',
  fallback: 'The charge nurse is giving him the ticagrelor.',
  fallbackEffect: () => ({ flags: ['p2y12'] }),
  gives: 'p2y12-given', points: 10,
  label: 'Ticagrelor on the physician\'s order',
  why: 'The P2Y12 loading dose (ticagrelor 180 mg here) is given when and as the interventional cardiologist asks — some load in the department, some on the table once the anatomy is seen. On the order, the nurse gives it and records the time.',
});

const FENTANYL_ORDER: LabAsk = edOrder({
  // the physician orders the opioid once the 12-lead is acted on and the pressure allows it (not at 88 systolic after a nitrate)
  id: 'fentanyl', when: (s) => pde5Known(s) && has(s, 'alert') && s.vitals.sbp >= 90 && !has(s, 'analgesia'),
  ask: 'Fentanyl 50 micrograms IV for his pain, please — no nitrates.',
  accept: ['fentanyl'],
  thanks: 'Thanks — tell me if it doesn\'t touch the pain.',
  fallback: 'He is still in pain — the charge nurse is giving the fentanyl.',
  fallbackEffect: (s) => { const line = lineFor(s); return { say: line.say, vitals: { pain: Math.max(0, s.vitals.pain - 3) }, flags: [...(line.flags ?? []), 'analgesia'] }; },
  gives: 'fentanyl-given', points: 5,
  within: 3, wait: 4,
  // one dose: more needs another order
  doses: 1,
  label: 'Fentanyl for the pain, on the physician\'s order',
  why: 'With nitrates ruled out by the tadalafil, an IV opioid treats the ischemic pain; the ER nurse gives it on the order and watches the breathing and the pressure.',
});

const RN_ORDERS = [HEPARIN_ORDER, P2Y12_ORDER, FENTANYL_ORDER];

/**
 * The orders as events — none is given, and none falls back to someone else, while he is in cardiac arrest: the code
 * comes first, and an order still open then waits for the pulse to come back
 */
const orderEvents = (a: LabAsk): ScenarioEvent[] =>
  askEvents(a).map((ev) => (ev.id.endsWith('-ask') || ev.id.endsWith('-fallback') ? { ...ev, when: (s: SimState) => s.pulse && ev.when(s) } : ev));

/** The timing goals: the department's 12-lead, the read and the call, aspirin, the shock, and the trip to the lab */
const TIMINGS: Timing[] = [
  DOOR_TO_ECG,
  { ...ECG_TO_ACTIVATION, target: 10 },
  { label: 'Door to aspirin', actions: ['aspirin'], target: 10 },
  { label: 'First shock after VF began', actions: ['defib', 'aed'], target: 2, from: 'arrest' },
  // the device itself is the lab's: the department's share is everything up to handing him over
  { label: 'Door to the cath lab team (goal: a device within 90 minutes of arrival)', actions: ['handoff'] },
];

export const edStemiWalkIn: Scenario = {
  id: 'stemi-walk-in-ed',
  title: 'Walked in with chest pressure',
  summary: '57-year-old man walks up to triage with an hour of chest pressure, pale and sweaty. Get the 12-lead in 10 minutes, act on it without waiting, and keep him safe until the cath lab is ready.',
  setting: 'ed',
  roles: [6, 7],
  difficulty: 'intermediate',
  conditionId: 'anterior-stemi',
  briefing: {
    default: [
      ['team', 'Saturday, 7:40 in the evening. A 57-year-old man walks up to the triage desk, a hand pressed to his chest: "I\'ve had a pressure here for about an hour. I thought it was heartburn."'],
      ['team', 'He is pale and sweaty. The waiting room is full, and registration is asking for his insurance card.'],
      ['team', 'Your hospital has a cath lab; after hours its team is on call from home.'],
    ],
    6: [
      ['team', 'Saturday, 7:40 in the evening. A 57-year-old man walks up to the triage desk, a hand pressed to his chest: "I\'ve had a pressure here for about an hour. I thought it was heartburn."'],
      ['team', 'He is pale and sweaty. The waiting room is full, and registration is asking for his insurance card.'],
      ['team', 'You are the triage nurse, and he will be your patient. The ED physician is two rooms away. Your hospital has a cath lab; after hours its team is on call from home.'],
    ],
    7: [
      ['team', 'Saturday, 7:40 in the evening. A 57-year-old man walked up to triage a minute ago with an hour of chest pressure. Pale and sweaty, he was taken straight back to bed 3.'],
      ['nurse', 'He\'s on the monitor, doctor. I\'m recording his 12-lead now.'],
      ['team', 'You are the ED physician. No medicines have been given yet. Your hospital has a cath lab; after hours its team is on call from home.'],
    ],
  },
  initial: {
    rhythm: { profile: 'anterior-stemi', hr: 98 },
    vitals: { sbp: 146, dbp: 90, spo2: 94, rr: 20, etco2: 34, pain: 7, gcs: 15, glucose: 148, temp: 36.8 },
  },
  // what the built-in safety rules read (types.ts Problem)
  problems: ['acs', 'pde5-inhibitor'],
  facts: {
    triage: 'ESI 2: an hour of chest pressure in a 57-year-old who is pale and sweaty — high risk. Straight back to a monitored bed, not the waiting room; the 12-lead now, before registration, within 10 minutes of arrival.',
    opqrst: 'It started about an hour ago, watching TV — a heavy pressure in the middle of my chest, into my left arm and my jaw. Seven out of ten, and it hasn\'t let up. I took some antacid; it did nothing. I\'m a little short of breath.',
    sample: 'No allergies. Lisinopril and atorvastatin — and a pill every morning for my prostate. High blood pressure and cholesterol; I smoke half a pack a day. No blood thinners, no bleeding problems, no kidney trouble. A sandwich at 6. About 200 pounds.',
    pde5: 'The prostate pill? It\'s tadalafil — Cialis, 5 milligrams. I take one every morning so I don\'t have to get up at night; I took today\'s at 7. Nothing else like that.',
    lungs: (s) => (has(s, 'worse-hf') ? 'Crackles a third of the way up both lungs now.' : 'Fine crackles at both bases; otherwise clear.'),
    perfusion: 'Pale, cool and clammy. Neck veins not distended. Radial pulses strong and equal.',
    bpArms: (s) => `Right arm ${s.vitals.sbp}/${s.vitals.dbp} · left arm ${s.vitals.sbp - 4}/${s.vitals.dbp - 2}: the same within a few mmHg.`,
    ecg12: (s) => {
      if (s.rhythm.profile !== 'anterior-stemi') return 'No 12-lead during the arrest.';
      const rhythm = `Sinus ${s.rhythm.hr > 100 ? 'tachycardia' : 'rhythm'} ${s.rhythm.hr}`;
      const findings = `${rhythm}: 3–4 mm ST elevation in V1–V4 with hyperacute T waves, and reciprocal ST depression in III and aVF — an anterior STEMI, a proximal LAD occlusion.`;
      if (has(s, 'rosc')) return `${findings} After the shock the ST elevation is unchanged: the artery is still closed, and the cath lab is still the answer.`;
      return `${findings} It meets STEMI criteria on its own: ${s.role === 6
        ? 'show it to the ED physician the moment it prints.'
        : 'activate the cath lab now — no troponin, no repeat tracing needed.'}`;
    },
    ecgRight: 'V4R: no ST elevation.',
    labs: 'Blood drawn and sent: high-sensitivity troponin, CBC, chemistry with creatinine and potassium, coagulation studies, type and screen — results in 30 to 60 minutes.',
    troponin: 'Repeat high-sensitivity troponin drawn — the result is about an hour away.',
    cxr: 'Portable chest X-ray: normal heart size, mild vascular congestion at both bases, a normal mediastinum.',
    pocus: 'Bedside ultrasound: the front wall and the apex of the left ventricle barely move while the rest squeezes; no pericardial effusion; a few B-lines at both bases; the aortic root is not dilated.',
    ct: 'Radiology: no aortic dissection and no pulmonary embolism.',
    consult: (s) => (has(s, 'alert')
      ? 'Interventional cardiology: "I\'m on my way in. Aspirin, heparin and ticagrelor 180 if he hasn\'t had them, and keep the pads on him."'
      : 'Interventional cardiology: "I\'ve seen the tracing. Don\'t wait for me or for a troponin — activate the lab: one call brings the team in."'),
  },
  status: (s) => {
    if (!s.pulse) return 'Unresponsive.';
    if (has(s, 'nitro-crash') && s.vitals.sbp < 100) return '"I feel faint — like I\'m going to pass out."';
    if (has(s, 'worse-hf')) return '"I can\'t get my breath…"';
    if (has(s, 'rosc')) return `"What happened? … It still presses — ${s.vitals.pain} out of 10."`;
    return s.vitals.pain >= 6 ? `"It's still pressing — ${s.vitals.pain} out of 10."` : `"A bit easier — ${s.vitals.pain} out of 10."`;
  },
  respond: {
    'notify-physician': report,
    // the nurse gives the drugs in both runs: the ER doctor orders them (the action's own line), the computer nurse gives them
    // (the charge nurse already pushed it on the physician's word: one bolus, not two — the lab doses the rest by the ACT)
    heparin: (s) => (has(s, 'heparin')
      ? { blocked: true, say: [['system', 'The heparin bolus is already in: no second bolus — the cath lab doses the rest by the ACT.']] }
      : {
        say: [[edNurse(s), edNurse(s) === 'you'
          ? 'Heparin 4,000 units IV push (60 units/kg, capped at 4,000); the drip hung at 1,000 units an hour; the time written on the tape for the lab.'
          : 'Heparin 4,000 units in, doctor, and the drip at 1,000 an hour.']],
        flags: ['heparin'],
      }),
    p2y12: (s) => {
      if (!s.pulse || s.vitals.gcs < 11) return null;
      if (has(s, 'p2y12')) return { blocked: true, say: [['system', 'He has already had his ticagrelor 180 mg loading dose.']] };
      return { say: [[edNurse(s), 'Ticagrelor 180 mg: he swallows the two tablets with a sip of water.']], flags: ['p2y12'] };
    },
    // the nurse's order is one dose: once he has had it (from her, or from the charge nurse when the order went unanswered),
    // another needs a new word from the physician
    fentanyl: (s) => (nurseRun(s) && s.pulse && has(s, 'analgesia')
      ? { blocked: true, say: [['system', 'He has had the 50 micrograms the physician ordered: tell the physician if the pain goes on, and give another dose only on a new order.']] }
      : null),
    nitro: (s) => nitrate(s, false),
    'nitro-high': (s) => nitrate(s, true),
    // a small bolus for the pressure the nitrate dropped (the vessels it opened); otherwise the default (and with a normal
    // pressure a harm: his lungs are already wet)
    fluid: (s) => {
      if (!s.pulse || !has(s, 'nitro-crash') || s.vitals.sbp >= 110) return null;
      const bp = bpAfter(s, 14, 8);
      return { say: [['monitor', `250 mL in. BP ${bp.sbp}/${bp.dbp}.`]], vitals: bp, flags: ['fluid'] };
    },
    metoprolol: (s) => failingPump(s, 12, 'beta-blocker'),
    diltiazem: (s) => failingPump(s, 6, 'diltiazem'),
    defib: (s) => shock(s, false),
    aed: (s) => shock(s, true),
    // waiting for a troponin: the nurse draws it and says how long it takes
    'troponin-repeat': (s) => (doctorRun(s) && has(s, 'labs') && has(s, 'ecg-stemi') && !has(s, 'alert')
      ? { say: [['nurse', 'Repeat troponin drawn — the result is about an hour away, doctor. Are we waiting for it before we call the lab?', 'warn']], flags: ['troponin-repeat'] }
      : null),
    // once the lab is activated he goes there, not to a bed or another hospital: nothing is done and nothing is scored
    admit: (s) => (has(s, 'alert')
      ? { blocked: true, say: [['system', 'He is going to your cath lab: the CCU bed is the interventional team\'s to book for after the procedure. Keep caring for him until the lab is ready.']] }
      : null),
    transfer: (s) => (has(s, 'alert')
      ? { blocked: true, say: [['system', 'Your own cath lab is activated and its team is on the way: there is nowhere faster to send him.']] }
      : null),
  },
  events: [
    {
      // the anterior wall fibrillates while the lab team is still on the way. First in the list: an order due in the same
      // minute waits for the pulse to come back (orderEvents)
      id: 'vf', when: (s) => s.pulse && s.phase === 'initial' && s.minute >= VF_MINUTE,
      effect: (s) => ({
        say: [
          ...awake(s, 'I feel strange…'),
          ['monitor', 'Monitor alarm!', 'bad'],
          nurseRun(s)
            ? ['team', 'He slumps back against the pillow, eyes rolled up, gasping — he does not respond.', 'bad']
            : ['nurse', 'Doctor — bed 3! He just went unresponsive!', 'bad'],
        ],
        rhythm: { profile: 'vf', hr: 0 }, pulse: false, phase: 'arrest', flags: ['vf'],
      }),
    },
    {
      // the LAD stays shut while nobody calls the lab: more of the anterior wall stops squeezing, and the lungs fill
      // (only the ER doctor can let it come to this: the computer physician activates within 5 minutes of seeing a tracing)
      id: 'pump-failing', when: (s) => s.pulse && s.phase === 'initial' && has(s, 'ecg-stemi') && !has(s, 'alert') && s.minute >= s.flags['ecg-stemi'] + 10,
      effect: (s) => {
        const bp = bpAfter(s, -12, -8);
        const spo2 = Math.min(s.vitals.spo2, 91);
        return {
          say: [
            [doctorRun(s) ? 'nurse' : 'team', `${doctorRun(s) ? 'Doctor — he\'s' : 'He is'} more short of breath: SpO₂ ${spo2}%, breathing 24 a minute, pressure ${bp.sbp}/${bp.dbp}. Crackles higher up on both sides.`, 'bad'],
            ...awake(s, 'I can\'t get my breath…'),
          ],
          vitals: { ...bp, spo2, rr: Math.max(s.vitals.rr, 24) }, flags: ['worse-hf'],
        };
      },
    },

    // ─── the ER doctor's run: the computer nurse ───
    { id: 'md-on-monitor', when: doctorRun, effect: () => ({ flags: ['monitor'] }) },
    {
      // the nurse's 12-lead is a recorded tracing: the engine asks the doctor to read it (no read of its own here)
      id: 'md-nurse-ecg', when: (s) => doctorRun(s) && s.pulse && !has(s, 'ecg12') && s.minute >= 2,
      effect: () => ({ say: [['nurse', 'Doctor — the 12-lead on bed 3.']], flags: ['ecg12'] }),
    },
    {
      // a line the doctor already placed is not placed twice
      id: 'md-nurse-iv', when: (s) => doctorRun(s) && s.minute >= 4,
      effect: (s) => ({
        say: [['nurse', `${has(s, 'iv') ? 'Blood is off' : 'An 18-gauge in his left forearm, and blood is off'} for troponin, CBC, chemistry, coags and a type and screen. Pads are on him.`]],
        flags: ['iv', 'labs', 'pads'],
      }),
    },
    {
      id: 'md-nudge', when: (s) => doctorRun(s) && has(s, 'ecg-stemi') && has(s, 'ecg12') && !has(s, 'alert') && s.minute >= s.flags.ecg12 + 8,
      effect: () => ({ say: [['nurse', 'Doctor — are we calling the cath lab on bed 3?', 'warn']] }),
    },
    {
      id: 'md-ic-callback', when: (s) => doctorRun(s) && s.pulse && has(s, 'alert') && s.minute >= s.flags.alert + 1,
      effect: () => ({
        say: [['consultant', 'Interventional cardiology: "I\'ve seen the tracing — I\'m on my way in. Load him with ticagrelor 180 milligrams now, and heparin 60 units a kilo, at most 4,000, if he hasn\'t had it; I\'ll top it up in the lab. Keep the pads on him."']],
        flags: ['ic-called'],
      }),
    },
    {
      // the chest pain order offers nitroglycerin: whether it is safe is the doctor's to find out
      id: 'md-nitro-ask', when: (s) => doctorRun(s) && s.pulse && s.phase === 'initial' && s.minute >= 6 && !has(s, 'nitro') && !has(s, 'analgesia'),
      effect: (s) => ({ say: [['nurse', `He's still pressing at ${s.vitals.pain} out of 10, doctor. Nitroglycerin on the chest pain order, or something else for the pain?`]] }),
    },
    {
      id: 'md-nitro-crash', when: (s) => doctorRun(s) && has(s, 'nitro-crash'),
      effect: (s) => ({ say: [['nurse', `Doctor — his pressure dropped to ${s.vitals.sbp}/${s.vitals.dbp} right after the nitro, and he says he feels faint.`, 'bad']] }),
    },

    // ─── the ER nurse's run: the computer ED physician ───
    {
      id: 'rn-physician-wants-ecg', when: (s) => nurseRun(s) && s.pulse && !has(s, 'ecg12') && !has(s, 'alert') && s.minute >= 10,
      effect: () => ({ say: [['physician', 'The man with chest pressure — has he had his 12-lead? He should have had it within 10 minutes of walking in. I need it now.', 'warn']] }),
    },
    {
      // nobody recorded it: the physician does, and acts on it
      id: 'rn-physician-ecg', when: (s) => nurseRun(s) && s.pulse && !has(s, 'ecg12') && !has(s, 'alert') && s.minute >= 13,
      effect: (s) => {
        const d = physicianDispo(s, 'cathLab', 'I\'ve recorded his 12-lead myself. I\'m activating the cath lab now.', CATH_MINUTES);
        return { ...d, flags: [...(d.flags ?? []), 'physician-ecg', 'ecg-stemi'] };
      },
    },
    {
      // recorded but never shown: the physician finds it on the printer
      id: 'rn-physician-sees-ecg', when: (s) => nurseRun(s) && s.pulse && has(s, 'ecg12') && has(s, 'ecg-stemi') && !has(s, 'alert') && s.minute >= s.flags.ecg12 + 5,
      effect: (s) => physicianDispo(s, 'cathLab', 'Is this his 12-lead, sitting on the printer? Every chest pain 12-lead comes to me the moment it prints. I\'m activating the cath lab now.', CATH_MINUTES),
    },
    ...RN_ORDERS.flatMap(orderEvents),
    {
      // nobody told the physician about the prostate pill: the physician asks him
      id: 'rn-physician-asks-pde5', when: (s) => nurseRun(s) && s.pulse && has(s, 'alert') && !pde5Known(s) && s.minute >= 12,
      effect: () => ({ say: [['physician', 'I asked him about his medicines myself: tadalafil 5 milligrams every morning — he took it at 7. No nitroglycerin for him.']], flags: ['physician-knows-pde5'] }),
    },
    {
      id: 'rn-nitro-crash', when: (s) => nurseRun(s) && has(s, 'nitro-crash'),
      effect: (s) => ({
        say: [['physician', `His pressure is ${s.vitals.sbp}/${s.vitals.dbp} — right after nitroglycerin? ${has(s, 'pde5-reported')
          ? 'You told me he took tadalafil this morning!'
          : 'I asked him: tadalafil this morning.'} No more nitrates. Lay him flat and run in 250 mL of saline.`, 'bad']],
        flags: ['physician-knows-pde5'],
      }),
    },
    {
      // the alarm brings the physician to the bedside 2 minutes into the arrest if nobody called: the nurse is first on
      // scene with the defibrillator, and the shock is still hers to give
      id: 'rn-physician-at-code', when: (s) => nurseRun(s) && !s.pulse && has(s, 'arrest') && !calledForHelp(s) && s.minute >= s.flags.arrest + 2,
      effect: () => ({ say: [['physician', 'I\'m here — I heard the alarm. Is he shockable? Pads on, shock him, and straight back to compressions!', 'warn']] }),
    },
    {
      id: 'rn-rosc', when: (s) => nurseRun(s) && has(s, 'rosc') && (calledForHelp(s) || s.minute >= s.flags.rosc + 2 || s.fired.includes('rn-physician-at-code')),
      effect: (s) => ({ say: [['physician', `${s.fired.includes('rn-physician-at-code') ? '' : 'I\'m here — I heard the alarm. '}Good shock. Keep the pads on, repeat the 12-lead, and he still goes to the lab the moment it's ready.`]] }),
    },

    // ─── both runs ───
    {
      id: 'md-rosc', when: (s) => doctorRun(s) && has(s, 'rosc'),
      effect: (s) => ({ say: [['nurse', `He's opening his eyes — pressure ${s.vitals.sbp} over ${s.vitals.dbp}.`]] }),
    },
    {
      // a first troponin an hour or so into an occlusion can be near normal: it never decides a STEMI
      id: 'troponin-back', when: (s) => has(s, 'labs') && s.minute >= s.flags.labs + 15,
      effect: () => ({ say: [['hospital', 'Lab: the first high-sensitivity troponin is back — just above the upper reference limit.']] }),
    },
  ],
  critical: [
    // ─── the ER nurse ───
    {
      id: 'rn-triage', label: 'Triage: ESI 2 — straight to a monitored bed', roles: ED_RN, points: 5, target: { by: 5 }, done: ['triage'],
      why: 'Chest pain that could be an acute coronary syndrome is at least ESI 2: a monitored bed now — not the waiting room, not registration first — and the physician told.',
    },
    {
      id: 'rn-ecg', label: '12-lead within 10 minutes of arrival — before registration or a chair in the waiting room', roles: ED_RN, points: 15, target: { by: 10 }, done: ['ecg12'],
      why: 'Every patient with chest pain gets a 12-lead within 10 minutes of arrival (2021 AHA/ACC chest pain guideline; 2025 ACC/AHA ACS guideline): it is the test that finds a STEMI, and every minute before it is a minute added to the time to the cath lab.',
    },
    {
      id: 'rn-show', label: 'Show the 12-lead to the ED physician the moment it prints', roles: ED_RN, points: 15, target: { within: { flag: 'ecg12', minutes: 2 } },
      why: 'The 12-lead is acted on by the physician, not filed: a STEMI on it means the cath lab is activated at once. Take it to the physician (SBAR, closed loop) — a tracing left on the printer delays everything after it.',
      done: (s) => firstDone(s, ['notify-physician'], 'ecg12'), uses: ['notify-physician', 'ecg12'],
    },
    {
      id: 'rn-pads', label: 'Monitor and defibrillation pads on', roles: ED_RN, points: 10, target: { by: 12 }, done: PADS,
      why: 'A large anterior STEMI is at high risk of VF in its first hours: with the monitor and the pads on, VF is seen at once and shocked in seconds — and the pads go with him to the lab.',
    },
    {
      id: 'rn-iv-labs', label: 'IV access, and blood drawn for the lab', roles: ED_RN, points: 5,
      why: 'The IV carries the heparin and the opioid; the blood (troponin, CBC, chemistry with creatinine and potassium, coagulation studies, type and screen) is sent and nobody waits for it.',
      done: (s) => allOf(firstDone(s, ['iv', 'io']), firstDone(s, ['labs'])), uses: ['iv', 'io', 'labs'],
    },
    {
      id: 'rn-aspirin', label: 'Aspirin 324 mg chewed, on the chest pain standing order', roles: ED_RN, points: 10, target: { by: 10 }, done: ['aspirin'],
      why: 'Aspirin 162–325 mg, non-enteric-coated and chewed, as soon as possible for every suspected ACS without a true allergy or active bleeding: it cuts the mortality of a STEMI (ISIS-2). It is on the chest pain standing order — no need to wait for the physician.',
    },
    {
      id: 'rn-sample', label: 'Allergies, medicines, history and last meal for the lab (SAMPLE)', roles: ED_RN, points: 5, done: ['sample'],
      why: 'The cath lab needs the allergies (contrast), the anticoagulants, the kidneys, the weight and the last meal — and his medicine list holds the clue that stops the nitroglycerin.',
    },
    {
      // asked only after a nitrate is no screen: the item then drops out, and the 'nitro-pde5' harm says what went wrong
      id: 'rn-pde5', label: 'Ask about erectile-dysfunction drugs before any nitrate — by name', roles: ED_RN, points: 5,
      done: askedBeforeNitrate, uses: ['ask-pde5'], applies: pde5ItemApplies,
      why: 'The standing order\'s nitroglycerin has exclusions: a systolic under 90, a suspected right ventricular infarct, and a PDE-5 inhibitor within 48 hours (tadalafil), 24 hours (sildenafil, vardenafil) or 12 hours (avanafil). Ask by name: his "pill for my prostate" is tadalafil 5 mg daily.',
    },
    {
      // a nitrate given after he named the tadalafil was not held: the 'nitro-pde5' harm scores it, and this item drops out
      id: 'rn-pde5-report', label: 'Hold the nitroglycerin and tell the physician about the tadalafil', roles: ED_RN, points: 5,
      applies: (s) => has(s, 'pde5-asked') && firstDone(s, ['nitro', 'nitro-high'], 'pde5-asked') === null,
      why: 'The physician plans the pain relief and the rest of his care on what you report: tadalafil this morning rules out every nitrate for 48 hours, so the pain needs another drug, on an order.',
      done: (s) => firstDone(s, ['notify-physician'], 'pde5-asked'), uses: ['notify-physician'],
    },
    ...RN_ORDERS.map(askCritical),
    {
      id: 'rn-help', label: 'Call for help as you shock', roles: ED_RN, points: 5, after: 'arrest', target: { within: { flag: 'arrest', minutes: 2 } }, applies: (s) => has(s, 'arrest'),
      why: 'A cardiac arrest is run by a team: shock first with the pads already on, and call out for the physician and more hands at the same time.',
      done: ['call-help', 'notify-physician'],
    },

    // ─── the ER doctor ───
    {
      id: 'md-activate', label: 'Read the 12-lead and activate the cath lab — no troponin, no repeat tracing first', roles: ED_MD, points: 20,
      target: { within: { flag: 'ecg12', minutes: 10 } }, done: ['cath-lab-activate'],
      why: 'ST elevation of 3–4 mm in V1–V4 with reciprocal depression meets STEMI criteria on the first tracing: one call from the ED physician activates the lab. A troponin (often near normal an hour in), a repeat 12-lead or a consult first only adds minutes to a goal of a device within 90 minutes of arrival (2025 ACC/AHA ACS guideline).',
    },
    {
      id: 'md-aspirin', label: 'Aspirin 162–325 mg chewed', roles: ED_MD, points: 10, target: { by: 10 }, done: ['aspirin'],
      why: 'Non-enteric-coated aspirin, chewed, as soon as possible for every suspected ACS without a true allergy or active bleeding: it cuts the mortality of a STEMI (ISIS-2).',
    },
    {
      id: 'md-pde5', label: 'Ask about erectile-dysfunction drugs before any nitrate', roles: ED_MD, points: 5,
      done: askedBeforeNitrate, uses: ['ask-pde5'], applies: pde5ItemApplies,
      why: 'No nitrate within 48 hours of tadalafil, 24 hours of sildenafil or vardenafil, or 12 hours of avanafil: together they can drop the pressure profoundly. His "pill for my prostate" is tadalafil 5 mg, taken this morning.',
    },
    {
      id: 'md-heparin', label: 'Anticoagulation: unfractionated heparin', roles: ED_MD, points: 10, target: { within: { flag: 'alert', minutes: 10 } }, done: ['heparin'],
      why: 'An anticoagulant goes with the aspirin for every STEMI on its way to primary PCI: unfractionated heparin 60 units/kg (at most 4,000) in the department, topped up in the lab to an ACT of 250–300 s.',
    },
    {
      id: 'md-p2y12', label: 'P2Y12 loading dose as the interventional cardiologist asks (ticagrelor 180 mg)', roles: ED_MD, points: 10, target: { within: { flag: 'alert', minutes: 10 } }, done: ['p2y12'],
      why: 'Ticagrelor or prasugrel is preferred over clopidogrel for PCI (2025 ACC/AHA ACS guideline). Loading before the angiogram of a primary PCI is optional — it may be considered (class 2b), and some wait to see the anatomy — so whether to load in the department or on the table is the interventional cardiologist\'s call: this one asks for ticagrelor 180 mg now.',
    },
    {
      id: 'md-analgesia', label: 'Treat the pain: IV fentanyl — no nitrates after tadalafil', roles: ED_MD, points: 5, done: ['fentanyl'],
      why: 'With nitrates ruled out and a beta-blocker unsafe with crackles, an IV opioid in small doses relieves the ischemic pain. Opioids slow the absorption of an oral P2Y12 inhibitor and never replace opening the artery.',
    },

    // ─── both ───
    {
      id: 'shock', label: 'Defibrillate the VF within 2 minutes', points: 15, after: 'arrest', target: { within: { flag: 'arrest', minutes: 2 } }, applies: (s) => has(s, 'arrest'),
      why: 'Witnessed VF on the monitor with the pads on is shocked at once: each minute without a shock lowers survival by about 7–10 %.',
      done: ['defib', 'aed'],
    },
    {
      id: 'post-ecg', label: '12-lead after ROSC', points: 5, after: 'rosc', applies: (s) => has(s, 'rosc'), done: ['ecg12-repeat', 'ecg12'],
      why: 'After ROSC record a 12-lead (2025 AHA): his still shows the anterior ST elevation — the artery is still closed, and he still goes straight to the lab.',
    },
    {
      id: 'handoff', label: 'Hand-off to the cath lab team', points: 5, done: ['handoff'],
      why: 'SBAR with the times (onset, arrival, 12-lead, activation), every drug with its dose and time (aspirin, heparin, ticagrelor, fentanyl), the tadalafil (no nitrates for 48 hours), the VF and the shock, allergies, weight, kidney function and the IV.',
    },
  ],
  harms: [
    {
      // the standing order's own exclusion: one rule for both roles, whether or not anyone asked
      id: 'nitro-pde5', actions: ['nitro', 'nitro-high'], when: (s) => s.pulse, points: 10, severity: 'major',
      replaces: ['nitro-high-not-hypertensive', 'rn-without-order-nitro-high'],
      text: 'Nitroglycerin within 48 hours of tadalafil. His "pill for my prostate" is tadalafil 5 mg, taken this morning: a PDE-5 inhibitor and a nitrate together can drop the pressure profoundly — no nitrate within 48 hours of tadalafil, 24 hours of sildenafil or vardenafil, 12 hours of avanafil. Ask by name before every nitrate (the chest pain standing order excludes it too); if the pressure falls, lay him flat and give a small fluid bolus, and treat the pain with a small dose of an IV opioid instead.',
    },
    {
      id: 'rate-drug-heart-failure', actions: ['metoprolol', 'diltiazem'], roles: ED_MD, when: (s) => s.pulse, points: 8, severity: 'major',
      text: 'An IV beta-blocker or diltiazem in an anterior STEMI with crackles at both bases. Signs of heart failure (Killip II or worse), a low-output state and a risk of cardiogenic shock are contraindications to early beta-blockade (ACC/AHA ACS guidelines): the drug takes away output the injured heart needs, and in COMMIT early IV metoprolol caused more cardiogenic shock than it prevented. An oral beta-blocker comes within 24 hours, once the heart failure has settled; diltiazem has no place in it.',
    },
    {
      // one penalty for the nurse: the drug is wrong for him, and it was never ordered
      id: 'rn-rate-drug-heart-failure', actions: ['metoprolol', 'diltiazem'], roles: ED_RN, when: (s) => s.pulse, points: 10, severity: 'major',
      replaces: ['rn-without-order-metoprolol', 'rn-without-order-diltiazem'],
      text: 'IV metoprolol or diltiazem with no order, in an anterior STEMI with crackles at both bases. With signs of heart failure they take away output the injured heart needs and can tip him into cardiogenic shock (COMMIT; ACC/AHA ACS guidelines) — and the ER nurse gives them only on the physician\'s order. Report the rate, the pressure and the lungs, and let the physician decide.',
    },
    {
      // after ROSC oxygen is titrated to an SpO₂ of 90–98 % (2025 AHA), and once his lungs fill (a blocker, or the wait for
      // the lab) he is breathless with a falling saturation: no mistake then
      id: 'oxygen-normoxic', actions: ['o2-nc', 'o2-nrb'], when: (s) => s.pulse && s.vitals.spo2 >= 90 && !has(s, 'rosc') && !has(s, 'worse-hf'), points: 3, severity: 'minor',
      text: 'Oxygen with an SpO₂ of 90 % or more. Oxygen is for an SpO₂ under 90 % in an acute coronary syndrome: routine oxygen gives no benefit (AVOID, DETO2X; 2025 ACC/AHA ACS guideline).',
    },
    {
      // one penalty for one fibrinolytic: before the 12-lead was read (the built-in rule) or after it, by either role
      id: 'lytic-pci-available', actions: ['tnk', 'alteplase'], points: 15, severity: 'critical', replaces: ['lytic-no-indication', 'rn-without-order-alteplase'],
      text: 'A fibrinolytic in a hospital whose own cath lab can open the artery. Primary PCI within 90 minutes of arrival opens more arteries with fewer strokes and bleeds; a fibrinolytic is for a STEMI that cannot reach PCI within 120 minutes. It adds a 1-in-100 risk of bleeding in the brain on top of the heparin and two antiplatelet drugs.',
    },
    {
      id: 'troponin-before-activation', actions: ['troponin-repeat'], roles: ED_MD, when: (s) => has(s, 'ecg-stemi') && !has(s, 'alert'), points: 5, severity: 'major',
      text: 'Waiting on a troponin before activating the cath lab. A STEMI is diagnosed on the 12-lead: an hour into an occlusion the troponin is often normal or barely raised, and the result takes an hour. Activate on the tracing; the troponin follows.',
    },
    {
      // a 12-lead after ROSC is right whatever else has been done
      id: 'repeat-ecg-before-activation', actions: ['ecg12', 'ecg12-repeat'], roles: ED_MD,
      when: (s) => s.pulse && has(s, 'ecg-stemi') && !has(s, 'alert') && !has(s, 'arrest'), points: 3, severity: 'minor',
      text: 'Another 12-lead before activating the cath lab. The first tracing already met STEMI criteria: a repeat is for a non-diagnostic one. Activate first; record the next one while the team is on its way.',
    },
    {
      id: 'admit-no-reperfusion', actions: ['admit'], roles: ED_MD, when: (s) => !has(s, 'alert'), points: 15, severity: 'critical',
      text: 'Admitting a STEMI without reperfusion. An occluded LAD needs the cath lab now — every 30 minutes of delay costs heart muscle and lives; a bed upstairs opens nothing.',
    },
    {
      id: 'transfer-pci-here', actions: ['transfer'], roles: ED_MD, when: (s) => !has(s, 'alert'), replaces: ['transfer-unstable'], points: 10, severity: 'major',
      text: 'Transferring a STEMI out of a hospital with its own cath lab. A transfer adds an hour or more to the time to the device: activate your own lab.',
    },
    {
      id: 'ct-delays-reperfusion', actions: ['ct-urgent'], roles: ED_MD, points: 5, severity: 'major',
      text: 'A CT scan before the cath lab, with nothing to suggest a dissection or a pulmonary embolism. It takes him out of the department, into a scanner, in the hours VF is most likely, adds a contrast load before the angiogram\'s own, and can delay the artery being opened. A tearing pain to the back, a pressure difference between the arms or a widened mediastinum would be a reason; he has none.',
    },
    {
      // with his own sinus rhythm there is nothing for an antiarrhythmic to treat; after the VF and the shock it is no mistake
      id: 'antiarrhythmic-no-arrhythmia', actions: ['lidocaine', 'amio-infusion', 'procainamide'], roles: ED_MD, when: (s) => s.pulse && !has(s, 'rosc'), points: 3, severity: 'minor',
      text: 'An antiarrhythmic with no arrhythmia to treat. Prophylactic lidocaine in an acute MI prevents some VF without saving lives, and amiodarone or procainamide only drop the pressure of a failing heart: the protection against VF is the monitor and the pads, a shock the moment it comes, and the artery opened.',
    },
    {
      // the nurse's amiodarone or procainamide is already scored as given without an order (the built-in rule, which keeps
      // working after ROSC); lidocaine is an arrest drug on her protocol, so with a pulse the case says it
      id: 'rn-lidocaine-no-arrhythmia', actions: ['lidocaine'], roles: ED_RN, when: (s) => s.pulse, points: 5, severity: 'major',
      replaces: ['rn-without-order-lidocaine'],
      text: 'Lidocaine with a pulse, and no order. With his own rhythm there is no arrhythmia to treat — prophylactic lidocaine in an acute MI prevents some VF without saving lives — and outside a code the ER nurse gives an antiarrhythmic only on the physician\'s order. The protection against VF is the monitor and the pads, and a shock the moment it comes.',
    },
    {
      // a bolus for the pressure a nitrate dropped is right (the physician asks for it): with a normal pressure it is not
      id: 'fluid-wet-lungs', actions: ['fluid'], when: (s) => s.pulse && s.vitals.sbp >= 100, points: 3, severity: 'minor',
      text: 'A fluid bolus with crackles at both bases and a normal pressure. His lungs are already wet (Killip II): volume he does not need backs up into them. A small bolus is for a pressure that has fallen — after a nitrate, for one.',
    },
    {
      // a falling pressure (after a nitrate or a blocker) is a reason; a normal one is not
      id: 'pressor-normal-pressure', actions: ['pressor', 'push-epi'], roles: ED_MD, when: (s) => s.pulse && s.vitals.sbp >= 100, replaces: ['pressor-no-hypotension'], points: 3, severity: 'minor',
      text: 'A vasopressor with a normal blood pressure. It raises the afterload and the oxygen demand of a heart whose artery is shut, and drives the rate; it is for a pressure that has fallen and does not come back with fluid.',
    },
  ],
  timings: TIMINGS,
  cathLabMinutes: CATH_MINUTES,
  teaching: [
    'Chest pain that could be an acute coronary syndrome is at least ESI 2, and gets a 12-lead within 10 minutes of arrival (2021 AHA/ACC chest pain guideline; 2025 ACC/AHA ACS guideline) — at triage, before registration or a chair in the waiting room — shown to the physician the moment it prints. Questions about insurance never delay the screening exam or the 12-lead (EMTALA).',
    'A STEMI on the first 12-lead is activated at once, with one call from the ED physician: no troponin (often normal an hour in), no repeat tracing and no consult first. The goal is a device within 90 minutes of arrival; the department\'s share is the 12-lead in 10 minutes, the call within minutes of it, and the patient ready when the team is.',
    'In a hospital with its own cath lab the answer is primary PCI: no fibrinolytic (that is for a STEMI that cannot reach PCI within 120 minutes), no transfer, and no admission instead.',
    'Aspirin 162–325 mg chewed, as soon as possible. Unfractionated heparin (60 units/kg, at most 4,000, in the department; the lab tops it up to an ACT of 250–300 s). A P2Y12 inhibitor — ticagrelor or prasugrel preferred over clopidogrel for PCI — given when and as the interventional cardiologist asks: routine loading before the angiogram in a STEMI is not of proven benefit, and some wait to see the anatomy.',
    'Nitroglycerin is held for a systolic under 90 (or 30 below baseline), a suspected right ventricular infarct, and a PDE-5 inhibitor within 48 hours (tadalafil), 24 hours (sildenafil, vardenafil) or 12 hours (avanafil). Ask by name: daily tadalafil 5 mg for an enlarged prostate is a PDE-5 inhibitor, and patients rarely call it one. If a nitrate drops the pressure: lay the patient flat and give a small fluid bolus.',
    'When nitrates cannot be used, small doses of an IV opioid (fentanyl 25–50 mcg) treat ongoing ischemic pain; opioids slow the absorption of an oral P2Y12 inhibitor, and no drug replaces opening the artery.',
    'Oxygen only for an SpO₂ under 90 %. No IV beta-blocker in the acute phase with signs of heart failure (crackles: Killip II or worse), a low output or a risk of cardiogenic shock; an oral beta-blocker within 24 hours once those have settled.',
    'VF is most likely in the first hours of a STEMI: monitor and pads on while waiting for the lab, and witnessed VF is shocked at once — no prophylactic antiarrhythmic before it (lidocaine prevents some VF without saving lives). After ROSC repeat the 12-lead; a STEMI after ROSC still goes straight to the lab.',
    'The ER nurse triages, records the 12-lead, gives what the chest pain standing order allows (aspirin, nitroglycerin within its exclusions), gives heparin, the P2Y12 and opioids on the physician\'s order, defibrillates per ACLS — and speaks up (SBAR, closed loop). The diagnosis, the activation and the orders are the physician\'s.',
  ],
};
