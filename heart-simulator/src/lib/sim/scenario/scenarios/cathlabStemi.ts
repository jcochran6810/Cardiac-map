import type { Effect, Scenario, SimState } from '../types';
import { has, line } from '../kit';

const operator = (s: SimState) => (s.role === 5 ? 'you' : 'operator');

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

export const cathlabStemi: Scenario = {
  id: 'stemi-cathlab',
  title: 'STEMI alert: the patient arrives in the cath lab',
  summary: '61-year-old man with an anterior STEMI, straight from the ambulance to the table. Get him safely to reperfusion — and handle what reperfusion brings.',
  setting: 'cathlab',
  roles: [3, 4, 5],
  difficulty: 'advanced',
  conditionId: 'anterior-stemi',
  briefing: {
    default: [
      ['team', 'STEMI alert: 61-year-old man, anterior STEMI on the field ECG, 55 minutes from symptom onset. EMS gave aspirin 324 mg and nothing else.'],
      ['scene', 'He arrives on the stretcher, still in pain (7 out of 10), and slides over onto the table.'],
    ],
    3: [
      ['team', 'STEMI alert: 61-year-old man, anterior STEMI on the field ECG, 55 minutes from symptom onset. EMS gave aspirin 324 mg and nothing else.'],
      ['scene', 'He arrives on the stretcher, still in pain (7 out of 10), and slides over onto the table.'],
      ['team', 'You are the cath lab tech: set-up, monitoring and the transducers. The nurse and the interventional cardiologist are in the room.'],
    ],
    4: [
      ['team', 'STEMI alert: 61-year-old man, anterior STEMI on the field ECG, 55 minutes from symptom onset. EMS gave aspirin 324 mg and nothing else.'],
      ['scene', 'He arrives on the stretcher, still in pain (7 out of 10), and slides over onto the table.'],
      ['team', 'You are the procedural nurse. The tech is setting up; the interventional cardiologist is scrubbing.'],
    ],
    5: [
      ['team', 'STEMI alert: 61-year-old man, anterior STEMI on the field ECG, 55 minutes from symptom onset. EMS gave aspirin 324 mg and nothing else.'],
      ['scene', 'He arrives on the stretcher, still in pain (7 out of 10), and slides over onto the table.'],
      ['team', 'You are the interventional cardiologist. The tech and the nurse are with you.'],
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
      : s.rhythm.profile === 'anterior-stemi'
        ? `Sinus rhythm ${s.rhythm.hr} with ST elevation in V1–V4 and reciprocal depression in III and aVF: anterior STEMI.`
        : 'No 12-lead during the arrest.',
    echo: 'Anterior and apical hypokinesis, LVEF about 40 %, no pericardial effusion, no mechanical complication.',
  },
  status: (s) => {
    if (!s.pulse) return 'Unresponsive.';
    if (has(s, 'pci')) return '"The pain is almost gone."';
    return '"It\'s still crushing."';
  },
  respond: {
    access: (s) => ({ say: [[operator(s), 'Right radial access: 6 Fr sheath in, radial cocktail given.']], flags: ['access'] }),
    angio: (s) => has(s, 'access')
      ? { say: [['you', 'Proximal LAD 100 % occluded (TIMI 0). Circumflex and RCA: mild disease. Culprit found.']], flags: ['angio'] }
      : { blocked: true, say: [['system', 'You need arterial access first.']] },
    reposition: (s) => has(s, 'damped')
      ? { say: [['you', 'Catheter disengaged from the ostium: the aortic waveform is normal again.', 'good']], flags: ['repositioned'] }
      : null,
    pci: (s) => {
      if (!has(s, 'angio')) return { blocked: true, say: [['system', 'Do the angiogram first.']] };
      if (has(s, 'damped') && !has(s, 'repositioned')) return { blocked: true, say: [['system', 'The catheter is wedged (damped pressure) — disengage it first.']] };
      return { say: [['you', 'Wire across, pre-dilated, 3.5 × 28 mm drug-eluting stent deployed: TIMI 3 flow.', 'good']], flags: ['pci'], vitals: { pain: 3 } };
    },
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
      id: 'rn-setup-for-md', when: (s) => s.role === 5,
      effect: () => ({ say: [['team', 'Nurse: IV in and labs drawn. Waiting for your orders.']], flags: ['iv', 'labs'] }),
    },
    {
      id: 'md-orders-for-rn', when: (s) => s.role === 4,
      effect: () => ({ say: [['operator', 'Cardiologist: "Heparin 70 units per kilo now, and ticagrelor 180 mg, please."']] }),
    },
    {
      id: 'md-access', when: (s) => s.role !== 5 && has(s, 'timeout') && has(s, 'heparin') && !has(s, 'access'),
      effect: () => ({ say: [['operator', 'Radial access in. Starting the angiogram.']], flags: ['access'] }),
    },
    {
      id: 'md-angio', when: (s) => s.role !== 5 && has(s, 'access') && s.minute >= s.flags.access + 2,
      effect: () => ({ say: [['operator', 'Proximal LAD is 100 % occluded. Let\'s wire it.']], flags: ['angio'] }),
    },
    {
      id: 'damped', when: (s) => has(s, 'angio'),
      effect: (s) => ({
        say: [
          ['monitor', 'Aortic pressure 82/64 — the waveform has lost its dicrotic notch.', 'bad'],
          ...(s.role === 5 ? [line('team', 'Tech: "Doctor — the pressure\'s damped!"', 'warn')] : []),
        ],
        flags: ['damped'],
      }),
    },
    {
      id: 'md-reposition', when: (s) => s.role !== 5 && has(s, 'damped') && (has(s, 'callout') || s.minute >= s.flags.damped + 2),
      effect: (s) => ({
        say: has(s, 'callout')
          ? [['operator', 'Thanks — disengaging. Waveform\'s back.', 'good']]
          : [['operator', 'Pressure\'s damped — who\'s watching the waveform? Disengaging now.', 'warn']],
        flags: ['repositioned'],
      }),
    },
    {
      id: 'md-pci', when: (s) => s.role !== 5 && has(s, 'repositioned') && s.minute >= s.flags.repositioned + 2 && !has(s, 'pci'),
      effect: () => ({ say: [['operator', 'Wire\'s across… balloon up… stent deployed. TIMI 3 flow.', 'good']], flags: ['pci'], vitals: { pain: 3 } }),
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
  ],
  critical: [
    { id: 'consent', label: 'Consent, contrast allergy and anticoagulants checked', why: 'Even in an emergency, confirm consent and allergies (contrast, heparin) before access.', done: ['consent'], roles: [4, 5], points: 10, target: { by: 6 } },
    { id: 'timeout', label: 'Procedural time-out before access', why: 'The time-out catches wrong-patient, wrong-procedure and allergy errors before anyone punctures an artery.', done: ['timeout'], points: 10, target: { by: 6 } },
    { id: 'prep', label: 'Prep and drape both radial and femoral sites', why: 'Radial first, but a femoral site ready for bail-out or mechanical support.', done: ['prep'], roles: [3], points: 5, target: { by: 6 } },
    { id: 'transducer', label: 'Zero and level the transducers', why: 'Accurate pressures need transducers zeroed to air and levelled at the phlebostatic axis.', done: ['transducer'], roles: [3], points: 10, target: { by: 6 } },
    { id: 'pads', label: 'Defibrillator pads on before the wire crosses', why: 'Reperfusion of a large anterior STEMI often triggers VF.', done: ['pads'], roles: [3], points: 10, target: { by: 8 } },
    { id: 'iv', label: 'IV access', why: 'For heparin, sedation and emergency drugs.', done: ['iv', 'io'], roles: [4], points: 5 },
    { id: 'heparin', label: 'Heparin bolus before PCI (70–100 U/kg)', why: 'Primary PCI needs full anticoagulation to prevent catheter and stent thrombosis.', done: ['heparin'], roles: [4, 5], points: 10, target: { by: 10 } },
    { id: 'p2y12', label: 'P2Y12 loading dose', why: 'Ticagrelor 180 mg or prasugrel 60 mg as early as possible for primary PCI.', done: ['p2y12'], roles: [4, 5], points: 5 },
    { id: 'act', label: 'Check the ACT', why: 'ACT about 250–300 s with heparin alone before the wire crosses.', done: ['act'], after: 'heparin', roles: [3, 4], points: 5 },
    { id: 'access', label: 'Radial arterial access', why: 'Radial access cuts bleeding and mortality in STEMI (RIVAL, MATRIX).', done: ['access'], roles: [5], points: 5, target: { by: 12 } },
    { id: 'angio', label: 'Coronary angiography: find the culprit', why: 'Identify the occluded artery before intervening.', done: ['angio'], roles: [5], points: 5 },
    { id: 'callout', label: 'Call out the damped waveform at once', why: 'A damped or ventricularised pressure means the catheter is wedged in the ostium, stopping flow down the artery. Say it out loud immediately.', done: ['callout'], after: 'damped', roles: [3, 4], points: 15, target: { within: { flag: 'damped', minutes: 1 } }, applies: (s) => has(s, 'damped') },
    { id: 'reposition', label: 'Disengage the wedged catheter at once', why: 'A wedged catheter blocks coronary flow and can dissect the ostium.', done: ['reposition'], after: 'damped', roles: [5], points: 10, target: { within: { flag: 'damped', minutes: 1 } }, applies: (s) => has(s, 'damped') },
    { id: 'pci', label: 'Primary PCI of the culprit lesion', why: 'Door-to-device within 90 minutes; open the artery.', done: ['pci'], roles: [5], points: 15, target: { by: 30 } },
    { id: 'defib', label: 'Defibrillate the reperfusion VF within 1 minute', why: 'In the lab, VF is witnessed with pads on: shock within seconds and most patients recover at once.', done: ['defib', 'aed'], after: 'arrest', points: 15, target: { within: { flag: 'arrest', minutes: 1 } }, applies: (s) => has(s, 'arrest') },
    { id: 'post-ecg', label: '12-lead after the procedure', why: 'ST resolution confirms reperfusion and is the baseline for later comparison.', done: ['ecg12', 'ecg12-repeat'], after: 'pci', points: 5, applies: (s) => has(s, 'pci') },
    { id: 'echo', label: 'Echocardiogram after PCI', why: 'LVEF and mechanical complications guide therapy (and a later ICD decision).', done: ['echo'], after: 'pci', roles: [5], points: 5, applies: (s) => has(s, 'pci') },
    { id: 'hemostasis', label: 'Access-site haemostasis', why: 'Radial band with distal pulse and perfusion checks.', done: ['hemostasis'], after: 'pci', roles: [3, 4], points: 5, applies: (s) => has(s, 'pci') },
    { id: 'handoff', label: 'Hand-off to the cardiac care unit', why: 'Report the culprit, stent, drugs, the VF and the access site.', done: ['handoff'], roles: [4, 5], points: 5 },
  ],
  harms: [
    { id: 'pci-no-heparin', actions: ['pci'], when: (s) => !has(s, 'heparin'), points: 15, severity: 'critical', text: 'PCI without heparin: high risk of catheter, wire and stent thrombosis.' },
    { id: 'access-no-timeout', actions: ['access'], when: (s) => !has(s, 'timeout'), points: 5, severity: 'major', text: 'Arterial access before the time-out.' },
    { id: 'access-no-consent', actions: ['access'], when: (s) => !has(s, 'consent'), points: 5, severity: 'major', text: 'Access before confirming consent and allergies in an awake patient who can give them.' },
    { id: 'lytic-in-lab', actions: ['tnk'], points: 15, severity: 'critical', text: 'Fibrinolysis has no place when primary PCI is happening: it only adds bleeding risk.' },
    { id: 'beta-blocker', actions: ['metoprolol'], points: 6, severity: 'major', text: 'An IV beta-blocker in the acute phase of a large anterior STEMI risks cardiogenic shock (COMMIT).' },
    { id: 'oxygen-normoxic', actions: ['o2-nc', 'o2-nrb'], when: (s) => s.pulse && s.vitals.spo2 >= 90, points: 2, severity: 'minor', text: 'Oxygen is for SpO₂ below 90 %.' },
  ],
  timings: [
    { label: 'Time-out', actions: ['timeout'], target: 6 },
    { label: 'Artery open (arrival to device)', actions: ['pci'], flag: 'pci', target: 30 },
    { label: 'Damped waveform dealt with', actions: ['callout', 'reposition'], target: 1, from: 'damped' },
    { label: 'Shock after VF began', actions: ['defib', 'aed'], target: 1, from: 'arrest' },
  ],
  deathAfter: 8,
  completeWhen: (s) => has(s, 'pci'),
  teaching: [
    'Time-out before every procedure: patient, procedure, site, allergies (contrast) and anticoagulation.',
    'Zero to air and level at the phlebostatic axis. A damped or ventricularised waveform means a wedged catheter — call it out and disengage at once.',
    'Unfractionated heparin 70–100 U/kg for primary PCI (ACT about 250–300 s), plus a P2Y12 loading dose.',
    'Radial access first (fewer bleeding complications: RIVAL, MATRIX).',
    'Reperfusion often brings arrhythmias — accelerated idioventricular rhythm or VF. Pads on before the wire crosses; shock VF immediately.',
    'After PCI: ST resolution on the 12-lead, an echo for LVEF, DAPT, high-intensity statin and cardiac rehabilitation.',
  ],
};
