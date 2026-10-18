'use client';

/**
 * Cross-store "open this item" actions used by the navigator, search, related
 * links, tutor and quiz — so every entry point behaves the same way.
 */
import { useAppStore } from '@/store/useAppStore';
import { useSceneStore } from '@/store/useSceneStore';
import { useConditionStore } from '@/store/useConditionStore';
import { useProcedureStore } from '@/store/useProcedureStore';
import { usePharmacologyStore } from '@/store/usePharmacologyStore';
import { useCaseStore } from '@/store/useCaseStore';
import { useECGStore } from '@/store/useECGStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { useLearningStore } from '@/store/useLearningStore';
import { useContentStore } from '@/lib/content';
import { CONDITION_TO_PROFILE, resolveProfile } from '@/lib/ecg/profiles';
import { CONDUCTION_IDS, CORONARY_IDS, SECTION_FIRST, structureCategory } from '@/lib/anatomy/categories';
import { LANDMARK_BY_ID } from '@/lib/anatomy/landmarks';
import { CASE_DATA } from '@/data/caseData';
import { setRhythm } from '@/lib/rhythm';
import { leaveSimulator } from '@/store/useSimStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import { CONDITION_IDS, MEDICATION_IDS, PROCEDURE_IDS, STRUCTURE_IDS } from '@/types/content';

/** Opening an item shows the learning workspace; on small screens it swaps the navigator drawer for the info drawer */
function reveal() {
  const app = useAppStore.getState();
  if (app.mode !== 'learn') {
    // the simulator hands the monitor back first, so the item's own ECG is not overwritten afterwards
    if (app.mode === 'simulator') leaveSimulator();
    app.setMode('learn');
  }
  if (app.compact) app.setPanels(false, true);
  else if (!app.rightPanelOpen) app.setPanels(app.leftPanelOpen, true);
}

export { setRhythm };

let replaying = false;

/** Note an opened item so the info panel's Back button can return to it */
export function rememberItem(id: string) {
  if (!replaying) useHistoryStore.getState().push(id);
}

/** Re-open the item before the current one */
export function goBack() {
  const prev = useHistoryStore.getState().back();
  if (!prev) return;
  replaying = true;
  try { openById(prev); } finally { replaying = false; }
}

export function openStructure(id: string) {
  reveal();
  const app = useAppStore.getState();
  const scene = useSceneStore.getState();
  app.setActivePanelCategory(structureCategory(id));
  scene.setHighlights([]);
  // Make sure the structure is actually visible in the 3D view
  const l = LANDMARK_BY_ID[id];
  if (CONDUCTION_IDS.includes(id)) {
    if (app.viewMode !== 'conduction') app.setViewMode('conduction');
  } else if (SECTION_FIRST.has(id)) {
    if (app.viewMode !== 'sectioned' && app.viewMode !== 'xray') app.setViewMode(l?.section ? 'sectioned' : 'xray');
  } else if (CORONARY_IDS.includes(id)) {
    if (app.viewMode !== 'territories' && app.viewMode !== 'external') app.setViewMode('external');
  } else if (l && !l.surface && app.viewMode === 'external') {
    app.setViewMode(l.section ? 'sectioned' : 'xray');
  } else if (l && l.surface && (app.viewMode === 'sectioned') && !l.section) {
    app.setViewMode('external');
  }
  scene.selectStructure(id);
  rememberItem(id);
  useLearningStore.getState().markStructureViewed(id);
}

export function openCondition(id: string) {
  reveal();
  const app = useAppStore.getState();
  app.setActivePanelCategory('conditions');
  useConditionStore.getState().selectCondition(id);
  useCaseStore.getState().resetCase();
  const profile = CONDITION_TO_PROFILE[id];
  if (profile) setRhythm(profile);
  const c = useContentStore.getState().lib?.conditions[id];
  const scene = useSceneStore.getState();
  scene.selectStructure(null);
  scene.setHighlights((c?.affectedStructures ?? []).filter((s) => LANDMARK_BY_ID[s]));
  useECGStore.getState().setBottomView('ecg');
  rememberItem(id);
  useLearningStore.getState().markConditionStudied(id);
}

export function openProcedure(id: string) {
  reveal();
  const app = useAppStore.getState();
  app.setActivePanelCategory('procedures');
  useProcedureStore.getState().selectProcedure(id);
  const p = useContentStore.getState().lib?.procedures[id];
  const scene = useSceneStore.getState();
  scene.selectStructure(null);
  scene.setHighlights((p?.targetStructures ?? []).filter((s) => LANDMARK_BY_ID[s]));
  rememberItem(id);
  useLearningStore.getState().markProcedureReviewed(id);
}

export function openMedication(id: string) {
  reveal();
  useAppStore.getState().setActivePanelCategory('medications');
  usePharmacologyStore.getState().selectMedication(id);
  rememberItem(id);
  useLearningStore.getState().markMedicationReviewed(id);
}

export function openCase(id: string) {
  const c = CASE_DATA[id];
  if (!c) return;
  reveal();
  useAppStore.getState().setActivePanelCategory('cases');
  useCaseStore.getState().startCase(id, 'initial');
  useConditionStore.getState().selectCondition(null);
  const scene = useSceneStore.getState();
  scene.selectStructure(null);
  scene.setHighlights([]);
  setRhythm(c.ecgProfile, c.heartRate);
  useECGStore.getState().setBottomView('ecg');
  rememberItem(id);
}

/** Open any item by ID (used by "related" chips and search) */
export function openById(id: string) {
  if ((STRUCTURE_IDS as readonly string[]).includes(id)) return openStructure(id);
  if ((CONDITION_IDS as readonly string[]).includes(id)) return openCondition(id);
  if ((PROCEDURE_IDS as readonly string[]).includes(id)) return openProcedure(id);
  if ((MEDICATION_IDS as readonly string[]).includes(id)) return openMedication(id);
  if (CASE_DATA[id]) return openCase(id);
}

export function kindOf(id: string): 'structure' | 'condition' | 'procedure' | 'medication' | 'case' | null {
  if ((STRUCTURE_IDS as readonly string[]).includes(id)) return 'structure';
  if ((CONDITION_IDS as readonly string[]).includes(id)) return 'condition';
  if ((PROCEDURE_IDS as readonly string[]).includes(id)) return 'procedure';
  if ((MEDICATION_IDS as readonly string[]).includes(id)) return 'medication';
  if (CASE_DATA[id]) return 'case';
  return null;
}

export function nameOf(id: string): string {
  const lib = useContentStore.getState().lib;
  if (lib) {
    const n = lib.structures[id]?.name ?? lib.conditions[id]?.name ?? lib.procedures[id]?.name ?? lib.medications[id]?.name;
    if (n) return n;
  }
  if (CASE_DATA[id]) return CASE_DATA[id].title;
  return LANDMARK_BY_ID[id]?.name ?? id.replace(/-/g, ' ');
}
