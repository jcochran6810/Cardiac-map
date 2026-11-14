import type { Effect, Line, PendingRead, Scenario, SimState, Speaker } from '../types';
import { bpAfter, firstDone, has, line } from '../kit';
import { INTERVENTION_BY_ID } from '../interventions';
import {
  LEFT_VIEWS, MD, NO_REFLOW_VASODILATORS, TECH, askCritical, askEvents, askHarm, cine, type LabAsk,
} from '../labKit';

/**
 * No-reflow after primary PCI. The case opens with the wire across a clot-laden proximal LAD, flow back after aspiration
 * and a balloon, and the stent still to go in. The stent goes in, the artery is open, and the flow stalls beyond it: the
 * pain, the ST elevation and a falling pressure come back. The learner has to name it, rule out a mechanical cause,
 * hold the pressure up and open the microvessels with intracoronary drugs — and not reach for more metal.
 */

/**
 * Real images: the first run of the case (cine view id 'angio') and the post-stent runs ('no-reflow'), both from the
 * same patient's article. The post-stent image has its findings printed on it, so it is only shown once the learner has
 * named what is happening.
 */
const IMAGES: Partial<Record<string, string>> = { angio: 'lad-occlusion-thrombus', 'no-reflow': 'lad-no-reflow-pci' };

/** Every intracoronary drug that acts on the microvessels: the three vasodilators and epinephrine */
const MICRO = [...NO_REFLOW_VASODILATORS, 'ic-epinephrine'];

/** What holds the pressure up while the flow is stalled: epinephrine (intracoronary or IV), norepinephrine, a phenylephrine bolus, a pump */
const SUPPORT = ['ic-epinephrine', 'pressor', 'push-epi', 'phenylephrine', 'iabp', 'impella'];

/** The earliest of several minutes (null if none) */
const earliest = (...mins: (number | null | undefined)[]) => {
  const got = mins.filter((m): m is number => typeof m === 'number');
  return got.length ? Math.min(...got) : null;
};

/**
 * When the action behind a flag was started (the engine counts an action from its start; the flag is set when it is
 * done): the one of `ids` that finished at the flag's minute — otherwise the flag's own minute (e.g. a pump, which only
 * holds the pressure up once it is in).
 */
function startedAt(s: SimState, flag: string, ids: string[]): number | null {
  const at = s.flags[flag];
  if (at === undefined) return null;
  const hit = s.performed.find((p) => ids.includes(p.id) && Math.abs(p.minute + INTERVENTION_BY_ID[p.id].minutes - at) < 0.05);
  return hit ? hit.minute : at;
}

const firstRun = cine('angio', 'First run of the case: the left coronary', IMAGES.angio, [
  ['team', 'First run: the proximal LAD is occluded, with a heavy thrombus load. Right coronary: mild disease only.'],
], {
  kind: 'angio', answer: 'angio-lad-prox-occlusion', partial: ['angio-thrombus'], prompt: 'What did the first left coronary run show?',
  explain: 'The proximal LAD is occluded (TIMI 0) with a large thrombus burden: the culprit of this anterior STEMI. A heavy clot load is a warning sign for the rest of the procedure.',
}, [['team', 'The first left coronary run, from before the wire, is on the Imaging screen. Right coronary: mild disease only.']]);

const noReflowRead: Omit<PendingRead, 'minute'> = {
  kind: 'clinical', answer: 'clin-no-reflow', prompt: 'What is happening?',
  explain: 'No-reflow: the stent and the artery are open, but blood cannot get through the small vessels beyond — clot and plaque debris swept downstream, platelet plugs, spasm and swelling. The pain and the ST elevation come back and the pressure falls. Rule out a mechanical cause (a dissection, clot in the stent, spasm, a wedged guide), keep the pressure up, and give intracoronary drugs that open the microvessels — epinephrine while the pressure is low, then adenosine, verapamil or nitroprusside. Not more stents.',
};

const IVUS_BEFORE = 'IVUS: plaque rupture with a large thrombus load over 26 mm of the proximal LAD; reference lumen 3.5 mm proximally and 3.3 mm distally.';
const IVUS_AFTER = 'IVUS through the stent and beyond: well expanded (minimum stent area 8.4 mm²) and fully apposed; no dissection or hematoma at either edge; no clot or tissue inside the struts; the vessel beyond it is open.';
const OCT_BEFORE = 'OCT: plaque rupture with red thrombus filling much of the lumen over 26 mm of the proximal LAD; the flush struggles to clear it.';
const OCT_AFTER = 'OCT (the flush clears slowly with flow this sluggish): the stent well expanded and apposed; no dissection at either edge; no clot protruding through the struts.';
const FINAL_LINE = 'Final angiogram in two views: TIMI 3 flow to the apex with a good myocardial blush; the stent well expanded, no dissection at its edges, no clot.';

/** Who describes a run: the learner as the cardiologist, otherwise the operator */
const runner = (s: SimState): Speaker => (s.role === 5 ? 'you' : 'operator');

/** Only a patient awake enough to talk says how he feels */
const awake = (s: SimState, text: string): Line[] => (s.pulse && s.vitals.gcs >= 13 ? [['patient', `"${text}"`]] : []);

/** The no-reflow is under way and the flow not yet back: what the intracoronary drugs act on */
const stalled = (s: SimState) => s.pulse && has(s, 'no-reflow') && !has(s, 'reflow');

/** Who gives a drug: the learner (the cardiologist injects; the tech or the nurse draws it up for the operator), or the operator after waiting */
type By = 'learner' | 'operator';

/** Through the aspiration catheter beyond the stent once its tip sits there, otherwise down the guide */
const route = (s: SimState) => (has(s, 'distal-catheter') ? 'through the aspiration catheter, beyond the stent' : 'down the guide');

function given(s: SimState, by: By, drug: string): Line[] {
  if (by === 'operator') return [['operator', `${drug} ${route(s)}.`]];
  if (s.role === 5) return [['you', `${drug} ${route(s)}.`]];
  return [['you', `${drug} drawn up, labeled and handed to the operator — dose read back.`], ['operator', `Injecting ${route(s)}.`]];
}

/**
 * What the next run shows after a drug that acts on the microvessels: better but slow after the first (TIMI 2), the
 * flow back after the second — or at once when the drug went in beyond the stent, into the stalled bed. Once the flow
 * is back the muscle stops hurting and pumps better, and the ST elevation comes down again.
 */
