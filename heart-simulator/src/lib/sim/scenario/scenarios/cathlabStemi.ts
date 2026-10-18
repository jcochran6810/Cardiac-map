import type { Effect, Scenario, SimState } from '../types';
import { has, line } from '../kit';
import {
  LAD_VIEWS, MD, RCA_VIEWS, RIGHT_GUIDES, RN, TECH, WIRES, angioGate, anticoagulated, askCritical, askEvents, askHarm, cine, doneAfter, nextStep,
  operator, type LabAsk,
} from '../labKit';

/** Real angiograms for this patient: cine view id → key of CATH_IMAGES (none yet: until then the findings are said in words) */
const IMAGES: Partial<Record<string, string>> = {};

const wedged: Effect = { blocked: true, say: [['system', 'The pressure is still damped: back the guide out first.']] };

function shockOutcome(s: SimState): Effect | null {
  if (s.pulse || s.rhythm.profile !== 'vf') return null;
  return {
    say: [
      ['monitor', 'Shock delivered: 200 J.'],
      ['you', 'An organised rhythm returns; 116/72 on the arterial line. ROSC within seconds.', 'good'],
      ['patient', '"What just happened? The pain\'s almost gone."'],
    ],
    rhythm: { profile: 'anterior-stemi-reperfused', hr: 86 }, pulse: true, phase: 'post',
    vitals: { sbp: 116, dbp: 72, spo2: 97, pain: 2, gcs: 15, rr: 16 }, flags: ['pads', 'monitor', 'shocked'],
  };
}

const angioRun = (who: 'you' | 'operator') => cine('angio', 'Diagnostic angiography: left and right coronaries', IMAGES.angio, [
  [who, 'Proximal LAD 100 % occluded — TIMI 0 flow. Circumflex and RCA: mild disease only. That is the culprit.'],
], { kind: 'angio', answer: 'angio-lad-prox-occlusion', explain: 'The proximal LAD stops dead (TIMI 0): the culprit of this anterior STEMI. The circumflex and the RCA have only mild disease.' });

const finalRun = (who: 'you' | 'operator') => cine('final-angio', 'Final angiogram: the LAD in two views', IMAGES['final-angio'], [
  [who, 'LAD wide open: TIMI 3 flow, no dissection at the stent edges, no residual thrombus.', 'good'],
], { kind: 'angio', answer: 'angio-timi3', explain: 'Brisk TIMI 3 flow down the whole LAD with no edge dissection or thrombus: a good result.' });

