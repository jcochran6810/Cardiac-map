'use client';

import { useEffect, useRef, type RefObject } from 'react';

const TABBABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])', 'select:not([disabled])',
  'textarea:not([disabled])', 'summary', '[contenteditable="true"]', '[tabindex]:not([tabindex="-1"])',
].join(',');

/** The controls Tab can reach inside `root`, in page order (hidden ones — display: none, inert — left out) */
function tabbables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (el) => el.tabIndex >= 0 && el.getClientRects().length > 0 && !el.closest('[inert]'),
  );
}

/** Does `a` come before `b` in the page? */
const before = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

/**
 * Keyboard and screen-reader behaviour for a modal dialog, shared by the welcome card, Help and the Glossary:
 *
 * - on open, focus moves into the dialog — to `initial` if given, else to the element marked `data-autofocus`,
 *   else to its first control — so a screen reader announces it and Tab starts inside it;
 * - Tab and Shift+Tab go round the dialog's own controls instead of reaching the page behind it;
 * - Escape calls `onClose` (and goes no further, so the app's own Esc shortcut does not act as well);
 * - on close, focus goes back to whatever had it before (the menu tile, the top-bar button …) if it is still there.
 *
 * Put the returned ref on the element with role="dialog" and give that element tabIndex={-1}: a click on the
 * dialog's text then keeps the focus in the dialog instead of dropping it on the page behind.
 * Keys are handled on that element, so a sheet another component portals over the dialog keeps its own keys.
 */
export function useDialogFocus<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  onClose: () => void,
  initial?: RefObject<HTMLElement | null>,
): RefObject<T> {
  const ref = useRef<T>(null);
  // the latest close handler and first-focus target, without re-running the effect on every render
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const initialRef = useRef(initial);
  initialRef.current = initial;

  useEffect(() => {
    const root = ref.current;
    if (!open || !root) return;
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const first = initialRef.current?.current ?? root.querySelector<HTMLElement>('[data-autofocus]') ?? tabbables(root)[0] ?? root;
    if (!root.contains(document.activeElement)) first.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = tabbables(root);
      const active = document.activeElement;
      if (!list.length) { e.preventDefault(); return; }
      const head = list[0];
      const tail = list[list.length - 1];
      let to: HTMLElement | null = null;
      if (!active || active === root || !root.contains(active)) to = e.shiftKey ? tail : head;
      // from the last control (or something after it, such as a focused heading) Tab comes round to the first …
      else if (!e.shiftKey && (active === tail || before(tail, active))) to = head;
      // … and Shift+Tab from the first (or from the heading above it) goes round to the last
      else if (e.shiftKey && (active === head || before(active, head))) to = tail;
      if (to) {
        e.preventDefault();
        to.focus();
      }
    };
    root.addEventListener('keydown', onKey);
    return () => {
      root.removeEventListener('keydown', onKey);
      // only take the focus back if the dialog still had it (it is on <body> once the dialog has gone):
      // a page or form opened from inside the dialog keeps its own focus
      const lost = !document.activeElement || document.activeElement === document.body || root.contains(document.activeElement);
      if (lost && opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open]);

  return ref;
}
