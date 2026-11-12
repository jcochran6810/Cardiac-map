import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * A minimal browser (history with popstate fired as a separate task, confirm, a controllable clock),
 * installed before the app modules load.
 */
const fake = vi.hoisted(() => {
  class FakeHistory {
    entries: unknown[] = [null];
    i = 0;
    get state() { return this.entries[this.i]; }
    get length() { return this.entries.length; }
    pushState(s: unknown) {
      this.entries = this.entries.slice(0, this.i + 1);
      this.entries.push(structuredClone(s));
      this.i += 1;
    }
    replaceState(s: unknown) { this.entries[this.i] = structuredClone(s); }
    go(n: number) {
      const t = this.i + n;
      if (t < 0 || t >= this.entries.length) return;
      this.i = t;
      setTimeout(() => {
        const ev = new Event('popstate') as Event & { state: unknown };
        ev.state = this.entries[this.i];
        window.dispatchEvent(ev);
      }, 0);
    }
    back() { this.go(-1); }
  }
  const ctl = { history: new FakeHistory(), answer: true, clock: 1000 };
  Object.assign(globalThis, {
    window: Object.assign(new EventTarget(), {
      history: ctl.history, confirm: () => ctl.answer, setTimeout, clearTimeout,
      localStorage: { getItem: () => null, setItem: () => undefined },
    }),
  });
  return ctl;
});

import { backOutOfTrainer, currentPage, startBackNav, useBackNavStore } from '@/lib/backNav';
import { useAppStore } from '@/store/useAppStore';
import { useSimStore } from '@/store/useSimStore';
import { useFeedbackStore } from '@/store/useFeedbackStore';
import { describePage } from '@/lib/feedback/context';
import { openById, openCategory, openCondition, openMedication, openTool, showEcg, showHeart } from '@/lib/actions';
import { exitLesson, gotoStep, startLesson } from '@/lib/courses';
import { useCourseStore } from '@/store/useCourseStore';
import { loadContent } from '@/lib/content';
import { closeTrainer, leaveSet, nextTracing, openTrainer, startSet } from '@/lib/drillRun';
import { useDrillStore } from '@/store/useDrillStore';
import { useECGStore } from '@/store/useECGStore';

const history = fake.history;
vi.spyOn(performance, 'now').mockImplementation(() => fake.clock);

const settle = async () => {
  for (let k = 0; k < 6; k++) await new Promise((r) => setTimeout(r, 0));
  fake.clock += 1000; // the learner pauses before the next tap
};

let stop: () => void;
beforeAll(() => { stop = startBackNav(); });
afterAll(() => stop());

const back = async () => { history.back(); await settle(); };

