'use client';

import { useEffect } from 'react';
import { startBackNav, useBackNavStore } from '@/lib/backNav';

/** Wires the phone's Back button to CardioSim's pages, and asks before Back leaves the app */
export default function BackNav() {
  const exitHint = useBackNavStore((s) => s.exitHint);
  useEffect(() => startBackNav(), []);
  if (!exitHint) return null;
  return (
    // at the foot of the main menu (the only page it shows on), where the welcome card's note also goes; one line
    <div role="status" className="fixed left-1/2 -translate-x-1/2 bottom-6 z-[90] w-max max-w-[calc(100vw-2rem)] px-4 py-2.5 rounded-full bg-slate-900/95 border border-slate-600 text-sm text-white text-center shadow-2xl animate-fade-in pointer-events-none">
      Press Back again to leave CardioSim
    </div>
  );
}
