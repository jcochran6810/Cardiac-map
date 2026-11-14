/**
 * The built-in rules for supportive care (rules/support.ts): each one fires when it should, stays silent in the nearest
 * correct state, gives way to a case rule with its id, and earns one penalty for one dose where several rules judge
 * the same action (the gate order in support.ts).
 */
import { describe, expect, it } from 'vitest';
import type { FixtureSpec } from './ruleFixture';
import { fixture, penaltyIds } from './ruleFixture';
import { runScenario as runSteps } from './helpers';
import { BUILT_IN_HARMS, perform } from '@/lib/sim/scenario/engine';
import { standingOrders } from '@/lib/sim/scenario/edKit';
import { SCENARIO_BY_ID } from '@/lib/sim/scenario/scenarios';
import type { Harm, Problem, Scenario, SimState } from '@/lib/sim/scenario/types';
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
    // a slow heart of its own is AV block at any rate, not only a rate under 50 (2018 ACC/AHA/HRS bradycardia guideline)
    expect(ids(2, { rhythm: { profile: 'third-degree-avb', hr: 56 } }, ['iv', 'pressor'])).toEqual([]);
    expect(ids(2, { rhythm: { profile: 'sinus-bradycardia', hr: 56 } }, ['iv', 'pressor'])).toEqual(['pressor-no-hypotension']);
  });

  it('pressor-no-hypotension: a push holding the pressure up is a bridge — the infusion that takes over, or the next push, is no mistake', () => {
    // 82/50, a push (the default lifts it to 98/60), then the infusion or another push
    expect(ids(2, { vitals: LOW }, ['iv', 'push-epi', 'pressor'])).toEqual([]);
    expect(ids(2, { vitals: LOW }, ['iv', 'push-epi', 'push-epi'])).toEqual([]);
    // phenylephrine holds it up too
    expect(ids(5, { vitals: LOW }, ['iv', 'phenylephrine', 'pressor'])).toEqual([]);
    // the nearest wrong state: more than ten minutes after the push the pressure is the patient's own again
    expect(ids(2, { vitals: LOW }, ['iv', 'push-epi', 'reassess', 'reassess', 'reassess', 'reassess', 'reassess', 'reassess', 'pressor'])).toEqual(['pressor-no-hypotension']);
  });

  it('a push given in an arrest holds no pressure up: after ROSC the infusion at a normal pressure is judged on its own', () => {
    // pulseless, a push-dose (the wrong dose for the arrest), then the pulse comes back with a normal pressure
    const rosc: Partial<Scenario> = {
      events: [{ id: 'rosc', when: (s) => !s.pulse && (s.counts['push-epi'] ?? 0) > 0, effect: () => ({ pulse: true, rhythm: SINUS, vitals: { sbp: 124, dbp: 76 } }) }],
    };
    const arrest = { pulse: false, rhythm: VF, extra: rosc };
    expect(ids(2, arrest, ['io', 'push-epi', 'pressor'])).toEqual(['push-epi-in-arrest', 'pressor-no-hypotension']);
  });

  it('pressor-no-hypotension: in cardiogenic shock the norepinephrine infusion is the first vasopressor', () => {
    const shock = withProblems('cardiogenic-shock');
    expect(ids(5, shock, ['iv', 'pressor'])).toEqual([]);
    // not push-dose epinephrine with nothing to treat
    expect(ids(5, shock, ['iv', 'push-epi'])).toEqual(['pressor-no-hypotension']);
  });

  it('pressor-no-hypotension in the cases: the push-dose bridge to the infusion costs nothing', () => {
    const caseIds = (id: string, role: LearningLevel, steps: string[]) => penaltyIds(SCENARIO_BY_ID[id], role, steps);
    // 78/50, a push to 94/60, then the infusion the case asks for (md-pressor)
    expect(caseIds('shock-cathlab', 5, ['push-epi', 'pressor'])).toEqual([]);
    expect(caseIds('left-main-shock-cathlab', 5, ['push-epi', 'pressor'])).toEqual([]);
    // the tamponades: a second push while the first holds her, or the infusion after it
    const tamponade = ['primary', 'vitals', 'perfusion', 'lungs', 'sample', 'iv'];
    expect(caseIds('tamponade-field', 2, [...tamponade, 'push-epi', 'reassess', 'push-epi'])).toEqual([]);
    expect(caseIds('tamponade-field', 2, [...tamponade, 'push-epi', 'pressor'])).toEqual([]);
    const ed = ['perfusion', 'lungs', 'sample', 'pocus'];
    expect(caseIds('tamponade-ed', 7, [...ed, 'push-epi', 'reassess', 'push-epi'])).toEqual([]);
    expect(caseIds('tamponade-ed', 7, [...ed, 'push-epi', 'pressor'])).toEqual([]);
    // once the fluid is off, a normal pressure is her own: the infusion has nothing to treat, push or no push before it
    expect(caseIds('tamponade-ed', 7, [...ed, 'fluid', 'pericardiocentesis', 'pressor'])).toEqual(['pressor-no-hypotension']);
    expect(caseIds('tamponade-ed', 7, [...ed, 'push-epi', 'pericardiocentesis', 'pressor'])).toEqual(['pressor-no-hypotension']);
    // the perforation: a pressor before the hole is sealed is a bridge to the drain, whatever the pressure
    expect(caseIds('perforation-cathlab', 5, ['balloon-tamponade', 'fluid', 'pressor'])).toEqual([]);
  });

  it('push-epi-in-arrest: push-dose epinephrine is not the arrest dose', () => {
    expect(ids(2, { pulse: false, rhythm: VF }, ['iv', 'push-epi'])).toEqual(['push-epi-in-arrest']);
    // the ER nurse with no order: the missing order is the one penalty; with the order, the dose is the mistake
    expect(ids(6, { pulse: false, rhythm: VF }, ['iv', 'push-epi'])).toEqual(['rn-without-order-push-epi']);
    expect(ids(6, { pulse: false, rhythm: VF, extra: { events: [standingOrders(['push-epi'])] } }, ['iv', 'push-epi'])).toEqual(['push-epi-in-arrest']);
    expect(penaltyIds(SCENARIO_BY_ID['vf-arrest-ed'], 6, ['call-help', 'cpr', 'defib', 'iv', 'push-epi'])).toEqual(['rn-without-order-push-epi']);
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
    // the nearest correct states: no failing ventricle, outflow obstruction (phenylephrine is its drug: LVOT obstruction or
    // severe aortic stenosis, an afterload-dependent ventricle), an LVAD
    expect(ids(5, { vitals: LOW }, ['iv', 'phenylephrine'])).toEqual([]);
    expect(ids(5, { ...withProblems('heart-failure', 'lvot-obstruction'), vitals: LOW }, ['iv', 'phenylephrine'])).toEqual([]);
    expect(ids(5, { ...withProblems('heart-failure', 'severe-aortic-stenosis'), vitals: LOW }, ['iv', 'phenylephrine'])).toEqual([]);
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
    // no-reflow (the flag 'no-reflow', until 'reflow'): it treats the microvessels at any pressure (COAR)
    const stall = (...flags: string[]) => ({ extra: { events: [{ id: 'stall', when: () => true, effect: () => ({ flags }) }] } });
    expect(ids(5, stall('no-reflow'), ['ic-epinephrine'])).toEqual([]);
    expect(ids(5, stall('no-reflow', 'reflow'), ['ic-epinephrine'])).toEqual(['ic-epi-no-indication']);
    // the no-reflow case: stalled at 118 after phenylephrine, the epinephrine costs nothing
    expect(penaltyIds(SCENARIO_BY_ID['no-reflow-cathlab'], 5, ['act', 'heparin', 'stent-des', 'phenylephrine', 'phenylephrine', 'ic-epinephrine'])).toEqual([]);
  });
});

