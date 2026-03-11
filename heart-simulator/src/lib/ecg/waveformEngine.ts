/**
 * ECG Waveform Synthesis Engine
 * Generates beat-to-beat ECG waveforms using parameterized Gaussian component models.
 * Supports variable heart rates, morphology changes, and lead-specific appearances.
 */

export interface WaveformParams {
  pAmplitude: number;
  pDuration: number;
  pOffset: number;
  qAmplitude: number;
  qDuration: number;
  qOffset: number;
  rAmplitude: number;
  rDuration: number;
  rOffset: number;
  sAmplitude: number;
  sDuration: number;
  sOffset: number;
  tAmplitude: number;
  tDuration: number;
  tOffset: number;
  stDeviation: number;
  baselineWander: number;
  noiseLevel: number;
}

// Gaussian pulse function
function gaussian(t: number, amplitude: number, center: number, width: number): number {
  const sigma = width / 6; // width covers ~3 sigma on each side
  return amplitude * Math.exp(-0.5 * Math.pow((t - center) / sigma, 2));
}

// Default normal sinus rhythm parameters for Lead II
const NORMAL_SINUS_LEAD_II: WaveformParams = {
  pAmplitude: 0.15,
  pDuration: 0.08,
  pOffset: 0.16,
  qAmplitude: -0.05,
  qDuration: 0.02,
  qOffset: 0.28,
  rAmplitude: 1.0,
  rDuration: 0.04,
  rOffset: 0.32,
  sAmplitude: -0.15,
  sDuration: 0.03,
  sOffset: 0.36,
  tAmplitude: 0.3,
  tDuration: 0.12,
  tOffset: 0.55,
  stDeviation: 0,
  baselineWander: 0,
  noiseLevel: 0.005,
};

// Lead transformation factors relative to Lead II
const LEAD_TRANSFORMS: Record<string, Partial<WaveformParams>> = {
  'I':   { pAmplitude: 0.1, rAmplitude: 0.7, tAmplitude: 0.25 },
  'II':  {},
  'III': { pAmplitude: 0.05, rAmplitude: 0.5, sAmplitude: -0.1, tAmplitude: 0.15 },
  'aVR': { pAmplitude: -0.1, rAmplitude: -0.5, qAmplitude: -0.3, tAmplitude: -0.2 },
  'aVL': { pAmplitude: 0.05, rAmplitude: 0.4, sAmplitude: -0.2, tAmplitude: 0.1 },
  'aVF': { pAmplitude: 0.1, rAmplitude: 0.6, tAmplitude: 0.2 },
  'V1':  { pAmplitude: 0.1, rAmplitude: 0.3, sAmplitude: -0.8, tAmplitude: -0.15 },
  'V2':  { pAmplitude: 0.1, rAmplitude: 0.5, sAmplitude: -0.6, tAmplitude: 0.4 },
  'V3':  { pAmplitude: 0.08, rAmplitude: 0.7, sAmplitude: -0.4, tAmplitude: 0.35 },
  'V4':  { pAmplitude: 0.08, rAmplitude: 0.9, sAmplitude: -0.2, tAmplitude: 0.3 },
  'V5':  { pAmplitude: 0.08, rAmplitude: 0.85, sAmplitude: -0.1, tAmplitude: 0.25 },
  'V6':  { pAmplitude: 0.07, rAmplitude: 0.7, sAmplitude: -0.05, tAmplitude: 0.2 },
};

export function getLeadParams(baseLead: string, baseParams: WaveformParams = NORMAL_SINUS_LEAD_II): WaveformParams {
  const transforms = LEAD_TRANSFORMS[baseLead] || {};
  return { ...baseParams, ...transforms };
}

/**
 * Generate a single beat waveform sample at time t (0 to 1 normalized within one RR interval)
 */
export function generateBeatSample(t: number, params: WaveformParams): number {
  // P wave
  const p = gaussian(t, params.pAmplitude, params.pOffset, params.pDuration);

  // QRS complex
  const q = gaussian(t, params.qAmplitude, params.qOffset, params.qDuration);
  const r = gaussian(t, params.rAmplitude, params.rOffset, params.rDuration);
  const s = gaussian(t, params.sAmplitude, params.sOffset, params.sDuration);

  // ST segment deviation
  const stStart = params.sOffset + params.sDuration / 2;
  const stEnd = params.tOffset - params.tDuration / 2;
  const stMid = (stStart + stEnd) / 2;
  const stWidth = stEnd - stStart;
  const st = stWidth > 0 ? gaussian(t, params.stDeviation, stMid, stWidth) : 0;

  // T wave
  const tw = gaussian(t, params.tAmplitude, params.tOffset, params.tDuration);

  // Baseline wander (slow sinusoidal)
  const wander = params.baselineWander * Math.sin(2 * Math.PI * t * 0.3);

  // Noise
  const noise = params.noiseLevel * (Math.random() * 2 - 1);

  return p + q + r + s + st + tw + wander + noise;
}

