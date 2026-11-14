/**
 * Built-in safety rules for the rhythm: shocks, cardioversion, the arrest drugs, pacing and the transvenous wire, atropine,
 * magnesium, the antiarrhythmic and rate drugs (diltiazem, procainamide, amiodarone, lidocaine, beta-blockers, adenosine)
 * and the cath lab's AV-nodal drugs (the radial cocktail, intracoronary adenosine and verapamil, the adenosine infusion for
 * an FFR).
 *
 * One dose, one penalty: for the drugs and shocks in LADDERS the rules are ranked, and only the highest-ranked rule whose
 * condition holds charges the dose (topRhythmRule). A case rule that stands in for that rule therefore covers the whole
 * dose — unless the case rule is minor and that rule a heavier, major one (yieldToHeavier), or the case rule was charged
 * already against this dose (on the same drug, or once a case: the gate then passes the dose on, rules/charge.ts
 * passedOver). Sources: the drug labels, 2025 AHA ALS (Part 9), 2018 ACC/AHA/HRS bradycardia, 2023 ACC/AHA/ACCP/HRS AF and
 * 2015 ACC/AHA/HRS SVT guidelines.
 */
import { resolveProfile } from '@/lib/ecg/profiles';
import { has, paced } from '../kit';
import type { Harm, Scenario, SimState } from '../types';
import {
  ADENOSINE_PUSH, AV_BLOCKS, AV_NODAL_BLOCKERS, BETA_BLOCKERS, IV_BETA_BLOCKERS, did, hasProblem, lastDoneAt, longQt, lowPressure,
  lvadPerfusing, preexcitedAf, rhythmKind, shockable, shockedThisArrest, slowOrBlocked, tachyarrhythmia,
} from './helpers';
import { NITRATE_RULES, carryNitrateRank, nitrateCharges } from './acs';
import { builtInChargedBefore, caseChargedBefore, coveredBefore, registerCondition } from './charge';
import { indicationCovered } from './scope';
import { pressorBridging } from './support';

/** The drugs that slow the AV node or the rate (and amiodarone's infusion), with the cath lab's intracoronary ones */
export const RATE_DRUGS = [
  ...BETA_BLOCKERS, 'diltiazem', ...ADENOSINE_PUSH, 'amio-infusion', 'ic-adenosine', 'ic-verapamil', 'radial-cocktail',
];
/** The cath lab's verapamil: intracoronary, or in the radial cocktail (with nitroglycerin and heparin) */
const VERAPAMIL = ['radial-cocktail', 'ic-verapamil'];
/** No sedation or analgesia yet: what a shock or a pacer needs first in an awake patient */
const unsedated = (s: SimState) => !has(s, 'sedation') && !has(s, 'analgesia') && !has(s, 'benzodiazepine');
/** Atrial fibrillation or flutter on the monitor (with a pulse) */
const afOrFlutter = (s: SimState) => s.pulse && ['af', 'flutter'].includes(rhythmKind(s));
/**
 * Unstable for an electrical cardioversion (2025 AHA tachycardia algorithm): a low pressure, an altered mind (GCS under
 * 14), acute heart failure — fluid on the lungs — or shock. Such a patient is cardioverted at once
 */
const unstable = (s: SimState, sc: Scenario) => lowPressure(s) || s.vitals.gcs < 14 || hasProblem(sc, ['pulmonary-edema', 'cardiogenic-shock']);
/**
 * A block below the AV node, where atropine does not reach: Mobitz II, or complete heart block with a wide escape. A
 * complete block with a narrow escape (an inferior MI's, at the AV node) often answers atropine
 */
const infranodalBlock = (s: SimState) =>
  rhythmKind(s) === 'mobitz2' || (rhythmKind(s) === 'chb' && resolveProfile(s.rhythm.profile).qrs !== 'normal');
/**
 * What IV magnesium is given for: torsades or a long QT, a proven low magnesium, a severe asthma attack or bronchospasm
 * (NAEPP, GINA) and the ventricular ectopy of digoxin toxicity
 */
const magnesiumIndicated = (s: SimState, sc: Scenario) =>
  longQt(s, sc) || hasProblem(sc, ['hypomagnesemia', 'asthma', 'bronchospasm', 'digoxin-toxicity']);
/**
 * An IV beta-blocker was given — by the learner, or by a teammate or the operator (the flag 'beta-blocker' a case sets; the
 * tablet sets it too, and the diltiazem label's warning is for the IV drugs together)
 */
export const ivBetaBlockerGiven = (s: SimState) => IV_BETA_BLOCKERS.some((b) => did(s, b)) || (has(s, 'beta-blocker') && !did(s, 'metoprolol-po'));
/** IV diltiazem was given, by the learner or a teammate (its flag) */
export const diltiazemGiven = (s: SimState) => did(s, 'diltiazem') || has(s, 'diltiazem');
/**
 * The signs of a risk of cardiogenic shock in an acute MI that rule out an early beta-blocker (2013 ACCF/AHA STEMI, kept by
 * the 2025 ACC/AHA ACS guideline; COMMIT): a systolic under 120, a sinus tachycardia over 110 or a rate under 60 (not a
 * pacer's), a PR of 0.24 s or more, or a heart minutes out of a cardiac arrest (the flag 'rosc')
 */
export const miShockRisk = (s: SimState) =>
  s.vitals.sbp < 120 || (rhythmKind(s) === 'sinus' && s.rhythm.hr > 110) || (!paced(s) && s.rhythm.hr < 60)
  || resolveProfile(s.rhythm.profile).pr >= 240 || has(s, 'rosc');
/**
 * A label contraindication of the rate drug itself holds for this dose: a slow rate or AV block (every drug of RATE_DRUGS),
 * a low pressure (the beta-blockers, diltiazem and verapamil), or IV diltiazem and an IV beta-blocker together. For a case
 * rule that judges the dose for another reason (e.g. lowering the pressure in a stroke) and steps aside here, so the
 * built-in rule charges the label's reason at its own weight (one dose, one penalty)
 */
export const rateDrugContraindicated = (s: SimState, id: string) =>
  RATE_DRUGS.includes(id) && s.pulse && (slowOrBlocked(s)
    || (lowPressure(s) && [...BETA_BLOCKERS, 'diltiazem', ...VERAPAMIL].includes(id))
    || (IV_BETA_BLOCKERS.includes(id) && diltiazemGiven(s)) || (id === 'diltiazem' && ivBetaBlockerGiven(s)));
/** Minutes from `t` to now (the clock moves in tenths: rounded, so that 3.8 − 1.8 is 2) */
const minutesSince = (s: SimState, t: number) => Math.round((s.minute - t) * 1000) / 1000;
/**
 * The CPR cycle that follows a shock delivered to VF or pulseless VT in this arrest, before a pulse check: the rhythm under
 * the compressions is not yet known, and the antiarrhythmic for shock-refractory VF is given then (2025 AHA)
 */
const cprCycleAfterShock = (s: SimState) =>
  shockedThisArrest(s) && minutesSince(s, s.timers.lastShockAt!) < 2 && lastDoneAt(s, ['pulse-check'], s.timers.lastShockAt) === null;
