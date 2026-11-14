/**
 * Built-in safety rules for the actions added after the first rule files: the heparin top-up, and the drugs, positions and
 * team actions the simulator gained with them (each ships with its label contraindications). Within one action the rules
 * are written in their gate order: the first that applies is the one that charges (one dose, one penalty).
 */
import { has, paced } from '../kit';
import type { Harm, Scenario, SimState } from '../types';
import { antithromboticCharges, vasodilatorBeforeRateControl } from './acs';
import { BETA_BLOCKERS, did, hasProblem, lastDoneAt, lowPressure, outflowObstruction, preloadDependent, slowOrBlocked, tachyarrhythmia } from './helpers';
import { RATE_RULES } from './rhythm';
import { indicationCovered } from './scope';

type Check = (s: SimState, sc: Scenario) => boolean;

/**
 * The first rule of a gate (`[id, applies]` in rank order) that charges this dose, or null. A case rule with the same id
 * (for this role and this action) decides that rank in the built-in's place, as in the ACS rules' gate: while it applies to
 * the dose the gate stops there (it charges, and nothing ranked lower adds a second penalty); while it does not — an
 * exemption, or its condition is false — the gate goes on to the next rank: the case has said this one reason does not
 * hold here. An indication rank the ER nurse's missing order covers is passed over (rules/scope.ts indicationCovered).
 */
function topOf(ranks: [string, Check][], s: SimState, sc: Scenario, action: string): string | null {
  for (const [id, applies] of ranks) {
    const own = sc.harms.filter((h) => h.id === id && (!h.roles || h.roles.includes(s.role)) && h.actions.includes(action));
    if (own.length) {
      if (own.some((h) => !h.when || h.when(s, sc, action))) return id;
    } else if (applies(s, sc) && !indicationCovered(id, s, sc, action)) return id;
  }
  return null;
}

/**
 * A dissection whose rate is not yet controlled, with a pressure that is not low: the vasodilator's mistake there is giving
 * it before the beta-blocker — the ACS rules' 'vasodilator-before-rate-control' scores it, and the nicardipine rules here
 * stand aside for it (one dose, one penalty)
 */
const beforeRateControl = (s: SimState, sc: Scenario) => s.pulse && vasodilatorBeforeRateControl(s, sc);

/** The nicardipine rules, in their gate order */
const NICARDIPINE: [string, Check][] = [
  ['nicardipine-aortic-stenosis', (_s, sc) => hasProblem(sc, ['severe-aortic-stenosis'])],
  ['vasodilator-hypotension', (s) => lowPressure(s)],
  ['nicardipine-no-hypertension', (s) => s.vitals.sbp < 120],
];
/** The one nicardipine rule that charges this dose, in the gate order (or none) */
function nicardipineRule(s: SimState, sc: Scenario): string | null {
  if (!s.pulse || beforeRateControl(s, sc)) return null;
  return topOf(NICARDIPINE, s, sc, 'nicardipine');
}

/** The inotrope rules, in their gate order */
const INOTROPE: [string, Check][] = [
  ['inotrope-lvot-obstruction', (_s, sc) => hasProblem(sc, ['lvot-obstruction'])],
  ['inotrope-dissection', (_s, sc) => hasProblem(sc, ['aortic-dissection'])],
  ['inotrope-unsupported-hypotension', (s) => lowPressure(s) && !has(s, 'pressor')],
  ['inotrope-tachyarrhythmia', (s) => tachyarrhythmia(s)],
  // low output is what it is for: cardiogenic shock or failing pump, or a low pressure already held up by a vasopressor
  ['inotrope-no-indication', (s, sc) => !hasProblem(sc, ['cardiogenic-shock', 'heart-failure']) && !lowPressure(s)],
];
/** The one inotrope rule that charges this dose, in the gate order (or none) */
function inotropeRule(s: SimState, sc: Scenario): string | null {
  return s.pulse ? topOf(INOTROPE, s, sc, 'inotrope') : null;
}

/**
 * The furosemide rules, in their gate order. An outflow obstruction (severe aortic stenosis, LV outflow obstruction) is
 * preload-dependent only without congestion: careful diuresis is the treatment of pulmonary edema there (2020 ACC/AHA valve
 * guideline; 2024 AHA/ACC HCM guideline, 2b for a cautious diuretic with volume overload) — a low pressure is judged first
 */
