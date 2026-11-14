import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '@/data/content';
import { resolveProfile } from '@/lib/ecg/profiles';
import { BUILT_IN_HARMS, criticalsFor, perform, review, start, stop, takeHint } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { ALS_MINUTES, SUSTAINED_AT, torsadesField as sc } from '@/lib/sim/scenario/scenarios/torsadesField';
import type { SimState } from '@/lib/sim/scenario/types';
import { UNTIL_ARRIVED, readAfter, runScenario } from './helpers';

const medic = (steps: string[], reads: 'correct' | 'manual' = 'correct') => runScenario(sc, 2, steps, undefined, reads);
const emt = (steps: string[]) => runScenario(sc, 1, steps);
const penalties = (s: SimState) => s.penalties.map((p) => p.id);
const said = (s: SimState) => s.log.map((l) => l.text).join('\n');
const missed = (s: SimState) => review(sc, stop(s)).toFix.filter((t) => t.kind === 'missed').map((t) => t.label);
const toFix = (s: SimState) => review(sc, s).toFix;

/** The ideal runs (the lead copies them into tests/scenarios.test.ts) */
const IDEAL: Record<1 | 2, string[]> = {
  1: ['als', 'pads', 'primary', 'sample', 'pulse-check', 'ecg12', 'ecg-transmit', 'pulse-check', 'notify', 'transport-pci', 'aed', 'cpr', 'vitals',
    'ecg12-repeat', UNTIL_ARRIVED, 'handoff'],
  2: ['pads', 'primary', 'sample', 'pulse-check', 'ecg12', 'iv', 'magnesium-sulfate', 'notify', 'transport-pci', UNTIL_ARRIVED, 'handoff'],
};

/** Pads on, the first look and the history: the first run has just started (minute 2.5) */
const IN_RUN = ['pads', 'primary', 'sample'];
/** IV in as the first run starts, a pulse check as it stops (minute 2.7): between the runs, before the second */
const BETWEEN = ['pads', 'iv', 'pulse-check'];
/** The paramedic who never gives magnesium: the second run ends as the clock passes 8 minutes, and the next one does not stop */
const TO_ARREST = ['pads', 'primary', 'sample', 'pulse-check', 'ecg12', 'iv', 'reassess'];
/** …the shock, then CPR: the pulse is back */
const TO_ROSC = [...TO_ARREST, 'defib', 'cpr'];

const GIVEAWAY = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture|torsades|polymorphic|\bQTc?\b|\bVF\b|\bVT\b/i;
const BRITISH = /haem|aemia|ischaem|oedem|synchronis|equalis|hyperaem|centre|levell|manoeuvre|nebulis|analyse\b|organis|colour|\bgrey|litres|metres|optimis|minimis|catheteris|heparinis|recognis|shovell|ventricularis/i;

function expectFullMarks(s: SimState) {
  expect(s.ended?.reason).toBe('complete');
  expect(s.pulse).toBe(true);
  const r = review(sc, s);
  expect(r.toFix).toEqual([]);
  expect(r.penaltyPoints).toBe(0);
  expect(r.percent).toBe(100);
  expect(r.grade).toBe('Excellent');
  expect(r.outcome).toMatch(/^Every critical intervention done/);
  for (const t of r.timings) if (t.met !== null) expect(t.met, t.label).toBe(true);
}