/**
 * Generate a full ECG strip as an array of samples
 */
export function generateECGStrip(
  lead: string,
  heartRate: number,
  durationSeconds: number,
  sampleRate: number = 500,
  conditionModifiers?: Partial<WaveformParams>,
): number[] {
  const params = getLeadParams(lead);
  if (conditionModifiers) {
    Object.assign(params, conditionModifiers);
  }

  const totalSamples = Math.floor(durationSeconds * sampleRate);
  const rrIntervalSamples = Math.floor((60 / heartRate) * sampleRate);
  const samples: number[] = [];

  for (let i = 0; i < totalSamples; i++) {
    const beatPosition = (i % rrIntervalSamples) / rrIntervalSamples;
    samples.push(generateBeatSample(beatPosition, params));
  }

  return samples;
}

/**
 * Condition modifier presets
 * More accurate morphology parameters for each condition.
 */
export const CONDITION_MODIFIERS: Record<string, Partial<WaveformParams>> = {
  // ─── Normal / Sinus variants ──────────────────────────────────
  'normal-sinus': {},
  // Bradycardia: prominent T waves due to longer diastolic filling
  'sinus-bradycardia': { tAmplitude: 0.35, tDuration: 0.14 },
  // Tachycardia: shorter RR, P may merge with preceding T, smaller T
  'sinus-tachycardia': { pAmplitude: 0.18, tAmplitude: 0.22, tDuration: 0.09, tOffset: 0.48 },

  // ─── Atrial arrhythmias ───────────────────────────────────────
  // AFib: no discrete P waves, irregularly irregular, fibrillatory baseline
  'atrial-fibrillation': { pAmplitude: 0, noiseLevel: 0.035, baselineWander: 0.025 },
  'afib': { pAmplitude: 0, noiseLevel: 0.035, baselineWander: 0.025 },
  // Flutter: sawtooth F waves at ~300/min, typically 2:1 or 4:1 conduction
  'atrial-flutter': { pAmplitude: -0.25, pDuration: 0.035, pOffset: 0.14, noiseLevel: 0.008 },
  'aflutter': { pAmplitude: -0.25, pDuration: 0.035, pOffset: 0.14, noiseLevel: 0.008 },
  // AVNRT: retrograde P buried in or just after QRS (pseudo-S in II, pseudo-r' in V1)
  'avnrt': { pAmplitude: -0.06, pOffset: 0.35, pDuration: 0.025, rAmplitude: 0.9, noiseLevel: 0.008 },
  // WPW: short PR, delta wave (slurred QRS upstroke), wide QRS, secondary ST-T changes
  'wpw': { pOffset: 0.18, rOffset: 0.26, rDuration: 0.07, qAmplitude: 0.12, qDuration: 0.05, qOffset: 0.22, stDeviation: -0.06, tAmplitude: -0.15 },

  // ─── AV blocks ────────────────────────────────────────────────
  // 1st degree: prolonged PR interval (>200ms), all P waves conducted
  'first-degree-avb': { pOffset: 0.08, pAmplitude: 0.15 },
  // Mobitz I (Wenckebach): progressive PR prolongation until dropped beat
  'mobitz-i': { pOffset: 0.08, pAmplitude: 0.15 },
  // Mobitz II: fixed PR with sudden dropped QRS, may have wide QRS
  'mobitz-ii': { pOffset: 0.10, pAmplitude: 0.15, rDuration: 0.055 },
  // 3rd degree: complete AV dissociation, wide escape QRS, slow rate
  'third-degree-avb': { pAmplitude: 0.12, rAmplitude: 0.55, rDuration: 0.07, sAmplitude: -0.3, tAmplitude: -0.22 },

  // ─── Bundle branch blocks ────────────────────────────────────
  // RBBB: rSR' in V1, wide slurred S in I/V5-V6, QRS >120ms
  'rbbb': { rDuration: 0.07, sDuration: 0.055, sAmplitude: -0.38, tAmplitude: -0.18 },
  // LBBB: broad notched R in I/V5-V6, rS or QS in V1, QRS >120ms, discordant T
  'lbbb': { rDuration: 0.09, qAmplitude: 0, sAmplitude: -0.48, tAmplitude: -0.38, stDeviation: -0.1 },
  // Bifascicular: RBBB + LAFB or LPFB pattern
  'bifascicular': { rDuration: 0.07, sDuration: 0.055, sAmplitude: -0.38, tAmplitude: -0.15 },

  // ─── Ventricular arrhythmias ──────────────────────────────────
  // PVCs: wide bizarre QRS, no preceding P wave, compensatory pause, discordant T
  'pvcs': { pAmplitude: 0, rDuration: 0.085, rAmplitude: 1.2, sAmplitude: -0.5, tAmplitude: -0.42, noiseLevel: 0.01 },
  // Monomorphic VT: regular wide complex tachycardia, AV dissociation
  'vt': { pAmplitude: 0, rDuration: 0.10, rAmplitude: 1.3, sAmplitude: -0.6, tAmplitude: -0.48, stDeviation: 0.06, noiseLevel: 0.01 },
  'ventricular-fibrillation': {},
  'vfib': {},
  // Torsades: polymorphic VT with sinusoidal amplitude variation ("twisting of the points")
  'torsades': { pAmplitude: 0, rDuration: 0.085, rAmplitude: 0.9, sAmplitude: -0.38, tAmplitude: -0.32, noiseLevel: 0.035 },

  // ─── Ischemia / MI ────────────────────────────────────────────
  // Anterior STEMI: convex ST elevation V1-V4, hyperacute tall T waves, pathologic Q developing
  'anterior-stemi': { stDeviation: 0.5, tAmplitude: 0.6, tDuration: 0.14, qAmplitude: -0.12 },
  // Inferior STEMI: ST elevation II, III, aVF; reciprocal depression in I, aVL
  'inferior-stemi': { stDeviation: 0.38, tAmplitude: 0.48, tDuration: 0.13, qAmplitude: -0.08 },
  // Lateral STEMI: ST elevation I, aVL, V5-V6
  'lateral-stemi': { stDeviation: 0.32, tAmplitude: 0.42, tDuration: 0.12 },
  // NSTEMI: ST depression and/or T wave inversion (subendocardial ischemia)
  'nstemi': { stDeviation: -0.22, tAmplitude: -0.32, tDuration: 0.12 },
  // Wellens: deeply inverted or biphasic T waves in V2-V3 (critical LAD stenosis)
  'wellens': { tAmplitude: -0.45, stDeviation: -0.03, tDuration: 0.15 },

  // ─── Cardiomyopathies ────────────────────────────────────────
  // DCM: low voltage, poor R wave progression, IVCD, nonspecific ST-T
  'dcm': { rAmplitude: 0.42, qAmplitude: -0.12, tAmplitude: -0.2, rDuration: 0.065, noiseLevel: 0.01 },
  // HCM: deep narrow Q waves (septal), tall R, LVH voltage, T inversions (strain)
  'hcm': { rAmplitude: 1.55, sAmplitude: -0.42, tAmplitude: -0.28, qAmplitude: -0.22, qDuration: 0.025, stDeviation: -0.06 },
  // Takotsubo: diffuse ST elevation acutely, evolves to deep widespread T inversions and QT prolongation
  'takotsubo': { stDeviation: 0.28, tAmplitude: -0.38, tDuration: 0.16 },

  // ─── Heart failure ────────────────────────────────────────────
  // HFrEF: low voltage, IVCD/LBBB, LAE, nonspecific ST-T changes
  'hfref': { rAmplitude: 0.5, rDuration: 0.07, tAmplitude: -0.2, pAmplitude: 0.2, pDuration: 0.1, noiseLevel: 0.01 },
  // HFpEF: LAE (P mitrale), LVH voltage criteria, diastolic pattern
  'hfpef': { pAmplitude: 0.24, pDuration: 0.12, rAmplitude: 1.3, tAmplitude: -0.12 },
  // Cardiogenic shock: sinus tachycardia, low voltage, diffuse ST depression
  'cardiogenic-shock': { rAmplitude: 0.42, stDeviation: -0.15, tAmplitude: -0.25, noiseLevel: 0.02 },

  // ─── Valvular ────────────────────────────────────────────────
  // Aortic stenosis: LVH with strain pattern (tall R, ST depression, T inversion in laterals)
  'aortic-stenosis': { rAmplitude: 1.65, sAmplitude: -0.48, tAmplitude: -0.28, stDeviation: -0.1 },
  // Mitral regurgitation: LAE (wide notched P in II), possible LVH
  'mitral-regurgitation': { pAmplitude: 0.22, pDuration: 0.12, rAmplitude: 1.18 },
  // Mitral stenosis: LAE (P mitrale), possible RVH from pulmonary HTN, AF common
  'mitral-stenosis': { pAmplitude: 0.26, pDuration: 0.13, rAmplitude: 0.9 },

  // ─── Pericardial ─────────────────────────────────────────────
  // Pericarditis: diffuse concave-up ST elevation, PR depression, reciprocal in aVR
  'pericarditis': { stDeviation: 0.2, tAmplitude: 0.4, pAmplitude: 0.12 },
  // Tamponade: low voltage (from effusion), electrical alternans (beat-to-beat R amplitude variation)
  'cardiac-tamponade': { rAmplitude: 0.32, pAmplitude: 0.04, noiseLevel: 0.012 },

  // ─── Congenital ──────────────────────────────────────────────
  // ASD: incomplete RBBB pattern (rSR' in V1), RAD, RAE
  'asd': { rDuration: 0.065, sDuration: 0.048, sAmplitude: -0.3, pAmplitude: 0.14 },
  // VSD: biventricular hypertrophy, LAE
  'vsd': { rAmplitude: 1.38, sAmplitude: -0.4, pAmplitude: 0.16 },
  // PFO: typically normal ECG
  'pfo': {},

  // ─── Metabolic ───────────────────────────────────────────────
  // Hyperkalemia: tall peaked T, flattened P, widened QRS
  'hyperkalemia': { tAmplitude: 0.68, tDuration: 0.05, pAmplitude: 0.04, rDuration: 0.07 },
  // LVH: Sokolow-Lyon voltage criteria, strain pattern
  'lvh': { rAmplitude: 1.65, sAmplitude: -0.48, tAmplitude: -0.28, stDeviation: -0.1 },
};

