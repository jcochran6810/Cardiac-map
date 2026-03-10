import { LevelExplanation } from './anatomy';

export type ImagingModality = 'tte' | 'tee' | 'cardiac-ct' | 'cardiac-mri' | 'coronary-cta' | 'angiography' | 'fluoroscopy' | 'chest-xray';

export interface ImagingView {
  id: string;
  viewName: string;
  modality: ImagingModality;
  anatomyShown: string[];
  educationalTargets: string[];
  conditionRelevance: string[];
  procedureRelevance: string[];
  overlayCompatibility: string[];
  cameraPreset: { position: [number, number, number]; target: [number, number, number]; fov: number };
  annotations: string[];
  levelExplanations: LevelExplanation[];
}

export interface ImagingDataset {
  schemaVersion: string;
  description: string;
  views: ImagingView[];
}
