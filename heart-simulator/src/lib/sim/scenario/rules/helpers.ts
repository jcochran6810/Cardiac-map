/**
 * What the built-in safety rules (rules/*.ts) read: the rhythm on the monitor, the pressure, what the case says the
 * patient has (Scenario.problems) and the drug groups the rules share. The engine's default responses use the same
 * helpers (engine.ts re-exports the ones it exported before). This file never imports engine.ts: only the kit, the types,
 * the ECG profiles and the reads.
 */
import { resolveProfile } from '@/lib/ecg/profiles';
import { READ_OPTIONS } from '../reads';
import { has, mapOf } from '../kit';
import type { Problem, Scenario, SimState } from '../types';

// ─── The rhythm ────────────────────────────────────────────────────────────

export function rhythmKind(s: SimState) {
  return resolveProfile(s.rhythm.profile).rhythm;
}

/** Pulseless VF / VT / torsades */
export function shockable(s: SimState): boolean {
  const k = rhythmKind(s);
  return !s.pulse && (k === 'vf' || k === 'vt' || k === 'torsades');
}

/** Rhythms synchronized cardioversion treats (with a pulse and a fast rate): SVT, atrial fibrillation or flutter, monomorphic VT */
export const CARDIOVERTIBLE = ['svt', 'af', 'flutter', 'vt'];
export function tachyarrhythmia(s: SimState): boolean {
  return s.pulse && CARDIOVERTIBLE.includes(rhythmKind(s)) && s.rhythm.hr >= 100;
}

/** Second- and third-degree AV block */
export const AV_BLOCKS = ['wenckebach', 'mobitz2', 'chb'];

/** Atrial fibrillation conducted down an accessory pathway is on the monitor (the 'af-wpw' profile) */
export const preexcitedAf = (s: SimState) => s.pulse && !!resolveProfile(s.rhythm.profile).pathway;

/**
 * 12-lead patterns whose ST elevation meets STEMI criteria, so the cath lab is activated (a Takotsubo pattern looks the
 * same until the angiogram shows open arteries). A posterior STEMI is a STEMI equivalent: its ST elevation is in V7–V9,
 * and the mirror image in V1–V3 already calls for emergent reperfusion (2022 ACC chest pain pathway; 2025 ACC/AHA ACS)
 */
export const STEMI_READS = ['stemi-anterior', 'stemi-inferior', 'stemi-lateral', 'stemi-inferior-chb', 'stemi-posterior', 'takotsubo'];

/** A tracing of this rhythm meets STEMI criteria */
export function profileShowsStemi(profile: string): boolean {
  const read = READ_OPTIONS.find((o) => o.profiles?.includes(profile));
  return !!read && STEMI_READS.includes(read.id);
}

/**
 * A 12-lead recorded so far showed a STEMI (flag 'ecg-stemi', set as each tracing is recorded). The diagnostic tracing
 * decides: a later one that hides the ST elevation (paced beats, a new bundle branch block) does not open the artery,
 * so the patient still needs primary PCI (2025 ACC/AHA ACS guideline).
 */
export const ecgShowsStemi = (s: SimState) => has(s, 'ecg-stemi');

// ─── What was done ─────────────────────────────────────────────────────────

export const did = (s: SimState, id: string) => (s.counts[id] ?? 0) > 0;

// ─── What the case says the patient has ────────────────────────────────────

/** The case says the patient has at least one of these problems */
export function hasProblem(sc: Scenario, problems: Problem[]): boolean {
  return problems.some((p) => sc.problems?.includes(p));
}
export const CALCIUM_FOR: Problem[] = ['hyperkalemia', 'hypocalcemia', 'ccb-overdose', 'beta-blocker-overdose'];
export const BICARBONATE_FOR: Problem[] = ['hyperkalemia', 'metabolic-acidosis', 'sodium-channel-blocker-overdose'];

/**
 * A long QT: the case says so (Scenario.problems), the monitor shows torsades, or the rhythm on it has a QTc of 500 ms or
 * more (the 'long-qt' profile) — the drug rules read the tracing as well as the case
 */
export function longQt(s: SimState, sc: Scenario): boolean {
  return hasProblem(sc, ['long-qt']) || rhythmKind(s) === 'torsades' || resolveProfile(s.rhythm.profile).qtc >= 500;
}

// ─── The pressure ──────────────────────────────────────────────────────────

/**
 * An LVAD patient whose pump is perfusing (2025 AHA durable LVAD algorithm): no pulse to feel, so perfusion is judged — awake
 * (GCS 9 or more), or a Doppler MAP over 50. An unresponsive LVAD patient with a MAP of 50 or less is not perfusing: CPR and
 * BLS/ALS, the AED included, while the pump is checked. (Skin color, capillary refill and EtCO₂ are the case's to describe.)
 */
export const lvadPerfusing = (s: SimState) => s.pulse && !!s.lvad && (s.vitals.gcs >= 9 || mapOf(s.vitals) > 50);

/**
 * A low pressure for the drug and transport rules: a systolic under 90 — or, over a continuous-flow LVAD, whose systolic
 * means little, a Doppler MAP under 60 (the pump's low-flow range)
 */
export const lowPressure = (s: SimState) => (s.lvad ? mapOf(s.vitals) < 60 : s.vitals.sbp < 90);

// ─── Drug groups ───────────────────────────────────────────────────────────

/** Drugs that slow or block the AV node: in pre-excited AF they send every impulse down the pathway */
export const AV_NODAL_BLOCKERS = ['adenosine6', 'adenosine12', 'diltiazem', 'metoprolol', 'amio-infusion'];
/** Antiplatelet, anticoagulant and fibrinolytic drugs (an aortic dissection bleeds with them) */
export const ANTITHROMBOTICS = ['aspirin', 'heparin', 'p2y12', 'bivalirudin', 'gp2b3a', 'cangrelor'];