describe('oxygen', () => {
  it('oxygen-not-breathing: a mask or a cannula only offers oxygen to someone who breathes', () => {
    for (const mask of ['o2-nc', 'o2-nrb']) {
      expect(ids(2, { pulse: false, rhythm: VF }, [mask]), mask).toEqual(['oxygen-not-breathing']);
      expect(ids(2, { vitals: { rr: 6 } }, [mask]), mask).toEqual(['oxygen-not-breathing']);
      // no airway reflexes with slow breaths or a low saturation
      expect(ids(2, { vitals: { gcs: 6, rr: 9 } }, [mask]), mask).toEqual(['oxygen-not-breathing']);
      expect(ids(2, { vitals: { gcs: 6, spo2: 86 } }, [mask]), mask).toEqual(['oxygen-not-breathing']);
      // the nearest correct states: someone is bagging (or there is an airway); an unresponsive patient breathing well
      // (after ROSC, after sedation) — the airway needs looking after, but a mask is no mistake
      expect(ids(2, { vitals: { gcs: 6, rr: 9 } }, ['bvm', mask]), mask).toEqual([]);
      expect(ids(2, { vitals: { gcs: 6, rr: 20, spo2: 96 } }, [mask]), mask).toEqual([]);
      expect(ids(2, { pulse: false, rhythm: VF, harms: [exempt('oxygen-not-breathing', ['o2-nc', 'o2-nrb'])] }, [mask]), mask).toEqual([]);
      // the gate: not breathing comes first, whatever the saturation
      expect(ids(2, { ...withProblems('acs'), vitals: { gcs: 6, rr: 9 } }, [mask]), mask).toEqual(['oxygen-not-breathing']);
      // …and an unresponsive coronary patient breathing well is not judged by the saturation rule either
      expect(ids(2, { ...withProblems('acs'), vitals: { gcs: 6 } }, [mask]), mask).toEqual([]);
    }
    // once for the case
    expect(ids(2, { pulse: false, rhythm: VF }, ['o2-nrb', 'o2-nc'])).toEqual(['oxygen-not-breathing']);
  });

  it('oxygen-normoxic: an acute coronary syndrome with an SpO₂ of 90 % or more', () => {
    const acs = withProblems('acs');
    expect(ids(2, acs, ['o2-nc'])).toEqual(['oxygen-normoxic']);
    expect(ids(2, acs, ['o2-nrb'])).toEqual(['oxygen-normoxic']);
    // the nearest correct states: a low saturation, respiratory distress, fluid on the lungs, no coronary syndrome
    expect(ids(2, { ...acs, vitals: { spo2: 88 } }, ['o2-nc'])).toEqual([]);
    expect(ids(2, { ...acs, vitals: { rr: 28 } }, ['o2-nrb'])).toEqual([]);
    expect(ids(2, withProblems('acs', 'pulmonary-edema'), ['o2-nrb'])).toEqual([]);
    expect(ids(2, {}, ['o2-nrb'])).toEqual([]);
    expect(ids(2, { ...acs, harms: [exempt('oxygen-normoxic', ['o2-nc', 'o2-nrb'])] }, ['o2-nc'])).toEqual([]);
  });
});

