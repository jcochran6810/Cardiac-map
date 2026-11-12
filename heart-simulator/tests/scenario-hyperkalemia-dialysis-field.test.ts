import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '@/data/content';
import { resolveProfile } from '@/lib/ecg/profiles';
import { BUILT_IN_HARMS, criticalsFor, perform, review, stop, takeHint, unavailableReason } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { hyperkalemiaField as sc } from '@/lib/sim/scenario/scenarios/hyperkalemiaField';
import type { SimState } from '@/lib/sim/scenario/types';
import { UNTIL_ARRIVED, readAfter, runScenario } from './helpers';

const run = (steps: string[], reads: 'correct' | 'manual' = 'correct') => runScenario(sc, 2, steps, undefined, reads);
const R = (n: number) => Array<string>(n).fill('reassess');
const penalties = (s: SimState) => s.penalties.map((p) => p.id);
const replace = (steps: string[], from: string, to: string[]) => steps.flatMap((id) => (id === from ? to : [id]));

/** The paramedic's ideal run (the lead copies it into tests/scenarios.test.ts) */
const IDEAL = ['primary', 'monitor', 'ecg12', 'sample', 'pads', 'iv', 'calcium-chloride', 'nibp', 'albuterol-hyperk', 'notify', 'transport-pci', UNTIL_ARRIVED, 'handoff'];

/** Up to the moment he arrests: monitor and IV on, then nothing for his potassium */
function untilArrest(): SimState {
  let s = run(['monitor', 'pads', 'iv']);
  while (s.pulse && s.minute < 30) s = perform(sc, s, 'reassess');
  return s;
}

const GIVEAWAY = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture|hyperkal|potassium|sine/i;
const BRITISH = /haem|aemia|ischaem|oedem|synchronis|equalis|hyperaem|centre|levell|manoeuvre|nebulis|analyse\b|organis|colour|\bgrey|litres|metres|optimis|minimis|catheteris|heparinis|recognis|shovell|ventricularis/i;

describe('hyperkalemia in a dialysis patient — the case itself', () => {
  it('is a field case for the paramedic, and refers only to interventions, rhythms and a condition that exist', () => {
    expect(sc).toMatchObject({ id: 'hyperkalemia-dialysis-field', setting: 'field', roles: [2] });
    expect(CONDITIONS[sc.conditionId!]).toBeDefined();
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe('hyperkalemia');
    for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `respond ${id}`).toBeDefined();
    for (const h of sc.harms) {
      for (const id of h.actions) expect(INTERVENTION_BY_ID[id], `harm ${h.id}: ${id}`).toBeDefined();
      for (const id of h.replaces ?? []) expect(BUILT_IN_HARMS.some((b) => b.id === id), `harm ${h.id} replaces ${id}`).toBe(true);
    }
    for (const t of sc.timings ?? []) for (const id of t.actions) expect(INTERVENTION_BY_ID[id], `timing ${id}`).toBeDefined();
    const scope = new Set(interventionsFor(2, 'field').map((i) => i.id));
    for (const c of criticalsFor(sc, 2)) {
      const ids = typeof c.done === 'function' ? c.uses ?? [] : c.done;
      expect(ids.some((id) => scope.has(id)), c.id).toBe(true);
    }
    // the drug rules read what he has: calcium, bicarbonate and high-dose albuterol are indicated here
    expect(sc.problems).toEqual(expect.arrayContaining(['hyperkalemia', 'metabolic-acidosis']));
  });

  it('nothing the learner sees before the 12-lead names the diagnosis', () => {
    const opening = [sc.title, sc.summary, ...sc.briefing.default.map((l) => l[1])].join(' ');
    expect(opening).not.toMatch(/hyperkal|potassium/i);
    expect(opening).toMatch(/dialysis/);
  });

  it('uses US spelling in everything a learner reads', () => {
    expect(JSON.stringify(sc)).not.toMatch(BRITISH);
    for (const l of run(IDEAL).log) expect(l.text).not.toMatch(BRITISH);
  });
});

