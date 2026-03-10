export type AnatomyCategory = 'chamber' | 'appendage' | 'septum' | 'wall' | 'valve' | 'subvalvular' | 'great-vessel' | 'coronary-artery' | 'coronary-vein' | 'conduction' | 'pericardial' | 'landmark' | 'outflow' | 'inflow' | 'perfusion-territory' | 'procedure-landmark';

export type BloodType = 'oxygenated' | 'deoxygenated' | 'mixed' | 'none';

export type LearningLevel = 1 | 2 | 3 | 4 | 5;

export interface LevelExplanation {
  level: LearningLevel;
  label: string;
  explanation: string;
}

export interface AnatomyStructure {
  id: string;
  name: string;
  synonyms: string[];
  category: AnatomyCategory;
  subcategory: string;
  region: string;
  bloodType: BloodType;
  functionSummary: string;
  detailedDescription: string;
  connectedStructures: string[];
  upstreamStructures: string[];
  downstreamStructures: string[];
  conductionRelevance: string;
  ecgRelevance: string;
  pathologyRelevance: string[];
  procedureRelevance: string[];
  levelExplanations: LevelExplanation[];
  displayLabelAnchor: [number, number, number];
  modelNodeReference: string;
  visibilityRules: {
    defaultVisible: boolean;
    dissectionOrder: number;
    layerGroup: string;
    minDetailLevel: 'low' | 'standard' | 'high';
  };
  imagingCorrelation: string[];
}

export interface AnatomyDataset {
  schemaVersion: string;
  description: string;
  structures: AnatomyStructure[];
}
