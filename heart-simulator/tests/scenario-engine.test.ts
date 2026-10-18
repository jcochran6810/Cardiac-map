import { describe, expect, it } from 'vitest';
import { interventionsFor } from '@/lib/sim/scenario/interventions';
import { HINT_POINTS, perform, review, start, stop, takeHint, unavailableReason } from '@/lib/sim/scenario/engine';
import { stemiAnterior } from '@/lib/sim/scenario/scenarios/stemiAnterior';
import { runScenario as run } from './helpers';

const MEDIC_IDEAL = [
  'primary', 'opqrst', 'sample', 'vitals', 'ecg12', 'pads', 'aspirin', 'iv', 'stemi-alert', 'ask-pde5', 'nitro',
  'transport-pci', 'reassess', 'reassess', 'defib', 'ecg12-repeat', 'reassess', 'reassess', 'reassess', 'reassess', 'reassess', 'handoff',
];
const EMT_IDEAL = [
  'primary', 'opqrst', 'sample', 'vitals', 'als', 'ecg12', 'ecg-transmit', 'aspirin', 'transport-pci',
  'reassess', 'reassess', 'aed', 'ecg12-repeat', 'reassess', 'reassess', 'reassess', 'reassess', 'reassess', 'handoff',
];

describe('scope of practice', () => {
  it('offers every role only the interventions in its scope', () => {
    const emt = interventionsFor(1, 'field').map((i) => i.id);
    expect(emt).toContain('aspirin');
    expect(emt).toContain('aed');
    expect(emt).toContain('nitro-assist');
    for (const id of ['iv', 'nitro', 'epinephrine', 'defib', 'cardiovert', 'pace', 'stemi-alert', 'ecg-right']) expect(emt).not.toContain(id);
    const medic = interventionsFor(2, 'field').map((i) => i.id);
    for (const id of ['iv', 'nitro', 'defib', 'cardiovert', 'pace', 'stemi-alert', 'atropine']) expect(medic).toContain(id);
    for (const id of ['pci', 'heparin', 'tnk', 'timeout']) expect(medic).not.toContain(id);
    const tech = interventionsFor(3, 'cathlab').map((i) => i.id);
    expect(tech).toContain('transducer');
    expect(tech).toContain('callout');
    for (const id of ['heparin', 'pci', 'nitro', 'sedation']) expect(tech).not.toContain(id);
    const md = interventionsFor(5, 'cathlab').map((i) => i.id);
    for (const id of ['pci', 'angio', 'heparin', 'tnk']) expect(md).toContain(id);
  });

  it('refuses interventions outside the scope', () => {
    const s = start(stemiAnterior, 1);
    expect(unavailableReason(stemiAnterior, s, 'nitro')).toMatch(/scope/);
    expect(perform(stemiAnterior, s, 'nitro')).toBe(s);
  });
});

