import type { Effect, Scenario, SimState } from '../types';
import { has, line } from '../kit';
import {
  LAD_VIEWS, LEFT_GUIDES, MD, RCA_VIEWS, RIGHT_GUIDES, RN, TECH, WIRES, angioGate, anticoagulated, askCritical, askEvents, askHarm, cine,
  doneAfter, nextStep, type LabAsk,
} from '../labKit';

/** Real angiograms for this patient: cine view id → key of CATH_IMAGES (a run without one is described in words) */
const IMAGES: Partial<Record<string, string>> = { angio: 'rca-occlusion', 'final-angio': 'rca-open-timi3' };

const angioRun = (who: 'you' | 'operator') => cine('angio', 'Diagnostic angiography: left and right coronaries', IMAGES.angio, [
  [who, 'Left system: mild disease only. The right coronary stops dead in its proximal segment — TIMI 0. That is the culprit.'],
], {
  kind: 'angio', answer: 'angio-rca-occlusion', prompt: 'What does the right coronary run show?',
  explain: 'The RCA is occluded proximally (TIMI 0): the culprit of this inferior STEMI, and proximal enough to take the RV branches — hence the RV infarct.',
}, [[who, 'Left coronary: mild disease only. The right coronary run is on the Imaging screen.']]);

const finalRun = (who: 'you' | 'operator') => cine('final-angio', 'Final angiogram: the RCA in two views', IMAGES['final-angio'], [
  [who, 'RCA wide open to the crux: TIMI 3 flow, the RV branches filling, no dissection.', 'good'],
], {
  kind: 'angio', answer: 'angio-timi3', prompt: 'What does the final run show?',
  explain: 'TIMI 3 flow down the RCA to the crux, with the RV branches filling again.',
});

/** Reperfusion of the inferior wall: sudden bradycardia and vasodilation */
const reflexRead = {
  kind: 'clinical' as const, answer: 'clin-bezold', partial: ['clin-vasovagal'], prompt: 'What is happening to her?',
  explain: 'The Bezold–Jarisch reflex: reflow into the inferior wall fires vagal reflexes from the LV — sudden bradycardia and vasodilation. Atropine for the rate, fluid for the pressure (her RV is preload-dependent), pacing if the rate does not come back.',
};

/** In the reflex, atropine brings the rate back and fluid the pressure */
const atropine = (s: SimState): Effect | null => has(s, 'bezold') && !has(s, 'bj-atropine')
  ? { say: [['monitor', `Heart rate 72. BP ${s.vitals.sbp}/${s.vitals.dbp}.`]], rhythm: { ...s.rhythm, hr: 72 }, flags: ['atropine', 'bj-atropine'] }
  : null;
const fluid = (s: SimState): Effect | null => {
  const v = s.vitals;
  if (has(s, 'bezold') && !has(s, 'bj-fluid')) return { say: [['monitor', `Fluid running wide open. BP ${v.sbp + 16}/${v.dbp + 10}.`]], vitals: { sbp: v.sbp + 16, dbp: v.dbp + 10 }, flags: ['fluid', 'bj-fluid'] };
  return { say: [['monitor', `Bolus in. BP ${Math.min(130, v.sbp + 10)}/${Math.min(80, v.dbp + 6)}.`]], vitals: { sbp: Math.min(130, v.sbp + 10), dbp: Math.min(80, v.dbp + 6) }, flags: ['fluid'] };
};
const nitroCrash = (s: SimState): Effect => ({
  say: [['monitor', 'BP 72/42.', 'bad'], ['patient', '"I feel like I\'m going to pass out…"']], vitals: { sbp: 72, dbp: 42 }, flags: ['nitro'],
});