/**
 * Atrial fibrillation generator — replaces regular P waves with irregular fibrillatory baseline.
 * Uses multiple sine waves at different frequencies to create chaotic fibrillatory waves (f waves)
 * with varying amplitude, simulating the 350-600/min atrial impulses seen in real AF.
 */
export function generateAFibSample(t: number, params: WaveformParams): number {
  const afibParams = { ...params, pAmplitude: 0 };
  const base = generateBeatSample(t, afibParams);
  // Fibrillatory baseline: irregular low-amplitude oscillations
  // Multiple harmonics create the chaotic appearance of f waves
  const phase1 = t * 2654.32; // pseudo-random phase from t
  const phase2 = t * 3847.91;
  const phase3 = t * 5123.67;
  const fib = 0.035 * Math.sin(2 * Math.PI * t * 380 + Math.sin(phase1)) +
    0.025 * Math.sin(2 * Math.PI * t * 470 + Math.sin(phase2)) +
    0.018 * Math.sin(2 * Math.PI * t * 620 + Math.sin(phase3)) +
    0.01 * Math.sin(2 * Math.PI * t * 280 + Math.sin(phase1 * 0.7));
  return base + fib;
}

/**
 * Ventricular fibrillation generator.
 * Creates a chaotic, disorganized waveform with varying frequency and amplitude,
 * simulating the coarse or fine VF pattern. No discernible QRS complexes.
 */
