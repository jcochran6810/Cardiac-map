'use client';

import { heartAudio } from '@/lib/audio/heartAudio';
import { useSoundStore } from '@/store/useSoundStore';

/** Switch the heart sounds on or off. Call it from the tap itself: browsers only start audio on a user gesture */
export function toggleHeartSounds() {
  const st = useSoundStore.getState();
  if (st.heartSounds) {
    st.setHeartSounds(false);
    return;
  }
  if (heartAudio.enable()) st.setHeartSounds(true);
  else st.setUnavailable();
}
