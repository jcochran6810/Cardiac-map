import type { Effect, Line, Scenario, SimState, Speaker } from '../types';
import { bpAfter, firstDone, has, PADS } from '../kit';
import { askCritical, askEvents, type LabAsk } from '../labKit';
import { DOOR_TO_ECG, ED_MD, ED_RN, edNurse, edOrder, physicianDispo } from '../edKit';

/**
 * Unstable atrial fibrillation in the emergency department. A 70-year-old woman with known paroxysmal AF and high blood
 * pressure comes in by ambulance: a fast, irregular rhythm at 170, a pressure of 78/50, cool and confused. She ran out of
 * her apixaban and her metoprolol five days ago, has been taking a pseudoephedrine cold tablet three times a day, and her
 * hydrochlorothiazide has left her potassium and magnesium low. Her thick, stiff hypertensive ventricle cannot fill at 170
 * without the atrial kick: the rate is what drops her pressure, so she is unstable, and the treatment is an immediate
 * synchronized shock (2025 AHA; 2023 ACC/AHA/ACCP/HRS AF guideline: COR 1), with procedural sedation sized for the low
 * pressure. The first 200 J shock does not hold; the second, at the device's maximum, does — once SYNC has been armed again,
 * since most defibrillators drop back to unsynchronized mode after every shock. Then the stroke risk (CHA₂DS₂-VASc 3, off
 * her anticoagulant for five days): the shock is never delayed for it in an unstable patient, but anticoagulation starts as
 * soon as she is stable and lasts at least 4 weeks (lifelong for her score); and the search for what set it off.
 *
 * The ER nurse (6) takes the crew's report, calls the physician, puts the pads on, gets the 12-lead, the line and the labs,
 * sets up for the sedation (capnography, the bag-mask, suction and an airway), delivers each shock on the physician's count
 * with SYNC armed, checks the pressure and reports the result, gives the heparin and the magnesium on the orders, and hands
 * her over. The computer ED physician sedates her (etomidate, pushed by the physician) and decides. The ER doctor (7) has a
 * computer nurse for the monitor, the pads, the line, the 12-leads and the sedation set-up, and makes every decision: the
 * stroke screen, the history, the sedation, the shocks, the anticoagulation, the work-up for a cause, and the admission.
 */

const AF = 'atrial-fibrillation';

/** Her weight (kg): the heparin and the etomidate doses */
const WEIGHT = 68;

/** Still fibrillating, with a pulse: as long as this lasts she is unstable */
const inAf = (s: SimState) => s.pulse && s.rhythm.profile === AF;

/** The rhythm has been restored (by a synchronized shock, or by the shock for the VF an unsynchronized one caused) */
const converted = (s: SimState) => has(s, 'converted');

/** The sedation for the shock is still working (etomidate lasts minutes, titrated midazolam a little longer) */
const sedatedNow = (s: SimState) => s.timers.sedatedUntil !== undefined && s.minute < s.timers.sedatedUntil;

/** The physician is at the bedside (called by the nurse, or come on their own), in the ER nurse's run */
const mdHere = (s: SimState) => has(s, 'md-present');

/** Capnography on, and the bag-mask, suction and an oral airway at the head of the bed */
const sedationReady = (s: SimState) => has(s, 'capno') && has(s, 'airway-ready');

/** Who notices a change beside the learner: the computer nurse in the doctor's run, a colleague in the nurse's */
const teammate = (s: SimState): Speaker => (s.role === 7 ? 'nurse' : 'team');

/** Awake enough to talk: a pulse, a GCS of 13 or more, and no sedation working */
const talks = (s: SimState) => s.pulse && s.vitals.gcs >= 13 && !sedatedNow(s);

/** Only a patient awake enough to talk says how she feels */
const awake = (s: SimState, text: string, tone?: Line[2]): Line[] =>
  (talks(s) ? [tone ? ['patient', text, tone] : ['patient', text]] : []);

/** Where she is admitted: the step-down unit, or the CCU once she has been in cardiac arrest */
const unit = (s: SimState) => (has(s, 'arrest') ? 'the CCU' : 'the step-down unit on telemetry');

/** A pressure taken after the conversion: what the nurse checks before she reports the result */
const PRESSURE_TAKEN = ['nibp', 'vitals', 'reassess', 'bp-both-arms'];

/** The GCS she wakes to: clear once her rhythm is back, still confused (or worse) while it is not */
function wakeGcs(s: SimState): number {
  if (converted(s)) return has(s, 'rosc') ? 14 : 15;
  return has(s, 'deepens') ? 9 : has(s, 'worse') ? 12 : 14;
}

/**
 * A synchronized shock with a pulse, in AF (`who` arms and charges the defibrillator; `mine`: the learner's own). The first
 * at 200 J does not hold: the same rhythm is back after a second's pause. The next, with SYNC armed again and the energy up
 * to this defibrillator's maximum, restores a regular rhythm — her pressure comes up at once
 */
function syncShock(s: SimState, who: Speaker, mine: boolean): Effect {
  const unsedated = !sedatedNow(s) && s.vitals.gcs >= 12;
  // the physician's word on an awake shock: a stop before the next one, or (once the shock has converted her) the lesson
  const stop: Line = has(s, 'sync-shock')
    ? ['physician', 'She was awake for that — she felt every bit of it. Nobody shocks an awake patient without sedation.', 'bad']
    : ['physician', 'Stop — she was awake! Nobody shocks her again until I have sedated her.', 'bad'];
  const felt: Line[] = unsedated
    ? [
        ['patient', '"AAGH! What was that?!" She is wide awake, crying and grabbing at the pads.', 'bad'],
        s.role === 6
          ? (mdHere(s) ? stop : ['team', 'She felt every bit of that — she was not sedated.', 'bad'])
          : ['nurse', 'She felt that — she was wide awake.', 'warn'],
      ]
    : [];
  if (!has(s, 'sync-shock')) {
    const hr = Math.max(150, s.rhythm.hr - 2);
    return {
      say: [
        [who, 'SYNC on: a marker sits on every R wave, none on the T waves. 200 J, charging… everyone clear — shock.'],
        ['monitor', `Synchronized shock delivered: 200 J. A second's pause — then the same fast, irregular complexes at ${hr}.`, 'warn'],
        ...felt,
        ...(s.role === 7 ? [['nurse', `No change — the same rate. The pads are still on and good; what next?`] as Line] : []),
      ],
      // 'you-shock1': the learner's own first shock (the nurse's item asks whether it came on the physician's count)
      rhythm: { profile: AF, hr }, flags: ['pads', 'monitor', 'sync-shock', 'shock1-failed', ...(mine ? ['you-shock1'] : [])],
    };
  }
  const bp = { sbp: Math.max(s.vitals.sbp, 98), dbp: Math.max(s.vitals.dbp, 60) };
  return {
    say: [
      [who, 'SYNC armed again — the defibrillator dropped out of it after the last shock — and the markers are back on every R wave. 360 J, the maximum on this defibrillator; charging… everyone clear — shock.'],
      ['monitor', `Synchronized shock delivered: 360 J. A pause — then a regular rhythm at 94. BP ${bp.sbp}/${bp.dbp}.`, 'good'],
      ...felt,
    ],
    rhythm: { profile: 'normal-sinus', hr: 94 },
    vitals: { ...bp, spo2: Math.max(s.vitals.spo2, 96), rr: Math.min(s.vitals.rr, 18) },
    flags: ['pads', 'monitor', 'sync-shock', 'cardioverted', 'converted', ...(mine ? ['you-converted'] : [])],
  };
}

/** A shock for the VF an unsynchronized shock caused: witnessed, with the pads on, it converts at once */
function vfShock(s: SimState, how: string): Effect | null {
  if (s.pulse || s.rhythm.profile !== 'vf') return null;
  return {
    say: [['monitor', `${how} An organized rhythm returns, regular at 104 — and a pulse with it.`, 'good'], [teammate(s), 'Femoral pulse, 104. She is not waking up yet.']],
    rhythm: { profile: 'sinus-tachycardia', hr: 104 }, pulse: true, vitals: { sbp: 92, dbp: 56, spo2: 93, rr: 14, gcs: 8 },
    flags: ['pads', 'monitor', 'shocked', 'converted'],
  };
}

/** An AV-nodal blocker in her: a little slower, and the pressure falls further (the rate was holding it up, not dropping it) */
function nodalBlocker(s: SimState, drug: string, dSbp: number, dDbp: number, hr: number): Effect | null {
  if (!s.pulse) return null;
  if (!inAf(s)) {
    const bp = bpAfter(s, -10, -6);
    return { say: [[edNurse(s), `${drug} in.`], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`, 'warn']], vitals: bp, flags: [drug === 'Diltiazem' ? 'diltiazem' : 'beta-blocker'] };
  }
  const bp = bpAfter(s, dSbp, dDbp);
  const rate = Math.min(s.rhythm.hr, hr);
  return {
    say: [
      [edNurse(s), `${drug} in.`],
      ['monitor', `Heart rate ${rate}, but BP falls to ${bp.sbp}/${bp.dbp}.`, 'bad'],
      [teammate(s), 'She is grayer and barely answering now.', 'bad'],
    ],
    rhythm: { profile: AF, hr: rate }, vitals: { ...bp, gcs: Math.min(s.vitals.gcs, 12) }, flags: [drug === 'Diltiazem' ? 'diltiazem' : 'beta-blocker'],
  };
}

/** Adrenergic drugs: the pressure comes up a little, but they speed AV conduction — the rate climbs */
function adrenergic(s: SimState, what: string, dSbp: number, dDbp: number, flag: string): Effect | null {
  if (!inAf(s)) return null;
  const bp = bpAfter(s, dSbp, dDbp, { sbp: 100, dbp: 62 });
  const hr = Math.min(180, s.rhythm.hr + 6);
  return {
    say: [[edNurse(s), what], ['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`], [teammate(s), 'A little more pressure — and an even faster rate.', 'warn']],
    rhythm: { profile: AF, hr }, vitals: bp, flags: [flag],
  };
}

