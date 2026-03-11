/**
 * Case simulation data with realistic vitals, ECG profiles, guidelines, and teaching points.
 * Each case represents a clinical scenario with initial presentation and management steps.
 */

export interface CaseVitals {
  hr: number;
  bp: string;
  spo2: number;
  rr: number;
  temp?: string;
  etco2?: number;
  gcs?: number;
}

export interface CaseData {
  id: string;
  title: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  ecgProfile: string;           // Maps to waveform engine profile ID
  heartRate: number;            // Initial HR for timeline
  vitals: CaseVitals;
  presentation: string;         // 1-paragraph clinical scenario
  history: string;              // Brief patient history
  physicalExam: string;         // Key exam findings
  guidelines: string[];         // Step-by-step management protocol
  medications: string[];        // Drugs to consider
  keyInterventions: string[];   // Critical actions
  pitfalls: string[];           // Common mistakes
  disposition: string;          // Expected outcome / disposition
  teaching: string[];           // Educational pearls
}

export const CASE_DATA: Record<string, CaseData> = {
  'chest-pain-acs': {
    id: 'chest-pain-acs',
    title: 'Chest Pain / ACS',
    difficulty: 'beginner',
    ecgProfile: 'nstemi',
    heartRate: 88,
    vitals: { hr: 88, bp: '148/92', spo2: 96, rr: 20, temp: '37.0°C' },
    presentation: '62-year-old male presents with substernal chest pressure radiating to left arm for 45 minutes. Diaphoretic and anxious. Pain rated 8/10, not relieved by rest.',
    history: 'HTN, DM2, hyperlipidemia, 30-pack-year smoking history. Father had MI at age 55. Current medications: metformin, lisinopril, atorvastatin.',
    physicalExam: 'Diaphoretic, anxious. Heart: regular rate, no murmurs. Lungs: clear bilateral. No JVD. Equal pulses bilateral. Mild epigastric tenderness.',
    guidelines: [
      '1. Obtain 12-lead ECG within 10 minutes of arrival',
      '2. Establish IV access, place on cardiac monitor, continuous pulse oximetry',
      '3. Aspirin 325mg PO (chewed) if not already given',
      '4. Nitroglycerin 0.4mg SL every 5 min x3 for ongoing pain (hold if SBP <90)',
      '5. Morphine 2-4mg IV for pain refractory to nitroglycerin',
      '6. Obtain troponin, CBC, BMP, coagulation studies, lipid panel',
      '7. If STEMI identified: activate cath lab, target door-to-balloon <90 min',
      '8. If NSTEMI/UA: start heparin, P2Y12 inhibitor, consult cardiology',
      '9. Beta-blocker (metoprolol 25mg PO) if no contraindications',
      '10. Risk stratify with HEART or TIMI score',
    ],
    medications: ['Aspirin 325mg', 'Nitroglycerin 0.4mg SL', 'Heparin IV', 'Ticagrelor 180mg or Clopidogrel 600mg', 'Metoprolol 25mg', 'Morphine 2-4mg IV PRN'],
    keyInterventions: ['Rapid ECG acquisition', 'Aspirin administration', 'Serial troponins', 'Cardiology consultation', 'Anticoagulation'],
    pitfalls: ['Delayed ECG >10 minutes', 'Forgetting aspirin', 'Not checking right-sided leads if inferior ST changes', 'Giving nitroglycerin with RV infarction', 'Not repeating ECG if symptoms change'],
    disposition: 'Admit to telemetry or CCU. Cardiology consult for risk stratification and possible catheterization.',
    teaching: [
      'The HEART score stratifies chest pain patients: History, ECG, Age, Risk factors, Troponin',
      'Time is muscle: every 30 minutes of delay increases mortality in STEMI',
      'Always consider ACS mimics: PE, aortic dissection, pericarditis, esophageal rupture',
      'Serial troponins at 0 and 3 hours with high-sensitivity assays',
    ],
  },

  'stemi-activation': {
    id: 'stemi-activation',
    title: 'STEMI Activation',
    difficulty: 'intermediate',
    ecgProfile: 'anterior-stemi',
    heartRate: 96,
    vitals: { hr: 96, bp: '132/84', spo2: 94, rr: 22, temp: '36.8°C' },
    presentation: '55-year-old male with acute onset crushing chest pain while mowing lawn. Onset 30 minutes ago. Associated nausea, diaphoresis. 12-lead shows ST elevation V1-V4 with reciprocal changes in inferior leads.',
    history: 'Smoker, untreated hypertension, family history of premature CAD. No known cardiac history. No prior medications.',
    physicalExam: 'Diaphoretic, pale, clutching chest. Heart: tachycardic, S4 gallop. Lungs: bibasilar crackles. No JVD. Cool extremities.',
    guidelines: [
      '1. Activate STEMI alert / cath lab team immediately',
      '2. Aspirin 325mg PO (chewed)',
      '3. P2Y12 inhibitor: ticagrelor 180mg or prasugrel 60mg',
      '4. Heparin: unfractionated 60 U/kg bolus (max 4000 U)',
      '5. Nitroglycerin for ongoing pain (avoid if SBP <90 or RV involvement)',
      '6. Target door-to-balloon time <90 minutes',
      '7. If PCI not available within 120 minutes: consider fibrinolysis (TNKase)',
      '8. Prepare for possible complications: VF arrest, cardiogenic shock',
      '9. Have defibrillator pads on patient at all times',
      '10. Post-PCI: CCU admission, DAPT, statin, ACEi, beta-blocker',
    ],
    medications: ['Aspirin 325mg', 'Ticagrelor 180mg', 'Heparin 60 U/kg IV', 'Nitroglycerin 0.4mg SL', 'Atorvastatin 80mg', 'Metoprolol 25mg (post-stabilization)'],
    keyInterventions: ['Immediate cath lab activation', 'Dual antiplatelet therapy', 'Primary PCI', 'Continuous monitoring for arrhythmias'],
    pitfalls: ['Delayed cath lab activation', 'Not recognizing STEMI equivalents (new LBBB, posterior MI)', 'Nitroglycerin in RV infarction', 'Delay for unnecessary testing'],
    disposition: 'Direct to cardiac catheterization lab. Post-PCI admission to CCU for 24-48 hours minimum.',
    teaching: [
      'Door-to-balloon <90 minutes is the quality benchmark for primary PCI',
      'Anterior STEMI from LAD occlusion carries the highest mortality',
      'Check V4R for RV involvement in all inferior STEMIs',
      'STEMI equivalents: de Winter T waves, Wellens syndrome, hyperacute T waves',
    ],
  },

  'unstable-svt': {
    id: 'unstable-svt',
    title: 'Unstable SVT',
    difficulty: 'intermediate',
    ecgProfile: 'avnrt',
    heartRate: 186,
    vitals: { hr: 186, bp: '86/58', spo2: 92, rr: 28, temp: '37.1°C' },
    presentation: '34-year-old female with sudden onset palpitations and lightheadedness. Heart rate 186 bpm, narrow complex regular tachycardia. Becoming altered with hypotension.',
    history: 'History of palpitation episodes, never evaluated. No medications. No cardiac history. Drinks 3-4 cups of coffee daily.',
    physicalExam: 'Anxious, diaphoretic, mildly confused. Heart: very rapid regular rate, no murmurs. Lungs: clear. Hypotensive, thready radial pulse.',
    guidelines: [
      '1. Assess hemodynamic stability: patient is UNSTABLE (hypotension, AMS)',
      '2. Prepare for synchronized cardioversion',
      '3. Sedation: midazolam 2mg IV or etomidate 0.3mg/kg IV',
      '4. Synchronized cardioversion at 50-100J biphasic',
      '5. If stable enough for trial: vagal maneuvers (modified Valsalva)',
      '6. If vagal maneuvers fail and still stable: adenosine 6mg rapid IV push',
      '7. If no response: adenosine 12mg rapid IV push',
      '8. Post-conversion: 12-lead ECG to look for pre-excitation (WPW)',
      '9. Monitor for recurrence',
      '10. Cardiology referral for EP study if recurrent',
    ],
    medications: ['Midazolam 2mg IV (sedation)', 'Adenosine 6mg → 12mg rapid IVP', 'Diltiazem 0.25mg/kg IV (if stable)', 'Normal saline bolus for hypotension'],
    keyInterventions: ['Synchronized cardioversion for unstable patient', 'Adenosine if briefly stable', 'Post-conversion ECG analysis', 'EP referral'],
    pitfalls: ['Delaying cardioversion in unstable patient', 'Slow adenosine push (must be rapid with flush)', 'AV nodal blockers in WPW with AF', 'Unsynchronized shock (can cause VF)'],
    disposition: 'Observe 4-6 hours post-conversion. Refer to cardiology/EP for outpatient evaluation. Consider metoprolol for rate control prophylaxis.',
    teaching: [
      'Unstable = altered mental status, hypotension, chest pain, or signs of shock',
      'Synchronized cardioversion is first-line for unstable narrow complex tachycardia',
      'Always check post-conversion ECG for delta waves (WPW) or other findings',
      'AVNRT is the most common SVT; the reentry circuit involves the AV node',
    ],
  },

  'bradycardia-with-shock': {
    id: 'bradycardia-with-shock',
    title: 'Bradycardia with Shock',
    difficulty: 'advanced',
    ecgProfile: 'third-degree-avb',
    heartRate: 34,
    vitals: { hr: 34, bp: '72/48', spo2: 88, rr: 24, temp: '36.2°C', gcs: 13 },
    presentation: '78-year-old male found by family with confusion and near-syncope. Heart rate 34, hypotensive. ECG shows complete heart block with wide QRS escape rhythm.',
    history: 'Known CAD with prior inferior MI 5 years ago. Medications: metoprolol 50mg BID, digoxin 0.125mg daily, lisinopril 10mg daily.',
    physicalExam: 'Confused, cool and mottled extremities. Heart: slow rate, cannon A waves in JVP, variable S1 intensity. Lungs: bibasilar crackles. Delayed capillary refill.',
    guidelines: [
      '1. ABC assessment, high-flow O2, IV access x2',
      '2. Atropine 1mg IV push (may repeat every 3-5 min, max 3mg)',
      '3. NOTE: Atropine often ineffective in complete heart block (infranodal)',
      '4. If atropine fails: transcutaneous pacing immediately',
      '5. TCP settings: rate 60-80, increase output until capture',
      '6. Sedation/analgesia for conscious pacing (fentanyl 50mcg + midazolam 1mg)',
      '7. Dopamine 5-20 mcg/kg/min OR epinephrine 2-10 mcg/min infusion',
      '8. Hold offending medications (metoprolol, digoxin)',
      '9. Check electrolytes (hyperkalemia can cause heart block)',
      '10. Urgent cardiology consult for transvenous pacing → permanent pacemaker',
    ],
    medications: ['Atropine 1mg IV (up to 3mg)', 'Dopamine 5-20 mcg/kg/min', 'Epinephrine 2-10 mcg/min', 'Fentanyl 50mcg + Midazolam 1mg (for TCP)', 'Calcium gluconate if hyperkalemia'],
    keyInterventions: ['Transcutaneous pacing', 'Hold rate-controlling medications', 'Transvenous pacing placement', 'Permanent pacemaker evaluation'],
    pitfalls: ['Relying on atropine for infranodal block', 'Failure to pace early', 'Not checking medication list for rate-lowering drugs', 'Missing hyperkalemia as cause'],
    disposition: 'ICU admission with transvenous pacing. Permanent pacemaker implantation typically within 24-48 hours.',
    teaching: [
      'Complete heart block: P waves march through at their own rate, QRS at escape rate',
      'Atropine works on the AV node (vagal tone); useless in infranodal block',
      'Transcutaneous pacing is a bridge to transvenous pacing',
      'Common reversible causes: medications (BB, CCB, digoxin), hyperkalemia, ischemia',
    ],
  },

  'vt-storm': {
    id: 'vt-storm',
    title: 'VT Storm',
    difficulty: 'expert',
    ecgProfile: 'vt',
    heartRate: 180,
    vitals: { hr: 180, bp: '78/50', spo2: 85, rr: 30, temp: '36.5°C', gcs: 10 },
    presentation: '65-year-old male with known ischemic cardiomyopathy (EF 20%) presenting with recurrent sustained ventricular tachycardia. Has already received 3 ICD shocks in the past hour. Currently in wide complex tachycardia with hemodynamic compromise.',
    history: 'Prior anterior MI, EF 20%, ICD placed 2 years ago. Medications: amiodarone 200mg daily, carvedilol 25mg BID, sacubitril/valsartan, spironolactone. Recent medication non-compliance.',
    physicalExam: 'Obtunded, diaphoretic. Heart: rapid irregular rhythm. Lungs: bilateral crackles. JVD present. Cool mottled extremities. ICD firing intermittently.',
    guidelines: [
      '1. Immediate synchronized cardioversion if pulseless or severely unstable',
      '2. If pulse present: amiodarone 150mg IV over 10 min, then 1mg/min infusion',
      '3. Lidocaine 1-1.5 mg/kg IV bolus, then 1-4 mg/min infusion (alternative)',
      '4. Correct electrolytes: Mg 2g IV, K+ target >4.0 mEq/L',
      '5. Deep sedation and intubation if recurrent shocks',
      '6. Consider esmolol IV or propranolol for sympathetic storm',
      '7. Stellate ganglion block for refractory VT storm',
      '8. Contact EP for emergent catheter ablation',
      '9. Place magnet over ICD to disable shocks if providing external therapy',
      '10. Consider mechanical circulatory support (Impella/ECMO) if hemodynamically decompensating',
    ],
    medications: ['Amiodarone 150mg IV bolus → 1mg/min', 'Lidocaine 1.5mg/kg → 1-4mg/min', 'Magnesium 2g IV', 'Esmolol 500mcg/kg bolus → 50-200mcg/kg/min', 'Potassium repletion to >4.0'],
    keyInterventions: ['Electrical cardioversion', 'Antiarrhythmic loading', 'Electrolyte optimization', 'Stellate ganglion block', 'Emergent VT ablation'],
    pitfalls: ['Not sedating patient receiving shocks', 'Forgetting electrolyte correction', 'Not considering mechanical support early', 'Missing ischemia as trigger (check troponin)'],
    disposition: 'CCU/ICU with continuous monitoring. EP evaluation for VT ablation. LVAD/transplant evaluation if refractory.',
    teaching: [
      'VT storm = ≥3 sustained VT episodes or ICD shocks within 24 hours',
      'Treat the substrate: correct ischemia, electrolytes, and optimize heart failure',
      'Sympatholysis (beta-blocker, stellate block) is often more effective than antiarrhythmics alone',
      'VT ablation has >70% acute success rate for ischemic VT',
    ],
  },

  'tamponade': {
    id: 'tamponade',
    title: 'Cardiac Tamponade',
    difficulty: 'advanced',
    ecgProfile: 'cardiac-tamponade',
    heartRate: 118,
    vitals: { hr: 118, bp: '88/72', spo2: 93, rr: 26, temp: '37.2°C' },
    presentation: '48-year-old female with progressive dyspnea and pleuritic chest pain over 3 days. Now hypotensive with muffled heart sounds and JVD. Recent viral URI 2 weeks ago.',
    history: 'Previously healthy. Recent viral illness. No medications. No surgical history.',
    physicalExam: 'Tachycardic, hypotensive. Markedly elevated JVP. Muffled/distant heart sounds. Pulsus paradoxus >12mmHg. Clear lungs. No peripheral edema.',
    guidelines: [
      '1. Recognize Beck triad: hypotension, JVD, muffled heart sounds',
      '2. Volume resuscitation: NS 500mL-1L IV bolus to increase preload',
      '3. AVOID vasodilators and diuretics (will worsen hemodynamics)',
      '4. Bedside echocardiography: confirm pericardial effusion with tamponade physiology',
      '5. Look for: RA/RV diastolic collapse, respiratory variation >25% in mitral inflow',
      '6. Emergency pericardiocentesis if hemodynamically unstable',
      '7. Subxiphoid approach under echo or fluoroscopic guidance',
      '8. Send pericardial fluid for: cell count, protein, LDH, glucose, cytology, cultures',
      '9. Leave pigtail catheter for ongoing drainage',
      '10. Treat underlying cause: viral pericarditis → NSAIDs + colchicine',
    ],
    medications: ['Normal saline bolus', 'NSAIDs (ibuprofen 600mg TID)', 'Colchicine 0.5mg BID', 'Avoid: diuretics, vasodilators, negative inotropes'],
    keyInterventions: ['Echo-guided pericardiocentesis', 'Volume resuscitation', 'Pericardial drain placement', 'Treat underlying cause'],
    pitfalls: ['Giving diuretics (reduces preload, worsens tamponade)', 'Missing pulsus paradoxus', 'Delayed echo', 'Not sending fluid for analysis'],
    disposition: 'ICU admission with pericardial drain. Monitor for re-accumulation. Treat underlying etiology.',
    teaching: [
      'Beck triad is present in only 10-40% of cases; echo is the diagnostic standard',
      'Pulsus paradoxus >10mmHg: SBP drops >10mmHg with inspiration',
      'Electrical alternans on ECG is specific but not sensitive for tamponade',
      'The rate of fluid accumulation matters more than the volume',
    ],
  },

  'pe-presentation': {
    id: 'pe-presentation',
    title: 'Pulmonary Embolism',
    difficulty: 'intermediate',
    ecgProfile: 'rbbb',
    heartRate: 112,
    vitals: { hr: 112, bp: '108/72', spo2: 89, rr: 28, temp: '37.4°C' },
    presentation: '42-year-old female with sudden onset dyspnea and pleuritic chest pain. Just returned from a 12-hour international flight 2 days ago. No history of DVT.',
    history: 'Oral contraceptive use. BMI 32. Sedentary lifestyle. Recent long-haul flight. No prior VTE. Mother had DVT.',
    physicalExam: 'Tachycardic, tachypneic, anxious. Heart: loud P2. Lungs: clear (classic for PE). Right calf mildly swollen and tender. SpO2 89% on room air.',
    guidelines: [
      '1. Calculate Wells score for PE probability',
      '2. Supplemental O2 to maintain SpO2 >94%',
      '3. IV access, cardiac monitor, labs (troponin, BNP, D-dimer, CBC, BMP)',
      '4. CT pulmonary angiography (gold standard for diagnosis)',
      '5. Bedside echo if too unstable for CT: look for RV dilation, McConnell sign',
      '6. Anticoagulation: heparin bolus 80 U/kg then 18 U/kg/hr infusion',
      '7. Risk stratify: submassive (RV strain + elevated troponin/BNP) vs massive (shock)',
      '8. If massive PE with shock: systemic thrombolysis (alteplase 100mg IV over 2 hours)',
      '9. Consider catheter-directed therapy for submassive PE',
      '10. Transition to DOAC (rivaroxaban or apixaban) for long-term anticoagulation',
    ],
    medications: ['Heparin 80 U/kg bolus → 18 U/kg/hr', 'Alteplase 100mg IV (if massive)', 'Rivaroxaban 15mg BID x21d → 20mg daily', 'Supplemental O2'],
    keyInterventions: ['CT pulmonary angiography', 'Systemic anticoagulation', 'Thrombolysis if massive', 'Catheter-directed therapy if submassive'],
    pitfalls: ['Over-reliance on D-dimer in high-probability patients', 'Delaying anticoagulation for CT', 'Missing RV strain markers', 'Not recognizing massive PE needs thrombolysis'],
    disposition: 'Admit to telemetry (submassive) or ICU (massive). Anticoagulation for minimum 3 months. Evaluate for provoked vs unprovoked.',
    teaching: [
      'Classic triad (dyspnea, pleuritic pain, hemoptysis) present in <20% of cases',
      'S1Q3T3 on ECG is specific but not sensitive; sinus tachycardia is most common finding',
      'RV/LV ratio >0.9 on CT defines submassive PE',
      'sPESI score helps identify low-risk patients for outpatient treatment',
    ],
  },

  'aortic-dissection': {
    id: 'aortic-dissection',
    title: 'Aortic Dissection',
    difficulty: 'advanced',
    ecgProfile: 'normal-sinus',
    heartRate: 102,
    vitals: { hr: 102, bp: '198/112', spo2: 97, rr: 22, temp: '36.9°C' },
    presentation: '68-year-old male with sudden onset tearing chest pain radiating to back. Hypertensive emergency with BP 198/112. Unequal arm blood pressures (right 198/112, left 162/88).',
    history: 'Poorly controlled hypertension, aortic root dilation noted on prior echo (4.2cm). Marfan habitus. Non-compliant with amlodipine and losartan.',
    physicalExam: 'Severe distress, diaphoretic. BP discrepancy between arms >20mmHg. Heart: diastolic murmur (aortic regurgitation). Lungs: clear. Neuro: intact.',
    guidelines: [
      '1. IMMEDIATE: Control heart rate and blood pressure',
      '2. Target HR <60 bpm first, then SBP 100-120 mmHg',
      '3. Esmolol 500mcg/kg bolus → 50-200 mcg/kg/min drip (first-line)',
      '4. Add nicardipine 5-15mg/hr or nitroprusside AFTER rate control',
      '5. NEVER give vasodilators before beta-blocker (reflex tachycardia worsens shear)',
      '6. Stat CT angiography chest/abdomen/pelvis for diagnosis and classification',
      '7. Type A (ascending): SURGICAL EMERGENCY → call CT surgery immediately',
      '8. Type B (descending): medical management unless complicated',
      '9. Control pain aggressively (morphine/fentanyl) as pain drives sympathetic surge',
      '10. Type and screen for >6 units pRBC, prepare for OR if Type A',
    ],
    medications: ['Esmolol 500mcg/kg → 50-200mcg/kg/min', 'Nicardipine 5-15mg/hr', 'Fentanyl 50-100mcg IV', 'Labetalol 20mg IV (alternative)'],
    keyInterventions: ['Impulse control (HR + BP)', 'CT angiography', 'CT surgery consult for Type A', 'Pain management'],
    pitfalls: ['Vasodilators before beta-blocker', 'Misdiagnosis as ACS (giving antiplatelet/anticoagulant)', 'Delayed surgical consultation for Type A', 'Not checking bilateral arm BPs'],
    disposition: 'Type A: OR for emergent surgical repair. Type B: ICU with IV anti-impulse therapy, transition to oral agents.',
    teaching: [
      'Type A (involves ascending aorta) = surgical emergency; mortality increases 1-2% per hour',
      'Type B (descending only) = medical management unless malperfusion or rupture',
      'Rate control BEFORE pressure control to reduce aortic wall shear stress',
      'D-dimer <500 has 95% negative predictive value for acute dissection',
    ],
  },

  'cardiogenic-shock': {
    id: 'cardiogenic-shock',
    title: 'Cardiogenic Shock',
    difficulty: 'expert',
    ecgProfile: 'anterior-stemi',
    heartRate: 110,
    vitals: { hr: 110, bp: '76/52', spo2: 86, rr: 32, temp: '35.8°C', gcs: 12 },
    presentation: '70-year-old male presenting 6 hours after anterior STEMI onset. Delayed presentation due to rural location. Now in florid cardiogenic shock with pulmonary edema and altered mental status.',
    history: 'DM2, HTN, prior PCI to RCA 3 years ago. EF was 45% on last echo.',
    physicalExam: 'Obtunded, cold and clammy. Heart: tachycardic, S3 gallop, systolic murmur (new MR?). Lungs: diffuse bilateral crackles. JVD. Mottled extremities, anuria.',
    guidelines: [
      '1. Intubation and mechanical ventilation for respiratory failure',
      '2. Arterial line and central venous access',
      '3. Vasopressor: norepinephrine 0.1-0.5 mcg/kg/min (first-line in cardiogenic shock)',
      '4. Inotrope: dobutamine 2.5-20 mcg/kg/min or milrinone 0.375-0.75 mcg/kg/min',
      '5. Emergent coronary angiography and PCI to culprit vessel',
      '6. Mechanical circulatory support: Impella CP (preferred) or IABP',
      '7. Consider ECMO if biventricular failure or refractory shock',
      '8. PA catheter for hemodynamic monitoring (CI, PCWP, SVR)',
      '9. Target: CI >2.2, MAP >65, PCWP <18, UOP >0.5 mL/kg/hr',
      '10. Evaluate for mechanical complications: VSD, papillary muscle rupture, free wall rupture',
    ],
    medications: ['Norepinephrine 0.1-0.5 mcg/kg/min', 'Dobutamine 2.5-20 mcg/kg/min', 'Heparin (for PCI)', 'Furosemide 40-80mg IV (if volume overloaded after MCS)'],
    keyInterventions: ['Emergent PCI', 'Mechanical circulatory support (Impella/IABP/ECMO)', 'PA catheter', 'Intubation'],
    pitfalls: ['Delaying MCS placement', 'Over-diuresis in RV failure', 'Not checking for mechanical complications (echo)', 'Using dopamine over norepinephrine (more arrhythmias)'],
    disposition: 'CCU with continuous hemodynamic monitoring. Consider LVAD or transplant evaluation if not recovering.',
    teaching: [
      'Cardiogenic shock complicates 5-10% of STEMI; mortality remains 40-50%',
      'SHOCK trial: early revascularization improves 6-month survival',
      'Norepinephrine is preferred over dopamine per SOAP II trial',
      'Impella provides greater hemodynamic support than IABP',
    ],
  },
};
