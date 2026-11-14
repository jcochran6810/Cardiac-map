import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sim } from '@/lib/sim/simulation';
import { resetCode } from '@/lib/sim/defib';
import { perform } from '@/lib/sim/scenario/engine';
import { answerFor } from '@/lib/sim/scenario/reads';
import { SCENARIO_BY_ID } from '@/lib/sim/scenario/scenarios';
import type { SimState } from '@/lib/sim/scenario/types';
import { useAppStore } from '@/store/useAppStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { NO_CAPTURE_FLAG, NO_CAPTURE_RATE, caseArtefacts, enterSimulator, leaveSimulator, noCaptureSpans, useSimStore } from '@/store/useSimStore';
import { runScenario as run } from './helpers';

/**
 * A pacer that fires without capturing (follow-ups 61 and 124): the case says so with the flag 'pacer-no-capture', and the
 * case monitor draws the spikes at the set rate over the patient's own rhythm — which is still what the 12-lead is read as.
 */

const R = (n: number) => Array<string>(n).fill('reassess');
const store = () => useSimStore.getState();

/** Act as the learner on the case screen: each step, then every read it brings, answered right */
function act(ids: readonly string[]) {
  for (const id of ids) {
    store().act(id);
    for (let i = 0; i < 4 && store().state!.pendingRead; i++) store().read(store().state!.pendingRead!.answer);
  }
}

/** A spike lands at the start of every period of the open span, and nothing between two spikes */
function expectSpikes() {
  const open = noCaptureSpans().at(-1)!;
  expect(open.end).toBe(Infinity);
  expect(open.period).toBe(60000 / NO_CAPTURE_RATE);
  const at = open.start + 3 * open.period;
  expect(caseArtefacts(at, 'II')).toBeGreaterThan(2);
  expect(Math.abs(caseArtefacts(at + open.period / 2, 'II'))).toBeLessThan(0.05);
  // the recording carries them: the monitor draws what the engine's voltage gives
  expect(sim.engine.external).toBe(caseArtefacts);
}

describe('non-capturing pacer spikes on the case monitor', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useTimelineStore.setState({ playing: true, speed: 1 });
    resetCode();
    useAppStore.getState().setMode('simulator');
    enterSimulator();
  });
  afterEach(() => {
    leaveSimulator();
    store().closeScenario();
    useAppStore.getState().setMode('learn');
  });

  it('the temporary wire that has moved: the box fires on at 70 over her escape until the wire is seated again', () => {
    store().startScenario('heart-block-temp-wire-cathlab', 5);
    expect(noCaptureSpans()).toEqual([]);
    act(['pads', 'pace', 'fentanyl', 'midazolam', 'pulse-check', 'sample', 'consent', 'timeout', 'access-venous', 'temp-wire', 'ecg12-repeat']);
    // pacing from the wire: the paced beats bring their own spikes, nothing is laid over them
    expect(store().state!.rhythm).toEqual({ profile: 'paced-vvi', hr: 70 });
    expect(noCaptureSpans()).toEqual([]);
    act(['reassess']);
    const s = store().state!;
    expect(s.flags[NO_CAPTURE_FLAG]).toBeDefined();
    expectSpikes();
    // the read is the rhythm underneath: her complete heart block
    expect(answerFor(s.rhythm.profile).id).toBe('chb');
    act(['reposition']);
    expect(store().state!.flags[NO_CAPTURE_FLAG]).toBeUndefined();
    const closed = noCaptureSpans().at(-1)!;
    expect(closed.end).toBeLessThan(Infinity);
    expect(caseArtefacts(closed.end + 3 * closed.period, 'II')).toBe(0);
  });

  it('a new case, leaving the simulator and closing the case take the spikes away and give the recording back', () => {
    const before = sim.engine.external;
    store().startScenario('heart-block-temp-wire-cathlab', 5);
    act(['pads', 'pace', 'fentanyl', 'midazolam', 'pulse-check', 'sample', 'consent', 'timeout', 'access-venous', 'temp-wire', 'ecg12-repeat', 'reassess']);
    expectSpikes();
    store().startScenario('heart-block-temp-wire-cathlab', 5);
    expect(noCaptureSpans()).toEqual([]);
    expect(sim.engine.external).toBe(before);
    act(['pads', 'pace', 'fentanyl', 'midazolam', 'pulse-check', 'sample', 'consent', 'timeout', 'access-venous', 'temp-wire', 'ecg12-repeat', 'reassess']);
    leaveSimulator();
    expect(noCaptureSpans()).toEqual([]);
    expect(sim.engine.external).toBe(before);
    // back on the case screen the case's own state draws them again
    enterSimulator();
    expectSpikes();
    store().closeScenario();
    expect(noCaptureSpans()).toEqual([]);
    expect(sim.engine.external).toBe(before);
  });
});

