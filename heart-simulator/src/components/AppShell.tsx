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
import { InstallBanner } from '@/components/ui/InstallApp';
import { useAppStore, type ViewMode } from '@/store/useAppStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { useECGStore } from '@/store/useECGStore';
import { useSceneStore } from '@/store/useSceneStore';
import { useTutorStore } from '@/store/useTutorStore';
import { sim, scrubTo } from '@/lib/sim/simulation';
import { loadContent } from '@/lib/content';
import { COMPACT_QUERY, LANDSCAPE_PHONE_QUERY, PHONE_QUERY, useMediaQuery } from '@/lib/device';

const HeartScene = dynamic(() => import('@/components/scene/HeartScene'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.webp" alt="" width={44} height={64} className="mx-auto mb-3 h-16 w-auto animate-pulse" />
        <p className="text-xs text-slate-400">Loading 3D heart…</p>
      </div>
    </div>
  ),
});

type DragTarget = 'left' | 'info' | 'ecg' | null;
const VIEW_KEYS: Record<string, ViewMode> = { '1': 'external', '2': 'sectioned', '3': 'xray', '4': 'conduction', '5': 'territories', '6': 'activation' };
const SPEEDS = [0.1, 0.25, 0.5, 1];

/** Default ECG dock size: its height when stacked under the heart, its width when beside it. */
function defaultDockSize(side: boolean, phone: boolean, compact: boolean): number {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (side) return Math.round(Math.max(300, Math.min(w - 280, w * 0.52)));
  if (phone) return Math.round(h * 0.4);
  if (compact) return Math.round(h * 0.34);
  return Math.max(260, Math.min(380, Math.round(h * 0.36)));
}

export default function AppShell() {
  const leftPanelOpen = useAppStore((s) => s.leftPanelOpen);
  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen);
  const setPanels = useAppStore((s) => s.setPanels);
  const compact = useMediaQuery(COMPACT_QUERY);
  const phone = useMediaQuery(PHONE_QUERY);
  // A phone on its side has no height to spare: put the ECG dock beside the heart instead of under it
  const side = useMediaQuery(LANDSCAPE_PHONE_QUERY);
  const [leftWidth, setLeftWidth] = useState(262);
  const [infoWidth, setInfoWidth] = useState(360);
  const [dockSize, setDockSize] = useState(340);
  const [dockExpanded, setDockExpanded] = useState(false);
  const sizeBeforeExpand = useRef(340);
  const drag = useRef<DragTarget>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Start loading the content library right away (it is code-split)
  useEffect(() => { void loadContent(); }, []);

  // Sensible defaults per screen size
  useEffect(() => {
    const app = useAppStore.getState();
    app.setCompact(compact);
    if (compact) app.setPanels(false, false);
    else if (window.innerWidth < 1366) app.setPanels(false, true);
  }, [compact]);

  useEffect(() => {
    useAppStore.getState().setPhone(phone);
    if (phone) useECGStore.getState().setLayout('monitor');
  }, [phone]);

  useEffect(() => {
    setDockSize(defaultDockSize(side, phone, compact));
    setDockExpanded(false);
  }, [side, phone, compact]);

  const toggleDockExpanded = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (dockExpanded) {
      setDockSize(sizeBeforeExpand.current);
      setDockExpanded(false);
    } else {
      sizeBeforeExpand.current = dockSize;
      setDockSize(side ? rect.width - 120 : rect.height - 96);
      setDockExpanded(true);
    }
  }, [dockExpanded, dockSize, side]);

  const onDown = useCallback((t: DragTarget) => (e: React.PointerEvent) => {
    e.preventDefault();
    drag.current = t;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    document.body.style.cursor = t === 'ecg' && !side ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none';
  }, [side]);

  const onMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (drag.current === 'left') setLeftWidth(Math.max(180, Math.min(420, e.clientX - rect.left)));
    if (drag.current === 'info') setInfoWidth(Math.max(260, Math.min(620, e.clientX - rect.left - (leftPanelOpen && !compact ? leftWidth : 0))));
    if (drag.current === 'ecg') {
      setDockExpanded(false);
      if (side) setDockSize(Math.max(260, Math.min(rect.width - 120, rect.right - e.clientX)));
      else setDockSize(Math.max(phone ? 120 : 170, Math.min(rect.height - (phone ? 96 : 160), rect.bottom - e.clientY)));
    }
  }, [leftPanelOpen, leftWidth, compact, phone, side]);

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
        case 'm': case 'M': {
          const ecg = useECGStore.getState();
          ecg.setBottomView(ecg.bottomView === 'defib' ? 'ecg' : 'defib');
          break;
        }
        case 'q': case 'Q': app.setQuizOpen(!app.quizOpen); break;
        case 't': case 'T': useTutorStore.getState().toggleTutor(); break;
        case '?': app.setHelpOpen(!app.helpOpen); break;
        case 'Escape':
          if (app.helpOpen) app.setHelpOpen(false);
          else if (app.quizOpen) app.setQuizOpen(false);
          else if (useTutorStore.getState().tutorOpen) useTutorStore.getState().setTutorOpen(false);
          else if (app.compact && (app.leftPanelOpen || app.rightPanelOpen)) app.setPanels(false, false);
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
    <div className="h-[100dvh] flex flex-col overflow-hidden" style={{ ['--dock-h' as string]: side ? '0px' : `${dockSize}px` }}>
      <SimulationDriver />
      <TopBar />
      <div ref={containerRef} className={`flex-1 flex min-h-0 relative ${side ? 'flex-row' : 'flex-col'}`} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div className="flex-1 flex min-h-0 min-w-0 relative">
          {!compact && (
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
        </div>
        <div
          className={`flex items-center justify-center ${side ? 'w-1.5 touch:w-3 cursor-col-resize' : 'h-1.5 touch:h-3 cursor-row-resize'} ${handle}`}
          onPointerDown={onDown('ecg')}
          onDoubleClick={() => { setDockSize(defaultDockSize(side, phone, compact)); setDockExpanded(false); }}
          role="separator"
          aria-orientation={side ? 'vertical' : 'horizontal'}
          aria-label="Resize ECG panel"
        >
          <span className={`hidden touch:block pointer-events-none rounded-full bg-slate-400/70 ${side ? 'w-0.5 h-8' : 'h-0.5 w-10'}`} />
        </div>
        <BottomDock
          side={side}
          style={side ? { width: dockSize } : { height: dockSize }}
          expanded={dockExpanded}
          onToggleExpand={compact ? toggleDockExpanded : undefined}
        />

        {/* Tablets and phones: the navigator and info panel slide over everything below the top bar */}
        {compact && (showLeft || showInfo) && (
          <>
            <div className="absolute inset-0 z-30 bg-black/50 animate-fade-in" onClick={() => setPanels(false, false)} aria-hidden="true" />
            {showLeft && (
              <div className="absolute left-0 top-0 bottom-0 z-40 flex w-[min(320px,86vw)] shadow-2xl animate-slide-in-left">
                <LeftPanel style={{ width: '100%' }} />
              </div>
            )}
            {showInfo && (
              <div className="absolute right-0 top-0 bottom-0 z-40 flex w-[min(440px,calc(100vw-2.75rem))] shadow-2xl animate-slide-in-right">
                <RightPanel style={{ width: '100%' }} />
              </div>
            )}
          </>
        )}
      </div>
      <TutorPanel />
      <QuizPanel />
      <HelpOverlay />
      <InstallBanner />
    </div>
  );
}
