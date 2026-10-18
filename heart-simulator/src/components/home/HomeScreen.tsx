'use client';

import React from 'react';
import { useAppStore, LEVEL_LABELS, type LearningLevel, type PanelCategory } from '@/store/useAppStore';
import { useECGStore } from '@/store/useECGStore';
import { useTutorStore } from '@/store/useTutorStore';
import { useSceneStore } from '@/store/useSceneStore';
import { useContent } from '@/lib/content';
import { scenariosFor } from '@/lib/sim/scenario/scenarios';
import {
  IconBook, IconChart, IconClipboard, IconCube, IconHeartPulse, IconPerson, IconPill, IconPlay, IconPulse, IconQuiz, IconTutor, IconZap,
} from '@/components/ui/icons';

const ROLES: LearningLevel[] = [1, 2, 3, 4, 5];

interface Tile { title: string; text: string; icon: React.ReactNode; tint: string; go: () => void }

/** The start page: pick your role, then go straight to what you want to do */
export default function HomeScreen() {
  const role = useAppStore((s) => s.learningLevel);
  const setRole = useAppStore((s) => s.setLearningLevel);
  const lib = useContent();
  const cases = scenariosFor(role).length;

  const learn = () => {
    const app = useAppStore.getState();
    app.setMode('learn');
    return app;
  };
  /** the workspace with the heart in view (drawers closed on small screens) */
  const workspace = () => {
    const app = learn();
    if (app.compact) app.setPanels(false, false);
    return app;
  };
  const library = (cat: PanelCategory) => () => {
    const app = learn();
    app.setActivePanelCategory(cat);
    app.setPanels(true, app.compact ? false : app.rightPanelOpen);
  };
  const dock = (view: 'ecg' | 'wiggers' | 'defib', electrodes = false) => () => {
    workspace();
    const ecg = useECGStore.getState();
    ecg.setBottomView(view);
    ecg.setElectrodeLab(electrodes);
    if (view === 'ecg' && !electrodes) { ecg.setInspectLead(null); ecg.setLayout('simultaneous'); }
  };

  const tiles: Tile[] = [
    {
      title: '3D heart', text: 'Spin it, cut it open and tap any part to learn what it does.', icon: <IconCube size={22} />, tint: 'text-sky-300 bg-sky-500/15',
      go: () => { workspace(); useSceneStore.getState().selectStructure(null); },
    },
    { title: 'Conditions', text: 'Rhythms, heart attacks and heart disease — each with its live ECG.', icon: <IconHeartPulse size={22} />, tint: 'text-rose-300 bg-rose-500/15', go: library('conditions') },
    { title: '12-lead ECG', text: 'A live 12-lead in step with the heart. Tap a lead to see where it looks.', icon: <IconPulse size={22} />, tint: 'text-emerald-300 bg-emerald-500/15', go: dock('ecg') },
    { title: 'Electrode lab', text: 'Place the electrodes on a 3D patient and see what swapped cables do.', icon: <IconPerson size={22} />, tint: 'text-teal-300 bg-teal-500/15', go: dock('ecg', true) },
    { title: 'Drug cards', text: 'Doses, uses and cautions for cardiac and resuscitation drugs.', icon: <IconPill size={22} />, tint: 'text-lime-300 bg-lime-500/15', go: library('medications') },
    { title: 'Procedures', text: 'Cath lab, EP, surgical and bedside procedures, step by step.', icon: <IconClipboard size={22} />, tint: 'text-violet-300 bg-violet-500/15', go: library('procedures') },
    { title: 'Defibrillator', text: 'Shock, cardiovert and pace a live patient on a monitor-defibrillator.', icon: <IconZap size={22} />, tint: 'text-amber-300 bg-amber-500/15', go: dock('defib') },
    { title: 'Pressure & volume', text: 'The Wiggers diagram and pressure-volume loop, beat by beat.', icon: <IconChart size={22} />, tint: 'text-cyan-300 bg-cyan-500/15', go: dock('wiggers') },
    { title: 'Anatomy list', text: 'Every chamber, valve, vessel and conduction structure, A to Z.', icon: <IconBook size={22} />, tint: 'text-blue-300 bg-blue-500/15', go: library('anatomy') },
    {
      title: 'Quiz yourself', text: `${lib ? `${lib.quiz.length} questions` : 'Questions'} at every level, including live rhythm strips.`, icon: <IconQuiz size={22} />, tint: 'text-orange-300 bg-orange-500/15',
      go: () => useAppStore.getState().setQuizOpen(true),
    },
    { title: 'Ask the tutor', text: 'Ask a question in plain words and get an answer for your role.', icon: <IconTutor size={22} />, tint: 'text-fuchsia-300 bg-fuchsia-500/15', go: () => useTutorStore.getState().setTutorOpen(true) },
  ];

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-cardiac-dark" aria-label="Home">
      <div className="max-w-5xl mx-auto px-4 py-5 sm:px-6 sm:py-8">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.webp" alt="" width={33} height={48} className="h-12 w-auto drop-shadow-[0_2px_8px_rgba(220,38,38,0.4)]" />
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-white leading-tight">CardioSim</h1>
            <p className="text-sm text-slate-300">Learn the heart, read the ECG, and treat patients in realistic cases.</p>
          </div>
        </div>

        <div className="mt-5">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5">Your role — everything stays within its scope of practice</div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Your role">
            {ROLES.map((l) => (
              <button
                key={l}
                onClick={() => setRole(l)}
                role="radio"
                aria-checked={l === role}
                className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                  l === role ? 'bg-cardiac-accent/20 border-cardiac-accent/60 text-cardiac-accent font-semibold' : 'border-slate-600 text-slate-200 hover:bg-cardiac-surface'
                }`}
              >
                {LEVEL_LABELS[l].short}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => useAppStore.getState().setMode('simulator')}
          className="mt-5 w-full text-left flex items-center gap-4 p-4 sm:p-5 rounded-2xl border border-cardiac-accent/50 bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent hover:border-cardiac-accent transition-colors"
        >
          <span className="w-12 h-12 shrink-0 rounded-xl bg-cardiac-accent text-slate-950 flex items-center justify-center"><IconPlay size={28} /></span>
          <span className="min-w-0">
            <span className="block text-base sm:text-lg font-semibold text-white">Case simulator</span>
            <span className="block text-xs sm:text-sm text-slate-300 leading-snug mt-0.5">
              Treat a patient from first contact to hand-off. What you do changes the monitor, the 12-lead and the story — then you get a score and what to fix.
              {' '}{cases} case{cases === 1 ? '' : 's'} for {LEVEL_LABELS[role].short}.
            </span>
          </span>
          <span className="ml-auto text-cardiac-accent text-xl shrink-0" aria-hidden>→</span>
        </button>

        <h2 className="mt-6 text-sm font-semibold text-white">Learn</h2>
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
          {tiles.map((t) => (
            <button key={t.title} onClick={t.go} className="flex flex-col items-start text-left p-3 sm:p-3.5 rounded-xl bg-cardiac-panel border border-slate-700 hover:border-slate-500 transition-colors">
              <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${t.tint}`}>{t.icon}</span>
              <span className="block mt-2 text-[13px] sm:text-sm font-semibold text-white leading-tight">{t.title}</span>
              <span className="block mt-1 text-[11px] sm:text-xs text-slate-400 leading-snug">{t.text}</span>
            </button>
          ))}
        </div>

        <p className="mt-6 text-[11px] text-slate-500 leading-relaxed max-w-3xl">
          Educational simulation only. Waveforms and hemodynamics are idealised models and doses are typical adult values for teaching.
          It is not a medical device and must not be used for diagnosis or treatment.
        </p>
      </div>
    </div>
  );
}
