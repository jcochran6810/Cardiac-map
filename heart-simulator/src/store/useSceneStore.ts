import { create } from 'zustand';

interface CameraPreset {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  label: string;
}

interface SceneState {
  selectedStructureId: string | null;
  hoveredStructureId: string | null;
  multiSelectIds: string[];
  visibleLayers: string[];
  transparencyMap: Record<string, number>;
  clipPlane: { axis: 'x' | 'y' | 'z'; value: number } | null;
  explodedMode: boolean;
  flyThroughMode: boolean;
  isolatedStructureId: string | null;
  cameraPreset: CameraPreset | null;

  selectStructure: (id: string | null) => void;
  hoverStructure: (id: string | null) => void;
  toggleMultiSelect: (id: string) => void;
  clearMultiSelect: () => void;
  setLayerVisibility: (layer: string, visible: boolean) => void;
  setTransparency: (structureId: string, opacity: number) => void;
  setClipPlane: (plane: { axis: 'x' | 'y' | 'z'; value: number } | null) => void;
  toggleExploded: () => void;
  toggleFlyThrough: () => void;
  isolateStructure: (id: string | null) => void;
  setCameraPreset: (preset: CameraPreset | null) => void;
}

const DEFAULT_LAYERS = [
  'fibrous-pericardium', 'epicardium', 'myocardium', 'endocardium',
  'chambers', 'valves', 'great-vessels', 'coronary-arteries',
  'coronary-veins', 'conduction', 'landmarks',
];

export const CAMERA_PRESETS: CameraPreset[] = [
  { position: [0, 0, 5], target: [0, 0, 0], fov: 50, label: 'Anterior' },
  { position: [0, 0, -5], target: [0, 0, 0], fov: 50, label: 'Posterior' },
  { position: [5, 0, 0], target: [0, 0, 0], fov: 50, label: 'Right Lateral' },
  { position: [-5, 0, 0], target: [0, 0, 0], fov: 50, label: 'Left Lateral' },
  { position: [0, 5, 0], target: [0, 0, 0], fov: 50, label: 'Superior' },
  { position: [0, -5, 0], target: [0, 0, 0], fov: 50, label: 'Inferior' },
  { position: [3, 3, 3], target: [0, 0, 0], fov: 50, label: 'RAO Cranial' },
  { position: [-3, 3, 3], target: [0, 0, 0], fov: 50, label: 'LAO Cranial' },
  { position: [3, -3, 3], target: [0, 0, 0], fov: 50, label: 'RAO Caudal' },
  { position: [-3, -3, 3], target: [0, 0, 0], fov: 50, label: 'LAO Caudal' },
];

export const useSceneStore = create<SceneState>((set) => ({
  selectedStructureId: null,
  hoveredStructureId: null,
  multiSelectIds: [],
  visibleLayers: DEFAULT_LAYERS,
  transparencyMap: {},
  clipPlane: null,
  explodedMode: false,
  flyThroughMode: false,
  isolatedStructureId: null,
  cameraPreset: null,

  selectStructure: (id) => set({ selectedStructureId: id }),
  hoverStructure: (id) => set({ hoveredStructureId: id }),
  toggleMultiSelect: (id) => set((s) => ({
    multiSelectIds: s.multiSelectIds.includes(id)
      ? s.multiSelectIds.filter((i) => i !== id)
      : [...s.multiSelectIds, id],
  })),
  clearMultiSelect: () => set({ multiSelectIds: [] }),
  setLayerVisibility: (layer, visible) => set((s) => ({
    visibleLayers: visible
      ? [...s.visibleLayers, layer]
      : s.visibleLayers.filter((l) => l !== layer),
  })),
  setTransparency: (structureId, opacity) => set((s) => ({
    transparencyMap: { ...s.transparencyMap, [structureId]: opacity },
  })),
  setClipPlane: (clipPlane) => set({ clipPlane }),
  toggleExploded: () => set((s) => ({ explodedMode: !s.explodedMode })),
  toggleFlyThrough: () => set((s) => ({ flyThroughMode: !s.flyThroughMode })),
  isolateStructure: (id) => set({ isolatedStructureId: id }),
  setCameraPreset: (cameraPreset) => set({ cameraPreset }),
}));
