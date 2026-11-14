/**
 * The built-in rules in rules/added.ts, one block per rule: it fires; it does not fire in the nearest correct state; a
 * case rule with the same id replaces it; and one dose earns one penalty (the gate order within a drug's rules).
 */
import { describe, expect, it } from 'vitest';
import { perform, review, start, stop } from '@/lib/sim/scenario/engine';
import { SCENARIO_BY_ID } from '@/lib/sim/scenario/scenarios';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { ANTITHROMBOTIC_RULES } from '@/lib/sim/scenario/rules/acs';
import { RATE_RULES } from '@/lib/sim/scenario/rules/rhythm';
import type { Harm, Setting } from '@/lib/sim/scenario/types';
import type { LearningLevel } from '@/store/useAppStore';
import { fixture, penaltyIds } from './ruleFixture';
import { runScenario as run } from './helpers';

const SINUS = { profile: 'normal-sinus', hr: 80 };
/** A same-id case rule that never charges: it stands in for the built-in, which must then stay silent */
const exempt = (id: string, actions: string[]): Harm => ({ id, actions, when: () => false, points: 1, severity: 'minor', text: 'Exempt.' });
/** A patient whose case opens with these flags set (a line in, a sheath in) */
const opened = (setting: Setting, role: LearningLevel, flags: string[], over: Partial<Parameters<typeof fixture>[0]> = {}) => fixture({
  setting, role, rhythm: SINUS, ...over,
  extra: { events: [{ id: 'setup', when: () => true, effect: () => ({ flags }) }], ...(over.extra ?? {}) },
});

describe('heparin-repeat-unguided', () => {
  const lab = opened('cathlab', 4, ['iv']);

  it('fires for a second bolus with no low ACT since the first, in the lab; in the ED for every repeat', () => {
    expect(penaltyIds(lab, 4, ['heparin', 'heparin'])).toEqual(['heparin-repeat-unguided']);
    // an ACT checked after the first bolus that was in range is no guide either
    expect(penaltyIds(lab, 4, ['heparin', 'act', 'heparin'])).toEqual(['heparin-repeat-unguided']);
    const ed = opened('ed', 7, ['iv']);
    expect(penaltyIds(ed, 7, ['heparin', 'heparin'])).toEqual(['heparin-repeat-unguided']);
  });

  it('does not fire for the first bolus, or for one a low ACT asked for', () => {
    expect(penaltyIds(lab, 4, ['heparin'])).toEqual([]);
    // the ACT low after the first bolus (the case's own ACT sets the timer): the top-up is guided
    const low = opened('cathlab', 4, ['iv'], { extra: { respond: { act: (s) => ({ say: [['team', 'ACT 186 s.']], flags: ['act'], timers: { actLowAt: s.minute } }) } } });
    expect(penaltyIds(low, 4, ['heparin', 'act', 'heparin'])).toEqual([]);
  });

  it('a same-id case rule replaces it; a case rule listing it in replaces stands in for it while it applies', () => {
    expect(penaltyIds(opened('cathlab', 4, ['iv'], { harms: [exempt('heparin-repeat-unguided', ['heparin'])] }), 4, ['heparin', 'heparin'])).toEqual([]);
    const twice: Harm = { id: 'heparin-twice', actions: ['heparin'], roles: [4], replaces: ['heparin-repeat-unguided'], when: (s) => 'heparin' in s.flags, points: 8, severity: 'major', text: 'Twice.' };
    expect(penaltyIds(opened('cathlab', 4, ['iv'], { harms: [twice] }), 4, ['heparin', 'heparin'])).toEqual(['heparin-twice']);
  });

  it('charges once per case: a third unguided bolus adds nothing', () => {
    expect(penaltyIds(lab, 4, ['heparin', 'heparin', 'heparin'])).toEqual(['heparin-repeat-unguided']);
  });

  it('one dose, one penalty with the antithrombotic gate (rules/acs.ts): a reason to hold the dose altogether charges it', () => {
    // a top-up on a running bivalirudin infusion: the second anticoagulant, not the missing ACT
    expect(penaltyIds(lab, 4, ['heparin', 'bivalirudin', 'heparin'])).toEqual(['double-anticoagulant']);
    // active bleeding: the first bolus is the gate's; the second, its reason charged already, is the unguided repeat
    const bleeding = opened('cathlab', 4, ['iv'], { problems: ['bleeding'] });
    expect(penaltyIds(bleeding, 4, ['heparin', 'heparin'])).toEqual(['antithrombotic-bleeding', 'heparin-repeat-unguided']);
    // the same when a case rule speaks for the gate's reason: charged on the first dose, the repeat is the unguided top-up's
    const inCaseWords: Harm = { id: 'heparin-dissection', actions: ['heparin'], replaces: ANTITHROMBOTIC_RULES, points: 10, severity: 'major', text: 'Heparin in a dissection.' };
    const dissection = opened('ed', 7, ['iv'], { problems: ['aortic-dissection'], harms: [inCaseWords] });
    expect(penaltyIds(dissection, 7, ['heparin', 'heparin'])).toEqual(['heparin-dissection', 'heparin-repeat-unguided']);
  });
});

