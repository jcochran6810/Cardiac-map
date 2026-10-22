'use client';

/**
 * Cross-store "open this item" actions used by the navigator, search, related
 * links, tutor and quiz — so every entry point behaves the same way.
 */
import { useAppStore, type PanelCategory } from '@/store/useAppStore';
import { useSceneStore } from '@/store/useSceneStore';
import { useConditionStore } from '@/store/useConditionStore';
import { useProcedureStore } from '@/store/useProcedureStore';
import { usePharmacologyStore } from '@/store/usePharmacologyStore';
import { useCaseStore } from '@/store/useCaseStore';
import { useCathLabStore } from '@/store/useCathLabStore';
import { CINE_VIEW_BY_ID } from '@/lib/cathlab/views';
import { angio } from '@/store/useSceneStore';
import { useECGStore, type BottomView } from '@/store/useECGStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { useLearningStore } from '@/store/useLearningStore';
import { useMedStore } from '@/store/useMedStore';
import { useContentStore } from '@/lib/content';
import { CONDITION_TO_PROFILE, resolveProfile } from '@/lib/ecg/profiles';
import { CONDUCTION_IDS, CORONARY_IDS, SECTION_FIRST, structureCategory } from '@/lib/anatomy/categories';
import { LANDMARK_BY_ID } from '@/lib/anatomy/landmarks';
import { CASE_DATA } from '@/data/caseData';
import { setRhythm, showRhythm } from '@/lib/rhythm';
import { leaveSimulator } from '@/store/useSimStore';
import { CONDITION_IDS, MEDICATION_IDS, PROCEDURE_IDS, STRUCTURE_IDS } from '@/types/content';

/** Opening an item shows the learning screen; on tablets and phones the reading replaces the list */
function reveal() {
  const app = useAppStore.getState();
  if (app.mode !== 'learn') {
    // the simulator hands the monitor back first, so the item's own ECG is not overwritten afterwards
    if (app.mode === 'simulator') leaveSimulator();
    app.setMode('learn');
  }
  showReading();
}

/** Bring the reading into view: the item rather than the list on small screens, and no drawer covering it */
export function showReading() {
  const app = useAppStore.getState();
  if (app.compact && app.listOpen) app.setListOpen(false);
  if (app.short) {
    // a phone on its side has room for the reading or a drawer, not both
    if (app.heart !== 'closed' && (app.heart === 'full' || app.ecg !== 'closed')) app.setHeart('closed');
    if (app.ecg === 'full') app.setEcg('closed');
    return;
  }
  if (app.heart === 'full') app.setHeart('open');
  if (app.ecg === 'full') app.setEcg('open');
}

/** Slide the 3D heart down from the top, if it is not showing already */
export function showHeart() {
  const app = useAppStore.getState();
  if (app.heart === 'closed') app.setHeart(app.short ? 'full' : 'open');
}

/** Slide the ECG panel up from the bottom on one of its views, if it is not showing already */
export function showEcg(view: BottomView = 'ecg') {
  useECGStore.getState().setBottomView(view);
  const app = useAppStore.getState();
  if (app.ecg === 'closed') app.setEcg(app.short ? 'full' : 'open');
}

/** Main menu: a section of the library, starting at its list */
export function openCategory(cat: PanelCategory) {
  const app = useAppStore.getState();
  if (app.mode === 'simulator') leaveSimulator();
  app.setMode('learn');
  app.setActivePanelCategory(cat);
  app.setListOpen(true);
  app.setHeart('closed');
  app.setEcg('closed');
}

export type Tool = 'heart' | 'ecg' | 'lab' | 'defib' | 'wiggers';

/**
 * Main menu: a tool on its own, filling the learning screen. Closing it shows the library list
 * underneath (anatomy under the 3D heart, conditions under the ECG tools).
 */
export function openTool(tool: Tool) {
  const app = useAppStore.getState();
  if (app.mode === 'simulator') leaveSimulator();
  app.setMode('learn');
  app.setActivePanelCategory(tool === 'heart' ? 'anatomy' : 'conditions');
  app.setListOpen(true);
  if (tool === 'heart') {
    useSceneStore.getState().selectStructure(null);
    app.setEcg('closed');
    app.setHeart('full');
    return;
  }
  const ecg = useECGStore.getState();
  ecg.setBottomView(tool === 'defib' ? 'defib' : tool === 'wiggers' ? 'wiggers' : 'ecg');
  ecg.setElectrodeLab(tool === 'lab');
  if (tool === 'ecg') { ecg.setInspectLead(null); ecg.setLayout('simultaneous'); }
  // the heart stays in view above the 12-lead, the electrode lab and the pressure curves; phones give the lab and the defibrillator the whole screen
  app.setHeart(tool === 'defib' || (tool === 'lab' && app.phone && !app.short) ? 'closed' : 'open');
  app.setEcg('full');
}

