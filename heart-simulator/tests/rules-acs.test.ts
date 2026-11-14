/**
 * The built-in rules for acute coronary care (rules/acs.ts): each rule fires when it should and not in the nearest correct
 * state, a case rule with its id stands in for it, and each drug family's gate charges one dose once — the highest-ranked
 * reason to hold it.
 */
import { describe, expect, it } from 'vitest';
import { BUILT_IN_HARMS, start } from '@/lib/sim/scenario/engine';
import { NITRATE_RULES, SEDATIVE_RULES, nitrateRulesExcept, sedationForProcedure, topNitrate } from '@/lib/sim/scenario/rules/acs';
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
    expect(penaltyIds(lab, 5, ['radial-cocktail'])).toEqual(['nitro-pde5']);
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
    expect(penaltyIds(withProblems(['rv-infarction'], { setting: 'cathlab', role: 5 }), 5, ['radial-cocktail'])).toEqual(['nitro-preload-dependent']);
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
    // a same-id rule hides the built-in for every action (whatever its own actions): each dose goes on to the next rank
    const nitroOnly = withProblems(['pde5-inhibitor'], { harms: [caseRule({ id: 'nitro-pde5', actions: ['nitro'], when: () => false })] });
    expect(after(nitroOnly, ['nitro'])).toEqual([]);
    expect(after(nitroOnly, ['nitro-high'])).toEqual(['nitro-high-not-hypertensive']);
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
    expect(rn).toMatchObject({ actions: ['nitro-high'], roles: [6], points: 5, severity: 'major' });
    expect(rn.replaces).toEqual(expect.arrayContaining([...NITRATE_RULES, 'rn-without-order-nitro-high']));
    expect(rn.text).toMatch(/tamponade/);
    expect(rn.text).toMatch(/no order/);
    const doctorDrained = ['perfusion', 'lungs', 'sample', 'pocus', 'fluid', 'pericardiocentesis'];
    const md = runScenario(sc, 7, [...doctorDrained, 'nitro-high']);
    expect(md.penalties.map((p) => p.id)).toEqual(['nitro-no-indication']);
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
    const at = (rhythm: { profile: string; hr: number }, steps: string[] = []) => runScenario(patient({ rhythm }), 2, steps);
    expect(sedationForProcedure(at({ profile: 'avnrt', hr: 188 }))).toBe(true);
    expect(sedationForProcedure(at({ profile: 'torsades', hr: 220 }))).toBe(true);
    expect(sedationForProcedure(at({ profile: 'tcp', hr: 70 }))).toBe(true);
    expect(sedationForProcedure(at(slow, ['pads']))).toBe(true);
    expect(sedationForProcedure(at(slow))).toBe(false);
    expect(sedationForProcedure(at({ profile: 'paced', hr: 70 }, ['pads']))).toBe(false);
    expect(sedationForProcedure(at(SINUS, ['pads']))).toBe(false);
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
    expect(penaltyIds(ivPatient({ rhythm: { profile: 'avnrt', hr: 180 }, vitals: { pain: 0 } }), 2, ['iv', 'fentanyl'])).toEqual([]);
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
