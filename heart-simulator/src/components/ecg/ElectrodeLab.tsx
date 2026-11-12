'use client';

import React, { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useECGStore } from '@/store/useECGStore';
import {
  ELECTRODES, ELECTRODE_COLORS, PLACEMENT_PRESETS, STANDARD_PLACEMENT, applyPreset, describePlacement, isStandard, leadField, presetFor, swapCables,
  type Electrode,
} from '@/lib/ecg/electrodes';
import { applyPlacement } from '@/lib/ecg/placement';
import { ALL_LEADS, LEAD_VECTORS, dot, norm } from '@/lib/ecg/vector';
import { ELECTRODE_SITE_TEXT, LEAD_VIEWS, describePoles, leadForElectrode } from '@/lib/ecg/leadViews';

const TorsoModel = dynamic(() => import('./TorsoModel'), { ssr: false, loading: () => <div className="h-[290px]" /> });

/** Anterior view (2D fallback): the patient's right is on the viewer's left; limb electrodes on the torso */
const SITE_XY: Record<Electrode, [number, number]> = {
  RA: [66, 62], LA: [134, 62], RL: [78, 152], LL: [122, 152],
  V1: [93, 92], V2: [107, 92], V3: [115, 99], V4: [124, 106], V5: [135, 107], V6: [145, 108],
};

type Guess = { answer: string; correct: boolean } | null;

/**
 * `wide`: desktop side panel (two columns). `titled`: the container already shows the title and close button.
 * `fit`: a small panel (a lesson on a phone) — the patient fills what is visible and the controls follow below.
 */
