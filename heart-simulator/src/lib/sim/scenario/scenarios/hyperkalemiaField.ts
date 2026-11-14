import type { Effect, Line, Scenario, SimState } from '../types';
import { INTERVENTION_BY_ID } from '../interventions';
import { PADS, bpAfter, count, cprCycles, firstDone, has } from '../kit';
import { SEDATIVE_RULES, unsafeToSedate } from '../rules/acs';
import { CALCIUMS } from '../rules/helpers';
import { LIDOCAINE_RULES, RATE_RULES, yieldToHeavier } from '../rules/rhythm';

/** His rhythm while the potassium is high: the case keeps it until he arrests or a pacer takes over */
const HYPERK = 'hyperkalemia';
/**
 * The tracing moves with the potassium: untreated, the sine wave ('hyperkalemia-severe', which calcium opens out again);
 * once albuterol has shifted some into the cells, smaller T waves and a narrower QRS ('hyperkalemia-moderate')
 */
const HYPERK_SINE = 'hyperkalemia-severe';
const HYPERK_LOWER = 'hyperkalemia-moderate';
/** A high potassium drives his rhythm, at whichever stage */
const hyperK = (s: SimState) => s.rhythm.profile === HYPERK || s.rhythm.profile === HYPERK_SINE || s.rhythm.profile === HYPERK_LOWER;
/** The stage his tracing is at: kept when only the rate changes */
const stage = (s: SimState) => (hyperK(s) ? s.rhythm.profile : HYPERK);

/** What each stage of his tracing shows, in words */
const PATTERN: Record<string, string> = {
  [HYPERK]: 'P waves flattened almost to nothing, a long PR, a wide QRS and tall, narrow, peaked T waves, tallest in V2–V4',
  [HYPERK_SINE]: 'no P waves at all, and a QRS so wide it runs straight into its T wave — a sine wave',
  [HYPERK_LOWER]: 'small P waves back, a QRS only a little wide, and peaked T waves, smaller than before, tallest in V2–V4',
};

/** Minutes to the regional center that can start emergency dialysis */
const TO_DIALYSIS = 16;

/** Only a patient awake enough to talk says how a drug feels */
const ifAwake = (s: SimState, text: string): Line[] => (s.pulse && s.vitals.gcs >= 13 ? [['patient', text]] : []);

/** A drug that helps brings the pressure up to (at least) this: never down from a higher one */
const atLeast = (s: SimState, sbp: number, dbp: number) => ({ sbp: Math.max(s.vitals.sbp, sbp), dbp: Math.max(s.vitals.dbp, dbp) });

/**
 * After an arrest the brain has been without blood: a better rhythm and pressure do not wake him (the arrest, not the
 * potassium, keeps him comatose now), so only a patient who never arrested comes round with the treatment
 */
const comesRound = (s: SimState) => !has(s, 'rosc');

/** The minute the last dose of calcium went in (its effect wears off 30–60 minutes later), or null */
function lastCalcium(s: SimState): number | null {
  const doses = s.performed.filter((p) => CALCIUMS.includes(p.id));
  return doses.length ? doses[doses.length - 1].minute : null;
}

/**
 * Lidocaine, amiodarone, procainamide, a beta-blocker or a calcium-channel blocker on a heart the potassium already
 * slows: they depress the same conduction further, so the rate and the pressure fall. Before calcium he is at the
 * bottom already (30), and the arrest that follows comes within minutes; calcium softens the fall but does not stop it.
 */