describe('CPAP', () => {
  const edema = withProblems('pulmonary-edema');
  it('cpap-hypotension: positive pressure drops a low pressure further', () => {
    expect(ids(2, { ...edema, vitals: LOW }, ['cpap'])).toEqual(['cpap-hypotension']);
    expect(ids(2, edema, ['cpap'])).toEqual([]);
    expect(ids(2, { ...edema, vitals: LOW, harms: [exempt('cpap-hypotension', ['cpap'])] }, ['cpap'])).toEqual([]);
    // the gate: first of all the CPAP rules
    expect(ids(2, { ...withProblems('rv-infarction'), vitals: { ...LOW, gcs: 11 } }, ['cpap'])).toEqual(['cpap-hypotension']);
  });

  it('cpap-vomiting: not within half an hour of glucagon', () => {
    const overdose = withProblems('beta-blocker-overdose', 'pulmonary-edema');
    expect(ids(2, overdose, ['iv', 'glucagon', 'cpap'])).toEqual(['cpap-vomiting']);
    expect(ids(2, overdose, ['iv', 'cpap'])).toEqual([]);
    expect(ids(2, { ...overdose, harms: [exempt('cpap-vomiting', ['cpap'])] }, ['iv', 'glucagon', 'cpap'])).toEqual([]);
    // the gate: before the preload, the drowsiness and the indication — one penalty; after the low pressure
    expect(ids(2, { ...withProblems('beta-blocker-overdose', 'rv-infarction'), vitals: { gcs: 11 } }, ['iv', 'glucagon', 'cpap'])).toEqual(['cpap-vomiting']);
    expect(ids(2, { ...overdose, vitals: LOW }, ['iv', 'glucagon', 'cpap'])).toEqual(['cpap-hypotension']);
  });

  it('cpap-preload-dependent: a heart that lives on its preload', () => {
    for (const problem of ['rv-infarction', 'pulmonary-embolism', 'tamponade'] as Problem[]) {
      expect(ids(2, withProblems(problem, 'pulmonary-edema'), ['cpap']), problem).toEqual(['cpap-preload-dependent']);
    }
    // a tamponade drained is no longer one (the flag 'drained')
    expect(ids(7, withProblems('tamponade', 'pulmonary-edema'), ['pocus', 'pericardiocentesis', 'cpap'])).toEqual([]);
    // a tamponade that begins mid-case (the flag 'tamponade') is one
    const later = { extra: { events: [{ id: 'bleeds', when: () => true, effect: () => ({ flags: ['tamponade'] }) }] } };
    expect(ids(2, { ...edema, ...later }, ['cpap'])).toEqual(['cpap-preload-dependent']);
    expect(ids(2, { ...withProblems('rv-infarction'), harms: [exempt('cpap-preload-dependent', ['cpap'])] }, ['cpap'])).toEqual([]);
    // the gate: before the drowsiness and the indication — one penalty
    expect(ids(2, { ...withProblems('rv-infarction'), vitals: { gcs: 11 } }, ['cpap'])).toEqual(['cpap-preload-dependent']);
  });

  it('cpap-drowsy: in the field, not for a GCS of 9–12', () => {
    expect(ids(2, { ...edema, vitals: { gcs: 11 } }, ['cpap'])).toEqual(['cpap-drowsy']);
    expect(ids(2, { ...edema, vitals: { gcs: 13 } }, ['cpap'])).toEqual([]);
    // the emergency department is left alone: a nurse at the bedside, a physician to intubate
    expect(ids(7, { ...edema, vitals: { gcs: 11 } }, ['cpap'])).toEqual([]);
    expect(ids(2, { ...edema, vitals: { gcs: 11 }, harms: [exempt('cpap-drowsy', ['cpap'])] }, ['cpap'])).toEqual([]);
    // the gate: before the indication — one penalty
    expect(ids(2, { vitals: { gcs: 11 } }, ['cpap'])).toEqual(['cpap-drowsy']);
    // the drowsiness of hypoxic pulmonary edema is what CPAP reverses: the paramedic stays at the head
    expect(ids(2, { ...edema, vitals: { gcs: 11, spo2: 82 } }, ['cpap'])).toEqual([]);
    expect(ids(2, { vitals: { gcs: 11, spo2: 82 } }, ['cpap'])).toEqual(['cpap-drowsy']);
    // the SCAPE crew case: GCS 12 and an SpO₂ of 78 when the mask goes on, and she wakes up under it
    expect(penaltyIds(SCENARIO_BY_ID['scape-field'], 2, ['primary', 'vitals', 'lungs', 'reassess', 'reassess', 'reassess', 'cpap', 'reassess', 'reassess'])).toEqual([]);
  });

  it('cpap-no-indication: no respiratory distress, no fluid on the lungs, no wheeze', () => {
    expect(ids(2, {}, ['cpap'])).toEqual(['cpap-no-indication']);
    expect(ids(7, {}, ['cpap'])).toEqual(['cpap-no-indication']);
    expect(ids(2, { vitals: { rr: 28 } }, ['cpap'])).toEqual([]);
    expect(ids(2, { vitals: { spo2: 91 } }, ['cpap'])).toEqual([]);
    expect(ids(2, edema, ['cpap'])).toEqual([]);
    expect(ids(2, withProblems('bronchospasm'), ['cpap'])).toEqual([]);
    expect(ids(2, { harms: [exempt('cpap-no-indication', ['cpap'])] }, ['cpap'])).toEqual([]);
  });
});

describe('the bag-mask, the advanced airway and RSI', () => {
  it('bvm-breathing: a patient breathing well on their own', () => {
    expect(ids(2, {}, ['bvm'])).toEqual(['bvm-breathing']);
    expect(ids(2, { vitals: { gcs: 7 } }, ['bvm'])).toEqual([]);
    expect(ids(2, { vitals: { rr: 6 } }, ['bvm'])).toEqual([]);
    expect(ids(2, { vitals: { spo2: 85 } }, ['bvm'])).toEqual([]);
    // readied for a cardioversion or a pacer (rules/acs.ts sedationForProcedure): preparation, not a mistake — an unstable
    // tachycardia, or the pads on for the shock or the pacer
    expect(ids(2, { rhythm: { profile: 'avnrt', hr: 180 }, vitals: { sbp: 84, dbp: 50 } }, ['bvm'])).toEqual([]);
    expect(ids(2, { rhythm: { profile: 'avnrt', hr: 180 } }, ['pads', 'bvm'])).toEqual([]);
    expect(ids(2, { rhythm: SLOW }, ['pads', 'bvm'])).toEqual([]);
    // a stable tachycardia being slowed with drugs, or a slow rate with no pads on, is no procedure yet
    expect(ids(2, { rhythm: { profile: 'avnrt', hr: 180 } }, ['bvm'])).toEqual(['bvm-breathing']);
    expect(ids(2, { rhythm: SLOW }, ['bvm'])).toEqual(['bvm-breathing']);
    expect(ids(2, { harms: [exempt('bvm-breathing', ['bvm'])] }, ['bvm'])).toEqual([]);
  });

  it('airway-before-shock: in VF or pulseless VT the shock comes first', () => {
    expect(ids(2, { pulse: false, rhythm: VF }, ['airway'])).toEqual(['airway-before-shock']);
    expect(ids(2, { pulse: false, rhythm: VF }, ['defib', 'cpr', 'airway'])).toEqual([]);
    expect(ids(2, { pulse: false, rhythm: { profile: 'asystole', hr: 0 } }, ['airway'])).toEqual([]);
    expect(ids(2, { pulse: false, rhythm: VF, harms: [exempt('airway-before-shock', ['airway'])] }, ['airway'])).toEqual([]);
    // an awake patient with a pulse is the other rule's
    expect(ids(2, {}, ['airway'])).toEqual(['airway-awake']);
  });

  it('rsi-preload-dependent: induction and positive pressure in a heart that lives on its preload', () => {
    const tamponade = { ...withProblems('tamponade'), vitals: { gcs: 12 } };
    expect(ids(7, tamponade, ['monitor', 'iv', 'rsi'])).toEqual(['rsi-preload-dependent']);
    expect(ids(7, { vitals: { gcs: 12 } }, ['monitor', 'iv', 'rsi'])).toEqual([]);
    expect(ids(7, { ...tamponade, harms: [exempt('rsi-preload-dependent', ['rsi'])] }, ['monitor', 'iv', 'rsi'])).toEqual([]);
    // the gate: the existing RSI rules come first — one penalty
    expect(ids(7, withProblems('tamponade'), ['monitor', 'iv', 'rsi'])).toEqual(['rsi-no-indication']);
    expect(ids(7, { ...withProblems('tamponade'), vitals: { ...LOW, gcs: 12 } }, ['monitor', 'iv', 'rsi'])).toEqual(['rsi-unresuscitated']);
    expect(ids(7, tamponade, ['iv', 'rsi'])).toEqual(['rsi-unmonitored']);
    // the tube that cannot wait, with the precaution its text asks for: a pressor running
    expect(ids(7, { ...withProblems('tamponade'), vitals: { ...LOW, gcs: 12 } }, ['monitor', 'iv', 'pressor', 'rsi'])).toEqual([]);
    expect(ids(7, { ...withProblems('tamponade'), vitals: { ...LOW, gcs: 12 } }, ['monitor', 'iv', 'push-epi', 'rsi'])).toEqual([]);
  });
});

