/**
 * Built-in safety rules for the rhythm: shocks, cardioversion, the arrest drugs, pacing and the transvenous wire, atropine,
 * magnesium, the antiarrhythmic and rate drugs (diltiazem, procainamide, amiodarone, lidocaine, beta-blockers, adenosine)
 * and the cath lab's AV-nodal drugs (the radial cocktail, intracoronary adenosine and verapamil, the adenosine infusion for
 * an FFR).
 *
 * One dose, one penalty: for the drugs and shocks in LADDERS the rules are ranked, and only the highest-ranked rule whose
 * condition holds charges the dose (topRhythmRule). A case rule that stands in for that rule therefore covers the whole
 * dose. Sources: the drug labels, 2025 AHA ALS (Part 9), 2018 ACC/AHA/HRS bradycardia, 2023 ACC/AHA/ACCP/HRS AF and 2015
 * ACC/AHA/HRS SVT guidelines.
 */
import { has, paced } from '../kit';
import type { Harm, Scenario, SimState } from '../types';
import {
  ADENOSINE_PUSH, AV_BLOCKS, AV_NODAL_BLOCKERS, BETA_BLOCKERS, IV_BETA_BLOCKERS, did, hasProblem, lastDoneAt, longQt, lowPressure,
  lvadPerfusing, preexcitedAf, rhythmKind, shockable, shockedThisArrest, slowOrBlocked, tachyarrhythmia,
} from './helpers';
import { SCOPE_RULES, rnWithoutOrderId } from './scope';

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
 * The ER nurse gives this drug without the order it needs, and the scope rule ('rn-without-order-<id>') charges it now. As
 * with the built-in indication rules (INDICATION_RULES, which the engine skips then), whether the drug fits the patient is
 * left to the missing order: asking the physician is where that is decided (one act, one penalty)
 */
