/**
 * The built-in rules for procedures and decisions (rules/procedures.ts): each one fires when it should, stays silent in
 * the nearest correct state, gives way to a case rule with its id, and earns one penalty for one action where several
 * rules judge it (the gate order in procedures.ts).
 */
import { describe, expect, it } from 'vitest';
import type { FixtureSpec } from './ruleFixture';
import { fixture, penaltyIds } from './ruleFixture';
import { SCENARIO_BY_ID } from '@/lib/sim/scenario/scenarios';
import type { Harm, Problem } from '@/lib/sim/scenario/types';
import type { LearningLevel } from '@/store/useAppStore';

const SINUS = { profile: 'normal-sinus', hr: 80 };
const STEMI = { profile: 'anterior-stemi', hr: 92 };
const LOW = { sbp: 82, dbp: 50 };

/** A case rule with a built-in's id that never charges: it replaces the built-in always (a deliberate exemption) */
const exempt = (id: string, actions: string[]): Harm => ({ id, actions, when: () => false, points: 1, severity: 'minor', text: 'The case judges this itself.' });
const withProblems = (...problems: Problem[]) => ({ problems });
/** A tamponade that begins mid-case (a perforation, a torn aorta bleeding into the sac): the flag 'tamponade' */
const LATER_TAMPONADE = { extra: { events: [{ id: 'bleeds', when: () => true, effect: () => ({ flags: ['tamponade'] }) }] } };

/** The penalties a run earns, for a fixture written for one role (the setting follows the role unless given) */
function ids(role: LearningLevel, spec: Omit<FixtureSpec, 'role' | 'setting' | 'rhythm'> & Partial<Pick<FixtureSpec, 'setting' | 'rhythm'>>, steps: string[]) {
  const setting = spec.setting ?? (role <= 2 ? 'field' : role <= 5 ? 'cathlab' : 'ed');
  return penaltyIds(fixture({ rhythm: SINUS, ...spec, setting, role }), role, steps);
}

/** The operator's way in: consent, a radial sheath, a diagnostic catheter */
const IN = ['consent', 'access', 'cath-tiger'];
/** …and down the coronary: heparin, a guide, a wire */
const WIRED = [...IN, 'iv', 'heparin', 'guide-ebu', 'wire-workhorse'];

describe('the pericardiocentesis', () => {
  it('pericardiocentesis-no-tamponade: the operator\'s or the ER doctor\'s needle with no tamponade, in the lab as in the department', () => {
    expect(ids(5, {}, ['pericardiocentesis'])).toEqual(['pericardiocentesis-no-tamponade']);
    expect(ids(7, {}, ['pocus', 'pericardiocentesis'])).toEqual(['pericardiocentesis-no-tamponade']);
    expect(ids(5, withProblems('tamponade'), ['pericardiocentesis'])).toEqual([]);
    expect(ids(5, LATER_TAMPONADE, ['pericardiocentesis'])).toEqual([]);
    // the tech only opens the tray
    expect(ids(3, {}, ['pericardiocentesis'])).toEqual([]);
    expect(ids(5, { harms: [exempt('pericardiocentesis-no-tamponade', ['pericardiocentesis'])] }, ['pericardiocentesis'])).toEqual([]);
  });
});