function flowAfter(s: SimState, bp: { sbp: number; dbp: number }, hr: number): Effect {
  const who = runner(s);
  if (!has(s, 'micro-1') && !has(s, 'distal-catheter')) {
    return {
      say: [[who, 'Next run: the contrast now reaches the apex — but slowly, still filling over many beats.'], ...awake(s, 'It\'s a little easier.')],
      vitals: { ...bp, pain: Math.min(s.vitals.pain, 6) }, rhythm: { ...s.rhythm, hr }, flags: ['micro-1'],
    };
  }
  const sbp = Math.max(bp.sbp, 112);
  const dbp = Math.max(bp.dbp, 70);
  // perfused again, he is fully awake (a little drowsier only if he has just been shocked out of VF)
  const gcs = has(s, 'arrest') ? Math.max(s.vitals.gcs, 14) : 15;
  return {
    say: [
      [who, 'Next run: the LAD fills briskly to the apex, the muscle blushes, and the contrast clears within a few beats.', 'good'],
      ['monitor', `Heart rate 92. BP ${sbp}/${dbp}.`],
      ...(gcs >= 13 ? [line('patient', '"Oh — that\'s easing off now."')] : []),
    ],
    // with the flow back the pressure is back too ('pressure-up'), however it got there
    vitals: { sbp, dbp, pain: 2, gcs }, rhythm: { profile: 'anterior-stemi-reperfused', hr: 92 }, flags: ['micro-1', 'reflow', 'pressure-up'],
  };
}

/** A microvascular drug's own lines and flags, then what the run shows */
function microDrug(s: SimState, by: By, drug: string, bp: { sbp: number; dbp: number }, hr: number, own: Line[], flags: string[]): Effect {
  const flow = flowAfter(s, bp, hr);
  return { ...flow, say: [...given(s, by, drug), ...own, ...(flow.say ?? [])], flags: [...flags, ...(flow.flags ?? [])] };
}

