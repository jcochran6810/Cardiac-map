'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { MEDS, MED_BY_ID, MED_GROUPS, PER_KG, fmtDose, type MedId } from '@/lib/sim/meds';
import { useMedStore, type MedLogEntry } from '@/store/useMedStore';
import { useECGStore } from '@/store/useECGStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { useAppStore, type LearningLevel } from '@/store/useAppStore';
import { CONDITION_TO_PROFILE, resolveProfile } from '@/lib/ecg/profiles';
import { openMedication, setRhythm } from '@/lib/actions';
import { sim } from '@/lib/sim/simulation';
import { IconCheck, IconFlag, IconPill } from '@/components/ui/icons';

/** What each role may do with IV medications (src/lib/scope.ts) */
const SCOPE_NOTE: Partial<Record<LearningLevel, string>> = {
  1: 'IV medications are outside the EMT scope — use this to learn what the paramedic or nurse gives, and what you will see on the monitor.',
  2: 'Paramedic: per your protocols and medical direction.',
  3: 'Cath lab techs give medications only on a physician’s order, where facility policy allows.',
  4: 'Nurse: on a prescriber’s order or a standing protocol (e.g. ACLS).',
};

export const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`;
};

export const TONE: Record<MedLogEntry['tone'], string> = {
  push: 'text-sky-300',
  effect: 'text-slate-100',
  good: 'text-emerald-300',
  warn: 'text-amber-300',
  info: 'text-slate-400',
};

/** Remaining time to the next drug effect, refreshed a few times a second */
export function useNextEffect() {
  const next = useMedStore((s) => s.next);
  const [now, setNow] = useState(() => sim.time);
  useEffect(() => {
    if (!next) return;
    const id = window.setInterval(() => setNow(sim.time), 250);
    return () => window.clearInterval(id);
  }, [next]);
  return next ? { ...next, inMs: next.fireAt - now } : null;
}

/**
 * The condition page's "Give meds" tab: the patient's weight, the drug, the dose, Push — then the live 12-lead
 * shows what the drug does, with a timeline of each effect and a verdict on the drug and the dose.
 */
export default function GiveMedication({ conditionId, conditionName, level }: { conditionId: string; conditionName: string; level: LearningLevel }) {
  const kg = useMedStore((s) => s.kg);
  const setKg = useMedStore((s) => s.setKg);
  const given = useMedStore((s) => s.given);
  const log = useMedStore((s) => s.log);
  const last = useMedStore((s) => s.last);
  const give = useMedStore((s) => s.give);
  const skipAhead = useMedStore((s) => s.skipAhead);
  const reset = useMedStore((s) => s.reset);
  const profileId = useECGStore((s) => s.activeProfileId);
  const hr = useTimelineStore((s) => s.heartRate);
  const displayHR = useTimelineStore((s) => s.displayHR);
  const next = useNextEffect();
  const [drug, setDrug] = useState<MedId | ''>('');
  const [dose, setDose] = useState('');
  const [guide, setGuide] = useState(false);

  // The session belongs to this patient (condition); opening another starts afresh
  useEffect(() => {
    if (useMedStore.getState().conditionId !== conditionId) reset(conditionId);
  }, [conditionId, reset]);

  const def = drug ? MED_BY_ID[drug] : null;
  const patient = useMemo(() => ({ profileId, hr, kg, given }), [profileId, hr, kg, given]);
  const picks = def ? def.picks(patient) : [];
  const n = Number(dose);
  const valid = !!def && Number.isFinite(n) && n > 0;
  const profile = resolveProfile(profileId);
  const lb = Math.round(kg * 2.2046);

  const choose = (id: MedId | '') => {
    setDrug(id);
    setDose('');
    setGuide(false);
  };
  const push = () => {
    if (!def || !valid) return;
    give(def.id, n);
    // Phones and tablets: the info drawer covers the ECG — close it so the effect can be watched
    const app = useAppStore.getState();
    if (app.compact) app.setPanels(false, false);
  };
  const restart = () => {
    reset(conditionId);
    setRhythm(CONDITION_TO_PROFILE[conditionId] ?? 'normal-sinus');
  };

  return (
    <div className="space-y-3">
      <div className="p-2 rounded-md bg-cardiac-dark border border-slate-700 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Patient · {conditionName}</span>
          <button onClick={restart} className="text-[10px] touch:text-[11px] touch:py-1 text-slate-400 hover:text-white" title="Back to the untreated rhythm; forget the doses given">Reset patient</button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-300">Weight</span>
          <div className="flex items-center rounded-md border border-slate-600 overflow-hidden">
            <button onClick={() => setKg(kg - 5)} className="px-2 py-1 touch:py-2 text-slate-300 hover:bg-white/10" aria-label="5 kg less">−</button>
            <input
              type="number"
              inputMode="numeric"
              min={40}
              max={200}
              value={kg}
              onChange={(e) => setKg(Number(e.target.value) || 40)}
              className="w-12 bg-transparent text-center text-xs text-white font-semibold outline-none"
              aria-label="Patient weight in kilograms"
            />
            <button onClick={() => setKg(kg + 5)} className="px-2 py-1 touch:py-2 text-slate-300 hover:bg-white/10" aria-label="5 kg more">+</button>
          </div>
          <span className="text-[11px] text-slate-400">kg ({lb} lb) · adult</span>
        </div>
        <p className="text-[11px] text-slate-300">
          On the monitor: <b className="text-white">{profile.name}</b>{displayHR > 0 ? `, ${displayHR}/min` : ''}
        </p>
      </div>

      {SCOPE_NOTE[level] && <p className="text-[10px] text-slate-500 leading-snug">{SCOPE_NOTE[level]}</p>}

      <label className="block">
        <span className="text-[10px] uppercase tracking-wider text-slate-500">Medication</span>
        <select
          value={drug}
          onChange={(e) => choose(e.target.value as MedId | '')}
          className="mt-1 w-full px-2 py-1.5 touch:py-2.5 rounded-md bg-cardiac-dark border border-slate-600 text-xs text-white"
        >
          <option value="">Choose a medication…</option>
          {MED_GROUPS.map((g) => (
            <optgroup key={g} label={g}>
              {MEDS.filter((m) => m.group === g).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </optgroup>
          ))}
        </select>
      </label>

      {def && (
        <div className="space-y-2">
          <p className="text-[11px] text-slate-400 leading-snug">{def.route}.</p>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Dose for {kg} kg</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {picks.map((x) => (
                <button
                  key={x}
                  onClick={() => setDose(String(x))}
                  className={`px-2 py-1 touch:py-2 rounded-md border text-[11px] ${n === x ? 'border-cardiac-accent bg-cardiac-accent/20 text-cardiac-accent' : 'border-slate-600 text-slate-200 hover:bg-white/10'}`}
                >
                  {fmtDose(x)} {def.unit}
                </button>
              ))}
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={def.step}
                value={dose}
                onChange={(e) => setDose(e.target.value)}
                placeholder="or type a dose"
                className="w-28 px-2 py-1 touch:py-2 rounded-md bg-cardiac-dark border border-slate-600 text-xs text-white"
                aria-label={`Dose of ${def.name} in ${def.unit}`}
              />
              <span className="text-[11px] text-slate-400">
                {def.unit}{valid && PER_KG[def.id] ? ` = ${fmtDose(n / kg)} ${def.unit}/kg` : ''}
              </span>
            </div>
          </div>
          <button onClick={() => setGuide((v) => !v)} className="text-[10px] touch:text-[11px] text-sky-300 hover:underline">
            {guide ? 'Hide the dosing guide' : 'Dosing guide ▸'}
          </button>
          {guide && (
            <div className="p-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-100 leading-snug space-y-1">
              <p>{def.guide}</p>
              <p className="text-amber-200/70">{def.onset}.</p>
              <button onClick={() => openMedication(def.id)} className="text-sky-300 hover:underline">Open the drug card →</button>
            </div>
          )}
          <button
            onClick={push}
            disabled={!valid}
            className="w-full flex items-center justify-center gap-2 py-2 touch:py-3 rounded-lg bg-cardiac-accent text-slate-950 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <IconPill size={14} /> {valid ? `${def.verb} ${def.name} ${fmtDose(n)} ${def.unit}` : 'Choose a dose'}
          </button>
          <p className="text-[10px] text-slate-500 leading-snug">Educational model: adult doses from current guidelines; real patients vary. Follow your protocols.</p>
        </div>
      )}

      {last && <Result />}

      {log.length > 0 && (
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">What happened · watch the 12-lead</span>
            {next && next.inMs > 3000 && (
              <button onClick={skipAhead} className="text-[10px] touch:text-[11px] touch:py-1 text-sky-300 hover:underline" title="Bring the next effect forward (the tracing keeps running in real time)">
                Skip ahead {fmtClock(next.inMs - 1500)} ⏩
              </button>
            )}
          </div>
          <ol className="mt-1 space-y-1">
            {log.map((e, i) => (
              <li key={`${e.t}-${i}`} className="flex gap-2 text-[11px] leading-snug">
                <span className="font-mono text-slate-500 shrink-0 w-11 text-right">{e.tone === 'push' ? 'now' : `+${fmtClock(e.since)}`}</span>
                <span className={TONE[e.tone]}>{e.text}</span>
              </li>
            ))}
            {next && (
              <li className="flex gap-2 text-[11px] text-slate-500 italic">
                <span className="font-mono shrink-0 w-11 text-right">+{fmtClock(next.since)}</span>
                <span>next change in {fmtClock(next.inMs)}…</span>
              </li>
            )}
          </ol>
        </div>
      )}
    </div>
  );
}

/** Verdict on the last dose: the drug for this rhythm, and the amount */
function Result() {
  const last = useMedStore((s) => s.last)!;
  const def = MED_BY_ID[last.drug];
  const v = last.plan.verdict;
  const box = v.tone === 'good' ? 'bg-emerald-500/10 border-emerald-500/30' : v.tone === 'caution' ? 'bg-amber-500/10 border-amber-500/30' : 'bg-red-500/10 border-red-500/30';
  const head = v.tone === 'good' ? 'text-emerald-300' : v.tone === 'caution' ? 'text-amber-300' : 'text-red-300';
  const doseTone = last.plan.doseClass === 'usual' ? 'text-emerald-300' : last.plan.doseClass === 'toxic' ? 'text-red-300' : 'text-amber-300';
  return (
    <div className={`p-2 rounded-md border ${box} space-y-1`} role="status">
      <div className={`flex items-center gap-1 text-[11px] font-semibold ${head}`}>
        {v.tone === 'good' ? <IconCheck size={12} /> : <IconFlag size={12} />}
        {def.name}: {v.tone === 'good' ? 'a good choice' : v.tone === 'caution' ? 'possible, with care' : 'not the right drug here'}
      </div>
      <p className="text-[11px] text-slate-200 leading-snug">{v.text}</p>
      <p className={`text-[11px] ${doseTone}`}>Dose: {last.plan.doseText}</p>
      <p className="text-[10px] text-slate-400">{def.onset}.</p>
    </div>
  );
}
