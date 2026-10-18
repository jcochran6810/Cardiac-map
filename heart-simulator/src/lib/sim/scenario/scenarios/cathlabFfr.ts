import type { Effect, PendingRead, Scenario, SimState } from '../types';
import { has } from '../kit';
import {
  LAD_VIEWS, LEFT_GUIDES, LEFT_VIEWS, MD, RCA_VIEWS, RIGHT_GUIDES, RN, TECH, WIRES, angioGate, anticoagulated, askCritical, askEvents, askHarm,
  cine, doneAfter, nextStep, operator, type LabAsk,
} from '../labKit';

/** Real angiograms for this patient: cine view id → key of CATH_IMAGES (a run without one is described in words) */
const IMAGES: Partial<Record<string, string>> = { angio: 'lad-intermediate-ffr-positive', ffr: 'ffr-significant', 'final-angio': 'lad-stented-after-ffr' };

const angioRun = (who: 'you' | 'operator') => cine('angio', 'Diagnostic angiography: left and right coronaries', IMAGES.angio, [
  [who, 'Distal LAD: a 60–70 % narrowing. Circumflex and RCA: no significant disease. By eye it is borderline.'],
], {
  kind: 'angio', answer: 'angio-lad-intermediate', partial: ['angio-severe-stenosis'], prompt: 'What does the left coronary run show?',
  explain: 'An intermediate (40–70 %) LAD narrowing: by eye you cannot tell whether it limits flow — that is what the pressure wire is for.',
}, [[who, 'Right coronary: no significant disease. The left coronary run is on the Imaging screen.']]);

const finalRun = (who: 'you' | 'operator') => cine('final-angio', 'Final angiogram: the LAD in two views', IMAGES['final-angio'], [
  [who, 'Distal LAD stented: no residual narrowing, TIMI 3 flow, no edge dissection.', 'good'],
], {
  kind: 'angio', answer: 'angio-timi3', prompt: 'What does the final run show?',
  explain: 'The stented distal LAD is smooth, with no narrowing left and contrast filling it briskly to the apex: TIMI 3 flow.',
});

const spasmBlock: Effect = { blocked: true, say: [['system', 'The guide will not pass the forearm: the radial artery is in spasm. Treat it first.']] };

const sizingRead: Omit<PendingRead, 'minute'> = {
  kind: 'sizing', answer: 'stent-3.0x15', partial: ['stent-2.5x12', 'stent-3.0x23'], prompt: 'Which stent do these IVUS measurements call for?',
  explain: 'Diameter from the distal reference (lumen 2.7 mm, vessel 3.1 mm): 3.0 mm. Length: 12 mm of plaque between healthy landing zones, plus a margin at each end — 15 mm. A 2.5 would be under-sized; a 23 is longer than it needs to be.',
};

/**
 * The FFR at maximal hyperaemia (Pd 62 / Pa 98 = 0.63): the console screen to read, when the app has it.
 * The arterial line reads the same aortic pressure as the console (132/81, mean 98).
 */
const ffrResult = (): Effect => ({
  vitals: { sbp: 132, dbp: 81 },
  say: [
    ['monitor', IMAGES.ffr ? 'FFR recorded at maximal hyperaemia — the console screen is on the Imaging tab.' : 'At maximal hyperaemia the distal pressure falls: FFR 0.63 (Pd 62, Pa 98).'],
    ['patient', '"I feel flushed… a bit short of breath."'],
  ],
  ...(IMAGES.ffr ? { image: { id: 'ffr', view: 'Pressure-wire console at maximal hyperaemia', image: IMAGES.ffr } } : {}),
  flags: ['ffr', 'ffr-done', 'wired'],
  read: {
    kind: 'physiology', answer: 'ffr-significant', prompt: 'What does this FFR mean for him?',
    explain: 'FFR 0.63 (Pd 62 ÷ Pa 98) is well under 0.80: the narrowing limits flow at stress, matching his angina and the anterior ischaemia on the stress test. Treat it — the pressure wire can carry the stent.',
  },
});

/** The pressure wire reading: trustworthy only when equalised first and measured at maximal hyperaemia */
function ffrEffect(s: SimState): Effect | null {
  if (!has(s, 'equalized')) return { blocked: true, say: [['system', 'Equalise the pressure wire at the guide tip first — without it the reading cannot be trusted.']] };
  if (!has(s, 'hyperemia')) {
    return {
      say: [['monitor', 'Pd/Pa 0.91 and flat: no fall in the distal pressure, no change in the heart rate or blood pressure.'], ['patient', '"I don\'t feel anything."']],
      flags: ['ffr-rest'],
      read: { kind: 'physiology', answer: 'ffr-no-hyperemia', prompt: 'What does this reading tell you?', explain: 'Pd/Pa 0.91 with nothing happening to the patient is a resting value: FFR needs maximal hyperaemia (adenosine 140 mcg/kg/min IV, or intracoronary boluses). Give it and measure again.' },
    };
  }
  return ffrResult();
}

