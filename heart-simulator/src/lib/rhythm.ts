/** Put a rhythm on the shared ECG engine (the simulation driver applies it on the next frame) */
import { resolveProfile } from '@/lib/ecg/profiles';
import { useECGStore } from '@/store/useECGStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { sim } from '@/lib/sim/simulation';

/** A change on the patient who is on the monitor (a drug taking effect, a shock, the instructor): it sweeps in */
export function setRhythm(profileId: string, hr?: number) {
  const p = resolveProfile(profileId);
  useECGStore.getState().setActiveProfile(p.id);
  useTimelineStore.getState().setHeartRate(hr && p.rateControl !== 'none' ? hr : p.defaultHR);
}

// ─── A new patient ─────────────────────────────────────────────────────────

const leftovers: (() => void)[] = [];
let patients = 0;

/**
 * Whatever keeps something that belongs to the patient on the monitor — drugs still acting, the defibrillator's
 * delayed responses and code record, a scenario's failing ventricle, swapped ECG cables — says here how to drop it.
 * Registered once, when that part of the app loads.
 */
export function onNewPatient(drop: () => void) {
  leftovers.push(drop);
}

/**
 * The patient on the monitor is replaced by another: nothing done to the last one may act on this one.
 * `showRhythm` calls it; call it directly only when a new patient arrives without a rhythm being shown.
 */
export function newPatient() {
  patients++;
  for (const drop of leftovers) drop();
}

/**
 * How many patients have been shown so far. Whatever borrows the monitor for a patient of its own (a quiz strip) can
 * tell from it whether someone else has put a patient up since — even one with the same rhythm.
 */
export function patientCount(): number {
  return patients;
}

/**
 * Show a rhythm for study (a condition, a case, a quiz strip, a lesson step, a defibrillator scenario, a simulator
 * case): a new patient, who starts clean, and every tracing shows the rhythm at once, even while paused, instead of
 * the new rhythm sweeping in after the old one.
 * Live changes on the same patient (the simulator, the defibrillator, a drug) use `setRhythm`: the switch shows, and
 * what is acting on the patient keeps acting.
 */
export function showRhythm(profileId: string, hr?: number) {
  newPatient();
  setRhythm(profileId, hr);
  // the simulation driver's next frame rewrites the recent past (syncRhythm)
  sim.rewrite = true;
}
