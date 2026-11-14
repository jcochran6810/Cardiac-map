/**
 * The built-in rules for acute coronary care (rules/acs.ts): each rule fires when it should and not in the nearest correct
 * state, a case rule with its id stands in for it, and each drug family's gate charges one dose once — the highest-ranked
 * reason to hold it.
 */
import { describe, expect, it } from 'vitest';
import { BUILT_IN_HARMS, start } from '@/lib/sim/scenario/engine';
import {
  ANTITHROMBOTIC_RULES, LYTIC_RULES, NITRATE_RULES, PROTAMINE_RULES, SEDATIVE_RULES, nitrateCaseRule, nitrateCheckRule, nitrateRulesExcept,
  sedationForProcedure, topNitrate,
} from '@/lib/sim/scenario/rules/acs';
import { SCENARIO_BY_ID } from '@/lib/sim/scenario/scenarios';
import type { Harm, Problem, Vitals } from '@/lib/sim/scenario/types';
import type { LearningLevel } from '@/store/useAppStore';
import { fixture, penaltyIds, type FixtureSpec } from './ruleFixture';
import { runScenario } from './helpers';

const SINUS = { profile: 'normal-sinus', hr: 80 };
/** The pressure taken and the PDE-5 question asked: the checks before a sublingual nitrate */
const CHECKED = ['vitals', 'ask-pde5'];
const R = (n: number) => Array<string>(n).fill('reassess');

type Spec = Omit<Partial<FixtureSpec>, 'vitals'> & { vitals?: Partial<Vitals> };
/** A paramedic's patient with chest pain and a normal pressure: a clean nitroglycerin dose once checked, unless a test changes something */
const patient = ({ vitals, ...over }: Spec = {}) =>
  fixture({ setting: 'field', role: 2, rhythm: SINUS, ...over, vitals: { pain: 6, ...vitals } });
const withProblems = (problems: Problem[], over: Spec = {}) => patient({ ...over, problems });
/** The penalties of the checks and then these steps */
const after = (sc: ReturnType<typeof fixture>, steps: string[], role?: LearningLevel) => penaltyIds(sc, role ?? sc.roles[0], [...CHECKED, ...steps]);
const caseRule = (over: Partial<Harm>): Harm => ({ id: 'case-nitro', actions: ['nitro', 'nitro-high'], points: 8, severity: 'major', text: 'The case\'s own words.', ...over });
const rule = (id: string) => BUILT_IN_HARMS.find((h) => h.id === id)!;

describe('the nitrate gate', () => {
  it('a checked dose for chest pain with a normal pressure and rate costs nothing', () => {
    expect(after(patient(), ['nitro'])).toEqual([]);
    expect(after(patient({ vitals: { sbp: 180, dbp: 100 } }), ['nitro-high'])).toEqual([]);
  });

  it('nitro-pde5: any nitrate, and nitroprusside, after a PDE-5 inhibitor or riociguat', () => {
    expect(after(withProblems(['pde5-inhibitor']), ['nitro'])).toEqual(['nitro-pde5']);
    expect(after(withProblems(['pde5-inhibitor'], { vitals: { sbp: 180, dbp: 100 } }), ['nitro-high'])).toEqual(['nitro-pde5']);
    const lab = withProblems(['pde5-inhibitor'], { setting: 'cathlab', role: 5 });
    expect(penaltyIds(lab, 5, ['ic-nitro'])).toEqual(['nitro-pde5']);
    expect(penaltyIds(lab, 5, ['ic-nitroprusside'])).toEqual(['nitro-pde5']);
    // (the cocktail goes down a radial sheath, placed after consent)
    expect(penaltyIds(lab, 5, ['consent', 'access', 'radial-cocktail'])).toEqual(['nitro-pde5']);
    expect(rule('nitro-pde5').actions).toEqual(expect.arrayContaining(['nitro', 'nitro-high', 'nitro-assist', 'ic-nitro', 'nitro-iv', 'radial-cocktail', 'ic-nitroprusside']));
  });

  it('nitro-preload-dependent: an RV infarct, a pulmonary embolism, a tamponade not drained, an outflow obstruction', () => {
    for (const p of ['rv-infarction', 'pulmonary-embolism', 'tamponade', 'severe-aortic-stenosis', 'lvot-obstruction'] as Problem[]) {
      expect(after(withProblems([p]), ['nitro']), p).toEqual(['nitro-preload-dependent']);
    }
    // a tamponade that begins mid-case (the flag), and one that is drained
    const bleeds = patient({ extra: { events: [{ id: 'bleed', when: (s) => s.minute >= 1, effect: () => ({ flags: ['tamponade'] }) }] } });
    expect(after(bleeds, ['nitro'])).toEqual(['nitro-preload-dependent']);
    const drained = withProblems(['tamponade'], { extra: { events: [{ id: 'drain', when: () => true, effect: () => ({ flags: ['drained'] }) }] } });
    expect(after(drained, ['nitro'])).toEqual([]);
    // the radial cocktail carries nitroglycerin too
    expect(penaltyIds(withProblems(['rv-infarction'], { setting: 'cathlab', role: 5 }), 5, ['consent', 'access', 'radial-cocktail'])).toEqual(['nitro-preload-dependent']);
  });

  it('one dose, one penalty: nitroglycerin at 85 in an RV infarct is the preload rule only', () => {
    expect(after(withProblems(['rv-infarction'], { vitals: { sbp: 85, dbp: 54 } }), ['nitro'])).toEqual(['nitro-preload-dependent']);
    // everything wrong at once: the most serious reason alone
    const everything = withProblems(['pde5-inhibitor', 'rv-infarction'], { rhythm: { profile: 'sinus-bradycardia', hr: 44 }, vitals: { sbp: 84, dbp: 50, pain: 0 } });
    for (const id of ['nitro', 'nitro-high']) expect(penaltyIds(everything, 2, [id]), id).toEqual(['nitro-pde5']);
  });

  it('nitro-hypotension: under 90 (an LVAD: a Doppler MAP under 60), ranked under the PDE-5 and preload rules', () => {
    expect(after(patient({ vitals: { sbp: 86, dbp: 54 } }), ['nitro'])).toEqual(['nitro-hypotension']);
    expect(after(patient({ vitals: { sbp: 92, dbp: 60 } }), ['nitro'])).toEqual([]);
    expect(after(withProblems(['pde5-inhibitor'], { vitals: { sbp: 86, dbp: 54 } }), ['nitro'])).toEqual(['nitro-pde5']);
  });

  it('vasodilator-before-rate-control: a dissection before the beta-blocker or diltiazem — the learner\'s or a teammate\'s', () => {
    const torn = withProblems(['aortic-dissection'], { vitals: { sbp: 176, dbp: 98 } });
    expect(after(torn, ['nitro'])).toEqual(['vasodilator-before-rate-control']);
    expect(after(torn, ['nitro-high'])).toEqual(['vasodilator-before-rate-control']);
    expect(after(torn, ['iv', 'metoprolol', 'nitro'])).toEqual([]);
    expect(after(torn, ['iv', 'diltiazem', 'nitro'])).toEqual([]);
    const teammate = withProblems(['aortic-dissection'], {
      vitals: { sbp: 176, dbp: 98 }, extra: { events: [{ id: 'given', when: () => true, effect: () => ({ flags: ['beta-blocker'] }) }] },
    });
    expect(after(teammate, ['nitro'])).toEqual([]);
    // under 90 the low-pressure rule speaks
    expect(after(withProblems(['aortic-dissection'], { vitals: { sbp: 84, dbp: 50 } }), ['nitro'])).toEqual(['nitro-hypotension']);
    // nicardipine (an action still to come) is judged on this rank alone
    const s = start(torn, 2);
    expect(topNitrate(s, torn, 'nicardipine')).toBe('vasodilator-before-rate-control');
    expect(topNitrate({ ...s, flags: { ...s.flags, 'beta-blocker': 0 } }, torn, 'nicardipine')).toBeNull();
  });

  it('nitro-bradycardia: a rate under 50 that no pacer drives', () => {
    expect(after(patient({ rhythm: { profile: 'sinus-bradycardia', hr: 46 } }), ['nitro'])).toEqual(['nitro-bradycardia']);
    expect(after(patient({ rhythm: { profile: 'sinus-bradycardia', hr: 52 } }), ['nitro'])).toEqual([]);
    expect(after(patient({ rhythm: { profile: 'tcp', hr: 70 } }), ['nitro'])).toEqual([]);
  });

  it('nitro-pressure-fall: a sublingual dose with the systolic 30 or more below where it started', () => {
    const fallTo = (sbp: number, problems: Problem[] = []) => patient({
      vitals: { sbp: 150, dbp: 88 }, problems,
      extra: { events: [{ id: 'fall', when: (s) => s.minute >= 1, effect: () => ({ vitals: { sbp, dbp: 70 } }) }] },
    });
    expect(after(fallTo(118), ['nitro'])).toEqual(['nitro-pressure-fall']);
    expect(after(fallTo(122), ['nitro'])).toEqual([]);
    // not where lowering the pressure is the goal
    expect(after(fallTo(118, ['pulmonary-edema']), ['nitro-high'])).toEqual(['nitro-high-not-hypertensive']);
    // sublingual only: an intracoronary dose is the operator's
    const lab = fixture({ setting: 'cathlab', role: 5, rhythm: SINUS, vitals: { sbp: 150, dbp: 88, pain: 6 }, extra: { events: [{ id: 'fall', when: () => true, effect: () => ({ vitals: { sbp: 112, dbp: 70 } }) }] } });
    expect(penaltyIds(lab, 5, ['vitals', 'ic-nitro'])).toEqual([]);
  });

  it('nitro-inferior-no-v4r: an inferior STEMI on the monitor before the right-sided lead (field and ED)', () => {
    const inferior = patient({ rhythm: { profile: 'inferior-stemi', hr: 78 } });
    expect(after(inferior, ['nitro'])).toEqual(['nitro-inferior-no-v4r']);
    expect(after(inferior, ['ecg-right', 'nitro'])).toEqual([]);
    expect(after(patient({ rhythm: { profile: 'anterior-stemi', hr: 78 } }), ['nitro'])).toEqual([]);
    expect(after(fixture({ setting: 'ed', role: 7, rhythm: { profile: 'inferior-stemi-chb', hr: 78 }, vitals: { pain: 6 } }), ['nitro'], 7)).toEqual(['nitro-inferior-no-v4r']);
    expect(after(fixture({ setting: 'cathlab', role: 5, rhythm: { profile: 'inferior-stemi', hr: 78 }, vitals: { pain: 6 } }), ['nitro'], 5)).toEqual([]);
  });

  it('nitro-tachycardia: over 100 with no heart failure, pulmonary edema, stimulant or dissection', () => {
    const fast = (problems: Problem[] = []) => patient({ rhythm: { profile: 'sinus-tachycardia', hr: 112 }, problems });
    expect(after(fast(), ['nitro'])).toEqual(['nitro-tachycardia']);
    expect(after(patient({ rhythm: { profile: 'normal-sinus', hr: 100 } }), ['nitro'])).toEqual([]);
    for (const p of ['heart-failure', 'pulmonary-edema', 'sympathomimetic-toxicity'] as Problem[]) expect(after(fast([p]), ['nitro']), p).toEqual([]);
  });

  it('nitro-too-soon: a sublingual dose less than 3 minutes after the last', () => {
    expect(after(patient(), ['nitro', 'nitro'])).toEqual(['nitro-too-soon']);
    expect(after(patient({ vitals: { sbp: 180, dbp: 100 } }), ['nitro-high', 'nitro'])).toEqual(['nitro-too-soon']);
    expect(after(patient(), ['nitro', ...R(2), 'nitro'])).toEqual([]);
  });

  it('nitro-no-bp and nitro-no-pde5: the checks before a sublingual dose, in the field and the emergency department', () => {
    expect(penaltyIds(patient(), 2, ['ask-pde5', 'nitro'])).toEqual(['nitro-no-bp']);
    expect(penaltyIds(patient(), 2, ['vitals', 'nitro'])).toEqual(['nitro-no-pde5']);
    // a reassessment shows the pressure too
    expect(penaltyIds(patient(), 2, ['reassess', 'ask-pde5', 'nitro'])).toEqual([]);
    const ed = fixture({ setting: 'ed', role: 6, rhythm: SINUS, vitals: { pain: 6 } });
    expect(penaltyIds(ed, 6, ['nitro'])).toEqual(['nitro-no-bp']);
    // the lab's pressure is on the screen, and the operator's history is taken before the case
    expect(penaltyIds(fixture({ setting: 'cathlab', role: 5, rhythm: SINUS, vitals: { pain: 6 } }), 5, ['nitro'])).toEqual([]);
  });

  it('nitro-no-pain: nothing to treat — except the high pressure of pulmonary edema', () => {
    expect(after(patient({ vitals: { pain: 0 } }), ['nitro'])).toEqual(['nitro-no-pain']);
    expect(after(withProblems(['pulmonary-edema'], { vitals: { pain: 0, sbp: 182, dbp: 100 } }), ['nitro'])).toEqual([]);
  });

  it('no nitrate rule judges a dose in cardiac arrest (the no-role rule does)', () => {
    const arrest = fixture({ setting: 'field', role: 2, rhythm: { profile: 'vf', hr: 0 }, pulse: false, problems: ['pde5-inhibitor'] });
    const s = start(arrest, 2);
    for (const id of ['nitro', 'nitro-high', 'nitro-iv']) expect(topNitrate(s, arrest, id), id).toBeNull();
  });

  it('every nitrate dose earns at most one nitrate rule', () => {
    const messy = [
      withProblems(['pde5-inhibitor', 'tamponade'], { vitals: { sbp: 80, dbp: 50, pain: 0 } }),
      withProblems(['aortic-dissection'], { rhythm: { profile: 'sinus-bradycardia', hr: 44 }, vitals: { sbp: 150, dbp: 90 } }),
      patient({ rhythm: { profile: 'inferior-stemi', hr: 120 }, vitals: { sbp: 130, dbp: 80, pain: 0 } }),
    ];
    for (const sc of messy) {
      for (const id of ['nitro', 'nitro-high']) {
        const got = penaltyIds(sc, 2, [id, id]).filter((p) => NITRATE_RULES.includes(p));
        // two doses: at most one rule each
        expect(got.length, `${id}: ${got}`).toBeLessThanOrEqual(2);
        expect(penaltyIds(sc, 2, [id]).filter((p) => NITRATE_RULES.includes(p)).length, id).toBe(1);
      }
    }
  });
});

