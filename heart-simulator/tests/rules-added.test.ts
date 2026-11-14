/**
 * The built-in rules in rules/added.ts, one block per rule: it fires; it does not fire in the nearest correct state; a
 * case rule with the same id replaces it; and one dose earns one penalty (the gate order within a drug's rules).
 */
import { describe, expect, it } from 'vitest';
import { perform, start } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
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

describe('the inotrope: outflow obstruction, a low pressure with no vasopressor, a tachyarrhythmia (in that order)', () => {
  it('each fires in its state, and the one before it wins for one dose', () => {
    expect(penaltyIds(edLine({ vitals: LOW, problems: ['lvot-obstruction'] }), 7, ['inotrope'])).toEqual(['inotrope-lvot-obstruction']);
    expect(penaltyIds(edLine({ vitals: LOW, rhythm: { profile: 'svt', hr: 170 } }), 7, ['inotrope'])).toEqual(['inotrope-unsupported-hypotension']);
    expect(penaltyIds(edLine({ rhythm: { profile: 'afib', hr: 140 } }), 7, ['inotrope'])).toEqual(['inotrope-tachyarrhythmia']);
  });

  it('low output with the pressure held up by a vasopressor: none; it holds the systolic and speeds the sinus rate a little', () => {
    expect(penaltyIds(edLine({ vitals: LOW }), 7, ['pressor', 'inotrope'])).toEqual([]);
    const s = run(edLine({ vitals: { sbp: 96, dbp: 60 } }), 7, ['inotrope']);
    expect(s.penalties).toEqual([]);
    expect([s.vitals.sbp, s.vitals.dbp, s.rhythm.hr]).toEqual([98, 56, 86]);
    expect(s.flags.inotrope).toBeDefined();
  });

  it('same-id case rules replace them', () => {
    const harms = ['inotrope-lvot-obstruction', 'inotrope-unsupported-hypotension', 'inotrope-tachyarrhythmia'].map((id) => exempt(id, ['inotrope']));
    expect(penaltyIds(edLine({ vitals: LOW, problems: ['lvot-obstruction'], harms }), 7, ['inotrope'])).toEqual([]);
  });
});

describe('furosemide: a low pressure, a preload-dependent heart, no urine, no congestion (in that order)', () => {
  it('each fires in its state, and the one before it wins for one dose', () => {
    expect(penaltyIds(edLine({ vitals: LOW, problems: ['tamponade', 'dialysis'] }), 7, ['furosemide'])).toEqual(['furosemide-hypotension']);
    for (const problems of [['tamponade'], ['pulmonary-embolism'], ['rv-infarction'], ['lvot-obstruction'], ['severe-aortic-stenosis']] as const) {
      expect(penaltyIds(edLine({ problems: [...problems, 'dialysis', 'pulmonary-edema'] }), 7, ['furosemide']), problems[0]).toEqual(['furosemide-preload-dependent']);
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
    expect(penaltyIds(fixture({ setting: 'field', role: 1, rhythm: SINUS }), 1, ['sit-up'])).toEqual([]);
    expect(penaltyIds(fixture({ setting: 'field', role: 1, rhythm: SINUS, vitals: LOW, harms: [exempt('sit-up-low-pressure', ['sit-up'])] }), 1, ['sit-up'])).toEqual([]);
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

describe('IV nitroglycerin and calcium gluconate reach the existing rules', () => {
  it('IV nitroglycerin: the high-dose effect, repeatable 3 times; with a systolic of 85 the nitrate rule fires', () => {
    const s = run(edLine({ vitals: { sbp: 200, dbp: 110, pain: 4 } }), 7, ['nitro-iv', 'nitro-iv']);
    expect(s.log.filter((l) => /^(Nitroglycerin 400|The nitroglycerin infusion)/.test(l.text)).map((l) => l.text)).toEqual(['Nitroglycerin 400 mcg IV over 2 minutes, then the infusion at 100 mcg/min.', 'The nitroglycerin infusion titrated up, with the pressure checked every few minutes.']);
    expect(s.vitals.sbp).toBe(160);
    expect(s.flags).toMatchObject({ nitro: expect.any(Number), 'nitro-high': expect.any(Number), 'nitro-iv': expect.any(Number) });
    expect(INTERVENTION_BY_ID['nitro-iv']).toMatchObject({ repeatable: true, maxTimes: 3 });
    expect(penaltyIds(edLine({ vitals: { sbp: 85, dbp: 50 } }), 7, ['nitro-iv'])).toContain('nitro-hypotension');
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
    expect(s.log.at(-1)!.text).toBe('Stopped: heparin — off at the pump, no more boluses, and the orders say so.');
    expect(s.flags['antithrombotics-stopped']).toBeDefined();
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
