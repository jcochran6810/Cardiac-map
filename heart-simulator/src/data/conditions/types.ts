/**
 * Shared shape for the condition knowledge base. Every tab in the info panel
 * maps to one field; `levelSummaries` holds one explanation per learning level
 * (index 0 = EMT, 1 = Paramedic, 2 = ED/ICU, 3 = Cardiology, 4 = Interventional).
 */
export interface ConditionInfo {
  title: string;
  category: string;
  /** Waveform-engine profile id shown on the ECG when this condition is selected. */
  ecgProfile: string;
  /** Characteristic heart rate (undefined → leave the current rate alone). */
  heartRate?: number;
  overview: string;
  pathophysiology: string;
  anatomy: string[];
  symptoms: string[];
  ecg: string[];
  imaging: string[];
  medications: string[];
  fieldCare: string[];
  hospitalCare: string[];
  cardiologyCare: string[];
  procedure: string[];
  complications: string[];
  teaching: string[];
  levelSummaries: [string, string, string, string, string];
  /** Anatomy structure ids to highlight in the 3D scene. */
  affectedAnatomy: string[];
  /** Related procedure ids (from procedureData). */
  relatedProcedures: string[];
  /** Related medication ids (from medicationData). */
  relatedMedications: string[];
}
