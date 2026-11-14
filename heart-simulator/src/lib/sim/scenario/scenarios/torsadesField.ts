import type { Effect, Line, Scenario, SimState } from '../types';
import { PADS, bpAfter, has, line, paced } from '../kit';
import { RATE_RULES } from '../rules/rhythm';

/**
 * Drug-induced long QT with torsades de pointes. A 58-year-old woman who has taken a thiazide for years (it drains potassium
 * and magnesium) started azithromycin and ondansetron this week, and has vomited since: three risk factors stacked on a
 * woman's longer QT. Runs of torsades make her faint and stop on their own; without magnesium or a faster heart rate, the
 * run that does not stop comes at minute 8 and she is pulseless. The paramedic who gives magnesium in time never meets it;
 * the EMT, who cannot give it, always does — the AED, CPR and an early ALS call are the EMT's part.
 *
 * Sources: 2025 AHA adult ALS (sustained polymorphic VT: defibrillate, unsynchronized, pulse or not; magnesium may be
 * considered for recurrent polymorphic VT with a long QT, not routinely with a normal QT); the 2010 AHA/ACCF scientific
 * statement on torsades in hospital settings (stop the drug, magnesium 2 g whatever the serum level, pacing over 70 to
 * abolish the pauses, potassium to 4.5–5). The 2025 AHA guideline gives overdrive pacing no graded recommendation: for
 * pause-dependent torsades it sends overdrive pacing and isoproterenol to expert consultation. Magnesium is the first step
 * here; pacing before it, or after it has stopped the runs, costs a little.
 */

/** Her rhythm between the runs: sinus at 58 with a QTc of about 580 ms and the odd PVC landing on the T wave */
const BASE = { profile: 'long-qt', hr: 58 };
/** Her rhythm once the pulse is back after an arrest */
const AFTER_ROSC = { profile: 'long-qt', hr: 64 };
/** A run of torsades */
const RUN = { profile: 'torsades', hr: 220 };
/** The minute each self-terminating run starts, if nothing has stopped them yet */
const RUN_AT: Record<RunId, number> = { run1: 2, run2: 5 };
type RunId = 'run1' | 'run2';
const RUN_IDS: RunId[] = ['run1', 'run2'];
/** Without magnesium or a faster heart rate, the run that does not stop comes at this minute */
export const SUSTAINED_AT = 8;
/** After ROSC without magnesium, it comes back this many minutes later */
const RECURS_AFTER = 4;
/** Torsades left unshocked degenerates into VF after this many minutes */
const DEGENERATES_AFTER = 3;
/** Minutes from the EMT's call until the paramedic intercept reaches her (a rural county: the nearest unit is busy) */
export const ALS_MINUTES = 10;

/** The monitor or the pads are on, so a change of rhythm sounds an alarm */
const ecgOn = (s: SimState) => has(s, 'monitor') || has(s, 'pads');

/** In a run that will stop by itself: for those seconds she is out, with no pulse to feel */
const inRun = (s: SimState) => has(s, 'in-run');

/** Magnesium on board, or a pacer driving the rate (no pauses left): the runs stop coming */
const protectedFrom = (s: SimState) => has(s, 'magnesium') || paced(s);

/** Analgesia or sedation on board before a pacer thumps her chest */
const comfortable = (s: SimState) => has(s, 'analgesia') || has(s, 'sedation') || has(s, 'benzodiazepine');

/** Only a patient awake enough to talk says how a drug feels */
const awake = (s: SimState, text: string): Line[] => (s.pulse && !inRun(s) && s.vitals.gcs >= 13 ? [line('patient', text)] : []);

const RUN_FLAGS = ['in-run', ...RUN_IDS.map((id) => `${id}-live`)];

/** The action just finished was a 12-lead: a run does not start on it, so the tracing is the one between the runs */
function just12Lead(s: SimState): boolean {
  const last = s.performed.at(-1)?.id;
  return last === 'ecg12' || last === 'ecg12-repeat';
}

/** Compressions have been given in the arrest she is in now */
const cprThisArrest = (s: SimState) => s.timers.arrestAt !== undefined && s.performed.some((p) => p.id === 'cpr' && p.minute >= s.timers.arrestAt!);

/** A shock was delivered in the arrest she is in now */
const shockedThisArrest = (s: SimState) => s.timers.lastShockAt !== undefined && s.timers.arrestAt !== undefined && s.timers.lastShockAt >= s.timers.arrestAt;

function startRun(s: SimState, id: RunId): Effect {
  return {
    say: [...(ecgOn(s) ? [line('monitor', 'Monitor alarm.', 'bad')] : []), line('partner', 'She has slumped mid-sentence — gray, eyes rolled up, her arms jerking!', 'bad')],
    rhythm: { ...RUN }, vitals: { gcs: 3 }, flags: ['in-run', `${id}-live`],
  };
}

/** The run stops by itself (or as the action that ended it says): she comes around, clear-headed, in her own rhythm */
function comeRound(say: Line[]): Effect {
  return { say, rhythm: { ...BASE }, vitals: { gcs: 15 }, clear: RUN_FLAGS };
}

/** The run that does not stop: she is pulseless */
function sustained(s: SimState, again: boolean): Effect {
  return {
    say: [
      ...(ecgOn(s) ? [line('monitor', 'Monitor alarm.', 'bad')] : []),
      line('partner', again ? 'She has slumped again — gray, gasping. This one is not stopping!' : 'She has slumped again — gray, gasping — and this time she is not coming around!', 'bad'),
    ],
    rhythm: { profile: 'torsades', hr: 230 }, pulse: false, phase: 'arrest', vitals: { sbp: 0, dbp: 0, gcs: 3, rr: 0 },
    clear: [...RUN_FLAGS, 'provoked'], flags: [again ? 'recurred' : 'sustained'],
  };
}

