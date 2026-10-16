import { create } from 'zustand';
import type { CyclePhase } from '@/lib/ecg/engine';

export type { CyclePhase };
/** @deprecated kept for older imports */
export type CardiacPhase = CyclePhase;

interface TimelineState {
  playing: boolean;
  /** Target rate set by the user (meaning depends on the rhythm — see profile.rateControl) */
  heartRate: number;
  speed: number;
  /** Low-frequency mirrors of the simulation, published by SimulationDriver */
  currentPhase: CyclePhase;
  displayHR: number;
  atrialRate: number | null;

  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setHeartRate: (hr: number) => void;
  setSpeed: (speed: number) => void;
  publish: (p: { currentPhase: CyclePhase; displayHR: number; atrialRate: number | null }) => void;
}

export const useTimelineStore = create<TimelineState>((set) => ({
  playing: true,
  heartRate: 72,
  speed: 1,
  currentPhase: 'diastasis',
  displayHR: 72,
  atrialRate: 72,

  play: () => set({ playing: true }),
  pause: () => set({ playing: false }),
  togglePlay: () => set((s) => ({ playing: !s.playing })),
  setHeartRate: (heartRate) => set({ heartRate: Math.max(0, Math.min(300, Math.round(heartRate))) }),
  setSpeed: (speed) => set({ speed: Math.max(0.1, Math.min(2, speed)) }),
  publish: (p) => set(p),
}));
