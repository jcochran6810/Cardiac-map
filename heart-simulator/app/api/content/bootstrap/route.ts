import { NextResponse } from 'next/server';
import { STRUCTURES, CONDITIONS, PROCEDURES, MEDICATIONS, QUIZ_QUESTIONS } from '@/data/content';
import { CASE_DATA } from '@/data/caseData';
import { ECG_PROFILES } from '@/lib/ecg/profiles';
import { LEVEL_LABELS, ROLES } from '@/store/useAppStore';
import { SCOPES } from '@/lib/scope';

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
    // every role, in the order the app offers them (field, emergency department, cath lab)
    learningLevels: ROLES.map((level) => ({ level, label: LEVEL_LABELS[level].long, scope: SCOPES[level].framework })),
    viewModes: ['external', 'sectioned', 'xray', 'conduction', 'territories', 'activation'],
    tools: ['12-lead ECG', 'electrode lab', 'Wiggers / PV loop', 'monitor-defibrillator trainer', 'projector monitor (/monitor)'],
  });
}
