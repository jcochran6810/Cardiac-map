import type { Effect, Line, Scenario, ScenarioEvent, SimState } from '../types';
import { atRate, bpAfter, count, has, line } from '../kit';

/**
 * Cardiac tamponade from a malignant pericardial effusion, in the field. A 62-year-old man on chemotherapy for lung cancer
 * has been more and more breathless for five days, has barely eaten or drunk, and today nearly fainted getting up. Fluid
 * has built up slowly in the sac around his heart until it squeezes the right heart shut in diastole: a low pressure with a
 * narrow pulse pressure, a fast rate, distended neck veins, faint heart sounds (Beck's triad), a pulse that fades each time
 * he breathes in (pulsus paradoxus), dry lungs, and a 12-lead with low voltage and electrical alternans.
 *
 * The right care keeps blood coming back to the heart and gets him to the drain: let him sit up, oxygen by cannula or mask,
 * a fluid bolus (preload helps for now, most when the systolic is under 100), a vasopressor as a bridge if the pressure
 * keeps falling, a short scene time, the hospital that can drain it, and an early call. The traps are the usual answers for
 * a breathless man with chest heaviness: nitroglycerin, CPAP or a bag on a man who breathes on his own, an opioid or a
 * sedative, a drug to slow the "fast heart", and holding the fluid (2015 ESC pericardial guideline: vasodilators and
 * diuretics are not recommended in tamponade; Adler et al., Nat Rev Dis Primers 2023; Sagristà-Sauleda et al., Circulation
 * 2008). The effusion keeps building wherever he is: his pressure slides at minute 15 and again at 22 if he has had no fluid;
 * left on scene he crashes at 20 and arrests in PEA at 24, and anything that drops his systolic under 62 stops his heart.
 * Only a drain fixes it, so no resuscitation in the field brings him back.
 */

/** Minutes from the EMT's call until the paramedic intercept is at his side (or meets the ambulance on the way) */
const ALS_MINUTES = 6;

/** The effusion keeps building: his pressure slides again at this minute, wherever he is */
const WORSE_AT = 15;
/** ...and once more at this minute if no fluid has filled his heart */
const WORSE_DRY_AT = 22;
/** Still on scene: he crashes, then arrests */
const CRASH_AT = 20;
const ARREST_AT = 24;
/** A systolic under this, with the heart already squeezed, stops it: PEA */
const ARREST_SBP = 62;

/** Minutes a push of push-dose epinephrine holds the pressure: a bridge to the drain (or to an infusion), not a treatment */
const PUSH_LASTS = 6;
/** What one push adds; a push while the last one still acts brings the pressure back to where that one held it, no higher */
const PUSH_LIFT = { sbp: 12, dbp: 6 };
/**
 * The most a vasopressor lifts a heart that cannot fill: it tightens the vessels, but each beat still ejects only what the
 * squeezed ventricle took in, so no dose drives him to a normal pressure
 */
const PRESSOR_CEILING = { sbp: 108, dbp: 78 };
/** Pushes the case follows as each wears off (one event per push, since an event fires once): more than any crew gives */
const MAX_PUSHES = 12;

const onScene = (s: SimState) => !has(s, 'enroute') && !has(s, 'arrived');

/** The latest push of push-dose epinephrine, if any (in a responder: the one before the push being given) */
const lastPush = (s: SimState) => s.performed.filter((p) => p.id === 'push-epi').at(-1);

/**
 * mmHg the pushes still acting have added (kept in timers, the only numbers a case can store): it comes off when they wear
 * off. It can be more than one push's worth: a slide under a push that still acts is lost again when the push wears off
 */
const pushLift = (s: SimState) => ({ sbp: s.timers.pushLiftSbp ?? 0, dbp: s.timers.pushLiftDbp ?? 0 });

/** A push in the last few minutes still holds the pressure up (an infusion, once running, holds it instead) */
function pushActing(s: SimState): boolean {
  const push = lastPush(s);
  return !has(s, 'pressor') && push !== undefined && s.minute - push.minute <= PUSH_LASTS && pushLift(s).sbp > 0;
}

/** The push-dose epinephrine has worn off with no infusion behind it: what it added comes off again */
function pushWearsOff(n: number): ScenarioEvent {
  return {
    id: `push-wears-off-${n}`,
    when: (s) => {
      const push = lastPush(s);
      return s.pulse && count(s, 'push-epi') === n && !has(s, 'pressor') && push !== undefined && s.minute - push.minute > PUSH_LASTS && pushLift(s).sbp > 0;
    },
    effect: (s) => {
      const lift = pushLift(s);
      const bp = bpAfter(s, -lift.sbp, -lift.dbp);
      return {
        say: [['partner', 'The push-dose epinephrine has worn off: he is graying again, and his wrist pulse is fading.', 'warn'], bpCheck(bp, 'warn')],
        vitals: bp, timers: { pushLiftSbp: 0, pushLiftDbp: 0 },
      };
    },
  };
}

/** The monitor or the AED pads are on, so a change of rhythm sounds an alarm */
const ecgOn = (s: SimState) => has(s, 'monitor') || has(s, 'pads');

/** The rate after something changes it: the monitor shows it once it is on; otherwise the crew counts it at the wrist */
const rateLine = (s: SimState, hr: number, tone?: Line[2]): Line => (has(s, 'monitor') ? line('monitor', `Heart rate ${hr}.`, tone) : line('you', `Pulse ${hr}.`, tone));

/** The crew rechecks the pressure after anything that moves it */
const bpCheck = (bp: { sbp: number; dbp: number }, tone?: Line[2]): Line => line('you', `BP ${bp.sbp}/${bp.dbp}.`, tone);

/**
 * mmHg the systolic falls each time he breathes in (pulsus paradoxus), as a manual cuff finds it. It grows as the
 * effusion tightens; it can never be more than the gap down to the diastolic
 */
function pulsus(s: SimState): number {
  const want = has(s, 'crashing') ? 18 : has(s, 'worse') ? 16 : 14;
  return Math.min(want, s.vitals.sbp - s.vitals.dbp - 2);
}

/**
 * Anything that takes blood away from the heart's filling — a vasodilator, positive pressure in the chest, an opioid or a
 * sedative that blunts the drive holding his vessels tight, a drug that slows the rate his output depends on — drops a
 * pressure that has nothing in reserve. The drop is permanent for the case: he never gets back what it took
 */
function drop(s: SimState, dSbp: number, dDbp: number, dHr = 6) {
  const bp = bpAfter(s, -dSbp, -dDbp);
  const hr = Math.max(40, Math.min(150, s.rhythm.hr + dHr));
  return { bp, hr };
}

