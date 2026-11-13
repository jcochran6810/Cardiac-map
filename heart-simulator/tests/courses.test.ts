import { beforeEach, describe, expect, it } from 'vitest';
import { COURSES } from '@/data/courses';
import { CATHLAB } from '@/data/content/cathlab';
import { CASE_DATA } from '@/data/caseData';
import {
  checkHidesRhythm, checksIn, courseProgress, coursesFor, drawersFor, effectiveShow, exitLesson, gotoStep, lessonInProgress, midSentence, nextLesson,
  openLesson, optionOrder, pickableOnHeart, startLesson, thatIs,
} from '@/lib/courses';
import { PLACEMENT_PRESETS } from '@/lib/ecg/electrodes';
import { lessonKey, useCourseStore } from '@/store/useCourseStore';
import { loadContent, searchLibrary } from '@/lib/content';
import { CAMERA_PRESETS } from '@/store/useSceneStore';
import { LABEL_SETS } from '@/lib/anatomy/labelSets';
import { LANDMARK_BY_ID } from '@/lib/anatomy/landmarks';
import { CONDUCTION_IDS } from '@/lib/anatomy/categories';
import { ECG_PROFILES, resolveProfile } from '@/lib/ecg/profiles';
import { ALL_LEADS } from '@/lib/ecg/vector';
import { CONDITION_IDS, ECG_PROFILE_IDS, MEDICATION_IDS, PROCEDURE_IDS, STRUCTURE_IDS } from '@/types/content';
import type { Course, Lesson, LessonStep, StepShow } from '@/types/course';
import { ROLES, type ViewMode } from '@/store/useAppStore';

const has = (list: readonly string[], id: string) => list.includes(id);
const LIBRARY_ID = (id: string) =>
  has(STRUCTURE_IDS, id) || has(CONDITION_IDS, id) || has(PROCEDURE_IDS, id) || has(MEDICATION_IDS, id) || !!CATHLAB[id] || !!CASE_DATA[id];

/** Can this structure be seen in this 3D view? (the rule the name tags use) */
function visibleIn(view: ViewMode, id: string): boolean {
  const l = LANDMARK_BY_ID[id];
  if (!l) return false;
  switch (view) {
    case 'external': case 'territories': case 'activation': return l.surface;
    case 'sectioned': return !!l.section;
    case 'conduction': return CONDUCTION_IDS.includes(id) || !l.surface;
    case 'xray': return true;
  }
}

/** Can the learner tap it: on its name tag (when tags are on), or on the heart itself where that picks structures */
function tappable(view: ViewMode, labels: boolean, id: string): boolean {
  return (labels && LABEL_SETS[view].includes(id)) || pickableOnHeart(view, id);
}

const steps: { course: Course; lesson: Lesson; step: LessonStep; i: number; show: StepShow; where: string }[] = [];
for (const course of COURSES) {
  for (const lesson of course.lessons) {
    lesson.steps.forEach((step, i) => steps.push({ course, lesson, step, i, show: effectiveShow(lesson.steps, i), where: `${course.id}/${lesson.id} step ${i + 1} "${step.title}"` }));
  }
}

describe('course catalogue', () => {
  it('has courses with unique ids, and lessons with unique ids inside each', () => {
    expect(COURSES.length).toBeGreaterThan(0);
    expect(new Set(COURSES.map((c) => c.id)).size).toBe(COURSES.length);
    for (const c of COURSES) {
      expect(c.id).toMatch(/^[a-z0-9-]+$/);
      expect(c.lessons.length, c.id).toBeGreaterThan(0);
      expect(new Set(c.lessons.map((l) => l.id)).size, c.id).toBe(c.lessons.length);
      expect(c.roles.length, c.id).toBeGreaterThan(0);
      for (const r of c.roles) expect(ROLES).toContain(r);
      expect(c.title.length).toBeGreaterThan(3);
      expect(c.summary.length).toBeGreaterThan(20);
    }
  });

  it('offers every role a course written for it, listed first', () => {
    for (const role of ROLES) {
      const mine = COURSES.filter((c) => c.roles.includes(role));
      expect(mine.length, `role ${role}`).toBeGreaterThanOrEqual(2);
      // …and the list for that role starts with them
      expect(coursesFor(role, COURSES).slice(0, mine.length)).toEqual(mine);
    }
  });

  it('writes the ED courses for the ER nurse and the ER doctor: the heart, the ECG, rhythms, STEMI and cardiac arrest', () => {
    for (const role of [6, 7] as const) {
      expect(COURSES.filter((c) => c.roles.includes(role)).map((c) => c.id), `role ${role}`)
        .toEqual(['heart-basics', 'ecg-foundations', 'rhythm-recognition', 'stemi', 'cardiac-arrest']);
    }
  });

  it.each(COURSES.flatMap((c) => c.lessons.map((l) => [`${c.id}/${l.id}`, l] as const)))('%s is a complete lesson', (_, lesson) => {
    expect(lesson.id).toMatch(/^[a-z0-9-]+$/);
    expect(lesson.title.length).toBeGreaterThan(3);
    expect(lesson.goal.length).toBeGreaterThan(15);
    expect(lesson.minutes).toBeGreaterThanOrEqual(2);
    expect(lesson.minutes).toBeLessThanOrEqual(15);
    expect(lesson.steps.length).toBeGreaterThanOrEqual(4);
    expect(lesson.steps.length).toBeLessThanOrEqual(12);
    // enough checks to know the lesson landed
    expect(checksIn(lesson)).toBeGreaterThanOrEqual(2);
  });
});

