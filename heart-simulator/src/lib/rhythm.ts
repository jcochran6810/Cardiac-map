/** Put a rhythm on the shared ECG engine (the simulation driver applies it on the next frame) */
import { resolveProfile } from '@/lib/ecg/profiles';
import { useECGStore } from '@/store/useECGStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { sim } from '@/lib/sim/simulation';

/** How much of the recent past `showRhythm` rewrites: more than any tracing keeps on screen */
const HISTORY_MS = 30000;

export function setRhythm(profileId: string, hr?: number) {
  const p = resolveProfile(profileId);
  useECGStore.getState().setActiveProfile(p.id);
  useTimelineStore.getState().setHeartRate(hr && p.rateControl !== 'none' ? hr : p.defaultHR);
}

/**
 * Show a rhythm for study (a condition, a case, a quiz strip): every tracing shows it at once,
 * even while paused, instead of the new rhythm sweeping in after the old one.
 * Live changes on a patient (the simulator, the defibrillator) use `setRhythm`, so the switch shows.
 */
export function showRhythm(profileId: string, hr?: number) {
  setRhythm(profileId, hr);
  const id = useECGStore.getState().activeProfileId;
  const rate = useTimelineStore.getState().heartRate;
  // the same rhythm and rate the driver passes every frame, so it carries on from here
  sim.engine.setRhythm(id, rate, sim.time, sim.time - HISTORY_MS);
  sim.engine.ensure(sim.time + 4000);
  sim.epoch++;
}
