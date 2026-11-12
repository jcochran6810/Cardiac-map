import type { Course } from '@/types/course';
import { HEART_BASICS } from './heart-basics';
import { ECG_FOUNDATIONS } from './ecg-foundations';
import { RHYTHM_RECOGNITION } from './rhythm-recognition';
import { STEMI } from './stemi';
import { CARDIAC_ARREST } from './cardiac-arrest';
import { HEMODYNAMICS } from './hemodynamics';
import { CATH_LAB } from './cath-lab';

/** The guided courses, in the order the course list shows them (each role sees its own courses first) */
export const COURSES: Course[] = [HEART_BASICS, ECG_FOUNDATIONS, RHYTHM_RECOGNITION, STEMI, CARDIAC_ARREST, HEMODYNAMICS, CATH_LAB].filter((c) => !c.draft);
