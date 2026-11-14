/**
 * The built-in rhythm rules (rules/rhythm.ts): the rate and AV-nodal drugs, the arrest drugs, lidocaine, procainamide,
 * magnesium, atropine, the shocks, pacing and the transvenous wire, and the cath lab's AV-nodal drugs. For each newer rule:
 * it fires; it does not fire in the nearest correct state; a case rule with its id replaces it; and the gate gives one dose
 * one penalty (the highest-ranked rule that applies, LADDERS).
 */
import { describe, expect, it } from 'vitest';
import { BUILT_IN_HARMS, start } from '@/lib/sim/scenario/engine';
import { has, orderedFlag } from '@/lib/sim/scenario/kit';
import { INDICATION_RULES } from '@/lib/sim/scenario/rules/scope';
import {
  LADDERS, LIDOCAINE_RULES, PROCAINAMIDE_RULES, RATE_DRUGS, RATE_RULES, RHYTHM_RULES, topRhythmRule, yieldToHeavier, yieldsToHeavier,
} from '@/lib/sim/scenario/rules/rhythm';
import { SCENARIO_BY_ID, SCENARIOS } from '@/lib/sim/scenario/scenarios';
import type { Harm, Problem, Scenario, Setting, Vitals } from '@/lib/sim/scenario/types';
import type { LearningLevel } from '@/store/useAppStore';
import { runScenario } from './helpers';
import { fixture, penaltyIds } from './ruleFixture';

const SINUS = { profile: 'normal-sinus', hr: 80 };
const SLOW_SINUS = { profile: 'sinus-bradycardia', hr: 44 };
const CHB = { profile: 'third-degree-avb', hr: 38 };
const AF = { profile: 'atrial-fibrillation', hr: 150 };
const SVT = { profile: 'avnrt', hr: 180 };
const VT = { profile: 'vt', hr: 170 };
const VF = { profile: 'vf', hr: 0 };
const PEA = { profile: 'pea', hr: 40 };
const TORSADES = { profile: 'torsades', hr: 220 };
const PREEXCITED = { profile: 'af-wpw', hr: 210 };

interface Patient {
  rhythm?: { profile: string; hr: number };
  vitals?: Partial<Vitals>;
  problems?: Problem[];
  pulse?: boolean;
  harms?: Harm[];
  extra?: Partial<Scenario>;
}
const patient = (setting: Setting, role: LearningLevel) => (p: Patient = {}) => fixture({ setting, role, rhythm: p.rhythm ?? SINUS, ...p });
const field = patient('field', 2);
const lab = patient('cathlab', 5);
const edMd = patient('ed', 7);
const edRn = patient('ed', 6);

/** The penalties a run earns, played by the role the fixture is written for */
const pen = (sc: Scenario, steps: string[]) => penaltyIds(sc, sc.roles[0], steps);
/** A case rule with the same id as a built-in that never charges: it replaces the built-in (a deliberate exemption) */
const exempt = (id: string, actions: string[]): Harm => ({ id, actions, when: () => false, points: 1, severity: 'minor', text: 'Not charged in this case.' });
/** The case gave the ER nurse this order (the flag 'ordered:<id>') */
const ordered = (id: string): Partial<Scenario> => ({ events: [{ id: 'order', when: () => true, effect: () => ({ flags: [orderedFlag(id)] }) }] });
/** A flag the case set (e.g. 'rosc', 'wired') */
const flagged = (flag: string): Partial<Scenario> => ({ events: [{ id: flag, when: () => true, effect: () => ({ flags: [flag] }) }] });
const rule = (id: string) => RHYTHM_RULES.find((r) => r.id === id)!;