describe('the Back button moves through CardioSim pages', () => {
  it('starts on Home and adds a second Home entry on the first tap, so the first Back can ask', async () => {
    expect(currentPage().mode).toBe('home');
    window.dispatchEvent(new Event('pointerdown'));
    await settle();
    expect(history.i).toBe(1);
  });

  it('each screen and each opened item is a step; Back returns to the previous one', async () => {
    useAppStore.getState().setMode('learn');
    await settle();
    openCondition('anterior-stemi');
    await settle();
    openMedication('aspirin');
    await settle();
    expect(history.i).toBe(4);
    expect(currentPage().item).toBe('aspirin');

    await back();
    expect(currentPage()).toMatchObject({ mode: 'learn', item: 'anterior-stemi' });
    await back();
    expect(currentPage()).toMatchObject({ mode: 'learn' });
    expect(currentPage().item).not.toBe('anterior-stemi');
    await back();
    expect(currentPage().mode).toBe('home');
  });

  it('Back returns to the section of the page the learner left it on (a drug card opened from Give meds)', async () => {
    useAppStore.getState().setMode('home');
    await settle();
    openCondition('avnrt');
    await settle();
    const at = history.i;
    useAppStore.getState().setRightPanelTab('treat');
    await settle();
    // changing section is not a step of its own
    expect(history.i).toBe(at);
    openMedication('adenosine');
    await settle();
    expect(currentPage().item).toBe('adenosine');
    await back();
    expect(currentPage()).toMatchObject({ item: 'avnrt', tab: 'treat' });
    expect(useAppStore.getState().rightPanelTab).toBe('treat');
    useAppStore.getState().setMode('home');
    await settle();
  });

  it('cath lab catalog items are pages too', async () => {
    useAppStore.getState().setMode('learn');
    await settle();
    openById('cl-view-rao-cranial');
    await settle();
    expect(currentPage()).toMatchObject({ mode: 'learn', item: 'cl-view-rao-cranial' });
    expect(useAppStore.getState().activePanelCategory).toBe('cathlab');
    openById('cl-ffr');
    await settle();
    await back();
    expect(currentPage().item).toBe('cl-view-rao-cranial');
  });

  it('closing a drawer with its own control steps back over the entry that opened it', async () => {
    const app = useAppStore.getState();
    app.setMode('learn');
    await settle();
    const before = history.i;
    app.toggleEcg(); // the EKG slides up
    await settle();
    expect(history.i).toBe(before + 1);
    expect(currentPage().ecg).toBe('open');
    app.toggleEcg(); // and down again with the same button
    await settle();
    expect(history.i).toBe(before);
    expect(currentPage().ecg).toBe('closed');
  });

  it('Back closes the 3D heart and the EKG, and the list page comes back on a phone', async () => {
    const app = useAppStore.getState();
    // like AppShell on a phone: the list and the reading are separate pages
    app.setCompact(true);
    openCategory('conditions');
    await settle();
    expect(currentPage()).toMatchObject({ mode: 'learn', cat: 'conditions', list: true, heart: 'closed', ecg: 'closed' });
    openCondition('anterior-stemi');
    await settle();
    expect(currentPage()).toMatchObject({ item: 'anterior-stemi', list: false });
    showEcg();
    await settle();
    showHeart();
    await settle();
    expect(currentPage()).toMatchObject({ heart: 'open', ecg: 'open' });

    await back();
    expect(currentPage()).toMatchObject({ item: 'anterior-stemi', heart: 'closed', ecg: 'open' });
    await back();
    expect(currentPage()).toMatchObject({ item: 'anterior-stemi', heart: 'closed', ecg: 'closed', list: false });
    await back();
    expect(currentPage()).toMatchObject({ cat: 'conditions', list: true });
    app.setCompact(false);
  });

  it('main menu sections are pages: Back returns to the section before', async () => {
    openCategory('conditions');
    await settle();
    useAppStore.getState().setMode('home');
    await settle();
    openCategory('medications');
    await settle();
    expect(currentPage()).toMatchObject({ mode: 'learn', cat: 'medications' });
    await back();
    expect(currentPage().mode).toBe('home');
    await back();
    expect(currentPage()).toMatchObject({ mode: 'learn', cat: 'conditions' });
  });

  it('a tool from the main menu fills the screen; opening an item shrinks it so the reading shows', async () => {
    openTool('ecg');
    await settle();
    expect(currentPage()).toMatchObject({ mode: 'learn', ecg: 'full', heart: 'open', cat: 'conditions' });
    openById('inferior-stemi');
    await settle();
    expect(currentPage()).toMatchObject({ item: 'inferior-stemi', ecg: 'open' });
    await back();
    expect(currentPage()).toMatchObject({ ecg: 'full' });
  });

  it('the simulator: Back closes the action list, asks before leaving a case, and keeps you there if you cancel', async () => {
    const app = useAppStore.getState();
    app.setMode('simulator');
    await settle();
    useSimStore.getState().startScenario('stemi-anterior-field', 2);
    await settle();
    useSimStore.getState().setSheetOpen(true);
    await settle();
    expect(currentPage().sim).toBe('actions');

    await back();
    expect(currentPage().sim).toBe('case');

    fake.answer = false;
    await back();
    await settle();
    expect(currentPage().sim).toBe('case');
    expect(useSimStore.getState().state).not.toBeNull();

    fake.answer = true;
    await back();
    expect(currentPage().sim).toBe('list');
    expect(useSimStore.getState().state).toBeNull();
  });

  it('entries for a case that is gone are skipped', async () => {
    const sim = useSimStore.getState();
    sim.startScenario('svt-unstable-field', 2);
    await settle();
    useSimStore.getState().endScenario();
    useSimStore.getState().setReviewOpen(true);
    await settle();
    expect(currentPage().sim).toBe('review');
    useSimStore.getState().startScenario('svt-unstable-field', 2); // "try again"
    await settle();
    await back(); // skips the old run's review and case, lands on the case list
    await settle();
    expect(currentPage()).toMatchObject({ mode: 'simulator', sim: 'list' });
  });

  it('the feedback form and the admin panel are pages: Back closes them, and a closed one leaves no step behind', async () => {
    useAppStore.getState().setMode('home');
    await settle();
    const before = history.i;
    useFeedbackStore.getState().openForm('bug');
    await settle();
    expect(currentPage().overlay).toBe('feedback');
    expect(history.i).toBe(before + 1);
    await back();
    expect(useFeedbackStore.getState().formOpen).toBe(false);
    expect(currentPage().overlay).toBeNull();

    useFeedbackStore.getState().setAdminOpen(true);
    await settle();
    expect(currentPage().overlay).toBe('admin');
    useFeedbackStore.getState().setAdminOpen(false); // its own close button
    await settle();
    expect(history.i).toBe(before);
  });

  it('a report says where the learner was', async () => {
    useAppStore.getState().setMode('home');
    await settle();
    expect(describePage()).toBe('Main menu');
    useAppStore.getState().setMode('learn');
    openCondition('anterior-stemi');
    showEcg('ecg');
    await settle();
    // (names read "anterior stemi" until the content library loads)
    expect(describePage()).toMatch(/^Learn › Conditions & rhythms › anterior stemi \(.*12-lead open\)$/);
    useAppStore.getState().setMode('home');
    await settle();
  });

  it('a lesson is one page however many steps it has; Back leaves it and its place is kept', async () => {
    await loadContent();
    useAppStore.getState().setMode('home');
    await settle();
    useAppStore.getState().setMode('courses');
    await settle();
    expect(currentPage().mode).toBe('courses');
    expect(describePage()).toBe('Courses');
    const list = history.i;

    startLesson('heart-basics', 'chambers');
    await settle();
    expect(currentPage()).toMatchObject({ mode: 'learn', lesson: 'heart-basics/chambers', item: null, heart: 'closed', ecg: 'closed' });
    expect(history.i).toBe(list + 1);
    // the lesson shows its pictures itself: the heart is open although the page does not record it
    expect(useAppStore.getState().heart).not.toBe('closed');
    gotoStep(1);
    await settle();
    gotoStep(2);
    await settle();
    expect(history.i).toBe(list + 1);
    expect(describePage()).toBe('Course › How the heart works › Four chambers, two pumps (step 3 of 6)');

    await back();
    expect(currentPage().mode).toBe('courses');
    expect(useCourseStore.getState().active).toBeNull();
    expect(useAppStore.getState().heart).toBe('closed');

    // opened again it resumes where it was left; its own exit steps back over its entry
    startLesson('heart-basics', 'chambers');
    await settle();
    expect(useCourseStore.getState().active?.step).toBe(2);
    exitLesson();
    await settle();
    expect(currentPage().mode).toBe('courses');
    expect(history.i).toBe(list);
  });

  it('"read more" leaves a lesson for the library page, and Back returns to the lesson', async () => {
    startLesson('heart-basics', 'chambers');
    await settle();
    const lesson = history.i;
    exitLesson('stay');
    openById('left-ventricle');
    await settle();
    expect(currentPage()).toMatchObject({ mode: 'learn', lesson: null, item: 'left-ventricle' });
    expect(history.i).toBe(lesson + 1);
    await back();
    expect(currentPage().lesson).toBe('heart-basics/chambers');
    expect(useCourseStore.getState().active).toMatchObject({ course: 'heart-basics', lesson: 'chambers', step: 2 });
    await back();
    expect(currentPage().mode).toBe('courses');
    useAppStore.getState().setMode('home');
    await settle();
  });

  it('the rhythm trainer: the list of sets and each set in play are pages, its tracings are not; Back goes set → list → menu', async () => {
    useAppStore.getState().setMode('home');
    await settle();
    const menu = history.i;
    openTrainer();
    await settle();
    expect(currentPage()).toMatchObject({ mode: 'learn', lesson: 'tool/rhythm-trainer', drill: null, item: null });
    expect(describePage()).toBe('Rhythm trainer');
    expect(history.i).toBe(menu + 1);
    startSet('core');
    await settle();
    expect(currentPage()).toMatchObject({ lesson: 'tool/rhythm-trainer', drill: 'core' });
    expect(history.i).toBe(menu + 2);
    useDrillStore.getState().answer('unsure');
    nextTracing();
    await settle();
    expect(history.i).toBe(menu + 2);
    expect(describePage()).toBe('Rhythm trainer › Core rhythms');
    // a question is open: the ECG panel is showing its tracing
    expect(useAppStore.getState().ecg).not.toBe('closed');
    const question = useDrillStore.getState().question;

    await back();
    expect(currentPage()).toMatchObject({ mode: 'learn', lesson: 'tool/rhythm-trainer', drill: null });
    expect(useDrillStore.getState().setId).toBeNull();
    // Forward brings the set back as it was left: the same tracing and this visit's score
    history.go(1);
    await settle();
    expect(currentPage().drill).toBe('core');
    expect(useDrillStore.getState()).toMatchObject({ question, asked: 1, picked: null });
    await back();
    await back();
    expect(currentPage().mode).toBe('home');
    expect(useDrillStore.getState().open).toBe(false);
    expect(useAppStore.getState().ecg).toBe('closed');
  });

  it("the trainer's ✕ from a set opened from the menu steps back over the set and the list: Back on the menu does not reopen it", async () => {
    useAppStore.getState().setMode('home');
    await settle();
    const menu = history.i;
    openTrainer();
    await settle();
    // (Core rhythms was the set left last, in the test before: it carries on with that visit's score)
    startSet('core');
    await settle();
    useDrillStore.getState().answer('unsure');
    nextTracing();
    await settle();
    const asked = useDrillStore.getState().asked;
    expect(history.i).toBe(menu + 2);
    // (what the ✕ does)
    expect(backOutOfTrainer()).toBe(true);
    await settle();
    expect(history.i).toBe(menu);
    expect(currentPage()).toMatchObject({ mode: 'home', lesson: null });
    expect(useDrillStore.getState().open).toBe(false);
    // Forward still finds the list and then the set as it was left
    history.go(1);
    await settle();
    expect(currentPage()).toMatchObject({ lesson: 'tool/rhythm-trainer', drill: null });
    history.go(1);
    await settle();
    expect(currentPage()).toMatchObject({ lesson: 'tool/rhythm-trainer', drill: 'core' });
    expect(useDrillStore.getState().asked).toBe(asked);
    // the ✕ on the list of sets: one step back
    startSet('blocks');
    await settle();
    useDrillStore.getState().leaveSet();
    await settle();
    expect(backOutOfTrainer()).toBe(true);
    await settle();
    expect(currentPage().mode).toBe('home');
    // not opened from the menu (from the library's search): the ✕ is not a step back
    openCondition('atrial-fibrillation');
    await settle();
    openTrainer();
    await settle();
    expect(backOutOfTrainer()).toBe(false);
    closeTrainer();
    await settle();
    expect(currentPage().mode).toBe('home');
  });

  it('"read its page" leaves a set for the library, and Back returns to the set, the tracing and the answer', async () => {
    openTrainer();
    await settle();
    startSet('blocks');
    await settle();
    const set = history.i;
    const { question } = useDrillStore.getState();
    useDrillStore.getState().answer(question!.profile);
    // (what the trainer's button does)
    closeTrainer('stay');
    openById('atrial-fibrillation');
    await settle();
    expect(currentPage()).toMatchObject({ mode: 'learn', lesson: null, item: 'atrial-fibrillation' });
    expect(history.i).toBe(set + 1);
    await back();
    expect(currentPage()).toMatchObject({ lesson: 'tool/rhythm-trainer', drill: 'blocks' });
    expect(useDrillStore.getState()).toMatchObject({ open: true, setId: 'blocks', question, picked: question!.profile, asked: 1, right: 1 });
    // the monitor shows the tracing of the question again, not the library page's
    expect(useECGStore.getState().activeProfileId).toBe(question!.profile);
    await back();
    expect(currentPage().drill).toBeNull();
    useAppStore.getState().setMode('home');
    await settle();
  });

  it('"Continue" on the set just left (via Sets) carries on as browser Forward does: the same tracing and score', async () => {
    openTrainer();
    await settle();
    startSet('core');
    await settle();
    useDrillStore.getState().answer('unsure');
    nextTracing();
    await settle();
    const { question, asked, right, streak } = useDrillStore.getState();
    const was = { setId: 'core', question, picked: null, asked, right, streak };
    // (the trainer's "Sets" button), then "Continue" on Core rhythms
    leaveSet();
    await settle();
    expect(currentPage()).toMatchObject({ lesson: 'tool/rhythm-trainer', drill: null });
    startSet('core');
    await settle();
    expect(currentPage().drill).toBe('core');
    expect(useDrillStore.getState()).toMatchObject(was);
    expect(useECGStore.getState().activeProfileId).toBe(question!.profile);
    // Back to the list and Forward again: the same
    await back();
    expect(useDrillStore.getState().setId).toBeNull();
    history.go(1);
    await settle();
    expect(useDrillStore.getState()).toMatchObject(was);
    useAppStore.getState().setMode('home');
    await settle();
  });

  it('on Home, the first Back asks and the second one leaves', async () => {
    useAppStore.getState().setMode('home');
    await settle();
    while (history.i > 1) await back();
    expect(currentPage().mode).toBe('home');
    await back();
    expect(useBackNavStore.getState().exitHint).toBe(true);
    expect(history.i).toBe(1);
    history.back(); // second press within the hint: the app lets the browser leave
    await settle();
    expect(history.i).toBe(0);
  });
});
