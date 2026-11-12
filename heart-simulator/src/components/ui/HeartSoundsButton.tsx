'use client';

import React, { useEffect, useState } from 'react';
import { useSoundStore } from '@/store/useSoundStore';
import { toggleHeartSounds } from '@/lib/audio/sounds';
import { MURMUR_TEXT, soundsHeard } from '@/lib/physiology/heartSounds';
import { sim } from '@/lib/sim/simulation';
import { IconSpeaker, IconSpeakerOff } from '@/components/ui/icons';

const EXTRA: Record<string, string> = { s3: 'S3 (after S2)', s4: 'S4 (just before S1)', snap: 'opening snap' };

/**
 * Switches the heart sounds on and off. `pill`: the small rounded style used over the 3D heart. `cell`: a tile the size of
 * one number in the pressure-and-volume panel's grid, labelled Listen and lit while the sounds play (the grid keeps it
 * in sight beside the loop, where a full-width button would push the numbers out of a phone's short strip).
 */
export default function HeartSoundsButton({ pill = false, cell = false, className = '' }: { pill?: boolean; cell?: boolean; className?: string }) {
  const on = useSoundStore((s) => s.heartSounds);
  const unavailable = useSoundStore((s) => s.unavailable);
  if (unavailable) return null;
  const title = on ? 'Switch the heart sounds off' : 'Listen to the heart sounds, in time with the beat (headphones bring out the low tones)';
  if (cell) {
    return (
      <button
        onClick={toggleHeartSounds}
        title={title}
        aria-pressed={on}
        // (the tap area reaches a few pixels past the tile on every side: the numbers around it do not take taps)
        className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[26px] rounded-md border text-[11px] touch:text-[12px] font-semibold leading-none transition-colors after:absolute after:-inset-1.5 ${
          on ? 'bg-sky-500/25 border-sky-400/70 text-sky-100' : 'border-slate-500 text-slate-100 hover:bg-cardiac-surface'
        } ${className}`}
      >
        {on ? <IconSpeaker size={13} /> : <IconSpeakerOff size={13} />} Listen
      </button>
    );
  }
  if (pill) {
    return (
      <button
        onClick={toggleHeartSounds}
        title={title}
        aria-pressed={on}
        className={`px-2 py-0.5 touch:py-1.5 touch:px-2.5 rounded-full text-[11px] whitespace-nowrap shrink-0 border backdrop-blur-sm transition-colors flex items-center gap-1 ${
          on ? 'bg-sky-500/25 border-sky-400/50 text-sky-100' : 'bg-black/50 border-slate-600/60 text-slate-300 hover:text-white'
        } ${className}`}
      >
        {on ? <IconSpeaker size={12} /> : <IconSpeakerOff size={12} />} Heart sounds
      </button>
    );
  }
  return (
    <button
      onClick={toggleHeartSounds}
      title={title}
      aria-pressed={on}
      className={`flex items-center justify-center gap-1.5 h-8 touch:h-10 px-2.5 rounded-lg border text-[11px] font-semibold transition-colors ${
        on ? 'bg-sky-500/20 border-sky-400/60 text-sky-100' : 'border-slate-600 text-slate-200 hover:bg-cardiac-surface'
      } ${className}`}
    >
      {on ? <IconSpeaker size={14} /> : <IconSpeakerOff size={14} />} {on ? 'Sounds on' : 'Listen'}
    </button>
  );
}

/** While the sounds are on: what there is to hear with this heart and rhythm */
export function HeardLegend({ className = '' }: { className?: string }) {
  const on = useSoundStore((s) => s.heartSounds);
  const [heard, setHeard] = useState(() => soundsHeard(sim.engine, sim.hemo, sim.time));
  useEffect(() => {
    if (!on) return;
    const read = () => setHeard((old) => {
      const now = soundsHeard(sim.engine, sim.hemo, sim.time);
      return JSON.stringify(now) === JSON.stringify(old) ? old : now;
    });
    read();
    const id = window.setInterval(read, 500);
    return () => window.clearInterval(id);
  }, [on]);
  if (!on) return null;
  // 12 px, 13 px on touch screens: this is the text that explains what a learner is hearing
  return (
    <p className={`text-xs touch:text-[13px] leading-snug text-sky-100/90 ${className}`} aria-live="polite">
      {heard.silent ? 'No heart sounds: the heart is not pumping.' : (
        <>
          <b>You hear:</b> S1 (lub), S2 (dub){heard.extra.map((e) => `, ${EXTRA[e]}`).join('')}.
          {heard.murmur && <> {MURMUR_TEXT[heard.murmur]}.</>}
        </>
      )}
    </p>
  );
}
