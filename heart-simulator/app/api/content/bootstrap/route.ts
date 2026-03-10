import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    datasets: [
      'anatomy-data',
      'coronary-tree',
      'conditions-data',
      'ecg-profiles',
      'pharmacology-data',
      'procedures-data',
      'imaging-data',
      'case-scenarios',
      'glossary-data',
    ],
    learningLevels: [
      { level: 1, label: 'EMT / NREMT-Basic' },
      { level: 2, label: 'Paramedic' },
      { level: 3, label: 'ED / ICU / Acute Care' },
      { level: 4, label: 'Cardiology / Advanced' },
      { level: 5, label: 'Interventional / EP / Structural' },
    ],
    modes: ['explore', 'physiology', 'pathology', 'imaging', 'procedure', 'case', 'tutor'],
    viewModes: [
      'external', 'internal', 'cutaway', 'sectional', 'dissection',
      'coronary', 'conduction', 'perfusion', 'wall-motion',
      'procedure-overlay', 'imaging-correlation',
    ],
  });
}
