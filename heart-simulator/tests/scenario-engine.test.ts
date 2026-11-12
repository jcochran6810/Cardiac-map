import { describe, expect, it } from 'vitest';
import { interventionsFor } from '@/lib/sim/scenario/interventions';
import { HINT_POINTS, perform, answerRead, review, start, stop, takeHint, unavailableReason } from '@/lib/sim/scenario/engine';
import { READ_OPTIONS, answerFor, judgeRead } from '@/lib/sim/scenario/reads';
import { SCENARIO_BY_ID } from '@/lib/sim/scenario/scenarios';
import { stemiAnterior } from '@/lib/sim/scenario/scenarios/stemiAnterior';
import { ECG_PROFILES } from '@/lib/ecg/profiles';
import type { SimState } from '@/lib/sim/scenario/types';
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
    expect(r.missed).toBe(r.toFix.filter((t) => t.kind === 'missed').length);
  });

  it('an ideal run says every critical item was done, and counts none missed', () => {
    const r = review(stemiAnterior, run(stemiAnterior, 2, MEDIC_IDEAL));
    expect(r.missed).toBe(0);
    expect(r.outcome).toMatch(/^Every critical intervention done in \d+:\d\d\.$/);
  });
});

describe('built-in safety rules judge what the action really did', () => {
  it('an AED that advises no shock costs nothing, even with a pulse', () => {
    const s = run(stemiAnterior, 2, ['primary', 'aed']);
    expect(s.log.at(-1)!.text).toMatch(/No shock advised/);
    expect(s.penalties).toEqual([]);
    expect(s.rhythm).toEqual({ profile: 'anterior-stemi', hr: 96 });
  });

  it('a manual shock with a pulse is still a critical error', () => {
    expect(run(stemiAnterior, 2, ['defib']).penalties.map((p) => p.id)).toEqual(['shock-with-pulse']);
  });

  it('synchronized cardioversion of a rhythm that is not a tachyarrhythmia is penalized, and hurts', () => {
    const s = run(stemiAnterior, 2, ['cardiovert']);
    expect(s.penalties.map((p) => p.id)).toEqual(['cardiovert-no-tachycardia']);
    expect(s.rhythm).toEqual({ profile: 'anterior-stemi', hr: 96 });
    expect(s.log.some((l) => l.who === 'patient')).toBe(true);
  });

  it('cardioverting PEA is a shock to a non-shockable rhythm, not a sync problem; in VF it is', () => {
    const per = SCENARIO_BY_ID['perforation-cathlab'];
    let s = run(per, 5, ['balloon-tamponade', 'reassess', 'reassess', 'reassess', 'reassess']);
    expect(s.rhythm.profile).toBe('pea');
    s = perform(per, s, 'cardiovert');
    expect(s.penalties.map((p) => p.id)).toContain('shock-nonshockable');
    expect(s.penalties.map((p) => p.id)).not.toContain('sync-in-arrest');
    const vf = SCENARIO_BY_ID['vf-arrest-field'];
    expect(run(vf, 2, ['cardiovert']).penalties.map((p) => p.id)).toEqual(['sync-in-arrest']);
  });

  it('pacing a heart that is not slow (50 and up) is penalised, and the story says why it did nothing', () => {
    const inf = SCENARIO_BY_ID['stemi-inferior-rv-field'];
    for (const [sc, role, hr] of [[inf, 2, 58], [SCENARIO_BY_ID['stemi-inferior-cathlab'], 5, 58], [stemiAnterior, 2, 96]] as const) {
      const s = run(sc, role, ['pace']);
      expect(s.rhythm.hr, sc.id).toBe(hr);
      expect(s.penalties.map((p) => p.id), sc.id).toEqual(['pace-not-slow']);
      expect(s.log.slice(-2).map((l) => l.text).join(' '), sc.id).toMatch(new RegExp(`\\b${hr}\\b`));
    }
  });

  it('pacing in cardiac arrest is penalised and shows no pulse', () => {
    const vf = SCENARIO_BY_ID['vf-arrest-field'];
    const s = run(vf, 2, ['pace']);
    expect(s.penalties.map((p) => p.id)).toEqual(['pace-in-arrest']);
    expect(s.pulse).toBe(false);
    expect(s.log.at(-1)!.text).toMatch(/no pulse/i);
  });

  it('an advanced airway cannot be placed in an awake patient, and trying is penalised', () => {
    const s = run(stemiAnterior, 2, ['airway']);
    expect(s.flags.airway).toBeUndefined();
    expect(s.flags.ventilated).toBeUndefined();
    expect(s.penalties.map((p) => p.id)).toEqual(['airway-awake']);
  });

  it('a 12-lead can only be repeated once there is a first one', () => {
    const s = run(stemiAnterior, 2, ['ecg12-repeat']);
    expect(s.minute).toBe(0);
    expect(s.counts['ecg12-repeat']).toBeUndefined();
    expect(s.log.at(-1)!.text).toMatch(/first 12-lead/);
  });

  it('nitroglycerin with a systolic pressure under 90 is a major error', () => {
    const sc = SCENARIO_BY_ID['complete-heart-block-field'];
    const s = run(sc, 2, ['iv', 'nitro']);
    expect(s.penalties.map((p) => p.id)).toEqual(['nitro-hypotension']);
    // with a pressure of 148 it is not
    expect(run(stemiAnterior, 2, ['vitals', 'ask-pde5', 'iv', 'nitro']).penalties).toEqual([]);
  });

  it('a scenario rule that covers the same mistake replaces the built-in one: one penalty, not two', () => {
    const shock = SCENARIO_BY_ID['shock-cathlab'];
    expect(run(shock, 5, ['nitro']).penalties.map((p) => p.id)).toEqual(['nitro-in-shock']);
    const rv = SCENARIO_BY_ID['stemi-inferior-cathlab'];
    const steps = ['consent', 'heparin', 'p2y12', 'timeout', 'access-femoral', 'cath-jl4', 'angio', 'guide-jr4', 'view-rca-lao', 'wire-workhorse', 'balloon-predil'];
    const s = run(rv, 5, [...steps, 'nitro']);
    expect(s.vitals.sbp).toBeLessThan(90);
    expect(s.penalties.map((p) => p.id)).toEqual(['nitro-rv']);
  });
});

