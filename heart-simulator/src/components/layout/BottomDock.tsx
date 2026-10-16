'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTimelineStore } from '@/store/useTimelineStore';
import { useECGStore, ECGLayout } from '@/store/useECGStore';
import { resolveProfile } from '@/lib/ecg/profiles';
import { PHASE_LABELS } from '@/lib/ecg/engine';
import { sim } from '@/lib/sim/simulation';
import { describePlacement } from '@/lib/ecg/electrodes';
import { useDefibStore } from '@/lib/sim/defib';
import { openProjector } from '@/lib/sim/projector';

const ECGRenderer = dynamic(() => import('@/components/ecg/ECGRenderer'), { ssr: false });
const ElectrodeLab = dynamic(() => import('@/components/ecg/ElectrodeLab'), { ssr: false });
const MonitorDisplay = dynamic(() => import('@/components/monitor/MonitorDisplay'), { ssr: false });
const DefibPanel = dynamic(() => import('@/components/monitor/DefibPanel'), { ssr: false });
const WiggersPanel = dynamic(() => import('@/components/physiology/WiggersPanel'), { ssr: false });

const LAYOUTS: { value: ECGLayout; label: string; title: string }[] = [
  { value: 'standard', label: '12-lead', title: 'Standard 12-lead printout: sequential 2.5 s columns + lead II rhythm strip' },
  { value: 'simultaneous', label: 'Simultaneous', title: 'All 12 leads show the same moment (compare leads beat-for-beat)' },
  { value: 'monitor', label: 'Monitor', title: 'Bedside monitor: II, V1, V5' },
];

