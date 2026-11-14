/**
 * The built-in safety rules every scenario is judged by, on top of its own (Scenario.harms). One file per area; the
 * engine (harmsFor) charges them in this order, so for any one action the penalties come in the order written here.
 */
import type { Harm } from '../types';
import { ACS_RULES } from './acs';
import { ADDED_RULES } from './added';
import { registerBuiltIns } from './charge';
import { PROCEDURE_RULES } from './procedures';
import { RHYTHM_RULES } from './rhythm';
import { SCOPE_RULES } from './scope';
import { SUPPORT_RULES } from './support';

export const BUILT_IN_HARMS: Harm[] = [...RHYTHM_RULES, ...ACS_RULES, ...SUPPORT_RULES, ...PROCEDURE_RULES, ...ADDED_RULES, ...SCOPE_RULES];
registerBuiltIns(BUILT_IN_HARMS);
