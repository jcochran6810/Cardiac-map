import type { ViewMode } from '@/store/useAppStore';

/** Which labels appear in each view when "Labels" is on */
export const LABEL_SETS: Record<ViewMode, string[]> = {
  external: [
    'right-atrium', 'right-atrial-appendage', 'left-atrial-appendage', 'left-atrium', 'right-ventricle', 'left-ventricle',
    'svc', 'ivc', 'ascending-aorta', 'aortic-arch', 'descending-aorta', 'pulmonary-trunk', 'pulmonary-veins',
    'lad-proximal', 'lad-mid', 'rca-proximal', 'rca-mid', 'lcx-proximal', 'om1', 'pda', 'coronary-sinus', 'apex',
  ],
  sectioned: [
    'right-atrium', 'left-atrium', 'right-ventricle', 'left-ventricle', 'tricuspid-valve', 'mitral-valve', 'aortic-valve',
    'interventricular-septum', 'interatrial-septum', 'svc', 'ascending-aorta', 'pulmonary-trunk', 'anterolateral-papillary-muscle',
    'moderator-band', 'chordae-tendineae', 'apex',
  ],
  xray: [
    'right-atrium', 'left-atrium', 'right-ventricle', 'left-ventricle', 'tricuspid-valve', 'mitral-valve', 'aortic-valve', 'pulmonary-valve',
    'interventricular-septum', 'interatrial-septum', 'svc', 'ivc', 'ascending-aorta', 'pulmonary-trunk',
  ],
  conduction: [
    'sa-node', 'bachmanns-bundle', 'av-node', 'bundle-of-his', 'right-bundle-branch', 'left-bundle-branch',
    'left-anterior-fascicle', 'left-posterior-fascicle', 'purkinje-fibers',
  ],
  activation: ['right-ventricle', 'left-ventricle', 'apex', 'right-atrial-appendage', 'left-atrial-appendage', 'pulmonary-trunk', 'coronary-sinus'],
  territories: [
    'lad-proximal', 'lad-mid', 'lad-distal', 'd1', 'lcx-proximal', 'om1', 'om2', 'rca-proximal', 'rca-mid', 'rca-distal', 'pda',
    'posterolateral-branch', 'am-branch',
  ],
};
