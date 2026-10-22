'use client';

import React from 'react';
import { useAppStore, type ViewMode } from '@/store/useAppStore';
import { useECGStore } from '@/store/useECGStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { IconChevron, IconCollapse, IconCube, IconExpand, IconPulse } from '@/components/ui/icons';

const VIEW_LABEL: Record<ViewMode, string> = {
  external: 'Exterior', sectioned: 'Sectioned', xray: 'X-ray', conduction: 'Conduction', territories: 'Territories', activation: 'Activation map',
};
const ECG_LABEL = { ecg: '12-lead EKG', wiggers: 'Pressure & volume', defib: 'Defibrillator' } as const;

/**
 * The learning screen's two drawer bars: "3D heart" at the top slides the heart down,
 * "12-lead EKG" at the bottom slides the ECG up. The same button closes it again; ⤢ gives it the whole screen.
 */
export default function DrawerBar({ kind, style }: { kind: 'heart' | 'ecg'; style?: React.CSSProperties }) {
  const state = useAppStore((s) => (kind === 'heart' ? s.heart : s.ecg));
  const viewMode = useAppStore((s) => s.viewMode);
  const bottomView = useECGStore((s) => s.bottomView);
  const hr = useTimelineStore((s) => s.displayHR);
  const open = state !== 'closed';
  const heart = kind === 'heart';
  const name = heart ? '3D heart' : ECG_LABEL[bottomView];

  const toggle = () => (heart ? useAppStore.getState().toggleHeart() : useAppStore.getState().toggleEcg());
  const toggleFull = () => {
    const app = useAppStore.getState();
    if (heart) app.setHeart(state === 'full' ? 'open' : 'full');
    else app.setEcg(state === 'full' ? 'open' : 'full');
  };
  // the heart slides down from the top, the ECG up from the bottom: the arrow shows which way the tap moves it
  const down = heart ? !open : open;

  return (
    <div
      style={style}
      className={`relative z-[5] grid grid-cols-[1fr_auto_1fr] items-center gap-2 h-10 short:h-8 px-2 bg-cardiac-panel border-slate-700 ${heart ? 'border-b' : 'border-t'}`}
    >
      <div className="min-w-0 flex items-center gap-1.5 text-[11px] text-slate-400 truncate">
        {heart ? (
          <span className="truncate hidden xs:inline">{open ? `${VIEW_LABEL[viewMode]} view` : ''}</span>
        ) : (
          <span className="font-mono text-emerald-400" title="Heart rate on the monitor">{hr > 0 ? hr : '---'}<span className="ml-0.5 font-sans text-[10px] text-slate-500">bpm</span></span>
        )}
      </div>

      <button
        onClick={toggle}
        aria-expanded={open}
        aria-controls={`${kind}-drawer`}
        title={open ? `Hide the ${name} (${heart ? 'H' : 'K'})` : `Show the ${name} (${heart ? 'H' : 'K'})`}
        className={`flex items-center gap-1.5 h-8 short:h-7 px-4 rounded-full border text-[13px] short:text-xs font-semibold whitespace-nowrap transition-colors ${
          open ? 'border-slate-500 bg-cardiac-surface/70 text-slate-100 hover:bg-cardiac-surface' : 'border-cardiac-accent/60 bg-cardiac-accent/15 text-cardiac-accent hover:bg-cardiac-accent/25'
        }`}
      >
        {heart ? <IconCube size={15} /> : <IconPulse size={15} />}
        {open ? `Hide ${heart ? '3D heart' : 'EKG'}` : name}
        <IconChevron size={14} className={down ? 'rotate-90' : '-rotate-90'} />
      </button>

      <div className="flex justify-end">
        {open && (
          <button
            onClick={toggleFull}
            className="w-8 h-8 short:w-7 short:h-7 flex items-center justify-center rounded-md text-slate-300 hover:text-white hover:bg-cardiac-surface border border-slate-600"
            title={state === 'full' ? 'Shrink it so the reading shows again' : 'Use the whole screen'}
            aria-label={state === 'full' ? `Shrink the ${name}` : `Enlarge the ${name}`}
            aria-pressed={state === 'full'}
          >
            {state === 'full' ? <IconCollapse size={14} /> : <IconExpand size={14} />}
          </button>
        )}
      </div>
    </div>
  );
}