describe('the nitrate gate and the case rules', () => {
  const lowSlow = (harms: Harm[]) => patient({ rhythm: { profile: 'sinus-bradycardia', hr: 44 }, vitals: { sbp: 84, dbp: 50 }, harms });

  it('a case rule that replaces NITRATE_RULES covers the whole dose while it applies', () => {
    const covers = caseRule({ when: (s) => s.pulse, replaces: NITRATE_RULES });
    expect(penaltyIds(lowSlow([covers]), 2, ['nitro'])).toEqual(['case-nitro']);
    // while it does not apply, the built-ins judge again
    const later = caseRule({ when: (s) => 'later' in s.flags, replaces: NITRATE_RULES });
    expect(penaltyIds(lowSlow([later]), 2, ['nitro'])).toEqual(['nitro-hypotension']);
  });

  it('nitrateRulesExcept keeps the named built-ins charging beside the case rule', () => {
    const keepsLow = caseRule({ id: 'case-no-pain', replaces: nitrateRulesExcept('nitro-hypotension') });
    expect(penaltyIds(lowSlow([keepsLow]), 2, ['nitro'])).toEqual(['nitro-hypotension', 'case-no-pain']);
    expect(penaltyIds(patient({ rhythm: { profile: 'sinus-bradycardia', hr: 44 }, harms: [keepsLow] }), 2, ['nitro'])).toEqual(['case-no-pain']);
    expect(nitrateRulesExcept('nitro-hypotension')).not.toContain('nitro-hypotension');
  });

  it('a case rule with the id of the top rule covers the dose while it applies; an exemption passes the dose to the next rank', () => {
    const pde5 = withProblems(['pde5-inhibitor'], { vitals: { sbp: 84, dbp: 50 }, harms: [caseRule({ id: 'nitro-pde5', when: (s) => s.pulse })] });
    expect(after(pde5, ['nitro'])).toEqual(['nitro-pde5']);
    expect(pde5.harms[0].text).toBe('The case\'s own words.');
    const exempt = withProblems(['pde5-inhibitor'], { vitals: { sbp: 84, dbp: 50 }, harms: [caseRule({ id: 'nitro-pde5', when: () => false })] });
    expect(after(exempt, ['nitro'])).toEqual(['nitro-hypotension']);
    // a same-id rule speaks only for the actions it lists: an exemption for 'nitro' leaves the 0.8 mg dose to the built-in
    const nitroOnly = withProblems(['pde5-inhibitor'], { harms: [caseRule({ id: 'nitro-pde5', actions: ['nitro'], when: () => false })] });
    expect(after(nitroOnly, ['nitro'])).toEqual([]);
    expect(after(nitroOnly, ['nitro-high'])).toEqual(['nitro-pde5']);
  });

  it('a same-id case rule for another role leaves the built-in to this one', () => {
    const doctors = fixture({ setting: 'ed', role: 6, rhythm: SINUS, problems: ['pde5-inhibitor'], vitals: { pain: 6 }, harms: [caseRule({ id: 'nitro-pde5', roles: [7], when: () => false })] });
    expect(after(doctors, ['nitro'], 6)).toEqual(['nitro-pde5']);
  });

  it('the ER nurse\'s 0.8 mg without an order: the order rule alone, not also the 0.8 mg indication rule or one ranked under it', () => {
    const ed = fixture({ setting: 'ed', role: 6, rhythm: SINUS, vitals: { sbp: 150, dbp: 90, pain: 0 } });
    expect(after(ed, ['nitro-high'], 6)).toEqual(['rn-without-order-nitro-high']);
  });
});

describe('the nitrate rules in the cases', () => {
  it('the ER nurse\'s 0.8 mg after the tamponade is drained: her own rule, at the weight of the missing order', () => {
    const sc = SCENARIO_BY_ID['tamponade-ed'];
    const rn = sc.harms.find((h) => h.id === 'nitro-no-indication-rn')!;
    expect(rn).toMatchObject({ actions: ['nitro-high', 'nitro-iv'], roles: [6], points: 5, severity: 'major' });
    // (and her IV nitroglycerin, which needs an order too: the team rule judges only her 0.4 mg)
    expect(rn.replaces).toEqual(expect.arrayContaining([...NITRATE_RULES, 'rn-without-order-nitro-high', 'rn-without-order-nitro-iv']));
    expect(rn.text).toMatch(/tamponade/);
    expect(rn.text).toMatch(/no order/);
    const doctorDrained = ['perfusion', 'lungs', 'sample', 'pocus', 'fluid', 'pericardiocentesis'];
    const md = runScenario(sc, 7, [...doctorDrained, 'nitro-high']);
    expect(md.penalties.map((p) => p.id)).toEqual(['nitro-no-indication']);
  });

  it('the ED dissection: the case\'s 0.8 mg exemption leaves every other nitrate rule judging, and its own rules cover theirs', () => {
    const sc = SCENARIO_BY_ID['aortic-dissection-ed'];
    const rateControlled = ['opqrst', 'bp-both-arms', 'pocus', 'call-surgery', 'metoprolol', 'fentanyl'];
    // rate controlled and over 120: the 0.8 mg dose is allowed, but not without the PDE-5 question
    expect(runScenario(sc, 7, [...rateControlled, 'nitro-high']).penalties.map((p) => p.id)).toEqual(['nitro-no-pde5']);
    expect(runScenario(sc, 7, [...rateControlled, 'ask-pde5', 'nitro-high']).penalties.map((p) => p.id)).toEqual([]);
    // before the beta-blocker: the case's rule alone (it stands in for the built-in rate-control rule and the checks)
    expect(runScenario(sc, 7, ['opqrst', 'nitro-high']).penalties.map((p) => p.id)).toEqual(['vasodilator-before-rate-md']);
  });

  it('the NSTEMI\'s returning pain: a rate of 96 and the monitor\'s pressure, so her nitroglycerin is clean', () => {
    const sc = SCENARIO_BY_ID['nstemi-troponin-ed'];
    const s = runScenario(sc, 7, ['opqrst', 'sample', 'ecg-posterior', 'aspirin', 'heparin', 'troponin-repeat', ...R(4), 'consult-cardiology', 'admit', ...R(8)]);
    expect(s.flags['pain-back']).toBeDefined();
    expect(s.rhythm.hr).toBe(96);
    expect(s.flags.bp).toBeDefined();
  });
});

