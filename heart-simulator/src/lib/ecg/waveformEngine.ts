/**
 * ECG Waveform Synthesis Engine
 *
 * Two layers:
 *  1. Beat morphology — a parameterised Gaussian model (P, Q, R, S, ST, T)
 *     expressed in real milliseconds relative to the beat start, with mild
 *     rate-dependent scaling (QT shortens as the rate rises).
 *  2. Rhythm scheduler — decides *when* beats happen and what each beat
 *     contains: regular sinus, irregularly-irregular AF, premature PVCs with
 *     a compensatory pause, Wenckebach PR prolongation with dropped beats,
 *     Mobitz II dropped beats, complete AV dissociation (independent P and
 *     QRS trains), flutter baselines, VF and torsades.
 *
 * Both the ECG canvas and the 3D heart read from `getBeatAt`, so the trace,
 * the playhead and the contraction of the model always agree.
 */

import { ECG_TIMING, REF_BEAT_MS, beatScaleForRR } from '@/lib/physiology/cycleTiming';

export interface WaveformParams {
  pAmplitude: number;
  pDuration: number;
  pOffset: number;
  qAmplitude: number;
  qDuration: number;
  qOffset: number;
  rAmplitude: number;
  rDuration: number;
  rOffset: number;
  sAmplitude: number;
  sDuration: number;
  sOffset: number;
  tAmplitude: number;
  tDuration: number;
  tOffset: number;
  stDeviation: number;
  baselineWander: number;
  noiseLevel: number;
}

// ─── Small deterministic helpers ─────────────────────────────────────

/** Gaussian pulse; `width` covers roughly ±3 sigma. */
function gaussian(t: number, amplitude: number, center: number, width: number): number {
  if (amplitude === 0 || width <= 0) return 0;
  const sigma = width / 6;
  const d = (t - center) / sigma;
  if (d > 4 || d < -4) return 0;
  return amplitude * Math.exp(-0.5 * d * d);
}

