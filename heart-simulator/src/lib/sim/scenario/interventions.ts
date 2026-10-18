/**
 * Every intervention the simulator offers, tagged with the roles whose scope of practice includes it
 * (see lib/scope.ts): 1 EMT · 2 Paramedic · 3 Cath lab tech · 4 Cath lab RN · 5 Cardiologist.
 * The learner always sees ALL the interventions in their scope, right or wrong for this patient.
 */
import type { LearningLevel } from '@/store/useAppStore';
import type { Category, Intervention, Setting } from './types';

const ALL: LearningLevel[] = [1, 2, 3, 4, 5];
const ALS_RN_MD: LearningLevel[] = [2, 4, 5];
const MANUAL: LearningLevel[] = [2, 3, 4, 5];
const FIELD: Setting[] = ['field'];
const LAB: Setting[] = ['cathlab'];

export const CATEGORY_LABELS: Record<Category, string> = {
  assess: 'Assessment',
  monitor: 'Monitoring & ECG',
  airway: 'Airway & breathing',
  access: 'IV access & fluids',
  meds: 'Medications',
  resus: 'Resuscitation & electrical',
  procedure: 'Procedures',
  team: 'Team, calls & transport',
};

export const CATEGORY_ORDER: Category[] = ['assess', 'monitor', 'airway', 'access', 'meds', 'resus', 'procedure', 'team'];

