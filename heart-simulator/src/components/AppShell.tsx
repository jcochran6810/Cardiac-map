'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import TopBar from '@/components/layout/TopBar';
import LeftPanel from '@/components/layout/LeftPanel';
import RightPanel from '@/components/layout/RightPanel';
import BottomDock from '@/components/layout/BottomDock';
import HelpOverlay from '@/components/layout/HelpOverlay';
import SceneOverlay from '@/components/scene/SceneOverlay';
import TutorPanel from '@/components/tutor/TutorPanel';
import QuizPanel from '@/components/tutor/QuizPanel';
import SimulationDriver from '@/components/sim/SimulationDriver';
import { useAppStore, type ViewMode } from '@/store/useAppStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { useECGStore } from '@/store/useECGStore';
import { useSceneStore } from '@/store/useSceneStore';
import { useTutorStore } from '@/store/useTutorStore';
import { sim, scrubTo } from '@/lib/sim/simulation';
import { loadContent } from '@/lib/content';

const HeartScene = dynamic(() => import('@/components/scene/HeartScene'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <div className="text-center">
        <div className="text-5xl mb-3 text-cardiac-red animate-pulse">♥</div>
        <p className="text-xs text-slate-400">Loading 3D heart…</p>
      </div>
    </div>
  ),
});

type DragTarget = 'left' | 'info' | 'ecg' | null;
const VIEW_KEYS: Record<string, ViewMode> = { '1': 'external', '2': 'sectioned', '3': 'xray', '4': 'conduction', '5': 'territories' };
const SPEEDS = [0.1, 0.25, 0.5, 1];

function useCompact() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const on = () => setCompact(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return compact;
}

export default function AppShell() {
  const leftPanelOpen = useAppStore((s) => s.leftPanelOpen);
  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen);
  const compact = useCompact();
  const [leftWidth, setLeftWidth] = useState(262);
  const [infoWidth, setInfoWidth] = useState(360);
  const [ecgHeight, setEcgHeight] = useState(340);
  const drag = useRef<DragTarget>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Start loading the content library right away (it is code-split)
  useEffect(() => { void loadContent(); }, []);

  // Sensible defaults per screen size
  useEffect(() => {
    const app = useAppStore.getState();
    app.setCompact(compact);
    const w = window.innerWidth;
    if (compact) {
      app.setPanels(false, false);
      if (w < 640) useECGStore.getState().setLayout('monitor');
      setEcgHeight(Math.round(window.innerHeight * 0.34));
    } else {
      if (w < 1366) app.setPanels(false, true);
      setEcgHeight(Math.max(260, Math.min(380, Math.round(window.innerHeight * 0.36))));
    }
  }, [compact]);

  const onDown = useCallback((t: DragTarget) => (e: React.PointerEvent) => {
    e.preventDefault();
    drag.current = t;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    document.body.style.cursor = t === 'ecg' ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const onMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (drag.current === 'left') setLeftWidth(Math.max(180, Math.min(420, e.clientX - rect.left)));
    if (drag.current === 'info') setInfoWidth(Math.max(260, Math.min(620, e.clientX - rect.left - (leftPanelOpen && !compact ? leftWidth : 0))));
    if (drag.current === 'ecg') setEcgHeight(Math.max(170, Math.min(rect.height - 160, rect.bottom - e.clientY)));
  }, [leftPanelOpen, leftWidth, compact]);

  const onUp = useCallback(() => {
    drag.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const app = useAppStore.getState();
      const tl = useTimelineStore.getState();
      switch (e.key) {
        case ' ':
          e.preventDefault();
          tl.togglePlay();
          break;
        case 'ArrowLeft':
        case 'ArrowRight':
          if (!tl.playing) {
            e.preventDefault();
            scrubTo(sim.time + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 100 : 10));
          }
          break;
        case '[':
        case ']': {
          const i = SPEEDS.findIndex((s) => s >= tl.speed);
          const next = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? SPEEDS.length - 1 : i) + (e.key === ']' ? 1 : -1)))];
          tl.setSpeed(next);
          break;
        }
        case 'l': case 'L': app.toggleLabels(); break;
        case 'f': case 'F': app.toggleFlow(); break;
        case 'v': case 'V': app.toggleVector(); break;
        case 'e': case 'E': {
          const ecg = useECGStore.getState();
          ecg.setBottomView(ecg.bottomView === 'ecg' ? 'wiggers' : 'ecg');
          break;
        }
        case 'q': case 'Q': app.setQuizOpen(!app.quizOpen); break;
        case 't': case 'T': useTutorStore.getState().toggleTutor(); break;
        case '?': app.setHelpOpen(!app.helpOpen); break;
        case 'Escape':
          if (app.helpOpen) app.setHelpOpen(false);
          else if (app.quizOpen) app.setQuizOpen(false);
          else if (useTutorStore.getState().tutorOpen) useTutorStore.getState().setTutorOpen(false);
          else if (useECGStore.getState().inspectLead) useECGStore.getState().setInspectLead(null);
          else useSceneStore.getState().selectStructure(null);
          break;
        default:
          if (VIEW_KEYS[e.key]) app.setViewMode(VIEW_KEYS[e.key]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const showLeft = leftPanelOpen;
  const showInfo = rightPanelOpen;
  const handle = 'bg-slate-700/80 hover:bg-cardiac-accent/60 active:bg-cardiac-accent transition-colors shrink-0 touch-none';

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden" style={{ ['--dock-h' as string]: `${ecgHeight}px` }}>
      <SimulationDriver />
      <TopBar />
      <div ref={containerRef} className="flex-1 flex flex-col min-h-0" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div className="flex-1 flex min-h-0 relative">
          {compact ? (
            showLeft && (
              <div className="absolute left-0 top-0 bottom-0 z-30 shadow-2xl flex">
                <LeftPanel style={{ width: Math.min(300, window.innerWidth * 0.85) }} />
              </div>
            )
          ) : (
            <>
              {showLeft && (
                <>
                  <LeftPanel style={{ width: leftWidth }} />
                  <div className={`w-1 cursor-col-resize ${handle}`} onPointerDown={onDown('left')} onDoubleClick={() => setLeftWidth(262)} role="separator" aria-orientation="vertical" aria-label="Resize navigator" />
                </>
              )}
              {showInfo && (
                <>
                  <RightPanel style={{ width: infoWidth }} />
                  <div className={`w-1 cursor-col-resize ${handle}`} onPointerDown={onDown('info')} onDoubleClick={() => setInfoWidth(360)} role="separator" aria-orientation="vertical" aria-label="Resize info panel" />
                </>
              )}
            </>
          )}
          <main className="flex-1 relative min-w-0 min-h-0 overflow-hidden isolate" aria-label="3D heart">
            <HeartScene />
            <SceneOverlay />
          </main>
          {compact && showInfo && (
            <div className="absolute right-0 top-0 bottom-0 z-30 shadow-2xl flex">
              <RightPanel style={{ width: Math.min(380, window.innerWidth * 0.92) }} />
            </div>
          )}
        </div>
        <div className={`h-1.5 cursor-row-resize ${handle}`} onPointerDown={onDown('ecg')} onDoubleClick={() => setEcgHeight(340)} role="separator" aria-orientation="horizontal" aria-label="Resize ECG panel" />
        <BottomDock style={{ height: ecgHeight }} />
      </div>
      <TutorPanel />
      <QuizPanel />
      <HelpOverlay />
    </div>
  );
}
