import { describe, expect, it } from 'vitest';
import { interventionsFor } from '@/lib/sim/scenario/interventions';
import { HINT_POINTS, perform, answerRead, review, start, stop, takeHint, unavailableReason } from '@/lib/sim/scenario/engine';
import { READ_OPTIONS, answerFor, judgeRead } from '@/lib/sim/scenario/reads';
import { SCENARIO_BY_ID } from '@/lib/sim/scenario/scenarios';
import { stemiAnterior } from '@/lib/sim/scenario/scenarios/stemiAnterior';
import { ECG_PROFILES } from '@/lib/ecg/profiles';
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
    for (const id of ['stent-des', 'heparin', 'tnk', 'timeout']) expect(medic).not.toContain(id);
    const tech = interventionsFor(3, 'cathlab').map((i) => i.id);
    expect(tech).toContain('transducer');
    expect(tech).toContain('callout');
    // the tech prepares and hands the devices and runs the C-arm; drugs are the nurse's
    for (const id of ['guide-ebu', 'stent-des', 'view-rao-cranial', 'ffr']) expect(tech).toContain(id);
    for (const id of ['heparin', 'nitro', 'sedation', 'access', 'angio']) expect(tech).not.toContain(id);
    const rn = interventionsFor(4, 'cathlab').map((i) => i.id);
    for (const id of ['heparin', 'protamine', 'radial-cocktail', 'ic-nitro']) expect(rn).toContain(id);
    for (const id of ['guide-ebu', 'stent-des', 'view-rao-cranial', 'access']) expect(rn).not.toContain(id);
    const md = interventionsFor(5, 'cathlab').map((i) => i.id);
    for (const id of ['access', 'angio', 'guide-ebu', 'stent-des', 'heparin', 'tnk', 'impella']) expect(md).toContain(id);
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

  it('the monitor shows numbers, never the rhythm or the diagnosis', () => {
    const line = run(stemiAnterior, 2, ['monitor']).log.at(-1)!.text;
    expect(line).toBe('Monitor attached: heart rate 96.');
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

describe('12-lead reads, checked at once', () => {
  const read = (steps: string[], sc = stemiAnterior, role: 2 | 3 = 2) => run(sc, role, steps, undefined, 'manual');

  it('a new 12-lead waits for your read, and nothing else can be done until you give it', () => {
    const s = read(['primary', 'ecg12']);
    expect(s.pendingRead).toMatchObject({ kind: 'ecg', minute: 3, answer: 'stemi-anterior' });
    expect(unavailableReason(stemiAnterior, s, 'aspirin')).toMatch(/12-lead read/);
    expect(perform(stemiAnterior, s, 'aspirin')).toBe(s);
    // nobody reads it for you
    expect(s.log.some((l) => /STEMI|ST elevation|sinus/i.test(l.text))).toBe(false);
  });

  it('a correct read is confirmed at once, with no case time and no points lost', () => {
    const s0 = read(['primary', 'ecg12']);
    const s = answerRead(stemiAnterior, s0, 'stemi-anterior');
    expect(s.minute).toBe(s0.minute);
    expect(s.pendingRead).toBeNull();
    expect(s.log.at(-2)).toMatchObject({ who: 'you', text: 'My read: Anterior STEMI.' });
    expect(s.log.at(-1)).toMatchObject({ who: 'feedback', tone: 'good' });
    expect(s.log.at(-1)!.text).toMatch(/^Correct\. Sinus rhythm 96 with 3–4 mm ST elevation in V1–V4/);
    expect(s.penalties).toEqual([]);
    expect(unavailableReason(stemiAnterior, s, 'aspirin')).toBeNull();
  });

  it('a wrong read is corrected with the answer, costs 5 points and is listed in the review', () => {
    const s = read(['primary', 'ecg12', 'read:stemi-inferior']);
    expect(s.log.at(-1)).toMatchObject({ who: 'feedback', tone: 'bad' });
    expect(s.log.at(-1)!.text).toMatch(/^Not quite — this is Anterior STEMI\. /);
    expect(s.penalties).toEqual([expect.objectContaining({ id: 'misread-1', points: 5, severity: 'major' })]);
    const r = review(stemiAnterior, stop(s));
    expect(r.reads).toEqual([{ kind: 'ecg', minute: 3, chosen: 'Inferior STEMI', answer: 'Anterior STEMI', verdict: 'wrong' }]);
    expect(r.toFix.find((t) => t.kind === 'read')).toMatchObject({ label: 'Misread 12-lead at 3:00', points: 5 });
  });

  it('half of a combined finding earns partial credit', () => {
    // the inferior STEMI goes into complete heart block while the 12-lead is being recorded
    const sc = SCENARIO_BY_ID['stemi-inferior-rv-field'];
    const s = read(['primary', 'vitals', 'iv', 'opqrst', 'sample', 'lungs', 'perfusion', 'ecg12', 'read:chb'], sc);
    expect(s.reads[0]).toMatchObject({ kind: 'ecg', answer: 'stemi-inferior-chb', verdict: 'partial' });
    expect(s.log.at(-1)!.text).toMatch(/^Partly right — the full read is Inferior STEMI with complete heart block\./);
    expect(s.penalties[0]).toMatchObject({ points: 2, severity: 'minor' });
  });

  it('an unchanged repeat needs no new read; a changed tracing does', () => {
    const same = run(stemiAnterior, 2, ['primary', 'ecg12', 'ecg12-repeat']);
    expect(same.reads).toHaveLength(1);
    expect(same.log.at(-1)!.text).toBe('Unchanged from the previous 12-lead.');
    const svt = SCENARIO_BY_ID['svt-unstable-field'];
    const changed = run(svt, 2, ['pads', 'ecg12', 'iv', 'sedation', 'cardiovert', 'ecg12-repeat']);
    expect(changed.reads.map((r) => r.answer)).toEqual(['svt', 'nsr']);
  });

  it('the case does not end while a read is waiting', () => {
    const lab = SCENARIO_BY_ID['stemi-cathlab'];
    const steps = ['prep', 'transducer', 'pads', 'timeout', 'act', 'cath-tiger', 'read:angio-lad-prox-occlusion', 'guide-ebu', 'read:hemo-damped', 'callout', 'view-rao-cranial',
      'wire-workhorse', 'balloon-predil', 'stent-des', 'defib', 'balloon-nc', 'read:angio-timi3', 'hemostasis', 'ecg12'];
    const s = run(lab, 3, steps, undefined, 'manual');
    expect(s.pendingRead).not.toBeNull();
    expect(s.ended).toBeNull();
    const done = answerRead(lab, s, 'reperfused-anterior');
    expect(done.ended?.reason).toBe('complete');
  });

  it('EMTs acquire and transmit; they are not asked to read', () => {
    expect(read(['ecg12'], stemiAnterior, 2 as never).pendingRead).not.toBeNull();
    expect(run(stemiAnterior, 1, ['ecg12'], undefined, 'manual').pendingRead).toBeNull();
  });

  it('a hint during a read coaches the method and costs nothing', () => {
    const s = takeHint(stemiAnterior, read(['primary', 'ecg12']));
    expect(s.log.at(-1)).toMatchObject({ who: 'feedback' });
    expect(s.penalties).toEqual([]);
  });

  it('every ECG profile with a pulse has exactly one correct read, and no 12-lead is taken in arrest', () => {
    expect(new Set(READ_OPTIONS.map((o) => o.id)).size).toBe(READ_OPTIONS.length);
    for (const o of READ_OPTIONS) for (const p of o.profiles ?? []) expect(ECG_PROFILES[p], `${o.id}: ${p}`).toBeDefined();
    for (const p of Object.values(ECG_PROFILES)) {
      if (p.id === 'pea') continue;
      expect(READ_OPTIONS.filter((o) => (o.profiles ?? []).includes(p.id)), p.id).toHaveLength(1);
      expect(judgeRead(p.id, answerFor(p.id).id)).toBe('correct');
    }
    const vf = SCENARIO_BY_ID['vf-arrest-field'];
    expect(perform(vf, start(vf, 2), 'ecg12').counts.ecg12).toBeUndefined();
  });
});