describe('the legs, fluids and blood', () => {
  const HIGH = { sbp: 172, dbp: 96 };
  it('legs-up-hypertensive: raised legs push a high pressure higher', () => {
    expect(ids(2, { vitals: HIGH }, ['legs-up'])).toEqual(['legs-up-hypertensive']);
    expect(ids(2, { vitals: { sbp: 150, dbp: 90 } }, ['legs-up'])).toEqual([]);
    expect(ids(2, { lvad: true, vitals: { sbp: 98, dbp: 92 } }, ['legs-up'])).toEqual(['legs-up-hypertensive']);
    expect(ids(2, { lvad: true, vitals: { sbp: 84, dbp: 76 } }, ['legs-up'])).toEqual([]);
    expect(ids(2, { vitals: HIGH, harms: [exempt('legs-up-hypertensive', ['legs-up'])] }, ['legs-up'])).toEqual([]);
    // the gate: fluid on the lungs is the other rule's — one penalty
    expect(ids(2, { ...withProblems('pulmonary-edema'), vitals: HIGH }, ['legs-up'])).toEqual(['legs-up-pulmonary-edema']);
  });

  it('fluid-loading-pe: one small bolus at most for a pulmonary embolism', () => {
    const pe = { ...withProblems('pulmonary-embolism'), vitals: LOW };
    expect(ids(7, pe, ['iv', 'fluid'])).toEqual([]);
    expect(ids(7, pe, ['iv', 'fluid', 'fluid', 'fluid'])).toEqual(['fluid-loading-pe']);
    expect(ids(7, { ...pe, harms: [exempt('fluid-loading-pe', ['fluid'])] }, ['iv', 'fluid', 'fluid'])).toEqual([]);
    // the gate: fluid on the lungs first — the first bolus is charged for that, the second for nothing more
    expect(ids(7, { ...withProblems('pulmonary-embolism', 'pulmonary-edema'), vitals: LOW }, ['iv', 'fluid', 'fluid'])).toEqual(['fluid-pulmonary-edema']);
  });

  it('fluid-hypertensive: no bolus for a dissection without a low pressure', () => {
    const dissection = withProblems('aortic-dissection');
    expect(ids(7, dissection, ['iv', 'fluid'])).toEqual(['fluid-hypertensive']);
    expect(ids(7, { ...dissection, vitals: LOW }, ['iv', 'fluid'])).toEqual([]);
    expect(ids(7, { ...dissection, harms: [exempt('fluid-hypertensive', ['fluid'])] }, ['iv', 'fluid'])).toEqual([]);
    // the gate: the second bolus in a PE is that rule's, not this one as well
    const both = withProblems('aortic-dissection', 'pulmonary-embolism');
    const sc = fixture({ setting: 'ed', role: 7, rhythm: SINUS, ...both });
    const s = runSteps(sc, 7, ['iv', 'fluid', 'fluid']);
    expect(s.penalties.map((p) => [p.id, p.minute])).toEqual([['fluid-hypertensive', 2], ['fluid-loading-pe', 3]]);
    // …and when the first bolus went in at a low pressure (charged for nothing), the second is the PE rule's alone
    const lifted = { extra: { events: [{ id: 'lifted', when: (st: SimState) => st.counts.fluid === 1, effect: () => ({ vitals: { sbp: 120, dbp: 70 } }) }] } };
    expect(ids(7, { ...both, vitals: LOW, ...lifted }, ['iv', 'fluid', 'fluid'])).toEqual(['fluid-loading-pe']);
  });

  it('saline-instead-of-blood: a third saline bolus with no blood yet, where there is blood to give', () => {
    const bleeding = { ...withProblems('bleeding'), vitals: VERY_LOW };
    expect(ids(7, bleeding, ['iv', 'fluid', 'fluid'])).toEqual([]);
    expect(ids(7, bleeding, ['iv', 'fluid', 'fluid', 'fluid'])).toEqual(['saline-instead-of-blood']);
    expect(ids(7, bleeding, ['iv', 'fluid', 'fluid', 'transfuse', 'fluid'])).toEqual([]);
    // the field carries no blood
    expect(ids(2, bleeding, ['iv', 'fluid', 'fluid', 'fluid'])).toEqual([]);
    expect(ids(7, { ...bleeding, harms: [exempt('saline-instead-of-blood', ['fluid'])] }, ['iv', 'fluid', 'fluid', 'fluid'])).toEqual([]);
    // the gate: a dissection with no low pressure is that rule's — one penalty for the case, none added
    expect(ids(7, withProblems('bleeding', 'aortic-dissection'), ['iv', 'fluid', 'fluid', 'fluid'])).toEqual(['fluid-hypertensive']);
  });
});

