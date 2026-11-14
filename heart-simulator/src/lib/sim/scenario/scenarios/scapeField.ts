import type { Effect, Line, Scenario, SimState } from '../types';
import { atRate, bpAfter, count, has, line } from '../kit';
import { NITRATE_RULES, SEDATIVE_RULES, nitrateRulesExcept } from '../rules/acs';

/**
 * Hypertensive acute pulmonary edema — "sympathetic crashing acute pulmonary edema" (SCAPE). A surge of sympathetic tone
 * slams the pressure up; a stiff, thick left ventricle (an echo last year: it squeezes normally) cannot empty against it,
 * and within minutes the pressure backs up into the lungs. Many of these patients are not overloaded with fluid: the
 * fluid has moved, and taking the pressure off moves it back. CPAP and high-dose nitroglycerin turn her around within
 * minutes; without CPAP she tires (nitrates alone only slow it), her CO₂ climbs, she stops protecting her airway and
 * needs breaths given.
 */

/** Minutes from the EMT's call until the paramedic intercept is at her side (the engine's line says "about 6 minutes out") */
const ALS_MINUTES = 6;
const NEAREST_MINUTES = 9;
const HEART_CENTER_MINUTES = 16;

/** The learner's own nitrate doses (the intercept paramedic's are flags) */
const NITRATES = ['nitro-assist', 'nitro', 'nitro-high'];
/**
 * Every action that shows her pressure: a cuff by hand or on the monitor, a Doppler, and a reassessment (its line reads
 * the full set of vitals, the pressure included — a crew that reassesses before the next dose has checked it)
 */
const BP_CHECKS = ['vitals', 'nibp', 'bp-both-arms', 'doppler-map', 'reassess'];
/** The intercept paramedic's doses: 0.4 mg, or 0.8 mg (the "-high" flags) */
const TEAM_DOSES = ['als-nitro-1', 'als-nitro-1-high', 'als-nitro-2', 'als-nitro-2-high'];
/** Minutes from first contact until she tires without positive pressure; nitrates on board (0.8 mg or more) slow it */
const TIRES_AT = 7;
const TIRES_AT_WITH_NITRATES = 11;

/** CPAP is on her (her own crew's, or the intercept paramedic's) — until it comes off because she can no longer use it */
const onCpap = (s: SimState) => has(s, 'cpap') && !has(s, 'cpap-off');
/** Someone is breathing for her: a bag-mask or an advanced airway */
const bagged = (s: SimState) => has(s, 'ventilated');
/** Her pressure has been measured, by any of the BP checks */
const pressureTaken = (s: SimState) => s.performed.some((p) => BP_CHECKS.includes(p.id));
/** Awake enough to talk, and to take something under her tongue */
const awake = (s: SimState) => s.pulse && s.vitals.gcs >= 13;
const says = (s: SimState, text: string, tone?: Line[2]): Line[] => (awake(s) ? [line('patient', text, tone)] : []);

/** Nitrate given so far, in 0.4 mg steps: hers, the learner's and the intercept paramedic's */
export function nitrateUnits(s: SimState): number {
  return 2 * count(s, 'nitro-high') + count(s, 'nitro') + count(s, 'nitro-assist')
    + (has(s, 'als-nitro-1-high') ? 2 : has(s, 'als-nitro-1') ? 1 : 0)
    + (has(s, 'als-nitro-2-high') ? 2 : has(s, 'als-nitro-2') ? 1 : 0);
}

/** The minute of the last nitrate dose, by anyone (null: none yet) */
function lastNitrate(s: SimState): number | null {
  const mins = [
    ...s.performed.filter((p) => NITRATES.includes(p.id)).map((p) => p.minute),
    ...TEAM_DOSES.filter((f) => has(s, f)).map((f) => s.flags[f]),
  ];
  return mins.length ? Math.max(...mins) : null;
}

/** CPR cycles started since a flag was set (the cycle being started now is not counted yet) */
const cyclesSince = (s: SimState, flag: string) => s.performed.filter((p) => p.id === 'cpr' && p.minute >= s.flags[flag]).length;

/**
 * A nitrate dose. Through the surge her pressure is driven by the sympathetic storm and each dose takes 14 (0.4 mg) or
 * 28 (0.8 mg) off the systolic as it opens the veins and the arteries and lets fluid move back out of the lungs. Once the
 * surge has passed ('better'), the same dose drops her far more: that is when nitrates given by habit cause hypotension.
 */
function nitrate(s: SimState, dose: 'own' | 'standard' | 'high'): Effect | null {
  if (!s.pulse) return null;
  const better = has(s, 'better');
  const bp = dose === 'high' ? bpAfter(s, better ? -34 : -28, better ? -18 : -12) : bpAfter(s, better ? -22 : -14, better ? -12 : -8);
  const easing = !better && s.vitals.gcs > 8;
  const spo2 = easing ? Math.min(96, s.vitals.spo2 + 2) : s.vitals.spo2;
  const rr = easing ? Math.max(18, s.vitals.rr - 2) : s.vitals.rr;
  const mask = onCpap(s) ? ', the CPAP mask lifted for a breath' : '';
  const what = dose === 'own' ? `One spray of her own nitroglycerin (0.4 mg) under her tongue${mask}.`
    : dose === 'high' ? `Nitroglycerin 0.8 mg (two sprays) under her tongue${mask}.` : `Nitroglycerin 0.4 mg under her tongue${mask}.`;
  const low = bp.sbp < 100;
  return {
    say: [['you', what], line('monitor', `BP ${bp.sbp}/${bp.dbp}.`, low ? 'bad' : undefined), ...(low ? says(s, '"I feel faint…"', 'bad') : [])],
    vitals: { ...bp, spo2, rr }, flags: dose === 'high' ? ['nitro', 'nitro-high'] : ['nitro'],
  };
}

/** What CPAP does for someone still breathing on her own: the alveoli held open, the work of breathing and the preload down */
function cpapVitals(s: SimState) {
  const drowsy = s.vitals.gcs <= 12;
  const bp = bpAfter(s, -12, -6);
  return { ...bp, spo2: Math.max(s.vitals.spo2, drowsy ? 86 : 90), rr: Math.min(s.vitals.rr, drowsy ? 32 : 30) };
}

