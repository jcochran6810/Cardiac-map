/**
 * The new drugs and positions inside the cases: each meets the case's own trap (the penalty and the crash the old drug
 * of its group meets), each right one is credited, and sitting up is right where the case teaches it.
 */
import { describe, expect, it } from 'vitest';
import { review, stop } from '@/lib/sim/scenario/engine';
import { SCENARIO_BY_ID } from '@/lib/sim/scenario/scenarios';
import type { SimState } from '@/lib/sim/scenario/types';
import type { LearningLevel } from '@/store/useAppStore';
import { UNTIL_ARRIVED, runScenario } from './helpers';

const run = (id: string, role: LearningLevel, steps: string[]) => runScenario(SCENARIO_BY_ID[id], role, steps);
const ids = (s: SimState) => s.penalties.map((p) => p.id);
const said = (s: SimState, re: RegExp) => s.log.some((l) => re.test(l.text));
const R = (n: number) => Array<string>(n).fill('reassess');

describe('sitting up in tamponade: what she wants, and no penalty', () => {
  it('the ED patient (both roles) and the field patient (both roles) sit up at a low pressure without a charge', () => {
    for (const [id, role, first] of [['tamponade-ed', 7, 'primary'], ['tamponade-ed', 6, 'triage'], ['tamponade-field', 2, 'primary'], ['tamponade-field', 1, 'primary']] as const) {
      const s = run(id, role, [first, 'sit-up']);
      expect(s.vitals.sbp, id).toBeLessThan(90);
      expect(ids(s), `${id} ${role}`).toEqual([]);
      expect(said(s, /leaning forward/), `${id} ${role}`).toBe(true);
      expect(s.flags['sat-up']).toBeDefined();
    }
  });
});

describe('calcium gluconate where the cases teach calcium', () => {
  it('the dialysis patient in the field: the ideal run with the gluconate is complete at 100 %, with the same rescue', () => {
    const steps = ['primary', 'monitor', 'ecg12', 'sample', 'pads', 'iv', 'calcium-gluconate', 'nibp', 'albuterol-hyperk', 'notify', 'transport-pci', UNTIL_ARRIVED, 'handoff'];
    const sc = SCENARIO_BY_ID['hyperkalemia-dialysis-field'];
    const s = runScenario(sc, 2, steps);
    expect(s.ended?.reason).toBe('complete');
    expect(review(sc, s).percent).toBe(100);
    const first = runScenario(sc, 2, steps.slice(0, steps.indexOf('calcium-gluconate') + 1));
    expect([first.rhythm.hr, first.vitals.sbp]).toEqual([54, 96]);
    expect(said(first, /burns/)).toBe(false);
  });

  it('after diltiazem in the field it counters the vessels as the chloride does; with no indication it is charged as the chloride is', () => {
    const af = run('af-rvr-field', 2, ['primary', 'iv', 'diltiazem', 'calcium-gluconate']);
    expect(af.vitals.sbp).toBeGreaterThanOrEqual(92);
    expect(af.flags.calcium).toBeDefined();
    expect(ids(run('stable-vt-field', 2, ['primary', 'iv', 'calcium-gluconate']))).toEqual(['calcium-no-indication']);
  });
});

describe('adenosine 3 mg meets the traps of the 6 mg dose', () => {
  it('pre-excited AF: the critical penalty and VF; torsades: the critical penalty and the arrest', () => {
    const wpw = run('wpw-af-field', 2, ['primary', 'monitor', 'iv', 'adenosine3']);
    expect(ids(wpw)).toContain('av-blocker-preexcited-af');
    expect(wpw.pulse).toBe(false);
    const tdp = run('torsades-field', 2, ['primary', 'monitor', 'iv', 'adenosine3']);
    expect(ids(tdp)).toContain('adenosine-long-qt');
    expect(tdp.pulse).toBe(false);
  });
});

describe('IV nitroglycerin meets the cases\' nitrate traps', () => {
  it('after the tadalafil (STEMI walk-in): the PDE-5 penalty and the crash, for the doctor and the nurse', () => {
    const md = run('stemi-walk-in-ed', 7, ['primary', 'opqrst', 'sample', 'ask-pde5', 'reassess', 'nitro-iv']);
    expect(ids(md)).toEqual(['nitro-pde5']);
    expect(md.vitals.sbp).toBeLessThan(90);
    const rn = run('stemi-walk-in-ed', 6, ['triage', 'sample', 'ask-pde5', 'iv', 'nitro-iv']);
    expect(ids(rn)).toEqual(['nitro-pde5']);
  });

  it('complete heart block with a low pressure in the lab: the nitrate low-pressure rule', () => {
    expect(ids(run('heart-block-temp-wire-cathlab', 5, ['nitro-iv']))).toEqual(['nitro-hypotension']);
  });

  it('SCAPE: under 120 it is the case\'s below-target rule; a hypotensive furosemide is the built-in low-pressure rule (8)', () => {
    const s = run('scape-ed', 7, ['ems-handoff', 'cpap', 'lungs', 'iv', 'nitro-high', 'nitro-iv', 'nitro-iv', 'nitro-iv', 'nitro-high', 'nitro-high', 'nibp', 'furosemide']);
    expect(ids(s)).toContain('nitro-below-target');
    expect(s.penalties.find((p) => p.id === 'furosemide-hypotension')?.points).toBe(8);
    expect(ids(s)).not.toContain('diuretic-not-overloaded');
    // with the pressure holding: the case's own 'not overloaded' rule; the nurse without an order earns one penalty for it
    expect(ids(run('scape-ed', 7, ['ems-handoff', 'cpap', 'lungs', 'iv', 'furosemide']))).toEqual(['diuretic-not-overloaded']);
    expect(ids(run('scape-ed', 6, ['ems-handoff', 'cpap', 'iv', 'furosemide']))).toEqual(['rn-diuretic-not-overloaded']);
  });

  it('a dissection before the beta-blocker: the case\'s vasodilator rule and the reflex rise in the rate', () => {
    const s = run('aortic-dissection-ed', 7, ['opqrst', 'bp-both-arms', 'pocus', 'call-surgery', 'nitro-iv']);
    expect(ids(s)).toEqual(['vasodilator-before-rate-md']);
    expect(said(s, /my heart is pounding/)).toBe(true);
  });

  it('the NSTEMI\'s returning pain: an IV infusion is credited as the treatment', () => {
    const steps = ['opqrst', 'sample', 'ecg-posterior', 'aspirin', 'heparin', 'troponin-repeat', ...R(4), 'consult-cardiology', 'admit', ...R(8),
      'ecg12-repeat', 'nitro-iv', 'consult-cardiology', ...R(19), 'handoff'];
    const sc = SCENARIO_BY_ID['nstemi-troponin-ed'];
    const s = runScenario(sc, 7, steps);
    expect(s.ended?.reason).toBe('complete');
    expect(review(sc, s).toFix.filter((t) => t.kind === 'missed')).toEqual([]);
    expect(said(s, /^Nitroglycerin infusion started at 10 mcg\/min/)).toBe(true);
  });
});

