/**
 * The ER nurse's scope in the emergency department: the drugs given only on the ED physician's order, and the rule that
 * scores one given without it.
 */
import { has, orderedFlag } from '../kit';
import { answeringWrong } from '../labKit';
import type { Harm } from '../types';

/**
 * The drugs the ER nurse gives in the emergency department only on the ED physician's order (state Nurse Practice Act,
 * ENA scope and standards, facility policy), with the name the review gives each. None is on the chest pain standing
 * order (aspirin, nitroglycerin 0.4 mg, oxygen, the 12-lead, an IV, labs, the chest film) or the ACLS arrest protocol
 * (epinephrine, amiodarone, lidocaine in an arrest, the shocks); the glucose, antiemetic, anaphylaxis and bronchospasm
 * drugs are left to the department's protocols. Some ids are actions still to come. Given with no order — the flag `ordered:<id>` (kit's orderedFlag, set by edKit's
 * edOrder, physicianOrder, physicianDispo or standingOrders) — each costs points once ('rn-without-order-<id>')
 */
export const RN_ORDER_ONLY: Record<string, string> = {
  heparin: 'Heparin', p2y12: 'A P2Y12 loading dose', metoprolol: 'IV metoprolol', diltiazem: 'IV diltiazem', procainamide: 'Procainamide',
  'amio-infusion': 'An amiodarone infusion', pressor: 'A vasopressor infusion', 'push-epi': 'Push-dose epinephrine',
  'insulin-dextrose': 'Insulin and dextrose', transfuse: 'A blood transfusion', steroid: 'IV methylprednisolone', glucagon: 'Glucagon',
  'albuterol-hyperk': 'High-dose albuterol', midazolam: 'Midazolam', fentanyl: 'IV fentanyl', 'nitro-high': 'High-dose nitroglycerin',
  atropine: 'Atropine', adenosine6: 'Adenosine', adenosine12: 'Adenosine',
  'calcium-chloride': 'Calcium chloride', 'sodium-bicarbonate': 'Sodium bicarbonate', 'magnesium-sulfate': 'Magnesium sulfate',
  alteplase: 'Alteplase',
  lidocaine: 'Lidocaine', esmolol: 'IV esmolol', labetalol: 'IV labetalol', 'metoprolol-po': 'Oral metoprolol',
  nicardipine: 'A nicardipine infusion', inotrope: 'An inotrope infusion', 'nitro-iv': 'IV nitroglycerin', furosemide: 'IV furosemide',
  'calcium-gluconate': 'Calcium gluconate', adenosine3: 'Adenosine',
};
/** …of these, only with a pulse: in an arrest the code leader directs them, and the drug rules score the choice */
export const RN_ORDER_WITH_A_PULSE = ['calcium-chloride', 'sodium-bicarbonate', 'magnesium-sulfate', 'atropine', 'lidocaine', 'calcium-gluconate'];

/** …and these, given without an order, are a critical mistake (15 points): a fibrinolytic is the physician's decision alone */
export const RN_ORDER_CRITICAL = ['alteplase'];

/**
 * The built-in rules that judge whether a drug is indicated. When the ER nurse gives a drug without the order it needs and
 * 'rn-without-order-<id>' charges that act, the engine (harmsFor) skips these for it: the missing order covers the
 * indication — asking the physician is where the indication is decided (one act, one penalty). The contraindication rules
 * still apply. Some ids are rules still to come.
 */
export const INDICATION_RULES = [
  'atropine-fast', 'calcium-no-indication', 'bicarbonate-no-indication', 'insulin-no-indication', 'albuterol-hyperk-no-indication',
  'nitro-high-not-hypertensive', 'transfuse-no-bleeding', 'lytic-no-indication', 'magnesium-no-indication', 'antiarrhythmic-no-arrhythmia',
  'lidocaine-no-arrhythmia', 'glucagon-no-indication', 'steroid-no-indication', 'pressor-no-hypotension', 'furosemide-no-indication',
  'nicardipine-no-hypertension', 'opioid-no-pain',
];

/** The id of the rule that scores the ER nurse giving this drug without an order */
export const rnWithoutOrderId = (id: string) => `rn-without-order-${id}`;

export const rnWithoutOrder = ([id, name]: [string, string]): Harm => ({
  id: rnWithoutOrderId(id), actions: [id], roles: [6],
  ...(RN_ORDER_CRITICAL.includes(id) ? { points: 15, severity: 'critical' as const } : { points: 5, severity: 'major' as const }),
  // a wrong answer to an open order is the order's own harm (labKit askHarm): one mistake, one penalty
  when: (s, sc) => sc.setting === 'ed' && !has(s, orderedFlag(id)) && !answeringWrong(s, id) && (s.pulse || !RN_ORDER_WITH_A_PULSE.includes(id)),
  text: `${name} without an order. The ER nurse gives a medication on a provider's order or an approved standing order or protocol (the state Nurse Practice Act, ENA scope and standards, facility policy), and this one is on neither: the chest pain standing order covers aspirin, nitroglycerin 0.4 mg, oxygen, the 12-lead, an IV, labs and the chest film, and the ACLS protocol the arrest drugs. Tell the ED physician what you see and what you think it needs (SBAR, closed loop), and give it once it is ordered.`,
});

/** The ER nurse's scope: a drug that needs the physician's order, given without one (see RN_ORDER_ONLY) */
export const SCOPE_RULES: Harm[] = Object.entries(RN_ORDER_ONLY).map(rnWithoutOrder);