/** The rules as written, each with its own condition; the gate (LADDERS) is added below */
const RULES: Harm[] = [
  // ─── Shocks and cardioversion ──────────────────────────────────────────────
  // a manual shock fires whatever the rhythm; an AED is not applied to a patient with a pulse (the default refuses it). Two
  // shocks with a pulse are right: sustained polymorphic VT (torsades) is defibrillated, pulse or not (2025 AHA), and an
  // LVAD can keep a patient perfused through VF
  { id: 'shock-with-pulse', actions: ['defib'], when: (s) => s.pulse && rhythmKind(s) !== 'torsades' && !(s.lvad && (rhythmKind(s) === 'vf' || (rhythmKind(s) === 'vt' && !lvadPerfusing(s)))), points: 15, severity: 'critical', text: 'Unsynchronized shock to a patient with a pulse: it can land on the T wave and cause VF. An unstable tachycardia with a pulse gets synchronized cardioversion; any other rhythm with a pulse needs no shock at all.' },
  { id: 'shock-nonshockable', actions: ['defib', 'cardiovert'], when: (s) => !s.pulse && !shockable(s), points: 10, severity: 'major', text: 'Asystole and PEA are not shockable: shocking them interrupts CPR and does not help. Give CPR and epinephrine and look for reversible causes.' },
  { id: 'sync-in-arrest', actions: ['cardiovert'], when: (s) => shockable(s), points: 8, severity: 'major', text: 'Synchronized mode needs R waves; in VF or pulseless VT it may never fire. Defibrillate unsynchronized.' },
  { id: 'sync-polymorphic', actions: ['cardiovert'], when: (s) => s.pulse && rhythmKind(s) === 'torsades', points: 5, severity: 'major', text: 'Synchronized cardioversion for polymorphic VT. The device cannot lock onto the R waves of a twisting rhythm and may never fire: sustained torsades is defibrillated, unsynchronized, pulse or not (2025 AHA) — then IV magnesium.' },
  { id: 'cardiovert-no-tachycardia', actions: ['cardiovert'], when: (s) => s.pulse && !tachyarrhythmia(s) && rhythmKind(s) !== 'torsades', points: 8, severity: 'major', text: 'Synchronized cardioversion without a tachyarrhythmia to treat. It is for an unstable SVT, atrial fibrillation or flutter, or monomorphic VT; on any other rhythm the shock cannot help, and it hurts an awake patient.' },
  // a rhythm that is about to kill (an unstable patient) is still cardioverted, at the lowest energy
  { id: 'cardioversion-digoxin-toxicity', actions: ['cardiovert'], when: (s, sc) => s.pulse && hasProblem(sc, ['digoxin-toxicity']) && !unstable(s, sc), points: 8, severity: 'major', text: 'Electrical cardioversion of a digoxin-toxic heart that is holding its pressure. The shock can set off VT or VF that does not respond to further shocks (emergency medicine and toxicology references): treat the toxicity first — digoxin Fab and the potassium — with lidocaine or pacing for the arrhythmia, and cardiovert only a rhythm that is about to kill, at the lowest energy.' },
  // AF or flutter of 48 hours or more (or unknown onset) without 3 weeks of anticoagulation or a TEE: converting it,
  // electrically or with procainamide, can throw a clot from the left atrium. An unstable patient (pulmonary edema
  // included) is cardioverted at once; a drug that converts is never the answer for one
  { id: 'cardioversion-unanticoagulated', actions: ['cardiovert', 'procainamide'], when: (s, sc, id) => hasProblem(sc, ['af-over-48h']) && afOrFlutter(s) && (id === 'procainamide' || !unstable(s, sc)), points: 10, severity: 'major', text: 'Converting atrial fibrillation or flutter that has lasted 48 hours or more (or began at an unknown time) without anticoagulation. A clot may have formed in the left atrium, and restoring the rhythm — with a shock or with procainamide — can throw it out as a stroke: 3 weeks of anticoagulation, or a TEE that shows no clot, first (2023 ACC/AHA/ACCP/HRS AF guideline, COR 1). A stable patient gets rate control and anticoagulation; only an unstable one is cardioverted at once.' },
  // the same id as the cases that score it in their own words (svt, af-rvr, stable VT, WPW, unstable AF in the ED)
  { id: 'no-sedation', actions: ['cardiovert'], when: (s) => tachyarrhythmia(s) && s.vitals.gcs >= 14 && unsedated(s), points: 3, severity: 'minor', text: 'Synchronized cardioversion of an awake patient without sedation or analgesia. Sedate a conscious patient whenever there is time (2025 AHA) — a reduced dose of a drug that spares the pressure, with the airway kit ready.' },

  // ─── The arrest drugs ──────────────────────────────────────────────────────
  { id: 'arrest-epi-with-pulse', actions: ['epinephrine'], when: (s) => s.pulse, points: 15, severity: 'critical', text: '1 mg IV epinephrine is the cardiac-arrest dose. With a pulse it causes severe hypertension, arrhythmias and ischemia; use push-dose epinephrine or an infusion.' },
  // the same id as vf-arrest-field's
  { id: 'epi-before-shock', actions: ['epinephrine'], when: (s) => shockable(s) && !shockedThisArrest(s), points: 3, severity: 'minor', text: 'Epinephrine before the first shock in VF or pulseless VT. The shock comes first: every minute without one lowers the chance of survival, and epinephrine is given once shocks have failed — after the second (2025 AHA).' },
  // the same id as the PEA and the ED's VF arrest
  { id: 'epi-too-soon', actions: ['epinephrine'], when: (s) => !s.pulse && ((t) => t !== null && minutesSince(s, t) < 3)(lastDoneAt(s, ['epinephrine'], s.timers.arrestAt ?? 0)), points: 3, severity: 'minor', text: 'Epinephrine again within 3 minutes of the last dose. The arrest dose is 1 mg every 3–5 minutes (2025 AHA): sooner adds nothing to the arrest, only to the fast, irritable, oxygen-hungry heart that follows a return of circulation.' },
  // pre-excited AF is scored by av-blocker-preexcited-af (one mistake, one penalty)
  { id: 'arrest-amio-with-pulse', actions: ['amio-arrest'], when: (s) => s.pulse && !preexcitedAf(s), points: 10, severity: 'major', text: 'A 300 mg amiodarone push is for cardiac arrest. With a pulse, give 150 mg over 10 minutes.' },
  // the same id as torsades-field's
  { id: 'amiodarone-arrest-long-qt', actions: ['amio-arrest'], when: (s, sc) => !s.pulse && longQt(s, sc), points: 3, severity: 'minor', text: 'Amiodarone 300 mg in a torsades or long-QT arrest. It lengthens the QT further and can keep torsades going: defibrillate, give 2 g of IV magnesium, and correct the potassium (2025 AHA).' },
  // not in the CPR cycle right after a shock to VF: the rhythm under the compressions is not known until the next check
  { id: 'antiarrhythmic-nonshockable', actions: ['amio-arrest', 'lidocaine'], when: (s) => !s.pulse && !shockable(s) && !cprCycleAfterShock(s), points: 3, severity: 'minor', text: 'Amiodarone or lidocaine in PEA or asystole. They are for VF or pulseless VT that shocks have not fixed (2025 AHA): a rhythm that cannot be shocked gets CPR, epinephrine and a search for the cause.' },
  // the same id as wpw-af-field's. An indication rule (INDICATION_RULES): the ER nurse's missing order stands in for it
  { id: 'rate-drug-in-arrest', actions: [...ADENOSINE_PUSH, ...IV_BETA_BLOCKERS, 'diltiazem', 'amio-infusion', 'adenosine-iv-ffr'], when: (s) => !s.pulse, points: 3, severity: 'minor', text: 'A drug for a tachycardia with a pulse, given in cardiac arrest. Adenosine, beta-blockers, diltiazem and the 150 mg amiodarone infusion are not arrest drugs: CPR, a shock for VF or pulseless VT, epinephrine and — for shock-refractory VF — amiodarone 300 mg or lidocaine (2025 AHA).' },

  // ─── Pacing and the transvenous wire ───────────────────────────────────────
  // pads on standby over a paced heart (a temporary wire) are a backup, not a mistake
  { id: 'pace-not-slow', actions: ['pace'], when: (s) => s.pulse && s.rhythm.hr >= 50 && !paced(s), points: 5, severity: 'minor', text: 'Transcutaneous pacing without a slow heart rate to treat. Pacing is for symptomatic bradycardia (usually under 50/min) that atropine has not fixed.' },
  { id: 'pace-in-arrest', actions: ['pace'], when: (s) => !s.pulse, points: 5, severity: 'major', text: 'Pacing in cardiac arrest. It does not restart a heart in arrest and cannot treat VF: CPR, a shock for VF or pulseless VT, and epinephrine.' },
  // the same id as torsades-field's. A patient who is crashing is paced first: a low pressure, or one held up only by a
  // push-dose pressor given in the last minutes (the bridge to the pacer, rules/support.ts pressorBridging)
  { id: 'pace-no-analgesia', actions: ['pace'], when: (s, sc) => s.pulse && s.rhythm.hr < 50 && !paced(s) && s.vitals.gcs >= 13 && !lowPressure(s) && !pressorBridging(s, sc, 'push-epi') && unsedated(s), points: 2, severity: 'minor', text: 'Transcutaneous pacing of an awake patient, with a pressure that allows analgesia, and none given. Each paced beat jolts the chest wall: fentanyl or a small titrated sedative first (2025 AHA) — without delaying pacing in a patient who is crashing.' },
  // the emergency physician's invasive procedures need their indication (the cath lab's cases score their own). In the lab
  // a transvenous wire can be a backup on demand, so the rate rule is the department's only
  { id: 'temp-wire-not-slow', actions: ['temp-wire'], when: (s, sc) => sc.setting === 'ed' && s.pulse && s.rhythm.hr >= 50 && !paced(s), points: 5, severity: 'minor', text: 'A transvenous pacing wire without a slow heart rate to treat. It is for bradycardia (usually under 50/min) that drugs and the transcutaneous pacer cannot hold; with a faster rate it brings only its risks — a perforated ventricle, arrhythmias, a pneumothorax, bleeding and infection.' },
  // in the lab: a wire backs up a slow rhythm that has been on the monitor (the flag 'brady-seen'), not a heart that never slowed
  { id: 'temp-wire-no-indication', actions: ['temp-wire'], roles: [5], when: (s, sc) => sc.setting === 'cathlab' && s.pulse && !has(s, 'brady-seen') && !paced(s), points: 3, severity: 'minor', text: 'A transvenous pacing wire with no slow rhythm to back up. In the lab a wire is placed for a bradycardia or heart block that has happened; with a heart that has never slowed it brings only its risks — a perforated right ventricle and tamponade, arrhythmias, bleeding and infection.' },
  { id: 'temp-wire-without-pads', actions: ['temp-wire'], roles: [5, 7], when: (s) => !has(s, 'pads'), points: 5, severity: 'major', text: 'A transvenous pacing wire with no pads on. Crossing the tricuspid valve can set off VT, and a new wire can lose capture at any moment: pads on, with the transcutaneous pacer ready to take over, before the wire goes in.' },

  // ─── Atropine ──────────────────────────────────────────────────────────────
  // atropine is for symptomatic bradycardia. With a pulse: a rate of 60 or more has nothing for it to treat (over a pacer,
  // whose 70 hides a slow rate of the heart's own, it is still a fair try). In arrest: out of the algorithm since 2010
  { id: 'atropine-fast', actions: ['atropine'], when: (s) => s.pulse && s.rhythm.hr >= 60 && !paced(s), points: 3, severity: 'minor', text: 'Atropine with no slow heart rate to treat. It is for symptomatic bradycardia: with a normal or fast rate it has nothing to treat, and any speeding only adds to the heart\'s oxygen demand — in an acute MI that can worsen the ischemia.' },
  { id: 'atropine-in-arrest', actions: ['atropine'], when: (s) => !s.pulse, points: 3, severity: 'minor', text: 'Atropine in cardiac arrest. It has not been part of the cardiac arrest algorithm since 2010: routine atropine does not help PEA or asystole, and it does nothing for VF. CPR, epinephrine, a shock for VF or pulseless VT, and the reversible causes.' },
  { id: 'atropine-heart-transplant', actions: ['atropine'], when: (_s, sc) => hasProblem(sc, ['heart-transplant']), points: 8, severity: 'major', text: 'Atropine in a patient with a transplanted heart. The donor heart has no vagal nerve supply, so atropine cannot speed it, and it can cause a high-grade AV block or a sinus arrest (2018 ACC/AHA/HRS bradycardia guideline: 3 — Harm): pace, start an epinephrine infusion, or give aminophylline.' },
  // a block below the AV node (Mobitz II, complete heart block with a wide escape) still there after the first dose. A
  // narrow-escape complete block of an inferior MI sits at the AV node: a repeat dose (up to 3 mg) is fair there
  { id: 'atropine-infranodal-repeat', actions: ['atropine'], when: (s) => s.pulse && has(s, 'atropine') && infranodalBlock(s) && !paced(s), points: 3, severity: 'minor', text: 'Repeat atropine for a Mobitz II or a wide-escape complete heart block the first dose did not help. The block sits below the AV node, where atropine does not reach (2018 ACC/AHA/HRS bradycardia; 2025 AHA): pace, or start an epinephrine or dopamine infusion.' },

  // ─── Magnesium ─────────────────────────────────────────────────────────────
  { id: 'magnesium-routine-arrest', actions: ['magnesium-sulfate'], when: (s, sc) => !s.pulse && !longQt(s, sc), points: 3, severity: 'minor', text: 'Magnesium in a cardiac arrest without torsades. Routine magnesium does not help VF, pulseless VT, PEA or asystole; it is for torsades de pointes.' },
  // magnesium that is needed (torsades, a long QT, a low magnesium…) is still given, at a reduced dose
  { id: 'magnesium-renal-failure', actions: ['magnesium-sulfate'], when: (s, sc) => hasProblem(sc, ['renal-failure', 'dialysis']) && !magnesiumIndicated(s, sc), points: 5, severity: 'major', text: 'IV magnesium with failing kidneys and nothing it is needed for. The kidneys clear magnesium: with severe kidney disease or on dialysis it builds up — weakness, a falling pressure, heart block and slowed breathing (magnesium sulfate label: caution in renal impairment, at most 20 g in 48 hours when it is severe). For torsades or a proven low magnesium it is still given, at a reduced dose, with levels.' },
  // the same id as the beta-blocker overdose and the LVAD cases'. AF and flutter: magnesium is a fair adjunct for the rate
  { id: 'magnesium-no-indication', actions: ['magnesium-sulfate'], when: (s, sc) => s.pulse && !magnesiumIndicated(s, sc) && !['af', 'flutter'].includes(rhythmKind(s)), points: 3, severity: 'minor', text: 'IV magnesium with no torsades, long QT, low magnesium or severe bronchospasm to treat. It drops the pressure and slows conduction — its label rules parenteral magnesium out in heart block — and it does nothing for this rhythm.' },

  // ─── Vagal maneuvers ───────────────────────────────────────────────────────
  // the same id as the hyperkalemia cases'
  { id: 'vagal-slow', actions: ['vagal'], when: (s) => s.pulse && !paced(s) && (AV_BLOCKS.includes(rhythmKind(s)) || s.rhythm.hr < 60), points: 3, severity: 'minor', text: 'A vagal maneuver with a slow pulse. It slows the sinus and AV nodes further; it is for a regular narrow-complex tachycardia (2015 ACC/AHA/HRS SVT guideline).' },
  // an SVT is what it is for, unstable too: vagal maneuvers or adenosine may be tried first, so long as they do not delay the
  // shock (2015 ACC/AHA/HRS SVT: synchronized cardioversion when they are ineffective or not feasible, 1) — the case's timing
  // judges the delay
  { id: 'vagal-no-indication', actions: ['vagal'], when: (s) => s.pulse && !slowOrBlocked(s) && rhythmKind(s) !== 'svt', points: 3, severity: 'minor', text: 'A vagal maneuver for a rhythm it cannot treat. It ends a re-entry through the AV node (AVNRT, AVRT) only: sinus tachycardia, atrial fibrillation or flutter and VT go on as before (2015 ACC/AHA/HRS SVT guideline; 2025 AHA). In an unstable patient it only delays the synchronized cardioversion, and the strain drops a low pressure further: treat the rhythm or its cause.' },

  // ─── The rate and AV-nodal drugs (one ladder: RATE_LADDER) ─────────────────
  { id: 'av-blocker-preexcited-af', actions: [...AV_NODAL_BLOCKERS, 'amio-arrest'], when: (s) => preexcitedAf(s), points: 15, severity: 'critical', text: 'An AV-nodal blocker in pre-excited atrial fibrillation. Blocking the node sends every impulse down the accessory pathway: the rate climbs and it can turn into VF (2023 ACC/AHA/ACCP/HRS AF guideline: adenosine, diltiazem, verapamil, digoxin, IV amiodarone and beta-blockers — 3: Harm). Unstable: synchronized cardioversion; stable: cardioversion, or IV procainamide or ibutilide.' },
  // diltiazem's contraindications (verapamil is the same drug class; the simulator offers it only intracoronary)
  { id: 'diltiazem-vt', actions: ['diltiazem'], when: (s) => s.pulse && ['vt', 'torsades'].includes(rhythmKind(s)), points: 15, severity: 'critical', text: 'Diltiazem for ventricular tachycardia. Treat a wide-complex tachycardia as VT until proven otherwise: diltiazem and verapamil drop the pressure and can turn VT into VF or arrest (2025 AHA: 3 — Harm). A stable monomorphic VT gets procainamide or amiodarone; an unstable one, synchronized cardioversion.' },
  { id: 'diltiazem-heart-failure', actions: ['diltiazem'], when: (s, sc) => s.pulse && hasProblem(sc, ['heart-failure', 'pulmonary-edema']), points: 15, severity: 'critical', text: 'Diltiazem in a patient with heart failure — a reduced ejection fraction or acute pulmonary edema. Calcium-channel blockers weaken the squeeze and open the vessels: with an ejection fraction of 40 % or less, or a decompensated heart, IV diltiazem and verapamil must not be given (2023 ACC/AHA/ACCP/HRS AF guideline: 3 — Harm). Control the rate with amiodarone, or a beta-blocker if the lungs are not congested; an unstable patient needs synchronized cardioversion.' },
  { id: 'nodal-blocker-slow', actions: RATE_DRUGS, when: (s) => slowOrBlocked(s), points: 10, severity: 'major', text: 'An AV-nodal blocker or amiodarone with a second- or third-degree AV block or a heart rate under 50. Their labels rule them out without a working pacemaker (metoprolol, diltiazem, verapamil: sick sinus or AV block beyond first degree; adenosine: AV block, sinus node disease, symptomatic bradycardia; IV amiodarone: marked sinus bradycardia, AV block): they slow the rate further and can stop the heart. A symptomatic slow rate gets atropine, pacing or an epinephrine or dopamine infusion.' },
  { id: 'adenosine-wide-unstable', actions: ADENOSINE_PUSH, when: (s) => s.pulse && (rhythmKind(s) === 'torsades' || (rhythmKind(s) === 'vt' && lowPressure(s))), points: 8, severity: 'major', text: 'Adenosine for an unstable or polymorphic wide-complex tachycardia (2025 AHA: 3 — Harm). It cannot stop VT, it drops the pressure and its pause can set off VF: unstable VT gets synchronized cardioversion, sustained polymorphic VT defibrillation. Adenosine is only a diagnostic try for a stable, regular, monomorphic one.' },
  { id: 'beta-blocker-stimulant', actions: BETA_BLOCKERS, when: (_s, sc) => hasProblem(sc, ['sympathomimetic-toxicity']), points: 8, severity: 'major', text: 'A beta-blocker in acute cocaine or stimulant toxicity. With the beta receptors blocked, the stimulant\'s alpha effect goes unopposed: worse coronary spasm and a higher pressure (2014 AHA/ACC NSTE-ACS guideline: no beta-blocker with signs of acute intoxication, 3 — Harm). A benzodiazepine first, then nitroglycerin for the chest pain and the pressure.' },
  // labetalol too: its beta block outweighs its alpha block, and paradoxical hypertension is reported (label)
  { id: 'beta-blocker-pheochromocytoma', actions: BETA_BLOCKERS, when: (_s, sc) => hasProblem(sc, ['pheochromocytoma']), points: 8, severity: 'major', text: 'A beta-blocker for a patient with an untreated pheochromocytoma. With the beta receptors blocked and no alpha-blocker on board, the tumor\'s catecholamines act on the alpha receptors alone: the pressure climbs further and the heart can fail (metoprolol, esmolol and labetalol labels). Alpha-blockade first (phentolamine for a crisis); a beta-blocker only once it is in place.' },
  { id: 'nodal-blocker-hypotension', actions: [...BETA_BLOCKERS, 'diltiazem'], when: (s) => s.pulse && lowPressure(s), points: 8, severity: 'major', text: 'A beta-blocker or IV diltiazem with a systolic under 90 (with an LVAD, a Doppler MAP under 60). Severe hypotension and cardiogenic shock rule out IV diltiazem, and cardiogenic shock or a systolic under 100 in an MI rule out IV metoprolol: both weaken the squeeze and drop the pressure further. A tachycardia that is causing the low pressure is unstable — synchronized cardioversion (2025 AHA); a low pressure from anything else needs its cause treated.' },
  // the same id as the left-main, guide-dissection and air-embolism cases'
  { id: 'cocktail-low-pressure', actions: VERAPAMIL, when: (s) => s.pulse && lowPressure(s), points: 5, severity: 'major', text: 'Verapamil — the radial cocktail, or intracoronary — with a systolic under 90 (with an LVAD, a Doppler MAP under 60). Its label rules it out in severe hypotension and cardiogenic shock, and the cocktail\'s nitroglycerin drops the pressure too: give the sheath its heparin alone, and treat the pressure first.' },
  // after a failed shock, amiodarone to help the next one hold is fair (2025 AHA)
  { id: 'amiodarone-hypotension', actions: ['amio-infusion'], when: (s) => s.pulse && lowPressure(s) && !(tachyarrhythmia(s) && ((s.counts.cardiovert ?? 0) + (s.counts.defib ?? 0)) > 0), points: 5, severity: 'major', text: 'An amiodarone infusion with a systolic under 90. Cardiogenic shock rules out IV amiodarone and hypotension is its commonest effect (label): an unstable tachycardia gets synchronized cardioversion first, and a low pressure with no arrhythmia gets its cause treated.' },
  { id: 'ic-vasodilator-hypotension', actions: ['ic-adenosine'], when: (s) => s.pulse && lowPressure(s) && !slowOrBlocked(s), points: 6, severity: 'major', text: 'Intracoronary adenosine with a systolic under 90 (with an LVAD, a Doppler MAP under 60). It drops the pressure and slows the AV node, and a lower perfusion pressure makes no-reflow worse: hold the pressure up first, or use intracoronary epinephrine.' },
  // the fast rate of a pulmonary embolism or a tamponade not yet drained is the heart's answer to filling poorly
  { id: 'rate-drug-compensatory', actions: [...BETA_BLOCKERS, 'diltiazem'], when: (s, sc) => s.pulse && rhythmKind(s) === 'sinus' && (hasProblem(sc, ['pulmonary-embolism']) || ((hasProblem(sc, ['tamponade']) || has(s, 'tamponade')) && !has(s, 'drained'))), points: 8, severity: 'major', text: 'A beta-blocker or diltiazem for the sinus tachycardia of a pulmonary embolism or a tamponade. The fast rate is compensation, for a heart that fills poorly or pumps against a blocked lung circulation: slowing it drops the output and the pressure (the esmolol label rules it out in pulmonary hypertension). Treat the cause — drain the tamponade; anticoagulate, or lyse a high-risk embolism.' },
  // the shock-risk signs of the 2013 ACCF/AHA STEMI guideline (COMMIT): a systolic under 120, a sinus tachycardia over 110 or
  // a rate under 60 — and a heart minutes out of a cardiac arrest. A fast AF in an ACS without failure, instability or
  // bronchospasm is what an IV beta-blocker slows (2023 ACC/AHA/ACCP/HRS AF guideline)
  { id: 'beta-blocker-mi-shock-risk', actions: IV_BETA_BLOCKERS, when: (s, sc) => s.pulse && hasProblem(sc, ['acs']) && !lowPressure(s) && miShockRisk(s), points: 8, severity: 'major', text: 'An IV beta-blocker in an acute MI with signs of shock risk or a slowed AV node — a systolic under 120, a sinus rate over 110 or a rate under 60, a PR interval of 0.24 s or more, or a heart just back from a cardiac arrest. Early IV beta-blockade with these risk factors brought on cardiogenic shock (COMMIT; 2013 ACCF/AHA STEMI: 3 — Harm; 2025 ACC/AHA ACS: no early IV beta-blocker with signs of heart failure, low output or shock risk), and the metoprolol injection label rules it out in an MI with a systolic under 100, a heart rate under 45, a PR of 0.24 s or more or moderate to severe heart failure. Start an oral beta-blocker within 24 hours, once the patient is stable.' },
  { id: 'beta-blocker-pulmonary-edema', actions: BETA_BLOCKERS, when: (s, sc) => s.pulse && hasProblem(sc, ['pulmonary-edema']), points: 8, severity: 'major', text: 'A beta-blocker with fluid on the lungs. Decompensated heart failure rules out beta-blockade (metoprolol label; 2022 AHA/ACC/HFSA heart failure; 2025 ACC/AHA ACS): it takes away the squeeze and the rate the failing heart is living on. Treat the congestion — sit up, CPAP, nitroglycerin for a high pressure — and a fast rhythm with amiodarone or synchronized cardioversion.' },
  // even with the pressure held over 90 by a pressor (metoprolol, labetalol and esmolol labels: cardiogenic shock)
  { id: 'beta-blocker-cardiogenic-shock', actions: BETA_BLOCKERS, when: (s, sc) => s.pulse && hasProblem(sc, ['cardiogenic-shock']), points: 8, severity: 'major', text: 'A beta-blocker in cardiogenic shock. The labels of metoprolol, labetalol and esmolol rule them out in shock — even with the pressure held up by an infusion: they take away the squeeze and the rate the failing heart is living on. Support the circulation and open the culprit artery; a fast rhythm gets amiodarone or synchronized cardioversion.' },
  { id: 'adenosine-asthma', actions: ADENOSINE_PUSH, when: (_s, sc) => hasProblem(sc, ['asthma', 'bronchospasm']), points: 8, severity: 'major', text: 'Adenosine in a patient with asthma or bronchospasm. It can set off severe bronchospasm (adenosine labels: avoid it, or do not give it, in bronchoconstrictive or bronchospastic lung disease): a stable regular SVT gets vagal maneuvers, then IV diltiazem; an unstable one, synchronized cardioversion.' },
  { id: 'labetalol-asthma', actions: ['labetalol'], when: (_s, sc) => hasProblem(sc, ['asthma', 'bronchospasm']), points: 8, severity: 'major', text: 'Labetalol in a patient with asthma or bronchospasm. It blocks the β2 receptors of the airways as well as β1, and its label rules it out in bronchial asthma: it can set off severe bronchospasm. Lower the pressure with a drug that spares the airways (nicardipine), and the rate with diltiazem.' },
  { id: 'beta-blocker-bronchospasm', actions: ['metoprolol', 'metoprolol-po', 'esmolol'], when: (_s, sc) => hasProblem(sc, ['asthma', 'bronchospasm']), points: 5, severity: 'major', text: 'A beta-blocker in a patient with asthma or bronchospasm. Even a β1-selective blocker (metoprolol, esmolol) loses its selectivity as the dose rises and can tighten the airways (labels: caution in bronchospastic disease): never during active wheezing — control the rate with diltiazem instead.' },
  // a denervated heart, dipyridamole or carbamazepine: 3 mg is the first dose (AHA ACLS dosing)
  { id: 'adenosine-full-dose', actions: ['adenosine6', 'adenosine12'], when: (s, sc) => hasProblem(sc, ['heart-transplant', 'adenosine-potentiator']) && !did(s, 'adenosine3'), points: 5, severity: 'major', text: 'Adenosine 6 or 12 mg with a transplanted heart, dipyridamole or carbamazepine. The denervated heart, and these drugs, make adenosine\'s effect much stronger and longer — a prolonged asystole: the AHA first dose is 3 mg (the label warns that dipyridamole potentiates adenosine and that carbamazepine can deepen heart block).' },
  { id: 'iv-beta-blocker-with-diltiazem', actions: [...IV_BETA_BLOCKERS, 'diltiazem'], when: (s, _sc, id) => s.pulse && !preexcitedAf(s) && ((IV_BETA_BLOCKERS.includes(id) && diltiazemGiven(s)) || (id === 'diltiazem' && ivBetaBlockerGiven(s))), points: 5, severity: 'major', text: 'IV diltiazem and an IV beta-blocker together. The diltiazem label rules out giving them together or within a few hours of each other, and the esmolol label reports fatal arrests with IV calcium-channel blockers given close together: profound bradycardia, heart block and a falling pressure. Choose one.' },
  { id: 'amiodarone-long-qt', actions: ['amio-infusion'], when: (s, sc) => s.pulse && longQt(s, sc), points: 5, severity: 'major', text: 'Amiodarone with a long QT. It lengthens the QT further and can set off (or keep up) torsades de pointes: magnesium, potassium, a faster heart rate and stopping the QT-prolonging drugs are the treatment.' },
  // when one antiarrhythmic has not worked, the next step is a shock or expert advice, not a second drug on top
  { id: 'amiodarone-after-procainamide', actions: ['amio-infusion'], when: (s) => s.pulse && has(s, 'procainamide'), points: 5, severity: 'minor', text: 'Amiodarone on top of procainamide. Both lengthen the QT and drop the pressure: when one antiarrhythmic fails, cardiovert (with sedation) or get expert advice instead of adding another.' },
  // a pressor holding the systolic over 90 does not take the shock away
  { id: 'verapamil-cardiogenic-shock', actions: VERAPAMIL, when: (s, sc) => s.pulse && !lowPressure(s) && hasProblem(sc, ['cardiogenic-shock']), points: 3, severity: 'minor', text: 'Verapamil in cardiogenic shock. Its label rules it out in shock, even with the pressure held up by an infusion: it weakens the squeeze and opens the vessels. Give the sheath its heparin alone (and nitroglycerin only if the pressure allows).' },
  // in decompensated heart failure (or a low pressure), where diltiazem and beta-blockers are ruled out, IV amiodarone may
  // be considered for the rate (2023 ACC/AHA/ACCP/HRS AF guideline, 2b)
  { id: 'amiodarone-may-convert', actions: ['amio-infusion'], when: (s, sc) => hasProblem(sc, ['af-over-48h']) && afOrFlutter(s) && !hasProblem(sc, ['heart-failure', 'pulmonary-edema']) && !lowPressure(s), points: 3, severity: 'minor', text: 'An amiodarone infusion for atrial fibrillation or flutter of 48 hours or more without anticoagulation. Amiodarone can convert the rhythm as well as slow it, with the same risk of a stroke as a cardioversion (2023 ACC/AHA/ACCP/HRS AF guideline): control the rate with a drug that does not convert, and anticoagulate (heparin) at once.' },
  // the same id as the guide-dissection case's. After ROSC, or a cardioversion, an amiodarone infusion to hold the rhythm is
  // fair, and diltiazem is a rate drug for a dissection (the dissection cases judge it)
  { id: 'antiarrhythmic-no-arrhythmia', actions: [...ADENOSINE_PUSH, 'diltiazem', 'amio-infusion', 'procainamide'], when: (s, sc, id) => s.pulse && !tachyarrhythmia(s) && !['vt', 'torsades'].includes(rhythmKind(s)) && !slowOrBlocked(s) && !(id === 'amio-infusion' && (has(s, 'rosc') || has(s, 'cardioverted'))) && !(id === 'diltiazem' && hasProblem(sc, ['aortic-dissection'])), points: 3, severity: 'minor', text: 'An antiarrhythmic or AV-nodal drug with no tachyarrhythmia to treat. Adenosine, diltiazem, an amiodarone infusion and procainamide are for a fast arrhythmia — SVT, atrial fibrillation or flutter with a fast rate, or VT (2025 AHA tachycardia algorithm): with a normal rhythm, or a sinus tachycardia that is the body\'s answer to something else, they only slow the heart and drop the pressure. Treat the cause.' },

  // ─── Lidocaine ─────────────────────────────────────────────────────────────
  { id: 'lidocaine-slow-or-block', actions: ['lidocaine'], when: (s) => slowOrBlocked(s), points: 10, severity: 'major', text: 'Lidocaine with heart block or a slow rate. Its label rules it out in Stokes-Adams attacks and in severe sinoatrial, AV or intraventricular block without a pacemaker: it can suppress the escape beats that keep the patient alive. Pace, or speed the rate.' },
  // a class I drug deepens the sodium-channel block the potassium has made, in a PEA arrest too. Shock-refractory VF or
  // pulseless VT still gets amiodarone or lidocaine, with calcium alongside (2025 AHA)
  { id: 'antiarrhythmic-hyperkalemia', actions: ['lidocaine', 'procainamide', 'amio-infusion', 'amio-arrest'], when: (s, sc) => hasProblem(sc, ['hyperkalemia']) && !shockable(s), points: 10, severity: 'major', text: 'An antiarrhythmic for the rhythm of hyperkalemia. The wide, slow complexes come from the potassium, not from an irritable ventricle: lidocaine, procainamide and amiodarone deepen the block the potassium has already made and can turn it into a sine wave or asystole. Calcium first, then shift the potassium (insulin with dextrose, albuterol) and remove it. (VF or pulseless VT that shocks have not fixed still gets amiodarone or lidocaine — with the calcium.)' },
  // the same id as the guide-dissection and vasovagal cases'. After ROSC from VF, lidocaine may be considered (2025 AHA)
  { id: 'lidocaine-no-arrhythmia', actions: ['lidocaine'], when: (s) => s.pulse && !['vt', 'torsades'].includes(rhythmKind(s)) && !has(s, 'rosc'), points: 3, severity: 'minor', text: 'Lidocaine with no ventricular arrhythmia to treat. Lidocaine to prevent VF in an acute MI is not recommended (more asystole, no benefit), it does nothing for atrial or AV-nodal rhythms, and its label rules it out in WPW: a stable wide tachycardia gets procainamide or amiodarone.' },

  // ─── Procainamide: the stop rules and contraindications on its drug card (2025 AHA tachycardia algorithm) ───
  { id: 'procainamide-in-arrest', actions: ['procainamide'], when: (s) => !s.pulse, points: 3, severity: 'minor', text: 'Procainamide in cardiac arrest. It is a slow infusion (20–50 mg/min), not an arrest drug: amiodarone 300 mg or lidocaine is.' },
  // a pacer (pads or a wire) protects against the block it would deepen
  { id: 'procainamide-slow', actions: ['procainamide'], when: (s) => slowOrBlocked(s), points: 10, severity: 'major', text: 'Procainamide with AV block or a slow heart rate. It slows conduction further and can stop the heart; it is a drug for tachycardia.' },
  { id: 'procainamide-long-qt', actions: ['procainamide'], when: (s, sc) => longQt(s, sc), points: 10, severity: 'major', text: 'Procainamide with a long QT. It lengthens the QT further and can set off torsades de pointes.' },
  { id: 'procainamide-hypotension', actions: ['procainamide'], when: (s) => s.pulse && lowPressure(s), points: 8, severity: 'major', text: 'Procainamide with a systolic pressure under 90 mmHg. Hypotension is one of its stop rules, so it is no drug to start with one: an unstable tachycardia needs synchronized cardioversion.' },
  { id: 'procainamide-heart-failure', actions: ['procainamide'], when: (_s, sc) => hasProblem(sc, ['heart-failure', 'pulmonary-edema', 'cardiogenic-shock']), points: 8, severity: 'major', text: 'Procainamide in a patient with heart failure — a weak pump, acute pulmonary edema or cardiogenic shock. It weakens the squeeze and drops the pressure (label; 2025 AHA: avoid it in heart failure): use amiodarone, or synchronized cardioversion.' },
  { id: 'procainamide-lupus', actions: ['procainamide'], when: (_s, sc) => hasProblem(sc, ['lupus']), points: 8, severity: 'major', text: 'Procainamide in a patient with systemic lupus erythematosus. Its label rules it out: procainamide itself causes a lupus-like syndrome and can make lupus flare. Choose amiodarone for a stable wide-complex tachycardia, or synchronized cardioversion.' },
  { id: 'procainamide-after-amiodarone', actions: ['procainamide'], when: (s) => s.pulse && has(s, 'amiodarone'), points: 5, severity: 'minor', text: 'Procainamide on top of amiodarone. Both lengthen the QT and drop the pressure: when one antiarrhythmic fails, cardiovert (with sedation) or get expert advice instead of adding another.' },
  { id: 'procainamide-sodium-channel', actions: ['procainamide'], when: (_s, sc) => hasProblem(sc, ['sodium-channel-blocker-overdose']), points: 10, severity: 'major', text: 'Procainamide in a tricyclic or other sodium-channel-blocker overdose. As a class IA drug it deepens the sodium-channel block — a wider QRS, a lower pressure and more ventricular arrhythmias (toxicology references): sodium bicarbonate, then lidocaine.' },

  // ─── The cath lab's adenosine infusion for an FFR (Adenoscan label) ────────
  { id: 'ffr-adenosine-unsafe', actions: ['adenosine-iv-ffr'], when: (s, sc) => s.pulse && (slowOrBlocked(s) || lowPressure(s) || hasProblem(sc, ['asthma', 'bronchospasm'])), points: 8, severity: 'major', text: 'IV adenosine for hyperemia with AV block, a slow rate, a low pressure, or asthma or bronchospasm. Its label rules the infusion out in second- or third-degree AV block and sinus node disease without a pacemaker and in bronchospastic lung disease, and it drops the pressure: measure a resting index (iFR or RFR) instead, or treat the patient first.' },
  { id: 'ffr-adenosine-no-wire', actions: ['adenosine-iv-ffr'], when: (s) => s.pulse && !has(s, 'equalized') && !has(s, 'wired'), points: 3, severity: 'minor', text: 'An adenosine infusion with no pressure wire in place. It is the hyperemia for an FFR measurement; with nothing to measure it only flushes, slows the AV node and drops the pressure.' },
];

