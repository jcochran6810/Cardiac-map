/**
 * Unstable atrial fibrillation in the emergency department (setting 'ed'): the ER nurse (6) and the ER doctor (7). The case
 * is imported straight from its file — it is registered in scenarios/index.ts separately.
 */
import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '@/data/content';
import { resolveProfile } from '@/lib/ecg/profiles';
import { answerRead, criticalsFor, perform, review, start, stop } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { edUnstableAf as sc } from '@/lib/sim/scenario/scenarios/edUnstableAf';
import type { SimState, Speaker } from '@/lib/sim/scenario/types';
import type { LearningLevel } from '@/store/useAppStore';
import { runScenario as run } from './helpers';

const R = (n: number) => Array<string>(n).fill('reassess');
const ids = (s: SimState) => s.penalties.map((p) => p.id);
const last = (s: SimState) => s.log.at(-1)!;
const said = (s: SimState, who: Speaker, text: RegExp) => s.log.some((l) => l.who === who && text.test(l.text));
const missed = (s: SimState) => review(sc, stop(s)).toFix.filter((t) => t.kind === 'missed').map((t) => t.label);
/** Reassess until an event has fired (or 30 times), reading any 12-lead a teammate records on the way */
function until(s: SimState, event: string): SimState {
  for (let i = 0; i < 30 && !s.fired.includes(event) && !s.ended; i++) {
    while (s.pendingRead) s = answerRead(sc, s, s.pendingRead.answer);
    s = perform(sc, s, 'reassess');
  }
  while (s.pendingRead) s = answerRead(sc, s, s.pendingRead.answer);
  return s;
}
/** The doctor's run until the nurse has a line in (her drugs go IV) */
const MD_LINE = ['ems-handoff', 'sample'];

/** A correct run for each role */
const IDEAL: Record<6 | 7, string[]> = {
  // the nurse: the crew's report, the physician called at once, pads, a quick stroke screen, the 12-lead, the line and the
  // labs; capnography and the airway kit before the physician sedates; both shocks on the physician's count (SYNC armed
  // again for the second); a pressure and the result reported; heparin on the order; the repeat 12-lead; magnesium on the
  // order; her medicines; the hand-off once the physician has admitted her
  6: ['ems-handoff', 'notify-physician', 'pads', 'neuro', 'ecg12', 'iv', 'labs', 'capno', 'bvm', 'cardiovert', 'cardiovert', 'nibp',
    'notify-physician', 'heparin', 'ecg12-repeat', 'magnesium-sulfate', 'sample', 'handoff'],
  // the doctor: the report, the history and the stroke screen while the nurse gets the line and the 12-lead; the labs;
  // etomidate sized for the pressure; 200 J, then SYNC armed again at 360 J; heparin; a chest film; magnesium; admit
  7: ['ems-handoff', 'sample', 'neuro', 'labs', 'procedural-sedation', 'cardiovert', 'cardiovert', 'heparin', 'cxr', 'magnesium-sulfate', 'admit', 'handoff'],
};
const ROLES = [6, 7] as const;
/** Each role up to the first synchronized shock */
const NURSE_TO_SHOCK = ['ems-handoff', 'notify-physician', 'pads', 'neuro', 'ecg12', 'iv', 'labs', 'capno', 'bvm', 'cardiovert'];
const DOCTOR_TO_SHOCK = ['ems-handoff', 'sample', 'neuro', 'labs', 'procedural-sedation', 'cardiovert'];

const NOT_IN_ED: Speaker[] = ['operator', 'dispatch', 'scene', 'partner'];
const giveaway = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture|\bAF\b|a-?fib/i;
const BRITISH = /haem|aemia|ischaem|oedem|synchronis|equalis|hyperaem|centre|levell|manoeuvre|nebulis|analyse\b|analyser|organis|colour|\bgrey|litres|metres|optimis|minimis|catheteris|heparinis|recognis|anaesth|favour|behaviour/i;
/** The learner's own lines (the action labels name doses for every rhythm), the feedback after a read and the system are not the case talking */
const QUIET: Speaker[] = ['you', 'feedback', 'system'];

function expectFullMarks(s: SimState) {
  expect(s.ended?.reason).toBe('complete');
  expect(s.pulse).toBe(true);
  const r = review(sc, s);
  expect(r.toFix).toEqual([]);
  expect(r.penaltyPoints).toBe(0);
  expect(r.percent).toBe(100);
  expect(r.grade).toBe('Excellent');
  expect(r.outcome).toMatch(/^Every critical intervention done in \d+:\d\d\.$/);
  for (const t of r.timings) if (t.met !== null) expect(t.met, t.label).toBe(true);
}

/** Runs that reach the case's other paths: what the monitor and the voices say there is checked too */
const OTHER_RUNS: [LearningLevel, string[]][] = [
  [7, ['ems-handoff', 'defib', 'defib', ...R(3), 'heparin']],
  [7, ['ems-handoff', 'sample', 'diltiazem', 'metoprolol', 'adenosine6', 'atropine', 'fluid', 'pressor', 'calcium-chloride', 'amio-infusion', ...R(8)]],
  [7, ['ems-handoff', 'cardiovert', 'midazolam', 'cardiovert', 'consult-cardiology', 'pocus', ...R(4), 'consult-cardiology', 'pocus']],
  [6, [...NURSE_TO_SHOCK, 'defib', 'defib', ...R(4)]],
  [6, ['ems-handoff', 'cardiovert', ...R(2), 'iv', ...R(6)]],
  [6, ['ems-handoff', 'notify-physician', 'pads', 'iv', ...R(8)]],
  // a nurse who does nothing, an early unsynchronized shock with the report in the arrest, the doctor's history in and after it
  [6, R(15)],
  [6, ['ems-handoff', 'pads', 'defib', 'notify-physician', 'defib', ...R(1), 'opqrst', 'neuro']],
  [7, ['ems-handoff', 'defib', 'consult-cardiology', 'defib', 'opqrst', 'neuro', 'admit', ...R(2), 'handoff']],
];

