import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '@/data/content';
import { resolveProfile } from '@/lib/ecg/profiles';
import { BUILT_IN_HARMS, criticalsFor, perform, review, start, stop, takeHint } from '@/lib/sim/scenario/engine';
import { INTERVENTION_BY_ID, interventionsFor } from '@/lib/sim/scenario/interventions';
import { ALS_MINUTES, UNSTABLE_AT, wpwAfField as sc } from '@/lib/sim/scenario/scenarios/wpwAfField';
import type { SimState } from '@/lib/sim/scenario/types';
import { UNTIL_ARRIVED, readAfter, runScenario } from './helpers';

const R = (n: number) => Array<string>(n).fill('reassess');
const medic = (steps: string[], reads: 'correct' | 'manual' = 'correct') => runScenario(sc, 2, steps, undefined, reads);
const emt = (steps: string[]) => runScenario(sc, 1, steps);
const penalties = (s: SimState) => s.penalties.map((p) => p.id);
const said = (s: SimState) => s.log.map((l) => l.text).join('\n');
const toFix = (s: SimState) => review(sc, s.ended ? s : stop(s)).toFix;
const missed = (s: SimState) => toFix(s).filter((t) => t.kind === 'missed').map((t) => t.label);
const late = (s: SimState) => toFix(s).filter((t) => t.kind === 'late').map((t) => t.label);
/** Play `step` until the predicate holds (or the case ends) */
function until(s: SimState, done: (x: SimState) => boolean, step = 'reassess', max = 30): SimState {
  for (let i = 0; i < max && !done(s) && !s.ended; i++) s = perform(sc, s, step);
  return s;
}

/** The ideal runs (the lead copies them into tests/scenarios.test.ts) */
const IDEAL: Record<1 | 2, string[]> = {
  1: ['als', 'primary', 'vitals', 'pads', 'sample', 'ecg12', 'ecg-transmit', 'transport-pci', ...R(5), 'ecg12-repeat', UNTIL_ARRIVED, 'handoff'],
  2: ['primary', 'pads', 'nibp', 'ecg12', 'sample', 'iv', 'med-control', 'procainamide', 'transport-pci', ...R(4), 'ecg12-repeat', UNTIL_ARRIVED, 'handoff'],
};
/** The paramedic's other right answer: a sedated synchronized cardioversion while he is stable */
const IDEAL_SHOCK = ['primary', 'pads', 'nibp', 'ecg12', 'sample', 'iv', 'med-control', 'sedation', 'cardiovert', 'ecg12-repeat', 'transport-pci', UNTIL_ARRIVED, 'handoff'];

/** Pads, a pressure, the 12-lead read, the history and an IV: the drug decision is next (minute 7) */
const WORKED_UP = ['primary', 'pads', 'nibp', 'ecg12', 'sample', 'iv'];
/** The EMT's work-up without the ALS call (minute 6) */
const EMT_NO_ALS = ['primary', 'vitals', 'pads', 'sample', 'ecg12', 'ecg-transmit'];
const PREEXCITED = { profile: 'af-wpw', hr: 214 };

/** The rhythm or the diagnosis, in any words a line not meant to read the tracing must not use */
const GIVEAWAY = /STEMI|fibrillation|heart block|AV block|sinus|tachycardia|bradycardia|SVT|AVNRT|escape|ventricular|capture|pre-excit|WPW|pathway|delta|\bVF\b|\bVT\b|\bAF\b/i;
const BRITISH = /haem|aemia|ischaem|oedem|synchronis|equalis|hyperaem|centre|levell|manoeuvre|nebulis|analyse\b|organis|colour|\bgrey|litres|metres|optimis|minimis|catheteris|heparinis|recognis|shovell|ventricularis/i;

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

