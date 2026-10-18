/**
 * 3D anatomical landmarks for the heart models.
 *
 * Coordinates are in the CLOSED model's local frame (verified by rendering a
 * coordinate grid over the model):
 *   +x = patient's LEFT, −x = patient's RIGHT
 *   −y = ANTERIOR,       +y = POSTERIOR
 *   +z = SUPERIOR (base / great vessels), −z = INFERIOR (apex)
 *
 * `surface` landmarks sit on the visible epicardial surface. `internal` ones are
 * inside the closed shell (shown in X-ray / conduction views). `section` gives the
 * position on the cut face of the sectioned (four-chamber) specimen after it has
 * been rotated into the same frame.
 */

export type V3 = [number, number, number];

export interface Landmark {
  id: string;
  name: string;
  /** position on/in the closed heart */
  pos: V3;
  surface: boolean;
  /** position on the sectioned specimen's cut face, if visible there */
  section?: V3;
  /** short label for crowded views */
  short?: string;
}

export const LANDMARKS: Landmark[] = [
  // Chambers
  { id: 'right-atrium', name: 'Right Atrium', short: 'RA', pos: [-0.602, 0.023, 0.104], surface: true, section: [-0.5, 0.165, 0.12] },
  { id: 'left-atrium', name: 'Left Atrium', short: 'LA', pos: [0.052, 0.56, 0.133], surface: true, section: [0.5, 0.078, 0.15] },
  { id: 'right-ventricle', name: 'Right Ventricle', short: 'RV', pos: [-0.17, -0.614, -0.346], surface: true, section: [-0.33, -0.216, -0.5] },
  { id: 'left-ventricle', name: 'Left Ventricle', short: 'LV', pos: [0.614, 0, -0.48], surface: true, section: [0.3, -0.144, -0.5] },
  { id: 'right-atrial-appendage', name: 'Right Atrial Appendage', short: 'RAA', pos: [-0.362, -0.409, 0.082], surface: true },
  { id: 'left-atrial-appendage', name: 'Left Atrial Appendage', short: 'LAA', pos: [0.379, -0.319, 0.149], surface: true },

  // Septa & landmarks
  { id: 'interatrial-septum', name: 'Interatrial Septum', pos: [-0.12, 0.28, 0.08], surface: false, section: [-0.12, -0.354, 0.22] },
  { id: 'fossa-ovalis', name: 'Fossa Ovalis', pos: [-0.14, 0.3, 0.02], surface: false, section: [-0.14, -0.33, 0.12] },
  { id: 'interventricular-septum', name: 'Interventricular Septum', short: 'IVS', pos: [0.06, -0.05, -0.4], surface: false, section: [0.02, -0.309, -0.42] },
  { id: 'apex', name: 'Apex', pos: [0.103, -0.249, -0.983], surface: true, section: [0.05, -0.311, -0.93] },
  { id: 'base-of-heart', name: 'Base of Heart', pos: [0.001, 0.449, 0.358], surface: true },

  // Valves
  { id: 'tricuspid-valve', name: 'Tricuspid Valve', short: 'TV', pos: [-0.3, -0.1, -0.06], surface: false, section: [-0.25, -0.252, -0.15] },
  { id: 'pulmonary-valve', name: 'Pulmonary Valve', short: 'PV', pos: [0.02, -0.38, 0.1], surface: false, section: [0.14, -0.496, 0.22] },
  { id: 'mitral-valve', name: 'Mitral Valve', short: 'MV', pos: [0.2, 0.18, -0.05], surface: false, section: [0.27, -0.095, -0.08] },
  { id: 'aortic-valve', name: 'Aortic Valve', short: 'AV', pos: [-0.06, -0.08, 0.08], surface: false, section: [0.02, -0.366, 0.02] },

  // Great vessels
  { id: 'svc', name: 'Superior Vena Cava', short: 'SVC', pos: [-0.443, 0, 0.66], surface: true, section: [-0.32, -0.166, 0.65] },
  { id: 'ivc', name: 'Inferior Vena Cava', short: 'IVC', pos: [-0.192, 0.416, -0.348], surface: true, section: [-0.6, 0.137, -0.12] },
  { id: 'coronary-sinus', name: 'Coronary Sinus', short: 'CS', pos: [0.047, 0.468, -0.145], surface: true },
  { id: 'pulmonary-trunk', name: 'Pulmonary Trunk', short: 'PT', pos: [0.11, -0.415, 0.261], surface: true, section: [0.32, -0.302, 0.38] },
  { id: 'pulmonary-veins', name: 'Pulmonary Veins', short: 'PVs', pos: [0.533, 0.171, 0.333], surface: true, section: [0.6, -0.14, 0.2] },
  { id: 'ascending-aorta', name: 'Ascending Aorta', short: 'Ao', pos: [-0.05, -0.286, 0.6], surface: true, section: [0.05, -0.387, 0.6] },
  { id: 'aortic-arch', name: 'Aortic Arch', pos: [0.105, -0.064, 1.007], surface: true, section: [0.1, -0.43, 0.9] },
  { id: 'descending-aorta', name: 'Descending Aorta', pos: [0.148, 0.326, 0.739], surface: true },

  // Layers
  { id: 'fibrous-pericardium', name: 'Pericardium (removed)', pos: [-0.422, -0.388, -0.333], surface: true },
  { id: 'epicardium', name: 'Epicardium', pos: [0.367, -0.555, -0.447], surface: true },
  { id: 'myocardium', name: 'Myocardium', pos: [0.36, -0.36, -0.55], surface: false, section: [0.42, -0.17, -0.62] },
  { id: 'endocardium', name: 'Endocardium', pos: [0.22, -0.2, -0.55], surface: false, section: [0.22, -0.185, -0.62] },

  // Subvalvular & internal
  { id: 'anterolateral-papillary-muscle', name: 'Anterolateral Papillary Muscle', short: 'AL PM', pos: [0.3, -0.15, -0.45], surface: false, section: [0.32, -0.1, -0.45] },
  { id: 'posteromedial-papillary-muscle', name: 'Posteromedial Papillary Muscle', short: 'PM PM', pos: [0.15, 0.2, -0.5], surface: false, section: [0.2, -0.139, -0.52] },
  { id: 'chordae-tendineae', name: 'Chordae Tendineae', pos: [0.24, 0.02, -0.25], surface: false, section: [0.27, -0.042, -0.27] },
  { id: 'moderator-band', name: 'Moderator Band', pos: [-0.15, -0.3, -0.5], surface: false, section: [-0.22, -0.111, -0.6] },
  { id: 'crista-terminalis', name: 'Crista Terminalis', pos: [-0.48, 0.05, 0.18], surface: false, section: [-0.52, 0.09, 0.24] },

  // Coronary arteries (epicardial)
  { id: 'lmca', name: 'Left Main Coronary Artery', short: 'LM', pos: [0.12, -0.33, 0.12], surface: false },
  { id: 'lad-proximal', name: 'Proximal LAD', short: 'pLAD', pos: [0.132, -0.506, -0.081], surface: true },
  { id: 'lad-mid', name: 'Mid LAD', short: 'mLAD', pos: [0.105, -0.55, -0.384], surface: true },
  { id: 'lad-distal', name: 'Distal LAD', short: 'dLAD', pos: [0.083, -0.507, -0.786], surface: true },
  { id: 'd1', name: 'First Diagonal (D1)', short: 'D1', pos: [0.308, -0.524, -0.254], surface: true },
  { id: 'd2', name: 'Second Diagonal (D2)', short: 'D2', pos: [0.394, -0.543, -0.583], surface: true },
  { id: 'septal-perforators', name: 'Septal Perforators', pos: [0.1, -0.42, -0.3], surface: false },
  { id: 'ramus-intermedius', name: 'Ramus Intermedius', short: 'RI', pos: [0.334, -0.398, 0.005], surface: true },
  { id: 'lcx-proximal', name: 'Proximal Circumflex (LCx)', short: 'LCx', pos: [0.481, -0.132, -0.012], surface: true },
  { id: 'lcx-distal', name: 'Distal Circumflex', short: 'dLCx', pos: [0.336, 0.324, -0.117], surface: true },
  { id: 'om1', name: 'Obtuse Marginal 1 (OM1)', short: 'OM1', pos: [0.595, 0, -0.292], surface: true },
  { id: 'om2', name: 'Obtuse Marginal 2 (OM2)', short: 'OM2', pos: [0.445, 0.204, -0.437], surface: true },
  { id: 'rca-proximal', name: 'Proximal RCA', short: 'pRCA', pos: [-0.304, -0.466, -0.019], surface: true },
  { id: 'rca-mid', name: 'Mid RCA', short: 'mRCA', pos: [-0.566, -0.157, -0.121], surface: true },
  { id: 'rca-distal', name: 'Distal RCA', short: 'dRCA', pos: [-0.404, 0.549, -0.25], surface: true },
  { id: 'conus-branch', name: 'Conus Branch', pos: [-0.124, -0.545, 0.065], surface: true },
  { id: 'sa-nodal-artery', name: 'SA Nodal Artery', pos: [-0.328, -0.135, 0.364], surface: true },
  { id: 'am-branch', name: 'Acute Marginal Branch', short: 'AM', pos: [-0.453, -0.284, -0.431], surface: true },
  { id: 'pda', name: 'Posterior Descending Artery', short: 'PDA', pos: [0.02, 0.334, -0.362], surface: true },
  { id: 'posterolateral-branch', name: 'Posterolateral Branch', short: 'PLB', pos: [0.19, 0.325, -0.312], surface: true },
  { id: 'av-nodal-artery', name: 'AV Nodal Artery', pos: [-0.143, 0.585, -0.168], surface: true },

  // Conduction system (internal)
  { id: 'sa-node', name: 'SA Node', pos: [-0.37, -0.08, 0.38], surface: false },
  { id: 'bachmanns-bundle', name: "Bachmann's Bundle", pos: [0, -0.12, 0.3], surface: false },
  { id: 'av-node', name: 'AV Node', pos: [-0.1, 0.15, -0.02], surface: false },
  { id: 'bundle-of-his', name: 'Bundle of His', pos: [-0.04, 0.05, -0.1], surface: false },
  { id: 'right-bundle-branch', name: 'Right Bundle Branch', short: 'RBB', pos: [-0.08, -0.12, -0.32], surface: false },
  { id: 'left-bundle-branch', name: 'Left Bundle Branch', short: 'LBB', pos: [0.05, 0, -0.25], surface: false },
  { id: 'left-anterior-fascicle', name: 'Left Anterior Fascicle', short: 'LAF', pos: [0.18, -0.2, -0.4], surface: false },
  { id: 'left-posterior-fascicle', name: 'Left Posterior Fascicle', short: 'LPF', pos: [0.15, 0.15, -0.45], surface: false },
  { id: 'purkinje-fibers', name: 'Purkinje Fibers', pos: [0.15, -0.15, -0.75], surface: false },
];