describe('every step', () => {
  it.each(steps.map((s) => [s.where, s] as const))('%s', (_, { step, show, i, lesson }) => {
    // words
    expect(step.title.trim().length).toBeGreaterThan(2);
    expect(step.text.length).toBeGreaterThanOrEqual(1);
    expect(step.text.length).toBeLessThanOrEqual(3);
    for (const p of step.text) {
      expect(p.trim().length).toBeGreaterThan(20);
      expect(p.length, 'a paragraph a phone can show without scrolling for ever').toBeLessThanOrEqual(520);
    }
    if (step.look) expect(step.look.length).toBeLessThanOrEqual(260);
    for (const r of Object.keys(step.roleNote ?? {})) expect(ROLES.map(String)).toContain(r);
    for (const id of step.more ?? []) expect(LIBRARY_ID(id), `"${id}" is in the library`).toBe(true);

    // what it shows
    const own = step.show ?? {};
    if (own.rhythm) {
      expect(has(ECG_PROFILE_IDS, own.rhythm), `rhythm ${own.rhythm}`).toBe(true);
      expect(resolveProfile(own.rhythm).id).toBe(own.rhythm);
    }
    if (show.hr !== undefined) {
      const p = ECG_PROFILES[show.rhythm ?? 'normal-sinus'];
      expect(p.rateControl, `${p.id} has a settable rate`).not.toBe('none');
      expect(show.hr).toBeGreaterThanOrEqual(p.minHR ?? 20);
      expect(show.hr).toBeLessThanOrEqual(p.maxHR ?? 250);
    }
    if (own.camera) expect(CAMERA_PRESETS.map((p) => p.short)).toContain(own.camera);
    if (own.lead) expect(ALL_LEADS).toContain(own.lead);
    if (own.inspect) expect(ALL_LEADS).toContain(own.inspect);
    const view: ViewMode = show.heart || 'external';
    const heartShown = drawersFor(show, false).heart;
    for (const id of [...(own.structure ? [own.structure] : []), ...(own.highlight ?? [])]) {
      expect(heartShown, `the heart is showing when ${id} is pointed at`).toBe(true);
      expect(visibleIn(view, id), `${id} can be seen in the ${view} view`).toBe(true);
    }
    if (own.lead || own.inspect) expect(show.ecg, 'the 12-lead is showing when a lead is pointed at').toBe('ecg');
    // a lesson never starts on an empty screen, and its first step says what the screen shows
    if (i === 0) expect(lesson.steps[0].show, 'the first step sets the scene').toBeTruthy();
    // a phone on its side has room for one picture: a check must be answerable on it
    // (what a step merely points at is the author's choice — a selected or enlarged lead shows on both pictures)
    const sideways = drawersFor(show, true);
    if (step.check?.kind === 'tap') {
      expect(sideways.heart, 'on a sideways phone the heart is the picture shown').toBe(true);
      // …on its own: side by side it is too narrow for its name tags (the step offers the other picture instead)
      expect(sideways.ecg, 'on a sideways phone a "tap the …" check has the heart to itself').toBe(false);
    }
    if (step.check?.kind === 'lead') expect(sideways.ecg, 'on a sideways phone the tracing is the picture shown').toBe(true);

    // its check
    const c = step.check;
    if (!c) return;
    expect(c.question.trim().length).toBeGreaterThan(8);
    expect(c.explain.trim().length).toBeGreaterThan(15);
    if (c.kind === 'choice') {
      expect(c.options.length).toBeGreaterThanOrEqual(2);
      expect(c.options.length).toBeLessThanOrEqual(5);
      expect(new Set(c.options.map((o) => o.trim().toLowerCase())).size).toBe(c.options.length);
      expect(c.answer).toBeGreaterThanOrEqual(0);
      expect(c.answer).toBeLessThan(c.options.length);
    } else if (c.kind === 'tap') {
      expect(c.targets.length).toBeGreaterThan(0);
      expect(heartShown, 'the heart is showing for a tap check').toBe(true);
      const labels = show.labels ?? true;
      for (const id of c.targets) expect(has(STRUCTURE_IDS, id), id).toBe(true);
      expect(c.targets.some((id) => tappable(view, labels, id)), `one of ${c.targets.join(', ')} can be tapped in the ${view} view`).toBe(true);
      // the answer is not already ringed on the heart
      if (own.structure) expect(c.targets).not.toContain(own.structure);
    } else {
      expect(c.targets.length).toBeGreaterThan(0);
      for (const l of c.targets) expect(ALL_LEADS).toContain(l);
      expect(show.ecg, 'the 12-lead is showing for a lead check').toBe('ecg');
      expect(show.layout ?? 'simultaneous', 'all twelve leads are on screen').not.toBe('monitor');
      expect(own.inspect ?? null, 'the leads are not hidden behind one enlarged lead').toBeNull();
      if (own.lead) expect(c.targets).not.toContain(own.lead);
    }
  });

  it('shows multiple-choice options in a shuffled but repeatable order, so the right answer has no fixed place', () => {
    for (const { step } of steps) {
      const c = step.check;
      if (c?.kind !== 'choice') continue;
      const order = optionOrder(c.question, c.options.length, c.fixed);
      expect([...order].sort((a, b) => a - b)).toEqual(c.options.map((_, k) => k));
      expect(optionOrder(c.question, c.options.length, c.fixed)).toEqual(order);
      if (c.fixed) expect(order).toEqual(c.options.map((_, k) => k));
    }
    // over many questions every place gets its fair share
    const places = [0, 0, 0, 0];
    for (let k = 0; k < 4000; k++) places[optionOrder(`Question ${k} about the heart?`, 4).indexOf(0)]++;
    for (const n of places) expect(Math.abs(n - 1000)).toBeLessThan(120);
  });
});

