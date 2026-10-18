/**
 * Reads: the learner interprets what a test shows — a 12-lead, a set of pressures, a physiology
 * measurement, a stent-sizing measurement, an angiogram, or a sudden change in the patient — by picking
 * from every option of that kind. The simulator confirms or corrects it at once (self-paced: no instructor needed).
 *
 * 12-lead: each ECG profile maps to exactly one read (the answer); some reads earn partial credit
 * (e.g. "complete heart block" for an inferior STEMI with complete heart block). For the other kinds the
 * scenario names the answer when it asks for the read.
 */

export type ReadKind = 'ecg' | 'hemo' | 'physiology' | 'sizing' | 'clinical' | 'angio';
export type Verdict = 'correct' | 'partial' | 'wrong';

export interface ReadOption {
  id: string;
  label: string;
  group: string;
  /** 12-lead reads: the ECG profiles this read is correct for */
  profiles?: string[];
}

export const READ_GROUPS = ['Rhythm', 'AV and bundle branch blocks', 'Ischaemia and infarction', 'Other patterns'];

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

/** Pressures from a catheter or a right heart run */
const HEMO_OPTIONS: ReadOption[] = [
  { id: 'hemo-normal', label: 'Normal hemodynamics', group: 'Pressures' },
  { id: 'hemo-lvedp-high', label: 'Elevated LVEDP (high left-sided filling pressure)', group: 'Pressures' },
  { id: 'hemo-cardiogenic', label: 'Cardiogenic shock: high filling pressures, low cardiac index', group: 'Shock profiles' },
  { id: 'hemo-hypovolemic', label: 'Hypovolaemia: low filling pressures, low cardiac index', group: 'Shock profiles' },
  { id: 'hemo-distributive', label: 'Distributive shock: low SVR, high cardiac index', group: 'Shock profiles' },
  { id: 'hemo-rv-infarct', label: 'RV infarction: high RA pressure with a normal or low PCWP', group: 'Shock profiles' },
  { id: 'hemo-tamponade', label: 'Cardiac tamponade: equalised diastolic pressures', group: 'Shock profiles' },
  { id: 'hemo-ph', label: 'Pre-capillary pulmonary hypertension (high PA pressure, normal PCWP)', group: 'Pressures' },
  { id: 'hemo-damped', label: 'Damped / ventricularised catheter pressure (catheter wedged)', group: 'Waveforms' },
  { id: 'hemo-as', label: 'Aortic stenosis gradient on pullback', group: 'Waveforms' },
];

/** Coronary physiology (FFR / iFR) */
const PHYSIOLOGY_OPTIONS: ReadOption[] = [
  { id: 'ffr-significant', label: 'Significant (FFR ≤ 0.80): treat the lesion', group: 'Coronary physiology' },
  { id: 'ffr-not-significant', label: 'Not significant (FFR > 0.80): medical therapy, no stent', group: 'Coronary physiology' },
  { id: 'ffr-drift', label: 'Pressure drift: re-equalise at the guide tip and repeat', group: 'Coronary physiology' },
  { id: 'ffr-no-hyperemia', label: 'Inadequate hyperaemia: give more adenosine and repeat', group: 'Coronary physiology' },
];

/** Stent size from the intravascular imaging measurements */
const SIZING_OPTIONS: ReadOption[] = [
  { id: 'stent-2.5x12', label: '2.5 × 12 mm drug-eluting stent', group: 'Stent size' },
  { id: 'stent-3.0x15', label: '3.0 × 15 mm drug-eluting stent', group: 'Stent size' },
  { id: 'stent-3.0x23', label: '3.0 × 23 mm drug-eluting stent', group: 'Stent size' },
  { id: 'stent-3.5x15', label: '3.5 × 15 mm drug-eluting stent', group: 'Stent size' },
  { id: 'stent-3.5x23', label: '3.5 × 23 mm drug-eluting stent', group: 'Stent size' },
  { id: 'stent-3.5x28', label: '3.5 × 28 mm drug-eluting stent', group: 'Stent size' },
  { id: 'stent-4.0x23', label: '4.0 × 23 mm drug-eluting stent', group: 'Stent size' },
  { id: 'stent-4.5x18', label: '4.5 × 18 mm drug-eluting stent', group: 'Stent size' },
];