describe('the cases say when a pacer fires without capture', () => {
  it('heart block in the ED: a potassium that has climbed past the threshold, until calcium brings every beat back', () => {
    const sc = SCENARIO_BY_ID['complete-heart-block-ed'];
    const s0 = run(sc, 7, ['primary', 'iv']);
    // the potassium has pushed the threshold out of reach: the pads fire at 70, her own beats go on underneath
    const failing = perform(sc, { ...s0, flags: { ...s0.flags, 'k-rising': s0.minute } }, 'pace');
    expect(failing.flags[NO_CAPTURE_FLAG]).toBeDefined();
    expect(failing.rhythm.profile).toBe('third-degree-avb');
    const caught = perform(sc, failing, 'calcium-chloride');
    expect(caught.flags[NO_CAPTURE_FLAG]).toBeUndefined();
    expect(caught.rhythm).toEqual({ profile: 'tcp', hr: 70 });
    // a pacer that captures sets no such flag
    expect(perform(sc, s0, 'pace').flags[NO_CAPTURE_FLAG]).toBeUndefined();
  });

  it('hyperkalemia in the ED: the wire fires on without capture until calcium, then goes to standby; the pads are switched off', () => {
    const sc = SCENARIO_BY_ID['hyperkalemia-ed'];
    let s: SimState = run(sc, 7, ['primary', 'central-line', 'temp-wire']);
    expect(s.flags['pace-failed']).toBeDefined();
    expect(s.flags[NO_CAPTURE_FLAG]).toBeDefined();
    s = perform(sc, s, 'calcium-chloride');
    expect(s.flags[NO_CAPTURE_FLAG]).toBeUndefined();
    expect(s.log.some((l) => /pacing box goes to standby/.test(l.text))).toBe(true);
    // the pads: tried once, switched off ("Pacer off; pads left on"), so nothing fires on
    expect(run(sc, 7, ['primary', 'pads', 'pace']).flags[NO_CAPTURE_FLAG]).toBeUndefined();
    // left to arrest, a box that fired without capture is switched off: no pacing in a cardiac arrest
    let arrest = run(sc, 7, ['primary', 'central-line', 'temp-wire']);
    for (let i = 0; i < 12 && arrest.pulse; i++) arrest = perform(sc, arrest, 'reassess');
    expect(arrest.pulse).toBe(false);
    expect(arrest.flags[NO_CAPTURE_FLAG]).toBeUndefined();
  });

  it('the temporary wire in the lab: lost when it moves, back when it is pulled back and seated', () => {
    const sc = SCENARIO_BY_ID['heart-block-temp-wire-cathlab'];
    const steps = ['pads', 'pace', 'fentanyl', 'midazolam', 'pulse-check', 'sample', 'consent', 'timeout', 'access-venous', 'temp-wire', 'ecg12-repeat'];
    const moved = run(sc, 5, [...steps, ...R(1)]);
    expect(moved.flags['capture-lost']).toBeDefined();
    expect(moved.flags[NO_CAPTURE_FLAG]).toBeDefined();
    const back = perform(sc, moved, 'reposition');
    expect(back.flags[NO_CAPTURE_FLAG]).toBeUndefined();
    expect(back.rhythm).toEqual({ profile: 'paced-vvi', hr: 70 });
  });
});