/**
 * One dose, one penalty: for each of these actions, the rules of this file in order of rank. Only the first one whose
 * condition holds (and whose roles include the learner's) charges the dose. The indication rules come last, so an
 * indication the ER nurse's missing order covers (INDICATION_RULES) never hides a contraindication.
 */
const RATE_LADDER = [
  'av-blocker-preexcited-af',
  'diltiazem-vt', 'diltiazem-heart-failure',
  'rate-drug-in-arrest',
  'nodal-blocker-slow',
  // (amiodarone's infusion only)
  'antiarrhythmic-hyperkalemia',
  'adenosine-wide-unstable',
  'beta-blocker-stimulant', 'beta-blocker-pheochromocytoma',
  'nodal-blocker-hypotension', 'cocktail-low-pressure', 'amiodarone-hypotension', 'ic-vasodilator-hypotension',
  'rate-drug-compensatory',
  'beta-blocker-mi-shock-risk',
  'beta-blocker-pulmonary-edema', 'beta-blocker-cardiogenic-shock',
  'adenosine-asthma', 'labetalol-asthma', 'beta-blocker-bronchospasm',
  'adenosine-full-dose',
  'iv-beta-blocker-with-diltiazem',
  'amiodarone-long-qt', 'amiodarone-after-procainamide',
  'verapamil-cardiogenic-shock',
  'amiodarone-may-convert', 'antiarrhythmic-no-arrhythmia',
];
export const LADDERS: Record<string, string[]> = {
  ...Object.fromEntries(RATE_DRUGS.map((a) => [a, RATE_LADDER])),
  lidocaine: ['lidocaine-slow-or-block', 'antiarrhythmic-hyperkalemia', 'antiarrhythmic-nonshockable', 'lidocaine-no-arrhythmia'],
  procainamide: [
    'procainamide-in-arrest', 'procainamide-slow', 'procainamide-long-qt', 'procainamide-hypotension', 'procainamide-heart-failure',
    'procainamide-lupus', 'procainamide-after-amiodarone', 'procainamide-sodium-channel', 'antiarrhythmic-hyperkalemia', 'cardioversion-unanticoagulated',
    'antiarrhythmic-no-arrhythmia',
  ],
  'amio-arrest': ['arrest-amio-with-pulse', 'av-blocker-preexcited-af', 'antiarrhythmic-hyperkalemia', 'amiodarone-arrest-long-qt', 'antiarrhythmic-nonshockable'],
  epinephrine: ['arrest-epi-with-pulse', 'epi-before-shock', 'epi-too-soon'],
  atropine: ['atropine-in-arrest', 'atropine-heart-transplant', 'atropine-infranodal-repeat', 'atropine-fast'],
  cardiovert: [
    'shock-nonshockable', 'sync-in-arrest', 'sync-polymorphic', 'cardiovert-no-tachycardia', 'cardioversion-digoxin-toxicity',
    'cardioversion-unanticoagulated', 'no-sedation',
  ],
  pace: ['pace-in-arrest', 'pace-not-slow', 'pace-no-analgesia'],
  'temp-wire': ['temp-wire-not-slow', 'temp-wire-no-indication', 'temp-wire-without-pads'],
  'magnesium-sulfate': ['magnesium-routine-arrest', 'magnesium-renal-failure', 'magnesium-no-indication'],
  'adenosine-iv-ffr': ['rate-drug-in-arrest', 'ffr-adenosine-unsafe', 'ffr-adenosine-no-wire'],
  vagal: ['vagal-slow', 'vagal-no-indication'],
};

