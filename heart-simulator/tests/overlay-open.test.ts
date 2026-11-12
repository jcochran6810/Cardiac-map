import { afterEach, describe, expect, it, vi } from 'vitest';

/** The stores read `window` (storage) as they load: a minimal one, installed before the app modules */
vi.hoisted(() => {
  Object.assign(globalThis, {
    window: Object.assign(new EventTarget(), {
      setTimeout, clearTimeout,
      localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    }),
  });
});

import { currentOverlay, onOverlayOpen } from '@/lib/backNav';
import { useAppStore } from '@/store/useAppStore';
import { useTutorStore } from '@/store/useTutorStore';
import { useFeedbackStore } from '@/store/useFeedbackStore';

/** Nothing open over the screen */
function closeAll() {
  const app = useAppStore.getState();
  app.setHelpOpen(false);
  app.setGlossaryOpen(false);
  app.setQuizOpen(false);
  useTutorStore.getState().setTutorOpen(false);
  useFeedbackStore.getState().setFormOpen(false);
  useFeedbackStore.getState().setAdminOpen(false);
}

afterEach(closeAll);

// The welcome card's note ("You're set up as …") ends when one of these opens over the main menu
describe('overlays opening over the screen', () => {
  it('currentOverlay names what is open', () => {
    closeAll();
    expect(currentOverlay()).toBeNull();
    useAppStore.getState().setGlossaryOpen(true);
    expect(currentOverlay()).toBe('glossary');
    useAppStore.getState().setHelpOpen(true);
    expect(currentOverlay()).toBe('help');
  });

  it('onOverlayOpen reports each overlay as it opens, not what was already open, and stops when asked', () => {
    closeAll();
    useAppStore.getState().setQuizOpen(true);
    const seen: string[] = [];
    const stop = onOverlayOpen((o) => seen.push(o));
    // the quiz was open before: not reported; other changes are not openings
    useAppStore.getState().toggleLabels();
    expect(seen).toEqual([]);
    useAppStore.getState().setQuizOpen(false);
    useAppStore.getState().setHelpOpen(true);
    useAppStore.getState().setHelpOpen(false);
    useTutorStore.getState().setTutorOpen(true);
    useTutorStore.getState().setTutorOpen(false);
    useFeedbackStore.getState().setFormOpen(true);
    expect(seen).toEqual(['help', 'tutor', 'feedback']);
    stop();
    useFeedbackStore.getState().setFormOpen(false);
    useAppStore.getState().setGlossaryOpen(true);
    expect(seen).toEqual(['help', 'tutor', 'feedback']);
  });
});