/** The intercept paramedic's nitrate dose (EMT role), by the same rule the learner is taught: 0.8 mg at 160 or more, 0.4 mg down to 100 */
function teamNitro(s: SimState, n: 1 | 2): Effect {
  const high = s.vitals.sbp >= 160;
  const bp = high ? bpAfter(s, -28, -12) : bpAfter(s, -14, -8);
  return {
    say: [['team', `Nitroglycerin ${high ? '0.8 mg (two sprays)' : '0.4 mg'} under her tongue${n === 2 ? ', 5 minutes after the first' : ''}.`], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`]],
    vitals: { ...bp, spo2: Math.min(96, s.vitals.spo2 + 2), rr: Math.max(18, s.vitals.rr - 2) },
    flags: [high ? `als-nitro-${n}-high` : `als-nitro-${n}`, 'team-nitro'],
  };
}

/** The paramedic intercept reaches the EMT's patient and takes over the drugs */
function alsArrives(s: SimState): Effect {
  if (!s.pulse) {
    return { say: [['team', 'The paramedics arrive and take over the drugs: an IV in her arm, epinephrine 1 mg in. "Keep the compressions and the bag going."']], flags: ['iv', 'epi', 'als-here'] };
  }
  if (s.vitals.gcs <= 8) {
    const lines: Line[] = [['team', 'The paramedics arrive: "She is not protecting her airway any more — she needs breaths given, with a PEEP valve on the bag. I\'ll get a line and the airway kit."', 'warn']];
    if (bagged(s)) return { say: lines, flags: ['iv', 'als-here'] };
    // nobody was breathing for her: the medics take the bag themselves
    return { say: [...lines, ['team', 'The paramedic takes the bag and starts ventilating her.']], vitals: { spo2: Math.max(s.vitals.spo2, 84), rr: 10 }, flags: ['iv', 'als-here', 'ventilated'] };
  }
  const lines: Line[] = [['team', 'The paramedics arrive and take over the medications: an IV in her left arm.']];
  if (onCpap(s)) return { say: lines, flags: ['iv', 'als-here'] };
  // their first nitrate is the event 'als-nitro-1': they give it once a pressure allows it and 5 minutes have passed
  // since her own spray, never on top of it
  lines.push(['team', '"Why is she not on CPAP? Mask on, 10 of pressure — that is what keeps her off a ventilator."', 'warn']);
  return { say: lines, vitals: cpapVitals(s), flags: ['iv', 'als-here', 'cpap', 'cpap-team'] };
}

/** Back from the hypoxic arrest: a pulse, but she breathes only 6 times a minute and the bag goes on */
function rosc(): Effect {
  return {
    say: [
      ['you', 'Pulse check after 2 minutes of compressions and breaths with oxygen: a carotid pulse — ROSC.', 'good'],
      ['partner', 'She breathes only 6 times a minute: I\'ll keep bagging her, with the PEEP valve on.'],
    ],
    rhythm: { profile: 'sinus-tachycardia', hr: 122 }, pulse: true, phase: 'rosc',
    vitals: { sbp: 150, dbp: 88, spo2: 86, rr: 10, etco2: 48, gcs: 4, pain: 0 },
    flags: ['cpr'],
  };
}

/** Transport, sitting up: she is carried down on the stair chair and rides upright with her legs down */
function transport(id: 'transport-near' | 'transport-pci') {
  return (s: SimState): Effect | null => {
    if (has(s, 'enroute') || !s.pulse) return null;
    const near = id === 'transport-near';
    const mins = near ? NEAREST_MINUTES : HEART_CENTER_MINUTES;
    const how = bagged(s)
      ? 'Down the stairs on a scoop stretcher, your partner bagging all the way.'
      : `Down the stairs on the stair chair and onto the stretcher sitting bolt upright, legs hanging down${onCpap(s) ? '; the CPAP runs from the portable oxygen' : ''}.`;
    return {
      say: [['you', `Patient loaded; transporting to the ${near ? 'nearest emergency department' : 'regional heart center'} (${mins} min).`], ['partner', how]],
      flags: ['enroute', near ? 'dest-near' : 'dest-pci'], timers: { arrive: s.minute + 2 + mins },
    };
  };
}

/** Drugs that weaken the squeeze or slow a heart whose speed is its answer to the hypoxia: she gets worse */
function negativeInotrope(what: string, flag: string) {
  return (s: SimState): Effect | null => {
    if (!s.pulse) return null;
    // 10 slower — not below 90 from her fast rate, and never faster than it was (a slow heart only slows further)
    const hr = Math.min(s.rhythm.hr, Math.max(s.rhythm.hr > 100 ? 90 : 40, s.rhythm.hr - 10));
    const bp = bpAfter(s, -10, -6);
    const spo2 = Math.max(70, s.vitals.spo2 - 4);
    return {
      say: [['you', `${what} given.`], ['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}. SpO₂ ${spo2}%.`, 'bad'], ['partner', 'She is working harder to breathe — grayer and sweatier, not better.', 'bad']],
      rhythm: atRate(s, hr), vitals: { ...bp, spo2, rr: Math.min(44, s.vitals.rr + 2) }, flags: [flag],
    };
  };
}