const TECH_ASKS: LabAsk[] = [
  {
    id: 'left-diag', when: (s) => has(s, 'access'), early: true,
    ask: 'JL4 first, please — the left coronary, so we know what else is there.',
    accept: ['cath-jl4'], wrong: ['cath-jr4', 'cath-pigtail'],
    wrongSay: 'That is not the JL4. Left coronary first: the Judkins left, size 4.',
    thanks: 'JL4 — thanks.', fallback: 'I\'ll get the JL4 myself.', gives: 'left-diag-given',
    label: 'Diagnostic catheter for the left coronary (JL4)',
    why: 'From the femoral artery, a Judkins left 4 drops into the left main by itself; the Judkins right 4 needs a turn to find the right coronary.',
  },
  {
    id: 'right-diag', when: (s) => has(s, 'left-diag-given'), early: true,
    ask: 'Left system is fine. Now the right coronary, please.',
    accept: ['cath-jr4'], wrong: ['cath-pigtail', 'cath-tiger'],
    wrongSay: 'For the right coronary from the groin: a JR4, please.',
    thanks: 'JR4 — thanks.', fallback: 'I\'ll open the JR4 myself.', gives: 'right-diag-given',
    label: 'Diagnostic catheter for the right coronary (JR4)',
    why: 'The Judkins right 4 is the standard catheter for the right coronary: a clockwise turn swings its tip into the RCA ostium.',
  },
  {
    id: 'guide', when: (s) => has(s, 'angio'), early: true,
    ask: 'The RCA is the culprit. A guide for the right coronary, please — with good back-up.',
    accept: RIGHT_GUIDES, wrong: LEFT_GUIDES,
    wrongSay: 'That is a left-system guide — it won\'t sit in the right coronary. JR4 or AL1, please.',
    thanks: 'Thanks — engaging the RCA.', fallback: 'I\'ll get the guide myself — we are losing time.', gives: 'guide-in-hand',
    label: 'A guide for the right coronary (JR4 or AL1)', points: 10,
    why: 'JR4 guides sit in most right coronaries; an Amplatz left 1 (AL1) gives extra back-up when the RCA is hard to cross. An EBU is a left-system shape.',
  },
  {
    id: 'view', when: (s) => has(s, 'guide'),
    ask: 'Working view for the RCA, please.',
    accept: RCA_VIEWS, wrong: [...LAD_VIEWS, 'view-rao-caudal', 'view-lao-caudal'],
    wrongSay: 'That is a left-system view. For the RCA: LAO, RAO — or cranial for the crux.',
    thanks: 'That is my view.', fallback: 'I\'ll take the table-side controls: LAO 30.', gives: 'view-set',
    label: 'Working view for the RCA',
    why: 'LAO shows the whole RCA as a "C"; RAO shows its mid segment and the PDA; AP cranial opens up the crux. Left-system views show nothing of the RCA.',
  },
  {
    id: 'wire', when: (s) => has(s, 'view-set'),
    ask: 'Workhorse wire.',
    accept: ['wire-workhorse'], wrong: ['wire-hydrophilic'],
    wrongSay: 'Not a hydrophilic wire first — a workhorse, please.',
    thanks: 'Thanks. Crossing.', fallback: 'I\'ll get the wire myself.', gives: 'wire-in-hand',
    label: 'Workhorse coronary wire',
    why: 'A soft-tip workhorse wire first for a fresh occlusion; hydrophilic wires go under plaque and perforate more easily.',
  },
  {
    id: 'balloon', when: (s) => has(s, 'wired'),
    ask: '2.5 by 15 compliant balloon.',
    accept: ['balloon-predil'], wrong: ['balloon-nc', 'stent-des', 'stent-covered'],
    wrongSay: 'That is not a compliant pre-dilation balloon — the 2.5 by 15, please.',
    thanks: 'Thanks. Inflating.', fallback: 'I\'ll get the balloon myself.', gives: 'balloon-in-hand',
    label: 'Compliant balloon for pre-dilation',
    why: 'A compliant balloon opens the occlusion so the vessel can be seen and the stent sized.',
  },
  {
    id: 'pacing', when: (s) => has(s, 'bezold'), early: true, wait: 6, within: 3,
    ask: 'Get a temporary pacing wire ready, in case the atropine does not hold her rate.',
    accept: ['temp-wire'],
    thanks: 'Good — pacing wire on standby.', fallback: 'Has anyone got the pacing wire ready? I\'ll set it up myself.', gives: 'pacing-ready',
    label: 'Temporary pacing wire ready',
    why: 'Inferior STEMI brings bradycardia and AV block (the RCA supplies the AV node in most people). Have the wire, the generator and a femoral venous sheath ready before you need them.',
  },
  {
    id: 'stent', when: (s) => has(s, 'recovered') && (has(s, 'pacing-ready') || s.minute >= s.flags.bezold + 4),
    ask: 'Pressure is back. Drug-eluting stent, 3.5 by 23.',
    accept: ['stent-des'], wrong: ['stent-covered', 'balloon-nc', 'balloon-predil'],
    wrongSay: 'No — a drug-eluting stent, 3.5 by 23.',
    thanks: '3.5 by 23 — confirmed. Deploying.', fallback: 'I\'ll open the stent myself.', gives: 'stent-in-hand',
    label: 'Drug-eluting stent, as ordered',
    why: 'Say the size back to the operator and check it on the box before you open it.',
  },
];

