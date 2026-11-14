import type { LearningLevel } from '@/store/useAppStore';
import type { Effect, Line, PendingRead, Responder, Scenario, SimState, Speaker } from '../types';
import { bpAfter, has, line, paced } from '../kit';
import { INTERVENTION_BY_ID } from '../interventions';
import { MD, RN, TECH, askCritical, askEvents, type LabAsk } from '../labKit';
import { RATE_RULES } from '../rules/rhythm';

/**
 * A vasovagal reaction at femoral sheath removal. A diagnostic cath from the right groin is over; the tech pulled the
 * 6 French sheath five minutes ago and is holding manual pressure. The patient yawns, feels sick and sweats, and his pulse
 * and pressure fall together. The tech keeps the groin dry and calls it out; the nurse gives what the cardiologist asks for;
 * the cardiologist treats and makes sure it is not a bleed. It answers legs up, fluid and atropine within minutes.
 *
 * Sources: 2025 AHA bradycardia algorithm (atropine 1 mg every 3–5 min to 3 mg; then pacing or an epinephrine or dopamine
 * infusion); 2018 ACC/AHA/HRS bradycardia guideline (atropine 0.5–1 mg; less than 0.5 mg can slow the rate); Kiat Ang et al.,
 * Int J Cardiol 2006 (RCT, 611 femoral sheath pulls after PCI: IV fentanyl and midazolam cut pain and vagal reactions; local
 * lidocaine around the sheath alone gave the most pain and a trend to more reactions; nitroglycerin during the pull was a strong
 * predictor); Rama et al., Pharmacotherapy 1997 (atropine 0.5 mg before the pull after a diagnostic cath: reactions 2.3 % vs
 * 10.4 %); Xu and Huang, Herz 2020 (nitrates); Yang et al., Interv Neuroradiol 2017 (long fasting). Sheath-removal nursing
 * protocols treat a reaction with a fluid bolus, atropine and the legs raised by tilting the bed head-down (Trendelenburg), which
 * keeps the punctured hip straight.
 */

/** Minutes of manual pressure for a 6 French femoral sheath with no heparin on board */
const HOLD_MINUTES = 15;
/** The sheath came out five minutes before the case opens, so the first hold ends at minute 10 */
const FIRST_HOLD_END = HOLD_MINUTES - 5;

const RN_MD: LearningLevel[] = [4, 5];

/** The reaction is under way: started and not yet over */
const reacting = (s: SimState) => s.pulse && has(s, 'reaction') && !has(s, 'recovered');

/** Someone still has a hand on the groin: the puncture is not sealed yet */
const holding = (s: SimState) => !has(s, 'hold-done');

const holdEnd = (s: SimState) => s.timers.holdEnd ?? FIRST_HOLD_END;
const holdLeft = (s: SimState) => Math.max(0, Math.ceil(holdEnd(s) - s.minute));
const minutes = (n: number) => `${n} more minute${n === 1 ? '' : 's'}`;

/** The teammate who speaks up beside the learner: the nurse (for the tech and the cardiologist), the tech (for the nurse) */
const teammate = (s: SimState, text: string, tone: Line[2] = 'warn'): Line =>
  line('team', s.role === 4 ? `Tech: "${text}"` : `Nurse: "${text}"`, tone);

// ─── What each treatment does during the reaction ─────────────────────────────

/**
 * Atropine blocks the vagus at the sinus node: the rate comes back to 74, and the pressure rises a little with it (the
 * vessels are still wide open). Over a pacer at 70 his own faster beats take over. Outside the reaction the default
 * response (and the built-in rule for atropine with no slow rate) applies.
 */
function atropineFx(s: SimState, by?: Line): Effect | null {
  if (!reacting(s) || (s.rhythm.hr >= 60 && !paced(s))) return null;
  const bp = bpAfter(s, 10, 6);
  return {
    say: [
      ...(by ? [by] : []),
      ['monitor', paced(s)
        ? `Heart rate 74: his own beats are back, faster than the pacer, so it stops firing. BP ${bp.sbp}/${bp.dbp}.`
        : `Heart rate 74. BP ${bp.sbp}/${bp.dbp}.`],
    ],
    rhythm: { profile: 'normal-sinus', hr: 74 }, vitals: bp, flags: ['atropine', 'rate-up'],
  };
}

/** A saline bolus run in fast fills the dilated circulation */
function fluidFx(s: SimState, by?: Line): Effect | null {
  if (!reacting(s)) return null;
  const bp = bpAfter(s, 10, 6);
  return {
    say: [by ?? ['you', '500 mL of saline running in wide open.'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`]],
    vitals: bp, flags: ['fluid', 'fluid-given'],
  };
}

/**
 * Legs above the heart: blood from the legs returns to the heart at once. With a fresh femoral puncture the bed is tilted
 * head-down (Trendelenburg) rather than the legs bent up on pillows, so the hip stays straight under the hand on the groin
 */
function legsFx(s: SimState): Effect | null {
  if (!reacting(s)) return null;
  const bp = bpAfter(s, 8, 4);
  return {
    say: [
      ['you', s.role === 3
        ? 'Your hands stay on the groin: the nurse tilts the bed head-down, so his legs are above his heart and his right hip stays straight under your fingers.'
        : 'The bed tilted head-down, so his legs are above his heart; his right hip stays straight under the tech\'s fingers.'],
      ['monitor', `BP ${bp.sbp}/${bp.dbp}.`],
    ],
    vitals: bp, flags: ['legs-up'],
  };
}

/**
 * Epinephrine before the rate has been brought up (a push dose, or the anaphylaxis dose IM): its beta effect lifts the rate
 * and the pressure a little, for a few minutes — it does not undo the vagal surge, so it counts for nothing that lasts
 */
function epiFx(s: SimState, what: string, flag: string, dHr: number, dSbp: number, dDbp: number): Effect | null {
  if (!reacting(s) || has(s, 'rate-up') || paced(s)) return null;
  const hr = Math.min(48, s.rhythm.hr + dHr);
  const bp = bpAfter(s, dSbp, dDbp);
  return {
    say: [['you', what], ['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp} — for a few minutes.`]],
    rhythm: { ...s.rhythm, hr }, vitals: bp, flags: [flag],
  };
}

/**
 * Nitroglycerin: no chest pain to ease, only wider vessels — the pressure falls (nitrates during a sheath pull are a known
 * trigger of this reaction). The 0.8 mg dose drops it about twice as far
 */
const nitroFx = (high: boolean): Responder => (s) => {
  const bp = high ? bpAfter(s, -20, -10) : bpAfter(s, -10, -6);
  return {
    say: [['you', `Nitroglycerin ${high ? '0.8' : '0.4'} mg under the tongue.`], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`, 'bad'], ...(reacting(s) ? [line('patient', '"Everything\'s going dark…"', 'bad')] : [])],
    vitals: bp, flags: high ? ['nitro', 'nitro-high'] : ['nitro'],
  };
};

/** Amiodarone during the reaction: it slows the sinus node and opens the vessels — the rate and the pressure sag further */
function amiodaroneFx(s: SimState): Effect | null {
  if (!reacting(s) || paced(s)) return null;
  const hr = Math.min(s.rhythm.hr, Math.max(30, s.rhythm.hr - 4));
  const bp = bpAfter(s, -6, -4);
  return {
    say: [['you', 'Amiodarone 150 mg running over 10 minutes.'], ['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`, 'bad']],
    rhythm: { ...s.rhythm, hr }, vitals: bp, flags: ['amiodarone'],
  };
}