export const LANDMARK_BY_ID: Record<string, Landmark> = Object.fromEntries(LANDMARKS.map((l) => [l.id, l]));

/** Approximate centre of the heart (for outward directions and camera framing) */
export const HEART_CENTER: V3 = [0.02, 0.0, -0.1];

/**
 * Surface regions used for hover/click identification on the closed model.
 * Each region has several sample points; the nearest sample wins.
 */
export const SURFACE_REGIONS: { id: string; pts: V3[] }[] = [
  { id: 'right-ventricle', pts: [[-0.15, -0.55, -0.32], [-0.3, -0.5, -0.15], [-0.05, -0.58, -0.55], [-0.35, -0.45, -0.45], [-0.15, -0.55, -0.05], [0.0, -0.56, -0.2], [-0.42, -0.3, -0.4], [-0.25, -0.5, -0.6]] },
  { id: 'left-ventricle', pts: [[0.52, 0.0, -0.42], [0.35, -0.42, -0.4], [0.45, -0.3, -0.2], [0.5, 0.25, -0.45], [0.3, 0.45, -0.55], [0.3, -0.35, -0.65], [0.45, 0.15, -0.2], [0.25, 0.3, -0.75], [0.35, -0.2, -0.75]] },
  { id: 'apex', pts: [[0.1, -0.24, -0.95], [0.15, -0.1, -0.92], [0.05, -0.35, -0.88]] },
  { id: 'right-atrium', pts: [[-0.53, 0.02, 0.08], [-0.5, 0.2, 0.0], [-0.55, -0.15, 0.15], [-0.45, 0.25, 0.2], [-0.45, 0.35, -0.15]] },
  { id: 'right-atrial-appendage', pts: [[-0.4, -0.45, 0.1], [-0.3, -0.48, 0.22], [-0.48, -0.35, 0.05]] },
  { id: 'left-atrium', pts: [[0.05, 0.53, 0.12], [0.3, 0.5, 0.1], [-0.15, 0.5, 0.15], [0.2, 0.45, 0.3]] },
  { id: 'left-atrial-appendage', pts: [[0.38, -0.32, 0.15], [0.3, -0.38, 0.28], [0.42, -0.2, 0.05]] },
  { id: 'pulmonary-trunk', pts: [[0.12, -0.46, 0.3], [0.02, -0.45, 0.1], [0.25, -0.38, 0.45], [0.45, -0.25, 0.45]] },
  { id: 'ascending-aorta', pts: [[-0.05, -0.3, 0.6], [-0.1, -0.25, 0.75], [0.0, -0.3, 0.45]] },
  { id: 'aortic-arch', pts: [[0.1, -0.06, 0.94], [0.2, 0.1, 0.9], [0.0, -0.15, 0.92]] },
  { id: 'descending-aorta', pts: [[0.15, 0.33, 0.75], [0.1, 0.35, 0.55]] },
  { id: 'svc', pts: [[-0.3, 0.0, 0.66], [-0.28, -0.1, 0.85], [-0.32, 0.05, 0.5]] },
  { id: 'ivc', pts: [[-0.22, 0.47, -0.38], [-0.3, 0.4, -0.3]] },
  { id: 'pulmonary-veins', pts: [[0.47, 0.15, 0.28], [0.45, 0.25, 0.2], [-0.3, 0.42, 0.22]] },
  { id: 'coronary-sinus', pts: [[0.05, 0.52, -0.15], [0.25, 0.48, -0.15]] },
];

/** Structures by coronary territory (right-dominant circulation) */
export const TERRITORY_STRUCTURES: Record<'LAD' | 'LCx' | 'RCA', string[]> = {
  LAD: ['lmca', 'lad-proximal', 'lad-mid', 'lad-distal', 'd1', 'd2', 'septal-perforators'],
  LCx: ['lmca', 'lcx-proximal', 'lcx-distal', 'om1', 'om2', 'ramus-intermedius'],
  RCA: ['rca-proximal', 'rca-mid', 'rca-distal', 'conus-branch', 'am-branch', 'pda', 'posterolateral-branch', 'av-nodal-artery', 'sa-nodal-artery'],
};

/** ECG profile → culprit territory to light up on the 3D heart */
export const PROFILE_TERRITORY: Record<string, 'LAD' | 'LCx' | 'RCA' | undefined> = {
  'anterior-stemi': 'LAD',
  'cardiogenic-shock': 'LAD',
  wellens: 'LAD',
  'inferior-stemi': 'RCA',
  'inferior-stemi-chb': 'RCA',
  'lateral-stemi': 'LCx',
};