describe('the opioid and the sedatives', () => {
  const ivPatient = (over: Spec = {}) => patient(over);
  const slow = { profile: 'third-degree-avb', hr: 38 };

  it('sedationForProcedure: a cardioversion, torsades, the pads pacing or about to pace a slow rate — not a wire, not a slow rate alone', () => {
    const at = (rhythm: { profile: string; hr: number }, steps: string[] = [], over: Spec = {}) => {
      const sc = patient({ rhythm, ...over });
      return sedationForProcedure(runScenario(sc, 2, steps), sc);
    };
    // a tachycardia for the shock: unstable (a low pressure), or the pads on for it
    expect(at({ profile: 'avnrt', hr: 188 }, [], { vitals: { sbp: 84, dbp: 50 } })).toBe(true);
    expect(at({ profile: 'avnrt', hr: 188 }, ['pads'])).toBe(true);
    expect(at({ profile: 'torsades', hr: 220 })).toBe(true);
    expect(at({ profile: 'tcp', hr: 70 })).toBe(true);
    expect(at(slow, ['pads'])).toBe(true);
    expect(at(slow)).toBe(false);
    expect(at({ profile: 'paced', hr: 70 }, ['pads'])).toBe(false);
    expect(at(SINUS, ['pads'])).toBe(false);
  });

  it('sedationForProcedure: a stable tachycardia being slowed with drugs is no procedure; in the lab the standing pads say nothing about pacing', () => {
    const fast = patient({ rhythm: { profile: 'atrial-fibrillation', hr: 148 }, vitals: { pain: 0 } });
    expect(sedationForProcedure(runScenario(fast, 2, []), fast)).toBe(false);
    // the fentanyl it brings is judged like any other dose: no pain, no procedure
    expect(penaltyIds(fast, 2, ['iv', 'fentanyl'])).toEqual(['opioid-no-pain']);
    const lab = fixture({ setting: 'cathlab', role: 4, rhythm: slow, vitals: { sbp: 84, dbp: 52, pain: 6 }, extra: { events: [{ id: 'pads', when: () => true, effect: () => ({ flags: ['pads', 'monitor'] }) }] } });
    expect(sedationForProcedure(runScenario(lab, 4, []), lab)).toBe(false);
    expect(penaltyIds(lab, 4, ['iv', 'fentanyl'])).toEqual(['opioid-hypotension']);
    // the pads the learner puts on for pacing, or the pacer running, are the procedure there
    expect(penaltyIds(lab, 4, ['iv', 'pads', 'fentanyl'])).toEqual([]);
    const paced = fixture({ setting: 'cathlab', role: 4, rhythm: { profile: 'tcp', hr: 70 }, vitals: { sbp: 84, dbp: 52, pain: 6 } });
    expect(penaltyIds(paced, 4, ['iv', 'fentanyl'])).toEqual([]);
  });

  it('opioid-respiratory: breathing under 10, or a GCS of 8 or less with no airway and no procedure', () => {
    expect(penaltyIds(ivPatient({ vitals: { rr: 8 } }), 2, ['iv', 'fentanyl'])).toEqual(['opioid-respiratory']);
    expect(penaltyIds(ivPatient({ vitals: { gcs: 8 } }), 2, ['iv', 'fentanyl'])).toEqual(['opioid-respiratory']);
    expect(penaltyIds(ivPatient({ vitals: { gcs: 8 } }), 2, ['iv', 'airway', 'fentanyl'])).toEqual([]);
    expect(penaltyIds(ivPatient({ vitals: { rr: 12 } }), 2, ['iv', 'fentanyl'])).toEqual([]);
  });

  it('opioid-hypotension: a low pressure and no procedure; one dose, one penalty under the breathing rule', () => {
    expect(penaltyIds(ivPatient({ vitals: { sbp: 84, dbp: 50 } }), 2, ['iv', 'fentanyl'])).toEqual(['opioid-hypotension']);
    expect(penaltyIds(ivPatient({ vitals: { sbp: 92, dbp: 60 } }), 2, ['iv', 'fentanyl'])).toEqual([]);
    // analgesia for the pacer, even with a low pressure
    expect(penaltyIds(ivPatient({ rhythm: slow, vitals: { sbp: 78, dbp: 46 } }), 2, ['iv', 'pads', 'fentanyl'])).toEqual([]);
    // low, slow breathing and no pain: the breathing rule alone
    expect(penaltyIds(ivPatient({ vitals: { sbp: 80, dbp: 48, rr: 8, pain: 0 } }), 2, ['iv', 'fentanyl'])).toEqual(['opioid-respiratory']);
  });

  it('opioid-no-pain: nothing to treat and no procedure; the ER nurse without an order is the order rule alone', () => {
    expect(penaltyIds(ivPatient({ vitals: { pain: 0 } }), 2, ['iv', 'fentanyl'])).toEqual(['opioid-no-pain']);
    // analgesia for the cardioversion: the pads on for the shock
    expect(penaltyIds(ivPatient({ rhythm: { profile: 'avnrt', hr: 180 }, vitals: { pain: 0 } }), 2, ['iv', 'pads', 'fentanyl'])).toEqual([]);
    // after intubation the tube is what it treats (analgesia first for a ventilated patient)
    const intubated = fixture({ setting: 'ed', role: 7, rhythm: SINUS, vitals: { gcs: 7 } });
    expect(penaltyIds(intubated, 7, ['iv', 'monitor', 'rsi', 'fentanyl'])).toEqual([]);
    expect(penaltyIds(fixture({ setting: 'ed', role: 7, rhythm: SINUS }), 7, ['iv', 'fentanyl'])).toEqual(['opioid-no-pain']);
    const ed = fixture({ setting: 'ed', role: 6, rhythm: SINUS });
    expect(penaltyIds(ed, 6, ['iv', 'fentanyl'])).toEqual(['rn-without-order-fentanyl']);
  });

  it('a same-id case rule covers its rank of the opioid gate; an exemption passes the dose on', () => {
    const own = caseRule({ id: 'opioid-hypotension', actions: ['fentanyl'], when: (s) => s.pulse });
    expect(penaltyIds(ivPatient({ vitals: { sbp: 84, dbp: 50, pain: 0 }, harms: [own] }), 2, ['iv', 'fentanyl'])).toEqual(['opioid-hypotension']);
    const exempt = caseRule({ id: 'opioid-hypotension', actions: ['fentanyl'], when: () => false });
    expect(penaltyIds(ivPatient({ vitals: { sbp: 84, dbp: 50, pain: 0 }, harms: [exempt] }), 2, ['iv', 'fentanyl'])).toEqual(['opioid-no-pain']);
  });

  it('midazolam-unsafe: now also slow breathing, and a slow rate is a procedure only with the pads on (a wire needs no sedation)', () => {
    expect(penaltyIds(ivPatient({ vitals: { rr: 8 } }), 2, ['midazolam'])).toEqual(['midazolam-unsafe']);
    expect(penaltyIds(ivPatient({ rhythm: slow, vitals: { sbp: 84, dbp: 50 } }), 2, ['midazolam'])).toEqual(['midazolam-unsafe']);
    expect(penaltyIds(ivPatient({ rhythm: slow, vitals: { sbp: 84, dbp: 50 } }), 2, ['pads', 'midazolam'])).toEqual([]);
    expect(penaltyIds(ivPatient({ rhythm: { profile: 'paced', hr: 70 }, vitals: { sbp: 84, dbp: 50 } }), 2, ['midazolam'])).toEqual(['midazolam-unsafe']);
    expect(penaltyIds(ivPatient({ rhythm: { profile: 'avnrt', hr: 190 }, vitals: { sbp: 84, dbp: 50 } }), 2, ['midazolam'])).toEqual([]);
    // the emergency department's ventilated patient: sedated for the tube
    expect(penaltyIds(fixture({ setting: 'ed', role: 7, rhythm: SINUS, vitals: { gcs: 7 } }), 7, ['iv', 'airway', 'midazolam'])).toEqual([]);
  });

  it('a seizure under way: midazolam is its treatment, even drowsy or breathing poorly (not the other sedatives)', () => {
    const seizing = (vitals: Partial<Vitals>) => ivPatient({ problems: ['seizure'], vitals });
    expect(penaltyIds(seizing({ gcs: 8 }), 2, ['midazolam'])).toEqual([]);
    expect(penaltyIds(seizing({ rr: 8 }), 2, ['midazolam'])).toEqual([]);
    expect(penaltyIds(ivPatient({ vitals: { gcs: 8 } }), 2, ['midazolam'])).toEqual(['midazolam-unsafe']);
    expect(penaltyIds(seizing({ gcs: 8 }), 2, ['iv', 'sedation'])).toEqual(['sedation-unsafe']);
  });

  it('sedation-unsafe: the paramedic\'s and the lab\'s sedation, on the same predicate', () => {
    expect(penaltyIds(ivPatient({ vitals: { sbp: 84, dbp: 50 } }), 2, ['iv', 'sedation'])).toEqual(['sedation-unsafe']);
    expect(penaltyIds(ivPatient({ vitals: { gcs: 11 } }), 2, ['iv', 'sedation'])).toEqual(['sedation-unsafe']);
    expect(penaltyIds(ivPatient({ rhythm: { profile: 'avnrt', hr: 190 }, vitals: { sbp: 84, dbp: 50 } }), 2, ['iv', 'sedation'])).toEqual([]);
    expect(penaltyIds(ivPatient(), 2, ['iv', 'sedation'])).toEqual([]);
    const lab = fixture({ setting: 'cathlab', role: 4, rhythm: SINUS, vitals: { sbp: 82, dbp: 50 } });
    expect(penaltyIds(lab, 4, ['iv', 'sedation'])).toEqual(['sedation-unsafe']);
    // a case rule that lists SEDATIVE_RULES covers the dose
    const covers = caseRule({ id: 'case-sedation', actions: ['sedation'], when: (s) => s.pulse, replaces: SEDATIVE_RULES });
    expect(penaltyIds(ivPatient({ vitals: { sbp: 84, dbp: 50 }, harms: [covers] }), 2, ['iv', 'sedation'])).toEqual(['case-sedation']);
  });

  it('sedation-no-procedure: a slow rate counts once the pads are on for the pacer', () => {
    const block = fixture({ setting: 'ed', role: 7, rhythm: slow });
    expect(penaltyIds(block, 7, ['monitor', 'iv', 'procedural-sedation'])).toEqual(['sedation-no-procedure']);
    expect(penaltyIds(block, 7, ['monitor', 'pads', 'iv', 'procedural-sedation'])).toEqual([]);
  });

  it('the beta-blocker overdose: premedication for the pacer stays free before the pads, judged at the hand-off', () => {
    const sc = SCENARIO_BY_ID['beta-blocker-overdose-field'];
    const s = runScenario(sc, 2, ['iv', 'fentanyl', 'sedation']);
    expect(s.rhythm.hr).toBeLessThan(50);
    expect(s.penalties.map((p) => p.id)).toEqual([]);
  });
});

