import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '@/data/content';
import { resolveProfile } from '@/lib/ecg/profiles';
import { criticalsFor, perform, review, start, stop, takeHint } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { afRvrField as sc } from '@/lib/sim/scenario/scenarios/afRvrField';
import type { SimState } from '@/lib/sim/scenario/types';
import { UNTIL_ARRIVED, readAfter, runScenario as run } from './helpers';

/** The ideal paramedic run (the lead copies it into tests/scenarios.test.ts when the case is registered) */
const IDEAL = ['primary', 'vitals', 'monitor', 'ecg12', 'opqrst', 'sample', 'lungs', 'iv', 'amio-infusion', 'transport-near', UNTIL_ARRIVED, 'handoff'];
/** Assessed, history taken and a line in, before any drug (minute 9.5) */
const READY = IDEAL.slice(0, IDEAL.indexOf('amio-infusion'));
/** After a conversion: the 12-lead in sinus rhythm, transport and hand-off */
const AFTER_CONVERSION = ['ecg12-repeat', 'transport-near', UNTIL_ARRIVED, 'handoff'];

const R = (n: number) => Array<string>(n).fill('reassess');
const ids = (s: SimState) => s.penalties.map((p) => p.id);
const giveaway = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture/i;
const BRITISH = /haem|aemia|ischaem|oedem|synchronis|equalis|hyperaem|centre|levell|manoeuvre|nebulis|analyse\b|organis|colour|\bgrey|litres|metres|optimis|minimis|catheteris|heparinis|recognis|shovell|ventricularis/i;

/** Every path the tests below play, for the checks that apply to all of them */
const PATHS: string[][] = [
  IDEAL,
  [...READY, 'diltiazem', 'calcium-chloride', 'cardiovert', ...AFTER_CONVERSION],
  [...READY, ...R(3), 'sedation', 'cardiovert', ...AFTER_CONVERSION],
  [...READY, 'metoprolol', 'procainamide', 'cardiovert'],
  [...READY, 'adenosine6', 'adenosine12', 'vagal', 'push-epi', 'fluid', 'cpap'],
  [...READY, 'defib', 'defib', 'ecg12-repeat', 'med-control', 'reassess'],
  [...READY, 'sedation', 'cardiovert', 'aspirin', 'med-control'],
  [...READY, 'amio-arrest', 'cpap', 'pressor', 'neuro', 'perfusion'],
  [...READY, 'nitro', 'atropine', 'albuterol', 'epi-im', 'stemi-alert', 'epinephrine', 'lungs', 'perfusion', 'reassess'],
  [...READY, 'diltiazem', ...R(5), 'lungs', 'perfusion', 'neuro'],
  [...READY, 'fluid', 'fluid', 'lungs', 'fentanyl', 'cardiovert', 'reassess'],
  ['primary', 'med-control', 'vitals', 'monitor', 'pads', 'ecg12', 'sample', 'opqrst', 'lungs', 'iv', 'amio-infusion', 'transport-near', UNTIL_ARRIVED, 'handoff'],
];

/** The lead's view of a play-through: the patient never leaves what a living circulation can show */
function physiological(s: SimState) {
  const v = s.vitals;
  if (s.pulse) {
    expect(v.sbp, `sbp at ${s.minute}`).toBeGreaterThanOrEqual(50);
    expect(v.sbp, `sbp at ${s.minute}`).toBeLessThanOrEqual(200);
    expect(v.dbp, `dbp at ${s.minute}`).toBeLessThan(v.sbp);
    expect(s.rhythm.hr, `rate at ${s.minute}`).toBeLessThanOrEqual(180);
    // the rate goes with the rhythm: sinus after a synchronized shock, faster after the VF
    if (s.rhythm.profile === 'normal-sinus') expect(s.rhythm.hr).toBeLessThan(100);
    if (s.rhythm.profile === 'sinus-tachycardia') expect(s.rhythm.hr).toBeGreaterThanOrEqual(100);
  } else {
    expect(s.rhythm.profile).toBe('vf');
  }
  expect(v.spo2).toBeLessThanOrEqual(100);
  expect(v.spo2).toBeGreaterThanOrEqual(80);
  expect(v.gcs).toBeGreaterThanOrEqual(3);
}

