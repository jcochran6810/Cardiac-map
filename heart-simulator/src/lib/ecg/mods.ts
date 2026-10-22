/**
 * Drug effects layered on a rhythm profile: what a medication does to each beat's intervals and waves.
 *
 * `src/lib/sim/meds.ts` decides which modifiers a drug applies and when; the ECG engine rebuilds the rhythm
 * from the next beat whenever the effective modifiers change, so the effect appears on the live 12-lead (and
 * in the PR / QRS / QT readouts) as it happens. Several drugs combine: lengthening adds up, factors multiply.
 */
import { QRS_TEMPLATES, type ECGProfile } from './profiles';
import { norm, type Vec3 } from './vector';

export interface RhythmMods {
  /** added to the PR interval of conducted beats, ms (AV-nodal blockers lengthen it, atropine shortens it) */
  prAdd?: number;
  /** multiplies the QRS duration (sodium-channel blockers widen it; calcium narrows a hyperkalaemic QRS) */
  qrsWiden?: number;
  /** added to the corrected QT, ms */
  qtcAdd?: number;
  /** multiplies the T-wave amplitude */
  tScale?: number;
  /** multiplies the ST injury current (reperfusion resolves ST elevation) */
  stScale?: number;
  /** "digoxin effect": sagging ST depression wherever the T wave is upright, mV */
  scoop?: number;
  /** every P wave blocked at the AV node: P waves without QRS complexes (adenosine) */
  avBlock?: boolean;
}

/** Several drugs at once: added times add up, factors multiply */
export function combineMods(list: readonly (RhythmMods | null | undefined)[]): RhythmMods | null {
  const out: RhythmMods = {};
  for (const m of list) {
    if (!m) continue;
    if (m.prAdd) out.prAdd = (out.prAdd ?? 0) + m.prAdd;
    if (m.qtcAdd) out.qtcAdd = (out.qtcAdd ?? 0) + m.qtcAdd;
    if (m.scoop) out.scoop = (out.scoop ?? 0) + m.scoop;
    if (m.qrsWiden !== undefined && m.qrsWiden !== 1) out.qrsWiden = (out.qrsWiden ?? 1) * m.qrsWiden;
    if (m.tScale !== undefined && m.tScale !== 1) out.tScale = (out.tScale ?? 1) * m.tScale;
    if (m.stScale !== undefined && m.stScale !== 1) out.stScale = (out.stScale ?? 1) * m.stScale;
    if (m.avBlock) out.avBlock = true;
  }
  return Object.keys(out).length ? out : null;
}

/** A short key that changes whenever the modifiers do (the engine rebuilds the rhythm when it changes) */
export function modsKey(m: RhythmMods | null | undefined): string {
  if (!m) return '';
  const r = (x?: number) => (x === undefined ? '' : String(Math.round(x * 1000) / 1000));
  return `pr${r(m.prAdd)}|w${r(m.qrsWiden)}|q${r(m.qtcAdd)}|t${r(m.tScale)}|s${r(m.stScale)}|d${r(m.scoop)}|b${m.avBlock ? 1 : 0}`;
}

// Opposite to the normal T-wave vector, so the ST sags where the T wave is upright (II, V4–V6)
const SCOOP_DIR: Vec3 = norm([-0.5, 0.5, 0.7]);

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** The profile with the drug effects applied (the same object when there are none) */
export function applyMods(p: ECGProfile, m: RhythmMods | null | undefined): ECGProfile {
  if (!m) return p;
  const out: ECGProfile = { ...p };
  if (m.prAdd && p.pr > 0) out.pr = clamp(p.pr + m.prAdd, 90, 480);
  if (m.qrsWiden !== undefined) out.qrsWiden = clamp((p.qrsWiden ?? 1) * m.qrsWiden, 0.85, 2.2);
  if (m.qtcAdd) out.qtc = clamp(p.qtc + m.qtcAdd, 320, 680);
  if (m.tScale !== undefined) {
    const t = p.t ?? QRS_TEMPLATES[p.qrs]?.t;
    if (t) out.t = { ...t, mag: t.mag * m.tScale };
  }
  if ((m.stScale !== undefined && p.injury) || m.scoop) {
    const s = m.stScale ?? 1;
    const base: Vec3 = p.injury ? [p.injury[0] * s, p.injury[1] * s, p.injury[2] * s] : [0, 0, 0];
    const d = m.scoop ?? 0;
    out.injury = [base[0] + SCOOP_DIR[0] * d, base[1] + SCOOP_DIR[1] * d, base[2] + SCOOP_DIR[2] * d];
  }
  if (m.avBlock) out.avBlock = true;
  return out;
}

/** The changes in words, for the ECG interpretation box ("PR +30 ms", "QRS wider (×1.3)", …) */
export function describeMods(m: RhythmMods | null | undefined): string[] {
  if (!m) return [];
  const sign = (x: number) => (x > 0 ? `+${Math.round(x)}` : `−${Math.round(-x)}`);
  const out: string[] = [];
  if (m.avBlock) out.push('AV block: P waves without QRS complexes');
  if (m.prAdd) out.push(`PR ${sign(m.prAdd)} ms`);
  if (m.qrsWiden !== undefined && Math.abs(m.qrsWiden - 1) > 0.02) out.push(`QRS ${m.qrsWiden > 1 ? 'wider' : 'narrower'} (×${Math.round(m.qrsWiden * 100) / 100})`);
  if (m.qtcAdd) out.push(`QTc ${sign(m.qtcAdd)} ms`);
  if (m.scoop) out.push('sagging ST depression (digoxin effect)');
  if (m.tScale !== undefined && Math.abs(m.tScale - 1) > 0.05) out.push(`T waves ${m.tScale < 1 ? 'flatter' : 'taller'}`);
  if (m.stScale !== undefined && m.stScale < 0.95) out.push('ST elevation resolving');
  return out;
}
