'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  DRUGS, ENERGIES, SCENARIOS, analyze, charge, checkPulse, dumpCharge, fmt, forceRosc, giveDrug, instructorRhythm, loadScenario,
  measureNibp, resetCode, setBaseline, setCprQuality, setEnergy, setMode, setPacer, setSound, setTrainee, setVitals, shock,
  startPacing, stopPacing, toggleCPR, toggleSync, useDefibStore, type DefibMode, type LogKind,
} from '@/lib/sim/defib';
import { ECG_PROFILES, resolveProfile, type HemoProfile } from '@/lib/ecg/profiles';
import { useECGStore } from '@/store/useECGStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { sim } from '@/lib/sim/simulation';
import { useAppStore, LEVEL_LABELS } from '@/store/useAppStore';

/** Device functions and drug authority by role (scope of practice) */
const MANUAL_OK = new Set([2, 3, 4, 5]);
const DRUG_AUTHORITY: Record<number, string | null> = {
  1: null,
  2: 'per protocol / medical direction',
  3: "on the physician's order (where state law and facility policy permit)",
  4: "on the physician's order / ACLS protocol",
  5: '',
};

const MODES: { v: DefibMode; l: string }[] = [
  { v: 'monitor', l: 'Monitor' },
  { v: 'aed', l: 'AED' },
  { v: 'manual', l: 'Manual' },
  { v: 'pacer', l: 'Pacer' },
];

const LOG_COLORS: Record<LogKind, string> = {
  shock: 'text-amber-300', drug: 'text-sky-300', rhythm: 'text-emerald-300', cpr: 'text-violet-300',
  info: 'text-slate-300', warn: 'text-rose-300', pacing: 'text-orange-300', rosc: 'text-emerald-200 font-semibold',
};

const BASELINES: { v: HemoProfile | 'default'; l: string }[] = [
  { v: 'default', l: 'Rhythm default' },
  { v: 'normal', l: 'Normal heart' },
  { v: 'hfref', l: 'Reduced EF (HFrEF)' },
  { v: 'stemi', l: 'Acute MI' },
  { v: 'shock', l: 'Cardiogenic shock' },
];