/** Deterministic hash → [0, 1). Same input always yields the same value. */
export function hash01(n: number): number {
  let x = Math.imul(n | 0, 0x9E3779B1) ^ 0x85EBCA6B;
  x = Math.imul(x ^ (x >>> 15), 0xC2B2AE35);
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

/** Smooth, scroll-stable noise sampled on a 4 ms lattice. */
function noiseAt(timeMs: number, level: number): number {
  if (level === 0) return 0;
  const cell = Math.floor(timeMs / 4);
  const f = (timeMs / 4) - cell;
  const a = hash01(cell) * 2 - 1;
  const b = hash01(cell + 1) * 2 - 1;
  return level * (a + (b - a) * f);
}

// ─── Lead morphology ─────────────────────────────────────────────────

/** Normal sinus rhythm for Lead II. Offsets/durations are fractions of REF_BEAT_MS. */
const NORMAL_SINUS_LEAD_II: WaveformParams = {
  pAmplitude: 0.15,
  pDuration: 0.08,
  pOffset: ECG_TIMING.pCenter,
  qAmplitude: -0.05,
  qDuration: 0.02,
  qOffset: ECG_TIMING.qCenter,
  rAmplitude: 1.0,
  rDuration: 0.04,
  rOffset: ECG_TIMING.rCenter,
  sAmplitude: -0.15,
  sDuration: 0.03,
  sOffset: ECG_TIMING.sCenter,
  tAmplitude: 0.3,
  tDuration: 0.12,
  tOffset: ECG_TIMING.tCenter,
  stDeviation: 0,
  baselineWander: 0,
  noiseLevel: 0.005,
};

/** Lead transformation factors relative to Lead II. */
const LEAD_TRANSFORMS: Record<string, Partial<WaveformParams>> = {
  'I':   { pAmplitude: 0.1, rAmplitude: 0.7, tAmplitude: 0.25 },
  'II':  {},
  'III': { pAmplitude: 0.05, rAmplitude: 0.5, sAmplitude: -0.1, tAmplitude: 0.15 },
  'aVR': { pAmplitude: -0.1, rAmplitude: -0.5, qAmplitude: -0.3, tAmplitude: -0.2 },
  'aVL': { pAmplitude: 0.05, rAmplitude: 0.4, sAmplitude: -0.2, tAmplitude: 0.1 },
  'aVF': { pAmplitude: 0.1, rAmplitude: 0.6, tAmplitude: 0.2 },
  'V1':  { pAmplitude: 0.1, rAmplitude: 0.3, sAmplitude: -0.8, tAmplitude: -0.15 },
  'V2':  { pAmplitude: 0.1, rAmplitude: 0.5, sAmplitude: -0.6, tAmplitude: 0.4 },
  'V3':  { pAmplitude: 0.08, rAmplitude: 0.7, sAmplitude: -0.4, tAmplitude: 0.35 },
  'V4':  { pAmplitude: 0.08, rAmplitude: 0.9, sAmplitude: -0.2, tAmplitude: 0.3 },
  'V5':  { pAmplitude: 0.08, rAmplitude: 0.85, sAmplitude: -0.1, tAmplitude: 0.25 },
  'V6':  { pAmplitude: 0.07, rAmplitude: 0.7, sAmplitude: -0.05, tAmplitude: 0.2 },
};

/**
 * Lead-specific overrides applied on top of a condition, so that regional
 * pathology (an anterior STEMI, an inferior STEMI, a Wellens pattern ...)
 * shows up in the correct leads with reciprocal changes elsewhere instead
 * of the same deviation in every lead.
 */
const REGIONAL_LEAD_MODIFIERS: Record<string, Record<string, Partial<WaveformParams>>> = {
  'anterior-stemi': {
    'V1': { stDeviation: 0.45, tAmplitude: 0.5 }, 'V2': { stDeviation: 0.6, tAmplitude: 0.7 },
    'V3': { stDeviation: 0.6, tAmplitude: 0.7 }, 'V4': { stDeviation: 0.45, tAmplitude: 0.55 },
    'V5': { stDeviation: 0.15, tAmplitude: 0.3 }, 'V6': { stDeviation: 0.05, tAmplitude: 0.25 },
    'I': { stDeviation: 0.05, tAmplitude: 0.25 }, 'aVL': { stDeviation: 0.1, tAmplitude: 0.15 },
    'II': { stDeviation: -0.15, tAmplitude: 0.2, qAmplitude: -0.05 }, 'III': { stDeviation: -0.2, tAmplitude: -0.1, qAmplitude: -0.05 },
    'aVF': { stDeviation: -0.18, tAmplitude: 0.05, qAmplitude: -0.05 }, 'aVR': { stDeviation: -0.1, tAmplitude: -0.2 },
  },
  'inferior-stemi': {
    'II': { stDeviation: 0.35, tAmplitude: 0.45 }, 'III': { stDeviation: 0.45, tAmplitude: 0.45 },
    'aVF': { stDeviation: 0.4, tAmplitude: 0.45 },
    'I': { stDeviation: -0.12, tAmplitude: -0.1 }, 'aVL': { stDeviation: -0.2, tAmplitude: -0.15 },
    'V1': { stDeviation: 0.0, tAmplitude: -0.15 }, 'V2': { stDeviation: -0.1, tAmplitude: 0.3 },
    'V3': { stDeviation: -0.05, tAmplitude: 0.3 }, 'V4': { stDeviation: 0, tAmplitude: 0.3 },
    'V5': { stDeviation: 0.05, tAmplitude: 0.25 }, 'V6': { stDeviation: 0.08, tAmplitude: 0.2 },
    'aVR': { stDeviation: -0.05, tAmplitude: -0.2 },
  },
  'lateral-stemi': {
    'I': { stDeviation: 0.3, tAmplitude: 0.4 }, 'aVL': { stDeviation: 0.35, tAmplitude: 0.35 },
    'V5': { stDeviation: 0.35, tAmplitude: 0.45 }, 'V6': { stDeviation: 0.35, tAmplitude: 0.4 },
    'II': { stDeviation: -0.08, tAmplitude: 0.2 }, 'III': { stDeviation: -0.2, tAmplitude: -0.1 },
    'aVF': { stDeviation: -0.15, tAmplitude: 0.05 },
    'V1': { stDeviation: -0.1, tAmplitude: -0.15 }, 'V2': { stDeviation: -0.1, tAmplitude: 0.3 },
    'V3': { stDeviation: 0, tAmplitude: 0.35 }, 'V4': { stDeviation: 0.1, tAmplitude: 0.3 }, 'aVR': { stDeviation: -0.05, tAmplitude: -0.2 },
  },
  'nstemi': {
    'V4': { stDeviation: -0.25, tAmplitude: -0.3 }, 'V5': { stDeviation: -0.28, tAmplitude: -0.35 },
    'V6': { stDeviation: -0.25, tAmplitude: -0.3 }, 'I': { stDeviation: -0.12, tAmplitude: -0.2 },
    'aVL': { stDeviation: -0.1, tAmplitude: -0.15 }, 'II': { stDeviation: -0.15, tAmplitude: -0.2 },
    'III': { stDeviation: -0.05, tAmplitude: 0.05 }, 'aVF': { stDeviation: -0.1, tAmplitude: -0.05 },
    'V1': { stDeviation: 0.05, tAmplitude: -0.15 }, 'V2': { stDeviation: 0.0, tAmplitude: 0.3 }, 'V3': { stDeviation: -0.1, tAmplitude: 0.2 },
    'aVR': { stDeviation: 0.15, tAmplitude: -0.2 },
  },
  'wellens': {
    'V2': { tAmplitude: -0.55, tDuration: 0.16, stDeviation: 0.02 }, 'V3': { tAmplitude: -0.6, tDuration: 0.16, stDeviation: 0.02 },
    'V4': { tAmplitude: -0.35, tDuration: 0.15 }, 'V1': { tAmplitude: -0.2 }, 'V5': { tAmplitude: -0.1 },
    'I': { tAmplitude: 0.2 }, 'II': { tAmplitude: 0.25 }, 'III': { tAmplitude: 0.1 }, 'aVF': { tAmplitude: 0.15 }, 'aVL': { tAmplitude: 0.05 }, 'V6': { tAmplitude: 0.15 }, 'aVR': { tAmplitude: -0.2 },
  },
  'pericarditis': {
    'aVR': { stDeviation: -0.15, tAmplitude: -0.2, pAmplitude: -0.08 },
    'V1': { stDeviation: 0.02, tAmplitude: -0.1 },
  },
  'rbbb': {
    'V1': { rAmplitude: 0.35, sAmplitude: -0.3, tAmplitude: -0.25, rDuration: 0.05 },
    'V2': { rAmplitude: 0.5, sAmplitude: -0.4, tAmplitude: -0.2 },
    'I': { sAmplitude: -0.3, sDuration: 0.06, tAmplitude: 0.2 }, 'V6': { sAmplitude: -0.3, sDuration: 0.06, tAmplitude: 0.2 },
    'V5': { sAmplitude: -0.28, sDuration: 0.06, tAmplitude: 0.2 }, 'aVL': { sAmplitude: -0.25, sDuration: 0.06 },
  },
  'lbbb': {
    'V1': { rAmplitude: 0.1, sAmplitude: -0.9, tAmplitude: 0.35, stDeviation: 0.15 },
    'V2': { rAmplitude: 0.15, sAmplitude: -0.9, tAmplitude: 0.4, stDeviation: 0.15 },
    'V3': { rAmplitude: 0.3, sAmplitude: -0.7, tAmplitude: 0.3, stDeviation: 0.1 },
    'V5': { rAmplitude: 1.0, sAmplitude: -0.05, tAmplitude: -0.35, stDeviation: -0.12 },
    'V6': { rAmplitude: 1.0, sAmplitude: 0, tAmplitude: -0.35, stDeviation: -0.12 },
    'I': { rAmplitude: 0.9, sAmplitude: 0, tAmplitude: -0.3, stDeviation: -0.1 },
    'aVL': { rAmplitude: 0.6, sAmplitude: 0, tAmplitude: -0.25, stDeviation: -0.08 },
  },
  'wpw': {
    'V1': { qAmplitude: 0.15, rAmplitude: 0.6, sAmplitude: -0.3 },
    'V2': { qAmplitude: 0.18, rAmplitude: 0.8, sAmplitude: -0.2 },
  },
  'aortic-stenosis': {
    'V1': { rAmplitude: 0.2, sAmplitude: -1.2, tAmplitude: 0.2, stDeviation: 0.08 },
    'V2': { rAmplitude: 0.3, sAmplitude: -1.2, tAmplitude: 0.3, stDeviation: 0.08 },
    'V3': { rAmplitude: 0.6, sAmplitude: -0.8, tAmplitude: 0.2 },
  },
  'lvh': {
    'V1': { rAmplitude: 0.2, sAmplitude: -1.2, tAmplitude: 0.2, stDeviation: 0.08 },
    'V2': { rAmplitude: 0.3, sAmplitude: -1.2, tAmplitude: 0.3, stDeviation: 0.08 },
    'V3': { rAmplitude: 0.6, sAmplitude: -0.8, tAmplitude: 0.2 },
  },
  'hcm': {
    'V1': { rAmplitude: 0.25, sAmplitude: -1.0, tAmplitude: 0.15 },
    'V2': { rAmplitude: 0.4, sAmplitude: -1.0, tAmplitude: 0.25 },
    'V5': { qAmplitude: -0.35, qDuration: 0.025 }, 'V6': { qAmplitude: -0.35, qDuration: 0.025 },
    'I': { qAmplitude: -0.25, qDuration: 0.025 }, 'aVL': { qAmplitude: -0.25, qDuration: 0.025 },
  },
  'asd': {
    'V1': { rAmplitude: 0.35, sAmplitude: -0.35, tAmplitude: -0.15, rDuration: 0.05 },
  },
  'mitral-stenosis': {
    'V1': { pAmplitude: -0.12, pDuration: 0.12 },
  },
  'hfpef': {
    'V1': { pAmplitude: -0.12, pDuration: 0.12 },
  },
  'mitral-regurgitation': {
    'V1': { pAmplitude: -0.1, pDuration: 0.12 },
  },
  'hyperkalemia': {
    'V1': { tAmplitude: 0.4, tDuration: 0.05 }, 'aVR': { tAmplitude: -0.5, tDuration: 0.05 },
  },
};

export function getLeadParams(lead: string, baseParams: WaveformParams = NORMAL_SINUS_LEAD_II): WaveformParams {
  const transforms = LEAD_TRANSFORMS[lead] || {};
  return { ...baseParams, ...transforms };
}

const paramsCache = new Map<string, WaveformParams>();

/** Params for a lead under a given profile (condition modifiers + regional lead overrides). */
export function getProfileLeadParams(lead: string, profileId: string, extra?: Partial<WaveformParams>): WaveformParams {
  const key = `${profileId}|${lead}`;
  let params = paramsCache.get(key);
  if (!params) {
    params = getLeadParams(lead);
    const mods = CONDITION_MODIFIERS[profileId];
    if (mods) Object.assign(params, mods);
    const regional = REGIONAL_LEAD_MODIFIERS[profileId]?.[lead];
    if (regional) Object.assign(params, regional);
    paramsCache.set(key, params);
  }
  if (extra) return { ...params, ...extra };
  return params;
}

// ─── Beat morphology in real time ────────────────────────────────────

export interface BeatShapeOptions {
  /** Rate scale factor (see beatScaleForRR). */
  scale: number;
  hasP: boolean;
  hasQRS: boolean;
  /** Extra PR delay in ms (Wenckebach). */
  prExtraMs: number;
  /** Wide, bizarre ventricular complex (PVC / escape beat). */
  wideQRS: boolean;
}

const DEFAULT_SHAPE: BeatShapeOptions = { scale: 1, hasP: true, hasQRS: true, prExtraMs: 0, wideQRS: false };

/**
 * Sample the waveform of one beat at `uMs` milliseconds after the beat start.
 * Returns 0 outside the beat's events, so beats can simply be summed.
 */
export function beatSampleMs(uMs: number, params: WaveformParams, opt: BeatShapeOptions = DEFAULT_SHAPE): number {
  const k = REF_BEAT_MS * opt.scale; // ms per normalized unit
  const t = uMs / k;                 // normalized time within this beat
  if (t < 0 || t > 1.4) return 0;
  let v = 0;

  if (opt.hasP) {
    v += gaussian(t, params.pAmplitude, params.pOffset, params.pDuration);
  }

  if (opt.hasQRS) {
    const shift = opt.prExtraMs / k;
    const widen = opt.wideQRS ? 2.2 : 1;
    const qOff = params.qOffset + shift;
    const rOff = params.rOffset + shift + (opt.wideQRS ? 0.02 : 0);
    const sOff = params.sOffset + shift + (opt.wideQRS ? 0.05 : 0);
    const tOff = params.tOffset + shift + (opt.wideQRS ? 0.05 : 0);
    const rAmp = opt.wideQRS ? params.rAmplitude * 1.15 : params.rAmplitude;
    const sAmp = opt.wideQRS ? Math.min(params.sAmplitude, -0.45) : params.sAmplitude;
    const tAmp = opt.wideQRS ? -Math.abs(params.tAmplitude) * 1.3 : params.tAmplitude;

    v += gaussian(t, opt.wideQRS ? 0 : params.qAmplitude, qOff, params.qDuration);
    v += gaussian(t, rAmp, rOff, params.rDuration * widen);
    v += gaussian(t, sAmp, sOff, params.sDuration * widen);

    // ST segment: a broad, low Gaussian between the end of S and the start of T
    const stStart = sOff + (params.sDuration * widen) / 2;
    const stEnd = tOff - params.tDuration / 2;
    const stWidth = stEnd - stStart;
    if (stWidth > 0) {
      v += gaussian(t, params.stDeviation, (stStart + stEnd) / 2, stWidth * 1.4);
    }

    v += gaussian(t, tAmp, tOff, params.tDuration);
  }

  return v;
}

// ─── Rhythm scheduler ────────────────────────────────────────────────

export type RhythmKind =
  | 'regular'
  | 'afib'
  | 'aflutter'
  | 'pvcs'
  | 'mobitz-i'
  | 'mobitz-ii'
  | 'complete-block'
  | 'vfib'
  | 'torsades'
  | 'vt';

export const PROFILE_RHYTHM: Record<string, RhythmKind> = {
  'atrial-fibrillation': 'afib',
  'afib': 'afib',
  'atrial-flutter': 'aflutter',
  'aflutter': 'aflutter',
  'pvcs': 'pvcs',
  'mobitz-i': 'mobitz-i',
  'mobitz-ii': 'mobitz-ii',
  'third-degree-avb': 'complete-block',
  'ventricular-fibrillation': 'vfib',
  'vfib': 'vfib',
  'torsades': 'torsades',
  'vt': 'vt',
};

export function rhythmKindFor(profileId: string): RhythmKind {
  return PROFILE_RHYTHM[profileId] || 'regular';
}

export interface BeatInfo {
  index: number;
  startMs: number;
  rrMs: number;
  scale: number;
  hasP: boolean;
  hasQRS: boolean;
  prExtraMs: number;
  wideQRS: boolean;
  premature: boolean;
  /** Progress through the reference beat (can exceed 1 during long diastasis). */
  progress: number;
  /** Progress through the actual RR interval (0..1). */
  rrProgress: number;
  /** Progress of the independent atrial train (complete block) — else equals progress. */
  atrialProgress: number;
  fibrillating: boolean;
}

/** Bounded jitter (fraction of RR) for beat i under a rhythm. */
function jitterFor(kind: RhythmKind, i: number): number {
  switch (kind) {
    case 'afib':
      return (hash01(i * 7 + 13) - 0.5) * 0.5; // ±0.25 RR → irregularly irregular
    case 'pvcs':
      // every 4th beat fires early; the following sinus beat is on time → compensatory pause
      return i % 4 === 3 ? -0.38 : 0;
    case 'torsades':
      return (hash01(i * 3 + 5) - 0.5) * 0.12;
    default:
      return 0;
  }
}

function beatStartMs(kind: RhythmKind, i: number, rrMs: number): number {
  return i * rrMs + jitterFor(kind, i) * rrMs;
}

/** Atrial rate used for the independent P-wave train in complete heart block. */
export const COMPLETE_BLOCK_ATRIAL_RATE = 78;

/**
 * Locate the beat that contains `timeMs` for a rhythm at a nominal rate.
 * O(1): beat starts are `i*RR + jitter(i)*RR` with bounded jitter, so only
 * the neighbours of floor(t / RR) need checking.
 */
export function getBeatAt(timeMs: number, profileId: string, heartRate: number): BeatInfo {
  const kind = rhythmKindFor(profileId);
  const hr = Math.max(20, heartRate);
  const rrMs = (60 / hr) * 1000;

  if (kind === 'vfib') {
    const idx = Math.floor(timeMs / rrMs);
    const p = (timeMs - idx * rrMs) / rrMs;
    return {
      index: idx, startMs: idx * rrMs, rrMs, scale: 1,
      hasP: false, hasQRS: false, prExtraMs: 0, wideQRS: true, premature: false,
      progress: p, rrProgress: p, atrialProgress: 2, fibrillating: true,
    };
  }

  const i0 = Math.floor(timeMs / rrMs);
  let index = i0 - 1;
  for (const cand of [i0 - 1, i0, i0 + 1]) {
    if (beatStartMs(kind, cand, rrMs) <= timeMs) index = cand;
  }
  const startMs = beatStartMs(kind, index, rrMs);
  const nextStart = beatStartMs(kind, index + 1, rrMs);
  const actualRR = nextStart - startMs;
  const scale = beatScaleForRR(actualRR);

  let hasP = true;
  let hasQRS = true;
  let prExtraMs = 0;
  let wideQRS = false;
  let premature = false;

  switch (kind) {
    case 'afib':
    case 'aflutter':
      hasP = false; // P waves replaced by f / F waves drawn as a baseline
      break;
    case 'pvcs':
      if (((index % 4) + 4) % 4 === 3) { hasP = false; wideQRS = true; premature = true; }
      break;
    case 'mobitz-i': {
      const c = ((index % 4) + 4) % 4;      // 4-beat Wenckebach cycle: 3 conducted, 1 dropped
      if (c === 3) hasQRS = false;
      else prExtraMs = c * 70;              // PR lengthens 0 → 70 → 140 ms
      break;
    }
    case 'mobitz-ii': {
      const c = ((index % 3) + 3) % 3;      // 3:2 conduction
      if (c === 2) hasQRS = false;
      break;
    }
    case 'complete-block':
      hasP = false;                          // P train is independent, drawn separately
      wideQRS = true;
      break;
    case 'vt':
    case 'torsades':
      hasP = false;
      wideQRS = true;
      break;
    default:
      break;
  }

  const u = timeMs - startMs;
  const progress = u / (REF_BEAT_MS * scale);
  const rrProgress = u / actualRR;

  let atrialProgress = progress;
  if (kind === 'complete-block') {
    const rrA = (60 / COMPLETE_BLOCK_ATRIAL_RATE) * 1000;
    const uA = ((timeMs % rrA) + rrA) % rrA;
    atrialProgress = uA / (REF_BEAT_MS * beatScaleForRR(rrA));
  } else if (!hasP) {
    atrialProgress = 2; // no organised atrial activity
  }

  return {
    index, startMs, rrMs: actualRR, scale, hasP, hasQRS, prExtraMs, wideQRS, premature,
    progress, rrProgress, atrialProgress, fibrillating: false,
  };
}

// ─── Special baselines ───────────────────────────────────────────────

/** Fibrillatory (f-wave) baseline for atrial fibrillation. */
export function afibBaselineAt(timeMs: number): number {
  const t = timeMs / 1000;
  return 0.03 * Math.sin(2 * Math.PI * 6.3 * t + 1.1) +
    0.022 * Math.sin(2 * Math.PI * 7.9 * t + 0.4) +
    0.016 * Math.sin(2 * Math.PI * 10.4 * t + 2.0) +
    0.01 * Math.sin(2 * Math.PI * 4.7 * t);
}

/** Sawtooth flutter (F-wave) baseline at ~300/min, negative in the inferior leads. */
export function flutterBaselineAt(timeMs: number, flutterRate: number = 300, sign: number = -1): number {
  const cycle = ((timeMs / 1000) * (flutterRate / 60)) % 1;
  // Steep deflection then gradual recovery — classic sawtooth
  const shaped = cycle < 0.3 ? 1 - cycle / 0.3 : (cycle - 0.3) / 0.7;
  return sign * 0.22 * (shaped - 0.5);
}

/** Chaotic ventricular fibrillation waveform. */
export function vfibAt(timeMs: number): number {
  const t = timeMs / 1000;
  const modulation = 0.6 + 0.4 * Math.sin(2 * Math.PI * 0.8 * t);
  const f1 = 3.5 + 1.5 * Math.sin(2 * Math.PI * 0.3 * t);
  const f2 = 5.5 + 2.0 * Math.sin(2 * Math.PI * 0.5 * t);
  const f3 = 8.0 + 3.0 * Math.sin(2 * Math.PI * 0.15 * t);
  return modulation * (
    0.45 * Math.sin(2 * Math.PI * f1 * t) +
    0.3 * Math.sin(2 * Math.PI * f2 * t + 1.2) +
    0.15 * Math.sin(2 * Math.PI * f3 * t + 2.8) +
    0.08 * Math.sin(t * 47.3) * Math.cos(t * 23.1)
  );
}

// ─── Public sampling API ─────────────────────────────────────────────

const FLUTTER_NEGATIVE_LEADS = new Set(['II', 'III', 'aVF']);
const FLUTTER_POSITIVE_LEADS = new Set(['V1', 'aVR']);

/**
 * Sample the ECG for `lead` under `profileId` at absolute `timeMs`.
 * `extra` allows the caller to override params (e.g. compare mode).
 */
export function sampleECG(
  timeMs: number,
  lead: string,
  profileId: string,
  heartRate: number,
  extra?: Partial<WaveformParams>,
): number {
  const kind = rhythmKindFor(profileId);
  const params = getProfileLeadParams(lead, profileId, extra);

  if (kind === 'vfib') {
    return vfibAt(timeMs) + noiseAt(timeMs, params.noiseLevel);
  }

  const beat = getBeatAt(timeMs, profileId, heartRate);
  let v = beatSampleMs(timeMs - beat.startMs, params, {
    scale: beat.scale, hasP: beat.hasP, hasQRS: beat.hasQRS, prExtraMs: beat.prExtraMs, wideQRS: beat.wideQRS,
  });

  // The T wave of the previous beat can spill into the current beat at fast
  // rates or after a premature beat, so add the tail of the previous beat.
  const nominalRR = (60 / Math.max(20, heartRate)) * 1000;
  const prevStart = beatStartMs(kind, beat.index - 1, nominalRR);
  const prevU = timeMs - prevStart;
  if (prevU < REF_BEAT_MS * 1.4) {
    const prevBeat = getBeatAt(prevStart + 1, profileId, heartRate);
    v += beatSampleMs(prevU, params, {
      scale: prevBeat.scale, hasP: false, hasQRS: prevBeat.hasQRS, prExtraMs: prevBeat.prExtraMs, wideQRS: prevBeat.wideQRS,
    });
  }

  switch (kind) {
    case 'afib':
      v += afibBaselineAt(timeMs + lead.length * 37);
      break;
    case 'aflutter': {
      const sign = FLUTTER_NEGATIVE_LEADS.has(lead) ? -1 : FLUTTER_POSITIVE_LEADS.has(lead) ? 1 : -0.4;
      v += flutterBaselineAt(timeMs, 300, sign);
      break;
    }
    case 'complete-block': {
      // Independent atrial train
      const rrA = (60 / COMPLETE_BLOCK_ATRIAL_RATE) * 1000;
      const uA = ((timeMs % rrA) + rrA) % rrA;
      v += beatSampleMs(uA, params, { scale: beatScaleForRR(rrA), hasP: true, hasQRS: false, prExtraMs: 0, wideQRS: false });
      break;
    }
    case 'torsades': {
      const envelope = 0.25 + 0.75 * Math.abs(Math.sin(2 * Math.PI * 0.45 * (timeMs / 1000)));
      v *= envelope;
      break;
    }
    default:
      break;
  }

  // Baseline wander + noise
  if (params.baselineWander) v += params.baselineWander * Math.sin(2 * Math.PI * 0.3 * (timeMs / 1000));
  v += noiseAt(timeMs + lead.length * 101, params.noiseLevel);
  return v;
}

// ─── Legacy helpers (normalized-time API kept for callers/tests) ─────

/** Generate a single beat waveform sample at normalized time t (0..1 within one RR interval). */
export function generateBeatSample(t: number, params: WaveformParams): number {
  return beatSampleMs(t * REF_BEAT_MS, params, DEFAULT_SHAPE);
}

/** Generate a full ECG strip as an array of samples. */
export function generateECGStrip(
  lead: string,
  heartRate: number,
  durationSeconds: number,
  sampleRate: number = 500,
  conditionModifiers?: Partial<WaveformParams>,
  profileId: string = 'normal-sinus',
): number[] {
  const totalSamples = Math.floor(durationSeconds * sampleRate);
  const samples: number[] = new Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    samples[i] = sampleECG((i / sampleRate) * 1000, lead, profileId, heartRate, conditionModifiers);
  }
  return samples;
}