/**
 * Transcutaneous pacing holds the rate at 70 (it hurts, and the vessels stay wide open, so the pressure only partly comes
 * back). It is the step after atropine in the AHA algorithm, so it does not stand in for the atropine item.
 */
function paceFx(s: SimState): Effect | null {
  if (!reacting(s) || s.rhythm.hr >= 50 || paced(s)) return null;
  const bp = bpAfter(s, 8, 5);
  return {
    say: [['monitor', 'Pacer on: rate 70, output turned up to 80 mA.'], ['monitor', `Heart rate 70. BP ${bp.sbp}/${bp.dbp}.`], ['patient', '"Ow — what is that thumping in my chest?"']],
    rhythm: { profile: 'tcp', hr: 70 }, vitals: { ...bp, pain: Math.max(s.vitals.pain, 7) }, flags: ['pads', 'monitor', 'paced', 'rate-up'],
  };
}

/** An opioid or a sedative during the reaction: the pressure drifts down and he gets drowsier */
const sedativeFx = (what: string, flags: string[]): Responder => (s) => {
  if (!reacting(s)) return null;
  const bp = bpAfter(s, -8, -5);
  return {
    say: [['you', what], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`], ['scene', 'He grows drowsier and paler.', 'bad']],
    vitals: { ...bp, gcs: Math.min(s.vitals.gcs, 13) }, flags,
  };
};

/**
 * An anticoagulant, an antiplatelet drug or a lytic with a fresh femoral puncture: it oozes round the fingers on the
 * groin, and the hold has to run longer
 */
const thinnerFx = (what: string, flags: string[]): Responder => (s) => ({
  say: [['you', what], ...(holding(s) && s.role !== 3 ? [line('team', 'Tech: "It\'s oozing round my fingers now — I\'ll need longer on this groin."', 'bad')] : [])],
  flags,
  // the ooze needs a full hold again from now
  ...(holding(s) ? { timers: { holdEnd: Math.max(holdEnd(s), s.minute + HOLD_MINUTES) } } : {}),
});

// ─── The tech's hands ───────────────────────────────────────────────────────

/**
 * Jobs that take the tech's hands off the groin, with what the job itself gives. While the puncture is not sealed, the
 * tech doing one of them lets the artery bleed: a hematoma, and the hold starts again.
 */
const HANDS_OFF: Record<string, [string, (s: SimState) => Effect]> = {
  ecg12: ['put the leads on for a 12-lead', () => ({ say: [['monitor', '12-lead acquired.']], flags: ['ecg12', 'monitor'] })],
  'ecg12-repeat': ['put the leads back on for another 12-lead', (s) => (has(s, 'ecg12')
    ? { say: [['monitor', '12-lead re-acquired.']], flags: ['ecg12', 'monitor', 'ecg12-repeat'] }
    : { blocked: true, say: [['system', 'There is nothing to repeat yet: record a first 12-lead.']] })],
  'ecg-right': ['move the chest leads to the right side', () => ({ say: [['monitor', 'V4R: no ST elevation.']], flags: ['ecg-right'] })],
  'ecg-posterior': ['put leads on his back', () => ({ say: [['monitor', 'V7–V9: no ST elevation.']], flags: ['ecg-posterior'] })],
  pads: ['put the pads on his chest', () => ({ say: [['you', 'Pads on: anterior–lateral.']], flags: ['pads', 'monitor'] })],
  pace: ['put the pads on and set the pacer', (s) => paceFx(s) ?? (s.rhythm.hr > 70
    ? { say: [['monitor', `Pacer on in demand mode at 70: his own rate of ${s.rhythm.hr} is faster, so it does not fire.`]], flags: ['pads', 'monitor'] }
    : { say: [['monitor', 'Pacer on at 70.'], line('team', `Nurse: "His own rate is ${s.rhythm.hr} — pacing is for a rate under 50 that atropine hasn't fixed. Pacer off."`, 'warn')], flags: ['pads', 'monitor'] })],
  // compressions and a shock both need the hands — and the pads — on his chest
  cpr: ['start compressions', () => ({ say: [['patient', 'He cries out — he has a pulse and is breathing.', 'bad']] })],
  defib: ['put the pads on and shock', () => ({ say: [['monitor', 'Shock delivered: 200 J.']], flags: ['pads', 'monitor'] })],
  cardiovert: ['put the pads on and cardiovert', () => ({ say: [['monitor', 'Synchronized shock delivered: 100 J. No change on the monitor.'], ['patient', '"Aagh! What was that?"', 'bad']], flags: ['pads', 'monitor'] })],
  'o2-nc': ['put the oxygen on', (s) => {
    const spo2 = Math.min(97, s.vitals.spo2 + (s.vitals.spo2 < 94 ? 4 : 1));
    return { say: [['monitor', `Nasal cannula on. SpO₂ ${spo2}%.`]], vitals: { spo2 }, flags: ['o2'] };
  }],
  'o2-nrb': ['put an oxygen mask on', (s) => {
    const spo2 = Math.min(100, s.vitals.spo2 + 5);
    return { say: [['monitor', `Non-rebreather at 15 L/min. SpO₂ ${spo2}%.`]], vitals: { spo2 }, flags: ['o2'] };
  }],
  bvm: ['get the bag-mask on his face', () => ({ say: [['patient', 'He pushes the mask away: he is breathing on his own.']] })],
  'bp-both-arms': ['take a pressure in each arm', (s) => ({
    say: [['you', `Right arm ${s.vitals.sbp}/${s.vitals.dbp} · left arm ${Math.max(50, s.vitals.sbp - 4)}/${Math.max(25, s.vitals.dbp - 2)}.`]], flags: ['bp', 'bp-arms'],
  })],
  capno: ['set up the capnography line', (s) => ({ say: [['monitor', `EtCO₂ ${s.vitals.etco2} mmHg with a normal square waveform.`]], flags: ['capno'] })],
};

/** The tech lets go of the groin to do one of these: the job gets done, the puncture bleeds, and the hold starts again */
const handsOff = (id: string): Responder => (s) => {
  if (s.role !== 3 || !holding(s)) return null;
  const [what, job] = HANDS_OFF[id];
  const e = job(s);
  if (e.blocked) return e;
  const again = has(s, 'hematoma');
  return {
    ...e,
    say: [
      ['you', `You take your hands off the groin to ${what}.`, 'bad'],
      ...(e.say ?? []),
      ['scene', again ? 'Blood wells up again, and the lump at the puncture grows.' : 'Bright red blood wells up from the puncture, and a lump rises under the skin.', 'bad'],
      ['team', 'Nurse: "The groin — get back on it!"', 'bad'],
      ['you', `Back on, firm, just above the puncture: the bleeding stops, but a firm lump about ${again ? 6 : 4} cm across stays. The 15-minute hold starts again.`, 'warn'],
    ],
    flags: [...(e.flags ?? []), 'let-go', 'hematoma', ...(again ? ['hematoma-large'] : [])],
    timers: { ...(e.timers ?? {}), holdEnd: s.minute + INTERVENTION_BY_ID[id].minutes + HOLD_MINUTES },
  };
};

// ─── Looking for a bleed ──────────────────────────────────────────────────────

/** The lump at the puncture after the pressure came off: about 4 cm, 6 if it came off twice */
const lumpSize = (s: SimState) => (has(s, 'hematoma-large') ? 6 : 4);

/** The CT of the abdomen and pelvis: the groin lump shows only if the pressure came off */
const ctText = (s: SimState) => (has(s, 'hematoma')
  ? 'CT abdomen and pelvis: no retroperitoneal hematoma; a small hematoma in the right groin only.'
  : 'CT abdomen and pelvis: no retroperitoneal or groin hematoma.');

/** What the groin, the thigh, the belly, the flank and the back show (the lump only if the pressure came off) */
function siteText(s: SimState): string {
  const skin = reacting(s) ? 'Pale, cold and wet with sweat.' : 'Warm, with his color back.';
  let groin: string;
  if (!holding(s)) {
    groin = has(s, 'hematoma') ? 'The right groin is dry under the dressing, with a firm lump whose edge is marked and is not growing' : 'The right groin is soft, flat and dry under the dressing';
  } else {
    const whose = s.role === 3 ? 'Under your fingers the right groin is' : 'The right groin under the tech\'s fingers is';
    groin = has(s, 'hematoma')
      ? `${whose} firm over a lump about ${lumpSize(s)} cm across, from when the pressure came off — not growing now that it is back on, and no ooze`
      : `${whose} soft and flat — no swelling, no ooze`;
  }
  const pulse = holding(s) ? 'the right foot pulses are there, so the artery is not pressed shut' : 'the right foot pulses are strong';
  return `${skin} ${groin}; ${pulse}. The thigh is soft; no tenderness over the lower belly or the right flank, and no pain in his back.`;
}

/** The read, once the learner has looked for a bleed */
function reactionRead(s: SimState): Omit<PendingRead, 'minute'> {
  const lump = has(s, 'hematoma')
    ? ' The lump at the puncture came from letting go of the groin: it is small and not growing, and it does not explain a pulse of 38.'
    : '';
  return {
    kind: 'clinical', answer: 'clin-vasovagal', partial: ['clin-bezold'], prompt: reacting(s) ? 'What is happening to him?' : 'What happened to him?',
    explain: 'A vasovagal reaction to the sheath pull: the pain and the pressure in the groin set off a vagal surge — yawning, nausea and sweating, then the pulse and the pressure fall together. '
      + 'The groin, the thigh and the belly are soft and there is no back or flank pain, so nothing points to a bleed — and the response is the proof: legs up, a fluid bolus and atropine bring a vagal reaction back within minutes. '
      + 'If the pressure does not come back, or falls again, treat it as a bleed (a retroperitoneal bleed can set off a vagal reaction of its own). '
      + `The Bezold–Jarisch reflex ends the same way, but starts in the heart: reperfusion of the inferior wall, or a right coronary injection.${lump}`,
  };
}

// ─── The study is over ─────────────────────────────────────────────────────────

const OVER = 'The study is over: the catheters and the sheath are out. Treat him where he lies.';
const NO_NEW_PUNCTURE = 'The study is over, and nothing here needs a new puncture: treat him on the table, and look at the groin, the thigh, the flank and the back for a bleed.';

/** Procedure steps, devices and intracoronary drugs that need a catheter or a sheath in an artery */
const PROCEDURE_OVER: Record<string, string> = Object.fromEntries([
  ...['angio', 'reposition', 'balloon-tamponade', 'clear-air', 'cath-tiger', 'cath-jl4', 'cath-jr4', 'cath-pigtail', 'guide-ebu', 'guide-jr4', 'guide-al1',
    'wire-workhorse', 'wire-hydrophilic', 'aspiration', 'balloon-predil', 'stent-des', 'balloon-nc', 'stent-covered', 'iabp', 'impella', 'temp-wire',
    'view-rao-caudal', 'view-rao-cranial', 'view-ap-cranial', 'view-lao-cranial', 'view-lao-caudal', 'view-rca-lao', 'view-rca-rao', 'view-rca-cranial',
    'lv-gram', 'lvedp', 'rhc', 'ffr-equalize', 'ffr', 'ivus', 'oct', 'final-angio', 'radial-cocktail', 'ic-nitro', 'ic-adenosine', 'ic-verapamil',
    'ic-nitroprusside', 'ic-epinephrine', 'adenosine-iv-ffr', 'transducer', 'prep', 'timeout', 'consent'].map((id) => [id, OVER]),
  ...['access', 'access-femoral', 'access-venous'].map((id) => [id, NO_NEW_PUNCTURE]),
  ['closure-device', 'The sheath is already out: a closure device is deployed through the sheath, so it is manual pressure now.'],
  ['pericardiocentesis', 'Nothing points to an effusion after a diagnostic study with no wire in a coronary: look at the groin, the thigh, the flank and the back — and an echo if you want to see the heart.'],
  ['stop-contrast', 'No contrast is running: the study is over.'],
  ['act', 'No heparin was given for this diagnostic study: there is no heparin effect for an ACT to measure.'],
]);

const blockedBecause = (why: string): Responder => () => ({ blocked: true, say: [['system', why]] });

// ─── The nurse's part: the cardiologist asks, the nurse answers ───────────────

const RN_ASKS: LabAsk[] = [
  {
    // the ask names no numbers: by the time he walks in on the alarm the nurse may already have brought the rate up
    id: 'rn-rate', role: 4, when: (s) => has(s, 'md-here'), early: true, wait: 3,
    ask: 'Something for his rate, please.',
    accept: ['atropine'],
    thanks: 'Thanks — the rate\'s coming up.', fallback: 'I\'ll push the atropine myself.', gives: 'rn-rate-done',
    fallbackEffect: (s) => atropineFx(s) ?? {},
    label: 'Atropine for the slow rate, as asked', points: 10,
    why: 'Atropine blocks the vagus at the sinus node: 1 mg IV, repeated every 3–5 minutes to 3 mg (lab protocols often start with 0.5 mg; never less than 0.5 mg, which can slow the heart further).',
  },
  {
    id: 'rn-pressure', role: 4, when: (s) => has(s, 'md-here'), early: true, wait: 3,
    ask: 'And his pressure — what does he need from you?',
    accept: ['legs-up', 'fluid'],
    thanks: 'Good.', fallback: 'Bed head-down and the saline wide open — I\'ll do it myself.', gives: 'rn-pressure-done',
    fallbackEffect: (s) => {
      if (!reacting(s)) return {};
      const bp = bpAfter(s, 18, 10);
      return { say: [['monitor', `BP ${bp.sbp}/${bp.dbp}.`]], vitals: bp, flags: ['legs-up', 'fluid', 'fluid-given'] };
    },
    label: 'Legs above the heart or a fluid bolus for the pressure, as asked', points: 10,
    why: 'The surge also opens the vessels: legs above the heart (the bed tilted head-down, so the punctured hip stays straight) return blood from them at once, and 250–500 mL of saline fills the dilated circulation. A pressure that does not come back with them is a bleed until proven otherwise.',
  },
];

/**
 * The first minute one of these was done during the reaction — from its start until he recovered. A treatment given once
 * he is back has nothing left to treat (atropine then only races the heart), so it earns nothing
 */
const duringReaction = (ids: string[]) => (s: SimState): number | null => {
  const from = s.flags.reaction;
  if (from === undefined) return null;
  const to = s.flags.recovered ?? Infinity;
  const hit = s.performed.find((p) => ids.includes(p.id) && p.minute >= from && p.minute < to);
  return hit ? hit.minute : null;
};

/** The nurse's item for the cardiologist's ask: the right answer during the reaction (early counts), from the ask on */
function rnAskCritical(a: LabAsk) {
  const c = askCritical(a);
  return {
    ...c,
    done: (s: SimState) => {
      const at = s.flags[`asked-${a.id}`];
      const m = duringReaction(a.accept)(s);
      return at === undefined || m === null ? null : Math.max(m, at);
    },
  };
}

/** Looking for a bleed (the skin, the groin, the thigh, the belly, the flank and the back): every role's item */
const SITE_CHECK = {
  label: 'Look for a bleed: the groin, the thigh, the belly, the flank and the back',
  why: 'A bleed can look like this: a groin hematoma, or a retroperitoneal bleed that tracks up behind the belly with little to see at the groin (and can slow the pulse itself). Look at the site and the thigh, feel the lower belly and the flank, and ask about back pain before you put it down to a reflex.',
  done: ['perfusion'], after: 'reaction', target: { within: { flag: 'reaction', minutes: 3 } },
};

// ─── Hand-off ─────────────────────────────────────────────────────────────────

const listOf = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items.join(''));

/** The SBAR says what happened and what was given in this run, and only what was examined */
function handoffText(s: SimState): string {
  const given = [
    has(s, 'legs-up') && 'the legs raised',
    has(s, 'fluid-given') && 'a saline bolus',
    has(s, 'transfused') && 'a unit of red cells',
    has(s, 'atropine') && 'atropine 1 mg',
    has(s, 'paced') && 'a spell of transcutaneous pacing',
    (has(s, 'push-epi') || has(s, 'epi-im')) && 'epinephrine',
    has(s, 'phenylephrine') && 'phenylephrine',
    has(s, 'pressor') && 'a vasopressor infusion',
  ].filter((x): x is string => !!x);
  const course = has(s, 'pause')
    ? 'pulse 38 and pressure 70/40, then 32 with a 6-second pause and a few seconds of jerking'
    : has(s, 'worse') ? 'pulse 38 and pressure 70/40, then 32' : 'pulse 38, pressure 70/40';
  const groin = has(s, 'hematoma')
    ? `a hematoma about ${lumpSize(s)} cm across at the puncture from a release of the pressure, its edge marked and not growing`
    : 'the groin soft and dry';
  const looked = has(s, 'site-checked') ? 'no back, flank or belly pain' : 'the belly, the flank and the back still to be examined';
  return `SBAR to the recovery nurse: a vasovagal reaction during the femoral hold — ${course} — treated with ${listOf(given) || 'the team\'s measures'}, and back to normal. `
    + `Now ${groin}; ${looked}; the hold is complete. Plan: flat with the right leg straight for 2–4 hours; the site, the foot pulses and the vitals every 15 minutes at first; keep the IV; eat and drink once settled. `
    + 'Call at once for a falling pressure, a climbing pulse, back or flank pain, or a growing groin. Next time: radial access — or IV analgesia, fluid and atropine at hand before any femoral sheath comes out.';
}

const BRIEFING: Line[] = [
  ['team', 'Diagnostic left heart cath, just finished: 58-year-old man with chest pressure on exertion. His right radial artery has been occluded since a cath three years ago and the left one is small on ultrasound, so this study went in through the right common femoral artery, over the femoral head, with a 6 French sheath. Mild non-obstructive disease; normal LV function. No heparin; midazolam 1 mg and fentanyl 25 mcg at the start. Nothing to eat or drink since last night.'],
  ['team', 'The sheath came out five minutes ago and the tech is holding firm pressure just above the puncture. The IV is in; the monitor and the NIBP cuff are on. Before the pull: 128/76, heart rate 72.'],
  ['scene', 'He yawns twice and says he feels sick. His forehead is wet.'],
];

const roleLine: Record<3 | 4 | 5, Line> = {
  3: ['team', 'You are the tech, and your fingers are on his groin: the hold is 15 minutes for a 6 French sheath with no heparin on board. The nurse is at his head; the cardiologist is dictating in the control room.'],
  4: ['team', 'You are the procedural nurse, at his side. The tech is holding the groin; the cardiologist is dictating in the control room.'],
  5: ['team', 'You are the cardiologist, back at the table from the control room. The tech is holding the groin; the nurse is at his head.'],
};

/** Who in the room raises the alarm when the reaction starts (the tech learner has to do it) */
function alarm(s: SimState): Line[] {
  if (s.role === 4) return [line('team', 'Tech (at the groin): "Heart rate 38! I\'m staying on the groin."', 'warn')];
  if (s.role === 5) return [line('team', 'Nurse: "Doctor — rate 38, pressure 70 over 40! What do you want?"', 'warn'), line('team', 'Tech: "I\'m staying on the groin."')];
  return [];
}

/**
 * The callout (or a call for help) that brings the cardiologist in from the control room — or, once he has come in on the
 * alarm, the same report to him at the table. The numbers and how he looks are the ones on the monitor now
 */
function callIn(s: SimState, how: Speaker): Effect {
  const numbers = `${s.role === 3 ? 'heart rate ' : 'he\'s '}${s.rhythm.hr}${s.role === 3 ? ', pressure ' : ' and '}${s.vitals.sbp} over ${s.vitals.dbp}`;
  const looks = reacting(s) ? (s.role === 3 ? ', and he\'s gray and sweaty' : ', sweaty and sick') : ' — he\'s pinking up';
  const here = has(s, 'md-here');
  const said: Line = s.role === 3
    ? ['you', `"Doctor — ${numbers}${looks}. I'm staying on the groin."`]
    : ['you', `"Doctor — ${numbers}${looks}.${here ? '' : ' Can you come in?'}"`];
  const answer: Line = here
    ? ['operator', s.role === 3 ? '"Thanks — keep the numbers coming. And stay on that groin."' : '"Got it — thanks."']
    : how === 'operator'
      ? ['operator', s.role === 3 ? '"On my way in. Stay on that groin — don\'t let go."' : '"On my way in."']
      : ['team', 'The cardiologist hears it from the control room and comes straight in.'];
  return { say: [said, answer], flags: ['called-out'] };
}

export const cathlabVasovagal: Scenario = {
  id: 'vasovagal-sheath-cathlab',
  title: 'Diagnostic cath: trouble at the sheath pull',
  summary: '58-year-old man after a diagnostic cath from the groin. During the manual pressure he yawns, feels sick and sweats — and his pulse and pressure fall. Treat him without letting the groin bleed, and make sure it is not a bleed.',
  setting: 'cathlab',
  roles: [3, 4, 5],
  difficulty: 'intermediate',
  conditionId: 'sinus-bradycardia',
  briefing: {
    default: BRIEFING,
    3: [...BRIEFING, roleLine[3]],
    4: [...BRIEFING, roleLine[4]],
    5: [...BRIEFING, roleLine[5]],
  },
  initial: {
    rhythm: { profile: 'normal-sinus', hr: 72 },
    vitals: { sbp: 128, dbp: 76, spo2: 97, rr: 16, etco2: 36, pain: 3, gcs: 15, glucose: 96, temp: 36.6 },
  },
  facts: {
    allergies: 'No allergies.',
    sample: 'No allergies. Atorvastatin and lisinopril. High blood pressure and high cholesterol. Nothing to eat or drink since last night.',
    opqrst: (s) => (reacting(s)
      ? 'Just my groin, where you\'re pressing — 4 out of 10. No pain in my back or my belly. I feel sick and dizzy.'
      : 'Only the groin, a bit sore. Nothing in my back or my belly.'),
    labs: 'Hemoglobin 14.0 g/dL (14.2 this morning), platelets 230, INR 1.0, creatinine 0.9, potassium 4.1.',
    ecg12: (s) => (s.rhythm.profile === 'sinus-bradycardia'
      ? `Sinus bradycardia at ${s.rhythm.hr}: a P wave before every QRS, a normal PR interval and a narrow QRS, no AV block and no ST elevation.`
      : s.rhythm.profile === 'tcp'
        ? 'Transcutaneous pacing at 70: a wide QRS after every pacing spike.'
        : `Normal sinus rhythm at ${s.rhythm.hr}: normal intervals, no ST changes.`),
    echo: (s) => `Normal LV size and squeeze, EF about 60 %; no pericardial effusion; the IVC is small and ${reacting(s) ? 'collapses fully with each breath' : 'narrows with each breath'}.`,
    neuro: (s) => (reacting(s) ? 'Slow to answer, but oriented; moves everything.' : 'No focal deficit.'),
    ct: ctText,
  },
  status: (s) => {
    if (has(s, 'recovered')) return '"Much better. Still a bit queasy — and my groin is sore."';
    // a drug has lifted the numbers, but the surge has not settled yet
    if (s.rhythm.hr >= 60 && s.vitals.sbp >= 90) return '"A bit better… still sick to my stomach."';
    if (has(s, 'pause')) return 'He comes round slowly, confused: "What happened?"';
    if (has(s, 'worse')) return 'He barely answers: "…so dizzy…"';
    return '"I feel sick… everything\'s going gray."';
  },
  respond: {
    // the tech's hands stay on the groin until the hold is over
    ...Object.fromEntries(Object.keys(HANDS_OFF).filter((id) => id !== 'pace').map((id) => [id, handsOff(id)])),
    pace: (s) => handsOff('pace')(s) ?? paceFx(s),
    vitals: (s) => (s.role === 3 && holding(s) && s.pulse
      ? { say: [['you', `Your hands stay on the groin: you read the numbers off the monitor — BP ${s.vitals.sbp}/${s.vitals.dbp} · pulse ${s.rhythm.hr} · RR ${s.vitals.rr} · SpO₂ ${s.vitals.spo2}%.`]], flags: ['bp'] }
      : null),
    perfusion: (s) => (has(s, 'reaction')
      ? { say: [['you', siteText(s)]], flags: ['perfusion', 'site-checked'], read: reactionRead(s) }
      : null),
    'legs-up': legsFx,
    atropine: (s) => atropineFx(s),
    fluid: (s) => fluidFx(s),
    'push-epi': (s) => epiFx(s, 'Epinephrine 10 mcg IV push.', 'push-epi', 10, 16, 10),
    'epi-im': (s) => epiFx(s, 'Epinephrine 0.5 mg IM, lateral thigh.', 'epi-im', 8, 12, 6),
    nitro: nitroFx(false),
    'nitro-high': nitroFx(true),
    'amio-infusion': amiodaroneFx,
    fentanyl: sedativeFx('Fentanyl 25 mcg IV.', ['analgesia']),
    midazolam: sedativeFx('Midazolam 1 mg IV.', ['benzodiazepine', 'sedation']),
    sedation: sedativeFx('Sedation given.', ['sedation']),
    // a vagal maneuver adds to the vagal surge
    vagal: (s) => {
      if (!reacting(s)) return null;
      const hr = Math.max(30, s.rhythm.hr - 6);
      const bp = bpAfter(s, -6, -4);
      return { say: [['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`, 'bad']], rhythm: { ...s.rhythm, hr }, vitals: bp, flags: ['vagal'] };
    },
    // no heparin to reverse: protamine brings only its own fall in pressure
    protamine: (s) => {
      if (has(s, 'heparin')) return null;
      const bp = bpAfter(s, -8, -4);
      return { say: [['you', 'Protamine 50 mg slowly IV.'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`, 'bad']], vitals: bp, flags: ['protamine'] };
    },
    heparin: thinnerFx('Heparin bolus given (weight-based).', ['heparin']),
    bivalirudin: thinnerFx('Bivalirudin bolus given, infusion running.', ['bivalirudin', 'anticoagulated']),
    gp2b3a: thinnerFx('Eptifibatide bolus given, infusion running.', ['gp2b3a']),
    cangrelor: thinnerFx('Cangrelor bolus given, infusion running.', ['p2y12', 'cangrelor']),
    tnk: thinnerFx('Tenecteplase given.', ['lytic']),
    // nobody goes to the scanner with a hand on his femoral artery; once the hold is over, the CT shows what is there
    'ct-urgent': (s) => {
      if (holding(s)) {
        return { blocked: true, say: [['system', `Not during the hold (${minutes(holdLeft(s))}): nobody moves him to the scanner with a hand on his artery. Look at the groin, the thigh, the flank and the back here; if a bleed is still suspected once he is stable, scan him after the hold.`]] };
      }
      return { say: [['team', 'Scanned and back: he went with a nurse and the monitor.'], ['hospital', ctText(s)]], flags: ['ct'] };
    },
    ...Object.fromEntries(Object.entries(PROCEDURE_OVER).map(([id, why]) => [id, blockedBecause(why)])),
    callout: (s) => {
      if (!has(s, 'reaction')) return null;
      if (!has(s, 'called-out')) {
        const e = callIn(s, 'operator');
        // a first call made after the rate came up already reports the response
        return { ...e, flags: ['callout', ...(e.flags ?? []), ...(s.role === 3 && has(s, 'rate-up') ? ['response-called'] : [])] };
      }
      // closed loop: the response to the treatment, out loud
      if (s.role === 3 && has(s, 'rate-up') && !has(s, 'response-called')) {
        return {
          say: [['you', `"Rate ${s.rhythm.hr}, pressure ${s.vitals.sbp} over ${s.vitals.dbp} — he's pinking up."`], ['operator', '"Thanks — keep calling the numbers. And stay on that groin."']],
          flags: ['callout', 'response-called'],
        };
      }
      return null;
    },
    // in the lab a call for help reaches the cardiologist in the control room first
    'call-help': (s) => {
      if (!has(s, 'reaction') || has(s, 'called-out') || s.role === 5) return null;
      const e = callIn(s, 'team');
      return { ...e, flags: ['help', ...(e.flags ?? [])] };
    },
    hemostasis: (s) => {
      const left = holdLeft(s);
      if (s.role === 3) {
        if (holding(s) && left > 0) {
          return { blocked: true, say: [['system', `Not yet: ${minutes(left)} of the 15-minute hold${has(s, 'let-go') ? ' (it started again when the pressure came off)' : ''} — the reaction does not shorten it. Keep the pressure on and keep watching him (reassess).`]] };
        }
        return {
          say: [['you', has(s, 'hematoma')
            ? 'Hold finished: pressure eased off slowly over the last minute. The site stays dry and the lump is no bigger — its edge marked with a pen. Dressing on; the right foot pulses are strong and the leg is warm.'
            : 'Fifteen minutes: pressure eased off slowly over the last minute. The site stays dry and soft, with no lump. Dressing on; the right foot pulses are strong and the leg is warm.']],
          flags: ['hemostasis', 'hold-done'],
        };
      }
      // the nurse checks the site once the tech has finished the hold
      if (holding(s)) return { blocked: true, say: [['system', `The tech is holding the groin: ${minutes(left)} of the 15-minute hold. Watch the site and the foot pulses meanwhile (skin signs and pulses).`]] };
      return {
        say: [['you', has(s, 'hematoma')
          ? 'Site checked after the hold: dry, the marked lump no bigger; dressing clean; the right foot pulses strong and the leg warm.'
          : 'Site checked after the hold: soft, flat and dry; dressing clean; the right foot pulses strong and the leg warm.']],
        flags: ['hemostasis', 'site-rechecked'],
      };
    },
    // the engine holds the hand-off back until the hold is over and he is back to normal (completeWhen)
    handoff: (s) => (has(s, 'recovered') && has(s, 'hold-done') ? { say: [['you', handoffText(s)]], flags: ['handoff'] } : null),
  },
  events: [
    {
      // where the case stands: the study done, the IV in, the monitor on, the sheath out — and the reaction starting
      id: 'reaction', when: () => true,
      effect: (s) => ({
        say: [
          ['patient', '"I feel sick… I think I\'m going to pass out."'],
          ['scene', 'He yawns again. His face is gray and wet with sweat.'],
          ['monitor', 'Heart rate 38. BP 70/40.', 'bad'],
          ...alarm(s),
        ],
        rhythm: { profile: 'sinus-bradycardia', hr: 38 }, vitals: { sbp: 70, dbp: 40, rr: 18, pain: 4 },
        flags: ['consent', 'timeout', 'iv', 'monitor', 'prep', 'femoral', 'reaction'], timers: { holdEnd: FIRST_HOLD_END },
      }),
    },
    {
      // the cardiologist comes in from the control room: called, or after hearing the alarm
      id: 'md-here', when: (s) => s.role !== 5 && (has(s, 'called-out') || s.minute >= s.flags.reaction + 1.5),
      effect: (s) => ({
        say: [has(s, 'called-out')
          ? ['scene', 'The cardiologist comes in from the control room.']
          : ['operator', s.role === 3
            ? `"${s.rhythm.hr < 60 ? `Rate ${s.rhythm.hr}` : `A pressure of ${s.vitals.sbp}`} on my screen — why didn't anyone call me?"`
            : '"I can hear that alarm — what\'s going on in there?"', 'warn']],
        flags: ['md-here'],
      }),
    },
    ...RN_ASKS.flatMap(askEvents),
    {
      // the tech holds the groin: the nurse treats on the cardiologist's order
      id: 'rn-treats-for-tech',
      when: (s) => s.role === 3 && reacting(s) && has(s, 'md-here') && (!has(s, 'called-out') || s.minute >= s.flags['called-out'] + 0.5),
      effect: (s) => {
        // atropine (unless his own rate is already back), then the legs and the bolus on top of the pressure it gives
        const drug = atropineFx(s);
        const bp = bpAfter({ ...s, vitals: { ...s.vitals, ...(drug?.vitals ?? {}) } }, 18, 10);
        return {
          say: [
            ['team', `Nurse: "Bed head-down, saline wide open${drug ? ' — and atropine 1 milligram in' : ''}, on the doctor's order."`],
            ['monitor', `Heart rate ${drug ? 74 : s.rhythm.hr}. BP ${bp.sbp}/${bp.dbp}.`],
          ],
          ...(drug ? { rhythm: drug.rhythm } : {}), vitals: bp, flags: ['legs-up', 'fluid', 'fluid-given', ...(drug?.flags ?? [])],
        };
      },
    },
    {
      // nothing for the rate: it slows further and the pressure follows
      id: 'worse', when: (s) => reacting(s) && !has(s, 'rate-up') && s.minute >= s.flags.reaction + 3,
      effect: (s) => {
        const bp = bpAfter(s, -10, -6);
        return {
          say: [['monitor', `Heart rate 32. BP ${bp.sbp}/${bp.dbp}.`, 'bad'], ['scene', 'His eyes roll up and he does not answer for a few seconds.', 'bad'], teammate(s, 'He\'s going — 32!', 'bad')],
          rhythm: { ...s.rhythm, hr: 32 }, vitals: { ...bp, gcs: Math.min(s.vitals.gcs, 12) }, flags: ['worse'],
        };
      },
    },
    {
      id: 'pause', when: (s) => reacting(s) && !has(s, 'rate-up') && has(s, 'worse') && s.minute >= s.flags.reaction + 5,
      effect: (s) => {
        const bp = bpAfter(s, -4, -2);
        return {
          say: [['monitor', `A 6-second pause with no beats at all, then slow beats again at 30. BP ${bp.sbp}/${bp.dbp}.`, 'bad'], ['scene', 'His arms jerk for a few seconds; he comes round slowly, confused.', 'bad']],
          rhythm: { ...s.rhythm, hr: 30 }, vitals: { ...bp, gcs: Math.min(s.vitals.gcs, 11) }, flags: ['pause'],
        };
      },
    },
    {
      // the cardiologist has not acted: the nurse gives the lab's standing orders
      id: 'rn-atropine-standing', when: (s) => s.role === 5 && reacting(s) && !has(s, 'rate-up') && s.minute >= s.flags.reaction + 6,
      effect: (s) => atropineFx(s, line('team', 'Nurse: "He\'s still slow — atropine 1 milligram in, on our standing order."', 'warn')) ?? {},
    },
    {
      id: 'rn-fluid-standing',
      when: (s) => s.role === 5 && reacting(s) && !has(s, 'fluid-given') && !has(s, 'transfused') && !has(s, 'legs-up') && s.minute >= s.flags.reaction + 6,
      effect: (s) => fluidFx(s, line('team', 'Nurse: "And I\'ve opened the saline wide."', 'warn')) ?? {},
    },
    {
      // the rate back (atropine, or a pacer), and the circulation filled (fluid or blood, or the legs up for a few minutes)
      id: 'recovered',
      when: (s) => reacting(s) && has(s, 'rate-up')
        && (has(s, 'fluid-given') || has(s, 'transfused') || (has(s, 'legs-up') && s.minute >= s.flags['rate-up'] + 3)),
      effect: (s) => {
        const sbp = Math.max(s.vitals.sbp, 112);
        const dbp = Math.max(s.vitals.dbp, 68);
        return {
          say: [
            ['monitor', paced(s) ? `Heart rate 76: his own beats are back, faster than the pacer, so it stops firing. BP ${sbp}/${dbp}.` : `Heart rate 76. BP ${sbp}/${dbp}.`, 'good'],
            ['patient', '"Oh… that\'s better. I thought I was going to pass out."'],
            ['scene', 'The color comes back into his face, and the sweat dries.'],
          ],
          // the cardiologist's open asks to the nurse close with it: nobody pushes atropine into a rate of 76
          rhythm: { profile: 'normal-sinus', hr: 76 }, vitals: { sbp, dbp, gcs: 15, pain: 2 }, flags: ['recovered', 'rn-rate-done', 'rn-pressure-done'],
        };
      },
    },
    {
      // the tech finishes the hold when the learner is the nurse or the cardiologist
      id: 'tech-hold-done', when: (s) => s.role !== 3 && holding(s) && s.minute >= holdEnd(s),
      effect: (s) => ({
        say: [['team', has(s, 'hematoma')
          ? 'Tech: "Hold\'s done. Easing off slowly… dry, and the lump is no bigger — edge marked. Dressing on; his foot pulses are strong."'
          : 'Tech: "Fifteen minutes. Easing off slowly… The site is dry, no lump. Dressing on; his foot pulses are strong."']],
        flags: ['hold-done'],
      }),
    },
  ],
  critical: [
    { id: 'tech-callout', label: 'Call out the slow pulse and the low pressure at once — and stay on the groin', why: 'Your hands are on the artery, so your voice is your tool: rate, pressure and how he looks, out loud, so the nurse and the cardiologist treat him while you keep the groin dry.', done: ['callout', 'call-help'], after: 'reaction', roles: TECH, points: 10, target: { within: { flag: 'reaction', minutes: 1 } } },
    { id: 'rn-callout', label: 'Get the cardiologist in at once', why: 'A pulse of 38 with a pressure of 70 needs the physician at the table within the minute: say what you see — the rate, the pressure, how he looks — and that the tech is holding the groin.', done: ['callout', 'call-help'], after: 'reaction', roles: RN, points: 10, target: { within: { flag: 'reaction', minutes: 1 } } },
    ...RN_ASKS.map(rnAskCritical),
    // each counts while the reaction lasts: once he is back there is nothing left for it to treat
    { id: 'md-legs', label: 'Legs above the heart', why: 'The fastest fix for the pressure: blood from the legs returns to the heart at once, while the drugs are drawn up. With a fresh femoral puncture, tilt the bed head-down (Trendelenburg) so the hip stays straight under the hand on the groin.', done: duringReaction(['legs-up']), uses: ['legs-up'], roles: MD, points: 5, target: { within: { flag: 'reaction', minutes: 2 } } },
    { id: 'md-atropine', label: 'Atropine 1 mg IV for the slow rate', why: 'Atropine blocks the vagus at the sinus node: 1 mg IV (0.5–1 mg in lab protocols; never less than 0.5 mg), every 3–5 minutes to 3 mg. Pacing, or an epinephrine or dopamine infusion, only if it fails (2025 AHA).', done: duringReaction(['atropine']), uses: ['atropine'], roles: MD, points: 10, target: { within: { flag: 'reaction', minutes: 2 } } },
    { id: 'md-fluid', label: 'A fluid bolus for the pressure', why: 'The vessels are wide open and he has fasted since last night: 250–500 mL of saline fast, and reassess. A pressure that does not come back with fluid and atropine is a bleed until proven otherwise.', done: duringReaction(['fluid']), uses: ['fluid'], roles: MD, points: 10, target: { within: { flag: 'reaction', minutes: 3 } } },
    { id: 'site-check', ...SITE_CHECK, roles: [3, 4], points: 10 },
    // ruling out the bleed is the cardiologist's own call: it weighs more in his run
    { id: 'md-site-check', ...SITE_CHECK, roles: MD, points: 15 },
    { id: 'tech-response', label: 'Call out the response to the treatment', why: 'Closed loop: the new rate and pressure, out loud, after the atropine and the fluid. A pressure that does not come back means a bleed until proven otherwise.', done: ['callout'], after: 'rate-up', roles: TECH, points: 5, target: { within: { flag: 'rate-up', minutes: 2 } }, applies: (s) => has(s, 'rate-up') },
    { id: 'tech-hold', label: 'Finish the 15-minute hold, then check the site and the foot pulses', why: 'The reaction does not shorten the hold: a 6 French femoral sheath with no heparin needs about 15 minutes of firm pressure, eased off slowly, then a dressing and a check of the site and the foot pulses.', done: ['hemostasis'], roles: TECH, points: 10 },
    { id: 'rn-site-after', label: 'Check the site and the foot pulses after the hold', why: 'Once the pressure comes off: a dry site, no lump growing, strong foot pulses and a warm leg — then every 15 minutes at first, with the vitals.', done: ['hemostasis'], after: 'hold-done', roles: RN, points: 5, applies: (s) => has(s, 'hold-done') },
    { id: 'handoff', label: 'Hand-off to the recovery nurse', why: 'What happened and what was given; the groin and the hold; bed rest and the checks; what to watch for (a falling pressure, a climbing pulse, back or flank pain, a growing groin) — and the plan for next time.', done: ['handoff'], roles: RN_MD, points: 5 },
  ],
  harms: [
    {
      // the tech's main lesson: it weighs as much as a missed call-out
      id: 'let-go', actions: Object.keys(HANDS_OFF), roles: TECH, when: (s) => holding(s), points: 10, severity: 'major',
      text: 'You let go of the groin while the artery was still open. A femoral puncture bleeds the moment the pressure comes off — a hematoma now, and more risk of a pseudoaneurysm — and the 15-minute hold starts again. Whoever holds the groin stays on it: call it out, and let the nurse and the cardiologist treat him.',
    },
    {
      id: 'pressor-before-basics', actions: ['push-epi', 'pressor'], roles: RN_MD, when: (s) => reacting(s) && !has(s, 'rate-up') && !has(s, 'fluid-given'), points: 3, severity: 'minor',
      text: 'Epinephrine or a pressor before the basics. Legs up, a fluid bolus and atropine bring this back within minutes; push-dose epinephrine or an infusion comes only when they fail (2025 AHA bradycardia algorithm), and adds a racing heart, a pressure spike and extra beats in a heart that was just studied for chest pain.',
    },
    {
      id: 'epi-im-no-anaphylaxis', actions: ['epi-im'], roles: RN_MD, points: 3, severity: 'minor',
      text: 'Epinephrine for anaphylaxis with no anaphylaxis. A contrast reaction drops the pressure too, but with a fast pulse, flushing, hives, wheeze or swelling; here the pulse is slow, the skin pale and wet, and he yawned and felt sick first — a vagal picture. Unneeded epinephrine races the heart and spikes the pressure in a man just studied for chest pain: legs up, fluid and atropine.',
    },
    {
      id: 'nodal-blocker-slow', actions: ['metoprolol', 'diltiazem', 'adenosine6', 'adenosine12', 'amio-infusion'], roles: RN_MD, when: (s) => s.pulse && s.rhythm.hr < 60 && !paced(s), replaces: RATE_RULES, points: 8, severity: 'major',
      text: 'A drug that slows the heart, with a pulse under 60. Metoprolol, diltiazem, amiodarone and adenosine slow the sinus node or the AV node further and deepen the fall in pressure: atropine is the drug for a slow rate.',
    },
    {
      id: 'lidocaine-no-arrhythmia', actions: ['lidocaine'], roles: RN_MD, points: 3, severity: 'minor',
      text: 'Lidocaine with no ventricular arrhythmia to treat. It is for VF, pulseless VT or a stable monomorphic VT; with a slow sinus rhythm it treats nothing and brings only its side effects.',
    },
    {
      // the built-in rule scores nitroglycerin with a systolic under 90; this one the rest of the time
      id: 'nitro-no-indication', actions: ['nitro', 'nitro-high'], roles: RN_MD, when: (s) => s.vitals.sbp >= 90, points: 3, severity: 'minor',
      text: 'Nitroglycerin with no chest pain to treat. It is for ischemic chest pain (or a high pressure in pulmonary edema); here it only opens the vessels and drops the pressure — and nitrates during a sheath pull are a known trigger of this reaction.',
    },
    {
      id: 'vagal-maneuver-slow', actions: ['vagal'], roles: RN_MD, when: (s) => s.pulse && s.rhythm.hr < 60, points: 3, severity: 'minor',
      text: 'A vagal maneuver with a slow pulse. It adds to the vagal surge that is slowing the heart: it is for a narrow-complex tachycardia.',
    },
    {
      id: 'sedative-in-reaction', actions: ['fentanyl', 'midazolam', 'sedation'], roles: RN_MD, replaces: ['midazolam-unsafe'], when: (s) => reacting(s), points: 4, severity: 'minor',
      text: 'An opioid or a sedative in the middle of the reaction. They drop the pressure further and dull a patient you need awake (fentanyl can slow the heart too): treat the reaction first. Analgesia belongs before the sheath comes out — next time, IV fentanyl (with a little midazolam if needed) before the pull.',
    },
    {
      id: 'protamine-no-heparin', actions: ['protamine'], roles: RN_MD, when: (s) => !has(s, 'heparin'), points: 5, severity: 'major',
      text: 'Protamine with no heparin to reverse. No heparin was given for this diagnostic study, so it can only do harm: protamine itself can drop the pressure, slow the heart and cause an anaphylactoid reaction.',
    },
    {
      id: 'thinner-fresh-puncture', actions: ['heparin', 'bivalirudin', 'gp2b3a', 'cangrelor', 'p2y12'], roles: RN_MD, points: 6, severity: 'major',
      text: 'An anticoagulant or a P2Y12 inhibitor with nothing to treat, minutes after the femoral sheath came out. There is no ACS and no stent — only mild non-obstructive disease — and it keeps the puncture oozing and raises the risk of a hematoma or a retroperitoneal bleed.',
    },
    {
      id: 'lytic-no-indication', actions: ['tnk'], roles: MD, points: 15, severity: 'critical',
      text: 'A fibrinolytic with no indication, minutes after a femoral artery puncture. Tenecteplase is for a STEMI when PCI cannot be done in time; here it can turn the groin into a major or retroperitoneal bleed.',
    },
  ],
  timings: [
    { label: 'Rate brought up', actions: ['atropine', 'pace'], flag: 'rate-up', target: 2, from: 'reaction' },
    { label: 'Pulse and pressure back', actions: [], flag: 'recovered', target: 4, from: 'reaction' },
  ],
  completeWhen: (s) => has(s, 'recovered') && has(s, 'hold-done'),
  teaching: [
    'A vasovagal reaction at femoral sheath removal is common — a few percent of manual pulls, up to one in ten in some series. Pain and pressure in the groin, anxiety, a long fast and nitrates set it off. It starts with yawning, nausea, sweating and pallor; then the pulse and the pressure fall together.',
    'Whoever holds the groin stays on it. The puncture bleeds the moment the pressure comes off — a hematoma, a pseudoaneurysm or a retroperitoneal bleed — and the hold starts again. Ease to the lightest pressure that keeps the site dry with the foot pulse still there (pressing the artery shut hurts, and pain feeds the reflex), call it out, and let a second person treat.',
    'Treat it at once: legs above the heart — with a fresh femoral puncture, tilt the bed head-down (Trendelenburg) so the hip stays straight — 250–500 mL of saline fast, and atropine IV: 1 mg in the 2025 AHA bradycardia algorithm, every 3–5 minutes to 3 mg; lab protocols often start with 0.5 mg, and less than 0.5 mg can slow the heart further. Most reactions are over within minutes.',
    'If atropine does not bring the rate up: transcutaneous pacing, or an epinephrine (2–10 mcg/min) or dopamine (5–20 mcg/kg/min) infusion — and think again about a bleed. Never the 1 mg arrest dose of epinephrine with a pulse; and push-dose epinephrine or a pressor before the legs, the fluid and the atropine skips the steps that work. A contrast reaction drops the pressure too, but with a fast pulse, flushing, hives or wheeze: IM epinephrine is for that, not for this.',
    'Before you call it vasovagal, look for a bleed: the groin (swelling, ooze, a firm lump), the thigh, the lower belly and the flank, and ask about back pain. A retroperitoneal bleed — most likely after a puncture above the inguinal ligament — can show little at the groin, and can set off a vagal reaction itself.',
    'The response is the test: a vagal reaction comes back with legs up, fluid and atropine. A pressure that does not come back, or comes back and falls again, a pulse that climbs, or new back or flank pain is a bleed until proven otherwise: fluid and blood, the anticoagulation reversed if any was given, the vascular team, and a CT of the abdomen and pelvis once he is stable enough to go. An early hemoglobin can still be normal.',
    'Prevention: radial access — or, from the groin, a closure device at the end of the study — avoids the manual pull. Before a femoral sheath comes out: IV access in, atropine and fluid at hand, a second person at the bedside, and analgesia — IV fentanyl and midazolam before the pull cut pain and vagal reactions in a randomized trial, while local lidocaine around the sheath alone gave more pain and, if anything, more reactions. Atropine 0.5 mg before the pull lowered reactions in one small trial. No nitroglycerin during the pull, and keep the fast no longer than needed.',
    'Protamine reverses heparin; with none on board it brings only its own risks — a falling pressure, a slow pulse, an anaphylactoid reaction.',
  ],
};
