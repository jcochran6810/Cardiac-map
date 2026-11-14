import type { Effect, Line, Scenario, SimState } from '../types';
import { atRate, bpAfter, count, firstDone, has, line } from '../kit';
import { NITRATE_RULES, SEDATIVE_RULES } from '../rules/acs';
import { LIDOCAINE_RULES, RATE_RULES, yieldToHeavier } from '../rules/rhythm';
import { pressorNotLow } from '../rules/support';

/**
 * Pulmonary embolism with obstructive shock, in the field. A 45-year-old woman ten days after a plate and screws for a
 * fracture just below the knee (no weight on it since, on crutches, on the birth control pill, a calf swelling for two
 * days) gets up from the couch, goes gray and drops: sudden breathlessness, a faint, a fast rate, a low pressure, a low
 * SpO₂, distended neck veins and clear lungs — the right ventricle is failing behind a large clot. 2026 AHA/ACC Clinical
 * Category E1 (persistent hypotension with shock).
 *
 * The right care: high-flow oxygen, an IV, early vasopressor support (norepinephrine; push-dose epinephrine as a bridge),
 * at most one small bolus (500 mL), a short scene time and an early call to the heart center that can take the clot out
 * (PE response team, catheter thrombectomy, ECMO, cardiac surgery): with major surgery inside 3 weeks, a systemic
 * clot-dissolving drug carries a high bleeding risk. The EMT gives oxygen, finds the shock and its pattern, calls the
 * intercept, acquires and transmits the 12-lead, and goes. The traps are the reflexes of other shocks and of chest pain:
 * fluid by the liter (it overdistends the right ventricle), nitroglycerin (it takes away the preload that ventricle lives
 * on), CPAP (positive pressure cuts the venous return and loads the right ventricle further), sedation, rate control,
 * and a long scene. Fluid loading or delay makes the right ventricle fail, and then she arrests in PEA: CPR and
 * epinephrine can still bring her back.
 */

/** Minutes from the EMT's call until the paramedic intercept is at her side */
const ALS_MINUTES = 6;

/** On scene this long, the right ventricle gives out: the clot needs a hospital, and no field drug removes it */
const FAILS_ON_SCENE = 16;

/** Without any vasopressor, wherever she is, the low pressure starves the right ventricle by this minute */
const FAILS_UNSUPPORTED = 20;

/** Minutes from the failing right ventricle to the arrest: on scene, and with nothing holding the pressure up */
const ARREST_ON_SCENE = 6;
const ARREST_UNSUPPORTED = 8;

/** CPR cycles in the arrest (with epinephrine on board for at least one) that bring her back */
const ROSC_CYCLES = 3;

const onScene = (s: SimState) => !has(s, 'enroute') && !has(s, 'arrived');

/** Minutes a push of push-dose epinephrine holds the pressure: a bridge to the infusion, not a treatment */
const PUSH_LASTS = 6;

/**
 * Pushes the case follows as each wears off (one event per push, since an event fires once): more than any crew gives
 * in the time the case runs
 */
const MAX_PUSHES = 12;

/** The latest push of push-dose epinephrine, if any */
const lastPush = (s: SimState) => s.performed.filter((p) => p.id === 'push-epi').at(-1);

/** A vasopressor is holding her pressure up: the infusion, or a push of push-dose epinephrine in the last few minutes */
function supported(s: SimState): boolean {
  if (has(s, 'pressor')) return true;
  const push = lastPush(s);
  return push !== undefined && s.minute - push.minute <= PUSH_LASTS;
}

/**
 * The pressure a run of pushes started from (kept in timers, the only numbers a case can store): repeated pushes hold
 * her near it plus the lift of one push, they do not stack, and when the last one wears off she falls back to it
 */
const pushBase = (s: SimState) => (s.timers.pushSbp === undefined ? null : { sbp: s.timers.pushSbp, dbp: s.timers.pushDbp });

/** The right ventricle has started to fail: the step before the arrest */
const failing = (s: SimState) => has(s, 'rv-failing');

/** Too drowsy (after the arrest) or in arrest: her husband answers the questions she cannot */
const cannotTalk = (s: SimState) => !s.pulse || s.vitals.gcs < 13;

/** What the monitor shows — only once it is on */
const onMonitor = (s: SimState, text: string, tone?: Line[2]): Line[] => (has(s, 'monitor') || has(s, 'pads') ? [line('monitor', text, tone)] : []);

/** A push of push-dose epinephrine has worn off, with no infusion behind it: the pressure slides back to where the run began */
function pushWearsOff(n: number) {
  return {
    id: `push-wears-off-${n}`,
    when: (s: SimState) => {
      const push = lastPush(s);
      const base = pushBase(s);
      return s.pulse && count(s, 'push-epi') === n && !has(s, 'pressor') && push !== undefined && base !== null
        // a push before the arrest says nothing about the pressure after ROSC
        && (s.flags.rosc === undefined || push.minute >= s.flags.rosc)
        && s.minute - push.minute > PUSH_LASTS && s.vitals.sbp > base.sbp;
    },
    effect: (s: SimState): Effect => {
      const base = pushBase(s)!;
      // a right ventricle that started to fail while the push held it falls back further than where it was (after ROSC
      // the run began from the pressure she came back with, which already counts it)
      const floor = failing(s) && !has(s, 'rosc') ? { sbp: Math.min(base.sbp, 74), dbp: Math.min(base.dbp, 46) } : base;
      const sbp = Math.min(s.vitals.sbp, floor.sbp);
      const dbp = Math.min(s.vitals.dbp, floor.dbp);
      return {
        say: [['partner', 'The push-dose epinephrine has worn off: she is graying again, and her radial pulse is fading.', 'warn'], ...onMonitor(s, `BP ${sbp}/${dbp}.`, 'warn')],
        vitals: { sbp, dbp },
      };
    },
  };
}

/** 2-minute CPR cycles started since a flag was set (the cycle being started now is not counted yet) */
function cyclesSince(s: SimState, flag: string): number {
  const from = s.flags[flag];
  if (from === undefined) return 0;
  return s.performed.filter((p) => p.id === 'cpr' && p.minute >= from).length;
}

/** Return of circulation: the clot is still there, so the heart comes back fast, strained and barely holding a pressure */
function rosc(s: SimState): Effect {
  const bp = has(s, 'pressor') ? { sbp: 92, dbp: 56 } : { sbp: 78, dbp: 46 };
  // the mask she had on before the arrest goes back on once she breathes again
  const mask = count(s, 'o2-nrb') > 0;
  return {
    say: [
      ['you', 'Pulse check at the end of the cycle: a carotid pulse — ROSC. She gasps, then breathes on her own, fast and shallow.', 'good'],
      ...(mask ? [line('partner', 'The non-rebreather goes back on at 15 L/min.')] : []),
      // a rise, but not to normal: the clot still leaves lung that is ventilated and not perfused
      ...(has(s, 'capno') ? [line('monitor', 'EtCO₂ rises to 28 mmHg.')] : []),
    ],
    rhythm: { profile: 'pulmonary-embolism', hr: 136 }, pulse: true, phase: 'rosc',
    vitals: { ...bp, spo2: mask ? 88 : 84, rr: 28, etco2: 28, gcs: 10, pain: 0 },
    flags: ['cpr'],
  };
}