function suppress(s: SimState): Effect | null {
  if (!s.pulse || !hyperK(s)) return null;
  const v = s.vitals;
  if (!has(s, 'calcium')) {
    const sbp = Math.min(v.sbp, 58);
    const dbp = Math.min(v.dbp, 32);
    return {
      // a GCS of 10: drowsy and barely answering, as the reassessment then says — not yet comatose
      say: [['monitor', `Heart rate 30. BP ${sbp}/${dbp}.`, 'bad'], ['patient', 'His eyes roll back and he barely responds.', 'bad']],
      rhythm: { profile: stage(s), hr: 30 }, vitals: { sbp, dbp, gcs: Math.min(v.gcs, 10) }, flags: ['suppressed'],
    };
  }
  const hr = Math.max(30, s.rhythm.hr - 14);
  const bp = bpAfter(s, -16, -10);
  return {
    say: [['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`, 'bad'], ...ifAwake(s, '"I feel faint again…"')],
    rhythm: { profile: stage(s), hr }, vitals: { ...bp, gcs: Math.min(v.gcs, 13) }, flags: ['suppressed'],
  };
}

/**
 * Calcium raises the threshold the potassium has pushed the cells toward: within minutes the rate and the pressure come
 * up. It lowers no potassium and wears off in 30–60 minutes, so a repeat dose is for changes that persist or return.
 */
function calcium(s: SimState, given: string, burns: boolean): Effect | null {
  if (!s.pulse || !hyperK(s)) return null;
  // the first dose (or one after the effect has faded or a drug has slowed him) does most; a repeat adds a little
  const first = s.rhythm.hr < 50 || !has(s, 'calcium');
  const hr = first ? Math.max(s.rhythm.hr, 54) : Math.max(s.rhythm.hr, Math.min(s.rhythm.hr + 6, 64));
  const bp = first ? atLeast(s, 96, 58) : bpAfter(s, 6, 4);
  // the better pressure clears the confusion the slow rate caused — not the coma an arrest leaves behind
  const wakes = first && comesRound(s);
  // calcium opens the sine wave out again into separate complexes (it lowers no potassium: they stay wide)
  const sine = s.rhythm.profile === HYPERK_SINE;
  return {
    say: [
      ['you', given],
      ...(burns ? ifAwake(s, '"That burns going up my arm."') : []),
      ['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`, 'good'],
      ...(sine ? [['you', 'The waves on the monitor open out into separate complexes again — still wide, the T waves still tall.'] as Line] : []),
      ...(wakes ? [['patient', '"I can think straight again."'] as Line] : []),
    ],
    rhythm: { profile: sine ? HYPERK : stage(s), hr }, vitals: { ...bp, ...(comesRound(s) ? { gcs: 15 } : {}) }, flags: ['calcium'],
  };
}

/** Adenosine blocks the AV node for several seconds: at this rate, a pause with no output */
function adenosinePause(s: SimState, seconds: number): Effect | null {
  if (!s.pulse || !hyperK(s)) return null;
  return {
    say: [['monitor', `${seconds} seconds with no complexes at all… then the slow beats return at ${s.rhythm.hr}.`, 'bad'], ...ifAwake(s, '"Everything went gray…"')],
    flags: ['adenosine'],
  };
}

export const hyperkalemiaField: Scenario = {
  id: 'hyperkalemia-dialysis-field',
  title: 'Too weak to stand',
  summary: '68-year-old man on dialysis who is too weak to stand, with a slow pulse and a low blood pressure. Find out why — and what will and will not help his heart.',
  setting: 'field',
  roles: [2],
  difficulty: 'advanced',
  conditionId: 'hyperkalemia',
  briefing: {
    default: [
      ['dispatch', 'Priority 1: 68-year-old man, generalized weakness. The caller says he is on dialysis.'],
      ['scene', 'He is sitting on the edge of his bed, pale, gray and sweaty, and cannot stand. His daughter: "He\'s been getting weaker since yesterday, and now his legs won\'t hold him."'],
      // the transport button reads "regional heart center (PCI, pacing, dialysis)": name the hospital the same way, so the learner can find it
      ['hospital', `Regional heart center (a full medical center: emergency dialysis, nephrology on call): ${TO_DIALYSIS} minutes. Nearest emergency department (small community hospital, no dialysis): 6 minutes.`],
    ],
  },
  initial: {
    rhythm: { profile: HYPERK, hr: 36 },
    // missed dialysis: a metabolic acidosis he breathes off (fast breathing, a low EtCO₂), wet lungs, a low pressure from the slow rate
    vitals: { sbp: 78, dbp: 44, spo2: 93, rr: 22, etco2: 28, pain: 0, gcs: 14, glucose: 168, temp: 36.4 },
  },
  // the case has to say so: calcium, bicarbonate and high-dose albuterol are right here, and the built-in rules otherwise count them as given with no indication
  problems: ['hyperkalemia', 'metabolic-acidosis', 'dialysis'],
  facts: {
    opqrst: 'No pain. I\'ve just got weaker and weaker since yesterday — my legs feel like rubber, and my hands and lips tingle. Now I can\'t stand up.',
    sample: 'No allergies. Dialysis Monday, Wednesday and Friday through the fistula in my left arm — I missed Wednesday and yesterday: my ride fell through, then I felt too sick to go. Kidney failure from diabetes and high blood pressure. Metoprolol, insulin, sevelamer and a renal vitamin. Last night: a big bowl of chili with beans and baked potatoes.',
    pde5: 'No.',
    lungs: (s) => (count(s, 'fluid') >= 2 ? 'Crackles a third of the way up both sides now.' : 'Fine crackles at both bases.'),
    perfusion: 'Pale, cool and clammy; slow capillary refill. Neck veins full sitting up; pitting edema to both knees. A dialysis fistula in the left forearm with a strong buzz (thrill) over it — no BP cuff, tourniquet or IV on that arm.',
    neuro: 'Alert but slow to answer. Both legs weak — he cannot lift them off the bed; weak grip; sensation intact; no facial droop, speech normal.',
    ecg12: (s) => {
      // only reached once calcium has worn off and a pacer has taken over a rate under 50
      if (s.rhythm.profile === 'tcp') return `Paced rhythm at ${s.rhythm.hr}: a pacing spike before every wide QRS — the pacer has captured. Underneath it the potassium is still high: calcium again, and shift it.`;
      const tracing = `${s.rhythm.hr < 60 ? 'Slow rhythm' : 'Rhythm'} at ${s.rhythm.hr}: ${PATTERN[stage(s)]}`;
      if (has(s, 'shifted')) return `${tracing} — still hyperkalemia, smaller now that the albuterol has moved some of it into the cells; none has left his body until he is dialyzed.`;
      return has(s, 'calcium')
        ? `${tracing} — still severe hyperkalemia. Calcium has steadied the heart and lifted the rate, but the potassium is no lower until it is shifted and dialyzed.`
        : `${tracing}: severe hyperkalemia. In a dialysis patient who missed two sessions this is a potassium high enough to stop the heart — calcium now.`;
    },
  },
  status: (s) => {
    // nobody is doing compressions until the learner starts them, and a reassessment is not a CPR cycle: it must not say they go on
    if (!s.pulse) return has(s, 'cpr') ? 'Unresponsive, no pulse.' : 'Unresponsive, not breathing normally, no pulse — and no CPR yet.';
    // bagging during the arrest does not mean anyone is bagging him now: the rate of 10 is the crew's, 8 is his own
    if (s.vitals.gcs <= 8) return has(s, 'ventilated') && s.vitals.rr >= 10 ? `Comatose; ventilated at ${s.vitals.rr}/min.` : `Comatose, breathing ${s.vitals.rr}/min on his own.`;
    if (s.vitals.gcs < 13) return 'Drowsy, barely answering.';
    if (has(s, 'shifted')) return '"I can move my legs again. I feel much better."';
    if (has(s, 'calcium')) return '"I feel a bit stronger… still weak."';
    return '"I\'m so weak… I can\'t even lift my legs."';
  },
  respond: {
    // the left arm carries his dialysis fistula: the IV goes in the right
    iv: () => ({ say: [['you', 'IV established: 18 G in the right forearm — not the left arm, which carries his dialysis fistula.']], flags: ['iv'] }),
    io: () => ({ say: [['you', 'IO established: right proximal humerus — away from the fistula arm.']], flags: ['iv'] }),
    vitals: (s) => (s.pulse
      ? { say: [['you', `BP ${s.vitals.sbp}/${s.vitals.dbp} (right arm, away from the fistula) · pulse ${s.rhythm.hr} · RR ${s.vitals.rr} · SpO₂ ${s.vitals.spo2}%`]], flags: ['bp'] }
      : null),
    nibp: (s) => (has(s, 'monitor') && s.pulse
      ? { say: [['monitor', `NIBP ${s.vitals.sbp}/${s.vitals.dbp} mmHg (cuff on the right arm, away from the fistula).`]], flags: ['bp'] }
      : null),
    // a pressure in both arms is no option here: a cuff on the fistula arm can clot the fistula he lives by
    'bp-both-arms': (s) => (s.pulse
      ? { say: [['you', `Right arm ${s.vitals.sbp}/${s.vitals.dbp}. Not on the left: it carries his dialysis fistula — no cuff on that arm.`]], flags: ['bp', 'bp-arms'] }
      : null),

    // Calcium (see calcium()); in arrest the engine's line: pushed and flushed while compressions go on. Calcium chloride
    // 1 g and calcium gluconate 3 g carry about the same calcium (2025 AHA: either, for hyperkalemia with ECG changes)
    'calcium-chloride': (s) => calcium(s, 'Calcium chloride 1 g in slowly over 2–3 minutes; line flushed.', true),
    'calcium-gluconate': (s) => calcium(s, 'Calcium gluconate 3 g IV over 5 minutes; line flushed.', false),
    // the shift is slow (about 30 minutes): it shows later, as an event; for now only the beta-agonist's tremor and a few beats
    'albuterol-hyperk': (s) => {
      if (!s.pulse) return null; // a nebulizer needs a breathing patient: the default blocks it
      const hr = hyperK(s) ? s.rhythm.hr + 4 : s.rhythm.hr;
      return {
        say: [
          ['you', `High-dose albuterol (10–20 mg) running continuously ${has(s, 'ventilated') ? 'inline with the bag' : 'by mask'}: it moves potassium into the cells over the next 30 minutes.`],
          ...ifAwake(s, '"I feel shaky."'), ['monitor', `Heart rate ${hr}.`],
        ],
        rhythm: { ...s.rhythm, hr }, flags: ['albuterol-hyperk'],
      };
    },
    // the same line carries the calcium: it is flushed before and after, or the two form a chalky precipitate in the tubing
    'sodium-bicarbonate': (s) => {
      if (!s.pulse) return null;
      return {
        say: [['you', has(s, 'calcium')
          ? 'Line flushed with 20 mL of saline, sodium bicarbonate 50 mEq IV, then flushed again: calcium and bicarbonate meeting in the tubing form a chalky precipitate that can block the line.'
          : 'Sodium bicarbonate 50 mEq IV; line flushed.']],
        flags: ['bicarbonate'],
      };
    },
    // the potassium, not the vagus, slows him: atropine finds nothing to undo
    atropine: (s) => (s.pulse
      ? { say: [['monitor', `No change: heart rate ${s.rhythm.hr}.`]], flags: ['atropine'] }
      : { say: [['you', 'Atropine 1 mg IV — no change on the monitor.']], flags: ['atropine'] }),
    // a high potassium raises the pacing threshold: before calcium no output makes the ventricles follow the pacer.
    // After calcium the default applies (a rate of 50 or more needs no pacer; a slower one, once the calcium fades, is paced).
    pace: (s) => {
      if (!s.pulse || has(s, 'calcium')) return null;
      // it cannot be tried again (one attempt), so it is switched off: no shocks go on hurting him for nothing
      return {
        say: [
          ['monitor', 'Pacer on: rate 70, output turned all the way up to 140 mA.'],
          ['you', `Spikes at 70 march across the screen, but his own wide complexes go on at ${s.rhythm.hr} between them — no beat follows a spike, and there is no pulse at 70. Pacer off; pads left on.`, 'bad'],
          ...ifAwake(s, '"Aagh! That hurts!"'),
        ],
        flags: ['pads', 'monitor', 'pace-failed'],
      };
    },
    // an epinephrine infusion supports a slow heart and shifts some potassium too (the rate support BRASH needs);
    // it does not replace calcium
    pressor: (s) => {
      if (!s.pulse || !hyperK(s)) return null;
      const before = !has(s, 'calcium');
      const hr = before ? Math.max(s.rhythm.hr, 46) : Math.max(s.rhythm.hr, Math.min(s.rhythm.hr + 6, 66));
      const bp = before ? atLeast(s, 92, 54) : bpAfter(s, 10, 6);
      return { say: [['monitor', `Infusion running: heart rate ${hr}, BP ${bp.sbp}/${bp.dbp}.`]], rhythm: { profile: stage(s), hr }, vitals: bp, flags: ['pressor'] };
    },
    lidocaine: suppress,
    'amio-infusion': suppress,
    'amio-arrest': suppress,
    procainamide: suppress,
    metoprolol: suppress,
    diltiazem: suppress,
    adenosine3: (s) => adenosinePause(s, 4),
    adenosine6: (s) => adenosinePause(s, 6),
    adenosine12: (s) => adenosinePause(s, 8),
    // he cannot pass the fluid: a little pressure, and wetter lungs
    fluid: (s) => {
      if (!s.pulse) return null;
      const bp = bpAfter(s, 4, 2);
      const spo2 = Math.max(85, s.vitals.spo2 - (count(s, 'fluid') >= 1 ? 2 : 1));
      return { say: [['monitor', `Bolus in. BP ${bp.sbp}/${bp.dbp}. SpO₂ ${spo2}%.`]], vitals: { ...bp, spo2 }, flags: ['fluid'] };
    },
    // CPAP helps the wet lungs, but with a pressure under 90 it cuts the return to the heart further
    cpap: (s) => {
      if (!s.pulse) return null;
      const spo2 = Math.min(97, s.vitals.spo2 + 3);
      const bp = s.vitals.sbp < 90 ? bpAfter(s, -8, -4) : { sbp: s.vitals.sbp, dbp: s.vitals.dbp };
      return { say: [['you', 'CPAP applied at 5 cmH₂O.'], ['monitor', `SpO₂ ${spo2}%. BP ${bp.sbp}/${bp.dbp}.`]], vitals: { spo2, ...bp }, flags: ['cpap'] };
    },
    // PEA from the potassium: CPR and epinephrine keep him going, but the circulation comes back only once the potassium is treated
    cpr: (s) => {
      if (s.pulse || !(cprCycles(s) >= 1 && has(s, 'epi') && (has(s, 'calcium') || has(s, 'bicarbonate')))) return null;
      // with an airway in, the crew goes on ventilating through it: 10 breaths a minute, not his own 8
      const tubed = has(s, 'airway');
      return {
        say: [
          ['you', 'After 2 minutes of CPR: organized complexes and a carotid pulse — ROSC.', 'good'],
          ...(tubed ? [['you', 'Still ventilating through the airway, 1 breath every 6 seconds.'] as Line] : []),
        ],
        rhythm: { profile: HYPERK, hr: 48 }, pulse: true, phase: 'rosc',
        vitals: { sbp: 82, dbp: 48, spo2: tubed ? 96 : 92, rr: tubed ? 10 : 8, etco2: tubed ? 38 : 34, gcs: 6, pain: 0 }, flags: ['cpr'],
      };
    },
    // after ROSC he is comatose and breathes 8 a minute: the bag, or an airway once placed, ventilates him
    bvm: (s) => (s.pulse && s.vitals.gcs <= 8
      ? { say: [['you', 'Assisting ventilations, 1 breath every 6 s.'], ['monitor', 'SpO₂ 96%. EtCO₂ 38 mmHg.']], vitals: { spo2: 96, rr: 10, etco2: 38 }, flags: ['ventilated'] }
      : null),
    airway: (s) => (s.pulse && s.vitals.gcs <= 8
      ? { say: [['you', 'Airway placed; confirmed with waveform capnography. Ventilating through it, 1 breath every 6 s.'], ['monitor', 'SpO₂ 96%. EtCO₂ 38 mmHg.']], vitals: { spo2: 96, rr: 10, etco2: 38 }, flags: ['airway', 'ventilated'] }
      : null),
    // the hospital that answers is the one he is going to: the small one has no dialysis team to call in
    notify: (s) => ({
      say: [['hospital', has(s, 'dest-near')
        ? 'Copy. We have no dialysis here: we will have calcium and insulin ready, and start arranging his transfer to the regional center.'
        : has(s, 'arrest')
          ? 'Copy: a dialysis patient resuscitated from a cardiac arrest. Nephrology is calling in the dialysis team, and the resuscitation bay will be ready.'
          : has(s, 'ecg12')
            ? 'Copy: a dialysis patient with those 12-lead changes. Nephrology is calling in the dialysis team, and the resuscitation bay will be ready.'
            : 'Copy: a weak dialysis patient with a slow pulse. Nephrology is on standby.']],
      flags: ['notified'],
    }),
    // bearing down raises the vagal tone: a few seconds slower still, from a rate that is already too slow
    vagal: (s) => (s.pulse && hyperK(s)
      ? { say: [['monitor', `Heart rate ${Math.max(24, s.rhythm.hr - 8)} for a few seconds, then back to ${s.rhythm.hr}.`, 'bad']], flags: ['vagal'] }
      : null),
    // the cath lab is called in for an artery to open; there is none here (the read has been given: the 12-lead is required)
    'stemi-alert': (s) => {
      if (!has(s, 'ecg12')) return null;
      return {
        say: [
          ['hospital', 'Cath lab activated.'],
          ['hospital', 'Interventional cardiologist, two minutes later: "From what you describe there is no ST elevation — nothing for the cath lab to open. We are standing the team down. Take him where he can be dialyzed."', 'warn'],
        ],
        flags: ['alert'],
      };
    },
    // A call can be repeated: each answer is for the patient as he is now. In the arrest there is no 12-lead, no
    // nebulizer and no transport (the engine refuses the first two and scores the third), so the order is the arrest's own
    'med-control': (s) => {
      const calcium = CALCIUMS.reduce((n, id) => n + count(s, id), 0);
      const calciumLeft = calcium < (INTERVENTION_BY_ID['calcium-chloride'].maxTimes ?? Infinity);
      if (!s.pulse) {
        const drugs = calciumLeft
          ? `calcium chloride 1 g IV/IO push${calcium > 0 ? ' again' : ''} and sodium bicarbonate 50 mEq, flushed between them`
          : 'sodium bicarbonate 50 mEq, with the line flushed well after the calcium already given';
        // an arrest that begins en route is worked in the ambulance: only loading a pulseless patient is a mistake
        const where = has(s, 'enroute')
          ? 'You are already on the way: keep the compressions going as well as you can.'
          : 'Work it there: no transport until ROSC; call me back then, and bring him to the regional heart center for dialysis.';
        return {
          say: [['hospital', `Medical control: no pulse in a dialysis patient — treat it as a high potassium. CPR, epinephrine 1 mg every 3–5 minutes, ${drugs}. ${where}`]],
          flags: ['med-control'],
        };
      }
      if (!has(s, 'ecg12')) return { say: [['hospital', 'Medical control: get a 12-lead and call back with what it shows.']], flags: ['med-control'] };
      const dose = !calciumLeft
        ? 'no more calcium from you — the hospital takes over the doses'
        : calcium === 0
          ? 'calcium chloride 1 g now, and again in 5–10 minutes if the changes persist'
          : 'calcium chloride 1 g again in 5–10 minutes if the changes persist';
      const shift = has(s, 'albuterol-hyperk') ? 'keep the high-dose albuterol running' : 'high-dose albuterol';
      const destination = has(s, 'dest-pci')
        ? 'Keep going to the regional heart center: they can dialyze him.'
        : has(s, 'dest-near')
          ? 'The hospital you are going to has no dialysis: he will need a transfer from there.'
          : 'Take him to the regional heart center for dialysis.';
      return {
        say: [['hospital', `Medical control: with those changes in a dialysis patient, treat it as a high potassium — ${dose}; ${shift}; bicarbonate 50 mEq if you suspect acidosis, flushed away from the calcium. ${destination}`]],
        flags: ['med-control'],
      };
    },
    'transport-pci': (s) => (has(s, 'enroute') ? null : {
      say: [['you', `Patient loaded; transporting to the regional heart center, which can start emergency dialysis (${TO_DIALYSIS} min).`]],
      flags: ['enroute', 'dest-pci'], timers: { arrive: s.minute + 2 + TO_DIALYSIS },
    }),
  },
  events: [
    {
      // the potassium keeps climbing: the rate and the pressure fall — never back up, if a drug has already pushed them lower
      id: 'worse',
      // a drug that suppressed the rhythm has already taken him lower: the arrest comes next, not this
      when: (s) => s.pulse && hyperK(s) && !has(s, 'calcium') && !has(s, 'pressor') && !has(s, 'suppressed') && s.minute >= 8,
      effect: (s) => {
        const hr = Math.min(s.rhythm.hr, 30);
        const sbp = Math.min(s.vitals.sbp, 64);
        const dbp = Math.min(s.vitals.dbp, 36);
        // the weakness reaches his breathing muscles: shallower breaths, a lower saturation
        const spo2 = Math.min(s.vitals.spo2, 90);
        return {
          say: [
            ['partner', 'He is getting harder to rouse, and his breathing is shallow.', 'bad'],
            ...(has(s, 'monitor') ? [['monitor', `Heart rate ${hr}. BP ${sbp}/${dbp}. SpO₂ ${spo2}%.`, 'bad'] as Line] : [['partner', 'His radial pulse is barely there.', 'bad'] as Line]),
          ],
          rhythm: { profile: HYPERK_SINE, hr }, vitals: { sbp, dbp, spo2, gcs: Math.min(s.vitals.gcs, 12) },
        };
      },
    },
    {
      // untreated, the slow wide rhythm stops pumping (PEA); a drug that suppresses it brings that on within minutes —
      // unless an infusion started after it has brought the rate back up (then it holds him as long as it would have anyway)
      id: 'arrest',
      when: (s) => s.pulse && hyperK(s) && !has(s, 'calcium')
        && (s.minute >= (has(s, 'pressor') ? 20 : 15)
          || (has(s, 'suppressed') && !(has(s, 'pressor') && s.flags.pressor >= s.flags.suppressed) && s.minute >= s.flags.suppressed + 2)),
      effect: (s) => ({
        say: [
          ['partner', 'He has gone limp and gray — I can\'t feel a pulse!', 'bad'],
          ...(has(s, 'monitor') || has(s, 'pads') ? [['monitor', 'Monitor alarm.', 'bad'] as Line] : []),
        ],
        // no EtCO₂ of its own: the capnograph follows the shared arrest rule (breaths, then compressions)
        rhythm: { profile: 'pea', hr: 24 }, pulse: false, phase: 'arrest',
        vitals: { sbp: 0, dbp: 0, rr: 0, spo2: 80, gcs: 3, pain: 0 },
      }),
    },
    {
      // albuterol has had its 15–30 minutes: potassium has moved into the cells and his strength comes back
      id: 'shift-works',
      when: (s) => s.pulse && hyperK(s) && has(s, 'calcium') && has(s, 'albuterol-hyperk') && s.minute >= s.flags['albuterol-hyperk'] + 15,
      effect: (s) => {
        const hr = Math.max(s.rhythm.hr, 64);
        const bp = atLeast(s, 108, 64);
        return {
          say: [
            comesRound(s)
              ? ['partner', 'He can lift his legs off the stretcher now, and he is talking in full sentences.', 'good']
              : ['partner', 'His rate and pressure are coming up — still no response to voice.', 'good'],
            ['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`, 'good'],
          ],
          // his breathing muscles are strong again: the saturation the weakness cost comes back
          rhythm: { profile: HYPERK_LOWER, hr }, vitals: { ...bp, ...(comesRound(s) ? { gcs: 15, spo2: Math.max(s.vitals.spo2, 93) } : {}) }, flags: ['shifted'],
        };
      },
    },
    {
      // calcium only bought time: 30 minutes on, with nothing to shift the potassium, the rate and the pressure sag again
      id: 'calcium-fades',
      when: (s) => {
        const last = lastCalcium(s);
        return s.pulse && hyperK(s) && last !== null && !has(s, 'albuterol-hyperk') && !has(s, 'pressor') && s.minute >= last + 30;
      },
      effect: (s) => {
        const hr = Math.min(s.rhythm.hr, 46);
        const sbp = Math.min(s.vitals.sbp, 86);
        const dbp = Math.min(s.vitals.dbp, 50);
        return {
          say: [['partner', 'He is getting weaker again.', 'warn'], ['monitor', `Heart rate ${hr}. BP ${sbp}/${dbp}.`, 'warn']],
          rhythm: { profile: stage(s), hr }, vitals: { sbp, dbp, gcs: Math.min(s.vitals.gcs, 14) },
        };
      },
    },
    {
      id: 'arrive-dialysis',
      when: (s) => has(s, 'arrived') && has(s, 'dest-pci'),
      effect: (s) => ({
        say: [has(s, 'notified')
          ? ['hospital', 'The nephrologist and the dialysis nurse are waiting in the resuscitation bay, the machine already set up from your call.', 'good']
          : ['hospital', 'Nobody here knew he was coming: the dialysis team is being called in now, and that takes time.', 'warn']],
      }),
    },
    {
      id: 'arrive-near',
      when: (s) => has(s, 'arrived') && has(s, 'dest-near'),
      effect: () => ({ say: [['hospital', 'This hospital has no dialysis: after more calcium and insulin here, he will need a second transfer to the regional center.', 'warn']] }),
    },
  ],
  critical: [
    // first, so that a hint in the arrest names CPR
    {
      id: 'arrest-cpr', label: 'Cardiac arrest: CPR at once', why: 'PEA is not shockable: high-quality CPR without pauses, then epinephrine and the cause — here the potassium.',
      done: ['cpr'], after: 'arrest', points: 10, target: { within: { flag: 'arrest', minutes: 1 } }, applies: (s) => has(s, 'arrest'),
    },
    {
      id: 'arrest-epi', label: 'Cardiac arrest: epinephrine as soon as possible', why: 'For PEA, epinephrine 1 mg IV/IO as soon as possible, then every 3–5 minutes.',
      done: ['epinephrine'], after: 'arrest', points: 5, target: { within: { flag: 'arrest', minutes: 5 } }, applies: (s) => has(s, 'arrest'),
    },
    {
      id: 'post-vent', label: 'After ROSC: support his breathing (he breathes 8 a minute)', points: 5, applies: (s) => has(s, 'rosc'),
      why: 'After ROSC keep SpO₂ 90–98 % and EtCO₂ 35–45 mmHg: a comatose patient breathing 8 a minute needs assisted ventilation, through an airway if one is in.',
      // an airway placed during the arrest goes on being used: he is ventilated through it from the moment of ROSC
      done: (s) => (s.flags.rosc === undefined ? null : has(s, 'airway') && s.flags.airway <= s.flags.rosc ? s.flags.rosc : firstDone(s, ['bvm', 'airway'], 'rosc')),
      uses: ['bvm', 'airway'],
    },
    {
      // ROSC comes back at 82/48 (MAP 59); calcium again, a pressor or push-dose epinephrine brings it up. One small bolus
      // is a reasonable first try too, though in an overloaded dialysis patient it does little
      id: 'post-bp', label: 'After ROSC: treat the low pressure (MAP under 65)', points: 5, applies: (s) => has(s, 'rosc'),
      why: 'After ROSC avoid hypotension: keep the MAP at 65 mmHg or more (2025 AHA). Here calcium again (the potassium is still high), an epinephrine infusion or push-dose epinephrine.',
      done: [...CALCIUMS, 'pressor', 'push-epi', 'fluid'], after: 'rosc',
    },
    { id: 'ecg', label: '12-lead ECG early', why: 'Weak and slow in a dialysis patient: the 12-lead shows whether the potassium is reaching the heart (peaked T waves, flattened P waves, a widening QRS) — the sign to give calcium now.', done: ['ecg12'], points: 10, target: { by: 6 } },
    { id: 'history', label: 'History: his dialysis schedule and the missed sessions (SAMPLE)', why: 'Two missed sessions (five days since his last dialysis, on Monday) and a potassium-rich meal explain the tracing — and point to the hospital that can dialyze him.', done: ['sample'], points: 5 },
    { id: 'pads', label: 'Pads on early', why: 'A slow rhythm this unstable can stop at any moment. Expect pacing to fail while the potassium is high (it raises the pacing threshold): calcium comes first.', done: PADS, points: 5, target: { by: 8 } },
    { id: 'iv', label: 'IV access — not in the fistula arm', why: 'For calcium. Never put a needle, a tourniquet or a BP cuff on the arm with the dialysis fistula: it is his lifeline for dialysis.', done: ['iv', 'io'], points: 5 },
    {
      id: 'calcium', label: 'IV calcium at once for the ECG changes',
      why: 'Calcium steadies the heart within minutes and is the first drug for hyperkalemia with ECG changes. It lowers no potassium and lasts only 30–60 minutes: repeat it if the changes persist after 5–10 minutes.',
      done: CALCIUMS, points: 20, target: { by: 10 },
    },
    { id: 'recheck', label: 'Reassess the rate and pressure after the calcium', why: 'Look for its effect (a faster rate, a better pressure); if the changes persist after 5–10 minutes, give another dose.', done: ['nibp', 'vitals', 'reassess', 'pulse-check', 'ecg12-repeat'], after: 'calcium', points: 5 },
    { id: 'shift', label: 'Shift the potassium: high-dose albuterol (10–20 mg nebulized)', why: 'Albuterol moves potassium into the cells within about 30 minutes (insulin with dextrose does the same in hospital); calcium only buys time. The wheezing dose (2.5–5 mg) is far too small.', done: ['albuterol-hyperk'], points: 10 },
    { id: 'notify', label: 'Early call to the receiving hospital', why: 'In a patient whose kidneys have failed, dialysis is the only fast way to remove the potassium: an early call lets nephrology have the dialysis team and machine ready when you arrive.', done: ['notify'], points: 5, target: { by: 15 } },
    { id: 'destination', label: 'Transport to the hospital that can dialyze him', why: 'The nearest emergency department has no dialysis: calcium and albuterol only buy an hour or two, and he would need a second transfer.', done: (s) => s.flags['dest-pci'] ?? null, uses: ['transport-pci'], points: 10 },
    { id: 'handoff', label: 'Hand-off', why: 'Report the missed sessions, the 12-lead, each calcium dose with its time and effect, the albuterol, and the fistula arm.', done: ['handoff'], points: 5 },
  ],
  harms: yieldToHeavier([
    {
      // Atropine is not here: it is the bradycardia algorithm's first drug and harmless, so trying it costs only the minute
      // it takes (it does nothing). Pacing is judged only once there is a line to give the calcium through: before that,
      // trying the pacer while the IV goes in is a fair bridge.
      id: 'pace-before-calcium', actions: ['pace'], when: (s) => s.pulse && has(s, 'iv') && !has(s, 'calcium'), replaces: ['pace-no-analgesia'], points: 3, severity: 'minor',
      text: 'Pacing before calcium, with the line already in. In a dialysis patient this slow and wide the cause comes first: a high potassium raises the pacing threshold, so the pacer often cannot take over, and the attempt hurts. Give calcium first; pacing or an epinephrine infusion is for a rate still too slow after it.',
    },
    { id: 'atropine-arrest', actions: ['atropine'], when: (s) => !s.pulse, points: 3, severity: 'minor', replaces: ['atropine-in-arrest'], text:'Atropine in PEA. It has not been part of the cardiac-arrest algorithm since 2010: CPR, epinephrine and the reversible cause — here the potassium.' },
    {
      // one rule for all of them, in its own words; it stands in for the built-in procainamide and arrest-amiodarone rules
      id: 'antiarrhythmic-wide', actions: ['lidocaine', 'amio-infusion', 'amio-arrest', 'procainamide'], points: 15, severity: 'critical',
      replaces: ['procainamide-slow', 'procainamide-hypotension', 'procainamide-in-arrest', 'arrest-amio-with-pulse', ...LIDOCAINE_RULES, ...RATE_RULES],
      text: 'Lidocaine, amiodarone or procainamide for the wide complexes. This is not VT: a high potassium widens the QRS by depressing the heart\'s sodium channels, and these drugs depress them further — the rate falls and the heart can stop. Treat the potassium: calcium.',
    },
    {
      id: 'av-blocker', actions: ['metoprolol', 'diltiazem'], replaces: RATE_RULES, points: 12, severity: 'critical',
      text: 'A beta-blocker or calcium-channel blocker for a slow heart with a high potassium. Both slow the AV node and weaken the squeeze; with the potassium they spiral toward standstill (BRASH: bradycardia, renal failure, AV-nodal blockade, shock, hyperkalemia).',
    },
    { id: 'adenosine-slow', actions: ['adenosine3', 'adenosine6', 'adenosine12'], replaces: RATE_RULES, points: 8, severity: 'major', text: 'Adenosine for a slow rhythm. It blocks the AV node for several seconds: at a rate this slow that is a pause with no output, and it treats nothing here.' },
    // the built-in no-indication rule too: at any rate this case's words judge the maneuver (one act, one penalty)
    { id: 'vagal-slow', actions: ['vagal'], when: (s) => s.pulse, replaces: ['vagal-no-indication'], points: 3, severity: 'minor', text: 'A vagal maneuver for a slow rhythm. It slows the heart further; it is for a fast, regular narrow-complex tachycardia.' },
    // a pacer that has captured (after the calcium wore off) hurts: then analgesia and sedation are right
    {
      // midazolam is the same mistake as 'sedation' here, so it replaces the built-in midazolam rule (one penalty, not two)
      // a sedative into a low pressure, slow breathing or a drowsy patient is the built-in rule's heavier reason (5): it charges
      id: 'sedation-no-pain', actions: ['fentanyl', 'sedation', 'midazolam'], replaces: SEDATIVE_RULES, when: (s, sc, id) => s.pulse && s.vitals.pain === 0 && s.rhythm.profile !== 'tcp' && !(id !== 'fentanyl' && unsafeToSedate(s, sc, id)), points: 3, severity: 'minor',
      text: 'An opioid or sedation for a patient with no pain and nothing to sedate him for. With his pressure this low and his breathing muscles weak, it only adds hypotension and slower, shallower breathing.',
    },
    { id: 'false-alert', actions: ['stemi-alert'], points: 3, severity: 'minor', replaces: ['stemi-alert-no-ste'], text: 'A STEMI alert without ST elevation. It calls the cath lab team in for an artery that is not blocked, and points the patient at a lab when what he needs is dialysis.' },
    {
      id: 'magnesium-renal', actions: ['magnesium-sulfate'], points: 5, severity: 'major', replaces: ['magnesium-routine-arrest', 'magnesium-renal-failure', 'magnesium-no-indication'],
      text: 'Magnesium for a dialysis patient. Nothing here calls for it, and failed kidneys cannot clear it: a high magnesium adds weakness, slows the heart and lowers the pressure.',
    },
    { id: 'fluid-overload', actions: ['fluid'], when: (s) => count(s, 'fluid') >= 1, points: 3, severity: 'minor', text: 'Repeated fluid boluses for a dialysis patient who missed two sessions. He cannot pass the fluid, his lungs are already wet, and the low pressure comes from the slow rate, not from too little volume.' },
    { id: 'cpap-shock', actions: ['cpap'], when: (s) => s.pulse && s.vitals.sbp < 90, replaces: ['cpap-hypotension', 'cpap-vomiting', 'cpap-preload-dependent', 'cpap-drowsy', 'cpap-no-indication'], points: 6, severity: 'major', text: 'CPAP with a systolic pressure under 90 mmHg. It cuts the blood returning to the heart and can deepen the shock: fix the rate and the pressure first (calcium).' },
    { id: 'no-dialysis', actions: ['transport-near'], when: (s) => s.pulse, points: 3, severity: 'minor', text: 'The nearest emergency department cannot dialyze him. Calcium and albuterol only buy time, and he would need a second transfer: go to the regional center that can.' },
  ]),
  timings: [
    { label: '12-lead', actions: ['ecg12'], target: 6 },
    { label: 'Pads on', actions: PADS, target: 8 },
    { label: 'Calcium', actions: CALCIUMS, target: 10 },
    { label: 'High-dose albuterol', actions: ['albuterol-hyperk'] },
    { label: 'Call to the hospital', actions: ['notify'], target: 15 },
  ],
  transportMinutes: TO_DIALYSIS,
  nearestMinutes: 6,
  // which hospital it is, and whether it was ready, comes from the arrival events
  arrival: 'You arrive; the emergency team meets you at the door.',
  teaching: [
    'Think of a high potassium in any dialysis patient who missed a session, or anyone with kidney failure, weakness and a slow pulse. Its ECG signs: tall, narrow, peaked T waves; flattened or lost P waves and a long PR; a widening QRS; then a slow sine wave, PEA, VF or asystole. The changes do not always come in order, and a dangerous potassium can show a nearly normal ECG.',
    'With ECG changes, calcium comes first: calcium chloride 1 g (10 mL of 10 %) slowly through a large, free-flowing vein, or calcium gluconate 3 g (30 mL of 10 %), which is safer in a small peripheral vein. It works within minutes, lasts 30–60 minutes and lowers no potassium; repeat it if the changes persist after 5–10 minutes.',
    'Then shift the potassium into the cells: nebulized albuterol 10–20 mg (4–8 times the wheezing dose) acts within about 30 minutes; in hospital, insulin 10 units IV with dextrose 25 g (a dialysis patient clears insulin slowly: watch the glucose for hours). Sodium bicarbonate helps mainly when there is metabolic acidosis, and it adds sodium and fluid.',
    'Calcium and bicarbonate must never meet in the same line: they form a chalky calcium carbonate precipitate. Flush with saline between them, or use a second line.',
    'In a patient whose kidneys have failed, dialysis is the only fast way to remove the potassium (binders take hours): go to a hospital that can dialyze, and call ahead early.',
    'Atropine may be tried but rarely helps a slow rhythm caused by potassium, and a high potassium raises the pacing threshold, so the pacer may not take over: pads on, but calcium first. If the rate is still too slow after it, an epinephrine infusion supports the rate and shifts some potassium too.',
    'Never give lidocaine, amiodarone or procainamide for wide complexes from a high potassium: they depress conduction further. Avoid AV-nodal blockers — a beta-blocker or calcium-channel blocker plus a high potassium can drive the heart into BRASH syndrome (bradycardia, renal failure, AV-nodal blockade, shock, hyperkalemia).',
    'Never put a BP cuff, tourniquet or IV on the arm with a dialysis fistula. A dialysis patient who missed sessions is usually fluid-overloaded: small boluses only, if any.',
    'In a hyperkalemic cardiac arrest: high-quality CPR and epinephrine as for any PEA (a shock for VF); calcium and bicarbonate may be given without pausing compressions, but their benefit in arrest is not well established (2025 AHA), and there is no evidence that albuterol adds anything during the arrest — a nebulizer needs a patient who is breathing. After ROSC keep the MAP at 65 or more.',
  ],
};
