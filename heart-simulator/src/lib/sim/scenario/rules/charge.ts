/**
 * How often a rule charges in a case. Each rule charges once a case — but a drug contraindication charges once for each drug
 * given into it: a second, different drug into the same contraindication (amiodarone after metoprolol in pre-excited AF; an
 * amiodarone infusion after diltiazem at a rate of 22) is a mistake of its own, as each drug's label rules it out. A repeat of
 * the same drug costs nothing more — at another dose or by another route too (sublingual nitroglycerin, then 0.8 mg, then an
 * infusion; adenosine 6 mg, then 12 mg): DRUGS_OF says which drug each action gives. The same holds for a case rule that
 * stands in for a built-in drug contraindication (its id, or one listed in its `replaces`): it charges once for each drug,
 * like the built-in it stands in for. Indication rules, the minor rules, the checks before a nitrate and the rules on
 * anything that is not a medication (a procedure, a device, a position) keep charging once a case.
 */
import { INTERVENTION_BY_ID } from '../interventions';
import type { Harm, Penalty, Severity, SimState } from '../types';
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
  // the procedure's sedation and analgesia per protocol: midazolam with fentanyl (the cath lab's conscious sedation, EMS
  // procedural sedation)
  sedation: ['midazolam', 'fentanyl'],
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

/**
 * A penalty of the rule `ruleId` counts against this act (`action`): any — or, for a rule that charges once for each drug,
 * one charged on the same drug
 */
export const countsAgainst = (p: Penalty, ruleId: string, perDrug: boolean, action: string) =>
  p.id === ruleId && (!perDrug || sameDrug(p.action, action));

/** A penalty of this built-in rule counts against this act: any, or for a per-drug rule one charged on the same drug */
export const countsFor = (p: Penalty, rule: { id: string; severity: Severity }, action: string) =>
  countsAgainst(p, rule.id, chargesPerDrug(rule, action), action);

/**
 * The rule `ruleId` (charging once for each drug, or once a case) was charged against this act on an earlier act. Every
 * gate (rules/rhythm.ts, rules/acs.ts, rules/added.ts) passes such a rank over — one repeat policy for all of them: a later
 * dose of a different drug is judged anew (a per-drug rank charges again for the new drug; a rank that charges once a case
 * is passed over, and the dose goes on to the next reason that holds), and a repeat of the same drug is not charged again
 * by the rule already charged on it — it too goes on to the next reason that holds (another dose too soon after the last,
 * a repeat the block does not answer …), and never goes free because an earlier one was charged. The penalty pushed for
 * the act being judged has the current minute, so a condition that reads this does not change while the engine charges
 * the act's rules one after the other
 */
export const chargedBeforeAs = (s: SimState, ruleId: string, perDrug: boolean, action: string) =>
  s.penalties.some((p) => p.minute < s.minute && countsAgainst(p, ruleId, perDrug, action));

/** This built-in rule was charged on an earlier act (for a per-drug rule: on an earlier dose of this drug) */
export const builtInChargedBefore = (s: SimState, rule: { id: string; severity: Severity }, action: string) =>
  chargedBeforeAs(s, rule.id, chargesPerDrug(rule, action), action);

/**
 * The built-in rules by id (rules/index.ts registers BUILT_IN_HARMS here: this file cannot import them, since the rule files
 * import it). A case rule stands in for one of them by its id or its `replaces`
 */
const BUILT_IN = new Map<string, { id: string; severity: Severity; actions: string[] }>();
export function registerBuiltIns(rules: readonly { id: string; severity: Severity; actions: string[] }[]) {
  for (const r of rules) BUILT_IN.set(r.id, { id: r.id, severity: r.severity, actions: r.actions });
}

/** Case rules that are checks before a nitrate under an id of their own (rules/acs.ts: a case nitrate rule at a check's rank) */
const CHECK_RULES = new WeakSet<Harm>();
export const markNitrateCheck = (h: Harm) => { CHECK_RULES.add(h); };
/** This rule is a check before a nitrate: one of the built-in checks' ids, or a case's check (markNitrateCheck) */
export const isNitrateCheck = (h: Harm) => NITRATE_CHECK_IDS.includes(h.id) || CHECK_RULES.has(h);

/**
 * This case rule charges once for each drug given into it (`action`), as the built-in drug contraindication it stands in for
 * does: it is major or critical, judges a medication, is no indication rule and no check before a nitrate, and it has the id
 * of a built-in rule that charges per drug for this action, or lists one in its `replaces`. Any other case rule charges once
 * a case
 */
export function caseChargesPerDrug(h: Harm, action: string): boolean {
  if (h.severity === 'minor' || INDICATION_RULES.includes(h.id) || isNitrateCheck(h) || INTERVENTION_BY_ID[action]?.category !== 'meds') return false;
  const perDrug = (id: string) => { const b = BUILT_IN.get(id); return !!b && b.actions.includes(action) && chargesPerDrug(b, action); };
  return perDrug(h.id) || !!h.replaces?.some(perDrug);
}

/** A penalty of this case rule counts against this act: any — or, for a rule that charges per drug, one charged on the same drug */
export const caseCountsFor = (p: Penalty, h: Harm, action: string) => countsAgainst(p, h.id, caseChargesPerDrug(h, action), action);

/** This case rule was charged on an earlier act (for a per-drug rule: on an earlier dose of this drug): see chargedBeforeAs */
export const caseChargedBefore = (s: SimState, h: Harm, action: string) => chargedBeforeAs(s, h.id, caseChargesPerDrug(h, action), action);

