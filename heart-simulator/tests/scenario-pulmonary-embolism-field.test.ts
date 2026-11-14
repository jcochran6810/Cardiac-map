import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '@/data/content';
import { resolveProfile } from '@/lib/ecg/profiles';
import { BUILT_IN_HARMS, clockText, criticalsFor, perform, review, start, stop, takeHint } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { partialFor } from '@/lib/sim/scenario/reads';
import { peField as sc } from '@/lib/sim/scenario/scenarios/peField';
import type { SimState } from '@/lib/sim/scenario/types';
import { has } from '@/lib/sim/scenario/kit';
import { UNTIL_ARRIVED, readAfter, runScenario } from './helpers';

const medic = (steps: string[], reads: 'correct' | 'manual' = 'correct') => runScenario(sc, 2, steps, undefined, reads);
const emt = (steps: string[]) => runScenario(sc, 1, steps);
const penalties = (s: SimState) => s.penalties.map((p) => p.id);
const said = (s: SimState) => s.log.map((l) => l.text).join('\n');
const last = (s: SimState) => s.log.at(-1)!.text;
const missed = (s: SimState, label: RegExp) => review(sc, stop(s)).toFix.some((t) => t.kind === 'missed' && label.test(t.label));
const late = (s: SimState, label: RegExp) => review(sc, stop(s)).toFix.find((t) => label.test(t.label))?.kind === 'late';
const until = (s: SimState, done: (x: SimState) => boolean, max = 30) => {
  for (let i = 0; i < 30 && !done(s) && !s.ended && s.minute < max; i++) s = perform(sc, s, 'reassess');
  return s;
};

/** The ideal runs (the lead copies them into tests/scenarios.test.ts) */
const IDEAL: Record<1 | 2, string[]> = {
  1: ['primary', 'o2-nrb', 'als', 'vitals', 'perfusion', 'lungs', 'sample', 'ecg12', 'ecg-transmit', 'transport-pci', 'notify', UNTIL_ARRIVED, 'handoff'],
  2: ['primary', 'vitals', 'o2-nrb', 'monitor', 'ecg12', 'perfusion', 'lungs', 'iv', 'pressor', 'sample', 'transport-pci', 'notify', UNTIL_ARRIVED, 'handoff'],
};

/** The paramedic's ideal run up to the decision to leave: everything done, still on scene */
const ON_SCENE = IDEAL[2].slice(0, IDEAL[2].indexOf('transport-pci'));

/** The paramedic gives three boluses: the right ventricle fails on the second, and she arrests on the third */
const FLUID_ARREST = ['primary', 'vitals', 'iv', 'fluid', 'fluid', 'fluid'];

const GIVEAWAY = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture|\bPEA\b|asystole|pulseless electrical|embol|\bclot|strain|S1Q3|right heart/i;
const BRITISH = /haem|aemia|ischaem|oedem|synchronis|equalis|hyperaem|centre|levell|manoeuvre|nebulis|analyse\b|organis|colour|\bgrey|litres|metres|optimis|minimis|catheteris|heparinis|recognis|ventricularis/i;

describe('Pulmonary embolism in the field — the case itself', () => {
  it('is a field case for the EMT and the paramedic, and refers only to interventions, rhythms and conditions that exist', () => {
    expect(sc).toMatchObject({ id: 'pulmonary-embolism-field', setting: 'field', roles: [1, 2] });
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe('pulmonary-embolism');
    expect(CONDITIONS[sc.conditionId!]).toBeDefined();
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
    // nothing she has makes calcium, bicarbonate, a transfusion or the wet-lung rules right: the embolism with shock
    // (category E1), after her recent surgery
    expect(sc.problems ?? []).toEqual(['pulmonary-embolism', 'pe-high-risk', 'recent-surgery']);
  });

  it('nothing the learner sees before the 12-lead names the diagnosis — but the story is there', () => {
    const opening = [sc.title, sc.summary, ...sc.briefing.default.map((l) => l[1]), ...sc.briefing[1]!.map((l) => l[1])].join(' ');
    expect(opening).not.toMatch(/embol|\bclot|\bPE\b|pulmonary|thromb|S1Q3|strain|obstructive/i);
    expect(opening).toMatch(/ten days after knee surgery/);
    expect(opening).toMatch(/crutches/);
    expect(opening).toMatch(/went gray and dropped/);
    // the far destination is the regional heart center, named as every field case names it
    const hospital = sc.briefing.default.filter((l) => l[0] === 'hospital').map((l) => l[1]).join(' ');
    expect(hospital).toMatch(/heart center/);
    expect(JSON.stringify(sc.briefing)).not.toMatch(/cardiac center/i);
  });

  it('the EMT is the BLS crew with an intercept on offer; the paramedic has an EMT partner', () => {
    expect(start(sc, 1).log.some((l) => /You are the BLS crew; a paramedic unit can meet you as an intercept/.test(l.text))).toBe(true);
    expect(start(sc, 2).log.some((l) => /you have the monitor and the drug box/.test(l.text))).toBe(true);
  });

  it('uses US spelling in everything a learner reads', () => {
    expect(JSON.stringify(sc)).not.toMatch(BRITISH);
    // JSON leaves out functions: the lines the responders, events, facts and rules write are read from their source
    const fns = [...Object.values(sc.respond), ...Object.values(sc.facts), ...sc.events.flatMap((e) => [e.when, e.effect]), ...sc.harms.map((h) => h.when), sc.status];
    for (const f of fns) if (typeof f === 'function') expect(String(f)).not.toMatch(BRITISH);
    expect(sc.teaching.join(' ')).not.toMatch(BRITISH);
    for (const role of [1, 2] as const) for (const l of runScenario(sc, role, IDEAL[role]).log) expect(l.text).not.toMatch(BRITISH);
    for (const l of medic([...FLUID_ARREST, 'cpr', 'epinephrine', 'cpr', 'cpr', 'pressor', 'hs-ts', 'med-control']).log) expect(l.text).not.toMatch(BRITISH);
  });
});