/** What the operator asks the tech for, step by step */
const TECH_ASKS: LabAsk[] = [
  {
    id: 'diag', when: (s) => has(s, 'access'), early: true,
    ask: 'Diagnostic catheter, please — one that does both coronaries from the right radial.',
    accept: ['cath-tiger'], wrong: ['cath-jl4', 'cath-jr4', 'cath-pigtail'],
    wrongSay: 'That one only does one side. One catheter for both coronaries, please — a Tiger.',
    thanks: 'Tiger — thanks. Left coronary first, then the right.', fallback: 'I\'ll grab a Tiger myself.', gives: 'diag-in-hand',
    label: 'Diagnostic catheter for both coronaries (Tiger)',
    why: 'From the right radial a Tiger engages both coronaries, so the diagnostic study needs no catheter exchange: less spasm, less time.',
  },
  {
    id: 'guide', when: (s) => has(s, 'angio'), early: true,
    ask: 'The LAD is the culprit. A guide for the left system with good back-up, please — 6 French.',
    accept: ['guide-ebu'], wrong: RIGHT_GUIDES,
    wrongSay: 'That is a right-coronary guide — the LAD comes off the left main. The EBU, please.',
    thanks: 'EBU 3.5 — perfect.', fallback: 'I\'ll open the EBU myself — we are losing time.', gives: 'guide-in-hand',
    label: 'Left guide with back-up for the LAD (EBU 3.5)', points: 10,
    why: 'An extra-back-up guide (EBU / XB) rests against the opposite aortic wall and gives the support to push balloons and stents down the LAD. JR4 and AL1 are right-coronary shapes.',
  },
  {
    id: 'view', when: (s) => has(s, 'repositioned'),
    ask: 'Waveform\'s back. Give me a working view for the LAD — I want the diagonals and septals split.',
    accept: LAD_VIEWS, wrong: RCA_VIEWS,
    wrongSay: 'That is a right-coronary view — we are in the left system. Go cranial.',
    thanks: 'That is my view — hold it there.', fallback: 'I\'ll take the table-side controls: RAO cranial.', gives: 'view-set',
    label: 'Working view for the LAD (a cranial view)',
    why: 'Cranial angulation lifts the LAD clear of its diagonals and septals: RAO cranial, AP cranial or LAO cranial. Caudal views show the left main and circumflex; the right-coronary views show nothing of the LAD.',
  },
  {
    id: 'wire', when: (s) => has(s, 'view-set'),
    ask: 'Workhorse wire, please.',
    accept: ['wire-workhorse'], wrong: ['wire-hydrophilic'],
    wrongSay: 'Not a hydrophilic wire first — it slips under plaque and perforates more easily. A workhorse, please.',
    thanks: 'Thanks. Crossing now.', fallback: 'I\'ll get the wire myself.', gives: 'wire-in-hand',
    label: 'Workhorse coronary wire',
    why: 'A workhorse (soft-tip, non-hydrophilic) wire is the first choice to cross a fresh thrombotic occlusion. Polymer-jacketed hydrophilic wires are for tortuous vessels and chronic occlusions, and perforate more easily.',
  },
  {
    id: 'balloon', when: (s) => has(s, 'wired'),
    ask: 'Compliant balloon to pre-dilate, 2.5 by 15.',
    accept: ['balloon-predil'], wrong: ['balloon-nc', 'stent-des', 'stent-covered'],
    wrongSay: 'That is not what I asked for — a compliant balloon, 2.5 by 15, to open it up first.',
    thanks: 'Thanks. Inflating.', fallback: 'I\'ll get the balloon myself.', gives: 'balloon-in-hand',
    label: 'Compliant balloon for pre-dilation',
    why: 'A compliant (semi-compliant) balloon opens the occlusion so you can see the vessel and size the stent. Non-compliant balloons are for high-pressure post-dilation inside a stent.',
  },
  {
    id: 'stent', when: (s) => has(s, 'predilated'),
    ask: 'Drug-eluting stent, 3.5 by 28.',
    accept: ['stent-des'], wrong: ['stent-covered', 'balloon-nc', 'balloon-predil'],
    wrongSay: 'No — a drug-eluting stent, 3.5 by 28. A covered stent is only for a perforation.',
    thanks: '3.5 by 28 — confirmed. Positioning.', fallback: 'I\'ll open the stent myself.', gives: 'stent-in-hand',
    label: 'Drug-eluting stent, as ordered',
    why: 'Repeat the size back to the operator (closed loop) and check it on the box before you open it: a drug-eluting stent sized 1:1 to the reference vessel, long enough to cover the lesion edge to edge.',
  },
  {
    id: 'nc', when: (s) => has(s, 'rosc') && has(s, 'pci'),
    ask: 'Good shock. Now a non-compliant balloon, 3.75 by 15, to post-dilate.',
    accept: ['balloon-nc'], wrong: ['balloon-predil'],
    wrongSay: 'That is a compliant balloon — at high pressure it over-stretches the vessel at the stent edges. Non-compliant, please.',
    thanks: 'Thanks. High-pressure inflations inside the stent.', fallback: 'I\'ll get the NC balloon myself.', gives: 'nc-in-hand',
    label: 'Non-compliant balloon for post-dilation',
    why: 'A non-compliant balloon keeps its size at high pressure, so it expands the stent fully without over-stretching the vessel beyond it. Under-expansion is the strongest predictor of stent thrombosis.',
  },
];

