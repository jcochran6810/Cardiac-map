'use client';

import { useLayoutEffect, useRef } from 'react';

/**
 * Keyboard focus for a panel that opens over the screen (the quiz, the tutor).
 *
 * On opening, focus moves into the panel: to whatever `target` returns, after `delay` ms if one is given (the tutor
 * waits a moment, so the "T" that opened it is not typed into its question box). On closing, focus goes back to the
 * control that opened it — unless the learner has already put it somewhere else on the page.
 */
export function useDialogFocus(open: boolean, target: () => HTMLElement | null, delay = 0) {
  const opener = useRef<HTMLElement | null>(null);
  const targetRef = useRef(target);
  targetRef.current = target;

  useLayoutEffect(() => {
    if (open) {
      const active = document.activeElement;
      opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
      const into = () => targetRef.current()?.focus({ preventScroll: true });
      if (!delay) {
        into();
        return;
      }
      const id = window.setTimeout(into, delay);
      return () => window.clearTimeout(id);
    }
    const back = opener.current;
    opener.current = null;
    const active = document.activeElement;
    // focus was in the panel, which has just gone (the browser puts it on <body>): hand it back
    if (back?.isConnected && (!active || active === document.body)) back.focus({ preventScroll: true });
  }, [open, delay]);
}
