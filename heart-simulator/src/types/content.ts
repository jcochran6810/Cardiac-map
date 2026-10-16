/**
 * Shared educational content schema.
 *
 * Every content item (structure, condition, procedure, medication) is written
 * as arrays of short, self-contained bullet strings so the info panel can
 * render them consistently. `levelNotes` gives one focused sentence per
 * learner level so the level selector changes what is emphasised.
 */

/** One sentence per learner level: [EMT, Paramedic, ED/ICU, Cardiology, Interventional/EP/Structural] */
export type LevelNotes = [string, string, string, string, string];

export type StructureGroup =
  | 'chambers'
  | 'septa'
  | 'valves'
  | 'great-vessels'
  | 'layers'
  | 'subvalvular'
  | 'coronary'
  | 'conduction';

export interface StructureContent {
  id: string;
  name: string;
  group: StructureGroup;
  synonyms: string[];
  /** 1–2 sentence plain-language summary */
  summary: string;
  levelNotes: LevelNotes;
  overview: string[];
  anatomy: string[];
  physiology: string[];
  /** Pathology, signs/symptoms and complications relevant to this structure */
  clinical: string[];
  ecg: string[];
  imaging: string[];
  procedures: string[];
  /** Pearls, mnemonics and common misconceptions */
  teaching: string[];
  /** e.g. "LAD septal perforators (anterior 2/3) and PDA (posterior 1/3)" */
  bloodSupply?: string;
  /** Condition IDs (see CONDITION_IDS) */
  relatedConditions: string[];
  /** Procedure IDs (see PROCEDURE_IDS) */
  relatedProcedures: string[];
}

export interface ConditionContent {
  id: string;
  name: string;
  category: string;
  synonyms: string[];
  summary: string;
  levelNotes: LevelNotes;
  overview: string[];
  anatomy: string[];
  pathophysiology: string[];
  /** Signs and symptoms */
  symptoms: string[];
  ecg: string[];
  imaging: string[];
  medications: string[];
  /** EMT / paramedic prehospital care */
  fieldCare: string[];
  /** ED / ICU care */
  hospitalCare: string[];
  cardiologyCare: string[];
  procedure: string[];
  complications: string[];
  teaching: string[];
  /** Findings that demand immediate escalation */
  redFlags: string[];
  /** Structure IDs to highlight in 3D (see STRUCTURE_IDS) */
  affectedStructures: string[];
  relatedProcedures: string[];
  relatedMedications: string[];
}

export interface ProcedureStepContent {
  title: string;
  description: string;
}

export interface ProcedureContent {
  id: string;
  name: string;
  category: string;
  summary: string;
  levelNotes: LevelNotes;
  overview: string[];
  indications: string[];
  contraindications: string[];
  anatomy: string[];
  accessSite: string;
  steps: ProcedureStepContent[];
  /** ECG / rhythm considerations during and after the procedure */
  ecg: string[];
  equipment: string[];
  complications: string[];
  postCare: string[];
  teaching: string[];
  targetStructures: string[];
  relatedConditions: string[];
}

export interface MedicationContent {
  id: string;
  name: string;
  brandNames: string[];
  drugClass: string;
  summary: string;
  levelNotes: LevelNotes;
  mechanism: string[];
  indications: string[];
  /** Typical adult dosing, clearly educational (verify with local protocol) */
  dosing: string[];
  contraindications: string[];
  adverseEffects: string[];
  ecgEffects: string[];
  hemodynamics: string[];
  monitoring: string[];
  interactions: string[];
  teaching: string[];
  relatedConditions: string[];
}

