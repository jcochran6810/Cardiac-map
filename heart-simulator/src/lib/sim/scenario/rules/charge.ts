/**
 * How often a built-in rule charges in a case. Each rule charges once a case — but a drug contraindication charges once for
 * each drug given into it: a second, different drug into the same contraindication (amiodarone after metoprolol in
 * pre-excited AF; an amiodarone infusion after diltiazem at a rate of 22) is a mistake of its own, as each drug's label rules
 * it out. A repeat of the same drug costs nothing more — at another dose or by another route too (sublingual nitroglycerin,
 * then 0.8 mg, then an infusion; adenosine 6 mg, then 12 mg): DRUGS_OF says which drug each action gives. Indication rules,
 * the minor rules, the checks before a nitrate and the rules on anything that is not a medication (a procedure, a device, a
 * position) keep charging once a case.
 */
import { INTERVENTION_BY_ID } from '../interventions';
import type { Penalty, Severity, SimState } from '../types';
import { INDICATION_RULES } from './scope';

/** The checks before a sublingual nitrate (a pressure, the interval, the PDE-5 question): checks, not contraindications */
export const NITRATE_CHECK_IDS = ['nitro-no-bp', 'nitro-too-soon', 'nitro-no-pde5'];

/**
 * The drugs an action gives, where one drug has several actions (doses, routes, salts) or one action carries two drugs (the
 * radial cocktail: verapamil and nitroglycerin). Any other drug action gives a drug of its own, named by its id
 */
export const DRUGS_OF: Record<string, string[]> = {
  nitro: ['nitroglycerin'], 'nitro-high': ['nitroglycerin'], 'nitro-assist': ['nitroglycerin'], 'nitro-iv': ['nitroglycerin'],
  'ic-nitro': ['nitroglycerin'], 'radial-cocktail': ['verapamil', 'nitroglycerin'], 'ic-verapamil': ['verapamil'],
  adenosine3: ['adenosine'], adenosine6: ['adenosine'], adenosine12: ['adenosine'], 'ic-adenosine': ['adenosine'], 'adenosine-iv-ffr': ['adenosine'],
  'amio-arrest': ['amiodarone'], 'amio-infusion': ['amiodarone'],
  metoprolol: ['metoprolol'], 'metoprolol-po': ['metoprolol'],
  epinephrine: ['epinephrine'], 'push-epi': ['epinephrine'], 'epi-im': ['epinephrine'], 'ic-epinephrine': ['epinephrine'],
  'calcium-chloride': ['calcium'], 'calcium-gluconate': ['calcium'],
  albuterol: ['albuterol'], 'albuterol-hyperk': ['albuterol'],
  'oral-glucose': ['glucose'], dextrose: ['glucose'],
};
/** The drugs this action gives (none for no action) */
export const drugsOf = (action?: string): string[] => (action ? DRUGS_OF[action] ?? [action] : []);
/** The two actions give a drug in common: the same drug, at another dose or by another route */
export const sameDrug = (a: string | undefined, b: string) => drugsOf(a).some((d) => drugsOf(b).includes(d));

/** This built-in rule (its id and severity) charges once for each drug (`action`) given into it */
export function chargesPerDrug(rule: { id: string; severity: Severity }, action: string): boolean {
  return rule.severity !== 'minor' && !INDICATION_RULES.includes(rule.id) && !NITRATE_CHECK_IDS.includes(rule.id)
    && INTERVENTION_BY_ID[action]?.category === 'meds';
}

/** A penalty of this built-in rule counts against this act: any, or for a per-drug rule one charged on the same drug */
export const countsFor = (p: Penalty, rule: { id: string; severity: Severity }, action: string) =>
  p.id === rule.id && (!chargesPerDrug(rule, action) || sameDrug(p.action, action));

/** This built-in rule was charged on an earlier act (for a per-drug rule: on an earlier dose of this drug) */
export const builtInChargedBefore = (s: SimState, rule: { id: string; severity: Severity }, action: string) =>
  s.penalties.some((p) => p.minute < s.minute && countsFor(p, rule, action));