describe('the new rhythm drugs: adenosine 3 mg, esmolol, labetalol and oral metoprolol', () => {
  const ed = (over: Partial<Parameters<typeof fixture>[0]> = {}) => fixture({ setting: 'ed', role: 7, rhythm: { profile: 'sinus-tachycardia', hr: 120 }, ...over });
  const lastText = (sc: ReturnType<typeof fixture>, role: LearningLevel, steps: string[]) => run(sc, role, steps).log.at(-1)!.text;

  it('offers them in hospital (oral and the titratable IV ones) and the 3 mg adenosine wherever the others are', () => {
    for (const id of ['esmolol', 'labetalol', 'metoprolol-po']) {
      expect(INTERVENTION_BY_ID[id], id).toMatchObject({ roles: [4, 5, 6, 7], settings: ['cathlab', 'ed'] });
      expect(interventionsFor(2, 'field').map((i) => i.id), id).not.toContain(id);
    }
    expect(INTERVENTION_BY_ID.adenosine3).toMatchObject({ roles: [2, 4, 5, 6, 7], needsAccess: true });
    expect(INTERVENTION_BY_ID.labetalol).toMatchObject({ repeatable: true, maxTimes: 3 });
  });

  it('adenosine 3 mg: the brief pause, nothing in an arrest, the pathway in pre-excited AF', () => {
    const svt = ed({ rhythm: { profile: 'svt', hr: 180 } });
    const s = run(svt, 7, ['iv', 'adenosine3']);
    expect(s.log.at(-1)!.text).toBe('A brief pause, then the same rhythm returns.');
    expect(s.flags.adenosine).toBeDefined();
    const vf = ed({ rhythm: { profile: 'vf', hr: 0 }, pulse: false });
    expect(lastText(vf, 7, ['iv', 'adenosine3'])).toBe('Adenosine given — it has no place in cardiac arrest and changes nothing on the monitor.');
    const wpw = run(ed({ rhythm: { profile: 'af-wpw', hr: 200 } }), 7, ['iv', 'adenosine3']);
    expect(wpw.rhythm).toEqual({ profile: 'af-wpw', hr: 224 });
  });

  it('esmolol and labetalol slow the rate and lower the pressure (labetalol more), never below 40; nothing in an arrest', () => {
    const e = run(ed(), 7, ['iv', 'esmolol']);
    expect([e.rhythm.hr, e.vitals.sbp, e.vitals.dbp]).toEqual([110, 118, 72]);
    expect(e.flags).toMatchObject({ 'beta-blocker': expect.any(Number), esmolol: expect.any(Number) });
    const l = run(ed(), 7, ['iv', 'labetalol', 'labetalol']);
    expect([l.rhythm.hr, l.vitals.sbp]).toEqual([104, 96]);
    expect(l.log.filter((x) => /labetalol/i.test(x.text) && x.who === 'you').map((x) => x.text).slice(-1)[0]).toMatch(/^Another labetalol dose: 40 mg IV/);
    expect(run(ed({ rhythm: { profile: 'sinus-bradycardia', hr: 44 } }), 7, ['iv', 'esmolol']).rhythm.hr).toBe(40);
    const vf = ed({ rhythm: { profile: 'vf', hr: 0 }, pulse: false });
    expect(lastText(vf, 7, ['iv', 'esmolol'])).toBe('Esmolol given — it has no place in cardiac arrest and changes nothing on the monitor.');
    expect(lastText(vf, 7, ['iv', 'labetalol'])).toBe('Labetalol given — it has no place in cardiac arrest and changes nothing on the monitor.');
    expect(run(ed({ rhythm: { profile: 'af-wpw', hr: 200 } }), 7, ['iv', 'esmolol']).rhythm).toEqual({ profile: 'af-wpw', hr: 224 });
  });

  it('oral metoprolol: a tablet for a patient who can swallow, with no rate change now', () => {
    const s = run(ed(), 7, ['metoprolol-po']);
    expect(s.rhythm.hr).toBe(120);
    expect(s.flags).toMatchObject({ 'beta-blocker': expect.any(Number), 'metoprolol-po': expect.any(Number) });
    for (const sc of [ed({ vitals: { gcs: 9 } }), ed({ rhythm: { profile: 'vf', hr: 0 }, pulse: false })]) {
      const t = perform(sc, start(sc, 7), 'metoprolol-po');
      expect(t.minute).toBe(0);
      expect(t.counts['metoprolol-po']).toBeUndefined();
    }
  });

  it('the existing rules reach them through the shared drug groups', () => {
    const cocaine = ed({ problems: ['sympathomimetic-toxicity'] });
    expect(penaltyIds(cocaine, 7, ['iv', 'esmolol'])).toEqual(['beta-blocker-stimulant']);
    expect(penaltyIds(cocaine, 7, ['metoprolol-po'])).toEqual(['beta-blocker-stimulant']);
    expect(penaltyIds(ed({ rhythm: { profile: 'af-wpw', hr: 200 } }), 7, ['iv', 'esmolol'])).toContain('av-blocker-preexcited-af');
    // the ER nurse gives none of them without the physician's order
    const rn = fixture({ setting: 'ed', role: 6, rhythm: { profile: 'sinus-tachycardia', hr: 120 } });
    for (const id of ['esmolol', 'labetalol', 'metoprolol-po', 'adenosine3']) expect(penaltyIds(rn, 6, ['iv', id]), id).toContain(`rn-without-order-${id}`);
  });
});

/** A hospital patient with a line in, as the ER doctor sees him */
const edLine = (over: Partial<Parameters<typeof fixture>[0]> = {}) => opened('ed', 7, ['iv'], over);
const HIGH = { sbp: 190, dbp: 110 };
const LOW = { sbp: 82, dbp: 50 };

describe('nicardipine: aortic stenosis, a low pressure, no high pressure (in that order); before the rate drug in a dissection it stands aside', () => {
  it('each fires in its state, and the one before it wins for one dose', () => {
    expect(penaltyIds(edLine({ vitals: HIGH, problems: ['severe-aortic-stenosis'] }), 7, ['nicardipine'])).toEqual(['nicardipine-aortic-stenosis']);
    expect(penaltyIds(edLine({ vitals: LOW, problems: ['severe-aortic-stenosis'] }), 7, ['nicardipine'])).toEqual(['nicardipine-aortic-stenosis']);
    expect(penaltyIds(edLine({ vitals: LOW }), 7, ['nicardipine'])).toEqual(['vasodilator-hypotension']);
    expect(penaltyIds(edLine({ vitals: { sbp: 112, dbp: 70 } }), 7, ['nicardipine'])).toEqual(['nicardipine-no-hypertension']);
  });

  it('a high pressure with nothing against it: none; it lowers the pressure and the sinus rate rises a little', () => {
    const s = run(edLine({ vitals: HIGH }), 7, ['nicardipine']);
    expect(s.penalties).toEqual([]);
    expect([s.vitals.sbp, s.vitals.dbp, s.rhythm.hr]).toEqual([170, 100, 86]);
    expect(s.flags).toMatchObject({ vasodilator: expect.any(Number), nicardipine: expect.any(Number) });
  });

  it('a dissection before the beta-blocker: the ACS rules judge that dose; after it, these rules do', () => {
    const dissection = edLine({ vitals: { sbp: 112, dbp: 70 }, problems: ['aortic-dissection'] });
    expect(penaltyIds(dissection, 7, ['nicardipine'])).not.toContain('nicardipine-no-hypertension');
    expect(penaltyIds(dissection, 7, ['esmolol', 'nicardipine'])).toContain('nicardipine-no-hypertension');
    // a teammate's (or the physician's fallback) beta-blocker counts as well: its flag, with no dose of the learner's
    expect(penaltyIds(opened('ed', 7, ['iv', 'beta-blocker'], { vitals: { sbp: 112, dbp: 70 }, problems: ['aortic-dissection'] }), 7, ['nicardipine'])).toEqual(['nicardipine-no-hypertension']);
  });

  it('an exemption of the top rank only: the next rank judges the dose', () => {
    expect(penaltyIds(edLine({ vitals: LOW, problems: ['severe-aortic-stenosis'], harms: [exempt('nicardipine-aortic-stenosis', ['nicardipine'])] }), 7, ['nicardipine'])).toEqual(['vasodilator-hypotension']);
  });

  it('same-id case rules replace them; nothing in an arrest', () => {
    const harms = ['nicardipine-aortic-stenosis', 'vasodilator-hypotension', 'nicardipine-no-hypertension'].map((id) => exempt(id, ['nicardipine']));
    expect(penaltyIds(edLine({ vitals: LOW, problems: ['severe-aortic-stenosis'], harms }), 7, ['nicardipine'])).toEqual([]);
    expect(penaltyIds(edLine({ vitals: LOW, harms }), 7, ['nicardipine'])).toEqual([]);
    const vf = opened('ed', 7, ['iv'], { rhythm: { profile: 'vf', hr: 0 }, pulse: false });
    expect(penaltyIds(vf, 7, ['nicardipine'])).toEqual([]);
    expect(run(vf, 7, ['nicardipine']).log.at(-1)!.text).toBe('Nicardipine given — it has no place in cardiac arrest and changes nothing on the monitor.');
  });
});

