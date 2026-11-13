/**
 * Complete heart block in the emergency department (setting 'ed'): the ER nurse (6) and the ER doctor (7). The case is
 * imported straight from its file — it is registered in scenarios/index.ts separately.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '@/data/content';
import { resolveProfile } from '@/lib/ecg/profiles';
import { criticalsFor, perform, review, start, stop } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { edHeartBlock as sc } from '@/lib/sim/scenario/scenarios/edHeartBlock';
import type { SimState, Speaker } from '@/lib/sim/scenario/types';
import type { LearningLevel } from '@/store/useAppStore';
import { runScenario as run } from './helpers';

const R = (n: number) => Array<string>(n).fill('reassess');
const ids = (s: SimState) => s.penalties.map((p) => p.id);
const last = (s: SimState) => s.log.at(-1)!;
const said = (s: SimState, who: Speaker, text: RegExp) => s.log.some((l) => l.who === who && text.test(l.text));
const missed = (s: SimState) => review(sc, stop(s)).toFix.filter((t) => t.kind === 'missed').map((t) => t.label);
/** Reassess until an event has fired (or 30 times) */
function until(s: SimState, event: string): SimState {
  for (let i = 0; i < 30 && !s.fired.includes(event) && !s.ended; i++) s = perform(sc, s, 'reassess');
  return s;
}

/** A correct run for each role */
const IDEAL: Record<6 | 7, string[]> = {
  // the nurse: the crew's report, pads front and back, the physician called, the 12-lead, the line and the labs; atropine
  // and pacing on the physician's direction; capture confirmed; analgesia asked for and given; the potassium reported and
  // treated on the orders; the medicines; the wire checked when it takes over; the hand-off to the CCU
  6: ['ems-handoff', 'pads', 'notify-physician', 'ecg12', 'iv', 'labs', 'atropine', 'pace', 'pulse-check', 'nibp', 'notify-physician', 'fentanyl',
    'notify-physician', 'calcium-chloride', 'insulin-dextrose', 'sample', ...R(5), 'pulse-check', 'nibp', 'handoff'],
  // the doctor: the report and the medicines, the labs, atropine once, then pacing; capture confirmed, analgesia; calcium
  // and insulin for the potassium; cardiology; a transvenous wire through a central line, its film; the CCU
  7: ['ems-handoff', 'sample', 'labs', 'perfusion', 'atropine', 'pace', 'pulse-check', 'nibp', 'fentanyl', 'lungs', 'calcium-chloride',
    'insulin-dextrose', 'consult-cardiology', 'central-line', 'temp-wire', 'cxr', 'admit', 'handoff'],
};
const ROLES = [6, 7] as const;
/** Each role up to the pacer going on */
const NURSE_TO_PACE = ['ems-handoff', 'pads', 'notify-physician', 'ecg12', 'iv', 'labs', 'atropine', 'pace'];
const DOCTOR_TO_PACE = ['ems-handoff', 'sample', 'labs', 'perfusion', 'atropine', 'pace'];

const NOT_IN_ED: Speaker[] = ['operator', 'dispatch', 'scene', 'partner'];
const giveaway = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture/i;
const BRITISH = /haem|aemia|ischaem|oedem|synchronis|equalis|hyperaem|centre|levell|manoeuvre|nebulis|analyse\b|analyser|organis|colour|\bgrey|litres|metres|optimis|minimis|catheteris|heparinis|recognis|anaesth|favour|behaviour/i;

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
  [7, ['ems-handoff', 'sample', 'perfusion', 'lungs', 'atropine', 'pace', 'pulse-check', 'nibp', 'fentanyl', ...R(10), 'calcium-chloride']],
  [7, ['ems-handoff', 'sample', 'labs', 'perfusion', 'lidocaine', 'metoprolol', 'adenosine6', 'pace', 'diltiazem', 'adenosine12', 'amio-infusion']],
  [7, ['ems-handoff', 'sample', 'labs', 'perfusion', 'pressor', 'consult-cardiology', 'central-line', 'temp-wire']],
  [6, ['ems-handoff', 'iv', 'labs', ...R(4), 'atropine', ...R(6)]],
  [6, [...NURSE_TO_PACE, 'notify-physician', ...R(6)]],
  // the infusion path left with the potassium untreated, and the nurse who paces before the physician comes
  [7, ['ems-handoff', 'sample', 'perfusion', 'lungs', 'pressor', ...R(11), 'calcium-chloride']],
  [6, ['ems-handoff', 'pads', 'pace', 'pulse-check', 'nibp', 'notify-physician', 'iv', ...R(4)]],
];

