'use client';

/**
 * Guided courses: finding lessons, working out what a step shows, and putting that on screen
 * (the 3D heart, the rhythm, the 12-lead / pressure curves / monitor) through the same stores the
 * rest of the app uses.
 */
import type { Course, Lesson, LessonStep, StepShow } from '@/types/course';
import { useAppStore, type LearningLevel } from '@/store/useAppStore';
import { useECGStore } from '@/store/useECGStore';
import { CAMERA_PRESETS, useSceneStore } from '@/store/useSceneStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { useConditionStore } from '@/store/useConditionStore';
import { useCaseStore } from '@/store/useCaseStore';
import { useMedStore } from '@/store/useMedStore';
import { lessonKey, useCourseStore, type LessonProgress } from '@/store/useCourseStore';
import { leaveSimulator } from '@/store/useSimStore';
import { loadContent, useContentStore } from '@/lib/content';
import { resolveProfile } from '@/lib/ecg/profiles';
import { showRhythm } from '@/lib/rhythm';

// ─── Finding things ────────────────────────────────────────────────────────

const courses = (): Course[] => useContentStore.getState().lib?.courses ?? [];

export function findCourse(courseId: string, list: Course[] = courses()): Course | null {
  return list.find((c) => c.id === courseId) ?? null;
}

export function findLesson(courseId: string, lessonId: string, list: Course[] = courses()): { course: Course; lesson: Lesson; index: number } | null {
  const course = findCourse(courseId, list);
  const index = course ? course.lessons.findIndex((l) => l.id === lessonId) : -1;
  return course && index >= 0 ? { course, lesson: course.lessons[index], index } : null;
}

/** Courses written for this role first, then the rest (each group in catalogue order) */
export function coursesFor(role: LearningLevel, list: Course[]): Course[] {
  return [...list.filter((c) => c.roles.includes(role)), ...list.filter((c) => !c.roles.includes(role))];
}

export function courseProgress(course: Course, progress: Record<string, LessonProgress>): { done: number; total: number; minutesLeft: number } {
  let done = 0;
  let minutesLeft = 0;
  for (const l of course.lessons) {
    if (progress[lessonKey(course.id, l.id)]?.done) done++;
    else minutesLeft += l.minutes;
  }
  return { done, total: course.lessons.length, minutesLeft };
}

/** The first lesson of the course that is not finished yet (null when all are) */
export function nextLesson(course: Course, progress: Record<string, LessonProgress>): Lesson | null {
  return course.lessons.find((l) => !progress[lessonKey(course.id, l.id)]?.done) ?? null;
}

/** The lesson the learner opened most recently and has not finished: offered as "continue" on the main menu */
export function lessonInProgress(list: Course[], progress: Record<string, LessonProgress>): { course: Course; lesson: Lesson; step: number } | null {
  let best: { course: Course; lesson: Lesson; step: number; at: number } | null = null;
  for (const course of list) {
    for (const lesson of course.lessons) {
      const p = progress[lessonKey(course.id, lesson.id)];
      if (p && !p.done && p.step > 0 && p.step < lesson.steps.length && (!best || p.at > best.at)) best = { course, lesson, step: p.step, at: p.at };
    }
  }
  return best;
}

export const checksIn = (lesson: Lesson) => lesson.steps.filter((s) => s.check).length;

/**
 * The order a multiple-choice check shows its options in: shuffled, but always the same way for the same
 * question (so going back to a step does not reshuffle it). Returns indexes into the options as written.
 */
export function optionOrder(question: string, count: number, fixed = false): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  if (fixed) return order;
  // a string hash (FNV-1a) seeds a small generator (mulberry32) for a Fisher–Yates shuffle
  let seed = 2166136261;
  for (let i = 0; i < question.length; i++) seed = Math.imul(seed ^ question.charCodeAt(i), 16777619) >>> 0;
  const next = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// ─── What a step shows ─────────────────────────────────────────────────────

const SCENE_KEYS = ['rhythm', 'hr', 'heart', 'ecg', 'layout', 'flow', 'labels', 'vector', 'speed'] as const;

/**
 * Everything on screen at a step: the scene carried over from the earlier steps of the lesson, plus this
 * step's own pointers. Jumping straight to a step (resuming, going back) therefore shows exactly what
 * stepping through would have.
 */
export function effectiveShow(steps: LessonStep[], index: number): StepShow {
  const scene: StepShow = {};
  for (let i = 0; i <= index && i < steps.length; i++) {
    const s = steps[i].show;
    if (!s) continue;
    // a new rhythm starts at its own usual rate unless the step gives one
    if (s.rhythm !== undefined && s.hr === undefined) delete scene.hr;
    for (const k of SCENE_KEYS) if (s[k] !== undefined) (scene as Record<string, unknown>)[k] = s[k];
  }
  const own = steps[index]?.show ?? {};
  return { ...scene, structure: own.structure, highlight: own.highlight, camera: own.camera, lead: own.lead, inspect: own.inspect, focus: own.focus };
}

/** Which drawers a step opens on this screen (a phone on its side has room for one picture beside the text) */
export function drawersFor(show: StepShow, short: boolean): { heart: boolean; ecg: boolean } {
  let heart = !!show.heart;
  let ecg = !!show.ecg;
  if (!heart && !ecg) heart = true;
  if (short && heart && ecg) {
    if ((show.focus ?? 'ecg') === 'ecg') heart = false;
    else ecg = false;
  }
  return { heart, ecg };
}

/** the rhythm last put on the monitor by a lesson, so a step that keeps it does not restart the tracing */
let shownRhythm = '';

