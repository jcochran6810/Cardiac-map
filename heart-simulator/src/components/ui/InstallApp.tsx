'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { initPwa, useCanInstall, usePwa } from '@/lib/pwa';
import { IconClose } from '@/components/ui/icons';

/** Mounted once in the root layout: registers the service worker and install listeners. */
export function PwaInit() {
  useEffect(() => initPwa(), []);
  return null;
}

/** iPhone / iPad have no install prompt: explain the Share → Add to Home Screen steps. */
function IosSteps({ onClose }: { onClose: () => void }) {
  // Portal: a blurred or animated parent would otherwise trap this full-screen sheet inside itself
  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/60 flex items-end sm:items-center justify-center p-3 animate-fade-in" onClick={onClose} role="dialog" aria-label="Install CardioSim">
      <div className="w-full max-w-sm rounded-2xl bg-cardiac-panel border border-slate-600 shadow-2xl p-4 animate-slide-in-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.webp" alt="" className="w-10 h-auto shrink-0" />
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-white">Install CardioSim</h2>
            <p className="text-xs text-slate-400 mt-0.5">Add it to your Home Screen to open it full screen, like an app — it keeps working offline.</p>
          </div>
          <button onClick={onClose} className="p-1.5 -mr-1.5 -mt-1 text-slate-400 hover:text-white" aria-label="Close"><IconClose size={16} /></button>
        </div>
        <ol className="mt-3 space-y-2 text-xs text-slate-200">
          <li className="flex gap-2"><b className="text-cardiac-accent">1</b><span>Open this page in <b>Safari</b>.</span></li>
          <li className="flex gap-2">
            <b className="text-cardiac-accent">2</b>
            <span>
              Tap the <b>Share</b> button{' '}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline -mt-0.5 text-sky-400" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></svg>{' '}
              (bottom of the screen on iPhone, top on iPad).
            </span>
          </li>
          <li className="flex gap-2"><b className="text-cardiac-accent">3</b><span>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</span></li>
        </ol>
      </div>
    </div>,
    document.body,
  );
}

/** "Install app" button — renders nothing when the app is installed or the browser can't install it. */
export function InstallButton({ className = '', children }: { className?: string; children?: React.ReactNode }) {
  const canInstall = useCanInstall();
  const ios = usePwa((s) => s.ios);
  const promptEvent = usePwa((s) => s.promptEvent);
  const install = usePwa((s) => s.install);
  const [steps, setSteps] = useState(false);
  if (!canInstall) return null;
  return (
    <>
      <button onClick={() => (promptEvent ? void install() : ios && setSteps(true))} className={className}>
        {children ?? 'Install app'}
      </button>
      {steps && <IosSteps onClose={() => setSteps(false)} />}
    </>
  );
}

const DISMISS_KEY = 'cardiosim.installBanner';

/** Phones and tablets: a one-time nudge to install, until it is dismissed or the app is installed. */
export function InstallBanner() {
  const canInstall = useCanInstall();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!canInstall || !window.matchMedia('(hover: none) and (pointer: coarse)').matches) return;
    try { if (window.localStorage.getItem(DISMISS_KEY)) return; } catch { /* storage blocked: still show it */ }
    const id = window.setTimeout(() => setShow(true), 4000);
    return () => window.clearTimeout(id);
  }, [canInstall]);
  if (!show || !canInstall) return null;
  const dismiss = () => {
    setShow(false);
    try { window.localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
  };
  return (
    <div className="fixed left-2 right-2 top-16 phone:top-14 short:top-12 z-[45] mx-auto max-w-md flex items-center gap-3 rounded-xl border border-slate-600 bg-cardiac-panel/95 backdrop-blur shadow-2xl p-2.5 animate-fade-in" role="status">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.webp" alt="" className="w-8 h-auto shrink-0" />
      <div className="flex-1 min-w-0 leading-tight">
        <div className="text-xs font-semibold text-white">Install CardioSim</div>
        <div className="text-[11px] text-slate-400">Full screen, home-screen icon, works offline.</div>
      </div>
      <InstallButton className="px-3 py-2 rounded-lg bg-cardiac-accent text-slate-950 text-xs font-semibold shrink-0">Install</InstallButton>
      <button onClick={dismiss} className="p-1.5 text-slate-400 hover:text-white shrink-0" aria-label="Not now"><IconClose size={16} /></button>
    </div>
  );
}
