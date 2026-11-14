import type { Effect, Line, PendingRead, Scenario, SimState, Speaker } from '../types';
import { PADS, atRate, bpAfter, count, firstDone, has, line, paced } from '../kit';
import { MD, TECH, askCritical, askDone, askEvents, askHarm, type LabAsk } from '../labKit';
import { ANTITHROMBOTIC_RULES, NITRATE_RULES, SEDATIVE_RULES, nitrateRulesExcept } from '../rules/acs';

/**
 * Complete heart block with a slow wide escape, sent up from the emergency department for a temporary transvenous pacing
 * wire. The learner bridges her (pads on, transcutaneous pacing with analgesia and sedation, or a chronotrope drip),
 * the wire goes to the RV apex and is tested and set with a safety margin — and then the wire works its way through the
 * thin apex of an 81-year-old heart: capture is lost, the diaphragm twitches, and blood collects in the pericardium.
 * The tech runs the pacing box and calls out; the nurse paces, sedates and watches the pressure; the cardiologist decides
 * and operates.
 *
 * The action list has no separate threshold test or output setting yet (see the case writer's notes): the threshold and
 * the safety margin are said in words when the wire goes in (the tech's call-out, or the cardiologist's own line), and the
 * learner's choices are the bridge, the pads, the wire, and what they do when it stops working.
 */

/** A real fluoroscopy frame of a temporary wire at the RV apex (another patient's, as its caption says) */
const IMAGES: Partial<Record<string, string>> = { 'wire-position': 'temp-pacing-wire-rv-apex' };

/** Her own rhythm: complete heart block with a slow wide escape */
const BLOCK = 'third-degree-avb';

/** The patient's own escape is driving the heart (no pacer, no wire capturing) */
const ownRhythm = (s: SimState) => s.pulse && s.rhythm.profile === BLOCK;

/** The pressure brought up to at least this — never down from a higher one */
const atLeast = (s: SimState, sbp: number, dbp: number) => ({ sbp: Math.max(s.vitals.sbp, sbp), dbp: Math.max(s.vitals.dbp, dbp) });

/** Only a patient awake enough to talk says how she feels */
const awake = (s: SimState, text: string): Line[] => (s.pulse && s.vitals.gcs >= 13 ? [['patient', text]] : []);

/** Blood in the pericardium is squeezing the heart and has not been drained */
const squeezed = (s: SimState) => has(s, 'tamponade') && !has(s, 'drained');

/** The wire has moved and is not pacing the ventricle (until it is pulled back and seated again) */
const wireOut = (s: SimState) => has(s, 'capture-lost') && !has(s, 'recaptured');

/** The cardiologist's echo was done before the wire came through the wall: it cannot be the look for the new effusion */
const echoBeforePerforation = (s: SimState) => s.performed.some((p) => p.id === 'echo' && p.minute < (s.flags.perforated ?? Infinity));

/**
 * First minute one of `ids` was started once `from` was set and before `until` was: a call-out (or the fluid) only counts
 * while the problem it is about is still there — once the operator has fixed it, saying it is no longer the call-out
 */
function doneWhile(s: SimState, ids: string[], from: string, until: string): number | null {
  const start = s.flags[from];
  if (start === undefined) return null;
  const end = s.flags[until] ?? Infinity;
  const hit = s.performed.find((p) => ids.includes(p.id) && p.minute >= start && p.minute < end);
  return hit ? hit.minute : null;
}

/** Analgesia or sedation for the pads pacing: given before it starts (premedication) or after, it is the same care */
const COMFORT = ['fentanyl', 'midazolam', 'sedation'];

const TECH_WIRE = 'Bipolar pacing catheter (5 Fr, balloon-tipped) opened, flushed and handed up; the pacing box checked with a fresh battery and set: rate 70, output 5 mA, demand mode; the bridging cable ready, distal to negative, proximal to positive. Fluoroscopy over the heart.';
const THRESHOLD_WORDS = 'Output down from 5 mA a step at a time… she paces down to 0.8 mA and loses it at 0.7 — straight back up. Threshold 0.8 mA. Output set to 3 mA, about four times the threshold; rate 70, demand mode. Sensitivity left at 2 mV: she has too little rhythm of her own to test it safely.';

const tamponadeRead: Omit<PendingRead, 'minute'> = {
  kind: 'clinical', answer: 'clin-tamponade', prompt: 'What is happening to her circulation now?',
  explain: 'Cardiac tamponade: the wire came through the thin apex of the right ventricle, and the blood that leaked into the pericardium now squeezes the heart so it cannot fill — a falling pressure, distended neck veins, a pulse that fades as she breathes in. A paced heart cannot speed up to make up for it: the rate stays at 70 while the pressure falls. Drain it (echo-guided pericardiocentesis), support the pressure with fluid meanwhile, and keep the wire pacing.',
};

/** What the echo shows at each stage */
function echoWords(s: SimState): string {
  if (has(s, 'drained')) return 'A thin rim of fluid left around the heart; the right ventricle fills normally. The wire lies in the RV cavity.';
  if (squeezed(s)) return 'The effusion is now 1.6 cm all around the heart: the right ventricle collapses in diastole and the IVC is plethoric.';
  if (has(s, 'perforated')) return 'A new pericardial effusion, about 1 cm, at the apex and along the RV free wall; the right ventricle still fills in diastole. The wire tip sits right at the edge of the apex.';
  return `Normal LV size and function, EF about 60 %; mild LV hypertrophy; no pericardial effusion.${has(s, 'wire-paced') ? ' The wire runs along the RV to the apex.' : ''}`;
}

/** The pads pacer: the bridge before the wire, and the backup when the wire stops working */
function padsPacing(s: SimState, lead: Line[], again: boolean): Effect {
  // the pressure comes up only as far as the effusion lets it
  const bp = squeezed(s) ? { sbp: s.vitals.sbp, dbp: s.vitals.dbp } : atLeast(s, 104, 62);
  const comfortable = has(s, 'analgesia') || has(s, 'sedation');
  return {
    say: [
      ...lead,
      ['monitor', `Heart rate 70. BP ${bp.sbp}/${bp.dbp}.`],
      ...awake(s, comfortable ? '"It thumps… but I can bear it."' : '"Ow — what is that thumping?"'),
    ],
    rhythm: { profile: 'tcp', hr: 70 },
    // perfused again she wakes up — more slowly after a cardiac arrest
    vitals: { ...bp, gcs: Math.max(s.vitals.gcs, has(s, 'rosc') ? 13 : again ? 14 : 15), pain: Math.max(s.vitals.pain, comfortable ? 3 : 6) },
    // 'tcp-on' marks the bridge (what the analgesia and the capture check are judged from); a restart after the wire
    // moved is 'tcp-again'
    flags: ['pads', 'monitor', 'paced', 'rate-support', again ? 'tcp-again' : 'tcp-on'],
  };
}