/**
 * The rules of RATE_LADDER that came after its older ones (av-blocker-preexcited-af, the two diltiazem rules,
 * beta-blocker-stimulant and the two amiodarone rules). A case rule that says a rate or AV-nodal drug is wrong for its
 * patient lists them in its `replaces`: while it applies it speaks for the dose, whichever of them the gate would have
 * picked (one dose, one penalty) — unless it is minor and the rule the gate picked a heavier, major one (yieldToHeavier).
 * An older rule ranked above the gate's pick still charges beside the case rule, as before; one ranked below it is silent
 * while a case rule speaks for the dose. The second antiarrhythmic (amiodarone-after-procainamide) is a mistake of its
 * own: beside a case rule on the same dose the heavier of the two charges alone (engine harmsFor, SECOND_ANTIARRHYTHMIC)
 */
export const RATE_RULES = RATE_LADDER.filter((id) => ![
  'av-blocker-preexcited-af', 'diltiazem-vt', 'diltiazem-heart-failure', 'beta-blocker-stimulant', 'amiodarone-long-qt', 'amiodarone-after-procainamide',
].includes(id));
/** Every rule on lidocaine: a case rule that says lidocaine is wrong for its patient lists them in its `replaces` */
export const LIDOCAINE_RULES = LADDERS.lidocaine;
/**
 * The rules on procainamide but the older procainamide-after-amiodarone (as RATE_RULES leaves out its mirror,
 * amiodarone-after-procainamide): a case rule that says procainamide is wrong for its patient lists them in its
 * `replaces`. The second antiarrhythmic stays a mistake of its own: charged after a case rule was charged on the first
 * drug (never free), and beside a case rule on the same dose the heavier of the two charges alone (SECOND_ANTIARRHYTHMIC)
 */
