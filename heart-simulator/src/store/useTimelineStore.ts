import { create } from 'zustand';

export type CardiacPhase =
  | 'atrial-systole'
  | 'isovolumetric-contraction'
  | 'rapid-ejection'
  | 'reduced-ejection'
  | 'isovolumetric-relaxation'
  | 'rapid-filling'
  | 'diastasis'
  | 'atrial-relaxation';

interface PhaseConfig {
  name: CardiacPhase;
  label: string;
  startFraction: number;
  endFraction: number;
  color: string;
}

interface TimelineState {
  playing: boolean;
  time: number;
  heartRate: number;
  speed: number;
  frozen: boolean;
  currentPhase: CardiacPhase;
  cycleProgress: number;
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
}

const DEFAULT_PHASES: PhaseConfig[] = [
  { name: 'atrial-systole', label: 'Atrial Systole', startFraction: 0, endFraction: 0.11, color: '#3B82F6' },
  { name: 'isovolumetric-contraction', label: 'Isovolumetric Contraction', startFraction: 0.11, endFraction: 0.16, color: '#EF4444' },
  { name: 'rapid-ejection', label: 'Rapid Ejection', startFraction: 0.16, endFraction: 0.30, color: '#DC2626' },
  { name: 'reduced-ejection', label: 'Reduced Ejection', startFraction: 0.30, endFraction: 0.40, color: '#B91C1C' },
  { name: 'isovolumetric-relaxation', label: 'Isovolumetric Relaxation', startFraction: 0.40, endFraction: 0.47, color: '#7C3AED' },
  { name: 'rapid-filling', label: 'Rapid Filling', startFraction: 0.47, endFraction: 0.60, color: '#2563EB' },
  { name: 'diastasis', label: 'Diastasis', startFraction: 0.60, endFraction: 0.89, color: '#1D4ED8' },
  { name: 'atrial-relaxation', label: 'Atrial Relaxation', startFraction: 0.89, endFraction: 1.0, color: '#1E40AF' },
];

function getPhaseAtProgress(progress: number, phases: PhaseConfig[]): CardiacPhase {
  for (const phase of phases) {
    if (progress >= phase.startFraction && progress < phase.endFraction) {
      return phase.name;
    }
  }
  return 'diastasis';
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  playing: true,
  time: 0,
  heartRate: 72,
  speed: 1,
  frozen: false,
  currentPhase: 'diastasis',
  cycleProgress: 0,
  conductionProgress: 0,
  phases: DEFAULT_PHASES,

  play: () => set({ playing: true }),
  pause: () => set({ playing: false }),
  togglePlay: () => set((s) => ({ playing: !s.playing })),
  setTime: (time) => set({ time }),
  setHeartRate: (heartRate) => set({ heartRate: Math.max(20, Math.min(300, heartRate)) }),
  setSpeed: (speed) => set({ speed: Math.max(0.1, Math.min(5, speed)) }),
  freeze: () => set({ frozen: true, playing: false }),
  unfreeze: () => set({ frozen: false }),
  tick: (deltaMs) => {
    const state = get();
    if (!state.playing || state.frozen) return;

    const cycleDurationMs = (60 / state.heartRate) * 1000;
    const adjustedDelta = deltaMs * state.speed;
    const newTime = state.time + adjustedDelta;
    const cycleProgress = (newTime % cycleDurationMs) / cycleDurationMs;
    const conductionProgress = cycleProgress < 0.4 ? cycleProgress / 0.4 : 0;
    const currentPhase = getPhaseAtProgress(cycleProgress, state.phases);

    set({ time: newTime, cycleProgress, conductionProgress, currentPhase });
  },
}));