const FUROSEMIDE: [string, Check][] = [
  ['furosemide-hypotension', (s) => lowPressure(s)],
  ['furosemide-preload-dependent', (s, sc) => preloadDependent(s, sc) || (outflowObstruction(sc) && !hasProblem(sc, ['pulmonary-edema', 'heart-failure']))],
  ['furosemide-anuria', (_s, sc) => hasProblem(sc, ['dialysis'])],
  ['furosemide-no-indication', (_s, sc) => !hasProblem(sc, ['pulmonary-edema', 'heart-failure', 'hyperkalemia'])],
];
/** The one furosemide rule that charges this dose, in the gate order (or none) */
function furosemideRule(s: SimState, sc: Scenario): string | null {
  return s.pulse ? topOf(FUROSEMIDE, s, sc, 'furosemide') : null;
}

/** A tamponade not yet drained (the case's Problem, or one that began mid-case): the patient breathes only sitting up */
const tamponadeUndrained = (s: SimState, sc: Scenario) => (hasProblem(sc, ['tamponade']) || has(s, 'tamponade')) && !has(s, 'drained');

/**
 * Oral metoprolol in an acute coronary syndrome with a risk of cardiogenic shock (2013 ACCF/AHA STEMI, COR 1: oral
 * beta-blockers in the first 24 hours only without heart failure, a low output, an increased risk of cardiogenic shock —
 * a systolic under 120 with age over 70, a heart rate over 110 — or another contraindication; COMMIT). The rhythm rules
 * judge a low pressure, a slow rate or block, fluid on the lungs and bronchospasm: this rule is for the rest
 */
/**
 * A case rule speaks for this beta-blocker dose: it names the tablet, stands in for the rate-drug rules (RATE_RULES of
 * rules/rhythm.ts) and applies — the case's words for a beta-blocker that is wrong for this patient — and has not charged an
 * earlier dose. The oral rule then adds no second penalty to the same tablet. A stand-in charged already passes the tablet on
 * to this rule, as the rhythm gate passes a dose on (rules/rhythm.ts caseVoice)
 */
const caseSpeaksForBetaBlocker = (s: SimState, sc: Scenario, id: string) => sc.harms.some((h) =>
  h.actions.includes(id) && (!h.roles || h.roles.includes(s.role)) && !!h.replaces?.some((r) => RATE_RULES.includes(r)) && (!h.when || h.when(s, sc, id))
  && !s.penalties.some((p) => p.id === h.id && p.minute < s.minute));

const oralBetaBlockerShockRisk = (s: SimState, sc: Scenario) =>
  s.pulse && hasProblem(sc, ['acs']) && !lowPressure(s) && !slowOrBlocked(s) && !hasProblem(sc, ['pulmonary-edema', 'asthma', 'bronchospasm'])
  && (s.vitals.sbp < 100 || (!paced(s) && (s.rhythm.hr > 110 || s.rhythm.hr < 60)) || hasProblem(sc, ['heart-failure', 'cardiogenic-shock']));

/**
 * Stopping the anticoagulant in the middle of a PCI: a wire is in the coronary (not yet out after the final angiogram) and
 * nothing is bleeding — no perforation, no bleeding Problem, no dissection of the aorta or the coronary wall (SCAD). The
 * fresh stent and the wire then sit in blood that can clot (ACCF/AHA/SCAI PCI guideline: anticoagulation through the PCI)
 */
const stopsMidPci = (s: SimState, sc: Scenario) =>
  has(s, 'wired') && !has(s, 'final-angio') && !hasProblem(sc, ['bleeding', 'aortic-dissection']) && !has(s, 'scad') && !has(s, 'perforation');

