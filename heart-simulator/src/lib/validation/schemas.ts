import { z } from 'zod';

export const LearningLevelSchema = z.union([
  z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5),
]);

export const LevelExplanationSchema = z.object({
  level: LearningLevelSchema,
  label: z.string(),
  explanation: z.string(),
});

export const AnatomyStructureSchema = z.object({
  id: z.string(),
  name: z.string(),
  synonyms: z.array(z.string()),
  category: z.string(),
  subcategory: z.string(),
  region: z.string(),
  bloodType: z.enum(['oxygenated', 'deoxygenated', 'mixed', 'none']),
  functionSummary: z.string(),
  detailedDescription: z.string(),
  connectedStructures: z.array(z.string()),
  upstreamStructures: z.array(z.string()),
  downstreamStructures: z.array(z.string()),
  conductionRelevance: z.string(),
  ecgRelevance: z.string(),
  pathologyRelevance: z.array(z.string()),
  procedureRelevance: z.array(z.string()),
  levelExplanations: z.array(LevelExplanationSchema),
  displayLabelAnchor: z.tuple([z.number(), z.number(), z.number()]),
  modelNodeReference: z.string(),
  visibilityRules: z.object({
    defaultVisible: z.boolean(),
    dissectionOrder: z.number(),
    layerGroup: z.string(),
    minDetailLevel: z.enum(['low', 'standard', 'high']),
  }),
  imagingCorrelation: z.array(z.string()),
});

export const ConditionSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  subcategory: z.string(),
  synonyms: z.array(z.string()),
  shortSummary: z.string(),
  detailedDescription: z.string(),
  pathophysiology: z.string(),
  commonSymptoms: z.array(z.string()),
  classicFindings: z.array(z.string()),
  rhythmBehavior: z.string(),
  ecgProfileReference: z.string(),
  affectedAnatomy: z.array(z.string()),
  medsCommonlyUsed: z.array(z.string()),
  proceduresCommonlyUsed: z.array(z.string()),
  levelExplanations: z.array(LevelExplanationSchema),
});

export const MedicationSchema = z.object({
  id: z.string(),
  genericName: z.string(),
  brandNames: z.array(z.string()),
  drugClass: z.string(),
  subclass: z.string(),
  mechanismOfAction: z.string(),
  primaryCardiacUses: z.array(z.string()),
  aclsUses: z.array(z.string()),
  dosingConcept: z.string(),
  routeOptions: z.array(z.string()),
  contraindications: z.array(z.string()),
  levelExplanations: z.array(LevelExplanationSchema),
});

export const ECGProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  conditionReference: z.string(),
  rate: z.object({ min: z.number(), max: z.number(), typical: z.number() }),
  rhythm: z.string(),
  annotations: z.array(z.string()),
});
