/**
 * Every intervention the simulator offers, tagged with the roles whose scope of practice includes it
 * (see lib/scope.ts): 1 EMT · 2 Paramedic · 3 Cath lab tech · 4 Cath lab RN · 5 Cardiologist · 6 ER nurse · 7 ER doctor.
 * The learner always sees ALL the interventions in their scope, right or wrong for this patient.
 *
 * Each role plays in one setting (the field: 1 and 2; the emergency department: 6 and 7; the cath lab: 3, 4 and 5), so an
 * action offered in two settings simply lists the roles of both. The emergency department follows US scope: the ER nurse
 * (state Nurse Practice Act, ENA scope and standards, facility policy and standing orders) assesses, triages, monitors,
 * records the 12-lead, starts lines, gives drugs on a provider's or a standing order (ACLS per protocol), defibrillates,
 * cardioverts and paces per ACLS and policy, and reports to the ED physician — no diagnosis, no airway beyond the
 * bag-mask, no central line, pericardiocentesis or transvenous wire, and no decision on a fibrinolytic, a consult or where
 * the patient goes. The ER doctor (ACEP / ABEM, hospital privileges) does all of that and diagnoses, intubates, places
 * central lines, sedates for procedures, paces transvenously, drains the pericardium, decides on a fibrinolytic, activates
 * the cath lab, consults cardiology and admits or transfers.
 */
import type { LearningLevel } from '@/store/useAppStore';
import type { Category, Intervention, Setting } from './types';
import { CINE_VIEW_BY_ID, angleText } from '@/lib/cathlab/views';

const ALL: LearningLevel[] = [1, 2, 3, 4, 5, 6, 7];
/** ALS drugs and IV/IO access: the paramedic, the cath lab nurse and cardiologist, the ER nurse and ER doctor */
const ALS_RN_MD: LearningLevel[] = [2, 4, 5, 6, 7];
/** a manual defibrillator: shocks, cardioversion, pacing, extra leads and capnography (the EMT has the AED) */
const MANUAL: LearningLevel[] = [2, 3, 4, 5, 6, 7];
/** cath lab: the tech positions the C-arm, runs the consoles and prepares and hands the devices; the cardiologist operates */
const TECH_MD: LearningLevel[] = [3, 5];
const LAB_TEAM: LearningLevel[] = [3, 4, 5];
const RN_MD: LearningLevel[] = [4, 5];
/** in hospital: the nurse gives it on a provider's or a standing order, the physician orders it (cath lab and ED) */
const HOSPITAL_RN_MD: LearningLevel[] = [4, 5, 6, 7];
/** the cath lab's tech and cardiologist, and the ER doctor: a procedure the ER doctor does at the bedside too */
const TECH_MD_ED: LearningLevel[] = [3, 5, 7];
const ED_RN: LearningLevel[] = [6];
const ED_MD: LearningLevel[] = [7];
const ED_TEAM: LearningLevel[] = [6, 7];
const FIELD: Setting[] = ['field'];
const LAB: Setting[] = ['cathlab'];
const ED: Setting[] = ['ed'];
const FIELD_ED: Setting[] = ['field', 'ed'];
const LAB_ED: Setting[] = ['cathlab', 'ed'];
const angles = (id: string) => angleText(CINE_VIEW_BY_ID[id]);

export const CATEGORY_LABELS: Record<Category, string> = {
  assess: 'Assessment',
  monitor: 'Monitoring, ECG & pressures',
  imaging: 'Angiography & imaging',
  airway: 'Airway & breathing',
  access: 'IV access & fluids',
  meds: 'Medications',
  devices: 'Catheters, wires & devices',
  resus: 'Resuscitation & electrical',
  procedure: 'Procedures',
  team: 'Team, calls & transport',
};

export const CATEGORY_ORDER: Category[] = ['assess', 'monitor', 'imaging', 'airway', 'access', 'meds', 'devices', 'resus', 'procedure', 'team'];

/**
 * In the emergency department the imaging is X-ray, CT and ultrasound, the only device is the transvenous pacing wire, and
 * the team calls are consults and where the patient goes
 */
const ED_CATEGORY_LABELS: Partial<Record<Category, string>> = {
  imaging: 'X-ray, CT & ultrasound',
  devices: 'Transvenous pacing',
  team: 'Team, consults & disposition',
};

/** A category's name as the action menu shows it in this setting */
export function categoryLabel(category: Category, setting: Setting): string {
  return (setting === 'ed' ? ED_CATEGORY_LABELS[category] : undefined) ?? CATEGORY_LABELS[category];
}