const TECH_ASKS: LabAsk[] = [
  {
    id: 'diag', when: (s) => has(s, 'access'), early: true,
    ask: 'Five French Tiger, please.',
    accept: ['cath-tiger'], wrong: ['cath-jl4', 'cath-jr4', 'cath-pigtail'],
    wrongSay: 'I asked for the Tiger — one catheter for both coronaries from the radial.',
    thanks: 'Thanks.', fallback: 'I\'ll get the Tiger myself.', gives: 'diag-in-hand',
    label: 'Diagnostic catheter as asked (Tiger)',
    why: 'Know your catheters by name and shape: the Tiger engages both coronaries from the right radial.',
  },
  // the diagnostic run: the tech moves the C-arm through the standard views as the operator asks
  {
    id: 'view-lm', when: (s) => has(s, 'diag-in-hand'),
    ask: 'Left coronary engaged. Left main first: give me the spider.',
    accept: ['view-lao-caudal'], wrong: [...RCA_VIEWS, ...LAD_VIEWS],
    wrongSay: 'That is not the spider. LAO caudal: the left main and its bifurcation, opened up.',
    thanks: 'Left main is clean.', fallback: 'I\'ll move the C-arm myself: LAO caudal.', gives: 'run-lm',
    label: 'Spider view (LAO caudal) for the left main',
    why: 'LAO with caudal tilt opens up the left main and its bifurcation into the LAD and circumflex — the "spider".',
  },
  {
    id: 'view-lad', when: (s) => has(s, 'run-lm'),
    ask: 'Now the LAD — I want the diagonals and septals split.',
    accept: LAD_VIEWS, wrong: [...RCA_VIEWS, 'view-rao-caudal', 'view-lao-caudal'],
    wrongSay: 'The LAD needs a cranial view: RAO, AP or LAO cranial.',
    thanks: 'There it is — distal LAD.', fallback: 'I\'ll take it: RAO cranial.', gives: 'run-lad',
    label: 'A cranial view for the LAD',
    why: 'Cranial angulation lifts the LAD clear of its diagonals and septals.',
  },
  {
    id: 'view-lcx', when: (s) => has(s, 'run-lad'),
    ask: 'Now the circumflex and its marginals.',
    accept: ['view-rao-caudal'], wrong: [...RCA_VIEWS, ...LAD_VIEWS],
    wrongSay: 'For the circumflex and the marginals: RAO caudal.',
    thanks: 'Circumflex is fine.', fallback: 'I\'ll take it: RAO caudal.', gives: 'run-lcx',
    label: 'RAO caudal for the circumflex',
    why: 'RAO with caudal tilt lays the circumflex and its obtuse marginals out below the LAD.',
  },
  {
    id: 'view-rca', when: (s) => has(s, 'run-lcx'),
    ask: 'Over to the right coronary. Show me the whole "C".',
    accept: ['view-rca-lao'], wrong: [...LEFT_VIEWS],
    wrongSay: 'That is a left-system view. The whole RCA "C" is the LAO.',
    thanks: 'RCA is fine. So it is the distal LAD.', fallback: 'I\'ll take it: LAO 30.', gives: 'run-rca',
    label: 'LAO for the right coronary',
    why: 'In the LAO the RCA runs as a "C" around the tricuspid annulus: ostium, proximal and mid segments, down to the crux.',
  },
  {
    id: 'cocktail', when: (s) => has(s, 'spasm'),
    ask: 'His radial is in spasm. Another cocktail down the side-arm, please.',
    accept: ['radial-cocktail'], wrong: ['ic-verapamil', 'ic-nitro', 'ic-adenosine'],
    wrongSay: 'That is a coronary dose. The radial cocktail, down the sheath side-arm.',
    thanks: 'Thanks — give it a minute to work.', fallback: 'I\'ll draw up the cocktail myself.', gives: 'cocktail-given',
    label: 'Radial cocktail for the spasm',
    why: 'Verapamil and nitroglycerin through the sheath relax the radial artery; analgesia and a little sedation help too. Never force a catheter through a spasm.',
  },
  {
    id: 'guide', when: (s) => has(s, 'spasm-eased'), early: true,
    ask: 'We need physiology. A guide for the left system, please — 6 French.',
    accept: LEFT_GUIDES, wrong: RIGHT_GUIDES,
    wrongSay: 'That is a right-coronary guide. The LAD needs a left guide: EBU.',
    thanks: 'Thanks — engaging the left main.', fallback: 'I\'ll open the guide myself.', gives: 'guide-in-hand',
    label: 'A left guide for the LAD (EBU)',
    why: 'The LAD comes off the left main: an extra-back-up guide sits there and supports the wire, the IVUS catheter and the stent.',
  },
  {
    id: 'equalize', when: (s) => has(s, 'guide'),
    ask: 'Pressure wire is at the tip of the guide. Equalise, please.',
    accept: ['ffr-equalize'],
    thanks: 'Equalised — crossing the lesion.', fallback: 'I\'ll equalise it myself.', gives: 'equalize-done',
    label: 'Equalise the pressure wire at the guide tip',
    why: 'With the wire\'s sensor at the guide tip, both pressures must read the same (Pd/Pa 1.00) before you cross: otherwise every number after it is off.',
  },
  {
    id: 'ffr', when: (s) => has(s, 'hyperemia'),
    ask: 'Adenosine is running. Record the FFR, please.',
    accept: ['ffr'],
    thanks: 'Thanks.', fallback: 'I\'ll record it myself.', gives: 'ffr-recorded',
    label: 'Record the FFR at maximal hyperaemia',
    why: 'FFR is the lowest Pd/Pa at steady maximal hyperaemia (about 1–2 minutes into the adenosine infusion, when the patient feels flushed and the pressure falls a little).',
  },
  {
    id: 'ivus', when: (s) => has(s, 'ffr-done'),
    ask: 'It\'s significant. IVUS catheter, please — I want to size it.',
    accept: ['ivus', 'oct'],
    thanks: 'Thanks — pulling back.', fallback: 'I\'ll set up the IVUS myself.', gives: 'ivus-done',
    label: 'Intravascular imaging to size the stent',
    why: 'IVUS (or OCT) measures the true vessel and lumen size and the length of the plaque: stents placed with it expand better and fail less.',
  },
  {
    id: 'stent', when: (s) => has(s, 'sized'),
    ask: 'Drug-eluting stent, 3.0 by 15.',
    accept: ['stent-des'], wrong: ['stent-covered', 'balloon-nc', 'balloon-predil'],
    wrongSay: 'No — a drug-eluting stent, 3.0 by 15.',
    thanks: '3.0 by 15 — confirmed. Deploying.', fallback: 'I\'ll open the stent myself.', gives: 'stent-in-hand',
    label: 'Drug-eluting stent, as ordered',
    why: 'Say the size back to the operator and check it on the box before you open it.',
  },
  {
    id: 'nc', when: (s) => has(s, 'pci'),
    ask: 'Non-compliant balloon, 3.25 by 12.',
    accept: ['balloon-nc'], wrong: ['balloon-predil'],
    wrongSay: 'That is a compliant balloon — non-compliant, please.',
    thanks: 'Thanks. High pressure inside the stent.', fallback: 'I\'ll get the NC balloon myself.', gives: 'nc-in-hand',
    label: 'Non-compliant balloon for post-dilation',
    why: 'A non-compliant balloon expands the stent fully at high pressure without over-stretching the vessel beyond it.',
  },
];