describe('no role in an arrest, and the antiemetic', () => {
  const arrest = (over: Spec = {}) => patient({ rhythm: { profile: 'vf', hr: 0 }, pulse: false, ...over });

  it('no-role-in-arrest: nitroglycerin, fentanyl, midazolam and ondansetron in cardiac arrest, once per case', () => {
    for (const id of ['nitro', 'nitro-high', 'midazolam']) expect(penaltyIds(arrest(), 2, [id]), id).toEqual(['no-role-in-arrest']);
    for (const id of ['fentanyl', 'ondansetron']) expect(penaltyIds(arrest(), 2, ['io', id]), id).toEqual(['no-role-in-arrest']);
    expect(penaltyIds(arrest(), 2, ['nitro', 'io', 'fentanyl'])).toEqual(['no-role-in-arrest']);
    expect(penaltyIds(fixture({ setting: 'cathlab', role: 5, rhythm: { profile: 'vf', hr: 0 }, pulse: false }), 5, ['ic-nitro'])).toEqual(['no-role-in-arrest']);
    // with a pulse it is the drug rules' to judge
    expect(penaltyIds(patient(), 2, [...CHECKED, 'nitro'])).toEqual([]);
  });

  it('a pulseless torsades: the long-QT rule speaks for ondansetron, not also the no-role rule', () => {
    const torsades = arrest({ rhythm: { profile: 'torsades', hr: 220 } });
    expect(penaltyIds(torsades, 2, ['io', 'ondansetron'])).toEqual(['ondansetron-long-qt']);
  });

  it('a case rule that lists NITRATE_RULES or SEDATIVE_RULES and applies in an arrest stands for the no-role rule', () => {
    const always = caseRule({ id: 'case-nitro', actions: ['nitro'], replaces: NITRATE_RULES });
    expect(penaltyIds(arrest({ harms: [always] }), 2, ['nitro'])).toEqual(['case-nitro']);
    const sedative = caseRule({ id: 'case-sedative', actions: ['midazolam'], replaces: SEDATIVE_RULES });
    expect(penaltyIds(arrest({ harms: [sedative] }), 2, ['midazolam'])).toEqual(['case-sedative']);
    expect(NITRATE_RULES).toContain('no-role-in-arrest');
    expect(SEDATIVE_RULES).toContain('no-role-in-arrest');
  });

  it('ondansetron-unmonitored: heart failure, a high potassium, a slow rate or AV block, off the monitor (not in the lab)', () => {
    expect(penaltyIds(patient({ problems: ['heart-failure'] }), 2, ['iv', 'ondansetron'])).toEqual(['ondansetron-unmonitored']);
    expect(penaltyIds(patient({ problems: ['hyperkalemia'] }), 2, ['iv', 'ondansetron'])).toEqual(['ondansetron-unmonitored']);
    expect(penaltyIds(patient({ rhythm: { profile: 'mobitz-ii', hr: 56 } }), 2, ['iv', 'ondansetron'])).toEqual(['ondansetron-unmonitored']);
    expect(penaltyIds(patient({ problems: ['heart-failure'] }), 2, ['iv', 'monitor', 'ondansetron'])).toEqual([]);
    expect(penaltyIds(patient(), 2, ['iv', 'ondansetron'])).toEqual([]);
    expect(penaltyIds(fixture({ setting: 'cathlab', role: 5, rhythm: SINUS, problems: ['heart-failure'] }), 5, ['iv', 'ondansetron'])).toEqual([]);
    // a long QT: the long-QT rule alone
    expect(penaltyIds(patient({ problems: ['heart-failure', 'long-qt'] }), 2, ['iv', 'ondansetron'])).toEqual(['ondansetron-long-qt']);
  });
});

describe('the fibrinolytic gate', () => {
  const STEMI = { profile: 'anterior-stemi', hr: 96 };
  /** The ER doctor's patient (a STEMI unless the test says otherwise), in a department that cannot reach PCI in time */
  const ed = ({ vitals, extra, ...over }: Spec = {}) =>
    fixture({ setting: 'ed', role: 7, rhythm: STEMI, ...over, vitals: { pain: 6, ...vitals }, extra: { noTimelyPci: true, ...extra } });
  const tnk = (sc: ReturnType<typeof fixture>, before: string[] = ['ecg12']) => penaltyIds(sc, sc.roles[0], [...before, 'iv', 'tnk']);

  it('a STEMI where PCI cannot happen in time, with nothing against it: no penalty', () => {
    expect(tnk(ed())).toEqual([]);
  });

  it('lytic-absolute: an intracranial bleed, a recent ischemic stroke, an intracranial lesion or trauma, active bleeding', () => {
    for (const p of ['intracranial-hemorrhage', 'recent-stroke', 'intracranial-risk', 'bleeding'] as Problem[]) expect(tnk(ed({ problems: [p] })), p).toEqual(['lytic-absolute']);
  });

  it('a stroke more than 3 months ago or a TIA is a relative contraindication, never an absolute one', () => {
    expect(tnk(ed({ problems: ['prior-stroke'] }))).toEqual(['lytic-relative']);
  });

  it('lytic-relative: an oral anticoagulant, recent surgery or bleeding, pregnancy — and more than 10 minutes of CPR for a STEMI', () => {
    for (const p of ['oral-anticoagulant', 'recent-surgery', 'recent-bleeding', 'pregnancy'] as Problem[]) expect(tnk(ed({ problems: [p] })), p).toEqual(['lytic-relative']);
    const sc = ed();
    const s = runScenario(sc, 7, ['ecg12', 'iv']);
    const relative = rule('lytic-relative');
    expect(relative.when!({ ...s, counts: { ...s.counts, cpr: 6 } }, sc, 'tnk')).toBe(true);
    expect(relative.when!({ ...s, counts: { ...s.counts, cpr: 5 } }, sc, 'tnk')).toBe(false);
    // a pulmonary embolism in arrest: the CPR is no reason to withhold it
    const pe = ed({ rhythm: SINUS, problems: ['pulmonary-embolism', 'pe-high-risk'] });
    const p = runScenario(pe, 7, ['iv']);
    expect(relative.when!({ ...p, counts: { ...p.counts, cpr: 8 } }, pe, 'tnk')).toBe(false);
  });

  it('lytic-hypertension: over 180 systolic or 110 diastolic, under the absolute ones', () => {
    expect(tnk(ed({ vitals: { sbp: 192, dbp: 104 } }))).toEqual(['lytic-hypertension']);
    expect(tnk(ed({ vitals: { sbp: 170, dbp: 114 } }))).toEqual(['lytic-hypertension']);
    expect(tnk(ed({ vitals: { sbp: 178, dbp: 104 } }))).toEqual([]);
    expect(tnk(ed({ vitals: { sbp: 192, dbp: 104 }, problems: ['bleeding'] }))).toEqual(['lytic-absolute']);
  });

  it('second-lytic: a second dose (each fibrinolytic is given once: here alteplase, then tenecteplase)', () => {
    const pe = fixture({ setting: 'ed', role: 7, rhythm: SINUS, problems: ['pulmonary-embolism', 'pe-high-risk'] });
    expect(penaltyIds(pe, 7, ['iv', 'alteplase', 'tnk'])).toEqual(['second-lytic']);
  });

  it('lytic-in-lab: in the cath lab; a case rule with its id says it in its own words', () => {
    const lab = fixture({ setting: 'cathlab', role: 5, rhythm: STEMI });
    expect(penaltyIds(lab, 5, ['iv', 'tnk'])).toEqual(['lytic-in-lab']);
    expect(penaltyIds(fixture({ setting: 'cathlab', role: 5, rhythm: STEMI, problems: ['bleeding'] }), 5, ['iv', 'tnk'])).toEqual(['lytic-absolute']);
    const stemiLab = SCENARIO_BY_ID['stemi-cathlab'];
    const s = runScenario(stemiLab, 5, ['tnk']);
    expect(s.penalties).toMatchObject([{ id: 'lytic-in-lab', text: expect.stringMatching(/primary PCI is happening/) }]);
  });

  it('lytic-pci-available: a STEMI in a department that can reach PCI in time', () => {
    expect(tnk(ed({ extra: { noTimelyPci: false } }))).toEqual(['lytic-pci-available']);
    // with a pulmonary embolism it is the embolism's lysis, not the STEMI's
    expect(tnk(ed({ extra: { noTimelyPci: false }, problems: ['pulmonary-embolism', 'pe-high-risk'] }))).toEqual([]);
  });

  it('lytic-no-indication: no STEMI, and no PE with cardiopulmonary failure (a PE in arrest counts)', () => {
    const sinus = (problems: Problem[] = [], pulse = true) => fixture({ setting: 'ed', role: 7, rhythm: pulse ? SINUS : { profile: 'pea', hr: 40 }, problems, pulse });
    expect(penaltyIds(sinus(), 7, ['iv', 'tnk'])).toEqual(['lytic-no-indication']);
    expect(penaltyIds(sinus(['pulmonary-embolism']), 7, ['iv', 'tnk'])).toEqual(['lytic-no-indication']);
    expect(penaltyIds(sinus(['pulmonary-embolism', 'pe-high-risk']), 7, ['iv', 'tnk'])).toEqual([]);
    expect(penaltyIds(sinus(['pulmonary-embolism'], false), 7, ['io', 'tnk'])).toEqual([]);
    expect(rule('lytic-no-indication').text).toMatch(/AHA\/ACC 2026: systemic lysis 3 — Harm in categories A–C/);
    // one dose, one penalty: no indication and a high pressure is the indication rule alone
    expect(penaltyIds(fixture({ setting: 'ed', role: 7, rhythm: SINUS, vitals: { sbp: 196, dbp: 112 } }), 7, ['iv', 'tnk'])).toEqual(['lytic-no-indication']);
  });

  it('the ER nurse\'s alteplase without an order: the critical order rule alone, not also the indication rule', () => {
    const rn = fixture({ setting: 'ed', role: 6, rhythm: SINUS });
    const s = runScenario(rn, 6, ['iv', 'alteplase']);
    expect(s.penalties).toMatchObject([{ id: 'rn-without-order-alteplase', points: 15, severity: 'critical' }]);
  });

  it('a case rule that lists LYTIC_RULES covers the dose; the dissection is ranked first', () => {
    const covers = caseRule({ id: 'case-lytic', actions: ['tnk'], points: 15, severity: 'critical', replaces: LYTIC_RULES });
    expect(penaltyIds(fixture({ setting: 'cathlab', role: 5, rhythm: STEMI, problems: ['bleeding'], harms: [covers] }), 5, ['iv', 'tnk'])).toEqual(['case-lytic']);
    expect(tnk(ed({ problems: ['aortic-dissection', 'bleeding'], vitals: { sbp: 196, dbp: 112 } }))).toEqual(['lytic-dissection']);
  });
});