/**
 * A shock in her arrest. Torsades, or VF caught within minutes, stops at once; VF left for minutes (the torsades broke down
 * unshocked) needs compressions behind it first. Either way the stunned heart beats in an organized way but gives no pulse
 * yet: CPR now, and the pulse returns with it. `mine`: the learner's own shock (not the paramedic intercept's), the one the
 * "shock at once" item scores; `who` says the shock line (the device's, or the arriving team's)
 */
function shock(s: SimState, how: string, mine = true, who: Line[0] = 'monitor'): Effect | null {
  if (s.pulse || (s.rhythm.profile !== 'torsades' && s.rhythm.profile !== 'vf')) return null;
  const flags = ['pads', 'monitor', 'shocked', ...(mine ? ['arrest-shock'] : [])];
  const from = s.timers.arrestAt ?? s.minute;
  if (s.rhythm.profile === 'vf' && s.minute - from >= DEGENERATES_AFTER && !cprThisArrest(s)) {
    return { say: [line(who, how), line('you', 'Still no pulse — straight back on the chest.', 'warn')], flags };
  }
  return {
    say: [line(who, how), line('you', s.role === 1
      ? 'She is still unresponsive, with no pulse at her neck and no normal breathing.'
      : 'Organized complexes on the screen now — but no pulse at her neck yet.', 'warn')],
    rhythm: { ...BASE }, flags: [...flags, 'converted'],
  };
}

/** Two minutes of compressions after the shock bring the pulse back */
function rosc(s: SimState): Effect {
  return {
    say: [line('you', `2 minutes of compressions. At the ${s.role === 1 ? 'pulse' : 'rhythm'} check she coughs and moves her arm: a carotid pulse — ROSC.`, 'good')],
    rhythm: { ...AFTER_ROSC }, pulse: true, phase: 'rosc', vitals: { sbp: 104, dbp: 64, spo2: 95, rr: 16, gcs: 13, pain: 2 }, flags: ['cpr'],
  };
}

/** What a drug that lengthens the QT (or the pause adenosine makes) does to her: it sets off the next run, and that one does not stop */
function provokes(s: SimState, lines: Line[], flags: string[], extra: Partial<Effect> = {}): Effect | null {
  if (!s.pulse) return null;
  return { say: lines, flags: [...flags, 'provoked'], ...extra };
}

/**
 * What the physician tells the EMT about the paramedics: call them, keep them coming, let them run the drugs — or nothing,
 * once she is at the hospital
 */
function medicsAdvice(s: SimState): string | null {
  if (has(s, 'arrived')) return null;
  if (has(s, 'als-here')) return 'Let the paramedics with you run the magnesium';
  return has(s, 'als') ? 'Keep the paramedics coming' : 'Get a paramedic intercept on the way';
}

/** An assessment made during a run: she is out for those seconds, then comes around */
const OUT = 'She is slumped and gray, eyes rolled up, her arms jerking; no pulse at the wrist. After about 15 seconds she takes a deep breath, her color comes back and she opens her eyes.';

/** The radio report while she has a pulse: the hospital hears about the new medicines only once you have asked about them */
const reportPulse = (s: SimState) => (has(s, 'sample')
  ? 'Copy: a 58-year-old woman with repeated faints, on new medicines. Bring the bottles; the resuscitation bay will be ready.'
  : 'Copy: a 58-year-old woman with repeated faints. The resuscitation bay will be ready.');

