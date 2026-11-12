import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '@/data/content';
import { resolveProfile } from '@/lib/ecg/profiles';
import { criticalsFor, perform, review, start, stop, takeHint } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { stableVtField as sc } from '@/lib/sim/scenario/scenarios/stableVtField';
import type { SimState } from '@/lib/sim/scenario/types';
import { UNTIL_ARRIVED, readAfter, runScenario as run } from './helpers';

const R = (n: number) => Array<string>(n).fill('reassess');
const penalties = (s: SimState) => s.penalties.map((p) => p.id);
const missed = (s: SimState) => review(sc, stop(s)).toFix.filter((t) => t.kind === 'missed').map((t) => t.label);

/** The paramedic's ideal run: pads, a blood pressure, the 12-lead, history, IV, medical control, amiodarone, transport; the repeat 12-lead once it breaks */
const IDEAL = ['primary', 'pads', 'nibp', 'ecg12', 'sample', 'iv', 'med-control', 'amio-infusion', 'transport-pci', ...R(6), 'ecg12-repeat', UNTIL_ARRIVED, 'handoff'];
/** The same with procainamide, which breaks it sooner */
const IDEAL_PROCAINAMIDE = ['primary', 'pads', 'nibp', 'ecg12', 'sample', 'iv', 'med-control', 'procainamide', 'transport-pci', ...R(4), 'ecg12-repeat', UNTIL_ARRIVED, 'handoff'];
/** To the point where the drug decision is made: monitored, padded, read, history, IV */
const WORKED_UP = ['primary', 'pads', 'nibp', 'ecg12', 'sample', 'iv'];

const giveaway = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture|\bVT\b|wide-complex/i;
const BRITISH = /haem|aemia|ischaem|oedem|synchronis|equalis|hyperaem|centre|levell|manoeuvre|nebulis|analyse\b|organis|colour|\bgrey|litres|metres|optimis|minimis|catheteris|heparinis|recognis|shovell|ventricularis/i;

function expectFullMarks(s: SimState) {
  expect(s.ended?.reason).toBe('complete');
  expect(s.pulse).toBe(true);
  const r = review(sc, s);
  expect(r.toFix).toEqual([]);
  expect(r.penaltyPoints).toBe(0);
  expect(r.percent).toBe(100);
  expect(r.grade).toBe('Excellent');
  expect(r.outcome).toMatch(/^Every critical intervention done in \d+:\d\d\.$/);
  for (const t of r.timings) if (t.met !== null) expect(t.met, t.label).toBe(true);
}

describe('stable VT in the field: the case itself', () => {
  it('refers only to interventions, rhythms and a condition that exist, each critical item reachable in the paramedic\'s scope', () => {
    expect(sc.setting).toBe('field');
    expect(sc.roles).toEqual([2]);
    expect(CONDITIONS[sc.conditionId!]).toBeDefined();
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe('vt');
    for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `respond ${id}`).toBeDefined();
    for (const h of sc.harms) for (const id of h.actions) expect(INTERVENTION_BY_ID[id], `harm ${id}`).toBeDefined();
    for (const t of sc.timings ?? []) for (const id of t.actions) expect(INTERVENTION_BY_ID[id], `timing ${id}`).toBeDefined();
    const scope = new Set(interventionsFor(2, 'field').map((i) => i.id));
    for (const c of criticalsFor(sc, 2)) {
      const ids = Array.isArray(c.done) ? c.done : c.uses ?? [];
      expect(ids.some((id) => scope.has(id)), c.id).toBe(true);
    }
    // the case does not say he has a problem the drug rules read: no heart failure, so procainamide is an option
    expect(sc.problems).toBeUndefined();
  });

  it('opens awake and stable: a fast regular pulse of 150 and a normal pressure, the monitor showing only numbers', () => {
    const s = run(sc, 2, ['primary', 'pads', 'nibp']);
    expect(s.rhythm).toEqual({ profile: 'vt', hr: 150 });
    expect(s.log.at(-1)).toMatchObject({ who: 'monitor', text: 'NIBP 118/76 mmHg.' });
    expect(run(sc, 2, ['monitor']).log.at(-1)!.text).toBe('Monitor attached: heart rate 150.');
  });

  it('a hint before the 12-lead never says which tachycardia it is', () => {
    // a pulse of 150 is plainly fast; what the learner must work out from the tracing is wide or narrow, and from where
    const which = /\bVT\b|ventricular|wide|monomorphic|SVT|AVNRT|sinus|fibrillation|flutter/i;
    let s = start(sc, 2);
    for (let i = 0; i < 4; i++) {
      s = takeHint(sc, s);
      expect(s.log.at(-1)!.text, s.log.at(-1)!.text).not.toMatch(which);
      s = perform(sc, s, ['pads', 'nibp', 'sample', 'primary'][i]);
    }
  });
});

