import { create } from 'zustand';

export interface CameraPreset {
  /** camera direction from the heart centre (world frame: +x patient's left, +y superior, +z anterior) */
  dir: [number, number, number];
  distance?: number;
  label: string;
  short: string;
  group: 'anatomic' | 'angio';
  description?: string;
}

const n = (x: number, y: number, z: number): [number, number, number] => {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
};
const deg = Math.PI / 180;
/** Angiographic projection: rotation (LAO + / RAO −) and angulation (cranial + / caudal −) */
export const angio = (lao: number, cranial: number): [number, number, number] =>
  n(Math.sin(lao * deg) * Math.cos(cranial * deg), Math.sin(cranial * deg), Math.cos(lao * deg) * Math.cos(cranial * deg));

export const CAMERA_PRESETS: CameraPreset[] = [
  { label: 'Anterior', short: 'Front', dir: [0, 0, 1], group: 'anatomic', description: 'Sternocostal surface: RV, LAD, RA appendage' },
  { label: 'Posterior', short: 'Back', dir: [0, 0, -1], group: 'anatomic', description: 'Base: LA, pulmonary veins, coronary sinus, PDA' },
  { label: 'Left Lateral', short: 'Left', dir: [1, 0, 0], group: 'anatomic', description: "Patient's left: LV lateral wall, LAA, circumflex / OMs" },
  { label: 'Right Lateral', short: 'Right', dir: [-1, 0, 0], group: 'anatomic', description: "Patient's right: RA, SVC/IVC, RCA in the AV groove" },
  { label: 'Superior', short: 'Top', dir: n(0, 1, 0.35), group: 'anatomic', description: 'Great vessels and the base from above' },
  { label: 'Inferior', short: 'Bottom', dir: n(0, -1, 0.35), group: 'anatomic', description: 'Diaphragmatic surface: inferior wall, PDA' },
  { label: 'RAO 30°', short: 'RAO', dir: angio(-30, 0), group: 'angio', description: 'Ventriculogram view; LAD and LCx separated' },
  { label: 'LAO 45°', short: 'LAO', dir: angio(45, 0), group: 'angio', description: 'RCA "C" shape; septum in profile (separates LV from RV)' },
  { label: 'RAO Cranial', short: 'RAO Cr', dir: angio(-30, 25), group: 'angio', description: 'Mid/distal LAD and diagonals' },
  { label: 'LAO Cranial', short: 'LAO Cr', dir: angio(40, 25), group: 'angio', description: 'LAD with diagonals; distal RCA/PDA' },
  { label: 'RAO Caudal', short: 'RAO Ca', dir: angio(-25, -25), group: 'angio', description: 'LCx and obtuse marginals; proximal LAD' },
  { label: 'LAO Caudal', short: 'Spider', dir: angio(45, -30), group: 'angio', description: '"Spider" view: left main bifurcation' },
];

interface SceneState {
  selectedStructureId: string | null;
  hoveredStructureId: string | null;
  /** extra structures to emphasise (e.g. a condition's affected anatomy, a procedure's targets) */
  highlightIds: string[];
  cameraPreset: CameraPreset | null;
  /** increments to request the camera to frame the current selection */
  focusNonce: number;
  /** Equivalent C-arm projection of the current 3D view (degrees): LAO + / RAO −, cranial + / caudal − */
  carm: { primary: number; secondary: number };
  /** Activation patterns currently shown (keys into VENT_PATTERNS / ATRIAL_PATTERNS) and their durations */
  activation: { vent: string | null; atria: string | null; qrsMs: number; pMs: number; vFirstMs: number; aFirstMs: number };

  /** `focus: false` (a pick on the heart itself, already in view) selects without moving the camera */
  selectStructure: (id: string | null, focus?: boolean) => void;
  hoverStructure: (id: string | null) => void;
  setHighlights: (ids: string[]) => void;
  setCameraPreset: (preset: CameraPreset | null) => void;
  requestFocus: () => void;
  setCarm: (primary: number, secondary: number) => void;
  setActivation: (a: SceneState['activation']) => void;
}

export const useSceneStore = create<SceneState>((set, get) => ({
  selectedStructureId: null,
  hoveredStructureId: null,
  highlightIds: [],
  cameraPreset: null,
  focusNonce: 0,
  carm: { primary: 0, secondary: 0 },
  activation: { vent: 'normal', atria: 'sinus', qrsMs: 92, pMs: 100, vFirstMs: 20, aFirstMs: 0 },

  selectStructure: (id, focus = true) => set((s) => ({ selectedStructureId: id, focusNonce: id && focus ? s.focusNonce + 1 : s.focusNonce })),
  hoverStructure: (id) => set({ hoveredStructureId: id }),
  setHighlights: (highlightIds) => set({ highlightIds }),
  setCameraPreset: (cameraPreset) => set({ cameraPreset }),
  requestFocus: () => set((s) => ({ focusNonce: s.focusNonce + 1 })),
  setActivation: (activation) => {
    const a = get().activation;
    if (a.vent !== activation.vent || a.atria !== activation.atria || a.qrsMs !== activation.qrsMs || a.pMs !== activation.pMs || a.vFirstMs !== activation.vFirstMs || a.aFirstMs !== activation.aFirstMs) set({ activation });
  },
  setCarm: (primary, secondary) => {
    const c = get().carm;
    if (c.primary !== primary || c.secondary !== secondary) set({ carm: { primary, secondary } });
  },
}));
