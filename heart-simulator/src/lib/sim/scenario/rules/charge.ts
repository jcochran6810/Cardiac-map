/**
 * How often a built-in rule charges in a case. Each rule charges once a case — but a drug contraindication charges once for
 * each drug given into it: a second, different drug into the same contraindication (amiodarone after metoprolol in
 * pre-excited AF; an amiodarone infusion after diltiazem at a rate of 22) is a mistake of its own, as each drug's label rules
 * it out. A repeat of the same drug costs nothing more. Indication rules, the minor rules, the checks before a nitrate and
 * the rules on anything that is not a medication (a procedure, a device, a position) keep charging once a case.
 */
import { INTERVENTION_BY_ID } from '../interventions';
import type { Penalty, Severity, SimState } from '../types';
import { INDICATION_RULES } from './scope';

/** The checks before a sublingual nitrate (a pressure, the interval, the PDE-5 question): checks, not contraindications */
export const NITRATE_CHECK_IDS = ['nitro-no-bp', 'nitro-too-soon', 'nitro-no-pde5'];

/** This built-in rule (its id and severity) charges once for each drug (`action`) given into it */
export function chargesPerDrug(rule: { id: string; severity: Severity }, action: string): boolean {
  return rule.severity !== 'minor' && !INDICATION_RULES.includes(rule.id) && !NITRATE_CHECK_IDS.includes(rule.id)
    && INTERVENTION_BY_ID[action]?.category === 'meds';
}

/** A penalty of this built-in rule counts against this act: any, or for a per-drug rule one charged on this drug */
export const countsFor = (p: Penalty, rule: { id: string; severity: Severity }, action: string) =>
  p.id === rule.id && (!chargesPerDrug(rule, action) || p.action === action);

/** This built-in rule was charged on an earlier act (for a per-drug rule: on an earlier dose of this drug) */
export const builtInChargedBefore = (s: SimState, rule: { id: string; severity: Severity }, action: string) =>
  s.penalties.some((p) => p.minute < s.minute && countsFor(p, rule, action));
