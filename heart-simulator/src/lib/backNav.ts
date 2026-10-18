'use client';

/**
 * The phone's (or browser's) Back button moves through CardioSim's own pages instead of leaving the
 * app. Each page — the screen (Home / Learn / Simulator), the item open in the info panel, the
 * Library and Info drawers on small screens, the electrode lab, the quiz / tutor / help, and the
 * simulator's case list → case → action list → review — is one browser history entry.
 *
 * - Opening something pushes an entry; closing it with its own button steps back over that entry,
 *   so Back never "does nothing".
 * - Back restores the previous page. Leaving a case in progress asks first; entries for a case that
 *   no longer exists are skipped.
 * - On the start page the first Back says "press Back again to leave".
 *
 * Next.js copies its own router state into these entries, so its popstate handling stays a no-op.
 */
import { create } from 'zustand';
import { useAppStore, type AppMode } from '@/store/useAppStore';
import { leaveSimulator, useSimStore } from '@/store/useSimStore';
import { useECGStore } from '@/store/useECGStore';
import { useTutorStore } from '@/store/useTutorStore';
import { useSceneStore } from '@/store/useSceneStore';
import { useConditionStore } from '@/store/useConditionStore';
import { useProcedureStore } from '@/store/useProcedureStore';
import { usePharmacologyStore } from '@/store/usePharmacologyStore';
import { useCaseStore } from '@/store/useCaseStore';
import { useCathLabStore } from '@/store/useCathLabStore';
import { openById } from '@/lib/actions';

export type Overlay = 'quiz' | 'tutor' | 'help' | null;
export type SimPage = 'list' | 'case' | 'actions' | 'review';

export interface Page {
  mode: AppMode;
  /** Learn: the item shown in the info panel */
  item: string | null;
  /** Learn on tablets and phones: the Library / Info drawers */
  left: boolean;
  right: boolean;
  /** Learn: the electrode lab */
  lab: boolean;
  overlay: Overlay;
  /** Simulator: which view, and which run of a case it belongs to */
  sim: SimPage;
  run: number;
}

interface Entry { cardiosim: number; page: Page }

export const useBackNavStore = create<{ exitHint: boolean; canGoBack: boolean; previous: Page | null }>(() => ({
  exitHint: false, canGoBack: false, previous: null,
}));

// ─── Reading and restoring a page ──────────────────────────────────────────

function currentItem(): string | null {
  switch (useAppStore.getState().activePanelCategory) {
    case 'conditions': return useConditionStore.getState().selectedConditionId;
    case 'procedures': return useProcedureStore.getState().selectedProcedureId;
    case 'medications': return usePharmacologyStore.getState().selectedMedicationId;
    case 'cases': return useCaseStore.getState().activeCaseId;
    case 'cathlab': return useCathLabStore.getState().selectedId;
    default: return useSceneStore.getState().selectedStructureId;
  }
}

function clearItem() {
  const scene = useSceneStore.getState();
  switch (useAppStore.getState().activePanelCategory) {
    case 'conditions': useConditionStore.getState().selectCondition(null); scene.setHighlights([]); break;
    case 'procedures': useProcedureStore.getState().selectProcedure(null); scene.setHighlights([]); break;
    case 'medications': usePharmacologyStore.getState().selectMedication(null); break;
    case 'cases': useCaseStore.getState().resetCase(); break;
    case 'cathlab': useCathLabStore.getState().select(null); scene.setHighlights([]); break;
    default: scene.selectStructure(null);
  }
}

export function currentPage(): Page {
  const app = useAppStore.getState();
  const sim = useSimStore.getState();
  const ecg = useECGStore.getState();
  const learn = app.mode === 'learn';
  const s = sim.state;
  const simPage: SimPage = !s ? 'list' : s.ended && sim.reviewOpen ? 'review' : sim.sheetOpen && !s.ended ? 'actions' : 'case';
  return {
    mode: app.mode,
    item: learn ? currentItem() : null,
    left: learn && app.compact && app.leftPanelOpen,
    right: learn && app.compact && app.rightPanelOpen,
    lab: learn && ecg.electrodeLab && ecg.bottomView === 'ecg',
    overlay: app.helpOpen ? 'help' : app.quizOpen ? 'quiz' : useTutorStore.getState().tutorOpen ? 'tutor' : null,
    sim: app.mode === 'simulator' ? simPage : 'list',
    run: app.mode === 'simulator' && s ? sim.run : 0,
  };
}

const same = (a: Page | undefined, b: Page | undefined) =>
  !!a && !!b && a.mode === b.mode && a.item === b.item && a.left === b.left && a.right === b.right
  && a.lab === b.lab && a.overlay === b.overlay && a.sim === b.sim && a.run === b.run;

/** A simulator page can only come back while its case is still the one loaded */
function restorable(page: Page): boolean {
  if (page.mode !== 'simulator' || page.sim === 'list') return true;
  const sim = useSimStore.getState();
  if (!sim.state || sim.run !== page.run) return false;
  if (page.sim === 'review') return !!sim.state.ended;
  if (page.sim === 'actions') return !sim.state.ended && !sim.state.pendingRead;
  return true;
}