export const ADDED_RULES: Harm[] = [
  // In the lab extra heparin follows the ACT (the default ACT, or a case's, sets the timer 'actLowAt' when it is low); the
  // emergency department has no ACT: its bolus is followed by the infusion, so every repeat bolus there is unguided
  // (a reason the antithrombotic gate gives to hold the dose altogether — heparin on top of bivalirudin, bleeding, HIT —
  // charges it instead: one dose, one penalty)
  {
    id: 'heparin-repeat-unguided', actions: ['heparin'],
    when: (s, sc, id) => did(s, 'heparin') && (sc.setting === 'ed' || !((s.timers.actLowAt ?? -Infinity) > (lastDoneAt(s, ['heparin']) ?? Infinity)))
      && !antithromboticCharges(s, sc, id),
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
    id: 'inotrope-dissection', actions: ['inotrope'], when: (s, sc) => inotropeRule(s, sc) === 'inotrope-dissection', points: 8, severity: 'major',
    text: 'An inotrope in an acute aortic dissection. The treatment there lowers the force of each beat against the tear — the rate and the rise of the pressure (anti-impulse therapy, 2022 ACC/AHA aortic disease guideline): dobutamine or milrinone does the opposite, a harder, faster squeeze that drives the tear on. A falling pressure in a dissection is a rupture or a tamponade: surgery, not an inotrope.',
  },
  {
    id: 'inotrope-unsupported-hypotension', actions: ['inotrope'], when: (s, sc) => inotropeRule(s, sc) === 'inotrope-unsupported-hypotension', points: 5, severity: 'major',
    text: 'An inotrope alone for a systolic under 90. Dobutamine and milrinone open the vessels as they strengthen the squeeze, so the pressure can fall further: in cardiogenic shock with a low pressure, a vasopressor (norepinephrine) first, then the inotrope for the output.',
  },
  {
    id: 'inotrope-tachyarrhythmia', actions: ['inotrope'], when: (s, sc) => inotropeRule(s, sc) === 'inotrope-tachyarrhythmia', points: 5, severity: 'major',
    text: 'An inotrope during a tachyarrhythmia. Dobutamine and milrinone speed the rate and provoke more arrhythmias, and a heart this fast has no time to fill: treat the rhythm first (cardioversion, or a rate or rhythm drug), then judge the output again.',
  },
  {
    id: 'inotrope-no-indication', actions: ['inotrope'], when: (s, sc) => inotropeRule(s, sc) === 'inotrope-no-indication', points: 5, severity: 'major',
    text: 'An inotrope with no low output to treat. Dobutamine and milrinone are for cardiogenic shock or a failing pump with a low output (2022 AHA/ACC/HFSA heart failure guideline); without one they only raise the heart\'s oxygen demand, speed the rate and set off arrhythmias — in an acute MI they widen the infarct (2013 ACCF/AHA heart failure guideline: parenteral inotropes without a low output, 3 — Harm).',
  },

  // Furosemide: the label and the heart-failure guideline's limits, in the gate order
  {
    id: 'furosemide-hypotension', actions: ['furosemide'], when: (s, sc) => furosemideRule(s, sc) === 'furosemide-hypotension', points: 8, severity: 'major',
    text: 'IV furosemide with a systolic under 90 (with an LVAD, a Doppler MAP under 60). The volume it takes off drops the pressure further: restore the perfusion first (2022 AHA/ACC/HFSA heart failure guideline — diuretics for congestion once the pressure holds).',
  },
  {
    id: 'furosemide-preload-dependent', actions: ['furosemide'], when: (s, sc) => furosemideRule(s, sc) === 'furosemide-preload-dependent', points: 8, severity: 'major',
    text: 'IV furosemide for a heart that lives on its filling: a tamponade, a pulmonary embolism or a right-ventricular infarct, or an outflow obstruction with no fluid on the lungs. Taking volume off empties the heart and the pressure falls: these patients need the filling kept (fluid for the right ventricle, the drain for the tamponade). Only with congestion is a careful diuretic given past a narrowed outflow.',
  },
  {
    id: 'furosemide-anuria', actions: ['furosemide'], when: (s, sc) => furosemideRule(s, sc) === 'furosemide-anuria', points: 5, severity: 'major',
    text: 'IV furosemide for a dialysis patient who makes little or no urine. With no kidney function to act on it does nothing for the fluid or the potassium (furosemide label: anuria) and adds its ototoxicity: dialysis takes the fluid and the potassium off.',
  },
  {
    id: 'furosemide-no-indication', actions: ['furosemide'], when: (s, sc) => furosemideRule(s, sc) === 'furosemide-no-indication', points: 3, severity: 'minor',
    text: 'IV furosemide with no fluid overload to treat. It is for congestion — pulmonary edema, decompensated heart failure — or as an add-on for a high potassium in a patient who makes urine; otherwise it only dries the patient out and lowers the potassium.',
  },

  // Temperature control: for a patient who does not follow commands after ROSC
  {
    id: 'temp-control-no-indication', actions: ['temp-control'], when: (s) => !has(s, 'rosc') || s.vitals.gcs >= 13, points: 3, severity: 'minor',
    text: 'Temperature control without its indication. It is for an adult who does not follow commands after the return of circulation (2025 AHA: a chosen target of 32–37.5 °C for at least 36 hours); a patient who never arrested, or who is awake after ROSC, needs only a normal temperature kept — and cooling an awake patient brings shivering and discomfort for nothing.',
  },

  // Discharge from the emergency department: only when the case says the patient may go home
  {
    id: 'discharge-unsafe', actions: ['discharge'], when: (s, sc) => !sc.dischargeOk?.(s), points: 15, severity: 'critical',
    text: 'Discharging a patient who still needs the hospital. Home is for a patient whose workup has ruled out what could kill them and who is safe to go: this one needs admission, the cath lab or a transfer. A discharge that sends a heart attack, a dissection or an arrhythmia home is how patients die after leaving the department.',
  },

  // The field's agitated patient (the joint NAEMSP/NASEMSO/NEMSMA/NAEMT/APA statement on restraint, Kupas et al., Prehosp
  // Emerg Care 2021): face down is never right; restraint at all only for agitation that endangers the patient or the crew
  {
    id: 'prone-restraint', actions: ['restrain-prone'], points: 15, severity: 'critical',
    text: 'Holding a patient face down. Prone restraint — more so with weight on the back, the hands tied behind, or a board on top — stops the chest from moving: positional asphyxia, a rising acid in the blood and cardiac arrest (joint NAEMSP/NASEMSO/NEMSMA/NAEMT/APA position statement, 2021). Restrain only face up or on the side, sedate a patient who keeps fighting, and watch the breathing without a break.',
  },
  {
    // a face-down hold is the prone rule's alone (one act, one penalty)
    id: 'restraint-no-indication', actions: ['restrain'], when: (_s, sc) => !hasProblem(sc, ['severe-agitation']), points: 5, severity: 'major',
    text: 'Restraining a patient who is not a danger to himself or the crew. Restraint is the last resort for severe agitation, after talking him down (joint NAEMSP/NASEMSO/NEMSMA/NAEMT/APA position statement, 2021): on anyone else it is an assault that frightens and injures, and it hides what is wrong.',
  },

  // Spinal motion restriction: never ahead of the resuscitation
  {
    id: 'smr-in-arrest', actions: ['smr'], when: (s) => !s.pulse, points: 5, severity: 'major',
    text: 'A collar and a scoop stretcher in cardiac arrest. SMR never delays compressions or the shock (2018 ACS-COT/ACEP/NAEMSP joint position statement): run the arrest first, and restrict the spine after ROSC if the injury calls for it.',
  },

  // Sitting up: for the breathless patient with fluid on the lungs, or a tamponade that will not let her lie down; with a low
  // pressure and neither, it pools the blood in the legs
  {
    id: 'sit-up-low-pressure', actions: ['sit-up'], points: 5, severity: 'major',
    when: (s, sc) => s.pulse && lowPressure(s) && !hasProblem(sc, ['pulmonary-edema', 'heart-failure']) && !tamponadeUndrained(s, sc),
    text: 'Sitting up a patient with a systolic under 90. Upright, the blood pools in the legs and less comes back to the heart: the pressure falls further and the brain goes short. Lay a hypotensive patient flat (raise the legs if the lungs are clear); sitting up is for fluid on the lungs, or for a tamponade that will not let the patient breathe lying down.',
  },

  // Oral metoprolol after a heart attack: only once the risk of shock is past (a case rule that speaks for the beta-blocker
  // in its own words, standing in for the rate-drug rules, covers the tablet too)
  {
    id: 'oral-beta-blocker-shock-risk', actions: ['metoprolol-po'], when: (s, sc, id) => oralBetaBlockerShockRisk(s, sc) && !caseSpeaksForBetaBlocker(s, sc, id),
    points: 5, severity: 'major',
    text: 'Oral metoprolol in an acute coronary syndrome with a risk of cardiogenic shock — a systolic under 100, a heart rate over 110 or under 60, or heart failure. The oral beta-blocker starts in the first 24 hours only without signs of heart failure, a low output or an increased risk of shock (2013 ACCF/AHA STEMI guideline; COMMIT, where early beta-blockade in these patients brought on cardiogenic shock; 2025 ACC/AHA ACS): hold it until the patient is stable.',
  },

  // Stopping the anticoagulant halfway through a PCI, with nothing bleeding
  {
    id: 'stop-antithrombotics-mid-pci', actions: ['stop-antithrombotics'], when: (s, sc) => stopsMidPci(s, sc), points: 5, severity: 'major',
    text: 'Stopping the anticoagulant with a wire still in the coronary and nothing bleeding. The wire, the balloon and a fresh stent sit in blood that clots without it: thrombus on the hardware, no-reflow and an acute stent thrombosis (ACCF/AHA/SCAI PCI guideline: anticoagulation through the procedure, to the ACT target). Stop it for a perforation, a dissection of the coronary wall (SCAD) or real bleeding — and after the final angiogram.',
  },
];
