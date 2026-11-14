/** Every simulator scenario, in the order the picker shows them */
import type { LearningLevel } from '@/store/useAppStore';
import type { Scenario } from '../types';
import { afRvrField } from './afRvrField';
import { betaBlockerField } from './betaBlockerField';
import { cathlabAirEmbolism } from './cathlabAirEmbolism';
import { cathlabContrast } from './cathlabContrast';
import { cathlabFfr } from './cathlabFfr';
import { cathlabGuideDissection } from './cathlabGuideDissection';
import { cathlabInferior } from './cathlabInferior';
import { cathlabLeftMain } from './cathlabLeftMain';
import { cathlabNoReflow } from './cathlabNoReflow';
import { cathlabPerforation } from './cathlabPerforation';
import { cathlabRpBleed } from './cathlabRpBleed';
import { cathlabScad } from './cathlabScad';
import { cathlabShock } from './cathlabShock';
import { cathlabStemi } from './cathlabStemi';
import { cathlabStentThrombosis } from './cathlabStentThrombosis';
import { cathlabStroke } from './cathlabStroke';
import { cathlabTakotsubo } from './cathlabTakotsubo';
import { cathlabTempWire } from './cathlabTempWire';
import { cathlabVasovagal } from './cathlabVasovagal';
import { cocaineField } from './cocaineField';
import { commotioField } from './commotioField';
import { dissectionField } from './dissectionField';
import { edDissection } from './edDissection';
import { edHeartBlock } from './edHeartBlock';
import { edHyperkalemia } from './edHyperkalemia';
import { edNstemi } from './edNstemi';
import { edPeLysis } from './edPeLysis';
import { edScape } from './edScape';
import { edStemiWalkIn } from './edStemiWalkIn';
import { edTamponade } from './edTamponade';
import { edUnstableAf } from './edUnstableAf';
import { edVfArrest } from './edVfArrest';
import { heartBlock } from './heartBlock';
import { hyperkalemiaField } from './hyperkalemiaField';
import { lvadField } from './lvadField';
import { peaArrestField } from './peaArrestField';
import { peField } from './peField';
import { posteriorStemiField } from './posteriorStemiField';
import { scapeField } from './scapeField';
import { stableVtField } from './stableVtField';
import { stemiAnterior } from './stemiAnterior';
import { stemiInferiorRV } from './stemiInferiorRV';
import { svtUnstable } from './svtUnstable';
import { tamponadeField } from './tamponadeField';
import { torsadesField } from './torsadesField';
import { vfArrest } from './vfArrest';
import { wpwAfField } from './wpwAfField';

export const SCENARIOS: Scenario[] = [
  // the field
  stemiAnterior, stemiInferiorRV, heartBlock, betaBlockerField, svtUnstable, afRvrField, stableVtField, hyperkalemiaField, vfArrest, peaArrestField,
  posteriorStemiField, cocaineField, dissectionField, peField, tamponadeField,
  scapeField, wpwAfField, torsadesField, commotioField, lvadField,
  // the emergency department (setting 'ed', roles [6, 7]: see edKit.ts)
  edStemiWalkIn, edNstemi, edHeartBlock, edHyperkalemia, edUnstableAf,
  edScape, edPeLysis, edDissection, edTamponade, edVfArrest,
  // the cath lab
  cathlabStemi, cathlabInferior, cathlabFfr, cathlabShock, cathlabNoReflow, cathlabPerforation, cathlabContrast,
  cathlabLeftMain, cathlabStentThrombosis, cathlabScad, cathlabTakotsubo, cathlabTempWire,
  cathlabGuideDissection, cathlabAirEmbolism, cathlabStroke, cathlabVasovagal, cathlabRpBleed,
];

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