export { setRhythm, showRhythm };


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
  useLearningStore.getState().markStructureViewed(id);
}

export function openCondition(id: string) {
  reveal();
  const app = useAppStore.getState();
  app.setActivePanelCategory('conditions');
  // a new patient: drugs given to the last one no longer apply
  useMedStore.getState().reset(id);
  useConditionStore.getState().selectCondition(id);
  useCaseStore.getState().resetCase();
  const profile = CONDITION_TO_PROFILE[id];
  if (profile) showRhythm(profile);
  const c = useContentStore.getState().lib?.conditions[id];
  const scene = useSceneStore.getState();
  scene.selectStructure(null);
  scene.setHighlights((c?.affectedStructures ?? []).filter((s) => LANDMARK_BY_ID[s]));
  useECGStore.getState().setBottomView('ecg');
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
  useLearningStore.getState().markProcedureReviewed(id);
}

export function openMedication(id: string) {
  reveal();
  useAppStore.getState().setActivePanelCategory('medications');
  usePharmacologyStore.getState().selectMedication(id);
  useLearningStore.getState().markMedicationReviewed(id);
}

/** A condition's Give meds section: choose a drug and dose for the patient, push it, watch the live 12-lead */
export function openTreatment(conditionId: string) {
  openCondition(conditionId);
  useAppStore.getState().setRightPanelTab('treat');
  showEcg('ecg');
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
  showRhythm(c.ecgProfile, c.heartRate);
  useECGStore.getState().setBottomView('ecg');
}

/** A cath lab catalog item: a view also turns the 3D heart to that C-arm angle */
export function openCathLab(id: string) {
  reveal();
  const app = useAppStore.getState();
  app.setActivePanelCategory('cathlab');
  useCathLabStore.getState().select(id);
  useLearningStore.getState().markCathLabStudied(id);
  const scene = useSceneStore.getState();
  scene.selectStructure(null);
  const v = CINE_VIEW_BY_ID[useContentStore.getState().lib?.cathlab[id]?.view ?? ''];
  if (v) showCineView(v.id);
  else scene.setHighlights([]);
}

/** Turn the 3D heart to a view's C-arm angle and light up the arteries it shows best */
export function showCineView(viewId: string) {
  const v = CINE_VIEW_BY_ID[viewId];
  if (!v) return;
  const app = useAppStore.getState();
  if (v.system !== 'lv' && app.viewMode !== 'external' && app.viewMode !== 'territories') app.setViewMode('external');
  const scene = useSceneStore.getState();
  scene.setHighlights(v.vessels);
  scene.setCameraPreset({ label: v.name, short: v.name, dir: angio(v.rot, v.ang), group: 'angio' });
}

/** Open any item by ID (used by "related" chips and search) */
export function openById(id: string) {
  if ((STRUCTURE_IDS as readonly string[]).includes(id)) return openStructure(id);
  if ((CONDITION_IDS as readonly string[]).includes(id)) return openCondition(id);
  if ((PROCEDURE_IDS as readonly string[]).includes(id)) return openProcedure(id);
  if ((MEDICATION_IDS as readonly string[]).includes(id)) return openMedication(id);
  if (id.startsWith('cl-')) return openCathLab(id);
  if (CASE_DATA[id]) return openCase(id);
}

export function kindOf(id: string): 'structure' | 'condition' | 'procedure' | 'medication' | 'cathlab' | 'case' | null {
  if ((STRUCTURE_IDS as readonly string[]).includes(id)) return 'structure';
  if ((CONDITION_IDS as readonly string[]).includes(id)) return 'condition';
  if ((PROCEDURE_IDS as readonly string[]).includes(id)) return 'procedure';
  if ((MEDICATION_IDS as readonly string[]).includes(id)) return 'medication';
  if (id.startsWith('cl-')) return useContentStore.getState().lib ? (useContentStore.getState().lib!.cathlab[id] ? 'cathlab' : null) : 'cathlab';
  if (CASE_DATA[id]) return 'case';
  return null;
}

export function nameOf(id: string): string {
  const lib = useContentStore.getState().lib;
  if (lib) {
    const n = lib.structures[id]?.name ?? lib.conditions[id]?.name ?? lib.procedures[id]?.name ?? lib.medications[id]?.name ?? lib.cathlab[id]?.name;
    if (n) return n;
  }
  if (CASE_DATA[id]) return CASE_DATA[id].title;
  return LANDMARK_BY_ID[id]?.name ?? id.replace(/-/g, ' ');
}
