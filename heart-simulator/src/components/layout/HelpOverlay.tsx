'use client';

import React from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useLearningStore } from '@/store/useLearningStore';
import { IconClose } from '@/components/ui/icons';

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play / pause the heartbeat'],
  ['← / →', 'Step 10 ms while paused (Shift = 100 ms)'],
  ['[ / ]', 'Slower / faster simulation'],
  ['1 – 6', 'Exterior · Sectioned · X-ray · Conduction · Territories · Activation map'],
  ['L', 'Toggle 3D labels'],
  ['F', 'Toggle blood flow (sectioned view)'],
  ['V', 'Toggle cardiac vector'],
  ['E', 'Switch ECG ↔ Wiggers / PV loop'],
  ['M', 'Monitor / defibrillator trainer'],
  ['/  or  Ctrl+K', 'Search everything'],
  ['Q · T', 'Open quiz · tutor'],
  ['?', 'This help'],
  ['Esc', 'Close panels / clear selection'],
];

export default function HelpOverlay() {
  const helpOpen = useAppStore((s) => s.helpOpen);
  const setHelpOpen = useAppStore((s) => s.setHelpOpen);
  const resetProgress = useLearningStore((s) => s.resetProgress);
  if (!helpOpen) return null;
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onClick={() => setHelpOpen(false)} role="dialog" aria-label="Help">
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-cardiac-panel border border-slate-600 rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h2 className="text-sm font-semibold text-white">How to use CardioSim</h2>
          <button onClick={() => setHelpOpen(false)} className="p-1 text-slate-400 hover:text-white" aria-label="Close help"><IconClose size={16} /></button>
        </div>
        <div className="p-4 grid md:grid-cols-2 gap-5 text-xs">
          <section>
            <h3 className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Keyboard shortcuts</h3>
            <dl className="space-y-1">
              {SHORTCUTS.map(([k, v]) => (
                <div key={k} className="flex gap-3">
                  <dt className="w-24 shrink-0"><kbd className="px-1.5 py-0.5 rounded bg-cardiac-dark border border-slate-600 font-mono text-[10px] text-slate-200">{k}</kbd></dt>
                  <dd className="text-slate-300">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="space-y-2 text-slate-300 leading-relaxed">
            <h3 className="text-[10px] uppercase tracking-wider text-slate-500">One heartbeat, many views</h3>
            <p>The ECG, 3D contraction, conduction animation, valve states, heart sounds and pressure curves are all generated from the same beat-by-beat event list, so they always agree — including AF, dropped beats and AV dissociation.</p>
            <p><b className="text-white">ECG:</b> calibrated at 25 mm/s and 10 mm/mV (1 small box = 40 ms / 0.1 mV). Click a lead to see its axis on the heart, double-click to inspect it with labelled intervals, and drag to scrub time.</p>
            <p><b className="text-white">Levels:</b> the level selector changes the “Focus” guidance and recommended tabs (green dots) throughout the app.</p>
            <p><b className="text-white">Monitor / Defib (M):</b> practise AED use, manual defibrillation, synchronised cardioversion, pacing and ACLS drugs on the live rhythm. Instructor mode loads scenarios and changes the patient; trainee mode hides rhythm names; Projector mirrors the monitor on a second screen.</p>
            <p><b className="text-white">Sources:</b> activation sequence after Durrer et al. (1970); AHA 17-segment model (Cerqueira 2002); lead derivation and electrode reversals per standard ECG references; C-arm angles cross-checked with SlicerHeart. See THIRD_PARTY_NOTICES.md.</p>
            <p><b className="text-white">How accurate is it?</b> Waveforms come from a cardiac dipole model with physiological intervals (QT corrected by Fridericia), and the hemodynamics are a teaching model with representative values. It is designed to teach patterns and relationships, not to reproduce any individual patient.</p>
          </section>
        </div>
        <div className="px-4 py-3 border-t border-slate-700 flex items-center justify-between text-[10px] text-slate-500">
          <span>Educational simulation only — not for diagnosis or treatment.</span>
          <button
            onClick={() => { if (window.confirm('Reset all progress and quiz history on this device?')) resetProgress(); }}
            className="text-slate-400 hover:text-red-300"
          >
            Reset my progress
          </button>
        </div>
      </div>
    </div>
  );
}
