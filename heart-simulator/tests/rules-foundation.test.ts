/**
 * The engine's rule semantics and the mechanics the contraindication rules build on: which case rule stands in for which
 * built-in (and when), the ER nurse's one act, one penalty, the flags and effects the engine adds, and the team
 * requests (labKit / edKit).
 */
import { describe, expect, it } from 'vitest';
import { DRUGS_OF, chargesPerDrug, drugsOf, sameDrug } from '@/lib/sim/scenario/rules/charge';
import { BUILT_IN_HARMS, RN_ORDER_ONLY, perform, review, start } from '@/lib/sim/scenario/engine';
import { askCritical, askEvents, askHarm, type LabAsk } from '@/lib/sim/scenario/labKit';
import { edOrder, standingOrders } from '@/lib/sim/scenario/edKit';
import { INDICATION_RULES, RN_ORDER_CRITICAL, SCOPE_RULES } from '@/lib/sim/scenario/rules/scope';
import { lastDoneAt, outflowObstruction, preloadDependent, slowOrBlocked } from '@/lib/sim/scenario/rules/helpers';
import { SCENARIO_BY_ID } from '@/lib/sim/scenario/scenarios';
import type { Effect, Harm, Scenario, SimState } from '@/lib/sim/scenario/types';
import { fixture, penaltyIds } from './ruleFixture';
import { INTERVENTION_BY_ID } from '@/lib/sim/scenario/interventions';
import { UNTIL_ARRIVED, runScenario } from './helpers';

const ids = (s: SimState) => s.penalties.map((p) => p.id);
const SINUS = { profile: 'normal-sinus', hr: 80 };
/** An ED patient with chest pain and a low pressure: the built-in nitrate rule fires on nitroglycerin */
const lowEd = (role: 6 | 7, harms: Harm[] = [], extra: Partial<Scenario> = {}) =>
  fixture({ setting: 'ed', role, rhythm: SINUS, vitals: { sbp: 82, dbp: 50, pain: 5 }, harms, extra });
