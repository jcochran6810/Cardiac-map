import type { PanelCategory } from '@/store/useAppStore';

export const CORONARY_IDS = [
  'lmca', 'lad-proximal', 'lad-mid', 'lad-distal', 'd1', 'd2', 'septal-perforators', 'ramus-intermedius',
  'lcx-proximal', 'lcx-distal', 'om1', 'om2', 'rca-proximal', 'rca-mid', 'rca-distal', 'conus-branch',
  'sa-nodal-artery', 'am-branch', 'pda', 'posterolateral-branch', 'av-nodal-artery',
];

export const CONDUCTION_IDS = [
  'sa-node', 'bachmanns-bundle', 'av-node', 'bundle-of-his', 'right-bundle-branch', 'left-bundle-branch',
  'left-anterior-fascicle', 'left-posterior-fascicle', 'purkinje-fibers',
];

/** Internal structures best seen in the sectioned (four-chamber) specimen */
export const SECTION_FIRST = new Set([
  'tricuspid-valve', 'mitral-valve', 'aortic-valve', 'interventricular-septum', 'interatrial-septum', 'fossa-ovalis',
  'anterolateral-papillary-muscle', 'posteromedial-papillary-muscle', 'chordae-tendineae', 'moderator-band',
  'crista-terminalis', 'myocardium', 'endocardium',
]);

export function structureCategory(id: string): PanelCategory {
  if (CORONARY_IDS.includes(id)) return 'coronary';
  if (CONDUCTION_IDS.includes(id)) return 'conduction';
  return 'anatomy';
}
