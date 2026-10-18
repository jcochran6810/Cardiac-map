import type { Effect, PendingRead, Scenario, SimState } from '../types';
import { firstDone, has, line } from '../kit';
import {
  LEFT_GUIDES, MD, RIGHT_GUIDES, RN, TECH, WIRES, angioGate, anticoagulated, askCritical, askEvents, askHarm, cine, type LabAsk,
} from '../labKit';

/** Real angiograms for this patient: cine view id → key of CATH_IMAGES (none yet: until then the findings are said in words) */
const IMAGES: Partial<Record<string, string>> = {};

const angioRun = (who: 'you' | 'operator') => cine('angio', 'Diagnostic angiography: left and right coronaries', IMAGES.angio, [
  [who, 'Proximal LAD occluded — TIMI 0. The RCA has a 70 % mid narrowing; the circumflex is fine. The LAD is the culprit.'],
], { kind: 'angio', answer: 'angio-lad-prox-occlusion', explain: 'The proximal LAD is occluded (TIMI 0): the culprit. The 70 % RCA narrowing is not — in shock, open the culprit only (CULPRIT-SHOCK) and deal with the RCA later.' });

const finalRun = (who: 'you' | 'operator') => cine('final-angio', 'Final angiogram: the LAD in two views', IMAGES['final-angio'], [
  [who, 'LAD open: TIMI 3 flow. Leaving the RCA for another day.', 'good'],
], { kind: 'angio', answer: 'angio-timi3', explain: 'TIMI 3 flow down the LAD; the non-culprit RCA is left alone.' });

const RHC_LINE = 'RA 15 · PA 46/28 (mean 34) · PCWP 28 · CO 3.0 L/min, CI 1.5 · SVR 1700 · PA saturation 48 %.';
const rhcRead: Omit<PendingRead, 'minute'> = {
  kind: 'hemo', answer: 'hemo-cardiogenic', partial: ['hemo-lvedp-high'], prompt: 'What do these numbers show?',
  explain: 'A wedge of 28, a cardiac index of 1.5, a high SVR and a PA saturation of 48 %: cardiogenic shock — the pump has failed and the body is clamping down. Norepinephrine for the pressure, mechanical support for the pump, open the artery — and no fluid.',
};

const SHOCK_ROLE_LINE = 'He is grey, sweaty and drowsy, breathing fast; his knees are mottled.';

const TECH_ASKS: LabAsk[] = [
  {
    id: 'rhc', when: (s) => has(s, 'access'), wait: 6, within: 1,
    ask: 'Artery and vein are in, and a PA catheter is in the pulmonary artery. Record the right heart numbers and the output, please.',
    accept: ['rhc'],
    thanks: 'Thanks — those are shock numbers.', fallback: 'I\'ll read the numbers myself.', gives: 'rhc-recorded',
    label: 'Record the right heart pressures and the cardiac output',
    why: 'RA, RV, PA and wedge pressures, the cardiac output and index, the PA saturation and the SVR: the numbers that define shock and decide the support.',
  },
  {
    id: 'impella', when: (s) => has(s, 'rhc-recorded'), wait: 6, within: 1,
    ask: 'Index of 1.5 with a wedge of 28. He needs support before I open the artery: prime the Impella, please.',
    accept: ['impella'], wrong: ['iabp'],
    wrongSay: 'Not the balloon pump — it does little for STEMI shock. The Impella, please.',
    thanks: 'Thanks — taking the pump across the valve.', fallback: 'I\'ll prime the Impella myself.', gives: 'impella-primed',
    label: 'Prime the Impella console',
    why: 'A micro-axial pump pulls blood out of the LV into the aorta: it unloads the ventricle and raises the output. In STEMI shock it improves survival (DanGer Shock); a balloon pump does not (IABP-SHOCK II).',
  },
  {
    id: 'guide', when: (s) => has(s, 'angio'), early: true,
    ask: 'LAD culprit. A guide for the left system, please — from the groin.',
    accept: LEFT_GUIDES, wrong: RIGHT_GUIDES,
    wrongSay: 'That is a right-coronary guide. The LAD needs the EBU.',
    thanks: 'Thanks — engaging.', fallback: 'I\'ll open the guide myself.', gives: 'guide-in-hand',
    label: 'A left guide for the LAD (EBU)',
    why: 'The LAD comes off the left main: an extra-back-up guide.',
  },
  {
    id: 'stent', when: (s) => has(s, 'predilated'),
    ask: 'Drug-eluting stent, 3.5 by 28.',
    accept: ['stent-des'], wrong: ['stent-covered', 'balloon-nc', 'balloon-predil'],
    wrongSay: 'No — a drug-eluting stent, 3.5 by 28.',
    thanks: '3.5 by 28 — confirmed.', fallback: 'I\'ll open the stent myself.', gives: 'stent-in-hand',
    label: 'Drug-eluting stent, as ordered',
    why: 'Say the size back to the operator and check it on the box before you open it.',
  },
];

