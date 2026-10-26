'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import TopBar from '@/components/layout/TopBar';
import LeftPanel from '@/components/layout/LeftPanel';
import RightPanel from '@/components/layout/RightPanel';
import BottomDock from '@/components/layout/BottomDock';
import DrawerBar from '@/components/layout/DrawerBar';
import HelpOverlay from '@/components/layout/HelpOverlay';
import SceneOverlay from '@/components/scene/SceneOverlay';
import TutorPanel from '@/components/tutor/TutorPanel';
import QuizPanel from '@/components/tutor/QuizPanel';
import SimulationDriver from '@/components/sim/SimulationDriver';
import { InstallBanner } from '@/components/ui/InstallApp';
import HomeScreen from '@/components/home/HomeScreen';
import SimulatorScreen from '@/components/simulator/SimulatorScreen';
import BackNav from '@/components/layout/BackNav';
import FeedbackForm from '@/components/feedback/FeedbackForm';
import AdminPanel from '@/components/admin/AdminPanel';
import FeedbackService from '@/components/admin/FeedbackService';
import { useAppStore, type ViewMode } from '@/store/useAppStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { useECGStore } from '@/store/useECGStore';
import { useSceneStore } from '@/store/useSceneStore';
import { useTutorStore } from '@/store/useTutorStore';
import { useFeedbackStore } from '@/store/useFeedbackStore';
import { sim, scrubTo } from '@/lib/sim/simulation';
import { loadContent } from '@/lib/content';
import { showEcg, showHeart } from '@/lib/actions';
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

type DragTarget = 'left' | 'heart' | 'ecg' | null;
const VIEW_KEYS: Record<string, ViewMode> = { '1': 'external', '2': 'sectioned', '3': 'xray', '4': 'conduction', '5': 'territories', '6': 'activation' };
const SPEEDS = [0.1, 0.25, 0.5, 1];
/** how long a drawer takes to slide (keep in step with the transition below) */
const SLIDE_MS = 260;
/** smallest height a drawer can be dragged to */
const MIN_DRAWER = 120;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** true while `on`, and for a moment after it turns off (so a closing drawer can slide away before it unmounts) */
function useLingering(on: boolean, ms = SLIDE_MS + 40): boolean {
  const [linger, setLinger] = useState(on);
  useEffect(() => {
    if (on) { setLinger(true); return; }
    const id = window.setTimeout(() => setLinger(false), ms);
    return () => window.clearTimeout(id);
  }, [on, ms]);
  return on || linger;
}