describe('the antithrombotic gate', () => {
  /** The cardiologist's patient in the lab (every antithrombotic is offered there but aspirin's chewing is the ED's too) */
  const lab = (problems: Problem[] = [], over: Spec = {}) => fixture({ setting: 'cathlab', role: 5, rhythm: SINUS, problems, ...over });
  /** …and in the ED: an acute coronary syndrome, what heparin and a P2Y12 load are for there (antithrombotic-no-indication) */
  const ed = (problems: Problem[] = []) => fixture({ setting: 'ed', role: 7, rhythm: SINUS, problems: ['acs', ...problems] });
  const give = (sc: ReturnType<typeof fixture>, ...ids: string[]) => penaltyIds(sc, sc.roles[0], ['iv', ...ids]);

  it('no problem, no penalty', () => {
    for (const id of ['heparin', 'bivalirudin', 'gp2b3a', 'cangrelor', 'p2y12']) expect(give(lab(), id), id).toEqual([]);
    expect(give(ed(), 'aspirin')).toEqual([]);
  });

  it('antithrombotic-bleeding: every antiplatelet and anticoagulant with active bleeding', () => {
    for (const id of ['heparin', 'bivalirudin', 'gp2b3a', 'cangrelor', 'p2y12']) expect(give(lab(['bleeding']), id), id).toEqual(['antithrombotic-bleeding']);
    expect(give(ed(['bleeding']), 'aspirin')).toEqual(['antithrombotic-bleeding']);
  });

  it('heparin-hit: heparin with HIT — and with bleeding too, the HIT rule alone (the most serious reason first)', () => {
    expect(give(lab(['hit']), 'heparin')).toEqual(['heparin-hit']);
    expect(give(lab(['hit']), 'bivalirudin')).toEqual([]);
    expect(give(lab(['hit', 'bleeding']), 'heparin')).toEqual(['heparin-hit']);
    // bivalirudin is the anticoagulant for HIT: with bleeding it is the bleeding rule's
    expect(give(lab(['hit', 'bleeding']), 'bivalirudin')).toEqual(['antithrombotic-bleeding']);
  });

  it('aspirin-allergy: aspirin for a true allergy', () => {
    expect(give(ed(['aspirin-allergy']), 'aspirin')).toEqual(['aspirin-allergy']);
    expect(give(ed(['aspirin-allergy']), 'p2y12')).toEqual([]);
  });

  it('antithrombotic-tamponade: an anticoagulant or a P2Y12 load in tamponade (aspirin is the case\'s)', () => {
    for (const id of ['heparin', 'p2y12']) expect(give(ed(['tamponade']), id), id).toEqual(['antithrombotic-tamponade']);
    expect(give(lab(['tamponade']), 'gp2b3a')).toEqual(['antithrombotic-tamponade']);
    expect(give(ed(['tamponade']), 'aspirin')).toEqual([]);
  });

  it('gp-thrombocytopenia: eptifibatide under 100,000 platelets (its label); unfractionated heparin is not held for that count', () => {
    expect(give(lab(['thrombocytopenia']), 'gp2b3a')).toEqual(['gp-thrombocytopenia']);
    expect(give(lab(['thrombocytopenia']), 'heparin')).toEqual([]);
    expect(give(lab(['thrombocytopenia']), 'cangrelor')).toEqual([]);
    expect(rule('gp-thrombocytopenia').actions).toEqual(['gp2b3a']);
    expect(BUILT_IN_HARMS.some((h) => h.id === 'heparin-thrombocytopenia')).toBe(false);
  });

  it('gp-contraindicated, gp-after-lytic and gp-hypertension: eptifibatide\'s label', () => {
    // surgery 3 to 6 weeks ago is past a lytic's window but within eptifibatide's (Integrilin label: 6 weeks)
    for (const p of ['recent-stroke', 'recent-surgery', 'surgery-within-6-weeks', 'recent-bleeding', 'dialysis'] as Problem[]) {
      expect(give(lab([p]), 'gp2b3a'), p).toEqual(['gp-contraindicated']);
    }
    // a bleed in the head is every antithrombotic's contraindication, ranked over the label's list (one dose, one penalty)
    expect(give(lab(['intracranial-hemorrhage']), 'gp2b3a')).toEqual(['antithrombotic-intracranial']);
    expect(give(lab(['renal-failure']), 'gp2b3a')).toEqual([]);
    expect(give(lab(), 'tnk', 'gp2b3a')).toEqual(['lytic-in-lab', 'gp-after-lytic']);
    expect(give(lab([], { vitals: { sbp: 208, dbp: 104 } }), 'gp2b3a')).toEqual(['gp-hypertension']);
    expect(give(lab([], { vitals: { sbp: 186, dbp: 114 } }), 'gp2b3a')).toEqual(['gp-hypertension']);
    expect(give(lab([], { vitals: { sbp: 196, dbp: 108 } }), 'gp2b3a')).toEqual([]);
  });

  it('double-anticoagulant: heparin on top of running bivalirudin (switching the other way is accepted practice)', () => {
    expect(give(lab(), 'bivalirudin', 'heparin')).toEqual(['double-anticoagulant']);
    expect(give(lab(), 'heparin', 'bivalirudin')).toEqual([]);
    // the stent thrombosis case says it in its own words
    const st = SCENARIO_BY_ID['stent-thrombosis-cathlab'];
    expect(st.harms.some((h) => h.id === 'double-anticoagulant')).toBe(true);
  });

  it('heparin-after-lmwh: unfractionated heparin within 12 hours of enoxaparin', () => {
    expect(give(lab(['lmwh-on-board']), 'heparin')).toEqual(['heparin-after-lmwh']);
    expect(give(lab(['lmwh-on-board']), 'bivalirudin')).toEqual([]);
  });

  it('one dose, one penalty: HIT first, then the bleeding, then the dissection', () => {
    expect(give(lab(['aortic-dissection', 'bleeding', 'hit', 'thrombocytopenia']), 'heparin')).toEqual(['heparin-hit']);
    expect(give(lab(['aortic-dissection', 'bleeding', 'thrombocytopenia']), 'heparin')).toEqual(['antithrombotic-bleeding']);
    expect(give(lab(['aortic-dissection', 'tamponade']), 'heparin')).toEqual(['antithrombotic-dissection']);
    expect(give(lab(['bleeding', 'dialysis', 'thrombocytopenia'], { vitals: { sbp: 210, dbp: 120 } }), 'gp2b3a')).toEqual(['antithrombotic-bleeding']);
  });

  it('a case rule that lists ANTITHROMBOTIC_RULES covers the dose', () => {
    const covers = caseRule({ id: 'case-heparin', actions: ['heparin'], replaces: ANTITHROMBOTIC_RULES });
    expect(give(lab(['bleeding'], { harms: [covers] }), 'heparin')).toEqual(['case-heparin']);
    const perforation = SCENARIO_BY_ID['perforation-cathlab'];
    expect(perforation.harms.find((h) => h.id === 'more-heparin')!.replaces).toEqual(ANTITHROMBOTIC_RULES);
  });
});

describe('the protamine gate', () => {
  /** A lab patient with heparin on board unless the test says otherwise */
  const lab = (problems: Problem[] = [], flags: string[] = ['heparin']) => fixture({
    setting: 'cathlab', role: 5, rhythm: SINUS, problems,
    extra: { events: [{ id: 'setup', when: () => true, effect: () => ({ flags }) }] },
  });
  const protamine = (sc: ReturnType<typeof fixture>) => penaltyIds(sc, 5, ['iv', 'protamine']);

  it('after the heparin, with the PCI finished and nothing against it: no penalty', () => {
    expect(protamine(lab())).toEqual([]);
    expect(protamine(lab([], ['heparin', 'wired', 'final-angio']))).toEqual([]);
  });

  it('protamine-allergy: an earlier reaction to it', () => {
    expect(protamine(lab(['protamine-allergy']))).toEqual(['protamine-allergy']);
  });

  it('protamine-mid-pci: the wire across and no final angiogram — unless it is for bleeding', () => {
    expect(protamine(lab([], ['heparin', 'wired']))).toEqual(['protamine-mid-pci']);
    expect(protamine(lab(['bleeding'], ['heparin', 'wired']))).toEqual([]);
  });

  it('protamine-no-heparin: nothing to reverse — heparin given before the case counts', () => {
    expect(protamine(lab([], []))).toEqual(['protamine-no-heparin']);
    expect(protamine(lab([], ['bivalirudin']))).toEqual(['protamine-no-heparin']);
    expect(protamine(lab(['heparin-on-board'], []))).toEqual([]);
  });

  it('protamine-sensitized: NPH insulin, an earlier dose, a fish allergy or a vasectomy, without bleeding', () => {
    expect(protamine(lab(['protamine-sensitized']))).toEqual(['protamine-sensitized']);
    expect(protamine(lab(['protamine-sensitized', 'bleeding']))).toEqual([]);
  });

  it('one dose, one penalty: the allergy first', () => {
    expect(protamine(lab(['protamine-allergy', 'protamine-sensitized'], ['wired']))).toEqual(['protamine-allergy']);
    expect(protamine(lab(['protamine-sensitized'], ['wired']))).toEqual(['protamine-mid-pci']);
  });

  it('the cases\' own protamine rules stand in for the gate', () => {
    // same id: the vasovagal case's no-heparin rule (the nurse and the cardiologist)
    const vasovagal = SCENARIO_BY_ID['vasovagal-sheath-cathlab'];
    expect(runScenario(vasovagal, 5, ['protamine']).penalties.map((p) => p.id)).toEqual(['protamine-no-heparin']);
    // the list: a stent thrombosis is reversed in no state
    const st = SCENARIO_BY_ID['stent-thrombosis-cathlab'];
    expect(st.harms.find((h) => h.id === 'protamine-in-thrombosis')!.replaces).toEqual(PROTAMINE_RULES);
    const covers = caseRule({ id: 'case-protamine', actions: ['protamine'], replaces: PROTAMINE_RULES });
    expect(penaltyIds(fixture({ setting: 'cathlab', role: 5, rhythm: SINUS, problems: ['protamine-allergy'], harms: [covers] }), 5, ['iv', 'protamine'])).toEqual(['case-protamine']);
  });
});

