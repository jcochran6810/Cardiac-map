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

import { currentPage, startBackNav, useBackNavStore } from '@/lib/backNav';
import { useAppStore } from '@/store/useAppStore';
import { useSimStore } from '@/store/useSimStore';
import { useFeedbackStore } from '@/store/useFeedbackStore';
import { describePage } from '@/lib/feedback/context';
import { openById, openCategory, openCondition, openMedication, openTool, showEcg, showHeart } from '@/lib/actions';

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