describe('unstable atrial fibrillation in the ED: the case itself', () => {
  it('is an emergency department case for the ER nurse and the ER doctor, and refers only to things that exist', () => {
    expect(sc.id).toBe('unstable-af-cardioversion-ed');
    expect(sc.setting).toBe('ed');
    expect(sc.roles).toEqual([6, 7]);
    expect(CONDITIONS[sc.conditionId!]).toBeDefined();
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe('atrial-fibrillation');
    for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `respond ${id}`).toBeDefined();
    for (const h of sc.harms) for (const id of h.actions) expect(INTERVENTION_BY_ID[id], `harm ${h.id}: ${id}`).toBeDefined();
    for (const t of sc.timings ?? []) for (const id of t.actions) expect(INTERVENTION_BY_ID[id], `timing ${id}`).toBeDefined();
    for (const role of ROLES) {
      expect(sc.briefing[role], `briefing ${role}`).toBeDefined();
      const scope = new Set(interventionsFor(role, 'ed').map((i) => i.id));
      for (const c of criticalsFor(sc, role)) {
        const ways = Array.isArray(c.done) ? c.done : c.uses ?? [];
        expect(ways.some((id) => scope.has(id)), `${role}: ${c.id}`).toBe(true);
      }
      // each harm a role can commit is in that role's scope
      for (const h of sc.harms.filter((x) => !x.roles || x.roles.includes(role))) {
        expect(h.actions.some((id) => scope.has(id)), `${role}: ${h.id}`).toBe(true);
      }
    }
  });

  it('gives every role its own part: the nurse\'s items are nursing, the doctor\'s are decisions and procedures', () => {
    const nurse = criticalsFor(sc, 6).map((c) => c.id);
    const doctor = criticalsFor(sc, 7).map((c) => c.id);
    expect(nurse).toEqual(expect.arrayContaining(['rn-call', 'rn-pads', 'rn-prep', 'rn-shock1', 'rn-shock2', 'rn-report', 'ask-heparin', 'ask-magnesium']));
    expect(doctor).toEqual(expect.arrayContaining(['md-sedation', 'md-cardiovert', 'md-heparin', 'md-labs', 'md-admit']));
    // the nurse never sedates, never decides on anticoagulation and never admits
    const nurseScope = new Set(interventionsFor(6, 'ed').map((i) => i.id));
    for (const id of ['procedural-sedation', 'admit', 'consult-cardiology', 'pocus']) expect(nurseScope.has(id), id).toBe(false);
  });

  for (const role of ROLES) {
    it(`role ${role}: the ideal run ends by itself with full marks`, () => {
      expectFullMarks(run(sc, role, IDEAL[role]));
    });
  }

  it('the ideal runs read the 12-lead before the shock and after it', () => {
    for (const role of ROLES) {
      const s = run(sc, role, IDEAL[role]);
      expect(s.reads.map((r) => r.answer), `${role}`).toEqual(['afib', 'nsr']);
    }
  });

  it('never names the rhythm or the diagnosis on the monitor or in a teammate\'s words, speaks only with the ED\'s voices, and spells it the US way', () => {
    for (const line of Object.values(sc.briefing).flat()) {
      expect(NOT_IN_ED).not.toContain(line[0]);
      expect(line[1]).not.toMatch(giveaway);
    }
    const runs: [LearningLevel, string[]][] = [[6, IDEAL[6]], [7, IDEAL[7]], ...OTHER_RUNS];
    for (const [role, steps] of runs) {
      const s = run(sc, role, steps);
      for (const l of s.log) {
        expect(NOT_IN_ED, `${role}: ${l.who} "${l.text}"`).not.toContain(l.who);
        if (!QUIET.includes(l.who)) expect(l.text, `${role}: ${l.who}`).not.toMatch(giveaway);
        expect(l.text).not.toMatch(BRITISH);
      }
    }
    const words = [sc.title, sc.summary, ...sc.teaching, ...sc.critical.flatMap((c) => [c.label, c.why]), ...sc.harms.map((h) => h.text)];
    for (const w of words) expect(w).not.toMatch(BRITISH);
    // the picker does not name the rhythm either
    expect(`${sc.title} ${sc.summary}`).not.toMatch(giveaway);
  });

  it('every rhythm the case reaches is a real ECG profile', () => {
    const runs: [LearningLevel, string[]][] = [[6, IDEAL[6]], [7, IDEAL[7]], ...OTHER_RUNS];
    for (const [role, steps] of runs) {
      run(sc, role, steps, (s) => expect(resolveProfile(s.rhythm.profile).id, s.rhythm.profile).toBe(s.rhythm.profile));
    }
  });
});

