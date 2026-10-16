/**
 * ECG morphology templates and condition profiles.
 *
 * Times are in milliseconds and are ABSOLUTE physiological durations — a QRS is
 * ~90 ms whether the heart rate is 40 or 150. Only the RR interval and the QT
 * interval (Fridericia correction) change with rate, as they do in real life.
 */
import { DipolePulse, Vec3, pulse, scale, norm } from './vector';

// ─── Rhythm kinds ──────────────────────────────────────────────────────────

export type RhythmKind =
  | 'sinus'
  | 'af'
  | 'flutter'
  | 'svt'
  | 'junctional'
  | 'wenckebach'
  | 'mobitz2'
  | 'chb'
  | 'pvc'
  | 'vt'
  | 'vf'
  | 'torsades'
  | 'asystole'
  | 'paced';

/** What the heart-rate slider controls for a rhythm */
export type RateControl = 'sinus' | 'ventricular' | 'none';

// ─── P-wave templates (anchor = P onset) ───────────────────────────────────

export interface PTemplate {
  pulses: DipolePulse[];
  duration: number;
}

export const P_TEMPLATES: Record<string, PTemplate> = {
  normal: {
    duration: 100,
    pulses: [pulse(32, 13, [0.15, -0.45, -0.9], 0.11), pulse(64, 14, [0.8, 0.55, -0.3], 0.09)],
  },
  // Left atrial enlargement: broad (>120 ms), notched P in II; deep terminal negative P in V1
  mitrale: {
    duration: 135,
    pulses: [pulse(32, 13, [0.15, -0.45, -0.9], 0.11), pulse(86, 17, [0.8, 0.65, -0.25], 0.13)],
  },
  // Right atrial enlargement: tall (>2.5 mm) peaked P in II, III, aVF
  pulmonale: {
    duration: 100,
    pulses: [pulse(36, 14, [0.05, -0.45, -0.9], 0.26), pulse(66, 13, [0.8, 0.55, -0.3], 0.07)],
  },
  // Retrograde atrial activation from the AV junction: inverted in II, III, aVF
  retrograde: {
    duration: 75,
    pulses: [pulse(34, 15, [0.05, -0.3, 0.95], 0.13)],
  },
  flat: {
    duration: 110,
    pulses: [pulse(34, 15, [0.15, -0.45, -0.9], 0.04), pulse(70, 15, [0.8, 0.55, -0.3], 0.03)],
  },
};

// ─── QRS templates (anchor = QRS onset) ────────────────────────────────────

export interface QRSTemplate {
  pulses: DipolePulse[];
  duration: number;
  /** Default T-wave vector (secondary repolarisation for wide complexes) */
  t: { dir: Vec3; mag: number };
  /** Default ST vector (e.g. appropriate discordance in LBBB) */
  st?: Vec3;
  /** Pathway segments that are blocked or bypassed (used by the 3D conduction overlay) */
  conduction?: 'normal' | 'rbbb' | 'lbbb' | 'rbbb-lafb' | 'ectopic' | 'paced' | 'preexcited';
}

const NORMAL_T = { dir: [0.5, -0.5, -0.7] as Vec3, mag: 0.4 };

// Normal ventricular depolarisation: septal (L→R, anterior) → anteroapical → lateral free wall → basal
const SEPTAL = pulse(12, 6, [-0.45, -0.85, 0.05], 0.2);
const ANTEROAPICAL = pulse(30, 9, [0.25, -0.55, -0.85], 0.85);
const LATERAL = pulse(48, 10, [0.78, 0.42, -0.62], 1.3);
const BASAL = pulse(70, 9, [-0.2, 0.75, 0.55], 0.42);

