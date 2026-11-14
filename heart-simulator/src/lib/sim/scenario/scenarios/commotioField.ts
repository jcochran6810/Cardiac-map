import type { Effect, Line, Scenario, SimState } from '../types';
import { ARREST_ETCO2, arrestEtco2, bpAfter, firstDone, has, interpret, line, mapOf, ventilated } from '../kit';

/**
 * Minutes after the crew reaches him (he collapsed about 5 minutes before, with the coach's CPR since) within which the
 * first shock still finds VF that one shock stops. Survival from commotio cordis falls steeply with the time to the shock
 * (US Commotio Cordis Registry: 40 % with resuscitation in under 3 minutes, 5 % after; Maron et al., Heart Rhythm 2013)
 */
const EARLY_SHOCK = 3;

/** Minutes from the EMT's call until the paramedic intercept is at his side */
const ALS_MINUTES = 6;

/**
 * Minutes a heart that a shock has just converted can go without compressions before it fibrillates again: right after
 * the shock it is stunned, beats without a pulse, and needs the blood flow CPR gives it (2025 AHA: CPR at once after the shock)
 */
const STUNNED_MINUTES = 2;

/** Minutes after ROSC before the partner, left to bag him alone in the excitement, speeds up to about 30 breaths a minute */
const BAG_UNGUIDED = 1.5;

/** His vitals at ROSC: a young heart, stunned after the arrest — the pressure is low, he breathes 8 times a minute */
const AT_ROSC = { sbp: 86, dbp: 50, rr: 8, etco2: 44, gcs: 6 };

/** Shocks delivered to VF so far (an AED that advises no shock, or a shock on an organized rhythm, is not one) */
const vfShocks = (s: SimState) => s.timers.vfShocks ?? 0;

/** Of those, the shocks that each came after a CPR cycle (or were the first): a stacked shock adds nothing to the next one */
const spacedShocks = (s: SimState) => s.timers.vfSpaced ?? 0;

/** The monitor or the pads are on, so a change of rhythm sounds an alarm */
const ecgOn = (s: SimState) => has(s, 'monitor') || has(s, 'pads');

/** 2-minute CPR cycles started since the first shock */
const cyclesSinceShock = (s: SimState) => (s.flags.shocked === undefined ? 0 : s.performed.filter((p) => p.id === 'cpr' && p.minute >= s.flags.shocked).length);

/** A shock was delivered and no CPR cycle has started since: the next thing it needs is compressions, not a check */
function shockPending(s: SimState): boolean {
  const last = s.timers.lastShockAt;
  if (last === undefined) return false;
  // the stunned heart has fibrillated again since: that is new VF, and shocking it is right
  if (s.flags.refib !== undefined && s.flags.refib >= last) return false;
  return !s.performed.some((p) => p.id === 'cpr' && p.minute >= last);
}

/**
 * Nobody is on his chest: the coach stood clear for the shock and waits to be told, so after a shock only the crew's own
 * CPR cycle compresses. Lines that would say "compressions go on" say so only while someone is compressing
 */
const handsOff = (s: SimState) => s.timers.lastShockAt !== undefined && !s.performed.some((p) => p.id === 'cpr' && p.minute >= s.timers.lastShockAt);

/**
 * Epinephrine is not yet due: no shock has failed and fewer than two shocks have gone into VF. The algorithm gives it in the
 * CPR after the second shock — whether that shock met VF that persisted or VF that came back, which the crew cannot tell
 * apart until the next rhythm check
 */
const epiNotYet = (s: SimState) => !has(s, 'refractory') && vfShocks(s) < 2;

/**
 * An antiarrhythmic is not yet due: no shock has failed and the VF has not come back. Amiodarone and lidocaine are for VF
 * that persists or recurs after a shock (ALPS enrolled both after at least one shock)
 */
const antiarrhythmicNotYet = (s: SimState) => !has(s, 'refractory') && !has(s, 'refib');

/** Minutes since the learner's last dose of arrest epinephrine, or null (judged before this dose is recorded) */
function sinceLastEpi(s: SimState): number | null {
  const last = s.performed.filter((p) => p.id === 'epinephrine').at(-1);
  return last ? s.minute - last.minute : null;
}

/**
 * The minute the crew took his breaths in hand after ROSC, or null: an airway placed during the arrest goes on being used
 * from the moment of ROSC; otherwise the bag (or an airway) after it
 */
function ventAfterRosc(s: SimState): number | null {
  if (s.flags.rosc === undefined) return null;
  if (has(s, 'airway') && s.flags.airway <= s.flags.rosc) return s.flags.rosc;
  return firstDone(s, ['bvm', 'airway'], 'rosc');
}

/** The partner is bagging him too fast after ROSC and nobody has slowed it down yet */
const overBagged = (s: SimState) => s.pulse && has(s, 'hyperventilated') && ventAfterRosc(s) === null;

/**
 * His EtCO₂ during the arrest follows the shared rule (arrestEtco2) with this action's flags added: almost nothing until
 * someone gives him a breath (the coach's compressions move no air to measure), then the blood flow the CPR makes
 */
const etco2With = (s: SimState, ...flags: string[]) => arrestEtco2({ flags: { ...s.flags, ...Object.fromEntries(flags.map((f) => [f, s.minute])) } });

/**
 * Whether this shock stops the VF (`n`: the shocks to VF so far that each came after a CPR cycle, this one included).
 * Early, one shock does — and so for VF that came back after a shock that worked, if it is shocked as early. Once the VF
 * has outlasted the first minutes it needs what refractory VF needs: CPR between the shocks, epinephrine, an
 * antiarrhythmic — or, without the drugs, many more shocks. Stacked shocks do not count: they gain nothing over the one before
 */
function converts(s: SimState, n: number): boolean {
  // no shock has failed yet: one shock still stops VF that is only minutes old — the first VF, counted from the crew's
  // arrival, or VF that came back after a shock that worked, counted from when it came back. Left unshocked longer, either
  // becomes VF that outlasts the shocks
  if (!has(s, 'refractory')) return s.minute - (s.flags.refib ?? 0) <= EARLY_SHOCK;
  if (n < 3 || cyclesSinceShock(s) < 2) return false;
  return n >= 5 || (has(s, 'epi') && (has(s, 'amiodarone') || has(s, 'lidocaine') || n >= 4));
}

/**
 * A shock into VF, from the AED or the manual defibrillator. The line is the same whether it worked or not: the trace on
 * the monitor is the learner's to read, and the AED tells the EMT at its next analysis, after 2 minutes of CPR
 */