// ─── The ED physician's orders, in the ER nurse's run ──────────────────────

/** What the physician says on first reaching the bedside, called by the nurse */
function mdFirstLook(s: SimState): Line {
  // an unsynchronized shock has already put her in arrest: the shock that is right now comes first
  if (!s.pulse) return ['physician', 'The ED physician runs in: "No pulse — shock her now, unsynchronized, 200 joules! Compressions if it does not work."', 'bad'];
  return ['physician', inAf(s)
    ? `The ED physician comes straight over and looks at the monitor: "${s.rhythm.hr}, irregular, ${s.vitals.sbp} over ${s.vitals.dbp} and confused — she is unstable, and the rate is why. We shock her, synchronized, and I will sedate her for it. Pads on, a line — and get set up for the sedation."`
    : 'The ED physician comes straight over and looks at the monitor: "A regular rhythm now — tell me exactly what happened, and get me a pressure."'];
}

/** The flag each drug's order sets when the physician gives it (labKit: asked-<order id>) */
const ORDER_ASKED: Record<string, string> = { heparin: 'asked-heparin', 'magnesium-sulfate': 'asked-magnesium' };

const HEPARIN: LabAsk = edOrder({
  id: 'heparin',
  // never an order for a drug that is already running (a nurse who gave it unordered is scored for that, once)
  when: (s) => mdHere(s) && converted(s) && s.pulse && !has(s, 'heparin') && (has(s, 'labs') || s.minute >= s.flags.converted + 3),
  // the order comes with the labs drawn or 3 minutes after the conversion, whichever is first: it claims no blood work
  ask: 'Her rhythm is back — now her stroke risk: off her apixaban for five days, and a cardioversion makes clots more likely for weeks. No bleeding history: heparin, please — 60 units per kilo IV, that is the 4,000 maximum, then 12 units per kilo an hour.',
  accept: ['heparin'],
  thanks: 'Thank you. She stays anticoagulated from now on.',
  fallback: 'I will give the heparin myself.',
  fallbackEffect: () => ({ flags: ['heparin', 'anticoagulated'] }),
  gives: 'heparin-given',
  label: 'Heparin on the physician\'s order, once her rhythm is back',
  why: 'A cardioversion — electrical or by drug — raises the risk of a clot for weeks: the atria stun and pump poorly while they recover. Anticoagulation starts as soon as possible (it never delays the shock in an unstable patient) and lasts at least 4 weeks (2023 ACC/AHA/ACCP/HRS AF guideline); with her CHA₂DS₂-VASc of 3, lifelong.',
  points: 10,
});

const MAGNESIUM: LabAsk = edOrder({
  id: 'magnesium',
  // after the conversion: a result back while she is still fibrillating does not hold up the shock, and the order speaks
  // of the rhythm coming back
  when: (s) => mdHere(s) && has(s, 'lytes-known') && converted(s) && s.pulse && !has(s, 'magnesium'),
  ask: 'Potassium 3.2 and magnesium 1.4 — both low on the hydrochlorothiazide, and both make this rhythm likelier to come back. Magnesium sulfate 2 grams IV over 15 minutes, please; I have ordered potassium chloride 40 mEq by mouth with it.',
  accept: ['magnesium-sulfate'],
  thanks: 'Thank you.',
  fallback: 'I will hang the magnesium myself.',
  fallbackEffect: () => ({ flags: ['magnesium'] }),
  gives: 'magnesium-given',
  doses: 1,
  label: 'Magnesium on the physician\'s order',
  why: 'A low potassium and magnesium make the atria irritable and the rhythm likelier to come back: replace them (potassium to 4, magnesium to 2) — part of treating what set it off.',
  points: 5,
  wait: 4,
});

