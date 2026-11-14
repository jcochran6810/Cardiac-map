import { describe, expect, it } from 'vitest';
import { perform, start } from '@/lib/sim/scenario/engine';
import { PACED_PROFILES, paced, wirePaced } from '@/lib/sim/scenario/kit';
import { answerFor } from '@/lib/sim/scenario/reads';
import { SCENARIO_BY_ID } from '@/lib/sim/scenario/scenarios';
import type { SimState } from '@/lib/sim/scenario/types';
import { UNTIL_ARRIVED, runScenario } from './helpers';

/**
 * The cases draw what their patients have (follow-ups 44, 61, 115, 125, 144): a narrow PEA for the mechanical causes, a
 * VVI wire, the obstructed Takotsubo heart, and a potassium that moves the tracing
 */

const at = (s: SimState, profile: string, hr: number): SimState => ({ ...s, rhythm: { profile, hr } });

describe('paced rhythms', () => {
  it('a pacer drives the heart for the pads, a pacemaker and a temporary wire; a wire is not the pads', () => {
    const s = start(SCENARIO_BY_ID['heart-block-temp-wire-cathlab'], 5);
    expect(PACED_PROFILES).toEqual(['tcp', 'paced', 'paced-vvi']);
    for (const p of PACED_PROFILES) expect(paced(at(s, p, 70)), p).toBe(true);
    expect(paced(at(s, 'third-degree-avb', 32))).toBe(false);
    expect([wirePaced(at(s, 'paced-vvi', 70)), wirePaced(at(s, 'paced', 70)), wirePaced(at(s, 'tcp', 70))]).toEqual([true, true, false]);
  });

  it('the engine\'s own temporary wire paces VVI, and its 12-lead is read as a paced rhythm', () => {
    // a lab case that leaves the wire to the engine: a slow rate and a venous sheath, then the wire
    const sc = SCENARIO_BY_ID['stemi-cathlab'];
    const s0 = start(sc, 5);
    const wired = perform(sc, { ...s0, rhythm: { profile: 'sinus-bradycardia', hr: 40 }, flags: { ...s0.flags, venous: 0 } }, 'temp-wire');
    expect(wired.rhythm).toEqual({ profile: 'paced-vvi', hr: 70 });
    expect(paced(wired)).toBe(true);
    expect(answerFor('paced-vvi').id).toBe('paced');
  });
});

describe('hyperkalemia: the tracing moves with the potassium', () => {
  it('in the ED: untreated it becomes a sine wave, which calcium opens out again (still wide); the shift shrinks it', () => {
    const sc = SCENARIO_BY_ID['hyperkalemia-ed'];
    let s = runScenario(sc, 7, ['primary', 'iv']);
    while (!('worse' in s.flags)) s = perform(sc, s, 'reassess');
    expect(s.rhythm.profile).toBe('hyperkalemia-severe');
    s = perform(sc, s, 'calcium-chloride');
    expect(s.rhythm.profile).toBe('hyperkalemia');
    expect(s.log.some((l) => /opened out into separate complexes again — still wide/.test(l.text))).toBe(true);
    expect(s.log.filter((l) => l.who === 'monitor').map((l) => l.text).join(' ')).not.toMatch(/sine|potassium/i);
  });

  it('in the field: worse untreated, opened out by calcium, smaller once albuterol has shifted it', () => {
    const sc = SCENARIO_BY_ID['hyperkalemia-dialysis-field'];
    let s = runScenario(sc, 2, ['monitor', 'pads', 'iv']);
    while (!s.fired.includes('worse')) s = perform(sc, s, 'reassess');
    expect(s.rhythm.profile).toBe('hyperkalemia-severe');
    expect(sc.facts.ecg12 instanceof Function ? (sc.facts.ecg12 as (x: SimState) => string)(s) : '').toMatch(/sine wave/);
    s = perform(sc, s, 'calcium-chloride');
    expect(s.rhythm.profile).toBe('hyperkalemia');
    // the ideal run: calcium, then albuterol, and the shift shows on the tracing on the way in
    const ideal = runScenario(sc, 2, ['primary', 'monitor', 'ecg12', 'sample', 'pads', 'iv', 'calcium-chloride', 'nibp', 'albuterol-hyperk', 'notify', 'transport-pci', UNTIL_ARRIVED]);
    expect(ideal.flags.shifted).toBeDefined();
    expect(ideal.rhythm.profile).toBe('hyperkalemia-moderate');
    expect(answerFor(ideal.rhythm.profile).id).toBe('hyperkalaemia');
  });
});

describe('Takotsubo: the obstructed heart once the base closes the outflow tract', () => {
  it('the tracing stays the Takotsubo one; the heart behind it changes at the fall, and stays so', () => {
    const sc = SCENARIO_BY_ID['takotsubo-lvot-cathlab'];
    const steps = ['consent', 'heparin', 'timeout', 'access', 'cath-tiger', 'angio', 'cath-pigtail', 'lvedp', 'fluid', 'phenylephrine', 'lv-gram', 'ecg12'];
    let s = start(sc, 5);
    expect(s.rhythm.profile).toBe('takotsubo');
    s = runScenario(sc, 5, steps.slice(0, steps.indexOf('angio') + 1));
    expect(s.flags.obstructed).toBeDefined();
    expect(s.rhythm.profile).toBe('takotsubo-lvoto');
    // relieved by fluid and phenylephrine, the outflow tract is still the narrow one: the heart stays the obstructed one
    s = runScenario(sc, 5, steps);
    expect(s.flags.relieved).toBeDefined();
    expect(s.rhythm.profile).toBe('takotsubo-lvoto');
    expect(answerFor('takotsubo-lvoto').id).toBe(answerFor('takotsubo').id);
  });
});
