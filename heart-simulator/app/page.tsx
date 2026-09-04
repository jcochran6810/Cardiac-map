'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import TopBar from '@/components/layout/TopBar';
import LeftPanel from '@/components/layout/LeftPanel';
import RightPanel from '@/components/layout/RightPanel';
import BottomDock from '@/components/layout/BottomDock';
import DissectionControls from '@/components/scene/DissectionControls';
import ViewNavToolbar from '@/components/scene/ViewNavToolbar';
import HemodynamicsPanel from '@/components/scene/HemodynamicsPanel';
import TutorPanel from '@/components/tutor/TutorPanel';
import TimelineDriver from '@/components/timeline/TimelineDriver';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useAppStore, MobileView } from '@/store/useAppStore';
import { useECGStore } from '@/store/useECGStore';

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

const ECGRenderer = dynamic(() => import('@/components/ecg/ECGRenderer'), { ssr: false });

type DragTarget = 'left' | 'info' | 'ecg' | null;

export default function HomePage() {
  const isMobile = useIsMobile();
  return (
    <div className="app-shell flex flex-col overflow-hidden">
      <TimelineDriver />
      <TopBar />
      {isMobile ? <MobileLayout /> : <DesktopLayout />}
      <TutorPanel />
    </div>
  );
}

// ─── Desktop / tablet-landscape: three resizable columns + full-width ECG ───
function DesktopLayout() {
  const [leftWidth, setLeftWidth] = useState(260);
  const [infoWidth, setInfoWidth] = useState(380);
  const [ecgHeight, setEcgHeight] = useState(340);

  const dragTarget = useRef<DragTarget>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Pointer events so the handles also work with touch on tablets
  const onPointerDown = useCallback((target: DragTarget) => (e: React.PointerEvent) => {
    e.preventDefault();
    dragTarget.current = target;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    document.body.style.cursor = target === 'ecg' ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!dragTarget.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      switch (dragTarget.current) {
        case 'left':
          setLeftWidth(Math.max(140, Math.min(400, e.clientX - rect.left)));
          break;
        case 'info':
          setInfoWidth(Math.max(180, Math.min(500, e.clientX - rect.left - leftWidth - 4)));
          break;
        case 'ecg':
          setEcgHeight(Math.max(150, Math.min(rect.height - 150, rect.bottom - e.clientY)));
          break;
      }
    };
    const onPointerUp = () => {
      dragTarget.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [leftWidth]);

  return (
    <div ref={containerRef} className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 flex min-h-0">
        <LeftPanel style={{ width: leftWidth }} />
        <div
          className="w-1.5 cursor-col-resize bg-slate-700 hover:bg-cardiac-accent/50 active:bg-cardiac-accent transition-colors shrink-0"
          style={{ touchAction: 'none' }}
          onPointerDown={onPointerDown('left')}
        />
        <RightPanel style={{ width: infoWidth }} />
        <div
          className="w-1.5 cursor-col-resize bg-slate-700 hover:bg-cardiac-accent/50 active:bg-cardiac-accent transition-colors shrink-0"
          style={{ touchAction: 'none' }}
          onPointerDown={onPointerDown('info')}
        />
        <div className="flex-1 relative min-w-0 min-h-0">
          <HeartScene />
          <DissectionControls />
          <ViewNavToolbar />
          <HemodynamicsPanel />
          <div className="absolute bottom-2 left-2 right-2 pointer-events-none">
            <p className="text-[9px] text-slate-600 text-center">
              Educational simulation only — Not for clinical diagnosis or treatment
            </p>
          </div>
        </div>
      </div>

      <div
        className="h-1.5 cursor-row-resize bg-slate-700 hover:bg-cardiac-accent/50 active:bg-cardiac-accent transition-colors shrink-0"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown('ecg')}
      />
      <BottomDock style={{ height: ecgHeight }} />
    </div>
  );
}

// ─── Phone / tablet-portrait: one screen at a time with a bottom tab bar ───
const MOBILE_TABS: { value: MobileView; label: string; icon: string }[] = [
  { value: 'heart', label: 'Heart', icon: '♥' },
  { value: 'ecg', label: 'ECG', icon: '〰' },
  { value: 'browse', label: 'Browse', icon: '☰' },
  { value: 'info', label: 'Info', icon: 'ⓘ' },
];

function MobileLayout() {
  const { mobileView, setMobileView } = useAppStore();
  const { inspectLead } = useECGStore();

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Screens — the 3D scene stays mounted (hidden) so it does not reload when switching */}
      <div className="flex-1 min-h-0 relative">
        <div className={`absolute inset-0 flex flex-col ${mobileView === 'heart' ? '' : 'hidden'}`}>
          <div className="flex-1 relative min-h-0">
            <HeartScene mobile />
            <DissectionControls />
            <ViewNavToolbar />
            <HemodynamicsPanel />
          </div>
          {/* Rhythm strip under the heart: a single lead, synced with the model */}
          <div className="h-24 shrink-0 border-t border-slate-700 relative">
            <ECGRenderer inspectLead={inspectLead ?? 'II'} />
          </div>
        </div>

        <div className={`absolute inset-0 flex flex-col ${mobileView === 'ecg' ? '' : 'hidden'}`}>
          <BottomDock style={{ height: '100%' }} mobile />
        </div>

        <div className={`absolute inset-0 flex ${mobileView === 'browse' ? '' : 'hidden'}`}>
          <LeftPanel style={{ width: '100%' }} />
        </div>

        <div className={`absolute inset-0 flex ${mobileView === 'info' ? '' : 'hidden'}`}>
          <RightPanel style={{ width: '100%' }} />
        </div>
      </div>

      {/* Bottom tab bar */}
      <nav className="safe-bottom shrink-0 bg-cardiac-panel border-t border-slate-700 flex">
        {MOBILE_TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setMobileView(t.value)}
            className={`flex-1 flex flex-col items-center justify-center py-1.5 min-h-[52px] text-[11px] transition-colors ${
              mobileView === t.value ? 'text-cardiac-accent' : 'text-slate-400'
            }`}
          >
            <span className="text-lg leading-none mb-0.5">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
