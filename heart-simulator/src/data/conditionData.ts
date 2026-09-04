/**
 * Condition knowledge base — merged from the category files so the panels
 * can look up any condition by its left-panel id.
 */
import type { ConditionInfo } from './conditions/types';
import { ARRHYTHMIA_CONDITIONS } from './conditions/arrhythmias';
import { ISCHEMIA_CONDITIONS } from './conditions/ischemia';
import { STRUCTURAL_CONDITIONS } from './conditions/structural';

export type { ConditionInfo } from './conditions/types';

export const CONDITION_DATA: Record<string, ConditionInfo> = {
  ...ARRHYTHMIA_CONDITIONS,
  ...ISCHEMIA_CONDITIONS,
  ...STRUCTURAL_CONDITIONS,
};

export const CONDITION_IDS = Object.keys(CONDITION_DATA);

/** Map of condition id → ECG profile id, derived from the data. */
export const CONDITION_TO_ECG_PROFILE: Record<string, string> = Object.fromEntries(
  CONDITION_IDS.map((id) => [id, CONDITION_DATA[id].ecgProfile]),
);

/** Map of condition id → characteristic heart rate (only where defined). */
export const CONDITION_HR_PRESETS: Record<string, number> = Object.fromEntries(
  CONDITION_IDS.filter((id) => CONDITION_DATA[id].heartRate !== undefined).map((id) => [id, CONDITION_DATA[id].heartRate as number]),
);

/** Tab name → data field for the condition info panel. */
export const CONDITION_TAB_FIELDS: Record<string, keyof ConditionInfo> = {
  'overview': 'overview',
  'anatomy': 'anatomy',
  'pathophysiology': 'pathophysiology',
  'physiology': 'pathophysiology',
  'symptoms': 'symptoms',
  'ecg': 'ecg',
  'imaging': 'imaging',
  'medications': 'medications',
  'field-care': 'fieldCare',
  'hospital-care': 'hospitalCare',
  'cardiology-care': 'cardiologyCare',
  'procedure': 'procedure',
  'complications': 'complications',
  'teaching': 'teaching',
};

/** Search helper: matches title, category, synonyms in overview and teaching. */
export function searchConditions(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return CONDITION_IDS;
  return CONDITION_IDS.filter((id) => {
    const c = CONDITION_DATA[id];
    return id.replace(/-/g, ' ').includes(q)
      || c.title.toLowerCase().includes(q)
      || c.category.toLowerCase().includes(q)
      || c.overview.toLowerCase().includes(q);
  });
}