describe('complete heart block in the ED: the case itself', () => {
  it('is an emergency department case for the ER nurse and the ER doctor, and refers only to things that exist', () => {
    expect(sc.id).toBe('complete-heart-block-ed');
    expect(sc.setting).toBe('ed');
    expect(sc.roles).toEqual([6, 7]);
    expect(CONDITIONS[sc.conditionId!]).toBeDefined();
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe(sc.initial.rhythm.profile);
    expect(sc.problems).toEqual(['hyperkalemia']);
    for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `respond ${id}`).toBeDefined();
    for (const h of sc.harms) for (const id of h.actions) expect(INTERVENTION_BY_ID[id], `harm ${h.id}: ${id}`).toBeDefined();
    for (const t of sc.timings ?? []) for (const id of t.actions) expect(INTERVENTION_BY_ID[id], `timing ${id}`).toBeDefined();
    for (const role of ROLES) {
      const scope = new Set(interventionsFor(role, 'ed').map((i) => i.id));
      for (const c of criticalsFor(sc, role)) {
        const ways = Array.isArray(c.done) ? c.done : c.uses ?? [];
        expect(ways.some((id) => scope.has(id)), `role ${role}: ${c.id}`).toBe(true);
      }
      // every harm a role can be scored for is one it can commit
      for (const h of sc.harms.filter((x) => !x.roles || x.roles.includes(role))) expect(h.actions.some((id) => scope.has(id)), `role ${role}: ${h.id}`).toBe(true);
    }
    // a brief for each role, in the department's voices
    for (const role of ROLES) expect(sc.briefing[role]?.length, `briefing ${role}`).toBeGreaterThan(0);
    for (const l of Object.values(sc.briefing).flat()) expect(NOT_IN_ED).not.toContain(l[0]);
  });

  it('gives each role its own part: the nurse gives drugs on the orders and calls the physician, the doctor decides', () => {
    const nurse = criticalsFor(sc, 6).map((c) => c.id);
    const doctor = criticalsFor(sc, 7).map((c) => c.id);
    expect(nurse).toEqual(expect.arrayContaining(['rn-call', 'rn-pads', 'rn-capture', 'rn-analgesia', 'rn-k-report', 'ask-atropine', 'ask-calcium', 'ask-shift', 'rn-handoff']));
    expect(doctor).toEqual(expect.arrayContaining(['md-rate', 'md-capture', 'md-analgesia', 'md-calcium', 'md-shift', 'md-wire', 'md-consult', 'md-admit']));
    expect(nurse.some((id) => doctor.includes(id))).toBe(false);
    // the nurse is never offered the physician's procedures and decisions
    const rn = new Set(interventionsFor(6, 'ed').map((i) => i.id));
    for (const id of ['temp-wire', 'central-line', 'consult-cardiology', 'admit', 'procedural-sedation', 'rsi']) expect(rn.has(id), id).toBe(false);
  });

  it('is written in US English', () => {
    const text = readFileSync(new URL('../src/lib/sim/scenario/scenarios/edHeartBlock.ts', import.meta.url), 'utf8');
    expect(text.match(BRITISH)).toBeNull();
  });
});

describe('complete heart block in the ED: the ideal runs', () => {
  for (const role of ROLES) {
    it(`role ${role} ends by itself with full marks`, () => expectFullMarks(run(sc, role, IDEAL[role])));
  }

  it('speaks only with the department\'s voices, never names the rhythm on the monitor, and reaches only real rhythms', () => {
    const runs: [LearningLevel, string[]][] = [...ROLES.map((r) => [r, IDEAL[r]] as [LearningLevel, string[]]), ...OTHER_RUNS];
    for (const [role, steps] of runs) {
      const s = run(sc, role, steps, (x) => expect(resolveProfile(x.rhythm.profile).id, x.rhythm.profile).toBe(x.rhythm.profile));
      for (const l of s.log) {
        expect(NOT_IN_ED, `role ${role}: ${l.who} "${l.text}"`).not.toContain(l.who);
        if (l.who === 'monitor') expect(l.text, `role ${role}`).not.toMatch(giveaway);
      }
    }
  });

  it('the learner reads the 12-lead: the block before the pacer, and the feedback names it only after the read', () => {
    const nurse = run(sc, 6, ['ems-handoff', 'pads', 'notify-physician', 'ecg12'], undefined, 'manual');
    expect(nurse.pendingRead).toMatchObject({ kind: 'ecg', answer: 'chb' });
    // the doctor's nurse records it at minute 2, and the doctor reads it
    const doctor = run(sc, 7, ['ems-handoff', 'sample'], undefined, 'manual');
    expect(said(doctor, 'nurse', /^12-lead done/)).toBe(true);
    expect(doctor.pendingRead).toMatchObject({ kind: 'ecg', answer: 'chb' });
    expect(run(sc, 7, ['ems-handoff', 'sample', 'read:chb'], undefined, 'manual').log.at(-1)!.text).toMatch(/^Correct\. Complete heart block.*no inferior STEMI behind the block.*measure it\.$/);
  });

  it('in the doctor\'s run the nurse puts the pads on, records the 12-lead and starts the line', () => {
    const s = run(sc, 7, ['ems-handoff', 'sample', 'labs', 'perfusion']);
    expect([s.flags.pads, s.flags.ecg12, s.flags.iv]).toEqual([1, 2, 3]);
    expect(said(s, 'nurse', /pacing pads on her — front and back/)).toBe(true);
    // what the nurse has done, the doctor need not do again
    expect(last(perform(sc, s, 'pads')).text).toMatch(/already on her, front and back/);
    expect(last(perform(sc, s, 'iv')).text).toBe('The nurse already has a line in.');
  });
});

