'use client';

import { useCallback, useState } from 'react';

/** A first-time tip: shown until the learner dismisses it (remembered on this device) */
export function useOnceHint(key: string): [boolean, () => void] {
  const storageKey = `cardiosim.hint.${key}`;
  const [show, setShow] = useState(() => {
    try { return !window.localStorage.getItem(storageKey); } catch { return true; }
  });
  const dismiss = useCallback(() => {
    setShow(false);
    try { window.localStorage.setItem(storageKey, '1'); } catch { /* storage unavailable */ }
  }, [storageKey]);
  return [show, dismiss];
}
