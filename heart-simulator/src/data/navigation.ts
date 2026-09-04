/**
 * Navigation trees for the left panel, shared with progress tracking.
 */
import { CASE_DATA } from './caseData';

export const LEVEL_LABELS = ['EMT', 'Paramedic', 'ED/ICU', 'Cardiology', 'Interventional'] as const;

export interface NavItem { id: string; name: string }
export interface NavGroup { category: string; items: NavItem[] }

export const ANATOMY_TREE: NavGroup[] = [
  {
    category: 'Chambers',
    items: [
      { id: 'right-atrium', name: 'Right Atrium' },
      { id: 'left-atrium', name: 'Left Atrium' },
      { id: 'right-ventricle', name: 'Right Ventricle' },
      { id: 'left-ventricle', name: 'Left Ventricle' },
      { id: 'right-atrial-appendage', name: 'Right Atrial Appendage' },
      { id: 'left-atrial-appendage', name: 'Left Atrial Appendage' },
    ],
  },
  {
    category: 'Septa & Landmarks',
    items: [
      { id: 'interatrial-septum', name: 'Interatrial Septum' },
      { id: 'interventricular-septum', name: 'Interventricular Septum' },
      { id: 'fossa-ovalis', name: 'Fossa Ovalis' },
      { id: 'apex', name: 'Apex' },
      { id: 'base-of-heart', name: 'Base of Heart' },
    ],
  },
  {
    category: 'Valves',
    items: [
      { id: 'mitral-annulus', name: 'Mitral Valve' },
      { id: 'aortic-valve-rcc', name: 'Aortic Valve' },
      { id: 'tricuspid-annulus', name: 'Tricuspid Valve' },
      { id: 'pulmonary-valve-cusps', name: 'Pulmonary Valve' },
    ],
  },
  {
    category: 'Great Vessels',
    items: [
      { id: 'ascending-aorta', name: 'Ascending Aorta' },
      { id: 'aortic-arch', name: 'Aortic Arch' },
      { id: 'pulmonary-trunk', name: 'Pulmonary Trunk' },
      { id: 'svc', name: 'Superior Vena Cava' },
      { id: 'ivc', name: 'Inferior Vena Cava' },
    ],
  },
  {
    category: 'Pericardium & Layers',
    items: [
      { id: 'fibrous-pericardium', name: 'Fibrous Pericardium' },
      { id: 'epicardium', name: 'Epicardium' },
      { id: 'myocardium', name: 'Myocardium' },
      { id: 'endocardium', name: 'Endocardium' },
    ],
  },
  {
    category: 'Subvalvular',
    items: [
      { id: 'anterolateral-papillary-muscle', name: 'AL Papillary Muscle' },
      { id: 'posteromedial-papillary-muscle', name: 'PM Papillary Muscle' },
      { id: 'moderator-band', name: 'Moderator Band' },
      { id: 'crista-terminalis', name: 'Crista Terminalis' },
    ],
  },
];

export const CORONARY_TREE: NavGroup[] = [
  {
    category: 'Left Coronary',
    items: [
      { id: 'lmca', name: 'Left Main' },
      { id: 'lad-proximal', name: 'LAD Proximal' },
      { id: 'lad-mid', name: 'LAD Mid' },
      { id: 'lad-distal', name: 'LAD Distal' },
      { id: 'd1', name: 'First Diagonal' },
      { id: 'd2', name: 'Second Diagonal' },
      { id: 'lcx-proximal', name: 'LCx Proximal' },
      { id: 'om1', name: 'OM1' },
      { id: 'om2', name: 'OM2' },
    ],
  },
  {
    category: 'Right Coronary',
    items: [
      { id: 'rca-proximal', name: 'RCA Proximal' },
      { id: 'rca-mid', name: 'RCA Mid' },
      { id: 'rca-distal', name: 'RCA Distal' },
      { id: 'pda', name: 'PDA' },
      { id: 'am-branch', name: 'Acute Marginal' },
    ],
  },
];

export const CONDUCTION_TREE: NavItem[] = [
  { id: 'sa-node', name: 'SA Node' },
  { id: 'av-node', name: 'AV Node' },
  { id: 'bundle-of-his', name: 'Bundle of His' },
  { id: 'right-bundle-branch', name: 'Right Bundle' },
  { id: 'left-bundle-branch', name: 'Left Bundle' },
  { id: 'left-anterior-fascicle', name: 'Left Anterior Fascicle' },
  { id: 'left-posterior-fascicle', name: 'Left Posterior Fascicle' },
  { id: 'purkinje-network-rv', name: 'Purkinje (RV)' },
  { id: 'purkinje-network-lv', name: 'Purkinje (LV)' },
];