describe('the shocks', () => {
  it('the first synchronized shock at 200 J does not hold; the second, with SYNC armed again at 360 J, restores a regular rhythm and the pressure', () => {
    let s = run(sc, 7, DOCTOR_TO_SHOCK);
    expect(s.rhythm).toEqual({ profile: 'atrial-fibrillation', hr: 168 });
    expect(said(s, 'monitor', /^Synchronized shock delivered: 200 J\. .*the same fast, irregular complexes at 168\.$/)).toBe(true);
    expect(said(s, 'nurse', /^SYNC on: a marker sits on every R wave/)).toBe(true);
    s = perform(sc, s, 'cardiovert');
    expect(s.rhythm).toEqual({ profile: 'normal-sinus', hr: 94 });
    expect(said(s, 'nurse', /^SYNC armed again .* 360 J/)).toBe(true);
    expect(last(s)).toMatchObject({ who: 'monitor', text: 'Synchronized shock delivered: 360 J. A pause — then a regular rhythm at 94. BP 98/60.' });
    expect(s.penalties).toEqual([]);
    // with a normal rate the stiff ventricle fills again: the pressure comes up over the next minutes
    s = until(s, 'recovers');
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([112, 68]);
  });

  it('in the nurse\'s run the nurse arms SYNC and shocks on the physician\'s count; the second order says nothing about SYNC', () => {
    const s = run(sc, 6, NURSE_TO_SHOCK);
    expect(said(s, 'physician', /SYNC on, check the markers sit on the R waves — 200 joules/)).toBe(true);
    const order2 = s.log.find((l) => l.who === 'physician' && /360 joules/.test(l.text))!;
    expect(order2.text).not.toMatch(/SYNC/);
    expect(s.flags['asked-shock2']).toBe(s.minute);
    const after = perform(sc, s, 'cardiovert');
    expect(after.rhythm.profile).toBe('normal-sinus');
    expect(said(after, 'you', /^SYNC armed again/)).toBe(true);
    expect(after.penalties).toEqual([]);
  });

  it('the physician delivers a shock the nurse does not, and the nurse loses those items', () => {
    let s = run(sc, 6, NURSE_TO_SHOCK.slice(0, -1));
    expect(s.flags['asked-shock1']).toBeDefined();
    s = perform(sc, s, 'reassess');
    expect(said(s, 'physician', /^I will deliver it myself\./)).toBe(true);
    expect(s.flags['shock1-failed']).toBeDefined();
    s = until(s, 'md-shock2-fallback');
    expect(s.rhythm.profile).toBe('normal-sinus');
    expect(s.flags['you-converted']).toBeUndefined();
    expect(missed(s)).toEqual(expect.arrayContaining([
      'On the physician\'s count: SYNC on, markers on the R waves, 200 J — shock',
      'Shock again: SYNC armed again first, at the higher energy',
    ]));
  });

  it('trap: an unsynchronized shock lands on a T wave — VF, one critical penalty; the next shock brings her back, but the cardioversion item is lost', () => {
    let s = run(sc, 7, ['ems-handoff', 'defib']);
    expect(s.pulse).toBe(false);
    expect(s.rhythm.profile).toBe('vf');
    expect(ids(s)).toEqual(['unsync-shock']);
    expect(s.penalties[0]).toMatchObject({ severity: 'critical', points: 15 });
    expect(said(s, 'nurse', /cannot feel a pulse/)).toBe(true);
    s = perform(sc, s, 'defib');
    expect(s.pulse).toBe(true);
    expect(s.rhythm).toEqual({ profile: 'sinus-tachycardia', hr: 104 });
    expect(ids(s)).toEqual(['unsync-shock']);
    const left = missed(s);
    expect(left).toContain('Unstable: synchronized cardioversion — 200 J, more energy if the first fails');
    expect(left).not.toContain('No pulse: defibrillate within 2 minutes');
    // she comes round over a few minutes
    s = until(s, 'rosc-wakes');
    expect(s.vitals.gcs).toBe(14);
  });

  it('trap: a second shock without SYNC armed again (the nurse): VF and a critical penalty; the physician calls for the shock that is right now', () => {
    let s = run(sc, 6, [...NURSE_TO_SHOCK, 'defib']);
    expect(s.pulse).toBe(false);
    expect(ids(s)).toEqual(['sync-not-rearmed']);
    expect(said(s, 'monitor', /dropped out of SYNC after the last shock/)).toBe(true);
    expect(said(s, 'physician', /lost her pulse — charge and shock her now, unsynchronized/)).toBe(true);
    s = perform(sc, s, 'defib');
    expect(s.pulse).toBe(true);
    expect(ids(s)).toEqual(['sync-not-rearmed']);
    expect(missed(s)).toContain('Shock again: SYNC armed again first, at the higher energy');
    // the anticoagulation order still follows the restored rhythm
    expect(s.flags['asked-heparin']).toBeDefined();
  });

  it('left in VF, the physician shocks her after 2 minutes in the nurse\'s run — the arrest item is lost', () => {
    let s = run(sc, 6, [...NURSE_TO_SHOCK, 'defib']);
    s = perform(sc, s, 'reassess');
    expect(s.pulse).toBe(true);
    expect(said(s, 'physician', /^I am shocking her\./)).toBe(true);
    expect(missed(s)).toContain('No pulse: defibrillate within 2 minutes');
  });

  it('trap: a shock without sedation — she feels it; the doctor and the nurse are both penalized, the nurse also for shocking with no physician', () => {
    const md = run(sc, 7, ['ems-handoff', 'cardiovert']);
    expect(ids(md)).toEqual(['no-sedation']);
    expect(said(md, 'patient', /AAGH/)).toBe(true);
    expect(missed(md)).toContain('Procedural sedation sized for her pressure, before the shock');
    let rn = run(sc, 6, ['ems-handoff', 'cardiovert']);
    expect(ids(rn).sort()).toEqual(['no-sedation', 'rn-shock-without-physician']);
    // the physician arrives, sedates her once the set-up is ready, and goes straight to the higher energy
    rn = run(sc, 6, ['ems-handoff', 'cardiovert', 'pads', 'iv', 'capno', 'bvm']);
    expect(said(rn, 'physician', /That last shock did not hold: go up to 360 joules/)).toBe(true);
    expect(rn.flags['asked-shock1']).toBeUndefined();
  });

  it('the sedation wears off: a shock after it has gone is a shock without sedation', () => {
    let s = run(sc, 7, [...DOCTOR_TO_SHOCK, 'heparin', 'cxr', 'pocus']);
    // the delay has made her worse too: she wakes drowsier than she was
    expect(s.fired).toEqual(expect.arrayContaining(['wakes', 'worse']));
    expect(s.vitals.gcs).toBe(12);
    s = perform(sc, s, 'cardiovert');
    expect(ids(s)).toEqual(['no-sedation']);
    // titrated midazolam sedates her again (etomidate is one dose in this simulator)
    let again = run(sc, 7, [...DOCTOR_TO_SHOCK, 'heparin', 'cxr', 'pocus', 'midazolam', 'cardiovert']);
    expect(again.penalties).toEqual([]);
    expect(again.rhythm.profile).toBe('normal-sinus');
    again = until(again, 'wakes-again');
    expect(again.vitals.gcs).toBe(15);
  });
});