describe('pre-excited AF in the field — the case itself', () => {
  it('is a field case for the EMT and the paramedic, and refers only to interventions, rhythms and a condition that exist', () => {
    expect(sc).toMatchObject({ id: 'wpw-af-field', setting: 'field', roles: [1, 2] });
    expect(CONDITIONS[sc.conditionId!]).toBeDefined();
    expect(resolveProfile(sc.initial.rhythm.profile).id).toBe('af-wpw');
    expect(sc.initial.rhythm).toEqual(PREEXCITED);
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
    // no heart failure and no long QT: nothing stops procainamide
    expect(sc.problems).toBeUndefined();
  });

  it('each role has its own part: the EMT calls ALS and transmits; the paramedic reads, converts him and consults', () => {
    const ids = (role: 1 | 2) => criticalsFor(sc, role).map((c) => c.id);
    expect(ids(1)).toEqual(['pads', 'instability', 'als', 'history', 'ecg-sent', 'arrest-shock', 'cpr', 'post-bp', 'post-ecg', 'transport', 'handoff']);
    expect(ids(2)).toEqual(['pads', 'instability', 'history', 'ecg', 'iv', 'stop-it', 'consult', 'cardiovert-unstable', 'sedation', 'arrest-shock', 'cpr', 'post-ecg',
      'transport', 'handoff']);
    const pts = (role: 1 | 2, id: string) => criticalsFor(sc, role).find((c) => c.id === id)!.points;
    expect(pts(2, 'stop-it')).toBe(15);
    expect(pts(2, 'cardiovert-unstable')).toBe(15);
    expect(pts(1, 'als')).toBe(10);
    expect(pts(1, 'arrest-shock')).toBe(15);
  });

  it('opens awake and stable: a fast irregular pulse, 104/68, and a monitor that shows only numbers', () => {
    const s = medic(['primary', 'pads', 'nibp']);
    expect(s.rhythm).toEqual(PREEXCITED);
    expect(s.pulse).toBe(true);
    expect(s.log.at(-1)).toMatchObject({ who: 'monitor', text: 'NIBP 104/68 mmHg.' });
    expect(s.log.find((l) => /^Airway open/.test(l.text))!.text).toMatch(/very fast and irregular, about 210/);
    expect(medic(['monitor']).log.at(-1)!.text).toBe('Monitor attached: heart rate 214.');
    expect(emt(['monitor']).log.at(-1)!.text).toMatch(/^Monitor on: heart rate 214\. Interpreting the rhythm is outside EMT scope/);
  });

  it('a hint before the 12-lead never says what the rhythm is', () => {
    const which = /pre-excit|WPW|pathway|fibrillation|\bAF\b|procainamide|AV-nodal|adenosine|diltiazem|200 J/i;
    for (const [role, steps] of [[1, ['pads', 'vitals', 'als', 'sample']], [2, ['pads', 'nibp', 'sample', 'primary']]] as const) {
      let s = start(sc, role);
      for (const step of steps) {
        s = takeHint(sc, s);
        expect(s.log.at(-1)!.text, s.log.at(-1)!.text).not.toMatch(which);
        s = perform(sc, s, step);
      }
    }
  });
});

describe('pre-excited AF in the field — ideal runs end by themselves with full marks', () => {
  it('paramedic, procainamide: it slows the rate, then stops the AF 10 minutes after it was started; the repeat 12-lead shows the pathway', () => {
    const s = medic(IDEAL[2]);
    expectFullMarks(s);
    expect(s.fired).toContain('drug-converts');
    expect(s.fired).not.toContain('unstable-delay');
    expect(s.rhythm.profile).toBe('wpw');
    expect(s.reads.map((r) => [r.answer, r.verdict])).toEqual([['afib-preexcited', 'correct'], ['wpw', 'correct']]);
    const proc = s.performed.find((p) => p.id === 'procainamide')!.minute;
    expect(s.flags['drug-converted'] - proc).toBeGreaterThanOrEqual(10);
    expect(s.log.some((l) => l.who === 'monitor' && l.text === 'Heart rate 176. BP 98/64.')).toBe(true);
    expect(said(s)).toMatch(/Procainamide running at 50 mg\/min — stop at 17 mg\/kg \(about 1,330 mg for his 78 kg\)/);
    expect(said(s)).toMatch(/Procainamide loading stopped/);
  });

  it('paramedic, a sedated synchronized cardioversion at 200 J while he is stable: also full marks', () => {
    const s = medic(IDEAL_SHOCK);
    expectFullMarks(s);
    expect(s.flags.elective).toBeDefined();
    expect(s.log.some((l) => l.who === 'monitor' && /^Synchronized shock delivered: 200 J\./.test(l.text))).toBe(true);
    expect(s.reads.map((r) => r.answer)).toEqual(['afib-preexcited', 'wpw']);
  });

  it('paramedic: the shock first and medical control after it still earns full marks', () => {
    expectFullMarks(medic(['primary', 'pads', 'nibp', 'ecg12', 'sample', 'iv', 'midazolam', 'cardiovert', 'ecg12-repeat', 'med-control', 'transport-near', UNTIL_ARRIVED, 'handoff']));
  });

  it('EMT: the intercept arrives 8 minutes after the call and starts procainamide; the physician reads the transmitted 12-lead', () => {
    const s = emt(IDEAL[1]);
    expectFullMarks(s);
    expect(s.reads).toEqual([]);
    expect(s.flags['als-here'] - s.flags.als).toBeGreaterThanOrEqual(ALS_MINUTES);
    expect(s.flags['proc-running']).toBe(s.flags['als-here']);
    expect(s.fired).toContain('drug-converts');
    expect(s.log.some((l) => l.who === 'hospital' && /atrial fibrillation running down an extra pathway, WPW/.test(l.text))).toBe(true);
    // the EMT's AED pads go on, and the AED is never asked to analyze
    expect(s.log.some((l) => /AED pads on his chest/.test(l.text))).toBe(true);
    expect(s.counts.aed).toBeUndefined();
  });

  it('every rhythm the ideal runs reach is a real ECG profile', () => {
    for (const [role, steps] of [[1, IDEAL[1]], [2, IDEAL[2]], [2, IDEAL_SHOCK]] as const) {
      runScenario(sc, role, steps, (s) => expect(resolveProfile(s.rhythm.profile).id, s.rhythm.profile).toBe(s.rhythm.profile));
    }
  });
});