export type QuizTopic =
  | 'anatomy'
  | 'physiology'
  | 'ecg'
  | 'rhythm-id'
  | 'conduction'
  | 'coronary'
  | 'ischemia'
  | 'arrhythmia'
  | 'acls'
  | 'pharmacology'
  | 'hemodynamics'
  | 'valvular'
  | 'heart-failure'
  | 'cardiomyopathy'
  | 'pericardial'
  | 'congenital'
  | 'procedures';

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  /** Minimum learner level this question targets (1 = EMT … 5 = interventional/EP) */
  level: 1 | 2 | 3 | 4 | 5;
  topic: QuizTopic;
  /** When set, the live ECG monitor switches to this ECG profile while the question is shown */
  ecgProfile?: string;
  /** Heart rate to display with ecgProfile */
  heartRate?: number;
  /** Structure / condition / procedure IDs for "learn more" links */
  relatedIds?: string[];
}

export interface CaseDecisionOption {
  text: string;
  correct: boolean;
  feedback: string;
}

export interface CaseDecision {
  id: string;
  /** Short stage label, e.g. "Initial assessment", "10 minutes later" */
  stage: string;
  prompt: string;
  /** Optional vitals/ECG change revealed at this decision point */
  update?: string;
  options: CaseDecisionOption[];
}

// ─── Canonical ID lists (shared by content files, UI and 3D scene) ──────────

export const STRUCTURE_IDS = [
  // chambers
  'right-atrium', 'left-atrium', 'right-ventricle', 'left-ventricle', 'right-atrial-appendage', 'left-atrial-appendage',
  // septa & landmarks
  'interatrial-septum', 'fossa-ovalis', 'interventricular-septum', 'apex', 'base-of-heart',
  // valves
  'tricuspid-valve', 'pulmonary-valve', 'mitral-valve', 'aortic-valve',
  // great vessels
  'svc', 'ivc', 'coronary-sinus', 'pulmonary-trunk', 'pulmonary-veins', 'ascending-aorta', 'aortic-arch', 'descending-aorta',
  // layers
  'fibrous-pericardium', 'epicardium', 'myocardium', 'endocardium',
  // subvalvular & internal
  'anterolateral-papillary-muscle', 'posteromedial-papillary-muscle', 'chordae-tendineae', 'moderator-band', 'crista-terminalis',
  // coronary arteries
  'lmca', 'lad-proximal', 'lad-mid', 'lad-distal', 'd1', 'd2', 'septal-perforators', 'ramus-intermedius',
  'lcx-proximal', 'lcx-distal', 'om1', 'om2',
  'rca-proximal', 'rca-mid', 'rca-distal', 'conus-branch', 'sa-nodal-artery', 'am-branch', 'pda', 'posterolateral-branch', 'av-nodal-artery',
  // conduction
  'sa-node', 'bachmanns-bundle', 'av-node', 'bundle-of-his', 'right-bundle-branch', 'left-bundle-branch',
  'left-anterior-fascicle', 'left-posterior-fascicle', 'purkinje-fibers',
] as const;

export const CONDITION_IDS = [
  // rhythm
  'normal-sinus-rhythm', 'sinus-bradycardia', 'sinus-tachycardia', 'atrial-fibrillation', 'atrial-flutter', 'avnrt', 'wpw-syndrome', 'junctional-rhythm',
  // AV block
  'first-degree-av-block', 'mobitz-type-i', 'mobitz-type-ii', 'third-degree-av-block',
  // bundle branch blocks
  'right-bundle-branch-block', 'left-bundle-branch-block', 'bifascicular-block',
  // ventricular
  'pvcs', 'monomorphic-vt', 'ventricular-fibrillation', 'torsades-de-pointes',
  // ischemia
  'anterior-stemi', 'inferior-stemi', 'lateral-stemi', 'nstemi', 'wellens-pattern',
  // cardiomyopathy
  'dilated-cardiomyopathy', 'hcm', 'takotsubo',
  // heart failure
  'hfref', 'hfpef', 'cardiogenic-shock',
  // valvular
  'aortic-stenosis', 'mitral-regurgitation', 'mitral-stenosis',
  // pericardial
  'acute-pericarditis', 'cardiac-tamponade',
  // congenital
  'asd', 'vsd', 'pfo',
  // systemic & device
  'pulmonary-embolism', 'aortic-dissection', 'hyperkalemia', 'paced-rhythm',
] as const;