describe('electrolytes, insulin and the antidotes', () => {
  it('bicarbonate-no-indication: the BRASH case\'s bicarbonate of 17 is a metabolic acidosis', () => {
    expect(SCENARIO_BY_ID['complete-heart-block-ed'].problems).toContain('metabolic-acidosis');
    expect(penaltyIds(SCENARIO_BY_ID['complete-heart-block-ed'], 7, ['ems-handoff', 'sample', 'labs', 'perfusion', 'atropine', 'pace', 'pulse-check', 'nibp', 'fentanyl', 'lungs', 'calcium-chloride', 'insulin-dextrose', 'sodium-bicarbonate'])).toEqual([]);
  });

  it('bicarbonate-no-indication: with a pulse, a metabolic acidosis or a sodium-channel-blocker overdose — a high potassium alone is not one', () => {
    expect(ids(2, withProblems('hyperkalemia'), ['iv', 'sodium-bicarbonate'])).toEqual(['bicarbonate-no-indication']);
    expect(ids(2, withProblems('hyperkalemia', 'metabolic-acidosis'), ['iv', 'sodium-bicarbonate'])).toEqual([]);
    expect(ids(2, withProblems('sodium-channel-blocker-overdose'), ['iv', 'sodium-bicarbonate'])).toEqual([]);
    // in the arrest the high potassium is one
    expect(ids(2, { ...withProblems('hyperkalemia'), pulse: false, rhythm: VF }, ['cpr', 'bvm', 'io', 'sodium-bicarbonate'])).toEqual([]);
    expect(ids(2, { pulse: false, rhythm: VF }, ['cpr', 'bvm', 'io', 'sodium-bicarbonate'])).toEqual(['bicarbonate-no-indication']);
    expect(ids(2, { ...withProblems('hyperkalemia'), harms: [exempt('bicarbonate-no-indication', ['sodium-bicarbonate'])] }, ['iv', 'sodium-bicarbonate'])).toEqual([]);
  });

  it('bicarbonate-unventilated: in the arrest its CO₂ needs breaths to clear', () => {
    const arrest = { ...withProblems('hyperkalemia'), pulse: false, rhythm: VF };
    expect(ids(2, arrest, ['cpr', 'io', 'sodium-bicarbonate'])).toEqual(['bicarbonate-unventilated']);
    expect(ids(2, arrest, ['cpr', 'bvm', 'io', 'sodium-bicarbonate'])).toEqual([]);
    expect(ids(2, { ...arrest, harms: [exempt('bicarbonate-unventilated', ['sodium-bicarbonate'])] }, ['cpr', 'io', 'sodium-bicarbonate'])).toEqual([]);
    // the gate: with no indication at all, that is the one penalty
    expect(ids(2, { pulse: false, rhythm: VF }, ['cpr', 'io', 'sodium-bicarbonate'])).toEqual(['bicarbonate-no-indication']);
  });

  it('calcium-no-indication: a massive transfusion is an indication (the citrate binds the calcium)', () => {
    const bleeding = { ...withProblems('bleeding'), vitals: VERY_LOW };
    expect(ids(7, bleeding, ['iv', 'transfuse', 'transfuse', 'transfuse', 'calcium-chloride'])).toEqual(['calcium-no-indication']);
    expect(ids(7, bleeding, ['iv', 'transfuse', 'transfuse', 'transfuse', 'transfuse', 'calcium-chloride'])).toEqual([]);
  });

  it('insulin-glucose-unchecked: the nurse who pushes it checks the glucose first', () => {
    const hyperk = withProblems('hyperkalemia');
    expect(ids(4, hyperk, ['iv', 'insulin-dextrose'])).toEqual(['insulin-glucose-unchecked']);
    expect(ids(4, hyperk, ['iv', 'glucose', 'insulin-dextrose'])).toEqual([]);
    expect(ids(4, hyperk, ['iv', 'labs', 'insulin-dextrose'])).toEqual([]);
    // the ER nurse too (on the physician's order); the physician orders it, the nurse checks
    expect(ids(6, { ...hyperk, extra: { events: [standingOrders(['insulin-dextrose'])] } }, ['iv', 'insulin-dextrose'])).toEqual(['insulin-glucose-unchecked']);
    // with no order at all, the missing order is the one penalty
    expect(ids(6, hyperk, ['iv', 'insulin-dextrose'])).toEqual(['rn-without-order-insulin-dextrose']);
    expect(ids(5, hyperk, ['iv', 'insulin-dextrose'])).toEqual([]);
    expect(ids(4, { ...hyperk, harms: [exempt('insulin-glucose-unchecked', ['insulin-dextrose'])] }, ['iv', 'insulin-dextrose'])).toEqual([]);
    // the gate: no high potassium, or a low glucose, is the one penalty
    expect(ids(4, {}, ['iv', 'insulin-dextrose'])).toEqual(['insulin-no-indication']);
    expect(ids(4, { ...hyperk, vitals: { glucose: 60 } }, ['iv', 'insulin-dextrose'])).toEqual(['insulin-hypoglycemia']);
  });

  it('albuterol-hyperk-tachycardia: 10–20 mg speeds a fast heart further', () => {
    const hyperk = withProblems('hyperkalemia');
    expect(ids(2, { ...hyperk, rhythm: { profile: 'sinus-tachycardia', hr: 124 } }, ['albuterol-hyperk'])).toEqual(['albuterol-hyperk-tachycardia']);
    expect(ids(2, { ...hyperk, rhythm: { profile: 'avnrt', hr: 180 } }, ['albuterol-hyperk'])).toEqual(['albuterol-hyperk-tachycardia']);
    expect(ids(2, { ...hyperk, rhythm: { profile: 'sinus-tachycardia', hr: 110 } }, ['albuterol-hyperk'])).toEqual([]);
    expect(ids(2, { ...hyperk, rhythm: { profile: 'sinus-tachycardia', hr: 124 }, harms: [exempt('albuterol-hyperk-tachycardia', ['albuterol-hyperk'])] }, ['albuterol-hyperk'])).toEqual([]);
    // the gate: with no high potassium, that is the one penalty
    expect(ids(2, { rhythm: { profile: 'sinus-tachycardia', hr: 124 } }, ['albuterol-hyperk'])).toEqual(['albuterol-hyperk-no-indication']);
  });

  it('albuterol-no-bronchospasm: the wheezing dose with no wheeze', () => {
    expect(ids(2, {}, ['albuterol'])).toEqual(['albuterol-no-bronchospasm']);
    expect(ids(2, withProblems('bronchospasm'), ['albuterol'])).toEqual([]);
    expect(ids(2, withProblems('anaphylaxis'), ['albuterol'])).toEqual([]);
    // with a high potassium it moves a little: too small a dose, not a drug with nothing to treat (every hyperkalemia case)
    expect(ids(2, withProblems('hyperkalemia'), ['albuterol'])).toEqual([]);
    expect(penaltyIds(SCENARIO_BY_ID['complete-heart-block-ed'], 7, ['ems-handoff', 'sample', 'labs', 'perfusion', 'atropine', 'pace', 'albuterol'])).toEqual([]);
    expect(ids(2, { harms: [exempt('albuterol-no-bronchospasm', ['albuterol'])] }, ['albuterol'])).toEqual([]);
    // the contrast reaction case: before the reaction a dose is prophylaxis for nothing; after it, the wheeze is real
    const contrast = SCENARIO_BY_ID['contrast-cathlab'];
    expect(penaltyIds(contrast, 4, ['consent', 'iv', 'albuterol'])).toEqual(['albuterol-no-bronchospasm']);
    expect(penaltyIds(contrast, 4, ['consent', 'iv', 'timeout', 'reassess', 'callout', 'albuterol'])).toEqual([]);
  });

  it('glucagon-no-indication and glucagon-unprotected-airway', () => {
    expect(ids(2, {}, ['iv', 'glucagon'])).toEqual(['glucagon-no-indication']);
    expect(ids(2, withProblems('beta-blocker-overdose'), ['iv', 'glucagon'])).toEqual([]);
    expect(ids(2, withProblems('ccb-overdose'), ['iv', 'glucagon'])).toEqual([]);
    expect(ids(2, { harms: [exempt('glucagon-no-indication', ['glucagon'])] }, ['iv', 'glucagon'])).toEqual([]);
    // the ER nurse with no order: the missing order covers the indication — one penalty
    expect(ids(6, {}, ['iv', 'glucagon'])).toEqual(['rn-without-order-glucagon']);
    const drowsy = { ...withProblems('beta-blocker-overdose'), vitals: { gcs: 7 } };
    expect(ids(2, drowsy, ['iv', 'glucagon'])).toEqual(['glucagon-unprotected-airway']);
    expect(ids(2, drowsy, ['iv', 'airway', 'glucagon'])).toEqual([]);
    expect(ids(2, { ...drowsy, harms: [exempt('glucagon-unprotected-airway', ['glucagon'])] }, ['iv', 'glucagon'])).toEqual([]);
    // the gate: the airway first — one penalty
    expect(ids(2, { vitals: { gcs: 7 } }, ['iv', 'glucagon'])).toEqual(['glucagon-unprotected-airway']);
  });

  it('oral glucose for a patient too drowsy to swallow, with a normal glucose: the airway rule alone (one dose, one penalty)', () => {
    expect(ids(2, { vitals: { gcs: 9 } }, ['oral-glucose'])).toEqual(['oral-glucose-cannot-swallow']);
    expect(ids(2, {}, ['oral-glucose'])).toEqual(['glucose-not-low']);
    expect(ids(2, {}, ['iv', 'dextrose'])).toEqual(['glucose-not-low']);
  });

  it('glucagon-pheochromocytoma and glucagon-insulinoma: the GlucaGen label', () => {
    // a pheochromocytoma is critical and comes first, overdose or not, airway or not — one penalty
    expect(ids(2, withProblems('beta-blocker-overdose', 'pheochromocytoma'), ['iv', 'glucagon'])).toEqual(['glucagon-pheochromocytoma']);
    expect(ids(2, { ...withProblems('pheochromocytoma'), vitals: { gcs: 7 } }, ['iv', 'glucagon'])).toEqual(['glucagon-pheochromocytoma']);
    // an insulinoma: the rebound low is a caution, judged after the airway and before the indication
    expect(ids(2, withProblems('beta-blocker-overdose', 'insulinoma'), ['iv', 'glucagon'])).toEqual(['glucagon-insulinoma']);
    expect(ids(2, withProblems('insulinoma'), ['iv', 'glucagon'])).toEqual(['glucagon-insulinoma']);
    expect(ids(2, { ...withProblems('beta-blocker-overdose', 'insulinoma'), vitals: { gcs: 7 } }, ['iv', 'glucagon'])).toEqual(['glucagon-unprotected-airway']);
    expect(BUILT_IN_HARMS.find((h) => h.id === 'glucagon-pheochromocytoma')).toMatchObject({ points: 15, severity: 'critical' });
    expect(BUILT_IN_HARMS.find((h) => h.id === 'glucagon-insulinoma')).toMatchObject({ points: 3, severity: 'minor' });
  });
});

