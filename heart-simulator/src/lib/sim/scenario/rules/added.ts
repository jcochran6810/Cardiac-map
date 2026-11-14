/**
 * Built-in safety rules for the actions added after the first rule files: the heparin top-up, and the drugs, positions and
 * team actions the simulator gained with them (each ships with its label contraindications). Within one action the rules
 * are written in their gate order: the first that applies is the one that charges (one dose, one penalty).
 */
import { has } from '../kit';
import type { Harm, Scenario, SimState } from '../types';
import { BETA_BLOCKERS, did, hasProblem, lastDoneAt, lowPressure, outflowObstruction, preloadDependent, tachyarrhythmia } from './helpers';

/**
 * A dissection whose rate is not yet controlled, with a pressure that is not low: the vasodilator's mistake there is giving
 * it before the beta-blocker — the ACS rules' 'vasodilator-before-rate-control' scores it, and the nicardipine rules here
 * stand aside for it (one dose, one penalty)
 */
const beforeRateControl = (s: SimState, sc: Scenario) =>
  s.pulse && hasProblem(sc, ['aortic-dissection']) && !lowPressure(s) && !(BETA_BLOCKERS.some((b) => did(s, b)) || did(s, 'diltiazem'));

/** The one nicardipine rule that charges this dose, in the gate order (or none) */
function nicardipineRule(s: SimState, sc: Scenario): string | null {
  if (!s.pulse || beforeRateControl(s, sc)) return null;
  if (hasProblem(sc, ['severe-aortic-stenosis'])) return 'nicardipine-aortic-stenosis';
  if (lowPressure(s)) return 'vasodilator-hypotension';
  if (s.vitals.sbp < 120) return 'nicardipine-no-hypertension';
  return null;
}

/** The one inotrope rule that charges this dose, in the gate order (or none) */
function inotropeRule(s: SimState, sc: Scenario): string | null {
  if (!s.pulse) return null;
  if (hasProblem(sc, ['lvot-obstruction'])) return 'inotrope-lvot-obstruction';
  if (lowPressure(s) && !has(s, 'pressor')) return 'inotrope-unsupported-hypotension';
  if (tachyarrhythmia(s)) return 'inotrope-tachyarrhythmia';
  return null;
}

/** The one furosemide rule that charges this dose, in the gate order (or none) */
function furosemideRule(s: SimState, sc: Scenario): string | null {
  if (!s.pulse) return null;
  if (lowPressure(s)) return 'furosemide-hypotension';
  if (preloadDependent(s, sc) || outflowObstruction(sc)) return 'furosemide-preload-dependent';
  if (hasProblem(sc, ['dialysis'])) return 'furosemide-anuria';
  if (!hasProblem(sc, ['pulmonary-edema', 'heart-failure', 'hyperkalemia'])) return 'furosemide-no-indication';
  return null;
}

