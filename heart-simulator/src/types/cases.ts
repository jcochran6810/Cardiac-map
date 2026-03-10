export type CaseDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface CaseVitals {
  hr: number;
  bp: string;
  rr: number;
  spo2: number;
  temp: number;
}

export interface CaseAction {
  id: string;
  label: string;
  type: 'assessment' | 'treatment' | 'imaging' | 'lab' | 'consult' | 'procedure';
  correctness: 'correct' | 'acceptable' | 'suboptimal' | 'harmful';
  feedback: string;
  nextStateId: string | null;
}

export interface CaseState {
  id: string;
  description: string;
  vitals: CaseVitals;
  ecgProfile: string;
  imagingReferences: string[];
  availableActions: CaseAction[];
  tutorHint: string;
}

export interface CaseScenario {
  id: string;
  title: string;
  difficulty: CaseDifficulty;
  targetLevel: number;
  presentingComplaint: string;
  age: number;
  sex: string;
  history: string;
  medications: string[];
  initialVitals: CaseVitals;
  symptomScript: string;
  ecgProfile: string;
  imagingReferences: string[];
  likelyDiagnoses: string[];
  distractorDiagnoses: string[];
  states: CaseState[];
  debriefSummary: string;
  linkedReferences: { anatomy: string[]; conditions: string[]; procedures: string[] };
}

export interface CaseScenariosDataset {
  schemaVersion: string;
  description: string;
  scenarios: CaseScenario[];
}