describe('the traps around the shock', () => {
  it('trap: diltiazem into a pressure of 78 — the rate barely slows, the pressure falls; a critical error (the nurse is also out of scope)', () => {
    const md = run(sc, 7, [...MD_LINE, 'diltiazem']);
    expect(ids(md)).toEqual(['diltiazem-unstable']);
    expect(md.penalties[0].severity).toBe('critical');
    expect(md.rhythm).toEqual({ profile: 'atrial-fibrillation', hr: 150 });
    expect([md.vitals.sbp, md.vitals.dbp]).toEqual([64, 40]);
    expect(said(md, 'monitor', /^Heart rate 150, but BP falls to 64\/40\.$/)).toBe(true);
    const rn = run(sc, 6, ['ems-handoff', 'iv', 'diltiazem']);
    expect(ids(rn).sort()).toEqual(['diltiazem-unstable', 'rn-without-order-diltiazem']);
  });

  it('trap: IV metoprolol into a pressure of 78 — the same', () => {
    const md = run(sc, 7, [...MD_LINE, 'metoprolol']);
    expect(ids(md)).toEqual(['metoprolol-unstable']);
    expect(md.vitals.sbp).toBe(66);
    const rn = run(sc, 6, ['ems-handoff', 'iv', 'metoprolol']);
    expect(ids(rn).sort()).toEqual(['metoprolol-unstable', 'rn-without-order-metoprolol']);
  });

  it('calcium after diltiazem gives back part of the pressure, and the built-in rule spares it', () => {
    const s = run(sc, 7, [...MD_LINE, 'diltiazem', 'calcium-chloride']);
    expect(ids(s)).toEqual(['diltiazem-unstable']);
    expect(s.vitals.sbp).toBe(76);
  });

  it('amiodarone instead of the shock is penalized; after a failed shock it is fair', () => {
    const before = run(sc, 7, [...MD_LINE, 'amio-infusion']);
    expect(ids(before)).toEqual(['amiodarone-before-shock']);
    expect(before.vitals.sbp).toBeLessThan(78);
    const after = run(sc, 7, [...DOCTOR_TO_SHOCK, 'amio-infusion', 'cardiovert']);
    expect(after.penalties).toEqual([]);
    expect(after.rhythm.profile).toBe('normal-sinus');
  });

  it('procainamide with a pressure under 90 meets the built-in rule; adenosine only pauses the rhythm', () => {
    expect(ids(run(sc, 7, [...MD_LINE, 'procainamide']))).toEqual(['procainamide-hypotension']);
    const s = run(sc, 7, [...MD_LINE, 'adenosine12']);
    expect(ids(s)).toEqual(['adenosine-irregular']);
    expect(s.rhythm).toEqual({ profile: 'atrial-fibrillation', hr: 170 });
  });

  it('a fluid bolus is no mistake but does not fix the rate; adrenergic drugs and atropine speed it', () => {
    const fluid = run(sc, 7, [...MD_LINE, 'fluid']);
    expect(fluid.penalties).toEqual([]);
    expect(fluid.rhythm.hr).toBe(170);
    expect(fluid.vitals.sbp).toBe(82);
    // a pressor before the shock: her low pressure comes from the rate — cardioversion is owed (2025 AHA)
    const pressor = run(sc, 7, [...MD_LINE, 'pressor']);
    expect(ids(pressor)).toEqual(['pressor-unstable-tachyarrhythmia']);
    expect(pressor.rhythm.hr).toBe(176);
    const atropine = run(sc, 7, [...MD_LINE, 'atropine']);
    expect(ids(atropine)).toEqual(['atropine-fast']);
    expect(atropine.rhythm.hr).toBe(178);
  });

  it('no tube, no CPAP and no antiplatelet for her', () => {
    expect(ids(run(sc, 7, ['ems-handoff', 'cpap']))).toEqual(['cpap-no-indication']);
    expect(ids(run(sc, 7, ['ems-handoff', 'aspirin']))).toEqual(['antiplatelet-no-acs']);
    const rsi = run(sc, 7, ['ems-handoff', ...R(1), 'rsi']);
    expect(ids(rsi)).toEqual(['rsi-no-indication']);
  });

  it('she is too unstable to admit; there is nothing to transfer her for', () => {
    let s = run(sc, 7, ['ems-handoff']);
    s = perform(sc, s, 'admit');
    expect(last(s)).toMatchObject({ who: 'system', text: expect.stringMatching(/^Not yet/) });
    expect(s.flags.dispo).toBeUndefined();
    s = perform(sc, s, 'transfer');
    expect(last(s).text).toMatch(/^Not needed/);
  });

  it('delay matters: left in it she gets worse at 10 minutes and worse again at 18', () => {
    let s = run(sc, 7, ['ems-handoff']);
    s = until(s, 'worse');
    expect([s.vitals.sbp, s.vitals.dbp, s.vitals.gcs]).toEqual([70, 42, 12]);
    s = until(s, 'deepens');
    expect([s.vitals.sbp, s.vitals.dbp, s.vitals.gcs]).toEqual([62, 36, 9]);
    const r = review(sc, stop(s));
    expect(r.timings.find((t) => t.label === 'Door to the first synchronized shock')!.met).toBe(false);
  });
});

