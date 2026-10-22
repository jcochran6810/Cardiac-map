/**
 * Shared simulation clock + engine.
 *
 * Time lives in a plain mutable object (not React state) so the ECG canvas, the
 * 3D scene and the hemodynamic charts can all read it every animation frame
 * without forcing React re-renders. A single driver (SimulationDriver) advances
 * the clock and publishes low-frequency summaries (phase, displayed HR) to the
 * timeline store for ordinary UI components.
 */
import { ECGEngine } from '@/lib/ecg/engine';
import { HemoModel } from '@/lib/physiology/hemodynamics';
import type { RhythmMods } from '@/lib/ecg/mods';

const engine = new ECGEngine('normal-sinus', 72);

export const sim = {
  engine,
  hemo: new HemoModel(engine),
  /** simulation time in ms */
  time: 0,
  /** bumps whenever time jumps non-continuously (scrub) so renderers can fully redraw */
  epoch: 0,
  /** set by showRhythm: the next sync rewrites the recent past in the new rhythm */
  rewrite: false,
};

/** How much of the recent past a rewrite covers: more than any tracing keeps on screen */
export const REWRITE_MS = 30000;

/**
 * Keep the engine on the selected rhythm, rate and drug effects — called every frame by the simulation driver.
 * After showRhythm, the recent past is rewritten too (with the same drug effects) and every tracing redraws.
 */
export function syncRhythm(profileId: string, hr: number, mods: RhythmMods | null = null) {
  if (!sim.rewrite) {
    sim.engine.setRhythm(profileId, hr, sim.time, mods);
    return;
  }
  sim.rewrite = false;
  sim.engine.setRhythm(profileId, hr, sim.time, mods, sim.time - REWRITE_MS);
  sim.engine.ensure(sim.time + 4000);
  sim.epoch++;
}

export function scrubTo(ms: number) {
  sim.time = Math.max(0, ms);
  sim.engine.ensure(sim.time + 4000);
  sim.epoch++;
}