/** Nitroglycerin: no chest pain of the coronary kind to relieve, and it pools the blood his squeezed heart needs */
function nitroCrash(s: SimState, how: 'own' | 'standard' | 'high'): Effect | null {
  if (!s.pulse) return null;
  const { bp, hr } = how === 'high' ? drop(s, 20, 10) : drop(s, 14, 8);
  const given = how === 'own' ? 'He puts one of his own nitroglycerin tablets under his tongue.' : `Nitroglycerin ${how === 'high' ? '0.8' : '0.4'} mg sublingual.`;
  return {
    say: [['you', given], ['patient', '"Everything\'s going gray… I\'m going to pass out."', 'bad'], rateLine(s, hr, 'bad'), bpCheck(bp, 'bad')],
    vitals: { ...bp, gcs: Math.min(s.vitals.gcs, 14) }, rhythm: atRate(s, hr), flags: how === 'high' ? ['nitro', 'nitro-high'] : ['nitro'],
  };
}

/** An opioid or a sedative: nothing it treats, and it blunts the drive that holds his pressure up */
function sedativeDrop(s: SimState, given: string, flags: string[]): Effect | null {
  if (!s.pulse) return null;
  const { bp } = drop(s, 8, 4, 0);
  const rr = Math.max(14, s.vitals.rr - 2);
  return {
    say: [['you', given], ['patient', '"That doesn\'t help the breathing… I feel worse."', 'bad'], bpCheck(bp, 'bad')],
    vitals: { ...bp, rr, gcs: Math.min(s.vitals.gcs, 14) }, flags,
  };
}

/** A drug that slows the heart: the fast rate is what keeps a little output going through a heart that cannot fill */
function rateDrop(s: SimState, given: string, flag: string): Effect | null {
  if (!s.pulse) return null;
  const { bp, hr } = drop(s, 18, 10, -18);
  return {
    say: [['you', given], ['partner', 'He\'s gone gray — he\'s barely with us!', 'bad'], rateLine(s, hr, 'bad'), bpCheck(bp, 'bad')],
    vitals: { ...bp, gcs: Math.min(s.vitals.gcs, 13) }, rhythm: atRate(s, hr), flags: [flag],
  };
}

/**
 * The crew looked at his neck veins and felt his pulse while he still had one: the signs that point to the pericardium,
 * and what the hospital and medical control need to hear. Until then nobody on the phone can name the cause for them
 */
const foundSigns = (s: SimState) => has(s, 'perfusion') && s.flags.perfusion <= (s.flags.arrest ?? Infinity);

/** What the crew can tell the hospital they found, in the order they would say it */
function findings(s: SimState): string {
  const heard = has(s, 'lungs') && s.flags.lungs <= (s.flags.arrest ?? Infinity) ? ', faint heart sounds' : '';
  return `low pressure, full neck veins${heard} and a pulse that fades on breathing in`;
}