export default function AppShell() {
  const mode = useAppStore((s) => s.mode);
  const listOpen = useAppStore((s) => s.listOpen);
  const heart = useAppStore((s) => s.heart);
  const ecg = useAppStore((s) => s.ecg);
  const compact = useMediaQuery(COMPACT_QUERY);
  const phone = useMediaQuery(PHONE_QUERY);
  // A phone on its side has no height to spare: a drawer opens full screen, and with both open the heart and ECG sit side by side
  const short = useMediaQuery(LANDSCAPE_PHONE_QUERY);
  const [leftWidth, setLeftWidth] = useState(300);
  // drawer sizes the learner dragged to (null = the default for the screen)
  const [heartSize, setHeartSize] = useState<number | null>(null);
  const [ecgSize, setEcgSize] = useState<number | null>(null);
  const [ecgWidth, setEcgWidth] = useState<number | null>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<DragTarget>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const lastHeart = useRef(0);
  const lastEcg = useRef(0);

  // Start loading the content library right away (it is code-split)
  useEffect(() => { void loadContent(); }, []);

  useEffect(() => { useAppStore.getState().setCompact(compact); }, [compact]);
  useEffect(() => { useAppStore.getState().setShort(short); }, [short]);
  // Phones get the full 12-lead too (it reads well in the EKG drawer, ⤢ enlarges it); 3-lead is one tap away
  useEffect(() => { useAppStore.getState().setPhone(phone); }, [phone]);
  // A new screen shape gets the default drawer sizes again
  useEffect(() => { setHeartSize(null); setEcgSize(null); setEcgWidth(null); }, [phone, compact, short]);

  // Measure the learning screen (everything below the top bar)
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setArea({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  // ── Drawer geometry ──────────────────────────────────────────
  const bar = short ? 32 : 40; // keep in step with DrawerBar's height
  const A = Math.max(0, area.h - 2 * bar);
  const hOpen = heart !== 'closed';
  const eOpen = ecg !== 'closed';
  const sideBySide = short && hOpen && eOpen;
  const hWant = clamp(heartSize ?? A * (eOpen ? 0.38 : 0.5), MIN_DRAWER, A);
  const eWant = clamp(ecgSize ?? A * (hOpen ? 0.4 : phone ? 0.5 : 0.45), MIN_DRAWER, A);
  let hH = 0;
  let eH = 0;
  if (sideBySide) {
    hH = A;
    eH = A;
  } else if (heart === 'full' || ecg === 'full') {
    // the reading is hidden: the open drawers share the whole screen
    if (hOpen && eOpen) {
      if (heart === 'full' && ecg === 'full') hH = Math.round(A / 2);
      else if (ecg === 'full') hH = Math.min(hWant, A - MIN_DRAWER);
      else hH = A - Math.min(eWant, A - MIN_DRAWER);
      eH = A - hH;
    } else if (hOpen) hH = A;
    else eH = A;
  } else {
    hH = hOpen ? hWant : 0;
    eH = eOpen ? eWant : 0;
    // always leave a strip of the reading in view
    const room = A - Math.max(72, A * 0.14);
    if (hH + eH > room && hH + eH > 0) {
      const k = Math.max(0, room) / (hH + eH);
      hH *= k;
      eH *= k;
    }
  }
  hH = Math.round(hH);
  eH = Math.round(eH);
  if (hH > 0) lastHeart.current = hH;
  if (eH > 0) lastEcg.current = eH;
  const eW = clamp(ecgWidth ?? area.w * 0.55, 280, Math.max(280, area.w - 180));
  const readingHidden = sideBySide || heart === 'full' || ecg === 'full';

  // The 3D heart is created the first time it opens and then kept (paused while closed), so it opens instantly next time
  const [heartMounted, setHeartMounted] = useState(false);
  useEffect(() => { if (hOpen && mode === 'learn') setHeartMounted(true); }, [hOpen, mode]);
  useEffect(() => { if (mode !== 'learn') setHeartMounted(false); }, [mode]);
  const heartLive = useLingering(hOpen);
  const ecgLive = useLingering(eOpen);

  const toggleEcgFull = useCallback(() => {
    const app = useAppStore.getState();
    app.setEcg(app.ecg === 'full' ? 'open' : 'full');
  }, []);

  const onDown = useCallback((t: DragTarget) => (e: React.PointerEvent) => {
    e.preventDefault();
    drag.current = t;
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    document.body.style.cursor = t === 'left' || (t === 'ecg' && sideBySide) ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }, [sideBySide]);

  const onMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current || !areaRef.current) return;
    const rect = areaRef.current.getBoundingClientRect();
    const app = useAppStore.getState();
    if (drag.current === 'left') setLeftWidth(clamp(e.clientX - rect.left, 220, Math.min(480, rect.width - 320)));
    if (drag.current === 'heart') {
      if (app.heart === 'full') app.setHeart('open');
      setHeartSize(clamp(e.clientY - rect.top - bar, MIN_DRAWER, A - (app.ecg !== 'closed' ? MIN_DRAWER : 0)));
    }
    if (drag.current === 'ecg') {
      if (sideBySide) {
        setEcgWidth(clamp(rect.right - e.clientX, 280, rect.width - 180));
      } else {
        if (app.ecg === 'full') app.setEcg('open');
        setEcgSize(clamp(rect.bottom - bar - e.clientY, MIN_DRAWER, A - (app.heart !== 'closed' ? MIN_DRAWER : 0)));
      }
    }
  }, [A, bar, sideBySide]);

  const onUp = useCallback(() => {
    drag.current = null;
    setDragging(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // the feedback form and the admin panel close on Esc (their own handler) and take no shortcuts
      const fb = useFeedbackStore.getState();
      if (fb.formOpen || fb.adminOpen) return;
      const app = useAppStore.getState();
      const tl = useTimelineStore.getState();
      // the 3D-heart and ECG shortcuts only belong to the learning screen
      if (app.mode !== 'learn' && !['q', 'Q', 't', 'T', '?', 'Escape'].includes(e.key)) return;
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
        case 'h': case 'H': app.toggleHeart(); break;
        case 'k': case 'K': app.toggleEcg(); break;
        case 'l': case 'L': app.toggleLabels(); break;
        case 'f': case 'F': app.toggleFlow(); break;
        case 'v': case 'V': app.toggleVector(); break;
        case 'e': case 'E':
          showEcg(useECGStore.getState().bottomView === 'ecg' ? 'wiggers' : 'ecg');
          break;
        case 'm': case 'M':
          showEcg(useECGStore.getState().bottomView === 'defib' ? 'ecg' : 'defib');
          break;
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
          if (VIEW_KEYS[e.key]) { app.setViewMode(VIEW_KEYS[e.key]); showHeart(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handle = 'bg-slate-700/80 hover:bg-cardiac-accent/60 active:bg-cardiac-accent transition-colors shrink-0 touch-none';
  const slide = dragging ? undefined : `height ${SLIDE_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
  const grip = (dir: 'row' | 'col') => (
    <span className={`hidden touch:block pointer-events-none rounded-full bg-slate-400/70 ${dir === 'col' ? 'w-0.5 h-8' : 'h-0.5 w-10'}`} />
  );

  const reading = compact ? (
    listOpen ? <LeftPanel style={{ width: '100%' }} /> : <RightPanel style={{ width: '100%' }} />
  ) : (
    <>
      <LeftPanel style={{ width: leftWidth }} />
      <div className={`w-1 cursor-col-resize ${handle}`} onPointerDown={onDown('left')} onDoubleClick={() => setLeftWidth(300)} role="separator" aria-orientation="vertical" aria-label="Resize the list" />
      <div className="flex-1 min-w-0 flex justify-center bg-cardiac-panel">
        <RightPanel style={{ width: '100%', maxWidth: 960 }} />
      </div>
    </>
  );

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden" style={{ ['--dock-h' as string]: mode === 'learn' && !sideBySide && eH ? `${eH + bar}px` : `${bar}px` }}>
      <SimulationDriver />
      <BackNav />
      <TopBar />
      {mode === 'home' && <HomeScreen />}
      {mode === 'simulator' && <SimulatorScreen />}
      {mode === 'learn' && (
        <div
          ref={areaRef}
          className="flex-1 min-h-0 relative grid"
          style={sideBySide
            ? { gridTemplateRows: 'auto minmax(0, 1fr) auto', gridTemplateColumns: `minmax(0, 1fr) ${eW}px` }
            : { gridTemplateRows: 'auto auto minmax(0, 1fr) auto auto', gridTemplateColumns: 'minmax(0, 1fr)' }}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {/* ── 3D heart: its bar at the top, the heart slides down under it ── */}
          <DrawerBar kind="heart" style={{ gridRow: 1, gridColumn: '1 / -1' }} />
          <section
            id="heart-drawer"
            className="relative min-w-0 overflow-hidden bg-cardiac-dark"
            style={sideBySide ? { gridRow: 2, gridColumn: 1 } : { gridRow: 2, height: hH, transition: slide }}
            aria-label="3D heart"
            ref={(el) => { if (el) el.inert = !hOpen; }}
          >
            <div className="absolute inset-x-0 bottom-0 flex flex-col" style={{ height: sideBySide ? '100%' : hH || lastHeart.current }}>
              <main className="flex-1 relative min-h-0 overflow-hidden isolate" aria-label="3D heart">
                {heartMounted && <HeartScene paused={!hOpen} />}
                {heartLive && <SceneOverlay />}
              </main>
              {!sideBySide && (
                <div
                  className={`h-1.5 touch:h-3 cursor-row-resize flex items-center justify-center ${handle}`}
                  onPointerDown={onDown('heart')}
                  onDoubleClick={() => setHeartSize(null)}
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label="Resize the 3D heart"
                >
                  {grip('row')}
                </div>
              )}
            </div>
          </section>

          {/* ── The reading: the library list and the item you picked ── */}
          <div className={`min-h-0 min-w-0 flex ${readingHidden ? 'hidden' : ''}`} style={{ gridRow: 3 }}>
            {reading}
          </div>

          {/* ── ECG: slides up from its bar at the bottom ── */}
          <section
            id="ecg-drawer"
            className="relative min-w-0 overflow-hidden bg-cardiac-panel"
            style={sideBySide ? { gridRow: 2, gridColumn: 2 } : { gridRow: 4, height: eH, transition: slide }}
            aria-label="ECG"
            ref={(el) => { if (el) el.inert = !eOpen; }}
          >
            <div className={`absolute inset-x-0 top-0 flex ${sideBySide ? 'flex-row h-full' : 'flex-col'}`} style={sideBySide ? undefined : { height: eH || lastEcg.current }}>
              <div
                className={`flex items-center justify-center ${sideBySide ? 'w-1.5 touch:w-3 cursor-col-resize' : 'h-1.5 touch:h-3 cursor-row-resize'} ${handle}`}
                onPointerDown={onDown('ecg')}
                onDoubleClick={() => { setEcgSize(null); setEcgWidth(null); }}
                role="separator"
                aria-orientation={sideBySide ? 'vertical' : 'horizontal'}
                aria-label="Resize the ECG panel"
              >
                {grip(sideBySide ? 'col' : 'row')}
              </div>
              {ecgLive && (
                <BottomDock
                  side={sideBySide}
                  style={{ flex: '1 1 0%', minHeight: 0, minWidth: 0 }}
                  expanded={ecg === 'full'}
                  onToggleExpand={toggleEcgFull}
                />
              )}
            </div>
          </section>
          <DrawerBar kind="ecg" style={sideBySide ? { gridRow: 3, gridColumn: '1 / -1' } : { gridRow: 5 }} />
        </div>
      )}
      <TutorPanel />
      <QuizPanel />
      <HelpOverlay />
      <FeedbackForm />
      <AdminPanel />
      <FeedbackService />
      <InstallBanner />
    </div>
  );
}