describe('the gate: one dose, one penalty', () => {
  it('every rule of the file on a laddered action is ranked in that action\'s ladder, and every ladder names real rules', () => {
    for (const [action, ladder] of Object.entries(LADDERS)) {
      for (const r of RHYTHM_RULES.filter((h) => h.actions.includes(action))) expect(ladder, `${action}: ${r.id}`).toContain(r.id);
      for (const id of ladder) expect(RHYTHM_RULES.some((r) => r.id === id), `${action}: ${id}`).toBe(true);
    }
    for (const action of RATE_DRUGS) expect(LADDERS[action]).toBe(LADDERS.metoprolol);
  });

  it('an indication rank the ER nurse\'s missing order covers stands aside, so it never hides a contraindication ranked under it', () => {
    expect(INDICATION_RULES).toContain('rate-drug-in-arrest');
    // in an arrest with asthma: the missing order speaks for "no role in an arrest", and the asthma still charges
    const asthmaArrest = { rhythm: VF, pulse: false, problems: ['asthma'] as Problem[] };
    expect(pen(edRn(asthmaArrest), ['io', 'adenosine6'])).toEqual(['adenosine-asthma', 'rn-without-order-adenosine6']);
    // the physician (and the ordered dose) is judged by the top rule alone
    expect(pen(edMd(asthmaArrest), ['io', 'adenosine6'])).toEqual(['rate-drug-in-arrest']);
    expect(pen(edRn({ ...asthmaArrest, extra: ordered('adenosine6') }), ['io', 'adenosine6'])).toEqual(['rate-drug-in-arrest']);
  });

  it('RATE_RULES are the newer rules on the rate drugs; LIDOCAINE_RULES every rule on lidocaine', () => {
    for (const older of ['av-blocker-preexcited-af', 'diltiazem-vt', 'diltiazem-heart-failure', 'beta-blocker-stimulant', 'amiodarone-long-qt', 'amiodarone-after-procainamide']) {
      expect(RATE_RULES).not.toContain(older);
    }
    expect(RATE_RULES).toContain('nodal-blocker-slow');
    expect(RATE_RULES).toContain('antiarrhythmic-no-arrhythmia');
    expect(PROCAINAMIDE_RULES).not.toContain('procainamide-after-amiodarone');
    expect(LIDOCAINE_RULES).toEqual(LADDERS.lidocaine);
  });

  it('a case rule that replaces RATE_RULES speaks for the whole dose while it applies, whichever rule the gate picked', () => {
    const caseRule: Harm = { id: 'case-rate-drug', actions: ['metoprolol'], points: 5, severity: 'major', replaces: RATE_RULES, text: 'The case\'s words.' };
    for (const p of [{ rhythm: { profile: 'sinus-bradycardia', hr: 40 }, vitals: { sbp: 80, dbp: 50 } }, { rhythm: AF, vitals: { sbp: 84, dbp: 50 } }]) {
      expect(pen(field(p), ['iv', 'metoprolol'])).not.toEqual(['case-rate-drug']);
      expect(pen(field({ ...p, harms: [caseRule] }), ['iv', 'metoprolol'])).toEqual(['case-rate-drug']);
    }
  });

  it('every built-in id is still unique', () => {
    const ids = BUILT_IN_HARMS.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  const VT_LOW = { rhythm: VT, vitals: { sbp: 82, dbp: 50, gcs: 13 } };
  it('a case stand-in for a drug contraindication charges again for a second drug; one that charges once a case passes the dose on', () => {
    const caseRule: Harm = {
      id: 'case-antiarrhythmic', actions: ['amio-infusion', 'procainamide'], points: 8, severity: 'major',
      replaces: [...RATE_RULES, 'procainamide-hypotension'], text: 'The case\'s words.',
    };
    // procainamide at 82 after amiodarone: the case rule stands in for procainamide-hypotension, a drug contraindication, so it
    // charges once for each drug (rules/charge.ts) — the procainamide is its own mistake, in the case's words, and the
    // second antiarrhythmic ranked below is silent (one dose, one penalty)
    expect(pen(field({ ...VT_LOW, harms: [caseRule] }), ['iv', 'amio-infusion', 'procainamide'])).toEqual(['case-antiarrhythmic', 'case-antiarrhythmic']);
    // a minor stand-in charges once a case: charged on the amiodarone, it passes the procainamide on to the next rule down
    // (procainamide-hypotension, which it stands in for, is passed over, and stacking a second antiarrhythmic is charged)
    const minorRule: Harm = { ...caseRule, points: 3, severity: 'minor' };
    expect(pen(field({ ...VT_LOW, harms: [minorRule] }), ['iv', 'amio-infusion', 'procainamide'])).toEqual(['case-antiarrhythmic', 'procainamide-after-amiodarone']);
    // without the case: each drug its own pressure rule
    expect(pen(field(VT_LOW), ['iv', 'amio-infusion', 'procainamide'])).toEqual(['amiodarone-hypotension', 'procainamide-hypotension']);
  });

  it('a repeat of a mistake charged already — the built-in rule or the case\'s rule with its id — is not charged again; a second drug is', () => {
    const own: Harm = { id: 'av-blocker-preexcited-af', actions: ['diltiazem', 'metoprolol'], points: 15, severity: 'critical', text: 'The case\'s words.' };
    const patient = (harms: Harm[]) => field({ rhythm: PREEXCITED, vitals: { sbp: 84, dbp: 50 }, harms });
    // the same drug again is not charged again, the built-in's or the case's
    expect(pen(patient([]), ['iv', 'adenosine12', 'adenosine12'])).toEqual(['av-blocker-preexcited-af']);
    expect(pen(patient([{ ...own, actions: ['adenosine6', 'adenosine12'] }]), ['iv', 'adenosine6', 'adenosine12'])).toEqual(['av-blocker-preexcited-af']);
    // a second, different drug into the same contraindication is a mistake of its own (each label rules its drug out:
    // rules/charge.ts) — for the built-in, and for the case's own rule with its id that stands in for it
    expect(pen(patient([]), ['iv', 'diltiazem', 'metoprolol'])).toEqual(['av-blocker-preexcited-af', 'av-blocker-preexcited-af']);
    expect(pen(patient([own]), ['iv', 'diltiazem', 'metoprolol'])).toEqual(['av-blocker-preexcited-af', 'av-blocker-preexcited-af']);
  });

  it('the second antiarrhythmic beside a case rule on the same dose: one penalty, the heavier — the case\'s words on a tie', () => {
    const stable = { rhythm: VT, vitals: { sbp: 118, dbp: 74 } };
    const own = (points: number, severity: Harm['severity']): Harm => ({ id: 'case-procainamide', actions: ['procainamide'], points, severity, text: 'The case\'s words.' });
    // the stacking rule (5, minor) outweighs a minor 3-point case rule…
    expect(pen(field({ ...stable, harms: [own(3, 'minor')] }), ['iv', 'amio-infusion', 'procainamide'])).toEqual(['procainamide-after-amiodarone']);
    // …a major case rule outweighs it, and a tie keeps the case's words
    expect(pen(field({ ...stable, harms: [own(8, 'major')] }), ['iv', 'amio-infusion', 'procainamide'])).toEqual(['case-procainamide']);
    expect(pen(field({ ...stable, harms: [own(5, 'minor')] }), ['iv', 'amio-infusion', 'procainamide'])).toEqual(['case-procainamide']);
    // with no case rule on the dose the stacking rule charges, as before
    expect(pen(field(stable), ['iv', 'amio-infusion', 'procainamide'])).toEqual(['procainamide-after-amiodarone']);
  });

  it('a case that narrows a rule under its id and says the rest in another rule: the dose is the case\'s alone', () => {
    const narrowed: Harm = { id: 'procainamide-hypotension', actions: ['procainamide'], when: () => false, points: 8, severity: 'major', text: 'Not here.' };
    const rest: Harm = { id: 'case-unstable', actions: ['procainamide'], points: 8, severity: 'major', text: 'The case\'s words.' };
    expect(pen(field({ ...VT_LOW, harms: [narrowed, rest] }), ['iv', 'amio-infusion', 'procainamide'])).toEqual(['amiodarone-hypotension', 'case-unstable']);
  });
});

describe('a minor case rule never speaks for a major contraindication (yieldToHeavier)', () => {
  const askLike: Harm = { id: 'case-wrong-drug', actions: ['adenosine6', 'diltiazem'], points: 5, severity: 'minor', replaces: RATE_RULES, text: 'The wrong drug for the order.' };
  const slow = { rhythm: { profile: 'sinus-bradycardia', hr: 38 }, vitals: { sbp: 68, dbp: 40 } };

  it('with a heavier, major rule on top it steps aside, and that rule charges alone; otherwise the case speaks', () => {
    const [yielding] = yieldToHeavier([askLike]);
    expect(yieldsToHeavier(yielding)).toBe(true);
    for (const drug of ['adenosine6', 'diltiazem']) {
      expect(pen(field({ ...slow, harms: [yielding] }), ['iv', drug]), drug).toEqual(['nodal-blocker-slow']);
      // as the rule was written, the minor wrong answer spoke for the contraindication
      expect(pen(field({ ...slow, harms: [askLike] }), ['iv', drug]), drug).toEqual(['case-wrong-drug']);
    }
    // at a normal rate and pressure the indication rule on top is minor: the case's words
    expect(pen(field({ harms: [yielding] }), ['iv', 'adenosine6'])).toEqual(['case-wrong-drug']);
  });

  it('it steps aside only for a rule that would charge: once that rule, or another case rule standing in for it, was charged, the case speaks', () => {
    const [yielding] = yieldToHeavier([askLike]);
    // the same drug again: the label rule was charged on it, so the case's words speak
    const [repeatable] = yieldToHeavier([{ ...askLike, actions: [...askLike.actions, 'adenosine12'] }]);
    expect(pen(field({ ...slow, harms: [repeatable] }), ['iv', 'adenosine12', 'adenosine12'])).toEqual(['nodal-blocker-slow', 'case-wrong-drug']);
    // a second drug into the slow rate is the label rule's again (it charges once for each drug)
    expect(pen(field({ ...slow, harms: [yielding] }), ['iv', 'adenosine6', 'diltiazem'])).toEqual(['nodal-blocker-slow', 'nodal-blocker-slow']);
    // a major stand-in charges once for each drug (rules/charge.ts): the second drug is its own again, and the minor rule
    // steps aside; the same drug again it does not charge, so the minor rule speaks
    const standInRule: Harm = { id: 'case-unstable', actions: ['adenosine6', 'adenosine12', 'diltiazem'], points: 8, severity: 'major', replaces: RATE_RULES, text: 'The case\'s words.' };
    const [standIn, wrong] = yieldToHeavier([standInRule, { ...askLike, actions: [...askLike.actions, 'adenosine12'] }]);
    expect(pen(field({ ...slow, harms: [standIn, wrong] }), ['iv', 'adenosine6', 'diltiazem'])).toEqual(['case-unstable', 'case-unstable']);
    expect(pen(field({ ...slow, harms: [standIn, wrong] }), ['iv', 'adenosine6', 'adenosine12'])).toEqual(['case-unstable', 'case-wrong-drug']);
  });

  it('a major case rule, or the case\'s rule with the top rule\'s own id, keeps the dose in its own words', () => {
    const [major] = yieldToHeavier([{ ...askLike, severity: 'major' }]);
    expect(pen(field({ ...slow, harms: [major] }), ['iv', 'adenosine6'])).toEqual(['case-wrong-drug']);
    const [own, wrong] = yieldToHeavier([{ ...exempt('nodal-blocker-slow', ['adenosine6']), when: () => true, points: 3 }, askLike]);
    expect(pen(field({ ...slow, harms: [own, wrong] }), ['iv', 'adenosine6'])).toEqual(['nodal-blocker-slow', 'case-wrong-drug']);
  });

  it('every case rule that stands in for rules of rhythm.ts goes through yieldToHeavier', () => {
    const ids = new Set(RHYTHM_RULES.map((r) => r.id));
    for (const sc of SCENARIOS) {
      for (const h of sc.harms) if (h.replaces?.some((id) => ids.has(id))) expect(yieldsToHeavier(h), `${sc.id}: ${h.id}`).toBe(true);
    }
  });
});

describe('nodal-blocker-slow', () => {
  it('fires for an AV-nodal drug or amiodarone with AV block or a rate under 50', () => {
    for (const drug of ['metoprolol', 'diltiazem', 'adenosine6', 'adenosine12', 'amio-infusion']) {
      expect(pen(field({ rhythm: CHB, vitals: { sbp: 110 } }), ['iv', drug]), drug).toEqual(['nodal-blocker-slow']);
    }
    expect(pen(field({ rhythm: SLOW_SINUS }), ['iv', 'metoprolol'])).toEqual(['nodal-blocker-slow']);
    // and the cath lab's intracoronary drugs and the radial cocktail
    for (const drug of ['ic-adenosine', 'ic-verapamil']) expect(pen(lab({ rhythm: CHB, vitals: { sbp: 110 } }), [drug]), drug).toEqual(['nodal-blocker-slow']);
    expect(pen(lab({ rhythm: CHB, vitals: { sbp: 110 } }), ['consent', 'access', 'radial-cocktail'])).toEqual(['nodal-blocker-slow']);
  });

  it('does not fire at a rate of 50 or more, or over a pacer', () => {
    expect(pen(field({ rhythm: { profile: 'sinus-bradycardia', hr: 54 } }), ['iv', 'metoprolol'])).toEqual([]);
    expect(pen(field({ rhythm: { profile: 'tcp', hr: 70 } }), ['iv', 'metoprolol'])).toEqual([]);
  });

  it('a case rule with its id replaces it', () => {
    expect(pen(field({ rhythm: CHB, harms: [exempt('nodal-blocker-slow', ['metoprolol'])] }), ['iv', 'metoprolol'])).toEqual([]);
  });

  it('one penalty: a slow rate and a low pressure together are the slow rate\'s', () => {
    expect(pen(field({ rhythm: { profile: 'sinus-bradycardia', hr: 40 }, vitals: { sbp: 80, dbp: 50 } }), ['iv', 'metoprolol'])).toEqual(['nodal-blocker-slow']);
    expect(pen(lab({ rhythm: CHB, vitals: { sbp: 80, dbp: 50 } }), ['ic-verapamil'])).toEqual(['nodal-blocker-slow']);
  });
});

describe('lidocaine-slow-or-block', () => {
  it('fires with heart block or a rate under 50', () => {
    expect(pen(field({ rhythm: CHB }), ['iv', 'lidocaine'])).toEqual(['lidocaine-slow-or-block']);
    expect(pen(field({ rhythm: SLOW_SINUS }), ['iv', 'lidocaine'])).toEqual(['lidocaine-slow-or-block']);
  });

  it('does not fire for VT, nor over a pacer (where only the indication rule is left)', () => {
    expect(pen(field({ rhythm: VT, vitals: { sbp: 110 } }), ['iv', 'lidocaine'])).toEqual([]);
    expect(pen(field({ rhythm: { profile: 'tcp', hr: 70 } }), ['iv', 'lidocaine'])).toEqual(['lidocaine-no-arrhythmia']);
  });

  it('a case rule with its id replaces it (the gate then passes the dose on: lidocaine in heart block still treats nothing)', () => {
    expect(pen(field({ rhythm: CHB, harms: [exempt('lidocaine-slow-or-block', ['lidocaine'])] }), ['iv', 'lidocaine'])).toEqual(['lidocaine-no-arrhythmia']);
    expect(pen(field({ rhythm: CHB, harms: [exempt('lidocaine-slow-or-block', ['lidocaine']), exempt('lidocaine-no-arrhythmia', ['lidocaine'])] }), ['iv', 'lidocaine'])).toEqual([]);
  });

  it('one penalty: heart block with a high potassium is the block\'s', () => {
    expect(pen(field({ rhythm: CHB, problems: ['hyperkalemia'] }), ['iv', 'lidocaine'])).toEqual(['lidocaine-slow-or-block']);
  });
});

describe('nodal-blocker-hypotension', () => {
  const low = { rhythm: AF, vitals: { sbp: 84, dbp: 50 } };
  it('fires for a beta-blocker or diltiazem with a systolic under 90', () => {
    for (const drug of ['metoprolol', 'diltiazem']) expect(pen(field(low), ['iv', drug]), drug).toEqual(['nodal-blocker-hypotension']);
  });

  it('does not fire at 90 or more', () => {
    for (const drug of ['metoprolol', 'diltiazem']) expect(pen(field({ rhythm: AF, vitals: { sbp: 104, dbp: 64 } }), ['iv', drug]), drug).toEqual([]);
  });

  it('a case rule with its id replaces it', () => {
    expect(pen(field({ ...low, harms: [exempt('nodal-blocker-hypotension', ['diltiazem'])] }), ['iv', 'diltiazem'])).toEqual([]);
  });

  it('one penalty: in stimulant toxicity the beta-blocker rule speaks for it', () => {
    expect(pen(field({ ...low, problems: ['sympathomimetic-toxicity'] }), ['iv', 'metoprolol'])).toEqual(['beta-blocker-stimulant']);
  });
});

describe('amiodarone-hypotension', () => {
  const low = { rhythm: VT, vitals: { sbp: 82, dbp: 50, gcs: 13 } };
  it('fires for an amiodarone infusion with a systolic under 90', () => {
    expect(pen(field(low), ['iv', 'amio-infusion'])).toEqual(['amiodarone-hypotension']);
  });

  it('does not fire at 90 or more, nor after a shock that did not hold', () => {
    expect(pen(field({ rhythm: VT, vitals: { sbp: 100, dbp: 60 } }), ['iv', 'amio-infusion'])).toEqual([]);
    expect(pen(field(low), ['iv', 'pads', 'cardiovert', 'amio-infusion'])).toEqual([]);
  });

  it('a case rule with its id replaces it', () => {
    expect(pen(field({ ...low, harms: [exempt('amiodarone-hypotension', ['amio-infusion'])] }), ['iv', 'amio-infusion'])).toEqual([]);
  });

  it('one penalty: with heart block the slow rate speaks for it', () => {
    expect(pen(field({ rhythm: CHB, vitals: { sbp: 80, dbp: 50 } }), ['iv', 'amio-infusion'])).toEqual(['nodal-blocker-slow']);
  });
});

describe('adenosine-wide-unstable', () => {
  it('fires for adenosine in an unstable VT or in torsades', () => {
    expect(pen(field({ rhythm: VT, vitals: { sbp: 80, dbp: 50 } }), ['iv', 'adenosine6'])).toEqual(['adenosine-wide-unstable']);
    expect(pen(field({ rhythm: TORSADES, vitals: { sbp: 110 } }), ['iv', 'adenosine12'])).toEqual(['adenosine-wide-unstable']);
  });

  it('does not fire in a stable monomorphic VT (a diagnostic try may be considered)', () => {
    expect(pen(field({ rhythm: VT, vitals: { sbp: 120 } }), ['iv', 'adenosine6'])).toEqual([]);
  });

  it('a case rule with its id replaces it', () => {
    expect(pen(field({ rhythm: TORSADES, harms: [exempt('adenosine-wide-unstable', ['adenosine6'])] }), ['iv', 'adenosine6'])).toEqual([]);
  });

  it('one penalty: pre-excited AF outranks it', () => {
    expect(pen(field({ rhythm: PREEXCITED, vitals: { sbp: 80, dbp: 50 } }), ['iv', 'adenosine6'])).toEqual(['av-blocker-preexcited-af']);
  });
});

describe('rate-drug-in-arrest', () => {
  it('fires for a tachycardia drug in cardiac arrest', () => {
    for (const drug of ['adenosine6', 'metoprolol', 'diltiazem', 'amio-infusion']) {
      expect(pen(field({ rhythm: VF, pulse: false }), ['io', drug]), drug).toEqual(['rate-drug-in-arrest']);
    }
  });

  it('does not fire with a pulse and a tachycardia to treat', () => {
    expect(pen(field({ rhythm: AF }), ['iv', 'diltiazem'])).toEqual([]);
  });

  it('a case rule with its id replaces it', () => {
    expect(pen(field({ rhythm: VF, pulse: false, harms: [exempt('rate-drug-in-arrest', ['diltiazem'])] }), ['io', 'diltiazem'])).toEqual([]);
  });

  it('one penalty: it outranks the high potassium for the amiodarone infusion', () => {
    expect(pen(field({ rhythm: VF, pulse: false, problems: ['hyperkalemia'] }), ['io', 'amio-infusion'])).toEqual(['rate-drug-in-arrest']);
  });

  it('the ER nurse without an order: the missing order speaks for it (one act, one penalty); with the order it is hers', () => {
    expect(pen(edRn({ rhythm: VF, pulse: false }), ['io', 'amio-infusion'])).toEqual(['rn-without-order-amio-infusion']);
    expect(pen(edRn({ rhythm: VF, pulse: false, extra: ordered('amio-infusion') }), ['io', 'amio-infusion'])).toEqual(['rate-drug-in-arrest']);
    expect(pen(edMd({ rhythm: VF, pulse: false }), ['io', 'amio-infusion'])).toEqual(['rate-drug-in-arrest']);
    // her second unordered dose: the missing order is charged already, so the drug's own mistake is
    expect(pen(edRn({ rhythm: VF, pulse: false }), ['io', 'adenosine12', 'adenosine12'])).toEqual(['rn-without-order-adenosine12', 'rate-drug-in-arrest']);
  });

  it('the FFR adenosine infusion in an arrest is a rate drug in arrest too', () => {
    expect(pen(lab({ rhythm: VF, pulse: false, extra: flagged('wired') }), ['iv', 'adenosine-iv-ffr'])).toEqual(['rate-drug-in-arrest']);
    expect(pen(lab({ rhythm: VF, pulse: false }), ['iv', 'adenosine-iv-ffr'])).toEqual(['rate-drug-in-arrest']);
  });
});

describe('antiarrhythmic-nonshockable', () => {
  it('fires for amiodarone 300 mg or lidocaine in PEA or asystole', () => {
    for (const drug of ['amio-arrest', 'lidocaine']) expect(pen(field({ rhythm: PEA, pulse: false }), ['io', drug]), drug).toEqual(['antiarrhythmic-nonshockable']);
    expect(pen(field({ rhythm: { profile: 'asystole', hr: 0 }, pulse: false }), ['io', 'amio-arrest'])).toEqual(['antiarrhythmic-nonshockable']);
  });

  it('does not fire in VF', () => {
    for (const drug of ['amio-arrest', 'lidocaine']) expect(pen(field({ rhythm: VF, pulse: false }), ['io', drug]), drug).toEqual([]);
  });

  it('a case rule with its id replaces it', () => {
    expect(pen(field({ rhythm: PEA, pulse: false, harms: [exempt('antiarrhythmic-nonshockable', ['amio-arrest'])] }), ['io', 'amio-arrest'])).toEqual([]);
  });

  it('one penalty: a high potassium outranks it', () => {
    expect(pen(field({ rhythm: PEA, pulse: false, problems: ['hyperkalemia'] }), ['io', 'amio-arrest'])).toEqual(['antiarrhythmic-hyperkalemia']);
  });

  it('not in the CPR cycle right after a shock to VF: the rhythm under the compressions is not known until the check', () => {
    // the shock organizes the rhythm, with no pulse yet
    const organized: Partial<Scenario> = { events: [{ id: 'organized', when: (s) => has(s, 'shocked'), effect: () => ({ rhythm: { profile: 'normal-sinus', hr: 96 } }) }] };
    for (const drug of ['amio-arrest', 'lidocaine']) {
      expect(pen(field({ rhythm: VF, pulse: false, extra: organized }), ['io', 'defib', drug]), drug).toEqual([]);
      // a pulse check shows the rhythm, and two minutes of CPR end the cycle
      expect(pen(field({ rhythm: VF, pulse: false, extra: organized }), ['io', 'defib', 'pulse-check', drug]), drug).toEqual(['antiarrhythmic-nonshockable']);
      expect(pen(field({ rhythm: VF, pulse: false, extra: organized }), ['io', 'defib', 'cpr', drug]), drug).toEqual(['antiarrhythmic-nonshockable']);
    }
  });
});

describe('lidocaine-no-arrhythmia', () => {
  it('fires for lidocaine with a pulse and no ventricular arrhythmia — pre-excited AF too (its label rules out WPW)', () => {
    expect(pen(field(), ['iv', 'lidocaine'])).toEqual(['lidocaine-no-arrhythmia']);
    expect(pen(field({ rhythm: PREEXCITED, vitals: { sbp: 110 } }), ['iv', 'lidocaine'])).toEqual(['lidocaine-no-arrhythmia']);
  });

  it('does not fire for VT or torsades, or after ROSC (it may be considered then)', () => {
    expect(pen(field({ rhythm: VT, vitals: { sbp: 110 } }), ['iv', 'lidocaine'])).toEqual([]);
    expect(pen(field({ extra: flagged('rosc') }), ['iv', 'lidocaine'])).toEqual([]);
  });

  it('a case rule with its id replaces it', () => {
    expect(pen(field({ harms: [exempt('lidocaine-no-arrhythmia', ['lidocaine'])] }), ['iv', 'lidocaine'])).toEqual([]);
  });

  it('one penalty: heart block outranks it; and the ER nurse\'s missing order covers it', () => {
    expect(pen(field({ rhythm: CHB }), ['iv', 'lidocaine'])).toEqual(['lidocaine-slow-or-block']);
    expect(pen(edRn(), ['iv', 'lidocaine'])).toEqual(['rn-without-order-lidocaine']);
    expect(pen(edMd(), ['iv', 'lidocaine'])).toEqual(['lidocaine-no-arrhythmia']);
  });
});

describe('antiarrhythmic-no-arrhythmia', () => {
  it('fires for adenosine, diltiazem, an amiodarone infusion or procainamide with no tachyarrhythmia', () => {
    for (const drug of ['adenosine6', 'diltiazem', 'amio-infusion', 'procainamide']) expect(pen(field(), ['iv', drug]), drug).toEqual(['antiarrhythmic-no-arrhythmia']);
    expect(pen(field({ rhythm: { profile: 'sinus-tachycardia', hr: 120 } }), ['iv', 'adenosine6'])).toEqual(['antiarrhythmic-no-arrhythmia']);
  });

  it('does not fire for a tachyarrhythmia, VT, an amiodarone infusion after ROSC, or diltiazem in a dissection', () => {
    expect(pen(field({ rhythm: SVT, vitals: { sbp: 110 } }), ['iv', 'adenosine6'])).toEqual([]);
    expect(pen(field({ rhythm: AF }), ['iv', 'diltiazem'])).toEqual([]);
    expect(pen(field({ rhythm: VT, vitals: { sbp: 110 } }), ['iv', 'procainamide'])).toEqual([]);
    expect(pen(field({ extra: flagged('rosc') }), ['iv', 'amio-infusion'])).toEqual([]);
    expect(pen(field({ problems: ['aortic-dissection'] }), ['iv', 'diltiazem'])).toEqual([]);
    // an amiodarone infusion to hold the rhythm a cardioversion restored is fair; adenosine then still treats nothing
    expect(pen(field({ extra: flagged('cardioverted') }), ['iv', 'amio-infusion'])).toEqual([]);
    expect(pen(field({ extra: flagged('cardioverted') }), ['iv', 'adenosine6'])).toEqual(['antiarrhythmic-no-arrhythmia']);
  });

  it('a case rule with its id replaces it', () => {
    expect(pen(field({ harms: [exempt('antiarrhythmic-no-arrhythmia', ['adenosine6'])] }), ['iv', 'adenosine6'])).toEqual([]);
  });

  it('one penalty: a failing heart outranks it for procainamide', () => {
    expect(pen(field({ problems: ['heart-failure'] }), ['iv', 'procainamide'])).toEqual(['procainamide-heart-failure']);
  });

  it('procainamide-lupus: its label rules it out with systemic lupus — one penalty, under the pressure and the failing heart', () => {
    expect(pen(field({ rhythm: VT, problems: ['lupus'] }), ['iv', 'procainamide'])).toEqual(['procainamide-lupus']);
    expect(pen(field({ rhythm: VT, vitals: { sbp: 82, dbp: 50 }, problems: ['lupus'] }), ['iv', 'procainamide'])).toEqual(['procainamide-hypotension']);
    expect(pen(field({ rhythm: VT }), ['iv', 'procainamide'])).toEqual([]);
  });

  it('the ER nurse without an order: the missing order covers the indication (INDICATION_RULES); the doctor gets it', () => {
    expect(INDICATION_RULES).toContain('antiarrhythmic-no-arrhythmia');
    for (const drug of ['adenosine6', 'diltiazem', 'amio-infusion', 'procainamide']) {
      expect(pen(edRn(), ['iv', drug]), drug).toEqual([`rn-without-order-${drug}`]);
      expect(pen(edMd(), ['iv', drug]), drug).toEqual(['antiarrhythmic-no-arrhythmia']);
    }
    // ordered, it is hers
    expect(pen(edRn({ extra: ordered('adenosine6') }), ['iv', 'adenosine6'])).toEqual(['antiarrhythmic-no-arrhythmia']);
  });
});

describe('vagal-slow', () => {
  it('fires for a vagal maneuver with a rate under 60 or AV block', () => {
    expect(pen(field({ rhythm: { profile: 'sinus-bradycardia', hr: 54 } }), ['vagal'])).toEqual(['vagal-slow']);
    expect(pen(field({ rhythm: { profile: 'mobitz-ii', hr: 64 } }), ['vagal'])).toEqual(['vagal-slow']);
  });

  it('does not fire for a regular narrow-complex tachycardia, or over a pacer', () => {
    expect(pen(field({ rhythm: SVT, vitals: { sbp: 110 } }), ['vagal'])).toEqual([]);
    // over a pacer the rate is the pacer's: not slow — though a vagal maneuver has nothing to treat there either
    expect(pen(field({ rhythm: { profile: 'tcp', hr: 70 } }), ['vagal'])).toEqual(['vagal-no-indication']);
    expect(pen(field({ rhythm: { profile: 'tcp', hr: 40 } }), ['vagal'])).toEqual(['vagal-no-indication']);
  });

  it('a case rule with its id replaces it', () => {
    expect(pen(field({ rhythm: SLOW_SINUS, harms: [exempt('vagal-slow', ['vagal'])] }), ['vagal'])).toEqual([]);
  });
});

describe('no-sedation', () => {
  it('fires for cardioverting an awake patient with nothing for it', () => {
    expect(pen(field({ rhythm: AF, vitals: { sbp: 110 } }), ['pads', 'cardiovert'])).toEqual(['no-sedation']);
  });

  it('does not fire after sedation or analgesia, or in a patient no longer awake', () => {
    expect(pen(field({ rhythm: AF, vitals: { sbp: 110 } }), ['iv', 'midazolam', 'pads', 'cardiovert'])).toEqual([]);
    expect(pen(field({ rhythm: AF, vitals: { sbp: 110 } }), ['iv', 'pads', 'fentanyl', 'cardiovert'])).toEqual([]);
    expect(pen(field({ rhythm: AF, vitals: { sbp: 110, gcs: 12 } }), ['pads', 'cardiovert'])).toEqual([]);
  });

  it('the analgesia counts for the shock once the pads are on: before them a stable tachycardia is no procedure (rules/acs.ts)', () => {
    // fentanyl with no pain, for a stable AF with the pads still off, is judged by the opioid gate (opioid-no-pain), and once
    // given it still covers the cardioversion: one penalty for the order, none for the shock
    expect(pen(field({ rhythm: AF, vitals: { sbp: 110 } }), ['iv', 'fentanyl', 'pads', 'cardiovert'])).toEqual(['opioid-no-pain']);
  });

  it('a case rule with its id replaces it', () => {
    expect(pen(field({ rhythm: AF, harms: [exempt('no-sedation', ['cardiovert'])] }), ['pads', 'cardiovert'])).toEqual([]);
  });

  it('one penalty: an unanticoagulated AF of 48 hours or more outranks it', () => {
    expect(pen(field({ rhythm: AF, vitals: { sbp: 110 }, problems: ['af-over-48h'] }), ['pads', 'cardiovert'])).toEqual(['cardioversion-unanticoagulated']);
  });
});

describe('pace-no-analgesia', () => {
  const awake = { rhythm: { profile: 'sinus-bradycardia', hr: 40 }, vitals: { sbp: 104, dbp: 64 } };
  it('fires for pacing an awake patient whose pressure allows analgesia, with none given', () => {
    expect(pen(field(awake), ['pads', 'pace'])).toEqual(['pace-no-analgesia']);
  });

  it('does not fire after analgesia, nor for a patient who is crashing (a low pressure)', () => {
    expect(pen(field(awake), ['iv', 'pads', 'fentanyl', 'pace'])).toEqual([]);
    expect(pen(field({ ...awake, vitals: { sbp: 78, dbp: 48 } }), ['pads', 'pace'])).toEqual([]);
  });

  it('a case rule with its id replaces it', () => {
    expect(pen(field({ ...awake, harms: [exempt('pace-no-analgesia', ['pace'])] }), ['pads', 'pace'])).toEqual([]);
  });

  it('a pressure held up only by a push-dose pressor is a crashing patient\'s: paced at once (rules/support.ts pressorBridging)', () => {
    const low = { ...awake, vitals: { sbp: 78, dbp: 48 } };
    // the push lifts the pressure over 90 for now: the pacer is the next step, not analgesia
    const pushed = ['iv', 'push-epi', 'pads'];
    expect(runScenario(field(low), 2, pushed).vitals.sbp).toBeGreaterThanOrEqual(90);
    expect(pen(field(low), [...pushed, 'pace'])).toEqual([]);
    // more than 10 minutes on, the pressure is his own again: analgesia first
    expect(pen(field(low), [...pushed, ...Array(6).fill('reassess'), 'pace'])).toEqual(['pace-no-analgesia']);
  });

  it('fentanyl before the pads, with no pain, is the opioid gate\'s (rules/acs.ts): one penalty, and the pacing is then covered', () => {
    expect(pen(field(awake), ['iv', 'fentanyl', 'pads', 'pace'])).toEqual(['opioid-no-pain']);
  });
});

describe('magnesium-no-indication', () => {
  it('fires for magnesium with a pulse and no torsades, long QT or low magnesium — in heart block too', () => {
    expect(pen(field(), ['iv', 'magnesium-sulfate'])).toEqual(['magnesium-no-indication']);
    expect(pen(field({ rhythm: CHB, vitals: { sbp: 110 } }), ['iv', 'magnesium-sulfate'])).toEqual(['magnesium-no-indication']);
    expect(rule('magnesium-no-indication').text).toMatch(/heart block/);
  });

  it('does not fire for a long QT, a low magnesium, atrial fibrillation, a severe asthma or bronchospasm, or digoxin toxicity', () => {
    expect(pen(field({ rhythm: { profile: 'long-qt', hr: 58 } }), ['iv', 'magnesium-sulfate'])).toEqual([]);
    expect(pen(field({ problems: ['hypomagnesemia'] }), ['iv', 'magnesium-sulfate'])).toEqual([]);
    expect(pen(field({ rhythm: AF }), ['iv', 'magnesium-sulfate'])).toEqual([]);
    for (const problem of ['asthma', 'bronchospasm', 'digoxin-toxicity'] as Problem[]) {
      expect(pen(field({ problems: [problem], rhythm: { profile: 'sinus-tachycardia', hr: 124 }, vitals: { spo2: 88 } }), ['iv', 'magnesium-sulfate']), problem).toEqual([]);
    }
  });

  it('a case rule with its id replaces it', () => {
    expect(pen(field({ harms: [exempt('magnesium-no-indication', ['magnesium-sulfate'])] }), ['iv', 'magnesium-sulfate'])).toEqual([]);
  });

  it('one penalty: failing kidneys outrank it; and the ER nurse\'s missing order covers it', () => {
    expect(pen(field({ problems: ['renal-failure'] }), ['iv', 'magnesium-sulfate'])).toEqual(['magnesium-renal-failure']);
    expect(pen(edRn(), ['iv', 'magnesium-sulfate'])).toEqual(['rn-without-order-magnesium-sulfate']);
  });
});

describe('magnesium-renal-failure', () => {
  it('fires for magnesium with failing kidneys or on dialysis and nothing it is needed for — atrial fibrillation too', () => {
    expect(pen(field({ problems: ['renal-failure'] }), ['iv', 'magnesium-sulfate'])).toEqual(['magnesium-renal-failure']);
    expect(pen(field({ problems: ['dialysis'] }), ['iv', 'magnesium-sulfate'])).toEqual(['magnesium-renal-failure']);
    expect(pen(field({ problems: ['dialysis'], rhythm: AF }), ['iv', 'magnesium-sulfate'])).toEqual(['magnesium-renal-failure']);
  });

  it('does not fire with working kidneys, nor for magnesium that is needed (torsades, a long QT, a low magnesium) — a reduced dose', () => {
    expect(pen(field({ rhythm: { profile: 'long-qt', hr: 58 } }), ['iv', 'magnesium-sulfate'])).toEqual([]);
    expect(pen(field({ problems: ['renal-failure'], rhythm: { profile: 'long-qt', hr: 58 } }), ['iv', 'magnesium-sulfate'])).toEqual([]);
    expect(pen(field({ problems: ['dialysis'], rhythm: TORSADES, vitals: { sbp: 104 } }), ['iv', 'magnesium-sulfate'])).toEqual([]);
    expect(pen(field({ problems: ['renal-failure'], rhythm: TORSADES, pulse: false }), ['io', 'magnesium-sulfate'])).toEqual([]);
    expect(pen(field({ problems: ['dialysis', 'hypomagnesemia'] }), ['iv', 'magnesium-sulfate'])).toEqual([]);
    expect(rule('magnesium-renal-failure').text).toMatch(/still given, at a reduced dose/);
  });

  it('a case rule with its id replaces it', () => {
    expect(pen(field({ problems: ['dialysis'], rhythm: AF, harms: [exempt('magnesium-renal-failure', ['magnesium-sulfate'])] }), ['iv', 'magnesium-sulfate'])).toEqual([]);
  });

  it('one penalty: routine magnesium in an arrest outranks it', () => {
    expect(pen(field({ problems: ['dialysis'], rhythm: PEA, pulse: false }), ['io', 'magnesium-sulfate'])).toEqual(['magnesium-routine-arrest']);
  });
});

describe('iv-beta-blocker-with-diltiazem', () => {
  const fast = { rhythm: AF, vitals: { sbp: 128 } };
  it('fires for the second of IV diltiazem and an IV beta-blocker, either way round', () => {
    expect(pen(field(fast), ['iv', 'metoprolol', 'diltiazem'])).toEqual(['iv-beta-blocker-with-diltiazem']);
    expect(pen(field(fast), ['iv', 'diltiazem', 'metoprolol'])).toEqual(['iv-beta-blocker-with-diltiazem']);
  });

  it('does not fire for one of them alone', () => {
    expect(pen(field(fast), ['iv', 'diltiazem'])).toEqual([]);
  });

  it('a case rule with its id replaces it', () => {
    expect(pen(field({ ...fast, harms: [exempt('iv-beta-blocker-with-diltiazem', ['diltiazem'])] }), ['iv', 'metoprolol', 'diltiazem'])).toEqual([]);
  });

  it('one penalty: the pressure the first drug took away outranks it; pre-excited AF outranks both', () => {
    expect(pen(field({ rhythm: AF, vitals: { sbp: 96, dbp: 60 } }), ['iv', 'metoprolol', 'diltiazem'])).toEqual(['nodal-blocker-hypotension']);
    // pre-excited AF outranks the combination on the diltiazem dose too (each drug into it is charged: rules/charge.ts)
    expect(pen(field({ rhythm: PREEXCITED, vitals: { sbp: 120 } }), ['iv', 'metoprolol', 'diltiazem'])).toEqual(['av-blocker-preexcited-af', 'av-blocker-preexcited-af']);
  });
});

describe('beta-blocker-pulmonary-edema (and diltiazem-heart-failure, widened)', () => {
  it('fires for a beta-blocker with fluid on the lungs; diltiazem there is the diltiazem rule\'s', () => {
    expect(pen(field({ rhythm: AF, problems: ['pulmonary-edema'] }), ['iv', 'metoprolol'])).toEqual(['beta-blocker-pulmonary-edema']);
    expect(pen(field({ rhythm: AF, problems: ['pulmonary-edema'] }), ['iv', 'diltiazem'])).toEqual(['diltiazem-heart-failure']);
    expect(rule('diltiazem-heart-failure').text).toMatch(/acute pulmonary edema/);
  });

  it('does not fire with dry lungs', () => {
    expect(pen(field({ rhythm: AF }), ['iv', 'metoprolol'])).toEqual([]);
  });

  it('a case rule with its id replaces it', () => {
    expect(pen(field({ rhythm: AF, problems: ['pulmonary-edema'], harms: [exempt('beta-blocker-pulmonary-edema', ['metoprolol'])] }), ['iv', 'metoprolol'])).toEqual([]);
  });

  it('one penalty: a low pressure outranks it', () => {
    expect(pen(field({ rhythm: AF, vitals: { sbp: 84, dbp: 50 }, problems: ['pulmonary-edema'] }), ['iv', 'metoprolol'])).toEqual(['nodal-blocker-hypotension']);
  });
});

describe('beta-blocker-mi-shock-risk', () => {
  it('fires for an IV beta-blocker in an MI with a systolic under 100 or a rate over 110', () => {
    expect(pen(field({ problems: ['acs'], vitals: { sbp: 96, dbp: 60 } }), ['iv', 'metoprolol'])).toEqual(['beta-blocker-mi-shock-risk']);
    expect(pen(field({ problems: ['acs'], rhythm: { profile: 'sinus-tachycardia', hr: 116 } }), ['iv', 'metoprolol'])).toEqual(['beta-blocker-mi-shock-risk']);
  });

  it('fires for a PR interval of 0.24 s or more in an MI (the metoprolol label)', () => {
    expect(pen(field({ problems: ['acs'], rhythm: { profile: 'first-degree-avb', hr: 68 }, vitals: { sbp: 140 } }), ['iv', 'metoprolol'])).toEqual(['beta-blocker-mi-shock-risk']);
    expect(rule('beta-blocker-mi-shock-risk').text).toMatch(/PR interval of 0\.24 s or more/);
  });

  it('does not fire for a stable MI, nor outside an MI, nor for a fast AF in an ACS (an IV beta-blocker is its rate drug)', () => {
    expect(pen(field({ problems: ['acs'] }), ['iv', 'metoprolol'])).toEqual([]);
    expect(pen(field({ vitals: { sbp: 96, dbp: 60 } }), ['iv', 'metoprolol'])).toEqual([]);
    expect(pen(field({ problems: ['acs'], rhythm: { profile: 'atrial-fibrillation', hr: 140 }, vitals: { sbp: 138 } }), ['iv', 'metoprolol'])).toEqual([]);
  });

  it('a case rule with its id replaces it', () => {
    expect(pen(field({ problems: ['acs'], vitals: { sbp: 96, dbp: 60 }, harms: [exempt('beta-blocker-mi-shock-risk', ['metoprolol'])] }), ['iv', 'metoprolol'])).toEqual([]);
  });

  it('one penalty: under 90 it is the low-pressure rule\'s', () => {
    expect(pen(field({ problems: ['acs'], vitals: { sbp: 84, dbp: 50 } }), ['iv', 'metoprolol'])).toEqual(['nodal-blocker-hypotension']);
  });
});

describe('antiarrhythmic-hyperkalemia', () => {
  it('fires for lidocaine, procainamide or amiodarone in hyperkalemia — in a PEA arrest too', () => {
    for (const drug of ['lidocaine', 'procainamide', 'amio-infusion']) expect(pen(field({ problems: ['hyperkalemia'] }), ['iv', drug]), drug).toEqual(['antiarrhythmic-hyperkalemia']);
    for (const drug of ['amio-arrest', 'lidocaine']) expect(pen(field({ problems: ['hyperkalemia'], rhythm: PEA, pulse: false }), ['io', drug]), drug).toEqual(['antiarrhythmic-hyperkalemia']);
  });

  it('does not fire with a normal potassium (VT is what they are for), nor in shock-refractory VF or pulseless VT (2025 AHA: with calcium)', () => {
    for (const drug of ['lidocaine', 'procainamide', 'amio-infusion']) expect(pen(field({ rhythm: VT, vitals: { sbp: 110 } }), ['iv', drug]), drug).toEqual([]);
    for (const drug of ['amio-arrest', 'lidocaine']) {
      expect(pen(field({ problems: ['hyperkalemia'], rhythm: VF, pulse: false }), ['io', 'defib', 'defib', 'defib', 'calcium-chloride', drug]), drug).toEqual([]);
      expect(pen(field({ problems: ['hyperkalemia'], rhythm: { profile: 'vt', hr: 180 }, pulse: false }), ['io', 'defib', drug]), drug).toEqual([]);
    }
    expect(rule('antiarrhythmic-hyperkalemia').text).toMatch(/still gets amiodarone or lidocaine/);
  });

  it('a case rule with its id replaces it', () => {
    expect(pen(field({ problems: ['hyperkalemia'], rhythm: VT, vitals: { sbp: 110 }, harms: [exempt('antiarrhythmic-hyperkalemia', ['lidocaine'])] }), ['iv', 'lidocaine'])).toEqual([]);
  });

  it('one penalty: a 300 mg push with a pulse is the arrest-dose rule\'s', () => {
    expect(pen(field({ problems: ['hyperkalemia'] }), ['iv', 'amio-arrest'])).toEqual(['arrest-amio-with-pulse']);
  });
});

describe('the transvenous wire', () => {
  it('temp-wire-without-pads: the wire with no pads on (the ED physician and the lab\'s operator)', () => {
    expect(pen(edMd({ rhythm: CHB }), ['central-line', 'temp-wire'])).toEqual(['temp-wire-without-pads']);
    expect(pen(edMd({ rhythm: CHB }), ['central-line', 'pads', 'temp-wire'])).toEqual([]);
    expect(pen(lab({ rhythm: CHB }), ['consent', 'access-venous', 'temp-wire'])).toEqual(['temp-wire-without-pads']);
    expect(pen(edMd({ rhythm: CHB, harms: [exempt('temp-wire-without-pads', ['temp-wire'])] }), ['central-line', 'temp-wire'])).toEqual([]);
  });

  it('temp-wire-no-indication: in the lab, a wire for a heart that has never slowed', () => {
    expect(pen(lab(), ['pads', 'consent', 'access-venous', 'temp-wire'])).toEqual(['temp-wire-no-indication']);
    // a slow rate seen once (atropine has brought it up since): the wire on demand is its backup
    expect(pen(lab({ rhythm: SLOW_SINUS }), ['iv', 'atropine', 'pads', 'consent', 'access-venous', 'temp-wire'])).toEqual([]);
    expect(pen(lab({ harms: [exempt('temp-wire-no-indication', ['temp-wire'])] }), ['pads', 'consent', 'access-venous', 'temp-wire'])).toEqual([]);
  });

  it('one penalty: no indication outranks no pads; in the ED a normal rate outranks them', () => {
    expect(pen(lab(), ['consent', 'access-venous', 'temp-wire'])).toEqual(['temp-wire-no-indication']);
    expect(pen(edMd(), ['central-line', 'temp-wire'])).toEqual(['temp-wire-not-slow']);
  });
});

describe('atropine-infranodal-repeat', () => {
  it('fires for a repeat dose in Mobitz II or complete heart block the first did not help', () => {
    expect(pen(field({ rhythm: CHB, vitals: { sbp: 104 } }), ['iv', 'atropine', 'atropine'])).toEqual(['atropine-infranodal-repeat']);
  });

  it('does not fire for the first dose, nor over a pacer', () => {
    expect(pen(field({ rhythm: CHB, vitals: { sbp: 104 } }), ['iv', 'atropine'])).toEqual([]);
    expect(pen(field({ rhythm: CHB, vitals: { sbp: 104 } }), ['iv', 'atropine', 'pads', 'pace', 'atropine'])).toEqual(['pace-no-analgesia']);
  });

  it('a case rule with its id replaces it', () => {
    expect(pen(field({ rhythm: CHB, harms: [exempt('atropine-infranodal-repeat', ['atropine'])] }), ['iv', 'atropine', 'atropine'])).toEqual([]);
  });

  it('one penalty a dose: a transplanted heart outranks it on the first dose; the repeat is judged anew', () => {
    // the transplant rule is not charged again for the same drug, and the repeat is the next reason that holds (the one
    // repeat policy of every gate, rules/charge.ts chargedBeforeAs)
    expect(pen(field({ rhythm: CHB, problems: ['heart-transplant'] }), ['iv', 'atropine', 'atropine'])).toEqual(['atropine-heart-transplant', 'atropine-infranodal-repeat']);
  });
});

describe('amiodarone-arrest-long-qt', () => {
  it('fires for amiodarone 300 mg in a torsades or long-QT arrest', () => {
    expect(pen(field({ rhythm: TORSADES, pulse: false }), ['io', 'amio-arrest'])).toEqual(['amiodarone-arrest-long-qt']);
    expect(pen(field({ rhythm: VF, pulse: false, problems: ['long-qt'] }), ['io', 'amio-arrest'])).toEqual(['amiodarone-arrest-long-qt']);
  });

  it('does not fire in a VF arrest with a normal QT', () => {
    expect(pen(field({ rhythm: VF, pulse: false }), ['io', 'amio-arrest'])).toEqual([]);
  });

  it('a case rule with its id replaces it', () => {
    expect(pen(field({ rhythm: TORSADES, pulse: false, harms: [exempt('amiodarone-arrest-long-qt', ['amio-arrest'])] }), ['io', 'amio-arrest'])).toEqual([]);
  });

  it('one penalty: it outranks the PEA rule; a high potassium outranks it in PEA, not in torsades (shockable)', () => {
    expect(pen(field({ rhythm: PEA, pulse: false, problems: ['long-qt'] }), ['io', 'amio-arrest'])).toEqual(['amiodarone-arrest-long-qt']);
    expect(pen(field({ rhythm: PEA, pulse: false, problems: ['long-qt', 'hyperkalemia'] }), ['io', 'amio-arrest'])).toEqual(['antiarrhythmic-hyperkalemia']);
    expect(pen(field({ rhythm: TORSADES, pulse: false, problems: ['hyperkalemia'] }), ['io', 'amio-arrest'])).toEqual(['amiodarone-arrest-long-qt']);
  });
});

describe('the cath lab\'s verapamil and intracoronary adenosine', () => {
  it('cocktail-low-pressure: the radial cocktail or IC verapamil with a systolic under 90', () => {
    expect(pen(lab({ vitals: { sbp: 84, dbp: 50 } }), ['consent', 'access', 'radial-cocktail'])).toEqual(['cocktail-low-pressure']);
    expect(pen(lab({ vitals: { sbp: 84, dbp: 50 } }), ['ic-verapamil'])).toEqual(['cocktail-low-pressure']);
    expect(pen(lab({ vitals: { sbp: 110 } }), ['consent', 'access', 'radial-cocktail'])).toEqual([]);
    expect(pen(lab({ vitals: { sbp: 84, dbp: 50 }, harms: [exempt('cocktail-low-pressure', ['radial-cocktail'])] }), ['consent', 'access', 'radial-cocktail'])).toEqual([]);
  });

  it('the radial cocktail carries nitroglycerin too: a nitrate reason charges it alone (one dose, one penalty)', () => {
    const LOW = { sbp: 84, dbp: 50 };
    const cocktail = ['consent', 'access', 'radial-cocktail'];
    // a heart that lives on its preload with a low pressure, or with a slow rate: the nitrate rule, not also the verapamil's
    expect(pen(lab({ problems: ['rv-infarction'], vitals: LOW }), cocktail)).toEqual(['nitro-preload-dependent']);
    expect(pen(lab({ problems: ['rv-infarction'], rhythm: CHB }), cocktail)).toEqual(['nitro-preload-dependent']);
    expect(pen(lab({ problems: ['pde5-inhibitor'], vitals: LOW }), cocktail)).toEqual(['nitro-pde5']);
    // intracoronary verapamil carries no nitrate: the verapamil's rules
    expect(pen(lab({ problems: ['rv-infarction'], vitals: LOW }), ['ic-verapamil'])).toEqual(['cocktail-low-pressure']);
    // a case rule standing in for the verapamil's rules steps aside for the nitrate too, whatever its weight
    const caseLow: Harm = { id: 'cocktail-low-pressure', actions: ['radial-cocktail'], when: (st) => st.pulse && st.vitals.sbp < 90, replaces: RATE_RULES, points: 6, severity: 'major', text: 'The case\'s words.' };
    expect(pen(lab({ problems: ['rv-infarction'], vitals: LOW, harms: yieldToHeavier([caseLow]) }), cocktail)).toEqual(['nitro-preload-dependent']);
    expect(pen(lab({ vitals: LOW, harms: yieldToHeavier([caseLow]) }), cocktail)).toEqual(['cocktail-low-pressure']);
  });

  it('verapamil-cardiogenic-shock: verapamil in cardiogenic shock, even with the pressure held over 90', () => {
    expect(pen(lab({ problems: ['cardiogenic-shock'], vitals: { sbp: 96, dbp: 60 } }), ['consent', 'access', 'radial-cocktail'])).toEqual(['verapamil-cardiogenic-shock']);
    expect(pen(lab({ vitals: { sbp: 96, dbp: 60 } }), ['consent', 'access', 'radial-cocktail'])).toEqual([]);
    expect(pen(lab({ problems: ['cardiogenic-shock'], vitals: { sbp: 96, dbp: 60 }, harms: [exempt('verapamil-cardiogenic-shock', ['ic-verapamil'])] }), ['ic-verapamil'])).toEqual([]);
    // one penalty: under 90 the low-pressure rule speaks for it
    expect(pen(lab({ problems: ['cardiogenic-shock'], vitals: { sbp: 84, dbp: 50 } }), ['ic-verapamil'])).toEqual(['cocktail-low-pressure']);
  });

  it('ic-vasodilator-hypotension: intracoronary adenosine with a systolic under 90', () => {
    expect(pen(lab({ vitals: { sbp: 84, dbp: 50 } }), ['ic-adenosine'])).toEqual(['ic-vasodilator-hypotension']);
    expect(pen(lab({ vitals: { sbp: 100, dbp: 60 } }), ['ic-adenosine'])).toEqual([]);
    expect(pen(lab({ vitals: { sbp: 84, dbp: 50 }, harms: [exempt('ic-vasodilator-hypotension', ['ic-adenosine'])] }), ['ic-adenosine'])).toEqual([]);
    // one penalty: with heart block the slow rate's
    expect(pen(lab({ rhythm: CHB, vitals: { sbp: 84, dbp: 50 } }), ['ic-adenosine'])).toEqual(['nodal-blocker-slow']);
  });
});

describe('the adenosine infusion for an FFR', () => {
  const wired = flagged('wired');
  it('ffr-adenosine-unsafe: with AV block, a slow rate, a low pressure, or asthma or bronchospasm', () => {
    expect(pen(lab({ rhythm: CHB, extra: wired }), ['iv', 'adenosine-iv-ffr'])).toEqual(['ffr-adenosine-unsafe']);
    expect(pen(lab({ vitals: { sbp: 84, dbp: 50 }, extra: wired }), ['iv', 'adenosine-iv-ffr'])).toEqual(['ffr-adenosine-unsafe']);
    expect(pen(lab({ problems: ['asthma'], extra: wired }), ['iv', 'adenosine-iv-ffr'])).toEqual(['ffr-adenosine-unsafe']);
    expect(pen(lab({ extra: wired }), ['iv', 'adenosine-iv-ffr'])).toEqual([]);
    expect(pen(lab({ rhythm: CHB, extra: wired, harms: [exempt('ffr-adenosine-unsafe', ['adenosine-iv-ffr'])] }), ['iv', 'adenosine-iv-ffr'])).toEqual([]);
  });

  it('ffr-adenosine-no-wire: with no pressure wire to measure', () => {
    expect(pen(lab(), ['iv', 'adenosine-iv-ffr'])).toEqual(['ffr-adenosine-no-wire']);
    expect(pen(lab({ harms: [exempt('ffr-adenosine-no-wire', ['adenosine-iv-ffr'])] }), ['iv', 'adenosine-iv-ffr'])).toEqual([]);
    // one penalty: unsafe outranks no wire
    expect(pen(lab({ rhythm: CHB }), ['iv', 'adenosine-iv-ffr'])).toEqual(['ffr-adenosine-unsafe']);
  });
});

describe('epinephrine in the arrest', () => {
  it('epi-before-shock: epinephrine in VF before any shock', () => {
    expect(pen(field({ rhythm: VF, pulse: false }), ['io', 'epinephrine'])).toEqual(['epi-before-shock']);
    expect(pen(field({ rhythm: VF, pulse: false }), ['io', 'defib', 'epinephrine'])).toEqual([]);
    expect(pen(field({ rhythm: VF, pulse: false, harms: [exempt('epi-before-shock', ['epinephrine'])] }), ['io', 'epinephrine'])).toEqual([]);
  });

  it('epi-too-soon: another dose within 3 minutes', () => {
    expect(pen(field({ rhythm: PEA, pulse: false }), ['io', 'epinephrine', 'epinephrine'])).toEqual(['epi-too-soon']);
    expect(pen(field({ rhythm: PEA, pulse: false }), ['io', 'epinephrine', 'cpr', 'cpr', 'epinephrine'])).toEqual([]);
    // 2.5 minutes after the last dose is still too soon; 3 minutes on the clock (5.1 after 2.1) is not
    expect(pen(field({ rhythm: PEA, pulse: false }), ['io', 'epinephrine', 'cpr', 'epinephrine'])).toEqual(['epi-too-soon']);
    expect(pen(field({ rhythm: PEA, pulse: false }), ['io', ...Array(3).fill('pulse-check'), 'epinephrine', 'cpr', 'capno', 'epinephrine'])).toEqual([]);
    expect(pen(field({ rhythm: PEA, pulse: false, harms: [exempt('epi-too-soon', ['epinephrine'])] }), ['io', 'epinephrine', 'epinephrine'])).toEqual([]);
  });

  it('one penalty a dose: the shock rule is charged once; the repeat at once is judged anew — too soon', () => {
    // a repeat of the same drug is not charged again by the rule already charged on it, but by the next reason that holds
    // (the one repeat policy of every gate, rules/charge.ts chargedBeforeAs)
    expect(pen(field({ rhythm: VF, pulse: false }), ['io', 'epinephrine', 'epinephrine'])).toEqual(['epi-before-shock', 'epi-too-soon']);
    // three minutes on, nothing else holds: the repeat costs nothing more
    expect(pen(field({ rhythm: VF, pulse: false }), ['io', 'epinephrine', 'cpr', 'cpr', 'epinephrine'])).toEqual(['epi-before-shock']);
  });
});

describe('what the patient has: the history rules', () => {
  it('atropine-heart-transplant: atropine for a transplanted heart', () => {
    expect(pen(field({ rhythm: SLOW_SINUS, problems: ['heart-transplant'] }), ['iv', 'atropine'])).toEqual(['atropine-heart-transplant']);
    expect(pen(field({ rhythm: SLOW_SINUS }), ['iv', 'atropine'])).toEqual([]);
    expect(pen(field({ rhythm: SLOW_SINUS, problems: ['heart-transplant'], harms: [exempt('atropine-heart-transplant', ['atropine'])] }), ['iv', 'atropine'])).toEqual([]);
    // one penalty: in an arrest atropine has no place at all; at a normal rate the transplant still outranks it
    expect(pen(field({ rhythm: PEA, pulse: false, problems: ['heart-transplant'] }), ['io', 'atropine'])).toEqual(['atropine-in-arrest']);
    expect(pen(field({ problems: ['heart-transplant'] }), ['iv', 'atropine'])).toEqual(['atropine-heart-transplant']);
  });

  it('adenosine-full-dose: 6 or 12 mg with a transplanted heart, dipyridamole or carbamazepine', () => {
    for (const problem of ['heart-transplant', 'adenosine-potentiator'] as Problem[]) {
      expect(pen(field({ rhythm: SVT, vitals: { sbp: 110 }, problems: [problem] }), ['iv', 'adenosine6']), problem).toEqual(['adenosine-full-dose']);
    }
    expect(pen(field({ rhythm: SVT, vitals: { sbp: 110 } }), ['iv', 'adenosine6'])).toEqual([]);
    expect(pen(field({ rhythm: SVT, vitals: { sbp: 110 }, problems: ['heart-transplant'], harms: [exempt('adenosine-full-dose', ['adenosine6'])] }), ['iv', 'adenosine6'])).toEqual([]);
    // one penalty: asthma outranks it
    expect(pen(field({ rhythm: SVT, vitals: { sbp: 110 }, problems: ['heart-transplant', 'asthma'] }), ['iv', 'adenosine6'])).toEqual(['adenosine-asthma']);
  });

  it('adenosine-asthma: adenosine with asthma or bronchospasm', () => {
    for (const problem of ['asthma', 'bronchospasm'] as Problem[]) {
      expect(pen(field({ rhythm: SVT, vitals: { sbp: 110 }, problems: [problem] }), ['iv', 'adenosine6']), problem).toEqual(['adenosine-asthma']);
    }
    expect(pen(field({ rhythm: SVT, vitals: { sbp: 110 }, problems: ['asthma'], harms: [exempt('adenosine-asthma', ['adenosine6'])] }), ['iv', 'adenosine6'])).toEqual([]);
    // one penalty: in an arrest the arrest rule's
    expect(pen(field({ rhythm: VF, pulse: false, problems: ['asthma'] }), ['io', 'adenosine6'])).toEqual(['rate-drug-in-arrest']);
  });

  it('beta-blocker-bronchospasm and labetalol-asthma: a beta-blocker with asthma or bronchospasm', () => {
    expect(pen(field({ rhythm: AF, problems: ['bronchospasm'] }), ['iv', 'metoprolol'])).toEqual(['beta-blocker-bronchospasm']);
    expect(pen(field({ rhythm: AF }), ['iv', 'metoprolol'])).toEqual([]);
    expect(pen(field({ rhythm: AF, problems: ['asthma'], harms: [exempt('beta-blocker-bronchospasm', ['metoprolol'])] }), ['iv', 'metoprolol'])).toEqual([]);
    // one penalty: fluid on the lungs outranks it
    expect(pen(field({ rhythm: AF, problems: ['asthma', 'pulmonary-edema'] }), ['iv', 'metoprolol'])).toEqual(['beta-blocker-pulmonary-edema']);
    // the drugs still to come: labetalol (8, major) and esmolol, judged by the same ladder
    const asthma = field({ rhythm: AF, problems: ['asthma'] });
    const s = start(asthma, 2);
    expect(topRhythmRule(s, asthma, 'labetalol')).toBe('labetalol-asthma');
    expect(rule('labetalol-asthma')).toMatchObject({ points: 8, severity: 'major' });
    expect(topRhythmRule(s, asthma, 'esmolol')).toBe('beta-blocker-bronchospasm');
    expect(topRhythmRule(s, field({ rhythm: AF }), 'labetalol')).toBeNull();
  });

  it('cardioversion-unanticoagulated: converting AF of 48 hours or more, stable, with no anticoagulation', () => {
    const long = { rhythm: AF, vitals: { sbp: 120 }, problems: ['af-over-48h'] as Problem[] };
    expect(pen(field(long), ['iv', 'midazolam', 'pads', 'cardiovert'])).toEqual(['cardioversion-unanticoagulated']);
    expect(pen(field(long), ['iv', 'procainamide'])).toEqual(['cardioversion-unanticoagulated']);
    // an unstable patient is cardioverted at once; and a recent onset needs no anticoagulation first
    expect(pen(field({ ...long, vitals: { sbp: 84, dbp: 50 } }), ['iv', 'midazolam', 'pads', 'cardiovert'])).toEqual([]);
    expect(pen(field({ rhythm: AF, vitals: { sbp: 120 } }), ['iv', 'midazolam', 'pads', 'cardiovert'])).toEqual([]);
    expect(pen(field({ ...long, harms: [exempt('cardioversion-unanticoagulated', ['cardiovert'])] }), ['iv', 'midazolam', 'pads', 'cardiovert'])).toEqual([]);
  });

  it('amiodarone-may-convert: an amiodarone infusion for the same AF', () => {
    expect(pen(field({ rhythm: AF, problems: ['af-over-48h'] }), ['iv', 'amio-infusion'])).toEqual(['amiodarone-may-convert']);
    expect(pen(field({ rhythm: AF }), ['iv', 'amio-infusion'])).toEqual([]);
    expect(pen(field({ rhythm: AF, problems: ['af-over-48h'], harms: [exempt('amiodarone-may-convert', ['amio-infusion'])] }), ['iv', 'amio-infusion'])).toEqual([]);
    // one penalty: the low pressure outranks it
    expect(pen(field({ rhythm: AF, vitals: { sbp: 84, dbp: 50 }, problems: ['af-over-48h'] }), ['iv', 'amio-infusion'])).toEqual(['amiodarone-hypotension']);
  });

  it('cardioversion-digoxin-toxicity: cardioverting a digoxin-toxic heart', () => {
    const toxic = { rhythm: AF, vitals: { sbp: 120 }, problems: ['digoxin-toxicity'] as Problem[] };
    expect(pen(field(toxic), ['iv', 'midazolam', 'pads', 'cardiovert'])).toEqual(['cardioversion-digoxin-toxicity']);
    expect(pen(field({ ...toxic, harms: [exempt('cardioversion-digoxin-toxicity', ['cardiovert'])] }), ['iv', 'midazolam', 'pads', 'cardiovert'])).toEqual([]);
    // one penalty: it outranks the anticoagulation rule
    expect(pen(field({ ...toxic, problems: ['digoxin-toxicity', 'af-over-48h'] }), ['iv', 'midazolam', 'pads', 'cardiovert'])).toEqual(['cardioversion-digoxin-toxicity']);
  });

  it('procainamide-sodium-channel: procainamide in a sodium-channel-blocker overdose', () => {
    const tca = { rhythm: VT, vitals: { sbp: 110 }, problems: ['sodium-channel-blocker-overdose'] as Problem[] };
    expect(pen(field(tca), ['iv', 'procainamide'])).toEqual(['procainamide-sodium-channel']);
    expect(pen(field({ rhythm: VT, vitals: { sbp: 110 } }), ['iv', 'procainamide'])).toEqual([]);
    expect(pen(field({ ...tca, harms: [exempt('procainamide-sodium-channel', ['procainamide'])] }), ['iv', 'procainamide'])).toEqual([]);
    // one penalty: it outranks the high potassium
    expect(pen(field({ ...tca, problems: ['sodium-channel-blocker-overdose', 'hyperkalemia'] }), ['iv', 'procainamide'])).toEqual(['procainamide-sodium-channel']);
  });
});

describe('rate-drug-compensatory', () => {
  const pe = { problems: ['pulmonary-embolism'] as Problem[], rhythm: { profile: 'sinus-tachycardia', hr: 118 }, vitals: { sbp: 112, dbp: 70 } };
  const tamponade = { problems: ['tamponade'] as Problem[], rhythm: { profile: 'sinus-tachycardia', hr: 118 }, vitals: { sbp: 96, dbp: 70 } };
  it('fires for a beta-blocker or diltiazem in the sinus tachycardia of a pulmonary embolism or a tamponade not yet drained', () => {
    for (const drug of ['metoprolol', 'diltiazem']) {
      expect(pen(field(pe), ['iv', drug]), drug).toEqual(['rate-drug-compensatory']);
      expect(pen(field(tamponade), ['iv', drug]), drug).toEqual(['rate-drug-compensatory']);
      // a tamponade that began mid-case (the flag)
      expect(pen(field({ ...tamponade, problems: [], extra: flagged('tamponade') }), ['iv', drug]), drug).toEqual(['rate-drug-compensatory']);
    }
    // the drugs still to come are judged by the same ladder
    const sc = field(pe);
    expect(topRhythmRule(start(sc, 2), sc, 'esmolol')).toBe('rate-drug-compensatory');
    expect(rule('rate-drug-compensatory')).toMatchObject({ points: 8, severity: 'major' });
    expect(rule('rate-drug-compensatory').text).toMatch(/esmolol label rules it out in pulmonary hypertension/);
  });

  it('does not fire once the tamponade is drained, nor for atrial fibrillation in a pulmonary embolism', () => {
    expect(pen(field({ ...tamponade, extra: flagged('drained') }), ['iv', 'metoprolol'])).toEqual([]);
    expect(pen(field({ ...pe, rhythm: AF }), ['iv', 'diltiazem'])).toEqual([]);
  });

  it('a case rule with its id replaces it; a case rule that replaces RATE_RULES speaks for it', () => {
    expect(pen(field({ ...pe, harms: [exempt('rate-drug-compensatory', ['metoprolol'])] }), ['iv', 'metoprolol'])).toEqual([]);
    const caseRule: Harm = { id: 'rate-control-pe', actions: ['metoprolol'], points: 8, severity: 'major', replaces: RATE_RULES, text: 'The case\'s words.' };
    expect(pen(field({ ...pe, harms: [caseRule] }), ['iv', 'metoprolol'])).toEqual(['rate-control-pe']);
  });

  it('one penalty: a low pressure outranks it', () => {
    expect(pen(field({ ...pe, vitals: { sbp: 84, dbp: 50 } }), ['iv', 'metoprolol'])).toEqual(['nodal-blocker-hypotension']);
  });
});

describe('beta-blocker-cardiogenic-shock', () => {
  const shock = { problems: ['cardiogenic-shock'] as Problem[], rhythm: { profile: 'sinus-tachycardia', hr: 104 }, vitals: { sbp: 96, dbp: 60 } };
  it('fires for a beta-blocker in cardiogenic shock with the pressure held over 90', () => {
    expect(pen(field(shock), ['iv', 'metoprolol'])).toEqual(['beta-blocker-cardiogenic-shock']);
    const sc = field(shock);
    for (const drug of ['esmolol', 'labetalol']) expect(topRhythmRule(start(sc, 2), sc, drug), drug).toBe('beta-blocker-cardiogenic-shock');
  });

  it('does not fire outside shock', () => {
    expect(pen(field({ ...shock, problems: [] }), ['iv', 'metoprolol'])).toEqual([]);
  });

  it('a case rule with its id replaces it', () => {
    expect(pen(field({ ...shock, harms: [exempt('beta-blocker-cardiogenic-shock', ['metoprolol'])] }), ['iv', 'metoprolol'])).toEqual([]);
  });

  it('one penalty: under 90 the low-pressure rule speaks for it, and fluid on the lungs outranks it', () => {
    expect(pen(field({ ...shock, vitals: { sbp: 84, dbp: 50 } }), ['iv', 'metoprolol'])).toEqual(['nodal-blocker-hypotension']);
    expect(pen(field({ ...shock, problems: ['cardiogenic-shock', 'pulmonary-edema'] }), ['iv', 'metoprolol'])).toEqual(['beta-blocker-pulmonary-edema']);
  });
});

describe('the corrected rules: what is right care is not charged', () => {
  it('cardioversion-digoxin-toxicity: an unstable rhythm is cardioverted, at the lowest energy', () => {
    const toxic = { problems: ['digoxin-toxicity'] as Problem[] };
    expect(pen(field({ ...toxic, rhythm: { profile: 'vt', hr: 180 }, vitals: { sbp: 70, dbp: 40, gcs: 12 } }), ['pads', 'cardiovert'])).toEqual([]);
    expect(pen(field({ ...toxic, problems: ['digoxin-toxicity', 'pulmonary-edema'], rhythm: AF, vitals: { sbp: 100, spo2: 86 } }), ['iv', 'midazolam', 'pads', 'cardiovert'])).toEqual([]);
  });

  it('cardioversion-unanticoagulated: pulmonary edema makes the AF unstable — cardioverted at once; procainamide still converts it', () => {
    const edema = { rhythm: { profile: 'atrial-fibrillation', hr: 160 }, vitals: { sbp: 100, spo2: 86 }, problems: ['af-over-48h', 'pulmonary-edema'] as Problem[] };
    expect(pen(field(edema), ['iv', 'midazolam', 'pads', 'cardiovert'])).toEqual([]);
    // procainamide: the failing heart is the heavier reason, ranked first (its label: a negative inotrope)
    expect(pen(field(edema), ['iv', 'procainamide'])).toEqual(['procainamide-heart-failure']);
    // …and without the edema it still converts the clot loose
    expect(pen(field({ ...edema, problems: ['af-over-48h'] }), ['iv', 'procainamide'])).toEqual(['cardioversion-unanticoagulated']);
  });

  it('atropine-infranodal-repeat: a narrow-escape complete block of an inferior MI sits at the AV node — a repeat dose is fair', () => {
    expect(pen(field({ rhythm: { profile: 'inferior-stemi-chb', hr: 40 }, vitals: { sbp: 86, dbp: 54 } }), ['iv', 'atropine', 'atropine'])).toEqual([]);
    expect(pen(field({ rhythm: { profile: 'mobitz-ii', hr: 44 }, vitals: { sbp: 104 } }), ['iv', 'atropine', 'atropine'])).toEqual(['atropine-infranodal-repeat']);
  });

  it('amiodarone-may-convert: in decompensated heart failure IV amiodarone may be considered for the rate', () => {
    expect(pen(field({ rhythm: { profile: 'atrial-fibrillation', hr: 150 }, problems: ['af-over-48h', 'heart-failure', 'pulmonary-edema'] }), ['iv', 'amio-infusion'])).toEqual([]);
    expect(rule('amiodarone-may-convert').text).toMatch(/anticoagulate \(heparin\) at once/);
  });

  it('adenosine-full-dose: the 3 mg first dose is the AHA\'s; the label warns of dipyridamole and carbamazepine', () => {
    expect(rule('adenosine-full-dose').text).toMatch(/the AHA first dose is 3 mg \(the label warns that dipyridamole potentiates adenosine/);
  });

  it('ffr-adenosine-no-wire: only with a pulse (in an arrest the infusion is a rate drug in arrest)', () => {
    expect(pen(lab({ rhythm: PEA, pulse: false }), ['iv', 'adenosine-iv-ffr'])).toEqual(['rate-drug-in-arrest']);
    expect(LADDERS['adenosine-iv-ffr']).toEqual(['rate-drug-in-arrest', 'ffr-adenosine-unsafe', 'ffr-adenosine-no-wire']);
  });
});

describe('in the cases: one dose, one penalty, at the right weight', () => {
  const caseRun = (id: string, role: LearningLevel, steps: string[]) => penaltyIds(SCENARIO_BY_ID[id], role, steps);

  it('a case rule that says an antiarrhythmic is wrong speaks for procainamide\'s own rules too (one dose, one penalty)', () => {
    /** the penalties of the last step alone */
    const lastDose = (id: string, role: LearningLevel, steps: string[]) => {
      const s = runScenario(SCENARIO_BY_ID[id], role, steps);
      return s.penalties.filter((p) => p.minute === s.performed.at(-1)!.minute).map((p) => p.id);
    };
    // SCAPE, procainamide at a slow rate: the label's procainamide-slow alone (the case's minor no-arrhythmia rule steps aside)
    expect(lastDose('scape-field', 2, ['iv', 'atropine', 'transport-pci', 'sample', 'opqrst', 'lvad-check', 'hs-ts', 'magnesium-sulfate', 'neuro',
      'o2-nc', 'diphenhydramine', 'airway', 'notify', 'perfusion', 'fentanyl', 'cool', 'transport-near', 'magnesium-sulfate', 'calcium-gluconate', 'procainamide']))
      .toEqual(['procainamide-slow']);
    // …while a second antiarrhythmic stays a mistake of its own, as amiodarone after procainamide does (PROCAINAMIDE_RULES)
    expect(lastDose('scape-ed', 6, ['iv', 'dextrose', 'perfusion', 'nibp', 'labetalol', 'diltiazem', 'atropine', 'sit-up', 'opqrst', 'temp', 'glucose',
      'cpr', 'pulse-check', 'transfuse', 'labs', 'stop-antithrombotics', 'amio-arrest', 'ondansetron', 'observe', 'handoff', 'capno', 'procainamide']))
      // procainamide in his acute pulmonary edema: the label contraindication outranks the second antiarrhythmic, and charges
      // beside the nurse's twin (which stands for the missing order)
      .toEqual(['procainamide-heart-failure', 'rn-antiarrhythmic-no-arrhythmia']);
    // af-rvr unstable: procainamide is the case's unstable-patient rule alone, diltiazem the HFrEF rule alone
    expect(lastDose('af-rvr-field', 2, ['vitals', 'smr', 'cpap', 'push-epi', 'ecg-posterior', 'temp', 'vitals', 'lvad-check', 'notify', 'io', 'capno',
      'amio-arrest', 'ecg12-repeat', 'lvad-check', 'poison-control', 'sodium-bicarbonate', 'fluid', 'atropine', 'atropine', 'procainamide']))
      .toEqual(['antiarrhythmic-unstable']);
    expect(lastDose('af-rvr-field', 2, ['aspirin', 'med-control', 'cpr', 'transport-pci', 'ondansetron', 'restrain', 'io', 'ecg12-repeat', 'nitro-high',
      'pace', 'perfusion', 'pressor', 'restrain-prone', 'doppler-map', 'monitor', 'cool', 'diltiazem'])).toEqual(['diltiazem-hfref']);
  });

  it('a second antiarrhythmic after the case rule charged on the first still costs its own mistake: the case rule\'s again, the heavier', () => {
    // each case rule stands in for a drug contraindication, so it charges once for each drug (rules/charge.ts); the
    // second-antiarrhythmic rule is among the rules it stands in for (one dose, one penalty: the heavier, here the case's)
    expect(caseRun('tamponade-field', 2, ['iv', 'amio-infusion', 'procainamide'])).toEqual(['antiarrhythmic-tamponade', 'antiarrhythmic-tamponade']);
    expect(caseRun('lvad-field', 2, ['iv', 'procainamide', 'amio-infusion'])).toEqual(['antiarrhythmic-sinus', 'antiarrhythmic-sinus']);
    expect(caseRun('beta-blocker-overdose-field', 2, ['iv', 'amio-infusion', 'procainamide'])).toEqual(['antiarrhythmic-brady', 'antiarrhythmic-brady']);
    // a patient living on a ventricular escape: the escape-suppressant rule (20, critical) for each drug, never the
    // procainamide ladder beside it
    const tempWire = caseRun('heart-block-temp-wire-cathlab', 5, ['bp-both-arms', 'legs-up', 'vitals', 'bvm', 'p2y12', 'phenylephrine', 'albuterol-hyperk', 'ic-nitroprusside', 'lidocaine', 'procainamide']);
    expect(tempWire.slice(-2)).toEqual(['escape-suppressant', 'escape-suppressant']);
  });

  it('the second antiarrhythmic and the case\'s rule on the same dose: one penalty, the heavier', () => {
    // SCAPE: amiodarone after procainamide — the case's minor no-arrhythmia rule (3) gives way to the stacking rule (5)
    expect(caseRun('scape-field', 2, ['iv', 'procainamide', 'amio-infusion'])).toEqual(['iv-before-cpap', 'procainamide-heart-failure', 'amiodarone-after-procainamide']);
    expect(caseRun('scape-ed', 7, ['iv', 'procainamide', 'amio-infusion'])).toEqual(['procainamide-heart-failure', 'amiodarone-after-procainamide']);
    // the nurse's twin (5, major: it stands for the missing order too) outweighs it, and charges once for each drug
    expect(caseRun('scape-ed', 6, ['iv', 'procainamide', 'amio-infusion']))
      .toEqual(['procainamide-heart-failure', 'rn-antiarrhythmic-no-arrhythmia', 'rn-antiarrhythmic-no-arrhythmia']);
    // a case rule that charges once a case (an indication rule's id), charged on the first drug: the second is the stacking
    // rule's — never free
    expect(caseRun('guide-dissection-cathlab', 4, ['procainamide', 'amio-infusion'])).toEqual(['antiarrhythmic-no-arrhythmia', 'amiodarone-after-procainamide']);
    // a patient living on a ventricular escape: the escape-suppressant rule for each drug, never the procainamide ladder or
    // the stacking rule beside it
    expect(caseRun('heart-block-temp-wire-cathlab', 5, ['read:nsr', 'lidocaine', 'procainamide', 'amio-infusion']))
      .toEqual(['escape-suppressant', 'escape-suppressant', 'escape-suppressant']);
  });

  it('a minor case rule does not speak for a major contraindication', () => {
    // stable VT become unstable (84/52): IV metoprolol is the low-pressure rule's, not the case's minor beta-blocker rule
    expect(caseRun('stable-vt-field', 2, ['iv', ...Array(7).fill('reassess'), 'metoprolol'])).toEqual(['nodal-blocker-hypotension']);
    expect(caseRun('stable-vt-field', 2, ['iv', 'metoprolol'])).toEqual(['beta-blocker-vt']);
    // cocaine: diltiazem on top of IV metoprolol is the diltiazem label's contraindication
    expect(caseRun('cocaine-chest-pain-field', 2, ['iv', 'metoprolol', 'diltiazem'])).toEqual(['beta-blocker-stimulant', 'iv-beta-blocker-with-diltiazem']);
  });

  it('left main in shock: intracoronary verapamil at 78 costs what the radial cocktail does', () => {
    expect(caseRun('left-main-shock-cathlab', 5, ['ic-verapamil'])).toEqual(['cocktail-low-pressure']);
    expect(caseRun('left-main-shock-cathlab', 4, ['iv', 'ic-verapamil'])).toEqual(['cocktail-low-pressure']);
    expect(caseRun('left-main-shock-cathlab', 5, ['pressor', 'ic-verapamil'])).toEqual(['verapamil-cardiogenic-shock']);
  });

  it('the walk-in STEMI: the ER doctor\'s adenosine in sinus rhythm treats nothing (the case\'s rule says adenosine too)', () => {
    for (const drug of ['adenosine6', 'adenosine12']) expect(caseRun('stemi-walk-in-ed', 7, ['iv', drug]), drug).toEqual(['antiarrhythmic-no-arrhythmia']);
  });

  it('the contrast reaction: the rules that read her bronchospasm wait for the reaction', () => {
    const MD = ['consent', 'timeout', 'access', 'cath-tiger', 'angio'];
    // before the contrast her lungs are clear: the indication rules speak
    expect(caseRun('contrast-cathlab', 4, ['iv', 'adenosine6'])).toEqual(['antiarrhythmic-no-arrhythmia']);
    expect(caseRun('contrast-cathlab', 5, ['adenosine-iv-ffr'])).toEqual(['ffr-adenosine-no-wire']);
    expect(caseRun('contrast-cathlab', 5, ['iv', 'magnesium-sulfate'])).toEqual(['magnesium-no-indication']);
    // in the reaction: bronchospasm, and a pressure of 76
    expect(caseRun('contrast-cathlab', 5, [...MD, 'iv', 'adenosine6'])).toEqual(['adenosine-asthma']);
    expect(caseRun('contrast-cathlab', 5, [...MD, 'adenosine-iv-ffr'])).toEqual(['ffr-adenosine-unsafe']);
    expect(caseRun('contrast-cathlab', 5, [...MD, 'iv', 'magnesium-sulfate'])).toEqual(['magnesium-no-indication']);
    expect(caseRun('contrast-cathlab', 5, [...MD, 'iv', 'epi-im', 'fluid', 'magnesium-sulfate'])).not.toContain('magnesium-no-indication');
  });
});

describe('the older rules, ranked', () => {
  it('pre-excited AF: amiodarone 300 mg with a pulse is the pre-excitation rule\'s, once', () => {
    expect(pen(field({ rhythm: PREEXCITED, vitals: { sbp: 110 } }), ['iv', 'amio-arrest'])).toEqual(['av-blocker-preexcited-af']);
    expect(pen(field(), ['iv', 'amio-arrest'])).toEqual(['arrest-amio-with-pulse']);
    expect(rule('av-blocker-preexcited-af').text).toMatch(/IV amiodarone and beta-blockers — 3: Harm/);
  });

  it('diltiazem in VT with a failing heart: one penalty, the VT rule\'s', () => {
    expect(pen(field({ rhythm: VT, vitals: { sbp: 110 }, problems: ['heart-failure'] }), ['iv', 'diltiazem'])).toEqual(['diltiazem-vt']);
  });

  it('procainamide: one dose, one penalty — block, then long QT, low pressure, failing heart, a second antiarrhythmic', () => {
    expect(pen(field({ rhythm: CHB, vitals: { sbp: 80, dbp: 50 } }), ['iv', 'procainamide'])).toEqual(['procainamide-slow']);
    expect(pen(field({ rhythm: VT, vitals: { sbp: 82, dbp: 50 }, problems: ['heart-failure'] }), ['iv', 'procainamide'])).toEqual(['procainamide-hypotension']);
    expect(pen(field({ rhythm: VT, vitals: { sbp: 110 }, problems: ['heart-failure', 'long-qt'] }), ['iv', 'procainamide'])).toEqual(['procainamide-long-qt']);
    expect(pen(field({ rhythm: VT, vitals: { sbp: 130 }, problems: ['heart-failure'] }), ['iv', 'amio-infusion', 'procainamide'])).toEqual(['procainamide-heart-failure']);
    // and amiodarone after procainamide with a long QT: the QT rule's
    expect(pen(field({ rhythm: VT, vitals: { sbp: 130 }, problems: ['long-qt'] }), ['iv', 'procainamide', 'amio-infusion'])).toEqual(['procainamide-long-qt', 'amiodarone-long-qt']);
  });

  it('the shock and atropine texts', () => {
    expect(rule('shock-with-pulse').text).toMatch(/An unstable tachycardia with a pulse gets synchronized cardioversion; any other rhythm with a pulse needs no shock at all\.$/);
    expect(rule('atropine-fast').text).toMatch(/^Atropine with no slow heart rate to treat\./);
  });
});

describe('review round: contraindications that went free', () => {
  const caseRun = (id: string, role: LearningLevel, steps: string[]) => penaltyIds(SCENARIO_BY_ID[id], role, steps);
  /** a teammate's (or the operator's) IV beta-blocker: the flag the case sets, with no dose of the learner's */
  const teammateBeta = flagged('beta-blocker');

  it('iv-beta-blocker-with-diltiazem counts a teammate\'s IV beta-blocker (its flag) and a teammate\'s diltiazem, not the tablet', () => {
    expect(pen(lab({ extra: teammateBeta }), ['iv', 'diltiazem'])).toEqual(['iv-beta-blocker-with-diltiazem']);
    expect(pen(lab({ extra: flagged('diltiazem') }), ['iv', 'metoprolol'])).toEqual(['iv-beta-blocker-with-diltiazem']);
    // the learner's own oral tablet sets the same flag: tablet then IV diltiazem is no label contraindication
    expect(pen(lab(), ['iv', 'metoprolol-po', 'diltiazem'])).not.toContain('iv-beta-blocker-with-diltiazem');
    // nearest correct state: no beta-blocker on board
    expect(pen(lab(), ['iv', 'diltiazem'])).not.toContain('iv-beta-blocker-with-diltiazem');
  });

  it('in the SCAD case, diltiazem after the operator\'s metoprolol is the label contraindication', () => {
    const s = runScenario(SCENARIO_BY_ID['scad-cathlab'], 4, ['consent', 'heparin', 'timeout', 'ecg12', 'callout', 'ic-nitro', 'callout', 'reassess', 'reassess']);
    expect(s.flags['beta-blocker']).toBeDefined();
    expect(s.counts.metoprolol ?? 0).toBe(0);
    expect(caseRun('scad-cathlab', 4, ['consent', 'heparin', 'timeout', 'ecg12', 'callout', 'ic-nitro', 'callout', 'reassess', 'reassess', 'diltiazem']))
      .toEqual(['iv-beta-blocker-with-diltiazem']);
  });

  it('vagal-no-indication: a vagal maneuver ends a re-entry through the AV node only — an SVT, stable or unstable, is what it is for', () => {
    expect(pen(field({ rhythm: { profile: 'sinus-tachycardia', hr: 120 } }), ['vagal'])).toEqual(['vagal-no-indication']);
    expect(pen(field({ rhythm: AF }), ['vagal'])).toEqual(['vagal-no-indication']);
    expect(pen(field({ rhythm: VT, vitals: { sbp: 78, dbp: 48 } }), ['vagal'])).toEqual(['vagal-no-indication']);
    expect(pen(field({ rhythm: SVT, vitals: { sbp: 110 } }), ['vagal'])).toEqual([]);
    expect(pen(field({ rhythm: SVT, vitals: { sbp: 82, dbp: 54 } }), ['vagal'])).toEqual([]);
    // one dose, one penalty: a slow pulse is vagal-slow's, ranked first
    expect(pen(field({ rhythm: SLOW_SINUS }), ['vagal'])).toEqual(['vagal-slow']);
    expect(LADDERS.vagal).toEqual(['vagal-slow', 'vagal-no-indication']);
    // a case rule with its id replaces it
    expect(pen(field({ rhythm: AF, harms: [exempt('vagal-no-indication', ['vagal'])] }), ['vagal'])).toEqual([]);
    // in the cases: an unstable AF or a cardiogenic shock costs it; the unstable SVT's own timing judges the delay there
    expect(caseRun('unstable-af-cardioversion-ed', 7, ['ems-handoff', 'vagal'])).toEqual(['vagal-no-indication']);
    expect(caseRun('shock-cathlab', 5, ['vagal'])).toEqual(['vagal-no-indication']);
    expect(caseRun('svt-unstable-field', 2, ['primary', 'pads', 'nibp', 'iv', 'vagal'])).toEqual([]);
  });

  it('the hyperkalemia cases judge a vagal maneuver in their own words at any rate: one act, one penalty', () => {
    for (const id of ['hyperkalemia-ed', 'hyperkalemia-dialysis-field']) {
      expect(SCENARIO_BY_ID[id].harms.find((h) => h.id === 'vagal-slow')!.replaces, id).toContain('vagal-no-indication');
    }
    // treated up to a rate over 60 (the sweep's sequence): the case's vagal-slow alone, not the built-in no-indication beside it
    const steps = ['iv', 'sample', 'p2y12', 'transfuse', 'adenosine12', 'calcium-gluconate', 'cool', 'perfusion', 'vitals', 'calcium-chloride', 'push-epi',
      'epinephrine', 'albuterol', 'read:nsr', 'atropine', 'sodium-bicarbonate', 'nibp', 'glucagon', 'albuterol-hyperk', 'amio-infusion'];
    const sc = SCENARIO_BY_ID['hyperkalemia-ed'];
    const before = runScenario(sc, 6, steps, undefined, 'manual');
    expect(before.pulse).toBe(true);
    expect(before.rhythm.hr).toBeGreaterThanOrEqual(60);
    const after = runScenario(sc, 6, [...steps, 'vagal'], undefined, 'manual');
    expect(after.penalties.slice(before.penalties.length).map((p) => p.id)).toEqual(['vagal-slow']);
    // and at the slow rate it opens with
    expect(caseRun('hyperkalemia-dialysis-field', 2, ['vagal'])).toEqual(['vagal-slow']);
  });

  it('procainamide-heart-failure: acute pulmonary edema and cardiogenic shock are heart failure too', () => {
    const vt = { rhythm: { profile: 'vt', hr: 160 }, vitals: { sbp: 150 } };
    expect(pen(field({ ...vt, problems: ['pulmonary-edema'] }), ['iv', 'procainamide'])).toEqual(['procainamide-heart-failure']);
    expect(pen(lab({ ...vt, problems: ['cardiogenic-shock'] }), ['iv', 'procainamide'])).toEqual(['procainamide-heart-failure']);
    expect(pen(field(vt), ['iv', 'procainamide'])).toEqual([]);
    // the SCAPE patient's fast sinus rate: the label's reason (one penalty), not the 3-point no-arrhythmia rule
    expect(caseRun('scape-field', 2, ['vitals', 'cpap', 'iv', 'procainamide'])).toEqual(['procainamide-heart-failure']);
  });

  it('beta-blocker-mi-shock-risk: the 2013 STEMI shock-risk signs — a systolic under 120, a rate under 60, a heart just out of an arrest', () => {
    const acs = (vitals: Partial<Vitals>, rhythm = SINUS, extra?: Partial<Scenario>) => lab({ rhythm, vitals, problems: ['acs'], extra });
    expect(pen(acs({ sbp: 112 }), ['iv', 'metoprolol'])).toEqual(['beta-blocker-mi-shock-risk']);
    expect(pen(acs({ sbp: 130 }, { profile: 'sinus-bradycardia', hr: 56 }), ['iv', 'metoprolol'])).toEqual(['beta-blocker-mi-shock-risk']);
    expect(pen(acs({ sbp: 130 }, SINUS, flagged('rosc')), ['iv', 'metoprolol'])).toEqual(['beta-blocker-mi-shock-risk']);
    expect(pen(acs({ sbp: 130 }), ['iv', 'metoprolol'])).toEqual([]);
    // the tablet too (the oral rule, rules/added.ts)
    expect(pen(acs({ sbp: 112 }), ['metoprolol-po'])).toEqual(['oral-beta-blocker-shock-risk']);
    expect(pen(acs({ sbp: 130 }, SINUS, flagged('rosc')), ['metoprolol-po'])).toEqual(['oral-beta-blocker-shock-risk']);
    // VF arrest in the field: minutes after ROSC, the pressure held at 104 by the infusion, IV metoprolol is the shock risk
    const rosc = ['cpr', 'defib', 'cpr', 'io', 'defib', 'epinephrine', 'cpr', 'defib', 'amio-arrest', 'capno', 'bvm', 'cpr', 'defib', 'bvm', 'ecg12', 'pressor'];
    expect(runScenario(SCENARIO_BY_ID['vf-arrest-field'], 2, rosc).vitals.sbp).toBeGreaterThanOrEqual(90);
    expect(caseRun('vf-arrest-field', 2, [...rosc, 'metoprolol'])).toEqual(['beta-blocker-mi-shock-risk']);
  });

  it('beta-blocker-pheochromocytoma: no beta-blocker before alpha-blockade', () => {
    const pheo = { rhythm: { profile: 'sinus-tachycardia', hr: 120 }, vitals: { sbp: 190, dbp: 110 }, problems: ['pheochromocytoma'] as Problem[] };
    for (const id of ['metoprolol', 'esmolol', 'labetalol', 'metoprolol-po']) expect(pen(lab(pheo), ['iv', id]), id).toEqual(['beta-blocker-pheochromocytoma']);
    expect(pen(lab({ ...pheo, problems: [] }), ['iv', 'esmolol'])).toEqual([]);
    expect(pen(lab({ ...pheo, harms: [exempt('beta-blocker-pheochromocytoma', ['esmolol'])] }), ['iv', 'esmolol'])).toEqual([]);
    // one dose, one penalty: a slow rate outranks it
    expect(pen(lab({ ...pheo, rhythm: SLOW_SINUS }), ['iv', 'metoprolol'])).toEqual(['nodal-blocker-slow']);
  });
});
