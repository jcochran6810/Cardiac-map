import { LevelExplanation } from './anatomy';

export type ProcedureCategory = 'diagnostic-cath' | 'coronary-intervention' | 'electrophysiology' | 'device-implant' | 'structural' | 'emergency' | 'pericardial';

export interface ProcedureStep {
  order: number;
  title: string;
  description: string;
  anatomyTargets: string[];
  animationReference: string;
  duration: string;
}

export interface ProcedureObject {
  id: string;
  name: string;
  category: ProcedureCategory;
  indications: string[];
  contraindications: string[];
  anatomyTargets: string[];
  imagingUsed: string[];
  accessSite: string;
  devicesUsed: string[];
  steps: ProcedureStep[];
  hemodynamicGoals: string[];
  ecgChanges: string[];
  possibleComplications: string[];
  successCriteria: string[];
  levelExplanations: LevelExplanation[];
  animationReferences: string[];
  fluoroscopyHooks: string[];
}

export interface ProceduresDataset {
  schemaVersion: string;
  description: string;
  procedures: ProcedureObject[];
}
