import type { Effect, Scenario, SimState } from '../types';
import { has } from '../kit';

/** RV infarction: nitrates drop preload and blood pressure */
function nitroCrash(s: SimState): Effect {
  return {
    say: [
      ['patient', '"I feel like I\'m going to pass out…" She goes grey and slumps in the chair.', 'bad'],
      ['monitor', 'BP 74/44.', 'bad'],
    ],
    vitals: { sbp: 74, dbp: 44, gcs: 14, pain: Math.max(0, s.vitals.pain - 1) },
    flags: ['nitro', 'hypotension'],
  };
}

export const stemiInferiorRV: Scenario = {
  id: 'stemi-inferior-rv-field',
  title: '"Indigestion" and feeling faint',
  summary: '66-year-old woman with epigastric pressure, nausea and near-fainting. An inferior STEMI with a trap: what you give first can crash her blood pressure.',
  setting: 'field',
  roles: [1, 2],
  difficulty: 'advanced',
  conditionId: 'inferior-stemi',
  briefing: {
    default: [
      ['dispatch', 'Priority 1: 66-year-old woman, "indigestion", nearly fainted.'],
      ['scene', 'She is sitting at the kitchen table, grey and clammy, nauseated. Her daughter says the "heartburn" started about an hour ago and she nearly fainted when she stood up.'],
      ['hospital', 'PCI-capable heart centre: 12 minutes. Nearest emergency department (no cath lab): 6 minutes.'],
    ],
  },
  initial: {
    rhythm: { profile: 'inferior-stemi', hr: 58 },
    vitals: { sbp: 102, dbp: 64, spo2: 95, rr: 18, etco2: 35, pain: 6, gcs: 15, glucose: 168, temp: 36.5 },
  },
  facts: {
    opqrst: 'Pressure in the upper belly and lower chest for about an hour, a little into my back. 6 out of 10. I feel sick, and dizzy when I stand.',
    sample: 'Allergic to penicillin. I take metformin and amlodipine for diabetes and blood pressure.',
    pde5: 'No.',
    ownNitro: 'I have a nitroglycerin spray from my doctor.',
    lungs: 'Clear and equal on both sides.',
    perfusion: 'Pale and clammy. Neck veins distended even sitting upright. Radial pulses weak.',
    ecg12: (s) => s.rhythm.profile === 'inferior-stemi-chb'
      ? `Complete heart block with a narrow junctional escape at ${s.rhythm.hr}; ST elevation persists in II, III and aVF.`
      : `Sinus ${s.rhythm.hr < 60 ? 'bradycardia' : 'rhythm'} ${s.rhythm.hr} with ST elevation in II, III and aVF (III > II) and reciprocal depression in aVL and I: inferior STEMI. ST elevation in III greater than II points to the RCA.`,
    ecgRight: 'V4R: 1.5 mm ST elevation.',
    ecgPosterior: 'V7–V9: no ST elevation.',
  },
  status: (s) => {
    if (s.vitals.sbp < 90) return '"I feel so faint…" Pale, sweaty, barely answering.';
    return s.vitals.pain >= 5 ? '"Still the pressure — and I feel sick."' : '"A little better."';
  },
  respond: {
    nitro: (s) => nitroCrash(s),
    'nitro-assist': (s) => nitroCrash(s),
    fluid: (s) => {
      if (s.vitals.sbp >= 100) return null;
      const sbp = Math.min(108, s.vitals.sbp + 14);
      return { say: [['monitor', `250 mL in. BP ${sbp}/${Math.min(70, s.vitals.dbp + 9)}. Lungs still clear.`, 'good']], vitals: { sbp, dbp: Math.min(70, s.vitals.dbp + 9), gcs: 15 }, flags: ['fluid'] };
    },
    atropine: (s) => {
      if (s.rhythm.profile !== 'inferior-stemi-chb') return null;
      return {
        say: [['monitor', 'Heart rate up to 66.', 'good'], ['patient', '"That\'s a bit better."']],
        rhythm: { profile: 'inferior-stemi', hr: 66 }, vitals: { sbp: Math.min(106, s.vitals.sbp + 12), dbp: Math.min(68, s.vitals.dbp + 8) }, flags: ['atropine', 'brady-treated'],
      };
    },
    pace: (s) => s.rhythm.profile === 'inferior-stemi-chb' ? {
      say: [['monitor', 'Pacer on: rate 70, output turned up to 70 mA.'], ['you', 'Femoral pulse now 70, matching the pacer.', 'good']],
      rhythm: { profile: 'tcp', hr: 70 }, vitals: { sbp: Math.max(s.vitals.sbp, 100), dbp: Math.max(s.vitals.dbp, 62), pain: Math.max(s.vitals.pain, 6) }, flags: ['pads', 'monitor', 'paced', 'brady-treated'],
    } : null,
    'ecg-transmit': (s) => has(s, 'ecg12') ? {
      say: [['hospital', 'ECG received: inferior STEMI. Cath lab activated. Medical control: no nitroglycerin until RV involvement is excluded.']],
      flags: ['transmitted', 'alert'],
    } : null,
  },
  events: [
    {
      id: 'chb',
      when: (s) => s.pulse && s.rhythm.profile === 'inferior-stemi' && !has(s, 'brady-treated') && s.minute >= 9,
      effect: (s) => ({
        say: [
          ['patient', '"Everything\'s going dark…"', 'bad'],
          ['monitor', 'Monitor alarm: heart rate 40.', 'bad'],
        ],
        rhythm: { profile: 'inferior-stemi-chb', hr: 40 }, vitals: { sbp: Math.min(s.vitals.sbp - 14, 86), dbp: Math.min(s.vitals.dbp - 10, 52), gcs: 14 },
        flags: ['chb', 'hypotension'],
      }),
    },
    {
      id: 'als-arrives',
      when: (s) => s.role === 1 && has(s, 'als') && s.minute >= s.flags.als + 6,
      effect: () => ({ say: [['partner', 'The medic unit meets you; a paramedic takes over advanced care and asks for your findings.']] }),
    },
    {
      // the intercept you asked for treats the block (an EMT cannot)
      id: 'als-treats-block',
      when: (s) => s.role === 1 && s.fired.includes('als-arrives') && s.rhythm.profile === 'inferior-stemi-chb'
        && s.minute >= Math.max(s.flags.chb, s.flags.als + 6) + 1,
      effect: () => ({
        say: [
          ['partner', 'Paramedic: "Heart block. Atropine 1 milligram going in, and a 250 mL bolus — her lungs are clear."'],
          ['monitor', 'Pulse up to 66. BP 98/62.', 'good'],
        ],
        rhythm: { profile: 'inferior-stemi', hr: 66 }, vitals: { sbp: 98, dbp: 62, gcs: 15 }, flags: ['brady-treated'],
      }),
    },
  ],
  critical: [
    { id: 'history', label: 'Pain and history (OPQRST and SAMPLE)', why: 'Epigastric "indigestion" with nausea is a classic inferior MI presentation, especially in women and people with diabetes.', done: (s) => (has(s, 'opqrst') && has(s, 'sample') ? Math.max(s.flags.opqrst, s.flags.sample) : null), points: 5, target: { by: 10 } },
    { id: 'vitals', label: 'Vital signs', why: 'Borderline BP and bradycardia are the clues to RV involvement.', done: ['vitals', 'nibp'], points: 5, target: { by: 6 } },
    { id: 'ecg', label: '12-lead ECG within 10 minutes', why: 'The 12-lead shows the inferior STEMI — and STE in III > II says "check the right ventricle".', done: ['ecg12'], points: 15, target: { by: 10 } },
    { id: 'transmit', label: 'Transmit the 12-lead', why: 'The physician reads it, activates the cath lab and can stop you from giving nitroglycerin.', done: ['ecg-transmit'], roles: [1], points: 10, target: { by: 15 } },
    { id: 'als', label: 'Request a paramedic intercept', why: 'Bradycardia, hypotension and an inferior STEMI need ALS.', done: ['als'], roles: [1], points: 10, target: { by: 6 } },
    { id: 'v4r', label: 'Right-sided leads (V4R) for inferior STEMI', why: 'RV infarction complicates up to 40 % of inferior STEMIs; STE ≥ 0.5–1 mm in V4R makes the patient preload-dependent.', done: ['ecg-right'], roles: [2], points: 15 },
    { id: 'aspirin', label: 'Aspirin 162–325 mg chewed', why: 'Aspirin for every suspected ACS (her allergy is to penicillin, not aspirin).', done: ['aspirin'], points: 10, target: { by: 15 } },
    { id: 'iv', label: 'IV access', why: 'Needed for fluid and atropine.', done: ['iv', 'io'], roles: [2], points: 5 },
    { id: 'fluid', label: 'Fluid bolus for hypotension with clear lungs', why: 'RV infarction: the right heart needs filling pressure. 250–500 mL boluses, reassessing the lungs.', done: ['fluid'], after: 'hypotension', roles: [2], points: 10, applies: (s) => has(s, 'hypotension') },
    { id: 'brady', label: 'Treat the symptomatic AV block (atropine, pacing if it fails)', why: 'AV-nodal block in inferior MI is usually atropine-responsive; pace if it is not.', done: ['atropine', 'pace'], after: 'chb', roles: [2], points: 10, target: { within: { flag: 'chb', minutes: 5 } }, applies: (s) => has(s, 'chb') },
    { id: 'alert', label: 'STEMI alert from the field', why: 'Reperfusion is the definitive treatment — and the RCA occlusion is causing the block.', done: ['stemi-alert', 'ecg-transmit'], roles: [2], points: 15, target: { by: 15 } },
    { id: 'pci', label: 'Straight to the PCI-capable heart centre', why: 'Primary PCI within 90 minutes of first contact.', done: (s) => s.flags['dest-pci'] ?? null, points: 10 },
    { id: 'handoff', label: 'Hand-off at the heart centre', why: 'Report the RV involvement and the AV block so the team is ready (pacing wire, fluids).', done: ['handoff'], points: 5 },
  ],
  harms: [
    { id: 'nitro-rv', actions: ['nitro'], roles: [2], points: 15, severity: 'critical', text: 'Nitroglycerin in an inferior STEMI with RV involvement: it drops preload and the blood pressure crashed to 74/44. Check V4R (and the BP) before nitrates; RV infarction is a contraindication.' },
    { id: 'nitro-assist-rv', actions: ['nitro-assist'], roles: [1], points: 15, severity: 'critical', text: "Assisting with her nitroglycerin despite a borderline BP (102) and a slow pulse: it crashed her pressure to 74/44. With an inferior STEMI (which the physician sees on your transmitted ECG), nitrates are dangerous — check with medical control first." },
    { id: 'oxygen-normoxic', actions: ['o2-nc', 'o2-nrb'], when: (s) => s.pulse && s.vitals.spo2 >= 90, points: 3, severity: 'minor', text: 'Oxygen is for SpO₂ below 90 %.' },
    { id: 'beta-blocker', actions: ['metoprolol'], points: 10, severity: 'major', text: 'An IV beta-blocker with bradycardia and borderline blood pressure worsens both — and can push AV block to asystole.' },
    { id: 'opioid-hypotension', actions: ['fentanyl'], when: (s) => s.vitals.sbp < 90, points: 4, severity: 'minor', text: 'Opioids venodilate: avoid them while she is hypotensive with RV infarction.' },
    { id: 'nearest-ed', actions: ['transport-near'], points: 10, severity: 'major', text: 'A STEMI goes straight to a PCI-capable centre; the nearest ED has no cath lab.' },
    { id: 'cpap-hypotension', actions: ['cpap'], points: 6, severity: 'major', text: 'CPAP lowers venous return — dangerous in a hypotensive, preload-dependent patient with clear lungs.' },
  ],
  timings: [
    { label: 'First 12-lead', actions: ['ecg12'], target: 10 },
    { label: 'Right-sided leads', actions: ['ecg-right'] },
    { label: 'Aspirin', actions: ['aspirin'], target: 15 },
    { label: 'Bradycardia treated after the block began', actions: ['atropine', 'pace'], flag: 'brady-treated', target: 5, from: 'chb' },
  ],
  transportMinutes: 12,
  nearestMinutes: 6,
  arrival: 'You arrive at the heart centre; the cath lab team is waiting with a pacing wire ready.',
  teaching: [
    'Inferior STEMI: ST elevation in II, III, aVF. STE in III greater than II, with reciprocal depression in aVL, points to the RCA.',
    'Record V4R in every inferior STEMI: RV infarction occurs in up to 40 %. STE ≥ 0.5–1 mm in V4R is diagnostic.',
    'RV infarction is preload-dependent: no nitrates and no venodilating drugs. Treat hypotension with fluid boluses while the lungs stay clear.',
    'The RCA supplies the AV node in about 90 %: inferior MI can cause AV block, usually nodal with a narrow escape and often atropine-responsive. Pace if not.',
    'Women, older adults and people with diabetes often describe "indigestion", nausea or weakness rather than chest pain.',
  ],
};
