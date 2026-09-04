import { create } from 'zustand';
import { CARDIAC_PHASES, phaseAtProgress, type CardiacPhase, type PhaseConfig } from '@/lib/physiology/cycleTiming';
import { getBeatAt } from '@/lib/ecg/waveformEngine';
import { useECGStore } from './useECGStore';

export type { CardiacPhase, PhaseConfig };

interface TimelineState {
  playing: boolean;
  /** Simulation time in ms (already multiplied by the speed factor). */
  time: number;
  heartRate: number;
  speed: number;
  frozen: boolean;
  currentPhase: CardiacPhase;
  /**
   * Progress through the current beat's electrical/mechanical events
   * (0 = beat start, 1 = end of the reference beat; may sit above 1 during
   * long diastasis). Ventricular timeline — used by the ECG playhead label,
   * the contraction shader and the hemodynamics engine.
   */
  cycleProgress: number;
  /** Atrial timeline (differs from cycleProgress in complete heart block / AF). */
  atrialProgress: number;
  /** Fraction of the actual RR interval elapsed (0..1). */
  rrProgress: number;
  /** Whether the current beat conducts to the ventricles / has organised atrial activity. */
  beatHasQRS: boolean;
  beatHasP: boolean;
  beatWide: boolean;
  fibrillating: boolean;
  beatIndex: number;
  conductionProgress: number;
  phases: PhaseConfig[];

  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setTime: (time: number) => void;
  setHeartRate: (hr: number) => void;
  setSpeed: (speed: number) => void;
  freeze: () => void;
  unfreeze: () => void;
  tick: (deltaMs: number) => void;
  /** Recompute derived beat state for the current time (after profile/HR changes). */
  refresh: () => void;
}

function deriveBeatState(time: number, heartRate: number) {
  const profileId = useECGStore.getState().activeProfileId;
  const beat = getBeatAt(time, profileId, heartRate);
  const cycleProgress = beat.progress;
  const currentPhase: CardiacPhase = beat.fibrillating
    ? 'diastasis'
    : beat.hasQRS
      ? phaseAtProgress(cycleProgress)
      : (beat.hasP && cycleProgress >= 0.14 && cycleProgress < 0.28 ? 'atrial-systole' : 'diastasis');
  const conductionProgress = cycleProgress < 0.4 ? cycleProgress / 0.4 : 0;
  return {
    cycleProgress,
    atrialProgress: beat.atrialProgress,
    rrProgress: beat.rrProgress,
    beatHasQRS: beat.hasQRS,
    beatHasP: beat.hasP,
    beatWide: beat.wideQRS,
    fibrillating: beat.fibrillating,
    beatIndex: beat.index,
    conductionProgress,
    currentPhase,
  };
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  playing: true,
  time: 0,
  heartRate: 72,
  speed: 1,
  frozen: false,
  currentPhase: 'diastasis',
  cycleProgress: 0,
  atrialProgress: 0,
  rrProgress: 0,
  beatHasQRS: true,
  beatHasP: true,
  beatWide: false,
  fibrillating: false,
  beatIndex: 0,
  conductionProgress: 0,
  phases: CARDIAC_PHASES,

  play: () => set({ playing: true }),
  pause: () => set({ playing: false }),
  togglePlay: () => set((s) => ({ playing: !s.playing })),
  setTime: (time) => set({ time, ...deriveBeatState(time, get().heartRate) }),
  setHeartRate: (hr) => {
    const heartRate = Math.max(20, Math.min(300, hr));
    const s = get();
    // Rescale time so the beat index and the position within the beat are
    // preserved — otherwise the heart would visibly jump when the rate changes.
    const oldRR = (60 / s.heartRate) * 1000;
    const newRR = (60 / heartRate) * 1000;
    const time = (s.time / oldRR) * newRR;
    set({ heartRate, time, ...deriveBeatState(time, heartRate) });
  },
  setSpeed: (speed) => set({ speed: Math.max(0.1, Math.min(5, speed)) }),
  freeze: () => set({ frozen: true, playing: false }),
  unfreeze: () => set({ frozen: false }),
  tick: (deltaMs) => {
    const state = get();
    if (!state.playing || state.frozen) return;
    // Clamp huge deltas (tab was in the background) so the model doesn't leap ahead.
    const clamped = Math.min(deltaMs, 100);
    const newTime = state.time + clamped * state.speed;
    set({ time: newTime, ...deriveBeatState(newTime, state.heartRate) });
  },
  refresh: () => {
    const s = get();
    set(deriveBeatState(s.time, s.heartRate));
  },
}));
