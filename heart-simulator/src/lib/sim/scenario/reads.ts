/**
 * 12-lead interpretation in the simulator. The learner reads the tracing and picks a read from every
 * interpretation the app can show; the FTO (field) or preceptor (cath lab) confirms or corrects it at
 * once. Each ECG profile maps to exactly one read option (the answer); some reads earn partial credit
 * (e.g. "complete heart block" for an inferior STEMI with complete heart block).
 */

export type ReadGroup = 'Rhythm' | 'AV and bundle branch blocks' | 'Ischaemia and infarction' | 'Other patterns';
export type Verdict = 'correct' | 'partial' | 'wrong';

export interface ReadOption {
  id: string;
  label: string;
  group: ReadGroup;
  /** the ECG profiles this read is correct for */
  profiles: string[];
}

export const READ_GROUPS: ReadGroup[] = ['Rhythm', 'AV and bundle branch blocks', 'Ischaemia and infarction', 'Other patterns'];

export const READ_OPTIONS: ReadOption[] = [
  { id: 'nsr', label: 'Normal sinus rhythm', group: 'Rhythm', profiles: ['normal-sinus', 'pfo'] },
  { id: 'sinus-brady', label: 'Sinus bradycardia', group: 'Rhythm', profiles: ['sinus-bradycardia'] },
  { id: 'sinus-tach', label: 'Sinus tachycardia', group: 'Rhythm', profiles: ['sinus-tachycardia'] },
  { id: 'afib', label: 'Atrial fibrillation', group: 'Rhythm', profiles: ['atrial-fibrillation'] },
  { id: 'aflutter', label: 'Atrial flutter', group: 'Rhythm', profiles: ['atrial-flutter'] },
  { id: 'svt', label: 'Supraventricular tachycardia (SVT, e.g. AVNRT)', group: 'Rhythm', profiles: ['avnrt'] },
  { id: 'junctional', label: 'Junctional rhythm', group: 'Rhythm', profiles: ['junctional'] },
  { id: 'pvcs', label: 'Sinus rhythm with PVCs', group: 'Rhythm', profiles: ['pvcs'] },
  { id: 'vt', label: 'Ventricular tachycardia (monomorphic)', group: 'Rhythm', profiles: ['vt', 'pvt'] },
  { id: 'torsades', label: 'Polymorphic VT (torsades de pointes)', group: 'Rhythm', profiles: ['torsades'] },
  { id: 'vf', label: 'Ventricular fibrillation', group: 'Rhythm', profiles: ['vf'] },
  { id: 'asystole', label: 'Asystole', group: 'Rhythm', profiles: ['asystole'] },
  { id: 'paced', label: 'Paced rhythm (implanted pacemaker)', group: 'Rhythm', profiles: ['paced'] },
  { id: 'tcp', label: 'Transcutaneous pacing with capture', group: 'Rhythm', profiles: ['tcp'] },

  { id: 'avb1', label: 'First-degree AV block', group: 'AV and bundle branch blocks', profiles: ['first-degree-avb'] },
  { id: 'mobitz1', label: 'Second-degree AV block, Mobitz I (Wenckebach)', group: 'AV and bundle branch blocks', profiles: ['mobitz-i'] },
  { id: 'mobitz2', label: 'Second-degree AV block, Mobitz II', group: 'AV and bundle branch blocks', profiles: ['mobitz-ii'] },
  { id: 'chb', label: 'Third-degree (complete) heart block', group: 'AV and bundle branch blocks', profiles: ['third-degree-avb'] },
  { id: 'rbbb', label: 'Right bundle branch block', group: 'AV and bundle branch blocks', profiles: ['rbbb'] },
  { id: 'lbbb', label: 'Left bundle branch block', group: 'AV and bundle branch blocks', profiles: ['lbbb', 'dcm', 'hfref'] },
  { id: 'bifascicular', label: 'Bifascicular block (RBBB + left anterior fascicular block)', group: 'AV and bundle branch blocks', profiles: ['bifascicular'] },
  { id: 'wpw', label: 'Pre-excitation (Wolff-Parkinson-White)', group: 'AV and bundle branch blocks', profiles: ['wpw'] },
  { id: 'incomplete-rbbb', label: 'Incomplete RBBB with right axis deviation', group: 'AV and bundle branch blocks', profiles: ['asd'] },

  { id: 'stemi-anterior', label: 'Anterior STEMI', group: 'Ischaemia and infarction', profiles: ['anterior-stemi', 'cardiogenic-shock'] },
  { id: 'stemi-inferior', label: 'Inferior STEMI', group: 'Ischaemia and infarction', profiles: ['inferior-stemi'] },
  { id: 'stemi-lateral', label: 'Lateral STEMI', group: 'Ischaemia and infarction', profiles: ['lateral-stemi'] },
  { id: 'stemi-inferior-chb', label: 'Inferior STEMI with complete heart block', group: 'Ischaemia and infarction', profiles: ['inferior-stemi-chb'] },
  { id: 'reperfused-anterior', label: 'Anterior MI after reperfusion (ST elevation resolving)', group: 'Ischaemia and infarction', profiles: ['anterior-stemi-reperfused'] },
  { id: 'reperfused-inferior', label: 'Inferior MI after reperfusion (ST elevation resolving)', group: 'Ischaemia and infarction', profiles: ['inferior-stemi-reperfused'] },
  { id: 'ischaemia', label: 'Diffuse ST depression with ST elevation in aVR (subendocardial ischaemia)', group: 'Ischaemia and infarction', profiles: ['nstemi'] },
  { id: 'wellens', label: 'Wellens pattern (deep T-wave inversion V2–V3)', group: 'Ischaemia and infarction', profiles: ['wellens'] },
  { id: 'takotsubo', label: 'Anterior ST elevation without reciprocal change (Takotsubo pattern)', group: 'Ischaemia and infarction', profiles: ['takotsubo'] },

  { id: 'pericarditis', label: 'Acute pericarditis (diffuse ST elevation, PR depression)', group: 'Other patterns', profiles: ['pericarditis'] },
  { id: 'hyperkalaemia', label: 'Hyperkalaemia (peaked T waves, wide QRS)', group: 'Other patterns', profiles: ['hyperkalemia'] },
  { id: 'right-strain', label: 'Right heart strain (S1Q3T3)', group: 'Other patterns', profiles: ['pulmonary-embolism'] },
  { id: 'lvh', label: 'Left ventricular hypertrophy with strain', group: 'Other patterns', profiles: ['aortic-stenosis', 'hfpef', 'aortic-dissection'] },
  { id: 'hcm', label: 'LVH with deep, narrow ("dagger") Q waves', group: 'Other patterns', profiles: ['hcm'] },
  { id: 'lae', label: 'Left atrial enlargement', group: 'Other patterns', profiles: ['mitral-regurgitation'] },
  { id: 'p-mitrale-rvh', label: 'P mitrale with right ventricular hypertrophy', group: 'Other patterns', profiles: ['mitral-stenosis'] },
  { id: 'bvh', label: 'Biventricular hypertrophy', group: 'Other patterns', profiles: ['vsd'] },
  { id: 'low-voltage', label: 'Low voltage with electrical alternans', group: 'Other patterns', profiles: ['tamponade'] },
];

export const READ_OPTION_BY_ID: Record<string, ReadOption> = Object.fromEntries(READ_OPTIONS.map((o) => [o.id, o]));

/** Reads that are partly right for a profile: one of two findings, or the right infarct at the wrong stage */
const PARTIAL: Record<string, string[]> = {
  'inferior-stemi-chb': ['stemi-inferior', 'chb'],
  'anterior-stemi-reperfused': ['stemi-anterior'],
  'inferior-stemi-reperfused': ['stemi-inferior'],
  'cardiogenic-shock': ['sinus-tach'],
  tcp: ['paced'],
  paced: ['tcp'],
};

/** The correct read for an ECG profile */
export function answerFor(profile: string): ReadOption {
  const hit = READ_OPTIONS.find((o) => o.profiles.includes(profile));
  if (!hit) throw new Error(`No 12-lead read for profile ${profile}`);
  return hit;
}

export function judgeRead(profile: string, optionId: string): Verdict {
  if (READ_OPTION_BY_ID[optionId]?.profiles.includes(profile)) return 'correct';
  return PARTIAL[profile]?.includes(optionId) ? 'partial' : 'wrong';
}
