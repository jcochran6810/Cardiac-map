'use client';

import React, { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTimelineStore } from '@/store/useTimelineStore';
import { useECGStore, ECGLayout } from '@/store/useECGStore';
import { resolveProfile } from '@/lib/ecg/profiles';
import { PHASE_LABELS } from '@/lib/ecg/engine';
import { sim } from '@/lib/sim/simulation';
import { describePlacement } from '@/lib/ecg/electrodes';
import { useDefibStore } from '@/lib/sim/defib';
import { useAppStore } from '@/store/useAppStore';
import { openProjector } from '@/lib/sim/projector';
import { useIsTouch } from '@/lib/device';
import { IconClose, IconCollapse, IconExpand } from '@/components/ui/icons';

const ECGRenderer = dynamic(() => import('@/components/ecg/ECGRenderer'), { ssr: false });
const ElectrodeLab = dynamic(() => import('@/components/ecg/ElectrodeLab'), { ssr: false });
const MonitorDisplay = dynamic(() => import('@/components/monitor/MonitorDisplay'), { ssr: false });
const DefibPanel = dynamic(() => import('@/components/monitor/DefibPanel'), { ssr: false });
const WiggersPanel = dynamic(() => import('@/components/physiology/WiggersPanel'), { ssr: false });

const LAYOUTS: { value: ECGLayout; label: string; title: string }[] = [
  { value: 'simultaneous', label: '12-lead', title: 'Live 12-lead, like a monitor: every lead redraws at once (one sweep line per column) + lead II rhythm strip' },
  { value: 'standard', label: 'Printout', title: 'Paper 12-lead printout: sequential 2.5 s columns (one sweep line walks across them) + lead II rhythm strip' },
  { value: 'monitor', label: 'Monitor', title: 'Bedside monitor: II, V1, V5' },
];

const VIEWS: { v: 'ecg' | 'wiggers' | 'defib'; l: string; short: string; t?: string }[] = [
  { v: 'ecg', l: 'ECG', short: 'ECG' },
  { v: 'wiggers', l: 'Wiggers / PV', short: 'Wiggers / PV' },
  { v: 'defib', l: 'Monitor / Defib', short: 'Monitor / Defib', t: 'Monitor-defibrillator trainer: defibrillation, cardioversion, pacing, CPR, drugs (M)' },
];

interface DockProps {
  style?: React.CSSProperties;
  /** docked beside the heart (phone on its side) rather than under it */
  side?: boolean;
  expanded?: boolean;
  /** tablets and phones: let the dock take over most of the screen */
  onToggleExpand?: () => void;
}