const RN_ASKS: LabAsk[] = [
  {
    id: 'sedation', role: 4, when: (s) => has(s, 'timeout'),
    ask: 'He\'s anxious. Something to settle him for the procedure, please.',
    accept: ['sedation', 'fentanyl'],
    thanks: 'Thanks.', fallback: 'Never mind — we\'ll manage.', gives: 'settled',
    label: 'Moderate sedation and analgesia',
    why: 'Light sedation (e.g. midazolam 1 mg with fentanyl 25 mcg) eases anxiety and cuts radial spasm; monitor the breathing and SpO₂ while it works.',
  },
  {
    id: 'anticoag', role: 4, when: (s) => has(s, 'angio'),
    ask: 'We\'re going to wire the LAD for physiology. What does he need before any wire goes in?',
    accept: ['heparin', 'bivalirudin'], wrong: ['protamine', 'gp2b3a'],
    wrongSay: 'No — he needs anticoagulation before the wire: heparin, 70 units per kilo.',
    thanks: 'Thanks. ACT in five.', fallback: 'Heparin, please — I\'ll give it myself.', gives: 'anticoag-given',
    label: 'Anticoagulate before the pressure wire',
    why: 'A pressure wire is a coronary wire: heparin 70–100 U/kg (ACT 250–300 s) before it enters the artery, or it clots.',
  },
  {
    id: 'cocktail-rn', role: 4, when: (s) => has(s, 'spasm'),
    ask: 'His radial is in spasm — I need something down the side-arm.',
    accept: ['radial-cocktail'], wrong: ['ic-verapamil', 'ic-nitro', 'ic-adenosine'],
    wrongSay: 'That is an intracoronary dose. The radial cocktail, down the sheath side-arm.',
    thanks: 'Thanks — give it a minute to work.', fallback: 'Tech, draw up a cocktail, please.', gives: 'cocktail-given',
    label: 'Radial cocktail for the spasm',
    why: 'Verapamil and nitroglycerin through the sheath relax the radial artery; analgesia and a little sedation help too.',
  },
  {
    id: 'nitro', role: 4, when: (s) => has(s, 'equalized'),
    ask: 'Before the measurement: two hundred of intracoronary nitro, please.',
    accept: ['ic-nitro'], wrong: ['nitro', 'ic-verapamil'],
    wrongSay: 'Intracoronary nitroglycerin, please — through the guide.',
    thanks: 'Thanks.', fallback: 'I\'ll give the nitro myself.', gives: 'nitro-given',
    label: 'Intracoronary nitroglycerin before the FFR',
    why: 'Nitroglycerin removes any spasm in the epicardial artery, so the FFR measures the fixed narrowing only.',
  },
  {
    id: 'hyperemia', role: 4, when: (s) => has(s, 'nitro-given'),
    ask: 'Now the hyperaemia, please.',
    accept: ['adenosine-iv-ffr', 'ic-adenosine'], wrong: ['adenosine6', 'adenosine12'],
    wrongSay: 'Not the SVT dose! A steady infusion: adenosine 140 micrograms per kilo per minute.',
    thanks: 'Thanks — he\'ll feel flushed in a minute.', fallback: 'I\'ll start the adenosine myself.', gives: 'hyperemia-given',
    label: 'Adenosine for maximal hyperaemia',
    why: 'FFR needs maximal hyperaemia: an IV infusion of adenosine 140 mcg/kg/min (or intracoronary boluses). A 6 or 12 mg push is the SVT dose — seconds of AV block, not steady hyperaemia.',
  },
  {
    id: 'load', role: 4, when: (s) => has(s, 'ffr-done'),
    ask: 'It\'s significant — we\'re stenting. Load him, please.',
    accept: ['p2y12', 'cangrelor'],
    thanks: 'Thanks.', fallback: 'I\'ll give the loading dose myself.', gives: 'loaded',
    label: 'P2Y12 loading dose once you are stenting',
    why: 'Elective PCI: clopidogrel 600 mg (on top of his daily aspirin) once the decision to stent is made.',
  },
];