export const PROCEDURE_IDS = [
  // cath lab
  'coronary-angiography', 'left-heart-cath', 'right-heart-cath', 'ffr-ifr', 'ivus-oct', 'pci-stent',
  'rotational-atherectomy', 'intravascular-lithotripsy', 'iabp-placement', 'impella-placement',
  // electrophysiology & devices
  'ep-study', 'catheter-ablation', 'pacemaker-implantation', 'leadless-pacemaker', 'his-bundle-pacing',
  'icd-implantation', 'crt-implantation', 'lead-extraction',
  // structural
  'tavr', 'mitraclip-teer', 'laa-occlusion', 'asd-closure', 'pfo-closure', 'bav', 'bmv',
  'alcohol-septal-ablation', 'paravalvular-leak-closure',
  // vascular
  'peripheral-angiography', 'peripheral-intervention', 'carotid-stenting', 'catheter-directed-thrombolysis', 'ivc-filter',
  // surgical
  'cabg', 'valve-surgery', 'lvad-implantation', 'heart-transplant',
  // emergency & bedside
  'defibrillation', 'cardioversion', 'temporary-pacing', 'pericardiocentesis', 'ecmo-cannulation', 'endomyocardial-biopsy',
] as const;

export const MEDICATION_IDS = [
  // antiplatelets / anticoagulants / lytics
  'aspirin', 'clopidogrel', 'ticagrelor', 'prasugrel', 'heparin', 'enoxaparin', 'bivalirudin', 'apixaban', 'warfarin', 'tenecteplase',
  // anti-ischemic
  'nitroglycerin', 'fentanyl', 'metoprolol', 'esmolol',
  // antiarrhythmics & rate control
  'adenosine', 'diltiazem', 'amiodarone', 'procainamide', 'lidocaine', 'digoxin', 'magnesium-sulfate',
  // ACLS / pressors / inotropes
  'atropine', 'epinephrine', 'norepinephrine', 'vasopressin', 'phenylephrine', 'dopamine', 'dobutamine', 'milrinone',
  // heart failure & chronic
  'furosemide', 'lisinopril', 'sacubitril-valsartan', 'spironolactone', 'empagliflozin', 'atorvastatin',
  // electrolytes / other
  'calcium-chloride', 'sodium-bicarbonate', 'colchicine',
] as const;

/**
 * ECG profile IDs understood by the waveform engine (src/lib/ecg).
 * Used by conditions, cases and quiz questions.
 */
export const ECG_PROFILE_IDS = [
  'normal-sinus', 'sinus-bradycardia', 'sinus-tachycardia', 'atrial-fibrillation', 'atrial-flutter', 'avnrt', 'wpw', 'junctional',
  'first-degree-avb', 'mobitz-i', 'mobitz-ii', 'third-degree-avb',
  'rbbb', 'lbbb', 'bifascicular',
  'pvcs', 'vt', 'vf', 'torsades', 'asystole',
  'anterior-stemi', 'inferior-stemi', 'lateral-stemi', 'nstemi', 'wellens',
  'dcm', 'hcm', 'takotsubo', 'hfref', 'hfpef', 'cardiogenic-shock',
  'aortic-stenosis', 'mitral-regurgitation', 'mitral-stenosis',
  'pericarditis', 'tamponade', 'asd', 'vsd', 'pfo',
  'pulmonary-embolism', 'aortic-dissection', 'hyperkalemia', 'paced',
] as const;

export type StructureId = (typeof STRUCTURE_IDS)[number];
export type ConditionId = (typeof CONDITION_IDS)[number];
export type ProcedureId = (typeof PROCEDURE_IDS)[number];
export type MedicationId = (typeof MEDICATION_IDS)[number];
export type ECGProfileId = (typeof ECG_PROFILE_IDS)[number];
