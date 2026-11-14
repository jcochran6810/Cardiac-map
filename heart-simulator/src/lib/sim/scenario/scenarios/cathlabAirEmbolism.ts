import type { Effect, Line, PendingRead, Scenario, ScenarioEvent, SimState, Speaker } from '../types';
import { atRate, bpAfter, firstDone, has, line, paced } from '../kit';
import { INTERVENTION_BY_ID } from '../interventions';
import { LAD_VIEWS, MD, RCA_VIEWS, TECH, askCritical, askEvents, askHarm, type LabAsk } from '../labKit';
import { NITRATE_RULES } from '../rules/acs';

/**
 * Coronary air embolism during a staged PCI of the right coronary. The pre-dilation balloon has just come out fast
 * through the guide's valve without a back-bleed, and the check injection sends the air it drew in down the RCA: chest
 * pain, inferior ST elevation, a slow rate and a low pressure. The team has to see it, stop injecting, aspirate the guide
 * and flush the bubbles through, give 100 % oxygen, hold the rate and the pressure up while it clears — and not treat it
 * as spasm (nitroglycerin) or plaque (a stent). Then the planned stent goes in, with the guide back-bled this time.
 */

/**
 * A published run of the same complication in another patient (air in the RCA during an AF ablation). This patient has
 * no image of his own, so it is shown only once the learner has named what happened, and labeled as another patient's.
 */
const EXAMPLE_IMAGE = 'rca-air-embolism';

const airRead: Omit<PendingRead, 'minute'> = {
  kind: 'clinical', answer: 'clin-air', prompt: 'What just happened?',
  explain: 'Coronary air embolism. Air was drawn into the guide as the balloon came out fast through the valve, and the check injection pushed it down the right coronary: the round, sharp-edged clear spots that hang in the contrast are bubbles, and beyond them nothing flows — hence the chest pain, the inferior ST elevation, the slow rate and the low pressure. Stop injecting, give 100 % oxygen, aspirate back through the guide until the blood comes back free of bubbles, then flush hard with bubble-free saline to break up what is left; atropine for the rate and a pressor for the pressure while it clears. Not nitroglycerin, and not a stent.',
};

const FINAL_LINE = 'Final runs of the right coronary in two views: the stent well expanded, TIMI 3 flow to the crux, no clear spots, no dissection at its edges.';

/** The planned lesion as intravascular imaging sees it (the default IVUS and OCT lines would say there is no plaque) */
const LESION = 'At the pre-dilated mid segment a fibrous plaque: minimal lumen area 2.6 mm², reference lumen 3.0 mm proximally and 2.9 mm distally, 16 mm long — a 3.0 × 18 mm stent fits.';

/**
 * What holds the pressure up while the bubbles clear: intracoronary epinephrine once the guide is clear, an IV pressor,
 * fluid — or a balloon pump, the mechanical support the teaching names for a shock that persists
 */
const SUPPORT = ['ic-epinephrine', 'phenylephrine', 'push-epi', 'pressor', 'fluid', 'iabp'];
/** What brings a slow rate up: atropine, or a pacer if it does not hold */
const RATE = ['atropine', 'pace', 'temp-wire'];
/** Every cine run injects contrast down the guide that sits in the right coronary */
const RUNS = ['view-rao-caudal', ...LAD_VIEWS, 'view-lao-caudal', ...RCA_VIEWS, 'angio'];
/** …and so does an OCT run, whose contrast flush goes down the same guide */
const INJECTIONS = [...RUNS, 'oct'];

/** Air went down the right coronary (the event) */
const hit = (s: SimState) => has(s, 'air');
/** The bubbles still sit in the guide and the artery: nothing has been aspirated yet */
const blocked = (s: SimState) => hit(s) && !has(s, 'air-cleared');
/** From the air going in until the flow, the rate and the pressure are back */
const unwell = (s: SimState) => hit(s) && !has(s, 'recovered');
/** The learner has named what happened (the read opens the case; nothing else can be done until it is given) */
const readGiven = (s: SimState) => s.reads.some((r) => r.answer === 'clin-air');

/** Who injects and describes a run: the learner as the cardiologist, otherwise the operator */
const runner = (s: SimState): Speaker => (s.role === 5 ? 'you' : 'operator');

/** Only a patient awake enough to talk says how he feels */
const awake = (s: SimState, text: string): Line[] => (s.pulse && s.vitals.gcs >= 13 ? [['patient', `"${text}"`]] : []);

/** The earliest of several minutes (null if none) */
const earliest = (...mins: (number | null | undefined)[]) => {
  const got = mins.filter((m): m is number => typeof m === 'number');
  return got.length ? Math.min(...got) : null;
};

/**
 * When the learner started the action that set a flag (the engine counts an action from its start; the flag is set when
 * it is done), or null when the flag came from someone else — a teammate's fallback earns the learner nothing.
 */
function learnerStarted(s: SimState, flag: string, ids: string[]): number | null {
  const at = s.flags[flag];
  if (at === undefined) return null;
  const done = s.performed.find((p) => ids.includes(p.id) && Math.abs(p.minute + INTERVENTION_BY_ID[p.id].minutes - at) < 0.05);
  return done ? done.minute : null;
}

/**
 * When the remaining bubbles have gone: the flush breaks them up and pushes them on, and the last small ones in the far
 * branches shrink as their nitrogen diffuses out — within a minute on 100 % oxygen, which washes the nitrogen out of the
 * blood, within three on room air.
 */
function recoveryDue(s: SimState): number | null {
  const cleared = s.flags['air-cleared'];
  if (cleared === undefined) return null;
  const o2 = s.flags['o2-100'];
  return o2 === undefined ? cleared + 3 : Math.min(cleared + 3, Math.max(cleared, o2) + 1);
}

/**
 * The minute the flow, the rate and the pressure came back. The 'recovered' flag is set when the action running at that
 * moment ends — a 2-minute reassessment, a 6-minute balloon pump — so it can lag the recovery itself: count from when it
 * was due (never before the shock that last brought a pulse back). Otherwise a learner who cleared the air at once and then
 * watched the monitor would lose the support items to the length of the reassessment.
 */
function recoveredAt(s: SimState): number | null {
  const at = s.flags.recovered;
  if (at === undefined) return null;
  const due = recoveryDue(s) ?? at;
  const rosc = has(s, 'arrest') ? s.timers.lastShockAt ?? at : -Infinity;
  return Math.min(at, Math.max(due, rosc));
}

/**
 * The minute the flow, the rate and the pressure came back, if that was within `minutes` of the air: a learner who
 * cleared it that fast has not neglected the rate or the pressure, so the support items count as done then
 */
function recoveredWithin(s: SimState, minutes: number): number | null {
  const at = recoveredAt(s);
  const from = s.flags.air;
  if (at === null || from === undefined) return null;
  return Math.round((at - from) * 10) / 10 <= minutes ? at : null;
}

/** Aspirate the guide, then a forceful flush of bubble-free saline: the bubbles are broken up and pushed through */
function clearAir(s: SimState, who: Speaker): Effect {
  return {
    say: [
      [who, 'Aspirating back through the guide: froth and bubbles fill the syringe, then dark blood, free of them. Then a forceful 10 mL flush of bubble-free saline down the right coronary.'],
      s.pulse
        ? [who, 'A small puff from the clean syringe: the right coronary fills to the crux again; a few tiny bubbles wash out of its far branches.', 'good']
        : [who, 'Flushed — with no heartbeat there is no flow to see yet.'],
    ],
    // the flow is back, so the pain starts to ease; the rate and the pressure follow as the last bubbles clear
    ...(s.pulse ? { vitals: { pain: Math.min(s.vitals.pain, 5) } } : {}),
    flags: ['air-cleared'],
  };
}

/** Atropine 1 mg for the slow rate: the sinus node, starved and vagally slowed, speeds up; the pressure follows a little */
function atropine(s: SimState, who: Speaker): Effect {
  const bp = bpAfter(s, 10, 6);
  return {
    say: [[who, 'Atropine 1 mg IV, flushed.'], ['monitor', `Heart rate 68. BP ${bp.sbp}/${bp.dbp}.`]],
    rhythm: atRate(s, 68), vitals: bp, flags: ['atropine', 'rate-up'],
  };
}