const RN_ASKS: LabAsk[] = [
  {
    id: 'pressor', role: 4, when: () => true, within: 3,
    ask: 'His pressure is 78 over 50 and his lungs are wet. Get his pressure up, please.',
    accept: ['pressor', 'push-epi'], wrong: ['fluid'],
    wrongSay: 'Not fluid — his lungs are already full. A pressor: norepinephrine.',
    thanks: 'Thanks — titrate to a mean of 65.', fallback: 'I\'ll start the norepinephrine myself.', gives: 'pressor-given',
    label: 'A vasopressor for the cardiogenic shock (norepinephrine)',
    why: 'Norepinephrine is the first vasopressor in cardiogenic shock: it raises the pressure with fewer arrhythmias than dopamine. Fluid will not help a failing, overfilled LV.',
  },
  {
    id: 'heparin', role: 4, when: (s) => has(s, 'rhc'),
    ask: 'Heparin before the pump goes in, please.',
    accept: ['heparin', 'bivalirudin'], wrong: ['protamine'],
    wrongSay: 'No — the opposite: heparin, he needs to be anticoagulated for the pump.',
    thanks: 'Thanks. ACT in a few minutes — I want it over 250.', fallback: 'I\'ll give the heparin myself.', gives: 'heparin-given',
    label: 'Heparin before the Impella',
    why: 'The pump and its large-bore sheath clot without heparin: ACT above 250 s for insertion, then a purge with heparin.',
  },
  {
    id: 'p2y12', role: 4, when: (s) => has(s, 'impella'),
    ask: 'Support is in. Now a P2Y12 inhibitor — he can\'t swallow safely.',
    accept: ['cangrelor'], wrong: ['p2y12'],
    wrongSay: 'He is drowsy and shocked: tablets are absorbed poorly and he may aspirate. The IV one — cangrelor.',
    thanks: 'Thanks.', fallback: 'I\'ll start the cangrelor myself.', gives: 'p2y12-given',
    label: 'IV P2Y12 inhibitor (cangrelor) in shock',
    why: 'In shock the gut absorbs oral P2Y12 tablets slowly, and a drowsy patient may aspirate: IV cangrelor works within minutes.',
  },
];

/** Things that drop the pressure further, or flood the lungs */
const worse = (text: string, sbp: number, dbp: number, flags: string[], extra: Partial<SimState['vitals']> = {}): Effect => ({
  say: [['monitor', text, 'bad']], vitals: { sbp, dbp, ...extra }, flags,
});