describe('the inotrope: outflow obstruction, a dissection, a low pressure with no vasopressor, a tachyarrhythmia, no low output (in that order)', () => {
  const SHOCK = ['cardiogenic-shock'] as const;
  it('each fires in its state, and the one before it wins for one dose', () => {
    expect(penaltyIds(edLine({ vitals: LOW, problems: ['lvot-obstruction', 'aortic-dissection'] }), 7, ['inotrope'])).toEqual(['inotrope-lvot-obstruction']);
    expect(penaltyIds(edLine({ vitals: LOW, problems: ['aortic-dissection'] }), 7, ['inotrope'])).toEqual(['inotrope-dissection']);
    expect(penaltyIds(edLine({ vitals: { sbp: 196, dbp: 100 }, problems: ['aortic-dissection'] }), 7, ['inotrope'])).toEqual(['inotrope-dissection']);
    expect(penaltyIds(edLine({ vitals: LOW, rhythm: { profile: 'svt', hr: 170 } }), 7, ['inotrope'])).toEqual(['inotrope-unsupported-hypotension']);
    expect(penaltyIds(edLine({ rhythm: { profile: 'afib', hr: 140 }, problems: [...SHOCK] }), 7, ['inotrope'])).toEqual(['inotrope-tachyarrhythmia']);
    expect(penaltyIds(edLine({ rhythm: { profile: 'afib', hr: 140 } }), 7, ['inotrope'])).toEqual(['inotrope-tachyarrhythmia']);
    // no shock, no failing pump, a pressure that holds: a hypertensive pulmonary edema, an MI without shock
    expect(penaltyIds(edLine({ vitals: { sbp: 206, dbp: 110 }, problems: ['pulmonary-edema'] }), 7, ['inotrope'])).toEqual(['inotrope-no-indication']);
    expect(penaltyIds(edLine({ vitals: { sbp: 148, dbp: 86 }, problems: ['acs'] }), 7, ['inotrope'])).toEqual(['inotrope-no-indication']);
  });

  it('low output with the pressure held up by a vasopressor: none; it holds the systolic and speeds the sinus rate a little', () => {
    expect(penaltyIds(edLine({ vitals: LOW, problems: [...SHOCK] }), 7, ['pressor', 'inotrope'])).toEqual([]);
    // the vasopressor running, the pressure still low: not the 'alone' mistake (and no lack of indication with it so low)
    expect(penaltyIds(opened('ed', 7, ['iv', 'pressor'], { vitals: LOW }), 7, ['inotrope'])).toEqual([]);
    const s = run(edLine({ vitals: { sbp: 96, dbp: 60 }, problems: ['heart-failure'] }), 7, ['inotrope']);
    expect(s.penalties).toEqual([]);
    expect([s.vitals.sbp, s.vitals.dbp, s.rhythm.hr]).toEqual([98, 56, 86]);
    expect(s.flags.inotrope).toBeDefined();
  });

  it('same-id case rules replace them; an exemption of one rank lets the next one judge the dose', () => {
    const harms = ['inotrope-lvot-obstruction', 'inotrope-dissection', 'inotrope-unsupported-hypotension', 'inotrope-tachyarrhythmia', 'inotrope-no-indication'].map((id) => exempt(id, ['inotrope']));
    expect(penaltyIds(edLine({ vitals: LOW, problems: ['lvot-obstruction'], harms }), 7, ['inotrope'])).toEqual([]);
    expect(penaltyIds(edLine({ harms }), 7, ['inotrope'])).toEqual([]);
    // only the top rank exempted: the case has said the outflow is no reason here, not that the dose is right
    expect(penaltyIds(edLine({ vitals: LOW, problems: ['lvot-obstruction'], harms: [exempt('inotrope-lvot-obstruction', ['inotrope'])] }), 7, ['inotrope'])).toEqual(['inotrope-unsupported-hypotension']);
  });

  it('the ER nurse without an order is charged the order, not the indication', () => {
    expect(penaltyIds(opened('ed', 6, ['iv']), 6, ['inotrope'])).toEqual(['rn-without-order-inotrope']);
    // a contraindication still counts beside the missing order
    expect(penaltyIds(opened('ed', 6, ['iv'], { problems: ['aortic-dissection'] }), 6, ['inotrope'])).toEqual(['inotrope-dissection', 'rn-without-order-inotrope']);
  });
});