describe('what a step shows', () => {
  const lesson: LessonStep[] = [
    { title: 'a', text: ['x'], show: { heart: 'sectioned', rhythm: 'normal-sinus', hr: 70, speed: 0.25, structure: 'left-ventricle' } },
    { title: 'b', text: ['x'], show: { ecg: 'ecg', lead: 'II' } },
    { title: 'c', text: ['x'] },
    { title: 'd', text: ['x'], show: { rhythm: 'atrial-fibrillation', heart: false } },
  ];

  it('carries the scene on from earlier steps', () => {
    expect(effectiveShow(lesson, 1)).toMatchObject({ heart: 'sectioned', rhythm: 'normal-sinus', hr: 70, speed: 0.25, ecg: 'ecg' });
    expect(effectiveShow(lesson, 2)).toMatchObject({ heart: 'sectioned', ecg: 'ecg', speed: 0.25 });
  });

  it('clears the pointers (ringed structure, selected lead) at the next step', () => {
    expect(effectiveShow(lesson, 0).structure).toBe('left-ventricle');
    expect(effectiveShow(lesson, 1).structure).toBeUndefined();
    expect(effectiveShow(lesson, 1).lead).toBe('II');
    expect(effectiveShow(lesson, 2).lead).toBeUndefined();
  });

  it('gives a new rhythm its own usual rate unless the step sets one', () => {
    const s = effectiveShow(lesson, 3);
    expect(s.rhythm).toBe('atrial-fibrillation');
    expect(s.hr).toBeUndefined();
    expect(s.heart).toBe(false);
  });

  it('always opens a picture, and only one on a phone on its side', () => {
    expect(drawersFor({}, false)).toEqual({ heart: true, ecg: false });
    expect(drawersFor({ heart: 'external', ecg: 'ecg' }, false)).toEqual({ heart: true, ecg: true });
    expect(drawersFor({ heart: 'external', ecg: 'ecg' }, true)).toEqual({ heart: false, ecg: true });
    expect(drawersFor({ heart: 'external', ecg: 'ecg', focus: 'heart' }, true)).toEqual({ heart: true, ecg: false });
    expect(drawersFor({ heart: false, ecg: 'wiggers' }, true)).toEqual({ heart: false, ecg: true });
  });

  it('on a phone on its side shows both pictures when the step talks about both', () => {
    const steps: LessonStep[] = [
      { title: 'a', text: ['x'], show: { heart: 'external', ecg: 'ecg', inspect: 'II' }, look: 'Watch the cycle box on the 3D heart as the T wave passes.' },
      { title: 'b', text: ['x'], look: 'On the enlarged lead, a dashed line marks the ST segment.', show: { structure: 'left-ventricle' } },
      { title: 'c', text: ['x'], look: 'Watch the heart squeeze.', show: { structure: 'left-ventricle' } },
    ];
    expect(drawersFor(effectiveShow(steps, 0), true)).toEqual({ heart: true, ecg: true });
    expect(drawersFor(effectiveShow(steps, 1), true)).toEqual({ heart: true, ecg: true });
    expect(drawersFor(effectiveShow(steps, 2), true)).toEqual({ heart: true, ecg: false });
  });

  it('counts the cycle box ("the box", S1 / S2) as the heart and the pressure & volume loop as the other picture', () => {
    const scene = { heart: 'sectioned', ecg: 'ecg', layout: 'monitor' } as const;
    const steps: LessonStep[] = [
      { title: 'a', text: ['x'], show: { ...scene }, look: 'Just after each QRS the box shows all valves closed and "S1" lights up.' },
      { title: 'b', text: ['x'], show: { ecg: 'wiggers', focus: 'heart' }, look: 'The heart beats slowly.', check: { kind: 'choice', question: 'What happens at the top-right corner of the loop?', options: ['a', 'b'], answer: 0, explain: 'x' } },
      { title: 'c', text: ['x'], look: 'Each small box is 0.04 s; five small boxes make a large box.' },
    ];
    expect(drawersFor(effectiveShow(steps, 0), true)).toEqual({ heart: true, ecg: true });
    expect(drawersFor(effectiveShow(steps, 1), true)).toEqual({ heart: true, ecg: true });
    // the ECG paper's boxes are not the cycle box
    expect(drawersFor(effectiveShow([{ ...steps[0], look: undefined }, steps[2]], 1), true)).toEqual({ heart: false, ecg: true });
  });

  it('never puts the pictures side by side for a "tap the …" check, even when it talks about both', () => {
    const steps: LessonStep[] = [
      { title: 'a', text: ['x'], show: { heart: 'conduction', ecg: 'ecg', inspect: 'II' }, look: 'On the enlarged lead, the bracket marked PR measures the pause.', check: { kind: 'tap', question: 'Tap the AV node.', targets: ['av-node'], explain: 'x' } },
      { title: 'b', text: ['x'], show: { both: true }, check: { kind: 'tap', question: 'Tap the valve that opens at the top-right corner of the loop.', targets: ['aortic-valve'], explain: 'x' } },
    ];
    for (const k of [0, 1]) {
      expect(effectiveShow(steps, k).both).toBe(false);
      expect(drawersFor(effectiveShow(steps, k), true)).toEqual({ heart: true, ecg: false });
      // a wide screen still shows both (and on a phone on its side the step offers the other one)
      expect(drawersFor(effectiveShow(steps, k), false)).toEqual({ heart: true, ecg: true });
    }
  });

  it('shows the right picture at the "lub" and "dub" steps of One heartbeat on a phone on its side', () => {
    const cycle = COURSES.flatMap((c) => c.lessons).find((l) => l.id === 'cardiac-cycle')!;
    const at = (title: string) => drawersFor(effectiveShow(cycle.steps, cycle.steps.findIndex((s) => s.title === title)), true);
    // the QRS on the ECG and the cycle box on the heart
    expect(at('The valves shut: "lub"')).toEqual({ heart: true, ecg: true });
    // "S2" lights up in the cycle box on the heart
    expect(at('The valves shut again: "dub"')).toEqual({ heart: true, ecg: false });
  });

  it('sets the cables a step reads, so it does not depend on an earlier tap', () => {
    const ids = ['standard', ...PLACEMENT_PRESETS.map((p) => p.id)];
    let set = 0;
    for (const c of COURSES) for (const l of c.lessons) for (const s of l.steps) {
      if (s.show?.placement === undefined) continue;
      set++;
      expect(ids, `${c.id}/${l.id}: ${s.title}`).toContain(s.show.placement);
    }
    expect(set).toBeGreaterThan(0);
    // "Read the swapped tracing" has the arm cables swapped however the learner left the lab
    const lab = COURSES.flatMap((c) => c.lessons).find((l) => l.id === 'electrodes')!;
    const k = lab.steps.findIndex((s) => s.title === 'Read the swapped tracing');
    expect(effectiveShow(lab.steps, k).placement).toBe('la-ra');
    expect(effectiveShow(lab.steps, lab.steps.length - 1).placement).toBe('standard');
  });

  it('on a phone on its side shows the picture the step points at, unless the step says otherwise', () => {
    const both = { heart: 'external', ecg: 'ecg' } as const;
    const ask: LessonStep[] = [
      { title: 'scene', text: ['x'], show: { ...both } },
      { title: 'ring', text: ['x'], show: { structure: 'left-ventricle' } },
      { title: 'lead', text: ['x'], show: { lead: 'II' } },
      { title: 'tap', text: ['x'], check: { kind: 'tap', question: 'Tap the aorta', targets: ['ascending-aorta'], explain: 'x' } },
      { title: 'which lead', text: ['x'], check: { kind: 'lead', question: 'Tap a lead', targets: ['V1'], explain: 'x' } },
      { title: 'said', text: ['x'], show: { structure: 'left-ventricle', focus: 'ecg' } },
      { title: 'plain', text: ['x'] },
    ];
    const shown = (k: number) => drawersFor(effectiveShow(ask, k), true);
    expect(shown(0)).toEqual({ heart: false, ecg: true });
    expect(shown(1)).toEqual({ heart: true, ecg: false });
    expect(shown(2)).toEqual({ heart: false, ecg: true });
    expect(shown(3)).toEqual({ heart: true, ecg: false });
    expect(shown(4)).toEqual({ heart: false, ecg: true });
    expect(shown(5)).toEqual({ heart: false, ecg: true });
    // the pointer belonged to its own step: the next one is back to the tracing
    expect(shown(6)).toEqual({ heart: false, ecg: true });
  });
});