export const cathlabShock: Scenario = {
  id: 'shock-cathlab',
  title: 'Anterior STEMI in cardiogenic shock',
  summary: '71-year-old man, anterior STEMI and a failing heart: low pressure, wet lungs, cold legs. Measure the shock, support the pump, then open the artery.',
  setting: 'cathlab',
  roles: [3, 4, 5],
  difficulty: 'advanced',
  conditionId: 'cardiogenic-shock',
  images: IMAGES,
  briefing: {
    default: [
      ['team', 'STEMI alert from the ED: 71-year-old man, anterior STEMI, 4 hours of pain. BP 78/50, HR 116, SpO₂ 88 % on 4 L, lactate 5.2. Aspirin given in the ED.'],
      ['scene', SHOCK_ROLE_LINE],
    ],
    3: [
      ['team', 'STEMI alert from the ED: 71-year-old man, anterior STEMI, 4 hours of pain. BP 78/50, HR 116, SpO₂ 88 % on 4 L, lactate 5.2. Aspirin given in the ED.'],
      ['scene', SHOCK_ROLE_LINE],
      ['team', 'You are the scrub tech: set-up, the transducers and pads, the hemodynamic recording, the pump console and the devices.'],
    ],
    4: [
      ['team', 'STEMI alert from the ED: 71-year-old man, anterior STEMI, 4 hours of pain. BP 78/50, HR 116, SpO₂ 88 % on 4 L, lactate 5.2. Aspirin given in the ED.'],
      ['scene', SHOCK_ROLE_LINE],
      ['team', 'You are the procedural nurse: his airway, oxygen, pressure and drugs are yours to watch.'],
    ],
    5: [
      ['team', 'STEMI alert from the ED: 71-year-old man, anterior STEMI, 4 hours of pain. BP 78/50, HR 116, SpO₂ 88 % on 4 L, lactate 5.2. Aspirin given in the ED.'],
      ['scene', SHOCK_ROLE_LINE],
      ['team', 'You are the interventional cardiologist. The tech and the nurse are with you.'],
    ],
  },
  initial: {
    rhythm: { profile: 'cardiogenic-shock', hr: 116 },
    vitals: { sbp: 78, dbp: 50, spo2: 88, rr: 28, etco2: 28, pain: 5, gcs: 14, glucose: 210, temp: 36.0 },
  },
  facts: {
    allergies: 'His wife, on the phone: "No allergies. He takes metformin, that\'s all. Yes — do whatever you need to."',
    sample: 'No allergies. Metformin. Diabetes; smoker.',
    opqrst: '"Since this morning… crushing… I can\'t breathe lying flat."',
    lungs: 'Crackles to the mid-zones on both sides.',
    perfusion: 'Cold, mottled knees; thready pulses; capillary refill 5 seconds; neck veins full.',
    labs: 'Lactate 5.2, creatinine 1.6, potassium 4.8, haemoglobin 13.8, INR 1.1, platelets 210. Troponin very high.',
    ecg12: (s) => s.rhythm.profile === 'anterior-stemi-reperfused'
      ? 'Sinus rhythm: ST elevation in V1–V5 coming down, Q waves forming — the anterior infarct after reperfusion.'
      : `Sinus tachycardia ${s.rhythm.hr} with ST elevation in V1–V5, I and aVL: an extensive anterior STEMI.`,
    echo: 'Akinetic anterior wall, septum and apex; LVEF about 20 %. No ventricular septal rupture, no severe mitral regurgitation, no effusion.',
    rhc: RHC_LINE,
  },
  status: (s) => (has(s, 'pci') ? '"I can breathe a bit better."' : has(s, 'impella') ? 'Drowsy, but answers questions.' : '"Can\'t… breathe…"'),
  respond: {
    angio: (s) => angioGate(s) ?? { ...angioRun('you'), flags: ['angio'] },
    'final-angio': (s) => (s.role === 5 && has(s, 'access') ? { ...finalRun('you'), flags: ['final-angio'] } : null),
    rhc: (s) => (has(s, 'venous') ? { say: [['monitor', RHC_LINE]], flags: ['rhc'], read: rhcRead } : null),
    pressor: (s) => ({ say: [['you', 'Norepinephrine 0.1 mcg/kg/min running.'], ['monitor', `BP ${Math.max(s.vitals.sbp, 92)}/${Math.max(s.vitals.dbp, 58)}.`]], vitals: { sbp: Math.max(s.vitals.sbp, 92), dbp: Math.max(s.vitals.dbp, 58) }, flags: ['pressor'] }),
    impella: (s) => {
      if (s.role === 3) return { say: [['you', 'Impella console primed, purge running with heparinised fluid; large-bore sheath, wire and closure sutures open.']], flags: ['impella-ready'] };
      if (!has(s, 'access')) return { blocked: true, say: [['system', 'No arterial access yet.']] };
      return { say: [['you', 'Impella CP across the aortic valve, inlet 3.5 cm into the LV: flow 3.2 L/min.'], ['monitor', 'BP 102/70.']], vitals: { sbp: 102, dbp: 70, spo2: Math.max(s.vitals.spo2, 92) }, flags: ['impella', 'mcs'] };
    },
    fluid: (s) => worse(`Bolus in. BP ${s.vitals.sbp + 2}/${s.vitals.dbp + 1}; SpO₂ ${s.vitals.spo2 - 3} %, breathing faster.`, s.vitals.sbp + 2, s.vitals.dbp + 1, ['fluid'], { spo2: s.vitals.spo2 - 3, rr: s.vitals.rr + 4 }),
    nitro: (s) => worse(`BP ${s.vitals.sbp - 14}/${s.vitals.dbp - 10}.`, s.vitals.sbp - 14, s.vitals.dbp - 10, ['nitro']),
    'ic-nitro': (s) => worse(`BP ${s.vitals.sbp - 14}/${s.vitals.dbp - 10}.`, s.vitals.sbp - 14, s.vitals.dbp - 10, ['ic-nitro']),
    metoprolol: (s) => worse(`BP ${s.vitals.sbp - 18}/${s.vitals.dbp - 12}.`, s.vitals.sbp - 18, s.vitals.dbp - 12, ['beta-blocker']),
    sedation: (s) => worse(`Sedated. BP ${s.vitals.sbp - 10}/${s.vitals.dbp - 8}, breathing slower.`, s.vitals.sbp - 10, s.vitals.dbp - 8, ['sedation'], { rr: Math.max(10, s.vitals.rr - 8) }),
  },
  events: [
    {
      id: 'tech-setup', when: (s) => s.role !== 3,
      effect: () => ({ say: [['team', 'Tech: both groins prepped, transducers zeroed and levelled, monitor and pads on, Impella console on standby.']], flags: ['prep', 'transducer', 'monitor', 'pads'] }),
    },
    {
      id: 'rn-setup-for-tech', when: (s) => s.role === 3,
      effect: () => ({ say: [['team', 'Nurse: his wife gave consent by phone. IV in, non-rebreather on, norepinephrine running, heparin and cangrelor given on the cardiologist\'s order.']], flags: ['consent', 'iv', 'o2', 'pressor', 'heparin', 'p2y12'], vitals: { sbp: 90, dbp: 58, spo2: 93 } }),
    },
    {
      id: 'rn-setup-for-md', when: (s) => s.role === 5,
      effect: () => ({ say: [['team', 'Nurse: IV in, labs back — lactate 5.2. Waiting for your orders.']], flags: ['iv', 'labs'] }),
    },
    {
      id: 'md-access', when: (s) => s.role !== 5 && has(s, 'timeout') && !has(s, 'access'),
      effect: () => ({ say: [['operator', 'Right femoral artery and vein, ultrasound-guided. PA catheter going in.']], flags: ['access', 'femoral', 'venous'] }),
    },
    {
      id: 'md-rhc', when: (s) => s.role === 4 && has(s, 'access') && s.minute >= s.flags.access + 1,
      effect: () => ({ say: [['monitor', RHC_LINE]], flags: ['rhc'], read: rhcRead }),
    },
    ...TECH_ASKS.flatMap(askEvents),
    ...RN_ASKS.flatMap(askEvents),
    {
      id: 'md-impella', when: (s) => s.role !== 5 && !has(s, 'impella') && (s.role === 4 ? has(s, 'rhc') && has(s, 'heparin-given') && s.minute >= s.flags.rhc + 1 : has(s, 'impella-primed')),
      effect: (s) => ({ say: [['operator', 'Impella CP across the valve: flow 3.2 litres.'], ['monitor', `BP ${Math.max(s.vitals.sbp + 12, 100)}/${Math.max(s.vitals.dbp + 10, 66)}.`]], vitals: { sbp: Math.max(s.vitals.sbp + 12, 100), dbp: Math.max(s.vitals.dbp + 10, 66), spo2: Math.max(s.vitals.spo2, 93) }, flags: ['impella', 'mcs'] }),
    },
    {
      id: 'md-angio', when: (s) => s.role !== 5 && has(s, 'impella') && (s.role === 4 ? s.minute >= s.flags.impella + 1 : true),
      effect: () => ({ ...angioRun('operator'), flags: ['angio', 'catheter'] }),
    },
    {
      id: 'md-guide', when: (s) => s.role !== 5 && has(s, 'angio') && (s.role === 4 ? s.minute >= s.flags.angio + 1 : has(s, 'guide-in-hand')),
      effect: () => ({ say: [['operator', 'EBU engaged. RAO cranial.']], flags: ['guide', 'guide-left', 'view-set'] }),
    },
    {
      id: 'md-wire', when: (s) => s.role !== 5 && has(s, 'guide') && (s.role === 4 ? s.minute >= s.flags.guide + 1 : true),
      effect: () => ({ say: [['operator', 'Wire across the LAD.']], flags: ['wired'] }),
    },
    {
      id: 'md-predil', when: (s) => s.role !== 5 && has(s, 'wired') && (s.role === 4 ? s.minute >= s.flags.wired + 1 : true),
      effect: () => ({ say: [['operator', 'Pre-dilated.']], flags: ['predilated'] }),
    },
    {
      id: 'md-stent', when: (s) => s.role !== 5 && has(s, 'predilated') && (s.role === 4 ? s.minute >= s.flags.predilated + 1 : has(s, 'stent-in-hand')),
      effect: () => ({ say: [['operator', 'Stent deployed. TIMI 3 flow.', 'good']], flags: ['stented', 'pci'] }),
    },
    {
      id: 'reperfused', when: (s) => has(s, 'pci') && s.pulse,
      effect: () => ({ rhythm: { profile: 'anterior-stemi-reperfused', hr: 104 }, vitals: { sbp: 108, dbp: 70, pain: 2, spo2: 94, rr: 22 } }),
    },
    {
      id: 'md-final', when: (s) => s.role !== 5 && has(s, 'pci'),
      effect: () => ({ ...finalRun('operator'), flags: ['final-angio'] }),
    },
    {
      id: 'shock-worse', when: (s) => !has(s, 'pressor') && !has(s, 'impella') && s.minute >= 8,
      effect: (s) => ({
        say: [
          ['monitor', 'BP 68/42. SpO₂ 85 %.', 'bad'],
          ['patient', 'He is harder to rouse.'],
          ...(s.role === 5 ? [line('team', 'Nurse: "Doctor, his pressure is 68 — do you want a pressor?"', 'warn')] : []),
        ],
        vitals: { sbp: 68, dbp: 42, spo2: 85, gcs: 12 },
      }),
    },
  ],
  critical: [
    { id: 'consent', label: 'Consent (his wife, by phone) and allergies checked', why: 'Even in shock: confirm consent with whoever can give it, and check allergies.', done: ['consent'], roles: [4, 5], points: 5, target: { by: 6 } },
    { id: 'timeout', label: 'Procedural time-out before access', why: 'Patient, procedure, sites, allergies, anticoagulation — and the support plan.', done: ['timeout'], points: 5, target: { by: 6 } },
    { id: 'prep', label: 'Prep both groins', why: 'Shock cases need an artery and a vein for the pump and the PA catheter.', done: ['prep'], roles: TECH, points: 5, target: { by: 6 } },
    { id: 'transducer', label: 'Zero and level the transducers', why: 'The right heart numbers decide the support: they must be right.', done: ['transducer'], roles: TECH, points: 5, target: { by: 6 } },
    { id: 'pads', label: 'Defibrillator pads on', why: 'Shock and a large anterior infarct: VT and VF are likely.', done: ['pads'], roles: TECH, points: 10, target: { by: 6 } },
    { id: 'iv', label: 'IV access', why: 'For the pressor and the drugs.', done: ['iv', 'io'], roles: RN, points: 5 },
    { id: 'oxygen', label: 'Oxygen for an SpO₂ below 90 %', why: 'He is hypoxic from pulmonary oedema: oxygen (and be ready to ventilate).', done: ['o2-nc', 'o2-nrb', 'airway'], roles: [4, 5], points: 5, target: { by: 5 } },
    { id: 'md-pressor', label: 'A vasopressor early (norepinephrine)', why: 'Norepinephrine first in cardiogenic shock; MAP 65 or more while you get support in.', done: ['pressor', 'push-epi'], roles: MD, points: 10, target: { by: 6 } },
    { id: 'access', label: 'Femoral arterial access (large-bore ready)', why: 'The pump needs a large-bore femoral sheath; ultrasound-guided, over the femoral head.', done: ['access-femoral', 'access'], roles: MD, points: 5 },
    { id: 'venous', label: 'Femoral venous access for the right heart catheter', why: 'The PA catheter measures the shock and guides the support.', done: ['access-venous'], roles: MD, points: 5 },
    { id: 'md-rhc', label: 'Right heart catheterisation: measure the shock', why: 'Filling pressures, cardiac output and index, SVR and PA saturation define the shock and its severity (SCAI stages).', done: ['rhc'], roles: MD, points: 10 },
    { id: 'md-heparin', label: 'Heparin before the pump and the wire', why: 'The pump, the sheath and the wire clot without it: ACT over 250 s.', done: ['heparin', 'bivalirudin'], roles: MD, points: 10 },
    {
      id: 'mcs', label: 'Mechanical support before opening the artery (Impella)', roles: MD, points: 15,
      why: 'In STEMI shock a micro-axial pump placed before (or right after) PCI unloads the LV and improves survival (DanGer Shock); a balloon pump does not (IABP-SHOCK II).',
      done: (s) => {
        const pump = firstDone(s, ['impella']);
        const stent = firstDone(s, ['stent-des']);
        return pump !== null && (stent === null || pump < stent) ? pump : null;
      },
    },
    { id: 'md-p2y12', label: 'A P2Y12 inhibitor (IV cangrelor in shock)', why: 'Oral tablets are absorbed poorly in shock; cangrelor IV works within minutes.', done: ['cangrelor', 'p2y12'], roles: MD, points: 5 },
    { id: 'angio', label: 'Diagnostic angiography: find the culprit', why: 'Open the culprit only in shock (CULPRIT-SHOCK).', done: ['angio'], roles: MD, points: 5 },
    { id: 'guide', label: 'A left guide for the LAD (EBU)', why: 'The LAD comes off the left main.', done: LEFT_GUIDES, roles: MD, points: 5 },
    { id: 'stent', label: 'Drug-eluting stent in the culprit', why: 'Open the culprit artery as fast as the support allows.', done: ['stent-des'], roles: MD, points: 15, target: { by: 45 } },
    { id: 'final', label: 'Final angiogram', why: 'TIMI 3 in the culprit; leave the non-culprit RCA for later.', done: ['final-angio'], after: 'pci', roles: MD, points: 5, applies: (s) => has(s, 'pci') },
    { id: 'echo', label: 'Echocardiogram', why: 'LV function and the mechanical complications that cause shock: VSD, papillary muscle rupture, free-wall rupture.', done: ['echo'], roles: MD, points: 5 },
    ...TECH_ASKS.map(askCritical),
    ...RN_ASKS.map(askCritical),
    { id: 'act', label: 'Check the ACT', why: 'Over 250 s before the pump goes in.', done: ['act'], after: 'heparin', roles: RN, points: 5, applies: (s) => has(s, 'heparin') },
    { id: 'limb-check', label: 'Check the leg below the large-bore sheath', why: 'A large-bore sheath can starve the leg: check the foot pulses, colour and warmth after the pump goes in, and then every hour.', done: ['perfusion', 'pulse-check'], after: 'impella', roles: [3, 4], points: 5, applies: (s) => has(s, 'impella') },
    { id: 'post-ecg', label: '12-lead after the procedure', why: 'ST resolution, and a baseline for the CCU.', done: ['ecg12', 'ecg12-repeat'], after: 'pci', points: 5, applies: (s) => has(s, 'pci') },
    { id: 'handoff', label: 'Hand-off to the cardiac ICU', why: 'The shock numbers, the pump settings and purge, the pressor, the culprit and the stent, the RCA left for later, the leg checks.', done: ['handoff'], roles: [4, 5], points: 5 },
  ],
  harms: [
    { id: 'fluid-in-shock', actions: ['fluid'], points: 8, severity: 'major', text: 'A fluid bolus with pulmonary oedema and a high wedge. A failing, overfilled LV cannot use more volume: it goes to the lungs.' },
    { id: 'nitro-in-shock', actions: ['nitro', 'ic-nitro'], points: 8, severity: 'major', text: 'Nitroglycerin with a systolic pressure under 90. It drops the pressure further.' },
    { id: 'beta-blocker', actions: ['metoprolol'], points: 12, severity: 'critical', text: 'An IV beta-blocker in cardiogenic shock. It takes away the little output the heart still has.' },
    { id: 'sedation-in-shock', actions: ['sedation'], points: 3, severity: 'minor', text: 'Sedation in a shocked, drowsy patient. It drops the pressure and the breathing.' },
    { id: 'pci-no-heparin', actions: [...WIRES, 'balloon-predil', 'stent-des', 'impella'], roles: MD, when: (s) => !anticoagulated(s), points: 15, severity: 'critical', text: 'A pump or a coronary wire without anticoagulation. Both clot without heparin.' },
    { id: 'right-guide-for-lad', actions: RIGHT_GUIDES, roles: MD, when: (s) => has(s, 'angio'), points: 5, severity: 'minor', text: 'A right-coronary guide for an LAD culprit. Use a left guide with back-up (EBU).' },
    { id: 'access-no-timeout', actions: ['access', 'access-femoral', 'access-venous'], when: (s) => !has(s, 'timeout'), points: 5, severity: 'major', text: 'Access before the time-out.' },
    { id: 'covered-no-perforation', actions: ['stent-covered'], roles: [3, 5], when: (s) => !has(s, 'perforation'), points: 4, severity: 'minor', text: 'A covered stent without a perforation. Covered stents seal perforations; they restenose and clot more than drug-eluting stents.' },
    { id: 'opened-early', actions: ['balloon-predil', 'stent-des', 'balloon-nc', 'stent-covered'], roles: TECH, when: (s) => !has(s, 'wired'), points: 2, severity: 'minor', text: 'A balloon or stent opened before there was a wire to put it on. Open devices when the operator asks for them.' },
    askHarm(TECH_ASKS[1], 'A balloon pump when the operator asked for the Impella. In STEMI shock an IABP does not improve survival (IABP-SHOCK II).'),
    askHarm(TECH_ASKS[2], 'A right-coronary guide when the operator asked for a left guide.'),
    askHarm(TECH_ASKS[3], 'The wrong device when the operator asked for a drug-eluting stent.'),
    askHarm(RN_ASKS[1], 'Protamine when the operator asked for heparin.', 5),
    askHarm(RN_ASKS[2], 'Oral P2Y12 tablets for a drowsy, shocked patient when the operator asked for the IV drug.'),
  ],
  timings: [
    { label: 'Pressor running', actions: ['pressor', 'push-epi'], flag: 'pressor', target: 6 },
    { label: 'Mechanical support in', actions: ['impella'], flag: 'impella', target: 25 },
    { label: 'Artery open', actions: ['stent-des'], flag: 'pci', target: 45 },
  ],
  completeWhen: (s) => has(s, 'pci') && has(s, 'final-angio') && has(s, 'impella'),
  teaching: [
    'Cardiogenic shock: low pressure with signs of poor perfusion (cold, mottled, confused, lactate up). Measure it with a right heart catheter: high wedge, low cardiac index (< 2.2), high SVR.',
    'Norepinephrine first; no fluid for wet lungs; no beta-blockers, no nitrates.',
    'Mechanical support before (or right after) opening the artery: a micro-axial pump (Impella) improves survival in STEMI shock (DanGer Shock); a balloon pump does not (IABP-SHOCK II).',
    'Open the culprit only (CULPRIT-SHOCK); stage the other arteries.',
    'IV cangrelor when tablets cannot be swallowed or absorbed.',
    'Large-bore access: ultrasound-guided, and check the leg (pulses, colour, warmth) after the pump goes in.',
  ],
};
