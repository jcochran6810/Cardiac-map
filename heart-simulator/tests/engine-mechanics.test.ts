/**
 * The case simulator engine's mechanics: when a 12-lead's read is asked, what happens after a read, the EMT's AED pads,
 * the first-shock timings, the quicker actions during CPR, and a case's charge for a preventable deterioration.
 */
import { describe, expect, it } from 'vitest';
import { answerRead, perform, review, start } from '@/lib/sim/scenario/engine';
import type { Scenario, SimState } from '@/lib/sim/scenario/types';
import { fixture } from './ruleFixture';
import { runScenario as run } from './helpers';

const STEMI = { profile: 'anterior-stemi', hr: 96 };

describe('a 12-lead is read on the tracing it printed', () => {
  /** An anterior STEMI that goes into VF a minute into the first action */
  const VF_EVENTS: Scenario['events'] = [{
    id: 'vf', when: (s) => s.minute >= 1 && s.pulse,
    effect: () => ({ say: [['monitor', 'VF!', 'bad']], rhythm: { profile: 'vf', hr: 0 }, pulse: false, flags: ['vf'] }),
  }];
  const vfDuring = (setting: Scenario['setting'], role: 1 | 2 | 7): Scenario => fixture({ setting, role, rhythm: STEMI, extra: { events: VF_EVENTS } });

  it('an arrest during the recording: the STEMI it printed still counts, and its read waits on that tracing', () => {
    const sc = vfDuring('ed', 7);
    const s = perform(sc, start(sc, 7), 'ecg12');
    expect(s.pulse).toBe(false);
    expect(s.flags['ecg-stemi']).toBeDefined();
    expect(s.lastEcg).toMatchObject({ profile: 'anterior-stemi', hr: 96 });
    expect(s.pendingRead).toMatchObject({ kind: 'ecg', answer: 'stemi-anterior' });
    // the activation later rests on it: no "does not meet STEMI criteria"
    const after = answerRead(sc, s, 'stemi-anterior');
    expect(after.reads.at(-1)).toMatchObject({ verdict: 'correct' });
    expect(after.flags['ecg-stemi']).toBeDefined();
  });

  it('the EMT records it in the arrest too: the flag is set, no read is asked', () => {
    const sc = vfDuring('field', 1);
    const s = perform(sc, start(sc, 1), 'ecg12');
    expect(s.pulse).toBe(false);
    expect(s.flags['ecg-stemi']).toBeDefined();
    expect(s.pendingRead).toBeNull();
  });

  it('a change with the pulse kept is on the tracing: the read is of the rhythm after it', () => {
    const sc = fixture({
      setting: 'ed', role: 7, rhythm: { profile: 'normal-sinus', hr: 80 },
      extra: { events: [{ id: 'stemi', when: (s) => s.minute >= 1, effect: () => ({ rhythm: STEMI }) }] },
    });
    const s = perform(sc, start(sc, 7), 'ecg12');
    expect(s.pendingRead).toMatchObject({ answer: 'stemi-anterior' });
  });

  it('no 12-lead is recorded in an arrest that was already there', () => {
    const sc = fixture({ setting: 'ed', role: 7, rhythm: { profile: 'vf', hr: 0 }, pulse: false });
    const s = perform(sc, start(sc, 7), 'ecg12');
    expect(s.minute).toBe(0);
    expect(s.lastEcg).toBeNull();
  });
});

describe('what waits on a read happens as it is given', () => {
  const sc = fixture({
    setting: 'ed', role: 7, rhythm: STEMI,
    extra: {
      events: [{ id: 'after-read', when: (s) => s.reads.length > 0, effect: () => ({ say: [['nurse', 'Read noted — the cath lab is on the phone.']], flags: ['read-noted'] }) }],
    },
  });

  it('the event fires with the read, and no case time passes', () => {
    const recorded = perform(sc, start(sc, 7), 'ecg12');
    expect(recorded.pendingRead).not.toBeNull();
    expect(recorded.fired).not.toContain('after-read');
    const s = answerRead(sc, recorded, 'stemi-anterior');
    expect(s.fired).toContain('after-read');
    expect(s.flags['read-noted']).toBe(recorded.minute);
    expect(s.minute).toBe(recorded.minute);
    expect(s.log.at(-1)).toMatchObject({ who: 'nurse', text: 'Read noted — the cath lab is on the phone.' });
  });
});