describe('what a check hides while it is open', () => {
  const step = (lessonId: string, k: number) => {
    for (const c of COURSES) for (const l of c.lessons) if (l.id === lessonId) return { s: l.steps[k], rhythm: effectiveShow(l.steps, k).rhythm };
    throw new Error(`no lesson ${lessonId}`);
  };
  const hides = (lessonId: string, k: number) => { const x = step(lessonId, k); return checkHidesRhythm(x.s, x.rhythm); };

  it('hides the rhythm\'s name for a question it would answer', () => {
    // "Strip 1: what is this rhythm?" and "Name the rhythm on this strip"
    expect(hides('mixed-practice', 1)).toBe(true);
    expect(hides('atrial', 8)).toBe(true);
    // "tap a lead": a name like "Inferior STEMI" gives the leads away
    expect(checkHidesRhythm({ title: 't', text: [], check: { kind: 'lead', question: 'Tap a lead', targets: ['II'], explain: 'x' } }, 'inferior-stemi')).toBe(true);
  });

  it('never hides the cycle box during a "tap the …" check on the heart, or for a question the name does not answer', () => {
    for (const c of COURSES) for (const l of c.lessons) l.steps.forEach((s, k) => {
      if (s.check?.kind === 'tap') expect(checkHidesRhythm(s, effectiveShow(l.steps, k).rhythm), `${c.id}/${l.id} step ${k + 1}`).toBe(false);
    });
    // "What are the ventricles doing during the ST segment?" — its look hint sends the learner to the cycle box
    expect(hides('waves-and-intervals', 4)).toBe(false);
  });

  it('lets a check say so itself', () => {
    const s = { title: 't', text: [], check: { kind: 'choice', question: 'What is this?', options: ['a', 'b'], answer: 0, explain: 'x', blind: true } } as LessonStep;
    expect(checkHidesRhythm(s, 'normal-sinus')).toBe(true);
  });

  it('hides the name for every strip of Mixed practice and every "which wall / which artery" question', () => {
    let strips = 0;
    let culprits = 0;
    for (const c of COURSES) for (const l of c.lessons) l.steps.forEach((s, k) => {
      if (s.check?.kind !== 'choice') return;
      const where = `${c.id}/${l.id} step ${k + 1}: ${s.check.question}`;
      if (l.id === 'mixed-practice' && /^Strip \d+/.test(s.check.question)) {
        strips++;
        expect(checkHidesRhythm(s, effectiveShow(l.steps, k).rhythm), where).toBe(true);
      }
      // a name such as "Lateral STEMI — LCx or diagonal occlusion" gives the wall and the artery away
      if (/\bwhich (\w+ )?(wall|artery)\b/i.test(s.check.question)) {
        culprits++;
        expect(checkHidesRhythm(s, effectiveShow(l.steps, k).rhythm), where).toBe(true);
      }
    });
    expect(strips).toBeGreaterThanOrEqual(10);
    expect(culprits).toBeGreaterThanOrEqual(3);
  });

  it('hides the name for every numbered tracing of "Localize it: nine tracings"', () => {
    // its look promises "the app keeps its own reading hidden until you answer" — for every tracing, whatever the
    // wording ("V1 to V3 show ST elevation on tracing 7. Is this a STEMI?" is answered by "…LBBB…")
    const l = COURSES.find((c) => c.id === 'stemi')?.lessons.find((x) => x.id === 'localize-it');
    expect(l).toBeDefined();
    let tracings = 0;
    l!.steps.forEach((s, k) => {
      if (!s.check || !/^Tracing \d+/.test(s.title)) return;
      tracings++;
      expect(checkHidesRhythm(s, effectiveShow(l!.steps, k).rhythm), `${s.title}: ${s.check.question}`).toBe(true);
    });
    expect(tracings).toBe(9);
  });

  it('reads the wordings that ask for the name, without a blind flag', () => {
    const ask = (question: string) => checkHidesRhythm({ title: 't', text: [], check: { kind: 'choice', question, options: ['a', 'b'], answer: 0, explain: 'x' } }, 'lateral-stemi');
    expect(ask('Read this tracing. Which wall is being injured?')).toBe(true);
    expect(ask('Strip 7: what does it show?')).toBe(true);
    expect(ask('ST elevation is taller in III than in II. Which artery is most likely blocked?')).toBe(true);
    expect(ask('Which coronary artery is the culprit?')).toBe(true);
    // …but not a question about times or the general idea of a wall
    expect(ask('You take him straight to a PCI-capable hospital. By what time does the system aim to have the artery open?')).toBe(false);
    expect(ask('Which finding says that a wall is being starved through its full thickness right now?')).toBe(false);
  });

  it('leaves the name and the cycle box on for questions the name does not answer', () => {
    // "Which rhythm loses the atrial kick completely?" — the step is about watching the atrial kick in the cycle box
    expect(hides('cardiac-cycle', 2)).toBe(false);
    // "…What is the pattern?" — 30 compressions to 2 breaths
    expect(hides('high-quality-cpr', 5)).toBe(false);
  });
});