describe('the pumps', () => {
  it('iabp-contraindicated and impella-contraindicated: what each device\'s label rules out', () => {
    for (const p of ['aortic-dissection', 'aortic-regurgitation', 'peripheral-artery-disease'] as Problem[]) {
      expect(ids(5, withProblems(p), ['iabp']), p).toEqual(['iabp-contraindicated']);
      expect(ids(5, withProblems(p), ['impella']), p).toEqual(['impella-contraindicated']);
    }
    for (const p of ['mechanical-aortic-valve', 'severe-aortic-stenosis', 'lv-thrombus', 'ventricular-septal-rupture'] as Problem[]) {
      expect(ids(5, { ...withProblems(p, 'cardiogenic-shock'), vitals: LOW }, ['impella']), p).toEqual(['impella-contraindicated']);
      // not the balloon pump's: in shock it is judged as any balloon pump in shock
      expect(ids(5, { ...withProblems(p, 'cardiogenic-shock'), vitals: LOW }, ['iabp']), p).toEqual(['iabp-routine-shock']);
    }
    expect(ids(5, { ...withProblems('aortic-regurgitation'), harms: [exempt('iabp-contraindicated', ['iabp'])] }, ['iabp'])).toEqual([]);
    expect(ids(5, { ...withProblems('lv-thrombus'), harms: [exempt('impella-contraindicated', ['impella'])] }, ['impella'])).toEqual([]);
    // the gate: a contraindication first, whatever else — one penalty
    expect(ids(5, withProblems('aortic-regurgitation', 'bleeding'), ['iabp'])).toEqual(['iabp-contraindicated']);
  });

  it('mcs-bleeding: a pump needs another big sheath and full anticoagulation', () => {
    for (const pump of ['iabp', 'impella']) {
      expect(ids(5, { ...withProblems('bleeding'), vitals: LOW }, [pump]), pump).toEqual(['mcs-bleeding']);
      expect(ids(5, { ...withProblems('bleeding'), harms: [exempt('mcs-bleeding', ['iabp', 'impella'])] }, [pump]), pump).toEqual([]);
    }
  });

  it('mcs-no-cardiogenic-shock: nothing needs support', () => {
    for (const pump of ['iabp', 'impella']) {
      expect(ids(5, {}, [pump]), pump).toEqual(['mcs-no-cardiogenic-shock']);
      expect(ids(5, { vitals: LOW }, [pump]), pump).toEqual([]);
      expect(ids(5, { harms: [exempt('mcs-no-cardiogenic-shock', ['iabp', 'impella'])] }, [pump]), pump).toEqual([]);
    }
    // cardiogenic shock held over 90 by a pressor is still cardiogenic shock: the Impella is the support
    expect(ids(5, withProblems('cardiogenic-shock'), ['impella'])).toEqual([]);
  });

  it('iabp-routine-shock: no routine balloon pump in infarct-related shock; a mechanical complication is the exception', () => {
    const shock = { ...withProblems('cardiogenic-shock'), vitals: LOW };
    expect(ids(5, shock, ['iabp'])).toEqual(['iabp-routine-shock']);
    expect(ids(5, shock, ['impella'])).toEqual([]);
    expect(ids(5, { ...withProblems('cardiogenic-shock', 'mechanical-complication'), vitals: LOW }, ['iabp'])).toEqual([]);
    expect(ids(5, { ...shock, harms: [exempt('iabp-routine-shock', ['iabp'])] }, ['iabp'])).toEqual([]);
    // the gate: bleeding first — one penalty
    expect(ids(5, { ...withProblems('cardiogenic-shock', 'bleeding'), vitals: LOW }, ['iabp'])).toEqual(['mcs-bleeding']);
  });
});

describe('across the aortic valve: the pigtail, the LV gram and the LVEDP', () => {
  it('lv-crossing-contraindicated: a mechanical aortic valve or a clot in the ventricle', () => {
    for (const p of ['mechanical-aortic-valve', 'lv-thrombus'] as Problem[]) {
      for (const step of ['cath-pigtail', 'lv-gram', 'lvedp']) expect(ids(5, withProblems(p), [...IN, step]), `${p} ${step}`).toEqual(['lv-crossing-contraindicated']);
    }
    expect(ids(5, withProblems('severe-aortic-stenosis'), [...IN, 'cath-pigtail'])).toEqual([]);
    expect(ids(5, { ...withProblems('lv-thrombus'), harms: [exempt('lv-crossing-contraindicated', ['cath-pigtail', 'lv-gram', 'lvedp'])] }, [...IN, 'lv-gram'])).toEqual([]);
    // the gate: before the shock and the contrast rules — one penalty
    expect(ids(5, { ...withProblems('lv-thrombus', 'cardiogenic-shock', 'contrast-allergy'), vitals: LOW }, ['consent', 'access', 'lv-gram'])).toEqual(['lv-crossing-contraindicated']);
  });

  it('lv-gram-in-shock: contrast and volume into a failing ventricle', () => {
    expect(ids(5, { vitals: LOW }, [...IN, 'lv-gram'])).toEqual(['lv-gram-in-shock']);
    expect(ids(5, withProblems('cardiogenic-shock'), [...IN, 'lv-gram'])).toEqual(['lv-gram-in-shock']);
    expect(ids(5, withProblems('pulmonary-edema'), [...IN, 'lv-gram'])).toEqual(['lv-gram-in-shock']);
    expect(ids(5, {}, [...IN, 'lv-gram'])).toEqual([]);
    expect(ids(5, { vitals: LOW, harms: [exempt('lv-gram-in-shock', ['lv-gram'])] }, [...IN, 'lv-gram'])).toEqual([]);
    // the gate: an earlier contrast reaction unprepared first; once the steroid is in, the shock rule speaks
    const allergic = { ...withProblems('contrast-allergy', 'cardiogenic-shock'), vitals: LOW };
    expect(ids(5, allergic, ['consent', 'access', 'lv-gram'])).toEqual(['contrast-allergy-unprepared']);
    expect(ids(5, allergic, ['consent', 'iv', 'steroid', 'access', 'lv-gram'])).toEqual(['lv-gram-in-shock']);
  });
});

