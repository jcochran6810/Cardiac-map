import type { Effect, Scenario, SimState } from '../types';
import { has } from '../kit';

const SINUS = { profile: 'normal-sinus', hr: 94 };

function converted(s: SimState, how: string): Effect {
  return {
    say: [['monitor', how, 'good'], ['patient', '"Oh… it\'s stopped. I can breathe again."', 'good']],
    rhythm: SINUS, vitals: { sbp: 114, dbp: 74, pain: 0, gcs: 15, rr: 18 }, flags: ['converted'],
  };
}

export const svtUnstable: Scenario = {
  id: 'svt-unstable-field',
  title: 'Racing heart and about to faint',
  summary: '34-year-old woman with a sudden pounding heartbeat at 190, a low blood pressure and chest tightness. Stable or unstable — and which shock?',
  setting: 'field',
  roles: [2],
  difficulty: 'intermediate',
  conditionId: 'avnrt',
  briefing: {
    default: [
      ['dispatch', 'Priority 1: 34-year-old woman with a racing heart.'],
      ['scene', 'She is lying on her office floor, pale and sweaty. "My heart is pounding and I think I\'m going to faint." It started suddenly 30 minutes ago.'],
      ['hospital', 'Nearest emergency department: 10 minutes.'],
    ],
  },
  initial: {
    rhythm: { profile: 'avnrt', hr: 190 },
    vitals: { sbp: 82, dbp: 54, spo2: 96, rr: 24, etco2: 32, pain: 4, gcs: 15, glucose: 98, temp: 36.7 },
  },
  facts: {
    opqrst: 'It started suddenly, like a switch: pounding in my chest and neck, and a tightness in my chest, 4 out of 10.',
    sample: 'No allergies, no medicines. It has happened twice before but stopped on its own.',
    pde5: 'No.',
    lungs: 'Clear.',
    perfusion: 'Pale and sweaty; weak radial pulse, too fast to count; neck pulsations.',
    neuro: 'Alert and oriented, very anxious.',
    ecg12: (s) => s.rhythm.profile === 'avnrt'
      ? 'Regular narrow-complex tachycardia at 190 with no visible P waves (retrograde P waves hidden in the QRS): SVT, most likely AVNRT.'
      : s.rhythm.profile === 'normal-sinus'
        ? 'Sinus rhythm 94, normal PR and QRS, no delta wave (no pre-excitation), no ST changes.'
        : 'No 12-lead possible right now.',
  },
  status: (s) => {
    if (!s.pulse) return 'Unresponsive.';
    if (has(s, 'converted')) return '"I feel so much better."';
    return s.vitals.sbp < 75 ? 'Drowsy, barely answering.' : '"Please make it stop — I feel like I\'m going to pass out."';
  },
  respond: {
    vagal: (s) => s.rhythm.profile === 'avnrt'
      ? { say: [['monitor', 'She strains, legs raised… no change: still 190.']], flags: ['vagal'] }
      : null,
    adenosine6: (s) => s.rhythm.profile === 'avnrt'
      ? { say: [['monitor', 'A brief pause… then SVT resumes at 190.']], flags: ['adenosine'] }
      : null,
    adenosine12: (s) => s.rhythm.profile === 'avnrt'
      ? { ...converted(s, 'A 5-second pause, then sinus rhythm at 94.'), flags: ['converted', 'adenosine'] }
      : null,
    cardiovert: (s) => s.pulse && s.rhythm.profile === 'avnrt'
      ? { ...converted(s, 'Synchronised shock at 100 J: sinus rhythm at 94.'), flags: ['converted', 'cardioverted', 'pads', 'monitor'] }
      : null,
    defib: (s) => {
      if (s.pulse && s.rhythm.profile === 'avnrt') {
        return {
          say: [['monitor', 'Unsynchronised shock landed on the T wave: ventricular fibrillation!', 'bad']],
          rhythm: { profile: 'vf', hr: 0 }, pulse: false, flags: ['pads', 'monitor', 'iatrogenic-vf'],
        };
      }
      if (!s.pulse && s.rhythm.profile === 'vf') {
        return {
          say: [['monitor', 'Shock delivered.'], ['you', 'Organised rhythm, pulse present: sinus tachycardia 108. ROSC.', 'good']],
          rhythm: { profile: 'sinus-tachycardia', hr: 108 }, pulse: true, vitals: { sbp: 96, dbp: 60, gcs: 13, pain: 0 },
          flags: ['pads', 'monitor', 'shocked', 'converted'],
        };
      }
      return null;
    },
    diltiazem: (s) => s.rhythm.profile === 'avnrt'
      ? { say: [['monitor', 'Rate 170, but BP falls to 64/38.', 'bad'], ['patient', 'She becomes drowsy.', 'bad']], rhythm: { profile: 'avnrt', hr: 170 }, vitals: { sbp: 64, dbp: 38, gcs: 13 }, flags: ['diltiazem'] }
      : null,
    metoprolol: (s) => s.rhythm.profile === 'avnrt'
      ? { say: [['monitor', 'Rate 176; BP 66/40.', 'bad']], rhythm: { profile: 'avnrt', hr: 176 }, vitals: { sbp: 66, dbp: 40, gcs: 14 }, flags: ['beta-blocker'] }
      : null,
    sedation: (s) => s.rhythm.profile === 'avnrt'
      ? { say: [['you', 'Small dose of sedation/analgesia: drowsy but rousable, airway fine.']], vitals: { sbp: s.vitals.sbp - 4, dbp: s.vitals.dbp - 2 }, flags: ['sedation'] }
      : null,
  },
  events: [
    {
      id: 'worse',
      when: (s) => s.pulse && s.rhythm.profile === 'avnrt' && s.minute >= 12,
      effect: (s) => ({
        say: [['partner', 'She is getting drowsy and the chest pain is worse.', 'bad'], ['monitor', 'BP 68/40.', 'bad']],
        vitals: { sbp: Math.min(s.vitals.sbp, 68), dbp: Math.min(s.vitals.dbp, 40), gcs: 13, pain: 6 },
      }),
    },
  ],
  critical: [
    { id: 'pads', label: 'Monitor and pads on', why: 'An unstable tachycardia may need a shock within minutes.', done: ['pads'], points: 10, target: { by: 4 } },
    { id: 'instability', label: 'Check for instability: vitals and mental status', why: 'Hypotension, altered mental status, shock, ischaemic chest pain or acute heart failure make a tachycardia "unstable".', done: ['vitals', 'nibp'], points: 5, target: { by: 4 } },
    { id: 'iv', label: 'IV access', why: 'For adenosine and sedation.', done: ['iv', 'io'], points: 5 },
    {
      id: 'terminate', label: 'Terminate it: synchronised cardioversion (adenosine only if it does not delay)',
      why: 'Unstable regular narrow-complex tachycardia → synchronised cardioversion at 50–100 J; adenosine can be tried while you prepare.',
      done: (s) => (has(s, 'converted') && !has(s, 'iatrogenic-vf') ? s.flags.converted : null), points: 20, target: { by: 8 },
    },
    {
      id: 'sedation', label: 'Sedation before cardioversion (she was awake)',
      why: 'Cardioversion is painful; sedate the conscious patient when the situation allows.',
      done: (s) => (has(s, 'sedation') && s.flags.sedation <= (s.flags.cardioverted ?? Infinity) ? s.flags.sedation : null),
      points: 5, applies: (s) => has(s, 'cardioverted'),
    },
    { id: 'post-ecg', label: '12-lead after conversion (look for pre-excitation)', why: 'A delta wave (WPW) changes long-term treatment and which drugs are safe.', done: ['ecg12', 'ecg12-repeat'], after: 'converted', points: 5, applies: (s) => has(s, 'converted') },
    { id: 'transport', label: 'Transport', why: 'She needs ED observation and cardiology follow-up (ablation is curative).', done: ['transport-near', 'transport-pci'], points: 5 },
    { id: 'handoff', label: 'Hand-off', why: 'Report the rhythm strip, what converted it and the post-conversion 12-lead.', done: ['handoff'], points: 5 },
  ],
  harms: [
    { id: 'shock-with-pulse', actions: ['defib', 'aed'], when: (s) => s.pulse, points: 20, severity: 'critical', text: 'An unsynchronised shock on a perfusing rhythm can land on the T wave and cause VF — which is what happened. Use SYNC for every tachycardia with a pulse.' },
    { id: 'av-blocker-shock', actions: ['diltiazem', 'metoprolol'], when: (s) => s.vitals.sbp < 90, points: 12, severity: 'critical', text: 'Calcium-channel and beta-blockers lower the blood pressure further; in an unstable (hypotensive) SVT the treatment is electrical.' },
    { id: 'no-sedation', actions: ['cardiovert'], when: (s) => s.pulse && s.vitals.gcs >= 14 && !has(s, 'sedation'), points: 3, severity: 'minor', text: 'Cardioversion of an awake patient without sedation or analgesia.' },
    { id: 'amiodarone-svt', actions: ['amio-infusion'], points: 3, severity: 'minor', text: 'Amiodarone is not a first-line drug for re-entrant SVT; it is slow and can drop the blood pressure.' },
    { id: 'oxygen-normoxic', actions: ['o2-nc', 'o2-nrb'], when: (s) => s.pulse && s.vitals.spo2 >= 90, points: 2, severity: 'minor', text: 'Oxygen is for SpO₂ below 90 %.' },
  ],
  timings: [
    { label: 'Pads on', actions: ['pads'], target: 4 },
    { label: 'Synchronised cardioversion', actions: ['cardiovert'], target: 8 },
  ],
  transportMinutes: 10,
  nearestMinutes: 10,
  arrival: 'You arrive at the emergency department.',
  teaching: [
    'Tachycardia with a pulse: look for instability — hypotension, altered mental status, shock, ischaemic chest pain, acute heart failure.',
    'Unstable → synchronised cardioversion. Regular narrow-complex: 50–100 J; irregular narrow (AF): 120–200 J; regular wide: 100 J (biphasic).',
    'Adenosine (6 mg rapid push, then 12 mg) may be tried for a regular narrow-complex SVT if it does not delay cardioversion.',
    'Sedate the conscious patient if time allows.',
    'Never deliver an unsynchronised shock to a perfusing rhythm.',
    'Avoid calcium-channel and beta-blockers in a hypotensive patient.',
    'After conversion, record a 12-lead and look for a delta wave (WPW).',
  ],
};