export const PROCAINAMIDE_RULES = LADDERS.procainamide.filter((id) => id !== 'procainamide-after-amiodarone');
/**
 * The second antiarrhythmic on top of the first (minor, 5 points): a stacking mistake of its own. When it and a case rule
 * both charge one dose, the heavier charges alone, the case's words on a tie (engine harmsFor: one dose, one penalty)
 */
export const SECOND_ANTIARRHYTHMIC = ['amiodarone-after-procainamide', 'procainamide-after-amiodarone'];

const BY_ID = new Map(RULES.map((r) => [r.id, r]));
const roleOk = (h: Harm, s: SimState) => !h.roles || h.roles.includes(s.role);
/** A rule — of this file or of the case — applies to this act: its action, its role and its condition */
const applies = (h: Harm, s: SimState, sc: Scenario, id: string) => h.actions.includes(id) && roleOk(h, s) && (!h.when || h.when(s, sc, id));

/** The highest-ranked rule of the action's ladder whose own condition holds, whatever the case says (or null) */
function firstHolding(s: SimState, sc: Scenario, id: string): string | null {
  for (const ruleId of LADDERS[id] ?? []) {
    const r = BY_ID.get(ruleId);
    if (r && applies(r, s, sc, id)) return ruleId;
  }
  return null;
}

