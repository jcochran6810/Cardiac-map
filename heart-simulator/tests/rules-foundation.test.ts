/**
 * The engine's rule semantics and the mechanics the contraindication rules build on: which case rule stands in for which
 * built-in (and when), the ER nurse's one act, one penalty, the flags and effects the engine adds, and the team
 * requests (labKit / edKit).
 */
import { describe, expect, it } from 'vitest';
import { BUILT_IN_HARMS, RN_ORDER_ONLY, perform, review, start } from '@/lib/sim/scenario/engine';
import { askCritical, askEvents, type LabAsk } from '@/lib/sim/scenario/labKit';
import { edOrder, standingOrders } from '@/lib/sim/scenario/edKit';
import { INDICATION_RULES, RN_ORDER_CRITICAL, SCOPE_RULES } from '@/lib/sim/scenario/rules/scope';
import { lastDoneAt, outflowObstruction, preloadDependent, slowOrBlocked } from '@/lib/sim/scenario/rules/helpers';
import type { Harm, Scenario, SimState } from '@/lib/sim/scenario/types';
import { fixture, penaltyIds } from './ruleFixture';
import { UNTIL_ARRIVED, runScenario } from './helpers';

const ids = (s: SimState) => s.penalties.map((p) => p.id);
const SINUS = { profile: 'normal-sinus', hr: 80 };
/** An ED patient with a low pressure: the built-in nitrate rule fires on nitroglycerin */
const lowEd = (role: 6 | 7, harms: Harm[] = [], extra: Partial<Scenario> = {}) =>
  fixture({ setting: 'ed', role, rhythm: SINUS, vitals: { sbp: 82, dbp: 50 }, harms, extra });
const caseRule = (over: Partial<Harm>): Harm => ({ id: 'case-nitro', actions: ['nitro'], points: 8, severity: 'major', text: 'The case\'s own words.', ...over });

describe('the built-in rules', () => {
  it('have unique ids, and every order-only drug has its scope rule', () => {
    const all = BUILT_IN_HARMS.map((h) => h.id);
    expect(new Set(all).size).toBe(all.length);
    for (const id of Object.keys(RN_ORDER_ONLY)) expect(all, id).toContain(`rn-without-order-${id}`);
    expect(BUILT_IN_HARMS.slice(-SCOPE_RULES.length)).toEqual(SCOPE_RULES);
  });
});

describe('a case rule stands in for a built-in only while it applies', () => {
  it('without a case rule the built-in charges', () => {
    expect(penaltyIds(lowEd(7), 7, ['nitro'])).toEqual(['nitro-hypotension']);
  });

  it('role-aware: a case rule written for the ER doctor does not hide the built-in from the ER nurse', () => {
    const harms = [caseRule({ roles: [7], replaces: ['nitro-hypotension'] })];
    expect(penaltyIds(lowEd(7, harms), 7, ['nitro'])).toEqual(['case-nitro']);
    expect(penaltyIds(lowEd(6, harms), 6, ['nitro'])).toEqual(['nitro-hypotension']);
  });

  it('a case rule whose `when` is false does not hide the built-in; when true, it does', () => {
    const harms = [caseRule({ when: (s) => 'later' in s.flags, replaces: ['nitro-hypotension'] })];
    expect(penaltyIds(lowEd(7, harms), 7, ['nitro'])).toEqual(['nitro-hypotension']);
    const later = lowEd(7, harms, { events: [{ id: 'later', when: () => true, effect: () => ({ flags: ['later'] }) }] });
    expect(penaltyIds(later, 7, ['nitro'])).toEqual(['case-nitro']);
  });

  it('a case rule that applies still stands in for the built-in after it has been charged once', () => {
    const harms = [caseRule({ when: (s) => s.pulse, replaces: ['nitro-hypotension'] })];
    expect(penaltyIds(lowEd(7, harms), 7, ['nitro', 'nitro', 'nitro'])).toEqual(['case-nitro']);
  });

  it('a case rule on another action does not stand in for this one', () => {
    const harms = [caseRule({ id: 'case-aspirin', actions: ['aspirin'], replaces: ['nitro-hypotension'] })];
    expect(penaltyIds(lowEd(7, harms), 7, ['nitro'])).toEqual(['nitro-hypotension']);
  });

  it('a case rule with the same id as a built-in replaces it always — for the roles it is written for', () => {
    const exempt = caseRule({ id: 'nitro-hypotension', when: () => false });
    expect(penaltyIds(lowEd(7, [exempt]), 7, ['nitro'])).toEqual([]);
    const doctorsOnly = { ...exempt, roles: [7 as const] };
    expect(penaltyIds(lowEd(7, [doctorsOnly]), 7, ['nitro'])).toEqual([]);
    expect(penaltyIds(lowEd(6, [doctorsOnly]), 6, ['nitro'])).toEqual(['nitro-hypotension']);
  });

  it('Harm.when receives the action being judged', () => {
    const seen: string[] = [];
    const harms = [caseRule({ id: 'by-action', actions: ['nitro', 'aspirin'], when: (_s, _sc, id) => { seen.push(id); return id === 'aspirin'; } })];
    const sc = fixture({ setting: 'ed', role: 7, rhythm: SINUS, harms });
    expect(penaltyIds(sc, 7, ['nitro', 'aspirin'])).toEqual(['by-action']);
    // (the engine may ask a rule more than once per action: whether it applies, then whether it charges)
    expect(seen.filter((id, i) => seen.indexOf(id) === i)).toEqual(['nitro', 'aspirin']);
  });
});

