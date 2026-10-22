import { describe, expect, it } from 'vitest';
import { ECGEngine } from '@/lib/ecg/engine';
import { sim, syncRhythm } from '@/lib/sim/simulation';
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
