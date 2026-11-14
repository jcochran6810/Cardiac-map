/**
 * Built-in safety rules for acute coronary care: the fibrinolytics, the nitrates and nitroprusside, the antiemetic,
 * the antithrombotics in a dissection, and sedation (midazolam and procedural sedation).
 */
import { has, mapOf, paced } from '../kit';
import type { Harm } from '../types';
import { ANTITHROMBOTICS, LYTICS, NITRATES_ACS, hasProblem, longQt, lowPressure, procedureComing, tachyarrhythmia } from './helpers';

export const ACS_RULES: Harm[] = [
  // the emergency department's procedural sedation (ACEP clinical policy: monitoring and capnography)
  { id: 'sedation-unmonitored', actions: ['procedural-sedation'], when: (s) => !has(s, 'monitor'), points: 5, severity: 'major', text: 'Procedural sedation without the cardiac monitor on. Sedation can stop the breathing and drop the pressure: the ECG, pulse oximetry, the blood pressure and capnography run from before the first dose until the patient is awake again.' },
  { id: 'sedation-no-procedure', actions: ['procedural-sedation'], when: (s) => s.pulse && !procedureComing(s), points: 3, severity: 'minor', text: 'Procedural sedation with no procedure that needs it. Deep sedation is for a cardioversion, a shock or pacing in a patient who is awake; without one it only puts the airway, the breathing and the pressure at risk.' },
  { id: 'lytic-no-indication', actions: LYTICS, when: (s, sc) => sc.setting === 'ed' && !has(s, 'ecg-stemi') && !hasProblem(sc, ['pulmonary-embolism', 'aortic-dissection']), points: 15, severity: 'critical', text: 'A fibrinolytic without an indication. In the emergency department it is for a STEMI on the 12-lead when PCI cannot happen within 120 minutes of first medical contact (then within 30 minutes of arrival), or a high-risk pulmonary embolism; any other patient gets only its bleeding — intracranial in about 1 in 100.' },
  { id: 'nitro-hypotension', actions: NITRATES_ACS, when: (s) => s.pulse && lowPressure(s), points: 8, severity: 'major', text: 'Nitroglycerin with a systolic pressure under 90 mmHg (with an LVAD, a Doppler MAP under 60). Nitrates drop the pressure further: hold them until it is back up.' },
  { id: 'nitroprusside-hypotension', actions: ['ic-nitroprusside'], when: (s) => s.pulse && lowPressure(s), points: 8, severity: 'major', text: 'Intracoronary nitroprusside with a systolic pressure under 90 mmHg. It drops the pressure further, and a low perfusion pressure makes no-reflow worse: support the pressure first, or use intracoronary epinephrine.' },
  { id: 'ondansetron-long-qt', actions: ['ondansetron'], when: (s, sc) => longQt(s, sc), points: 5, severity: 'major', text: 'Ondansetron with a long QT. It lengthens the QT further, more with each dose, and can set off torsades de pointes: avoid it with a long QT or torsades.' },
  // with an LVAD a Doppler MAP over 90 is the high pressure, 60 the low one
  { id: 'nitro-high-not-hypertensive', actions: ['nitro-high', 'nitro-iv'], when: (s) => s.pulse && !lowPressure(s) && (s.lvad ? mapOf(s.vitals) <= 90 : s.vitals.sbp < 160), points: 3, severity: 'minor', text: 'High-dose nitroglycerin without a high blood pressure. 0.8 mg is for hypertensive pulmonary edema with a systolic of 160 or more (with an LVAD, a Doppler MAP over 90); below that step down to 0.4 mg, and hold nitrates when the pressure is low.' },
  // sedation before a cardioversion or for the pacer is needed even with a low pressure (a smaller dose, titrated): a case
  // with its own sedation rule says so in its own words
  // in the emergency department a drowsy patient with an advanced airway (RSI, or a tube after the arrest) is a ventilated
  // one, sedated for the tube on the physician's decision: no mistake there. The field and the lab score it as before
  { id: 'midazolam-unsafe', actions: ['midazolam'], when: (s, sc) => s.pulse && (lowPressure(s) || (s.vitals.gcs <= 12 && !(sc.setting === 'ed' && has(s, 'airway')))) && !tachyarrhythmia(s) && !(s.rhythm.hr < 50 || paced(s)), points: 5, severity: 'major', text: 'Midazolam with a low pressure or a drowsy patient, and no cardioversion or pacing to sedate for. A benzodiazepine drops the pressure and the breathing further: it is for agitation, seizures or stimulant toxicity in a patient who can take it — here support the pressure and the airway instead.' },
  { id: 'antithrombotic-dissection', actions: ANTITHROMBOTICS, when: (_s, sc) => hasProblem(sc, ['aortic-dissection']), points: 8, severity: 'major', text: 'An antiplatelet or anticoagulant in an aortic dissection. It makes the torn aorta bleed — into the chest, the pericardium or the abdomen — and complicates the surgery the patient needs. Tearing pain to the back, a pressure difference between the arms or a new murmur: think dissection before giving antithrombotics.' },
  { id: 'lytic-dissection', actions: LYTICS, when: (_s, sc) => hasProblem(sc, ['aortic-dissection']), points: 15, severity: 'critical', text: 'A fibrinolytic in an aortic dissection. It can turn the tear into a fatal hemorrhage: a dissection that blocks a coronary ostium can mimic a STEMI — think of it before any lytic.' },
];
