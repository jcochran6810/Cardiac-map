'use client';

import { create } from 'zustand';

/** Chrome / Edge / Samsung Internet fire this when the app can be installed. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  /** browser-provided install prompt, when the browser offers one */
  promptEvent: BeforeInstallPromptEvent | null;
  /** already running as an installed app */
  standalone: boolean;
  /** iPhone / iPad Safari: no install prompt, the user adds it from the Share menu */
  ios: boolean;
  install: () => Promise<boolean>;
}

export const usePwa = create<PwaState>((set, get) => ({
  promptEvent: null,
  standalone: false,
  ios: false,
  install: async () => {
    const e = get().promptEvent;
    if (!e) return false;
    await e.prompt();
    const { outcome } = await e.userChoice;
    set({ promptEvent: null });
    return outcome === 'accepted';
  },
}));

/** True when there is something to show for "Install app" on this device. */
export const useCanInstall = () => usePwa((s) => !s.standalone && (!!s.promptEvent || s.ios));

let started = false;

/** Register the service worker and listen for install events (once, from the root layout). */
export function initPwa() {
  if (started || typeof window === 'undefined') return;
  started = true;

  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  usePwa.setState({ standalone, ios });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own Install button instead of the mini info-bar
    usePwa.setState({ promptEvent: e as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => usePwa.setState({ promptEvent: null, standalone: true }));

  if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
  const version = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev';
  navigator.serviceWorker
    .register(`/sw.js?v=${encodeURIComponent(version)}`, { scope: '/' })
    .then(() => navigator.serviceWorker.ready)
    .then((reg) => {
      // Hand the worker everything this page already loaded, so the app also works offline after the first visit
      const send = () => {
        const urls = [location.pathname, ...performance.getEntriesByType('resource').map((e) => e.name)]
          .filter((u) => { try { return new URL(u, location.href).origin === location.origin; } catch { return false; } });
        reg.active?.postMessage({ type: 'CACHE_URLS', urls });
      };
      send();
      window.setTimeout(send, 20000); // the 3D models and content library finish loading later
    })
    .catch(() => { /* no offline support in this browser; the app still works online */ });
}