describe('complete heart block in the ED: atropine and pacing', () => {
  it('atropine does nothing for the wide escape; a second dose while she stays hypotensive is the trap', () => {
    const once = run(sc, 7, ['ems-handoff', 'sample', 'labs', 'perfusion', 'atropine']);
    expect(once.rhythm).toEqual({ profile: 'third-degree-avb', hr: 34 });
    expect(once.log.some((l) => l.who === 'monitor' && l.text === 'No change in heart rate.')).toBe(true);
    expect(ids(once)).toEqual([]);
    const twice = perform(sc, once, 'atropine');
    expect(ids(twice)).toEqual(['atropine-repeat']);
    expect(twice.penalties[0]).toMatchObject({ severity: 'major', text: expect.stringMatching(/^Atropine again while she stays hypotensive\./) });
    // once she is paced it is pointless, not the trap
    expect(ids(run(sc, 7, [...DOCTOR_TO_PACE, 'atropine']))).toEqual([]);
    // the nurse: the order covers one dose; a second is the same trap (not also "without an order")
    expect(ids(run(sc, 6, ['ems-handoff', 'pads', 'notify-physician', 'ecg12', 'iv', 'labs', 'atropine', 'atropine']))).toEqual(['atropine-repeat']);
  });

  it('going straight to the pacer is right care: the doctor needs no atropine first', () => {
    const s = run(sc, 7, ['ems-handoff', 'sample', 'pace']);
    expect(review(sc, stop(s)).toFix.find((t) => t.label.startsWith('Atropine 1 mg while the pacer is readied'))).toBeUndefined();
  });

  it('the pacer brings wide beats at 70, a pressure, a clearer head — and pain', () => {
    const s = run(sc, 7, DOCTOR_TO_PACE);
    expect(s.rhythm).toEqual({ profile: 'tcp', hr: 70 });
    expect(s.vitals).toMatchObject({ sbp: 98, dbp: 58, gcs: 15, pain: 7 });
    expect(last(s)).toMatchObject({ who: 'patient', tone: 'bad' });
    // the pulse is felt at the groin, not the neck
    expect(last(perform(sc, s, 'pulse-check')).text).toMatch(/femoral pulse at 70.*not the neck/);
  });

  it('an epinephrine (or dopamine) infusion instead of the pacer is right care too: full marks', () => {
    const s = run(sc, 7, ['ems-handoff', 'sample', 'labs', 'perfusion', 'pressor', 'lungs', 'nibp', 'calcium-chloride', 'insulin-dextrose', 'consult-cardiology',
      'central-line', 'temp-wire', 'cxr', 'admit', 'handoff']);
    expect(s.log.some((l) => l.who === 'monitor' && l.text === 'Heart rate 44. BP 94/56.')).toBe(true);
    expect(s.rhythm).toEqual({ profile: 'paced', hr: 70 });
    expectFullMarks(s);
  });

  it('without a faster rate she slips: slower, lower and harder to rouse at 10 minutes', () => {
    const s = run(sc, 7, ['ems-handoff', ...R(5)]);
    expect(s.fired).toContain('worse');
    expect(s.rhythm).toEqual({ profile: 'third-degree-avb', hr: 28 });
    expect(s.vitals).toMatchObject({ sbp: 68, dbp: 38, gcs: 12 });
    expect(said(s, 'nurse', /harder to rouse/)).toBe(true);
  });
});

describe('complete heart block in the ED: capture and analgesia', () => {
  it('a pulse and a pressure confirm capture — the screen alone is the trap', () => {
    const moved = run(sc, 7, [...DOCTOR_TO_PACE, 'central-line']);
    expect(ids(moved)).toEqual(['capture-unconfirmed']);
    expect(moved.penalties[0].text).toMatch(/^Calling the pacing a success from the monitor alone\./);
    expect(missed(moved)).toContain('Confirm capture: a femoral pulse at the paced rate, and a pressure');
    // a manual set of vitals is a pulse and a pressure together
    expect(missed(run(sc, 7, [...DOCTOR_TO_PACE, 'vitals']))).not.toContain('Confirm capture: a femoral pulse at the paced rate, and a pressure');
    // the nurse who reports the pacing as working without checking: the physician asks
    const told = run(sc, 6, [...NURSE_TO_PACE, 'notify-physician']);
    expect(ids(told)).toContain('capture-unconfirmed');
    expect(said(told, 'physician', /Is it really capturing\?/)).toBe(true);
    // checked first, the physician hears it and moves on
    const checked = run(sc, 6, [...NURSE_TO_PACE, 'pulse-check', 'nibp', 'notify-physician']);
    expect(ids(checked)).toEqual([]);
    expect(said(checked, 'physician', /A pulse at 70 with the pacer, and 98 systolic — good/)).toBe(true);
  });

  it('pacing an awake patient without analgesia is the trap; she says so', () => {
    const s = run(sc, 7, [...DOCTOR_TO_PACE, 'pulse-check', 'nibp', ...R(3)]);
    expect(said(s, 'patient', /Take it off!/)).toBe(true);
    expect(ids(s)).toEqual(['no-analgesia']);
    expect(missed(s)).toContain('Analgesia for the pacing');
    // a single deep sedation dose is no analgesia for hours of pacing
    const sedated = run(sc, 7, [...DOCTOR_TO_PACE, 'pulse-check', 'nibp', 'procedural-sedation']);
    expect(ids(sedated)).toEqual([]);
    expect(said(sedated, 'team', /needs analgesia that lasts/)).toBe(true);
    expect(missed(sedated)).toContain('Analgesia for the pacing');
    // fentanyl just before the pacer goes on counts, on time
    const early = run(sc, 7, ['ems-handoff', 'sample', 'labs', 'perfusion', 'fentanyl', 'pace', 'vitals']);
    expect(review(sc, stop(early)).toFix.filter((t) => /Analgesia/.test(t.label))).toEqual([]);
  });

  it('the nurse asks for the analgesia and gives it on the order — not before, and the physician steps in if she waits', () => {
    expect(ids(run(sc, 6, [...NURSE_TO_PACE, 'fentanyl']))).toContain('rn-without-order-fentanyl');
    const asked = run(sc, 6, [...NURSE_TO_PACE, 'pulse-check', 'nibp', 'notify-physician']);
    expect(said(asked, 'physician', /^Fentanyl 25 micrograms IV for the pacing pain/)).toBe(true);
    // the order covers a little midazolam too
    expect(ids(perform(sc, asked, 'midazolam'))).toEqual([]);
    // having asked, she is not scored for the wait — but the physician gives it if she never does
    const waited = run(sc, 6, [...NURSE_TO_PACE, 'pulse-check', 'nibp', 'notify-physician', ...R(3)]);
    expect(ids(waited)).not.toContain('no-analgesia');
    expect(said(waited, 'physician', /I will give the fentanyl myself/)).toBe(true);
    expect(missed(waited)).toContain('Speak up for analgesia, and give it on the order');
  });
});