export const INTERVENTIONS: Intervention[] = [
  // Assessment
  { id: 'scene', label: 'Scene safety and PPE', category: 'assess', roles: [1, 2], settings: FIELD, minutes: 0.5 },
  // emergency department: the patient arrives — the crew's report, then triage (the nurse's: ESI)
  { id: 'ems-handoff', label: 'Take the EMS hand-off report', category: 'assess', roles: ED_TEAM, settings: ED, minutes: 1, detail: 'at the bedside, everyone listening: what happened, what they found, what they gave and how the patient responded' },
  { id: 'triage', label: 'Triage: Emergency Severity Index (ESI) level', category: 'assess', roles: ED_RN, settings: ED, minutes: 1, detail: 'ESI 1 needs a life-saving intervention now; chest pain that could be ACS is at least ESI 2, with a 12-lead within 10 minutes of arrival' },
  { id: 'primary', label: 'Primary survey: airway, breathing, circulation', category: 'assess', roles: ALL, minutes: 1 },
  { id: 'opqrst', label: 'Ask about the pain (OPQRST)', category: 'assess', roles: ALL, minutes: 1 },
  { id: 'sample', label: 'SAMPLE history: allergies, medicines, past history', category: 'assess', roles: ALL, minutes: 1 },
  { id: 'ask-pde5', label: 'Ask about erectile-dysfunction drugs (sildenafil, vardenafil, tadalafil, avanafil)', category: 'assess', roles: ALL, minutes: 0.25 },
  { id: 'vitals', label: 'Manual vital signs: BP, pulse, breathing, SpO₂', category: 'assess', roles: ALL, minutes: 1, repeatable: true },
  { id: 'pulse-check', label: 'Check for a pulse (no more than 10 s)', category: 'assess', roles: ALL, minutes: 0.2, repeatable: true },
  { id: 'bp-both-arms', label: 'Blood pressure in both arms', category: 'assess', roles: ALL, minutes: 1, repeatable: true, detail: 'manual cuff on the right arm, then the left; compare the two' },
  // a patient on a continuous-flow LVAD has no pulse to feel and no cuff pressure: the Doppler finds the flow
  { id: 'doppler-map', label: 'Doppler MAP (manual cuff and a Doppler probe)', category: 'assess', roles: [1, 2, 6, 7], settings: FIELD_ED, minutes: 1, repeatable: true, detail: 'Doppler probe over the brachial artery; deflate the cuff slowly: the pressure at which flow returns is the MAP with an LVAD (the systolic with a pulse)' },
  { id: 'lvad-check', label: 'LVAD check: pump hum, controller display and alarms, power and driveline', category: 'assess', roles: [1, 2, 6, 7], settings: FIELD_ED, minutes: 1, repeatable: true, detail: 'listen over the left chest; read the controller (flow, speed, power, alarms); both power sources connected; driveline intact' },
  { id: 'lungs', label: 'Listen to the lungs', category: 'assess', roles: ALL, minutes: 0.5, repeatable: true },
  { id: 'perfusion', label: 'Skin signs, neck veins (JVD) and peripheral pulses', category: 'assess', roles: ALL, minutes: 0.5 },
  // repeatable: a glucose is rechecked after dextrose, oral glucose or glucagon
  { id: 'glucose', label: 'Blood glucose', category: 'assess', roles: [1, 2, 4, 5, 6, 7], minutes: 0.5, repeatable: true },
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
  { id: 'labs', label: 'Draw labs: troponin, electrolytes, CBC, coagulation', category: 'monitor', roles: HOSPITAL_RN_MD, settings: LAB_ED, minutes: 0.5 },
  // the chest pain pathway's serial high-sensitivity troponin (2021 AHA/ACC chest pain guideline: at 0 and 1–3 h), part of
  // the chest pain order set the nurse draws on
  { id: 'troponin-repeat', label: 'Repeat high-sensitivity troponin', category: 'monitor', roles: ED_TEAM, settings: ED, minutes: 0.5, repeatable: true, maxTimes: 2, detail: '1–3 hours after the first: the change between the two decides as much as either value' },
  { id: 'act', label: 'Check the ACT (activated clotting time)', category: 'monitor', roles: [3, 4, 5], settings: LAB, minutes: 1, repeatable: true },
  { id: 'echo', label: 'Bedside echocardiogram', category: 'monitor', roles: [5], settings: LAB, minutes: 3 },
  { id: 'lvedp', label: 'Measure LVEDP (pigtail in the left ventricle)', category: 'monitor', roles: TECH_MD, settings: LAB, minutes: 1 },
  { id: 'rhc', label: 'Right heart run: RA, RV, PA, PCWP and cardiac output', category: 'monitor', roles: TECH_MD, settings: LAB, minutes: 5 },

  // Angiography & imaging (cath lab): the tech positions the C-arm and runs the consoles; the cardiologist injects
  { id: 'view-rao-caudal', label: 'RAO caudal view — left system', category: 'imaging', roles: TECH_MD, settings: LAB, minutes: 0.5, repeatable: true, detail: angles('view-rao-caudal') },
  { id: 'view-rao-cranial', label: 'RAO cranial view — left system', category: 'imaging', roles: TECH_MD, settings: LAB, minutes: 0.5, repeatable: true, detail: angles('view-rao-cranial') },
  { id: 'view-ap-cranial', label: 'AP cranial view — left system', category: 'imaging', roles: TECH_MD, settings: LAB, minutes: 0.5, repeatable: true, detail: angles('view-ap-cranial') },
  { id: 'view-lao-cranial', label: 'LAO cranial view — left system', category: 'imaging', roles: TECH_MD, settings: LAB, minutes: 0.5, repeatable: true, detail: angles('view-lao-cranial') },
  { id: 'view-lao-caudal', label: 'LAO caudal ("spider") view — left system', category: 'imaging', roles: TECH_MD, settings: LAB, minutes: 0.5, repeatable: true, detail: angles('view-lao-caudal') },
  { id: 'view-rca-lao', label: 'LAO view of the right coronary', category: 'imaging', roles: TECH_MD, settings: LAB, minutes: 0.5, repeatable: true, detail: angles('view-rca-lao') },
  { id: 'view-rca-rao', label: 'RAO view of the right coronary', category: 'imaging', roles: TECH_MD, settings: LAB, minutes: 0.5, repeatable: true, detail: angles('view-rca-rao') },
  { id: 'view-rca-cranial', label: 'AP cranial view of the right coronary (crux, PDA)', category: 'imaging', roles: TECH_MD, settings: LAB, minutes: 0.5, repeatable: true, detail: angles('view-rca-cranial') },
  { id: 'lv-gram', label: 'Left ventriculogram (pigtail, power injector)', category: 'imaging', roles: TECH_MD, settings: LAB, minutes: 1, detail: `${angles('lv-gram')}, 30–36 mL at 10–15 mL/s` },
  { id: 'ffr-equalize', label: 'Equalize the pressure wire at the guide tip', category: 'imaging', roles: TECH_MD, settings: LAB, minutes: 0.5, repeatable: true },
  { id: 'ffr', label: 'FFR measurement (pressure wire, hyperemia)', category: 'imaging', roles: TECH_MD, settings: LAB, minutes: 3, repeatable: true },
  { id: 'ivus', label: 'IVUS run', category: 'imaging', roles: TECH_MD, settings: LAB, minutes: 2, repeatable: true },
  { id: 'oct', label: 'OCT run (contrast flush)', category: 'imaging', roles: TECH_MD, settings: LAB, minutes: 2, repeatable: true },
  { id: 'final-angio', label: 'Final angiogram in two views', category: 'imaging', roles: TECH_MD, settings: LAB, minutes: 1 },
  { id: 'stop-contrast', label: 'Stop all contrast injections', category: 'imaging', roles: LAB_TEAM, settings: LAB, minutes: 0.1 },
  // the cath lab nurse and cardiologist send a patient from the table; in the ED the physician orders it (CT angiography of
  // the chest for a dissection or a pulmonary embolism)
  { id: 'ct-urgent', label: 'Urgent CT scan', category: 'imaging', roles: [4, 5, 7], settings: LAB_ED, minutes: 10, detail: 'head CT for a stroke (CT angiography if a clot could be pulled), abdomen and pelvis for a retroperitoneal bleed, chest CT angiography for a dissection — once the patient is stable enough to leave the lab', detailBySetting: { ed: 'chest CT angiography for a dissection or a pulmonary embolism, head CT for a stroke (CT angiography if a clot could be pulled), abdomen and pelvis for a bleed — once the patient is stable enough to leave the department' } },
  // emergency department imaging: a portable film (the nurse on the chest pain standing order, or the physician's order)
  // and the physician's own bedside ultrasound
  { id: 'cxr', label: 'Portable chest X-ray', category: 'imaging', roles: ED_TEAM, settings: ED, minutes: 3, detail: 'at the bedside: heart size, the lungs (edema, a pneumothorax), the mediastinum, and where the lines and tubes sit' },
  { id: 'pocus', label: 'Point-of-care ultrasound: heart, lungs, IVC and aorta', category: 'imaging', roles: ED_MD, settings: ED, minutes: 3, repeatable: true, maxTimes: 3, detail: 'the physician\'s bedside scan: pericardial effusion, how the ventricles squeeze, a large RV, B-lines, the IVC and the aortic root' },

  // Airway & breathing
  { id: 'o2-nc', label: 'Oxygen by nasal cannula', category: 'airway', roles: ALL, minutes: 0.5, detail: '2–4 L/min' },
  { id: 'o2-nrb', label: 'Oxygen by non-rebreather mask', category: 'airway', roles: ALL, minutes: 0.5, detail: '15 L/min' },
  { id: 'bvm', label: 'Bag-valve-mask ventilation', category: 'airway', roles: ALL, minutes: 0.5, repeatable: true },
  { id: 'cpap', label: 'CPAP', category: 'airway', roles: [1, 2, 6, 7], settings: FIELD_ED, minutes: 1 },
  { id: 'airway', label: 'Advanced airway (supraglottic or intubation)', category: 'airway', roles: [2, 5, 7], minutes: 3 },
  // the ER doctor intubates a patient with a pulse who still breathes and guards the airway: induction drug and paralytic
  { id: 'rsi', label: 'Rapid sequence intubation', category: 'airway', roles: ED_MD, settings: ED, minutes: 5, needsAccess: true, detail: 'preoxygenate; etomidate 0.3 mg/kg (or ketamine 1–2 mg/kg) and rocuronium 1 mg/kg; tube confirmed with waveform capnography — resuscitate a low pressure first' },

  // IV access & fluids
  { id: 'iv', label: 'IV access', category: 'access', roles: ALS_RN_MD, minutes: 2 },
  { id: 'io', label: 'IO access', category: 'access', roles: ALS_RN_MD, minutes: 1.5 },
  { id: 'fluid', label: 'Normal saline bolus', category: 'access', roles: ALS_RN_MD, minutes: 1, detail: '250–500 mL, reassess', repeatable: true, maxTimes: 4, needsAccess: true },
  // also IV access for drugs (and the route a transvenous pacing wire takes)
  { id: 'central-line', label: 'Central venous line (ultrasound-guided)', category: 'access', roles: ED_MD, settings: ED, minutes: 8, detail: 'internal jugular or femoral vein, full sterile barrier: an introducer sheath (6 Fr, with a side port for drugs), which a pacing wire can follow — for pressors, a transvenous wire or no peripheral access' },
  { id: 'transfuse', label: 'Transfuse packed red cells', category: 'access', roles: HOSPITAL_RN_MD, settings: LAB_ED, minutes: 2, detail: '1 unit after the bedside check, through a warmer; for massive bleeding, the massive transfusion protocol', repeatable: true, maxTimes: 4, needsAccess: true },

  // Medications
  { id: 'aspirin', label: 'Aspirin, chewed', category: 'meds', roles: [1, 2, 4, 5, 6, 7], minutes: 0.5, detail: '324 mg (162–325 mg) non-enteric-coated' },
  { id: 'nitro-assist', label: "Help the patient take their own nitroglycerin", category: 'meds', roles: [1], settings: FIELD, minutes: 0.5, detail: 'per protocol / medical direction' },
  { id: 'nitro', label: 'Nitroglycerin sublingual', category: 'meds', roles: ALS_RN_MD, minutes: 0.5, detail: '0.4 mg, every 5 min, max 3', repeatable: true, maxTimes: 3 },
  // hypertensive acute pulmonary edema (SCAPE): the sublingual high dose most US EMS protocols carry (IV infusions are not
  // carried by most services), with CPAP
  { id: 'nitro-high', label: 'Nitroglycerin 0.8 mg sublingual (high dose, pulmonary edema)', category: 'meds', roles: ALS_RN_MD, minutes: 0.5, detail: 'two 0.4 mg tablets or sprays every 5 min while the systolic stays 160 or more (1.2 mg over 200 in some protocols), with CPAP; step down to 0.4 mg below 160', repeatable: true, maxTimes: 3 },
  { id: 'fentanyl', label: 'Fentanyl IV', category: 'meds', roles: ALS_RN_MD, minutes: 0.5, detail: '25–50 mcg (0.5–1 mcg/kg)', repeatable: true, maxTimes: 3, needsAccess: true },
  // the dose depends on where it is given: the lab the PCI dose, the ED the ACS (or fibrinolytic) bolus and infusion
  { id: 'heparin', label: 'Unfractionated heparin IV bolus', category: 'meds', roles: HOSPITAL_RN_MD, settings: LAB_ED, minutes: 0.5, detail: '70–100 U/kg for primary PCI', detailBySetting: { ed: 'weight-based: 60 U/kg (max 4,000 U), then 12 U/kg/h (max 1,000 U/h); the cath lab tops it up for PCI' }, needsAccess: true },
  { id: 'p2y12', label: 'P2Y12 loading dose', category: 'meds', roles: HOSPITAL_RN_MD, settings: LAB_ED, minutes: 0.5, detail: 'ticagrelor 180 mg (or prasugrel 60 mg)', detailBySetting: { ed: 'by mouth: ticagrelor 180 mg (prasugrel 60 mg only once the anatomy is known); with a fibrinolytic, clopidogrel 300 mg (75 mg over age 75)' } },
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
  { id: 'pressor', label: 'Vasopressor infusion', category: 'meds', roles: ALS_RN_MD, minutes: 1, detail: 'norepinephrine, epinephrine or dopamine, titrated to MAP ≥ 65', needsAccess: true },
  // the ER nurse gives midazolam and fentanyl on the physician's order; the ER doctor's procedural sedation is its own action
  { id: 'sedation', label: 'Sedation / analgesia for the procedure', category: 'meds', roles: [2, 4, 5], minutes: 1, detail: 'per protocol or order, with monitoring', needsAccess: true },
  // IM or intranasal without a line, so it needs no IV
  { id: 'midazolam', label: 'Midazolam (benzodiazepine) for agitation or stimulant toxicity', category: 'meds', roles: ALS_RN_MD, minutes: 0.5, detail: 'agitation or a stimulant: 2.5–5 mg IV, or 5 mg IM or intranasal without a line, repeated to calm; procedural sedation (before a shock, the pacer or a bedside procedure): 0.5–1 mg IV at a time, titrated; watch the breathing and the pressure', repeatable: true, maxTimes: 3 },
  { id: 'phenylephrine', label: 'Phenylephrine IV bolus', category: 'meds', roles: RN_MD, settings: LAB, minutes: 0.3, detail: '50–100 mcg, every 1–2 min as needed: a pure vasoconstrictor, it can slow the heart', repeatable: true, needsAccess: true },
  // ACEP / ACC: the physician decides on the fibrinolytic (a STEMI that cannot reach PCI in time)
  { id: 'tnk', label: 'Fibrinolytic: tenecteplase IV', category: 'meds', roles: [5, 7], minutes: 0.5, detail: 'weight-based', needsAccess: true },
  // ACEP procedural sedation: the physician sedates, with continuous monitoring and capnography, for a cardioversion or the pacer
  { id: 'procedural-sedation', label: 'Procedural sedation (etomidate or propofol)', category: 'meds', roles: ED_MD, settings: ED, minutes: 1, needsAccess: true, detail: 'etomidate 0.1–0.15 mg/kg or propofol 0.5–1 mg/kg IV, titrated (smaller doses with a low pressure); monitor, capnography, suction and airway equipment ready' },
  { id: 'epi-im', label: 'Epinephrine IM for anaphylaxis', category: 'meds', roles: [1, 2, 4, 5, 6, 7], minutes: 0.3, detail: '0.3–0.5 mg (1 mg/mL), lateral thigh' },
  // two actions, not one with a dose to pick: the hyperkalemia dose is 4–8 times the wheezing dose, and choosing it is the point
  { id: 'albuterol', label: 'Albuterol (salbutamol) 2.5–5 mg nebulized (bronchospasm)', category: 'meds', roles: [2, 4, 5, 6, 7], minutes: 1, detail: 'for wheezing; repeat per protocol' },
  { id: 'albuterol-hyperk', label: 'Albuterol 10–20 mg nebulized (hyperkalemia)', category: 'meds', roles: ALS_RN_MD, minutes: 1, detail: '4–8 times the asthma dose, over about 10 min; not in cardiac arrest' },
  { id: 'diphenhydramine', label: 'Diphenhydramine IV', category: 'meds', roles: [2, 4, 5, 6, 7], minutes: 0.3, detail: '25–50 mg', needsAccess: true },
  { id: 'steroid', label: 'Methylprednisolone IV', category: 'meds', roles: HOSPITAL_RN_MD, settings: LAB_ED, minutes: 0.3, detail: '125 mg', needsAccess: true },
  { id: 'radial-cocktail', label: 'Radial cocktail through the sheath', category: 'meds', roles: LAB_TEAM, settings: LAB, minutes: 0.3, detail: 'verapamil 2.5 mg + nitroglycerin 200 mcg, on the operator\'s order' },
  { id: 'ic-nitro', label: 'Intracoronary nitroglycerin', category: 'meds', roles: LAB_TEAM, settings: LAB, minutes: 0.2, detail: '100–200 mcg, on the operator\'s order', repeatable: true },
  { id: 'ic-adenosine', label: 'Intracoronary adenosine', category: 'meds', roles: LAB_TEAM, settings: LAB, minutes: 0.2, detail: '100–200 mcg boluses (hyperemia or no-reflow)', repeatable: true },
  { id: 'ic-verapamil', label: 'Intracoronary verapamil', category: 'meds', roles: LAB_TEAM, settings: LAB, minutes: 0.2, detail: '100–200 mcg (no-reflow)', repeatable: true },
  { id: 'adenosine-iv-ffr', label: 'IV adenosine infusion for hyperemia', category: 'meds', roles: RN_MD, settings: LAB, minutes: 0.5, detail: '140 mcg/kg/min', needsAccess: true },
  { id: 'bivalirudin', label: 'Bivalirudin bolus and infusion', category: 'meds', roles: RN_MD, settings: LAB, minutes: 0.5, detail: '0.75 mg/kg, then 1.75 mg/kg/h', needsAccess: true },
  { id: 'gp2b3a', label: 'GP IIb/IIIa inhibitor (eptifibatide)', category: 'meds', roles: RN_MD, settings: LAB, minutes: 0.5, detail: '180 mcg/kg bolus ×2, 2 mcg/kg/min', needsAccess: true },
  { id: 'cangrelor', label: 'Cangrelor (IV P2Y12 inhibitor)', category: 'meds', roles: RN_MD, settings: LAB, minutes: 0.5, detail: '30 mcg/kg bolus, 4 mcg/kg/min', needsAccess: true },
  { id: 'protamine', label: 'Protamine (reverse heparin)', category: 'meds', roles: RN_MD, settings: LAB, minutes: 1, detail: '1 mg per 100 units of heparin, slowly', needsAccess: true },
  // no-reflow: microvascular vasodilators, and epinephrine for the patient whose pressure is too low for them
  { id: 'ic-nitroprusside', label: 'Intracoronary nitroprusside', category: 'meds', roles: LAB_TEAM, settings: LAB, minutes: 0.2, detail: '50–200 mcg boluses (no-reflow), on the operator\'s order', repeatable: true },
  { id: 'ic-epinephrine', label: 'Intracoronary epinephrine', category: 'meds', roles: LAB_TEAM, settings: LAB, minutes: 0.2, detail: '50–100 mcg (no-reflow with a low pressure), on the operator\'s order', repeatable: true },

  // Electrolytes, antidotes and glucose: offered in the field and in the lab alike (oral glucose in the field only)
  { id: 'calcium-chloride', label: 'Calcium chloride 1 g IV/IO', category: 'meds', roles: ALS_RN_MD, minutes: 1, detail: '10 mL of 10 %, over 2–5 min with a pulse (a push in arrest); flush the line', repeatable: true, maxTimes: 3, needsAccess: true },
  { id: 'sodium-bicarbonate', label: 'Sodium bicarbonate 50 mEq IV/IO', category: 'meds', roles: ALS_RN_MD, minutes: 0.5, detail: '50 mL of 8.4 % (about 1 mEq/kg); flush before and after calcium', repeatable: true, maxTimes: 3, needsAccess: true },
  { id: 'insulin-dextrose', label: 'Insulin 10 units IV with dextrose 25 g', category: 'meds', roles: HOSPITAL_RN_MD, minutes: 0.5, detail: 'regular insulin push, then D50 50 mL; recheck the glucose every hour', needsAccess: true },
  { id: 'magnesium-sulfate', label: 'Magnesium sulfate 2 g IV/IO', category: 'meds', roles: ALS_RN_MD, minutes: 1, detail: 'diluted, over about 15 min with a pulse (a push in pulseless torsades)', repeatable: true, maxTimes: 2, needsAccess: true },
  { id: 'procainamide', label: 'Procainamide 20–50 mg/min IV', category: 'meds', roles: ALS_RN_MD, minutes: 1, detail: 'stop when the arrhythmia stops, at hypotension, QRS widening by 50 % or 17 mg/kg; avoid in heart failure and long QT', needsAccess: true },
  { id: 'glucagon', label: 'Glucagon 3–10 mg IV (beta- or calcium-channel-blocker overdose)', category: 'meds', roles: ALS_RN_MD, minutes: 1, detail: 'slowly over 3–5 min, then an infusion; expect vomiting', repeatable: true, maxTimes: 2, needsAccess: true },
  { id: 'oral-glucose', label: 'Oral glucose 15 g (one tube of gel)', category: 'meds', roles: [1, 2], settings: FIELD, minutes: 1, detail: 'between cheek and gum, only if awake enough to swallow', repeatable: true, maxTimes: 2 },
  { id: 'dextrose', label: 'Dextrose 25 g IV/IO (hypoglycemia)', category: 'meds', roles: ALS_RN_MD, minutes: 1, detail: 'D10 in 100 mL (10 g) steps up to 250 mL, or D50 50 mL; recheck the glucose', repeatable: true, maxTimes: 2, needsAccess: true },
  { id: 'ondansetron', label: 'Ondansetron 4 mg IV (nausea and vomiting)', category: 'meds', roles: ALS_RN_MD, minutes: 0.5, detail: 'slowly over at least 30 seconds; it lengthens the QT', needsAccess: true },

  // Resuscitation & electrical
  { id: 'cpr', label: 'High-quality CPR (2-minute cycle)', category: 'resus', roles: ALL, minutes: 2, repeatable: true },
  { id: 'aed', label: 'AED: analyze and shock if advised', category: 'resus', roles: ALL, minutes: 0.5, repeatable: true },
  { id: 'defib', label: 'Defibrillate, unsynchronized', category: 'resus', roles: MANUAL, minutes: 0.3, detail: '200 J biphasic', repeatable: true },
  { id: 'cardiovert', label: 'Synchronized cardioversion', category: 'resus', roles: MANUAL, minutes: 0.5, detail: '100 J biphasic (atrial fibrillation: 200 J or more; flutter: 200 J)', repeatable: true },
  { id: 'pace', label: 'Transcutaneous pacing', category: 'resus', roles: MANUAL, minutes: 1, detail: 'rate 70, raise mA until capture' },
  { id: 'vagal', label: 'Vagal maneuver (modified Valsalva)', category: 'resus', roles: [1, 2, 4, 5, 6, 7], minutes: 0.5 },
  { id: 'hs-ts', label: 'Look for reversible causes (Hs and Ts)', category: 'resus', roles: ALS_RN_MD, minutes: 0.5 },
  { id: 'legs-up', label: 'Lay flat and raise the legs', category: 'resus', roles: ALL, minutes: 0.3, detail: 'about 45°: blood from the legs returns to the heart for a few minutes' },

  // Procedures (cath lab; the ER doctor drains the pericardium at the bedside)
  { id: 'timeout', label: 'Procedural time-out', category: 'procedure', roles: [3, 4, 5], settings: LAB, minutes: 1 },
  { id: 'consent', label: 'Confirm consent, contrast allergy and anticoagulants', category: 'procedure', roles: [4, 5], settings: LAB, minutes: 1 },
  { id: 'prep', label: 'Prep and drape the radial and femoral sites', category: 'procedure', roles: [3, 4], settings: LAB, minutes: 2 },
  { id: 'access', label: 'Arterial access (radial first)', category: 'procedure', roles: [5], settings: LAB, minutes: 2 },
  { id: 'angio', label: 'Diagnostic coronary angiography (standard views of both coronaries)', category: 'procedure', roles: [5], settings: LAB, minutes: 4 },
  { id: 'reposition', label: 'Disengage and reposition the catheter', category: 'procedure', roles: [5], settings: LAB, minutes: 0.3 },
  { id: 'access-femoral', label: 'Femoral arterial access (ultrasound-guided)', category: 'procedure', roles: [5], settings: LAB, minutes: 2 },
  { id: 'access-venous', label: 'Femoral venous access', category: 'procedure', roles: [5], settings: LAB, minutes: 2 },
  { id: 'balloon-tamponade', label: 'Inflate a balloon over the perforation', category: 'procedure', roles: [5], settings: LAB, minutes: 1, detail: 'low pressure, 5–10 minutes' },
  { id: 'pericardiocentesis', label: 'Pericardiocentesis (echo-guided)', category: 'procedure', roles: TECH_MD_ED, settings: LAB_ED, minutes: 3 },
  { id: 'closure-device', label: 'Femoral closure device', category: 'procedure', roles: [5], settings: LAB, minutes: 1 },
  // the cardiologist aspirates and flushes; the tech holds the syringe tip-down, back-bleeds the guide and keeps the line free of air
  { id: 'clear-air', label: 'Clear coronary air: aspirate back through the guide, then a forceful saline flush', category: 'procedure', roles: TECH_MD, settings: LAB, minutes: 0.5, repeatable: true, maxTimes: 3, detail: 'with 100 % oxygen; repeat until the bubbles are gone and flow is back' },

  // Catheters, wires & devices: the tech opens, prepares and hands them; the cardiologist uses them
  { id: 'cath-tiger', label: 'Tiger (TIG) diagnostic catheter — both coronaries from the radial', category: 'devices', roles: TECH_MD, settings: LAB, minutes: 0.5 },
  { id: 'cath-jl4', label: 'JL4 diagnostic catheter — left coronary', category: 'devices', roles: TECH_MD, settings: LAB, minutes: 0.5 },
  { id: 'cath-jr4', label: 'JR4 diagnostic catheter — right coronary', category: 'devices', roles: TECH_MD, settings: LAB, minutes: 0.5 },
  { id: 'cath-pigtail', label: 'Pigtail catheter — LV gram and LVEDP', category: 'devices', roles: TECH_MD, settings: LAB, minutes: 0.5 },
  { id: 'guide-ebu', label: 'EBU 3.5 guide — left system, extra back-up', category: 'devices', roles: TECH_MD, settings: LAB, minutes: 1 },
  { id: 'guide-jr4', label: 'JR4 guide — right coronary', category: 'devices', roles: TECH_MD, settings: LAB, minutes: 1 },
  { id: 'guide-al1', label: 'AL1 guide — right coronary with extra support', category: 'devices', roles: TECH_MD, settings: LAB, minutes: 1 },
  { id: 'wire-workhorse', label: '0.014" workhorse coronary wire', category: 'devices', roles: TECH_MD, settings: LAB, minutes: 1, repeatable: true },
  { id: 'wire-hydrophilic', label: '0.014" hydrophilic (polymer-jacketed) wire', category: 'devices', roles: TECH_MD, settings: LAB, minutes: 1, repeatable: true },
  { id: 'aspiration', label: 'Aspiration thrombectomy catheter', category: 'devices', roles: TECH_MD, settings: LAB, minutes: 1 },
  { id: 'balloon-predil', label: 'Compliant balloon — pre-dilation', category: 'devices', roles: TECH_MD, settings: LAB, minutes: 1, detail: '2.5 × 15 mm at nominal pressure', repeatable: true },
  { id: 'stent-des', label: 'Drug-eluting stent', category: 'devices', roles: TECH_MD, settings: LAB, minutes: 2, detail: 'sized to the reference vessel', repeatable: true },
  { id: 'balloon-nc', label: 'Non-compliant balloon — post-dilation', category: 'devices', roles: TECH_MD, settings: LAB, minutes: 1, detail: '1:1 with the stent, high pressure', repeatable: true },
  { id: 'stent-covered', label: 'Covered (PTFE) stent', category: 'devices', roles: TECH_MD, settings: LAB, minutes: 2 },
  { id: 'iabp', label: 'Intra-aortic balloon pump (IABP)', category: 'devices', roles: TECH_MD, settings: LAB, minutes: 6 },
  { id: 'impella', label: 'Impella CP (percutaneous LV pump)', category: 'devices', roles: TECH_MD, settings: LAB, minutes: 5 },
  // the cath lab under fluoroscopy; the ER doctor at the bedside through a central line (ECG- or ultrasound-guided)
  { id: 'temp-wire', label: 'Temporary transvenous pacing wire', category: 'devices', roles: TECH_MD_ED, settings: LAB_ED, minutes: 3 },
  { id: 'hemostasis', label: 'Access-site hemostasis (radial band or femoral pressure)', category: 'procedure', roles: [3, 4], settings: LAB, minutes: 1 },
  { id: 'call-surgery', label: 'Call cardiac surgery', category: 'team', roles: [3, 4, 5, 7], settings: LAB_ED, minutes: 0.2 },
  { id: 'call-vascular', label: 'Call vascular surgery / interventional radiology', category: 'team', roles: LAB_TEAM, settings: LAB, minutes: 0.2 },
  { id: 'stroke-team', label: 'Activate the stroke team (stroke alert)', category: 'team', roles: LAB_TEAM, settings: LAB, minutes: 0.2 },

  // Team, calls & transport
  { id: 'call-help', label: 'Call for help / the code team', category: 'team', roles: ALL, minutes: 0.2 },
  { id: 'callout', label: 'Call it out to the operator (closed loop)', category: 'team', roles: [3, 4], settings: LAB, minutes: 0.1, repeatable: true },
  { id: 'als', label: 'Request a paramedic (ALS) intercept', category: 'team', roles: [1], settings: FIELD, minutes: 0.3 },
  // a call back once the 12-lead or the history is in, or when the patient changes, is part of the job
  { id: 'med-control', label: 'Contact online medical control', category: 'team', roles: [1, 2], settings: FIELD, minutes: 1, repeatable: true, maxTimes: 3 },
  // a call back with what the bottle says is part of the job: the first call often only brings the questions
  // the implanting center's VAD coordinator, on call around the clock: the number is on the controller and the patient's card
  { id: 'call-vad', label: 'Call the VAD team (the number on the controller)', category: 'team', roles: [1, 2, 6, 7], settings: FIELD_ED, minutes: 1, detail: 'the implanting center, 24/7: they talk you through the alarms and say where to take the patient', detailBySetting: { ed: 'the implanting center, 24/7: they talk you through the alarms and advise where the patient should be treated' }, repeatable: true, maxTimes: 3 },
  { id: 'poison-control', label: 'Call the poison center', category: 'team', roles: [1, 2, 6, 7], settings: FIELD_ED, minutes: 1, detail: 'Poison Help line 1-800-222-1222: what was taken, how much, when, and the weight', repeatable: true, maxTimes: 3 },
  { id: 'stemi-alert', label: 'STEMI alert: activate the cath lab from the field', category: 'team', roles: [2], settings: FIELD, minutes: 0.5 },
  { id: 'notify', label: 'Radio report to the receiving hospital', category: 'team', roles: [1, 2], settings: FIELD, minutes: 1 },
  // the far destination in every field case: the STEMI's cath lab, a pacing wire, cardiac surgery, the ICU, emergency
  // dialysis. The STEMI cases call it the "PCI-capable heart center" (briefing, critical step, hint): the detail carries that
  // name for the search
  { id: 'transport-pci', label: 'Transport to the regional heart center (PCI, pacing, dialysis)', category: 'team', roles: [1, 2], settings: FIELD, minutes: 2, detail: 'PCI-capable: a cath lab, cardiac surgery, transvenous pacing, emergency dialysis and an ICU' },
  { id: 'transport-near', label: 'Transport to the nearest emergency department', category: 'team', roles: [1, 2], settings: FIELD, minutes: 2 },
  // Emergency department: the nurse reports to the physician; the physician consults, activates the lab and decides where
  // the patient goes (the 'dispo' flag: the hand-off waits for it)
  { id: 'notify-physician', label: 'Report to the ED physician (SBAR, closed loop)', category: 'team', roles: ED_RN, settings: ED, minutes: 0.5, repeatable: true, detail: 'what changed, what you found and gave, what you need: a new 12-lead, a pressure, a rhythm' },
  { id: 'cath-lab-activate', label: 'Activate the cath lab (STEMI alert from the ED)', category: 'team', roles: ED_MD, settings: ED, minutes: 0.5, detail: 'one call brings in the interventional cardiologist and the lab team; the goal is arrival to device within 90 minutes' },
  { id: 'consult-cardiology', label: 'Consult cardiology', category: 'team', roles: ED_MD, settings: ED, minutes: 1, repeatable: true, maxTimes: 2, detail: 'the question, the 12-lead and the findings, physician to physician' },
  { id: 'admit', label: 'Admit: CCU or ICU', category: 'team', roles: ED_MD, settings: ED, minutes: 1, detail: 'the admitting team accepts; the patient stays on the monitor with a nurse until the bed is ready' },
  { id: 'transfer', label: 'Transfer to a center that can treat it (PCI, cardiac surgery)', category: 'team', roles: ED_MD, settings: ED, minutes: 2, detail: 'physician-to-physician acceptance (EMTALA), critical care transport, and the records and images go with the patient' },
  { id: 'handoff', label: 'Hand-off report (SBAR)', category: 'team', roles: ALL, minutes: 1 },
];

export const INTERVENTION_BY_ID: Record<string, Intervention> = Object.fromEntries(INTERVENTIONS.map((i) => [i.id, i]));

/** An intervention's dose or how-to in a setting (Intervention.detailBySetting, or its one detail) */
export const detailFor = (iv: Intervention, setting: Setting): string | undefined => iv.detailBySetting?.[setting] ?? iv.detail;

/** The interventions offered to a role in a setting: everything in their scope, each with the detail for that setting */
export function interventionsFor(role: LearningLevel, setting: Setting): Intervention[] {
  return INTERVENTIONS
    .filter((i) => i.roles.includes(role) && (!i.settings || i.settings.includes(setting)))
    .map((i) => (i.detailBySetting?.[setting] ? { ...i, detail: i.detailBySetting[setting] } : i));
}
