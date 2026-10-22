/** Put a rhythm on the shared ECG engine (the simulation driver applies it on the next frame) */
import { resolveProfile } from '@/lib/ecg/profiles';
import { useECGStore } from '@/store/useECGStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { sim } from '@/lib/sim/simulation';

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
  // the simulation driver's next frame rewrites the recent past (syncRhythm), with any drug effects in force
  sim.rewrite = true;
}