/** A mask only offers oxygen to someone who breathes: in the arrest it is the bag that oxygenates her */
const noMaskInArrest: Effect = { blocked: true, say: [['system', 'Not in cardiac arrest: a mask only offers oxygen to someone who breathes. Ventilate with the bag-mask and oxygen.']] };

/** A drug that slows the heart or weakens its squeeze: the fast rate is what is keeping her output up */
function slower(s: SimState, given: string, dHr: number, flag: string): Effect | null {
  if (!s.pulse) return null;
  const bp = bpAfter(s, dHr > 0 ? -14 : -10, dHr > 0 ? -8 : -6);
  const hr = Math.max(100, s.rhythm.hr - dHr);
  return {
    say: [['you', given], ...onMonitor(s, dHr > 0 ? `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.` : `BP ${bp.sbp}/${bp.dbp}.`, 'bad'), ['partner', 'She is grayer, and she says she is going to pass out.', 'bad']],
    vitals: { ...bp, gcs: Math.min(s.vitals.gcs, 14) }, ...(dHr > 0 ? { rhythm: atRate(s, hr) } : {}), flags: [flag],
  };
}

/** A sedative: it takes away the fear that is driving her pressure, and some of her breathing with it */
function sedative(s: SimState, given: string, flags: string[]): Effect | null {
  if (!s.pulse) return null;
  const bp = bpAfter(s, -12, -8);
  return {
    say: [['you', given], ['partner', 'She is drowsy now, and her breathing is slower and shallower.', 'bad'], ...onMonitor(s, `BP ${bp.sbp}/${bp.dbp}.`, 'bad')],
    vitals: { ...bp, gcs: Math.min(s.vitals.gcs, 13), rr: Math.max(16, s.vitals.rr - 6), spo2: Math.max(70, s.vitals.spo2 - 3) }, flags,
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
      ['patient', '"Everything\'s going dark…" She goes gray and slumps against the couch.', 'bad'],
      ...onMonitor(s, `BP ${sbp}/${dbp}.`, 'bad'),
    ],
    vitals: { sbp, dbp, gcs: Math.min(s.vitals.gcs, 13) },
    flags: high ? ['nitro', 'nitro-high'] : ['nitro'],
  };
}

/** What the crew has found that the hospital can use */
function findings(s: SimState): string[] {
  const f: string[] = [];
  if (has(s, 'sample')) f.push('knee surgery ten days ago and a swollen right calf');
  if (has(s, 'perfusion')) f.push('distended neck veins');
  if (has(s, 'lungs')) f.push('clear lungs');
  return f;
}

