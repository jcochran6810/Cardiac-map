import { describe, expect, it } from 'vitest';
import { ECGEngine } from '@/lib/ecg/engine';
import { REWRITE_MS, scrubTo, sim, syncRhythm } from '@/lib/sim/simulation';
import { setRhythm, showRhythm } from '@/lib/rhythm';
import { openCondition } from '@/lib/actions';
import { useECGStore } from '@/store/useECGStore';
import { useTimelineStore } from '@/store/useTimelineStore';

/** what the simulation driver does every frame (no drug effects in these tests) */
const frame = () => syncRhythm(useECGStore.getState().activeProfileId, useTimelineStore.getState().heartRate, null);

describe('a rhythm shown for study fills the whole tracing at once', () => {
  it('the engine can rewrite the recent past with the new rhythm', () => {
    const e = new ECGEngine('normal-sinus', 72);
    e.ensure(30_000);
    e.setRhythm('vt', 160, 20_000, null, 5_000);
    e.ensure(30_000);
    expect(e.segmentAt(6_000).profile.id).toBe('vt');
    expect(e.segmentAt(19_000).profile.id).toBe('vt');
    expect(e.segmentAt(4_000).profile.id).toBe('normal-sinus');
    expect(e.vent.filter((v) => v.t > 5_000 && v.t < 20_000).length).toBeGreaterThan(30); // ~160/min
  });

  it('a live change still sweeps in after what is on screen', () => {
    const e = new ECGEngine('normal-sinus', 72);
    e.ensure(30_000);
    e.setRhythm('vt', 160, 20_000);
    expect(e.segmentAt(19_000).profile.id).toBe('normal-sinus');
    expect(e.segmentAt(21_000).profile.id).toBe('vt');
  });

  it('showRhythm: the last 30 s show the new rhythm, the tracings redraw, and the driver carries on with it', () => {
    sim.time = 60_000;
    sim.engine.ensure(sim.time + 4000);
    const epoch = sim.epoch;
    showRhythm('atrial-fibrillation');
    frame();
    expect(sim.epoch).toBe(epoch + 1);
    for (const ago of [0, 5_000, 12_000, 25_000]) expect(sim.engine.segmentAt(sim.time - ago).profile.id).toBe('atrial-fibrillation');
    const segments = sim.engine.segments.length;
    const beats = sim.engine.vent.map((v) => v.t);
    frame();
    expect(sim.engine.segments.length).toBe(segments);
    expect(sim.engine.vent.map((v) => v.t)).toEqual(beats);
  });

  it('works while the heartbeat is paused (time does not move)', () => {
    sim.time = 90_000;
    showRhythm('normal-sinus');
    frame();
    frame();
    useTimelineStore.getState().pause();
    showRhythm('third-degree-avb');
    frame();
    expect(sim.engine.segmentAt(sim.time - 8_000).profile.id).toBe('third-degree-avb');
  });

  it('drug effects in force carry into the rewritten past', () => {
    sim.time = 100_000;
    showRhythm('third-degree-avb');
    syncRhythm(useECGStore.getState().activeProfileId, useTimelineStore.getState().heartRate, { qtcAdd: 40 });
    const seg = sim.engine.segmentAt(sim.time - 8_000);
    expect(seg.profile.id).toBe('third-degree-avb');
    expect(seg.mods).not.toBe(sim.engine.segmentAt(0).mods);
  });

  it('opening a condition shows its rhythm on everything already on screen', () => {
    sim.time = 120_000;
    setRhythm('normal-sinus');
    frame();
    sim.engine.ensure(sim.time + 4000);
    openCondition('ventricular-fibrillation');
    frame();
    expect(useECGStore.getState().activeProfileId).toBe('vf');
    expect(sim.engine.segmentAt(sim.time - 10_000).profile.id).toBe('vf');
  });
});

describe('dragging back through the recording', () => {
  /** the simulation driver running for a while: the selected rhythm applied every frame, beats scheduled 4 s ahead */
  const run = (ms: number) => {
    for (let t = 0; t < ms; t += 16) {
      frame();
      sim.time += 16;
      sim.engine.ensure(sim.time + 4000);
    }
  };
  const beats = (from: number, to: number) => sim.engine.vent.filter((v) => v.t >= from && v.t < to).map((v) => v.t);

  it('a recorded change of rhythm stays as it was recorded: looking back at it does not rewrite it', () => {
    sim.time = 200_000;
    showRhythm('vf');
    run(20_000);
    const change = sim.time;
    setRhythm('sinus-tachycardia', 108); // e.g. a shock that worked
    run(8_000);
    const end = sim.time;
    const recorded = beats(change, end);
    expect(recorded.length).toBeGreaterThan(10);
    const segments = sim.engine.segments.length;

    useTimelineStore.getState().pause();
    scrubTo(change - 5_000);
    frame();
    expect(sim.engine.segmentAt(sim.time).profile.id).toBe('vf');
    expect(beats(change - 5_000, change)).toEqual([]);
    expect(sim.engine.segmentAt(change + 3_000).profile.id).toBe('sinus-tachycardia');
    expect(beats(change, end)).toEqual(recorded);
    // further back, a step at a time (the arrow keys)
    for (let k = 0; k < 20; k++) {
      scrubTo(sim.time - 100);
      frame();
    }
    expect(sim.engine.segments.length).toBe(segments);
    expect(beats(change, end)).toEqual(recorded);
    expect(sim.engine.heartRate(change + 5_000)).toBeGreaterThan(100);

    // playing on from there replays the recording, then the rhythm carries on
    run(end - sim.time + 6_000);
    expect(sim.engine.segments.length).toBe(segments);
    expect(beats(change, end)).toEqual(recorded);
    expect(beats(end, sim.time).length).toBeGreaterThan(8);
  });

  it('a change made while looking back takes effect there', () => {
    const end = sim.time;
    scrubTo(end - 6_000);
    frame();
    const kept = beats(0, sim.time);
    setRhythm('sinus-tachycardia', 140);
    frame();
    sim.engine.ensure(sim.time + 4000);
    expect(sim.engine.segmentAt(sim.time + 1).hr).toBe(140);
    expect(beats(0, sim.time)).toEqual(kept);
    const rr = beats(sim.time + 1500, sim.time + 4000);
    expect(rr[1] - rr[0]).toBeCloseTo(60000 / 140, -1);
  });

  it('stops where the recording still fills the screen once old beats have been discarded', () => {
    showRhythm('avnrt', 200);
    frame();
    for (let k = 0; k < 20 * 60; k++) {
      sim.time += 1000;
      frame();
      sim.engine.ensure(sim.time + 4000);
    }
    const kept = sim.engine.keptFrom;
    expect(kept).toBeGreaterThan(0);
    scrubTo(sim.time - 15 * 60_000);
    frame();
    expect(sim.time).toBe(kept + REWRITE_MS);
    // a full screen of real beats behind the playhead and ahead of it — not an empty strip
    expect(beats(sim.time - REWRITE_MS + 400, sim.time).length).toBeGreaterThan(90);
    expect(beats(sim.time, sim.time + 3_000).length).toBeGreaterThan(8);
    expect(sim.engine.heartRate(sim.time)).toBe(200);
    // going forward again is not held back
    scrubTo(sim.time + 60_000);
    expect(sim.time).toBe(kept + REWRITE_MS + 60_000);
  });
});