export default function BottomDock({ style, side = false, expanded = false, onToggleExpand }: DockProps) {
  const playing = useTimelineStore((s) => s.playing);
  const togglePlay = useTimelineStore((s) => s.togglePlay);
  const heartRate = useTimelineStore((s) => s.heartRate);
  const setHeartRate = useTimelineStore((s) => s.setHeartRate);
  const speed = useTimelineStore((s) => s.speed);
  const setSpeed = useTimelineStore((s) => s.setSpeed);
  const currentPhase = useTimelineStore((s) => s.currentPhase);
  const displayHR = useTimelineStore((s) => s.displayHR);
  const atrialRate = useTimelineStore((s) => s.atrialRate);

  const ecg = useECGStore();
  const trainee = useDefibStore((s) => s.trainee);
  const role = useAppStore((s) => s.learningLevel);
  const profile = resolveProfile(ecg.activeProfileId);
  const touch = useIsTouch();
  const ref = useRef<HTMLElement>(null);
  // Lay the dock out by its own width: it can be full-width under the heart or a column beside it
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth));
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const narrow = width < 640; // phone: tab row, folded options, overlays instead of side columns
  const fold = width < 1000; // tablet portrait and smaller: tuck the rarer ECG options under "More"
  const stackDefib = width < 760;
  const [showInterp, setShowInterp] = useState(() => typeof window === 'undefined' || window.innerWidth >= 900);
  const [optsOpen, setOptsOpen] = useState(false);

  // Phones: the monitor-defibrillator needs room, so give it most of the screen while it is open
  const autoExpanded = useRef(false);
  const toggleRef = useRef(onToggleExpand);
  toggleRef.current = onToggleExpand;
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  useEffect(() => {
    const toggle = toggleRef.current;
    if (!toggle || side || !narrow) return;
    if (ecg.bottomView === 'defib' && !expandedRef.current) {
      toggle();
      autoExpanded.current = true;
    } else if (ecg.bottomView !== 'defib' && autoExpanded.current && expandedRef.current) {
      toggle();
      autoExpanded.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ecg.bottomView]);
  const [intervals, setIntervals] = useState(() => sim.engine.intervals(sim.time));

  useEffect(() => {
    const id = window.setInterval(() => setIntervals(sim.engine.intervals(sim.time)), 500);
    return () => window.clearInterval(id);
  }, []);

  const rateLabel = profile.rateControl === 'sinus' ? 'Sinus rate' : profile.rateControl === 'ventricular'
    ? (profile.rhythm === 'chb' ? 'Escape rate' : 'Ventricular rate') : 'Rate';
  const noRate = profile.rateControl === 'none';
  const arrest = profile.hemo === 'no-output';

  const expandBtn = onToggleExpand && (
    <button
      onClick={() => { autoExpanded.current = false; onToggleExpand(); }}
      className="w-8 h-8 shrink-0 flex items-center justify-center rounded-md text-slate-300 hover:text-white hover:bg-cardiac-surface border border-slate-600"
      title={expanded ? 'Shrink this panel' : 'Enlarge this panel'}
      aria-label={expanded ? 'Shrink ECG panel' : 'Enlarge ECG panel'}
      aria-pressed={expanded}
    >
      {expanded ? <IconCollapse size={14} /> : <IconExpand size={14} />}
    </button>
  );

  const displayOpts = (
    <>
      <Seg
        options={[{ v: '5', l: '5' }, { v: '10', l: '10' }, { v: '20', l: '20 mm/mV' }]}
        value={String(ecg.gain)}
        onChange={(v) => ecg.setGain(Number(v) as 5 | 10 | 20)}
      />
      <Seg
        options={[{ v: '25', l: '25' }, { v: '50', l: '50 mm/s' }]}
        value={String(ecg.sweepSpeed)}
        onChange={(v) => ecg.setSweepSpeed(Number(v) as 25 | 50)}
      />
      <Seg
        options={[{ v: 'monitor', l: 'Monitor' }, { v: 'paper', l: 'Paper' }]}
        value={ecg.theme}
        onChange={(v) => ecg.setTheme(v as 'monitor' | 'paper')}
      />
    </>
  );
  const toolOpts = (
    <>
      <Toggle active={ecg.showKeyLeads} onClick={ecg.toggleKeyLeads} title="Tint the leads that show this condition's key findings">Key leads</Toggle>
      <Toggle
        active={!!ecg.inspectLead}
        onClick={() => ecg.setInspectLead(ecg.inspectLead ? null : ecg.selectedLead ?? 'II')}
        title={touch ? 'Show one lead large with labelled waves and intervals (double-tap any lead)' : 'Show one lead large with labelled waves and intervals (double-click any lead)'}
      >
        {ecg.inspectLead ? `Inspecting ${ecg.inspectLead} ✕` : `Inspect ${ecg.selectedLead ?? 'II'}`}
      </Toggle>
      <Toggle active={ecg.caliperMode} onClick={ecg.toggleCalipers} title={touch ? 'Tap two points on a lead to measure time, rate and voltage' : 'Click two points on a lead to measure time, rate and voltage'}>Calipers</Toggle>
      <Toggle active={ecg.electrodeLab} onClick={() => ecg.setElectrodeLab(!ecg.electrodeLab)} title="Electrode placement, lead derivation and cable-reversal practice">Electrodes</Toggle>
    </>
  );
  const placementWarning = !ecg.placementHidden && describePlacement(ecg.placement) && (
    <button
      onClick={() => ecg.setElectrodeLab(true)}
      className="px-1.5 py-0.5 touch:py-1.5 rounded bg-amber-500/20 text-amber-200 whitespace-nowrap shrink-0"
      title="ECG cables are deliberately misplaced — open the electrode lab"
    >
      ⚠ {describePlacement(ecg.placement)}
    </button>
  );

  const interpretation = (
    <>
      <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Rhythm / pattern</div>
      {role === 1 && !trainee && (
        <p className="mb-1.5 text-[10px] leading-snug rounded bg-amber-500/10 border border-amber-500/30 text-amber-200/90 p-1.5">
          EMT scope: acquire and transmit the 12-lead per protocol — interpretation is a paramedic / physician skill. Shown here for awareness only.
        </p>
      )}
      {trainee ? (
        <p className="text-slate-400 leading-snug">Hidden in trainee mode — interpret the rhythm yourself. Turn trainee mode off in Monitor / Defib to reveal it.</p>
      ) : (
      <>
      <h4 className="text-xs font-semibold text-white leading-snug">{profile.headline}</h4>
      <ul className="mt-2 space-y-1">
        {profile.findings.map((f) => (
          <li key={f} className="flex gap-1.5 text-slate-300 leading-snug">
            <span className="text-cardiac-accent shrink-0">•</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      {profile.keyLeads && profile.keyLeads.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {profile.keyLeads.map((l) => (
            <button
              key={l}
              onClick={() => { ecg.setInspectLead(l as never); if (narrow) setShowInterp(false); }}
              className="px-1.5 py-0.5 touch:px-2.5 touch:py-1.5 rounded bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
              title={`Inspect lead ${l}`}
            >
              {l}
            </button>
          ))}
        </div>
      )}
      </>
      )}
      <p className="mt-3 text-[10px] text-slate-500 leading-snug">
        Synthesised from a cardiac dipole model for teaching. Real tracings vary; never use for clinical decisions.
      </p>
    </>
  );

  return (
    <section
      ref={ref}
      style={style}
      className={`bg-cardiac-panel border-slate-700 flex flex-col shrink-0 min-h-0 min-w-0 ${side ? 'border-l' : 'border-t'}`}
      aria-label="ECG and hemodynamics"
    >
      {/* ── Phones: view tabs get their own row so they are never scrolled out of sight ── */}
      {narrow && (
        <div className="flex items-center gap-1.5 px-2 pt-1.5 shrink-0">
          <div className="flex-1 grid grid-cols-3 rounded-md overflow-hidden border border-slate-600" role="tablist" aria-label="Lower panel view">
            {VIEWS.map((o) => (
              <button
                key={o.v}
                onClick={() => ecg.setBottomView(o.v)}
                title={o.t}
                role="tab"
                aria-selected={ecg.bottomView === o.v}
                className={`h-8 px-1 text-[11px] font-medium whitespace-nowrap truncate transition-colors ${
                  ecg.bottomView === o.v ? 'bg-cardiac-accent/25 text-cardiac-accent' : 'text-slate-300 hover:text-white hover:bg-cardiac-surface'
                }`}
              >
                {o.short}
              </button>
            ))}
          </div>
          {expandBtn}
        </div>
      )}

      {/* ── Control bar ─────────────────────────────────────────── */}
      <div className={`flex items-center px-3 py-1.5 border-b border-slate-700/60 shrink-0 overflow-x-auto no-scrollbar ${narrow ? 'gap-2 px-2' : 'gap-3'}`}>
        <button
          onClick={togglePlay}
          className="w-8 h-8 touch:w-9 touch:h-9 shrink-0 flex items-center justify-center rounded-full bg-cardiac-surface hover:bg-cardiac-accent hover:text-slate-900 text-white transition-colors"
          title={playing ? 'Pause (Space)' : 'Play (Space)'}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="1" width="3" height="10" rx="1" /><rect x="7" y="1" width="3" height="10" rx="1" /></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M3 1.5v9l7.5-4.5z" /></svg>
          )}
        </button>

        {/* Monitor readout */}
        <div className={`flex items-baseline gap-1 shrink-0 ${narrow ? 'min-w-[64px]' : 'min-w-[78px]'}`} title="Monitor heart rate (calculated from the last RR intervals)">
          <span className={`font-mono text-xl font-bold leading-none ${arrest ? 'text-red-500 animate-pulse' : 'text-emerald-400'}`}>
            {displayHR > 0 ? displayHR : '---'}
          </span>
          <span className="text-[10px] text-slate-400">bpm</span>
        </div>
        {atrialRate && profile.rhythm !== 'sinus' && profile.rhythm !== 'paced' && atrialRate !== displayHR && (
          <div className="text-[10px] text-sky-300 shrink-0" title="Atrial rate">A {atrialRate}</div>
        )}

        <label className={`flex items-center gap-1.5 ${narrow ? 'flex-1 min-w-[96px]' : 'shrink-0'}`} title={rateLabel}>
          <span className={`text-[10px] text-slate-400 ${narrow ? 'sr-only' : ''}`}>{rateLabel}</span>
          <input
            type="range"
            min={profile.minHR}
            max={profile.maxHR}
            value={noRate ? 0 : Math.min(profile.maxHR, Math.max(profile.minHR, heartRate))}
            disabled={noRate}
            onChange={(e) => setHeartRate(Number(e.target.value))}
            className={`accent-cardiac-red disabled:opacity-30 touch:h-6 ${narrow ? 'flex-1 min-w-0' : 'w-24'}`}
            aria-label={rateLabel}
          />
          <span className="text-xs font-mono text-slate-200 w-7 shrink-0">{noRate ? '—' : heartRate}</span>
        </label>

        <label className="flex items-center gap-1 shrink-0">
          <span className={`text-[10px] text-slate-400 ${narrow ? 'sr-only' : ''}`}>Speed</span>
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="bg-cardiac-surface text-xs text-slate-200 rounded px-1 py-0.5 touch:py-1 border border-slate-600"
            aria-label="Simulation speed"
          >
            <option value={0.1}>0.1×</option>
            <option value={0.25}>0.25×</option>
            <option value={0.5}>0.5×</option>
            <option value={1}>{fold ? '1×' : '1× real time'}</option>
          </select>
        </label>

        {/* Phase (smaller screens show it on the heart instead) */}
        {!fold && (
        <div className="flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded-full bg-cardiac-dark border border-slate-700" title="Current mechanical phase of the cardiac cycle">
          <span className={`w-2 h-2 rounded-full ${currentPhase.includes('ejection') || currentPhase.includes('contraction') ? 'bg-red-500' : currentPhase === 'fibrillation' || currentPhase === 'arrest' ? 'bg-red-600 animate-pulse' : 'bg-sky-400'}`} />
          <span className="text-[11px] text-slate-200 whitespace-nowrap">{PHASE_LABELS[currentPhase]}</span>
        </div>
        )}

        {/* Intervals */}
        <div className="hidden xl:flex items-center gap-2 text-[10px] font-mono text-slate-400 shrink-0" title="Intervals for the current rhythm">
          <span>PR <b className="text-slate-200">{intervals.pr ? `${Math.round(intervals.pr)}` : '—'}</b></span>
          <span>QRS <b className={`${(intervals.qrs ?? 0) >= 120 ? 'text-amber-300' : 'text-slate-200'}`}>{intervals.qrs ?? '—'}</b></span>
          <span>QT <b className="text-slate-200">{intervals.qt ?? '—'}</b></span>
          <span>QTc <b className={`${(intervals.qtc ?? 0) > 470 ? 'text-amber-300' : 'text-slate-200'}`}>{intervals.qtc ?? '—'}</b></span>
        </div>

        {!narrow && (
          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            <Seg
              options={VIEWS.map((o) => ({ v: o.v, l: o.l, t: o.t }))}
              value={ecg.bottomView}
              onChange={(v) => ecg.setBottomView(v as 'ecg' | 'wiggers' | 'defib')}
            />
            {expandBtn}
          </div>
        )}
      </div>

      {/* ── ECG options bar ─────────────────────────────────────── */}
      {ecg.bottomView === 'ecg' && (fold ? (
        <>
          <div className="flex items-center gap-1.5 px-2 py-1 border-b border-slate-700/40 shrink-0 text-[10px]">
            <Seg
              options={LAYOUTS.map((l) => ({ v: l.value, l: l.label, t: l.title }))}
              value={ecg.inspectLead ? '' : ecg.layout}
              onChange={(v) => { ecg.setInspectLead(null); ecg.setLayout(v as ECGLayout); }}
            />
            <div className="ml-auto flex items-center gap-1 shrink-0">
              <Toggle active={showInterp} onClick={() => setShowInterp((v) => !v)} title="What this rhythm shows">Interpret</Toggle>
              <Toggle active={optsOpen} onClick={() => setOptsOpen((v) => !v)} title="Gain, paper speed, calipers, electrodes">
                More {optsOpen ? '▴' : '▾'}
              </Toggle>
            </div>
          </div>
          {optsOpen && (
            <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 border-b border-slate-700/40 shrink-0 text-[10px] bg-cardiac-dark/40">
              {displayOpts}
              {toolOpts}
            </div>
          )}
          {placementWarning && <div className="px-2 py-1 border-b border-slate-700/40 shrink-0 text-[10px]">{placementWarning}</div>}
        </>
      ) : (
        <div className="flex items-center gap-2 px-3 py-1 border-b border-slate-700/40 shrink-0 overflow-x-auto no-scrollbar text-[10px]">
          <Seg
            options={LAYOUTS.map((l) => ({ v: l.value, l: l.label, t: l.title }))}
            value={ecg.inspectLead ? '' : ecg.layout}
            onChange={(v) => { ecg.setInspectLead(null); ecg.setLayout(v as ECGLayout); }}
          />
          {displayOpts}
          {toolOpts}
          {placementWarning}
          <span className="text-slate-500 whitespace-nowrap hidden xl:inline">
            {touch ? 'Tap a lead to show its axis on the heart · double-tap to inspect · drag to scrub' : 'Click a lead to show its axis on the heart · double-click to inspect · drag to scrub'}
          </span>
          <button
            onClick={() => setShowInterp((v) => !v)}
            className="ml-auto px-2 py-0.5 touch:py-1.5 rounded text-slate-300 hover:text-white bg-cardiac-surface/60 whitespace-nowrap shrink-0"
          >
            {showInterp ? 'Hide' : 'Show'} interpretation
          </button>
        </div>
      ))}

      {/* ── Main area ──────────────────────────────────────────── */}
      <div className={`flex-1 min-h-0 flex relative ${ecg.bottomView === 'defib' && stackDefib ? 'flex-col' : ''}`}>
        <div className={`min-w-0 relative ${ecg.bottomView === 'defib' && stackDefib ? 'h-[46%] shrink-0' : 'flex-1'}`}>
          {ecg.bottomView === 'ecg' ? <ECGRenderer /> : ecg.bottomView === 'wiggers' ? <WiggersPanel /> : (
            <div className="absolute inset-0 p-1.5"><MonitorDisplay /></div>
          )}
        </div>
        {ecg.bottomView === 'defib' && (
          <aside className={stackDefib ? 'flex-1 min-h-0 border-t border-slate-700 bg-cardiac-dark/40' : 'w-72 shrink-0 border-l border-slate-700 bg-cardiac-dark/40'}>
            <DefibPanel onProjector={stackDefib ? undefined : openProjector} />
          </aside>
        )}
        {ecg.bottomView === 'ecg' && ecg.electrodeLab && (narrow ? (
          <Sheet title="Electrode lab" onClose={() => ecg.setElectrodeLab(false)}><ElectrodeLab titled /></Sheet>
        ) : (
          <aside className="w-[30rem] max-w-[48%] shrink-0 border-l border-slate-700 overflow-hidden p-2.5 bg-cardiac-dark/40">
            <ElectrodeLab wide />
          </aside>
        ))}
        {ecg.bottomView === 'ecg' && showInterp && !ecg.electrodeLab && (narrow ? (
          <Sheet title="Interpretation" onClose={() => setShowInterp(false)}><div className="text-[12px]">{interpretation}</div></Sheet>
        ) : (
          <aside className="w-64 shrink-0 border-l border-slate-700 overflow-y-auto p-2.5 text-[11px] bg-cardiac-dark/40">
            {interpretation}
          </aside>
        ))}
      </div>
    </section>
  );
}

