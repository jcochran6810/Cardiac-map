/**
 * Scope-of-practice definitions for the seven learner roles.
 *
 * Every piece of role-specific guidance in CardioSim (level notes, case-decision ownership,
 * monitor/defibrillator permissions, quiz levels) must stay inside these boundaries.
 *
 * Frameworks (US):
 *  - EMT / Paramedic: National EMS Scope of Practice Model 2019 (NHTSA, DOT HS 813 151, incl.
 *    change notices 1.0 and 2.0), the basis of NREMT certification. Actual authority comes from
 *    state licensure, local protocols and medical direction.
 *  - Cath lab tech (RCIS): Cardiovascular Credentialing International credential; roles described
 *    in the SCAI expert consensus update on best practices in the cardiac catheterization
 *    laboratory (2021) and the SICP/ACVP scope statements; state law and facility policy govern
 *    medication administration and fluoroscopy operation.
 *  - Cath lab nurse (RN): state Nurse Practice Act and Board of Nursing rulings (e.g. moderate
 *    procedural sedation only on a practitioner's order with the practitioner immediately
 *    available), plus facility policy and competency validation.
 *  - Cardiologist: physician licensure plus hospital credentialing and privileges (interventional,
 *    electrophysiology and structural procedures require specific privileges).
 *  - ER nurse (RN in the emergency department): the state Nurse Practice Act and Board of Nursing rulings, the ENA
 *    Scope and Standards of Emergency Nursing Practice, and facility policy, standing orders and competency
 *    validation. Medications on a provider's order or a standing order / protocol (ACLS); manual defibrillation per
 *    ACLS; synchronized cardioversion and transcutaneous pacing per ACLS and policy; procedural sedation drugs only on
 *    the physician's order with the physician at the bedside. No diagnosis or prescribing, and no physician procedures
 *    (intubation, central lines, pericardiocentesis, transvenous pacing). The cath lab is activated by the physician.
 *  - ER doctor (emergency physician, MD/DO): medical licensure, board certification in emergency medicine (ABEM or
 *    AOBEM), hospital credentialing and privileges, ACEP policy statements (e.g. procedural sedation, emergency
 *    ultrasound). Diagnoses and treats, intubates, places central lines, sedates, cardioverts, paces (transcutaneous
 *    and transvenous), performs emergent pericardiocentesis, decides on fibrinolysis, activates the cath lab and
 *    consults cardiology. Cath lab procedures (angiography, PCI, mechanical support) belong to the cardiologist.
 */
import type { LearningLevel } from '@/store/useAppStore';

export interface ScopeDef {
  level: LearningLevel;
  role: string;
  credential: string;
  framework: string;
  can: string[];
  mustNot: string[];
  /** who this role escalates to */
  escalateTo: string;
}

