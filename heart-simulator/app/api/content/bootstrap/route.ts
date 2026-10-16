import { NextResponse } from 'next/server';
import { STRUCTURES, CONDITIONS, PROCEDURES, MEDICATIONS, QUIZ_QUESTIONS } from '@/data/content';
import { CASE_DATA } from '@/data/caseData';
import { ECG_PROFILES } from '@/lib/ecg/profiles';

/** Describes the teaching library so other clients (or a future backend) can discover what is available. */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    library: {
      structures: Object.keys(STRUCTURES).length,
      conditions: Object.keys(CONDITIONS).length,
      procedures: Object.keys(PROCEDURES).length,
      medications: Object.keys(MEDICATIONS).length,
      cases: Object.keys(CASE_DATA).length,
      quizQuestions: QUIZ_QUESTIONS.length,
      ecgProfiles: Object.keys(ECG_PROFILES).length,
    },
    learningLevels: [
      { level: 1, label: 'EMT / BLS' },
      { level: 2, label: 'Paramedic / ALS' },
      { level: 3, label: 'ED / ICU / Acute care' },
      { level: 4, label: 'Cardiology / Advanced' },
      { level: 5, label: 'Interventional / EP / Structural' },
    ],
    viewModes: ['external', 'sectioned', 'xray', 'conduction', 'territories'],
  });
}