function nurseWithoutOrder(s: SimState, sc: Scenario, id: string): boolean {
  const r = SCOPE_RULES.find((h) => h.id === rnWithoutOrderId(id));
  return !!r && (!r.roles || r.roles.includes(s.role)) && (!r.when || r.when(s, sc, id)) && !s.penalties.some((p) => p.id === r.id);
}

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
  { id: 'cardioversion-digoxin-toxicity', actions: ['cardiovert'], when: (s, sc) => s.pulse && hasProblem(sc, ['digoxin-toxicity']), points: 8, severity: 'major', text: 'Electrical cardioversion of a digoxin-toxic heart. The shock can set off VT or VF that does not respond to further shocks (emergency medicine and toxicology references): treat the toxicity first — digoxin Fab and the potassium — with lidocaine or pacing for the arrhythmia, and cardiovert only a rhythm that is about to kill, at the lowest energy.' },
  // AF or flutter of 48 hours or more (or unknown onset) without 3 weeks of anticoagulation or a TEE: converting it,
  // electrically or with procainamide, can throw a clot from the left atrium. An unstable patient is cardioverted at once
  { id: 'cardioversion-unanticoagulated', actions: ['cardiovert', 'procainamide'], when: (s, sc) => hasProblem(sc, ['af-over-48h']) && afOrFlutter(s) && !lowPressure(s) && s.vitals.gcs >= 14, points: 10, severity: 'major', text: 'Converting atrial fibrillation or flutter that has lasted 48 hours or more (or began at an unknown time) without anticoagulation. A clot may have formed in the left atrium, and restoring the rhythm — with a shock or with procainamide — can throw it out as a stroke: 3 weeks of anticoagulation, or a TEE that shows no clot, first (2023 ACC/AHA/ACCP/HRS AF guideline, COR 1). A stable patient gets rate control and anticoagulation; only an unstable one is cardioverted at once.' },
  // the same id as the cases that score it in their own words (svt, af-rvr, stable VT, WPW, unstable AF in the ED)
  { id: 'no-sedation', actions: ['cardiovert'], when: (s) => tachyarrhythmia(s) && s.vitals.gcs >= 14 && unsedated(s), points: 3, severity: 'minor', text: 'Synchronized cardioversion of an awake patient without sedation or analgesia. Sedate a conscious patient whenever there is time (2025 AHA) — a reduced dose of a drug that spares the pressure, with the airway kit ready.' },

  // ─── The arrest drugs ──────────────────────────────────────────────────────
  { id: 'arrest-epi-with-pulse', actions: ['epinephrine'], when: (s) => s.pulse, points: 15, severity: 'critical', text: '1 mg IV epinephrine is the cardiac-arrest dose. With a pulse it causes severe hypertension, arrhythmias and ischemia; use push-dose epinephrine or an infusion.' },
  // the same id as vf-arrest-field's
  { id: 'epi-before-shock', actions: ['epinephrine'], when: (s) => shockable(s) && !shockedThisArrest(s), points: 3, severity: 'minor', text: 'Epinephrine before the first shock in VF or pulseless VT. The shock comes first: every minute without one lowers the chance of survival, and epinephrine is given once shocks have failed — after the second (2025 AHA).' },
  // the same id as the PEA and the ED's VF arrest
  { id: 'epi-too-soon', actions: ['epinephrine'], when: (s) => !s.pulse && ((t) => t !== null && s.minute - t < 3)(lastDoneAt(s, ['epinephrine'], s.timers.arrestAt ?? 0)), points: 3, severity: 'minor', text: 'Epinephrine again within 3 minutes of the last dose. The arrest dose is 1 mg every 3–5 minutes (2025 AHA): sooner adds nothing to the arrest, only to the fast, irritable, oxygen-hungry heart that follows a return of circulation.' },
  // pre-excited AF is scored by av-blocker-preexcited-af (one mistake, one penalty)
  { id: 'arrest-amio-with-pulse', actions: ['amio-arrest'], when: (s) => s.pulse && !preexcitedAf(s), points: 10, severity: 'major', text: 'A 300 mg amiodarone push is for cardiac arrest. With a pulse, give 150 mg over 10 minutes.' },
  // the same id as torsades-field's
  { id: 'amiodarone-arrest-long-qt', actions: ['amio-arrest'], when: (s, sc) => !s.pulse && longQt(s, sc), points: 3, severity: 'minor', text: 'Amiodarone 300 mg in a torsades or long-QT arrest. It lengthens the QT further and can keep torsades going: defibrillate, give 2 g of IV magnesium, and correct the potassium (2025 AHA).' },
  { id: 'antiarrhythmic-nonshockable', actions: ['amio-arrest', 'lidocaine'], when: (s) => !s.pulse && !shockable(s), points: 3, severity: 'minor', text: 'Amiodarone or lidocaine in PEA or asystole. They are for VF or pulseless VT that shocks have not fixed (2025 AHA): a rhythm that cannot be shocked gets CPR, epinephrine and a search for the cause.' },
  // the same id as wpw-af-field's. An indication rule: the ER nurse's missing order stands in for it
  { id: 'rate-drug-in-arrest', actions: [...ADENOSINE_PUSH, ...IV_BETA_BLOCKERS, 'diltiazem', 'amio-infusion'], when: (s, sc, id) => !s.pulse && !nurseWithoutOrder(s, sc, id), points: 3, severity: 'minor', text: 'A drug for a tachycardia with a pulse, given in cardiac arrest. Adenosine, beta-blockers, diltiazem and the 150 mg amiodarone infusion are not arrest drugs: CPR, a shock for VF or pulseless VT, epinephrine and — for shock-refractory VF — amiodarone 300 mg or lidocaine (2025 AHA).' },

  // ─── Pacing and the transvenous wire ───────────────────────────────────────
  // pads on standby over a paced heart (a temporary wire) are a backup, not a mistake
  { id: 'pace-not-slow', actions: ['pace'], when: (s) => s.pulse && s.rhythm.hr >= 50 && !paced(s), points: 5, severity: 'minor', text: 'Transcutaneous pacing without a slow heart rate to treat. Pacing is for symptomatic bradycardia (usually under 50/min) that atropine has not fixed.' },
  { id: 'pace-in-arrest', actions: ['pace'], when: (s) => !s.pulse, points: 5, severity: 'major', text: 'Pacing in cardiac arrest. It does not restart a heart in arrest and cannot treat VF: CPR, a shock for VF or pulseless VT, and epinephrine.' },
  // the same id as torsades-field's. A patient who is crashing (a low pressure) is paced first
  { id: 'pace-no-analgesia', actions: ['pace'], when: (s) => s.pulse && s.rhythm.hr < 50 && !paced(s) && s.vitals.gcs >= 13 && !lowPressure(s) && unsedated(s), points: 2, severity: 'minor', text: 'Transcutaneous pacing of an awake patient, with a pressure that allows analgesia, and none given. Each paced beat jolts the chest wall: fentanyl or a small titrated sedative first (2025 AHA) — without delaying pacing in a patient who is crashing.' },
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
  // a block below the AV node (Mobitz II, complete heart block) that the first dose did not lift
  { id: 'atropine-infranodal-repeat', actions: ['atropine'], when: (s) => s.pulse && has(s, 'atropine') && ['mobitz2', 'chb'].includes(rhythmKind(s)) && !paced(s), points: 3, severity: 'minor', text: 'Repeat atropine for a Mobitz II or complete heart block the first dose did not help. The block sits below the AV node, where atropine does not reach (2018 ACC/AHA/HRS bradycardia; 2025 AHA): pace, or start an epinephrine or dopamine infusion.' },

  // ─── Magnesium ─────────────────────────────────────────────────────────────
  { id: 'magnesium-routine-arrest', actions: ['magnesium-sulfate'], when: (s, sc) => !s.pulse && !longQt(s, sc), points: 3, severity: 'minor', text: 'Magnesium in a cardiac arrest without torsades. Routine magnesium does not help VF, pulseless VT, PEA or asystole; it is for torsades de pointes.' },
  { id: 'magnesium-renal-failure', actions: ['magnesium-sulfate'], when: (_s, sc) => hasProblem(sc, ['renal-failure', 'dialysis']), points: 5, severity: 'major', text: 'IV magnesium with failing kidneys. The kidneys clear magnesium: with severe kidney disease or on dialysis it builds up — weakness, a falling pressure, heart block and slowed breathing (magnesium sulfate label: caution in renal impairment). Give it only for torsades or a proven low magnesium, at a reduced dose, with levels.' },
  // the same id as the beta-blocker overdose and the LVAD cases'. AF and flutter: magnesium is a fair adjunct for the rate
  { id: 'magnesium-no-indication', actions: ['magnesium-sulfate'], when: (s, sc) => s.pulse && !longQt(s, sc) && !hasProblem(sc, ['hypomagnesemia']) && !['af', 'flutter'].includes(rhythmKind(s)), points: 3, severity: 'minor', text: 'IV magnesium with no torsades, long QT or low magnesium to treat. It drops the pressure and slows conduction — its label rules parenteral magnesium out in heart block — and it does nothing for this rhythm.' },

  // ─── Vagal maneuvers ───────────────────────────────────────────────────────
  // the same id as the hyperkalemia cases'
  { id: 'vagal-slow', actions: ['vagal'], when: (s) => s.pulse && !paced(s) && (AV_BLOCKS.includes(rhythmKind(s)) || s.rhythm.hr < 60), points: 3, severity: 'minor', text: 'A vagal maneuver with a slow pulse. It slows the sinus and AV nodes further; it is for a regular narrow-complex tachycardia (2015 ACC/AHA/HRS SVT guideline).' },

  // ─── The rate and AV-nodal drugs (one ladder: RATE_LADDER) ─────────────────
  { id: 'av-blocker-preexcited-af', actions: [...AV_NODAL_BLOCKERS, 'amio-arrest'], when: (s) => preexcitedAf(s), points: 15, severity: 'critical', text: 'An AV-nodal blocker in pre-excited atrial fibrillation. Blocking the node sends every impulse down the accessory pathway: the rate climbs and it can turn into VF (2023 ACC/AHA/ACCP/HRS AF guideline: adenosine, diltiazem, verapamil, digoxin, IV amiodarone and beta-blockers — 3: Harm). Unstable: synchronized cardioversion; stable: cardioversion, or IV procainamide or ibutilide.' },
  // diltiazem's contraindications (verapamil is the same drug class; the simulator offers it only intracoronary)
  { id: 'diltiazem-vt', actions: ['diltiazem'], when: (s) => s.pulse && ['vt', 'torsades'].includes(rhythmKind(s)), points: 15, severity: 'critical', text: 'Diltiazem for ventricular tachycardia. Treat a wide-complex tachycardia as VT until proven otherwise: diltiazem and verapamil drop the pressure and can turn VT into VF or arrest (2025 AHA: 3 — Harm). A stable monomorphic VT gets procainamide or amiodarone; an unstable one, synchronized cardioversion.' },
  { id: 'diltiazem-heart-failure', actions: ['diltiazem'], when: (s, sc) => s.pulse && hasProblem(sc, ['heart-failure', 'pulmonary-edema']), points: 15, severity: 'critical', text: 'Diltiazem in a patient with heart failure — a reduced ejection fraction or acute pulmonary edema. Calcium-channel blockers weaken the squeeze and open the vessels: with an ejection fraction of 40 % or less, or a decompensated heart, IV diltiazem and verapamil must not be given (2023 ACC/AHA/ACCP/HRS AF guideline: 3 — Harm). Control the rate with amiodarone, or a beta-blocker if the lungs are not congested; an unstable patient needs synchronized cardioversion.' },
  { id: 'nodal-blocker-slow', actions: RATE_DRUGS, when: (s) => slowOrBlocked(s), points: 10, severity: 'major', text: 'An AV-nodal blocker or amiodarone with a second- or third-degree AV block or a heart rate under 50. Their labels rule them out without a working pacemaker (metoprolol, diltiazem, verapamil: sick sinus or AV block beyond first degree; adenosine: AV block, sinus node disease, symptomatic bradycardia; IV amiodarone: marked sinus bradycardia, AV block): they slow the rate further and can stop the heart. A symptomatic slow rate gets atropine, pacing or an epinephrine or dopamine infusion.' },
  { id: 'adenosine-wide-unstable', actions: ADENOSINE_PUSH, when: (s) => s.pulse && (rhythmKind(s) === 'torsades' || (rhythmKind(s) === 'vt' && lowPressure(s))), points: 8, severity: 'major', text: 'Adenosine for an unstable or polymorphic wide-complex tachycardia (2025 AHA: 3 — Harm). It cannot stop VT, it drops the pressure and its pause can set off VF: unstable VT gets synchronized cardioversion, sustained polymorphic VT defibrillation. Adenosine is only a diagnostic try for a stable, regular, monomorphic one.' },
  { id: 'beta-blocker-stimulant', actions: BETA_BLOCKERS, when: (_s, sc) => hasProblem(sc, ['sympathomimetic-toxicity']), points: 8, severity: 'major', text: 'A beta-blocker in acute cocaine or stimulant toxicity. With the beta receptors blocked, the stimulant\'s alpha effect goes unopposed: worse coronary spasm and a higher pressure (2014 ACC/AHA NSTE-ACS guideline: no beta-blocker with signs of acute intoxication). A benzodiazepine first, then nitroglycerin for the chest pain and the pressure.' },
  { id: 'nodal-blocker-hypotension', actions: [...BETA_BLOCKERS, 'diltiazem'], when: (s) => s.pulse && lowPressure(s), points: 8, severity: 'major', text: 'A beta-blocker or IV diltiazem with a systolic under 90 (with an LVAD, a Doppler MAP under 60). Severe hypotension and cardiogenic shock rule out IV diltiazem, and cardiogenic shock or a systolic under 100 in an MI rule out IV metoprolol: both weaken the squeeze and drop the pressure further. A tachycardia that is causing the low pressure is unstable — synchronized cardioversion (2025 AHA); a low pressure from anything else needs its cause treated.' },
  // the same id as the left-main, guide-dissection and air-embolism cases'
  { id: 'cocktail-low-pressure', actions: VERAPAMIL, when: (s) => s.pulse && lowPressure(s), points: 5, severity: 'major', text: 'Verapamil — the radial cocktail, or intracoronary — with a systolic under 90 (with an LVAD, a Doppler MAP under 60). Its label rules it out in severe hypotension and cardiogenic shock, and the cocktail\'s nitroglycerin drops the pressure too: give the sheath its heparin alone, and treat the pressure first.' },
  // after a failed shock, amiodarone to help the next one hold is fair (2025 AHA)
  { id: 'amiodarone-hypotension', actions: ['amio-infusion'], when: (s) => s.pulse && lowPressure(s) && !(tachyarrhythmia(s) && ((s.counts.cardiovert ?? 0) + (s.counts.defib ?? 0)) > 0), points: 5, severity: 'major', text: 'An amiodarone infusion with a systolic under 90. Cardiogenic shock rules out IV amiodarone and hypotension is its commonest effect (label): an unstable tachycardia gets synchronized cardioversion first, and a low pressure with no arrhythmia gets its cause treated.' },
  { id: 'ic-vasodilator-hypotension', actions: ['ic-adenosine'], when: (s) => s.pulse && lowPressure(s) && !slowOrBlocked(s), points: 6, severity: 'major', text: 'Intracoronary adenosine with a systolic under 90 (with an LVAD, a Doppler MAP under 60). It drops the pressure and slows the AV node, and a lower perfusion pressure makes no-reflow worse: hold the pressure up first, or use intracoronary epinephrine.' },
  { id: 'beta-blocker-mi-shock-risk', actions: IV_BETA_BLOCKERS, when: (s, sc) => s.pulse && hasProblem(sc, ['acs']) && !lowPressure(s) && (s.vitals.sbp < 100 || s.rhythm.hr > 110), points: 8, severity: 'major', text: 'An IV beta-blocker in an acute MI with signs of shock risk — a systolic under 100 or a heart rate over 110. The metoprolol injection label rules it out in an MI with a systolic under 100, a heart rate under 45 or moderate to severe heart failure, and early IV beta-blockade with shock-risk factors brought on cardiogenic shock (COMMIT; 2013 ACCF/AHA STEMI; 2025 ACC/AHA ACS: no early IV beta-blocker with signs of heart failure, low output or shock risk). Start an oral beta-blocker within 24 hours, once the patient is stable.' },
  { id: 'beta-blocker-pulmonary-edema', actions: BETA_BLOCKERS, when: (s, sc) => s.pulse && hasProblem(sc, ['pulmonary-edema']), points: 8, severity: 'major', text: 'A beta-blocker with fluid on the lungs. Decompensated heart failure rules out beta-blockade (metoprolol label; 2022 AHA/ACC/HFSA heart failure; 2025 ACC/AHA ACS): it takes away the squeeze and the rate the failing heart is living on. Treat the congestion — sit up, CPAP, nitroglycerin for a high pressure — and a fast rhythm with amiodarone or synchronized cardioversion.' },
  { id: 'adenosine-asthma', actions: ADENOSINE_PUSH, when: (_s, sc) => hasProblem(sc, ['asthma', 'bronchospasm']), points: 8, severity: 'major', text: 'Adenosine in a patient with asthma or bronchospasm. It can set off severe bronchospasm (adenosine labels: avoid it, or do not give it, in bronchoconstrictive or bronchospastic lung disease): a stable regular SVT gets vagal maneuvers, then IV diltiazem; an unstable one, synchronized cardioversion.' },
  { id: 'labetalol-asthma', actions: ['labetalol'], when: (_s, sc) => hasProblem(sc, ['asthma', 'bronchospasm']), points: 8, severity: 'major', text: 'Labetalol in a patient with asthma or bronchospasm. It blocks the β2 receptors of the airways as well as β1, and its label rules it out in bronchial asthma: it can set off severe bronchospasm. Lower the pressure with a drug that spares the airways (nicardipine), and the rate with diltiazem.' },
  { id: 'beta-blocker-bronchospasm', actions: ['metoprolol', 'metoprolol-po', 'esmolol'], when: (_s, sc) => hasProblem(sc, ['asthma', 'bronchospasm']), points: 5, severity: 'major', text: 'A beta-blocker in a patient with asthma or bronchospasm. Even a β1-selective blocker (metoprolol, esmolol) loses its selectivity as the dose rises and can tighten the airways (labels: caution in bronchospastic disease): never during active wheezing — control the rate with diltiazem instead.' },
  // a denervated heart, dipyridamole or carbamazepine: 3 mg is the first dose (adenosine label)
  { id: 'adenosine-full-dose', actions: ['adenosine6', 'adenosine12'], when: (s, sc) => hasProblem(sc, ['heart-transplant', 'adenosine-potentiator']) && !did(s, 'adenosine3'), points: 5, severity: 'major', text: 'Adenosine 6 or 12 mg with a transplanted heart, dipyridamole or carbamazepine. The denervated heart, and these drugs, make adenosine\'s effect much stronger and longer — a prolonged asystole: its label starts at 3 mg.' },
  { id: 'iv-beta-blocker-with-diltiazem', actions: [...IV_BETA_BLOCKERS, 'diltiazem'], when: (s, _sc, id) => s.pulse && !preexcitedAf(s) && ((IV_BETA_BLOCKERS.includes(id) && did(s, 'diltiazem')) || (id === 'diltiazem' && IV_BETA_BLOCKERS.some((b) => did(s, b)))), points: 5, severity: 'major', text: 'IV diltiazem and an IV beta-blocker together. The diltiazem label rules out giving them together or within a few hours of each other, and the esmolol label reports fatal arrests with IV calcium-channel blockers given close together: profound bradycardia, heart block and a falling pressure. Choose one.' },
  { id: 'amiodarone-long-qt', actions: ['amio-infusion'], when: (s, sc) => s.pulse && longQt(s, sc), points: 5, severity: 'major', text: 'Amiodarone with a long QT. It lengthens the QT further and can set off (or keep up) torsades de pointes: magnesium, potassium, a faster heart rate and stopping the QT-prolonging drugs are the treatment.' },
  // when one antiarrhythmic has not worked, the next step is a shock or expert advice, not a second drug on top
  { id: 'amiodarone-after-procainamide', actions: ['amio-infusion'], when: (s) => s.pulse && has(s, 'procainamide'), points: 5, severity: 'minor', text: 'Amiodarone on top of procainamide. Both lengthen the QT and drop the pressure: when one antiarrhythmic fails, cardiovert (with sedation) or get expert advice instead of adding another.' },
  // a pressor holding the systolic over 90 does not take the shock away
  { id: 'verapamil-cardiogenic-shock', actions: VERAPAMIL, when: (s, sc) => s.pulse && !lowPressure(s) && hasProblem(sc, ['cardiogenic-shock']), points: 3, severity: 'minor', text: 'Verapamil in cardiogenic shock. Its label rules it out in shock, even with the pressure held up by an infusion: it weakens the squeeze and opens the vessels. Give the sheath its heparin alone (and nitroglycerin only if the pressure allows).' },
  { id: 'amiodarone-may-convert', actions: ['amio-infusion'], when: (s, sc) => hasProblem(sc, ['af-over-48h']) && afOrFlutter(s), points: 3, severity: 'minor', text: 'An amiodarone infusion for atrial fibrillation or flutter of 48 hours or more without anticoagulation. Amiodarone can convert the rhythm as well as slow it, with the same risk of a stroke as a cardioversion (2023 ACC/AHA/ACCP/HRS AF guideline): control the rate with a drug that does not convert, and anticoagulate.' },
  // the same id as the guide-dissection case's. After ROSC an amiodarone infusion is fair, and diltiazem is a rate drug for a
  // dissection (the dissection cases judge it)
  { id: 'antiarrhythmic-no-arrhythmia', actions: [...ADENOSINE_PUSH, 'diltiazem', 'amio-infusion', 'procainamide'], when: (s, sc, id) => s.pulse && !tachyarrhythmia(s) && !['vt', 'torsades'].includes(rhythmKind(s)) && !slowOrBlocked(s) && !(id === 'amio-infusion' && has(s, 'rosc')) && !(id === 'diltiazem' && hasProblem(sc, ['aortic-dissection'])), points: 3, severity: 'minor', text: 'An antiarrhythmic or AV-nodal drug with no tachyarrhythmia to treat. Adenosine, diltiazem, an amiodarone infusion and procainamide are for a fast arrhythmia — SVT, atrial fibrillation or flutter with a fast rate, or VT (2025 AHA tachycardia algorithm): with a normal rhythm, or a sinus tachycardia that is the body\'s answer to something else, they only slow the heart and drop the pressure. Treat the cause.' },

  // ─── Lidocaine ─────────────────────────────────────────────────────────────
  { id: 'lidocaine-slow-or-block', actions: ['lidocaine'], when: (s) => slowOrBlocked(s), points: 10, severity: 'major', text: 'Lidocaine with heart block or a slow rate. Its label rules it out in Stokes-Adams attacks and in severe sinoatrial, AV or intraventricular block without a pacemaker: it can suppress the escape beats that keep the patient alive. Pace, or speed the rate.' },
  // a class I drug deepens the sodium-channel block the potassium has made, in an arrest too
  { id: 'antiarrhythmic-hyperkalemia', actions: ['lidocaine', 'procainamide', 'amio-infusion', 'amio-arrest'], when: (_s, sc) => hasProblem(sc, ['hyperkalemia']), points: 10, severity: 'major', text: 'An antiarrhythmic in hyperkalemia. The wide, slow complexes come from the potassium, not from an irritable ventricle: lidocaine, procainamide and amiodarone deepen the block the potassium has already made and can turn it into a sine wave or asystole. Calcium first, then shift the potassium (insulin with dextrose, albuterol) and remove it.' },
  // the same id as the guide-dissection and vasovagal cases'. After ROSC from VF, lidocaine may be considered (2025 AHA)
  { id: 'lidocaine-no-arrhythmia', actions: ['lidocaine'], when: (s) => s.pulse && !['vt', 'torsades'].includes(rhythmKind(s)) && !has(s, 'rosc'), points: 3, severity: 'minor', text: 'Lidocaine with no ventricular arrhythmia to treat. Lidocaine to prevent VF in an acute MI is not recommended (more asystole, no benefit), it does nothing for atrial or AV-nodal rhythms, and its label rules it out in WPW: a stable wide tachycardia gets procainamide or amiodarone.' },

  // ─── Procainamide: the stop rules and contraindications on its drug card (2025 AHA tachycardia algorithm) ───
  { id: 'procainamide-in-arrest', actions: ['procainamide'], when: (s) => !s.pulse, points: 3, severity: 'minor', text: 'Procainamide in cardiac arrest. It is a slow infusion (20–50 mg/min), not an arrest drug: amiodarone 300 mg or lidocaine is.' },
  // a pacer (pads or a wire) protects against the block it would deepen
  { id: 'procainamide-slow', actions: ['procainamide'], when: (s) => slowOrBlocked(s), points: 10, severity: 'major', text: 'Procainamide with AV block or a slow heart rate. It slows conduction further and can stop the heart; it is a drug for tachycardia.' },
  { id: 'procainamide-long-qt', actions: ['procainamide'], when: (s, sc) => longQt(s, sc), points: 10, severity: 'major', text: 'Procainamide with a long QT. It lengthens the QT further and can set off torsades de pointes.' },
  { id: 'procainamide-hypotension', actions: ['procainamide'], when: (s) => s.pulse && lowPressure(s), points: 8, severity: 'major', text: 'Procainamide with a systolic pressure under 90 mmHg. Hypotension is one of its stop rules, so it is no drug to start with one: an unstable tachycardia needs synchronized cardioversion.' },
  { id: 'procainamide-heart-failure', actions: ['procainamide'], when: (_s, sc) => hasProblem(sc, ['heart-failure']), points: 8, severity: 'major', text: 'Procainamide in a patient with heart failure. It weakens the squeeze and drops the pressure: in heart failure use amiodarone, or synchronized cardioversion.' },
  { id: 'procainamide-after-amiodarone', actions: ['procainamide'], when: (s) => s.pulse && has(s, 'amiodarone'), points: 5, severity: 'minor', text: 'Procainamide on top of amiodarone. Both lengthen the QT and drop the pressure: when one antiarrhythmic fails, cardiovert (with sedation) or get expert advice instead of adding another.' },
  { id: 'procainamide-sodium-channel', actions: ['procainamide'], when: (_s, sc) => hasProblem(sc, ['sodium-channel-blocker-overdose']), points: 10, severity: 'major', text: 'Procainamide in a tricyclic or other sodium-channel-blocker overdose. As a class IA drug it deepens the sodium-channel block — a wider QRS, a lower pressure and more ventricular arrhythmias (toxicology references): sodium bicarbonate, then lidocaine.' },

  // ─── The cath lab's adenosine infusion for an FFR (Adenoscan label) ────────
  { id: 'ffr-adenosine-unsafe', actions: ['adenosine-iv-ffr'], when: (s, sc) => s.pulse && (slowOrBlocked(s) || lowPressure(s) || hasProblem(sc, ['asthma', 'bronchospasm'])), points: 8, severity: 'major', text: 'IV adenosine for hyperemia with AV block, a slow rate, a low pressure, or asthma or bronchospasm. Its label rules the infusion out in second- or third-degree AV block and sinus node disease without a pacemaker and in bronchospastic lung disease, and it drops the pressure: measure a resting index (iFR or RFR) instead, or treat the patient first.' },
  { id: 'ffr-adenosine-no-wire', actions: ['adenosine-iv-ffr'], when: (s) => !has(s, 'equalized') && !has(s, 'wired'), points: 3, severity: 'minor', text: 'An adenosine infusion with no pressure wire in place. It is the hyperemia for an FFR measurement; with nothing to measure it only flushes, slows the AV node and drops the pressure.' },
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
  'beta-blocker-stimulant',
  'nodal-blocker-hypotension', 'cocktail-low-pressure', 'amiodarone-hypotension', 'ic-vasodilator-hypotension',
  'beta-blocker-mi-shock-risk',
  'beta-blocker-pulmonary-edema',
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
    'procainamide-after-amiodarone', 'procainamide-sodium-channel', 'antiarrhythmic-hyperkalemia', 'cardioversion-unanticoagulated',
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
  'adenosine-iv-ffr': ['ffr-adenosine-unsafe', 'ffr-adenosine-no-wire'],
};

/**
 * The rules of RATE_LADDER that came after its older ones (av-blocker-preexcited-af, the two diltiazem rules,
 * beta-blocker-stimulant and the two amiodarone rules). A case rule that says a rate or AV-nodal drug is wrong for its
 * patient lists them in its `replaces`: while it applies it speaks for the dose, whichever of them the gate would have
 * charged (one dose, one penalty). The older rules still charge beside it unless the case names them, as before.
 */
export const RATE_RULES = RATE_LADDER.filter((id) => ![
  'av-blocker-preexcited-af', 'diltiazem-vt', 'diltiazem-heart-failure', 'beta-blocker-stimulant', 'amiodarone-long-qt', 'amiodarone-after-procainamide',
].includes(id));
/** Every rule on lidocaine: a case rule that says lidocaine is wrong for its patient lists them in its `replaces` */
export const LIDOCAINE_RULES = LADDERS.lidocaine;

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