/** The wire goes in under fluoroscopy, to the RV apex, and is tested and set (by the learner as cardiologist, or the operator) */
function wireIn(s: SimState, who: Speaker): Effect {
  const bp = atLeast(s, 108, 64);
  const off: string[] = [];
  if (has(s, 'tcp-on') || has(s, 'tcp-again') || has(s, 'tcp-arrest')) off.push('the pads pacer goes to standby, the pads stay on');
  if (has(s, 'pressor')) off.push('the epinephrine drip is weaned off');
  const tail = off.length ? ` ${off.join('; ').replace(/^./, (c) => c.toUpperCase())}.` : '';
  const words: Line[] = who === 'you'
    ? [
      ['you', 'Bipolar wire up the right femoral vein under fluoroscopy, across the tricuspid valve and down to the RV apex.'],
      ['monitor', 'A burst of fast, wide beats as the wire crosses the valve; it stops by itself.', 'warn'],
      ['you', `${THRESHOLD_WORDS.replace('Output down from 5 mA', 'Threshold test: output down from 5 mA')} Sheath sutured, sterile sleeve locked, the depth at the hub noted.${tail}`],
    ]
    : [
      ['operator', 'Wire going up the femoral vein… across the tricuspid valve.'],
      ['monitor', 'A burst of fast, wide beats as the wire crosses the valve; it stops by itself.', 'warn'],
      ['operator', `Tip at the RV apex — pacing at 70. Sheath sutured, sleeve locked.${tail}`],
    ];
  return {
    say: [...words, ['monitor', `Heart rate 70. BP ${bp.sbp}/${bp.dbp}.`], ...awake(s, '"I feel more awake… and it doesn\'t thump any more."')],
    rhythm: { profile: 'paced', hr: 70 }, vitals: { ...bp, gcs: Math.max(s.vitals.gcs, has(s, 'rosc') ? 13 : 15), pain: Math.min(s.vitals.pain, 1) },
    image: { id: 'wire-position', view: 'Fluoroscopy: a temporary wire with its tip at the RV apex (a real frame, another patient)', image: IMAGES['wire-position'] },
    flags: ['temp-wire', 'paced', 'wire-paced', 'rate-support'],
  };
}

/** The wire pulled back out of the wall and seated again in the RV: it paces once more */
function rewire(s: SimState, who: Speaker): Effect {
  const bp = squeezed(s) ? { sbp: s.vitals.sbp, dbp: s.vitals.dbp } : atLeast(s, 104, 62);
  return {
    say: [
      [who, 'Fluoroscopy: the wire tip has pushed out past the edge of the heart shadow at the apex — through the wall. Pulled back into the right ventricle and seated again: it paces down to 1.0 mA. Output 3 mA, rate 70. The hiccups stop.'],
      ['monitor', `Heart rate 70. BP ${bp.sbp}/${bp.dbp}.`],
      ...(has(s, 'tcp-again') ? [line('team', 'Pads pacer back to standby; the pads stay on.')] : []),
    ],
    rhythm: { profile: 'paced', hr: 70 }, vitals: { ...bp, pain: Math.min(s.vitals.pain, 3) }, flags: ['paced', 'recaptured'],
  };
}

/**
 * The pericardium drained: the heart fills again (in an arrest, the circulation comes back). With a pulse the needle goes
 * in under echo; in the arrest there is no time for one, and the lab's fluoroscopy guides it. The flag 'supported' closes
 * the nurse's "support her pressure" request: once the heart fills, fluid is no longer that support
 */
function drain(s: SimState, who: Speaker): Effect {
  const bp = paced(s) ? { sbp: 108, dbp: 64 } : { sbp: 82, dbp: 46 };
  const how = s.pulse || has(s, 'echo')
    ? 'Echo-guided pericardiocentesis from below the xiphoid'
    : 'Emergency pericardiocentesis under fluoroscopy, from below the xiphoid while the compressions go on';
  return {
    say: [
      [who, `${how}: 160 mL of blood out, a drain left in.`],
      ['monitor', `Heart rate ${s.rhythm.hr}. BP ${bp.sbp}/${bp.dbp}.`, 'good'],
      ...(s.pulse ? awake(s, '"Oh — I can breathe again."') : [line('you', 'A pulse with every beat again.', 'good')]),
    ],
    vitals: { ...bp, gcs: s.pulse ? 15 : 13, rr: 18 }, pulse: true, flags: ['pericardiocentesis', 'drained', 'supported'],
  };
}

/**
 * Nitroglycerin once the wire has come through the wall (before that the engine's own response stands): the pressure falls
 * as the filling falls, and the pain, which is pericardial, does not ease
 */
function nitrateAfterWire(s: SimState, high: boolean): Effect | null {
  if (!s.pulse || !has(s, 'perforated')) return null;
  const bp = high ? bpAfter(s, -20, -10) : bpAfter(s, -10, -6);
  return {
    say: [['monitor', `BP ${bp.sbp}/${bp.dbp}.`, 'bad'], ...awake(s, '"It still hurts when I breathe in."')],
    vitals: bp, flags: high ? ['nitro', 'nitro-high'] : ['nitro'],
  };
}

/** A drug that suppresses the escape (or the AV node) drops the rate to 22 — unless a pacer drives the heart */
function slower(s: SimState, text: string): Effect {
  if (!ownRhythm(s)) return { say: [['monitor', `No change: the pacer holds the rate at ${s.rhythm.hr}.`]] };
  const v = s.vitals;
  return {
    say: [['monitor', text, 'bad'], ['patient', 'She stops answering and her eyes roll back.', 'bad']],
    rhythm: { profile: BLOCK, hr: 22 }, vitals: { sbp: Math.min(v.sbp, 58), dbp: Math.min(v.dbp, 32), gcs: Math.min(v.gcs, 9) },
  };
}

/**
 * A beta-blocker takes away the adrenaline a ventricular escape leans on, and slows it; diltiazem barely touches an escape
 * this low, but it opens the vessels and weakens the squeeze. Paced, the rate holds and the pressure falls
 */
function blocker(s: SimState, flag: string, slowsEscape: boolean): Effect {
  if (ownRhythm(s) && slowsEscape) return { ...slower(s, 'Heart rate 22.'), flags: [flag] };
  const bp = bpAfter(s, -14, -8);
  return { say: [['monitor', `The rate stays at ${s.rhythm.hr}, but the BP falls to ${bp.sbp}/${bp.dbp}.`, 'bad']], vitals: bp, flags: [flag] };
}

const TECH_ASKS: LabAsk[] = [
  {
    // the nurse paces on the pads once they are on: the operator then wants the wire and the box
    id: 'tw', when: (s) => has(s, 'rate-support'), early: true,
    ask: 'She\'s paced on the pads for now. Temp wire and the box, please: rate 70, output 5, demand.',
    accept: ['temp-wire'],
    thanks: 'Thanks — 5 French bipolar, box at 70 and 5 milliamps. Got it.', fallback: 'I\'ll open the wire and set the box myself.', gives: 'wire-in-hand',
    label: 'Pacing wire and box ready, as asked',
    why: 'A bipolar pacing catheter and a checked generator (fresh battery, rate 70, output 5 mA, demand), the cable connected distal to negative and proximal to positive — before the operator needs it.',
  },
  {
    id: 'threshold', when: (s) => has(s, 'wire-paced'), points: 10,
    ask: 'She\'s pacing off the wire. Threshold, please: walk the output down until we lose it, then set it with a margin — and call it out.',
    accept: ['callout'],
    thanks: 'Threshold 0.8, output 3 — good margin. Thanks.', fallback: 'I\'ll run the threshold myself.', gives: 'threshold-known',
    fallbackEffect: () => ({ say: [['operator', THRESHOLD_WORDS]] }),
    label: 'Threshold test and output called out',
    why: 'Turn the output down until capture is lost (the threshold: under 1 mA in a good position), straight back up, and set the output at 2–3 times the threshold or more — thresholds climb over the first days, and an output just above the threshold loses capture with the smallest change. Call the numbers out, closed loop.',
  },
  {
    // the echo shows the new effusion: the tray goes on the table before anyone needs it
    id: 'tray', when: (s) => has(s, 'effusion'), early: true, points: 10,
    ask: 'There\'s a new effusion on the echo. Open the pericardiocentesis tray, please — I want it on the table before we need it.',
    accept: ['pericardiocentesis'],
    thanks: 'Thanks — tray ready.', fallback: 'Where\'s the pericardiocentesis tray? I\'ll open it myself.', gives: 'tray-ready',
    label: 'Pericardiocentesis tray open when the effusion is seen',
    why: 'A wire through the RV wall can fill the pericardium within minutes: needle, wire, drain and a bag on the table, and the echo probe in a sterile sleeve, before the pressure falls.',
  },
];