describe('complete heart block in the ED: the potassium', () => {
  it('the bedside analyzer gives the potassium two and a half minutes after the blood is drawn', () => {
    // the doctor orders the labs at 2.0 (in by 2.5); the nurse draws the blood with the IV at 3.0: the result at 5.5, read at 5.7
    const s = run(sc, 7, [...DOCTOR_TO_PACE, 'pulse-check', 'nibp', 'fentanyl']);
    expect(s.flags['k-known']).toBe(5.7);
    expect(said(s, 'nurse', /^IV in: 18 G in the left forearm, flushed\. The blood you ordered is drawn/)).toBe(true);
    expect(said(s, 'nurse', /^Bedside analyzer: potassium 6\.9 — a critical value/)).toBe(true);
    // the nurse draws her own blood (done at 1.5): due at 4.0, heard at the end of the reassessment that spans it
    const own = run(sc, 6, ['ems-handoff', 'labs', 'pads', 'notify-physician']);
    expect(own.flags['k-known']).toBeUndefined();
    expect(perform(sc, own, 'reassess').flags['k-known']).toBe(4.5);
  });

  it('left untreated, it raises the pacing threshold: the pacer stops bringing beats until calcium is given', () => {
    let s = run(sc, 7, ['ems-handoff', 'sample', 'perfusion', 'lungs', 'atropine', 'pace', 'pulse-check', 'nibp', 'fentanyl']);
    s = until(s, 'k-rising');
    expect(s.minute).toBeGreaterThanOrEqual(24);
    expect(s.rhythm).toEqual({ profile: 'third-degree-avb', hr: 28 });
    expect(s.vitals.sbp).toBeLessThanOrEqual(66);
    expect(s.flags['lost-capture']).toBeDefined();
    expect(said(s, 'nurse', /Should I run a potassium\?/)).toBe(true);
    expect(last(perform(sc, s, 'pulse-check')).text).toMatch(/^Femoral pulse 28 — the pacer fires at 70, but most spikes bring no beat\./);
    // admitting her like this is the trap
    expect(ids(perform(sc, s, 'admit'))).toContain('k-untreated');
    // insulin takes its time; calcium brings the beats back within a minute
    const shifted = perform(sc, s, 'insulin-dextrose');
    expect(shifted.flags['lost-capture']).toBeDefined();
    const back = perform(sc, s, 'calcium-chloride');
    expect(back.rhythm).toEqual({ profile: 'tcp', hr: 70 });
    expect(back.vitals.sbp).toBeGreaterThanOrEqual(96);
    expect(back.flags['lost-capture']).toBeUndefined();
    // the transvenous wire fails the same way, and calcium brings it back
    const wire = perform(sc, perform(sc, s, 'central-line'), 'temp-wire');
    expect(wire.rhythm.profile).toBe('third-degree-avb');
    expect(last(wire).text).toMatch(/threshold is far too high/);
    expect(perform(sc, wire, 'calcium-chloride').rhythm).toEqual({ profile: 'paced', hr: 70 });
  });

  it('calcium steadies the conduction a little before the pacer, and empiric calcium before the result counts', () => {
    const s = run(sc, 7, ['ems-handoff', 'sample', 'labs', 'perfusion', 'calcium-chloride']);
    expect(s.rhythm).toEqual({ profile: 'third-degree-avb', hr: 38 });
    expect(ids(s)).toEqual([]);
    const full = run(sc, 7, [...s.performed.map((p) => p.id), 'pace', 'pulse-check', 'nibp', 'fentanyl', 'insulin-dextrose', 'consult-cardiology', 'central-line', 'temp-wire',
      'cxr', 'admit', 'handoff']);
    expectFullMarks(full);
  });

  it('the doctor who sends her on with the potassium untreated is scored for it', () => {
    const s = run(sc, 7, [...DOCTOR_TO_PACE, 'pulse-check', 'nibp', 'fentanyl', 'admit']);
    expect(ids(s)).toEqual(['k-untreated']);
  });

  it('the nurse reports the critical value at once; if she does not, the physician finds it — and she is scored for it', () => {
    let s = run(sc, 6, [...NURSE_TO_PACE, 'pulse-check', 'nibp', 'notify-physician', 'fentanyl']);
    expect(s.flags['k-known']).toBeDefined();
    s = until(s, 'k-md-found');
    expect(said(s, 'physician', /I just saw her potassium on the screen — 6\.9/)).toBe(true);
    expect(said(s, 'physician', /^Calcium chloride 1 gram IV/)).toBe(true);
    s = run(sc, 6, [...s.performed.map((p) => p.id), 'calcium-chloride', 'insulin-dextrose']);
    s = until(s, 'md-dispo');
    s = perform(sc, s, 'handoff');
    expect(ids(s)).toEqual(['k-not-reported']);
    expect(missed(s)).toContain('Report the critical potassium to the physician at once');
  });

  it('the nurse gives the potassium drugs on the physician\'s order, not before', () => {
    expect(ids(run(sc, 6, [...NURSE_TO_PACE, 'calcium-chloride']))).toEqual(['rn-without-order-calcium-chloride']);
    expect(ids(run(sc, 6, [...NURSE_TO_PACE, 'insulin-dextrose']))).toEqual(['rn-without-order-insulin-dextrose']);
    const ordered = run(sc, 6, [...NURSE_TO_PACE, 'pulse-check', 'nibp', 'notify-physician', 'fentanyl', 'notify-physician', 'calcium-chloride', 'insulin-dextrose']);
    expect(ids(ordered)).toEqual([]);
    expect(said(ordered, 'physician', /^Then dextrose 25 grams and regular insulin 10 units IV/)).toBe(true);
  });

  it('the nurse who never sends blood is asked for it', () => {
    const s = run(sc, 6, ['ems-handoff', 'pads', 'notify-physician', 'ecg12', 'iv', 'atropine', 'pace', 'pulse-check', 'nibp', ...R(2)]);
    expect(said(s, 'physician', /I want a potassium on her/)).toBe(true);
  });
});

