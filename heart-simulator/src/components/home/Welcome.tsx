'use client';

import React, { useEffect, useState } from 'react';
import { useAppStore, LEVEL_LABELS, type LearningLevel } from '@/store/useAppStore';
import { SCOPES } from '@/lib/scope';

const ROLES: LearningLevel[] = [1, 2, 3, 4, 5];
const KEY = 'cardiosim.welcomed';

/** Has this device been through the welcome (or already chosen a role in an earlier version)? */
function seen(): boolean {
  try {
    return !!window.localStorage.getItem(KEY) || !!window.localStorage.getItem('cardiosim.level');
  } catch {
    return true; // storage unavailable: asking on every visit would be worse than not asking
  }
}

/**
 * First visit: ask who the learner is, because the role decides what the app teaches and which actions
 * it offers (each role is held to its scope of practice). One tap, changeable any time from the main menu.
 */
export default function Welcome({ onStart }: { onStart: () => void }) {
  const [open, setOpen] = useState(() => !seen());
  const [picked, setPicked] = useState<LearningLevel | null>(null);
  const setRole = useAppStore((s) => s.setLearningLevel);

  const close = () => {
    try { window.localStorage.setItem(KEY, '1'); } catch { /* storage unavailable */ }
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-cardiac-panel border border-slate-600 shadow-2xl p-4 sm:p-6 animate-slide-in-up sm:animate-fade-in">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.webp" alt="" width={33} height={48} className="h-12 w-auto" />
          <div>
            <h2 id="welcome-title" className="text-lg sm:text-xl font-semibold text-white leading-tight">Welcome to CardioSim</h2>
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
                  onClick={() => { setRole(l); setPicked(l); }}
                  className="text-left px-3.5 py-3 rounded-xl border border-slate-600 hover:border-cardiac-accent/70 hover:bg-cardiac-surface/50 transition-colors"
                >
                  <span className="block text-[15px] font-semibold text-white leading-tight">{LEVEL_LABELS[l].short}</span>
                  <span className="block mt-0.5 text-xs text-slate-400 leading-snug">{SCOPES[l].credential}</span>
                </button>
              ))}
            </div>
            <button onClick={close} className="mt-3 w-full h-10 text-sm text-slate-400 hover:text-white">Decide later</button>
          </>
        ) : (
          <>
            <p className="mt-4 text-[15px] font-semibold text-white">You are set up as {LEVEL_LABELS[picked].short}.</p>
            <p className="mt-1 text-[13px] text-slate-300 leading-snug">
              Everything here is a teaching simulation. It is not a medical device and does not replace your protocols or medical direction.
            </p>
            <div className="mt-4 grid gap-2">
              <button onClick={() => { close(); onStart(); }} className="h-12 px-4 rounded-xl bg-cardiac-accent text-slate-950 text-[15px] font-semibold hover:bg-amber-400">
                Start with the first lesson →
              </button>
              <button onClick={close} className="h-11 px-4 rounded-xl border border-slate-600 text-sm text-slate-200 hover:bg-cardiac-surface">Look around first</button>
            </div>
            <button onClick={() => setPicked(null)} className="mt-2 w-full h-9 text-xs text-slate-400 hover:text-white">← Choose a different role</button>
          </>
        )}
      </div>
    </div>
  );
}
