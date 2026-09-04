'use client';

import { useEffect, useState } from 'react';

/** Breakpoint below which the single-column mobile layout is used. */
export const MOBILE_QUERY = '(max-width: 900px)';
/** Coarse pointer (touch) — used to enlarge hit targets and drop hover-only hints. */
export const TOUCH_QUERY = '(pointer: coarse)';

function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);
  return matches;
}

export function useIsMobile(): boolean {
  return useMedia(MOBILE_QUERY);
}

export function useIsTouch(): boolean {
  return useMedia(TOUCH_QUERY);
}
