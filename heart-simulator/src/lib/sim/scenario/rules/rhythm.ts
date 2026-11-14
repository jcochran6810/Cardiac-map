/**
 * Built-in safety rules for the rhythm: shocks, cardioversion, the arrest drugs given with a pulse, pacing, atropine and
 * the antiarrhythmic and rate drugs (diltiazem, procainamide, amiodarone, beta-blockers, AV-nodal blockers).
 *
 * One dose, one penalty: for the drugs and shocks in LADDERS the rules are ranked, and only the highest-ranked rule whose
 * condition holds charges the dose (topRhythmRule). A case rule that stands in for that rule therefore covers the whole
 * dose.
 */
import { has, paced } from '../kit';
import type { Harm, Scenario, SimState } from '../types';
import {
  ADENOSINE_PUSH, AV_NODAL_BLOCKERS, BETA_BLOCKERS, hasProblem, longQt, lowPressure, lvadPerfusing, preexcitedAf, rhythmKind, shockable,
  slowOrBlocked, tachyarrhythmia,
} from './helpers';

/** The drugs that slow the AV node or the rate (and amiodarone's infusion), with the cath lab's intracoronary ones */
export const RATE_DRUGS = [
  ...BETA_BLOCKERS, 'diltiazem', ...ADENOSINE_PUSH, 'amio-infusion', 'ic-adenosine', 'ic-verapamil', 'radial-cocktail',
];

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

  // ─── The arrest drugs ──────────────────────────────────────────────────────
  { id: 'arrest-epi-with-pulse', actions: ['epinephrine'], when: (s) => s.pulse, points: 15, severity: 'critical', text: '1 mg IV epinephrine is the cardiac-arrest dose. With a pulse it causes severe hypertension, arrhythmias and ischemia; use push-dose epinephrine or an infusion.' },
  // pre-excited AF is scored by av-blocker-preexcited-af (one mistake, one penalty)
  { id: 'arrest-amio-with-pulse', actions: ['amio-arrest'], when: (s) => s.pulse && !preexcitedAf(s), points: 10, severity: 'major', text: 'A 300 mg amiodarone push is for cardiac arrest. With a pulse, give 150 mg over 10 minutes.' },

  // ─── Pacing and the transvenous wire ───────────────────────────────────────
  // pads on standby over a paced heart (a temporary wire) are a backup, not a mistake
  { id: 'pace-not-slow', actions: ['pace'], when: (s) => s.pulse && s.rhythm.hr >= 50 && !paced(s), points: 5, severity: 'minor', text: 'Transcutaneous pacing without a slow heart rate to treat. Pacing is for symptomatic bradycardia (usually under 50/min) that atropine has not fixed.' },
  { id: 'pace-in-arrest', actions: ['pace'], when: (s) => !s.pulse, points: 5, severity: 'major', text: 'Pacing in cardiac arrest. It does not restart a heart in arrest and cannot treat VF: CPR, a shock for VF or pulseless VT, and epinephrine.' },
  // the emergency physician's invasive procedures need their indication (the cath lab's cases score their own). In the lab
  // a transvenous wire can be a backup on demand, so the rate rule is the department's only
  { id: 'temp-wire-not-slow', actions: ['temp-wire'], when: (s, sc) => sc.setting === 'ed' && s.pulse && s.rhythm.hr >= 50 && !paced(s), points: 5, severity: 'minor', text: 'A transvenous pacing wire without a slow heart rate to treat. It is for bradycardia (usually under 50/min) that drugs and the transcutaneous pacer cannot hold; with a faster rate it brings only its risks — a perforated ventricle, arrhythmias, a pneumothorax, bleeding and infection.' },

  // ─── Atropine ──────────────────────────────────────────────────────────────
  // atropine is for symptomatic bradycardia. With a pulse: a rate of 60 or more has nothing for it to treat (over a pacer,
  // whose 70 hides a slow rate of the heart's own, it is still a fair try). In arrest: out of the algorithm since 2010
  { id: 'atropine-fast', actions: ['atropine'], when: (s) => s.pulse && s.rhythm.hr >= 60 && !paced(s), points: 3, severity: 'minor', text: 'Atropine with no slow heart rate to treat. It is for symptomatic bradycardia: with a normal or fast rate it has nothing to treat, and any speeding only adds to the heart\'s oxygen demand — in an acute MI that can worsen the ischemia.' },
  { id: 'atropine-in-arrest', actions: ['atropine'], when: (s) => !s.pulse, points: 3, severity: 'minor', text: 'Atropine in cardiac arrest. It has not been part of the cardiac arrest algorithm since 2010: routine atropine does not help PEA or asystole, and it does nothing for VF. CPR, epinephrine, a shock for VF or pulseless VT, and the reversible causes.' },

  // ─── Magnesium ─────────────────────────────────────────────────────────────
  { id: 'magnesium-routine-arrest', actions: ['magnesium-sulfate'], when: (s, sc) => !s.pulse && !longQt(s, sc), points: 3, severity: 'minor', text: 'Magnesium in a cardiac arrest without torsades. Routine magnesium does not help VF, pulseless VT, PEA or asystole; it is for torsades de pointes.' },

  // ─── The rate and AV-nodal drugs (one ladder: RATE_LADDER) ─────────────────
  { id: 'av-blocker-preexcited-af', actions: [...AV_NODAL_BLOCKERS, 'amio-arrest'], when: (s) => preexcitedAf(s), points: 15, severity: 'critical', text: 'An AV-nodal blocker in pre-excited atrial fibrillation. Blocking the node sends every impulse down the accessory pathway: the rate climbs and it can turn into VF (2023 ACC/AHA/ACCP/HRS AF guideline: adenosine, diltiazem, verapamil, digoxin, IV amiodarone and beta-blockers — 3: Harm). Unstable: synchronized cardioversion; stable: cardioversion, or IV procainamide or ibutilide.' },
  // diltiazem's contraindications (verapamil is the same drug class; the simulator offers it only intracoronary)
  { id: 'diltiazem-vt', actions: ['diltiazem'], when: (s) => s.pulse && ['vt', 'torsades'].includes(rhythmKind(s)), points: 15, severity: 'critical', text: 'Diltiazem for ventricular tachycardia. Treat a wide-complex tachycardia as VT until proven otherwise: diltiazem and verapamil drop the pressure and can turn VT into VF or arrest (2025 AHA: 3 — Harm). A stable monomorphic VT gets procainamide or amiodarone; an unstable one, synchronized cardioversion.' },
  { id: 'diltiazem-heart-failure', actions: ['diltiazem'], when: (s, sc) => s.pulse && hasProblem(sc, ['heart-failure', 'pulmonary-edema']), points: 15, severity: 'critical', text: 'Diltiazem in a patient with heart failure — a reduced ejection fraction or acute pulmonary edema. Calcium-channel blockers weaken the squeeze and open the vessels: with an ejection fraction of 40 % or less, or a decompensated heart, IV diltiazem and verapamil must not be given (2023 ACC/AHA/ACCP/HRS AF guideline: 3 — Harm). Control the rate with amiodarone, or a beta-blocker if the lungs are not congested; an unstable patient needs synchronized cardioversion.' },
  { id: 'beta-blocker-stimulant', actions: BETA_BLOCKERS, when: (_s, sc) => hasProblem(sc, ['sympathomimetic-toxicity']), points: 8, severity: 'major', text: 'A beta-blocker in acute cocaine or stimulant toxicity. With the beta receptors blocked, the stimulant\'s alpha effect goes unopposed: worse coronary spasm and a higher pressure (2014 ACC/AHA NSTE-ACS guideline: no beta-blocker with signs of acute intoxication). A benzodiazepine first, then nitroglycerin for the chest pain and the pressure.' },
  { id: 'amiodarone-long-qt', actions: ['amio-infusion'], when: (s, sc) => s.pulse && longQt(s, sc), points: 5, severity: 'major', text: 'Amiodarone with a long QT. It lengthens the QT further and can set off (or keep up) torsades de pointes: magnesium, potassium, a faster heart rate and stopping the QT-prolonging drugs are the treatment.' },
  // when one antiarrhythmic has not worked, the next step is a shock or expert advice, not a second drug on top
  { id: 'amiodarone-after-procainamide', actions: ['amio-infusion'], when: (s) => s.pulse && has(s, 'procainamide'), points: 5, severity: 'minor', text: 'Amiodarone on top of procainamide. Both lengthen the QT and drop the pressure: when one antiarrhythmic fails, cardiovert (with sedation) or get expert advice instead of adding another.' },

  // ─── Procainamide: the stop rules and contraindications on its drug card (2025 AHA tachycardia algorithm) ───
  { id: 'procainamide-in-arrest', actions: ['procainamide'], when: (s) => !s.pulse, points: 3, severity: 'minor', text: 'Procainamide in cardiac arrest. It is a slow infusion (20–50 mg/min), not an arrest drug: amiodarone 300 mg or lidocaine is.' },
  // a pacer (pads or a wire) protects against the block it would deepen
  { id: 'procainamide-slow', actions: ['procainamide'], when: (s) => slowOrBlocked(s), points: 10, severity: 'major', text: 'Procainamide with AV block or a slow heart rate. It slows conduction further and can stop the heart; it is a drug for tachycardia.' },
  { id: 'procainamide-long-qt', actions: ['procainamide'], when: (s, sc) => longQt(s, sc), points: 10, severity: 'major', text: 'Procainamide with a long QT. It lengthens the QT further and can set off torsades de pointes.' },
  { id: 'procainamide-hypotension', actions: ['procainamide'], when: (s) => s.pulse && lowPressure(s), points: 8, severity: 'major', text: 'Procainamide with a systolic pressure under 90 mmHg. Hypotension is one of its stop rules, so it is no drug to start with one: an unstable tachycardia needs synchronized cardioversion.' },
  { id: 'procainamide-heart-failure', actions: ['procainamide'], when: (_s, sc) => hasProblem(sc, ['heart-failure']), points: 8, severity: 'major', text: 'Procainamide in a patient with heart failure. It weakens the squeeze and drops the pressure: in heart failure use amiodarone, or synchronized cardioversion.' },
  { id: 'procainamide-after-amiodarone', actions: ['procainamide'], when: (s) => s.pulse && has(s, 'amiodarone'), points: 5, severity: 'minor', text: 'Procainamide on top of amiodarone. Both lengthen the QT and drop the pressure: when one antiarrhythmic fails, cardiovert (with sedation) or get expert advice instead of adding another.' },
];