export default function BottomDock({ style }: { style?: React.CSSProperties }) {
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
  const profile = resolveProfile(ecg.activeProfileId);
  const [showInterp, setShowInterp] = useState(() => typeof window === 'undefined' || window.innerWidth >= 900);
  const [narrowDock, setNarrowDock] = useState(() => typeof window !== 'undefined' && window.innerWidth < 760);
  useEffect(() => {
    const onResize = () => setNarrowDock(window.innerWidth < 760);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [intervals, setIntervals] = useState(() => sim.engine.intervals(sim.time));

  useEffect(() => {
    const id = window.setInterval(() => setIntervals(sim.engine.intervals(sim.time)), 500);
    return () => window.clearInterval(id);
  }, []);

  const rateLabel = profile.rateControl === 'sinus' ? 'Sinus rate' : profile.rateControl === 'ventricular'
    ? (profile.rhythm === 'chb' ? 'Escape rate' : 'Ventricular rate') : 'Rate';
  const noRate = profile.rateControl === 'none';
  const arrest = profile.hemo === 'no-output';

  return (
    <section style={style} className="bg-cardiac-panel border-t border-slate-700 flex flex-col shrink-0 min-h-0" aria-label="ECG and hemodynamics">
      {/* ── Control bar ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-slate-700/60 shrink-0 overflow-x-auto no-scrollbar">
        <button
          onClick={togglePlay}
          className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full bg-cardiac-surface hover:bg-cardiac-accent hover:text-slate-900 text-white transition-colors"
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
        <div className="flex items-baseline gap-1 shrink-0 min-w-[78px]" title="Monitor heart rate (calculated from the last RR intervals)">
          <span className={`font-mono text-xl font-bold leading-none ${arrest ? 'text-red-500 animate-pulse' : 'text-emerald-400'}`}>
            {displayHR > 0 ? displayHR : '---'}
          </span>
          <span className="text-[10px] text-slate-400">bpm</span>
        </div>
        {atrialRate && profile.rhythm !== 'sinus' && profile.rhythm !== 'paced' && atrialRate !== displayHR && (
          <div className="text-[10px] text-sky-300 shrink-0" title="Atrial rate">A {atrialRate}</div>
        )}

        <label className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] text-slate-400">{rateLabel}</span>
          <input
            type="range"
            min={profile.minHR}
            max={profile.maxHR}
            value={noRate ? 0 : Math.min(profile.maxHR, Math.max(profile.minHR, heartRate))}
            disabled={noRate}
            onChange={(e) => setHeartRate(Number(e.target.value))}
            className="w-24 accent-cardiac-red disabled:opacity-30"
            aria-label={rateLabel}
          />
          <span className="text-xs font-mono text-slate-200 w-7">{noRate ? '—' : heartRate}</span>
        </label>

        <label className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] text-slate-400">Speed</span>
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="bg-cardiac-surface text-xs text-slate-200 rounded px-1 py-0.5 border border-slate-600"
            aria-label="Simulation speed"
          >
            <option value={0.1}>0.1×</option>
            <option value={0.25}>0.25×</option>
            <option value={0.5}>0.5×</option>
            <option value={1}>1× real time</option>
          </select>
        </label>

        {/* Phase */}
        <div className="flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded-full bg-cardiac-dark border border-slate-700" title="Current mechanical phase of the cardiac cycle">
          <span className={`w-2 h-2 rounded-full ${currentPhase.includes('ejection') || currentPhase.includes('contraction') ? 'bg-red-500' : currentPhase === 'fibrillation' || currentPhase === 'arrest' ? 'bg-red-600 animate-pulse' : 'bg-sky-400'}`} />
          <span className="text-[11px] text-slate-200 whitespace-nowrap">{PHASE_LABELS[currentPhase]}</span>
        </div>

        {/* Intervals */}
        <div className="hidden xl:flex items-center gap-2 text-[10px] font-mono text-slate-400 shrink-0" title="Intervals for the current rhythm">
          <span>PR <b className="text-slate-200">{intervals.pr ? `${Math.round(intervals.pr)}` : '—'}</b></span>
          <span>QRS <b className={`${(intervals.qrs ?? 0) >= 120 ? 'text-amber-300' : 'text-slate-200'}`}>{intervals.qrs ?? '—'}</b></span>
          <span>QT <b className="text-slate-200">{intervals.qt ?? '—'}</b></span>
          <span>QTc <b className={`${(intervals.qtc ?? 0) > 470 ? 'text-amber-300' : 'text-slate-200'}`}>{intervals.qtc ?? '—'}</b></span>
        </div>

        <div className="ml-auto flex items-center gap-1 shrink-0">
          <Seg
            options={[{ v: 'ecg', l: 'ECG' }, { v: 'wiggers', l: 'Wiggers / PV' }, { v: 'defib', l: 'Monitor / Defib', t: 'Monitor-defibrillator trainer: defibrillation, cardioversion, pacing, CPR, drugs (M)' }]}
            value={ecg.bottomView}
            onChange={(v) => ecg.setBottomView(v as 'ecg' | 'wiggers' | 'defib')}
          />
        </div>
      </div>

      {/* ── ECG options bar ─────────────────────────────────────── */}
      {ecg.bottomView === 'ecg' && (
        <div className="flex items-center gap-2 px-3 py-1 border-b border-slate-700/40 shrink-0 overflow-x-auto no-scrollbar text-[10px]">
          <Seg
            options={LAYOUTS.map((l) => ({ v: l.value, l: l.label, t: l.title }))}
            value={ecg.inspectLead ? '' : ecg.layout}
            onChange={(v) => { ecg.setInspectLead(null); ecg.setLayout(v as ECGLayout); }}
          />
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
          <Toggle active={ecg.showKeyLeads} onClick={ecg.toggleKeyLeads} title="Tint the leads that show this condition's key findings">Key leads</Toggle>
          <Toggle
            active={!!ecg.inspectLead}
            onClick={() => ecg.setInspectLead(ecg.inspectLead ? null : ecg.selectedLead ?? 'II')}
            title="Show one lead large with labelled waves and intervals (double-click any lead)"
          >
            {ecg.inspectLead ? `Inspecting ${ecg.inspectLead} ✕` : `Inspect ${ecg.selectedLead ?? 'II'}`}
          </Toggle>
          <Toggle active={ecg.caliperMode} onClick={ecg.toggleCalipers} title="Click two points on a lead to measure time, rate and voltage">Calipers</Toggle>
          <Toggle active={ecg.electrodeLab} onClick={() => ecg.setElectrodeLab(!ecg.electrodeLab)} title="Electrode placement, lead derivation and cable-reversal practice">Electrodes</Toggle>
          {!ecg.placementHidden && describePlacement(ecg.placement) && (
            <button
              onClick={() => ecg.setElectrodeLab(true)}
              className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 whitespace-nowrap"
              title="ECG cables are deliberately misplaced — open the electrode lab"
            >
              ⚠ {describePlacement(ecg.placement)}
            </button>
          )}
          <span className="text-slate-500 whitespace-nowrap hidden lg:inline">Click a lead to show its axis on the heart · double-click to inspect · drag to scrub</span>
          <button
            onClick={() => setShowInterp((v) => !v)}
            className="ml-auto px-2 py-0.5 rounded text-slate-300 hover:text-white bg-cardiac-surface/60 whitespace-nowrap"
          >
            {showInterp ? 'Hide' : 'Show'} interpretation
          </button>
        </div>
      )}

      {/* ── Main area ──────────────────────────────────────────── */}
      <div className={`flex-1 min-h-0 flex ${ecg.bottomView === 'defib' && narrowDock ? 'flex-col' : ''}`}>
        <div className={`min-w-0 relative ${ecg.bottomView === 'defib' && narrowDock ? 'h-[46%] shrink-0' : 'flex-1'}`}>
          {ecg.bottomView === 'ecg' ? <ECGRenderer /> : ecg.bottomView === 'wiggers' ? <WiggersPanel /> : (
            <div className="absolute inset-0 p-1.5"><MonitorDisplay /></div>
          )}
        </div>
        {ecg.bottomView === 'defib' && (
          <aside className={narrowDock ? 'flex-1 min-h-0 border-t border-slate-700 bg-cardiac-dark/40' : 'w-72 shrink-0 border-l border-slate-700 bg-cardiac-dark/40'}>
            <DefibPanel onProjector={narrowDock ? undefined : openProjector} />
          </aside>
        )}
        {ecg.bottomView === 'ecg' && ecg.electrodeLab && (
          <aside className="w-64 shrink-0 border-l border-slate-700 overflow-y-auto p-2.5 bg-cardiac-dark/40">
            <ElectrodeLab />
          </aside>
        )}
        {ecg.bottomView === 'ecg' && showInterp && !ecg.electrodeLab && (
          <aside className="w-64 shrink-0 border-l border-slate-700 overflow-y-auto p-2.5 text-[11px] bg-cardiac-dark/40">
            <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Rhythm / pattern</div>
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
                    onClick={() => ecg.setInspectLead(l as never)}
                    className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
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
          </aside>
        )}
      </div>
    </section>
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
          className={`px-2 py-0.5 text-[10px] whitespace-nowrap transition-colors ${
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
      className={`px-2 py-0.5 rounded border text-[10px] whitespace-nowrap transition-colors shrink-0 ${
        active ? 'bg-cardiac-accent/20 text-cardiac-accent border-cardiac-accent/40' : 'text-slate-300 border-slate-600 hover:text-white hover:bg-cardiac-surface'
      }`}
    >
      {children}
    </button>
  );
}