describe('stable VT in the field: ideal runs end by themselves with full marks', () => {
  it('amiodarone: it slows, then breaks after about 14 minutes; the repeat 12-lead is read', () => {
    const s = run(sc, 2, IDEAL);
    expectFullMarks(s);
    expect(s.fired).toContain('drug-breaks');
    expect(s.fired).not.toContain('unstable-delay');
    expect(s.rhythm.profile).toBe('normal-sinus');
    expect(s.reads.map((r) => r.answer)).toEqual(['vt', 'nsr']);
    const amio = s.performed.find((p) => p.id === 'amio-infusion')!.minute;
    expect(s.flags['drug-converted'] - amio).toBeGreaterThanOrEqual(14);
    expect(s.log.some((l) => l.who === 'monitor' && l.text === 'Rate 132. BP 112/72.')).toBe(true);
  });

  it('procainamide: it breaks sooner than amiodarone, also with full marks', () => {
    const s = run(sc, 2, IDEAL_PROCAINAMIDE);
    expectFullMarks(s);
    const proc = s.performed.find((p) => p.id === 'procainamide')!.minute;
    const broke = s.flags['drug-converted'] - proc;
    expect(broke).toBeGreaterThanOrEqual(10);
    expect(broke).toBeLessThan(14);
    expect(s.log.some((l) => /stop at 17 mg\/kg/.test(l.text))).toBe(true);
    expect(s.log.some((l) => /Procainamide stopped/.test(l.text))).toBe(true);
  });

  it('every rhythm the runs reach is a real ECG profile, and no monitor line names the rhythm', () => {
    const runs = [IDEAL, IDEAL_PROCAINAMIDE, [...WORKED_UP, 'diltiazem', 'sedation', 'cardiovert'], ['pads', 'defib', 'defib'],
      [...WORKED_UP, ...R(6), ...R(3), 'defib'], [...WORKED_UP, 'adenosine6', 'adenosine12', 'lidocaine', 'metoprolol']];
    for (const steps of runs) {
      const s = run(sc, 2, steps, (st) => expect(resolveProfile(st.rhythm.profile).id, st.rhythm.profile).toBe(st.rhythm.profile));
      for (const l of s.log) if (l.who === 'monitor') expect(l.text, l.text).not.toMatch(giveaway);
      for (const l of s.log) expect(l.text, l.text).not.toMatch(BRITISH);
    }
    expect(JSON.stringify(sc)).not.toMatch(BRITISH);
  });

  it('a misread 12-lead is corrected and costs points, but the 12-lead of the tachycardia still counts as recorded', () => {
    const s = run(sc, 2, readAfter(['primary', 'pads', 'nibp', 'ecg12'], 'ecg12', 'svt'), undefined, 'manual');
    expect(s.reads[0]).toMatchObject({ answer: 'vt', chosen: 'svt', verdict: 'wrong' });
    expect(s.log.at(-1)!.text).toMatch(/^Not quite — this is Ventricular tachycardia \(monomorphic\)\. .*AV dissociation/);
    expect(missed(s)).not.toContain('12-lead of the tachycardia, before it is treated');
  });
});