describe('review fixes: the nitrate gate', () => {
  const fallFrom = (opening: number, to: number, problems: Problem[] = []) => patient({
    vitals: { sbp: opening, dbp: 92 }, problems,
    extra: { events: [{ id: 'fall', when: (s) => s.minute >= 1, effect: () => ({ vitals: { sbp: to, dbp: 70 } }) }] },
  });

  it('nitro-pressure-fall: not for a pressure that opened high, or a stimulant\'s pressure being brought down', () => {
    expect(after(fallFrom(150, 118), ['nitro'])).toEqual(['nitro-pressure-fall']);
    expect(after(fallFrom(178, 140), ['nitro'])).toEqual([]);
    expect(after(fallFrom(150, 118, ['sympathomimetic-toxicity']), ['nitro'])).toEqual([]);
    expect(rule('nitro-pressure-fall').text).toMatch(/^Nitroglycerin with the systolic 30 mmHg or more below where it started/);
  });

  it('the cocaine case: the repeat dose for pain that is left, after midazolam brought the pressure down, costs nothing', () => {
    const sc = SCENARIO_BY_ID['cocaine-chest-pain-field'];
    const s = runScenario(sc, 2, ['primary', 'vitals', 'perfusion', 'sample', 'midazolam', 'monitor', 'ecg12', 'opqrst', 'aspirin', 'ask-pde5', 'iv', 'midazolam', 'nitro']);
    expect(s.penalties.map((p) => p.id)).not.toContain('nitro-pressure-fall');
    expect(sc.initial.vitals.sbp - s.vitals.sbp).toBeGreaterThanOrEqual(30);
  });

  it('nitro-volume-depleted: a bleeding patient with a pressure still at 90 or more; under 90 the low-pressure rule', () => {
    expect(after(withProblems(['bleeding'], { vitals: { sbp: 96, dbp: 60 } }), ['nitro'])).toEqual(['nitro-volume-depleted']);
    expect(after(withProblems(['bleeding'], { vitals: { sbp: 84, dbp: 50 } }), ['nitro'])).toEqual(['nitro-hypotension']);
    const lab = fixture({ setting: 'cathlab', role: 5, rhythm: SINUS, problems: ['bleeding'], vitals: { sbp: 104, dbp: 62, pain: 4 } });
    expect(penaltyIds(lab, 5, ['ic-nitro'])).toEqual(['nitro-volume-depleted']);
    expect(after(patient({ vitals: { sbp: 96, dbp: 60 } }), ['nitro'])).toEqual([]);
  });

  it('the order of the 3- and 5-point ranks: the pressure check over the 0.8 mg dose rule, the fast rate, no pain, the interval and the PDE-5 question', () => {
    expect(penaltyIds(patient({ rhythm: { profile: 'sinus-tachycardia', hr: 112 } }), 2, ['ask-pde5', 'nitro'])).toEqual(['nitro-no-bp']);
    expect(penaltyIds(patient({ vitals: { pain: 0 } }), 2, ['ask-pde5', 'nitro'])).toEqual(['nitro-no-bp']);
    // 0.8 mg with no pressure taken: the learner cannot know the pressure is high enough for it — the check (5), never the
    // 0.8 mg rule (3) alone: the larger dose given blind never costs less than the standard one
    expect(penaltyIds(patient({ vitals: { sbp: 150, dbp: 90 } }), 2, ['ask-pde5', 'nitro-high'])).toEqual(['nitro-no-bp']);
    expect(penaltyIds(patient({ vitals: { sbp: 150, dbp: 90 } }), 2, ['ask-pde5', 'nitro'])).toEqual(['nitro-no-bp']);
    // with the pressure taken, the 0.8 mg rule judges the dose
    expect(penaltyIds(patient({ vitals: { sbp: 150, dbp: 90 } }), 2, ['vitals', 'ask-pde5', 'nitro-high'])).toEqual(['nitro-high-not-hypertensive']);
    // no indication before the PDE-5 question and the interval
    expect(penaltyIds(patient({ vitals: { pain: 0 } }), 2, ['vitals', 'nitro'])).toEqual(['nitro-no-pain']);
    expect(after(patient(), ['nitro', 'nitro'])).toEqual(['nitro-too-soon']);
  });

  it('a later dose is judged by the next reason that holds: the first reason charged once does not hide the rest', () => {
    const pde5Low = withProblems(['pde5-inhibitor'], { extra: { events: [{ id: 'fall', when: (s) => s.minute >= 3, effect: () => ({ vitals: { sbp: 84, dbp: 50 } }) }] } });
    expect(after(pde5Low, ['nitro', 'reassess', 'nitro'])).toEqual(['nitro-pde5', 'nitro-hypotension']);
    // the walk-in STEMI on sildenafil: the case's PDE-5 rule, then the pressure it crashed
    const walkIn = SCENARIO_BY_ID['stemi-walk-in-ed'];
    expect(runScenario(walkIn, 7, ['vitals', 'nitro', 'reassess', 'nitro']).penalties.map((p) => p.id)).toEqual(['nitro-pde5', 'nitro-hypotension']);
    // two doses, two penalties at most: each one rule. The first dose on top of the PDE-5 inhibitor crashes the pressure (the
    // nitrate default's response), so the second, though too soon as well, is judged by the low pressure, the higher rank
    expect(after(pde5Low, ['nitro', 'nitro'])).toEqual(['nitro-pde5', 'nitro-hypotension']);
    expect(after(patient(), ['nitro', 'nitro'])).toEqual(['nitro-too-soon']);
  });

  it('nitro-too-soon: a teammate\'s dose counts; the learner\'s own dose counts from when it was given', () => {
    const teammate = patient({ extra: { events: [{ id: 'crew', when: (s) => s.minute >= 1, effect: () => ({ flags: ['nitro'] }) }] } });
    expect(after(teammate, ['nitro'])).toEqual(['nitro-too-soon']);
    expect(after(teammate, ['reassess', 'reassess', 'nitro'])).toEqual([]);
    // 3 minutes after the first dose was given (its effect lands half a minute later): not too soon
    expect(after(patient(), ['nitro', 'reassess', 'aspirin', 'nitro'])).toEqual([]);
  });
});

describe('review fixes: a case\'s own nitrate rule keeps the gate\'s order', () => {
  const noPde5 = nitrateCheckRule({ id: 'nitro-no-pde5', actions: ['nitro', 'nitro-high'], when: (s) => !('pde5-asked' in s.flags), points: 3, severity: 'minor', text: 'The case\'s PDE-5 question.' });
  const noBp = nitrateCheckRule({ id: 'nitro-no-bp', actions: ['nitro', 'nitro-high'], when: (s) => !('bp' in s.flags), points: 5, severity: 'major', text: 'The case\'s pressure check.' });
  const checked = (over: Spec = {}) => patient({ ...over, harms: [noBp, noPde5] });

  it('a check gives way to a contraindication ranked above it: skipping the question is never cheaper than asking it', () => {
    const slow = { profile: 'sinus-bradycardia', hr: 44 };
    expect(penaltyIds(checked({ rhythm: slow }), 2, ['vitals', 'nitro'])).toEqual(['nitro-bradycardia']);
    expect(penaltyIds(checked({ rhythm: slow }), 2, ['vitals', 'ask-pde5', 'nitro'])).toEqual(['nitro-bradycardia']);
    // one dose, one penalty: the checks are one gate, as the built-in ranks are — the pressure first, then the PDE-5 question
    expect(penaltyIds(checked(), 2, ['nitro'])).toEqual(['nitro-no-bp']);
    expect(penaltyIds(checked(), 2, ['vitals', 'nitro'])).toEqual(['nitro-no-pde5']);
    // and a check gives way to the low-pressure rule and the 0.8 mg dose rule ranked above it
    expect(penaltyIds(checked({ vitals: { sbp: 84, dbp: 50 } }), 2, ['vitals', 'nitro'])).toEqual(['nitro-hypotension']);
    expect(penaltyIds(checked({ vitals: { sbp: 150, dbp: 90 } }), 2, ['vitals', 'nitro-high'])).toEqual(['nitro-high-not-hypertensive']);
    // …and is judged anew on a later dose once that rank has charged
    expect(penaltyIds(checked({ vitals: { sbp: 150, dbp: 90 } }), 2, ['vitals', 'nitro-high', 'reassess', 'reassess', 'nitro-high']))
      .toEqual(['nitro-high-not-hypertensive', 'nitro-no-pde5']);
  });

  it('a check stands aside once it has charged: a later dose is judged by the gate again', () => {
    const falls = checked({ vitals: { sbp: 150, dbp: 90 }, extra: { events: [{ id: 'fall', when: (s) => s.minute >= 5, effect: () => ({ vitals: { sbp: 112, dbp: 70 } }) }] } });
    expect(penaltyIds(falls, 2, ['vitals', 'nitro', 'reassess', 'reassess', 'nitro'])).toEqual(['nitro-no-pde5', 'nitro-pressure-fall']);
  });

  it('in an arrest the no-role rule speaks, not the checks', () => {
    const arrest = patient({ rhythm: { profile: 'vf', hr: 0 }, pulse: false, harms: [noBp, noPde5] });
    expect(penaltyIds(arrest, 2, ['nitro'])).toEqual(['no-role-in-arrest']);
  });

  it('a check gives way to another case rule that stands for a contraindication above it (one dose, one penalty)', () => {
    const lowRule: Harm = { id: 'case-low', actions: ['nitro'], when: (s) => s.vitals.sbp < 100, points: 8, severity: 'major', replaces: NITRATE_RULES, text: 'The case\'s low pressure.' };
    const sc = patient({ rhythm: { profile: 'sinus-bradycardia', hr: 44 }, vitals: { sbp: 96, dbp: 60 }, harms: [lowRule, noPde5] });
    expect(penaltyIds(sc, 2, ['vitals', 'nitro'])).toEqual(['case-low']);
  });

  it('a rule with another id stands for its rank and those under it every time, and gives way to a contraindication above', () => {
    const noIndication = nitrateCaseRule({ id: 'case-no-indication', actions: ['nitro', 'nitro-high'], when: (s) => s.vitals.sbp >= 90, points: 3, severity: 'minor', text: 'No chest pain here.' }, 'nitro-high-not-hypertensive');
    expect(noIndication.replaces).toEqual(expect.arrayContaining(['nitro-high-not-hypertensive', 'nitro-tachycardia', 'nitro-no-pain', 'nitro-no-bp', 'nitro-too-soon', 'nitro-no-pde5']));
    expect(noIndication.replaces).not.toContain('nitro-bradycardia');
    const sc = (rhythm = SINUS) => patient({ rhythm, vitals: { pain: 0 }, harms: [noIndication] });
    expect(penaltyIds(sc(), 2, ['vitals', 'nitro', 'nitro-high'])).toEqual(['case-no-indication']);
    // with no pressure taken it gives way to the pressure check, ranked above it, on the first dose: the second is its own
    expect(penaltyIds(sc(), 2, ['nitro', 'nitro-high'])).toEqual(['nitro-no-bp', 'case-no-indication']);
    expect(penaltyIds(sc({ profile: 'sinus-bradycardia', hr: 44 }), 2, ['vitals', 'nitro'])).toEqual(['nitro-bradycardia']);
    expect(() => nitrateCaseRule({ ...noIndication, id: 'x' }, 'not-a-rank')).toThrow();
  });

  it('in the cases: the anterior STEMI\'s third dose after the fall is charged whether or not the PDE-5 question was asked', () => {
    const sc = SCENARIO_BY_ID['stemi-anterior-field'];
    const doses = ['nitro-high', ...R(3), 'nitro-high', ...R(3), 'nitro-high'];
    expect(runScenario(sc, 2, ['vitals', ...doses]).penalties.map((p) => p.id)).toEqual(['nitro-high-not-hypertensive', 'nitro-no-pde5', 'nitro-pressure-fall']);
    expect(runScenario(sc, 2, ['vitals', 'ask-pde5', ...doses]).penalties.map((p) => p.id)).toEqual(['nitro-high-not-hypertensive', 'nitro-pressure-fall']);
  });

  it('in the cases: nitroglycerin in the vasovagal reaction with a rate under 50 is the bradycardia rule, not the minor no-indication rule', () => {
    const sc = SCENARIO_BY_ID['vasovagal-sheath-cathlab'];
    const s = runScenario(sc, 5, ['legs-up', 'fluid', 'fluid', 'nitro']);
    expect(s.vitals.sbp).toBeGreaterThanOrEqual(88);
    expect(s.penalties.map((p) => p.id)).toEqual(['nitro-bradycardia']);
  });
});