describe('the ER nurse: one act, one penalty', () => {
  const nurse = (over: Partial<Parameters<typeof fixture>[0]> = {}) => fixture({ setting: 'ed', role: 6, rhythm: SINUS, ...over });

  it('a drug given without its order: the missing order covers the indication', () => {
    expect(INDICATION_RULES).toContain('calcium-no-indication');
    expect(penaltyIds(nurse(), 6, ['iv', 'calcium-chloride'])).toEqual(['rn-without-order-calcium-chloride']);
    // the ER doctor needs no order: the indication rule is the one penalty
    expect(penaltyIds(fixture({ setting: 'ed', role: 7, rhythm: SINUS }), 7, ['iv', 'calcium-chloride'])).toEqual(['calcium-no-indication']);
  });

  it('on the order, the indication rule judges the drug as for anyone else', () => {
    const ordered = nurse({ extra: { events: [standingOrders(['calcium-chloride'])] } });
    expect(penaltyIds(ordered, 6, ['iv', 'calcium-chloride'])).toEqual(['calcium-no-indication']);
  });

  it('once the missing order has been charged, a second dose meets the indication rule', () => {
    expect(penaltyIds(nurse(), 6, ['iv', 'calcium-chloride', 'calcium-chloride'])).toEqual(['rn-without-order-calcium-chloride', 'calcium-no-indication']);
  });

  it('a contraindication still applies on top of the missing order', () => {
    const failing = nurse({ rhythm: { profile: 'afib', hr: 140 }, problems: ['heart-failure'] });
    expect(penaltyIds(failing, 6, ['iv', 'diltiazem']).sort()).toEqual(['diltiazem-heart-failure', 'rn-without-order-diltiazem']);
  });

  it('a fibrinolytic without an order is critical (RN_ORDER_CRITICAL), and covers the missing indication', () => {
    expect(RN_ORDER_CRITICAL).toEqual(['alteplase']);
    const s = runScenario(nurse(), 6, ['iv', 'alteplase']);
    expect(ids(s)).toEqual(['rn-without-order-alteplase']);
    expect(s.penalties[0]).toMatchObject({ points: 15, severity: 'critical' });
    // the other order-only drugs stay at 5, major
    expect(runScenario(nurse(), 6, ['iv', 'calcium-chloride']).penalties[0]).toMatchObject({ points: 5, severity: 'major' });
    // the doctor: the indication rule
    expect(penaltyIds(fixture({ setting: 'ed', role: 7, rhythm: SINUS }), 7, ['iv', 'alteplase'])).toEqual(['lytic-no-indication']);
    // a dissection is a contraindication, not an indication: it still applies
    expect(penaltyIds(nurse({ problems: ['aortic-dissection'] }), 6, ['iv', 'alteplase']).sort()).toEqual(['lytic-dissection', 'rn-without-order-alteplase']);
  });

  it('a case rule that stands in for the missing order leaves the indication rules to judge', () => {
    const harms: Harm[] = [{ id: 'rn-calcium', actions: ['calcium-chloride'], roles: [6], points: 5, severity: 'major', text: 'Calcium with no order.', replaces: ['rn-without-order-calcium-chloride'] }];
    expect(penaltyIds(nurse({ harms }), 6, ['iv', 'calcium-chloride'])).toEqual(['calcium-no-indication', 'rn-calcium']);
  });
});

