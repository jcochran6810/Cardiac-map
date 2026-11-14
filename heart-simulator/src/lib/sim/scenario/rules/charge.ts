/**
 * How often a rule charges in a case, and what a repeat of a drug is judged by.
 *
 * Each rule charges once a case — but a drug contraindication charges once for each drug given into it: a second, different
 * drug into the same contraindication (amiodarone after metoprolol in pre-excited AF; an amiodarone infusion after diltiazem
 * at a rate of 22) is a mistake of its own, as each drug's label rules it out. A repeat of the same drug costs nothing more
 * from that rule — at another dose or by another route too (sublingual nitroglycerin, then 0.8 mg, then an infusion;
 * adenosine 6 mg, then 12 mg): DRUGS_OF says which drug each action gives. The same holds for a case rule that stands in for
 * a built-in drug contraindication (its id, or one listed in its `replaces`), or that the case marks `perDrug`: it charges
 * once for each drug, like the built-in it stands in for. Whether a rule charges per drug is decided for the rule, not for
 * the action, so the order of the drugs never changes the count. Indication rules, the minor rules, the checks before a
 * nitrate and the rules on anything that is not a medication keep charging once a case.
 *
 * One repeat policy for every gate (rules/rhythm.ts, rules/acs.ts, rules/added.ts and a case's nitrate rules): a later dose
 * of a different drug is judged anew. A repeat of the same drug is not charged again by the rule already charged on it,
 * nor by a reason that held already when the drug was charged (`Penalty.held`: a lesser reason the one charged spoke for,
 * one dose, one penalty) — that is the mistake already charged. It is charged for what is new: a reason that did not hold
 * then (the pressure has fallen since, a repeat the block does not answer, a dose too soon after the last), and the checks
 * owed before every dose (a pressure, the interval, the PDE-5 question), which are never covered.
 */
import { INTERVENTION_BY_ID } from '../interventions';
import type { Harm, Penalty, Scenario, Severity, SimState } from '../types';
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

/** A rule as charge.ts reads it */
type RuleLike = { id: string; severity: Severity; actions: string[] };

const JUDGED = new WeakMap<object, Set<string>>();
/**
 * The drugs this rule judges: those of its actions that give one drug each. The radial cocktail carries two, and a rate-drug
 * rule judges its verapamil (it lists intracoronary verapamil too), a nitrate rule its nitroglycerin — but a rule that judges
 * the action whole judges both (WHOLE_ACTION)
 */
function judgedBy(rule: { actions: string[] }): Set<string> {
  let set = JUDGED.get(rule);
  if (!set) {
    set = new Set(rule.actions.filter((a) => drugsOf(a).length === 1).flatMap((a) => drugsOf(a)));
    JUDGED.set(rule, set);
  }
  return set;
}
/** A rule as judgedDrugs reads it: a case rule's `replaces` names the built-in rules it speaks for */
type JudgingRule = { id: string; actions: string[]; replaces?: string[] };

const SPEAKS_FOR = new WeakMap<object, Set<string>>();
/**
 * The drugs a rule speaks for: those it judges itself, and those the built-in rules it stands in for judge (its id, its
 * `replaces`) — e.g. both drugs of the radial cocktail for a case rule standing in for the nitrate and the rate-drug rules
 */
function speaksFor(rule: JudgingRule): Set<string> {
  let set = SPEAKS_FOR.get(rule);
  if (!set) {
    const registry = builtIns();
    const standsFor = [rule.id, ...(rule.replaces ?? [])].map((id) => registry.get(id)).filter((b): b is Harm => !!b);
    set = new Set([rule, ...standsFor].flatMap((r) => Array.from(judgedBy(r))));
    SPEAKS_FOR.set(rule, set);
  }
  return set;
}

/**
 * The two-drug actions a rule judges whole, where its own reason covers both drugs and no other rule judges the second:
 * - the radial cocktail's low-pressure rule speaks for its nitroglycerin too (its text says so): the nitrate gate leaves
 *   the cocktail under 90 to it (nitro-hypotension judges NITRATES_ACS only). So does a case rule that stands in for the
 *   nitrate and the rate-drug rules alike: while it applies, no other rule judges either drug;
 * - no opioid rule judges the procedure's sedation: every rule on it judges its midazolam and its fentanyl.
 * Narrowing these would let the second drug go free after the first was charged (intracoronary verapamil, then the cocktail
 * into the same low pressure; midazolam, then the sedation's fentanyl into the same shock)
 */
