'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useAppStore, type ViewMode } from '@/store/useAppStore';
import { useSceneStore, CAMERA_PRESETS } from '@/store/useSceneStore';
import { useECGStore, useBlind } from '@/store/useECGStore';
import { sim } from '@/lib/sim/simulation';
import { PHASE_DESCRIPTIONS, PHASE_LABELS, type CyclePhase } from '@/lib/ecg/engine';
import { LANDMARK_BY_ID, PROFILE_TERRITORY } from '@/lib/anatomy/landmarks';
import { IconClose, IconHome, IconRotate, IconZoomIn, IconZoomOut } from '@/components/ui/icons';
import { useContent } from '@/lib/content';
import { useOnceHint } from '@/lib/hints';
import { useCourseStore } from '@/store/useCourseStore';
import { useSoundStore } from '@/store/useSoundStore';
import { findLesson } from '@/lib/courses';
import HeartSoundsButton, { HeardLegend } from '@/components/ui/HeartSoundsButton';
import Bullseye from '@/components/anatomy/Bullseye';
import { formatCarm } from '@/components/scene/CArmTracker';
import { ATRIAL_PATTERNS, VENT_PATTERNS } from '@/lib/anatomy/activation';
import { useIsTouch } from '@/lib/device';
import { showReading } from '@/lib/actions';
import { useOverlayCover } from '@/components/scene/overlayCover';
import { keyStartsFolded, overlaySize, stepReadsKey } from '@/components/scene/overlayLayout';
import type { Box } from '@/components/scene/labelPlacement';

const MODES: { value: ViewMode; label: string; key: string; title: string }[] = [
  { value: 'external', label: 'Exterior', key: '1', title: 'Photoreal exterior with coronary vessels' },
  { value: 'sectioned', label: 'Sectioned', key: '2', title: 'Four-chamber cut: valves, chordae, septum and blood flow' },
  { value: 'xray', label: 'X-ray', key: '3', title: 'Translucent heart showing internal structures' },
  { value: 'conduction', label: 'Conduction', key: '4', title: 'Electrical conduction system firing in sync with the ECG' },
  { value: 'territories', label: 'Territories', key: '5', title: 'Coronary perfusion territories (right-dominant)' },
  { value: 'activation', label: 'Activation', key: '6', title: 'Epicardial activation-time (isochronal) map of the current beat, like an EP mapping system' },
];

/** The phase's name in a slim view's one-line cycle box (the full name is its tooltip) */
const PHASE_SHORT: Record<CyclePhase, string> = {
  'atrial-systole': 'Atrial kick',
  'isovolumetric-contraction': 'Isovol. contraction',
  'rapid-ejection': 'Rapid ejection',
  'reduced-ejection': 'Reduced ejection',
  'isovolumetric-relaxation': 'Isovol. relaxation',
  'rapid-filling': 'Rapid filling',
  diastasis: 'Slow filling',
  fibrillation: 'Fibrillation',
  pulseless: 'No pulse',
  arrest: 'No activity',
};

interface HudState { phase: CyclePhase; mitral: number; aortic: number; atria: number; s1: boolean; s2: boolean }

function readHud(): HudState {
  const m = sim.engine.mechanics(sim.time);
  const ev = m.events;
  const t = sim.time;
  return {
    phase: m.phase,
    mitral: m.mitralOpen,
    aortic: m.aorticOpen,
    // (fibrillating or fluttering atria give no kick)
    atria: m.fibrillating === 'atria' || sim.engine.segmentAt(t).profile.rhythm === 'flutter' ? 0 : m.atrialContraction,
    s1: !!ev && t - ev.mc >= 0 && t - ev.mc < 90,
    s2: !!ev && t - ev.ac >= 0 && t - ev.ac < 90,
  };
}

/**
 * The lesson step on screen: is a "tap the … on the heart" check waiting for its answer (`tapOpen`), and does the step
 * send the learner to the territory key (`readsKey`)? (One string, so that the store hands back a stable value.)
 */
function useStepNeeds(): { tapOpen: boolean; readsKey: boolean } {
  const lib = useContent();
  const needs = useCourseStore((s) => {
    if (!s.active || s.finished || !lib) return '';
    const found = findLesson(s.active.course, s.active.lesson, lib.courses);
    if (!found) return '';
    const at = Math.min(s.active.step, found.lesson.steps.length - 1);
    const step = found.lesson.steps[at];
    if (!step) return '';
    return `${step.check?.kind === 'tap' && !s.answers[at]?.solved ? 'tap' : ''} ${stepReadsKey(step) ? 'key' : ''}`;
  });
  return { tapOpen: needs.includes('tap'), readsKey: needs.includes('key') };
}