describe('engine basics', () => {
  it('advances the clock by each intervention and logs the dialog', () => {
    const s = run(stemiAnterior, 2, ['primary', 'ecg12']);
    expect(s.minute).toBeCloseTo(3, 5);
    expect(s.log.some((l) => /anterior STEMI/.test(l.text))).toBe(true);
    expect(s.flags.ecg12).toBeCloseTo(3, 5);
  });

  it('blocks IV drugs until there is access, without passing time', () => {
    const s = run(stemiAnterior, 2, ['fentanyl']);
    expect(s.minute).toBe(0);
    expect(s.counts.fentanyl).toBeUndefined();
    expect(s.log.at(-1)!.text).toMatch(/IV or IO access/);
  });

  it('keeps an EMT from interpreting the 12-lead', () => {
    const s = run(stemiAnterior, 1, ['ecg12']);
    expect(s.log.at(-1)!.text).toMatch(/can't interpret/);
    expect(s.log.some((l) => /STEMI/.test(l.text))).toBe(false);
  });

  it('is deterministic', () => {
    expect(run(stemiAnterior, 2, MEDIC_IDEAL)).toEqual(run(stemiAnterior, 2, MEDIC_IDEAL));
  });
});

describe('anterior STEMI in the field', () => {
  it('paramedic: the ideal run ends by itself with full marks', () => {
    const s = run(stemiAnterior, 2, MEDIC_IDEAL);
    expect(s.ended?.reason).toBe('complete');
    expect(s.fired).toContain('vf');
    expect(s.flags.rosc).toBeDefined();
    expect(s.rhythm.profile).toBe('anterior-stemi');
    const r = review(stemiAnterior, s);
    expect(r.toFix).toEqual([]);
    expect(r.percent).toBe(100);
    expect(r.grade).toBe('Excellent');
    expect(r.timings.find((t) => t.label === 'First 12-lead')?.met).toBe(true);
  });

  it('EMT: the ideal BLS run (aspirin, transmit, ALS, AED) also scores 100', () => {
    const s = run(stemiAnterior, 1, EMT_IDEAL);
    expect(s.ended?.reason).toBe('complete');
    const r = review(stemiAnterior, s);
    expect(r.toFix).toEqual([]);
    expect(r.percent).toBe(100);
  });

  it('VF comes on its own if the crew stays on scene, and kills the patient if nobody acts', () => {
    let s = start(stemiAnterior, 2);
    for (let i = 0; i < 8; i++) s = perform(stemiAnterior, s, 'reassess');
    expect(s.pulse).toBe(false);
    expect(s.rhythm.profile).toBe('vf');
    for (let i = 0; i < 10 && !s.ended; i++) s = perform(stemiAnterior, s, 'reassess');
    expect(s.ended?.reason).toBe('death');
    expect(review(stemiAnterior, s).percent).toBeLessThanOrEqual(40);
  });

  it('penalises unsafe choices and explains them in the review', () => {
    const s = run(stemiAnterior, 2, ['nitro', 'o2-nrb', 'transport-near']);
    const ids = s.penalties.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['nitro-no-bp', 'nitro-no-pde5', 'oxygen-normoxic', 'nearest-ed']));
    const r = review(stemiAnterior, stop(s));
    expect(r.toFix.filter((t) => t.kind === 'harm').length).toBe(4);
    expect(r.toFix.some((t) => t.kind === 'missed' && /12-lead/.test(t.label))).toBe(true);
    expect(r.grade).toBe('Unsafe');
  });

  it('counts a late intervention at half marks', () => {
    const late = ['primary', 'opqrst', 'sample', 'vitals', 'iv', 'reassess', 'reassess', 'lungs', 'ecg12'];
    const s = run(stemiAnterior, 2, late);
    expect(s.performed.find((p) => p.id === 'ecg12')!.minute).toBeGreaterThan(10);
    const r = review(stemiAnterior, stop(s));
    const item = r.toFix.find((t) => t.kind === 'late' && /12-lead/.test(t.label));
    expect(item?.points).toBe(7.5);
  });

  it('shocking a patient with a pulse is a critical error', () => {
    const s = run(stemiAnterior, 2, ['defib']);
    expect(s.penalties[0]).toMatchObject({ id: 'shock-with-pulse', severity: 'critical' });
  });

  it('ends early on request with the missing items listed', () => {
    const s = stop(run(stemiAnterior, 2, ['primary']));
    expect(s.ended?.reason).toBe('stopped');
    const r = review(stemiAnterior, s);
    expect(r.outcome).toMatch(/Ended early/);
    expect(r.toFix.filter((t) => t.kind === 'missed').length).toBeGreaterThan(5);
  });
});

describe('hints', () => {
  it('names the next missing critical item, costs points and takes no time', () => {
    const s0 = run(stemiAnterior, 2, ['primary', 'opqrst', 'sample']);
    const s = takeHint(stemiAnterior, s0);
    expect(s.minute).toBe(s0.minute);
    expect(s.log.at(-1)!.text).toMatch(/^Hint: Vital signs/);
    expect(s.penalties).toEqual([expect.objectContaining({ id: 'hint-1', points: HINT_POINTS })]);
    const r = review(stemiAnterior, stop(s));
    expect(r.hints).toBe(1);
    expect(r.toFix.at(-1)).toMatchObject({ kind: 'hint' });
  });
});
