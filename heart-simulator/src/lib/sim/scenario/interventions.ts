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
/**
 * A pigtail in the left ventricle (LV pressure, LVEDP, LV gram): who must not have one. Measuring the LVEDP is no harm in
 * shock (it helps decide on support); only the LV gram's power injection of contrast is (LV_GRAM_HOLD)
 */
const CROSS_THE_VALVE = 'never across a mechanical aortic valve; not with an LV clot; cross a severely stenosed valve only when the answer changes management';
/** The LV gram's contrast load: who must not have it */
const LV_GRAM_HOLD = 'no power injection in shock, decompensated heart failure or a high LVEDP (the echo answers it)';
/** Oxygen: for whom (2025 ACC/AHA ACS: oxygen for an SpO₂ under 90 %) */
const O2_FOR = 'for an SpO₂ under 90 % in ACS; only a breathing patient — bag-mask otherwise';
/** The 6 and the 12 mg adenosine push: how, and not for whom (adenosine label; 2015 ACC/AHA/HRS SVT) */
const ADENOSINE_PUSH = 'with a 20 mL flush, pads on, strip running; not for an irregular or polymorphic wide rhythm, AV block, a slow rate or sick sinus, or asthma; 3 mg first via a central line, after a transplant or with dipyridamole or carbamazepine; no place in cardiac arrest';

/** Every P2Y12 inhibitor: who must not get one (the labels; 2022 ACC/AHA aortic disease: no antithrombotic in a possible dissection) */
const P2Y12_HOLD = 'not with active bleeding or a possible aortic dissection; ticagrelor not after an intracranial bleed';
/**
 * The intracoronary nitric oxide donors (nitroglycerin, nitroprusside): who must not get them (the nitroglycerin and Nipride
 * labels; a heart that needs its filling, as for sublingual nitroglycerin)
 */
