export * from './anatomy';
export * from './coronary';
export * from './conditions';
export * from './ecg';
export * from './pharmacology';
export * from './procedures';
export * from './imaging';
export * from './cases';
export * from './tutor';

export type AppMode = 'explore' | 'physiology' | 'pathology' | 'imaging' | 'procedure' | 'case' | 'tutor';
export type ViewMode = 'external' | 'internal' | 'cutaway' | 'sectional' | 'dissection' | 'coronary' | 'conduction' | 'perfusion' | 'wall-motion' | 'procedure-overlay' | 'imaging-correlation';
export type DetailLevel = 'low' | 'standard' | 'high';
