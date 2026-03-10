export type ECGLead = 'I' | 'II' | 'III' | 'aVR' | 'aVL' | 'aVF' | 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6';

export interface WaveformComponent {
  amplitude: number;
  duration: number;
  offset: number;
  morphology: 'gaussian' | 'biphasic' | 'notched' | 'peaked' | 'flat' | 'inverted';
}

export interface ECGProfile {
  id: string;
  name: string;
  conditionReference: string;
  rate: { min: number; max: number; typical: number };
  rhythm: string;
  pWave: { visible: boolean; morphology: string; duration: number; amplitude: number };
  prInterval: { duration: number; variability: string };
  qrsComplex: { duration: number; morphology: string; axis: number };
  stSegment: { deviation: number; morphology: string; leads: string[] };
  tWave: { morphology: string; amplitude: number };
  qtInterval: { duration: number; corrected: number };
  leadSpecificChanges: Record<string, Partial<{
    stDeviation: number;
    tWaveMorphology: string;
    qrsAmplitude: number;
    pWaveAmplitude: number;
  }>>;
  annotations: string[];
  levelExplanations: { level: number; explanation: string }[];
}

export interface ECGProfilesDataset {
  schemaVersion: string;
  description: string;
  profiles: ECGProfile[];
}
