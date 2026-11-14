/**
 * The drugs added beside the old ones of a group — adenosine 3 mg, esmolol, labetalol and oral metoprolol, IV
 * nitroglycerin, calcium gluconate — must meet every case's own words for that group. A case rule (a contraindication, an
 * ask's wrong answer) or a case's response that names one member of a group names every member the case offers to that
 * role, unless the list below says why not. Otherwise the new drug slips past the case's trap: it scores nothing and
 * changes nothing where the old one would have crashed the patient.
 */
import { describe, expect, it } from 'vitest';
import { BUILT_IN_HARMS } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID } from '@/lib/sim/scenario/interventions';
import { SCENARIOS } from '@/lib/sim/scenario/scenarios';
import type { Harm, Scenario } from '@/lib/sim/scenario/types';

/** A group: when a rule or a response names any of `old`, it names every one of `added` the case offers */
interface Group { name: string; old: string[]; added: string[]; responders: boolean }
const GROUPS: Group[] = [
  { name: 'adenosine', old: ['adenosine6', 'adenosine12'], added: ['adenosine3'], responders: true },
  // an IV beta-blocker's response is the rate and the pressure falling now; the tablet changes nothing in the next minutes
  // (the default answers it), so only the rules must name it
  { name: 'IV beta-blockers', old: ['metoprolol'], added: ['esmolol', 'labetalol'], responders: true },
  { name: 'oral metoprolol', old: ['metoprolol'], added: ['metoprolol-po'], responders: false },
  // every nitroglycerin the case's rule names in its two sublingual doses is a nitroglycerin by vein too
  { name: 'nitroglycerin', old: ['nitro', 'nitro-high'], added: ['nitro-iv'], responders: true },
  { name: 'calcium', old: ['calcium-chloride'], added: ['calcium-gluconate'], responders: true },
];

/**
 * Rules and responses that name an old member and rightly leave a new one out: `case id` → `rule id` (or 'respond') →
 * the new ids left out, with the reason
 */
const ALLOWED: Record<string, Record<string, { ids: string[]; why: string }>> = {
  'guide-dissection-cathlab': {
    'beta-blocker-after': { ids: ['metoprolol-po'], why: 'once the RCA is open an oral beta-blocker is the right start (its text says so); the built-in oral rule judges the shock risk' },
  },
  'periprocedural-stroke-cathlab': {
    'lower-bp-stroke': { ids: ['metoprolol-po'], why: 'a tablet does not bring the pressure down now: with a new deficit it is the nothing-by-mouth mistake' },
    'lower-bp-again': { ids: ['metoprolol-po'], why: 'as lower-bp-stroke' },
  },
};

/** The roles that can give this action in this case (the rule's roles, else the case's) */
function offered(sc: Scenario, id: string, roles: number[]): boolean {
  const iv = INTERVENTION_BY_ID[id];
  return !!iv && (!iv.settings || iv.settings.includes(sc.setting)) && roles.some((r) => iv.roles.includes(r as never));
}

/** Only rules about one of the two sublingual doses (the 0.4 mg or the 0.8 mg alone) name one nitroglycerin and not the other */
const namesOld = (g: Group, actions: string[]) => (g.name === 'nitroglycerin' ? g.old.every((o) => actions.includes(o)) : g.old.some((o) => actions.includes(o)));

function gaps(): string[] {
  const out: string[] = [];
  for (const sc of SCENARIOS) {
    const allowed = ALLOWED[sc.id] ?? {};
    for (const g of GROUPS) {
      for (const h of sc.harms as Harm[]) {
        if (!namesOld(g, h.actions)) continue;
        const roles = h.roles ?? sc.roles;
        const missing = g.added.filter((a) => offered(sc, a, roles) && !h.actions.includes(a) && !allowed[h.id]?.ids.includes(a));
        if (missing.length) out.push(`${sc.id}: rule ${h.id} (${g.name}) lacks ${missing.join(', ')}`);
      }
      if (!g.responders) continue;
      const keys = Object.keys(sc.respond);
      if (!namesOld(g, keys) && !(g.name === 'nitroglycerin' && keys.some((k) => g.old.includes(k)))) continue;
      const missing = g.added.filter((a) => offered(sc, a, sc.roles) && !keys.includes(a) && !allowed.respond?.ids.includes(a));
      if (missing.length) out.push(`${sc.id}: respond (${g.name}) lacks ${missing.join(', ')}`);
    }
  }
  return out;
}

/** The actions added with the new drugs: a same-id case rule hides its built-in for these too, so it must name them */
const NEW_ACTIONS = ['adenosine3', 'esmolol', 'labetalol', 'metoprolol-po', 'nitro-iv', 'calcium-gluconate', 'nicardipine', 'inotrope', 'furosemide'];

/**
 * Same-id case rules that rightly leave out a new action the built-in names: `case id` → `rule id` → the reason. The case
 * then has no rule of that id for the new action (the built-in stays hidden for it)
 */
const SAME_ID_ALLOWED: Record<string, Record<string, string>> = Object.fromEntries(
  ['aortic-dissection-ed', 'takotsubo-lvot-cathlab', 'heart-block-temp-wire-cathlab', 'guide-dissection-cathlab'].map((id) => [id, {
    // IV nitroglycerin is dosed by its indication: the high-dose bolus only for pulmonary edema, which none of these has
    'nitro-high-not-hypertensive': 'IV nitroglycerin here is the standard infusion, not the high dose: the 0.8 mg rule has nothing to say about it',
  }]),
);

/** Same-id case rules (a case's words in a built-in's place) missing a new action the built-in names and the case offers */
function sameIdGaps(): string[] {
  const out: string[] = [];
  for (const sc of SCENARIOS) {
    for (const h of sc.harms) {
      const builtIn = BUILT_IN_HARMS.find((b) => b.id === h.id);
      if (!builtIn || SAME_ID_ALLOWED[sc.id]?.[h.id]) continue;
      const missing = builtIn.actions.filter((a) => NEW_ACTIONS.includes(a) && !h.actions.includes(a) && offered(sc, a, h.roles ?? sc.roles));
      if (missing.length) out.push(`${sc.id}: same-id rule ${h.id} lacks ${missing.join(', ')}`);
    }
  }
  return out;
}

describe('the new drugs of a group meet every case\'s words for that group', () => {
  it('every case rule and response that names an old member names the new ones the case offers', () => {
    expect(gaps()).toEqual([]);
  });

  it('a case rule with a built-in\'s id names the new actions the built-in names (it hides the built-in for them)', () => {
    expect(sameIdGaps()).toEqual([]);
  });

  it('the allowances name rules and responses that exist', () => {
    for (const [id, rules] of Object.entries(ALLOWED)) {
      const sc = SCENARIOS.find((s) => s.id === id)!;
      expect(sc, id).toBeDefined();
      for (const rule of Object.keys(rules)) expect(rule === 'respond' || sc.harms.some((h) => h.id === rule), `${id} ${rule}`).toBe(true);
    }
    for (const [id, rules] of Object.entries(SAME_ID_ALLOWED)) {
      const sc = SCENARIOS.find((s) => s.id === id)!;
      for (const rule of Object.keys(rules)) expect(sc.harms.some((h) => h.id === rule) && BUILT_IN_HARMS.some((b) => b.id === rule), `${id} ${rule}`).toBe(true);
    }
  });
});