describe('Pulmonary embolism in the field — the ideal runs', () => {
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
      // short scene, a vasopressor and no fluid load: the right ventricle holds
      expect(s.fired).not.toContain('rv-fails');
      expect(s.fired).not.toContain('arrest');
      expect(s.flags.arrest).toBeUndefined();
    });
  }

  it('the paramedic reads the right heart strain at no cost; "sinus tachycardia" alone is not the read', () => {
    const s = medic(readAfter(IDEAL[2], 'ecg12', 'right-strain'), 'manual');
    expect(s.reads).toEqual([expect.objectContaining({ kind: 'ecg', answer: 'right-strain', verdict: 'correct' })]);
    expect(s.log.some((l) => l.who === 'feedback' && /^Correct\. Sinus tachycardia 124 with right heart strain.*S1Q3T3.*No ST elevation that meets STEMI criteria/.test(l.text))).toBe(true);
    expect(review(sc, s).percent).toBe(100);
    const rate = medic(readAfter(IDEAL[2], 'ecg12', 'sinus-tach'), 'manual');
    const half = partialFor('pulmonary-embolism').includes('sinus-tach');
    expect(rate.reads[0].verdict).toBe(half ? 'partial' : 'wrong');
    expect(rate.penalties).toEqual([expect.objectContaining(half ? { points: 2, severity: 'minor' } : { points: 5, severity: 'major' })]);
  });

  it('the EMT acquires and transmits the 12-lead without reading it, and the physician reads it — asking for the history if it is missing', () => {
    const s = emt(IDEAL[1]);
    expect(s.reads).toEqual([]);
    expect(s.log.some((l) => /12-lead acquired\. You can't interpret it/.test(l.text))).toBe(true);
    expect(said(s)).toMatch(/The physician: "A fast rate with right heart strain — no ST elevation that meets STEMI criteria\. With a faint, a low pressure and an operation ten days ago, I am thinking of a large clot in her lungs/);
    const early = emt(['primary', 'ecg12', 'ecg-transmit']);
    expect(last(early)).toMatch(/Tell me her history: any recent surgery, a long trip, a clot before\?/);
    expect(early.penalties).toEqual([]);
  });

  it('every rhythm it reaches is a real profile, and no monitor line names the rhythm or the diagnosis', () => {
    const runs: SimState[] = [];
    for (const role of [1, 2] as const) {
      runScenario(sc, role, IDEAL[role], (s) => {
        expect(resolveProfile(s.rhythm.profile).id, s.rhythm.profile).toBe(s.rhythm.profile);
        runs.push(s);
      });
    }
    runs.push(
      medic([...FLUID_ARREST, 'pads', 'capno', 'pulse-check', 'cpr', 'epinephrine', 'cpr', 'cpr', 'pressor', 'ecg12', 'transport-pci']),
      medic(['primary', 'monitor', 'iv', 'o2-nc', 'nitro', 'cpap', 'metoprolol', 'adenosine6', 'vagal', 'midazolam', 'push-epi', 'legs-up', 'fentanyl', 'epi-im']),
      medic([...ON_SCENE, 'reassess', 'reassess', 'reassess', 'reassess', 'reassess', 'reassess', 'cpr', 'defib', 'cardiovert']),
      emt(['primary', 'monitor', 'als', 'o2-nrb', 'cpap', 'legs-up', 'vagal', 'ecg12', ...Array<string>(8).fill('reassess'), 'cpr', 'aed', 'cpr', 'cpr', 'vitals']),
      medic(['primary', 'monitor', 'iv', 'push-epi', 'reassess', 'reassess', 'reassess', 'pressor', 'push-epi', 'magnesium-sulfate']),
    );
    for (const s of runs) {
      expect(resolveProfile(s.rhythm.profile).id).toBe(s.rhythm.profile);
      for (const l of s.log) if (l.who === 'monitor') expect(l.text).not.toMatch(GIVEAWAY);
    }
  });

  it('is deterministic', () => {
    expect(medic(IDEAL[2])).toEqual(medic(IDEAL[2]));
    expect(emt(IDEAL[1])).toEqual(emt(IDEAL[1]));
  });
});

describe('Pulmonary embolism in the field — what helps her', () => {
  it('starts in shock: fast, low, hypoxic, awake — with full neck veins, clear lungs and a swollen calf', () => {
    const s = start(sc, 2);
    expect(s.rhythm).toEqual({ profile: 'pulmonary-embolism', hr: 124 });
    expect([s.vitals.sbp, s.vitals.dbp, s.vitals.spo2, s.vitals.rr, s.vitals.gcs]).toEqual([84, 52, 86, 30, 15]);
    const exam = medic(['perfusion', 'lungs', 'sample', 'opqrst']);
    expect(said(exam)).toMatch(/neck veins distended while she sits up/);
    expect(said(exam)).toMatch(/right calf is swollen, warm and tender/);
    expect(said(exam)).toMatch(/Clear and equal on both sides — no crackles/);
    expect(said(exam)).toMatch(/broke my right shin bone just below the knee; ten days ago they fixed it with a plate and screws/);
    expect(said(exam)).toMatch(/birth control pill/);
    expect(said(exam)).toMatch(/sharp pain on the right side of my chest when I breathe in/);
  });

  it('a non-rebreather brings her SpO₂ to 92 %; a nasal cannula leaves it under 90 and does not count as the oxygen', () => {
    const nrb = medic(['o2-nrb']);
    expect(nrb.vitals.spo2).toBe(92);
    expect(last(nrb)).toBe('Non-rebreather at 15 L/min. SpO₂ 92%.');
    const nc = medic(['o2-nc']);
    expect(nc.vitals.spo2).toBe(89);
    expect(last(nc)).toMatch(/A non-rebreather would give her more/);
    expect(nc.penalties).toEqual([]);
    expect(missed(nc, /^High-flow oxygen/)).toBe(true);
    expect(perform(sc, nc, 'o2-nrb').vitals.spo2).toBe(92);
  });

  it('a norepinephrine infusion lifts her pressure to 102/64, and never lowers a higher one', () => {
    const s = medic(['monitor', 'iv', 'pressor']);
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([102, 64]);
    expect(s.log.some((l) => l.who === 'monitor' && l.text === 'BP 102/64.')).toBe(true);
    expect(s.penalties).toEqual([]);
    const high = { ...s, vitals: { ...s.vitals, sbp: 118, dbp: 74 }, flags: { ...s.flags } };
    delete high.flags.pressor;
    high.counts = { ...high.counts, pressor: 0 };
    const again = perform(sc, high, 'pressor');
    expect([again.vitals.sbp, again.vitals.dbp]).toEqual([118, 74]);
  });

  it('push-dose epinephrine is the bridge: it lifts the pressure, counts as the vasopressor, and costs nothing', () => {
    const s = medic(['monitor', 'iv', 'push-epi']);
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([98, 60]);
    expect(said(s)).toMatch(/That buys a few minutes: repeat it, or an infusion keeps it there/);
    expect(s.penalties).toEqual([]);
    expect(missed(s, /^Vasopressor/)).toBe(false);
    // a push lasts minutes: with no infusion behind it, the right ventricle still fails at 20 minutes, en route
    const once = medic(['primary', 'vitals', 'o2-nrb', 'iv', 'push-epi', 'perfusion', 'lungs', 'sample', 'transport-pci', 'notify', UNTIL_ARRIVED]);
    expect(once.flags['rv-failing']).toBeGreaterThanOrEqual(20);
    expect(once.pulse).toBe(true);
    // pushes repeated every few minutes keep it from failing
    const pushes = medic(['primary', 'vitals', 'o2-nrb', 'iv', 'push-epi', 'transport-pci', 'notify', 'push-epi', 'reassess', 'reassess', 'push-epi', 'reassess', 'reassess', 'push-epi', UNTIL_ARRIVED]);
    expect(pushes.fired).not.toContain('rv-fails');
    // in the arrest it is not the arrest dose: no cost, no credit
    const arrest = perform(sc, medic(FLUID_ARREST), 'push-epi');
    expect(arrest.flags['push-epi']).toBeUndefined();
    expect(last(arrest)).toMatch(/In cardiac arrest the dose is 1 mg/);
  });

  it('one small bolus is tolerated: the pressure barely moves and the neck veins fill — no penalty', () => {
    const s = medic(['monitor', 'iv', 'fluid']);
    expect(s.penalties).toEqual([]);
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([88, 54]);
    expect(said(s)).toMatch(/500 mL of saline in\.[\s\S]*Hardly any change, and her neck veins look fuller/);
    expect(s.fired).not.toContain('rv-fails');
    // and the ideal run with one bolus added is still full marks
    const steps = [...IDEAL[2].slice(0, IDEAL[2].indexOf('pressor')), 'fluid', ...IDEAL[2].slice(IDEAL[2].indexOf('pressor'))];
    expect(review(sc, medic(steps)).percent).toBe(100);
  });

  it('the EMT\'s intercept arrives 6 minutes after the call, with an IV and norepinephrine — and meets the ambulance on the way', () => {
    const s = emt(IDEAL[1]);
    expect(s.fired).toContain('als-arrives');
    expect(s.flags['als-here'] - s.flags.als).toBeGreaterThanOrEqual(6);
    expect(said(s)).toMatch(/The medic unit meets you on the way; the paramedic climbs in: an IV, and a norepinephrine infusion/);
    expect(s.flags.pressor).toBeDefined();
    // waited for on scene, it arrives at her side
    const waited = emt(['als', 'reassess', 'reassess', 'reassess']);
    expect(said(waited)).toMatch(/The paramedic arrives: an IV, and a norepinephrine infusion/);
    expect([waited.vitals.sbp, waited.vitals.dbp]).toEqual([98, 62]);
    // an EMT who never calls ALS gets no vasopressor
    expect(emt(['primary', 'reassess', 'reassess', 'reassess', 'reassess']).flags.pressor).toBeUndefined();
  });

  it('medical control asks for the neck veins and the history first, then gives the plan — at no cost', () => {
    const first = medic(['primary', 'med-control']);
    expect(last(first)).toMatch(/Tell me more: her neck veins and her lungs, and anything recent/);
    const plan = medic(['primary', 'perfusion', 'sample', 'med-control']);
    expect(last(plan)).toMatch(/Norepinephrine for her pressure.*No more than 500 mL of fluid, no nitroglycerin, no CPAP and no sedation.*the heart center/);
    expect(plan.penalties).toEqual([]);
    const e = emt(['primary', 'als', 'perfusion', 'sample', 'med-control']);
    expect(last(e)).toMatch(/Keep her sitting up on high-flow oxygen, no CPAP\. Don't wait on scene for your intercept/);
    // an EMT who has not called the intercept is told to
    expect(last(emt(['primary', 'perfusion', 'sample', 'med-control']))).toMatch(/Request a paramedic intercept now and let it meet you on the way/);
  });

  it('the call ahead with what the crew found brings the team to the door; without it, nobody is ready', () => {
    const s = medic(IDEAL[2]);
    expect(said(s)).toMatch(/we are calling the PE response team and opening the cath lab/);
    expect(said(s)).toMatch(/Your call ahead set it up/);
    expect(said(s)).toMatch(/CT angiography: clot in both main pulmonary arteries/);
    const silent = medic(['primary', 'vitals', 'iv', 'pressor', 'transport-pci', UNTIL_ARRIVED]);
    expect(said(silent)).toMatch(/Nobody was expecting her/);
    const bare = medic(['primary', 'transport-pci', 'notify']);
    expect(last(bare)).toMatch(/^Copy: short of breath after a faint, BP \d+\/\d+\. We'll see her in the emergency department\.$/);
  });

  it('raising the legs adds nothing to a right ventricle that is already full, and she cannot breathe lying flat — no penalty', () => {
    for (const role of [1, 2] as const) {
      const s = runScenario(sc, role, ['primary', 'legs-up']);
      expect([s.vitals.sbp, s.vitals.dbp]).toEqual([84, 52]);
      expect(said(s)).toMatch(/I can't breathe lying down!/);
      expect(s.penalties).toEqual([]);
    }
  });

  it('a small dose of fentanyl for the pleuritic pain is fair once the pressure is held up; under 90 it costs a little', () => {
    const held = medic(['iv', 'pressor', 'fentanyl']);
    expect(held.penalties).toEqual([]);
    expect(held.vitals.pain).toBe(2);
    expect(penalties(medic(['iv', 'fentanyl']))).toEqual(['opioid-hypotension']);
  });

  it('aspirin and the pads cost nothing; she has no nitroglycerin of her own for the EMT to help with', () => {
    expect(penalties(emt(['aspirin', 'pads']))).toEqual([]);
    const s = perform(sc, start(sc, 1), 'nitro-assist');
    expect(s.counts['nitro-assist']).toBeUndefined();
    expect(s.minute).toBe(0);
    expect(s.penalties).toEqual([]);
  });

  it('the Hs and Ts point to a clot in the lungs', () => {
    expect(last(medic(['primary', 'hs-ts']))).toMatch(/Thrombosis: pulmonary — ten days after knee surgery.*The likeliest cause\./);
  });

  it('the hint names the vital signs first, and costs points', () => {
    const s = takeHint(sc, start(sc, 2));
    expect(last(s)).toMatch(/^Hint: Vital signs\./);
    expect(penalties(s)).toEqual(['hint-1']);
    expect(last(takeHint(sc, emt(['vitals', 'o2-nrb'])))).toMatch(/^Hint: Request a paramedic intercept/);
  });
});

describe('Pulmonary embolism in the field — the traps', () => {
  it('a second bolus overloads the right ventricle: a penalty, a falling pressure and a failing heart; the third stops it', () => {
    let s = medic(FLUID_ARREST.slice(0, -1));
    expect(penalties(s)).toEqual(['fluid-loading-pe']);
    expect(s.penalties[0]).toMatchObject({ points: 10, severity: 'major' });
    expect(said(s)).toMatch(/Another 500 mL in — 1000 mL in all/);
    expect(s.fired).toContain('rv-fails');
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([74, 46]);
    expect(s.rhythm).toEqual({ profile: 'pulmonary-embolism', hr: 136 });
    expect(s.pulse).toBe(true);
    s = perform(sc, s, 'fluid');
    expect(s.pulse).toBe(false);
    expect(s.rhythm).toEqual({ profile: 'pea-narrow', hr: 120 });
    expect(s.flags['pe-arrest']).toBeDefined();
    // one mistake, one penalty
    expect(penalties(s)).toEqual(['fluid-loading-pe']);
  });

  it('nitroglycerin crashes her pressure and the right ventricle starts to fail: one critical penalty, not the built-in one too', () => {
    // the high dose takes it further down
    for (const [id, sbp] of [['nitro', 66], ['nitro-high', 64]] as const) {
      const s = medic(['primary', 'monitor', id]);
      expect(penalties(s), id).toEqual(['nitro-pe']);
      expect(s.penalties[0], id).toMatchObject({ points: 15, severity: 'critical' });
      expect([s.vitals.sbp, s.vitals.dbp], id).toEqual([sbp, 40]);
      expect(s.fired, id).toContain('rv-fails');
      expect(s.log.some((l) => l.who === 'monitor' && l.text === `BP ${sbp}/40.`), id).toBe(true);
    }
    // left on scene after it, she arrests 6 minutes later
    let s = medic(['primary', 'monitor', 'nitro']);
    s = until(s, (x) => !x.pulse);
    expect(s.pulse).toBe(false);
    expect(s.flags.arrest - s.flags['rv-failing']).toBeGreaterThanOrEqual(6);
  });

  it('CPAP drops her pressure and does not lift her saturation: a major penalty for either role', () => {
    for (const role of [1, 2] as const) {
      const s = runScenario(sc, role, ['primary', 'monitor', 'cpap']);
      expect(penalties(s), `role ${role}`).toEqual(['cpap-pe']);
      expect([s.vitals.sbp, s.vitals.dbp, s.vitals.spo2], `role ${role}`).toEqual([72, 44, 86]);
      expect(said(s)).toMatch(/take it off!/);
    }
    // the EMT's intercept says so on arrival
    expect(said(emt(['als', 'cpap', 'reassess', 'reassess', 'reassess']))).toMatch(/no CPAP: her lungs are clear, and positive pressure drops a pressure this low/);
    // no CPAP in the arrest: refused, no time passes
    const arrest = medic(FLUID_ARREST);
    const tried = perform(sc, arrest, 'cpap');
    expect(tried.minute).toBe(arrest.minute);
    expect(tried.counts.cpap).toBeUndefined();
  });

  it('a long scene time: everything done, but still on scene, the right ventricle fails at 16 minutes and she arrests 6 later', () => {
    let s = medic(ON_SCENE);
    expect(s.flags.pressor).toBeDefined();
    s = until(s, (x) => x.fired.includes('rv-fails'));
    expect(s.flags['rv-failing']).toBeGreaterThanOrEqual(16);
    expect(s.pulse).toBe(true);
    // the vasopressor holds her a little higher than without it, never back up
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([88, 54]);
    expect(said(s)).toMatch(/neck veins are bulging/);
    s = until(s, (x) => !x.pulse);
    expect(s.pulse).toBe(false);
    expect(s.flags.arrest - s.flags['rv-failing']).toBeCloseTo(6, 5);
    // leaving after the 15-minute goal counts half
    const left = medic([...ON_SCENE, 'reassess', 'reassess', 'reassess', 'transport-pci']);
    expect(late(left, /^Leave the scene/)).toBe(true);
  });

  it('loaded in time with a vasopressor, a failing right ventricle holds until the door; without one it stops', () => {
    // loaded after the right ventricle began to fail, with the infusion running: she reaches the hospital
    const held = medic([...ON_SCENE, 'reassess', 'reassess', 'reassess', 'transport-pci', UNTIL_ARRIVED]);
    expect(held.fired).toContain('rv-fails');
    expect(held.flags.arrived).toBeDefined();
    expect(held.pulse).toBe(true);
    // the nearest door is no mistake once she is failing
    const near = medic([...ON_SCENE, 'reassess', 'reassess', 'reassess', 'transport-near']);
    expect(penalties(near)).toEqual([]);
  });

  it('no vasopressor at all but loaded promptly: the right ventricle fails at 20 minutes en route, she reaches the door alive, and the item is missed', () => {
    const s = medic(['primary', 'vitals', 'o2-nrb', 'monitor', 'ecg12', 'perfusion', 'lungs', 'iv', 'sample', 'transport-pci', 'notify', UNTIL_ARRIVED]);
    expect(s.flags['rv-failing']).toBeGreaterThanOrEqual(20);
    expect(s.flags['rv-failing']).toBeGreaterThan(s.flags.enroute);
    expect(s.flags.arrived).toBeDefined();
    expect(s.pulse).toBe(true);
    expect(missed(s, /^Vasopressor/)).toBe(true);
  });

  it('slowing her compensating heart drops the pressure: a major penalty, once (in place of the built-in procainamide rule)', () => {
    const before = medic(['primary', 'monitor', 'iv']);
    for (const id of ['metoprolol', 'diltiazem']) {
      const s = perform(sc, before, id);
      expect(penalties(s), id).toEqual(['rate-control-pe']);
      expect(s.vitals.sbp, id).toBe(70);
      expect(s.rhythm.hr, id).toBeLessThan(124);
      expect(s.rhythm.profile, id).toBe('pulmonary-embolism');
    }
    for (const id of ['amio-infusion', 'procainamide']) {
      const s = perform(sc, before, id);
      expect(penalties(s), id).toEqual(['rate-control-pe']);
      expect(s.vitals.sbp, id).toBe(74);
    }
  });

  it('adenosine, lidocaine or a vagal maneuver for her sinus rate treat nothing: a minor penalty', () => {
    const before = medic(['primary', 'monitor', 'iv']);
    for (const id of ['adenosine6', 'adenosine12', 'lidocaine', 'vagal']) {
      const s = perform(sc, before, id);
      expect(penalties(s), id).toEqual(['no-arrhythmia-pe']);
      expect(s.penalties[0].points, id).toBe(3);
    }
    expect(penalties(emt(['primary', 'vagal']))).toEqual(['no-arrhythmia-pe']);
  });

  it('sedation takes away the drive that holds her pressure up: one major penalty for each drug, in place of the built-in midazolam rule', () => {
    expect(penalties(medic(['primary', 'monitor', 'iv', 'midazolam']))).toEqual(['sedation-pe']);
    // the procedure's sedation after midazolam brings fentanyl, a second drug into the same failing pressure: its own penalty
    // (rules/charge.ts WHOLE_ACTION); midazolam after the sedation is a repeat
    expect(penalties(medic(['primary', 'monitor', 'iv', 'sedation', 'midazolam']))).toEqual(['sedation-pe']);
    const s = medic(['primary', 'monitor', 'iv', 'midazolam', 'sedation']);
    expect(penalties(s)).toEqual(['sedation-pe', 'sedation-pe']);
    expect(s.vitals.sbp).toBeLessThan(84);
    expect(s.vitals.rr).toBeLessThan(30);
  });

  it('the nearest emergency department costs a little while she is holding her own: it cannot take the clot out', () => {
    const s = medic(['primary', 'vitals', 'transport-near', 'notify']);
    expect(penalties(s)).toEqual(['nearest-ed-pe']);
    expect(s.penalties[0].points).toBe(3);
    expect(last(s)).toMatch(/we will call the heart center for a transfer/);
    const arrived = medic(['primary', 'vitals', 'o2-nrb', 'iv', 'pressor', 'transport-near', UNTIL_ARRIVED]);
    expect(said(arrived)).toMatch(/We are calling the heart center for a transfer/);
    // the item to leave the scene is still done
    expect(missed(arrived, /^Leave the scene/)).toBe(false);
  });

  it('a STEMI alert is declined and costs a little; an airway for an awake patient and arrest-dose epinephrine are the built-in errors', () => {
    const alert = medic(['primary', 'ecg12', 'stemi-alert']);
    expect(penalties(alert)).toEqual(['stemi-alert-no-ste']);
    expect(alert.flags.alert).toBeUndefined();
    expect(penalties(medic(['primary', 'airway']))).toEqual(['airway-awake']);
    expect(penalties(medic(['iv', 'epinephrine']))).toEqual(['arrest-epi-with-pulse']);
    // the bag on an awake patient: she pushes it away, at no cost
    const bag = emt(['bvm']);
    expect(last(bag)).toMatch(/pushes the mask away/);
    expect(bag.penalties).toEqual([]);
    // IM epinephrine treats nothing she has
    expect(penalties(emt(['epi-im']))).toEqual(['epi-im-pe']);
    // the AED is not applied to a patient with a pulse
    const aed = perform(sc, start(sc, 1), 'aed');
    expect(aed.counts.aed).toBeUndefined();
    expect(aed.penalties).toEqual([]);
  });
});

describe('Pulmonary embolism in the field — the arrest', () => {
  it('CPR and epinephrine bring her back on the third cycle; the clot is still there, so she comes back fast and low', () => {
    let s = medic(FLUID_ARREST);
    const at = s.flags.arrest;
    s = perform(sc, s, 'cpr');
    s = perform(sc, s, 'epinephrine');
    s = perform(sc, s, 'cpr');
    expect(s.pulse).toBe(false);
    s = perform(sc, s, 'cpr');
    expect(s.pulse).toBe(true);
    expect(s.flags.rosc).toBeDefined();
    expect(s.rhythm).toEqual({ profile: 'pulmonary-embolism', hr: 136 });
    expect([s.vitals.sbp, s.vitals.dbp, s.vitals.gcs]).toEqual([78, 46, 10]);
    expect(said(s)).toMatch(/a carotid pulse — ROSC/);
    // after ROSC: the vasopressor holds her pressure, and transport after ROSC costs nothing
    s = perform(sc, s, 'pressor');
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([92, 58]);
    s = perform(sc, s, 'transport-pci');
    expect(penalties(s)).toEqual(['fluid-loading-pe']);
    const r = review(sc, stop(s));
    for (const label of [/^She arrests: high-quality CPR/, /^Epinephrine 1 mg/, /^After ROSC: hold her pressure up/]) {
      expect(r.wentWell.some((w) => label.test(w.label)), String(label)).toBe(true);
    }
    expect(r.wentWell.find((w) => /^She arrests/.test(w.label))?.detail).toBe(`at ${clockText(at)}`);
  });

  it('an infusion running before the arrest goes on after it: the item after ROSC is done at ROSC', () => {
    let s = medic(['primary', 'vitals', 'iv', 'pressor', 'fluid', 'fluid', 'fluid']);
    expect(s.pulse).toBe(false);
    for (const id of ['epinephrine', 'cpr', 'cpr', 'cpr']) s = perform(sc, s, id);
    expect(s.pulse).toBe(true);
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([92, 56]);
    expect(missed(s, /^After ROSC: hold her pressure up/)).toBe(false);
  });

  it('two cycles are not enough, and without epinephrine compressions never bring her back: she dies, scored as no ROSC', () => {
    const two = medic([...FLUID_ARREST, 'epinephrine', 'cpr', 'cpr']);
    expect(two.pulse).toBe(false);
    let s = medic(FLUID_ARREST);
    for (let i = 0; i < 12 && !s.ended; i++) s = perform(sc, s, 'cpr');
    expect(s.ended?.reason).toBe('death');
    expect(s.flags.rosc).toBeUndefined();
    const r = review(sc, s);
    expect(r.percent).toBeLessThanOrEqual(40);
    expect(r.toFix.some((t) => t.kind === 'missed' && /^Epinephrine 1 mg/.test(t.label))).toBe(true);
  });

  it('loading her in the arrest is the built-in error, and the transport item counts from ROSC', () => {
    let s = medic([...FLUID_ARREST, 'transport-pci']);
    expect(penalties(s)).toEqual(['fluid-loading-pe', 'transport-in-arrest']);
    for (const id of ['epinephrine', 'cpr', 'cpr', 'cpr']) s = perform(sc, s, id);
    expect(s.pulse).toBe(true);
    // ROSC came after the 15-minute goal: the item counts half, from the minute of ROSC
    const transport = review(sc, stop(s)).toFix.find((t) => /^Leave the scene/.test(t.label));
    expect(transport?.kind).toBe('late');
    expect(transport?.detail).toMatch(new RegExp(`^done at ${clockText(s.flags.rosc)};`));
  });

  it('a shock for her PEA is the built-in error; the AED advises none and costs nothing', () => {
    expect(penalties(medic([...FLUID_ARREST, 'defib']))).toEqual(['fluid-loading-pe', 'shock-nonshockable']);
    const s = medic([...FLUID_ARREST, 'aed']);
    expect(s.log.some((l) => l.who === 'monitor' && /No shock advised/.test(l.text))).toBe(true);
    expect(penalties(s)).toEqual(['fluid-loading-pe']);
  });

  it('for the EMT who stays on scene: she arrests; CPR, the AED and the intercept\'s epinephrine bring her back', () => {
    let s = emt(['primary', 'o2-nrb', 'als', 'vitals', 'perfusion', 'lungs', 'sample', 'ecg12', 'ecg-transmit']);
    s = until(s, (x) => !x.pulse);
    expect(s.pulse).toBe(false);
    expect(s.fired).toContain('als-arrives');
    expect(s.flags['rv-failing']).toBeGreaterThanOrEqual(16);
    // the paramedic at her side pushes epinephrine
    expect(s.flags.epi).toBe(s.flags.arrest);
    expect(said(s)).toMatch(/The paramedic: "Start compressions — I'll push the epinephrine\." Epinephrine 1 mg IV, flushed\./);
    for (const id of ['cpr', 'aed', 'cpr']) s = perform(sc, s, id);
    expect(s.pulse).toBe(false);
    s = perform(sc, s, 'cpr');
    expect(s.pulse).toBe(true);
    s = perform(sc, s, 'vitals');
    const r = review(sc, stop(s));
    for (const label of [/^She arrests: high-quality CPR/, /^AED on/, /^After ROSC: check her blood pressure/]) {
      expect(r.wentWell.some((w) => label.test(w.label)), String(label)).toBe(true);
    }
    // she never left the scene in time: the item is missed
    expect(r.toFix.some((t) => t.kind === 'missed' && /^Leave the scene/.test(t.label))).toBe(true);
  });

  it('an EMT with no intercept has no epinephrine to give: compressions alone do not bring her back', () => {
    let s = emt(['primary', 'o2-nrb', 'vitals']);
    s = until(s, (x) => !x.pulse);
    expect(s.pulse).toBe(false);
    for (let i = 0; i < 10 && !s.ended; i++) s = perform(sc, s, 'cpr');
    expect(s.ended?.reason).toBe('death');
    expect(missed(s, /^Request a paramedic intercept/)).toBe(true);
  });

  it('medical control in the arrest: work it where you are, and tell the hospital the likely cause', () => {
    expect(last(medic([...FLUID_ARREST, 'med-control']))).toMatch(/Work the arrest where you are.*A clot in her lungs is the likely cause/);
  });
});

describe('Pulmonary embolism in the field — the second look', () => {
  it('a push of push-dose epinephrine wears off after a few minutes with no infusion behind it; repeated pushes hold the pressure without stacking', () => {
    let s = medic(['primary', 'monitor', 'iv', 'push-epi']);
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([98, 60]);
    s = until(s, (x) => x.fired.includes('push-wears-off-1'));
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([84, 52]);
    expect(said(s)).toMatch(/The push-dose epinephrine has worn off: she is graying again/);
    expect(s.log.some((l) => l.who === 'monitor' && l.text === 'BP 84/52.')).toBe(true);
    // pushes a few minutes apart keep her at the lift of one push — never higher
    const kept = medic(['primary', 'monitor', 'iv', 'push-epi', 'reassess', 'push-epi', 'reassess', 'push-epi']);
    expect([kept.vitals.sbp, kept.vitals.dbp]).toEqual([98, 60]);
    expect(kept.fired.some((id) => id.startsWith('push-wears-off'))).toBe(false);
    // on top of the infusion a push is a few minutes' rise: the infusion holds the pressure
    const onTop = medic(['primary', 'monitor', 'iv', 'pressor', 'push-epi']);
    expect([onTop.vitals.sbp, onTop.vitals.dbp]).toEqual([102, 64]);
    expect(last(onTop)).toBe('BP 116/72 for a few minutes, then back to 102/64 on the infusion.');
    // a push before the arrest says nothing about the pressure after ROSC
    let r = medic(['primary', 'vitals', 'iv', 'push-epi', 'fluid', 'fluid', 'fluid']);
    expect(r.pulse).toBe(false);
    for (const id of ['cpr', 'epinephrine', 'cpr', 'cpr', 'reassess', 'reassess', 'reassess', 'reassess']) r = perform(sc, r, id);
    expect(r.pulse).toBe(true);
    expect([r.vitals.sbp, r.vitals.dbp]).toEqual([78, 46]);
    expect(r.fired.some((id) => id.startsWith('push-wears-off'))).toBe(false);
  });

  it('one push in place of the infusion is not enough at the door: the pressure-held item is missed; pushes kept up earn full marks', () => {
    const once = medic(IDEAL[2].map((id) => (id === 'pressor' ? 'push-epi' : id)));
    expect(once.fired).toContain('push-wears-off-1');
    const r = review(sc, once);
    expect(r.toFix).toEqual([expect.objectContaining({ kind: 'missed', label: 'Keep her pressure held up to the hand-off', points: 5 })]);
    expect(r.percent).toBe(95);
    expect(missed(once, /^Vasopressor/)).toBe(false);
    const kept = medic(['primary', 'vitals', 'o2-nrb', 'monitor', 'ecg12', 'perfusion', 'lungs', 'iv', 'push-epi', 'sample', 'transport-pci', 'notify',
      'push-epi', 'reassess', 'reassess', 'push-epi', 'reassess', 'reassess', 'push-epi', 'reassess', 'reassess', 'push-epi', UNTIL_ARRIVED, 'handoff']);
    expect(kept.ended?.reason).toBe('complete');
    expect(review(sc, kept).percent).toBe(100);
    // no vasopressor at all is the vasopressor item, missed once — not this one as well
    const none = medic(['primary', 'vitals', 'o2-nrb', 'monitor', 'ecg12', 'perfusion', 'lungs', 'iv', 'sample', 'transport-pci', 'notify', UNTIL_ARRIVED, 'handoff']);
    expect(review(sc, none).toFix.filter((x) => x.kind === 'missed').map((x) => x.label)).toEqual([expect.stringMatching(/^Vasopressor/)]);
  });

  it('after the arrest she cannot give a history: her husband answers', () => {
    let s = medic(FLUID_ARREST);
    expect(last(perform(sc, s, 'sample'))).toMatch(/^Her husband: "No allergies\. She fell off a ladder/);
    for (const id of ['cpr', 'epinephrine', 'cpr', 'cpr']) s = perform(sc, s, id);
    expect(s.vitals.gcs).toBe(10);
    expect(last(perform(sc, s, 'opqrst'))).toMatch(/^Her husband: "It hit her all at once/);
    expect(last(perform(sc, s, 'sample'))).toMatch(/^Her husband:/);
    // awake, she answers herself
    expect(last(medic(['sample']))).toMatch(/^No allergies\. I fell off a ladder/);
  });

  it('the call ahead after ROSC says she arrested; during the arrest the hospital names no cause the crew has not reported', () => {
    let s = medic(FLUID_ARREST);
    expect(last(perform(sc, s, 'notify'))).toBe('Copy: cardiac arrest, resuscitation under way. The resuscitation team will be ready. Call back with any change.');
    expect(last(medic([...FLUID_ARREST, 'perfusion', 'sample', 'notify']))).toMatch(/with a clot-dissolving drug and the ECMO team on standby/);
    for (const id of ['cpr', 'epinephrine', 'cpr', 'cpr']) s = perform(sc, s, id);
    expect(last(perform(sc, s, 'notify'))).toMatch(/then a cardiac arrest — a pulse back after CPR and epinephrine, BP 78\/46\. The resuscitation team will meet you/);
    s = perform(sc, perform(sc, s, 'perfusion'), 'sample');
    expect(last(perform(sc, s, 'notify'))).toMatch(/then a cardiac arrest — a pulse back after CPR and epinephrine.*we are calling the PE response team/);
  });

  it('a mask in the arrest is refused (and is not the oxygen); the non-rebreather she had on goes back on at ROSC', () => {
    const arrest = medic(FLUID_ARREST);
    for (const id of ['o2-nrb', 'o2-nc']) {
      const tried = perform(sc, arrest, id);
      expect(tried.minute, id).toBe(arrest.minute);
      expect(tried.counts[id], id).toBeUndefined();
      expect(last(tried), id).toMatch(/a mask only offers oxygen to someone who breathes/);
    }
    let s = medic(['primary', 'vitals', 'o2-nrb', 'iv', 'fluid', 'fluid', 'fluid']);
    for (const id of ['cpr', 'epinephrine', 'cpr', 'cpr']) s = perform(sc, s, id);
    expect(s.vitals.spo2).toBe(88);
    expect(said(s)).toMatch(/The non-rebreather goes back on at 15 L\/min/);
  });

  it('a pressure in both arms counts as the vital signs', () => {
    const steps = IDEAL[1].map((id) => (id === 'vitals' ? 'bp-both-arms' : id));
    expect(review(sc, emt(steps)).percent).toBe(100);
  });

  it('the nearest emergency department costs nothing for a BLS crew with no intercept coming: an unsupported patient in shock goes to the closest door', () => {
    expect(penalties(emt(['primary', 'o2-nrb', 'vitals', 'transport-near']))).toEqual([]);
    expect(penalties(emt(['primary', 'o2-nrb', 'als', 'vitals', 'transport-near']))).toEqual(['nearest-ed-pe']);
  });

  it('magnesium is no drug for her sinus rate: a minor penalty', () => {
    const s = medic(['primary', 'monitor', 'iv', 'magnesium-sulfate']);
    expect(penalties(s)).toEqual(['no-arrhythmia-pe']);
    expect(s.vitals.sbp).toBeLessThan(84);
  });

  it('the intercept names no diagnosis to the EMT, and on scene says to go', () => {
    const waited = emt(['als', 'reassess', 'reassess', 'reassess']);
    const team = waited.log.filter((l) => l.who === 'team').map((l) => l.text).join(' ');
    expect(team).not.toMatch(/embol|\bclot|right heart|right ventricle|strain/i);
    expect(team).toMatch(/Let's load her and go/);
    // met on the way, there is nothing to hurry
    expect(said(emt(IDEAL[1]))).not.toMatch(/Let's load her and go/);
  });

  it('after ROSC the paramedic beside the EMT holds her pressure up with norepinephrine', () => {
    // the EMT waits on scene without loading: the intercept arrives in the arrest with only epinephrine
    let s = emt(['primary', 'o2-nrb', 'vitals']);
    s = until(s, (x) => !x.pulse);
    s = perform(sc, s, 'als');
    for (let i = 0; i < 6 && !s.pulse && !s.ended; i++) s = perform(sc, s, 'cpr');
    expect(s.pulse).toBe(true);
    expect(s.fired).toContain('als-post-rosc-pressor');
    expect(said(s)).toMatch(/The paramedic starts a norepinephrine infusion/);
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([90, 56]);
  });

  it('medical control in the EMT\'s arrest: compressions and the AED, the drugs from the paramedic', () => {
    let s = emt(['primary', 'o2-nrb', 'vitals']);
    s = until(s, (x) => !x.pulse);
    expect(last(perform(sc, s, 'med-control'))).toMatch(/compressions and the AED — and get a paramedic intercept to you now, for the epinephrine/);
  });

  it('the Hs and Ts weigh tamponade honestly: full neck veins fit, nothing else does', () => {
    const text = last(medic(['primary', 'hs-ts']));
    expect(text).toMatch(/Tamponade: full neck veins fit, but no chest injury, no cancer and no recent heart procedure/);
    expect(text).not.toMatch(/no trauma/);
  });

  it('the hand-off after ROSC reports the arrest', () => {
    let s = medic(FLUID_ARREST);
    for (const id of ['cpr', 'epinephrine', 'cpr', 'cpr', 'pressor', 'transport-pci']) s = perform(sc, s, id);
    s = until(s, (x) => has(x, 'arrived'), 60);
    expect(perform(sc, s, 'handoff').log.some((l) => /the PEA arrest and how long until ROSC/.test(l.text))).toBe(true);
  });
});

describe('Pulmonary embolism in the field — teaching', () => {
  it('teaches current US practice (2026 AHA/ACC PE, 2025 AHA)', () => {
    const text = [...sc.teaching, ...sc.critical.map((c) => c.why), ...sc.harms.map((h) => h.text)].join(' ');
    expect(text).toMatch(/2026 AHA\/ACC/);
    expect(text).toMatch(/Clinical Category E1/);
    expect(text).toMatch(/If she arrests \(Clinical Category E2\)/);
    expect(text).toMatch(/no routine fluid/);
    expect(text).toMatch(/norepinephrine/);
    expect(text).toMatch(/500 mL/);
    expect(text).toMatch(/no nitrates/i);
    expect(text).toMatch(/CPAP/);
    expect(text).toMatch(/within the last 3 weeks/);
    expect(text).toMatch(/ECMO/);
    expect(text).toMatch(/systemic thrombolysis may be considered/);
    expect(text).toMatch(/S1Q3T3 is classic but insensitive/);
    // the old severity words stay out
    expect(text).not.toMatch(/\bmassive\b|submassive/i);
  });
});