describe('the PCI', () => {
  it('access-no-consent: consent, an earlier contrast reaction and the anticoagulants first, in a patient who can answer', () => {
    for (const step of ['access', 'access-femoral', 'access-venous']) {
      expect(ids(5, {}, [step]), step).toEqual(['access-no-consent']);
      expect(ids(5, {}, ['consent', step]), step).toEqual([]);
      // an unresponsive patient's emergency is implied consent
      expect(ids(5, { vitals: { gcs: 10 } }, [step]), step).toEqual([]);
      expect(ids(5, { harms: [exempt('access-no-consent', ['access', 'access-femoral', 'access-venous'])] }, [step]), step).toEqual([]);
    }
  });

  it('pci-no-heparin: nothing goes down the coronary without anticoagulation', () => {
    expect(ids(5, {}, [...IN, 'guide-ebu', 'wire-workhorse'])).toEqual(['pci-no-heparin']);
    expect(ids(5, {}, [...IN, 'iv', 'bivalirudin', 'guide-ebu', 'wire-hydrophilic'])).toEqual([]);
    expect(ids(5, {}, WIRED)).toEqual([]);
    expect(ids(5, { harms: [exempt('pci-no-heparin', ['wire-workhorse'])] }, [...IN, 'guide-ebu', 'wire-workhorse'])).toEqual([]);
  });

  it('aspiration-routine: no routine aspiration in a primary PCI; a large thrombus is the exception', () => {
    expect(ids(5, { rhythm: STEMI }, [...WIRED, 'aspiration'])).toEqual(['aspiration-routine']);
    expect(ids(5, { rhythm: STEMI, ...withProblems('large-thrombus-burden') }, [...WIRED, 'aspiration'])).toEqual([]);
    // not a primary PCI, or after the stent
    expect(ids(5, {}, [...WIRED, 'aspiration'])).toEqual([]);
    expect(ids(5, { rhythm: STEMI }, [...WIRED, 'stent-des', 'aspiration'])).toEqual([]);
    expect(ids(5, { rhythm: STEMI, harms: [exempt('aspiration-routine', ['aspiration'])] }, [...WIRED, 'aspiration'])).toEqual([]);
  });

  it('covered-no-perforation: a covered stent seals a hole; with none it restenoses and clots', () => {
    expect(ids(5, {}, [...WIRED, 'stent-covered'])).toEqual(['covered-no-perforation']);
    const perforated = { extra: { events: [{ id: 'hole', when: () => true, effect: () => ({ flags: ['perforation'] }) }] } };
    expect(ids(5, perforated, [...WIRED, 'stent-covered'])).toEqual([]);
    expect(ids(5, withProblems('bleeding'), [...WIRED, 'stent-covered'])).toEqual([]);
    expect(ids(5, { harms: [exempt('covered-no-perforation', ['stent-covered'])] }, [...WIRED, 'stent-covered'])).toEqual([]);
  });
});

describe('contrast after an earlier reaction', () => {
  it('contrast-allergy-unprepared: the steroid (and antihistamine) first — once for the case', () => {
    const allergic = withProblems('contrast-allergy');
    expect(ids(5, allergic, [...IN, 'angio'])).toEqual(['contrast-allergy-unprepared']);
    expect(ids(5, allergic, [...IN, 'view-rao-caudal', 'angio', 'final-angio'])).toEqual(['contrast-allergy-unprepared']);
    expect(ids(5, allergic, ['consent', 'iv', 'steroid', 'access', 'cath-tiger', 'angio'])).toEqual([]);
    expect(ids(7, allergic, ['ct-urgent'])).toEqual(['contrast-allergy-unprepared']);
    expect(ids(5, {}, [...IN, 'angio'])).toEqual([]);
    expect(ids(5, { ...allergic, harms: [exempt('contrast-allergy-unprepared', ['angio'])] }, [...IN, 'angio'])).toEqual([]);
    // the gate: the scanner's own rules first — one penalty
    expect(ids(7, { ...allergic, vitals: LOW }, ['ct-urgent'])).toEqual(['ct-unstable']);
  });
});