/**
 * What the case says about this rule for this act:
 * - 'speaks': a case rule with its id, or one that lists it in `replaces`, applies and has not been charged against this
 *   dose (rules/charge.ts caseChargedBefore: a stand-in for a drug contraindication charges once for each drug) — it
 *   charges for the dose, in the case's words;
 * - 'covered': the case hides it and charges nothing for it under its name, but another of the case's rules charges this
 *   act (a case that narrows a rule with its id and says the rest in another rule's words);
 * - 'passed': the case hides it and charges nothing at all for this act — its rule with that id does not cover the act (an
 *   exemption), or the rules standing in for it were charged already against this dose (the same drug again, or a rule
 *   that charges once a case). The gate then passes the dose on to the next rule down, as it passes over a built-in rule
 *   charged already (the one repeat policy of every gate, rules/charge.ts passedOver);
 * - null: the case leaves it to the built-in rule.
 */
function caseVoice(s: SimState, sc: Scenario, id: string, ruleId: string): 'speaks' | 'covered' | 'passed' | null {
  let hidden: 'hidden' | null = null;
  for (const h of sc.harms) {
    // a rule with its id speaks only for the actions it lists: for another action the built-in judges
    if (!roleOk(h, s) || (h.id === ruleId ? !h.actions.includes(id) && !h.replaces?.includes(ruleId) : !h.replaces?.includes(ruleId))) continue;
    const on = applies(h, s, sc, id);
    if (on && !caseChargedBefore(s, h, id)) return 'speaks';
    if ((on || h.id === ruleId) && hidden === null) hidden = 'hidden';
  }
  if (hidden === null) return null;
  return sc.harms.some((h) => applies(h, s, sc, id) && !caseChargedBefore(s, h, id)) ? 'covered' : 'passed';
}

