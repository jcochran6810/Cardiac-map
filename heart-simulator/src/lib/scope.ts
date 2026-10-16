/**
 * Scope-of-practice definitions for the five learner roles.
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
      'High-quality CPR, AED use, airway adjuncts and bag-valve-mask ventilation, oxygen',
      'Aspirin for suspected acute coronary syndrome, per protocol',
      "Assist with the patient's own prescribed nitroglycerin, per protocol and medical direction",
      'Epinephrine auto-injector (anaphylaxis), naloxone, oral glucose, per protocol',
      'Acquire and transmit a 12-lead ECG where protocols allow (no interpretation)',
      'Early notification, destination decisions and transport per protocol',
    ],
    mustNot: [
      'Interpret ECG rhythms or 12-leads',
      'Manual defibrillation, synchronised cardioversion or transcutaneous pacing',
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
      'Manual defibrillation, synchronised cardioversion and transcutaneous pacing',
      'IV/IO access and ACLS medications per protocol (e.g. epinephrine, amiodarone, lidocaine, adenosine, atropine)',
      'Advanced airway management, CPAP, needle decompression, per protocol',
      'Interfacility transport monitoring within protocol and medical direction',
    ],
    mustNot: [
      'Act outside written protocols or without online medical direction where required',
      'Fibrinolytic or other system-specific therapies unless the EMS system protocol authorises them',
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
      'Recognise and respond to complications (bleeding, vagal reaction, contrast reaction, tamponade, stroke), ACLS',
      'Sheath removal and hemostasis per protocol and validated competency; access-site care',
      'Patient and family education; post-procedure care and handoff',
    ],
    mustNot: [
      'Make medical diagnoses, prescribe or select treatment',
      'Perform the procedure or manipulate devices as operator',
      'Deep sedation or general anaesthesia (anaesthesia professional only)',
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
    escalateTo: 'Heart team, cardiac surgery, anaesthesia, critical care as needed',
  },
};

export function roleOf(level: LearningLevel): string {
  return SCOPES[level].role;
}
