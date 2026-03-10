export type DominanceSystem = 'right-dominant' | 'left-dominant' | 'codominant';

export type CoronarySegmentType = 'trunk' | 'proximal' | 'mid' | 'distal' | 'branch' | 'terminal';

export interface CoronaryVessel {
  id: string;
  name: string;
  parentVessel: string | null;
  segmentType: CoronarySegmentType;
  commonAlias: string;
  perfusionTerritory: string[];
  ecgTerritories: string[];
  commonMIPatterns: string[];
  dominanceRelevance: string;
  catheterizationRelevance: string;
  lesionSeverityHooks: {
    mild: string;
    moderate: string;
    severe: string;
    occlusion: string;
  };
  branchChildren: string[];
  modelPathReference: string;
  displayOrder: number;
}

export interface CoronaryTreeDataset {
  schemaVersion: string;
  description: string;
  dominanceSystems: DominanceSystem[];
  vessels: CoronaryVessel[];
}