export const peField: Scenario = {
  id: 'pulmonary-embolism-field',
  title: 'She went gray and dropped',
  summary: '45-year-old woman, suddenly short of breath, who fainted getting up from the couch ten days after knee surgery. Find why her pressure is low — and what would make it worse.',
  setting: 'field',
  roles: [1, 2],
  difficulty: 'advanced',
  conditionId: 'pulmonary-embolism',
  briefing: {
    default: [
      ['dispatch', 'Priority 1: 45-year-old woman, short of breath, fainted. Her husband says she "went gray and dropped". You are the ALS crew.'],
      ['scene', 'A ground-floor apartment. She is sitting on the floor against the couch, crutches beside her and a hinged brace on her right knee, breathing fast and shallow, pale and sweaty, her lips dusky. Her husband: "She got up to go to the bathroom and just went down. She came round in a few seconds."'],
      ['partner', 'Your partner, an EMT, has the stretcher, the oxygen and the airway bag; you have the monitor and the drug box.'],
      ['hospital', 'Regional heart center (cath lab, interventional radiology, cardiac surgery, ECMO and an ICU): 14 minutes. Nearest emergency department (no cath lab, no cardiac surgery): 8 minutes.'],
    ],
    1: [
      ['dispatch', 'Priority 1: 45-year-old woman, short of breath, fainted. Her husband says she "went gray and dropped". You are the BLS crew; a paramedic unit can meet you as an intercept if you ask for one.'],
      ['scene', 'A ground-floor apartment. She is sitting on the floor against the couch, crutches beside her and a hinged brace on her right knee, breathing fast and shallow, pale and sweaty, her lips dusky. Her husband: "She got up to go to the bathroom and just went down. She came round in a few seconds."'],
      ['partner', 'Your partner, an EMT, has the stretcher, the oxygen and the AED; the 12-lead monitor is in your bag.'],
      ['hospital', 'Regional heart center (cath lab, interventional radiology, cardiac surgery, ECMO and an ICU): 14 minutes. Nearest emergency department (no cath lab, no cardiac surgery): 8 minutes.'],
    ],
  },
  initial: {
    // the 'pulmonary-embolism' profile: sinus tachycardia with S1Q3T3, an incomplete RBBB and T inversion V1–V4
    rhythm: { profile: 'pulmonary-embolism', hr: 124 },
    // a low EtCO₂ for her fast breathing: the clot leaves part of the lung ventilated but not perfused (dead space)
    vitals: { sbp: 84, dbp: 52, spo2: 86, rr: 30, etco2: 24, pain: 5, gcs: 15, glucose: 104, temp: 37.4 },
  },
  // what the built-in safety rules read (types.ts Problem): a high-risk PE (category E1) ten days after surgery — no lytic
  // in the field, and its bleeding risk is why the heart center takes the clot out instead
  problems: ['pulmonary-embolism', 'pe-high-risk', 'recent-surgery'],
  facts: {
    // after the arrest she cannot give a history: her husband does, from what she told him
    opqrst: (s) => (cannotTalk(s)
      ? 'Her husband: "It hit her all at once when she got up off the couch on her crutches — she couldn\'t get her breath, went gray and dropped. When she came round she said it hurt on the right side of her chest when she breathed in."'
      : 'It hit me all at once, about 20 minutes ago, when I got up off the couch on my crutches. I couldn\'t get my breath, everything went gray, and the next thing I knew I was on the floor. Now there\'s a sharp pain on the right side of my chest when I breathe in, 5 out of 10. I just can\'t get enough air.'),
    sample: (s) => (cannotTalk(s)
      ? 'Her husband: "No allergies. She fell off a ladder and broke her right shin just below the knee — ten days ago they fixed it with a plate and screws. She\'s been on crutches since, not allowed to put weight on it, mostly on the couch with it up. She takes the birth control pill, and ibuprofen and oxycodone for the knee. They gave her blood-thinner shots in the hospital, none since she came home. Her right calf has been swollen and sore for two days."'
      : 'No allergies. I fell off a ladder and broke my right shin bone just below the knee; ten days ago they fixed it with a plate and screws. Since then I\'ve been on crutches, not allowed to put weight on it, mostly on the couch with it up. I take a birth control pill, and ibuprofen and oxycodone for the knee. They gave me blood-thinner shots in the hospital, none since I came home. I\'ve never had a clot. My right calf has been swollen and sore for two days — I thought it was the surgery. Toast this morning.'),
    pde5: (s) => (cannotTalk(s) ? 'Her husband: "No."' : 'No.'),
    lungs: (s) => (s.pulse
      ? 'Clear and equal on both sides — no crackles, no wheezes. She breathes fast and shallow.'
      : 'Equal breath sounds with each squeeze of the bag; no crackles.'),
    perfusion: (s) => {
      if (!s.pulse) return 'No pulse. Neck veins distended.';
      if (has(s, 'rosc')) return 'Gray and mottled; neck veins distended; a weak, fast carotid pulse, no radial pulse. Her right calf is swollen.';
      if (failing(s)) return 'Gray, cool and mottled; neck veins bulging up to the jaw; a weak, thready radial pulse. Her right calf is swollen, warm and tender.';
      return 'Pale, cool and clammy, lips dusky; neck veins distended while she sits up; fast, weak radial pulses. Her right calf is swollen, warm and tender — bigger than the left.';
    },
    neuro: (s) => (failing(s) || has(s, 'rosc') ? 'Slow to answer and confused; moves all four limbs.' : 'Alert and oriented, frightened; no focal deficit.'),
    // what the profile draws: P pulmonale, an S in I, a Q and inverted T in III, an incomplete RBBB, T inversion V1–V4
    ecg12: (s) => `Sinus tachycardia ${s.rhythm.hr} with right heart strain: tall, peaked P waves in II, an S wave in I with a Q wave and an inverted T wave in III (S1Q3T3), an incomplete right bundle branch block and T waves inverted in V1–V4. No ST elevation that meets STEMI criteria. In a woman who fainted, breathless and hypotensive, ten days after knee surgery, this is a large clot in the lungs straining the right ventricle until proven otherwise. S1Q3T3 is classic but insensitive: a normal 12-lead would not have ruled it out.`,
  },
  status: (s) => {
    if (!s.pulse) return 'Unresponsive, no pulse.';
    if (has(s, 'rosc')) return 'Moans and opens her eyes to her name; breathing fast on her own.';
    if (failing(s)) return '"I\'m going to pass out… I can\'t get any air…"';
    if (supported(s) && has(s, 'o2')) return '"Still so short of breath… but I don\'t feel quite so faint."';
    return '"I can\'t get enough air… I feel like I\'m going to faint again."';
  },
  respond: {
    // the clot leaves lung that is ventilated but not perfused: oxygen helps, but does not bring her to normal
    'o2-nrb': (s) => {
      if (!s.pulse) return noMaskInArrest;
      const spo2 = Math.max(s.vitals.spo2, failing(s) || has(s, 'rosc') ? 88 : 92);
      return { say: [['monitor', `Non-rebreather at 15 L/min. SpO₂ ${spo2}%.`]], vitals: { spo2 }, flags: ['o2'] };
    },
    'o2-nc': (s) => {
      if (!s.pulse) return noMaskInArrest;
      const spo2 = Math.max(s.vitals.spo2, failing(s) || has(s, 'rosc') ? 86 : 89);
      return {
        say: [['monitor', `Nasal cannula at 4 L/min. SpO₂ ${spo2}%.`], ...(spo2 < 90 ? [line('partner', 'Still under 90, and she is working hard to breathe. A non-rebreather would give her more.', 'warn')] : [])],
        vitals: { spo2 }, flags: ['o2'],
      };
    },
    // one small bolus is tolerated; after that every liter goes into a right ventricle that is already overdistended,
    // pushes the septum into the left ventricle and empties it
    fluid: (s) => {
      if (!s.pulse) return null;
      if (count(s, 'fluid') === 0) {
        const bp = bpAfter(s, 4, 2);
        return {
          say: [['you', '500 mL of saline in.'], ...onMonitor(s, `BP ${bp.sbp}/${bp.dbp}.`), ['partner', 'Hardly any change, and her neck veins look fuller.']],
          vitals: bp, flags: ['fluid'],
        };
      }
      const bp = bpAfter(s, -6, -4);
      const spo2 = Math.max(70, s.vitals.spo2 - 2);
      return {
        say: [['you', `Another 500 mL in — ${(count(s, 'fluid') + 1) * 500} mL in all.`], ...onMonitor(s, `BP ${bp.sbp}/${bp.dbp}. SpO₂ ${spo2}%.`, 'bad'), ['partner', 'Her neck veins are bulging up to her jaw, and she is getting grayer.', 'bad']],
        vitals: { ...bp, spo2 }, flags: ['fluid'],
      };
    },
    // norepinephrine: the pressure that perfuses the struggling right ventricle (titrated to a MAP of 65 or more)
    pressor: (s) => {
      if (!s.pulse) return null;
      const target = failing(s) || has(s, 'rosc') ? { sbp: 92, dbp: 58 } : { sbp: 102, dbp: 64 };
      const bp = { sbp: Math.max(s.vitals.sbp, target.sbp), dbp: Math.max(s.vitals.dbp, target.dbp) };
      return {
        say: [['you', 'Norepinephrine infusion running, titrated to a MAP of 65 or more.'], ...onMonitor(s, `BP ${bp.sbp}/${bp.dbp}.`, 'good'), ...(s.vitals.gcs >= 13 ? [line('patient', '"I don\'t feel quite so faint."')] : [])],
        vitals: bp, flags: ['pressor'],
      };
    },
    'push-epi': (s) => {
      // 10–20 mcg is a dose for a low pressure with a pulse: in the arrest it is not the 1 mg the algorithm calls for
      if (!s.pulse) return { say: [['you', 'Push-dose epinephrine, 10–20 mcg — a dose for a low pressure with a pulse. In cardiac arrest the dose is 1 mg.', 'warn']], flags: ['push-epi-arrest'] };
      const hr = Math.min(150, s.rhythm.hr + 4);
      // on top of the infusion a push lifts the pressure only for the minutes it lasts: the infusion is what holds it
      if (has(s, 'pressor')) {
        const peak = bpAfter(s, 14, 8);
        return { say: [['you', 'Push-dose epinephrine 10 mcg IV.'], ...onMonitor(s, `BP ${peak.sbp}/${peak.dbp} for a few minutes, then back to ${s.vitals.sbp}/${s.vitals.dbp} on the infusion.`)], flags: ['push-epi'] };
      }
      // a push within the minutes of the last one keeps the same run going; a pressure that has fallen since starts it lower
      const prev = supported(s) ? pushBase(s) : null;
      const base = prev ? { sbp: Math.min(prev.sbp, s.vitals.sbp), dbp: Math.min(prev.dbp, s.vitals.dbp) } : { sbp: s.vitals.sbp, dbp: s.vitals.dbp };
      const lift = bpAfter({ ...s, vitals: { ...s.vitals, ...base } }, 14, 8);
      const bp = { sbp: Math.max(s.vitals.sbp, lift.sbp), dbp: Math.max(s.vitals.dbp, lift.dbp) };
      return {
        say: [['you', 'Push-dose epinephrine 10 mcg IV.'], ...onMonitor(s, `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`), ['partner', 'That buys a few minutes: repeat it, or an infusion keeps it there.']],
        vitals: bp, rhythm: atRate(s, hr), flags: ['push-epi'], timers: { pushSbp: base.sbp, pushDbp: base.dbp },
      };
    },
    // a venodilator takes away the preload a pressure-overloaded right ventricle lives on (as in an RV infarct)
    nitro: (s) => nitroCrash(s, false),
    'nitro-high': (s) => nitroCrash(s, true),
    // positive pressure squeezes the venous return and loads the right ventricle further; her lungs are not wet
    cpap: (s) => {
      if (!s.pulse) return { blocked: true, say: [['system', 'Not in cardiac arrest: CPAP supports breaths a patient takes. She needs compressions and breaths with the bag.']] };
      const bp = bpAfter(s, -12, -8);
      return {
        say: [
          ['you', 'CPAP mask on at 5 cmH₂O.'],
          ['patient', '"It\'s pushing against me — I can\'t — take it off!"', 'bad'],
          ...onMonitor(s, `BP ${bp.sbp}/${bp.dbp}. SpO₂ ${s.vitals.spo2}%.`, 'bad'),
          ['partner', 'Her pressure dropped as soon as it went on, and her saturation did not move. Taking it off.', 'bad'],
        ],
        vitals: bp, flags: ['cpap'],
      };
    },
    // the right ventricle is already full (distended neck veins): raising the legs adds nothing, and lying flat she cannot breathe
    'legs-up': (s) => {
      if (!s.pulse) return null;
      return {
        say: [['you', 'Laid flat with her legs raised.'], ['patient', '"I can\'t breathe lying down!"', 'bad'], ['partner', 'Her pressure has not moved, and her neck veins are fuller. I\'m sitting her back up.']],
        flags: ['legs-up'],
      };
    },
    metoprolol: (s) => slower(s, 'Metoprolol 5 mg IV.', 12, 'beta-blocker'),
    diltiazem: (s) => slower(s, 'Diltiazem IV.', 10, 'diltiazem'),
    'amio-infusion': (s) => slower(s, 'Amiodarone 150 mg running over 10 minutes.', 0, 'amiodarone'),
    procainamide: (s) => slower(s, 'Procainamide running at 30 mg/min.', 0, 'procainamide'),
    // bearing down cuts the venous return of a heart that depends on it; the sinus rate is not a circuit to break
    vagal: (s) => {
      if (!s.pulse || s.vitals.gcs < 13) return { blocked: true, say: [['system', 'A vagal maneuver needs an awake patient who can bear down.']] };
      const bp = bpAfter(s, -6, -4);
      return { say: [['you', 'Modified Valsalva: she bears down.'], ['partner', 'She went gray for a moment — and the rate did not change.', 'bad'], ...onMonitor(s, `Heart rate ${s.rhythm.hr}. BP ${bp.sbp}/${bp.dbp}.`)], vitals: bp, flags: ['vagal'] };
    },
    // pleuritic pain: a small dose of fentanyl is fair once the pressure is held up; it blunts the drive that holds it
    fentanyl: (s) => {
      if (!s.pulse) return null;
      const bp = bpAfter(s, -4, -2);
      const pain = Math.max(0, s.vitals.pain - 3);
      return { say: [['you', 'Fentanyl 25 mcg IV.'], ...(s.vitals.gcs >= 13 ? [line('patient', '"That takes the edge off the pain when I breathe."')] : []), ...onMonitor(s, `BP ${bp.sbp}/${bp.dbp}.`)], vitals: { ...bp, pain }, flags: ['analgesia'] };
    },
    sedation: (s) => sedative(s, 'Sedation given.', ['sedation']),
    midazolam: (s) => sedative(s, has(s, 'iv') ? 'Midazolam 2.5 mg IV.' : 'Midazolam 5 mg IM (no IV yet).', ['benzodiazepine', 'sedation']),
    // an anaphylaxis dose: it lifts the pressure for a few minutes and treats nothing she has
    'epi-im': (s) => {
      if (!s.pulse) return { say: [['you', 'Epinephrine 0.5 mg IM in the thigh — a muscle barely absorbs it during CPR, and it is not the arrest dose.']], flags: ['epi-im'] };
      const bp = bpAfter(s, 6, 4);
      const hr = Math.min(150, s.rhythm.hr + 6);
      return { say: [['you', 'Epinephrine 0.5 mg IM in the thigh.'], ...onMonitor(s, `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`)], vitals: bp, rhythm: atRate(s, hr), flags: ['epi-im'] };
    },
    // the arrest: the clot is still there. Compressions and epinephrine together can push blood past it — on the third cycle
    cpr: (s) => {
      if (s.pulse) return null;
      const cycles = cyclesSince(s, 'arrest') + 1;
      const afterEpi = has(s, 'epi') ? cyclesSince(s, 'epi') + 1 : 0;
      if (cycles >= ROSC_CYCLES && afterEpi >= 1) return rosc(s);
      return null;
    },
    // the Hs and Ts against what the crew knows about her
    'hs-ts': (s) => ({
      say: [['you', `Hs and Ts against what you know. Hypoxia: SpO₂ ${s.pulse ? s.vitals.spo2 : 'unreadable'}${has(s, 'o2') ? ' on oxygen' : ''} — a result of the cause more than the cause. Hypovolemia: no bleeding, no vomiting, and her neck veins are full, not flat. Hydrogen ion and potassium: nothing in her history. Hypothermia: she is warm. Tension pneumothorax: equal breath sounds, trachea midline. Tamponade: full neck veins fit, but no chest injury, no cancer and no recent heart procedure. Toxins: oxycodone for the knee, but she was awake and breathing fast. Thrombosis: pulmonary — ten days after knee surgery, on the pill, a swollen right calf, a sudden faint and breathlessness, full neck veins with clear lungs. The likeliest cause.`]],
      flags: ['hs-ts'],
    }),
    // the physician reads what the crew sends (the EMT does not interpret it)
    'ecg-transmit': (s) => {
      if (!has(s, 'ecg12')) return null;
      const story = has(s, 'sample')
        ? 'With a faint, a low pressure and an operation ten days ago, I am thinking of a large clot in her lungs: high-flow oxygen, keep her sitting up, and bring her to the heart center. Call in your report on the way.'
        : 'Tell me her history: any recent surgery, a long trip, a clot before? And call in your report on the way.';
      return { say: [['hospital', `ECG received. The physician: "A fast rate with right heart strain — no ST elevation that meets STEMI criteria. ${story}"`]], flags: ['transmitted'] };
    },
    // online medical control asks for what decides her care, then says it plainly
    'med-control': (s) => {
      if (!s.pulse) {
        // the EMT has no epinephrine to give: the compressions and the AED are theirs, the drugs the paramedic's
        const drugs = s.role === 1
          ? `compressions and the AED${has(s, 'als') ? ', and the paramedic gives epinephrine every 3 to 5 minutes' : ' — and get a paramedic intercept to you now, for the epinephrine'}`
          : 'compressions, epinephrine every 3 to 5 minutes';
        return { say: [['hospital', `Medical control: "Work the arrest where you are: ${drugs}. A clot in her lungs is the likely cause — if you get her back, go straight to the heart center and call them, so the clot-dissolving drug and the ECMO team are ready."`]], flags: ['med-control'] };
      }
      if (!has(s, 'perfusion') || !has(s, 'sample')) {
        return { say: [['hospital', 'Medical control: "Tell me more: her neck veins and her lungs, and anything recent — surgery, a long trip, a swollen leg? Call me back."']], flags: ['med-control'] };
      }
      if (s.role === 1) {
        const intercept = has(s, 'als') ? 'Don\'t wait on scene for your intercept — let it meet you' : 'Request a paramedic intercept now and let it meet you on the way — she needs an IV and a vasopressor';
        return { say: [['hospital', `Medical control: "That sounds like a big clot in her lungs. Keep her sitting up on high-flow oxygen, no CPAP. ${intercept}, and go to the heart center: with surgery ten days ago, they can take the clot out with a catheter. Call them now."`]], flags: ['med-control'] };
      }
      return {
        say: [['hospital', 'Medical control: "That sounds like a big clot in her lungs, and her right heart is failing. Norepinephrine for her pressure, to a MAP of 65 or more — push-dose epinephrine while you set it up. No more than 500 mL of fluid, no nitroglycerin, no CPAP and no sedation. High-flow oxygen, and go now: the heart center, where the team can take the clot out with a catheter — with surgery ten days ago, a clot-dissolving drug is a bleeding risk. Call them on the way."']],
        flags: ['med-control'],
      };
    },
    // the early call: what the crew found decides what is waiting for her
    notify: (s) => {
      // the hospital hears only what the crew reports: the likely cause once the history and the neck veins are in it
      const suspected = has(s, 'sample') && has(s, 'perfusion');
      if (!s.pulse) {
        return { say: [['hospital', `Copy: cardiac arrest, resuscitation under way. The resuscitation team will be ready${suspected ? ', with a clot-dissolving drug and the ECMO team on standby' : ''}. Call back with any change.`]], flags: ['notified'] };
      }
      const f = findings(s);
      const bp = `BP ${s.vitals.sbp}/${s.vitals.dbp}`;
      // after an arrest the call says so: it decides who meets her at the door
      const story = has(s, 'rosc') ? `a faint and sudden breathlessness, then a cardiac arrest — a pulse back after CPR and epinephrine, ${bp}` : `a faint and sudden breathlessness, ${bp}`;
      if (has(s, 'dest-near')) {
        return { say: [['hospital', `Copy: ${story}${f.length ? `, ${f.join(', ')}` : ''}. We can give a clot-dissolving drug here, but we have no cath lab, no ECMO and no cardiac surgeon — we will call the heart center for a transfer when she arrives.`]], flags: ['notified'] };
      }
      if (suspected) {
        return {
          say: [['hospital', `Copy: ${story}, ${f.join(', ')}. That sounds like a large clot in her lungs: we are calling the PE response team and opening the cath lab, with the ECMO team on standby. We'll meet you at the door.`]],
          flags: ['notified', 'notified-findings'],
        };
      }
      if (has(s, 'rosc')) return { say: [['hospital', `Copy: ${story}. The resuscitation team will meet you. What do you know about why she arrested?`]], flags: ['notified'] };
      return { say: [['hospital', `Copy: short of breath after a faint, ${bp}. We'll see her in the emergency department.`]], flags: ['notified'] };
    },
    // the hand-off ends the field care; the echo and the scan show what the crew suspected
    handoff: (s) => {
      if (!has(s, 'arrived') || !s.pulse) return null;
      return {
        say: [
          ['you', `SBAR hand-off: the sudden breathlessness and the faint, the surgery ten days ago and the swollen calf, the pressure, the full neck veins with clear lungs, the 12-lead${has(s, 'rosc') ? ', the PEA arrest and how long until ROSC' : ''}, what was given — and what was held.`],
          ['hospital', has(s, 'dest-pci')
            ? 'Bedside echo: a huge right ventricle squeezing a small left one. CT angiography: clot in both main pulmonary arteries. With an operation ten days ago, the PE response team takes her to the cath lab for catheter clot removal, ECMO on standby.'
            : 'Bedside echo: a huge right ventricle squeezing a small left one. With an operation ten days ago a clot-dissolving drug is a last resort here: the physician calls the heart center to take her for catheter clot removal.'],
        ],
        flags: ['handoff'],
      };
    },
  },
  events: [
    {
      // the EMT's intercept: the paramedic brings the IV and the vasopressor — or, in the arrest, the epinephrine
      id: 'als-arrives',
      when: (s) => s.role === 1 && has(s, 'als') && !has(s, 'arrived') && s.minute >= s.flags.als + ALS_MINUTES,
      effect: (s) => {
        const where = has(s, 'enroute') ? 'The medic unit meets you on the way; the paramedic climbs in' : 'The paramedic arrives';
        if (!s.pulse) return { say: [['team', `${where} and takes over the drugs: an IV, and epinephrine 1 mg in. "Keep the compressions going."`]], flags: ['iv', 'epi', 'als-here'] };
        const target = failing(s) || has(s, 'rosc') ? { sbp: 90, dbp: 56 } : { sbp: 98, dbp: 62 };
        const bp = { sbp: Math.max(s.vitals.sbp, target.sbp), dbp: Math.max(s.vitals.dbp, target.dbp) };
        // what the paramedic sees, not what it is: the EMT learns the likely cause from the physician who reads the 12-lead
        const lines: Line[] = [
          ['team', `${where}: an IV, and a norepinephrine infusion for her pressure. "No big fluid boluses for her — look at those neck veins: she has all the volume she needs."`],
          ['you', `BP ${bp.sbp}/${bp.dbp} on the infusion.`],
        ];
        if (has(s, 'cpap')) lines.push(['team', '"And no CPAP: her lungs are clear, and positive pressure drops a pressure this low."', 'warn']);
        // the intercept does not hold the ambulance on scene: nothing either crew carries fixes the cause
        if (!has(s, 'enroute')) lines.push(['team', '"Let\'s load her and go — nothing in our bags fixes this. I\'ll ride with you."']);
        return { say: lines, vitals: bp, flags: ['iv', 'pressor', 'als-here'] };
      },
    },
    {
      // the paramedic was already with her when she arrested: the EMT's compressions, the paramedic's drugs
      id: 'als-arrest-epi',
      when: (s) => s.role === 1 && has(s, 'als-here') && !s.pulse && !has(s, 'epi'),
      effect: () => ({ say: [['team', 'The paramedic: "Start compressions — I\'ll push the epinephrine." Epinephrine 1 mg IV, flushed.']], flags: ['epi'] }),
    },
    {
      // after ROSC the paramedic beside the EMT holds her pressure up, as the paramedic learner is expected to
      id: 'als-post-rosc-pressor',
      when: (s) => s.role === 1 && has(s, 'als-here') && s.pulse && has(s, 'rosc') && !has(s, 'pressor'),
      effect: (s) => {
        const bp = { sbp: Math.max(s.vitals.sbp, 90), dbp: Math.max(s.vitals.dbp, 56) };
        return { say: [['team', 'The paramedic starts a norepinephrine infusion: "Her pressure needs holding up — whatever stopped her heart is still there."'], ['you', `BP ${bp.sbp}/${bp.dbp} on the infusion.`]], vitals: bp, flags: ['pressor'] };
      },
    },
    // each push of push-dose epinephrine without an infusion behind it wears off
    ...Array.from({ length: MAX_PUSHES }, (_, i) => pushWearsOff(i + 1)),
    {
      // a liter of fluid, nitroglycerin, a long scene or no pressure support: the right ventricle starts to give out
      id: 'rv-fails',
      when: (s) => s.pulse && !has(s, 'rosc') && !has(s, 'arrived') && !failing(s) && (
        count(s, 'fluid') >= 2
        || has(s, 'nitro')
        || (onScene(s) && s.minute >= FAILS_ON_SCENE)
        || (!supported(s) && s.minute >= FAILS_UNSUPPORTED)),
      effect: (s) => {
        // worse, never better: a pressure already lower stays where it is
        const target = supported(s) ? { sbp: 88, dbp: 54 } : { sbp: 74, dbp: 46 };
        const sbp = Math.min(s.vitals.sbp, target.sbp);
        const dbp = Math.min(s.vitals.dbp, target.dbp);
        const hr = Math.min(150, Math.max(s.rhythm.hr, 136));
        const spo2 = Math.max(70, s.vitals.spo2 - 4);
        return {
          say: [
            ['patient', '"I\'m going to pass out… I can\'t get any air…"', 'bad'],
            ['partner', 'She is going gray and mottled, and her neck veins are bulging.', 'bad'],
            ...onMonitor(s, `Monitor alarm: heart rate ${hr}, SpO₂ ${spo2}%.`, 'bad'),
          ],
          vitals: { sbp, dbp, spo2, gcs: Math.min(s.vitals.gcs, 14), rr: Math.max(s.vitals.rr, 34) }, rhythm: atRate(s, hr), flags: ['rv-failing'],
        };
      },
    },
    {
      // the failing right ventricle stops: more fluid, more time on scene, or nothing holding the pressure up
      id: 'arrest',
      when: (s) => s.pulse && !has(s, 'rosc') && !has(s, 'arrived') && failing(s) && (
        count(s, 'fluid') >= 3
        || (onScene(s) && s.minute >= s.flags['rv-failing'] + ARREST_ON_SCENE)
        || (!supported(s) && s.minute >= s.flags['rv-failing'] + ARREST_UNSUPPORTED)),
      effect: (s) => ({
        say: [['partner', 'She\'s gone limp — not responding, not breathing normally!', 'bad'], ...onMonitor(s, 'Monitor alarm.', 'bad')],
        rhythm: { profile: 'pea-narrow', hr: 120 }, pulse: false, phase: 'arrest', vitals: { sbp: 0, dbp: 0, gcs: 3, rr: 0 }, flags: ['pe-arrest'],
      }),
    },
    {
      // the call ahead decides what is waiting at the door
      id: 'arrive-center',
      when: (s) => has(s, 'arrived') && has(s, 'dest-pci'),
      effect: (s) => ({
        say: [['hospital', has(s, 'notified-findings')
          ? 'Your call ahead set it up: the emergency physician, the PE response team and the ECMO team are waiting in the resuscitation bay, and the cath lab is open.'
          : has(s, 'notified')
            ? 'She goes to a resuscitation bay; the physician scans her heart before calling anyone else in.'
            : 'Nobody was expecting her: the team starts from the beginning.']],
      }),
    },
    {
      id: 'arrive-near',
      when: (s) => has(s, 'arrived') && has(s, 'dest-near'),
      effect: () => ({ say: [['hospital', 'The emergency physician: "We have no cath lab and no ECMO here, and with surgery ten days ago a clot-dissolving drug is a big bleeding risk. We are calling the heart center for a transfer."', 'warn']] }),
    },
  ],
  critical: [
    // the items a hint can name before the 12-lead is read say nothing about what it shows
    // a pressure taken in both arms is a pressure too
    { id: 'vitals', label: 'Vital signs', why: 'She fainted and is breathless: a pressure, a pulse and an SpO₂ first. Hers are 84/52, 124 and 86 %: she is in shock.', done: ['vitals', 'nibp', 'bp-both-arms'], points: 5, target: { by: 5 } },
    {
      id: 'oxygen', label: 'High-flow oxygen: non-rebreather mask', points: 10, target: { by: 5 }, done: ['o2-nrb'],
      why: 'An SpO₂ of 86 % needs oxygen now (aim for 90 % or more). A nasal cannula does not get her there; a non-rebreather at 15 L/min does.',
    },
    { id: 'als', label: 'Request a paramedic intercept', roles: [1], why: 'A low pressure needs an IV and a vasopressor, and she may arrest: call at once, and let the intercept meet you on the way.', done: ['als'], points: 10, target: { by: 5 } },
    {
      id: 'veins-lungs', label: 'Look at the neck veins and listen to the lungs', points: 10, target: { by: 10 },
      why: 'They tell the shocks apart: full neck veins with clear lungs is a right heart that is obstructed or failing (a clot in the lungs, a tamponade, a tension pneumothorax, a right ventricular infarct); flat veins point to lost volume, wet lungs to a failing left ventricle. Each needs different care.',
      done: (s) => (has(s, 'perfusion') && has(s, 'lungs') ? Math.max(s.flags.perfusion, s.flags.lungs) : null), uses: ['perfusion', 'lungs'],
    },
    {
      id: 'history', label: 'SAMPLE history: medicines, recent illness or surgery', points: 5, target: { by: 12 }, done: ['sample'],
      why: 'A fracture fixed with a plate and screws ten days ago, no weight on the leg since, the birth control pill and a swollen calf: the risk factors that make her shock a clot in the lungs — and major surgery this recent changes which hospital can treat it.',
    },
    {
      id: 'ecg', label: '12-lead ECG within 10 minutes', points: 10, target: { by: 10 }, done: ['ecg12'],
      why: 'Breathlessness, a faint and a low pressure need a 12-lead: it looks for a STEMI or an arrhythmia as the cause, and for strain on the right heart.',
    },
    { id: 'transmit', label: 'Transmit the 12-lead (you do not interpret it)', roles: [1], why: 'The physician reads it while you work and can tell you where she needs to go.', done: ['ecg-transmit'], points: 10, target: { by: 15 } },
    { id: 'iv', label: 'IV access', roles: [2], why: 'For the vasopressor — and for epinephrine if she arrests.', done: ['iv', 'io'], points: 5 },
    {
      id: 'pressor', label: 'Vasopressor for the low pressure: norepinephrine (push-dose epinephrine as a bridge)', roles: [2], points: 15, target: { by: 15 },
      done: ['pressor', 'push-epi'],
      why: 'A failing right ventricle lives on the aortic pressure that perfuses it: support it early with a vasopressor — norepinephrine to a MAP of 65 or more, or push-dose epinephrine repeated every few minutes while the infusion is set up (one push lasts only minutes) — not with liters of fluid.',
    },
    {
      id: 'transport', label: 'Leave the scene within 15 minutes', points: 15, target: { by: 15 },
      why: 'Nothing in the ambulance removes the clot: she needs a hospital that can — with surgery ten days ago, the regional heart center, where the team can take it out with a catheter or in the operating room and has ECMO if she arrests. Every minute on scene the right ventricle tires.',
      // a crew that loaded her during an arrest (a harm) is transporting her from the moment of ROSC, not before it
      done: (s) => {
        const at = s.performed.find((p) => p.id === 'transport-pci' || p.id === 'transport-near')?.minute;
        if (at === undefined) return null;
        const { arrest, rosc: back } = s.flags;
        if (arrest !== undefined && at >= arrest && (back === undefined || at < back)) return back ?? null;
        return at;
      },
      uses: ['transport-pci', 'transport-near'],
    },
    {
      id: 'notify', label: 'Early notification: radio report with what you found', points: 10, done: ['notify'], target: { within: { flag: 'enroute', minutes: 5 } },
      why: 'A call ahead with the faint, the pressure, the full neck veins and clear lungs and the recent surgery brings the PE response team, an open cath lab and the ECMO team to the door.',
    },
    // the arrest, if delay or fluid brings it
    {
      id: 'arrest-cpr', label: 'She arrests: high-quality CPR at once', points: 10, done: ['cpr'], after: 'arrest', target: { within: { flag: 'arrest', minutes: 1 } }, applies: (s) => has(s, 'arrest'),
      why: 'Unresponsive and not breathing normally: compressions at once, 100–120 a minute, 5–6 cm deep, full recoil, as few pauses as possible.',
    },
    { id: 'arrest-aed', label: 'AED on: let it analyze', roles: [1], points: 10, done: ['aed'], after: 'arrest', target: { within: { flag: 'arrest', minutes: 3 } }, applies: (s) => has(s, 'arrest'), why: 'It rules out a shockable rhythm; "no shock advised" means compressions again at once.' },
    {
      id: 'arrest-epi', label: 'Epinephrine 1 mg IV/IO as soon as possible', roles: [2], points: 10, target: { within: { flag: 'arrest', minutes: 5 } }, applies: (s) => has(s, 'arrest'),
      why: 'A non-shockable arrest: epinephrine 1 mg as soon as possible, then every 3–5 minutes — with a clot this size, the pressure it builds during CPR is what can push blood past it.',
      done: (s) => (s.flags.arrest === undefined ? null : s.performed.find((p) => p.id === 'epinephrine' && p.minute >= s.flags.arrest && p.minute < (s.flags.rosc ?? Infinity))?.minute ?? null),
      uses: ['epinephrine'],
    },
    {
      id: 'post-rosc-bp', label: 'After ROSC: hold her pressure up (MAP ≥ 65)', roles: [2], points: 10, applies: (s) => has(s, 'rosc'),
      why: 'The clot is still there, and her pressure after ROSC barely perfuses the right ventricle: a vasopressor (norepinephrine), not fluid.',
      // an infusion running from before the arrest goes on after it
      done: (s) => (s.flags.rosc === undefined ? null : has(s, 'pressor') && s.flags.pressor <= s.flags.rosc ? s.flags.rosc : firstDone(s, ['pressor', 'push-epi'], 'rosc')),
      uses: ['pressor', 'push-epi'],
    },
    { id: 'post-rosc-check', label: 'After ROSC: check her blood pressure', roles: [1], points: 5, done: ['vitals', 'nibp', 'bp-both-arms'], after: 'rosc', applies: (s) => has(s, 'rosc'), why: 'Measure it and report it: the paramedic treats a MAP under 65 mmHg.' },
    {
      // push-dose epinephrine starts the support, but one push lasts minutes: what counts at the door is a pressure still
      // held up (listed just before the hand-off: a hint names the first missing item, and this one waits for the door)
      id: 'pressure-held', label: 'Keep her pressure held up to the hand-off', roles: [2], points: 5,
      why: 'One push of push-dose epinephrine lasts only minutes: repeat it every few minutes, or run the norepinephrine infusion, so that her MAP stays at 65 or more all the way to the hand-off.',
      // only once a vasopressor was started (never starting one is the vasopressor item), and not after an arrest (the ROSC item)
      applies: (s) => !has(s, 'arrest') && (has(s, 'pressor') || count(s, 'push-epi') > 0),
      done: (s) => (has(s, 'handoff') && supported(s) ? s.flags.handoff : null),
      uses: ['pressor', 'push-epi'],
    },
    { id: 'handoff', label: 'Hand-off', why: 'Report the sudden onset and the faint, the surgery and the swollen calf, the pressures and the neck veins with clear lungs, the 12-lead, what was given — and what was held (fluid, nitroglycerin, CPAP).', done: ['handoff'], points: 5 },
  ],
  harms: yieldToHeavier([
    {
      // the built-in rule, same id (a deliberate exemption): a pressure that the infusion or a push in the last few minutes
      // is holding up is still obstructive shock — she falls back when it wears off — so keeping the pushes going is right
      // (a push on top of the running infusion too). Otherwise the built-in's own line
      id: 'pressor-no-hypotension', actions: ['pressor', 'push-epi'], when: (s, sc, id) => pressorNotLow(s, sc, id) && !supported(s), points: 3, severity: 'minor',
      text: 'A vasopressor or push-dose epinephrine without a low pressure. It only adds afterload, rate and oxygen demand for the heart: a pressor is for hypotension.',
    },
    {
      // one small bolus is tolerated; a second is beyond the 500 mL that cautious volume loading allows
      id: 'fluid-loading-pe', actions: ['fluid'], when: (s) => s.pulse && count(s, 'fluid') >= 1, points: 10, severity: 'major',
      text: 'More than 500 mL of fluid for a failing right ventricle. Full neck veins with clear lungs say her right heart is already overfilled: more volume stretches it further, pushes the septum into the left ventricle and empties it, and the pressure falls. One small bolus at most; support the pressure with a vasopressor (norepinephrine).',
    },
    {
      id: 'nitro-pe', actions: ['nitro', 'nitro-high', 'nitro-assist'], when: (s) => s.pulse, points: 15, severity: 'critical',
      replaces: NITRATE_RULES,
      text: 'Nitroglycerin for a patient in obstructive shock. Her chest pain is pleuritic, not ischemic, and a pressure-overloaded right ventricle lives on its preload: a venodilator takes it away and the pressure crashes, as it does in an RV infarct. No nitrates.',
    },
    {
      id: 'cpap-pe', actions: ['cpap'], when: (s) => s.pulse, replaces: ['cpap-hypotension', 'cpap-preload-dependent', 'cpap-vomiting', 'cpap-drowsy', 'cpap-no-indication'], points: 8, severity: 'major',
      text: 'CPAP with clear lungs and a low pressure. Positive pressure cuts the blood returning to the heart and raises the resistance the right ventricle pumps against: her pressure falls, and her saturation does not improve, because her lungs are not wet — the clot is the problem. High-flow oxygen, and keep her breathing on her own.',
    },
    {
      // the fast rate is her compensation, not an arrhythmia; it stands in for the low-pressure procainamide rule
      id: 'rate-control-pe', actions: ['metoprolol', 'diltiazem', 'amio-infusion', 'procainamide'], when: (s) => s.pulse, points: 10, severity: 'major',
      replaces: ['procainamide-hypotension', ...RATE_RULES],
      text: 'A drug to slow or convert her rhythm. Her sinus tachycardia is how a failing right ventricle keeps any output at all: beta-blockers, diltiazem, amiodarone and procainamide weaken the squeeze, drop the pressure and can bring on the arrest.',
    },
    {
      // magnesium is for torsades: here it only drops the pressure (the engine's default answer)
      id: 'no-arrhythmia-pe', actions: ['adenosine3', 'adenosine6', 'adenosine12', 'lidocaine', 'vagal', 'magnesium-sulfate'], when: (s) => s.pulse, replaces: [...LIDOCAINE_RULES, ...RATE_RULES, 'vagal-slow', 'magnesium-no-indication'], points: 3, severity: 'minor',
      text: 'A vagal maneuver, adenosine, lidocaine or magnesium for a fast rate that is not an arrhythmia. Hers is sinus tachycardia, the body\'s answer to a low pressure and low oxygen: nothing to break, and bearing down, a pause or a vasodilating drug cuts the output she has left.',
    },
    {
      id: 'sedation-pe', actions: ['sedation', 'midazolam'], when: (s) => s.pulse, points: 5, severity: 'major', replaces: SEDATIVE_RULES,
      text: 'Sedation for a patient in obstructive shock. Her fear and fast breathing come from the shock and the low oxygen: a sedative takes away the adrenaline that is holding her pressure up and slows her breathing. Oxygen, a vasopressor and calm reassurance.',
    },
    {
      id: 'opioid-hypotension', actions: ['fentanyl'], when: (s) => s.pulse && s.vitals.sbp < 90, points: 3, severity: 'minor',
      text: 'Fentanyl with a systolic under 90. An opioid blunts the drive that is holding her pressure up: support the pressure first, then a small dose for the pleuritic pain if she needs it.',
    },
    {
      id: 'epi-im-pe', actions: ['epi-im'], replaces: ['epi-im-no-anaphylaxis', 'epi-im-in-arrest'], points: 3, severity: 'minor',
      text: 'IM epinephrine without anaphylaxis. 0.3–0.5 mg IM is the anaphylaxis dose: it lifts the pressure for a few minutes and treats nothing she has. In the arrest the dose is 1 mg IV/IO, from ALS.',
    },
    {
      // the nearest department can give a clot-dissolving drug; for a patient about to arrest the closer door is fair, and so
      // it is for a BLS crew with no intercept coming: an unsupported patient in shock goes to the closest emergency department
      id: 'nearest-ed-pe', actions: ['transport-near'], when: (s) => s.pulse && !failing(s) && (s.role !== 1 || has(s, 'als')), points: 3, severity: 'minor',
      text: 'The nearest emergency department, with no cath lab, no ECMO and no cardiac surgeon. It can give a clot-dissolving drug, but with major surgery ten days ago that is a high bleeding risk: the heart center can take the clot out with a catheter or in the operating room, and a stop on the way adds a transfer of an hour or more.',
    },
    {
      id: 'antiarrhythmic-pea', actions: ['amio-arrest', 'amio-infusion', 'lidocaine', 'adenosine3', 'adenosine6', 'adenosine12', 'procainamide', 'metoprolol', 'diltiazem'],
      when: (s) => !s.pulse, points: 3, severity: 'minor', replaces: ['procainamide-in-arrest', ...LIDOCAINE_RULES, ...RATE_RULES, 'amiodarone-arrest-long-qt'],
      text: 'A rate or rhythm drug in PEA. Amiodarone and lidocaine are for VF or pulseless VT that shocks have not fixed; the others are for tachycardias with a pulse. CPR, epinephrine and the cause.',
    },
  ]),
  timings: [
    { label: 'High-flow oxygen', actions: ['o2-nrb'], target: 5 },
    { label: 'First 12-lead', actions: ['ecg12'], target: 10 },
    // the EMT's intercept starts it: the flag counts theirs
    { label: 'Vasopressor running', actions: ['pressor', 'push-epi'], flag: 'pressor', target: 15 },
    { label: 'Left the scene', actions: ['transport-pci', 'transport-near'], target: 15 },
    { label: 'Hospital notified', actions: ['notify'] },
    { label: 'CPR after the arrest', actions: ['cpr'], target: 1, from: 'arrest' },
  ],
  transportMinutes: 14,
  nearestMinutes: 8,
  arrival: 'You arrive; the emergency team meets you at the door.',
  teaching: [
    'Think of a clot in the lungs with sudden breathlessness, a faint, pleuritic chest pain, a fast rate and a low SpO₂ — above all with a risk factor: recent surgery or immobility, estrogen (the pill, pregnancy), cancer, a previous clot, a long trip, a swollen calf.',
    'Read the shock: full neck veins with clear lungs and a low pressure is obstructive shock — a large pulmonary embolism, tamponade or a tension pneumothorax (a right ventricular infarct looks the same). Flat veins point to lost volume; wet lungs to a failing left ventricle.',
    'The 12-lead: sinus tachycardia is the commonest finding; right heart strain (T inversion in V1–V4 and III, an incomplete or complete RBBB, a right axis, P pulmonale) supports it; S1Q3T3 is classic but insensitive, and a normal 12-lead does not rule it out. It does not meet STEMI criteria: no STEMI alert.',
    'Severity (2026 AHA/ACC acute PE guideline): her persistent hypotension with shock is Clinical Category E1; refractory shock or cardiac arrest is E2. Advanced therapy — systemic thrombolysis, catheter-directed therapy, mechanical thrombectomy or surgical embolectomy — is reasonable in E1, ECMO for refractory shock or arrest, and a PE response team should be involved for categories C–E.',
    'Support the right ventricle: high-flow oxygen to an SpO₂ of 90 % or more; a vasopressor early for the low pressure (norepinephrine to a MAP of 65 or more; push-dose epinephrine, repeated every few minutes, as a bridge). Full neck veins mean she is not short of volume: no routine fluid, and at most one small bolus (500 mL or less). Liters of fluid overdistend the right ventricle, push the septum into the left and lower the output.',
    'Avoid what takes away preload or adds pressure in the chest: no nitrates (her chest pain is pleuritic, and a pressure-overloaded right ventricle lives on its preload), no CPAP for clear lungs, and no sedation or intubation unless they cannot be avoided — positive pressure and induction drugs can collapse a failing right ventricle (if intubation is needed, the vasopressor runs first).',
    'Her sinus tachycardia is compensation: never slow it with a beta-blocker, diltiazem, amiodarone or procainamide.',
    'Destination: a center with a PE response team, catheter-based clot removal, ECMO and cardiac surgery. Major surgery within the last 3 weeks makes a systemic clot-dissolving drug a high bleeding risk, so catheter or surgical clot removal is preferred. Keep the scene time short, let an ALS intercept meet you on the way, and call ahead with the faint, the pressure, the neck veins and lungs and the recent surgery.',
    'If she arrests (Clinical Category E2): PEA, often narrow and fast at first — CPR, epinephrine 1 mg as soon as possible, and the Hs and Ts (thrombosis, pulmonary). 2025 AHA: systemic thrombolysis may be considered for an arrest from a suspected pulmonary embolism, and ECMO-supported CPR is reasonable where a center offers it — so tell the hospital early.',
    'EMTs: high-flow oxygen, let her sit the way she breathes best, measure the pressure, look at the neck veins and lungs, call the intercept, acquire and transmit the 12-lead, and go. CPAP is for wet lungs, not for this.',
  ],
};

