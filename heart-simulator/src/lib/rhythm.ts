/** Put a rhythm on the shared ECG engine (the simulation driver applies it on the next frame) */
import { resolveProfile } from '@/lib/ecg/profiles';
import { useECGStore } from '@/store/useECGStore';
import { useTimelineStore } from '@/store/useTimelineStore';

export function setRhythm(profileId: string, hr?: number) {
  const p = resolveProfile(profileId);
  useECGStore.getState().setActiveProfile(p.id);
  useTimelineStore.getState().setHeartRate(hr && p.rateControl !== 'none' ? hr : p.defaultHR);
}