describe('stable VT in the field: the traps', () => {
  it('diltiazem crashes the pressure without slowing it: a critical error, and now he is unstable', () => {
    const s = run(sc, 2, [...WORKED_UP, 'diltiazem']);
    expect(s.rhythm).toEqual({ profile: 'vt', hr: 150 });
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([76, 44]);
    expect(s.flags.unstable).toBeDefined();
    expect(s.penalties).toEqual([expect.objectContaining({ id: 'ccb-wide-complex', severity: 'critical', points: 15 })]);
    expect(s.log.some((l) => l.who === 'monitor' && l.text === 'Rate still 150, but BP falls to 76/44.')).toBe(true);
    expect(review(sc, stop(s)).toFix[0]).toMatchObject({ kind: 'harm', label: 'Diltiazem for a regular wide-complex tachycardia.' });
  });

  it('after diltiazem, left unshocked he loses his pulse within 6 minutes; a shock brings him back', () => {
    let s = run(sc, 2, [...WORKED_UP, 'diltiazem']);
    const at = s.flags.unstable;
    while (s.pulse && !s.ended) s = perform(sc, s, 'reassess');
    expect(s.rhythm.profile).toBe('pvt');
    expect(s.minute - at).toBeGreaterThanOrEqual(6);
    expect(s.log.some((l) => l.who === 'monitor' && l.text === 'Monitor alarm!')).toBe(true);
    s = perform(sc, s, 'defib');
    expect(s.pulse).toBe(true);
    expect(s.rhythm.profile).toBe('sinus-tachycardia');
    expect(penalties(s)).toEqual(['ccb-wide-complex']);
    const r = review(sc, stop(s));
    expect(r.toFix.some((t) => t.kind === 'missed' && /synchronized cardioversion/.test(t.label))).toBe(true);
    expect(r.wentWell.some((t) => /defibrillate/.test(t.label))).toBe(true);
  });

  it('after diltiazem, sedation and a synchronized shock at 100 J within 3 minutes convert him', () => {
    const s = run(sc, 2, [...WORKED_UP, 'diltiazem', 'sedation', 'cardiovert']);
    expect(s.rhythm).toEqual({ profile: 'normal-sinus', hr: 84 });
    expect(s.vitals.sbp).toBeGreaterThanOrEqual(100);
    expect(penalties(s)).toEqual(['ccb-wide-complex']);
    const r = review(sc, stop(s));
    expect(r.wentWell.map((t) => t.label)).toEqual(expect.arrayContaining(['Unstable: synchronized cardioversion at 100 J within 3 minutes', 'Sedation before the cardioversion (he was awake)']));
    // the wrong drug is not the right one: the antiarrhythmic item is missed
    expect(r.toFix.some((t) => t.kind === 'missed' && /One antiarrhythmic/.test(t.label))).toBe(true);
  });

  it('calcium after the diltiazem lifts the pressure a little, at no cost — but he stays unstable; without diltiazem it has no indication', () => {
    const dil = run(sc, 2, [...WORKED_UP, 'diltiazem']);
    const ca = perform(sc, dil, 'calcium-chloride');
    expect(penalties(ca)).toEqual(['ccb-wide-complex']);
    expect(ca.vitals.sbp).toBe(86);
    expect(ca.flags.unstable).toBeDefined();
    expect(ca.rhythm.profile).toBe('vt');
    expect(penalties(run(sc, 2, [...WORKED_UP, 'calcium-chloride']))).toEqual(['calcium-no-indication']);
  });

  it('an unsynchronized shock with a pulse sets off VF and is penalized once; the AED or the defibrillator then converts it', () => {
    const s = run(sc, 2, ['pads', 'defib']);
    expect(s.pulse).toBe(false);
    expect(s.rhythm.profile).toBe('vf');
    expect(s.penalties).toEqual([expect.objectContaining({ id: 'shock-with-pulse', severity: 'critical', points: 20 })]);
    for (const shock of ['aed', 'defib']) {
      const after = perform(sc, s, shock);
      expect(after.pulse, shock).toBe(true);
      expect(after.rhythm.profile, shock).toBe('sinus-tachycardia');
      expect(penalties(after), shock).toEqual(['shock-with-pulse']);
    }
  });

  it('an AED on him while he has a pulse advises no shock, changes nothing and costs nothing', () => {
    const s = run(sc, 2, ['primary', 'aed']);
    expect(s.pulse).toBe(true);
    expect(s.rhythm).toEqual({ profile: 'vt', hr: 150 });
    expect(s.log.at(-1)!.text).toMatch(/No shock advised/);
    expect(s.penalties).toEqual([]);
  });

  it('two antiarrhythmics, either way round, cost one penalty in this case\'s words — not the built-in ones as well', () => {
    for (const [first, second] of [['amio-infusion', 'procainamide'], ['procainamide', 'amio-infusion']]) {
      const one = run(sc, 2, [...WORKED_UP, first]);
      const s = perform(sc, one, second);
      expect(penalties(s), second).toEqual(['two-antiarrhythmics']);
      expect(s.vitals.sbp, second).toBeLessThan(one.vitals.sbp - 10);
      expect(s.log.some((l) => l.who === 'monitor' && l.text === `Rate ${s.rhythm.hr}. BP ${s.vitals.sbp}/${s.vitals.dbp}.`), second).toBe(true);
    }
    // the second does not hurry the first: amiodarone first still takes its 14 minutes
    let s = run(sc, 2, [...WORKED_UP, 'amio-infusion', 'procainamide']);
    const amio = s.performed.find((p) => p.id === 'amio-infusion')!.minute;
    while (!s.fired.includes('drug-breaks') && !s.ended) s = perform(sc, s, 'reassess');
    expect(s.flags['drug-converted'] - amio).toBeGreaterThanOrEqual(14);
  });

  it('the 300 mg arrest dose of amiodarone with a pulse is penalized and drops the pressure', () => {
    const s = run(sc, 2, [...WORKED_UP, 'amio-arrest']);
    expect(penalties(s)).toEqual(['arrest-amio-with-pulse']);
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([96, 62]);
    expect(s.rhythm.profile).toBe('vt');
  });

  it('cardioverting him awake without sedation costs points', () => {
    const s = run(sc, 2, [...WORKED_UP, 'cardiovert']);
    expect(s.rhythm.profile).toBe('normal-sinus');
    expect(penalties(s)).toEqual(['no-sedation']);
    expect(s.log.some((l) => l.who === 'patient' && /Aagh/.test(l.text))).toBe(true);
    expect(missed(s)).toContain('Sedation before the cardioversion (he was awake)');
  });
});