/** Adrenergic drugs raise a pressure that is already far too high: more afterload, more fluid in the lungs */
function adrenergic(what: string, dSbp: number, dDbp: number, flag: string) {
  return (s: SimState): Effect | null => {
    if (!s.pulse) return null;
    const bp = bpAfter(s, dSbp, dDbp, { sbp: 250, dbp: 140 });
    const hr = Math.min(150, s.rhythm.hr + 8);
    const spo2 = Math.max(70, s.vitals.spo2 - 3);
    return {
      say: [['you', what], ['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}. SpO₂ ${spo2}%.`, 'bad'], ...says(s, '"My heart… pounding…"', 'bad')],
      rhythm: atRate(s, hr), vitals: { ...bp, spo2 }, flags: [flag],
    };
  };
}

/** A benzodiazepine: on CPAP and awake, a small dose eases the panic of the mask; without the mask's support it only blunts her breathing */
function sedative(s: SimState, what: string): Effect | null {
  if (!s.pulse) return null;
  if (onCpap(s) && awake(s)) {
    const bp = bpAfter(s, -6, -4);
    return {
      say: [['you', what], ['partner', 'She relaxes into the mask and stops fighting it.'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`]],
      vitals: { ...bp, rr: Math.max(18, s.vitals.rr - 2) }, flags: ['benzodiazepine', 'sedation'],
    };
  }
  const gcs = Math.max(3, s.vitals.gcs - 3);
  const spo2 = Math.max(60, s.vitals.spo2 - 5);
  return {
    say: [
      ['you', what],
      ['partner', onCpap(s) ? 'She is drowsier and her breaths are weaker, even on the mask.' : 'She is drowsier and her breaths are weaker — and nothing is helping her breathe.', 'bad'],
      ['monitor', `SpO₂ ${spo2}%.`, 'bad'],
    ],
    vitals: { gcs, spo2, etco2: Math.min(80, s.vitals.etco2 + 8) }, flags: ['benzodiazepine', 'sedation'],
  };
}

export const scapeField: Scenario = {
  id: 'scape-field',
  title: 'Bolt upright at 3 am',
  // the picker must not name what she has: sitting up, gray and sweating at 3 am is the clue
  summary: '68-year-old woman woken at 3 am by sudden, terrible breathlessness: bolt upright, gray and sweating, a word at a time. What does she need first — and what would make her worse?',
  setting: 'field',
  roles: [1, 2],
  difficulty: 'intermediate',
  conditionId: 'hfpef',
  briefing: {
    default: [
      ['dispatch', 'Priority 1, 3:12 am: 68-year-old woman with difficulty breathing. Her husband says she woke up unable to breathe.'],
      ['scene', 'A second-floor bedroom. She is sitting bolt upright on the edge of the bed, hands braced on her knees, gray and drenched in sweat, pink froth at her lips. She gets out one word at a time. Her husband holds out a bag of pill bottles.'],
      ['partner', 'Your partner, an EMT, has the oxygen, the CPAP kit and the stair chair; you have the monitor and the drug box.'],
      ['hospital', `Nearest emergency department: ${NEAREST_MINUTES} minutes. Regional heart center: ${HEART_CENTER_MINUTES} minutes.`],
    ],
    1: [
      ['dispatch', 'Priority 1, 3:12 am: 68-year-old woman with difficulty breathing. Her husband says she woke up unable to breathe.'],
      ['scene', 'A second-floor bedroom. She is sitting bolt upright on the edge of the bed, hands braced on her knees, gray and drenched in sweat, pink froth at her lips. She gets out one word at a time. Her husband holds out a bag of pill bottles.'],
      ['partner', 'Your partner, an EMT, has the oxygen, the CPAP kit and the stair chair. You are the BLS crew: no paramedic unit has been sent yet — an ALS intercept comes if you request one.'],
      ['hospital', `Nearest emergency department: ${NEAREST_MINUTES} minutes. Regional heart center: ${HEART_CENTER_MINUTES} minutes.`],
    ],
  },
  initial: {
    rhythm: { profile: 'sinus-tachycardia', hr: 118 },
    vitals: { sbp: 224, dbp: 122, spo2: 82, rr: 34, etco2: 30, pain: 0, gcs: 15, glucose: 168, temp: 36.6 },
  },
  // fluid on the lungs: the built-in rules charge a fluid bolus and raised legs. Not 'heart-failure': that problem means a
  // reduced ejection fraction, and her heart squeezes normally (a stiff, thick ventricle)
  problems: ['pulmonary-edema'],
  facts: {
    opqrst: 'She can only gasp a word at a time and shakes her head at "chest pain?". Her husband: "She woke me at three, sitting straight up, fighting for air — it came on in minutes. No chest pain, she says. Lying down makes it worse. She has been coughing up pink froth."',
    sample: 'Her husband: "No allergies. High blood pressure for years — she ran out of her pressure pills, amlodipine and lisinopril, last week and hasn\'t refilled them. Type 2 diabetes: metformin. A nitroglycerin spray her doctor gave her two years ago for chest tightness; she has hardly used it. Ham and pickles for supper. No heart attacks, no kidney trouble. The echo last year said her heart pumps fine but is thick and stiff."',
    pde5: 'Her husband: "No — nothing like that. I keep her pill box, and it\'s all in the bag."',
    ownNitro: 'Her nitroglycerin spray, 0.4 mg a spray, in date, on the nightstand.',
    lungs: (s) => {
      if (!s.pulse) return bagged(s) ? 'Wet crackles with each squeeze of the bag, equal on both sides.' : 'Nothing to hear: no breaths are going in.';
      if (s.vitals.gcs <= 8 && !bagged(s)) return 'Wet crackles everywhere, faint: she is barely moving air.';
      if (has(s, 'better')) return 'Crackles at both bases only now: the upper lobes have cleared.';
      if (has(s, 'fluid') || has(s, 'legs-up')) return 'Coarse crackles all the way to the top on both sides, louder than before; no wheeze.';
      return 'Coarse crackles from the bases to the apices on both sides, no wheeze; pink frothy sputum at her lips.';
    },
    perfusion: (s) => {
      if (!s.pulse) return 'Gray, cool and mottled; no pulses.';
      if (has(s, 'better')) return 'Pinker, warmer and drier; neck veins lower; radial pulses strong.';
      return 'Pale, cool and drenched in sweat; neck veins distended even sitting up; no ankle swelling; radial pulses strong and fast.';
    },
    neuro: (s) => {
      if (!s.pulse || s.vitals.gcs <= 8) return 'No response to voice; withdraws from pain only.';
      if (s.vitals.gcs <= 12) return 'Drowsy: opens her eyes to her name and nods off again; moves all four limbs; no facial droop.';
      return 'Alert, frightened, oriented; no facial droop, no arm drift, speech normal for the words she can get out.';
    },
    // what the paramedic's 12-lead read is checked against (the tracing is the rhythm on the monitor)
    ecg12: (s) => {
      if (s.rhythm.profile === 'sinus-tachycardia') return `Sinus tachycardia ${s.rhythm.hr}: a P wave before every QRS, narrow QRS, normal intervals, no ST elevation or depression — no STEMI, and no arrhythmia behind her breathlessness. The fast rate is her body's answer to the hypoxia and the work of breathing: it needs no drug of its own.`;
      if (s.rhythm.profile === 'normal-sinus') return `Sinus rhythm ${s.rhythm.hr}: the rate has come down as she has improved; narrow QRS, no ST elevation or depression.`;
      if (s.rhythm.profile === 'sinus-bradycardia') return `Sinus bradycardia ${s.rhythm.hr}: a heart slowing for want of oxygen — she needs breaths given, now.`;
      if (s.rhythm.profile === 'tcp') return `Paced at ${s.rhythm.hr} by the pads: a pacing spike before every wide complex. Underneath is a sinus rhythm slowing for want of oxygen — the pacer buys minutes; breaths given are the treatment.`;
      // anything else: the profile's own description (the engine's fallback)
      return '';
    },
  },
  status: (s) => {
    if (!s.pulse) return 'Unresponsive, no pulse.';
    if (has(s, 'rosc')) return 'Unresponsive; the bag is breathing for her.';
    if (s.vitals.gcs <= 8) return bagged(s) ? 'Unresponsive; the bag is breathing for her.' : `No answer to her name; a shallow breath only ${s.vitals.rr} times a minute.`;
    // only while the pressure is still down: once it is back, so is she
    if (has(s, 'too-low') && s.vitals.sbp < 110) return '"I feel… light-headed."';
    if (has(s, 'better')) return '"That\'s… so much better. I can breathe again." She speaks in full sentences through the mask.';
    if (s.vitals.gcs <= 12) return 'Drowsy: her head keeps nodding forward; she answers with a nod.';
    if (onCpap(s)) return 'She nods: still working hard, but she is keeping the mask on.';
    return '"Can\'t… breathe…" — a word at a time, gasping.';
  },
  respond: {
    // what the primary survey sees: the work of breathing, not just the numbers
    primary: (s) => {
      if (!s.pulse) return null;
      if (s.vitals.gcs <= 8) {
        return bagged(s)
          ? { say: [['you', `Unresponsive; the bag is breathing for her, the chest rising with each squeeze; radial pulse ${s.rhythm.hr}/min; GCS ${s.vitals.gcs}.`]] }
          : { say: [['you', `No answer to her name; froth gurgling in her airway; a shallow breath only ${s.vitals.rr} times a minute; radial pulse ${s.rhythm.hr}/min; GCS ${s.vitals.gcs}.`, 'bad']] };
      }
      if (has(s, 'better')) return { say: [['you', `Airway open; breathing ${s.vitals.rr}/min, easier now; radial pulse ${s.rhythm.hr}/min; GCS ${s.vitals.gcs}.`]] };
      return { say: [['you', `Airway open but wet and gurgling; breathing ${s.vitals.rr}/min, every neck muscle working, a word at a time; radial pulse ${s.rhythm.hr}/min, strong; GCS ${s.vitals.gcs}.`]] };
    },
    cpap: (s) => {
      // CPAP supports breaths a patient takes and needs someone awake enough to protect her airway: it gives none
      if (!s.pulse) return { say: [['you', 'CPAP mask on — but CPAP only supports breaths a patient takes: she is not breathing, so it moves no air.', 'bad']], flags: ['cpap-failed'] };
      if (s.vitals.gcs <= 8) {
        return { say: [['you', `CPAP mask on — but she no longer answers and takes ${s.vitals.rr} shallow breaths a minute: CPAP supports breaths, it does not give them, and she cannot protect her airway.`, 'bad']], flags: ['cpap-failed'] };
      }
      const v = cpapVitals(s);
      return {
        say: [
          ['you', 'CPAP mask sealed over her nose and mouth with oxygen, started at 5 cmH₂O and turned up to 10 as she settles into it; she stays sitting bolt upright.'],
          ['monitor', `SpO₂ ${v.spo2}%. BP ${v.sbp}/${v.dbp}.`],
          ...(s.vitals.gcs <= 12 ? [line('partner', 'She is drowsy: I\'ll stay at her head and watch that she keeps breathing and keeps her airway.', 'warn')] : []),
        ],
        vitals: v, flags: ['cpap', 'cpap-own'],
      };
    },
    // oxygen by mask is a bridge, not the treatment: the alveoli are full of fluid, and only pressure holds them open
    'o2-nrb': (s) => {
      if (!s.pulse) return null;
      if (onCpap(s)) return { say: [['you', 'She is already on CPAP with the oxygen running: a mask on top adds nothing.']] };
      if (s.vitals.gcs <= 8) return { say: [['you', `Non-rebreather on — but she takes only ${s.vitals.rr} shallow breaths a minute: a mask cannot breathe for her.`, 'bad']], flags: ['o2'] };
      const spo2 = Math.min(90, s.vitals.spo2 + 4);
      return { say: [['monitor', `Non-rebreather at 15 L/min. SpO₂ ${spo2}%.`], ...says(s, '"Still… can\'t…"')], vitals: { spo2 }, flags: ['o2'] };
    },
    'o2-nc': (s) => {
      if (!s.pulse) return null;
      if (onCpap(s)) return { say: [['you', 'She is already on CPAP with the oxygen running: a cannula adds nothing.']] };
      const spo2 = Math.min(88, s.vitals.spo2 + 2);
      return { say: [['monitor', `Nasal cannula on. SpO₂ ${spo2}%.`]], vitals: { spo2 }, flags: ['o2'] };
    },
    // once her own drive fails, breaths are given over hers, with a PEEP valve to hold the flooded alveoli open
    bvm: (s) => {
      if (!s.pulse || s.vitals.gcs > 8) return null;
      if (bagged(s)) return { say: [['you', 'Still bagging: 1 breath every 6 seconds with the PEEP valve on.']] };
      const spo2 = Math.max(s.vitals.spo2, 86);
      const etco2 = Math.min(s.vitals.etco2, 62);
      return {
        say: [['you', 'Bag-mask with oxygen and a PEEP valve, 1 breath every 6 seconds timed with hers; froth suctioned from her mouth; the chest rises.'], ['monitor', `SpO₂ ${spo2}%.`]],
        vitals: { spo2, etco2, rr: 10 }, flags: ['ventilated'],
      };
    },
    airway: (s) => {
      // awake (the engine: she gags and pushes it away) or in arrest (placed): the default says it
      if (!s.pulse || s.vitals.gcs > 8) return null;
      const spo2 = Math.max(s.vitals.spo2, 88);
      return {
        say: [['you', 'Airway placed and confirmed with waveform capnography; pink froth suctioned from it. Ventilating with a PEEP valve, 1 breath every 6 seconds.'], ['monitor', `SpO₂ ${spo2}%.`]],
        vitals: { spo2, etco2: Math.min(s.vitals.etco2, 60), rr: 10 }, flags: ['airway', 'ventilated', 'capno'],
      };
    },
    // she was hypoxic before her heart stopped: compressions alone carry no oxygen to it — with breaths, two cycles bring her back
    cpr: (s) => {
      if (s.pulse || !bagged(s)) return null;
      if (cyclesSince(s, 'ventilated') + 1 >= 2) return rosc();
      return { say: [['you', 'Two minutes of compressions with 2 breaths of oxygen after every 30.']], flags: ['cpr'] };
    },
    capno: (s) => (s.pulse ? { say: [['monitor', `EtCO₂ ${s.vitals.etco2} mmHg.`]], flags: ['capno'] } : null),
    // a heart slowing for want of oxygen does not hold a faster rate: atropine lifts it for a moment, and only breaths fix it
    atropine: (s) => {
      if (!s.pulse || !has(s, 'slowing') || bagged(s) || s.rhythm.hr >= 60) return null;
      return {
        say: [['you', 'Atropine 1 mg IV.'], ['monitor', `Heart rate ${s.rhythm.hr + 16} for under a minute, then back down to ${s.rhythm.hr}.`, 'bad'], ['partner', 'She is still gray, and still barely breathing.', 'bad']],
        flags: ['atropine'],
      };
    },
    // the nitrates: hers (the EMT helps her take it), and the paramedic's standard and high dose
    'nitro-assist': (s) => {
      if (!awake(s)) return { blocked: true, say: [['system', 'Not now: she is too drowsy to take a spray under her tongue safely.']] };
      return nitrate(s, 'own');
    },
    nitro: (s) => nitrate(s, 'standard'),
    'nitro-high': (s) => nitrate(s, 'high'),
    // the traps: more volume, the legs up, an opioid, a negative inotrope, a pressor
    fluid: (s) => {
      if (!s.pulse) return null;
      const bp = bpAfter(s, 4, 2, { sbp: 250, dbp: 140 });
      const spo2 = Math.max(70, s.vitals.spo2 - 4);
      return {
        say: [['monitor', `Bolus in. BP ${bp.sbp}/${bp.dbp}. SpO₂ ${spo2}%.`, 'bad'], ['partner', 'More froth at her lips — and the crackles are louder.', 'bad']],
        vitals: { ...bp, spo2, rr: Math.min(44, s.vitals.rr + 2) }, flags: ['fluid'],
      };
    },
    'legs-up': (s) => {
      if (!s.pulse) return null;
      const spo2 = Math.max(70, s.vitals.spo2 - 6);
      return {
        say: [
          ['you', 'Laid back flat with her legs raised.'],
          ['monitor', `SpO₂ ${spo2}%.`, 'bad'],
          awake(s)
            ? line('patient', 'She thrashes and claws her way back up to sitting: "Can\'t… lie… down…"', 'bad')
            : line('partner', 'Flat on her back she is drowning — froth bubbling at her lips. Sit her back up!', 'bad'),
        ],
        vitals: { spo2, rr: Math.min(44, s.vitals.rr + 4) }, flags: ['legs-up'],
      };
    },
    fentanyl: (s) => {
      if (!s.pulse) return null;
      const spo2 = onCpap(s) ? s.vitals.spo2 : Math.max(70, s.vitals.spo2 - 4);
      const bp = bpAfter(s, -6, -4);
      return {
        say: [['you', 'Fentanyl 50 mcg IV — she has no pain to treat.'], ['partner', 'She is drowsier, and her breaths are shallower: less air is going in.', 'bad'], ['monitor', `SpO₂ ${spo2}%. BP ${bp.sbp}/${bp.dbp}.`]],
        vitals: { ...bp, spo2, gcs: Math.max(3, s.vitals.gcs - 2), etco2: Math.min(80, s.vitals.etco2 + 8) }, flags: ['opioid'],
      };
    },
    midazolam: (s) => sedative(s, has(s, 'iv') ? 'Midazolam 1 mg IV.' : 'Midazolam 2.5 mg IM (no IV yet).'),
    sedation: (s) => sedative(s, 'Sedation given.'),
    metoprolol: negativeInotrope('Metoprolol 5 mg IV', 'beta-blocker'),
    diltiazem: negativeInotrope('Diltiazem IV', 'diltiazem'),
    'push-epi': adrenergic('Push-dose epinephrine 10 mcg IV.', 16, 10, 'push-epi'),
    pressor: adrenergic('Vasopressor infusion running.', 22, 14, 'pressor'),
    'epi-im': adrenergic('Epinephrine 0.5 mg IM, lateral thigh.', 10, 6, 'epi-im'),
    // no wheeze for it to open: the noise in her chest is fluid
    albuterol: (s) => {
      if (!s.pulse) return null;
      const hr = Math.min(150, s.rhythm.hr + 8);
      return { say: [['you', 'Albuterol nebulizer running through the mask.'], ['monitor', `Heart rate ${hr}.`], ...says(s, '"Shaky… still… can\'t breathe…"')], rhythm: atRate(s, hr), flags: ['albuterol'] };
    },
    // she has no chest pain, but aspirin hurts no one here; by mouth only while she can chew and swallow
    aspirin: (s) => {
      if (!s.pulse) return { blocked: true, say: [['system', 'Not by mouth: she is in cardiac arrest.']] };
      if (!awake(s)) return { blocked: true, say: [['system', 'Not by mouth: she is too drowsy to chew and swallow it safely.']] };
      if (onCpap(s)) return { say: [['patient', 'The mask comes off for a moment while she chews the aspirin; her SpO₂ dips, then comes back as the mask goes back on.']], flags: ['aspirin'] };
      return null;
    },
    'ecg-transmit': (s) => (has(s, 'ecg12')
      ? { say: [['hospital', 'ECG received. The emergency physician reviews it: no ST elevation, no cath lab. Bring her to the emergency department.']], flags: ['transmitted'] }
      : null),
    // the order follows the crew's scope: CPAP and the patient's own spray for the EMT; the nitrate ladder for the paramedic
    'med-control': (s) => {
      let advice: string;
      if (!s.pulse) advice = 'Medical control: "Compressions, and breaths with oxygen — she arrested from hypoxia. Call me back when you have a pulse."';
      else if (s.vitals.gcs <= 8) advice = 'Medical control: "She is no longer protecting her airway: CPAP is out. Ventilate her with a bag-mask and a PEEP valve, and come in."';
      else if (!pressureTaken(s)) advice ='Medical control: "Give me a blood pressure first — and get her on CPAP if she is not."';
      else if (s.role === 1) {
        advice = 'Medical control: "Keep her sitting up and get CPAP on now, 5 to 10 of pressure. You may help her take one spray of her own nitroglycerin if her systolic is over 100 and she takes no erectile-dysfunction or pulmonary-hypertension drug — check the pressure first. Get a paramedic intercept coming and start transporting; don\'t wait for them."';
      } else {
        advice = 'Medical control: "CPAP, and nitroglycerin 0.8 mg every 5 minutes while her systolic stays 160 or more — 0.4 mg below that, and hold it under 100. A pressure before each dose. No fluid and no opioid. Nearest emergency department unless the 12-lead shows a STEMI."';
      }
      return { say: [['hospital', advice]], flags: ['med-control'] };
    },
    // the report follows where she is now: the hospital gets ready for that
    notify: (s) => {
      let reply: string;
      if (!s.pulse) reply = 'Copy: cardiac arrest, resuscitation under way. Call back with a pulse or if you need orders.';
      else if (s.vitals.gcs <= 8) reply = 'Copy: a 68-year-old woman in respiratory failure, being ventilated. The resuscitation bay and respiratory therapy will be ready for her.';
      else if (has(s, 'better')) reply = `Copy: a 68-year-old woman with sudden breathlessness and a pressure over 200, now ${s.vitals.sbp}/${s.vitals.dbp} and much easier on CPAP and nitroglycerin. Respiratory therapy will meet you with BiPAP, and a nitroglycerin infusion will be ready.`;
      else reply = 'Copy: a 68-year-old woman in severe respiratory distress with a pressure over 200. Respiratory therapy will meet you with BiPAP, and a nitroglycerin infusion will be ready.';
      return { say: [['hospital', reply]], flags: ['notified'] };
    },
    'transport-near': transport('transport-near'),
    'transport-pci': transport('transport-pci'),
  },
  events: [
    // ─── The EMT's paramedic intercept ─────────────────────────────────────
    {
      // a crew that has already handed her over at the hospital needs no intercept
      id: 'als-arrives',
      when: (s) => s.role === 1 && has(s, 'als') && !has(s, 'arrived') && s.minute >= s.flags.als + ALS_MINUTES,
      effect: alsArrives,
    },
    {
      // their first dose: on arrival, or 5 minutes after her own spray if she has just had it
      id: 'als-nitro-1',
      when: (s) => s.role === 1 && has(s, 'als-here') && s.pulse && s.vitals.gcs > 8 && !has(s, 'better') && s.vitals.sbp >= 100
        && s.minute >= (lastNitrate(s) ?? -Infinity) + 5,
      effect: (s) => teamNitro(s, 1),
    },
    {
      // a second dose 5 minutes after the first, while the pressure is still up and she has not turned the corner
      id: 'als-nitro-2',
      when: (s) => s.role === 1 && has(s, 'team-nitro') && awake(s) && !has(s, 'better') && s.vitals.sbp >= 100 && s.minute >= (lastNitrate(s) ?? 0) + 5,
      effect: (s) => teamNitro(s, 2),
    },
    // ─── CPAP and nitrates working ─────────────────────────────────────────
    {
      // positive pressure alone: the alveoli open and the work of breathing eases (the pressure, the nitrates' job, stays up)
      id: 'cpap-working',
      when: (s) => s.pulse && onCpap(s) && s.vitals.gcs > 8 && !has(s, 'better') && s.minute >= s.flags.cpap + 4,
      effect: (s) => {
        const v = { spo2: Math.max(s.vitals.spo2, 93), rr: Math.min(s.vitals.rr, 26), etco2: Math.min(s.vitals.etco2, 38), gcs: Math.max(s.vitals.gcs, 14), ...bpAfter(s, -4, -2) };
        return {
          say: [['monitor', `SpO₂ ${v.spo2}%.`, 'good'], ...(v.gcs >= 13 ? [line('patient', 'She nods: "A little… easier."')] : [])],
          rhythm: atRate(s, Math.min(s.rhythm.hr, 108)), vitals: v,
        };
      },
    },
    {
      // CPAP plus enough nitrate (two high doses, or their equal): the pressure comes off and the fluid moves back out of
      // her lungs within minutes
      id: 'better',
      when: (s) => {
        const last = lastNitrate(s);
        return s.pulse && onCpap(s) && s.vitals.gcs > 8 && nitrateUnits(s) >= 3 && last !== null && s.minute >= last + 2 && s.minute >= s.flags.cpap + 3;
      },
      effect: (s) => {
        const hr = Math.min(s.rhythm.hr, 96);
        return {
          say: [
            ['partner', 'Look at her — she\'s pink again, and talking in full sentences through the mask.', 'good'],
            ['monitor', `SpO₂ 96%. Heart rate ${hr}.`, 'good'],
            ['patient', '"Oh… that\'s better. I can breathe."', 'good'],
          ],
          rhythm: atRate(s, hr),
          vitals: { spo2: 96, rr: 20, etco2: 36, gcs: 15, sbp: Math.min(s.vitals.sbp, 158), dbp: Math.min(s.vitals.dbp, 92) },
          flags: ['better'],
        };
      },
    },
    // ─── Without positive pressure she tires ───────────────────────────────
    {
      // high-dose nitrates without positive pressure slow the decline (in the prehospital trial of high-dose nitrate boluses
      // fewer patients needed ventilation), but at an SpO₂ in the low 80s she still needs the pressure CPAP gives
      id: 'tiring',
      when: (s) => s.pulse && !onCpap(s) && !bagged(s) && !has(s, 'failing')
        && s.minute >= (nitrateUnits(s) >= 2 ? TIRES_AT_WITH_NITRATES : TIRES_AT),
      effect: (s) => {
        const v = { gcs: Math.min(s.vitals.gcs, 12), spo2: Math.min(s.vitals.spo2, 78), rr: Math.max(s.vitals.rr, 36), etco2: Math.max(s.vitals.etco2, 56) };
        return {
          say: [['partner', 'She is tiring: her head keeps nodding forward, she answers only with a nod, and her lips are going blue.', 'bad'], ['monitor', `SpO₂ ${v.spo2}%.`, 'bad']],
          vitals: v, flags: ['tiring'],
        };
      },
    },
    {
      // the CO₂ she can no longer breathe off puts her to sleep: she stops protecting her airway, and CPAP is no longer safe
      id: 'failing',
      when: (s) => s.pulse && has(s, 'tiring') && !has(s, 'failing') && !onCpap(s) && !bagged(s) && s.minute >= s.flags.tiring + 4,
      effect: (s) => {
        const v = { gcs: Math.min(s.vitals.gcs, 7), rr: 8, spo2: Math.min(s.vitals.spo2, 70), etco2: Math.max(s.vitals.etco2, 74) };
        return {
          say: [['partner', 'She has slumped against me: she doesn\'t answer, and she takes a shallow breath only every 7 or 8 seconds!', 'bad'], ['monitor', `SpO₂ ${v.spo2}%.`, 'bad']],
          vitals: v, flags: ['failing'],
        };
      },
    },
    {
      // an opioid or a sedative has taken her below a GCS of 9 on the mask: she no longer protects her airway or drives her
      // own breaths, so CPAP comes off and she needs breaths given — the same failure as without CPAP, from here on
      id: 'cpap-fails',
      when: (s) => s.pulse && onCpap(s) && !bagged(s) && s.vitals.gcs <= 8,
      effect: (s) => {
        const v = { rr: 8, spo2: Math.min(s.vitals.spo2, 76), etco2: Math.max(s.vitals.etco2, 66) };
        return {
          say: [
            ['partner', 'She doesn\'t answer any more, and her breaths under the mask are slow and shallow — the CPAP can\'t breathe for her, and she can\'t protect her airway. Mask off!', 'bad'],
            ['monitor', `SpO₂ ${v.spo2}%.`, 'bad'],
          ],
          vitals: v, flags: ['cpap-off', 'failing'],
        };
      },
    },
    {
      // breaths given: the oxygen comes up and the CO₂ comes down (she stays unresponsive for now)
      id: 'bagging-works',
      when: (s) => s.pulse && has(s, 'failing') && bagged(s) && s.minute >= s.flags.ventilated + 3,
      effect: (s) => {
        const spo2 = Math.max(s.vitals.spo2, 92);
        const etco2 = Math.min(s.vitals.etco2, 46);
        return {
          say: [['partner', 'Her color is coming back with the bag.', 'good'], ['monitor', `SpO₂ ${spo2}%. EtCO₂ ${etco2} mmHg.`, 'good']],
          ...(s.rhythm.hr < 60 ? { rhythm: atRate(s, 112), vitals: { spo2, etco2, sbp: Math.max(s.vitals.sbp, 168), dbp: Math.max(s.vitals.dbp, 96) } } : { vitals: { spo2, etco2 } }),
        };
      },
    },
    {
      // nobody breathes for her: the heart slows for want of oxygen
      id: 'slowing',
      when: (s) => s.pulse && has(s, 'failing') && !bagged(s) && s.minute >= s.flags.failing + 3,
      effect: (s) => ({
        say: [['monitor', 'Monitor alarm. Heart rate 46.', 'bad'], ['partner', 'She\'s gone gray — and her pulse is slowing down!', 'bad']],
        rhythm: atRate(s, 46), vitals: { sbp: Math.min(s.vitals.sbp, 104), dbp: Math.min(s.vitals.dbp, 62), spo2: Math.min(s.vitals.spo2, 60) },
        flags: ['slowing'],
      }),
    },
    {
      id: 'arrest',
      when: (s) => s.pulse && has(s, 'slowing') && !bagged(s) && s.minute >= s.flags.slowing + 3,
      effect: () => ({
        say: [['monitor', 'Monitor alarm.', 'bad'], ['partner', 'She has gone limp and stopped breathing!', 'bad']],
        rhythm: { profile: 'pea', hr: 36 }, pulse: false, phase: 'arrest',
        vitals: { sbp: 0, dbp: 0, rr: 0, spo2: 50, etco2: 3, gcs: 3 },
      }),
    },
    // ─── Nitrates after the surge has passed ───────────────────────────────
    {
      id: 'too-low',
      when: (s) => s.pulse && s.vitals.sbp < 100 && s.vitals.gcs > 8,
      // the drug that dropped it has already put the pressure on the monitor
      effect: (s) => ({
        say: [['partner', 'She says she feels faint — she has gone pale and clammy again.', 'warn']],
        vitals: { gcs: Math.min(s.vitals.gcs, 14) }, flags: ['too-low'],
      }),
    },
    {
      // with the nitrates held, the pressure comes back over the next minutes
      id: 'pressure-back',
      // (also after a pressor pushed it part of the way back: she still settles once the nitrates have worn off)
      when: (s) => s.pulse && has(s, 'too-low') && s.vitals.gcs > 8 && (s.vitals.sbp < 114 || s.vitals.gcs < 15)
        && s.minute >= s.flags['too-low'] + 4 && s.minute >= (lastNitrate(s) ?? 0) + 6,
      effect: (s) => {
        const bp = { sbp: Math.max(s.vitals.sbp, 114), dbp: Math.max(s.vitals.dbp, 70) };
        return { say: [['monitor', `BP ${bp.sbp}/${bp.dbp}.`, 'good'], ...says(s, '"The dizziness has passed."')], vitals: { ...bp, gcs: s.vitals.gcs >= 13 ? 15 : s.vitals.gcs } };
      },
    },
  ],
  critical: [
    // first, so that a hint in the crisis names what she needs now, not an item from before it
    {
      id: 'arrest-cpr', label: 'No pulse: CPR at once, with breaths', points: 10, applies: (s) => has(s, 'arrest'),
      why: 'Her heart stopped for want of oxygen: compressions within a minute, and breaths with oxygen — compressions alone carry no oxygen to a heart that stopped from hypoxia.',
      done: ['cpr'], after: 'arrest', target: { within: { flag: 'arrest', minutes: 1 } },
    },
    {
      id: 'ventilate', label: 'She stopped protecting her airway: bag-mask ventilation with a PEEP valve', points: 15, applies: (s) => has(s, 'failing'),
      why: 'Unresponsive with a shallow breath every 8 seconds and a rising CO₂, she can no longer use CPAP: give the breaths — a bag-mask with oxygen and a PEEP valve, 1 breath every 6 seconds — and, for a paramedic, an advanced airway.',
      done: ['bvm', 'airway'], after: 'failing', target: { within: { flag: 'failing', minutes: 2 } },
    },
    {
      id: 'vitals', label: 'Vital signs, the blood pressure first', points: 5, target: { by: 3 }, done: BP_CHECKS,
      // no numbers here: a hint at the start shows this text before anyone has measured anything
      why: 'With this breathlessness the pressure decides the treatment: a very high one is what drives the fluid into the lungs, and it sets the nitroglycerin dose — or whether she can have any.',
    },
    {
      id: 'lungs', label: 'Listen to the lungs', points: 5, target: { by: 5 }, done: ['lungs'],
      why: 'Crackles to the apices with pink froth, and no wheeze: fluid in the lungs, not asthma or COPD. It is what tells you CPAP and nitroglycerin will help, and that fluid and raised legs will hurt.',
    },
    {
      id: 'cpap', label: 'CPAP early (5–10 cmH₂O), sitting upright', points: 20, target: { by: 5 },
      why: 'Positive pressure holds the flooded alveoli open, takes over much of the work of breathing and lowers the preload and afterload of a failing ventricle: in cardiogenic pulmonary edema it roughly halves the need for intubation. It comes before an IV, and while she is awake enough to protect her airway.',
      // her crew's own CPAP on an awake patient: an attempt on someone who can no longer protect her airway does not count
      done: (s) => (has(s, 'cpap-own') ? s.performed.find((p) => p.id === 'cpap')?.minute ?? null : null),
      uses: ['cpap'],
    },
    {
      id: 'als', label: 'Request a paramedic intercept', points: 10, roles: [1], target: { by: 4 }, done: ['als'],
      why: 'High-dose nitroglycerin, an IV and, if she tires, an advanced airway need a paramedic: call at once — and start transporting rather than wait for them.',
    },
    {
      // 0.4 mg counts too (protocols that use it are not wrong): it only turns her around more slowly
      id: 'nitro', label: 'Nitroglycerin early, dosed by the pressure (0.8 mg sublingual at a systolic of 160 or more)', points: 20, roles: [2], target: { by: 6 },
      why: 'Nitroglycerin opens the veins and, at high doses, the arteries: it takes the pressure off the ventricle and lets the fluid move back out of the lungs. High-dose protocols give 0.8 mg every 5 minutes while the systolic stays 160 or more (1.2 mg over 200 in some), 0.4 mg below 160, and none below 100. No IV is needed for it.',
      done: ['nitro-high', 'nitro'],
    },
    {
      id: 'ecg', label: '12-lead ECG within 10 minutes', points: 10, target: { by: 10 }, done: ['ecg12'],
      why: 'A STEMI or a fast arrhythmia (atrial fibrillation, for one) can set off pulmonary edema, and each changes the treatment and the destination. EMTs acquire and transmit it.',
    },
    {
      id: 'transmit', label: 'Transmit the 12-lead (you do not interpret it)', points: 5, roles: [1], target: { by: 12 }, done: ['ecg-transmit'],
      why: 'The physician reads it before she arrives: a STEMI would change where she goes.',
    },
    {
      id: 'iv', label: 'IV access (once CPAP is on)', points: 5, roles: [2], done: ['iv', 'io'],
      why: 'For the hospital\'s nitroglycerin infusion and for the drugs she may need if she tires. It treats nothing by itself: CPAP and sublingual nitroglycerin come first.',
    },
    {
      id: 'bp-recheck', label: 'Recheck the blood pressure once CPAP or nitroglycerin is on board', points: 5,
      why: 'CPAP and nitroglycerin both lower the pressure, and the next nitroglycerin dose depends on it: check it before every dose.',
      // from whichever came first; a crew that gave neither is charged for that, not for this as well
      applies: (s) => has(s, 'cpap') || has(s, 'nitro') || has(s, 'team-nitro'),
      done: (s) => {
        const from = Math.min(...['cpap', 'nitro', 'team-nitro'].map((f) => s.flags[f] ?? Infinity));
        return s.performed.find((p) => BP_CHECKS.includes(p.id) && p.minute >= from)?.minute ?? null;
      },
      uses: BP_CHECKS,
    },
    { id: 'notify', label: 'Notify the receiving hospital', points: 5, done: ['notify'], why: 'Respiratory therapy can meet her with BiPAP and the emergency department can have a nitroglycerin infusion ready.' },
    {
      id: 'transport', label: 'Transport without delay', points: 10, target: { by: 15 }, done: ['transport-near', 'transport-pci'],
      why: 'CPAP and nitroglycerin go on in the ambulance. Without a STEMI the nearest emergency department is right; the heart center is fine too. Don\'t wait on scene for an intercept.',
    },
    {
      id: 'handoff', label: 'Hand-off', points: 5, done: ['handoff'],
      why: 'Report the sudden onset at 3 am, the pressure of 224/122, the missed blood pressure pills, the CPAP setting, each nitroglycerin dose with the pressure before it, the 12-lead, and how she responded.',
    },
  ],
  harms: [
    {
      // a fluid bolus and raised legs are the built-in rules ('fluid-pulmonary-edema', 'legs-up-pulmonary-edema'); these are the case's own
      id: 'opioid-dyspnea', actions: ['fentanyl'], when: (s) => s.pulse, points: 8, severity: 'major', replaces: SEDATIVE_RULES,
      text: 'An opioid for her breathlessness. She has no pain to treat: an opioid blunts the breathing drive of a patient already tiring, adds nausea and vomiting under a CPAP mask, and in acute cardiogenic pulmonary edema morphine has been linked to more ventilation, ICU admissions and deaths. CPAP and nitroglycerin relieve the air hunger.',
    },
    {
      id: 'airway-before-cpap', actions: ['airway'], when: (s) => s.pulse && s.vitals.gcs > 8, points: 10, severity: 'major', replaces: ['airway-awake'],
      text: 'An advanced airway in a patient who is awake and protecting her airway. Hypertensive pulmonary edema turns around within minutes with CPAP and high-dose nitroglycerin: CPAP first, which roughly halves the need for intubation. An airway is for the patient who fails it — who stops protecting her airway or tires despite it.',
    },
    {
      id: 'iv-before-cpap', actions: ['iv', 'io'], roles: [2], when: (s) => s.pulse && !onCpap(s) && s.vitals.gcs > 8, points: 3, severity: 'minor',
      text: 'An IV before CPAP. The line treats nothing: with an SpO₂ in the low 80s she needs CPAP first, and the nitroglycerin goes under her tongue without a line. Start the IV once she is on CPAP.',
    },
    {
      id: 'cpap-unable', actions: ['cpap'], when: (s) => !s.pulse || s.vitals.gcs <= 8, points: 5, severity: 'major',
      text: 'CPAP for a patient who can no longer protect her airway or breathe for herself. CPAP supports breaths a patient takes; it gives none. Unresponsive, with a shallow breath every 8 seconds, she needs breaths given with a bag-mask and a PEEP valve — or an advanced airway.',
    },
    {
      id: 'nitro-no-bp', actions: NITRATES, when: (s) => !pressureTaken(s), points: 5, severity: 'major', replaces: nitrateRulesExcept('nitro-hypotension', 'nitro-high-not-hypertensive'),
      text: 'Nitroglycerin without a blood pressure. The pressure decides the dose — 0.8 mg at 160 or more, 0.4 mg below that, none under 100 — so measure it first.',
    },
    {
      id: 'nitro-no-pde5', actions: NITRATES, when: (s) => !has(s, 'pde5-asked'), points: 3, severity: 'minor', replaces: nitrateRulesExcept('nitro-hypotension', 'nitro-high-not-hypertensive'),
      text: 'Nitroglycerin without asking about PDE-5 inhibitors. No nitrate within 12 h of avanafil, 24 h of sildenafil or vardenafil, or 48 h of tadalafil: together they can cause profound hypotension. Ask women too — sildenafil and tadalafil are also prescribed for pulmonary hypertension.',
    },
    {
      id: 'nitro-repeat-unsafe', actions: NITRATES, points: 3, severity: 'minor', replaces: nitrateRulesExcept('nitro-hypotension', 'nitro-high-not-hypertensive'),
      // the learner's own repeat dose: less than 3 minutes after the last, or with no pressure taken since it
      when: (s) => {
        const last = s.performed.filter((p) => NITRATES.includes(p.id)).at(-1);
        if (!last) return false;
        return s.minute - last.minute < 3 || !s.performed.some((p) => BP_CHECKS.includes(p.id) && p.minute > last.minute);
      },
      text: 'A repeat nitroglycerin dose too soon or without a fresh blood pressure. Doses go every 5 minutes (3 at the least), with the pressure checked before each: CPAP and the doses already given keep lowering it.',
    },
    {
      id: 'nitro-high-below-160', actions: ['nitro-high'], when: (s) => s.pulse && s.vitals.sbp >= 100 && s.vitals.sbp < 160, points: 3, severity: 'minor', replaces: NITRATE_RULES,
      text: 'High-dose nitroglycerin after the pressure had come down below 160. The 0.8 mg dose is for a systolic of 160 or more; below it step down to 0.4 mg — once the surge has passed, each dose drops the pressure far more.',
    },
    {
      // under 100 this rule is the one penalty for any nitrate: the low-pressure rule, and the 0.8 mg dose rule below 160
      id: 'nitro-pressure-fallen', actions: NITRATES, when: (s) => s.pulse && s.vitals.sbp < 100, points: 8, severity: 'major', replaces: NITRATE_RULES,
      text: 'Nitroglycerin with a systolic pressure under 100. Hold nitrates once the pressure has fallen (protocols set the line at 90, 100 or 110): CPAP and the nitrate already on board keep lowering it, and a low pressure starves the heart and the brain.',
    },
    {
      id: 'negative-inotrope', actions: ['metoprolol', 'diltiazem'], when: (s) => s.pulse, points: 8, severity: 'major',
      text: 'A beta-blocker or diltiazem in acute pulmonary edema. Her fast rate is the body\'s answer to the hypoxia and the work of breathing, not an arrhythmia: slowing it and weakening the squeeze of a heart that is already backing up into the lungs makes the edema worse. Treat the cause — CPAP and nitroglycerin — and the rate comes down by itself.',
    },
    {
      id: 'antiarrhythmic-no-arrhythmia', actions: ['adenosine6', 'adenosine12', 'amio-infusion', 'procainamide', 'lidocaine'], when: (s) => s.pulse, points: 3, severity: 'minor',
      text: 'An antiarrhythmic with no arrhythmia to treat. Her 12-lead shows a sinus rhythm whose speed is her response to the hypoxia: adenosine only pauses it, and amiodarone, procainamide and lidocaine treat nothing she has.',
    },
    {
      id: 'pressor-hypertensive', actions: ['push-epi', 'pressor'], when: (s) => s.pulse && s.vitals.sbp >= 140, points: 8, severity: 'major',
      text: 'A pressor in a patient whose pressure is already far too high. The pressure the ventricle cannot empty against is what is flooding her lungs: raising it makes the edema worse. She needs the pressure taken off — nitroglycerin and CPAP.',
    },
    {
      // between 90 and 140 (a dip after the nitrates) the pressure is not low enough for a pressor — and in the hypoxic
      // slowing before an arrest an epinephrine push is a fair adjunct of the bradycardia algorithm: the breaths she is not
      // getting are what the review charges there
      id: 'pressor-not-hypotensive', actions: ['push-epi', 'pressor'], when: (s) => s.pulse && s.vitals.sbp >= 90 && s.vitals.sbp < 140 && !(has(s, 'slowing') && s.rhythm.hr < 60), points: 3, severity: 'minor',
      text: 'A pressor without a low pressure. Her systolic was 90 or more: a dip after nitroglycerin comes back by itself once the nitrates are held, and a pressor only adds afterload to a ventricle that has just stopped flooding her lungs.',
    },
    {
      id: 'epi-im-no-anaphylaxis', actions: ['epi-im'], when: (s) => s.pulse, points: 3, severity: 'minor',
      text: 'IM epinephrine without anaphylaxis. No hives, no swelling, no exposure: her noisy breathing is fluid in the lungs, and epinephrine only drives up the pressure and the rate.',
    },
    {
      id: 'albuterol-crackles', actions: ['albuterol'], when: (s) => s.pulse, points: 3, severity: 'minor',
      text: 'Albuterol for crackles. There is no wheeze for it to open: the noise in her chest is fluid, and a beta-agonist only speeds the heart. CPAP and nitroglycerin clear the lungs.',
    },
    {
      // the benzodiazepine for the panic of the mask is a fair choice once she is on CPAP and awake; before that, or once she is
      // drowsy, it only blunts the breathing she has left
      id: 'sedative-unsupported', actions: ['midazolam', 'sedation'], when: (s) => s.pulse && (!onCpap(s) || s.vitals.gcs <= 12 || s.vitals.sbp < 90), points: 5, severity: 'major', replaces: SEDATIVE_RULES,
      text: 'A sedative before CPAP, or for a patient who is tiring. Her panic is air hunger, which CPAP and nitroglycerin treat; a benzodiazepine without that support blunts the breathing she has left. A small dose is for a patient on CPAP who is awake and fighting the mask.',
    },
  ],
  timings: [
    { label: 'CPAP on', actions: ['cpap'], target: 5 },
    // the EMT's patient may get hers from the intercept paramedic: the flag counts theirs
    { label: 'First nitroglycerin', actions: NITRATES, flag: 'team-nitro' },
    { label: '12-lead', actions: ['ecg12'], target: 10 },
    { label: 'Breathing easier (SpO₂ in the mid-90s, full sentences)', actions: [], flag: 'better' },
    { label: 'Transport', actions: ['transport-near', 'transport-pci'], target: 15 },
  ],
  transportMinutes: HEART_CENTER_MINUTES,
  nearestMinutes: NEAREST_MINUTES,
  arrival: 'You arrive; the emergency team meets you at the door with BiPAP set up and a nitroglycerin infusion ready.',
  teaching: [
    'Sudden, severe breathlessness that wakes an older patient, sitting bolt upright, sweating, with a very high pressure, crackles to the apices and pink froth: hypertensive acute pulmonary edema ("SCAPE"). A surge of sympathetic tone raises the afterload, a stiff ventricle backs up, and fluid moves into the lungs within minutes — many of these patients are not overloaded with fluid: it has shifted, and taking the pressure off moves it back.',
    'Keep her sitting up with the legs down: never lay her flat or raise her legs, which pours more blood back into a heart that is already backing up. No fluid bolus.',
    'CPAP early, at 5 cmH₂O titrated up to 10, before the IV: in cardiogenic pulmonary edema it roughly halves the need for intubation. EMTs apply it where protocols allow (National EMS Scope of Practice Model). It needs a patient who is awake, breathing and protecting her airway, with a systolic over 90; no vomiting, no pneumothorax.',
    'Nitroglycerin is the drug: high-dose protocols give 0.8 mg sublingual every 5 minutes while the systolic stays 160 or more (1.2 mg over 200 in some), 0.4 mg below 160, and hold it under 100 (90–110 by protocol). Measure the pressure before every dose, and ask about PDE-5 inhibitors — women take sildenafil and tadalafil for pulmonary hypertension. An EMT may only help the patient take her own prescribed nitroglycerin, and only where the protocol or medical direction allows it for breathlessness (many allow it for chest pain only).',
    'She turns around within minutes of CPAP plus nitrates; nitrates alone only slow her decline. Once the surge has passed, the same dose drops the pressure far more: step the dose down, and stop when the pressure has come down or the breathing has eased.',
    'No opioids: morphine in acute cardiogenic pulmonary edema has been linked to more ventilation, ICU admissions and deaths, and in the MIMO trial midazolam caused fewer serious adverse events than morphine. A small dose of a benzodiazepine is only for a patient on CPAP who is awake and fighting the mask.',
    'Her fast sinus rate is her body\'s answer to the hypoxia: no beta-blocker, diltiazem or antiarrhythmic. Albuterol does not clear crackles. Pressors and epinephrine raise the afterload that is drowning her.',
    'Record a 12-lead within 10 minutes: a STEMI (to the cath lab) or a fast arrhythmia (to be treated) can set it off. Without either, the nearest emergency department; notify it so BiPAP and a nitroglycerin infusion are ready. Don\'t wait on scene for an intercept.',
    'Watch for failure: falling GCS, a rising EtCO₂, slowing breaths — on the mask too, and above all after any sedative or opioid. Once she stops protecting her airway, CPAP is no longer safe — bag-mask ventilation with a PEEP valve and an advanced airway. Intubating an awake patient before a CPAP trial is a mistake. A heart slowing for want of oxygen needs breaths: atropine or a pacer only buys minutes.',
    'In hospital: BiPAP, an IV nitroglycerin infusion — often at high doses — and an IV loop diuretic for the fluid overload many also have, not as the first drug (the 2022 AHA/ACC/HFSA guideline: IV nitroglycerin or nitroprusside may be considered for dyspnea alongside diuretics when there is no hypotension, 2b; observational emergency department studies of high-dose nitroglycerin report fewer intubations and ICU admissions with little hypotension). Then the trigger: here, blood pressure pills that ran out and a salty supper.',
  ],
};