function shockOutcome(s: SimState, how: 'aed' | 'defib'): Effect | null {
  if (s.pulse || s.rhythm.profile !== 'vf') return null;
  const n = vfShocks(s) + 1;
  const say: Line[] = [];
  if (n === 1) {
    // the pads may already be on (the 'pads' action): then only the analysis or the charge is left. Whoever compresses
    // keeps going: the coach, or the crew once it has taken over
    const pushing = has(s, 'cpr') ? 'compressions go on' : 'the coach keeps pushing';
    const pads = has(s, 'pads') ? `Pads already on; ${pushing}` : `Pads on his bare chest while ${pushing}`;
    say.push(['you', how === 'aed' ? `${pads}; everyone clear for the analysis.` : `${pads}; charged to 200 J; everyone clear.`]);
  }
  say.push(how === 'aed' ? ['monitor', 'AED: "Shock advised." Shock delivered. Resume CPR.'] : ['monitor', 'Shock delivered: 200 J. Resume CPR immediately.']);
  const flags = ['pads', 'monitor', 'shocked'];
  const spaced = spacedShocks(s) + (shockPending(s) ? 0 : 1);
  const timers = { vfShocks: n, vfSpaced: spaced };
  // the VF stops: organized complexes from a stunned heart that does not make a pulse yet
  if (converts(s, spaced)) return { say, rhythm: { profile: 'pea', hr: 56 }, flags: [...flags, 'converted'], timers };
  return { say, flags: [...flags, 'refractory', ...(has(s, 'refractory') ? ['refractory2'] : [])], timers };
}

/** The CPR cycle after the shock that stopped the VF: the stunned heart takes over and makes a pulse */
function rosc(s: SimState): Effect {
  // an advanced airway placed during the arrest: the crew goes on ventilating through it, 10 breaths a minute
  const tubed = has(s, 'airway');
  const bagged = has(s, 'ventilated');
  const etco2 = has(s, 'capno') ? ` EtCO₂ jumps to ${AT_ROSC.etco2} mmHg.` : '';
  return {
    say: [
      // a carotid pulse, not a strong one: his pressure is 86/50
      ['you', interpret(s)
        ? `Rhythm check after 2 minutes of compressions, then a pulse check: a carotid pulse — ROSC.${etco2}`
        : 'After 2 minutes of compressions the AED analyzes: "No shock advised." Pulse check: a carotid pulse — ROSC.', 'good'],
      tubed
        ? line('you', 'Still ventilating through the airway, 1 breath every 6 seconds.')
        : line('partner', bagged ? 'He breathes only every 7 or 8 seconds on his own — I\'ll keep bagging him.' : 'He takes a gasp every 7 or 8 seconds — I\'ve got the bag on him.', 'warn'),
    ],
    rhythm: { profile: 'sinus-tachycardia', hr: 118 }, pulse: true, phase: 'rosc',
    vitals: { sbp: AT_ROSC.sbp, dbp: AT_ROSC.dbp, spo2: tubed ? 96 : bagged ? 94 : 90, rr: tubed ? 10 : AT_ROSC.rr, etco2: tubed ? 40 : AT_ROSC.etco2, gcs: AT_ROSC.gcs, pain: 0 },
    // through an airway placed in the arrest his breaths are in hand from this minute (the review's times read the flag)
    flags: ['cpr', ...(tubed ? ['breaths-in-hand'] : [])],
  };
}

/**
 * The crew takes his breaths in hand after ROSC: 1 breath every 6 seconds. If the partner was already bagging him too fast,
 * slowing down brings the EtCO₂ back up, and the pressure the high chest pressure had pushed down comes back
 */
function controlledBreaths(s: SimState, text: { calm: string; fast: string }, flags: string[]): Effect {
  const fast = overBagged(s);
  const etco2 = fast ? 38 : 40;
  const bp = fast ? bpAfter(s, 8, 6, { sbp: AT_ROSC.sbp + 20, dbp: AT_ROSC.dbp + 14 }) : { sbp: s.vitals.sbp, dbp: s.vitals.dbp };
  return {
    say: [
      ['you', fast ? text.fast : text.calm],
      ['monitor', `SpO₂ 97%.${has(s, 'capno') || flags.includes('capno') ? ` EtCO₂ ${etco2} mmHg.` : ''}`],
    ],
    vitals: { ...bp, spo2: 97, rr: 10, etco2 }, flags,
  };
}

/** A drug with no role in his arrest, pushed during it: the compressions carry it, but it has nothing to treat */
const noRoleInArrest = (what: string, flag: string): Effect => ({ say: [['you', `${what} pushed — it has no place in his arrest, and nothing changes on the monitor.`]], flags: [flag] });

// dispatched as an injury, then upgraded en route: why the EMT's BLS unit is there with no paramedic unit behind it
const DISPATCH: Line = ['dispatch', 'University baseball field, dispatched as a sports injury: 19-year-old man struck in the chest by a ball. Update en route, now Priority 1: he is unresponsive, and the caller says the coach is doing CPR.'];
const SCENE: Line = ['scene', 'Play has stopped and the players are back by the dugout. The pitcher lies on his back beside the mound. The head coach is pushing on his chest — fast but shallow, and tiring. "A line drive hit him square in the chest. He took a step and went down — five minutes ago, maybe." A baseball-sized red mark sits just left of his breastbone. Someone in the dugout shouts: "Don\'t move his neck — he got hit hard!"'];
const HOSPITALS: Line = ['hospital', 'Regional heart center (cardiac arrest center: cath lab, cardiac ICU, temperature control): 12 minutes. Nearest emergency department (a small community hospital: no cath lab, no ICU that takes post-arrest patients): 6 minutes.'];

