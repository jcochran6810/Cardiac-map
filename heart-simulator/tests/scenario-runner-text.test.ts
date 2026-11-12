import { describe, expect, it } from 'vitest';
import { perform, review } from '@/lib/sim/scenario/engine';
import { SCENARIO_BY_ID } from '@/lib/sim/scenario/scenarios';
import type { SimState } from '@/lib/sim/scenario/types';
import { endedSummary, twelveLeadNote } from '@/components/simulator/runnerText';
import { UNTIL_ARRIVED, runScenario as run } from './helpers';

/**
 * What the case runner tells the learner when a case ends (the story's last line, the end card, the phone's end bar)
 * and what the 12-lead tab says about its tracing: none of it may claim something that did not happen.
 */

const stableVt = SCENARIO_BY_ID['stable-vt-field'];
const vf = SCENARIO_BY_ID['vf-arrest-field'];
const svt = SCENARIO_BY_ID['svt-unstable-field'];
const af = SCENARIO_BY_ID['af-rvr-field'];
const bb = SCENARIO_BY_ID['beta-blocker-overdose-field'];
const pea = SCENARIO_BY_ID['pea-arrest-field'];
const R = (n: number) => Array<string>(n).fill('reassess');
const lastLine = (s: SimState) => s.log.at(-1)!.text;

/** Reassess until the case ends (or `max` times) */
function untilEnded(sc: typeof stableVt, s: SimState, max = 30): SimState {
  for (let i = 0; i < max && !s.ended; i++) s = perform(sc, s, 'reassess');
  return s;
}

describe('the death line says whether anyone resuscitated', () => {
  it('no CPR and no shock: it never says "despite resuscitation" (diltiazem in VT, then only reassessments)', () => {
    const s = untilEnded(stableVt, run(stableVt, 2, ['primary', 'monitor', 'iv', 'diltiazem']));
    expect(s.ended?.reason).toBe('death');
    expect(s.performed.some((p) => ['cpr', 'aed', 'defib', 'cardiovert'].includes(p.id))).toBe(false);
    expect(lastLine(s)).toBe('You gave no CPR and no shock in this arrest. There is no return of circulation: the patient has died.');
    expect(s.log.some((l) => /Despite resuscitation/.test(l.text))).toBe(false);
  });

  it('CPR given in the arrest: "despite resuscitation"', () => {
    const s = untilEnded(vf, run(vf, 2, ['cpr']));
    expect(s.ended?.reason).toBe('death');
    expect(lastLine(s)).toBe('Despite resuscitation there is no return of circulation. The patient has died.');
  });

  it('a shock delivered to VF is a resuscitation, even without CPR', () => {
    const s = untilEnded(vf, run(vf, 2, ['defib']));
    expect(s.ended?.reason).toBe('death');
    expect(lastLine(s)).toBe('Despite resuscitation there is no return of circulation. The patient has died.');
  });

  it('SYNC left on in VF never fires: no shock was given', () => {
    const s = untilEnded(vf, run(vf, 2, ['cardiovert', 'cardiovert']));
    expect(s.ended?.reason).toBe('death');
    expect(s.log.filter((l) => l.text === 'SYNC is on: no R waves to synchronize to — the device does not fire.')).toHaveLength(2);
    expect(lastLine(s)).toBe('You gave no CPR and no shock in this arrest. There is no return of circulation: the patient has died.');
  });

  it('PEA: an AED that advises no shock is no resuscitation, and no shock is never named as missing', () => {
    const s = untilEnded(pea, run(pea, 1, ['aed']));
    expect(s.ended?.reason).toBe('death');
    expect(s.log.some((l) => l.text === 'AED: "No shock advised. Start CPR."')).toBe(true);
    expect(lastLine(s)).toBe('You gave no CPR in this arrest. There is no return of circulation: the patient has died.');
  });

  it('PEA: a manual shock on a rhythm that is not shockable is no resuscitation either (and is scored as a harm)', () => {
    const s = untilEnded(pea, run(pea, 2, ['defib']));
    expect(s.ended?.reason).toBe('death');
    expect(s.penalties.some((p) => p.id === 'shock-pea')).toBe(true);
    expect(lastLine(s)).toBe('You gave no CPR in this arrest. There is no return of circulation: the patient has died.');
  });

  it('PEA with nothing done: only the missing CPR is named (PEA and asystole are not shockable)', () => {
    const s = untilEnded(pea, run(pea, 2, []));
    expect(s.ended?.reason).toBe('death');
    expect(lastLine(s)).toBe('You gave no CPR in this arrest. There is no return of circulation: the patient has died.');
    // the overdose's PEA after diltiazem says the same
    const d = untilEnded(bb, run(bb, 2, ['primary', 'pads', 'iv', 'diltiazem']));
    expect(d.ended?.reason).toBe('death');
    expect(lastLine(d)).toBe('You gave no CPR in this arrest. There is no return of circulation: the patient has died.');
  });

  it('only what was done in this arrest counts: CPR before the pulse was lost is not a resuscitation of it', () => {
    let s = run(stableVt, 2, ['primary', 'monitor', 'iv', 'diltiazem']);
    for (let i = 0; i < 30 && s.pulse; i++) s = perform(stableVt, s, 'reassess');
    expect(s.pulse).toBe(false);
    const arrestAt = s.timers.arrestAt!;
    // as if compressions had been given before this arrest began (a pulse lost, regained, and lost again)
    s = { ...s, performed: [...s.performed, { id: 'cpr', minute: arrestAt - 1 }] };
    s = untilEnded(stableVt, s);
    expect(s.ended?.reason).toBe('death');
    expect(lastLine(s)).toMatch(/^You gave no CPR and no shock in this arrest\./);
  });
});