describe('complete heart block in the ED: the nurse works on the physician\'s orders', () => {
  it('calls the physician at once — or the physician comes on their own and asks why', () => {
    const s = run(sc, 6, ['ems-handoff', 'pads', 'ecg12', 'iv']);
    expect(said(s, 'physician', /Why wasn't I called\?/)).toBe(true);
    expect(missed(s)).toContain('Bring the ED physician to the bedside now');
    // the line is in and the physician is here: the atropine order comes at once
    expect(said(s, 'physician', /^Atropine 1 mg IV now/)).toBe(true);
  });

  it('atropine needs the physician\'s order', () => {
    expect(ids(run(sc, 6, ['ems-handoff', 'iv', 'atropine']))).toEqual(['rn-without-order-atropine']);
  });

  it('paces when the physician directs it; if she does not, the physician starts the pacer', () => {
    let s = run(sc, 6, ['ems-handoff', 'pads', 'notify-physician', 'ecg12', 'iv', 'atropine']);
    expect(said(s, 'physician', /No change with the atropine\. Pace her/)).toBe(true);
    s = until(s, 'md-pace-fallback');
    expect(said(s, 'physician', /I'll start the pacer myself/)).toBe(true);
    expect(s.rhythm).toEqual({ profile: 'tcp', hr: 70 });
    expect(missed(s)).toContain('Transcutaneous pacing as soon as the physician directs it');
  });

  it('the physician places the wire and admits her; the nurse checks the wire with a pulse and a pressure', () => {
    let s = run(sc, 6, IDEAL[6].slice(0, IDEAL[6].indexOf('sample') + 1));
    expect(said(s, 'physician', /floating a transvenous wire now/)).toBe(true);
    s = until(s, 'md-wire-in');
    expect(s.rhythm).toEqual({ profile: 'paced', hr: 70 });
    s = until(s, 'md-dispo');
    expect(s.flags.dispo).toBeDefined();
    const skipped = perform(sc, s, 'handoff');
    expect(missed(skipped)).toContain('When the wire takes over: a pulse and a pressure again');
  });
});

describe('complete heart block in the ED: what must not be given', () => {
  it('lidocaine, amiodarone and procainamide suppress the escape: one critical penalty each, and a pacer holds the rate', () => {
    for (const drug of ['lidocaine', 'amio-infusion', 'amio-arrest', 'procainamide']) {
      const s = run(sc, 7, ['ems-handoff', 'sample', 'labs', 'perfusion', drug]);
      expect(s.rhythm, drug).toEqual({ profile: 'third-degree-avb', hr: 22 });
      expect(s.vitals.sbp, drug).toBeLessThanOrEqual(58);
      expect(ids(s), drug).toEqual(['escape-suppressant']);
      expect(s.penalties[0].severity).toBe('critical');
      expect(review(sc, stop(s)).grade, drug).toBe('Unsafe');
      expect(run(sc, 7, [...DOCTOR_TO_PACE, drug]).rhythm, drug).toEqual({ profile: 'tcp', hr: 70 });
    }
    // the nurse: no order either
    expect(ids(run(sc, 6, ['ems-handoff', 'iv', 'amio-infusion'])).sort()).toEqual(['escape-suppressant', 'rn-without-order-amio-infusion']);
  });

  it('beta-blockers, diltiazem and adenosine deepen the block', () => {
    const beta = run(sc, 7, ['ems-handoff', 'sample', 'labs', 'perfusion', 'metoprolol']);
    expect(beta.rhythm.hr).toBe(22);
    expect(ids(beta)).toEqual(['av-blocker']);
    const paced = run(sc, 7, [...DOCTOR_TO_PACE, 'diltiazem']);
    expect(paced.rhythm).toEqual({ profile: 'tcp', hr: 70 });
    expect(paced.vitals.sbp).toBeLessThan(98);
    expect(ids(paced)).toEqual(['av-blocker']);
    const aden = run(sc, 7, ['ems-handoff', 'sample', 'labs', 'perfusion', 'adenosine6']);
    expect(said(aden, 'monitor', /^Six seconds with no QRS complexes/)).toBe(true);
    expect(ids(aden)).toEqual(['adenosine-block']);
  });

  it('CPAP and a tube treat nothing she has, glucagon does nothing; nitroglycerin, a lytic and the cath lab are the built-in rules', () => {
    expect(ids(run(sc, 7, ['ems-handoff', 'cpap']))).toEqual(['cpap-no-indication']);
    // glucagon is a listed rescue in BRASH when the rest fails (Farkas 2020): not scored, but it treats nothing here and she vomits
    const glucagon = run(sc, 7, ['ems-handoff', 'sample', 'labs', 'perfusion', 'glucagon']);
    expect(ids(glucagon)).toEqual([]);
    expect(said(glucagon, 'patient', /vomits/)).toBe(true);
    expect(glucagon.rhythm.hr).toBe(34);
    // the nurse still needs an order for it
    expect(ids(run(sc, 6, ['ems-handoff', 'iv', 'glucagon']))).toEqual(['rn-without-order-glucagon']);
    // one mistake, one penalty: the case's rule stands in for the built-in ones
    expect(ids(run(sc, 7, ['ems-handoff', 'sample', 'labs', 'perfusion', 'rsi']))).toEqual(['rsi-no-indication']);
    const base = ['ems-handoff', 'sample', 'labs', 'perfusion'];
    expect(ids(run(sc, 7, [...base, 'nitro']))).toEqual(['nitro-hypotension']);
    expect(ids(run(sc, 7, [...base, 'tnk']))).toEqual(['lytic-no-indication']);
    expect(ids(run(sc, 7, [...base, 'cath-lab-activate']))).toEqual(['cath-lab-no-ste']);
  });
});

describe('complete heart block in the ED: the wire, cardiology and the CCU', () => {
  it('the wire goes in through a central line, takes over from the pads, and is checked on a film', () => {
    const noLine = perform(sc, run(sc, 7, DOCTOR_TO_PACE), 'temp-wire');
    expect(last(noLine).text).toMatch(/place a central venous line first/);
    const s = run(sc, 7, [...DOCTOR_TO_PACE, 'pulse-check', 'nibp', 'fentanyl', 'calcium-chloride', 'central-line', 'temp-wire']);
    expect(s.rhythm).toEqual({ profile: 'paced', hr: 70 });
    expect(said(s, 'you', /transcutaneous pacer goes to standby; the pads stay on/)).toBe(true);
    expect(ids(s)).toEqual([]);
    expect(last(perform(sc, s, 'cxr')).text).toMatch(/right ventricular apex; no pneumothorax/);
    expect(last(perform(sc, s, 'pocus')).text).toMatch(/wire tip sits in the right ventricle/);
  });

  it('cardiology answers what it has been told: the 12-lead and the potassium first, then the plan', () => {
    expect(said(perform(sc, start(sc, 7), 'consult-cardiology'), 'consultant', /Send me the 12-lead and her potassium/)).toBe(true);
    // the potassium is still on the analyzer when she calls
    expect(said(run(sc, 7, [...DOCTOR_TO_PACE, 'consult-cardiology']), 'consultant', /what is her potassium\?/)).toBe(true);
    const plan = last(run(sc, 7, [...DOCTOR_TO_PACE, 'pulse-check', 'nibp', 'fentanyl', 'consult-cardiology'])).text;
    // the reversible causes first (2018 ACC/AHA/HRS); the block that stays gets the permanent pacemaker
    expect(plan).toMatch(/once the potassium is normal and the metoprolol has worn off: if it is still there tomorrow, she gets a permanent pacemaker/);
    expect(plan).toMatch(/^Cardiology: "Treat the potassium.*Transcutaneous pacing will not hold her for hours: please float a transvenous wire through a right internal jugular sheath/);
    // on an infusion instead of the pacer, and with the wire already in, the consultant says so
    expect(last(run(sc, 7, ['ems-handoff', 'sample', 'labs', 'perfusion', 'pressor', 'reassess', 'consult-cardiology'])).text).toMatch(/An infusion will not hold her for hours/);
    expect(last(run(sc, 7, [...DOCTOR_TO_PACE, 'pulse-check', 'nibp', 'fentanyl', 'calcium-chloride', 'central-line', 'temp-wire', 'consult-cardiology'])).text)
      .toMatch(/The transvenous wire you have in will hold her until then\. Admit her to the CCU/);
  });

  it('there is nothing to transfer her for: this hospital implants pacemakers', () => {
    const s = run(sc, 7, DOCTOR_TO_PACE);
    const t = perform(sc, s, 'transfer');
    expect(t.minute).toBe(s.minute);
    expect(t.flags.dispo).toBeUndefined();
    expect(last(t)).toMatchObject({ who: 'system', text: expect.stringMatching(/^Not needed: this hospital has cardiology on call/) });
  });

  it('teaches the 2025 AHA doses, the femoral pulse, the potassium and the permanent pacemaker', () => {
    const text = sc.teaching.join(' ');
    expect(text).toMatch(/atropine 1 mg IV \(every 3–5 minutes, at most 3 mg\)/);
    expect(text).toMatch(/epinephrine \(2–10 mcg\/min\) or dopamine \(5–20 mcg\/kg\/min\)/);
    expect(text).toMatch(/femoral pulse at the paced rate/);
    expect(text).toMatch(/cannot rule out a high potassium/);
    expect(text).toMatch(/permanent pacemaker \(2018 ACC\/AHA\/HRS, class 1\)/);
  });
});

describe('complete heart block in the ED: what the independent review fixed', () => {
  const label = (s: SimState, l: string) => review(sc, s.ended ? s : stop(s)).toFix.find((x) => x.label === l);

  it('atropine the nurse gave before the order is not ordered again, and nobody pushes a second dose', () => {
    let s = run(sc, 6, ['ems-handoff', 'pads', 'iv', 'atropine', 'notify-physician']);
    expect(ids(s)).toEqual(['rn-without-order-atropine']);
    expect(said(s, 'physician', /^Atropine 1 mg IV now/)).toBe(false);
    expect(said(s, 'physician', /No change with the atropine\. Pace her/)).toBe(true);
    s = run(sc, 6, [...s.performed.map((p) => p.id), 'pace', 'pulse-check', 'nibp', ...R(2)]);
    expect(s.counts.atropine).toBe(1);
    expect(said(s, 'physician', /push the atropine myself/)).toBe(false);
  });

  it('a nurse who paces before giving the atropine ordered: the physician cancels it, and the item drops out', () => {
    const s = run(sc, 6, ['ems-handoff', 'pads', 'notify-physician', 'iv', 'pace', 'pulse-check', 'nibp', ...R(2)]);
    expect(said(s, 'physician', /^Atropine 1 mg IV now/)).toBe(true);
    expect(said(s, 'physician', /^She is paced — leave the atropine\.$/)).toBe(true);
    expect(s.flags.atropine).toBeUndefined();
    expect(said(s, 'physician', /push the atropine myself/)).toBe(false);
    expect(label(s, 'Atropine 1 mg on the physician\'s order')).toBeUndefined();
    expect(ids(s)).toEqual([]);
  });

  it('calcium the nurse gave without the order is not ordered (or pushed) again; the insulin order still comes', () => {
    const s = run(sc, 6, ['ems-handoff', 'pads', 'notify-physician', 'ecg12', 'iv', 'labs', 'atropine', 'pace', 'pulse-check', 'nibp', 'calcium-chloride',
      'notify-physician', 'fentanyl', 'insulin-dextrose', ...R(3)]);
    expect(ids(s)).toEqual(['rn-without-order-calcium-chloride']);
    expect(s.counts['calcium-chloride']).toBe(1);
    expect(said(s, 'physician', /^Calcium chloride 1 gram IV/)).toBe(false);
    expect(said(s, 'physician', /push the calcium myself/)).toBe(false);
    expect(said(s, 'physician', /^Then dextrose 25 grams and regular insulin 10 units IV, and her glucose at 30 minutes/)).toBe(true);
  });

  it('the call that brings the physician carries the report: the pacer already on, the pain, a potassium in hand', () => {
    const paced = run(sc, 6, ['ems-handoff', 'pads', 'pace', 'pulse-check', 'nibp', 'notify-physician']);
    expect(said(paced, 'physician', /^The ED physician comes straight over: "Thank you for calling\. She is paced at 70 already\."$/)).toBe(true);
    expect(said(paced, 'physician', /^A pulse at 70 with the pacer, and 98 systolic — good\.$/)).toBe(true);
    expect(paced.flags['analgesia-requested']).toBeDefined();
    // an IV order waits for the line, then comes at once
    expect(said(paced, 'physician', /^Fentanyl 25 micrograms IV/)).toBe(false);
    expect(said(perform(sc, paced, 'iv'), 'physician', /^Fentanyl 25 micrograms IV/)).toBe(true);
    expect(ids(paced)).toEqual([]);
    // not yet paced: what they see and what they still need
    expect(said(run(sc, 6, ['ems-handoff', 'notify-physician']), 'physician', /"Thank you for calling\. A heart rate of 34, 82 systolic and confused\. I want pads on her and a line, now\."$/)).toBe(true);
    // the potassium in hand when the physician is called reaches them with that call
    const k = run(sc, 6, ['ems-handoff', 'labs', 'pads', 'ecg12', 'notify-physician']);
    expect(said(k, 'physician', /^6\.9 — with this rhythm\. Thank you for telling me straight away\.$/)).toBe(true);
    expect(k.flags['k-reported']).toBeDefined();
  });

  it('a nurse who calls with a critical potassium before checking the pacer is reporting the potassium, not the pacing', () => {
    const s = run(sc, 6, ['ems-handoff', 'pads', 'notify-physician', 'iv', 'labs', 'ecg12', 'atropine', 'pace', 'notify-physician', 'pulse-check', 'nibp', 'fentanyl',
      'calcium-chloride', 'insulin-dextrose']);
    expect(said(s, 'physician', /Is it really capturing\?/)).toBe(true);
    expect(ids(s)).toEqual([]);
    // the insulin order follows the calcium: four minutes to carry it out
    expect(label(s, 'Insulin with dextrose on the physician\'s order')).toBeUndefined();
  });

  it('once the physician has come on their own, a later report is no call: the item is missed, not late', () => {
    const s = run(sc, 6, ['ems-handoff', 'pads', 'ecg12', 'iv', 'notify-physician']);
    expect(label(s, 'Bring the ED physician to the bedside now')?.kind).toBe('missed');
  });

  it('a potassium reported after the physician found it is late, and no hand-off harm', () => {
    let s = run(sc, 6, [...NURSE_TO_PACE, 'pulse-check', 'nibp', 'notify-physician', 'fentanyl']);
    s = until(s, 'k-md-found');
    s = perform(sc, s, 'notify-physician');
    expect(said(s, 'physician', /^Yes — I saw the 6\.9\. A critical value comes to me the moment you have it\.$/)).toBe(true);
    s = run(sc, 6, [...s.performed.map((p) => p.id), 'calcium-chloride', 'insulin-dextrose']);
    s = until(s, 'md-dispo');
    s = run(sc, 6, [...s.performed.map((p) => p.id), 'pulse-check', 'nibp', 'handoff']);
    expect(ids(s)).not.toContain('k-not-reported');
    expect(label(s, 'Report the critical potassium to the physician at once')?.kind).toBe('late');
  });

  it('a nurse who never draws blood: the pacer fails on the potassium, and it never reached the physician', () => {
    let s = run(sc, 6, ['ems-handoff', 'pads', 'notify-physician', 'ecg12', 'iv', 'atropine', 'pace', 'pulse-check', 'nibp', 'notify-physician', 'fentanyl', 'sample']);
    s = until(s, 'k-rising');
    expect(said(s, 'team', /Has anyone checked a potassium on her\?/)).toBe(true);
    expect(said(s, 'physician', /^Calcium chloride 1 gram IV/)).toBe(true);
    expect(label(s, 'Labs, with a potassium on the bedside analyzer')?.kind).toBe('missed');
    expect(label(s, 'Report the critical potassium to the physician at once')?.kind).toBe('missed');
  });

  it('carrying on once she has cried out with the pacer is the trap — an eight-minute line started then counts', () => {
    const before = run(sc, 7, [...DOCTOR_TO_PACE, 'pulse-check', 'nibp', 'lungs']);
    expect(before.fired).not.toContain('pain');
    expect(ids(before)).toEqual([]);
    const s = run(sc, 7, [...DOCTOR_TO_PACE, 'pulse-check', 'nibp', 'lungs', 'calcium-chloride', 'insulin-dextrose', 'consult-cardiology', 'central-line']);
    expect(s.fired).toContain('pain');
    expect(ids(s)).toEqual(['no-analgesia']);
  });

  it('fentanyl while the pads are readied is on board when the pacer starts; a dose ten minutes or more before is not', () => {
    const dosed = run(sc, 7, ['ems-handoff', 'sample', 'labs', 'perfusion', 'fentanyl']);
    expect(dosed.flags.analgesia).toBeUndefined();
    const early = run(sc, 7, [...dosed.performed.map((p) => p.id), 'pace', 'pulse-check', 'nibp', ...R(2)]);
    expect(said(early, 'patient', /I can bear it/)).toBe(true);
    expect(early.flags.analgesia).toBeDefined();
    expect(early.fired).not.toContain('pain');
    expect(missed(early)).not.toContain('Analgesia for the pacing');
    const long = run(sc, 7, [...dosed.performed.map((p) => p.id), ...R(5), 'pace']);
    expect(last(long)).toMatchObject({ who: 'patient', text: expect.stringMatching(/^"Ow!/) });
    expect(long.flags.analgesia).toBeUndefined();
    expect(missed(long)).toContain('Analgesia for the pacing');
  });

  it('the doctor who paces at once still gets the nurse\'s 12-lead in time (the paced tracing)', () => {
    const s = run(sc, 7, ['ems-handoff', 'pace', 'pulse-check', 'nibp']);
    expect(said(s, 'nurse', /^12-lead done/)).toBe(true);
    expect(s.reads[0]).toMatchObject({ answer: 'tcp', verdict: 'correct' });
    expect(review(sc, stop(s)).timings.find((x) => x.label === 'Door to 12-lead')).toMatchObject({ minute: 2, met: true });
  });

  it('a potassium left until it stops the pacer costs the doctor the calcium item — and cardiology needs the potassium', () => {
    // never measured: the wire goes in, the pacer and then the wire fail at 24, and only then the labs and the calcium
    const never = run(sc, 7, ['ems-handoff', 'sample', 'perfusion', 'lungs', 'atropine', 'pace', 'pulse-check', 'nibp', 'fentanyl', 'consult-cardiology', 'central-line',
      'temp-wire', 'cxr', ...R(3), 'labs', 'reassess', 'calcium-chloride', 'insulin-dextrose', 'admit', 'handoff']);
    expect(never.fired).toContain('k-rising');
    expect(said(never, 'consultant', /what is her potassium\?/)).toBe(true);
    const r = review(sc, never);
    expect(r.toFix.find((x) => x.label === 'Potassium 6.9 with a conduction block: IV calcium at once')?.kind).toBe('missed');
    expect(r.toFix.find((x) => x.label === 'Consult cardiology with the 12-lead and the potassium: a permanent pacemaker')?.kind).toBe('missed');
    expect(r.percent).toBeLessThan(90);
    // known at 5.7 and left: calcium only once the pacer has failed is no calcium "at once" either
    let left = run(sc, 7, [...DOCTOR_TO_PACE, 'pulse-check', 'nibp', 'fentanyl']);
    left = until(left, 'k-rising');
    expect(said(left, 'nurse', /^A repeat gas: potassium 7\.4/)).toBe(true);
    left = perform(sc, left, 'calcium-chloride');
    expect(left.rhythm).toEqual({ profile: 'tcp', hr: 70 });
    expect(missed(left)).toContain('Potassium 6.9 with a conduction block: IV calcium at once');
  });

  it('on the infusion with the potassium untreated, calcium brings back the infusion\'s rate, and she says how she is', () => {
    let s = run(sc, 7, ['ems-handoff', 'sample', 'perfusion', 'lungs', 'pressor']);
    expect(s.rhythm).toEqual({ profile: 'third-degree-avb', hr: 44 });
    s = until(s, 'k-rising');
    expect(s.rhythm.hr).toBe(26);
    expect(last(perform(sc, s, 'reassess')).text).toBe('Barely responding.');
    s = perform(sc, s, 'calcium-chloride');
    expect(s.rhythm).toEqual({ profile: 'third-degree-avb', hr: 44 });
    expect(s.vitals.sbp).toBeGreaterThanOrEqual(90);
  });
});
