/**
 * Built-in safety rules for supportive care: CPR, the airway and RSI, the electrolytes and antidotes, glucose, the
 * vasopressors (infusion, push-dose and intracoronary epinephrine, phenylephrine), the legs, fluids and blood.
 *
 * One dose, one penalty: where several rules here judge the same action, each lower one is written to stay silent while
 * a higher one applies (the gate order is noted above each group).
 */
import { LOW_GLUCOSE, canSwallow, count, has, mapOf, paced, ventilated } from '../kit';
import type { Harm, Problem, Scenario, SimState } from '../types';
import {
  BICARBONATE_FOR, CALCIUMS, CALCIUM_FOR, did, hasProblem, lowPressure, lvadPerfusing, preloadDependent, procedureComing, shockable,
  shockedThisArrest, tachyarrhythmia,
} from './helpers';

// ─── Vasopressors: what each rule reads ────────────────────────────────────

/**
 * No low pressure for a vasopressor infusion or push-dose epinephrine to treat: a systolic of 90 or more and a MAP of 65
 * or more (with an LVAD, the Doppler MAP), no slow rate of its own (a pressor with a chronotropic effect is a bridge for a
 * symptomatic bradycardia that atropine has not fixed) and no beta- or calcium-channel-blocker overdose (where epinephrine
 * or norepinephrine is part of the antidote)
 */
const pressorNotLow = (s: SimState, sc: Scenario) =>
  s.pulse && !lowPressure(s) && mapOf(s.vitals) >= 65 && !(s.rhythm.hr < 50 && !paced(s)) && !hasProblem(sc, ['beta-blocker-overdose', 'ccb-overdose']);
/** Dynamic LV outflow obstruction with a pulse: what every catecholamine makes worse */
const lvoto = (s: SimState, sc: Scenario) => s.pulse && hasProblem(sc, ['lvot-obstruction']);
/** A bleeding patient with nothing yet given to fill the circulation */
const noVolumeYet = (s: SimState, sc: Scenario) => s.pulse && hasProblem(sc, ['bleeding']) && !has(s, 'fluid') && !has(s, 'transfused');
/** Phenylephrine with no low pressure to treat: a systolic of 120 or more (with an LVAD, a Doppler MAP of 70 or more) */
const phenylephrineNotLow = (s: SimState) => s.pulse && (s.lvad ? mapOf(s.vitals) >= 70 : s.vitals.sbp >= 120);
/** Phenylephrine onto a slow heart of its own: the reflex slowing it brings makes the bradycardia worse */
const phenylephrineSlow = (s: SimState) => s.pulse && s.rhythm.hr < 50 && !paced(s);

// ─── Breathing: what each rule reads ───────────────────────────────────────

/** Not breathing for themselves: no pulse, or too few breaths (under 8) or no airway reflexes (GCS 8 or less) with nobody bagging */
const notBreathing = (s: SimState) => !s.pulse || ((s.vitals.rr < 8 || s.vitals.gcs <= 8) && !ventilated(s));
/** Glucagon in the last half hour: vomiting is the rule at the antidote doses */
const vomitingLikely = (s: SimState) => has(s, 'glucagon') && s.minute - s.flags.glucagon <= 30;
/** A drowsy patient in the field (GCS 9–12): no airway reflexes to trust under a sealed mask, and nobody watching them alone */
const drowsyInField = (s: SimState, sc: Scenario) => sc.setting === 'field' && s.vitals.gcs >= 9 && s.vitals.gcs <= 12;
// ─── Electrolytes and antidotes: what each rule reads ──────────────────────

/**
 * What sodium bicarbonate treats with a pulse: a metabolic acidosis, or a sodium-channel-blocker (e.g. tricyclic)
 * overdose. Hyperkalemia alone is not one — bicarbonate shifts little potassium without an acidosis (KDIGO 2020) — but in
 * a hyperkalemic arrest it is (BICARBONATE_FOR, the arrest list)
 */
