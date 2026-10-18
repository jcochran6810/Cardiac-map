import type { Effect, Scenario, SimState } from '../types';
import { cprCycles, has, interpret, shocks } from '../kit';

function shockOutcome(s: SimState): Effect | null {
  if (s.pulse || s.rhythm.profile !== 'vf') return null;
  const n = shocks(s) + 1;
  const rosc = s.role === 1
    ? n >= 2 && cprCycles(s) >= 2
    : n >= 3 && has(s, 'epi') && cprCycles(s) >= 2 && (has(s, 'amiodarone') || has(s, 'lidocaine') || n >= 4);
  if (!rosc) return { say: [['monitor', `Shock ${n} delivered. Still VF — resume CPR immediately.`]], flags: ['pads', 'monitor', 'shocked'] };
  return {
    say: [
      ['monitor', `Shock ${n} delivered.`],
      ['you', interpret(s) ? 'After 2 minutes of CPR: organised rhythm, sinus tachycardia 104, carotid pulse present — ROSC. EtCO₂ jumps to 38.' : 'He coughs and moves; there is a pulse — ROSC.', 'good'],
    ],
    rhythm: { profile: 'anterior-stemi', hr: 104 }, pulse: true, phase: 'rosc',
    vitals: { sbp: 84, dbp: 50, spo2: 91, rr: 8, etco2: 38, gcs: 5, pain: 0 },
    flags: ['pads', 'monitor', 'shocked'],
  };
}

