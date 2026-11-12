import { describe, expect, it } from 'vitest';
import { closeTrainer, leaveSet, nextTracing, openTrainer, startSet } from '@/lib/drillRun';
import { useDrillStore } from '@/store/useDrillStore';
import { useECGStore } from '@/store/useECGStore';

/** The parts of the trainer's state that make up "where the learner was" in a set */
const place = () => {
  const { setId, question, picked, asked, right, streak } = useDrillStore.getState();
  return { setId, question, picked, asked, right, streak };
};

describe('rhythm trainer: the set just left, chosen again from the list of sets', () => {
  it('carries on as it was ("Continue" on the list matches browser Forward): the open tracing and this visit\'s score', () => {
    openTrainer();
    startSet('core');
    useDrillStore.getState().answer('unsure');
    nextTracing();
    const was = place();
    expect(was).toMatchObject({ setId: 'core', picked: null, asked: 1, right: 0 });

    // Sets → the list, then "Continue" on Core rhythms
    leaveSet();
    expect(useDrillStore.getState().setId).toBeNull();
    startSet('core');
    expect(place()).toEqual(was);
    // the monitor shows the tracing of that question again (the list of sets had put sinus rhythm up)
    expect(useECGStore.getState().activeProfileId).toBe(was.question!.profile);
    closeTrainer('stay');
  });

  it('keeps an answered tracing answered, also after the trainer was closed in between', () => {
    openTrainer();
    startSet('blocks');
    const { question } = useDrillStore.getState();
    useDrillStore.getState().answer(question!.profile);
    const was = place();
    expect(was).toMatchObject({ picked: question!.profile, asked: 1, right: 1, streak: 1 });

    // ✕ to the menu, then Practice rhythms → Continue
    closeTrainer('home');
    openTrainer();
    startSet('blocks');
    expect(place()).toEqual(was);
    closeTrainer('stay');
  });

  it('starts any other set afresh, and once a set has been carried on, the next choice of it is a fresh run', () => {
    openTrainer();
    startSet('core');
    useDrillStore.getState().answer('unsure');
    leaveSet();
    // another set: a new run, not the score of the set that was left
    startSet('blocks');
    expect(place()).toMatchObject({ setId: 'blocks', picked: null, asked: 0, right: 0, streak: 0 });
    // the set left last is now Blocks: Core rhythms starts afresh
    leaveSet();
    startSet('core');
    expect(place()).toMatchObject({ setId: 'core', picked: null, asked: 0, right: 0, streak: 0 });
    // Core rhythms is carried on once…
    useDrillStore.getState().answer('unsure');
    leaveSet();
    startSet('core');
    expect(useDrillStore.getState().asked).toBe(1);
    // …and from inside the set (no set left since), choosing it again is a fresh run
    useDrillStore.getState().leaveSet(); // (the store alone: nothing kept)
    startSet('core');
    expect(place()).toMatchObject({ setId: 'core', asked: 0 });
    closeTrainer('stay');
  });

  it('forgets the set that was left once progress is reset: choosing it again is a fresh run', () => {
    openTrainer();
    startSet('core');
    useDrillStore.getState().answer('unsure');
    nextTracing();
    // ✕ to the menu, then Help → Reset my progress (which clears the trainer's scores)
    closeTrainer('home');
    useDrillStore.getState().resetStats();
    openTrainer();
    startSet('core');
    expect(place()).toMatchObject({ setId: 'core', picked: null, asked: 0, right: 0, streak: 0 });
    // (and a set left after the reset is carried on as before)
    useDrillStore.getState().answer('unsure');
    leaveSet();
    startSet('core');
    expect(useDrillStore.getState().asked).toBe(1);
    closeTrainer('stay');
  });

  it('keeps the set that was left when the scores change in other ways (an answer in another set)', () => {
    openTrainer();
    startSet('core');
    useDrillStore.getState().answer('unsure');
    const was = place();
    leaveSet();
    // the stats object is replaced on every answer; only an emptied one is a reset
    useDrillStore.setState({ stats: { ...useDrillStore.getState().stats } });
    startSet('core');
    expect(place()).toEqual(was);
    closeTrainer('stay');
  });
});