describe('anaphylaxis: IM epinephrine first, then the adjuncts', () => {
  const anaphylaxis = { ...withProblems('anaphylaxis'), vitals: LOW };
  it('epi-im-in-arrest and epi-im-no-anaphylaxis', () => {
    expect(ids(2, { pulse: false, rhythm: VF }, ['epi-im'])).toEqual(['epi-im-in-arrest']);
    expect(ids(2, { pulse: false, rhythm: VF, harms: [exempt('epi-im-in-arrest', ['epi-im'])] }, ['epi-im'])).toEqual([]);
    expect(ids(2, {}, ['epi-im'])).toEqual(['epi-im-no-anaphylaxis']);
    expect(ids(2, anaphylaxis, ['epi-im'])).toEqual([]);
    expect(ids(2, { harms: [exempt('epi-im-no-anaphylaxis', ['epi-im'])] }, ['epi-im'])).toEqual([]);
    // the gate: in the arrest, whatever else, one penalty
    expect(ids(2, { ...anaphylaxis, pulse: false, rhythm: VF }, ['epi-im'])).toEqual(['epi-im-in-arrest']);
    // the contrast reaction case: before the reaction epinephrine prevents nothing; after it, it is the treatment
    const contrast = SCENARIO_BY_ID['contrast-cathlab'];
    expect(penaltyIds(contrast, 4, ['consent', 'epi-im'])).toEqual(['epi-im-no-anaphylaxis']);
    expect(penaltyIds(contrast, 4, ['consent', 'iv', 'timeout', 'reassess', 'callout', 'epi-im'])).toEqual([]);
  });

  it('antihistamine-first: the adjuncts only after epinephrine', () => {
    for (const drug of ['diphenhydramine', 'steroid']) {
      expect(ids(7, anaphylaxis, ['iv', drug]), drug).toEqual(['antihistamine-first']);
      expect(ids(7, anaphylaxis, ['iv', 'epi-im', drug]), drug).toEqual([]);
      expect(ids(7, anaphylaxis, ['iv', 'push-epi', drug]), drug).toEqual([]);
      expect(ids(7, { ...anaphylaxis, harms: [exempt('antihistamine-first', ['diphenhydramine', 'steroid'])] }, ['iv', drug]), drug).toEqual([]);
    }
  });

  it('antihistamine-no-indication and steroid-no-indication', () => {
    expect(ids(7, {}, ['iv', 'diphenhydramine'])).toEqual(['antihistamine-no-indication']);
    expect(ids(7, { harms: [exempt('antihistamine-no-indication', ['diphenhydramine'])] }, ['iv', 'diphenhydramine'])).toEqual([]);
    expect(ids(7, {}, ['iv', 'steroid'])).toEqual(['steroid-no-indication']);
    // a wheeze is an indication for the steroid, not for the antihistamine
    expect(ids(7, withProblems('bronchospasm'), ['iv', 'steroid'])).toEqual([]);
    expect(ids(7, withProblems('bronchospasm'), ['iv', 'diphenhydramine'])).toEqual(['antihistamine-no-indication']);
    expect(ids(7, { harms: [exempt('steroid-no-indication', ['steroid'])] }, ['iv', 'steroid'])).toEqual([]);
    // the premedication before contrast after an earlier contrast reaction (ACR)
    expect(ids(5, withProblems('contrast-allergy'), ['iv', 'steroid', 'diphenhydramine'])).toEqual([]);
    // the ER nurse with no order: the missing order covers the indication — one penalty
    expect(ids(6, {}, ['iv', 'steroid'])).toEqual(['rn-without-order-steroid']);
  });
});

