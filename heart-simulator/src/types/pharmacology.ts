import { LevelExplanation } from './anatomy';

export type DrugClass = 'antiplatelet' | 'anticoagulant' | 'thrombolytic' | 'antiarrhythmic' | 'beta-blocker' | 'calcium-channel-blocker' | 'ace-inhibitor' | 'arb' | 'arni' | 'nitrate' | 'vasopressor' | 'inotrope' | 'diuretic' | 'statin' | 'sglt2-inhibitor' | 'aldosterone-antagonist' | 'cardiac-glycoside' | 'adenosine' | 'electrolyte' | 'alkalinizing' | 'pulmonary-vasodilator' | 'sedative' | 'contrast-adjunct' | 'reversal-agent' | 'anti-inflammatory';

export interface Medication {
  id: string;
  genericName: string;
  brandNames: string[];
  drugClass: DrugClass;
  subclass: string;
  mechanismOfAction: string;
  primaryCardiacUses: string[];
  aclsUses: string[];
  dosingConcept: string;
  routeOptions: string[];
  onsetConcept: string;
  durationConcept: string;
  contraindications: string[];
  cautions: string[];
  sideEffects: string[];
  ecgEffects: string[];
  hemodynamicEffects: string[];
  cathLabRelevance: string;
  interactionHighlights: string[];
  monitoringNeeds: string[];
  levelExplanations: LevelExplanation[];
}

export interface PharmacologyDataset {
  schemaVersion: string;
  description: string;
  medications: Medication[];
}
