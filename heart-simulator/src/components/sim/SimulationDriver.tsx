'use client';

import { useEffect } from 'react';
import { sim } from '@/lib/sim/simulation';
import { useTimelineStore } from '@/store/useTimelineStore';
import { useECGStore } from '@/store/useECGStore';
import { tickDefib } from '@/lib/sim/defib';
import { tickMeds, useMedStore } from '@/store/useMedStore';
import { useAppStore } from '@/store/useAppStore';

/**
 * Single animation loop that advances simulation time, keeps the rhythm engine
 * in sync with the selected ECG profile / heart rate (and any drug effects),
 * fires the defibrillator's and the medication session's scheduled responses,
 * and publishes a few low-frequency values (phase, displayed HR) for regular React UI.
 */
export default function SimulationDriver() {
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastPublish = 0;

    const loop = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      const tl = useTimelineStore.getState();
      const ecg = useECGStore.getState();

      // drug effects given in the Learn view (useMedStore) apply only there
      const mods = useAppStore.getState().mode === 'learn' ? useMedStore.getState().mods : null;
      sim.engine.setRhythm(ecg.activeProfileId, tl.heartRate, sim.time, mods);
      if (tl.playing) sim.time += dt * tl.speed;
      sim.engine.ensure(sim.time + 4000);
      tickDefib(sim.time);
      tickMeds(sim.time);

      if (now - lastPublish > 120) {
        lastPublish = now;
        const mech = sim.engine.mechanics(sim.time);
        const displayHR = sim.engine.heartRate(sim.time);
        const atrialRate = sim.engine.atrialRate(sim.time);
        if (mech.phase !== tl.currentPhase || displayHR !== tl.displayHR || atrialRate !== tl.atrialRate) {
          tl.publish({ currentPhase: mech.phase, displayHR, atrialRate });
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return null;
}