/** A phenylephrine bolus: the pressure rises and the baroreflex slows the rate — with a rate under 50, too far */
function phenylephrine(s: SimState, who: Speaker): Effect {
  const bp = bpAfter(s, 16, 10);
  const slow = s.rhythm.hr < 50 && !paced(s);
  const hr = paced(s) ? s.rhythm.hr : slow ? Math.max(36, s.rhythm.hr - 4) : Math.min(s.rhythm.hr, Math.max(50, s.rhythm.hr - 6));
  return {
    say: [[who, 'Phenylephrine 100 mcg IV, flushed.'], slow ? ['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`, 'bad'] : ['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`]],
    vitals: bp, ...(paced(s) ? {} : { rhythm: atRate(s, hr) }),
    // a bolus that drags a rate under 50 lower does not count as holding the circulation up
    flags: slow ? ['phenylephrine'] : ['phenylephrine', 'supported'],
  };
}

/** An intracoronary drug handed up by the nurse, or given by the learner as the cardiologist */
function given(s: SimState, drug: string): Line[] {
  if (s.role === 5) return [['you', `${drug} down the right coronary.`]];
  return [['you', `${drug} drawn up, labeled and handed to the operator — dose read back.`], ['operator', 'Injecting down the right coronary.']];
}

/**
 * Nothing goes down the guide until the air in it has been aspirated: an intracoronary drug would push it into the artery.
 * In the event the tech keeps to the manifold and the syringes; the drugs are the nurse's.
 */
function icGate(s: SimState): Effect | null {
  if (!unwell(s) || !s.pulse) return null;
  if (s.role === 3) return { blocked: true, say: [['operator', 'Not now — the nurse has the drugs. Keep your eyes on the manifold.']] };
  if (!blocked(s)) return null;
  return s.role === 5
    ? { blocked: true, say: [['system', 'Aspirate the guide first: the air is still in it, and anything injected down it now goes into the artery.']] }
    : { blocked: true, say: [['operator', 'Hold it — nothing goes down that guide until I have aspirated it.']] };
}

/** A vasodilator into the coronary while the pressure is low: it falls further, and the flow beyond is no better */
function vasodilator(s: SimState, drug: string, dSbp: number, dDbp: number, own: Line[] = []): Effect | null {
  const gate = icGate(s);
  if (gate) return gate;
  if (!unwell(s) || !s.pulse) return null;
  const bp = bpAfter(s, dSbp, dDbp);
  return { say: [...given(s, drug), ...own, ['monitor', `BP ${bp.sbp}/${bp.dbp}.`, s.vitals.sbp < 90 ? 'bad' : 'info']], vitals: bp };
}

/** The tech asks for an injection before the guide is aspirated: the operator will not inject */
const holdInjection: Effect = { blocked: true, say: [['operator', 'Hold it — nobody injects until that guide is aspirated.']] };

/** Contrast pushed down the guide before it is aspirated (the cardiologist's own injection): more air goes down the artery */
function throughAir(s: SimState, recorded: string): Effect {
  const hr = paced(s) ? s.rhythm.hr : Math.max(32, s.rhythm.hr - 6);
  const bp = bpAfter(s, -8, -5);
  return {
    say: [
      ['monitor', recorded],
      ['you', 'More clear spots stream down the right coronary with the contrast; beyond them it still does not fill.', 'bad'],
      ['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`, 'bad'],
    ],
    ...(paced(s) ? {} : { rhythm: atRate(s, hr) }), vitals: { ...bp, pain: Math.min(10, s.vitals.pain + 1) }, flags: ['more-air'],
  };
}

/**
 * A cine run. Before the guide is aspirated each injection pushes more air down the artery; once it is clear the runs show
 * the artery filling again. The tech sets up the view, but the operator will not inject until the guide is clear.
 */
function run(s: SimState, id: string, label: string): Effect | null {
  if (!hit(s)) return null;
  if (!s.pulse) return { blocked: true, say: [['system', 'Not during the arrest: treat the rhythm first.']] };
  if (s.role === 3) return blocked(s) ? holdInjection : null;
  if (s.role !== 5) return null;
  if (blocked(s)) {
    const e = throughAir(s, `Cine recorded: ${label}.`);
    return { ...e, image: { id, view: label }, flags: ['cine', id, ...(e.flags ?? [])] };
  }
  const what = !has(s, 'recovered')
    ? 'the right coronary fills to the crux again; a few tiny bubbles still wash out of its far branches.'
    : has(s, 'pci') ? 'the stent well expanded, TIMI 3 flow to the crux.' : 'the right coronary fills briskly to the crux, no clear spots left; the pre-dilated lesion is ready for its stent.';
  return { say: [['monitor', `Cine recorded: ${label}.`], ['you', `${what.charAt(0).toUpperCase()}${what.slice(1)}`]], image: { id, view: label }, flags: ['cine', id] };
}

/**
 * Nitroglycerin by mouth or spray during the event: the blockage is gas, not spasm, so the pain does not ease (the default
 * would ease it) — only the pressure falls
 */
function nitroNoHelp(s: SimState, dSbp: number, dDbp: number, flags: string[]): Effect | null {
  if (!s.pulse || !unwell(s)) return null;
  const bp = bpAfter(s, dSbp, dDbp);
  return { say: [...awake(s, 'It\'s no better… and now I feel faint.'), ['monitor', `BP ${bp.sbp}/${bp.dbp}.`, 'bad']], vitals: bp, flags };
}

