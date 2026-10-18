import type { Effect, PendingRead, Scenario, SimState } from '../types';
import { has, line } from '../kit';
import { MD, RN, TECH, angioGate, askCritical, askEvents, askHarm, operator, type LabAsk } from '../labKit';

const reactionRead: Omit<PendingRead, 'minute'> = {
  kind: 'clinical', answer: 'clin-contrast', prompt: 'What is happening to her?',
  explain: 'A severe (anaphylactoid) reaction to the contrast: hives, flushing, wheeze, a tight throat, low pressure and a fast heart rate a minute after the first injection. Stop the contrast, epinephrine IM 0.5 mg (or 10–20 mcg IV boluses in the lab), fluid wide open, oxygen; then albuterol, an antihistamine and a steroid.',
};

const EPI = ['epi-im', 'push-epi'];
const CONTRAST = ['angio', 'lv-gram', 'final-angio', 'view-rao-caudal', 'view-rao-cranial', 'view-ap-cranial', 'view-lao-cranial', 'view-lao-caudal', 'view-rca-lao', 'view-rca-rao', 'view-rca-cranial'];

const epi = (s: SimState): Effect => ({
  say: [['you', s.performed.at(-1)?.id === 'push-epi' ? 'Epinephrine 20 mcg IV.' : 'Epinephrine 0.5 mg IM, lateral thigh.'], ['monitor', `BP ${s.vitals.sbp + 18}/${s.vitals.dbp + 12}.`]],
  vitals: { sbp: s.vitals.sbp + 18, dbp: s.vitals.dbp + 12 }, flags: ['epi-given'],
});

const TECH_ASKS: LabAsk[] = [
  {
    id: 'diag', when: (s) => has(s, 'access'), early: true,
    ask: 'Tiger, please.',
    accept: ['cath-tiger'], wrong: ['cath-jl4', 'cath-jr4', 'cath-pigtail'],
    wrongSay: 'I asked for the Tiger.',
    thanks: 'Thanks. First shot of the left.', fallback: 'I\'ll get the Tiger myself.', gives: 'diag-in-hand',
    label: 'Diagnostic catheter as asked (Tiger)',
    why: 'Know your catheters by name: the Tiger does both coronaries from the radial.',
  },
];