/**
 * The radial cocktail carries nitroglycerin with its verapamil: when the nitrate gate charges the dose (a PDE-5 inhibitor, a
 * heart that lives on its preload or an outflow obstruction — 10 points, at least what any reason of this file weighs on
 * the cocktail), the rhythm rules stand aside, and so do the case rules that stand in for them only (one dose, one penalty)
 */
const cocktailNitrateCharges = (s: SimState, sc: Scenario, id: string) => id === 'radial-cocktail' && nitrateCharges(s, sc, id);

/**
 * The one rule of this file that charges this dose (or that a case rule charges for): the highest-ranked rule in the
 * action's ladder that applies and that the case has not passed over, or null. A rule charged already against this dose —
 * on the same drug, or once a case — is passed over, as every gate does (rules/charge.ts passedOver): a later dose of a
 * different drug is judged anew; a repeat of the same drug is not charged again by the rule already charged on it, nor for
 * a reason that held when it was charged (rules/charge.ts coveredBefore), but for what is new (another epinephrine too soon
 * after the last, a repeat atropine the block does not answer).
 */
export function topRhythmRule(s: SimState, sc: Scenario, id: string): string | null {
  if (cocktailNitrateCharges(s, sc, id)) return null;
  for (const ruleId of LADDERS[id] ?? []) {
    const r = BY_ID.get(ruleId);
    if (!r || !applies(r, s, sc, id)) continue;
    const voice = caseVoice(s, sc, id, ruleId);
    if (voice === 'passed') continue;
    // an indication rank the ER nurse's missing order covers stands aside: the dose goes on to the next reason that holds
    if (voice === null && indicationCovered(ruleId, s, sc, id)) continue;
    if (voice === null && (builtInChargedBefore(s, r, id) || coveredBefore(s, r, id))) continue;
    return ruleId;
  }
  return null;
}

