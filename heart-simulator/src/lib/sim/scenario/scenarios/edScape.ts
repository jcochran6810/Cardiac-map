import type { Effect, Harm, Line, Scenario, SimState, Speaker } from '../types';
import { allOf, atRate, bpAfter, canSwallow, firstDone, has, line } from '../kit';
import { askCritical, askEvents, askHarm, type LabAsk } from '../labKit';
import { DOOR_TO_ECG, ED_MD, ED_RN, edNurse, edOrder, physicianDispo } from '../edKit';
import { RATE_RULES } from '../rules/rhythm';

/**
 * Hypertensive acute pulmonary edema ("sympathetic crashing acute pulmonary edema", SCAPE) arriving in the emergency
 * department on the EMS crew's CPAP. A 71-year-old man with a thick, stiff ventricle (an echo two years ago: it squeezes
 * normally) ran out of his blood pressure pills four days ago; at 4 am a surge of sympathetic tone slammed his pressure
 * up, the ventricle could not empty against it, and the pressure backed up into his lungs. He is not overloaded with
 * fluid: the fluid has moved, and taking the pressure off moves it back. The crew's CPAP and two standard 0.4 mg doses of
 * nitroglycerin have kept him alive, not turned him around: he is tiring.
 *
 * What turns him around in the department: positive pressure that never stops (the crew's CPAP swapped for the
 * department's BiPAP in one move) and nitroglycerin at a high dose — 0.8 mg under the tongue now, an infusion to follow.
 * Without them he tires, stops protecting his airway and needs a tube. The ER nurse keeps him upright on the mask, brings
 * the physician, gives the high dose on the order and watches the pressure and the mental status as the surge breaks;
 * the ER doctor makes those decisions and admits him to the ICU.
 *
 * The simulator has no separate action for the IV nitroglycerin infusion, BiPAP or a loop diuretic: the infusion follows
 * the high-dose decision (hung by the team once there is a line), the 'cpap' action is the department's non-invasive
 * ventilation (BiPAP here), and he needs no diuretic now (no extra fluid on board).
 */

/** Minutes after arrival: the crew warns that their portable cylinder is running out, then their CPAP has to come off */
const EMS_TANK_WARN = 3;
const EMS_TANK_EMPTY = 5;
/** The ED physician comes to the bedside uncalled at this minute (the nurse should have called at once) */
const MD_UNCALLED = 4;
/** Minutes from the first high dose until pharmacy's nitroglycerin infusion is running (it needs a line) */
const DRIP_DELAY = 2;
/** Minutes of the infusion, once he has turned the corner, before the surge breaks and the pressure falls too far */
const DROP_AFTER = 5;

/** Pressures rise as far as a hypertensive emergency can take them (bpAfter's default ceiling is for a normal pressure) */
const CEILING = { sbp: 250, dbp: 140 };
/** The nitrates the department offers (the patient's own spray is a field action) */
const NITRATES = ['nitro', 'nitro-high'];
/** Every way to see his pressure (a reassessment reads the monitor's last set) */
const BP_CHECKS = ['vitals', 'nibp', 'bp-both-arms', 'reassess'];

const nurseRun = (s: SimState) => s.role === 6;
const doctorRun = (s: SimState) => s.role === 7;
/** Positive pressure on his face: the crew's CPAP or the department's BiPAP */
const onNiv = (s: SimState) => has(s, 'on-niv');
/** The high dose has been given: by the learner, or by the physician who stepped in */
const highDose = (s: SimState) => has(s, 'nitro-high');
/** Someone is breathing for him: a bag-mask or a tube */
const bagged = (s: SimState) => has(s, 'ventilated');
const awake = (s: SimState) => s.pulse && s.vitals.gcs >= 13;
const says = (s: SimState, text: string, tone?: Line[2]): Line[] => (awake(s) ? [line('patient', text, tone)] : []);
/** Who speaks up at the bedside beside the learner: the respiratory therapist in the nurse's run, the computer nurse in the doctor's */
const bedside = (s: SimState): Speaker => (nurseRun(s) ? 'team' : 'nurse');
const rt = (s: SimState, text: string, tone?: Line[2]): Line => line('team', nurseRun(s) ? `Respiratory therapist: ${text}` : `Respiratory therapy: ${text}`, tone);

/**
 * A nitrate dose under the tongue, the mask lifted for one breath. Through the surge each dose takes 14 (0.4 mg) or 28
 * (0.8 mg) off the systolic as it opens the veins and the arteries; once the surge has broken ('better') the same dose drops
 * him far more — that is when nitrates given by habit cause hypotension. `who` gives it: the ER nurse (the learner), the computer
 * nurse on the ER doctor's order, or the physician who stepped in
 */
function nitrate(s: SimState, dose: 'standard' | 'high', who: Speaker): Effect | null {
  if (!s.pulse) return null;
  if (s.vitals.gcs <= 8) return { blocked: true, say: [['system', 'Not under the tongue: he is too drowsy to keep a tablet there safely, and his airway comes first.']] };
  const better = has(s, 'better');
  const bp = dose === 'high' ? bpAfter(s, better ? -34 : -28, better ? -18 : -12, CEILING) : bpAfter(s, better ? -22 : -14, better ? -12 : -8, CEILING);
  const easing = !better && onNiv(s);
  const spo2 = easing ? Math.min(96, s.vitals.spo2 + 2) : s.vitals.spo2;
  const rr = easing ? Math.max(20, s.vitals.rr - 2) : s.vitals.rr;
  const mask = onNiv(s) ? ', the mask lifted for one breath and straight back on' : '';
  const what = dose === 'high' ? `Nitroglycerin 0.8 mg — two tablets — under his tongue${mask}.` : `Nitroglycerin 0.4 mg under his tongue${mask}.`;
  const low = bp.sbp < 110;
  const lines: Line[] = [[who, who === 'nurse' ? `${what.slice(0, -1)}, doctor.` : what]];
  // the ER doctor's first high dose is the decision for high-dose nitrates: the infusion is ordered with it
  if (dose === 'high' && who === 'nurse' && !highDose(s)) {
    lines.push(['you', 'And a nitroglycerin infusion to follow as soon as there is a line: 100 micrograms a minute, titrated to keep his systolic between 120 and 160.']);
  }
  lines.push(line('monitor', `BP ${bp.sbp}/${bp.dbp}.`, low ? 'bad' : undefined), ...(low ? says(s, '"I feel… light-headed."', 'bad') : []));
  return { say: lines, vitals: { ...bp, spo2, rr }, flags: dose === 'high' ? ['nitro', 'nitro-high'] : ['nitro'] };
}

/** Off positive pressure: the flooded air sacs close again, and within a minute the saturation falls and the breathing climbs */
function offTheMask(s: SimState): { spo2: number; rr: number } {
  return { spo2: Math.max(70, s.vitals.spo2 - 8), rr: Math.min(44, s.vitals.rr + 4) };
}

/** The crew's CPAP or the department's BiPAP swapped for an oxygen mask — the trap at the hand-over */
function oxygenMask(kind: 'nrb' | 'nc') {
  return (s: SimState): Effect | null => {
    if (!s.pulse) return null;
    const mask = kind === 'nrb' ? 'a non-rebreather at 15 L/min' : 'a nasal cannula at 4 L/min';
    if (onNiv(s) && has(s, 'niv-since')) {
      // the department's machine: respiratory therapy puts it straight back on, after a dip
      const dip = Math.max(70, s.vitals.spo2 - 6);
      return {
        say: [
          ['you', `BiPAP mask off, ${mask} on.`],
          ['monitor', `SpO₂ ${dip}%.`, 'bad'],
          ...says(s, '"Can\'t… breathe…"', 'bad'),
          rt(s, '"He can\'t come off positive pressure — not for a minute. It\'s going straight back on."', 'warn'),
        ],
        vitals: { spo2: Math.max(70, s.vitals.spo2 - 2) }, flags: ['o2'],
      };
    }
    if (onNiv(s)) {
      // the crew's CPAP: once it is off, they take it with them
      const v = offTheMask(s);
      return {
        say: [['you', `The crew's CPAP mask off, ${mask} on.`], ['monitor', `SpO₂ ${v.spo2}%.`, 'bad'], ['ems', 'Okay — we\'ll take our CPAP back to the truck, then.'], ...says(s, '"Can\'t… breathe…"', 'bad')],
        vitals: v, flags: ['o2', 'off-niv'], clear: ['on-niv', 'ems-cpap'],
      };
    }
    // already off positive pressure: oxygen is something, but it is not what he needs
    const spo2 = Math.max(s.vitals.spo2, Math.min(kind === 'nrb' ? 84 : 82, s.vitals.spo2 + 3));
    const weak = s.vitals.gcs <= 8 ? [line('you', `— but he takes only ${s.vitals.rr} shallow breaths a minute: a mask cannot breathe for him.`, 'bad')] : [];
    return { say: [['monitor', `${kind === 'nrb' ? 'Non-rebreather' : 'Nasal cannula'} on. SpO₂ ${spo2}%.`], ...weak], vitals: { spo2 }, flags: ['o2'] };
  };
}

