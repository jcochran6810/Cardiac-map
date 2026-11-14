import { describe, expect, it } from 'vitest';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { HINT_POINTS, ecgChanged, perform, answerRead, review, start, stop, takeHint, unavailableReason } from '@/lib/sim/scenario/engine';
import { NO_REFLOW_VASODILATORS } from '@/lib/sim/scenario/labKit';
import { READ_OPTIONS, answerFor, judgeRead } from '@/lib/sim/scenario/reads';
import { SCENARIOS, SCENARIO_BY_ID } from '@/lib/sim/scenario/scenarios';
import { stemiAnterior } from '@/lib/sim/scenario/scenarios/stemiAnterior';
import { ECG_PROFILES } from '@/lib/ecg/profiles';
import type { Problem, Scenario, Setting, SimState } from '@/lib/sim/scenario/types';
import type { LearningLevel } from '@/store/useAppStore';
import { UNTIL_ARRIVED, runScenario as run } from './helpers';

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

describe('a hand-off in the cath lab', () => {
  it('waits until the procedure is over: the patient is still on the table', () => {
    const sc = SCENARIO_BY_ID['stemi-inferior-cathlab'];
    const s = run(sc, 4, ['consent', 'iv', 'heparin', 'p2y12', 'timeout', 'handoff']);
    expect(s.ended).toBeNull();
    expect(s.counts.handoff).toBeUndefined();
    expect(s.log.at(-1)!.text).toMatch(/procedure is not over/);
  });

  it('a case that ended with a hand-off never reads as every critical item done, even when nothing due yet was missed', () => {
    // what an early hand-off used to leave: the contrast and the reaction never came, so their items never applied
    const sc = SCENARIO_BY_ID['contrast-cathlab'];
    const s = run(sc, 5, ['consent', 'timeout', 'access']);
    const handedOver: SimState = {
      ...s, flags: { ...s.flags, handoff: s.minute }, performed: [...s.performed, { id: 'handoff', minute: s.minute }],
      ended: { reason: 'complete', minute: s.minute },
    };
    const r = review(sc, handedOver);
    expect(r.missed).toBe(0);
    expect(r.outcome).toMatch(/^Care handed over at \d+:\d\d, before the case was over\.$/);
  });
});