describe('review fixes: the other gates', () => {
  const STEMI = { profile: 'anterior-stemi', hr: 96 };
  const ed = ({ vitals, extra, ...over }: Spec = {}) =>
    fixture({ setting: 'ed', role: 7, rhythm: STEMI, ...over, vitals: { pain: 6, ...vitals }, extra: { noTimelyPci: true, ...extra } });
  const tnk = (sc: ReturnType<typeof fixture>, before: string[] = ['ecg12']) => penaltyIds(sc, sc.roles[0], [...before, 'iv', 'tnk']);

  it('lytic-absolute: a stroke under way now; lytic-relative: platelets under 100,000', () => {
    expect(tnk(ed({ problems: ['stroke'] }))).toEqual(['lytic-absolute']);
    expect(tnk(ed({ problems: ['thrombocytopenia'] }))).toEqual(['lytic-relative']);
    expect(rule('lytic-relative').text).toMatch(/TNKase label lists any earlier stroke/);
  });

  it('lytic-uncontrolled-hypertension: still over 180/110 after IV treatment is absolute (15, critical); untreated it is relative', () => {
    const high = ed({ vitals: { sbp: 196, dbp: 112 } });
    expect(tnk(high)).toEqual(['lytic-hypertension']);
    const s = runScenario(high, 7, ['ecg12', 'iv', 'metoprolol', 'tnk']);
    expect(s.vitals.sbp > 180 || s.vitals.dbp > 110).toBe(true);
    expect(s.penalties.filter((p) => LYTIC_RULES.includes(p.id))).toMatchObject([{ id: 'lytic-uncontrolled-hypertension', points: 15, severity: 'critical' }]);
  });

  it('lytic-relative: not counted against the lysis of a pulmonary embolism in shock or in arrest', () => {
    const pe = (pulse = true) => fixture({ setting: 'ed', role: 7, rhythm: pulse ? SINUS : { profile: 'pea', hr: 40 }, pulse, problems: ['pulmonary-embolism', 'pe-high-risk', 'recent-surgery'] });
    expect(penaltyIds(pe(), 7, ['iv', 'alteplase'])).toEqual([]);
    expect(penaltyIds(pe(false), 7, ['io', 'alteplase'])).toEqual([]);
    // a STEMI with recent surgery still counts
    expect(tnk(ed({ problems: ['recent-surgery'] }))).toEqual(['lytic-relative']);
  });

  it('the periprocedural stroke: the case\'s lab rule is the one penalty for the lytic, the stroke under way included', () => {
    const sc = SCENARIO_BY_ID['periprocedural-stroke-cathlab'];
    expect(sc.problems).toContain('stroke');
    expect(runScenario(sc, 5, ['tnk']).penalties.map((p) => p.id)).toEqual(['lytic-in-lab']);
  });

  it('gp-contraindicated: a stroke under way; protamine for enoxaparin within 12 hours has something to reverse', () => {
    const lab = (problems: Problem[], flags: string[] = []) => fixture({ setting: 'cathlab', role: 5, rhythm: SINUS, problems, extra: { events: [{ id: 'setup', when: () => true, effect: () => ({ flags }) }] } });
    // a stroke under way, not yet scanned: every antithrombotic's contraindication, ranked over eptifibatide's own label list
    expect(penaltyIds(lab(['stroke']), 5, ['iv', 'gp2b3a'])).toEqual(['antithrombotic-intracranial']);
    expect(penaltyIds(lab(['lmwh-on-board']), 5, ['iv', 'protamine'])).toEqual([]);
    expect(rule('protamine-no-heparin').text).toMatch(/only partly for enoxaparin/);
    expect(rule('protamine-sensitized').text).toMatch(/pulmonary hypertension/);
    expect(rule('aspirin-allergy').text).toMatch(/2014 AHA\/ACC NSTE-ACS/);
  });

  it('ondansetron-unmonitored: the label\'s patients — a low potassium, magnesium or calcium, or another QT-prolonging drug on board', () => {
    for (const p of ['hypokalemia', 'hypomagnesemia', 'hypocalcemia'] as Problem[]) expect(penaltyIds(patient({ problems: [p] }), 2, ['iv', 'ondansetron']), p).toEqual(['ondansetron-unmonitored']);
    expect(penaltyIds(patient(), 2, ['iv', 'procainamide', 'ondansetron'])).toContain('ondansetron-unmonitored');
    expect(penaltyIds(patient({ problems: ['hypokalemia'] }), 2, ['iv', 'monitor', 'ondansetron'])).toEqual([]);
  });

  it('the ED hyperkalemia case: analgesia after the intubation is no "opioid with no pain"', () => {
    const sc = SCENARIO_BY_ID['hyperkalemia-ed'];
    expect(runScenario(sc, 7, ['monitor', 'iv', 'rsi', 'fentanyl']).penalties.map((p) => p.id)).not.toContain('opioid-no-pain');
    expect(runScenario(sc, 7, ['monitor', 'iv', 'fentanyl']).penalties.map((p) => p.id)).toContain('opioid-no-pain');
  });
});

