'use client';

import { useEffect } from 'react';
import { startBackNav, useBackNavStore } from '@/lib/backNav';

/** Wires the phone's Back button to CardioSim's pages, and asks before Back leaves the app */
export default function BackNav() {
  const exitHint = useBackNavStore((s) => s.exitHint);
  useEffect(() => startBackNav(), []);
  if (!exitHint) return null;
  return (
    <div role="status" className="fixed left-1/2 -translate-x-1/2 bottom-24 z-[90] px-4 py-2.5 rounded-full bg-slate-900/95 border border-slate-600 text-sm text-white shadow-2xl animate-fade-in pointer-events-none">
      Press Back again to leave CardioSim
    </div>
  );
}