describe('the flags and effects the engine adds', () => {
  it('a reassessment prints the pressure, so it sets the flag bp — not with an LVAD, and not in an arrest', () => {
    const sc = fixture({ setting: 'field', role: 2, rhythm: SINUS });
    expect('bp' in start(sc, 2).flags).toBe(false);
    expect(runScenario(sc, 2, ['reassess']).flags.bp).toBeDefined();
    const lvad = fixture({ setting: 'field', role: 2, rhythm: SINUS, lvad: true, vitals: { sbp: 84, dbp: 72 } });
    expect('bp' in runScenario(lvad, 2, ['reassess']).flags).toBe(false);
    const arrest = fixture({ setting: 'field', role: 2, rhythm: { profile: 'vf', hr: 0 }, pulse: false });
    expect('bp' in runScenario(arrest, 2, ['reassess']).flags).toBe(false);
  });

  it('brady-seen: set the first time a slow heart of its own is on the monitor, and kept', () => {
    expect(start(fixture({ setting: 'ed', role: 7, rhythm: { profile: 'sinus-bradycardia', hr: 42 } }), 7).flags['brady-seen']).toBe(0);
    expect(start(fixture({ setting: 'ed', role: 7, rhythm: { profile: 'third-degree-avb', hr: 52 } }), 7).flags['brady-seen']).toBe(0);
    expect('brady-seen' in start(fixture({ setting: 'ed', role: 7, rhythm: SINUS }), 7).flags).toBe(false);
    // a pacer driving the rate is not a slow heart of its own
    expect('brady-seen' in start(fixture({ setting: 'ed', role: 7, rhythm: { profile: 'paced', hr: 70 } }), 7).flags).toBe(false);
    const slows = fixture({
      setting: 'ed', role: 7, rhythm: SINUS,
      extra: {
        events: [
          { id: 'slows', when: (s) => s.minute >= 2, effect: (s) => ({ rhythm: { profile: 'sinus-bradycardia', hr: 38 } }) },
          { id: 'recovers', when: (s) => s.minute >= 4, effect: () => ({ rhythm: SINUS }) },
        ],
      },
    });
    const s = runScenario(slows, 7, ['reassess', 'reassess', 'reassess']);
    expect(s.rhythm).toEqual(SINUS);
    expect(s.flags['brady-seen']).toBe(2);
  });

  it('Effect.penalty: a case charges a deterioration once per id, at the minute it happens', () => {
    const slid = { id: 'pressure-slid', points: 5, severity: 'major' as const, text: 'The pressure slid with no fluid.' };
    const sc = fixture({ setting: 'field', role: 2, rhythm: SINUS, extra: { respond: { reassess: () => ({ say: [['you', 'Worse.']], penalty: slid }) } } });
    const s = runScenario(sc, 2, ['reassess', 'reassess']);
    expect(s.penalties).toEqual([{ ...slid, minute: 2 }]);
    expect(review(sc, s).toFix.find((t) => t.kind === 'harm')?.label).toBe('The pressure slid with no fluid.');
  });

  it('Scenario.arrival can be a function of the patient\'s state', () => {
    const words = (s: SimState) => `Arrived with a pressure of ${s.vitals.sbp}.`;
    const sc = fixture({ setting: 'field', role: 2, rhythm: SINUS, extra: { arrival: words } });
    const s = runScenario(sc, 2, ['transport-near', UNTIL_ARRIVED]);
    expect(s.flags.arrived).toBeDefined();
    expect(s.log.some((l) => l.who === 'hospital' && l.text === `Arrived with a pressure of ${s.vitals.sbp}.`)).toBe(true);
    // a fixed line still works
    const fixed = fixture({ setting: 'field', role: 2, rhythm: SINUS, extra: { arrival: 'The door team meets you.' } });
    expect(runScenario(fixed, 2, ['transport-near', UNTIL_ARRIVED]).log.some((l) => l.text === 'The door team meets you.')).toBe(true);
  });
});