const NO_DONOR_HOLD = 'not with a low pressure, a PDE-5 inhibitor or riociguat, or a preload-dependent heart (tamponade, outflow obstruction)';
/** An earlier contrast reaction (ACR Manual on Contrast Media): premedication, but never at the cost of a time-critical scan */
const CONTRAST_REACTION = 'an earlier contrast reaction needs premedication (an accelerated regimen — never delaying a scan for a life threat)';

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
  // emergency department: the patient arrives — the crew's report, then triage (the nurse's: ESI)
  { id: 'ems-handoff', label: 'Take the EMS hand-off report', category: 'assess', roles: ED_TEAM, settings: ED, minutes: 1, detail: 'at the bedside, everyone listening: what happened, what they found, what they gave and how the patient responded' },
  { id: 'triage', label: 'Triage: Emergency Severity Index (ESI) level', category: 'assess', roles: ED_RN, settings: ED, minutes: 1, detail: 'ESI 1 needs a life-saving intervention now; chest pain that could be ACS is at least ESI 2, with a 12-lead within 10 minutes of arrival' },
  { id: 'primary', label: 'Primary survey: airway, breathing, circulation', category: 'assess', roles: ALL, minutes: 1 },
  { id: 'opqrst', label: 'Ask about the pain (OPQRST)', category: 'assess', roles: ALL, minutes: 1 },
  { id: 'sample', label: 'SAMPLE history: allergies, medicines, past history', category: 'assess', roles: ALL, minutes: 1 },
  { id: 'ask-pde5', label: 'Ask about PDE-5 inhibitors and riociguat (sildenafil, vardenafil, tadalafil, avanafil — for erections, pulmonary hypertension or the prostate)', category: 'assess', roles: ALL, minutes: 0.25 },
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
  { id: 'neuro', label: 'Neuro check: GCS and stroke screen', category: 'assess', roles: ALL, minutes: 0.5, repeatable: true },
  { id: 'temp', label: 'Temperature', category: 'assess', roles: ALL, minutes: 0.5, repeatable: true },
  // the field's agitated patient: talk first; restraint only to protect the patient and the crew, never face down
  { id: 'calm', label: 'Verbal de-escalation: one calm voice, a quiet space, explain each step', category: 'assess', roles: [1, 2], settings: FIELD, minutes: 0.5 },
  { id: 'reassess', label: 'Reassess the patient (2 min)', category: 'assess', roles: ALL, minutes: 2, repeatable: true },
  // the department's watchful wait: the clock runs a minute at a time and stops as soon as something happens
  { id: 'observe', label: 'Observe on the monitor (up to 15 min)', category: 'assess', roles: ED_TEAM, settings: ED, minutes: 0, repeatable: true, detail: 'the monitor on, a nurse in the room: the clock stops at the first change' },

  // Monitoring & ECG
  { id: 'monitor', label: 'Attach the cardiac monitor and pulse oximeter', category: 'monitor', roles: ALL, minutes: 1 },
  { id: 'pads', label: 'Apply defibrillation pads', category: 'monitor', roles: ALL, minutes: 0.5 },
  { id: 'nibp', label: 'Blood pressure on the monitor (NIBP)', category: 'monitor', roles: ALL, minutes: 0.5, repeatable: true },
  { id: 'ecg12', label: 'Acquire a 12-lead ECG', category: 'monitor', roles: ALL, minutes: 2 },
  { id: 'ecg12-repeat', label: 'Repeat the 12-lead ECG', category: 'monitor', roles: ALL, minutes: 1.5, repeatable: true },
  { id: 'ecg-transmit', label: 'Transmit the 12-lead to the hospital', category: 'monitor', roles: [1, 2], settings: FIELD, minutes: 0.5, repeatable: true, maxTimes: 3 },
  { id: 'ecg-right', label: 'Right-sided leads (V4R)', category: 'monitor', roles: MANUAL, minutes: 1 },
  { id: 'ecg-posterior', label: 'Posterior leads (V7–V9)', category: 'monitor', roles: MANUAL, minutes: 1 },
  { id: 'capno', label: 'Waveform capnography (EtCO₂)', category: 'monitor', roles: MANUAL, minutes: 0.5, repeatable: true },
  { id: 'transducer', label: 'Zero and level the pressure transducers', category: 'monitor', roles: [3, 4], settings: LAB, minutes: 0.5 },
  { id: 'arterial-line', label: 'Radial arterial line', category: 'monitor', roles: ED_MD, settings: ED, minutes: 5, detail: 'beat-to-beat pressure for a pressor or a titrated infusion; in a dissection the arm with the higher pressure; a compressible site after a fibrinolytic' },
  { id: 'labs', label: 'Draw labs: troponin, electrolytes, CBC, coagulation', category: 'monitor', roles: HOSPITAL_RN_MD, settings: LAB_ED, minutes: 0.5 },
  // the chest pain pathway's serial high-sensitivity troponin (2021 AHA/ACC chest pain guideline: at 0 and 1–3 h), part of
  // the chest pain order set the nurse draws on
  { id: 'troponin-repeat', label: 'Repeat high-sensitivity troponin', category: 'monitor', roles: ED_TEAM, settings: ED, minutes: 0.5, repeatable: true, maxTimes: 2, detail: '1–3 hours after the first: the change between the two decides as much as either value' },
  { id: 'act', label: 'Check the ACT (activated clotting time)', category: 'monitor', roles: [3, 4, 5], settings: LAB, minutes: 1, repeatable: true },
  { id: 'echo', label: 'Bedside echocardiogram', category: 'monitor', roles: [5], settings: LAB, minutes: 3, repeatable: true, maxTimes: 3 },
  { id: 'lvedp', label: 'Measure LVEDP (pigtail in the left ventricle)', category: 'monitor', roles: TECH_MD, settings: LAB, minutes: 1, detail: CROSS_THE_VALVE },
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
  { id: 'lv-gram', label: 'Left ventriculogram (pigtail, power injector)', category: 'imaging', roles: TECH_MD, settings: LAB, minutes: 1, detail: `${angles('lv-gram')}, 30–36 mL at 10–15 mL/s; ${CROSS_THE_VALVE}; ${LV_GRAM_HOLD}` },
  { id: 'ffr-equalize', label: 'Equalize the pressure wire at the guide tip', category: 'imaging', roles: TECH_MD, settings: LAB, minutes: 0.5, repeatable: true },
  { id: 'ffr', label: 'FFR measurement (pressure wire, hyperemia)', category: 'imaging', roles: TECH_MD, settings: LAB, minutes: 3, repeatable: true },
  { id: 'ivus', label: 'IVUS run', category: 'imaging', roles: TECH_MD, settings: LAB, minutes: 2, repeatable: true },
  { id: 'oct', label: 'OCT run (contrast flush)', category: 'imaging', roles: TECH_MD, settings: LAB, minutes: 2, repeatable: true },
  { id: 'final-angio', label: 'Final angiogram in two views', category: 'imaging', roles: TECH_MD, settings: LAB, minutes: 1 },
  { id: 'stop-contrast', label: 'Stop all contrast injections', category: 'imaging', roles: LAB_TEAM, settings: LAB, minutes: 0.1, detail: 'injector off, manifold closed (and, when the case must end, the catheter out over a wire, the sheath left in)' },
  // the cath lab nurse and cardiologist send a patient from the table; in the ED the physician orders it (CT angiography of
  // the chest for a dissection or a pulmonary embolism)
  { id: 'ct-urgent', label: 'Urgent CT scan', category: 'imaging', roles: [4, 5, 7], settings: LAB_ED, minutes: 10, detail: `head CT for a stroke (CT angiography if a clot could be pulled), abdomen and pelvis for a retroperitoneal bleed, chest CT angiography for a dissection — once the patient is stable enough to leave the lab; not before the culprit artery is open in a STEMI; ${CONTRAST_REACTION}`, detailBySetting: { ed: `chest CT angiography for a dissection or a pulmonary embolism, head CT for a stroke (CT angiography if a clot could be pulled), abdomen and pelvis for a bleed — once the patient is stable enough to leave the department; ${CONTRAST_REACTION}` } },
  // emergency department imaging: a portable film (the nurse on the chest pain standing order, or the physician's order)
  // and the physician's own bedside ultrasound
  { id: 'cxr', label: 'Portable chest X-ray', category: 'imaging', roles: ED_TEAM, settings: ED, minutes: 3, detail: 'at the bedside: heart size, the lungs (edema, a pneumothorax), the mediastinum, and where the lines and tubes sit' },
  { id: 'pocus', label: 'Point-of-care ultrasound: heart, lungs, IVC and aorta', category: 'imaging', roles: ED_MD, settings: ED, minutes: 3, repeatable: true, maxTimes: 3, detail: 'the physician\'s bedside scan: pericardial effusion, how the ventricles squeeze, a large RV, B-lines, the IVC and the aortic root', arrestMinutes: 0.2 },

  // Airway & breathing
  { id: 'o2-nc', label: 'Oxygen by nasal cannula', category: 'airway', roles: ALL, minutes: 0.5, detail: `2–4 L/min; ${O2_FOR}` },
  { id: 'o2-nrb', label: 'Oxygen by non-rebreather mask', category: 'airway', roles: ALL, minutes: 0.5, detail: `15 L/min; ${O2_FOR}` },
  { id: 'bvm', label: 'Bag-valve-mask ventilation', category: 'airway', roles: ALL, minutes: 0.5, repeatable: true },
  // the ER nurse's set-up for the physician's sedation or bedside procedure: airway equipment ready, not used
  { id: 'procedure-setup', label: 'Set up for the physician\'s procedure: suction, bag-mask on oxygen, airway adjuncts, the crash cart open', category: 'airway', roles: ED_RN, settings: ED, minutes: 0.5 },
  { id: 'smr', label: 'Spinal motion restriction: cervical collar and scoop stretcher', category: 'airway', roles: [1, 2], settings: FIELD, minutes: 2, detail: 'blunt trauma with altered consciousness, midline neck pain or tenderness, a deficit or a deformity — never ahead of CPR or the shock' },
  { id: 'cpap', label: 'CPAP', category: 'airway', roles: [1, 2, 6, 7], settings: FIELD_ED, minutes: 1, detail: '5–10 cmH₂O for respiratory distress from pulmonary edema (or COPD or asthma); only an awake patient breathing on their own with a systolic of 90 or more — not with vomiting, a pneumothorax, facial trauma or a patient who cannot protect the airway; not for a heart that needs its filling (tamponade, a large PE, an RV infarct)', detailBySetting: { ed: 'non-invasive ventilation with respiratory therapy: CPAP 5–10 cmH₂O or BiPAP (e.g. 10–16 over 5–10), FiO₂ titrated; awake, protecting the airway, upright; not with a systolic under 90, vomiting or a pneumothorax; not for a heart that needs its filling (tamponade, a large PE, an RV infarct)' } },
  { id: 'airway', label: 'Advanced airway (supraglottic or intubation)', category: 'airway', roles: [2, 5, 7], minutes: 3 },
  // the ER doctor intubates a patient with a pulse who still breathes and guards the airway: induction drug and paralytic
  { id: 'rsi', label: 'Rapid sequence intubation', category: 'airway', roles: ED_MD, settings: ED, minutes: 5, needsAccess: true, detail: 'preoxygenate; etomidate 0.3 mg/kg (or ketamine 1–2 mg/kg) and rocuronium 1 mg/kg; tube confirmed with waveform capnography — resuscitate a low pressure first, and give half the induction dose with a low pressure; ketamine not with an aortic dissection or a hypertensive emergency; rocuronium, not succinylcholine, with a high potassium; in tamponade or a massive PE drain or support first — positive pressure can stop a heart that depends on its filling' },

  // IV access & fluids
  { id: 'iv', label: 'IV access', category: 'access', roles: ALS_RN_MD, minutes: 2 },
  { id: 'io', label: 'IO access', category: 'access', roles: ALS_RN_MD, minutes: 1.5 },
  { id: 'fluid', label: 'Normal saline bolus', category: 'access', roles: ALS_RN_MD, minutes: 1, detail: '250–500 mL, reassess; not with pulmonary edema; at most 500 mL in a PE with a failing RV', repeatable: true, maxTimes: 4, needsAccess: true },
  // also IV access for drugs (and the route a transvenous pacing wire takes)
  { id: 'central-line', label: 'Central venous line (ultrasound-guided)', category: 'access', roles: ED_MD, settings: ED, minutes: 8, detail: 'internal jugular or femoral vein, full sterile barrier: an introducer sheath (6 Fr, with a side port for drugs), which a pacing wire can follow — for pressors, a transvenous wire or no peripheral access; after a fibrinolytic or with anticoagulation: a compressible site under ultrasound (femoral or internal jugular), never subclavian' },
  { id: 'transfuse', label: 'Transfuse packed red cells', category: 'access', roles: HOSPITAL_RN_MD, settings: LAB_ED, minutes: 2, detail: '1 unit after the bedside check, through a warmer; for massive bleeding, the massive transfusion protocol; with a massive transfusion, give calcium (the citrate in the blood binds it)', repeatable: true, maxTimes: 4, needsAccess: true },

  // Medications
  { id: 'aspirin', label: 'Aspirin, chewed', category: 'meds', roles: [1, 2, 4, 5, 6, 7], minutes: 0.5, detail: '324 mg (162–325 mg) non-enteric-coated; not with a true aspirin allergy (clopidogrel instead), active bleeding or a possible aortic dissection' },
  { id: 'nitro-assist', label: "Help the patient take their own nitroglycerin", category: 'meds', roles: [1], settings: FIELD, minutes: 0.5, repeatable: true, maxTimes: 3, detail: '0.4 mg (the patient\'s own), every 5 min, max 3, with a blood pressure before each — per protocol / medical direction; not with a systolic under 90, a rate under 50 or over 100, or a PDE-5 inhibitor or riociguat' },
  { id: 'nitro', label: 'Nitroglycerin sublingual', category: 'meds', roles: ALS_RN_MD, minutes: 0.5, detail: '0.4 mg, every 5 min, max 3; hold for a systolic under 90 or 30 below baseline, a rate under 50 or over 100 without heart failure, an RV infarct or any preload-dependent heart (tamponade, a large PE, severe AS or outflow obstruction), or a PDE-5 inhibitor (avanafil 12 h, sildenafil/vardenafil 24 h, tadalafil 48 h) or riociguat', repeatable: true, maxTimes: 3 },
  // hypertensive acute pulmonary edema (SCAPE): the sublingual high dose most US EMS protocols carry (IV infusions are not
  // carried by most services), with CPAP
  { id: 'nitro-high', label: 'Nitroglycerin 0.8 mg sublingual (high dose, pulmonary edema)', category: 'meds', roles: ALS_RN_MD, minutes: 0.5, detail: 'two 0.4 mg tablets or sprays every 5 min while the systolic stays 160 or more (1.2 mg over 200 in some protocols), with CPAP; step down to 0.4 mg below 160; not after a PDE-5 inhibitor, with riociguat, a low pressure or a preload-dependent heart', repeatable: true, maxTimes: 3 },
  // hypertensive pulmonary edema in hospital: the IV bolus and infusion the sublingual high dose stands in for in the field
  { id: 'nitro-iv', label: 'Nitroglycerin IV infusion (ischemic pain that persists, a high pressure; a high-dose bolus for hypertensive pulmonary edema)', category: 'meds', roles: HOSPITAL_RN_MD, settings: LAB_ED, minutes: 1, repeatable: true, maxTimes: 3, needsAccess: true, detail: 'ischemic pain that persists, or a high pressure: 5–10 mcg/min, up 10 mcg/min every 3–5 min, no bolus; hypertensive pulmonary edema: 400–1,000 mcg over 1–2 min, then 100–400 mcg/min titrated; hold under systolic 90; never within 24 h of sildenafil or vardenafil (48 h tadalafil) or with riociguat, and not with an RV infarct, tamponade or outflow obstruction' },
  { id: 'fentanyl', label: 'Fentanyl IV', category: 'meds', roles: ALS_RN_MD, minutes: 0.5, detail: '25–50 mcg (0.5–1 mcg/kg); hold for a systolic under 90 or breathing under 10/min', repeatable: true, maxTimes: 3, needsAccess: true },
  // the dose depends on where it is given: the lab the PCI dose, the ED the ACS (or fibrinolytic) bolus and infusion
  { id: 'heparin', label: 'Unfractionated heparin IV bolus', category: 'meds', roles: HOSPITAL_RN_MD, settings: LAB_ED, minutes: 0.5, detail: '70–100 U/kg for primary PCI, then to the ACT target; not with heparin-induced thrombocytopenia or active bleeding', detailBySetting: { ed: 'weight-based: 60 U/kg (max 4,000 U), then 12 U/kg/h (max 1,000 U/h) for ACS; for a pulmonary embolism 80 U/kg, then 18 U/kg/h; the cath lab tops it up for PCI — not with heparin-induced thrombocytopenia, active bleeding or a possible aortic dissection' }, repeatable: true, maxTimes: 3, needsAccess: true },
  // stopping a drip for a bleed (or a lytic, or SCAD) is within the nurse's judgment: the physician is told
  { id: 'stop-antithrombotics', label: 'Stop the heparin, bivalirudin, GP IIb/IIIa or cangrelor infusion', category: 'meds', roles: HOSPITAL_RN_MD, settings: LAB_ED, minutes: 0.2, detail: 'off at the pump, no more boluses, and the orders say so' },
  { id: 'p2y12', label: 'P2Y12 loading dose', category: 'meds', roles: HOSPITAL_RN_MD, settings: LAB_ED, minutes: 0.5, detail: `ticagrelor 180 mg (or prasugrel 60 mg: not after a stroke or TIA, not usually at 75 or over, and not during a cangrelor infusion); ${P2Y12_HOLD}`, detailBySetting: { ed: `by mouth: ticagrelor 180 mg, or prasugrel 60 mg (never after a stroke or TIA; not usually at 75 or over; in NSTE-ACS only once the anatomy is known); with a fibrinolytic, clopidogrel 300 mg (75 mg, no load, over age 75); ${P2Y12_HOLD}` } },
  { id: 'metoprolol', label: 'Metoprolol IV', category: 'meds', roles: ALS_RN_MD, minutes: 0.5, detail: '5 mg IV over 2 min (every 5 min, max 15 mg); not with a slow rate (under 50–60) or AV block beyond first degree, a low pressure (in an MI no IV dose with a systolic under 120, a rate over 110 or under 60, or just after an arrest: shock risk), wet lungs, asthma or active wheeze, a stimulant on board or pre-excited AF', needsAccess: true },
  // the titratable IV beta-blockers in hospital (a dissection's anti-impulse therapy, a rate to bring down for minutes),
  // and the oral one started on the unit
  { id: 'esmolol', label: 'Esmolol IV: 500 mcg/kg over 1 min, then an infusion', category: 'meds', roles: HOSPITAL_RN_MD, settings: LAB_ED, minutes: 1, needsAccess: true, detail: 'then 50–300 mcg/kg/min, titrated to a heart rate of 60–80; not with a rate under 50, sick sinus syndrome, AV block beyond the first degree, cardiogenic shock, decompensated heart failure, pulmonary hypertension, or IV diltiazem/verapamil' },
  { id: 'labetalol', label: 'Labetalol IV: 20 mg over 2 min (repeat 40–80 mg every 10 min)', category: 'meds', roles: HOSPITAL_RN_MD, settings: LAB_ED, minutes: 2, repeatable: true, maxTimes: 3, needsAccess: true, detail: 'an alpha and beta blocker, to a heart rate of 60–80 and a lower pressure; not with asthma, heart failure, AV block, a slow rate or shock' },
  { id: 'metoprolol-po', label: 'Metoprolol by mouth', category: 'meds', roles: HOSPITAL_RN_MD, settings: LAB_ED, minutes: 0.3, detail: 'metoprolol tartrate 25 mg, then twice daily — hold for heart-failure signs, a systolic under 120 in an MI (under 100 otherwise), a rate under 60, AV block, bronchospasm or cocaine' },
  { id: 'atropine', label: 'Atropine IV', category: 'meds', roles: ALS_RN_MD, minutes: 0.5, detail: '1 mg, every 3–5 min, max 3 mg; pace instead of repeating it for Mobitz II or a wide escape; never after a heart transplant (a denervated heart: it can cause AV block — pace, or epinephrine)', repeatable: true, maxTimes: 3, needsAccess: true },
  // the first dose with a central line, a transplanted heart, dipyridamole or carbamazepine (they make adenosine stronger)
  { id: 'adenosine3', label: 'Adenosine 3 mg rapid IV push (central line, transplanted heart, dipyridamole or carbamazepine)', category: 'meds', roles: ALS_RN_MD, minutes: 0.5, detail: 'with a 20 mL flush', needsAccess: true },
  { id: 'adenosine6', label: 'Adenosine 6 mg rapid IV push', category: 'meds', roles: ALS_RN_MD, minutes: 0.5, detail: ADENOSINE_PUSH, needsAccess: true },
  { id: 'adenosine12', label: 'Adenosine 12 mg rapid IV push', category: 'meds', roles: ALS_RN_MD, minutes: 0.5, detail: ADENOSINE_PUSH, repeatable: true, maxTimes: 2, needsAccess: true },
  { id: 'diltiazem', label: 'Diltiazem IV', category: 'meds', roles: ALS_RN_MD, minutes: 0.5, detail: '0.25 mg/kg over 2 min; not with a low pressure, heart failure (EF ≤ 40 %), a wide or pre-excited tachycardia, AV block, a slow rate or sick sinus without a pacer, or an IV beta-blocker within hours', needsAccess: true },
  { id: 'epinephrine', label: 'Epinephrine 1 mg IV/IO (cardiac arrest)', category: 'meds', roles: ALS_RN_MD, minutes: 0.5, detail: 'every 3–5 min — cardiac arrest only (with a pulse: push-dose or an infusion)', repeatable: true, needsAccess: true },
  { id: 'amio-arrest', label: 'Amiodarone IV/IO push (cardiac arrest)', category: 'meds', roles: ALS_RN_MD, minutes: 0.5, detail: '300 mg, then 150 mg — VF or pulseless VT after the third shock; not for torsades (magnesium)', repeatable: true, maxTimes: 2, needsAccess: true },
  { id: 'amio-infusion', label: 'Amiodarone 150 mg IV over 10 min', category: 'meds', roles: ALS_RN_MD, minutes: 1, detail: 'tachycardia with a pulse, then 1 mg/min; not with a long QT, AV block or a slow rate without a pacer, or pre-excited AF; not for the wide QRS of a high potassium (calcium); AF over 48 h without anticoagulation can convert; slow it for a falling pressure', needsAccess: true },
  { id: 'lidocaine', label: 'Lidocaine IV/IO', category: 'meds', roles: ALS_RN_MD, minutes: 0.5, detail: '1–1.5 mg/kg (then 0.5–0.75 mg/kg, max 3 mg/kg); never for a slow wide escape rhythm or AV block; not in WPW; not for the wide QRS of a high potassium (calcium)', needsAccess: true },
  // the infusions of the hospital: a vasodilator for a high pressure, an inotrope for low output, a loop diuretic for congestion
  // (prehospital furosemide is no longer in US EMS protocols)
  { id: 'nicardipine', label: 'Nicardipine infusion IV (or clevidipine)', category: 'meds', roles: HOSPITAL_RN_MD, settings: LAB_ED, minutes: 1, needsAccess: true, detail: '5 mg/h, up 2.5 mg/h every 5–15 min to 15 mg/h (clevidipine 1–2 mg/h, doubled every 90 s); in a dissection only after the beta-blocker; not with severe aortic stenosis or a low pressure (clevidipine: not with a soy or egg allergy, defective lipid metabolism or acute pancreatitis)' },
  { id: 'inotrope', label: 'Inotrope infusion (dobutamine or milrinone)', category: 'meds', roles: HOSPITAL_RN_MD, settings: LAB_ED, minutes: 1, needsAccess: true, detail: 'dobutamine 2.5–10 mcg/kg/min (or milrinone 0.125–0.75 mcg/kg/min, no routine bolus, a lower dose with kidney disease); for low output with an adequate pressure — never with LV outflow obstruction' },
  { id: 'furosemide', label: 'Furosemide IV (loop diuretic)', category: 'meds', roles: HOSPITAL_RN_MD, settings: LAB_ED, minutes: 0.5, needsAccess: true, detail: '40 mg IV, or 1–2.5 times the home oral dose IV; not with a low pressure, a dry patient, a preload-dependent heart (tamponade, RV infarct, outflow obstruction) or no urine' },
  { id: 'push-epi', label: 'Push-dose epinephrine', category: 'meds', roles: ALS_RN_MD, minutes: 0.5, detail: '10–20 mcg IV for a low pressure with a pulse, repeat as needed — never the 1 mg arrest dose', repeatable: true, needsAccess: true },
  { id: 'pressor', label: 'Vasopressor infusion', category: 'meds', roles: ALS_RN_MD, minutes: 1, detail: 'norepinephrine, epinephrine or dopamine, titrated to MAP ≥ 65; volume first in bleeding; no catecholamine with LV outflow obstruction; not in arrest', needsAccess: true },
  // the ER nurse gives midazolam and fentanyl on the physician's order; the ER doctor's procedural sedation is its own action
  { id: 'sedation', label: 'Sedation / analgesia for the procedure', category: 'meds', roles: [2, 4, 5], minutes: 1, detail: 'per protocol or order, with monitoring; not with a low pressure, slow breathing or a drowsy patient unless a procedure needs it (then less)', needsAccess: true },
  // IM or intranasal without a line, so it needs no IV
  { id: 'midazolam', label: 'Midazolam (benzodiazepine) for agitation or stimulant toxicity', category: 'meds', roles: ALS_RN_MD, minutes: 0.5, detail: 'agitation or a stimulant: 2.5–5 mg IV, or 5 mg IM or intranasal without a line, repeated to calm; procedural sedation (before a shock, the pacer or a bedside procedure): 0.5–1 mg IV at a time, titrated; watch the breathing and the pressure', repeatable: true, maxTimes: 3 },
  { id: 'phenylephrine', label: 'Phenylephrine IV bolus', category: 'meds', roles: RN_MD, settings: LAB, minutes: 0.3, detail: '50–100 mcg, every 1–2 min as needed: a pure vasoconstrictor, it can slow the heart; for vasodilation or outflow obstruction, not a failing ventricle (norepinephrine)', repeatable: true, needsAccess: true },
  // ACEP / ACC: the physician decides on the fibrinolytic (a STEMI that cannot reach PCI in time)
  { id: 'tnk', label: 'Fibrinolytic: tenecteplase IV', category: 'meds', roles: [5, 7], minutes: 0.5, detail: 'weight-based (30–50 mg in five bands), after the contraindication checklist', needsAccess: true },
  // the approved regimen for pulmonary embolism with shock; the ER nurse runs it on the physician's order
  { id: 'alteplase', label: 'Fibrinolytic: alteplase IV (pulmonary embolism)', category: 'meds', roles: ED_TEAM, settings: ED, minutes: 1, needsAccess: true, detail: '100 mg over 2 hours after the bleeding checklist (stop the heparin infusion while it runs); PE with shock or cardiopulmonary failure only; in a cardiac arrest from PE, a 50 mg bolus per protocol' },
  // ACEP procedural sedation: the physician sedates, with continuous monitoring and capnography, for a cardioversion or the pacer
  { id: 'procedural-sedation', label: 'Procedural sedation (etomidate or propofol)', category: 'meds', roles: ED_MD, settings: ED, minutes: 1, repeatable: true, maxTimes: 2, needsAccess: true, detail: 'etomidate 0.1–0.15 mg/kg IV (or propofol 0.5–1 mg/kg with a normal pressure — not with a low one: it drops the pressure; with a low pressure a reduced dose of etomidate or ketamine), titrated; monitor, capnography, suction and airway equipment ready' },
  { id: 'epi-im', label: 'Epinephrine IM for anaphylaxis', category: 'meds', roles: [1, 2, 4, 5, 6, 7], minutes: 0.3, detail: '0.3–0.5 mg (1 mg/mL), lateral thigh; for anaphylaxis — never the route in cardiac arrest (1 mg IV/IO)' },
  // two actions, not one with a dose to pick: the hyperkalemia dose is 4–8 times the wheezing dose, and choosing it is the point
  { id: 'albuterol', label: 'Albuterol (salbutamol) 2.5–5 mg nebulized (bronchospasm)', category: 'meds', roles: [2, 4, 5, 6, 7], minutes: 1, detail: 'for wheezing; repeat per protocol' },
  { id: 'albuterol-hyperk', label: 'Albuterol 10–20 mg nebulized (hyperkalemia)', category: 'meds', roles: ALS_RN_MD, minutes: 1, detail: '4–8 times the asthma dose, over about 10 min; not in cardiac arrest' },
  { id: 'diphenhydramine', label: 'Diphenhydramine IV', category: 'meds', roles: [2, 4, 5, 6, 7], minutes: 0.3, detail: '25–50 mg; after epinephrine in anaphylaxis; sedating; push slowly', needsAccess: true },
  { id: 'steroid', label: 'Methylprednisolone IV', category: 'meds', roles: HOSPITAL_RN_MD, settings: LAB_ED, minutes: 0.3, detail: '125 mg; an adjunct after epinephrine — it treats neither the airway nor the pressure', needsAccess: true },
  { id: 'radial-cocktail', label: 'Radial cocktail through the sheath', category: 'meds', roles: LAB_TEAM, settings: LAB, minutes: 0.3, detail: 'verapamil 2.5 mg + nitroglycerin 200 mcg, on the operator\'s order; through the radial sheath; leave out the verapamil with a low pressure, AV block or shock, and the nitroglycerin with a low pressure, a PDE-5 inhibitor or riociguat' },
  { id: 'ic-nitro', label: 'Intracoronary nitroglycerin', category: 'meds', roles: LAB_TEAM, settings: LAB, minutes: 0.2, detail: `100–200 mcg, on the operator's order; ${NO_DONOR_HOLD}`, repeatable: true },
  { id: 'ic-adenosine', label: 'Intracoronary adenosine', category: 'meds', roles: LAB_TEAM, settings: LAB, minutes: 0.2, detail: '100–200 mcg boluses (hyperemia or no-reflow); a few seconds of AV block (worse in the RCA): not in AV block without pacing, not with a low pressure', repeatable: true },
  { id: 'ic-verapamil', label: 'Intracoronary verapamil', category: 'meds', roles: LAB_TEAM, settings: LAB, minutes: 0.2, detail: '100–200 mcg (no-reflow); not with a low pressure, AV block or cardiogenic shock', repeatable: true },
  { id: 'adenosine-iv-ffr', label: 'IV adenosine infusion for hyperemia', category: 'meds', roles: RN_MD, settings: LAB, minutes: 0.5, detail: '140 mcg/kg/min through a large vein — not with asthma, 2nd/3rd-degree AV block or sinus node disease without a pacemaker, or a low pressure; no caffeine for 12 h (it blocks the hyperemia)', needsAccess: true },
  { id: 'bivalirudin', label: 'Bivalirudin bolus and infusion', category: 'meds', roles: RN_MD, settings: LAB, minutes: 0.5, detail: '0.75 mg/kg, then 1.75 mg/kg/h (1 mg/kg/h if CrCl < 30, 0.25 mg/kg/h on dialysis); not with active bleeding or a possible aortic dissection', needsAccess: true },
  { id: 'gp2b3a', label: 'GP IIb/IIIa inhibitor (eptifibatide)', category: 'meds', roles: RN_MD, settings: LAB, minutes: 0.5, detail: '180 mcg/kg bolus ×2, 2 mcg/kg/min; 1 mcg/kg/min if CrCl < 50; not on dialysis, with bleeding (now or within 30 days), any hemorrhagic stroke or a stroke within 30 days, major surgery within 6 weeks, a pressure over 200/110, platelets under 100,000, after a full-dose lytic or in a possible aortic dissection', needsAccess: true },
  { id: 'cangrelor', label: 'Cangrelor (IV P2Y12 inhibitor)', category: 'meds', roles: RN_MD, settings: LAB, minutes: 0.5, detail: '30 mcg/kg bolus, 4 mcg/kg/min; clopidogrel or prasugrel only after the infusion ends (ticagrelor any time); not with active bleeding or a possible aortic dissection', needsAccess: true },
  { id: 'protamine', label: 'Protamine (reverse heparin)', category: 'meds', roles: RN_MD, settings: LAB, minutes: 1, detail: '1 mg per 100 units of heparin given in the last 30 minutes (0.25–0.375 mg per 100 units after 2 hours); at most 50 mg, slowly over 10 minutes; reactions are likelier after NPH (protamine) insulin, a fish allergy or a vasectomy; only for real bleeding, never while a wire or a fresh stent is in the artery (it clots them); not after an earlier protamine reaction', needsAccess: true },
  // no-reflow: microvascular vasodilators, and epinephrine for the patient whose pressure is too low for them
  { id: 'ic-nitroprusside', label: 'Intracoronary nitroprusside', category: 'meds', roles: LAB_TEAM, settings: LAB, minutes: 0.2, detail: `50–200 mcg boluses (no-reflow), on the operator's order; ${NO_DONOR_HOLD}`, repeatable: true },
  { id: 'ic-epinephrine', label: 'Intracoronary epinephrine', category: 'meds', roles: LAB_TEAM, settings: LAB, minutes: 0.2, detail: '50–100 mcg (no-reflow with a low pressure), on the operator\'s order; never with outflow obstruction', repeatable: true },

  // Electrolytes, antidotes and glucose: offered in the field and in the lab alike (oral glucose in the field only)
  { id: 'calcium-chloride', label: 'Calcium chloride 1 g IV/IO', category: 'meds', roles: ALS_RN_MD, minutes: 1, detail: '10 mL of 10 %, over 2–5 min with a pulse (a push in arrest); flush the line; never through the same line as bicarbonate; a large or central vein', repeatable: true, maxTimes: 3, needsAccess: true },
  // the peripheral-line calcium (calcium chloride is a vesicant: a central line is preferred for it)
  { id: 'calcium-gluconate', label: 'Calcium gluconate 3 g IV/IO', category: 'meds', roles: ALS_RN_MD, minutes: 1, repeatable: true, maxTimes: 3, needsAccess: true, detail: '30 mL of 10 % over 5–10 min (a push in arrest); safer through a peripheral line; repeat if the ECG changes persist; not in the bicarbonate line' },
  { id: 'sodium-bicarbonate', label: 'Sodium bicarbonate 50 mEq IV/IO', category: 'meds', roles: ALS_RN_MD, minutes: 0.5, detail: '50 mL of 8.4 % (about 1 mEq/kg); flush before and after calcium; for hyperkalemia with acidosis or a sodium-channel-blocker overdose — not routine in arrest; ventilate', repeatable: true, maxTimes: 3, needsAccess: true },
  { id: 'insulin-dextrose', label: 'Insulin 5–10 units IV with dextrose 25 g', category: 'meds', roles: HOSPITAL_RN_MD, minutes: 0.5, detail: 'regular insulin 10 units (5 units with kidney failure or a low weight: fewer lows), then D50 50 mL unless the glucose is over 250; check the glucose first (under 70: dextrose before any insulin); recheck at 30 minutes, then every hour', needsAccess: true },
  { id: 'magnesium-sulfate', label: 'Magnesium sulfate 2 g IV/IO', category: 'meds', roles: ALS_RN_MD, minutes: 1, detail: 'diluted, over about 5–15 min with a pulse (a push in pulseless torsades); for torsades — not routine in arrest, not in heart block without pacing ready; less, and with levels, in kidney failure', repeatable: true, maxTimes: 2, needsAccess: true },
  { id: 'procainamide', label: 'Procainamide 20–50 mg/min IV', category: 'meds', roles: ALS_RN_MD, minutes: 1, detail: 'stop when the arrhythmia stops, at hypotension, QRS widening by 50 % or 17 mg/kg; avoid in heart failure and long QT; not with AV block without a pacer, after amiodarone or in a sodium-channel-blocker overdose', needsAccess: true },
  { id: 'glucagon', label: 'Glucagon 3–10 mg IV (beta- or calcium-channel-blocker overdose)', category: 'meds', roles: ALS_RN_MD, minutes: 1, detail: 'slowly over 3–5 min, then an infusion; not with a pheochromocytoma (with an insulinoma, watch for a rebound low) — protect the airway (it makes patients vomit)', repeatable: true, maxTimes: 2, needsAccess: true },
  { id: 'oral-glucose', label: 'Oral glucose 15 g (one tube of gel)', category: 'meds', roles: [1, 2], settings: FIELD, minutes: 1, detail: 'between cheek and gum, only if awake enough to swallow', repeatable: true, maxTimes: 2 },
  { id: 'dextrose', label: 'Dextrose 25 g IV/IO (hypoglycemia)', category: 'meds', roles: ALS_RN_MD, minutes: 1, detail: 'D10 in 100 mL (10 g) steps up to 250 mL, or D50 50 mL; check the glucose first, and recheck it', repeatable: true, maxTimes: 2, needsAccess: true },
  { id: 'ondansetron', label: 'Ondansetron 4 mg IV (nausea and vomiting)', category: 'meds', roles: ALS_RN_MD, minutes: 0.5, detail: 'slowly over at least 30 seconds; it lengthens the QT', needsAccess: true },

  // Resuscitation & electrical
  { id: 'cpr', label: 'High-quality CPR (2-minute cycle)', category: 'resus', roles: ALL, minutes: 2, repeatable: true },
  { id: 'aed', label: 'AED: analyze and shock if advised', category: 'resus', roles: ALL, minutes: 0.5, repeatable: true },
  { id: 'defib', label: 'Defibrillate, unsynchronized', category: 'resus', roles: MANUAL, minutes: 0.3, detail: '200 J biphasic', repeatable: true },
  { id: 'cardiovert', label: 'Synchronized cardioversion', category: 'resus', roles: MANUAL, minutes: 0.5, detail: '100 J biphasic (atrial fibrillation: 200 J or more; flutter: 200 J); sedate an awake patient; AF over 48 h without anticoagulation only if unstable; not in digoxin toxicity', repeatable: true },
  { id: 'pace', label: 'Transcutaneous pacing', category: 'resus', roles: MANUAL, minutes: 1, repeatable: true, detail: 'rate 70, raise mA until capture' },
  { id: 'vagal', label: 'Vagal maneuver (modified Valsalva)', category: 'resus', roles: [1, 2, 4, 5, 6, 7], minutes: 0.5, detail: 'strain 15 s semi-recumbent, then lie flat with the legs raised — for a regular narrow-complex tachycardia (SVT); not for a slow rate, other rhythms or a patient in shock' },
  { id: 'hs-ts', label: 'Look for reversible causes (Hs and Ts)', category: 'resus', roles: ALS_RN_MD, minutes: 0.5 },
  { id: 'cool', label: 'Active cooling: undress, cold packs to neck, armpits and groin, mist and fan', category: 'resus', roles: [1, 2, 4, 5, 6, 7], minutes: 1, repeatable: true, maxTimes: 2, detail: 'for hyperthermia (stimulants, heat illness) — not for a normal temperature; after ROSC, temperature control in hospital' },
  { id: 'restrain', label: 'Soft restraints: four points, face up (or on the side), with continuous monitoring', category: 'resus', roles: [1, 2], settings: FIELD, minutes: 1 },
  { id: 'restrain-prone', label: 'Hold the patient face down on the stretcher until calm', category: 'resus', roles: [1, 2], settings: FIELD, minutes: 1 },
  { id: 'sit-up', label: 'Sit the patient up, legs down', category: 'resus', roles: ALL, minutes: 0.2, detail: 'upright, the legs hanging down: less blood returns to a heart that is backing up into the lungs, and the breathing is easier' },
  { id: 'temp-control', label: 'Temperature control after ROSC (32–37.5 °C)', category: 'resus', roles: HOSPITAL_RN_MD, settings: LAB_ED, minutes: 1, detail: 'for a patient who does not follow commands after ROSC: a feedback device, the chosen target held at least 36 hours, fever prevented; no rapid cold IV fluids (2025 AHA)' },
  { id: 'legs-up', label: 'Lay flat and raise the legs', category: 'resus', roles: ALL, minutes: 0.3, detail: 'for a low pressure (a faint, blood loss); not with fluid on the lungs or a patient who cannot breathe lying flat' },

  // Procedures (cath lab; the ER doctor drains the pericardium at the bedside)
  { id: 'timeout', label: 'Procedural time-out', category: 'procedure', roles: [3, 4, 5], settings: LAB, minutes: 1 },
  { id: 'consent', label: 'Confirm consent, contrast allergy and anticoagulants', category: 'procedure', roles: [4, 5], settings: LAB, minutes: 1, detail: 'the signed consent; an earlier reaction to contrast (shellfish and iodine allergies do not count), anticoagulants, metformin and the kidney function' },
  { id: 'prep', label: 'Prep and drape the radial and femoral sites', category: 'procedure', roles: [3, 4], settings: LAB, minutes: 2 },
  { id: 'access', label: 'Arterial access (radial first)', category: 'procedure', roles: [5], settings: LAB, minutes: 2 },
  { id: 'angio', label: 'Diagnostic coronary angiography (standard views of both coronaries)', category: 'procedure', roles: [5], settings: LAB, minutes: 4 },
  { id: 'reposition', label: 'Disengage and reposition the catheter (or the pacing wire)', category: 'procedure', roles: [5], settings: LAB, minutes: 0.3 },
  { id: 'access-femoral', label: 'Femoral arterial access (ultrasound-guided)', category: 'procedure', roles: [5], settings: LAB, minutes: 2 },
  { id: 'access-venous', label: 'Femoral venous access', category: 'procedure', roles: [5], settings: LAB, minutes: 2 },
  { id: 'balloon-tamponade', label: 'Inflate a balloon over the perforation', category: 'procedure', roles: TECH_MD, settings: LAB, minutes: 1, detail: 'low pressure, 5–10 minutes' },
  { id: 'pericardiocentesis', label: 'Pericardiocentesis (echo-guided)', category: 'procedure', roles: TECH_MD_ED, settings: LAB_ED, minutes: 3, detail: 'not in a type A dissection: surgery drains it — a small, controlled drainage only as a bridge when arrest is imminent (2022 ACC/AHA)' },
  { id: 'closure-device', label: 'Femoral closure device', category: 'procedure', roles: [5], settings: LAB, minutes: 1, detail: 'femoral only, after a femoral angiogram: puncture in the common femoral artery above the bifurcation and below the inguinal ligament, vessel big enough, no heavy calcium or hematoma' },
  // the cardiologist aspirates and flushes; the tech holds the syringe tip-down, back-bleeds the guide and keeps the line free of air
  { id: 'clear-air', label: 'Clear coronary air: aspirate back through the guide, then a forceful saline flush', category: 'procedure', roles: TECH_MD, settings: LAB, minutes: 0.5, repeatable: true, maxTimes: 3, detail: 'with 100 % oxygen; repeat until the bubbles are gone and flow is back' },

  // Catheters, wires & devices: the tech opens, prepares and hands them; the cardiologist uses them
  { id: 'cath-tiger', label: 'Tiger (TIG) diagnostic catheter — both coronaries from the radial', category: 'devices', roles: TECH_MD, settings: LAB, minutes: 0.5 },
  { id: 'cath-jl4', label: 'JL4 diagnostic catheter — left coronary', category: 'devices', roles: TECH_MD, settings: LAB, minutes: 0.5 },
  { id: 'cath-jr4', label: 'JR4 diagnostic catheter — right coronary', category: 'devices', roles: TECH_MD, settings: LAB, minutes: 0.5 },
  { id: 'cath-pigtail', label: 'Pigtail catheter — LV gram and LVEDP', category: 'devices', roles: TECH_MD, settings: LAB, minutes: 0.5, detail: CROSS_THE_VALVE },
  { id: 'guide-ebu', label: 'EBU 3.5 guide — left system, extra back-up', category: 'devices', roles: TECH_MD, settings: LAB, minutes: 1 },
  { id: 'guide-jr4', label: 'JR4 guide — right coronary', category: 'devices', roles: TECH_MD, settings: LAB, minutes: 1 },
  { id: 'guide-al1', label: 'AL1 guide — right coronary with extra support', category: 'devices', roles: TECH_MD, settings: LAB, minutes: 1 },
  { id: 'wire-workhorse', label: '0.014" workhorse coronary wire', category: 'devices', roles: TECH_MD, settings: LAB, minutes: 1, repeatable: true },
  { id: 'wire-hydrophilic', label: '0.014" hydrophilic (polymer-jacketed) wire', category: 'devices', roles: TECH_MD, settings: LAB, minutes: 1, repeatable: true },
  { id: 'aspiration', label: 'Aspiration thrombectomy catheter', category: 'devices', roles: TECH_MD, settings: LAB, minutes: 1, detail: 'bail-out for a large thrombus only; routine use: no benefit, more strokes (TOTAL)' },
  { id: 'balloon-predil', label: 'Compliant balloon — pre-dilation', category: 'devices', roles: TECH_MD, settings: LAB, minutes: 1, detail: '2.5 × 15 mm at nominal pressure', repeatable: true },
  { id: 'stent-des', label: 'Drug-eluting stent', category: 'devices', roles: TECH_MD, settings: LAB, minutes: 2, detail: 'sized to the reference vessel', repeatable: true },
  { id: 'balloon-nc', label: 'Non-compliant balloon — post-dilation', category: 'devices', roles: TECH_MD, settings: LAB, minutes: 1, detail: '1:1 with the stent, high pressure', repeatable: true },
  { id: 'stent-covered', label: 'Covered (PTFE) stent', category: 'devices', roles: TECH_MD, settings: LAB, minutes: 2 },
  { id: 'iabp', label: 'Intra-aortic balloon pump (IABP)', category: 'devices', roles: TECH_MD, settings: LAB, minutes: 6, detail: 'not routine in infarct shock (2025 ACC/AHA: no benefit); not with moderate or severe aortic regurgitation, an aortic dissection or severe iliofemoral disease' },
  { id: 'impella', label: 'Impella CP (percutaneous LV pump)', category: 'devices', roles: TECH_MD, settings: LAB, minutes: 5, detail: 'selected STEMI shock (2025 ACC/AHA 2a); not with an LV clot, a mechanical aortic valve, severe aortic stenosis, moderate or worse regurgitation, a VSD, a free-wall rupture or tamponade, a failing RV, an aortic dissection or severe PAD; full heparin' },
  // the cath lab under fluoroscopy; the ER doctor at the bedside through a central line (ECG- or ultrasound-guided)
  { id: 'temp-wire', label: 'Temporary transvenous pacing wire', category: 'devices', roles: TECH_MD_ED, settings: LAB_ED, minutes: 3, detail: 'pads on first; through a compressible vein (femoral, or internal jugular under ultrasound); not through a mechanical tricuspid valve' },
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
  { id: 'notify', label: 'Radio report to the receiving hospital', category: 'team', roles: [1, 2], settings: FIELD, minutes: 1, repeatable: true, maxTimes: 2 },
  // the far destination in every field case: the STEMI's cath lab, a pacing wire, cardiac surgery, the ICU, emergency
  // dialysis. The STEMI cases call it the "PCI-capable heart center" (briefing, critical step, hint): the detail carries that
  // name for the search
  { id: 'transport-pci', label: 'Transport to the regional heart center (PCI, pacing, dialysis)', category: 'team', roles: [1, 2], settings: FIELD, minutes: 2, detail: 'PCI-capable: a cath lab, cardiac surgery, transvenous pacing, emergency dialysis and an ICU — the region\'s cardiac arrest center, with ECMO, a PE response team and the VAD program' },
  { id: 'transport-near', label: 'Transport to the nearest emergency department', category: 'team', roles: [1, 2], settings: FIELD, minutes: 2 },
  // Emergency department: the nurse reports to the physician; the physician consults, activates the lab and decides where
  // the patient goes (the 'dispo' flag: the hand-off waits for it)
  { id: 'notify-physician', label: 'Report to the ED physician (SBAR, closed loop)', category: 'team', roles: ED_RN, settings: ED, minutes: 0.5, repeatable: true, detail: 'what changed, what you found and gave, what you need: a new 12-lead, a pressure, a rhythm' },
  { id: 'cath-lab-activate', label: 'Activate the cath lab (STEMI alert from the ED)', category: 'team', roles: ED_MD, settings: ED, minutes: 0.5, detail: 'one call brings in the interventional cardiologist and the lab team; the goal is arrival to device within 90 minutes' },
  { id: 'consult-cardiology', label: 'Consult cardiology', category: 'team', roles: ED_MD, settings: ED, minutes: 1, repeatable: true, maxTimes: 2, detail: 'the question, the 12-lead and the findings, physician to physician' },
  { id: 'admit', label: 'Admit (CCU, ICU or a monitored bed)', category: 'team', roles: ED_MD, settings: ED, minutes: 1, detail: 'the admitting team accepts; the patient stays on the monitor with a nurse until the bed is ready' },
  { id: 'discharge', label: 'Discharge home with follow-up', category: 'team', roles: ED_MD, settings: ED, minutes: 1, detail: 'only when the workup has ruled out what could kill: instructions, the follow-up booked, and what should bring the patient back' },
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