export default function ElectrodeLab({ wide = false, titled = false, fit = false }: { wide?: boolean; titled?: boolean; fit?: boolean }) {
  const placement = useECGStore((s) => s.placement);
  const hidden = useECGStore((s) => s.placementHidden);
  const reveal = useECGStore((s) => s.revealPlacement);
  const close = () => useECGStore.getState().setElectrodeLab(false);
  const [scheme, setScheme] = useState<'aha' | 'iec'>('aha');
  const [picked, setPicked] = useState<Electrode | null>(null);
  const [guess, setGuess] = useState<Guess>(null);
  const [mode, setMode] = useState<'view' | 'swap'>('view');
  const [note, setNote] = useState<string | null>(null);
  const lead = useECGStore((s) => s.selectedLead);
  const selectLead = useECGStore((s) => s.selectLead);
  const rootRef = useRef<HTMLDivElement>(null);
  // bring the top of the lab (the mystery's question, then its answer) back into view in a scrolling panel
  const toTop = () => window.setTimeout(() => rootRef.current?.scrollIntoView({ block: 'start' }), 0);

  const colors = ELECTRODE_COLORS[scheme];
  const standard = isStandard(placement);
  const preset = presetFor(placement);
  const desc = describePlacement(placement);

  // does the current reversal turn the selected lead's view away from its usual side?
  const effective = lead && !hidden && !standard ? leadField(placement)[lead] : null;
  const leadFlat = !!effective && Math.hypot(...effective) < 0.2 * Math.hypot(...LEAD_VECTORS[lead!]);
  const leadTurned = !!effective && !leadFlat && dot(norm(effective), norm(LEAD_VECTORS[lead!])) < 0.7;

  // cable attached at each site
  const cableAt = {} as Record<Electrode, Electrode>;
  for (const c of ELECTRODES) cableAt[(hidden ? c : placement[c]) as Electrode] = c;

  const clickSite = (site: Electrode) => {
    const cable = cableAt[site];
    if (mode === 'view') {
      const l = leadForElectrode(cable);
      setNote(l ? null : 'RL is the ground (reference) electrode: it is not part of any lead.');
      if (l && l !== lead) selectLead(l);
      return;
    }
    if (hidden) return;
    if (!picked) { setPicked(cable); return; }
    if (picked !== cable) applyPlacement(swapCables(placement, picked, cable));
    setPicked(null);
  };

  const mystery = () => {
    const options = [...PLACEMENT_PRESETS, null];
    const choice = options[Math.floor(Math.random() * options.length)];
    applyPlacement(choice ? applyPreset(choice) : STANDARD_PLACEMENT, true);
    setGuess(null);
    setPicked(null);
    toTop();
  };

  const answer = (id: string) => {
    const truth = preset?.id ?? 'none';
    setGuess({ answer: id, correct: id === truth });
    reveal();
    toTop();
  };

  const header = (
    <>
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] uppercase tracking-wider text-slate-400">Electrode lab</div>
        <button onClick={close} className="w-7 h-7 -mr-1 -my-1 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-cardiac-surface text-xs" aria-label="Close electrode lab">✕</button>
      </div>
    </>
  );
  const model = (
    <>
      <div className="flex shrink-0 rounded overflow-hidden border border-slate-600 text-[11px] mb-1" role="group" aria-label="What tapping an electrode does">
        {(['view', 'swap'] as const).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setPicked(null); setNote(null); }}
            aria-pressed={mode === m}
            className={`flex-1 px-2 py-1 touch:min-h-[36px] ${mode === m ? 'bg-cardiac-accent/25 text-cardiac-accent' : 'text-slate-300 hover:text-white'}`}
          >
            {m === 'view' ? 'Lead views' : 'Swap cables'}
          </button>
        ))}
      </div>

      <TorsoModel
        cableAt={cableAt}
        scheme={scheme}
        hidden={hidden}
        picked={picked}
        lead={lead}
        onSite={clickSite}
        className={`w-full rounded-md bg-gradient-to-b from-slate-900/40 to-slate-950/60 ${wide ? 'flex-1 min-h-[150px]' : fit ? 'flex-1 min-h-[120px]' : 'h-[290px]'}`}
        fallback={(
          <svg viewBox="0 0 200 232" className="w-full max-w-[230px] mx-auto block" role="img" aria-label="Electrode positions on the chest">
            {/* body */}
            <circle cx="100" cy="22" r="15" fill="#1e293b" stroke="#475569" />
            <path d="M70 44 Q100 38 130 44 L150 52 Q158 56 160 66 L182 146 L166 150 L146 84 L144 150 Q142 168 132 172 L126 226 L106 226 L100 176 L94 226 L74 226 L68 172 Q58 168 56 150 L54 84 L34 150 L18 146 L40 66 Q42 56 50 52 Z" fill="#1e293b" stroke="#475569" />
            {/* sternum and ribs (landmarks) */}
            <line x1="100" y1="56" x2="100" y2="104" stroke="#64748b" strokeWidth="3" strokeLinecap="round" />
            {[70, 80, 90, 100, 110].map((y, i) => (
              <path key={y} d={`M${100 - 34 - i * 2} ${y + 4} Q${100 - 14} ${y - 3} 98 ${y}  M102 ${y} Q${100 + 14} ${y - 3} ${100 + 34 + i * 2} ${y + 4}`} stroke="#334155" fill="none" />
            ))}
            <text x="100" y="128" textAnchor="middle" fontSize="7" fill="#64748b">patient&apos;s right ← → left</text>
            {/* electrodes */}
            {ELECTRODES.map((site) => {
              const cable = cableAt[site];
              const [x, y] = SITE_XY[site];
              const c = colors[cable];
              const wrong = !hidden && cable !== site;
              const sel = picked === cable;
              return (
                <g key={site} onClick={() => clickSite(site)} style={{ cursor: hidden ? 'default' : 'pointer' }}>
                  <circle cx={x} cy={y} r={site.startsWith('V') ? 5.5 : 7.5} fill={c.fill} stroke={sel ? '#38bdf8' : wrong ? '#f59e0b' : '#e2e8f0'} strokeWidth={sel || wrong ? 2 : 0.8} />
                  <text x={x} y={site.startsWith('V') ? y - 8 : y + (site === 'RL' || site === 'LL' ? 1 : -11)} dx={site === 'RL' ? -14 : site === 'LL' ? 14 : 0} textAnchor="middle" fontSize="7" fill={wrong ? '#fbbf24' : '#cbd5e1'} fontWeight={600}>{c.label}</text>
                </g>
              );
            })}
          </svg>
        )}
      />

      <div className="flex shrink-0 items-center justify-between mt-1">
        <span className="text-slate-400 text-[11px] min-w-0 truncate mr-1">
          {mode === 'view'
            ? 'Tap an electrode or lead · drag to turn'
            : hidden ? 'Cables hidden — read the ECG' : picked ? `Swap ${picked} with… (tap another)` : 'Tap two electrodes to swap cables'}
        </span>
        <div className="flex shrink-0 rounded overflow-hidden border border-slate-600 text-[10px]" role="group" aria-label="Electrode color code">
          {(['aha', 'iec'] as const).map((k) => (
            <button key={k} onClick={() => setScheme(k)} aria-pressed={scheme === k} title={k === 'aha' ? 'AHA colors (North America)' : 'IEC colors (Europe)'} className={`px-1.5 py-0.5 touch:px-2.5 touch:min-h-[32px] ${scheme === k ? 'bg-cardiac-accent/25 text-cardiac-accent' : 'text-slate-400'}`}>{k === 'aha' ? 'AHA' : 'IEC'}</button>
          ))}
        </div>
      </div>
    </>
  );
  const leadInfo = (
    <>
      {mode === 'view' && (
        <div className="mt-2">
          <div className="grid grid-cols-6 gap-1" role="group" aria-label="Show a lead's view of the heart">
            {ALL_LEADS.map((l) => (
              <button
                key={l}
                onClick={() => { setNote(null); selectLead(l); }}
                aria-pressed={lead === l}
                className={`px-1 py-0.5 touch:min-h-[36px] rounded text-[11px] font-semibold ${lead === l ? 'bg-cyan-400 text-slate-950' : 'bg-cardiac-surface/70 text-slate-300 hover:text-white'}`}
              >
                {l}
              </button>
            ))}
          </div>
          {note && <div className="mt-1.5 text-slate-400">{note}</div>}
          {lead && (
            <div className="mt-1.5 rounded-md border border-cyan-400/40 bg-cyan-400/10 p-2 space-y-0.5">
              <div className="text-cyan-100 font-semibold">{lead} looks at the {LEAD_VIEWS[lead].wall.charAt(0).toLowerCase() + LEAD_VIEWS[lead].wall.slice(1)}</div>
              <div className="text-slate-300">Usual artery: {LEAD_VIEWS[lead].artery}</div>
              <div className="text-slate-400">Poles: {describePoles(lead)}</div>
              <div className="text-slate-400">{LEAD_VIEWS[lead].positive}: {ELECTRODE_SITE_TEXT[LEAD_VIEWS[lead].positive]}</div>
              {leadFlat && <div className="text-amber-200">With the cables reversed ({desc}), {lead} is almost flat: both of its poles now sit at nearly the same potential.</div>}
            {leadTurned && <div className="text-amber-200">With the cables reversed ({desc}), {lead} no longer looks from its usual side: the line on the heart shows where it looks now.</div>}
            <div className="text-slate-400">The cyan line on the heart starts where this lead looks from.</div>
            </div>
          )}
        </div>
      )}

    </>
  );
  // the question of a mystery, then its answer with the clues that give it away
  const status = (
    <>
      {/* Status */}
      {!hidden && !standard && (
        <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
          <div className="text-amber-200 font-semibold">Cables reversed: {desc}</div>
          {preset && (
            <ul className="mt-1 space-y-0.5 text-slate-200">
              {preset.clues.map((c) => <li key={c} className="flex gap-1.5"><span className="text-amber-300">•</span><span>{c}</span></li>)}
            </ul>
          )}
        </div>
      )}
      {hidden && (
        <div className="mt-2 rounded-md border border-sky-500/40 bg-sky-500/10 p-2">
          <div className="text-sky-200 font-semibold">Mystery: is a cable reversed?</div>
          <p className="text-slate-300 mb-1.5">Read the tracing — start with leads I, II and aVR, then the R waves across V1–V6 — and answer.</p>
          <div className="flex flex-wrap gap-1">
            {[{ id: 'none', label: 'Correct placement' }, ...PLACEMENT_PRESETS].map((p) => (
              <button key={p.id} onClick={() => answer(p.id)} className="px-2 py-1 touch:min-h-[40px] touch:px-3 rounded bg-cardiac-surface text-slate-100 hover:bg-slate-600">{p.label}</button>
            ))}
          </div>
        </div>
      )}
      {guess && (
        <div className={`mt-2 rounded-md p-2 ${guess.correct ? 'bg-emerald-500/15 text-emerald-200' : 'bg-rose-500/15 text-rose-200'}`}>
          {guess.correct ? 'Correct!' : `Not quite — it was ${preset ? preset.label : 'correct placement'}.`}
          {standard && <span className="text-slate-300"> All cables were on the right sites.</span>}
        </div>
      )}

    </>
  );
  const rest = (
    <>
      {!hidden && (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Try a reversal</div>
          <div className="flex flex-wrap gap-1">
            {PLACEMENT_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => { applyPlacement(applyPreset(p)); setGuess(null); }}
                aria-pressed={preset?.id === p.id}
                className={`px-2 py-1 touch:min-h-[40px] touch:px-3 rounded ${preset?.id === p.id ? 'bg-amber-500/25 text-amber-200' : 'bg-cardiac-surface/70 text-slate-300 hover:text-white'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mt-1.5 flex gap-1">
        <button onClick={() => { applyPlacement(STANDARD_PLACEMENT); setGuess(null); setPicked(null); }} className="flex-1 px-2 py-1 touch:min-h-[40px] rounded bg-cardiac-surface text-slate-200 hover:bg-slate-600">Reset placement</button>
        <button onClick={mystery} className="flex-1 px-2 py-1 touch:min-h-[40px] rounded bg-sky-600/30 text-sky-200 hover:bg-sky-600/45">{hidden || guess ? 'Another mystery' : 'Mystery reversal'}</button>
      </div>

      <details className="mt-2 text-slate-400">
        <summary className="cursor-pointer text-slate-300">How the 12 leads are built</summary>
        <div className="mt-1 space-y-0.5 font-mono text-[10px] leading-snug">
          <div>I = LA − RA · II = LL − RA · III = LL − LA</div>
          <div>WCT = (RA + LA + LL) / 3</div>
          <div>aVR = 1.5 (RA − WCT), aVL, aVF likewise</div>
          <div>V1–V6 = electrode − WCT</div>
        </div>
        <p className="mt-1 leading-snug">Limb electrodes are shown on the torso (Mason–Likar): RA and LA just below the clavicles near the shoulders, RL and LL on the lower abdomen. This is standard for monitoring, EMS and the cath lab; a resting diagnostic 12-lead puts them on the limbs, and torso placement can shift the axis to the right and change the inferior leads, so note it on the tracing.</p>
        <p className="mt-1 leading-snug">RL is the ground/reference and is not part of any lead. V1: 4th intercostal space, right sternal border · V2: left sternal border · V4: 5th space, midclavicular · V3 between V2 and V4 · V5 anterior axillary and V6 midaxillary line at the level of V4.</p>
      </details>
    </>
  );
  const controls = <>{leadInfo}{status}{rest}</>;

  // Wide side panel (desktop): mannequin on the left, controls scrolling on the right
  if (wide) {
    return (
      <div className="h-full flex gap-3 text-[11px]">
        <div className="w-[48%] shrink-0 flex flex-col min-h-0">{header}{model}</div>
        <div className="flex-1 min-w-0 overflow-y-auto pr-1 -mt-2">{controls}</div>
      </div>
    );
  }
  if (fit) {
    // a mystery is read off the tracing above, not off the patient: its question and its answer come first
    const quiz = hidden || !!guess;
    return (
      <div ref={rootRef} className="h-full text-[11px]">
        {quiz && <div className="pb-2 -mt-2">{status}</div>}
        <div className={`flex flex-col min-h-[204px] ${quiz ? 'h-[70%]' : 'h-full'}`}>{model}</div>
        <div className="pt-2">{quiz ? <>{leadInfo}{rest}</> : controls}</div>
      </div>
    );
  }
  return <div className="text-[11px]">{!titled && header}{model}{controls}</div>;
}
