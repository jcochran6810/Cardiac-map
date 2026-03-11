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

type DragTarget = 'left' | 'info' | 'ecg' | null;

export default function HomePage() {
  const [leftWidth, setLeftWidth] = useState(260);
  const [infoWidth, setInfoWidth] = useState(380);
  const [ecgHeight, setEcgHeight] = useState(340);

  const dragTarget = useRef<DragTarget>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const onMouseDown = useCallback((target: DragTarget) => (e: React.MouseEvent) => {
    e.preventDefault();
    dragTarget.current = target;
    document.body.style.cursor = target === 'ecg' ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragTarget.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();

      switch (dragTarget.current) {
        case 'left': {
          const newW = Math.max(140, Math.min(400, e.clientX - rect.left));
          setLeftWidth(newW);
          break;
        }
        case 'info': {
          const newW = Math.max(180, Math.min(500, e.clientX - rect.left - leftWidth - 4));
          setInfoWidth(newW);
          break;
        }
        case 'ecg': {
          const newH = Math.max(150, Math.min(rect.height - 150, rect.bottom - e.clientY));
          setEcgHeight(newH);
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
  }, [leftWidth]);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top Bar */}
      <TopBar />

      {/* Main Content */}
      <div ref={containerRef} className="flex-1 flex flex-col min-h-0">
        {/* ─── Top row: Left Panel | Info Panel | 3D Scene ─── */}
        <div className="flex-1 flex min-h-0">
          {/* Left Panel (navigation) */}
          <LeftPanel style={{ width: leftWidth }} />

          {/* Left resize handle */}
          <div
            className="w-1 cursor-col-resize bg-slate-700 hover:bg-cardiac-accent/50 active:bg-cardiac-accent transition-colors shrink-0"
            onMouseDown={onMouseDown('left')}
          />

          {/* Info / Education Panel (vertical, beside left panel) */}
          <RightPanel style={{ width: infoWidth }} />

          {/* Info resize handle */}
          <div
            className="w-1 cursor-col-resize bg-slate-700 hover:bg-cardiac-accent/50 active:bg-cardiac-accent transition-colors shrink-0"
            onMouseDown={onMouseDown('info')}
          />

          {/* 3D Heart Scene (takes remaining space, top-right) */}
          <div className="flex-1 relative min-w-0 min-h-0">
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
        </div>

        {/* ─── ECG resize handle ─── */}
        <div
          className="h-1 cursor-row-resize bg-slate-700 hover:bg-cardiac-accent/50 active:bg-cardiac-accent transition-colors shrink-0"
          onMouseDown={onMouseDown('ecg')}
        />

        {/* ─── Bottom: Full-width 12-lead ECG + controls ─── */}
        <BottomDock style={{ height: ecgHeight }} />
      </div>

      {/* Tutor overlay */}
      <TutorPanel />
    </div>
  );
}
