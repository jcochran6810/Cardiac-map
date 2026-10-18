/** Every simulator scenario, in the order the picker shows them */
import type { LearningLevel } from '@/store/useAppStore';
import type { Scenario } from '../types';
import { cathlabContrast } from './cathlabContrast';
import { cathlabFfr } from './cathlabFfr';
import { cathlabInferior } from './cathlabInferior';
import { cathlabPerforation } from './cathlabPerforation';
import { cathlabShock } from './cathlabShock';
import { cathlabStemi } from './cathlabStemi';
import { heartBlock } from './heartBlock';
import { stemiAnterior } from './stemiAnterior';
import { stemiInferiorRV } from './stemiInferiorRV';
import { svtUnstable } from './svtUnstable';
import { vfArrest } from './vfArrest';

export const SCENARIOS: Scenario[] = [stemiAnterior, stemiInferiorRV, heartBlock, svtUnstable, vfArrest, cathlabStemi, cathlabInferior, cathlabFfr, cathlabShock, cathlabPerforation, cathlabContrast];

export const SCENARIO_BY_ID: Record<string, Scenario> = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));

/** Cath lab cases in which any of these interventions matters (a critical step, a response, a trap) */
export function labCasesUsing(ids: string[]): Scenario[] {
  if (!ids.length) return [];
  return SCENARIOS.filter((sc) => sc.setting === 'cathlab' && ids.some((id) =>
    id in sc.respond
    || sc.harms.some((h) => h.actions.includes(id))
    || sc.critical.some((c) => (Array.isArray(c.done) ? c.done.includes(id) : c.uses?.includes(id)))));
}

/** Scenarios written for a role */
export const scenariosFor = (role: LearningLevel) => SCENARIOS.filter((s) => s.roles.includes(role));
