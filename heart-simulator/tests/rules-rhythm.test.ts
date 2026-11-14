/**
 * The built-in rhythm rules (rules/rhythm.ts): the rate and AV-nodal drugs, the arrest drugs, lidocaine, procainamide,
 * magnesium, atropine, the shocks, pacing and the transvenous wire, and the cath lab's AV-nodal drugs. For each newer rule:
 * it fires; it does not fire in the nearest correct state; a case rule with its id replaces it; and the gate gives one dose
 * one penalty (the highest-ranked rule that applies, LADDERS).
 */
import { describe, expect, it } from 'vitest';
import { BUILT_IN_HARMS, start } from '@/lib/sim/scenario/engine';
import { orderedFlag } from '@/lib/sim/scenario/kit';
import { INDICATION_RULES } from '@/lib/sim/scenario/rules/scope';
import { LADDERS, RATE_DRUGS, RATE_RULES, RHYTHM_RULES, topRhythmRule } from '@/lib/sim/scenario/rules/rhythm';
import type { Harm, Problem, Scenario, Setting, Vitals } from '@/lib/sim/scenario/types';
import type { LearningLevel } from '@/store/useAppStore';
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

  it('the indication rules come last in every ladder, so a missing order that covers one never hides a contraindication', () => {
    for (const [action, ladder] of Object.entries(LADDERS)) {
      const own = ladder.filter((id) => rule(id).actions.includes(action));
      const first = own.findIndex((id) => INDICATION_RULES.includes(id));
      if (first < 0) continue;
      expect(own.slice(first).every((id) => INDICATION_RULES.includes(id)), action).toBe(true);
    }
  });

  it('RATE_RULES are the newer rules on the rate drugs', () => {
    for (const older of ['av-blocker-preexcited-af', 'diltiazem-vt', 'diltiazem-heart-failure', 'beta-blocker-stimulant', 'amiodarone-long-qt', 'amiodarone-after-procainamide']) {
      expect(RATE_RULES).not.toContain(older);
    }
    expect(RATE_RULES).toContain('nodal-blocker-slow');
    expect(RATE_RULES).toContain('antiarrhythmic-no-arrhythmia');
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
});

describe('nodal-blocker-slow', () => {
  it('fires for an AV-nodal drug or amiodarone with AV block or a rate under 50', () => {
    for (const drug of ['metoprolol', 'diltiazem', 'adenosine6', 'adenosine12', 'amio-infusion']) {
      expect(pen(field({ rhythm: CHB, vitals: { sbp: 110 } }), ['iv', drug]), drug).toEqual(['nodal-blocker-slow']);
    }
    expect(pen(field({ rhythm: SLOW_SINUS }), ['iv', 'metoprolol'])).toEqual(['nodal-blocker-slow']);
    // and the cath lab's intracoronary drugs and the radial cocktail
    for (const drug of ['ic-adenosine', 'ic-verapamil']) expect(pen(lab({ rhythm: CHB, vitals: { sbp: 110 } }), [drug]), drug).toEqual(['nodal-blocker-slow']);
    expect(pen(lab({ rhythm: CHB, vitals: { sbp: 110 } }), ['access', 'radial-cocktail'])).toEqual(['nodal-blocker-slow']);
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
  });

  it('a case rule with its id replaces it', () => {
    expect(pen(field({ harms: [exempt('antiarrhythmic-no-arrhythmia', ['adenosine6'])] }), ['iv', 'adenosine6'])).toEqual([]);
  });

  it('one penalty: a failing heart outranks it for procainamide', () => {
    expect(pen(field({ problems: ['heart-failure'] }), ['iv', 'procainamide'])).toEqual(['procainamide-heart-failure']);
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
    expect(pen(field({ rhythm: PREEXCITED, vitals: { sbp: 120 } }), ['iv', 'metoprolol', 'diltiazem'])).toEqual(['av-blocker-preexcited-af']);
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

  it('does not fire for a stable MI, nor outside an MI', () => {
    expect(pen(field({ problems: ['acs'] }), ['iv', 'metoprolol'])).toEqual([]);
    expect(pen(field({ vitals: { sbp: 96, dbp: 60 } }), ['iv', 'metoprolol'])).toEqual([]);
  });

  it('a case rule with its id replaces it', () => {
    expect(pen(field({ problems: ['acs'], vitals: { sbp: 96, dbp: 60 }, harms: [exempt('beta-blocker-mi-shock-risk', ['metoprolol'])] }), ['iv', 'metoprolol'])).toEqual([]);
  });

  it('one penalty: under 90 it is the low-pressure rule\'s', () => {
    expect(pen(field({ problems: ['acs'], vitals: { sbp: 84, dbp: 50 } }), ['iv', 'metoprolol'])).toEqual(['nodal-blocker-hypotension']);
  });
});

describe('the cath lab\'s verapamil and intracoronary adenosine', () => {
  it('cocktail-low-pressure: the radial cocktail or IC verapamil with a systolic under 90', () => {
    expect(pen(lab({ vitals: { sbp: 84, dbp: 50 } }), ['access', 'radial-cocktail'])).toEqual(['cocktail-low-pressure']);
    expect(pen(lab({ vitals: { sbp: 84, dbp: 50 } }), ['ic-verapamil'])).toEqual(['cocktail-low-pressure']);
    expect(pen(lab({ vitals: { sbp: 110 } }), ['access', 'radial-cocktail'])).toEqual([]);
    expect(pen(lab({ vitals: { sbp: 84, dbp: 50 }, harms: [exempt('cocktail-low-pressure', ['radial-cocktail'])] }), ['access', 'radial-cocktail'])).toEqual([]);
  });

  it('verapamil-cardiogenic-shock: verapamil in cardiogenic shock, even with the pressure held over 90', () => {
    expect(pen(lab({ problems: ['cardiogenic-shock'], vitals: { sbp: 96, dbp: 60 } }), ['access', 'radial-cocktail'])).toEqual(['verapamil-cardiogenic-shock']);
    expect(pen(lab({ vitals: { sbp: 96, dbp: 60 } }), ['access', 'radial-cocktail'])).toEqual([]);
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

describe('what the patient has: the history rules', () => {
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

  it('amiodarone-may-convert: an amiodarone infusion for the same AF', () => {
    expect(pen(field({ rhythm: AF, problems: ['af-over-48h'] }), ['iv', 'amio-infusion'])).toEqual(['amiodarone-may-convert']);
    expect(pen(field({ rhythm: AF }), ['iv', 'amio-infusion'])).toEqual([]);
    expect(pen(field({ rhythm: AF, problems: ['af-over-48h'], harms: [exempt('amiodarone-may-convert', ['amio-infusion'])] }), ['iv', 'amio-infusion'])).toEqual([]);
    // one penalty: the low pressure outranks it
    expect(pen(field({ rhythm: AF, vitals: { sbp: 84, dbp: 50 }, problems: ['af-over-48h'] }), ['iv', 'amio-infusion'])).toEqual(['amiodarone-hypotension']);
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