describe('the new beta-blockers meet the cases\' beta-blocker traps', () => {
  it('tamponade, a pulmonary embolism in shock, anaphylaxis', () => {
    const tamponade = run('tamponade-ed', 7, ['perfusion', 'lungs', 'esmolol']);
    expect(ids(tamponade)).toEqual(['rate-slowing-tamponade']);
    expect(tamponade.vitals.sbp).toBeLessThan(80);
    expect(ids(run('pulmonary-embolism-lysis-ed', 7, ['ems-handoff', 'esmolol']))).toEqual(['rate-control-pe']);
    expect(ids(run('contrast-cathlab', 5, ['esmolol']))).toEqual(['beta-blocker']);
  });

  it('the STEMI with crackles: esmolol, labetalol and the tablet are each charged; the IV ones fill his lungs', () => {
    for (const drug of ['esmolol', 'labetalol']) {
      const s = run('stemi-walk-in-ed', 7, ['primary', 'lungs', 'iv', drug]);
      expect(ids(s), drug).toEqual(['rate-drug-heart-failure']);
      expect(s.vitals.spo2, drug).toBeLessThan(94);
    }
    expect(ids(run('stemi-walk-in-ed', 7, ['primary', 'lungs', 'metoprolol-po']))).toEqual(['rate-drug-heart-failure']);
  });

  it('SCAD: any beta-blocker is credited once the SCAD is seen', () => {
    const md = ['consent', 'heparin', 'timeout', 'access', 'cath-jl4', 'reposition', 'angio', 'ic-nitro', 'view-lao-cranial', 'stop-antithrombotics'];
    const sc = SCENARIO_BY_ID['scad-cathlab'];
    for (const drug of ['esmolol', 'labetalol', 'metoprolol-po']) {
      const s = runScenario(sc, 5, [...md, drug]);
      expect(review(sc, stop(s)).wentWell.map((w) => w.label), drug).toContain('A beta-blocker once the SCAD is seen: IV, or by mouth');
    }
  });
});

describe('lowering the pressure of 174/92 in an acute ischemic stroke', () => {
  it('nicardipine, labetalol, esmolol and IV nitroglycerin are each the lowering mistake, and the pressure falls', () => {
    for (const drug of ['nicardipine', 'labetalol', 'esmolol', 'nitro-iv']) {
      for (const [role, first] of [[5, 'stop-contrast'], [4, 'callout']] as const) {
        const s = run('periprocedural-stroke-cathlab', role, [first, 'stroke-team', 'neuro', drug]);
        expect(ids(s), `${drug} ${role}`).toEqual(['lower-bp-stroke']);
        expect(s.vitals.sbp, drug).toBeLessThan(174);
        expect(s.flags['bp-drug'], drug).toBeDefined();
      }
    }
    // a tablet: nothing by mouth with a new deficit
    expect(ids(run('periprocedural-stroke-cathlab', 5, ['stop-contrast', 'stroke-team', 'neuro', 'metoprolol-po']))).toEqual(['nothing-by-mouth']);
  });
});

describe('restraint in the cocaine case: only while he endangers himself or the crew', () => {
  it('oriented and restless (before the severe agitation): restraint costs 5, for the EMT and the paramedic', () => {
    expect(ids(run('cocaine-chest-pain-field', 2, ['primary', 'restrain']))).toEqual(['restraint-not-yet']);
    expect(ids(run('cocaine-chest-pain-field', 1, ['primary', 'als', 'restrain']))).toEqual(['restraint-not-yet']);
  });

  it('out of control and confused (the severe agitation, no benzodiazepine yet): restraint face up is no mistake; face down always is', () => {
    const severe = run('cocaine-chest-pain-field', 2, ['primary', ...R(16), 'restrain']);
    expect(severe.flags.severe).toBeDefined();
    expect(ids(severe)).not.toContain('restraint-not-yet');
    expect(ids(severe)).not.toContain('restraint-no-indication');
    expect(ids(run('cocaine-chest-pain-field', 2, ['primary', 'restrain-prone']))).toEqual(['prone-restraint']);
  });

  it('calmed by the benzodiazepine: restraint costs 5 again', () => {
    expect(ids(run('cocaine-chest-pain-field', 2, ['primary', 'iv', 'midazolam', 'restrain']))).toContain('restraint-not-yet');
  });
});