export const QRS_TEMPLATES: Record<string, QRSTemplate> = {
  normal: { duration: 92, pulses: [SEPTAL, ANTEROAPICAL, LATERAL, BASAL], t: NORMAL_T, conduction: 'normal' },

  // RBBB: normal early forces, then slow, late right-anterior activation of the RV → rsR′ in V1, broad S in I/V6
  rbbb: {
    duration: 140,
    pulses: [SEPTAL, ANTEROAPICAL, pulse(46, 10, [0.88, 0.42, -0.35], 1.1), pulse(66, 9, [-0.1, 0.8, 0.4], 0.3), pulse(104, 15, [-0.62, -0.72, 0.05], 0.72)],
    t: { dir: [0.75, 0.4, -0.45], mag: 0.3 },
    conduction: 'rbbb',
  },

  // Incomplete RBBB (e.g. secundum ASD): rSr′ in V1, QRS 100–119 ms
  'incomplete-rbbb': {
    duration: 112,
    pulses: [SEPTAL, pulse(30, 9, [0.25, -0.55, -0.8], 0.85), pulse(48, 10, [0.8, 0.45, -0.45], 1.0), pulse(68, 9, [-0.2, 0.75, 0.5], 0.3), pulse(90, 10, [-0.6, -0.72, 0.1], 0.38)],
    t: NORMAL_T,
    conduction: 'normal',
  },

  // LBBB: septum activated right→left, slow LV activation → no septal q in I/V6, broad notched R in I/aVL/V5–V6, QS in V1–V2
  lbbb: {
    duration: 150,
    pulses: [pulse(25, 13, [0.65, 0.35, -0.45], 0.55), pulse(62, 16, [0.85, 0.5, -0.15], 1.25), pulse(105, 15, [0.72, 0.65, 0.1], 0.95)],
    t: { dir: [-0.75, -0.55, 0.25], mag: 0.42 },
    st: scale(norm([-0.72, -0.55, 0.2]), 0.13),
    conduction: 'lbbb',
  },

  // RBBB + left anterior fascicular block: rsR′ in V1 plus left axis deviation (rS in II, III, aVF; qR in aVL)
  'rbbb-lafb': {
    duration: 142,
    pulses: [pulse(14, 7, [-0.2, -0.6, -0.75], 0.25), pulse(44, 12, [0.65, 0.35, 0.65], 1.25), pulse(66, 9, [-0.1, 0.7, 0.55], 0.3), pulse(106, 15, [-0.62, -0.72, 0.1], 0.7)],
    t: { dir: [0.75, 0.35, -0.3], mag: 0.28 },
    conduction: 'rbbb-lafb',
  },

  // LVH: exaggerated leftward/posterior forces (Sokolow-Lyon: S V1 + R V5/V6 ≥ 35 mm)
  lvh: {
    duration: 100,
    pulses: [SEPTAL, pulse(30, 9, [0.4, -0.5, -0.75], 0.9), pulse(50, 11, [0.85, 0.5, -0.3], 2.25), pulse(74, 10, [-0.1, 0.8, 0.5], 0.6)],
    t: NORMAL_T,
    conduction: 'normal',
  },

  // HCM: LVH voltage + deep, narrow "dagger" septal Q waves in inferior/lateral leads
  hcm: {
    duration: 104,
    pulses: [pulse(13, 6, [-0.5, -0.5, 0.7], 0.7), pulse(32, 9, [0.4, -0.5, -0.75], 0.85), pulse(52, 11, [0.85, 0.5, -0.3], 2.1), pulse(76, 10, [-0.1, 0.8, 0.5], 0.55)],
    t: NORMAL_T,
    conduction: 'normal',
  },

  // RVH (e.g. mitral stenosis with pulmonary hypertension): right axis deviation, dominant R in V1
  rvh: {
    duration: 96,
    pulses: [SEPTAL, pulse(30, 9, [0.0, -0.65, -0.75], 0.75), pulse(50, 11, [-0.55, -0.7, -0.45], 0.95), pulse(52, 10, [0.8, 0.45, -0.35], 0.55), pulse(74, 9, [-0.3, 0.7, 0.5], 0.35)],
    t: { dir: [0.55, 0.45, -0.6], mag: 0.28 },
    conduction: 'normal',
  },

  // Biventricular hypertrophy (VSD): large biphasic RS complexes in V2–V4 (Katz-Wachtel)
  bvh: {
    duration: 100,
    pulses: [SEPTAL, pulse(30, 9, [0.2, -0.85, -0.5], 1.5), pulse(52, 11, [0.85, 0.5, -0.3], 2.0), pulse(74, 10, [-0.2, 0.8, 0.5], 0.55)],
    t: NORMAL_T,
    conduction: 'normal',
  },

  // Acute PE: S1Q3 pattern with incomplete RBBB
  'pe-s1q3': {
    duration: 112,
    pulses: [pulse(12, 6, [0.3, -0.6, 0.75], 0.24), pulse(32, 9, [0.25, -0.55, -0.8], 0.8), pulse(50, 10, [0.85, 0.4, -0.45], 0.95), pulse(90, 11, [-0.78, -0.55, 0.2], 0.55)],
    t: NORMAL_T,
    conduction: 'normal',
  },

  // Evolving anterior MI: loss of anterior forces (Q / poor R progression V1–V3)
  'anterior-mi': {
    duration: 94,
    pulses: [pulse(12, 6, [-0.2, 0.4, 0.2], 0.1), pulse(30, 9, [0.5, -0.3, -0.8], 0.45), pulse(48, 10, [0.88, 0.5, -0.35], 1.2), pulse(70, 9, [-0.2, 0.75, 0.55], 0.45)],
    t: NORMAL_T,
    conduction: 'normal',
  },

  // WPW (left lateral accessory pathway): delta wave → short PR, slurred upstroke, QRS ~120 ms, secondary ST-T change
  wpw: {
    duration: 126,
    pulses: [pulse(24, 15, [-0.55, -0.72, -0.4], 0.5), pulse(52, 10, [0.4, -0.55, -0.75], 0.75), pulse(72, 10, [0.85, 0.45, -0.35], 1.0), pulse(94, 9, [-0.2, 0.75, 0.55], 0.35)],
    t: { dir: [0.75, 0.55, -0.1], mag: 0.22 },
    conduction: 'preexcited',
  },

  // DCM / HFrEF: LBBB-type intraventricular conduction delay
  ivcd: {
    duration: 150,
    pulses: [pulse(26, 14, [0.65, 0.35, -0.45], 0.42), pulse(64, 17, [0.85, 0.5, -0.15], 1.0), pulse(106, 15, [0.72, 0.65, 0.1], 0.75)],
    t: { dir: [-0.75, -0.5, 0.25], mag: 0.32 },
    st: scale(norm([-0.72, -0.55, 0.2]), 0.09),
    conduction: 'lbbb',
  },

  // PVC from the RV outflow tract: LBBB-like morphology, inferior axis, no preceding P
  pvc: {
    duration: 155,
    pulses: [pulse(45, 22, [0.25, 0.55, -0.85], 1.6), pulse(102, 18, [0.4, 0.6, -0.4], 0.6)],
    t: { dir: [-0.25, -0.5, 0.8], mag: 0.55 },
    conduction: 'ectopic',
  },

  // Scar-related monomorphic VT from the LV: RBBB-like, superior axis, very wide
  vt: {
    duration: 175,
    pulses: [pulse(52, 26, [-0.45, -0.55, 0.7], 1.6), pulse(118, 22, [-0.3, -0.5, 0.6], 0.7)],
    t: { dir: [0.45, 0.55, -0.7], mag: 0.45 },
    conduction: 'ectopic',
  },

  // Ventricular escape (complete heart block with infranodal escape)
  escape: {
    duration: 145,
    pulses: [pulse(48, 22, [0.6, 0.5, -0.5], 1.25), pulse(104, 18, [0.6, 0.4, -0.3], 0.5)],
    t: { dir: [-0.6, -0.45, 0.45], mag: 0.4 },
    conduction: 'ectopic',
  },

  // RV apical pacing: pacing spike, then LBBB-like QRS with left axis deviation
  paced: {
    duration: 160,
    pulses: [pulse(55, 24, [0.35, 0.55, 0.75], 1.4), pulse(115, 20, [0.4, 0.5, 0.5], 0.5)],
    t: { dir: [-0.35, -0.5, -0.75], mag: 0.42 },
    conduction: 'paced',
  },

  // Torsades: polymorphic, axis rotates beat to beat (rotation applied by the scheduler)
  torsades: {
    duration: 180,
    pulses: [pulse(60, 34, [0.3, 0.2, -0.93], 1.5)],
    t: { dir: [-0.3, -0.2, 0.93], mag: 0.25 },
    conduction: 'ectopic',
  },
};

// ─── T-wave shape helpers ──────────────────────────────────────────────────