export function generateVFibSample(t: number): number {
  // Multiple overlapping sine waves with slowly varying frequencies
  // to create the characteristic undulating VF pattern
  const modulation = 0.6 + 0.4 * Math.sin(2 * Math.PI * t * 0.8);
  const freq1 = 3.5 + 1.5 * Math.sin(2 * Math.PI * t * 0.3);
  const freq2 = 5.5 + 2.0 * Math.sin(2 * Math.PI * t * 0.5);
  const freq3 = 8.0 + 3.0 * Math.sin(2 * Math.PI * t * 0.15);
  return modulation * (
    0.45 * Math.sin(2 * Math.PI * freq1 * t) +
    0.3 * Math.sin(2 * Math.PI * freq2 * t + 1.2) +
    0.15 * Math.sin(2 * Math.PI * freq3 * t + 2.8) +
    0.08 * (Math.sin(t * 47.3) * Math.cos(t * 23.1)) // Fine irregularity
  );
}

/**
 * Flutter generator — sawtooth F-wave pattern at ~300 bpm.
 * Creates the classic "sawtooth" appearance with negative flutter waves
 * in the inferior leads (II, III, aVF), best seen when AV block is present.
 */
export function generateFlutterBaseline(t: number, flutterRate: number = 300): number {
  const cycleT = (t * flutterRate) % 1;
  // More realistic sawtooth: steep upstroke, gradual downstroke
  const sawtooth = cycleT < 0.3
    ? -0.25 * (1 - cycleT / 0.3) // Steep negative deflection
    : -0.25 * ((cycleT - 0.3) / 0.7 - 1); // Gradual recovery
  return sawtooth;
}
