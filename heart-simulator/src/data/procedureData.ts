/**
 * Procedure knowledge base — merged from the category files so the panels
 * can look up any procedure by its left-panel id.
 */
import type { ProcedureInfo, ProcedureStepInfo } from './procedures/types';
import { CATH_EP_PROCEDURES } from './procedures/cathEp';
import { STRUCTURAL_SURGICAL_PROCEDURES } from './procedures/structuralSurgical';

export type { ProcedureInfo, ProcedureStepInfo } from './procedures/types';

export const PROCEDURE_DATA: Record<string, ProcedureInfo> = {
  ...CATH_EP_PROCEDURES,
  ...STRUCTURAL_SURGICAL_PROCEDURES,
};

export const PROCEDURE_IDS = Object.keys(PROCEDURE_DATA);

/** Procedures grouped by category, in the display order used by the left panel. */
export const PROCEDURE_CATEGORY_ORDER = ['Cath Lab', 'Electrophysiology', 'Structural Heart', 'Interventional / Vascular', 'Surgical', 'Emergency'];

export const PROCEDURES_BY_CATEGORY: { cat: string; items: { id: string; name: string }[] }[] = PROCEDURE_CATEGORY_ORDER.map((cat) => ({
  cat,
  items: PROCEDURE_IDS
    .filter((id) => PROCEDURE_DATA[id].category === cat)
    .map((id) => ({ id, name: PROCEDURE_DATA[id].name }))
    .sort((a, b) => a.name.localeCompare(b.name)),
}));

/** Tab name → data field for the procedure info panel. */
export const PROCEDURE_TAB_FIELDS: Record<string, keyof ProcedureInfo> = {
  'overview': 'overview',
  'indications': 'indications',
  'anatomy': 'anatomy',
  'procedure': 'steps',
  'ecg': 'ecgConsiderations',
  'equipment': 'equipment',
  'complications': 'complications',
  'teaching': 'teaching',
};

export function searchProcedures(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return PROCEDURE_IDS;
  return PROCEDURE_IDS.filter((id) => {
    const p = PROCEDURE_DATA[id];
    return id.replace(/-/g, ' ').includes(q)
      || p.name.toLowerCase().includes(q)
      || p.category.toLowerCase().includes(q)
      || p.overview.toLowerCase().includes(q);
  });
}
