'use client';

import dynamic from 'next/dynamic';

// The whole app is interactive and reads browser-only state (WebGL, localStorage),
// so it renders on the client only — this also avoids hydration mismatches.
const AppShell = dynamic(() => import('@/components/AppShell'), {
  ssr: false,
  loading: () => (
    <div className="h-[100dvh] flex items-center justify-center bg-cardiac-dark">
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.webp" alt="" width={66} height={96} className="mx-auto mb-3 h-24 w-auto animate-pulse" />
        <p className="text-sm text-slate-300 font-medium">CardioSim</p>
        <p className="text-xs text-slate-500 mt-1">Loading the cardiac simulator…</p>
      </div>
    </div>
  ),
});

export default function HomePage() {
  return <AppShell />;
}
