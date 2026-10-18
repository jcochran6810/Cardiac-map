/** Small helpers for writing scenarios */
import type { Line, SimState } from './types';

export const has = (s: SimState, flag: string) => flag in s.flags;
export const count = (s: SimState, id: string) => s.counts[id] ?? 0;
/** shocks delivered so far (manual or AED) */
export const shocks = (s: SimState) => count(s, 'defib') + count(s, 'aed');
export const cprCycles = (s: SimState) => count(s, 'cpr');
export const interpret = (s: SimState) => s.role !== 1;

/** First minute any of these interventions was done (at or after a flag), or null */
export function firstDone(s: SimState, ids: string[], afterFlag?: string): number | null {
  const from = afterFlag ? s.flags[afterFlag] : -Infinity;
  if (from === undefined) return null;
  const hit = s.performed.find((p) => ids.includes(p.id) && p.minute >= from);
  return hit ? hit.minute : null;
}

/** Minute a flag was set, or null */
export const flagAt = (s: SimState) => (flag: string) => (flag in s.flags ? s.flags[flag] : null);

/** The later of several minutes, or null if any is missing */
export function allOf(...mins: (number | null)[]): number | null {
  return mins.some((m) => m === null) ? null : Math.max(...(mins as number[]));
}

export const line = (who: Line[0], text: string, tone?: Line[2]): Line => (tone ? [who, text, tone] : [who, text]);