const RN_ASKS: LabAsk[] = [
  {
    id: 'rn-rate', role: 4, when: () => true, early: true, points: 10,
    ask: 'Rate 32, pressure 84 — and the atropine in the ED did nothing. Get her rate up while I set up for the wire, please.',
    accept: ['pace', 'pressor'], wrong: ['atropine'],
    wrongSay: 'Atropine didn\'t touch it downstairs, and it won\'t for a block this low. Pace her — pads, now.',
    thanks: 'Good — keep it going until the wire is in.', fallback: 'I\'ll start the pacer myself.', gives: 'rate-asked-done',
    fallbackEffect: (s) => (ownRhythm(s) ? padsPacing(s, [['monitor', 'Pacer on: rate 70, output turned up to 70 mA.']], false) : {}),
    label: 'Get the rate up: transcutaneous pacing (or an epinephrine drip)',
    why: 'Unstable bradycardia that atropine has not helped: pace through the pads (rate 70, output up until every spike captures), or start an epinephrine 2–10 mcg/min or dopamine 5–20 mcg/kg/min drip. A wide escape means the block is below the AV node, where atropine rarely works.',
  },
  {
    // nitroglycerin, metoprolol and diltiazem each carry their own penalty here: the operator's word only. The request
    // names no cause: the read of what is happening is still the learner's to give
    id: 'rn-support', role: 4, when: (s) => has(s, 'tamponade'), points: 10,
    ask: 'Her pressure is falling — support it, please.',
    accept: ['fluid', 'push-epi', 'pressor', 'phenylephrine'], wrong: ['nitro', 'nitro-high', 'metoprolol', 'diltiazem'],
    wrongSay: 'No! That drops it further. Fluid, wide open.',
    thanks: 'Thanks — keep it running.', fallback: 'Open the fluids, someone!', gives: 'supported',
    fallbackEffect: (s) => {
      const bp = bpAfter(s, 8, 5);
      return { say: [['team', `Fluid running wide open. BP ${bp.sbp}/${bp.dbp}.`]], vitals: bp, flags: ['fluid'] };
    },
    label: 'Support the pressure in the tamponade (fluid wide open)',
    why: 'Fluid keeps the squeezed heart filling until the pericardium is drained; push-dose epinephrine, phenylephrine or a pressor drip bridges if it is not enough. Nitroglycerin and AV-nodal blockers drop the pressure further.',
  },
];

/** What every role hears first: the ED's story, and how she arrives on the table (no pads) */
const BRIEF: Line[] = [
  ['team', 'From the emergency department: 81-year-old woman, 58 kg, fainted twice at home today. Heart rate in the low 30s since she arrived, BP in the 80s. Atropine 1 mg IV in the ED 20 minutes ago: no change. Potassium 4.4, troponin normal. The ED physician called cardiology for a temporary pacing wire; the pacemaker team can implant a permanent device tomorrow.'],
  ['scene', 'She is on the table, pale and clammy, slow to answer. She came up on the ED\'s transport monitor; their pads went back down with their defibrillator. An 18 G IV in the left forearm.'],
];