/** "What is happening?" — a sudden change in the patient */
const CLINICAL_OPTIONS: ReadOption[] = [
  { id: 'clin-contrast', label: 'Anaphylactoid (contrast) reaction', group: 'Reactions' },
  { id: 'clin-vasovagal', label: 'Vasovagal reaction', group: 'Reactions' },
  { id: 'clin-bezold', label: 'Bezold–Jarisch reflex (bradycardia and hypotension with inferior reperfusion or RCA injection)', group: 'Reactions' },
  { id: 'clin-sedation', label: 'Oversedation / respiratory depression', group: 'Reactions' },
  { id: 'clin-perforation', label: 'Coronary perforation (contrast leaving the vessel)', group: 'Coronary complications' },
  { id: 'clin-dissection', label: 'Coronary dissection', group: 'Coronary complications' },
  { id: 'clin-no-reflow', label: 'No-reflow', group: 'Coronary complications' },
  { id: 'clin-air', label: 'Coronary air embolism', group: 'Coronary complications' },
  { id: 'clin-stent-thrombosis', label: 'Acute stent thrombosis', group: 'Coronary complications' },
  { id: 'clin-tamponade', label: 'Cardiac tamponade', group: 'Haemodynamic emergencies' },
  { id: 'clin-rp-bleed', label: 'Retroperitoneal bleed', group: 'Haemodynamic emergencies' },
  { id: 'clin-spasm', label: 'Radial artery spasm', group: 'Access' },
  { id: 'clin-hematoma', label: 'Access-site hematoma', group: 'Access' },
  { id: 'clin-stroke', label: 'Stroke', group: 'Other' },
  { id: 'clin-aivr', label: 'Reperfusion rhythm (accelerated idioventricular rhythm)', group: 'Other' },
];

/** Angiogram reads (used once real angiogram images are in the app) */
const ANGIO_OPTIONS: ReadOption[] = [
  { id: 'angio-normal', label: 'No significant coronary disease', group: 'Findings' },
  { id: 'angio-lad-prox-occlusion', label: 'Proximal LAD occlusion (TIMI 0 flow)', group: 'Occlusions' },
  { id: 'angio-rca-occlusion', label: 'RCA occlusion (TIMI 0 flow)', group: 'Occlusions' },
  { id: 'angio-lcx-occlusion', label: 'Circumflex / obtuse marginal occlusion', group: 'Occlusions' },
  { id: 'angio-lm', label: 'Left main stenosis', group: 'Stenoses' },
  { id: 'angio-lad-intermediate', label: 'Intermediate (40–70 %) LAD stenosis', group: 'Stenoses' },
  { id: 'angio-severe-stenosis', label: 'Severe (> 70 %) stenosis', group: 'Stenoses' },
  { id: 'angio-thrombus', label: 'Thrombus', group: 'Findings' },
  { id: 'angio-dissection', label: 'Dissection', group: 'Complications' },
  { id: 'angio-perforation', label: 'Perforation with contrast extravasation', group: 'Complications' },
  { id: 'angio-no-reflow', label: 'No-reflow (TIMI 0–1 after stenting)', group: 'Complications' },
  { id: 'angio-timi3', label: 'Open artery with TIMI 3 flow', group: 'Findings' },
];

export interface ReadSet {
  /** the question shown to the learner */
  title: string;
  groups: string[];
  options: ReadOption[];
}

const groupsOf = (o: ReadOption[]) => Array.from(new Set(o.map((x) => x.group)));

export const READ_SETS: Record<ReadKind, ReadSet> = {
  ecg: { title: 'What does this 12-lead show?', groups: READ_GROUPS, options: READ_OPTIONS },
  hemo: { title: 'What do these pressures show?', groups: groupsOf(HEMO_OPTIONS), options: HEMO_OPTIONS },
  physiology: { title: 'What does this physiology measurement mean?', groups: groupsOf(PHYSIOLOGY_OPTIONS), options: PHYSIOLOGY_OPTIONS },
  sizing: { title: 'Which stent fits these measurements?', groups: groupsOf(SIZING_OPTIONS), options: SIZING_OPTIONS },
  clinical: { title: 'What is happening?', groups: groupsOf(CLINICAL_OPTIONS), options: CLINICAL_OPTIONS },
  angio: { title: 'What does this angiogram show?', groups: groupsOf(ANGIO_OPTIONS), options: ANGIO_OPTIONS },
};

/** What each kind of read is called in the story and the review */
export const READ_KIND_NAME: Record<ReadKind, string> = {
  ecg: '12-lead', hemo: 'pressures', physiology: 'physiology', sizing: 'stent sizing', clinical: 'assessment', angio: 'angiogram',
};

export const READ_OPTION_BY_ID: Record<string, ReadOption> = Object.fromEntries(
  Object.values(READ_SETS).flatMap((set) => set.options).map((o) => [o.id, o]),
);

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
  const hit = READ_OPTIONS.find((o) => o.profiles?.includes(profile));
  if (!hit) throw new Error(`No 12-lead read for profile ${profile}`);
  return hit;
}

/** Half-right 12-lead reads for a profile */
export const partialFor = (profile: string) => PARTIAL[profile] ?? [];

/** Judge a 12-lead read against the ECG profile on the tracing */
export function judgeRead(profile: string, optionId: string): Verdict {
  if (READ_OPTION_BY_ID[optionId]?.profiles?.includes(profile)) return 'correct';
  return PARTIAL[profile]?.includes(optionId) ? 'partial' : 'wrong';
}
