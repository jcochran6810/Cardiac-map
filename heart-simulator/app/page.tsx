'use client';

import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';
import TopBar from '@/components/layout/TopBar';
import LeftPanel from '@/components/layout/LeftPanel';
import RightPanel from '@/components/layout/RightPanel';
import BottomDock from '@/components/layout/BottomDock';
import DissectionControls from '@/components/scene/DissectionControls';
import ViewNavToolbar from '@/components/scene/ViewNavToolbar';
import TutorPanel from '@/components/tutor/TutorPanel';

const HeartScene = dynamic(() => import('@/components/scene/HeartScene'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-cardiac-dark">
      <div className="text-center">
        <div className="text-5xl mb-4 animate-pulse">♥</div>
        <p className="text-sm text-slate-400">Loading 3D Heart Model...</p>
        <div className="mt-3 w-48 h-1 bg-cardiac-surface rounded-full overflow-hidden">
          <div className="h-full bg-cardiac-red rounded-full animate-[pulse_1.5s_ease-in-out_infinite] w-1/2" />
        </div>
      </div>
    </div>
  ),
});

export default function HomePage() {
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top Bar */}
      <TopBar />

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Left Panel */}
        <LeftPanel />

        {/* Center: 3D Scene + Bottom Dock */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* 3D Scene */}
          <div className="flex-1 relative min-h-0">
            <HeartScene />
            <DissectionControls />
            <ViewNavToolbar />

            {/* Disclaimer overlay */}
            <div className="absolute bottom-2 left-2 right-2 pointer-events-none">
              <p className="text-[9px] text-slate-600 text-center">
                Educational simulation only — Not for clinical diagnosis or treatment
              </p>
            </div>
          </div>

          {/* Bottom Dock (ECG + Timeline) */}
          <BottomDock />
        </div>

        {/* Right Panel */}
        <RightPanel />
      </div>

      {/* Tutor overlay */}
      <TutorPanel />
    </div>
  );
}
