'use client';

import React from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useLearningStore } from '@/store/useLearningStore';
import { IconClose } from '@/components/ui/icons';
import { InstallButton } from '@/components/ui/InstallApp';

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play / pause the heartbeat'],
  ['← / →', 'Step 10 ms while paused (Shift = 100 ms)'],
  ['[ / ]', 'Slower / faster simulation'],
  ['1 – 6', 'Exterior · Sectioned · X-ray · Conduction · Territories · Activation map'],
  ['H', 'Slide the 3D heart down / up'],
  ['K', 'Slide the 12-lead EKG up / down'],
  ['L', 'Toggle 3D labels'],
  ['F', 'Toggle blood flow (sectioned view)'],
  ['V', 'Toggle cardiac vector'],
  ['E', 'Switch ECG ↔ Wiggers / PV loop'],
  ['M', 'Monitor / defibrillator trainer'],
  ['/  or  Ctrl+K', 'Search everything'],
  ['Q · T', 'Open quiz · tutor'],
  ['?', 'This help'],
  ['Esc', 'Close the quiz, tutor or help / clear selection'],
];

const GESTURES: [string, string][] = [
  ['One-finger drag', 'Turn the heart'],
  ['Pinch (two fingers)', 'Zoom in and out'],
  ['Two-finger drag', 'Move (pan) the heart'],
  ['Tap a structure', 'Read about it'],
  ['Tap a lead', 'Show its axis on the heart'],
  ['Double-tap a lead', 'Inspect it large with labelled intervals'],
  ['Drag the ECG', 'Scrub back and forth through time'],
  ['Tap 3D heart / 12-lead EKG', 'Slide the heart down from the top, the EKG up from the bottom — tap again to put it away'],
  ['Drag a grip bar', 'Resize the heart or the EKG (double-tap to reset)'],
  ['⤢ button', 'Give the heart or the EKG the whole screen'],
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
          <section className="md:col-span-2 text-slate-300 leading-relaxed">
            <h3 className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Getting around</h3>
            <ul className="grid sm:grid-cols-3 gap-2">
              <li className="p-2.5 rounded-lg bg-cardiac-dark/60 border border-slate-700"><b className="text-white">Main menu</b> — everything starts here: your role, search, the case simulator, every library section, the tools (3D heart, 12-lead, electrode lab, defibrillator, pressure &amp; volume), guided starts, the quiz, the tutor and this help. <b className="text-slate-100">Menu</b> (top left) always brings you back.</li>
              <li className="p-2.5 rounded-lg bg-cardiac-dark/60 border border-slate-700"><b className="text-white">Reading</b> — pick a section, then a topic. Tap <b className="text-slate-100">12-lead EKG</b> at the bottom to slide the ECG up, and <b className="text-slate-100">3D heart</b> at the top to slide the heart down; tap again to put them away. <b className="text-slate-100">←</b> (or your phone&apos;s Back) goes to the page before.</li>
              <li className="p-2.5 rounded-lg bg-cardiac-dark/60 border border-slate-700"><b className="text-white">Case simulator</b> — treat a patient case: every action in your scope is offered, the patient responds, and you get a scored review.</li>
            </ul>
          </section>
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
            <p><b className="text-white">Give meds:</b> every condition has a <b className="text-slate-100">Give meds</b> section — set the patient&apos;s weight, choose a drug and a dose, push it, and watch the live 12-lead change as the drug acts (marked on the strip, with Skip ahead for slow drugs) and get feedback on the drug and the dose.</p>
            <p><b className="text-white">ECG:</b> calibrated at 25 mm/s and 10 mm/mV (1 small box = 40 ms / 0.1 mV). Click (or tap) a lead to see its axis on the heart, double-click (double-tap) to inspect it with labelled intervals, and drag to scrub time.</p>
            <p><b className="text-white">Roles &amp; scope of practice:</b> choose EMT, Paramedic, Cath Lab Tech, Cath Lab Nurse or Cardiologist on the main menu. The “Focus” guidance, recommended tabs (green dots), quiz questions, case roles and monitor/defibrillator permissions follow that role&apos;s scope: EMT and Paramedic per the National EMS Scope of Practice Model (NREMT); cath lab tech per RCIS / SCAI best practices and facility policy; cath lab nurse per the state Nurse Practice Act; cardiologists without limits beyond their privileges. Tap <b>What can I do?</b> next to the roles on the main menu for details. Local protocols, medical direction and facility policy always govern real practice.</p>
            <p><b className="text-white">Defibrillator (M):</b> practise AED use, manual defibrillation, synchronised cardioversion, pacing and ACLS drugs on the live rhythm. Instructor mode loads scenarios and changes the patient; trainee mode hides rhythm names; Projector mirrors the monitor on a second screen.</p>
            <p><b className="text-white">Sources:</b> activation sequence after Durrer et al. (1970); AHA 17-segment model (Cerqueira 2002); lead derivation and electrode reversals per standard ECG references; C-arm angles cross-checked with SlicerHeart. See THIRD_PARTY_NOTICES.md.</p>
            <p><b className="text-white">How accurate is it?</b> Waveforms come from a cardiac dipole model with physiological intervals (QT corrected by Fridericia), and the hemodynamics are a teaching model with representative values. It is designed to teach patterns and relationships, not to reproduce any individual patient.</p>
          </section>
        </div>
        <InstallButton className="mx-4 mb-4 w-[calc(100%-2rem)] flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-xs font-semibold hover:bg-emerald-500/25">
          Install CardioSim on this device — full screen, works offline
        </InstallButton>
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