describe('hyperkalemia in a dialysis patient — the ideal run', () => {
  it('ends by itself with full marks', () => {
    const s = run(IDEAL);
    expect(s.ended?.reason).toBe('complete');
    expect(s.pulse).toBe(true);
    const r = review(sc, s);
    expect(r.toFix).toEqual([]);
    expect(r.penaltyPoints).toBe(0);
    expect(r.percent).toBe(100);
    expect(r.grade).toBe('Excellent');
    expect(r.outcome).toMatch(/^Every critical intervention done/);
    for (const t of r.timings) if (t.met !== null) expect(t.met, t.label).toBe(true);
    // he never got worse; the albuterol had time to work, and the dialysis team was waiting
    expect(s.fired).toEqual(expect.arrayContaining(['shift-works', 'arrive-dialysis']));
    expect(s.fired).not.toContain('worse');
    expect(s.fired).not.toContain('arrest');
    expect(s.log.some((l) => /machine already set up from your call/.test(l.text))).toBe(true);
  });

  it('with the read given by hand: the 12-lead is read as hyperkalemia, at no cost', () => {
    const s = run(readAfter(IDEAL, 'ecg12', 'hyperkalaemia'), 'manual');
    expect(s.reads).toEqual([expect.objectContaining({ kind: 'ecg', answer: 'hyperkalaemia', verdict: 'correct' })]);
    expect(review(sc, s).percent).toBe(100);
  });

  it('every rhythm it reaches is a real profile, and no monitor line names the rhythm or the diagnosis', () => {
    const runs: SimState[] = [];
    runScenario(sc, 2, IDEAL, (s) => {
      expect(resolveProfile(s.rhythm.profile).id, s.rhythm.profile).toBe(s.rhythm.profile);
      runs.push(s);
    });
    const arrest = untilArrest();
    runs.push(
      arrest,
      perform(sc, perform(sc, perform(sc, perform(sc, arrest, 'cpr'), 'epinephrine'), 'calcium-chloride'), 'cpr'),
      run(['monitor', 'pads', 'iv', 'atropine', 'pace', 'lidocaine', 'reassess', 'reassess']),
      run(['monitor', 'iv', 'adenosine6', 'metoprolol', 'calcium-chloride', 'pressor', 'fluid', 'fluid', 'cpap', 'nibp']),
      run(['monitor', 'iv', 'calcium-chloride', 'pace', ...R(16)]),
    );
    for (const s of runs) {
      expect(resolveProfile(s.rhythm.profile).id).toBe(s.rhythm.profile);
      // events speak through the partner and the hospital too: none of them names the diagnosis either
      for (const l of s.log) if (l.who === 'monitor' || l.who === 'partner') expect(l.text, l.text).not.toMatch(GIVEAWAY);
      for (const l of s.log) if (l.who === 'hospital') expect(l.text, l.text).not.toMatch(/hyperkal|potassium|sine/i);
    }
  });

  it('correct care in another sensible order also scores full marks: calcium before the 12-lead, the call from the road', () => {
    const s = run(['primary', 'monitor', 'iv', 'calcium-chloride', 'ecg12', 'pads', 'sample', 'albuterol-hyperk', 'vitals', 'transport-pci', 'notify', UNTIL_ARRIVED, 'handoff']);
    expect(s.ended?.reason).toBe('complete');
    expect(review(sc, s)).toMatchObject({ percent: 100, toFix: [], penaltyPoints: 0 });
  });

  it('the briefing names the regional center as the heart center the transport button goes to', () => {
    expect(sc.briefing.default[2][1]).toMatch(/^Regional heart center \(a full medical center: emergency dialysis/);
    expect(INTERVENTION_BY_ID['transport-pci'].label).toBe('Transport to the regional heart center (PCI, pacing, dialysis)');
    expect(run(['primary', 'transport-pci']).log.at(-1)!.text).toMatch(/^Patient loaded; transporting to the regional heart center, which can start emergency dialysis/);
  });

  it('keeps the paramedic inside the paramedic scope: insulin, heparin and lytics are not offered', () => {
    const s = run(['primary', 'monitor', 'iv']);
    for (const id of ['insulin-dextrose', 'heparin', 'tnk', 'steroid']) expect(unavailableReason(sc, s, id), id).toBe('Outside your scope');
    expect(unavailableReason(sc, s, 'albuterol-hyperk')).toBeNull();
    expect(unavailableReason(sc, s, 'calcium-chloride')).toBeNull();
  });
});

describe('hyperkalemia in a dialysis patient — what helps', () => {
  it('the 12-lead asks for a read: hyperkalemia; misreading it as heart block or VT costs 5 points', () => {
    let s = run(['primary', 'monitor', 'ecg12'], 'manual');
    expect(s.pendingRead).toMatchObject({ kind: 'ecg', answer: 'hyperkalaemia', explain: expect.stringMatching(/peaked T waves.*calcium now/) });
    for (const wrong of ['chb', 'vt']) {
      const r = run(['primary', 'monitor', 'ecg12', `read:${wrong}`], 'manual');
      expect(r.penalties, wrong).toEqual([expect.objectContaining({ points: 5, severity: 'major' })]);
    }
    s = run(['primary', 'monitor', 'ecg12', 'read:hyperkalaemia'], 'manual');
    expect(s.penalties).toEqual([]);
  });

  it('calcium brings the rate and the pressure up within minutes, at no cost; a repeat dose adds a little', () => {
    const s = run(['monitor', 'iv', 'calcium-chloride']);
    expect(s.rhythm).toEqual({ profile: 'hyperkalemia', hr: 54 });
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([96, 58]);
    expect(s.log.some((l) => l.who === 'patient' && /burns/.test(l.text))).toBe(true);
    expect(s.log.some((l) => l.who === 'monitor' && l.text === 'Heart rate 54. BP 96/58.')).toBe(true);
    const again = perform(sc, s, 'calcium-chloride');
    expect(again.rhythm.hr).toBe(60);
    expect(again.vitals.sbp).toBeGreaterThan(96);
    expect(penalties(again)).toEqual([]);
  });

  it('high-dose albuterol shifts the potassium: about 15 minutes later he is stronger', () => {
    let s = run(['monitor', 'iv', 'calcium-chloride', 'albuterol-hyperk']);
    expect(s.log.some((l) => l.who === 'patient' && /shaky/.test(l.text))).toBe(true);
    while (!s.fired.includes('shift-works') && s.minute < 40) s = perform(sc, s, 'reassess');
    expect(s.flags.shifted - s.flags['albuterol-hyperk']).toBeGreaterThanOrEqual(15);
    expect(s.rhythm.hr).toBeGreaterThanOrEqual(64);
    expect(s.vitals.sbp).toBeGreaterThanOrEqual(108);
    expect(sc.status!(s)).toMatch(/move my legs/);
    expect(penalties(s)).toEqual([]);
  });

  it('the wheezing dose of albuterol costs nothing but does not count as the shift', () => {
    const s = run(replace(IDEAL, 'albuterol-hyperk', ['albuterol']));
    expect(s.penalties).toEqual([]);
    const r = review(sc, s);
    expect(r.toFix.map((t) => [t.kind, t.label])).toEqual([['missed', expect.stringMatching(/^Shift the potassium/)]]);
    expect(s.fired).not.toContain('shift-works');
  });

  it('calcium only buys time: with nothing to shift the potassium it wears off after 30 minutes, and another dose brings him back', () => {
    let s = run(['monitor', 'iv', 'calcium-chloride']);
    while (!s.fired.includes('calcium-fades') && s.minute < 60) s = perform(sc, s, 'reassess');
    expect(s.fired).toContain('calcium-fades');
    expect(s.minute).toBeGreaterThanOrEqual(33);
    expect(s.rhythm).toEqual({ profile: 'hyperkalemia', hr: 46 });
    s = perform(sc, s, 'calcium-chloride');
    expect(s.rhythm.hr).toBe(54);
    expect(penalties(s)).toEqual([]);
  });

  it('bicarbonate is free for a man likely to be acidotic, and goes in with a flush apart from the calcium', () => {
    const s = run(replace(IDEAL, 'albuterol-hyperk', ['albuterol-hyperk', 'sodium-bicarbonate']));
    expect(review(sc, s)).toMatchObject({ percent: 100, toFix: [] });
    expect(s.log.some((l) => /flushed again: calcium and bicarbonate .* precipitate/.test(l.text))).toBe(true);
    // before any calcium there is nothing in the line to keep it from
    const first = run(['monitor', 'iv', 'sodium-bicarbonate']);
    expect(penalties(first)).toEqual([]);
    expect(first.log.at(-1)!.text).toBe('Sodium bicarbonate 50 mEq IV; line flushed.');
  });

  it('an epinephrine infusion supports the rate before calcium and holds off the decline, but does not replace calcium', () => {
    let s = run(['monitor', 'iv', 'pressor']);
    expect(s.rhythm).toEqual({ profile: 'hyperkalemia', hr: 46 });
    expect(penalties(s)).toEqual([]);
    while (s.minute < 12) s = perform(sc, s, 'reassess');
    expect(s.fired).not.toContain('worse');
    expect(review(sc, stop(s)).toFix.some((t) => t.kind === 'missed' && /^IV calcium/.test(t.label))).toBe(true);
    while (s.pulse && s.minute < 30) s = perform(sc, s, 'reassess');
    expect(s.flags.arrest).toBeGreaterThanOrEqual(20);
  });

  it('keeps the IV, the IO and the cuff off the fistula arm', () => {
    const s = run(['monitor', 'iv', 'nibp', 'perfusion']);
    expect(s.log.some((l) => /right forearm — not the left arm, which carries his dialysis fistula/.test(l.text))).toBe(true);
    expect(s.log.some((l) => l.who === 'monitor' && /^NIBP 78\/44 mmHg \(cuff on the right arm/.test(l.text))).toBe(true);
    expect(s.log.at(-1)!.text).toMatch(/fistula in the left forearm/);
    const io = run(['vitals', 'io']);
    expect(io.log.some((l) => l.text === 'BP 78/44 (right arm, away from the fistula) · pulse 36 · RR 22 · SpO₂ 93%')).toBe(true);
    expect(io.log.at(-1)!.text).toBe('IO established: right proximal humerus — away from the fistula arm.');
    expect(io.flags.iv).toBeDefined();
  });

  it('the radio report reaches the hospital he is going to, and says what has happened', () => {
    const near = run(['monitor', 'ecg12', 'iv', 'calcium-chloride', 'transport-near', 'notify']);
    expect(near.log.at(-1)!.text).toMatch(/^Copy\. We have no dialysis here/);
    expect(near.log.some((l) => /dialysis team/.test(l.text))).toBe(false);
    const early = run(['monitor', 'notify']);
    expect(early.log.at(-1)!.text).toBe('Copy: a weak dialysis patient with a slow pulse. Nephrology is on standby.');
    let arrested = untilArrest();
    for (const id of ['cpr', 'epinephrine', 'calcium-chloride', 'cpr', 'notify']) arrested = perform(sc, arrested, id);
    expect(arrested.log.at(-1)!.text).toMatch(/^Copy: a dialysis patient resuscitated from a cardiac arrest/);
  });
});

describe('hyperkalemia in a dialysis patient — delay matters', () => {
  it('untreated, he gets worse at 8 minutes and arrests in PEA at 15', () => {
    let s = run(['monitor', 'pads', 'iv']);
    while (!s.fired.includes('worse')) s = perform(sc, s, 'reassess');
    expect(s.minute).toBeGreaterThanOrEqual(8);
    expect(s.rhythm).toEqual({ profile: 'hyperkalemia', hr: 30 });
    // the shallow breathing the partner reports shows in the saturation
    expect([s.vitals.sbp, s.vitals.dbp, s.vitals.spo2]).toEqual([64, 36, 90]);
    expect(s.log.some((l) => l.who === 'monitor' && l.text === 'Heart rate 30. BP 64/36. SpO₂ 90%.')).toBe(true);
    s = untilArrest();
    expect(s.pulse).toBe(false);
    expect(s.rhythm.profile).toBe('pea');
    expect(s.flags.arrest).toBeGreaterThanOrEqual(15);
    // nobody is doing compressions yet, and the reassessment does not pretend otherwise
    expect(sc.status!(s)).not.toMatch(/CPR continues/);
    expect(sc.status!(perform(sc, s, 'cpr'))).toBe('Unresponsive, no pulse.');
  });

  it('once the shift has worked his strength and his saturation come back', () => {
    let s = run(['monitor', 'pads', 'iv']);
    while (!s.fired.includes('worse')) s = perform(sc, s, 'reassess');
    for (const id of ['calcium-chloride', 'albuterol-hyperk']) s = perform(sc, s, id);
    while (!s.fired.includes('shift-works') && s.minute < 50) s = perform(sc, s, 'reassess');
    expect([s.vitals.gcs, s.vitals.spo2]).toEqual([15, 93]);
  });

  it('calcium given once he is worse still brings him back', () => {
    let s = run(['monitor', 'pads', 'iv']);
    while (!s.fired.includes('worse')) s = perform(sc, s, 'reassess');
    s = perform(sc, s, 'reassess');
    expect(s.minute).toBeGreaterThan(10);
    s = perform(sc, s, 'calcium-chloride');
    expect(s.rhythm.hr).toBe(54);
    expect(s.vitals.gcs).toBe(15);
    while (s.minute < 25) s = perform(sc, s, 'reassess');
    expect(s.pulse).toBe(true);
    // late calcium counts half
    expect(review(sc, stop(s)).toFix.find((t) => /^IV calcium/.test(t.label))?.kind).toBe('late');
  });

  it('in the arrest, CPR and epinephrine alone do not bring him back: he dies', () => {
    let s = untilArrest();
    s = perform(sc, s, 'cpr');
    s = perform(sc, s, 'epinephrine');
    for (let i = 0; i < 12 && !s.ended; i++) s = perform(sc, s, 'cpr');
    expect(s.ended?.reason).toBe('death');
    expect(review(sc, s).percent).toBeLessThanOrEqual(40);
  });

  it('in the arrest, CPR, epinephrine and calcium (without pausing CPR) bring back a pulse, at no cost', () => {
    let s = untilArrest();
    for (const id of ['cpr', 'epinephrine', 'calcium-chloride']) s = perform(sc, s, id);
    expect(s.pulse).toBe(false);
    expect(s.log.some((l) => /compressions go on/.test(l.text))).toBe(true);
    s = perform(sc, s, 'cpr');
    expect(s.pulse).toBe(true);
    expect(s.flags.rosc).toBeDefined();
    expect(s.rhythm).toEqual({ profile: 'hyperkalemia', hr: 48 });
    expect(s.penalties).toEqual([]);
    const r = review(sc, stop(s));
    expect(r.toFix.some((t) => /^Cardiac arrest/.test(t.label))).toBe(false);
    // comatose and breathing 8 a minute: the bag ventilates him, and that is the post-ROSC item
    expect(sc.status!(s)).toBe('Comatose, breathing 8/min on his own.');
    expect(r.toFix.some((t) => t.kind === 'missed' && /^After ROSC: support his breathing/.test(t.label))).toBe(true);
    const bagged = perform(sc, s, 'bvm');
    expect([bagged.vitals.rr, bagged.vitals.spo2]).toEqual([10, 96]);
    expect(sc.status!(bagged)).toBe('Comatose; ventilated at 10/min.');
    expect(review(sc, stop(bagged)).toFix.some((t) => /^After ROSC: support/.test(t.label))).toBe(false);
  });

  it('bagging during the arrest is not bagging after it; an airway placed in the arrest goes on ventilating him after ROSC', () => {
    let s = untilArrest();
    for (const id of ['cpr', 'bvm', 'epinephrine', 'calcium-chloride', 'cpr']) s = perform(sc, s, id);
    expect(s.pulse).toBe(true);
    expect(sc.status!(s)).toBe('Comatose, breathing 8/min on his own.');
    expect(review(sc, stop(s)).toFix.some((t) => t.kind === 'missed' && /^After ROSC: support/.test(t.label))).toBe(true);
    let t = untilArrest();
    for (const id of ['cpr', 'airway', 'epinephrine', 'calcium-chloride', 'cpr']) t = perform(sc, t, id);
    expect([t.vitals.rr, t.vitals.spo2]).toEqual([10, 96]);
    expect(sc.status!(t)).toBe('Comatose; ventilated at 10/min.');
    expect(review(sc, stop(t)).toFix.some((x) => /^After ROSC: support/.test(x.label))).toBe(false);
  });

  it('after ROSC: the pressure (MAP 59) is an item; calcium lifts it, but neither calcium nor the shift wakes a man the arrest left comatose', () => {
    let s = untilArrest();
    for (const id of ['cpr', 'epinephrine', 'calcium-chloride', 'cpr', 'bvm']) s = perform(sc, s, id);
    expect(s.pulse).toBe(true);
    expect(review(sc, stop(s)).toFix.some((t) => t.kind === 'missed' && /^After ROSC: treat the low pressure/.test(t.label))).toBe(true);
    s = perform(sc, s, 'calcium-chloride');
    expect(s.rhythm.hr).toBe(54);
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([96, 58]);
    expect(s.vitals.gcs).toBe(6);
    expect(s.log.some((l) => /think straight/.test(l.text))).toBe(false);
    expect(sc.status!(s)).toBe('Comatose; ventilated at 10/min.');
    expect(review(sc, stop(s)).toFix.some((t) => /^After ROSC/.test(t.label))).toBe(false);
    // the nebulizer goes in line with the bag; its shift lifts the numbers, not the coma
    s = perform(sc, s, 'albuterol-hyperk');
    expect(s.log.some((l) => /inline with the bag/.test(l.text))).toBe(true);
    while (!s.fired.includes('shift-works') && s.minute < 70) s = perform(sc, s, 'reassess');
    expect(s.vitals.gcs).toBe(6);
    expect(s.log.some((l) => /talking in full sentences/.test(l.text))).toBe(false);
    expect(s.log.some((l) => /still no response to voice/.test(l.text))).toBe(true);
    // a pressor or push-dose epinephrine treats the pressure as well
    let p = untilArrest();
    for (const id of ['cpr', 'epinephrine', 'calcium-chloride', 'cpr', 'bvm', 'pressor']) p = perform(sc, p, id);
    expect(review(sc, stop(p)).toFix.some((t) => /^After ROSC/.test(t.label))).toBe(false);
    expect(p.penalties).toEqual([]);
  });

  it('a call back to medical control in the arrest gets the arrest\'s orders — no 12-lead, no nebulizer, no transport — and following them costs nothing', () => {
    // the reviewers' run: a 12-lead and a first call, then nothing for his potassium until he arrests, and a second call
    let s = run(['primary', 'monitor', 'ecg12', 'iv', 'med-control']);
    expect(s.log.at(-1)!.text).toMatch(/calcium chloride 1 g now/);
    while (s.pulse && s.minute < 30) s = perform(sc, s, 'reassess');
    expect(s.pulse).toBe(false);
    s = perform(sc, s, 'med-control');
    expect(s.counts['med-control']).toBe(2);
    const said = s.log.at(-1)!.text;
    expect(said).toMatch(/^Medical control: no pulse in a dialysis patient — treat it as a high potassium\. CPR, epinephrine 1 mg every 3–5 minutes, calcium chloride 1 g IV\/IO push and sodium bicarbonate 50 mEq, flushed between them\. Work it there: no transport until ROSC/);
    expect(said).not.toMatch(/12-lead|albuterol|Take him/);
    for (const id of ['cpr', 'epinephrine', 'calcium-chloride', 'sodium-bicarbonate', 'cpr']) s = perform(sc, s, id);
    expect(s.pulse).toBe(true);
    expect(s.penalties).toEqual([]);
    // with no 12-lead yet it does not ask for one (none can be recorded in the arrest)
    const early = perform(sc, untilArrest(), 'med-control').log.at(-1)!.text;
    expect(early).toMatch(/^Medical control: no pulse in a dialysis patient/);
    expect(early).not.toMatch(/12-lead/);
    // calcium already given in the arrest: "again"
    expect(perform(sc, perform(sc, untilArrest(), 'calcium-chloride'), 'med-control').log.at(-1)!.text).toMatch(/calcium chloride 1 g IV\/IO push again/);
  });

  it('a call back with a pulse answers for what has been given: a repeat calcium only if the changes persist, none past the third dose', () => {
    const once = run(['primary', 'monitor', 'ecg12', 'iv', 'calcium-chloride', 'med-control']).log.at(-1)!.text;
    expect(once).toMatch(/calcium chloride 1 g again in 5–10 minutes if the changes persist; high-dose albuterol;/);
    expect(once).not.toMatch(/\bnow\b/);
    const all = run(['primary', 'monitor', 'ecg12', 'iv', 'calcium-chloride', 'calcium-chloride', 'calcium-chloride', 'albuterol-hyperk', 'transport-pci', 'med-control']);
    expect(all.log.at(-1)!.text).toMatch(/no more calcium from you.*keep the high-dose albuterol running.*Keep going to the regional heart center: they can dialyze him\.$/);
  });

  it('in the arrest: the hint names CPR first; the nebulizer cannot be given; atropine is penalized', () => {
    const s = untilArrest();
    expect(takeHint(sc, s).log.at(-1)!.text).toMatch(/^Hint: Cardiac arrest: CPR at once/);
    const neb = perform(sc, s, 'albuterol-hyperk');
    expect(neb.counts['albuterol-hyperk']).toBeUndefined();
    expect(neb.minute).toBe(s.minute);
    expect(penalties(perform(sc, s, 'atropine'))).toEqual(['atropine-arrest']);
  });
});

describe('hyperkalemia in a dialysis patient — the traps', () => {
  it('atropine does nothing but costs nothing (the bradycardia algorithm\'s first drug); the ACLS order with calcium next still scores well', () => {
    const s = run(['monitor', 'pads', 'iv', 'atropine']);
    expect(s.rhythm).toEqual({ profile: 'hyperkalemia', hr: 36 });
    expect(s.log.at(-1)!.text).toBe('No change: heart rate 36.');
    expect(penalties(s)).toEqual([]);
    const acls = run(['primary', 'monitor', 'ecg12', 'pads', 'iv', 'atropine', 'calcium-chloride', 'sample', 'nibp', 'albuterol-hyperk', 'notify', 'transport-pci', UNTIL_ARRIVED, 'handoff']);
    expect(review(sc, acls)).toMatchObject({ percent: 100, penaltyPoints: 0 });
  });

  it('pacing before calcium fails and is switched off; it costs 3 points only once a line is in to give the calcium through', () => {
    let s = run(['monitor', 'pads', 'iv', 'pace']);
    expect(s.rhythm).toEqual({ profile: 'hyperkalemia', hr: 36 });
    expect(s.log.some((l) => /no beat follows a spike.*Pacer off/.test(l.text))).toBe(true);
    expect(s.vitals.pain).toBe(0);
    expect(s.penalties).toEqual([expect.objectContaining({ id: 'pace-before-calcium', points: 3, severity: 'minor' })]);
    s = perform(sc, perform(sc, s, 'atropine'), 'calcium-chloride');
    expect(penalties(s)).toEqual(['pace-before-calcium']);
    // tried while the IV is still going in, it is a fair bridge: no penalty, just no capture
    const bridge = run(['monitor', 'pads', 'pace', 'iv']);
    expect(penalties(bridge)).toEqual([]);
    expect(bridge.flags['pace-failed']).toBeDefined();
  });

  it('pacing still puts the pads on; after calcium atropine is no mistake, and pacing a rate of 54 is the built-in one', () => {
    expect(review(sc, stop(run(['monitor', 'iv', 'pace']))).toFix.some((t) => t.kind === 'missed' && /^Pads on/.test(t.label))).toBe(false);
    const s = run(['monitor', 'pads', 'iv', 'calcium-chloride', 'atropine']);
    expect(penalties(s)).toEqual([]);
    expect(s.rhythm.hr).toBe(54);
    const paced = perform(sc, s, 'pace');
    expect(penalties(paced)).toEqual(['pace-not-slow']);
    expect(paced.rhythm).toEqual({ profile: 'hyperkalemia', hr: 54 });
  });

  it('lidocaine, amiodarone or procainamide for the wide complexes: the rate falls, one critical penalty each', () => {
    for (const drug of ['lidocaine', 'amio-infusion', 'amio-arrest', 'procainamide']) {
      const s = run(['monitor', 'iv', drug]);
      expect(s.rhythm, drug).toEqual({ profile: 'hyperkalemia', hr: 30 });
      expect(s.vitals.sbp, drug).toBe(58);
      expect(s.penalties, drug).toEqual([expect.objectContaining({ id: 'antiarrhythmic-wide', severity: 'critical', points: 15 })]);
    }
  });

  it('without calcium, the suppressed rhythm stops within minutes; calcium after it brings him back', () => {
    const s = run(['monitor', 'iv', 'lidocaine']);
    const arrested = perform(sc, s, 'reassess');
    expect(arrested.pulse).toBe(false);
    expect(arrested.rhythm.profile).toBe('pea');
    const rescued = perform(sc, s, 'calcium-chloride');
    expect(rescued.rhythm).toEqual({ profile: 'hyperkalemia', hr: 54 });
    let later = rescued;
    for (let i = 0; i < 5; i++) later = perform(sc, later, 'reassess');
    expect(later.pulse).toBe(true);
    // after calcium it still slows him, and still costs
    const afterCa = run(['monitor', 'iv', 'calcium-chloride', 'lidocaine']);
    expect(afterCa.rhythm.hr).toBe(40);
    expect(penalties(afterCa)).toEqual(['antiarrhythmic-wide']);
  });

  it('a beta-blocker or calcium-channel blocker deepens it (BRASH); adenosine is a pause', () => {
    for (const drug of ['metoprolol', 'diltiazem']) {
      const s = run(['monitor', 'iv', drug]);
      expect(s.rhythm.hr, drug).toBe(30);
      expect(penalties(s), drug).toEqual(['av-blocker']);
    }
    const a = run(['monitor', 'iv', 'adenosine6']);
    expect(a.rhythm).toEqual({ profile: 'hyperkalemia', hr: 36 });
    expect(a.log.some((l) => l.who === 'monitor' && /^6 seconds with no complexes/.test(l.text))).toBe(true);
    expect(penalties(a)).toEqual(['adenosine-slow']);
  });

  it('one small bolus is no mistake; a second is, and wets the lungs', () => {
    let s = run(['monitor', 'iv', 'fluid']);
    expect(penalties(s)).toEqual([]);
    expect([s.vitals.sbp, s.vitals.dbp, s.vitals.spo2]).toEqual([82, 46, 92]);
    s = perform(sc, s, 'fluid');
    expect(penalties(s)).toEqual(['fluid-overload']);
    expect(s.vitals.spo2).toBe(90);
    expect(perform(sc, s, 'lungs').log.at(-1)!.text).toMatch(/third of the way up/);
  });

  it('a vagal maneuver slows him for a moment and costs 3; a STEMI alert is stood down and costs 3 (blocked, and free, without a 12-lead)', () => {
    const v = run(['monitor', 'vagal']);
    expect(v.log.at(-1)).toMatchObject({ who: 'monitor', text: 'Heart rate 28 for a few seconds, then back to 36.' });
    expect(v.rhythm.hr).toBe(36);
    expect(v.penalties).toEqual([expect.objectContaining({ id: 'vagal-slow', points: 3, severity: 'minor' })]);

    const blocked = run(['monitor', 'stemi-alert']);
    expect(blocked.counts['stemi-alert']).toBeUndefined();
    expect(blocked.penalties).toEqual([]);
    const alert = run(['monitor', 'ecg12', 'stemi-alert']);
    expect(alert.log.at(-1)!.text).toMatch(/no ST elevation .* standing the team down/);
    expect(alert.penalties).toEqual([expect.objectContaining({ id: 'false-alert', points: 3, severity: 'minor' })]);
  });

  it('fentanyl or sedation for a man with no pain costs 3; for a pacer that has captured and hurts, it is right', () => {
    expect(run(['monitor', 'iv', 'fentanyl']).penalties).toEqual([expect.objectContaining({ id: 'sedation-no-pain', points: 3, severity: 'minor' })]);
    expect(penalties(run(['monitor', 'iv', 'sedation']))).toEqual(['sedation-no-pain']);
    let s = run(['monitor', 'iv', 'calcium-chloride']);
    while (!s.fired.includes('calcium-fades')) s = perform(sc, s, 'reassess');
    s = perform(sc, perform(sc, s, 'pace'), 'fentanyl');
    expect(penalties(s)).toEqual([]);
  });

  it('an epinephrine infusion started after lidocaine holds him longer: no arrest 2 minutes later (still one on time without calcium)', () => {
    let s = run(['monitor', 'iv', 'lidocaine', 'pressor']);
    expect(s.rhythm).toEqual({ profile: 'hyperkalemia', hr: 46 });
    s = perform(sc, s, 'reassess');
    expect(s.pulse).toBe(true);
    while (s.pulse && s.minute < 30) s = perform(sc, s, 'reassess');
    expect(s.flags.arrest).toBeGreaterThanOrEqual(20);
  });

  it('once calcium has worn off a pacer can take over a rate under 50, and the 12-lead read is the paced rhythm, explained as such', () => {
    let s = run(['monitor', 'iv', 'calcium-chloride']);
    while (!s.fired.includes('calcium-fades')) s = perform(sc, s, 'reassess');
    s = perform(sc, s, 'pace');
    expect(s.rhythm).toEqual({ profile: 'tcp', hr: 70 });
    s = run(['monitor', 'iv', 'calcium-chloride', ...R(16), 'pace', 'ecg12'], 'manual');
    expect(s.pendingRead).toMatchObject({ answer: 'tcp', explain: expect.stringMatching(/^Paced rhythm at 70: a pacing spike before every wide QRS/) });
  });

  it('CPAP with a pressure under 90 drops it further; magnesium is penalized once, in or out of arrest', () => {
    const c = run(['cpap']);
    expect(penalties(c)).toEqual(['cpap-shock']);
    expect(c.vitals.sbp).toBeLessThan(78);
    expect(penalties(run(['monitor', 'iv', 'magnesium-sulfate']))).toEqual(['magnesium-renal']);
    expect(penalties(perform(sc, untilArrest(), 'magnesium-sulfate'))).toEqual(['magnesium-renal']);
  });

  it('the nearest emergency department cannot dialyze him; without an early call the team is not ready', () => {
    const near = run(replace(IDEAL, 'transport-pci', ['transport-near']));
    expect(penalties(near)).toEqual(['no-dialysis']);
    expect(near.fired).toContain('arrive-near');
    expect(near.log.some((l) => l.who === 'hospital' && /no dialysis/.test(l.text))).toBe(true);
    expect(review(sc, near).toFix.some((t) => t.kind === 'missed' && /^Transport to the hospital that can dialyze/.test(t.label))).toBe(true);

    const noCall = run(IDEAL.filter((id) => id !== 'notify'));
    expect(noCall.log.some((l) => /Nobody here knew he was coming/.test(l.text))).toBe(true);
    expect(review(sc, noCall).toFix.some((t) => t.kind === 'missed' && /^Early call/.test(t.label))).toBe(true);

    // a call made from the road, after 15 minutes, still counts — at half marks
    const late = run([...IDEAL.slice(0, IDEAL.indexOf('notify')), 'transport-pci', 'reassess', 'reassess', 'notify', UNTIL_ARRIVED, 'handoff']);
    expect(review(sc, late).toFix.find((t) => /^Early call/.test(t.label))?.kind).toBe('late');
  });
});

describe('hyperkalemia in a dialysis patient — teaching', () => {
  it('teaches current practice', () => {
    const text = sc.teaching.join(' ');
    expect(text).toMatch(/calcium chloride 1 g \(10 mL of 10 %\)/);
    expect(text).toMatch(/calcium gluconate 3 g/);
    expect(text).toMatch(/lasts 30–60 minutes and lowers no potassium/);
    expect(text).toMatch(/albuterol 10–20 mg/);
    expect(text).toMatch(/precipitate/);
    expect(text).toMatch(/fistula/);
    expect(text).toMatch(/not well established \(2025 AHA\)/);
    expect(text).toMatch(/BRASH/);
    // binders remove potassium too, only slowly: dialysis is the only fast way
    expect(text).toMatch(/dialysis is the only fast way to remove the potassium \(binders take hours\)/);
    expect(text).not.toMatch(/Only dialysis removes/);
    // atropine is the algorithm's first drug: it may be tried, it rarely works here
    expect(text).toMatch(/Atropine may be tried but rarely helps/);
    // the 2025 AHA finds no added benefit for beta-agonists in a hyperkalemic arrest; it is worded as such
    expect(text).toMatch(/no evidence that albuterol adds anything during the arrest/);
    expect(text).toMatch(/MAP at 65 or more/);
  });

  it('counts the days without dialysis right: last session Monday, Wednesday and Friday missed', () => {
    expect(sc.facts.sample).toMatch(/Monday, Wednesday and Friday .* missed Wednesday and yesterday/);
    expect(sc.critical.find((c) => c.id === 'history')!.why).toMatch(/five days since his last dialysis, on Monday/);
  });
});
