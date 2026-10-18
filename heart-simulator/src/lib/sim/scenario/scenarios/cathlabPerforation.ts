import type { Effect, PendingRead, Scenario, SimState } from '../types';
import { has, line } from '../kit';
import { MD, RN, TECH, askCritical, askEvents, askHarm, cine, operator, type LabAsk } from '../labKit';

/** Real angiograms for this patient: cine view id → key of CATH_IMAGES (none yet: until then the findings are said in words) */
const IMAGES: Partial<Record<string, string>> = {};

const perforationRead: Omit<PendingRead, 'minute'> = {
  kind: 'clinical', answer: 'clin-perforation', partial: ['clin-dissection'], prompt: 'What just happened?',
  explain: 'A coronary perforation: contrast streaming out through the vessel wall (an Ellis type III, the most dangerous kind). Blood is filling the pericardium. Balloon up over the hole at once, call the surgeons, and watch for tamponade.',
};
const tamponadeRead: Omit<PendingRead, 'minute'> = {
  kind: 'clinical', answer: 'clin-tamponade', partial: ['clin-perforation'], prompt: 'What is happening to her circulation now?',
  explain: 'Cardiac tamponade: blood in the pericardium squeezes the heart so it cannot fill — falling pressure, rising heart rate and RA pressure, a heart border that barely moves. Drain it (echo-guided pericardiocentesis) and keep the leak sealed.',
};

const finalRun = (who: 'you' | 'operator') => cine('final-angio', 'Final angiogram: the circumflex in two views', IMAGES['final-angio'], [
  [who, 'No more contrast outside the vessel: the covered stent has sealed it. TIMI 3 flow in the circumflex.', 'good'],
], { kind: 'angio', answer: 'angio-timi3', explain: 'The leak is sealed: no contrast outside the vessel and TIMI 3 flow.' });

const drain = (s: SimState): Effect => ({
  say: [['you', 'Pericardial drain in under echo: 180 mL of blood out.'], ['monitor', 'BP 112/70. Heart rate 98.', 'good']],
  vitals: { sbp: 112, dbp: 70, gcs: 15 }, rhythm: { ...s.rhythm, hr: 98 }, pulse: true, flags: ['pericardiocentesis', 'drained'],
});

const TECH_ASKS: LabAsk[] = [
  {
    id: 'tray', when: (s) => has(s, 'perforation'), early: true, wait: 4, within: 1,
    ask: 'Balloon is back up. Open the pericardiocentesis tray — and get the echo machine in here, now.',
    accept: ['pericardiocentesis'],
    thanks: 'Thanks — tray ready.', fallback: 'Where is the pericardiocentesis tray?! I\'ll open it myself.', gives: 'tray-ready',
    label: 'Pericardiocentesis tray open at once',
    why: 'A perforation can turn into tamponade within minutes: needle, wire, drain and a bag on the table before anyone needs them.',
  },
  {
    id: 'covered', when: (s) => has(s, 'drained'),
    ask: 'She is stable. Covered stent, 3.0 by 16, please — I\'m sealing it.',
    accept: ['stent-covered'], wrong: ['stent-des', 'balloon-nc', 'balloon-predil'],
    wrongSay: 'Not that — a drug-eluting stent does not seal a hole. A covered stent, please.',
    thanks: '3.0 by 16 covered — confirmed.', fallback: 'I\'ll open the covered stent myself.', gives: 'covered-in-hand',
    label: 'Covered stent to seal the perforation',
    why: 'A covered (PTFE) stent seals a perforation of a large vessel; small distal perforations are sealed with coils or fat instead.',
  },
];