describe('vital signs stay inside what a living patient can show', () => {
  const lastBp = (s: SimState) => [...s.log].reverse().find((l) => /BP \d+\/\d+/.test(l.text))!.text.match(/BP (\d+)\/(\d+)/)!.slice(1).map(Number);

  it('repeated vasodilators cannot push the pressure below a perfusing level, and the monitor shows what the vitals are', () => {
    for (const id of ['stemi-cathlab', 'ffr-cathlab', 'shock-cathlab', 'contrast-cathlab']) {
      const sc = SCENARIO_BY_ID[id];
      let s = start(sc, 4);
      for (let i = 0; i < 25 && !s.ended; i++) {
        while (s.pendingRead) s = answerRead(sc, s, s.pendingRead.answer);
        s = perform(sc, s, 'ic-nitro');
      }
      expect(s.pulse, id).toBe(true);
      expect(s.vitals.sbp, id).toBeGreaterThanOrEqual(50);
      expect(s.vitals.dbp, id).toBeGreaterThanOrEqual(25);
      expect(s.vitals.dbp, id).toBeLessThan(s.vitals.sbp);
      expect(lastBp(s), id).toEqual([s.vitals.sbp, s.vitals.dbp]);
      expect(s.penalties.filter((p) => /nitro/.test(p.id)), id).toHaveLength(1);
    }
  });

  it('repeated boluses cannot push the pressure without limit either', () => {
    const sc = SCENARIO_BY_ID['contrast-cathlab'];
    let s = run(sc, 4, ['iv']);
    for (let i = 0; i < 12; i++) s = perform(sc, s, 'push-epi');
    expect(s.vitals.sbp).toBeLessThanOrEqual(150);
    expect(lastBp(s)).toEqual([s.vitals.sbp, s.vitals.dbp]);
    let f = run(sc, 4, ['iv']);
    for (let i = 0; i < 4; i++) f = perform(sc, f, 'fluid');
    expect(f.vitals.sbp).toBeLessThanOrEqual(150);
    expect(lastBp(f)).toEqual([f.vitals.sbp, f.vitals.dbp]);
  });

  it('drugs given in cardiac arrest do not change the rhythm or invent a pressure', () => {
    const vf = SCENARIO_BY_ID['vf-arrest-field'];
    const s = run(vf, 2, ['cpr', 'io', 'metoprolol', 'nitro', 'diltiazem']);
    expect(s.rhythm).toEqual({ profile: 'vf', hr: 0 });
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([0, 0]);
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
