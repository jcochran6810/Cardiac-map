'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useAppStore, type ViewMode } from '@/store/useAppStore';
import { useSceneStore, CAMERA_PRESETS } from '@/store/useSceneStore';
import { useECGStore } from '@/store/useECGStore';
import { sim } from '@/lib/sim/simulation';
import { PHASE_DESCRIPTIONS, PHASE_LABELS, type CyclePhase } from '@/lib/ecg/engine';
import { PROFILE_TERRITORY } from '@/lib/anatomy/landmarks';
import { IconHome, IconRotate, IconZoomIn, IconZoomOut } from '@/components/ui/icons';
import Bullseye from '@/components/anatomy/Bullseye';
import { formatCarm } from '@/components/scene/CArmTracker';
import { ATRIAL_PATTERNS, VENT_PATTERNS } from '@/lib/anatomy/activation';

const MODES: { value: ViewMode; label: string; key: string; title: string }[] = [
  { value: 'external', label: 'Exterior', key: '1', title: 'Photoreal exterior with coronary vessels' },
  { value: 'sectioned', label: 'Sectioned', key: '2', title: 'Four-chamber cut: valves, chordae, septum and blood flow' },
  { value: 'xray', label: 'X-ray', key: '3', title: 'Translucent heart showing internal structures' },
  { value: 'conduction', label: 'Conduction', key: '4', title: 'Electrical conduction system firing in sync with the ECG' },
  { value: 'territories', label: 'Territories', key: '5', title: 'Coronary perfusion territories (right-dominant)' },
  { value: 'activation', label: 'Activation', key: '6', title: 'Epicardial activation-time (isochronal) map of the current beat, like an EP mapping system' },
];

interface HudState { phase: CyclePhase; mitral: number; aortic: number; atria: number; s1: boolean; s2: boolean }