export interface TWaveSpec {
  dir: Vec3;
  mag: number;
  /** rise sigma as fraction of QT (default 0.14) */
  rise?: number;
  /** fall sigma as fraction of QT (default 0.085) */
  fall?: number;
}

// ─── Hemodynamic profile hooks (consumed by physiology/hemodynamics) ───────

export type HemoProfile =
  | 'normal'
  | 'aortic-stenosis'
  | 'mitral-regurgitation'
  | 'mitral-stenosis'
  | 'hfref'
  | 'hfpef'
  | 'hcm'
  | 'shock'
  | 'tamponade'
  | 'pe'
  | 'stemi'
  | 'no-output';

// ─── ECG profiles ──────────────────────────────────────────────────────────

export interface ECGProfile {
  id: string;
  name: string;
  rhythm: RhythmKind;
  rateControl: RateControl;
  defaultHR: number;
  minHR: number;
  maxHR: number;
  /** PR interval in ms (P onset → QRS onset) for conducted beats */
  pr: number;
  p: keyof typeof P_TEMPLATES | 'none';
  qrs: keyof typeof QRS_TEMPLATES;
  qrsScale?: number;
  /** Override T wave (otherwise template default) */
  t?: TWaveSpec;
  /** ST injury vector in mV (points toward the injured territory) */
  injury?: Vec3;
  /** Atrial injury current (PR-segment depression in pericarditis) */
  prSegment?: Vec3;
  /** Corrected QT (Fridericia), ms */
  qtc: number;
  /** Beat-to-beat QRS amplitude alternation fraction (tamponade) */
  alternans?: number;
  /** Widen QRS by this factor (hyperkalaemia) */
  qrsWiden?: number;
  hemo: HemoProfile;
  /** Short interpretation headline */
  headline: string;
  /** Key ECG findings to teach (shown in the ECG interpretation box) */
  findings: string[];
  /** Leads to highlight when this profile is active */
  keyLeads?: string[];
}

const STD = { minHR: 30, maxHR: 180 };

