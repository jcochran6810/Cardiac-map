'use client';

import { useEffect } from 'react';
import { sim } from '@/lib/sim/simulation';
import { auscultate } from '@/lib/physiology/heartSounds';
import { heartAudio } from '@/lib/audio/heartAudio';
import { useSoundStore } from '@/store/useSoundStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { useAppStore } from '@/store/useAppStore';

/** how far ahead of the simulation clock sounds are handed to the audio clock (ms of real time) */
const AHEAD = 250;
/** a sound this late (s) or later is not played at all */
const LATE = 0.06;

/**
 * Plays what a stethoscope would hear, in step with the beating heart: each frame the sounds that fall in
 * the next fraction of a second of simulation time are scheduled on the audio clock.
 * Silent while paused, in the case simulator and when the learner has not switched the sounds on.
 */
export default function HeartSoundDriver() {
  const on = useSoundStore((s) => s.heartSounds);
  const mode = useAppStore((s) => s.mode);
  const playing = useTimelineStore((s) => s.playing);
  const active = on && mode === 'learn' && playing;

  useEffect(() => {
    if (!active) {
      heartAudio.suspend();
      return;
    }
    heartAudio.enable();
    let raf = 0;
    // sounds up to this simulation time have been scheduled
    let done = sim.time;
    let epoch = sim.epoch;
    const loop = () => {
      const speed = Math.max(0.05, useTimelineStore.getState().speed);
      const now = sim.time;
      // the tracing was rewritten, or the clock jumped (scrub, tab in the background): start again from here
      if (sim.epoch !== epoch || now < done - AHEAD * speed * 2 || now > done + 1000) {
        done = now;
        epoch = sim.epoch;
      }
      const until = now + AHEAD * speed;
      if (until > done && heartAudio.ready) {
        const a = auscultate(sim.engine, sim.hemo, done, until);
        // a sound whose moment has already passed (a slow frame) is dropped: played late it would fall on the wrong part of the beat
        for (const s of a.sounds) {
          const wait = (s.t - now) / speed / 1000;
          if (wait > -LATE) heartAudio.thump(s.kind, wait);
        }
        for (const m of a.murmurs) {
          const wait = (m.t0 - now) / speed / 1000;
          const length = (m.t1 - m.t0) / speed / 1000;
          if (wait > -LATE) heartAudio.murmur(m, wait, length);
        }
        done = until;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  // leaving the app's tab or closing the page: no sound left hanging
  useEffect(() => () => heartAudio.suspend(), []);
  return null;
}