export function generateAFibSample(t: number, params: WaveformParams): number {
  return beatSampleMs(t * REF_BEAT_MS, { ...params, pAmplitude: 0 }) + afibBaselineAt(t * REF_BEAT_MS);
}

export function generateVFibSample(t: number): number {
  return vfibAt(t * 1000);
}

export function generateFlutterBaseline(t: number, flutterRate: number = 300): number {
  return flutterBaselineAt(t * 1000, flutterRate, -1);
}

/**
 * Condition modifier presets — morphology parameters for each condition.
 * These are applied to every lead; regional patterns are refined in
 * REGIONAL_LEAD_MODIFIERS above.
 */
export const CONDITION_MODIFIERS: Record<string, Partial<WaveformParams>> = {
  // ─── Normal / Sinus variants ──────────────────────────────────
  'normal-sinus': {},
  'sinus-bradycardia': { tAmplitude: 0.35, tDuration: 0.14 },
  'sinus-tachycardia': { pAmplitude: 0.18, tAmplitude: 0.22, tDuration: 0.09 },

  // ─── Atrial arrhythmias ───────────────────────────────────────
  'atrial-fibrillation': { pAmplitude: 0, noiseLevel: 0.012 },
  'afib': { pAmplitude: 0, noiseLevel: 0.012 },
  'atrial-flutter': { pAmplitude: 0, noiseLevel: 0.006 },
  'aflutter': { pAmplitude: 0, noiseLevel: 0.006 },
  // AVNRT: retrograde P buried in / just after the QRS (pseudo-S in II, pseudo-r' in V1)
  'avnrt': { pAmplitude: -0.06, pOffset: 0.40, pDuration: 0.025, rAmplitude: 0.9, noiseLevel: 0.008 },
  // WPW: short PR, delta wave (slurred upstroke), wide QRS, secondary ST-T changes
  'wpw': { pOffset: 0.18, rOffset: 0.29, rDuration: 0.07, qAmplitude: 0.12, qDuration: 0.05, qOffset: 0.235, stDeviation: -0.06, tAmplitude: -0.15 },

  // ─── AV blocks ────────────────────────────────────────────────
  // 1st degree: PR > 200 ms — P moved earlier relative to the QRS
  'first-degree-avb': { pOffset: 0.08, pAmplitude: 0.15 },
  'mobitz-i': { pOffset: 0.14, pAmplitude: 0.15 },
  'mobitz-ii': { pOffset: 0.13, pAmplitude: 0.15, rDuration: 0.055 },
  // 3rd degree: escape rhythm — wide slow QRS, P train drawn independently
  'third-degree-avb': { pAmplitude: 0.12, rAmplitude: 0.55, rDuration: 0.07, sAmplitude: -0.3, tAmplitude: -0.22 },

  // ─── Bundle branch blocks ────────────────────────────────────
  'rbbb': { rDuration: 0.07, sDuration: 0.055, sAmplitude: -0.38, tAmplitude: -0.18 },
  'lbbb': { rDuration: 0.09, qAmplitude: 0, sAmplitude: -0.48, tAmplitude: -0.38, stDeviation: -0.1 },
  'bifascicular': { rDuration: 0.07, sDuration: 0.055, sAmplitude: -0.38, tAmplitude: -0.15 },

  // ─── Ventricular arrhythmias ──────────────────────────────────
  'pvcs': { noiseLevel: 0.008 },
  'vt': { rAmplitude: 1.3, sAmplitude: -0.6, tAmplitude: -0.48, stDeviation: 0.06, noiseLevel: 0.01 },
  'ventricular-fibrillation': {},
  'vfib': {},
  'torsades': { rAmplitude: 1.0, sAmplitude: -0.5, tAmplitude: -0.32, noiseLevel: 0.02 },

  // ─── Ischemia / MI (regional detail in REGIONAL_LEAD_MODIFIERS) ──
  'anterior-stemi': { stDeviation: 0.3, tAmplitude: 0.45, tDuration: 0.14, qAmplitude: -0.12 },
  'inferior-stemi': { stDeviation: 0.2, tAmplitude: 0.35, tDuration: 0.13, qAmplitude: -0.08 },
  'lateral-stemi': { stDeviation: 0.15, tAmplitude: 0.3, tDuration: 0.12 },
  'nstemi': { stDeviation: -0.15, tAmplitude: -0.2, tDuration: 0.12 },
  'wellens': { tAmplitude: 0.2, stDeviation: 0.0, tDuration: 0.13 },

  // ─── Cardiomyopathies ────────────────────────────────────────
  'dcm': { rAmplitude: 0.42, qAmplitude: -0.12, tAmplitude: -0.2, rDuration: 0.065, noiseLevel: 0.01 },
  'hcm': { rAmplitude: 1.55, sAmplitude: -0.42, tAmplitude: -0.28, qAmplitude: -0.22, qDuration: 0.025, stDeviation: -0.06 },
  'takotsubo': { stDeviation: 0.28, tAmplitude: -0.38, tDuration: 0.16 },

  // ─── Heart failure ────────────────────────────────────────────
  'hfref': { rAmplitude: 0.5, rDuration: 0.07, tAmplitude: -0.2, pAmplitude: 0.2, pDuration: 0.1, noiseLevel: 0.01 },
  'hfpef': { pAmplitude: 0.24, pDuration: 0.12, rAmplitude: 1.3, tAmplitude: -0.12 },
  'cardiogenic-shock': { rAmplitude: 0.42, stDeviation: -0.15, tAmplitude: -0.25, noiseLevel: 0.02 },

  // ─── Valvular ────────────────────────────────────────────────
  'aortic-stenosis': { rAmplitude: 1.65, sAmplitude: -0.48, tAmplitude: -0.28, stDeviation: -0.1 },
  'mitral-regurgitation': { pAmplitude: 0.22, pDuration: 0.12, rAmplitude: 1.18 },
  'mitral-stenosis': { pAmplitude: 0.26, pDuration: 0.13, rAmplitude: 0.9 },

  // ─── Pericardial ─────────────────────────────────────────────
  'pericarditis': { stDeviation: 0.2, tAmplitude: 0.4, pAmplitude: 0.12 },
  'cardiac-tamponade': { rAmplitude: 0.32, pAmplitude: 0.04, noiseLevel: 0.012 },

  // ─── Congenital ──────────────────────────────────────────────
  'asd': { rDuration: 0.065, sDuration: 0.048, sAmplitude: -0.3, pAmplitude: 0.14 },
  'vsd': { rAmplitude: 1.38, sAmplitude: -0.4, pAmplitude: 0.16 },
  'pfo': {},

  // ─── Metabolic ───────────────────────────────────────────────
  'hyperkalemia': { tAmplitude: 0.68, tDuration: 0.05, pAmplitude: 0.04, rDuration: 0.07 },
  'lvh': { rAmplitude: 1.65, sAmplitude: -0.48, tAmplitude: -0.28, stDeviation: -0.1 },
};

