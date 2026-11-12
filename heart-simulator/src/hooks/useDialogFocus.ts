'use client';

import { useEffect, useRef, type RefObject } from 'react';

const TABBABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])', 'select:not([disabled])',
  'textarea:not([disabled])', 'summary', '[contenteditable="true"]', '[tabindex]:not([tabindex="-1"])',
].join(',');

const DIALOG = '[role="dialog"], [role="alertdialog"]';

/** The controls Tab can reach inside `root`, in page order (hidden ones — display: none, inert — left out) */
function tabbables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (el) => el.tabIndex >= 0 && el.getClientRects().length > 0 && !el.closest('[inert]'),
  );
}

/** Where the focus goes when it enters `root`: the element marked `data-autofocus`, else the first control */
const firstIn = (root: HTMLElement) => root.querySelector<HTMLElement>('[data-autofocus]') ?? tabbables(root)[0] ?? root;

/** Does `a` come before `b` in the page? */
const before = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

// ─── The open dialogs ─────────────────────────────────────────────────────
// One keyboard handler serves every open dialog: the last one opened is on top and has the keyboard.

interface Layer { root: HTMLElement; close: () => void }
const layers: Layer[] = [];
/**
 * A sheet that another component portalled into <body> over the top dialog without focus handling of its own
 * (the iPhone / iPad install steps opened from Help), and the dialog's control the focus came from.
 */
let sheet: { el: HTMLElement; back: HTMLElement | null } | null = null;
let observer: MutationObserver | null = null;
/**
 * The key press that began while a dialog was open. It belongs to the dialog all the way through, even when the
 * dialog's own handler closes the dialog on it (React re-renders between two listeners of one key press, so by the
 * time the press reaches `onKey` the dialog may have gone and "?" would open Help again behind it).
 */
let held: KeyboardEvent | null = null;
let listening = false;

const top = (): Layer | undefined => layers[layers.length - 1];

/** A dialog portalled into <body> after the app that holds `root` (so drawn over it), if one is on screen */
function sheetOver(root: HTMLElement): HTMLElement | null {
  const kids = document.body.children;
  for (let i = kids.length - 1; i >= 0; i--) {
    const el = kids[i] as HTMLElement;
    if (el.contains(root)) return null; // reached the app the dialog is in: nothing is portalled over it
    const d = el.matches(DIALOG) ? el : el.querySelector<HTMLElement>(DIALOG);
    if (d && d.getClientRects().length > 0 && !layers.some((l) => l.root.contains(d) || d.contains(l.root))) return d;
  }
  return null;
}

/** A sheet opened over the top dialog takes the focus; when it goes, the focus goes back where it was */
function watchSheets() {
  const layer = top();
  if (!layer) return;
  const over = sheetOver(layer.root);
  if (over === (sheet?.el ?? null)) return;
  const active = document.activeElement;
  if (over) {
    sheet = { el: over, back: active instanceof HTMLElement && layer.root.contains(active) ? active : sheet?.back ?? null };
    if (!over.contains(active)) firstIn(over).focus();
    return;
  }
  const back = sheet?.back;
  sheet = null;
  if (!active || active === document.body || !layer.root.contains(active)) {
    (back?.isConnected && layer.root.contains(back) ? back : firstIn(layer.root)).focus({ preventScroll: true });
  }
}

/** Tab and Shift+Tab go round `area`'s controls */
function trapTab(e: KeyboardEvent, area: HTMLElement) {
  const list = tabbables(area);
  const active = document.activeElement;
  if (!list.length) { e.preventDefault(); return; }
  const head = list[0];
  const tail = list[list.length - 1];
  let to: HTMLElement | null = null;
  if (!active || active === area || !area.contains(active)) to = e.shiftKey ? tail : head;
  // from the last control (or something after it, such as a focused heading) Tab comes round to the first …
  else if (!e.shiftKey && (active === tail || before(tail, active))) to = head;
  // … and Shift+Tab from the first (or from the heading above it) goes round to the last
  else if (e.shiftKey && (active === head || before(active, head))) to = tail;
  if (to) {
    e.preventDefault();
    to.focus();
  }
}

/** First in every key press (the window, capturing): is a dialog open as it starts? */
function onKeyStart(e: KeyboardEvent) {
  held = layers.length ? e : null;
}

/**
 * On `document`, so it runs after the dialog's own React key handlers (React listens on the document too, and was
 * there first) and before the app's shortcuts, which listen on the window.
 */
function onKey(e: KeyboardEvent) {
  if (held !== e) return;
  held = null;
  // a modal dialog has the keyboard: the app's shortcuts ("/" search, "?" help, T tutor, Space play …) wait until
  // it closes, wherever the focus is
  e.stopPropagation();
  const layer = top();
  if (!layer) return; // the dialog closed itself on this key
  const over = sheetOver(layer.root);
  if (e.key === 'Escape' && !e.defaultPrevented && !e.isComposing) {
    e.preventDefault();
    // Esc closes what is on top: a portalled sheet (as its Close button would) before the dialog under it
    if (over) over.querySelector<HTMLElement>('button[aria-label^="Close" i]')?.click();
    else layer.close();
  } else if (e.key === 'Tab' && !e.defaultPrevented) {
    trapTab(e, over ?? layer.root);
  }
}

function push(layer: Layer) {
  layers.push(layer);
  sheet = null;
  if (!listening) {
    // kept for good once a dialog has opened (two cheap listeners): a dialog that closes during a key press
    // must not take them away before that press has gone by
    listening = true;
    window.addEventListener('keydown', onKeyStart, true);
    document.addEventListener('keydown', onKey);
  }
  if (layers.length > 1) return;
  observer = new MutationObserver(watchSheets);
  observer.observe(document.body, { childList: true });
}

function remove(layer: Layer) {
  const i = layers.indexOf(layer);
  if (i < 0) return;
  layers.splice(i, 1);
  if (i === layers.length) sheet = null; // it was on top
  if (layers.length) return;
  observer?.disconnect();
  observer = null;
}

/**
 * Keyboard and screen-reader behaviour for a modal dialog, shared by the welcome card, Help and the Glossary:
 *
 * - on open, focus moves into the dialog — to `initial` if given, else to the element marked `data-autofocus`,
 *   else to its first control — so a screen reader announces it and Tab starts inside it;
 * - Tab and Shift+Tab go round the dialog's own controls instead of reaching the page behind it;
 * - while it is open the app's keyboard shortcuts do nothing, so "/" cannot put the focus in a search box behind it
 *   and "T" cannot open the tutor under it;
 * - Escape calls `onClose`, wherever the focus is;
 * - a sheet portalled over the dialog with no focus handling of its own (the iPhone install steps) gets the
 *   focus while it is open — Tab goes round its controls and Esc presses its Close button — and gives it back;
 * - on close, focus goes back to whatever had it before (the menu tile, the top-bar button …) if it is still there.
 *
 * Put the returned ref on the element with role="dialog" and aria-modal="true", and give that element
 * tabIndex={-1}: a click on the dialog's text then keeps the focus in the dialog instead of dropping it on the page.
 * Dialogs opened over one another stack: the last one opened has the keyboard.
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
    const layer: Layer = { root, close: () => closeRef.current() };
    push(layer);
    if (!root.contains(document.activeElement)) (initialRef.current?.current ?? firstIn(root)).focus();
    return () => {
      remove(layer);
      // only take the focus back if the dialog still had it (it is on <body> once the dialog has gone):
      // a page or form opened from inside the dialog keeps its own focus
      const lost = !document.activeElement || document.activeElement === document.body || root.contains(document.activeElement);
      if (lost && opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open]);

  return ref;
}
