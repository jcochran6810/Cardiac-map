/**
 * The built-in rules for supportive care (rules/support.ts): each one fires when it should, stays silent in the nearest
 * correct state, gives way to a case rule with its id, and earns one penalty for one dose where several rules judge
 * the same action (the gate order in support.ts).
 */
import { describe, expect, it } from 'vitest';
import type { FixtureSpec } from './ruleFixture';
import { fixture, penaltyIds } from './ruleFixture';
import type { Harm, Problem } from '@/lib/sim/scenario/types';
import type { LearningLevel } from '@/store/useAppStore';

const SINUS = { profile: 'normal-sinus', hr: 80 };
const SLOW = { profile: 'sinus-bradycardia', hr: 40 };
const VF = { profile: 'vf', hr: 0 };
const LOW = { sbp: 82, dbp: 50 };
const VERY_LOW = { sbp: 70, dbp: 40 };

/** A case rule with a built-in's id that never charges: it replaces the built-in always (a deliberate exemption) */
const exempt = (id: string, actions: string[]): Harm => ({ id, actions, when: () => false, points: 1, severity: 'minor', text: 'The case judges this itself.' });

/** The penalties a run earns, for a fixture written for one role */
function ids(role: LearningLevel, spec: Omit<FixtureSpec, 'role' | 'setting' | 'rhythm'> & Partial<Pick<FixtureSpec, 'setting' | 'rhythm'>>, steps: string[]) {
  const setting = spec.setting ?? (role <= 2 ? 'field' : role <= 5 ? 'cathlab' : 'ed');
  return penaltyIds(fixture({ rhythm: SINUS, ...spec, setting, role }), role, steps);
}
const withProblems = (...problems: Problem[]) => ({ problems });

describe('vasopressors: the infusion and push-dose epinephrine', () => {
  it('pressor-no-hypotension: a pressor with a systolic of 90 or more and a MAP of 65 or more', () => {
    for (const drug of ['pressor', 'push-epi']) {
      expect(ids(2, {}, ['iv', drug]), drug).toEqual(['pressor-no-hypotension']);
      // the nearest correct states: a low pressure, a slow rate of its own, a beta- or calcium-channel-blocker overdose
      expect(ids(2, { vitals: LOW }, ['iv', drug]), drug).toEqual([]);
      expect(ids(2, { rhythm: SLOW }, ['iv', drug]), drug).toEqual([]);
      expect(ids(2, withProblems('beta-blocker-overdose'), ['iv', drug]), drug).toEqual([]);
      // a systolic of 92 with a MAP under 65 is still low
      expect(ids(2, { vitals: { sbp: 92, dbp: 48 } }, ['iv', drug]), drug).toEqual([]);
      expect(ids(2, { harms: [exempt('pressor-no-hypotension', ['pressor', 'push-epi'])] }, ['iv', drug]), drug).toEqual([]);
    }
    // over an LVAD the Doppler MAP decides
    expect(ids(2, { lvad: true, vitals: { sbp: 84, dbp: 74 } }, ['iv', 'pressor'])).toEqual(['pressor-no-hypotension']);
    expect(ids(2, { lvad: true, vitals: { sbp: 62, dbp: 56 } }, ['iv', 'pressor'])).toEqual([]);
  });

  it('push-epi-in-arrest: push-dose epinephrine is not the arrest dose', () => {
    expect(ids(2, { pulse: false, rhythm: VF }, ['iv', 'push-epi'])).toEqual(['push-epi-in-arrest']);
    expect(ids(2, { vitals: LOW }, ['iv', 'push-epi'])).toEqual([]);
    expect(ids(2, { pulse: false, rhythm: VF, harms: [exempt('push-epi-in-arrest', ['push-epi'])] }, ['iv', 'push-epi'])).toEqual([]);
    // the arrest rule first: one penalty, whatever else the patient has
    expect(ids(7, { pulse: false, rhythm: VF, ...withProblems('lvot-obstruction', 'bleeding') }, ['iv', 'push-epi'])).toEqual(['push-epi-in-arrest']);
  });

  it('catecholamine-lvoto: no catecholamine with dynamic outflow obstruction, whatever the pressure', () => {
    const lvoto = withProblems('lvot-obstruction');
    for (const drug of ['pressor', 'push-epi']) {
      expect(ids(5, { ...lvoto, vitals: LOW }, ['iv', drug]), drug).toEqual(['catecholamine-lvoto']);
      // the gate: with a normal pressure, or bleeding with no volume yet, still one penalty
      expect(ids(5, lvoto, ['iv', drug]), drug).toEqual(['catecholamine-lvoto']);
      expect(ids(5, { ...withProblems('lvot-obstruction', 'bleeding'), vitals: LOW }, ['iv', drug]), drug).toEqual(['catecholamine-lvoto']);
    }
    expect(ids(5, { ...lvoto, vitals: LOW }, ['ic-epinephrine'])).toEqual(['catecholamine-lvoto']);
    expect(ids(5, lvoto, ['ic-epinephrine'])).toEqual(['catecholamine-lvoto']);
    // the nearest correct state: phenylephrine (a vasoconstrictor with no inotropic effect) for the low pressure
    expect(ids(5, { ...lvoto, vitals: LOW }, ['iv', 'phenylephrine'])).toEqual([]);
    expect(ids(5, { vitals: LOW }, ['iv', 'pressor'])).toEqual([]);
    expect(ids(5, { ...lvoto, vitals: LOW, harms: [exempt('catecholamine-lvoto', ['pressor', 'push-epi', 'ic-epinephrine'])] }, ['iv', 'pressor'])).toEqual([]);
  });

  it('pressor-before-volume: in a bleeding patient the volume goes in first', () => {
    const bleeding = { ...withProblems('bleeding'), vitals: VERY_LOW };
    for (const drug of ['pressor', 'push-epi']) {
      expect(ids(7, bleeding, ['iv', drug]), drug).toEqual(['pressor-before-volume']);
      expect(ids(7, bleeding, ['iv', 'fluid', drug]), drug).toEqual([]);
      expect(ids(7, { ...bleeding, harms: [exempt('pressor-before-volume', ['pressor', 'push-epi', 'phenylephrine'])] }, ['iv', drug]), drug).toEqual([]);
      // the gate: with a normal pressure the pressor has nothing to treat — that one penalty, not this one as well
      expect(ids(7, withProblems('bleeding'), ['iv', drug]), drug).toEqual(['pressor-no-hypotension']);
    }
    expect(ids(5, bleeding, ['iv', 'phenylephrine'])).toEqual(['pressor-before-volume']);
    expect(ids(5, bleeding, ['iv', 'transfuse', 'phenylephrine'])).toEqual([]);
    // phenylephrine's own rules come first
    expect(ids(5, withProblems('bleeding'), ['iv', 'phenylephrine'])).toEqual(['phenylephrine-no-hypotension']);
    expect(ids(5, { ...withProblems('bleeding'), rhythm: SLOW, vitals: VERY_LOW }, ['iv', 'phenylephrine'])).toEqual(['phenylephrine-slow']);
  });
});

