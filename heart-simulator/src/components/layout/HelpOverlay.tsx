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

const GESTURES: [string, string][] = [
  ['Drag', 'Rotate the heart'],
  ['Pinch', 'Zoom in and out'],
  ['Two-finger drag', 'Move (pan) the heart'],
  ['Tap a structure', 'Open it in the info panel'],
  ['Tap a lead', 'Show its axis on the heart'],
  ['Double-tap a lead', 'Inspect it large with labelled intervals'],
  ['Drag the ECG', 'Scrub back and forth through time'],
  ['Drag the grip bar', 'Resize the ECG panel (double-tap to reset)'],
  ['⤢ button', 'Enlarge the ECG / monitor panel'],
];

export default function HelpOverlay() {
  const helpOpen = useAppStore((s) => s.helpOpen);
  const setHelpOpen = useAppStore((s) => s.setHelpOpen);
  const resetProgress = useLearningStore((s) => s.resetProgress);
  if (!helpOpen) return null;
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 phone:p-0" onClick={() => setHelpOpen(false)} role="dialog" aria-label="Help">
      <div className="w-full max-w-2xl max-h-[85dvh] overflow-y-auto bg-cardiac-panel border border-slate-600 rounded-xl shadow-2xl phone:max-w-none phone:h-full phone:max-h-none phone:rounded-none phone:border-0" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-cardiac-panel flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h2 className="text-sm font-semibold text-white">How to use CardioSim</h2>
          <button onClick={() => setHelpOpen(false)} className="p-1 touch:p-2 text-slate-400 hover:text-white" aria-label="Close help"><IconClose size={16} /></button>
        </div>
        <div className="p-4 grid md:grid-cols-2 gap-5 text-xs">
          <section className="hidden touch:block">
            <h3 className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Touch gestures</h3>
            <dl className="space-y-1.5">
              {GESTURES.map(([k, v]) => (
                <div key={k} className="flex gap-3">
                  <dt className="w-32 shrink-0 font-semibold text-slate-200">{k}</dt>
                  <dd className="text-slate-300">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="touch:hidden">
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
            <p><b className="text-white">ECG:</b> calibrated at 25 mm/s and 10 mm/mV (1 small box = 40 ms / 0.1 mV). Click (or tap) a lead to see its axis on the heart, double-click (double-tap) to inspect it with labelled intervals, and drag to scrub time.</p>
            <p><b className="text-white">Roles &amp; scope of practice:</b> choose EMT, Paramedic, Cath Lab Tech, Cath Lab Nurse or Cardiologist in the top bar. The “Focus” guidance, recommended tabs (green dots), quiz questions, case roles and monitor/defibrillator permissions follow that role&apos;s scope: EMT and Paramedic per the National EMS Scope of Practice Model (NREMT); cath lab tech per RCIS / SCAI best practices and facility policy; cath lab nurse per the state Nurse Practice Act; cardiologists without limits beyond their privileges. Press <b>Scope</b> next to the role selector for details (on a phone, tap your role at the top left). Local protocols, medical direction and facility policy always govern real practice.</p>
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