describe('pre-excited AF in the field — the reads', () => {
  it('the rhythm or the pathway alone is half of it (2 points); VT is wrong (5) — and the 12-lead still counts as recorded', () => {
    for (const [chosen, verdict, points] of [['afib', 'partial', 2], ['wpw', 'partial', 2], ['vt', 'wrong', 5]] as const) {
      const s = medic(readAfter(['primary', 'pads', 'nibp', 'ecg12'], 'ecg12', chosen), 'manual');
      expect(s.reads[0], chosen).toMatchObject({ answer: 'afib-preexcited', chosen, verdict });
      expect(s.penalties.map((p) => p.points), chosen).toEqual([points]);
      expect(missed(s), chosen).not.toContain('12-lead of the tachycardia itself, before it stops');
    }
  });
});

describe('pre-excited AF in the field — the AV-nodal blockers', () => {
  it('diltiazem, metoprolol and amiodarone speed it up and drop the pressure: one critical penalty each, and VF within 2 minutes', () => {
    for (const drug of ['diltiazem', 'metoprolol', 'amio-infusion', 'amio-arrest']) {
      let s = medic([...WORKED_UP, drug]);
      expect(s.rhythm, drug).toEqual({ profile: 'af-wpw', hr: 240 });
      expect([s.vitals.sbp, s.vitals.dbp], drug).toEqual([80, 48]);
      expect(s.flags.unstable, drug).toBeDefined();
      expect(s.penalties, drug).toEqual([expect.objectContaining({ id: 'av-blocker-preexcited-af', severity: 'critical', points: 15 })]);
      expect(s.log.some((l) => l.who === 'monitor' && l.text === 'The complexes come faster and wider: heart rate 240. BP 80/48.'), drug).toBe(true);
      const at = s.minute;
      s = until(s, (x) => !x.pulse);
      expect(s.rhythm.profile, drug).toBe('vf');
      expect(s.minute - at, drug).toBeLessThanOrEqual(2);
      expect(s.log.some((l) => l.who === 'monitor' && l.text === 'Monitor alarm!'), drug).toBe(true);
    }
  });

  it('adenosine acts in seconds: no pause, faster and wider — and VF at once', () => {
    for (const drug of ['adenosine6', 'adenosine12']) {
      const s = medic([...WORKED_UP, drug]);
      expect(s.pulse, drug).toBe(false);
      expect(s.rhythm.profile, drug).toBe('vf');
      expect(penalties(s), drug).toEqual(['av-blocker-preexcited-af']);
      expect(s.log.some((l) => l.who === 'monitor' && l.text === 'No pause at all. The complexes come faster and wider.'), drug).toBe(true);
    }
  });

  it('a second blocker on top is a second mistake (each label rules its drug out); amiodarone on top of procainamide is one penalty', () => {
    expect(penalties(medic([...WORKED_UP, 'diltiazem', 'metoprolol']))).toEqual(['av-blocker-preexcited-af', 'av-blocker-preexcited-af']);
    expect(penalties(medic([...WORKED_UP, 'procainamide', 'amio-infusion']))).toEqual(['av-blocker-preexcited-af']);
  });

  it('shocked at once after the blocker, he is saved: the unstable item is met and the sedation item does not apply', () => {
    const s = medic([...WORKED_UP, 'diltiazem', 'cardiovert', 'ecg12-repeat', 'med-control', 'transport-pci', UNTIL_ARRIVED, 'handoff']);
    expect(s.pulse).toBe(true);
    expect(s.rhythm.profile).toBe('wpw');
    expect(penalties(s)).toEqual(['av-blocker-preexcited-af']);
    const r = review(sc, s);
    expect(r.toFix.map((t) => `${t.kind}:${t.label}`)).toEqual([
      'harm:An AV-nodal blocker for pre-excited atrial fibrillation.',
      'missed:Convert him while he is stable: a sedated synchronized cardioversion at 200 J, or IV procainamide',
    ]);
  });

  it('once he is back in sinus rhythm a rate drug has nothing to treat: a minor penalty, and the critical one never fires', () => {
    for (const drug of ['diltiazem', 'metoprolol', 'adenosine6', 'amio-infusion']) {
      const s = medic([...IDEAL_SHOCK.slice(0, IDEAL_SHOCK.indexOf('cardiovert') + 1), drug]);
      expect(penalties(s), drug).toEqual(['rate-drug-after-conversion']);
      expect(s.pulse, drug).toBe(true);
    }
    expect(penalties(medic([...WORKED_UP, 'sedation', 'cardiovert', 'amio-arrest']))).toEqual(['arrest-amio-with-pulse']);
  });
});

