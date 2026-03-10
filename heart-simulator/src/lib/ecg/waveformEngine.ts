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
 */
export const CONDITION_MODIFIERS: Record<string, Partial<WaveformParams>> = {
  'anterior-stemi': {
    stDeviation: 0.4,
    tAmplitude: 0.5,
  },
  'inferior-stemi': {
    stDeviation: 0.3,
    tAmplitude: 0.4,
  },
  'rbbb': {
    rDuration: 0.06,
    sDuration: 0.05,
    sAmplitude: -0.3,
  },
  'lbbb': {
    rDuration: 0.08,
    qAmplitude: 0,
    sAmplitude: -0.4,
    tAmplitude: -0.3,
  },
  'hyperkalemia': {
    tAmplitude: 0.6,
    tDuration: 0.06,
    pAmplitude: 0.05,
    rDuration: 0.06,
  },
  'afib': {
    pAmplitude: 0,
    noiseLevel: 0.04,
    baselineWander: 0.03,
  },
  'aflutter': {
    pAmplitude: -0.2,
    pDuration: 0.04,
    noiseLevel: 0.01,
  },
  'first-degree-avb': {
    pOffset: 0.10, // earlier P wave to create longer PR
  },
  'vt': {
    pAmplitude: 0,
    rDuration: 0.08,
    rAmplitude: 1.2,
    sAmplitude: -0.5,
    tAmplitude: -0.4,
  },
  'pericarditis': {
    stDeviation: 0.15,
    tAmplitude: 0.35,
  },
  'lvh': {
    rAmplitude: 1.5,
    sAmplitude: -0.4,
    tAmplitude: -0.2,
  },
  'wellens': {
    tAmplitude: -0.3,
    stDeviation: -0.05,
  },
};

/**
 * Atrial fibrillation generator — replaces regular P waves with irregular fibrillatory baseline
 */
export function generateAFibSample(t: number, params: WaveformParams): number {
  const afibParams = { ...params, pAmplitude: 0 };
  const base = generateBeatSample(t, afibParams);
  // Add fibrillatory baseline
  const fib = 0.03 * Math.sin(2 * Math.PI * t * 350 + Math.random()) +
    0.02 * Math.sin(2 * Math.PI * t * 450 + Math.random() * 2) +
    0.015 * Math.sin(2 * Math.PI * t * 600 + Math.random() * 3);
  return base + fib;
}

/**
 * Ventricular fibrillation generator
 */
export function generateVFibSample(t: number): number {
  const freq1 = 3 + Math.random() * 2;
  const freq2 = 5 + Math.random() * 3;
  return 0.5 * Math.sin(2 * Math.PI * freq1 * t) +
    0.3 * Math.sin(2 * Math.PI * freq2 * t + Math.random()) +
    0.1 * (Math.random() * 2 - 1);
}

/**
 * Flutter generator — sawtooth pattern
 */
export function generateFlutterBaseline(t: number, flutterRate: number = 300): number {
  const cycleT = (t * flutterRate) % 1;
  return -0.2 * (1 - 2 * cycleT); // Sawtooth
}