export const tamponadeField: Scenario = {
  id: 'tamponade-field',
  title: 'Sleeping in the recliner',
  summary: '62-year-old man on chemotherapy for lung cancer, more and more breathless for five days and now faint whenever he stands. Find out why his pressure is so low — and what would make it worse.',
  setting: 'field',
  roles: [1, 2],
  difficulty: 'advanced',
  conditionId: 'cardiac-tamponade',
  briefing: {
    default: [
      ['dispatch', 'Priority 1: 62-year-old man, difficulty breathing, nearly fainted. You are the ALS crew.'],
      ['scene', 'A ground-floor apartment. He is sitting bolt upright on the edge of the bed, leaning forward with his hands on his knees, pale and sweaty, breathing fast. His wife: "He\'s been more and more short of breath all week — he\'s slept in the recliner for three nights. Today he nearly passed out getting up to the bathroom."'],
      ['partner', 'Your partner, an EMT, has the stair chair and the oxygen; you have the monitor and the drug box.'],
      ['hospital', 'Regional heart center (cardiology, cath lab, cardiac surgery, ICU; his cancer center is in the same hospital): 12 minutes. Nearest emergency department (one physician; no cardiologist, no cath lab, no cardiac surgery): 7 minutes.'],
    ],
    1: [
      ['dispatch', 'Priority 1: 62-year-old man, difficulty breathing, nearly fainted. You are the BLS crew; a paramedic unit can meet you as an intercept if you ask for one.'],
      ['scene', 'A ground-floor apartment. He is sitting bolt upright on the edge of the bed, leaning forward with his hands on his knees, pale and sweaty, breathing fast. His wife: "He\'s been more and more short of breath all week — he\'s slept in the recliner for three nights. Today he nearly passed out getting up to the bathroom."'],
      ['partner', 'Your partner, an EMT, has the stair chair, the oxygen and the AED; the 12-lead monitor is in your bag.'],
      ['hospital', 'Regional heart center (cardiology, cath lab, cardiac surgery, ICU; his cancer center is in the same hospital): 12 minutes. Nearest emergency department (one physician; no cardiologist, no cath lab, no cardiac surgery): 7 minutes.'],
    ],
  },
  initial: {
    // the 'tamponade' profile: sinus tachycardia with low voltage and electrical alternans. 82/64: a narrow pulse pressure
    rhythm: { profile: 'tamponade', hr: 128 },
    vitals: { sbp: 82, dbp: 64, spo2: 90, rr: 26, etco2: 30, pain: 3, gcs: 15, glucose: 132, temp: 37.1 },
  },
  // what the built-in safety rules read (types.ts Problem)
  problems: ['tamponade'],
  facts: {
    opqrst: 'It\'s not really pain — a heavy, full feeling in the middle of my chest, 3 out of 10, for a few days. What gets me is the breathing: it has crept up all week, and I can\'t lie down at all — I have to sit up and lean forward. Today I stood up and everything went gray.',
    sample: 'No allergies. Lung cancer — in the right lung, found in the spring; chemotherapy every three weeks at the cancer center, the last one 10 days ago. A stent in my heart four years ago. Aspirin, a cholesterol pill, and a nausea pill for the chemo. I\'ve hardly eaten or drunk anything for three days. No fever. I used to smoke.',
    pde5: '"No, nothing like that."',
    ownNitro: 'A bottle of nitroglycerin 0.4 mg tablets from his cardiologist, refilled last year; he has not needed one since his stent.',
    // the heart sounds are heard with the stethoscope on the chest, as the lungs are
    lungs: (s) => (s.pulse
      ? 'Breathing fast, but the lungs are dry: no crackles, no wheezes. Breath sounds a little quieter at the right base, where his tumor is; air moves on both sides and the trachea is midline. With the stethoscope on his chest the heart sounds are faint and distant.'
      : 'Breath sounds on both sides with each squeeze of the bag; trachea midline.'),
    perfusion: (s) => {
      if (!s.pulse) return 'No pulse.';
      if (has(s, 'crashing')) return 'Gray, cold and mottled. The neck veins bulge up to the jaw. No radial pulse — only a faint, fast carotid.';
      return 'Pale, cool and clammy; capillary refill 4 seconds. The neck veins are distended up to the angle of the jaw, even sitting upright. The radial pulse is fast and weak, and it fades each time he breathes in. No leg swelling.';
    },
    neuro: (s) => (has(s, 'crashing') ? 'Opens his eyes only to a loud voice; mumbles.' : has(s, 'worse') ? 'Alert but slow to answer; no focal deficit.' : 'Alert and oriented; no focal deficit.'),
    // what the 'tamponade' profile draws: small complexes everywhere, alternating in height beat to beat
    ecg12: (s) => `Sinus tachycardia ${s.rhythm.hr} with low voltage (small QRS complexes in every limb lead) and electrical alternans: the height of the QRS alternates from beat to beat as the heart swings in a large pericardial effusion. No ST elevation: it does not meet STEMI criteria. With a low pressure, distended neck veins and faint heart sounds (Beck's triad) and a pulse that fades on breathing in (pulsus paradoxus), it points to cardiac tamponade.`,
  },
  status: (s) => {
    if (!s.pulse) return 'Unresponsive.';
    if (has(s, 'crashing')) return '"…" He barely opens his eyes to his name.';
    if (has(s, 'worse') && s.vitals.sbp < 90) return '"I feel like I\'m going to pass out… I can\'t get my breath."';
    if (s.vitals.sbp >= 90) return '"The dizziness is a bit better. I still can\'t get a full breath."';
    return '"I can\'t get my breath… and I feel faint."';
  },
  respond: {
    // the manual cuff hears what the NIBP cannot: the sounds come and go with his breathing (pulsus paradoxus)
    vitals: (s) => {
      if (!s.pulse) return null;
      const v = s.vitals;
      const p = pulsus(s);
      const sounds = p >= 8
        ? `the sounds come and go with his breathing: first heard at ${v.sbp}, but only while he breathes out; with every beat only from ${v.sbp - p} down — a ${p} mmHg fall each time he breathes in`
        : 'the sounds fade each time he breathes in';
      return { say: [['you', `BP ${v.sbp}/${v.dbp} by hand — ${sounds} · pulse ${s.rhythm.hr}, weak · RR ${v.rr} · SpO₂ ${v.spo2}%`]], flags: ['bp'] };
    },
    // the physician reads what was sent: no STEMI, and the small, alternating complexes — and puts them together with what
    // the crew has found so far (before the neck veins are checked, the physician asks for them)
    'ecg-transmit': (s) => {
      if (!has(s, 'ecg12')) return null;
      const read = 'ECG received. The physician: "No ST elevation — this is not a STEMI. The complexes are small, and they alternate in height from beat to beat.';
      return {
        say: [['hospital', foundSigns(s)
          ? `${read} With a low pressure and full neck veins in a man with lung cancer, that is fluid around his heart until proven otherwise. Keep him sitting up, no nitroglycerin, no CPAP — and bring him to us: our cardiologists can drain it."`
          : `${read} In a man with cancer and a low pressure that matters: look at his neck veins, listen to his heart, and call me back. Keep him sitting up, and no nitroglycerin and no CPAP with a pressure that low."`]],
        flags: ['transmitted'],
      };
    },
    'stemi-alert': (s) => (has(s, 'ecg12')
      ? { say: [['hospital', 'The interventional cardiologist reviews your 12-lead: no ST elevation — small complexes that alternate in height. The STEMI alert is not activated; call in your findings, and bring him to the emergency department.', 'warn']], flags: ['alert-declined'] }
      : null),
    // the cause, worked through against what the crew has found — and only that: before the neck veins, the heart sounds and
    // the lungs have been checked, the list says what would tell the causes apart
    'hs-ts': (s) => {
      const examined = foundSigns(s) && has(s, 'lungs') && s.flags.lungs <= (s.flags.arrest ?? Infinity);
      let text: string;
      if (s.pulse) {
        text = examined
          ? 'Shock with distended neck veins and dry lungs is obstructive until proven otherwise. Tension pneumothorax: air moves on both sides and the trachea is midline — no. Pulmonary embolism: possible with cancer — but faint heart sounds, a pulse that fades on breathing in and small, alternating complexes point to fluid around the heart. Hypovolemia adds to it: three days of hardly drinking. Tamponade fits best: keep the blood coming back to his heart and get him to the drain.'
          : 'Hs: hypoxia, hypovolemia, acidosis, potassium, hypothermia. Ts: tension pneumothorax, tamponade, toxins, thrombosis (coronary or pulmonary). Shock in a man with cancer: his neck veins, his heart sounds, both lungs and the trachea, and his pulse as he breathes in are what tell them apart.';
      } else {
        text = examined
          ? 'Hs and Ts: tamponade fits best — lung cancer, full neck veins, faint heart sounds and a pulse that faded on breathing in before he arrested. Hypovolemia adds to it. CPR, epinephrine and fluid cannot fill a heart squeezed shut: only a drain fixes it, and that is in hospital.'
          : 'Hs and Ts: a man with lung cancer, breathless and with a low pressure before he arrested — tamponade, a pulmonary embolism, hypovolemia and hypoxia are all possible, and nobody checked his neck veins or his heart sounds while he had a pulse. Work the arrest: CPR, epinephrine, fluid and oxygen.';
      }
      return { say: [['you', text]], flags: ['hs-ts'] };
    },
    // the heart only puts out what fills it: the first bolus fills it, the second a little, more only fills the sac's pressure
    fluid: (s) => {
      if (!s.pulse) return { say: [['you', '500 mL of saline running wide open; compressions go on.']], flags: ['fluid'] };
      const before = s.counts.fluid ?? 0;
      if (before >= 2) {
        return { say: [['you', 'Another bolus in.'], ['partner', 'His neck veins are even fuller — and his pressure hasn\'t moved.', 'warn'], bpCheck(s.vitals)], flags: ['fluid'] };
      }
      const bp = before === 0 ? bpAfter(s, 10, 4) : bpAfter(s, 6, 3);
      const hr = Math.max(110, s.rhythm.hr - 4);
      return { say: [['you', '500 mL saline bolus running in through a pressure bag.'], rateLine(s, hr), bpCheck(bp, 'good')], vitals: bp, rhythm: atRate(s, hr), flags: ['fluid'] };
    },
    // a bridge to the drain: his own adrenaline is already working flat out, so the gain is real but small, it lasts a few
    // minutes (PUSH_LASTS) unless an infusion takes over, and pushes in a row hold the pressure rather than stack it
    'push-epi': (s) => {
      if (!s.pulse) return { say: [['you', 'Push-dose epinephrine, 10–20 mcg — a dose for a low pressure with a pulse. In cardiac arrest the dose is 1 mg IV/IO.', 'warn']], flags: ['push-epi'] };
      const acting = pushActing(s);
      const raised = bpAfter(s, PUSH_LIFT.sbp, PUSH_LIFT.dbp, PRESSOR_CEILING);
      const peak = { sbp: s.timers.pushPeakSbp ?? raised.sbp, dbp: s.timers.pushPeakDbp ?? raised.dbp };
      const bp = acting
        ? { sbp: Math.max(s.vitals.sbp, Math.min(raised.sbp, peak.sbp)), dbp: Math.max(s.vitals.dbp, Math.min(raised.dbp, peak.dbp)) }
        : raised;
      const hr = Math.min(150, s.rhythm.hr + (bp.sbp > s.vitals.sbp ? 6 : 2));
      const before = acting ? pushLift(s) : { sbp: 0, dbp: 0 };
      // with the infusion running it holds whatever the push adds; otherwise the push's share comes off when it wears off
      const timers = has(s, 'pressor')
        ? undefined
        : {
          pushLiftSbp: before.sbp + bp.sbp - s.vitals.sbp, pushLiftDbp: before.dbp + bp.dbp - s.vitals.dbp,
          pushPeakSbp: acting ? peak.sbp : bp.sbp, pushPeakDbp: acting ? peak.dbp : bp.dbp,
        };
      const holds: Line = has(s, 'pressor')
        ? ['partner', 'The drip will hold that.']
        : ['partner', bp.sbp > s.vitals.sbp ? 'That buys a few minutes — it wears off.' : 'No higher than the last push got him: it only holds him there for a few minutes.'];
      return {
        say: [['you', 'Push-dose epinephrine 20 mcg IV, flushed.'], rateLine(s, hr), bpCheck(bp), holds],
        vitals: bp, rhythm: atRate(s, hr), flags: ['push-epi'], ...(timers ? { timers } : {}),
      };
    },
    // an infusion holds what it raises (and takes over from a push still acting)
    pressor: (s) => {
      if (!s.pulse) return null;
      const bp = bpAfter(s, 14, 8, PRESSOR_CEILING);
      const hr = Math.min(150, s.rhythm.hr + 4);
      return {
        say: [['you', 'Norepinephrine infusion running, titrated to a MAP of 65.'], rateLine(s, hr), bpCheck(bp)],
        vitals: bp, rhythm: atRate(s, hr), flags: ['pressor'], timers: { pushLiftSbp: 0, pushLiftDbp: 0 },
      };
    },
    'nitro-assist': (s) => nitroCrash(s, 'own'),
    nitro: (s) => nitroCrash(s, 'standard'),
    'nitro-high': (s) => nitroCrash(s, 'high'),
    // positive pressure in the chest pushes back against the blood trying to reach his right heart
    cpap: (s) => {
      if (!s.pulse) return { blocked: true, say: [['system', 'CPAP supports breaths a patient takes: in cardiac arrest it moves no air. Bag-mask at 30:2.']] };
      const { bp, hr } = drop(s, 10, 6);
      return {
        say: [['you', 'CPAP mask on at 5 cmH₂O.'], ['patient', '"I can\'t… I\'m blacking out—"', 'bad'], ['partner', 'He\'s going gray — I\'m taking it off!', 'bad'], rateLine(s, hr, 'bad'), bpCheck(bp, 'bad')],
        vitals: { ...bp, gcs: Math.min(s.vitals.gcs, 14) }, rhythm: atRate(s, hr), flags: ['cpap'],
      };
    },
    bvm: (s) => {
      if (!s.pulse || s.vitals.gcs <= 8) return null;
      const { bp } = drop(s, 6, 4, 0);
      return {
        say: [['patient', 'He fights the mask, gasping: "Let me breathe!" — the few squeezes that got in turn him gray.', 'bad'], bpCheck(bp, 'bad')],
        vitals: bp,
      };
    },
    // he cannot lie down: flat, he cannot breathe (and the fluid bolus, not his legs, is how the paramedic fills his heart)
    'legs-up': (s) => {
      if (!s.pulse) return null;
      const spo2 = Math.max(80, s.vitals.spo2 - 3);
      return {
        say: [['patient', 'Laid flat with his legs raised, he gasps and fights to sit up: "I can\'t breathe lying down!"', 'bad'], ['partner', 'Sitting him back up.'], ...(has(s, 'monitor') ? [line('monitor', `SpO₂ ${spo2}%.`)] : [])],
        vitals: { spo2 }, flags: ['legs-up'],
      };
    },
    fentanyl: (s) => sedativeDrop(s, 'Fentanyl 50 mcg IV.', ['analgesia']),
    sedation: (s) => sedativeDrop(s, 'Sedation given.', ['sedation']),
    midazolam: (s) => sedativeDrop(s, has(s, 'iv') ? 'Midazolam 2.5 mg IV.' : 'Midazolam 5 mg IM.', ['benzodiazepine', 'sedation']),
    metoprolol: (s) => rateDrop(s, 'Metoprolol 5 mg IV.', 'beta-blocker'),
    diltiazem: (s) => rateDrop(s, 'Diltiazem IV.', 'diltiazem'),
    'amio-infusion': (s) => {
      if (!s.pulse) return null;
      const { bp } = drop(s, 10, 6, 0);
      return { say: [['you', 'Amiodarone 150 mg running over 10 minutes.'], bpCheck(bp, 'bad')], vitals: bp, flags: ['amiodarone'] };
    },
    procainamide: (s) => {
      if (!s.pulse) return null;
      const { bp } = drop(s, 10, 6, 0);
      return { say: [['you', 'Procainamide running at 30 mg/min.'], bpCheck(bp, 'bad')], vitals: bp, flags: ['procainamide'] };
    },
    // bearing down raises the pressure in his chest and cuts the blood coming back to the heart
    vagal: (s) => {
      if (!s.pulse) return { blocked: true, say: [['system', 'A vagal maneuver needs an awake patient who can bear down.']] };
      const { bp } = drop(s, 6, 4, 0);
      return { say: [['patient', 'He bears down — and nearly blacks out.', 'bad'], bpCheck(bp, 'bad')], vitals: bp, flags: ['vagal'] };
    },
    'epi-im': (s) => {
      if (!s.pulse) return null;
      const bp = bpAfter(s, 6, 2, PRESSOR_CEILING);
      const hr = Math.min(150, s.rhythm.hr + 6);
      return { say: [['you', 'Epinephrine 0.5 mg IM, lateral thigh.'], rateLine(s, hr), bpCheck(bp)], vitals: bp, rhythm: atRate(s, hr), flags: ['epi-im'] };
    },
    // medical control backs the plan, and in the arrest decides whether he moves with CPR: the cause can only be fixed in hospital
    // (what the physician on the line can say rests on what the crew reports: before the neck veins have been checked, it is
    // a request for them, not a diagnosis)
    'med-control': (s) => {
      // the drugs in the arrest are the paramedic's: the learner's own, or the EMT's intercept once it is there
      const drugs = s.role === 2 || has(s, 'als-here') ? 'Keep up the compressions and the epinephrine, give him fluid' : 'Keep up the compressions until your intercept brings the drugs';
      if (!s.pulse && !foundSigns(s)) {
        return {
          say: [['hospital', `Medical control: "Work the arrest where you are. ${drugs}, and go through the Hs and Ts. With nothing from before he went down — his neck veins, his heart sounds — nothing yet points to a cause only a hospital can fix: keep working him there, and call me back with any change."`, 'warn']],
          flags: ['med-control'],
        };
      }
      if (!s.pulse) {
        // already on the way, the order is to keep going; on scene, it is the move a hospital-only cause justifies
        return {
          say: [['hospital', has(s, 'enroute')
            ? `Medical control: "With what you found before he arrested, this is fluid around his heart — something only a hospital can drain. ${drugs}, and keep going with continuous compressions; I will tell them you are coming in with CPR in progress."`
            : `Medical control: "With what you found before he arrested, this is fluid around his heart — something only a hospital can drain. ${drugs}, and load him with continuous compressions — a mechanical CPR device if you have one. Go to the nearest emergency department; they will have the needle and the ultrasound ready."`, 'warn']],
          flags: ['med-control', 'transport-ordered'],
        };
      }
      if (!foundSigns(s)) {
        const intercept = s.role === 1 && !has(s, 'als') ? ' Request a paramedic intercept now, and let it meet you on the way.' : '';
        return {
          say: [['hospital', `Medical control: "A low pressure and short of breath in a man with lung cancer — tell me more: his neck veins, his heart sounds and his lungs, and how his pulse feels when he breathes in. No nitroglycerin with a pressure that low, and keep him sitting up.${intercept} Call me back."`]],
          flags: ['med-control'],
        };
      }
      const intercept = has(s, 'als') ? 'Don\'t wait on scene for your intercept: let it meet you on the way' : 'Request a paramedic intercept now and let it meet you on the way — he needs an IV and fluid';
      return {
        say: [['hospital', s.role === 1
          ? `Medical control: "Keep him sitting up, oxygen, and no nitroglycerin and no CPAP — he needs every bit of blood coming back to his heart. ${intercept}, and take him to the heart center, where they can drain the fluid around his heart. Call them now."`
          : 'Medical control: "Agreed — fluid around his heart until proven otherwise. Keep him sitting up. A 500 mL bolus, and reassess; no nitroglycerin, no CPAP, no opioids. If his systolic falls under 90 after the fluid, push-dose epinephrine 10 to 20 mcg or a norepinephrine infusion. Go to the heart center — the cardiologists drain it there — and call them now."']],
        flags: ['med-control'],
      };
    },
    // the early call: what the crew found decides what is waiting for him
    notify: (s) => {
      if (!s.pulse) {
        return foundSigns(s)
          ? { say: [['hospital', 'Copy: cardiac arrest in a man with lung cancer, full neck veins before he went down. The resuscitation bay is ready, with the ultrasound and the pericardiocentesis tray.']], flags: ['notified', 'notified-findings'] }
          : { say: [['hospital', 'Copy: cardiac arrest in a man with lung cancer. The resuscitation bay is ready for you.']], flags: ['notified'] };
      }
      if (!foundSigns(s)) return { say: [['hospital', `Copy: short of breath, blood pressure ${s.vitals.sbp}/${s.vitals.dbp}. We'll see him in the emergency department.`]], flags: ['notified'] };
      const ecg = has(s, 'transmitted') || (s.role !== 1 && has(s, 'ecg12')) ? ', and small, alternating complexes on the 12-lead' : '';
      return {
        say: [['hospital', has(s, 'dest-near')
          ? `Copy: ${findings(s)}, in a man with lung cancer${ecg}. We have no cardiologist here: we will scan him at the door and call the heart center to drain it.`
          : `Copy: ${findings(s)}, in a man with lung cancer${ecg}. The cardiologist and the echo will meet you in the resuscitation bay, and the cath lab is setting up to drain his pericardium.`]],
        flags: ['notified', 'notified-findings'],
      };
    },
    // the hand-off ends the field care; the scan at the door shows what the crew suspected
    handoff: (s) => {
      if (!has(s, 'arrived') || !s.pulse) return null;
      return {
        say: [
          ['you', 'SBAR hand-off: five days of breathlessness in a man with lung cancer, the low pressure with a narrow pulse pressure, the neck veins, the faint heart sounds, the pulse that fades on breathing in, the 12-lead, what was given and what was held, and how he changed.'],
          ['hospital', has(s, 'dest-pci')
            ? 'Bedside echo at the door: a large pericardial effusion all around the heart, the right ventricle collapsing as it tries to fill. In the cath lab the cardiologist drains 700 mL of blood-stained fluid through a needle under echo and fluoroscopy; his pressure rises to 118/74 as it drains, and a drain stays in.'
            : 'The emergency physician\'s bedside ultrasound shows a large pericardial effusion squeezing the right heart. With no cardiologist here, she calls the heart center for a transfer — and keeps the needle ready at the bedside in case he arrests.'],
        ],
        flags: ['handoff'],
      };
    },
  },
  events: [
    {
      // the effusion keeps building wherever he is: the pressure slides again, and the fluid given so far only softens it
      id: 'worse',
      when: (s) => s.pulse && !has(s, 'arrived') && s.minute >= WORSE_AT,
      effect: (s) => {
        const bp = bpAfter(s, -12, -6);
        const hr = Math.min(150, s.rhythm.hr + 8);
        // what the partner feels follows the pressure he is left with (an infusion can still hold it over 90)
        const felt = bp.sbp < 90 ? 'He\'s going gray again and slow to answer me — his wrist pulse is barely there.' : 'He\'s grayer again and slower to answer me — his pulse is weaker than it was.';
        return {
          say: [['partner', felt, 'bad'], rateLine(s, hr, 'bad')],
          vitals: { ...bp, gcs: Math.min(s.vitals.gcs, 14), rr: Math.min(34, s.vitals.rr + 2), spo2: Math.max(80, s.vitals.spo2 - 1) },
          rhythm: atRate(s, hr), flags: ['worse'],
        };
      },
    },
    {
      // a heart that was never given fluid has nothing left to fill with: the pressure slides once more
      id: 'worse-dry',
      when: (s) => s.pulse && !has(s, 'arrived') && !has(s, 'fluid') && s.minute >= WORSE_DRY_AT,
      effect: (s) => {
        const bp = bpAfter(s, -10, -6);
        return {
          say: [['partner', 'He\'s drifting off — I can hardly feel a pulse at his wrist.', 'bad']],
          vitals: { ...bp, gcs: Math.min(s.vitals.gcs, 13) }, flags: ['worse-dry'],
        };
      },
    },
    {
      // still on scene: the squeeze wins — barely rousable, no radial pulse
      id: 'crash',
      when: (s) => s.pulse && onScene(s) && s.minute >= CRASH_AT,
      effect: (s) => {
        const sbp = Math.max(ARREST_SBP, Math.min(s.vitals.sbp - 8, 68));
        const dbp = Math.max(40, Math.min(s.vitals.dbp - 6, sbp - 10, 56));
        const hr = Math.min(150, s.rhythm.hr + 6);
        return {
          say: [['partner', 'He\'s slumping in the chair — he only opens his eyes when I shout his name.', 'bad'], rateLine(s, hr, 'bad')],
          vitals: { sbp, dbp, gcs: 11, rr: 32, spo2: Math.max(78, s.vitals.spo2 - 3) }, rhythm: atRate(s, hr), flags: ['crashing'],
        };
      },
    },
    {
      // the heart can no longer fill at all: organized complexes, no pulse (PEA). Left on scene, or tipped over by something
      // that took his last reserve of pressure
      id: 'arrest',
      when: (s) => s.pulse && (s.vitals.sbp < ARREST_SBP || (onScene(s) && s.minute >= ARREST_AT)),
      effect: (s) => ({
        say: [['partner', 'He\'s gone limp — not responding, not breathing normally!', 'bad'], ...(ecgOn(s) ? [line('monitor', 'Monitor alarm.', 'bad')] : [])],
        rhythm: { profile: 'pea', hr: 104 }, pulse: false, phase: 'arrest', vitals: { sbp: 0, dbp: 0, gcs: 3, rr: 0 }, flags: ['arrested'],
      }),
    },
    {
      // the EMT's intercept: the paramedic takes over the IV and the fluid (and the arrest drugs, if it comes to that)
      id: 'als-arrives',
      when: (s) => s.role === 1 && has(s, 'als') && !has(s, 'arrived') && s.minute >= s.flags.als + ALS_MINUTES,
      effect: (s) => {
        const where = has(s, 'enroute') ? 'The medic unit meets you on the way; the paramedic climbs in' : 'The paramedic arrives';
        if (!s.pulse) return { say: [['team', `${where} and takes over the drugs: an IO, epinephrine 1 mg. "Keep the compressions going."`]], flags: ['iv', 'epi', 'als-here'] };
        const bp = bpAfter(s, 10, 4);
        const lines: Line[] = [['team', `${where}: an IV, and a 500 mL saline bolus for his pressure. "Keep him sitting up."`], bpCheck(bp)];
        if (has(s, 'nitro') || has(s, 'cpap')) lines.push(['team', '"No more nitro and no CPAP for him — he needs every bit of blood coming back to his heart."', 'warn']);
        return { say: lines, vitals: bp, flags: ['iv', 'fluid', 'als-here'] };
      },
    },
    {
      // the intercept was already there when he arrested: the paramedic runs the drugs while the EMT crew compresses
      id: 'als-arrest-drugs',
      when: (s) => s.role === 1 && !s.pulse && has(s, 'als-here') && s.flags['als-here'] <= s.flags.arrest,
      effect: () => ({ say: [['team', 'The paramedic runs the drugs: epinephrine 1 mg IV, every 3–5 minutes, and the fluid wide open. "Keep the compressions going."']], flags: ['epi'] }),
    },
    {
      // the intercept bridges the falling pressure to the hospital
      id: 'als-pressor',
      when: (s) => s.role === 1 && s.pulse && has(s, 'als-here') && has(s, 'worse') && s.vitals.sbp < 90,
      effect: (s) => {
        const bp = bpAfter(s, 12, 6, PRESSOR_CEILING);
        return { say: [['team', `"His systolic is down to ${s.vitals.sbp}." The paramedic gives push-dose epinephrine 20 mcg, then starts a norepinephrine drip.`], bpCheck(bp)], vitals: bp, flags: ['push-epi', 'pressor'] };
      },
    },
    {
      // the call ahead decides what is waiting at the door
      id: 'arrive-center',
      when: (s) => has(s, 'arrived') && has(s, 'dest-pci'),
      effect: (s) => ({
        say: [['hospital', has(s, 'notified-findings')
          ? 'Your call ahead set it up: the cardiologist and the echo machine are waiting in the resuscitation bay.'
          : has(s, 'notified')
            ? 'He goes to a regular bay; the physician listens to his chest and looks at his neck veins before calling for the echo.'
            : 'Nobody was expecting him: the team starts his workup from the beginning.']],
      }),
    },
    {
      id: 'arrive-near',
      when: (s) => has(s, 'arrived') && has(s, 'dest-near'),
      // in the arrest the emergency physician's needle is the closest drain (what medical control sent him there for)
      effect: (s) => ({
        say: [['hospital', s.pulse
          ? 'The emergency physician: "We have no cardiologist here — whatever he needs, it will likely mean a transfer to the heart center."'
          : 'The emergency physician is waiting with the ultrasound and a long needle: "Keep compressing — let me see his heart."', s.pulse ? 'warn' : 'info']],
      }),
    },
    // each push of push-dose epinephrine wears off after a few minutes unless an infusion has taken over
    ...Array.from({ length: MAX_PUSHES }, (_, i) => pushWearsOff(i + 1)),
  ],
  critical: [
    {
      // the monitor's cuff counts too; only a manual one finds the pulsus, which the why teaches
      id: 'vitals', label: 'Vital signs, with a blood pressure', points: 5, target: { by: 4 }, done: ['vitals', 'nibp'],
      why: 'His pressure is 82/64: low, with a narrow pulse pressure. A manual cuff also finds the pulsus paradoxus — the sounds that come and go with his breathing — which the monitor\'s cuff cannot.',
    },
    {
      id: 'beck', label: 'Look for the cause of the low pressure: neck veins, heart sounds and lungs', points: 10, target: { by: 8 },
      why: 'Distended neck veins, faint heart sounds and a low pressure are Beck\'s triad; with dry lungs and a pulse that fades on breathing in, the shock is obstructive — the heart cannot fill — not the wet lungs of a failing pump or the flat neck veins of blood loss.',
      // while he still has a pulse: after the arrest there are no neck veins or heart sounds left to find
      done: (s) => {
        const before = s.flags.arrest ?? Infinity;
        return has(s, 'perfusion') && has(s, 'lungs') && s.flags.perfusion <= before && s.flags.lungs <= before ? Math.max(s.flags.perfusion, s.flags.lungs) : null;
      },
      uses: ['perfusion', 'lungs'],
    },
    {
      id: 'history', label: 'SAMPLE history', points: 5, target: { by: 8 }, done: ['sample'],
      why: 'Lung cancer on chemotherapy: cancer is one of the commonest causes of a large pericardial effusion, and cancers of the lung and breast and lymphoma are the commonest behind a malignant one. Three days of hardly drinking is what tipped him over.',
    },
    {
      id: 'oxygen', label: 'Oxygen by cannula or mask', points: 5, target: { by: 6 }, done: ['o2-nc', 'o2-nrb'],
      why: 'He is breathless with an SpO₂ of 90 %: titrate oxygen to 94–98 % by nasal cannula or mask — not by positive pressure, which squeezes the blood out of his chest.',
    },
    { id: 'als', label: 'Request a paramedic intercept', roles: [1], points: 10, target: { by: 5 }, done: ['als'], why: 'He needs IV fluid, and may need a vasopressor, on the way: ask at once — the intercept meets you, never wait on scene for it.' },
    {
      id: 'ecg', label: '12-lead ECG within 10 minutes', points: 10, target: { by: 10 }, done: ['ecg12'],
      why: 'It rules out a STEMI behind his chest heaviness, and shows what a large effusion does to the tracing: low voltage and electrical alternans. EMTs acquire and transmit it.',
    },
    { id: 'transmit', label: 'Transmit the 12-lead (you do not interpret it)', roles: [1], points: 5, target: { by: 12 }, done: ['ecg-transmit'], why: 'The physician reads it, keeps the cath lab down for a tracing with no STEMI, and hears what you found.' },
    { id: 'iv', label: 'IV access', roles: [2], points: 5, done: ['iv', 'io'], why: 'For the fluid bolus, and a vasopressor if the pressure keeps falling.' },
    {
      id: 'fluid', label: 'A fluid bolus: preload holds him up until the drain', roles: [2], points: 15, target: { by: 12 }, done: ['fluid'],
      why: 'The squeezed heart only puts out what fills it. A 500 mL bolus raised the output in about half of patients with tamponade and lowered it in nearly a third; a systolic under 100 predicted who would gain (Sagristà-Sauleda, Circulation 2008) — and he is dry as well. Give 250–500 mL and reassess after each: liters only raise the pressure in the sac.',
    },
    {
      id: 'destination', label: 'Transport, with a short scene, to the hospital that can drain it', points: 15, target: { by: 12 },
      why: 'Only draining the fluid fixes tamponade: an echo-guided needle (with fluoroscopy, often the choice in cancer) or a surgical window. The heart center\'s cardiologists drain it and his cancer team is there, 5 minutes further; the nearest emergency department has no cardiologist and would have to transfer him — it is the place to go only once he is crashing or in arrest, when a physician\'s needle at the bedside is the closest drain. Keep the scene short: the effusion keeps building wherever he is.',
      // while he perfuses, the heart center; once he is barely rousable, the nearest department, when minutes decide it; in the
      // arrest, only the move medical control ordered (to the nearest department). Loading him in the arrest without that order
      // is a mistake, and earns nothing here
      done: (s) => {
        const arrestAt = s.flags.arrest ?? Infinity;
        const ordered = s.flags['transport-ordered'] ?? Infinity;
        const center = s.performed.find((p) => p.id === 'transport-pci');
        if (center && center.minute < arrestAt) return center.minute;
        const near = s.performed.find((p) => p.id === 'transport-near');
        if (!near) return null;
        const dire = near.minute < arrestAt ? s.flags.crashing ?? Infinity : ordered;
        return dire <= near.minute ? near.minute : null;
      },
      uses: ['transport-pci', 'transport-near'],
    },
    {
      id: 'notify', label: 'Early notification: radio report with what you found', points: 10, done: ['notify'], target: { within: { flag: 'enroute', minutes: 5 } },
      why: 'A call ahead with the low pressure, the neck veins, the faint heart sounds, the pulsus and the 12-lead puts the echo and the cardiologist at the door and the cath lab setting up to drain it.',
    },
    {
      id: 'pressor', label: 'When the pressure falls again: push-dose epinephrine or a norepinephrine infusion', roles: [2], points: 10,
      applies: (s) => has(s, 'worse'), target: { within: { flag: 'worse', minutes: 6 } },
      why: 'The effusion keeps building, and fluid alone cannot keep up. A vasopressor is a bridge, not a cure — his own adrenaline is already working flat out — but it buys the minutes to the drain.',
      // an infusion started earlier is still running when he slides; a push-dose given earlier has worn off
      done: (s) => {
        const from = s.flags.worse;
        if (from === undefined) return null;
        if (s.performed.some((p) => p.id === 'pressor' && p.minute < from)) return from;
        return s.performed.find((p) => (p.id === 'push-epi' || p.id === 'pressor') && p.minute >= from)?.minute ?? null;
      },
      uses: ['push-epi', 'pressor'],
    },
    { id: 'handoff', label: 'Hand-off', points: 5, done: ['handoff'], why: 'Report the story, the low pressure and its narrow pulse pressure, Beck\'s triad and the pulsus, the 12-lead, what was given and what was held (nitroglycerin, CPAP), and how he responded.' },
  ],
  harms: [
    {
      id: 'nitro-tamponade', actions: ['nitro', 'nitro-assist', 'nitro-high'], when: (s) => s.pulse, points: 10, severity: 'major',
      // whatever his pressure: after a bolus his systolic can be over 90, and nitroglycerin is still wrong for him
      replaces: ['nitro-hypotension', 'nitro-high-not-hypertensive'],
      text: 'Nitroglycerin for a man whose heart cannot fill. A vasodilator pools the blood in the veins, and a heart squeezed by fluid lives on the blood coming back to it: the pressure crashes. Vasodilators and diuretics are contraindicated in tamponade (2015 ESC pericardial guideline). His chest heaviness is the effusion, not a blocked artery — and even after fluid his pressure has nothing in reserve.',
    },
    {
      id: 'cpap-tamponade', actions: ['cpap'], when: (s) => s.pulse, replaces: ['cpap-hypotension', 'cpap-preload-dependent', 'cpap-vomiting', 'cpap-drowsy', 'cpap-no-indication'], points: 8, severity: 'major',
      text: 'CPAP for a man in tamponade. Positive pressure in the chest pushes back against the blood returning to his already squeezed right heart: the output falls and it can bring on PEA. His breathlessness is from a heart that cannot fill, not wet lungs (they are dry): oxygen by cannula or mask, sitting up.',
    },
    {
      id: 'bvm-breathing', actions: ['bvm'], when: (s) => s.pulse && s.vitals.gcs > 8, points: 5, severity: 'major',
      text: 'Bag-mask breaths for a man who is breathing on his own. He fights it, and every squeeze raises the pressure in his chest and cuts the blood returning to a heart that cannot fill. Give oxygen by mask; if breaths must ever be given, give small, gentle ones.',
    },
    {
      id: 'rate-slowing-tamponade', actions: ['metoprolol', 'diltiazem'], when: (s) => s.pulse, points: 15, severity: 'critical',
      text: 'A drug to slow his heart. His fast rate is the only thing keeping his output up while each beat fills so little: a beta-blocker or diltiazem takes it away and drops the pressure, and can stop his heart. A sinus tachycardia in shock is never the problem to treat.',
    },
    {
      id: 'antiarrhythmic-tamponade', actions: ['amio-infusion', 'procainamide'], when: (s) => s.pulse, points: 8, severity: 'major', replaces: ['procainamide-hypotension'],
      text: 'An antiarrhythmic for a sinus tachycardia. There is no arrhythmia to convert — the fast rate is his compensation — and amiodarone and procainamide drop a pressure that has nothing in reserve.',
    },
    {
      id: 'adenosine-sinus', actions: ['adenosine6', 'adenosine12'], when: (s) => s.pulse, points: 3, severity: 'minor',
      text: 'Adenosine for a sinus tachycardia. It only stops a rhythm whose circuit runs through the AV node: this one comes from the sinus node, driven by shock, and the pause it brings does nothing for him.',
    },
    {
      id: 'sedative-tamponade', actions: ['fentanyl', 'sedation', 'midazolam'], when: (s) => s.pulse, points: 5, severity: 'major', replaces: ['midazolam-unsafe'],
      text: 'An opioid or a sedative in obstructive shock. His heaviness is the effusion, not pain that needs an opioid, and his own adrenaline is what keeps his vessels tight and his pressure up: an opioid or a sedative blunts it and slows his breathing.',
    },
    {
      id: 'legs-up-orthopnea', actions: ['legs-up'], when: (s) => s.pulse, points: 2, severity: 'minor',
      text: 'Laying him flat with his legs up. He cannot breathe lying down: let him sit up, leaning forward, as he wants to. For a paramedic, a fluid bolus is the way to fill his heart.',
    },
    {
      id: 'vagal-tamponade', actions: ['vagal'], when: (s) => s.pulse, points: 2, severity: 'minor',
      text: 'A vagal maneuver for a sinus tachycardia in shock. Bearing down raises the pressure in his chest and cuts the blood returning to a heart that cannot fill, and there is no reentry circuit to break.',
    },
    {
      id: 'epi-im-no-anaphylaxis', actions: ['epi-im'], when: (s) => s.pulse, points: 3, severity: 'minor',
      text: 'IM epinephrine without anaphylaxis. 0.3–0.5 mg in the thigh is the anaphylaxis dose; for a low pressure in shock the paramedic gives fluid, then push-dose epinephrine or an infusion IV, which can be titrated.',
    },
    {
      // the same id as the built-in rule: the 2025 AHA keeps an arrest on scene unless a special circumstance needs a move —
      // a heart only a hospital can drain is one, and medical control decides it
      id: 'transport-in-arrest', actions: ['transport-near', 'transport-pci'], when: (s) => !s.pulse && !has(s, 'transport-ordered'), points: 6, severity: 'major',
      text: 'Loading him in cardiac arrest without medical direction. Compressions on a stretcher and in a moving ambulance are poorer, so the arrest is worked on scene for most adults (2025 AHA). His cause — fluid squeezing his heart — can only be drained in hospital: call medical control, and move him with CPR on their order.',
    },
  ],
  timings: [
    { label: 'Blood pressure by hand or on the monitor', actions: ['vitals', 'nibp'], target: 4 },
    { label: 'Neck veins and pulses checked', actions: ['perfusion'], target: 8 },
    { label: 'First 12-lead', actions: ['ecg12'], target: 10 },
    // the EMT's intercept gives it: the flag counts theirs
    { label: 'Fluid bolus', actions: ['fluid'], flag: 'fluid', target: 12 },
    { label: 'Left the scene', actions: ['transport-pci', 'transport-near'], target: 12 },
    { label: 'Hospital notified', actions: ['notify'] },
  ],
  transportMinutes: 12,
  nearestMinutes: 7,
  arrival: 'You arrive; the emergency team meets you at the door.',
  teaching: [
    'Cardiac tamponade is fluid in the sac around the heart under enough pressure to stop the chambers filling — obstructive shock. A slow effusion (cancer, kidney failure, hypothyroidism, after pericarditis) can stretch the sac to a liter or more before it tips over; a fast one (trauma, a dissection, a perforation in the cath lab) can do it with 100–200 mL. Dehydration, vasodilators and IV diuretics can tip a large effusion into tamponade.',
    'Lung and breast cancer and lymphoma are the commonest causes of a malignant effusion: think of it in any cancer patient who is breathless, cannot lie flat, and has a low pressure with a fast pulse.',
    'Beck\'s triad: a low pressure (with a narrow pulse pressure), distended neck veins and faint, distant heart sounds — often incomplete. Add tachycardia, breathlessness and orthopnea with dry lungs, and a pulsus paradoxus: a fall of more than 10 mmHg in systolic pressure as he breathes in. With a manual cuff, note where the sounds first appear (only on breathing out) and where they are heard with every beat; the difference is the pulsus. You may feel it as a radial pulse that fades on each breath in.',
    'Shock with full neck veins and dry lungs is obstructive until proven otherwise: tamponade, tension pneumothorax (unequal breath sounds, a shifted trachea) or a massive pulmonary embolism (cancer raises the risk). Faint heart sounds, the pulsus and the 12-lead point to the pericardium; an RV infarct is the other cause of full neck veins with clear lungs.',
    'The 12-lead: sinus tachycardia, low voltage and electrical alternans — QRS complexes that alternate in height as the heart swings in a large effusion. Alternans of the P, QRS and T together is highly specific. Pericarditis as the cause adds diffuse ST elevation and PR depression.',
    'Keep the blood coming back to the heart: let him sit up as he wants to, oxygen by cannula or mask, and (ALS) a 250–500 mL fluid bolus, then reassess — 500 mL raised the output in about half of patients, mostly those with a systolic under 100, and lowered it in nearly a third (Sagristà-Sauleda, Circulation 2008). Liters only raise the pressure in the sac.',
    'Hold what takes preload or drive away: nitroglycerin and other vasodilators, diuretics (both contraindicated in tamponade: 2015 ESC), opioids and sedatives, and any drug that slows the heart — the tachycardia is the compensation. Positive pressure (CPAP, bagging a patient who breathes, intubation) cuts the blood returning to the right heart and can bring on PEA: avoid it if at all possible, and if breaths must be given, keep them small and gentle.',
    'A vasopressor (push-dose epinephrine 10–20 mcg, or norepinephrine to a MAP of 65) is a bridge when the pressure keeps falling: the patient\'s own adrenaline is already working flat out, so it buys minutes, not a cure. A push lasts only a few minutes: repeat it, or start an infusion to hold the pressure to the drain.',
    'Only draining the fluid fixes it: an echo-guided pericardiocentesis (fluoroscopy helps in a malignant effusion, so it is often done in the cath lab) or a surgical window (Adler et al., Nat Rev Dis Primers 2023). Keep the scene short, go to the hospital that can drain it, and call ahead with Beck\'s triad, the pulsus and the 12-lead so the echo and the cardiologist are waiting.',
    'Tamponade is one of the Ts of PEA: narrow, fast complexes with no pulse favor a mechanical cause. CPR, epinephrine and fluid cannot fill a heart squeezed shut — the arrest needs a drain. Work it on scene, and call medical control: moving a patient with CPR to a hospital that can drain it is their decision.',
    'EMT: recognize it (the low pressure, the neck veins, the faint heart sounds, the pulse that fades on breathing in), keep him sitting up, oxygen by cannula or mask, no nitroglycerin and no CPAP, an ALS intercept that meets you on the way, a 12-lead transmitted, and a fast transport with an early call.',
  ],
};