const RN_ASKS: LabAsk[] = [
  {
    id: 'support', role: 4, when: (s) => has(s, 'perforation'), within: 2,
    ask: 'Her pressure is falling — support it, please.',
    accept: ['fluid', 'push-epi', 'pressor'], wrong: ['nitro', 'metoprolol', 'gp2b3a'],
    wrongSay: 'No! That makes it worse. Fluid, wide open.',
    thanks: 'Thanks.', fallback: 'Open the fluids, someone!', gives: 'supported',
    label: 'Support the falling pressure (fluid wide open)',
    why: 'Fluid keeps the heart filling against the blood collecting around it; push-dose epinephrine or a pressor bridges until it is drained.',
  },
  {
    id: 'surgery', role: 4, when: (s) => has(s, 'perforation'), within: 3,
    ask: 'And get cardiac surgery on the phone — now.',
    accept: ['call-surgery'],
    thanks: 'Thanks.', fallback: 'Has anyone called surgery? I\'ll call them myself.', gives: 'surgery-called',
    label: 'Call cardiac surgery at once',
    why: 'An Ellis III perforation may need surgery if it cannot be sealed: the surgeons need to know now, not after the patient arrests.',
  },
  {
    id: 'act', role: 4, when: (s) => has(s, 'drained'),
    ask: 'What is her ACT? I\'m deciding about protamine.',
    accept: ['act'],
    thanks: 'Thanks. I\'ll seal it first and leave the heparin for now — the stent is fresh.', fallback: 'I\'ll check the ACT myself.', gives: 'act-known',
    label: 'ACT before deciding on protamine',
    why: 'Protamine reverses heparin and helps seal a perforation, but with a fresh stent it risks stent thrombosis: the operator weighs it with the ACT in hand.',
  },
];

