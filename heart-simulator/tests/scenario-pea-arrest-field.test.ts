import { describe, expect, it } from 'vitest';
import { resolveProfile } from '@/lib/ecg/profiles';
import { BUILT_IN_HARMS, criticalsFor, perform, review, start, stop, takeHint } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { peaArrestField as sc } from '@/lib/sim/scenario/scenarios/peaArrestField';
import type { SimState } from '@/lib/sim/scenario/types';
import type { LearningLevel } from '@/store/useAppStore';
import { UNTIL_ARRIVED, readAfter, runScenario } from './helpers';

const medic = (steps: string[], reads: 'correct' | 'manual' = 'correct') => runScenario(sc, 2, steps, undefined, reads);
const emt = (steps: string[]) => runScenario(sc, 1, steps);
const penalties = (s: SimState) => s.penalties.map((p) => p.id);
const said = (s: SimState) => s.log.map((l) => l.text).join('\n');
const missed = (s: SimState, label: RegExp) => review(sc, stop(s)).toFix.some((t) => t.kind === 'missed' && label.test(t.label));
const late = (s: SimState, label: RegExp) => review(sc, s).toFix.find((t) => label.test(t.label))?.kind === 'late';

/** The ideal runs (the lead copies them into tests/scenarios.test.ts) */
const IDEAL: Record<1 | 2, string[]> = {
  1: ['als', 'cpr', 'aed', 'bvm', 'cpr', 'cpr', 'cpr', 'bvm', 'vitals', 'ecg12', 'ecg-transmit', 'transport-near', UNTIL_ARRIVED, 'handoff'],
  2: ['cpr', 'pads', 'pulse-check', 'bvm', 'capno', 'hs-ts', 'iv', 'epinephrine', 'cpr', 'cpr', 'bvm', 'nibp', 'fluid', 'ecg12', 'transport-near',
    UNTIL_ARRIVED, 'handoff'],
};

/** The paramedic, up to the point the crew has CPR, the monitor, IV and epinephrine going — and has never given a breath */
const NO_BREATHS = ['cpr', 'pads', 'pulse-check', 'iv', 'epinephrine'];

/** The paramedic's ideal run up to ROSC */
const TO_ROSC = IDEAL[2].slice(0, IDEAL[2].indexOf('cpr', 1) + 2);

const GIVEAWAY = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture|\bPEA\b|asystole|pulseless electrical|hypox/i;
const BRITISH = /haem|aemia|ischaem|oedem|synchronis|equalis|hyperaem|centre|levell|manoeuvre|nebulis|analyse\b|organis|colour|\bgrey|litres|metres|optimis|minimis|catheteris|heparinis|recognis|shovell|ventricularis/i;

describe('PEA arrest in the field — the case itself', () => {
  it('is a field case for the EMT and the paramedic, and refers only to interventions and rhythms that exist', () => {
    expect(sc).toMatchObject({ id: 'pea-arrest-field', setting: 'field', roles: [1, 2] });
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe('pea');
    expect(sc.initial.pulse).toBe(false);
    for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `respond ${id}`).toBeDefined();
    for (const h of sc.harms) {
      for (const id of h.actions) expect(INTERVENTION_BY_ID[id], `harm ${h.id}: ${id}`).toBeDefined();
      for (const id of h.replaces ?? []) expect(BUILT_IN_HARMS.some((b) => b.id === id), `harm ${h.id} replaces ${id}`).toBe(true);
    }
    for (const t of sc.timings ?? []) for (const id of t.actions) expect(INTERVENTION_BY_ID[id], `timing ${id}`).toBeDefined();
    for (const role of sc.roles) {
      const scope = new Set(interventionsFor(role, 'field').map((i) => i.id));
      for (const c of criticalsFor(sc, role)) {
        const ids = typeof c.done === 'function' ? c.uses ?? [] : c.done;
        expect(ids.some((id) => scope.has(id)), `role ${role}: ${c.id}`).toBe(true);
      }
    }
    // nothing she has makes calcium or bicarbonate right: the built-in rules judge them as given with no indication
    expect(sc.problems ?? []).toEqual([]);
  });

  it('nothing the learner sees before the arrest is worked names the rhythm or the cause', () => {
    const opening = [sc.title, sc.summary, ...sc.briefing.default.map((l) => l[1]), ...sc.briefing[1]!.map((l) => l[1])].join(' ');
    expect(opening).not.toMatch(/\bPEA\b|pulseless electrical|asystole|hypox/i);
    // the story is there for whoever listens: three days of trouble breathing, home oxygen, blue lips
    expect(opening).toMatch(/struggled to breathe/);
    expect(opening).toMatch(/home-oxygen/);
  });

  it('the EMT is told no paramedic is coming yet; the paramedic has an EMT partner', () => {
    expect(start(sc, 1).log.some((l) => /no paramedic unit has been sent/.test(l.text))).toBe(true);
    expect(start(sc, 2).log.some((l) => /you have the monitor and the drug box/.test(l.text))).toBe(true);
  });

  it('uses US spelling in everything a learner reads', () => {
    expect(JSON.stringify(sc)).not.toMatch(BRITISH);
    for (const role of [1, 2] as const) for (const l of runScenario(sc, role, IDEAL[role]).log) expect(l.text).not.toMatch(BRITISH);
  });
});