describe('torsades in the field — the case itself', () => {
  it('is a field case for the EMT and the paramedic, and refers only to interventions, rhythms and a condition that exist', () => {
    expect(sc).toMatchObject({ id: 'torsades-field', setting: 'field', roles: [1, 2] });
    expect(CONDITIONS[sc.conditionId!]).toBeDefined();
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe('long-qt');
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
    // the drug rules read the long QT from the case too: a pacer's rhythm on the screen hides it
    expect(sc.problems).toEqual(['long-qt']);
  });

  it('each role has its own part: the EMT calls ALS and transmits; the paramedic reads, starts the IV and gives magnesium', () => {
    const ids = (role: 1 | 2) => criticalsFor(sc, role).map((c) => c.id);
    expect(ids(1)).toEqual(expect.arrayContaining(['pads', 'als', 'history', 'ecg-sent', 'report', 'arrest-shock', 'cpr', 'post-bp', 'post-ecg', 'transport', 'handoff']));
    expect(ids(1)).not.toEqual(expect.arrayContaining(['magnesium']));
    expect(ids(2)).toEqual(expect.arrayContaining(['pads', 'history', 'ecg', 'iv', 'magnesium', 'report', 'arrest-shock', 'cpr', 'post-ecg', 'transport', 'handoff']));
    expect(ids(2)).not.toContain('als');
    // magnesium carries the most weight for the paramedic, the shock for both
    const pts = (role: 1 | 2, id: string) => criticalsFor(sc, role).find((c) => c.id === id)!.points;
    expect(pts(2, 'magnesium')).toBe(20);
    expect(pts(1, 'arrest-shock')).toBe(20);
  });

  it('nothing the learner sees before the tracing is read names the rhythm or the cause', () => {
    const opening = [sc.title, sc.summary, ...sc.briefing.default.map((l) => l[1]), ...sc.briefing[1]!.map((l) => l[1])].join(' ');
    expect(opening).not.toMatch(/torsades|polymorphic|\bQT\b|arrhythmia|magnesium|azithromycin|ondansetron/i);
    expect(opening).toMatch(/three times/);
    // a hint before the 12-lead never names it either
    const which = /torsades|polymorphic|\bQTc?\b|magnesium/i;
    let s = start(sc, 2);
    for (const step of ['pads', 'sample', 'primary']) {
      s = takeHint(sc, s);
      expect(s.log.at(-1)!.text, s.log.at(-1)!.text).not.toMatch(which);
      s = perform(sc, s, step);
    }
  });

  it('the EMT is told the paramedics are 10 minutes away; the paramedic has an EMT partner', () => {
    expect(start(sc, 1).log.some((l) => new RegExp(`about ${ALS_MINUTES} minutes away`).test(l.text))).toBe(true);
    expect(start(sc, 2).log.some((l) => /you have the monitor and the drug box/.test(l.text))).toBe(true);
  });

  it('uses US spelling in everything a learner reads', () => {
    expect(JSON.stringify(sc)).not.toMatch(BRITISH);
    for (const role of [1, 2] as const) for (const l of runScenario(sc, role, IDEAL[role]).log) expect(l.text).not.toMatch(BRITISH);
    expect(JSON.stringify(sc.teaching)).not.toMatch(BRITISH);
  });
});