describe('a hand-off never reads as a finished case', () => {
  it('with critical items missing, the story says how many — the same count as the review', () => {
    const s = run(stableVt, 2, ['primary', 'pads', 'nibp', 'transport-near', UNTIL_ARRIVED, 'handoff']);
    expect(s.ended?.reason).toBe('complete');
    const r = review(stableVt, s);
    expect(r.missed).toBeGreaterThan(1);
    expect(lastLine(s)).toBe(`Care handed over with ${r.missed} critical items still not done.`);
    expect(s.log.at(-1)!.tone).toBe('warn');
    expect(s.log.some((l) => /scenario complete/.test(l.text))).toBe(false);
    // the end card and the phone's end bar
    expect(endedSummary('complete', r.outcome)).toEqual({ title: 'Patient handed over', text: r.outcome });
    expect(r.outcome).toMatch(new RegExp(`with ${r.missed} critical items not done\\.$`));
  });

  it('one item missing: singular', () => {
    // the unstable SVT converted, but no 12-lead after the conversion
    const s = run(svt, 2, ['primary', 'pads', 'nibp', 'iv', 'sedation', 'cardiovert', 'transport-near', UNTIL_ARRIVED, 'handoff']);
    expect(review(svt, s).missed).toBe(1);
    expect(lastLine(s)).toBe('Care handed over with 1 critical item still not done.');
  });

  it('every critical item done: the case completes as before', () => {
    const s = run(af, 2, ['primary', 'vitals', 'monitor', 'ecg12', 'opqrst', 'sample', 'lungs', 'iv', 'amio-infusion', 'transport-near', UNTIL_ARRIVED, 'handoff']);
    expect(s.ended?.reason).toBe('complete');
    expect(lastLine(s)).toBe('All critical interventions are done — scenario complete.');
    expect(endedSummary('complete', review(af, s).outcome)).toEqual({ title: 'Case complete', text: 'Every critical step for your role is done.' });
  });

  it('the end summary for a death and for a case stopped early', () => {
    expect(endedSummary('death', 'The patient died.').title).toBe('The patient died');
    expect(endedSummary('stopped', 'Ended early at 3:00 with 9 critical items not done.').title).toBe('Case ended');
  });
});

describe('the 12-lead tab', () => {
  const AF_IDEAL = ['primary', 'vitals', 'monitor', 'ecg12', 'opqrst', 'sample', 'lungs', 'iv', 'amio-infusion', 'transport-near', UNTIL_ARRIVED, 'handoff'];

  it('once the case is over it still says the tracing below is live, but offers no repeat', () => {
    const s = run(af, 2, AF_IDEAL);
    expect(s.ended).not.toBeNull();
    // amiodarone slowed the rate after the tracing: while the case ran, this asked for a repeat
    expect(twelveLeadNote({ ...s, ended: null })).toMatchObject({ changed: true, canRepeat: true });
    // after it, the verdict sits above the live rhythm: the notice stays, the repeat prompt goes
    expect(twelveLeadNote(s)).toMatchObject({ changed: true, canRepeat: false, note: { kind: 'verdict', verdict: 'correct' } });
  });

  it('the stable VT read after cardioversion and hand-off: the verdict is over a live sinus rhythm, and it says so', () => {
    const s = run(stableVt, 2, ['primary', 'monitor', 'nibp', 'iv', 'ecg12', 'amio-infusion', 'reassess', 'reassess', 'transport-near', UNTIL_ARRIVED, 'handoff']);
    expect(s.ended?.reason).toBe('complete');
    expect(s.lastEcg!.profile).not.toBe(s.rhythm.profile);
    expect(twelveLeadNote(s)).toMatchObject({ changed: true, canRepeat: false, note: { kind: 'verdict', verdict: 'correct' } });
  });

  it('in an arrest the tracing below is live too, and a repeat 12-lead is not offered', () => {
    let s = run(stableVt, 2, ['primary', 'monitor', 'iv', 'ecg12', 'diltiazem']);
    for (let i = 0; i < 30 && s.pulse; i++) s = perform(stableVt, s, 'reassess');
    expect(s.pulse).toBe(false);
    expect(s.ended).toBeNull();
    expect(twelveLeadNote(s)).toMatchObject({ changed: true, canRepeat: false });
  });

  it('an unchanged repeat names the read it matched, so a later change does not contradict it', () => {
    const before = run(bb, 2, ['primary', 'pads', 'ecg12']);
    const readAt = before.lastEcg!.minute;
    let s = run(bb, 2, ['primary', 'pads', 'ecg12', 'ecg12-repeat']);
    // the repeat matched: no new read was asked
    expect(s.log.some((l) => l.text === 'Unchanged from the previous 12-lead.')).toBe(true);
    expect(twelveLeadNote(s)).toEqual({ note: { kind: 'unchanged', readAt }, changed: false, canRepeat: true });
    for (const id of ['sample', 'iv', 'glucose', 'dextrose', 'glucagon', 'pressor']) s = perform(bb, s, id);
    expect(twelveLeadNote(s)).toEqual({ note: { kind: 'unchanged', readAt }, changed: true, canRepeat: true });
  });

  it('asks for the read while it is open, and never once the case has ended', () => {
    const s = run(bb, 2, ['primary', 'pads', 'ecg12'], undefined, 'manual');
    expect(s.pendingRead?.kind).toBe('ecg');
    expect(twelveLeadNote(s).note).toEqual({ kind: 'ask' });
    expect(twelveLeadNote({ ...s, ended: { reason: 'stopped', minute: s.minute } }).note).toEqual({ kind: 'unread' });
    // an EMT transmits it instead
    expect(twelveLeadNote(run(bb, 1, ['primary', 'ecg12'])).note).toEqual({ kind: 'emt' });
  });
});