describe('furosemide: a low pressure, a preload-dependent heart, no urine, no congestion (in that order)', () => {
  it('each fires in its state, and the one before it wins for one dose', () => {
    expect(penaltyIds(edLine({ vitals: LOW, problems: ['tamponade', 'dialysis'] }), 7, ['furosemide'])).toEqual(['furosemide-hypotension']);
    for (const problems of [['tamponade'], ['pulmonary-embolism'], ['rv-infarction']] as const) {
      expect(penaltyIds(edLine({ problems: [...problems, 'dialysis', 'pulmonary-edema'] }), 7, ['furosemide']), problems[0]).toEqual(['furosemide-preload-dependent']);
    }
    // an outflow obstruction is preload-dependent when the lungs are dry; with congestion a careful diuretic is the treatment
    for (const problem of ['lvot-obstruction', 'severe-aortic-stenosis'] as const) {
      expect(penaltyIds(edLine({ problems: [problem, 'dialysis', 'hyperkalemia'] }), 7, ['furosemide']), problem).toEqual(['furosemide-preload-dependent']);
      expect(penaltyIds(edLine({ problems: [problem, 'pulmonary-edema'] }), 7, ['furosemide']), problem).toEqual([]);
      expect(penaltyIds(edLine({ problems: [problem, 'heart-failure', 'dialysis'] }), 7, ['furosemide']), problem).toEqual(['furosemide-anuria']);
      expect(penaltyIds(edLine({ vitals: LOW, problems: [problem, 'pulmonary-edema'] }), 7, ['furosemide']), problem).toEqual(['furosemide-hypotension']);
    }
    expect(penaltyIds(edLine({ problems: ['dialysis', 'hyperkalemia'] }), 7, ['furosemide'])).toEqual(['furosemide-anuria']);
    expect(penaltyIds(edLine(), 7, ['furosemide'])).toEqual(['furosemide-no-indication']);
  });

  it('congestion, failure or a high potassium in a patient who makes urine: none; a drained tamponade is no longer preload-dependent', () => {
    for (const p of ['pulmonary-edema', 'heart-failure', 'hyperkalemia'] as const) expect(penaltyIds(edLine({ problems: [p] }), 7, ['furosemide']), p).toEqual([]);
    expect(penaltyIds(opened('ed', 7, ['iv', 'drained'], { problems: ['tamponade', 'pulmonary-edema'] }), 7, ['furosemide'])).toEqual([]);
    const s = run(edLine({ problems: ['pulmonary-edema'] }), 7, ['furosemide']);
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([124, 76]);
    expect(s.flags.diuretic).toBeDefined();
  });

  it('same-id case rules replace them; the ER nurse without an order is charged the order, not the indication', () => {
    const harms = ['furosemide-hypotension', 'furosemide-preload-dependent', 'furosemide-anuria', 'furosemide-no-indication'].map((id) => exempt(id, ['furosemide']));
    expect(penaltyIds(edLine({ vitals: LOW, harms }), 7, ['furosemide'])).toEqual([]);
    expect(penaltyIds(edLine({ harms }), 7, ['furosemide'])).toEqual([]);
    const rn = opened('ed', 6, ['iv']);
    expect(penaltyIds(rn, 6, ['furosemide'])).toEqual(['rn-without-order-furosemide']);
  });
});

describe('sit-up-low-pressure', () => {
  it('fires for a low pressure without fluid on the lungs; not with it, nor with a normal pressure', () => {
    expect(penaltyIds(fixture({ setting: 'field', role: 1, rhythm: SINUS, vitals: LOW }), 1, ['sit-up'])).toEqual(['sit-up-low-pressure']);
    expect(penaltyIds(fixture({ setting: 'field', role: 1, rhythm: SINUS, vitals: LOW, problems: ['pulmonary-edema'] }), 1, ['sit-up'])).toEqual([]);
    expect(penaltyIds(fixture({ setting: 'field', role: 1, rhythm: SINUS, vitals: LOW, problems: ['heart-failure'] }), 1, ['sit-up'])).toEqual([]);
    expect(penaltyIds(fixture({ setting: 'field', role: 1, rhythm: SINUS }), 1, ['sit-up'])).toEqual([]);
    expect(penaltyIds(fixture({ setting: 'field', role: 1, rhythm: SINUS, vitals: LOW, harms: [exempt('sit-up-low-pressure', ['sit-up'])] }), 1, ['sit-up'])).toEqual([]);
  });

  it('not for a tamponade that will not let the patient lie down — until it is drained', () => {
    expect(penaltyIds(fixture({ setting: 'ed', role: 7, rhythm: SINUS, vitals: LOW, problems: ['tamponade'] }), 7, ['sit-up'])).toEqual([]);
    // a tamponade that began mid-case (the flag) counts the same
    expect(penaltyIds(opened('cathlab', 5, ['tamponade'], { vitals: LOW }), 5, ['sit-up'])).toEqual([]);
    expect(penaltyIds(opened('ed', 7, ['drained'], { vitals: LOW, problems: ['tamponade'] }), 7, ['sit-up'])).toEqual(['sit-up-low-pressure']);
  });

  it('sits the patient up (and the legs come down); refused in an arrest or for a patient too drowsy to hold the airway', () => {
    const sc = fixture({ setting: 'field', role: 1, rhythm: SINUS });
    const s = run(sc, 1, ['legs-up', 'sit-up']);
    expect(s.flags['sat-up']).toBeDefined();
    expect(s.flags['legs-up']).toBeUndefined();
    expect(run(sc, 1, ['sit-up', 'legs-up']).flags['sat-up']).toBeUndefined();
    for (const blocked of [fixture({ setting: 'field', role: 1, rhythm: SINUS, vitals: { gcs: 8 } }), fixture({ setting: 'field', role: 1, rhythm: { profile: 'vf', hr: 0 }, pulse: false })]) {
      const t = perform(blocked, start(blocked, 1), 'sit-up');
      expect(t.minute).toBe(0);
      expect(t.counts['sit-up']).toBeUndefined();
    }
  });
});