describe('one dose, one penalty: a case rule that scores the same dose stands in for the built-ins', () => {
  const caseIds = (id: string, role: LearningLevel, steps: string[]) => penaltyIds(SCENARIO_BY_ID[id], role, steps);
  it('a lighter "clear lungs" CPAP rule speaks only where no heavier built-in does: CPAP on a dissection\'s tamponade is the hypotension rule\'s', () => {
    const waiting = ['primary', 'opqrst', 'vitals', 'iv', ...Array(11).fill('reassess')];
    expect(caseIds('aortic-dissection-field', 2, [...waiting, 'cpap'])).toEqual(['cpap-hypotension']);
    expect(caseIds('aortic-dissection-field', 2, ['primary', 'opqrst', 'vitals', 'cpap'])).toEqual(['cpap-no-distress']);
    expect(caseIds('stemi-anterior-field', 2, ['primary', 'cpap'])).toEqual(['cpap-clear']);
  });
  it('BiPAP for a patient with no airway reflexes, or a mask in its place: the case\'s rule, not a built-in as well', () => {
    const sc = SCENARIO_BY_ID['scape-ed'];
    const after = (steps: string[], vitals: Partial<SimState['vitals']>, last: string) => {
      const s = runSteps(sc, 7, steps);
      s.vitals = { ...s.vitals, ...vitals };
      return perform(sc, s, last).penalties.map((p) => p.id);
    };
    expect(after(['ems-handoff'], { gcs: 6, sbp: 80, dbp: 50 }, 'cpap')).toEqual(['niv-unprotected']);
    expect(after(['ems-handoff', 'cpap'], { gcs: 6, rr: 8 }, 'o2-nrb')).toEqual(['niv-off']);
  });
  it('CPAP for an unresponsive patient after ROSC: the case\'s rule, not the indication rule as well', () => {
    expect(caseIds('commotio-cordis-field', 2, ['defib', 'cpr', 'bvm', 'capno', 'cpap'])).toEqual(['cpap-unresponsive']);
  });
  it('glucagon for a patient with no airway reflexes and no overdose: one penalty', () => {
    expect(caseIds('pea-arrest-field', 2, ['cpr', 'pads', 'pulse-check', 'bvm', 'capno', 'hs-ts', 'iv', 'epinephrine', 'cpr', 'cpr', 'glucagon'])).toEqual(['glucagon-no-indication']);
  });
  it('the wrong syringe for the operator\'s order is the order\'s mistake, not the epinephrine rule\'s as well', () => {
    expect(caseIds('scad-cathlab', 4, ['consent', 'heparin', 'timeout', 'ecg12', 'callout', 'ic-epinephrine'])).toEqual(['wrong-rn-nitro']);
  });
  it('the tech who lets go of the groin to bag: the case\'s rule', () => {
    expect(caseIds('vasovagal-sheath-cathlab', 3, ['bvm'])).toEqual(['let-go']);
  });
});