describe('stable VT in the field: delay and the other responders', () => {
  it('with no antiarrhythmic by 15 minutes he becomes unstable; a drug then is a major error, a shock is right', () => {
    let s = run(sc, 2, [...WORKED_UP, ...R(5)]);
    expect(s.fired).toContain('unstable-delay');
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([84, 52]);
    expect(sc.facts.lungs).toBeDefined();
    expect(perform(sc, s, 'lungs').log.at(-1)!.text).toBe('Fine crackles at both bases.');
    // procainamide with this pressure: one penalty, this case's, not the built-in one as well
    expect(penalties(perform(sc, s, 'procainamide'))).toEqual(['drug-while-unstable']);
    expect(penalties(perform(sc, s, 'amio-infusion'))).toEqual(['drug-while-unstable']);
    expect(s.vitals.spo2).toBe(93);
    s = perform(sc, perform(sc, s, 'sedation'), 'cardiovert');
    expect(s.rhythm.profile).toBe('normal-sinus');
    // out of the tachycardia his oxygenation and breathing settle again
    expect([s.vitals.spo2, s.vitals.rr]).toEqual([96, 18]);
    expect(s.penalties).toEqual([]);
    const r = review(sc, stop(s));
    expect(r.toFix.some((t) => t.kind === 'missed' && /One antiarrhythmic/.test(t.label))).toBe(true);
    expect(r.timings.find((t) => t.label === 'Synchronized cardioversion once unstable')?.met).toBe(true);
  });

  it('an antiarrhythmic started in time keeps him stable until it works', () => {
    let s = run(sc, 2, [...WORKED_UP, 'amio-infusion']);
    for (let i = 0; i < 8 && !s.fired.includes('drug-breaks'); i++) s = perform(sc, s, 'reassess');
    expect(s.fired).toContain('drug-breaks');
    expect(s.fired).not.toContain('unstable-delay');
    expect(s.flags.unstable).toBeUndefined();
  });

  it('adenosine (regular, monomorphic) does nothing to it and costs nothing', () => {
    const s = run(sc, 2, [...WORKED_UP, 'adenosine6', 'adenosine12']);
    expect(s.rhythm).toEqual({ profile: 'vt', hr: 150 });
    expect(s.log.at(-1)).toMatchObject({ who: 'monitor', text: 'No pause and no change: rate still 150.' });
    expect(s.penalties).toEqual([]);
  });

  it('lidocaine changes nothing and is a minor error; amiodarone after it is not counted as stacking', () => {
    const s = run(sc, 2, [...WORKED_UP, 'lidocaine']);
    expect(s.rhythm).toEqual({ profile: 'vt', hr: 150 });
    expect(penalties(s)).toEqual(['lidocaine-not-first']);
    expect(penalties(perform(sc, s, 'amio-infusion'))).toEqual(['lidocaine-not-first']);
    expect(missed(s)).toContain('One antiarrhythmic infusion: procainamide, or amiodarone 150 mg over 10 minutes');
  });

  it('metoprolol lowers the pressure without slowing it: a minor error', () => {
    const s = run(sc, 2, [...WORKED_UP, 'metoprolol']);
    expect(s.rhythm.hr).toBe(150);
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([106, 68]);
    expect(penalties(s)).toEqual(['beta-blocker-vt']);
  });

  it('medical control is the expert consultation, and its advice follows where he is — without naming the rhythm', () => {
    const early = run(sc, 2, ['primary', 'med-control']);
    expect(early.log.at(-1)).toMatchObject({ who: 'hospital', text: expect.stringMatching(/get a 12-lead/) });
    const planned = run(sc, 2, [...WORKED_UP, 'med-control']);
    expect(planned.log.at(-1)!.text).toMatch(/One antiarrhythmic only.*No diltiazem or verapamil/);
    const unstable = run(sc, 2, [...WORKED_UP, 'diltiazem', 'med-control']);
    expect(unstable.log.at(-1)!.text).toMatch(/unstable — synchronized cardioversion now at 100 J/);
    for (const s of [early, planned, unstable]) {
      expect(s.log.at(-1)!.text).not.toMatch(/\bVT\b|ventricular|tachycardia/i);
      expect(s.flags['med-control']).toBeDefined();
    }
    expect(missed(planned)).not.toContain('Expert consultation: online medical control');
  });

  it('a 12-lead only after it has stopped does not count as the 12-lead of the tachycardia', () => {
    const s = run(sc, 2, ['primary', 'pads', 'nibp', 'iv', 'sedation', 'cardiovert', 'ecg12']);
    expect(s.reads.map((r) => r.answer)).toEqual(['nsr']);
    expect(missed(s)).toContain('12-lead of the tachycardia, before it is treated');
  });

  it('teaches the 2025 algorithm: 100 J for monomorphic VT, adenosine only if regular and monomorphic, procainamide\'s stop rules, no sotalol', () => {
    const text = [...sc.teaching, ...sc.critical.map((c) => c.why)].join(' ');
    expect(text).toMatch(/monomorphic VT 100 J/);
    expect(text).toMatch(/adenosine only if it is regular and monomorphic/);
    expect(text).toMatch(/17 mg\/kg/);
    expect(text).toMatch(/COR 3, Harm/);
    expect(text).toMatch(/Sotalol is no longer in the 2025 algorithm/);
    expect(text).not.toMatch(/50–100 J|120–200 J/);
  });
});
