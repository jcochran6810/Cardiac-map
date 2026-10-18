import type { Effect, Scenario, SimState } from '../types';
import { has } from '../kit';

function slower(s: SimState, text: string): Effect {
  return {
    say: [['monitor', text, 'bad'], ['patient', 'He stops answering and his eyes roll back.', 'bad']],
    rhythm: { profile: s.rhythm.profile === 'tcp' ? 'tcp' : 'third-degree-avb', hr: s.rhythm.profile === 'tcp' ? s.rhythm.hr : 22 },
    vitals: { sbp: 58, dbp: 32, gcs: 9 },
  };
}

export const heartBlock: Scenario = {
  id: 'complete-heart-block-field',
  title: 'Weak, dizzy and fainting',
  summary: '78-year-old man who keeps passing out, with a heart rate in the 30s and a low blood pressure. Decide how to get the rate up — and what not to give.',
  setting: 'field',
  roles: [2],
  difficulty: 'intermediate',
  conditionId: 'third-degree-av-block',
  briefing: {
    default: [
      ['dispatch', 'Priority 1: 78-year-old man, weakness and fainting.'],
      ['scene', 'He is lying on the bathroom floor, pale and confused about the date. His wife says he has fainted twice this morning.'],
      ['hospital', 'Cardiac centre (transvenous pacing available): 14 minutes. Nearest emergency department: 7 minutes.'],
    ],
  },
  initial: {
    rhythm: { profile: 'third-degree-avb', hr: 34 },
    vitals: { sbp: 74, dbp: 42, spo2: 93, rr: 20, etco2: 34, pain: 0, gcs: 14, glucose: 112, temp: 36.4 },
  },
  facts: {
    opqrst: 'No chest pain. Just weak and dizzy — I keep blacking out.',
    sample: 'No allergies. Metoprolol, lisinopril and aspirin. I had a heart attack three years ago.',
    pde5: 'No.',
    lungs: 'Fine crackles at both bases.',
    perfusion: 'Pale, cool, mottled knees; slow capillary refill. Irregular cannon waves in the neck veins.',
    neuro: 'Confused about the date but follows commands; no focal deficit.',
    ecg12: (s) => s.rhythm.profile === 'tcp'
      ? 'Paced rhythm at 70 with a wide QRS after every pacing spike: electrical capture.'
      : `Complete heart block: P waves at about 80/min march through on their own; a wide-complex ventricular escape at ${s.rhythm.hr}/min with no relationship to them. No ST elevation.`,
  },
  status: (s) => {
    if (s.rhythm.profile === 'tcp') return has(s, 'analgesia') || has(s, 'sedation') ? '"That\'s better. I can think again."' : '"Ow — that thumping hurts!"';
    return s.vitals.gcs < 13 ? 'Barely responding.' : '"I feel like I\'m going to black out again."';
  },
  respond: {
    atropine: (s) => s.rhythm.profile === 'third-degree-avb'
      ? { say: [['monitor', 'No change: still 34. A wide-complex escape (infranodal block) rarely responds to atropine.']], flags: ['atropine'] }
      : null,
    pace: (s) => s.rhythm.profile === 'third-degree-avb' ? {
      say: [
        ['monitor', 'Pacing at 70: a wide QRS follows every spike from 85 mA — electrical capture.'],
        ['patient', '"Ow! What is that?"'],
      ],
      rhythm: { profile: 'tcp', hr: 70 }, vitals: { sbp: 104, dbp: 62, gcs: 15, pain: 7 }, flags: ['pads', 'monitor', 'paced'],
    } : null,
    pressor: (s) => s.rhythm.profile === 'third-degree-avb' ? {
      say: [['monitor', 'Epinephrine infusion running: escape rate up to 46, BP 96/58.', 'good']],
      rhythm: { profile: 'third-degree-avb', hr: 46 }, vitals: { sbp: 96, dbp: 58, gcs: 15 }, flags: ['pressor'],
    } : null,
    lidocaine: (s) => slower(s, 'The escape rhythm slows to 22!'),
    'amio-infusion': (s) => slower(s, 'The escape rhythm slows to 22!'),
    metoprolol: (s) => slower(s, 'Rate 22 after the beta-blocker!'),
    diltiazem: (s) => slower(s, 'Rate 22 after the calcium-channel blocker!'),
    adenosine6: () => ({ say: [['monitor', 'Six seconds of ventricular standstill… then the escape returns at 30.', 'bad']], rhythm: { profile: 'third-degree-avb', hr: 30 } }),
    adenosine12: () => ({ say: [['monitor', 'Eight seconds of ventricular standstill… then the escape returns at 30.', 'bad']], rhythm: { profile: 'third-degree-avb', hr: 30 } }),
    'pulse-check': (s) => s.rhythm.profile === 'tcp'
      ? { say: [['you', 'Femoral pulse at 70, matching the pacer: mechanical capture.', 'good']], flags: ['capture-confirmed'] }
      : null,
    fentanyl: (s) => has(s, 'paced')
      ? { say: [['patient', '"That\'s easier, thank you."', 'good']], vitals: { pain: 2 }, flags: ['analgesia'] }
      : null,
    sedation: (s) => has(s, 'paced')
      ? { say: [['you', 'Small dose of sedation/analgesia: comfortable, still talking, airway fine.', 'good']], vitals: { pain: 1 }, flags: ['sedation', 'analgesia'] }
      : null,
  },
  events: [
    {
      id: 'worse',
      when: (s) => s.minute >= 12 && s.rhythm.profile === 'third-degree-avb' && !has(s, 'pressor'),
      effect: () => ({
        say: [['partner', 'He is getting harder to rouse.', 'bad'], ['monitor', 'Escape rate 28. BP 62/34.', 'bad']],
        rhythm: { profile: 'third-degree-avb', hr: 28 }, vitals: { sbp: 62, dbp: 34, gcs: 11 },
      }),
    },
  ],
  critical: [
    { id: 'pads', label: 'Monitor and pacing pads on at once', why: 'Unstable bradycardia: with pads already on you can pace in seconds if the drugs fail.', done: ['pads'], points: 10, target: { by: 5 } },
    { id: 'ecg', label: '12-lead ECG', why: 'Confirms complete heart block (and rules out an inferior STEMI as the cause).', done: ['ecg12'], points: 5, target: { by: 12 } },
    { id: 'meds', label: 'Medication history (SAMPLE)', why: 'Beta-blockers, calcium-channel blockers and digoxin cause or worsen AV block — he takes metoprolol.', done: ['sample'], points: 5 },
    { id: 'iv', label: 'IV access', why: 'For atropine, a pressor and analgesia.', done: ['iv', 'io'], points: 5 },
    { id: 'atropine', label: 'Atropine 1 mg first, without delaying pacing', why: 'Atropine is first-line for symptomatic bradycardia — but expect it to fail in a wide-escape (infranodal) block.', done: ['atropine'], points: 5 },
    { id: 'rate', label: 'Raise the rate: transcutaneous pacing or a pressor infusion', why: 'Atropine-resistant unstable bradycardia needs pacing or an epinephrine/dopamine infusion now.', done: (s) => [s.flags.paced, s.flags.pressor].filter((m): m is number => m !== undefined).sort((a, b) => a - b)[0] ?? null, points: 20, target: { by: 10 } },
    { id: 'capture', label: 'Confirm mechanical capture with a pulse', why: 'Electrical capture on the screen is not enough: feel a femoral pulse at the paced rate (or check the BP).', done: ['pulse-check', 'nibp', 'vitals'], after: 'paced', points: 5, applies: (s) => has(s, 'paced') },
    { id: 'analgesia', label: 'Analgesia or sedation for pacing', why: 'Transcutaneous pacing is painful: give analgesia (and sedation if needed) once the patient is perfusing.', done: ['fentanyl', 'sedation'], after: 'paced', points: 5, applies: (s) => has(s, 'paced') },
    { id: 'destination', label: 'Transport to the cardiac centre', why: 'He needs a transvenous pacing wire and probably a permanent pacemaker.', done: (s) => s.flags['dest-pci'] ?? null, points: 5 },
    { id: 'handoff', label: 'Hand-off', why: 'Report the rhythm, capture threshold, drugs and the beta-blocker.', done: ['handoff'], points: 5 },
  ],
  harms: [
    { id: 'lidocaine-escape', actions: ['lidocaine', 'amio-infusion'], points: 20, severity: 'critical', text: 'Never give lidocaine or amiodarone for a wide ventricular escape rhythm: it is the only thing keeping him alive, and suppressing it can cause asystole.' },
    { id: 'av-blocker', actions: ['metoprolol', 'diltiazem'], points: 15, severity: 'critical', text: 'Beta-blockers and calcium-channel blockers slow AV conduction further: they worsen complete heart block.' },
    { id: 'adenosine-block', actions: ['adenosine6', 'adenosine12'], points: 10, severity: 'major', text: 'Adenosine blocks the AV node: in heart block it causes prolonged ventricular standstill.' },
    { id: 'cpap-shock', actions: ['cpap'], points: 6, severity: 'major', text: 'CPAP reduces venous return; with SBP in the 70s it can deepen shock.' },
    { id: 'big-fluid', actions: ['fluid'], when: (s) => (s.counts.fluid ?? 0) >= 1, points: 3, severity: 'minor', text: 'Repeated fluid boluses with crackles at both bases: the problem is the rate, not the volume.' },
    { id: 'nearest-ed', actions: ['transport-near'], points: 3, severity: 'minor', text: 'The nearest ED cannot place a transvenous pacing wire; the cardiac centre can.' },
  ],
  timings: [
    { label: 'Pads on', actions: ['pads'], target: 5 },
    { label: 'Pacing started', actions: ['pace'], target: 10 },
  ],
  transportMinutes: 14,
  nearestMinutes: 7,
  arrival: 'You arrive at the cardiac centre; the cath lab is setting up for a transvenous pacing wire.',
  teaching: [
    'Unstable bradycardia (hypotension, altered mental status, shock, ischaemic chest pain, acute heart failure) needs treatment now.',
    'Atropine 1 mg IV every 3–5 minutes (max 3 mg) is first-line, but it is unlikely to work in infranodal (wide-escape) block or a transplanted heart.',
    'Transcutaneous pacing: pads on, rate about 70, raise the current until electrical capture, confirm mechanical capture with a femoral pulse, then give analgesia and sedation.',
    'Alternatives or a bridge: epinephrine 2–10 mcg/min or dopamine 5–20 mcg/kg/min.',
    'Never give lidocaine or amiodarone to a ventricular escape rhythm; avoid AV-nodal blockers and adenosine.',
    'Look for causes: ischaemia, beta-blocker, calcium-channel-blocker or digoxin toxicity, hyperkalaemia.',
  ],
};