function applyShow(show: StepShow) {
  const app = useAppStore.getState();
  const ecg = useECGStore.getState();
  const scene = useSceneStore.getState();
  const tl = useTimelineStore.getState();

  // rhythm
  const profile = resolveProfile(show.rhythm ?? 'normal-sinus');
  const key = `${profile.id}|${show.hr ?? ''}`;
  if (key !== shownRhythm || ecg.activeProfileId !== profile.id) {
    showRhythm(profile.id, show.hr);
    shownRhythm = key;
  }
  tl.setSpeed(show.speed ?? 1);
  if (!tl.playing) tl.play();

  // drawers: beside the text they take the whole height; stacked above and below it they share the screen with it
  const side = !app.compact || app.short;
  const open = drawersFor(show, app.short);
  app.setHeart(open.heart ? (side ? 'full' : 'open') : 'closed');
  app.setEcg(open.ecg ? (side ? 'full' : 'open') : 'closed');

  // 3D heart
  const view = show.heart || 'external';
  if (app.viewMode !== view) app.setViewMode(view);
  if (app.showFlow !== (show.flow ?? true)) app.toggleFlow();
  if (app.labelsVisible !== (show.labels ?? true)) app.toggleLabels();
  if (app.showVector !== (show.vector ?? false)) app.toggleVector();
  if (app.autoRotate) app.toggleAutoRotate();
  scene.setHighlights(show.highlight ?? []);
  scene.selectStructure(show.structure ?? null);
  const preset = show.camera ? CAMERA_PRESETS.find((p) => p.short === show.camera) : null;
  if (preset) scene.setCameraPreset(preset);

  // bottom panel
  if (show.ecg) ecg.setBottomView(show.ecg === 'lab' ? 'ecg' : show.ecg);
  if (ecg.electrodeLab !== (show.ecg === 'lab')) ecg.setElectrodeLab(show.ecg === 'lab');
  const layout = show.layout ?? 'simultaneous';
  if (ecg.layout !== layout) ecg.setLayout(layout);
  if (ecg.caliperMode) ecg.toggleCalipers();
  if (ecg.selectedLead !== (show.lead ?? null)) useECGStore.setState({ selectedLead: show.lead ?? null });
  if (ecg.inspectLead !== (show.inspect ?? null)) ecg.setInspectLead(show.inspect ?? null);
}

/** Put the active step on screen (again): after a step change, a resume, or a change of screen shape */
export function applyStep() {
  const a = useCourseStore.getState().active;
  if (!a) return;
  const found = findLesson(a.course, a.lesson);
  if (!found) return;
  applyShow(effectiveShow(found.lesson.steps, Math.min(a.step, found.lesson.steps.length - 1)));
}

// ─── Taking a lesson ───────────────────────────────────────────────────────

/** Start (or resume) a lesson: it takes over the learning screen until it is finished or left */
export function startLesson(courseId: string, lessonId: string, fromStep?: number) {
  const found = findLesson(courseId, lessonId);
  if (!found) {
    // the library has not arrived yet (a reload straight into a lesson): try again once it has
    if (!useContentStore.getState().lib) void loadContent().then(() => { if (findLesson(courseId, lessonId)) startLesson(courseId, lessonId, fromStep); });
    return;
  }
  const app = useAppStore.getState();
  if (app.mode === 'simulator') leaveSimulator();
  // a fresh patient and a clean screen: nothing left over from the library or the tools
  useMedStore.getState().reset(null);
  useConditionStore.getState().selectCondition(null);
  useCaseStore.getState().resetCase();
  const saved = useCourseStore.getState().progress[lessonKey(courseId, lessonId)];
  const resume = saved && !saved.done && saved.step < found.lesson.steps.length ? saved.step : 0;
  shownRhythm = '';
  useCourseStore.getState().begin(courseId, lessonId, Math.max(0, Math.min(found.lesson.steps.length - 1, fromStep ?? resume)));
  app.setMode('learn');
  applyStep();
}

export function gotoStep(index: number) {
  const a = useCourseStore.getState().active;
  if (!a) return;
  const found = findLesson(a.course, a.lesson);
  if (!found) return;
  useCourseStore.getState().setStep(Math.max(0, Math.min(found.lesson.steps.length - 1, index)));
  applyStep();
}

/** The last step is done: record the result and show the lesson's summary card */
export function finishLesson() {
  const a = useCourseStore.getState().active;
  if (!a) return;
  const found = findLesson(a.course, a.lesson);
  if (found) useCourseStore.getState().finish(checksIn(found.lesson));
}

/** Hand the screen back as the rest of the app expects it: normal sinus rhythm in real time, both drawers away */
export function tidy() {
  const app = useAppStore.getState();
  const ecg = useECGStore.getState();
  const scene = useSceneStore.getState();
  useTimelineStore.getState().setSpeed(1);
  showRhythm('normal-sinus');
  shownRhythm = '';
  if (ecg.electrodeLab) ecg.setElectrodeLab(false);
  ecg.setBottomView('ecg');
  ecg.setLayout('simultaneous');
  ecg.setInspectLead(null);
  useECGStore.setState({ selectedLead: null });
  scene.setHighlights([]);
  scene.selectStructure(null);
  if (app.viewMode !== 'external') app.setViewMode('external');
  if (!app.labelsVisible) app.toggleLabels();
  if (!app.showFlow) app.toggleFlow();
  if (app.showVector) app.toggleVector();
  app.setHeart('closed');
  app.setEcg('closed');
}

/** Leave the lesson. `to`: where to go — the course list (the default), or nowhere (the caller navigates next) */
export function exitLesson(to: 'courses' | 'stay' = 'courses') {
  if (!useCourseStore.getState().active) return;
  useCourseStore.getState().end();
  tidy();
  if (to === 'courses') useAppStore.getState().setMode('courses');
}