describe('pre-excited AF in the field — shocks', () => {
  it('an unsynchronized shock with a pulse lands on a T wave: VF, a critical penalty; a defibrillation then brings organized complexes, CPR the pulse', () => {
    let s = medic([...WORKED_UP, 'defib']);
    expect(s.pulse).toBe(false);
    expect(s.rhythm.profile).toBe('vf');
    expect(s.penalties).toEqual([expect.objectContaining({ id: 'shock-with-pulse', severity: 'critical', points: 15 })]);
    s = perform(sc, s, 'defib');
    expect(s.pulse).toBe(false);
    expect(s.rhythm.profile).toBe('wpw');
    expect(s.log.at(-1)!.text).toBe('Organized complexes on the screen now — no pause for a pulse check after a shock: compressions resume at once.');
    s = perform(sc, s, 'cpr');
    expect(s.pulse).toBe(true);
    expect(s.rhythm).toEqual({ profile: 'wpw', hr: 108 });
    expect(penalties(s)).toEqual(['shock-with-pulse']);
    const labels = review(sc, stop(s)).wentWell.map((w) => w.label);
    expect(labels).toEqual(expect.arrayContaining(['No pulse: shock at once (the AED, or unsynchronized defibrillation)', 'CPR straight after the shock']));
  });

  it('an elective cardioversion of an awake patient without sedation costs points, and the sedation item is missed', () => {
    const s = medic([...WORKED_UP, 'cardiovert']);
    expect(s.rhythm.profile).toBe('wpw');
    expect(penalties(s)).toEqual(['no-sedation']);
    expect(s.log.some((l) => l.who === 'patient' && l.text === '"Aagh! What was that?"')).toBe(true);
    expect(missed(s)).toContain('Sedation or analgesia before the elective cardioversion');
    expect(missed(s)).not.toContain('Convert him while he is stable: a sedated synchronized cardioversion at 200 J, or IV procainamide');
  });

  it('after a few minutes of VF with no compressions a shock alone does not bring organized complexes back: CPR, then the shock', () => {
    let s = medic([...WORKED_UP, 'adenosine6', ...R(2)]);
    expect(s.rhythm.profile).toBe('vf');
    s = perform(sc, s, 'defib');
    expect(s.rhythm.profile).toBe('vf');
    expect(s.log.at(-1)!.text).toBe('The same chaotic line on the screen: back to compressions at once.');
    s = perform(sc, s, 'cpr');
    expect(s.rhythm.profile).toBe('vf');
    s = perform(sc, s, 'defib');
    expect(s.rhythm.profile).toBe('wpw');
    s = perform(sc, s, 'cpr');
    expect(s.pulse).toBe(true);
    expect(late(s)).toContain('No pulse: shock at once (the AED, or unsynchronized defibrillation)');
  });

  it('in VF with the pads on, anything before the shock costs points; a rate drug there costs too', () => {
    expect(penalties(medic([...WORKED_UP, 'adenosine6', 'epinephrine']))).toEqual(['av-blocker-preexcited-af', 'delay-shock']);
    const s = medic([...WORKED_UP, 'adenosine6', 'adenosine12']);
    expect(penalties(s)).toEqual(['av-blocker-preexcited-af', 'rate-drug-in-arrest']);
    expect(s.log.at(-1)!.text).toBe('It has no place in cardiac arrest, and nothing changes on the monitor.');
  });
});

describe('pre-excited AF in the field — delay, procainamide and the other drugs', () => {
  it('left untreated he becomes unstable at minute 12, and goes into VF 5 minutes later', () => {
    let s = until(medic(WORKED_UP), (x) => x.fired.includes('unstable-delay'));
    expect(s.flags.unstable).toBeGreaterThanOrEqual(UNSTABLE_AT);
    expect(s.rhythm).toEqual({ profile: 'af-wpw', hr: 236 });
    expect([s.vitals.sbp, s.vitals.dbp]).toEqual([84, 52]);
    expect(s.log.some((l) => l.who === 'monitor' && l.text === 'Heart rate 236. BP 84/52.')).toBe(true);
    const at = s.flags.unstable;
    s = until(s, (x) => !x.pulse);
    expect(s.rhythm.profile).toBe('vf');
    expect(s.minute - at).toBeGreaterThanOrEqual(5);
  });

  it('once he is unstable, a synchronized shock within 3 minutes saves him — no sedation needed, and no penalty', () => {
    let s = until(medic(WORKED_UP), (x) => x.fired.includes('unstable-delay'));
    s = perform(sc, s, 'cardiovert');
    expect(s.pulse).toBe(true);
    expect(s.rhythm.profile).toBe('wpw');
    expect(s.penalties).toEqual([]);
    const fix = toFix(s).map((t) => t.label);
    expect(fix).not.toContain('Unstable: synchronized cardioversion at 200 J within 3 minutes');
    expect(fix).not.toContain('Sedation or analgesia before the elective cardioversion');
    // he was never converted while stable: that one is missed
    expect(missed(s)).toContain('Convert him while he is stable: a sedated synchronized cardioversion at 200 J, or IV procainamide');
  });

  it('procainamide once he is unstable is one mistake, in this case\'s words (not the built-in low-pressure rule as well)', () => {
    const s = perform(sc, until(medic(WORKED_UP), (x) => x.fired.includes('unstable-delay')), 'procainamide');
    expect(penalties(s)).toEqual(['drug-while-unstable']);
  });

  it('procainamide keeps him from getting unstable while it works', () => {
    const s = until(medic([...WORKED_UP, 'procainamide']), (x) => x.fired.includes('drug-converts'));
    expect(s.fired).not.toContain('unstable-delay');
    expect(s.rhythm).toEqual({ profile: 'wpw', hr: 92 });
    expect(s.penalties).toEqual([]);
  });

  it('magnesium and a vagal maneuver act on the node, not the pathway: nothing changes, a minor penalty; so is lidocaine (its label rules it out in WPW)', () => {
    for (const [drug, harm] of [['magnesium-sulfate', 'magnesium-preexcited-af'], ['vagal', 'vagal-preexcited-af']]) {
      const s = medic([...WORKED_UP, drug]);
      expect(s.rhythm, drug).toEqual(PREEXCITED);
      expect(penalties(s), drug).toEqual([harm]);
    }
    const s = medic([...WORKED_UP, 'lidocaine']);
    expect(s.rhythm).toEqual(PREEXCITED);
    expect(s.penalties).toEqual([expect.objectContaining({ id: 'lidocaine-no-arrhythmia', points: 3, severity: 'minor' })]);
    expect(s.log.at(-1)!.text).toBe('No change: heart rate 214.');
  });

  it('the arrest dose of epinephrine with a pulse drives the pathway faster: a critical penalty, then VF', () => {
    let s = medic([...WORKED_UP, 'epinephrine']);
    expect(s.rhythm).toEqual({ profile: 'af-wpw', hr: 250 });
    expect(penalties(s)).toEqual(['arrest-epi-with-pulse']);
    s = until(s, (x) => !x.pulse);
    expect(s.rhythm.profile).toBe('vf');
  });

  it('a pressor with a normal pressure speeds the rate and costs a minor penalty; aspirin, CPAP and nitroglycerin have nothing to treat', () => {
    const s = medic([...WORKED_UP, 'push-epi']);
    expect(s.rhythm).toEqual({ profile: 'af-wpw', hr: 230 });
    expect(penalties(s)).toEqual(['adrenergic-preexcited-af']);
    expect(penalties(medic([...WORKED_UP, 'aspirin', 'cpap', 'nitro']))).toEqual(['aspirin-no-acs', 'cpap-no-indication', 'nitro-no-pain']);
  });

  it('oxygen is neither required nor penalized: his SpO₂ is 97 %', () => {
    const s = medic([...WORKED_UP, 'o2-nc']);
    expect(s.penalties).toEqual([]);
    expect(criticalsFor(sc, 2).some((c) => Array.isArray(c.done) && c.done.includes('o2-nc'))).toBe(false);
  });
});

