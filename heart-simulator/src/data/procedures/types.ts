export interface ProcedureStepInfo {
  step: number;
  title: string;
  description: string;
  /** Anatomy structure id highlighted in the 3D scene while this step is active. */
  anatomyTarget?: string;
  /** Camera preset label to fly to for this step (see CAMERA_PRESETS). */
  view?: string;
}

export interface ProcedureInfo {
  name: string;
  category: string;
  overview: string;
  accessSite: string;
  imaging: string[];
  indications: string[];
  contraindications: string[];
  anatomy: string[];
  /** Structure ids relevant to the whole procedure. */
  anatomyTargets: string[];
  steps: ProcedureStepInfo[];
  ecgConsiderations: string[];
  equipment: string[];
  complications: string[];
  teaching: string[];
  /** EMT, Paramedic, ED/ICU, Cardiology, Interventional. */
  levelSummaries: [string, string, string, string, string];
  /** Suggested ECG profile to display during the procedure (optional). */
  ecgProfile?: string;
  /** Preferred 3D view mode while the procedure is selected. */
  viewMode?: 'external' | 'internal' | 'cutaway' | 'coronary' | 'conduction' | 'dissection';
}