export const ADDED_RULES: Harm[] = [
  // In the lab extra heparin follows the ACT (the default ACT, or a case's, sets the timer 'actLowAt' when it is low); the
  // emergency department has no ACT: its bolus is followed by the infusion, so every repeat bolus there is unguided
  {
    id: 'heparin-repeat-unguided', actions: ['heparin'],
    when: (s, sc) => did(s, 'heparin') && (sc.setting === 'ed' || !((s.timers.actLowAt ?? -Infinity) > (lastDoneAt(s, ['heparin']) ?? Infinity))),
    points: 5, severity: 'major',
    text: 'Another heparin bolus without a low ACT to guide it. During PCI extra heparin is given to a target ACT — 250–300 s on heparin alone, 200–250 s with a GP IIb/IIIa inhibitor (ACCF/AHA/SCAI PCI guideline): check the ACT first, since an unguided bolus only adds bleeding. In the emergency department the bolus is followed by the infusion, adjusted to the aPTT or anti-Xa level, not by more boluses.',
  },

  // Nicardipine (or clevidipine): its label contraindication, a low pressure, and no high pressure to treat
  {
    id: 'nicardipine-aortic-stenosis', actions: ['nicardipine'], when: (s, sc) => nicardipineRule(s, sc) === 'nicardipine-aortic-stenosis', points: 10, severity: 'major',
    text: 'Nicardipine with severe aortic stenosis. A fixed narrowing lets the output rise no further, so an arterial vasodilator only drops the pressure — and with it the flow to a thick, hungry heart muscle (nicardipine label: advanced aortic stenosis; clevidipine label: severe aortic stenosis). Lower a high pressure there only with invasive monitoring, slowly.',
  },
  {
    id: 'vasodilator-hypotension', actions: ['nicardipine'], when: (s, sc) => nicardipineRule(s, sc) === 'vasodilator-hypotension', points: 8, severity: 'major',
    text: 'A nicardipine infusion with a systolic under 90 (with an LVAD, a Doppler MAP under 60). It is for a pressure that is too high: here it drops a low one further. Find out why the pressure is low and treat that.',
  },
  {
    id: 'nicardipine-no-hypertension', actions: ['nicardipine'], when: (s, sc) => nicardipineRule(s, sc) === 'nicardipine-no-hypertension', points: 3, severity: 'minor',
    text: 'A nicardipine infusion with a systolic under 120. It treats a pressure that is too high — a hypertensive emergency, or a dissection once the rate is controlled (goal under 120): below that it only brings the pressure down to where the organs go short.',
  },

  // An inotrope (dobutamine or milrinone): for low output with an adequate pressure
  {
    id: 'inotrope-lvot-obstruction', actions: ['inotrope'], when: (s, sc) => inotropeRule(s, sc) === 'inotrope-lvot-obstruction', points: 10, severity: 'major',
    text: 'An inotrope with LV outflow obstruction. A harder squeeze narrows the outflow tract further and the gradient climbs: the pressure falls more (dobutamine label: idiopathic hypertrophic subaortic stenosis; milrinone label: obstructive aortic or subaortic disease; 2024 AHA/ACC HCM guideline). Fluid and phenylephrine instead.',
  },
  {
    id: 'inotrope-unsupported-hypotension', actions: ['inotrope'], when: (s, sc) => inotropeRule(s, sc) === 'inotrope-unsupported-hypotension', points: 5, severity: 'major',
    text: 'An inotrope alone for a systolic under 90. Dobutamine and milrinone open the vessels as they strengthen the squeeze, so the pressure can fall further: in cardiogenic shock with a low pressure, a vasopressor (norepinephrine) first, then the inotrope for the output.',
  },
  {
    id: 'inotrope-tachyarrhythmia', actions: ['inotrope'], when: (s, sc) => inotropeRule(s, sc) === 'inotrope-tachyarrhythmia', points: 5, severity: 'major',
    text: 'An inotrope during a tachyarrhythmia. Dobutamine and milrinone speed the rate and provoke more arrhythmias, and a heart this fast has no time to fill: treat the rhythm first (cardioversion, or a rate or rhythm drug), then judge the output again.',
  },

  // Furosemide: the label and the heart-failure guideline's limits, in the gate order
  {
    id: 'furosemide-hypotension', actions: ['furosemide'], when: (s, sc) => furosemideRule(s, sc) === 'furosemide-hypotension', points: 8, severity: 'major',
    text: 'IV furosemide with a systolic under 90 (with an LVAD, a Doppler MAP under 60). The volume it takes off drops the pressure further: restore the perfusion first (2022 AHA/ACC/HFSA heart failure guideline — diuretics for congestion once the pressure holds).',
  },
  {
    id: 'furosemide-preload-dependent', actions: ['furosemide'], when: (s, sc) => furosemideRule(s, sc) === 'furosemide-preload-dependent', points: 8, severity: 'major',
    text: 'IV furosemide for a heart that lives on its filling: a tamponade, a pulmonary embolism or a right-ventricular infarct, or an outflow obstruction. Taking volume off empties the heart and the pressure falls: these patients need the filling kept (fluid for the right ventricle, the drain for the tamponade).',
  },
  {
    id: 'furosemide-anuria', actions: ['furosemide'], when: (s, sc) => furosemideRule(s, sc) === 'furosemide-anuria', points: 5, severity: 'major',
    text: 'IV furosemide for a dialysis patient who makes little or no urine. With no kidney function to act on it does nothing for the fluid or the potassium (furosemide label: anuria) and adds its ototoxicity: dialysis takes the fluid and the potassium off.',
  },
  {
    id: 'furosemide-no-indication', actions: ['furosemide'], when: (s, sc) => furosemideRule(s, sc) === 'furosemide-no-indication', points: 3, severity: 'minor',
    text: 'IV furosemide with no fluid overload to treat. It is for congestion — pulmonary edema, decompensated heart failure — or as an add-on for a high potassium in a patient who makes urine; otherwise it only dries the patient out and lowers the potassium.',
  },

  // Sitting up: for the breathless patient with fluid on the lungs; with a low pressure it pools the blood in the legs
  {
    id: 'sit-up-low-pressure', actions: ['sit-up'], when: (s, sc) => s.pulse && lowPressure(s) && !hasProblem(sc, ['pulmonary-edema']), points: 5, severity: 'major',
    text: 'Sitting up a patient with a systolic under 90. Upright, the blood pools in the legs and less comes back to the heart: the pressure falls further and the brain goes short. Lay a hypotensive patient flat (raise the legs if the lungs are clear); sitting up is for fluid on the lungs.',
  },
];