/** The pressure taken and the PDE-5 question asked: the nitrate checklist the other nitrate rules read */
const CHECKED = ['vitals', 'ask-pde5'];
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
    expect(penaltyIds(lowEd(7, [exempt]), 7, [...CHECKED, 'nitro'])).toEqual([]);
    const doctorsOnly = { ...exempt, roles: [7 as const] };
    expect(penaltyIds(lowEd(7, [doctorsOnly]), 7, [...CHECKED, 'nitro'])).toEqual([]);
    expect(penaltyIds(lowEd(6, [doctorsOnly]), 6, ['nitro'])).toEqual(['nitro-hypotension']);
  });

  it('…and only for the actions it lists: for another action the built-in still judges', () => {
    // a rule outside any gate: oxygen with a normal saturation in an ACS, exempted for the cannula only
    const acs = (harms: Harm[]) => fixture({ setting: 'field', role: 2, rhythm: SINUS, problems: ['acs'], harms });
    const cannulaOnly: Harm = { id: 'oxygen-normoxic', actions: ['o2-nc'], when: () => false, points: 2, severity: 'minor', text: 'Not here.' };
    expect(penaltyIds(acs([cannulaOnly]), 2, ['o2-nc'])).toEqual([]);
    expect(penaltyIds(acs([cannulaOnly]), 2, ['o2-nrb'])).toEqual(['oxygen-normoxic']);
    // in a gate: an exemption for the sublingual tablet leaves the IV infusion to the built-in rank
    const tabletOnly = caseRule({ id: 'nitro-hypotension', actions: ['nitro'], when: () => false });
    expect(penaltyIds(lowEd(7, [tabletOnly]), 7, [...CHECKED, 'nitro'])).toEqual([]);
    expect(penaltyIds(lowEd(7, [tabletOnly]), 7, ['iv', 'nitro-iv'])).toEqual(['nitro-hypotension']);
  });

  it('Harm.when receives the action being judged', () => {
    const seen: string[] = [];
    const harms = [caseRule({ id: 'by-action', actions: ['nitro', 'aspirin'], when: (_s, _sc, id) => { seen.push(id); return id === 'aspirin'; } })];
    const sc = fixture({ setting: 'ed', role: 7, rhythm: SINUS, vitals: { pain: 5 }, harms });
    expect(penaltyIds(sc, 7, [...CHECKED, 'nitro', 'aspirin'])).toEqual(['by-action']);
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

  it('a case rule that stands in for the missing order covers the indication too: one act, one penalty', () => {
    const rnCalcium = (over: Partial<Harm> = {}): Harm => ({
      id: 'rn-calcium', actions: ['calcium-chloride'], roles: [6], points: 5, severity: 'major', text: 'Calcium with no order.', replaces: ['rn-without-order-calcium-chloride'], ...over,
    });
    expect(penaltyIds(nurse({ harms: [rnCalcium()] }), 6, ['iv', 'calcium-chloride'])).toEqual(['rn-calcium']);
    // still covered once the case rule has been charged: it applies to the second dose too
    expect(penaltyIds(nurse({ harms: [rnCalcium()] }), 6, ['iv', 'calcium-chloride', 'calcium-chloride'])).toEqual(['rn-calcium']);
    // a case rule with the order rule's own id (an exemption) stands in for it the same way
    const sameId = rnCalcium({ id: 'rn-without-order-calcium-chloride', replaces: undefined });
    expect(penaltyIds(nurse({ harms: [sameId] }), 6, ['iv', 'calcium-chloride'])).toEqual(['rn-without-order-calcium-chloride']);
    // while the case rule does not apply it stands in for nothing: the built-in order rule is back, and covers the indication
    const never = rnCalcium({ when: () => false });
    expect(penaltyIds(nurse({ harms: [never] }), 6, ['iv', 'calcium-chloride'])).toEqual(['rn-without-order-calcium-chloride']);
    // …and once that has been charged, a second dose meets the indication rule
    expect(penaltyIds(nurse({ harms: [never] }), 6, ['iv', 'calcium-chloride', 'calcium-chloride'])).toEqual(['rn-without-order-calcium-chloride', 'calcium-no-indication']);
    // a contraindication still applies on top of it
    const failing = nurse({ rhythm: { profile: 'afib', hr: 140 }, problems: ['heart-failure'], harms: [{ ...rnCalcium(), id: 'rn-diltiazem', actions: ['diltiazem'], replaces: ['rn-without-order-diltiazem'] }] });
    expect(penaltyIds(failing, 6, ['iv', 'diltiazem']).sort()).toEqual(['diltiazem-heart-failure', 'rn-diltiazem']);
  });

  it('a case rule for every role that stands in for the nurse\'s missing order is no order for the doctor', () => {
    const everyone: Harm = { id: 'case-calcium', actions: ['calcium-chloride'], points: 3, severity: 'minor', text: 'Calcium for nothing.', replaces: ['rn-without-order-calcium-chloride'] };
    expect(penaltyIds(fixture({ setting: 'ed', role: 7, rhythm: SINUS, harms: [everyone] }), 7, ['iv', 'calcium-chloride']).sort()).toEqual(['calcium-no-indication', 'case-calcium']);
    expect(penaltyIds(nurse({ harms: [everyone] }), 6, ['iv', 'calcium-chloride'])).toEqual(['case-calcium']);
  });
});

