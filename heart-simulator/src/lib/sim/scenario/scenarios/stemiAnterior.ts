import type { Effect, Scenario, SimState } from '../types';
import { has, interpret, line, shocks } from '../kit';

const ROSC_VITALS = { sbp: 104, dbp: 66, spo2: 94, rr: 16, gcs: 14, pain: 6 };

function shockOutcome(s: SimState): Effect | null {
  if (s.pulse || s.rhythm.profile !== 'vf') return null;
  // brief, witnessed VF with early CPR / defibrillation: the first or second shock converts
  const early = has(s, 'cpr') || (s.timers.arrestAt !== undefined && s.minute - s.timers.arrestAt <= 1);
  if (!early && shocks(s) === 0) {
    return { say: [['monitor', 'Shock delivered. No change on the monitor — resume CPR.']], flags: ['pads', 'monitor', 'shocked'] };
  }
  return {
    say: [
      ['monitor', 'Shock delivered.'],
      ['you', interpret(s) ? 'An organised rhythm on the monitor and a carotid pulse — ROSC.' : 'He takes a breath; there is a pulse — ROSC.', 'good'],
      ['patient', 'Groans and opens his eyes: "What happened?"'],
    ],
    rhythm: { profile: 'anterior-stemi', hr: 112 }, pulse: true, phase: 'rosc', vitals: ROSC_VITALS,
    flags: ['pads', 'monitor', 'shocked'],
  };
}