describe('oral-beta-blocker-shock-risk', () => {
  const acs = (vitals: Partial<typeof LOW>, hr = 80, problems: Parameters<typeof fixture>[0]['problems'] = ['acs']) =>
    fixture({ setting: 'ed', role: 7, rhythm: { profile: hr > 100 ? 'sinus-tachycardia' : 'normal-sinus', hr }, vitals, problems });

  it('fires in an ACS with a systolic of 90–99, a rate over 110 or under 60, or heart failure', () => {
    expect(penaltyIds(acs({ sbp: 96, dbp: 60 }), 7, ['metoprolol-po'])).toEqual(['oral-beta-blocker-shock-risk']);
    expect(penaltyIds(acs({}, 116), 7, ['metoprolol-po'])).toEqual(['oral-beta-blocker-shock-risk']);
    expect(penaltyIds(acs({}, 56), 7, ['metoprolol-po'])).toEqual(['oral-beta-blocker-shock-risk']);
    expect(penaltyIds(acs({}, 80, ['acs', 'heart-failure']), 7, ['metoprolol-po'])).toEqual(['oral-beta-blocker-shock-risk']);
  });

  it('not for a stable ACS patient, nor outside an ACS; the rhythm rules judge a low pressure, a slow rate and fluid on the lungs', () => {
    expect(penaltyIds(acs({}), 7, ['metoprolol-po'])).toEqual([]);
    expect(penaltyIds(acs({ sbp: 96, dbp: 60 }, 80, []), 7, ['metoprolol-po'])).toEqual([]);
    for (const [vitals, hr, problems] of [[LOW, 80, ['acs']], [{}, 44, ['acs']], [{}, 80, ['acs', 'pulmonary-edema']]] as const) {
      expect(penaltyIds(acs(vitals, hr, [...problems]), 7, ['metoprolol-po'])).not.toContain('oral-beta-blocker-shock-risk');
    }
    const exempted = fixture({ setting: 'ed', role: 7, rhythm: SINUS, vitals: { sbp: 96, dbp: 60 }, problems: ['acs'], harms: [exempt('oral-beta-blocker-shock-risk', ['metoprolol-po'])] });
    expect(penaltyIds(exempted, 7, ['metoprolol-po'])).toEqual([]);
  });

  it('one dose, one penalty: a case rule that speaks for the beta-blocker (it stands in for RATE_RULES) covers the tablet', () => {
    const caseRule: Harm = { id: 'beta-blocker', actions: ['metoprolol', 'metoprolol-po'], replaces: RATE_RULES, points: 8, severity: 'major', text: 'A beta-blocker for this patient.' };
    const withCase = fixture({ setting: 'ed', role: 7, rhythm: SINUS, vitals: { sbp: 96, dbp: 60 }, problems: ['acs'], harms: [caseRule] });
    expect(penaltyIds(withCase, 7, ['metoprolol-po'])).toEqual(['beta-blocker']);
    // a case rule that does not apply leaves the tablet to the oral rule
    const off = fixture({ setting: 'ed', role: 7, rhythm: SINUS, vitals: { sbp: 96, dbp: 60 }, problems: ['acs'], harms: [{ ...caseRule, when: () => false }] });
    expect(penaltyIds(off, 7, ['metoprolol-po'])).toEqual(['oral-beta-blocker-shock-risk']);
    // a stand-in charged on an earlier dose passes the tablet on: its shock risk is charged as the next reason
    const failing = fixture({ setting: 'ed', role: 7, rhythm: SINUS, problems: ['acs', 'heart-failure'], harms: [caseRule] });
    expect(penaltyIds(failing, 7, ['iv', 'metoprolol', 'metoprolol-po'])).toEqual(['beta-blocker', 'oral-beta-blocker-shock-risk']);
    // the cases: the cath lab's inferior STEMI, the nurse's tablet before the artery is open
    const inferior = SCENARIO_BY_ID['stemi-inferior-cathlab'];
    expect(run(inferior, 4, ['metoprolol-po']).penalties.map((p) => p.id)).toEqual(['beta-blocker']);
  });
});

describe('IV nitroglycerin and calcium gluconate reach the existing rules', () => {
  it('IV nitroglycerin: the high-dose effect for hypertensive pulmonary edema, repeatable 3 times; with a systolic of 85 the nitrate rule fires', () => {
    const s = run(edLine({ vitals: { sbp: 200, dbp: 110, pain: 4 }, problems: ['pulmonary-edema'] }), 7, ['nitro-iv', 'nitro-iv']);
    expect(s.log.filter((l) => /^(Nitroglycerin 400|The nitroglycerin infusion)/.test(l.text)).map((l) => l.text)).toEqual(['Nitroglycerin 400 mcg IV over 2 minutes, then the infusion at 100 mcg/min.', 'The nitroglycerin infusion titrated up, with the pressure checked every few minutes.']);
    expect(s.vitals.sbp).toBe(160);
    expect(s.flags).toMatchObject({ nitro: expect.any(Number), 'nitro-high': expect.any(Number), 'nitro-iv': expect.any(Number) });
    expect(INTERVENTION_BY_ID['nitro-iv']).toMatchObject({ repeatable: true, maxTimes: 3 });
    expect(penaltyIds(edLine({ vitals: { sbp: 85, dbp: 50 } }), 7, ['nitro-iv'])).toContain('nitro-hypotension');
  });

  it('IV nitroglycerin for ischemic pain or a high pressure without pulmonary edema: the standard infusion, no bolus', () => {
    const s = run(edLine({ vitals: { sbp: 146, dbp: 90, pain: 6 }, problems: ['acs'] }), 7, ['nitro-iv', 'nitro-iv']);
    expect(s.log.filter((l) => l.who === 'you' && /^(Nitroglycerin infusion|The nitroglycerin infusion)/.test(l.text)).map((l) => l.text)).toEqual([
      'Nitroglycerin infusion started at 10 mcg/min, no bolus, to be titrated up 10 mcg/min every 3–5 minutes to the pain and the pressure.',
      'The nitroglycerin infusion up by 10 mcg/min, with the pressure checked every few minutes.',
    ]);
    expect([s.vitals.sbp, s.vitals.pain]).toEqual([126, 2]);
    expect(s.flags['nitro-high']).toBeUndefined();
  });

  it('a nitrate where the case gives no answer of its own: a profound fall after a PDE-5 inhibitor, with a preload-dependent heart or an outflow obstruction', () => {
    for (const problems of [['acs', 'pde5-inhibitor'], ['tamponade'], ['pulmonary-embolism'], ['rv-infarction'], ['severe-aortic-stenosis']] as const) {
      const s = run(edLine({ vitals: { sbp: 146, dbp: 90, pain: 6 }, problems: [...problems] }), 7, ['nitro-iv']);
      expect([s.vitals.sbp, s.vitals.dbp, s.vitals.pain], problems.join()).toEqual([106, 66, 6]);
      expect(s.log.some((l) => l.text === 'The pressure keeps falling; the heart rate climbs.'), problems.join()).toBe(true);
    }
    // the sublingual dose too
    expect(run(edLine({ vitals: { sbp: 146, dbp: 90, pain: 6 }, problems: ['acs', 'pde5-inhibitor'] }), 7, ['nitro']).vitals.sbp).toBe(106);
    // a tamponade once drained is no longer preload-dependent
    expect(run(opened('ed', 7, ['iv', 'drained'], { vitals: { sbp: 146, dbp: 90, pain: 6 }, problems: ['tamponade'] }), 7, ['nitro-iv']).vitals.sbp).toBe(136);
  });

  it('calcium gluconate: the calcium rule without an indication; none with one; compressions only after CPR', () => {
    expect(penaltyIds(edLine(), 7, ['calcium-gluconate'])).toEqual(['calcium-no-indication']);
    expect(penaltyIds(edLine({ problems: ['hyperkalemia'] }), 7, ['calcium-gluconate'])).toEqual([]);
    const s = run(edLine({ problems: ['hyperkalemia'] }), 7, ['calcium-gluconate']);
    expect(s.log.at(-1)!.text).toBe('Calcium gluconate 3 g IV over 5–10 minutes; line flushed.');
    expect(s.flags.calcium).toBeDefined();
    expect(INTERVENTION_BY_ID['calcium-gluconate']).toMatchObject({ roles: [2, 4, 5, 6, 7], repeatable: true, maxTimes: 3 });
    const vf = opened('ed', 7, ['iv'], { rhythm: { profile: 'vf', hr: 0 }, pulse: false, problems: ['hyperkalemia'] });
    expect(run(vf, 7, ['cpr', 'calcium-gluconate']).log.at(-1)!.text).toBe('Calcium gluconate 3 g pushed and flushed; compressions go on.');
  });

  it('none of the new infusions goes into the field or to the EMT', () => {
    for (const id of ['nicardipine', 'inotrope', 'furosemide', 'nitro-iv']) {
      expect(INTERVENTION_BY_ID[id], id).toMatchObject({ roles: [4, 5, 6, 7], settings: ['cathlab', 'ed'], needsAccess: true });
    }
    expect(INTERVENTION_BY_ID.inotrope.detail).toMatch(/milrinone 0\.125–0\.75 mcg\/kg\/min, no routine bolus, a lower dose with kidney disease/);
  });
});