describe('built-in safety rules judge what the action really did', () => {
  it('an AED is not applied to a patient with a pulse: it reads only the rhythm and would shock a fast VT — refused, at no cost', () => {
    const before = run(stemiAnterior, 2, ['primary']);
    const s = perform(stemiAnterior, before, 'aed');
    expect(s.log.at(-1)).toMatchObject({ who: 'system', text: expect.stringMatching(/unresponsive, not breathing normally and has no pulse.*would advise a shock for a fast VT/) });
    expect(s.penalties).toEqual([]);
    expect(s.rhythm).toEqual({ profile: 'anterior-stemi', hr: 96 });
    // no time passes, nothing is counted, and no pads go on with it
    expect([s.minute, s.counts.aed, s.flags.pads]).toEqual([before.minute, undefined, undefined]);
    // in an arrest it analyzes: no shock for an organized rhythm, and that costs nothing either
    const pea = SCENARIO_BY_ID['pea-arrest-field'];
    const arrest = run(pea, 1, ['cpr', 'aed']);
    expect(arrest.log.some((l) => l.who === 'monitor' && /No shock advised/.test(l.text))).toBe(true);
    expect(arrest.penalties).toEqual([]);
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

  it('at exactly 70 the pacer is not "slower than the heart"; over a heart already paced the pads wait on standby, at no cost', () => {
    const inf = SCENARIO_BY_ID['stemi-inferior-rv-field'];
    const at70 = perform(inf, { ...start(inf, 2), rhythm: { profile: 'inferior-stemi', hr: 70 } }, 'pace');
    const said = at70.log.slice(-2).map((l) => l.text).join(' ');
    expect(said).not.toMatch(/faster|perfusing/);
    expect(said).toMatch(/\b70\b/);
    expect(at70.penalties.map((p) => p.id)).toEqual(['pace-not-slow']);
    const paced = perform(inf, { ...start(inf, 2), rhythm: { profile: 'paced', hr: 70 } }, 'pace');
    expect(paced.log.at(-1)!.text).toMatch(/already paced at 70/);
    expect(paced.rhythm).toEqual({ profile: 'paced', hr: 70 });
    expect(paced.penalties).toEqual([]);
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

describe('electrolytes, antidotes, glucose and the no-reflow drugs', () => {
  /** The same case, with the patient given problems the built-in drug rules read */
  const withProblems = (sc: Scenario, ...problems: Problem[]): Scenario => ({ ...sc, problems });
  const ids = (role: LearningLevel, setting: Setting) => interventionsFor(role, setting).map((i) => i.id);
  const penalties = (s: SimState) => s.penalties.map((p) => p.id);
  const vf = SCENARIO_BY_ID['vf-arrest-field'];
  const block = SCENARIO_BY_ID['complete-heart-block-field'];
  const lab = SCENARIO_BY_ID['stemi-cathlab'];
  const ALS = ['calcium-chloride', 'sodium-bicarbonate', 'albuterol-hyperk', 'magnesium-sulfate', 'procainamide', 'glucagon', 'dextrose'];
  const NO_REFLOW = ['ic-nitroprusside', 'ic-epinephrine'];
  const giveaway = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture/i;

  it('are offered to the roles whose scope includes them, and only there', () => {
    const emt = ids(1, 'field');
    expect(emt).toContain('oral-glucose');
    for (const id of [...ALS, 'insulin-dextrose']) expect(emt, id).not.toContain(id);
    const medic = ids(2, 'field');
    for (const id of [...ALS, 'oral-glucose']) expect(medic, id).toContain(id);
    for (const id of ['insulin-dextrose', ...NO_REFLOW]) expect(medic, id).not.toContain(id);
    // the tech hands intracoronary drugs on the operator's order, like the other IC drugs; IV drugs are the nurse's
    const tech = ids(3, 'cathlab');
    for (const id of NO_REFLOW) expect(tech, id).toContain(id);
    for (const id of [...ALS, 'insulin-dextrose', 'oral-glucose']) expect(tech, id).not.toContain(id);
    for (const role of [4, 5] as const) {
      const rnMd = ids(role, 'cathlab');
      for (const id of [...ALS, 'insulin-dextrose', ...NO_REFLOW]) expect(rnMd, `role ${role} ${id}`).toContain(id);
      expect(rnMd).not.toContain('oral-glucose');
    }
    // the emergency department: the ER nurse (on order) and the ER doctor; no oral glucose, nothing through a catheter
    for (const role of [6, 7] as const) {
      const ed = ids(role, 'ed');
      for (const id of [...ALS, 'insulin-dextrose']) expect(ed, `role ${role} ${id}`).toContain(id);
      for (const id of ['oral-glucose', ...NO_REFLOW]) expect(ed, `role ${role} ${id}`).not.toContain(id);
    }
    expect(unavailableReason(stemiAnterior, start(stemiAnterior, 2), 'insulin-dextrose')).toMatch(/scope/);
  });

  it('name the dose as the drug cards do; the hyperkalemia dose of albuterol is its own action', () => {
    const label = (id: string) => INTERVENTION_BY_ID[id].label;
    expect(label('calcium-chloride')).toBe('Calcium chloride 1 g IV/IO');
    expect(label('sodium-bicarbonate')).toBe('Sodium bicarbonate 50 mEq IV/IO');
    expect(label('insulin-dextrose')).toBe('Insulin 10 units IV with dextrose 25 g');
    expect(label('magnesium-sulfate')).toBe('Magnesium sulfate 2 g IV/IO');
    expect(label('procainamide')).toBe('Procainamide 20–50 mg/min IV');
    expect(INTERVENTION_BY_ID.procainamide.detail).toMatch(/hypotension.*50 %.*17 mg\/kg.*heart failure.*long QT/);
    expect(label('glucagon')).toMatch(/^Glucagon 3–10 mg IV/);
    expect(label('albuterol')).toMatch(/2\.5–5 mg.*bronchospasm/);
    expect(label('albuterol-hyperk')).toMatch(/10–20 mg.*hyperkalemia/);
    expect(label('oral-glucose')).toMatch(/^Oral glucose 15 g/);
    expect(label('dextrose')).toMatch(/^Dextrose 25 g IV/);
    for (const id of [...ALS.filter((a) => a !== 'albuterol-hyperk'), 'insulin-dextrose']) expect(INTERVENTION_BY_ID[id].needsAccess, id).toBe(true);
    // a nebulizer and a tube of gel need no IV
    for (const id of ['albuterol-hyperk', 'oral-glucose']) expect(INTERVENTION_BY_ID[id].needsAccess, id).toBeUndefined();
    // the no-reflow vasodilators: not intracoronary nitroglycerin, which opens the large artery and not the bed beyond
    for (const id of NO_REFLOW_VASODILATORS) expect(INTERVENTION_BY_ID[id], id).toBeDefined();
    expect(NO_REFLOW_VASODILATORS).not.toContain('ic-nitro');
  });

  it('IV drugs wait for access, without passing time', () => {
    const s = run(stemiAnterior, 2, ['calcium-chloride']);
    expect(s.minute).toBe(0);
    expect(s.counts['calcium-chloride']).toBeUndefined();
  });

  it('with no response from the case they change no rhythm, and show only their side effects', () => {
    const base = run(stemiAnterior, 2, ['iv']);
    const after = (id: string) => perform(stemiAnterior, base, id);
    expect(base.rhythm).toEqual({ profile: 'anterior-stemi', hr: 96 });
    expect([base.vitals.sbp, base.vitals.dbp]).toEqual([148, 92]);

    const ca = after('calcium-chloride');
    expect(ca.rhythm).toEqual(base.rhythm);
    expect(ca.vitals).toEqual(base.vitals);
    expect(ca.log.at(-1)).toMatchObject({ who: 'patient', text: expect.stringMatching(/burns/) });
    expect(after('sodium-bicarbonate').rhythm).toEqual(base.rhythm);
    // procainamide and magnesium drop the pressure, and the monitor shows what it is
    const pa = after('procainamide');
    expect([pa.vitals.sbp, pa.vitals.dbp]).toEqual([138, 86]);
    expect(pa.log.at(-1)).toMatchObject({ who: 'monitor', text: 'BP 138/86.' });
    expect(pa.rhythm).toEqual(base.rhythm);
    const mg = after('magnesium-sulfate');
    expect([mg.vitals.sbp, mg.vitals.dbp]).toEqual([142, 88]);
    // high-dose albuterol speeds the sinus rate
    const alb = after('albuterol-hyperk');
    expect(alb.rhythm).toEqual({ profile: 'anterior-stemi', hr: 104 });
    expect(alb.log.at(-1)).toMatchObject({ who: 'monitor', text: 'Heart rate 104.' });
    // glucagon makes the patient vomit and raises the glucose; dextrose raises it more
    const gl = after('glucagon');
    expect(gl.vitals.glucose).toBe(162);
    expect(gl.log.some((l) => /vomits/.test(l.text))).toBe(true);
    expect(perform(stemiAnterior, gl, 'glucagon').log.some((l) => /10 mg in all/.test(l.text))).toBe(true);
    expect(after('dextrose').vitals.glucose).toBe(252);

    for (const s of [ca, pa, mg, alb, gl]) {
      for (const l of s.log) if (l.who === 'monitor') expect(l.text).not.toMatch(giveaway);
    }
  });

  it('calcium, bicarbonate, insulin and high-dose albuterol without the problem they treat cost points; with it they do not', () => {
    const steps = ['iv', 'calcium-chloride', 'sodium-bicarbonate', 'albuterol-hyperk'];
    expect(penalties(run(stemiAnterior, 2, steps))).toEqual(['calcium-no-indication', 'bicarbonate-no-indication', 'albuterol-hyperk-no-indication']);
    expect(penalties(run(withProblems(stemiAnterior, 'hyperkalemia'), 2, steps))).toEqual([]);
    // calcium is also for a calcium- or beta-blocker overdose; bicarbonate for acidosis or a tricyclic overdose
    for (const p of ['beta-blocker-overdose', 'ccb-overdose', 'hypocalcemia'] as const) {
      expect(penalties(run(withProblems(stemiAnterior, p), 2, ['iv', 'calcium-chloride'])), p).toEqual([]);
    }
    for (const p of ['metabolic-acidosis', 'sodium-channel-blocker-overdose'] as const) {
      expect(penalties(run(withProblems(stemiAnterior, p), 2, ['iv', 'sodium-bicarbonate'])), p).toEqual([]);
    }
    const review_ = review(stemiAnterior, stop(run(stemiAnterior, 2, steps)));
    expect(review_.toFix.find((t) => t.kind === 'harm' && t.actions?.includes('calcium-chloride'))?.label).toBe('Calcium chloride without an indication.');
  });

  it('in a hyperkalemic arrest calcium and bicarbonate go in without pausing CPR at no cost; in any other arrest they do not help', () => {
    const steps = ['cpr', 'io', 'calcium-chloride', 'sodium-bicarbonate'];
    const hyperK = run(withProblems(vf, 'hyperkalemia'), 2, steps);
    expect(penalties(hyperK)).toEqual([]);
    expect(hyperK.rhythm).toEqual({ profile: 'vf', hr: 0 });
    expect([hyperK.vitals.sbp, hyperK.vitals.dbp]).toEqual([0, 0]);
    expect(hyperK.log.filter((l) => /compressions go on/.test(l.text))).toHaveLength(2);
    expect(penalties(run(vf, 2, steps))).toEqual(['calcium-no-indication', 'bicarbonate-no-indication']);
  });

  it('magnesium in an arrest is for torsades (or a long QT); procainamide is no arrest drug; a nebulizer needs a breathing patient', () => {
    const arrest = run(vf, 2, ['cpr', 'io']);
    expect(penalties(perform(vf, arrest, 'magnesium-sulfate'))).toEqual(['magnesium-routine-arrest']);
    expect(penalties(perform(vf, { ...arrest, rhythm: { profile: 'torsades', hr: 0 } }, 'magnesium-sulfate'))).toEqual([]);
    expect(penalties(perform(withProblems(vf, 'long-qt'), arrest, 'magnesium-sulfate'))).toEqual([]);
    const pa = perform(vf, arrest, 'procainamide');
    expect(penalties(pa)).toEqual(['procainamide-in-arrest']);
    expect(pa.rhythm).toEqual({ profile: 'vf', hr: 0 });
    // blocked: no time passes, nothing is counted, nothing is penalized
    const neb = perform(withProblems(vf, 'hyperkalemia'), arrest, 'albuterol-hyperk');
    expect(neb.minute).toBe(arrest.minute);
    expect(neb.counts['albuterol-hyperk']).toBeUndefined();
    expect(neb.log.at(-1)!.text).toMatch(/albuterol has no proven benefit in arrest \(2025 AHA\)/);
    const gel = perform(vf, start(vf, 1), 'oral-glucose');
    expect(gel.counts['oral-glucose']).toBeUndefined();
  });

  it('insulin with dextrose: for high potassium, never with a low glucose', () => {
    const hyperK = withProblems(lab, 'hyperkalemia');
    // the nurse has the IV in for the cardiologist
    const md = start(hyperK, 5);
    const s = perform(hyperK, md, 'insulin-dextrose');
    expect(s.counts['insulin-dextrose']).toBe(1);
    expect(penalties(s)).toEqual([]);
    expect(penalties(perform(hyperK, { ...md, vitals: { ...md.vitals, glucose: 54 } }, 'insulin-dextrose'))).toEqual(['insulin-hypoglycemia']);
    expect(penalties(perform(lab, start(lab, 5), 'insulin-dextrose'))).toEqual(['insulin-no-indication']);
  });

  it('procainamide: its stop rules and contraindications are built in', () => {
    expect(penalties(run(stemiAnterior, 2, ['iv', 'procainamide']))).toEqual([]);
    // 74/42 with complete heart block at 34
    expect(penalties(run(block, 2, ['iv', 'procainamide']))).toEqual(['procainamide-hypotension', 'procainamide-slow']);
    // a pacer protects against the block it would deepen
    expect(penalties(run(block, 2, ['pads', 'iv', 'pace', 'procainamide']))).not.toContain('procainamide-slow');
    expect(penalties(run(withProblems(stemiAnterior, 'heart-failure'), 2, ['iv', 'procainamide']))).toEqual(['procainamide-heart-failure']);
    expect(penalties(run(withProblems(stemiAnterior, 'long-qt'), 2, ['iv', 'procainamide']))).toEqual(['procainamide-long-qt']);
    // one antiarrhythmic on top of another, either way round
    expect(penalties(run(stemiAnterior, 2, ['iv', 'amio-infusion', 'procainamide']))).toEqual(['procainamide-after-amiodarone']);
    expect(penalties(run(stemiAnterior, 2, ['iv', 'procainamide', 'amio-infusion']))).toEqual(['amiodarone-after-procainamide']);
  });

  it('glucose: oral gel for a patient who can swallow, IV dextrose for the paramedic, and only for a low glucose', () => {
    const emt = start(stemiAnterior, 1);
    const low = { ...emt, vitals: { ...emt.vitals, glucose: 48 } };
    const gel = perform(stemiAnterior, low, 'oral-glucose');
    expect(gel.vitals.glucose).toBe(88);
    expect(penalties(gel)).toEqual([]);
    expect(penalties(perform(stemiAnterior, emt, 'oral-glucose'))).toEqual(['glucose-not-low']);
    // too drowsy to swallow: the gel stays in the cheek and could be inhaled
    const drowsy = perform(stemiAnterior, { ...low, vitals: { ...low.vitals, gcs: 9 } }, 'oral-glucose');
    expect(drowsy.vitals.glucose).toBe(48);
    expect(penalties(drowsy)).toEqual(['oral-glucose-cannot-swallow']);
    expect(penalties(perform(stemiAnterior, { ...low, vitals: { ...low.vitals, gcs: 11 } }, 'oral-glucose'))).toEqual([]);
    expect(unavailableReason(stemiAnterior, emt, 'dextrose')).toMatch(/scope/);
    const medic = run(stemiAnterior, 2, ['iv']);
    const d = perform(stemiAnterior, { ...medic, vitals: { ...medic.vitals, glucose: 40 } }, 'dextrose');
    expect(d.vitals.glucose).toBe(160);
    expect(penalties(d)).toEqual([]);
  });

  it('no-reflow: nitroprusside drops the pressure (not to be given under 90), intracoronary epinephrine raises it', () => {
    const md = start(lab, 5);
    const np = perform(lab, md, 'ic-nitroprusside');
    expect(np.vitals.sbp).toBeLessThan(md.vitals.sbp);
    expect(penalties(np)).toEqual([]);
    const low: SimState = { ...md, vitals: { ...md.vitals, sbp: 82, dbp: 50 } };
    expect(penalties(perform(lab, low, 'ic-nitroprusside'))).toEqual(['nitroprusside-hypotension']);
    const epi = perform(lab, low, 'ic-epinephrine');
    expect(penalties(epi)).toEqual([]);
    expect(epi.rhythm).toEqual({ profile: 'anterior-stemi', hr: 104 });
    expect(epi.log.at(-1)).toMatchObject({ who: 'monitor', text: 'Heart rate 104. BP 98/58.' });
    // the arrest dose of epinephrine is a separate drug: no penalty meant for it applies here
    expect(penalties(epi)).not.toContain('arrest-epi-with-pulse');
  });
});

describe('default responses follow the patient in front of them', () => {
  const vf = SCENARIO_BY_ID['vf-arrest-field'];
  const lab = SCENARIO_BY_ID['stemi-cathlab'];
  const penalties = (s: SimState) => s.penalties.map((p) => p.id);
  const missed = (r: ReturnType<typeof review>) => r.toFix.filter((t) => t.kind === 'missed').map((t) => t.label);
  /** The anterior STEMI patient (a case that keeps the default responses) with an IV in, in the given rhythm and vitals */
  const medic = (rhythm?: SimState['rhythm'], vitals: Partial<SimState['vitals']> = {}, pulse = true): SimState => {
    const s = run(stemiAnterior, 2, ['iv']);
    return { ...s, rhythm: rhythm ?? s.rhythm, vitals: { ...s.vitals, ...vitals }, pulse };
  };
  /** What was said after a state */
  const saidSince = (s: SimState, before: SimState) => s.log.slice(before.log.length);
  const blocked = (s: SimState, before: SimState, id: string) => {
    expect(s.minute, id).toBe(before.minute);
    expect(s.counts[id], id).toBeUndefined();
  };

  it('1: atropine speeds a slow sinus node only — not PEA, and not a heart slowed by potassium', () => {
    const pea = medic({ profile: 'pea', hr: 40 }, { sbp: 0, dbp: 0 }, false);
    const inPea = perform(stemiAnterior, pea, 'atropine');
    expect(inPea.rhythm).toEqual({ profile: 'pea', hr: 40 });
    expect(inPea.log.at(-1)!.text).toMatch(/no place in cardiac arrest/);
    const hyperK = medic({ profile: 'hyperkalemia', hr: 40 });
    expect(perform(stemiAnterior, hyperK, 'atropine').rhythm).toEqual({ profile: 'hyperkalemia', hr: 40 });
    // nor do the adrenergic drugs speed it
    expect(perform(stemiAnterior, hyperK, 'albuterol-hyperk').rhythm).toEqual({ profile: 'hyperkalemia', hr: 40 });
    const md = start(lab, 5);
    expect(perform(lab, { ...md, rhythm: { profile: 'hyperkalemia', hr: 40 } }, 'ic-epinephrine').rhythm).toEqual({ profile: 'hyperkalemia', hr: 40 });
  });

  it('2: a rate change renames a plain sinus rhythm (bradycardia under 60, tachycardia over 100); other rhythms keep theirs', () => {
    expect(perform(stemiAnterior, medic({ profile: 'sinus-bradycardia', hr: 46 }), 'atropine').rhythm).toEqual({ profile: 'normal-sinus', hr: 74 });
    expect(perform(stemiAnterior, medic({ profile: 'sinus-tachycardia', hr: 110 }), 'metoprolol').rhythm).toEqual({ profile: 'normal-sinus', hr: 100 });
    expect(perform(stemiAnterior, medic({ profile: 'normal-sinus', hr: 64 }), 'metoprolol').rhythm).toEqual({ profile: 'sinus-bradycardia', hr: 54 });
    expect(perform(stemiAnterior, medic({ profile: 'normal-sinus', hr: 96 }), 'albuterol-hyperk').rhythm).toEqual({ profile: 'sinus-tachycardia', hr: 104 });
    const md = start(lab, 5);
    expect(perform(lab, { ...md, rhythm: { profile: 'sinus-bradycardia', hr: 56 } }, 'ic-epinephrine').rhythm).toEqual({ profile: 'normal-sinus', hr: 66 });
    // a STEMI keeps its name at any rate; a beta-blocker never brings a rate under 40 up to 40
    expect(perform(stemiAnterior, medic(), 'metoprolol').rhythm).toEqual({ profile: 'anterior-stemi', hr: 86 });
    expect(perform(stemiAnterior, medic({ profile: 'junctional', hr: 36 }), 'metoprolol').rhythm).toEqual({ profile: 'junctional', hr: 36 });
    // the renamed rhythm is a new tracing: a repeat 12-lead asks for a new read
    let s = run(stemiAnterior, 2, ['iv']);
    s = { ...s, rhythm: { profile: 'sinus-bradycardia', hr: 46 } };
    s = perform(stemiAnterior, s, 'ecg12');
    s = answerRead(stemiAnterior, s, 'sinus-brady');
    s = perform(stemiAnterior, perform(stemiAnterior, s, 'atropine'), 'ecg12-repeat');
    expect(s.pendingRead).toMatchObject({ kind: 'ecg', answer: 'nsr' });
  });

  it('3: fentanyl in arrest treats nothing; it never speeds a slow breathing rate, and only an awake patient says how it feels', () => {
    const arrest = run(vf, 2, ['cpr', 'io']);
    const f = perform(vf, arrest, 'fentanyl');
    expect(f.log.at(-1)!.text).toBe('Fentanyl given — it has no place in cardiac arrest and changes nothing on the monitor.');
    expect(f.vitals.rr).toBe(0);
    expect(f.flags.analgesia).toBeUndefined();
    const slow = perform(stemiAnterior, medic(undefined, { rr: 8 }), 'fentanyl');
    expect(slow.vitals.rr).toBe(8);
    expect(perform(stemiAnterior, medic(undefined, { rr: 20 }), 'fentanyl').vitals.rr).toBe(19);
    const before = medic(undefined, { gcs: 7 });
    expect(saidSince(perform(stemiAnterior, before, 'fentanyl'), before).some((l) => l.who === 'patient')).toBe(false);
  });

  it('4: sedation in cardiac arrest is refused: nobody is awake to sedate', () => {
    const arrest = run(vf, 2, ['cpr', 'io']);
    const s = perform(vf, arrest, 'sedation');
    blocked(s, arrest, 'sedation');
    expect(s.log.at(-1)!.text).toMatch(/^Not in cardiac arrest/);
  });

  it('5: compressions on a comatose patient with a pulse: a teammate stops them; an awake one cries out', () => {
    const coma = perform(stemiAnterior, medic(undefined, { gcs: 6 }), 'cpr');
    expect(coma.log.at(-1)).toMatchObject({ who: 'partner', text: expect.stringMatching(/^Stop — there is a pulse/) });
    expect(penalties(coma)).toEqual(['cpr-with-pulse']);
    expect(perform(stemiAnterior, medic(), 'cpr').log.at(-1)).toMatchObject({ who: 'patient', text: expect.stringMatching(/cries out/) });
  });

  it('6: nitroglycerin and fentanyl: no relief to report without pain, and nothing said by an unresponsive patient', () => {
    const noPain = medic(undefined, { pain: 0 });
    for (const id of ['nitro', 'fentanyl']) {
      const s = perform(stemiAnterior, noPain, id);
      expect(saidSince(s, noPain).some((l) => /easing|better|edge off|less/.test(l.text)), id).toBe(false);
    }
    const unresponsive = medic(undefined, { gcs: 7 });
    const n = perform(stemiAnterior, unresponsive, 'nitro');
    expect(saidSince(n, unresponsive).some((l) => l.who === 'patient')).toBe(false);
    expect(n.log.at(-1)).toMatchObject({ who: 'monitor', text: `BP ${n.vitals.sbp}/${n.vitals.dbp}.` });
    // with pain (8) and awake, the patient says it helps a little
    const pain = perform(stemiAnterior, medic(), 'nitro');
    expect(pain.log.some((l) => l.who === 'patient' && l.text === '"Maybe a little better."')).toBe(true);
    expect(perform(stemiAnterior, medic(undefined, { pain: 5 }), 'fentanyl').log.at(-1)).toMatchObject({ who: 'patient', text: '"That takes the edge off."' });
  });

  it('7: right-sided and posterior leads are a 12-lead too: none during CPR', () => {
    const arrest = start(vf, 2);
    for (const id of ['ecg-right', 'ecg-posterior']) {
      const s = perform(vf, arrest, id);
      blocked(s, arrest, id);
      expect(s.log.at(-1)!.text, id).toMatch(/No 12-lead in cardiac arrest/);
    }
  });

  it('8: the arrest dose of epinephrine with a pulse surges for a few minutes in words only, and never counts as arrest epinephrine', () => {
    const before = medic();
    const s = perform(stemiAnterior, before, 'epinephrine');
    expect(penalties(s)).toEqual(['arrest-epi-with-pulse']);
    expect(saidSince(s, before).some((l) => l.who === 'monitor' && /surges.*for a few minutes, then it settles back/.test(l.text))).toBe(true);
    // the surge passes: nothing lasting is written into the rate, the rhythm or the pressure
    expect(s.rhythm).toEqual(before.rhythm);
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([before.vitals.sbp, before.vitals.dbp]);
    expect(s.flags.epi).toBeUndefined();
    expect(s.flags['epi-with-pulse']).toBeDefined();
    // in arrest it is the arrest drug
    expect(perform(vf, run(vf, 2, ['cpr', 'io']), 'epinephrine').flags.epi).toBeDefined();
  });

  it('8: after ROSC the arrest dose does not "treat" the low pressure: it stays low for the vasopressor or fluid it needs', () => {
    // the VF case leaves epinephrine with a pulse to the default: ROSC at 84/50, rate 104
    const ROSC = ['cpr', 'pads', 'defib', 'iv', 'bvm', 'capno', 'cpr', 'defib', 'epinephrine', 'amio-arrest', 'cpr', 'defib'];
    const rosc = run(vf, 2, ROSC);
    expect(rosc.pulse).toBe(true);
    const s = run(vf, 2, [...ROSC, 'epinephrine', 'reassess', 'reassess', 'vitals']);
    expect(penalties(s)).toContain('arrest-epi-with-pulse');
    expect([s.vitals.sbp, s.vitals.dbp, s.rhythm.hr]).toEqual([rosc.vitals.sbp, rosc.vitals.dbp, rosc.rhythm.hr]);
    expect(missed(review(vf, stop(s)))).toContain('Treat post-arrest hypotension (fluid, vasopressor)');
    // nor does it hide a hypotension another rule is watching: diltiazem in the hypotensive SVT is still the case's critical error
    const svt = SCENARIO_BY_ID['svt-unstable-field'];
    const blocked = run(svt, 2, ['iv', 'epinephrine', 'reassess', 'diltiazem']);
    expect(blocked.log.some((l) => /BP 1[0-9]{2}\//.test(l.text))).toBe(false);
    expect(penalties(blocked)).toEqual(['arrest-epi-with-pulse', 'av-blocker-shock']);
  });

  it('9: atropine with no slow pulse to treat (60 or more) is a minor error; in cardiac arrest it is one too', () => {
    const fast = perform(stemiAnterior, medic({ profile: 'anterior-stemi', hr: 110 }), 'atropine');
    expect(penalties(fast)).toEqual(['atropine-fast']);
    expect(fast.rhythm.hr).toBe(120);
    // the anterior STEMI at 96: a faster rate only adds to the oxygen demand of the ischemic heart
    const stemi = perform(stemiAnterior, medic(), 'atropine');
    expect(penalties(stemi)).toEqual(['atropine-fast']);
    expect(stemi.penalties[0].text).toMatch(/^Atropine with no slow pulse to treat\./);
    // VT does not speed up with it, and the rule does not say it does
    const vt = perform(stemiAnterior, medic({ profile: 'vt', hr: 170 }), 'atropine');
    expect(vt.log.at(-1)!.text).toBe('No change in heart rate.');
    expect(penalties(vt)).toEqual(['atropine-fast']);
    expect(vt.penalties[0].text).not.toMatch(/beats faster/);
    // a slow sinus rate is what it is for; over a pacer the paced 70 hides a slow rate of the heart's own
    expect(penalties(perform(stemiAnterior, medic({ profile: 'sinus-bradycardia', hr: 46 }), 'atropine'))).toEqual([]);
    expect(penalties(perform(stemiAnterior, medic({ profile: 'tcp', hr: 70 }), 'atropine'))).toEqual([]);
    // during CPR: it has been out of the arrest algorithm since 2010
    const arrest = perform(vf, run(vf, 2, ['cpr', 'io', 'cpr']), 'atropine');
    expect(penalties(arrest)).toEqual(['atropine-in-arrest']);
    // a case rule for it stands in for the built-in one: one mistake, one penalty
    const hyperK = SCENARIO_BY_ID['hyperkalemia-dialysis-field'];
    const hk = run(hyperK, 2, ['iv']);
    expect(penalties(perform(hyperK, { ...hk, pulse: false, rhythm: { profile: 'pea', hr: 24 } }, 'atropine'))).toEqual(['atropine-arrest']);
    const pea = SCENARIO_BY_ID['pea-arrest-field'];
    expect(penalties(run(pea, 2, ['cpr', 'iv', 'atropine']))).toEqual(['atropine-no-indication']);
  });

  it('10: calcium for the low pressure diltiazem caused is not "without an indication" — once the pressure is back, or in an arrest, it is', () => {
    const low = perform(stemiAnterior, medic(undefined, { sbp: 84, dbp: 52 }), 'diltiazem');
    expect(low.vitals.sbp).toBeLessThan(90);
    expect(penalties(perform(stemiAnterior, low, 'calcium-chloride'))).toEqual([]);
    // one therapeutic dose that left a normal pressure is no overdose
    expect(penalties(run(stemiAnterior, 2, ['iv', 'diltiazem', 'calcium-chloride']))).toEqual(['calcium-no-indication']);
    expect(penalties(run(stemiAnterior, 2, ['iv', 'calcium-chloride']))).toEqual(['calcium-no-indication']);
    // diltiazem, then the VF an unsynchronized shock causes: routine calcium in the arrest has no benefit (2025 AHA)
    const svt = SCENARIO_BY_ID['svt-unstable-field'];
    const vfArrest = run(svt, 2, ['iv', 'diltiazem', 'defib']);
    expect(vfArrest.pulse).toBe(false);
    expect(penalties(perform(svt, vfArrest, 'calcium-chloride'))).toContain('calcium-no-indication');
    // the AF case leaves it to the built-in rule: after diltiazem drops his pressure, calcium is right
    const af = SCENARIO_BY_ID['af-rvr-field'];
    expect(af.harms.some((h) => h.id === 'calcium-no-indication')).toBe(false);
  });

  it('11: synchronized cardioversion at the 2025 energies: 200 J for atrial fibrillation and flutter, 100 J otherwise', () => {
    const energy = (profile: string, hr: number) => perform(stemiAnterior, medic({ profile, hr }), 'cardiovert').log.find((l) => /^Synchronized shock/.test(l.text))!.text;
    expect(energy('atrial-fibrillation', 150)).toMatch(/200 J/);
    expect(energy('atrial-flutter', 150)).toMatch(/200 J/);
    expect(energy('avnrt', 190)).toMatch(/100 J/);
    expect(energy('vt', 170)).toMatch(/100 J/);
    expect(INTERVENTION_BY_ID.cardiovert.detail).toBe('100 J biphasic (atrial fibrillation: 200 J or more; flutter: 200 J)');
  });

  it('12: the cath lab is activated only for a 12-lead that shows a STEMI; a false alert is stood down and costs points', () => {
    const stemi = run(stemiAnterior, 2, ['ecg12', 'stemi-alert']);
    expect(stemi.flags.alert).toBeDefined();
    expect(penalties(stemi)).toEqual([]);
    const s0 = run(stemiAnterior, 2, ['iv']);
    let s = perform(stemiAnterior, { ...s0, rhythm: { profile: 'normal-sinus', hr: 80 } }, 'ecg12');
    s = perform(stemiAnterior, answerRead(stemiAnterior, s, 'nsr'), 'stemi-alert');
    expect(s.flags.alert).toBeUndefined();
    expect(s.flags['alert-declined']).toBeDefined();
    // "does not meet STEMI criteria", never "no ST elevation": pericarditis, LBBB, LVH or a high potassium can raise it
    expect(s.log.at(-1)!.text).toMatch(/does not meet STEMI criteria — the cath lab is not activated/);
    expect(penalties(s)).toEqual(['stemi-alert-no-ste']);
    expect(review(stemiAnterior, stop(s)).toFix.find((t) => t.kind === 'harm')?.label).toBe('A STEMI alert for a 12-lead that does not meet STEMI criteria.');
    // a case rule for the same mistake stands in for it: one penalty
    const hyperK = SCENARIO_BY_ID['hyperkalemia-dialysis-field'];
    expect(penalties(run(hyperK, 2, ['monitor', 'ecg12', 'stemi-alert']))).toEqual(['false-alert']);
    const bb = SCENARIO_BY_ID['beta-blocker-overdose-field'];
    expect(penalties(run(bb, 2, ['primary', 'pads', 'ecg12', 'stemi-alert']))).toEqual(['false-stemi-alert']);
  });

  it('12: a STEMI on an earlier 12-lead still activates the cath lab after a later tracing hides it (paced beats)', () => {
    // the reviewers' run: inferior STEMI read, complete heart block at 9 minutes, paced, a repeat 12-lead of the paced beats
    const rv = SCENARIO_BY_ID['stemi-inferior-rv-field'];
    const s = run(rv, 2, ['vitals', 'ecg12', 'iv', 'reassess', 'reassess', 'reassess', 'reassess', 'pads', 'pace', 'ecg12-repeat', 'stemi-alert']);
    expect(s.fired).toContain('chb');
    expect(s.lastEcg?.profile).toBe('tcp');
    expect(s.flags['ecg-stemi']).toBeDefined();
    expect(s.flags.alert).toBeDefined();
    expect(s.flags['alert-declined']).toBeUndefined();
    expect(s.log.at(-1)).toMatchObject({ who: 'hospital', text: expect.stringMatching(/^Cath lab activated/) });
    expect(penalties(s)).not.toContain('stemi-alert-no-ste');
    // and the review agrees with the hospital: the alert is the critical step it asks for (done, if late here)
    expect(missed(review(rv, stop(s)))).not.toContain('STEMI alert from the field');
    // an EMT's tracing counts too: the flag is set whatever the role
    expect(run(rv, 1, ['ecg12']).flags['ecg-stemi']).toBeDefined();
    // a 12-lead with no STEMI never sets it
    const s0 = run(stemiAnterior, 2, ['iv']);
    expect(perform(stemiAnterior, { ...s0, rhythm: { profile: 'normal-sinus', hr: 80 } }, 'ecg12').flags['ecg-stemi']).toBeUndefined();
  });

  it('13: a hand-off in cardiac arrest on arrival ends the case — the emergency department takes over the CPR — but never as a finished case', () => {
    const s = run(vf, 2, ['cpr', 'transport-near', UNTIL_ARRIVED, 'handoff']);
    expect(s.pulse).toBe(false);
    expect(s.ended?.reason).toBe('complete');
    expect(s.log.some((l) => /CPR continues in the emergency department/.test(l.text))).toBe(true);
    expect(s.log.at(-1)!.text).toMatch(/^Care handed over in cardiac arrest/);
    // loading in the arrest is a mistake of its own (2025 AHA: on-scene resuscitation until ROSC for most adults)
    expect(penalties(s)).toContain('transport-in-arrest');
    const r = review(vf, s);
    expect(r.outcome).toMatch(/^Handed over in cardiac arrest at \d+:\d\d, without ROSC/);
    expect(r.percent).toBeLessThanOrEqual(40);
    expect(r.grade).toBe('Unsafe');
  });

  it('13: "load and go" in the arrest scores no better than a death, even with every pre-ROSC item done', () => {
    // the reviewers' runs: the EMT with one shock and CPR to the door; the paramedic with the whole arrest algorithm
    const emt = run(vf, 1, ['cpr', 'aed', 'cpr', 'bvm', 'transport-pci', 'cpr', 'cpr', 'cpr', 'cpr', 'cpr', 'cpr', 'handoff']);
    expect(emt.pulse).toBe(false);
    expect(emt.ended?.reason).toBe('complete');
    expect(penalties(emt)).toEqual(['transport-in-arrest']);
    expect(review(vf, emt).percent).toBeLessThanOrEqual(40);
    const medic2 = run(vf, 2, ['cpr', 'pads', 'defib', 'iv', 'bvm', 'capno', 'cpr', 'defib', 'epinephrine', 'amio-arrest', 'transport-near', UNTIL_ARRIVED, 'handoff']);
    expect(medic2.pulse).toBe(false);
    const r = review(vf, medic2);
    expect(r.outcome).not.toMatch(/before the case was over/);
    expect(r.percent).toBeLessThanOrEqual(40);
    // a case with its own rule for loading in the arrest keeps its words: one penalty
    const pea = SCENARIO_BY_ID['pea-arrest-field'];
    expect(penalties(run(pea, 2, ['cpr', 'transport-near'])).filter((id) => id === 'transport-in-arrest')).toHaveLength(1);
    expect(run(pea, 2, ['cpr', 'transport-near']).penalties[0].text).toMatch(/^Loading her for transport/);
    // an arrest that begins en route is worked in the ambulance: no penalty for the loading, done with a pulse
    const enRoute = run(stemiAnterior, 2, ['iv', 'transport-pci', 'reassess', 'reassess']);
    expect(enRoute.pulse).toBe(false);
    expect(penalties(enRoute)).not.toContain('transport-in-arrest');
  });

  it('13: in the lab there is no hand-off mid-arrest, during the procedure or after it', () => {
    const per = SCENARIO_BY_ID['perforation-cathlab'];
    const pea = run(per, 5, ['balloon-tamponade', 'reassess', 'reassess', 'reassess', 'reassess']);
    expect(pea.pulse).toBe(false);
    const h = perform(per, pea, 'handoff');
    blocked(h, pea, 'handoff');
    expect(h.ended).toBeNull();
    // the procedure is over (its completeWhen holds), but the patient is in VF: the arrest is run in the room
    const done = { ...start(lab, 5), flags: { pci: 1, 'final-angio': 2 }, pulse: false, rhythm: { profile: 'vf', hr: 0 } };
    expect(lab.completeWhen!(done)).toBe(true);
    const v = perform(lab, done, 'handoff');
    blocked(v, done, 'handoff');
    expect(v.ended).toBeNull();
    expect(v.log.at(-1)!.text).toMatch(/^Not in the middle of a cardiac arrest/);
  });

  it('14: calling for help in the field promises nothing that never comes', () => {
    for (const role of [1, 2] as const) {
      const s = run(stemiAnterior, role, ['call-help']);
      expect(s.log.at(-1)!.who, `role ${role}`).toBe('dispatch');
      expect(s.log.at(-1)!.text, `role ${role}`).not.toMatch(/on the way/);
    }
    expect(run(stemiAnterior, 1, ['call-help']).log.at(-1)!.text).toMatch(/ALS intercept/);
    expect(run(lab, 3, ['call-help']).log.at(-1)).toMatchObject({ who: 'team', text: 'Help is on the way.' });
  });

  it('16: a poison center call (EMT and paramedic, field) and ondansetron (paramedic, nurse, cardiologist, IV)', () => {
    for (const role of [1, 2] as const) expect(interventionsFor(role, 'field').map((i) => i.id), `role ${role}`).toContain('poison-control');
    for (const role of [3, 4, 5] as const) expect(interventionsFor(role, 'cathlab').map((i) => i.id), `role ${role}`).not.toContain('poison-control');
    for (const role of [2, 4, 5] as const) expect(interventionsFor(role, role === 2 ? 'field' : 'cathlab').map((i) => i.id), `role ${role}`).toContain('ondansetron');
    // the emergency department calls the poison center too, and gives ondansetron
    for (const role of [6, 7] as const) expect(interventionsFor(role, 'ed').map((i) => i.id), `role ${role}`).toEqual(expect.arrayContaining(['poison-control', 'ondansetron']));
    for (const role of [1, 3] as const) expect(interventionsFor(role, role === 1 ? 'field' : 'cathlab').map((i) => i.id), `role ${role}`).not.toContain('ondansetron');
    expect(INTERVENTION_BY_ID.ondansetron.needsAccess).toBe(true);
    const call = run(stemiAnterior, 2, ['poison-control']);
    expect(call.log.at(-1)).toMatchObject({ who: 'hospital', text: expect.stringMatching(/^Poison center: /) });
    expect(call.flags['poison-control']).toBeDefined();
    // a poisoning case says what the specialist advises
    const poisoned: Scenario = { ...stemiAnterior, facts: { ...stemiAnterior.facts, poisonControl: 'Poison center: "Metoprolol: glucagon and high-dose insulin."' } };
    expect(run(poisoned, 2, ['poison-control']).log.at(-1)!.text).toMatch(/glucagon/);
    // a case that lists an overdose but says nothing gets the specialist's questions — never "no poisoning"
    const overdose: Scenario = { ...stemiAnterior, problems: ['ccb-overdose'] };
    const asked = run(overdose, 2, ['poison-control']).log.at(-1)!.text;
    expect(asked).toMatch(/What was taken, how much, and when\?/);
    expect(asked).not.toMatch(/Nothing you describe/);
    // the crew can call back once they know more
    expect(INTERVENTION_BY_ID['poison-control'].repeatable).toBe(true);
    expect(run(stemiAnterior, 2, ['poison-control', 'poison-control']).counts['poison-control']).toBe(2);
    // ondansetron waits for access; with a long QT it is a major error
    expect(run(stemiAnterior, 2, ['ondansetron']).counts.ondansetron).toBeUndefined();
    const z = run(stemiAnterior, 2, ['iv', 'ondansetron']);
    expect(z.flags.antiemetic).toBeDefined();
    expect(penalties(z)).toEqual([]);
    expect(penalties(run({ ...stemiAnterior, problems: ['long-qt'] }, 2, ['iv', 'ondansetron']))).toEqual(['ondansetron-long-qt']);
  });

  it('23: a reassessment in the arrest does not say CPR goes on (it is not a CPR cycle)', () => {
    const s = run(vf, 2, ['cpr', 'reassess']);
    expect(s.log.at(-1)).toMatchObject({ who: 'patient', text: 'Unresponsive, no pulse.' });
  });

  it('24: the review rounds the clock before judging a target, so floating-point sums are not "late"', () => {
    expect(9.3 - 7.3).toBeGreaterThan(2);
    const sc: Scenario = {
      ...stemiAnterior,
      critical: [
        { id: 'within', label: 'Within 2 minutes of the flag', why: '', done: () => 9.3, target: { within: { flag: 'cue', minutes: 2 } } },
        { id: 'by', label: 'By 0.3 minutes', why: '', done: () => 0.1 + 0.2, target: { by: 0.3 } },
      ],
    };
    const s = stop({ ...start(sc, 2), flags: { cue: 7.3 } });
    const r = review(sc, s);
    expect(r.toFix.filter((t) => t.kind === 'late')).toEqual([]);
    expect(r.wentWell.map((t) => t.label)).toEqual(['Within 2 minutes of the flag', 'By 0.3 minutes']);
  });

  it('25: intracoronary adenosine and verapamil in cardiac arrest treat nothing', () => {
    const md = { ...start(lab, 5), pulse: false, rhythm: { profile: 'vf', hr: 0 } };
    for (const id of ['ic-adenosine', 'ic-verapamil']) {
      const s = perform(lab, md, id);
      expect(saidSince(s, md).map((l) => l.text).join(' '), id).toMatch(/it has no place in cardiac arrest and changes nothing on the monitor/);
      expect(saidSince(s, md).some((l) => /slowing/.test(l.text)), id).toBe(false);
    }
  });

  it('6: a drug with no role in the arrest is never said to "go nowhere": CPR carries IV drugs (that is how epinephrine works)', () => {
    // after two CPR cycles, as the reviewers ran it
    const cpr = run(vf, 2, ['cpr', 'io', 'cpr']);
    for (const id of ['atropine', 'fentanyl', 'metoprolol', 'diltiazem', 'procainamide', 'glucagon', 'ondansetron', 'nitro']) {
      const said = saidSince(perform(vf, cpr, id), cpr).map((l) => l.text).join(' ');
      expect(said, id).toMatch(/no place in cardiac arrest/);
      expect(said, id).not.toMatch(/no circulation|goes nowhere|reaches nothing/);
    }
    // nor in the cases' own words
    for (const sc of Object.values(SCENARIO_BY_ID)) {
      const arrest = { ...start(sc, sc.roles.includes(2) ? 2 : 5), pulse: false, rhythm: { profile: 'vf', hr: 0 }, flags: { iv: 0, access: 0 } };
      for (const id of ['atropine', 'glucagon', 'adenosine6', 'amio-infusion', 'ic-adenosine', 'ic-verapamil', 'epi-im', 'push-epi']) {
        if (unavailableReason(sc, arrest, id)) continue;
        const said = saidSince(perform(sc, arrest, id), arrest).map((l) => l.text).join(' ');
        expect(said, `${sc.id} ${id}`).not.toMatch(/with no circulation|goes nowhere|reaches nothing/);
      }
    }
  });

  it('14: the SVT case reads every sinus rhythm after conversion, at its own rate', () => {
    const svt = SCENARIO_BY_ID['svt-unstable-field'];
    // converted to 94, then atropine (a rate of 60 or more speeds by 10): sinus tachycardia 104
    const s = run(svt, 2, ['pads', 'iv', 'sedation', 'cardiovert', 'atropine', 'ecg12'], undefined, 'manual');
    expect(s.rhythm).toEqual({ profile: 'sinus-tachycardia', hr: 104 });
    expect(s.pendingRead).toMatchObject({ answer: 'sinus-tach', explain: expect.stringMatching(/^Sinus tachycardia 104: normal PR and QRS, no delta wave/) });
    for (const [profile, name] of [['normal-sinus', 'Sinus rhythm 84'], ['sinus-bradycardia', 'Sinus bradycardia 54']] as const) {
      const t = perform(svt, { ...run(svt, 2, ['pads']), rhythm: { profile, hr: Number(name.split(' ').at(-1)) } }, 'ecg12');
      expect(t.pendingRead?.explain, profile).toMatch(new RegExp(`^${name}: `));
    }
    // and the VF-to-ROSC path (sinus tachycardia 108) gets a real explanation too
    const rosc = run(svt, 2, ['pads', 'defib', 'defib', 'ecg12'], undefined, 'manual');
    expect(rosc.rhythm.profile).toBe('sinus-tachycardia');
    expect(rosc.pendingRead?.explain).not.toMatch(/No 12-lead possible/);
  });

  it('27: diltiazem with heart failure or in VT is a critical error; a case rule for it stands in for the built-in one', () => {
    expect(penalties(run({ ...stemiAnterior, problems: ['heart-failure'] }, 2, ['iv', 'diltiazem']))).toEqual(['diltiazem-heart-failure']);
    expect(penalties(perform(stemiAnterior, medic({ profile: 'vt', hr: 170 }), 'diltiazem'))).toEqual(['diltiazem-vt']);
    expect(penalties(run(stemiAnterior, 2, ['iv', 'diltiazem']))).toEqual([]);
    const af = SCENARIO_BY_ID['af-rvr-field'];
    expect(penalties(run(af, 2, ['iv', 'diltiazem']))).toEqual(['diltiazem-hfref']);
    const vt = SCENARIO_BY_ID['stable-vt-field'];
    expect(penalties(run(vt, 2, ['iv', 'diltiazem']))).toEqual(['ccb-wide-complex']);
  });
});

describe('rechecks and call-backs, the far destination, and a repeat 12-lead after a change of rate', () => {
  const lastText = (s: SimState) => s.log.at(-1)!.text;
  /** What the hospital says on arrival after the crew chose this destination (the flag 'dest-pci' or 'dest-near') */
  const arrivalFor = (sc: Scenario, dest: string) =>
    (typeof sc.arrival === 'function' ? sc.arrival({ ...start(sc, sc.roles[0]), flags: { arrived: 1, [dest]: 0 } }) : sc.arrival ?? '');

  it('the glucose can be rechecked after dextrose or glucagon, and the case reads the new value', () => {
    const bb = SCENARIO_BY_ID['beta-blocker-overdose-field'];
    const low = run(bb, 2, ['primary', 'pads', 'sample', 'iv', 'glucose']);
    expect(lastText(low)).toBe('Blood glucose 58 mg/dL.');
    expect(unavailableReason(bb, low, 'glucose')).toBeNull();
    const after = run(bb, 2, ['primary', 'pads', 'sample', 'iv', 'glucose', 'dextrose', 'glucose', 'glucagon', 'glucose']);
    expect(after.log.filter((l) => /^Blood glucose \d+ mg\/dL\.$/.test(l.text)).map((l) => l.text))
      .toEqual(['Blood glucose 58 mg/dL.', 'Blood glucose 178 mg/dL.', 'Blood glucose 208 mg/dL.']);
    expect(after.penalties).toEqual([]);
    // the check counts from the first one, on time, and the low it found stays found
    expect(review(bb, stop(after)).wentWell.find((w) => w.label === 'Check the blood glucose')).toBeDefined();
    expect(after.flags['low-glucose']).toBe(low.flags['low-glucose']);
    // a case with the default response rechecks too
    expect(run(stemiAnterior, 2, ['glucose', 'glucose']).counts.glucose).toBe(2);
  });

  it('medical control can be called back, up to three calls, and answers for where the crew is now', () => {
    const vt = SCENARIO_BY_ID['stable-vt-field'];
    const s = run(vt, 2, ['primary', 'med-control', 'pads', 'nibp', 'ecg12', 'sample', 'iv', 'med-control']);
    const said = s.log.filter((l) => l.who === 'hospital' && /^Medical control/.test(l.text)).map((l) => l.text);
    expect(said).toHaveLength(2);
    expect(said[0]).toMatch(/get a 12-lead/);
    expect(said.at(-1)).toMatch(/thanks for the 12-lead.*One antiarrhythmic only/);
    const three = run(stemiAnterior, 2, ['med-control', 'med-control', 'med-control']);
    expect(three.counts['med-control']).toBe(3);
    // a call is counted as a call, not as a dose
    expect(unavailableReason(stemiAnterior, three, 'med-control')).toBe('Maximum 3 calls');
    expect(unavailableReason(stemiAnterior, run(stemiAnterior, 2, ['iv', 'nitro', 'nitro', 'nitro']), 'nitro')).toBe('Maximum 3 doses');
  });

  it('the far destination is the regional heart center in every field case, and the load line says so', () => {
    expect(INTERVENTION_BY_ID['transport-pci'].label).toBe('Transport to the regional heart center (PCI, pacing, dialysis)');
    expect(lastText(run(stemiAnterior, 2, ['transport-pci']))).toBe('Patient loaded; transporting to the regional heart center (15 min).');
    const button = INTERVENTION_BY_ID['transport-pci'];
    const searchable = `${button.label} ${button.detail ?? ''}`.toLowerCase();
    for (const sc of SCENARIOS.filter((x) => x.setting === 'field')) {
      const briefings = [sc.briefing.default, ...Object.values(sc.briefing)].flat().filter((l) => l?.[0] === 'hospital').map((l) => l[1]);
      // the unstable SVT names only the nearest emergency department
      if (sc.id !== 'svt-unstable-field') expect(briefings.join(' '), sc.id).toMatch(/heart center/i);
      // the briefing, the arrival, the critical steps (the hint quotes their labels) and the harms all name it the same way
      // an arrival that names the destination chosen is read for both: the heart center and the nearest department
      const arrivals = ['dest-pci', 'dest-near'].map((dest) => arrivalFor(sc, dest));
      const texts = [JSON.stringify(sc.briefing), ...arrivals, ...sc.critical.flatMap((c) => [c.label, c.why]), ...sc.harms.map((h) => h.text)];
      for (const t of texts) expect(t, sc.id).not.toMatch(/cardiac center/i);
      // a critical step names no button that does not exist, and the action search finds the button by what it calls the hospital
      for (const c of sc.critical) {
        expect(c.label, sc.id).not.toBe('Transport to the PCI-capable heart center');
        for (const name of ['PCI-capable', 'regional heart center']) if (c.label.includes(name)) expect(searchable, `${sc.id}: ${c.label}`).toContain(name.toLowerCase());
      }
    }
    // the arrival names the destination the crew chose: the heart center, or the nearest department that has to transfer
    const block = SCENARIO_BY_ID['complete-heart-block-field'];
    const arrived = (steps: string[]) => run(block, 2, [...steps, UNTIL_ARRIVED]).log.find((l) => l.who === 'hospital' && /^You arrive/.test(l.text))!.text;
    expect(arrived(['primary', 'transport-pci'])).toBe('You arrive at the regional heart center; the cath lab is setting up for a transvenous pacing wire.');
    expect(arrived(['primary', 'transport-near'])).toMatch(/^You arrive at the nearest emergency department: it cannot place a transvenous pacing wire/);
    for (const id of ['complete-heart-block-field', 'vf-arrest-field', 'stemi-anterior-field', 'stable-vt-field']) {
      expect(arrivalFor(SCENARIO_BY_ID[id], 'dest-near'), id).toMatch(/^You arrive at the nearest emergency department/);
      expect(arrivalFor(SCENARIO_BY_ID[id], 'dest-pci'), id).toMatch(/^You arrive at the (regional )?heart center/);
    }
  });

  it('the bag-mask in cardiac arrest is 30:2; 1 breath every 6 seconds only through an advanced airway, or with a pulse', () => {
    // the dialysis case leaves the bag in the arrest to the engine's default
    const hk = SCENARIO_BY_ID['hyperkalemia-dialysis-field'];
    let s = run(hk, 2, ['monitor', 'pads', 'iv']);
    while (s.pulse && s.minute < 30) s = perform(hk, s, 'reassess');
    expect(s.pulse).toBe(false);
    const bag = perform(hk, s, 'bvm');
    expect(lastText(bag)).toBe('Bag-mask with oxygen: 2 breaths, each over 1 second, after every 30 compressions; chest rising.');
    expect(bag.flags.ventilated).toBeDefined();
    expect(lastText(perform(hk, perform(hk, s, 'airway'), 'bvm'))).toBe('Ventilating through the airway, 1 breath every 6 seconds; chest rising.');
    // with a pulse (rescue breathing for a patient who cannot protect the airway): 1 breath every 6 seconds
    const awake = run(stemiAnterior, 2, ['primary']);
    expect(lastText(perform(stemiAnterior, { ...awake, vitals: { ...awake.vitals, gcs: 6 } }, 'bvm'))).toBe('Ventilating 1 breath every 6 seconds; chest rising.');
  });

  it('F: a repeat 12-lead after a change of rate is a new tracing to read; a small drift within the band is not', () => {
    // the anterior STEMI keeps its profile at any rate: only the rate changes
    const first = run(stemiAnterior, 2, ['primary', 'ecg12']);
    expect(first.lastEcg).toEqual({ minute: first.minute, profile: 'anterior-stemi', hr: 96 });
    const at = (hr: number, s = first) => perform(stemiAnterior, { ...s, rhythm: { profile: 'anterior-stemi', hr } }, 'ecg12-repeat');
    // crossing 100, or more than 20 away within the band: a read is asked for
    for (const hr of [104, 72]) {
      const s = at(hr);
      expect(s.pendingRead, `hr ${hr}`).toMatchObject({ kind: 'ecg', answer: 'stemi-anterior' });
      expect(s.lastEcg?.hr, `hr ${hr}`).toBe(hr);
      expect(s.log.some((l) => l.text === 'Unchanged from the previous 12-lead.'), `hr ${hr}`).toBe(false);
    }
    // a few beats within the band: unchanged, and the tracing keeps the rate it was read at
    const near = at(84);
    expect(near.pendingRead).toBeNull();
    expect(lastText(near)).toBe('Unchanged from the previous 12-lead.');
    expect(near.lastEcg).toEqual({ minute: near.minute, profile: 'anterior-stemi', hr: 96 });
    // so a slow drift still adds up to a change: 96 → 84 → 74 is 22 from the tracing that was read
    expect(at(74, near).pendingRead).toMatchObject({ kind: 'ecg' });
  });

  it('F: the 12-lead view\'s "the patient has changed" note follows the same rule (ecgChanged)', () => {
    const last = { minute: 3, profile: 'af', hr: 96 };
    expect(ecgChanged(null, { profile: 'af', hr: 96 })).toBe(true);
    expect(ecgChanged(last, { profile: 'af', hr: 96 })).toBe(false);
    expect(ecgChanged(last, { profile: 'af', hr: 100 })).toBe(false);
    expect(ecgChanged(last, { profile: 'af', hr: 101 })).toBe(true); // crosses 100
    expect(ecgChanged(last, { profile: 'af', hr: 76 })).toBe(false); // 20 away, same band
    expect(ecgChanged(last, { profile: 'af', hr: 75 })).toBe(true); // more than 20 away
    expect(ecgChanged({ ...last, hr: 62 }, { profile: 'af', hr: 58 })).toBe(true); // crosses 60
    expect(ecgChanged(last, { profile: 'flutter', hr: 96 })).toBe(true);
  });
});