export const edUnstableAf: Scenario = {
  id: 'unstable-af-cardioversion-ed',
  title: 'Racing heart, falling pressure',
  // the picker must not name the rhythm, answer "stable or unstable?" or name the treatment for the learner
  summary: '70-year-old woman brought in with a racing, irregular heartbeat, a pressure of 78 and new confusion. Decide fast, act safely — and think about what comes after.',
  setting: 'ed',
  roles: [6, 7],
  difficulty: 'intermediate',
  conditionId: 'atrial-fibrillation',
  briefing: {
    default: [
      ['team', 'Resus 1: EMS is two minutes out with a 70-year-old woman — a racing heart, a pressure of 78 and new confusion.'],
    ],
    6: [
      ['team', 'Charge nurse: "Resus 1 is yours: EMS is two minutes out with a 70-year-old woman — a racing heart, a pressure of 78 and new confusion. The ED physician is finishing with a patient in bed 4; call when you need them."'],
      ['ems', 'The crew wheels her in: pale and sweaty, eyes darting around the room. "Where am I? My heart won\'t slow down…"'],
    ],
    7: [
      ['team', 'Resus 1: EMS is bringing in a 70-year-old woman — a racing heart, a pressure of 78 and new confusion. Her nurse is at the bedside with you.'],
      ['ems', 'The crew wheels her in: pale and sweaty, eyes darting around the room. "Where am I? My heart won\'t slow down…"'],
    ],
  },
  initial: {
    rhythm: { profile: AF, hr: 170 },
    vitals: { sbp: 78, dbp: 50, spo2: 95, rr: 22, etco2: 30, pain: 0, gcs: 14, glucose: 142, temp: 37.1 },
  },
  // what the built-in safety rules read (types.ts Problem): magnesium 1.4 and potassium 3.2 on the hydrochlorothiazide
  problems: ['hypomagnesemia', 'hypokalemia'],
  facts: {
    ems: 'EMS: "70-year-old woman. Her daughter called: her mother has been confused for the last hour and says her heart is racing. On our monitor a fast, irregular rhythm around 170 the whole way, BP 78 over 50 and 80 over 52, sats 95 on room air, glucose 142. Cool and clammy, no chest pain. History of an irregular heartbeat and high blood pressure — she ran out of some of her pills last week, the daughter says; the bag is here. Two tries at a line, no luck, so nothing given. Seven minutes."',
    // the onset: last evening — about 14 hours, of a rhythm she has had before, off her anticoagulant for five days
    pde5: '"No."',
    lungs: 'Clear on both sides; no crackles, no wheeze.',
    perfusion: (s) => (converted(s)
      ? 'Color coming back; hands warmer; capillary refill 2 seconds; radial pulse regular and stronger; neck veins flat.'
      : 'Pale, cool and clammy; capillary refill 4 seconds; radial pulse fast, irregular and weak, varying beat to beat; neck veins flat; no leg swelling.'),
    // atrial fibrillation off anticoagulation, and confused: low flow, or an embolic stroke? The answer shapes the heparin
    neuro: (s) => {
      if (s.vitals.gcs >= 15) return 'Alert and oriented now; no facial droop, no arm drift, speech clear; moves everything: no sign of a stroke.';
      if (s.vitals.gcs >= 13) return 'Confused — she does not know the day or the place — but follows commands; no facial droop, no arm drift, speech not slurred; moves everything equally: no focal deficit.';
      // too drowsy for a stroke screen: only what can be seen without her help
      return 'Drowsy: opens her eyes to a loud voice and mumbles; the face is symmetric and she moves all four limbs to a pinch; pupils equal and reactive. No focal sign — but a full stroke screen has to wait until she is more awake.';
    },
    ecg12: (s) => {
      if (s.rhythm.profile === AF) {
        return `Atrial fibrillation with a rapid ventricular response, about ${s.rhythm.hr}: irregularly irregular narrow complexes, no P waves, a fibrillating baseline. Narrow QRS with no delta wave (not pre-excited — so a synchronized shock, and no worry about AV-nodal drugs racing down a pathway), no ST elevation.`;
      }
      if (s.rhythm.profile === 'normal-sinus') return `Sinus rhythm at ${s.rhythm.hr} after the cardioversion: a P wave before every QRS, a normal PR interval, narrow QRS, no ST elevation.`;
      if (s.rhythm.profile === 'sinus-tachycardia') return `Sinus tachycardia at ${s.rhythm.hr} after the defibrillation: a P wave before every QRS, narrow QRS, no ST elevation.`;
      return 'No 12-lead possible right now.';
    },
    cxr: 'Portable chest X-ray: normal heart size, clear lungs — no pneumonia and no edema; a normal mediastinum.',
    pocus: (s) => (inAf(s)
      ? 'Bedside ultrasound: a small, thick-walled left ventricle squeezing hard but barely filling between the fast beats; no pericardial effusion; the right ventricle is not dilated; the IVC is about 1.5 cm and narrows a little with each breath; the lungs slide, with A-lines. No tamponade, no strained right heart, no empty tank: the rate is what drops her pressure.'
      : 'Bedside ultrasound: the left ventricle squeezes well (ejection fraction about 60 %) and fills now; thick walls; no pericardial effusion; the right ventricle normal in size; the lungs slide, with A-lines.'),
    consult: (s) => {
      if (!s.pulse) return 'Cardiology: "Run the arrest — shock her now, unsynchronized. Call me back when she has a pulse."';
      if (inAf(s)) return 'Cardiology: "At 170 with a pressure of 78 and confused, she is unstable — shock her now, synchronized, with sedation sized for her pressure. Don\'t wait for me, and don\'t wait to anticoagulate first. Call me back when she has converted."';
      return `Cardiology: "Good. Keep her anticoagulated: heparin now, then her apixaban as soon as she is settled and swallowing — at least 4 weeks after a cardioversion, and lifelong with a CHA₂DS₂-VASc of 3. Restart her metoprolol once her pressure holds, no more decongestants, potassium and magnesium replaced, a TSH. Admit her to ${unit(s)}; I'll see her there and get an echo."`;
    },
    troponin: 'Repeat high-sensitivity troponin 38 ng/L (31 on the first): a small rise that fits the strain of hours at 170, with no chest pain and no ST elevation — the admitting team will follow it.',
  },
  status: (s) => {
    if (!s.pulse) return 'Unresponsive.';
    if (sedatedNow(s)) return 'Asleep from the sedation; breathing on her own, a steady capnography waveform.';
    if (has(s, 'rosc') && s.vitals.gcs < 13) return 'Unresponsive after the arrest, breathing on her own.';
    if (converted(s)) return s.vitals.gcs >= 15 ? '"My heart has stopped pounding… I feel so much better. Where am I?"' : 'Drowsy, slowly coming round.';
    if (has(s, 'deepens')) return 'Barely responding; mottled and gray.';
    if (has(s, 'worse')) return 'Drowsy, mumbling: "My heart… so fast…"';
    return '"My heart is racing… where am I? I feel like I\'m going to pass out."';
  },
  respond: {
    // in the doctor's run the nurse has already done these; in the nurse's run the pads put her on the monitor too
    monitor: (s) => (has(s, 'monitor') ? { blocked: true, say: [['system', 'She is already on the monitor.']] } : null),
    pads: (s) => (has(s, 'pads') ? { blocked: true, say: [['system', 'The pads are already on her, front and side.']] } : null),
    iv: (s) => (has(s, 'iv') ? { blocked: true, say: [['system', s.role === 7 ? 'The nurse already has a line in.' : 'She already has a line in.']] } : null),
    // a history from a confused patient: her own few words, then her pill bags and her daughter on the phone. Nobody
    // answers in cardiac arrest, and a patient too drowsy to talk (sedated, or coming round after the arrest) says nothing
    opqrst: (s) => {
      if (!s.pulse) return { blocked: true, say: [['system', 'Not in cardiac arrest: the history waits until there is a pulse.']] };
      if (sedatedNow(s)) return { blocked: true, say: [['system', 'She is asleep from the sedation: ask her when she wakes.']] };
      const daughter = 'Her daughter, on the phone: it started last night at about nine — her heart pounding and racing, and it has not stopped; no chest pain; this morning she felt faint and stopped making sense.';
      return talks(s)
        ? { say: [['patient', '"Last night… my heart started pounding, racing — it won\'t stop. No pain. I feel faint."'], ['you', daughter]], flags: ['opqrst'] }
        : { say: [['you', `She is too drowsy to tell you. ${daughter}`]], flags: ['opqrst'] };
    },
    sample: (s) => (s.pulse
      ? {
        say: [
          ...awake(s, '"My pills? I ran out… the heart ones. I meant to call the pharmacy."'),
          ['you', 'From her pill bags, and her daughter on the phone: apixaban 5 mg twice a day and metoprolol succinate 50 mg — both ran out five days ago and were not refilled; hydrochlorothiazide 25 mg, still taken. A "cold and sinus" tablet with pseudoephedrine three times a day for a head cold this week. No allergies. An irregular heartbeat found two years ago, and high blood pressure. No bleeding — no black stools, no blood in the urine, no falls; no alcohol. About 68 kg.'],
        ],
        flags: ['sample'],
      }
      : { blocked: true, say: [['system', 'Not in cardiac arrest: the history waits until there is a pulse.']] }),
    // the stroke screen means nothing while the sedation lasts
    neuro: (s) => (sedatedNow(s) ? { blocked: true, say: [['system', 'She is asleep from the sedation: check her once she wakes.']] } : null),
    labs: (s) => ({
      say: [['you', s.role === 7
        ? `Labs ordered ${has(s, 'iv') ? 'on the blood the nurse drew' : '— the nurse draws them with the line'}: CBC (bleeding, infection), a chemistry panel with magnesium (potassium, magnesium, the kidneys), lactate, troponin, coagulation, and a TSH with free T4 (the thyroid).`
        : 'Blood drawn and sent: CBC, a chemistry panel with magnesium, lactate, troponin, coagulation and a TSH.']],
      flags: ['labs'],
    }),
    // ready for the sedation: the bag-mask on oxygen, suction tested, an airway to hand (the physician sedates)
    bvm: (s) => {
      if (!s.pulse) return null;
      if (sedatedNow(s)) {
        return { say: [['you', `She is breathing on her own — EtCO₂ ${Math.max(32, s.vitals.etco2)} with a steady waveform: the bag-mask stays at the head of the bed, and a jaw thrust keeps her airway open.`]], flags: ['airway-ready'] };
      }
      if (s.vitals.gcs <= 8) return null;
      if (has(s, 'airway-ready')) return { blocked: true, say: [['system', 'The bag-mask, suction and an oral airway are already at the head of the bed.']] };
      return { say: [['you', 'Bag-valve-mask connected to oxygen at 15 L/min, suction on and tested, an oral airway and a nasal airway at the head of the bed — ready if the sedation slows her breathing.']], flags: ['airway-ready'] };
    },
    // the ER doctor's sedation for the shock: etomidate, the dose cut for her pressure (propofol would drop it further)
    'procedural-sedation': (s) => {
      if (!inAf(s)) return null;
      const bp = bpAfter(s, -4, -2);
      return {
        say: [
          ['you', `Etomidate 0.1 mg/kg IV — ${Math.round(0.1 * WEIGHT)} mg, a reduced dose for her pressure: her eyes close, no response to voice, still breathing on her own; the capnography waveform stays steady.`],
          ['monitor', `BP ${bp.sbp}/${bp.dbp}.`],
        ],
        vitals: { ...bp, gcs: Math.min(s.vitals.gcs, 6) },
        flags: ['sedation', 'procedural-sedation', ...(has(s, 'woke') ? ['resedated'] : [])],
        timers: { sedatedUntil: s.minute + 1 + 5 },
      };
    },
    // titrated midazolam is a fair sedation for the shock too — it drops her pressure more than etomidate does
    midazolam: (s) => {
      if (!inAf(s) || !has(s, 'iv')) return null;
      const bp = bpAfter(s, -8, -5);
      return {
        say: [[edNurse(s), 'Midazolam 1 mg IV, then 1 mg more two minutes later: eyes closed, rousable only to a firm shake, breathing on her own; the capnography waveform steady.'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`]],
        vitals: { ...bp, gcs: Math.min(s.vitals.gcs, 10) },
        flags: ['benzodiazepine', 'sedation', ...(has(s, 'woke') ? ['resedated'] : [])],
        timers: { sedatedUntil: s.minute + 0.5 + 10 },
      };
    },
    cardiovert: (s) => (inAf(s) ? syncShock(s, s.role === 7 ? 'nurse' : 'you', true) : null),
    // an unsynchronized shock can land on the T wave: VF. After a synchronized shock the device has dropped out of SYNC
    defib: (s) => {
      if (s.pulse) {
        const lapsed = inAf(s) && has(s, 'sync-shock');
        return {
          say: [['monitor', lapsed
            ? 'The defibrillator dropped out of SYNC after the last shock and nobody armed it again: this shock goes out unsynchronized and lands on a T wave — she goes limp and the monitor alarms!'
            : 'Unsynchronized shock delivered — it lands on a T wave: she goes limp and the monitor alarms!', 'bad']],
          rhythm: { profile: 'vf', hr: 0 }, pulse: false, flags: ['pads', 'monitor', 'iatrogenic-vf'],
        };
      }
      return vfShock(s, 'Shock delivered.');
    },
    // with her pulse the AED is not applied (the default refuses it); in the VF it shocks, as the manual defibrillator does
    aed: (s) => vfShock(s, 'AED: "Shock advised." Shock delivered.'),
    heparin: (s) => {
      if (!s.pulse) return null;
      // the physician may already have given it (the nurse's run): a second bolus is a medication error, not a choice
      if (has(s, 'heparin')) return { blocked: true, say: [['system', 'Heparin is already running: the bolus is given and the infusion is on. No second bolus.']] };
      return { say: [[edNurse(s), 'Heparin 4,000 units IV (60 units/kg, the maximum bolus), then an infusion at 820 units an hour (12 units/kg/h); an aPTT in 6 hours.']], flags: ['heparin', 'anticoagulated'] };
    },
    'magnesium-sulfate': (s) => {
      if (!s.pulse) return null;
      // in the nurse's run the order is for one dose, and the physician may have hung it already
      if (s.role === 6 && has(s, 'magnesium')) return { blocked: true, say: [['system', 'The magnesium is already running: a second dose needs a new order.']] };
      const bp = bpAfter(s, -4, -2);
      // potassium only once the result shows it is low (a potassium given blind can overshoot); by mouth only when awake
      const potassium = !has(s, 'lytes-known') ? '' : talks(s) ? ', with potassium chloride 40 mEq by mouth' : '; potassium chloride by mouth once she is awake enough to swallow';
      const slower = inAf(s) ? Math.max(150, s.rhythm.hr - 6) : null;
      return {
        say: [[edNurse(s), `Magnesium sulfate 2 g IV running over 15 minutes${potassium}.`], ...awake(s, '"I feel warm all over."'), ['monitor', `${slower ? `Heart rate ${slower}. ` : ''}BP ${bp.sbp}/${bp.dbp}.`]],
        vitals: bp, ...(slower ? { rhythm: { profile: AF, hr: slower } } : {}), flags: ['magnesium'],
      };
    },
    // a bolus helps a little, but the rate — not an empty tank — is what holds her pressure down
    fluid: (s) => {
      if (!inAf(s)) return null;
      const bp = bpAfter(s, 4, 2);
      return { say: [['monitor', `Bolus in. BP ${bp.sbp}/${bp.dbp}.`], [teammate(s), 'A touch better — but the rate has not budged.', 'warn']], vitals: bp, flags: ['fluid'] };
    },
    diltiazem: (s) => nodalBlocker(s, 'Diltiazem', -14, -10, 150),
    metoprolol: (s) => nodalBlocker(s, 'Metoprolol 5 mg', -12, -8, 156),
    // amiodarone slows the rate only a little over its 10 minutes, and its solvent drops the pressure
    'amio-infusion': (s) => {
      if (!inAf(s)) return null;
      const bp = bpAfter(s, -6, -4);
      const hr = Math.max(150, s.rhythm.hr - 6);
      return { say: [[edNurse(s), 'Amiodarone 150 mg running over 10 minutes.'], ['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`, 'warn']], rhythm: { profile: AF, hr }, vitals: bp, flags: ['amiodarone'] };
    },
    // the arrest push with a pulse: the solvent drops the pressure hard
    'amio-arrest': (s) => {
      if (!inAf(s)) return null;
      const bp = bpAfter(s, -20, -12);
      return { say: [[edNurse(s), 'Amiodarone 300 mg pushed.'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`, 'bad']], vitals: bp, flags: ['amiodarone'] };
    },
    // adenosine blocks the AV node for seconds: the atria keep fibrillating, so the same rhythm comes straight back
    adenosine6: (s) => (inAf(s) ? { say: [['monitor', `A few seconds of slower, wider-spaced beats, then back to about ${s.rhythm.hr}.`], ...awake(s, '"Whoa — my chest went tight."')], flags: ['adenosine'] } : null),
    adenosine12: (s) => (inAf(s) ? { say: [['monitor', `A few seconds of slower, wider-spaced beats, then back to about ${s.rhythm.hr}.`], ...awake(s, '"Whoa — my chest went tight."')], flags: ['adenosine'] } : null),
    // atropine speeds AV conduction: with fibrillating atria more impulses get through
    atropine: (s) => {
      if (!inAf(s)) return null;
      const hr = Math.min(180, s.rhythm.hr + 8);
      return { say: [['monitor', `Heart rate ${hr}.`]], rhythm: { profile: AF, hr }, flags: ['atropine'] };
    },
    pressor: (s) => adrenergic(s, 'Norepinephrine infusion running.', 14, 8, 'pressor'),
    'push-epi': (s) => adrenergic(s, 'Push-dose epinephrine given.', 12, 8, 'push-epi'),
    // calcium reverses part of what diltiazem did to the vessels and the squeeze; the fast rate is still the problem
    'calcium-chloride': (s) => {
      if (!inAf(s) || !has(s, 'diltiazem')) return null;
      const bp = { sbp: Math.max(s.vitals.sbp, 76), dbp: Math.max(s.vitals.dbp, 46) };
      return { say: [[edNurse(s), 'Calcium chloride 1 g in slowly over a few minutes; line flushed.'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`]], vitals: bp, flags: ['calcium'] };
    },
    // positive pressure cuts the blood returning to a heart that already cannot fill
    cpap: (s) => {
      if (!s.pulse || s.vitals.gcs <= 8) return null;
      const bp = bpAfter(s, -6, -4);
      return { say: [['you', 'CPAP applied at 5 cmH₂O.'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`, 'bad']], vitals: bp, flags: ['cpap'] };
    },
    // this hospital has cardiology and a step-down unit: nothing to transfer her for
    transfer: () => ({ blocked: true, say: [['system', 'Not needed: this hospital has cardiology on call and a step-down unit with telemetry. Admit her here.']] }),
    // nobody takes an unstable patient upstairs: the rate is treated here first
    admit: (s) => {
      if (inAf(s)) return { blocked: true, say: [['system', 'Not yet: no unit takes her with a rate of 170 and a pressure in the 70s. Treat what is dropping her pressure here, first.']] };
      if (!s.pulse) return null;
      return { say: [['hospital', `Cardiology accepts her to ${unit(s)}: heparin running, then her apixaban; her metoprolol restarted once her pressure holds; an echo tomorrow.`]], flags: ['dispo', 'admit'] };
    },
    // she leaves the department only awake: after procedural sedation the patient is watched (monitor, capnography, the
    // airway kit at hand) until back to baseline, and after the arrest until she is awake
    handoff: (s) => {
      if (!s.pulse) return null;
      if (sedatedNow(s)) return { blocked: true, say: [['system', 'Not yet: she is still asleep from the sedation. She stays here — on the monitor and capnography, the airway kit at hand — until she is awake and back to her baseline (reassess).']] };
      if (has(s, 'rosc') && s.vitals.gcs < 13) return { blocked: true, say: [['system', 'Not yet: she is not awake after the arrest. Keep her on the monitor and watch her airway until she is (reassess).']] };
      return null;
    },
    // a call for help brings the physician into the room too (with the charge nurse and respiratory therapy)
    'call-help': (s) => {
      if (s.role !== 6 || mdHere(s)) return null;
      return {
        say: [['team', 'The ED physician, the charge nurse and another nurse come into the room; respiratory therapy is on the way.'], mdFirstLook(s)],
        flags: ['help', 'physician-notified', 'md-present'],
      };
    },
    // the nurse's report: the first brings the physician; later ones get the physician's answer to what they say
    'notify-physician': (s) => {
      if (!mdHere(s)) return { say: [mdFirstLook(s)], flags: ['physician-notified', 'md-present'] };
      if (!s.pulse) return { say: [['physician', 'I see it — shock her now, unsynchronized! Compressions if it does not work.', 'bad']], flags: ['physician-notified'] };
      if (converted(s) && !has(s, 'result-reported')) {
        if (firstDone(s, PRESSURE_TAKEN, 'converted') === null) return { say: [['physician', 'What is her pressure now? Get me a set of vitals, please.', 'warn']], flags: ['physician-notified'] };
        return { say: [['physician', `${s.vitals.sbp} over ${s.vitals.dbp} and regular — that is what we wanted. Stay with her airway until she is awake.`]], flags: ['physician-notified', 'result-reported'] };
      }
      return { say: [['physician', 'Thanks — keep watching her, and tell me the moment anything changes.']], flags: ['physician-notified'] };
    },
  },
  events: [
    // ─── Both runs ───────────────────────────────────────────────────────
    {
      // a stiff, thick ventricle cannot keep filling at 170: left in it, she slides toward shock
      id: 'worse',
      when: (s) => inAf(s) && s.minute >= 10,
      effect: (s) => {
        const v = { sbp: Math.min(s.vitals.sbp, 70), dbp: Math.min(s.vitals.dbp, 42), spo2: Math.min(s.vitals.spo2, 92), rr: Math.max(s.vitals.rr, 26) };
        return {
          say: [[teammate(s), 'She is harder to rouse, and her pressure is dropping.', 'bad'], ['monitor', `BP ${v.sbp}/${v.dbp}. SpO₂ ${v.spo2}%.`, 'bad']],
          vitals: { ...v, gcs: Math.min(s.vitals.gcs, 12) }, flags: ['worse'],
        };
      },
    },
    {
      id: 'deepens',
      when: (s) => inAf(s) && s.minute >= 18,
      effect: (s) => {
        const v = { sbp: Math.min(s.vitals.sbp, 62), dbp: Math.min(s.vitals.dbp, 36), spo2: Math.min(s.vitals.spo2, 90), rr: Math.max(s.vitals.rr, 30) };
        return {
          say: [[teammate(s), 'She is barely responding — mottled knees, gray lips.', 'bad'], ['monitor', `BP ${v.sbp}/${v.dbp}. SpO₂ ${v.spo2}%.`, 'bad']],
          vitals: { ...v, gcs: Math.min(s.vitals.gcs, 9) }, flags: ['deepens'],
        };
      },
    },
    {
      // the sedation wears off (and again after a second dose)
      id: 'wakes',
      when: (s) => s.pulse && has(s, 'sedation') && s.timers.sedatedUntil !== undefined && s.minute >= s.timers.sedatedUntil,
      effect: (s) => ({
        say: [converted(s) && wakeGcs(s) >= 15
          ? ['patient', 'She opens her eyes: "…Is it over? My heart has stopped pounding."', 'good']
          : [teammate(s), 'She is waking up from the sedation.']],
        vitals: { gcs: Math.max(s.vitals.gcs, wakeGcs(s)) }, flags: ['woke'],
      }),
    },
    {
      id: 'wakes-again',
      when: (s) => s.pulse && has(s, 'resedated') && s.timers.sedatedUntil !== undefined && s.minute >= s.timers.sedatedUntil,
      effect: (s) => ({ say: [[teammate(s), 'She is waking up from the sedation.']], vitals: { gcs: Math.max(s.vitals.gcs, wakeGcs(s)) } }),
    },
    {
      // back from the brief VF: she comes round over a few minutes
      id: 'rosc-wakes',
      when: (s) => s.pulse && has(s, 'rosc') && s.minute >= s.flags.rosc + 4 && !sedatedNow(s),
      effect: (s) => ({ say: [['patient', 'She opens her eyes, groggy: "What happened? My chest is sore."']], vitals: { gcs: Math.max(s.vitals.gcs, 14) } }),
    },
    {
      // with a normal rate the stiff ventricle fills again: the pressure comes up over the next minutes
      id: 'recovers',
      when: (s) => s.pulse && converted(s) && s.minute >= s.flags.converted + 3,
      effect: (s) => {
        const bp = { sbp: Math.max(s.vitals.sbp, 112), dbp: Math.max(s.vitals.dbp, 68) };
        return {
          say: [['monitor', `BP ${bp.sbp}/${bp.dbp}. SpO₂ 97%.`, 'good'], [teammate(s), 'Her color is back and her hands are warmer.']],
          vitals: { ...bp, spo2: Math.max(s.vitals.spo2, 97), rr: Math.min(s.vitals.rr, 16), etco2: 36 },
        };
      },
    },
    {
      // the blood work: the chemistry first, then the rest
      id: 'lytes',
      when: (s) => has(s, 'labs') && s.minute >= s.flags.labs + 5,
      effect: () => ({
        say: [['hospital', 'Lab: potassium 3.2 mmol/L and magnesium 1.4 mg/dL — both low; sodium 136, creatinine 1.0, glucose 142; lactate 3.4 mmol/L.', 'warn']],
        flags: ['lytes-known'],
      }),
    },
    {
      id: 'cbc',
      when: (s) => has(s, 'labs') && s.minute >= s.flags.labs + 6,
      effect: () => ({
        say: [['hospital', 'Lab: hemoglobin 13.1 g/dL, white count 8.6, platelets 241 — no sign of bleeding or infection; INR 1.0; high-sensitivity troponin 31 ng/L. TSH and free T4 to follow, in about an hour.']],
        flags: ['cbc-known'],
      }),
    },

    // ─── The ER nurse's run: the ED physician ──────────────────────────────
    {
      // not called: the physician sees her on the central monitor
      id: 'md-arrives',
      when: (s) => s.role === 6 && !mdHere(s) && s.minute >= 4,
      effect: (s) => ({
        say: [['physician', inAf(s)
          ? 'The ED physician hurries in: "I saw her on the central monitor — 170 and a pressure of 78. Why wasn\'t I called? She is unstable: we shock her, synchronized, with sedation. Pads, a line, and set up for the sedation."'
          : 'The ED physician hurries in: "I saw her monitor change from the desk. Why wasn\'t I called? Tell me exactly what happened, and get me a pressure."', 'warn']],
        flags: ['md-present', 'md-not-called'],
      }),
    },
    {
      // the physician cannot sedate or shock her without the pads and a line: asks for what is missing…
      id: 'md-ready-ask',
      when: (s) => s.role === 6 && mdHere(s) && inAf(s) && (!has(s, 'pads') || !has(s, 'iv')) && s.minute >= s.flags['md-present'] + 4,
      effect: (s) => {
        const need = [!has(s, 'pads') ? 'the pads on her' : '', !has(s, 'iv') ? 'a line in' : ''].filter(Boolean).join(' and ');
        return { say: [['physician', `I need ${need} — now. She cannot wait.`, 'warn']], flags: ['asked-ready'] };
      },
    },
    {
      // …and two minutes later has the charge nurse do it: a deteriorating patient is never left waiting on one person
      id: 'md-ready-fallback',
      when: (s) => s.role === 6 && has(s, 'asked-ready') && inAf(s) && (!has(s, 'pads') || !has(s, 'iv')) && s.minute >= s.flags['asked-ready'] + 2,
      effect: (s) => {
        const done = [!has(s, 'pads') ? 'puts the pads on her, front and side' : '', !has(s, 'iv') ? 'gets a line in: 20 G in the left forearm' : ''].filter(Boolean).join(', and ');
        return {
          say: [['physician', 'We cannot wait any longer.', 'warn'], ['team', `The charge nurse ${done}.`]],
          flags: [...(has(s, 'pads') ? [] : ['pads', 'monitor']), ...(has(s, 'iv') ? [] : ['iv'])],
        };
      },
    },
    {
      // the physician will not sedate without the monitoring and the airway kit
      id: 'md-prep-ask',
      when: (s) => s.role === 6 && mdHere(s) && inAf(s) && has(s, 'pads') && has(s, 'iv') && !sedationReady(s) && !has(s, 'md-sedated'),
      effect: () => ({ say: [['physician', 'Before I sedate her: capnography on, please, and the bag-mask on oxygen, suction and an oral airway at the head of the bed.']], flags: ['asked-prep'] }),
    },
    {
      id: 'md-prep-fallback',
      when: (s) => s.role === 6 && has(s, 'asked-prep') && !sedationReady(s) && s.minute >= s.flags['asked-prep'] + 3,
      effect: () => ({ say: [['physician', 'We cannot wait any longer — I will set it up myself.', 'warn']], flags: ['capno', 'airway-ready'] }),
    },
    {
      // the physician sedates her — and directs the shock: the first, or (after an unsedated one) the next at more energy
      id: 'md-sedates',
      when: (s) => s.role === 6 && mdHere(s) && inAf(s) && has(s, 'pads') && has(s, 'iv') && sedationReady(s) && !has(s, 'md-sedated'),
      effect: (s) => {
        const first = !has(s, 'sync-shock');
        const direct: Line = ['physician', first
          ? 'She is asleep. Synchronized cardioversion: SYNC on, check the markers sit on the R waves — 200 joules. Charge, everyone clear, and shock on my count.'
          : 'She is asleep. That last shock did not hold: go up to 360 joules and shock again — on my count.'];
        const asked = first ? 'asked-shock1' : 'asked-shock2';
        // the nurse's own midazolam is already working: no second drug on top of it
        if (sedatedNow(s)) {
          return {
            say: [['physician', 'She has had midazolam already — that needed my order. No more on top of it: she is sedated enough.', 'warn'], direct],
            flags: ['md-sedated', asked],
          };
        }
        const bp = bpAfter(s, -4, -2);
        return {
          say: [
            ['physician', `Etomidate 0.1 mg/kg — ${Math.round(0.1 * WEIGHT)} mg IV, a reduced dose for her pressure. I am pushing it now.`],
            ['patient', 'Her eyes close; she breathes on her own, and the capnography waveform stays steady.'],
            ['monitor', `BP ${bp.sbp}/${bp.dbp}.`],
            direct,
          ],
          vitals: { ...bp, gcs: Math.min(s.vitals.gcs, 6) },
          flags: ['sedation', 'procedural-sedation', 'md-sedated', asked, ...(has(s, 'woke') ? ['resedated'] : [])],
          timers: { sedatedUntil: s.minute + 5 },
        };
      },
    },
    {
      // the first shock did not hold: the next at more energy — the order says nothing about SYNC
      id: 'md-shock2',
      when: (s) => s.role === 6 && has(s, 'md-sedated') && has(s, 'shock1-failed') && inAf(s) && !has(s, 'asked-shock2'),
      effect: () => ({ say: [['physician', 'No change. Go up to 360 joules and shock again — on my count.']], flags: ['asked-shock2'] }),
    },
    {
      id: 'md-shock1-fallback',
      when: (s) => s.role === 6 && has(s, 'asked-shock1') && !has(s, 'sync-shock') && inAf(s) && s.minute >= s.flags['asked-shock1'] + 2,
      effect: (s) => {
        const e = syncShock(s, 'physician', false);
        return { ...e, say: [['physician', 'I will deliver it myself.', 'warn'], ...(e.say ?? [])] };
      },
    },
    {
      id: 'md-shock2-fallback',
      when: (s) => s.role === 6 && has(s, 'asked-shock2') && inAf(s) && s.minute >= s.flags['asked-shock2'] + 2,
      effect: (s) => {
        const e = syncShock(s, 'physician', false);
        return { ...e, say: [['physician', 'I will deliver it myself.', 'warn'], ...(e.say ?? [])] };
      },
    },
    {
      // the unsynchronized shock caused VF: the physician wants the shock that is right now
      id: 'md-vf',
      when: (s) => s.role === 6 && !s.pulse && has(s, 'iatrogenic-vf'),
      effect: (s) => ({
        say: [['physician', `${mdHere(s) ? '' : 'The ED physician runs in at the alarm: '}"She has lost her pulse — charge and shock her now, unsynchronized, 200 joules! Compressions if it does not work."`, 'bad']],
        flags: ['md-present'],
      }),
    },
    {
      id: 'md-vf-fallback',
      when: (s) => s.role === 6 && !s.pulse && has(s, 'iatrogenic-vf') && s.minute >= s.flags.arrest + 2,
      effect: (s) => {
        const e = vfShock(s, 'The physician takes over the defibrillator: shock delivered.') ?? {};
        return { ...e, say: [['physician', 'I am shocking her.', 'bad'], ...(e.say ?? [])] };
      },
    },
    {
      // heparin or magnesium the nurse gave before the order: the physician says so (the built-in rule scores it, once). The
      // first dose is judged against the minute the order came — not the live 'ordered:' flag, which a one-dose order clears
      // once it is used up
      id: 'md-unordered',
      when: (s) => s.role === 6 && mdHere(s) && s.pulse && Object.entries(ORDER_ASKED).some(([id, asked]) => {
        const first = s.performed.find((p) => p.id === id);
        return !!first && !(s.flags[asked] <= first.minute);
      }),
      effect: () => ({ say: [['physician', 'That went in before I ordered it. It is what she needs, so it stays — but tell me first, and give a drug once it is ordered.', 'warn']] }),
    },
    {
      // no repeat tracing yet: the physician asks for one
      id: 'md-post-ecg',
      when: (s) => s.role === 6 && mdHere(s) && converted(s) && s.pulse && s.minute >= s.flags.converted + 4 && !(s.lastEcg && s.lastEcg.minute >= s.flags.converted),
      effect: () => ({ say: [['physician', 'Can I have a repeat 12-lead now that her rhythm has changed, please?', 'warn']] }),
    },
    ...askEvents(HEPARIN),
    ...askEvents(MAGNESIUM),
    {
      // converted and anticoagulated: the physician decides where she goes
      id: 'md-dispo',
      when: (s) => s.role === 6 && converted(s) && s.pulse && (has(s, 'heparin-given') || has(s, 'heparin')) && s.minute >= s.flags.converted + 5,
      effect: (s) => physicianDispo(s, 'admit', `Cardiology accepts her to ${unit(s)}: heparin until she can take her apixaban again — at least 4 weeks after a cardioversion, and lifelong with a CHA₂DS₂-VASc of 3; her metoprolol restarted once her pressure holds; no more decongestants; potassium and magnesium replaced; the TSH to follow. Give report when they are ready for her.`),
    },

    // ─── The ER doctor's run: the ED nurse ─────────────────────────────────
    {
      id: 'rn-pads',
      when: (s) => s.role === 7 && s.minute >= 0.5 && !has(s, 'pads'),
      effect: (s) => ({
        say: [['nurse', 'Monitor on, and the defibrillator pads on her — front and side; the defibrillator is ready.'], ['monitor', `Monitor attached: heart rate ${s.rhythm.hr}.`]],
        flags: ['pads', 'monitor'],
      }),
    },
    {
      // the line and the blood (unless the doctor has put a line in already)
      id: 'rn-iv',
      when: (s) => s.role === 7 && s.minute >= 2 && !has(s, 'iv'),
      effect: () => ({ say: [['nurse', 'IV in: 18 G in the right antecubital, flushed; blood drawn and held — tell me what labs you want.']], flags: ['iv'] }),
    },
    {
      // the set-up for a sedation she will almost certainly need — whoever placed the line
      id: 'rn-sedation-setup',
      when: (s) => s.role === 7 && s.minute >= 2 && s.pulse && !has(s, 'airway-ready'),
      effect: (s) => ({
        say: [['nurse', `Capnography is on her (EtCO₂ ${s.vitals.etco2}), and the bag-mask on oxygen, suction and an oral airway are at the head of the bed in case you sedate her.`]],
        flags: ['capno', 'airway-ready'],
      }),
    },
    {
      // the nurse's 12-lead: the engine asks the doctor to read it
      id: 'rn-ecg',
      when: (s) => s.role === 7 && s.minute >= 2.5 && !has(s, 'ecg12') && s.pulse,
      effect: () => ({ say: [['nurse', '12-lead done — it is on the screen.']], flags: ['ecg12', 'monitor'] }),
    },
    {
      id: 'rn-post-ecg',
      when: (s) => s.role === 7 && converted(s) && s.pulse && s.minute >= s.flags.converted + 1 && !(s.lastEcg && s.lastEcg.minute >= s.flags.converted),
      effect: () => ({ say: [['nurse', 'Repeat 12-lead done now that her rhythm has changed — on the screen.']], flags: ['ecg12'] }),
    },
    {
      id: 'rn-vf',
      when: (s) => s.role === 7 && !s.pulse && has(s, 'iatrogenic-vf'),
      effect: () => ({ say: [['nurse', 'She has gone limp — I cannot feel a pulse!', 'bad']] }),
    },
  ],
  critical: [
    // only once she has arrested: the VF an unsynchronized shock causes is witnessed, with the pads on. First, so that a
    // hint in the arrest names the shock
    {
      id: 'arrest-shock', label: 'No pulse: defibrillate within 2 minutes', points: 15,
      why: 'The unsynchronized shock landed on a T wave and caused VF: witnessed, with the pads on, VF is defibrillated at once (now an unsynchronized shock is the right one) — every minute without a shock lowers survival.',
      done: ['defib', 'aed'], after: 'arrest', target: { within: { flag: 'arrest', minutes: 2 } }, applies: (s) => has(s, 'arrest'),
    },

    // ─── The ER nurse ──────────────────────────────────────────────────────
    {
      id: 'rn-ems', label: 'Take the EMS hand-off at the bedside', roles: ED_RN, done: ['ems-handoff'], points: 5, target: { by: 2 },
      why: 'The crew saw her at home: a fast, irregular rhythm at 170 the whole way, a pressure in the 70s and 80s, an hour of confusion, pills run out — and no line.',
    },
    {
      id: 'rn-call', label: 'Bring the ED physician to the bedside now', roles: ED_RN, done: ['notify-physician', 'call-help'], points: 10, target: { by: 3 },
      why: 'A rate of 170 with a pressure of 78 and new confusion is an unstable tachycardia: the shock, the sedation for it and the decisions behind them need the physician now. Call (SBAR, closed loop) as soon as you see her.',
    },
    {
      id: 'rn-pads', label: 'Defibrillator pads on at once', roles: ED_RN, done: PADS, points: 10, target: { by: 4 },
      why: 'An unstable tachycardia is shocked within minutes: with the pads on and the monitor reading through them, the synchronized shock can go the moment the physician has sedated her.',
    },
    {
      id: 'rn-neuro', label: 'Confused: a quick neuro check and stroke screen', roles: ED_RN, done: ['neuro'], points: 5,
      why: 'An irregular heartbeat, five days off her anticoagulant, and new confusion: low blood flow, or a clot to the brain? A facial droop, an arm drift or slurred speech would change the plan (the heparin above all) — tell the physician what you find.',
    },
    {
      id: 'rn-ecg', label: '12-lead within 10 minutes of arrival — without delaying the shock', roles: ED_RN, done: ['ecg12'], points: 5, target: { by: 10 },
      why: 'It names the rhythm before the shock changes it, and shows what the monitor cannot: a delta wave (pre-excitation) or ST elevation. In an unstable patient it is recorded while the shock is being prepared, never instead of it.',
    },
    { id: 'rn-iv', label: 'IV access', roles: ED_RN, done: ['iv', 'io'], points: 5, target: { by: 7 }, why: 'The sedation for the shock goes in IV — and EMS could not get a line.' },
    {
      id: 'rn-labs', label: 'Blood for the labs with the line', roles: ED_RN, done: ['labs'], points: 5, target: { by: 10 },
      why: 'What set it off? A blood count (bleeding, infection), potassium and magnesium, the thyroid, the troponin — and a baseline before heparin.',
    },
    {
      id: 'rn-prep', label: 'Before the sedation: capnography on, and the bag-mask, suction and an airway at the head of the bed', roles: ED_RN, points: 10,
      // the nurse's own actions, both started before the first dose of sedation. One started at the very minute the
      // physician gave up waiting and sedated (the fallback) came after it: it does not count
      done: (s) => {
        const capno = firstDone(s, ['capno']);
        const kit = firstDone(s, ['bvm']);
        const sedated = s.flags.sedation;
        if (capno === null || kit === null) return null;
        if (sedated !== undefined && (capno >= sedated || kit >= sedated)) return null;
        return Math.max(capno, kit);
      },
      uses: ['capno', 'bvm'],
      why: 'Procedural sedation can stop the breathing and drop the pressure: continuous ECG, pulse oximetry, a pressure every few minutes and waveform capnography (it shows a slowing or obstructed breath before the oxygen falls), with suction, a bag-mask on oxygen and an airway in reach — all ready before the first dose. The nurse watches the patient, not the procedure.',
    },
    {
      // the learner's own first synchronized shock, on the count. It applies as soon as a first shock is ordered or given:
      // a nurse who shocks on her own (awake, no order) has not done it, and the item must not drop out of the score
      id: 'rn-shock1', label: 'On the physician\'s count: SYNC on, markers on the R waves, 200 J — shock', roles: ED_RN, points: 15,
      done: (s) => (has(s, 'asked-shock1') && s.flags['you-shock1'] >= s.flags['asked-shock1'] ? s.flags['you-shock1'] : null), uses: ['cardiovert'],
      target: { within: { flag: 'asked-shock1', minutes: 1.5 } }, applies: (s) => has(s, 'asked-shock1') || has(s, 'sync-shock'),
      why: 'Synchronized cardioversion: press SYNC, check that a marker sits on every R wave (not on the T waves), select 200 J or more for this rhythm (2025 AHA), charge, call "everyone clear" and look, then hold the shock button until it fires on the next R wave.',
    },
    {
      id: 'rn-shock2', label: 'Shock again: SYNC armed again first, at the higher energy', roles: ED_RN, points: 15,
      // the converting shock, on the physician's count; it applies once ordered, or once a synchronized shock has converted
      // her (the nurse who gave both shocks on her own has not done it either)
      done: (s) => (has(s, 'asked-shock2') && s.flags['you-converted'] >= s.flags['asked-shock2'] ? s.flags['you-converted'] : null), uses: ['cardiovert'],
      target: { within: { flag: 'asked-shock2', minutes: 1.5 } }, applies: (s) => has(s, 'asked-shock2') || has(s, 'cardioverted'),
      why: 'Most defibrillators drop back to unsynchronized mode after every shock: before each repeat, press SYNC again and check the markers — an unsynchronized shock on an organized rhythm with a pulse can land on the T wave and cause VF. After a failed first shock, more energy (or an anterior–posterior pad position) is the next step.',
    },
    {
      id: 'rn-report', label: 'After the shock: a pressure, then report the result to the physician', roles: ED_RN, points: 10,
      done: (s) => (has(s, 'result-reported') ? s.flags['result-reported'] : null), uses: ['nibp', 'vitals', 'notify-physician'],
      target: { within: { flag: 'converted', minutes: 4 } }, applies: converted,
      why: 'A new rhythm on the screen is not yet a patient who is better: take a pressure, look at her breathing and the capnography, and tell the physician what you see — rate, rhythm, pressure, breathing (closed loop).',
    },
    {
      id: 'rn-post-ecg', label: 'A repeat 12-lead after the conversion', roles: ED_RN, done: ['ecg12', 'ecg12-repeat'], after: 'converted', points: 5, applies: converted,
      why: 'A baseline in her new rhythm: a delta wave, ischemia or a long QT now visible, and the tracing the admitting team compares against.',
    },
    askCritical(HEPARIN),
    askCritical(MAGNESIUM),
    {
      id: 'rn-sample', label: 'Her medicines: the anticoagulant, and when she last took it', roles: ED_RN, done: ['sample'], points: 5,
      why: 'From her pill bags and her daughter, for the chart, the physician and the admitting team: no apixaban for five days (her stroke risk, and the heparin), her metoprolol run out too (rebound), the decongestant and the diuretic (what set it off) — and no bleeding.',
    },
    { id: 'rn-handoff', label: 'Hand-off to the admitting unit\'s nurse', roles: ED_RN, done: ['handoff'], points: 5, why: 'The rhythm before and after, the two shocks and their energies, the sedation and how she woke, the heparin and the magnesium, the medicines she ran out of and the decongestant, her neuro check, and what is still pending (the TSH).' },

    // ─── The ER doctor ─────────────────────────────────────────────────────
    {
      id: 'md-ems', label: 'Take the EMS hand-off at the bedside', roles: ED_MD, done: ['ems-handoff'], points: 5, target: { by: 2 },
      why: 'A fast, irregular rhythm at 170 the whole way, a pressure in the 70s and 80s, an hour of confusion, pills run out — and no line.',
    },
    {
      id: 'md-neuro', label: 'Confused: a quick neuro exam — low flow, or a stroke?', roles: ED_MD, done: ['neuro'], points: 5,
      why: 'Five days off her anticoagulant with an irregular heartbeat, and confused: hypoperfusion clears with the rhythm, an embolic stroke does not — and a large one would change the heparin plan (no bolus, imaging first).',
    },
    {
      id: 'md-sample', label: 'The history: her anticoagulant, her medicines, any bleeding', roles: ED_MD, done: ['sample'], points: 10, target: { by: 10 },
      why: 'The stroke risk (no apixaban for five days), what set it off (no metoprolol, a pseudoephedrine cold tablet, hydrochlorothiazide) and whether she can be anticoagulated (no bleeding) — from her pill bags and her daughter while the line goes in.',
    },
    {
      id: 'md-sedation', label: 'Procedural sedation sized for her pressure, before the shock', roles: ED_MD, points: 10,
      done: (s) => {
        const sed = firstDone(s, ['procedural-sedation', 'midazolam']);
        const shock = firstDone(s, ['cardiovert']);
        return sed !== null && (shock === null || sed < shock) ? sed : null;
      },
      uses: ['procedural-sedation', 'midazolam'],
      why: 'Sedate an awake patient before a shock whenever the time allows (2025 AHA) — with a drug and a dose her pressure can take: etomidate 0.1–0.15 mg/kg, or small titrated doses of midazolam; propofol and full doses drop a pressure of 78 further. Monitor, capnography, suction and a bag-mask ready.',
    },
    {
      id: 'md-cardiovert', label: 'Unstable: synchronized cardioversion — 200 J, more energy if the first fails', roles: ED_MD, points: 20, target: { by: 10 },
      done: (s) => s.flags['you-converted'] ?? null, uses: ['cardiovert'],
      why: 'Hypotension and an acute change in mental status with a rate of 170: the rate is the cause, so the treatment is an immediate synchronized shock (2023 AF guideline: COR 1), starting at 200 J or more (2025 AHA). If it does not hold, SYNC armed again and more energy (or the pads front to back) — never a rate-slowing drug into a pressure of 78.',
    },
    {
      id: 'md-heparin', label: 'Anticoagulation: heparin as soon as her rhythm is back', roles: ED_MD, done: ['heparin'], points: 15,
      target: { within: { flag: 'converted', minutes: 10 } },
      why: 'Five days off her apixaban, and a cardioversion stuns the atria for weeks: anticoagulation starts as soon as possible (it never delays the shock in an unstable patient) and lasts at least 4 weeks after any cardioversion (2023 ACC/AHA/ACCP/HRS AF guideline) — lifelong for a CHA₂DS₂-VASc of 3 (age 65–74, female, high blood pressure). Heparin now; her apixaban once she is settled.',
    },
    {
      id: 'md-labs', label: 'Look for what set it off: labs for bleeding, infection, the thyroid, potassium and magnesium', roles: ED_MD, done: ['labs'], points: 10, target: { by: 12 },
      why: 'Infection, bleeding, the thyroid, low potassium or magnesium, alcohol, drugs and withdrawal (a beta-blocker stopped, a decongestant), a pulmonary embolism, ischemia: a cause left in place sends the rhythm straight back — and a bleed would change the anticoagulation.',
    },
    {
      id: 'md-mag', label: 'Replace the magnesium (and the potassium)', roles: ED_MD, done: ['magnesium-sulfate'], points: 5,
      target: { within: { flag: 'lytes-known', minutes: 10 } }, applies: (s) => has(s, 'lytes-known'),
      why: 'Potassium 3.2 and magnesium 1.4 on hydrochlorothiazide: both make the atria irritable and the rhythm likelier to come back. Magnesium sulfate 2 g IV and potassium by mouth — potassium to 4, magnesium to 2.',
    },
    { id: 'md-admit', label: 'Admit her to a monitored bed', roles: ED_MD, done: ['admit'], points: 5, why: 'A cardioversion for an unstable rhythm, heparin running, a rhythm that may come back, the cause to treat and the TSH pending: a monitored bed.' },
    { id: 'md-handoff', label: 'Hand-off', roles: ED_MD, done: ['handoff'], points: 5, why: 'The rhythm, the two shocks, the sedation, the anticoagulation plan (heparin, then apixaban for at least 4 weeks and lifelong), the causes found, and what is pending.' },
  ],
  harms: [
    // the central trap: a rate-slowing drug into a pressure the rate is holding down
    {
      id: 'diltiazem-unstable', actions: ['diltiazem'], when: (s) => s.pulse && (inAf(s) || s.vitals.sbp < 90), points: 15, severity: 'critical',
      text: 'IV diltiazem into a patient whose pressure is 78. Diltiazem dilates the vessels and weakens the squeeze: it slows the rate a little and drops the pressure further — and her pressure was low because of the rate. An unstable tachycardia (hypotension, an acute change in mental status, signs of shock) gets an immediate synchronized shock (2025 AHA; 2023 AF guideline: COR 1), not a rate-control drug. (In the ER nurse\'s run, no rate-control drug goes in without the physician\'s order — and this one should be questioned.)',
    },
    {
      id: 'metoprolol-unstable', actions: ['metoprolol'], when: (s) => s.pulse && (inAf(s) || s.vitals.sbp < 90), points: 15, severity: 'critical',
      text: 'IV metoprolol into a patient whose pressure is 78. A beta-blocker weakens the squeeze and slows the rate only a little: her pressure falls further, because it was low from the rate. An unstable tachycardia gets an immediate synchronized shock (2025 AHA), not a rate-control drug; her own metoprolol is restarted by mouth once her pressure holds. (In the ER nurse\'s run, no rate-control drug goes in without the physician\'s order.)',
    },
    {
      id: 'unsync-shock', actions: ['defib'], when: (s) => s.pulse && !(inAf(s) && has(s, 'sync-shock')), points: 15, severity: 'critical', replaces: ['shock-with-pulse'],
      text: 'An unsynchronized shock to a patient with a pulse. Without SYNC the shock fires at once, wherever it falls — on the T wave it can set off VF, as it did here. An unstable tachycardia with a pulse gets synchronized cardioversion: press SYNC and check that a marker sits on every R wave before you charge.',
    },
    {
      id: 'sync-not-rearmed', actions: ['defib'], when: (s) => s.pulse && inAf(s) && has(s, 'sync-shock'), points: 15, severity: 'critical', replaces: ['shock-with-pulse'],
      text: 'A second shock without SYNC armed again. Most defibrillators drop back to unsynchronized mode after every synchronized shock: the repeat went out unsynchronized, landed on the T wave and caused VF. Before every repeat cardioversion, press SYNC again and check the markers on the R waves (2023 AF guideline: confirm the energy is synchronized to the QRS — COR 1).',
    },
    {
      id: 'no-sedation', actions: ['cardiovert'], when: (s) => inAf(s) && s.vitals.gcs >= 12 && !sedatedNow(s), points: 8, severity: 'major',
      text: 'A synchronized shock to an awake patient without sedation. She is confused, not unconscious: she felt it, and will remember it. Sedate before a cardioversion whenever there is time (2025 AHA) — a reduced dose of a drug that spares the pressure (etomidate, or small titrated doses of midazolam), with the monitoring and the airway kit ready; it costs a minute. (The ER nurse shocks on the physician\'s count, once the physician has sedated her.)',
    },
    {
      id: 'rn-shock-without-physician', actions: ['cardiovert'], roles: ED_RN, when: (s) => s.pulse && !mdHere(s), points: 5, severity: 'major',
      text: 'A cardioversion with no physician in the room. The ER nurse cardioverts per ACLS and facility policy with the physician directing: the decision, the sedation it needs and the airway are the physician\'s. Call the physician first — this patient needed one at the bedside from the start.',
    },
    {
      id: 'amiodarone-before-shock', actions: ['amio-infusion'], roles: ED_MD, when: (s) => inAf(s) && !has(s, 'sync-shock'), points: 5, severity: 'major',
      text: 'Amiodarone instead of the shock. In an unstable patient a 10-minute infusion is too slow, its solvent drops the pressure, and it can convert the rhythm with no plan for the stroke risk: the treatment is an immediate synchronized shock. (After a failed shock, amiodarone to help the next one hold is fair — 2023 AF guideline.)',
    },
    {
      id: 'adenosine-irregular', actions: ['adenosine6', 'adenosine12'], roles: ED_MD, when: (s) => inAf(s), points: 3, severity: 'minor',
      text: 'Adenosine for an irregular tachycardia. It breaks circuits that run through the AV node (most regular narrow-complex tachycardias); fibrillating atria do not depend on the node, so the same rhythm came straight back after a few seconds — and the shock was delayed.',
    },
    {
      id: 'antiplatelet-no-acs', actions: ['aspirin', 'p2y12'], points: 3, severity: 'minor',
      text: 'An antiplatelet with no acute coronary syndrome. She has no chest pain and no ST elevation, and aspirin or a P2Y12 inhibitor is not stroke prevention for an irregular heartbeat (2023 AF guideline: aspirin instead of anticoagulation is harmful) — it adds bleeding to the heparin she needs.',
    },
    {
      // the same id as the built-in rule: the low pressure is the rate's, and a tube does not treat it
      id: 'rsi-no-indication', actions: ['rsi'], roles: ED_MD, when: (s) => s.pulse && !has(s, 'rosc'), points: 10, severity: 'major', replaces: ['rsi-unresuscitated'],
      text: 'Rapid sequence intubation for a low pressure that comes from a fast rate. She protects her airway and oxygenates; the induction drug and positive pressure drop the pressure further and can arrest a heart that cannot fill. Fix the rate (a sedated synchronized shock) first.',
    },
    {
      id: 'cpap-no-indication', actions: ['cpap'], when: (s) => s.pulse, replaces: ['cpap-hypotension', 'cpap-vomiting', 'cpap-preload-dependent', 'cpap-drowsy'], points: 5, severity: 'major',
      text: 'CPAP without breathing trouble. Her lungs are clear and her oxygen is fine; the positive pressure cuts the blood returning to a heart that already cannot fill, and with a systolic of 78 it deepens the shock.',
    },
    {
      // the built-in rule, same id (a deliberate exemption): here the bag-mask is readied at the head of the bed for the
      // sedation (the nurse's set-up item), not squeezed into an awake patient — its responder says so, before the shock and
      // after it alike (a late set-up is the rn-prep item's to miss), so no breaths are ever forced in to judge
      id: 'bvm-breathing', actions: ['bvm'], when: () => false, points: 3, severity: 'minor',
      text: 'Bag-mask ventilation for a patient who is breathing well: in this case the bag-mask is readied for the sedation.',
    },
  ],
  timings: [
    DOOR_TO_ECG,
    { label: 'Pads on', actions: ['pads'], flag: 'pads', target: 4 },
    { label: 'Door to the first synchronized shock', actions: ['cardiovert'], flag: 'sync-shock', target: 10 },
    { label: 'Door to a restored rhythm', actions: [], flag: 'converted', target: 12 },
    { label: 'Rhythm restored to heparin', actions: ['heparin'], flag: 'heparin', from: 'converted', target: 10 },
  ],
  teaching: [
    'A tachycardia with a pulse: first, stable or unstable — hypotension, an acute change in mental status, signs of shock, ischemic chest pain, acute heart failure. A rate of 150 or more is usually the cause. Unstable atrial fibrillation gets an immediate synchronized shock (2023 ACC/AHA/ACCP/HRS AF guideline: COR 1), starting at 200 J or more biphasic (2025 AHA; flutter 200 J, a regular narrow-complex tachycardia and monomorphic VT 100 J).',
    'Synchronized cardioversion: press SYNC and check that a marker sits on every R wave (not the T waves); charge; "everyone clear" and look; hold the button until it fires on the next R wave. Most defibrillators drop back to unsynchronized mode after every shock (some can be set to stay in SYNC — know your device): arm SYNC again and check the markers before each repeat. If the first shock does not hold: more energy (up to the device\'s maximum), a change of pad position (front to back), firm pressure on the pads in a large patient, or amiodarone before the next one (2023 AF guideline).',
    'Sedate an awake patient before the shock whenever there is time (2025 AHA), sized for the pressure: etomidate 0.1–0.15 mg/kg, or small titrated doses of midazolam; reduced doses with a low pressure; propofol drops it most (ketamine holds the pressure up, but it can speed an already fast rate). Continuous ECG, pulse oximetry, a pressure every few minutes and waveform capnography, with suction, a bag-mask on oxygen and an airway in reach before the first dose — and someone whose only job is to watch the patient.',
    'No diltiazem and no IV beta-blocker into a pressure of 78: they slow the rate a little and drop the pressure a lot, and the low pressure came from the rate. In a critically ill patient in whom beta-blockers and calcium-channel blockers do not work or cannot be given (as with this pressure), IV amiodarone may be considered for rate control (2023 AF guideline: 2b) — it can convert the rhythm, so the stroke risk comes with it — and after a failed shock it can help the next one hold. It never replaces the shock in an unstable patient. Adenosine does not stop atrial fibrillation.',
    'The stroke risk never delays the shock in an unstable patient. Anticoagulation starts as soon as possible — heparin, or her DOAC — and lasts at least 4 weeks after any cardioversion, because the atria stun and pump poorly for weeks (2023 AF guideline: COR 1); long-term by CHA₂DS₂-VASc (recommended at 2 or more in men, 3 or more in women — hers is 3: age 65–74, female, high blood pressure). A stable patient in AF for 48 hours or more (or for an unknown time) needs 3 weeks of anticoagulation or imaging to exclude a clot before an elective cardioversion. Aspirin is not stroke prevention.',
    'Confusion in atrial fibrillation off anticoagulation: low flow or an embolic stroke? Do a quick neuro exam before the heparin — hypoperfusion clears with the rhythm, a stroke does not.',
    'Look for what set it off, or it comes straight back: infection and sepsis, bleeding, the thyroid, low potassium or magnesium (a thiazide), alcohol, stimulants and decongestants (pseudoephedrine), a beta-blocker stopped (rebound), a pulmonary embolism, ischemia, hypoxia. Hers: no metoprolol or apixaban for five days, a pseudoephedrine cold tablet, and a potassium of 3.2 and magnesium of 1.4 on hydrochlorothiazide.',
    'The ER nurse calls the physician the moment she sees an unstable patient, puts the pads on, gets the line, the labs and a 12-lead without delaying the shock, sets up the sedation monitoring and the airway kit, delivers each shock on the physician\'s count with SYNC armed, takes a pressure and reports the result, watches the airway until the patient wakes, and gives each drug on an order. (Who pushes the sedative depends on the state Board of Nursing and hospital policy; in this case the physician pushes it.)',
  ],
};
