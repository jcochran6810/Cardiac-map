import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '@/data/content';
import { resolveProfile } from '@/lib/ecg/profiles';
import { answerRead, criticalsFor, perform, review, start, stop, takeHint, unavailableReason } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { betaBlockerField as sc } from '@/lib/sim/scenario/scenarios/betaBlockerField';
import type { SimState } from '@/lib/sim/scenario/types';
import { UNTIL_ARRIVED, readAfter, runScenario as run } from './helpers';

const R = (n: number) => Array<string>(n).fill('reassess');
const penalties = (s: SimState) => s.penalties.map((p) => p.id);
const missed = (s: SimState) => review(sc, stop(s)).toFix.filter((t) => t.kind === 'missed').map((t) => t.label);
const map = (s: SimState) => Math.round((s.vitals.sbp + 2 * s.vitals.dbp) / 3);

/** The ideal run: pads, the 12-lead and the history first, then the glucose, glucagon and the epinephrine infusion, early transport */
const IDEAL = ['primary', 'pads', 'ecg12', 'sample', 'iv', 'glucose', 'dextrose', 'atropine', 'glucagon', 'pressor', 'med-control', 'transport-pci',
  UNTIL_ARRIVED, 'handoff'];
/** Another right way: pace before the drugs (with capture confirmed and analgesia), then glucagon and the infusion, to the nearest ED */
const PACED = ['primary', 'pads', 'ecg12', 'sample', 'iv', 'glucose', 'dextrose', 'pace', 'pulse-check', 'fentanyl', 'glucagon', 'pressor', 'notify',
  'transport-near', UNTIL_ARRIVED, 'handoff'];
/** Up to the point where she needs treating: monitored, history taken, IV in */
const READY = ['primary', 'pads', 'sample', 'iv'];

/** Every monitor line a run produced (none may name the rhythm or the diagnosis) */
const GIVEAWAY = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture|junctional|overdose|beta-blocker|toxic/i;
const BRITISH = /haem|aemia|ischaem|oedem|synchronis|equalis|hyperaem|centre|levell|manoeuvre|nebulis|analyse\b|organis|colour|\bgrey|litres|metres|optimis|minimis|catheteris|heparinis|recognis|shovell|ventricularis/i;

function fullMarks(s: SimState) {
  expect(s.ended?.reason).toBe('complete');
  expect(s.pulse).toBe(true);
  const r = review(sc, s);
  expect(r.toFix).toEqual([]);
  expect(r.penaltyPoints).toBe(0);
  expect(r.percent).toBe(100);
  expect(r.grade).toBe('Excellent');
  for (const t of r.timings) if (t.met !== null) expect(t.met, t.label).toBe(true);
}

describe('beta-blocker overdose (field): the case itself', () => {
  it('is a field case for the paramedic, built only from actions, rhythms and conditions that exist', () => {
    expect(sc.id).toBe('beta-blocker-overdose-field');
    expect(sc.setting).toBe('field');
    expect(sc.roles).toEqual([2]);
    expect(CONDITIONS[sc.conditionId!]).toBeDefined();
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe(sc.initial.rhythm.profile);
    expect(sc.problems).toContain('beta-blocker-overdose');
    for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `respond ${id}`).toBeDefined();
    for (const h of sc.harms) for (const id of h.actions) expect(INTERVENTION_BY_ID[id], `harm ${id}`).toBeDefined();
    for (const t of sc.timings ?? []) for (const id of t.actions) expect(INTERVENTION_BY_ID[id], `timing ${id}`).toBeDefined();
    const scope = new Set(interventionsFor(2, 'field').map((i) => i.id));
    for (const c of criticalsFor(sc, 2)) {
      const ids = Array.isArray(c.done) ? c.done : c.uses ?? [];
      expect(ids.some((id) => scope.has(id)), c.id).toBe(true);
    }
  });

  it('the ideal run ends by itself with full marks, and the 12-lead read is the junctional rhythm', () => {
    const s = run(sc, 2, IDEAL);
    fullMarks(s);
    expect(s.reads).toEqual([expect.objectContaining({ kind: 'ecg', answer: 'junctional', verdict: 'correct' })]);
    // glucagon and the infusion bring her round: the sinus node back, a MAP of 65 or more, awake
    expect(resolveProfile(s.rhythm.profile).rhythm).toBe('sinus');
    expect(s.rhythm.hr).toBeGreaterThanOrEqual(60);
    expect(map(s)).toBeGreaterThanOrEqual(65);
    expect(s.vitals.gcs).toBe(15);
  });

  it('pacing first, with capture confirmed and analgesia, then the drugs, is full marks too', () => {
    fullMarks(run(sc, 2, PACED));
  });

  it('a wrong 12-lead read costs points and is corrected at once', () => {
    const s = run(sc, 2, readAfter(IDEAL.slice(0, 3), 'ecg12', 'sinus-brady'), undefined, 'manual');
    expect(s.reads.at(-1)).toMatchObject({ answer: 'junctional', verdict: 'wrong' });
    expect(s.log.at(-1)).toMatchObject({ who: 'feedback', text: expect.stringMatching(/^Not quite — this is Junctional rhythm/) });
  });

  it('the 12-lead explanation names the drug only once the history is known', () => {
    const before = run(sc, 2, ['ecg12'], undefined, 'manual');
    expect(before.pendingRead?.explain).not.toMatch(/metoprolol/);
    const known = run(sc, 2, ['sample', 'ecg12'], undefined, 'manual');
    expect(known.pendingRead?.explain).toMatch(/metoprolol/);
  });

  it('every rhythm the case reaches is a real ECG profile inside its rate range', () => {
    const runs = [IDEAL, PACED, [...READY, 'diltiazem', ...R(4)], [...READY, ...R(14), 'cpr', 'epinephrine', 'cpr'], [...READY, 'glucagon', ...R(10)],
      [...READY, 'pace', ...R(14)], [...READY, 'epinephrine', 'pressor', 'glucagon', 'glucagon', 'push-epi', 'calcium-chloride', 'fluid', 'fluid']];
    for (const steps of runs) {
      run(sc, 2, steps, (s) => {
        const p = resolveProfile(s.rhythm.profile);
        expect(p.id, s.rhythm.profile).toBe(s.rhythm.profile);
        if (s.pulse) expect(s.rhythm.hr, s.rhythm.profile).toBeGreaterThanOrEqual(p.minHR);
        if (s.pulse) expect(s.rhythm.hr, s.rhythm.profile).toBeLessThanOrEqual(p.maxHR);
      });
    }
  });
});