export const cathlabContrast: Scenario = {
  id: 'contrast-cathlab',
  title: 'Diagnostic cath: a reaction to the contrast',
  summary: '55-year-old woman for a diagnostic angiogram. She mentions a shellfish allergy — and a minute after the first injection, her throat tightens.',
  setting: 'cathlab',
  roles: [3, 4, 5],
  difficulty: 'intermediate',
  briefing: {
    default: [
      ['team', 'Elective diagnostic angiogram: 55-year-old woman with exertional chest discomfort and an equivocal CT. No previous contrast.'],
      ['scene', 'She is chatty and a little nervous on the table.'],
    ],
    3: [
      ['team', 'Elective diagnostic angiogram: 55-year-old woman with exertional chest discomfort and an equivocal CT. No previous contrast.'],
      ['scene', 'She is chatty and a little nervous on the table.'],
      ['team', 'You are the scrub tech: set-up, the monitoring, the injector and the catheters.'],
    ],
    4: [
      ['team', 'Elective diagnostic angiogram: 55-year-old woman with exertional chest discomfort and an equivocal CT. No previous contrast.'],
      ['scene', 'She is chatty and a little nervous on the table.'],
      ['team', 'You are the procedural nurse: the checks, the IV and the drugs are yours.'],
    ],
    5: [
      ['team', 'Elective diagnostic angiogram: 55-year-old woman with exertional chest discomfort and an equivocal CT. No previous contrast.'],
      ['scene', 'She is chatty and a little nervous on the table.'],
      ['team', 'You are the cardiologist doing the study. The tech and the nurse are with you.'],
    ],
  },
  initial: {
    rhythm: { profile: 'normal-sinus', hr: 76 },
    vitals: { sbp: 136, dbp: 84, spo2: 98, rr: 16, etco2: 36, pain: 0, gcs: 15, glucose: 98, temp: 36.7 },
  },
  facts: {
    allergies: '"I\'m allergic to shellfish — I get hives. Is that a problem with the dye?" Never had contrast. No blood thinners. She agrees to the study.',
    sample: 'Shellfish allergy (hives). Atorvastatin. High cholesterol, mild asthma as a child.',
    opqrst: 'A heaviness walking fast, gone with rest. Nothing now.',
    labs: 'Creatinine 0.8, potassium 4.0, haemoglobin 13.4, INR 1.0.',
    lungs: (s) => (has(s, 'reaction') && !has(s, 'albuterol') ? 'Wheeze on both sides; air moving, but tight.' : 'Clear and equal on both sides.'),
    perfusion: (s) => (has(s, 'reaction') ? 'Flushed, with hives across the chest and neck; lips a little swollen.' : 'Warm and dry.'),
  },
  status: (s) => (!s.pulse ? 'Unresponsive.' : has(s, 'recovered') ? '"I can breathe again… that was frightening."' : has(s, 'reaction') ? '"My throat… so tight… I can\'t breathe."' : '"I\'m fine."'),
  respond: {
    access: (s) => ({ say: [[operator(s), 'Right radial: 5 Fr sheath in, cocktail given.']], flags: ['access'] }),
    angio: (s) => angioGate(s) ?? { say: [['you', 'First injection of the left coronary: smooth vessels, no narrowing.']], image: { id: 'angio', view: 'Left coronary (first run)' }, flags: ['angio-left', 'contrast-given'] },
    'epi-im': epi,
    'push-epi': epi,
    fluid: (s) => ({ say: [['monitor', `Fluid wide open. BP ${s.vitals.sbp + 8}/${s.vitals.dbp + 6}.`]], vitals: { sbp: s.vitals.sbp + 8, dbp: s.vitals.dbp + 6 }, flags: ['fluid'] }),
    albuterol: (s) => ({ say: [['you', 'Albuterol 5 mg nebulised.'], ['patient', has(s, 'reaction') ? '"That\'s… a bit easier."' : '"OK."']], vitals: { spo2: Math.min(98, s.vitals.spo2 + 3), rr: Math.max(16, s.vitals.rr - 6) }, flags: ['albuterol'] }),
  },
  events: [
    {
      id: 'tech-setup', when: (s) => s.role !== 3,
      effect: () => ({ say: [['team', 'Tech: right radial prepped, transducers zeroed and levelled, monitor and pads on, injector loaded.']], flags: ['prep', 'transducer', 'monitor', 'pads'] }),
    },
    {
      id: 'rn-setup-for-tech', when: (s) => s.role === 3,
      effect: () => ({ say: [['team', 'Nurse: consent signed and the IV is in. She has a shellfish allergy — that is not a contrast allergy, so we go ahead.']], flags: ['consent', 'iv'] }),
    },
    {
      id: 'rn-setup-for-md', when: (s) => s.role === 5,
      effect: () => ({ say: [['team', 'Nurse: IV in, labs fine. She told me about a shellfish allergy.']], flags: ['iv', 'labs'] }),
    },
    {
      id: 'md-access', when: (s) => s.role !== 5 && has(s, 'timeout') && !has(s, 'access'),
      effect: () => ({ say: [['operator', 'Right radial: 5 French sheath in.']], flags: ['access'] }),
    },
    ...TECH_ASKS.flatMap(askEvents),
    {
      id: 'md-first-shot', when: (s) => s.role !== 5 && has(s, 'access') && (s.role === 4 ? s.minute >= s.flags.access + 2 : has(s, 'diag-in-hand')),
      effect: () => ({ say: [['operator', 'First injection of the left coronary: smooth.']], image: { id: 'angio', view: 'Left coronary (first run)' }, flags: ['angio-left', 'contrast-given', 'catheter'] }),
    },
    {
      id: 'reaction', when: (s) => has(s, 'contrast-given'),
      effect: (s) => ({
        say: [
          ['patient', '"I feel hot… my throat is tight… I can\'t breathe!"'],
          ['scene', 'Hives spread across her chest and neck; she is wheezing.'],
          ['monitor', 'Heart rate 128. BP 76/42. SpO₂ 89 %.', 'bad'],
          ...(s.role === 5 ? [line('team', 'Nurse: "Doctor — her pressure\'s 76 and she\'s wheezing!"', 'warn')] : []),
        ],
        rhythm: { profile: 'sinus-tachycardia', hr: 128 }, vitals: { sbp: 76, dbp: 42, spo2: 89, rr: 28 }, flags: ['reaction'], read: reactionRead,
      }),
    },
    {
      id: 'md-stops-contrast', when: (s) => s.role === 4 && has(s, 'reaction') && (has(s, 'callout') || s.minute >= s.flags.reaction + 1),
      effect: () => ({ say: [['operator', 'No more contrast. Treat it — you know what she needs.']], flags: ['contrast-stopped'] }),
    },
    {
      id: 'rn-treats-for-tech', when: (s) => s.role === 3 && has(s, 'reaction') && (has(s, 'callout') || s.minute >= s.flags.reaction + 2),
      effect: (s) => ({
        say: [
          ...(has(s, 'callout') ? [] : [line('operator', 'She\'s reacting — who\'s watching her?', 'warn')]),
          ['team', 'Nurse: epinephrine 0.5 mg IM in; fluids wide open; diphenhydramine and methylprednisolone going in.'],
        ],
        flags: ['epi-given', 'fluid', 'antihistamine', 'steroid'],
      }),
    },
    {
      id: 'worse', when: (s) => has(s, 'reaction') && !has(s, 'epi-given') && s.minute >= s.flags.reaction + 3,
      effect: (s) => ({
        say: [['monitor', 'BP 62/34. SpO₂ 84 %.', 'bad'], ['patient', 'She is drowsy, with a high-pitched noise on every breath in.'],
          ...(s.role === 5 ? [line('team', 'Nurse: "She\'s crashing!"', 'bad')] : [])],
        vitals: { sbp: 62, dbp: 34, spo2: 84, gcs: 11 },
      }),
    },
    {
      id: 'arrest', when: (s) => has(s, 'reaction') && !has(s, 'epi-given') && s.pulse && s.minute >= s.flags.reaction + 6,
      effect: () => ({ say: [['monitor', 'No pressure on the arterial line.', 'bad'], ['patient', 'She is unresponsive.']], rhythm: { profile: 'pea', hr: 120 }, pulse: false, flags: ['pea'] }),
    },
    {
      id: 'recovered', when: (s) => has(s, 'reaction') && s.pulse && has(s, 'epi-given') && has(s, 'fluid'),
      effect: (s) => ({
        say: [['monitor', `Heart rate 104. BP 104/64. SpO₂ ${has(s, 'o2') ? 96 : 93} %.`, 'good'], ['patient', '"It\'s… easing."']],
        rhythm: { profile: 'sinus-tachycardia', hr: 104 }, vitals: { sbp: 104, dbp: 64, spo2: has(s, 'o2') ? 96 : 93, rr: 22, gcs: 15 }, flags: ['recovered'],
      }),
    },
    {
      id: 'calm', when: (s) => has(s, 'recovered') && has(s, 'antihistamine') && has(s, 'steroid'),
      effect: () => ({ say: [['scene', 'The hives are fading; her voice is normal again.']], rhythm: { profile: 'normal-sinus', hr: 92 }, vitals: { sbp: 112, dbp: 70, rr: 18 } }),
    },
    {
      id: 'md-stops-case', when: (s) => s.role !== 5 && has(s, 'recovered'),
      effect: () => ({ say: [['operator', 'The left system is clean on the one run we have. I\'m stopping here: if she still needs the right side, she comes back premedicated.']], flags: ['procedure-stopped'] }),
    },
  ],
  critical: [
    { id: 'consent', label: 'Consent and allergies checked (shellfish is not a contrast allergy)', why: 'Ask about previous reactions to contrast — that is what matters. A shellfish allergy is not a contrast allergy (and iodine is not an allergen).', done: ['consent'], roles: [4, 5], points: 5, target: { by: 6 } },
    { id: 'timeout', label: 'Procedural time-out', why: 'Patient, procedure, site, allergies.', done: ['timeout'], points: 5, target: { by: 8 } },
    { id: 'prep', label: 'Prep the access site', why: 'Radial first, with a groin ready.', done: ['prep'], roles: TECH, points: 5, target: { by: 6 } },
    { id: 'transducer', label: 'Zero and level the transducers', why: 'The arterial pressure is your first warning of a reaction.', done: ['transducer'], roles: TECH, points: 5, target: { by: 6 } },
    { id: 'monitor', label: 'Monitor (and pads) on', why: 'Continuous ECG, SpO₂ and pressure for every case.', done: ['monitor', 'pads'], roles: TECH, points: 5, target: { by: 6 } },
    { id: 'iv', label: 'IV access', why: 'For fluids and emergency drugs.', done: ['iv', 'io'], roles: RN, points: 5 },
    { id: 'access', label: 'Radial access', why: 'Radial first.', done: ['access', 'access-femoral'], roles: MD, points: 5 },
    { id: 'stop', label: 'Stop the contrast at once', why: 'Every further injection adds to the reaction.', done: ['stop-contrast'], after: 'reaction', roles: [3, 5], points: 10, target: { within: { flag: 'reaction', minutes: 1 } }, applies: (s) => has(s, 'reaction') },
    { id: 'callout', label: 'Call out the reaction at once', why: 'Hives, wheeze, a tight throat and a falling pressure after contrast: say it out loud so everyone switches to the anaphylaxis plan.', done: ['callout'], after: 'reaction', roles: [3, 4], points: 10, target: { within: { flag: 'reaction', minutes: 1 } }, applies: (s) => has(s, 'reaction') },
    { id: 'help', label: 'Call for help', why: 'More hands for the drugs, the airway and the documentation.', done: ['call-help'], after: 'reaction', roles: TECH, points: 5, target: { within: { flag: 'reaction', minutes: 2 } }, applies: (s) => has(s, 'reaction') },
    { id: 'epi', label: 'Epinephrine first (0.5 mg IM, or 10–20 mcg IV boluses)', why: 'Epinephrine is the treatment for anaphylaxis: it raises the pressure, opens the airway and stops the release. Antihistamines and steroids are second-line.', done: EPI, after: 'reaction', roles: [4, 5], points: 15, target: { within: { flag: 'reaction', minutes: 2 } }, applies: (s) => has(s, 'reaction') },
    { id: 'fluid', label: 'Fluid wide open', why: 'Anaphylaxis leaks fluid out of the vessels: 1–2 L of crystalloid, fast.', done: ['fluid'], after: 'reaction', roles: [4, 5], points: 10, target: { within: { flag: 'reaction', minutes: 3 } }, applies: (s) => has(s, 'reaction') },
    { id: 'oxygen', label: 'Oxygen for an SpO₂ below 90 %', why: 'Bronchospasm and airway swelling drop the oxygen: high-flow oxygen.', done: ['o2-nrb', 'o2-nc'], after: 'reaction', points: 5, target: { within: { flag: 'reaction', minutes: 3 } }, applies: (s) => has(s, 'reaction') },
    { id: 'albuterol', label: 'Albuterol for the wheeze', why: 'A nebulised bronchodilator for bronchospasm that remains after epinephrine.', done: ['albuterol'], after: 'reaction', roles: [4, 5], points: 5, applies: (s) => has(s, 'reaction') },
    { id: 'antihistamine', label: 'An antihistamine (diphenhydramine)', why: 'Second-line: it eases the hives and itching, not the airway or the pressure.', done: ['diphenhydramine'], roles: [4, 5], points: 5, applies: (s) => has(s, 'reaction') },
    { id: 'steroid', label: 'A steroid (methylprednisolone)', why: 'Second-line: it may reduce a later (biphasic) reaction.', done: ['steroid'], roles: [4, 5], points: 5, applies: (s) => has(s, 'reaction') },
    ...TECH_ASKS.map(askCritical),
    { id: 'hemostasis', label: 'Radial band and distal perfusion check', why: 'Patent haemostasis, as always.', done: ['hemostasis'], after: 'recovered', roles: [3, 4], points: 5, applies: (s) => has(s, 'recovered') },
    { id: 'handoff', label: 'Hand-off and documentation', why: 'Record the reaction as a contrast allergy, the drugs given, and the premedication plan for any future contrast; observe for a biphasic reaction.', done: ['handoff'], roles: [4, 5], points: 5 },
  ],
  harms: [
    { id: 'contrast-during-reaction', actions: CONTRAST, when: (s) => has(s, 'reaction') && !has(s, 'recovered'), points: 10, severity: 'major', text: 'More contrast during the reaction. Every injection adds to it: stop the contrast until she is stable.' },
    { id: 'premed-for-shellfish', actions: ['steroid', 'diphenhydramine'], roles: [4, 5], when: (s) => !has(s, 'reaction'), points: 2, severity: 'minor', text: 'Premedication for a shellfish allergy. Shellfish allergy is not a contrast allergy: premedication is for a previous reaction to contrast.' },
    { id: 'antihistamine-first', actions: ['diphenhydramine', 'steroid'], roles: [4, 5], when: (s) => has(s, 'reaction') && !has(s, 'epi-given'), points: 5, severity: 'major', text: 'An antihistamine or steroid before epinephrine. They are second-line and slow: epinephrine first, then the rest.' },
    { id: 'beta-blocker', actions: ['metoprolol'], points: 8, severity: 'major', text: 'A beta-blocker in anaphylaxis. It blocks the response to epinephrine.' },
    askHarm(TECH_ASKS[0], 'The wrong diagnostic catheter for what the operator asked.'),
  ],
  timings: [
    { label: 'Contrast stopped', actions: ['stop-contrast', 'callout'], target: 1, from: 'reaction' },
    { label: 'Epinephrine given', actions: EPI, flag: 'epi-given', target: 2, from: 'reaction' },
  ],
  deathAfter: 10,
  completeWhen: (s) => has(s, 'recovered'),
  teaching: [
    'Ask about previous reactions to contrast. Shellfish allergy is not a contrast allergy, and iodine is not an allergen; asthma and other allergies raise the risk only slightly.',
    'A severe reaction: hives, flushing, wheeze or stridor, a tight throat, hypotension and tachycardia within minutes of contrast.',
    'Stop the contrast; epinephrine first (0.5 mg IM in the thigh, or 10–20 mcg IV boluses in a monitored lab); fluid wide open; high-flow oxygen; call for help.',
    'Then albuterol for wheeze, an antihistamine and a steroid — second-line, never instead of epinephrine.',
    'Document the reaction as a contrast allergy; next time premedicate (e.g. prednisone 50 mg 13, 7 and 1 hour before, diphenhydramine 50 mg 1 hour before) and watch for a biphasic reaction.',
  ],
};