describe('review round: supportive-care contraindications and doubles', () => {
  const at = (setting: 'field' | 'ed' | 'cathlab', role: LearningLevel, over: Partial<FixtureSpec> = {}) => fixture({ setting, role, rhythm: SINUS, ...over });
  const ids = (sc: Scenario, steps: string[]) => penaltyIds(sc, sc.roles[0], steps);

  it('cool-no-hyperthermia: active cooling is for a temperature of 38 °C or more', () => {
    expect(ids(at('field', 2), ['cool'])).toEqual(['cool-no-hyperthermia']);
    expect(ids(at('field', 2, { vitals: { temp: 39.4 } }), ['cool'])).toEqual([]);
    expect(ids(at('field', 2, { harms: [exempt('cool-no-hyperthermia', ['cool'])] }), ['cool'])).toEqual([]);
    // after ROSC in the field, and a normothermic STEMI in the ED; the stimulant's hyperthermia is what it treats
    expect(runSteps(SCENARIO_BY_ID['stemi-walk-in-ed'], 7, ['cool']).penalties.map((p) => p.id)).toEqual(['cool-no-hyperthermia']);
    expect(runSteps(SCENARIO_BY_ID['cocaine-chest-pain-field'], 2, ['primary', 'calm', 'vitals', 'perfusion', 'temp', 'sample', 'midazolam', 'cool']).penalties).toEqual([]);
  });

  it('cpap-pneumothorax-or-facial: no positive pressure on a pneumothorax or a broken or burned face (one penalty, ranked first)', () => {
    const edema = { vitals: { sbp: 180, dbp: 100, spo2: 86, rr: 30 }, problems: ['pulmonary-edema'] as Problem[] };
    expect(ids(at('field', 2, edema), ['cpap'])).toEqual([]);
    for (const p of ['pneumothorax', 'facial-trauma'] as Problem[]) {
      expect(ids(at('field', 2, { ...edema, problems: ['pulmonary-edema', p] }), ['cpap']), p).toEqual(['cpap-pneumothorax-or-facial']);
      expect(ids(at('field', 2, { ...edema, vitals: { ...edema.vitals, ...LOW }, problems: ['pulmonary-edema', p] }), ['cpap']), p).toEqual(['cpap-pneumothorax-or-facial']);
    }
  });

  it('midazolam-glaucoma: its label rules it out in acute narrow-angle glaucoma (one penalty with the unsafe-sedation rule)', () => {
    expect(ids(at('ed', 7, { problems: ['glaucoma'] }), ['iv', 'midazolam'])).toEqual(['midazolam-glaucoma']);
    expect(ids(at('ed', 7, { problems: ['glaucoma'], vitals: LOW }), ['iv', 'midazolam'])).toEqual(['midazolam-glaucoma']);
    expect(ids(at('ed', 7), ['iv', 'midazolam'])).toEqual([]);
  });

  it('inotrope-lvot-obstruction reads a severe aortic stenosis too (milrinone label)', () => {
    expect(ids(at('cathlab', 5, { problems: ['severe-aortic-stenosis', 'cardiogenic-shock'], vitals: { sbp: 96, dbp: 60 } }), ['iv', 'inotrope'])).toEqual(['inotrope-lvot-obstruction']);
  });

  it('pressor-unstable-tachyarrhythmia: the low pressure of a tachyarrhythmia is the rate\'s — cardioversion, not a pressor, until a shock has failed', () => {
    const af = { rhythm: { profile: 'atrial-fibrillation', hr: 170 }, vitals: { sbp: 78, dbp: 48 } };
    for (const id of ['pressor', 'push-epi']) expect(ids(at('ed', 7, af), ['iv', id]), id).toEqual(['pressor-unstable-tachyarrhythmia']);
    // after a shock it is a fair bridge; a sinus tachycardia's low pressure is not this rule's
    expect(ids(at('ed', 7, af), ['iv', 'procedural-sedation', 'pads', 'cardiovert', 'push-epi'])).not.toContain('pressor-unstable-tachyarrhythmia');
    expect(ids(at('ed', 7, { rhythm: { profile: 'sinus-tachycardia', hr: 120 }, vitals: { sbp: 78, dbp: 48 } }), ['iv', 'push-epi'])).toEqual([]);
    // the cases: the unstable SVT and the unstable AF in the ED
    expect(runSteps(SCENARIO_BY_ID['svt-unstable-field'], 2, ['primary', 'pads', 'nibp', 'iv', 'push-epi']).penalties.map((p) => p.id)).toEqual(['pressor-unstable-tachyarrhythmia']);
  });

  it('the ER nurse\'s transfusion or glucagon with no order is the missing order alone; the physician\'s is the case\'s indication rule', () => {
    expect(runSteps(SCENARIO_BY_ID['aortic-dissection-ed'], 6, ['iv', 'transfuse']).penalties.map((p) => p.id)).toEqual(['rn-without-order-transfuse']);
    expect(runSteps(SCENARIO_BY_ID['aortic-dissection-ed'], 7, ['iv', 'transfuse']).penalties.map((p) => p.id)).toEqual(['transfuse-no-bleeding']);
    expect(runSteps(SCENARIO_BY_ID['hyperkalemia-ed'], 6, ['iv', 'glucagon']).penalties.map((p) => p.id)).toEqual(['rn-without-order-glucagon']);
    expect(runSteps(SCENARIO_BY_ID['hyperkalemia-ed'], 7, ['iv', 'glucagon']).penalties.map((p) => p.id)).toEqual(['glucagon-no-overdose']);
  });

  it('beta-blocker overdose: oral glucose into a patient who cannot swallow is the swallow rule alone', () => {
    const s = runSteps(SCENARIO_BY_ID['beta-blocker-overdose-field'], 2, ['aed', 'fentanyl', 'primary', 'ecg-transmit', 'amio-infusion', 'magnesium-sulfate', 'vagal', 'capno',
      'albuterol-hyperk', 'transport-pci', 'restrain', 'oral-glucose', 'atropine', 'magnesium-sulfate', 'pulse-check', 'fentanyl', 'cool', 'calm', 'lidocaine',
      'amio-arrest', 'pace', 'nitro-high', 'oral-glucose']);
    const last = s.penalties.filter((p) => p.minute === s.performed.at(-1)!.minute).map((p) => p.id);
    expect(last).toEqual(['oral-glucose-cannot-swallow']);
  });

  it('the cath lab: access with no time-out and no consent is one penalty (the time-out confirms consent); after the time-out, consent is its own', () => {
    for (const id of ['stemi-cathlab', 'shock-cathlab']) {
      const sc = SCENARIO_BY_ID[id];
      const access = id === 'stemi-cathlab' ? 'access' : 'access-femoral';
      expect(runSteps(sc, 5, [access]).penalties.map((p) => p.id), id).toEqual(['access-no-timeout']);
      expect(runSteps(sc, 5, ['timeout', access]).penalties.map((p) => p.id), id).toEqual(['access-no-consent']);
      expect(runSteps(sc, 5, ['consent', 'timeout', access]).penalties.map((p) => p.id), id).toEqual([]);
    }
    expect(runSteps(SCENARIO_BY_ID['stemi-cathlab'], 5, ['access-venous']).penalties.map((p) => p.id)).toEqual(['access-no-timeout']);
  });

  it('the temporary wire\'s tamponade: a pump put in instead of the needle is one penalty, not the preventable arrest on top', () => {
    const steps = ['consent', 'pads', 'timeout', 'access-femoral', 'access-venous', 'temp-wire', 'reassess', 'reassess', 'reassess', 'reassess', 'reassess'];
    for (const id of ['iabp', 'impella']) {
      const s = runSteps(SCENARIO_BY_ID['heart-block-temp-wire-cathlab'], 5, [...steps, id]);
      expect(s.penalties.map((p) => p.id), id).toEqual(['mcs-tamponade']);
    }
  });

  it('lighter case rules at the built-in weight: the LVAD case\'s nitrate after sildenafil; IM epinephrine in the commotio arrest', () => {
    expect(runSteps(SCENARIO_BY_ID['lvad-field'], 2, ['nitro']).penalties).toEqual([expect.objectContaining({ id: 'nitro-no-indication', points: 10, severity: 'major' })]);
    expect(runSteps(SCENARIO_BY_ID['commotio-cordis-field'], 2, ['epi-im']).penalties.map((p) => p.id)).toEqual(['epi-im-in-arrest']);
  });
});