export const stemiAnterior: Scenario = {
  id: 'stemi-anterior-field',
  title: 'Crushing chest pain at home',
  summary: '58-year-old man, 40 minutes of crushing chest pain. Find the STEMI, start treatment, pick the destination — and be ready for what happens en route.',
  setting: 'field',
  roles: [1, 2],
  difficulty: 'intermediate',
  conditionId: 'anterior-stemi',
  briefing: {
    default: [
      ['dispatch', 'Priority 1: 58-year-old man with chest pain. You are the ALS crew.'],
      ['scene', 'He is sitting on the edge of the sofa, pale and sweating, a fist pressed to his chest. His wife says it started about 40 minutes ago while he was shovelling snow.'],
      ['hospital', 'Nearest emergency department: 8 minutes, no cath lab. PCI-capable heart centre: 15 minutes.'],
    ],
    1: [
      ['dispatch', 'Priority 1: 58-year-old man with chest pain. You are the BLS crew; the nearest medic unit is about 10 minutes away.'],
      ['scene', 'He is sitting on the edge of the sofa, pale and sweating, a fist pressed to his chest. His wife says it started about 40 minutes ago while he was shovelling snow.'],
      ['hospital', 'Nearest emergency department: 8 minutes, no cath lab. PCI-capable heart centre: 15 minutes.'],
    ],
  },
  initial: {
    rhythm: { profile: 'anterior-stemi', hr: 96 },
    vitals: { sbp: 148, dbp: 92, spo2: 95, rr: 20, etco2: 36, pain: 8, gcs: 15, glucose: 132, temp: 36.8 },
  },
  facts: {
    opqrst: 'It came on 40 minutes ago while I was shovelling. Like an elephant on my chest — it goes into my left arm and jaw. 8 out of 10. Nothing makes it better.',
    sample: 'No allergies. I take lisinopril and atorvastatin. High blood pressure and cholesterol; I smoke a pack a day. Lunch was 2 hours ago.',
    pde5: "No, I don't take anything like that.",
    lungs: 'Clear and equal on both sides.',
    perfusion: 'Pale, cool and clammy. No JVD. Radial pulses strong and equal.',
    ecg12: (s) => s.rhythm.profile === 'anterior-stemi'
      ? `Sinus ${s.rhythm.hr > 100 ? 'tachycardia' : 'rhythm'} ${s.rhythm.hr} with 3–4 mm ST elevation in V1–V4, hyperacute T waves and reciprocal ST depression in III and aVF: anterior STEMI (proximal LAD).`
      : 'Rhythm strip only — no 12-lead possible during the arrest.',
    ecgRight: 'V4R: no ST elevation.',
    ecgPosterior: 'V7–V9: no ST elevation.',
  },
  status: (s) => {
    if (!s.pulse) return 'Unresponsive, not breathing normally.';
    if (has(s, 'rosc')) return 'Awake but drowsy; chest still hurts, 6 out of 10.';
    return s.vitals.pain >= 7 ? `"It's crushing — ${s.vitals.pain} out of 10."` : `"A bit easier — ${s.vitals.pain} out of 10."`;
  },
  respond: {
    'ecg-transmit': (s) => has(s, 'ecg12')
      ? { say: [['hospital', 'ECG received. The physician confirms an anterior STEMI and activates the cath lab.']], flags: ['transmitted', 'alert'] }
      : null,
    defib: shockOutcome,
    aed: shockOutcome,
  },
  events: [
    {
      id: 'als-arrives',
      when: (s) => s.role === 1 && has(s, 'als') && s.minute >= s.flags.als + 6,
      effect: () => ({ say: [['partner', 'The medic unit meets you; a paramedic joins you to take over advanced care. Keep going with what you are doing.']] }),
    },
    {
      id: 'vf',
      when: (s) => s.pulse && s.phase === 'initial' && ((has(s, 'enroute') && s.minute >= s.flags.enroute + 3) || s.minute >= 16),
      effect: (s) => ({
        say: [
          ['partner', "He's gone limp — he's not responding and he's gasping!", 'bad'],
          line('monitor', 'Monitor alarm!', 'bad'),
        ],
        rhythm: { profile: 'vf', hr: 0 }, pulse: false, phase: 'arrest', flags: ['vf'],
      }),
    },
  ],
  critical: [
    { id: 'history', label: 'Pain and history (OPQRST and SAMPLE)', why: 'Onset, character and risk factors make the diagnosis and screen for contraindications.', done: (s) => (has(s, 'opqrst') && has(s, 'sample') ? Math.max(s.flags.opqrst, s.flags.sample) : null), points: 5, target: { by: 10 } },
    { id: 'vitals', label: 'Vital signs', why: 'You need a blood pressure before aspirin, nitroglycerin or transport decisions.', done: ['vitals', 'nibp'], points: 5, target: { by: 6 } },
    { id: 'ecg', label: '12-lead ECG within 10 minutes of first contact', why: 'Every possible ACS needs a 12-lead within 10 minutes: it makes the STEMI diagnosis and decides the destination.', done: ['ecg12'], points: 15, target: { by: 10 } },
    { id: 'transmit', label: 'Transmit the 12-lead (you do not interpret it)', why: 'Transmitting lets the physician read it and activate the cath lab before you arrive.', done: ['ecg-transmit'], roles: [1], points: 10, target: { by: 15 } },
    { id: 'als', label: 'Request a paramedic intercept', why: 'A STEMI can turn into VF or shock at any moment; ALS should meet you, but never delay transport waiting for them.', done: ['als'], roles: [1], points: 5, target: { by: 6 } },
    { id: 'aspirin', label: 'Aspirin 162–325 mg chewed', why: 'Early aspirin reduces STEMI mortality (ISIS-2). Give it unless the patient is truly allergic or bleeding.', done: ['aspirin'], points: 10, target: { by: 15 } },
    { id: 'pads', label: 'Defibrillation pads on early', why: 'Anterior STEMI carries a high early risk of VF; pads on means a shock in seconds.', done: ['pads', 'aed', 'defib'], roles: [2], points: 5, target: { by: 12 } },
    { id: 'iv', label: 'IV access', why: 'Needed for analgesia and for the resuscitation that followed.', done: ['iv', 'io'], roles: [2], points: 5 },
    { id: 'alert', label: 'STEMI alert from the field', why: 'Prehospital activation cuts door-to-balloon time: the team is waiting when you arrive.', done: ['stemi-alert', 'ecg-transmit'], roles: [2], points: 15, target: { by: 15 } },
    { id: 'pci', label: 'Straight to the PCI-capable heart centre', why: 'Primary PCI within 90 minutes of first contact beats fibrinolysis; bypass the ED without a cath lab.', done: (s) => s.flags['dest-pci'] ?? null, points: 10 },
    { id: 'vf-response', label: 'Immediate response to VF: CPR or a shock within 1 minute', why: 'Every minute of untreated VF lowers survival by about 7–10 %.', done: ['cpr', 'defib', 'aed'], after: 'arrest', points: 10, target: { within: { flag: 'arrest', minutes: 1 } }, applies: (s) => has(s, 'arrest') },
    { id: 'shock', label: 'Defibrillation within 2 minutes of VF', why: 'Witnessed VF with pads on should be shocked within seconds; early defibrillation is the single biggest factor in survival.', done: ['defib', 'aed'], after: 'arrest', points: 15, target: { within: { flag: 'arrest', minutes: 2 } }, applies: (s) => has(s, 'arrest') },
    { id: 'post-ecg', label: 'Repeat 12-lead after ROSC', why: 'The post-arrest ECG confirms the STEMI and goes to the cath lab team.', done: ['ecg12-repeat', 'ecg12'], after: 'rosc', points: 5, applies: (s) => has(s, 'rosc') },
    { id: 'handoff', label: 'Hand-off at the heart centre', why: 'A structured hand-off (SBAR) carries times, drugs and the ECG to the cath lab team.', done: ['handoff'], points: 5 },
  ],
  harms: [
    { id: 'nitro-no-bp', actions: ['nitro', 'nitro-assist'], when: (s) => !has(s, 'bp'), points: 5, severity: 'major', text: 'Nitroglycerin without a blood pressure. Check BP first: SBP must be at least 90–100 mmHg (per protocol).' },
    { id: 'nitro-no-pde5', actions: ['nitro', 'nitro-assist'], when: (s) => !has(s, 'pde5-asked'), points: 3, severity: 'minor', text: 'Nitroglycerin without asking about sildenafil or vardenafil (24 h) or tadalafil (48 h). Together they can cause profound hypotension.' },
    { id: 'oxygen-normoxic', actions: ['o2-nc', 'o2-nrb'], when: (s) => s.pulse && s.vitals.spo2 >= 90, points: 3, severity: 'minor', text: 'Oxygen is for SpO₂ below 90 %. Routine oxygen in a normoxic STEMI gives no benefit, and high-flow oxygen may increase infarct size (AVOID).' },
    { id: 'beta-blocker', actions: ['metoprolol'], points: 8, severity: 'major', text: 'IV beta-blockers are not a prehospital STEMI treatment; in anterior STEMI they raise the risk of cardiogenic shock (COMMIT).' },
    { id: 'nearest-ed', actions: ['transport-near'], points: 10, severity: 'major', text: 'A STEMI goes straight to a PCI-capable centre (first medical contact to device within 90 minutes). The nearest ED has no cath lab and adds a transfer.' },
    { id: 'cpap-clear', actions: ['cpap'], when: (s) => s.pulse, points: 4, severity: 'minor', text: 'CPAP is for respiratory distress from pulmonary oedema; his lungs were clear.' },
  ],
  timings: [
    { label: 'First 12-lead', actions: ['ecg12'], target: 10 },
    { label: 'Aspirin', actions: ['aspirin'], target: 15 },
    { label: 'Cath lab activated', actions: ['stemi-alert', 'ecg-transmit'], target: 15 },
    { label: 'First shock after VF began', actions: ['defib', 'aed'], target: 2, from: 'arrest' },
  ],
  transportMinutes: 15,
  arrival: 'You arrive at the heart centre; the cath lab team meets you at the door.',
  teaching: [
    'Anterior STEMI is a proximal LAD occlusion: a large territory with a high risk of VF and cardiogenic shock in the first hours. Pads on early.',
    '12-lead within 10 minutes of first contact; transmit it and activate the cath lab from the field.',
    'Aspirin 162–325 mg chewed for every suspected ACS unless contraindicated.',
    'Nitroglycerin only with SBP ≥ 90–100 mmHg, no PDE5 inhibitor in the last 24–48 h and no suspected RV infarction.',
    'Oxygen only if SpO₂ < 90 %.',
    'Destination: a PCI-capable centre — first medical contact to device within 90 minutes.',
    'Witnessed VF: shock immediately, then CPR; after ROSC repeat the 12-lead and continue to PCI.',
  ],
};