describe('the rule helpers', () => {
  const at = (performed: [string, number][]) => ({ performed: performed.map(([id, minute]) => ({ id, minute })) }) as SimState;

  it('lastDoneAt: the latest earlier dose of any of the ids, at or after `since`', () => {
    const s = at([['nitro', 1], ['aspirin', 2], ['nitro', 6], ['reassess', 8]]);
    expect(lastDoneAt(s, ['nitro'])).toBe(6);
    expect(lastDoneAt(s, ['nitro', 'aspirin'], 0)).toBe(6);
    expect(lastDoneAt(s, ['aspirin'])).toBe(2);
    expect(lastDoneAt(s, ['aspirin'], 3)).toBeNull();
    expect(lastDoneAt(s, ['heparin'])).toBeNull();
  });

  it('slowOrBlocked, preloadDependent and outflowObstruction', () => {
    const state = (profile: string, hr: number, flags: Record<string, number> = {}) => ({ ...start(fixture({ setting: 'ed', role: 7, rhythm: { profile, hr } }), 7), flags });
    expect(slowOrBlocked(state('sinus-bradycardia', 44))).toBe(true);
    expect(slowOrBlocked(state('mobitz-ii', 64))).toBe(true);
    expect(slowOrBlocked(state('normal-sinus', 80))).toBe(false);
    expect(slowOrBlocked(state('tcp', 70))).toBe(false);
    const tamponade = fixture({ setting: 'ed', role: 7, rhythm: SINUS, problems: ['tamponade'] });
    expect(preloadDependent(state('normal-sinus', 80), tamponade)).toBe(true);
    expect(preloadDependent(state('normal-sinus', 80, { drained: 5 }), tamponade)).toBe(false);
    expect(preloadDependent(state('normal-sinus', 80, { pericardiocentesis: 5 }), tamponade)).toBe(false);
    expect(preloadDependent(state('normal-sinus', 80), fixture({ setting: 'ed', role: 7, rhythm: SINUS, problems: ['rv-infarction'] }))).toBe(true);
    expect(preloadDependent(state('normal-sinus', 80), fixture({ setting: 'ed', role: 7, rhythm: SINUS }))).toBe(false);
    expect(outflowObstruction(fixture({ setting: 'cathlab', role: 5, rhythm: SINUS, problems: ['lvot-obstruction'] }))).toBe(true);
    expect(outflowObstruction(fixture({ setting: 'cathlab', role: 5, rhythm: SINUS }))).toBe(false);
  });
});