function apply(page: Page, from: Page) {
  const app = useAppStore.getState();
  // hand the monitor back before an item loads its own ECG
  if (from.mode === 'simulator' && page.mode !== 'simulator') leaveSimulator();
  app.setHelpOpen(page.overlay === 'help');
  app.setQuizOpen(page.overlay === 'quiz');
  useTutorStore.getState().setTutorOpen(page.overlay === 'tutor');
  if (page.mode === 'learn') {
    app.setMode('learn');
    if (page.item !== from.item) {
      if (page.item) openById(page.item);
      else clearItem();
    }
    if (app.compact) app.setPanels(page.left, page.right);
    const ecg = useECGStore.getState();
    if (ecg.electrodeLab !== page.lab) {
      if (page.lab) ecg.setBottomView('ecg');
      ecg.setElectrodeLab(page.lab);
    }
  } else if (page.mode === 'simulator') {
    app.setMode('simulator');
    const sim = useSimStore.getState();
    if (page.sim === 'list') {
      if (sim.state) sim.closeScenario();
    } else {
      sim.setReviewOpen(page.sim === 'review');
      sim.setSheetOpen(page.sim === 'actions');
    }
  } else {
    app.setMode('home');
  }
}

// ─── History ───────────────────────────────────────────────────────────────

/** where the browser is in our entries */
let idx = 0;
/** the entry whose page is on screen (differs from idx only while skipping entries) */
let shown = 0;
let stack: Page[] = [];
let guarded = false;
/** we asked the browser to step back/forward ourselves: the next popstate only moves the index */
let consuming = false;
let applying = false;
let scheduled = false;
/** right after Back, follow-up changes rewrite the entry instead of adding one */
let replaceUntil = 0;
let exitTimer = 0;

function write(kind: 'push' | 'replace', page: Page) {
  const entry: Entry = { cardiosim: idx, page };
  if (kind === 'push') window.history.pushState(entry, '');
  else window.history.replaceState(entry, '');
}

function publish() {
  shown = idx;
  useBackNavStore.setState({ canGoBack: idx > (guarded ? 1 : 0), previous: idx > 0 ? stack[idx - 1] : null });
}

function sync() {
  scheduled = false;
  if (applying || consuming) return;
  const page = currentPage();
  if (same(page, stack[idx])) return;
  if (performance.now() < replaceUntil) {
    stack[idx] = page;
    write('replace', page);
    publish();
    return;
  }
  if (idx > 0 && same(page, stack[idx - 1])) {
    // the learner closed what the last step opened: step back over its entry instead of adding one
    consuming = true;
    window.history.back();
    return;
  }
  stack = stack.slice(0, idx + 1);
  idx += 1;
  stack[idx] = page;
  write('push', page);
  publish();
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  // one entry per user action, however many stores it touched
  queueMicrotask(sync);
}

function showExitHint() {
  useBackNavStore.setState({ exitHint: true });
  window.clearTimeout(exitTimer);
  exitTimer = window.setTimeout(() => useBackNavStore.setState({ exitHint: false }), 2500);
}

function onPop(e: PopStateEvent) {
  const entry = e.state as Partial<Entry> | null;
  if (typeof entry?.cardiosim !== 'number') return; // not one of ours
  const target = entry.cardiosim;
  if (consuming) {
    consuming = false;
    idx = target;
    publish();
    schedule();
    return;
  }
  const from = currentPage();

  // Back on the start page: ask once, leave on the second press
  if (guarded && target === 0) {
    if (useBackNavStore.getState().exitHint) {
      window.history.back();
      return;
    }
    if (!same(stack[0], from)) {
      applying = true;
      try { apply(stack[0], from); } finally { applying = false; }
    }
    stack = [stack[0], stack[0]];
    idx = 1;
    write('push', stack[1]);
    publish();
    showExitHint();
    return;
  }

  const page = stack[target] ?? entry.page;
  const dir = target < idx ? -1 : 1;
  idx = target;
  if (!page || !restorable(page) || same(page, from)) {
    // a page that can't come back (its case is gone) or would look identical: keep going
    const next = target + dir;
    if (next >= (guarded ? 1 : 0) && next < stack.length) {
      window.history.go(dir);
    } else {
      replaceUntil = performance.now() + 350;
      publish();
      schedule();
    }
    return;
  }

  const sim = useSimStore.getState();
  const leavingCase = from.mode === 'simulator' && (from.sim === 'case' || from.sim === 'actions')
    && page.mode === 'simulator' && page.sim === 'list' && !!sim.state && !sim.state.ended;
  if (leavingCase && !window.confirm('Leave this case? Your progress in it will be lost.')) {
    // stay: go forward again to the entry that is still on screen
    consuming = true;
    window.history.go(shown - target);
    return;
  }

  applying = true;
  try { apply(page, from); } finally { applying = false; }
  replaceUntil = performance.now() + 350;
  publish();
  schedule();
}

/** Start following the Back button; returns the clean-up */
export function startBackNav(): () => void {
  idx = 0;
  shown = 0;
  guarded = false;
  consuming = false;
  stack = [currentPage()];
  write('replace', stack[0]);
  publish();
  const stores = [useAppStore, useSimStore, useECGStore, useTutorStore, useSceneStore, useConditionStore, useProcedureStore, usePharmacologyStore, useCaseStore, useCathLabStore];
  const unsubscribe = stores.map((st) => st.subscribe(schedule));
  // After the first tap or key press, a second start-page entry lets the first Back on it ask before leaving.
  // (Added on a user gesture so browsers keep it in the Back list.)
  const guard = () => {
    if (guarded || idx !== 0) return;
    guarded = true;
    stack = [stack[0], stack[0]];
    idx = 1;
    write('push', stack[1]);
    publish();
  };
  window.addEventListener('popstate', onPop);
  window.addEventListener('pointerdown', guard, true);
  window.addEventListener('keydown', guard, true);
  return () => {
    unsubscribe.forEach((u) => u());
    window.removeEventListener('popstate', onPop);
    window.removeEventListener('pointerdown', guard, true);
    window.removeEventListener('keydown', guard, true);
    window.clearTimeout(exitTimer);
  };
}

/** The in-app Back button: same as the phone's */
export function goBack() {
  if (useBackNavStore.getState().canGoBack) window.history.back();
}
