'use client';

import React from 'react';
import { useAppStore, type AppMode } from '@/store/useAppStore';
import { useTutorStore } from '@/store/useTutorStore';
import { IconCube, IconHome, IconPlay, IconQuiz, IconTutor } from '@/components/ui/icons';

const MODES: { mode: AppMode; label: string; title: string; icon: (size: number) => React.ReactNode }[] = [
  { mode: 'home', label: 'Home', title: 'Start page: choose what to do', icon: (s) => <IconHome size={s} /> },
  { mode: 'learn', label: 'Learn', title: 'The 3D heart, ECG and library of conditions, drugs and procedures', icon: (s) => <IconCube size={s} /> },
  { mode: 'simulator', label: 'Simulator', title: 'Treat a patient case and get a scored review', icon: (s) => <IconPlay size={s} /> },
];

/** Tablets and desktops: the three screens as tabs in the top bar */
export function ModeTabs() {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  return (
    <div className="hidden sm:flex short:flex shrink-0 rounded-lg border border-ui-border/70 overflow-hidden" role="tablist" aria-label="Screens">
      {MODES.map((m) => (
        <button
          key={m.mode}
          onClick={() => setMode(m.mode)}
          role="tab"
          aria-selected={mode === m.mode}
          title={m.title}
          className={`flex items-center gap-1.5 h-9 px-2.5 lg:px-3 text-[13px] transition-colors ${
            mode === m.mode ? 'bg-cardiac-accent/20 text-cardiac-accent font-semibold' : 'text-ui-muted hover:text-ui-text hover:bg-ui-raised'
          }`}
        >
          {m.icon(16)}
          <span className="hidden md:inline">{m.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Phones (portrait): a bottom tab bar, like a native app */
export function MobileNav() {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const quizOpen = useAppStore((s) => s.quizOpen);
  const setQuizOpen = useAppStore((s) => s.setQuizOpen);
  const tutorOpen = useTutorStore((s) => s.tutorOpen);
  const setTutorOpen = useTutorStore((s) => s.setTutorOpen);
  const item = (key: string, label: string, icon: React.ReactNode, active: boolean, onClick: () => void) => (
    <button
      key={key}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex flex-col items-center justify-center gap-0.5 h-14 text-[11px] ${active ? 'text-cardiac-accent font-semibold' : 'text-slate-400'}`}
    >
      {icon}
      {label}
    </button>
  );
  const go = (m: AppMode) => () => { setQuizOpen(false); setTutorOpen(false); setMode(m); };
  return (
    <nav className="sm:hidden short:hidden shrink-0 grid grid-cols-5 border-t border-slate-700 bg-cardiac-panel pb-[env(safe-area-inset-bottom)]" aria-label="Screens">
      {MODES.map((m) => item(m.mode, m.label, m.icon(20), mode === m.mode && !quizOpen && !tutorOpen, go(m.mode)))}
      {item('quiz', 'Quiz', <IconQuiz size={20} />, quizOpen, () => { setTutorOpen(false); setQuizOpen(!quizOpen); })}
      {item('tutor', 'Tutor', <IconTutor size={20} />, tutorOpen, () => { setQuizOpen(false); setTutorOpen(!tutorOpen); })}
    </nav>
  );
}