/** An IV drug that slows the sinus or AV node while the right coronary is blocked: the rate and the pressure fall */
function slower(s: SimState, said: string, flags: string[]): Effect | null {
  if (!s.pulse || !unwell(s)) return null;
  const bp = bpAfter(s, -12, -8);
  const hr = paced(s) ? s.rhythm.hr : Math.min(s.rhythm.hr, Math.max(36, s.rhythm.hr - 6));
  return {
    say: [['you', said], ['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`, 'bad']],
    vitals: bp, ...(paced(s) ? {} : { rhythm: atRate(s, hr) }), flags,
  };
}

/** VF: one shock brings an organized rhythm back — to whatever the artery is doing (still blocked, or cleared) */
function shockOutcome(s: SimState, aed = false): Effect | null {
  if (s.pulse || s.rhythm.profile !== 'vf') return null;
  const stillBlocked = blocked(s);
  const bp = stillBlocked ? { sbp: 74, dbp: 44 } : { sbp: 86, dbp: 52 };
  return {
    say: [['monitor', aed ? 'AED: "Shock advised." Shock delivered.' : 'Shock delivered: 200 J.'], [runner(s), `An organized rhythm is back: ${bp.sbp}/${bp.dbp} on the arterial line.`, 'warn']],
    rhythm: { profile: 'inferior-stemi', hr: stillBlocked ? 48 : 64 }, pulse: true, vitals: { ...bp, gcs: stillBlocked ? 12 : 13, pain: 7 },
    flags: ['pads', 'monitor', 'shocked'],
  };
}

const TECH_ASKS: LabAsk[] = [
  {
    // a tech who gets the syringes up before the operator can ask has done exactly the right thing (the ask only comes
    // after the learner's first action, so without this the quickest tech went unrewarded and the patient got worse)
    id: 'syringe', when: (s) => readGiven(s) && blocked(s), early: true, wait: 2, within: 1, points: 10,
    ask: 'Clean syringe on the manifold, tip down, and bubble-free saline for the flush — I\'m going to aspirate the guide.',
    accept: ['clear-air'],
    thanks: 'Thanks. Aspirating…', fallback: 'I\'ll draw up my own syringe.', gives: 'syringe-ready',
    label: 'A bubble-free aspiration and flush set-up, at once',
    why: 'The operator aspirates back through the guide until the blood comes back free of bubbles, then flushes hard with saline drawn up free of air. Hold every syringe tip down so a bubble rises to the plunger, not into the patient.',
  },
  {
    id: 'deair', when: (s) => has(s, 'recovered'), wait: 3, points: 10,
    ask: 'Flow\'s back. Before anything else goes down that guide: back-bleed it and clear the manifold of every bubble, please.',
    accept: ['clear-air'],
    thanks: 'Thanks — the line is clean.', fallback: 'I\'ll back-bleed it myself.', gives: 'line-checked',
    label: 'Back-bleed the guide and clear the manifold before the next injection',
    why: 'The air came in as the balloon was pulled out fast through the valve. Back-bleed the guide after every device comes out, and check the manifold and the syringe for bubbles before every injection: this is how it is prevented.',
  },
  {
    id: 'stent', when: (s) => has(s, 'line-checked'),
    ask: 'He\'s stable. Drug-eluting stent, 3.0 by 18, please.',
    accept: ['stent-des'], wrong: ['stent-covered', 'balloon-nc'],
    wrongSay: 'No — a drug-eluting stent, 3.0 by 18.',
    thanks: '3.0 by 18 — confirmed. Deploying; I\'ll bring the balloon out slowly and back-bleed the guide after it.', fallback: 'I\'ll open the stent myself.', gives: 'stent-in-hand',
    label: 'Drug-eluting stent, as ordered',
    why: 'Say the size back to the operator and check it on the box before you open it.',
  },
];

/** The operator's orders to the nurse: what the dialog asks for (the nurse's critical items are scored on their own) */
const RN_ASKS: LabAsk[] = [
  {
    id: 'rn-o2', role: 4, when: (s) => readGiven(s) && unwell(s) && !has(s, 'o2-100'), early: true, wait: 2,
    ask: '100 % oxygen — a non-rebreather at 15 liters, now, please.',
    accept: ['o2-nrb'],
    thanks: 'Thanks.', fallback: 'Someone get a non-rebreather on him — 100 %!', gives: 'o2-given',
    fallbackEffect: (s) => (s.pulse ? { say: [['team', 'Tech: non-rebreather on at 15 liters.']], vitals: { spo2: 100 }, flags: ['o2', 'o2-100'] } : {}),
    label: '100 % oxygen, as ordered', why: 'Pure oxygen washes the nitrogen out of the blood, so the bubbles shrink faster.',
  },
  {
    // the slowing drugs get the operator's word here and their own penalty below (av-blocker-slow, beta-blocker). The pads
    // answer it too: a nurse who paces has treated the rate, and the operator must not then announce atropine that never comes
    id: 'rn-atropine', role: 4, when: (s) => readGiven(s) && unwell(s) && s.pulse && s.rhythm.hr < 60 && !has(s, 'rate-up') && !paced(s), early: true, wait: 2,
    ask: 'His rate is down in the forties — something for the rate, please!',
    accept: ['atropine', 'pace'], wrong: ['adenosine6', 'adenosine12', 'diltiazem', 'metoprolol', 'amio-infusion'],
    wrongSay: 'No! That slows him down further. Atropine, 1 milligram.',
    thanks: 'Thanks — rate\'s coming up.', fallback: 'I\'ll push the atropine myself.', gives: 'atropine-given',
    fallbackEffect: (s) => (s.pulse && unwell(s) && s.rhythm.hr < 60 && !paced(s) ? atropine(s, 'operator') : {}),
    label: 'Atropine, as ordered', why: 'Atropine 1 mg IV for a symptomatic rate in the forties; pacing if it does not hold.',
  },
  {
    // nitroglycerin and the vasodilators each carry their own penalty with this pressure: the operator's word only here
    id: 'rn-pressure', role: 4, when: (s) => readGiven(s) && unwell(s) && s.pulse && (has(s, 'rate-up') || paced(s)) && !has(s, 'supported'), wait: 2,
    ask: 'Rate\'s better, but the pressure is still low — bring it up for me, please.',
    accept: SUPPORT, wrong: ['nitro', 'nitro-high', 'ic-nitro', 'ic-adenosine', 'ic-verapamil', 'ic-nitroprusside'],
    wrongSay: 'Not that — that drops his pressure. Something that raises it: phenylephrine, push-dose epinephrine.',
    thanks: 'Thanks — that\'s better.', fallback: 'I\'ll push the phenylephrine myself.', gives: 'pressure-held',
    fallbackEffect: (s) => (s.pulse && unwell(s) ? phenylephrine(s, 'operator') : {}),
    label: 'Pressure support, as ordered', why: 'The aortic pressure pushes the blood, and the bubbles, through: hold it up while the air clears.',
  },
];

export const cathlabAirEmbolism: Scenario = {
  id: 'air-embolism-cathlab',
  title: 'Staged PCI: the check run goes wrong',
  summary: '61-year-old man, elective stenting of the right coronary. A check injection after the balloon brings sudden chest pain, a slow rate and a falling pressure. Name it, clear it and support him — then finish the case safely.',
  setting: 'cathlab',
  roles: [3, 4, 5],
  difficulty: 'advanced',
  briefing: {
    default: [
      ['team', 'Staged elective PCI from the right radial: 61-year-old man with exertional angina and a severe mid right coronary stenosis on his angiogram two weeks ago. Aspirin and clopidogrel on board; heparin 100 units/kg (ACT 286 s).'],
      ['team', 'A 6 French JR4 guide sits in the right coronary, a workhorse wire is across the lesion, and a 2.5 mm balloon has just pre-dilated it. The balloon came out quickly through the valve; next is a check run, then the stent.'],
      ['scene', 'He is awake and comfortable, with no pain.'],
    ],
    3: [
      ['team', 'Staged elective PCI from the right radial: 61-year-old man with exertional angina and a severe mid right coronary stenosis on his angiogram two weeks ago. Aspirin and clopidogrel on board; heparin 100 units/kg (ACT 286 s).'],
      ['team', 'A 6 French JR4 guide sits in the right coronary, a workhorse wire is across the lesion, and a 2.5 mm balloon has just pre-dilated it. The balloon came out quickly through the valve; next is a check run, then the stent.'],
      ['scene', 'He is awake and comfortable, with no pain.'],
      ['team', 'You are the scrub tech at the table: the manifold and the syringes, the devices the cardiologist asks for — and calling out what you see. The nurse is at his side.'],
    ],
    4: [
      ['team', 'Staged elective PCI from the right radial: 61-year-old man with exertional angina and a severe mid right coronary stenosis on his angiogram two weeks ago. Aspirin and clopidogrel on board; heparin 100 units/kg (ACT 286 s).'],
      ['team', 'A 6 French JR4 guide sits in the right coronary, a workhorse wire is across the lesion, and a 2.5 mm balloon has just pre-dilated it. The balloon came out quickly through the valve; next is a check run, then the stent.'],
      ['scene', 'He is awake and comfortable, with no pain.'],
      ['team', 'You are the procedural nurse: his oxygen, the drugs the cardiologist orders, his rhythm, pressure and comfort. The tech is scrubbed at the table.'],
    ],
    5: [
      ['team', 'Staged elective PCI from the right radial: 61-year-old man with exertional angina and a severe mid right coronary stenosis on his angiogram two weeks ago. Aspirin and clopidogrel on board; heparin 100 units/kg (ACT 286 s).'],
      ['team', 'A 6 French JR4 guide sits in the right coronary, a workhorse wire is across the lesion, and a 2.5 mm balloon has just pre-dilated it. The balloon came out quickly through the valve; next is your check run, then the stent.'],
      ['scene', 'He is awake and comfortable, with no pain.'],
      ['team', 'You are the interventional cardiologist: every choice is yours. The tech and the nurse are with you.'],
    ],
  },
  initial: {
    rhythm: { profile: 'normal-sinus', hr: 72 },
    vitals: { sbp: 132, dbp: 78, spo2: 97, rr: 16, etco2: 35, pain: 0, gcs: 15, glucose: 118, temp: 36.6 },
  },
  facts: {
    allergies: 'No allergies. Yes — go ahead and fix it.',
    sample: 'No allergies. Aspirin, clopidogrel, atorvastatin, lisinopril. High blood pressure and high cholesterol; quit smoking five years ago.',
    opqrst: (s) => (unwell(s)
      ? 'Crushing, right in the middle of my chest — it came on the second you injected. 8 out of 10. I feel sick.'
      : has(s, 'recovered') ? 'It\'s gone now — just a bit sore.' : 'Nothing now. I get a tightness walking uphill.'),
    labs: 'Pre-procedure: hemoglobin 14.1, creatinine 0.9, potassium 4.2, platelets 228, INR 1.0.',
    lungs: 'Clear and equal on both sides.',
    perfusion: (s) => (unwell(s) && s.pulse ? 'Pale and sweaty, cool hands; the left radial pulse slow and weak (the right arm has the sheath).' : 'Warm and dry.'),
    neuro: (s) => (s.vitals.gcs >= 14 ? 'Alert and oriented; no facial droop, speech normal, moves all four limbs.' : 'Drowsy but rousable; moves all four limbs; no facial droop.'),
    ecg12: (s) => {
      const hr = s.rhythm.hr;
      if (s.rhythm.profile === 'inferior-stemi') return `Sinus rhythm ${hr}: ST elevation in II, III and aVF with reciprocal depression in I and aVL — the inferior wall, the right coronary's territory, is ischemic.`;
      if (s.rhythm.profile === 'tcp') return 'Transcutaneous pacing at 70: a wide QRS after every pacing spike. The paced beats hide the inferior ST segments.';
      if (s.rhythm.profile === 'paced') return `Ventricular pacing at ${hr} from the temporary wire: a small spike before every wide QRS. The paced beats hide the inferior ST segments.`;
      return `Sinus rhythm ${hr}: the inferior ST segments are back at baseline — the right coronary is perfusing the inferior wall again.`;
    },
    echo: (s) => (unwell(s)
      ? 'The inferior wall and the base of the right ventricle have stopped moving; LVEF about 45 %. No pericardial effusion.'
      : 'Normal LV and RV function, LVEF about 60 %; no wall-motion abnormality; no pericardial effusion.'),
    lvedp: (s) => (unwell(s) ? `LV ${s.vitals.sbp}/24 mmHg: LVEDP 24 mmHg.` : `LV ${s.vitals.sbp}/12 mmHg: LVEDP 12 mmHg.`),
    // the defaults would show a normal ventricle, no right ventricular ST elevation and no plaque — not this patient
    lvgram: (s) => (unwell(s) ? 'LV gram: the inferior wall does not move; EF about 45 %; no mitral regurgitation.' : 'LV gram: normal wall motion, EF about 60 %, no mitral regurgitation.'),
    ecgRight: (s) => (unwell(s) && s.pulse ? 'V4R: 1 mm of ST elevation.' : 'V4R: no ST elevation.'),
    ivus: (s) => (has(s, 'pci') ? 'IVUS: the stent well expanded and fully apposed; no dissection at its edges.' : `IVUS: ${LESION}`),
    ffr: (s) => (unwell(s)
      ? 'The distal pressure is low and damped: with no flow beyond the mid right coronary there is nothing to measure — this is not the moment for physiology.'
      : has(s, 'pci') ? 'FFR 0.93 across the stent at maximal hyperemia.' : 'FFR 0.71 across the pre-dilated mid right coronary lesion at maximal hyperemia: it still needs its stent.'),
    final: FINAL_LINE,
  },
  status: (s) => {
    if (!s.pulse) return 'Unresponsive.';
    if (has(s, 'recovered')) return '"The pain\'s gone. Is everything all right?"';
    if (s.vitals.gcs < 14) return 'Gray and clammy; he answers in a mumble.';
    if (has(s, 'air-cleared')) return '"It\'s easing a little… still tight, and I feel dizzy."';
    if (hit(s)) return '"It\'s crushing… I feel sick and dizzy."';
    return '"Fine — no pain."';
  },
  respond: {
    'stop-contrast': (s) => {
      if (!hit(s)) return null;
      const text = s.role === 3
        ? 'Hands off the manifold, injector disarmed: nothing goes down that guide until it is clear.'
        : s.role === 5 ? 'Stop! Nobody injects — injector off, manifold closed.' : 'Injector off — nobody injects.';
      return { say: [['you', text]], flags: ['contrast-stopped'] };
    },
    callout: (s) => {
      if (!unwell(s) || !s.pulse || has(s, 'event-called')) return null;
      return { say: [['you', `Rate ${s.rhythm.hr}, pressure ${s.vitals.sbp}!`], ['operator', 'I see it — thanks. Keep calling them.']], flags: ['callout', 'event-called'] };
    },
    'clear-air': (s) => {
      if (s.role === 3) {
        if (has(s, 'recovered')) return { say: [['you', 'Guide back-bled until the blood ran dark and free of bubbles; the manifold flushed through every port, the syringe checked tip down and wiped — the line is clean.']], flags: ['clear-air-ready'] };
        // the syringes are already up (the tech's, or the operator's own): another set only takes the tech's eyes off the
        // manifold — and would use up the presses left for the back-bleed once he has recovered
        if (has(s, 'clear-air-ready') || has(s, 'syringe-ready')) return { blocked: true, say: [['operator', 'I have the syringes, thanks. Keep the manifold closed and your eyes on the monitor.']] };
        return { say: [['you', 'Aspiration syringe on the manifold, tip down; a 10 mL syringe of saline drawn up free of bubbles for the forceful flush — handed up.']], flags: ['clear-air-ready'] };
      }
      if (!blocked(s)) return { say: [['you', 'Aspirated again: dark blood, no bubbles; flushed. The guide is clean.']], flags: ['back-bled'] };
      return clearAir(s, 'you');
    },
    // an aspiration catheter down to the bubbles pulls the air out of the artery itself (the guide is back-bled behind it)
    aspiration: (s) => {
      if (s.role !== 5 || !has(s, 'wired')) return null;
      if (!blocked(s)) return { say: [['you', 'Aspiration run: only blood comes back — there is nothing left to pull out.']], flags: ['aspirated'] };
      return {
        say: [
          ['you', 'Aspiration catheter down the right coronary to the clear spots: froth, then dark blood, fills the syringe; the guide back-bled clean behind it.'],
          s.pulse ? ['you', 'A small puff from the clean syringe: the right coronary fills to the crux again.', 'good'] : ['you', 'With no heartbeat there is no flow to see yet.'],
        ],
        ...(s.pulse ? { vitals: { pain: Math.min(s.vitals.pain, 5) } } : {}),
        flags: ['aspirated', 'air-cleared'],
      };
    },
    'o2-nrb': (s) => (s.pulse ? { say: [['monitor', 'Non-rebreather at 15 L/min. SpO₂ 100%.']], vitals: { spo2: 100 }, flags: ['o2', 'o2-100'] } : null),
    // a cannula gives about a third oxygen: not the nitrogen washout the bubbles need (no penalty, and no credit)
    'o2-nc': (s) => {
      if (!s.pulse || !unwell(s)) return null;
      const spo2 = Math.min(98, s.vitals.spo2 + 1);
      const word: Line = s.role === 4
        ? ['operator', 'A cannula only gets him about a third oxygen — I want 100 %: a non-rebreather.', 'warn']
        : ['team', 'Nurse: "A cannula is only about a third oxygen — do you want the non-rebreather, for the air?"', 'warn'];
      return { say: [['monitor', `Nasal cannula on. SpO₂ ${spo2}%.`], word], vitals: { spo2 }, flags: ['o2'] };
    },
    atropine: (s) => (s.pulse && unwell(s) && s.rhythm.hr < 60 && !paced(s) ? atropine(s, 'you') : null),
    phenylephrine: (s) => (s.pulse && unwell(s) ? phenylephrine(s, 'you') : null),
    'push-epi': (s) => {
      if (!s.pulse || !unwell(s)) return null;
      const bp = bpAfter(s, 16, 10);
      // epinephrine is a beta agonist too: the sinus rate picks up a little with the pressure
      const hr = paced(s) ? s.rhythm.hr : Math.max(s.rhythm.hr, Math.min(100, s.rhythm.hr + 6));
      return {
        say: [['you', 'Push-dose epinephrine 20 mcg IV.'], ['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp} for a few minutes.`]],
        vitals: bp, ...(paced(s) ? {} : { rhythm: atRate(s, hr) }), flags: ['push-epi', 'supported'],
      };
    },
    // the teaching's mechanical support for a shock that persists: it takes six minutes to place, so it is a bridge, not the cure
    iabp: (s) => {
      if (s.role !== 5 || !s.pulse || !unwell(s)) return null;
      const bp = bpAfter(s, 6, 8, { sbp: 140, dbp: 90 });
      return { say: [['you', 'IABP in, tip 2 cm below the left subclavian; 1:1 — the balloon fills in diastole and pushes blood down the coronaries.'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`]], vitals: bp, flags: ['iabp', 'mcs', 'supported'] };
    },
    // sublingual nitroglycerin cannot move gas: no relief, a lower pressure (the default would ease the pain)
    nitro: (s) => nitroNoHelp(s, -10, -6, ['nitro']),
    'nitro-high': (s) => nitroNoHelp(s, -20, -10, ['nitro', 'nitro-high']),
    // the AV-nodal and sinus-node slowing drugs deepen the bradycardia (the defaults leave the rate where it was)
    diltiazem: (s) => slower(s, 'Diltiazem IV.', ['diltiazem']),
    'amio-infusion': (s) => slower(s, 'Amiodarone 150 mg running over 10 minutes.', ['amiodarone']),
    'adenosine-iv-ffr': (s) => {
      if (!s.pulse || !unwell(s)) return null;
      const bp = bpAfter(s, -10, -6);
      return { say: [['you', 'Adenosine 140 mcg/kg/min IV running.'], ['monitor', `Long pauses between the beats; BP ${bp.sbp}/${bp.dbp} — the infusion is stopped.`, 'bad']], vitals: bp, flags: ['hyperemia'] };
    },
    // verapamil and nitroglycerin through the sheath: no spasm to treat, and both drop the pressure; the drugs are the nurse's
    'radial-cocktail': (s) => {
      if (!s.pulse || !unwell(s)) return null;
      if (s.role === 3) return { blocked: true, say: [['operator', 'Not now — the nurse has the drugs. Keep your eyes on the manifold.']] };
      const bp = bpAfter(s, -8, -5);
      return { say: [['you', 'Radial cocktail through the sheath: verapamil 2.5 mg and nitroglycerin 200 mcg, diluted with blood.'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`, 'bad']], vitals: bp, flags: ['cocktail'] };
    },
    // the sheath stays in until the procedure is over: a band now would mean pulling the guide out of the right coronary
    hemostasis: (s) => (has(s, 'final-angio') ? null : { blocked: true, say: [['operator', 'Not yet — the guide is still in the coronary. The band goes on when the sheath comes out, after the final pictures.']] }),
    // a radial case: no femoral sheath to close
    'closure-device': (s) => (has(s, 'femoral') ? null : { blocked: true, say: [['system', 'This case is from the right radial: there is no femoral sheath to close. The radial band goes on at the end.']] }),
    // nothing has leaked: the echo shows no effusion, so there is no hole to seal and nothing to drain
    'balloon-tamponade': () => ({ blocked: true, say: [['system', 'There is no perforation to seal: no contrast has left the artery.']] }),
    pericardiocentesis: (s) => (s.role === 5 ? { blocked: true, say: [['system', 'The echo probe goes on first: no pericardial effusion — there is nothing to drain.']] } : null),
    // OCT clears the artery with a contrast flush down the guide: before the guide is aspirated, that is one more injection of air
    oct: (s) => {
      if (!has(s, 'wired') || !hit(s)) return null;
      if (!s.pulse) return { blocked: true, say: [['system', 'Not during the arrest: treat the rhythm first.']] };
      const by: Speaker = s.role === 3 ? 'operator' : 'monitor';
      if (blocked(s)) return s.role === 3 ? holdInjection : { ...throughAir(s, 'OCT run: the contrast flush goes down the guide.'), flags: ['oct', 'more-air'] };
      if (has(s, 'pci')) return { say: [[by, 'OCT: the stent well expanded and fully apposed; no dissection at its edges, nothing behind the struts.']], flags: ['oct'] };
      return {
        say: [[by, has(s, 'recovered')
          ? `OCT: ${LESION}`
          : `OCT (the flush clears slowly): a few small, bright, round reflections still drift through the far branches. ${LESION}`]],
        flags: ['oct'],
      };
    },
    // norepinephrine to a systolic of about 100: it never brings a higher pressure down
    pressor: (s) => {
      if (!s.pulse || !unwell(s)) return null;
      const sbp = Math.max(s.vitals.sbp, 100);
      const dbp = Math.max(s.vitals.dbp, 60);
      return { say: [['you', 'Norepinephrine running at 0.05 mcg/kg/min.'], ['monitor', `BP ${sbp}/${dbp}.`]], vitals: { sbp, dbp }, flags: ['pressor', 'supported'] };
    },
    // a bolus helps an ischemic, preload-dependent right ventricle while the flow comes back
    fluid: (s) => {
      if (!s.pulse || !unwell(s)) return null;
      const bp = bpAfter(s, 8, 5);
      return { say: [['monitor', `Bolus in. BP ${bp.sbp}/${bp.dbp}.`]], vitals: bp, flags: ['fluid', 'supported'] };
    },
    'ic-epinephrine': (s) => {
      const gate = icGate(s);
      if (gate) return gate;
      if (!s.pulse || !unwell(s)) return null;
      // it washes back into the aorta from the open proximal branches: the pressure and the sinus rate rise for a few minutes
      const bp = bpAfter(s, 16, 8);
      const hr = paced(s) ? s.rhythm.hr : Math.max(s.rhythm.hr, Math.min(110, s.rhythm.hr + 10));
      return {
        say: [...given(s, 'Epinephrine 100 mcg'), ['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`]],
        vitals: bp, ...(paced(s) ? {} : { rhythm: atRate(s, hr) }), flags: ['ic-epinephrine', 'supported'],
      };
    },
    'ic-nitro': (s) => {
      const effect = vasodilator(s, 'Nitroglycerin 200 mcg', -10, -6, [[runner(s), 'Nothing to widen: the flow is no different.', 'bad']]);
      return effect && !effect.blocked ? { ...effect, flags: ['ic-nitro'] } : effect;
    },
    'ic-adenosine': (s) => {
      const effect = vasodilator(s, 'Adenosine 150 mcg', -8, -5, [['monitor', `Heart rate falls to about 30 for a few seconds, then back to ${s.rhythm.hr}.`, 'bad']]);
      return effect && !effect.blocked ? { ...effect, flags: ['ic-adenosine'] } : effect;
    },
    'ic-verapamil': (s) => {
      const effect = vasodilator(s, 'Verapamil 200 mcg', -8, -5);
      return effect && !effect.blocked ? { ...effect, flags: ['ic-verapamil'] } : effect;
    },
    'ic-nitroprusside': (s) => {
      const effect = vasodilator(s, 'Nitroprusside 100 mcg', -12, -8);
      return effect && !effect.blocked ? { ...effect, flags: ['ic-nitroprusside'] } : effect;
    },
    ...Object.fromEntries(RUNS.filter((id) => id !== 'angio').map((id) => [id, (s: SimState) => run(s, id, INTERVENTION_BY_ID[id].label.split(' — ')[0])])),
    angio: (s) => {
      if (s.role === 5 && (!has(s, 'access') || !has(s, 'catheter'))) return null;
      return run(s, 'angio', 'Both coronaries in standard views');
    },
    'balloon-predil': (s) => {
      if (s.role !== 5 || !blocked(s) || !has(s, 'wired')) return null;
      return { say: [['you', 'Balloon up at the lesion and down: the clear spots beyond it shift a little, but the artery still does not fill.']], flags: ['predilated'] };
    },
    'stent-des': (s) => {
      if (s.role === 3) {
        if (!unwell(s)) return null;
        return { say: [['you', 'Drug-eluting stent opened and prepped.'], ['operator', 'Put that away — that is not plaque, it is air. No metal until he has recovered.', 'warn']] };
      }
      if (s.role !== 5 || !has(s, 'wired') || has(s, 'pci')) return null;
      if (blocked(s)) {
        return {
          say: [['you', 'Drug-eluting stent, 3.0 × 18, deployed across the lesion at 14 atmospheres.'], ['you', 'Nothing changes: beyond the stent the artery is still blocked, and the minutes go by.', 'bad']],
          flags: ['stented', 'pci', 'stent-early'],
        };
      }
      if (!has(s, 'recovered')) return { say: [['you', 'Drug-eluting stent, 3.0 × 18, deployed at 14 atmospheres — while he is still slow and low.']], flags: ['stented', 'pci', 'stent-early'] };
      return {
        say: [['you', 'Drug-eluting stent, 3.0 × 18, deployed across the lesion at 14 atmospheres; the balloon brought out slowly, and the guide back-bled clean before anything else is injected.', 'good']],
        flags: ['stented', 'pci'],
      };
    },
    // a covered stent for the "occlusion" is the same trap as a drug-eluting one (and the wrong device besides)
    'stent-covered': (s) => {
      if (s.role !== 5 || !has(s, 'wired') || has(s, 'pci') || !blocked(s)) return null;
      return {
        say: [['you', 'Covered stent deployed across the lesion.'], ['you', 'Nothing changes: beyond the stent the artery is still blocked, and the minutes go by.', 'bad']],
        flags: ['covered-stent', 'stented', 'pci', 'stent-early'],
      };
    },
    'final-angio': (s) => {
      if (!has(s, 'pci') || !has(s, 'recovered')) {
        return { blocked: true, say: [s.role === 5 ? ['system', 'Not the final pictures yet: he has to recover and the stent has to go in first.'] : ['operator', 'Not yet — the stent first.']] };
      }
      return s.role === 5 ? { say: [['you', FINAL_LINE, 'good']], image: { id: 'final-angio', view: 'Final angiogram' }, flags: ['final-angio'] } : null;
    },
    defib: (s) => shockOutcome(s),
    aed: (s) => shockOutcome(s, true),
  },
  events: [
    {
      // where the case stands: set up, anticoagulated, the guide in the right coronary, the wire across, the lesion pre-dilated
      id: 'setup', when: () => true,
      effect: () => ({
        flags: ['consent', 'timeout', 'iv', 'prep', 'transducer', 'monitor', 'pads', 'access', 'catheter', 'heparin', 'p2y12', 'act',
          'guide', 'guide-right', 'view-set', 'wired', 'predilated', 'cine'],
      }),
    },
    {
      // the check injection pushes the air the guide drew in as the balloon came out down the right coronary
      id: 'air', when: () => true,
      effect: (s) => ({
        say: [
          [runner(s), 'Check run of the right coronary after the balloon, in LAO.'],
          ['monitor', 'Cine recorded: LAO view of the right coronary.'],
          [runner(s), 'Round, sharp-edged clear spots hang in the contrast in the mid right coronary, rocking with each beat but not washing out; beyond them the artery stops filling.', 'bad'],
          ['monitor', 'Heart rate 44. BP 78/46.', 'bad'],
          ['patient', '"Ugh — my chest! It\'s crushing… I feel sick."'],
          ...(s.role === 5 ? [line('team', 'Tech: "Doctor — rate 44, pressure 78!"', 'warn')] : []),
          // with the nurse the operator stops injecting at once, in the same breath (an event after the read would only
          // come after the nurse's first action, and the review would time the stop by it)
          ...(s.role === 4 ? [line('operator', 'Stop — nobody injects anything!', 'warn')] : []),
        ],
        rhythm: { profile: 'inferior-stemi', hr: 44 }, vitals: { sbp: 78, dbp: 46, pain: 8 },
        image: { id: 'view-rca-lao', view: 'LAO view of the right coronary (check run)' },
        flags: ['air', 'view-rca-lao', ...(s.role === 4 ? ['contrast-stopped'] : [])], read: airRead,
      }),
    },
    {
      // once named, a published run of the same complication (another patient's, labeled so) goes on the Imaging screen
      id: 'example-image', when: readGiven,
      effect: () => ({
        say: [['team', 'For comparison, a published right coronary run from another patient with the same complication is on the Imaging screen.']],
        image: { view: 'Another patient: a published right coronary run, for comparison', image: EXAMPLE_IMAGE },
      }),
    },
    {
      id: 'md-stops-for-rn', when: (s) => s.role === 4 && readGiven(s) && blocked(s),
      effect: () => ({ say: [['operator', 'Tech, a clean syringe — I\'m aspirating the guide.']] }),
    },
    {
      // the operator aspirates and flushes: for the nurse a minute in, for the tech once the syringe is ready (or he gets his own)
      id: 'md-clears', when: (s) => blocked(s) && (s.role === 4 ? s.minute >= s.flags.air + 1 : s.role === 3 && (has(s, 'syringe-ready') || s.minute >= s.flags.air + 3)),
      effect: (s) => {
        const e = clearAir(s, 'operator');
        return { ...e, flags: [...(e.flags ?? []), 'syringe-ready'] };
      },
    },
    {
      id: 'recovered', when: (s) => s.pulse && has(s, 'air-cleared') && !has(s, 'recovered') && s.minute + 1e-6 >= (recoveryDue(s) ?? Infinity),
      effect: (s) => {
        const hr = has(s, 'rate-up') || has(s, 'ic-epinephrine') ? 84 : 76;
        const gcs = has(s, 'arrest') ? 14 : 15;
        return {
          say: [
            [runner(s), 'A small puff from the clean syringe: the right coronary fills briskly to the crux — no clear spots left.', 'good'],
            ['monitor', paced(s) ? `Heart rate ${hr}: his own beats are back, faster than the pacer, so it stops firing. BP 124/74.` : `Heart rate ${hr}. BP 124/74.`, 'good'],
            ...(gcs >= 13 ? [line('patient', '"Oh… that\'s easing off. What was that?"')] : []),
          ],
          // the nurse's open orders for the rate and the pressure have nothing left to treat
          rhythm: { profile: 'normal-sinus', hr }, vitals: { sbp: 124, dbp: 74, pain: 1, gcs }, flags: ['recovered', 'o2-given', 'atropine-given', 'pressure-held'],
        };
      },
    },
    {
      // nothing has been aspirated: the inferior wall and the sinus node starve, and the pressure sags (what a drug holds up stays)
      id: 'worse', when: (s) => s.pulse && blocked(s) && s.minute >= s.flags.air + 2,
      effect: (s) => {
        const held = has(s, 'rate-up') || paced(s);
        const hr = held ? s.rhythm.hr : Math.min(s.rhythm.hr, 36);
        const bp = has(s, 'supported') ? { sbp: s.vitals.sbp, dbp: s.vitals.dbp } : { sbp: Math.min(s.vitals.sbp, 66), dbp: Math.min(s.vitals.dbp, 38) };
        return {
          say: [
            ['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`, 'bad'],
            ...awake(s, 'I feel… like I\'m going to pass out…'),
            ...(s.role === 5 ? [line('team', `Nurse: "Doctor — ${bp.sbp} systolic, and he's going gray!"`, 'warn')] : []),
          ],
          ...(held ? {} : { rhythm: atRate(s, hr) }), vitals: { ...bp, gcs: Math.min(s.vitals.gcs, 13), pain: 9 },
        };
      },
    },
    {
      // left blocked, the ischemic heart fibrillates
      id: 'vf', when: (s) => s.pulse && blocked(s) && s.minute >= s.flags.air + 5,
      effect: (s) => ({
        say: [['monitor', 'Monitor alarm — he is unresponsive!', 'bad'], ...(s.role === 5 ? [line('team', 'Tech: "Doctor — look at the monitor!"', 'bad')] : [])],
        rhythm: { profile: 'vf', hr: 0 }, pulse: false, flags: ['vf'],
      }),
    },
    // a shock brings a rhythm back, not the flow: with the air never aspirated the starved heart fibrillates again three
    // minutes later (up to three times; each arrest still ends in death if it is not shocked)
    ...[1, 2, 3].map((n): ScenarioEvent => ({
      id: `vf-again-${n}`,
      when: (s) => s.pulse && blocked(s) && s.timers.lastShockAt !== undefined && s.minute >= s.timers.lastShockAt + 3
        && s.fired.filter((id) => id.startsWith('vf-again-')).length === n - 1,
      effect: (s) => ({
        say: [['monitor', 'Monitor alarm — he is unresponsive again!', 'bad'], ...(s.role === 5 ? [line('team', 'Tech: "Doctor — the monitor again!"', 'bad')] : [])],
        rhythm: { profile: 'vf', hr: 0 }, pulse: false,
      }),
    })),
    {
      // the nurse does her part while the tech works the manifold
      id: 'rn-treats-for-tech', when: (s) => s.role === 3 && s.pulse && unwell(s) && readGiven(s) && (has(s, 'callout') || s.minute >= s.flags.air + 1),
      effect: (s) => {
        const slow = s.rhythm.hr < 60 && !paced(s);
        const bp = slow ? bpAfter(s, 10, 6) : { sbp: s.vitals.sbp, dbp: s.vitals.dbp };
        return {
          say: [
            ...(has(s, 'callout') ? [] : [line('operator', 'Rate\'s in the forties — who\'s watching the monitor?', 'warn')]),
            ['team', slow ? 'Nurse: non-rebreather on at 15 liters; atropine 1 milligram in.' : 'Nurse: non-rebreather on at 15 liters.'],
            ...(slow ? [line('monitor', `Heart rate 68. BP ${bp.sbp}/${bp.dbp}.`)] : []),
          ],
          vitals: { ...bp, spo2: 100 }, ...(slow ? { rhythm: atRate(s, 68) } : {}),
          flags: ['o2', 'o2-100', ...(slow ? ['atropine', 'rate-up'] : [])],
        };
      },
    },
    ...TECH_ASKS.flatMap(askEvents),
    ...RN_ASKS.flatMap(askEvents),
    {
      id: 'md-stent', when: (s) => !has(s, 'pci') && (s.role === 4 ? has(s, 'recovered') && s.minute >= s.flags.recovered + 1 : s.role === 3 && has(s, 'stent-in-hand')),
      effect: () => ({ say: [['operator', 'Stent deployed at 14 atmospheres. Balloon out slowly — and the guide back-bled clean before the next injection.', 'good']], flags: ['stented', 'pci'] }),
    },
    {
      id: 'md-final', when: (s) => s.role !== 5 && has(s, 'pci') && has(s, 'recovered') && !has(s, 'final-angio'),
      effect: () => ({ say: [['operator', FINAL_LINE, 'good']], image: { id: 'final-angio', view: 'Final angiogram' }, flags: ['final-angio'] }),
    },
  ],
  critical: [
    { id: 'callout', label: 'Call out the slow rate and the falling pressure at once', why: 'A rate of 44 and a pressure of 78 the moment the check run went in: say it out loud so the whole team switches to the problem.', done: ['callout'], after: 'air', roles: [3, 4], points: 10, target: { within: { flag: 'air', minutes: 1 } }, applies: hit },
    { id: 'tech-stop', label: 'Stop the injections at once (injector and manifold)', why: 'Every injection through a line with air in it pushes more air down the artery: nothing goes in until the guide has been aspirated and the line is clean.', done: ['stop-contrast'], after: 'air', roles: TECH, points: 10, target: { within: { flag: 'air', minutes: 1 } }, applies: hit },
    { id: 'md-stop', label: 'Stop injecting', why: 'Say it out loud — injector off, manifold closed: every injection through a line with air in it pushes more air down the artery.', done: ['stop-contrast'], after: 'air', roles: MD, points: 5, target: { within: { flag: 'air', minutes: 1 } }, applies: hit },
    {
      id: 'md-clear', label: 'Aspirate back through the guide, then flush hard with bubble-free saline', roles: MD, points: 15, target: { within: { flag: 'air', minutes: 2 } }, applies: hit,
      why: 'Aspiration takes the air still in the guide (and, with an aspiration catheter, in the artery) out of the patient; a forceful flush of bubble-free saline breaks up what is left and pushes it through the small vessels. It is the treatment — the rest supports him while it works.',
      done: (s) => learnerStarted(s, 'air-cleared', ['clear-air', 'aspiration']), uses: ['clear-air', 'aspiration'],
    },
    {
      ...askCritical(TECH_ASKS[0]),
      // only a set-up while the air is still in counts: the back-bleed after the recovery is the next request's, not a late answer to this one
      done: (s) => {
        const asked = s.flags['asked-syringe'];
        if (asked === undefined) return null;
        const until = s.flags.recovered ?? Infinity;
        const hit = s.performed.find((p) => p.id === 'clear-air' && p.minute < until);
        return hit ? Math.max(hit.minute, asked) : null;
      },
    },
    { id: 'o2', label: '100 % oxygen (non-rebreather)', why: 'Pure oxygen washes the nitrogen out of the blood, so the nitrogen in the bubbles diffuses out and they shrink faster. In air embolism it is given whatever the SpO₂.', done: ['o2-nrb'], after: 'air', roles: [4, 5], points: 10, target: { within: { flag: 'air', minutes: 2 } }, applies: hit },
    {
      id: 'rate', label: 'Bring the slow rate up: atropine (pacing if it does not hold)', roles: [4, 5], points: 10, target: { within: { flag: 'air', minutes: 2 } }, applies: hit,
      why: 'A rate of 44 with a pressure of 78 is symptomatic bradycardia: atropine 1 mg IV (repeat every 3–5 minutes, 3 mg in all), and pacing if it does not hold.',
      // a pacer counts too. Flow brought back brings the rate back with it: on time within the 2 minutes, late (half) within
      // 3 — that long at 44 with nothing given for it is late care, not none
      done: (s) => earliest(learnerStarted(s, 'rate-up', ['atropine']), learnerStarted(s, 'paced', ['pace', 'temp-wire']), recoveredWithin(s, 3)), uses: RATE,
    },
    {
      id: 'support', label: 'Hold the pressure up while it clears', roles: [4, 5], points: 10, target: { within: { flag: 'air', minutes: 3 } }, applies: hit,
      why: 'The blood that pushes the bubbles on, and feeds the rest of the heart, depends on the aortic pressure: a phenylephrine bolus once the rate is up, push-dose epinephrine or norepinephrine, intracoronary epinephrine once the guide is clear, fluid for the ischemic right ventricle — a balloon pump if the shock persists.',
      done: (s) => earliest(learnerStarted(s, 'supported', SUPPORT), recoveredWithin(s, 3)), uses: SUPPORT,
    },
    { id: 'defib', label: 'Defibrillate VF within 1 minute', why: 'In the lab VF is witnessed with the pads on: shock it within seconds, CPR if the rhythm does not come back.', done: ['defib', 'aed'], after: 'arrest', points: 15, target: { within: { flag: 'arrest', minutes: 1 } }, applies: (s) => has(s, 'arrest') },
    ...TECH_ASKS.slice(1).map(askCritical),
    {
      id: 'md-stent', label: 'Then finish the case: the planned stent, once he has recovered', roles: MD, points: 5, applies: (s) => !has(s, 'stent-early'),
      why: 'The lesion still needs its stent, once the flow, the rate and the pressure are back — with the balloon brought out slowly and the guide back-bled before the next injection.',
      done: (s) => firstDone(s, ['stent-des'], 'recovered'), uses: ['stent-des'],
    },
    { id: 'final', label: 'Final angiogram', why: 'Confirm TIMI 3 flow to the crux, no bubbles left and no dissection at the stent edges before you leave the artery.', done: ['final-angio'], after: 'pci', roles: MD, points: 5, applies: (s) => has(s, 'pci') },
    { id: 'post-ecg', label: '12-lead once he has recovered', why: 'The inferior ST segments back at baseline confirm the flow; it is the baseline for the recovery area.', done: ['ecg12', 'ecg12-repeat'], after: 'recovered', points: 5, applies: (s) => has(s, 'recovered') },
    { id: 'hemostasis', label: 'Radial band and distal perfusion check', why: 'Patent hemostasis, as always — on two antiplatelet drugs and heparin.', done: ['hemostasis'], after: 'final-angio', roles: [3, 4], points: 5, applies: (s) => has(s, 'final-angio') },
    { id: 'handoff', label: 'Hand-off to the recovery area', why: 'What happened and how it happened, how it was cleared and how long the artery was blocked, the drugs given, the stent, the access site — watch the rhythm and the troponin, and report it as a safety event so the set-up is reviewed.', done: ['handoff'], roles: [4, 5], points: 5 },
  ],
  harms: [
    { id: 'nitro-low-pressure', actions: ['nitro', 'nitro-high', 'ic-nitro'], replaces: NITRATE_RULES, when: (s) => s.pulse && s.vitals.sbp < 90, points: 8, severity: 'major', text: 'Nitroglycerin with a systolic pressure under 90 mmHg. The artery is blocked by gas, not by spasm or clot: nitroglycerin cannot move a bubble, and it drops the pressure that pushes the blood — and the bubbles — through. Hold the pressure up instead.' },
    { id: 'vasodilator-low-pressure', actions: ['ic-adenosine', 'ic-verapamil', 'ic-nitroprusside'], replaces: ['nitroprusside-hypotension'], when: (s) => s.pulse && s.vitals.sbp < 90, points: 6, severity: 'major', text: 'An intracoronary vasodilator with a systolic pressure under 90 mmHg. It drops the pressure further (adenosine and verapamil also slow the heart): air is moved by aspiration and a forceful flush, with the pressure held up while it clears.' },
    { id: 'inject-through-air', actions: INJECTIONS, roles: MD, when: (s) => s.pulse && blocked(s), points: 8, severity: 'major', text: 'Another injection before the guide was aspirated. The air sits in the guide and the manifold: every injection pushes more of it down the artery. Stop injecting, aspirate back through the guide until the blood comes back free of bubbles, then flush.' },
    { id: 'stent-for-air', actions: ['stent-des', 'stent-covered'], roles: MD, when: (s) => blocked(s) && !has(s, 'pci'), points: 10, severity: 'major', text: 'A stent for the "occlusion". The artery is blocked by bubbles, not by plaque or clot: a stent cannot remove air, and the minutes spent on it leave the inferior wall without flow. Aspirate and flush first.' },
    { id: 'stent-unstable', actions: ['stent-des'], roles: MD, when: (s) => has(s, 'air-cleared') && !has(s, 'recovered') && !has(s, 'pci'), points: 3, severity: 'minor', text: 'The stent while he was still slow and low. Let the last bubbles clear and the rate and the pressure come back; then finish the job.' },
    { id: 'extra-stent', actions: ['stent-des'], roles: MD, when: (s) => has(s, 'pci'), points: 3, severity: 'minor', text: 'A second stent with no lesion left to treat: the planned stent is already in.' },
    { id: 'tech-unasked-metal', actions: ['stent-des', 'stent-covered', 'balloon-predil', 'balloon-nc'], roles: TECH, when: unwell, points: 3, severity: 'minor', text: 'A stent or balloon opened that the operator did not ask for, in the middle of the air embolism. The artery is blocked by air, not plaque: metal fixes nothing. Open devices when the operator asks for them.' },
    // with the air still in, the stent for the "occlusion" is the mistake (stent-for-air): one penalty for one act
    { id: 'covered-no-perforation', actions: ['stent-covered'], roles: MD, when: (s) => !blocked(s), points: 4, severity: 'minor', text: 'A covered stent without a perforation. Covered stents seal perforations; they restenose and clot more than drug-eluting stents.' },
    { id: 'beta-blocker', actions: ['metoprolol'], when: unwell, points: 8, severity: 'major', text: 'An IV beta-blocker with a slow rate and a low pressure. It slows the heart and weakens the squeeze further, while the right coronary territory is starved.' },
    // the same mistake, and the same penalty, whether or not the nurse was answering the operator's call for the rate
    // (the operator's word on it is the order's own)
    { id: 'av-blocker-slow', actions: ['adenosine6', 'adenosine12', 'diltiazem', 'amio-infusion', 'adenosine-iv-ffr'], when: (s) => s.pulse && unwell(s) && (s.rhythm.hr < 60 || s.vitals.sbp < 90), points: 8, severity: 'major', text: 'A drug that slows the sinus or AV node and drops the pressure (adenosine, diltiazem, amiodarone), with a slow rate or a low pressure from the air in the right coronary. The slow rate needs atropine (or pacing), not more slowing.' },
    { id: 'cocktail-low-pressure', actions: ['radial-cocktail'], when: (s) => s.pulse && unwell(s) && s.vitals.sbp < 90, points: 6, severity: 'major', text: 'The radial cocktail with a systolic pressure under 90 mmHg. Verapamil and nitroglycerin both drop the pressure (verapamil also slows the heart), and there is no spasm to treat: hold the pressure up while the air clears.' },
    { id: 'lidocaine-no-target', actions: ['lidocaine'], when: (s) => s.pulse && unwell(s), points: 3, severity: 'minor', text: 'Lidocaine with no ventricular arrhythmia to treat. Prophylactic lidocaine in an acute coronary occlusion is not recommended, and with a slow rate it can suppress the beats that keep him going.' },
    { id: 'clot-drugs-for-air', actions: ['gp2b3a', 'cangrelor'], when: unwell, points: 4, severity: 'minor', text: 'A drug for clot during an air embolism. The artery is blocked by bubbles, not thrombus: a GP IIb/IIIa or IV P2Y12 inhibitor treats nothing here and adds bleeding risk on top of heparin and two antiplatelet drugs.' },
    { id: 'lytic-in-lab', actions: ['tnk'], points: 15, severity: 'critical', text: 'A systemic fibrinolytic in the lab, for air. There is no clot to dissolve, and on top of heparin and two antiplatelet drugs it brings major bleeding risk.' },
    { id: 'protamine-mid-pci', actions: ['protamine'], when: (s) => !has(s, 'pci'), points: 8, severity: 'major', text: 'Protamine in the middle of a PCI, with a wire in the artery and the stent still to go in. Reversing the heparin lets clot form on the wire and the guide; air embolism is not a bleeding problem.' },
    { id: 'vasopressor-normal-pressure', actions: ['ic-epinephrine', 'push-epi', 'pressor'], when: (s) => s.pulse && s.vitals.sbp >= 110, points: 3, severity: 'minor', text: 'A vasopressor with a systolic of 110 or more. It only speeds the heart and raises its oxygen need: support the pressure when it is low.' },
    askHarm(TECH_ASKS[2],'The wrong device when the operator asked for a drug-eluting stent. Check the order and the box before you open it.'),
  ],
  timings: [
    { label: 'Injections stopped', actions: ['stop-contrast'], flag: 'contrast-stopped', target: 1, from: 'air' },
    // the flag, not the action: the tech's 'clear-air' is the syringe set-up, and the operator aspirates after it
    { label: 'Air aspirated and flushed', actions: [], flag: 'air-cleared', target: 2, from: 'air' },
    { label: 'Flow, rate and pressure back', actions: [], flag: 'recovered', target: 5, from: 'air' },
  ],
  deathAfter: 8,
  completeWhen: (s) => has(s, 'recovered') && has(s, 'pci') && has(s, 'final-angio'),
  teaching: [
    'Coronary air embolism is almost always iatrogenic and rare — about 0.1–0.3 % of catheterizations, more often during PCI than diagnostic studies: a catheter or manifold not aspirated and flushed, a syringe held tip-up, a loose connection, a ruptured balloon, or air drawn into the guide as a device is pulled out fast through the valve.',
    'It looks like a sudden occlusion: chest pain, ST elevation in that artery\'s territory (inferior for the right coronary, often with a slow rate and a low pressure), and VF or arrest if there is a lot of air. On the angiogram: round, sharp-edged clear spots in the contrast column, and no flow beyond them.',
    'Say it out loud and stop injecting: every injection through a line with air in it pushes more down the artery.',
    'Clear it: aspirate back through the guide until the blood comes back free of bubbles, then a forceful flush of bubble-free saline to break up what is left and push it through; an aspiration catheter can pull air out of the artery itself. Small amounts often clear on their own within minutes.',
    '100 % oxygen (a non-rebreather) until it has cleared: pure oxygen washes nitrogen out of the blood, so the nitrogen in the bubbles diffuses out and they shrink faster. Here oxygen is given whatever the SpO₂.',
    'Support him while it clears: atropine 1 mg for the bradycardia (pacing if it does not hold); a pressor for the pressure — intracoronary epinephrine once the guide is clear, a phenylephrine bolus once the rate is up, push-dose epinephrine or norepinephrine; an intra-aortic balloon pump if the shock persists. Shock VF at once; CPR if the rhythm does not come back.',
    'Not nitroglycerin with a low pressure: the blockage is gas, not spasm or clot — nitroglycerin cannot move it and drops the pressure that pushes blood through. And not a stent: metal cannot remove a bubble.',
    'Prevention is the whole team\'s: back-bleed the guide after every device comes out (and bring balloons out slowly), keep the manifold and the syringes free of bubbles — tip down, eyes on them before every injection — and never let the contrast reservoir run dry.',
    'In a patient lying on the back the right coronary ostium is the highest point of the aortic root, so air that reaches the root from the left heart (a transseptal sheath, an ablation, surgery) tends to rise into it: new inferior ST elevation during such a procedure can be air.',
  ],
};