/**
 * One dose, one penalty: for each of these actions, the rules of this file in order of rank. Only the first one whose
 * condition holds (and whose roles include the learner's) charges the dose. The indication rules come last, so an
 * indication the ER nurse's missing order covers (INDICATION_RULES) never hides a contraindication.
 */
const RATE_LADDER = [
  'av-blocker-preexcited-af',
  'diltiazem-vt', 'diltiazem-heart-failure',
  'beta-blocker-stimulant',
  'amiodarone-long-qt', 'amiodarone-after-procainamide',
];
export const LADDERS: Record<string, string[]> = {
  ...Object.fromEntries(RATE_DRUGS.map((a) => [a, RATE_LADDER])),
  procainamide: [
    'procainamide-in-arrest', 'procainamide-slow', 'procainamide-long-qt', 'procainamide-hypotension', 'procainamide-heart-failure',
    'procainamide-after-amiodarone',
  ],
  'amio-arrest': ['arrest-amio-with-pulse', 'av-blocker-preexcited-af'],
  epinephrine: ['arrest-epi-with-pulse'],
  atropine: ['atropine-in-arrest', 'atropine-fast'],
  cardiovert: ['shock-nonshockable', 'sync-in-arrest', 'sync-polymorphic', 'cardiovert-no-tachycardia'],
  pace: ['pace-in-arrest', 'pace-not-slow'],
  'temp-wire': ['temp-wire-not-slow'],
  'magnesium-sulfate': ['magnesium-routine-arrest'],
};

const BY_ID = new Map(RULES.map((r) => [r.id, r]));

/** The one rule of this file that charges this dose: the highest-ranked rule in the action's ladder that applies, or null */
export function topRhythmRule(s: SimState, sc: Scenario, id: string): string | null {
  for (const ruleId of LADDERS[id] ?? []) {
    const r = BY_ID.get(ruleId);
    if (r && r.actions.includes(id) && (!r.roles || r.roles.includes(s.role)) && (!r.when || r.when(s, sc, id))) return ruleId;
  }
  return null;
}

export const RHYTHM_RULES: Harm[] = RULES.map((r) => ({
  ...r,
  when: (s, sc, id) => (LADDERS[id]?.includes(r.id) ? topRhythmRule(s, sc, id) === r.id : !r.when || r.when(s, sc, id)),
}));