describe('the EMT\'s AED pads are no monitor', () => {
  it('pads and the AED put pads on the EMT\'s patient, and a monitor only for a manual defibrillator', () => {
    const awake = fixture({ setting: 'field', role: 1, rhythm: { profile: 'normal-sinus', hr: 80 } });
    expect(run(awake, 1, ['pads']).flags.pads).toBeDefined();
    expect(run(awake, 1, ['pads']).flags.monitor).toBeUndefined();
    const vf = fixture({ setting: 'field', role: 1, rhythm: { profile: 'vf', hr: 0 }, pulse: false });
    const shocked = run(vf, 1, ['aed']);
    expect(shocked.flags.pads).toBeDefined();
    expect(shocked.flags.shocked).toBeDefined();
    expect(shocked.flags.monitor).toBeUndefined();
    const asystole = fixture({ setting: 'field', role: 1, rhythm: { profile: 'asystole', hr: 0 }, pulse: false });
    expect(run(asystole, 1, ['aed']).flags.monitor).toBeUndefined();
    // the paramedic's pads are a monitor
    const medic = fixture({ setting: 'field', role: 2, rhythm: { profile: 'normal-sinus', hr: 80 } });
    expect(run(medic, 2, ['pads']).flags.monitor).toBeDefined();
  });
});

describe('a first-shock timing counts only a shock that was delivered', () => {
  const timed = (profile: string, setting: Scenario['setting'], role: 1 | 2) => fixture({
    setting, role, rhythm: { profile, hr: 0 }, pulse: false,
    extra: { timings: [{ label: 'First shock', actions: ['aed', 'defib'], target: 2, shocksOnly: true }, { label: 'Pads analyzed', actions: ['aed', 'defib'] }] },
  });

  it('an AED that advised no shock is not the first shock; a delivered one is', () => {
    const sc = timed('asystole', 'field', 1);
    const s = run(sc, 1, ['aed']);
    expect(s.performed.at(-1)).toEqual({ id: 'aed', minute: 0 });
    const r = review(sc, s);
    expect(r.timings.find((t) => t.label === 'First shock')).toMatchObject({ minute: null, met: false });
    expect(r.timings.find((t) => t.label === 'Pads analyzed')).toMatchObject({ minute: 0 });
    const vf = timed('vf', 'field', 1);
    const v = run(vf, 1, ['aed']);
    expect(v.performed.at(-1)).toEqual({ id: 'aed', minute: 0, shocked: true });
    expect(review(vf, v).timings.find((t) => t.label === 'First shock')).toMatchObject({ minute: 0, met: true });
  });

  it('a SYNC that never fires is no shock; the unsynchronized shock that follows is the first', () => {
    const sc = timed('vf', 'field', 2);
    const s = run(sc, 2, ['cardiovert', 'defib']);
    expect(s.performed.map((p) => p.shocked ?? false)).toEqual([false, true]);
    expect(review(sc, s).timings.find((t) => t.label === 'First shock')).toMatchObject({ minute: 0.5 });
  });
});

describe('an action that is quicker during CPR', () => {
  it('the physician\'s ultrasound in an arrest takes the 10-second pulse check, not 3 minutes', () => {
    const arrest = fixture({ setting: 'ed', role: 7, rhythm: { profile: 'pea', hr: 40 }, pulse: false });
    expect(run(arrest, 7, ['pocus']).minute).toBe(0.2);
    const awake = fixture({ setting: 'ed', role: 7, rhythm: { profile: 'normal-sinus', hr: 80 } });
    expect(run(awake, 7, ['pocus']).minute).toBe(3);
  });
});

describe('a case can charge a preventable deterioration once', () => {
  const sc = fixture({
    setting: 'ed', role: 7, rhythm: { profile: 'normal-sinus', hr: 80 },
    extra: {
      events: [
        { id: 'fall', when: (s) => s.minute >= 2, effect: () => ({ vitals: { sbp: 70, dbp: 40 }, penalty: { id: 'let-it-fall', points: 5, severity: 'major', text: 'Left to fall.' } }) },
        { id: 'fall-again', when: (s) => s.minute >= 4, effect: () => ({ penalty: { id: 'let-it-fall', points: 5, severity: 'major', text: 'Left to fall.' } }) },
      ],
    },
  });

  it('at the minute it happens, and never twice for the same id', () => {
    const s: SimState = run(sc, 7, ['reassess', 'reassess', 'reassess']);
    expect(s.fired).toEqual(['fall', 'fall-again']);
    expect(s.penalties).toEqual([{ id: 'let-it-fall', minute: 2, points: 5, severity: 'major', text: 'Left to fall.' }]);
    expect(review(sc, s).toFix.find((t) => t.kind === 'harm')).toMatchObject({ label: 'Left to fall.', points: 5 });
  });
});
