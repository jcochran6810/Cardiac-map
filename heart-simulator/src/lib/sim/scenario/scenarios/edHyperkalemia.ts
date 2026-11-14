import type { Effect, Line, Scenario, SimState, Speaker } from '../types';
import { INTERVENTION_BY_ID } from '../interventions';
import { LOW_GLUCOSE, PADS, bpAfter, count, cprCycles, firstDone, has, line, orderedFlag } from '../kit';
import { askCritical, askDone, askEvents, askHarm, type LabAsk } from '../labKit';
import { DOOR_TO_ECG, ED_MD, ED_RN, ED_TEAM, edNurse, physicianDispo, physicianOrder } from '../edKit';
import { SEDATIVE_RULES } from '../rules/acs';
import { LIDOCAINE_RULES, RATE_RULES, yieldToHeavier } from '../rules/rhythm';

/**
 * Severe hyperkalemia in the emergency department. A 66-year-old man walks in with his wife: two days of nausea, legs
 * like rubber, a pulse of 38 and a pressure in the 80s. Under it: kidney disease (stage 4), lisinopril, spironolactone
 * added six weeks ago, ten days of ibuprofen for a sore knee and a potassium salt substitute — a potassium of 7.8 with a
 * metabolic acidosis. The 12-lead shows it long before the lab does.
 *
 * The ER nurse (6) is the triage nurse who takes him into resus 3: she triages him, puts the pads on, calls the
 * physician, gets a large-bore line, the 12-lead and the labs — and takes the 12-lead to the physician the moment it
 * prints. Every drug is on the computer physician's order (this department has no nurse-driven hyperkalemia protocol),
 * one dose per order: calcium at once, a glucose, then dextrose with insulin and a glucose recheck, high-dose albuterol,
 * a second gram of calcium and the bicarbonate — never into the calcium while it is still running in. She reports the
 * critical potassium at once and repeats the 12-lead. The ER doctor (7) has a computer nurse for the monitor, the pads,
 * the line and the 12-lead, and makes every decision: calcium before the lab, the shift and the glucose rechecks it needs,
 * the cause, the bicarbonate only for the acidosis, nephrology for emergency dialysis and an ICU bed, the repeat 12-lead.
 *
 * Left untreated, the QRS widens, the rate falls and the complexes run together; he arrests in a slow PEA at 18 minutes.
 * The tracing keeps the 'hyperkalemia' profile throughout (only its rate changes): the words of the reads and the team
 * describe what that tracing shows, never a narrower QRS it does not draw.
 */

/** His rhythm while the potassium is high: the case keeps it until he arrests or a pacer takes over */
const HYPERK = 'hyperkalemia';

/** The potassium on the first lab, and the minutes from drawing the labs to the result (a STAT chemistry and gas from the main lab) */
const K_FIRST = 7.8;
const LAB_MINUTES = 10;

/** Minutes a gram of calcium chloride takes to go in with a pulse: the line carries nothing else until it is in and flushed */
const CALCIUM_RUNS = 5;

/**
 * The glucose recheck that counts (and brings a repeat potassium with it): from 20 minutes after the insulin, when the
 * dextrose has run its course and the insulin is at work (the order says about 30 minutes, then every hour); a check
 * sooner only shows the dextrose
 */
const RECHECK_FROM = 20;

/** Minutes a repeat 12-lead takes to record: the tracing is printed at the end */
const REPEAT_ECG_MINUTES = INTERVENTION_BY_ID['ecg12-repeat'].minutes;

/**
 * The first repeat 12-lead whose tracing shows the shift — one finished at or after the minute it worked, even if it was
 * started just before — or null
 */
function repeatAfterShift(s: SimState): number | null {
  const at = s.flags.shifted;
  if (at === undefined) return null;
  return s.performed.find((p) => p.id === 'ecg12-repeat' && p.minute + REPEAT_ECG_MINUTES >= at)?.minute ?? null;
}

/** Who notices a change beside the learner: the computer nurse in the doctor's run, a colleague in the nurse's */
const teammate = (s: SimState): Speaker => (s.role === 7 ? 'nurse' : 'team');

/** Only a patient awake enough to talk says how a drug feels */
const ifAwake = (s: SimState, text: string): Line[] => (s.pulse && s.vitals.gcs >= 13 ? [['patient', text]] : []);

/** A drug that helps brings the pressure up to (at least) this: never down from a higher one */
const atLeast = (s: SimState, sbp: number, dbp: number) => ({ sbp: Math.max(s.vitals.sbp, sbp), dbp: Math.max(s.vitals.dbp, dbp) });

/** After an arrest the brain has been without blood: a better rhythm does not wake him, so only a patient who never arrested comes round */
const comesRound = (s: SimState) => !has(s, 'rosc');

/** The 12-lead is recorded and the learner has read it: from now on the pattern on it is known */
const ecgSeen = (s: SimState) => has(s, 'ecg12') && s.reads.some((r) => r.kind === 'ecg');

/** The ED physician is at the bedside (the nurse's run) */
const mdHere = (s: SimState) => has(s, 'md-present');

/** The potassium result has reached the physician (reported by the nurse, or found on the screen) */
const kWithMd = (s: SimState) => has(s, 'k-reported') || has(s, 'k-md-found');
const kWithMdAt = (s: SimState) => s.flags['k-reported'] ?? s.flags['k-md-found'];

/** A gram of calcium is still going into the line: nothing else may meet it there until it is in and the line flushed */
const calciumRunning = (s: SimState) => s.timers.calciumUntil !== undefined && s.minute < s.timers.calciumUntil;

/** Grams of calcium given so far, by anyone (the learner's doses, and the physician's when the order was not carried out) */
const calciumDoses = (s: SimState) => count(s, 'calcium-chloride') + count(s, 'calcium-gluconate') + (has(s, 'md-calcium') ? 1 : 0);

/** Calcium chloride 1 g, or calcium gluconate 3 g (the same calcium, gentler on a peripheral vein): either answers */
const CALCIUMS = ['calcium-chloride', 'calcium-gluconate'];

/**
 * The potassium now, for the recheck: insulin moves about 0.8 into the cells within 20 minutes, albuterol about 0.6 within
 * 30; bicarbonate adds a little with this acidosis. Nothing removes any of it until he is dialyzed
 */
function potassium(s: SimState): string {
  let k = K_FIRST;
  if (has(s, 'insulin') && s.minute >= s.flags.insulin + 20) k -= 0.8;
  if (has(s, 'albuterol-hyperk') && s.minute >= s.flags['albuterol-hyperk'] + 30) k -= 0.6;
  if (has(s, 'bicarbonate')) k -= 0.1;
  return k.toFixed(1);
}

/**
 * An order is for one dose: once the ER nurse has given it (or the physician has, when it waited too long), the order is
 * used up, and another dose needs another order (the engine's rn-without-order rule scores one given without)
 */
const orderUsedUp = (s: SimState, id: string): string[] => (s.role === 6 ? [orderedFlag(id)] : []);

/**
 * Calcium raises the threshold the potassium has pushed the heart's cells toward: within minutes the rate and the pressure
 * come up. It lowers no potassium, leaves the tracing's changes of a high potassium in place (the QRS stays wide) and wears
 * off in 30–60 minutes. Calcium chloride (three times the calcium of the gluconate) for a patient this unstable, through a
 * large vein, slowly: the line is busy until it is in
 */
