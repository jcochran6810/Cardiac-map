import type { ConditionContent, MedicationContent, ProcedureContent, StructureContent } from '../../types/content';
import { STRUCTURES_A } from './structures-a';
import { STRUCTURES_B } from './structures-b';
import { CONDITIONS_A } from './conditions-a';
import { CONDITIONS_B } from './conditions-b';
import { CONDITIONS_C } from './conditions-c';
import { PROCEDURES_A } from './procedures-a';
import { PROCEDURES_B } from './procedures-b';
import { MEDICATIONS } from './medications';
import { QUIZ_QUESTIONS } from './quiz';
import { CATHLAB } from './cathlab';

export const STRUCTURES: Record<string, StructureContent> = { ...STRUCTURES_A, ...STRUCTURES_B };
export const CONDITIONS: Record<string, ConditionContent> = { ...CONDITIONS_A, ...CONDITIONS_B, ...CONDITIONS_C };
export const PROCEDURES: Record<string, ProcedureContent> = { ...PROCEDURES_A, ...PROCEDURES_B };
export { MEDICATIONS, QUIZ_QUESTIONS, CATHLAB };
