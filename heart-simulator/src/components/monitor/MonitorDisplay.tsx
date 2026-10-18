'use client';

import React, { useEffect, useRef, useState } from 'react';
import { sim } from '@/lib/sim/simulation';
import { useDefibStore, vitalsAt, plethAt, capnoAt, fmt, type Vitals } from '@/lib/sim/defib';
import { useECGStore } from '@/store/useECGStore';
import { resolveProfile } from '@/lib/ecg/profiles';
import { sampleTimes } from '@/lib/ecg/sweep';
import { useAppStore } from '@/store/useAppStore';

const WINDOW = 6000; // ms across the screen
const COLORS = { ecg: '#3cff7a', art: '#ff5c74', pleth: '#45d4ff', co2: '#ffd43b', grid: 'rgba(255,255,255,0.05)', text: '#9aa4b2' };
/** the arterial trace is drawn on a fixed 0–160 mmHg scale, like a bedside monitor */
const ART_SCALE = 160;

/**
 * `art`: an arterial line (cath lab) — a pressure trace under the ECG, and the pressure box shows the live
 * arterial pressure instead of NIBP. 'damped': the catheter tip is wedged (no dicrotic notch, a rounded trace).
 */
export interface Channels { ecg: boolean; pleth: boolean; co2: boolean; art?: boolean | 'damped' }
const ALL_CHANNELS: Channels = { ecg: true, pleth: true, co2: true };

/**
 * Bedside monitor-defibrillator display: ECG lead II, SpO₂ plethysmogram and capnogram.
 * `channels` says which sensors are connected (the case simulator starts with none);
 * `showRhythmName` labels the rhythm, which a real monitor never does.
 */