describe('pre-excited AF in the field — the EMT', () => {
  it('the AED is not applied while he has a pulse: refused with the reason, no time passes, nothing is scored', () => {
    const pads = emt(['pads']);
    const s = emt(['pads', 'aed']);
    expect(s.minute).toBe(pads.minute);
    expect(s.counts.aed).toBeUndefined();
    expect(s.penalties).toEqual([]);
    expect(s.log.at(-1)).toMatchObject({ who: 'system', text: expect.stringMatching(/^Not with a pulse/) });
  });

  it('with no ALS call he goes into VF at minute 17; the AED, then CPR, bring him back — and the review says the call was missed, and charges the arrest', () => {
    let s = until(emt(EMT_NO_ALS), (x) => !x.pulse);
    expect(s.rhythm.profile).toBe('vf');
    expect(s.fired).toEqual(expect.arrayContaining(['unstable-delay', 'vf-unstable']));
    s = perform(sc, s, 'aed');
    expect(s.log.some((l) => l.text === 'AED: "Shock advised." Shock delivered. "Start CPR."')).toBe(true);
    expect(s.log.at(-1)!.text).toBe('He is still unresponsive and not breathing normally.');
    s = perform(sc, s, 'cpr');
    expect(s.pulse).toBe(true);
    for (const step of ['vitals', 'ecg12-repeat', 'transport-pci', UNTIL_ARRIVED, 'handoff']) {
      s = step === UNTIL_ARRIVED ? until(s, (x) => 'arrived' in x.flags) : perform(sc, s, step);
    }
    expect(s.ended?.reason).toBe('complete');
    // the arrest the wait brought is charged once, at the minute it came: a good resuscitation does not score like preventing it
    expect(s.penalties.map((p) => [p.id, p.points, p.severity])).toEqual([['preventable-arrest', 10, 'major']]);
    expect(s.penalties[0].text).toMatch(/^He arrested after the fast rhythm was left untreated\. Requested at once, the paramedic intercept arrives 8 minutes later/);
    expect(missed(s)).toEqual(['Request ALS (paramedic intercept) at once']);
    // they stayed on scene until he arrested: loaded only after ROSC, past the 15-minute goal
    expect(late(s)).toEqual(['Transport promptly']);
  });

  it('an intercept called late finds him unstable: the paramedics sedate and cardiovert him; the call is late', () => {
    const s = until(emt([...EMT_NO_ALS, 'als']), (x) => x.fired.includes('als-arrives'));
    expect(s.fired).toContain('unstable-delay');
    expect(s.pulse).toBe(true);
    expect(s.rhythm).toEqual({ profile: 'wpw', hr: 92 });
    expect(s.flags.cardioverted).toBeDefined();
    expect(said(s)).toMatch(/midazolam 1 mg IV, then a synchronized shock at 200 J/);
    expect(late(s)).toContain('Request ALS (paramedic intercept) at once');
  });

  it('an intercept that arrives to unshocked VF defibrillates at once; the EMT\'s own shock is missed', () => {
    let s = emt([...EMT_NO_ALS, ...R(3), 'als']);
    s = until(s, (x) => x.fired.includes('als-arrives'));
    expect(s.fired).toContain('vf-unstable');
    expect(said(s)).toMatch(/he has not been shocked yet — they defibrillate at once/);
    expect(s.rhythm.profile).toBe('wpw');
    expect(s.pulse).toBe(false);
    s = perform(sc, s, 'cpr');
    expect(s.pulse).toBe(true);
    expect(missed(s)).toContain('No pulse: shock at once (the AED, or unsynchronized defibrillation)');
  });

  it('CPR on him while he has a pulse is penalized; aspirin has nothing to treat', () => {
    expect(penalties(emt(['primary', 'cpr', 'aspirin']))).toEqual(['cpr-with-pulse', 'aspirin-no-acs']);
  });
});