export const cathlabTempWire: Scenario = {
  id: 'heart-block-temp-wire-cathlab',
  title: 'Fainting at 32 a minute: the temporary wire',
  summary: '81-year-old woman who fainted twice, with a heart rate of 32 and a pressure of 84, sent up for a temporary pacing wire. Bridge her, place the wire — and keep watching it once it is in.',
  setting: 'cathlab',
  roles: [3, 4, 5],
  difficulty: 'advanced',
  conditionId: 'third-degree-av-block',
  images: IMAGES,
  briefing: {
    default: BRIEF,
    3: [...BRIEF, ['team', 'You are the tech: the room, the monitor and the recording system, the 12-lead, the pacing wire and the pacing box — and calling out every change you see. The nurse is at her side.']],
    4: [...BRIEF, ['team', 'You are the procedural nurse: her rhythm, pressure and comfort, the pads and the pacer, and the drugs. The cardiologist\'s orders include fentanyl 25 mcg and midazolam 0.5–1 mg IV as needed for comfort during pacing. The tech is at the table.']],
    5: [...BRIEF, ['team', 'You are the cardiologist: every choice from here is yours. The tech and the nurse are with you.']],
  },
  initial: {
    rhythm: { profile: BLOCK, hr: 32 },
    vitals: { sbp: 84, dbp: 48, spo2: 95, rr: 18, etco2: 34, pain: 0, gcs: 14, glucose: 132, temp: 36.5 },
  },
  facts: {
    // awake, she answers for herself; too drowsy, the chart and her daughter on the phone do (the engine says it as hers)
    allergies: 'No allergies. Yes — anything to stop me fainting.',
    sample: (s) => (s.vitals.gcs >= 13
      ? 'No allergies. Amlodipine and atorvastatin — no beta-blocker, no digoxin, nothing new. High blood pressure. My doctor said last year my heart tracing showed a "bundle branch block".'
      : 'From the ED chart and her daughter (she is too drowsy to answer): no allergies; amlodipine and atorvastatin — no beta-blocker, no digoxin, nothing new; high blood pressure; an ECG last year showed a bundle branch block.'),
    opqrst: (s) => {
      if (s.vitals.gcs <= 12) return '(Too drowsy to answer. The ED nurse\'s note: no chest pain — she fainted twice, and felt everything go gray first.)';
      if (squeezed(s)) return 'I can\'t get my breath — and I feel faint again.';
      if (has(s, 'perforated') && !has(s, 'recaptured')) return 'Sharp, low in my chest — worse when I breathe in. And these hiccups!';
      return 'No chest pain. Everything just went gray, and I was on the floor — twice today.';
    },
    labs: 'From the ED: potassium 4.4, magnesium 2.0, creatinine 1.0, hemoglobin 12.6, glucose 132; high-sensitivity troponin 9 ng/L (normal); TSH normal.',
    lungs: 'Clear.',
    perfusion: (s) => {
      if (squeezed(s)) return 'Neck veins distended to the jaw; cool and clammy; the pulse fades each time she breathes in.';
      if (paced(s)) return 'Warmer hands, capillary refill 3 seconds; neck veins flat.';
      return 'Pale, cool hands; slow capillary refill; irregular cannon waves in the neck veins.';
    },
    neuro: (s) => (s.vitals.gcs >= 15 ? 'Oriented and answering promptly.' : 'Slow to answer but oriented; no focal deficit.'),
    ecg12: (s) => {
      if (s.rhythm.profile === 'tcp') return 'Transcutaneous pacing at 70: a large pacing spike before every wide QRS — electrical capture. The P waves march on at their own rate underneath.';
      if (s.rhythm.profile === 'paced') return 'Pacing from the wire at 70: a small spike before every wide QRS, shaped like a left bundle branch block with a left (superior) axis — the tip is in the RV apex, and every spike captures.';
      // the profile draws the block alone: a bipolar wire's small spikes, firing on with nothing after them, are easy to miss
      if (wireOut(s)) return `No paced QRS complexes: the block is back, with its wide escape at ${s.rhythm.hr}, while the box still fires at 70 — the wire has lost capture (a bipolar wire's small spikes are easy to miss).`;
      return `Complete heart block: P waves at about 76/min march through on their own; a wide-complex escape at ${s.rhythm.hr}/min has no relationship to them. No ST elevation. A wide escape means the block is below the AV node (her old ECG showed a bundle branch block): atropine is unlikely to help, and the escape can stop.`;
    },
    echo: echoWords,
  },
  status: (s) => {
    if (!s.pulse) return 'Unresponsive.';
    // too drowsy to talk (the escape slowing, or just after an arrest): no words in her mouth
    if (s.vitals.gcs <= 9) return 'She groans to a firm rub of the sternum and does not open her eyes.';
    if (s.vitals.gcs <= 12) return s.rhythm.profile === 'tcp' ? 'Drowsy: she grimaces with every thump of the pacer.' : 'Drowsy: she opens her eyes to her name and mumbles.';
    if (squeezed(s)) return '"I feel faint… I can\'t get my breath."';
    if (wireOut(s) && s.rhythm.profile === BLOCK) return '"Everything\'s going gray…"';
    if (has(s, 'perforated') && !has(s, 'recaptured')) return '"Hic — it hurts when I breathe in — hic…"';
    if (s.rhythm.profile === 'tcp') return has(s, 'analgesia') || has(s, 'sedation') ? '"It thumps, but I can bear it."' : '"Ow — that thumping hurts!"';
    if (s.rhythm.profile === 'paced') return '"I feel much more awake."';
    return '"I feel like I\'m going to pass out."';
  },
  respond: {
    // her escape is below the AV node: atropine speeds the sinus node, not the ventricles
    atropine: (s) => (ownRhythm(s) ? { say: [['monitor', `No change in heart rate: ${s.rhythm.hr}.`]], flags: ['atropine'] } : null),
    pace: (s) => {
      if (!ownRhythm(s)) return null;
      return padsPacing(s, [['monitor', 'Pacer on: rate 70, output turned up to 70 mA.']], has(s, 'capture-lost'));
    },
    // the new pain after the wire is pleuritic, from the pericardium: a nitrate does not touch it, it only drops the pressure
    nitro: (s) => nitrateAfterWire(s, false),
    'nitro-high': (s) => nitrateAfterWire(s, true),
    // an epinephrine (or dopamine) drip speeds the escape a little and lifts the pressure: a bridge too
    pressor: (s) => {
      if (!ownRhythm(s)) return null;
      const bp = atLeast(s, 98, 58);
      return {
        say: [['you', 'Epinephrine infusion at 4 mcg/min.'], ['monitor', `Heart rate 44. BP ${bp.sbp}/${bp.dbp}.`, 'good']],
        rhythm: { profile: BLOCK, hr: 44 }, vitals: { ...bp, gcs: Math.max(s.vitals.gcs, has(s, 'rosc') ? 13 : 15) }, flags: ['pressor', 'rate-support'],
      };
    },
    'pulse-check': (s) => {
      if (!s.pulse) return null;
      if (s.rhythm.profile === 'tcp') return { say: [['you', 'Femoral pulse at 70, matching the pacer: mechanical capture.', 'good']] };
      // with blood around the heart the pulse is weak and fades as she breathes in (pulsus paradoxus): a finding, not a name
      if (s.rhythm.profile === 'paced' && squeezed(s)) return { say: [['you', 'Femoral pulse at 70 with every paced beat — weak, and it fades each time she breathes in.', 'warn']] };
      if (s.rhythm.profile === 'paced') return { say: [['you', 'Femoral pulse at 70, one with every paced beat.', 'good']] };
      return null;
    },
    nibp: (s) => (s.pulse && paced(s)
      ? { say: [['monitor', `NIBP ${s.vitals.sbp}/${s.vitals.dbp} mmHg; the pleth rises with every pacer beat, 70 a minute.`]], flags: ['bp'] }
      : null),
    // too drowsy to weigh it (just after an arrest): the wire cannot wait, so it goes ahead on emergency consent
    consent: (s) => (s.pulse && s.vitals.gcs < 13
      ? { say: [['you', 'Too drowsy to consent: emergency consent for the wire, documented; her daughter, on the phone, agrees. No allergies on the ED chart; no anticoagulants.']], flags: ['consent'] }
      : null),
    'access-venous': () => ({ say: [['you', 'Right common femoral vein under ultrasound: 6 Fr sheath in, flushed.']], flags: ['venous'] }),
    'temp-wire': (s) => {
      if (s.role === 3) return { say: [['you', TECH_WIRE]], flags: ['temp-wire-ready'] };
      // no venous sheath, or no circulation: the engine's own refusal
      if (s.role !== 5 || !has(s, 'venous') || !s.pulse) return null;
      return wireIn(s, 'you');
    },
    // the pacing catheter pulled back out of the wall and seated again (before the wire moved there is nothing to fix)
    reposition: (s) => {
      if (!has(s, 'wire-paced')) return { blocked: true, say: [['system', 'There is no catheter in the heart yet.']] };
      if (!wireOut(s)) return { say: [['you', 'The wire sits well at the RV apex and paces at 70: it stays where it is.']] };
      return rewire(s, 'you');
    },
    echo: (s) => ({ say: [['you', echoWords(s)]], flags: ['echo', ...(has(s, 'perforated') ? ['effusion'] : [])] }),
    pericardiocentesis: (s) => {
      if (s.role !== 5) return null;
      if (has(s, 'drained')) return { blocked: true, say: [['system', 'Already drained: the drain is in.']] };
      // in the arrest the blood around the heart is the reason for it, and there is no time for an echo: the needle goes in
      // under fluoroscopy (with a pulse, the echo first — it shows the effusion and the safest way in)
      if (!s.pulse && squeezed(s)) return drain(s, 'you');
      if (!has(s, 'echo')) return { blocked: true, say: [['system', 'Get the echo first: it shows whether there is an effusion and guides the needle.']] };
      if (!has(s, 'perforated')) return { blocked: true, say: [['system', 'The echo showed no pericardial effusion: there is nothing to drain.']] };
      return drain(s, 'you');
    },
    fluid: (s) => {
      if (!s.pulse) return null;
      const bp = bpAfter(s, 10, 6);
      return { say: [['monitor', `Fluid running wide open. BP ${bp.sbp}/${bp.dbp}.`]], vitals: bp, flags: ['fluid'] };
    },
    // the venous sheath stays in with the wire until the permanent pacemaker: nothing to close
    hemostasis: (s) => ({ blocked: true, say: [['system', has(s, 'venous') ? 'The venous sheath stays in with the pacing wire: it comes out with the wire, after the permanent pacemaker.' : 'There is no sheath in yet.']] }),
    'closure-device': () => ({ blocked: true, say: [['system', 'There is no arterial sheath to close: the wire went in through the vein, and its sheath stays in.']] }),
    callout: (s) => {
      if (s.role !== 3 && s.role !== 4) return null;
      // the wire has stopped pacing: say it, and get the pads pacing (the nurse turns them on; the tech's nurse does)
      if (wireOut(s) && !has(s, 'lost-called')) {
        // already back on the pads (the learner restarted them, or a teammate did): say what the wire did, not today's 70
        if (!ownRhythm(s)) {
          const onPads: Line = ['you', '"The wire\'s lost capture — she dropped to 30 with the box still firing at 70, and she\'s hiccupping with every spike. The pads are pacing her now."'];
          return { say: [onPads, ['operator', 'I see it — keep the pads going. Fluoro on.']], flags: ['callout', 'lost-called'] };
        }
        const called: Line = ['you', `"No capture — she's at ${s.rhythm.hr}, pressure ${s.vitals.sbp}! The box is still firing at 70 — and she's hiccupping with every spike."`];
        const restart = padsPacing(s, s.role === 4
          ? [called, ['operator', 'I see it — pads, now!'], ['you', `Pads pacing ${has(s, 'tcp-on') ? 'back ' : ''}on at 70, output up until every spike captures.`]]
          : [called, ['operator', 'I see it — pads back on!'], ['team', 'Nurse: "Pads pacing at 70."']], true);
        return { ...restart, flags: [...(restart.flags ?? []), 'callout', 'lost-called'] };
      }
      if (squeezed(s) && !has(s, 'tamponade-called')) {
        return {
          say: [['you', `"Pressure's ${s.vitals.sbp} and falling — and her rate can't climb to make up for it: she's paced at ${s.rhythm.hr}."`], ['operator', 'I see it — that effusion is squeezing her. I\'m draining it.']],
          flags: ['callout', 'tamponade-called'],
        };
      }
      if (s.role === 3 && has(s, 'asked-threshold') && !has(s, 'threshold-called')) return { say: [['you', THRESHOLD_WORDS]], flags: ['callout', 'threshold-called'] };
      return null;
    },
    lidocaine: (s) => ({ ...slower(s, 'Heart rate 22.'), flags: ['lidocaine'] }),
    'amio-infusion': (s) => ({ ...slower(s, 'Heart rate 22.'), flags: ['amiodarone'] }),
    procainamide: (s) => ({ ...slower(s, 'Heart rate 22.'), flags: ['procainamide'] }),
    metoprolol: (s) => blocker(s, 'beta-blocker', true),
    diltiazem: (s) => blocker(s, 'diltiazem', false),
    // adenosine blocks the AV node, not the pacer's capture of the ventricles
    adenosine6: (s) => (ownRhythm(s)
      ? { say: [['monitor', 'Six seconds with no QRS complexes… then beats return at 30.', 'bad']], rhythm: atRate(s, 30), flags: ['adenosine'] }
      : { say: [['monitor', `No change: the pacer holds the rate at ${s.rhythm.hr}.`]], flags: ['adenosine'] }),
    adenosine12: (s) => (ownRhythm(s)
      ? { say: [['monitor', 'Eight seconds with no QRS complexes… then beats return at 30.', 'bad']], rhythm: atRate(s, 30), flags: ['adenosine'] }
      : { say: [['monitor', `No change: the pacer holds the rate at ${s.rhythm.hr}.`]], flags: ['adenosine'] }),
    // compressions barely move blood through a heart squeezed by its own pericardium
    cpr: (s) => (!s.pulse && squeezed(s) ? { say: [['you', 'Compressions — but the heart is squeezed by the blood around it: CPR barely moves a pressure.', 'warn']], flags: ['cpr'] } : null),
    // the escape stopped: epinephrine during CPR can bring it back (pacing in an arrest does not)
    epinephrine: (s) => {
      if (s.pulse || !has(s, 'standstill') || has(s, 'rosc')) return null;
      if (!s.performed.some((p) => p.id === 'cpr' && p.minute >= s.flags.standstill)) return null;
      // a pads pacer turned on during the arrest (no use then: the built-in rule scores it) is still running, and once the
      // heart can answer again it captures — the pacer cannot be started twice, so the story must not leave her at 30
      if (s.performed.some((p) => p.id === 'pace' && p.minute >= s.flags.standstill)) {
        return {
          say: [['you', 'Epinephrine 1 mg IV, flushed.'], ['you', 'Pulse check: a femoral pulse at 70, one with every spike of the pacer still running.', 'good'], ['monitor', 'Heart rate 70. BP 96/56.']],
          // not 'tcp-on': the analgesia and capture-check items are about the bridge started for a patient awake to feel it
          rhythm: { profile: 'tcp', hr: 70 }, pulse: true, vitals: { sbp: 96, dbp: 56, gcs: 8 }, flags: ['epi', 'paced', 'rate-support', 'tcp-arrest'],
        };
      }
      return {
        say: [['you', 'Epinephrine 1 mg IV, flushed.'], ['you', 'Pulse check: a weak femoral pulse at 30.', 'warn'], ['monitor', 'Heart rate 30. BP 70/38.']],
        rhythm: { profile: BLOCK, hr: 30 }, pulse: true, vitals: { sbp: 70, dbp: 38, gcs: 8 }, flags: ['epi'],
      };
    },
  },
  events: [
    {
      // the IV from the ED, and the lab's monitor on as she slides across
      id: 'setup', when: () => true, effect: () => ({ flags: ['iv', 'monitor'] }),
    },
    {
      // the tech records a 12-lead as she arrives: the nurse and the cardiologist read it
      id: 'tech-ecg', when: (s) => s.role !== 3,
      effect: () => ({ say: [['team', 'Tech: "12-lead from the table is on the screen."']], flags: ['ecg12'] }),
    },
    ...RN_ASKS.slice(0, 1).flatMap(askEvents),
    {
      // the tech's run: the nurse paces as soon as the pads are on (or puts them on herself). Not before 2.5 minutes without
      // pads: a tech who records the 12-lead first (2 minutes) gets the block on it
      id: 'nurse-paces', when: (s) => s.role === 3 && ownRhythm(s) && !has(s, 'rate-support') && (has(s, 'pads') || s.minute >= 2.5),
      effect: (s) => padsPacing(s, [['team', `Nurse: "${has(s, 'pads') ? 'Pacing her through your pads' : 'Pads on — pacing her'} at 70."`], ['monitor', 'Pacer on: rate 70, output turned up to 70 mA.']], false),
    },
    {
      // …and gives the analgesia and sedation for it, whoever turned the pacer on (the tech may pace herself; she cannot give
      // the drugs)
      id: 'nurse-comfort', when: (s) => s.role === 3 && has(s, 'tcp-on') && !has(s, 'analgesia') && !has(s, 'sedation'),
      effect: (s) => ({
        say: [['team', 'Nurse: "Fentanyl 25 and midazolam 1 in for the pacer."']],
        vitals: { pain: Math.min(s.vitals.pain, 3) }, flags: ['analgesia', 'sedation'],
      }),
    },
    {
      // nothing gets her rate up: the escape slows and the pressure falls — never back up from a lower one
      id: 'worse', when: (s) => ownRhythm(s) && !has(s, 'rate-support') && s.minute >= 4,
      effect: (s) => {
        const hr = Math.min(s.rhythm.hr, 28);
        const sbp = Math.min(s.vitals.sbp, 72);
        const dbp = Math.min(s.vitals.dbp, 40);
        return {
          say: [['monitor', `Heart rate ${hr}. BP ${sbp}/${dbp}.`, 'bad'], ['patient', 'She is harder to rouse.', 'bad'], ...(s.role === 5 ? [line('team', `Nurse: "Doctor — ${sbp} systolic, and she's hard to rouse."`, 'warn')] : [])],
          rhythm: { profile: BLOCK, hr }, vitals: { sbp, dbp, gcs: Math.min(s.vitals.gcs, 12) },
        };
      },
    },
    {
      id: 'worse2', when: (s) => ownRhythm(s) && !has(s, 'rate-support') && s.minute >= 8,
      effect: (s) => {
        const hr = Math.min(s.rhythm.hr, 24);
        const sbp = Math.min(s.vitals.sbp, 62);
        const dbp = Math.min(s.vitals.dbp, 34);
        return { say: [['monitor', `Heart rate ${hr}. BP ${sbp}/${dbp}.`, 'bad'], ['patient', 'She only groans to a firm rub of the sternum.', 'bad']], rhythm: { profile: BLOCK, hr }, vitals: { sbp, dbp, gcs: Math.min(s.vitals.gcs, 9) } };
      },
    },
    {
      // an escape this low is unreliable: left without support, it stops
      id: 'standstill', when: (s) => ownRhythm(s) && !has(s, 'rate-support') && s.minute >= 12,
      effect: () => ({ say: [['monitor', 'Monitor alarm: no pressure on the cuff, no pleth.', 'bad'], ['patient', 'She is unresponsive.', 'bad']], rhythm: { profile: 'asystole', hr: 0 }, pulse: false, flags: ['standstill'] }),
    },
    {
      // after a short arrest, a few minutes of a perfusing rate (the pads, a drip or the wire) bring her round
      id: 'wakes', when: (s) => s.pulse && has(s, 'rosc') && has(s, 'rate-support') && s.vitals.gcs < 13 && s.minute >= s.flags.rosc + 4,
      effect: (s) => ({ say: [['patient', 'She opens her eyes, squeezes your hand and asks where she is.', 'good']], vitals: { gcs: Math.max(s.vitals.gcs, 13) } }),
    },
    ...TECH_ASKS.slice(0, 1).flatMap(askEvents),
    {
      id: 'team-prep', when: (s) => s.role === 3 && !has(s, 'prep') && s.minute >= 8,
      effect: () => ({ say: [['team', 'Nurse: "I\'ve prepped and draped both groins."']], flags: ['prep'] }),
    },
    {
      id: 'team-timeout', when: (s) => s.role !== 5 && !has(s, 'timeout') && s.minute >= 10,
      effect: () => ({ say: [['operator', 'Time-out, everyone: patient, procedure, site, allergies.']], flags: ['timeout'] }),
    },
    {
      // the operator will not put a wire in without pads on: a wire can set off VT, and if it fails the pads pace
      id: 'md-pads', when: (s) => s.role !== 5 && !has(s, 'pads') && has(s, 'rate-support') && has(s, 'timeout'),
      effect: () => ({ say: [['operator', 'Pads on her before I go in — if the wire sets something off, or stops working, we pace or shock through them.', 'warn']], flags: ['pads'] }),
    },
    {
      id: 'md-access', when: (s) => s.role !== 5 && s.pulse && has(s, 'rate-support') && has(s, 'timeout') && has(s, 'pads') && (s.role !== 3 || has(s, 'prep')) && !has(s, 'venous'),
      effect: () => ({ say: [['operator', 'Right common femoral vein under ultrasound — 6 French sheath in.']], flags: ['venous'] }),
    },
    {
      id: 'md-wire',
      when: (s) => s.role !== 5 && s.pulse && has(s, 'venous') && !has(s, 'wire-paced') && s.minute >= s.flags.venous + (s.role === 3 ? 1 : 2) && (s.role !== 3 || has(s, 'wire-in-hand')),
      effect: (s) => wireIn(s, 'operator'),
    },
    {
      id: 'tech-threshold', when: (s) => s.role === 4 && has(s, 'wire-paced'),
      effect: () => ({ say: [['team', 'Tech: "Threshold 0.8 milliamps. Output 3 — about four times that; rate 70, demand mode."'], ['operator', 'Good margin. Thanks.']] }),
    },
    ...TECH_ASKS.slice(1, 2).flatMap(askEvents),
    {
      // the wire works through the thin apex: it stops pacing the ventricle and paces the diaphragm instead
      id: 'perforation', when: (s) => s.pulse && has(s, 'wire-paced') && s.minute >= s.flags['wire-paced'] + 3,
      effect: (s) => {
        const sbp = Math.min(s.vitals.sbp, 70);
        const dbp = Math.min(s.vitals.dbp, 40);
        return {
          say: [
            ['patient', 'Her belly twitches and she hiccups with every tick of the pacing box. "Hic — it hurts when I breathe in — hic…"', 'warn'],
            ['monitor', `Heart rate 30. BP ${sbp}/${dbp}.`, 'bad'],
            ['team', 'The pacing box still flashes at 70, output 3 mA.'],
            ...awake(s, '"Everything\'s going gray…"'),
            ...(s.role === 5 ? [line('team', `Nurse: "Doctor — she's dropped to 30, pressure ${sbp}!"`, 'warn')] : []),
          ],
          rhythm: { profile: BLOCK, hr: 30 }, vitals: { sbp, dbp, gcs: Math.min(s.vitals.gcs, 13), pain: Math.max(s.vitals.pain, 4) },
          flags: ['perforated', 'capture-lost'],
        };
      },
    },
    {
      // nobody has restarted the pads: a teammate does (in the cardiologist's run the nurse at once — the cardiologist's job
      // is the wire; in the tech's and the nurse's runs, when the learner has not called it out)
      id: 'team-repaces', when: (s) => ownRhythm(s) && wireOut(s) && !has(s, 'tcp-again') && s.minute >= s.flags['capture-lost'] + (s.role === 5 ? 1 : 1.5),
      // what the teammate sees and does, not what it means: naming the failure is the learner's call-out
      effect: (s) => padsPacing(s, [[
        'team', s.role === 4 ? 'Tech: "She\'s down to 30 with the box still firing! I\'m turning the pads pacer back on."' : `Nurse: "Pads pacing ${has(s, 'tcp-on') ? 'back ' : ''}on at 70!"`, 'warn',
      ]], true),
    },
    {
      // the tech's and the nurse's runs: the operator pulls the wire back and looks for an effusion
      id: 'md-rewire', when: (s) => s.role !== 5 && s.pulse && wireOut(s) && has(s, 'tcp-again') && s.minute >= s.flags['tcp-again'] + 1,
      effect: (s) => {
        const back = rewire(s, 'operator');
        return {
          ...back,
          say: [...(back.say ?? []), ['operator', `Echo, please… ${echoWords(s)}`], ...(s.role === 4 ? [line('operator', 'Watch her pressure closely, please.')] : [])],
          flags: [...(back.flags ?? []), 'echo', 'effusion'],
        };
      },
    },
    ...TECH_ASKS.slice(2).flatMap(askEvents),
    {
      // the blood that leaked before the wire came back out keeps collecting: the pericardium fills and squeezes the heart
      id: 'tamponade', when: (s) => s.pulse && has(s, 'perforated') && !has(s, 'drained') && s.minute >= s.flags.perforated + 5,
      effect: (s) => {
        const sbp = Math.min(s.vitals.sbp, 74);
        const dbp = Math.min(s.vitals.dbp, 56);
        return {
          say: [
            ['monitor', `BP ${sbp}/${dbp}; the heart rate stays at ${s.rhythm.hr}; respirations 26.`, 'bad'],
            ...awake(s, '"I feel faint again… I can\'t get my breath."'),
            ...(s.role === 5 ? [line('team', `Tech: "Doctor — pressure's ${sbp}!"`, 'warn')] : []),
          ],
          vitals: { sbp, dbp, gcs: Math.min(s.vitals.gcs, 13), rr: Math.max(s.vitals.rr, 26) }, flags: ['tamponade'], read: tamponadeRead,
        };
      },
    },
    ...RN_ASKS.slice(1).flatMap(askEvents),
    {
      id: 'md-drains', when: (s) => s.role !== 5 && squeezed(s) && (s.role !== 3 || has(s, 'tray-ready')) && s.minute >= s.flags.tamponade + 1,
      effect: (s) => drain(s, 'operator'),
    },
    {
      // left undrained, the squeezed heart stops filling: electrical activity, no output
      id: 'pea', when: (s) => s.pulse && squeezed(s) && s.minute >= s.flags.tamponade + 5,
      effect: () => ({ say: [['monitor', 'No pressure on the cuff and no pleth; the monitor still shows complexes.', 'bad'], ['patient', 'She is unresponsive.', 'bad']], pulse: false, flags: ['pea'] }),
    },
  ],
  critical: [
    { id: 'pads', label: 'Pads on at once', why: 'An unstable patient whose escape rhythm can stop at any moment: with pads on you can pace in seconds — and a wire crossing the valve can set off VT, or stop working, at any time.', done: PADS, points: 10, target: { by: 3 } },
    // the tech's own 12-lead on arrival (the nurse and the cardiologist read the one the tech records)
    { id: 'tech-ecg', label: '12-lead on arrival', why: 'It documents the block — P waves marching through, a slow wide escape, no ST elevation — and pacing hides it once it starts (record it first if that delays nothing).', done: ['ecg12'], roles: TECH, points: 5, target: { by: 5 } },
    {
      id: 'md-bridge', label: 'Get the rate up now: transcutaneous pacing (or an epinephrine drip)', roles: MD, points: 15, target: { by: 4 }, done: ['pace', 'pressor'],
      why: 'Unstable bradycardia that atropine has already failed: pace through the pads (rate 70, output up until every spike captures) or start an epinephrine 2–10 mcg/min or dopamine 5–20 mcg/kg/min drip while the wire is set up. A wide escape is below the AV node — atropine rarely helps it, and the escape can stop.',
    },
    {
      id: 'comfort', label: 'Analgesia and sedation for the pads pacing', roles: [4, 5], points: 10,
      why: 'Transcutaneous pacing hurts with every beat: fentanyl 25–50 mcg and midazolam 0.5–1 mg IV, titrated — before the pacer when there is time, or as soon as it captures — with the monitor and capnography on.',
      // premedication before the pacer is switched on is the same care (it counts from the start), so no `after`
      done: (s) => firstDone(s, COMFORT), uses: COMFORT,
      target: { within: { flag: 'tcp-on', minutes: 3 } }, applies: (s) => has(s, 'tcp-on'),
    },
    // a reassessment counts its pulse too: "pulse 70" at the paced rate is the mechanical capture
    { id: 'capture-tcp', label: 'Confirm the pads pacing makes a pulse (mechanical capture)', why: 'Spikes followed by wide complexes on the screen are electrical capture only: feel a femoral pulse at the paced rate, or see the pleth and the pressure follow it — muscle twitching can mimic a pulse at the neck.', done: ['pulse-check', 'nibp', 'vitals', 'reassess'], after: 'tcp-on', points: 5, target: { within: { flag: 'tcp-on', minutes: 3 } }, applies: (s) => has(s, 'tcp-on') },
    { id: 'md-meds', label: 'Medicines and history: look for a reversible cause', why: 'Beta-blockers, diltiazem or verapamil, digoxin, a high potassium or an inferior MI can cause or worsen AV block, and they are treated before a permanent pacemaker. She takes none of them (amlodipine does not slow AV conduction), and her old ECG showed a bundle branch block: conduction disease below the node.', done: ['sample'], roles: MD, points: 5 },
    { id: 'consent', label: 'Consent for the wire', why: 'Name the risks: bleeding, infection, VT as it crosses the valve, the wire moving, and perforation of the RV with tamponade.', done: ['consent'], roles: [4, 5], points: 5 },
    { id: 'tech-prep', label: 'Prep and drape the groins', why: 'A sterile field over both femoral veins before the operator needs it.', done: ['prep'], roles: TECH, points: 5 },
    { id: 'timeout', label: 'Procedural time-out', why: 'Patient, procedure, site, allergies — even in a hurry.', done: ['timeout'], roles: [3, 4, 5], points: 5 },
    { id: 'md-access', label: 'Femoral venous access under ultrasound', why: 'The way in for the wire: the femoral vein in the lab, under fluoroscopy (the internal jugular is more stable and less often infected if the wire must stay for days).', done: ['access-venous'], roles: MD, points: 5 },
    { id: 'md-wire', label: 'Pacing wire to the RV apex, tested and set with a margin', why: 'Under fluoroscopy to the RV apex; threshold under 1 mA; output at 2–3 times the threshold or more, rate 70, demand mode; the sheath sutured and the sleeve locked.', done: ['temp-wire'], roles: MD, points: 15, target: { by: 15 } },
    { id: 'ecg-wire', label: '12-lead once the wire is pacing', why: 'Paced beats from the RV apex look like a left bundle branch block with a left axis; a new right bundle pattern raises concern that the tip is somewhere else (the coronary sinus, or the LV through the septum or a perforation). It is the baseline for every later check.', done: ['ecg12', 'ecg12-repeat'], after: 'wire-paced', points: 5 },
    {
      id: 'callout-lost', label: 'Call out the loss of capture at once', roles: [3, 4], points: 10, target: { within: { flag: 'capture-lost', minutes: 1 } }, applies: (s) => has(s, 'capture-lost'),
      why: 'The box still fires but nothing follows: the rate falls to the escape and the pressure with it. Say it out loud, get the pads pacing, and the operator turns up the output, checks the connections and looks at the wire.',
      // only while the wire is out: once the operator has it pacing again, there is nothing left to call out
      done: (s) => doneWhile(s, ['callout'], 'capture-lost', 'recaptured'), uses: ['callout'],
    },
    {
      // 4 minutes, as the timing: an echo first (3 minutes) and then the wire, with the pads pacing her meanwhile, is fair
      id: 'md-rewire', label: 'Pull the wire back into the RV and get it pacing again', roles: MD, points: 15, target: { within: { flag: 'capture-lost', minutes: 4 } }, applies: (s) => has(s, 'capture-lost'),
      why: 'Loss of capture with hiccups (the diaphragm paced through the wall) and sharp chest pain: the tip has gone through the thin RV apex. Pads pacing meanwhile; under fluoroscopy pull it back into the cavity and seat it again, then repeat the threshold.',
      done: ['reposition'], after: 'capture-lost',
    },
    {
      id: 'md-echo', label: 'Echo for an effusion once the wire has moved', roles: MD, points: 10, target: { within: { flag: 'perforated', minutes: 4 } },
      // an echo done before the wire moved cannot be this look, and the echo is one action: the item drops out then
      applies: (s) => has(s, 'perforated') && !echoBeforePerforation(s),
      why: 'Hiccups in time with the pacer, pleuritic pain, loss of capture or a rising threshold after a wire: perforation until proven otherwise. Look for a new pericardial effusion, and keep looking.',
      done: ['echo'], after: 'perforated',
    },
    {
      id: 'callout-tamponade', label: 'Call out the falling pressure at a fixed paced rate', why: 'A paced heart cannot speed up to make up for a falling output: the rate stays at 70 while the pressure drops. Say it, and think of the effusion.',
      done: (s) => doneWhile(s, ['callout'], 'tamponade', 'drained'), uses: ['callout'],
      roles: [3, 4], points: 10, target: { within: { flag: 'tamponade', minutes: 1 } }, applies: (s) => has(s, 'tamponade'),
    },
    {
      id: 'md-drain', label: 'Drain the tamponade before her heart stops filling (echo-guided pericardiocentesis)', roles: MD, points: 15,
      why: 'Taking out even 100–200 mL brings the pressure back; left alone, the heart stops filling and the patient arrests.',
      // the drain that brings her back from the arrest it allowed is not this item: the point is to drain before it
      done: (s) => doneWhile(s, ['pericardiocentesis'], 'tamponade', 'pea'), uses: ['pericardiocentesis'],
      target: { within: { flag: 'tamponade', minutes: 5 } }, applies: (s) => has(s, 'tamponade'),
    },
    ...TECH_ASKS.map(askCritical),
    askCritical(RN_ASKS[0]),
    {
      // fluid or a pressor counts while the heart is squeezed: given once the operator has drained it, it supports nothing
      ...askCritical(RN_ASKS[1]),
      done: (s) => {
        const m = askDone(s, RN_ASKS[1]);
        return m !== null && m < (s.flags.drained ?? Infinity) ? m : null;
      },
    },
    { id: 'handoff', label: 'Hand-off to the cardiac ICU', why: 'The block and the escape rate, the wire (site, depth, threshold, output, rate, mode), the perforation, the drain and how much came out, a repeat echo, pads on, the threshold checked every shift — and the permanent pacemaker plan.', done: ['handoff'], roles: [4, 5], points: 5 },
  ],
  harms: [
    { id: 'wire-without-pads', actions: ['temp-wire'], roles: MD, when: (s) => !has(s, 'pads'), points: 10, severity: 'major', text: 'A transvenous wire with no pads on. Crossing the tricuspid valve can set off VT, and a wire can stop pacing at any moment in a patient whose own escape is 30: pads on (and transcutaneous pacing ready) before the wire goes in, and until it is secure.' },
    { id: 'atropine-repeat', actions: ['atropine'], roles: [4, 5], when: (s) => s.pulse && count(s, 'atropine') >= 1 && !paced(s), points: 5, severity: 'major', text: 'More atropine for a block that atropine has already failed. A wide escape means the block is below the AV node: atropine speeds the sinus node, not the ventricles. Pace (pads, then the wire), or start an epinephrine or dopamine drip.' },
    { id: 'escape-suppressant', actions: ['lidocaine', 'amio-infusion', 'procainamide'], replaces: ['procainamide-slow'], points: 20, severity: 'critical', text: 'Never give lidocaine, amiodarone or procainamide to a patient living on a ventricular escape: it is what keeps her alive, and suppressing it can leave nothing at all — even with a wire in, which can stop pacing at any time.' },
    { id: 'av-blocker', actions: ['metoprolol', 'diltiazem'], points: 15, severity: 'critical', text: 'A beta-blocker or diltiazem in complete heart block. They are among the drugs that cause AV block, not treatments for it: they weaken the squeeze and drop the pressure, and a beta-blocker slows the ventricular escape she lives on.' },
    { id: 'adenosine-block', actions: ['adenosine6', 'adenosine12'], points: 10, severity: 'major', text: 'Adenosine in complete heart block. It is for a regular narrow-complex tachycardia, and its label rules it out in second- or third-degree AV block without a working pacemaker: it can add seconds of standstill to a slow escape.' },
    // Nitroglycerin: before the wire comes through the wall the engine's own two rules stand, in their own words (a case
    // rule with the same id replaces a built-in one, so they are restated here, limited to that time); after it, the case's
    // rule covers it — one mistake, one penalty
    { id: 'nitro-hypotension', actions: ['nitro', 'nitro-high', 'ic-nitro'], when: (s) => !has(s, 'perforated') && s.pulse && s.vitals.sbp < 90, points: 8, severity: 'major', replaces: nitrateRulesExcept('nitro-hypotension', 'nitro-high-not-hypertensive'), text: 'Nitroglycerin with a systolic pressure under 90 mmHg. Nitrates drop the pressure further, and she has no chest pain for them to treat: hold them, and get her rate up — that is what her pressure needs.' },
    { id: 'nitro-high-not-hypertensive', actions: ['nitro-high'], when: (s) => !has(s, 'perforated') && s.pulse && s.vitals.sbp >= 90 && s.vitals.sbp < 160, points: 3, severity: 'minor', replaces: nitrateRulesExcept('nitro-hypotension', 'nitro-high-not-hypertensive'), text: 'High-dose nitroglycerin without a high blood pressure. 0.8 mg is for hypertensive pulmonary edema with a systolic of 160 or more; she has neither.' },
    { id: 'nitro-after-wire', actions: ['nitro', 'nitro-high', 'ic-nitro'], when: (s) => has(s, 'perforated'), points: 10, severity: 'major', replaces: NITRATE_RULES, text: 'Nitroglycerin for chest pain after a pacing wire. Sharp pain that is worse on breathing in, with hiccups in time with the pacer, is perforation until proven otherwise — not angina: nitrates drop the filling a heart with blood around it depends on. Echo first.' },
    // the pads' pacing needs sedation, the wire's does not: once the wire paces, nothing hurts that needs it, so a falling
    // pressure (the tamponade) makes it a mistake again — this case's words for the built-in sedation rules
    { id: 'sedation-low-pressure', actions: ['midazolam', 'sedation'], when: (s) => s.pulse && s.rhythm.profile === 'paced' && s.vitals.sbp < 90, points: 5, severity: 'major', replaces: SEDATIVE_RULES, text: 'Sedation with a falling pressure once the wire is pacing. The wire needs no sedation (only the pads pacing hurts), and a benzodiazepine drops the pressure and the breathing further: support the pressure and find out why it is falling.' },
    { id: 'anticoagulant-perforation', actions: ['heparin', 'bivalirudin', 'gp2b3a', 'cangrelor'], when: (s) => has(s, 'perforated'), points: 8, severity: 'major', replaces: ANTITHROMBOTIC_RULES, text: 'An anticoagulant or antiplatelet drug after the wire has come through the RV wall. It keeps the hole bleeding into the pericardium.' },
    askHarm(RN_ASKS[0], 'Atropine when the operator asked you to get the rate up. It already failed in the ED, and a wide escape means the block is below the AV node, where atropine rarely works: pace her through the pads (or start an epinephrine drip).'),
  ],
  timings: [
    { label: 'Pads on', actions: PADS, flag: 'pads', target: 3 },
    { label: 'Rate up (pacing or a drip)', actions: ['pace', 'pressor'], flag: 'rate-support', target: 4 },
    { label: 'Pacing from the wire', actions: [], flag: 'wire-paced', target: 20 },
    { label: 'The wire pacing again after it moved', actions: [], flag: 'recaptured', target: 4, from: 'capture-lost' },
    { label: 'Tamponade drained', actions: [], flag: 'drained', target: 5, from: 'tamponade' },
  ],
  deathAfter: 8,
  completeWhen: (s) => has(s, 'wire-paced') && !wireOut(s) && has(s, 'drained'),
  teaching: [
    'Complete heart block with a slow (20–40/min) wide escape is a block below the AV node — often degenerative conduction disease in an older patient whose ECG already showed a bundle branch block. The escape is unreliable: it can slow or stop (fainting spells, or an arrest).',
    'Unstable bradycardia (2025 AHA): atropine 1 mg IV, repeated every 3–5 minutes to 3 mg, is the first drug — but it works on the AV node and is unlikely to help a block below it. Do not let it delay pacing.',
    'If atropine fails: transcutaneous pacing, or an epinephrine (2–10 mcg/min) or dopamine (5–20 mcg/kg/min) drip, and a temporary transvenous wire for bradycardia that stays unstable. Pads on first, always.',
    'Transcutaneous pacing: rate 70, output up until every spike captures; confirm a femoral pulse (or the pleth) at the paced rate; give analgesia and sedation (fentanyl, small titrated doses of midazolam).',
    'Look for a reversible cause — beta-blockers, diltiazem or verapamil, digoxin, a high potassium, an inferior MI, Lyme disease. Without one, acquired complete heart block needs a permanent pacemaker (2018 ACC/AHA/HRS).',
    'The wire: femoral (or internal jugular) venous access under ultrasound, a bipolar catheter to the RV apex under fluoroscopy, distal electrode to negative. Threshold: turn the output down until capture is lost — under 1 mA is a good position. Set the output at 2–3 times the threshold or more (thresholds climb over the first days), rate 60–80, demand mode. Suture the sheath, lock the sleeve, note the depth; keep the pads on.',
    'Paced beats from the RV apex look like a left bundle branch block with a left axis. A new right bundle pattern raises concern that the tip is somewhere else: the coronary sinus, or the LV through the septum or a perforation.',
    'Loss of capture: spikes with nothing after them and the rate back to the escape. Call it out, pace through the pads, turn the output up, check the connections and the battery — then fluoroscopy and reposition.',
    'Perforation of the thin RV apex (older women most of all): loss of capture or a rising threshold, hiccups or twitching in time with the pacer (the diaphragm paced through the wall), sharp pleuritic pain, a rub. Echo for an effusion, pull the wire back into the cavity, and watch for tamponade with serial echoes. Many small leaks seal once the wire is out of the wall; one that keeps filling the drain needs cardiac surgery.',
    'A paced heart cannot speed up to make up for a falling output: in tamponade the rate stays at 70 while the pressure falls. Fluid while you prepare, then drain it under echo.',
    'Never give lidocaine, amiodarone or procainamide to a ventricular escape, and avoid beta-blockers, calcium-channel blockers and adenosine. Chest pain after a wire is perforation until proven otherwise: no nitroglycerin, no anticoagulants.',
  ],
};