export const ECG_PROFILES: Record<string, ECGProfile> = {
  'normal-sinus': {
    id: 'normal-sinus', name: 'Normal Sinus Rhythm', rhythm: 'sinus', rateControl: 'sinus', defaultHR: 72, ...STD,
    pr: 160, p: 'normal', qrs: 'normal', qtc: 410, hemo: 'normal',
    headline: 'Normal sinus rhythm',
    findings: ['Rate 60–100 bpm, regular', 'Upright P before every QRS in I, II, aVF; inverted in aVR', 'PR 120–200 ms, QRS < 120 ms (typically 80–100 ms)', 'QTc < 450 ms (men) / < 460 ms (women)', 'Normal axis −30° to +90°; R-wave transition V3–V4'],
  },
  'sinus-bradycardia': {
    id: 'sinus-bradycardia', name: 'Sinus Bradycardia', rhythm: 'sinus', rateControl: 'sinus', defaultHR: 46, minHR: 25, maxHR: 59,
    pr: 170, p: 'normal', qrs: 'normal', qtc: 410, hemo: 'normal',
    headline: 'Sinus bradycardia',
    findings: ['Sinus P waves, 1:1 conduction, rate < 60 bpm', 'Normal PR and QRS', 'Often physiologic (athletes, sleep); consider drugs, hypothyroidism, raised ICP, inferior MI'],
  },
  'sinus-tachycardia': {
    id: 'sinus-tachycardia', name: 'Sinus Tachycardia', rhythm: 'sinus', rateControl: 'sinus', defaultHR: 122, minHR: 101, maxHR: 180,
    pr: 140, p: 'normal', qrs: 'normal', qtc: 420, hemo: 'normal',
    headline: 'Sinus tachycardia',
    findings: ['Sinus P waves, rate > 100 bpm (rarely > 220 − age)', 'P waves may merge with preceding T at high rates', 'Gradual onset/offset — look for the cause (pain, fever, hypovolaemia, PE, sepsis)'],
  },
  'atrial-fibrillation': {
    id: 'atrial-fibrillation', name: 'Atrial Fibrillation', rhythm: 'af', rateControl: 'ventricular', defaultHR: 112, minHR: 50, maxHR: 180,
    pr: 0, p: 'none', qrs: 'normal', qtc: 420, hemo: 'normal',
    headline: 'Atrial fibrillation with rapid ventricular response',
    findings: ['Irregularly irregular RR intervals', 'No organised P waves; fibrillatory (f) waves 350–600/min, best seen in V1', 'Narrow QRS unless aberrancy or pre-excitation', 'Beat-to-beat pulse volume varies → pulse deficit at fast rates'],
    keyLeads: ['V1', 'II'],
  },
  'atrial-flutter': {
    id: 'atrial-flutter', name: 'Atrial Flutter', rhythm: 'flutter', rateControl: 'ventricular', defaultHR: 150, minHR: 75, maxHR: 150,
    pr: 0, p: 'none', qrs: 'normal', qtc: 420, hemo: 'normal',
    headline: 'Typical atrial flutter',
    findings: ['Flutter waves ~300/min: negative "sawtooth" in II, III, aVF; positive in V1', 'Fixed 2:1 conduction gives a ventricular rate of ~150 bpm', 'Isoelectric baseline absent in inferior leads', 'Cavotricuspid isthmus-dependent macro-reentry in the RA'],
    keyLeads: ['II', 'III', 'aVF', 'V1'],
  },
  avnrt: {
    id: 'avnrt', name: 'AVNRT (SVT)', rhythm: 'svt', rateControl: 'ventricular', defaultHR: 180, minHR: 140, maxHR: 240,
    pr: 0, p: 'retrograde', qrs: 'normal', qtc: 420, hemo: 'normal',
    headline: 'Regular narrow-complex tachycardia (AVNRT)',
    findings: ['Regular narrow-complex tachycardia 140–250 bpm', 'No visible P before QRS; retrograde P buried in or just after the QRS', 'Pseudo-r′ in V1 and pseudo-S in II, III, aVF', 'Abrupt onset/offset; terminates with vagal manoeuvres or adenosine'],
    keyLeads: ['V1', 'II'],
  },
  wpw: {
    id: 'wpw', name: 'WPW Pattern', rhythm: 'sinus', rateControl: 'sinus', defaultHR: 74, ...STD,
    pr: 100, p: 'normal', qrs: 'wpw', qtc: 420, hemo: 'normal',
    headline: 'Ventricular pre-excitation (Wolff-Parkinson-White)',
    findings: ['Short PR < 120 ms', 'Delta wave: slurred initial QRS upstroke', 'Wide QRS (> 110–120 ms) with secondary ST-T changes', 'Left lateral pathway shown: positive delta in V1, negative in I/aVL (pseudo-infarct)', 'Never give AV-nodal blockers for pre-excited AF'],
    keyLeads: ['V1', 'I', 'aVL'],
  },
  junctional: {
    id: 'junctional', name: 'Junctional Rhythm', rhythm: 'junctional', rateControl: 'ventricular', defaultHR: 48, minHR: 35, maxHR: 120,
    pr: 0, p: 'retrograde', qrs: 'normal', qtc: 410, hemo: 'normal',
    headline: 'Junctional escape rhythm',
    findings: ['Regular narrow QRS at 40–60 bpm (accelerated 60–100, tachycardia > 100)', 'P waves absent or retrograde: inverted in II, III, aVF', 'Retrograde P may precede (PR < 120 ms), hide in, or follow the QRS'],
    keyLeads: ['II', 'III', 'aVF'],
  },
  'first-degree-avb': {
    id: 'first-degree-avb', name: '1st-Degree AV Block', rhythm: 'sinus', rateControl: 'sinus', defaultHR: 68, ...STD,
    pr: 290, p: 'normal', qrs: 'normal', qtc: 410, hemo: 'normal',
    headline: 'Sinus rhythm with first-degree AV block',
    findings: ['Every P conducts, but PR > 200 ms (constant)', 'Delay is usually within the AV node', 'Usually benign; check drugs (beta-blockers, CCBs, digoxin)'],
    keyLeads: ['II'],
  },
  'mobitz-i': {
    id: 'mobitz-i', name: '2nd-Degree AV Block, Mobitz I', rhythm: 'wenckebach', rateControl: 'sinus', defaultHR: 80, minHR: 50, maxHR: 120,
    pr: 180, p: 'normal', qrs: 'normal', qtc: 410, hemo: 'normal',
    headline: 'Second-degree AV block, Mobitz I (Wenckebach) — 4:3',
    findings: ['PR progressively lengthens until a P wave is not conducted', 'RR intervals shorten before the dropped beat; grouped beating', 'The pause is less than two PP intervals', 'Usually AV-nodal; often benign (inferior MI, vagal tone, drugs)'],
    keyLeads: ['II'],
  },
  'mobitz-ii': {
    id: 'mobitz-ii', name: '2nd-Degree AV Block, Mobitz II', rhythm: 'mobitz2', rateControl: 'sinus', defaultHR: 80, minHR: 50, maxHR: 120,
    pr: 170, p: 'normal', qrs: 'rbbb', qtc: 420, hemo: 'normal',
    headline: 'Second-degree AV block, Mobitz II — 4:3, with RBBB',
    findings: ['Constant PR in conducted beats, then a sudden non-conducted P', 'Block is infranodal (His–Purkinje) — QRS often wide', 'High risk of progression to complete heart block — pacing pads on, plan for pacing'],
    keyLeads: ['II', 'V1'],
  },
  'third-degree-avb': {
    id: 'third-degree-avb', name: '3rd-Degree (Complete) AV Block', rhythm: 'chb', rateControl: 'ventricular', defaultHR: 36, minHR: 20, maxHR: 60,
    pr: 0, p: 'normal', qrs: 'escape', qtc: 440, hemo: 'normal',
    headline: 'Complete heart block with ventricular escape',
    findings: ['P waves march through at their own rate (~75/min); QRS at a slower, regular escape rate', 'No relationship between P and QRS (AV dissociation), atrial rate > ventricular rate', 'Wide escape = infranodal, unreliable (20–40 bpm); narrow = junctional (40–60 bpm)', 'Watch the 3D view: atria and ventricles contract independently ("cannon A waves")'],
    keyLeads: ['II'],
  },
  rbbb: {
    id: 'rbbb', name: 'Right Bundle Branch Block', rhythm: 'sinus', rateControl: 'sinus', defaultHR: 72, ...STD,
    pr: 160, p: 'normal', qrs: 'rbbb', qtc: 420, hemo: 'normal',
    headline: 'Sinus rhythm with right bundle branch block',
    findings: ['QRS ≥ 120 ms', 'rsR′ ("M") in V1–V2', 'Wide, slurred S wave in I, aVL, V5–V6', 'Secondary T inversion in V1–V3 is expected'],
    keyLeads: ['V1', 'V6', 'I'],
  },
  lbbb: {
    id: 'lbbb', name: 'Left Bundle Branch Block', rhythm: 'sinus', rateControl: 'sinus', defaultHR: 72, ...STD,
    pr: 170, p: 'normal', qrs: 'lbbb', qtc: 430, hemo: 'normal',
    headline: 'Sinus rhythm with left bundle branch block',
    findings: ['QRS ≥ 120 ms (often ≥ 140 ms)', 'Broad, notched/slurred R in I, aVL, V5–V6; no septal q waves', 'Deep QS or rS in V1–V3', 'ST-T discordant to the QRS (appropriate discordance)', 'Use Sgarbossa / Smith-modified Sgarbossa to look for MI'],
    keyLeads: ['V1', 'V6', 'I', 'aVL'],
  },
  bifascicular: {
    id: 'bifascicular', name: 'Bifascicular Block (RBBB + LAFB)', rhythm: 'sinus', rateControl: 'sinus', defaultHR: 70, ...STD,
    pr: 180, p: 'normal', qrs: 'rbbb-lafb', qtc: 430, hemo: 'normal',
    headline: 'RBBB with left anterior fascicular block',
    findings: ['RBBB: QRS ≥ 120 ms, rsR′ in V1, wide S in I/V6', 'LAFB: left axis deviation (−45° to −90°), rS in II, III, aVF; qR in aVL', 'Only one fascicle left: syncope warrants evaluation for intermittent CHB'],
    keyLeads: ['V1', 'II', 'aVL'],
  },
  pvcs: {
    id: 'pvcs', name: 'Premature Ventricular Contractions', rhythm: 'pvc', rateControl: 'sinus', defaultHR: 76, ...STD,
    pr: 160, p: 'normal', qrs: 'normal', qtc: 420, hemo: 'normal',
    headline: 'Sinus rhythm with PVCs (every 4th beat — quadrigeminy)',
    findings: ['Early, wide (> 120 ms), bizarre QRS without a preceding P wave', 'T wave opposite in direction to the PVC\'s QRS', 'Full compensatory pause: sinus P continues on schedule but is blocked', 'RVOT origin shown (LBBB morphology, inferior axis)'],
    keyLeads: ['II', 'V1'],
  },
  vt: {
    id: 'vt', name: 'Monomorphic Ventricular Tachycardia', rhythm: 'vt', rateControl: 'ventricular', defaultHR: 170, minHR: 120, maxHR: 250,
    pr: 0, p: 'normal', qrs: 'vt', qtc: 440, hemo: 'shock',
    headline: 'Monomorphic ventricular tachycardia',
    findings: ['Regular wide-complex tachycardia (QRS often > 140–160 ms)', 'AV dissociation: sinus P waves march independently through the tachycardia', 'Fusion and capture beats are diagnostic', 'Extreme ("northwest") axis and precordial concordance favour VT', 'Treat any wide-complex tachycardia as VT until proven otherwise'],
    keyLeads: ['V1', 'II', 'aVR'],
  },
  vf: {
    id: 'vf', name: 'Ventricular Fibrillation', rhythm: 'vf', rateControl: 'none', defaultHR: 0, minHR: 0, maxHR: 0,
    pr: 0, p: 'none', qrs: 'normal', qtc: 400, hemo: 'no-output',
    headline: 'Ventricular fibrillation — cardiac arrest',
    findings: ['Chaotic, irregular deflections of varying amplitude and form', 'No identifiable P waves, QRS complexes or T waves', 'No cardiac output: start CPR and defibrillate immediately', 'Coarse VF becomes fine VF over minutes without perfusion'],
  },
  torsades: {
    id: 'torsades', name: 'Torsades de Pointes', rhythm: 'torsades', rateControl: 'ventricular', defaultHR: 230, minHR: 160, maxHR: 280,
    pr: 0, p: 'none', qrs: 'torsades', qtc: 560, hemo: 'no-output',
    headline: 'Torsades de pointes (polymorphic VT with long QT)',
    findings: ['Polymorphic VT: QRS axis "twists" around the baseline', 'Amplitude waxes and wanes over 5–20 beats', 'Arises on a prolonged QTc (often after a pause: short-long-short)', 'Treat with IV magnesium; defibrillate if pulseless'],
  },
  asystole: {
    id: 'asystole', name: 'Asystole', rhythm: 'asystole', rateControl: 'none', defaultHR: 0, minHR: 0, maxHR: 0,
    pr: 0, p: 'none', qrs: 'normal', qtc: 400, hemo: 'no-output',
    headline: 'Asystole',
    findings: ['No electrical activity — confirm in a second lead and check gain/leads', 'Non-shockable: CPR, epinephrine, treat reversible causes (Hs & Ts)'],
  },
  'anterior-stemi': {
    id: 'anterior-stemi', name: 'Anterior STEMI', rhythm: 'sinus', rateControl: 'sinus', defaultHR: 92, ...STD,
    pr: 160, p: 'normal', qrs: 'anterior-mi', qtc: 430, hemo: 'stemi',
    injury: scale(norm([0.25, -0.92, 0.22]), 0.24),
    t: { dir: [0.4, -0.75, -0.35], mag: 0.62, rise: 0.12, fall: 0.08 },
    headline: 'Anterior STEMI — proximal LAD occlusion',
    findings: ['ST elevation in V1–V4 (± I, aVL with proximal LAD)', 'Hyperacute, broad-based T waves', 'Loss of R waves / developing Q waves in V1–V3', 'Reciprocal ST depression in III and aVF', 'STE criteria: ≥ 1 mm in 2 contiguous leads (V2–V3: ≥ 2 mm men ≥ 40 y, ≥ 2.5 mm < 40 y, ≥ 1.5 mm women)'],
    keyLeads: ['V1', 'V2', 'V3', 'V4', 'III', 'aVF'],
  },
  'inferior-stemi': {
    id: 'inferior-stemi', name: 'Inferior STEMI', rhythm: 'sinus', rateControl: 'sinus', defaultHR: 64, ...STD,
    pr: 180, p: 'normal', qrs: 'normal', qtc: 420, hemo: 'stemi',
    injury: scale(norm([-0.32, 0.18, -0.93]), 0.22),
    t: { dir: [0.05, -0.15, -0.98], mag: 0.5, rise: 0.12, fall: 0.08 },
    headline: 'Inferior STEMI — RCA occlusion',
    findings: ['ST elevation in II, III, aVF with STE III > II (favours RCA)', 'Reciprocal ST depression in aVL (often the earliest sign) and I', 'ST depression V1–V3 suggests posterior extension', 'Record V4R: STE ≥ 1 mm = RV infarction (avoid nitrates, give fluids)', 'Watch for bradycardia and AV block (AV nodal artery)'],
    keyLeads: ['II', 'III', 'aVF', 'aVL', 'I'],
  },
  'lateral-stemi': {
    id: 'lateral-stemi', name: 'Lateral STEMI', rhythm: 'sinus', rateControl: 'sinus', defaultHR: 84, ...STD,
    pr: 160, p: 'normal', qrs: 'normal', qtc: 420, hemo: 'stemi',
    injury: scale(norm([0.92, 0.25, 0.3]), 0.19),
    t: { dir: [0.92, -0.1, -0.25], mag: 0.45, rise: 0.12, fall: 0.08 },
    headline: 'Lateral STEMI — LCx or diagonal occlusion',
    findings: ['ST elevation in I, aVL, V5–V6', 'Reciprocal ST depression in III and aVF', 'High lateral (I, aVL ± V2) pattern suggests first diagonal', 'LCx occlusions are often electrically "silent" — get posterior leads V7–V9'],
    keyLeads: ['I', 'aVL', 'V5', 'V6', 'III'],
  },
  nstemi: {
    id: 'nstemi', name: 'NSTEMI / Subendocardial Ischaemia', rhythm: 'sinus', rateControl: 'sinus', defaultHR: 88, ...STD,
    pr: 160, p: 'normal', qrs: 'normal', qtc: 430, hemo: 'normal',
    injury: scale(norm([-0.62, 0.05, 0.6]), 0.14),
    t: { dir: [-0.5, -0.35, 0.45], mag: 0.22 },
    headline: 'Diffuse ST depression with ST elevation in aVR',
    findings: ['Horizontal/downsloping ST depression ≥ 0.5 mm in I, II, V4–V6', 'ST elevation in aVR from diffuse subendocardial ischaemia (consider left main / 3-vessel disease)', 'T-wave inversion in lateral leads', 'ECG may be normal — diagnosis relies on serial high-sensitivity troponin'],
    keyLeads: ['aVR', 'V4', 'V5', 'V6', 'II'],
  },
  wellens: {
    id: 'wellens', name: 'Wellens Pattern', rhythm: 'sinus', rateControl: 'sinus', defaultHR: 70, ...STD,
    pr: 160, p: 'normal', qrs: 'normal', qtc: 440, hemo: 'normal',
    t: { dir: [0.25, 0.92, -0.1], mag: 0.42, rise: 0.11, fall: 0.11 },
    headline: 'Wellens type B — deep symmetric T inversion V2–V3',
    findings: ['Deep, symmetric T-wave inversion (type B) or biphasic T (type A) in V2–V3', 'Recorded in a pain-free interval; minimal or no ST elevation', 'Preserved R waves, no pathological Q waves', 'Indicates critical PROXIMAL LAD stenosis — urgent angiography, no stress test'],
    keyLeads: ['V2', 'V3', 'V1', 'V4'],
  },
  dcm: {
    id: 'dcm', name: 'Dilated Cardiomyopathy', rhythm: 'sinus', rateControl: 'sinus', defaultHR: 96, ...STD,
    pr: 190, p: 'mitrale', qrs: 'ivcd', qrsScale: 0.8, qtc: 450, hemo: 'hfref',
    headline: 'Sinus tachycardia, LAE, LBBB-type conduction delay',
    findings: ['Left atrial enlargement (broad notched P in II, deep terminal P in V1)', 'Wide QRS / LBBB pattern from intraventricular conduction delay', 'Poor R-wave progression; frequent ectopy and AF are common'],
  },
  hcm: {
    id: 'hcm', name: 'Hypertrophic Cardiomyopathy', rhythm: 'sinus', rateControl: 'sinus', defaultHR: 66, ...STD,
    pr: 160, p: 'mitrale', qrs: 'hcm', qtc: 440, hemo: 'hcm',
    t: { dir: [-0.72, -0.45, 0.45], mag: 0.32 },
    injury: scale(norm([-0.6, -0.3, 0.3]), 0.08),
    headline: 'LVH with "dagger" Q waves and repolarisation abnormality',
    findings: ['Marked LVH voltage', 'Deep, narrow ("dagger") Q waves in inferior and lateral leads (septal hypertrophy)', 'Lateral ST depression and T inversion (apical HCM: giant T inversions V2–V5)', 'Left atrial enlargement'],
    keyLeads: ['II', 'III', 'aVF', 'I', 'aVL', 'V5', 'V6'],
  },
  takotsubo: {
    id: 'takotsubo', name: 'Takotsubo Cardiomyopathy', rhythm: 'sinus', rateControl: 'sinus', defaultHR: 98, ...STD,
    pr: 150, p: 'normal', qrs: 'normal', qtc: 480, hemo: 'hfref',
    injury: scale(norm([0.45, -0.85, -0.25]), 0.16),
    headline: 'Anterior ST elevation without reciprocal inferior change',
    findings: ['ST elevation in V2–V5 (± inferior leads) mimicking anterior STEMI', 'Usually NO reciprocal inferior ST depression; ST depression in aVR', 'Evolves to deep, widespread T inversion with QT prolongation', 'Cannot be distinguished from STEMI by ECG — needs angiography'],
    keyLeads: ['V2', 'V3', 'V4', 'V5', 'aVR'],
  },
  hfref: {
    id: 'hfref', name: 'HFrEF', rhythm: 'sinus', rateControl: 'sinus', defaultHR: 92, ...STD,
    pr: 200, p: 'mitrale', qrs: 'ivcd', qtc: 460, hemo: 'hfref',
    headline: 'Sinus rhythm, LAE, LBBB-pattern QRS',
    findings: ['LBBB with QRS ≥ 150 ms identifies CRT candidates (LVEF ≤ 35%)', 'Left atrial enlargement', 'Q waves if ischaemic cardiomyopathy; AF common'],
  },
  hfpef: {
    id: 'hfpef', name: 'HFpEF', rhythm: 'sinus', rateControl: 'sinus', defaultHR: 78, ...STD,
    pr: 180, p: 'mitrale', qrs: 'lvh', qtc: 440, hemo: 'hfpef',
    t: { dir: [-0.6, -0.35, 0.5], mag: 0.22 },
    headline: 'LVH with strain and left atrial enlargement',
    findings: ['LVH voltage (Sokolow-Lyon S V1 + R V5/V6 ≥ 35 mm)', 'Lateral ST depression / T inversion ("strain")', 'P mitrale from a stiff LV and high filling pressure; AF is common'],
    keyLeads: ['V1', 'V5', 'V6'],
  },
  'cardiogenic-shock': {
    id: 'cardiogenic-shock', name: 'Cardiogenic Shock (Anterior MI)', rhythm: 'sinus', rateControl: 'sinus', defaultHR: 118, ...STD,
    pr: 150, p: 'normal', qrs: 'anterior-mi', qrsScale: 0.85, qtc: 450, hemo: 'shock',
    injury: scale(norm([0.25, -0.92, 0.22]), 0.2),
    headline: 'Sinus tachycardia with evolving anterior STEMI',
    findings: ['Sinus tachycardia (compensatory)', 'Anterior ST elevation with Q waves — large territory infarction', 'Most cardiogenic shock is caused by acute MI: emergent revascularisation'],
    keyLeads: ['V1', 'V2', 'V3', 'V4'],
  },
  'aortic-stenosis': {
    id: 'aortic-stenosis', name: 'Aortic Stenosis', rhythm: 'sinus', rateControl: 'sinus', defaultHR: 70, ...STD,
    pr: 180, p: 'mitrale', qrs: 'lvh', qtc: 440, hemo: 'aortic-stenosis',
    t: { dir: [-0.75, -0.4, 0.45], mag: 0.3 },
    injury: scale(norm([-0.6, -0.3, 0.3]), 0.09),
    headline: 'LVH with strain pattern',
    findings: ['LVH voltage criteria', 'Strain: downsloping ST depression with asymmetric T inversion in I, aVL, V5–V6', 'LAE; conduction disease (calcification can extend into the His bundle)'],
    keyLeads: ['V1', 'V5', 'V6', 'I', 'aVL'],
  },
  'mitral-regurgitation': {
    id: 'mitral-regurgitation', name: 'Mitral Regurgitation', rhythm: 'sinus', rateControl: 'sinus', defaultHR: 84, ...STD,
    pr: 180, p: 'mitrale', qrs: 'lvh', qrsScale: 0.85, qtc: 430, hemo: 'mitral-regurgitation',
    headline: 'Left atrial enlargement ± LVH',
    findings: ['P mitrale: P ≥ 120 ms, notched in II; terminal negative P in V1 ≥ 1 mm × 40 ms', 'LV volume overload may show LVH voltage', 'Atrial fibrillation develops frequently'],
    keyLeads: ['II', 'V1'],
  },
  'mitral-stenosis': {
    id: 'mitral-stenosis', name: 'Mitral Stenosis', rhythm: 'sinus', rateControl: 'sinus', defaultHR: 96, ...STD,
    pr: 180, p: 'mitrale', qrs: 'rvh', qtc: 430, hemo: 'mitral-stenosis',
    headline: 'P mitrale with right ventricular hypertrophy',
    findings: ['Marked left atrial enlargement (P mitrale)', 'Right axis deviation and dominant R in V1 from pulmonary hypertension → RVH', 'Atrial fibrillation is very common; tachycardia shortens diastole and raises LA pressure'],
    keyLeads: ['II', 'V1'],
  },
  pericarditis: {
    id: 'pericarditis', name: 'Acute Pericarditis', rhythm: 'sinus', rateControl: 'sinus', defaultHR: 104, ...STD,
    pr: 150, p: 'normal', qrs: 'normal', qtc: 420, hemo: 'normal',
    injury: scale(norm([0.45, -0.4, -0.8]), 0.14),
    prSegment: scale(norm([0.5, -0.3, -0.8]), -0.07),
    headline: 'Diffuse concave ST elevation with PR depression',
    findings: ['Widespread concave ("saddle") ST elevation across territories (I, II, aVF, V2–V6)', 'PR depression in II and the precordial leads; PR elevation and ST depression in aVR', 'No reciprocal ST depression except aVR (± V1)', 'Spodick sign: downsloping TP segment'],
    keyLeads: ['II', 'aVR', 'V5', 'V6'],
  },
  tamponade: {
    id: 'tamponade', name: 'Cardiac Tamponade', rhythm: 'sinus', rateControl: 'sinus', defaultHR: 118, ...STD,
    pr: 150, p: 'normal', qrs: 'normal', qrsScale: 0.42, qtc: 420, alternans: 0.35, hemo: 'tamponade',
    t: { dir: [0.62, -0.25, -0.65], mag: 0.16 },
    headline: 'Sinus tachycardia, low voltage, electrical alternans',
    findings: ['Sinus tachycardia', 'Low QRS voltage (< 5 mm in all limb leads, < 10 mm in precordials)', 'Electrical alternans: QRS amplitude alternates beat to beat as the heart swings in the effusion', 'Clinical: Beck\'s triad, pulsus paradoxus > 10 mmHg'],
    keyLeads: ['II', 'V3', 'V4'],
  },
  asd: {
    id: 'asd', name: 'Atrial Septal Defect (Secundum)', rhythm: 'sinus', rateControl: 'sinus', defaultHR: 76, ...STD,
    pr: 180, p: 'normal', qrs: 'incomplete-rbbb', qtc: 420, hemo: 'normal',
    headline: 'Incomplete RBBB with rightward axis',
    findings: ['rSr′ in V1 (incomplete RBBB) from RV volume overload', 'Right axis deviation in secundum ASD (left axis suggests primum ASD)', '"Crochetage" notch on R wave in inferior leads', 'Possible first-degree AV block and atrial arrhythmias in adults'],
    keyLeads: ['V1', 'II'],
  },
  vsd: {
    id: 'vsd', name: 'Ventricular Septal Defect', rhythm: 'sinus', rateControl: 'sinus', defaultHR: 84, ...STD,
    pr: 160, p: 'mitrale', qrs: 'bvh', qtc: 420, hemo: 'normal',
    headline: 'Biventricular hypertrophy (Katz-Wachtel)',
    findings: ['Small VSD: normal ECG', 'Moderate/large VSD: LAE and LVH from LV volume overload', 'Large biphasic RS complexes in V2–V4 (Katz-Wachtel) = biventricular hypertrophy', 'RVH dominates if pulmonary hypertension/Eisenmenger develops'],
    keyLeads: ['V2', 'V3', 'V4'],
  },
  pfo: {
    id: 'pfo', name: 'Patent Foramen Ovale', rhythm: 'sinus', rateControl: 'sinus', defaultHR: 72, ...STD,
    pr: 160, p: 'normal', qrs: 'normal', qtc: 410, hemo: 'normal',
    headline: 'Normal ECG',
    findings: ['PFO does not change the ECG', 'Diagnosis is by bubble-contrast echocardiography (TTE/TEE) or TCD'],
  },
  'pulmonary-embolism': {
    id: 'pulmonary-embolism', name: 'Acute Pulmonary Embolism', rhythm: 'sinus', rateControl: 'sinus', defaultHR: 114, ...STD,
    pr: 150, p: 'pulmonale', qrs: 'pe-s1q3', qtc: 430, hemo: 'pe',
    t: { dir: [0.6, 0.65, 0.3], mag: 0.24 },
    headline: 'Sinus tachycardia, S1Q3T3, RV strain',
    findings: ['Sinus tachycardia is the most common finding', 'RV strain: T inversion in V1–V4 and III', 'S1Q3T3 (S in I, Q and inverted T in III) — classic but insensitive', 'Incomplete/complete RBBB and right axis deviation; P pulmonale', 'A normal ECG does not exclude PE'],
    keyLeads: ['I', 'III', 'V1', 'V2', 'V3'],
  },
  'aortic-dissection': {
    id: 'aortic-dissection', name: 'Acute Aortic Dissection', rhythm: 'sinus', rateControl: 'sinus', defaultHR: 104, ...STD,
    pr: 160, p: 'normal', qrs: 'lvh', qrsScale: 0.85, qtc: 430, hemo: 'normal',
    t: { dir: [-0.5, -0.3, 0.5], mag: 0.16 },
    headline: 'Sinus tachycardia with LVH (long-standing hypertension)',
    findings: ['ECG is often normal or shows LVH from chronic hypertension', 'A dissection flap can occlude the RCA ostium → inferior STEMI pattern', 'Always consider dissection before giving antithrombotics for "STEMI" with tearing pain'],
  },
  hyperkalemia: {
    id: 'hyperkalemia', name: 'Hyperkalaemia', rhythm: 'sinus', rateControl: 'sinus', defaultHR: 64, ...STD,
    pr: 230, p: 'flat', qrs: 'normal', qrsWiden: 1.45, qtc: 400, hemo: 'normal',
    t: { dir: [0.5, -0.55, -0.65], mag: 0.95, rise: 0.055, fall: 0.05 },
    headline: 'Peaked T waves, flattened P, prolonged PR, wide QRS',
    findings: ['Tall, narrow, symmetric "tented" T waves (earliest sign)', 'PR prolongation and P-wave flattening/loss', 'QRS widening → sine-wave pattern → VF/asystole', 'ECG is insensitive: severe hyperkalaemia can have a near-normal ECG'],
    keyLeads: ['V2', 'V3', 'V4', 'II'],
  },
  paced: {
    id: 'paced', name: 'Ventricular Paced (DDD)', rhythm: 'paced', rateControl: 'sinus', defaultHR: 72, minHR: 50, maxHR: 130,
    pr: 160, p: 'normal', qrs: 'paced', qtc: 460, hemo: 'normal',
    headline: 'Atrial-sensed, ventricular-paced rhythm',
    findings: ['Sinus P waves tracked; pacing spike after a programmed AV delay', 'RV apical pacing: wide QRS with LBBB-like morphology and left axis deviation', 'Discordant ST-T is expected; use Smith-modified Sgarbossa for ischaemia', 'Check capture: every spike should be followed by a QRS'],
    keyLeads: ['II', 'V1'],
  },
};