describe('AF with a rapid ventricular response in a weak heart', () => {
  it('only refers to interventions, rhythms and a condition that exist, and each critical item is in the paramedic\'s scope', () => {
    expect(CONDITIONS[sc.conditionId!]).toBeDefined();
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe(sc.initial.rhythm.profile);
    for (const id of Object.keys(sc.respond)) expect(INTERVENTION_BY_ID[id], `respond ${id}`).toBeDefined();
    for (const h of sc.harms) for (const id of h.actions) expect(INTERVENTION_BY_ID[id], `harm ${id}`).toBeDefined();
    for (const t of sc.timings ?? []) for (const id of t.actions) expect(INTERVENTION_BY_ID[id], `timing ${id}`).toBeDefined();
    const scope = new Set(interventionsFor(2, 'field').map((i) => i.id));
    for (const c of criticalsFor(sc, 2)) {
      const ways = typeof c.done === 'function' ? c.uses ?? [] : c.done;
      expect(ways.some((id) => scope.has(id)), c.id).toBe(true);
    }
    // the case says what the built-in drug rules need to know: a weak heart, and fluid backing up into the lungs
    expect(sc.problems).toEqual(['heart-failure', 'pulmonary-edema']);
  });

  it('the ideal run ends by itself with full marks', () => {
    const s = run(sc, 2, IDEAL);
    expect(s.ended?.reason).toBe('complete');
    expect(s.pulse).toBe(true);
    const r = review(sc, s);
    expect(r.toFix).toEqual([]);
    expect(r.penaltyPoints).toBe(0);
    expect(r.percent).toBe(100);
    expect(r.grade).toBe('Excellent');
    expect(r.missed).toBe(0);
    for (const t of r.timings) if (t.met !== null) expect(t.met, t.label).toBe(true);
    expect(s.reads).toEqual([expect.objectContaining({ kind: 'ecg', answer: 'afib', verdict: 'correct' })]);
    // amiodarone brought the rate down en route, and he never decompensated
    expect(s.fired).toContain('rate-down');
    expect(s.fired).not.toContain('worse');
    expect(s.rhythm).toEqual({ profile: 'atrial-fibrillation', hr: 108 });
  });

  it('the same run with the 12-lead read given by hand scores the same', () => {
    const s = run(sc, 2, readAfter(IDEAL, 'ecg12', 'afib'), undefined, 'manual');
    expect(s.ended?.reason).toBe('complete');
    expect(review(sc, s).percent).toBe(100);
  });

  it('every rhythm a path can reach is a real ECG profile; no monitor or event line names the rhythm; all text is in US spelling', () => {
    expect(JSON.stringify(sc)).not.toMatch(BRITISH);
    for (const steps of PATHS) {
      const s = run(sc, 2, steps, (st) => {
        expect(resolveProfile(st.rhythm.profile).id, st.rhythm.profile).toBe(st.rhythm.profile);
        physiological(st);
      });
      for (const l of s.log) {
        if (l.who === 'monitor' || l.who === 'partner') expect(l.text, l.text).not.toMatch(giveaway);
        expect(l.text).not.toMatch(BRITISH);
      }
    }
  });

  it('the history shows the weak heart and the missing anticoagulant; the onset time is under 48 hours', () => {
    const s = run(sc, 2, ['opqrst', 'sample']);
    const said = s.log.filter((l) => l.who === 'patient').map((l) => l.text).join(' ');
    expect(said).toMatch(/ejection fraction 30 %/);
    expect(said).toMatch(/carvedilol/);
    expect(said).toMatch(/no blood thinner/);
    expect(said).toMatch(/three hours ago/);
  });

  it('diltiazem drops the pressure of the weak heart: a critical error, and he becomes unstable', () => {
    const s = run(sc, 2, [...READY, 'diltiazem']);
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([78, 46]);
    expect(s.rhythm).toEqual({ profile: 'atrial-fibrillation', hr: 128 });
    expect(s.flags.unstable).toBeDefined();
    expect(s.penalties).toEqual([expect.objectContaining({ id: 'diltiazem-hfref', severity: 'critical', points: 25 })]);
    expect(s.log.some((l) => l.who === 'monitor' && /BP falls to 78\/46/.test(l.text))).toBe(true);
  });

  it('after diltiazem, a synchronized shock at 200 J rescues him — the mistake still costs more than the rescue earns', () => {
    const s = run(sc, 2, [...READY, 'diltiazem', 'cardiovert', ...AFTER_CONVERSION]);
    expect(s.ended?.reason).toBe('complete');
    expect(s.rhythm).toEqual({ profile: 'normal-sinus', hr: 92 });
    expect(s.log.some((l) => l.who === 'monitor' && /200 J/.test(l.text))).toBe(true);
    // a drowsy, hypotensive patient may be shocked without sedation: no stable-shock and no sedation penalty
    expect(ids(s)).toEqual(['diltiazem-hfref']);
    expect(s.reads.map((r) => r.answer)).toEqual(['afib', 'nsr']);
    const r = review(sc, s);
    expect(r.wentWell.some((w) => /^Unstable: synchronized cardioversion/.test(w.label))).toBe(true);
    expect(r.percent).toBeLessThan(75);
    expect(r.grade).toBe('Needs practice');
  });

  it('calcium chloride reverses part of what diltiazem did, at no cost; without diltiazem it has no indication', () => {
    const s = run(sc, 2, [...READY, 'diltiazem', 'calcium-chloride']);
    expect(ids(s)).toEqual(['diltiazem-hfref']);
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([92, 56]);
    // the rate is still the problem: he stays unstable until he is shocked
    expect(s.rhythm.profile).toBe('atrial-fibrillation');
    expect(ids(run(sc, 2, [...READY, 'calcium-chloride']))).toEqual(['calcium-no-indication']);
  });

  it('left at a rate near 150, the weak heart decompensates: then the shock is right, and late rate control costs half', () => {
    let s = run(sc, 2, [...READY, ...R(3)]);
    expect(s.fired).toContain('worse');
    expect([s.vitals.sbp, s.vitals.dbp, s.vitals.spo2, s.vitals.gcs]).toEqual([86, 54, 88, 13]);
    expect(s.flags.unstable).toBeGreaterThanOrEqual(14);
    expect(s.log.some((l) => l.who === 'monitor' && l.text === 'BP 86/54. SpO₂ 88%.')).toBe(true);
    expect(sc.facts.lungs instanceof Function && sc.facts.lungs(s)).toMatch(/halfway up/);
    s = perform(sc, s, 'cardiovert');
    expect(s.rhythm.profile).toBe('normal-sinus');
    expect(s.vitals.sbp).toBeGreaterThanOrEqual(100);
    expect(ids(s)).toEqual([]);
    s = run(sc, 2, [...READY, ...R(3), 'cardiovert', ...AFTER_CONVERSION]);
    const r = review(sc, s);
    expect(r.toFix.find((t) => t.kind === 'late')?.label).toMatch(/^Control the rate safely/);
    expect(r.wentWell.some((w) => /^Unstable: synchronized cardioversion/.test(w.label))).toBe(true);
  });

  it('once he is unstable an infusion is the wrong answer: it drops the pressure, does not count and does not work', () => {
    let s = run(sc, 2, [...READY, ...R(3), 'amio-infusion']);
    expect(ids(s)).toEqual(['antiarrhythmic-unstable']);
    expect(s.vitals.sbp).toBeLessThan(86);
    s = run(sc, 2, [...READY, ...R(3), 'amio-infusion', ...R(4)]);
    expect(s.fired).not.toContain('rate-down');
    expect(s.rhythm.hr).toBe(148);
    expect(review(sc, stop(s)).toFix.find((t) => /^Control the rate safely/.test(t.label))?.kind).toBe('missed');
  });

  it('amiodarone slows the rate over the next minutes and keeps him from decompensating', () => {
    let s = run(sc, 2, [...READY, 'amio-infusion']);
    expect(s.rhythm.hr).toBe(132);
    expect(ids(s)).toEqual([]);
    s = run(sc, 2, [...READY, 'amio-infusion', ...R(4)]);
    expect(s.minute).toBeGreaterThan(14);
    expect(s.fired).toContain('rate-down');
    expect(s.fired).not.toContain('worse');
    expect(s.rhythm.hr).toBe(108);
    expect(s.vitals.spo2).toBeGreaterThanOrEqual(95);
    expect(sc.status!(s)).toMatch(/better/);
  });

  it('IV metoprolol on top of his carvedilol: the pressure falls, the rate barely moves, and he still decompensates — with fluid on his lungs it is ruled out', () => {
    let s = run(sc, 2, [...READY, 'metoprolol']);
    // decompensated heart failure is a label contraindication (major): the case says it in its own words, at that weight
    expect(ids(s)).toEqual(['metoprolol-decompensated']);
    expect(s.penalties[0]).toMatchObject({ points: 8, severity: 'major' });
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([98, 66]);
    expect(s.rhythm.hr).toBe(136);
    s = run(sc, 2, [...READY, 'metoprolol', ...R(3)]);
    expect(s.fired).toContain('worse');
    expect(s.flags.unstable).toBeDefined();
  });

  it('a pressure pushed under 90 by the drugs makes him unstable too', () => {
    const s = run(sc, 2, [...READY, 'metoprolol', 'procainamide']);
    expect(s.vitals.sbp).toBeLessThan(90);
    expect(s.fired).toContain('hypotensive');
    expect(s.flags.unstable).toBeDefined();
    expect(ids(s)).toEqual(['metoprolol-decompensated', 'procainamide-heart-failure']);
  });

  it('procainamide in heart failure is a major error; given once he is unstable it costs once, in the case\'s words, not twice', () => {
    const s = run(sc, 2, [...READY, 'procainamide']);
    expect(ids(s)).toEqual(['procainamide-heart-failure']);
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([94, 64]);
    const unstable = run(sc, 2, [...READY, 'diltiazem', 'procainamide']);
    // one dose, one penalty: the low pressure outranks the failing heart, and the case's rule speaks for that
    expect(ids(unstable)).toEqual(['diltiazem-hfref', 'antiarrhythmic-unstable']);
    expect(ids(unstable)).not.toContain('procainamide-hypotension');
    // metoprolol once he is unstable: the case's unstable-patient rule alone, not also its decompensation rule
    expect(ids(run(sc, 2, [...READY, 'diltiazem', 'metoprolol']))).toEqual(['diltiazem-hfref', 'antiarrhythmic-unstable']);
    // …and once that rule was charged on an earlier drug, metoprolol is judged on its own: it never goes free
    expect(ids(run(sc, 2, [...READY, 'diltiazem', 'procainamide', 'metoprolol']))).toEqual(['diltiazem-hfref', 'antiarrhythmic-unstable', 'metoprolol-decompensated']);
  });

  it('adenosine does not convert it: the same rhythm comes straight back, and it costs once', () => {
    const s = run(sc, 2, [...READY, 'adenosine6', 'adenosine12']);
    expect(s.rhythm).toEqual({ profile: 'atrial-fibrillation', hr: 148 });
    expect(ids(s)).toEqual(['adenosine-af']);
  });

  it('starting stroke prevention in the field is a mistake: aspirin is not anticoagulation, and it is the hospital\'s decision', () => {
    const s = run(sc, 2, ['primary', 'aspirin']);
    expect(ids(s)).toEqual(['aspirin-anticoagulation']);
    expect(s.penalties[0].text).toMatch(/decided at the hospital/);
  });

  it('a sedated shock while he is stable is a judgment call: a small, explained deduction; unsedated it costs more', () => {
    expect(ids(run(sc, 2, [...READY, 'cardiovert']))).toEqual(['cardiovert-stable', 'no-sedation']);
    const s = run(sc, 2, [...READY, 'sedation', 'cardiovert', ...AFTER_CONVERSION]);
    expect(s.penalties).toEqual([expect.objectContaining({ id: 'cardiovert-stable', severity: 'minor', points: 5 })]);
    expect(s.rhythm.profile).toBe('normal-sinus');
    expect(s.ended?.reason).toBe('complete');
    // the review says why: his stroke risk needs anticoagulation before an elective shock — and it does not deny his crackles
    expect(s.penalties[0].text).toMatch(/anticoagulation started before it/);
    expect(s.penalties[0].text).toMatch(/crackles were early congestion/);
    expect(s.penalties[0].text).not.toMatch(/no pulmonary edema/);
    const r = review(sc, s);
    expect(r.percent).toBeLessThan(100);
    expect(r.percent).toBeGreaterThanOrEqual(90);
    // without sedation the same run drops out of the top grade
    const awakeShock = review(sc, run(sc, 2, [...READY, 'cardiovert', ...AFTER_CONVERSION]));
    expect(awakeShock.percent).toBeLessThan(90);
  });

  it('fentanyl before the shock counts as analgesia: no "without sedation or analgesia" penalty, and no talk of pain he does not have', () => {
    // the pads on first, as for any cardioversion: the opioid is then the premedication for the shock
    const s = run(sc, 2, [...READY, 'pads', 'fentanyl', 'cardiovert']);
    expect(ids(s)).toEqual(['cardiovert-stable']);
    expect(s.log.some((l) => /takes the edge off/.test(l.text))).toBe(false);
    // with no pads on, no low pressure and no pain, nothing says a shock is coming: the opioid has nothing to treat
    expect(ids(run(sc, 2, [...READY, 'fentanyl', 'cardiovert']))).toEqual(['opioid-no-pain', 'cardiovert-stable']);
  });

  it('an unsynchronized shock with a pulse causes VF; the next shock brings him back, but it does not count as rate control', () => {
    let s = run(sc, 2, [...READY, 'defib']);
    expect(s.pulse).toBe(false);
    expect(s.rhythm.profile).toBe('vf');
    expect(ids(s)).toEqual(['shock-with-pulse']);
    s = perform(sc, s, 'defib');
    expect(s.pulse).toBe(true);
    expect(s.rhythm.profile).toBe('sinus-tachycardia');
    expect(ids(s)).toEqual(['shock-with-pulse']);
    expect(review(sc, stop(s)).toFix.find((t) => /^Control the rate safely/.test(t.label))?.kind).toBe('missed');
  });

  it('the VF an unsynchronized shock causes is scored like any witnessed arrest: a shock within 2 minutes; only once he has arrested', () => {
    const label = 'No pulse: defibrillate within 2 minutes';
    // shocked at once: on time
    const prompt = run(sc, 2, [...READY, 'defib', 'defib']);
    expect(review(sc, stop(prompt)).wentWell.map((w) => w.label)).toContain(label);
    // the reviewers' run: VF left for minutes (two reassessments, a cycle of CPR) before the shock — late, half marks
    const late = run(sc, 2, [...READY, 'defib', 'reassess', 'reassess', 'cpr', 'defib']);
    expect(late.pulse).toBe(true);
    const item = review(sc, stop(late)).toFix.find((t) => t.label === label);
    expect(item?.kind).toBe('late');
    expect(item?.points).toBe(7.5);
    // never shocked: missed
    const none = run(sc, 2, [...READY, 'defib', 'cpr', 'cpr']);
    expect(review(sc, stop(none)).toFix.find((t) => t.label === label)?.kind).toBe('missed');
    // no arrest, no item: the ideal run is untouched
    const ideal = review(sc, run(sc, 2, IDEAL));
    expect([...ideal.wentWell, ...ideal.toFix].map((t) => t.label)).not.toContain(label);
  });

  it('a hint in the VF names the shock, not an item from before the arrest', () => {
    // the reviewers' run: an unsynchronized shock, VF — and the hint said "Check for instability"
    const vf = run(sc, 2, ['primary', 'monitor', 'iv', 'defib']);
    expect(vf.pulse).toBe(false);
    expect(takeHint(sc, vf).log.at(-1)!.text).toMatch(/^Hint: No pulse: defibrillate within 2 minutes\./);
    // once the shock has brought him back, the hints go on as before
    const back = perform(sc, vf, 'defib');
    expect(back.pulse).toBe(true);
    expect(takeHint(sc, back).log.at(-1)!.text).toMatch(/^Hint: Check for instability/);
  });

  it('fluid floods the lungs of a failing heart; a pressor speeds the rate; oxygen costs nothing', () => {
    const fluid = run(sc, 2, [...READY, 'fluid']);
    expect(ids(fluid)).toEqual(['fluid-hf']);
    expect(fluid.vitals.spo2).toBe(90);
    const epi = run(sc, 2, [...READY, 'push-epi']);
    expect(ids(epi)).toEqual(['pressor-not-low']);
    expect(epi.rhythm.hr).toBe(156);
    expect(ids(run(sc, 2, [...READY, 'o2-nc']))).toEqual([]);
  });

  it('CPAP helps his breathing while his pressure holds; under 90 it is a major error', () => {
    const ok = run(sc, 2, [...READY, 'cpap']);
    expect(ids(ok)).toEqual([]);
    expect(ok.vitals.spo2).toBe(96);
    expect(ids(run(sc, 2, [...READY, 'diltiazem', 'cpap']))).toEqual(['diltiazem-hfref', 'cpap-hypotension']);
  });

  it('medical control gives a conditional order until it has the 12-lead and the history, then orders amiodarone and no diltiazem', () => {
    // with the history but no 12-lead it must not simply order amiodarone: a delta wave would make it dangerous
    for (const early of [run(sc, 2, ['primary', 'med-control']), run(sc, 2, ['primary', 'sample', 'iv', 'med-control'])]) {
      const said = early.log.at(-1)!.text;
      expect(said).toMatch(/I need his 12-lead and his history/);
      expect(said).toMatch(/If his heart is weak/);
      expect(said).toMatch(/delta wave, no AV-nodal drug at all, amiodarone included/);
    }
    const after = run(sc, 2, [...READY, 'med-control']);
    expect(after.log.at(-1)!.text).toMatch(/No diltiazem.*no IV beta-blocker.*Amiodarone 150 mg over 10 minutes.*200 J or more only if he becomes unstable/);
    expect(run(sc, 2, [...READY, 'amio-infusion', 'med-control']).log.at(-1)!.text).toMatch(/Let the amiodarone run/);
    expect(run(sc, 2, [...READY, 'diltiazem', 'med-control']).log.at(-1)!.text).toMatch(/unstable now: synchronized cardioversion/);
    expect(run(sc, 2, [...READY, 'defib', 'med-control']).log.at(-1)!.text).toMatch(/No pulse — defibrillate/);
    // a call back once the 12-lead and the history are in gets the order the first call could not give
    const back = perform(sc, run(sc, 2, ['primary', 'med-control', ...READY.filter((id) => id !== 'primary')]), 'med-control');
    expect(back.log.at(-1)!.text).toMatch(/No diltiazem.*Amiodarone 150 mg over 10 minutes/);
    expect(back.counts['med-control']).toBe(2);
  });

  it('a hint names what to check, never what the tracing shows or whether he is stable; the picker does not say either', () => {
    let s = start(sc, 2);
    for (const id of ['primary', 'vitals', 'monitor']) {
      s = takeHint(sc, s);
      s = perform(sc, s, id);
    }
    const hints = s.log.filter((l) => l.who === 'system' && /^Hint/.test(l.text)).map((l) => l.text);
    expect(hints.length).toBe(3);
    for (const h of hints) {
      // "a tachycardia" is the general rule a hint may state; the rhythm, his numbers and the verdict are not
      expect(h).not.toMatch(/fibrillation|\bAF\b|flutter|atrial|irregular/i);
      expect(h).not.toMatch(/\bstable\b|112\/74|30 %/);
    }
    expect(sc.summary).not.toMatch(/He is stable/);
  });

  it('nitroglycerin unloads his lungs a little and lowers the pressure; he never talks of chest pressure he does not have', () => {
    const s = run(sc, 2, [...READY, 'ask-pde5', 'nitro']);
    expect(ids(s)).toEqual([]);
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([102, 68]);
    expect(s.log.some((l) => /pressure is easing/.test(l.text))).toBe(false);
    expect(s.log.at(-1)!.text).toMatch(/easier to breathe/);
  });

  it('atropine speeds the rate and costs; a STEMI alert is declined and costs', () => {
    const atro = run(sc, 2, [...READY, 'atropine']);
    expect(atro.rhythm.hr).toBe(158);
    expect(ids(atro)).toEqual(['atropine-fast']);
    const alert = run(sc, 2, [...READY, 'stemi-alert']);
    expect(ids(alert)).toEqual(['stemi-alert-no-ste']);
    expect(alert.log.at(-1)!.text).toMatch(/not activated/);
    // the 12-lead in sinus rhythm has no ST elevation either
    expect(ids(run(sc, 2, [...READY, 'sedation', 'cardiovert', 'ecg12-repeat', 'stemi-alert']))).toEqual(['cardiovert-stable', 'stemi-alert-no-ste']);
    // beta-agonists for his breathlessness: no wheeze, no anaphylaxis — the rate rises and it costs once
    const neb = run(sc, 2, [...READY, 'albuterol', 'epi-im']);
    expect(ids(neb)).toEqual(['beta-agonist-no-indication']);
    expect(neb.rhythm.hr).toBe(162);
  });

  it('1 mg of epinephrine with a pulse surges the rate and pressure, brings on chest pain and makes him unstable: then the shock is right', () => {
    let s = run(sc, 2, [...READY, 'epinephrine']);
    expect(ids(s)).toEqual(['arrest-epi-with-pulse']);
    expect(s.rhythm.hr).toBe(172);
    expect(s.vitals.sbp).toBeGreaterThan(150);
    expect(s.vitals.pain).toBeGreaterThanOrEqual(7);
    expect(s.flags.unstable).toBeDefined();
    // his pressure allows sedation, so the shock is sedated: nothing more to pay
    s = perform(sc, perform(sc, s, 'sedation'), 'cardiovert');
    expect(ids(s)).toEqual(['arrest-epi-with-pulse']);
    expect(s.rhythm.profile).toBe('normal-sinus');
    expect(s.vitals.pain).toBe(0);
    // the surge wears off once the rate is normal: no lasting 160s systolic
    expect(s.vitals.sbp).toBeLessThanOrEqual(128);
    // an infusion now is the wrong answer, whatever pushed him there
    expect(ids(run(sc, 2, [...READY, 'epinephrine', 'amio-infusion']))).toContain('antiarrhythmic-unstable');
  });

  it('left unstable and unshocked, the weak heart slides into cardiogenic shock; a late shock still brings him back', () => {
    let s = run(sc, 2, [...READY, 'diltiazem', ...R(4)]);
    expect(s.fired).toContain('shock-deepens');
    expect([s.vitals.sbp, s.vitals.dbp, s.vitals.spo2, s.vitals.gcs]).toEqual([72, 42, 84, 10]);
    expect(sc.status!(s)).toMatch(/Barely responding/);
    expect(s.log.some((l) => l.who === 'monitor' && l.text === 'BP 72/42. SpO₂ 84%.')).toBe(true);
    s = perform(sc, s, 'cardiovert');
    expect(s.rhythm.profile).toBe('normal-sinus');
    expect(s.vitals.sbp).toBeGreaterThanOrEqual(100);
    expect(s.vitals.gcs).toBe(14);
    const r = review(sc, stop(s));
    expect(r.toFix.find((t) => /^Unstable: synchronized cardioversion/.test(t.label))?.kind).toBe('late');
  });

  it('after a bolus the lungs sound as wet as the partner says; back from the VF he is groggy, not chatting', () => {
    const wet = run(sc, 2, [...READY, 'fluid', 'lungs']);
    expect(wet.log.at(-1)!.text).toMatch(/higher than before the fluid/);
    const rosc = run(sc, 2, [...READY, 'defib', 'defib']);
    expect(rosc.vitals.gcs).toBeLessThan(13);
    expect(sc.status!(rosc)).toMatch(/Groggy/);
    expect(sc.status!(rosc)).not.toMatch(/I can breathe again/);
  });

  it('a thorough crew in another order (medical control first, pads on, history before the 12-lead) still scores full marks', () => {
    const s = run(sc, 2, ['primary', 'med-control', 'vitals', 'monitor', 'pads', 'ecg12', 'sample', 'opqrst', 'lungs', 'iv', 'amio-infusion', 'transport-near', UNTIL_ARRIVED, 'handoff']);
    expect(s.ended?.reason).toBe('complete');
    const r = review(sc, s);
    expect(r.penaltyPoints).toBe(0);
    expect(r.percent).toBe(100);
    // oxygen, CPAP while his pressure holds, pads and a stroke screen are fair extras: none of them costs
    expect(ids(run(sc, 2, [...READY, 'o2-nc', 'cpap', 'pads', 'neuro', 'perfusion', 'glucose', 'capno', 'notify', 'ecg-transmit']))).toEqual([]);
  });

  it('teaches the 2025 energy, the 48-hour rule, the diltiazem contraindication and where the beta-blocker and amiodarone fit', () => {
    const text = [...sc.teaching, ...sc.critical.map((c) => c.why)].join(' ');
    expect(text).toMatch(/200 J or more/);
    expect(text).not.toMatch(/120–200 J|50–100 J/);
    expect(text).toMatch(/48 hours/);
    expect(text).toMatch(/40 % or less\) IV diltiazem and verapamil are harmful, with or without decompensated heart failure/);
    // 2023 AF guideline: a beta-blocker is COR 1 for stable AF whatever the EF; it is the congestion that rules it out here
    expect(text).toMatch(/beta-blocker is still an option for a weak heart that is not congested/);
    expect(text).toMatch(/Adenosine does not convert atrial fibrillation/);
    // anticoagulation comes before an elective cardioversion even under 48 hours with his stroke risk
    expect(text).toMatch(/under 48 hours, with his stroke risk, anticoagulation is still started before it/);
    expect(text).not.toMatch(/unknown duration/);
  });
});

describe('af-rvr field: atropine after the conversion', () => {
  it('atropine for the sinus rhythm the shock restored still has nothing to treat', () => {
    const converted = run(sc, 2, ['primary', 'vitals', 'monitor', 'ecg12', 'iv', 'pads', 'sedation', 'cardiovert']);
    expect(converted.rhythm.hr).toBeGreaterThanOrEqual(60);
    expect(resolveProfile(converted.rhythm.profile).rhythm).toBe('sinus');
    const s = perform(sc, converted, 'atropine');
    expect(s.penalties.map((p) => p.id).slice(converted.penalties.length)).toEqual(['atropine-fast']);
  });
});