const BICARBONATE_WITH_A_PULSE: Problem[] = ['metabolic-acidosis', 'sodium-channel-blocker-overdose'];
const bicarbonateNoIndication = (s: SimState, sc: Scenario) => !hasProblem(sc, s.pulse ? BICARBONATE_WITH_A_PULSE : BICARBONATE_FOR);
/** A massive transfusion (4 units or more): the citrate in the blood binds the ionized calcium */
const massiveTransfusion = (s: SimState) => count(s, 'transfuse') >= 4;
/** High-dose albuterol has nothing to treat (albuterol-hyperk-no-indication) */
const albuterolHyperkNoIndication = (sc: Scenario) => !hasProblem(sc, ['hyperkalemia']);
/** Glucagon has nothing to treat: no beta- or calcium-channel-blocker overdose */
const glucagonNoIndication = (sc: Scenario) => !hasProblem(sc, ['beta-blocker-overdose', 'ccb-overdose']);
/** Glucagon's vomiting with no airway reflexes (GCS 8 or less) and no airway in */
const unprotectedAirway = (s: SimState) => s.pulse && s.vitals.gcs <= 8 && !has(s, 'airway');

/** The rules on the RSI before the one for a preload-dependent heart (see rsi-preload-dependent) */
const rsiNoIndication = (s: SimState) => s.pulse && s.vitals.gcs >= 13 && s.vitals.spo2 >= 92 && s.vitals.rr >= 10 && s.vitals.rr <= 30 && !lowPressure(s);
const rsiUnresuscitated = (s: SimState) => s.pulse && lowPressure(s) && !has(s, 'pressor') && !has(s, 'push-epi');

