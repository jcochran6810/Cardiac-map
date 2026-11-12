'use client';

import { useLayoutEffect, useRef } from 'react';

/** Where focus can go back to: an element on the page, not <body> and not inside another open panel */
function returnable(el: Element | null): HTMLElement | null {
  return el instanceof HTMLElement && el !== document.body && el.isConnected && !el.closest('[role="dialog"]') ? el : null;
}

/**
 * Keyboard focus for a panel that opens over the screen without being modal (the quiz, the tutor): focus moves in and
 * back, but Tab is not held inside — for the modal dialogs (Welcome, Help, Glossary) see `src/hooks/useDialogFocus.ts`.
 *
 * On opening, focus moves into the panel: to whatever `target` returns, after `delay` ms if one is given (the tutor
 * waits a moment, so the "T" that opened it is not typed into its question box). On closing, focus goes back to the
 * control that opened it — unless the learner has already put it somewhere else on the page.
 *
 * One panel can replace another in a single step ("T" while the quiz is open puts the quiz away and opens the tutor).
 * The panel that opens may then look before the one that closed has handed focus back to its own opener, and find
 * nothing focused; so a panel that waits before taking focus looks again just then, and in the end returns focus to
 * that control. (A panel that takes focus at once is rendered after the one it replaces, which has handed focus back
 * by then.)
 */
export function usePanelFocus(open: boolean, target: () => HTMLElement | null, delay = 0) {
  const opener = useRef<HTMLElement | null>(null);
  const targetRef = useRef(target);
  targetRef.current = target;

  useLayoutEffect(() => {
    if (open) {
      const active = document.activeElement;
      opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
      const into = () => {
        opener.current ??= returnable(document.activeElement);
        targetRef.current()?.focus({ preventScroll: true });
      };
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