describe('after the shock: the stroke risk and the cause', () => {
  it('no anticoagulation is a missed item; heparin given before the shock (it must not delay it) counts and costs nothing', () => {
    const none = run(sc, 7, ['ems-handoff', 'sample', 'neuro', 'labs', 'procedural-sedation', 'cardiovert', 'cardiovert', 'cxr', 'magnesium-sulfate', 'admit', 'handoff']);
    expect(review(sc, none).toFix.filter((t) => t.kind === 'missed').map((t) => t.label)).toEqual(['Anticoagulation: heparin as soon as her rhythm is back']);
    const early = run(sc, 7, ['ems-handoff', 'sample', 'neuro', 'heparin', 'labs', 'procedural-sedation', 'cardiovert', 'cardiovert', 'cxr', 'magnesium-sulfate', 'admit', 'handoff']);
    expectFullMarks(early);
  });

  it('teaches that the stroke risk never delays the shock, and anticoagulation for at least 4 weeks', () => {
    const text = [...sc.teaching, ...sc.critical.map((c) => c.why)].join(' ');
    expect(text).toMatch(/never delays? the shock/);
    expect(text).toMatch(/at least 4 weeks/);
    expect(text).toMatch(/CHA₂DS₂-VASc/);
    expect(text).toMatch(/200 J or more/);
    expect(text).not.toMatch(/120–200 J|50–100 J/);
  });

  it('the labs find low potassium and magnesium (and no bleeding or infection); the physician orders magnesium for the nurse', () => {
    let s = run(sc, 6, IDEAL[6].slice(0, IDEAL[6].indexOf('magnesium-sulfate')));
    expect(said(s, 'hospital', /potassium 3\.2 .* magnesium 1\.4/)).toBe(true);
    expect(said(s, 'physician', /Magnesium sulfate 2 grams IV/)).toBe(true);
    expect(s.flags['ordered:magnesium-sulfate']).toBeDefined();
    s = until(s, 'cbc');
    expect(said(s, 'hospital', /no sign of bleeding or infection/)).toBe(true);
  });

  it('the nurse gives heparin and magnesium only once ordered; given early, each is out of scope', () => {
    const s = run(sc, 6, ['ems-handoff', 'iv', 'heparin', 'magnesium-sulfate']);
    expect(ids(s).sort()).toEqual(['rn-without-order-heparin', 'rn-without-order-magnesium-sulfate']);
  });

  it('the physician gives the heparin if the nurse does not', () => {
    let s = run(sc, 6, IDEAL[6].slice(0, IDEAL[6].indexOf('heparin')));
    s = until(s, 'heparin-fallback');
    expect(said(s, 'physician', /^I will give the heparin myself\./)).toBe(true);
    expect(s.flags.heparin).toBeDefined();
    expect(missed(s)).toContain('Heparin on the physician\'s order, once her rhythm is back');
  });

  it('a stroke screen means nothing during the sedation; awake, it finds no deficit', () => {
    let s = run(sc, 7, ['ems-handoff', 'sample', 'labs', 'procedural-sedation']);
    s = perform(sc, s, 'neuro');
    expect(last(s)).toMatchObject({ who: 'system', text: expect.stringMatching(/asleep from the sedation/) });
    const awake = run(sc, 7, ['ems-handoff', 'neuro']);
    expect(last(awake).text).toMatch(/^GCS 14\. Confused .* no focal deficit\.$/);
  });

  it('the consultant\'s advice follows the patient: shock her now, then anticoagulate and admit', () => {
    let s = run(sc, 7, ['ems-handoff', 'consult-cardiology']);
    expect(said(s, 'consultant', /shock her now, synchronized/)).toBe(true);
    s = run(sc, 7, [...DOCTOR_TO_SHOCK, 'cardiovert', 'consult-cardiology']);
    expect(said(s, 'consultant', /at least 4 weeks after a cardioversion/)).toBe(true);
  });
});