describe('pre-excited AF in the field — medical control', () => {
  it('names nothing before the 12-lead; after it, the paramedic hears the plan and the drugs to avoid', () => {
    const before = /pre-excit|WPW|pathway|fibrillation|\bAF\b|procainamide/i;
    for (const role of [1, 2] as const) {
      const s = runScenario(sc, role, ['primary', 'med-control']);
      expect(s.log.at(-1)!.text, `role ${role}`).not.toMatch(before);
    }
    const after = medic(['primary', 'pads', 'ecg12', 'med-control']).log.at(-1)!.text;
    expect(after).toMatch(/No adenosine, no diltiazem, no beta-blocker and no amiodarone/);
    expect(after).toMatch(/sedated synchronized cardioversion at 200 J, or procainamide 20–50 mg\/min/);
    expect(medic([...WORKED_UP, 'procainamide', 'med-control']).log.at(-1)!.text).toMatch(/let the procainamide run/);
  });
});

describe('pre-excited AF in the field — the learner reads the tracings', () => {
  const RUNS: [1 | 2, string[]][] = [
    [1, IDEAL[1]], [2, IDEAL[2]], [2, IDEAL_SHOCK],
    [2, [...WORKED_UP, 'diltiazem', 'reassess', 'defib', 'cpr', 'ecg12-repeat']],
    [2, [...WORKED_UP, 'adenosine6', 'defib', 'cpr']],
    [2, [...WORKED_UP, 'defib', 'defib', 'cpr']],
    [2, [...WORKED_UP, ...R(6), 'cardiovert', 'ecg12-repeat']],
    [2, [...WORKED_UP, 'epinephrine', 'push-epi', 'reassess', 'reassess', 'defib', 'cpr']],
    [2, [...WORKED_UP, 'magnesium-sulfate', 'vagal', 'lidocaine', 'metoprolol', 'cardiovert']],
    [1, [...EMT_NO_ALS, ...R(6), 'aed', 'cpr', 'vitals', 'ecg12-repeat']],
    [1, [...EMT_NO_ALS, ...R(3), 'als', ...R(5)]],
  ];

  it('no monitor, partner, team or patient line names the rhythm; every rhythm is a real profile; US spelling throughout', () => {
    for (const [role, steps] of RUNS) {
      const s = runScenario(sc, role, steps, (st) => expect(resolveProfile(st.rhythm.profile).id, st.rhythm.profile).toBe(st.rhythm.profile));
      for (const l of s.log) {
        if (['monitor', 'partner', 'team', 'patient', 'scene', 'dispatch'].includes(l.who)) expect(l.text, `${l.who}: ${l.text}`).not.toMatch(GIVEAWAY);
        expect(l.text, l.text).not.toMatch(BRITISH);
      }
    }
    expect(JSON.stringify(sc)).not.toMatch(BRITISH);
    expect(sc.teaching.join(' ')).not.toMatch(BRITISH);
  });

  it('teaches the 2023 AF guideline and the 2025 energy: no AV-nodal blockers, a shock or procainamide, 200 J, ablation', () => {
    const text = sc.teaching.join(' ');
    expect(text).toMatch(/2023 ACC\/AHA\/ACCP\/HRS AF guideline: 3 — Harm/);
    expect(text).toMatch(/adenosine, diltiazem and verapamil, beta-blockers, digoxin and amiodarone/);
    expect(text).toMatch(/200 J or more biphasic \(2025 AHA\)/);
    expect(text).toMatch(/procainamide/i);
    expect(text).toMatch(/ablation/);
    expect(text).not.toMatch(/120–200 J|50–100 J/);
  });
});