function calcium(s: SimState, who: Speaker, gluconate = false): Effect {
  const given = line(who, gluconate
    ? 'Calcium gluconate 3 g IV through the right antecubital line, over 5–10 minutes; the site watched.'
    : 'Calcium chloride 1 g IV through the right antecubital line, going in slowly over 5 minutes; the site watched for a leak.');
  // one order covers either salt: a dose of one uses it up for both
  const clear = CALCIUMS.flatMap((id) => orderUsedUp(s, id));
  // in an arrest it is pushed and flushed while the compressions go on
  if (!s.pulse) return { say: [line(who, `${gluconate ? 'Calcium gluconate 3 g' : 'Calcium chloride 1 g'} pushed and flushed; compressions go on.`)], flags: ['calcium'], clear };
  const timers = { calciumUntil: s.minute + CALCIUM_RUNS, calciumLast: s.minute };
  if (s.rhythm.profile !== HYPERK) return { say: [given], flags: ['calcium'], timers, clear };
  // the first dose (or one after it has worn off) does most; a repeat lifts the rate a little more
  const first = !has(s, 'calcium') || s.rhythm.hr < 50;
  const hr = first ? Math.max(s.rhythm.hr, 52) : Math.max(s.rhythm.hr, Math.min(s.rhythm.hr + 8, has(s, 'calcium-2') ? 66 : 62));
  const bp = first ? atLeast(s, 100, 60) : bpAfter(s, 6, 4);
  const eyes: Speaker = s.role === 7 ? 'nurse' : 'you';
  const qrs = first ? 'On the monitor the rate is up — but the complexes are still wide, the T waves still tall.' : 'On the monitor the rate comes up a little more; the complexes are still wide.';
  return {
    say: [given, ...(gluconate ? [] : ifAwake(s, '"That burns going up my arm."')), ['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`, 'good'], [eyes, qrs]],
    rhythm: { profile: HYPERK, hr }, vitals: { ...bp, ...(first && comesRound(s) ? { gcs: 15 } : {}) },
    flags: first ? ['calcium'] : ['calcium', 'calcium-2'], timers, clear,
  };
}

/**
 * Dextrose with it, so he never has insulin alone; the insulin works within 15–30 minutes and its low can come hours later.
 * The ER nurse gives it on the physician's order, which asks for the rechecks; the ER doctor's nurse waits to be told when
 * to recheck — ordering the rechecks is the doctor's decision
 */
function insulin(s: SimState, who: Speaker): Effect {
  const given = 'Regular insulin 10 units IV — the dose checked by a second nurse — with dextrose 25 g (D50 50 mL) straight behind it.';
  return {
    say: [[who, s.role === 7 ? `${given} "His glucose was ${s.vitals.glucose} before it. When do you want it rechecked?"` : `${given} Glucose rechecked in about 30 minutes, then every hour.`]],
    vitals: { glucose: Math.max(s.vitals.glucose, 212) }, flags: ['insulin'],
  };
}

/** High-dose albuterol: it moves potassium into the cells over 30–60 minutes; for now only the tremor and a few beats */
function albuterol(s: SimState, who: Speaker): Effect | null {
  if (!s.pulse) return null; // a nebulizer needs a breathing patient: the default blocks it
  const hr = s.rhythm.profile === HYPERK ? s.rhythm.hr + 4 : s.rhythm.hr;
  return {
    say: [[who, 'Albuterol 10 mg (the concentrated solution) by nebulizer and mask, running over about 10 minutes.'], ...ifAwake(s, '"I feel shaky."'), ['monitor', `Heart rate ${hr}.`]],
    rhythm: { ...s.rhythm, hr }, flags: ['albuterol-hyperk'],
  };
}

/** What the physician still wants in place, in the nurse's run: the pads, a line in a big vein, the 12-lead */
function setupStillNeeded(s: SimState): string {
  const want = [
    ...(has(s, 'pads') ? [] : ['pads on him']),
    ...(has(s, 'iv') ? [] : ['a line in a big vein']),
    ...(has(s, 'ecg12') ? [] : ['a 12-lead — I want to see it the moment it prints']),
  ];
  if (!want.length) return '';
  const last = want.pop()!;
  const list = want.length ? `${want.join(', ')} and ${last}` : last;
  return ` ${list.charAt(0).toUpperCase()}${list.slice(1)}.`;
}

/**
 * Lidocaine, amiodarone, procainamide, a beta-blocker or a calcium-channel blocker on a heart the potassium already slows:
 * they depress the same conduction further. Before calcium he falls to 30 and arrests within minutes; after it, he sags
 */
function suppress(s: SimState, drug: string): Effect | null {
  if (!s.pulse || s.rhythm.profile !== HYPERK) return null;
  const v = s.vitals;
  const given = line(edNurse(s), `${drug} in.`);
  if (!has(s, 'calcium')) {
    const sbp = Math.min(v.sbp, 58);
    const dbp = Math.min(v.dbp, 32);
    return {
      say: [given, ['monitor', `Heart rate 30. BP ${sbp}/${dbp}.`, 'bad'], ['patient', 'His eyes roll back and he barely responds.', 'bad']],
      rhythm: { profile: HYPERK, hr: 30 }, vitals: { sbp, dbp, gcs: Math.min(v.gcs, 10) }, flags: ['suppressed'],
    };
  }
  const hr = Math.max(30, s.rhythm.hr - 14);
  const bp = bpAfter(s, -16, -10);
  return {
    say: [given, ['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`, 'bad'], ...ifAwake(s, '"I feel faint again…"')],
    rhythm: { profile: HYPERK, hr }, vitals: { ...bp, gcs: Math.min(v.gcs, 13) }, flags: ['suppressed'],
  };
}

/** Adenosine blocks the AV node for several seconds: at this rate, a pause with no output */
function adenosinePause(s: SimState, seconds: number): Effect | null {
  if (!s.pulse || s.rhythm.profile !== HYPERK) return null;
  return {
    say: [['monitor', `${seconds} seconds with no complexes at all… then the slow beats return at ${s.rhythm.hr}.`, 'bad'], ...ifAwake(s, '"Everything went gray…"')],
    flags: ['adenosine'],
  };
}

/**
 * A high potassium raises the pacing threshold: before calcium no output makes the ventricles follow the pacer, through
 * the pads or a wire. After calcium the engine's defaults apply (a rate of 50 or more needs no pacer)
 */
function noCapture(s: SimState, how: 'pads' | 'wire'): Effect {
  if (how === 'wire') {
    return {
      say: [['you', `Balloon-tipped pacing wire floated through the introducer sheath to the right ventricle — but even at the full 20 mA only an occasional spike brings a beat: his own wide complexes go on at ${s.rhythm.hr}. The threshold is far too high.`, 'bad']],
      flags: ['temp-wire', 'pace-failed'],
    };
  }
  return {
    say: [
      ['monitor', 'Pacer on: rate 70, output turned all the way up to 140 mA.'],
      [edNurse(s), `Spikes at 70 march across the screen, but his own wide complexes go on at ${s.rhythm.hr} between them — no beat follows a spike, and the femoral pulse stays at ${s.rhythm.hr}. Pacer off; pads left on.`, 'bad'],
      ...ifAwake(s, '"Aagh! That hurts!"'),
    ],
    flags: ['pads', 'monitor', 'pace-failed'],
  };
}

// ─── The ED physician's orders, in the ER nurse's run ──────────────────────

const CALCIUM: LabAsk = {
  id: 'calcium', role: 6, speaker: 'physician',
  when: (s) => s.pulse && mdHere(s) && has(s, 'ecg-shown') && ecgSeen(s),
  ask: '"Look at those T waves, and that wide QRS at this rate — with his kidneys and his pills. Calcium chloride 1 gram IV now, slowly, through a big vein. We are not waiting for the lab."',
  // calcium gluconate 3 g is the same calcium (what a peripheral line takes more kindly)
  accept: CALCIUMS,
  wrong: ['atropine'],
  wrongSay: '"Not atropine — it will not touch a rate this slow from this cause. Calcium, please, now."',
  thanks: '"Good. Watch the rate, the QRS and the IV site: calcium chloride burns if it leaks."',
  fallback: '"I am pushing the calcium myself — this cannot wait."',
  // with no line in yet, the physician puts one in first
  fallbackEffect: (s) => {
    const done = calcium(s, 'physician');
    const access: Line[] = has(s, 'iv') ? [] : [['physician', 'An 18 G line goes into his right antecubital vein first.']];
    return { ...done, say: [...access, ...(done.say ?? [])], flags: [...(done.flags ?? []), 'md-calcium', 'iv'] };
  },
  gives: 'calcium-given',
  label: 'Calcium on the physician\'s order — at once',
  why: 'Peaked T waves, a wide QRS and a slow rate in a patient with kidney disease on an ACE inhibitor and spironolactone: IV calcium steadies the heart\'s membranes within minutes, before the potassium is back from the lab. Give it slowly through a large vein, and watch the site.',
  points: 15, wait: 4, within: 3,
};

const SHIFT: LabAsk = {
  id: 'shift', role: 6, speaker: 'physician',
  when: (s) => s.pulse && has(s, 'calcium'),
  ask: '"Next, shift it into the cells: check his glucose first, then dextrose 25 grams and regular insulin 10 units IV — and a glucose in 30 minutes and every hour after that."',
  accept: ['insulin-dextrose'],
  thanks: '"Thank you. Keep the glucose checks going: his kidneys clear insulin slowly, and the low can come hours from now."',
  fallback: '"I will give the dextrose and insulin myself."',
  // the physician gave the ordered dose: the order is used up
  fallbackEffect: (s) => {
    const done = insulin(s, 'physician');
    return { ...done, flags: [...(done.flags ?? []), 'glucose-checked'], clear: [orderedFlag('insulin-dextrose')] };
  },
  gives: 'shift-given',
  label: 'Insulin with dextrose on the physician\'s order',
  why: 'Insulin moves potassium into the cells within 15–30 minutes; the dextrose goes in with it, so he never has insulin alone, and the glucose is checked before and rechecked after.',
  points: 10, wait: 5, within: 3,
};

const NEB: LabAsk = {
  id: 'neb', role: 6, speaker: 'physician',
  when: (s) => s.pulse && has(s, 'calcium'),
  ask: '"And albuterol 10 to 20 milligrams by nebulizer."',
  accept: ['albuterol-hyperk'],
  wrong: ['albuterol'],
  wrongSay: '"That is the wheezing dose — 2.5 milligrams will not move his potassium. Ten to twenty milligrams, please."',
  thanks: '"Thanks. He will feel shaky and his heart will speed up a little: that is the albuterol."',
  fallback: '"I have asked respiratory therapy to start the albuterol."',
  fallbackEffect: (s) => ({ ...(albuterol(s, 'team') ?? {}), clear: [orderedFlag('albuterol-hyperk')] }),
  gives: 'neb-given',
  label: 'High-dose albuterol on the physician\'s order',
  why: 'Albuterol 10–20 mg nebulized (four to eight times the wheezing dose) moves potassium into the cells within 30–60 minutes and adds to the insulin.',
  points: 5, wait: 5, within: 3,
};

const CALCIUM_AGAIN: LabAsk = {
  id: 'calcium-again', role: 6, speaker: 'physician',
  when: (s) => s.pulse && kWithMd(s) && has(s, 'calcium') && calciumDoses(s) < 2 && s.minute >= s.flags.calcium + 4,
  ask: '"7.8 — and the QRS on the monitor is still wide. A second gram of calcium chloride now."',
  accept: CALCIUMS,
  thanks: '"Good."',
  fallback: '"I will give the second gram myself."',
  fallbackEffect: (s) => {
    const done = calcium(s, 'physician');
    return { ...done, flags: [...(done.flags ?? []), 'md-calcium'] };
  },
  gives: 'calcium-again-given',
  label: 'A second gram of calcium on the order',
  why: 'Calcium is repeated when the ECG changes persist 5–10 minutes after the first dose: here the QRS is still wide.',
  points: 5,
};

const ECG_AGAIN: LabAsk = {
  id: 'ecg-again', role: 6, speaker: 'physician',
  // a nurse who has already repeated it after the shift is not asked again
  when: (s) => s.pulse && has(s, 'shifted') && repeatAfterShift(s) === null,
  ask: '"He looks better. Repeat the 12-lead, please — I want to see what the potassium is doing to his heart now."',
  accept: ['ecg12-repeat'],
  thanks: '"Thank you — better, but not normal yet."',
  fallback: '"I have repeated the 12-lead myself."',
  gives: 'ecg-again-given',
  label: 'Repeat the 12-lead on the order',
  why: 'The 12-lead is how the heart shows the potassium: repeat it after the treatment and whenever the rhythm changes. Here it shows the same pattern at a rate that holds his pressure — the potassium is still high until it is removed.',
  points: 5,
};

/**
 * The nurse's item for an order: answered by her before the physician gave up waiting and did it (askCritical counts any
 * later answer, but a dose given after the physician's own is a second dose, which the order did not ask for)
 */
function ownAnswer(a: LabAsk) {
  return { ...askCritical(a), done: (s: SimState) => (s.fired.includes(`${a.id}-fallback`) ? null : askDone(s, a)) };
}

export const edHyperkalemia: Scenario = {
  id: 'hyperkalemia-ed',
  title: 'Legs like rubber',
  summary: '66-year-old man who walked in with his wife: weak, sick to his stomach, a pulse in the 30s and a low pressure. Find out why his heart is slowing — and stop it before it stops.',
  setting: 'ed',
  roles: [6, 7],
  difficulty: 'advanced',
  conditionId: 'hyperkalemia',
  briefing: {
    default: [
      ['team', 'Triage: a 66-year-old man has walked in with his wife — weak, sick to his stomach, a pulse of 38 on the triage monitor.'],
    ],
    // the learner is the triage nurse who takes him in, as in the department's other cases: the triage level is hers to set
    6: [
      ['team', 'Late morning at the triage desk. A 66-year-old man comes in on his wife\'s arm — weak, sick to his stomach, pale and slow — and sinks into a wheelchair. The triage oximeter reads a pulse of 38.'],
      ['team', 'You are the triage nurse, and he will be your patient in resus 3: you set his triage level, assess and monitor him, give each drug on the physician\'s order, and speak up. The ED physician is finishing with a patient in resus 1: call when you need them. Drugs here are on the physician\'s order — the only standing orders are the chest pain set.'],
      ['patient', 'Slow to move from the wheelchair to the stretcher: "My legs feel like rubber."'],
    ],
    7: [
      ['team', 'Resus 3: the triage nurse wheels in a 66-year-old man who walked in with his wife — weak, sick to his stomach, a pulse of 38 on the triage monitor. His nurse is with you.'],
      ['team', 'You are the ED physician: the diagnosis, the orders and the procedures are yours.'],
      ['patient', 'Pale and slow to move from the wheelchair to the stretcher: "My legs feel like rubber."'],
    ],
  },
  initial: {
    rhythm: { profile: HYPERK, hr: 38 },
    // a metabolic acidosis he breathes off (a faster rate, a low EtCO₂: a bicarbonate of 12 takes the arterial CO₂ down to
    // about 26, and the end-tidal reads a little under it) and a low pressure from the slow rate
    vitals: { sbp: 86, dbp: 50, spo2: 95, rr: 20, etco2: 24, pain: 0, gcs: 15, glucose: 136, temp: 36.7 },
  },
  // the case has to say so: calcium, bicarbonate, insulin and high-dose albuterol are right here, and the built-in rules
  // otherwise count them as given with no indication
  problems: ['hyperkalemia', 'metabolic-acidosis', 'renal-failure'],
  facts: {
    // the triage nurse's level, in her own words: a slow rate with a low pressure needs a life-saving intervention now
    triage: 'ESI 1: a pulse of 38 with a pressure of 86/50 in a weak, pale man — he needs a life-saving intervention now. Straight to resus 3, onto the monitor with the pads on, and the physician to the bedside.',
    opqrst: '"No pain anywhere. For two days I\'ve felt sick to my stomach and weaker by the hour — my legs feel like rubber, and my lips and fingers tingle. This morning I could barely get up the porch steps."',
    pde5: '"No."',
    lungs: (s) => (count(s, 'fluid') >= 2 ? 'Crackles a third of the way up both sides now.' : 'A few fine crackles at both bases.'),
    perfusion: 'Pale, with cool hands; capillary refill 3 seconds; neck veins flat sitting at 45°; trace swelling at both ankles.',
    neuro: (s) => (has(s, 'shifted') && comesRound(s)
      ? 'Alert and quick to answer; he can hold both legs off the bed now; grip stronger; no facial droop, speech clear.'
      : 'Alert, a little slow to answer. Both legs weak — he cannot hold them off the bed; a weak grip; sensation intact; knee reflexes faint; no facial droop, speech clear.'),
    ecg12: (s) => {
      const hr = s.rhythm.hr;
      if (s.rhythm.profile === 'tcp') return `Transcutaneous pacing at ${hr}: a spike before every wide QRS. Underneath it the potassium is still high: calcium again, and shift it.`;
      // the tracing keeps the same pattern at every rate: the words say what it shows
      const pattern = 'P waves flattened almost to nothing, a long PR, a QRS about 140 ms wide, and tall, narrow, peaked T waves, tallest in V2–V4; no ST elevation';
      if (has(s, 'shifted')) {
        return `Rate ${hr}: still ${pattern} — the changes of a high potassium, now at a rate that holds his pressure. Insulin and albuterol have moved some of it into the cells, but none has left his body, and the tracing will not be normal until the potassium is: calcium, insulin and albuterol buy hours; dialysis takes it out.`;
      }
      const tracing = `${hr < 60 ? `Slow at ${hr}` : `Rate ${hr}`}: ${pattern}`;
      return has(s, 'calcium')
        ? `${tracing}. Calcium has lifted the rate, but the QRS is still wide and the T waves still peaked: it steadies the heart and lowers no potassium — shift it, and plan how to remove it.`
        : `${tracing}. In a man with kidney disease on an ACE inhibitor and spironolactone this is a potassium high enough to stop the heart: IV calcium now, before the lab confirms it.`;
    },
    cxr: 'Portable chest X-ray: normal heart size, mild vascular congestion, no effusion or consolidation.',
    pocus: 'Bedside ultrasound: the left ventricle squeezes normally, but slowly; no pericardial effusion; the right ventricle normal in size; the IVC 1.8 cm, narrowing a little with each breath; a few B-lines at both bases; about 150 mL in the bladder — he is making some urine.',
    // before anyone has read his 12-lead, cardiology asks for it rather than naming what it will show
    consult: (s) => (ecgSeen(s)
      ? 'Cardiology: "That tracing is his potassium, not his conduction system. Calcium again if the QRS stays wide, shift it, and get nephrology to dialyze him. A pacing wire will not capture reliably with a potassium this high — call me back if the rate stays slow once it is down."'
      : `Cardiology: "A rate of ${s.rhythm.hr} with a pressure of ${s.vitals.sbp}/${s.vitals.dbp}: send me his 12-lead the moment it prints, and his medicines and kidney function. Pads on him meanwhile — and look for a cause you can treat."`),
  },
  status: (s) => {
    if (!s.pulse) return has(s, 'cpr') ? 'Unresponsive, no pulse.' : 'Unresponsive, not breathing normally, no pulse — and no compressions yet.';
    if (s.vitals.gcs <= 8) return has(s, 'ventilated') && s.vitals.rr >= 10 ? `Comatose; ventilated at ${s.vitals.rr}/min.` : `Comatose, breathing ${s.vitals.rr}/min on his own.`;
    if (has(s, 'hypoglycemia') && s.vitals.glucose < LOW_GLUCOSE) return '"I feel shaky… and I\'m sweating. Something\'s wrong."';
    // as drowsy as the team says he is: barely rousable, drowsy, or slow and muddled
    if (s.vitals.gcs <= 10) return 'Barely rousable: he opens his eyes to a loud voice, mumbles, and drifts off again.';
    if (s.vitals.gcs < 13) return 'Drowsy, slow to answer.';
    if (s.vitals.gcs === 13) return 'Harder to rouse, his words slow: "…so weak… just let me sleep."';
    if (has(s, 'shifted')) return '"I can lift my legs again. The sick feeling is going."';
    if (has(s, 'calcium')) return '"A bit stronger… still weak, and sick to my stomach."';
    return '"I\'m so weak… and I feel like I\'m going to throw up."';
  },
  respond: {
    // front and back, the placement many pacing protocols prefer; in the doctor's run the nurse has already done these
    pads: (s) => (has(s, 'pads')
      ? { blocked: true, say: [['system', 'The pads are already on him, front and back.']] }
      : { say: [['you', 'Pads on him, front and back, connected to the monitor-defibrillator: the pacer is ready, not running.']], flags: ['pads', 'monitor'] }),
    monitor: (s) => (has(s, 'monitor') ? { blocked: true, say: [['system', 'He is already on the monitor.']] } : null),
    iv: (s) => (has(s, 'iv')
      ? { blocked: true, say: [['system', s.role === 7 ? 'The nurse already has a line in.' : 'He already has a line in.']] }
      // nothing here names a drug yet: the 12-lead has not been read
      : { say: [['you', 'IV in: 18 G in the right antecubital vein — a large vein that runs freely; flushed.']], flags: ['iv'] }),
    // blood for a STAT chemistry and gas from the main lab: the potassium is back in about 10 minutes. Never drawn from the
    // line the calcium is running in: it would come back with the drug's calcium in it
    labs: (s) => ({
      say: [['you', s.role === 7
        ? 'Labs ordered on the blood the nurse drew: a STAT chemistry with potassium, a venous blood gas, CBC, magnesium and phosphorus, and a troponin — results in about 10 minutes.'
        : `Blood drawn${calciumRunning(s) ? ' by a fresh stick in the other arm — never from the line the calcium is running in —' : ''} and sent STAT: a chemistry with potassium, a venous blood gas, CBC, magnesium and phosphorus, and a troponin — results in about 10 minutes.`]],
      flags: ['labs'],
    }),
    sample: () => ({
      say: [
        ['patient', '"My pills? My wife keeps track of those."'],
        ['you', 'From his wife and the pill organizer she brought: lisinopril 40 mg a day; spironolactone 25 mg, added six weeks ago for his blood pressure; amlodipine 10 mg; linagliptin for his diabetes; atorvastatin. Over the counter: ibuprofen 600 mg three times a day for ten days for a sore knee, and a salt substitute — potassium chloride — on everything since he was told to cut down on salt. Kidney disease, stage 4 (his creatinine was 2.4 three months ago), type 2 diabetes, high blood pressure. Not on dialysis; still passing urine, less than usual. No allergies. No digoxin, no beta-blocker.'],
      ],
      flags: ['sample'],
    }),
    glucose: (s) => {
      const g = s.vitals.glucose;
      const who: Speaker = s.role === 7 ? 'nurse' : 'you';
      const since = has(s, 'insulin') ? s.minute - s.flags.insulin : null;
      if (since === null) return { say: [[who, `Blood glucose ${g} mg/dL.`]], flags: ['glucose-checked'] };
      // too soon after the dextrose to show the insulin's low
      if (since < RECHECK_FROM) {
        return { say: [[who, `Blood glucose ${g} mg/dL — the dextrose is still in it. The low the insulin can bring comes later: recheck at about 30 minutes, then every hour.`]], flags: ['glucose-checked'] };
      }
      const low = g < LOW_GLUCOSE;
      return {
        say: [line(who, `Blood glucose ${g} mg/dL${low ? ' — low.' : '.'} With it, a repeat potassium sent from the same draw: ${potassium(s)} mEq/L (it was ${K_FIRST}).`, low ? 'bad' : undefined)],
        flags: ['glucose-checked', 'glucose-rechecked', 'k-rechecked'],
      };
    },

    'calcium-chloride': (s) => (s.pulse ? calcium(s, edNurse(s)) : null), // in arrest: pushed and flushed while compressions go on
    'calcium-gluconate': (s) => (s.pulse ? calcium(s, edNurse(s), true) : null),
    'insulin-dextrose': (s) => insulin(s, edNurse(s)),
    // an add-on only: he still makes some urine, so it moves a little potassium out over hours — dialysis is what takes it out
    furosemide: (s) => (s.pulse
      ? { say: [line(edNurse(s), 'Furosemide 40 mg IV.'), line(s.role === 7 ? 'you' : 'physician', 'It moves a little potassium out over the next hours, while he still makes urine — an add-on, never instead of calcium, the shift and dialysis.')], vitals: bpAfter(s, -4, -2), flags: ['diuretic'] }
      : null),
    'albuterol-hyperk': (s) => albuterol(s, edNurse(s)),
    // the wheezing dose: a quarter to an eighth of what moves potassium. Before anyone has read the 12-lead the teammate
    // only notes that he is not wheezing (naming the potassium then would give the tracing away)
    albuterol: (s) => ({
      say: [
        [edNurse(s), 'Albuterol 2.5 mg by nebulizer.'],
        !ecgSeen(s)
          ? [s.role === 7 ? 'nurse' : 'team', s.role === 7 ? '"His chest has no wheeze — what is the nebulizer for?"' : 'His chest has no wheeze: there is nothing here for a bronchodilator to open.', 'warn']
          : [s.role === 7 ? 'nurse' : 'team', s.role === 7 ? '"That is the wheezing dose. Did you want 10 to 20 milligrams, for the potassium?"' : 'That is the wheezing dose: it will not move his potassium.', 'warn'],
      ],
      flags: ['albuterol'],
    }),
    // Calcium and bicarbonate must never meet in the line: calcium carbonate precipitates in the tubing. While the calcium is
    // still going in, the ER doctor's nurse waits, flushes and then pushes; the ER nurse who pushes into it blocks the line.
    // A dose that went in uses up the ER nurse's order: another needs another order
    'sodium-bicarbonate': (s) => {
      if (!s.pulse) return { say: [[edNurse(s), 'Sodium bicarbonate 50 mEq pushed and flushed; compressions go on.']], flags: ['bicarbonate'], clear: orderUsedUp(s, 'sodium-bicarbonate') };
      if (calciumRunning(s)) {
        if (s.role === 7) {
          return {
            say: [['nurse', '"The calcium is still running into that line — I will let it finish, flush it, then push the bicarbonate."'], ['nurse', 'Line flushed; sodium bicarbonate 50 mEq IV in, then flushed again.']],
            flags: ['bicarbonate'],
          };
        }
        return {
          say: [
            ['you', 'Sodium bicarbonate pushed into the same line while the calcium is still running in.'],
            ['you', 'White flecks cloud the tubing at the port and the drip stops: a chalky precipitate of calcium carbonate.', 'bad'],
            [mdHere(s) ? 'physician' : 'team', '"Stop — clamp it. Change the tubing, flush the catheter until it runs freely, and give the bicarbonate again once the line is clear of calcium."', 'warn'],
          ],
          flags: ['precipitate'], timers: { calciumUntil: s.minute },
        };
      }
      return {
        say: [[edNurse(s), 'Line flushed with saline, sodium bicarbonate 50 mEq IV over a few minutes, then flushed again.']],
        flags: s.role === 6 ? ['bicarbonate', 'bicarb-given-rn'] : ['bicarbonate'], clear: orderUsedUp(s, 'sodium-bicarbonate'),
      };
    },
    // the potassium, not the vagus, slows him: atropine finds nothing to undo
    atropine: (s) => (s.pulse
      ? { say: [[edNurse(s), 'Atropine 1 mg IV, pushed and flushed.'], ['monitor', `No change: heart rate ${s.rhythm.hr}.`]], flags: ['atropine'] }
      : null),
    pace: (s) => (s.pulse && !has(s, 'calcium') ? noCapture(s, 'pads') : null),
    'temp-wire': (s) => (s.pulse && has(s, 'venous') && !has(s, 'calcium') ? noCapture(s, 'wire') : null),
    // an epinephrine infusion supports a slow heart and shifts a little potassium too; it does not replace calcium
    pressor: (s) => {
      if (!s.pulse || s.rhythm.profile !== HYPERK) return null;
      const before = !has(s, 'calcium');
      const hr = before ? Math.max(s.rhythm.hr, 46) : Math.max(s.rhythm.hr, Math.min(s.rhythm.hr + 6, 70));
      const bp = before ? atLeast(s, 92, 54) : bpAfter(s, 10, 6);
      return {
        say: [[edNurse(s), 'Epinephrine infusion started at 2 micrograms a minute, titrating.'], ['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`]],
        rhythm: { profile: HYPERK, hr }, vitals: bp, flags: ['pressor'],
      };
    },
    lidocaine: (s) => suppress(s, 'Lidocaine'),
    'amio-infusion': (s) => suppress(s, 'Amiodarone'),
    'amio-arrest': (s) => suppress(s, 'Amiodarone 300 mg'),
    procainamide: (s) => suppress(s, 'Procainamide'),
    metoprolol: (s) => suppress(s, 'Metoprolol 5 mg'),
    esmolol: (s) => suppress(s, 'Esmolol'),
    labetalol: (s) => suppress(s, 'Labetalol 20 mg'),
    diltiazem: (s) => suppress(s, 'Diltiazem'),
    adenosine3: (s) => adenosinePause(s, 4),
    adenosine6: (s) => adenosinePause(s, 6),
    adenosine12: (s) => adenosinePause(s, 8),
    // bearing down raises the vagal tone: a few seconds slower still
    vagal: (s) => (s.pulse && s.rhythm.profile === HYPERK
      ? { say: [['monitor', `Heart rate ${Math.max(24, s.rhythm.hr - 8)} for a few seconds, then back to ${s.rhythm.hr}.`, 'bad']], flags: ['vagal'] }
      : null),
    // the low pressure comes from the slow rate: a bolus barely moves it, and his kidneys pass little of it
    fluid: (s) => {
      if (!s.pulse) return null;
      const bp = bpAfter(s, 4, 2);
      const spo2 = count(s, 'fluid') >= 1 ? Math.max(88, s.vitals.spo2 - 2) : s.vitals.spo2;
      return { say: [['monitor', `Bolus in. BP ${bp.sbp}/${bp.dbp}. SpO₂ ${spo2}%.`]], vitals: { ...bp, spo2 }, flags: ['fluid'] };
    },
    // induction and positive pressure on a heart the potassium has slowed, before calcium: it nearly stops — never better
    // than it was — and, like a drug that depresses it further, it arrests within minutes unless an infusion holds it up
    rsi: (s) => {
      if (!s.pulse || has(s, 'calcium') || s.rhythm.profile !== HYPERK) return null;
      const hr = Math.min(s.rhythm.hr, 28);
      const sbp = Math.min(s.vitals.sbp, 60);
      const dbp = Math.min(s.vitals.dbp, 34);
      return {
        say: [
          ['you', 'Preoxygenated; etomidate and rocuronium pushed; tube through the cords, confirmed with waveform capnography; on the ventilator.'],
          ['monitor', `Heart rate ${hr}. BP ${sbp}/${dbp}.`, 'bad'],
        ],
        rhythm: { profile: HYPERK, hr }, vitals: { sbp, dbp, spo2: 98, rr: 16, gcs: 3 }, flags: ['airway', 'ventilated', 'sedation', 'rsi', 'suppressed'],
      };
    },
    // PEA from the potassium: compressions and epinephrine keep him going, but the circulation comes back only once the
    // potassium is treated (calcium or bicarbonate, whose benefit in an arrest the 2025 AHA calls not well established)
    cpr: (s) => {
      if (s.pulse || !(cprCycles(s) >= 1 && has(s, 'epi') && (has(s, 'calcium') || has(s, 'bicarbonate')))) return null;
      const tubed = has(s, 'airway');
      return {
        say: [[teammate(s), 'After 2 minutes of compressions: organized complexes and a femoral pulse — ROSC.', 'good']],
        rhythm: { profile: HYPERK, hr: 46 }, pulse: true, phase: 'rosc',
        vitals: { sbp: 84, dbp: 48, spo2: tubed ? 96 : 92, rr: tubed ? 14 : 8, etco2: tubed ? 38 : 34, gcs: 6, pain: 0 }, flags: ['cpr'],
      };
    },
    // after ROSC he is comatose and breathes 8 a minute: the bag, or a tube once placed, ventilates him
    bvm: (s) => (s.pulse && s.vitals.gcs <= 8
      ? { say: [['you', 'Assisting ventilations, 1 breath every 6 seconds.'], ['monitor', 'SpO₂ 96%. EtCO₂ 38 mmHg.']], vitals: { spo2: 96, rr: 10, etco2: 38 }, flags: ['ventilated'] }
      : null),
    airway: (s) => (s.pulse && s.vitals.gcs <= 8
      ? { say: [['you', 'Tube placed; confirmed with waveform capnography; on the ventilator.'], ['monitor', 'SpO₂ 96%. EtCO₂ 38 mmHg.']], vitals: { spo2: 96, rr: 14, etco2: 38 }, flags: ['airway', 'ventilated'] }
      : null),
    // the physician calls nephrology and the ICU: the potassium comes out only with dialysis, and he has no access for it
    // yet — so emergency dialysis, as soon as a catheter is in. Before anyone has read the 12-lead there is nothing to call
    // them about: the case waits (no time passes), so the call can still be made once the cause is known
    admit: (s) => {
      if (!s.pulse) return null;
      if (!ecgSeen(s) && !has(s, 'k-known')) {
        return { blocked: true, say: [['system', 'Admit him where, and for what? Find out what is slowing his heart first — his 12-lead is on its way.']] };
      }
      const nephrology = has(s, 'k-known')
        ? 'Nephrology: "A potassium of 7.8 with ECG changes, kidney failure and an acidosis: he needs emergency dialysis. We will put a temporary dialysis catheter in as soon as he is in the ICU and dialyze him straight away — keep shifting it until then. Hold his lisinopril, spironolactone and ibuprofen, and no more salt substitute."'
        : 'Nephrology: "With that 12-lead, stage 4 kidney disease and those drugs, plan on emergency dialysis as soon as a catheter is in: send me his potassium the moment it is back. Hold his lisinopril, spironolactone and ibuprofen."';
      return {
        say: [['you', `You call nephrology and the ICU from the bedside. ${nephrology}`], ['hospital', 'Bed board: the ICU accepts him — a bed in about 20 minutes, where the dialysis catheter goes in.']],
        flags: ['dispo', 'admit'],
      };
    },
    // this hospital has nephrology, emergency dialysis and an ICU
    transfer: () => ({ blocked: true, say: [['system', 'Not needed: this hospital has nephrology on call, emergency dialysis and an ICU. Call nephrology and admit him — moving an unstable patient between hospitals only adds risk and delay.']] }),
    // the nurse's report brings the physician, and each report gets the physician's answer to what it says
    'notify-physician': (s) => {
      if (!mdHere(s)) {
        const sees = ecgSeen(s);
        const numbers = `A rate of ${s.rhythm.hr} and ${s.vitals.sbp} systolic`;
        return {
          say: [['physician', sees
            ? `The ED physician comes straight over and takes the 12-lead from you: "${numbers} — and this tracing. Thank you for bringing it straight to me.${setupStillNeeded(s)}"`
            : `The ED physician comes straight over: "${numbers} — thank you for calling.${setupStillNeeded(s)}"`]],
          flags: ['physician-notified', 'md-present', ...(sees ? ['ecg-shown'] : [])],
        };
      }
      const said: Line[] = [];
      const flags = ['physician-notified'];
      if (ecgSeen(s) && !has(s, 'ecg-shown')) {
        said.push(['physician', '"Show me." The physician studies the tracing in your hand.']);
        flags.push('ecg-shown');
      }
      if (has(s, 'k-known') && !kWithMd(s)) {
        said.push(['physician', '"7.8 — read back. Thank you for bringing it to me straight away."']);
        flags.push('k-reported');
      }
      if (has(s, 'hypoglycemia') && !has(s, 'hypo-reported')) {
        said.push(['physician', '"Treat it now — dextrose 25 grams IV — and a glucose every 15 minutes until he is steady."']);
        flags.push('hypo-reported');
      }
      if (!said.length) said.push(['physician', '"Thanks — keep watching him, and tell me the moment anything changes."']);
      return { say: said, flags };
    },
  },
  events: [
    // ─── Both runs: the potassium, untreated ─────────────────────────────
    {
      // the QRS widens and the rate and the pressure fall — never back up, if a drug has already pushed them lower
      id: 'worse',
      when: (s) => s.pulse && s.rhythm.profile === HYPERK && !has(s, 'calcium') && !has(s, 'pressor') && !has(s, 'suppressed') && s.minute >= 10,
      effect: (s) => {
        const hr = Math.min(s.rhythm.hr, 30);
        const sbp = Math.min(s.vitals.sbp, 72);
        const dbp = Math.min(s.vitals.dbp, 40);
        return {
          say: [
            [teammate(s), 'He is harder to rouse — and the complexes on the monitor are getting wider.', 'bad'],
            ...(has(s, 'monitor') ? [['monitor', `Heart rate ${hr}. BP ${sbp}/${dbp}.`, 'bad'] as Line] : []),
          ],
          rhythm: { profile: HYPERK, hr }, vitals: { sbp, dbp, spo2: Math.min(s.vitals.spo2, 93), gcs: Math.min(s.vitals.gcs, 13) }, flags: ['worse'],
        };
      },
    },
    {
      // the complexes so wide they run into one another: minutes from standstill
      id: 'pre-arrest',
      when: (s) => s.pulse && s.rhythm.profile === HYPERK && !has(s, 'calcium') && !has(s, 'pressor') && !has(s, 'suppressed') && s.minute >= 15,
      effect: (s) => ({
        say: [
          [teammate(s), 'Barely rousable now — and the complexes on the monitor are so wide they roll into one another.', 'bad'],
          ['monitor', 'Heart rate 24. BP 58/30.', 'bad'],
        ],
        rhythm: { profile: HYPERK, hr: 24 }, vitals: { sbp: Math.min(s.vitals.sbp, 58), dbp: Math.min(s.vitals.dbp, 30), gcs: Math.min(s.vitals.gcs, 9) }, flags: ['pre-arrest'],
      }),
    },
    {
      // untreated, the slow wide rhythm stops pumping (PEA); a drug that suppresses it brings that on within minutes —
      // unless an infusion started after it has brought the rate back up
      id: 'arrest',
      when: (s) => s.pulse && s.rhythm.profile === HYPERK && !has(s, 'calcium')
        && (s.minute >= (has(s, 'pressor') ? 24 : 18)
          || (has(s, 'suppressed') && !(has(s, 'pressor') && s.flags.pressor >= s.flags.suppressed) && s.minute >= s.flags.suppressed + 2)),
      effect: (s) => ({
        say: [[teammate(s), 'He has gone limp and gray — no pulse!', 'bad'], ['monitor', 'Monitor alarm.', 'bad']],
        // no EtCO₂ of its own: the capnograph follows the shared arrest rule (breaths, then compressions)
        rhythm: { profile: 'pea', hr: 24 }, pulse: false, phase: 'arrest',
        vitals: { sbp: 0, dbp: 0, rr: 0, spo2: 80, gcs: 3, pain: 0 },
      }),
    },
    {
      // the STAT chemistry and gas: a critical value the lab calls to the nurse
      id: 'k-result',
      when: (s) => has(s, 'labs') && s.minute >= s.flags.labs + LAB_MINUTES,
      effect: (s) => {
        const result = `Potassium ${K_FIRST} mEq/L — not hemolyzed. Venous gas: pH 7.21, bicarbonate 12. Creatinine 4.1 mg/dL (2.4 three months ago), BUN 74, glucose 138, calcium 8.8, magnesium 2.5, phosphorus 6.2.`;
        return {
          say: [s.role === 7
            ? ['nurse', `The lab just called a critical value: ${result}`, 'warn']
            : ['hospital', `Lab, with a critical value for resus 3: ${result} Please read it back.`, 'warn']],
          flags: ['k-known'],
        };
      },
    },
    {
      // the dextrose has run its course and the insulin is at work: the glucose drifts back down (the low can come hours later)
      id: 'glucose-drift',
      when: (s) => has(s, 'insulin') && s.minute >= s.flags.insulin + RECHECK_FROM,
      effect: (s) => ({ vitals: { glucose: Math.min(s.vitals.glucose, 124) } }),
    },
    {
      // no glucose rechecked in the hour after the insulin: the low nobody looked for (in the doctor's run the nurse was
      // waiting to be told when to recheck it)
      id: 'hypoglycemia',
      when: (s) => s.pulse && has(s, 'insulin') && !has(s, 'glucose-rechecked') && s.minute >= s.flags.insulin + 60,
      effect: (s) => ({
        say: [
          s.role === 7
            ? ['nurse', '"He is pale, sweating and muddled — and his glucose has not been rechecked since the insulin. Do you want a fingerstick?"', 'bad']
            : ['team', 'He is pale, sweating and muddled — and his glucose has not been rechecked since the insulin.', 'bad'],
          ...ifAwake(s, '"I feel shaky… something\'s wrong."'),
        ],
        vitals: { glucose: 52, gcs: Math.min(s.vitals.gcs, 14) }, flags: ['hypoglycemia'],
      }),
    },
    {
      // insulin (or albuterol) has had its time: potassium has moved into the cells, and his strength comes back
      id: 'shift-works',
      when: (s) => s.pulse && s.rhythm.profile === HYPERK && has(s, 'calcium')
        && ((has(s, 'insulin') && s.minute >= s.flags.insulin + 20) || (has(s, 'albuterol-hyperk') && s.minute >= s.flags['albuterol-hyperk'] + 30)),
      effect: (s) => {
        const hr = Math.max(s.rhythm.hr, 72);
        const bp = atLeast(s, 122, 72);
        return {
          say: [
            comesRound(s)
              ? [teammate(s), 'He can lift his legs off the bed now, and he says the sick feeling is easing.', 'good']
              : [teammate(s), 'His rate and pressure are coming up — still no response to voice.', 'good'],
            ['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`, 'good'],
          ],
          rhythm: { profile: HYPERK, hr }, vitals: { ...bp, ...(comesRound(s) ? { gcs: 15, spo2: Math.max(s.vitals.spo2, 95) } : {}) }, flags: ['shifted'],
        };
      },
    },
    {
      // calcium only bought time: 30 minutes on, with nothing to shift the potassium, the rate and the pressure sag again
      id: 'calcium-fades',
      when: (s) => s.pulse && s.rhythm.profile === HYPERK && has(s, 'calcium') && !has(s, 'insulin') && !has(s, 'albuterol-hyperk') && !has(s, 'pressor')
        && s.timers.calciumLast !== undefined && s.minute >= s.timers.calciumLast + 30,
      effect: (s) => {
        const hr = Math.min(s.rhythm.hr, 44);
        const sbp = Math.min(s.vitals.sbp, 88);
        const dbp = Math.min(s.vitals.dbp, 50);
        return {
          say: [[teammate(s), 'He is getting weaker again, and the complexes are widening.', 'warn'], ['monitor', `Heart rate ${hr}. BP ${sbp}/${dbp}.`, 'warn']],
          rhythm: { profile: HYPERK, hr }, vitals: { sbp, dbp, gcs: Math.min(s.vitals.gcs, 14) }, flags: ['calcium-faded'],
        };
      },
    },

    // ─── The ER nurse's run: the ED physician ──────────────────────────────
    {
      // not called: the physician sees him on the central monitor
      id: 'md-arrives',
      when: (s) => s.role === 6 && !mdHere(s) && s.minute >= 5,
      effect: (s) => ({
        say: [['physician', has(s, 'monitor')
          ? `The ED physician hurries in: "I saw a rate of ${s.rhythm.hr} on the central monitor — why wasn't I called?${setupStillNeeded(s)}"`
          : `The ED physician hurries in: "Triage said a pulse of 38 — and he is not even on a monitor? Why wasn't I called?${setupStillNeeded(s)}"`, 'warn']],
        flags: ['md-present', 'md-not-called', ...(ecgSeen(s) ? ['ecg-shown'] : [])],
      }),
    },
    {
      // the 12-lead printed and nobody brought it: the physician finds it on the screen
      id: 'md-finds-ecg',
      when: (s) => s.role === 6 && mdHere(s) && ecgSeen(s) && !has(s, 'ecg-shown') && s.minute >= s.flags.ecg12 + 3,
      effect: () => ({
        say: [['physician', '"I just found his 12-lead on the screen — a tracing like this comes to me the moment it prints."', 'warn']],
        flags: ['ecg-shown', 'ecg-md-found'],
      }),
    },
    {
      id: 'md-wants-ecg',
      when: (s) => s.role === 6 && mdHere(s) && !has(s, 'ecg12') && s.minute >= s.flags['md-present'] + 4,
      effect: () => ({ say: [['physician', '"I need that 12-lead now."', 'warn']], flags: ['asked-ecg'] }),
    },
    {
      // the physician's own tracing: the engine asks the nurse to read it
      id: 'md-runs-ecg',
      when: (s) => s.role === 6 && has(s, 'asked-ecg') && !has(s, 'ecg12') && s.minute >= s.flags['asked-ecg'] + 3,
      effect: () => ({ say: [['physician', '"I am running the 12-lead myself."', 'warn']], flags: ['ecg12', 'monitor', 'ecg-shown', 'ecg-md-found'] }),
    },
    ...askEvents(CALCIUM),
    ...askEvents(SHIFT),
    ...askEvents(NEB),
    {
      // no blood sent yet: the physician asks for it
      id: 'md-labs',
      when: (s) => s.role === 6 && mdHere(s) && !has(s, 'labs') && s.minute >= s.flags['md-present'] + 8,
      effect: () => ({ say: [['physician', '"Has any blood gone off? I want a potassium and a gas on him — STAT."', 'warn']] }),
    },
    {
      // the critical value not passed on: the physician finds it on the screen
      id: 'k-md-found',
      when: (s) => s.role === 6 && mdHere(s) && has(s, 'k-known') && !has(s, 'k-reported') && s.minute >= s.flags['k-known'] + 5,
      effect: () => ({
        say: [['physician', '"I just saw his potassium on the screen — 7.8. A critical value comes to me the moment you have it, please."', 'warn']],
        flags: ['k-md-found'],
      }),
    },
    ...askEvents(CALCIUM_AGAIN),
    {
      // with an acidosis this deep, bicarbonate is reasonable; and never into the calcium
      id: 'bicarb-order',
      when: (s) => s.role === 6 && s.pulse && kWithMd(s) && has(s, 'calcium'),
      effect: () => ({
        say: [['physician', '"And with a bicarbonate of 12, sodium bicarbonate 50 mEq IV — but never into the calcium: let the calcium finish, flush the line, then push it."']],
        flags: [orderedFlag('sodium-bicarbonate'), 'asked-bicarb'],
      }),
    },
    {
      id: 'bicarb-got',
      when: (s) => s.role === 6 && has(s, 'asked-bicarb') && has(s, 'bicarb-given-rn'),
      effect: () => ({ say: [['physician', '"Thank you."', 'good']] }),
    },
    {
      id: 'bicarb-fallback',
      when: (s) => s.role === 6 && has(s, 'asked-bicarb') && !has(s, 'bicarbonate') && s.minute >= s.flags['asked-bicarb'] + 12,
      // the physician gave the ordered dose: the order is used up
      effect: () => ({ say: [['physician', '"I have flushed the line and pushed the bicarbonate myself."', 'warn']], flags: ['bicarbonate', 'bicarb-md'], clear: [orderedFlag('sodium-bicarbonate')] }),
    },
    ...askEvents(ECG_AGAIN),
    {
      // the physician has called nephrology and the ICU: the nurse's hand-off can follow
      id: 'md-dispo',
      when: (s) => s.role === 6 && s.pulse
        && ((kWithMd(s) && s.minute >= kWithMdAt(s) + 8) || (has(s, 'rosc') && s.minute >= s.flags.rosc + 8) || s.minute >= 45),
      // with the potassium back, nephrology dialyzes him at once; without it (after an arrest, or no labs sent) they wait for it
      effect: (s) => physicianDispo(s, 'admit', kWithMd(s)
        ? '"I have spoken to nephrology and the ICU: he needs emergency dialysis — a temporary catheter goes in as soon as he reaches the ICU, and they dialyze him straight away. Hold his lisinopril, spironolactone and ibuprofen — and no more salt substitute. Keep the glucose checks every hour, and a repeat potassium in 2 hours. Give report to the ICU nurse when they are ready for him."'
        : '"I have spoken to nephrology and the ICU: with that tracing and his kidneys they expect to dialyze him as soon as a catheter is in — they want his potassium the moment it is back. Hold his lisinopril, spironolactone and ibuprofen. Keep the glucose checks every hour. Give report to the ICU nurse when they are ready for him."'),
    },
    {
      // the arrest, in the nurse's run: the physician runs the code
      id: 'md-code',
      when: (s) => s.role === 6 && has(s, 'arrest') && !s.pulse,
      effect: () => ({
        say: [['physician', '"No pulse — start compressions! Epinephrine 1 milligram, and calcium chloride 1 gram pushed and flushed — then bicarbonate, never into the calcium."', 'bad']],
        flags: ['md-present'],
      }),
    },
    {
      id: 'md-code-calcium',
      when: (s) => s.role === 6 && !s.pulse && !has(s, 'calcium') && s.minute >= s.flags.arrest + 4,
      effect: () => ({ say: [['physician', '"I am pushing the calcium myself."', 'warn']], flags: ['calcium', 'md-calcium'] }),
    },
    {
      id: 'md-post-rosc',
      when: (s) => s.role === 6 && s.pulse && has(s, 'rosc'),
      effect: () => physicianOrder('"He is back. Bag him while I set up for the tube. Epinephrine infusion at 2 micrograms a minute, titrated to a MAP of 65, push-dose epinephrine if he drops — and another gram of calcium."', ['pressor', 'push-epi', ...CALCIUMS]),
    },
    {
      id: 'md-intubates',
      when: (s) => s.role === 6 && s.pulse && has(s, 'rosc') && !has(s, 'airway') && s.minute >= s.flags.rosc + 3,
      effect: () => ({
        say: [['physician', 'Tube in, confirmed with waveform capnography; on the ventilator.'], ['monitor', 'SpO₂ 96%. EtCO₂ 38 mmHg.']],
        vitals: { spo2: 96, rr: 14, etco2: 38 }, flags: ['airway', 'ventilated'],
      }),
    },

    // ─── The ER doctor's run: the ED nurse ─────────────────────────────────
    {
      id: 'rn-room',
      when: (s) => s.role === 7 && s.minute >= 0.5 && !has(s, 'pads'),
      effect: (s) => ({
        say: [['nurse', 'Monitor on, and pads on him — front and back — so the pacer is ready if you want it.'], ['monitor', `Monitor attached: heart rate ${s.rhythm.hr}.`]],
        flags: ['pads', 'monitor'],
      }),
    },
    {
      id: 'rn-line',
      when: (s) => s.role === 7 && s.minute >= 1.5 && !has(s, 'iv'),
      effect: (s) => ({
        say: [['nurse', `IV in: 18 G in the right antecubital, a good vein. Fingerstick glucose ${s.vitals.glucose}. Blood is drawn and held — tell me which labs you want.`]],
        flags: ['iv', 'glucose-checked'],
      }),
    },
    {
      // the nurse's 12-lead: the engine asks the doctor to read it
      id: 'rn-ecg',
      when: (s) => s.role === 7 && s.minute >= 2 && !has(s, 'ecg12') && s.pulse,
      effect: () => ({ say: [['nurse', '12-lead done — it is on the screen.']], flags: ['ecg12', 'monitor'] }),
    },
    {
      id: 'rn-labs-ask',
      when: (s) => s.role === 7 && !has(s, 'labs') && s.minute >= 8,
      effect: () => ({ say: [['nurse', '"His blood is drawn and waiting — which labs do you want?"', 'warn']] }),
    },
  ],
  critical: [
    // ─── The arrest, if it comes (first, so that a hint in the arrest names compressions) ──────────
    {
      id: 'arrest-cpr', label: 'Cardiac arrest: compressions at once', roles: ED_TEAM, points: 10,
      why: 'PEA is not shockable: high-quality CPR without pauses, then epinephrine and the cause — here the potassium.',
      done: ['cpr'], after: 'arrest', target: { within: { flag: 'arrest', minutes: 1 } }, applies: (s) => has(s, 'arrest'),
    },
    {
      id: 'arrest-epi', label: 'Cardiac arrest: epinephrine as soon as possible', roles: ED_TEAM, points: 5,
      why: 'For PEA, epinephrine 1 mg IV as soon as possible, then every 3–5 minutes (the ACLS protocol: no separate order needed).',
      done: ['epinephrine'], after: 'arrest', target: { within: { flag: 'arrest', minutes: 5 } }, applies: (s) => has(s, 'arrest'),
    },
    {
      id: 'rn-post-vent', label: 'After ROSC: bag him (he breathes 8 a minute) until the tube is in', roles: ED_RN, points: 5, applies: (s) => has(s, 'rosc'),
      why: 'A comatose patient breathing 8 a minute needs his breaths assisted: 1 every 6 seconds, SpO₂ 90–98 %, EtCO₂ 35–45 mmHg.',
      done: (s) => firstDone(s, ['bvm'], 'rosc'), uses: ['bvm'], target: { within: { flag: 'rosc', minutes: 2 } },
    },
    {
      id: 'md-post-vent', label: 'After ROSC: support his breathing (he breathes 8 a minute)', roles: ED_MD, points: 5, applies: (s) => has(s, 'rosc'),
      why: 'After ROSC keep SpO₂ 90–98 % and EtCO₂ 35–45 mmHg: a comatose patient breathing 8 a minute needs ventilation — the bag, then a tube.',
      // a tube placed during the arrest goes on being used: he is ventilated through it from the moment of ROSC
      done: (s) => (s.flags.rosc === undefined ? null : has(s, 'airway') && s.flags.airway <= s.flags.rosc ? s.flags.rosc : firstDone(s, ['bvm', 'airway', 'rsi'], 'rosc')),
      uses: ['bvm', 'airway', 'rsi'],
    },
    {
      id: 'post-bp', label: 'After ROSC: treat the low pressure (MAP under 65)', roles: ED_TEAM, points: 5, applies: (s) => has(s, 'rosc'),
      why: 'After ROSC avoid hypotension: keep the MAP at 65 mmHg or more (2025 AHA). Here calcium again (the potassium is still high), an epinephrine infusion or push-dose epinephrine.',
      done: [...CALCIUMS, 'pressor', 'push-epi'], after: 'rosc',
    },

    // ─── The ER nurse ──────────────────────────────────────────────────────
    {
      id: 'rn-triage', label: 'Triage: ESI 1 — straight to a resuscitation bed', roles: ED_RN, done: ['triage'], points: 5, target: { by: 2 },
      why: 'A pulse of 38 with a systolic of 86 needs a life-saving intervention now: Emergency Severity Index 1, a resuscitation bed and the physician at the bedside.',
    },
    {
      id: 'rn-pads', label: 'Monitor and pads on at once', roles: ED_RN, done: PADS, points: 10, target: { by: 4 },
      why: 'A slow rhythm with a low pressure can stop at any moment: with the pads on he can be shocked or paced within seconds of the decision.',
    },
    {
      id: 'rn-call', label: 'Bring the ED physician to the bedside now', roles: ED_RN, done: ['notify-physician'], points: 10, target: { by: 4 },
      why: 'A rate of 38 with a systolic of 86 is unstable: call the physician (SBAR, closed loop) as soon as you see him — every drug he needs is on the physician\'s order.',
    },
    { id: 'rn-iv', label: 'IV access: a large-bore line in a big vein', roles: ED_RN, done: ['iv', 'io'], points: 5, target: { by: 7 }, why: 'Calcium chloride needs a large vein that runs freely: it burns and kills tissue if it leaks.' },
    {
      id: 'rn-ecg', label: '12-lead within 10 minutes of arrival — early', roles: ED_RN, done: ['ecg12'], points: 10, target: { by: 10 },
      why: 'Weak and slow, with kidney disease: the 12-lead shows within minutes whether a high potassium is reaching the heart — peaked T waves, flattened P waves, a widening QRS — long before the lab does.',
    },
    {
      id: 'rn-ecg-report', label: 'Take the 12-lead to the physician the moment it prints', roles: ED_RN, points: 10,
      done: (s) => firstDone(s, ['notify-physician'], 'ecg12'), uses: ['notify-physician'],
      target: { within: { flag: 'ecg12', minutes: 2 } }, applies: (s) => count(s, 'ecg12') > 0,
      why: 'Those changes are treated now, not when the potassium comes back from the lab: the tracing goes straight to the physician (SBAR — what you see and what you think it needs), who orders calcium on the 12-lead alone.',
    },
    ownAnswer(CALCIUM),
    { id: 'rn-labs', label: 'Labs: a STAT chemistry with potassium and a venous gas', roles: ED_RN, done: ['labs'], points: 5, target: { by: 10 }, why: 'The potassium, the kidneys and the acid–base balance: they confirm the cause, decide the bicarbonate and the dialysis — and set the baseline for every recheck.' },
    ownAnswer(SHIFT),
    ownAnswer(NEB),
    {
      id: 'rn-k-report', label: 'Report the critical potassium to the physician at once', roles: ED_RN, points: 10,
      done: (s) => firstDone(s, ['notify-physician'], 'k-known'), uses: ['notify-physician'],
      target: { within: { flag: 'k-known', minutes: 3 } }, applies: (s) => has(s, 'k-known'),
      why: 'A critical value goes to the physician the moment you have it: read it back to the lab, then to the physician (closed loop) — 7.8 with a bicarbonate of 12 brings more calcium, the bicarbonate and the dialysis call.',
    },
    ownAnswer(CALCIUM_AGAIN),
    {
      id: 'rn-bicarb', label: 'Bicarbonate on the order — once the calcium is in and the line flushed', roles: ED_RN, points: 5,
      // hers only if it went in before the physician gave up waiting and pushed it (a dose after that is a second one)
      done: (s) => (has(s, 'bicarb-md') ? null : s.flags['bicarb-given-rn'] ?? null), uses: ['sodium-bicarbonate'],
      target: { within: { flag: 'asked-bicarb', minutes: 12 } }, applies: (s) => has(s, 'asked-bicarb'),
      why: 'Bicarbonate is for his metabolic acidosis (a bicarbonate of 12). Calcium and bicarbonate meeting in one line form a calcium carbonate precipitate: let the calcium finish, flush, then push — or use a second line.',
    },
    ownAnswer(ECG_AGAIN),
    {
      id: 'rn-meds', label: 'His medicines — and what else raises his potassium', roles: ED_RN, done: ['sample'], points: 5, target: { by: 15 },
      why: 'Lisinopril, spironolactone, ten days of ibuprofen and a potassium salt substitute, on stage 4 kidney disease: the physician needs the list to stop them, and the salt substitute must not go home with him unexplained.',
    },
    { id: 'rn-handoff', label: 'Hand-off to the ICU nurse', roles: ED_RN, done: ['handoff'], points: 5, why: 'The 12-leads, each drug with its time and effect, the glucose checks and when the next is due, the repeat potassium, the drugs held, and the dialysis plan.' },

    // ─── The ER doctor ─────────────────────────────────────────────────────
    {
      id: 'md-calcium', label: 'IV calcium at once for the 12-lead changes — before the lab', roles: ED_MD, points: 20,
      // the same 5 minutes as the "12-lead to calcium" timing
      done: CALCIUMS, target: { within: { flag: 'ecg12', minutes: 5 } },
      why: 'Peaked T waves, a wide QRS and a slow rate with a low pressure: calcium steadies the heart within minutes, and the lab result changes nothing about that. Calcium chloride 1 g through a large vein for a patient this unstable (or calcium gluconate 3 g, safer in a small vein), slowly.',
    },
    {
      id: 'md-calcium-again', label: 'A second gram of calcium while the QRS stays wide', roles: ED_MD, points: 5,
      done: (s) => s.performed.filter((p) => CALCIUMS.includes(p.id))[1]?.minute ?? null, uses: CALCIUMS,
      target: { within: { flag: 'calcium', minutes: 15 } },
      why: 'Repeat calcium when the ECG changes persist 5–10 minutes after the first dose: here the QRS is still wide after the first gram.',
    },
    { id: 'md-labs', label: 'Labs now: a STAT chemistry with potassium and a venous gas', roles: ED_MD, done: ['labs'], points: 5, target: { by: 6 }, why: 'The potassium, the kidneys and the acid–base balance: they confirm the cause and decide the bicarbonate and the dialysis — but the calcium does not wait for them.' },
    {
      id: 'md-shift', label: 'Shift the potassium: insulin with dextrose', roles: ED_MD, done: ['insulin-dextrose'], points: 10, target: { by: 15 },
      why: 'Regular insulin 10 units IV (5 units in some protocols for failing kidneys) with dextrose 25 g moves potassium into the cells within 15–30 minutes, by about 0.6–1 mEq/L.',
    },
    {
      id: 'md-albuterol', label: 'And high-dose albuterol: 10–20 mg nebulized', roles: ED_MD, done: ['albuterol-hyperk'], points: 5, target: { by: 20 },
      why: 'Albuterol 10–20 mg nebulized adds to the insulin (onset about 30 minutes, about 0.5–1 mEq/L). The wheezing dose, 2.5 mg, is far too small.',
    },
    {
      id: 'md-cause', label: 'Find the cause: his medicines and what he eats (SAMPLE)', roles: ED_MD, done: ['sample'], points: 10, target: { by: 10 },
      why: 'Stage 4 kidney disease, lisinopril, spironolactone, ten days of ibuprofen and a potassium salt substitute: stop every one of them, or the potassium comes back after the dialysis.',
    },
    {
      id: 'md-dialysis', label: 'Remove it: nephrology for emergency dialysis, and an ICU bed', roles: ED_MD, done: ['admit'], points: 10,
      target: { within: { flag: 'k-known', minutes: 15 } },
      why: 'Calcium, insulin and albuterol only buy hours: with failing kidneys, a potassium of 7.8 with ECG changes and an acidosis, dialysis is what takes it out — and he has no access for it yet. Call nephrology early. (A binder and a loop diuretic help only slowly, and the loop diuretic only while he makes urine.)',
    },
    {
      id: 'md-ecg-again', label: 'Repeat the 12-lead once the shift has worked', roles: ED_MD, points: 5,
      // a repeat started just before the shift and printed after it shows the shift too
      done: repeatAfterShift, uses: ['ecg12-repeat'], applies: (s) => has(s, 'shifted'),
      why: 'The 12-lead shows what the potassium is doing to the heart now — the same pattern at a rate that holds his pressure: better, not normal, until the potassium is removed — and it is the baseline for the next change.',
    },
    { id: 'md-handoff', label: 'Hand-off', roles: ED_MD, done: ['handoff'], points: 5, why: 'The 12-leads, the calcium, the shift and when each went in, the glucose plan, the repeat potassium, the drugs to hold and the dialysis plan.' },

    // ─── Both ──────────────────────────────────────────────────────────────
    {
      // one of the case's traps (insulin without the glucose checks): a check only once he is low and sweating is no
      // recheck — it finds the harm the rechecks are there to prevent
      id: 'glucose-recheck', label: 'Recheck the glucose within the hour after the insulin (a repeat potassium with it)', roles: ED_TEAM, points: 10,
      done: (s) => (has(s, 'insulin')
        ? s.performed.find((p) => p.id === 'glucose' && p.minute >= s.flags.insulin + RECHECK_FROM && !(p.minute >= s.flags.hypoglycemia))?.minute ?? null
        : null),
      uses: ['glucose'], target: { within: { flag: 'insulin', minutes: 60 } }, applies: (s) => has(s, 'insulin'),
      why: 'Insulin lowers the glucose as well as the potassium, and failing kidneys clear it slowly: lows come up to 6 hours later (2021 ACEP-sponsored ED consensus). Check the glucose before the insulin, at about 30 minutes and every hour after for at least 4–6 hours (a check in the first 20 minutes only shows the dextrose); recheck the potassium with it.',
    },
    {
      id: 'treat-low-glucose', label: 'Treat the low glucose at once', roles: ED_TEAM, points: 5,
      done: (s) => firstDone(s, ['dextrose'], 'hypoglycemia'), uses: ['dextrose'],
      target: { within: { flag: 'hypoglycemia', minutes: 5 } }, applies: (s) => has(s, 'hypoglycemia'),
      why: 'A glucose of 52 after insulin: dextrose 25 g IV now, then a dextrose infusion and a glucose every 15 minutes until it is steady.',
    },
  ],
  harms: yieldToHeavier([
    // the trap: the 12-lead already shows it, and the calcium waited for the lab
    {
      id: 'calcium-waited-for-lab', actions: CALCIUMS, roles: ED_MD, points: 8, severity: 'major',
      when: (s) => s.pulse && !has(s, 'calcium') && has(s, 'k-known') && has(s, 'ecg12') && s.flags.ecg12 < s.flags['k-known'],
      text: 'Calcium only once the potassium came back from the lab. The 12-lead had already shown it — peaked T waves, a wide QRS, a slow rate with a low pressure — and those changes call for IV calcium at once: it steadies the heart within minutes, and the lab result changes nothing about that. Every minute spent waiting, the QRS widened and the rate fell.',
    },
    {
      // before the 12-lead, atropine is the bradycardia algorithm's first drug: only once the tracing shows the cause is it a detour
      id: 'atropine-first', actions: ['atropine'], roles: ED_MD, points: 3, severity: 'minor',
      when: (s) => s.pulse && ecgSeen(s) && !has(s, 'calcium'),
      text: 'Atropine first, for a slow rate the 12-lead has already put down to the potassium. The potassium, not the vagus, slows this heart: atropine rarely helps, and it delays the drug that does — IV calcium.',
    },
    {
      id: 'pace-before-calcium', actions: ['pace', 'temp-wire'], replaces: ['pace-no-analgesia', 'temp-wire-without-pads'], points: 5, severity: 'major',
      when: (s) => s.pulse && ecgSeen(s) && !has(s, 'calcium'),
      text: 'Pacing before calcium, with the 12-lead showing a high potassium. The potassium raises the pacing threshold: the pacer often cannot take over, the attempt hurts, and it delays the treatment. Calcium first; pacing or an epinephrine infusion is for a rate still too slow after it.',
    },
    {
      // the trap: bicarbonate into a line the calcium is still running through
      id: 'calcium-bicarbonate-same-line', actions: ['sodium-bicarbonate'], roles: ED_RN, points: 8, severity: 'major',
      when: (s) => s.pulse && calciumRunning(s),
      text: 'Bicarbonate pushed into the line while the calcium was still running in. Calcium and bicarbonate form a chalky calcium carbonate precipitate that blocks the line (and can wash into the vein): let the calcium finish, flush the line with saline, then give the bicarbonate — or use a second line.',
    },
    {
      // the trap: insulin with no glucose to start from
      id: 'insulin-before-glucose', actions: ['insulin-dextrose'], roles: ED_RN, replaces: ['insulin-glucose-unchecked'], points: 3, severity: 'minor',
      when: (s) => !has(s, 'glucose-checked'),
      text: 'Insulin with no glucose checked first. The baseline decides how much dextrose he needs (a glucose already low is treated first, a high one may need none) and is what every recheck is compared with: check it, then give the dextrose and insulin, then recheck at 30 minutes and every hour.',
    },
    {
      // bicarbonate only for the acidosis, once the gas shows it (it is not a potassium drug on its own: 2021 ACEP-sponsored
      // ED consensus) — and never ahead of the calcium. One rule for both, so one early dose costs once
      id: 'bicarbonate-early', actions: ['sodium-bicarbonate'], roles: ED_MD, points: 3, severity: 'minor',
      when: (s) => s.pulse && ((ecgSeen(s) && !has(s, 'calcium')) || !has(s, 'k-known')),
      text: 'Bicarbonate before calcium, or before the gas showed an acidosis. With the 12-lead showing a high potassium, calcium comes first; and bicarbonate is not a potassium drug on its own — it does little for the potassium in the first hour, adds sodium and fluid, and is given only for a metabolic acidosis, once the gas shows one (here it did: a bicarbonate of 12).',
    },
    {
      // one rule for all of them, in its own words; it stands in for the built-in procainamide and arrest-amiodarone rules
      id: 'antiarrhythmic-wide', actions: ['lidocaine', 'amio-infusion', 'amio-arrest', 'procainamide'], points: 15, severity: 'critical',
      replaces: ['procainamide-slow', 'procainamide-hypotension', 'procainamide-in-arrest', 'arrest-amio-with-pulse', ...LIDOCAINE_RULES, ...RATE_RULES],
      text: 'Lidocaine, amiodarone or procainamide for the wide complexes. This is not VT: a high potassium widens the QRS by depressing the heart\'s sodium channels, and these drugs depress them further — the rate falls and the heart can stop. Treat the potassium: calcium.',
    },
    {
      id: 'av-blocker', actions: ['metoprolol', 'esmolol', 'labetalol', 'metoprolol-po', 'diltiazem'], replaces: RATE_RULES, points: 12, severity: 'critical',
      text: 'A beta-blocker or calcium-channel blocker for a slow heart with a high potassium. Both slow the AV node and weaken the squeeze; with the potassium they spiral toward standstill.',
    },
    { id: 'adenosine-slow', actions: ['adenosine3', 'adenosine6', 'adenosine12'], replaces: RATE_RULES, points: 8, severity: 'major', text: 'Adenosine for a slow rhythm. It blocks the AV node for several seconds: at a rate this slow that is a pause with no output, and it treats nothing here.' },
    { id: 'vagal-slow', actions: ['vagal'], when: (s) => s.pulse, points: 3, severity: 'minor', text: 'A vagal maneuver for a slow rhythm. It slows the heart further; it is for a fast, regular narrow-complex tachycardia.' },
    {
      id: 'magnesium-kidneys', actions: ['magnesium-sulfate'], points: 5, severity: 'major', replaces: ['magnesium-routine-arrest', 'magnesium-renal-failure', 'magnesium-no-indication'],
      text: 'Magnesium for a patient whose kidneys are failing. Nothing here calls for it (his magnesium is already 2.5), and he cannot clear it: a high magnesium adds weakness, slows the heart and lowers the pressure.',
    },
    { id: 'fluid-repeat', actions: ['fluid'], when: (s) => count(s, 'fluid') >= 1, points: 3, severity: 'minor', text: 'Repeated fluid boluses for a pressure that comes from a slow rate, in a man with failing kidneys, swollen ankles and crackles. The fluid barely moves the pressure and floods the lungs: fix the rate (calcium).' },
    { id: 'cpap-no-indication', actions: ['cpap'], when: (s) => s.pulse, replaces: ['cpap-hypotension', 'cpap-vomiting', 'cpap-preload-dependent', 'cpap-drowsy'], points: 5, severity: 'major', text: 'CPAP without breathing trouble. His oxygen is fine; the positive pressure cuts the blood returning to the heart, and with a systolic in the 80s it deepens the shock.' },
    {
      // the same id as the built-in rule: here the low pressure is the slow rate's, and the tube does not treat it
      id: 'rsi-no-indication', actions: ['rsi'], roles: ED_MD, when: (s) => s.pulse && s.vitals.gcs >= 9, points: 10, severity: 'major',
      text: 'Rapid sequence intubation for a patient who still breathes and oxygenates on his own. The induction drug and positive pressure drop the pressure of a heart the potassium has slowed, and can stop it — and succinylcholine, the usual paralytic, raises the potassium further and must never be used here. Treat the potassium.',
    },
    {
      // the same id as the built-in rule, kept apart from the one above (one mistake, one penalty): a comatose patient after
      // ROSC needs the tube, but not with a low pressure that nothing holds up
      id: 'rsi-unresuscitated', actions: ['rsi'], roles: ED_MD, points: 8, severity: 'major',
      when: (s) => s.pulse && s.vitals.gcs < 9 && s.vitals.sbp < 90 && !has(s, 'pressor') && !has(s, 'push-epi'),
      text: 'Rapid sequence intubation with a low blood pressure and nothing to hold it up. He needs the tube, but the induction drug and positive-pressure ventilation drop the pressure further, and he can arrest again around the tube: resuscitate before you intubate — an epinephrine infusion or push-dose epinephrine running, and calcium again — and give a reduced dose of the most stable induction drug (no succinylcholine with this potassium).',
    },
    { id: 'glucagon-no-overdose', actions: ['glucagon'], replaces: ['glucagon-no-indication'], points: 3, severity: 'minor', text: 'Glucagon without an overdose. It is for a beta- or calcium-channel-blocker overdose, and he takes neither; it does nothing for a slow rate from the potassium, and the vomiting it brings is dangerous in a weak patient lying flat.' },
    { id: 'opioid-no-pain', actions: ['fentanyl'], roles: ED_MD, when: (s) => s.pulse && s.vitals.pain === 0 && s.rhythm.profile !== 'tcp' && !has(s, 'airway'), points: 3, severity: 'minor', replaces: SEDATIVE_RULES, text: 'An opioid for a patient with no pain. With his pressure this low and his breathing muscles weak, it only adds hypotension and slower, shallower breathing.' },
    askHarm(CALCIUM, 'Atropine when the physician ordered calcium. The potassium, not the vagus, slows this heart: give what was ordered, and if you disagree with an order, say so before giving anything else.'),
    askHarm(NEB, 'Albuterol 2.5 mg when the physician ordered 10–20 mg. The wheezing dose is a quarter to an eighth of what moves potassium into the cells: check the dose on the order before you give it.'),
  ]),
  timings: [
    DOOR_TO_ECG,
    { label: '12-lead to calcium', actions: CALCIUMS, flag: 'calcium', from: 'ecg12', target: 5 },
    { label: 'Insulin with dextrose', actions: ['insulin-dextrose'], flag: 'insulin', target: 15 },
    { label: 'Glucose rechecked after the insulin', actions: [], flag: 'glucose-rechecked', from: 'insulin', target: 60 },
  ],
  teaching: [
    'Think of a high potassium in anyone with kidney disease who is weak, nauseated or slow — more so on an ACE inhibitor or ARB, spironolactone or another potassium-sparing diuretic, NSAIDs, trimethoprim or a potassium salt substitute. Weakness, tingling and a slow pulse are its signs; the heart is what kills.',
    'Its ECG signs: tall, narrow, peaked T waves; flattened or lost P waves and a long PR; a widening QRS; then a slow wave of merging complexes, PEA, VF or asystole. The changes do not always come in order, and a normal-looking ECG does not rule a high potassium out (2021 ACEP-sponsored ED consensus).',
    'With ECG changes, IV calcium comes first, at once — without waiting for the lab: it steadies the heart within minutes, lasts 30–60 minutes and lowers no potassium. Calcium gluconate (1–3 g, safer in a small peripheral vein) or, for an unstable patient, calcium chloride 1 g (three times the calcium) through a large vein, slowly. Repeat it if the changes persist after 5–10 minutes.',
    'Then shift the potassium into the cells: regular insulin 10 units IV (5 units in some protocols for kidney failure) with dextrose 25 g given with it, so insulin never goes in alone (the dextrose is left out only when the glucose is already 250 mg/dL or more) — and nebulized albuterol 10–20 mg, four to eight times the wheezing dose. Each lowers it by roughly 0.5–1 mEq/L within 30–60 minutes.',
    'Insulin lowers the glucose as well: check it before the dose, at 30 minutes and every hour for at least 4–6 hours — failing kidneys clear insulin slowly, and lows come hours later. Treat a low at once with dextrose.',
    'Sodium bicarbonate is not a potassium drug on its own: give it only for a metabolic acidosis, and never through a line the calcium is running in — the two form a calcium carbonate precipitate. Flush with saline between them, or use a second line.',
    'Then remove it. Dialysis is the fast way when the kidneys have failed (an emergency dialysis catheter if there is no access); a loop diuretic is an add-on only, never on its own, and only while the patient makes urine and is not dry; a binder (sodium zirconium cyclosilicate 10 g three times a day, or patiromer) works over hours. Sodium polystyrene sulfonate is no longer favored. Stop every drug and supplement that raised it.',
    'Recheck the potassium after the shift and every 2–4 hours, and repeat the 12-lead: insulin and albuterol wear off in a few hours, and the potassium comes back until it has been removed.',
    'Atropine rarely helps a slow rhythm from potassium, and a high potassium raises the pacing threshold, so the pacer may not take over: pads on, but calcium first. Never give lidocaine, amiodarone or procainamide for wide complexes from a high potassium, and avoid beta-blockers, calcium-channel blockers and adenosine. If an airway is needed, succinylcholine is contraindicated: it raises the potassium.',
    'In a hyperkalemic cardiac arrest (2025 AHA): high-quality CPR and epinephrine as for any PEA (a shock for VF); IV calcium, sodium bicarbonate and insulin with glucose may be given without interrupting compressions, but their benefit in arrest is not well established, and inhaled albuterol is not recommended during an arrest.',
    'The ER nurse puts the pads on, calls the physician, places a large-bore line and records the 12-lead within minutes — then takes the tracing to the physician the moment it prints, gives each drug on the order (or on a nurse-driven hyperkalemia protocol, where the department has one) — one order, one dose: a repeat needs its own order — keeps the calcium and the bicarbonate apart (and never draws blood from the line the calcium runs in), checks the glucose before and after the insulin, reports the critical potassium at once (read back, closed loop) and finds every source of potassium in the history.',
  ],
};