describe('the scanner, the central line and the transfer (the emergency department)', () => {
  it('ct-delays-reperfusion: no CT before the blocked artery is opened, without a reason', () => {
    expect(ids(7, { rhythm: STEMI }, ['ecg12', 'ct-urgent'])).toEqual(['ct-delays-reperfusion']);
    expect(ids(5, { rhythm: STEMI }, ['ct-urgent'])).toEqual(['ct-delays-reperfusion']);
    for (const p of ['aortic-dissection', 'pulmonary-embolism', 'bleeding', 'stroke'] as Problem[]) {
      expect(ids(7, { rhythm: STEMI, ...withProblems(p) }, ['ecg12', 'ct-urgent']), p).toEqual([]);
    }
    expect(ids(7, {}, ['ecg12', 'ct-urgent'])).toEqual([]);
    expect(ids(7, { rhythm: STEMI, harms: [exempt('ct-delays-reperfusion', ['ct-urgent'])] }, ['ecg12', 'ct-urgent'])).toEqual([]);
    // the gate: an unstable patient is the other rule's
    expect(ids(7, { rhythm: STEMI, vitals: LOW }, ['ecg12', 'ct-urgent'])).toEqual(['ct-unstable']);
  });

  it('central-line-no-indication: a working IV, no pressor, no pacing wire', () => {
    expect(ids(7, {}, ['iv', 'central-line'])).toEqual(['central-line-no-indication']);
    expect(ids(7, {}, ['central-line'])).toEqual([]);
    expect(ids(7, { vitals: LOW }, ['iv', 'central-line'])).toEqual([]);
    expect(ids(7, { rhythm: { profile: 'sinus-bradycardia', hr: 40 } }, ['iv', 'central-line'])).toEqual([]);
    expect(ids(7, { harms: [exempt('central-line-no-indication', ['central-line'])] }, ['iv', 'central-line'])).toEqual([]);
  });

  it('transfer-unstable: stabilize first (EMTALA)', () => {
    expect(ids(7, { vitals: LOW }, ['transfer'])).toEqual(['transfer-unstable']);
    expect(ids(7, {}, ['transfer'])).toEqual([]);
    expect(ids(7, { vitals: LOW, harms: [exempt('transfer-unstable', ['transfer'])] }, ['transfer'])).toEqual([]);
  });

  it('cath-lab-dissection: a torn aorta goes to the surgeon, not the cath lab', () => {
    const dissection = { rhythm: STEMI, ...withProblems('aortic-dissection') };
    expect(ids(7, dissection, ['ecg12', 'cath-lab-activate'])).toEqual(['cath-lab-dissection']);
    expect(ids(2, dissection, ['ecg12', 'stemi-alert'])).toEqual(['cath-lab-dissection']);
    expect(ids(7, { rhythm: STEMI }, ['ecg12', 'cath-lab-activate'])).toEqual([]);
    expect(ids(7, { ...dissection, harms: [exempt('cath-lab-dissection', ['cath-lab-activate'])] }, ['ecg12', 'cath-lab-activate'])).toEqual([]);
    // the gate: a 12-lead with no STEMI is the no-STEMI rule's — one penalty
    expect(ids(7, withProblems('aortic-dissection'), ['ecg12', 'cath-lab-activate'])).toEqual(['cath-lab-no-ste']);
  });
});

describe('one action, one penalty: a case rule that scores the same action stands in for the built-ins', () => {
  const caseIds = (id: string, role: LearningLevel, steps: string[]) => penaltyIds(SCENARIO_BY_ID[id], role, steps);
  it('transferring a PE in shock out of a hospital that can treat her: the case\'s rule', () => {
    expect(caseIds('pulmonary-embolism-lysis-ed', 7, ['ems-handoff', 'pocus', 'transfer'])).toEqual(['transfer-pe']);
  });
  it('an LV gram during the contrast reaction: the case\'s rule', () => {
    expect(caseIds('contrast-cathlab', 5, ['consent', 'timeout', 'access', 'cath-tiger', 'angio', 'lv-gram'])).toEqual(['contrast-during-reaction']);
  });
});
