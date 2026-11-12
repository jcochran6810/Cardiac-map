import { create } from 'zustand';

/** Heart sounds through the speaker: on only after the learner asks (browsers need a tap to start audio) */
interface SoundState {
  heartSounds: boolean;
  /** the browser has no usable audio output */
  unavailable: boolean;
  setHeartSounds: (on: boolean) => void;
  setUnavailable: () => void;
}

export const useSoundStore = create<SoundState>((set) => ({
  heartSounds: false,
  unavailable: false,
  setHeartSounds: (heartSounds) => set({ heartSounds }),
  setUnavailable: () => set({ unavailable: true, heartSounds: false }),
}));
