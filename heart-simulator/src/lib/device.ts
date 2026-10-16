'use client';

import { useEffect, useState } from 'react';

/** Tablets and phones: side panels become drawers. */
export const COMPACT_QUERY = '(max-width: 1023px), (max-height: 500px)';
/** Phone-sized screens in either orientation (matches the Tailwind `phone:` variant). */
export const PHONE_QUERY = '(max-width: 639px), (max-height: 500px)';
/** A phone on its side: lay the heart and the ECG out side by side. */
export const LANDSCAPE_PHONE_QUERY = '(max-height: 500px) and (orientation: landscape)';
/** Finger-driven device (matches the Tailwind `touch:` variant). */
export const TOUCH_QUERY = '(hover: none) and (pointer: coarse)';

export function matches(query: string): boolean {
  return typeof window !== 'undefined' && window.matchMedia(query).matches;
}

export function useMediaQuery(query: string): boolean {
  const [hit, setHit] = useState(() => matches(query));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setHit(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return hit;
}

export const useIsTouch = () => useMediaQuery(TOUCH_QUERY);
