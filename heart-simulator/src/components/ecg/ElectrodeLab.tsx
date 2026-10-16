'use client';

import React, { useState } from 'react';
import { useECGStore } from '@/store/useECGStore';
import {
  ELECTRODES, ELECTRODE_COLORS, PLACEMENT_PRESETS, STANDARD_PLACEMENT, applyPreset, describePlacement, isStandard, presetFor, swapCables,
  type Electrode,
} from '@/lib/ecg/electrodes';
import { applyPlacement } from '@/lib/ecg/placement';

/** Anterior view: the patient's right is on the viewer's left */
const SITE_XY: Record<Electrode, [number, number]> = {
  RA: [26, 146], LA: [174, 146], RL: [84, 224], LL: [116, 224],
  V1: [93, 92], V2: [107, 92], V3: [115, 99], V4: [124, 106], V5: [135, 107], V6: [145, 108],
};

type Guess = { answer: string; correct: boolean } | null;

export default function ElectrodeLab() {
  const placement = useECGStore((s) => s.placement);
  const hidden = useECGStore((s) => s.placementHidden);
  const reveal = useECGStore((s) => s.revealPlacement);
  const close = () => useECGStore.getState().setElectrodeLab(false);
  const [scheme, setScheme] = useState<'aha' | 'iec'>('aha');
  const [picked, setPicked] = useState<Electrode | null>(null);
  const [guess, setGuess] = useState<Guess>(null);

  const colors = ELECTRODE_COLORS[scheme];
  const standard = isStandard(placement);
  const preset = presetFor(placement);
  const desc = describePlacement(placement);

  // cable attached at each site
  const cableAt = {} as Record<Electrode, Electrode>;
  for (const c of ELECTRODES) cableAt[(hidden ? c : placement[c]) as Electrode] = c;

  const clickSite = (site: Electrode) => {
    if (hidden) return;
    const cable = cableAt[site];
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
  };

  const answer = (id: string) => {
    const truth = preset?.id ?? 'none';
    setGuess({ answer: id, correct: id === truth });
    reveal();
  };

  return (
    <div className="text-[11px]">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[9px] uppercase tracking-wider text-slate-500">Electrode lab</div>
        <button onClick={close} className="text-slate-500 hover:text-white text-[10px]" aria-label="Close electrode lab">✕</button>
      </div>

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

      <div className="flex items-center justify-between mt-1">
        <span className="text-slate-500 text-[10px]">{hidden ? 'Cables hidden — read the ECG' : picked ? `Swap ${picked} with… (click another)` : 'Click two electrodes to swap cables'}</span>
        <div className="flex rounded overflow-hidden border border-slate-600 text-[9px]">
          {(['aha', 'iec'] as const).map((k) => (
            <button key={k} onClick={() => setScheme(k)} className={`px-1.5 py-0.5 ${scheme === k ? 'bg-cardiac-accent/25 text-cardiac-accent' : 'text-slate-400'}`}>{k === 'aha' ? 'AHA' : 'IEC'}</button>
          ))}
        </div>
      </div>

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
          <div className="text-sky-200 font-semibold mb-1">Mystery: is a cable reversed?</div>
          <div className="flex flex-wrap gap-1">
            {[{ id: 'none', label: 'Correct placement' }, ...PLACEMENT_PRESETS].map((p) => (
              <button key={p.id} onClick={() => answer(p.id)} className="px-1.5 py-0.5 rounded bg-cardiac-surface text-slate-200 hover:bg-slate-600">{p.label}</button>
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

      <div className="mt-2 flex flex-wrap gap-1">
        {PLACEMENT_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => { applyPlacement(applyPreset(p)); setGuess(null); }}
            className={`px-1.5 py-0.5 rounded ${!hidden && preset?.id === p.id ? 'bg-amber-500/25 text-amber-200' : 'bg-cardiac-surface/70 text-slate-300 hover:text-white'}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1">
        <button onClick={() => { applyPlacement(STANDARD_PLACEMENT); setGuess(null); setPicked(null); }} className="flex-1 px-2 py-1 rounded bg-cardiac-surface text-slate-200 hover:bg-slate-600">Reset placement</button>
        <button onClick={mystery} className="flex-1 px-2 py-1 rounded bg-sky-600/30 text-sky-200 hover:bg-sky-600/45">Mystery reversal</button>
      </div>

      <details className="mt-2 text-slate-400">
        <summary className="cursor-pointer text-slate-300">How the 12 leads are built</summary>
        <div className="mt-1 space-y-0.5 font-mono text-[10px] leading-snug">
          <div>I = LA − RA · II = LL − RA · III = LL − LA</div>
          <div>WCT = (RA + LA + LL) / 3</div>
          <div>aVR = 1.5 (RA − WCT), aVL, aVF likewise</div>
          <div>V1–V6 = electrode − WCT</div>
        </div>
        <p className="mt-1 leading-snug">RL is the ground/reference and is not part of any lead. V1: 4th intercostal space, right sternal border · V2: left sternal border · V4: 5th space, midclavicular · V3 between V2 and V4 · V5 anterior axillary and V6 midaxillary line at the level of V4.</p>
      </details>
    </div>
  );
}
