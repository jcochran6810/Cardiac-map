/**
 * Built-in safety rules for supportive care: CPR, the airway and RSI, the electrolytes and antidotes, glucose, the
 * vasopressors (infusion, push-dose and intracoronary epinephrine, phenylephrine), the legs, fluids and blood.
 *
 * One dose, one penalty: where several rules here judge the same action, each lower one is written to stay silent while
 * a higher one applies (the gate order is noted above each group).
 */
import { LOW_GLUCOSE, canSwallow, has, mapOf, paced } from '../kit';
import type { Harm, Scenario, SimState } from '../types';
import { BICARBONATE_FOR, CALCIUMS, CALCIUM_FOR, hasProblem, lowPressure, lvadPerfusing } from './helpers';

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

export const SUPPORT_RULES: Harm[] = [
  { id: 'cpr-with-pulse', actions: ['cpr'], when: (s) => s.pulse && !s.lvad, points: 10, severity: 'major', text: 'Chest compressions on a patient with a pulse. Check for a pulse (no more than 10 seconds) before starting CPR.' },
  // the LVAD patient whose pump is perfusing has no pulse to check: the mistake is a different one, and so is the lesson
  { id: 'cpr-lvad-perfusing', actions: ['cpr'], when: (s) => lvadPerfusing(s), points: 10, severity: 'major', text: 'Chest compressions on an LVAD patient whose pump is perfusing. A continuous-flow pump leaves no pulse to feel: judge perfusion instead — responsiveness, skin color and temperature, capillary refill, a Doppler MAP over 50 (2025 AHA durable LVAD algorithm). An unresponsive LVAD patient whose perfusion is inadequate gets compressions without delay, pump or no pump; one who is perfusing needs the cause of the problem found, not CPR.' },
  { id: 'airway-awake', actions: ['airway'], when: (s) => s.pulse && s.vitals.gcs > 8, points: 10, severity: 'major', text: 'An advanced airway is not indicated in a patient who is awake and protecting their own airway.' },
  // the emergency department's drug-assisted airway (ACEP clinical policy: monitoring and capnography)
  { id: 'rsi-no-indication', actions: ['rsi'], when: (s) => s.pulse && s.vitals.gcs >= 13 && s.vitals.spo2 >= 92 && s.vitals.rr >= 10 && s.vitals.rr <= 30 && !lowPressure(s), points: 10, severity: 'major', text: 'Rapid sequence intubation without an indication. A tube is for a patient who cannot protect the airway, cannot oxygenate or ventilate, or whose expected course will soon take one of those away; an awake patient breathing well, with a normal oxygen saturation and pressure, gets only its risks — a failed airway, aspiration, a falling pressure and the ventilator.' },
  { id: 'rsi-unmonitored', actions: ['rsi'], when: (s) => !has(s, 'monitor'), points: 5, severity: 'major', text: 'Rapid sequence intubation without the cardiac monitor on. The induction drug, the paralytic and positive-pressure ventilation can drop the pressure, the oxygen saturation and the heart rate within a minute: the ECG, pulse oximetry, the blood pressure and waveform capnography run before the first drug goes in.' },
  { id: 'rsi-unresuscitated', actions: ['rsi'], when: (s) => s.pulse && lowPressure(s) && !has(s, 'pressor') && !has(s, 'push-epi'), points: 8, severity: 'major', text: 'Rapid sequence intubation with a low blood pressure and nothing to hold it up. The induction drug and positive-pressure ventilation drop the pressure further, and the patient can arrest around the tube: resuscitate before you intubate — fluids or blood, push-dose epinephrine or an infusion running — and give a reduced dose of the most stable induction drug.' },

  // Drugs for a specific problem: without it they cannot help and only bring their risks. The case lists what the patient
  // has (Scenario.problems); "not well established" in a hyperkalemic arrest (2025 AHA) is never penalized.
  // calcium also reverses part of the low pressure IV diltiazem causes: for that low pressure (a pulse, a systolic under 90)
  // it is a fair answer. Not routinely in a later arrest, and not once the pressure is back: one therapeutic dose is no overdose
  { id: 'calcium-no-indication', actions: CALCIUMS, when: (s, sc) => !hasProblem(sc, CALCIUM_FOR) && !(has(s, 'diltiazem') && s.pulse && lowPressure(s)), points: 3, severity: 'minor', text: 'Calcium chloride without an indication. It is for hyperkalemia, a calcium-channel- or beta-blocker overdose (or the low pressure IV diltiazem causes) or a low calcium; otherwise it does not help (routine calcium in cardiac arrest: no benefit, 2025 AHA), and it burns the tissue if it leaks.' },
  { id: 'bicarbonate-no-indication', actions: ['sodium-bicarbonate'], when: (_s, sc) => !hasProblem(sc, BICARBONATE_FOR), points: 3, severity: 'minor', text: 'Sodium bicarbonate without an indication. It is for hyperkalemia, metabolic acidosis or a sodium-channel-blocker (e.g. tricyclic) overdose; routine bicarbonate in cardiac arrest has no benefit (2025 AHA), and it adds a sodium load and CO₂ the lungs must clear.' },
  { id: 'insulin-hypoglycemia', actions: ['insulin-dextrose'], when: (s) => s.vitals.glucose < LOW_GLUCOSE, points: 10, severity: 'major', text: 'Insulin with a blood glucose under 70 mg/dL. Treat the low glucose first: insulin drives it lower, and the worst lows come 1–3 hours later.' },
  // 10 units is the potassium dose; a beta- or calcium-channel-blocker overdose needs far more, so it is too little there, not a mistake
  { id: 'insulin-no-indication', actions: ['insulin-dextrose'], when: (_s, sc) => !hasProblem(sc, ['hyperkalemia', 'beta-blocker-overdose', 'ccb-overdose']), points: 5, severity: 'minor', text: 'Insulin and dextrose without hyperkalemia. They shift potassium into the cells; with no high potassium they only risk a low glucose.' },
  { id: 'albuterol-hyperk-no-indication', actions: ['albuterol-hyperk'], when: (_s, sc) => !hasProblem(sc, ['hyperkalemia']), points: 3, severity: 'minor', text: 'High-dose albuterol (10–20 mg) without hyperkalemia. That dose is for shifting potassium and it races the heart; for wheezing the dose is 2.5–5 mg.' },

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
  { id: 'legs-up-pulmonary-edema', actions: ['legs-up'], when: (_s, sc) => hasProblem(sc, ['pulmonary-edema']), points: 5, severity: 'major', text: 'Raising the legs of a patient with fluid on the lungs. It pours more blood back into a heart that is already backing up into the lungs: sit them up with the legs down.' },
  { id: 'fluid-pulmonary-edema', actions: ['fluid'], when: (s, sc) => s.pulse && hasProblem(sc, ['pulmonary-edema']), points: 8, severity: 'major', text: 'A fluid bolus in pulmonary edema. The lungs are already flooded: more volume worsens the breathing and the oxygen. Sit the patient up, CPAP, and nitroglycerin for a high pressure.' },
  { id: 'transfuse-no-bleeding', actions: ['transfuse'], when: (_s, sc) => !hasProblem(sc, ['bleeding']), points: 3, severity: 'minor', text: 'Packed red cells with no bleeding to treat. Blood is for hemorrhage or a low hemoglobin; otherwise it adds volume, reaction and infection risks for nothing.' },
];
