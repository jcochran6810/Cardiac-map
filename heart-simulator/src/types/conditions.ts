import { LevelExplanation } from './anatomy';

export type ConditionCategory = 'sinus-node' | 'atrial-arrhythmia' | 'svt-reentry' | 'junctional' | 'av-block' | 'ventricular-arrhythmia' | 'ischemia' | 'mi-complication' | 'cardiomyopathy' | 'heart-failure' | 'valvular' | 'congenital' | 'pericardial' | 'inflammatory' | 'aortic' | 'pulmonary-vascular' | 'device-related';

export interface ConditionObject {
  id: string;
  name: string;
  category: ConditionCategory;
  subcategory: string;
  synonyms: string[];
  shortSummary: string;
  detailedDescription: string;
  pathophysiology: string;
  commonSymptoms: string[];
  classicFindings: string[];
  rhythmBehavior: string;
  ecgProfileReference: string;
  affectedAnatomy: string[];
  affectedPerfusionTerritory: string[];
  mechanicalChanges: string[];
  hemodynamicChanges: string[];
  echoFindings: string[];
  ctMriFindings: string[];
  angiographyFindings: string[];
  fieldCare: string;
  paramedicCare: string;
  edIcuCare: string;
  cardiologyCare: string;
  cathEpStructuralCare: string;
  medsCommonlyUsed: string[];
  proceduresCommonlyUsed: string[];
  commonComplications: string[];
  severityNote: string;
  levelExplanations: LevelExplanation[];
  contraindications: string[];
  compareModeHooks: string[];
}

export interface ConditionsDataset {
  schemaVersion: string;
  description: string;
  conditions: ConditionObject[];
}
