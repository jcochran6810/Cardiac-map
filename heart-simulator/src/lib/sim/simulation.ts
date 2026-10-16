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

const engine = new ECGEngine('normal-sinus', 72);

export const sim = {
  engine,
  hemo: new HemoModel(engine),
  /** simulation time in ms */
  time: 0,
  /** bumps whenever time jumps non-continuously (scrub) so renderers can fully redraw */
  epoch: 0,
};

export function scrubTo(ms: number) {
  sim.time = Math.max(0, ms);
  sim.engine.ensure(sim.time + 4000);
  sim.epoch++;
}
