/**
 * What the built-in safety rules (rules/*.ts) read: the rhythm on the monitor, the pressure, what the case says the
 * patient has (Scenario.problems) and the drug groups the rules share. The engine's default responses use the same
 * helpers (engine.ts re-exports the ones it exported before). This file never imports engine.ts: only the kit, the types,
 * the ECG profiles and the reads.
 */
import { resolveProfile } from '@/lib/ecg/profiles';
import { READ_OPTIONS } from '../reads';
import { has, mapOf, paced } from '../kit';
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

/** A slow heart of its own: AV block (second or third degree) or a rate under 50, with a pulse and no pacer driving it */
export const slowOrBlocked = (s: SimState) => s.pulse && !paced(s) && (AV_BLOCKS.includes(rhythmKind(s)) || s.rhythm.hr < 50);

// ─── The arrest ────────────────────────────────────────────────────────────

/** A shock was delivered in this arrest (a SYNC shock that never fired, or an AED that advised none, is not one) */
export const shockedThisArrest = (s: SimState) =>
  s.timers.lastShockAt !== undefined && s.timers.arrestAt !== undefined && s.timers.lastShockAt >= s.timers.arrestAt;

/** The learner gave compressions in this arrest */
export const cprThisArrest = (s: SimState) => s.performed.some((p) => p.id === 'cpr' && p.minute >= (s.timers.arrestAt ?? 0));

// ─── What is coming ────────────────────────────────────────────────────────

/** A shock or a pacer is coming (a tachyarrhythmia, torsades, a rate under 50) or running: what procedural sedation is for */
export const procedureComing = (s: SimState) => tachyarrhythmia(s) || rhythmKind(s) === 'torsades' || s.rhythm.hr < 50 || paced(s);

/** The lab's arterial sheath is radial: the learner placed the radial sheath, or the case's sheath is in and not femoral */
export const radialSheath = (s: SimState) => did(s, 'access') || (has(s, 'access') && !has(s, 'femoral'));

/** A STEMI now: one was seen on a recorded 12-lead (the flag 'ecg-stemi'), or the rhythm on the monitor shows one */
export const stemiNow = (s: SimState) => has(s, 'ecg-stemi') || profileShowsStemi(s.rhythm.profile);

/**
 * The minute of the latest earlier performance of any of `ids` at or after `since`, or null. The engine judges an action
 * (harmsFor) before it records it, so the action being judged is not counted: "too soon after the last dose" reads this.
 */
export function lastDoneAt(s: SimState, ids: string[], since = -Infinity): number | null {
  for (let i = s.performed.length - 1; i >= 0; i--) {
    const p = s.performed[i];
    if (p.minute < since) return null;
    if (ids.includes(p.id)) return p.minute;
  }
  return null;
}

// ─── Drug groups ───────────────────────────────────────────────────────────
// Some ids are actions still to come (an action no case offers yet): a rule that lists them is ready for it.

/** Adenosine by rapid IV push (3 mg is the first dose with a transplanted heart, dipyridamole or carbamazepine) */
export const ADENOSINE_PUSH = ['adenosine3', 'adenosine6', 'adenosine12'];
export const IV_BETA_BLOCKERS = ['metoprolol', 'esmolol', 'labetalol'];
export const BETA_BLOCKERS = [...IV_BETA_BLOCKERS, 'metoprolol-po'];
/** Drugs that slow or block the AV node: in pre-excited AF they send every impulse down the pathway */
export const AV_NODAL_BLOCKERS = [...ADENOSINE_PUSH, 'diltiazem', ...BETA_BLOCKERS, 'amio-infusion'];
/** Antiplatelet, anticoagulant and fibrinolytic drugs (an aortic dissection bleeds with them) */
export const ANTITHROMBOTICS = ['aspirin', 'heparin', 'p2y12', 'bivalirudin', 'gp2b3a', 'cangrelor'];
/** The fibrinolytics */
export const LYTICS = ['tnk', 'alteplase'];
/** Sublingual nitroglycerin: 0.4 mg, the patient's own, and 0.8 mg */
export const NITRATES_SL = ['nitro', 'nitro-high', 'nitro-assist'];
/** Every nitroglycerin for a coronary patient: sublingual, intracoronary and the IV infusion */
export const NITRATES_ACS = [...NITRATES_SL, 'ic-nitro', 'nitro-iv'];
/** …and the radial cocktail, which carries nitroglycerin too */
export const NITRATES_ALL = [...NITRATES_ACS, 'radial-cocktail'];
/** Nitric oxide donors: every nitrate, and nitroprusside */
export const NO_DONORS = [...NITRATES_ALL, 'ic-nitroprusside'];
export const CALCIUMS = ['calcium-chloride', 'calcium-gluconate'];