export const INTERVENTIONS: Intervention[] = [
  // Assessment
  { id: 'scene', label: 'Scene safety and PPE', category: 'assess', roles: [1, 2], settings: FIELD, minutes: 0.5 },
  { id: 'primary', label: 'Primary survey: airway, breathing, circulation', category: 'assess', roles: ALL, minutes: 1 },
  { id: 'opqrst', label: 'Ask about the pain (OPQRST)', category: 'assess', roles: ALL, minutes: 1 },
  { id: 'sample', label: 'SAMPLE history: allergies, medicines, past history', category: 'assess', roles: ALL, minutes: 1 },
  { id: 'ask-pde5', label: 'Ask about erectile-dysfunction drugs (sildenafil, tadalafil)', category: 'assess', roles: ALL, minutes: 0.25 },
  { id: 'vitals', label: 'Manual vital signs: BP, pulse, breathing, SpO₂', category: 'assess', roles: ALL, minutes: 1, repeatable: true },
  { id: 'pulse-check', label: 'Check for a pulse (no more than 10 s)', category: 'assess', roles: ALL, minutes: 0.2, repeatable: true },
  { id: 'lungs', label: 'Listen to the lungs', category: 'assess', roles: ALL, minutes: 0.5, repeatable: true },
  { id: 'perfusion', label: 'Skin signs, neck veins (JVD) and peripheral pulses', category: 'assess', roles: ALL, minutes: 0.5 },
  { id: 'glucose', label: 'Blood glucose', category: 'assess', roles: [1, 2, 4, 5], minutes: 0.5 },
  { id: 'neuro', label: 'Neuro check: GCS and stroke screen', category: 'assess', roles: ALL, minutes: 0.5 },
  { id: 'reassess', label: 'Reassess the patient (2 min)', category: 'assess', roles: ALL, minutes: 2, repeatable: true },

  // Monitoring & ECG
  { id: 'monitor', label: 'Attach the cardiac monitor and pulse oximeter', category: 'monitor', roles: ALL, minutes: 1 },
  { id: 'pads', label: 'Apply defibrillation pads', category: 'monitor', roles: ALL, minutes: 0.5 },
  { id: 'nibp', label: 'Blood pressure on the monitor (NIBP)', category: 'monitor', roles: ALL, minutes: 0.5, repeatable: true },
  { id: 'ecg12', label: 'Acquire a 12-lead ECG', category: 'monitor', roles: ALL, minutes: 2 },
  { id: 'ecg12-repeat', label: 'Repeat the 12-lead ECG', category: 'monitor', roles: ALL, minutes: 1.5, repeatable: true },
  { id: 'ecg-transmit', label: 'Transmit the 12-lead to the hospital', category: 'monitor', roles: [1, 2], settings: FIELD, minutes: 0.5 },
  { id: 'ecg-right', label: 'Right-sided leads (V4R)', category: 'monitor', roles: MANUAL, minutes: 1 },
  { id: 'ecg-posterior', label: 'Posterior leads (V7–V9)', category: 'monitor', roles: MANUAL, minutes: 1 },
  { id: 'capno', label: 'Waveform capnography (EtCO₂)', category: 'monitor', roles: MANUAL, minutes: 0.5 },
  { id: 'transducer', label: 'Zero and level the pressure transducers', category: 'monitor', roles: [3, 4], settings: LAB, minutes: 0.5 },
  { id: 'labs', label: 'Draw labs: troponin, electrolytes, CBC, coagulation', category: 'monitor', roles: [4, 5], settings: LAB, minutes: 0.5 },
  { id: 'act', label: 'Check the ACT (activated clotting time)', category: 'monitor', roles: [3, 4, 5], settings: LAB, minutes: 1, repeatable: true },
  { id: 'echo', label: 'Bedside echocardiogram', category: 'monitor', roles: [5], settings: LAB, minutes: 3 },

  // Airway & breathing
  { id: 'o2-nc', label: 'Oxygen by nasal cannula', category: 'airway', roles: ALL, minutes: 0.5, detail: '2–4 L/min' },
  { id: 'o2-nrb', label: 'Oxygen by non-rebreather mask', category: 'airway', roles: ALL, minutes: 0.5, detail: '15 L/min' },
  { id: 'bvm', label: 'Bag-valve-mask ventilation', category: 'airway', roles: ALL, minutes: 0.5, repeatable: true },
  { id: 'cpap', label: 'CPAP', category: 'airway', roles: [1, 2], settings: FIELD, minutes: 1 },
  { id: 'airway', label: 'Advanced airway (supraglottic or intubation)', category: 'airway', roles: [2, 5], minutes: 3 },

  // IV access & fluids
  { id: 'iv', label: 'IV access', category: 'access', roles: ALS_RN_MD, minutes: 2 },
  { id: 'io', label: 'IO access', category: 'access', roles: ALS_RN_MD, minutes: 1.5 },
  { id: 'fluid', label: 'Normal saline bolus', category: 'access', roles: ALS_RN_MD, minutes: 1, detail: '250–500 mL, reassess', repeatable: true, maxTimes: 4, needsAccess: true },

  // Medications
  { id: 'aspirin', label: 'Aspirin, chewed', category: 'meds', roles: [1, 2, 4, 5], minutes: 0.5, detail: '324 mg (162–325 mg) non-enteric-coated' },
  { id: 'nitro-assist', label: "Help the patient take their own nitroglycerin", category: 'meds', roles: [1], settings: FIELD, minutes: 0.5, detail: 'per protocol / medical direction' },
  { id: 'nitro', label: 'Nitroglycerin sublingual', category: 'meds', roles: ALS_RN_MD, minutes: 0.5, detail: '0.4 mg, every 5 min, max 3', repeatable: true, maxTimes: 3 },
  { id: 'fentanyl', label: 'Fentanyl IV', category: 'meds', roles: ALS_RN_MD, minutes: 0.5, detail: '25–50 mcg (0.5–1 mcg/kg)', repeatable: true, maxTimes: 3, needsAccess: true },
  { id: 'heparin', label: 'Unfractionated heparin IV bolus', category: 'meds', roles: [4, 5], settings: LAB, minutes: 0.5, detail: '70–100 U/kg for primary PCI', needsAccess: true },
  { id: 'p2y12', label: 'P2Y12 loading dose', category: 'meds', roles: [4, 5], settings: LAB, minutes: 0.5, detail: 'ticagrelor 180 mg (or prasugrel 60 mg)' },
  { id: 'metoprolol', label: 'Metoprolol IV', category: 'meds', roles: ALS_RN_MD, minutes: 0.5, detail: '5 mg', needsAccess: true },
  { id: 'atropine', label: 'Atropine IV', category: 'meds', roles: ALS_RN_MD, minutes: 0.5, detail: '1 mg, every 3–5 min, max 3 mg', repeatable: true, maxTimes: 3, needsAccess: true },
  { id: 'adenosine6', label: 'Adenosine 6 mg rapid IV push', category: 'meds', roles: ALS_RN_MD, minutes: 0.5, detail: 'with a 20 mL flush', needsAccess: true },
  { id: 'adenosine12', label: 'Adenosine 12 mg rapid IV push', category: 'meds', roles: ALS_RN_MD, minutes: 0.5, detail: 'with a 20 mL flush', repeatable: true, maxTimes: 2, needsAccess: true },
  { id: 'diltiazem', label: 'Diltiazem IV', category: 'meds', roles: ALS_RN_MD, minutes: 0.5, detail: '0.25 mg/kg over 2 min', needsAccess: true },
  { id: 'epinephrine', label: 'Epinephrine 1 mg IV/IO (cardiac arrest)', category: 'meds', roles: ALS_RN_MD, minutes: 0.5, detail: 'every 3–5 min', repeatable: true, needsAccess: true },
  { id: 'amio-arrest', label: 'Amiodarone IV/IO push (cardiac arrest)', category: 'meds', roles: ALS_RN_MD, minutes: 0.5, detail: '300 mg, then 150 mg', repeatable: true, maxTimes: 2, needsAccess: true },
  { id: 'amio-infusion', label: 'Amiodarone 150 mg IV over 10 min', category: 'meds', roles: ALS_RN_MD, minutes: 1, detail: 'tachycardia with a pulse', needsAccess: true },
  { id: 'lidocaine', label: 'Lidocaine IV/IO', category: 'meds', roles: ALS_RN_MD, minutes: 0.5, detail: '1–1.5 mg/kg', needsAccess: true },
  { id: 'push-epi', label: 'Push-dose epinephrine', category: 'meds', roles: ALS_RN_MD, minutes: 0.5, detail: '10–20 mcg IV, repeat as needed', repeatable: true, needsAccess: true },
  { id: 'pressor', label: 'Vasopressor infusion', category: 'meds', roles: ALS_RN_MD, minutes: 1, detail: 'epinephrine 2–10 mcg/min or dopamine 5–20 mcg/kg/min', needsAccess: true },
  { id: 'sedation', label: 'Sedation / analgesia for the procedure', category: 'meds', roles: ALS_RN_MD, minutes: 1, detail: 'per protocol or order, with monitoring', needsAccess: true },
  { id: 'tnk', label: 'Fibrinolytic: tenecteplase IV', category: 'meds', roles: [5], minutes: 0.5, detail: 'weight-based', needsAccess: true },

  // Resuscitation & electrical
  { id: 'cpr', label: 'High-quality CPR (2-minute cycle)', category: 'resus', roles: ALL, minutes: 2, repeatable: true },
  { id: 'aed', label: 'AED: analyse and shock if advised', category: 'resus', roles: ALL, minutes: 0.5, repeatable: true },
  { id: 'defib', label: 'Defibrillate, unsynchronised', category: 'resus', roles: MANUAL, minutes: 0.3, detail: '200 J biphasic', repeatable: true },
  { id: 'cardiovert', label: 'Synchronised cardioversion', category: 'resus', roles: MANUAL, minutes: 0.5, detail: '100 J biphasic', repeatable: true },
  { id: 'pace', label: 'Transcutaneous pacing', category: 'resus', roles: MANUAL, minutes: 1, detail: 'rate 70, raise mA until capture' },
  { id: 'vagal', label: 'Vagal manoeuvre (modified Valsalva)', category: 'resus', roles: [1, 2, 4, 5], minutes: 0.5 },
  { id: 'hs-ts', label: 'Look for reversible causes (Hs and Ts)', category: 'resus', roles: ALS_RN_MD, minutes: 0.5 },

  // Procedures (cath lab)
  { id: 'timeout', label: 'Procedural time-out', category: 'procedure', roles: [3, 4, 5], settings: LAB, minutes: 1 },
  { id: 'consent', label: 'Confirm consent, contrast allergy and anticoagulants', category: 'procedure', roles: [4, 5], settings: LAB, minutes: 1 },
  { id: 'prep', label: 'Prep and drape the radial and femoral sites', category: 'procedure', roles: [3, 4], settings: LAB, minutes: 2 },
  { id: 'access', label: 'Arterial access (radial first)', category: 'procedure', roles: [5], settings: LAB, minutes: 2 },
  { id: 'angio', label: 'Coronary angiography', category: 'procedure', roles: [5], settings: LAB, minutes: 4 },
  { id: 'reposition', label: 'Disengage and reposition the catheter', category: 'procedure', roles: [5], settings: LAB, minutes: 0.3 },
  { id: 'pci', label: 'PCI: wire, balloon and stent the culprit lesion', category: 'procedure', roles: [5], settings: LAB, minutes: 8 },
  { id: 'iabp', label: 'Mechanical circulatory support (IABP / Impella)', category: 'procedure', roles: [5], settings: LAB, minutes: 6 },
  { id: 'temp-wire', label: 'Temporary transvenous pacing wire', category: 'procedure', roles: [5], settings: LAB, minutes: 5 },
  { id: 'hemostasis', label: 'Access-site haemostasis (radial band)', category: 'procedure', roles: [3, 4], settings: LAB, minutes: 1 },

  // Team, calls & transport
  { id: 'call-help', label: 'Call for help / the code team', category: 'team', roles: ALL, minutes: 0.2 },
  { id: 'callout', label: 'Call it out to the operator (closed loop)', category: 'team', roles: [3, 4], settings: LAB, minutes: 0.1, repeatable: true },
  { id: 'als', label: 'Request a paramedic (ALS) intercept', category: 'team', roles: [1], settings: FIELD, minutes: 0.3 },
  { id: 'med-control', label: 'Contact online medical control', category: 'team', roles: [1, 2], settings: FIELD, minutes: 1 },
  { id: 'stemi-alert', label: 'STEMI alert: activate the cath lab from the field', category: 'team', roles: [2], settings: FIELD, minutes: 0.5 },
  { id: 'notify', label: 'Radio report to the receiving hospital', category: 'team', roles: [1, 2], settings: FIELD, minutes: 1 },
  { id: 'transport-pci', label: 'Transport to the PCI-capable heart centre', category: 'team', roles: [1, 2], settings: FIELD, minutes: 2 },
  { id: 'transport-near', label: 'Transport to the nearest emergency department', category: 'team', roles: [1, 2], settings: FIELD, minutes: 2 },
  { id: 'handoff', label: 'Hand-off report (SBAR)', category: 'team', roles: ALL, minutes: 1 },
];

export const INTERVENTION_BY_ID: Record<string, Intervention> = Object.fromEntries(INTERVENTIONS.map((i) => [i.id, i]));

/** The interventions offered to a role in a setting: everything in their scope */
export function interventionsFor(role: LearningLevel, setting: Setting): Intervention[] {
  return INTERVENTIONS.filter((i) => i.roles.includes(role) && (!i.settings || i.settings.includes(setting)));
}
