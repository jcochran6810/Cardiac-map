'use client';

/** Rhythm trainer, screen side: puts each tracing on the monitor and hands the screen back afterwards */
import { useAppStore } from '@/store/useAppStore';
import { useECGStore } from '@/store/useECGStore';
import { useSceneStore } from '@/store/useSceneStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { useConditionStore } from '@/store/useConditionStore';
import { useCaseStore } from '@/store/useCaseStore';
import { useMedStore } from '@/store/useMedStore';
import { useCourseStore } from '@/store/useCourseStore';
import { useDrillStore } from '@/store/useDrillStore';
import { leaveSimulator } from '@/store/useSimStore';
import { DRILL_SET_BY_ID } from '@/lib/drill';
import { exitLesson, tidy } from '@/lib/courses';
import { showRhythm } from '@/lib/rhythm';
import { cleanSlate } from '@/lib/actions';

/** Show the tracing of the question on screen: after a new question, or (`relayout`) again after a change of screen shape */
export function showQuestion(relayout = false) {
  const { setId, question } = useDrillStore.getState();
  const set = setId ? DRILL_SET_BY_ID[setId] : null;
  const app = useAppStore.getState();
  const ecg = useECGStore.getState();
  if (!set || !question) {
    // choosing a set: nothing to read yet
    app.setHeart('closed');
    app.setEcg('closed');
    return;
  }
  // (turning the phone does not restart the tracing being read)
  if (!relayout || ecg.activeProfileId !== question.profile) showRhythm(question.profile, question.hr);
  const tl = useTimelineStore.getState();
  tl.setSpeed(1);
  if (!tl.playing) tl.play();
  ecg.setBottomView('ecg');
  if (ecg.electrodeLab) ecg.setElectrodeLab(false);
  if (ecg.layout !== set.layout) ecg.setLayout(set.layout);
  if (ecg.inspectLead) ecg.setInspectLead(null);
  if (ecg.selectedLead) useECGStore.setState({ selectedLead: null });
  // the tracing is the whole question: beside the answers on wide screens, under them on upright ones
  const side = !app.compact || app.short;
  app.setHeart('closed');
  app.setEcg(side ? 'full' : 'open');
}

/** Main menu → Rhythm trainer: the list of practice sets */
export function openTrainer() {
  const app = useAppStore.getState();
  if (app.mode === 'simulator') leaveSimulator();
  if (useCourseStore.getState().active) exitLesson('stay');
  useMedStore.getState().reset(null);
  useConditionStore.getState().selectCondition(null);
  useCaseStore.getState().resetCase();
  useSceneStore.getState().selectStructure(null);
  cleanSlate();
  useDrillStore.getState().show();
  app.setMode('learn');
  showQuestion();
}

export function startSet(setId: string) {
  if (!useDrillStore.getState().open) openTrainer();
  useDrillStore.getState().begin(setId);
  showQuestion();
}

export function nextTracing() {
  useDrillStore.getState().next();
  showQuestion();
}

export function leaveSet() {
  useDrillStore.getState().leaveSet();
  showRhythm('normal-sinus');
  showQuestion();
}

/** Leave the trainer. `to`: the main menu (the default), or nowhere (the caller navigates next) */
export function closeTrainer(to: 'home' | 'stay' = 'home') {
  if (!useDrillStore.getState().open) return;
  useDrillStore.getState().close();
  useECGStore.getState().setBlind('drill', false);
  tidy();
  if (to === 'home') useAppStore.getState().setMode('home');
}