describe('check feedback', () => {
  it('writes a structure\'s name in sentence case mid-sentence, keeping abbreviations and people\'s names', () => {
    expect(midSentence('Right Atrium')).toBe('right atrium');
    expect(midSentence("Bachmann's Bundle")).toBe("Bachmann's bundle");
    expect(midSentence('Bundle of His')).toBe('bundle of His');
    expect(midSentence('Purkinje Fibers')).toBe('Purkinje fibers');
    expect(midSentence('AV Node')).toBe('AV node');
    expect(midSentence('mLAD')).toBe('mLAD');
    expect(midSentence('Pericardium (Pericardial Sac)')).toBe('pericardium (pericardial sac)');
    expect(thatIs('Right Atrium')).toBe('That is the right atrium');
    expect(thatIs('Pulmonary Veins')).toBe('Those are the pulmonary veins');
    expect(thatIs('Coronary Sinus')).toBe('That is the coronary sinus');
    expect(thatIs('Chordae Tendineae')).toBe('Those are the chordae tendineae');
    // a possessive name takes no "the"
    expect(thatIs("Bachmann's Bundle")).toBe("That is Bachmann's bundle");
    expect(thatIs('Bundle of His')).toBe('That is the bundle of His');
    expect(thatIs('Purkinje Fibers')).toBe('Those are the Purkinje fibers');
  });
});