describe('the indication rules the missing order covers (INDICATION_RULES)', () => {
  const VF = { profile: 'vf', hr: 0 };
  const ed = (role: 6 | 7, over: Partial<Parameters<typeof fixture>[0]> = {}) => fixture({ setting: 'ed', role, rhythm: SINUS, ...over });
  const orderFor = (id: string): Partial<Scenario> => ({ events: [{ id: 'order', when: () => true, effect: () => ({ flags: [`ordered:${id}`] }) }] });

  it('lists the arrest, reperfusion, post-arrest and low-output indication rules', () => {
    for (const id of ['rate-drug-in-arrest', 'no-role-in-arrest', 'push-epi-in-arrest', 'lytic-pci-available', 'temp-control-no-indication', 'inotrope-no-indication']) {
      expect(INDICATION_RULES, id).toContain(id);
    }
    // the checks before a nitrate are made whether or not there is an order: they are not indication rules
    for (const id of ['nitro-no-bp', 'nitro-no-pde5', 'nitro-too-soon']) expect(INDICATION_RULES, id).not.toContain(id);
    expect(RN_ORDER_ONLY['temp-control']).toBe('Temperature control');
  });

  it('in an arrest: the ER nurse\'s unordered nitroglycerin, midazolam or push-dose epinephrine is the missing order alone', () => {
    for (const drug of ['nitro-high', 'midazolam', 'push-epi']) {
      expect(penaltyIds(ed(6, { rhythm: VF, pulse: false }), 6, ['io', drug]), drug).toEqual([`rn-without-order-${drug}`]);
    }
    expect(penaltyIds(ed(7, { rhythm: VF, pulse: false }), 7, ['io', 'midazolam'])).toEqual(['no-role-in-arrest']);
    expect(penaltyIds(ed(7, { rhythm: VF, pulse: false }), 7, ['io', 'push-epi'])).toEqual(['push-epi-in-arrest']);
    expect(penaltyIds(ed(6, { rhythm: VF, pulse: false, extra: orderFor('push-epi') }), 6, ['io', 'push-epi'])).toEqual(['push-epi-in-arrest']);
  });

  it('a STEMI that PCI can reach: the nurse\'s unordered alteplase is the critical missing order alone; the doctor\'s is the reperfusion choice', () => {
    const stemi = (role: 6 | 7) => ed(role, { rhythm: { profile: 'anterior-stemi', hr: 90 }, vitals: { pain: 7 } });
    expect(penaltyIds(stemi(6), 6, ['ecg12', 'iv', 'alteplase'])).toEqual(['rn-without-order-alteplase']);
    expect(penaltyIds(stemi(7), 7, ['ecg12', 'iv', 'alteplase'])).toEqual(['lytic-pci-available']);
    // a contraindication ranked under it still charges beside the missing order
    const pregnant = fixture({ setting: 'ed', role: 6, rhythm: { profile: 'anterior-stemi', hr: 90 }, problems: ['pregnancy'] });
    expect(penaltyIds(pregnant, 6, ['ecg12', 'iv', 'alteplase'])).toEqual(['lytic-relative', 'rn-without-order-alteplase']);
  });

  it('temperature control and an inotrope: the nurse without an order earns the missing order alone', () => {
    expect(penaltyIds(ed(6), 6, ['temp-control'])).toEqual(['rn-without-order-temp-control']);
    expect(penaltyIds(ed(7), 7, ['temp-control'])).toEqual(['temp-control-no-indication']);
    expect(penaltyIds(ed(6), 6, ['iv', 'inotrope'])).toEqual(['rn-without-order-inotrope']);
    expect(penaltyIds(ed(7), 7, ['iv', 'inotrope'])).toEqual(['inotrope-no-indication']);
  });

  it('the nurse\'s unordered 0.8 mg with no pressure taken: the missing order, and the pressure check beside it', () => {
    const htn = ed(6, { vitals: { sbp: 150, dbp: 90, pain: 6 } });
    expect(penaltyIds(htn, 6, ['ask-pde5', 'nitro-high'])).toEqual(['nitro-no-bp', 'rn-without-order-nitro-high']);
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

  it('a case that answers the reassessment itself sets bp too, so a pressure-before-nitroglycerin rule agrees', () => {
    const shared = { say: [['you', 'BP 132/80, heart rate 88.']] } as Effect;
    const noBp: Harm = { id: 'nitro-no-bp', actions: ['nitro'], when: (s) => !('bp' in s.flags), points: 5, severity: 'major', text: 'Nitroglycerin without a pressure.' };
    const sc = fixture({ setting: 'field', role: 2, rhythm: SINUS, vitals: { pain: 5 }, harms: [noBp], extra: { respond: { reassess: () => shared } } });
    const s = runScenario(sc, 2, ['reassess', 'ask-pde5', 'nitro']);
    expect(s.flags.bp).toBeDefined();
    expect(ids(s)).toEqual([]);
    expect(penaltyIds(sc, 2, ['nitro'])).toEqual(['nitro-no-bp']);
    // the case's own Effect object is left as it was
    expect(shared.flags).toBeUndefined();
  });

  it('a real case: reassess in the cocaine chest pain case shows the pressure before the nitroglycerin', () => {
    const cocaine = SCENARIO_BY_ID['cocaine-chest-pain-field'];
    const s = runScenario(cocaine, 2, ['primary', 'reassess', 'ask-pde5', 'nitro']);
    expect(s.flags.bp).toBeDefined();
    expect(ids(s)).not.toContain('nitro-no-bp');
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
    // a pacer driving the heart is not a slow heart of its own, even at a slow paced rate
    expect(slowOrBlocked(state('tcp', 40))).toBe(false);
    expect(slowOrBlocked(state('paced', 45))).toBe(false);
    const tamponade = fixture({ setting: 'ed', role: 7, rhythm: SINUS, problems: ['tamponade'] });
    expect(preloadDependent(state('normal-sinus', 80), tamponade)).toBe(true);
    expect(preloadDependent(state('normal-sinus', 80, { drained: 5 }), tamponade)).toBe(false);
    // a needle that did not relieve it (the sac filling again as fast as it drains) leaves the heart preload-dependent
    expect(preloadDependent(state('normal-sinus', 80, { pericardiocentesis: 5 }), tamponade)).toBe(true);
    // a tamponade that began mid-case (the flag), and once drained
    const plain = fixture({ setting: 'ed', role: 7, rhythm: SINUS });
    expect(preloadDependent(state('normal-sinus', 80, { tamponade: 3 }), plain)).toBe(true);
    expect(preloadDependent(state('normal-sinus', 80, { tamponade: 3, drained: 6 }), plain)).toBe(false);
    // the engine's default drain sets 'drained' for a tamponade, and only 'pericardiocentesis' without one
    const drainedNow = runScenario(fixture({ setting: 'ed', role: 7, rhythm: SINUS, problems: ['tamponade'] }), 7, ['pocus', 'pericardiocentesis']);
    expect(drainedNow.flags.drained).toBeDefined();
    expect(preloadDependent(drainedNow, tamponade)).toBe(false);
    expect('drained' in runScenario(plain, 7, ['pocus', 'pericardiocentesis']).flags).toBe(false);
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

  it('a wrong answer and a drug rule on one dose: the heavier charges alone; a tie keeps the wrong answer; a nitrate check charges beside', () => {
    // the nurse asked for heparin hands nitroglycerin instead (a wrong answer worth 3)
    const WRONG: LabAsk = { ...HEPARIN, wrong: ['nitro', 'nitro-high', 'atropine'] };
    const asked = (vitals: Partial<SimState['vitals']>, rhythm = SINUS) => fixture({
      setting: 'cathlab', role: 4, rhythm, vitals: { pain: 5, ...vitals },
      harms: [askHarm(WRONG, 'Not what the operator asked for.')], extra: { events: askEvents(WRONG) },
    });
    expect(askHarm(WRONG, 'x').wrongAnswer).toBe(true);
    // a low pressure: nitro-hypotension (8) outweighs it — the contraindication alone
    expect(penaltyIds(asked({ sbp: 82, dbp: 50 }), 4, ['iv', 'reassess', 'nitro'])).toEqual(['nitro-hypotension']);
    // a tie (3 and 3): atropine with a normal rate — the wrong answer alone, in the case's words
    expect(penaltyIds(asked({}), 4, ['iv', 'reassess', 'atropine'])).toEqual(['wrong-heparin']);
    // nothing else wrong with the drug: the wrong answer
    expect(penaltyIds(asked({}), 4, ['iv', 'reassess', 'nitro'])).toEqual(['wrong-heparin']);
    // in the department the checks before a nitrate are each a mistake of their own: they charge beside the wrong answer
    const pain: LabAsk = edOrder({
      id: 'fentanyl', when: () => true, ask: 'Fentanyl 50 micrograms, please.', accept: ['fentanyl'], wrong: ['nitro'], thanks: 'Thanks.',
      fallback: 'I will give it.', gives: 'fentanyl-given', label: 'Fentanyl on the order', why: '…', wait: 3,
    });
    const ed = fixture({ setting: 'ed', role: 6, rhythm: SINUS, vitals: { pain: 7 }, harms: [askHarm(pain, 'Not the drug ordered.')], extra: { events: askEvents(pain) } });
    expect(penaltyIds(ed, 6, ['nitro'])).toEqual(['nitro-no-bp', 'wrong-fentanyl']);
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

  it('doses counts only the doses given since the order: one given before it leaves the order its own dose', () => {
    const after = nurse(order({ doses: 1, when: (s) => s.performed.some((p) => p.id === 'fentanyl') }));
    const s = runScenario(after, 6, ['iv', 'fentanyl']);
    expect(ids(s)).toEqual(['rn-without-order-fentanyl']);
    expect(s.fired).toContain('fentanyl-ask');
    expect(s.fired).not.toContain('fentanyl-used');
    expect('ordered:fentanyl' in s.flags).toBe(true);
    const next = perform(after, s, 'fentanyl');
    expect(ids(next)).toEqual(['rn-without-order-fentanyl']);
    expect(next.fired).toContain('fentanyl-used');
    expect('ordered:fentanyl' in next.flags).toBe(false);
  });
});

/**
 * The cases whose own rules stand in for a built-in: since a case rule replaces it only while it applies, each case rule that
 * judges a dose in a state lists the built-ins that would also charge that dose there (one dose, one penalty)
 */
describe('in the cases: one dose, one penalty in every state a case rule speaks for', () => {
  /** The penalties the last step adds, after the steps before it (reads answered correctly, unless 'manual') */
  const lastStep = (id: string, role: 2 | 6 | 7, steps: string[], reads: 'correct' | 'manual' = 'correct') => {
    const sc = SCENARIO_BY_ID[id];
    const s = runScenario(sc, role, steps.slice(0, -1), undefined, reads);
    return ids(perform(sc, s, steps.at(-1)!)).slice(s.penalties.length);
  };

  it('pulmonary embolism (ED): the nurse\'s rate drug in shock, and a rate drug in PEA', () => {
    expect(lastStep('pulmonary-embolism-lysis-ed', 6, ['iv', 'procainamide'])).toEqual(['rate-control-pe-rn']);
    // PEA by the last step: the drug that has no place there is one penalty, not also the missing order — the nurse's
    // version, which says both
    expect(lastStep('pulmonary-embolism-lysis-ed', 6, ['iv', 'primary', 'perfusion', 'nitro', 'adenosine12', 'bvm', 'cxr', 'io', 'adenosine6'])).toEqual(['antiarrhythmic-pea-rn']);
  });

  it('tamponade (ED): a rate drug in PEA, and nitroglycerin after the drain', () => {
    expect(lastStep('tamponade-ed', 6, ['iv', 'bp-both-arms', 'procainamide', 'cpr', 'vitals', 'magnesium-sulfate', 'midazolam', 'metoprolol'])).toEqual(['antiarrhythmic-pea-rn']);
    expect(lastStep('tamponade-ed', 7, ['perfusion', 'lungs', 'sample', 'pocus', 'fluid', 'pericardiocentesis', 'nitro-high'])).toEqual(['nitro-no-indication']);
    const nurseDrained = ['triage', 'monitor', 'o2-nc', 'vitals', 'perfusion', 'lungs', 'notify-physician', 'iv', 'labs', 'ecg12', 'sample', 'fluid', 'pads',
      'notify-physician', 'pressor', 'reassess', 'notify-physician', 'vitals', 'reassess'];
    // the nurse's 0.8 mg: the case's nurse rule, which also stands for the missing order
    expect(lastStep('tamponade-ed', 6, [...nurseDrained, 'nitro-high'])).toEqual(['nitro-no-indication-rn']);
  });

  it('tamponade (ED): if she arrests before the pads are on, the team puts them on (the set-up order is not held)', () => {
    const sc = SCENARIO_BY_ID['tamponade-ed'];
    const s = runScenario(sc, 6, ['p2y12', 'glucagon', 'hs-ts', 'fluid', 'procainamide', 'bp-both-arms', 'ecg-right', 'cpr', 'alteplase', 'opqrst', 'iv', 'neuro',
      'sodium-bicarbonate', 'sample', 'reassess', 'magnesium-sulfate', 'procainamide', 'fentanyl', 'bp-both-arms', 'lidocaine']);
    expect(s.pulse).toBe(false);
    expect(s.fired).toContain('rn-setup-fallback');
    expect(perform(sc, s, 'nibp').counts.nibp).toBe(1);
  });

  it('SCAPE (ED and field): nitroglycerin 0.8 mg under the pressure goal is the goal rule alone', () => {
    expect(lastStep('scape-ed', 7, ['ems-handoff', 'cpap', 'lungs', 'nitro-high', 'sample', 'pocus', 'reassess', 'reassess', 'reassess', 'nitro-high'])).toEqual(['nitro-below-target']);
    expect(lastStep('scape-ed', 6, ['notify-physician', 'ems-handoff', 'cpap', 'notify-physician', 'monitor', 'nibp', 'nitro-high', 'iv', 'nibp', 'nitro', 'ecg12',
      'read:lvh', 'labs', 'neuro', 'reassess', 'notify-physician', 'nitro-high'], 'manual')).toEqual(['nitro-below-target']);
    // a systolic of 94: the field case's under-100 rule alone — not the 0.8 mg rule, and not its too-soon check (a check gives
    // way to the ranks above it: one dose, one penalty)
    expect(lastStep('scape-field', 2, ['iv', 'amio-arrest', 'lvad-check', 'ecg12', 'read:nsr', 'ecg-right', 'call-help', 'lungs', 'aspirin', 'transport-pci', 'midazolam',
      'albuterol', 'cardiovert', 'adenosine12', 'nitro', 'push-epi', 'ecg12-repeat', 'read:nsr', 'diltiazem', 'nitro-high'], 'manual')).toEqual(['nitro-pressure-fallen']);
  });

  it('aortic dissection (ED): the case judges the 0.8 mg dose before rate control and below the goal; otherwise the gate (here the interval rule)', () => {
    const rateControlled = ['opqrst', 'bp-both-arms', 'pocus', 'call-surgery', 'metoprolol', 'fentanyl', 'nitro'];
    // rate controlled, systolic 144: a vasodilator toward the goal of under 120 is allowed here — the case's exemption hides
    // only the 0.8 mg rule, so the other nitrate rules still judge the dose: straight after the 0.4 mg, the interval rule
    expect(lastStep('aortic-dissection-ed', 7, [...rateControlled, 'nitro-high'])).toEqual(['nitro-too-soon']);
    expect(lastStep('aortic-dissection-ed', 7, ['opqrst', 'read:lvh', 'bp-both-arms', 'pocus', 'call-surgery', 'metoprolol', 'fentanyl', 'nitro', 'ct-urgent', 'nitro-high'], 'manual'))
      .toEqual(['vasodilator-below-goal']);
    // before the rate is controlled
    expect(lastStep('aortic-dissection-ed', 7, ['opqrst', 'nitro-high'])).toEqual(['vasodilator-before-rate-md']);
    // the nurse's 0.8 mg for an ordered 0.4: the order's own rule
    expect(lastStep('aortic-dissection-ed', 6, ['iv', 'handoff', 'vitals', 'sodium-bicarbonate', 'transfuse', 'atropine', 'call-help', 'capno', 'sodium-bicarbonate', 'pulse-check',
      'magnesium-sulfate', 'transfuse', 'nitro-high'])).toEqual(['wrong-rn-vasodilator']);
  });

  it('pre-excited AF (field): amiodarone after the procainamide that converted him is one penalty', () => {
    const converted = ['primary', 'pads', 'nibp', 'ecg12', 'sample', 'iv', 'med-control', 'procainamide', 'transport-pci', 'reassess', 'reassess', 'reassess', 'reassess'];
    const sc = SCENARIO_BY_ID['wpw-af-field'];
    expect('converted' in runScenario(sc, 2, converted).flags).toBe(true);
    expect(lastStep('wpw-af-field', 2, [...converted, 'amio-infusion'])).toEqual(['rate-drug-after-conversion']);
  });

  it('stable VT (field): procainamide on top of amiodarone with a low pressure is one penalty', () => {
    expect(lastStep('stable-vt-field', 2, ['iv', 'primary', 'cardiovert', 'amio-arrest', 'poison-control', 'hs-ts', 'epi-im', 'cpr', 'stemi-alert', 'epinephrine', 'amio-arrest',
      'bp-both-arms', 'nitro-high', 'adenosine6', 'fentanyl', 'nitro', 'aspirin', 'dextrose', 'ondansetron', 'oral-glucose', 'lvad-check', 'ecg-transmit', 'pulse-check',
      'procainamide'])).toEqual(['two-antiarrhythmics']);
  });

  it('beta-blocker overdose (field): midazolam as premedication for the pacer is right even with a low pressure', () => {
    const slowAndFailing = ['primary', 'pads', 'ecg12', 'sample', 'iv', 'glucose', 'dextrose', 'atropine', 'glucagon'];
    const s = runScenario(SCENARIO_BY_ID['beta-blocker-overdose-field'], 2, slowAndFailing);
    expect(s.vitals.sbp).toBeLessThan(90);
    expect(s.rhythm.hr).toBeGreaterThanOrEqual(50);
    expect(lastStep('beta-blocker-overdose-field', 2, [...slowAndFailing, 'midazolam'])).toEqual([]);
    // with no pacing in sight, the case's sedation rule charges it (once)
    expect(lastStep('beta-blocker-overdose-field', 2, [...slowAndFailing, 'pressor', 'midazolam'])).toEqual(['sedative-no-indication']);
  });

  it('unstable AF (ED): magnesium on the order is not "given before the order" once the order is used up', () => {
    const sc = SCENARIO_BY_ID['unstable-af-cardioversion-ed'];
    const ideal = runScenario(sc, 6, ['ems-handoff', 'notify-physician', 'pads', 'neuro', 'ecg12', 'iv', 'labs', 'capno', 'bvm', 'cardiovert', 'cardiovert', 'nibp',
      'notify-physician', 'heparin', 'ecg12-repeat', 'magnesium-sulfate', 'sample', 'handoff']);
    expect(ideal.fired).toContain('magnesium-used');
    expect(ideal.fired).not.toContain('md-unordered');
    expect(ideal.log.some((l) => l.text.startsWith('That went in before I ordered it'))).toBe(false);
    // given before the order: the physician says so
    const early = runScenario(sc, 6, ['ems-handoff', 'notify-physician', 'pads', 'neuro', 'ecg12', 'iv', 'labs', 'capno', 'bvm', 'cardiovert', 'cardiovert',
      'magnesium-sulfate', 'reassess']);
    expect(early.fired).not.toContain('magnesium-ask');
    expect(early.fired).toContain('md-unordered');
  });
});

describe('a drug contraindication charges once for each drug given into it (rules/charge.ts)', () => {
  const SLOW = { profile: 'sinus-bradycardia', hr: 40 };
  it('a second, different drug into the same contraindication is charged; the same drug again is not', () => {
    const slow = fixture({ setting: 'ed', role: 7, rhythm: SLOW, vitals: { sbp: 110 } });
    expect(penaltyIds(slow, 7, ['iv', 'diltiazem', 'amio-infusion'])).toEqual(['nodal-blocker-slow', 'nodal-blocker-slow']);
    expect(penaltyIds(slow, 7, ['iv', 'adenosine12', 'adenosine12'])).toEqual(['nodal-blocker-slow']);
    // the ACS gate: aspirin, then heparin, with active bleeding
    const bleeding = fixture({ setting: 'ed', role: 7, rhythm: { profile: 'normal-sinus', hr: 90 }, problems: ['acs', 'bleeding'] });
    expect(penaltyIds(bleeding, 7, ['iv', 'aspirin', 'heparin'])).toEqual(['antithrombotic-bleeding', 'antithrombotic-bleeding']);
  });

  it('the same drug at another dose or by another route is the same drug: charged once (DRUGS_OF)', () => {
    // nitroglycerin 0.4 mg, then 0.8 mg, under 90: the low pressure once; the second dose goes to the next reason that holds
    const low = fixture({ setting: 'field', role: 2, rhythm: { profile: 'normal-sinus', hr: 80 }, vitals: { sbp: 84, dbp: 50, pain: 6 } });
    expect(penaltyIds(low, 2, ['vitals', 'ask-pde5', 'iv', 'nitro', 'nitro-high'])).toEqual(['nitro-hypotension', 'nitro-too-soon']);
    // sublingual, then the infusion (ED physician): the same drug, no second penalty for the same reason
    const lowEd = fixture({ setting: 'ed', role: 7, rhythm: { profile: 'normal-sinus', hr: 80 }, vitals: { sbp: 84, dbp: 50, pain: 6 } });
    expect(penaltyIds(lowEd, 7, ['vitals', 'ask-pde5', 'iv', 'nitro-iv', 'nitro']).filter((p) => p === 'nitro-hypotension')).toHaveLength(1);
    // adenosine 6 mg, then 12 mg, at a rate of 48
    const slow48 = fixture({ setting: 'ed', role: 7, rhythm: { profile: 'sinus-bradycardia', hr: 48 }, vitals: { sbp: 110 } });
    expect(penaltyIds(slow48, 7, ['iv', 'adenosine6', 'adenosine12'])).toEqual(['nodal-blocker-slow']);
    // a different drug is still a mistake of its own: metoprolol, then diltiazem
    expect(penaltyIds(slow48, 7, ['iv', 'metoprolol', 'diltiazem'])).toEqual(['nodal-blocker-slow', 'nodal-blocker-slow']);
    // metoprolol IV, then by mouth: one drug
    expect(penaltyIds(slow48, 7, ['iv', 'metoprolol', 'metoprolol-po']).filter((p) => p === 'nodal-blocker-slow')).toHaveLength(1);
  });

  it('DRUGS_OF names only drug actions, and an action with no entry is a drug of its own', () => {
    for (const id of Object.keys(DRUGS_OF)) expect(INTERVENTION_BY_ID[id]?.category, id).toBe('meds');
    expect(drugsOf('diltiazem')).toEqual(['diltiazem']);
    expect(drugsOf(undefined)).toEqual([]);
    expect(sameDrug('radial-cocktail', 'ic-verapamil')).toBe(true);
    expect(sameDrug('radial-cocktail', 'ic-nitro')).toBe(true);
    expect(sameDrug('ic-nitro', 'ic-nitroprusside')).toBe(false);
    expect(sameDrug('push-epi', 'pressor')).toBe(false);
  });

  it('indication rules, minor rules, the nitrate checks and rules on what is not a drug charge once a case', () => {
    expect(chargesPerDrug({ id: 'nodal-blocker-slow', severity: 'major' }, 'diltiazem')).toBe(true);
    expect(chargesPerDrug({ id: 'antiarrhythmic-no-arrhythmia', severity: 'minor' }, 'diltiazem')).toBe(false);
    expect(chargesPerDrug({ id: 'nitro-no-bp', severity: 'major' }, 'nitro')).toBe(false);
    expect(chargesPerDrug({ id: 'airway-awake', severity: 'major' }, 'airway')).toBe(false);
    const field = fixture({ setting: 'field', role: 2, rhythm: { profile: 'normal-sinus', hr: 80 }, vitals: { pain: 6 } });
    expect(penaltyIds(field, 2, ['iv', 'nitro', 'nitro-high']).filter((p) => p === 'nitro-no-bp')).toHaveLength(1);
    const arrest = fixture({ setting: 'field', role: 2, rhythm: { profile: 'vf', hr: 0 }, pulse: false });
    expect(penaltyIds(arrest, 2, ['io', 'midazolam', 'fentanyl']).filter((p) => p === 'no-role-in-arrest')).toHaveLength(1);
  });

  it('a case rule keeps charging once a case, as its case decides (wpw-af-field: a second blocker on top is the same one mistake)', () => {
    const own: Harm = { id: 'av-blocker-preexcited-af', actions: ['diltiazem', 'metoprolol'], points: 15, severity: 'critical', text: 'The case\'s words.' };
    const preexcited = fixture({ setting: 'field', role: 2, rhythm: { profile: 'af-wpw', hr: 210 }, harms: [own] });
    expect(penaltyIds(preexcited, 2, ['iv', 'diltiazem', 'metoprolol'])).toEqual(['av-blocker-preexcited-af']);
  });
});