/** What the operator asks the nurse for */
const RN_ASKS: LabAsk[] = [
  {
    id: 'cocktail', role: 4, when: (s) => has(s, 'access'),
    ask: 'Radial cocktail down the side-arm, please.',
    accept: ['radial-cocktail'], wrong: ['ic-verapamil', 'ic-nitro', 'ic-adenosine'],
    wrongSay: 'That is an intracoronary dose. I need the radial cocktail through the sheath, so the artery does not spasm.',
    thanks: 'Thanks — that keeps the radial open.', fallback: 'Tech, draw up the cocktail, please — I\'ll give it.', gives: 'cocktail-given',
    label: 'Radial cocktail through the sheath',
    why: 'Verapamil and nitroglycerin through the radial sheath prevent radial artery spasm (warn the patient: the arm burns for a few seconds).',
  },
  {
    id: 'pain', role: 4, when: (s) => has(s, 'predilated'),
    ask: 'He\'s hurting with the balloon up — something for the pain, please.',
    accept: ['fentanyl', 'sedation'],
    thanks: 'Thanks.', fallback: 'Is anyone giving him something for the pain?', gives: 'pain-treated',
    label: 'Analgesia when the operator asks (fentanyl)',
    why: 'Balloon inflation in the occluded artery brings back the ischaemic pain: give the analgesic (fentanyl 25–50 mcg IV) and say it back (closed loop).',
  },
  {
    id: 'icnitro', role: 4, when: (s) => has(s, 'postdilated'),
    ask: 'Two hundred of intracoronary nitro for the final pictures, please.',
    accept: ['ic-nitro'], wrong: ['ic-adenosine', 'ic-verapamil'],
    wrongSay: 'Not that one — nitroglycerin, so the vessel is fully dilated for the final pictures.',
    thanks: 'Thanks — injecting.', fallback: 'I\'ll draw up the nitro myself.', gives: 'icnitro-given',
    label: 'Intracoronary nitroglycerin before the final pictures',
    why: 'Intracoronary nitroglycerin relaxes spasm, so the final angiogram shows the true vessel size and flow. Check the blood pressure first: it drops it.',
  },
];