export const cathlabFfr: Scenario = {
  id: 'ffr-cathlab',
  title: 'Stable angina: does this narrowing need a stent?',
  summary: '58-year-old man with exertional angina and an abnormal stress test. A borderline LAD narrowing: measure it, size it, treat it — and deal with a radial artery that will not cooperate.',
  setting: 'cathlab',
  roles: [3, 4, 5],
  difficulty: 'intermediate',
  images: IMAGES,
  briefing: {
    default: [
      ['team', 'Elective case: 58-year-old man, three months of chest tightness walking uphill. Stress echo: anterior ischaemia. On aspirin 81 mg, atorvastatin and amlodipine.'],
      ['scene', 'He is awake and a little anxious on the table: no pain at rest.'],
    ],
    3: [
      ['team', 'Elective case: 58-year-old man, three months of chest tightness walking uphill. Stress echo: anterior ischaemia. On aspirin 81 mg, atorvastatin and amlodipine.'],
      ['scene', 'He is awake and a little anxious on the table: no pain at rest.'],
      ['team', 'You are the scrub tech: set-up, the transducers, the C-arm, the devices — and the pressure wire and IVUS consoles.'],
    ],
    4: [
      ['team', 'Elective case: 58-year-old man, three months of chest tightness walking uphill. Stress echo: anterior ischaemia. On aspirin 81 mg, atorvastatin and amlodipine.'],
      ['scene', 'He is awake and a little anxious on the table: no pain at rest.'],
      ['team', 'You are the procedural nurse: checks, IV, sedation, and every drug the cardiologist asks for.'],
    ],
    5: [
      ['team', 'Elective case: 58-year-old man, three months of chest tightness walking uphill. Stress echo: anterior ischaemia. On aspirin 81 mg, atorvastatin and amlodipine.'],
      ['scene', 'He is awake and a little anxious on the table: no pain at rest.'],
      ['team', 'You are the interventional cardiologist: every decision is yours — including whether this needs a stent at all.'],
    ],
  },
  initial: {
    rhythm: { profile: 'normal-sinus', hr: 68 },
    vitals: { sbp: 142, dbp: 86, spo2: 98, rr: 16, etco2: 36, pain: 0, gcs: 15, glucose: 104, temp: 36.6 },
  },
  facts: {
    allergies: 'No allergies. No blood thinners apart from my baby aspirin. Yes — I understand and agree.',
    sample: 'No allergies. Aspirin, atorvastatin, amlodipine. High cholesterol; ex-smoker.',
    opqrst: 'Only when I walk uphill or hurry: a tight band across my chest, gone in a few minutes when I stop. Nothing right now.',
    labs: 'Creatinine 0.9, potassium 4.2, haemoglobin 14.6, INR 1.0, platelets 260.',
    ecg12: `Sinus rhythm 68, normal axis, no ST changes.`,
    echo: 'Normal LV size and function, LVEF 60 %, no effusion.',
    ivus: 'IVUS: proximal reference lumen 2.9 mm, distal reference lumen 2.7 mm (vessel 3.1 mm); 12 mm of plaque between healthy landing zones; minimum lumen area 1.8 mm².',
  },
  status: (s) => (has(s, 'spasm') && !has(s, 'spasm-eased') ? '"My wrist is burning."' : has(s, 'hyperemia') && !has(s, 'pci') ? '"I feel flushed."' : '"I\'m fine."'),
  respond: {
    access: (s) => ({ say: [[operator(s), 'Right radial: 6 Fr sheath in, radial cocktail given.']], flags: ['access'] }),
    angio: (s) => angioGate(s) ?? { ...angioRun('you'), flags: ['angio'] },
    'final-angio': (s) => (s.role === 5 && has(s, 'access') ? { ...finalRun('you'), flags: ['final-angio'] } : null),
    'guide-ebu': (s) => (s.role === 5 && has(s, 'spasm') && !has(s, 'spasm-eased') ? spasmBlock : null),
    'guide-jr4': (s) => (s.role === 5 && has(s, 'spasm') && !has(s, 'spasm-eased') ? spasmBlock : null),
    'guide-al1': (s) => (s.role === 5 && has(s, 'spasm') && !has(s, 'spasm-eased') ? spasmBlock : null),
    'ffr-equalize': (s) => (s.role === 5 && !has(s, 'guide') ? { blocked: true, say: [['system', 'Engage a guide first: the pressure wire goes in through it.']] } : null),
    ffr: ffrEffect,
    ivus: (s) => (has(s, 'wired') ? { say: [['monitor', 'IVUS: proximal reference lumen 2.9 mm, distal reference lumen 2.7 mm (vessel 3.1 mm); 12 mm of plaque between healthy landing zones; minimum lumen area 1.8 mm².']], flags: ['ivus', 'sized'], ...(s.role !== 4 && !has(s, 'sized') ? { read: sizingRead } : {}) } : null),
    oct: (s) => (has(s, 'wired') ? { say: [['monitor', 'OCT: proximal reference lumen 2.9 mm, distal reference lumen 2.7 mm; 12 mm of fibrous plaque between healthy landing zones; minimum lumen area 1.7 mm².']], flags: ['oct', 'sized'], ...(s.role !== 4 && !has(s, 'sized') ? { read: sizingRead } : {}) } : null),
    'adenosine-iv-ffr': (s) => ({ say: [['you', 'Adenosine 140 mcg/kg/min IV running.'], ['monitor', `BP ${s.vitals.sbp - 6}/${s.vitals.dbp - 2}.`], ['patient', '"I feel flushed… a bit short of breath."']], vitals: { sbp: s.vitals.sbp - 6, dbp: s.vitals.dbp - 2 }, flags: ['hyperemia'] }),
    'ic-adenosine': () => ({ say: [['you', 'Adenosine 150 mcg intracoronary, through the guide.'], ['monitor', 'A few seconds of slowing; the distal pressure dips.']], flags: ['hyperemia'] }),
    'radial-cocktail': (s) => (has(s, 'spasm') ? { say: [['you', 'Radial cocktail through the sheath: verapamil 2.5 mg and nitroglycerin 200 mcg.'], ['patient', '"Ooh, that burns… it\'s easing."']], flags: ['cocktail', 'spasm-eased'] } : null),
  },
  events: [
    {
      id: 'tech-setup', when: (s) => s.role !== 3,
      effect: () => ({ say: [['team', 'Tech: right radial and both groins prepped, transducers zeroed and levelled, monitor on, pressure-wire and IVUS consoles ready.']], flags: ['prep', 'transducer', 'monitor', 'pads'] }),
    },
    {
      id: 'rn-setup-for-tech', when: (s) => s.role === 3,
      effect: () => ({ say: [['team', 'Nurse: consent and allergies checked, IV in, midazolam 1 mg and fentanyl 25 mcg given.']], flags: ['consent', 'iv', 'sedation'] }),
    },
    {
      id: 'rn-setup-for-md', when: (s) => s.role === 5,
      effect: () => ({ say: [['team', 'Nurse: IV in, labs back, midazolam 1 mg and fentanyl 25 mcg given for his nerves. Waiting for your orders.']], flags: ['iv', 'labs', 'sedation'] }),
    },
    {
      id: 'md-access', when: (s) => s.role !== 5 && has(s, 'timeout') && !has(s, 'access'),
      effect: () => ({ say: [['operator', 'Right radial: 6 French sheath in, cocktail given.']], flags: ['access'] }),
    },
    {
      id: 'md-angio', when: (s) => s.role !== 5 && has(s, 'access') && (s.role === 4 ? s.minute >= s.flags.access + 2 : has(s, 'run-rca')),
      effect: () => ({ ...angioRun('operator'), flags: ['angio', 'catheter'] }),
    },
    {
      id: 'rn-anticoag-for-tech', when: (s) => s.role === 3 && has(s, 'angio'),
      effect: () => ({ say: [['team', 'Nurse: heparin 70 units per kilo in, on the cardiologist\'s order.']], flags: ['heparin'] }),
    },
    {
      id: 'spasm', when: (s) => has(s, 'angio'),
      effect: (s) => ({
        say: [
          [operator(s), 'Pulling the Tiger out… it is gripping.'],
          ['patient', '"Ow — my wrist is burning!" He pulls his arm in; the catheter barely moves.'],
        ],
        flags: ['spasm'],
        read: { kind: 'clinical', answer: 'clin-spasm', partial: ['clin-hematoma'], prompt: 'What is happening to his arm?', explain: 'Radial artery spasm: the artery clamps down on the catheter — pain, resistance, sometimes a "pinched" look on fluoroscopy. More vasodilator through the sheath, analgesia or a little more sedation, and patience. Never pull or push against it.' },
      }),
    },
    ...TECH_ASKS.flatMap(askEvents),
    ...RN_ASKS.flatMap(askEvents),
    {
      id: 'spasm-eases-for-rn', when: (s) => s.role !== 5 && has(s, 'spasm') && !has(s, 'spasm-eased') && has(s, 'cocktail-given'),
      effect: () => ({ say: [['operator', 'That\'s better — the Tiger is out.']], flags: ['spasm-eased'] }),
    },
    {
      id: 'md-guide', when: (s) => s.role !== 5 && has(s, 'spasm-eased') && (s.role === 4 ? has(s, 'anticoag-given') && s.minute >= s.flags['spasm-eased'] + 1 : has(s, 'guide-in-hand')),
      effect: () => ({ say: [['operator', 'EBU engaged in the left main. Pressure wire to the tip of the guide.']], flags: ['guide', 'guide-left'] }),
    },
    {
      id: 'md-equalize', when: (s) => s.role === 4 && has(s, 'guide'),
      effect: () => ({ say: [['operator', 'Equalised at the guide tip: Pd/Pa 1.00. Crossing the lesion.']], flags: ['equalized'] }),
    },
    {
      id: 'rn-hyperemia-for-tech', when: (s) => s.role === 3 && has(s, 'equalized'),
      effect: () => ({ say: [['team', 'Nurse: intracoronary nitroglycerin 200 in; adenosine 140 micrograms per kilo per minute running.']], flags: ['ic-nitro', 'hyperemia'] }),
    },
    {
      id: 'md-ffr-for-rn', when: (s) => s.role === 4 && has(s, 'hyperemia') && s.minute >= s.flags.hyperemia + 1,
      effect: ffrResult,
    },
    {
      id: 'md-ivus-for-rn', when: (s) => s.role === 4 && has(s, 'loaded'),
      effect: () => ({ say: [['operator', 'IVUS: distal reference 2.7, vessel 3.1, 12 mm of plaque. A 3.0 by 15.']], flags: ['ivus', 'sized'] }),
    },
    {
      id: 'md-stent', when: (s) => s.role !== 5 && has(s, 'sized') && (s.role === 4 ? s.minute >= s.flags.sized + 1 : has(s, 'stent-in-hand')),
      effect: () => ({ say: [['operator', 'Stent deployed.', 'good']], flags: ['stented', 'pci'] }),
    },
    {
      id: 'md-postdil', when: (s) => s.role !== 5 && has(s, 'pci') && nextStep(s, 'pci', 'nc-in-hand'),
      effect: () => {
        const run = finalRun('operator');
        return { ...run, say: [['operator', 'Post-dilated. Final pictures.'], ...(run.say ?? [])], flags: ['postdilated', 'final-angio'] };
      },
    },
  ],
  critical: [
    { id: 'consent', label: 'Consent, contrast allergy and anticoagulants checked', why: 'Consent covers the diagnostic study and a possible stent; check contrast and drug allergies.', done: ['consent'], roles: [4, 5], points: 10, target: { by: 6 } },
    { id: 'timeout', label: 'Procedural time-out before access', why: 'Patient, procedure, site, allergies, and the plan if a stent is needed.', done: ['timeout'], points: 10, target: { by: 8 } },
    { id: 'prep', label: 'Prep and drape the radial and femoral sites', why: 'Radial first, with a groin ready as the bail-out.', done: ['prep'], roles: TECH, points: 5, target: { by: 6 } },
    { id: 'transducer', label: 'Zero and level the transducers', why: 'The FFR is a ratio of two pressures: both must be zeroed and levelled.', done: ['transducer'], roles: TECH, points: 10, target: { by: 6 } },
    { id: 'monitor', label: 'Monitor and pads on', why: 'Adenosine slows the heart and PCI can bring arrhythmias.', done: ['monitor', 'pads'], roles: TECH, points: 5, target: { by: 6 } },
    { id: 'iv', label: 'IV access', why: 'For sedation, heparin and adenosine.', done: ['iv', 'io'], roles: RN, points: 5 },
    { id: 'access', label: 'Radial arterial access', why: 'Radial first: fewer bleeding complications.', done: ['access', 'access-femoral'], roles: MD, points: 5 },
    { id: 'angio', label: 'Diagnostic angiography', why: 'Find the narrowing and judge it — then measure it if it is borderline.', done: ['angio'], roles: MD, points: 5 },
    { id: 'md-spasm', label: 'Treat the radial spasm (vasodilator through the sheath)', why: 'Verapamil and nitroglycerin through the sheath, analgesia or more sedation, and patience: forcing a catheter through a spasm tears the artery.', done: ['radial-cocktail', 'sedation', 'fentanyl'], after: 'spasm', roles: MD, points: 10, target: { within: { flag: 'spasm', minutes: 2 } }, applies: (s) => has(s, 'spasm') },
    { id: 'heparin', label: 'Anticoagulate before the pressure wire', why: 'A pressure wire is a coronary wire: heparin 70–100 U/kg before it goes in.', done: ['heparin', 'bivalirudin'], roles: MD, points: 10 },
    { id: 'guide', label: 'A left guide for the LAD (EBU)', why: 'The LAD comes off the left main.', done: LEFT_GUIDES, roles: MD, points: 5 },
    { id: 'equalize', label: 'Equalise the pressure wire at the guide tip', why: 'Pd/Pa must read 1.00 at the guide tip before crossing, or every reading after it is off.', done: ['ffr-equalize'], roles: MD, points: 10 },
    { id: 'ic-nitro', label: 'Intracoronary nitroglycerin before the measurement', why: 'It removes spasm so the FFR measures the fixed narrowing only.', done: (s) => doneAfter(s, ['ic-nitro'], 'guide'), roles: MD, points: 5, applies: (s) => has(s, 'guide') },
    { id: 'hyperemia', label: 'Maximal hyperaemia for the FFR (adenosine)', why: 'IV adenosine 140 mcg/kg/min or intracoronary boluses: FFR is only valid at maximal hyperaemia.', done: ['adenosine-iv-ffr', 'ic-adenosine'], roles: MD, points: 10 },
    { id: 'ffr', label: 'Measure the FFR', why: 'FFR ≤ 0.80 → treat; > 0.80 → medical therapy (FAME, DEFER).', done: (s) => (has(s, 'ffr-done') ? s.flags['ffr-done'] : null), roles: MD, points: 10 },
    { id: 'imaging', label: 'Size the stent with IVUS or OCT', why: 'Intravascular imaging gives the true vessel size and plaque length: better expansion, fewer failures.', done: ['ivus', 'oct'], roles: MD, points: 5, applies: (s) => has(s, 'ffr-done') },
    { id: 'md-p2y12', label: 'P2Y12 loading dose before the stent', why: 'Clopidogrel 600 mg on top of aspirin once you decide to stent.', done: ['p2y12', 'cangrelor'], roles: MD, points: 5, applies: (s) => has(s, 'ffr-done') },
    { id: 'stent', label: 'Drug-eluting stent in the significant lesion', why: 'Treat the narrowing the FFR showed to be significant.', done: ['stent-des'], roles: MD, points: 10, applies: (s) => has(s, 'ffr-done') },
    { id: 'postdil', label: 'Optimise the stent with a non-compliant balloon', why: 'Under-expansion is the strongest predictor of stent failure.', done: ['balloon-nc'], after: 'pci', roles: MD, points: 5, applies: (s) => has(s, 'pci') },
    { id: 'final', label: 'Final angiogram in two views', why: 'Look for edge dissection and confirm TIMI 3 flow.', done: ['final-angio'], after: 'pci', roles: MD, points: 5, applies: (s) => has(s, 'pci') },
    ...TECH_ASKS.map(askCritical),
    ...RN_ASKS.map(askCritical),
    { id: 'act', label: 'Check the ACT', why: 'ACT 250–300 s before PCI.', done: ['act'], after: 'heparin', roles: [3, 4], points: 5, applies: (s) => has(s, 'heparin') },
    { id: 'hemostasis', label: 'Radial band and distal perfusion check', why: 'Patent haemostasis: just enough pressure to stop the bleeding while the artery stays open.', done: ['hemostasis'], after: 'pci', roles: [3, 4], points: 5, applies: (s) => has(s, 'pci') },
    { id: 'handoff', label: 'Hand-off to recovery', why: 'Report the FFR, the stent, the spasm, the drugs given and the band.', done: ['handoff'], roles: [4, 5], points: 5 },
  ],
  harms: [
    { id: 'wire-no-heparin', actions: ['ffr-equalize', ...WIRES, 'balloon-predil', 'stent-des'], roles: MD, when: (s) => !anticoagulated(s), points: 15, severity: 'critical', text: 'A coronary wire without anticoagulation. The pressure wire is a coronary wire: heparin first.' },
    { id: 'stent-before-ffr', actions: ['stent-des', 'balloon-predil'], roles: MD, when: (s) => !has(s, 'ffr-done'), points: 10, severity: 'major', text: 'Treating a borderline narrowing without showing it is significant. Intermediate lesions need physiology first: about two-thirds of them do not limit flow (FAME).' },
    { id: 'svt-adenosine', actions: ['adenosine6', 'adenosine12'], roles: [4, 5], when: (s) => has(s, 'equalized'), points: 3, severity: 'minor', text: 'A 6 or 12 mg adenosine push for hyperaemia. That is the SVT dose: seconds of AV block, not the steady hyperaemia FFR needs.' },
    { id: 'access-no-timeout', actions: ['access', 'access-femoral'], when: (s) => !has(s, 'timeout'), points: 5, severity: 'major', text: 'Arterial access before the time-out.' },
    { id: 'access-no-consent', actions: ['access', 'access-femoral'], when: (s) => !has(s, 'consent'), points: 5, severity: 'major', text: 'Access before confirming consent and allergies.' },
    { id: 'right-guide-for-lad', actions: RIGHT_GUIDES, roles: MD, when: (s) => has(s, 'angio'), points: 5, severity: 'minor', text: 'A right-coronary guide for the LAD. Use a left guide with back-up (EBU / XB).' },
    { id: 'covered-no-perforation', actions: ['stent-covered'], roles: [3, 5], when: (s) => !has(s, 'perforation'), points: 4, severity: 'minor', text: 'A covered stent without a perforation. Covered stents seal perforations; they restenose and clot more than drug-eluting stents.' },
    { id: 'opened-early', actions: ['balloon-predil', 'stent-des', 'balloon-nc', 'stent-covered'], roles: TECH, when: (s) => !has(s, 'wired'), points: 2, severity: 'minor', text: 'A balloon or stent opened before there was a wire to put it on. Open devices when the operator asks for them.' },
    askHarm(TECH_ASKS[0], 'The wrong diagnostic catheter for what the operator asked.'),
    ...TECH_ASKS.slice(1, 5).map((a) => askHarm(a, `The wrong view when the operator asked for this one. ${a.why}`, 2)),
    askHarm(TECH_ASKS[5], 'An intracoronary drug when the operator asked for the radial cocktail.'),
    askHarm(TECH_ASKS[6], 'A right-coronary guide when the operator asked for a left guide.'),
    askHarm(TECH_ASKS[10], 'The wrong device when the operator asked for a drug-eluting stent.'),
    askHarm(TECH_ASKS[11], 'A compliant balloon when the operator asked for a non-compliant one.'),
    askHarm(RN_ASKS[1], 'The wrong drug before a coronary wire: he needs anticoagulation.', 5),
    askHarm(RN_ASKS[2], 'An intracoronary drug when the operator asked for the radial cocktail.'),
    askHarm(RN_ASKS[3], 'The wrong nitroglycerin: the operator asked for intracoronary nitroglycerin through the guide.'),
    askHarm(RN_ASKS[4], 'The SVT dose of adenosine instead of the hyperaemia infusion.'),
    { id: 'oxygen-normoxic', actions: ['o2-nc', 'o2-nrb'], when: (s) => s.pulse && s.vitals.spo2 >= 90, points: 2, severity: 'minor', text: 'Oxygen with an SpO₂ of 90 % or more. Oxygen is for SpO₂ below 90 %.' },
  ],
  timings: [
    { label: 'Spasm treated', actions: ['radial-cocktail', 'sedation', 'fentanyl'], target: 2, from: 'spasm' },
  ],
  deathAfter: 15,
  completeWhen: (s) => has(s, 'pci') && has(s, 'final-angio'),
  teaching: [
    'An intermediate (40–70 %) narrowing cannot be judged by eye: measure it. FFR ≤ 0.80 → treat; > 0.80 → medical therapy (FAME, DEFER).',
    'FFR set-up: heparin first, guide engaged, pressure wire equalised at the guide tip (Pd/Pa 1.00), intracoronary nitroglycerin, then maximal hyperaemia (adenosine 140 mcg/kg/min IV) and the lowest Pd/Pa.',
    'A 6 or 12 mg adenosine push is the SVT dose, not hyperaemia.',
    'IVUS or OCT sizes the stent: diameter from the reference vessel, length from landing zone to landing zone. Post-dilate with a non-compliant balloon.',
    'Radial spasm: pain and resistance. More vasodilator through the sheath, analgesia or sedation, patience — never force it.',
    'Radial band: patent haemostasis (enough pressure to stop the bleeding, not enough to stop the flow), with distal perfusion checks.',
  ],
};
