/**
 * Shared cardiac cycle timing.
 *
 * Every driver in the app (ECG waveform synthesis, the 3D contraction shader,
 * the conduction arrows, the hemodynamics engine and the timeline phase label)
 * reads its timing from this single table so that the playhead on the ECG,
 * the glow on the heart and the pressure curves all agree with each other.
 *
 * All values are fractions of a *reference beat* of REF_BEAT_MS milliseconds.
 * A beat's electrical/mechanical events are laid out in real milliseconds
 * (scaled mildly with rate, see `beatScaleForRR`), so at slow rates the
 * remaining time is diastasis and at fast rates repolarization shortens.
 */

export const REF_BEAT_MS = 800;

/** ECG feature windows within one reference beat (fractions of REF_BEAT_MS). */
export const ECG_TIMING = {
  pStart: 0.12,
  pCenter: 0.16,
  pEnd: 0.20,
  prSegEnd: 0.27,
  qrsStart: 0.27,
  qCenter: 0.28,
  rCenter: 0.32,
  sCenter: 0.36,
  qrsEnd: 0.38,
  stEnd: 0.49,
  tStart: 0.49,
  tCenter: 0.55,
  tEnd: 0.61,
} as const;

export type ECGFeature = 'P wave' | 'PR seg' | 'QRS' | 'ST seg' | 'T wave' | 'Baseline';

/** Which ECG feature is under the playhead at a given beat progress. */
export function ecgFeatureAt(progress: number): ECGFeature {
  const p = progress;
  if (p >= ECG_TIMING.pStart && p < ECG_TIMING.pEnd) return 'P wave';
  if (p >= ECG_TIMING.pEnd && p < ECG_TIMING.prSegEnd) return 'PR seg';
  if (p >= ECG_TIMING.qrsStart && p < ECG_TIMING.qrsEnd) return 'QRS';
  if (p >= ECG_TIMING.qrsEnd && p < ECG_TIMING.stEnd) return 'ST seg';
  if (p >= ECG_TIMING.tStart && p < ECG_TIMING.tEnd) return 'T wave';
  return 'Baseline';
}

export type CardiacPhase =
  | 'atrial-systole'
  | 'atrial-relaxation'
  | 'isovolumetric-contraction'
  | 'rapid-ejection'
  | 'reduced-ejection'
  | 'isovolumetric-relaxation'
  | 'rapid-filling'
  | 'diastasis';

export interface PhaseConfig {
  name: CardiacPhase;
  label: string;
  startFraction: number;
  endFraction: number;
  color: string;
}

/**
 * Mechanical phases of one reference beat. Mechanical events lag the
 * electrical ones by a few tens of milliseconds (electromechanical delay):
 * the atria contract just after the P wave starts, the ventricles just
 * after the QRS, and ejection continues through the T wave.
 */
export const CARDIAC_PHASES: PhaseConfig[] = [
  { name: 'diastasis', label: 'Diastasis', startFraction: 0.0, endFraction: 0.14, color: '#1D4ED8' },
  { name: 'atrial-systole', label: 'Atrial Systole', startFraction: 0.14, endFraction: 0.28, color: '#3B82F6' },
  { name: 'atrial-relaxation', label: 'Atrial Relaxation', startFraction: 0.28, endFraction: 0.30, color: '#1E40AF' },
  { name: 'isovolumetric-contraction', label: 'Isovolumetric Contraction', startFraction: 0.30, endFraction: 0.36, color: '#EF4444' },
  { name: 'rapid-ejection', label: 'Rapid Ejection', startFraction: 0.36, endFraction: 0.50, color: '#DC2626' },
  { name: 'reduced-ejection', label: 'Reduced Ejection', startFraction: 0.50, endFraction: 0.60, color: '#B91C1C' },
  { name: 'isovolumetric-relaxation', label: 'Isovolumetric Relaxation', startFraction: 0.60, endFraction: 0.66, color: '#7C3AED' },
  { name: 'rapid-filling', label: 'Rapid Filling', startFraction: 0.66, endFraction: 0.80, color: '#2563EB' },
  { name: 'diastasis', label: 'Diastasis', startFraction: 0.80, endFraction: 1.01, color: '#1D4ED8' },
];

/** Boundaries used by the hemodynamics engine (kept in one place). */
export const MECH = {
  atrialStart: 0.14,
  atrialEnd: 0.28,
  ivcStart: 0.30,
  ejectStart: 0.36,
  reducedStart: 0.50,
  ivrStart: 0.60,
  fillStart: 0.66,
  diastasisStart: 0.80,
} as const;

export function phaseAtProgress(progress: number, phases: PhaseConfig[] = CARDIAC_PHASES): CardiacPhase {
  if (progress >= 1) return 'diastasis';
  for (const phase of phases) {
    if (progress >= phase.startFraction && progress < phase.endFraction) return phase.name;
  }
  return 'diastasis';
}

/**
 * Rate-dependent time scaling of a beat's events. Repolarization (and to a
 * lesser degree the other intervals) shortens as the rate rises, roughly
 * following Bazett's square-root relationship. The result multiplies every
 * feature offset/width expressed as a fraction of REF_BEAT_MS.
 */
export function beatScaleForRR(rrMs: number): number {
  const ratio = rrMs / REF_BEAT_MS;
  return Math.sqrt(Math.max(0.42, Math.min(1.35, ratio)));
}