/** Phones: side columns would crush the tracing, so they slide over it instead. */
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-cardiac-panel/95 backdrop-blur-sm animate-slide-in-up" role="dialog" aria-label={title}>
      <div className="flex items-center justify-between pl-3 pr-1 py-1 border-b border-slate-700 shrink-0">
        <span className="text-xs font-semibold text-white">{title}</span>
        <button onClick={onClose} className="p-2 text-slate-400 hover:text-white" aria-label={`Close ${title.toLowerCase()}`}><IconClose size={16} /></button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3">{children}</div>
    </div>
  );
}

function Seg({ options, value, onChange }: { options: { v: string; l: string; t?: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex rounded-md overflow-hidden border border-slate-600 shrink-0" role="group">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          title={o.t}
          aria-pressed={value === o.v}
          className={`px-2 py-0.5 touch:py-1.5 touch:px-2.5 text-[10px] whitespace-nowrap transition-colors ${
            value === o.v ? 'bg-cardiac-accent/25 text-cardiac-accent' : 'text-slate-300 hover:text-white hover:bg-cardiac-surface'
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function Toggle({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`px-2 py-0.5 touch:py-1.5 touch:px-2.5 rounded border text-[10px] whitespace-nowrap transition-colors shrink-0 ${
        active ? 'bg-cardiac-accent/20 text-cardiac-accent border-cardiac-accent/40' : 'text-slate-300 border-slate-600 hover:text-white hover:bg-cardiac-surface'
      }`}
    >
      {children}
    </button>
  );
}
