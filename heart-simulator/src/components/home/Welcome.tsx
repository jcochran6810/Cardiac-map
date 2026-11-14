'use client';

import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { useAppStore, LEVEL_LABELS, ROLES, type LearningLevel } from '@/store/useAppStore';
import { SCOPES } from '@/lib/scope';
import { closeWelcome, useWelcomeStore, welcomeSeen } from '@/lib/welcome';
import { onOverlayOpen, useBackNavStore } from '@/lib/backNav';
import { useDialogFocus } from '@/hooks/useDialogFocus';

/** how long "You're set up as …" stays after the card is put off */
const NOTICE_MS = 7000;

/**
 * First visit: ask who the learner is, because the role decides what the app teaches and which actions
 * it offers (each role is held to its scope of practice). One tap, changeable any time from the main menu.
 * Esc and the phone's Back put it off like "Decide later"; then a note at the foot of the main menu says which
 * role the learner has, until the learner moves on.
 */
export default function Welcome({ onStart }: { onStart: () => void }) {
  const open = useWelcomeStore((s) => s.open);
  const picked = useWelcomeStore((s) => s.picked);
  const notice = useWelcomeStore((s) => s.notice);
  const role = useAppStore((s) => s.learningLevel);
  const setRole = useAppStore((s) => s.setLearningLevel);
  // the Back button's "press Back again to leave" takes the note's place for good
  const exitHint = useBackNavStore((s) => s.exitHint);
  const dialogRef = useDialogFocus<HTMLDivElement>(open, closeWelcome);
  const confirmRef = useRef<HTMLParagraphElement>(null);
  const roleRefs = useRef<Partial<Record<LearningLevel, HTMLButtonElement | null>>>({});
  const shownStage = useRef<LearningLevel | null>(null);

  // first visit: open over the main menu before it is painted
  useLayoutEffect(() => {
    if (!welcomeSeen()) useWelcomeStore.setState({ open: true, picked: null, notice: false });
    return () => useWelcomeStore.setState({ open: false, notice: false });
  }, []);

  // the card's other stage replaces the button that had the focus: move the focus to the new stage
  useEffect(() => {
    const was = shownStage.current;
    shownStage.current = picked;
    if (!open || was === picked) return;
    if (picked !== null) confirmRef.current?.focus();
    else if (was !== null) roleRefs.current[was]?.focus();
  }, [open, picked]);

  // the note is about the main menu: it goes after a while, when "press Back again to leave" takes its place,
  // or when Help, the Glossary, the quiz … opens over the menu (it would sit on top of them)
  useEffect(() => {
    if (!notice) return;
    const end = () => useWelcomeStore.setState({ notice: false });
    if (exitHint) { end(); return; }
    const id = window.setTimeout(end, NOTICE_MS);
    const stop = onOverlayOpen(end);
    return () => { window.clearTimeout(id); stop(); };
  }, [notice, exitHint]);

  return (
    <>
      {open && (
        <div
          ref={dialogRef}
          tabIndex={-1}
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4 outline-none focus-visible:outline-none"
          role="dialog"
          aria-modal="true"
          aria-labelledby="welcome-title"
        >
          <div className="w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-cardiac-panel border border-slate-600 shadow-2xl p-4 sm:p-6 animate-slide-in-up sm:animate-fade-in">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.webp" alt="" width={33} height={48} className="h-12 w-auto" />
              <div>
                <h2 id="welcome-title" tabIndex={-1} data-autofocus className="text-lg sm:text-xl font-semibold text-white leading-tight outline-none focus-visible:outline-none">Welcome to CardioSim</h2>
                <p className="text-sm text-slate-300 leading-snug">A beating 3D heart, a live ECG and patients to treat.</p>
              </div>
            </div>

            {picked === null ? (
              <>
                <p className="mt-4 text-[15px] font-semibold text-white">What is your role?</p>
                <p className="text-[13px] text-slate-400 leading-snug">It sets what is explained and which actions you are offered. You can change it any time on the main menu.</p>
                <div className="mt-3 grid gap-2">
                  {ROLES.map((l) => (
                    <button
                      key={l}
                      ref={(el) => { roleRefs.current[l] = el; }}
                      onClick={() => { setRole(l); useWelcomeStore.setState({ picked: l }); }}
                      className="text-left px-3.5 py-3 rounded-xl border border-slate-600 hover:border-cardiac-accent/70 hover:bg-cardiac-surface/50 transition-colors"
                    >
                      <span className="block text-[15px] font-semibold text-white leading-tight">{LEVEL_LABELS[l].short}</span>
                      <span className="block mt-0.5 text-xs text-slate-400 leading-snug">{SCOPES[l].credential}</span>
                    </button>
                  ))}
                </div>
                <button onClick={closeWelcome} className="mt-3 w-full h-10 text-sm text-slate-400 hover:text-white">Decide later</button>
              </>
            ) : (
              <>
                <p ref={confirmRef} tabIndex={-1} className="mt-4 text-[15px] font-semibold text-white outline-none focus-visible:outline-none">You are set up as {LEVEL_LABELS[picked].short}.</p>
                <p className="mt-1 text-[13px] text-slate-300 leading-snug">
                  Everything here is a teaching simulation. It is not a medical device and does not replace your protocols or medical direction.
                </p>
                <div className="mt-4 grid gap-2">
                  <button onClick={() => { closeWelcome(); onStart(); }} className="h-12 px-4 rounded-xl bg-cardiac-accent text-slate-950 text-[15px] font-semibold hover:bg-amber-400">
                    Start with the first lesson →
                  </button>
                  <button onClick={closeWelcome} className="h-11 px-4 rounded-xl border border-slate-600 text-sm text-slate-200 hover:bg-cardiac-surface">Look around first</button>
                </div>
                <button onClick={() => useWelcomeStore.setState({ picked: null })} className="mt-2 w-full h-9 text-xs text-slate-400 hover:text-white">← Choose a different role</button>
              </>
            )}
          </div>
        </div>
      )}
      {/* kept in the page (empty) so a screen reader reads the note out when it appears */}
      <div role="status">
        {!open && notice && !exitHint && (
          // under every panel and dialog (z-40 and up), in case one opens without ending it (the iPhone install steps)
          <div className="fixed left-1/2 -translate-x-1/2 bottom-6 z-[35] w-max max-w-[calc(100vw-2rem)] px-4 py-2.5 rounded-xl bg-slate-900/95 border border-slate-600 text-sm text-white text-center leading-snug shadow-2xl animate-fade-in pointer-events-none">
            You’re set up as <b className="text-cardiac-accent">{LEVEL_LABELS[role].short}</b>. Change your role any time under “Your role” on the main menu.
          </div>
        )}
      </div>
    </>
  );
}