describe('PEA arrest in the field — the ideal runs', () => {
  for (const role of [1, 2] as const) {
    it(`role ${role}: ends by itself with full marks`, () => {
      const s = runScenario(sc, role, IDEAL[role]);
      expect(s.ended?.reason).toBe('complete');
      expect(s.pulse).toBe(true);
      const r = review(sc, s);
      expect(r.toFix).toEqual([]);
      expect(r.penaltyPoints).toBe(0);
      expect(r.percent).toBe(100);
      expect(r.grade).toBe('Excellent');
      expect(r.outcome).toMatch(/^Every critical intervention done/);
      for (const t of r.timings) if (t.met !== null) expect(t.met, t.label).toBe(true);
      // breaths came early enough: the heart never slowed further or went flat
      expect(s.fired).not.toContain('slower');
      expect(s.fired).not.toContain('flatline');
      expect(s.fired).not.toContain('post-rosc-desat');
    });
  }

  it('the paramedic reads the 12-lead after ROSC as sinus tachycardia, at no cost; a STEMI read costs 5 points', () => {
    const s = medic(readAfter(IDEAL[2], 'ecg12', 'sinus-tach'), 'manual');
    expect(s.reads).toEqual([expect.objectContaining({ kind: 'ecg', answer: 'sinus-tach', verdict: 'correct' })]);
    expect(s.log.some((l) => l.who === 'feedback' && /^Correct\. Sinus tachycardia 124.*no ST elevation/.test(l.text))).toBe(true);
    expect(review(sc, s).percent).toBe(100);
    const wrong = medic(readAfter(IDEAL[2], 'ecg12', 'stemi-anterior'), 'manual');
    expect(wrong.penalties).toEqual([expect.objectContaining({ points: 5, severity: 'major' })]);
  });

  it('the EMT acquires the 12-lead and is not asked to read it', () => {
    const s = emt(IDEAL[1]);
    expect(s.reads).toEqual([]);
    expect(s.log.some((l) => /12-lead acquired\. You can't interpret it/.test(l.text))).toBe(true);
  });

  it('every rhythm it reaches is a real profile, and no monitor line names the rhythm or the cause', () => {
    const runs: SimState[] = [];
    for (const role of [1, 2] as const) {
      runScenario(sc, role, IDEAL[role], (s) => {
        expect(resolveProfile(s.rhythm.profile).id, s.rhythm.profile).toBe(s.rhythm.profile);
        runs.push(s);
      });
    }
    runs.push(
      medic([...NO_BREATHS, 'cpr', 'cpr', 'bvm', 'cpr', 'cpr', 'cpr']),
      medic(['capno', 'pads', 'defib', 'cardiovert', 'atropine', 'io', 'amio-arrest', 'sodium-bicarbonate', 'calcium-chloride', 'pace']),
      medic([...TO_ROSC, 'reassess', 'reassess', 'o2-nrb', 'cpap', 'pressor', 'push-epi', 'metoprolol', 'albuterol']),
      emt(['cpr', 'aed', 'aed', 'cpap', 'o2-nrb', 'epi-im', 'bvm', 'cpr', 'cpr', 'cpr', 'cpr', 'reassess', 'reassess']),
    );
    for (const s of runs) {
      expect(resolveProfile(s.rhythm.profile).id).toBe(s.rhythm.profile);
      for (const l of s.log) if (l.who === 'monitor') expect(l.text).not.toMatch(GIVEAWAY);
    }
  });

  it('is deterministic', () => {
    expect(medic(IDEAL[2])).toEqual(medic(IDEAL[2]));
  });
});

describe('PEA arrest in the field — what brings her back', () => {
  it('starts pulseless with organized complexes; no 12-lead in the arrest', () => {
    const s = start(sc, 2);
    expect(s.pulse).toBe(false);
    expect(s.rhythm).toEqual({ profile: 'pea', hr: 34 });
    expect(s.flags.arrest).toBe(0);
    const ecg = perform(sc, s, 'ecg12');
    expect(ecg.counts.ecg12).toBeUndefined();
    expect(ecg.minute).toBe(0);
  });

  it('the AED advises no shock and costs nothing; the pulse check finds no pulse', () => {
    const s = emt(['cpr', 'aed', 'pulse-check']);
    expect(s.log.some((l) => l.who === 'monitor' && /No shock advised/.test(l.text))).toBe(true);
    expect(s.log.at(-1)!.text).toMatch(/^No carotid pulse/);
    expect(s.penalties).toEqual([]);
  });

  it('breaths with oxygen are the fix: the complexes come faster on the first ventilated cycle, and the second brings ROSC with epinephrine on board', () => {
    let s = medic(TO_ROSC.slice(0, -1));
    expect(s.pulse).toBe(false);
    expect(s.rhythm).toEqual({ profile: 'pea', hr: 52 });
    expect(s.log.at(-1)!.text).toMatch(/still no pulse/);
    s = perform(sc, s, 'cpr');
    expect(s.pulse).toBe(true);
    expect(s.flags.rosc).toBeDefined();
    expect(s.rhythm).toEqual({ profile: 'sinus-tachycardia', hr: 124 });
    expect([s.vitals.sbp, s.vitals.dbp, s.vitals.rr, s.vitals.gcs]).toEqual([84, 50, 6, 3]);
    expect(s.log.some((l) => /a carotid pulse — ROSC\. EtCO₂ jumps to 52/.test(l.text))).toBe(true);
    expect(sc.status!(s)).toBe('Unresponsive, breathing only 6 times a minute on her own.');
    // the case waits for the care after ROSC
    expect(s.ended).toBeNull();
  });

  it('compressions and epinephrine without breaths never bring her back: the heart slows, goes flat, and she dies', () => {
    let s = medic(NO_BREATHS);
    expect(s.fired).toContain('slower');
    expect(s.rhythm).toEqual({ profile: 'pea', hr: 24 });
    for (let i = 0; i < 3; i++) s = perform(sc, s, 'cpr');
    expect(s.fired).toContain('flatline');
    expect(s.flags.flatline).toBeGreaterThanOrEqual(9);
    expect(s.rhythm).toEqual({ profile: 'asystole', hr: 0 });
    expect(s.log.some((l) => l.who === 'monitor' && l.text === 'Monitor alarm.')).toBe(true);
    for (let i = 0; i < 12 && !s.ended; i++) s = perform(sc, s, 'cpr');
    expect(s.ended?.reason).toBe('death');
    expect(s.flags.rosc).toBeUndefined();
    const r = review(sc, s);
    expect(r.percent).toBeLessThanOrEqual(40);
    expect(r.toFix.some((t) => t.kind === 'missed' && /^Treat the cause: breaths with oxygen/.test(t.label))).toBe(true);
  });

  it('breaths given only after the flat line still bring her back — a cycle later, and the item counts half', () => {
    let s = medic([...NO_BREATHS, 'cpr', 'cpr', 'bvm']);
    expect(s.rhythm.profile).toBe('asystole');
    s = perform(sc, s, 'cpr');
    // oxygen reaches the heart: organized complexes come back on the screen, still without a pulse
    expect(s.rhythm).toEqual({ profile: 'pea', hr: 30 });
    s = perform(sc, s, 'cpr');
    expect(s.pulse).toBe(false);
    s = perform(sc, s, 'cpr');
    expect(s.pulse).toBe(true);
    expect(s.flags.rosc - s.flags.ventilated).toBeCloseTo(6, 5);
    expect(late(s, /^Treat the cause: breaths with oxygen/)).toBe(true);
  });

  it('without epinephrine, breaths and CPR can still bring her back, two cycles later — and the epinephrine item is missed', () => {
    let s = medic(['cpr', 'pads', 'pulse-check', 'bvm', 'cpr', 'cpr', 'cpr']);
    expect(s.pulse).toBe(false);
    s = perform(sc, s, 'cpr');
    expect(s.pulse).toBe(true);
    expect(review(sc, stop(s)).toFix.some((t) => t.kind === 'missed' && /^Epinephrine 1 mg/.test(t.label))).toBe(true);
    // a dose given only after ROSC does not count as the arrest dose, and is the built-in error
    const after = perform(sc, perform(sc, s, 'iv'), 'epinephrine');
    expect(penalties(after)).toEqual(['arrest-epi-with-pulse']);
    expect(review(sc, stop(after)).toFix.some((t) => t.kind === 'missed' && /^Epinephrine 1 mg/.test(t.label))).toBe(true);
  });

  it('an advanced airway ventilates her as the bag does, and goes on doing it after ROSC', () => {
    // the airway takes 3 minutes: epinephrine still goes in within the 8-minute goal
    const steps = ['cpr', 'pads', 'pulse-check', 'airway', 'iv', 'epinephrine', 'hs-ts', 'cpr', 'cpr'];
    let s = medic(steps);
    expect(s.pulse).toBe(true);
    // capnography came with the airway, and he is ventilated through it from the moment of ROSC
    expect(s.flags.capno).toBeDefined();
    expect([s.vitals.rr, s.vitals.spo2]).toEqual([10, 93]);
    expect(sc.status!(s)).toBe('Unresponsive; ventilated at 10/min.');
    s = medic([...steps, 'nibp', 'fluid', 'ecg12', 'transport-pci', UNTIL_ARRIVED, 'handoff']);
    const r = review(sc, s);
    expect(r.toFix).toEqual([]);
    expect(r.percent).toBe(100);
  });

  it('for the EMT the medics arrive 6 minutes after the call and give epinephrine; ROSC follows on the next ventilated cycle', () => {
    const s = emt(IDEAL[1].slice(0, IDEAL[1].indexOf('bvm', 4)));
    expect(s.fired).toContain('als-arrives');
    expect(s.flags['als-here'] - s.flags.als).toBeGreaterThanOrEqual(6);
    expect(s.flags.epi).toBe(s.flags['als-here']);
    expect(s.pulse).toBe(true);
    expect(s.flags.rosc).toBeGreaterThan(s.flags.epi);
    // the medics treat her pressure after ROSC; the EMT measures it
    const done = emt(IDEAL[1]);
    expect(done.fired).toContain('als-post-rosc');
    expect(done.log.some((l) => l.who === 'team' && /fluid bolus for her pressure: BP 96\/58/.test(l.text))).toBe(true);
  });

  it('an EMT who never calls ALS can still get her back with breaths and CPR, later — and misses the ALS item', () => {
    let s = emt(['cpr', 'aed', 'bvm', 'cpr', 'cpr', 'cpr']);
    expect(s.pulse).toBe(false);
    s = perform(sc, s, 'cpr');
    expect(s.pulse).toBe(true);
    expect(s.fired).not.toContain('als-arrives');
    expect(missed(s, /^Request ALS/)).toBe(true);
  });

  it('medics arriving to an EMT who has not bagged her say so — the breaths are the EMT\'s job', () => {
    const s = emt(['als', 'cpr', 'aed', 'cpr', 'cpr', 'cpr']);
    expect(s.fired).toContain('als-arrives');
    expect(s.log.some((l) => l.who === 'team' && /Has she had any breaths yet/.test(l.text))).toBe(true);
    expect(s.pulse).toBe(false);
  });

  it('after ROSC the bag (or an airway) keeps her ventilated; left alone at 6 breaths a minute she desaturates', () => {
    const rosc = medic(TO_ROSC);
    const bagged = perform(sc, rosc, 'bvm');
    expect([bagged.vitals.spo2, bagged.vitals.rr, bagged.vitals.etco2]).toEqual([95, 10, 44]);
    expect(bagged.log.at(-1)!.text).toBe('SpO₂ 95%. EtCO₂ 44 mmHg.');
    let s = rosc;
    while (!s.fired.includes('post-rosc-desat') && s.minute < rosc.minute + 6) s = perform(sc, s, 'reassess');
    expect(s.fired).toContain('post-rosc-desat');
    expect(s.vitals.spo2).toBe(80);
    expect(s.log.some((l) => l.who === 'monitor' && l.text === 'SpO₂ 80%.')).toBe(true);
    // a mask or CPAP does not ventilate a patient breathing 6 a minute; CPAP costs points
    expect(perform(sc, rosc, 'o2-nrb').log.at(-2)!.text).toMatch(/a mask alone will not ventilate her/);
    expect(penalties(perform(sc, rosc, 'cpap'))).toEqual(['cpap-not-breathing']);
    s = perform(sc, s, 'bvm');
    expect(s.vitals.spo2).toBe(95);
    expect(late(medic([...TO_ROSC, 'reassess', 'reassess', 'bvm', 'nibp', 'fluid', 'ecg12', 'transport-near', UNTIL_ARRIVED, 'handoff']), /^After ROSC: ventilate/)).toBe(false);
  });

  it('after ROSC fluid or a vasopressor bring the MAP to 65 or more — and never lower a higher pressure', () => {
    const rosc = perform(sc, medic(TO_ROSC), 'bvm');
    const fl = perform(sc, rosc, 'fluid');
    expect([fl.vitals.sbp, fl.vitals.dbp]).toEqual([96, 58]);
    expect(fl.log.at(-1)!.text).toBe('Bolus in. BP 96/58, MAP 71.');
    const pr = perform(sc, rosc, 'pressor');
    expect([pr.vitals.sbp, pr.vitals.dbp]).toEqual([104, 64]);
    expect(penalties(pr)).toEqual([]);
    let high = rosc;
    for (let i = 0; i < 4; i++) high = perform(sc, high, 'fluid');
    for (const id of ['pressor', 'push-epi']) {
      const s = perform(sc, high, id);
      expect(s.vitals.sbp, id).toBeGreaterThanOrEqual(high.vitals.sbp);
      expect(s.vitals.dbp, id).toBeGreaterThanOrEqual(high.vitals.dbp);
    }
    // the treatment counts only after ROSC
    expect(missed(medic([...NO_BREATHS, 'fluid']), /^After ROSC: treat the low pressure/)).toBe(false);
    expect(missed(rosc, /^After ROSC: treat the low pressure/)).toBe(true);
  });

  it('the Hs and Ts point to hypoxia; the lungs rule out a tension pneumothorax once she is bagged', () => {
    const s = medic(['cpr', 'pads', 'pulse-check', 'hs-ts']);
    expect(s.log.at(-1)!.text).toMatch(/Hypoxia: .*the likeliest cause: she needs breaths with oxygen now/);
    expect(s.log.at(-1)!.text).toMatch(/Tension pneumothorax: possible with emphysema/);
    expect(perform(sc, perform(sc, s, 'bvm'), 'hs-ts').counts['hs-ts']).toBe(1);
    expect(perform(sc, s, 'lungs').log.at(-1)!.text).toMatch(/no one has given her a breath yet/);
    expect(perform(sc, perform(sc, s, 'bvm'), 'lungs').log.at(-1)!.text).toMatch(/equal.*no sign of a tension pneumothorax/);
  });

  it('the history tells the story: COPD, home oxygen, three days of worsening breathing, no DNR', () => {
    const s = emt(['sample', 'opqrst']);
    expect(said(s)).toMatch(/COPD.*2 liters of oxygen/);
    expect(said(s)).toMatch(/There's no DNR/);
    expect(said(s)).toMatch(/her lips went blue/);
  });

  it('aspirin and her own nitroglycerin cannot be given to an unresponsive patient: no time passes, no penalty', () => {
    for (const [role, id] of [[1, 'aspirin'], [2, 'aspirin'], [1, 'nitro-assist']] as const) {
      const s = perform(sc, start(sc, role as LearningLevel), id);
      expect(s.counts[id], id).toBeUndefined();
      expect(s.minute, id).toBe(0);
      expect(s.penalties, id).toEqual([]);
    }
  });

  it('a nebulizer cannot be given in the arrest; in line with the bag after ROSC it is no mistake', () => {
    const s = perform(sc, medic(['cpr']), 'albuterol');
    expect(s.counts.albuterol).toBeUndefined();
    expect(s.log.at(-1)!.text).toMatch(/not part of the arrest algorithm/);
    const after = perform(sc, perform(sc, medic(TO_ROSC), 'bvm'), 'albuterol');
    expect(after.counts.albuterol).toBe(1);
    expect(penalties(after)).toEqual([]);
    expect(after.vitals.spo2).toBe(96);
  });
});

describe('PEA arrest in the field — capnography and stopping', () => {
  it('before anyone ventilates her the capnograph reads almost nothing — and the partner asks to call it', () => {
    const s = medic(['cpr', 'capno']);
    expect(s.log.at(-2)).toMatchObject({ who: 'monitor', text: 'EtCO₂ 3 mmHg: almost no waveform.' });
    expect(s.log.at(-1)).toMatchObject({ who: 'partner', text: expect.stringMatching(/do we call it/) });
    expect(s.vitals.etco2).toBe(3);
  });

  it('the first breaths wash out the CO₂ she could not breathe off; then it reads what the CPR makes; ROSC makes it jump', () => {
    const first = medic(['cpr', 'bvm', 'capno']);
    expect(first.log.at(-1)!.text).toBe('EtCO₂ 58 mmHg on the first breaths, then 26 mmHg as compressions go on.');
    const later = perform(sc, perform(sc, medic(['cpr', 'bvm']), 'cpr'), 'capno');
    expect(later.log.at(-1)!.text).toBe('EtCO₂ 26 mmHg during compressions.');
    const rosc = medic(TO_ROSC);
    expect(rosc.vitals.etco2).toBe(52);
  });

  it('medical control will not stop a witnessed arrest whose cause has not been treated, and never on EtCO₂ alone — at no cost', () => {
    const s = medic(['cpr', 'capno', 'med-control']);
    expect(s.log.at(-1)).toMatchObject({ who: 'hospital', text: expect.stringMatching(/not one to stop.*has not been treated yet.*measures nothing.*never stop on EtCO₂ alone/) });
    expect(s.penalties).toEqual([]);
    expect(s.pulse).toBe(false);
    const e = emt(['cpr', 'med-control']);
    expect(e.log.at(-1)!.text).toMatch(/ventilate her with oxygen and keep compressions going until the paramedics take over/);
  });

  it('teaches that EtCO₂ alone, or any single cutoff, is never a reason to stop', () => {
    const text = sc.teaching.join(' ');
    expect(text).toMatch(/Never use EtCO₂ alone, or any single cutoff, to stop a resuscitation \(2025 AHA\)/);
    expect(text).toMatch(/first readings are often high/);
    expect(text).not.toMatch(/EtCO₂ (under|below|<) 10[^.]*stop/);
  });
});

describe('PEA arrest in the field — the traps', () => {
  it('a manual shock on PEA changes nothing and costs once, in the case\'s own words — not twice', () => {
    let s = medic(['cpr', 'pads', 'defib']);
    expect(s.pulse).toBe(false);
    expect(s.rhythm).toEqual({ profile: 'pea', hr: 34 });
    expect(penalties(s)).toEqual(['shock-pea']);
    expect(s.penalties[0]).toMatchObject({ points: 10, severity: 'major' });
    s = perform(sc, s, 'cardiovert');
    expect(penalties(s)).toEqual(['shock-pea']);
    // and on the flat line too
    let flat = medic([...NO_BREATHS, 'cpr', 'cpr']);
    expect(flat.rhythm.profile).toBe('asystole');
    flat = perform(sc, flat, 'defib');
    expect(penalties(flat)).toEqual(['shock-pea']);
  });

  it('a second pulse check or AED analysis with no compressions between them is a long pause; one each per cycle is not', () => {
    expect(penalties(medic(['cpr', 'pads', 'pulse-check', 'pulse-check']))).toEqual(['long-pause']);
    expect(penalties(medic(['cpr', 'pads', 'pulse-check', 'cpr', 'pulse-check']))).toEqual([]);
    expect(penalties(emt(['cpr', 'aed', 'aed']))).toEqual(['long-pause-aed']);
    expect(penalties(emt(['cpr', 'aed', 'cpr', 'aed']))).toEqual([]);
    // the AED analysis and the pulse check belong to the same pause
    expect(penalties(emt(['cpr', 'aed', 'pulse-check']))).toEqual([]);
    // after ROSC a pulse check is no pause
    const rosc = medic(TO_ROSC);
    expect(penalties(perform(sc, perform(sc, rosc, 'pulse-check'), 'pulse-check'))).toEqual([]);
  });

  it('loading her for transport in the arrest costs points; after ROSC either hospital is fine', () => {
    for (const id of ['transport-near', 'transport-pci']) expect(penalties(medic(['cpr', id])), id).toEqual(['transport-in-arrest']);
    const rosc = perform(sc, medic(TO_ROSC), 'bvm');
    for (const id of ['transport-near', 'transport-pci']) expect(penalties(perform(sc, rosc, id)), id).toEqual([]);
  });

  it('atropine in the arrest changes nothing (it does not speed the complexes) and costs points', () => {
    // before the heart slows on its own (at 4 minutes without breaths)
    const before = medic(['io']);
    const s = perform(sc, before, 'atropine');
    expect(s.rhythm).toEqual(before.rhythm);
    expect(s.rhythm.hr).toBeLessThan(60);
    expect(s.log.at(-1)!.text).toBe('Atropine 1 mg IV — no change on the monitor.');
    expect(penalties(s)).toEqual(['atropine-arrest']);
  });

  it('antiarrhythmics in PEA treat nothing: one minor penalty each, in place of the built-in procainamide rule', () => {
    const before = medic(['io']);
    for (const id of ['amio-arrest', 'lidocaine', 'adenosine6', 'adenosine12', 'procainamide']) {
      const s = perform(sc, before, id);
      expect(penalties(s), id).toEqual(['antiarrhythmic-pea']);
      expect(s.penalties[0].points, id).toBe(3);
      expect(s.rhythm, id).toEqual(before.rhythm);
      expect(s.pulse, id).toBe(false);
    }
  });

  it('routine calcium, bicarbonate and magnesium in the arrest are minor errors; the bicarbonate rule speaks of her CO₂', () => {
    expect(penalties(medic(['cpr', 'io', 'calcium-chloride', 'sodium-bicarbonate', 'magnesium-sulfate'])))
      .toEqual(['calcium-no-indication', 'bicarbonate-no-indication', 'magnesium-routine-arrest']);
    const bicarb = medic(['cpr', 'io', 'sodium-bicarbonate']);
    expect(bicarb.penalties[0].text).toMatch(/CO₂ she could not breathe off/);
  });

  it('a mask, a cannula or CPAP do not ventilate a patient in arrest; CPAP costs points, and none counts as the breaths', () => {
    const mask = medic(['cpr', 'o2-nrb', 'o2-nc']);
    expect(mask.flags.ventilated).toBeUndefined();
    expect(mask.penalties).toEqual([]);
    expect(said(mask)).toMatch(/a mask only offers oxygen to someone who is/);
    const c = emt(['cpr', 'cpap']);
    expect(penalties(c)).toEqual(['cpap-not-breathing']);
    expect(c.flags.ventilated).toBeUndefined();
    expect(missed(c, /^Treat the cause/)).toBe(true);
  });

  it('IM epinephrine from the EMT in the arrest does nothing and costs points; it is not the arrest epinephrine', () => {
    const s = emt(['cpr', 'epi-im']);
    expect(penalties(s)).toEqual(['epi-im-arrest']);
    expect(s.flags.epi).toBeUndefined();
    expect(s.log.at(-1)!.text).toMatch(/nothing carries it out of the muscle/);
  });

  it('a pacer in the arrest is the built-in error', () => {
    expect(penalties(medic(['cpr', 'pace']))).toEqual(['pace-in-arrest']);
  });

  it('after ROSC: compressions, arrest-dose epinephrine, a rate-control drug or nitroglycerin are errors', () => {
    const rosc = perform(sc, medic(TO_ROSC), 'bvm');
    expect(penalties(perform(sc, rosc, 'cpr'))).toEqual(['cpr-with-pulse']);
    expect(penalties(perform(sc, rosc, 'epinephrine'))).toEqual(['arrest-epi-with-pulse']);
    for (const id of ['metoprolol', 'diltiazem']) {
      const s = perform(sc, rosc, id);
      expect(penalties(s), id).toEqual(['rate-control-post-rosc']);
      expect(s.vitals.sbp, id).toBeLessThan(rosc.vitals.sbp);
    }
    expect(penalties(perform(sc, rosc, 'nitro'))).toEqual(['nitro-hypotension']);
    // her glucose is not low
    expect(penalties(perform(sc, rosc, 'dextrose'))).toEqual(['glucose-not-low']);
  });

  it('the hint names CPR first, then the AED (EMT) or the rhythm check (paramedic), and costs points', () => {
    expect(takeHint(sc, start(sc, 2)).log.at(-1)!.text).toMatch(/^Hint: Take over high-quality CPR/);
    expect(takeHint(sc, emt(['cpr'])).log.at(-1)!.text).toMatch(/^Hint: AED on/);
    expect(takeHint(sc, medic(['cpr'])).log.at(-1)!.text).toMatch(/^Hint: Rhythm check on the monitor/);
    expect(penalties(takeHint(sc, start(sc, 2)))).toEqual(['hint-1']);
  });

  it('the rhythm check counts only with a pulse check after the ECG is on', () => {
    expect(missed(medic(['cpr', 'pulse-check', 'cpr']), /^Rhythm check/)).toBe(true);
    expect(missed(medic(['cpr', 'monitor', 'pulse-check']), /^Rhythm check/)).toBe(false);
  });
});

describe('PEA arrest in the field — teaching', () => {
  it('teaches current (2025 AHA) practice', () => {
    const text = [...sc.teaching, ...sc.critical.map((c) => c.why)].join(' ');
    expect(text).toMatch(/not shockable/);
    expect(text).toMatch(/Epinephrine 1 mg IV\/IO as soon as possible/);
    expect(text).toMatch(/IV first; IO if IV attempts are unsuccessful or not feasible/);
    expect(text).toMatch(/Hs and Ts/);
    expect(text).toMatch(/compressions alone cannot fix it/);
    expect(text).toMatch(/auto-PEEP/);
    expect(text).toMatch(/SpO₂ 90–98 %/);
    expect(text).toMatch(/MAP ≥ 65/);
    expect(text).toMatch(/32–37\.5 °C for at least 36 hours/);
    expect(text).toMatch(/since 2010/);
    // outdated numbers stay out
    expect(text).not.toMatch(/SBP ≥ 90|92–98|94–99|32–36 °C|vasopressin/);
  });
});