const WHOLE_ACTION: Record<string, (rule: JudgingRule) => boolean> = {
  'radial-cocktail': (rule) => rule.id === 'cocktail-low-pressure' || drugsOf('radial-cocktail').every((d) => speaksFor(rule).has(d)),
  sedation: () => true,
};
/**
 * The drugs of this action this rule judges: every drug of it when the rule lists none of them alone, or when the rule
 * judges the action whole (WHOLE_ACTION); otherwise those it lists alone — the cocktail's verapamil for a rate-drug rule,
 * its nitroglycerin for a nitrate rule
 */
export function judgedDrugs(rule: JudgingRule, action?: string): string[] {
  const all = drugsOf(action);
  if (action && WHOLE_ACTION[action]?.(rule)) return all;
  const mine = judgedBy(rule);
  const judged = all.filter((d) => mine.has(d));
  return judged.length ? judged : all;
}
/**
 * An action this rule judges whole whose every drug was given and charged already: by this rule, or on an earlier act of its
 * own (one drug) for a reason that still holds now (Penalty.held) — the cocktail after intracoronary nitroglycerin and
 * verapamil into the same low pressure, the sedation after fentanyl and midazolam into the same shock: no new drug
 */
export function wholeActionRepeat(s: SimState, sc: Scenario, rule: JudgingRule, action: string): boolean {
  if (!WHOLE_ACTION[action]?.(rule)) return false;
  const own = new Set(s.penalties.filter((p) => p.id === rule.id && p.minute < s.minute).flatMap((p) => judgedDrugs(rule, p.action)));
  if (!own.size) return false;
  const onItsOwn = (d: string) => s.penalties.some((p) => p.minute < s.minute && !!p.action && drugsOf(p.action).length === 1 && drugsOf(p.action)[0] === d
    && (p.held ?? []).some((id) => holdingNow(s, sc, p.action!).includes(id)));
  return drugsOf(action).every((d) => own.has(d) || onItsOwn(d));
}
/** Every drug of this action the rule judges is among the drugs of these earlier acts (a repeat, for this rule) */
const repeatOf = (rule: JudgingRule, action: string, earlier: Penalty[]) => {
  const given = new Set(earlier.flatMap((p) => judgedDrugs(rule, p.action)));
  return judgedDrugs(rule, action).every((d) => given.has(d));
};

const isMedication = (action: string) => INTERVENTION_BY_ID[action]?.category === 'meds';

/** This built-in rule charges once for each drug given into it: a major or critical drug rule, no indication rule and no check */
export function chargesPerDrug(rule: RuleLike): boolean {
  return rule.severity !== 'minor' && !INDICATION_RULES.includes(rule.id) && !NITRATE_CHECK_IDS.includes(rule.id) && rule.actions.some(isMedication);
}

/**
 * The rule `rule` was charged against this act (`action`): once a case, any penalty of it; for a rule that charges once for
 * each drug, penalties that between them cover every drug of this act the rule judges. `earlier`: only on an earlier act
 * (the penalty pushed for the act being judged has the current minute, so a condition that reads this does not change while
 * the engine charges the act's rules one after the other)
 */
export function chargedAgainst(s: SimState, rule: JudgingRule, perDrug: boolean, action: string, earlier = false): boolean {
  const mine = s.penalties.filter((p) => p.id === rule.id && (!earlier || p.minute < s.minute));
  if (!mine.length) return false;
  return !perDrug || repeatOf(rule, action, mine);
}

/** This built-in rule was charged on an earlier act (for a per-drug rule: on earlier doses of every drug this act gives) */
export const builtInChargedBefore = (s: SimState, rule: RuleLike, action: string) => chargedAgainst(s, rule, chargesPerDrug(rule), action, true);

/**
 * A reason that held already when this drug was charged on an earlier act (`Penalty.held`): a repeat of the same drug is
 * not charged for it — it was part of the mistake charged then (one dose, one penalty). The checks before a nitrate are never
 * covered: each dose owes them. A different drug is never covered (judged anew)
 */
export function coveredBefore(s: SimState, rule: JudgingRule, action: string): boolean {
  if (NITRATE_CHECK_IDS.includes(rule.id)) return false;
  const earlier = s.penalties.filter((p) => p.minute < s.minute && !!p.held?.includes(rule.id));
  return earlier.length > 0 && repeatOf(rule, action, earlier);
}