export const cathlabPerforation: Scenario = {
  id: 'perforation-cathlab',
  title: 'Elective PCI: a coronary perforation',
  summary: '66-year-old woman, elective stenting of the circumflex. The post-dilation goes wrong: see it, seal it, drain it — fast.',
  setting: 'cathlab',
  roles: [3, 4, 5],
  difficulty: 'advanced',
  conditionId: 'cardiac-tamponade',
  images: IMAGES,
  briefing: {
    default: [
      ['team', 'Elective PCI: 66-year-old woman with exertional angina. A 3.0 × 18 mm drug-eluting stent has just gone into the mid circumflex from the right radial. Heparin 100 units/kg on board; clopidogrel loaded.'],
      ['scene', 'She is awake and comfortable. The operator post-dilates the stent with a non-compliant balloon at high pressure.'],
    ],
    3: [
      ['team', 'Elective PCI: 66-year-old woman with exertional angina. A 3.0 × 18 mm drug-eluting stent has just gone into the mid circumflex from the right radial. Heparin 100 units/kg on board; clopidogrel loaded.'],
      ['scene', 'She is awake and comfortable. The operator post-dilates the stent with a non-compliant balloon at high pressure.'],
      ['team', 'You are the scrub tech, at the table.'],
    ],
    4: [
      ['team', 'Elective PCI: 66-year-old woman with exertional angina. A 3.0 × 18 mm drug-eluting stent has just gone into the mid circumflex from the right radial. Heparin 100 units/kg on board; clopidogrel loaded.'],
      ['scene', 'She is awake and comfortable. The operator post-dilates the stent with a non-compliant balloon at high pressure.'],
      ['team', 'You are the procedural nurse, at her side.'],
    ],
    5: [
      ['team', 'Elective PCI: 66-year-old woman with exertional angina. A 3.0 × 18 mm drug-eluting stent has just gone into the mid circumflex from the right radial. Heparin 100 units/kg on board; clopidogrel loaded.'],
      ['scene', 'She is awake and comfortable. You post-dilate the stent with a non-compliant balloon at high pressure.'],
      ['team', 'You are the interventional cardiologist. The tech and the nurse are with you.'],
    ],
  },
  initial: {
    rhythm: { profile: 'normal-sinus', hr: 74 },
    vitals: { sbp: 128, dbp: 76, spo2: 97, rr: 16, etco2: 35, pain: 1, gcs: 15, glucose: 118, temp: 36.6 },
  },
  facts: {
    allergies: 'No allergies. Yes — I agreed to the stent.',
    sample: 'No allergies. Aspirin, clopidogrel, atorvastatin, lisinopril. High blood pressure.',
    labs: 'Pre-procedure: haemoglobin 13.1, creatinine 0.8, platelets 240, INR 1.0.',
    ecg12: (s) => `Sinus rhythm ${s.rhythm.hr}, low voltage in the limb leads, no new ST elevation.`,
    echo: 'A new pericardial effusion, 1.5 cm, with the right ventricle collapsing in diastole and a plethoric IVC.',
  },
  status: (s) => (!s.pulse ? 'Unresponsive.' : has(s, 'drained') ? '"I feel better now."' : has(s, 'tamponade') ? '"I feel faint… something\'s wrong."' : '"My chest feels tight."'),
  respond: {
    'balloon-tamponade': () => ({ say: [['you', 'Balloon back up at 4 atmospheres over the hole: the leak stops while it is inflated.']], flags: ['balloon-tamponade', 'balloon-up'] }),
    pericardiocentesis: (s) => {
      if (s.role === 3) return { say: [['you', 'Pericardiocentesis tray open: needle, wire, drain and a drainage bag; echo probe in a sterile sleeve.']], flags: ['pericardiocentesis-ready'] };
      if (!has(s, 'echo')) return { blocked: true, say: [['system', 'Get the echo first: it confirms the effusion and guides the needle.']] };
      return drain(s);
    },
    echo: (s) => ({ say: [['you', has(s, 'drained') ? 'A small residual effusion; the right ventricle fills normally.' : 'A new pericardial effusion, 1.5 cm, with the right ventricle collapsing in diastole and a plethoric IVC.']], flags: ['echo'] }),
    'stent-covered': (s) => (s.role === 5 ? { say: [['you', 'Covered stent, 3.0 × 16, deployed across the hole.']], flags: ['covered-stent', 'sealed'] } : null),
    'final-angio': (s) => (s.role === 5 ? { ...finalRun('you'), flags: ['final-angio'] } : null),
    fluid: (s) => ({ say: [['monitor', `Fluid wide open. BP ${s.vitals.sbp + 10}/${s.vitals.dbp + 6}.`]], vitals: { sbp: s.vitals.sbp + 10, dbp: s.vitals.dbp + 6 }, flags: ['fluid'] }),
    cpr: (s) => (!s.pulse ? { say: [['you', 'Compressions — but the heart is squeezed by the blood around it: CPR barely moves a pressure.', 'warn']], flags: ['cpr'] } : null),
  },
  events: [
    {
      id: 'setup', when: () => true,
      effect: () => ({ flags: ['consent', 'timeout', 'iv', 'prep', 'transducer', 'monitor', 'pads', 'access', 'catheter', 'angio', 'heparin', 'p2y12', 'guide', 'guide-left', 'wired', 'stented', 'pci'] }),
    },
    {
      id: 'perforation', when: () => true,
      effect: (s) => ({
        say: [
          [operator(s), 'Post-dilating at 18 atmospheres… and down.'],
          ['monitor', IMAGES.perforation
            ? 'Cine recorded after the post-dilation — look at the run (Imaging). BP 98/62, heart rate 108.'
            : 'On the next injection a jet of contrast streams out beyond the vessel wall and stays there after the artery has cleared. BP 98/62, heart rate 108.', 'bad'],
          ['patient', '"Ooh — my chest feels tight."'],
          ...(s.role !== 5 ? [line('operator', 'Balloon back up — now!', 'bad')] : []),
        ],
        vitals: { sbp: 98, dbp: 62 }, rhythm: { ...s.rhythm, hr: 108 },
        image: { id: 'perforation', view: 'The run after the post-dilation', image: IMAGES.perforation },
        flags: ['perforation', ...(s.role !== 5 ? ['balloon-up'] : [])], read: perforationRead,
      }),
    },
    ...TECH_ASKS.flatMap(askEvents),
    ...RN_ASKS.flatMap(askEvents),
    {
      id: 'tamponade', when: (s) => has(s, 'perforation') && !has(s, 'drained') && s.minute >= (has(s, 'balloon-up') ? 2 : 1),
      effect: (s) => ({
        say: [
          ['monitor', 'BP 76/52, heart rate 124; the RA pressure is rising. On fluoroscopy the heart border barely moves.', 'bad'],
          ['patient', '"I feel faint…"'],
          ...(s.role === 5 ? [line('team', 'Tech: "Doctor — pressure\'s 76!"', 'warn')] : []),
        ],
        vitals: { sbp: 76, dbp: 52, gcs: 14 }, rhythm: { ...s.rhythm, hr: 124 }, flags: ['tamponade'], read: tamponadeRead,
      }),
    },
    {
      id: 'surgery-for-tech', when: (s) => s.role === 3 && has(s, 'perforation'),
      effect: () => ({ say: [['team', 'Nurse: fluids wide open; cardiac surgery is on the phone.']], flags: ['fluid', 'surgery-called'] }),
    },
    {
      id: 'md-drains', when: (s) => s.role !== 5 && has(s, 'tamponade') && !has(s, 'drained') && (s.role === 3 ? has(s, 'tray-ready') : s.minute >= s.flags.tamponade + 1),
      effect: (s) => ({ ...drain(s), say: [['operator', 'Echo: effusion with RV collapse. Needle in… drain in: 180 mL of blood out.'], ['monitor', 'BP 112/70. Heart rate 98.', 'good']], flags: ['echo', 'pericardiocentesis', 'drained'] }),
    },
    {
      id: 'arrest', when: (s) => has(s, 'tamponade') && !has(s, 'drained') && s.pulse && s.minute >= s.flags.tamponade + 5,
      effect: () => ({ say: [['monitor', 'No pressure on the arterial line; the monitor still shows complexes.', 'bad'], ['patient', 'She is unresponsive.']], rhythm: { profile: 'pea', hr: 110 }, pulse: false, flags: ['pea'] }),
    },
    {
      id: 'md-cover', when: (s) => s.role !== 5 && has(s, 'drained') && (s.role === 4 ? has(s, 'act-known') : has(s, 'covered-in-hand')),
      effect: () => ({ say: [['operator', 'Covered stent deployed across the hole.']], flags: ['covered-stent', 'sealed'] }),
    },
    {
      id: 'md-final', when: (s) => s.role !== 5 && has(s, 'sealed'),
      effect: () => ({ ...finalRun('operator'), flags: ['final-angio'] }),
    },
  ],
  critical: [
    { id: 'balloon', label: 'Balloon up over the perforation at once', why: 'A low-pressure balloon over the hole stops the bleeding into the pericardium while you get everything else ready.', done: ['balloon-tamponade'], roles: MD, points: 15, target: { within: { flag: 'perforation', minutes: 1 } } },
    { id: 'callout', label: 'Call out the contrast outside the vessel', why: 'Say it out loud: the whole team has to switch to the perforation plan.', done: ['callout'], after: 'perforation', roles: [3, 4], points: 10, target: { within: { flag: 'perforation', minutes: 1 } } },
    { id: 'md-surgery', label: 'Call cardiac surgery early', why: 'An Ellis III perforation may need surgery; the surgeons need time to get ready.', done: ['call-surgery'], after: 'perforation', roles: MD, points: 5, target: { within: { flag: 'perforation', minutes: 3 } } },
    { id: 'md-support', label: 'Support the pressure (fluid, push-dose epinephrine)', why: 'Keep the heart filling against the effusion until it is drained.', done: ['fluid', 'push-epi', 'pressor'], after: 'perforation', roles: MD, points: 5 },
    { id: 'md-echo', label: 'Echo to look for the effusion', why: 'Echo confirms the effusion and tamponade physiology and guides the needle.', done: ['echo'], roles: MD, points: 5 },
    { id: 'md-drain', label: 'Drain the tamponade (echo-guided pericardiocentesis)', why: 'Taking out even 100–200 mL brings the pressure back.', done: ['pericardiocentesis'], roles: MD, points: 15, target: { within: { flag: 'tamponade', minutes: 6 } }, applies: (s) => has(s, 'tamponade') },
    { id: 'md-cover', label: 'Seal the hole with a covered stent', why: 'A covered stent seals a perforation of a large vessel for good.', done: ['stent-covered'], roles: MD, points: 10 },
    { id: 'final', label: 'Final angiogram: no more leak', why: 'Prove the seal before you leave.', done: ['final-angio'], after: 'perforation', roles: MD, points: 5 },
    ...TECH_ASKS.map(askCritical),
    ...RN_ASKS.map(askCritical),
    { id: 'hemostasis', label: 'Radial band and distal perfusion check', why: 'Patent haemostasis, as always.', done: ['hemostasis'], after: 'sealed', roles: [3, 4], points: 5, applies: (s) => has(s, 'sealed') },
    { id: 'handoff', label: 'Hand-off to the cardiac ICU', why: 'The perforation, the covered stent, the drain and how much came out, the heparin decision, surgery\'s plan, and a repeat echo.', done: ['handoff'], roles: [4, 5], points: 5 },
  ],
  harms: [
    { id: 'des-for-perforation', actions: ['stent-des'], roles: MD, when: (s) => has(s, 'perforation'), points: 4, severity: 'minor', text: 'A drug-eluting stent for a perforation. It does not seal the hole; a covered stent does.' },
    { id: 'gp-in-perforation', actions: ['gp2b3a'], when: (s) => has(s, 'perforation'), points: 12, severity: 'critical', text: 'A GP IIb/IIIa inhibitor during an active perforation. It keeps the hole bleeding.' },
    { id: 'more-heparin', actions: ['heparin', 'bivalirudin'], when: (s) => has(s, 'perforation'), points: 10, severity: 'major', text: 'More anticoagulant during an active perforation.' },
    { id: 'nitro-in-tamponade', actions: ['nitro', 'ic-nitro'], when: (s) => has(s, 'perforation'), points: 6, severity: 'major', text: 'Nitroglycerin with a falling pressure from tamponade. It lowers the filling the heart depends on.' },
    { id: 'beta-blocker', actions: ['metoprolol'], when: (s) => has(s, 'perforation'), points: 8, severity: 'major', text: 'A beta-blocker in tamponade. The fast heart rate is what keeps her output up.' },
    askHarm(TECH_ASKS[1], 'The wrong device when the operator asked for a covered stent to seal the perforation.'),
    askHarm(RN_ASKS[0], 'A drug that drops the pressure (or keeps the hole bleeding) when the operator asked you to support it.', 5),
  ],
  timings: [
    { label: 'Balloon up over the hole', actions: ['balloon-tamponade'], flag: 'balloon-up', target: 1, from: 'perforation' },
    { label: 'Tamponade drained', actions: ['pericardiocentesis'], flag: 'drained', target: 6, from: 'tamponade' },
  ],
  deathAfter: 8,
  completeWhen: (s) => has(s, 'sealed') && has(s, 'drained') && has(s, 'final-angio'),
  teaching: [
    'A perforation shows as contrast leaving the vessel: Ellis I (a crater), II (a blush in the fat or muscle), III (a jet through a hole ≥ 1 mm, or into a chamber). Type III is a tamponade waiting to happen.',
    'First: a balloon up over the hole at low pressure. Then: call surgery, the pericardiocentesis tray and the echo, stop any GP IIb/IIIa inhibitor, support the pressure with fluid.',
    'Tamponade: falling pressure, rising heart rate and RA pressure, a still heart border on fluoroscopy, RV collapse on echo. Drain it — CPR does little while the heart is squeezed.',
    'Seal it for good: a covered stent for a large vessel; coils, fat or thrombin for small distal ones.',
    'Protamine reverses heparin and helps seal the leak, but risks thrombosis of a fresh stent: the operator weighs it, with the ACT in hand.',
  ],
};
