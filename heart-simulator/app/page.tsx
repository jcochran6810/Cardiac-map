'use client';

import React, { Suspense, useState, useCallback, useRef, useEffect } from 'react';
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

type DragTarget = 'left' | 'bottom' | 'ecg' | null;

export default function HomePage() {
  const [leftWidth, setLeftWidth] = useState(256);   // px, was w-64
  const [bottomHeight, setBottomHeight] = useState(224); // px, was h-56
  const [ecgWidth, setEcgWidth] = useState(320);     // px, was w-80

  const dragTarget = useRef<DragTarget>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const onMouseDown = useCallback((target: DragTarget) => (e: React.MouseEvent) => {
    e.preventDefault();
    dragTarget.current = target;
    document.body.style.cursor = target === 'bottom' ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragTarget.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();

      switch (dragTarget.current) {
        case 'left': {
          const newW = Math.max(140, Math.min(480, e.clientX - rect.left));
          setLeftWidth(newW);
          break;
        }
        case 'bottom': {
          // bottomHeight is measured from the bottom of the center column
          const newH = Math.max(80, Math.min(rect.height - 120, rect.bottom - e.clientY));
          setBottomHeight(newH);
          break;
        }
        case 'ecg': {
          const newW = Math.max(180, Math.min(600, rect.right - e.clientX));
          setEcgWidth(newW);
          break;
        }
      }
    };

    const onMouseUp = () => {
      dragTarget.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top Bar */}
      <TopBar />

      {/* Main Content */}
      <div ref={containerRef} className="flex-1 flex min-h-0">
        {/* Left Panel */}
        <LeftPanel style={{ width: leftWidth }} />

        {/* Left resize handle */}
        <div
          className="w-1 cursor-col-resize bg-slate-700 hover:bg-cardiac-accent/50 active:bg-cardiac-accent transition-colors shrink-0"
          onMouseDown={onMouseDown('left')}
        />

        {/* Center: 3D Scene + Info Panel (bottom) */}
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

          {/* Bottom resize handle */}
          <div
            className="h-1 cursor-row-resize bg-slate-700 hover:bg-cardiac-accent/50 active:bg-cardiac-accent transition-colors shrink-0"
            onMouseDown={onMouseDown('bottom')}
          />

          {/* Info Panel (bottom) */}
          <RightPanel style={{ height: bottomHeight }} />
        </div>

        {/* ECG resize handle */}
        <div
          className="w-1 cursor-col-resize bg-slate-700 hover:bg-cardiac-accent/50 active:bg-cardiac-accent transition-colors shrink-0"
          onMouseDown={onMouseDown('ecg')}
        />

        {/* ECG Panel (right side) */}
        <BottomDock style={{ width: ecgWidth }} />
      </div>

      {/* Tutor overlay */}
      <TutorPanel />
    </div>
  );
}
