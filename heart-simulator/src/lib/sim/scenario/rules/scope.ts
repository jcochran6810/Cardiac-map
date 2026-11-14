/**
 * The ER nurse's scope in the emergency department: the drugs given only on the ED physician's order, and the rule that
 * scores one given without it.
 */
import { has, orderedFlag } from '../kit';
import { answeringWrong } from '../labKit';
import type { Harm, Scenario, SimState } from '../types';
import { chargedBefore } from './helpers';

/**
 * The drugs the ER nurse gives in the emergency department only on the ED physician's order (state Nurse Practice Act,
 * ENA scope and standards, facility policy), with the name the review gives each. None is on the chest pain standing
 * order (aspirin, nitroglycerin 0.4 mg, oxygen, the 12-lead, an IV, labs, the chest film) or the ACLS arrest protocol
 * (epinephrine, amiodarone, lidocaine in an arrest, the shocks); the glucose, antiemetic, anaphylaxis and bronchospasm
 * drugs are left to the department's protocols. Given with no order — the flag `ordered:<id>` (kit's orderedFlag, set by
 * edKit's edOrder, physicianOrder, physicianDispo or standingOrders) — each costs points once ('rn-without-order-<id>')
 */
export const RN_ORDER_ONLY: Record<string, string> = {
  heparin: 'Heparin', p2y12: 'A P2Y12 loading dose', metoprolol: 'IV metoprolol', diltiazem: 'IV diltiazem', procainamide: 'Procainamide',
  'amio-infusion': 'An amiodarone infusion', pressor: 'A vasopressor infusion', 'push-epi': 'Push-dose epinephrine',
  'insulin-dextrose': 'Insulin and dextrose', transfuse: 'A blood transfusion', steroid: 'IV methylprednisolone', glucagon: 'Glucagon',
  'albuterol-hyperk': 'High-dose albuterol', midazolam: 'Midazolam', fentanyl: 'IV fentanyl', 'nitro-high': 'High-dose nitroglycerin',
  atropine: 'Atropine', adenosine6: 'Adenosine', adenosine12: 'Adenosine',
  'calcium-chloride': 'Calcium chloride', 'sodium-bicarbonate': 'Sodium bicarbonate', 'magnesium-sulfate': 'Magnesium sulfate',
  alteplase: 'Alteplase', 'temp-control': 'Temperature control',
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
 * the missing order is scored for that act (missingOrderCovers), the engine (harmsFor) skips these for it: the missing
 * order covers the indication — asking the physician is where the indication is decided (one act, one penalty). The
 * contraindication rules still apply: a gate (rules/rhythm.ts, rules/acs.ts, rules/added.ts) passes a dose on from a
 * covered indication rank to the next reason that holds. The checks the nurse makes whether or not there is an order (a
 * pressure before nitroglycerin, the PDE-5 question, the interval between doses) are not indication rules: they charge
 * beside the missing order. Every id names a built-in rule (tests/rule-ids.test.ts).
 */
export const INDICATION_RULES = [
  'atropine-fast', 'calcium-no-indication', 'bicarbonate-no-indication', 'insulin-no-indication', 'albuterol-hyperk-no-indication',
  'nitro-high-not-hypertensive', 'transfuse-no-bleeding', 'lytic-no-indication', 'magnesium-no-indication', 'antiarrhythmic-no-arrhythmia',
  'lidocaine-no-arrhythmia', 'glucagon-no-indication', 'steroid-no-indication', 'pressor-no-hypotension', 'furosemide-no-indication',
  'nicardipine-no-hypertension', 'opioid-no-pain',
  // no role in an arrest (a tachycardia drug, nitroglycerin, an opioid or a sedative, a push-dose pressor), the
  // reperfusion the physician chooses, and the post-arrest and low-output treatments the physician decides on
  'rate-drug-in-arrest', 'no-role-in-arrest', 'push-epi-in-arrest', 'lytic-pci-available', 'temp-control-no-indication', 'inotrope-no-indication',
  // an anticoagulant or P2Y12 load with nothing to treat
  'antithrombotic-no-indication',
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

const SCOPE_BY_ID = new Map(SCOPE_RULES.map((h) => [h.id, h]));
const roleOk = (h: Harm, s: SimState) => !h.roles || h.roles.includes(s.role);
const appliesTo = (h: Harm, s: SimState, sc: Scenario, id: string) => h.actions.includes(id) && roleOk(h, s) && (!h.when || h.when(s, sc, id));

/**
 * The ER nurse gives this drug without the order it needs, and the missing order is scored for this act: the built-in
 * 'rn-without-order-<id>' charges it (the case has no rule of that id for this act, and the rule has not charged an earlier
 * one), or a case rule standing in for it — the same id, or listing it in `replaces` — applies to it, whether it charges
 * now or already did. Only for the role the order rule is written for: a case rule for every role is no order for the
 * doctor. The built-in indication rules (INDICATION_RULES) then stand aside for this act — the engine skips them, and a
 * gate passes the dose on from such a rank (one act, one penalty; the contraindications still charge)
 */
export function missingOrderCovers(s: SimState, sc: Scenario, id: string): boolean {
  const rule = SCOPE_BY_ID.get(rnWithoutOrderId(id));
  if (!rule || !roleOk(rule, s)) return false;
  const caseOwn = sc.harms.some((h) => h.id === rule.id && roleOk(h, s) && h.actions.includes(id));
  // the act being judged is not yet on the clock: a penalty with this minute is this act's own
  if (!caseOwn && !chargedBefore(s, rule.id) && appliesTo(rule, s, sc, id)) return true;
  return sc.harms.some((h) => (h.id === rule.id || !!h.replaces?.includes(rule.id)) && appliesTo(h, s, sc, id));
}

/** A built-in indication rule the missing order covers for this act (missingOrderCovers): it stands aside */
export const indicationCovered = (ruleId: string, s: SimState, sc: Scenario, id: string) =>
  INDICATION_RULES.includes(ruleId) && missingOrderCovers(s, sc, id);