describe('beta-blocker overdose (field): the right treatments work as they would', () => {
  it('atropine does little: a few beats, the same rhythm, the same low pressure', () => {
    const s = run(sc, 2, [...READY, 'atropine']);
    expect(s.rhythm).toEqual({ profile: 'junctional', hr: 42 });
    expect(s.vitals.sbp).toBeLessThan(80);
    expect(perform(sc, s, 'atropine').log.at(-1)!.text).toBe('No change in heart rate.');
    // and it wears off
    const later = run(sc, 2, [...READY, 'atropine', 'reassess', 'reassess', 'reassess']);
    expect(later.rhythm.hr).toBeLessThan(42);
  });

  it('glucagon raises the rate and the pressure, wakes the sinus node, makes her vomit and raises the glucose', () => {
    const base = run(sc, 2, READY);
    const s = perform(sc, base, 'glucagon');
    expect(s.rhythm.profile).toBe('sinus-bradycardia');
    expect(s.rhythm.hr).toBe(50);
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([86, 48]);
    expect(s.vitals.glucose).toBe(base.vitals.glucose + 30);
    expect(s.log.some((l) => /vomits/.test(l.text))).toBe(true);
    expect(s.log.some((l) => l.who === 'monitor' && l.text === 'Heart rate 50. BP 86/48.')).toBe(true);
    expect(penalties(s)).toEqual([]);
    // a second dose adds a little more
    const twice = perform(sc, s, 'glucagon');
    expect(twice.vitals.sbp).toBeGreaterThan(s.vitals.sbp);
    expect(twice.log.some((l) => /10 mg in all/.test(l.text))).toBe(true);
  });

  it('a glucagon bolus wears off within 15 minutes without an infusion behind it — and she gets worse', () => {
    let s = run(sc, 2, [...READY, 'glucagon']);
    const lifted = s.vitals.sbp;
    while (!s.fired.includes('glucagon-fades') && s.minute < 40) s = perform(sc, s, 'reassess');
    expect(s.fired).toContain('glucagon-fades');
    expect(s.fired).toContain('worse');
    expect(s.vitals.sbp).toBeLessThan(lifted);
    expect(s.rhythm.profile).toBe('junctional');
    // with the epinephrine infusion running, the pressure holds while the bolus fades
    let held = run(sc, 2, [...READY, 'glucagon', 'pressor']);
    const sbp = held.vitals.sbp;
    for (let i = 0; i < 12; i++) held = perform(sc, held, 'reassess');
    expect(held.fired).not.toContain('glucagon-fades');
    expect(held.vitals.sbp).toBe(sbp);
  });

  it('the epinephrine infusion raises the rate and the pressure; with glucagon she reaches a MAP of 65', () => {
    const alone = run(sc, 2, [...READY, 'pressor']);
    expect(alone.rhythm).toEqual({ profile: 'sinus-bradycardia', hr: 54 });
    expect(alone.vitals.sbp).toBe(92);
    const both = run(sc, 2, [...READY, 'glucagon', 'pressor']);
    expect(both.rhythm.profile).toBe('normal-sinus');
    expect(both.vitals.sbp).toBeGreaterThanOrEqual(100);
    expect(map(both)).toBeGreaterThanOrEqual(65);
    expect(both.log.at(-1)).toMatchObject({ who: 'monitor', text: expect.stringMatching(/^Epinephrine infusion started/), tone: 'good' });
  });

  it('pacing fixes the rate, not the squeeze: capture at 70, the pressure still low until the infusion', () => {
    let s = run(sc, 2, [...READY, 'pace']);
    expect(s.rhythm).toEqual({ profile: 'tcp', hr: 70 });
    expect(s.vitals.sbp).toBeLessThan(90);
    expect(penalties(s)).toEqual([]);
    // mechanical capture and analgesia are now critical items
    expect(missed(s)).toEqual(expect.arrayContaining(['Confirm mechanical capture with a pulse', 'Analgesia for pacing']));
    s = perform(sc, s, 'pulse-check');
    expect(s.log.at(-1)!.text).toMatch(/mechanical capture/);
    s = perform(sc, s, 'pressor');
    expect(s.rhythm).toEqual({ profile: 'tcp', hr: 70 });
    expect(s.vitals.sbp).toBeGreaterThanOrEqual(90);
  });

  it('a rate glucagon lifted to 50 with the pressure still low may be paced; a rate the drugs have fixed may not', () => {
    const lifted = run(sc, 2, [...READY, 'glucagon']);
    expect([lifted.rhythm.hr, lifted.vitals.sbp]).toEqual([50, 86]);
    const paced = perform(sc, lifted, 'pace');
    expect(paced.rhythm).toEqual({ profile: 'tcp', hr: 70 });
    expect(penalties(paced)).toEqual([]);
    // glucagon and the infusion running: a rate in the 60s and a systolic over 100 need no pacer — one penalty, the case's own
    const fixed = run(sc, 2, [...READY, 'glucagon', 'pressor', 'pace']);
    expect(penalties(fixed)).toEqual(['pace-not-slow']);
    expect(fixed.rhythm.profile).toBe('normal-sinus');
  });

  it('fentanyl just before the pacer goes on is premedication: no penalty, the analgesia item is done, and the pacing does not hurt', () => {
    const steps = ['primary', 'pads', 'ecg12', 'sample', 'iv', 'glucose', 'dextrose', 'fentanyl', 'pace', 'pulse-check', 'glucagon', 'pressor', 'med-control',
      'transport-pci', UNTIL_ARRIVED, 'handoff'];
    const s = run(sc, 2, steps);
    fullMarks(s);
    expect(s.flags.analgesia).toBeDefined();
    expect(s.log.some((l) => /stand it/.test(l.text))).toBe(true);
    expect(s.log.some((l) => /thumping in my chest hurts/.test(l.text))).toBe(false);
  });

  it('premedication the pacer never followed (or followed too late) costs points once, at the hand-off', () => {
    // fentanyl while she was slow and failing, then the drugs fixed her and nobody paced
    const unused = run(sc, 2, ['primary', 'pads', 'ecg12', 'sample', 'iv', 'glucose', 'dextrose', 'fentanyl', 'glucagon', 'pressor', 'med-control',
      'transport-pci', UNTIL_ARRIVED]);
    expect(penalties(unused)).toEqual([]);
    const handed = perform(sc, unused, 'handoff');
    expect(penalties(handed)).toEqual(['premed-no-pacing']);
    expect(handed.penalties[0].severity).toBe('minor');
    // given more than 5 minutes before the pacer: not premedication, so the pacing still needs its analgesia
    const early = run(sc, 2, [...READY, 'fentanyl', 'glucose', 'dextrose', 'ecg12', 'lungs', 'perfusion', 'neuro', 'pace']);
    expect(early.performed.at(-1)!.minute - early.performed.find((p) => p.id === 'fentanyl')!.minute).toBeGreaterThan(5);
    expect(missed(early)).toContain('Analgesia for pacing');
    expect(early.flags.analgesia).toBeUndefined();
    // and at the hand-off that early dose is the one the pacer did not follow
    expect(penalties(perform(sc, run(sc, 2, [...READY, 'fentanyl', 'glucose', 'dextrose', 'ecg12', 'lungs', 'perfusion', 'neuro', 'pace', 'fentanyl',
      'pulse-check', 'glucagon', 'pressor', 'med-control', 'transport-pci', UNTIL_ARRIVED]), 'handoff'))).toEqual(['premed-no-pacing']);
  });

  it('a patient paced once she no longer responds needs no analgesia item; capture still has to be confirmed', () => {
    let s = run(sc, 2, READY);
    while (!s.flags.obtunded) s = perform(sc, s, 'reassess');
    s = perform(sc, s, 'pace');
    expect(s.rhythm).toEqual({ profile: 'tcp', hr: 70 });
    expect(missed(s)).not.toContain('Analgesia for pacing');
    expect(missed(s)).toContain('Confirm mechanical capture with a pulse');
  });

  it('pacing alone holds the rate, not the poisoned heart: she still gets worse and stops protecting her airway, but does not arrest while it captures', () => {
    let s = run(sc, 2, [...READY, 'pace', 'pulse-check', 'fentanyl']);
    const start = s.vitals.sbp;
    while (s.minute < 34) s = perform(sc, s, 'reassess');
    expect(s.fired).toEqual(expect.arrayContaining(['worse', 'peri']));
    expect(s.fired).not.toContain('arrest-untreated');
    expect(s.pulse).toBe(true);
    expect(s.rhythm).toEqual({ profile: 'tcp', hr: 70 });
    expect(s.vitals.sbp).toBeLessThan(start);
    expect(s.vitals.gcs).toBeLessThanOrEqual(8);
    expect(missed(s)).toEqual(expect.arrayContaining(['Glucagon IV for the slow rate and the low pressure', 'Epinephrine infusion for the hypotension']));
    // the drugs still rescue her: the pressure comes back over 90
    s = perform(sc, perform(sc, s, 'glucagon'), 'pressor');
    expect(s.vitals.sbp).toBeGreaterThanOrEqual(90);
  });

  it('a second glucagon dose adds to the first only while the first still works', () => {
    let s = run(sc, 2, [...READY, 'glucagon']);
    while (!s.fired.includes('glucagon-fades')) s = perform(sc, s, 'reassess');
    const faded = s.rhythm.hr;
    s = perform(sc, s, 'glucagon');
    // a fresh single dose (+12), not the two overlapping doses (+16)
    expect(s.rhythm.hr).toBe(faded + 12);
  });

  it('the 12-lead shows the heart as it is when it is taken: a 1 mg epinephrine surge that has worn off is gone from it', () => {
    const s = run(sc, 2, [...READY, 'epinephrine', 'glucose', 'opqrst', 'lungs', 'perfusion', 'ecg12']);
    expect(s.reads.at(-1)).toMatchObject({ answer: 'junctional' });
    expect(s.rhythm).toEqual({ profile: 'junctional', hr: 38 });
    expect(s.vitals.sbp).toBeLessThan(90);
  });

  it('calcium is reasonable in this overdose: a little pressure, no penalty', () => {
    const base = run(sc, 2, READY);
    const s = perform(sc, base, 'calcium-chloride');
    expect(penalties(s)).toEqual([]);
    expect(s.vitals.sbp).toBe(base.vitals.sbp + 6);
  });

  it('fluid helps a little, twice; more boluses add nothing', () => {
    const s = run(sc, 2, [...READY, 'fluid', 'fluid', 'fluid']);
    expect(s.vitals.sbp).toBe(84);
    expect(penalties(s)).toEqual([]);
  });

  it('medical control needs to know what she took; then it brings in the poison center', () => {
    const s = run(sc, 2, ['primary', 'med-control']);
    expect(s.counts['med-control']).toBeUndefined();
    expect(s.minute).toBe(1);
    expect(s.log.at(-1)!.text).toMatch(/Find out what she took first/);
    const after = run(sc, 2, ['primary', 'sample', 'med-control']);
    expect(after.log.at(-1)).toMatchObject({ who: 'hospital', text: expect.stringMatching(/poison center/) });
    // a radio report before the history does not count as the consult
    expect(missed(run(sc, 2, ['primary', 'notify', 'sample']))).toContain('Expert advice early: medical control and the poison center');
  });

  it('the poison center asks what she took; once SAMPLE has found the bottle it advises as medical control does, and the call is the consult', () => {
    // before the history: the specialist's questions, never "no poisoning"
    const early = run(sc, 2, ['primary', 'poison-control']);
    expect(early.log.at(-1)).toMatchObject({ who: 'hospital', text: expect.stringMatching(/^Poison center: "Tell us what she took: read us the bottle/) });
    expect(early.log.at(-1)!.text).not.toMatch(/Nothing you describe/);
    expect(missed(early)).toContain('Expert advice early: medical control and the poison center');
    // the reviewers' run: primary, SAMPLE (the empty extended-release metoprolol bottle), the call
    const s = run(sc, 2, ['primary', 'sample', 'poison-control']);
    const advice = s.log.at(-1)!.text;
    expect(advice).toMatch(/^Poison center: "Extended-release metoprolol/);
    for (const part of [/glucagon/i, /epinephrine infusion to a MAP of 65/, /pace/, /glucose/, /high-dose insulin/, /24 hours/]) expect(advice).toMatch(part);
    expect(missed(s)).not.toContain('Expert advice early: medical control and the poison center');
    // a first call before the history can be followed by a real one
    expect(missed(run(sc, 2, ['primary', 'poison-control', 'sample', 'poison-control']))).not.toContain('Expert advice early: medical control and the poison center');
  });

  it('the push-dose and the arrest dose of epinephrine wear off; the arrest dose with a pulse is a critical error', () => {
    let s = run(sc, 2, [...READY, 'push-epi']);
    expect(s.vitals.sbp).toBe(90);
    s = run(sc, 2, [...READY, 'push-epi', ...R(3)]);
    expect(s.vitals.sbp).toBeLessThan(90);
    const bolus = run(sc, 2, [...READY, 'epinephrine']);
    expect(penalties(bolus)).toEqual(['arrest-epi-with-pulse']);
    expect(bolus.vitals.sbp).toBeGreaterThan(150);
    expect(run(sc, 2, [...READY, 'epinephrine', ...R(2)]).vitals.sbp).toBeLessThan(90);
  });

  it('a short-acting drug is recomputed when it wears off, not at the next assessment: the monitor shows her own rate again', () => {
    // the reviewers' run: push-dose epinephrine, then only questions and checks that do not recompute her
    const QUIET = ['sample', 'opqrst', 'perfusion', 'neuro', 'ask-pde5'];
    /** questions and checks (none of them recomputes her) until the clock reaches `until` */
    const idle = (from: SimState, until: number) => {
      let st = from;
      for (let i = 0; st.minute < until && i < 40; i++) {
        const id = QUIET.find((q) => !st.performed.some((p) => p.id === q)) ?? (i % 2 ? 'lungs' : 'glucose');
        expect(unavailableReason(sc, st, id), id).toBeNull();
        st = perform(sc, st, id);
      }
      expect(st.minute).toBeGreaterThanOrEqual(until);
      return st;
    };
    const before = run(sc, 2, ['monitor', 'iv']);
    let s = perform(sc, before, 'push-epi');
    expect(s.rhythm.hr).toBeGreaterThan(before.rhythm.hr);
    s = idle(s, s.timers.pushEpiUntil);
    expect(s.minute).toBeLessThan(10); // before she gets worse at 10 minutes
    expect(s.rhythm).toEqual(before.rhythm);
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([before.vitals.sbp, before.vitals.dbp]);
    expect(s.log.some((l) => l.text === 'The push-dose epinephrine has worn off.')).toBe(true);
    // a survey after it reads her as she is now
    s = perform(sc, s, 'primary');
    expect(s.log.at(-1)!.text).toMatch(new RegExp(`radial pulse ${before.rhythm.hr}/min`));
    // atropine and the 1 mg surge wear off the same way, each once
    let a = perform(sc, before, 'atropine');
    expect(a.rhythm.hr).toBeGreaterThan(before.rhythm.hr);
    a = idle(a, a.timers.atropineUntil);
    expect(a.rhythm.hr).toBe(before.rhythm.hr);
    a = idle(a, a.minute + 1);
    expect(a.log.filter((l) => l.text === 'The atropine has worn off.')).toHaveLength(1);
    let b = perform(sc, before, 'epinephrine');
    expect(b.vitals.sbp).toBeGreaterThan(150);
    b = idle(b, b.timers.epiBolusUntil);
    expect(b.vitals.sbp).toBe(before.vitals.sbp);
    // a second push dose, after the first wore off: it wears off too
    let twice = perform(sc, s, 'push-epi');
    expect(twice.rhythm.hr).toBeGreaterThan(before.rhythm.hr);
    twice = idle(twice, twice.timers.pushEpiUntil);
    expect(twice.log.filter((l) => l.text === 'The push-dose epinephrine has worn off.')).toHaveLength(2);
  });
});

describe('beta-blocker overdose (field): the glucose', () => {
  it('the check finds it low; IV dextrose corrects it and wakes her a little', () => {
    let s = run(sc, 2, [...READY, 'glucose']);
    expect(s.log.at(-1)!.text).toBe('Blood glucose 58 mg/dL.');
    expect(s.flags['low-glucose']).toBeDefined();
    expect(s.vitals.gcs).toBe(13);
    s = perform(sc, s, 'dextrose');
    expect(s.vitals.glucose).toBe(178);
    expect(s.vitals.gcs).toBe(14);
    expect(penalties(s)).toEqual([]);
  });

  it('no glucose check: the low glucose drags her consciousness down, and the review says so', () => {
    const s = run(sc, 2, [...READY, ...R(4)]);
    expect(s.fired).toContain('glucose-falls');
    expect(s.vitals.glucose).toBe(44);
    expect(s.vitals.gcs).toBeLessThan(12);
    expect(missed(s)).toContain('Check the blood glucose');
  });

  it('dextrose for a low glucose already found is never penalized, even after glucagon has raised it; blind dextrose over 70 is', () => {
    const checked = run(sc, 2, [...READY, 'glucose', 'glucagon', 'dextrose']);
    expect(checked.vitals.glucose).toBe(58 + 30 + 120);
    expect(penalties(checked)).toEqual([]);
    expect(review(sc, stop(checked)).toFix.some((t) => /low glucose/.test(t.label))).toBe(false);
    const blind = run(sc, 2, [...READY, 'glucagon', 'dextrose']);
    expect(penalties(blind)).toEqual(['glucose-not-low']);
    // the second dose after the first has corrected it is too much
    expect(penalties(run(sc, 2, [...READY, 'glucose', 'dextrose', 'dextrose']))).toEqual(['glucose-not-low']);
  });

  it('oral glucose that she swallows counts as correcting it', () => {
    const s = run(sc, 2, [...READY, 'glucose', 'oral-glucose']);
    expect(s.vitals.glucose).toBe(98);
    expect(penalties(s)).toEqual([]);
    expect(missed(s)).not.toContain('Correct the low glucose');
  });
});

describe('beta-blocker overdose (field): the traps', () => {
  it('repeating atropine with nothing else started, while the pressure falls, is penalized', () => {
    const s = run(sc, 2, [...READY, 'atropine', 'atropine', 'atropine', ...R(3)]);
    expect(penalties(s)).toEqual(['atropine-loop']);
    expect(s.fired).toContain('worse');
    expect(s.vitals.sbp).toBeLessThan(74);
    // once glucagon or the infusion is going, a further dose is no mistake
    expect(penalties(run(sc, 2, [...READY, 'atropine', 'glucagon', 'atropine', 'atropine']))).toEqual([]);
  });

  it('a calcium-channel blocker or more beta-blocker crashes her — and is a critical error', () => {
    for (const drug of ['diltiazem', 'metoprolol']) {
      const s = run(sc, 2, [...READY, drug]);
      expect(penalties(s), drug).toEqual(['av-blocker']);
      expect(s.penalties[0].severity).toBe('critical');
      expect(s.vitals.sbp, drug).toBe(54);
      expect(s.rhythm, drug).toEqual({ profile: 'junctional', hr: 35 });
      expect(review(sc, stop(s)).grade, drug).toBe('Unsafe');
      // a few minutes later, as the poison deepens, her circulation stops
      let later = s;
      while (later.pulse && later.minute < 20) later = perform(sc, later, 'reassess');
      expect(later.pulse, drug).toBe(false);
      expect(later.rhythm.profile).toBe('pea');
    }
  });

  it('with the pacer on, the blocker cannot drop the rate, but it drops the pressure', () => {
    const s = run(sc, 2, [...READY, 'pace', 'diltiazem']);
    expect(s.rhythm).toEqual({ profile: 'tcp', hr: 70 });
    expect(s.vitals.sbp).toBeLessThan(74);
    expect(penalties(s)).toEqual(['av-blocker']);
  });

  it('an antiarrhythmic for a slow rhythm is one critical error (it stands in for the engine\'s procainamide rules)', () => {
    for (const drug of ['amio-infusion', 'procainamide', 'lidocaine', 'amio-arrest']) {
      const base = run(sc, 2, READY);
      const s = perform(sc, base, drug);
      expect(penalties(s), drug).toEqual(['antiarrhythmic-brady']);
      expect(s.vitals.sbp, drug).toBeLessThan(base.vitals.sbp);
    }
  });

  it('the potassium dose of albuterol gives no rate back (and keeps the rhythm a real one): a minor error', () => {
    // with glucagon running she is at 50 on her own sinus node; the engine's default would push it past 59 and leave it "sinus bradycardia"
    const base = run(sc, 2, [...READY, 'glucagon']);
    const s = perform(sc, base, 'albuterol-hyperk');
    expect(penalties(s)).toEqual(['albuterol-hyperk-no-indication']);
    expect(s.rhythm).toEqual(base.rhythm);
    const p = resolveProfile(s.rhythm.profile);
    expect(s.rhythm.hr).toBeLessThanOrEqual(p.maxHR);
  });

  it('amiodarone or lidocaine in her arrest (an organized rhythm without a pulse) is a minor error, once', () => {
    const arrested = run(sc, 2, [...READY, ...R(14)]);
    expect(arrested.pulse).toBe(false);
    const s = run(sc, 2, [...READY, ...R(14), 'amio-arrest', 'lidocaine']);
    expect(penalties(s)).toEqual(['antiarrhythmic-pea']);
    expect(s.penalties[0].severity).toBe('minor');
  });

  it('adenosine and a vagal maneuver slow her further for seconds and cost points', () => {
    const s = run(sc, 2, [...READY, 'adenosine6']);
    expect(penalties(s)).toEqual(['adenosine-brady']);
    expect(s.log.at(-1)!.text).toMatch(/no QRS complexes/);
    expect(s.rhythm).toEqual({ profile: 'junctional', hr: 38 });
    expect(penalties(run(sc, 2, [...READY, 'vagal']))).toEqual(['vagal-brady']);
  });

  it('other drugs with no indication cost points, and only once each', () => {
    expect(penalties(run(sc, 2, [...READY, 'sodium-bicarbonate']))).toEqual(['bicarbonate-no-indication']);
    expect(penalties(run(sc, 2, [...READY, 'magnesium-sulfate']))).toEqual(['magnesium-no-indication']);
    expect(penalties(run(sc, 2, [...READY, 'nitro']))).toEqual(['nitro-hypotension']);
    expect(penalties(run(sc, 2, [...READY, 'cpap']))).toEqual(['cpap-shock']);
    // once the drugs have fixed the rate and the pressure there is no pacing to cover: an opioid or a sedative costs at once
    expect(penalties(run(sc, 2, [...READY, 'glucagon', 'pressor', 'fentanyl', 'sedation']))).toEqual(['sedative-no-indication']);
    expect(penalties(run(sc, 2, [...READY, 'albuterol-hyperk']))).toEqual(['albuterol-hyperk-no-indication']);
    // an awake patient is no candidate for an advanced airway
    expect(penalties(run(sc, 2, [...READY, 'airway']))).toEqual(['airway-awake']);
  });

  it('a STEMI alert for a 12-lead without ST elevation costs points, and the cardiologist declines it', () => {
    const s = run(sc, 2, ['primary', 'pads', 'ecg12', 'stemi-alert']);
    expect(penalties(s)).toEqual(['false-stemi-alert']);
    expect(s.flags.alert).toBeUndefined();
    expect(s.log.at(-1)).toMatchObject({ who: 'hospital', text: expect.stringMatching(/not activated/) });
  });

  it('a drug that dropped her pressure keeps it lower: getting worse never brings it back up', () => {
    let s = run(sc, 2, [...READY, 'nitro']);
    const low = s.vitals.sbp;
    while (!s.fired.includes('worse')) s = perform(sc, s, 'reassess');
    expect(s.vitals.sbp).toBeLessThan(low);
    expect(s.log.some((l) => l.who === 'monitor' && l.text === `Heart rate ${s.rhythm.hr}. BP ${s.vitals.sbp}/${s.vitals.dbp}.`)).toBe(true);
  });
});

describe('beta-blocker overdose (field): delay', () => {
  it('untreated she gets worse at 10 minutes, stops protecting her airway by 20 and arrests', () => {
    let s = run(sc, 2, READY);
    const at = (id: string) => { while (!s.fired.includes(id) && s.minute < 60 && s.pulse) s = perform(sc, s, 'reassess'); return s.minute; };
    expect(at('worse')).toBeGreaterThanOrEqual(10);
    expect(at('peri')).toBeGreaterThanOrEqual(20);
    expect(s.flags.obtunded).toBeDefined();
    expect(s.vitals.gcs).toBeLessThanOrEqual(8);
    expect(missed(s)).toContain('Support her breathing once she cannot protect her airway');
    at('arrest-untreated');
    expect(s.pulse).toBe(false);
    expect(s.rhythm.profile).toBe('pea');
  });

  it('in the arrest, CPR and epinephrine bring a pulse back; without them she dies', () => {
    const arrested = run(sc, 2, [...READY, ...R(14)]);
    expect(arrested.pulse).toBe(false);
    const s = run(sc, 2, [...READY, ...R(14), 'cpr', 'epinephrine', 'cpr']);
    expect(s.pulse).toBe(true);
    expect(s.flags.rosc).toBeDefined();
    expect(s.vitals.gcs).toBeLessThanOrEqual(8);
    // the arrest dose in the arrest is right
    expect(penalties(s)).not.toContain('arrest-epi-with-pulse');
    let dead = arrested;
    for (let i = 0; i < 10 && !dead.ended; i++) dead = perform(sc, dead, 'reassess');
    expect(dead.ended?.reason).toBe('death');
    expect(review(sc, dead).percent).toBeLessThanOrEqual(40);
  });

  it('her arrest is scored as an arrest: CPR at once and epinephrine as soon as possible — only once she has arrested', () => {
    const cpr = 'Cardiac arrest: CPR at once';
    const epi = 'Cardiac arrest: epinephrine as soon as possible';
    // the reviewers' run: metoprolol and diltiazem crash her into PEA, and the crew reassesses before starting CPR
    let s = run(sc, 2, ['primary', 'monitor', 'iv', 'metoprolol', 'diltiazem']);
    while (s.pulse && s.minute < 30) s = perform(sc, s, 'reassess');
    expect(s.pulse).toBe(false);
    const late = run(sc, 2, ['primary', 'monitor', 'iv', 'metoprolol', 'diltiazem', ...R(s.performed.length - 5), 'reassess', 'reassess', 'cpr', 'epinephrine', 'cpr']);
    expect(late.pulse).toBe(true);
    const r = review(sc, stop(late));
    expect(r.toFix.find((t) => t.label === cpr)?.kind).toBe('late');
    expect(r.toFix.find((t) => t.label === epi)?.kind).toBe('late');
    // CPR straight away, epinephrine with the second cycle: both on time
    const prompt = run(sc, 2, ['primary', 'monitor', 'iv', 'metoprolol', 'diltiazem', ...R(s.performed.length - 5), 'cpr', 'epinephrine', 'cpr']);
    expect(prompt.pulse).toBe(true);
    const good = review(sc, stop(prompt)).wentWell.map((w) => w.label);
    expect(good).toEqual(expect.arrayContaining([cpr, epi]));
    // no arrest, no item: the ideal run is untouched
    const ideal = review(sc, run(sc, 2, IDEAL));
    expect([...ideal.wentWell, ...ideal.toFix].map((t) => t.label)).not.toEqual(expect.arrayContaining([cpr]));
    expect([...ideal.wentWell, ...ideal.toFix].map((t) => t.label)).not.toEqual(expect.arrayContaining([epi]));
  });

  it('a hint in her arrest names CPR and epinephrine until a pulse returns — never the pacing pads or the 12-lead', () => {
    // the reviewers' run: metoprolol and diltiazem crash her into PEA, and the hint said "Monitor and pacing pads on at once"
    let s = run(sc, 2, ['primary', 'monitor', 'iv', 'metoprolol', 'diltiazem']);
    while (s.pulse && s.minute < 30) s = perform(sc, s, 'reassess');
    expect(s.pulse).toBe(false);
    const hint = (x: SimState) => takeHint(sc, x).log.at(-1)!.text;
    expect(hint(s)).toMatch(/^Hint: Cardiac arrest: CPR at once\./);
    s = perform(sc, s, 'cpr');
    expect(hint(s)).toMatch(/^Hint: Cardiac arrest: epinephrine as soon as possible\./);
    s = perform(sc, s, 'epinephrine');
    // still no pulse after one cycle and the epinephrine: the hint keeps to the resuscitation
    expect(s.pulse).toBe(false);
    expect(hint(s)).toMatch(/^Hint: Cardiac arrest: keep up CPR cycles until a pulse returns\./);
    for (const x of [hint(s), hint(perform(sc, s, 'reassess'))]) expect(x).not.toMatch(/pads|pace in seconds|12-lead/);
    s = perform(sc, s, 'cpr');
    expect(s.pulse).toBe(true);
    // before SAMPLE an arrest hint names no drug the history has not found yet
    expect(sc.critical.find((c) => c.id === 'arrest-cpr')!.why).not.toMatch(/glucagon/i);
    // the item is scored only in an arrest, and met by the pulse coming back
    const r = review(sc, stop(s));
    expect(r.wentWell.map((w) => w.label)).toContain('Cardiac arrest: keep up CPR cycles until a pulse returns');
    const ideal = review(sc, run(sc, 2, IDEAL));
    expect([...ideal.wentWell, ...ideal.toFix].map((t) => t.label)).not.toContain('Cardiac arrest: keep up CPR cycles until a pulse returns');
  });

  it('a call back in her arrest gets the arrest\'s orders — no pacing, no glucagon, no infusion until ROSC — and following them costs nothing', () => {
    // the reviewers' run: SAMPLE, a first call, then nothing until she arrests, and a second call (pads and a line on)
    let s = run(sc, 2, [...READY, 'med-control']);
    expect(s.log.at(-1)!.text).toMatch(/Glucagon 5 mg IV, once more if needed; an epinephrine infusion to a MAP of 65; pace if she stays slow/);
    while (s.pulse && s.minute < 60) s = perform(sc, s, 'reassess');
    expect(s.pulse).toBe(false);
    s = perform(sc, s, 'med-control');
    expect(s.counts['med-control']).toBe(2);
    const [now, later] = s.log.at(-1)!.text.split('Call me back with ROSC');
    expect(now).toMatch(/^Medical control, with the poison center on the line: no pulse — CPR and epinephrine 1 mg every 3–5 minutes, and work the arrest on scene; no pacing in arrest\. Glucagon will not restart her either\./);
    expect(now).not.toMatch(/\bpace\b|Glucagon 5 mg|second 5 mg|infusion/);
    expect(later).toMatch(/then an epinephrine infusion to a MAP of 65/);
    const before = penalties(s);
    for (const id of ['cpr', 'epinephrine', 'cpr']) s = perform(sc, s, id);
    expect(s.pulse).toBe(true);
    expect(penalties(s)).toEqual(before);
    // the poison center answers the same way in the arrest; before SAMPLE neither names the drug's antidote
    const arrested = run(sc, 2, [...READY, ...R(14)]);
    const poison = perform(sc, arrested, 'poison-control').log.at(-1)!.text;
    expect(poison).toMatch(/^Poison center: "She has no pulse — CPR and epinephrine 1 mg every 3–5 minutes.*no pacing in arrest/);
    expect(poison).not.toMatch(/pace if|Glucagon 5 mg/);
    let unknown = run(sc, 2, ['primary', 'pads', 'iv']);
    while (unknown.pulse && unknown.minute < 60) unknown = perform(sc, unknown, 'reassess');
    const call = perform(sc, unknown, 'med-control');
    expect(call.counts['med-control']).toBe(1);
    expect(call.log.at(-1)!.text).toMatch(/^Medical control: no pulse — CPR.*Find out from her sister what she took/);
    expect(call.log.at(-1)!.text).not.toMatch(/glucagon|metoprolol/i);
  });

  it('a call back with a pulse answers for what has been given: no glucagon past its two doses, the infusion titrated once it runs', () => {
    const s = run(sc, 2, [...READY, 'glucose', 'dextrose', 'glucagon', 'glucagon', 'pressor', 'med-control']);
    const said = s.log.at(-1)!.text;
    expect(said).toMatch(/The glucagon is used up; titrate the epinephrine infusion to a MAP of 65; pace if she stays slow; recheck her glucose/);
    expect(said).not.toMatch(/Glucagon 5 mg|once more if needed/);
    expect(perform(sc, run(sc, 2, [...READY, 'glucagon']), 'poison-control').log.at(-1)!.text).toMatch(/A second 5 mg of glucagon if she is still slow/);
  });

  it('glucagon given in the arrest changes nothing and does not count as the glucagon she needed', () => {
    const s = run(sc, 2, [...READY, ...R(14), 'glucagon']);
    expect(s.pulse).toBe(false);
    expect(s.log.at(-1)!.text).toMatch(/in the arrest it changes nothing on the monitor: CPR and epinephrine come first/);
    expect(missed(s)).toContain('Glucagon IV for the slow rate and the low pressure');
  });

  it('late glucagon and a late infusion earn half marks', () => {
    const s = run(sc, 2, ['primary', 'pads', 'ecg12', 'sample', 'iv', 'glucose', 'dextrose', ...R(4), 'glucagon', ...R(2), 'pressor']);
    const late = review(sc, stop(s)).toFix.filter((t) => t.kind === 'late').map((t) => t.label);
    expect(late).toEqual(expect.arrayContaining(['Glucagon IV for the slow rate and the low pressure']));
  });

  it('a hand-off is only possible on arrival', () => {
    const s = run(sc, 2, [...READY, 'handoff']);
    expect(s.counts.handoff).toBeUndefined();
    expect(unavailableReason(sc, start(sc, 2), 'insulin-dextrose')).toMatch(/scope/);
  });
});

describe('beta-blocker overdose (field): what the learner reads', () => {
  const RUNS = [
    IDEAL, PACED, [...READY, 'atropine', 'atropine', 'atropine', ...R(3)], [...READY, 'diltiazem', ...R(4)], [...READY, 'glucagon', ...R(10)],
    [...READY, ...R(14), 'cpr', 'epinephrine', 'cpr', 'bvm', 'pressor', 'glucagon'], [...READY, 'adenosine6', 'adenosine12', 'vagal', 'push-epi', 'epinephrine'],
    [...READY, 'pace', 'diltiazem', 'atropine', 'adenosine6'],
    [...READY, 'fentanyl', 'pace', 'pulse-check', ...R(14)], ['primary', 'pads', 'ecg12', 'stemi-alert', 'sample', 'iv', 'epinephrine', ...R(2), 'ecg12-repeat'],
  ];

  it('a hint before the history points to the question, never to the drug', () => {
    let s = start(sc, 2);
    for (const id of ['primary', 'pads', 'ecg12']) {
      s = takeHint(sc, s);
      s = perform(sc, s, id);
      while (s.pendingRead) s = answerRead(sc, s, s.pendingRead.answer);
    }
    s = takeHint(sc, s);
    const hints = s.log.filter((l) => l.who === 'system' && /^Hint/.test(l.text));
    expect(hints.at(-1)!.text).toMatch(/what she took/);
    for (const h of hints) expect(h.text, h.text).not.toMatch(/metoprolol|beta-blocker|propranolol|sotalol/i);
  });

  it('no monitor or event line names the rhythm or the diagnosis', () => {
    for (const steps of RUNS) {
      const s = run(sc, 2, steps);
      for (const l of s.log) if (l.who === 'monitor') expect(l.text, l.text).not.toMatch(GIVEAWAY);
      // the events speak through the partner: they describe her, never name what she has
      for (const l of s.log) if (l.who === 'partner') expect(l.text, l.text).not.toMatch(GIVEAWAY);
    }
  });

  it('every text uses US spelling', () => {
    expect(JSON.stringify(sc)).not.toMatch(BRITISH);
    for (const steps of RUNS) for (const l of run(sc, 2, steps).log) expect(l.text).not.toMatch(BRITISH);
  });

  it('teaches the 2025 AHA poisoning recommendations and the poison center number', () => {
    const text = [...sc.teaching, ...sc.critical.map((c) => c.why)].join(' ');
    expect(text).toMatch(/glucagon[^.]*0\.05–0\.15 mg\/kg/i);
    expect(text).toMatch(/vasopressor is recommended/);
    expect(text).toMatch(/high-dose insulin/);
    // class 1 in the 2023 update: for hypotension refractory to, or alongside, vasopressors; 1 unit/kg, then 1–10 units/kg/h
    expect(text).toMatch(/high-dose insulin is recommended for hypotension despite, or alongside, vasopressors[^.]*1–10 units\/kg\/h/);
    expect(text).toMatch(/lipid emulsion is not likely to help/);
    expect(text).toMatch(/ECMO/);
    expect(text).toMatch(/1-800-222-1222/);
    expect(text).toMatch(/extended-release/i);
  });
});
