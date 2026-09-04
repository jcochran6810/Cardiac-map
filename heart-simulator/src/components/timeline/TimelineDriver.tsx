'use client';

import { useEffect } from 'react';
import { useTimelineStore } from '@/store/useTimelineStore';

/**
 * Advances the shared cardiac timeline with its own animation-frame loop, so
 * the ECG, hemodynamics and case vitals keep running even when the 3D scene
 * is hidden (mobile tabs) or not yet loaded.
 */
export default function TimelineDriver() {
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      useTimelineStore.getState().tick(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return null;
}