describe('torsades in the field — the ideal runs', () => {
  for (const role of [1, 2] as const) {
    it(`role ${role}: ends by itself with full marks`, () => expectFullMarks(runScenario(sc, role, IDEAL[role])));
  }

  it('the paramedic sees two runs that stop on their own, gives magnesium during the second, and never meets the arrest', () => {
    const s = medic(IDEAL[2]);
    expect(s.fired).toEqual(expect.arrayContaining(['run1', 'run2']));
    expect(s.fired).not.toContain('sustained');
    expect(s.flags.arrest).toBeUndefined();
    expect(s.rhythm).toEqual({ profile: 'long-qt', hr: 58 });
    // the run stops by itself, as they all do: magnesium prevents the next one, it does not end this one
    expect(said(s)).toMatch(/The spell stops by itself as the drip starts/);
  });

  it('the EMT, who cannot give magnesium, meets the run that does not stop: the AED, CPR, ROSC — then the medics give it', () => {
    const s = emt(IDEAL[1]);
    expect(s.fired).toEqual(expect.arrayContaining(['run1', 'run2', 'sustained', 'als-arrives']));
    expect(s.flags.arrest).toBe(SUSTAINED_AT + 0.7);
    expect(s.flags.rosc).toBeDefined();
    expect(s.flags.magnesium).toBeGreaterThanOrEqual(s.flags.rosc);
    expect(s.fired).not.toContain('recurs');
    expect(s.fired).not.toContain('degenerates');
  });

  it('the paramedic reads the 12-lead as a long QT; PVCs alone are partly right, anything else costs 5', () => {
    const s = medic(readAfter(IDEAL[2], 'ecg12', 'long-qt'), 'manual');
    expect(s.reads).toEqual([expect.objectContaining({ kind: 'ecg', answer: 'long-qt', verdict: 'correct' })]);
    expect(s.log.some((l) => l.who === 'feedback' && /^Correct\. Sinus rhythm 58 with a very long QT/.test(l.text))).toBe(true);
    expect(review(sc, s).percent).toBe(100);
    const partial = medic(readAfter(IDEAL[2], 'ecg12', 'pvcs'), 'manual');
    expect(partial.penalties).toEqual([expect.objectContaining({ points: 2, severity: 'minor' })]);
    const wrong = medic(readAfter(IDEAL[2], 'ecg12', 'nsr'), 'manual');
    expect(wrong.penalties).toEqual([expect.objectContaining({ points: 5, severity: 'major' })]);
  });

  it('the 12-lead is never a tracing of a run: a run does not start on it, and one under way stops before it prints', () => {
    // the second run is due at minute 5, as this 12-lead ends: it waits for the next action
    const s = medic(['pads', 'primary', 'sample', 'pulse-check', 'reassess', 'ecg12']);
    expect(s.minute).toBeGreaterThanOrEqual(5);
    expect(s.lastEcg?.profile).toBe('long-qt');
    expect(s.rhythm.profile).toBe('long-qt');
    // a 12-lead started during a run records her own rhythm once the run has stopped
    const during = medic([...IN_RUN, 'ecg12']);
    expect(during.lastEcg?.profile).toBe('long-qt');
    expect(during.reads[0].answer).toBe('long-qt');
  });

  it('the EMT acquires and transmits the 12-lead without reading it, and the physician reads it for her', () => {
    const s = emt(IDEAL[1]);
    expect(s.reads).toEqual([]);
    expect(said(s)).toMatch(/12-lead acquired\. You can't interpret it/);
    expect(said(s)).toMatch(/Her QT is very long/);
  });

  it('every rhythm it reaches is real, and no monitor line names the rhythm or the cause', () => {
    const runs: SimState[] = [];
    for (const role of [1, 2] as const) {
      runScenario(sc, role, IDEAL[role], (s) => {
        expect(resolveProfile(s.rhythm.profile).id, s.rhythm.profile).toBe(s.rhythm.profile);
        runs.push(s);
      });
    }
    runs.push(
      medic([...TO_ROSC, 'reassess', 'reassess', 'reassess', 'defib', 'cpr']),
      medic([...TO_ARREST, 'reassess', 'reassess', 'defib', 'cpr', 'defib', 'cpr']),
      medic([...IN_RUN, 'defib', 'iv', 'ondansetron', 'magnesium-sulfate', 'defib']),
      medic(['pads', 'primary', 'iv', 'fentanyl', 'pace', 'ecg12', 'reassess', 'reassess']),
      medic(['pads', 'iv', 'adenosine6', 'aed', 'defib', 'cpr', 'nibp']),
      emt(['pads', 'primary', 'sample', 'aed', 'cpr', 'nibp', 'reassess', 'reassess', 'reassess', 'aed', 'cpr', 'vitals']),
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

describe('torsades in the field — the runs that stop on their own', () => {
  it('the first run comes at about 2 minutes: the monitor alarms (once it is on), she is out with a run on the screen', () => {
    const s = medic(IN_RUN);
    expect(s.rhythm).toEqual({ profile: 'torsades', hr: 220 });
    expect(s.pulse).toBe(true);
    expect(s.vitals.gcs).toBe(3);
    expect(s.log.slice(-2).map((l) => l.text)).toEqual(['Monitor alarm.', 'She has slumped mid-sentence — gray, eyes rolled up, her arms jerking!']);
    // without the monitor or the pads nothing alarms: the partner sees her faint
    const blind = medic(['primary', 'sample']);
    expect(blind.rhythm.profile).toBe('torsades');
    expect(blind.log.some((l) => l.who === 'monitor')).toBe(false);
  });

  it('it stops by itself at the end of the next action, whatever it is', () => {
    const s = medic([...IN_RUN, 'iv']);
    expect(s.rhythm).toEqual({ profile: 'long-qt', hr: 58 });
    expect(s.vitals.gcs).toBe(15);
    expect(s.fired).toContain('run1-ends');
    expect(said(s)).toMatch(/The alarm stops\.\n.*Did I pass out again\?/);
  });

  it('an assessment during a run finds her out with no pulse, then she comes around', () => {
    for (const id of ['pulse-check', 'vitals', 'primary', 'reassess']) {
      const s = medic(['pads', 'sample', 'opqrst', id]);
      expect(s.rhythm.profile, id).toBe('long-qt');
      expect(said(s), id).toMatch(/no pulse|No pulse/);
      expect(penalties(s), id).toEqual([]);
    }
  });

  it('CPR during a run is right — she pushes the hands away; CPR between the runs, with a pulse, is not', () => {
    const during = medic([...IN_RUN, 'cpr']);
    expect(penalties(during)).toEqual([]);
    expect(said(during)).toMatch(/pushes your hands away/);
    const between = medic([...IN_RUN, 'pulse-check', 'cpr']);
    expect(penalties(between)).toEqual(['cpr-with-pulse']);
  });

  it('the AED during a run (she is pulseless for those seconds) puts the pads on and advises no shock as it stops; between runs it is refused', () => {
    const s = emt(['primary', 'sample', 'aed']);
    expect(penalties(s)).toEqual([]);
    expect(s.flags.pads).toBeDefined();
    expect(s.log.at(-1)!.text).toBe('AED: "No shock advised."');
    expect(review(sc, s).wentWell.map((w) => w.label)).toContain('Defibrillator pads on her chest at once');
    const refused = emt(['pads', 'primary', 'aed']);
    expect(refused.minute).toBe(1.5);
    expect(refused.log.at(-1)!.text).toMatch(/^Not with a pulse/);
  });

  it('an unsynchronized shock during a run is no mistake (polymorphic VT is defibrillated, pulse or not); between the runs it causes VF', () => {
    const run = medic([...IN_RUN, 'defib']);
    expect(penalties(run)).toEqual([]);
    expect(run.rhythm.profile).toBe('long-qt');
    const between = medic([...IN_RUN, 'pulse-check', 'defib']);
    expect(penalties(between)).toEqual(['shock-with-pulse']);
    expect(between.pulse).toBe(false);
    expect(between.rhythm.profile).toBe('vf');
    // witnessed, with the pads on: a shock at once stops that VF, and CPR brings her back
    const back = medic([...IN_RUN, 'pulse-check', 'defib', 'defib', 'cpr']);
    expect(back.pulse).toBe(true);
    expect(penalties(back)).toEqual(['shock-with-pulse']);
  });

  it('a synchronized shock for a run does not fire and costs points', () => {
    const s = medic([...IN_RUN, 'cardiovert']);
    expect(penalties(s)).toEqual(['sync-polymorphic']);
    expect(said(s)).toMatch(/does not fire/);
    expect(s.rhythm.profile).toBe('long-qt');
  });

  it('magnesium stops the runs coming: none after it, and no run that does not stop', () => {
    const s = medic(['pads', 'iv', 'magnesium-sulfate', 'reassess', 'reassess', 'reassess', 'reassess', 'reassess']);
    expect(s.minute).toBeGreaterThan(SUSTAINED_AT + 2);
    // the first run had started as the IV went in: the magnesium stopped it, and no other came
    expect(s.fired).toContain('run1');
    expect(s.fired).not.toContain('run2');
    expect(s.fired).not.toContain('sustained');
    expect(s.pulse).toBe(true);
    expect(penalties(s)).toEqual([]);
  });
});

describe('torsades in the field — the run that does not stop', () => {
  it('without magnesium it comes at minute 8: pulseless torsades', () => {
    const s = medic(TO_ARREST);
    expect(s.fired).toContain('sustained');
    expect(s.pulse).toBe(false);
    expect(s.rhythm).toEqual({ profile: 'torsades', hr: 230 });
    expect(s.flags.arrest).toBe(8.7);
    // magnesium came too late: half the points
    expect(toFix(medic([...TO_ROSC, 'magnesium-sulfate'])).find((t) => t.label === 'Magnesium sulfate 2 g IV')?.kind).toBe('late');
  });

  it('the shock stops it; the stunned heart needs CPR, and two minutes of it bring the pulse back', () => {
    let s = medic([...TO_ARREST, 'defib']);
    expect(s.pulse).toBe(false);
    expect(s.rhythm.profile).toBe('long-qt');
    expect(penalties(s)).toEqual([]);
    s = perform(sc, s, 'cpr');
    expect(s.pulse).toBe(true);
    expect(s.flags.rosc).toBe(11);
    expect(s.rhythm).toEqual({ profile: 'long-qt', hr: 64 });
    // a pulse check right after the shock is no mistake: there is simply no pulse yet
    expect(penalties(medic([...TO_ARREST, 'defib', 'pulse-check']))).toEqual([]);
  });

  it('without CPR after the shock the partner says so, and the CPR item is late', () => {
    const s = medic([...TO_ARREST, 'defib', 'magnesium-sulfate', 'reassess', 'cpr']);
    expect(s.fired).toContain('no-cpr-after-shock');
    expect(s.pulse).toBe(true);
    expect(toFix(s).find((t) => t.label === 'CPR straight after the shock')?.kind).toBe('late');
  });

  it('a second shock on the organized beats after the first is a shock for a rhythm that is not shockable', () => {
    expect(penalties(medic([...TO_ARREST, 'defib', 'defib']))).toEqual(['shock-nonshockable']);
  });

  it('left unshocked it breaks down into VF; then a shock works only with compressions behind it', () => {
    const vf = medic([...TO_ARREST, 'reassess', 'reassess']);
    expect(vf.fired).toContain('degenerates');
    expect(vf.rhythm.profile).toBe('vf');
    const noCpr = perform(sc, vf, 'defib');
    expect(noCpr.rhythm.profile).toBe('vf');
    expect(noCpr.log.at(-1)!.text).toMatch(/straight back on the chest/);
    const withCpr = medic([...TO_ARREST, 'cpr', 'reassess', 'defib']);
    expect(withCpr.rhythm.profile).toBe('long-qt');
    // the shock was late: half the points
    expect(toFix(stop(withCpr)).find((t) => t.label.startsWith('No pulse: shock at once'))?.kind).toBe('late');
  });

  it('anything else before the shock with the pads already on delays it and costs points; CPR does not', () => {
    expect(penalties(medic([...TO_ARREST, 'magnesium-sulfate']))).toEqual(['delay-shock']);
    expect(penalties(medic([...TO_ARREST, 'airway']))).toEqual(['delay-shock']);
    expect(penalties(medic([...TO_ARREST, 'epinephrine']))).toEqual(['delay-shock']);
    expect(penalties(medic([...TO_ARREST, 'cpr']))).toEqual([]);
    // after the shock, magnesium in the arrest is right
    expect(penalties(medic([...TO_ARREST, 'defib', 'magnesium-sulfate']))).toEqual([]);
  });

  it('a synchronized shock in pulseless torsades does not fire and costs points', () => {
    const s = medic([...TO_ARREST, 'cardiovert']);
    expect(penalties(s)).toEqual(['sync-in-arrest']);
    expect(s.rhythm.profile).toBe('torsades');
  });

  it('back with a pulse but no magnesium: it comes back 4 minutes later; magnesium after ROSC keeps it away', () => {
    const again = medic([...TO_ROSC, 'reassess', 'reassess']);
    expect(again.fired).toContain('recurs');
    expect(again.pulse).toBe(false);
    expect(again.rhythm.profile).toBe('torsades');
    const kept = medic([...TO_ROSC, 'magnesium-sulfate', 'reassess', 'reassess', 'reassess']);
    expect(kept.fired).not.toContain('recurs');
    expect(kept.pulse).toBe(true);
  });

  it('the paramedic who handles the arrest well still scores below the one who gave magnesium in time', () => {
    const late = medic([...TO_ROSC, 'magnesium-sulfate', 'notify', 'ecg12-repeat', 'transport-pci', UNTIL_ARRIVED, 'handoff']);
    expect(late.ended?.reason).toBe('complete');
    const r = review(sc, late);
    expect(r.percent).toBeLessThan(100);
    expect(r.toFix.map((t) => t.kind)).toEqual(['late']);
  });

  it('loading her while she is pulseless costs points; transport counts once she has a pulse', () => {
    expect(penalties(medic([...TO_ARREST, 'transport-pci']))).toEqual(['transport-in-arrest']);
  });
});

describe('torsades in the field — the traps', () => {
  it('ondansetron for her nausea lengthens the QT further: a penalty, and the run that does not stop comes at once', () => {
    const s = medic([...BETWEEN, 'ondansetron']);
    expect(penalties(s)).toEqual(['ondansetron-long-qt']);
    expect(s.pulse).toBe(false);
    expect(s.rhythm.profile).toBe('torsades');
    expect(s.flags.arrest).toBe(3.2);
  });

  it('amiodarone, infusion or push, lengthens the QT too: one penalty each, and it sets off the arrest', () => {
    const drip = medic([...BETWEEN, 'amio-infusion']);
    expect(penalties(drip)).toEqual(['amiodarone-long-qt']);
    expect(drip.pulse).toBe(false);
    const push = medic([...BETWEEN, 'amio-arrest']);
    expect(penalties(push)).toEqual(['amiodarone-long-qt']);
    expect(push.pulse).toBe(false);
    // in the arrest, after the shock: still the wrong drug — but it set off nothing, and the review does not say it did
    const inArrest = medic([...TO_ARREST, 'defib', 'amio-arrest']);
    expect(penalties(inArrest)).toEqual(['amiodarone-arrest-long-qt']);
    expect(inArrest.penalties[0].text).not.toMatch(/set off/);
  });

  it('procainamide: the built-in long-QT rule, and the arrest', () => {
    const s = medic([...BETWEEN, 'procainamide']);
    expect(penalties(s)).toEqual(['procainamide-long-qt']);
    expect(s.pulse).toBe(false);
  });

  it('adenosine (a pause) and metoprolol or diltiazem (a slower rate) set off a run that does not stop', () => {
    for (const [id, rule] of [['adenosine6', 'adenosine-long-qt'], ['adenosine12', 'adenosine-long-qt'], ['metoprolol', 'beta-blocker-long-qt'], ['diltiazem', 'diltiazem-long-qt']]) {
      const s = medic([...BETWEEN, id]);
      expect(penalties(s), id).toEqual([rule]);
      expect(s.pulse, id).toBe(false);
    }
    // diltiazem during a run is the built-in wide-complex rule, said once
    expect(penalties(medic(['pads', 'iv', 'diltiazem']))).toEqual(['diltiazem-vt']);
  });

  it('the AED with a pulse between the runs is refused at no cost; the EMT can only wait for the arrest to use it', () => {
    const s = emt(['pads', 'primary', 'aed']);
    expect(penalties(s)).toEqual([]);
    expect(s.counts.aed).toBeUndefined();
  });

  it('pushers and IM epinephrine with a normal pressure, and nitroglycerin with no pain, cost points', () => {
    expect(penalties(medic(['pads', 'iv', 'push-epi']))).toEqual(['pressor-not-low']);
    expect(penalties(emt(['pads', 'epi-im']))).toEqual(['epi-im-no-anaphylaxis']);
    expect(penalties(medic(['pads', 'nitro']))).toEqual(['nitro-no-pain']);
    expect(penalties(medic(['pads', 'nitro-high']))).toEqual(['nitro-no-pain']);
  });

  it('a learner who caused the arrest and then ran it well never scores as high as the ideal run', () => {
    const steps = ['pads', 'primary', 'sample', 'pulse-check', 'ecg12', 'iv', 'ondansetron', 'defib', 'cpr', 'magnesium-sulfate', 'notify', 'ecg12-repeat',
      'transport-pci', UNTIL_ARRIVED, 'handoff'];
    const s = medic(steps);
    expect(s.ended?.reason).toBe('complete');
    const r = review(sc, s);
    expect(penalties(s)).toEqual(['ondansetron-long-qt']);
    expect(r.percent).toBeLessThan(100);
    expect(r.percent).toBeLessThan(review(sc, medic(IDEAL[2])).percent);
  });
});

describe('torsades in the field — overdrive pacing', () => {
  it('pacing at 90 while the runs keep coming stops them (no pauses), but before magnesium it costs a little', () => {
    const s = medic(['pads', 'iv', 'fentanyl', 'pace', 'reassess', 'reassess', 'reassess']);
    // magnesium is the first step; overdrive pacing (expert consultation, 2025 AHA) is for runs that keep coming despite it
    expect(penalties(s)).toEqual(['pace-before-magnesium']);
    expect(s.penalties[0]).toMatchObject({ points: 3, severity: 'minor' });
    expect(s.rhythm).toEqual({ profile: 'tcp', hr: 90 });
    expect(s.minute).toBeGreaterThan(SUSTAINED_AT);
    expect(s.fired).not.toContain('sustained');
    // it is no substitute for magnesium
    expect(missed(s)).toContain('Magnesium sulfate 2 g IV');
  });

  it('pacing an awake patient without analgesia costs a little; pacing once magnesium has stopped the runs is pacing with nothing to do', () => {
    expect(penalties(medic(['pads', 'pace']))).toEqual(['pace-before-magnesium', 'pace-no-analgesia']);
    // (and with the runs stopped and no pain, the fentanyl has nothing to treat either)
    expect(penalties(medic(['pads', 'iv', 'magnesium-sulfate', 'fentanyl', 'pace']))).toEqual(['opioid-no-pain', 'pace-not-slow']);
  });
});

describe('torsades in the field — the EMT\'s paramedic intercept', () => {
  it('the medics arrive 10 minutes after the call and give magnesium', () => {
    const s = emt(['als', 'pads', 'primary', 'sample', 'pulse-check', 'reassess']);
    expect(s.flags.als).toBe(0.3);
    expect(s.fired).not.toContain('als-arrives');
    const full = emt(IDEAL[1]);
    expect(full.log.some((l) => l.who === 'team' && /magnesium sulfate 2 g running in/.test(l.text))).toBe(true);
  });

  it('without the ALS call nobody gives magnesium: after ROSC it comes back', () => {
    const s = emt(['pads', 'primary', 'sample', 'pulse-check', 'reassess', 'reassess', 'reassess', 'aed', 'cpr', 'reassess', 'reassess']);
    expect(s.fired).toContain('sustained');
    expect(s.fired).toContain('recurs');
    expect(s.pulse).toBe(false);
    expect(missed(s)).toContain('Request ALS (paramedic intercept) at once');
  });

  it('medics who find her unshocked defibrillate her at once — and the EMT\'s shock item is missed', () => {
    const s = emt(['als', 'pads', 'primary', 'sample', 'pulse-check', 'reassess', 'pulse-check', 'reassess', 'reassess', 'cpr']);
    expect(s.fired).toEqual(expect.arrayContaining(['sustained', 'als-arrives']));
    expect(said(s)).toMatch(/they defibrillate at once/);
    expect(s.flags.converted).toBeDefined();
    expect(missed(s)).toContain('No pulse: shock at once (the AED, or unsynchronized defibrillation)');
  });

  it('medical control and the poison center answer in their own words', () => {
    expect(emt(['med-control']).log.at(-1)!.text).toMatch(/Keep the AED pads on her/);
    expect(medic(['med-control']).log.at(-1)!.text).toMatch(/get me a 12-lead/);
    expect(said(medic(['pads', 'primary', 'sample', 'pulse-check', 'ecg12', 'med-control']))).toMatch(/Medical control: magnesium sulfate 2 g IV now/);
    expect(emt(['poison-control']).log.at(-1)!.text).toMatch(/not an overdose/);
  });
});

describe('torsades in the field — review fixes', () => {
  it('a drug that sets off the arrest costs as much as a shock with a pulse: running that arrest well never grades Excellent', () => {
    const after = ['defib', 'cpr', 'sample', 'magnesium-sulfate', 'ecg12', 'notify', 'transport-pci', UNTIL_ARRIVED, 'handoff'];
    for (const [id, rule] of [
      ['ondansetron', 'ondansetron-long-qt'], ['amio-infusion', 'amiodarone-long-qt'], ['amio-arrest', 'amiodarone-long-qt'],
      ['procainamide', 'procainamide-long-qt'], ['adenosine6', 'adenosine-long-qt'], ['metoprolol', 'beta-blocker-long-qt'], ['diltiazem', 'diltiazem-long-qt'],
    ]) {
      const s = medic([...BETWEEN, id, ...after]);
      expect(s.flags.arrest, id).toBeDefined();
      expect(s.ended?.reason, id).toBe('complete');
      expect(s.penalties.filter((p) => !p.id.startsWith('misread')), id).toEqual([expect.objectContaining({ id: rule, points: 15, severity: 'critical' })]);
      const r = review(sc, s);
      expect(r.percent, id).toBeLessThan(90);
      expect(r.grade, id).not.toBe('Excellent');
    }
  });

  it('ondansetron or amiodarone given in the arrest set nothing off, and the review does not say they did', () => {
    const s = medic([...TO_ARREST, 'defib', 'ondansetron']);
    expect(penalties(s)).toEqual(['ondansetron-in-arrest']);
    for (const p of medic([...TO_ARREST, 'defib', 'ondansetron', 'amio-arrest']).penalties) expect(p.text, p.id).not.toMatch(/set off/);
  });

  it('a shock between the runs is judged in this case\'s words: her own slow rhythm and a long T wave, not an unstable tachycardia', () => {
    const s = medic([...IN_RUN, 'pulse-check', 'defib']);
    expect(s.penalties).toEqual([expect.objectContaining({ id: 'shock-with-pulse', points: 15, severity: 'critical' })]);
    expect(s.penalties[0].text).toMatch(/long T wave/);
    expect(s.penalties[0].text).not.toMatch(/tachycardia/);
  });

  it('the EMT who reaches the hospital before the intercept hands her to the emergency department: no medics arrive there', () => {
    const s = emt(['als', 'pads', 'transport-near', 'primary', 'sample', UNTIL_ARRIVED, 'aed', 'cpr', 'vitals', 'ecg12', 'ecg-transmit', 'handoff']);
    expect(s.flags.arrived).toBeLessThan(s.flags.als + ALS_MINUTES);
    expect(s.fired).not.toContain('als-arrives');
    expect(said(s)).not.toMatch(/paramedic intercept arrives|paramedics take over|paramedics on their way|Keep the paramedics coming/);
    expect(s.ended?.reason).toBe('complete');
  });

  it('the physician\'s advice follows the call: medicines named only after the SAMPLE, the medics only while they are still needed', () => {
    const early = emt(['med-control']).log.at(-1)!.text;
    expect(early).not.toMatch(/azithromycin|ondansetron|new medicines/);
    expect(early).toMatch(/Get a paramedic intercept on the way/);
    expect(said(emt(['sample', 'als', 'med-control']))).toMatch(/Keep the paramedics coming\. No more doses of the azithromycin/);
    // after the arrest the 12-lead explains the arrest too
    expect(said(emt(['als', 'pads', 'primary', 'sample', 'reassess', 'reassess', 'reassess', 'aed', 'cpr', 'ecg12', 'ecg-transmit']))).toMatch(/That explains the faints and the arrest/);
  });

  it('a radio report before the history does not know her medicines, and the hand-off still tells the hospital about them', () => {
    const steps = ['pads', 'primary', 'notify', 'sample', 'pulse-check', 'ecg12', 'iv', 'magnesium-sulfate', 'transport-near', UNTIL_ARRIVED, 'handoff'];
    const s = medic(steps);
    expect(s.log.find((l) => l.who === 'hospital' && l.text.startsWith('Copy'))!.text).not.toMatch(/medicines|bottles/);
    expect(missed(s)).toEqual([]);
    expectFullMarks(s);
  });

  it('the radio report in the arrest asks for no call back (the report is made once)', () => {
    const s = medic([...TO_ARREST, 'notify']);
    expect(s.log.at(-1)!.text).not.toMatch(/call back/i);
  });

  it('magnesium pushed in the arrest says compressions go on only when they have started', () => {
    const before = medic([...TO_ARREST, 'defib', 'magnesium-sulfate']);
    expect(before.log.some((l) => l.text === 'Magnesium sulfate 2 g pushed.')).toBe(true);
    expect(said(before)).not.toMatch(/compressions go on/);
    const s = medic([...TO_ARREST, 'cpr', 'defib', 'magnesium-sulfate']);
    expect(s.log.some((l) => l.text === 'Magnesium sulfate 2 g pushed; compressions go on.')).toBe(true);
  });

  it('after ROSC the EMT\'s reassessment reads the blood pressure too: it counts as the pressure check', () => {
    const s = emt(['als', 'pads', 'primary', 'sample', 'pulse-check', 'ecg12', 'ecg-transmit', 'pulse-check', 'notify', 'transport-pci', 'aed', 'cpr', 'reassess', 'ecg12-repeat', UNTIL_ARRIVED, 'handoff']);
    expect(s.log.some((l) => l.who === 'you' && /^BP \d+\/\d+/.test(l.text) && l.minute > s.flags.rosc)).toBe(true);
    expectFullMarks(s);
  });

  it('the medics\' own shock is their line, not the monitor\'s, and they ask for compressions that have not started', () => {
    const s = emt(['als', 'pads', 'primary', 'sample', 'pulse-check', 'reassess', 'pulse-check', 'reassess', 'reassess', 'reassess']);
    expect(s.fired).toContain('als-arrives');
    const shockLine = s.log.find((l) => /defibrillate at once/.test(l.text))!;
    expect(shockLine.who).toBe('team');
    expect(said(s)).toMatch(/Compressions — now\./);
  });
});

describe('torsades in the field — hints during the arrest', () => {
  it('the EMT, who never reads the tracing, is not told its name by a hint during the arrest', () => {
    let s = emt(['als', 'pads', 'primary', 'sample', 'pulse-check', 'ecg12', 'ecg-transmit', 'pulse-check', 'notify', 'transport-pci']);
    expect(s.pulse).toBe(false);
    s = takeHint(sc, s);
    expect(s.log.at(-1)!.text).toMatch(/^Hint: No pulse: shock at once/);
    expect(s.log.at(-1)!.text).not.toMatch(/torsades|polymorphic|\bVT\b/i);
  });
});