export default function DefibPanel({ onProjector }: { onProjector?: () => void }) {
  const d = useDefibStore();
  const role = useAppStore((s) => s.learningLevel);
  const manualOk = MANUAL_OK.has(role);
  const drugAuthority = DRUG_AUTHORITY[role];
  useEffect(() => {
    if (!manualOk && (useDefibStore.getState().mode === 'manual' || useDefibStore.getState().mode === 'pacer')) setMode('aed');
  }, [manualOk]);
  const profileId = useECGStore((s) => s.activeProfileId);
  const heartRate = useTimelineStore((s) => s.heartRate);
  const [instructor, setInstructor] = useState(false);
  const profiles = useMemo(() => Object.values(ECG_PROFILES), []);
  const codeT = (t: number) => fmt(t - (d.codeStart ?? d.log[0]?.t ?? 0));

  return (
    <div className="h-full overflow-y-auto p-2 space-y-2 text-[11px]">
      {/* Mode */}
      <div className="grid grid-cols-4 gap-0.5 rounded-md bg-cardiac-dark p-0.5 border border-slate-700">
        {MODES.map((m) => {
          const locked = !manualOk && (m.v === 'manual' || m.v === 'pacer');
          return (
            <button
              key={m.v}
              onClick={() => !locked && setMode(m.v)}
              disabled={locked}
              title={locked ? 'ALS skill — outside EMT scope (National EMS Scope of Practice Model)' : undefined}
              className={`py-1 rounded ${d.mode === m.v ? 'bg-cardiac-accent/25 text-cardiac-accent font-semibold' : locked ? 'text-slate-600 cursor-not-allowed' : 'text-slate-300 hover:text-white'}`}
            >
              {locked ? '🔒 ' : ''}{m.l}
            </button>
          );
        })}
      </div>
      {role === 1 && (
        <p className="text-[10px] text-amber-200/90 leading-snug rounded bg-amber-500/10 border border-amber-500/30 p-1.5">
          EMT scope: CPR and AED. Manual defibrillation, cardioversion, pacing, rhythm interpretation and ACLS drugs are paramedic (ALS) skills.
        </p>
      )}
      {(role === 3 || role === 4) && (
        <p className="text-[10px] text-slate-400 leading-snug">
          {LEVEL_LABELS[role].short}: device use per ACLS certification, facility policy and physician direction; medications {DRUG_AUTHORITY[role]}.
        </p>
      )}

      {/* Defibrillation / cardioversion */}
      {(d.mode === 'manual' || d.mode === 'aed') && (
        <section className="rounded-md border border-slate-700 p-2 space-y-1.5">
          {d.mode === 'manual' && (
            <>
              <div className="flex flex-wrap gap-0.5">
                {ENERGIES.map((j) => (
                  <button key={j} onClick={() => setEnergy(j)} className={`px-1.5 py-0.5 rounded font-mono ${d.energy === j ? 'bg-amber-500/30 text-amber-200' : 'bg-cardiac-surface/70 text-slate-300'}`}>{j}J</button>
                ))}
              </div>
              <button onClick={toggleSync} className={`w-full py-1 rounded font-semibold ${d.sync ? 'bg-white text-black' : 'bg-cardiac-surface text-slate-200'}`}>
                SYNC {d.sync ? 'ON' : 'OFF'}
              </button>
            </>
          )}
          {d.mode === 'aed' && (
            <button onClick={analyze} disabled={d.aed.phase === 'analyzing'} className="w-full py-1.5 rounded font-semibold bg-sky-600/40 text-sky-100 disabled:opacity-50">
              {d.aed.phase === 'analyzing' ? 'Analysing…' : 'ANALYZE'}
            </button>
          )}
          <div className="grid grid-cols-2 gap-1">
            {d.mode === 'manual' && (
              <button onClick={charge} disabled={d.charge !== 'idle'} className="py-1.5 rounded font-bold bg-yellow-400 text-black disabled:opacity-40">CHARGE</button>
            )}
            <button
              onClick={shock}
              disabled={d.charge !== 'charged'}
              className={`py-1.5 rounded font-bold ${d.mode === 'aed' ? 'col-span-2' : ''} ${d.charge === 'charged' ? 'bg-orange-600 text-white animate-pulse' : 'bg-orange-900/40 text-orange-200/50'}`}
            >
              ⚡ SHOCK
            </button>
          </div>
          {d.charge !== 'idle' && <button onClick={dumpCharge} className="w-full py-0.5 rounded text-slate-400 hover:text-white">Disarm</button>}
          <p className="text-[10px] text-slate-500 leading-snug">
            Biphasic defibrillation for VF / pulseless VT: device-recommended dose (typically 120–200 J; use the maximum if unknown).
            Synchronised: narrow regular 50–100 J · AF 120–200 J (many start at 200 J) · monomorphic VT 100 J. Polymorphic VT → defibrillate.
          </p>
        </section>
      )}

      {/* Pacing */}
      {d.mode === 'pacer' && (
        <section className="rounded-md border border-slate-700 p-2 space-y-1.5">
          <button onClick={d.pacer.on ? stopPacing : startPacing} className={`w-full py-1.5 rounded font-bold ${d.pacer.on ? 'bg-orange-600 text-white' : 'bg-orange-900/50 text-orange-100'}`}>
            {d.pacer.on ? 'STOP PACER' : 'START PACER'}
          </button>
          <Stepper label="Rate" unit="ppm" value={d.pacer.rate} step={5} min={30} max={180} onChange={(v) => setPacer({ rate: v })} />
          <Stepper label="Output" unit="mA" value={d.pacer.mA} step={5} min={0} max={200} onChange={(v) => setPacer({ mA: v })} />
          <label className="flex items-center gap-1.5 text-slate-300">
            <input type="checkbox" checked={d.pacer.demand} onChange={(e) => setPacer({ demand: e.target.checked })} /> Demand mode (inhibited by intrinsic beats)
          </label>
          <p className="text-[10px] text-slate-500 leading-snug">
            Typical start: 60–80 ppm. Increase output until every spike is followed by a wide QRS (electrical capture), then set slightly above threshold.
            Confirm mechanical capture with a femoral pulse or SpO₂ waveform. Give analgesia / sedation.
          </p>
        </section>
      )}

      {/* CPR + assessment */}
      <section className="rounded-md border border-slate-700 p-2 space-y-1.5">
        <div className="grid grid-cols-2 gap-1">
          <button onClick={toggleCPR} className={`py-1.5 rounded font-bold ${d.cpr.on ? 'bg-violet-600 text-white' : 'bg-violet-900/50 text-violet-100'}`}>{d.cpr.on ? 'STOP CPR' : 'START CPR'}</button>
          <select value={d.cpr.quality} onChange={(e) => setCprQuality(e.target.value as 'good' | 'poor')} className="rounded bg-cardiac-dark border border-slate-600 text-slate-200 px-1" aria-label="CPR quality">
            <option value="good">High-quality CPR</option>
            <option value="poor">Poor CPR</option>
          </select>
          <button onClick={checkPulse} className="py-1 rounded bg-cardiac-surface text-slate-200">Pulse check</button>
          <button onClick={measureNibp} className="py-1 rounded bg-cardiac-surface text-slate-200">NIBP</button>
        </div>
        {d.pulseCheck && <div className="text-slate-300">Pulse: <b className="text-white">{d.pulseCheck}</b></div>}
      </section>

      {/* Drugs */}
      <section className="rounded-md border border-slate-700 p-2">
        <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Medications{drugAuthority ? ` · ${drugAuthority}` : ''}</div>
        {drugAuthority === null ? (
          <p className="text-[10px] text-slate-400 leading-snug">
            🔒 ACLS medications are outside EMT scope. Within EMT scope (per protocol): aspirin for suspected ACS, assisting with the patient&apos;s own nitroglycerin, oxygen — none are given during cardiac arrest.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-1">
            {DRUGS.map((drug) => (
              <button key={drug.id} onClick={() => giveDrug(drug.id, drugAuthority || undefined)} title={`${drug.dose(d)} — ${drug.indication}`} className="px-1.5 py-1 rounded bg-sky-900/40 text-sky-100 hover:bg-sky-800/60 text-left leading-tight">
                {drug.label}
                <span className="block text-[9px] text-sky-300/80 truncate">{drug.dose(d)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Options */}
      <section className="flex flex-wrap gap-1">
        <Chip active={d.trainee} onClick={() => setTrainee(!d.trainee)} title="Hide rhythm names and interpretation">Trainee mode</Chip>
        <Chip active={d.sound} onClick={() => setSound(!d.sound)} title="QRS tone (pitch falls with SpO₂)">Sound</Chip>
        <Chip active={instructor} onClick={() => setInstructor(!instructor)} title="Scenario and patient controls">Instructor</Chip>
        {onProjector && <Chip active={false} onClick={onProjector} title="Open the monitor in a second window (projector / second screen)">Projector</Chip>}
      </section>

      {/* Instructor */}
      {instructor && (
        <section className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 space-y-1.5">
          <div className="text-[9px] uppercase tracking-wider text-amber-300">Instructor</div>
          <div className="flex flex-wrap gap-1">
            {SCENARIOS.map((sc) => (
              <button key={sc.id} onClick={() => loadScenario(sc)} title={sc.story} className={`px-1.5 py-0.5 rounded ${d.scenario?.id === sc.id ? 'bg-amber-500/30 text-amber-100' : 'bg-cardiac-surface text-slate-200'}`}>{sc.label}</button>
            ))}
          </div>
          <label className="block">
            <span className="text-slate-400">Rhythm</span>
            <select
              value={d.pacer.captured && d.underlying ? d.underlying.profileId : profileId}
              onChange={(e) => instructorRhythm(e.target.value)}
              className="w-full rounded bg-cardiac-dark border border-slate-600 text-slate-200 px-1 py-0.5"
            >
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          {resolveProfile(profileId).rateControl !== 'none' && (
            <Stepper label="Rate" unit="/min" value={heartRate} step={5} min={20} max={260} onChange={(v) => instructorRhythm(d.pacer.captured && d.underlying ? d.underlying.profileId : profileId, v)} />
          )}
          <label className="block">
            <span className="text-slate-400">Patient&apos;s heart (sets BP / output)</span>
            <select
              value={d.baseline ?? 'default'}
              onChange={(e) => setBaseline(e.target.value === 'default' ? null : (e.target.value as HemoProfile))}
              className="w-full rounded bg-cardiac-dark border border-slate-600 text-slate-200 px-1 py-0.5"
            >
              {BASELINES.map((b) => <option key={b.v} value={b.v}>{b.l}</option>)}
            </select>
          </label>
          <Stepper label="SpO₂ baseline" unit="%" value={d.vitals.spo2} step={1} min={60} max={100} onChange={(v) => setVitals({ spo2: v })} />
          <Stepper label="Resp rate" unit="/min" value={d.vitals.rr} step={2} min={0} max={40} onChange={(v) => setVitals({ rr: v })} />
          <Stepper label="EtCO₂ (with pulse)" unit="mmHg" value={d.vitals.etco2} step={2} min={10} max={80} onChange={(v) => setVitals({ etco2: v })} />
          <div className="grid grid-cols-2 gap-1">
            <button onClick={forceRosc} className="py-1 rounded bg-emerald-700/40 text-emerald-100">ROSC</button>
            <button onClick={() => instructorRhythm('vf')} className="py-1 rounded bg-rose-800/40 text-rose-100">Deteriorate → VF</button>
            <button onClick={() => resetCode()} className="col-span-2 py-1 rounded bg-cardiac-surface text-slate-200">Reset code</button>
          </div>
          <p className="text-[10px] text-slate-500 leading-snug">Pacing capture threshold this session: {d.pacer.threshold} mA. Outcome odds are teaching settings, not clinical predictions.</p>
        </section>
      )}

      {d.scenario && (
        <section className="rounded-md border border-slate-700 p-2 text-slate-300 leading-snug">
          <div className="text-[9px] uppercase tracking-wider text-slate-500">Scenario</div>
          {d.scenario.story}
        </section>
      )}

      {/* Log */}
      <section className="rounded-md border border-slate-700 p-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] uppercase tracking-wider text-slate-500">Code record</span>
          <span className="text-[10px] text-slate-500 font-mono">sim {fmt(sim.time)}</span>
        </div>
        {d.log.length === 0 ? (
          <div className="text-slate-500">Events (shocks, drugs, CPR, rhythm changes) appear here with timestamps.</div>
        ) : (
          <ol className="space-y-0.5 font-mono text-[10px]">
            {[...d.log].reverse().map((e, i) => (
              <li key={`${e.t}-${i}`} className={`${LOG_COLORS[e.kind]} leading-snug`}>
                <span className="text-slate-500 mr-1">{codeT(e.t)}</span>
                {d.trainee && e.kind === 'rhythm' ? 'Rhythm changed' : e.text}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Stepper({ label, unit, value, step, min, max, onChange }: { label: string; unit: string; value: number; step: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-1">
      <span className="text-slate-400">{label}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(Math.max(min, value - step))} className="w-6 h-6 rounded bg-cardiac-surface text-slate-200" aria-label={`Decrease ${label}`}>−</button>
        <span className="w-16 text-center font-mono text-white">{value} {unit}</span>
        <button onClick={() => onChange(Math.min(max, value + step))} className="w-6 h-6 rounded bg-cardiac-surface text-slate-200" aria-label={`Increase ${label}`}>+</button>
      </div>
    </div>
  );
}

function Chip({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} className={`px-2 py-0.5 rounded-full border ${active ? 'border-cardiac-accent text-cardiac-accent bg-cardiac-accent/10' : 'border-slate-600 text-slate-300'}`}>
      {children}
    </button>
  );
}