export const commotioField: Scenario = {
  id: 'commotio-cordis-field',
  title: 'Line drive to the chest',
  summary: '19-year-old college pitcher struck in the chest by a line drive collapses on the mound; his coach is doing CPR. Run the arrest, and the care after it.',
  setting: 'field',
  roles: [1, 2],
  difficulty: 'intermediate',
  conditionId: 'ventricular-fibrillation',
  briefing: {
    default: [
      DISPATCH, SCENE,
      ['partner', 'Your partner, an EMT, has the bag-valve mask and the airway kit; you have the monitor-defibrillator and the drug box. No other unit is on its way.'],
      HOSPITALS,
    ],
    1: [
      DISPATCH, SCENE,
      ['partner', 'Your partner, an EMT, has the AED and the airway bag. Your BLS unit is first on scene: dispatched as a sports injury, no paramedic unit has been sent — the upgrade did not add one.'],
      HOSPITALS,
    ],
  },
  initial: {
    rhythm: { profile: 'vf', hr: 0 }, pulse: false, phase: 'arrest',
    // the coach's compressions only so far: no one has given him a breath, so there is nothing for a capnograph to measure
    vitals: { sbp: 0, dbp: 0, spo2: 82, rr: 0, etco2: ARREST_ETCO2.noBreaths, pain: 0, gcs: 3, glucose: 112, temp: 36.8 },
  },
  facts: {
    lungs: (s) => {
      if (s.pulse) return 'Clear and equal on both sides with each breath. The chest wall is stable: no crackling under the skin, nothing moves the wrong way.';
      if (!has(s, 'ventilated')) return 'Nothing to hear: no one has given him a breath yet. The chest wall is stable; the trachea is midline.';
      return 'Equal chest rise and equal breath sounds with each breath; the chest wall is stable — no sign of a collapsed lung.';
    },
    perfusion: (s) => (s.pulse
      ? 'Pale, but his color is coming back; radial pulse weak and fast; capillary refill 3 seconds. A round red mark over the left chest; no other injury.'
      : 'Pale-gray and mottled; no pulses. A round red mark the size of a baseball over the left chest, just left of the breastbone; the ribs and breastbone are intact. No other injury, no bleeding.'),
    neuro: (s) => (s.pulse
      ? 'Eyes do not open, no words; he withdraws from pain. Pupils equal and reactive. No bump, cut or bleeding on the head.'
      : 'Unresponsive. No bump, cut or bleeding on the head; no blood or fluid from the ears or nose.'),
    ecg12: (s) => `Sinus tachycardia ${s.rhythm.hr}: normal axis, a normal PR, a narrow QRS and a normal QT; no ST elevation, no delta wave, no Brugada pattern and no voltage for LVH. A normal tracing apart from the rate is what commotio cordis leaves — a structurally and electrically normal heart, stopped by the timing of the blow. The hospital still looks for what can mimic it: a long QT, a Brugada pattern, pre-excitation, a cardiomyopathy.`,
  },
  status: (s) => {
    // a reassessment is not a CPR cycle (only those count), so it must not say that compressions go on — and after a shock
    // the coach has stood clear, waiting to be told
    if (!s.pulse) {
      if (handsOff(s)) return 'Unresponsive, no pulse; nobody has been on his chest since the shock.';
      return has(s, 'cpr') ? 'Unresponsive, no pulse.' : 'Unresponsive, no pulse; the coach is still doing compressions.';
    }
    if (overBagged(s)) return 'Unresponsive; your partner is bagging him fast, about 30 breaths a minute.';
    return ventAfterRosc(s) !== null ? 'Unresponsive; withdraws from pain; ventilated at 10/min.' : `Unresponsive, breathing only ${s.vitals.rr} times a minute on his own.`;
  },
  respond: {
    // the coach answers for him
    opqrst: () => ({
      say: [['scene', 'The coach: "He was pitching. A line drive came straight back and hit him in the chest, left of the breastbone. He took a step toward the ball and dropped — on his side, on the grass; he didn\'t hit his head on anything. He felt fine before: no chest pain, nothing."']],
      flags: ['opqrst'],
    }),
    sample: () => ({
      say: [['scene', 'The coach: "He\'s healthy — a sophomore, no medical problems I know of, no medicines, no allergies. He passed his preseason physical. Never passed out before. Nobody in his family died young, as far as I know."']],
      flags: ['sample'],
    }),
    defib: (s) => shockOutcome(s, 'defib'),
    aed: (s) => shockOutcome(s, 'aed'),
    // compressions after the shock that stopped the VF are what bring him back; on VF they buy time until the next shock
    cpr: (s) => {
      if (s.pulse) return null;
      if (s.rhythm.profile === 'pea') return rosc(s);
      // the coach compresses only until the first shock: after it the compressions are the crew's
      const who = has(s, 'cpr') ? '' : has(s, 'shocked') ? 'Back on his chest: ' : 'You take over from the coach: ';
      return {
        say: [['you', `${who}2 minutes of compressions: 100–120/min, 5–6 cm, full recoil, minimal pauses.`]],
        vitals: { etco2: etco2With(s, 'cpr') }, flags: ['cpr'],
      };
    },
    'pulse-check': (s) => (s.pulse ? null : { say: [['you', 'No carotid pulse (checked for less than 10 seconds).', 'bad']], flags: ['pulseless-confirmed'] }),
    bvm: (s) => {
      if (!s.pulse) {
        // 30:2 only while someone compresses: after a shock with no CPR since, the breaths go in with nobody on his chest
        const breaths = has(s, 'airway')
          ? 'Ventilating through the airway, 1 breath every 6 seconds; chest rising.'
          : handsOff(s)
            ? 'Bag-mask with oxygen: 2 breaths, each over 1 second; chest rising — but nobody is on his chest.'
            : 'Bag-mask with oxygen: 2 breaths, each over 1 second, after every 30 compressions; chest rising.';
        return { say: [['you', breaths]], vitals: { etco2: etco2With(s, 'ventilated') }, flags: ['ventilated'] };
      }
      if (s.vitals.gcs > 8) return null;
      return controlledBreaths(s, {
        calm: 'You take charge of the bag: 1 breath every 6 seconds, each over 1 second, just enough to see the chest rise.',
        fast: 'You take the bag from your partner and slow it down: 1 breath every 6 seconds, each over 1 second, just enough to see the chest rise.',
      }, ['ventilated']);
    },
    // placed in the arrest or after ROSC, the airway is then used to ventilate him, as the bag would be
    airway: (s) => {
      if (!s.pulse) {
        const compressing = handsOff(s) ? 'with nobody on his chest since the shock' : 'while compressions go on';
        return {
          say: [['you', `Supraglottic airway placed ${compressing}; confirmed with waveform capnography. Ventilating through it, 1 breath every 6 seconds.`]],
          vitals: { etco2: etco2With(s, 'airway', 'ventilated') }, flags: ['airway', 'ventilated', 'capno'],
        };
      }
      if (s.vitals.gcs > 8) return null;
      return controlledBreaths(s, {
        calm: 'Airway placed; confirmed with waveform capnography. Ventilating through it, 1 breath every 6 seconds.',
        fast: 'Airway placed; confirmed with waveform capnography. Ventilating through it at 1 breath every 6 seconds — not the 30 a minute your partner was giving.',
      }, ['airway', 'ventilated', 'capno']);
    },
    // capnography measures CPR quality once there are breaths to measure, shows ROSC, and after it the ventilation
    capno: (s) => {
      if (s.pulse) {
        return {
          say: [['monitor', overBagged(s) ? `EtCO₂ ${s.vitals.etco2} mmHg, ${s.vitals.rr} breaths a minute.` : `EtCO₂ ${s.vitals.etco2} mmHg.`, overBagged(s) ? 'bad' : 'info']],
          flags: ['capno'],
        };
      }
      const etco2 = arrestEtco2(s);
      if (!has(s, 'ventilated')) {
        return {
          say: [['monitor', `EtCO₂ ${etco2} mmHg: almost no waveform.`], ['you', 'Nobody has given him a breath yet: with no breaths there is nothing breathed out to measure, however good the compressions.']],
          vitals: { etco2 }, flags: ['capno'],
        };
      }
      // with nobody on his chest since the shock there is no blood flow to carry CO₂ to the lungs
      if (handsOff(s)) {
        return {
          say: [['monitor', `EtCO₂ ${ARREST_ETCO2.noFlow} mmHg.`], ['you', 'Nobody has been on his chest since the shock: no compressions, no blood flow to measure.', 'warn']],
          vitals: { etco2: ARREST_ETCO2.noFlow }, flags: ['capno'],
        };
      }
      return {
        say: [['monitor', has(s, 'cpr') ? `EtCO₂ ${etco2} mmHg during compressions.` : `EtCO₂ ${etco2} mmHg: the coach's compressions are moving too little blood.`]],
        vitals: { etco2 }, flags: ['capno'],
      };
    },
    // a mask or a cannula offers oxygen only to someone who breathes; after ROSC he breathes 8 times a minute
    'o2-nrb': (s) => {
      if (!s.pulse) return { say: [['you', 'Non-rebreather on at 15 L/min — but he is not breathing, and a mask only offers oxygen to someone who is.']], flags: ['o2'] };
      if (s.vitals.gcs > 8) return null;
      if (ventAfterRosc(s) !== null) return { say: [['you', 'He is already being bagged on 15 L/min: a mask on top adds nothing.']] };
      return { say: [['you', 'He breathes only 8 times a minute: a mask alone will not ventilate him. Your partner keeps the bag on him.']], flags: ['o2'] };
    },
    'o2-nc': (s) => {
      if (!s.pulse) return { say: [['you', 'Nasal cannula on — but he is not breathing, and a cannula only offers oxygen to someone who is.']], flags: ['o2'] };
      if (s.vitals.gcs > 8) return null;
      return { say: [['you', 'A cannula does not ventilate a patient who breathes 8 times a minute. Your partner keeps the bag on him.']], flags: ['o2'] };
    },
    // CPAP supports breaths a patient takes; it gives none
    cpap: (s) => {
      if (s.pulse && s.vitals.gcs > 8) return null;
      return {
        say: [['you', s.pulse
          ? 'CPAP mask on — but he is unresponsive and breathes 8 times a minute: CPAP supports breaths, it does not give them, and he cannot protect his airway.'
          : 'CPAP mask on — but CPAP only supports breaths a patient takes: he is not breathing, so it moves no air.', 'bad']],
        flags: ['cpap'],
      };
    },
    // after ROSC: fluid, a vasopressor or push-dose epinephrine bring the pressure up — never down from a higher one
    fluid: (s) => {
      if (!s.pulse) return null;
      const bp = bpAfter(s, 12, 8);
      return { say: [['monitor', `Bolus in. BP ${bp.sbp}/${bp.dbp}, MAP ${mapOf(bp)}.`]], vitals: bp, flags: ['fluid'] };
    },
    pressor: (s) => {
      if (!s.pulse) return null;
      const bp = { sbp: Math.max(s.vitals.sbp, 104), dbp: Math.max(s.vitals.dbp, 64) };
      return { say: [['monitor', `Norepinephrine infusion running: BP ${bp.sbp}/${bp.dbp}, MAP ${mapOf(bp)}.`, 'good']], vitals: bp, flags: ['pressor'] };
    },
    // 10–20 mcg is for a low pressure with a pulse: in the arrest it is a tiny fraction of the dose, and does not count as it
    'push-epi': (s) => {
      if (!s.pulse) return { say: [['you', 'Push-dose epinephrine, 10–20 mcg — a dose for a low pressure with a pulse. In cardiac arrest the dose is 1 mg.', 'warn']], flags: ['push-epi'] };
      const bp = { sbp: Math.max(s.vitals.sbp, 100), dbp: Math.max(s.vitals.dbp, 62) };
      return { say: [['monitor', `BP ${bp.sbp}/${bp.dbp} for a few minutes.`]], vitals: bp, flags: ['push-epi'] };
    },
    // the 150 mg infusion is the dose for a tachycardia with a pulse: in the arrest it is not the 300 mg push, and does not count as it
    'amio-infusion': (s) => {
      if (!s.pulse) return { say: [['you', 'Amiodarone 150 mg infusion started — the arrest dose is a 300 mg push. Nothing changes on the monitor.', 'warn']], flags: ['amio-infusion'] };
      const bp = bpAfter(s, -10, -6);
      return { say: [['you', 'Amiodarone 150 mg running over 10 minutes.'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`, 'bad']], vitals: bp, flags: ['amio-infusion'] };
    },
    // after ROSC the 300 mg push drops a pressure that is already low (the built-in rule scores it)
    'amio-arrest': (s) => {
      if (!s.pulse) return null;
      const bp = bpAfter(s, -16, -10);
      return { say: [['you', 'Amiodarone 300 mg pushed.'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`, 'bad']], vitals: bp, flags: ['amio-after-rosc'] };
    },
    adenosine6: (s) => (s.pulse ? null : noRoleInArrest('Adenosine', 'adenosine')),
    adenosine12: (s) => (s.pulse ? null : noRoleInArrest('Adenosine', 'adenosine')),
    // no pain or agitation to treat in someone with a GCS of 6: they only slow his breathing and lower his pressure
    fentanyl: (s) => {
      if (!s.pulse) return { blocked: true, say: [['system', 'He is in cardiac arrest: there is no pain to treat, and fentanyl is no arrest drug.']] };
      const bp = bpAfter(s, -6, -4);
      return { say: [['you', 'Fentanyl 50 mcg IV — he shows no sign of pain.'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`, 'bad']], vitals: bp, flags: ['opioid'] };
    },
    sedation: (s) => {
      if (!s.pulse) return null;
      const bp = bpAfter(s, -10, -6);
      return { say: [['you', 'Sedation given — to a patient with a GCS of 6.'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`, 'bad']], vitals: bp, flags: ['sedation'] };
    },
    // a muscle is barely perfused during CPR; with a pulse the dose is absorbed, and he has no anaphylaxis for it to treat
    'epi-im': (s) => {
      if (!s.pulse) return { say: [['you', 'Epinephrine 0.5 mg IM in the thigh — a muscle barely absorbs it during CPR, and it is not the arrest dose.']], flags: ['epi-im'] };
      const bp = bpAfter(s, 8, 4);
      return { say: [['you', 'Epinephrine 0.5 mg IM in the thigh.'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`]], vitals: bp, flags: ['epi-im'] };
    },
    // a nebulizer needs a patient who breathes, and his lungs are clear
    albuterol: (s) => {
      if (!s.pulse) return { blocked: true, say: [['system', 'Not in cardiac arrest: a nebulizer needs a patient who is breathing, and inhaled bronchodilators are not part of the arrest algorithm.']] };
      return { say: [['you', 'Albuterol 2.5 mg nebulized in line with the bag — his lungs were clear: it has nothing to treat, and it can only speed his heart.']], flags: ['albuterol'] };
    },
    aspirin: (s) => (!s.pulse || s.vitals.gcs <= 8 ? { blocked: true, say: [['system', 'Not by mouth: he is unresponsive and cannot chew or swallow it.']] } : null),
    'nitro-assist': () => ({ blocked: true, say: [['system', 'He is unresponsive, and he has no nitroglycerin of his own.']] }),
    vagal: (s) => (!s.pulse || s.vitals.gcs <= 8 ? { blocked: true, say: [['system', 'A vagal maneuver needs an awake patient who can bear down.']] } : null),
    // the Hs and Ts against what the crew knows about him. It names no rhythm and no treatment: the monitor is the
    // paramedic's to read, and blunt chest trauma can (rarely) tear the heart or collapse a lung, so nothing is ruled out flat
    'hs-ts': (s) => ({
      say: [['you', `Hs and Ts against what you know: he was well, and he dropped seconds after a ball hit his chest. Hypoxia, hypovolemia, acidosis, potassium, cold: nothing points to them. Tension pneumothorax: the trachea is midline and the chest wall stable${ventilated(s) ? ', and it rises evenly with each breath' : ' (no breath given yet to watch it rise)'} — no sign. Tamponade: a blow hard enough to tear the heart would usually break the ribs or the breastbone, and his are intact — unlikely. Toxins, thrombosis: nothing in the story. None of them fits: the blow to the chest itself stopped his heart. Treat what the monitor shows.`]],
      flags: ['hs-ts'],
    }),
    // medical control backs the crew: a cardiac arrest, worked on scene — not a trauma call
    'med-control': (s) => ({
      say: [['hospital', s.pulse
        ? 'Medical control: good work. Bring him to the regional heart center — it is the cardiac arrest center. Keep his breaths at 10 a minute and his SpO₂ 90 to 98, and treat a MAP under 65.'
        : 'Medical control: this is a cardiac arrest, not a trauma call — work it like any other, here on scene: shocks as the defibrillator calls for them and compressions between them, no collar or board before the shock. Call back when you have a pulse.']],
      flags: ['med-control'],
    }),
    // the hospital answers the crew as it is: on the way to the nearest department it says nothing of the heart center's team
    notify: (s) => ({
      say: [['hospital', !s.pulse
        ? 'Copy: cardiac arrest, resuscitation under way. Call back when you have a pulse.'
        : has(s, 'dest-near')
          ? 'Copy: 19-year-old, a pulse back after a cardiac arrest on the baseball field. We will be ready in the resuscitation bay.'
          : 'Copy: 19-year-old, a pulse back after a cardiac arrest on the baseball field. The cardiac arrest team will meet you at the door.']],
      flags: ['notified'],
    }),
    'ecg-transmit': (s) => {
      if (!has(s, 'ecg12')) return null;
      return {
        say: [['hospital', has(s, 'enroute')
          ? 'ECG received; the physician is reviewing it.'
          : 'ECG received; the physician is reviewing it. After a cardiac arrest he belongs at the heart center, the cardiac arrest center.']],
        flags: ['transmitted'],
      };
    },
    // no one awake to sedate in the arrest (as fentanyl and the sedation action): refused, no time lost
    midazolam: (s) => (s.pulse ? null : { blocked: true, say: [['system', 'He is in cardiac arrest: there is no one awake to sedate, and midazolam is no arrest drug.']] }),
  },
  events: [
    {
      // no compressions after the shock that stopped the VF: the stunned heart, given no blood flow, fibrillates again
      id: 'refib',
      when: (s) => !s.pulse && s.rhythm.profile === 'pea' && s.flags.converted !== undefined
        && !s.performed.some((p) => p.id === 'cpr' && p.minute >= s.flags.converted) && s.minute >= s.flags.converted + STUNNED_MINUTES,
      effect: (s) => ({
        say: [...(ecgOn(s) ? [line('monitor', 'Monitor alarm.', 'bad')] : []), ['partner', 'He is going gray again — nobody has been on his chest since the shock.', 'bad']],
        rhythm: { profile: 'vf', hr: 0 }, flags: ['refib'],
      }),
    },
    {
      // the EMT's intercept: the medics take over the drugs; the BLS crew keeps the compressions, the AED and the bag
      id: 'als-arrives',
      when: (s) => s.role === 1 && has(s, 'als') && s.minute >= s.flags.als + ALS_MINUTES,
      effect: (s) => {
        if (s.pulse) return { say: [['team', 'The paramedics arrive and take over the drugs: an IV in his arm, ready for his pressure. "The breaths are yours — keep them at 1 every 6 seconds."']], flags: ['iv', 'als-here'] };
        const lines: Line[] = [['team', 'The paramedics arrive and take over the drugs: an IV in his arm. "Keep the compressions, the AED and the breaths going — they are yours."']];
        if (vfShocks(s) === 0) lines.push(['team', '"He has not been shocked yet? Get the AED on him — now!"', 'warn']);
        return { say: lines, flags: ['iv', 'als-here'] };
      },
    },
    {
      // VF that outlasts the shocks: the medics follow the algorithm — epinephrine once the second shock is in, amiodarone
      // once the third is
      id: 'als-epi',
      when: (s) => s.role === 1 && has(s, 'als-here') && has(s, 'refractory') && vfShocks(s) >= 2 && !s.pulse && s.rhythm.profile === 'vf',
      effect: () => ({ say: [['team', 'Epinephrine 1 mg IV, flushed.']], flags: ['epi'] }),
    },
    {
      id: 'als-amio',
      when: (s) => s.role === 1 && has(s, 'als-here') && has(s, 'refractory') && vfShocks(s) >= 3 && !s.pulse && s.rhythm.profile === 'vf',
      effect: () => ({ say: [['team', 'Amiodarone 300 mg IV, flushed.']], flags: ['amiodarone'] }),
    },
    {
      // after ROSC the medics treat his low pressure; the EMT's job is to measure and report it
      id: 'als-post-rosc',
      when: (s) => s.role === 1 && s.pulse && has(s, 'rosc') && has(s, 'als-here') && s.minute >= Math.max(s.flags.rosc, s.flags['als-here']) + 2 && mapOf(s.vitals) < 65,
      effect: (s) => {
        const bp = bpAfter(s, 12, 8);
        return { say: [['team', `The paramedic runs a fluid bolus for his pressure: BP ${bp.sbp}/${bp.dbp}, MAP ${mapOf(bp)}.`]], vitals: bp, flags: ['fluid'] };
      },
    },
    {
      // left to bag him alone after ROSC, the partner speeds up: the EtCO₂ falls, and the high pressure in the chest lowers his BP
      id: 'hyperventilated',
      when: (s) => s.pulse && has(s, 'rosc') && ventAfterRosc(s) === null && s.minute >= s.flags.rosc + BAG_UNGUIDED,
      effect: (s) => {
        const bp = bpAfter(s, -8, -6);
        return {
          say: [
            ['scene', 'Your partner is squeezing the bag hard and fast — about 30 breaths a minute — in the excitement.', 'warn'],
            ...(has(s, 'capno') ? [line('monitor', 'EtCO₂ 24 mmHg.', 'bad')] : []),
          ],
          vitals: { ...bp, rr: 30, etco2: 24, spo2: 100 }, flags: ['hyperventilated'],
        };
      },
    },
  ],
  critical: [
    {
      id: 'shock', label: 'Shock at once: AED or manual defibrillator', points: 20, target: { by: 2 }, done: ['aed', 'defib'],
      why: 'A blow to the chest at the wrong instant of the heartbeat set off VF, and only a shock stops it: survival falls with every minute without one (US Commotio Cordis Registry: 40 % with resuscitation in under 3 minutes, 5 % after). Pads on while the coach keeps compressing, then shock.',
    },
    {
      // only once there was a shock (a missing shock is its own item), and in words that stay true when a pulse check
      // delayed the compressions by seconds (the check is its own harm)
      id: 'cpr-after-shock', label: 'Compressions again at once after the shock', points: 15, target: { within: { flag: 'shocked', minutes: 0.5 } },
      done: ['cpr'], after: 'shocked', applies: (s) => has(s, 'shocked'),
      why: 'Right after a shock that works, the heart is stunned: it beats without a pulse you can feel, and it needs the blood flow CPR gives it. 2025 AHA: resume compressions at once for 2 minutes, then check the rhythm.',
    },
    { id: 'als', label: 'Request ALS (paramedic intercept)', why: 'He was dispatched as a sports injury, so no paramedic was sent: drugs for VF that outlasts the shocks, and the care after ROSC, need one. Call at once — the intercept takes minutes.', done: ['als'], roles: [1], points: 10, target: { by: 3 } },
    { id: 'access', label: 'Vascular access: IV first, IO if the IV fails', why: 'For the drugs if VF persists, and for fluid after ROSC. 2025 AHA: IV first; IO if IV attempts are unsuccessful or not feasible — and never before the shock.', done: ['iv', 'io'], roles: [2], points: 5 },
    {
      id: 'epi', label: 'Epinephrine 1 mg IV/IO once VF has outlasted the shocks', roles: [2], points: 10, applies: (s) => has(s, 'refractory'),
      why: 'VF that persists after the shocks: epinephrine 1 mg after the second shock, then every 3–5 minutes (2025 AHA).',
      done: (s) => (s.flags.refractory === undefined ? null : s.performed.find((p) => p.id === 'epinephrine' && p.minute >= s.flags.refractory && p.minute < (s.flags.rosc ?? Infinity))?.minute ?? null),
      uses: ['epinephrine'],
    },
    {
      id: 'antiarrhythmic', label: 'Amiodarone 300 mg (or lidocaine) for VF that persists', roles: [2], points: 10, applies: (s) => has(s, 'refractory2'),
      why: 'VF that outlasts repeated shocks: amiodarone 300 mg (then 150 mg) or lidocaine 1–1.5 mg/kg after the third shock (2025 AHA).',
      done: (s) => (s.flags.refractory === undefined ? null : s.performed.find((p) => ['amio-arrest', 'lidocaine'].includes(p.id) && p.minute >= s.flags.refractory && p.minute < (s.flags.rosc ?? Infinity))?.minute ?? null),
      uses: ['amio-arrest', 'lidocaine'],
    },
    {
      id: 'arrest-vent', label: 'Breaths during CPR: bag-mask 30:2 (or an advanced airway)', points: 5, applies: (s) => has(s, 'refractory'),
      why: 'In an arrest that goes on, compressions alone run out of oxygen: 2 breaths after every 30 compressions, each over 1 second — or an advanced airway, 1 breath every 6 seconds with continuous compressions.',
      done: (s) => s.performed.find((p) => (p.id === 'bvm' || p.id === 'airway') && p.minute < (s.flags.rosc ?? Infinity))?.minute ?? null,
      uses: ['bvm', 'airway'],
    },
    {
      id: 'capno', label: 'Waveform capnography', roles: [2], points: 5,
      why: 'It measures CPR quality and shows ROSC as a jump; after ROSC it guides the breaths to an EtCO₂ of 35–45 mmHg — the way to catch hyperventilation.',
      // an airway confirmed with capnography counts: the capnograph is on
      done: (s) => s.flags.capno ?? null,
      uses: ['capno', 'airway'],
    },
    {
      id: 'post-vent', label: 'After ROSC: take his breaths in hand — 1 every 6 seconds, SpO₂ 90–98 %', points: 10, applies: (s) => has(s, 'rosc'),
      target: { within: { flag: 'rosc', minutes: BAG_UNGUIDED } },
      why: 'He breathes 8 times a minute, and an excited partner bags too fast. 2025 AHA: 1 breath every 6 seconds to a PaCO₂ (in the field, an EtCO₂) of 35–45 mmHg, and SpO₂ 90–98 %. Hyperventilation narrows the brain\'s arteries and raises the pressure in the chest, which lowers the blood pressure.',
      done: ventAfterRosc,
      uses: ['bvm', 'airway'],
    },
    {
      id: 'post-bp', label: 'After ROSC: treat the low pressure (MAP ≥ 65)', roles: [2], points: 10, applies: (s) => has(s, 'rosc'),
      why: `His pressure after ROSC is ${AT_ROSC.sbp}/${AT_ROSC.dbp}, a MAP of ${mapOf(AT_ROSC)}. Avoid hypotension (2025 AHA): a fluid bolus, and a vasopressor if needed, to a MAP of 65 mmHg or more.`,
      done: ['fluid', 'pressor', 'push-epi'], after: 'rosc',
    },
    {
      id: 'post-bp-check', label: 'After ROSC: check his blood pressure', roles: [1], points: 5, applies: (s) => has(s, 'rosc'),
      why: 'The pressure is often low after ROSC: measure it and report it, so the paramedics can treat a MAP under 65 mmHg.',
      done: ['vitals', 'nibp'], after: 'rosc',
    },
    {
      id: 'post-ecg', label: '12-lead after ROSC', roles: [2], points: 10, applies: (s) => has(s, 'rosc'),
      why: 'ST elevation after ROSC means emergent coronary angiography; a normal tracing fits a heart stopped by the blow, and the hospital still looks for a long QT, a Brugada pattern or pre-excitation.',
      done: ['ecg12', 'ecg12-repeat'], after: 'rosc',
    },
    {
      id: 'post-ecg-transmit', label: '12-lead after ROSC, transmitted to the hospital', roles: [1], points: 10, applies: (s) => has(s, 'rosc'),
      why: 'EMTs acquire and transmit the 12-lead; the physician reads it. ST elevation after ROSC would mean the cath lab.',
      done: ['ecg-transmit'], after: 'rosc',
    },
    {
      id: 'transport', label: 'After ROSC: transport to the cardiac arrest center', points: 10, applies: (s) => has(s, 'rosc'),
      why: 'He is unresponsive after ROSC: he needs a cardiac arrest center (2025 AHA Systems of Care) — temperature control for a patient who does not follow commands, an ICU, the cath lab if needed, and the workup for a cause. The nearest community hospital has no cath lab and no ICU for him: he would need a second transfer.',
      // a crew that loaded him during the arrest (a harm) is transporting him from the moment of ROSC, not before it
      done: (s) => (s.flags['dest-pci'] === undefined || s.flags.rosc === undefined ? null : Math.max(s.flags['dest-pci'], s.flags.rosc)),
      uses: ['transport-pci'],
    },
    { id: 'handoff', label: 'Hand-off', why: 'The blow and the time of collapse, the coach\'s CPR, each shock and its time, the time of ROSC, every drug, and the vitals and 12-lead after it.', done: ['handoff'], points: 5, applies: (s) => has(s, 'rosc') },
  ],
  harms: [
    {
      id: 'iv-before-shock', actions: ['iv', 'io'], when: (s) => !s.pulse && vfShocks(s) === 0, roles: [2], points: 5, severity: 'major',
      text: 'IV or IO access before the first shock. In VF the shock is the treatment, and every minute without it cuts the chance of survival: pads on and shock first — the line comes during the CPR after the shock.',
    },
    {
      id: 'airway-before-shock', actions: ['airway'], when: (s) => !s.pulse && vfShocks(s) === 0, roles: [2], points: 5, severity: 'major',
      text: 'An advanced airway before the first shock. It takes minutes he does not have: in VF the shock comes first, and a bag-mask does for the breaths until there is time for an airway.',
    },
    {
      id: 'epi-not-yet', actions: ['epinephrine'], when: (s) => !s.pulse && epiNotYet(s), roles: [2], points: 3, severity: 'minor',
      text: 'Epinephrine before it was due. In VF the shock comes first; epinephrine is for VF that persists or comes back after the shocks — in the 2025 AHA algorithm, during the CPR after the second shock, then every 3–5 minutes. Pushed into a heart a shock has just converted, it only drives up the rate, the oxygen demand and the risk of VF coming back.',
    },
    {
      id: 'antiarrhythmic-not-yet', actions: ['amio-arrest', 'lidocaine'], when: (s) => !s.pulse && antiarrhythmicNotYet(s), roles: [2], points: 3, severity: 'minor',
      text: 'Amiodarone or lidocaine before any shock had failed. They are for VF that persists or comes back after a shock (in the 2025 AHA algorithm, after the third shock), not a replacement for the first one.',
    },
    {
      id: 'epi-too-soon', actions: ['epinephrine'], when: (s) => !s.pulse && (sinceLastEpi(s) ?? Infinity) < 3, roles: [2], points: 3, severity: 'minor',
      text: 'Epinephrine again less than 3 minutes after the last dose. The interval is 3–5 minutes: stacked doses add up to high-dose epinephrine, which brings no benefit (2025 AHA).',
    },
    {
      id: 'pulse-check-after-shock', actions: ['pulse-check'], when: (s) => !s.pulse && shockPending(s), points: 5, severity: 'major',
      text: 'A pulse check straight after the shock. Resume compressions at once for 2 minutes: right after a shock that works the heart is stunned and rarely makes a pulse you can feel, and every pause starves it of the blood flow CPR gives (2025 AHA). Check the rhythm, and the pulse, after the 2 minutes.',
    },
    {
      id: 'reanalyze-after-shock', actions: ['aed'], when: (s) => !s.pulse && shockPending(s), points: 5, severity: 'major',
      text: 'An AED analysis straight after the shock. When the AED says "Resume CPR", do: 2 minutes of compressions before it analyzes again. An analysis takes hands off the chest, and stacked shocks are not recommended.',
    },
    {
      id: 'stacked-shock', actions: ['defib'], when: (s) => !s.pulse && shockPending(s) && s.rhythm.profile === 'vf', roles: [2], points: 5, severity: 'major',
      text: 'A second shock with no CPR after the first. Single shocks, each followed at once by 2 minutes of compressions (2025 AHA): stacked shocks take hands off the chest and work no better.',
    },
    {
      // the same id as the built-in rule, in this case's words: the "trauma" reflex of load-and-go
      id: 'transport-in-arrest', actions: ['transport-near', 'transport-pci'], when: (s) => !s.pulse, points: 6, severity: 'major',
      text: 'Loading him for transport while he is in cardiac arrest. It looks like a trauma arrest, but the blow set off VF, and what treats VF — the shock and high-quality CPR — works right here, better than on a moving stretcher. Work the arrest on scene and transport after ROSC.',
    },
    {
      id: 'cpap-unresponsive', actions: ['cpap'], when: (s) => !s.pulse || s.vitals.gcs <= 8, replaces: ['cpap-hypotension'], points: 5, severity: 'major',
      text: 'CPAP for a patient who is not breathing adequately on his own. CPAP supports breaths a patient takes and needs someone awake enough to protect the airway; it gives no breaths. In the arrest, and unresponsive after ROSC, he needs a bag-mask or an advanced airway.',
    },
    {
      // the default nitroglycerin rule only fires under a systolic of 90: after a bolus he has no reason for it either
      id: 'nitro-post-rosc', actions: ['nitro', 'nitro-high'], when: (s) => s.pulse, roles: [2], points: 8, severity: 'major', replaces: ['nitro-hypotension', 'nitro-high-not-hypertensive'],
      text: 'Nitroglycerin after ROSC. He has no chest pain and no ST elevation, and his pressure is low or only just held up by treatment: nitrates drop it further.',
    },
    {
      // procainamide included: its built-in rule only fires while the systolic is under 90, and after a bolus it may not be
      id: 'rate-drug-post-rosc', actions: ['metoprolol', 'diltiazem', 'amio-infusion', 'procainamide', 'adenosine6', 'adenosine12'], when: (s) => s.pulse, roles: [2],
      points: 5, severity: 'major', replaces: ['procainamide-hypotension'],
      text: 'A drug to slow or convert his rhythm after ROSC. His fast rate is the body\'s answer to the arrest and a low pressure — there is no arrhythmia to treat: these drugs drop a pressure that is barely held up, and can bring the arrest back.',
    },
    {
      id: 'rate-drug-arrest', actions: ['adenosine6', 'adenosine12', 'metoprolol', 'diltiazem', 'procainamide', 'amio-infusion'], when: (s) => !s.pulse, roles: [2],
      points: 3, severity: 'minor', replaces: ['procainamide-in-arrest'],
      text: 'A drug for a tachycardia with a pulse, given in cardiac arrest. Adenosine, beta-blockers, diltiazem, procainamide and the 150 mg amiodarone infusion are not arrest drugs: VF needs shocks, CPR, epinephrine and, if it persists, amiodarone 300 mg or lidocaine.',
    },
    {
      id: 'sedation-unresponsive', actions: ['fentanyl', 'sedation', 'midazolam'], when: (s) => s.pulse, roles: [2], points: 5, severity: 'major', replaces: ['midazolam-unsafe'],
      text: 'An opioid or a sedative for a patient who is unresponsive. With a GCS of 6 he shows no pain or agitation to treat: it slows the breathing he has left and lowers his pressure.',
    },
    {
      id: 'epi-im-no-anaphylaxis', actions: ['epi-im'], points: 3, severity: 'minor',
      text: 'IM epinephrine without anaphylaxis. In the arrest a muscle barely absorbs it, and 0.3–0.5 mg is the anaphylaxis dose: epinephrine for an arrest is 1 mg IV/IO, from ALS. After ROSC he has no allergic reaction for it to treat.',
    },
    {
      id: 'no-indication', actions: ['glucagon', 'diphenhydramine', 'albuterol'], roles: [2], points: 3, severity: 'minor',
      text: 'A drug with nothing to treat. Glucagon is for a beta- or calcium-channel-blocker overdose, diphenhydramine for an allergic reaction, albuterol for wheezing: he has none of them, and each brings its own side effects.',
    },
  ],
  timings: [
    { label: 'First shock', actions: ['aed', 'defib'], target: 2 },
    { label: 'Compressions after the first shock', actions: ['cpr'], from: 'shocked', target: 0.5 },
    { label: 'ROSC', actions: [], flag: 'rosc' },
    // an airway placed in the arrest has his breaths in hand from ROSC: the flag says so when no bag or airway follows
    { label: 'Breaths taken in hand after ROSC', actions: ['bvm', 'airway'], from: 'rosc', flag: 'breaths-in-hand' },
    { label: '12-lead after ROSC', actions: ['ecg12', 'ecg12-repeat'], from: 'rosc' },
  ],
  transportMinutes: 12,
  nearestMinutes: 6,
  // the same words for either hospital: the crew may have chosen the nearest one
  arrival: 'You arrive at the hospital; the resuscitation team meets you at the door.',
  deathAfter: 20,
  completeWhen: (s) => has(s, 'rosc'),
  teaching: [
    'Commotio cordis: a blunt, nonpenetrating blow over the heart — a baseball, a softball, a lacrosse ball, a hockey puck, a fist or a knee — that lands in a narrow window on the upstroke of the T wave (in the animal model, 10–30 ms before its peak) sets off VF in a structurally normal heart. It strikes mostly young males in sports; the ribs and the breastbone are usually intact, and a moderate blow is enough (in animal models a 40 mph baseball is more dangerous than a faster or a slower one).',
    'The victim collapses at once or within a few seconds. Treat it as what it is — a primary cardiac arrest from VF, not a trauma arrest: high-quality CPR and a shock as soon as a defibrillator is ready. Survival has risen to more than half of victims as CPR and AEDs reach them sooner (US Commotio Cordis Registry: 40 % with resuscitation in under 3 minutes, 5 % after).',
    'Do not let the mechanism mislead you: a blow from a ball is not a reason to delay the shock for a collar and a board, an IV, an airway or a run to the trauma center. Nothing comes before the defibrillator; work the arrest on scene and transport after ROSC.',
    'One shock, then compressions at once for 2 minutes — no pulse check and no re-analysis straight after the shock. A heart a shock has just converted is stunned: it often beats without a pulse you can feel for the first minute, and it needs the blood flow CPR gives (2025 AHA).',
    'If VF persists (2025 AHA): a shock every 2 minutes with CPR between them; epinephrine 1 mg IV/IO after the second shock, then every 3–5 minutes; amiodarone 300 mg (then 150 mg) or lidocaine 1–1.5 mg/kg (then 0.5–0.75 mg/kg) after the third. Vascular access: IV first, IO if IV attempts fail.',
    'After ROSC (2025 AHA): take the breaths in hand — 1 breath every 6 seconds to a PaCO₂ of 35–45 mmHg (EtCO₂ in the field), SpO₂ 90–98 %. Hyperventilation is the common error: it narrows the brain\'s arteries and raises the pressure in the chest, which lowers the blood pressure. Keep the MAP at 65 mmHg or more (fluid, then a vasopressor), record a 12-lead and check the glucose.',
    'Take him to a cardiac arrest center: a patient who does not follow commands after ROSC needs temperature control (32–37.5 °C for at least 36 hours), and every survivor of commotio cordis a full cardiac workup for what can mimic it (a long QT, a Brugada pattern, pre-excitation, a cardiomyopathy) before any return to sport.',
    'Prevention is an emergency action plan with an AED that reaches any player within minutes, coaches trained in CPR, and chest protectors certified to the NOCSAE ND200 standard (required for lacrosse players and baseball catchers in many leagues) — they lower the risk, but no protector removes it.',
  ],
};