describe('pre-excited AF in the field — review fixes', () => {
  it('procainamide runs at 50 mg/min and stops the AF 10 minutes in: about 500 mg, well under the 17 mg/kg ceiling', () => {
    const s = until(medic([...WORKED_UP, 'procainamide']), (x) => x.fired.includes('drug-converts'));
    const ran = s.flags['drug-converted'] - s.flags['proc-running'];
    expect(ran).toBe(10);
    expect(50 * ran).toBeLessThan(17 * 78);
    expect(said(s)).not.toMatch(/30 mg\/min/);
  });

  it('midazolam for the shock needs a line: refused without one (no time passes), titrated IV with one', () => {
    const noLine = medic(['primary', 'pads', 'nibp', 'ecg12', 'midazolam']);
    const before = medic(['primary', 'pads', 'nibp', 'ecg12']);
    expect(noLine.minute).toBe(before.minute);
    expect(noLine.counts.midazolam).toBeUndefined();
    expect(noLine.flags.sedation).toBeUndefined();
    expect(noLine.log.at(-1)).toMatchObject({ who: 'system', text: expect.stringMatching(/start a line first/) });
    const s = medic([...WORKED_UP, 'midazolam', 'cardiovert']);
    expect(s.log.some((l) => l.text.startsWith('Midazolam 1 mg IV, small and titrated'))).toBe(true);
    expect(s.penalties).toEqual([]);
    expect(missed(s)).not.toContain('Sedation or analgesia before the elective cardioversion');
  });

  it('the intercept looks at the EMT\'s 12-lead only if there is one, and runs procainamide at 50 mg/min', () => {
    const team = (s: SimState) => s.log.find((l) => l.who === 'team' && /intercept arrives/.test(l.text))!.text;
    const withEcg = until(emt(['als', 'primary', 'vitals', 'pads', 'ecg12', 'ecg-transmit']), (x) => x.fired.includes('als-arrives'));
    expect(team(withEcg)).toMatch(/a look at your 12-lead/);
    expect(team(withEcg)).toMatch(/procainamide running at 50 mg\/min/);
    const without = until(emt(['als', 'primary', 'vitals', 'pads']), (x) => x.fired.includes('als-arrives'));
    expect(team(without)).toMatch(/their own 12-lead/);
    expect(team(without)).not.toMatch(/your 12-lead/);
  });

  it('medical control answers the EMT\'s transmitted 12-lead instead of asking for one again', () => {
    const before = emt(['als', 'primary', 'pads', 'med-control']).log.at(-1)!.text;
    expect(before).toMatch(/transmit me a 12-lead/);
    const after = emt(['als', 'primary', 'pads', 'ecg12', 'ecg-transmit', 'med-control']).log.at(-1)!.text;
    expect(after).toMatch(/I have your 12-lead/);
    expect(after).not.toMatch(/transmit me a 12-lead/);
    expect(after).toMatch(/keep the paramedics coming/);
  });

  it('the arrival line fits either destination: the nearest emergency department is no heart center', () => {
    const near = until(medic(['primary', 'pads', 'nibp', 'ecg12', 'transport-near']), (x) => 'arrived' in x.flags);
    const arrival = near.log.find((l) => l.who === 'hospital' && /You arrive/.test(l.text))!.text;
    expect(arrival).not.toMatch(/heart center/);
    expect(arrival).toMatch(/emergency department/);
  });

  it('no line straight after a shock says a pulse was checked: compressions come first', () => {
    const afterShock = (s: SimState) => s.log.slice(s.log.findLastIndex((l) => /Shock delivered|shock him at once/.test(l.text))).map((l) => l.text).join('\n');
    const runs = [
      medic([...WORKED_UP, 'adenosine6', 'defib']),
      medic([...WORKED_UP, 'adenosine6', ...R(2), 'defib']),
      until(emt(EMT_NO_ALS), (x) => !x.pulse),
      emt([...EMT_NO_ALS, ...R(3), 'als']),
    ];
    runs[2] = perform(sc, runs[2], 'aed');
    runs[3] = until(runs[3], (x) => x.fired.includes('als-arrives'));
    for (const s of runs) expect(afterShock(s)).not.toMatch(/pulse at his neck|no pulse yet|Still no pulse/);
    expect(afterShock(runs[0])).toMatch(/no pause for a pulse check/);
  });

  it('the summary in the case picker does not give the trap away', () => {
    expect(sc.summary).not.toMatch(/rate drug|adenosine|diltiazem|blocker|kill|pathway|WPW|pre-excit|fibrillation/i);
  });

  it('a pressure in both arms checks for instability; after ROSC a reassessment gives the EMT the pressure', () => {
    const s = medic(['primary', 'pads', 'bp-both-arms']);
    expect(toFix(s).map((t) => t.label)).not.toContain('Check for instability: blood pressure and mental status');
    let e = until(emt(EMT_NO_ALS), (x) => !x.pulse);
    e = perform(sc, perform(sc, e, 'aed'), 'cpr');
    e = perform(sc, e, 'reassess');
    expect(e.log.at(-2)!.text).toMatch(/^BP \d+\/\d+/);
    expect(toFix(e).map((t) => t.label)).not.toContain('After ROSC: check his blood pressure');
  });

  it('transport has a 15-minute goal: an arrest on the way does not undo a prompt start, a crew that waited on scene is late', () => {
    const label = 'Transport promptly';
    // the paramedic who waits on scene with no treatment until he is unstable, then shocks him, loads late
    const waited = medic([...WORKED_UP, ...R(3), 'sedation', 'cardiovert', 'ecg12-repeat', 'med-control', 'transport-pci']);
    expect(late(waited)).toContain(label);
    // the EMT who loaded him at once keeps the credit when he arrests on the way
    let enroute = until(emt([...EMT_NO_ALS, 'transport-pci']), (x) => !x.pulse);
    expect(enroute.flags.arrest).toBeGreaterThan(enroute.flags.enroute);
    enroute = perform(sc, perform(sc, enroute, 'aed'), 'cpr');
    expect(toFix(enroute).map((t) => t.label)).not.toContain(label);
    // the right care is never late
    for (const steps of [IDEAL[2], IDEAL_SHOCK]) expect(late(medic(steps))).not.toContain(label);
    expect(late(emt(IDEAL[1]))).not.toContain(label);
  });

  it('the EMT\'s ALS call is late after 3 minutes, and missed once it comes only after he arrested', () => {
    const label = 'Request ALS (paramedic intercept) at once';
    // called at 3:30, after the first look, the history and the pads
    expect(late(emt(['primary', 'vitals', 'pads', 'sample', 'als']))).toContain(label);
    let s = until(emt(EMT_NO_ALS), (x) => !x.pulse);
    s = perform(sc, perform(sc, perform(sc, s, 'aed'), 'cpr'), 'als');
    expect(missed(s)).toContain(label);
    expect(late(s)).not.toContain(label);
  });

  it('a pressor is no bridge in pre-excited AF: penalized at a low pressure too, and the shock is still owed', () => {
    const unstableNow = until(medic(WORKED_UP), (x) => x.fired.includes('unstable-delay'));
    expect(unstableNow.vitals.sbp).toBeLessThan(90);
    for (const drug of ['push-epi', 'pressor']) {
      const s = perform(sc, unstableNow, drug);
      expect(penalties(s), drug).toEqual(['adrenergic-preexcited-af']);
      expect(s.rhythm.hr, drug).toBeGreaterThan(unstableNow.rhythm.hr);
      expect(s.flags.unstable, drug).toBeDefined();
    }
  });

  it('an amiodarone infusion in VF is a drug for a tachycardia with a pulse: a minor penalty', () => {
    const s = medic([...WORKED_UP, 'adenosine6', 'defib', 'amio-infusion']);
    expect(penalties(s)).toEqual(['av-blocker-preexcited-af', 'rate-drug-in-arrest']);
  });

  it('the EMT\'s review times the intercept\'s shock once he is unstable', () => {
    const s = until(emt([...EMT_NO_ALS, 'als']), (x) => x.fired.includes('als-arrives'));
    const timing = review(sc, stop(s)).timings.find((t) => t.label === 'Synchronized cardioversion once unstable')!;
    expect(timing.minute).not.toBeNull();
    expect(timing.met).toBe(timing.minute! <= 3);
  });

  it('the vagal maneuver\'s headline speaks to what an EMT can feel, not to a tracing the EMT cannot read', () => {
    const s = emt(['primary', 'vagal']);
    expect(penalties(s)).toEqual(['vagal-preexcited-af']);
    const headline = toFix(s).find((t) => t.kind === 'harm')!.label;
    expect(headline).toBe('A vagal maneuver for a very fast, irregular heartbeat.');
  });
});