/** Epinephrine 100 mcg: it washes through into the circulation and lifts the pressure and the rate, and it opens the microvessels */
function epinephrine(s: SimState, by: By): Effect {
  const bp = bpAfter(s, 16, 8);
  const hr = s.rhythm.hr + 8;
  return microDrug(s, by, 'Epinephrine 100 mcg', bp, hr, [['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`]], ['ic-epinephrine', 'supported', 'pressure-up']);
}

/**
 * Adenosine 200 mcg: seconds of AV block (the pressure dips with it), then it works on the arterioles. The monitor gives
 * the numbers only: what the tracing showed during the pause is the learner's to see.
 */
function adenosine(s: SimState, by: By): Effect {
  const { sbp, dbp } = s.vitals;
  const own: Line[] = [
    ['monitor', `Heart rate falls to about 30 for 8 seconds, then back to ${s.rhythm.hr} on its own. BP dips to ${Math.max(50, sbp - 14)}, then recovers to ${sbp}/${dbp}.`],
    ...awake(s, 'Whoa — my chest feels tight…'),
    ...(s.role === 5 ? [line('team', 'Nurse: "Pause — about eight seconds… and he\'s back."')] : []),
  ];
  return microDrug(s, by, 'Adenosine 200 mcg', { sbp, dbp }, s.rhythm.hr, own, ['ic-adenosine', 'adenosine-pause']);
}

/** The ACT: drifted below the PCI range 50 minutes after the bolus, until the heparin is topped up (in range with eptifibatide or bivalirudin running) */
function act(s: SimState, who: Speaker): Effect {
  if (has(s, 'heparin-topup')) return { say: [[who, 'ACT 268 s.']], flags: ['act'] };
  if (has(s, 'bivalirudin')) return { say: [[who, 'ACT 334 s, with bivalirudin running.']], flags: ['act'] };
  if (has(s, 'gp2b3a')) return { say: [[who, 'ACT 212 s, with eptifibatide running.']], flags: ['act'] };
  return { say: [[who, 'ACT 212 s.']], flags: ['act', 'act-low'] };
}

/** A balloon or a stent once the flow has stalled: the artery is open, so more metal and more pressure only push more debris downstream */
function moreMetal(s: SimState, what: string): Effect | null {
  if (!has(s, 'no-reflow')) return null;
  if (s.role === 3) return { say: [['you', `${what} opened and prepped.`], ['operator', 'Put that away — the artery is open. More metal won\'t fix this.', 'warn']] };
  if (s.role !== 5) return null;
  const bp = bpAfter(s, -6, -4);
  return {
    say: [['you', `${what} up inside the stent.`], ['you', 'Next run: no better — if anything the contrast stalls sooner.', 'bad'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`]],
    vitals: { ...bp, pain: Math.min(10, s.vitals.pain + 1) }, flags: ['more-metal'],
  };
}

/** Another projection of the stent while the flow is stalled: no flap, no staining, no filling defect — the obstruction is beyond it */
function viewOfStent(s: SimState, id: string, label: string): Effect | null {
  if (s.role !== 5 || !stalled(s) || !has(s, 'access')) return null;
  return {
    say: [['monitor', `Cine recorded: ${label}. The stent edges are smooth — no flap, no contrast staining outside the lumen, no filling defect in the stent. Beyond it the contrast still crawls.`]],
    image: { id, view: label }, flags: ['cine', id, 'mech-excluded'],
  };
}

/** A microvascular drug pushed into the coronary during VF: it has nothing to treat in the arrest (and is not the dose for the no-reflow) */
const pulseless = (what: string, flag: string): Effect => ({ say: [['you', `${what} given — it has no place in cardiac arrest and changes nothing on the monitor.`]], flags: [flag] });

function shockOutcome(s: SimState): Effect | null {
  if (s.pulse || s.rhythm.profile !== 'vf') return null;
  return {
    say: [['monitor', 'Shock delivered: 200 J.'], ['you', 'An organized rhythm is back: 82/50 on the arterial line. The flow beyond the stent is still stalled.', 'warn']],
    rhythm: { profile: 'anterior-stemi', hr: 112 }, pulse: true, vitals: { sbp: 82, dbp: 50, gcs: 13, pain: 8 }, flags: ['pads', 'monitor', 'shocked'],
  };
}

const TECH_ASKS: LabAsk[] = [
  {
    id: 'act', when: () => true,
    ask: 'It\'s been fifty minutes since the heparin. Run an ACT before the stent, please.',
    accept: ['act'],
    thanks: 'Thanks — I want 250 to 300 with this much clot.', fallback: 'I\'ll get the ACT run myself.', gives: 'act-known',
    fallbackEffect: (s) => act(s, 'team'),
    label: 'ACT before the stent',
    why: 'Fifty minutes after the bolus the heparin is wearing off; in an artery full of clot the ACT should be 250–300 s before more devices go in.',
  },
  {
    id: 'stent', when: (s) => has(s, 'heparin-topup'), early: true,
    ask: 'Good. Drug-eluting stent, 3.5 by 28, please.',
    accept: ['stent-des'], wrong: ['stent-covered', 'balloon-nc', 'balloon-predil'],
    wrongSay: 'No — a drug-eluting stent, 3.5 by 28.',
    thanks: '3.5 by 28 — confirmed. Deploying.', fallback: 'I\'ll open the stent myself.', gives: 'stent-in-hand',
    label: 'Drug-eluting stent, as ordered',
    why: 'Say the size back to the operator and check it on the box before you open it.',
  },
  {
    // nitroglycerin, nitroprusside and verapamil at 86 each carry their own penalty; adenosine has 'wrong-epi'
    id: 'epi', when: (s) => has(s, 'no-reflow'), wait: 3,
    ask: 'Pressure\'s 86. Draw me up epinephrine for the guide — 100 micrograms, please.',
    accept: ['ic-epinephrine'], wrong: ['ic-nitro', 'ic-nitroprusside', 'ic-verapamil', 'ic-adenosine'],
    wrongSay: 'That\'s not what I asked for — that one lowers his pressure, it doesn\'t raise it. Epinephrine, 100 micrograms.',
    thanks: 'Thanks — pressure\'s coming up.', fallback: 'I\'ll draw up the epinephrine myself.', gives: 'epi-given',
    fallbackEffect: (s) => (stalled(s) ? epinephrine(s, 'operator') : {}),
    label: 'Epinephrine drawn up for the guide, as ordered', points: 10,
    why: 'With a systolic under 90, intracoronary epinephrine is the drug for the stalled flow: it opens the microvessels and lifts the pressure. Read the order back, label the syringe and hand it up.',
  },
  {
    id: 'imaging', when: (s) => has(s, 'epi-given'), wait: 3,
    ask: 'Now intravascular imaging on the table, please — I want to see that stent and its edges.',
    accept: ['ivus', 'oct'],
    thanks: 'Thanks — nothing mechanical.', fallback: 'I\'ll set up the IVUS myself.', gives: 'imaging-done',
    fallbackEffect: () => ({ say: [['operator', IVUS_AFTER]], flags: ['ivus', 'mech-excluded'] }),
    label: 'IVUS or OCT set up to look for a dissection or clot', points: 10,
    why: 'Slow flow after a stent can be mechanical — an edge dissection, clot in the stent, spasm. IVUS (or OCT) shows the stent and its edges: a dissection needs another stent, no-reflow never does.',
  },
  {
    id: 'adenosine', when: (s) => has(s, 'mech-excluded') && !has(s, 'reflow'), wait: 3,
    ask: 'Imaging\'s clean. Adenosine for the guide next, please — 200 micrograms.',
    accept: ['ic-adenosine'], wrong: ['ic-nitro', 'ic-nitroprusside', 'ic-verapamil', 'ic-epinephrine'],
    wrongSay: 'That\'s not what I asked for — adenosine, 200 micrograms.',
    thanks: 'Thanks.', fallback: 'I\'ll draw up the adenosine myself.', gives: 'adenosine-given',
    fallbackEffect: (s) => (stalled(s) ? adenosine(s, 'operator') : {}),
    label: 'Adenosine drawn up for the guide, as ordered',
    why: 'Adenosine opens the arterioles and lasts seconds, so it is repeated as needed. Diluted adenosine, verapamil and nitroprusside look the same: label every syringe on the field.',
  },
];

const RN_ASKS: LabAsk[] = [
  {
    id: 'rn-act', role: 4, when: () => true,
    ask: 'It\'s been fifty minutes since the heparin. Run an ACT before I put the stent in, please.',
    accept: ['act'],
    thanks: 'Thanks — I want 250 to 300 with this much clot.', fallback: 'I\'ll get the ACT run myself.', gives: 'act-known',
    fallbackEffect: (s) => act(s, 'team'),
    label: 'ACT before the stent',
    why: 'Fifty minutes after the bolus the heparin is wearing off; in an artery full of clot the ACT should be 250–300 s (200–250 s with a GP IIb/IIIa inhibitor).',
  },
  {
    // protamine has its own penalty (protamine-in-thrombus): the operator's word only, no second one for the same choice
    id: 'rn-heparin', role: 4, when: (s) => has(s, 'act-low'),
    ask: 'Two-twelve. Another 3,000 units of heparin, please.',
    accept: ['heparin'], wrong: ['protamine'],
    wrongSay: 'No — protamine reverses it! Heparin: he needs more anticoagulation, not less.',
    thanks: 'Thanks. Stent going in.', fallback: 'I\'ll give the heparin myself.', gives: 'heparin-given',
    fallbackEffect: () => ({ say: [['team', 'Heparin 3,000 units IV.']], flags: ['heparin-topup'] }),
    label: 'Heparin top-up for a low ACT',
    why: 'A 2,000–3,000 unit bolus brings the ACT back to 250–300 s; with it low, clot forms on the wire and the stent — and in the small vessels beyond.',
  },
  {
    // nitroglycerin, nitroprusside and verapamil with a pressure of 86 each carry their own penalty; adenosine has 'wrong-rn-epi'
    id: 'rn-epi', role: 4, when: (s) => has(s, 'no-reflow'), wait: 3,
    ask: 'Pressure\'s 86. I want an intracoronary drug that brings it up — draw it up for the guide, please.',
    accept: ['ic-epinephrine'], wrong: ['ic-nitro', 'ic-nitroprusside', 'ic-verapamil', 'ic-adenosine'],
    wrongSay: 'Not that — that one lowers his pressure, it doesn\'t raise it. Epinephrine, 100 micrograms down the guide.',
    thanks: 'Thanks — pressure\'s coming up.', fallback: 'I\'ll draw up the epinephrine myself.', gives: 'epi-given',
    fallbackEffect: (s) => (stalled(s) ? epinephrine(s, 'operator') : {}),
    label: 'Intracoronary epinephrine when the pressure is low', points: 10,
    why: 'With a systolic under 90, epinephrine is the intracoronary drug for no-reflow: it opens the microvessels and lifts the pressure. Nitroglycerin, nitroprusside and verapamil all lower it further.',
  },
  {
    id: 'rn-adenosine', role: 4, when: (s) => has(s, 'mech-excluded') && !has(s, 'reflow'), wait: 3,
    ask: 'Imaging\'s clean and his pressure is up. Now adenosine down the guide — 200 micrograms — and watch his rhythm when it goes in.',
    accept: ['ic-adenosine'], wrong: ['adenosine6', 'adenosine12', 'adenosine-iv-ffr'],
    wrongSay: 'Not an IV dose — 200 micrograms intracoronary, down the guide.',
    thanks: 'Thanks.', fallback: 'I\'ll draw up the adenosine myself.', gives: 'adenosine-given',
    fallbackEffect: (s) => (stalled(s) ? adenosine(s, 'operator') : {}),
    label: 'Intracoronary adenosine, as ordered',
    why: 'Adenosine 100–200 mcg into the coronary opens the arterioles and lasts seconds. The 6–12 mg IV push is the SVT dose, and the IV infusion is for FFR.',
  },
];

export const cathlabNoReflow: Scenario = {
  id: 'no-reflow-cathlab',
  title: 'Primary PCI: the stent is in, but the flow is not',
  summary: '64-year-old man with an anterior STEMI and a heavy clot burden. After the stent the artery is open, but the pain, the ST elevation and a falling pressure come back. Find out why, and fix it without more metal.',
  setting: 'cathlab',
  roles: [3, 4, 5],
  difficulty: 'advanced',
  conditionId: 'anterior-stemi',
  images: IMAGES,
  briefing: {
    default: [
      ['team', 'Primary PCI from the right radial: 64-year-old man, anterior STEMI, 4 hours of pain; diabetic, smoker, 85 kg. Aspirin and ticagrelor 180 mg given; heparin 70 units/kg at the start of the case, 50 minutes ago (ACT then 276 s).'],
      ['team', 'The proximal LAD was occluded with a heavy clot burden. The wire is across; two aspiration runs and a 2.5 mm balloon have brought flow back to the apex. Next: a 3.5 × 28 mm drug-eluting stent.'],
      ['scene', 'He is awake and sweaty; the pain has eased to 3 out of 10.'],
    ],
    3: [
      ['team', 'Primary PCI from the right radial: 64-year-old man, anterior STEMI, 4 hours of pain; diabetic, smoker, 85 kg. Aspirin and ticagrelor 180 mg given; heparin 70 units/kg at the start of the case, 50 minutes ago (ACT then 276 s).'],
      ['team', 'The proximal LAD was occluded with a heavy clot burden. The wire is across; two aspiration runs and a 2.5 mm balloon have brought flow back to the apex. Next: a 3.5 × 28 mm drug-eluting stent.'],
      ['scene', 'He is awake and sweaty; the pain has eased to 3 out of 10.'],
      ['team', 'You are the scrub tech: the pressures, the ACT, the drugs and devices the cardiologist asks for — and calling out every change you see. The nurse is at his side.'],
    ],
    4: [
      ['team', 'Primary PCI from the right radial: 64-year-old man, anterior STEMI, 4 hours of pain; diabetic, smoker, 85 kg. Aspirin and ticagrelor 180 mg given; heparin 70 units/kg at the start of the case, 50 minutes ago (ACT then 276 s).'],
      ['team', 'The proximal LAD was occluded with a heavy clot burden. The wire is across; two aspiration runs and a 2.5 mm balloon have brought flow back to the apex. Next: a 3.5 × 28 mm drug-eluting stent.'],
      ['scene', 'He is awake and sweaty; the pain has eased to 3 out of 10.'],
      ['team', 'You are the procedural nurse: the drugs the cardiologist orders, and his rhythm, pressure and comfort. The tech is scrubbed at the table.'],
    ],
    5: [
      ['team', 'Primary PCI from the right radial: 64-year-old man, anterior STEMI, 4 hours of pain; diabetic, smoker, 85 kg. Aspirin and ticagrelor 180 mg given; heparin 70 units/kg at the start of the case, 50 minutes ago (ACT then 276 s).'],
      ['team', 'The proximal LAD was occluded with a heavy clot burden. The wire is across; two aspiration runs and a 2.5 mm balloon have brought flow back to the apex. Next: a 3.5 × 28 mm drug-eluting stent.'],
      ['scene', 'He is awake and sweaty; the pain has eased to 3 out of 10.'],
      ['team', 'You are the interventional cardiologist: every choice from here is yours. The tech and the nurse are with you.'],
    ],
  },
  initial: {
    rhythm: { profile: 'anterior-stemi-reperfused', hr: 88 },
    vitals: { sbp: 118, dbp: 72, spo2: 96, rr: 18, etco2: 34, pain: 3, gcs: 15, glucose: 186, temp: 36.7 },
  },
  // what the built-in safety rules read (types.ts Problem)
  problems: ['acs'],
  facts: {
    allergies: 'No allergies. Yes — do whatever you need to.',
    sample: 'No allergies. Metformin and lisinopril. Diabetes and high blood pressure; a pack a day.',
    opqrst: (s) => (has(s, 'no-reflow') && !has(s, 'reflow')
      ? 'It\'s back — crushing, in the middle of my chest, like this morning.'
      : 'Crushing, in the middle of my chest, since this morning — four hours. It eased off when you opened it up.'),
    labs: 'Glucose 186, creatinine 1.1, potassium 4.3, hemoglobin 14.6, platelets 260. Troponin very high.',
    lungs: 'A few crackles at both bases.',
    ecg12: (s) => (s.rhythm.profile === 'anterior-stemi'
      ? `Sinus rhythm ${s.rhythm.hr}: the ST segments in V1–V4 are back up, with reciprocal depression in III and aVF — the anterior wall is ischemic again.`
      : `Sinus rhythm ${s.rhythm.hr}: the ST elevation in V1–V4 has come down by more than half, with early T-wave inversion — the anterior wall is reperfused.`),
    echo: 'Anterior, septal and apical akinesis; LVEF about 35 %. No pericardial effusion, no ventricular septal defect, no severe mitral regurgitation.',
    // the same large anterior infarct the echo shows: a stiff, failing left ventricle, worse while the flow is stalled
    lvgram: 'LV gram: the anterior wall and the apex barely move; EF about 35 %; no mitral regurgitation.',
    lvedp: (s) => (stalled(s) ? `LV ${s.vitals.sbp}/30 mmHg: LVEDP 30 mmHg.` : `LV ${s.vitals.sbp}/22 mmHg: LVEDP 22 mmHg.`),
    rhc: (s) => (stalled(s)
      ? 'RA 9 · RV 36/9 · PA 36/24 (mean 28) · PCWP 26 · CO 3.9 L/min, CI 1.9.'
      : 'RA 7 · RV 32/7 · PA 32/20 (mean 24) · PCWP 20 · CO 4.6 L/min, CI 2.2.'),
    final: FINAL_LINE,
  },
  status: (s) => {
    if (!s.pulse) return 'Unresponsive.';
    if (has(s, 'reflow')) return '"The pain\'s nearly gone."';
    if (has(s, 'no-reflow')) return '"It\'s crushing again — like before you started."';
    return '"Better than it was — about a 3."';
  },
  respond: {
    act: (s) => act(s, 'you'),
    heparin: () => ({ say: [['you', 'Heparin 3,000 units IV, flushed.']], flags: ['heparin', 'heparin-topup'] }),
    'stent-des': (s) => {
      if (has(s, 'no-reflow')) return moreMetal(s, 'Another drug-eluting stent');
      return s.role === 5 ? { say: [['you', 'Drug-eluting stent, 3.5 × 28, deployed at 14 atmospheres.']], flags: ['stented', 'pci'] } : null;
    },
    'balloon-nc': (s) => moreMetal(s, 'A non-compliant balloon'),
    'balloon-predil': (s) => moreMetal(s, 'A compliant balloon'),
    ivus: (s) => {
      if (!has(s, 'wired')) return null;
      const prep: Line[] = s.role === 3 ? [['you', 'IVUS catheter flushed, prepped and handed up; pullback set.']] : [];
      if (!has(s, 'no-reflow')) return { say: [...prep, [s.role === 3 ? 'operator' : 'monitor', IVUS_BEFORE]], flags: ['ivus'] };
      return { say: [...prep, [s.role === 3 ? 'operator' : 'monitor', IVUS_AFTER]], flags: ['ivus', 'mech-excluded'] };
    },
    oct: (s) => {
      if (!has(s, 'wired')) return null;
      const prep: Line[] = s.role === 3 ? [['you', 'OCT catheter flushed, prepped and handed up; contrast flush loaded.']] : [];
      if (!has(s, 'no-reflow')) return { say: [...prep, [s.role === 3 ? 'operator' : 'monitor', OCT_BEFORE]], flags: ['oct'] };
      return { say: [...prep, [s.role === 3 ? 'operator' : 'monitor', OCT_AFTER]], flags: ['oct', 'mech-excluded'] };
    },
    ...Object.fromEntries(LEFT_VIEWS.map((id) => [id, (s: SimState) => viewOfStent(s, id, INTERVENTION_BY_ID[id].label.split(' — ')[0])])),
    aspiration: (s) => {
      if (s.role !== 5 || !has(s, 'wired')) return null;
      if (!has(s, 'no-reflow')) return { say: [['you', 'Another aspiration run: a few small red fragments; the flow looks the same.']], flags: ['aspirated'] };
      return {
        say: [['you', 'Aspiration catheter through the stent into the distal LAD: a few small fragments, and the flow is no different. Its tip now sits beyond the stent: a drug given through it goes straight into the stalled bed.']],
        flags: ['aspirated', ...(has(s, 'reflow') ? [] : ['distal-catheter'])],
      };
    },
    'ic-epinephrine': (s) => (stalled(s) ? epinephrine(s, 'learner') : null),
    'ic-adenosine': (s) => {
      if (!s.pulse) return pulseless('Intracoronary adenosine', 'ic-adenosine');
      return stalled(s) ? adenosine(s, 'learner') : null;
    },
    'ic-verapamil': (s) => {
      if (!s.pulse) return pulseless('Intracoronary verapamil', 'ic-verapamil');
      if (!stalled(s)) return null;
      // it relaxes the arterioles, and it lowers the pressure and slows the AV node as it washes through
      const bp = bpAfter(s, -8, -5);
      const hr = Math.max(60, s.rhythm.hr - 6);
      return microDrug(s, 'learner', 'Verapamil 200 mcg', bp, hr, [['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`]], ['ic-verapamil']);
    },
    'ic-nitroprusside': (s) => {
      if (!stalled(s)) return null;
      const bp = bpAfter(s, -12, -8);
      return microDrug(s, 'learner', 'Nitroprusside 100 mcg', bp, s.rhythm.hr, [['monitor', `BP ${bp.sbp}/${bp.dbp}.`]], ['ic-nitroprusside']);
    },
    'ic-nitro': (s) => {
      if (!stalled(s)) return null;
      // it widens the big artery, which is already open: the pressure falls and the flow beyond is no different
      const bp = bpAfter(s, -10, -6);
      return {
        say: [...given(s, 'learner', 'Nitroglycerin 200 mcg'), ['monitor', `BP ${bp.sbp}/${bp.dbp}.`], [runner(s), 'Next run: no change — the contrast still creeps beyond the stent and hangs there.', 'bad']],
        vitals: bp, flags: ['ic-nitro'],
      };
    },
    pressor: (s) => {
      if (!s.pulse || !has(s, 'no-reflow')) return null;
      // norepinephrine to a mean of 65 or more: it never brings a higher pressure down
      const sbp = Math.max(s.vitals.sbp, 96);
      const dbp = Math.max(s.vitals.dbp, 58);
      return { say: [['you', 'Norepinephrine 0.05 mcg/kg/min running.'], ['monitor', `BP ${sbp}/${dbp}.`]], vitals: { sbp, dbp }, flags: ['pressor', 'supported', 'pressure-up'] };
    },
    'push-epi': (s) => {
      if (!s.pulse || !has(s, 'no-reflow')) return null;
      const bp = bpAfter(s, 16, 10);
      return { say: [['you', 'Push-dose epinephrine 20 mcg IV.'], ['monitor', `BP ${bp.sbp}/${bp.dbp} for a few minutes.`]], vitals: bp, flags: ['push-epi', 'supported', 'pressure-up'] };
    },
    // a phenylephrine bolus raises the aortic (so the coronary perfusion) pressure as push-dose epinephrine does, without its
    // rate: it holds the pressure up for a few minutes (the flow still needs the intracoronary drugs)
    phenylephrine: (s) => {
      if (!s.pulse || !has(s, 'no-reflow')) return null;
      const bp = bpAfter(s, 16, 10);
      return { say: [['you', 'Phenylephrine 100 mcg IV, flushed.'], ['monitor', `BP ${bp.sbp}/${bp.dbp} for a few minutes.`]], vitals: bp, flags: ['phenylephrine', 'supported', 'pressure-up'] };
    },
    // a pump holds the pressure up once it is in (it takes minutes), so the pressure does not keep falling under it;
    // it does nothing for the plugged microvessels. Both need a femoral artery: the case runs from the radial.
    iabp: (s) => {
      if (s.role !== 5 || !stalled(s)) return null;
      const bp = bpAfter(s, 6, 8, { sbp: 140, dbp: 90 });
      return {
        say: [['you', 'IABP in from the right femoral artery, tip 2 cm below the left subclavian; 1:1 with diastolic augmentation.'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`]],
        vitals: bp, flags: ['iabp', 'mcs', 'supported', 'pressure-up'],
      };
    },
    impella: (s) => {
      if (s.role !== 5 || !stalled(s)) return null;
      const bp = bpAfter(s, 14, 10, { sbp: 140, dbp: 90 });
      return {
        say: [['you', 'Impella CP across the aortic valve from the right femoral artery; P-6, flow 3.3 L/min.'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`]],
        vitals: bp, flags: ['impella', 'mcs', 'supported', 'pressure-up'],
      };
    },
    // the first run is already on the Imaging screen: another diagnostic run is a fresh look in standard views, described
    // in words (the real first-run image belongs to the occluded artery, before the wire)
    angio: (s) => {
      if (!s.pulse) return { blocked: true, say: [['system', 'Not during the arrest: treat the rhythm first.']] };
      const run = { id: 'angio', view: 'Diagnostic angiography: both coronaries in standard views' };
      if (stalled(s)) {
        return {
          say: [['you', 'Both coronaries in standard views: the stent edges are smooth — no flap, no contrast staining outside the lumen, no filling defect in the stent. Beyond it the LAD contrast still crawls. The right coronary has mild disease only.']],
          image: run, flags: ['cine', 'mech-excluded'],
        };
      }
      return {
        say: [['you', has(s, 'reflow')
          ? 'Both coronaries in standard views: the LAD fills briskly through the stent to the apex; the right coronary has mild disease only.'
          : 'Both coronaries in standard views: the LAD is open to the apex after the balloon, with clot still lining its proximal segment; the right coronary has mild disease only.']],
        image: run, flags: ['cine'],
      };
    },
    'final-angio': (s) => {
      if (!has(s, 'reflow')) return { blocked: true, say: [['system', s.role === 5 ? 'Not the final pictures yet: the flow is not back.' : 'The operator is not ready for the final pictures yet.']] };
      return s.role === 5 ? { say: [['you', FINAL_LINE, 'good']], image: { id: 'final-angio', view: 'Final angiogram' }, flags: ['final-angio'] } : null;
    },
    callout: (s) => {
      if (has(s, 'adenosine-pause') && !has(s, 'pause-called')) return { say: [['operator', 'Thanks — that\'s the adenosine; he\'s back already. Keep watching.']], flags: ['callout', 'pause-called'] };
      if (has(s, 'no-reflow') && !has(s, 'no-reflow-called')) return { say: [['operator', 'I see it — thanks. Keep calling the pressure.']], flags: ['callout', 'no-reflow-called'] };
      return null;
    },
    defib: shockOutcome,
    aed: shockOutcome,
  },
  events: [
    {
      // where the case stands: set up, anticoagulated and loaded, the wire across, the clot debulked — and the first run to read
      id: 'setup', when: () => true,
      effect: () => ({
        ...firstRun,
        flags: ['consent', 'timeout', 'iv', 'prep', 'transducer', 'monitor', 'pads', 'access', 'catheter', 'angio', 'heparin', 'p2y12',
          'guide', 'guide-left', 'view-set', 'wired', 'predilated', 'aspirated', 'cine'],
      }),
    },
    ...TECH_ASKS.flatMap(askEvents),
    ...RN_ASKS.flatMap(askEvents),
    {
      id: 'rn-topup-for-tech', when: (s) => s.role === 3 && has(s, 'act-low') && !has(s, 'heparin-topup'),
      effect: () => ({ say: [['team', 'Nurse: "Heparin 3,000 units in, on the doctor\'s order."']], flags: ['heparin-topup'] }),
    },
    {
      id: 'md-stent', when: (s) => s.role !== 5 && !has(s, 'pci') && (s.role === 4 ? has(s, 'heparin-topup') && s.minute >= s.flags['heparin-topup'] + 1 : has(s, 'stent-in-hand')),
      effect: () => ({ say: [['operator', 'Stent deployed at 14 atmospheres.']], flags: ['stented', 'pci'] }),
    },
    {
      // the stent crushes the clot into the wall and sends clot and debris downstream: the microvessels plug
      id: 'no-reflow', when: (s) => has(s, 'pci') && s.pulse,
      effect: (s) => {
        const sbp = Math.min(s.vitals.sbp, 86);
        const dbp = Math.min(s.vitals.dbp, 54);
        return {
          say: [
            [runner(s), 'Post-stent runs: the first fills the LAD; a minute later the next one crawls — the stent segment looks open, but the contrast creeps down the vessel and stalls, the apex never fills, the muscle does not blush, and the dye is still sitting there several beats later.'],
            ['monitor', `Heart rate 108. BP ${sbp}/${dbp}; the aortic waveform keeps its shape.`, 'bad'],
            ['patient', '"The pain\'s back — as bad as this morning!"'],
            ...(s.role === 5 ? [line('team', `Tech: "Doctor — pressure's ${sbp}!"`, 'warn')] : []),
          ],
          rhythm: { profile: 'anterior-stemi', hr: 108 }, vitals: { sbp, dbp, pain: 8 }, flags: ['no-reflow'], read: noReflowRead,
        };
      },
    },
    {
      // the real post-stent runs, once the learner has named what they show (the findings are printed on the image)
      id: 'no-reflow-run', when: (s) => s.reads.some((r) => r.answer === 'clin-no-reflow'),
      effect: () => ({ say: [['monitor', 'Cine recorded: the post-stent runs (Imaging).']], image: { id: 'no-reflow', view: 'The runs after the stent', image: IMAGES['no-reflow'] } }),
    },
    {
      id: 'md-ivus-for-rn', when: (s) => s.role === 4 && has(s, 'epi-given') && !has(s, 'mech-excluded') && s.minute >= s.flags['epi-given'] + 1,
      effect: () => ({ say: [['operator', 'IVUS: the stent is well expanded and apposed, no dissection at either edge, no clot inside it. Nothing mechanical.']], flags: ['ivus', 'mech-excluded'] }),
    },
    {
      id: 'md-final', when: (s) => s.role !== 5 && has(s, 'reflow') && !has(s, 'final-angio'),
      effect: () => ({ say: [['operator', FINAL_LINE, 'good']], image: { id: 'final-angio', view: 'Final angiogram' }, flags: ['final-angio'] }),
    },
    {
      // nothing holds the pressure up: the stalled bed and the failing anterior wall drag it down (never up from a lower one)
      id: 'pressure-falls', when: (s) => stalled(s) && !has(s, 'supported') && s.minute >= s.flags['no-reflow'] + 3,
      effect: (s) => {
        const sbp = Math.min(s.vitals.sbp, 74);
        const dbp = Math.min(s.vitals.dbp, 46);
        return {
          say: [
            ['monitor', `Heart rate 116. BP ${sbp}/${dbp}.`, 'bad'],
            ...awake(s, 'I feel faint…'),
            ...(s.role === 5 ? [line('team', `Nurse: "Doctor — ${sbp} systolic!"`, 'warn')] : []),
          ],
          rhythm: { ...s.rhythm, hr: 116 }, vitals: { sbp, dbp, pain: 9, gcs: 14 },
        };
      },
    },
    {
      // the ischemic anterior wall fibrillates if nothing has been done for the microvessels
      id: 'vf', when: (s) => stalled(s) && !has(s, 'micro-1') && s.minute >= s.flags['no-reflow'] + 6,
      effect: (s) => ({
        say: [['monitor', 'Monitor alarm — he is unresponsive!', 'bad'], ...(s.role === 5 ? [line('team', 'Tech: "Doctor — look at the monitor!"', 'bad')] : [])],
        rhythm: { profile: 'vf', hr: 0 }, pulse: false, flags: ['vf'],
      }),
    },
  ],
  critical: [
    ...TECH_ASKS.map(askCritical),
    ...RN_ASKS.map(askCritical),
    { id: 'md-act', label: 'Check the ACT', why: 'Fifty minutes after the heparin bolus, in an artery full of clot: the ACT should be 250–300 s (200–250 s with a GP IIb/IIIa inhibitor) before more devices go in — and while the flow is stalled.', done: ['act'], roles: MD, points: 5, target: { within: { flag: 'no-reflow', minutes: 6 } } },
    // with a GP IIb/IIIa inhibitor started the target is 200–250 s, so the ACT of 212 is in range without more heparin
    { id: 'md-heparin', label: 'Top up the heparin for an ACT under 250', why: 'A 2,000–3,000 unit bolus brings the ACT back to 250–300 s; with it low, clot forms on the wire and the stent — and in the small vessels beyond. (With a GP IIb/IIIa inhibitor running, 200–250 s is enough; bivalirudin replaces the heparin.)', done: ['heparin', 'bivalirudin', 'gp2b3a'], after: 'act-low', roles: MD, points: 5, target: { within: { flag: 'act-low', minutes: 3 } }, applies: (s) => has(s, 'act-low') },
    { id: 'md-stent', label: 'Stent the culprit', why: 'A drug-eluting stent sized to the vessel once the clot has been debulked and the flow is back.', done: ['stent-des'], roles: MD, points: 5 },
    { id: 'callout-no-reflow', label: 'Call out the falling pressure and the returning pain at once', why: 'The pressure falling to 86, the pain back and the ST segments up again right after the stent: say it out loud so the whole team switches to the problem.', done: ['callout'], after: 'no-reflow', roles: [3, 4], points: 10, target: { within: { flag: 'no-reflow', minutes: 1 } }, applies: (s) => has(s, 'no-reflow') },
    {
      // counted from when the pressure is held up ('supported': a drug once given with a pulse, a pump once it is working —
      // a drug pushed in VF holds nothing up); flow brought back within the 3 minutes brings the pressure back with it, so a
      // learner who fixed the cause that fast has not neglected the pressure
      id: 'md-support', label: 'Support the pressure (intracoronary epinephrine or a pressor)', roles: MD, points: 10, target: { within: { flag: 'no-reflow', minutes: 3 } }, applies: (s) => has(s, 'no-reflow'),
      why: 'Flow through the damaged bed depends on the aortic pressure, and a systolic of 86 makes no-reflow worse. Intracoronary epinephrine lifts it and opens the microvessels; norepinephrine if more is needed.',
      done: (s) => {
        const back = has(s, 'reflow') && s.flags.reflow <= s.flags['no-reflow'] + 3 ? startedAt(s, 'reflow', MICRO) : null;
        return earliest(startedAt(s, 'supported', ['ic-epinephrine', 'pressor', 'push-epi', 'phenylephrine']), back);
      },
      uses: SUPPORT,
    },
    {
      id: 'md-exclude', label: 'Rule out a dissection, clot or spasm (IVUS, OCT or another view)', roles: MD, points: 15, target: { within: { flag: 'no-reflow', minutes: 6 } }, applies: (s) => has(s, 'no-reflow'),
      why: 'Slow flow after a stent can be mechanical — an edge dissection, clot in the stent, spasm, a wedged guide — and that needs a different fix: a dissection needs a stent, no-reflow never does. IVUS or OCT shows the stent and its edges; at the least, look in a second projection.',
      done: (s) => firstDone(s, ['ivus', 'oct', 'angio', ...LEFT_VIEWS], 'no-reflow'), uses: ['ivus', 'oct', 'angio', ...LEFT_VIEWS],
    },
    {
      id: 'md-micro', label: 'An intracoronary drug for the microvessels', roles: MD, points: 15, target: { within: { flag: 'no-reflow', minutes: 4 } }, applies: (s) => has(s, 'no-reflow'),
      why: 'Adenosine, verapamil and nitroprusside open the arterioles; epinephrine does too and lifts the pressure — the one to use with a systolic under 90. Nitroglycerin works on the big artery, not the microvessels.',
      // 'micro-1': the first dose that reached the stalled bed (one pushed during VF, with no circulation, reaches nothing)
      done: (s) => startedAt(s, 'micro-1', MICRO), uses: MICRO,
    },
    {
      id: 'md-reflow', label: 'Keep treating until the flow is back', roles: MD, points: 10, target: { within: { flag: 'no-reflow', minutes: 10 } }, applies: (s) => has(s, 'no-reflow'),
      why: 'One bolus is often not enough: repeat it or add another drug (adenosine, verapamil or nitroprusside once the pressure allows), ideally delivered beyond the stent, until the LAD fills briskly.',
      done: (s) => startedAt(s, 'reflow', MICRO), uses: MICRO,
    },
    { id: 'callout-pause', label: 'Call out the pause after the adenosine', why: 'Intracoronary adenosine often blocks the AV node for a few seconds. Say it out loud ("pause — eight seconds — back"): it usually passes by itself; if it does not, atropine or pacing.', done: ['callout'], after: 'adenosine-pause', roles: [3, 4], points: 10, target: { within: { flag: 'adenosine-pause', minutes: 1 } }, applies: (s) => has(s, 'adenosine-pause') },
    { id: 'defib', label: 'Defibrillate VF within 1 minute', why: 'In the lab, VF is witnessed with the pads on: shock it within seconds.', done: ['defib', 'aed'], after: 'arrest', points: 15, target: { within: { flag: 'arrest', minutes: 1 } }, applies: (s) => has(s, 'arrest') },
    { id: 'final', label: 'Final angiogram once the flow is back', why: 'Confirm TIMI 3 flow and a myocardial blush, and look at the stent edges once more, before you leave the vessel.', done: ['final-angio'], after: 'reflow', roles: MD, points: 5, applies: (s) => has(s, 'reflow') },
    { id: 'post-ecg', label: '12-lead once the flow is back', why: 'The ST elevation coming down again confirms the muscle is reperfused; it is the baseline for the CCU.', done: ['ecg12', 'ecg12-repeat'], after: 'reflow', points: 5, applies: (s) => has(s, 'reflow') },
    { id: 'echo', label: 'Echocardiogram after the procedure', why: 'No-reflow means a bigger infarct: LV function, and no mechanical complication, guide what comes next.', done: ['echo'], after: 'reflow', roles: MD, points: 5, applies: (s) => has(s, 'reflow') },
    { id: 'hemostasis', label: 'Radial band and distal perfusion check', why: 'Patent hemostasis, as always — with full anticoagulation and two antiplatelet drugs on board.', done: ['hemostasis'], after: 'final-angio', roles: [3, 4], points: 5, applies: (s) => has(s, 'final-angio') },
    { id: 'handoff', label: 'Hand-off to the cardiac care unit', why: 'The no-reflow, every drug and dose and when, the final flow, the ACT and the heparin, the access site — and that the infarct is likely bigger than it looked: watch for heart failure and arrhythmias.', done: ['handoff'], roles: [4, 5], points: 5 },
  ],
  harms: [
    { id: 'nitro-low-pressure', actions: ['nitro', 'nitro-high', 'ic-nitro'], replaces: ['nitro-hypotension'], when: (s) => s.pulse && s.vitals.sbp < 90, points: 8, severity: 'major', text: 'Nitroglycerin with a systolic pressure under 90 mmHg. It drops the pressure further and does not treat no-reflow: it widens the big artery, which is already open, not the small vessels beyond it. Support the pressure and use intracoronary epinephrine.' },
    { id: 'verapamil-low-pressure', actions: ['ic-verapamil'], when: (s) => s.pulse && s.vitals.sbp < 90, points: 6, severity: 'major', text: 'Intracoronary verapamil with a systolic pressure under 90 mmHg. It relaxes the vessels and weakens the squeeze, so the pressure falls further — and a lower perfusion pressure makes no-reflow worse. Support the pressure first, or use intracoronary epinephrine.' },
    { id: 'stent-for-no-reflow', actions: ['stent-des'], roles: MD, when: (s) => has(s, 'no-reflow'), points: 10, severity: 'major', text: 'Another stent for slow flow in an artery that is already open. Unless imaging shows a dissection or clot at the stent, the obstruction is in the small vessels beyond it: more metal pushes more debris downstream and fixes nothing.' },
    { id: 'balloon-for-no-reflow', actions: ['balloon-predil', 'balloon-nc'], roles: MD, when: (s) => has(s, 'no-reflow'), points: 5, severity: 'minor', text: 'More balloon inflations for slow flow in a well-expanded stent. The obstruction is beyond the stent; every inflation squeezes more debris downstream.' },
    // the tech only opens it — the operator refuses it and nothing reaches the patient — so a smaller penalty than the operator's
    { id: 'tech-unasked-metal', actions: ['stent-des', 'balloon-predil', 'balloon-nc'], roles: TECH, when: (s) => has(s, 'no-reflow'), points: 3, severity: 'minor', text: 'A stent or balloon opened that the operator did not ask for, while the flow was stalled. The artery is open: more metal pushes more debris downstream and fixes nothing. Open devices when the operator asks for them.' },
    // judged on the real ACT (212 s 50 minutes after the bolus), checked or not
    { id: 'stent-act-low', actions: ['stent-des'], roles: MD, when: (s) => !has(s, 'pci') && !has(s, 'heparin-topup') && !has(s, 'bivalirudin') && !has(s, 'gp2b3a'), points: 3, severity: 'minor', text: 'The stent went in with the ACT below range (212 s, 50 minutes after the heparin bolus). Check the ACT before more devices go in and top up the heparin when it is under 250 s: with it low, clot forms on the wire, in the stent and in the small vessels beyond.' },
    { id: 'epi-no-indication', actions: ['ic-epinephrine'], when: (s) => s.pulse && !stalled(s), points: 3, severity: 'minor', text: 'Intracoronary epinephrine with the flow and the pressure normal. It is for no-reflow, above all with a low pressure; without it, it only speeds the heart and raises the pressure and the oxygen need of an infarcting heart.' },
    { id: 'covered-no-perforation', actions: ['stent-covered'], roles: [3, 5], when: (s) => !has(s, 'perforation'), points: 4, severity: 'minor', text: 'A covered stent without a perforation. Covered stents seal perforations; they restenose and clot more than drug-eluting stents.' },
    { id: 'protamine-in-thrombus', actions: ['protamine'], points: 10, severity: 'major', text: 'Protamine in the middle of a thrombotic PCI. Reversing the heparin lets clot form on the wire, in the fresh stent and in the small vessels: no-reflow needs full anticoagulation (ACT 250–300 s).' },
    { id: 'lytic-in-lab', actions: ['tnk'], points: 15, severity: 'critical', text: 'A systemic fibrinolytic in the lab. On top of heparin and two antiplatelet drugs it adds major bleeding risk; no-reflow is treated with intracoronary drugs.' },
    { id: 'beta-blocker', actions: ['metoprolol'], points: 8, severity: 'major', text: 'An IV beta-blocker in a large anterior STEMI with crackles at both lung bases. With heart failure signs, a low output or a falling pressure it takes away output the heart needs and risks cardiogenic shock (COMMIT); IV beta-blockers are not routine in STEMI.' },
    { id: 'oxygen-normoxic', actions: ['o2-nc', 'o2-nrb'], when: (s) => s.pulse && s.vitals.spo2 >= 90, points: 2, severity: 'minor', text: 'Oxygen with an SpO₂ of 90 % or more. Oxygen is for SpO₂ below 90 %.' },
    askHarm(TECH_ASKS[1], 'The wrong device when the operator asked for a drug-eluting stent. Check the order and the box before you open it.'),
    { ...askHarm(TECH_ASKS[2], 'Adenosine when the operator asked for epinephrine with a pressure of 86. Adenosine lowers the pressure, it does not hold it up. Read the order back and check the syringe label before you hand it up.'), actions: ['ic-adenosine'] },
    askHarm(TECH_ASKS[4], 'The wrong intracoronary drug when the operator asked for adenosine. Read the order back and check the syringe label before you hand it up.'),
    { ...askHarm(RN_ASKS[2], 'Adenosine when the operator asked for an intracoronary drug that brings a pressure of 86 up. Adenosine is a vasodilator: of the intracoronary drugs only epinephrine raises the pressure.'), actions: ['ic-adenosine'] },
    askHarm(RN_ASKS[3], 'An IV dose of adenosine when the operator asked for 200 micrograms into the coronary. The 6–12 mg rapid push is the SVT dose and the IV infusion is for FFR — neither is what was ordered for the microvessels.'),
  ],
  timings: [
    // when the pressure came back up: by a drug or a pump, or with the flow
    { label: 'Pressure held up', actions: [], flag: 'pressure-up', target: 3, from: 'no-reflow' },
    { label: 'First drug for the microvessels', actions: MICRO, target: 4, from: 'no-reflow' },
    { label: 'Flow back', actions: [], flag: 'reflow', target: 10, from: 'no-reflow' },
  ],
  deathAfter: 8,
  completeWhen: (s) => has(s, 'reflow') && has(s, 'final-angio'),
  teaching: [
    'No-reflow: the artery is open — no dissection, clot or spasm in it — but the flow beyond is slow (TIMI 2 or less, or a poor myocardial blush) because the microvessels are plugged: clot and plaque debris swept downstream, platelet plugs, spasm and swelling. The pain and the ST elevation come back, the pressure falls, and VF can follow.',
    'Risk: a heavy thrombus burden, a long ischemic time, diabetes, a large anterior infarct, aggressive dilation in fresh clot. Keep the ACT at 250–300 s on heparin alone (200–250 s with a GP IIb/IIIa inhibitor).',
    'Rule out a mechanical cause first — an edge dissection, clot in the stent, spasm, a wedged guide (a damped pressure) — with IVUS or OCT, or at least a second projection. A dissection needs a stent; no-reflow never does.',
    'Hold the pressure up: flow through the damaged bed depends on it. With a systolic under 90, intracoronary epinephrine (50–100 mcg boluses, repeated as needed) lifts the pressure and opens the microvessels; add norepinephrine if needed.',
    'Then the microvascular vasodilators, repeated or combined until the flow is back: adenosine 100–200 mcg boluses, verapamil 100–200 mcg, nitroprusside 50–200 mcg. Give them beyond the stent when you can (a microcatheter, or the aspiration catheter): a bolus into the guide while nothing runs off mostly washes back into the aorta.',
    'The evidence is thin: no drug has been shown to lower mortality. In randomized trials pooled in a 2026 network meta-analysis, intracoronary epinephrine and verapamil improved the final TIMI 3 flow; adenosine improved ST resolution but did not clearly improve the final flow.',
    'Nitroglycerin widens the big artery, not the microvessels: it does not treat no-reflow, and with a low pressure it is harmful. Verapamil and nitroprusside also lower the pressure — not with a systolic under 90.',
    'Intracoronary adenosine often brings a few seconds of AV block or a pause (most of all in the right coronary): call it out; it passes by itself. Verapamil can block for longer.',
    'Do not add stents or balloon inflations for slow flow in an open, undissected artery: more metal and more pressure push more debris downstream.',
    'Routine aspiration thrombectomy brings no benefit (TASTE, TOTAL); keep it for a large residual thrombus, where the catheter can also carry drugs beyond the stent. A GP IIb/IIIa inhibitor is a bail-out for heavy thrombus.',
  ],
};

