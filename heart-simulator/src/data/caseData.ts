/**
 * Case simulation data with realistic vitals, ECG profiles, guidelines, and teaching points.
 * Each case represents a clinical scenario with initial presentation and management steps,
 * plus an ordered set of decision points (assessment → diagnosis → treatment → disposition).
 *
 * Educational content only — typical adult doses; always verify against local protocol.
 */

import type { CaseDecision } from '../types/content';

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
  ecgProfile: string;           // Maps to waveform engine profile ID (ECG_PROFILE_IDS)
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
  decisions: CaseDecision[];    // Ordered decision points with feedback
}

export const CASE_DATA: Record<string, CaseData> = {
  'chest-pain-acs': {
    id: 'chest-pain-acs',
    title: 'Chest Pain / ACS',
    difficulty: 'beginner',
    ecgProfile: 'nstemi',
    heartRate: 88,
    vitals: { hr: 88, bp: '148/92', spo2: 96, rr: 20, temp: '37.0°C' },
    presentation: '62-year-old male with substernal chest pressure radiating to the left arm for 45 minutes. Diaphoretic and anxious. Pain 8/10; it began at rest and has not resolved.',
    history: 'HTN, DM2, hyperlipidemia, 30-pack-year smoking history. Father had MI at age 55. Current medications: metformin, lisinopril, atorvastatin.',
    physicalExam: 'Diaphoretic, anxious. Heart: regular, no murmurs or rubs. Lungs: clear bilaterally. No JVD. Equal radial pulses and arm BPs. Mild epigastric tenderness without guarding.',
    guidelines: [
      '1. 12-lead ECG within 10 minutes of first medical contact; repeat every 15–30 min if pain persists or changes',
      '2. Cardiac monitor, IV access, continuous SpO2; supplemental O2 only if SpO2 < 90% or respiratory distress',
      '3. Aspirin 162–325 mg non-enteric-coated, chewed (unless true allergy or active bleeding)',
      '4. Nitroglycerin 0.4 mg SL every 5 min up to 3 doses for ongoing pain (avoid if SBP < 90, suspected RV infarct or recent PDE-5 inhibitor)',
      '5. IV opioid (e.g., fentanyl) only for pain refractory to anti-ischemic therapy — not a routine step',
      '6. High-sensitivity troponin at 0 h and repeat at 1–2 h per the validated assay pathway; CBC, BMP, coagulation profile, lipids',
      '7. If STEMI or occlusion MI equivalent: activate cath lab (FMC-to-device ≤ 90 min; ≤ 120 min if transfer needed)',
      '8. If NSTE-ACS: parenteral anticoagulation (e.g., UFH), P2Y12 inhibitor timed with the invasive plan, high-intensity statin',
      '9. Oral beta-blocker within 24 h if no HF, low-output state, shock risk or high-grade AV block',
      '10. Risk stratify (GRACE/TIMI) to time angiography: immediate (< 2 h) if refractory angina or instability, early (< 24 h) if high risk',
    ],
    medications: [
      'Aspirin 162–325 mg chewed, then 81 mg daily',
      'Nitroglycerin 0.4 mg SL q5 min ×3 PRN',
      'UFH 60 U/kg bolus (max 4000 U) → 12 U/kg/h (max 1000 U/h)',
      'Ticagrelor 180 mg or clopidogrel 300–600 mg load (timing per cath plan)',
      'Atorvastatin 80 mg',
      'Metoprolol tartrate 25 mg PO (if no contraindication)',
      'Fentanyl IV only for refractory pain',
    ],
    keyInterventions: ['Rapid ECG acquisition and serial ECGs', 'Aspirin administration', 'Serial hs-troponins', 'Anticoagulation', 'Risk-based timing of angiography'],
    pitfalls: [
      'Delayed ECG > 10 minutes',
      'Routine high-flow O2 in a normoxemic patient',
      'Missing posterior MI (ST depression maximal V1–V3 → record V7–V9)',
      'Not checking right-sided leads when inferior ST elevation is present',
      'Nitroglycerin with RV infarction, hypotension or recent PDE-5 inhibitor use',
      'Not repeating the ECG when symptoms change',
      'Anchoring on epigastric tenderness and labeling the pain as GI',
    ],
    disposition: 'Admit to CCU/step-down with continuous monitoring. Invasive angiography timed by risk: immediate (< 2 h) if refractory ischemia or instability, otherwise early (< 24 h) for NSTEMI with high-risk features.',
    teaching: [
      'The HEART score (History, ECG, Age, Risk factors, Troponin) is for undifferentiated chest pain; GRACE/TIMI estimate risk once ACS is diagnosed',
      'MI requires a rise and/or fall of troponin above the 99th-percentile URL plus evidence of ischemia',
      'hs-troponin 0/1-h or 0/2-h algorithms allow faster rule-in and rule-out than older 0/3–6-h protocols',
      'Always consider ACS mimics: aortic dissection, PE, pericarditis, esophageal rupture',
      'Routine oxygen does not help normoxemic ACS patients (DETO2X-AMI) and was linked to larger infarcts in AVOID',
    ],
    decisions: [
      {
        id: 'chest-pain-acs-1',
        stage: 'Initial assessment (arrival)',
        prompt: 'He arrives by private car with ongoing 8/10 chest pressure. SpO2 96% on room air. What is your first priority?',
        options: [
          {
            text: 'Apply a non-rebreather mask at 15 L/min before anything else',
            correct: false,
            feedback: 'His SpO2 is 96%. ACS guidelines give oxygen only for SpO2 < 90% or respiratory distress; routine oxygen did not reduce mortality (DETO2X-AMI) and was associated with larger infarcts (AVOID).',
          },
          {
            text: '12-lead ECG within 10 minutes, cardiac monitor and IV access',
            correct: true,
            feedback: 'Correct. The ECG is the branch point between the STEMI pathway (immediate reperfusion) and the NSTE-ACS pathway, and must be acquired and read within 10 minutes. Monitoring catches VF early, which is most common in the first hours of MI.',
          },
          {
            text: 'Morphine 4 mg IV for the pain, then obtain the ECG once he is comfortable',
            correct: false,
            feedback: 'Analgesia should never delay the ECG. Opioids are reserved for pain refractory to nitrates and antithrombotic therapy; morphine also slows absorption of oral P2Y12 inhibitors and was associated with worse outcomes in observational NSTE-ACS data (CRUSADE).',
          },
          {
            text: 'CT angiography to rule out aortic dissection before any ECG',
            correct: false,
            feedback: 'Dissection is an important mimic, but he has no tearing pain, pulse deficit or arm BP differential. The ECG takes minutes and comes first; CTA is reserved for patients with high-risk dissection features.',
          },
        ],
      },
      {
        id: 'chest-pain-acs-2',
        stage: 'Key diagnostic step (15 minutes)',
        prompt: 'How should this presentation be classified?',
        update: 'ECG: sinus rhythm 88, 1.5 mm horizontal ST depression in V4–V6, I and aVL; no ST elevation. hs-troponin I: 48 ng/L at 0 h → 112 ng/L at 1 h (99th-percentile URL 26 ng/L).',
        options: [
          {
            text: 'Unstable angina — the troponin is just from hypertension',
            correct: false,
            feedback: 'Unstable angina means ischemic symptoms WITHOUT myocyte necrosis. A troponin above the 99th-percentile URL with a significant 1-hour rise, plus ischemic symptoms and ECG changes, meets the Fourth Universal Definition of MI.',
          },
          {
            text: 'STEMI — activate the cath lab for any ST deviation',
            correct: false,
            feedback: 'Lateral ST depression is not STEMI. However, ST depression maximal in V1–V3 should prompt posterior leads (V7–V9), and widespread ST depression with ST elevation in aVR raises concern for left main or multivessel ischemia.',
          },
          {
            text: 'NSTEMI (NSTE-ACS) — start antithrombotic therapy and plan invasive evaluation',
            correct: true,
            feedback: 'Correct. Ischemic symptoms + dynamic ST depression + a rising hs-troponin = NSTEMI. Management is antiplatelet, anticoagulant and anti-ischemic therapy with risk-based timing of angiography.',
          },
          {
            text: 'Non-cardiac pain — the epigastric tenderness suggests gastritis',
            correct: false,
            feedback: 'Epigastric tenderness is a classic distractor. Diaphoresis, arm radiation, ischemic ST depression and a rising troponin make ACS the working diagnosis; anchoring on GI causes is a common missed-MI error.',
          },
        ],
      },
      {
        id: 'chest-pain-acs-3',
        stage: 'Treatment (20 minutes)',
        prompt: 'Pain is now 6/10. BP 146/90, HR 86, no crackles. Which initial treatment bundle is most appropriate?',
        options: [
          {
            text: 'Aspirin 162–325 mg chewed, SL nitroglycerin, UFH (or enoxaparin) and a high-intensity statin, with P2Y12 inhibitor timing coordinated with the cath plan',
            correct: true,
            feedback: 'Correct. This covers antiplatelet, anticoagulant and anti-ischemic therapy. Routine P2Y12 pretreatment before early angiography is no longer universal, but every NSTEMI patient who undergoes PCI needs DAPT.',
          },
          {
            text: 'Aspirin and tenecteplase to open the artery as fast as possible',
            correct: false,
            feedback: 'Fibrinolysis does not benefit NSTE-ACS and increases bleeding, including intracranial hemorrhage. Lytics are only for STEMI when timely primary PCI is unavailable.',
          },
          {
            text: 'Oxygen 15 L/min, morphine every 5 minutes, nitrates and aspirin (MONA)',
            correct: false,
            feedback: 'MONA as a reflex protocol is outdated: oxygen only if SpO2 < 90%, opioids only for refractory pain. It also omits the anticoagulant and P2Y12 strategy that drive outcomes.',
          },
          {
            text: 'Metoprolol 5 mg IV every 5 minutes ×3 to lower myocardial oxygen demand',
            correct: false,
            feedback: 'Early aggressive IV beta-blockade increased cardiogenic shock in COMMIT/CCS-2, especially in older, tachycardic or borderline-hypotensive patients. Give an oral beta-blocker within 24 h if there are no signs of HF, low output, shock risk or AV block.',
          },
        ],
      },
      {
        id: 'chest-pain-acs-4',
        stage: '45 minutes later',
        prompt: 'What is the appropriate timing of coronary angiography now?',
        update: 'Recurrent 9/10 pain despite three SL nitroglycerin doses and an IV nitroglycerin infusion. HR 102, BP 104/68. Repeat ECG: deeper (3 mm) ST depression in V3–V6.',
        options: [
          {
            text: 'Early invasive strategy within 24 hours is still appropriate',
            correct: false,
            feedback: 'Angiography within 24 h is for stable high-risk NSTEMI. Refractory angina despite medical therapy is a very-high-risk feature requiring an immediate invasive strategy.',
          },
          {
            text: 'Ischemia-guided strategy: stress test once the troponin peaks',
            correct: false,
            feedback: 'Stress testing is contraindicated with ongoing ischemia at rest and would delay revascularization of an active culprit lesion.',
          },
          {
            text: 'Give tenecteplase because the pain is refractory',
            correct: false,
            feedback: 'Even refractory NSTE-ACS is treated with urgent angiography, not fibrinolysis — lytics have no benefit and increase bleeding in NSTE-ACS.',
          },
          {
            text: 'Immediate invasive strategy (angiography within 2 hours)',
            correct: true,
            feedback: 'Correct. Refractory or recurrent angina, hemodynamic instability, acute HF, life-threatening arrhythmias or mechanical complications define very-high-risk NSTE-ACS needing angiography within 2 hours. An occluded circumflex artery can be ECG-silent.',
          },
        ],
      },
    ],
  },

  'stemi-activation': {
    id: 'stemi-activation',
    title: 'STEMI Activation',
    difficulty: 'intermediate',
    ecgProfile: 'anterior-stemi',
    heartRate: 96,
    vitals: { hr: 96, bp: '132/84', spo2: 94, rr: 22, temp: '36.8°C' },
    presentation: '55-year-old male with sudden crushing chest pain that began while mowing the lawn 30 minutes ago, with nausea and diaphoresis. The paramedic 12-lead shows ST elevation in V1–V4 with reciprocal ST depression in the inferior leads.',
    history: 'Smoker, untreated hypertension, family history of premature CAD. No known cardiac history. No regular medications.',
    physicalExam: 'Diaphoretic, pale, clutching chest. Heart: regular, S4 gallop, no murmur. Lungs: fine bibasilar crackles (Killip II). No JVD. Cool, clammy skin with intact distal pulses.',
    guidelines: [
      '1. Transmit the prehospital ECG and activate the cath lab from the field; bypass non-PCI hospitals when feasible',
      '2. Aspirin 162–325 mg chewed',
      '3. P2Y12 inhibitor: ticagrelor 180 mg or prasugrel 60 mg (avoid prasugrel with prior stroke/TIA); clopidogrel 600 mg if neither is suitable',
      '4. UFH bolus ~70–100 U/kg for primary PCI, titrated to ACT in the lab (60 U/kg, max 4000 U, if paired with a fibrinolytic)',
      '5. O2 only if SpO2 < 90%; nitroglycerin for ongoing pain if SBP ≥ 90 with no RV involvement or PDE-5 inhibitor use',
      '6. Goal FMC-to-device ≤ 90 min (≤ 120 min if transferred; door-in-door-out ≤ 30 min)',
      '7. If PCI cannot be achieved within 120 min of FMC: fibrinolysis (e.g., tenecteplase) within 30 min of arrival, then transfer for angiography',
      '8. Pads on at all times; anticipate VF, AV block and cardiogenic shock',
      '9. Avoid early IV beta-blocker with HF signs (Killip ≥ II); start oral beta-blocker within 24 h once stable',
      '10. Post-PCI: CCU, DAPT, high-intensity statin, ACEi/ARB, beta-blocker, echo for LVEF, cardiac rehab',
    ],
    medications: [
      'Aspirin 162–325 mg chewed',
      'Ticagrelor 180 mg or prasugrel 60 mg',
      'UFH ~70–100 U/kg IV bolus (primary PCI)',
      'Nitroglycerin 0.4 mg SL PRN (if SBP ≥ 90)',
      'Atorvastatin 80 mg',
      'Oral metoprolol once no HF or low-output signs',
    ],
    keyInterventions: ['Prehospital ECG and cath lab activation', 'Dual antiplatelet therapy + anticoagulation', 'Primary PCI', 'Continuous monitoring with pads on', 'Immediate defibrillation readiness'],
    pitfalls: [
      'Delaying activation to repeat the ECG or await troponin',
      'Missing occlusion MI that does not meet STEMI criteria (posterior MI, de Winter T waves, modified Sgarbossa-positive LBBB)',
      'Nitroglycerin in RV infarction or after PDE-5 inhibitors',
      'IV beta-blocker in a patient with crackles (Killip II) — increases shock risk',
      'Stopping at a nearer non-PCI hospital when direct transport meets time goals',
    ],
    disposition: 'Direct to the cardiac catheterization lab for primary PCI. CCU admission afterward with echo, GDMT initiation and cardiac rehab referral.',
    teaching: [
      'FMC-to-device ≤ 90 min is the primary PCI benchmark; door-in-door-out ≤ 30 min at referral hospitals',
      'Proximal LAD occlusion puts the largest territory at risk and carries the highest mortality',
      'Check V4R for RV involvement in inferior STEMI; V7–V9 when ST depression is maximal in V1–V3',
      'Occlusion MI without classic ST elevation: de Winter T waves, posterior MI, hyperacute T waves, modified Sgarbossa in LBBB or paced rhythm',
      'Wellens T waves signal a reperfused critical LAD lesion — urgent angiography, never stress testing',
      'VF within 48 h of acute MI does not by itself mandate an ICD; reassess LVEF ≥ 40 days after MI',
    ],
    decisions: [
      {
        id: 'stemi-activation-1',
        stage: 'On scene',
        prompt: 'You are the paramedic. Your 12-lead shows ST elevation V1–V4 with reciprocal inferior ST depression. A non-PCI community hospital is 8 minutes away; a PCI center is 25 minutes away. What do you do?',
        options: [
          {
            text: 'Transport to the closest hospital so a physician can confirm the ECG',
            correct: false,
            feedback: 'Stopping at a non-PCI hospital typically adds 30–60+ minutes (door-in-door-out) before reperfusion. When the PCI center can be reached within time goals, bypass to it.',
          },
          {
            text: 'Repeat the 12-lead in 20 minutes to confirm evolution before notifying anyone',
            correct: false,
            feedback: 'This ECG already meets STEMI criteria with reciprocal change. Serial ECGs help with non-diagnostic tracings; they should not delay activation for a clear STEMI.',
          },
          {
            text: 'Transmit the ECG, activate the cath lab from the field and transport directly to the PCI center',
            correct: true,
            feedback: 'Correct. Prehospital activation shortens FMC-to-device time (goal ≤ 90 min) and has the team ready on arrival. Bypassing non-PCI facilities is recommended when direct transport is feasible.',
          },
          {
            text: 'Wait for a point-of-care troponin before activating',
            correct: false,
            feedback: 'Troponin may still be normal early in STEMI and is never needed to activate reperfusion. A diagnostic ECG with compatible symptoms is sufficient.',
          },
        ],
      },
      {
        id: 'stemi-activation-2',
        stage: 'En route',
        prompt: 'SpO2 94% on room air, BP 132/84, HR 96, fine bibasilar crackles, ongoing 7/10 pain. Which treatment is appropriate now?',
        options: [
          {
            text: 'Non-rebreather at 15 L/min, morphine 4 mg IV, then aspirin',
            correct: false,
            feedback: 'SpO2 is ≥ 90%, so supplemental oxygen is not indicated, and opioids are not first-line. Morphine can delay oral P2Y12 absorption; aspirin and nitrates come first.',
          },
          {
            text: 'Aspirin 162–325 mg chewed and SL nitroglycerin (SBP ≥ 90, no PDE-5 inhibitor, no RV involvement); no supplemental oxygen',
            correct: true,
            feedback: 'Correct. Aspirin is the highest-yield early drug in STEMI (ISIS-2). Nitroglycerin relieves pain and congestion but does not reduce mortality — check BP and PDE-5 inhibitor use first. P2Y12 inhibitor and heparin per regional protocol or at the PCI center.',
          },
          {
            text: 'Metoprolol 5 mg IV ×3 to limit infarct size',
            correct: false,
            feedback: 'Crackles mean Killip II. Early IV beta-blockade increased cardiogenic shock in COMMIT/CCS-2 in patients with HF signs or shock risk; start an oral beta-blocker within 24 h once stable.',
          },
          {
            text: 'Hold aspirin in case he needs emergency bypass surgery',
            correct: false,
            feedback: 'Aspirin is continued even if CABG becomes necessary. Withholding it forfeits a proven mortality benefit.',
          },
        ],
      },
      {
        id: 'stemi-activation-3',
        stage: 'Arrival at the PCI center',
        prompt: 'What is your immediate action?',
        update: 'While moving onto the cath table he becomes unresponsive. Monitor: chaotic irregular waveform without discrete QRS complexes. No pulse.',
        options: [
          {
            text: 'Synchronized cardioversion at 100 J',
            correct: false,
            feedback: 'There is no QRS to synchronize to in VF, so the device may never discharge. Pulseless VF needs an unsynchronized defibrillation shock.',
          },
          {
            text: 'Amiodarone 300 mg IV, then shock if VF persists',
            correct: false,
            feedback: 'Defibrillation is the definitive treatment for VF; antiarrhythmics are given only after the third shock in refractory VF.',
          },
          {
            text: 'Check a carotid pulse for 30 seconds, then start CPR',
            correct: false,
            feedback: 'Pulse checks should take ≤ 10 seconds. A witnessed, monitored VF arrest with pads on should be shocked immediately.',
          },
          {
            text: 'Immediate defibrillation (biphasic 120–200 J per manufacturer, or maximum if unknown), then resume CPR for 2 minutes',
            correct: true,
            feedback: 'Correct. Immediate defibrillation of witnessed, monitored VF has a high success rate. Resume compressions right after the shock without a pulse check. Ischemic VF is common in early STEMI — the reason pads stay on.',
          },
        ],
      },
      {
        id: 'stemi-activation-4',
        stage: 'After primary PCI',
        prompt: 'Which discharge plan is most appropriate?',
        update: 'ROSC after one shock. Proximal LAD stented with TIMI 3 flow. Day 3 echo: LVEF 35% with anterior-apical hypokinesis. No further arrhythmias.',
        options: [
          {
            text: 'Implant an ICD before discharge because he had VF and an LVEF of 35%',
            correct: false,
            feedback: 'Early ischemic VF does not carry the same long-term risk, and early ICD implantation after MI did not improve survival (DINAMIT, IRIS). Wait and reassess LVEF.',
          },
          {
            text: 'Aspirin alone; stop the P2Y12 inhibitor after 1 month to reduce bleeding',
            correct: false,
            feedback: 'After ACS with stenting, default DAPT is 12 months. Shortened DAPT (usually de-escalation to P2Y12 monotherapy) is reserved for high bleeding risk or deliberate strategies — not routine aspirin alone at 1 month.',
          },
          {
            text: 'DAPT (aspirin + ticagrelor or prasugrel) typically for 12 months, high-intensity statin, beta-blocker, ACEi/ARB/ARNI, MRA, cardiac rehab, and repeat LVEF assessment before any ICD decision',
            correct: true,
            feedback: 'Correct. VF within 48 h of acute MI does not itself require an ICD. Reassess LVEF ≥ 40 days after MI (≥ 90 days after revascularization) — many patients recover; a wearable defibrillator may be considered selectively in the interim. An MRA is indicated after MI with LVEF ≤ 40% plus HF signs or diabetes (EPHESUS).',
          },
          {
            text: 'Stop the statin once LDL falls below 100 mg/dL',
            correct: false,
            feedback: 'High-intensity statin therapy is lifelong after ACS. Aim for ≥ 50% LDL-C reduction and LDL-C < 70 mg/dL (many guidelines now favor < 55), adding ezetimibe or a PCSK9 inhibitor as needed.',
          },
        ],
      },
    ],
  },

  'unstable-svt': {
    id: 'unstable-svt',
    title: 'Unstable SVT',
    difficulty: 'intermediate',
    ecgProfile: 'avnrt',
    heartRate: 186,
    vitals: { hr: 186, bp: '86/58', spo2: 96, rr: 24, temp: '37.1°C' },
    presentation: '34-year-old female with sudden-onset palpitations and lightheadedness for 40 minutes. The monitor shows a regular narrow-complex tachycardia at 186/min. She is becoming confused and hypotensive.',
    history: 'Prior brief palpitation episodes, never evaluated. No medications. No known cardiac history or pre-excitation. Drinks 3–4 cups of coffee daily.',
    physicalExam: 'Anxious, diaphoretic, intermittently confused. Heart: very rapid regular rhythm, no murmur. Lungs: clear. Thready radial pulse, capillary refill 4 s. Rapid regular neck pulsations ("frog sign").',
    guidelines: [
      '1. Assess stability: hypotension and acute confusion caused by the tachycardia = UNSTABLE',
      '2. Pads on; prepare immediate synchronized cardioversion',
      '3. If IV access is in place and it will not delay cardioversion, adenosine 6 mg rapid IV push with flush may be tried (regular narrow complex)',
      '4. Synchronized cardioversion: initial 50–100 J biphasic, escalate if unsuccessful',
      '5. Brief procedural sedation/analgesia if time allows — never delay cardioversion in a deteriorating patient',
      '6. If stable: modified Valsalva (strain, then supine with passive leg raise) first',
      '7. Then adenosine 6 mg rapid IV push, then 12 mg if needed (antecubital vein, saline flush, record a rhythm strip)',
      '8. If adenosine fails in a stable patient: IV diltiazem/verapamil or beta-blocker (not if hypotensive or pre-excited)',
      '9. Post-conversion 12-lead: look for pre-excitation (short PR, delta wave)',
      '10. EP referral: catheter ablation is first-line long-term therapy for recurrent symptomatic SVT',
    ],
    medications: [
      'Adenosine 6 mg → 12 mg rapid IV push with saline flush',
      'Procedural sedation per local protocol (only if it does not delay cardioversion)',
      'Diltiazem 0.25 mg/kg IV over 2 min (stable patients only)',
      'Metoprolol IV (stable patients only)',
      'Fluid bolus as an adjunct for hypotension',
    ],
    keyInterventions: ['Recognize instability', 'Synchronized cardioversion', 'Adenosine only if it does not delay cardioversion', 'Post-conversion 12-lead for pre-excitation', 'EP referral for ablation'],
    pitfalls: [
      'Delaying cardioversion in an unstable patient',
      'Slow adenosine push or distal IV (half-life < 10 s)',
      'AV nodal blockers in pre-excited AF (WPW)',
      'Unsynchronized shock for an organized rhythm with a pulse (risk of VF)',
      'Forgetting to re-enable SYNC before a repeat shock on devices that default back to unsynchronized',
      'Mislabeling sinus tachycardia from sepsis or bleeding as SVT',
    ],
    disposition: 'Observe on the monitor for several hours after conversion. Refer to EP; slow-pathway ablation for AVNRT (> 95% success, < 1% risk of AV block) is first-line long-term therapy, with beta-blocker or calcium-channel blocker as an alternative.',
    teaching: [
      'Unstable = hypotension, acute altered mentation, ischemic chest pain, acute heart failure or shock caused by the arrhythmia',
      'Synchronized cardioversion is first-line for unstable regular narrow-complex tachycardia',
      'Adenosine that causes no transient AV block suggests inadequate delivery or antagonism (caffeine, theophylline)',
      'If adenosine produces AV block while atrial activity continues, the rhythm is atrial (flutter or atrial tachycardia), not AVNRT',
      'AVNRT is the most common regular SVT; its circuit uses the slow and fast AV nodal pathways',
      'Always check the post-conversion ECG for delta waves (WPW)',
    ],
    decisions: [
      {
        id: 'unstable-svt-1',
        stage: 'Initial assessment',
        prompt: 'Regular narrow-complex tachycardia at 186, BP 86/58, intermittently confused. How do you classify her and what do you prepare?',
        options: [
          {
            text: 'Stable — she is talking, so start vagal maneuvers and observe',
            correct: false,
            feedback: 'Talking does not mean stable. Hypotension with new confusion caused by the tachycardia defines instability, which mandates preparing for electrical therapy.',
          },
          {
            text: 'Unstable — apply pads and prepare immediate synchronized cardioversion',
            correct: true,
            feedback: 'Correct. Hypoperfusion attributable to a rate this fast makes her unstable. Electricity is definitive; adenosine may be tried only if it will not delay cardioversion.',
          },
          {
            text: 'Sinus tachycardia from anxiety and caffeine — give fluids and a benzodiazepine',
            correct: false,
            feedback: 'Abrupt onset, a fixed rate with no beat-to-beat variation and no visible P waves before each QRS point to re-entrant SVT. Treating it as anxiety delays definitive therapy while she deteriorates.',
          },
          {
            text: 'Unstable — needs unsynchronized defibrillation because she is confused',
            correct: false,
            feedback: 'Unsynchronized shocks are for pulseless rhythms or polymorphic VT. A shock delivered on the T wave of an organized rhythm can induce VF; she needs synchronized cardioversion.',
          },
        ],
      },
      {
        id: 'unstable-svt-2',
        stage: 'While pads are applied',
        prompt: 'A colleague suggests adenosine while setup is completed. Is that reasonable?',
        update: 'An antecubital IV is in place. The team needs about 60 seconds to finish pad placement and set up the defibrillator.',
        options: [
          {
            text: 'No — adenosine is contraindicated in hypotension',
            correct: false,
            feedback: 'Adenosine has a half-life < 10 s, and the AHA algorithm allows it for unstable regular narrow-complex tachycardia while cardioversion is prepared. Its brief AV block may terminate AVNRT without sedation.',
          },
          {
            text: 'Yes — give 6 mg slowly over 1 minute through a hand IV to limit side effects',
            correct: false,
            feedback: 'Adenosine is cleared within seconds, so a slow or distal push often fails. It must be a rapid push followed immediately by a 10–20 mL saline flush, ideally via an antecubital vein.',
          },
          {
            text: 'Yes — adenosine 6 mg rapid push with immediate flush while recording a strip, without delaying cardioversion',
            correct: true,
            feedback: 'Correct. It is diagnostic and often therapeutic for AV node-dependent re-entry. Warn her about brief chest discomfort, flushing and a sense of doom. Use 3 mg via a central line or after heart transplant.',
          },
          {
            text: 'Give verapamil 5 mg IV instead because it lasts longer',
            correct: false,
            feedback: 'Verapamil causes vasodilation and negative inotropy lasting far longer than adenosine; in a hypotensive patient it can precipitate collapse. Calcium-channel blockers are for stable patients.',
          },
        ],
      },
      {
        id: 'unstable-svt-3',
        stage: 'Two minutes later',
        prompt: 'What is the next step?',
        update: 'Adenosine 6 mg then 12 mg: no transient AV block or rate change on the strip. BP now 78/50 and she is drowsier.',
        options: [
          {
            text: 'Third adenosine dose of 18 mg',
            correct: false,
            feedback: 'ACLS dosing is 6 mg then 12 mg. She is deteriorating, and further drug trials delay definitive therapy. Her caffeine intake (an adenosine receptor antagonist) may explain the lack of effect.',
          },
          {
            text: 'Synchronized cardioversion at 50–100 J biphasic (brief sedation only if it causes no delay), escalating if unsuccessful',
            correct: true,
            feedback: 'Correct. Regular narrow-complex tachycardia usually converts at low energy. Confirm sync markers on each R wave and re-enable SYNC before any repeat shock.',
          },
          {
            text: 'Amiodarone 150 mg IV over 10 minutes',
            correct: false,
            feedback: 'Amiodarone acts slowly, can worsen hypotension and is not the treatment for unstable SVT. Electricity works within seconds.',
          },
          {
            text: 'Unsynchronized defibrillation at 200 J',
            correct: false,
            feedback: 'She has a pulse and an organized rhythm. An unsynchronized shock can land on the T wave and induce VF.',
          },
        ],
      },
      {
        id: 'unstable-svt-4',
        stage: 'Disposition',
        prompt: 'What is the best long-term plan?',
        update: 'Converted to sinus rhythm at 92 after one 100 J synchronized shock. Post-conversion 12-lead: PR 160 ms, no delta wave, QTc 420 ms. BP 118/74, normal mentation.',
        options: [
          {
            text: 'Discharge with no follow-up because it terminated',
            correct: false,
            feedback: 'Recurrence is common, and this episode caused hemodynamic compromise. She needs EP evaluation and a plan for future episodes.',
          },
          {
            text: 'Lifelong oral amiodarone',
            correct: false,
            feedback: 'Amiodarone carries thyroid, lung, liver and eye toxicity and is inappropriate for a young patient with a curable arrhythmia.',
          },
          {
            text: 'Permanent pacemaker to prevent recurrence',
            correct: false,
            feedback: 'Pacemakers treat bradycardia; they do not prevent re-entrant SVT.',
          },
          {
            text: 'EP referral for catheter ablation and teaching of the modified Valsalva maneuver; beta-blocker or calcium-channel blocker as an alternative or bridge',
            correct: true,
            feedback: 'Correct. Slow-pathway ablation cures AVNRT in > 95% of patients with < 1% risk of AV block and is first-line for recurrent symptomatic SVT. Absence of pre-excitation makes AV nodal blockers reasonable as bridging therapy.',
          },
        ],
      },
    ],
  },

  'bradycardia-with-shock': {
    id: 'bradycardia-with-shock',
    title: 'Bradycardia with Shock',
    difficulty: 'advanced',
    ecgProfile: 'third-degree-avb',
    heartRate: 34,
    vitals: { hr: 34, bp: '72/48', spo2: 88, rr: 24, temp: '36.2°C', gcs: 13 },
    presentation: '78-year-old male found by family confused with near-syncope. HR 34 and hypotensive. The monitor shows complete heart block with a wide-QRS ventricular escape rhythm.',
    history: 'Known CAD with prior inferior MI 5 years ago. Medications: metoprolol 50 mg BID, digoxin 0.125 mg daily, lisinopril 10 mg daily. Reduced oral intake for 4 days with a diarrheal illness.',
    physicalExam: 'Confused (GCS 13). Cool, mottled extremities; capillary refill 5 s. Heart: slow regular rhythm, intermittent cannon a waves in the JVP, variable S1 intensity. Lungs: bibasilar crackles. No focal neurological deficit.',
    guidelines: [
      '1. ABCs, monitor, pads on immediately, IV/IO access; oxygen to correct hypoxemia (SpO2 88%)',
      '2. Atropine 1 mg IV may be tried (repeat every 3–5 min, max 3 mg) but must not delay pacing',
      '3. Atropine is often ineffective in infranodal block (wide-QRS escape) and in transplanted hearts',
      '4. Transcutaneous pacing: rate ~60–80/min, increase output until electrical capture, confirm mechanical capture with a femoral pulse',
      '5. Analgesia/sedation for conscious pacing as BP allows',
      '6. Chronotropic infusion if pacing is delayed or ineffective: epinephrine 2–10 mcg/min or dopamine 5–20 mcg/kg/min',
      '7. Stop AV nodal blockers; check K+, renal function, digoxin level, troponin and the ECG for ischemia',
      '8. Treat reversible causes: hyperkalemia (IV calcium, insulin/dextrose), digoxin toxicity (digoxin-specific Fab), beta-blocker toxicity (glucagon, high-dose insulin)',
      '9. Urgent cardiology: transvenous temporary pacing as a bridge',
      '10. Permanent pacemaker if block persists after reversible causes are excluded or corrected',
    ],
    medications: [
      'Atropine 1 mg IV q3–5 min (max 3 mg)',
      'Epinephrine 2–10 mcg/min infusion',
      'Dopamine 5–20 mcg/kg/min infusion',
      'Fentanyl in small titrated doses for pacing discomfort',
      'Calcium chloride 1 g or calcium gluconate 3 g IV for hyperkalemia',
      'Digoxin-specific Fab for digoxin toxicity with life-threatening arrhythmia',
    ],
    keyInterventions: ['Early transcutaneous pacing', 'Confirm mechanical capture', 'Hold rate-slowing medications', 'Correct reversible causes', 'Transvenous pacing → permanent pacemaker evaluation'],
    pitfalls: [
      'Relying on atropine for a wide-QRS escape rhythm',
      'Assuming capture from the monitor without checking a femoral pulse',
      'Checking the carotid pulse during TCP (muscle twitching mimics a pulse)',
      'Missing medication toxicity or hyperkalemia (BRASH syndrome)',
      'Implanting a permanent pacemaker before reversible causes are addressed',
    ],
    disposition: 'ICU admission with transvenous pacing. Permanent pacemaker once reversible causes are excluded and block persists.',
    teaching: [
      'Complete heart block: P waves and QRS complexes are independent, with the atrial rate faster than the ventricular rate',
      'A narrow junctional escape (40–60) suggests AV nodal block; a wide escape (20–40) suggests infranodal block',
      'Atropine acts on vagally innervated sinus and AV nodal tissue; it rarely helps infranodal block',
      'BRASH: bradycardia, renal failure, AV nodal blockade, shock, hyperkalemia — synergistic causes that feed each other',
      'Transcutaneous pacing is a bridge to transvenous pacing',
    ],
    decisions: [
      {
        id: 'bradycardia-with-shock-1',
        stage: 'Initial assessment',
        prompt: 'Monitor: P waves regular at ~80/min; wide QRS complexes regular at 34/min; PR intervals vary with no fixed relationship. What is the rhythm and its significance?',
        options: [
          {
            text: '2:1 second-degree AV block — usually benign',
            correct: false,
            feedback: 'In 2:1 block every other P wave conducts with a constant PR interval. Here the PR varies randomly (AV dissociation), and the block is causing shock.',
          },
          {
            text: 'Mobitz I (Wenckebach) — observe',
            correct: false,
            feedback: 'Wenckebach shows progressive PR prolongation before a dropped beat, producing grouped beating. A regular wide escape independent of the P waves is complete heart block.',
          },
          {
            text: 'Third-degree AV block with a ventricular escape, causing shock',
            correct: true,
            feedback: 'Correct. Atrial rate > ventricular rate with no consistent PR relationship is complete heart block. A wide escape at 34 implies an infranodal origin — unreliable and likely to need pacing.',
          },
          {
            text: 'Sinus bradycardia from his beta-blocker',
            correct: false,
            feedback: 'The atrial (P wave) rate is ~80, so the sinus node is working; the problem is conduction to the ventricles.',
          },
        ],
      },
      {
        id: 'bradycardia-with-shock-2',
        stage: 'Immediate treatment',
        prompt: 'IV access is obtained and pads are on. Which approach is best?',
        options: [
          {
            text: 'Atropine 0.5 mg every 5 minutes to a total of 3 mg before considering pacing',
            correct: false,
            feedback: 'The current AHA dose is 1 mg (0.5 mg is outdated), and with a wide-QRS escape atropine is unlikely to work. Working through repeated doses delays effective therapy.',
          },
          {
            text: 'Atropine 1 mg may be tried, but start transcutaneous pacing (or an epinephrine/dopamine infusion) without waiting for it to fail',
            correct: true,
            feedback: 'Correct. Infranodal block rarely responds to atropine. In bradycardia with shock, pacing and chronotropic infusions are the rescue therapies, and atropine must not delay them.',
          },
          {
            text: 'Amiodarone 150 mg IV — the wide complexes may be slow VT',
            correct: false,
            feedback: 'The wide complexes are an escape rhythm keeping him alive. Suppressing them with an antiarrhythmic can cause asystole.',
          },
          {
            text: 'Adenosine 6 mg to localize the level of block',
            correct: false,
            feedback: 'Adenosine causes AV block — the last thing a patient in complete heart block with shock needs.',
          },
        ],
      },
      {
        id: 'bradycardia-with-shock-3',
        stage: 'Pacing started',
        prompt: 'What does this mean, and what do you do?',
        update: 'TCP at rate 70 with output 70 mA. The monitor shows a large wide deflection after each pacer spike, but the femoral pulse is ~34/min and BP is unchanged at 72/48.',
        options: [
          {
            text: 'Capture is achieved — add dopamine for the BP',
            correct: false,
            feedback: 'Large post-spike deflections can be pacing artifact. If the pulse is still 34/min, the paced beats are not producing contractions.',
          },
          {
            text: 'Lower the pacing rate to 40 to match his intrinsic rhythm',
            correct: false,
            feedback: 'The goal is a perfusing paced rate (~60–80/min); lowering the rate does not fix failure to capture.',
          },
          {
            text: 'Switch to unsynchronized defibrillation',
            correct: false,
            feedback: 'Defibrillation is for VF or pulseless VT, not bradycardia.',
          },
          {
            text: 'Mechanical capture is not confirmed — increase output until a femoral pulse matches the paced rate, then set output safely above threshold',
            correct: true,
            feedback: 'Correct. Confirm electrical capture (wide QRS with a T wave after each spike) and mechanical capture (femoral pulse at the paced rate, BP response). Use the femoral, not carotid, pulse — pacing-induced muscle twitching can mimic a carotid pulse.',
          },
        ],
      },
      {
        id: 'bradycardia-with-shock-4',
        stage: 'One hour later',
        prompt: 'What is the best next plan?',
        update: 'Mechanical capture at 90 mA; BP 104/62. Labs: K+ 6.2 mmol/L, creatinine 2.4 mg/dL (baseline 1.1), digoxin 2.6 ng/mL (toxic range).',
        options: [
          {
            text: 'Implant a permanent pacemaker today; the labs are incidental',
            correct: false,
            feedback: 'Hyperkalemia, AKI and digoxin toxicity can all worsen AV block. Correct reversible causes first, then implant a permanent device if block persists.',
          },
          {
            text: 'Stop pacing now that BP is better and transfer to a ward bed',
            correct: false,
            feedback: 'His intrinsic rhythm is still complete heart block at 34/min; stopping pacing would return him to shock.',
          },
          {
            text: 'Treat hyperkalemia, stop digoxin, metoprolol and lisinopril, give digoxin-specific Fab, place a transvenous pacer and admit to ICU; reassess for a permanent pacemaker after correction',
            correct: true,
            feedback: 'Correct. This is a BRASH-type picture: drugs, acute kidney injury and hyperkalemia synergize to worsen AV block. Fab fragments reverse digoxin toxicity, and a transvenous pacer is a more reliable bridge than TCP.',
          },
          {
            text: 'Restart home medications at half dose now that BP has improved',
            correct: false,
            feedback: 'Metoprolol and digoxin contributed to the block, and digoxin is toxic at his current renal function. Restarting them invites recurrence.',
          },
        ],
      },
    ],
  },

  'vt-storm': {
    id: 'vt-storm',
    title: 'VT Storm',
    difficulty: 'expert',
    ecgProfile: 'vt',
    heartRate: 180,
    vitals: { hr: 180, bp: '78/50', spo2: 85, rr: 30, temp: '36.5°C', gcs: 10 },
    presentation: '65-year-old male with ischemic cardiomyopathy (LVEF 20%) and an ICD, brought in after 3 ICD shocks in the past hour. Now in a sustained regular wide-complex tachycardia at 180/min with hypotension and depressed consciousness.',
    history: 'Prior anterior MI, LVEF 20%, ICD placed 2 years ago. Medications: amiodarone 200 mg daily, carvedilol 25 mg BID, sacubitril/valsartan, spironolactone, furosemide. Missed doses for one week.',
    physicalExam: 'Obtunded (GCS 10), diaphoretic. Heart: rapid regular rhythm. Lungs: bilateral crackles. JVD present. Cool, mottled extremities. ICD generator in the left infraclavicular pocket.',
    guidelines: [
      '1. Pulseless VT → unsynchronized defibrillation and ACLS; unstable VT with a pulse → synchronized cardioversion (sedation if time allows)',
      '2. Pads anterior–posterior, ≥ 8 cm from the ICD generator; interrogate the device as soon as possible',
      '3. Amiodarone 150 mg IV over 10 min (repeat as needed), then 1 mg/min ×6 h, then 0.5 mg/min ×18 h',
      '4. Add lidocaine 1–1.5 mg/kg IV bolus, then 1–4 mg/min infusion, for recurrent VT',
      '5. Correct electrolytes (K+ ≥ 4.0 mmol/L, Mg2+ ≥ 2.0 mg/dL); look for ischemia, HF decompensation, thyroid dysfunction, infection and proarrhythmic drugs',
      '6. Sympatholysis: deep sedation ± intubation; nonselective beta-blocker (e.g., propranolol) as hemodynamics allow',
      '7. Refractory storm: percutaneous stellate ganglion block as a bridge',
      '8. Early EP involvement for ICD reprogramming (e.g., antitachycardia pacing) and urgent catheter ablation',
      '9. A magnet over the ICD suspends shocks (not bradycardia pacing) — use only for inappropriate shocks or while external defibrillation is immediately available',
      '10. Mechanical circulatory support (e.g., VA-ECMO) for refractory VT with shock, as a bridge to ablation or advanced HF therapy',
    ],
    medications: [
      'Amiodarone 150 mg IV over 10 min → 1 mg/min',
      'Lidocaine 1–1.5 mg/kg IV → 1–4 mg/min',
      'Magnesium sulfate 2 g IV',
      'Potassium repletion to ≥ 4.0 mmol/L',
      'Propranolol or esmolol (as BP allows)',
      'Sedation (e.g., propofol or midazolam) for sympatholysis',
    ],
    keyInterventions: ['Electrical cardioversion', 'Device interrogation', 'Antiarrhythmic loading', 'Electrolyte and trigger correction', 'Sympatholysis', 'Urgent VT ablation'],
    pitfalls: [
      'Synchronized cardioversion for pulseless VT (it needs defibrillation)',
      'Not sedating a conscious patient receiving shocks',
      'Forgetting electrolyte correction',
      'Reflex emergent angiography without evidence of acute ischemia',
      'Adrenergic inotropes such as dobutamine that fuel catecholamine-driven VT',
      'Placing pads directly over the ICD generator',
    ],
    disposition: 'CCU/ICU with continuous monitoring. Urgent EP evaluation for VT ablation; advanced HF evaluation (LVAD/transplant) if VT is refractory.',
    teaching: [
      'Electrical storm = ≥ 3 sustained VT/VF episodes or appropriate ICD therapies within 24 h',
      'Treat the triggers: ischemia, electrolytes, HF decompensation, drugs, thyroid, infection',
      'Sympatholysis (sedation, nonselective beta-blockade, stellate ganglion block) is often more effective than antiarrhythmics alone',
      'In VANISH, catheter ablation reduced death, VT storm and appropriate shocks vs escalated antiarrhythmics in ischemic cardiomyopathy',
      'Scar-related re-entrant VT is monomorphic; polymorphic VT in this setting suggests active ischemia',
    ],
    decisions: [
      {
        id: 'vt-storm-1',
        stage: 'Initial assessment',
        prompt: 'Regular wide-complex tachycardia at 180, weak carotid pulse, BP 78/50, GCS 10. What is the immediate management?',
        options: [
          {
            text: 'Adenosine 6 mg to rule out SVT with aberrancy',
            correct: false,
            feedback: 'With prior MI and LVEF 20%, a wide-complex tachycardia is VT until proven otherwise, and he is unstable. Adenosine is only considered for stable, regular, monomorphic wide-complex tachycardia.',
          },
          {
            text: 'Synchronized cardioversion (sedation if time allows), with pads anterior–posterior away from the ICD generator',
            correct: true,
            feedback: 'Correct. Unstable VT with a pulse needs synchronized cardioversion (monomorphic VT typically ~100 J biphasic initially, escalating). Keeping pads ≥ 8 cm from the generator protects the device and the current path.',
          },
          {
            text: 'Amiodarone 300 mg IV push',
            correct: false,
            feedback: '300 mg push is the pulseless-arrest dose. He has a pulse and is unstable: electricity first, then amiodarone 150 mg over 10 min to prevent recurrence.',
          },
          {
            text: 'Unsynchronized defibrillation at 360 J because GCS is < 13',
            correct: false,
            feedback: 'A low GCS does not make him pulseless. Synchronization avoids an R-on-T shock; unsynchronized shocks are for pulseless VT/VF, polymorphic VT or when sync fails.',
          },
        ],
      },
      {
        id: 'vt-storm-2',
        stage: '20 minutes later',
        prompt: 'What is the most important next step?',
        update: 'Sinus rhythm at 92 after one 100 J synchronized shock, then two further VT episodes terminated by ICD shocks. Labs: K+ 3.1 mmol/L, Mg 1.4 mg/dL, hs-troponin mildly elevated and flat. ECG between episodes: old anterior Q waves, no new ST elevation.',
        options: [
          {
            text: 'Emergent coronary angiography — every VT storm is ischemic',
            correct: false,
            feedback: 'Monomorphic VT with an old anterior scar is usually scar-mediated re-entry. Urgent angiography is indicated for STEMI, polymorphic VT/VF suggesting active ischemia or ongoing ischemic symptoms — not reflexively. A small flat troponin rise is expected after shocks.',
          },
          {
            text: 'Disable the ICD with a magnet to stop the painful shocks',
            correct: false,
            feedback: 'These shocks are appropriate and life-saving. A magnet is for inappropriate shocks, or only when the patient is monitored and external defibrillation is immediately available.',
          },
          {
            text: 'Cardiac MRI to map the scar before any treatment',
            correct: false,
            feedback: 'Imaging can help plan ablation later, but it does not treat the storm, and moving an unstable patient to MRI is unsafe.',
          },
          {
            text: 'Replete K+ to ≥ 4.0 and Mg2+ to ≥ 2.0, start an amiodarone infusion, interrogate the ICD and search for triggers (HF, ischemia, thyroid, drugs, infection)',
            correct: true,
            feedback: 'Correct. Hypokalemia and hypomagnesemia lower the arrhythmia threshold and are quickly reversible. Interrogation confirms the shocks were appropriate and lets EP add antitachycardia pacing.',
          },
        ],
      },
      {
        id: 'vt-storm-3',
        stage: 'One hour later',
        prompt: 'What is the best next step?',
        update: 'Despite electrolyte correction and amiodarone (two 150 mg boluses plus infusion), monomorphic VT recurs every 10–15 minutes. BP between episodes 96/60.',
        options: [
          {
            text: 'Start isoproterenol to suppress pause-dependent VT',
            correct: false,
            feedback: 'Isoproterenol is used for pause-dependent torsades or Brugada/early repolarization storms. In scar-mediated VT it increases sympathetic drive and can worsen the storm.',
          },
          {
            text: 'Amiodarone 300 mg IV push every 5 minutes',
            correct: false,
            feedback: 'That is the pulseless-arrest dose. Repeated pushes cause hypotension and bradycardia without addressing the sympathetic drive.',
          },
          {
            text: 'Escalate sympatholysis: add lidocaine, deep sedation (intubate if needed), nonselective beta-blocker as BP allows, consider stellate ganglion block, and call EP for urgent ablation',
            correct: true,
            feedback: 'Correct. Sympathetic activation perpetuates storm. Lidocaine works well in ischemic tissue and combines with amiodarone. Ablation reduces recurrent VT and shocks (VANISH) and is often definitive for scar-related VT.',
          },
          {
            text: 'Start dobutamine to improve cardiac output between episodes',
            correct: false,
            feedback: 'Beta-agonist inotropes are proarrhythmic and fuel catecholamine-driven VT. If perfusion fails, mechanical support is preferred over adrenergic inotropes.',
          },
        ],
      },
      {
        id: 'vt-storm-4',
        stage: 'Complication',
        prompt: 'What is the most appropriate escalation?',
        update: 'VT is now incessant. MAP 55 during brief sinus runs despite norepinephrine; lactate 6.1 mmol/L; oliguric.',
        options: [
          {
            text: 'VA-ECMO (or another full-support device per center expertise) as a bridge to urgent catheter ablation, with advanced HF team involvement',
            correct: true,
            feedback: 'Correct. VA-ECMO supports the circulation independent of the rhythm, buys time for ablation and allows decisions about LVAD or transplant. Watch for LV distension that may need venting.',
          },
          {
            text: 'Insert an IABP — it provides full support during incessant VT',
            correct: false,
            feedback: 'An IABP adds only modest support (~0.5 L/min) and depends on a stable rhythm for timing, so it is unreliable during incessant VT.',
          },
          {
            text: 'Stop all antiarrhythmics because they may be proarrhythmic',
            correct: false,
            feedback: 'Withdrawing antiarrhythmics during incessant VT removes the main pharmacologic control while the problem persists.',
          },
          {
            text: 'Transfer to the ward and schedule outpatient ablation in 6 weeks',
            correct: false,
            feedback: 'Incessant VT with shock and a rising lactate is immediately life-threatening and needs ICU-level escalation now.',
          },
        ],
      },
    ],
  },

  'tamponade': {
    id: 'tamponade',
    title: 'Cardiac Tamponade',
    difficulty: 'advanced',
    ecgProfile: 'tamponade',
    heartRate: 118,
    vitals: { hr: 118, bp: '88/72', spo2: 93, rr: 26, temp: '37.2°C' },
    presentation: '48-year-old female with 3 days of progressive dyspnea and pleuritic chest pain, 2 weeks after a viral URI. Now hypotensive with a narrow pulse pressure, distended neck veins and muffled heart sounds.',
    history: 'Previously healthy. Recent viral illness. No medications or anticoagulants. No surgery or chest trauma. Unintentional 4 kg weight loss over 3 months.',
    physicalExam: 'Tachycardic, tachypneic, prefers sitting forward. Markedly elevated JVP with a blunted y descent. Muffled heart sounds. Pulsus paradoxus 18 mmHg. Clear lungs. No peripheral edema.',
    guidelines: [
      '1. Recognize tamponade: hypotension, raised JVP, tachycardia, pulsus paradoxus > 10 mmHg (Beck triad is often incomplete)',
      '2. Immediate bedside echo: effusion, RA systolic and RV diastolic collapse, plethoric IVC, exaggerated respiratory variation in inflow',
      '3. Urgent echo-guided pericardiocentesis for hemodynamic compromise',
      '4. While preparing: a small fluid bolus may transiently help (mainly if hypovolemic); do not delay drainage',
      '5. Avoid diuretics, vasodilators and, if at all possible, positive-pressure ventilation (can precipitate arrest)',
      '6. Needle approach chosen by echo: shortest path to the largest fluid pocket avoiding vital structures (subxiphoid, apical or parasternal)',
      '7. Leave a pigtail drain; remove when output is < ~30 mL/24 h',
      '8. Fluid studies: cell count, protein, LDH, glucose, Gram stain/culture, TB testing, cytology',
      '9. Etiologic workup: malignancy, TB, autoimmune disease, hypothyroidism, uremia, post-MI or post-procedure',
      '10. Surgical rather than needle drainage for hemopericardium from aortic dissection or free-wall rupture, and for purulent or loculated effusions',
    ],
    medications: [
      'Fluid bolus (e.g., 250–500 mL) as a temporizing measure',
      'Ibuprofen 600 mg TID or aspirin 750–1000 mg TID (if pericarditis)',
      'Colchicine 0.5 mg once or twice daily (weight-based) for ~3 months',
      'Avoid: diuretics, vasodilators, negative inotropes',
    ],
    keyInterventions: ['Bedside echocardiography', 'Echo-guided pericardiocentesis', 'Pericardial drain', 'Etiologic workup', 'Avoid positive-pressure ventilation before drainage'],
    pitfalls: [
      'Giving diuretics because the JVP is high',
      'Intubating before drainage (loss of venous return → arrest)',
      'Relying on Beck triad or missing pulsus paradoxus',
      'Delaying drainage for CT',
      'Assuming a viral cause for a large effusion without excluding malignancy and TB',
      'Needle pericardiocentesis for aortic dissection hemopericardium (needs surgery)',
    ],
    disposition: 'ICU/step-down with a pericardial drain and serial echo. Treat the underlying cause; surgical window if recurrent or loculated.',
    teaching: [
      'Beck triad is present in only a minority of cases; echo is the key diagnostic test',
      'Pulsus paradoxus > 10 mmHg reflects exaggerated ventricular interdependence with inspiration',
      'Electrical alternans is specific but insensitive for tamponade',
      'Rate of accumulation matters more than volume: 150–200 mL rapidly can cause tamponade, while > 1 L may be tolerated if slow',
      'RA systolic collapse is an early, sensitive sign (more specific if > 1/3 of the cycle); RV diastolic collapse is more specific',
      'Large effusions with tamponade more often have a specific cause (malignancy, TB, autoimmune) than small ones',
    ],
    decisions: [
      {
        id: 'tamponade-1',
        stage: 'Initial assessment',
        prompt: 'Hypotensive, tachycardic, distended neck veins, clear lungs, pulsus paradoxus 18 mmHg. What is the most useful immediate test?',
        options: [
          {
            text: 'Chest X-ray to look for a water-bottle heart',
            correct: false,
            feedback: 'A CXR needs > ~200 mL of fluid to enlarge the silhouette and cannot show tamponade physiology. It delays the test that changes management.',
          },
          {
            text: 'CT chest with contrast',
            correct: false,
            feedback: 'CT can show an effusion but means moving an unstable patient and delays bedside diagnosis. Tamponade is a clinical and echo diagnosis.',
          },
          {
            text: 'Bedside echocardiography (POCUS)',
            correct: true,
            feedback: 'Correct. Echo confirms the effusion, shows chamber collapse and a plethoric IVC, and guides needle drainage — all at the bedside.',
          },
          {
            text: 'BNP and troponin to differentiate heart failure',
            correct: false,
            feedback: 'Biomarkers take time and do not diagnose tamponade. Clear lungs with a high JVP and pulsus paradoxus point to tamponade rather than LV failure.',
          },
        ],
      },
      {
        id: 'tamponade-2',
        stage: 'Key diagnostic step',
        prompt: 'How do you interpret these findings?',
        update: 'Echo: large circumferential effusion (~2.5 cm), RA systolic collapse, RV early-diastolic collapse, IVC 2.4 cm without respiratory variation, mitral inflow variation 35%. ECG: sinus tachycardia 118, low voltage, electrical alternans.',
        options: [
          {
            text: 'Tamponade physiology — pericardial pressure exceeds right-heart filling pressure; urgent drainage is needed',
            correct: true,
            feedback: 'Correct. RA/RV collapse, a plethoric IVC and exaggerated respiratory inflow variation confirm tamponade physiology. With hypotension, urgent drainage is indicated.',
          },
          {
            text: 'The plethoric IVC means volume overload — give furosemide',
            correct: false,
            feedback: 'The IVC is plethoric because the right heart cannot fill against pericardial pressure, not from excess volume. Diuretics reduce preload and can precipitate arrest.',
          },
          {
            text: 'Electrical alternans means uncomplicated pericarditis',
            correct: false,
            feedback: 'Electrical alternans reflects the heart swinging within a large effusion — a specific (though insensitive) sign of tamponade, not of simple pericarditis.',
          },
          {
            text: 'RV collapse indicates RV infarction',
            correct: false,
            feedback: 'RV infarction causes a dilated, hypokinetic RV, not diastolic collapse. Collapse occurs when pericardial pressure exceeds RV diastolic pressure.',
          },
        ],
      },
      {
        id: 'tamponade-3',
        stage: 'Preparing for drainage',
        prompt: 'What is the best interim management?',
        update: 'BP 82/66 and falling, RR 30, SpO2 91%. The pericardiocentesis kit will be ready in 10 minutes. A colleague proposes intubation for work of breathing.',
        options: [
          {
            text: 'Rapid sequence intubation to protect the airway first',
            correct: false,
            feedback: 'Induction agents vasodilate, and positive pressure reduces venous return to an already compressed right heart — a classic precipitant of arrest. Drain first; if intubation is unavoidable, do it with drainage ready.',
          },
          {
            text: 'Nitroglycerin infusion to reduce the high venous pressure',
            correct: false,
            feedback: 'Preload is what keeps the compressed RV filling. Venodilation drops cardiac output further.',
          },
          {
            text: 'Defer drainage until high-dose vasopressors stabilize the BP',
            correct: false,
            feedback: 'Vasopressors are at best a brief bridge. Removing the fluid is the definitive therapy, and waiting for a stability that will not come is dangerous.',
          },
          {
            text: 'Supplemental O2, a small fluid bolus, avoid positive-pressure ventilation, and proceed to echo-guided pericardiocentesis as soon as possible',
            correct: true,
            feedback: 'Correct. A modest bolus may transiently raise filling pressure, especially if hypovolemic. Because the pericardial pressure–volume curve is steep, removing even 50–100 mL often produces a dramatic improvement.',
          },
        ],
      },
      {
        id: 'tamponade-4',
        stage: 'After drainage',
        prompt: 'Which plan is most appropriate?',
        update: 'Echo-guided subxiphoid pericardiocentesis removes 650 mL of hemorrhagic fluid; BP 124/78, HR 92. A pigtail drain is left in place. The fluid is exudative; cytology is pending.',
        options: [
          {
            text: 'Remove the drain now and discharge on ibuprofen',
            correct: false,
            feedback: 'Large effusions often re-accumulate. Leave the drain until output is < ~30 mL/24 h and establish the cause before discharge.',
          },
          {
            text: 'Admit with the drain; send cytology, cultures and TB testing; evaluate for malignancy, autoimmune disease and hypothyroidism; NSAID + colchicine if pericarditis is confirmed',
            correct: true,
            feedback: 'Correct. A large hemorrhagic exudate with weight loss raises concern for malignancy or TB — specific causes are more likely in large effusions. Treatment follows the etiology.',
          },
          {
            text: 'High-dose prednisone as first-line therapy',
            correct: false,
            feedback: 'Steroids are second-line in pericarditis, increase recurrence and must be avoided until TB and bacterial infection are excluded.',
          },
          {
            text: 'Immediate surgical pericardial window for every effusion',
            correct: false,
            feedback: 'Surgery is reserved for recurrent, loculated or purulent effusions, failed needle drainage, or traumatic/aortic hemopericardium. Needle drainage worked here.',
          },
        ],
      },
    ],
  },

  'pe-presentation': {
    id: 'pe-presentation',
    title: 'Pulmonary Embolism',
    difficulty: 'intermediate',
    ecgProfile: 'pulmonary-embolism',
    heartRate: 112,
    vitals: { hr: 112, bp: '108/72', spo2: 89, rr: 28, temp: '37.4°C' },
    presentation: '42-year-old female with sudden dyspnea and pleuritic chest pain 2 days after a 12-hour international flight. No prior VTE.',
    history: 'Combined estrogen oral contraceptive. BMI 32. Sedentary. Recent long-haul flight. No prior VTE. Mother had DVT.',
    physicalExam: 'Tachycardic, tachypneic, anxious. Heart: loud P2, no murmur. Lungs: clear. Right calf swollen and tender (3 cm larger than the left). SpO2 89% on room air.',
    guidelines: [
      '1. Assess hemodynamic stability first (high-risk PE = sustained SBP < 90 mmHg, vasopressor need or cardiac arrest)',
      '2. Estimate pretest probability (Wells or revised Geneva); use D-dimer only when PE is unlikely',
      '3. Supplemental O2 for SpO2 < 90%; avoid intubation if possible',
      '4. Start anticoagulation while awaiting imaging when probability is high and bleeding risk acceptable',
      '5. CT pulmonary angiography is the diagnostic test of choice; bedside echo if too unstable for CT (RV dilation, McConnell sign)',
      '6. Anticoagulation: LMWH preferred for most; UFH (80 U/kg bolus → 18 U/kg/h) if reperfusion may be needed or with severe renal failure',
      '7. Risk stratify with RV assessment (CT/echo), troponin, BNP and PESI/sPESI: intermediate-high vs intermediate-low vs low risk',
      '8. High-risk (massive) PE: systemic thrombolysis (alteplase 100 mg over 2 h) unless contraindicated',
      '9. Intermediate-high risk: anticoagulate and monitor closely; rescue reperfusion (lysis, catheter-directed therapy or embolectomy) if she deteriorates',
      '10. Transition to a DOAC (e.g., apixaban or rivaroxaban) for ≥ 3 months; stop estrogen-containing contraception',
    ],
    medications: [
      'Enoxaparin 1 mg/kg SC q12h (or UFH 80 U/kg → 18 U/kg/h)',
      'Alteplase 100 mg IV over 2 h (high-risk PE)',
      'Apixaban 10 mg BID ×7 d → 5 mg BID',
      'Rivaroxaban 15 mg BID ×21 d → 20 mg daily',
      'Norepinephrine if hypotensive',
      'Supplemental O2 if SpO2 < 90%',
    ],
    keyInterventions: ['CT pulmonary angiography', 'Early anticoagulation', 'RV and biomarker risk stratification', 'PE response team consultation', 'Rescue reperfusion if she deteriorates'],
    pitfalls: [
      'D-dimer testing when pretest probability is high',
      'Delaying anticoagulation while awaiting CT',
      'Routine systemic lysis for normotensive intermediate-high-risk PE',
      'Large fluid boluses that overdistend the failing RV',
      'Rapid sequence intubation in RV failure (can precipitate arrest)',
    ],
    disposition: 'Admit to step-down/ICU (intermediate-high risk) with close monitoring. Anticoagulate ≥ 3 months, stop estrogen, and decide on duration by whether the VTE was provoked.',
    teaching: [
      'Dyspnea, pleuritic pain and hemoptysis together are uncommon; keep a low threshold to test',
      'Sinus tachycardia is the most common ECG finding; S1Q3T3 is specific but insensitive',
      'RV/LV diameter ratio ≥ 1.0 on CTPA (ESC) indicates RV dysfunction; with elevated troponin = intermediate-high risk',
      'sPESI 0 or Hestia-negative patients can often be treated as outpatients',
      'PEITHO: systemic lysis in intermediate-high-risk PE prevented decompensation but increased major and intracranial bleeding',
    ],
    decisions: [
      {
        id: 'pe-presentation-1',
        stage: 'Initial assessment',
        prompt: 'HR 112, SpO2 89%, unilateral calf swelling, BP 108/72; PE is the most likely diagnosis. What is the best diagnostic approach?',
        options: [
          {
            text: 'D-dimer first; order CT only if it is positive',
            correct: false,
            feedback: 'Her Wells score is ~7.5 (DVT signs 3, PE most likely 3, HR > 100 1.5) — PE likely. A negative D-dimer cannot safely exclude PE at this probability, so it only delays imaging.',
          },
          {
            text: 'Apply the PERC rule to rule out PE',
            correct: false,
            feedback: 'PERC applies only when clinical gestalt is low, and she fails several criteria (HR ≥ 100, SpO2 < 95%, estrogen use, unilateral leg swelling).',
          },
          {
            text: 'Start anticoagulation (if no contraindication) and go directly to CT pulmonary angiography',
            correct: true,
            feedback: 'Correct. With high pretest probability, anticoagulation should start while imaging is obtained, and CTPA is the test of choice.',
          },
          {
            text: 'V/Q scan as the first-line test',
            correct: false,
            feedback: 'V/Q scanning is an alternative when CT contrast is contraindicated (severe allergy, renal failure) or in pregnancy; CTPA is preferred here.',
          },
        ],
      },
      {
        id: 'pe-presentation-2',
        stage: 'Key diagnostic step',
        prompt: 'How do you risk-stratify this PE?',
        update: 'CTPA: bilateral main and lobar pulmonary emboli; RV/LV ratio 1.3. hs-troponin and NT-proBNP elevated. BP 106/70, HR 110, SpO2 94% on 2 L.',
        options: [
          {
            text: 'High-risk (massive) — give systemic thrombolysis now',
            correct: false,
            feedback: 'High-risk PE requires hemodynamic instability: SBP < 90 mmHg for ≥ 15 min, vasopressor need or cardiac arrest. She is normotensive.',
          },
          {
            text: 'Intermediate-high risk (submassive): RV dysfunction plus elevated troponin without hemodynamic instability',
            correct: true,
            feedback: 'Correct. RV dysfunction on imaging plus a positive troponin defines ESC intermediate-high risk — patients at risk of decompensation who need close monitoring.',
          },
          {
            text: 'Intermediate-low risk',
            correct: false,
            feedback: 'Intermediate-low risk means only one (or neither) of RV dysfunction and troponin elevation is present. She has both.',
          },
          {
            text: 'Low risk — suitable for outpatient DOAC',
            correct: false,
            feedback: 'RV dysfunction, elevated biomarkers and hypoxemia exclude outpatient management.',
          },
        ],
      },
      {
        id: 'pe-presentation-3',
        stage: 'Treatment',
        prompt: 'Which management is most appropriate now?',
        options: [
          {
            text: 'Therapeutic anticoagulation (UFH if reperfusion may be needed soon), a monitored bed, PE response team consultation, and rescue reperfusion if she deteriorates',
            correct: true,
            feedback: 'Correct. Anticoagulation is the cornerstone, and UFH is easily stopped if reperfusion becomes necessary. Catheter-directed therapy is an option for selected patients, guided by a PE response team.',
          },
          {
            text: 'Full-dose alteplase 100 mg to prevent deterioration',
            correct: false,
            feedback: 'In PEITHO, routine lysis for intermediate-high-risk PE reduced hemodynamic decompensation but increased major bleeding and hemorrhagic stroke without lowering mortality. Lysis is reserved for those who decompensate.',
          },
          {
            text: 'IVC filter and withhold anticoagulation',
            correct: false,
            feedback: 'Filters are for patients who cannot be anticoagulated. They do not treat the existing clot and increase later DVT risk.',
          },
          {
            text: 'Aggressive 2–3 L crystalloid bolus to support the RV',
            correct: false,
            feedback: 'A pressure-overloaded RV dilates further with large volumes, shifting the septum and reducing LV filling. Fluids, if any, should be cautious (≤ ~500 mL).',
          },
        ],
      },
      {
        id: 'pe-presentation-4',
        stage: '6 hours later',
        prompt: 'What is the next step?',
        update: 'HR 134, BP 78/50 for 20 minutes, SpO2 86% on 6 L, lactate 4.1 mmol/L, new confusion. Bedside echo: severely dilated, hypokinetic RV. No bleeding risk factors.',
        options: [
          {
            text: 'Systemic thrombolysis (alteplase 100 mg over 2 h), norepinephrine for BP and cautious fluids; surgical or catheter embolectomy if lysis is contraindicated or fails',
            correct: true,
            feedback: 'Correct. She now has high-risk PE, and reperfusion is indicated. Norepinephrine supports RV perfusion pressure. Avoid intubation if possible — induction and positive pressure can cause RV collapse and arrest.',
          },
          {
            text: 'Immediate rapid sequence intubation with standard induction doses',
            correct: false,
            feedback: 'Induction agents drop SVR, and positive pressure raises RV afterload and reduces venous return — a common cause of peri-intubation arrest in massive PE. Support oxygenation non-invasively and treat the clot.',
          },
          {
            text: 'Increase the heparin rate and recheck in 6 hours',
            correct: false,
            feedback: 'Anticoagulation prevents propagation but does not rapidly reduce clot burden. Hemodynamic collapse requires reperfusion now.',
          },
          {
            text: 'Give 3 L of crystalloid to raise the BP',
            correct: false,
            feedback: 'Large volumes worsen RV dilation and septal shift. Vasopressors and reperfusion treat the cause.',
          },
        ],
      },
    ],
  },

  'aortic-dissection': {
    id: 'aortic-dissection',
    title: 'Aortic Dissection',
    difficulty: 'advanced',
    ecgProfile: 'aortic-dissection',
    heartRate: 102,
    vitals: { hr: 102, bp: '198/112', spo2: 97, rr: 22, temp: '36.9°C' },
    presentation: '68-year-old male with sudden, maximal-at-onset tearing chest pain radiating to the back. BP 198/112 in the right arm vs 162/88 in the left.',
    history: 'Poorly controlled hypertension; aortic root 4.2 cm on a prior echo. Tall with long limbs (Marfanoid habitus). Non-adherent to amlodipine and losartan.',
    physicalExam: 'Severe distress, diaphoretic. Inter-arm SBP difference 36 mmHg with a weaker left radial pulse. Heart: early diastolic decrescendo murmur at the left sternal border (aortic regurgitation). Lungs: clear. Neuro: intact.',
    guidelines: [
      '1. Suspect dissection: abrupt severe chest/back pain, pulse or BP differential, new AR murmur, focal neuro deficit, known aortic disease or connective tissue disorder',
      '2. Withhold antiplatelets, anticoagulants and fibrinolytics until dissection is excluded',
      '3. IV opioid analgesia (pain drives the catecholamine surge)',
      '4. IV beta-blocker first (esmolol or labetalol) to HR ~60 bpm',
      '5. Then add a vasodilator (nicardipine, clevidipine or nitroprusside) to reach SBP ≤ 120 mmHg, or the lowest level that maintains perfusion',
      '6. Never start a vasodilator before beta-blockade (reflex tachycardia increases aortic wall stress)',
      '7. Imaging: CT angiography chest/abdomen/pelvis; TEE if too unstable for CT; bedside TTE for AR, effusion and flap',
      '8. Type A (ascending aorta): emergency surgery — call cardiac surgery immediately',
      '9. Type B: anti-impulse therapy; TEVAR if complicated (malperfusion, rupture, refractory pain or hypertension, rapid expansion)',
      '10. Type and crossmatch; arterial line in the arm with the higher pressure',
    ],
    medications: [
      'Esmolol 500 mcg/kg bolus → 50–300 mcg/kg/min',
      'Labetalol 20 mg IV, then repeat/escalate or infusion',
      'Nicardipine 5–15 mg/h (after beta-blockade)',
      'Fentanyl IV titrated for pain',
      'Diltiazem if beta-blockers are contraindicated',
    ],
    keyInterventions: ['Anti-impulse therapy (HR, then BP)', 'CT angiography', 'Immediate cardiac surgery consult for Type A', 'Analgesia', 'Withhold antithrombotics'],
    pitfalls: [
      'Vasodilators before beta-blockade',
      'Treating as ACS with antiplatelets, anticoagulants or lytics',
      'Using D-dimer to "rule out" dissection in a high-risk patient',
      'Not checking bilateral arm BPs and pulses',
      'Delaying surgical consultation for Type A while awaiting further tests',
      'Missing dissection into the RCA ostium that presents as inferior STEMI',
    ],
    disposition: 'Type A: emergency surgical repair. Type B: ICU with IV anti-impulse therapy, transition to oral agents; TEVAR if complicated.',
    teaching: [
      'Untreated Type A dissection mortality has been estimated at ~1–2% per hour early on',
      'Type B uncomplicated = medical therapy; complicated (malperfusion, rupture, refractory pain or hypertension) = TEVAR',
      'Rate control before pressure control reduces dP/dt and aortic wall shear stress',
      'ADD-RS ≤ 1 plus D-dimer < 500 ng/mL can help rule out dissection in LOW-risk patients only; high-risk patients go straight to imaging',
      'A normal chest X-ray does not exclude dissection',
      'Dissection can involve the coronary ostia (usually the RCA) and mimic STEMI',
    ],
    decisions: [
      {
        id: 'aortic-dissection-1',
        stage: 'Triage',
        prompt: 'Triage started the chest pain protocol and asks about giving aspirin 324 mg and heparin. What do you do?',
        options: [
          {
            text: 'Give aspirin and heparin now; the ECG will clarify things later',
            correct: false,
            feedback: 'Antithrombotics in aortic dissection increase bleeding, rupture and tamponade risk. With high-risk features, dissection must be excluded first.',
          },
          {
            text: 'Hold antithrombotics: abrupt tearing pain, BP differential, AR murmur and a Marfanoid habitus with a dilated root = high-risk dissection (ADD-RS 3); go straight to imaging',
            correct: true,
            feedback: 'Correct. ADD-RS gives one point per category: high-risk condition (Marfan features, known aortic disease), high-risk pain (abrupt, severe, tearing) and high-risk exam (pulse/BP deficit, new AR murmur, neuro deficit). A score ≥ 2 means immediate aortic imaging.',
          },
          {
            text: 'Send a D-dimer and image only if it is > 500 ng/mL',
            correct: false,
            feedback: 'D-dimer can help rule out dissection only in low-risk (ADD-RS ≤ 1) patients. In high-risk patients a negative D-dimer does not exclude it.',
          },
          {
            text: 'Give SL nitroglycerin for the pain and hypertension',
            correct: false,
            feedback: 'A vasodilator before beta-blockade causes reflex tachycardia, increasing dP/dt and shear stress on the dissected aorta.',
          },
        ],
      },
      {
        id: 'aortic-dissection-2',
        stage: 'Key diagnostic step',
        prompt: 'What is the best next step for diagnosis and planning?',
        update: 'ECG: sinus tachycardia 102 with LVH, no ST elevation. Bedside TTE: aortic root 5.0 cm with a mobile intimal flap, moderate AR, no pericardial effusion. Creatinine 1.0 mg/dL.',
        options: [
          {
            text: 'Coronary angiography first to exclude ACS',
            correct: false,
            feedback: 'Catheter manipulation can extend the dissection, and it delays surgery. There is no ST elevation; if the dissection involves a coronary ostium, surgery addresses it.',
          },
          {
            text: 'MRI of the aorta',
            correct: false,
            feedback: 'MRI is accurate but slow and takes the patient away from close monitoring — not appropriate for acute, unstable dissection.',
          },
          {
            text: 'CT angiography of the chest, abdomen and pelvis now, with cardiac surgery called in parallel',
            correct: true,
            feedback: 'Correct. CTA defines the entry tear, extent (Stanford A vs B), branch-vessel involvement and malperfusion. A flap in the ascending aorta on TTE already justifies immediate surgical notification.',
          },
          {
            text: 'Chest X-ray — a widened mediastinum is enough to proceed',
            correct: false,
            feedback: 'CXR is neither sensitive nor specific — it is normal in a significant minority of dissections — and cannot classify the dissection.',
          },
        ],
      },
      {
        id: 'aortic-dissection-3',
        stage: 'Treatment',
        prompt: 'BP 198/112, HR 102, pain 9/10. Which anti-impulse regimen is best?',
        options: [
          {
            text: 'Nicardipine infusion alone to lower BP quickly',
            correct: false,
            feedback: 'Dihydropyridines and other vasodilators cause reflex tachycardia, increasing the force of ejection (dP/dt) on the aortic wall. Beta-blockade must come first.',
          },
          {
            text: 'IV opioid analgesia plus esmolol (or labetalol) to HR ~60, then add nicardipine or nitroprusside if SBP remains > 120',
            correct: true,
            feedback: 'Correct. Reducing HR and contractility first lowers aortic wall stress; vasodilators are added afterward for BP. Analgesia reduces the catecholamine drive.',
          },
          {
            text: 'Hydralazine 10 mg IV',
            correct: false,
            feedback: 'Hydralazine causes unpredictable BP drops and reflex tachycardia — the opposite of anti-impulse therapy.',
          },
          {
            text: 'Lower BP by only 25% in the first hour, as for other hypertensive emergencies',
            correct: false,
            feedback: 'Aortic dissection is an exception to the gradual-reduction rule: target SBP ≤ 120 mmHg (or the lowest tolerated) rapidly, ideally within the first hour.',
          },
        ],
      },
      {
        id: 'aortic-dissection-4',
        stage: 'Complication',
        prompt: 'What is the most appropriate action?',
        update: 'CTA: Stanford type A dissection from the aortic root to the iliac arteries. While awaiting the OR, BP suddenly falls to 76/40 with JVD, muffled heart sounds and new pericardial fluid on echo.',
        options: [
          {
            text: 'Continue esmolol to keep HR ~60',
            correct: false,
            feedback: 'He is now in shock; beta-blockade removes compensatory tachycardia and must be stopped.',
          },
          {
            text: 'Full pericardiocentesis in the ED to normalize BP before surgery',
            correct: false,
            feedback: 'Rapidly evacuating the pericardium restores high aortic pressure and can extend the tear or accelerate bleeding.',
          },
          {
            text: 'Emergent transfer to the OR for surgical repair; if arrest is imminent before surgery, only controlled small-volume pericardial drainage',
            correct: true,
            feedback: 'Correct. This is hemopericardium from rupture into the pericardium, and surgery is the definitive treatment. Aggressive needle drainage can restore high aortic pressure and worsen bleeding; only controlled drainage to keep the patient alive until the OR is acceptable.',
          },
          {
            text: 'Arrange TEVAR, the preferred repair for type A',
            correct: false,
            feedback: 'TEVAR treats complicated type B dissection. Type A (ascending aorta) requires open surgical repair.',
          },
        ],
      },
    ],
  },

  'cardiogenic-shock': {
    id: 'cardiogenic-shock',
    title: 'Cardiogenic Shock',
    difficulty: 'expert',
    ecgProfile: 'cardiogenic-shock',
    heartRate: 110,
    vitals: { hr: 110, bp: '76/52', spo2: 86, rr: 32, temp: '35.8°C', gcs: 12 },
    presentation: '70-year-old male presenting ~6 hours after the onset of an anterior STEMI, delayed by a rural location. Now in cardiogenic shock with pulmonary edema and altered mental status.',
    history: 'DM2, HTN, prior PCI to the RCA 3 years ago. LVEF 45% on the last echo.',
    physicalExam: 'Drowsy and confused (GCS 12), cold and clammy. Heart: tachycardic, S3 gallop, new soft apical systolic murmur. Lungs: diffuse crackles. JVD present. Mottled knees; oliguric.',
    guidelines: [
      '1. Recognize STEMI-related cardiogenic shock (SBP < 90 with hypoperfusion; SCAI stage C or worse) and activate a shock team',
      '2. Emergency coronary angiography and PCI regardless of time from symptom onset; transfer to a PCI center if needed',
      '3. Respiratory support: O2/NIV if alert and protecting the airway; intubation for refractory hypoxemia or worsening mentation, with vasopressor ready',
      '4. Norepinephrine is the first-line vasopressor (target MAP ≥ 65 mmHg)',
      '5. Add an inotrope (dobutamine; milrinone if no hypotension or renal failure) for persistent low output',
      '6. Urgent echo for LV/RV function and mechanical complications (papillary muscle rupture, VSR, free-wall rupture)',
      '7. Culprit-lesion-only PCI in multivessel disease (CULPRIT-SHOCK); stage non-culprit lesions',
      '8. Selected LV-predominant STEMI shock: a microaxial flow pump (e.g., Impella CP) may be reasonable (DanGer Shock); routine IABP or VA-ECMO is not recommended',
      '9. PA catheter to guide therapy: CI, PCWP, RAP, cardiac power output, PAPi',
      '10. Targets: MAP ≥ 65, falling lactate, UOP > 0.5 mL/kg/h; evaluate for advanced therapies if not recovering',
    ],
    medications: [
      'Norepinephrine titrated to MAP ≥ 65',
      'Dobutamine 2.5–20 mcg/kg/min (lowest effective dose)',
      'Milrinone 0.125–0.75 mcg/kg/min (no bolus; renal dosing)',
      'UFH during PCI/MCS',
      'Aspirin + P2Y12 inhibitor',
      'Furosemide once perfusion is restored if congested',
    ],
    keyInterventions: ['Emergency PCI of the culprit lesion', 'Norepinephrine ± inotrope', 'Echo for mechanical complications', 'Shock team / MCS decision', 'PA catheter-guided therapy'],
    pitfalls: [
      'Fibrinolysis or delayed transfer when PCI is achievable',
      'Immediate multivessel PCI (CULPRIT-SHOCK: more death or renal failure)',
      'Dopamine instead of norepinephrine (more arrhythmias, SOAP II)',
      'Missing a mechanical complication on echo',
      'Large fluid boluses when PCWP is already high',
      'Over-diuresis in RV failure',
    ],
    disposition: 'CCU with invasive hemodynamic monitoring. Advanced HF team evaluation for durable LVAD or transplant if not recovering.',
    teaching: [
      'Cardiogenic shock complicates ~5–10% of STEMI; in-hospital mortality remains ~40–50%',
      'SHOCK trial: early revascularization did not reduce 30-day mortality but improved 6- and 12-month survival',
      'SOAP II: dopamine caused more arrhythmias than norepinephrine and higher mortality in the cardiogenic shock subgroup',
      'IABP-SHOCK II: routine IABP did not reduce mortality',
      'DanGer Shock: a microaxial pump lowered 180-day mortality in selected STEMI shock patients, at the cost of more bleeding, limb ischemia and renal replacement therapy',
      'ECLS-SHOCK: routine early VA-ECMO did not reduce 30-day mortality and increased complications',
    ],
    decisions: [
      {
        id: 'cardiogenic-shock-1',
        stage: 'Rural ED',
        prompt: 'Anterior STEMI ~6 h old, BP 76/52, cold and wet, lactate 5.8 mmol/L. The nearest PCI center is 70 minutes away by air. What is the priority?',
        options: [
          {
            text: 'Give tenecteplase and admit locally',
            correct: false,
            feedback: 'Fibrinolysis is less effective in cardiogenic shock (low coronary perfusion pressure) and does not replace revascularization. Emergency PCI is recommended for STEMI with shock regardless of time from onset; lysis is a fallback only when PCI is truly unavailable.',
          },
          {
            text: 'Immediate transfer for emergency angiography/PCI, with norepinephrine, aspirin, anticoagulation and respiratory support en route',
            correct: true,
            feedback: 'Correct. Early revascularization improves 6- and 12-month survival in STEMI shock (SHOCK trial), even with a delayed presentation. Norepinephrine supports MAP during transport.',
          },
          {
            text: 'A 2 L crystalloid bolus to correct hypotension before transfer',
            correct: false,
            feedback: 'He has pulmonary edema and JVD; a large bolus worsens hypoxemia. A small cautious bolus is reasonable only without congestion (e.g., suspected RV infarction).',
          },
          {
            text: 'Wait for a repeat troponin to confirm the MI',
            correct: false,
            feedback: 'STEMI is diagnosed on the ECG; troponin does not change the need for emergency revascularization.',
          },
        ],
      },
      {
        id: 'cardiogenic-shock-2',
        stage: 'Before transfer',
        prompt: 'He has a new soft apical systolic murmur. Why does this matter, and what do you do?',
        options: [
          {
            text: 'Probably a flow murmur from tachycardia — no action needed',
            correct: false,
            feedback: 'A new murmur in post-MI shock is a mechanical complication until proven otherwise; missing it changes the treatment entirely.',
          },
          {
            text: 'Suspected endocarditis — draw blood cultures first',
            correct: false,
            feedback: 'Endocarditis is not the concern 6 hours into a STEMI. The time-critical question is whether a papillary muscle or the septum has ruptured.',
          },
          {
            text: 'Aortic stenosis — avoid nitrates and proceed',
            correct: false,
            feedback: 'An apical systolic murmur in this setting suggests MR or a ventricular septal rupture, not AS. Echo is needed to tell.',
          },
          {
            text: 'A mechanical complication (papillary muscle rupture or ventricular septal rupture) must be excluded with urgent echo',
            correct: true,
            feedback: 'Correct. Mechanical complications are more frequent with late presentation or no reperfusion and need surgical or transcatheter repair. Murmurs may be soft or even absent when cardiac output is very low.',
          },
        ],
      },
      {
        id: 'cardiogenic-shock-3',
        stage: 'Cath lab',
        prompt: 'What is the revascularization strategy?',
        update: 'Echo: LVEF ~20%, anterior/apical akinesis, mild functional MR, intact septum, no effusion, normal RV size. On norepinephrine 0.2 mcg/kg/min, BP 84/56. Angiography: occluded proximal LAD (culprit), 80% RCA and 70% LCx stenoses.',
        options: [
          {
            text: 'Immediate multivessel PCI of all three vessels',
            correct: false,
            feedback: 'In CULPRIT-SHOCK, immediate multivessel PCI increased 30-day death or renal replacement therapy compared with culprit-only PCI. Non-culprit lesions are staged later if needed.',
          },
          {
            text: 'Defer PCI until he is hemodynamically stable',
            correct: false,
            feedback: 'Restoring flow in the culprit artery is what reverses the shock. Waiting for a stability that depends on reperfusion is circular and lethal.',
          },
          {
            text: 'PCI of the culprit LAD only now; stage non-culprit lesions',
            correct: true,
            feedback: 'Correct. Culprit-only PCI is the default in STEMI shock. Emergency CABG is reserved for anatomy unsuitable for PCI or for mechanical complications.',
          },
          {
            text: 'Emergency CABG for every patient with three-vessel disease and shock',
            correct: false,
            feedback: 'CABG is an option when PCI is not feasible or with mechanical complications, but it is not the default in STEMI shock with a clear culprit lesion.',
          },
        ],
      },
      {
        id: 'cardiogenic-shock-4',
        stage: 'After PCI',
        prompt: 'What is the best next step?',
        update: 'LAD stented with TIMI 3 flow. MAP 58 on norepinephrine plus dobutamine 5 mcg/kg/min. PA catheter: CI 1.6 L/min/m², PCWP 28 mmHg, RAP 10 mmHg (RAP/PCWP 0.36). Lactate 7.2 mmol/L and rising; urine 10 mL/h.',
        options: [
          {
            text: 'Add dopamine 20 mcg/kg/min',
            correct: false,
            feedback: 'Stacking catecholamines raises myocardial oxygen demand and arrhythmia risk; dopamine performed worse than norepinephrine in cardiogenic shock (SOAP II).',
          },
          {
            text: 'Shock-team escalation to a microaxial flow pump (LV-predominant failure, adequate RV), with close monitoring for bleeding, limb ischemia and hemolysis',
            correct: true,
            feedback: 'Correct. Low CI with high PCWP and a low RAP/PCWP ratio indicates LV-predominant failure. In DanGer Shock, a microaxial pump reduced 180-day mortality in selected STEMI shock patients, at the cost of more complications. Biventricular failure would prompt VA-ECMO or RV support instead.',
          },
          {
            text: 'A 1 L fluid bolus to increase cardiac output',
            correct: false,
            feedback: 'PCWP is already 28 mmHg — the left heart is overfilled. Fluid will worsen pulmonary edema without improving output.',
          },
          {
            text: 'Insert an IABP, which has proven mortality benefit',
            correct: false,
            feedback: 'IABP-SHOCK II showed no mortality benefit from routine IABP in MI-related shock, and guidelines no longer recommend routine use.',
          },
        ],
      },
    ],
  },
};
