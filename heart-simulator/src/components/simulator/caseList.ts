/**
 * The case simulator's list for a role: the cases written for it, the cases written for other roles, and what the list
 * offers around them. Pure, so the picker's choices can be tested without a browser.
 */
import { ROLE_SETTING, type LearningLevel } from '@/store/useAppStore';
import { SCENARIOS } from '@/lib/sim/scenario/scenarios';
import type { Scenario } from '@/lib/sim/scenario/types';

export interface CaseSections {
  mine: Scenario[];
  others: Scenario[];
  /** the cath lab roles get the catalog's "study before you scrub in" link (never the field or the emergency department) */
  studyLab: boolean;
  /** no case is written for this role yet: the list says so instead of showing an empty grid */
  empty: boolean;
}

export function caseSections(role: LearningLevel, all: Scenario[] = SCENARIOS): CaseSections {
  const mine = all.filter((sc) => sc.roles.includes(role));
  const others = all.filter((sc) => !sc.roles.includes(role));
  return { mine, others, studyLab: ROLE_SETTING[role] === 'cathlab', empty: mine.length === 0 };
}