const RN_ASKS: LabAsk[] = [
  {
    id: 'atropine', role: 4, when: (s) => has(s, 'bezold'), within: 1.5,
    ask: 'Heart rate 38 — give her something for the rate, please!',
    accept: ['atropine'], wrong: ['adenosine6', 'diltiazem'],
    wrongSay: 'No! Atropine, 1 milligram — her rate is 38.',
    thanks: 'Thanks — rate is coming up.', fallback: 'Tech, give me the atropine — I\'ll push it.', gives: 'atropine-given',
    label: 'Atropine for the reflex bradycardia',
    why: 'Atropine 1 mg IV blocks the vagal surge of the Bezold–Jarisch reflex; repeat every 3–5 minutes (max 3 mg). Pacing if it does not hold.',
  },
  {
    id: 'fluids', role: 4, when: (s) => has(s, 'bezold'), within: 2,
    ask: 'And her pressure is 68 — what does she need?',
    accept: ['fluid'],
    thanks: 'Thanks — pressure\'s coming up.', fallback: 'Open the fluids, someone!', gives: 'fluids-given',
    label: 'Fluid for the reflex hypotension',
    why: 'Vasodilation plus an infarcted, preload-dependent RV: give fluid wide open (250–500 mL boluses) and reassess. Nitrates and diuretics are the opposite of what she needs.',
  },
];

