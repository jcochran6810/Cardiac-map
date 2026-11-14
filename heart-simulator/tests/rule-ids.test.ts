/**
 * No stale rule id. A case rule's `replaces` hides built-in rules (engine harmsFor filters BUILT_IN_HARMS only), so an id
 * there that names no built-in rule — a rule renamed or removed, or one of the case's own rules — silently stops doing
 * anything, and the dose it was meant to cover earns two penalties again. The same holds for the exported rule lists the
 * cases and the engine build on (RATE_RULES, NITRATE_RULES, LYTIC_RULES, ANTITHROMBOTIC_RULES, PROTAMINE_RULES,
 * SEDATIVE_RULES, INDICATION_RULES …): each must name rules that exist.
 */
import { describe, expect, it } from 'vitest';
import { BUILT_IN_HARMS } from '@/lib/sim/scenario/rules';
import {
  ANTITHROMBOTIC_RULES, LYTIC_RULES, NITRATE_CHECKS, NITRATE_RULES, PROTAMINE_RULES, SEDATIVE_RULES,
} from '@/lib/sim/scenario/rules/acs';
import { LADDERS, LIDOCAINE_RULES, PROCAINAMIDE_RULES, RATE_RULES } from '@/lib/sim/scenario/rules/rhythm';
import { INDICATION_RULES } from '@/lib/sim/scenario/rules/scope';
import { SCENARIOS } from '@/lib/sim/scenario/scenarios';
import type { LearningLevel } from '@/store/useAppStore';

const BUILT_IN = new Map(BUILT_IN_HARMS.map((h) => [h.id, h]));

/** The rule lists a case rule names in its `replaces` to speak for a whole drug family (and the engine's own lists) */
const RULE_LISTS: Record<string, readonly string[]> = {
  RATE_RULES, LIDOCAINE_RULES, PROCAINAMIDE_RULES, NITRATE_RULES, NITRATE_CHECKS, LYTIC_RULES, ANTITHROMBOTIC_RULES, PROTAMINE_RULES,
  SEDATIVE_RULES, INDICATION_RULES,
  ...Object.fromEntries(Object.entries(LADDERS).map(([drug, ladder]) => [`LADDERS['${drug}']`, ladder])),
};
/** Ids that come in through a family list: they speak for every drug of the family, so not each one judges the rule's own actions */
const FAMILY = new Set([RATE_RULES, LIDOCAINE_RULES, PROCAINAMIDE_RULES, NITRATE_RULES, NITRATE_CHECKS, LYTIC_RULES, ANTITHROMBOTIC_RULES,
  PROTAMINE_RULES, SEDATIVE_RULES].flat());

const ALL_ROLES: LearningLevel[] = [1, 2, 3, 4, 5, 6, 7];

describe('no stale rule id', () => {
  it.each(Object.entries(RULE_LISTS))('%s names only built-in rules', (_name, ids) => {
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.filter((id) => !BUILT_IN.has(id))).toEqual([]);
  });

  it('every id a case rule replaces names a built-in rule (only built-ins can be replaced)', () => {
    const stale = SCENARIOS.flatMap((sc) => sc.harms.flatMap((h) => (h.replaces ?? []).filter((id) => !BUILT_IN.has(id))
      .map((id) => `${sc.id}: ${h.id} replaces ${id}${sc.harms.some((o) => o.id === id) ? ' (a case rule)' : ''}`)));
    expect(stale).toEqual([]);
  });

  it('a built-in a case rule replaces by name judges one of its actions, for a role both are written for', () => {
    const dead: string[] = [];
    for (const sc of SCENARIOS) {
      for (const h of sc.harms) {
        for (const id of h.replaces ?? []) {
          const b = BUILT_IN.get(id);
          if (!b || FAMILY.has(id)) continue;
          const actions = h.actions.filter((a) => b.actions.includes(a));
          const roles = (h.roles ?? ALL_ROLES).filter((r) => sc.roles.includes(r) && (!b.roles || b.roles.includes(r)));
          if (!actions.length || !roles.length) dead.push(`${sc.id}: ${h.id} replaces ${id} (${!actions.length ? 'no shared action' : 'no shared role'})`);
        }
      }
    }
    expect(dead).toEqual([]);
  });

  it('a case rule that replaces a family replaces at least one rule on its own actions', () => {
    const dead = SCENARIOS.flatMap((sc) => sc.harms
      .filter((h) => h.replaces?.length && !h.replaces.some((id) => BUILT_IN.get(id)?.actions.some((a) => h.actions.includes(a))))
      .map((h) => `${sc.id}: ${h.id}`));
    expect(dead).toEqual([]);
  });
});