export const vfArrest: Scenario = {
  id: 'vf-arrest-field',
  title: 'Collapsed on the treadmill',
  summary: '52-year-old man in witnessed cardiac arrest at a gym, bystander CPR under way. Run the resuscitation and the care after ROSC.',
  setting: 'field',
  roles: [1, 2],
  difficulty: 'advanced',
  conditionId: 'ventricular-fibrillation',
  briefing: {
    default: [
      ['dispatch', 'Cardiac arrest at the fitness centre: 52-year-old man collapsed on a treadmill. Bystander CPR in progress.'],
      ['scene', 'A staff member is doing compressions. The collapse was witnessed about 4 minutes ago; the gym AED is still on the wall.'],
      ['hospital', 'PCI-capable heart centre: 11 minutes. Nearest emergency department (no cath lab): 5 minutes.'],
    ],
  },
  initial: {
    rhythm: { profile: 'vf', hr: 0 }, pulse: false, phase: 'arrest',
    vitals: { sbp: 0, dbp: 0, spo2: 85, rr: 0, etco2: 14, pain: 0, gcs: 3, glucose: 104, temp: 36.6 },
  },
  facts: {
    sample: 'Staff member: "He\'s a member here. He mentioned chest tightness on the treadmill last week."',
    opqrst: 'He cannot answer.',
    lungs: (s) => (s.pulse ? 'Equal air entry with ventilation; no crackles.' : 'Equal chest rise with ventilation.'),
    ecg12: (s) => (s.pulse
      ? `Sinus tachycardia ${s.rhythm.hr} with ST elevation in V1–V4 and reciprocal depression in III and aVF: anterior STEMI — the likely cause of the arrest.`
      : 'No 12-lead during CPR.'),
  },
  status: (s) => (s.pulse ? (s.vitals.gcs <= 8 ? 'Comatose, breathing 8/min on his own.' : 'Stirring.') : 'Unresponsive; CPR continues.'),
  respond: {
    defib: shockOutcome,
    aed: shockOutcome,
    ecg12: (s) => (s.pulse ? null : { blocked: true, say: [['system', 'Not during CPR: get the 12-lead after ROSC.']] }),
    capno: (s) => (s.pulse
      ? { say: [['monitor', `EtCO₂ ${s.vitals.etco2} mmHg.`]], flags: ['capno'] }
      : { say: [['monitor', has(s, 'cpr') ? 'EtCO₂ 18 mmHg during compressions: CPR is adequate.' : 'EtCO₂ 9 mmHg: push harder and faster.']], flags: ['capno'] }),
    fluid: (s) => (s.pulse ? { say: [['monitor', `Bolus in. BP ${s.vitals.sbp + 8}/${s.vitals.dbp + 4}.`]], vitals: { sbp: s.vitals.sbp + 8, dbp: s.vitals.dbp + 4 }, flags: ['fluid'] } : null),
    pressor: (s) => (s.pulse ? { say: [['monitor', 'Norepinephrine-equivalent infusion running: BP 104/64, MAP 77.', 'good']], vitals: { sbp: 104, dbp: 64 }, flags: ['pressor'] } : null),
    'push-epi': (s) => (s.pulse ? { say: [['monitor', 'BP 100/62 for a few minutes.']], vitals: { sbp: 100, dbp: 62 }, flags: ['push-epi'] } : null),
    bvm: (s) => (s.pulse && s.vitals.gcs <= 8
      ? { say: [['you', 'Assisting ventilations, 1 breath every 6 s. SpO₂ 96 %, EtCO₂ 38.']], vitals: { spo2: 96, rr: 10 }, flags: ['ventilated'] }
      : null),
    'o2-nrb': (s) => (s.pulse && s.vitals.gcs <= 8
      ? { say: [['you', 'He is only breathing 8/min: a mask alone will not ventilate him. SpO₂ 93 %.']], vitals: { spo2: 93 }, flags: ['o2'] }
      : null),
  },
  events: [
    {
      id: 'als-arrives',
      when: (s) => s.role === 1 && has(s, 'als') && s.minute >= s.flags.als + 6,
      effect: () => ({ say: [['partner', 'The medics arrive and take over drugs and the airway. Keep compressions going.']] }),
    },
  ],
  critical: [
    { id: 'cpr', label: 'Take over high-quality CPR at once', why: 'Minimise pauses: every interruption drops coronary perfusion pressure back to zero.', done: ['cpr'], points: 10, target: { by: 1.5 } },
    { id: 'shock', label: 'First shock within 3 minutes of arrival', why: 'VF is time-critical: survival falls by about 7–10 % for every minute without defibrillation. Pads go on while your partner does compressions.', done: ['defib', 'aed'], points: 15, target: { by: 3 } },
    { id: 'access', label: 'IV or IO access', why: 'For epinephrine and antiarrhythmics (IO is fine and fast).', done: ['iv', 'io'], roles: [2], points: 5 },
    {
      id: 'epi', label: 'Epinephrine 1 mg after a shock', why: 'For shockable rhythms give epinephrine after the second shock, then every 3–5 minutes.', roles: [2], points: 10,
      done: (s) => {
        const e = s.performed.find((p) => p.id === 'epinephrine');
        if (!e) return null;
        return s.performed.some((p) => (p.id === 'defib' || p.id === 'aed') && p.minute <= e.minute) ? e.minute : null;
      },
    },
    { id: 'antiarrhythmic', label: 'Amiodarone 300 mg (or lidocaine) for refractory VF', why: 'After the third shock, an antiarrhythmic improves the chance of conversion.', done: ['amio-arrest', 'lidocaine'], roles: [2], points: 10 },
    { id: 'ventilation', label: 'Ventilate: bag-valve-mask or advanced airway', why: '30:2 with a BVM, or 1 breath every 6 s with an advanced airway; avoid hyperventilation.', done: ['bvm', 'airway'], points: 5 },
    { id: 'capno', label: 'Waveform capnography', why: 'Confirms the airway, measures CPR quality (EtCO₂ < 10 means poor CPR) and shows ROSC as a sudden rise.', done: ['capno'], roles: [2], points: 5 },
    { id: 'als', label: 'Request ALS', why: 'Advanced airway, IV/IO drugs and post-ROSC care need a paramedic.', done: ['als'], roles: [1], points: 10, target: { by: 3 } },
    { id: 'post-vent', label: 'After ROSC: support his breathing (he breathes 8/min)', why: 'Post-arrest, keep SpO₂ 92–98 % and EtCO₂ 35–45 mmHg; a slow breather needs assisted ventilation.', done: ['bvm', 'airway'], after: 'rosc', points: 5, applies: (s) => has(s, 'rosc') },
    { id: 'post-ecg', label: '12-lead after ROSC', why: 'It showed the anterior STEMI that caused the arrest — he needs the cath lab.', done: ['ecg12', 'ecg12-repeat'], after: 'rosc', points: 10, applies: (s) => has(s, 'rosc') },
    { id: 'post-bp', label: 'Treat post-arrest hypotension (fluid, vasopressor)', why: 'Keep SBP ≥ 90 mmHg and MAP ≥ 65 after ROSC.', done: ['fluid', 'pressor', 'push-epi'], after: 'rosc', roles: [2], points: 5, applies: (s) => has(s, 'rosc') },
    { id: 'pci', label: 'Transport to the PCI-capable heart centre', why: 'Post-arrest STEMI → emergency coronary angiography.', done: (s) => s.flags['dest-pci'] ?? null, points: 10, applies: (s) => has(s, 'rosc') },
    { id: 'handoff', label: 'Hand-off', why: 'Times of collapse, shocks, drugs, ROSC and the 12-lead.', done: ['handoff'], points: 5, applies: (s) => has(s, 'rosc') },
  ],
  harms: [
    { id: 'epi-before-shock', actions: ['epinephrine'], when: (s) => !s.pulse && shocks(s) === 0, points: 3, severity: 'minor', text: 'In VF, shock first: epinephrine comes after the second shock.' },
    { id: 'airway-too-early', actions: ['airway'], when: (s) => !s.pulse && cprCycles(s) < 1, points: 3, severity: 'minor', text: 'Don\'t interrupt the first minutes of compressions and the first shock for an advanced airway; a BVM is fine at first.' },
    { id: 'nearest-ed', actions: ['transport-near'], when: (s) => s.pulse, points: 6, severity: 'major', text: 'A resuscitated STEMI needs a PCI-capable heart centre.' },
  ],
  timings: [
    { label: 'CPR taken over', actions: ['cpr'], target: 1.5 },
    { label: 'First shock', actions: ['defib', 'aed'], target: 3 },
    { label: 'First epinephrine', actions: ['epinephrine'] },
    { label: '12-lead after ROSC', actions: ['ecg12', 'ecg12-repeat'], from: 'rosc' },
  ],
  transportMinutes: 11,
  nearestMinutes: 5,
  arrival: 'You arrive at the heart centre; the cath lab team takes him straight in.',
  deathAfter: 22,
  completeWhen: (s) => has(s, 'rosc'),
  teaching: [
    'High-quality CPR: 100–120 compressions/min, 5–6 cm deep, full recoil, pauses under 10 seconds.',
    'Shock VF or pulseless VT as soon as the defibrillator is ready, then 2 minutes of CPR before the next rhythm check.',
    'Epinephrine 1 mg every 3–5 minutes after the second shock; amiodarone 300 mg (then 150 mg) or lidocaine for refractory VF.',
    'Waveform capnography confirms the airway and measures CPR quality; a sudden rise in EtCO₂ suggests ROSC.',
    'After ROSC: SpO₂ 92–98 %, EtCO₂ 35–45 mmHg, SBP ≥ 90 / MAP ≥ 65, and a 12-lead — STEMI goes to the cath lab.',
  ],
};
