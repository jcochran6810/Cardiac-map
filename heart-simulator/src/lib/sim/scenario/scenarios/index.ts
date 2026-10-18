/** Every simulator scenario, in the order the picker shows them */
import type { LearningLevel } from '@/store/useAppStore';
import type { Scenario } from '../types';
import { cathlabStemi } from './cathlabStemi';
import { heartBlock } from './heartBlock';
import { stemiAnterior } from './stemiAnterior';
import { stemiInferiorRV } from './stemiInferiorRV';
import { svtUnstable } from './svtUnstable';
import { vfArrest } from './vfArrest';

export const SCENARIOS: Scenario[] = [stemiAnterior, stemiInferiorRV, heartBlock, svtUnstable, vfArrest, cathlabStemi];

export const SCENARIO_BY_ID: Record<string, Scenario> = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));

/** Scenarios written for a role */
export const scenariosFor = (role: LearningLevel) => SCENARIOS.filter((s) => s.roles.includes(role));