export const cathlabStemi: Scenario = {
  id: 'stemi-cathlab',
  title: 'STEMI alert: the patient arrives in the cath lab',
  summary: '61-year-old man with an anterior STEMI, straight from the ambulance to the table. Open the artery step by step — catheters, views, wires, balloons, the stent — and handle what reperfusion brings.',
  setting: 'cathlab',
  roles: [3, 4, 5],
  difficulty: 'advanced',
  conditionId: 'anterior-stemi',
  images: IMAGES,
  briefing: {
    default: [
      ['team', 'STEMI alert: 61-year-old man, anterior STEMI on the field ECG, 55 minutes from symptom onset. EMS gave aspirin 324 mg and nothing else.'],
      ['scene', 'He arrives on the stretcher, still in pain (7 out of 10), and slides over onto the table.'],
    ],
    3: [
      ['team', 'STEMI alert: 61-year-old man, anterior STEMI on the field ECG, 55 minutes from symptom onset. EMS gave aspirin 324 mg and nothing else.'],
      ['scene', 'He arrives on the stretcher, still in pain (7 out of 10), and slides over onto the table.'],
      ['team', 'You are the scrub tech: set-up, the transducers and the pads, the C-arm views, and every catheter, wire, balloon and stent the cardiologist asks for. The nurse is in the room.'],
    ],
    4: [
      ['team', 'STEMI alert: 61-year-old man, anterior STEMI on the field ECG, 55 minutes from symptom onset. EMS gave aspirin 324 mg and nothing else.'],
      ['scene', 'He arrives on the stretcher, still in pain (7 out of 10), and slides over onto the table.'],
      ['team', 'You are the procedural nurse: checks, IV, the drugs the cardiologist orders, the patient\'s comfort and safety. The tech is setting up; the cardiologist is scrubbing.'],
    ],
    5: [
      ['team', 'STEMI alert: 61-year-old man, anterior STEMI on the field ECG, 55 minutes from symptom onset. EMS gave aspirin 324 mg and nothing else.'],
      ['scene', 'He arrives on the stretcher, still in pain (7 out of 10), and slides over onto the table.'],
      ['team', 'You are the interventional cardiologist: every procedural choice is yours. The tech and the nurse are with you.'],
    ],
  },
  initial: {
    rhythm: { profile: 'anterior-stemi', hr: 94 },
    vitals: { sbp: 138, dbp: 86, spo2: 95, rr: 20, etco2: 35, pain: 7, gcs: 15, glucose: 140, temp: 36.7 },
  },
  facts: {
    allergies: 'No allergies — I had contrast for a CT last year without any problem. No blood thinners. Yes, go ahead.',
    sample: 'No allergies. Lisinopril. High blood pressure; ex-smoker.',
    opqrst: 'Crushing, central, into my jaw, for about an hour. 7 out of 10.',
    labs: 'Creatinine 1.0, potassium 4.1, haemoglobin 14.2, INR 1.0, platelets 250. Troponin pending.',
    ecg12: (s) => s.rhythm.profile === 'anterior-stemi-reperfused'
      ? 'Sinus rhythm 86: ST elevation in V1–V4 down by more than 70 %, early T-wave inversion — successful reperfusion.'
      : `Sinus rhythm ${s.rhythm.hr} with ST elevation in V1–V4 and reciprocal depression in III and aVF: anterior STEMI.`,
    echo: 'Anterior and apical hypokinesis, LVEF about 40 %, no pericardial effusion, no mechanical complication.',
    lvedp: 'LV 112/26 mmHg: LVEDP 26 mmHg.',
  },
  status: (s) => {
    if (!s.pulse) return 'Unresponsive.';
    if (has(s, 'pci')) return '"The pain is almost gone."';
    return '"It\'s still crushing."';
  },
  respond: {
    access: (s) => ({ say: [[operator(s), 'Right radial access: 6 Fr sheath in.']], flags: ['access'] }),
    angio: (s) => angioGate(s) ?? { ...angioRun('you'), flags: ['angio'] },
    reposition: (s) => has(s, 'damped')
      ? { say: [['you', 'Guide backed out of the left main: the aortic waveform is normal again.', 'good']], vitals: { sbp: 136, dbp: 84 }, flags: ['repositioned'] }
      : null,
    'wire-workhorse': (s) => (s.role === 5 && has(s, 'damped') && !has(s, 'repositioned') ? wedged : null),
    'wire-hydrophilic': (s) => (s.role === 5 && has(s, 'damped') && !has(s, 'repositioned') ? wedged : null),
    lvedp: (s) => !has(s, 'access') ? null : {
      say: [['monitor', 'LV 112/26 mmHg: LVEDP 26 mmHg.']], flags: ['lvedp'],
      read: { kind: 'hemo', answer: 'hemo-lvedp-high', explain: 'LVEDP 26 mmHg (normal is under 12–15): a stiff, failing left ventricle after a large anterior infarct. No extra fluid; watch for pulmonary oedema and shock.' },
    },
    'final-angio': (s) => (s.role === 5 ? { ...finalRun('you'), flags: ['final-angio'] } : null),
    defib: shockOutcome,
    aed: shockOutcome,
  },
  events: [
    {
      id: 'tech-setup', when: (s) => s.role !== 3,
      effect: () => ({ say: [['team', 'Tech: both sites prepped, transducers zeroed and levelled, monitor and defibrillator pads on.']], flags: ['prep', 'transducer', 'monitor', 'pads'] }),
    },
    {
      id: 'rn-setup-for-tech', when: (s) => s.role === 3,
      effect: () => ({ say: [['team', 'Nurse: consent and contrast allergy checked, IV in, heparin 70 units/kg and ticagrelor 180 mg given on the cardiologist\'s order.']], flags: ['consent', 'iv', 'heparin', 'p2y12'] }),
    },
    {
      id: 'rn-analgesia-for-tech', when: (s) => s.role === 3 && s.minute >= 3,
      effect: () => ({ say: [['team', 'Nurse: fentanyl 50 micrograms in for his pain.']], flags: ['analgesia'], vitals: { pain: 4 } }),
    },
    {
      id: 'rn-setup-for-md', when: (s) => s.role === 5,
      effect: () => ({ say: [['team', 'Nurse: IV in and labs drawn. Waiting for your orders.']], flags: ['iv', 'labs'] }),
    },
    {
      id: 'md-orders-for-rn', when: (s) => s.role === 4,
      effect: () => ({ say: [['operator', 'Load him, please: full anticoagulation for primary PCI and a P2Y12 inhibitor — and something for his pain.']] }),
    },
    {
      id: 'md-access', when: (s) => s.role !== 5 && has(s, 'timeout') && anticoagulated(s) && !has(s, 'access'),
      effect: () => ({ say: [['operator', 'Right radial: 6 French sheath in.']], flags: ['access'] }),
    },
    {
      id: 'md-angio', when: (s) => s.role !== 5 && has(s, 'access') && (s.role === 4 ? s.minute >= s.flags.access + 2 : has(s, 'diag-in-hand')),
      effect: () => ({ ...angioRun('operator'), flags: ['angio', 'catheter'] }),
    },
    ...TECH_ASKS.flatMap(askEvents),
    ...RN_ASKS.flatMap(askEvents),
    {
      id: 'md-guide', when: (s) => s.role !== 5 && has(s, 'angio') && nextStep(s, 'angio', 'guide-in-hand'),
      effect: () => ({ say: [['operator', 'EBU engaged in the left main.']], flags: ['guide', 'guide-left'] }),
    },
    {
      id: 'damped', when: (s) => has(s, 'guide'),
      effect: (s) => ({
        say: [
          ['monitor', 'Aortic pressure 82/64 — the waveform has lost its dicrotic notch and the diastolic pressure is falling.', 'bad'],
          ...(s.role === 5 ? [line('team', 'Tech: "Doctor — the pressure\'s damped!"', 'warn')] : []),
        ],
        // the arterial line reads the pressure at the wedged tip
        vitals: { sbp: 82, dbp: 64 },
        flags: ['damped'],
        ...(s.role !== 5 ? {
          read: {
            kind: 'hemo' as const, answer: 'hemo-damped', prompt: 'What is the pressure from the guide telling you?',
            explain: 'The guide has gone deep into the left main: its tip is against the vessel wall, so the pressure is damped and the artery is not filling. Call it out so the operator backs out at once.',
          },
        } : {}),
      }),
    },
    {
      id: 'md-reposition', when: (s) => s.role !== 5 && has(s, 'damped') && (has(s, 'callout') || s.minute >= s.flags.damped + 2),
      effect: (s) => ({
        say: has(s, 'callout')
          ? [['operator', 'Thanks — backing out. Waveform\'s back.', 'good']]
          : [['operator', 'Pressure\'s damped — who\'s watching the waveform? Backing out now.', 'warn']],
        vitals: { sbp: 136, dbp: 84 },
        flags: ['repositioned'],
      }),
    },
    {
      id: 'md-view-for-rn', when: (s) => s.role === 4 && has(s, 'repositioned'),
      effect: () => ({ say: [['operator', 'RAO cranial — that is my working view.']], flags: ['view-set'] }),
    },
    {
      id: 'md-wire', when: (s) => s.role !== 5 && has(s, 'view-set') && nextStep(s, 'view-set', 'wire-in-hand'),
      effect: () => ({ say: [['operator', 'Wire\'s across into the distal LAD.']], flags: ['wired'] }),
    },
    {
      id: 'md-predil', when: (s) => s.role !== 5 && has(s, 'wired') && nextStep(s, 'wired', 'balloon-in-hand'),
      effect: () => ({ say: [['operator', 'Balloon up… and down. Some flow down the LAD now.'], ['patient', '"Ow — that\'s the pain again!"']], flags: ['predilated'], vitals: { pain: 6 } }),
    },
    {
      id: 'qca', when: (s) => has(s, 'predilated'),
      effect: (s) => ({
        say: [['monitor', 'QCA after pre-dilation: reference diameter 3.4 mm proximal, 3.3 mm distal; lesion length 24 mm.']],
        ...(s.role === 5 ? {
          read: {
            kind: 'sizing' as const, answer: 'stent-3.5x28', partial: ['stent-3.5x23'], prompt: 'Which stent will you put in?',
            explain: 'Diameter 1:1 with the reference vessel (3.3–3.4 mm → 3.5 mm); length to cover the 24 mm lesion with healthy vessel at both edges (28 mm). A 23 mm stent would leave an edge of the lesion uncovered.',
          },
        } : {}),
      }),
    },
    {
      id: 'md-stent', when: (s) => s.role !== 5 && has(s, 'predilated') && nextStep(s, 'predilated', 'stent-in-hand'),
      effect: () => ({ say: [['operator', 'Stent deployed at 14 atmospheres. TIMI 3 flow.', 'good']], flags: ['stented', 'pci'], vitals: { pain: 3 } }),
    },
    {
      id: 'reperfusion-vf', when: (s) => has(s, 'pci') && s.pulse,
      effect: (s) => ({
        say: [
          ['monitor', 'Monitor alarm on reflow — he is unresponsive!', 'bad'],
          ...(s.role === 5 ? [line('team', 'Tech: "Doctor — look at the monitor!"', 'bad')] : []),
        ],
        rhythm: { profile: 'vf', hr: 0 }, pulse: false, flags: ['vf'],
      }),
    },
    {
      id: 'md-postdil', when: (s) => s.role !== 5 && has(s, 'rosc') && has(s, 'pci') && nextStep(s, 'rosc', 'nc-in-hand'),
      effect: () => ({ say: [['operator', 'Post-dilated: the stent is fully expanded.']], flags: ['postdilated'] }),
    },
    {
      id: 'md-final', when: (s) => s.role !== 5 && has(s, 'postdilated') && (s.role !== 4 || has(s, 'icnitro-given')),
      effect: () => ({ ...finalRun('operator'), flags: ['final-angio'] }),
    },
  ],
  critical: [
    { id: 'consent', label: 'Consent, contrast allergy and anticoagulants checked', why: 'Even in an emergency, confirm consent and allergies (contrast, heparin) before access.', done: ['consent'], roles: [4, 5], points: 10, target: { by: 6 } },
    { id: 'timeout', label: 'Procedural time-out before access', why: 'The time-out catches wrong-patient, wrong-procedure and allergy errors before anyone punctures an artery.', done: ['timeout'], points: 10, target: { by: 6 } },
    { id: 'prep', label: 'Prep and drape both radial and femoral sites', why: 'Radial first, but a femoral site ready for bail-out or mechanical support.', done: ['prep'], roles: TECH, points: 5, target: { by: 6 } },
    { id: 'transducer', label: 'Zero and level the transducers', why: 'Accurate pressures need transducers zeroed to air and levelled at the phlebostatic axis.', done: ['transducer'], roles: TECH, points: 10, target: { by: 6 } },
    { id: 'pads', label: 'Defibrillator pads on before the wire crosses', why: 'Reperfusion of a large anterior STEMI often triggers VF.', done: ['pads'], roles: TECH, points: 10, target: { by: 8 } },
    { id: 'iv', label: 'IV access', why: 'For heparin, analgesia and emergency drugs.', done: ['iv', 'io'], roles: RN, points: 5 },
    { id: 'heparin', label: 'Anticoagulation before PCI (heparin 70–100 U/kg)', why: 'Primary PCI needs full anticoagulation to prevent catheter, wire and stent thrombosis (bivalirudin is the alternative).', done: ['heparin', 'bivalirudin'], roles: [4, 5], points: 10, target: { by: 10 } },
    { id: 'p2y12', label: 'P2Y12 loading dose', why: 'Ticagrelor 180 mg or prasugrel 60 mg as early as possible for primary PCI (cangrelor IV if he cannot swallow).', done: ['p2y12', 'cangrelor'], roles: [4, 5], points: 5 },
    { id: 'analgesia', label: 'Treat the pain', why: 'Ischaemic pain drives catecholamines and heart rate: fentanyl 25–50 mcg IV, titrated.', done: ['fentanyl', 'sedation'], roles: [4, 5], points: 5, target: { by: 8 } },
    { id: 'act', label: 'Check the ACT', why: 'ACT about 250–300 s with heparin alone before the wire crosses.', done: ['act'], after: 'heparin', roles: [3, 4], points: 5 },
    { id: 'access', label: 'Radial arterial access', why: 'Radial access cuts bleeding and mortality in STEMI (RIVAL, MATRIX).', done: ['access', 'access-femoral'], roles: MD, points: 5, target: { by: 12 } },
    { id: 'angio', label: 'Diagnostic angiography: find the culprit', why: 'Identify the occluded artery before choosing a guide.', done: ['angio'], roles: MD, points: 5 },
    { id: 'guide', label: 'A left guide with back-up for the LAD (EBU / XB)', why: 'The guide must sit in the left main and give support down the LAD; right-coronary shapes (JR4, AL1) will not.', done: ['guide-ebu'], roles: MD, points: 10 },
    ...TECH_ASKS.map(askCritical),
    ...RN_ASKS.map(askCritical),
    { id: 'callout', label: 'Call out the damped waveform at once', why: 'A damped pressure from the guide means its tip is wedged in the ostium, stopping flow down the artery. Say it out loud immediately.', done: ['callout'], after: 'damped', roles: [3, 4], points: 15, target: { within: { flag: 'damped', minutes: 1 } }, applies: (s) => has(s, 'damped') },
    { id: 'reposition', label: 'Back the wedged guide out at once', why: 'A wedged guide blocks coronary flow and can dissect the ostium.', done: ['reposition'], after: 'damped', roles: MD, points: 10, target: { within: { flag: 'damped', minutes: 1 } }, applies: (s) => has(s, 'damped') },
    { id: 'working-view', label: 'A working view for the LAD (cranial)', why: 'RAO cranial, AP cranial or LAO cranial lift the LAD clear of its branches, so you can see where the wire goes.', done: (s) => doneAfter(s, LAD_VIEWS, 'guide'), roles: MD, points: 5 },
    { id: 'wire', label: 'Wire across the occlusion', why: 'A workhorse wire into the distal vessel restores some flow and carries the balloon and the stent.', done: WIRES, roles: MD, points: 5 },
    { id: 'stent', label: 'Drug-eluting stent in the culprit', why: 'Door-to-device within 90 minutes; drug-eluting stents beat bare-metal ones in STEMI.', done: ['stent-des'], roles: MD, points: 15, target: { by: 30 } },
    { id: 'postdil', label: 'Optimise the stent with a non-compliant balloon', why: 'Under-expansion is the strongest predictor of stent thrombosis and restenosis: a short NC balloon at high pressure inside the stent.', done: ['balloon-nc'], after: 'pci', roles: MD, points: 5, applies: (s) => has(s, 'pci') },
    { id: 'final', label: 'Final angiogram in two views', why: 'Confirm TIMI 3 flow and look for edge dissection, thrombus or a perforation before you leave the vessel.', done: ['final-angio'], after: 'pci', roles: MD, points: 5, applies: (s) => has(s, 'pci') },
    { id: 'defib', label: 'Defibrillate the reperfusion VF within 1 minute', why: 'In the lab, VF is witnessed with pads on: shock within seconds and most patients recover at once.', done: ['defib', 'aed'], after: 'arrest', points: 15, target: { within: { flag: 'arrest', minutes: 1 } }, applies: (s) => has(s, 'arrest') },
    { id: 'post-ecg', label: '12-lead after the procedure', why: 'ST resolution confirms reperfusion and is the baseline for later comparison.', done: ['ecg12', 'ecg12-repeat'], after: 'pci', points: 5, applies: (s) => has(s, 'pci') },
    { id: 'echo', label: 'Echocardiogram after PCI', why: 'LVEF and mechanical complications guide therapy (and a later ICD decision).', done: ['echo'], after: 'pci', roles: MD, points: 5, applies: (s) => has(s, 'pci') },
    { id: 'hemostasis', label: 'Access-site haemostasis', why: 'Radial band with distal pulse and perfusion checks.', done: ['hemostasis'], after: 'pci', roles: [3, 4], points: 5, applies: (s) => has(s, 'pci') },
    { id: 'handoff', label: 'Hand-off to the cardiac care unit', why: 'Report the culprit, the stent, the drugs, the VF and the access site.', done: ['handoff'], roles: [4, 5], points: 5 },
  ],
  harms: [
    { id: 'pci-no-heparin', actions: [...WIRES, 'balloon-predil', 'stent-des', 'aspiration'], roles: MD, when: (s) => !anticoagulated(s), points: 15, severity: 'critical', text: 'Wiring and ballooning the artery without anticoagulation. Catheters, wires and stents clot without heparin (or bivalirudin).' },
    { id: 'access-no-timeout', actions: ['access', 'access-femoral'], when: (s) => !has(s, 'timeout'), points: 5, severity: 'major', text: 'Arterial access before the time-out.' },
    { id: 'access-no-consent', actions: ['access', 'access-femoral'], when: (s) => !has(s, 'consent'), points: 5, severity: 'major', text: 'Access before confirming consent and allergies in an awake patient who can give them.' },
    { id: 'right-guide-for-lad', actions: RIGHT_GUIDES, roles: MD, when: (s) => has(s, 'angio'), points: 5, severity: 'minor', text: 'A right-coronary guide for an LAD culprit. The LAD comes off the left main: use a left guide with back-up (EBU / XB 3.5).' },
    { id: 'hydrophilic-first', actions: ['wire-hydrophilic'], roles: MD, when: (s) => !has(s, 'wired'), points: 2, severity: 'minor', text: 'A hydrophilic wire as the first wire for a fresh occlusion. Start with a workhorse wire: polymer-jacketed wires track under plaque and perforate more easily.' },
    { id: 'covered-no-perforation', actions: ['stent-covered'], roles: [3, 5], when: (s) => !has(s, 'perforation'), points: 4, severity: 'minor', text: 'A covered stent without a perforation. Covered stents seal perforations; they restenose and clot more than drug-eluting stents.' },
    { id: 'opened-early', actions: ['balloon-predil', 'stent-des', 'balloon-nc', 'stent-covered'], roles: TECH, when: (s) => !has(s, 'wired'), points: 2, severity: 'minor', text: 'A balloon or stent opened before there was a wire to put it on. Open devices when the operator asks for them (and confirm the size): an opened device that is not used is wasted.' },
    askHarm(TECH_ASKS[0], 'The wrong diagnostic catheter for what the operator asked. From the right radial a Tiger does both coronaries; a JL4 or JR4 does one side; a pigtail is for the LV.'),
    askHarm(TECH_ASKS[1], 'A right-coronary guide when the operator asked for a left guide. The LAD comes off the left main: EBU / XB.', 5),
    askHarm(TECH_ASKS[2], 'A right-coronary view while the operator works in the left system. The LAD needs a cranial view.'),
    askHarm(TECH_ASKS[3], 'A hydrophilic wire when the operator asked for a workhorse. Hydrophilic wires perforate more easily; they are not the first wire for a fresh occlusion.'),
    askHarm(TECH_ASKS[4], 'The wrong device when the operator asked for a compliant pre-dilation balloon.'),
    askHarm(TECH_ASKS[5], 'The wrong device when the operator asked for a drug-eluting stent. Check the order and the box before you open it.'),
    askHarm(TECH_ASKS[6], 'A compliant balloon when the operator asked for a non-compliant one. At high pressure a compliant balloon over-stretches the vessel at the stent edges.'),
    askHarm(RN_ASKS[0], 'An intracoronary drug when the operator asked for the radial cocktail.'),
    askHarm(RN_ASKS[2], 'The wrong intracoronary drug when the operator asked for nitroglycerin.'),
    { id: 'lytic-in-lab', actions: ['tnk'], points: 15, severity: 'critical', text: 'Fibrinolysis has no place when primary PCI is happening: it only adds bleeding risk.' },
    { id: 'beta-blocker', actions: ['metoprolol'], points: 6, severity: 'major', text: 'An IV beta-blocker in the acute phase of a large anterior STEMI. It risks cardiogenic shock (COMMIT).' },
    { id: 'oxygen-normoxic', actions: ['o2-nc', 'o2-nrb'], when: (s) => s.pulse && s.vitals.spo2 >= 90, points: 2, severity: 'minor', text: 'Oxygen with an SpO₂ of 90 % or more. Oxygen is for SpO₂ below 90 %.' },
  ],
  timings: [
    { label: 'Time-out', actions: ['timeout'], target: 6 },
    { label: 'Artery open (arrival to device)', actions: ['stent-des'], flag: 'pci', target: 30 },
    { label: 'Damped waveform dealt with', actions: ['callout', 'reposition'], target: 1, from: 'damped' },
    { label: 'Shock after VF began', actions: ['defib', 'aed'], target: 1, from: 'arrest' },
  ],
  deathAfter: 8,
  completeWhen: (s) => has(s, 'pci') && has(s, 'final-angio'),
  teaching: [
    'Time-out before every procedure: patient, procedure, site, allergies (contrast) and anticoagulation.',
    'Zero to air and level at the phlebostatic axis. A damped pressure from the guide means a wedged catheter — call it out and back out at once.',
    'Anticoagulate before the wire (heparin 70–100 U/kg, ACT about 250–300 s) and load a P2Y12 inhibitor.',
    'Radial access first (fewer bleeding complications: RIVAL, MATRIX), with a radial cocktail against spasm.',
    'Catheters: a Tiger does both coronaries from the radial; JL4 the left, JR4 the right. Guides: EBU / XB for the left system, JR4 or AL1 for the right.',
    'Views: cranial views (RAO, AP, LAO cranial) for the LAD; caudal views for the left main and circumflex; LAO, RAO and AP cranial views of the RCA.',
    'Workhorse wire first; pre-dilate with a compliant balloon; size the stent 1:1 to the reference vessel and edge to edge; post-dilate with a non-compliant balloon.',
    'Reperfusion often brings arrhythmias — accelerated idioventricular rhythm or VF. Pads on before the wire crosses; shock VF immediately.',
  ],
};