export const cathlabInferior: Scenario = {
  id: 'stemi-inferior-cathlab',
  title: 'Inferior STEMI: the right coronary and a falling heart rate',
  summary: '67-year-old woman with an inferior STEMI and RV involvement, from the groin. Find the culprit, open it — and treat what the reflow does to her heart rate and blood pressure.',
  setting: 'cathlab',
  roles: [3, 4, 5],
  difficulty: 'advanced',
  conditionId: 'inferior-stemi',
  images: IMAGES,
  briefing: {
    default: [
      ['team', 'STEMI alert: 67-year-old woman, inferior STEMI with ST elevation in V4R on the field ECG, 2 hours of epigastric pressure. EMS gave aspirin 324 mg and 500 mL of saline — no nitroglycerin.'],
      ['scene', 'She is pale and nauseated, and moves over onto the table.'],
    ],
    3: [
      ['team', 'STEMI alert: 67-year-old woman, inferior STEMI with ST elevation in V4R on the field ECG, 2 hours of epigastric pressure. EMS gave aspirin 324 mg and 500 mL of saline — no nitroglycerin.'],
      ['scene', 'She is pale and nauseated, and moves over onto the table.'],
      ['team', 'You are the scrub tech: set-up, the transducers and the pads, the C-arm views, and every catheter, wire, balloon and stent the cardiologist asks for. This one goes in from the right groin.'],
    ],
    4: [
      ['team', 'STEMI alert: 67-year-old woman, inferior STEMI with ST elevation in V4R on the field ECG, 2 hours of epigastric pressure. EMS gave aspirin 324 mg and 500 mL of saline — no nitroglycerin.'],
      ['scene', 'She is pale and nauseated, and moves over onto the table.'],
      ['team', 'You are the procedural nurse: checks, IV, the drugs the cardiologist orders, her comfort and safety. The tech is setting up; the cardiologist is scrubbing.'],
    ],
    5: [
      ['team', 'STEMI alert: 67-year-old woman, inferior STEMI with ST elevation in V4R on the field ECG, 2 hours of epigastric pressure. EMS gave aspirin 324 mg and 500 mL of saline — no nitroglycerin.'],
      ['scene', 'She is pale and nauseated, and moves over onto the table.'],
      ['team', 'You are the interventional cardiologist: every procedural choice is yours. The tech and the nurse are with you.'],
    ],
  },
  initial: {
    rhythm: { profile: 'inferior-stemi', hr: 58 },
    vitals: { sbp: 102, dbp: 64, spo2: 96, rr: 18, etco2: 34, pain: 6, gcs: 15, glucose: 150, temp: 36.6 },
  },
  facts: {
    allergies: 'No allergies, no blood thinners. I\'ve never had dye before. Yes, please go ahead.',
    sample: 'No allergies. Metformin and amlodipine. Diabetes and high blood pressure.',
    opqrst: 'Pressure in the pit of my stomach, going into my back, for two hours. 6 out of 10. I feel sick.',
    labs: 'Creatinine 1.1, potassium 4.4, haemoglobin 12.9, INR 1.0, platelets 230. Troponin pending.',
    ecg12: (s) => s.rhythm.profile === 'inferior-stemi-reperfused'
      ? 'Sinus rhythm: ST elevation in II, III and aVF settling, early Q waves — the inferior infarct after reperfusion.'
      : `Sinus rhythm ${s.rhythm.hr}: ST elevation in II, III and aVF (III more than II), reciprocal depression in I and aVL — an inferior STEMI from the right coronary.`,
    echo: 'Inferior hypokinesis, LVEF about 50 %; the RV is dilated and hypokinetic. No effusion.',
    rhc: 'RA 16 · RV 32/16 · PA 30/14 (mean 20) · PCWP 11 · CO 3.4 L/min, CI 1.9.',
  },
  status: (s) => {
    if (!s.pulse) return 'Unresponsive.';
    if (has(s, 'bezold') && !has(s, 'recovered')) return '"I feel sick… and so dizzy." She yawns.';
    if (has(s, 'pci')) return '"The pressure has gone."';
    return '"It\'s still there, and I feel sick."';
  },
  respond: {
    angio: (s) => angioGate(s) ?? { ...angioRun('you'), flags: ['angio'] },
    'final-angio': (s) => (s.role === 5 && has(s, 'access') ? { ...finalRun('you'), flags: ['final-angio'] } : null),
    atropine,
    fluid,
    nitro: nitroCrash,
    'ic-nitro': nitroCrash,
    rhc: (s) => !has(s, 'venous') ? null : {
      say: [['monitor', 'RA 16 · RV 32/16 · PA 30/14 (mean 20) · PCWP 11 · CO 3.4 L/min, CI 1.9.']], flags: ['rhc'],
      read: { kind: 'hemo', answer: 'hemo-rv-infarct', explain: 'RA pressure (16) higher than the wedge (11), a low output and a low PA pressure: the right ventricle is failing, not the left. Fill the RV, keep her in rhythm, avoid nitrates.' },
    },
  },
  events: [
    {
      id: 'tech-setup', when: (s) => s.role !== 3,
      effect: () => ({ say: [['team', 'Tech: both groins and the right radial prepped, transducers zeroed and levelled, monitor and defibrillator pads on.']], flags: ['prep', 'transducer', 'monitor', 'pads'] }),
    },
    {
      id: 'rn-setup-for-tech', when: (s) => s.role === 3,
      effect: () => ({ say: [['team', 'Nurse: consent and allergies checked, IV in, heparin 70 units/kg and ticagrelor 180 mg given on the cardiologist\'s order.']], flags: ['consent', 'iv', 'heparin', 'p2y12'] }),
    },
    {
      id: 'rn-setup-for-md', when: (s) => s.role === 5,
      effect: () => ({ say: [['team', 'Nurse: IV in, labs drawn, another 250 mL of saline running. Waiting for your orders.']], flags: ['iv', 'labs'] }),
    },
    {
      id: 'md-orders-for-rn', when: (s) => s.role === 4,
      effect: () => ({ say: [['operator', 'Load her for primary PCI, please: anticoagulation and a P2Y12 inhibitor. And watch her pressure.']] }),
    },
    {
      id: 'md-access', when: (s) => s.role !== 5 && has(s, 'timeout') && anticoagulated(s) && !has(s, 'access'),
      effect: () => ({ say: [['operator', 'Right femoral, ultrasound-guided: 6 French sheath in.']], flags: ['access', 'femoral'] }),
    },
    {
      id: 'md-angio', when: (s) => s.role !== 5 && has(s, 'access') && (s.role === 4 ? s.minute >= s.flags.access + 2 : has(s, 'right-diag-given')),
      effect: () => ({ ...angioRun('operator'), flags: ['angio', 'catheter'] }),
    },
    ...TECH_ASKS.flatMap(askEvents),
    ...RN_ASKS.flatMap(askEvents),
    {
      id: 'md-guide', when: (s) => s.role !== 5 && has(s, 'angio') && nextStep(s, 'angio', 'guide-in-hand'),
      effect: () => ({ say: [['operator', 'Guide engaged in the right coronary.']], flags: ['guide', 'guide-right'] }),
    },
    {
      id: 'md-view-for-rn', when: (s) => s.role === 4 && has(s, 'guide'),
      effect: () => ({ say: [['operator', 'LAO 30 — that is my working view.']], flags: ['view-set'] }),
    },
    {
      id: 'md-wire', when: (s) => s.role !== 5 && has(s, 'view-set') && nextStep(s, 'view-set', 'wire-in-hand'),
      effect: () => ({ say: [['operator', 'Wire\'s across, down to the crux.']], flags: ['wired'] }),
    },
    {
      id: 'md-predil', when: (s) => s.role !== 5 && has(s, 'wired') && nextStep(s, 'wired', 'balloon-in-hand'),
      effect: () => ({ say: [['operator', 'Balloon up… and down. Flow is back down the RCA.']], flags: ['predilated'] }),
    },
    {
      id: 'bezold', when: (s) => has(s, 'predilated'),
      effect: (s) => ({
        say: [
          ['monitor', 'Heart rate 38. BP 68/40.', 'bad'],
          ['patient', '"I feel sick… and so dizzy." She yawns and goes grey.'],
          ...(s.role === 5 ? [line('team', 'Nurse: "Doctor — her rate\'s 38 and the pressure is 68!"', 'warn')] : []),
        ],
        rhythm: { ...s.rhythm, hr: 38 }, vitals: { sbp: 68, dbp: 40 }, flags: ['bezold'], read: reflexRead,
      }),
    },
    {
      id: 'rn-treats-reflex', when: (s) => s.role === 3 && has(s, 'bezold') && (has(s, 'callout') || s.minute >= s.flags.bezold + 2),
      effect: (s) => ({
        say: [
          ...(has(s, 'callout') ? [] : [line('operator', 'Rate\'s 38 — who\'s watching the monitor?', 'warn')]),
          ['team', 'Nurse: atropine 1 milligram in; fluids wide open.'],
        ],
        flags: ['bj-atropine', 'bj-fluid'],
      }),
    },
    {
      id: 'reflex-worse', when: (s) => has(s, 'bezold') && !has(s, 'recovered') && s.minute >= s.flags.bezold + 4,
      effect: (s) => ({
        say: [['monitor', 'Heart rate 32. BP 58/30.', 'bad'], ['patient', 'She is barely responding.']],
        rhythm: { ...s.rhythm, hr: has(s, 'bj-atropine') ? s.rhythm.hr : 32 }, vitals: { sbp: Math.min(s.vitals.sbp, 58), dbp: Math.min(s.vitals.dbp, 30), gcs: 11 },
      }),
    },
    {
      id: 'recovered', when: (s) => has(s, 'bj-atropine') && has(s, 'bj-fluid'),
      effect: (s) => ({
        say: [['monitor', 'Heart rate 72. BP 98/60.', 'good'], ['patient', '"Oh… that\'s better."']],
        rhythm: { ...s.rhythm, hr: 72 }, vitals: { sbp: 98, dbp: 60, gcs: 15 }, flags: ['recovered'],
      }),
    },
    {
      id: 'md-stent', when: (s) => s.role !== 5 && has(s, 'recovered') && (s.role === 4 ? s.minute >= s.flags.recovered + 1 : has(s, 'stent-in-hand')),
      effect: () => ({ say: [['operator', 'Stent deployed at 14 atmospheres.', 'good']], flags: ['stented', 'pci'] }),
    },
    {
      id: 'reperfused', when: (s) => has(s, 'pci') && s.pulse,
      effect: (s) => ({ rhythm: { profile: 'inferior-stemi-reperfused', hr: has(s, 'recovered') ? 74 : s.rhythm.hr }, vitals: { pain: 1 } }),
    },
    {
      id: 'md-final', when: (s) => s.role !== 5 && has(s, 'pci'),
      effect: () => ({ ...finalRun('operator'), flags: ['final-angio'] }),
    },
  ],
  critical: [
    { id: 'consent', label: 'Consent, contrast allergy and anticoagulants checked', why: 'Confirm consent and allergies (contrast, heparin) before access.', done: ['consent'], roles: [4, 5], points: 10, target: { by: 6 } },
    { id: 'timeout', label: 'Procedural time-out before access', why: 'The time-out catches wrong-patient, wrong-site and allergy errors before anyone punctures an artery.', done: ['timeout'], points: 10, target: { by: 6 } },
    { id: 'prep', label: 'Prep and drape both groins and the radial', why: 'Femoral for this case, with the other groin ready for a venous sheath (pacing wire) or support.', done: ['prep'], roles: TECH, points: 5, target: { by: 6 } },
    { id: 'transducer', label: 'Zero and level the transducers', why: 'Accurate pressures need transducers zeroed to air and levelled at the phlebostatic axis.', done: ['transducer'], roles: TECH, points: 10, target: { by: 6 } },
    { id: 'pads', label: 'Defibrillator pads on before the wire crosses', why: 'Reperfusion brings bradycardia, AV block and VF: pads on, and the pacer ready.', done: ['pads'], roles: TECH, points: 10, target: { by: 8 } },
    { id: 'iv', label: 'IV access', why: 'For heparin, fluid and atropine.', done: ['iv', 'io'], roles: RN, points: 5 },
    { id: 'heparin', label: 'Anticoagulation before PCI (heparin 70–100 U/kg)', why: 'Primary PCI needs full anticoagulation (bivalirudin is the alternative).', done: ['heparin', 'bivalirudin'], roles: [4, 5], points: 10, target: { by: 10 } },
    { id: 'p2y12', label: 'P2Y12 loading dose', why: 'Ticagrelor 180 mg or prasugrel 60 mg as early as possible (cangrelor IV if she cannot swallow).', done: ['p2y12', 'cangrelor'], roles: [4, 5], points: 5 },
    { id: 'act', label: 'Check the ACT', why: 'ACT about 250–300 s with heparin alone before the wire crosses.', done: ['act'], after: 'heparin', roles: [3, 4], points: 5 },
    { id: 'access', label: 'Arterial access', why: 'Radial or ultrasound-guided femoral; femoral access sits over the femoral head, below the inguinal ligament.', done: ['access', 'access-femoral'], roles: MD, points: 5, target: { by: 12 } },
    { id: 'angio', label: 'Diagnostic angiography: find the culprit', why: 'Identify the occluded artery before choosing a guide.', done: ['angio'], roles: MD, points: 5 },
    { id: 'guide', label: 'A guide for the right coronary (JR4 or AL1)', why: 'The RCA needs a right-coronary shape; an EBU will not sit in it.', done: RIGHT_GUIDES, roles: MD, points: 10 },
    ...TECH_ASKS.map(askCritical),
    ...RN_ASKS.map(askCritical),
    { id: 'working-view', label: 'A working view for the RCA', why: 'LAO for the whole RCA, RAO for the mid segment and PDA, AP cranial for the crux.', done: (s) => doneAfter(s, RCA_VIEWS, 'guide'), roles: MD, points: 5 },
    { id: 'wire', label: 'Wire across the occlusion', why: 'A workhorse wire into the distal vessel restores some flow and carries the balloon and the stent.', done: WIRES, roles: MD, points: 5 },
    { id: 'callout', label: 'Call out the bradycardia and hypotension at once', why: 'A heart rate of 38 and a pressure of 68 need treating within a minute: say it out loud so the team acts.', done: ['callout'], after: 'bezold', roles: [3, 4], points: 10, target: { within: { flag: 'bezold', minutes: 1 } }, applies: (s) => has(s, 'bezold') },
    { id: 'md-atropine', label: 'Atropine for the reflex bradycardia', why: 'Atropine 1 mg IV blocks the vagal surge; repeat every 3–5 minutes, pace if it does not hold.', done: ['atropine'], after: 'bezold', roles: MD, points: 10, target: { within: { flag: 'bezold', minutes: 2 } }, applies: (s) => has(s, 'bezold') },
    { id: 'md-fluid', label: 'Fluid for the reflex hypotension', why: 'She is vasodilated and her infarcted RV is preload-dependent: fluid wide open.', done: ['fluid'], after: 'bezold', roles: MD, points: 10, target: { within: { flag: 'bezold', minutes: 2 } }, applies: (s) => has(s, 'bezold') },
    { id: 'stent', label: 'Drug-eluting stent in the culprit', why: 'Door-to-device within 90 minutes.', done: ['stent-des'], roles: MD, points: 15, target: { by: 30 } },
    { id: 'final', label: 'Final angiogram in two views', why: 'Confirm TIMI 3 flow to the crux and look for dissection before you leave.', done: ['final-angio'], after: 'pci', roles: MD, points: 5, applies: (s) => has(s, 'pci') },
    { id: 'post-ecg', label: '12-lead after the procedure', why: 'ST resolution confirms reperfusion; look for AV block.', done: ['ecg12', 'ecg12-repeat'], after: 'pci', points: 5, applies: (s) => has(s, 'pci') },
    { id: 'echo', label: 'Echocardiogram after PCI', why: 'LV and RV function, and no mechanical complication (papillary muscle, VSD, effusion).', done: ['echo'], after: 'pci', roles: MD, points: 5, applies: (s) => has(s, 'pci') },
    { id: 'hemostasis', label: 'Femoral haemostasis', why: 'Sheath out with firm pressure (or a closure device); check the groin and distal pulses, and watch for back pain and hypotension (retroperitoneal bleed).', done: ['hemostasis', 'closure-device'], after: 'pci', roles: [3, 4], points: 5, applies: (s) => has(s, 'pci') },
    { id: 'handoff', label: 'Hand-off to the cardiac care unit', why: 'Report the culprit, the stent, the reflex and its treatment, the RV infarct (no nitrates) and the groin.', done: ['handoff'], roles: [4, 5], points: 5 },
  ],
  harms: [
    { id: 'nitro-rv', actions: ['nitro', 'ic-nitro'], points: 10, severity: 'major', text: 'Nitroglycerin with an RV infarct. Her RV is preload-dependent: nitrates pool blood in the veins and the pressure crashes.' },
    { id: 'pci-no-heparin', actions: [...WIRES, 'balloon-predil', 'stent-des', 'aspiration'], roles: MD, when: (s) => !anticoagulated(s), points: 15, severity: 'critical', text: 'Wiring and ballooning the artery without anticoagulation. Catheters, wires and stents clot without heparin (or bivalirudin).' },
    { id: 'access-no-timeout', actions: ['access', 'access-femoral'], when: (s) => !has(s, 'timeout'), points: 5, severity: 'major', text: 'Arterial access before the time-out.' },
    { id: 'access-no-consent', actions: ['access', 'access-femoral'], when: (s) => !has(s, 'consent'), points: 5, severity: 'major', text: 'Access before confirming consent and allergies in a patient who can give them.' },
    { id: 'left-guide-for-rca', actions: LEFT_GUIDES, roles: MD, when: (s) => has(s, 'angio'), points: 5, severity: 'minor', text: 'A left-system guide for an RCA culprit. An EBU will not sit in the right coronary: JR4 or AL1.' },
    { id: 'hydrophilic-first', actions: ['wire-hydrophilic'], roles: MD, when: (s) => !has(s, 'wired'), points: 2, severity: 'minor', text: 'A hydrophilic wire as the first wire for a fresh occlusion. Start with a workhorse wire.' },
    { id: 'stent-in-reflex', actions: ['stent-des'], roles: MD, when: (s) => has(s, 'bezold') && !has(s, 'recovered'), points: 4, severity: 'minor', text: 'Stenting while she is bradycardic and hypotensive. Treat the reflex first (atropine, fluid); then finish the job.' },
    { id: 'covered-no-perforation', actions: ['stent-covered'], roles: [3, 5], when: (s) => !has(s, 'perforation'), points: 4, severity: 'minor', text: 'A covered stent without a perforation. Covered stents seal perforations; they restenose and clot more than drug-eluting stents.' },
    { id: 'opened-early', actions: ['balloon-predil', 'stent-des', 'balloon-nc', 'stent-covered'], roles: TECH, when: (s) => !has(s, 'wired'), points: 2, severity: 'minor', text: 'A balloon or stent opened before there was a wire to put it on. Open devices when the operator asks for them.' },
    askHarm(TECH_ASKS[0], 'The wrong diagnostic catheter for the left coronary. From the groin: a JL4.'),
    askHarm(TECH_ASKS[1], 'The wrong diagnostic catheter for the right coronary. From the groin: a JR4.'),
    askHarm(TECH_ASKS[2], 'A left-system guide when the operator asked for a right-coronary guide.', 5),
    askHarm(TECH_ASKS[3], 'A left-system view while the operator works in the RCA.'),
    askHarm(TECH_ASKS[4], 'A hydrophilic wire when the operator asked for a workhorse.'),
    askHarm(TECH_ASKS[5], 'The wrong device when the operator asked for a compliant pre-dilation balloon.'),
    askHarm(TECH_ASKS[7], 'The wrong device when the operator asked for a drug-eluting stent.'),
    askHarm(RN_ASKS[0], 'The wrong drug for a reflex bradycardia of 38. Atropine 1 mg IV.', 5),
    { id: 'beta-blocker', actions: ['metoprolol'], points: 8, severity: 'major', text: 'An IV beta-blocker with bradycardia, hypotension and an RV infarct.' },
    { id: 'oxygen-normoxic', actions: ['o2-nc', 'o2-nrb'], when: (s) => s.pulse && s.vitals.spo2 >= 90, points: 2, severity: 'minor', text: 'Oxygen with an SpO₂ of 90 % or more. Oxygen is for SpO₂ below 90 %.' },
  ],
  timings: [
    { label: 'Time-out', actions: ['timeout'], target: 6 },
    { label: 'Artery open (arrival to device)', actions: ['stent-des'], flag: 'pci', target: 30 },
    { label: 'Reflex recognised and treated', actions: ['callout', 'atropine'], target: 2, from: 'bezold' },
  ],
  deathAfter: 10,
  completeWhen: (s) => has(s, 'pci') && has(s, 'final-angio') && has(s, 'recovered'),
  teaching: [
    'Inferior STEMI with ST elevation in V4R means RV infarction: no nitrates; treat hypotension with fluid.',
    'From the groin: JL4 for the left coronary, JR4 for the right. Guides for the RCA: JR4, or AL1 for extra back-up.',
    'RCA views: LAO for the whole "C", RAO for the mid segment and the PDA, AP cranial for the crux.',
    'Reperfusion of the inferior wall can fire the Bezold–Jarisch reflex: sudden bradycardia and hypotension. Call it out, then atropine and fluid; pace if the rate does not hold.',
    'Inferior STEMIs block (the RCA usually supplies the AV node): pads on and a temporary pacing wire ready before you need it.',
    'Femoral access: ultrasound-guided over the femoral head; afterwards firm pressure or a closure device, and watch for back pain and falling pressure (retroperitoneal bleed).',
  ],
};