describe('phenylephrine and intracoronary epinephrine', () => {
  it('phenylephrine-heart-failure: a pure vasoconstrictor loads a failing ventricle', () => {
    const failing = { ...withProblems('heart-failure'), vitals: LOW };
    expect(ids(5, failing, ['iv', 'phenylephrine'])).toEqual(['phenylephrine-heart-failure']);
    // the nearest correct states: no failing ventricle, outflow obstruction (phenylephrine is its drug), an LVAD
    expect(ids(5, { vitals: LOW }, ['iv', 'phenylephrine'])).toEqual([]);
    expect(ids(5, { ...withProblems('heart-failure', 'lvot-obstruction'), vitals: LOW }, ['iv', 'phenylephrine'])).toEqual([]);
    expect(ids(5, { ...withProblems('heart-failure'), lvad: true, vitals: { sbp: 62, dbp: 56 } }, ['iv', 'phenylephrine'])).toEqual([]);
    expect(ids(5, { ...failing, harms: [exempt('phenylephrine-heart-failure', ['phenylephrine'])] }, ['iv', 'phenylephrine'])).toEqual([]);
    // the gate: the existing phenylephrine rules, then the bleeding rule, come first — one penalty
    expect(ids(5, withProblems('heart-failure'), ['iv', 'phenylephrine'])).toEqual(['phenylephrine-no-hypotension']);
    expect(ids(5, { ...failing, rhythm: SLOW }, ['iv', 'phenylephrine'])).toEqual(['phenylephrine-slow']);
    expect(ids(5, { ...withProblems('heart-failure', 'bleeding'), vitals: LOW }, ['iv', 'phenylephrine'])).toEqual(['pressor-before-volume']);
  });

  it('ic-epi-no-indication: intracoronary epinephrine with a systolic of 110 or more', () => {
    expect(ids(5, {}, ['ic-epinephrine'])).toEqual(['ic-epi-no-indication']);
    expect(ids(5, { vitals: { sbp: 100, dbp: 60 } }, ['ic-epinephrine'])).toEqual([]);
    expect(ids(5, { harms: [exempt('ic-epi-no-indication', ['ic-epinephrine'])] }, ['ic-epinephrine'])).toEqual([]);
  });
});