export const SUPPORT_RULES: Harm[] = [
  { id: 'cpr-with-pulse', actions: ['cpr'], when: (s) => s.pulse && !s.lvad, points: 10, severity: 'major', text: 'Chest compressions on a patient with a pulse. Check for a pulse (no more than 10 seconds) before starting CPR.' },
  // the LVAD patient whose pump is perfusing has no pulse to check: the mistake is a different one, and so is the lesson
  { id: 'cpr-lvad-perfusing', actions: ['cpr'], when: (s) => lvadPerfusing(s), points: 10, severity: 'major', text: 'Chest compressions on an LVAD patient whose pump is perfusing. A continuous-flow pump leaves no pulse to feel: judge perfusion instead — responsiveness, skin color and temperature, capillary refill, a Doppler MAP over 50 (2025 AHA durable LVAD algorithm). An unresponsive LVAD patient whose perfusion is inadequate gets compressions without delay, pump or no pump; one who is perfusing needs the cause of the problem found, not CPR.' },
  // Oxygen. Gate order: oxygen-not-breathing > oxygen-normoxic
  { id: 'oxygen-not-breathing', actions: ['o2-nc', 'o2-nrb'], when: (s) => notBreathing(s), points: 3, severity: 'minor', text: 'Oxygen by mask or cannula for a patient who is not breathing for themselves. A mask or a cannula only offers oxygen to someone who breathes: with no pulse, fewer than 8 breaths a minute or no airway reflexes (GCS 8 or less), squeeze it in — a bag-mask with oxygen (2025 AHA).' },
  // the case says the patient has an acute coronary syndrome (Problem 'acs'): not the tracing, since an air embolism in the
  // lab shows ST elevation and needs the oxygen
  { id: 'oxygen-normoxic', actions: ['o2-nc', 'o2-nrb'], when: (s, sc) => s.pulse && hasProblem(sc, ['acs']) && s.vitals.spo2 >= 90 && s.vitals.rr <= 24 && !has(s, 'rosc') && !hasProblem(sc, ['pulmonary-edema']) && !notBreathing(s), points: 2, severity: 'minor', text: 'Oxygen with an SpO₂ of 90 % or more in an acute coronary syndrome. It brings no benefit, and too much oxygen may enlarge the infarct (2025 ACC/AHA ACS): oxygen is for an SpO₂ under 90 %, or for respiratory distress.' },

  // CPAP. Gate order: cpap-hypotension > cpap-vomiting > cpap-preload-dependent > cpap-drowsy > cpap-no-indication
  { id: 'cpap-hypotension', actions: ['cpap'], when: (s) => s.pulse && lowPressure(s), points: 6, severity: 'major', text: 'CPAP with a systolic under 90 (with an LVAD, a Doppler MAP under 60). Positive pressure in the chest cuts the blood returning to the heart and drops the pressure further (EMS CPAP protocols: a systolic under 90 rules it out).' },
  { id: 'cpap-vomiting', actions: ['cpap'], when: (s) => s.pulse && !lowPressure(s) && vomitingLikely(s), points: 5, severity: 'major', text: 'CPAP within half an hour of glucagon. Vomiting is the rule at the antidote doses, and vomit under a sealed mask goes into the lungs: CPAP needs a patient who can take the mask off to vomit (EMS CPAP protocols: vomiting rules it out).' },
  { id: 'cpap-preload-dependent', actions: ['cpap'], when: (s, sc) => s.pulse && !lowPressure(s) && !vomitingLikely(s) && preloadDependent(s, sc), points: 6, severity: 'major', text: 'CPAP for a heart that lives on its preload: a tamponade not yet drained, a pulmonary embolism or a right-ventricular infarction. Positive pressure in the chest cuts the venous return that heart depends on (and with a clot in the lungs raises what the right ventricle pumps against): the pressure can crash. High-flow oxygen, and let the patient breathe on their own.' },
  { id: 'cpap-drowsy', actions: ['cpap'], when: (s, sc) => s.pulse && !lowPressure(s) && !vomitingLikely(s) && !preloadDependent(s, sc) && drowsyInField(s, sc), points: 3, severity: 'minor', text: 'CPAP for a drowsy patient (GCS 9–12). CPAP needs a patient who is awake, follows commands and can take the mask off to vomit: a drowsy one can aspirate under it, or stop breathing with nobody noticing. If the breathing is failing, assist it with a bag-mask (EMS CPAP protocols).' },
  { id: 'cpap-no-indication', actions: ['cpap'], when: (s, sc) => s.pulse && !lowPressure(s) && !vomitingLikely(s) && !preloadDependent(s, sc) && !drowsyInField(s, sc) && !hasProblem(sc, ['pulmonary-edema', 'bronchospasm']) && s.vitals.rr <= 24 && s.vitals.spo2 >= 94, points: 3, severity: 'minor', text: 'CPAP with no respiratory distress: breathing 24 a minute or less, an SpO₂ of 94 % or more, no fluid on the lungs and no wheeze. CPAP is for respiratory distress from pulmonary edema (or COPD and asthma); otherwise it only adds a tight mask, air in the stomach and a lower pressure (EMS CPAP protocols).' },

  // The bag-mask and the advanced airway. A bag-mask readied for a shock or a pacer (procedural sedation) is preparation
  { id: 'bvm-breathing', actions: ['bvm'], when: (s) => s.pulse && s.vitals.gcs > 8 && s.vitals.rr >= 10 && s.vitals.rr <= 30 && s.vitals.spo2 >= 90 && !procedureComing(s), points: 3, severity: 'minor', text: 'Bag-mask ventilation for a patient who is breathing well on their own (awake, 10–30 breaths a minute, an SpO₂ of 90 % or more). Breaths forced in over their own fill the stomach and make them fight the mask: give oxygen, and keep the bag for breathing that fails.' },
  { id: 'airway-awake', actions: ['airway'], when: (s) => s.pulse && s.vitals.gcs > 8, points: 10, severity: 'major', text: 'An advanced airway is not indicated in a patient who is awake and protecting their own airway.' },
  { id: 'airway-before-shock', actions: ['airway'], when: (s) => shockable(s) && !shockedThisArrest(s), points: 5, severity: 'major', text: 'An advanced airway before the first shock in VF or pulseless VT. The shock is what ends it, and every minute without one lowers survival: shock first, then compressions; the airway waits for a pause that costs nothing, and a bag-mask at 30:2 does until then (2025 AHA).' },
  // the emergency department's drug-assisted airway (ACEP clinical policy: monitoring and capnography). Gate order: the
  // first three (which may each apply) > rsi-preload-dependent
  { id: 'rsi-no-indication', actions: ['rsi'], when: (s) => rsiNoIndication(s), points: 10, severity: 'major', text: 'Rapid sequence intubation without an indication. A tube is for a patient who cannot protect the airway, cannot oxygenate or ventilate, or whose expected course will soon take one of those away; an awake patient breathing well, with a normal oxygen saturation and pressure, gets only its risks — a failed airway, aspiration, a falling pressure and the ventilator.' },
  { id: 'rsi-unmonitored', actions: ['rsi'], when: (s) => !has(s, 'monitor'), points: 5, severity: 'major', text: 'Rapid sequence intubation without the cardiac monitor on. The induction drug, the paralytic and positive-pressure ventilation can drop the pressure, the oxygen saturation and the heart rate within a minute: the ECG, pulse oximetry, the blood pressure and waveform capnography run before the first drug goes in.' },
  { id: 'rsi-unresuscitated', actions: ['rsi'], when: (s) => rsiUnresuscitated(s), points: 8, severity: 'major', text: 'Rapid sequence intubation with a low blood pressure and nothing to hold it up. The induction drug and positive-pressure ventilation drop the pressure further, and the patient can arrest around the tube: resuscitate before you intubate — fluids or blood, push-dose epinephrine or an infusion running — and give a reduced dose of the most stable induction drug.' },
  { id: 'rsi-preload-dependent', actions: ['rsi'], when: (s, sc) => s.pulse && s.vitals.gcs > 8 && preloadDependent(s, sc) && has(s, 'monitor') && !rsiNoIndication(s) && !rsiUnresuscitated(s), points: 10, severity: 'major', text: 'Intubating a heart that lives on its preload: a tamponade not yet drained, a right ventricle failing from a pulmonary embolism or an infarction. The induction drug drops the vascular tone and positive pressure cuts the venous return: the patient can arrest around the tube. Drain or treat the cause first; if the tube cannot wait, have a pressor running, give a reduced dose of a stable induction drug, and ventilate with small breaths and little PEEP.' },

  // Drugs for a specific problem: without it they cannot help and only bring their risks. The case lists what the patient
  // has (Scenario.problems); "not well established" in a hyperkalemic arrest (2025 AHA) is never penalized.
  // calcium also reverses part of the low pressure IV diltiazem causes: for that low pressure (a pulse, a systolic under 90)
  // it is a fair answer. Not routinely in a later arrest, and not once the pressure is back: one therapeutic dose is no overdose
  { id: 'calcium-no-indication', actions: CALCIUMS, when: (s, sc) => !hasProblem(sc, CALCIUM_FOR) && !(has(s, 'diltiazem') && s.pulse && lowPressure(s)) && !massiveTransfusion(s), points: 3, severity: 'minor', text: 'Calcium without an indication. It is for hyperkalemia, a calcium-channel- or beta-blocker overdose (or the low pressure IV diltiazem causes), a low calcium, or a massive transfusion (the citrate in the blood binds it); otherwise it does not help (routine calcium in cardiac arrest: no benefit, 2025 AHA), and it burns the tissue if it leaks.' },
  // Bicarbonate. Gate order: bicarbonate-no-indication > bicarbonate-unventilated
  { id: 'bicarbonate-no-indication', actions: ['sodium-bicarbonate'], when: (s, sc) => bicarbonateNoIndication(s, sc), points: 3, severity: 'minor', text: 'Sodium bicarbonate without an indication. It is for a metabolic acidosis or a sodium-channel-blocker (e.g. tricyclic) overdose — for hyperkalemia only with a metabolic acidosis (KDIGO 2020), or in the arrest; routine bicarbonate in cardiac arrest has no benefit (2025 AHA), and it adds a sodium load and CO₂ the lungs must clear.' },
  { id: 'bicarbonate-unventilated', actions: ['sodium-bicarbonate'], when: (s, sc) => !s.pulse && !ventilated(s) && !bicarbonateNoIndication(s, sc), points: 2, severity: 'minor', text: 'Sodium bicarbonate in a cardiac arrest with nobody breathing for the patient. It turns into CO₂ that only breaths can clear: unventilated, the CO₂ builds up in the blood and the cells and deepens the acidosis inside them. Bag-mask (or an airway) first.' },
  // Insulin. Gate order: insulin-hypoglycemia and insulin-no-indication > insulin-glucose-unchecked
  { id: 'insulin-hypoglycemia', actions: ['insulin-dextrose'], when: (s) => s.vitals.glucose < LOW_GLUCOSE, points: 10, severity: 'major', text: 'Insulin with a blood glucose under 70 mg/dL. Treat the low glucose first: insulin drives it lower, and the worst lows come 1–3 hours later.' },
  // 10 units is the potassium dose; a beta- or calcium-channel-blocker overdose needs far more, so it is too little there, not a mistake
  { id: 'insulin-no-indication', actions: ['insulin-dextrose'], when: (_s, sc) => !hasProblem(sc, ['hyperkalemia', 'beta-blocker-overdose', 'ccb-overdose']), points: 5, severity: 'minor', text: 'Insulin and dextrose without hyperkalemia. They shift potassium into the cells; with no high potassium they only risk a low glucose.' },
  // the nurses who push it (the lab nurse, the ER nurse) check the glucose first: a fingerstick, or the labs drawn
  { id: 'insulin-glucose-unchecked', actions: ['insulin-dextrose'], roles: [4, 6], when: (s, sc) => !did(s, 'glucose') && !has(s, 'labs') && s.vitals.glucose >= LOW_GLUCOSE && hasProblem(sc, ['hyperkalemia', 'beta-blocker-overdose', 'ccb-overdose']), points: 2, severity: 'minor', text: 'Insulin with no glucose checked first. A fingerstick (or the labs) before the dose: a low or low-normal glucose needs more dextrose with it, and the hourly checks that follow need a starting value — the lows come 1–3 hours later.' },
  // the wheezing dose: wheeze from asthma, COPD or anaphylaxis is what it opens (crackles are fluid, not bronchospasm)
  { id: 'albuterol-no-bronchospasm', actions: ['albuterol'], when: (_s, sc) => !hasProblem(sc, ['bronchospasm', 'anaphylaxis']), points: 3, severity: 'minor', text: 'Albuterol (2.5–5 mg) with no wheeze. It opens airways narrowed by bronchospasm — asthma, COPD, anaphylaxis; with none it only speeds the heart and can bring on an arrhythmia. Crackles are fluid in the lungs, not bronchospasm.' },
  // High-dose albuterol. Gate order: albuterol-hyperk-no-indication > albuterol-hyperk-tachycardia
  { id: 'albuterol-hyperk-no-indication', actions: ['albuterol-hyperk'], when: (_s, sc) => albuterolHyperkNoIndication(sc), points: 3, severity: 'minor', text: 'High-dose albuterol (10–20 mg) without hyperkalemia. That dose is for shifting potassium and it races the heart; for wheezing the dose is 2.5–5 mg.' },
  { id: 'albuterol-hyperk-tachycardia', actions: ['albuterol-hyperk'], when: (s, sc) => s.pulse && (tachyarrhythmia(s) || s.rhythm.hr >= 120) && !albuterolHyperkNoIndication(sc), points: 3, severity: 'minor', text: 'High-dose albuterol with a fast heart rate (120 or more, or a tachyarrhythmia). 10–20 mg speeds the heart further and can bring on an arrhythmia (albuterol label: cardiovascular effects): shift the potassium with insulin and dextrose instead.' },
  // Glucagon. Gate order: glucagon-unprotected-airway > glucagon-no-indication
  { id: 'glucagon-unprotected-airway', actions: ['glucagon'], when: (s) => unprotectedAirway(s), points: 3, severity: 'minor', text: 'Glucagon for a patient who cannot protect the airway (GCS 8 or less, no airway in). Vomiting is the rule at the antidote doses: secure the airway first, or turn the patient on the side with suction ready (GlucaGen label: nausea and vomiting).' },
  { id: 'glucagon-no-indication', actions: ['glucagon'], when: (s, sc) => glucagonNoIndication(sc) && !unprotectedAirway(s), points: 3, severity: 'minor', text: 'Glucagon without a beta- or calcium-channel-blocker overdose. In those doses it is an antidote, with vomiting the rule; with no overdose it treats nothing (and it raises the glucose).' },

  // Glucose: judged on the patient's real glucose, checked or not
  { id: 'glucose-not-low', actions: ['oral-glucose', 'dextrose'], when: (s) => s.vitals.glucose >= LOW_GLUCOSE, points: 3, severity: 'minor', text: 'Glucose given with a blood glucose of 70 mg/dL or more. Check it first: glucose treats a low one, and a high glucose harms an injured brain or heart.' },
  { id: 'oral-glucose-cannot-swallow', actions: ['oral-glucose'], when: (s) => !canSwallow(s), points: 8, severity: 'major', text: 'Oral glucose for a patient too drowsy to swallow. It can be inhaled into the lungs: by mouth only if awake enough to swallow and protect the airway — otherwise IV dextrose (ALS).' },

  // Vasopressors. Gate order — the infusion and push-dose epinephrine: push-epi-in-arrest > catecholamine-lvoto >
  // pressor-no-hypotension > pressor-before-volume; phenylephrine: phenylephrine-no-hypotension and phenylephrine-slow >
  // pressor-before-volume > phenylephrine-heart-failure; intracoronary epinephrine: catecholamine-lvoto > ic-epi-no-indication
  { id: 'push-epi-in-arrest', actions: ['push-epi'], when: (s) => !s.pulse, points: 3, severity: 'minor', text: 'Push-dose epinephrine in cardiac arrest. 10–20 mcg is the dose for a low pressure with a pulse; the arrest dose is 1 mg IV/IO every 3–5 minutes (2025 AHA).' },
  { id: 'catecholamine-lvoto', actions: ['pressor', 'push-epi', 'ic-epinephrine'], when: (s, sc) => lvoto(s, sc), points: 10, severity: 'major', text: 'A catecholamine with dynamic LV outflow obstruction. Epinephrine, norepinephrine and dopamine push the contractility up: the ventricle squeezes harder, the outflow tract narrows further, the gradient climbs and the pressure falls. For a low pressure with outflow obstruction: fluid first, then a vasoconstrictor with no inotropic effect — phenylephrine (2024 AHA/ACC HCM guideline) — and if those fail, mechanical support.' },
  { id: 'pressor-no-hypotension', actions: ['pressor', 'push-epi'], when: (s, sc) => pressorNotLow(s, sc) && !lvoto(s, sc), points: 3, severity: 'minor', text: 'A vasopressor or push-dose epinephrine without a low pressure. With a systolic of 90 or more and a MAP of 65 or more it only adds afterload, rate and oxygen demand for the heart (and speeds conduction through the AV node in atrial fibrillation): a pressor is for hypotension (Levophed label: acute hypotensive states; 2025 AHA: a MAP of 65 or more is the target), or a bridge for a symptomatic bradycardia that atropine has not fixed.' },
  { id: 'pressor-before-volume', actions: ['pressor', 'push-epi', 'phenylephrine'], when: (s, sc, id) => noVolumeYet(s, sc) && (id === 'phenylephrine' ? !phenylephrineNotLow(s) && !phenylephrineSlow(s) : !pressorNotLow(s, sc) && !lvoto(s, sc)), points: 3, severity: 'minor', text: 'A vasopressor before any volume in a bleeding patient. It squeezes an empty circulation: fill it first (saline, then blood), and use a pressor only as a bridge while the volume goes in (ATLS).' },
  { id: 'phenylephrine-no-hypotension', actions: ['phenylephrine'], when: (s) => phenylephrineNotLow(s), points: 3, severity: 'minor', text: 'Phenylephrine without a low blood pressure. It is a pure vasoconstrictor for hypotension (sedation, a vasovagal drop, LV outflow obstruction); with a normal pressure it only adds afterload (which cuts an LVAD\'s flow) and slows the heart.' },
  { id: 'phenylephrine-slow', actions: ['phenylephrine'], when: (s) => phenylephrineSlow(s), points: 3, severity: 'minor', text: 'Phenylephrine with a slow heart rate. The reflex slowing it brings makes the bradycardia worse: treat the rate first (atropine, pacing), or support the pressure with a drug that also speeds the heart (epinephrine).' },
  // an LVAD's flow falls with a high afterload too, but it is not a failing ventricle's: the LVAD rules judge it by the MAP
  { id: 'phenylephrine-heart-failure', actions: ['phenylephrine'], when: (s, sc) => s.pulse && hasProblem(sc, ['heart-failure']) && !s.lvad && !hasProblem(sc, ['lvot-obstruction']) && !phenylephrineNotLow(s) && !phenylephrineSlow(s) && !noVolumeYet(s, sc), points: 3, severity: 'minor', text: 'Phenylephrine for a failing left ventricle. A pure vasoconstrictor raises the afterload the weak ventricle must empty against, so the stroke volume and the cardiac output can fall even as the pressure rises (Biorphen label: decreased cardiac output). In cardiogenic shock norepinephrine is the usual vasopressor, with an inotrope or mechanical support for the pump.' },
  { id: 'ic-epi-no-indication', actions: ['ic-epinephrine'], when: (s, sc) => s.pulse && (s.lvad ? mapOf(s.vitals) >= 80 : s.vitals.sbp >= 110) && !lvoto(s, sc), points: 3, severity: 'minor', text: 'Intracoronary epinephrine with a normal pressure. It is a drug for no-reflow with a low pressure; otherwise it speeds the heart and raises the pressure and the oxygen need of an ischemic heart, and it can set off ventricular arrhythmias.' },
  // The legs. Gate order: legs-up-pulmonary-edema > legs-up-hypertensive
  { id: 'legs-up-pulmonary-edema', actions: ['legs-up'], when: (_s, sc) => hasProblem(sc, ['pulmonary-edema']), points: 5, severity: 'major', text: 'Raising the legs of a patient with fluid on the lungs. It pours more blood back into a heart that is already backing up into the lungs: sit them up with the legs down.' },
  { id: 'legs-up-hypertensive', actions: ['legs-up'], when: (s, sc) => s.pulse && (s.lvad ? mapOf(s.vitals) > 90 : s.vitals.sbp >= 160) && !hasProblem(sc, ['pulmonary-edema']), points: 2, severity: 'minor', text: 'Raising the legs with a high pressure (a systolic of 160 or more; with an LVAD, a Doppler MAP over 90). It is for a low pressure — a faint, blood loss: here it pushes a high pressure higher. Let the patient rest in the position of comfort.' },

  // Fluids and blood. Gate order: fluid-pulmonary-edema > fluid-loading-pe > fluid-hypertensive > saline-instead-of-blood
  { id: 'fluid-pulmonary-edema', actions: ['fluid'], when: (s, sc) => s.pulse && hasProblem(sc, ['pulmonary-edema']), points: 8, severity: 'major', text: 'A fluid bolus in pulmonary edema. The lungs are already flooded: more volume worsens the breathing and the oxygen. Sit the patient up, CPAP, and nitroglycerin for a high pressure.' },
  // one small bolus is tolerated; a second is beyond the 500 mL that cautious volume loading allows
  { id: 'fluid-loading-pe', actions: ['fluid'], when: (s, sc) => s.pulse && hasProblem(sc, ['pulmonary-embolism']) && count(s, 'fluid') >= 1 && !hasProblem(sc, ['pulmonary-edema']), points: 8, severity: 'major', text: 'More than 500 mL of fluid for a pulmonary embolism. A right ventricle pumping against the clot is already overfilled: more volume stretches it further, pushes the septum into the left ventricle and empties it, and the pressure falls. At most one small bolus; support the pressure with norepinephrine (2026 AHA/ACC PE guideline).' },
  { id: 'fluid-hypertensive', actions: ['fluid'], when: (s, sc) => s.pulse && hasProblem(sc, ['aortic-dissection']) && !lowPressure(s) && !hasProblem(sc, ['pulmonary-edema']) && !(hasProblem(sc, ['pulmonary-embolism']) && count(s, 'fluid') >= 1), points: 5, severity: 'major', text: 'A fluid bolus for an aortic dissection with no low pressure. More volume raises the pressure and the force on the torn wall: the goal is a lower pressure and rate (2022 ACC/AHA aortic disease guideline). Fluid is for the shock of a tamponade or a rupture, in small boluses on the way to the operating room.' },
  // not in the field, where no blood is carried: there saline is all there is
  { id: 'saline-instead-of-blood', actions: ['fluid'], when: (s, sc) => sc.setting !== 'field' && s.pulse && hasProblem(sc, ['bleeding']) && count(s, 'fluid') >= 2 && !has(s, 'transfused') && !hasProblem(sc, ['pulmonary-edema']) && !(hasProblem(sc, ['pulmonary-embolism']) && count(s, 'fluid') >= 1) && !(hasProblem(sc, ['aortic-dissection']) && !lowPressure(s)), points: 3, severity: 'minor', text: 'A third saline bolus with no blood yet. After the first liter, saline only dilutes the red cells and the clotting factors that are left: a bleeding patient needs blood (ATLS).' },
  { id: 'transfuse-no-bleeding', actions: ['transfuse'], when: (_s, sc) => !hasProblem(sc, ['bleeding']), points: 3, severity: 'minor', text: 'Packed red cells with no bleeding to treat. Blood is for hemorrhage or a low hemoglobin; otherwise it adds volume, reaction and infection risks for nothing.' },
];