/** Human-readable names for ECG profiles used in the UI. */
export const PROFILE_NAMES: Record<string, string> = {
  'normal-sinus': 'Normal Sinus Rhythm',
  'sinus-bradycardia': 'Sinus Bradycardia',
  'sinus-tachycardia': 'Sinus Tachycardia',
  'atrial-fibrillation': 'Atrial Fibrillation',
  'atrial-flutter': 'Atrial Flutter',
  'avnrt': 'AVNRT',
  'wpw': 'WPW Pre-excitation',
  'first-degree-avb': '1st Degree AV Block',
  'mobitz-i': 'Mobitz I (Wenckebach)',
  'mobitz-ii': 'Mobitz II',
  'third-degree-avb': '3rd Degree AV Block',
  'rbbb': 'Right Bundle Branch Block',
  'lbbb': 'Left Bundle Branch Block',
  'bifascicular': 'Bifascicular Block',
  'pvcs': 'Premature Ventricular Complexes',
  'vt': 'Monomorphic VT',
  'ventricular-fibrillation': 'Ventricular Fibrillation',
  'torsades': 'Torsades de Pointes',
  'anterior-stemi': 'Anterior STEMI',
  'inferior-stemi': 'Inferior STEMI',
  'lateral-stemi': 'Lateral STEMI',
  'nstemi': 'NSTEMI',
  'wellens': 'Wellens Pattern',
  'dcm': 'Dilated Cardiomyopathy',
  'hcm': 'Hypertrophic Cardiomyopathy',
  'takotsubo': 'Takotsubo',
  'hfref': 'HFrEF',
  'hfpef': 'HFpEF',
  'cardiogenic-shock': 'Cardiogenic Shock',
  'aortic-stenosis': 'Aortic Stenosis (LVH + strain)',
  'mitral-regurgitation': 'Mitral Regurgitation',
  'mitral-stenosis': 'Mitral Stenosis',
  'pericarditis': 'Acute Pericarditis',
  'cardiac-tamponade': 'Cardiac Tamponade',
  'asd': 'Atrial Septal Defect',
  'vsd': 'Ventricular Septal Defect',
  'pfo': 'Patent Foramen Ovale',
  'hyperkalemia': 'Hyperkalemia',
  'lvh': 'LV Hypertrophy',
};