/**
 * A rank of a gate is passed over for this act: charged already against it (rules charging once a case: on any earlier act;
 * per drug: on earlier doses of this drug), or covered by an earlier dose of this drug (coveredBefore). The one repeat policy
 * of every gate
 */
export const passedOver = (s: SimState, rule: JudgingRule, perDrug: boolean, action: string) =>
  chargedAgainst(s, rule, perDrug, action, true) || coveredBefore(s, rule, action);

// ─── The built-in rules, and what each one's own condition is ──────────────

/**
 * The built-in rules by id (rules/index.ts registers BUILT_IN_HARMS here: this file cannot import them, since the rule files
 * import it). A case rule stands in for one of them by its id or its `replaces`
 */
const BUILT_IN = new Map<string, Harm>();
export function registerBuiltIns(rules: readonly Harm[]) {
  for (const r of rules) BUILT_IN.set(r.id, r);
}
/** The registry is filled (rules/index.ts, which the engine imports): without it every case rule would charge once a case */
function builtIns(): Map<string, Harm> {
  if (!BUILT_IN.size) throw new Error('rules/charge.ts: the built-in rules are not registered — import the engine (or rules/index.ts) first');
  return BUILT_IN;
}

type Condition = (s: SimState, sc: Scenario, id: string) => boolean;
/**
 * The own condition of each built-in rule judged through a gate (its `when` asks the gate whether it is the top rule): the
 * gate files register it, with the gate's own opening condition (e.g. a pulse for the nitrates)
 */
const CONDITION = new Map<string, Condition>();
export const registerCondition = (id: string, condition: Condition) => { CONDITION.set(id, condition); };

/**
 * The built-in rules whose own condition holds for this act, whatever ranks above them (the checks before a nitrate left
 * out): what a penalty charged on the act speaks for (`Penalty.held`)
 */
export function holdingNow(s: SimState, sc: Scenario, id: string): string[] {
  const out: string[] = [];
  for (const b of Array.from(builtIns().values())) {
    if (!b.actions.includes(id) || (b.roles && !b.roles.includes(s.role)) || NITRATE_CHECK_IDS.includes(b.id)) continue;
    const own = CONDITION.get(b.id) ?? b.when;
    if (!own || own(s, sc, id)) out.push(b.id);
  }
  return out;
}

/** Case rules that are checks before a nitrate under an id of their own (rules/acs.ts: a case nitrate rule at a check's rank) */
const CHECK_RULES = new WeakSet<Harm>();
export const markNitrateCheck = (h: Harm) => { CHECK_RULES.add(h); };
/** This rule is a check before a nitrate: one of the built-in checks' ids, or a case's check (markNitrateCheck) */
export const isNitrateCheck = (h: Harm) => NITRATE_CHECK_IDS.includes(h.id) || CHECK_RULES.has(h);

/** The built-in rank a case rule stands at, under an id of its own (rules/acs.ts nitrateCaseRule) */
const RANK = new WeakMap<Harm, string>();
export const markRank = (h: Harm, rank: string) => { RANK.set(h, rank); };
export const rankOf = (h: Harm): string | undefined => RANK.get(h);

/**
 * This case rule charges once for each drug given into it, as the built-in drug contraindication it stands in for does: it
 * is major or critical, no indication rule and no check before a nitrate, and either the case marks it `perDrug` (a drug
 * contraindication of the case's own, on several drugs), or on one of its medications it has the id of a built-in rule that
 * charges per drug there, or lists one in its `replaces`. Decided for the rule: on every action it judges. Any other case
 * rule charges once a case
 */
export function caseChargesPerDrug(h: Harm): boolean {
  if (h.severity === 'minor' || INDICATION_RULES.includes(h.id) || isNitrateCheck(h)) return false;
  if (h.perDrug) return true;
  const registry = builtIns();
  const standsFor = [h.id, ...(h.replaces ?? [])].map((id) => registry.get(id)).filter((b): b is Harm => !!b && chargesPerDrug(b));
  return h.actions.some((a) => isMedication(a) && standsFor.some((b) => b.actions.includes(a)));
}

/** This case rule was charged on an earlier act (for a per-drug rule: on earlier doses of every drug this act gives) */
export const caseChargedBefore = (s: SimState, h: Harm, action: string) => chargedAgainst(s, h, caseChargesPerDrug(h), action, true);