describe('the hospital team actions: arterial line, procedure set-up, stopping the drips, temperature control, discharge, observing', () => {
  it('an arterial line shows the pressure beat to beat (flag bp); not during CPR', () => {
    const s = run(edLine({ vitals: { sbp: 150, dbp: 90 } }), 7, ['arterial-line']);
    expect(s.log.at(-1)!.text).toBe('Arterial line: 150/90, MAP 110, beat to beat.');
    expect(s.flags).toMatchObject({ 'arterial-line': expect.any(Number), bp: expect.any(Number) });
    const vf = edLine({ rhythm: { profile: 'vf', hr: 0 }, pulse: false });
    expect(perform(vf, start(vf, 7), 'arterial-line').counts['arterial-line']).toBeUndefined();
  });

  it('the ER nurse sets up for the physician\'s procedure', () => {
    const s = run(opened('ed', 6, []), 6, ['procedure-setup']);
    expect(s.flags).toMatchObject({ 'procedure-setup': expect.any(Number), 'airway-ready': expect.any(Number) });
    expect(INTERVENTION_BY_ID['procedure-setup']).toMatchObject({ roles: [6], settings: ['ed'], category: 'airway' });
  });

  it('stopping the drips needs something given; it names what it stops', () => {
    const none = edLine();
    const refused = perform(none, start(none, 7), 'stop-antithrombotics');
    expect(refused.counts['stop-antithrombotics']).toBeUndefined();
    expect(refused.log.at(-1)!.text).toMatch(/^There is no heparin, bivalirudin, GP IIb\/IIIa or cangrelor to stop/);
    const s = run(edLine(), 7, ['heparin', 'stop-antithrombotics']);
    expect(s.log.at(-1)!.text).toBe('Stopped: heparin off at the pump, no more boluses — and the orders say so.');
    expect(s.flags['antithrombotics-stopped']).toBeDefined();
    // the lab's heparin is boluses only: there is no drip to turn off
    const lab = opened('cathlab', 5, ['iv'], { problems: ['bleeding'] });
    expect(run(lab, 5, ['heparin', 'stop-antithrombotics']).log.at(-1)!.text).toBe('Stopped: no more heparin boluses — and the orders say so.');
    expect(run(lab, 5, ['heparin', 'bivalirudin', 'stop-antithrombotics']).log.at(-1)!.text).toBe('Stopped: bivalirudin off at the pump, no more heparin boluses — and the orders say so.');
  });

  it('stop-antithrombotics-mid-pci: stopping with a wire in the coronary and nothing bleeding costs 5; after the final angiogram, or for a bleed, a perforation or a SCAD it does not', () => {
    const wired = (flags: string[], problems: Parameters<typeof fixture>[0]['problems'] = []) => opened('cathlab', 5, ['iv', 'access', 'guide', 'wired', ...flags], { problems });
    expect(penaltyIds(wired([]), 5, ['heparin', 'stop-antithrombotics'])).toEqual(['stop-antithrombotics-mid-pci']);
    expect(penaltyIds(wired(['final-angio']), 5, ['heparin', 'stop-antithrombotics'])).toEqual([]);
    // (with active bleeding the heparin itself is the antithrombotic gate's mistake, rules/acs.ts; stopping it costs nothing)
    expect(penaltyIds(wired([], ['bleeding']), 5, ['heparin', 'stop-antithrombotics'])).toEqual(['antithrombotic-bleeding']);
    expect(penaltyIds(wired(['perforation']), 5, ['heparin', 'stop-antithrombotics'])).toEqual([]);
    expect(penaltyIds(wired(['scad']), 5, ['heparin', 'stop-antithrombotics'])).toEqual([]);
    expect(penaltyIds(opened('cathlab', 5, ['iv', 'access']), 5, ['heparin', 'stop-antithrombotics'])).toEqual([]);
    expect(penaltyIds(opened('cathlab', 5, ['iv', 'access', 'guide', 'wired'], { harms: [exempt('stop-antithrombotics-mid-pci', ['stop-antithrombotics'])] }), 5, ['heparin', 'stop-antithrombotics'])).toEqual([]);
  });

  it('temperature control: after ROSC for a patient who does not follow commands; charged without that (3, minor); never during CPR', () => {
    const awake = edLine();
    expect(penaltyIds(awake, 7, ['temp-control'])).toEqual(['temp-control-no-indication']);
    const rosc = opened('ed', 7, ['iv', 'rosc'], { vitals: { gcs: 3 } });
    expect(penaltyIds(rosc, 7, ['temp-control'])).toEqual([]);
    expect(run(rosc, 7, ['temp-control']).flags['temp-control']).toBeDefined();
    const awakeAfter = opened('ed', 7, ['iv', 'rosc'], { vitals: { gcs: 14 } });
    expect(penaltyIds(awakeAfter, 7, ['temp-control'])).toEqual(['temp-control-no-indication']);
    expect(penaltyIds(opened('ed', 7, ['iv'], { harms: [exempt('temp-control-no-indication', ['temp-control'])] }), 7, ['temp-control'])).toEqual([]);
    const vf = edLine({ rhythm: { profile: 'vf', hr: 0 }, pulse: false });
    expect(perform(vf, start(vf, 7), 'temp-control').counts['temp-control']).toBeUndefined();
  });

  it('discharge: critical unless the case says the patient may go; the hand-off is to the patient', () => {
    const s = run(edLine(), 7, ['discharge', 'handoff']);
    expect(s.penalties.map((p) => [p.id, p.points, p.severity])).toEqual([['discharge-unsafe', 15, 'critical']]);
    expect(s.log.some((l) => l.text === 'SBAR hand-off to the patient, with discharge instructions and follow-up.')).toBe(true);
    expect(s.flags.dispo).toBeDefined();
    expect(penaltyIds(edLine({ extra: { dischargeOk: () => true } }), 7, ['discharge'])).toEqual([]);
    expect(penaltyIds(edLine({ harms: [exempt('discharge-unsafe', ['discharge'])] }), 7, ['discharge'])).toEqual([]);
  });

  it('observing runs the clock a minute at a time, up to 15, and stops at the first thing that happens', () => {
    const quiet = run(edLine(), 7, ['observe']);
    expect(quiet.minute).toBe(15);
    expect(quiet.log.slice(-3).map((l) => l.text)[0]).toBe('Watched on the monitor for 15 minutes.');
    expect(quiet.flags.bp).toBeDefined();
    const event = edLine({ extra: { events: [
      { id: 'setup', when: () => true, effect: () => ({ flags: ['iv'] }) },
      { id: 'pain', when: (s) => s.minute >= 4, effect: () => ({ say: [['patient', 'The pain is back!']], vitals: { pain: 7 } }) },
    ] } });
    const s = run(event, 7, ['observe']);
    expect(s.minute).toBe(4);
    expect(s.log.some((l) => l.text === 'The pain is back!')).toBe(true);
    expect(s.log.at(-1)!.text).toBe('Pain 7/10.');
    const arrest = edLine({ extra: { events: [{ id: 'vf', when: (s) => s.minute >= 3, effect: () => ({ rhythm: { profile: 'vf', hr: 0 }, pulse: false }) }] } });
    const vf = run(arrest, 7, ['observe']);
    expect([vf.minute, vf.pulse]).toEqual([3, false]);
    // nothing to watch in an arrest
    const pulseless = edLine({ rhythm: { profile: 'vf', hr: 0 }, pulse: false });
    expect(perform(pulseless, start(pulseless, 7), 'observe').counts.observe).toBeUndefined();
  });
});