/** Aliases so older IDs (and condition IDs) still resolve */
export const PROFILE_ALIASES: Record<string, string> = {
  'normal-sinus-rhythm': 'normal-sinus',
  afib: 'atrial-fibrillation',
  aflutter: 'atrial-flutter',
  svt: 'avnrt',
  'monomorphic-vt': 'vt',
  'ventricular-fibrillation': 'vf',
  vfib: 'vf',
  'torsades-de-pointes': 'torsades',
  'cardiac-tamponade': 'tamponade',
  'acute-pericarditis': 'pericarditis',
  'wpw-syndrome': 'wpw',
  'paced-rhythm': 'paced',
  'junctional-rhythm': 'junctional',
  'junctional-escape': 'junctional',
  'paced-rhythm-ddd': 'paced',
  lvh: 'hfpef',
};

export function resolveProfile(id: string | null | undefined): ECGProfile {
  if (!id) return ECG_PROFILES['normal-sinus'];
  const key = ECG_PROFILES[id] ? id : PROFILE_ALIASES[id];
  return (key && ECG_PROFILES[key]) || ECG_PROFILES['normal-sinus'];
}

/** Map each condition (left-panel list) to its ECG profile */
export const CONDITION_TO_PROFILE: Record<string, string> = {
  'normal-sinus-rhythm': 'normal-sinus',
  'sinus-bradycardia': 'sinus-bradycardia',
  'sinus-tachycardia': 'sinus-tachycardia',
  'atrial-fibrillation': 'atrial-fibrillation',
  'atrial-flutter': 'atrial-flutter',
  avnrt: 'avnrt',
  'wpw-syndrome': 'wpw',
  'junctional-rhythm': 'junctional',
  'first-degree-av-block': 'first-degree-avb',
  'mobitz-type-i': 'mobitz-i',
  'mobitz-type-ii': 'mobitz-ii',
  'third-degree-av-block': 'third-degree-avb',
  'right-bundle-branch-block': 'rbbb',
  'left-bundle-branch-block': 'lbbb',
  'bifascicular-block': 'bifascicular',
  pvcs: 'pvcs',
  'monomorphic-vt': 'vt',
  'ventricular-fibrillation': 'vf',
  'torsades-de-pointes': 'torsades',
  'anterior-stemi': 'anterior-stemi',
  'inferior-stemi': 'inferior-stemi',
  'lateral-stemi': 'lateral-stemi',
  nstemi: 'nstemi',
  'wellens-pattern': 'wellens',
  'dilated-cardiomyopathy': 'dcm',
  hcm: 'hcm',
  takotsubo: 'takotsubo',
  hfref: 'hfref',
  hfpef: 'hfpef',
  'cardiogenic-shock': 'cardiogenic-shock',
  'aortic-stenosis': 'aortic-stenosis',
  'mitral-regurgitation': 'mitral-regurgitation',
  'mitral-stenosis': 'mitral-stenosis',
  'acute-pericarditis': 'pericarditis',
  'cardiac-tamponade': 'tamponade',
  asd: 'asd',
  vsd: 'vsd',
  pfo: 'pfo',
  'pulmonary-embolism': 'pulmonary-embolism',
  'aortic-dissection': 'aortic-dissection',
  hyperkalemia: 'hyperkalemia',
  'paced-rhythm': 'paced',
};

/** Fridericia-corrected QT for a given RR (ms) */
export function qtForRR(qtc: number, rrMs: number): number {
  const qt = qtc * Math.cbrt(Math.max(250, rrMs) / 1000);
  return Math.max(220, Math.min(640, qt));
}

/** PR shortens slightly with faster sinus rates */
export function prForRate(basePr: number, hr: number): number {
  if (basePr <= 0) return 0;
  return Math.max(100, basePr - Math.max(0, hr - 75) * 0.25);
}