describe('review round: contraindications that went free, and correct care that was charged', () => {
  const flagged = (...flags: string[]) => ({ events: [{ id: 'setup', when: () => true, effect: () => ({ flags }) }] });
  const lab = (over: Partial<FixtureSpec> = {}) => fixture({ setting: 'cathlab', role: 5, rhythm: SINUS, ...over });
  const ed = (over: Partial<FixtureSpec> = {}) => fixture({ setting: 'ed', role: 7, rhythm: SINUS, ...over });
  const R = (n: number) => Array<string>(n).fill('reassess');

  it('antithrombotic-tamponade: a tamponade that began mid-case (the flag) counts, drained or not', () => {
    expect(penaltyIds(lab({ extra: flagged('tamponade') }), 5, ['iv', 'p2y12'])).toEqual(['antithrombotic-tamponade']);
    expect(penaltyIds(lab({ extra: flagged('tamponade', 'drained') }), 5, ['iv', 'heparin'])).toEqual(['antithrombotic-tamponade']);
    expect(penaltyIds(lab(), 5, ['iv', 'p2y12'])).toEqual([]);
    // the temporary wire's perforation: the P2Y12 load into the new tamponade is charged
    const tw = SCENARIO_BY_ID['heart-block-temp-wire-cathlab'];
    const perforated = runScenario(tw, 5, ['consent', 'pads', 'timeout', 'access-femoral', 'access-venous', 'temp-wire', ...R(5)]);
    expect(perforated.flags.tamponade).toBeDefined();
    expect(runScenario(tw, 5, ['consent', 'pads', 'timeout', 'access-femoral', 'access-venous', 'temp-wire', ...R(5), 'p2y12']).penalties.map((p) => p.id))
      .toContain('antithrombotic-tamponade');
  });

  it('antithrombotic-intracranial: a bleed in the head or a stroke not yet scanned rules every antithrombotic out (heparin-hit first)', () => {
    for (const id of ['aspirin', 'heparin', 'p2y12', 'bivalirudin', 'cangrelor', 'gp2b3a']) {
      expect(penaltyIds(lab({ problems: ['intracranial-hemorrhage'] }), 5, ['iv', id]), id).toEqual(['antithrombotic-intracranial']);
    }
    expect(penaltyIds(ed({ problems: ['stroke', 'acs'] }), 7, ['iv', 'aspirin'])).toEqual(['antithrombotic-intracranial']);
    expect(penaltyIds(lab({ problems: ['intracranial-hemorrhage', 'hit'] }), 5, ['iv', 'heparin'])).toEqual(['heparin-hit']);
    expect(penaltyIds(lab({ problems: ['prior-stroke'] }), 5, ['iv', 'heparin'])).toEqual([]);
  });

  it('antithrombotic-no-indication: heparin or a P2Y12 load outside the lab needs an ACS, a PE, AF or flutter, or another declared reason', () => {
    expect(penaltyIds(ed(), 7, ['iv', 'heparin'])).toEqual(['antithrombotic-no-indication']);
    expect(penaltyIds(ed(), 7, ['iv', 'p2y12'])).toEqual(['antithrombotic-no-indication']);
    for (const problems of [['acs'], ['pulmonary-embolism'], ['af-over-48h'], ['anticoagulation-indicated']] as Problem[][]) {
      expect(penaltyIds(ed({ problems }), 7, ['iv', 'heparin']), problems[0]).toEqual([]);
    }
    expect(penaltyIds(ed({ rhythm: { profile: 'atrial-fibrillation', hr: 110 } }), 7, ['iv', 'heparin'])).toEqual([]);
    // in the lab the PCI is the indication; aspirin is not judged by it
    expect(penaltyIds(lab(), 5, ['iv', 'heparin'])).toEqual([]);
    expect(penaltyIds(ed(), 7, ['iv', 'aspirin'])).toEqual([]);
    // the ER nurse with no order: the missing order covers the indication (one act, one penalty)
    expect(penaltyIds(fixture({ setting: 'ed', role: 6, rhythm: SINUS }), 6, ['iv', 'heparin'])).toEqual(['rn-without-order-heparin']);
    // the complete heart block in the ED: a P2Y12 load before the line and the wire
    expect(runScenario(SCENARIO_BY_ID['complete-heart-block-ed'], 7, ['p2y12']).penalties.map((p) => p.id)).toEqual(['antithrombotic-no-indication']);
  });

  it('opioid-no-pain: fentanyl for a cath-lab procedure under way is moderate sedation, not a mistake; after hemostasis it is', () => {
    const ffr = SCENARIO_BY_ID['ffr-cathlab'];
    expect(runScenario(ffr, 4, ['consent', 'iv', 'timeout', 'fentanyl']).penalties).toEqual([]);
    expect(runScenario(ffr, 5, ['consent', 'fentanyl']).penalties).toEqual([]);
    const done = ['consent', 'iv', 'timeout', 'sedation', 'reassess', 'radial-cocktail', 'heparin', 'act', 'ic-nitro', 'adenosine-iv-ffr', 'reassess', 'p2y12', ...R(2), 'hemostasis'];
    expect(runScenario(ffr, 4, [...done, 'fentanyl']).penalties.map((p) => p.id)).toEqual(['opioid-no-pain']);
    // a lab patient not yet consented or timed out, with no pain: still charged
    expect(penaltyIds(lab(), 5, ['iv', 'fentanyl'])).toEqual(['opioid-no-pain']);
  });

  it('nitro-preload-dependent and nitro-volume-depleted read nitroprusside and the radial cocktail too (one dose, one penalty)', () => {
    expect(penaltyIds(lab({ problems: ['tamponade'] }), 5, ['iv', 'ic-nitroprusside'])).toEqual(['nitro-preload-dependent']);
    expect(penaltyIds(lab({ problems: ['lvot-obstruction'] }), 5, ['iv', 'ic-nitroprusside'])).toEqual(['nitro-preload-dependent']);
    expect(penaltyIds(lab({ problems: ['bleeding'] }), 5, ['iv', 'ic-nitroprusside'])).toEqual(['nitro-volume-depleted']);
    expect(penaltyIds(lab({ problems: ['bleeding'], extra: flagged('access') }), 5, ['iv', 'radial-cocktail'])).toEqual(['nitro-volume-depleted']);
    // under 90 the drug's own low-pressure rule speaks
    expect(penaltyIds(lab({ problems: ['bleeding'], vitals: { sbp: 84, dbp: 50 } }), 5, ['iv', 'ic-nitroprusside'])).toEqual(['nitroprusside-hypotension']);
    // in the cases: the perforation, and Takotsubo's outflow obstruction
    expect(SCENARIO_BY_ID['perforation-cathlab'].harms.find((h) => h.id === 'nitro-in-tamponade')!.actions).toEqual(expect.arrayContaining(['ic-nitroprusside', 'radial-cocktail']));
    expect(SCENARIO_BY_ID['takotsubo-lvot-cathlab'].harms.find((h) => h.id === 'nitrate-lvoto-ic')!.actions).toContain('ic-nitroprusside');
  });

  it('the cases\' nitrate checks are one gate: a dose earns one check, and the ER nurse\'s missing order beside it', () => {
    expect(runScenario(SCENARIO_BY_ID['scape-ed'], 6, ['iv', 'nitro-iv']).penalties.map((p) => p.id)).toEqual(['rn-without-order-nitro-iv', 'nitro-no-bp']);
    expect(runScenario(SCENARIO_BY_ID['stemi-anterior-field'], 2, ['iv', 'nitro']).penalties.map((p) => p.id)).toEqual(['nitro-no-bp']);
    expect(runScenario(SCENARIO_BY_ID['stemi-anterior-field'], 2, ['iv', 'vitals', 'nitro']).penalties.map((p) => p.id)).toEqual(['nitro-no-pde5']);
  });

  it('a case check gives way to another of the case\'s nitrate rules ranked above it under its own id (one dose, one penalty)', () => {
    const nitroPenalties = (id: string, role: LearningLevel, steps: string[]) => {
      const s = runScenario(SCENARIO_BY_ID[id], role, steps);
      return s.penalties.filter((p) => p.minute === s.performed.at(-1)!.minute).map((p) => p.id);
    };
    // SCAPE (field, EMT): the second assisted dose with no fresh pressure is the case's repeat check alone, not the PDE-5 question beside it
    expect(nitroPenalties('scape-field', 1, ['monitor', 'cpap', 'nitro-assist', 'cool', 'call-help', 'sample', 'smr', 'nitro-assist'])).toEqual(['nitro-repeat-unsafe']);
    // SCAPE (ED nurse): 0.8 mg with no order: the missing order and one nitrate rule
    expect(nitroPenalties('scape-ed', 6, ['iv', 'pulse-check', 'nitro', 'o2-nc', 'nicardipine', 'bvm', 'vagal', 'nitro-high'])).toEqual(['rn-without-order-nitro-high', 'nitro-repeat-unsafe']);
    // the case's 0.8 mg rules stand at the 0.8 mg rank: the pressure check outranks them, and they outrank the PDE-5 question
    expect(nitroPenalties('cocaine-chest-pain-field', 2, ['iv', 'ask-pde5', 'midazolam', 'nitro-high'])).toEqual(['nitro-no-bp']);
    expect(nitroPenalties('cocaine-chest-pain-field', 2, ['iv', 'vitals', 'midazolam', 'nitro-high'])).toEqual(['nitro-high-chest-pain']);
    // the low-pressure rules the SCAPE cases write in their own words stand at the low-pressure rank: the checks give way to them
    for (const [id, rule] of [['scape-ed', 'nitro-below-target'], ['scape-field', 'nitro-pressure-fallen']]) {
      const r = SCENARIO_BY_ID[id].harms.find((h) => h.id === rule)!;
      const role: LearningLevel = id === 'scape-ed' ? 7 : 2;
      const low = fixture({ setting: id === 'scape-ed' ? 'ed' : 'field', role, rhythm: SINUS, vitals: { sbp: 96, dbp: 60, pain: 6 }, harms: [r, ...SCENARIO_BY_ID[id].harms.filter((h) => h.id === 'nitro-no-pde5')] });
      expect(penaltyIds(low, role, ['vitals', 'nitro']), id).toEqual([rule]);
    }
  });

  it('0.8 mg with no pressure taken charges the pressure check alone, at its weight: never less than 0.4 mg with none', () => {
    const onlyNoBp = (id: string, steps: string[]) => {
      const s = runScenario(SCENARIO_BY_ID[id], 2, steps);
      expect(s.penalties.map((p) => [p.id, p.points]), `${id} ${steps.join(' ')}`).toEqual([['nitro-no-bp', 5]]);
    };
    for (const id of ['stemi-anterior-field', 'posterior-stemi-field']) {
      onlyNoBp(id, ['iv', 'nitro-high']);
      onlyNoBp(id, ['iv', 'nitro']);
    }
    // stable VT with no chest pain: the case's no-pain rule waits for a pressure, and the 0.8 mg rule ranks under the check
    onlyNoBp('stable-vt-field', ['iv', 'procainamide', 'fluid', 'transport-pci', 'nitro-high']);
    // the ideal runs take the pressure first: with it taken, the 0.8 mg rule still judges the dose
    expect(runScenario(SCENARIO_BY_ID['posterior-stemi-field'], 2, ['primary', 'vitals', 'ask-pde5', 'nitro-high']).penalties.map((p) => p.id))
      .toEqual(['nitro-high-not-hypertensive']);
  });

  it('ED SCAPE: titrating the ordered nitroglycerin infusion under 160 is not the 0.8 mg rule (lead decision 29)', () => {
    const sc = SCENARIO_BY_ID['scape-ed'];
    expect(sc.harms.find((h) => h.id === 'nitro-high-below-160')!.actions).toEqual(['nitro-high']);
  });

  it('a lighter case rule no longer speaks for a heavier antithrombotic or sedative contraindication', () => {
    const rp = runScenario(SCENARIO_BY_ID['retroperitoneal-bleed-cathlab'], 5, ['aspirin']);
    expect(rp.penalties).toEqual([expect.objectContaining({ id: 'extra-antiplatelet', points: 10, severity: 'major' })]);
    const shock = runScenario(SCENARIO_BY_ID['shock-cathlab'], 5, ['midazolam']);
    expect(shock.penalties).toEqual([expect.objectContaining({ id: 'sedation-in-shock', points: 5, severity: 'major' })]);
    expect(runScenario(SCENARIO_BY_ID['hyperkalemia-dialysis-field'], 2, ['primary', 'iv', 'midazolam']).penalties.map((p) => p.id)).toEqual(['midazolam-unsafe']);
  });
});