/** Short display names for conditions in the navigation list. */
export const CONDITION_SHORT_NAMES: Record<string, string> = {
  'normal-sinus-rhythm': 'Normal Sinus Rhythm',
  'sinus-bradycardia': 'Sinus Bradycardia',
  'sinus-tachycardia': 'Sinus Tachycardia',
  'atrial-fibrillation': 'Atrial Fibrillation',
  'atrial-flutter': 'Atrial Flutter',
  'avnrt': 'AVNRT',
  'wpw-syndrome': 'WPW Syndrome',
  'first-degree-av-block': '1st Degree AV Block',
  'mobitz-type-i': 'Mobitz I (Wenckebach)',
  'mobitz-type-ii': 'Mobitz II',
  'third-degree-av-block': '3rd Degree AV Block',
  'right-bundle-branch-block': 'RBBB',
  'left-bundle-branch-block': 'LBBB',
  'bifascicular-block': 'Bifascicular Block',
  'pvcs': 'PVCs',
  'monomorphic-vt': 'Monomorphic VT',
  'ventricular-fibrillation': 'Ventricular Fibrillation',
  'torsades-de-pointes': 'Torsades de Pointes',
  'anterior-stemi': 'Anterior STEMI',
  'inferior-stemi': 'Inferior STEMI',
  'lateral-stemi': 'Lateral STEMI',
  'nstemi': 'NSTEMI / UA',
  'wellens-pattern': 'Wellens Syndrome',
  'dilated-cardiomyopathy': 'Dilated Cardiomyopathy',
  'hcm': 'Hypertrophic CM',
  'takotsubo': 'Takotsubo',
  'hfref': 'HFrEF',
  'hfpef': 'HFpEF',
  'cardiogenic-shock': 'Cardiogenic Shock',
  'aortic-stenosis': 'Aortic Stenosis',
  'mitral-regurgitation': 'Mitral Regurgitation',
  'mitral-stenosis': 'Mitral Stenosis',
  'acute-pericarditis': 'Acute Pericarditis',
  'cardiac-tamponade': 'Cardiac Tamponade',
  'asd': 'ASD',
  'vsd': 'VSD',
  'pfo': 'PFO',
};

export const CONDITION_CATEGORIES: { cat: string; ids: string[] }[] = [
  { cat: 'Rhythm Disorders', ids: ['normal-sinus-rhythm', 'sinus-bradycardia', 'sinus-tachycardia', 'atrial-fibrillation', 'atrial-flutter', 'avnrt', 'wpw-syndrome'] },
  { cat: 'AV Block', ids: ['first-degree-av-block', 'mobitz-type-i', 'mobitz-type-ii', 'third-degree-av-block'] },
  { cat: 'Bundle Branch Blocks', ids: ['right-bundle-branch-block', 'left-bundle-branch-block', 'bifascicular-block'] },
  { cat: 'Ventricular', ids: ['pvcs', 'monomorphic-vt', 'ventricular-fibrillation', 'torsades-de-pointes'] },
  { cat: 'Ischemia / MI', ids: ['anterior-stemi', 'inferior-stemi', 'lateral-stemi', 'nstemi', 'wellens-pattern'] },
  { cat: 'Cardiomyopathies', ids: ['dilated-cardiomyopathy', 'hcm', 'takotsubo'] },
  { cat: 'Heart Failure', ids: ['hfref', 'hfpef', 'cardiogenic-shock'] },
  { cat: 'Valvular', ids: ['aortic-stenosis', 'mitral-regurgitation', 'mitral-stenosis'] },
  { cat: 'Pericardial', ids: ['acute-pericarditis', 'cardiac-tamponade'] },
  { cat: 'Congenital', ids: ['asd', 'vsd', 'pfo'] },
];

export const CASE_LIST = Object.values(CASE_DATA).map((c) => ({ id: c.id, name: c.title, diff: c.difficulty }));

export const STRUCTURE_NAV_COUNT =
  ANATOMY_TREE.reduce((n, g) => n + g.items.length, 0) +
  CORONARY_TREE.reduce((n, g) => n + g.items.length, 0) +
  CONDUCTION_TREE.length;