describe('the ER nurse\'s run: the computer physician', () => {
  it('comes to the bedside at the nurse\'s call; uncalled, comes at 4 minutes and asks why — and the call item is lost', () => {
    const called = run(sc, 6, ['ems-handoff', 'notify-physician']);
    expect(called.flags['md-present']).toBe(1.5);
    let s = run(sc, 6, ['ems-handoff', 'pads', 'iv', 'labs']);
    expect(s.flags['md-not-called']).toBeDefined();
    expect(said(s, 'physician', /Why wasn't I called\?/)).toBe(true);
    s = stop(s);
    expect(missed(s)).toContain('Bring the ED physician to the bedside now');
  });

  it('a call for help brings the physician too, and counts as the call', () => {
    const s = run(sc, 6, ['ems-handoff', 'call-help', 'pads', 'iv', ...R(1)]);
    expect(s.flags['md-present']).toBe(1.2);
    expect(s.fired).not.toContain('md-arrives');
    expect(missed(s)).not.toContain('Bring the ED physician to the bedside now');
  });

  it('will not sedate without capnography and the airway kit: asks, then sets them up and the nurse loses the item', () => {
    let s = run(sc, 6, ['ems-handoff', 'notify-physician', 'pads', 'iv']);
    expect(said(s, 'physician', /^Before I sedate her: capnography on/)).toBe(true);
    expect(s.flags['md-sedated']).toBeUndefined();
    s = until(s, 'md-prep-fallback');
    expect(s.flags['md-sedated']).toBeDefined();
    expect(missed(s)).toContain('Before the sedation: capnography on, and the bag-mask, suction and an airway at the head of the bed');
  });

  it('a nurse who sets up before being asked gets the item, and the physician goes straight to the sedation', () => {
    const s = run(sc, 6, ['ems-handoff', 'notify-physician', 'pads', 'capno', 'bvm', 'iv']);
    expect(s.fired).not.toContain('md-prep-ask');
    expect(s.flags['md-sedated']).toBe(s.minute);
  });

  it('midazolam the nurse gives on her own is out of scope, and the physician puts nothing on top of it', () => {
    const s = run(sc, 6, ['ems-handoff', 'notify-physician', 'pads', 'iv', 'midazolam', 'capno', 'bvm']);
    expect(ids(s)).toEqual(['rn-without-order-midazolam']);
    expect(said(s, 'physician', /She has had midazolam already/)).toBe(true);
    expect(said(s, 'physician', /Etomidate/)).toBe(false);
  });

  it('after the conversion asks for a pressure before taking the report, and for a repeat 12-lead if none comes', () => {
    let s = run(sc, 6, [...NURSE_TO_SHOCK, 'cardiovert', 'notify-physician']);
    expect(last(s)).toMatchObject({ who: 'physician', text: expect.stringMatching(/What is her pressure now\?/) });
    expect(s.flags['result-reported']).toBeUndefined();
    s = perform(sc, s, 'nibp');
    s = perform(sc, s, 'notify-physician');
    expect(s.flags['result-reported']).toBeDefined();
    s = run(sc, 6, [...NURSE_TO_SHOCK, 'cardiovert', ...R(3)]);
    expect(said(s, 'physician', /Can I have a repeat 12-lead/)).toBe(true);
  });

  it('decides where she goes once she is converted and anticoagulated: the hand-off waits for it', () => {
    let s = run(sc, 6, [...NURSE_TO_SHOCK, 'cardiovert', 'nibp', 'notify-physician']);
    s = perform(sc, s, 'handoff');
    expect(last(s).who).toBe('system');
    expect(s.ended).toBeNull();
    s = run(sc, 6, [...NURSE_TO_SHOCK, 'cardiovert', 'nibp', 'notify-physician', 'heparin', ...R(2)]);
    expect(s.flags.dispo).toBeDefined();
    expect(said(s, 'physician', /at least 4 weeks after a cardioversion, and lifelong/)).toBe(true);
  });
});

describe('the ER doctor\'s run: the computer nurse', () => {
  it('puts on the monitor and pads, gets the line with capnography and the airway kit ready, and records both 12-leads for the doctor to read', () => {
    let s = run(sc, 7, ['ems-handoff', 'sample', 'neuro']);
    expect(s.flags.pads).toBe(1);
    expect(s.flags.iv).toBe(2);
    expect(s.flags.capno).toBe(2);
    expect(s.flags['airway-ready']).toBe(2);
    expect(s.reads.map((r) => r.answer)).toEqual(['afib']);
    s = run(sc, 7, [...DOCTOR_TO_SHOCK, 'cardiovert', 'heparin', 'reassess']);
    expect(s.reads.map((r) => r.answer)).toEqual(['afib', 'nsr']);
    expect(said(s, 'nurse', /^Repeat 12-lead done/)).toBe(true);
  });

  it('a fair alternative is no mistake: titrated midazolam for the sedation, and the case still ends with full marks', () => {
    // midazolam lasts longer than etomidate: one more reassessment until she is awake enough to leave the department
    const steps = ['ems-handoff', 'neuro', 'sample', 'midazolam', 'cardiovert', 'cardiovert', 'labs', 'heparin', 'pocus', ...R(1), 'magnesium-sulfate', 'admit', ...R(1), 'handoff'];
    const s = run(sc, 7, steps);
    expect(said(s, 'nurse', /^Midazolam 1 mg IV/)).toBe(true);
    expectFullMarks(s);
  });
});

describe('another correct nurse run', () => {
  it('anticipates the set-up, checks her neuro once she is awake, and still ends with full marks', () => {
    const steps = ['ems-handoff', 'notify-physician', 'pads', 'capno', 'bvm', 'ecg12', 'iv', 'cardiovert', 'cardiovert', 'nibp', 'notify-physician', 'labs',
      'heparin', 'ecg12-repeat', 'reassess', 'neuro', 'sample', ...R(1), 'magnesium-sulfate', 'handoff'];
    expectFullMarks(run(sc, 6, steps));
  });
});

describe('scoring', () => {
  it('ends without a hand-off in neither run: the hand-off is the last item', () => {
    for (const role of ROLES) {
      const s = run(sc, role, IDEAL[role].slice(0, -1));
      expect(s.ended, `${role}`).toBeNull();
    }
  });

  it('the start: an unstable patient, on nothing yet', () => {
    const s = start(sc, 6);
    expect(s.pulse).toBe(true);
    expect([s.vitals.sbp, s.vitals.dbp, s.rhythm.hr, s.vitals.gcs]).toEqual([78, 50, 170, 14]);
    expect(s.flags).toEqual({});
  });
});

describe('review fixes: the nurse\'s run never stalls, and the shock items never drop out', () => {
  const SHOCK1 = 'On the physician\'s count: SYNC on, markers on the R waves, 200 J — shock';
  const SHOCK2 = 'Shock again: SYNC armed again first, at the higher energy';

  it('no line: the physician asks for one, then the charge nurse puts it in — and the case goes on to the conversion', () => {
    let s = run(sc, 6, ['ems-handoff', 'notify-physician', 'pads', 'capno', 'bvm']);
    s = until(s, 'md-ready-fallback');
    expect(said(s, 'physician', /^I need a line in — now\./)).toBe(true);
    expect(said(s, 'team', /^The charge nurse gets a line in/)).toBe(true);
    expect(s.flags.iv).toBeDefined();
    s = until(s, 'md-shock2-fallback');
    expect(s.rhythm.profile).toBe('normal-sinus');
    expect(missed(s)).toEqual(expect.arrayContaining(['IV access', SHOCK1, SHOCK2]));
    // the nurse cannot put in a second line on top of it
    s = perform(sc, s, 'iv');
    expect(last(s)).toMatchObject({ who: 'system', text: 'She already has a line in.' });
  });

  it('no pads: the physician asks, then the charge nurse puts them on; the pads item is lost', () => {
    let s = run(sc, 6, ['ems-handoff', 'notify-physician', 'iv', 'capno', 'bvm']);
    s = until(s, 'md-ready-fallback');
    expect(said(s, 'physician', /^I need the pads on her — now\./)).toBe(true);
    expect(s.flags.pads).toBeDefined();
    expect(missed(s)).toContain('Defibrillator pads on at once');
  });

  it('a nurse who does nothing: the physician and the charge nurse convert her, and every nurse item is missed', () => {
    const s = run(sc, 6, R(15));
    expect(s.rhythm.profile).toBe('normal-sinus');
    expect(s.pulse).toBe(true);
    const r = review(sc, stop(s));
    expect(r.percent).toBe(0);
    expect(r.toFix.filter((t) => t.kind === 'missed').map((t) => t.label)).toEqual(expect.arrayContaining([SHOCK1, SHOCK2]));
  });

  it('shocking her twice, awake and without the physician\'s count, loses both shock items — it is no finished case', () => {
    const steps = ['ems-handoff', 'notify-physician', 'pads', 'cardiovert', 'cardiovert', 'neuro', 'ecg12', 'iv', 'labs', 'capno', 'bvm', 'nibp',
      'notify-physician', ...R(1), 'heparin', 'ecg12-repeat', 'sample', ...R(1), 'magnesium-sulfate', 'handoff'];
    const s = run(sc, 6, steps);
    expect(ids(s)).toEqual(['no-sedation']);
    expect(said(s, 'physician', /^Stop — she was awake!/)).toBe(true);
    expect(said(s, 'physician', /^She was awake for that/)).toBe(true);
    const r = review(sc, s);
    expect(r.toFix.filter((t) => t.kind === 'missed').map((t) => t.label)).toEqual(expect.arrayContaining([SHOCK1, SHOCK2]));
    expect(r.outcome).not.toMatch(/^Every critical intervention/);
    expect(r.percent).toBeLessThan(75);
  });

  it('a set-up started the minute the physician gave up waiting and sedated her does not count', () => {
    const s = run(sc, 6, ['ems-handoff', 'triage', 'monitor', 'notify-physician', 'pads', 'iv', 'labs', 'ecg12', 'capno', 'bvm']);
    expect(said(s, 'physician', /I will set it up myself/)).toBe(true);
    expect(missed(s)).toContain('Before the sedation: capnography on, and the bag-mask, suction and an airway at the head of the bed');
  });
});

describe('review fixes: no second dose after the physician has given it', () => {
  it('heparin: blocked once the physician has given it', () => {
    let s = run(sc, 6, IDEAL[6].slice(0, IDEAL[6].indexOf('heparin')));
    s = until(s, 'heparin-fallback');
    s = perform(sc, s, 'heparin');
    expect(last(s)).toMatchObject({ who: 'system', text: expect.stringMatching(/^Heparin is already running/) });
    expect(s.counts.heparin).toBeUndefined();
  });

  it('magnesium: blocked once the physician has hung it; the item is lost', () => {
    let s = run(sc, 6, IDEAL[6].slice(0, IDEAL[6].indexOf('magnesium-sulfate')));
    s = until(s, 'magnesium-fallback');
    expect(said(s, 'physician', /^I will hang the magnesium myself\./)).toBe(true);
    s = perform(sc, s, 'magnesium-sulfate');
    expect(last(s)).toMatchObject({ who: 'system', text: expect.stringMatching(/^The magnesium is already running/) });
    expect(s.counts['magnesium-sulfate']).toBeUndefined();
    expect(missed(s)).toContain('Magnesium on the physician\'s order');
  });

  it('heparin and magnesium given before the order: one penalty each, no order for a drug already running, and the physician says so', () => {
    const steps = ['ems-handoff', 'notify-physician', 'pads', 'iv', 'capno', 'bvm', 'cardiovert', 'cardiovert', 'nibp', 'notify-physician', 'heparin',
      'ecg12', 'labs', 'neuro', 'sample', 'magnesium-sulfate', ...R(2), 'handoff'];
    const s = run(sc, 6, steps);
    expect(ids(s).sort()).toEqual(['rn-without-order-heparin', 'rn-without-order-magnesium-sulfate']);
    expect(said(s, 'physician', /^That went in before I ordered it/)).toBe(true);
    expect(said(s, 'physician', /heparin, please/)).toBe(false);
    expect(said(s, 'physician', /Magnesium sulfate 2 grams IV/)).toBe(false);
    expect(s.counts.heparin).toBe(1);
    // the orders never came, so they are not missed items as well: the hand-off follows the physician's admission
    expect(s.ended?.reason).toBe('complete');
    expect(review(sc, s).toFix.filter((t) => t.kind === 'missed')).toEqual([]);
  });

  it('the magnesium order waits for the conversion, and the heparin order claims no blood work that was not drawn', () => {
    let s = run(sc, 6, ['ems-handoff', 'notify-physician', 'pads', 'iv', 'labs']);
    s = until(s, 'lytes');
    expect(s.rhythm.profile).toBe('atrial-fibrillation');
    expect(s.flags['asked-magnesium']).toBeUndefined();
    s = until(s, 'magnesium-ask');
    expect(s.flags.converted).toBeDefined();
    const noLabs = run(sc, 6, ['ems-handoff', 'notify-physician', 'pads', 'iv', 'capno', 'bvm', 'cardiovert', 'cardiovert', ...R(2)]);
    expect(noLabs.flags.labs).toBeUndefined();
    const order = noLabs.log.find((l) => l.who === 'physician' && /heparin, please/.test(l.text))!;
    expect(order.text).not.toMatch(/blood/);
  });

  it('no potassium before the potassium is known', () => {
    const s = run(sc, 7, [...DOCTOR_TO_SHOCK, 'cardiovert', 'magnesium-sulfate']);
    expect(s.flags['lytes-known']).toBeUndefined();
    expect(said(s, 'nurse', /^Magnesium sulfate 2 g IV running over 15 minutes\.$/)).toBe(true);
    expect(s.log.some((l) => /potassium/i.test(l.text) && l.who === 'nurse')).toBe(false);
  });
});

describe('review fixes: she leaves the department awake, and answers only when she can', () => {
  it('no hand-off while the sedation lasts; once she wakes, the hand-off ends the case', () => {
    let s = run(sc, 7, ['ems-handoff', 'sample', 'neuro', 'labs', 'procedural-sedation', 'cardiovert', 'cardiovert', 'heparin', 'admit', 'handoff']);
    expect(last(s)).toMatchObject({ who: 'system', text: expect.stringMatching(/^Not yet: she is still asleep from the sedation/) });
    expect(s.ended).toBeNull();
    s = until(s, 'wakes');
    s = perform(sc, s, 'handoff');
    expect(s.ended?.reason).toBe('complete');
  });

  it('after the arrest: admitted to the CCU, handed off only once awake', () => {
    let s = run(sc, 7, ['ems-handoff', 'defib', 'defib', 'admit', 'handoff']);
    expect(said(s, 'hospital', /accepts her to the CCU/)).toBe(true);
    expect(last(s)).toMatchObject({ who: 'system', text: expect.stringMatching(/^Not yet: she is not awake after the arrest/) });
    s = until(s, 'rosc-wakes');
    s = perform(sc, s, 'handoff');
    expect(s.ended?.reason).toBe('complete');
    // the nurse's run: the physician's admission names the CCU too
    let rn = run(sc, 6, [...NURSE_TO_SHOCK, 'defib', 'defib', 'nibp', 'notify-physician', 'heparin']);
    rn = until(rn, 'md-dispo');
    expect(said(rn, 'physician', /^Cardiology accepts her to the CCU/)).toBe(true);
  });

  it('in the arrest nobody gives a history; coming round, the daughter does, and the neuro check fits a drowsy patient', () => {
    let s = run(sc, 7, ['ems-handoff', 'defib']);
    for (const id of ['opqrst', 'sample']) {
      s = perform(sc, s, id);
      expect(last(s)).toMatchObject({ who: 'system', text: expect.stringMatching(/^Not in cardiac arrest/) });
      expect(s.counts[id]).toBeUndefined();
    }
    s = perform(sc, s, 'defib');
    s = perform(sc, s, 'opqrst');
    expect(said(s, 'you', /^She is too drowsy to tell you\. Her daughter/)).toBe(true);
    expect(said(s, 'patient', /Last night/)).toBe(false);
    while (s.pendingRead) s = answerRead(sc, s, s.pendingRead.answer);
    s = perform(sc, s, 'neuro');
    const exam = s.log.filter((l) => l.who === 'you' && /^GCS /.test(l.text)).at(-1)!;
    expect(exam.text).toMatch(/^GCS 8\. Drowsy/);
    expect(exam.text).not.toMatch(/follows commands/);
  });

  it('the nurse\'s report in the arrest gets the physician\'s call for the shock, not "keep watching her"', () => {
    let s = run(sc, 6, ['ems-handoff', 'pads', 'defib']);
    expect(said(s, 'physician', /^The ED physician runs in at the alarm/)).toBe(true);
    s = perform(sc, s, 'notify-physician');
    expect(last(s)).toMatchObject({ who: 'physician', text: expect.stringMatching(/shock her now, unsynchronized/) });
  });
});

describe('review fixes: the computer nurse and the words', () => {
  it('a doctor who puts in the line still gets the sedation set-up; labs ordered before a line claim no blood', () => {
    const s = run(sc, 7, ['iv']);
    expect(said(s, 'nurse', /^Capnography is on her/)).toBe(true);
    expect(said(s, 'nurse', /^IV in/)).toBe(false);
    expect([s.flags.capno, s.flags['airway-ready']]).toEqual([2, 2]);
    const labs = run(sc, 7, ['labs']);
    expect(said(labs, 'you', /the nurse draws them with the line/)).toBe(true);
  });

  it('the picker names neither the rhythm nor the treatment; the sedation teaching keeps to the pressure-sparing drugs', () => {
    expect(`${sc.title} ${sc.summary}`).not.toMatch(/shock|cardiover|sedat/i);
    const sedation = sc.critical.find((c) => c.id === 'md-sedation')!;
    expect(sedation.why).not.toMatch(/ketamine/);
    expect(sc.teaching.join(' ')).toMatch(/IV amiodarone may be considered for rate control \(2023 AF guideline: 2b\)/);
  });
});
