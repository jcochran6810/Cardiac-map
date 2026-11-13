/** Small helpers for writing scenarios */
import type { Line, SimState } from './types';

export const has = (s: SimState, flag: string) => flag in s.flags;
export const count = (s: SimState, id: string) => s.counts[id] ?? 0;
/** shocks delivered so far (manual or AED) */
export const shocks = (s: SimState) => count(s, 'defib') + count(s, 'aed');
export const cprCycles = (s: SimState) => count(s, 'cpr');
export const interpret = (s: SimState) => s.role !== 1;

/** Every action that puts defibrillation pads on the chest: a "pads on" item counts any of them */
export const PADS = ['pads', 'aed', 'defib', 'cardiovert', 'pace'];

/** The rhythm is driven by a pacer (transcutaneous pads or a transvenous wire), not by the heart's own rate */
export const paced = (s: SimState) => s.rhythm.profile === 'tcp' || s.rhythm.profile === 'paced';

/** The plain sinus rhythms, which are named by their rate */
const PLAIN_SINUS = ['sinus-bradycardia', 'normal-sinus', 'sinus-tachycardia'];

/**
 * The rhythm at a new rate: a plain sinus rhythm takes the name that rate has (bradycardia under 60, tachycardia over
 * 100, normal sinus between), so a sinus bradycardia sped to 74 reads as normal sinus rhythm; every other rhythm keeps its profile
 */
export function atRate(s: SimState, hr: number): { profile: string; hr: number } {
  if (!PLAIN_SINUS.includes(s.rhythm.profile)) return { profile: s.rhythm.profile, hr };
  return { profile: hr < 60 ? 'sinus-bradycardia' : hr > 100 ? 'sinus-tachycardia' : 'normal-sinus', hr };
}

/** mg/dL: a blood glucose under this is low (hypoglycemia), what oral glucose and IV dextrose treat */
export const LOW_GLUCOSE = 70;

/**
 * Awake enough to swallow and protect the airway: oral glucose (or anything by mouth) is safe. A GCS of 11 or more
 * stands in for "can follow commands and swallow"; below it the gel can be inhaled.
 */
export const canSwallow = (s: SimState) => s.pulse && s.vitals.gcs >= 11;

/**
 * EtCO₂ in cardiac arrest (mmHg) when the case gives no number of its own. A capnograph reads only what is breathed
 * out: with no breaths it reads almost nothing, however good the compressions (the air they move is less than the
 * dead space: Deakin et al., Resuscitation 2007). With breaths it follows the blood flow: compressions carry CO₂ to the
 * lungs, and with none almost nothing reaches them. One rule for the engine's capnography line and the case monitor
 * (useSimStore), both through arrestEtco2.
 */
export const ARREST_ETCO2 = { noBreaths: 3, cpr: 16, noFlow: 6 };

/** Someone is breathing for the patient: a bag-mask or an advanced airway */
export const ventilated = (s: Pick<SimState, 'flags'>) => 'ventilated' in s.flags || 'airway' in s.flags;

/** What the capnograph reads in cardiac arrest for a case that gives no number of its own (see ARREST_ETCO2) */
export function arrestEtco2(s: Pick<SimState, 'flags'>): number {
  if (!ventilated(s)) return ARREST_ETCO2.noBreaths;
  return 'cpr' in s.flags ? ARREST_ETCO2.cpr : ARREST_ETCO2.noFlow;
}

/**
 * A pulse can be felt, and a cuff (manual or NIBP) can read a pressure: a perfusing circulation that is not a
 * continuous-flow LVAD's. With an LVAD the patient can be awake and well perfused with neither.
 */
export const palpable = (s: Pick<SimState, 'pulse' | 'lvad'>) => s.pulse && !s.lvad;

/** Mean arterial pressure (mmHg) from a systolic and diastolic pressure: what a Doppler reads over a continuous-flow LVAD */
export const mapOf = (v: { sbp: number; dbp: number }) => Math.round((v.sbp + 2 * v.dbp) / 3);

/** The lowest pressure a patient with a pulse shows: below it the circulation would have stopped */
export const PERFUSING_FLOOR = { sbp: 50, dbp: 25 };

/**
 * mmHg: the narrowest pulse pressure kept over a continuous-flow LVAD (10 without one). The pump flows through systole and
 * diastole alike, so a case may author 80/76 for a Doppler MAP of 77 and it stays that way after the first action.
 */
export const LVAD_MIN_PULSE_PRESSURE = 2;

/**
 * The blood pressure after a drug or a bolus moves it, kept to what a living circulation can show: a fall stops at
 * the perfusing floor (repeated doses never reach zero or below), a rise stops at `ceiling`, and with no pulse there
 * is no pressure to move. Use the result for the vitals and for the text, so the monitor says what the patient has.
 */
export function bpAfter(s: SimState, dSbp: number, dDbp: number, ceiling = { sbp: 150, dbp: 90 }): { sbp: number; dbp: number } {
  const { sbp, dbp } = s.vitals;
  if (!s.pulse) return { sbp, dbp };
  // a fall never raises a pressure that is already low, and a rise never lowers one that is already high
  const move = (v: number, d: number, floor: number, top: number) => (d < 0 ? Math.min(v, Math.max(floor, v + d)) : Math.max(v, Math.min(top, v + d)));
  const nSbp = move(sbp, dSbp, PERFUSING_FLOOR.sbp, ceiling.sbp);
  const nDbp = Math.min(move(dbp, dDbp, PERFUSING_FLOOR.dbp, ceiling.dbp), nSbp - (s.lvad ? LVAD_MIN_PULSE_PRESSURE : 10));
  return { sbp: nSbp, dbp: Math.max(PERFUSING_FLOOR.dbp, nDbp) };
}

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