describe('course progress', () => {
  const course = COURSES[0];
  const [first, second] = course.lessons;
  beforeEach(() => {
    useCourseStore.getState().end();
    useCourseStore.getState().resetProgress();
  });

  it('scores a lesson by the checks answered right at the first try', () => {
    const st = useCourseStore.getState();
    st.begin(course.id, first.id, 0);
    expect(useCourseStore.getState().answer(1, true).ok).toBe(true);
    // wrong, then right: solved, but not a first-try point
    expect(useCourseStore.getState().answer(2, false).solved).toBe(false);
    const again = useCourseStore.getState().answer(2, true);
    expect(again).toMatchObject({ ok: false, solved: true, tries: 2 });
    // tapping on after it is solved changes nothing
    expect(useCourseStore.getState().answer(2, false)).toMatchObject({ ok: false, solved: true, tries: 2 });
    useCourseStore.getState().finish(checksIn(first));
    const p = useCourseStore.getState().progress[lessonKey(course.id, first.id)];
    expect(p).toMatchObject({ done: true, correct: 1, total: checksIn(first), step: 0 });
    expect(useCourseStore.getState().finished).toBe(true);
  });

  it('keeps the best score when a finished lesson is done again', () => {
    const run = (right: number) => {
      useCourseStore.getState().begin(course.id, first.id, 0, { fresh: true });
      for (let i = 0; i < right; i++) useCourseStore.getState().answer(i, true);
      useCourseStore.getState().finish(checksIn(first));
    };
    run(3);
    run(1);
    expect(useCourseStore.getState().progress[lessonKey(course.id, first.id)].correct).toBe(3);
  });

  it('remembers the step reached, and offers the newest unfinished lesson to continue', () => {
    expect(lessonInProgress(COURSES, useCourseStore.getState().progress)).toBeNull();
    useCourseStore.getState().begin(course.id, first.id, 0);
    useCourseStore.getState().setStep(2);
    useCourseStore.getState().end();
    const open = lessonInProgress(COURSES, useCourseStore.getState().progress);
    expect(open?.lesson.id).toBe(first.id);
    expect(open?.step).toBe(2);
  });

  it('keeps the answers when the lesson is left and resumed, and starts a new run empty', () => {
    const st = () => useCourseStore.getState();
    st().begin(course.id, first.id, 0);
    st().answer(1, true);
    st().answer(2, false);
    st().setStep(3);
    st().end();
    // resumed (the close button, Back, a library page and back): the answers come back
    st().begin(course.id, first.id, 3);
    expect(st().answers[1]).toMatchObject({ ok: true, solved: true });
    expect(st().answers[2]).toMatchObject({ ok: false, tries: 1 });
    st().finish(checksIn(first));
    expect(st().progress[lessonKey(course.id, first.id)].correct).toBe(1);
    // the finished run's result card, shown again: same answers
    st().end();
    st().begin(course.id, first.id, first.steps.length - 1, { finished: true });
    expect(st().finished).toBe(true);
    expect(Object.keys(st().answers)).toHaveLength(2);
    expect(st().progress[lessonKey(course.id, first.id)].done).toBe(true);
    // "Do this lesson again": a new run
    st().begin(course.id, first.id, 0, { fresh: true });
    expect(st().answers).toEqual({});
  });

  it('marks a result card shown again as restored, and the card of a run just finished as not', () => {
    const st = () => useCourseStore.getState();
    // a run with every check skipped: its own card scores and lists that run (nothing right), not the saved best
    st().begin(course.id, first.id, 0, { fresh: true });
    st().setStep(first.steps.length - 1);
    st().finish(checksIn(first));
    expect(st()).toMatchObject({ finished: true, restored: false, answers: {} });
    // Back to the finished lesson: its card is restored
    st().end();
    st().begin(course.id, first.id, first.steps.length - 1, { finished: true });
    expect(st()).toMatchObject({ finished: true, restored: true });
    // a step again (Back from the card): no longer the restored card
    st().setStep(1);
    expect(st()).toMatchObject({ finished: false, restored: false });
    st().begin(course.id, first.id, first.steps.length - 1, { finished: true });
    st().finish(checksIn(first));
    expect(st().restored).toBe(false);
    st().end();
    expect(st().restored).toBe(false);
  });

  it('resumes an unfinished lesson picked from a list (the result card\'s "Next lesson", search) with its answers', async () => {
    await loadContent();
    const st = () => useCourseStore.getState();
    st().begin(course.id, second.id, 0, { fresh: true });
    st().answer(1, true);
    st().setStep(3);
    exitLesson('stay');
    openLesson(course.id, second.id);
    expect(st().active?.step).toBe(3);
    expect(st().answers[1]).toMatchObject({ ok: true });
    expect(st().progress[lessonKey(course.id, second.id)]).toMatchObject({ step: 3, done: false });
    exitLesson('stay');
  });

  it('treats a new run of a finished lesson as a run in progress: it resumes, is offered to continue and keeps the best score', async () => {
    await loadContent();
    const st = () => useCourseStore.getState();
    const key = lessonKey(course.id, first.id);
    // a finished run with three checks right
    st().begin(course.id, first.id, 0, { fresh: true });
    for (let i = 0; i < 3; i++) st().answer(i, true);
    st().finish(checksIn(first));
    exitLesson('stay');
    expect(st().progress[key]).toMatchObject({ done: true, correct: 3 });
    expect(st().progress[key].rerun).toBeFalsy();

    // picked again from a list (or "Do this lesson again"): a new run from the top
    openLesson(course.id, first.id);
    expect(st().active?.step).toBe(0);
    expect(st().finished).toBe(false);
    expect(st().answers).toEqual({});
    expect(st().progress[key]).toMatchObject({ done: true, rerun: true, correct: 3 });
    gotoStep(2);
    st().answer(1, false);
    exitLesson('stay');
    // the menu offers it to continue…
    expect(lessonInProgress(COURSES, st().progress)).toMatchObject({ lesson: { id: first.id }, step: 2 });

    // …and coming back to it without a step (Back / Forward, "continue", a library page and back) resumes the run:
    // not the old result card scored from the new run's (empty) answers
    startLesson(course.id, first.id);
    expect(st().finished).toBe(false);
    expect(st().active?.step).toBe(2);
    expect(st().answers[1]).toMatchObject({ ok: false });
    exitLesson('stay');
    // the course list's row resumes it too
    openLesson(course.id, first.id);
    expect(st().active?.step).toBe(2);

    // finished: no longer a re-run, and the best score stays
    st().finish(checksIn(first));
    expect(st().progress[key]).toMatchObject({ done: true, rerun: false, correct: 3 });
    exitLesson('stay');
    expect(lessonInProgress(COURSES, st().progress)).toBeNull();
    // Back to it now shows its result card; picked from a list it starts again from the top
    startLesson(course.id, first.id);
    expect(st().finished).toBe(true);
    exitLesson('stay');
    openLesson(course.id, first.id);
    expect(st()).toMatchObject({ finished: false, answers: {} });
    expect(st().active?.step).toBe(0);
    exitLesson('stay');
  });

  it('counts finished lessons and names the next one', () => {
    expect(courseProgress(course, {}).done).toBe(0);
    expect(nextLesson(course, {})?.id).toBe(first.id);
    useCourseStore.getState().begin(course.id, first.id, 0);
    useCourseStore.getState().finish(checksIn(first));
    const p = useCourseStore.getState().progress;
    expect(courseProgress(course, p)).toMatchObject({ done: 1, total: course.lessons.length });
    expect(nextLesson(course, p)?.id).toBe(second.id);
    expect(courseProgress(course, p).minutesLeft).toBe(course.lessons.slice(1).reduce((a, l) => a + l.minutes, 0));
  });
});

describe('search', () => {
  const lib = { structures: {}, conditions: {}, procedures: {}, medications: {}, cathlab: {}, quiz: [], courses: COURSES };

  it('finds a lesson by its title, by a step title and by what it teaches', () => {
    const ids = (q: string) => searchLibrary(lib, [], q).filter((h) => h.kind === 'lesson').map((h) => h.id);
    expect(ids('wiring')).toContain('heart-basics/conduction');
    // a step title ("The right coronary artery") inside the coronary lesson
    expect(ids('right coronary')).toContain('heart-basics/coronaries');
    // the lesson's goal ("…name the four valves…")
    expect(ids('four valves')).toContain('heart-basics/blood-path');
    expect(ids('zzzz')).toEqual([]);
  });

  it('labels a lesson hit with its course', () => {
    const hit = searchLibrary(lib, [], 'wiring').find((h) => h.id === 'heart-basics/conduction');
    expect(hit).toMatchObject({ kind: 'lesson', name: 'The wiring that fires it', sub: 'Lesson · How the heart works' });
  });
});