/**
 * A minor case rule steps aside for a heavier rule: the rule the gate would pick for this dose (the highest-ranked of this
 * file whose own condition holds) is one it lists in `replaces`, and the rule that would charge for it is major or
 * critical, weighs more than the case rule and charges this dose. That is the built-in rule — unless it was charged already
 * against this dose, or another case rule standing in for it was — or the case's own rule with its id, when that rule
 * applies. The case rule then does not apply, and the heavier rule charges alone at its own weight: a case's minor
 * wrong-answer or teaching rule never speaks for a major contraindication (one dose, one penalty, at the right weight). A
 * major case rule keeps speaking for the dose in its own words.
 */
export function yieldsTo(s: SimState, sc: Scenario, id: string, h: Harm): boolean {
  // the cocktail's nitrate reason charges it: a case rule that speaks for rhythm rules only steps aside, whatever its weight
  // (a rule that also stands in for nitrate rules speaks for both, and is not asked: no circle through the nitrate gate)
  if (!h.replaces?.some((r) => NITRATE_RULES.includes(r)) && cocktailNitrateCharges(s, sc, id)) return true;
  if (h.severity !== 'minor') return false;
  const top = firstHolding(s, sc, id);
  if (!top || !h.replaces?.includes(top)) return false;
  const heavier = (r: Harm) => r.severity !== 'minor' && r.points > h.points;
  // the case judges it under its own id: step aside only for that rule, heavier and charging this act (if that rule
  // steps aside too, its own check finds itself here and stops)
  const own = sc.harms.find((c) => c.id === top && roleOk(c, s) && c.actions.includes(id));
  if (own) return own.id !== h.id && heavier(own) && applies(own, s, sc, id) && !caseChargedBefore(s, own, id);
  if (!heavier(BY_ID.get(top)!) || builtInChargedBefore(s, BY_ID.get(top)!, id) || coveredBefore(s, BY_ID.get(top)!, id)) return false;
  return !sc.harms.some((c) => c.id !== h.id && roleOk(c, s) && c.actions.includes(id) && !!c.replaces?.includes(top) && caseChargedBefore(s, c, id));
}

const YIELDING = new WeakSet<Harm>();
/**
 * A case's own rules, each that lists rules of this file in its `replaces` made to step aside for a heavier one
 * (yieldsTo). Every case whose rules stand in for these rules passes its `harms` through it.
 */
export function yieldToHeavier(harms: Harm[]): Harm[] {
  return harms.map((h) => {
    if (!h.replaces?.some((id) => BY_ID.has(id))) return h;
    const own = h.when;
    const w: Harm = { ...h, when: (s, sc, id) => (!own || own(s, sc, id)) && !yieldsTo(s, sc, id, w) };
    YIELDING.add(w);
    carryNitrateRank(h, w);
    return w;
  });
}
/** This case rule steps aside for a heavier rule of this file (its case passed it through yieldToHeavier) */
export const yieldsToHeavier = (h: Harm) => YIELDING.has(h);

// each ladder rule's own condition: what a penalty on the dose speaks for (rules/charge.ts holdingNow)
for (const r of RULES) if (Object.values(LADDERS).some((l) => l.includes(r.id))) registerCondition(r.id, (s, sc, id) => !r.when || r.when(s, sc, id));

export const RHYTHM_RULES: Harm[] = RULES.map((r) => ({
  ...r,
  when: (s, sc, id) => (LADDERS[id]?.includes(r.id) ? topRhythmRule(s, sc, id) === r.id : !r.when || r.when(s, sc, id)),
}));