describe('pre-excited AF in the field — the intercept on scene', () => {
  it('once the paramedics are with the EMT, the physician no longer calls them "on their way"', () => {
    const here = until(emt(['als', 'primary', 'vitals', 'pads', 'sample', 'ecg12']), (x) => x.fired.includes('als-arrives'));
    const transmit = perform(sc, here, 'ecg-transmit').log.at(-1)!.text;
    expect(transmit).toMatch(/the paramedics with you need to know/);
    const advice = perform(sc, perform(sc, here, 'ecg-transmit'), 'med-control').log.at(-1)!.text;
    expect(advice).not.toMatch(/keep the paramedics coming|on their way/);
  });
});

describe('pre-excited AF in the field — an AED is not a monitor', () => {
  it('with only the AED pads on, the EMT sees no rate, pressure or alarm on a screen, and has no NIBP', () => {
    const aedOnly = ['primary', 'vitals', 'pads', 'als'];
    expect(emt(aedOnly).flags.monitor).toBeUndefined();
    const nibp = emt([...aedOnly, 'nibp']);
    expect(nibp.log.at(-1)).toMatchObject({ who: 'system' });
    // no call, no 12-lead and no transport: he deteriorates and arrests in front of a silent AED
    const s = until(emt(['primary', 'vitals', 'pads']), (x) => !x.pulse);
    expect(s.fired).toEqual(expect.arrayContaining(['unstable-delay', 'vf-unstable']));
    expect(s.log.filter((l) => l.who === 'monitor')).toEqual([]);
    expect(s.log.some((l) => l.who === 'partner' && /gone limp/.test(l.text))).toBe(true);
  });

  it('the paramedic intercept brings its monitor: its numbers show even where the EMT had only the AED', () => {
    const s = until(emt(['als', 'primary', 'vitals', 'pads']), (x) => x.fired.includes('als-arrives'));
    expect(s.flags.monitor).toBeDefined();
    expect(s.log.some((l) => l.who === 'monitor' && /^Heart rate 176\. BP \d+\/\d+\.$/.test(l.text))).toBe(true);
  });
});