describe('team requests (labKit and edKit)', () => {
  /** The operator asks the lab nurse for heparin at minute 1, and gives it after 3 minutes */
  const HEPARIN: LabAsk = {
    id: 'heparin', role: 4, when: (s) => s.minute >= 1, ask: 'Heparin, please.', accept: ['heparin'], thanks: 'Thanks.',
    fallback: 'I will give it myself.', gives: 'heparin-given', label: 'Heparin on request', why: '…', wait: 3,
  };
  const lab = fixture({ setting: 'cathlab', role: 4, rhythm: SINUS, extra: { events: askEvents(HEPARIN), critical: [askCritical(HEPARIN)] } });
  const missed = (s: SimState) => review(lab, s).toFix.filter((t) => t.kind === 'missed').map((t) => t.label);

  it('an answer in time counts', () => {
    const s = runScenario(lab, 4, ['iv', 'heparin']);
    expect(s.fired).toContain('heparin-got');
    expect(missed(s)).toEqual([]);
  });

  it('an answer after the fallback is a second dose, not the answer: the item stays missed', () => {
    const late = runScenario(lab, 4, ['iv', 'reassess', 'reassess', 'heparin']);
    expect(late.fired).toContain('heparin-fallback');
    expect(late.fired).not.toContain('heparin-got');
    expect(missed(late)).toEqual(['Heparin on request']);
  });

  /** An ED patient who arrests at minute 1 and comes back at minute 5 */
  const arrestEvents = [
    { id: 'arrests', when: (s: SimState) => s.minute >= 1, effect: () => ({ pulse: false, rhythm: { profile: 'vf', hr: 0 } }) },
    { id: 'rosc', when: (s: SimState) => s.minute >= 5, effect: () => ({ pulse: true, rhythm: SINUS }) },
  ];
  const order = (over: Partial<LabAsk> = {}) => edOrder({
    id: 'fentanyl', when: () => true, ask: 'Fentanyl 50 micrograms, please.', accept: ['fentanyl'], thanks: 'Thanks.',
    fallback: 'I will give it.', gives: 'fentanyl-given', label: 'Fentanyl on the order', why: '…', wait: 3, ...over,
  });
  const nurse = (a: LabAsk, events: Scenario['events'] = []) => fixture({ setting: 'ed', role: 6, rhythm: SINUS, vitals: { pain: 7 }, extra: { events: [...events, ...askEvents(a)] } });

  it('holdInArrest: an ED order is not given, and nobody steps in, while there is no pulse', () => {
    expect(order().holdInArrest).toBe(true);
    // ordered while the patient is in arrest: it waits for the pulse
    const held = order({ when: (s) => s.minute >= 2 });
    const sc = nurse(held, arrestEvents);
    let s = runScenario(sc, 6, ['reassess']);
    expect(s.pulse).toBe(false);
    expect(s.fired).not.toContain('fentanyl-ask');
    s = runScenario(sc, 6, ['reassess', 'reassess', 'reassess']);
    expect(s.pulse).toBe(true);
    expect(s.fired).toContain('fentanyl-ask');
    // ordered before the arrest: the fallback waits for the pulse too
    const before = nurse(order(), arrestEvents);
    s = runScenario(before, 6, ['reassess', 'reassess']);
    expect(s.minute).toBeGreaterThanOrEqual(3);
    expect(s.fired).not.toContain('fentanyl-fallback');
    expect(runScenario(before, 6, ['reassess', 'reassess', 'reassess']).fired).toContain('fentanyl-fallback');
    // an order for the arrest itself is not held
    const forTheArrest = order({ when: (s) => !s.pulse, holdInArrest: false });
    expect(runScenario(nurse(forTheArrest, arrestEvents), 6, ['reassess']).fired).toContain('fentanyl-ask');
  });

  it('doses: an order for one dose is used up once given — a second needs another order', () => {
    const once = nurse(order({ doses: 1 }));
    const s = runScenario(once, 6, ['iv', 'fentanyl']);
    expect(ids(s)).toEqual([]);
    expect(s.fired).toContain('fentanyl-used');
    expect('ordered:fentanyl' in s.flags).toBe(false);
    expect(ids(perform(once, s, 'fentanyl'))).toEqual(['rn-without-order-fentanyl']);
    // two doses on the order, then a third without one
    expect(penaltyIds(nurse(order({ doses: 2 })), 6, ['iv', 'fentanyl', 'fentanyl'])).toEqual([]);
    expect(penaltyIds(nurse(order({ doses: 2 })), 6, ['iv', 'fentanyl', 'fentanyl', 'fentanyl'])).toEqual(['rn-without-order-fentanyl']);
    // an order without `doses` stays open (a titration)
    expect(penaltyIds(nurse(order()), 6, ['iv', 'fentanyl', 'fentanyl', 'fentanyl'])).toEqual([]);
  });
});