export const SCOPES: Record<LearningLevel, ScopeDef> = {
  1: {
    level: 1,
    role: 'EMT',
    credential: 'NREMT-certified EMT (Basic Life Support)',
    framework: 'National EMS Scope of Practice Model (NHTSA 2019) · state licensure · local protocols · medical direction',
    can: [
      'Scene safety, primary and secondary assessment, vital signs',
      'High-quality CPR, AED use, airway adjuncts and bag-valve-mask ventilation, oxygen, CPAP per protocol',
      'Aspirin for suspected acute coronary syndrome, per protocol',
      "Assist with the patient's own prescribed nitroglycerin, per protocol and medical direction",
      'Epinephrine auto-injector (anaphylaxis), naloxone, oral glucose, inhaled bronchodilator for wheezing, blood glucose check, per protocol',
      'Acquire and transmit a 12-lead ECG where protocols allow (no interpretation)',
      'Early notification, destination decisions and transport per protocol',
    ],
    mustNot: [
      'Interpret ECG rhythms or 12-leads',
      'Manual defibrillation, synchronized cardioversion or transcutaneous pacing',
      'IV/IO access or IV medications; ACLS drugs',
      'Advanced airways beyond the state-approved EMT scope',
    ],
    escalateTo: 'Paramedic / ALS intercept and online medical direction',
  },
  2: {
    level: 2,
    role: 'Paramedic',
    credential: 'NREMT-certified Paramedic (Advanced Life Support)',
    framework: 'National EMS Scope of Practice Model (NHTSA 2019) · state licensure · local protocols · medical direction',
    can: [
      'Everything in the EMT scope',
      'Cardiac monitoring, rhythm and 12-lead ECG interpretation, STEMI recognition and activation',
      'Manual defibrillation, synchronized cardioversion and transcutaneous pacing',
      'IV/IO access and ACLS medications per protocol (e.g. epinephrine, amiodarone, lidocaine, adenosine, atropine)',
      'Advanced airway management, needle decompression, per protocol',
      'Interfacility transport monitoring within protocol and medical direction',
    ],
    mustNot: [
      'Act outside written protocols or without online medical direction where required',
      'Fibrinolytic or other system-specific therapies unless the EMS system protocol authorizes them',
      'Make in-hospital diagnostic or treatment decisions (e.g. choose PCI strategy)',
    ],
    escalateTo: 'Online medical direction; receiving physician / cath lab team',
  },
  3: {
    level: 3,
    role: 'Cath Lab Tech',
    credential: 'Registered Cardiovascular Invasive Specialist (RCIS, CCI) or equivalent cardiovascular technologist',
    framework: 'RCIS credential · SCAI best-practices consensus (2021) · SICP/ACVP scope · state law · facility policy',
    can: [
      'Room and patient preparation, sterile field, time-out participation',
      'Scrub assisting: prepare and hand catheters, wires, balloons and stents, and manipulate them only as directed by the operator',
      'Circulating: supplies, equipment, documentation',
      'Hemodynamic monitoring and recording: transducers, waveform recognition, calculations (CO, gradients, valve areas, shunts)',
      'ECG monitoring and arrhythmia recognition; alert the operator immediately',
      'Operate ancillary equipment (IVUS/OCT/FFR consoles, power injector, IABP console) under supervision',
      'Radiation safety (ALARA); positioning/panning where state law permits',
      'BLS/ACLS participation per certification and facility policy',
      'Medications only on a physician order and only where state law and facility policy permit',
    ],
    mustNot: [
      'Perform the procedure as operator or select the treatment strategy',
      'Diagnose or interpret studies for clinical decisions',
      'Give medications without an order, or moderate sedation independently',
      'Operate fluoroscopy where state law reserves it for licensed personnel',
    ],
    escalateTo: 'Operating physician (and RN for sedation / medications)',
  },
  4: {
    level: 4,
    role: 'Cath Lab Nurse',
    credential: 'Registered Nurse (cath lab / cardiac, often CCRN, CV-BC or RCIS)',
    framework: 'State Nurse Practice Act · Board of Nursing rulings · facility policy · competency validation',
    can: [
      'Nursing assessment before, during and after the procedure; verify consent, allergies, renal function, anticoagulants',
      'IV access; administer medications on physician order (anticoagulants, antiplatelets, vasoactives, antiarrhythmics)',
      "Moderate procedural sedation on the practitioner's order with the practitioner present; continuous monitoring incl. capnography",
      'Monitor anticoagulation (e.g. ACT), hemodynamics, rhythm and level of consciousness',
      'Recognize and respond to complications (bleeding, vagal reaction, contrast reaction, tamponade, stroke), ACLS',
      'Sheath removal and hemostasis per protocol and validated competency; access-site care',
      'Patient and family education; post-procedure care and handoff',
    ],
    mustNot: [
      'Make medical diagnoses, prescribe or select treatment',
      'Perform the procedure or manipulate devices as operator',
      'Deep sedation or general anesthesia (anesthesia professional only)',
      'Give medications without an order (except per approved standing protocols such as ACLS)',
    ],
    escalateTo: 'Operating / attending physician',
  },
  5: {
    level: 5,
    role: 'Cardiologist',
    credential: 'Physician — general, interventional, electrophysiology or structural cardiology',
    framework: 'Medical licensure · board certification · hospital credentialing and procedural privileges',
    can: [
      'Diagnosis, risk stratification and treatment decisions',
      'Perform diagnostic and interventional procedures within credentialed privileges',
      'Device, strategy and pharmacotherapy selection; complication management',
      'Full technical depth: guideline classes, trial evidence, hemodynamic and imaging criteria',
    ],
    mustNot: [
      'Perform procedures outside granted privileges (e.g. structural or EP procedures without those privileges)',
    ],
    escalateTo: 'Heart team, cardiac surgery, anesthesia, critical care as needed',
  },
  6: {
    level: 6,
    role: 'ER Nurse',
    credential: 'Registered Nurse in the emergency department (often CEN; ACLS, TNCC, PALS or ENPC)',
    framework: 'State Nurse Practice Act · Board of Nursing rulings · ENA Scope and Standards of Emergency Nursing Practice · facility policy, standing orders and competency validation',
    can: [
      'Triage (Emergency Severity Index) and nursing assessment; recognize the time-critical patient and bring the physician to the bedside',
      'A 12-lead ECG within 10 minutes of arrival for chest pain or its equivalents, shown to the physician at once; cardiac monitoring and rhythm recognition',
      'IV access (and IO per policy and competency), blood draws and point-of-care tests',
      "Medications on a provider's order or a standing order / ED protocol (e.g. aspirin and nitroglycerin for chest pain, the ACLS drugs during a code): know the dose, the rate and what to monitor",
      'Manual defibrillation per ACLS; synchronized cardioversion and transcutaneous pacing per ACLS and facility policy, with the physician directing',
      'Oxygen, bag-mask ventilation, and CPAP or BiPAP on order or by respiratory protocol; assist the physician with intubation and bedside procedures',
      "For procedural sedation: give the sedation drugs on the physician's order with the physician at the bedside, and monitor the patient throughout (capnography, airway, vital signs)",
      'Take the EMS hand-off, prepare the patient for the cath lab, CT or transfer, and hand off to the next team',
    ],
    mustNot: [
      'Make a medical diagnosis or prescribe; give a medication without an order or an approved standing order / protocol',
      'Physician procedures: intubation, central lines, pericardiocentesis, transvenous pacing (assist and monitor instead)',
      'Decide on fibrinolysis, cath lab activation or admission — the physician decides',
      'Choose or direct deep sedation or anesthesia (a credentialed physician or anesthesia professional only)',
    ],
    escalateTo: 'The ED physician (and the charge nurse); in a code, the ED resuscitation team led by the ED physician',
  },
  7: {
    level: 7,
    role: 'ER Physician',
    credential: 'Emergency physician (MD/DO), board certified or eligible in emergency medicine (ABEM or AOBEM)',
    framework: 'Medical licensure · board certification (ABEM / AOBEM) · hospital credentialing and privileges · ACEP policy statements',
    can: [
      'Diagnosis, risk stratification and disposition: admit, transfer, discharge, or send the patient to the cath lab',
      'Read the 12-lead and act on it: activate the cath lab for STEMI or occlusion MI, or give a fibrinolytic when PCI cannot happen in time',
      'Order and dose every ED medication: ACLS drugs, antiplatelets, anticoagulants, fibrinolytics, vasoactive infusions',
      'Airway management including rapid sequence intubation; procedural sedation (ACEP policy)',
      'Central venous and arterial lines, point-of-care ultrasound (bedside echo), emergent pericardiocentesis',
      'Defibrillation, synchronized cardioversion, and transcutaneous and transvenous pacing',
      'Order imaging (chest X-ray, CT and CT angiography) and labs; consult cardiology, cardiothoracic surgery and critical care',
      'Lead the resuscitation team',
    ],
    mustNot: [
      'Cath lab procedures: coronary angiography, PCI, mechanical circulatory support (interventional cardiology)',
      'Permanent pacemakers, ICDs and other electrophysiology or structural procedures',
      'Anything outside the hospital privileges granted',
    ],
    escalateTo: 'Cardiology and interventional cardiology, cardiothoracic surgery, critical care, anesthesia as needed',
  },
};

export function roleOf(level: LearningLevel): string {
  return SCOPES[level].role;
}

// ─── The monitor-defibrillator ─────────────────────────────────────────────

/**
 * May this role use the defibrillator's manual functions — manual defibrillation, synchronized cardioversion and
 * transcutaneous pacing? The EMT uses the AED (and does CPR); the rest are ALS skills (the ER nurse per ACLS and
 * facility policy, the physician directing cardioversion and pacing).
 */
export function canUseManualDefib(level: LearningLevel): boolean {
  return level !== 1;
}

/**
 * On whose authority this role gives the ACLS drugs during a code: null for the EMT (outside the scope), '' for the
 * physician (their own), otherwise the order or protocol it needs.
 */
export function drugAuthority(level: LearningLevel): string | null {
  switch (level) {
    case 1: return null;
    case 2: return 'per protocol / medical direction';
    case 3: return "on the physician's order (where state law and facility policy permit)";
    case 4: return "on the physician's order / ACLS protocol";
    case 5: return '';
    case 6: return "on a provider's order, a standing order or the ED's ACLS protocol";
    case 7: return '';
  }
}