export default function MonitorDisplay({ large = false, channels = ALL_CHANNELS, showRhythmName = true }: { large?: boolean; channels?: Channels; showRhythmName?: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [vit, setVit] = useState<Vitals>(() => vitalsAt(sim.time));
  const d = useDefibStore();
  const profileId = useECGStore((s) => s.activeProfileId);
  const profile = resolveProfile(profileId);
  const role = useAppStore((s) => s.learningLevel);
  const [blink, setBlink] = useState(false);
  const channelsRef = useRef(channels);
  channelsRef.current = channels;

  // numerics at 4 Hz
  useEffect(() => {
    const id = window.setInterval(() => { setVit(vitalsAt(sim.time)); setBlink((b) => !b); }, 250);
    return () => window.clearInterval(id);
  }, []);

  // sweep drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let W = 0, H = 0, dpr = 1;
    let lastT = -1;
    let lastEpoch = -1;
    let audio: AudioContext | null = null;
    let lastBeepV = -1;
    const rows = () => {
      if (channelsRef.current.art) {
        const h = H / 4;
        return { ecg: [0, h], art: [h, 2 * h], pleth: [2 * h, 3 * h], co2: [3 * h, 4 * h] } as const;
      }
      const h = H / 3;
      return { ecg: [0, h], art: null, pleth: [h, 2 * h], co2: [2 * h, 3 * h] } as const;
    };
    /** arterial pressure (mmHg) at t, scaled to the patient's numbers; a damped line loses the notch and the peaks */
    const artAt = (t: number, v: Vitals, damped: boolean) => {
      if (!v.pulse) return 0;
      const [ms, md] = v.wave ?? [v.sbp, v.dbp];
      const raw = damped ? [0, 40, 80, 120, 160, 200].reduce((a, d) => a + sim.hemo.sample(t - d).aop, 0) / 6 : sim.hemo.sample(t).aop;
      const k = Math.max(-0.1, Math.min(1.1, (raw - md) / Math.max(5, ms - md)));
      return v.dbp + k * (v.sbp - v.dbp);
    };
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = wrap.clientWidth;
      H = wrap.clientHeight;
      canvas.width = Math.max(1, Math.floor(W * dpr));
      canvas.height = Math.max(1, Math.floor(H * dpr));
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lastT = -1;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    const xOf = (t: number) => ((((t % WINDOW) + WINDOW) % WINDOW) / WINDOW) * W;
    const sample = (t: number, cache: { v?: Vitals; vt?: number }) => {
      if (!cache.v || Math.abs((cache.vt ?? 0) - t) > 400) { cache.v = vitalsAt(t); cache.vt = t; }
      const v = cache.v;
      const r = rows();
      const on = channelsRef.current;
      const ecgMid = r.ecg[0] + (r.ecg[1] - r.ecg[0]) * 0.6;
      const pxPerMv = (r.ecg[1] - r.ecg[0]) * 0.36;
      const yE = ecgMid - (on.ecg ? Math.max(-2.2, Math.min(2.6, sim.engine.voltage('II', t))) : 0) * pxPerMv;
      const pl = on.pleth ? plethAt(t, v.pulse, v.wave?.[0] ?? v.sbp, v.wave?.[1] ?? v.dbp) : 0;
      const yP = r.pleth[1] - 8 - pl * (r.pleth[1] - r.pleth[0] - 18);
      const c = on.co2 ? capnoAt(t, v.rr, v.etco2) : 0;
      const yC = r.co2[1] - 6 - (c / 50) * (r.co2[1] - r.co2[0] - 16);
      const yA = r.art ? r.art[1] - 5 - (Math.min(ART_SCALE, artAt(t, v, on.art === 'damped')) / ART_SCALE) * (r.art[1] - r.art[0] - 12) : 0;
      return [yE, yP, yC, yA];
    };
    const drawRange = (t0: number, t1: number) => {
      const step = WINDOW / Math.max(100, W);
      const cache: { v?: Vitals; vt?: number } = {};
      let prev: number[] | null = null;
      let prevX = 0;
      ctx.lineWidth = large ? 2.2 : 1.6;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round'; // each frame adds short separate segments; round ends keep the joins smooth
      for (const t of sampleTimes(t0, t1, step)) {
        const x = xOf(t);
        const cur = sample(t, cache);
        if (prev && x >= prevX) {
          const cols = [COLORS.ecg, COLORS.pleth, COLORS.co2, COLORS.art];
          for (let k = 0; k < (channelsRef.current.art ? 4 : 3); k++) {
            ctx.strokeStyle = cols[k];
            ctx.beginPath();
            ctx.moveTo(prevX, prev[k]);
            ctx.lineTo(x, cur[k]);
            ctx.stroke();
          }
        }
        prev = cur;
        prevX = x;
      }
      // SYNC markers on each detected R wave
      const s = useDefibStore.getState();
      if (s.sync && s.mode === 'manual') {
        const e = sim.engine;
        let i = e.lastVentIndex(t1);
        const r = rows();
        ctx.fillStyle = '#ffffff';
        while (i >= 0 && e.vent[i].t + 15 >= t0) {
          const v = e.vent[i];
          if (v.t + 15 <= t1 && profile.rhythm !== 'vf') {
            const x = xOf(v.t + 15);
            ctx.beginPath();
            ctx.moveTo(x - 4, r.ecg[0] + 8);
            ctx.lineTo(x + 4, r.ecg[0] + 8);
            ctx.lineTo(x, r.ecg[0] + 15);
            ctx.closePath();
            ctx.fill();
          }
          i--;
        }
      }
    };
    // Row dividers are drawn only where the screen was just cleared: stroking the whole width
    // every frame stacks the translucent line on itself until it turns solid white.
    const grid = (x0: number, x1: number) => {
      const r = rows();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.lineCap = 'butt'; // no overhang into the area that was not cleared
      for (const y of [...(r.art ? [r.art[0]] : []), r.pleth[0], r.co2[0]]) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
    };
    const erase = (a: number, b: number) => {
      // Whole device pixels, so the sweep leaves no half-erased seams behind
      const x0 = Math.floor(a * dpr) / dpr;
      const x1 = Math.ceil(b * dpr) / dpr;
      ctx.fillStyle = '#05080c';
      if (x1 >= x0) { ctx.fillRect(x0, 0, x1 - x0, H); grid(x0, x1); }
      else { ctx.fillRect(x0, 0, W - x0, H); ctx.fillRect(0, 0, x1, H); grid(x0, W); grid(0, x1); }
    };
    const beep = (spo2: number | null) => {
      if (!useDefibStore.getState().sound) return;
      try {
        audio = audio ?? new AudioContext();
        const o = audio.createOscillator();
        const g = audio.createGain();
        o.frequency.value = spo2 ? 420 + (spo2 - 70) * 14 : 660; // pitch falls with saturation
        g.gain.setValueAtTime(0.06, audio.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.09);
        o.connect(g).connect(audio.destination);
        o.start();
        o.stop(audio.currentTime + 0.1);
      } catch { /* audio unavailable */ }
    };

    let lastArt = !!channelsRef.current.art;
    const loop = () => {
      const T = sim.time;
      // the arterial line adds a row: redraw everything in the new layout
      if (!!channelsRef.current.art !== lastArt) { lastArt = !lastArt; lastT = -1; }
      if (W > 10 && H > 10) {
        if (lastT < 0 || sim.epoch !== lastEpoch || T < lastT || T - lastT > WINDOW * 0.8) {
          ctx.fillStyle = '#05080c';
          ctx.fillRect(0, 0, W, H);
          grid(0, W);
          drawRange(T - WINDOW + 400, T);
          lastEpoch = sim.epoch;
        } else if (T > lastT) {
          const gap = 18;
          erase(xOf(lastT) + 1, (xOf(T) + gap) % W);
          drawRange(lastT, T);
        }
        // QRS tone
        const i = sim.engine.lastVentIndex(T);
        if (i >= 0 && i !== lastBeepV && T - sim.engine.vent[i].t < 120) {
          if (lastBeepV >= 0) beep(vitalsAt(T).spo2);
          lastBeepV = i;
        }
        lastT = T;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); audio?.close().catch(() => undefined); };
  }, [large, profile.rhythm]);

  const nibp = d.nibp.last;
  const big = large ? 'text-6xl' : 'text-2xl sm:text-3xl';
  const mid = large ? 'text-3xl' : 'text-lg sm:text-xl';
  const shockFlash = sim.time - d.lastShock < 900;
  const elapsed = d.codeStart !== null ? sim.time - d.codeStart : null;
  const cprFor = d.cpr.on ? sim.time - d.cpr.cycleStart : 0;
  const epiAgo = d.lastEpi !== null ? sim.time - d.lastEpi : null;

  return (
    <div className="relative w-full h-full bg-[#05080c] text-slate-100 select-none overflow-hidden rounded-md border border-slate-800 flex">
      <div className="relative flex-1 min-w-0" ref={wrapRef}>
        <canvas ref={canvasRef} className="absolute inset-0" />
        <div className="absolute left-2 top-1 text-[10px] font-mono" style={{ color: COLORS.ecg }}>
          II ×1 {showRhythmName && !d.trainee && role !== 1 && <span className="text-slate-400 ml-2">{profile.name}</span>}
          {d.sync && d.mode === 'manual' && <span className="ml-2 px-1 rounded bg-white text-black font-bold">SYNC</span>}
        </div>
        {channels.art && <div className="absolute left-2 text-[10px] font-mono" style={{ top: '25.5%', color: COLORS.art }}>ART 0–{ART_SCALE}</div>}
        <div className="absolute left-2 text-[10px] font-mono" style={{ top: channels.art ? '50.5%' : '34%', color: COLORS.pleth }}>Pleth</div>
        <div className="absolute left-2 text-[10px] font-mono" style={{ top: channels.art ? '75.5%' : '67.5%', color: COLORS.co2 }}>CO₂ mmHg</div>
        {!channels.ecg && <Unplugged top={channels.art ? '8%' : '12%'} large={large}>ECG leads not connected</Unplugged>}
        {!channels.pleth && <Unplugged top={channels.art ? '58%' : '45%'} large={large}>SpO₂ probe not connected</Unplugged>}
        {!channels.co2 && <Unplugged top={channels.art ? '83%' : '78%'} large={large}>No capnography</Unplugged>}
        {d.message && (
          <div className={`absolute left-1/2 -translate-x-1/2 top-1 max-w-[80%] px-2 py-0.5 rounded text-center font-semibold ${large ? 'text-lg' : 'text-[11px]'} ${d.charge === 'charged' || d.aed.phase === 'shock' ? (blink ? 'bg-amber-400 text-black' : 'bg-amber-600 text-black') : 'bg-slate-800/90 text-amber-200'}`}>
            {d.message}
          </div>
        )}
        {shockFlash && <div className="absolute inset-0 bg-white/30 pointer-events-none" />}
      </div>

      {/* numerics */}
      <div className={`shrink-0 flex flex-col justify-between border-l border-slate-800 font-mono ${large ? 'w-72 p-4' : 'w-28 sm:w-36 p-1.5 sm:p-2'}`}>
        <div style={{ color: COLORS.ecg }}>
          <div className="text-[10px] flex justify-between"><span>HR</span><span>bpm</span></div>
          <div className={`${big} font-bold leading-none tabular-nums`}>{vit.hr > 0 && (channels.ecg || (channels.pleth && vit.pulse)) ? vit.hr : '---'}</div>
          {d.pacer.on && (
            <div className="text-[10px] text-orange-300 mt-0.5">
              PACER {d.pacer.rate} ppm · {d.pacer.mA} mA{d.pacer.inhibited ? ' · inhibited' : d.pacer.captured ? '' : ' · no capture'}
            </div>
          )}
        </div>
        <div style={{ color: COLORS.pleth }}>
          <div className="text-[10px] flex justify-between"><span>SpO₂</span><span>%</span></div>
          <div className={`${mid} font-bold leading-none tabular-nums`}>{channels.pleth ? vit.spo2 ?? '---' : '---'}</div>
        </div>
        <div style={{ color: COLORS.co2 }}>
          <div className="text-[10px] flex justify-between"><span>EtCO₂</span><span>RR</span></div>
          <div className="flex items-baseline justify-between">
            <span className={`${mid} font-bold leading-none tabular-nums`}>{channels.co2 ? vit.etco2 : '--'}</span>
            <span className={`${large ? 'text-2xl' : 'text-base'} tabular-nums`}>{channels.co2 || channels.ecg ? vit.rr : '--'}</span>
          </div>
        </div>
        {channels.art ? (
          <div className="text-rose-300">
            <div className="text-[10px] flex justify-between"><span>ART</span><span>mmHg</span></div>
            <div className={`${large ? 'text-3xl' : 'text-base'} font-bold leading-none tabular-nums`}>{vit.pulse ? `${vit.sbp}/${vit.dbp}` : '0/0'}</div>
            {vit.pulse && <div className="text-[10px] text-rose-200/70">({Math.round((vit.sbp + 2 * vit.dbp) / 3)})</div>}
          </div>
        ) : (
          <div className="text-slate-200">
            <div className="text-[10px] flex justify-between"><span>NIBP</span><span>mmHg</span></div>
            <div className={`${large ? 'text-3xl' : 'text-base'} font-bold leading-none tabular-nums`}>
              {d.nibp.measuring ? <span className="text-slate-400 text-xs">measuring…</span> : nibp === 'fail' ? '---/---' : nibp ? `${nibp.sbp}/${nibp.dbp}` : '--/--'}
            </div>
            {nibp && nibp !== 'fail' && !d.nibp.measuring && <div className="text-[10px] text-slate-400">({nibp.map})</div>}
          </div>
        )}
        <div className="text-[10px] text-slate-400 space-y-0.5">
          <div className={d.charge === 'charging' ? 'text-amber-300' : d.charge === 'charged' ? 'text-amber-300 font-bold' : ''}>
            {d.energy} J {d.charge === 'charging' ? 'charging…' : d.charge === 'charged' ? 'READY' : ''}
          </div>
          {elapsed !== null && <div>Code {fmt(elapsed)} · shocks {d.shocks}</div>}
          {d.cpr.on && <div className={cprFor >= 120000 ? 'text-amber-300 font-bold' : ''}>CPR {fmt(cprFor)}{cprFor >= 120000 ? ' — rhythm check' : ''}</div>}
          {epiAgo !== null && <div className={epiAgo >= 180000 ? 'text-amber-300' : ''}>Epi {fmt(epiAgo)} ago{epiAgo >= 180000 ? ' — due' : ''}</div>}
        </div>
      </div>
    </div>
  );
}

function Unplugged({ top, large, children }: { top: string; large: boolean; children: React.ReactNode }) {
  return (
    <div className={`absolute left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 font-mono whitespace-nowrap ${large ? 'text-base' : 'text-[10px]'}`} style={{ top }}>
      {children}
    </div>
  );
}