describe('the field\'s new actions: temperature and cooling, spinal motion restriction, talking down and restraint', () => {
  const field = (over: Partial<Parameters<typeof fixture>[0]> = {}) => fixture({ setting: 'field', role: 2, rhythm: SINUS, ...over });
  const VF_ARREST = { rhythm: { profile: 'vf', hr: 0 }, pulse: false as const };

  it('the thermometer reads the temperature; cooling takes 0.3 °C off, twice at most, and never during CPR', () => {
    const hot = field({ vitals: { temp: 39.4 } });
    expect(run(hot, 2, ['temp']).log.at(-1)!.text).toBe('Temperature 39.4 °C.');
    const cooled = run(hot, 2, ['cool', 'cool']);
    expect(cooled.vitals.temp).toBe(38.8);
    expect(cooled.flags.cooling).toBeDefined();
    expect(INTERVENTION_BY_ID.cool).toMatchObject({ repeatable: true, maxTimes: 2, roles: [1, 2, 4, 5, 6, 7] });
    const vf = field(VF_ARREST);
    expect(perform(vf, start(vf, 2), 'cool').counts.cool).toBeUndefined();
  });

  it('smr-in-arrest: a collar in cardiac arrest costs 5; with a pulse it is the crew\'s judgment', () => {
    expect(penaltyIds(field(VF_ARREST), 2, ['smr'])).toEqual(['smr-in-arrest']);
    expect(penaltyIds(field(), 2, ['smr'])).toEqual([]);
    expect(run(field(), 2, ['smr']).flags.smr).toBeDefined();
    expect(penaltyIds(field({ ...VF_ARREST, harms: [exempt('smr-in-arrest', ['smr'])] }), 2, ['smr'])).toEqual([]);
  });

  it('prone-restraint is critical in every case; restraint-no-indication charges soft restraints without severe agitation (one dose, one penalty)', () => {
    expect(penaltyIds(field(), 2, ['restrain-prone'])).toEqual(['prone-restraint']);
    expect(penaltyIds(field({ problems: ['severe-agitation'] }), 2, ['restrain-prone'])).toEqual(['prone-restraint']);
    expect(penaltyIds(field(), 2, ['restrain'])).toEqual(['restraint-no-indication']);
    expect(penaltyIds(field({ problems: ['severe-agitation'] }), 2, ['restrain'])).toEqual([]);
    expect(penaltyIds(field({ harms: [exempt('prone-restraint', ['restrain-prone'])] }), 2, ['restrain-prone'])).toEqual([]);
    expect(penaltyIds(field({ harms: [exempt('restraint-no-indication', ['restrain'])] }), 2, ['restrain'])).toEqual([]);
  });

  it('talking down, restraining: flags of their own, and nothing to do in an arrest', () => {
    expect(run(field(), 1, ['calm']).flags['de-escalated']).toBeDefined();
    expect(run(field({ problems: ['severe-agitation'] }), 2, ['restrain']).flags.restrained).toBeDefined();
    expect(run(field(), 2, ['restrain-prone']).flags['restrained-prone']).toBeDefined();
    const vf = field(VF_ARREST);
    for (const id of ['calm', 'restrain', 'restrain-prone']) expect(perform(vf, start(vf, 2), id).counts[id], id).toBeUndefined();
    for (const id of ['calm', 'restrain', 'restrain-prone', 'smr']) expect(INTERVENTION_BY_ID[id], id).toMatchObject({ roles: [1, 2], settings: ['field'] });
  });
});

