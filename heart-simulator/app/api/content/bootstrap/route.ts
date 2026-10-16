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
      { level: 1, label: 'EMT (NREMT · BLS)', scope: 'National EMS Scope of Practice Model 2019' },
      { level: 2, label: 'Paramedic (NREMT · ALS)', scope: 'National EMS Scope of Practice Model 2019' },
      { level: 3, label: 'Cath Lab Tech (RCIS)', scope: 'RCIS · SCAI best practices · facility policy' },
      { level: 4, label: 'Cath Lab Nurse (RN)', scope: 'State Nurse Practice Act · facility policy' },
      { level: 5, label: 'Cardiologist', scope: 'Licensure · hospital privileges' },
    ],
    viewModes: ['external', 'sectioned', 'xray', 'conduction', 'territories', 'activation'],
    tools: ['12-lead ECG', 'electrode lab', 'Wiggers / PV loop', 'monitor-defibrillator trainer', 'projector monitor (/monitor)'],
  });
}
