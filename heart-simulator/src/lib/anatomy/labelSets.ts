import type { ViewMode } from '@/store/useAppStore';

/**
 * Which labels appear in each view when "Labels" is on, most important first: a small view (a phone, a
 * half-height drawer) shows only as many as fit without burying the heart.
 */
export const LABEL_SETS: Record<ViewMode, string[]> = {
  external: [
    'right-ventricle', 'left-ventricle', 'right-atrium', 'left-atrium', 'ascending-aorta', 'pulmonary-trunk', 'apex',
    'svc', 'lad-proximal', 'rca-proximal', 'lcx-proximal', 'right-atrial-appendage', 'left-atrial-appendage',
    'ivc', 'aortic-arch', 'descending-aorta', 'pulmonary-veins',
    'lad-mid', 'rca-mid', 'om1', 'pda', 'coronary-sinus',
  ],
  sectioned: [
    'right-atrium', 'left-atrium', 'right-ventricle', 'left-ventricle', 'tricuspid-valve', 'mitral-valve', 'aortic-valve',
    'interventricular-septum', 'ascending-aorta', 'pulmonary-trunk', 'svc', 'interatrial-septum', 'chordae-tendineae',
    'anterolateral-papillary-muscle', 'moderator-band', 'apex',
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