describe('heparin-repeat-unguided in the cases: a case rule that charges the repeat stands in for it (one dose, one penalty)', () => {
  const ids = (id: string, role: LearningLevel, steps: string[]) => run(SCENARIO_BY_ID[id], role, steps).penalties.map((p) => p.id);
  const unguided = (id: string, role: LearningLevel, steps: string[]) => ids(id, role, steps).filter((p) => p === 'heparin-repeat-unguided');

  it('the second dose earns the case\'s rule alone', () => {
    expect(ids('pulmonary-embolism-lysis-ed', 7, ['ems-handoff', 'pocus', 'heparin', 'heparin'])).toEqual(['heparin-extra']);
    expect(ids('stent-thrombosis-cathlab', 5, ['act', 'heparin', 'cangrelor', 'heparin'])).toEqual(['double-anticoagulant']);
    expect(ids('scad-cathlab', 5, ['consent', 'heparin', 'timeout', 'access', 'cath-jl4', 'reposition', 'angio', 'ic-nitro', 'view-lao-cranial', 'heparin'])).toEqual(['antithrombotic-after-scad']);
    expect(unguided('guide-dissection-cathlab', 5, ['stop-contrast', 'protamine', 'heparin', 'heparin'])).toEqual([]);
    const wire = ['pads', 'pace', 'fentanyl', 'midazolam', 'pulse-check', 'sample', 'consent', 'timeout', 'access-venous', 'heparin', 'temp-wire', 'ecg12-repeat', 'reassess', 'reposition', 'echo', 'heparin'];
    expect(ids('heart-block-temp-wire-cathlab', 5, wire).filter((p) => ['heparin-repeat-unguided', 'anticoagulant-perforation'].includes(p))).toEqual(['anticoagulant-perforation']);
  });

  it('re-heparinizing after protamine once the ACT reads low is guided; the no-reflow ACT under range guides the top-up', () => {
    for (const role of [4, 5] as const) {
      const s = run(SCENARIO_BY_ID['guide-dissection-cathlab'], role, ['heparin', 'protamine', 'act', 'heparin']);
      expect(s.log.some((l) => /^ACT 158 s/.test(l.text)), String(role)).toBe(true);
      expect(s.penalties.map((p) => p.id), String(role)).not.toContain('heparin-repeat-unguided');
    }
    // without the ACT first, the same re-dose is unguided
    expect(unguided('guide-dissection-cathlab', 5, ['heparin', 'protamine', 'heparin'])).toEqual(['heparin-repeat-unguided']);
    expect(run(SCENARIO_BY_ID['no-reflow-cathlab'], 5, ['act', 'heparin']).penalties).toEqual([]);
    expect(run(SCENARIO_BY_ID['no-reflow-cathlab'], 5, ['act']).timers.actLowAt).toBeDefined();
  });

  it('SCAD: with no heparin given there is nothing to stop, and no item to miss for it', () => {
    const md = ['consent', 'timeout', 'access', 'cath-jl4', 'reposition', 'angio', 'ic-nitro', 'view-lao-cranial'];
    const sc = SCENARIO_BY_ID['scad-cathlab'];
    const missedItems = review(sc, stop(run(sc, 5, md))).toFix.filter((t) => t.kind === 'missed').map((t) => t.label);
    expect(missedItems).not.toContain('Once the SCAD is seen: stop the heparin — no top-up, no drip');
    const given = review(sc, stop(run(sc, 5, ['consent', 'heparin', ...md.slice(1)]))).toFix.filter((t) => t.kind === 'missed').map((t) => t.label);
    expect(given).toContain('Once the SCAD is seen: stop the heparin — no top-up, no drip');
  });
});

describe('the new drugs meet the rules the other packages wrote (plan P4 item 56)', () => {
  const ed = (over: Partial<Parameters<typeof fixture>[0]> = {}) => fixture({ setting: 'ed', role: 7, rhythm: SINUS, ...over });
  it('esmolol at a rate of 40, labetalol with asthma, oral metoprolol with fluid on the lungs', () => {
    expect(penaltyIds(ed({ rhythm: { profile: 'sinus-bradycardia', hr: 40 } }), 7, ['iv', 'esmolol'])).toEqual(['nodal-blocker-slow']);
    expect(penaltyIds(ed({ rhythm: { profile: 'atrial-fibrillation', hr: 130 }, problems: ['asthma'] }), 7, ['iv', 'labetalol'])).toEqual(['labetalol-asthma']);
    expect(penaltyIds(ed({ rhythm: { profile: 'atrial-fibrillation', hr: 130 }, problems: ['pulmonary-edema'] }), 7, ['metoprolol-po'])).toEqual(['beta-blocker-pulmonary-edema']);
  });

  it('adenosine 3 mg for a transplanted heart is the right first dose; 6 mg is not', () => {
    const transplant = ed({ rhythm: { profile: 'avnrt', hr: 180 }, problems: ['heart-transplant'] });
    expect(penaltyIds(transplant, 7, ['iv', 'adenosine3'])).toEqual([]);
    expect(penaltyIds(transplant, 7, ['iv', 'adenosine6'])).toEqual(['adenosine-full-dose']);
  });

  it('IV nitroglycerin after a PDE-5 inhibitor, and nicardipine in a dissection before the beta-blocker', () => {
    expect(penaltyIds(ed({ problems: ['pde5-inhibitor', 'acs'], vitals: { pain: 6 } }), 7, ['iv', 'nitro-iv'])).toEqual(['nitro-pde5']);
    expect(penaltyIds(ed({ problems: ['aortic-dissection'], vitals: { sbp: 176, dbp: 96 } }), 7, ['iv', 'nicardipine'])).toEqual(['vasodilator-before-rate-control']);
    expect(penaltyIds(ed({ problems: ['aortic-dissection'], vitals: { sbp: 176, dbp: 96 } }), 7, ['iv', 'esmolol', 'nicardipine'])).toEqual([]);
  });
});