export default function SceneOverlay() {
  const viewMode = useAppStore((s) => s.viewMode);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const labelsVisible = useAppStore((s) => s.labelsVisible);
  const toggleLabels = useAppStore((s) => s.toggleLabels);
  const showFlow = useAppStore((s) => s.showFlow);
  const toggleFlow = useAppStore((s) => s.toggleFlow);
  const showVector = useAppStore((s) => s.showVector);
  const toggleVector = useAppStore((s) => s.toggleVector);
  const autoRotate = useAppStore((s) => s.autoRotate);
  const toggleAutoRotate = useAppStore((s) => s.toggleAutoRotate);
  const setCameraPreset = useSceneStore((s) => s.setCameraPreset);
  const activeProfileId = useECGStore((s) => s.activeProfileId);
  const selectedLead = useECGStore((s) => s.selectedLead);
  const selectLead = useECGStore((s) => s.selectLead);
  const [hud, setHud] = useState<HudState>(readHud);
  const [showAngio, setShowAngio] = useState(false);
  const [narrow, setNarrow] = useState(false);
  // a slim view (beside the ECG and a lesson's text on a phone on its side): one row of controls, a one-line cycle box
  const [thin, setThin] = useState(false);
  // a low view (a drawer sharing an upright phone with the other one) has no height to spare for a row of pills
  const [low, setLow] = useState(false);
  // The ECG / monitor panel can be enlarged until only a sliver of the heart shows: hide the controls then
  const [tiny, setTiny] = useState(false);
  const [showViews, setShowViews] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  /** the controls at the top left: a tap anywhere else closes the folded toggles */
  const moreRef = useRef<HTMLDivElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const touch = useIsTouch();
  const selectedId = useSceneStore((s) => s.selectedStructureId);
  // Tapping the heart while the reading is out of sight (list page, or a drawer taking the whole screen) shows a short card instead
  const readingShown = useAppStore((s) => s.heart !== 'full' && s.ecg !== 'full' && !(s.short && s.ecg !== 'closed') && !(s.compact && s.listOpen));
  // in a lesson the lesson's own text says what is ringed (and checks what was tapped)
  const inLesson = useCourseStore((s) => !!s.active);
  const peek = !!selectedId && !readingShown && !inLesson;
  const [coachHint, dismissCoach] = useOnceHint('heart');
  const coach = coachHint && !inLesson;
  useEffect(() => {
    if (selectedId && coach) dismissCoach();
  }, [selectedId, coach, dismissCoach]);
  // A small view in a lesson (or any low or slim view): the toggles fold into a "More" menu so they stop covering the
  // heart and the tags the lesson points at. In a slim view the camera views fold into it too.
  const fold = narrow && (inLesson || low || thin);
  useEffect(() => {
    if (!fold) setMoreOpen(false);
  }, [fold]);
  // The camera panel opens from the Views pill inside a slim view's More and from a small view's own Views button: a
  // change between the two layouts, or More closing in a slim view, puts it away, so that it never opens by itself
  useEffect(() => setShowViews(false), [thin]);
  useEffect(() => {
    if (thin && !moreOpen) setShowViews(false);
  }, [thin, moreOpen]);
  useEffect(() => {
    if (!moreOpen) return;
    const away = (e: PointerEvent) => { if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false); };
    // Escape closes the panel. With the keyboard in it (or on More), the key is spent here — the app-wide Escape
    // would also clear the selected part — and the keyboard goes back to More rather than to the top of the page.
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (moreRef.current?.contains(document.activeElement)) {
        e.stopPropagation();
        moreButton.current?.focus();
      }
      setMoreOpen(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [moreOpen]);
  const soundsOn = useSoundStore((s) => s.heartSounds);
  // The territory key can be put away; each new step of a lesson starts it afresh: open, or folded to its chip in a
  // lesson's slim view or while a "tap the …" check is open in a low one — unless the step sends the learner to the
  // legend (keyStartsFolded). While a tap check is open it also drops its bull's-eye, which would cover the arteries
  // to be tapped.
  const { tapOpen, readsKey } = useStepNeeds();
  const lessonStep = useCourseStore((s) => s.active?.step ?? -1);
  /** what the learner chose with the key's ✕ or its chip at this step (null: the step's default) */
  const [keyChoice, setKeyHidden] = useState<boolean | null>(null);
  useEffect(() => setKeyHidden(null), [lessonStep]);
  const keyHidden = keyChoice ?? keyStartsFolded({ inLesson, thin, low, tapOpen, readsKey });
  // Hiding the key swaps it for the button that brings it back (and back again): the keyboard follows to the
  // button that took the place of the one just pressed, instead of falling to the top of the page
  const keyChip = useRef<HTMLButtonElement>(null);
  const keyBox = useRef<HTMLDivElement>(null);
  const keyFocus = useRef(false);
  const toggleKey = (hide: boolean) => {
    keyFocus.current = true;
    setKeyHidden(hide);
  };
  useEffect(() => {
    if (!keyFocus.current) return;
    keyFocus.current = false;
    (keyHidden ? keyChip.current : keyBox.current?.querySelector<HTMLButtonElement>('[data-hide-key]'))?.focus();
  }, [keyHidden]);

  // Condense the overlay when the 3D viewport is small (phone, or a phone on its side)
  useEffect(() => {
    const el = probe.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const size = overlaySize(e.contentRect.width, e.contentRect.height);
      setNarrow(size.narrow);
      setThin(size.thin);
      setLow(size.low);
      setTiny(size.tiny);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setHud(readHud()), 70);
    return () => window.clearInterval(id);
  }, []);

  // a question about the tracing is open: the legend must not name the culprit artery
  const blind = useBlind();
  const culprit = blind ? undefined : PROFILE_TERRITORY[activeProfileId];
  const carm = useSceneStore((s) => s.carm);
  const bullseye = viewMode === 'territories' && !narrow && !tapOpen;

  // Tell the name tags where the controls are (they are placed clear of them), and the camera how far down the
  // controls along the top of a small view reach (it frames the heart below them)
  const setCover = useOverlayCover((s) => s.setCover);
  const layoutKey = [tiny, narrow, thin, fold, moreOpen, viewMode, !!culprit, peek, coach, showViews, showAngio, keyHidden, bullseye, soundsOn, blind, selectedLead].join();
  useEffect(() => {
    const root = probe.current?.parentElement;
    if (!root) return;
    const measure = () => {
      const base = root.getBoundingClientRect();
      const boxes: Box[] = [];
      let top = 0;
      root.querySelectorAll<HTMLElement>('[data-cover]').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const b = { x0: Math.round(r.left - base.left), y0: Math.round(r.top - base.top), x1: Math.round(r.right - base.left), y1: Math.round(r.bottom - base.top) };
        boxes.push(b);
        // (only controls reaching the middle third, where the heart is drawn: a wide view's corner buttons miss it)
        if (el.dataset.cover === 'top' && b.x1 > base.width / 3 && b.x0 < (base.width * 2) / 3) top = Math.max(top, b.y1);
      });
      setCover(boxes, narrow ? top : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    root.querySelectorAll('[data-cover]').forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [layoutKey, narrow, setCover]);
  useEffect(() => () => setCover([], 0), [setCover]);
  const zoom = (dir: 1 | -1) => {
    const canvas = document.querySelector('.heart-stage canvas');
    canvas?.dispatchEvent(new WheelEvent('wheel', { deltaY: dir * -240, bubbles: true, cancelable: true }));
  };
  const valve = (label: string, open: number) => (
    <div className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${open > 0.5 ? 'bg-emerald-400' : 'bg-slate-600 ring-1 ring-slate-400/50'}`} />
      <span className="text-slate-300">{label}</span>
      <span className={`ml-auto font-semibold ${open > 0.5 ? 'text-emerald-300' : 'text-slate-400'}`}>{open > 0.5 ? 'open' : 'closed'}</span>
    </div>
  );
  // the heart sounds as they happen: lit while the valves shut ("S1 lights up" in the lessons). A small view keeps
  // them as short chips.
  const sound = (on: boolean, which: 'S1' | 'S2', compact: boolean) => (
    <span
      className={`rounded ${compact ? 'px-1 shrink-0' : 'px-1.5'} ${on ? 'bg-sky-500 text-white' : 'bg-slate-800 text-slate-500'}`}
      title={compact ? `${which} ${which === 'S1' ? '“lub”: the mitral and tricuspid valves close' : '“dub”: the aortic and pulmonic valves close'}` : undefined}
    >
      {compact ? which : `${which} ${which === 'S1' ? '“lub”' : '“dub”'}`}
    </span>
  );
  const arrested = !blind && (hud.phase === 'fibrillation' || hud.phase === 'pulseless' || hud.phase === 'arrest');
  // a slim view: the cycle box is one line under the View menu — the phase, a dot for each pair of valves
  // (green while open) and the S1 / S2 chips. (`top`: it runs along the top edge, and the heart is framed below it.)
  // The outflow pair is "Ao", never "AV": the app's "AV valves" are the atrioventricular (mitral and tricuspid) ones.
  const cycleLine = (cover: 'top' | 'box') => (
    <div
      className="flex items-center gap-1 min-w-0 scene-panel rounded-lg px-1.5 py-1 text-[11px] leading-tight shadow-xl"
      title={blind ? undefined : `${PHASE_LABELS[hud.phase]}: ${PHASE_DESCRIPTIONS[hud.phase]}`}
      data-cover={cover}
      data-cycle="line"
    >
      <span className={`min-w-0 flex-1 truncate font-semibold ${arrested ? 'text-red-400' : 'text-white'}`}>{blind ? 'Phase hidden' : PHASE_SHORT[hud.phase]}</span>
      {([['MV', 'Mitral / tricuspid', hud.mitral], ['Ao', 'Aortic / pulmonic', hud.aortic]] as const).map(([short, full, open]) => (
        <span key={short} className="flex items-center gap-0.5 shrink-0" title={`${full} valves ${open > 0.5 ? 'open' : 'closed'}`}>
          <span className={`w-2 h-2 rounded-full ${open > 0.5 ? 'bg-emerald-400' : 'bg-slate-600 ring-1 ring-slate-400/50'}`} />
          <span className={open > 0.5 ? 'text-emerald-300' : 'text-slate-400'}>{short}</span>
        </span>
      ))}
      {sound(hud.s1, 'S1', true)}
      {sound(hud.s2, 'S2', true)}
    </div>
  );
  // the camera's presets, zoom and cath-lab projections: a panel under "Views" in a small view, inside More in a slim one
  const cameraNav = (
    <>
      {showAngio && (
        <div className="scene-panel rounded-lg p-1.5 shadow-xl">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 px-1">Angiographic projections</div>
          <div className="px-1 mb-1 text-[11px] text-slate-400" title="C-arm angulation equivalent to the current 3D view (detector position)">
            This view: <b className="font-mono text-sky-300">{formatCarm(carm.primary, carm.secondary)}</b>
          </div>
          <div className="grid grid-cols-2 gap-0.5">
            {CAMERA_PRESETS.filter((p) => p.group === 'angio').map((p) => (
              <button key={p.label} onClick={() => setCameraPreset(p)} title={p.description} className="px-2 py-1 touch:py-2 text-[11px] text-slate-200 hover:bg-white/10 rounded text-left whitespace-nowrap">
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="scene-panel rounded-lg overflow-hidden">
        <div className="grid grid-cols-3 gap-0.5 p-1">
          {CAMERA_PRESETS.filter((p) => p.group === 'anatomic').map((p) => (
            <button key={p.label} onClick={() => setCameraPreset(p)} title={`${p.label}: ${p.description}`} className="px-2 py-1 touch:py-2 text-[11px] font-medium text-slate-200 hover:bg-white/10 rounded">
              {p.short}
            </button>
          ))}
        </div>
        <div className="border-t border-slate-600/40 p-1 flex items-center gap-0.5">
          <IconBtn onClick={() => zoom(1)} title="Zoom in"><IconZoomIn size={14} /></IconBtn>
          <IconBtn onClick={() => zoom(-1)} title="Zoom out"><IconZoomOut size={14} /></IconBtn>
          <IconBtn onClick={() => setCameraPreset(CAMERA_PRESETS[0])} title="Reset to anterior view"><IconHome size={14} /></IconBtn>
          <IconBtn onClick={toggleAutoRotate} title="Auto-rotate"><IconRotate size={14} /></IconBtn>
          <button
            onClick={() => setShowAngio((v) => !v)}
            className={`ml-auto px-2 py-1 touch:py-2 text-[11px] rounded ${showAngio ? 'bg-cardiac-accent/25 text-cardiac-accent' : 'text-slate-300 hover:bg-white/10'}`}
            title="Cath-lab projections (RAO / LAO / cranial / caudal)"
          >
            Angio
          </button>
        </div>
      </div>
    </>
  );

  if (tiny) {
    // Only a strip of the heart shows (the ECG enlarged over it, or a lesson on a small phone): no controls. In a lesson
    // the one-line cycle box stays along the bottom, for the steps that ask the learner to watch it — but not while a
    // "tap the …" check needs all of the strip for the name tags.
    return (
      <>
        <div ref={probe} className="hidden" />
        {inLesson && !tapOpen && <div className="absolute inset-x-2 bottom-2 z-10">{cycleLine('box')}</div>}
      </>
    );
  }

  return (
    <>
      <div ref={probe} className="hidden" />
      {/* View modes + toggles */}
      <div
        ref={moreRef}
        // (slim: the column spans the view — the cycle line runs across it and an open More shrinks to fit above the
        // bottom edge — so only its boxes take taps, not the room between them. An open More, with the camera views,
        // sits above the territory key along the bottom edge, as the Views panel of a small view does.)
        className={`absolute top-2 left-2 ${thin && moreOpen ? 'z-20' : 'z-10'} flex flex-col gap-1.5 ${thin ? 'right-2 bottom-2 pointer-events-none [&>*]:pointer-events-auto' : narrow ? 'max-w-[calc(100%-6rem)]' : 'max-w-[calc(100%-1rem)]'}`}
      >
        {narrow && (
          <div className="self-start max-w-full flex items-center gap-1.5" data-cover="top">
            {/* a small view has no room for six buttons in a row: one menu shows them all */}
            <label className={`min-w-0 flex items-center gap-1.5 pr-1 rounded-lg border border-cardiac-accent/60 bg-black/70 shadow-xl ${thin ? 'pl-1.5' : 'pl-2.5'}`}>
              {/* (slim: the menu alone, so that it and More stay on one line) */}
              {!thin && <span className="text-[11px] text-slate-300">View</span>}
              <select
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value as ViewMode)}
                aria-label="3D view"
                className="min-w-0 max-w-full h-9 bg-transparent text-[13px] font-semibold text-cardiac-accent pr-1 focus:outline-none"
              >
                {MODES.map((m) => <option key={m.value} value={m.value} className="bg-slate-900 text-slate-100">{m.label}</option>)}
              </select>
            </label>
            {fold && (
              <button
                ref={moreButton}
                onClick={() => setMoreOpen((v) => !v)}
                aria-expanded={moreOpen}
                aria-controls="scene-toggles"
                title={thin ? 'Labels, cardiac vector, auto-rotate, heart sounds, camera views' : 'Labels, cardiac vector, auto-rotate, heart sounds'}
                className={`shrink-0 h-[38px] ${thin ? 'px-2' : 'px-2.5'} rounded-lg border text-[11px] font-medium whitespace-nowrap shadow-xl backdrop-blur-sm ${moreOpen ? 'border-cardiac-accent/60 bg-cardiac-accent/20 text-cardiac-accent' : 'border-slate-600/60 bg-black/60 text-slate-200'}`}
              >
                More {moreOpen ? '▴' : '▾'}
              </button>
            )}
          </div>
        )}
        <div
          className={`rounded-lg border border-slate-600/60 bg-black/60 backdrop-blur-sm shadow-xl ${narrow ? 'hidden' : 'flex flex-wrap overflow-hidden'}`}
          role="radiogroup"
          aria-label="3D view mode"
          data-cover="top"
        >
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => setViewMode(m.value)}
              title={`${m.title} (${m.key})`}
              role="radio"
              aria-checked={viewMode === m.value}
              tabIndex={viewMode === m.value ? 0 : -1}
              onKeyDown={(e) => {
                const direction = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
                if (!direction && e.key !== 'Home' && e.key !== 'End') return;
                e.preventDefault();
                e.stopPropagation();
                const index = e.key === 'Home' ? 0 : e.key === 'End' ? MODES.length - 1 : (MODES.findIndex((mode) => mode.value === viewMode) + direction + MODES.length) % MODES.length;
                setViewMode(MODES[index].value);
                const buttons = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
                buttons?.[index]?.focus();
              }}
              className={`px-3 py-2 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                viewMode === m.value ? 'bg-cardiac-accent text-slate-950' : 'text-slate-200 hover:bg-white/10'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {(!fold || moreOpen) && (
          <div
            id="scene-toggles"
            // folded: a small panel that opens under the View menu (a tap outside it or Escape closes it). Slim: it
            // also holds the camera views, and scrolls rather than run off the bottom of the view.
            className={fold
              ? `self-start flex flex-wrap gap-1.5 p-1.5 scene-panel rounded-lg shadow-xl ${thin ? 'max-w-full min-h-0 overflow-y-auto overscroll-contain' : 'max-w-[15rem]'}`
              : `flex gap-1 ${narrow ? 'overflow-x-auto no-scrollbar scroll-fade-r pr-6' : 'flex-wrap'}`}
            data-cover={fold ? 'box' : 'top'}
          >
            <Pill active={labelsVisible} onClick={toggleLabels} title="Toggle labels (L)">Labels</Pill>
            {viewMode === 'sectioned' && <Pill active={showFlow} onClick={toggleFlow} title="Animated blood flow (F)">Blood flow</Pill>}
            <Pill active={showVector} onClick={toggleVector} title="Show the instantaneous cardiac electrical vector (V)">Cardiac vector</Pill>
            <Pill active={autoRotate} onClick={toggleAutoRotate} title="Slowly rotate the heart">Auto-rotate</Pill>
            <HeartSoundsButton pill />
            {selectedLead && <Pill active onClick={() => selectLead(selectedLead)} title="Hide the lead view">Lead {selectedLead} view ✕</Pill>}
            {thin && (
              <>
                <Pill active={showViews} onClick={() => setShowViews((v) => !v)} title="Camera views, zoom and cath-lab projections" expanded={showViews}>
                  Views {showViews ? '▴' : '▾'}
                </Pill>
                {showViews && <div className="basis-full flex flex-col gap-1.5">{cameraNav}</div>}
              </>
            )}
          </div>
        )}
        {viewMode === 'conduction' && !narrow && (
          <div className="text-[11px] text-slate-300 bg-black/55 rounded-md px-2 py-1 max-w-xs leading-snug" data-cover="box">
            <span className="text-amber-300">●</span> atrial · <span className="text-orange-400">●</span> AV node / His · <span className="text-red-400">●</span> bundles · <span className="text-rose-300">●</span> Purkinje. Red ✕ = block. Slow to 0.25× to follow each beat.
          </div>
        )}
        {thin && !peek && !coach && cycleLine('top')}
        {soundsOn && (
          // what there is to hear with this heart — not named while a question is open, where it could give the answer away
          <div className={`self-start bg-black/55 rounded-md px-2 py-1 ${narrow ? 'max-w-[15rem]' : 'max-w-xs'}`} data-cover="box">
            <HeardLegend />
          </div>
        )}
      </div>

      {/* Cardiac cycle HUD (a slim view has its one-line version under the View menu, above) */}
      {!thin && (
        <div
          // small views: bottom-left, where the heart leaves room (its apex points to the viewer's right) — unless a legend sits there
          className={`absolute z-10 scene-panel rounded-lg text-[11px] shadow-xl ${
            narrow ? `bottom-2 w-[min(9.5rem,40%)] p-1.5 ${viewMode === 'activation' || viewMode === 'territories' || culprit ? 'right-2' : 'left-2'}` : 'right-2 top-2 w-56 p-2'
          } ${narrow && (peek || coach) ? 'hidden' : ''}`}
          title={blind ? undefined : PHASE_DESCRIPTIONS[hud.phase]}
          data-cover="box"
        >
          {!narrow && <div className="text-[11px] uppercase tracking-wider text-slate-400">Cardiac cycle</div>}
          <div className={`font-semibold leading-tight ${narrow ? 'text-[11px] truncate' : 'text-xs mt-0.5'} ${arrested ? 'text-red-400' : 'text-white'}`}>{blind ? 'Phase hidden' : PHASE_LABELS[hud.phase]}</div>
          {/* (the phase's name would answer a question about the rhythm: the valves and sounds below still show what happens) */}
          {!narrow && <p className="text-[11px] text-slate-400 leading-snug mt-1 line-clamp-3">{blind ? 'Hidden while a question is open: watch the valves and the heart itself.' : PHASE_DESCRIPTIONS[hud.phase]}</p>}
          <div className={`space-y-0.5 ${narrow ? 'mt-1' : 'mt-1.5'}`}>
            {valve(narrow ? 'MV / TV' : 'Mitral / tricuspid', hud.mitral)}
            {valve(narrow ? 'AV / PV' : 'Aortic / pulmonic', hud.aortic)}
          </div>
          {/* (a small view keeps S1 and S2 as short chips: a lesson asks the learner to watch them light up) */}
          <div className={`flex gap-1.5 ${narrow ? 'mt-1' : 'mt-1.5'}`}>
            {sound(hud.s1, 'S1', narrow)}
            {sound(hud.s2, 'S2', narrow)}
            {!narrow && <span className={`px-1.5 rounded ${hud.atria > 0.3 ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-500'}`}>atrial kick</span>}
          </div>
        </div>
      )}

      {/* Territory legend */}
      {viewMode === 'activation' && !(narrow && peek) && <ActivationLegend narrow={narrow} />}

      {(viewMode === 'territories' || (culprit && viewMode !== 'activation')) && !(narrow && peek) && (keyHidden ? (
        <button
          ref={keyChip}
          onClick={() => toggleKey(false)}
          className={`absolute left-2 z-10 ${narrow ? 'bottom-2' : 'bottom-9'} px-2.5 py-1.5 touch:py-2 rounded-lg border border-slate-600/60 bg-black/60 backdrop-blur-sm text-[11px] text-slate-200 shadow-xl`}
          aria-expanded={false}
          data-cover="box"
        >
          {viewMode === 'territories' ? 'Territory key' : 'Key'} ▴
        </button>
      ) : (
        // (slim: the whole width, so the key is a few lines high rather than a column down the heart)
        <div ref={keyBox} className={`absolute left-2 z-10 scene-panel rounded-lg text-[11px] text-slate-200 shadow-xl flex items-end gap-2 ${narrow ? `bottom-2 p-1.5 ${thin ? 'max-w-[calc(100%-1rem)]' : 'max-w-[calc(58%-1rem)]'} leading-snug` : 'bottom-9 p-2'}`} data-cover="box">
          <div>
            {viewMode === 'territories' && (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] uppercase tracking-wider text-slate-400">Perfusion territory</span>
                  <HideKey onClick={() => toggleKey(true)} />
                </div>
                <div className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-[#26d973]" /> LAD — anterior wall, anterior septum, apex</div>
                <div className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-[#4d8cff]" /> LCx — lateral &amp; posterolateral LV</div>
                <div className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-[#ff8c1f]" /> RCA — inferior LV, RV free wall</div>
                {bullseye && <div className="mt-1 text-[11px] text-slate-500">Right-dominant pattern; real anatomy varies</div>}
              </>
            )}
            {culprit && (
              <div className="flex items-center gap-1.5 mt-1 text-fuchsia-300">
                <span className="w-3 h-2 rounded-sm bg-fuchsia-700 animate-pulse" /> Ischemic territory (pulsing): {culprit} culprit lesion
                {viewMode !== 'territories' && <HideKey onClick={() => toggleKey(true)} />}
              </div>
            )}
          </div>
          {bullseye && <Bullseye culprit={culprit} size={118} />}
        </div>
      ))}

      {/* Camera navigation (a slim view has it inside More) */}
      {narrow && !thin && (
        <button
          onClick={() => setShowViews((v) => !v)}
          className={`absolute top-2 right-2 z-10 px-2.5 py-1.5 touch:py-2 rounded-lg border text-[11px] backdrop-blur-sm ${showViews ? 'border-cardiac-accent/60 bg-cardiac-accent/20 text-cardiac-accent' : 'border-slate-600/60 bg-black/60 text-slate-200'}`}
          aria-expanded={showViews}
          data-cover="top"
        >
          Views ▾
        </button>
      )}
      {!thin && (
        <div className={`absolute right-2 z-20 flex-col items-end gap-1.5 ${narrow ? (showViews ? 'flex top-12 max-h-[calc(100%-3.5rem)] overflow-y-auto no-scrollbar' : 'hidden') : 'flex bottom-9'}`} data-cover="box">
          {cameraNav}
        </div>
      )}

      {peek && <PeekCard id={selectedId!} />}
      {coach && !peek && (
        // a first-time tip along the bottom edge: it must never cover the heart it is talking about
        <div className="absolute inset-x-0 bottom-2 z-20 flex justify-center px-2 pointer-events-none">
          <div className="pointer-events-auto scene-panel rounded-full pl-3.5 pr-1.5 py-1.5 flex items-center gap-2 max-w-full shadow-2xl animate-fade-in" data-cover="box">
            <p className="min-w-0 text-xs text-slate-100 leading-snug">
              <b>{touch ? 'Tap' : 'Click'} any part of the heart</b> to see what it is.
              <span className="hidden sm:inline text-slate-300"> {touch ? 'Drag to turn it, pinch to zoom.' : 'Drag to turn it, scroll to zoom.'}</span>
            </p>
            <button onClick={dismissCoach} className="shrink-0 px-3 py-1 touch:py-2 rounded-full bg-cardiac-accent text-slate-950 text-xs font-semibold">Got it</button>
          </div>
        </div>
      )}

      <div className="absolute bottom-1.5 left-2 right-2 z-0 pointer-events-none flex justify-between text-[11px] text-slate-500">
        <span className={narrow ? 'hidden' : ''}>{touch ? 'Drag to rotate · pinch to zoom · two-finger drag to pan · tap a structure' : 'Drag to rotate · scroll to zoom · right-drag to pan · click a structure'}</span>
        {/* (not in a slim view, where it would run across the heart's lower name tags) */}
        <span className={thin ? 'hidden' : 'hidden md:inline ml-auto'}>Educational simulation — not for clinical use</span>
      </div>
    </>
  );
}

/** What you just tapped, with a way into the full description */
function PeekCard({ id }: { id: string }) {
  const lib = useContent();
  const s = lib?.structures[id];
  const name = s?.name ?? LANDMARK_BY_ID[id]?.name ?? id.replace(/-/g, ' ');
  const readMore = () => showReading();
  return (
    <div className="absolute left-2 right-2 bottom-2 z-30 flex justify-center pointer-events-none">
      <div className="pointer-events-auto w-full max-w-md scene-panel rounded-xl p-3 shadow-2xl animate-fade-in" role="dialog" aria-label={name} data-cover="box">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wider text-sky-300">{s?.group?.replace('-', ' ') ?? 'Structure'}</div>
            <div className="text-sm font-semibold text-white leading-tight">{name}</div>
            {s?.summary && <p className="text-xs text-slate-300 mt-1 leading-snug line-clamp-3">{s.summary}</p>}
          </div>
          <button onClick={() => useSceneStore.getState().selectStructure(null)} className="p-1.5 -mr-1 -mt-1 text-slate-400 hover:text-white" aria-label="Close"><IconClose size={16} /></button>
        </div>
        <button onClick={readMore} className="mt-2 w-full py-2 rounded-lg bg-cardiac-accent/90 text-slate-950 text-xs font-semibold hover:bg-cardiac-accent">
          Read more →
        </button>
      </div>
    </div>
  );
}

function Pill({ active, onClick, children, title, expanded }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string; expanded?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      // (a pill that opens a panel says so instead of being a pressed toggle)
      aria-pressed={expanded === undefined ? active : undefined}
      aria-expanded={expanded}
      className={`px-2 py-0.5 touch:py-1.5 touch:px-2.5 rounded-full text-[11px] whitespace-nowrap shrink-0 border backdrop-blur-sm transition-colors ${
        active ? 'bg-sky-500/25 border-sky-400/50 text-sky-100' : 'bg-black/50 border-slate-600/60 text-slate-300 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

/** Puts the territory key away (a "Territory key" button brings it back) */
function HideKey({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} data-hide-key className="shrink-0 ml-auto -my-1 -mr-1 p-1 touch:p-2 touch:-m-2 rounded text-slate-400 hover:text-white hover:bg-white/10" aria-label="Hide the key" title="Hide the key">
      <IconClose size={12} />
    </button>
  );
}

function IconBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} aria-label={title} className="p-1.5 touch:p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded">
      {children}
    </button>
  );
}

const LAT_GRADIENT = 'linear-gradient(90deg, hsl(0 90% 55%), hsl(60 90% 55%), hsl(120 80% 45%), hsl(180 80% 50%), hsl(240 80% 60%), hsl(281 80% 60%))';

function ActivationLegend({ narrow }: { narrow: boolean }) {
  const a = useSceneStore((s) => s.activation);
  const vp = a.vent ? VENT_PATTERNS[a.vent] : null;
  const ap = a.atria ? ATRIAL_PATTERNS[a.atria] : null;
  // a question about the rhythm is open: the map stays, the words that name the pattern go
  const blind = useBlind();
  return (
    <div className={`absolute left-2 z-10 scene-panel rounded-lg text-[11px] text-slate-200 shadow-xl ${narrow ? 'bottom-2 p-1.5 w-[min(13rem,calc(58%-1rem))]' : 'bottom-9 p-2 w-72'}`} data-cover="box">
      <div className="text-[11px] uppercase tracking-wider text-slate-400">Activation map · local activation time</div>
      <div className="mt-1 h-2 rounded-sm" style={{ background: LAT_GRADIENT }} />
      <div className="flex justify-between text-[11px] text-slate-400 mt-0.5">
        <span>earliest</span>
        <span>{vp ? `ventricles ${a.vFirstMs}–${a.qrsMs} ms` : ''}{vp && ap ? ' · ' : ''}{ap ? `atria ${a.aFirstMs}–${a.pMs} ms` : ''}</span>
        <span>latest</span>
      </div>
      {blind ? (
        <div className="mt-1.5 text-slate-400 leading-snug">Read the map yourself: the names come back when you have answered.</div>
      ) : vp ? (
        <div className="mt-1.5 space-y-0.5 leading-snug">
          <div className="text-white font-semibold">{vp.label}</div>
          {!narrow && (
            <>
              <div><span className="text-red-300">Earliest:</span> {vp.earliest}</div>
              <div><span className="text-violet-300">Latest:</span> {vp.latest}</div>
              <div className="text-slate-400">{vp.note}</div>
            </>
          )}
        </div>
      ) : (
        <div className="mt-1.5 text-amber-200">No organized ventricular activation sequence (fibrillation / polymorphic VT) — nothing to map.</div>
      )}
      {!ap && !narrow && !blind && (
        <div className="mt-1 text-slate-400">Atria: not mapped (AF, flutter macro-re-entry with no single earliest site, or no P wave).</div>
      )}
      {!narrow && (
        <div className="mt-1.5 text-[11px] text-slate-500 leading-snug">
          Times from QRS / P onset. White band = the wavefront now. Epicardial surface only; septal activation (first ~20 ms) is hidden inside. Normal sequence after Durrer et al., Circulation 1970.
        </div>
      )}
    </div>
  );
}