/** Drugs that weaken the squeeze or slow a heart whose speed is its answer to the work of breathing: he gets worse */
function negativeInotrope(what: string, flag: string) {
  return (s: SimState): Effect | null => {
    if (!s.pulse) return null;
    const hr = Math.max(90, s.rhythm.hr - 10);
    const bp = bpAfter(s, -10, -6);
    const spo2 = Math.max(70, s.vitals.spo2 - 4);
    return {
      say: [[edNurse(s), `${what} given.`], ['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}. SpO₂ ${spo2}%.`, 'bad'], [bedside(s), 'He is working harder to breathe — grayer and sweatier, not better.', 'bad']],
      rhythm: atRate(s, hr), vitals: { ...bp, spo2, rr: Math.min(44, s.vitals.rr + 2) }, flags: [flag],
    };
  };
}

/** Adrenergic drugs raise a pressure that is already far too high: more afterload, more fluid in the lungs */
function adrenergic(what: string, dSbp: number, dDbp: number, flag: string) {
  return (s: SimState): Effect | null => {
    if (!s.pulse) return null;
    const bp = bpAfter(s, dSbp, dDbp, CEILING);
    const hr = Math.min(150, s.rhythm.hr + 8);
    const spo2 = Math.max(70, s.vitals.spo2 - 3);
    return {
      say: [[edNurse(s), what], ['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}. SpO₂ ${spo2}%.`, 'bad'], ...says(s, '"My heart… pounding…"', 'bad')],
      rhythm: atRate(s, hr), vitals: { ...bp, spo2 }, flags: [flag],
    };
  };
}

/** A benzodiazepine: on the mask and awake, a small dose eases the panic of it; without the mask's support it blunts his breathing */
function sedative(s: SimState): Effect | null {
  if (!s.pulse) return null;
  const what = has(s, 'iv') ? 'Midazolam 1 mg IV.' : 'Midazolam 2.5 mg IM (no line yet).';
  if (onNiv(s) && awake(s) && s.vitals.sbp >= 90) {
    const bp = bpAfter(s, -6, -4);
    return {
      say: [[edNurse(s), what], [bedside(s), 'He relaxes into the mask and stops fighting it.'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`]],
      vitals: { ...bp, rr: Math.max(20, s.vitals.rr - 2) }, flags: ['benzodiazepine', 'sedation'],
    };
  }
  const gcs = Math.max(3, s.vitals.gcs - 3);
  const spo2 = Math.max(60, s.vitals.spo2 - 5);
  return {
    say: [[edNurse(s), what], [bedside(s), 'He is drowsier and his breaths are weaker.', 'bad'], ['monitor', `SpO₂ ${spo2}%.`, 'bad']],
    vitals: { gcs, spo2, etco2: Math.min(80, s.vitals.etco2 + 8) }, flags: ['benzodiazepine', 'sedation'],
  };
}

/** Back from the hypoxic arrest: a pulse, but he breathes only 6 times a minute and the bag goes on */
function rosc(s: SimState): Effect {
  return {
    say: [
      ['you', 'Pulse check after 2 minutes of compressions and breaths with oxygen: a carotid pulse — ROSC.', 'good'],
      [bedside(s), 'He breathes only 6 times a minute: keep bagging him, with the PEEP valve on.'],
    ],
    rhythm: { profile: 'hfpef', hr: 124 }, pulse: true, phase: 'rosc',
    vitals: { sbp: 150, dbp: 88, spo2: 86, rr: 10, etco2: 48, gcs: 4, pain: 0 },
    flags: ['cpr'],
  };
}

/** CPR cycles started since a flag was set (the cycle being started now is not counted yet) */
const cyclesSince = (s: SimState, flag: string) => s.performed.filter((p) => p.id === 'cpr' && p.minute >= s.flags[flag]).length;

/** The ER nurse's report to the ED physician (SBAR, closed loop): what changed, what was found, what is needed */
function report(s: SimState): Effect {
  const flags = ['physician-notified'];
  if (!has(s, 'md-here')) {
    const niv = has(s, 'niv-since')
      ? 'Good — he\'s on our BiPAP. Keep him sitting bolt upright: nothing comes off his face, not for the move, not for the film.'
      : 'Get him onto our BiPAP straight from their mask — no gap; respiratory therapy is here. Keep him sitting bolt upright.';
    return { say: [['physician', `I'm coming — a man tiring on the crew's CPAP is mine now. ${niv}`]], flags: [...flags, 'md-here'] };
  }
  if (!s.pulse) return { say: [['physician', 'Coming! Compressions and the bag — I\'ll take the airway.', 'warn']], flags };
  if (s.vitals.gcs <= 8 && !has(s, 'airway')) {
    return { say: [['physician', 'Coming — bag him with the PEEP valve; I\'m getting the tube and the drugs.', 'warn']], flags };
  }
  // drowsy with a rising CO₂ and not yet turned around: the mask and the nitrate now, and the airway ready
  if (has(s, 'tiring') && !has(s, 'better')) {
    const niv = onNiv(s) ? 'Keep him on the BiPAP' : 'Back on our BiPAP now';
    return {
      say: [['physician', `Drowsy — he's tiring and holding on to his CO₂. ${niv}, the high-dose nitroglycerin in if it isn't, and the bag with a PEEP valve and the airway cart at the bedside: if he stops protecting his airway, I'm intubating.`, 'warn']],
      flags,
    };
  }
  if (has(s, 'dropping') && !has(s, 'drip-down')) {
    return {
      say: [
        ['physician', `${s.vitals.sbp} over ${s.vitals.dbp} — thank you for telling me straight away. The surge has broken: turn the nitroglycerin down to 40 micrograms a minute and recheck in 5. No more under the tongue.`],
        ['you', 'Infusion turned down to 40 micrograms a minute on the pump; the next pressure set for 5 minutes.'],
      ],
      flags: [...flags, 'drop-reported', 'drip-down'],
    };
  }
  return {
    say: [['physician', has(s, 'better')
      ? 'Good. A pressure every 5 minutes on the infusion — tell me if his systolic goes under 120, or he gets drowsy.'
      : 'Thanks — keep the pressures coming, and tell me at once if he gets drowsy or his sat falls.']],
    flags,
  };
}

// The ED physician's order in the ER nurse's run: it sets `ordered:nitro-high`, so the nurse may give it

const NITRO_ORDER: LabAsk = edOrder({
  id: 'nitro-high',
  // breathing first: the physician orders the nitrate once he is on the department's machine (or after 2 minutes at the
  // bedside without it), so a nurse who called at once and is still swapping the mask is not timed from the doorway
  when: (s) => has(s, 'md-here') && s.pulse && s.vitals.gcs > 8 && !highDose(s) && (has(s, 'niv-since') || s.minute >= s.flags['md-here'] + 2),
  ask: 'His pressure is what is drowning him. Nitroglycerin 0.8 milligrams under his tongue now — two tablets, lift the mask for one breath and straight back on — with a pressure before it. Repeat it in 5 minutes if his systolic is still over 160; hold it under 120. And I\'m ordering a nitroglycerin infusion: 100 micrograms a minute through your line as soon as pharmacy sends it up, to keep his systolic between 120 and 160 — tell me at once if it goes under 120.',
  accept: ['nitro-high'],
  wrong: ['nitro'],
  wrongSay: 'That\'s 0.4 — I asked for 0.8: two tablets. The low dose barely touches a pressure like his.',
  thanks: 'Good. Tell me his pressure in a few minutes.',
  fallback: 'That nitroglycerin needs to be in now.',
  // the physician gives it if the nurse does not (and not under the tongue of a patient too drowsy to keep it there)
  fallbackEffect: (s) => {
    const dose = s.vitals.gcs > 8 ? nitrate(s, 'high', 'physician') : null;
    if (!dose) return { say: [['physician', 'He is too drowsy now for anything under his tongue — his airway comes first.', 'warn']] };
    return { ...dose, say: [['physician', 'I\'m giving the 0.8 myself.'], ...(dose.say ?? [])] };
  },
  gives: 'nitro-order-given', points: 15,
  label: 'High-dose nitroglycerin (0.8 mg sublingual) on the physician\'s order',
  why: 'Nitroglycerin at a high dose takes the pressure off a ventricle that cannot empty against it and lets the fluid move back out of the lungs: 0.8 mg under the tongue (or an IV bolus) at once, then an infusion at 100 micrograms a minute or more, titrated down as the pressure falls. The 0.4 mg the crew gave is a chest pain dose. High-dose nitroglycerin needs the physician\'s order: the ER nurse gives it, with a pressure before it and after.',
});

const RN_ORDERS = [NITRO_ORDER];

/** A role's version of a harm that the ER nurse also commits without an order: one mistake, one penalty for each */
function bothRoles(base: Harm, nurseText: string, rnReplaces: string[]): Harm[] {
  // the nurse's twin stands for the missing order too: at least the order's weight (5, major)
  const weight = base.points >= 5 ? { points: base.points, severity: base.severity } : { points: 5, severity: 'major' as const };
  return [
    { ...base, roles: ED_MD },
    { ...base, ...weight, id: `rn-${base.id}`, roles: ED_RN, text: `${base.text} ${nurseText}`, replaces: [...(base.replaces ?? []), ...rnReplaces] },
  ];
}
const NO_ORDER = 'And the ER nurse gives it only on the physician\'s order — this one was never ordered: tell the physician what you see and what you think he needs.';

export const edScape: Scenario = {
  id: 'scape-ed',
  title: 'Tiring on the crew\'s CPAP',
  // the picker must not name what he has: upright, on CPAP, a pressure over 200 and tiring is the clue
  summary: '71-year-old man wheeled into resus at 4:40 am on the EMS crew\'s CPAP: a pressure over 200, a sat of 88 % and tiring after 25 minutes of fighting for air. What keeps him off the ventilator — and what would put him on it?',
  setting: 'ed',
  roles: [6, 7],
  difficulty: 'intermediate',
  conditionId: 'hfpef',
  briefing: {
    default: [
      ['ems', 'Resus 2, 4:40 am. The crew wheels in a 71-year-old man sitting bolt upright on their stretcher under their CPAP mask: gray, drenched in sweat, every neck muscle working. "He\'s getting tired," the paramedic says.'],
      ['team', 'Respiratory therapy is on the way with the department\'s BiPAP. The ED physician is in the next bay with another patient.'],
      ['team', 'You are his nurse. Nothing has been given in the department yet.'],
    ],
    7: [
      ['ems', 'Resus 2, 4:40 am. The crew wheels in a 71-year-old man sitting bolt upright on their stretcher under their CPAP mask: gray, drenched in sweat, every neck muscle working. "He\'s getting tired," the paramedic says.'],
      ['nurse', 'Doctor, resus 2 — he came in on their CPAP. I\'m putting him on our monitor; respiratory therapy has the BiPAP outside the door.'],
      ['team', 'You are the ED physician. Nothing has been given in the department yet.'],
    ],
  },
  initial: {
    // a thick, pressure-loaded ventricle on the 12-lead (LVH with strain), going fast for the work of breathing
    rhythm: { profile: 'hfpef', hr: 122 },
    vitals: { sbp: 212, dbp: 118, spo2: 88, rr: 34, etco2: 50, pain: 0, gcs: 14, glucose: 186, temp: 36.7 },
  },
  // fluid on the lungs: the built-in rules charge a fluid bolus and raised legs. Not 'heart-failure': that problem means a
  // reduced ejection fraction, and his heart squeezes normally (a thick, stiff ventricle)
  problems: ['pulmonary-edema'],
  facts: {
    ems: 'EMS: "71-year-old man, woke at 4 unable to breathe. We found him tripoding on the edge of the bed: 224 over 124, heart rate 128, sat 78 % on room air, crackles all the way up both sides, pink froth. CPAP at 10 on scene, and nitroglycerin 0.4 under the tongue twice — the last one 8 minutes ago. No erectile-dysfunction or pulmonary-hypertension drugs: we asked before the nitro. One IV attempt in the truck, missed. He came up to 88 % on the CPAP, but he has been fighting it for 25 minutes and he\'s tiring. High blood pressure and diabetes; he ran out of his blood pressure pills four days ago. No chest pain. And our cylinder is down to about a quarter."',
    triage: 'ESI 1: on CPAP with a saturation of 88 % and breathing 34 a minute — he needs a life-saving intervention now: the resuscitation bay, positive pressure that never stops, and the physician at the bedside.',
    // the history is said as written even when he cannot talk (engine historyAnswer): once he is too drowsy, or in an
    // arrest, it comes from the crew's report and the chart instead of from him
    opqrst: (s) => (awake(s)
      ? 'A few words at a time through the mask: "Woke up… drowning… Worse lying flat. No… chest pain." He shakes his head when asked about pain anywhere.'
      : 'He cannot answer now. From the crew\'s report: he woke at 4 feeling he was drowning, worse lying flat, and denied any chest pain.'),
    sample: (s) => `${awake(s) ? 'Through the mask, a word at a time, and from the crew\'s paperwork' : 'He cannot answer now; from the crew\'s paperwork and the chart'}: no allergies. High blood pressure for 20 years — amlodipine, lisinopril and chlorthalidone, which ran out four days ago. Type 2 diabetes on metformin. Kidneys "a little weak": a creatinine of 1.4 in the chart. Never short of breath like this before; no heart attacks. An echo two years ago: thick heart muscle that squeezes normally. Weight steady, no leg swelling. Takeout pizza last night.`,
    pde5: (s) => (awake(s)
      ? 'He shakes his head: no Viagra, Cialis or anything like it — and nothing for the lungs\' blood pressure.'
      : 'He cannot answer now. The crew asked before their nitroglycerin: no erectile-dysfunction or pulmonary-hypertension drugs, and none on his medication list.'),
    lungs: (s) => {
      if (!s.pulse) return bagged(s) ? 'Wet crackles with each squeeze of the bag, equal on both sides.' : 'Nothing to hear: no breaths are going in.';
      if (s.vitals.gcs <= 8 && !bagged(s)) return 'Wet crackles everywhere, faint: he is barely moving air.';
      if (has(s, 'better')) return 'Crackles at both bases only now: the upper lobes have cleared.';
      if (has(s, 'fluid') || has(s, 'legs-up')) return 'Coarse crackles all the way to the top on both sides, louder than before; no wheeze.';
      return 'Coarse crackles from the bases to the apices on both sides; no wheeze; pink froth in the mask.';
    },
    // no extra fluid on board (the POCUS IVC agrees): the neck veins are not distended sitting up, the ankles are dry
    perfusion: (s) => {
      if (!s.pulse) return 'Gray, cool and mottled; no pulses.';
      if (has(s, 'better')) return 'Pinker, warmer and drier; neck veins not distended; radial pulses strong.';
      return 'Pale, cool and drenched in sweat; every neck muscle straining, the neck veins not distended sitting up; no ankle swelling; radial pulses strong and fast.';
    },
    neuro: (s) => {
      if (!s.pulse || s.vitals.gcs <= 8) return 'No response to voice; withdraws from pain only.';
      if (s.vitals.gcs <= 12) return 'Drowsy: opens his eyes to his name and nods off again; moves all four limbs.';
      if (s.vitals.gcs <= 14) return 'Awake but slow to answer, worn out; follows commands; no facial droop, no arm drift.';
      return 'Alert and oriented; follows commands; no facial droop, no arm drift.';
    },
    // what each 12-lead read is checked against (the tracing is the rhythm on the monitor)
    // what the 'hfpef' tracing draws: LVH voltage, inverted T waves in the left-sided leads (no ST shift of its own), a broad P
    ecg12: (s) => {
      const rate = s.rhythm.hr > 100 ? `Sinus tachycardia ${s.rhythm.hr}` : `Sinus rhythm ${s.rhythm.hr}`;
      return `${rate} with left ventricular hypertrophy by voltage, T-wave inversion in I, aVL, II, aVF, V5 and V6 (the repolarization, or "strain", pattern of a thick, pressure-loaded ventricle) and left atrial enlargement — no ST elevation and no new arrhythmia. The strain is a thick, pressure-loaded ventricle, not an occluded artery: no cath lab. The troponin, and a repeat, say whether ischemia is part of the story.`;
    },
    labs: 'Blood drawn and sent: high-sensitivity troponin, BNP, chemistry with creatinine and potassium, CBC, and a venous blood gas.',
    troponin: 'Repeat high-sensitivity troponin drawn: the result is about an hour away.',
    cxr: 'Portable chest film, sitting up: hazy shadows fanning out from both hila and Kerley B lines; no pleural effusion; heart size at the upper limit of normal; no pneumothorax, no focal consolidation; a normal mediastinum.',
    // the engine reads this fact in an arrest too (the 10-second pulse check), and the scan is repeatable: say what it shows now
    pocus: (s) => {
      if (!s.pulse) return 'Ultrasound during the 10-second pulse check: a thick-walled left ventricle with only weak, slow wall movement and no pulse with it; no pericardial effusion; the right ventricle is not dilated. Compressions resume.';
      const lungs = has(s, 'better') ? 'B-lines now only at both bases' : 'B-lines in every zone of both lungs';
      return `Bedside ultrasound: ${lungs}; a thick-walled left ventricle squeezing hard, with no regional wall-motion abnormality; no pericardial effusion; the right ventricle is not dilated; the IVC is 1.6 cm and still narrows with each breath despite the mask — no sign of a body overloaded with fluid; the aortic root is not dilated.`;
    },
    ct: 'Radiology: no pulmonary embolism and no dissection; dense fluid in both lungs.',
    consult: (s) => (has(s, 'better')
      ? 'Cardiology: "Sounds like a pressure surge on a stiff ventricle — and he has turned around on the BiPAP and the nitrate. Keep the infusion going and titrate it down as the pressure falls; a repeat troponin at 2 hours; an echo in the morning. No diuretic unless he turns out to be carrying extra fluid. We\'ll see him in the ICU."'
      : 'Cardiology: "Positive pressure and nitroglycerin at a high dose — 0.8 under the tongue, then an infusion at 100 and up. Don\'t wait on me for that. Call me back if his 12-lead or troponin points to an infarct, or if he doesn\'t turn around."'),
  },
  status: (s) => {
    if (!s.pulse) return 'Unresponsive, no pulse.';
    if (has(s, 'airway')) return 'Sedated on the ventilator.';
    if (s.vitals.gcs <= 8) {
      if (bagged(s)) return 'Unresponsive; the bag is breathing for him.';
      return s.vitals.rr <= 12 ? `No answer to his name; a shallow breath only ${s.vitals.rr} times a minute.` : `No answer to his name; shallow, rapid breaths, ${s.vitals.rr} a minute.`;
    }
    if (has(s, 'dropping') && !has(s, 'steady')) return '"I feel… a bit light-headed."';
    if (has(s, 'better')) return '"That\'s… a lot better. I can get my breath." He speaks in full sentences through the mask.';
    if (s.vitals.gcs <= 12) return 'Drowsy: his head keeps nodding forward; he answers only with a nod.';
    if (!onNiv(s)) return '"Can\'t… breathe…" — gasping, clawing at the oxygen mask.';
    return 'He nods: still fighting for every breath, a word at a time.';
  },
  respond: {
    // what the primary survey sees: the work of breathing, not just the numbers
    primary: (s) => {
      if (!s.pulse || s.vitals.gcs <= 8) return null;
      if (has(s, 'better')) return { say: [['you', `Airway open; breathing ${s.vitals.rr}/min, easier now on the mask; radial pulse ${s.rhythm.hr}/min; GCS ${s.vitals.gcs}.`]] };
      return { say: [['you', `Airway open but wet; breathing ${s.vitals.rr}/min, every neck muscle working, a word at a time; radial pulse ${s.rhythm.hr}/min, strong; GCS ${s.vitals.gcs}, worn out.`]] };
    },
    // the department's non-invasive ventilation: the crew's CPAP swapped for BiPAP in one move, the pressure never stopping
    cpap: (s) => {
      if (!s.pulse) return null;
      if (has(s, 'airway')) return { blocked: true, say: [['system', 'He is intubated and on the ventilator: no mask.']] };
      if (s.vitals.gcs <= 8) {
        return { say: [['you', `BiPAP mask on — but he no longer answers and takes ${s.vitals.rr} shallow breaths a minute: a mask supports breaths, it does not give them, and he cannot protect his airway.`, 'bad']], flags: ['cpap-failed'] };
      }
      const who = nurseRun(s) ? 'With respiratory therapy' : 'On your word, respiratory therapy';
      const how = has(s, 'ems-cpap') ? 'the crew\'s CPAP mask swapped for the department\'s in one move, the pressure never stopping' : 'back on positive pressure';
      const bp = bpAfter(s, -6, -4);
      const spo2 = Math.max(s.vitals.spo2, has(s, 'ems-cpap') ? 90 : 86);
      return {
        say: [
          ['you', `${who}: ${how} — BiPAP at 16 over 10 cmH₂O (the end-expiratory pressure no lower than the crew's CPAP of 10) with 100 % oxygen; he stays sitting bolt upright, legs down.`],
          ['monitor', `SpO₂ ${spo2}%. BP ${bp.sbp}/${bp.dbp}.`],
        ],
        vitals: { ...bp, spo2, rr: Math.min(s.vitals.rr, 32) }, flags: ['cpap', 'on-niv', 'niv-since', 'niv-own'], clear: ['ems-cpap', 'off-niv'],
      };
    },
    // the trap at the hand-over: an oxygen mask instead of positive pressure
    'o2-nrb': oxygenMask('nrb'),
    'o2-nc': oxygenMask('nc'),
    // once his own drive fails, breaths are given over his, with a PEEP valve to hold the flooded air sacs open
    bvm: (s) => {
      if (!s.pulse || s.vitals.gcs > 8) return null;
      if (bagged(s)) return { say: [['you', 'Still bagging: 1 breath every 6 seconds with the PEEP valve on.']] };
      const spo2 = Math.max(s.vitals.spo2, 86);
      return {
        say: [['you', 'Bag-mask with oxygen and a PEEP valve, 1 breath every 6 seconds timed with his; froth suctioned from his mouth; the chest rises.'], ['monitor', `SpO₂ ${spo2}%.`]],
        vitals: { spo2, etco2: Math.min(s.vitals.etco2, 62), rr: 10 }, flags: ['ventilated'], clear: ['on-niv', 'ems-cpap'],
      };
    },
    // the physician's drug-assisted airway: the induction drug takes the sympathetic drive away, and the pressure falls
    rsi: (s) => {
      if (!s.pulse) return null;
      const bp = bpAfter(s, -40, -22);
      const spo2 = Math.max(s.vitals.spo2, 94);
      const preox = bagged(s) ? 'Preoxygenated with the bag and the PEEP valve' : has(s, 'niv-since') && onNiv(s) ? 'Preoxygenated on the BiPAP'
        : onNiv(s) ? 'Preoxygenated on the crew\'s CPAP' : 'Preoxygenated as well as a non-rebreather allows';
      return {
        say: [
          ['you', `${preox}; a reduced dose of the induction drug and the paralytic; tube through the cords on the first pass, confirmed with waveform capnography; pink froth suctioned from it; on the ventilator with a PEEP of 10.`],
          ['monitor', `SpO₂ ${spo2}%. BP ${bp.sbp}/${bp.dbp}.`],
        ],
        vitals: { ...bp, spo2, rr: 16, gcs: 3, etco2: Math.min(s.vitals.etco2, 46) }, flags: ['airway', 'ventilated', 'sedation', 'rsi'], clear: ['on-niv', 'ems-cpap'],
      };
    },
    airway: (s) => {
      // awake (the engine: he gags and pushes it away) or in arrest (placed): the default says it
      if (!s.pulse || s.vitals.gcs > 8) return null;
      const spo2 = Math.max(s.vitals.spo2, 88);
      return {
        say: [['you', 'Tube placed and confirmed with waveform capnography; pink froth suctioned from it. Ventilating with a PEEP valve, 1 breath every 6 seconds.'], ['monitor', `SpO₂ ${spo2}%.`]],
        vitals: { spo2, etco2: Math.min(s.vitals.etco2, 60), rr: 10 }, flags: ['airway', 'ventilated', 'capno'], clear: ['on-niv', 'ems-cpap'],
      };
    },
    // he arrested for want of oxygen: compressions alone carry none to the heart — with breaths, two cycles bring him back
    cpr: (s) => {
      if (s.pulse || !bagged(s)) return null;
      if (cyclesSince(s, 'ventilated') + 1 >= 2) return rosc(s);
      return { say: [['you', 'Two minutes of compressions with 2 breaths of oxygen after every 30.']], flags: ['cpr'] };
    },
    // the nitrates: the ER nurse gives them in person; in the ER doctor's run the computer nurse gives them on the doctor's order
    nitro: (s) => nitrate(s, 'standard', edNurse(s)),
    'nitro-high': (s) => nitrate(s, 'high', edNurse(s)),
    // the traps: more volume, laid flat, an opioid, a negative inotrope, a pressor
    fluid: (s) => {
      if (!s.pulse) return null;
      const bp = bpAfter(s, 4, 2, CEILING);
      const spo2 = Math.max(70, s.vitals.spo2 - 4);
      return {
        say: [['monitor', `Bolus in. BP ${bp.sbp}/${bp.dbp}. SpO₂ ${spo2}%.`, 'bad'], [bedside(s), 'More froth in the mask — and the crackles are louder.', 'bad']],
        vitals: { ...bp, spo2, rr: Math.min(44, s.vitals.rr + 2) }, flags: ['fluid'],
      };
    },
    'legs-up': (s) => {
      if (!s.pulse) return null;
      const spo2 = Math.max(70, s.vitals.spo2 - 6);
      return {
        say: [
          ['you', 'Laid back flat with his legs raised.'],
          ['monitor', `SpO₂ ${spo2}%.`, 'bad'],
          awake(s)
            ? line('patient', 'He thrashes and claws his way back up to sitting: "Can\'t… lie… down…"', 'bad')
            : line(bedside(s), 'Flat on his back he is drowning — froth bubbling into the mask. Sit him back up!', 'bad'),
        ],
        vitals: { spo2, rr: Math.min(44, s.vitals.rr + 4) }, flags: ['legs-up'],
      };
    },
    fentanyl: (s) => {
      if (!s.pulse) return null;
      const spo2 = onNiv(s) ? s.vitals.spo2 : Math.max(70, s.vitals.spo2 - 4);
      const bp = bpAfter(s, -6, -4);
      return {
        say: [[edNurse(s), 'Fentanyl 50 mcg IV — he has no pain to treat.'], [bedside(s), 'He is drowsier, and his breaths are shallower: less air is going in.', 'bad'], ['monitor', `SpO₂ ${spo2}%. BP ${bp.sbp}/${bp.dbp}.`]],
        vitals: { ...bp, spo2, gcs: Math.max(3, s.vitals.gcs - 2), etco2: Math.min(80, s.vitals.etco2 + 8) }, flags: ['opioid'],
      };
    },
    midazolam: sedative,
    // a procedural (deep) sedation dose on a tiring man: the mask only supports breaths he takes himself, and now he stops
    // protecting his airway — he has failed, and needs breaths given and a tube. On the ventilator it is ordinary sedation
    'procedural-sedation': (s) => {
      if (!s.pulse) return null;
      if (has(s, 'airway')) {
        const sedated = bpAfter(s, -10, -6);
        return { say: [['you', 'Propofol started for sedation on the ventilator, a low dose titrated to his pressure.'], ['monitor', `BP ${sedated.sbp}/${sedated.dbp}.`]], vitals: sedated, flags: ['sedation', 'procedural-sedation'] };
      }
      const bp = bpAfter(s, -20, -12);
      const spo2 = Math.max(60, Math.min(s.vitals.spo2, 84) - 4);
      return {
        say: [
          ['you', 'Etomidate IV: his eyes close and he stops answering.'],
          [bedside(s), 'His breaths are shallow and slow — the mask is only pushing air at a man who has stopped breathing for himself!', 'bad'],
          ['monitor', `SpO₂ ${spo2}%. BP ${bp.sbp}/${bp.dbp}.`, 'bad'],
        ],
        // 'failing' runs the story on (no breaths given: his heart slows, then stops); 'sedated-apnea' keeps the tube that
        // rescues him from counting as the doctor's credit for an airway that failed by itself
        vitals: { ...bp, spo2, gcs: 6, rr: 8, etco2: Math.max(s.vitals.etco2, 70) }, flags: ['sedation', 'procedural-sedation', 'failing', 'sedated-apnea'],
      };
    },
    metoprolol: negativeInotrope('Metoprolol 5 mg IV', 'beta-blocker'),
    diltiazem: negativeInotrope('Diltiazem IV', 'diltiazem'),
    'push-epi': adrenergic('Push-dose epinephrine 10 mcg IV.', 16, 10, 'push-epi'),
    pressor: adrenergic('Vasopressor infusion running.', 22, 14, 'pressor'),
    'epi-im': adrenergic('Epinephrine 0.5 mg IM, lateral thigh.', 10, 6, 'epi-im'),
    // no wheeze for it to open: the noise in his chest is fluid
    albuterol: (s) => {
      if (!s.pulse) return null;
      const hr = Math.min(150, s.rhythm.hr + 8);
      return { say: [[edNurse(s), 'Albuterol nebulized through the mask circuit.'], ['monitor', `Heart rate ${hr}.`], ...says(s, '"Shaky… still… can\'t breathe…"')], rhythm: atRate(s, hr), flags: ['albuterol'] };
    },
    // he has no chest pain, but aspirin hurts no one here; by mouth only while he can chew and swallow
    aspirin: (s) => {
      if (!s.pulse || !canSwallow(s) || !onNiv(s)) return null;
      return { say: [['patient', 'The mask comes off for a moment while he chews the aspirin; his saturation dips, then comes back as it goes on again.']], flags: ['aspirin'] };
    },
    'notify-physician': report,
    admit: (s) => {
      if (!s.pulse) return null;
      return {
        say: [['hospital', has(s, 'airway')
          ? 'Admission accepted: the ICU takes him on the ventilator; a bed is being readied.'
          : 'Admission accepted: the ICU takes him on the BiPAP and the nitroglycerin infusion, with respiratory therapy for the trip; a bed is being readied.']],
        flags: ['dispo', 'admit'],
      };
    },
  },
  events: [
    // ─── arrival: on the crew's CPAP, with their two standard doses of nitroglycerin on board ───
    { id: 'arrival', when: () => true, effect: () => ({ flags: ['on-niv', 'ems-cpap'] }) },
    {
      // the ER doctor's run: the computer nurse has him on the department's monitor
      id: 'md-on-monitor', when: doctorRun,
      effect: (s) => ({ say: [['nurse', `On our monitor: BP ${s.vitals.sbp}/${s.vitals.dbp}, heart rate ${s.rhythm.hr}, sat ${s.vitals.spo2} % on their CPAP, breathing ${s.vitals.rr}.`]], flags: ['monitor', 'bp'] }),
    },

    // ─── the crew's portable cylinder runs out: delay in switching takes the pressure off his face ───
    {
      id: 'ems-tank', when: (s) => has(s, 'ems-cpap') && !bagged(s) && s.minute >= EMS_TANK_WARN,
      effect: () => ({ say: [['ems', 'Our cylinder is nearly empty — we need to switch him onto your machine now.', 'warn']] }),
    },
    {
      id: 'md-nurse-niv', when: (s) => doctorRun(s) && s.pulse && !has(s, 'niv-since') && s.vitals.gcs > 8 && s.minute >= EMS_TANK_WARN + 1,
      effect: () => ({ say: [['nurse', 'Doctor — their cylinder is almost out. Respiratory therapy has our BiPAP ready: do you want him on it?', 'warn']] }),
    },
    {
      id: 'ems-off', when: (s) => has(s, 'ems-cpap') && !bagged(s) && s.pulse && s.minute >= EMS_TANK_EMPTY,
      effect: (s) => {
        const v = offTheMask(s);
        return {
          say: [['ems', 'That\'s it — the cylinder is empty: our CPAP has to come off.', 'bad'], [bedside(s), 'A non-rebreather goes on him in the meantime.'], ['monitor', `SpO₂ ${v.spo2}%.`, 'bad']],
          vitals: v, flags: ['o2', 'off-niv'], clear: ['on-niv', 'ems-cpap'],
        };
      },
    },

    // ─── the ER nurse's run: the computer ED physician ───
    {
      // nobody called: the physician comes anyway, a few minutes late
      id: 'md-uncalled', when: (s) => nurseRun(s) && !has(s, 'md-here') && s.minute >= MD_UNCALLED,
      effect: () => ({
        say: [['physician', 'I heard the crew bring someone in on CPAP — I should have been called the moment he came through the door. Keep him sitting bolt upright, and nothing comes off his face.', 'warn']],
        flags: ['md-here'],
      }),
    },
    ...RN_ORDERS.flatMap(askEvents),
    {
      // the nurse never got him onto the department's machine: respiratory therapy does, on the physician's word
      id: 'rn-niv-fallback', when: (s) => nurseRun(s) && has(s, 'md-here') && s.pulse && !has(s, 'niv-since') && !has(s, 'airway') && s.vitals.gcs > 8 && s.minute >= s.flags['md-here'] + 3,
      effect: (s) => ({
        say: [['physician', 'He is still not on our BiPAP? Respiratory therapy — put him on it now, straight from that mask.', 'warn'], rt(s, 'BiPAP at 16 over 10 with 100 % oxygen.')],
        vitals: { spo2: Math.max(s.vitals.spo2, 86) }, flags: ['cpap', 'on-niv', 'niv-since'], clear: ['ems-cpap', 'off-niv'],
      }),
    },

    // ─── the ER doctor's run: the computer nurse ───
    {
      // the nurse's 12-lead is a recorded tracing: the engine asks the doctor to read it (no read of its own here)
      id: 'md-nurse-ecg', when: (s) => doctorRun(s) && s.pulse && !has(s, 'ecg12') && s.minute >= 3,
      effect: () => ({ say: [['nurse', 'Doctor — his 12-lead, recorded sitting up with the mask on.']], flags: ['ecg12'] }),
    },
    {
      // a line the doctor already placed is not placed twice
      id: 'md-nurse-iv', when: (s) => doctorRun(s) && s.pulse && s.minute >= 4,
      effect: (s) => ({
        say: [['nurse', `${has(s, 'iv') ? 'Blood is off' : 'An 18-gauge in his right forearm, and blood is off'}: troponin, BNP, chemistry, CBC and a venous gas.`]],
        flags: ['iv', 'labs'],
      }),
    },

    // ─── positive pressure and the high dose working ───
    {
      // the department's machine alone: the air sacs open and the work of breathing eases (the pressure, the nitrates' job, stays up)
      id: 'niv-working', when: (s) => s.pulse && onNiv(s) && has(s, 'niv-since') && s.vitals.gcs > 8 && !has(s, 'better') && s.minute >= s.flags['niv-since'] + 2,
      effect: (s) => {
        const v = { spo2: Math.max(s.vitals.spo2, 92), rr: Math.min(s.vitals.rr, 30), etco2: Math.min(s.vitals.etco2, 46), gcs: Math.max(s.vitals.gcs, 14) };
        return { say: [['monitor', `SpO₂ ${v.spo2}%.`, 'good'], ...says({ ...s, vitals: { ...s.vitals, ...v } }, 'He nods: "A little… easier."')], vitals: v };
      },
    },
    {
      // the infusion the physician ordered with the high dose: it needs a line (and, in the nurse's run, the physician's order)
      id: 'drip-on',
      when: (s) => s.pulse && highDose(s) && has(s, 'iv') && !has(s, 'airway') && (doctorRun(s) || has(s, 'md-here')) && s.minute >= s.flags['nitro-high'] + DRIP_DELAY,
      effect: (s) => {
        const bp = bpAfter(s, -10, -6);
        return {
          say: [
            nurseRun(s)
              ? ['team', 'The charge nurse brings the nitroglycerin infusion from pharmacy and hangs it with you on the pump: 100 micrograms a minute through your line.']
              : ['nurse', 'Nitroglycerin infusion running at 100 micrograms a minute, doctor, as you ordered.'],
            ['monitor', `BP ${bp.sbp}/${bp.dbp}.`],
          ],
          vitals: bp, flags: ['drip'],
        };
      },
    },
    {
      // positive pressure plus the high dose: the pressure comes off and the fluid moves back out of his lungs within minutes
      id: 'better',
      when: (s) => s.pulse && onNiv(s) && has(s, 'niv-since') && highDose(s) && s.vitals.gcs > 8 && !has(s, 'airway')
        && s.minute >= s.flags['niv-since'] + 3 && s.minute >= s.flags['nitro-high'] + 2,
      effect: (s) => {
        const hr = Math.min(s.rhythm.hr, 98);
        const sbp = Math.min(s.vitals.sbp, 156);
        const dbp = Math.min(s.vitals.dbp, 90);
        return {
          say: [
            nurseRun(s)
              ? rt(s, '"His breaths are deeper and slower — he is working far less on the machine."', 'good')
              : ['nurse', 'He\'s pinker, doctor — and talking to me in full sentences through the mask.', 'good'],
            ['monitor', `SpO₂ 96%. Heart rate ${hr}. BP ${sbp}/${dbp}.`, 'good'],
            ['patient', '"Oh… that\'s better. I can get my breath."', 'good'],
          ],
          rhythm: atRate(s, hr), vitals: { spo2: 96, rr: 22, etco2: 40, gcs: 15, sbp, dbp }, flags: ['better'],
        };
      },
    },
    // ─── the surge breaks: the infusion that was right a few minutes ago now drops him too far ───
    {
      id: 'dropping', when: (s) => s.pulse && has(s, 'drip') && has(s, 'better') && s.minute >= Math.max(s.flags.drip, s.flags.better) + DROP_AFTER,
      effect: (s) => {
        const sbp = Math.min(s.vitals.sbp, 112);
        const dbp = Math.min(s.vitals.dbp, 68);
        const lines: Line[] = [['monitor', `NIBP ${sbp}/${dbp}.`, 'warn'], ...says(s, '"I feel… a bit light-headed."', 'warn')];
        // the ER doctor's run: the computer nurse titrates to the target the doctor gave, and says so
        if (doctorRun(s)) lines.push(['nurse', `His systolic is ${sbp} and he says he's light-headed — I've turned the nitroglycerin down to 40 micrograms a minute, to keep him over 120 as you ordered.`]);
        return { say: lines, vitals: { sbp, dbp }, flags: doctorRun(s) ? ['dropping', 'drip-down'] : ['dropping'] };
      },
    },
    {
      // nobody told the physician: the pressure keeps falling
      id: 'still-dropping', when: (s) => s.pulse && has(s, 'dropping') && !has(s, 'drip-down') && s.minute >= s.flags.dropping + 2,
      effect: (s) => {
        const sbp = Math.min(s.vitals.sbp, 98);
        const dbp = Math.min(s.vitals.dbp, 60);
        return { say: [['monitor', `NIBP ${sbp}/${dbp}.`, 'bad'], ...says(s, '"Everything is… swimming."', 'bad')], vitals: { sbp, dbp, gcs: Math.min(s.vitals.gcs, 14) } };
      },
    },
    {
      // the physician sees it on the central monitor
      id: 'md-sees-drop', when: (s) => nurseRun(s) && s.pulse && has(s, 'dropping') && !has(s, 'drip-down') && s.minute >= s.flags.dropping + 4,
      effect: (s) => ({
        say: [['physician', `His systolic is ${s.vitals.sbp} on the central monitor, and nobody told me. I've turned the nitroglycerin down to 40. Any pressure under 120 on that infusion, I need to hear about it at once.`, 'bad']],
        flags: ['drip-down', 'md-turned-down'],
      }),
    },
    {
      id: 'steady', when: (s) => s.pulse && has(s, 'drip-down') && s.minute >= s.flags['drip-down'] + 2,
      effect: (s) => {
        const bp = { sbp: Math.max(s.vitals.sbp, 128), dbp: Math.max(s.vitals.dbp, 76) };
        return { say: [['monitor', `NIBP ${bp.sbp}/${bp.dbp}.`, 'good'], ...says(s, '"The dizziness has gone."')], vitals: { ...bp, gcs: s.vitals.gcs >= 13 ? 15 : s.vitals.gcs }, flags: ['steady'] };
      },
    },

    // ─── without positive pressure, or without the high dose, he tires ───
    {
      id: 'tiring',
      when: (s) => s.pulse && !has(s, 'better') && !bagged(s) && s.vitals.gcs > 8
        && ((has(s, 'off-niv') && s.minute >= s.flags['off-niv'] + 3) || (onNiv(s) && !highDose(s) && s.minute >= 12)),
      effect: (s) => {
        const v = { gcs: Math.min(s.vitals.gcs, 11), spo2: Math.min(s.vitals.spo2, 82), rr: Math.max(s.vitals.rr, 36), etco2: Math.max(s.vitals.etco2, 60) };
        return {
          say: [[bedside(s), 'He is tiring: his head keeps nodding forward, he answers only with a nod, and his lips are going blue.', 'bad'], ['monitor', `SpO₂ ${v.spo2}%.`, 'bad']],
          vitals: v, flags: ['tiring'],
        };
      },
    },
    {
      // the CO₂ he can no longer breathe off puts him to sleep: he stops protecting his airway, and the mask is no longer safe
      id: 'failing',
      when: (s) => s.pulse && has(s, 'tiring') && !has(s, 'better') && !bagged(s) && !(onNiv(s) && highDose(s)) && s.minute >= s.flags.tiring + 4,
      effect: (s) => {
        const v = { gcs: Math.min(s.vitals.gcs, 7), rr: 8, spo2: Math.min(s.vitals.spo2, 74), etco2: Math.max(s.vitals.etco2, 78) };
        return {
          say: [[bedside(s), 'He has slumped sideways: he doesn\'t answer, and he takes a shallow breath only every 7 or 8 seconds!', 'bad'], ['monitor', `SpO₂ ${v.spo2}%.`, 'bad']],
          vitals: v, flags: ['failing'],
        };
      },
    },
    {
      // the ER nurse's run: the physician intubates (the nurse's part is the bag until then)
      id: 'md-intubates', when: (s) => nurseRun(s) && s.pulse && has(s, 'failing') && has(s, 'md-here') && !has(s, 'airway') && s.minute >= s.flags.failing + 2,
      effect: (s) => {
        const bp = bpAfter(s, -40, -22);
        const spo2 = Math.max(s.vitals.spo2, 92);
        return {
          say: [['physician', 'He is not protecting his airway — I\'m intubating. Induction drug and paralytic, suction, the PEEP valve.', 'warn'], ['monitor', `SpO₂ ${spo2}%. BP ${bp.sbp}/${bp.dbp}.`]],
          vitals: { ...bp, spo2, rr: 16, gcs: 3, etco2: Math.min(s.vitals.etco2, 46) }, flags: ['airway', 'ventilated', 'md-rsi'], clear: ['on-niv', 'ems-cpap'],
        };
      },
    },
    {
      // breaths given: the oxygen comes up and the CO₂ comes down (he stays unresponsive for now)
      id: 'bagging-works', when: (s) => s.pulse && has(s, 'failing') && bagged(s) && s.minute >= s.flags.ventilated + 3,
      effect: (s) => {
        const spo2 = Math.max(s.vitals.spo2, 92);
        const etco2 = Math.min(s.vitals.etco2, 46);
        return {
          say: [[bedside(s), 'His color is coming back with the breaths.', 'good'], ['monitor', `SpO₂ ${spo2}%. EtCO₂ ${etco2} mmHg.`, 'good']],
          ...(s.rhythm.hr < 60 ? { rhythm: atRate(s, 112), vitals: { spo2, etco2, sbp: Math.max(s.vitals.sbp, 168), dbp: Math.max(s.vitals.dbp, 96) } } : { vitals: { spo2, etco2 } }),
        };
      },
    },
    {
      // nobody breathes for him: the heart slows for want of oxygen
      id: 'slowing', when: (s) => s.pulse && has(s, 'failing') && !bagged(s) && s.minute >= s.flags.failing + 3,
      effect: (s) => ({
        say: [['monitor', 'Monitor alarm. Heart rate 46.', 'bad'], [bedside(s), 'He\'s gone gray — and his pulse is slowing down!', 'bad']],
        rhythm: atRate(s, 46), vitals: { sbp: Math.min(s.vitals.sbp, 104), dbp: Math.min(s.vitals.dbp, 62), spo2: Math.min(s.vitals.spo2, 60) },
        flags: ['slowing'],
      }),
    },
    {
      id: 'arrest', when: (s) => s.pulse && has(s, 'slowing') && !bagged(s) && s.minute >= s.flags.slowing + 3,
      effect: (s) => ({
        say: [['monitor', 'Monitor alarm.', 'bad'], [bedside(s), 'He has gone limp — no pulse!', 'bad']],
        // no EtCO₂ of its own: the number left from before the arrest gives way to the shared arrest rule on the case
        // monitor, the same one the capnography line reads (kit's arrestEtco2)
        rhythm: { profile: 'pea', hr: 36 }, pulse: false, phase: 'arrest',
        vitals: { sbp: 0, dbp: 0, rr: 0, spo2: 50, gcs: 3 },
      }),
    },

    // ─── the lab ───
    {
      id: 'gas-back', when: (s) => has(s, 'labs') && s.minute >= s.flags.labs + 1,
      effect: (s) => ({
        say: [['hospital', has(s, 'better')
          ? 'Lab: venous gas pH 7.33, pCO₂ 46, lactate 2.4.'
          : 'Lab: venous gas pH 7.27, pCO₂ 58, lactate 3.1.']],
      }),
    },
    {
      // a little above the limit, as a strained, racing heart in a hypertensive emergency often shows: the repeat decides
      id: 'troponin-back', when: (s) => has(s, 'labs') && s.minute >= s.flags.labs + 6,
      effect: () => ({ say: [['hospital', 'Lab: high-sensitivity troponin 34 ng/L (upper reference limit 22) — a repeat at 1 to 2 hours will show whether it is moving. BNP 640 pg/mL.']] }),
    },

    // ─── the ER nurse's run: the physician decides where he goes, once he has turned the corner (or is on a ventilator) ───
    {
      id: 'md-dispo',
      when: (s) => nurseRun(s) && s.pulse && !has(s, 'dispo')
        && ((has(s, 'better') && (has(s, 'steady') || (!has(s, 'drip') && s.minute >= s.flags.better + 6))) || (has(s, 'airway') && s.minute >= s.flags.airway + 3)),
      effect: (s) => physicianDispo(s, 'admit', has(s, 'airway')
        ? 'The ICU has accepted him on the ventilator. Give report to the ICU nurse when they are ready for him.'
        : 'The ICU has accepted him: he goes up on the BiPAP and the nitroglycerin infusion, with respiratory therapy for the trip. A repeat troponin at 2 hours; no diuretic for now — his weight and his legs say he is not carrying extra fluid. Give report to the ICU nurse when they are ready for him.'),
    },
  ],
  critical: [
    // first, so that a hint in the crisis names what he needs now
    {
      id: 'arrest-cpr', label: 'No pulse: CPR at once, with breaths', points: 10, applies: (s) => has(s, 'arrest'),
      why: 'His heart stopped for want of oxygen: compressions within a minute, and breaths with oxygen — compressions alone carry no oxygen to a heart that stopped from hypoxia.',
      done: ['cpr'], after: 'arrest', target: { within: { flag: 'arrest', minutes: 1 } },
    },
    {
      // a non-shockable arrest: epinephrine as soon as feasible (2025 AHA). The ER nurse gives it on the ACLS protocol, no order needed
      id: 'arrest-epi', label: 'No pulse: epinephrine 1 mg IV as soon as possible', points: 5, applies: (s) => has(s, 'arrest'),
      why: 'In a non-shockable arrest, epinephrine 1 mg IV/IO goes in as soon as it can (2025 AHA), then every 3–5 minutes — alongside the breaths that fix the cause here, oxygen.',
      done: ['epinephrine'], after: 'arrest', target: { within: { flag: 'arrest', minutes: 5 } },
    },

    // ─── the ER nurse ───
    {
      id: 'rn-bag', label: 'He stopped protecting his airway: bag-mask breaths with a PEEP valve until the tube', roles: ED_RN, points: 15, applies: (s) => has(s, 'failing'),
      why: 'Unresponsive with a shallow breath every 8 seconds, he can no longer use a mask that only supports his own breaths: give them — a bag-mask with oxygen and a PEEP valve, 1 breath every 6 seconds — while the physician intubates.',
      done: ['bvm'], after: 'failing', target: { within: { flag: 'failing', minutes: 2 } },
    },
    {
      id: 'rn-ems', label: 'Take the EMS hand-off at the bedside', roles: ED_RN, points: 5, target: { by: 2 }, done: ['ems-handoff'],
      why: 'The crew\'s report holds what you cannot see: a pressure of 224/124 and a sat of 78 % on room air, CPAP at 10, two doses of 0.4 mg nitroglycerin (the last 8 minutes ago), no PDE-5 inhibitor, a missed IV, 25 minutes of fighting the mask — and an oxygen cylinder about to run out.',
    },
    {
      id: 'rn-niv', label: 'Keep him on positive pressure: onto the department\'s BiPAP straight from the crew\'s mask, sitting upright', roles: ED_RN, points: 20, target: { by: 3 },
      why: 'Positive pressure holds the flooded air sacs open, takes over much of the work of breathing and lowers the load on the heart: in cardiogenic pulmonary edema it lowers the need for intubation and the mortality (Cochrane 2019). With respiratory therapy, under the department\'s respiratory protocol, swap the crew\'s CPAP for the department\'s machine in one move — never a non-rebreather "for the transfer" — and keep him sitting bolt upright with his legs down; the settings are respiratory therapy\'s and the physician\'s.',
      // his own move onto the department's machine while he can still protect his airway: an attempt on a patient who no longer can does not count
      done: (s) => (has(s, 'niv-own') ? s.performed.find((p) => p.id === 'cpap')?.minute ?? null : null),
      uses: ['cpap'],
    },
    {
      id: 'rn-call', label: 'Bring the ED physician to the bedside now', roles: ED_RN, points: 10, target: { by: 3 }, done: ['notify-physician'],
      why: 'A patient on CPAP with a saturation of 88 % who is tiring is ESI 1: he needs the physician at the bedside now — for the high-dose nitroglycerin, which needs an order, and for the airway if the mask fails.',
    },
    {
      id: 'rn-monitor', label: 'The department\'s monitor on, and a blood pressure', roles: ED_RN, points: 5, target: { by: 5 },
      why: 'The pressure decides the nitroglycerin dose and when to hold it; the saturation and the heart rate show whether the mask is working.',
      done: (s) => allOf(firstDone(s, ['monitor', 'pads']), firstDone(s, ['nibp', 'vitals', 'bp-both-arms'])), uses: ['monitor', 'nibp', 'vitals'],
    },
    askCritical(NITRO_ORDER),
    {
      id: 'rn-bp-recheck', label: 'A blood pressure within 5 minutes of the nitroglycerin', roles: ED_RN, points: 5, applies: (s) => has(s, 'nitro'),
      why: 'At a high dose nitroglycerin drops the pressure within minutes — and once the surge breaks it can drop it too far: a pressure after every dose, and every 5 minutes on the infusion.',
      done: (s) => s.performed.find((p) => BP_CHECKS.includes(p.id) && p.minute >= s.flags.nitro)?.minute ?? null,
      uses: BP_CHECKS, target: { within: { flag: 'nitro', minutes: 5 } },
    },
    {
      id: 'rn-iv', label: 'IV access', roles: ED_RN, points: 5, target: { by: 8 }, done: ['iv', 'io'],
      why: 'For the nitroglycerin infusion, the blood tests and the drugs he may need if the mask fails. It treats nothing by itself: the mask and the sublingual dose come first.',
    },
    {
      id: 'rn-ecg', label: '12-lead within 10 minutes of arrival — with the mask on', roles: ED_RN, points: 10, target: { by: 10 }, done: ['ecg12'],
      why: 'A STEMI or a new arrhythmia can set off pulmonary edema, and either changes the treatment: record it within 10 minutes, sitting up, without taking the mask off. His shows a thick, strained ventricle and no ST elevation.',
    },
    {
      id: 'rn-labs', label: 'Blood for the lab: troponin, BNP, chemistry, a blood gas', roles: ED_RN, points: 5, done: ['labs'],
      why: 'A troponin (and its repeat) looks for an infarct behind it; the kidneys and potassium matter for the drugs; the gas shows whether he is retaining CO₂ — the sign he is tiring.',
    },
    {
      id: 'rn-mental', label: 'Watch his mental status on the mask (GCS)', roles: ED_RN, points: 5, target: { by: 12 }, done: ['neuro', 'reassess'],
      why: 'Drowsiness is the first sign the mask is failing (a rising CO₂) or that the nitroglycerin has dropped him too far: a patient who stops protecting his airway can no longer have a mask — he needs breaths given and a tube.',
    },
    {
      id: 'rn-report-drop', label: 'Report the falling pressure to the physician at once', roles: ED_RN, points: 10, applies: (s) => has(s, 'dropping'),
      why: 'The physician\'s order holds the nitroglycerin under 120: as the surge breaks the same infusion drops him too far. Tell the physician at once (SBAR, closed loop) and turn it down as ordered — the pressure is back within minutes.',
      done: (s) => firstDone(s, ['notify-physician'], 'dropping'), uses: ['notify-physician'],
      target: { within: { flag: 'dropping', minutes: 3 } },
    },
    {
      id: 'rn-report-tiring', label: 'He is getting drowsy: tell the physician at once', roles: ED_RN, points: 5, applies: (s) => has(s, 'tiring'),
      why: 'Drowsiness on the mask is a rising CO₂ — the mask is failing, or he is off it: report it at once (SBAR, closed loop) so the physician can act on the ventilation and the nitrate and get the airway ready before he stops protecting it.',
      done: (s) => firstDone(s, ['notify-physician'], 'tiring'), uses: ['notify-physician'],
      target: { within: { flag: 'tiring', minutes: 3 } },
    },
    {
      id: 'rn-handoff', label: 'Hand-off to the ICU nurse', roles: ED_RN, points: 5, done: ['handoff'],
      why: 'The BiPAP settings, each nitroglycerin dose with the pressure before and after it, the infusion rate and the pressure target, the 12-lead, the troponin and when it is repeated, the line, and how fast he turned around.',
    },

    // ─── the ER doctor ───
    {
      id: 'md-intubate', label: 'He stopped protecting his airway: intubate (RSI)', roles: ED_MD, points: 15, applies: (s) => has(s, 'failing') && !has(s, 'sedated-apnea'),
      why: 'Unresponsive with a shallow breath every 8 seconds, he has failed the mask: a tube — rapid sequence intubation with a reduced induction dose — and the ventilator with PEEP. That is the moment for intubation, not before a trial of BiPAP and high-dose nitroglycerin.',
      done: ['rsi', 'airway'], after: 'failing', target: { within: { flag: 'failing', minutes: 3 } },
    },
    {
      id: 'md-ems', label: 'Take the EMS hand-off at the bedside', roles: ED_MD, points: 5, target: { by: 2 }, done: ['ems-handoff'],
      why: 'The crew\'s report holds the story behind him: a sudden start at 4 am, 224/124 and 78 % on room air, CPAP and two standard doses of nitroglycerin, no PDE-5 inhibitor, blood pressure pills run out — and a cylinder about to run dry.',
    },
    {
      id: 'md-niv', label: 'Non-invasive ventilation without a gap: the department\'s BiPAP straight from the crew\'s CPAP', roles: ED_MD, points: 20, target: { by: 3 },
      why: 'Positive pressure holds the flooded air sacs open and unloads the heart: in cardiogenic pulmonary edema it lowers the need for intubation and the mortality (Cochrane 2019). CPAP and BiPAP work about equally well; many departments choose bilevel pressure for a patient tiring with a rising CO₂. Keep him on it from the stretcher to the ICU, sitting upright.',
      done: (s) => (has(s, 'niv-own') ? s.performed.find((p) => p.id === 'cpap')?.minute ?? null : null),
      uses: ['cpap'],
    },
    {
      id: 'md-lungs', label: 'Listen to the lungs', roles: ED_MD, points: 5, target: { by: 5 }, done: ['lungs', 'pocus'],
      why: 'Crackles to the apices with froth and no wheeze: fluid in the lungs, not asthma or COPD — what tells you positive pressure and nitrates will help, and fluid and albuterol will not.',
    },
    {
      id: 'md-nitro', label: 'High-dose nitroglycerin early: 0.8 mg sublingual now, an infusion to follow', roles: ED_MD, points: 20, target: { by: 6 }, done: ['nitro-high'],
      why: 'His pressure is what floods his lungs: high-dose nitroglycerin takes it off within minutes (the ACEP 2022 clinical policy: an option to consider for acute heart failure with a high pressure, Level C). 0.8 mg under the tongue or an IV bolus at once, then an infusion at 100 micrograms a minute or more, titrated down as the pressure falls. The 0.4 mg doses the crew gave are a chest pain dose; low doses alone leave him tiring.',
    },
    {
      id: 'md-reassess', label: 'Reassess after the nitroglycerin: pressure, breathing, mental status', roles: ED_MD, points: 5,
      done: ['reassess', 'nibp', 'vitals', 'lungs', 'neuro'], after: 'nitro-high', target: { within: { flag: 'nitro-high', minutes: 6 } },
      why: 'Is it working? The pressure coming down (and not too far), the breathing slowing, the saturation rising, the mind clearing. If he tires on the mask despite it, that is the moment for a tube.',
    },
    {
      id: 'md-imaging', label: 'Confirm it at the bedside: lung ultrasound (or a chest film)', roles: ED_MD, points: 5, target: { by: 15 }, done: ['pocus', 'cxr'],
      why: 'B-lines in every zone confirm fluid in the lungs within minutes; the ultrasound also shows a heart that squeezes hard (no new wall-motion loss), no effusion, no dilated right ventricle and an IVC that still narrows — no sign of a body overloaded with fluid, so no diuretic yet.',
    },
    {
      id: 'md-trigger', label: 'Look for the trigger: his medicines, salt, an infarct, an arrhythmia', roles: ED_MD, points: 5, done: ['sample'],
      why: 'Blood pressure pills that ran out four days ago and a salty meal; the 12-lead (no STEMI, no new arrhythmia) and the troponin (a little above the limit: the repeat decides) look for an infarct behind it.',
    },
    {
      id: 'md-admit', label: 'Admit him to the ICU (or CCU)', roles: ED_MD, points: 10, done: ['admit'],
      why: 'On BiPAP and a titrated nitroglycerin infusion he needs a monitored bed with respiratory therapy and nurses who titrate infusions; the ICU weans the mask and the drip, restarts his pills and repeats the troponin.',
    },
    {
      id: 'md-handoff', label: 'Hand-off', roles: ED_MD, points: 5, done: ['handoff'],
      why: 'The story and the trigger, the BiPAP settings, each nitroglycerin dose and the infusion with its pressure target, the 12-lead and the troponin plan, and how fast he turned around.',
    },
  ],
  harms: [
    {
      id: 'niv-off', actions: ['o2-nrb', 'o2-nc'], when: (s) => s.pulse && onNiv(s), points: 10, severity: 'major',
      text: 'Taking him off positive pressure for an oxygen mask. CPAP and BiPAP hold his flooded air sacs open and take over much of the work of breathing; a non-rebreather or a cannula gives oxygen but no pressure, and within a minute his saturation falls and his breathing climbs. Keep the mask on his face from the ambulance stretcher to the ICU — swap the crew\'s CPAP for the department\'s machine in one move, never with a gap.',
    },
    {
      id: 'niv-unprotected', actions: ['cpap'], when: (s) => !s.pulse || s.vitals.gcs <= 8, points: 5, severity: 'major',
      text: 'BiPAP for a patient who can no longer protect his airway. A mask supports the breaths a patient takes; it gives none, and a patient this drowsy can vomit into it and inhale it. He needs breaths given — a bag-mask with a PEEP valve — and a tube.',
    },
    {
      // with a pulse only: in an arrest a nitrate has no place at all, and these would teach the wrong lesson there
      id: 'nitro-no-bp', actions: NITRATES, when: (s) => s.pulse && !has(s, 'bp') && !has(s, 'ems-report'), points: 5, severity: 'major',
      text: 'Nitroglycerin without knowing his blood pressure. The pressure decides the dose — high doses while the systolic is 160 or more, none once it is under 120 here — so measure it (or hear the crew\'s) first.',
    },
    {
      id: 'nitro-no-pde5', actions: NITRATES, when: (s) => s.pulse && !has(s, 'pde5-asked') && !has(s, 'ems-report'), points: 3, severity: 'minor',
      text: 'Nitroglycerin without knowing about PDE-5 inhibitors. No nitrate within 12 h of avanafil, 24 h of sildenafil or vardenafil, or 48 h of tadalafil: together they can drop the pressure profoundly. The crew asked; without their report, ask him.',
    },
    {
      id: 'nitro-repeat-unsafe', actions: NITRATES, points: 3, severity: 'minor',
      // the learner's own repeat dose: less than 3 minutes after the last, or with no pressure taken since it
      when: (s) => {
        const last = s.performed.filter((p) => NITRATES.includes(p.id)).at(-1);
        if (!last) return false;
        // the ordered 0.8 mg straight after a 0.4 mg given in its place is the correction the physician asked for, not a repeat
        const asked = s.flags['asked-nitro-high'];
        if (last.id === 'nitro' && asked !== undefined && last.minute >= asked && !has(s, 'nitro-order-given')) return false;
        return s.minute - last.minute < 3 || !s.performed.some((p) => BP_CHECKS.includes(p.id) && p.minute > last.minute);
      },
      text: 'A repeat nitroglycerin dose too soon or without a fresh blood pressure. Repeat it every 5 minutes (3 at the least), with the pressure checked before each: the mask and the doses already given keep lowering it.',
    },
    {
      id: 'nitro-high-below-160', actions: ['nitro-high'], when: (s) => s.pulse && s.vitals.sbp >= 120 && s.vitals.sbp < 160, points: 3, severity: 'minor', replaces: ['nitro-high-not-hypertensive'],
      text: 'High-dose nitroglycerin after the pressure had come down below 160. The 0.8 mg dose is for a systolic of 160 or more; below it the infusion, titrated down, does the rest — once the surge has broken, each dose drops the pressure far more.',
    },
    {
      // under 120 this rule is the one penalty for any nitrate: the low-pressure rule, and the 0.8 mg dose rule below 160
      id: 'nitro-below-target', actions: NITRATES, when: (s) => s.pulse && s.vitals.sbp < 120, points: 8, severity: 'major', replaces: ['nitro-hypotension', 'nitro-high-not-hypertensive'],
      text: 'Nitroglycerin with a systolic under 120. The surge has broken and the pressure is falling: hold the sublingual doses and turn the infusion down — a low pressure starves the heart, the brain and the kidneys.',
    },
    ...bothRoles({
      id: 'opioid-air-hunger', actions: ['fentanyl'], when: (s) => s.pulse, points: 8, severity: 'major',
      text: 'An opioid for his air hunger. He has no pain to treat: an opioid blunts the breathing drive of a patient already tiring, and in acute cardiogenic pulmonary edema morphine has been linked to more intubations, ICU admissions and deaths (in the MIMO trial, more serious adverse events than midazolam). Positive pressure and nitroglycerin relieve the air hunger.',
    }, NO_ORDER, ['rn-without-order-fentanyl']),
    ...bothRoles({
      id: 'negative-inotrope', actions: ['metoprolol', 'diltiazem'], when: (s) => s.pulse, replaces: ['diltiazem-heart-failure', ...RATE_RULES], points: 8, severity: 'major',
      text: 'A beta-blocker or diltiazem in acute pulmonary edema. His fast rate is the body\'s answer to the work of breathing, not an arrhythmia: slowing it and weakening the squeeze of a heart that is already backing up into the lungs makes the edema worse. Treat the cause — positive pressure and nitroglycerin — and the rate comes down by itself.',
    }, NO_ORDER, ['rn-without-order-metoprolol', 'rn-without-order-diltiazem']),
    ...bothRoles({
      id: 'pressor-hypertensive', actions: ['push-epi', 'pressor'], when: (s) => s.pulse && s.vitals.sbp >= 90, points: 8, severity: 'major',
      text: 'A pressor in a patient whose pressure is already far too high. The pressure the ventricle cannot empty against is what is flooding his lungs: raising it makes the edema worse. He needs the pressure taken off — nitroglycerin and positive pressure.',
    }, NO_ORDER, ['rn-without-order-pressor', 'rn-without-order-push-epi']),
    ...bothRoles({
      id: 'antiarrhythmic-no-arrhythmia', actions: ['adenosine6', 'adenosine12', 'amio-infusion', 'procainamide', 'lidocaine'], when: (s) => s.pulse, replaces: RATE_RULES, points: 3, severity: 'minor',
      text: 'An antiarrhythmic with no arrhythmia to treat. His 12-lead shows a regular rhythm whose speed is his response to the work of breathing: adenosine only pauses it, and amiodarone, procainamide and lidocaine treat nothing he has.',
    }, NO_ORDER, ['rn-without-order-adenosine6', 'rn-without-order-adenosine12', 'rn-without-order-amio-infusion', 'rn-without-order-procainamide', 'rn-without-order-lidocaine']),
    {
      id: 'sedative-unsupported', actions: ['midazolam'], roles: ED_MD, when: (s) => s.pulse && (!onNiv(s) || s.vitals.gcs <= 12 || s.vitals.sbp < 90), points: 5, severity: 'major', replaces: ['midazolam-unsafe'],
      text: 'A sedative off the mask, or for a patient who is tiring. His panic is air hunger, which positive pressure and nitroglycerin treat; a benzodiazepine without that support blunts the breathing he has left. A small dose is for a patient on the mask who is awake and fighting it.',
    },
    {
      id: 'rn-sedative-no-order', actions: ['midazolam'], roles: ED_RN, when: (s) => s.pulse, points: 5, severity: 'major', replaces: ['rn-without-order-midazolam', 'midazolam-unsafe'],
      text: 'Midazolam without an order. A sedative in a patient this tired can blunt the breathing he has left, and the ER nurse gives it only on the physician\'s order: if he is fighting the mask, tell the physician — positive pressure and nitroglycerin usually settle the panic.',
    },
    {
      id: 'epi-im-no-anaphylaxis', actions: ['epi-im'], when: (s) => s.pulse, points: 3, severity: 'minor',
      text: 'IM epinephrine without anaphylaxis. No hives, no swelling, no exposure: his noisy breathing is fluid in the lungs, and epinephrine only drives up the pressure and the rate.',
    },
    {
      id: 'albuterol-crackles', actions: ['albuterol'], when: (s) => s.pulse, points: 3, severity: 'minor',
      text: 'Albuterol for crackles. There is no wheeze for it to open: the noise in his chest is fluid, and a beta-agonist only speeds the heart. Positive pressure and nitroglycerin clear the lungs.',
    },
    {
      // a tube is for the patient who fails the mask. Awake (GCS 13 or more, no 'tiring' yet) he gets BiPAP and the high
      // dose first; once he is drowsy with a rising CO₂ ('tiring', GCS 11) a tube is a defensible call — so is a short,
      // closely watched trial on the mask — and his failing (GCS 8 or less) makes it right
      id: 'rsi-before-niv', actions: ['rsi'], roles: ED_MD, points: 10, severity: 'major', replaces: ['rsi-no-indication'],
      when: (s) => s.pulse && s.vitals.gcs > 8 && !has(s, 'tiring'),
      text: 'Intubation of an awake man before a trial of BiPAP and high-dose nitroglycerin. He came in tiring on the crew\'s CPAP and two chest pain doses of nitroglycerin — not on the department\'s bilevel pressure and 0.8 mg with an infusion. Positive pressure roughly halves the need for a tube in cardiogenic pulmonary edema (Cochrane 2019), and with the high dose most of these patients turn around within minutes. Intubate the patient who fails them: who stops protecting his airway, or keeps tiring with a rising CO₂ despite them. The induction drug and positive pressure also take away the surge holding his pressure up.',
    },
    {
      // once he is intubated, sedation for the ventilator is ordinary care, not this mistake
      // as costly as the tube before a trial (rsi-before-niv): sedating first and intubating the apnea is no way around it
      id: 'deep-sedation-niv', actions: ['procedural-sedation'], roles: ED_MD, when: (s) => s.pulse && !has(s, 'airway'), points: 10, severity: 'major', replaces: ['sedation-no-procedure'],
      text: 'Procedural sedation for a man breathing on his own. Etomidate or propofol at a sedation dose takes away the airway protection and the breathing drive that BiPAP (or any mask) depends on: he stops breathing for himself and now needs a bag and a tube. Positive pressure and nitroglycerin settle the air hunger in most of these patients; if he truly cannot tolerate the mask, a small anxiolytic dose, titrated, while he stays awake and breathing.',
    },
    {
      // the built-in rule, same id: a deliberate exemption. Every state is this case's own to judge — off the tube deep
      // sedation is 'deep-sedation-niv' (above), and on the ventilator it is ordinary care — so it never charges here
      id: 'sedation-no-procedure', actions: ['procedural-sedation'], roles: ED_MD, when: () => false, points: 3, severity: 'minor',
      text: 'Procedural sedation with no procedure that needs it.',
    },
    {
      id: 'ct-unneeded', actions: ['ct-urgent'], roles: ED_MD, when: (s) => s.pulse, points: 5, severity: 'major',
      text: 'A CT for a patient in respiratory failure on BiPAP. The story, the crackles, the ultrasound and the film already explain him, and a trip to the scanner takes him away from respiratory therapy and the resuscitation bay: a CT is for a story that does not fit — a dissection, a pulmonary embolism.',
    },
    {
      id: 'cath-lab-strain', actions: ['cath-lab-activate'], roles: ED_MD, points: 3, severity: 'minor', replaces: ['cath-lab-no-ste'],
      when: (s) => !has(s, 'ecg-stemi'),
      text: 'Activating the cath lab for a strain pattern. ST depression and T-wave inversion in the lateral leads of a thick, pressure-loaded ventricle are not ST elevation: no STEMI, no cath lab. A troponin a little above the limit in a hypertensive emergency is usually strain — the repeat, the clinical course and cardiology decide whether an infarct is part of it.',
    },
    {
      id: 'transfer-unneeded', actions: ['transfer'], roles: ED_MD, when: (s) => s.pulse, points: 5, severity: 'major',
      text: 'Transferring a patient this hospital can care for. He needs an ICU bed, BiPAP and a nitroglycerin infusion — all here; a transfer moves a patient in respiratory failure for nothing another hospital can add. Admit him.',
    },
    ...RN_ORDERS.map((a) => askHarm(a, 'The wrong dose after the physician\'s order: 0.4 mg instead of 0.8 mg. Read the order back (closed loop) and give what was ordered — the chest pain dose barely touches a pressure like his.')),
  ],
  timings: [
    DOOR_TO_ECG,
    { label: 'On the department\'s BiPAP, without a gap', actions: ['cpap'], target: 3 },
    // the physician's own dose (the nurse's run, if the nurse never gave it) counts by its flag
    { label: 'First high-dose nitroglycerin', actions: ['nitro-high'], flag: 'nitro-high', target: 6 },
    { label: 'Breathing easier (SpO₂ in the mid-90s, full sentences)', actions: [], flag: 'better' },
  ],
  teaching: [
    'Sudden, severe breathlessness that wakes an older patient, sitting bolt upright, sweating, with a pressure over 200, crackles to the apices and pink froth: hypertensive acute pulmonary edema (sympathetic crashing acute pulmonary edema, "SCAPE"). A surge of sympathetic tone raises the afterload, a thick, stiff ventricle backs up, and fluid moves into the lungs within minutes — many of these patients are not overloaded with fluid: it has shifted, and taking the pressure off moves it back.',
    'Positive pressure never stops: swap the crew\'s CPAP for the department\'s machine in one move, never a non-rebreather "for the transfer", and keep him sitting upright with the legs down. Non-invasive ventilation lowers the need for intubation and the mortality in cardiogenic pulmonary edema (Cochrane 2019); CPAP and BiPAP work about equally well, and many departments choose bilevel pressure for a patient tiring with a rising CO₂. Match the end-expiratory pressure to the crew\'s CPAP at the swap.',
    'Nitroglycerin at a high dose is the drug (the ACEP 2022 clinical policy: consider it for acute heart failure with a high pressure, Level C): 0.8 mg sublingual or an IV bolus (commonly 400–1,000 micrograms, up to 2,000 in some protocols) at once, then an infusion started high — 100 micrograms a minute or more — titrated to the pressure and down as the surge breaks. Low doses — the 0.4 mg chest pain dose, or an infusion started at 5–10 micrograms a minute — barely touch a pressure like his. The evidence is small and mostly observational: faster relief of the breathing and the pressure, fewer intubations in some studies but not in a 2026 meta-analysis, and a little more hypotension — so a pressure before every dose and every few minutes on the infusion, and ask about PDE-5 inhibitors.',
    'As the surge breaks, the dose that was right minutes ago drops the pressure too far: the nurse checks it every 5 minutes on the infusion, reports a fall at once, and turns the drip down as ordered. Hold the sublingual doses once the systolic is under the target.',
    'No fluid, no raised legs, no opioids: morphine in acute cardiogenic pulmonary edema has been linked to more intubations, ICU admissions and deaths, and in the MIMO trial caused more serious adverse events than midazolam. A small dose of a benzodiazepine is only for a patient on the mask who is awake and fighting it — on the physician\'s order.',
    'A loop diuretic is not the first drug: it treats fluid the body is carrying, and a SCAPE patient often is not (a steady weight, no leg swelling, an IVC that still narrows). Give IV furosemide for signs of volume overload, once the pressure is controlled (2022 AHA/ACC/HFSA guideline: IV loop diuretics for significant fluid overload, class 1; ACEP 2022: early diuretics may be considered once the diagnosis of acute heart failure with volume overload is secure, Level C). The same 2022 guideline lists IV nitroglycerin or nitroprusside only as an add-on to diuretics for breathlessness without hypotension (2b); the case for high doses first, in this hypertensive form, comes from emergency-medicine studies and reviews.',
    'Intubate the patient who fails positive pressure and nitrates — who stops protecting his airway, or keeps tiring with a rising CO₂ despite them — with a reduced induction dose: the drugs and the ventilator take away the surge that holds the pressure up. Intubating an awake man before that trial is the mistake; once he is drowsy with a rising CO₂, a tube or a short, closely watched trial on the mask are both defensible.',
    'Look for the trigger: a 12-lead within 10 minutes (an infarct or a new arrhythmia changes the treatment), a troponin and its repeat, his medicines (pills run out), salt. LVH with strain is not ST elevation: no cath lab for it. A troponin a little above the limit in a hypertensive emergency is often strain; the repeat and the course decide.',
    'The ER nurse takes the crew\'s report, keeps the mask on, brings the physician at once, records the 12-lead, gives the high dose on the order and watches the pressure and the mind; the ER doctor decides on the ventilation, the nitrates, the airway and the ICU. Both speak up: a falling pressure or a drowsy patient is reported at once.',
  ],
};