export const torsadesField: Scenario = {
  id: 'torsades-field',
  title: 'Blacking out again',
  summary: '58-year-old woman who has fainted three times since breakfast, days after starting new medicines. Find out why — before the next one does not stop.',
  setting: 'field',
  roles: [1, 2],
  difficulty: 'advanced',
  conditionId: 'torsades-de-pointes',
  briefing: {
    default: [
      ['dispatch', 'Priority 1: 58-year-old woman, fainting. She has passed out three times this morning.'],
      ['scene', 'A kitchen. She sits pale at the table with a bowl in her lap; her daughter holds her hand. "She keeps blacking out — the last time her arms jerked."'],
      ['partner', 'Your partner, an EMT, has the stretcher and the jump bag; you have the monitor and the drug box.'],
      ['hospital', 'Regional heart center (cardiology, electrophysiology, ICU): 12 minutes. Nearest emergency department: 6 minutes.'],
    ],
    1: [
      ['dispatch', 'Priority 1: 58-year-old woman, fainting. She has passed out three times this morning.'],
      ['scene', 'A kitchen. She sits pale at the table with a bowl in her lap; her daughter holds her hand. "She keeps blacking out — the last time her arms jerked."'],
      ['partner', `Your partner, an EMT, has the AED and the jump bag. You are a BLS unit: the nearest paramedic unit is across the county, about ${ALS_MINUTES} minutes away once you ask for it.`],
      ['hospital', 'Regional heart center (cardiology, electrophysiology, ICU): 12 minutes. Nearest emergency department: 6 minutes.'],
    ],
  },
  initial: {
    rhythm: { ...BASE },
    vitals: { sbp: 112, dbp: 68, spo2: 97, rr: 18, etco2: 35, pain: 0, gcs: 15, glucose: 118, temp: 36.9 },
  },
  // the drug rules read the long QT from the case, not only from the tracing (a pacer's rhythm hides it)
  problems: ['long-qt'],
  facts: {
    opqrst: (s) => (inRun(s)
      ? 'She cannot answer: she is out. Her daughter: "That is what it looks like every time — she goes gray and stiff, her arms jerk, and a few seconds later she is back. Three times since breakfast."'
      : '"No pain. I just keep blacking out — three times since breakfast. Everything goes gray, my heart flutters, and the next thing I know I\'m on the floor with my daughter calling my name. It only lasts a few seconds, and I come around clear-headed. I\'ve felt sick to my stomach all week." Her daughter: "The last time she went stiff and her arms jerked."'),
    // she answers between the spells; during one her daughter does
    sample: (s) => (inRun(s)
      ? 'She cannot answer: she is out. Her daughter: "No allergies. Hydrochlorothiazide for her blood pressure, for years. On Monday the urgent care gave her azithromycin for a chest cold, and ondansetron dissolving tablets for the nausea — she took one an hour ago. She has been vomiting, with diarrhea, since Tuesday. No heart trouble before, and nobody in the family died young or suddenly." She hands you the three bottles: you bag them to bring along.'
      : '"No allergies. Hydrochlorothiazide for my blood pressure, for years. On Monday the urgent care gave me azithromycin for a chest cold, and ondansetron dissolving tablets for the nausea — I took one an hour ago. I\'ve been vomiting, with diarrhea, since Tuesday. No heart trouble before, and nobody in my family died young or suddenly. A little toast this morning." Her daughter hands you the three bottles: you bag them to bring along and tell her to take no more until a doctor has seen her.'),
    pde5: '"No."',
    lungs: 'Clear and equal on both sides.',
    perfusion: (s) => {
      if (!s.pulse) return 'No pulse.';
      if (inRun(s)) return 'Gray and still; no pulse at the wrist while she is out.';
      if (paced(s)) return 'Color better; femoral pulse at 90, matching the pacer.';
      return 'Pale and a little dry in the mouth; skin cool. Radial pulse slow, about 60, with a skipped beat now and then. No JVD, no leg swelling.';
    },
    neuro: (s) => {
      if (inRun(s)) return 'Unresponsive, eyes rolled up, arms jerking — then, within seconds, she comes around.';
      if (has(s, 'rosc')) return 'Confused at first after the arrest, but she follows commands and moves all four limbs; no focal deficit.';
      return 'Alert and oriented; no focal deficit. No tongue bite, no incontinence, and she is clear-headed within a minute of each spell: fainting with a few jerks, not a seizure.';
    },
    ecg12: (s) => {
      if (s.rhythm.profile === 'tcp') return `Paced at ${s.rhythm.hr} with a wide QRS after every pacing spike (capture): the faster rate leaves no long pauses for torsades to start from.`;
      if (s.rhythm.profile !== 'long-qt') return 'No 12-lead possible right now.';
      return `Sinus rhythm ${s.rhythm.hr} with a very long QT — a QTc of about 580 ms, where over 500 is the danger zone — broad T waves, and now and then a PVC landing on the end of a T wave, followed by a pause. In a woman who keeps fainting, on a diuretic and two new QT-prolonging drugs, this is the set-up for torsades de pointes: her faints are runs of it. No ST elevation.`;
    },
    poisonControl: 'Poison center: "Azithromycin and ondansetron both lengthen the QT, and her water pill drains the potassium and magnesium that protect against it. This is a medicine side effect, not an overdose: no more doses of either, keep her on a monitor with the pads on, and get her to a hospital. Bring the bottles."',
  },
  status: (s) => {
    if (!s.pulse) return 'Unresponsive, no pulse.';
    if (inRun(s)) return 'Unresponsive.';
    if (has(s, 'rosc')) return 'Drowsy but answering: "What happened? My chest is sore."';
    if (paced(s)) return comfortable(s) ? '"The thumping is bearable now."' : '"Ow — that thumping hurts!"';
    if (has(s, 'magnesium')) return '"I feel warm and flushed — but no more of those spells."';
    return '"I feel sick and washed out… I\'m scared it will happen again."';
  },
  respond: {
    // during a run she is out for a few seconds, with no pulse: what an assessment finds, then she comes around
    primary: (s) => (inRun(s) ? comeRound([line('you', OUT)]) : null),
    reassess: (s) => (inRun(s) ? comeRound([line('you', OUT)]) : null),
    vitals: (s) => (inRun(s) ? comeRound([line('you', 'No pulse at the wrist and no pressure to hear while she is out. After about 15 seconds she gasps and comes around; the pulse is back, slow.')]) : null),
    nibp: (s) => (inRun(s) && has(s, 'monitor') ? comeRound([line('monitor', 'NIBP: no reading.'), line('you', 'She comes around as the cuff deflates.')]) : null),
    'pulse-check': (s) => (inRun(s) ? comeRound([line('you', 'No pulse at her neck for a few seconds — then it is back, slow, and she stirs and opens her eyes.')]) : null),
    // unresponsive and pulseless for those seconds, so starting CPR is right: she pushes the rescuer away as it stops
    cpr: (s) => {
      if (inRun(s)) return comeRound([line('you', 'You kneel to start compressions — after a few she gasps, moves and pushes your hands away: it stopped by itself.')]);
      if (!s.pulse && s.rhythm.profile === BASE.profile) return rosc(s);
      return null;
    },
    bvm: (s) => (inRun(s) ? comeRound([line('you', 'As the mask goes on she gasps, coughs and pushes it away: she is breathing on her own again.')]) : null),
    airway: (s) => (inRun(s) ? comeRound([line('you', 'Before the airway is out of its packet she gasps and comes around: no airway for a patient who is awake.')]) : null),
    // the AED goes on a patient who is unresponsive and pulseless: during a run she is, and it stops as the AED analyzes
    aed: (s) => {
      if (inRun(s)) {
        return {
          ...comeRound([line('monitor', 'AED: "Analyzing heart rhythm…"'), line('you', 'She stirs and gasps as it analyzes: the spell has stopped by itself. The pads stay on.'), line('monitor', 'AED: "No shock advised."')]),
          flags: ['pads', 'monitor'],
        };
      }
      const shocked = shock(s, 'AED: "Shock advised." Shock delivered. "Start CPR."');
      // an AED cannot analyze in a moving ambulance: the driver pulls over
      if (shocked && has(s, 'enroute') && !has(s, 'arrived')) return { ...shocked, say: [line('partner', 'Pulling over for the AED.'), ...(shocked.say ?? [])] };
      return shocked;
    },
    defib: (s) => {
      // sustained or not, an unsynchronized shock is right for torsades (2025 AHA): this run was about to stop anyway
      if (inRun(s)) return { ...comeRound([line('monitor', 'Shock delivered: 200 J.'), line('patient', '"Ow! … What happened?" She is awake again, and sore.')]), flags: ['pads', 'monitor', 'shocked'] };
      // with a pulse and her own rhythm: the shock lands on a T wave that a long QT makes wide — VF
      if (s.pulse) {
        return {
          say: [line('monitor', 'Shock delivered: 200 J — the monitor alarms.', 'bad'), line('partner', 'She has gone limp — she is not breathing right!', 'bad')],
          rhythm: { profile: 'vf', hr: 0 }, pulse: false, phase: 'arrest', vitals: { sbp: 0, dbp: 0, gcs: 3, rr: 0 }, clear: RUN_FLAGS, flags: ['pads', 'monitor', 'iatrogenic'],
        };
      }
      return shock(s, 'Shock delivered: 200 J.');
    },
    // the drug for the runs: no new one comes once it is in (a run under way stops by itself, as they all do — magnesium
    // prevents the next one rather than ending this one)
    'magnesium-sulfate': (s) => {
      // pulseless: pushed — and only compressions already under way "go on" (the default line says so whatever happened)
      if (!s.pulse) return { say: [line('you', `Magnesium sulfate 2 g pushed${cprThisArrest(s) ? '; compressions go on' : ''}.`)], flags: ['magnesium'] };
      const bp = bpAfter(s, -6, -4);
      const dose = has(s, 'magnesium') ? 'A second 2 g of magnesium sulfate running in.' : 'Magnesium sulfate 2 g IV running in.';
      if (inRun(s)) {
        const back = comeRound([line('you', dose), line('you', 'The spell stops by itself as the drip starts; she comes around.'), line('patient', '"I feel warm and flushed… did I pass out again?"')]);
        return { ...back, vitals: { ...back.vitals, ...bp }, flags: ['magnesium'] };
      }
      return { say: [line('you', dose), ...awake(s, '"I feel warm and flushed."'), line('monitor', `BP ${bp.sbp}/${bp.dbp}.`)], vitals: bp, flags: ['magnesium'] };
    },
    // overdrive pacing: a rate of 90 leaves no pauses for a run to start from (painful through the skin)
    pace: (s) => {
      if (!s.pulse) return null;
      const say: Line[] = [
        ...(inRun(s) ? [line('you', 'The spell stops by itself as the pacer starts; she comes around.')] : []),
        line('monitor', 'Pacer on: rate set to 90, above her own; output turned up to 70 mA.'),
        line('you', 'A wide beat after every spike, and her femoral pulse matches at 90: no more pauses for a run to start from.'),
        ...(comfortable(s) ? [] : [line('patient', '"Ow — it thumps my chest with every beat!"', 'bad')]),
      ];
      return {
        say, rhythm: { profile: 'tcp', hr: 90 }, vitals: { gcs: 15, pain: Math.max(s.vitals.pain, comfortable(s) ? 2 : 6) },
        clear: RUN_FLAGS, flags: ['pads', 'monitor', 'paced', 'overdrive'],
      };
    },
    // drugs that lengthen the QT, or pause the heart, set off the run that does not stop
    ondansetron: (s) => provokes(s, [line('you', 'Ondansetron 4 mg IV, slowly over 30 seconds.'), ...awake(s, '"Thanks… my stomach."')], ['antiemetic']),
    'amio-infusion': (s) => provokes(s, [line('you', 'Amiodarone 150 mg running over 10 minutes.')], ['amiodarone']),
    'amio-arrest': (s) => provokes(s, [line('you', 'Amiodarone 300 mg pushed.')], ['amiodarone']),
    procainamide: (s) => {
      const bp = bpAfter(s, -10, -6);
      return provokes(s, [line('you', 'Procainamide running at 30 mg/min.'), line('monitor', `BP ${bp.sbp}/${bp.dbp}.`)], ['procainamide'], { vitals: bp });
    },
    adenosine6: (s) => provokes(s, [line('you', 'Adenosine 6 mg rapid push, flushed.'), line('monitor', 'A long pause on the screen.', 'bad')], ['adenosine']),
    adenosine12: (s) => provokes(s, [line('you', 'Adenosine 12 mg rapid push, flushed.'), line('monitor', 'A long pause on the screen.', 'bad')], ['adenosine']),
    // slower beats mean longer pauses, and the pauses are what set the runs off
    metoprolol: (s) => {
      const bp = bpAfter(s, -12, -8);
      return provokes(s, [line('monitor', `Heart rate 50. BP ${bp.sbp}/${bp.dbp}.`)], ['beta-blocker'], { vitals: bp, rhythm: { ...s.rhythm, hr: Math.min(s.rhythm.hr, 50) } });
    },
    diltiazem: (s) => {
      const bp = bpAfter(s, -12, -8);
      return provokes(s, [line('monitor', `Heart rate 52. BP ${bp.sbp}/${bp.dbp}.`)], ['diltiazem'], { vitals: bp, rhythm: { ...s.rhythm, hr: Math.min(s.rhythm.hr, 52) } });
    },
    'hs-ts': (s) => ({
      say: [line('you', `Hs and Ts against what you know. Hypokalemia and low magnesium: years of hydrochlorothiazide, then vomiting and diarrhea since Tuesday. Toxins: azithromycin and ondansetron, both started this week. Hypoxia: ${s.pulse ? 'her SpO₂ is fine' : 'not before this'}. No sign of bleeding, a clot, tamponade or a pneumothorax; she is warm.`)],
      flags: ['hs-ts'],
    }),
    als: () => ({ say: [['dispatch', `Medic unit assigned from across the county — about ${ALS_MINUTES} minutes out. They will meet you wherever you are.`]], flags: ['als'] }),
    // the physician reads the 12-lead the EMT cannot interpret; the paramedic has already read it
    'ecg-transmit': (s) => {
      if (!has(s, 'ecg12')) return null;
      if (s.role !== 1) return { say: [['hospital', 'ECG received; the physician is reviewing it.']], flags: ['transmitted'] };
      const explains = has(s, 'arrest') ? 'That explains the faints and the arrest' : 'That explains the faints';
      const medics = medicsAdvice(s);
      return { say: [['hospital', `ECG received. The emergency physician: "Her QT is very long — well over 500. ${explains}. Keep the AED pads on her${medics ? `; ${medics.charAt(0).toLowerCase()}${medics.slice(1)}` : ''}. No more of those two new medicines."`]], flags: ['transmitted'] };
    },
    notify: (s) => ({
      say: [['hospital', s.pulse ? reportPulse(s) : 'Copy: cardiac arrest, resuscitation under way. The resuscitation bay will be ready for her.']],
      flags: ['notified'],
    }),
    // online medical direction: what it says depends on where she is, and never names the rhythm before the 12-lead is in
    'med-control': (s) => {
      let advice: string;
      if (!s.pulse) advice = 'Medical control: no pulse — shock it now, compressions straight after the shock, and call me back.';
      else if (s.role === 1) {
        const medics = medicsAdvice(s);
        // the physician names her medicines only once you have asked about them
        const drugs = has(s, 'sample') ? 'No more doses of the azithromycin or the ondansetron, and bring the bottles.' : 'Find out what she takes and what is new this week, and bring the bottles.';
        advice = `Medical control: faints like hers can be a dangerous heart rhythm. Keep the AED pads on her; if she goes unresponsive and does not come around, check for a pulse and use the AED at once.${medics ? ` ${medics}.` : ''} ${drugs}`;
      } else if (!has(s, 'ecg12') && !has(s, 'transmitted')) advice = 'Medical control: keep the pads on her, get me a 12-lead and call me back.';
      else if (!has(s, 'magnesium')) advice = 'Medical control: magnesium sulfate 2 g IV now, and keep the pads on. No ondansetron, amiodarone or procainamide. If a run does not stop, defibrillate — unsynchronized, pulse or not. Bring the bottles.';
      else advice = 'Medical control: good. If the runs come back, a second 2 g of magnesium; if they still come, overdrive pacing at 90 with analgesia, and call me. Bring her in with the bottles.';
      return { say: [['hospital', advice]], flags: ['med-control'] };
    },
  },
  events: [
    {
      // the EMT's intercept: the medics take over the drugs — and shock her if nobody has
      id: 'als-arrives',
      // the intercept meets the ambulance on the way: a crew that reaches the hospital first no longer needs it
      when: (s) => s.role === 1 && has(s, 'als') && !has(s, 'handoff') && !has(s, 'arrived') && s.minute >= s.flags.als + ALS_MINUTES,
      effect: (s) => {
        const drug = 'magnesium sulfate 2 g';
        if (!s.pulse) {
          const shocked = !shockedThisArrest(s) ? shock(s, 'The paramedics arrive: she has not been shocked yet — they defibrillate at once, 200 J.', false, 'team') : null;
          const lines: Line[] = shocked?.say ?? [];
          return {
            ...(shocked ?? {}),
            say: [...lines, line('team', `The paramedics take over the drugs: an IV in her arm, ${drug} pushed. "${cprThisArrest(s) ? 'Keep the compressions going.' : 'Compressions — now.'}"`)],
            flags: [...(shocked?.flags ?? []), 'iv', 'magnesium', 'als-here'],
          };
        }
        const say: Line[] = [line('team', `The paramedic intercept arrives and takes over the drugs: an IV in her arm and ${drug} running in. "Pads stay on — that should stop the spells."`)];
        return inRun(s) ? { ...comeRound([...say, line('you', 'The spell stops; she comes around.')]), flags: ['iv', 'magnesium', 'als-here'] } : { say, flags: ['iv', 'magnesium', 'als-here'] };
      },
    },
    {
      // the run that does not stop: at minute 8 without magnesium or pacing — at once after a drug that provoked it
      id: 'sustained',
      when: (s) => s.pulse && !has(s, 'arrest') && !has(s, 'handoff') && (has(s, 'provoked') || (s.minute >= SUSTAINED_AT && !protectedFrom(s))),
      effect: (s) => sustained(s, false),
    },
    {
      // back with a pulse but nothing to stop the runs: it comes back
      id: 'recurs',
      when: (s) => s.pulse && has(s, 'rosc') && !has(s, 'handoff') && (has(s, 'provoked') || (!protectedFrom(s) && s.minute >= s.flags.rosc + RECURS_AFTER)),
      effect: (s) => sustained(s, true),
    },
    {
      // unshocked, the twisting rhythm breaks down: now compressions have to come before a shock can work
      id: 'degenerates',
      when: (s) => !s.pulse && s.rhythm.profile === 'torsades' && s.timers.arrestAt !== undefined && s.minute >= s.timers.arrestAt + DEGENERATES_AFTER,
      effect: (s) => ({ say: [...(ecgOn(s) ? [line('monitor', 'Monitor alarm.', 'bad')] : []), line('partner', 'Her lips are going blue.', 'bad')], rhythm: { profile: 'vf', hr: 0 } }),
    },
    // each self-terminating run lasts through one action, then stops (an action that ended it already leaves nothing to end)
    ...RUN_IDS.flatMap((id) => [
      {
        id: `${id}-ends`,
        when: (s: SimState) => has(s, `${id}-live`) && s.minute > s.flags[`${id}-live`],
        effect: (s: SimState) => comeRound([
          ...(ecgOn(s) ? [line('monitor', 'The alarm stops.')] : []),
          line('patient', 'She takes a deep breath and opens her eyes: "Did I pass out again?"'),
        ]),
      },
      {
        id,
        when: (s: SimState) => s.pulse && !inRun(s) && !has(s, 'arrest') && !has(s, 'handoff') && !protectedFrom(s) && s.minute >= RUN_AT[id]
          && (id === 'run1' || s.fired.includes('run1')) && !just12Lead(s),
        effect: (s: SimState) => startRun(s, id),
      },
    ]),
    {
      // the heart beats again after the shock but gives no pulse: it needs compressions
      id: 'no-cpr-after-shock',
      when: (s) => !s.pulse && s.rhythm.profile === BASE.profile && has(s, 'converted') && s.minute >= s.flags.converted + 1
        && !s.performed.some((p) => p.id === 'cpr' && p.minute >= s.flags.converted),
      effect: () => ({ say: [line('partner', 'Still no pulse — she needs compressions!', 'bad')] }),
    },
  ],
  critical: [
    // the items a hint can name before the 12-lead is read say nothing about what the tracing shows
    {
      id: 'pads', label: 'Defibrillator pads on her chest at once', points: 10, target: { by: 3 }, done: PADS,
      why: 'Faints that come and go like this can be a dangerous rhythm, and the next one may not stop: with the pads on, a shock is seconds away. An EMT puts the AED pads on now and lets it analyze only if she is unresponsive, not breathing normally and pulseless.',
    },
    {
      id: 'als', roles: [1], label: 'Request ALS (paramedic intercept) at once', points: 10, target: { by: 3 }, done: ['als'],
      why: `What may stop her spells — an IV, magnesium, a manual defibrillator — is ALS, and the nearest paramedic unit is ${ALS_MINUTES} minutes away: call at once.`,
    },
    {
      id: 'history', label: 'Her medicines: what is new this week (SAMPLE)', points: 10, target: { by: 6 }, done: ['sample'],
      why: 'Repeated faints soon after new medicines: some antibiotics and anti-nausea drugs, on top of a diuretic that lowers the potassium, can set off a dangerous rhythm. The bottles go with her.',
    },
    {
      id: 'ecg-sent', roles: [1], label: '12-lead acquired and transmitted', points: 10, target: { by: 8 },
      why: 'You cannot interpret it, but the physician can: it shows what makes her faint.',
      done: (s) => s.flags.transmitted ?? null, uses: ['ecg12', 'ecg-transmit'],
    },
    {
      id: 'ecg', roles: [2], label: '12-lead between the spells: record it and read it', points: 10, target: { by: 8 }, done: ['ecg12'],
      why: 'The tracing between the spells shows what sets them off: read every interval and wave, corrected for the rate — not only the rate and the ST segments.',
    },
    { id: 'iv', roles: [2], label: 'IV access', why: 'For the drug that stops her spells, and for the hospital\'s potassium.', done: ['iv', 'io'], points: 5 },
    {
      id: 'magnesium', roles: [2], label: 'Magnesium sulfate 2 g IV', points: 20, target: { by: 8 }, done: ['magnesium-sulfate'],
      why: 'Magnesium suppresses recurring runs of torsades de pointes, whatever her blood level (2025 AHA: may be considered for recurrent polymorphic VT with a long QT; the 2010 AHA/ACCF statement makes it the first-line drug): 2 g IV, diluted over about 5–15 minutes with a pulse, pushed without one; a second 2 g if the runs come back.',
    },
    {
      id: 'report', label: 'Stop the new medicines: no more doses, the bottles with her, and the hospital told', points: 5,
      why: 'Stopping every drug that lengthens the QT is part of the treatment: tell the hospital what she started this week (a radio report, medical control or the hand-off, with the bottles), so no one gives her more of them — or another one like them.',
      // the report has to carry the medicines: it counts once the history is in. The radio report cannot be repeated, so a
      // crew that radioed before asking tells the hospital at the hand-off instead
      done: (s) => {
        const from = s.flags.sample;
        if (from === undefined) return null;
        return s.performed.find((p) => ['notify', 'med-control', 'handoff'].includes(p.id) && p.minute >= from)?.minute ?? null;
      },
      uses: ['sample', 'notify', 'med-control', 'handoff'],
    },
    {
      id: 'arrest-shock', label: 'No pulse: shock at once (the AED, or unsynchronized defibrillation)', points: 20,
      // a hint can show this during the arrest, before anyone has named the rhythm to an EMT: it describes it without naming it
      why: 'A spell that does not stop is a cardiac arrest in a shockable rhythm: shock at once, unsynchronized — the AED, or the manual defibrillator (2025 AHA: this rhythm is defibrillated, pulse or not; synchronized mode cannot lock onto its twisting complexes). With the pads already on, the shock comes before anything else — and every minute without one costs her chance.',
      // the learner's own shock in the arrest (not the paramedic intercept's): when it was started
      done: (s) => (has(s, 'arrest-shock') ? [...s.performed].reverse().find((p) => (p.id === 'defib' || p.id === 'aed') && p.minute <= s.flags['arrest-shock'])?.minute ?? null : null),
      uses: ['aed', 'defib'], target: { within: { flag: 'arrest', minutes: 2 } }, applies: (s) => has(s, 'arrest'),
    },
    {
      id: 'cpr', label: 'CPR straight after the shock', points: 10, done: ['cpr'], after: 'converted',
      target: { within: { flag: 'converted', minutes: 1 } }, applies: (s) => has(s, 'converted'),
      why: 'After a shock, compressions resume at once for 2 minutes before the next rhythm and pulse check: the stunned heart beats again but gives no pulse yet.',
    },
    {
      // a reassessment reads the pressure as well (its line starts with it)
      id: 'post-bp', roles: [1], label: 'After ROSC: check her blood pressure', points: 5, done: ['vitals', 'nibp', 'reassess', 'bp-both-arms'], after: 'rosc', applies: (s) => has(s, 'rosc'),
      why: 'The pressure is often low after an arrest: measure it and report it to the paramedics.',
    },
    {
      id: 'post-ecg', label: '12-lead after ROSC', points: 5, done: ['ecg12', 'ecg12-repeat'], after: 'rosc', applies: (s) => has(s, 'rosc'),
      why: 'It shows the QT after the arrest and looks for ischemia; EMTs acquire and transmit it.',
    },
    {
      id: 'transport', label: 'Transport, with the pads on', points: 5,
      why: 'She needs her potassium and magnesium checked and replaced, continuous monitoring and, if the runs keep coming, a pacing wire or isoproterenol. A pulseless patient is worked on scene: transport after ROSC.',
      // a crew that loaded her before the arrest is transporting her again once she has a pulse
      done: (s) => {
        if (s.flags.enroute === undefined) return null;
        if (!has(s, 'arrest')) return s.flags.enroute;
        return s.flags.rosc === undefined ? null : Math.max(s.flags.enroute, s.flags.rosc);
      },
      uses: ['transport-pci', 'transport-near'],
    },
    {
      id: 'handoff', label: 'Hand-off', points: 5, done: ['handoff'],
      why: 'Report the faints, what the monitor showed, the 12-lead and its QT, the new medicines (with the bottles), the magnesium, any shock and when, and the times.',
    },
  ],
  harms: [
    {
      // during a run she is unresponsive and pulseless for a few seconds: starting compressions then is right
      id: 'cpr-with-pulse', actions: ['cpr'], when: (s) => s.pulse && !inRun(s), points: 10, severity: 'major',
      text: 'Chest compressions on a patient with a pulse. Between her spells she is awake with a pulse: check for one (no more than 10 seconds) before starting CPR. During a spell, when she is unresponsive without a pulse, compressions are right — and she pushes your hands away as it stops.',
    },
    // A drug that sets off the run that does not stop has caused her cardiac arrest. The arrest then adds its own items
    // (the shock, CPR, the 12-lead after ROSC) to what can be earned, so these cost as much as the library's other mistakes
    // that cause VF (a shock with a pulse, diltiazem for VT): a learner who caused the arrest and then ran it well is never
    // graded Excellent. Each is judged with a pulse; given in the arrest, the drug has set off nothing, and says so
    {
      id: 'ondansetron-long-qt', actions: ['ondansetron'], when: (s) => s.pulse, points: 15, severity: 'critical',
      text: 'Ondansetron for her nausea. She already took it this morning, and with a long QT it lengthens the QT further: it set off the run that did not stop. No QT-prolonging drug for her — leave the nausea to a basin and reassurance for now.',
    },
    {
      // the built-in long-QT rule is replaced by the one above whatever the pulse: in the arrest it is this one
      id: 'ondansetron-in-arrest', actions: ['ondansetron'], when: (s) => !s.pulse, points: 3, severity: 'minor',
      text: 'Ondansetron in cardiac arrest. It treats nausea and has no place in an arrest — and it lengthens her QT further, for after ROSC.',
    },
    {
      // one rule for both doses, in this case's words: the 300 mg push with a pulse is the same mistake made worse
      id: 'amiodarone-long-qt', actions: ['amio-infusion', 'amio-arrest'], when: (s) => s.pulse, points: 15, severity: 'critical', replaces: ['arrest-amio-with-pulse', ...RATE_RULES],
      text: 'Amiodarone for torsades. It lengthens the QT further and slows the heart, and here it set off the run that did not stop. Sustained torsades gets a shock; the runs get magnesium — amiodarone and procainamide are the wrong drugs (and a 300 mg push is only for VF or pulseless VT that shocks have not fixed).',
    },
    {
      id: 'amiodarone-arrest-long-qt', actions: ['amio-infusion', 'amio-arrest'], when: (s) => !s.pulse, replaces: RATE_RULES, points: 5, severity: 'major',
      text: 'Amiodarone in her torsades arrest. The shock and CPR end it, and magnesium is the drug for torsades; amiodarone lengthens her QT further, so the runs are more likely to come back once the pulse returns.',
    },
    {
      // the same id as the built-in rule, with what it did here (in the arrest the built-in rule for procainamide in an arrest says enough)
      id: 'procainamide-long-qt', actions: ['procainamide'], when: (s) => s.pulse, points: 15, severity: 'critical',
      text: 'Procainamide with a long QT. It lengthens the QT further, and here it set off the run that did not stop. The runs get magnesium; a run that does not stop gets a shock.',
    },
    {
      id: 'adenosine-long-qt', actions: ['adenosine6', 'adenosine12'], when: (s) => s.pulse, replaces: RATE_RULES, points: 15, severity: 'critical',
      text: 'Adenosine with a long QT. There is no regular narrow-complex tachycardia for it to treat (and it is never for a polymorphic VT), and the pause it causes is exactly what sets off torsades: it set off the run that did not stop.',
    },
    {
      id: 'beta-blocker-long-qt', actions: ['metoprolol'], when: (s) => s.pulse, replaces: RATE_RULES, points: 15, severity: 'critical',
      text: 'A beta-blocker that slows her heart. In acquired long QT, torsades starts after slow beats and pauses: the slower rate set off the run that did not stop. She needs magnesium, and if the runs keep coming a faster rate — not a slower one.',
    },
    {
      // during a run the built-in diltiazem-for-VT rule says it in its own words
      id: 'diltiazem-long-qt', actions: ['diltiazem'], when: (s) => s.pulse && s.rhythm.profile !== 'torsades', replaces: RATE_RULES, points: 15, severity: 'critical',
      text: 'Diltiazem with a long QT. It slows her heart and drops her pressure, and in acquired long QT the pauses after slow beats set off torsades: it treats nothing she has, and it set off the run that did not stop.',
    },
    {
      // the same id as the built-in rule, in what happened here: no tachycardia, and the shock landed on her long T wave
      id: 'shock-with-pulse', actions: ['defib'], when: (s) => s.pulse && s.rhythm.profile !== 'torsades', points: 15, severity: 'critical',
      text: 'An unsynchronized shock between her spells, with her own rhythm and a pulse. It landed on her long T wave and set off VF. A run of torsades that does not stop is defibrillated, pulse or not; between the runs she needs the pads on, magnesium and watching — not a shock.',
    },
    {
      id: 'delay-shock', actions: ['magnesium-sulfate', 'epinephrine', 'lidocaine', 'iv', 'io', 'airway'],
      when: (s) => !s.pulse && (s.rhythm.profile === 'torsades' || s.rhythm.profile === 'vf') && has(s, 'pads') && !shockedThisArrest(s), points: 5, severity: 'major',
      text: 'Something else before the shock, with the pads already on. Pulseless torsades — or the VF it turns into — needs a shock first: magnesium, IV access, drugs and the airway come after it, during CPR.',
    },
    {
      // the same id as the built-in rule: here the question is whether the runs are still coming, not the rate
      id: 'pace-not-slow', actions: ['pace'], when: (s) => s.pulse && protectedFrom(s), points: 5, severity: 'minor',
      text: 'Pacing with nothing left for it to do. Her rate is not too slow, and the magnesium has already stopped the runs: overdrive pacing (about 90 a minute, to abolish the pauses) is for runs that keep coming despite magnesium — painful through the skin, and on medical direction in the field.',
    },
    {
      // the other half of the same lesson: while the runs still come, magnesium comes first (the 2025 AHA guideline sends
      // overdrive pacing to expert consultation; the 2010 AHA/ACCF statement makes magnesium the first-line drug)
      id: 'pace-before-magnesium', actions: ['pace'], when: (s) => s.pulse && !protectedFrom(s), points: 3, severity: 'minor',
      text: 'Overdrive pacing before magnesium. Magnesium sulfate 2 g IV is the first drug for recurring torsades and works within minutes; overdrive pacing (about 90 a minute, to abolish the pauses) is for runs that keep coming despite it — painful through the skin, and on medical direction in the field (the 2025 AHA guideline sends overdrive pacing and isoproterenol to expert consultation).',
    },
    {
      id: 'pace-no-analgesia', actions: ['pace'], when: (s) => s.pulse && !inRun(s) && s.vitals.gcs >= 13 && !comfortable(s), points: 3, severity: 'minor',
      text: 'Transcutaneous pacing of an awake patient with no analgesia or sedation. Every paced beat jolts her chest muscles: fentanyl or a small dose of midazolam first, as her pressure allows.',
    },
    {
      id: 'pressor-not-low', actions: ['push-epi', 'pressor'], when: (s) => s.pulse && s.vitals.sbp >= 90, points: 3, severity: 'minor',
      text: 'A pressor or push-dose epinephrine with a systolic pressure of 90 or more. Her pressure needs no raising, and a surge of catecholamine in a long QT can set off a run.',
    },
    {
      id: 'epi-im-no-anaphylaxis', actions: ['epi-im'], points: 5, severity: 'major',
      text: 'IM epinephrine without anaphylaxis. Nothing she has calls for it, and a surge of adrenaline in a long QT can set off torsades.',
    },
    {
      id: 'nitro-no-pain', actions: ['nitro', 'nitro-high'], when: (s) => s.pulse && s.vitals.pain === 0, points: 3, severity: 'minor', replaces: ['nitro-high-not-hypertensive'],
      text: 'Nitroglycerin with no chest pain. It treats ischemic chest pain; she has none, and it only lowers her pressure.',
    },
  ],
  timings: [
    { label: 'Pads on', actions: PADS, target: 3 },
    // the EMT's medics give it: the flag counts theirs
    { label: 'Magnesium', actions: ['magnesium-sulfate'], flag: 'magnesium' },
    { label: 'First shock once pulseless', actions: ['defib', 'aed'], from: 'arrest', target: 2 },
    { label: 'CPR after the shock', actions: ['cpr'], from: 'converted', target: 1 },
    { label: 'ROSC', actions: [], flag: 'rosc' },
  ],
  transportMinutes: 12,
  nearestMinutes: 6,
  arrival: 'You arrive; the emergency physician meets you with magnesium and potassium drawn up and a pacer ready.',
  teaching: [
    'Torsades de pointes is a polymorphic VT whose QRS twists around the baseline, on a long QT (a QTc over 500 ms is the danger zone). It usually starts after a pause — a PVC, a pause, then a PVC on the T wave (short-long-short) — and its runs often stop by themselves: each one a faint, sometimes with a few jerks that look like a seizure.',
    'Acquired long QT adds up: QT-prolonging drugs (macrolide and fluoroquinolone antibiotics, ondansetron, droperidol, haloperidol, methadone, sotalol, procainamide…), low potassium or magnesium (diuretics, vomiting, diarrhea), a slow heart rate, female sex, older age and heart disease. Two QT drugs on a diuretic is a classic set-up.',
    'Pads on at once: she can lose her pulse at any moment. An EMT puts the AED pads on a conscious high-risk patient but lets it analyze only once she is unresponsive, not breathing normally and pulseless.',
    'Sustained polymorphic VT is defibrillated at once, unsynchronized — with or without a pulse (2025 AHA). Synchronized cardioversion cannot lock onto the twisting complexes and may never fire. After the shock: CPR straight away for 2 minutes, then check.',
    'Magnesium sulfate 2 g IV for recurring runs, whatever the blood level (2025 AHA: may be considered for recurrent polymorphic VT with a long QT; not routinely for polymorphic VT with a normal QT, nor routinely in cardiac arrest; the 2010 AHA/ACCF statement makes it the first-line drug): diluted over about 5–15 minutes with a pulse, pushed in a pulseless patient; repeat 2 g if the runs come back.',
    'Stop every QT-prolonging drug and give no new one: no ondansetron for the nausea, and no amiodarone or procainamide for the runs — they lengthen the QT further. Adenosine (a pause), beta-blockers and diltiazem (a slower rate) can set off pause-dependent torsades. Bring the bottles.',
    'Runs that keep coming despite magnesium: speed the heart up so there are no pauses — in hospital a temporary transvenous pacer (a rate over 70, often 90–110) or isoproterenol, and potassium replaced to 4.5–5.0 mmol/L (2010 AHA/ACCF statement). The 2025 AHA guideline gives overdrive pacing no graded recommendation and sends it, with isoproterenol, to expert consultation: in the field, transcutaneous overdrive pacing at about 90 is a medical-direction option after magnesium, painful without analgesia.',
    'EMT: the pads, the AED and CPR, and an early ALS call — magnesium and the IV are ALS. After any drug-induced torsades the hospital looks for a congenital long QT (her personal and family history; if it holds unexplained faints or sudden deaths, an ECG for each first-degree relative and genetic testing) and gives her a list of drugs to avoid.',
  ],
};