function readHud(): HudState {
  const m = sim.engine.mechanics(sim.time);
  const ev = m.events;
  const t = sim.time;
  return {
    phase: m.phase,
    mitral: m.mitralOpen,
    aortic: m.aorticOpen,
    atria: m.atrialContraction,
    s1: !!ev && t - ev.mc >= 0 && t - ev.mc < 90,
    s2: !!ev && t - ev.ac >= 0 && t - ev.ac < 90,
  };
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
  const [showViews, setShowViews] = useState(false);
  const probe = useRef<HTMLDivElement>(null);

  // Condense the overlay when the 3D viewport is small (tablet / phone)
  useEffect(() => {
    const el = probe.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 640));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setHud(readHud()), 70);
    return () => window.clearInterval(id);
  }, []);

  const culprit = PROFILE_TERRITORY[activeProfileId];
  const carm = useSceneStore((s) => s.carm);
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

  return (
    <>
      <div ref={probe} className="hidden" />
      {/* View modes + toggles */}
      <div className="absolute top-2 left-2 z-10 flex flex-col gap-1.5 max-w-[calc(100%-1rem)]">
        <div className="flex flex-wrap rounded-lg overflow-hidden border border-slate-600/60 bg-black/60 backdrop-blur-sm shadow-xl" role="radiogroup" aria-label="3D view mode">
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
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                viewMode === m.value ? 'bg-cardiac-accent text-slate-950' : 'text-slate-200 hover:bg-white/10'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          <Pill active={labelsVisible} onClick={toggleLabels} title="Toggle labels (L)">Labels</Pill>
          {viewMode === 'sectioned' && <Pill active={showFlow} onClick={toggleFlow} title="Animated blood flow (F)">Blood flow</Pill>}
          <Pill active={showVector} onClick={toggleVector} title="Show the instantaneous cardiac electrical vector (V)">Cardiac vector</Pill>
          <Pill active={autoRotate} onClick={toggleAutoRotate} title="Slowly rotate the heart">Auto-rotate</Pill>
          {selectedLead && <Pill active onClick={() => selectLead(selectedLead)} title="Hide the lead axis">Lead {selectedLead} axis ✕</Pill>}
        </div>
        {viewMode === 'conduction' && (
          <div className="text-[11px] text-slate-300 bg-black/55 rounded-md px-2 py-1 max-w-xs leading-snug">
            <span className="text-amber-300">●</span> atrial · <span className="text-orange-400">●</span> AV node / His · <span className="text-red-400">●</span> bundles · <span className="text-rose-300">●</span> Purkinje. Red ✕ = block. Slow to 0.25× to follow each beat.
          </div>
        )}
      </div>

      {/* Cardiac cycle HUD */}
      <div
        className={`absolute right-2 z-10 scene-panel rounded-lg p-2 text-[11px] shadow-xl ${narrow ? 'bottom-9 w-44' : 'top-2 w-56'}`}
        title={PHASE_DESCRIPTIONS[hud.phase]}
      >
        {!narrow && <div className="text-[11px] uppercase tracking-wider text-slate-400">Cardiac cycle</div>}
        <div className={`text-xs font-semibold leading-tight mt-0.5 ${hud.phase === 'fibrillation' || hud.phase === 'arrest' ? 'text-red-400' : 'text-white'}`}>{PHASE_LABELS[hud.phase]}</div>
        {!narrow && <p className="text-[11px] text-slate-400 leading-snug mt-1 line-clamp-3">{PHASE_DESCRIPTIONS[hud.phase]}</p>}
        <div className="mt-1.5 space-y-0.5">
          {valve('Mitral / tricuspid', hud.mitral)}
          {valve('Aortic / pulmonic', hud.aortic)}
        </div>
        <div className={`gap-1.5 mt-1.5 ${narrow ? 'hidden' : 'flex'}`}>
          <span className={`px-1.5 rounded ${hud.s1 ? 'bg-sky-500 text-white' : 'bg-slate-800 text-slate-500'}`}>S1 “lub”</span>
          <span className={`px-1.5 rounded ${hud.s2 ? 'bg-sky-500 text-white' : 'bg-slate-800 text-slate-500'}`}>S2 “dub”</span>
          <span className={`px-1.5 rounded ${hud.atria > 0.3 ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-500'}`}>atrial kick</span>
        </div>
      </div>

      {/* Territory legend */}
      {viewMode === 'activation' && <ActivationLegend narrow={narrow} />}

      {(viewMode === 'territories' || (culprit && viewMode !== 'activation')) && (
        <div className="absolute bottom-9 left-2 z-10 scene-panel rounded-lg p-2 text-[11px] text-slate-200 shadow-xl flex items-end gap-2">
          <div>
            {viewMode === 'territories' && (
              <>
                <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">Perfusion territory</div>
                <div className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-[#26d973]" /> LAD — anterior wall, anterior septum, apex</div>
                <div className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-[#4d8cff]" /> LCx — lateral &amp; posterolateral LV</div>
                <div className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-[#ff8c1f]" /> RCA — inferior LV, RV free wall</div>
                <div className="mt-1 text-[11px] text-slate-500">Right-dominant pattern; real anatomy varies</div>
              </>
            )}
            {culprit && (
              <div className="flex items-center gap-1.5 mt-1 text-fuchsia-300">
                <span className="w-3 h-2 rounded-sm bg-fuchsia-700 animate-pulse" /> Ischaemic territory (pulsing): {culprit} culprit lesion
              </div>
            )}
          </div>
          {viewMode === 'territories' && !narrow && <Bullseye culprit={culprit} size={118} />}
        </div>
      )}

      {/* Camera navigation */}
      {narrow && (
        <button
          onClick={() => setShowViews((v) => !v)}
          className="absolute top-2 right-2 z-10 px-2.5 py-1.5 rounded-lg border border-slate-600/60 bg-black/60 text-[11px] text-slate-200 backdrop-blur-sm"
          aria-expanded={showViews}
        >
          Views ▾
        </button>
      )}
      <div className={`absolute right-2 z-10 flex-col items-end gap-1.5 ${narrow ? (showViews ? 'flex top-11' : 'hidden') : 'flex bottom-9'}`}>
        {showAngio && (
          <div className="scene-panel rounded-lg p-1.5 shadow-xl">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 px-1">Angiographic projections</div>
            <div className="px-1 mb-1 text-[11px] text-slate-400" title="C-arm angulation equivalent to the current 3D view (detector position)">
              This view: <b className="font-mono text-sky-300">{formatCarm(carm.primary, carm.secondary)}</b>
            </div>
            <div className="grid grid-cols-2 gap-0.5">
              {CAMERA_PRESETS.filter((p) => p.group === 'angio').map((p) => (
                <button key={p.label} onClick={() => setCameraPreset(p)} title={p.description} className="px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10 rounded text-left whitespace-nowrap">
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="scene-panel rounded-lg overflow-hidden">
          <div className="grid grid-cols-3 gap-0.5 p-1">
            {CAMERA_PRESETS.filter((p) => p.group === 'anatomic').map((p) => (
              <button key={p.label} onClick={() => setCameraPreset(p)} title={`${p.label}: ${p.description}`} className="px-2 py-1 text-[11px] font-medium text-slate-200 hover:bg-white/10 rounded">
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
              className={`ml-auto px-2 py-1 text-[11px] rounded ${showAngio ? 'bg-cardiac-accent/25 text-cardiac-accent' : 'text-slate-300 hover:bg-white/10'}`}
              title="Cath-lab projections (RAO / LAO / cranial / caudal)"
            >
              Angio
            </button>
          </div>
        </div>
      </div>

      <div className="absolute bottom-1.5 left-2 right-2 z-0 pointer-events-none flex justify-between text-[11px] text-slate-500">
        <span className={narrow ? 'hidden' : ''}>Drag to rotate · scroll to zoom · right-drag to pan · click a structure</span>
        <span className="hidden md:inline">Educational simulation — not for clinical use</span>
      </div>
    </>
  );
}

function Pill({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`px-2 py-0.5 rounded-full text-[11px] border backdrop-blur-sm transition-colors ${
        active ? 'bg-sky-500/25 border-sky-400/50 text-sky-100' : 'bg-black/50 border-slate-600/60 text-slate-300 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function IconBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} aria-label={title} className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded">
      {children}
    </button>
  );
}

const LAT_GRADIENT = 'linear-gradient(90deg, hsl(0 90% 55%), hsl(60 90% 55%), hsl(120 80% 45%), hsl(180 80% 50%), hsl(240 80% 60%), hsl(281 80% 60%))';

function ActivationLegend({ narrow }: { narrow: boolean }) {
  const a = useSceneStore((s) => s.activation);
  const vp = a.vent ? VENT_PATTERNS[a.vent] : null;
  const ap = a.atria ? ATRIAL_PATTERNS[a.atria] : null;
  return (
    <div className={`absolute bottom-9 left-2 z-10 scene-panel rounded-lg p-2 text-[11px] text-slate-200 shadow-xl ${narrow ? 'w-52' : 'w-72'}`}>
      <div className="text-[11px] uppercase tracking-wider text-slate-400">Activation map · local activation time</div>
      <div className="mt-1 h-2 rounded-sm" style={{ background: LAT_GRADIENT }} />
      <div className="flex justify-between text-[11px] text-slate-400 mt-0.5">
        <span>earliest</span>
        <span>{vp ? `ventricles ${a.vFirstMs}–${a.qrsMs} ms` : ''}{vp && ap ? ' · ' : ''}{ap ? `atria ${a.aFirstMs}–${a.pMs} ms` : ''}</span>
        <span>latest</span>
      </div>
      {vp ? (
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
        <div className="mt-1.5 text-amber-200">No organised ventricular activation sequence (fibrillation / polymorphic VT) — nothing to map.</div>
      )}
      {!ap && (
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
