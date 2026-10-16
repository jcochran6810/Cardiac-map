import type { ProcedureContent } from '../../types/content';

/**
 * Procedures A: cath lab and electrophysiology / device procedures.
 * Educational content only. Values and thresholds reflect major guidelines
 * (ACC/AHA/SCAI, ESC, HRS) as of authoring; verify against local protocols.
 */
export const PROCEDURES_A: Record<string, ProcedureContent> = {
  // ─── Cath Lab ──────────────────────────────────────────────────────────────

  'coronary-angiography': {
    id: 'coronary-angiography',
    name: 'Coronary Angiography',
    category: 'Cath Lab',
    summary:
      'Invasive X-ray imaging of the coronary arteries using catheters and iodinated contrast to show where and how severely they are narrowed. It remains the reference standard for coronary anatomy and guides the choice between PCI, CABG and medical therapy.',
    levelNotes: [
      'For suspected STEMI, early recognition, a transmitted 12-lead and direct transport to a PCI-capable center shorten the time to angiography and reperfusion.',
      'Pre-activating the cath lab from the field for STEMI, giving aspirin and placing defibrillator pads before transfer save critical minutes.',
      'After the cath, check the access site and distal pulses, and suspect retroperitoneal bleeding (hypotension, back or flank pain, falling Hb) after femoral access.',
      'Know the standard projections and that angiography is a lumenogram that poorly predicts lesion physiology, so intermediate lesions need FFR/iFR or intravascular imaging.',
      'Use radial-first access, choose catheters to suit the aortic root and access route, and recognize pressure damping or ventricularization before any injection.',
    ],
    overview: [
      'Selective contrast injection into the left and right coronary ostia under fluoroscopy',
      'Reference standard for defining coronary anatomy, stenosis location and extent of disease',
      'Visual stenosis ≥ 70% (≥ 50% for left main) is traditionally considered significant',
      'Often combined with left heart catheterization (LVEDP, ventriculography)',
      'Performed emergently (STEMI), urgently (high-risk NSTE-ACS) or electively (stable symptoms)',
      'A diagnostic study alone typically takes ~20–40 minutes',
    ],
    indications: [
      'STEMI for primary PCI (FMC-to-device goal ≤ 90 min, ≤ 120 min including transfer)',
      'NSTE-ACS: immediate if unstable or refractory ischemia, early (< 24 h) if high risk',
      'Resuscitated cardiac arrest with ST elevation or suspected ischemic cause',
      'Stable angina refractory to medical therapy or high-risk noninvasive test results',
      'New unexplained LV systolic dysfunction or cardiomyopathy work-up',
      'Before valve surgery or other cardiac surgery to define coronary anatomy',
    ],
    contraindications: [
      'No absolute contraindication when angiography is emergently indicated (e.g., STEMI)',
      'Relative: active bleeding or uncorrected severe coagulopathy',
      'Relative: acute kidney injury or advanced CKD (weigh benefit, minimize contrast)',
      'Relative: prior severe contrast reaction (premedication per protocol)',
      'Relative: decompensated heart failure unable to lie flat, uncontrolled hypertension',
      'Relative: fever/active infection, severe hypokalemia, digoxin toxicity',
      'Patient refusal or not a candidate for any revascularization',
    ],
    anatomy: [
      'Left main divides into LAD and LCx, sometimes trifurcating with a ramus intermedius',
      'LAD gives diagonals and septal perforators: anterior wall, apex and anterior 2/3 of septum',
      'LCx runs in the left AV groove and gives obtuse marginals to the lateral wall',
      'RCA runs in the right AV groove: conus, SA nodal (~60%), acute marginal branches',
      'Dominance = artery giving the PDA; most people (~70–85%) are right dominant',
      'Radial route: radial → brachial → subclavian → brachiocephalic (right) → ascending aorta',
    ],
    accessSite:
      'Radial artery preferred (right or left, distal radial an option); common femoral artery when radial is unsuitable or large-bore access is needed',
    steps: [
      {
        title: 'Pre-procedure checks',
        description:
          'Confirm indication and consent; review allergies, creatinine/eGFR, hemoglobin, potassium and anticoagulant timing; start IV hydration if at risk of contrast-associated AKI.',
      },
      {
        title: 'Arterial access',
        description:
          'Ultrasound-guided radial (or femoral) puncture with a micropuncture or modified Seldinger technique and sheath insertion.',
      },
      {
        title: 'Radial cocktail and anticoagulation',
        description:
          'Give a vasodilator (e.g., verapamil and/or nitroglycerin) to reduce spasm and weight-based heparin (commonly ~50 U/kg or 5,000 units) to prevent radial artery occlusion.',
      },
      {
        title: 'Advance the catheter',
        description:
          'Advance a diagnostic catheter over a J-wire to the ascending aorta under fluoroscopy, then aspirate and flush to clear air and debris.',
      },
      {
        title: 'Engage the left coronary',
        description:
          'Engage the left main ostium, confirm an undamped pressure waveform, then inject contrast in multiple orthogonal projections.',
      },
      {
        title: 'Engage the right coronary',
        description:
          'Engage the RCA and image in LAO and RAO/cranial views; avoid deep or wedged injection, which can cause VF (especially into the conus branch).',
      },
      {
        title: 'Optional LV assessment',
        description:
          'Cross the aortic valve with a pigtail to measure LVEDP and perform ventriculography if indicated and contrast budget allows.',
      },
      {
        title: 'Remove and achieve hemostasis',
        description:
          'Remove catheters and sheath; use a radial compression band with patent hemostasis, or femoral manual compression or a closure device.',
      },
    ],
    ecg: [
      'Continuous ECG monitoring with defibrillator pads applied or immediately available',
      'Transient bradycardia and T-wave/QT changes are common with RCA contrast injection',
      'Ventricular ectopy when the catheter crosses the aortic valve or touches the LV',
      'VF can follow selective RCA/conus injection or injection with a damped pressure trace',
      'New ST changes during the case suggest ischemia, dissection, spasm or air embolism',
      'Vasovagal reaction (bradycardia + hypotension) is common, especially with femoral sheath removal',
    ],
    equipment: [
      'Micropuncture needle, introducer sheath (typically 5–6 Fr) and J-tipped guidewire',
      'Diagnostic catheters: Judkins left/right, Amplatz, multipurpose and universal radial shapes',
      'Manifold with pressure transducer, saline flush and contrast lines',
      'Low- or iso-osmolar iodinated contrast with hand or power injector',
      'Fluoroscopy C-arm with digital cine acquisition and hemodynamic recording system',
      'Defibrillator, emergency drugs and radial compression band or femoral closure device',
    ],
    complications: [
      'Access-site bleeding, hematoma, pseudoaneurysm or AV fistula (more common with femoral)',
      'Retroperitoneal hemorrhage, mainly with puncture above the inguinal ligament',
      'Radial artery spasm or occlusion (reduced by heparin and patent hemostasis)',
      'Contrast-associated AKI and contrast allergic/anaphylactoid reactions',
      'Arrhythmia (VF, bradycardia), coronary or aortic dissection, air embolism',
      'Stroke, MI and death are rare (each well under 1% in elective diagnostic cases)',
    ],
    postCare: [
      'Monitor vital signs, access site, distal pulses and neurovascular status per protocol',
      'Radial: staged deflation of the compression band over ~1–2 hours, check for forearm hematoma',
      'Femoral: bed rest ~2–6 hours depending on closure method, leg kept straight',
      'Hypotension, back or flank pain and falling Hb after femoral access → suspect retroperitoneal bleed (CT)',
      'Encourage hydration; recheck creatinine at ~48–72 h in patients at risk of AKI',
      'Hold metformin per local protocol in reduced eGFR or AKI, resume when renal function is stable',
    ],
    teaching: [
      'Allen or Barbeau testing is not required before radial access per current consensus',
      'Radial-first access lowers bleeding and vascular complications, and in ACS is associated with lower mortality',
      'Femoral target: common femoral artery over the femoral head, below the inguinal ligament and above the bifurcation',
      'Contrast AKI prevention: identify risk, isotonic IV hydration, minimize contrast volume, avoid nephrotoxins',
      'N-acetylcysteine and sodium bicarbonate do not prevent contrast AKI (PRESERVE trial)',
      'Always view a lesion in at least two orthogonal projections to avoid missing eccentric stenoses',
      'Angiography shows only the lumen: diffuse disease and positive remodeling can hide plaque',
    ],
    targetStructures: [
      'lmca', 'lad-proximal', 'lad-mid', 'lad-distal', 'd1', 'lcx-proximal', 'lcx-distal', 'om1',
      'rca-proximal', 'rca-mid', 'rca-distal', 'pda', 'ascending-aorta',
    ],
    relatedConditions: [
      'anterior-stemi', 'inferior-stemi', 'lateral-stemi', 'nstemi', 'wellens-pattern', 'takotsubo',
      'dilated-cardiomyopathy', 'hfref', 'cardiogenic-shock',
    ],
  },

  'left-heart-cath': {
    id: 'left-heart-cath',
    name: 'Left Heart Catheterization',
    category: 'Cath Lab',
    summary:
      'Retrograde arterial catheterization of the aorta and left ventricle to measure left-sided pressures, assess the aortic valve and perform left ventriculography. It is usually performed together with coronary angiography.',
    levelNotes: [
      'Patients after a heart cath can bleed from the wrist or groin, so apply firm direct pressure at and just above the puncture site and keep the limb still.',
      'Post-cath hypotension, groin or back pain, or a cool pulseless limb needs urgent escalation for bleeding or vascular injury.',
      'A high LVEDP (normal ~3–12 mmHg) signals elevated filling pressure, so watch for pulmonary edema after contrast and fluid loads.',
      'Interpret pullback gradients: a gradient across the aortic valve indicates aortic stenosis, whereas an intracavitary gradient below the valve suggests HCM obstruction.',
      'Use simultaneous LV and aortic pressures for valve gradients and look for the Brockenbrough–Braunwald–Morrow sign after a PVC in obstructive HCM.',
    ],
    overview: [
      'Catheter passed retrograde from a peripheral artery across the aortic valve into the LV',
      'Measures aortic pressure, LV systolic pressure and LV end-diastolic pressure (LVEDP)',
      'Left ventriculography assesses LV size, ejection fraction, wall motion and mitral regurgitation',
      'Pullback or simultaneous recording across the aortic valve detects a transvalvular gradient',
      'Combined with right heart cath for full hemodynamic studies (e.g., constriction vs restriction)',
      'Echo and cardiac MRI now replace ventriculography for many questions',
    ],
    indications: [
      'Assessment of LV filling pressure (LVEDP) in suspected heart failure',
      'Aortic stenosis severity when noninvasive data are discordant or inconclusive',
      'Dynamic LVOT obstruction assessment in hypertrophic cardiomyopathy',
      'LV function, wall motion or MR grading when echo is inadequate',
      'Constrictive pericarditis vs restrictive cardiomyopathy (with simultaneous RHC)',
    ],
    contraindications: [
      'LV thrombus (avoid crossing the valve and ventriculography)',
      'Mechanical aortic valve prosthesis (never cross with a catheter)',
      'Suspected acute aortic dissection (CT preferred; risk of entering the false lumen)',
      'Severe aortic stenosis: cross only when the information will change management (embolic risk)',
      'Decompensated heart failure: avoid the large contrast load of ventriculography',
      'Relative: renal dysfunction, bleeding diathesis, contrast allergy',
    ],
    anatomy: [
      'Aortic valve cusps: right, left and noncoronary; coronary ostia arise from right and left sinuses',
      'LVOT is bounded by the interventricular septum and the anterior mitral leaflet',
      'Septal hypertrophy with systolic anterior motion of the mitral leaflet causes LVOT obstruction in HCM',
      'RAO ventriculogram shows anterior, apical and inferior walls; LAO shows septal and lateral walls',
      'Mitral regurgitation is graded by contrast opacification of the left atrium',
      'Femoral or radial route reaches the ascending aorta via the arch or brachiocephalic trunk',
    ],
    accessSite:
      'Radial or common femoral artery (same access as coronary angiography); femoral or dual access for simultaneous LV–aortic pressure studies',
    steps: [
      {
        title: 'Access and position',
        description:
          'Obtain arterial access as for coronary angiography and advance a pigtail catheter over a J-wire to the ascending aorta.',
      },
      {
        title: 'Zero and record aortic pressure',
        description:
          'Zero and level the transducer at the phlebostatic axis (mid-chest), then record aortic systolic, diastolic and mean pressures.',
      },
      {
        title: 'Cross the aortic valve',
        description:
          'Prolapse the pigtail across a normal valve; for a stenotic valve use a straight wire with a shaped catheter after anticoagulation, limiting crossing time.',
      },
      {
        title: 'Measure LV pressures',
        description:
          'Record LV systolic pressure and LVEDP at end-expiration, measured after the a-wave just before the systolic upstroke.',
      },
      {
        title: 'Ventriculography',
        description:
          'Power-inject contrast (~30–40 mL) in RAO (± LAO) view to assess LV function, wall motion and MR.',
      },
      {
        title: 'Gradient assessment',
        description:
          'Record simultaneous LV and aortic pressures or a careful pullback to measure peak-to-peak and mean gradient.',
      },
      {
        title: 'Provocation if needed',
        description:
          'Use Valsalva, post-PVC beats or isoproterenol to unmask dynamic LVOT obstruction in suspected HCM.',
      },
      {
        title: 'Withdraw and close',
        description:
          'Record a pullback tracing, remove the catheter and achieve hemostasis as for coronary angiography.',
      },
    ],
    ecg: [
      'PVCs and short runs of VT are common when the catheter contacts the LV wall',
      'Power injection for ventriculography often triggers ectopy; reposition if sustained',
      'Catheter trauma to the left bundle can cause transient LBBB, and complete heart block if RBBB pre-exists',
      'The post-PVC beat is diagnostically useful for distinguishing HCM obstruction from fixed AS',
      'Watch for bradycardia and hypotension from vasovagal response or contrast load',
    ],
    equipment: [
      'Pigtail catheter (side holes allow safe power injection)',
      'Straight-tip and J-tipped wires; shaped catheter (e.g., Amplatz left) for stenotic valves',
      'Dual pressure transducers for simultaneous LV–aortic recording',
      'Power injector for ventriculography',
      'Hemodynamic recording system and defibrillator',
    ],
    complications: [
      'Ventricular arrhythmias, usually transient',
      'Embolic stroke from crossing a calcified aortic valve or from LV thrombus',
      'Pulmonary edema from contrast load in poor LV function or high LVEDP',
      'LV perforation (rare, mainly with end-hole catheters under power injection)',
      'Transient LBBB progressing to complete heart block in patients with pre-existing RBBB',
      'Access-site bleeding, vascular injury and contrast-associated AKI',
    ],
    postCare: [
      'Same access-site and neurovascular checks as coronary angiography',
      'Monitor for pulmonary edema if LVEDP was high or contrast volume large',
      'Neurologic checks if the aortic valve was crossed (stroke risk)',
      'Consider diuresis when LVEDP is markedly elevated',
      'LVEDP-guided hydration balances AKI prevention against volume overload (POSEIDON concept)',
    ],
    teaching: [
      'Normal LVEDP ~3–12 mmHg, measured at end-diastole after the a-wave',
      'Cath peak-to-peak gradient differs from echo peak instantaneous gradient; mean gradients compare best',
      'Severe AS: mean gradient ≥ 40 mmHg and AVA ≤ 1.0 cm²',
      'HCM (Brockenbrough sign): after a PVC, LVOT gradient rises while aortic pulse pressure falls',
      'Fixed aortic stenosis: after a PVC, aortic pulse pressure rises',
      'Echo now replaces most ventriculography, saving contrast for coronary imaging',
    ],
    targetStructures: [
      'left-ventricle', 'aortic-valve', 'ascending-aorta', 'mitral-valve', 'left-atrium', 'interventricular-septum',
    ],
    relatedConditions: [
      'aortic-stenosis', 'hcm', 'mitral-regurgitation', 'hfref', 'hfpef', 'dilated-cardiomyopathy',
    ],
  },

  'right-heart-cath': {
    id: 'right-heart-cath',
    name: 'Right Heart Catheterization',
    category: 'Cath Lab',
    summary:
      'A balloon-tipped, flow-directed pulmonary artery catheter is floated through the right heart to directly measure right-sided and pulmonary pressures, wedge pressure, cardiac output and oxygen saturations. It is the gold standard for diagnosing pulmonary hypertension and defining shock and heart failure hemodynamics.',
    levelNotes: [
      'A patient with a pulmonary artery catheter is critically ill, so protect the line from tugging and report sudden breathlessness, bleeding or alarms.',
      'During transfers with a PA catheter, never leave the balloon inflated, keep the transducer leveled and watch for ventricular ectopy if the tip migrates.',
      'Know normal values (RA 2–6, RV 15–30/2–8, PA 15–30/4–12 mean ≤ 20, PCWP 6–12 mmHg, CI 2.5–4.0 L/min/m²) and use them to classify shock.',
      'Pulmonary hypertension is mPAP > 20 mmHg; it is precapillary when PCWP ≤ 15 mmHg and PVR > 2 WU, and post-capillary when PCWP > 15 mmHg.',
      'Read pressures at end-expiration, confirm true wedge by waveform and saturation, and know when thermodilution fails (severe TR, shunts, very low output) so Fick is preferred.',
    ],
    overview: [
      'Flow-directed balloon catheter floated through RA, RV and PA into a wedge position',
      'Directly measures RA, RV, PA and pulmonary capillary wedge pressure (PCWP ≈ LA pressure)',
      'Cardiac output by thermodilution or Fick principle; derives CI, PVR, SVR and cardiac power',
      'Oxygen saturation run detects and quantifies left-to-right shunts (Qp:Qs)',
      'Gold standard for diagnosing and classifying pulmonary hypertension',
      'Diagnostic in the cath lab or left in place for ICU monitoring',
    ],
    indications: [
      'Diagnosis and classification of pulmonary hypertension, with vasoreactivity testing in PAH',
      'Cardiogenic or mixed shock: diagnosis, phenotyping and guiding therapy/MCS',
      'Advanced heart failure: evaluation for LVAD or heart transplant',
      'Constrictive pericarditis vs restrictive cardiomyopathy (with simultaneous LV pressure)',
      'Suspected intracardiac shunt (ASD, VSD) to measure Qp:Qs',
      'Unexplained dyspnea or suspected HFpEF (rest ± exercise hemodynamics)',
    ],
    contraindications: [
      'Right-sided endocarditis or thrombus/mass in the RA or RV',
      'Mechanical tricuspid or pulmonary valve prosthesis',
      'Relative: LBBB (catheter-induced RBBB can cause complete heart block; have pacing available)',
      'Relative: severe coagulopathy (use a compressible site with ultrasound guidance)',
      'Relative: recently implanted pacemaker or ICD leads (dislodgement risk; use fluoroscopy)',
    ],
    anatomy: [
      'Venous access via internal jugular, femoral, antecubital/brachial or subclavian vein',
      'Path: SVC or IVC → RA → tricuspid valve → RV → pulmonary valve → PA → distal branch (wedge)',
      'The RV outflow tract is the most arrhythmogenic part of the passage',
      'PCWP reflects LA pressure through a static blood column when the balloon occludes flow',
      'In mitral stenosis, PCWP exceeds LVEDP (transmitral gradient)',
      'Right internal jugular gives the straightest route into the RA and RV',
    ],
    accessSite:
      'Internal jugular vein (right preferred), femoral vein or antecubital/brachial vein; subclavian mainly for indwelling ICU catheters',
    steps: [
      {
        title: 'Prepare and zero',
        description:
          'Flush all lumens, test the balloon (typically 1.5 mL air for a 7 Fr catheter) and zero the transducer at the phlebostatic axis (4th intercostal space, mid-axillary line).',
      },
      {
        title: 'Venous access',
        description:
          'Ultrasound-guided internal jugular, femoral or antecubital puncture and introducer sheath placement.',
      },
      {
        title: 'Right atrium',
        description:
          'Advance to the RA (~20 cm from the right IJ), inflate the balloon and record RA a and v waves and SVC/RA saturations.',
      },
      {
        title: 'Right ventricle',
        description:
          'Float across the tricuspid valve (~30 cm) with the balloon inflated and record RV systolic and end-diastolic pressures.',
      },
      {
        title: 'Pulmonary artery',
        description:
          'Float through the pulmonary valve (~40 cm); a rise in diastolic pressure confirms PA position; record PA pressures and mixed venous saturation.',
      },
      {
        title: 'Wedge',
        description:
          'Advance until the trace damps to an LA-type waveform (~45–55 cm), record PCWP at end-expiration, then deflate the balloon immediately.',
      },
      {
        title: 'Cardiac output',
        description:
          'Measure thermodilution output (average of ≥ 3 injections) and/or Fick output from VO2 divided by the arteriovenous O2 content difference.',
      },
      {
        title: 'Calculations and challenges',
        description:
          'Calculate CI, PVR, SVR and transpulmonary gradient; perform vasoreactivity testing (e.g., inhaled nitric oxide), exercise or fluid challenge when indicated.',
      },
      {
        title: 'Withdraw',
        description:
          'Always deflate the balloon before withdrawing, record a pullback, then remove the sheath and apply pressure.',
      },
    ],
    ecg: [
      'PVCs and nonsustained VT are common as the catheter crosses the RV and RVOT',
      'Catheter-induced RBBB occurs in a few percent; with pre-existing LBBB it can cause complete heart block',
      'Time waveforms to the ECG: RA a-wave follows the P wave; PCWP a- and v-waves appear later due to transmission delay',
      'Read all pressures at end-expiration',
      'Large v-waves on the PCWP trace suggest severe MR or a noncompliant left atrium',
      'Atrial arrhythmias can be triggered by catheter contact in the RA',
    ],
    equipment: [
      'Balloon-tipped flow-directed PA catheter (typically 7 Fr) with thermistor',
      'Introducer sheath, ultrasound for access, fluoroscopy',
      'Pressure transducers zeroed and leveled, hemodynamic recording system',
      'Room-temperature or cold saline for thermodilution; blood gas syringes for saturations',
      'Measured or assumed oxygen consumption for Fick calculations',
      'Inhaled nitric oxide or other selective pulmonary vasodilator for vasoreactivity testing',
    ],
    complications: [
      'Arrhythmias: PVCs, VT, transient RBBB, complete heart block with baseline LBBB',
      'Pulmonary artery rupture (rare, often fatal): risks include balloon overinflation, distal tip, PH, anticoagulation, older age',
      'Pulmonary infarction from persistent or spontaneous wedging',
      'Pneumothorax, inadvertent arterial puncture, air embolism',
      'Catheter knotting, valve injury, line infection and thrombosis with indwelling catheters',
      'Hemoptysis after wedging = PA injury until proven otherwise',
    ],
    postCare: [
      'Indwelling catheter: continuous PA waveform display to detect spontaneous wedging',
      'Keep the balloon deflated except for brief wedge readings (a few respiratory cycles)',
      'Confirm tip position by CXR or fluoroscopy and recheck if the waveform changes',
      'Remove as soon as it no longer guides therapy (infection and thrombosis risk)',
      'Check the access site for hematoma; neck access needs pneumothorax awareness',
      'Report hemoptysis, new arrhythmia or a persistently damped tracing immediately',
    ],
    teaching: [
      'Normal: RA 2–6, RV 15–30/2–8, PA 15–30/4–12 (mean ≤ 20), PCWP 6–12 mmHg; CI 2.5–4.0 L/min/m²',
      'PH (2022 ESC/ERS): mPAP > 20 mmHg; precapillary adds PCWP ≤ 15 mmHg and PVR > 2 WU',
      'PVR (WU) = (mPAP − PCWP) / CO; SVR (dyn·s·cm⁻⁵) = 80 × (MAP − RAP) / CO',
      'Fick: CO = VO2 / (arterial − mixed venous O2 content); assumed VO2 introduces error',
      'Cardiogenic shock: high PCWP, low CI (< 2.2), high SVR; septic shock: low SVR, normal or high CI',
      'Tamponade: equalization of diastolic pressures (RA ≈ RV diastolic ≈ PA diastolic ≈ PCWP)',
      'Cardiac power output = MAP × CO / 451; < ~0.6 W predicts poor outcome in cardiogenic shock',
    ],
    targetStructures: [
      'svc', 'ivc', 'right-atrium', 'tricuspid-valve', 'right-ventricle', 'pulmonary-valve', 'pulmonary-trunk',
    ],
    relatedConditions: [
      'cardiogenic-shock', 'hfref', 'hfpef', 'cardiac-tamponade', 'mitral-stenosis', 'mitral-regurgitation',
      'asd', 'vsd', 'pulmonary-embolism',
    ],
  },

  'ffr-ifr': {
    id: 'ffr-ifr',
    name: 'FFR / iFR Physiology',
    category: 'Cath Lab',
    summary:
      'A pressure-sensor guidewire compares coronary pressure beyond a narrowing with aortic pressure to show whether the narrowing actually limits blood flow. It decides whether an intermediate stenosis should be stented or treated medically.',
    levelNotes: [
      'Not every narrowing found at cath needs a stent; pressure testing decides, so chest pain after any cath still warrants a full ACS assessment.',
      'Adenosine used for FFR causes the same transient flushing, chest tightness, dyspnea and AV block seen when it is pushed for SVT.',
      'Adenosine effects resolve within ~1–2 minutes of stopping because of its seconds-long half-life, so prolonged bradycardia or bronchospasm afterwards needs another explanation.',
      'FFR ≤ 0.80 or iFR/RFR ≤ 0.89 marks a hemodynamically significant lesion, and physiology-guided PCI avoids unnecessary stents (FAME, DEFINE-FLAIR, iFR-SWEDEHEART).',
      'Equalize at the guide tip with the introducer removed, avoid guide damping, use pullbacks for serial or diffuse disease, and accept drift only within ~0.98–1.02 on return.',
    ],
    overview: [
      'Pressure-sensor guidewire positioned distal to a coronary stenosis',
      'FFR = mean distal pressure (Pd) / mean aortic pressure (Pa) during maximal hyperemia',
      'iFR and RFR are resting (nonhyperemic) indices measured without adenosine',
      'Identifies which angiographically intermediate lesions cause ischemia',
      'Guides PCI decisions in single and multivessel disease and helps plan CABG',
      'Angiography- and CT-derived FFR estimates are less invasive alternatives',
    ],
    indications: [
      'Angiographically intermediate stenoses (~50–90%) without prior ischemia testing',
      'Multivessel disease to decide which lesions to revascularize',
      'Serial or diffuse disease (pullback to localize the pressure drop)',
      'Intermediate left main disease (IVUS is an alternative)',
      'Non-culprit lesions after ACS (physiology- and angiography-guided strategies have both been studied)',
      'Discordance between symptoms, stress testing and angiographic appearance',
    ],
    contraindications: [
      'STEMI culprit lesion (microvascular dysfunction makes FFR unreliable; treat by angiography)',
      'Adenosine contraindications (severe bronchospasm, high-grade AV block without pacing, hypotension): use iFR/RFR',
      'Hemodynamic instability or ongoing ischemia requiring immediate treatment',
      'Thrombus-laden lesion',
      'Relative: severe aortic stenosis or severe LV hypertrophy (indices may be less reliable)',
    ],
    anatomy: [
      'Pressure sensor sits ~3 cm from the wire tip and must be placed well beyond the lesion',
      'Territory size matters: the same stenosis gives a lower FFR in proximal LAD than in a small branch',
      'Collateral flow and microvascular resistance influence the measured index',
      'Left main FFR can be falsely high when downstream LAD or LCx disease is present',
      'Hyperemia minimizes microvascular resistance so that pressure becomes proportional to flow',
    ],
    accessSite:
      'Same arterial access as coronary angiography/PCI (radial preferred, femoral alternative) with a guide catheter',
    steps: [
      {
        title: 'Guide and anticoagulation',
        description:
          'Engage with a guide catheter (ideally without side holes), give heparin, and administer intracoronary nitroglycerin to prevent spasm.',
      },
      {
        title: 'Equalize',
        description:
          'Place the pressure sensor at the guide tip and equalize Pd to Pa with the introducer removed and the system flushed.',
      },
      {
        title: 'Cross the lesion',
        description:
          'Advance the wire so the sensor lies well distal to the stenosis, typically in the distal third of the vessel.',
      },
      {
        title: 'Resting index',
        description: 'Record iFR or RFR (or resting Pd/Pa) under stable conditions.',
      },
      {
        title: 'Hyperemia for FFR',
        description:
          'Give IV adenosine infusion (typically 140 μg/kg/min) or an intracoronary bolus and record the lowest stable Pd/Pa.',
      },
      {
        title: 'Pullback',
        description:
          'Perform a slow pullback to show whether the pressure loss is focal or diffuse and to identify serial lesions.',
      },
      {
        title: 'Drift check',
        description:
          'Return the sensor to the guide tip; Pd/Pa should read ~0.98–1.02, otherwise re-equalize and repeat.',
      },
      {
        title: 'Decide',
        description:
          'Treat if FFR ≤ 0.80 or iFR/RFR ≤ 0.89; otherwise defer PCI and continue optimal medical therapy.',
      },
    ],
    ecg: [
      'Adenosine causes transient sinus slowing and AV block, especially with RCA or IC bolus',
      'Expect flushing, chest discomfort and dyspnea during hyperemia; resolve within ~1–2 minutes',
      'Monitor for bronchospasm and hypotension during adenosine infusion',
      'Ischemic ST changes may appear during hyperemia across significant lesions',
      'Adenosine can rarely trigger atrial fibrillation',
    ],
    equipment: [
      'Pressure-sensor guidewire (piezoelectric or fiber-optic)',
      'Guide catheter without side holes when possible',
      'Physiology console with automated index calculation and pullback recording',
      'Adenosine (IV infusion or IC bolus) and intracoronary nitroglycerin',
      'Large-bore IV for adenosine infusion',
    ],
    complications: [
      'Coronary dissection or perforation from the wire (rare)',
      'Adenosine effects: AV block, bronchospasm, hypotension, chest pain',
      'Coronary spasm (prevented with intracoronary nitroglycerin)',
      'Guide catheter-induced ischemia or dissection',
      'Thrombus formation if anticoagulation is inadequate',
    ],
    postCare: [
      'Deferred lesions: optimize medical therapy (antiplatelet, high-intensity statin, antianginals)',
      'Routine post-cath access-site care',
      'If PCI performed: DAPT and post-PCI pathway',
      'Document FFR/iFR values for future decisions and Heart Team review',
    ],
    teaching: [
      'FFR = Pd/Pa at maximal hyperemia; normal is 1.0',
      'Thresholds: FFR ≤ 0.80 and iFR/RFR ≤ 0.89 are significant',
      'FAME: FFR-guided multivessel PCI reduced the composite of death, MI and repeat revascularization vs angiography guidance',
      'DEFER and FAME 2: deferring FFR-negative lesions is safe; PCI of FFR-positive lesions reduces urgent revascularization',
      'DEFINE-FLAIR and iFR-SWEDEHEART: iFR noninferior to FFR at 1 year with fewer symptoms',
      'Longer-term follow-up has raised some questions about iFR; FFR remains the most validated index',
      'Pitfalls: guide damping, wire drift, inadequate hyperemia, serial lesions, severe AS, STEMI culprit',
    ],
    targetStructures: [
      'lmca', 'lad-proximal', 'lad-mid', 'd1', 'lcx-proximal', 'om1', 'rca-proximal', 'rca-mid',
    ],
    relatedConditions: ['nstemi', 'anterior-stemi', 'inferior-stemi', 'lateral-stemi', 'aortic-stenosis'],
  },

  'ivus-oct': {
    id: 'ivus-oct',
    name: 'IVUS / OCT Intravascular Imaging',
    category: 'Cath Lab',
    summary:
      'Catheter-based imaging from inside the coronary artery, using ultrasound (IVUS) or near-infrared light (OCT), that shows the vessel wall, plaque and stent in cross-section. It is used to size and optimize stents and to find the cause of stent failure.',
    levelNotes: [
      'Modern stenting often uses imaging from inside the artery to make stents last longer, but any new chest pain after PCI is still treated as possible ACS.',
      'Patients after complex imaging-guided PCI still depend on antiplatelet therapy, so never advise stopping it.',
      'For stent thrombosis or restenosis, intravascular imaging identifies the mechanism (underexpansion, malapposition, edge dissection, neoatherosclerosis).',
      'Imaging-guided PCI reduces target vessel failure versus angiography alone, and recent guidelines strongly recommend it for left main and complex lesions.',
      'Size stents from the EEM (IVUS) or EEL/reference lumen (OCT), plan calcium modification, and aim for full expansion (MSA ≥ ~90% of the distal reference) without major edge dissection.',
    ],
    overview: [
      'IVUS: ultrasound (~20–60 MHz) with ~100–150 μm resolution and deep penetration through blood',
      'OCT: near-infrared light with ~10–20 μm resolution, limited depth (~1–2 mm), needs contrast flush',
      'Measures lumen and vessel area, plaque burden, and calcium arc, thickness and length',
      'Defines reference segments and landing zones for stent diameter and length',
      'After stenting, assesses expansion, apposition, edge dissection and tissue protrusion',
      'Imaging guidance reduced target vessel failure in RCTs and meta-analyses (e.g., RENOVATE-COMPLEX-PCI, OCTOBER)',
    ],
    indications: [
      'Left main disease: assess severity and guide stenting',
      'Complex PCI: bifurcations, long lesions, chronic total occlusions, ostial lesions',
      'Calcified lesions: quantify calcium to plan atherectomy or lithotripsy',
      'Stent failure: restenosis or stent thrombosis mechanism',
      'Ambiguous angiography: haziness, suspected dissection, thrombus, SCAD',
      'Minimal-contrast PCI in advanced CKD (IVUS)',
    ],
    contraindications: [
      'OCT: aorto-ostial and ostial left main lesions (difficult blood clearance); IVUS preferred',
      'OCT: relative caution in advanced CKD (contrast flush)',
      'Very tortuous or heavily calcified vessels the catheter cannot cross safely (relative)',
      'Hemodynamic instability where extra procedure time is unsafe (relative)',
      'Inadequate anticoagulation',
    ],
    anatomy: [
      'Coronary wall layers: intima, media, adventitia; the external elastic membrane (EEM) defines vessel size',
      'Plaque burden = (EEM area − lumen area) / EEM area; > 70% is a high-risk feature',
      'Calcium: bright arc with acoustic shadow on IVUS; sharply bordered signal-poor region on OCT',
      'Lipid plaque: attenuated plaque on IVUS; diffuse signal-poor region on OCT; thin-cap fibroatheroma < 65 μm',
      'Red thrombus attenuates the OCT signal; white thrombus does not',
      'Left main MLA < ~6 mm² by IVUS suggests significance in Western populations (lower cut-offs in Asian cohorts)',
    ],
    accessSite:
      'Coronary guide catheter via radial (preferred) or femoral artery; imaging catheters are 6 Fr guide compatible',
    steps: [
      {
        title: 'Anticoagulate and vasodilate',
        description: 'Confirm therapeutic heparin (ACT) and give intracoronary nitroglycerin before imaging.',
      },
      {
        title: 'Position the catheter',
        description: 'Advance the imaging catheter over a 0.014-inch wire well distal to the lesion.',
      },
      {
        title: 'Pullback',
        description:
          'Perform an automated pullback (IVUS) or a pullback during contrast flush (OCT) to acquire cross-sections and a longitudinal view.',
      },
      {
        title: 'Pre-PCI analysis',
        description:
          'Identify plaque type, calcium burden, minimal lumen area, proximal and distal reference segments and landing zones.',
      },
      {
        title: 'Plan',
        description:
          'Choose lesion preparation (e.g., atherectomy or IVL for heavy calcium) and stent diameter and length.',
      },
      {
        title: 'Stent and post-dilate',
        description: 'Implant the stent and post-dilate with a noncompliant balloon sized to the imaging measurements.',
      },
      {
        title: 'Post-PCI imaging',
        description:
          'Assess minimal stent area and expansion, apposition, edge dissection, tissue protrusion and geographic miss.',
      },
      {
        title: 'Optimize',
        description: 'Treat deficiencies with higher-pressure or larger balloons or an additional stent, then reimage.',
      },
    ],
    ecg: [
      'Transient ST changes and chest pain when the catheter obstructs a tight lesion',
      'Contrast flush for OCT in the RCA can cause transient bradycardia',
      'VF is rare but possible with prolonged flush or ischemia',
      'Coronary spasm during imaging: treat with intracoronary nitroglycerin',
    ],
    equipment: [
      'IVUS catheter (rotational or phased-array) and console',
      'OCT catheter with automated pullback and contrast/flush injector',
      '0.014-inch coronary guidewire and guide catheter (typically 6 Fr)',
      'Intracoronary nitroglycerin and heparin',
      'Angiographic co-registration software (optional)',
    ],
    complications: [
      'Coronary spasm (most common)',
      'Transient ischemia during pullback',
      'Dissection, catheter or wire entrapment (rare)',
      'Contrast load and air embolism risk with OCT flushing',
      'Overall serious complication rate is very low (< 1%)',
    ],
    postCare: [
      'Same as coronary angiography or PCI; no imaging-specific aftercare',
      'Record key measurements (MLA, MSA, reference areas) for future procedures',
      'Monitor renal function after large OCT contrast volumes',
      'DAPT and secondary prevention per PCI indication',
    ],
    teaching: [
      'IVUS sees deeper (whole vessel to adventitia); OCT sees finer (thin caps, malapposition, thrombus)',
      'Stent underexpansion is the strongest predictor of restenosis and stent thrombosis',
      'OCT calcium "rule of 5s": arc > 180°, thickness > 0.5 mm, length > 5 mm predicts underexpansion',
      'Stent expansion target: MSA ≥ ~90% of distal reference (or > ~5.5 mm² by IVUS in non-left main vessels)',
      'Isolated malapposition in a well-expanded stent is less worrying than underexpansion',
      'Large edge dissections (e.g., ≥ 60° arc and ≥ 3 mm long on OCT) usually warrant treatment',
    ],
    targetStructures: [
      'lmca', 'lad-proximal', 'lad-mid', 'd1', 'lcx-proximal', 'rca-proximal', 'rca-mid',
    ],
    relatedConditions: ['nstemi', 'anterior-stemi', 'inferior-stemi', 'lateral-stemi'],
  },

  'pci-stent': {
    id: 'pci-stent',
    name: 'PCI with Drug-Eluting Stent',
    category: 'Cath Lab',
    summary:
      'Percutaneous coronary intervention opens a narrowed or blocked coronary artery with a balloon and a drug-eluting stent delivered on a catheter. Primary PCI is the preferred reperfusion therapy for STEMI when it can be performed promptly.',
    levelNotes: [
      'For suspected STEMI, transmit the 12-lead and go directly to a PCI center, because every delay to reperfusion increases mortality.',
      'Prehospital cath lab activation and aspirin (162–325 mg chewed, non-enteric-coated) are the key actions, with oxygen only if SpO2 < 90% and P2Y12 timing per local protocol.',
      'After PCI, monitor the access site and rhythm, and treat recurrent chest pain with new ST elevation as stent thrombosis needing immediate cath lab return.',
      'DAPT (aspirin + P2Y12 inhibitor) is typically 12 months after ACS and 6 months after elective DES, with shorter or de-escalated regimens for high bleeding risk or selected patients.',
      'Radial-first access, adequate lesion preparation, imaging-guided sizing and high-pressure post-dilation to full expansion minimize restenosis and stent thrombosis.',
    ],
    overview: [
      'Balloon angioplasty followed by drug-eluting stent (DES) implantation is standard practice',
      'DES release antiproliferative drugs that markedly reduce restenosis compared with bare-metal stents',
      'Primary PCI for STEMI; urgent or early invasive PCI for NSTE-ACS; elective PCI for refractory angina',
      'STEMI with multivessel disease: complete revascularization of significant non-culprits reduces CV death/MI (COMPLETE)',
      'Stable CAD: PCI relieves angina but did not reduce overall death or MI vs optimal medical therapy in ISCHEMIA (spontaneous MI was lower)',
      'Cardiogenic shock with multivessel disease: culprit-only PCI at the index procedure (CULPRIT-SHOCK)',
    ],
    indications: [
      'STEMI within 12 h of symptom onset (later if ongoing ischemia, heart failure or instability)',
      'NSTE-ACS with a significant culprit lesion',
      'Stable angina despite optimal medical therapy with a physiologically significant stenosis',
      'Cardiogenic shock due to ACS (emergency culprit revascularization)',
      'Resuscitated cardiac arrest with STEMI',
      'Left main or multivessel disease when PCI is reasonable vs CABG (Heart Team, SYNTAX score)',
    ],
    contraindications: [
      'Unable to take or adhere to DAPT, or imminent surgery (consider shorter regimen or CABG)',
      'Anatomy better served by CABG (e.g., complex three-vessel disease with diabetes)',
      'No significant stenosis or no ischemia (e.g., FFR > 0.80)',
      'Active major bleeding or severe coagulopathy',
      'Very small, diffusely diseased vessels supplying a small territory',
      'Relative: prior severe contrast reaction, advanced CKD (minimize contrast, imaging guidance)',
    ],
    anatomy: [
      'Match ECG territory to angiogram: anterior → LAD; inferior → RCA (~80%) or LCx; lateral → LCx or diagonal',
      'Left main is protected (patent bypass graft to LAD or LCx) or unprotected',
      'Bifurcation lesions are classified by the Medina system (proximal main, distal main, side branch)',
      'Proximal LAD lesions jeopardize a large territory and carry prognostic weight',
      'Chronic total occlusion: occluded ≥ 3 months, often filled by collaterals',
      'Radial route tortuosity (subclavian loops) may require a different guide for support',
    ],
    accessSite:
      'Radial artery first (lower bleeding, especially in ACS); common femoral artery over the femoral head below the inguinal ligament when radial is unsuitable or large-bore devices are needed',
    steps: [
      {
        title: 'Antithrombotic loading',
        description:
          'Aspirin plus P2Y12 inhibitor as appropriate; unfractionated heparin (or bivalirudin) with ACT monitoring.',
      },
      {
        title: 'Access and guide',
        description:
          'Radial-first arterial access; choose a guide for support and coaxial alignment (e.g., extra-backup shapes for the left system).',
      },
      {
        title: 'Wire the lesion',
        description: 'Cross the stenosis with a 0.014-inch coronary guidewire into the distal vessel.',
      },
      {
        title: 'Assess the lesion',
        description:
          'Use FFR/iFR for intermediate lesions and IVUS/OCT for complex lesions, left main or sizing.',
      },
      {
        title: 'Prepare the lesion',
        description:
          'Predilate with a semicompliant or noncompliant balloon; use atherectomy or IVL for severe calcium; thrombus aspiration only selectively.',
      },
      {
        title: 'Deploy the stent',
        description:
          'Position the DES from healthy to healthy segment and deploy at nominal-to-high pressure.',
      },
      {
        title: 'Post-dilate',
        description:
          'Use a noncompliant balloon at high pressure to achieve full expansion, ideally guided by intravascular imaging.',
      },
      {
        title: 'Final assessment',
        description:
          'Confirm TIMI 3 flow, minimal residual stenosis, and no dissection or perforation in orthogonal views.',
      },
      {
        title: 'Close and hand over',
        description:
          'Remove equipment, achieve hemostasis and document the antithrombotic plan and DAPT duration.',
      },
    ],
    ecg: [
      'Transient ST elevation and chest pain during balloon inflation are expected ischemia',
      'Reperfusion arrhythmias: accelerated idioventricular rhythm (benign), bradycardia (RCA, Bezold–Jarisch), VF',
      'ST resolution ≥ ~50–70% after reperfusion indicates myocardial reperfusion; persistent ST elevation suggests no-reflow',
      'New ST elevation after PCI → acute stent thrombosis, side-branch occlusion or dissection',
      'Obtain a post-procedure 12-lead ECG as a new baseline',
    ],
    equipment: [
      'Guide catheter (6 Fr for most cases; 7–8 Fr for complex or bifurcation work)',
      '0.014-inch guidewires (workhorse, hydrophilic, specialty CTO wires)',
      'Semicompliant and noncompliant balloons, inflation device, hemostatic valve',
      'Drug-eluting stents (thin-strut, durable or biodegradable polymer)',
      'Microcatheters, guide extensions, thrombus aspiration catheters',
      'Bailout: covered stents, coils, pericardiocentesis kit, temporary pacing',
    ],
    complications: [
      'Periprocedural MI and no-reflow (STEMI, vein grafts, atherectomy)',
      'Coronary dissection or abrupt vessel closure',
      'Coronary perforation → tamponade (balloon tamponade, covered stent, pericardiocentesis)',
      'Stent thrombosis: acute (< 24 h), subacute (≤ 30 d), late, very late (> 1 yr); usually presents as STEMI',
      'In-stent restenosis: gradual, typically 3–12 months, presents as recurrent angina',
      'Bleeding (access site, GI), contrast-associated AKI, stroke',
    ],
    postCare: [
      'ACS: DAPT typically 12 months, with ticagrelor or prasugrel preferred over clopidogrel; stepping down to ticagrelor monotherapy after ≥ 1 month reduces bleeding in selected patients (2025 ACC/AHA)',
      'Elective DES: DAPT typically 6 months; 1–3 months then single antiplatelet in high bleeding risk',
      'Never stop DAPT early without cardiology input; premature cessation is a major cause of stent thrombosis',
      'High-intensity statin, beta-blocker and ACE inhibitor/ARB/ARNI when indicated, cardiac rehab referral',
      'PPI for GI protection in patients at increased bleeding risk on DAPT',
      'Delay elective noncardiac surgery ideally ≥ 6 months after elective DES (longer after ACS)',
    ],
    teaching: [
      'Radial-first PCI reduces major bleeding and vascular complications and, in ACS, mortality (MATRIX)',
      'STEMI goals: FMC-to-device ≤ 90 min (≤ 120 min with transfer); door-in-door-out ≤ 30 min',
      'If PCI cannot occur within 120 min of FMC, give fibrinolysis within 30 min unless contraindicated',
      'Contrast AKI prevention: risk assessment, isotonic hydration, minimal contrast, avoid nephrotoxins',
      'With AF needing anticoagulation: DOAC + clopidogrel, limiting aspirin to ~1 week (up to 30 days if high thrombotic risk)',
      'Accelerated idioventricular rhythm after reperfusion is a reperfusion marker; do not suppress it',
      'Prasugrel is contraindicated after prior stroke or TIA',
    ],
    targetStructures: [
      'lmca', 'lad-proximal', 'lad-mid', 'lad-distal', 'd1', 'lcx-proximal', 'lcx-distal', 'om1',
      'rca-proximal', 'rca-mid', 'rca-distal',
    ],
    relatedConditions: [
      'anterior-stemi', 'inferior-stemi', 'lateral-stemi', 'nstemi', 'wellens-pattern', 'cardiogenic-shock',
      'ventricular-fibrillation',
    ],
  },

  'rotational-atherectomy': {
    id: 'rotational-atherectomy',
    name: 'Rotational Atherectomy',
    category: 'Cath Lab',
    summary:
      'A diamond-coated burr spinning at very high speed grinds heavily calcified coronary plaque into tiny particles so that balloons and stents can cross and expand fully. It is a lesion-preparation tool used before stenting, not a stand-alone treatment.',
    levelNotes: [
      'Patients who had complex calcified stenting carry higher complication risk, so treat any new chest pain or collapse as an emergency.',
      'Post-procedure chest pain or new ST elevation may mean slow flow, dissection or stent thrombosis, so activate the STEMI pathway.',
      'Watch for bradycardia or heart block (RCA or dominant LCx cases), periprocedural MI from slow flow, and delayed tamponade from perforation.',
      'Severe calcium predicts stent underexpansion; atherectomy improves deliverability and expansion but has not reduced long-term MACE versus standard preparation (ROTAXUS, PREPARE-CALC).',
      'Use a burr-to-artery ratio of ~0.5–0.6, ~140,000–180,000 rpm, short pecking runs (< ~20 s), avoid decelerations > 5,000 rpm, and consider temporary pacing for RCA/dominant LCx.',
    ],
    overview: [
      'Elliptical diamond-coated burr (~1.25–2.5 mm) rotating at ~140,000–180,000 rpm over a dedicated wire',
      'Differential cutting: ablates inelastic calcified plaque while elastic healthy tissue deflects away',
      'Debris is mostly smaller than red blood cells and passes through the microcirculation',
      'Used when balloons cannot cross or fully expand a calcified lesion',
      'Orbital atherectomy is a related device using an eccentrically mounted crown',
      'Typically followed by balloon dilation and DES implantation',
    ],
    indications: [
      'Severely calcified de novo lesions that cannot be crossed or dilated by balloons',
      'Calcified lesions predicted to cause stent underexpansion on intravascular imaging',
      'Calcified ostial and aorto-ostial lesions',
      'Balloon-uncrossable lesions, including some chronic total occlusions after wire crossing',
      'Calcified nodules and eccentric superficial calcium',
    ],
    contraindications: [
      'Visible thrombus in the target lesion',
      'Significant dissection at the treatment site',
      'Saphenous vein graft lesions',
      'Relative: last remaining vessel with severe LV dysfunction (consider hemodynamic support)',
      'Relative: severe angulation at the lesion (higher perforation risk)',
      'Relative: ablation through under-expanded stent struts (off-label, bailout in experienced hands only)',
    ],
    anatomy: [
      'Superficial (intimal) calcium limits expansion and is what the burr removes',
      'Deep (medial) calcium is less accessible to atherectomy',
      'Bends and angulated segments bias the burr toward the outer wall (perforation risk)',
      'RCA and dominant LCx supply the AV node, so ablation there can cause bradyarrhythmias',
      'Small vessels need smaller burrs to keep the burr-to-artery ratio ≤ ~0.6',
    ],
    accessSite:
      'Radial or femoral arterial access with a guide catheter sized to the burr (a 6 Fr guide accepts burrs up to ~1.75 mm)',
    steps: [
      {
        title: 'Assess and plan',
        description:
          'Confirm severe calcium by angiography and preferably IVUS/OCT; choose burr size from the reference diameter.',
      },
      {
        title: 'Prepare',
        description:
          'Therapeutic heparin; consider a temporary pacing wire for RCA or dominant LCx; set up continuous pressurized flush with vasodilators.',
      },
      {
        title: 'Wire exchange',
        description:
          'Cross with a workhorse wire and microcatheter, then exchange for the dedicated 0.009-inch atherectomy wire.',
      },
      {
        title: 'Platform test',
        description:
          'Activate the burr proximal to the lesion to set platform speed and confirm free rotation.',
      },
      {
        title: 'Ablate',
        description:
          'Advance slowly with a gentle pecking motion in short runs, avoiding rpm drops > 5,000, with pauses to restore flow.',
      },
      {
        title: 'Confirm and remove',
        description:
          'Confirm the burr passes freely, remove it in low-speed mode, and check for flow, dissection and perforation.',
      },
      {
        title: 'Further preparation',
        description:
          'Dilate with noncompliant, cutting or scoring balloons and reimage to confirm adequate modification.',
      },
      {
        title: 'Stent and optimize',
        description: 'Implant a DES and post-dilate to full expansion under imaging guidance.',
      },
    ],
    ecg: [
      'Bradycardia and AV block during runs, especially in the RCA or a dominant LCx',
      'Temporary pacing is often prepared or placed for RCA/dominant LCx cases',
      'ST elevation from slow flow or no-reflow',
      'Ischemic VT/VF can occur with prolonged slow flow',
      'Hypotension from slow flow: have vasopressors and vasodilators ready',
    ],
    equipment: [
      'Rotational atherectomy console, advancer and burrs (~1.25–2.5 mm)',
      'Dedicated 0.009-inch atherectomy guidewire',
      'Continuous pressurized flush solution with vasodilators',
      'Guide catheter sized to burr; microcatheter for wire exchange',
      'Temporary pacing wire, covered stents and pericardiocentesis kit for bailout',
    ],
    complications: [
      'Slow flow/no-reflow from particle embolization → periprocedural MI',
      'Coronary perforation and tamponade',
      'Dissection or abrupt closure',
      'Burr entrapment (may require advanced retrieval techniques or surgery)',
      'Bradyarrhythmias and heart block',
      'Guidewire fracture',
    ],
    postCare: [
      'Standard post-PCI care with DAPT and access-site checks',
      'Serial ECG and troponin if slow flow occurred',
      'Watch for delayed tamponade (hypotension, raised JVP, pulsus paradoxus) and get a bedside echo',
      'Telemetry for conduction disturbances; remove temporary pacing wire once stable',
    ],
    teaching: [
      'Atherectomy is lesion preparation; the goal is full stent expansion',
      'Differential cutting explains why calcium is removed while elastic tissue is spared',
      'A burr-to-artery ratio of ~0.5–0.6 is safer than older aggressive ratios (0.7–0.9)',
      'Short runs, gentle pecking, adequate pauses and vasodilator flush minimize slow flow',
      'Never let the burr stall within the lesion; it can become entrapped',
      'Choose atherectomy, IVL or scoring balloons according to calcium pattern and crossability',
    ],
    targetStructures: [
      'lmca', 'lad-proximal', 'lad-mid', 'lcx-proximal', 'rca-proximal', 'rca-mid', 'av-nodal-artery',
    ],
    relatedConditions: ['nstemi', 'cardiac-tamponade', 'third-degree-av-block', 'sinus-bradycardia'],
  },

  'intravascular-lithotripsy': {
    id: 'intravascular-lithotripsy',
    name: 'Intravascular Lithotripsy (IVL)',
    category: 'Cath Lab',
    summary:
      'A balloon catheter with built-in emitters sends sonic pressure waves into the artery wall to crack calcium, allowing the vessel to expand fully for a stent. It works at low balloon pressure and is used for heavily calcified coronary and peripheral arteries.',
    levelNotes: [
      'Patients treated for heavily calcified arteries follow the same post-PCI chest pain precautions, so treat new chest pain as possible ACS.',
      'IVL can cause harmless extra beats during pulse delivery, but post-procedure arrhythmias are uncommon and should be reported.',
      'Care after IVL-assisted PCI is the same as after PCI: access site, DAPT adherence, ECG for ischemia and vigilance for tamponade.',
      'IVL fractures both superficial and deep calcium with high procedural success and low complication rates (Disrupt CAD studies); randomized comparisons with atherectomy show broadly similar results.',
      'Size the IVL balloon 1:1 to the reference, inflate to ~4 atm, deliver pulse cycles, reinflate to ~6 atm, and reimage, favoring IVL for concentric or deep calcium.',
    ],
    overview: [
      'Adapted from kidney-stone lithotripsy: emitters inside a fluid-filled balloon generate acoustic pressure waves',
      'Fractures superficial and deep calcium circumferentially, increasing vessel compliance',
      'Low inflation pressure (~4–6 atm) limits barotrauma and dissection',
      'Coronary and peripheral systems exist (peripheral IVL also facilitates large-bore access)',
      'Uses a standard 0.014-inch workhorse wire and 6 Fr guide; relatively short learning curve',
      'OCT or IVUS shows calcium fractures and confirms expansion',
    ],
    indications: [
      'Severely calcified de novo coronary lesions before stenting',
      'Concentric or deep calcium where atherectomy is less effective',
      'Calcified iliofemoral arteries, including to enable transfemoral TAVR or MCS access',
      'Under-expanded stent due to underlying calcium (off-label in many regions)',
    ],
    contraindications: [
      'Lesion the IVL balloon cannot cross (debulk with atherectomy first)',
      'Significant dissection or thrombus at the target lesion',
      'Vessel diameter outside the available balloon sizes (coronary ~2.5–4.0 mm)',
      'Relative: eccentric calcified nodules (often better treated with atherectomy)',
    ],
    anatomy: [
      'Calcium sits in the intima (superficial) and media (deep); IVL affects both layers',
      'Fractures appear on OCT as breaks in the calcium sheet',
      'Thick calcium (> 0.5 mm) and large arcs resist balloon expansion',
      'The IVL balloon must contact the wall for energy transfer, hence 1:1 sizing',
      'Iliofemoral calcification often limits large-bore device delivery',
    ],
    accessSite:
      'Radial or femoral arterial access with a 6 Fr guide for coronary IVL; femoral or iliac target vessel for peripheral IVL',
    steps: [
      {
        title: 'Assess calcium',
        description:
          'Use angiography and IVUS/OCT to define calcium burden, arc, thickness and reference diameter.',
      },
      {
        title: 'Position',
        description:
          'Advance the IVL balloon over a standard 0.014-inch wire, sized 1:1 to the reference vessel.',
      },
      {
        title: 'Low-pressure inflation',
        description: 'Inflate to ~4 atm to appose the balloon to the vessel wall.',
      },
      {
        title: 'Deliver pulses',
        description: 'Deliver a cycle of pulses (e.g., 10 pulses at 1 per second).',
      },
      {
        title: 'Reinflate and deflate',
        description:
          'Increase to ~6 atm to dilate, then deflate to restore distal flow; repeat cycles along the lesion.',
      },
      {
        title: 'Reassess',
        description: 'Check for full balloon expansion and calcium fractures on angiography or imaging.',
      },
      {
        title: 'Stent',
        description: 'Implant a DES and post-dilate with a noncompliant balloon.',
      },
      {
        title: 'Optimize',
        description: 'Confirm expansion and apposition with final intravascular imaging.',
      },
    ],
    ecg: [
      'Pulse delivery can capture the ventricle, causing PVC-like beats, more often at slow heart rates',
      'This ectopy is usually benign and stops when pulses stop',
      'Transient ischemic ST changes during balloon occlusion',
      'Sustained arrhythmias are rare',
    ],
    equipment: [
      'IVL generator, connector cable and coronary or peripheral IVL balloon catheter',
      '0.014-inch workhorse guidewire and 6 Fr compatible guide catheter',
      'Inflation device with saline/contrast mixture',
      'Noncompliant balloons and drug-eluting stents',
      'IVUS or OCT for planning and optimization',
    ],
    complications: [
      'Dissection (generally low rates)',
      'Perforation (rare)',
      'Slow flow or no-reflow (uncommon)',
      'Balloon rupture',
      'Transient ventricular ectopy',
      'Standard PCI risks: bleeding, contrast-associated AKI, stent thrombosis',
    ],
    postCare: [
      'Standard post-PCI care and DAPT',
      'Telemetry per PCI protocol',
      'After large-bore peripheral IVL, close checks of distal pulses and access site',
      'Renal function follow-up when contrast volume was high',
    ],
    teaching: [
      'Best for concentric and deep calcium; atherectomy is better for uncrossable lesions and eccentric nodules',
      'Low-pressure inflation reduces dissection compared with high-pressure balloon strategies',
      'Atherectomy followed by IVL can be combined for uncrossable, heavily calcified lesions',
      'Calcium fracture on OCT predicts good stent expansion',
      'Peripheral IVL enables transfemoral TAVR or mechanical support through calcified iliacs',
      'IVL does not replace imaging-guided stent optimization',
    ],
    targetStructures: ['lmca', 'lad-proximal', 'lad-mid', 'lcx-proximal', 'rca-proximal', 'rca-mid'],
    relatedConditions: ['nstemi', 'aortic-stenosis', 'cardiogenic-shock'],
  },

  'iabp-placement': {
    id: 'iabp-placement',
    name: 'Intra-Aortic Balloon Pump',
    category: 'Cath Lab',
    summary:
      'A balloon placed in the descending thoracic aorta inflates in diastole and deflates just before systole, raising coronary perfusion pressure and lowering LV afterload. It gives modest support (~0.5–1 L/min) and is mainly used as a bridge in selected shock and mechanical complications of MI.',
    levelNotes: [
      'During transport with an IABP, keep the cannulated leg straight, protect the catheter, and report bleeding, a cold or pale leg, or pump alarms.',
      'In cardiac arrest with an IABP, start CPR and switch to pressure trigger (or internal mode) per protocol; defibrillation is safe because the console is designed for it.',
      'Check timing (inflation at the dicrotic notch, deflation just before systole), limb perfusion, left radial pulse, urine output, platelets and tip position on CXR.',
      'IABP-SHOCK II showed no mortality benefit in AMI cardiogenic shock with early revascularization, so routine use is not recommended, but it remains useful for acute MR or ventricular septal rupture as a bridge.',
      'Insert via the common femoral artery with the tip just distal to the left subclavian and the balloon above the renal arteries, size by height, and avoid in significant AR, aortic dissection or severe PAD.',
    ],
    overview: [
      'Counterpulsation: diastolic inflation augments aortic diastolic pressure and coronary perfusion',
      'Systolic deflation lowers aortic end-diastolic pressure, reducing afterload and LV work',
      'Helium is used: low density allows rapid shuttling and it dissolves quickly if the balloon ruptures',
      'Augments cardiac output only modestly (~0.5–1 L/min) and relies on some native LV function',
      'Usually placed percutaneously via femoral artery; axillary insertion allows mobilization in long bridges',
      'Triggered most often by the ECG R wave, or by the arterial pressure waveform',
    ],
    indications: [
      'Mechanical complications of MI (acute severe MR, ventricular septal rupture) as a bridge to surgery',
      'Refractory ischemia as a bridge to revascularization',
      'Selected cardiogenic shock not responding to initial therapy (not routine in AMI shock)',
      'Selected high-risk PCI (randomized benefit not shown)',
      'Bridge to LVAD or transplant in advanced heart failure (often axillary)',
      'Refractory ischemic ventricular arrhythmias (selected cases)',
    ],
    contraindications: [
      'Moderate-to-severe aortic regurgitation (diastolic inflation increases regurgitant volume)',
      'Aortic dissection or significant aortic aneurysm',
      'Severe peripheral arterial disease or prior aortofemoral bypass (limb ischemia)',
      'Relative: uncontrolled bleeding or contraindication to anticoagulation',
      'Relative: uncontrolled sepsis',
      'Relative: rapid or very irregular tachyarrhythmias limiting effective timing',
    ],
    anatomy: [
      'Balloon lies in the descending thoracic aorta, tip ~1–2 cm distal to the left subclavian origin',
      'On CXR the tip sits ~2–3 cm below the aortic knob, around the level of the carina',
      'The lower end should stay above the renal arteries (too low → renal or mesenteric ischemia)',
      'Too high can occlude the left subclavian (weak left radial pulse)',
      'Balloon volume is chosen by patient height (~25–50 mL; 40 mL for many average-height adults)',
      'LV coronary flow occurs mainly in diastole, which is why diastolic augmentation helps',
    ],
    accessSite:
      'Common femoral artery over the femoral head, below the inguinal ligament (ultrasound guided); axillary/subclavian artery for longer bridges',
    steps: [
      {
        title: 'Assess',
        description:
          'Confirm indication; exclude significant AR, dissection and severe PAD (exam, echo, imaging); check platelets and coagulation.',
      },
      {
        title: 'Access',
        description:
          'Ultrasound-guided common femoral arterial puncture and sheath placement (typically 7–8 Fr) or sheathless insertion.',
      },
      {
        title: 'Prepare the balloon',
        description:
          'Select size by height, apply vacuum to fully deflate the balloon and flush the central lumen.',
      },
      {
        title: 'Insert and position',
        description:
          'Advance over a guidewire under fluoroscopy so the tip lies just distal to the left subclavian artery.',
      },
      {
        title: 'Connect',
        description:
          'Connect the helium line and central arterial pressure lumen; select ECG trigger or pressure trigger.',
      },
      {
        title: 'Set timing',
        description:
          'Start at 1:2 to compare assisted and unassisted beats; inflate at the dicrotic notch and deflate just before systole.',
      },
      {
        title: 'Confirm and anticoagulate',
        description:
          'Confirm position on fluoroscopy or CXR and start anticoagulation per institutional protocol.',
      },
      {
        title: 'Secure and check limb',
        description:
          'Secure the catheter and check distal pulses, limb perfusion and the left radial pulse.',
      },
    ],
    ecg: [
      'ECG trigger uses the R wave: needs a clear QRS with minimal artifact',
      'On ECG timing, inflation falls around the middle of the T wave and deflation just before the QRS',
      'Modern consoles handle AF by deflating on each R wave',
      'Tachycardia > ~120–130 bpm reduces augmentation; consider 1:2 ratio',
      'Paced rhythms use pacer trigger modes',
      'During CPR use pressure trigger, or internal trigger if no compressions, to keep the balloon moving',
    ],
    equipment: [
      'IABP console with helium supply and ECG/pressure trigger inputs',
      'Balloon catheter sized by height, with central lumen for aortic pressure',
      'Femoral sheath, guidewire and ultrasound',
      'Arterial pressure transducer system',
      'Fluoroscopy or CXR for position confirmation',
      'Heparin infusion per protocol',
    ],
    complications: [
      'Limb ischemia (most common major complication)',
      'Access-site bleeding, hematoma, retroperitoneal hemorrhage',
      'Thrombocytopenia and hemolysis',
      'Balloon rupture: blood in the helium tubing → stop pump, clamp and remove urgently',
      'Malposition: left subclavian occlusion, or renal/mesenteric ischemia (low urine output, abdominal pain)',
      'Aortic dissection, infection, cholesterol or thromboembolism and stroke',
    ],
    postCare: [
      'Hourly neurovascular checks of the cannulated limb, left radial pulse and urine output',
      'Keep the leg straight with head of bed ≤ ~30° for femoral devices',
      'Daily CXR for tip position; daily platelets and hemoglobin',
      'Do not leave the balloon static in the aorta for more than ~15–30 minutes (thrombus risk)',
      'Wean by reducing ratio (1:1 → 1:2 → 1:3) or augmentation as hemodynamics improve',
      'After removal: firm compression, bed rest and limb and bleeding checks',
    ],
    teaching: [
      'Correct timing: inflate at aortic valve closure (dicrotic notch), deflate just before aortic valve opening',
      'Early inflation causes premature aortic valve closure and raises afterload; late inflation loses augmentation',
      'Early deflation loses afterload reduction and can cause retrograde coronary flow; late deflation raises afterload',
      'Good timing: augmented diastolic peak > unassisted systole; assisted end-diastolic pressure < unassisted',
      'IABP-SHOCK II: no short- or long-term mortality benefit in AMI shock with early revascularization',
      'Significant AR and aortic dissection are absolute contraindications',
    ],
    targetStructures: ['descending-aorta', 'aortic-arch', 'aortic-valve', 'left-ventricle', 'lmca'],
    relatedConditions: [
      'cardiogenic-shock', 'anterior-stemi', 'mitral-regurgitation', 'vsd', 'hfref', 'aortic-dissection',
    ],
  },

  'impella-placement': {
    id: 'impella-placement',
    name: 'Impella Microaxial Flow Pump',
    category: 'Cath Lab',
    summary:
      'A catheter-mounted microaxial pump placed across the aortic valve draws blood from the left ventricle and ejects it into the ascending aorta, unloading the LV and supporting cardiac output. Right-sided versions support a failing right ventricle.',
    levelNotes: [
      'During transport, keep the controller and catheter secure, avoid manipulating the femoral line, and report bleeding, alarms or a cold leg.',
      'Chest compressions can displace the pump, so follow device guidance during CPR (reduce to a low performance level) and defibrillate as usual, expecting a position check afterwards.',
      'Monitor for hemolysis (plasma free Hb, dark urine), limb ischemia, bleeding and suction or position alarms, and use echo to confirm inlet depth.',
      'DanGer Shock showed lower 180-day mortality with a microaxial pump in selected STEMI cardiogenic shock (non-comatose, LV-dominant), at the cost of more bleeding, limb ischemia and renal replacement therapy.',
      'Exclude LV thrombus, mechanical aortic valve, severe AS and severe PAD, use ultrasound-guided large-bore access with preclosure and a limb perfusion plan, and place the inlet ~3.5 cm below the aortic annulus.',
    ],
    overview: [
      'Inlet sits in the LV and outlet in the ascending aorta, producing continuous forward flow',
      'Directly unloads the LV: lowers LVEDP, wall stress and myocardial oxygen demand',
      'Left-sided devices deliver ~2.5 to ~5.5 L/min depending on model',
      'Percutaneous femoral insertion for most devices; axillary insertion for larger, longer-term pumps',
      'Right-sided device (inflow IVC, outflow pulmonary artery) supports RV failure',
      'Used in cardiogenic shock, protected high-risk PCI and LV venting during VA-ECMO',
    ],
    indications: [
      'AMI-related cardiogenic shock with LV-predominant failure, within a shock-team approach',
      'High-risk PCI (left main, last remaining vessel, severe LV dysfunction); evidence for routine use is limited',
      'Bridge to recovery, decision, durable LVAD or transplant',
      'LV unloading during VA-ECMO',
      'Right ventricular failure after MI, LVAD or transplant (right-sided device)',
    ],
    contraindications: [
      'LV thrombus',
      'Mechanical aortic valve',
      'Severe aortic stenosis or moderate-to-severe aortic regurgitation',
      'Severe peripheral arterial disease precluding large-bore access (consider axillary or IVL-facilitated access)',
      'Ventricular septal rupture or atrial/ventricular septal defect, LV free-wall rupture; cardiac tamponade',
      'Significant aortic disease (dissection, aneurysm); significant RV failure without RV support; inability to tolerate anticoagulation (relative)',
    ],
    anatomy: [
      'Pump crosses the aortic valve: inlet in the LV cavity, outlet above the valve in the ascending aorta',
      'Inlet ~3.5 cm below the aortic annulus for common percutaneous devices, clear of the mitral apparatus',
      'Too deep → suction events, ectopy, mitral apparatus entanglement; too shallow → recirculation and low flow',
      'Femoral access needs adequate iliofemoral diameter and limited calcification (assess by CT or angiography)',
      'Right-sided device crosses the tricuspid and pulmonary valves from the femoral vein',
    ],
    accessSite:
      'Large-bore (~13–14 Fr) common femoral artery access over the femoral head below the inguinal ligament; axillary artery for larger devices; femoral vein for right-sided support',
    steps: [
      {
        title: 'Evaluate',
        description:
          'Echo to exclude LV thrombus and significant aortic valve disease; image the iliofemoral arteries.',
      },
      {
        title: 'Access',
        description:
          'Ultrasound- and fluoroscopy-guided common femoral puncture, preclose with suture-based closure devices, dilate and place the large-bore sheath.',
      },
      {
        title: 'Anticoagulate',
        description: 'Give unfractionated heparin to the insertion ACT target (commonly > 250 s).',
      },
      {
        title: 'Cross the valve',
        description:
          'Cross the aortic valve with a diagnostic catheter and park a stiff 0.018-inch placement wire in the LV apex.',
      },
      {
        title: 'Advance the pump',
        description:
          'Advance the pump over the wire under fluoroscopy until the inlet is ~3.5 cm below the annulus.',
      },
      {
        title: 'Start support',
        description:
          'Remove the wire, start the pump and titrate performance level while confirming position by fluoroscopy and echo.',
      },
      {
        title: 'Secure and purge',
        description:
          'Lock the repositioning sheath, confirm purge solution (heparin- or bicarbonate-based) and secure the catheter.',
      },
      {
        title: 'Protect the limb',
        description:
          'Assess distal perfusion and place a distal perfusion catheter if the limb is ischemic.',
      },
    ],
    ecg: [
      'PVCs or VT suggest the inlet is against the LV wall or papillary muscle; reposition',
      'Suction events cause ventricular ectopy and reduced flow',
      'LV pump flow continues during VT/VF only if RV output and preload are maintained',
      'Defibrillation and cardioversion can be performed with the pump in place',
      'Monitor for ischemic arrhythmias in ongoing shock',
    ],
    equipment: [
      'Microaxial pump catheter and controller console',
      'Large-bore introducer sheath and suture-based preclosure devices',
      '0.018-inch placement wire and diagnostic catheters',
      'Purge solution (heparinized dextrose or bicarbonate-based)',
      'Echo (TTE/TEE) for positioning',
      'Distal perfusion sheath for limb protection',
    ],
    complications: [
      'Hemolysis (malposition, suction, high speed): check plasma free Hb and LDH',
      'Access-site bleeding and vascular injury',
      'Limb ischemia',
      'Aortic valve injury or new aortic regurgitation',
      'Stroke and thromboembolism',
      'Pump migration, suction events, ventricular arrhythmias, acute kidney injury',
    ],
    postCare: [
      'Daily echo and position checks; repositioning only by trained staff',
      'Labs: hemoglobin, plasma free Hb/LDH, platelets, coagulation, renal function',
      'Monitor purge and systemic anticoagulation per protocol',
      'Hourly distal pulse/Doppler checks, urine color and output',
      'Daily weaning assessment: lactate, hemodynamics, RV function (CVP, PAPi)',
      'Plan large-bore sheath removal with closure device or surgical repair',
    ],
    teaching: [
      'IABP augments diastolic pressure; a microaxial pump actively unloads the LV',
      'LV thrombus is a contraindication: the inlet can aspirate and embolize thrombus',
      'RV failure limits left-sided pump output, so watch CVP and PAPi and consider RV support',
      'Bleeding, limb ischemia and hemolysis are the most common serious complications',
      'DanGer Shock showed mortality benefit in selected STEMI shock; earlier observational data were mixed',
      'Shock-team protocols (early recognition, invasive hemodynamics, timely MCS) matter as much as the device',
    ],
    targetStructures: [
      'left-ventricle', 'aortic-valve', 'ascending-aorta', 'descending-aorta', 'right-ventricle', 'pulmonary-trunk',
    ],
    relatedConditions: [
      'cardiogenic-shock', 'anterior-stemi', 'hfref', 'dilated-cardiomyopathy', 'aortic-stenosis',
    ],
  },

  // ─── Electrophysiology & Devices ──────────────────────────────────────────

  'ep-study': {
    id: 'ep-study',
    name: 'Electrophysiology Study',
    category: 'Electrophysiology & Devices',
    summary:
      'An invasive study that places catheters inside the heart to record its electrical signals and stimulate it, revealing the mechanism and location of arrhythmias and the health of the conduction system. It is often followed immediately by catheter ablation.',
    levelNotes: [
      'For recurrent fainting or palpitations, a rhythm strip captured during symptoms is extremely valuable, so record and hand it over.',
      'Capture and transmit strips of any tachycardia, including its onset and response to vagal maneuvers or adenosine, because they guide EP diagnosis.',
      'After an EP study, monitor femoral venous access sites, rhythm (induced arrhythmias, new AV block) and recovery from sedation.',
      'Know baseline intervals (AH ~50–120 ms, HV 35–55 ms); HV ≥ 70 ms or infra-Hisian block in syncope with bundle branch block supports pacing.',
      'Use programmed stimulation, entrainment and maneuvers such as para-Hisian pacing to separate AVNRT, AVRT and atrial tachycardia and localize ablation targets.',
    ],
    overview: [
      'Multipolar catheters at high RA, His bundle, coronary sinus and RV apex, usually via femoral veins',
      'Records intracardiac electrograms and measures conduction intervals (PA, AH, HV)',
      'Programmed electrical stimulation induces arrhythmias to study their mechanism',
      'Assesses sinus node recovery time, AV node Wenckebach point and refractory periods',
      'VT inducibility can help risk-stratify selected structural heart disease patients',
      'Usually combined with ablation in the same session',
    ],
    indications: [
      'Documented or suspected SVT for diagnosis and ablation (AVNRT, AVRT, atrial tachycardia, flutter)',
      'Wide-complex tachycardia of uncertain mechanism',
      'Syncope with structural heart disease or bundle branch block when noninvasive work-up is nondiagnostic',
      'Pre-excitation risk stratification (shortest pre-excited RR in AF ≤ 250 ms = high risk)',
      'VT inducibility in selected patients (e.g., ischemic cardiomyopathy with syncope or NSVT)',
      'Suspected sinus or AV node disease when symptom–rhythm correlation is uncertain',
    ],
    contraindications: [
      'Active ischemia or unstable ACS',
      'Decompensated heart failure or hemodynamic instability (unless arrhythmia-driven)',
      'Severe electrolyte disturbance or drug toxicity (e.g., digoxin)',
      'LA or LV thrombus if left-sided access is planned',
      'Active infection or bacteremia',
      'Relative: pregnancy (minimize or avoid fluoroscopy)',
    ],
    anatomy: [
      'High right atrial catheter near the SA node records atrial activation',
      'His catheter across the anterosuperior tricuspid annulus records the His deflection',
      'Coronary sinus catheter records left atrial and basal LV activation',
      'Triangle of Koch: tendon of Todaro, septal tricuspid leaflet and CS ostium; compact AV node at its apex',
      'Slow pathway lies posteroinferior near the CS ostium; fast pathway superior near the His',
      'RV apical catheter for ventricular pacing and recording',
    ],
    accessSite:
      'Femoral veins (typically 2–4 sheaths, ultrasound guided); internal jugular or subclavian vein sometimes for coronary sinus access',
    steps: [
      {
        title: 'Prepare',
        description:
          'Stop antiarrhythmics (usually ≥ 5 half-lives) if inducibility is needed; plan sedation and apply defibrillator pads.',
      },
      {
        title: 'Venous access',
        description: 'Ultrasound-guided femoral venous access with multiple sheaths.',
      },
      {
        title: 'Position catheters',
        description:
          'Place HRA, His, CS and RV apex catheters under fluoroscopy and/or 3D electroanatomic mapping.',
      },
      {
        title: 'Baseline intervals',
        description: 'Record sinus cycle length, PR, QRS, AH and HV intervals.',
      },
      {
        title: 'Atrial pacing',
        description:
          'Incremental pacing and extrastimuli define AV node Wenckebach, refractory periods and dual AV node physiology, and may induce SVT.',
      },
      {
        title: 'Ventricular pacing',
        description:
          'Assess retrograde conduction (concentric vs eccentric atrial activation) and use extrastimuli to induce SVT or VT.',
      },
      {
        title: 'Pharmacologic challenge',
        description:
          'Isoproterenol facilitates induction; procainamide or similar challenges are used for selected conduction questions.',
      },
      {
        title: 'Diagnose and map',
        description:
          'Use entrainment and pacing maneuvers to define the mechanism, then proceed to ablation if indicated.',
      },
    ],
    ecg: [
      'Surface 12-lead ECG and intracardiac electrograms are recorded simultaneously',
      'Induced SVT, VT or AF is expected; defibrillator pads must be on',
      'Catheter trauma can cause transient AV block or RBBB',
      'In WPW, pre-excitation degree changes with pacing site and rate',
      'Post-study ECG documents baseline intervals and any new conduction block',
    ],
    equipment: [
      'Multipolar diagnostic catheters (quadripolar, decapolar coronary sinus)',
      'EP recording system and programmable stimulator',
      '3D electroanatomic mapping system when ablation is anticipated',
      'External defibrillator with pads',
      'Isoproterenol, adenosine and sedation drugs',
      'Ultrasound for venous access',
    ],
    complications: [
      'Vascular: hematoma, AV fistula, pseudoaneurysm (inadvertent arterial puncture)',
      'Induced sustained arrhythmia requiring pacing termination or cardioversion',
      'Cardiac perforation and tamponade (rare)',
      'Transient heart block from catheter trauma',
      'DVT/PE and infection (rare)',
      'Overall major complications ~1% or less',
    ],
    postCare: [
      'Bed rest ~2–4 hours after femoral venous access with groin checks',
      'Telemetry if arrhythmia was induced or AV conduction affected',
      'Resume antiarrhythmics or anticoagulation per plan',
      'Driving advice depends on the diagnosis and treatment',
      'Educate on symptoms that should prompt review',
    ],
    teaching: [
      'Normal HV 35–55 ms; prolonged HV means infra-Hisian disease and higher risk of complete heart block',
      'Dual AV node physiology: AH jump ≥ 50 ms with a 10 ms shorter atrial extrastimulus',
      'Concentric retrograde atrial activation suggests AV node conduction; eccentric suggests an accessory pathway (earliest in distal CS = left-sided)',
      'Para-Hisian pacing distinguishes septal accessory pathway from AV nodal retrograde conduction',
      'Shortest pre-excited RR ≤ 250 ms during AF marks a high-risk accessory pathway',
      'Noninducibility does not fully exclude a clinical arrhythmia',
    ],
    targetStructures: [
      'right-atrium', 'sa-node', 'av-node', 'bundle-of-his', 'coronary-sinus', 'right-ventricle', 'interatrial-septum',
    ],
    relatedConditions: [
      'avnrt', 'wpw-syndrome', 'atrial-flutter', 'monomorphic-vt', 'bifascicular-block', 'mobitz-type-ii',
      'sinus-bradycardia',
    ],
  },

  'catheter-ablation': {
    id: 'catheter-ablation',
    name: 'Catheter Ablation (incl. PVI)',
    category: 'Electrophysiology & Devices',
    summary:
      'Catheter ablation destroys or electrically isolates the small areas of heart tissue that start or sustain an arrhythmia, using radiofrequency heat, cryoenergy or pulsed field energy. It can cure most SVTs and typical flutter and reduces atrial fibrillation burden.',
    levelNotes: [
      'After an ablation, chest pain, breathlessness, collapse or stroke symptoms can mean tamponade or stroke, so treat as time-critical.',
      'Hypotension with distended neck veins soon after ablation suggests tamponade, and fever with neurologic signs weeks after AF ablation suggests atrioesophageal fistula, so transport urgently.',
      'Fever, neurologic events or GI bleeding 1–6 weeks after AF ablation suggests atrioesophageal fistula, so get CT chest, avoid endoscopy (air insufflation can cause air embolism) and call cardiothoracic surgery.',
      'Ablation is first-line for symptomatic AVNRT, AVRT/WPW and typical flutter, and a Class 1 option for selected symptomatic paroxysmal AF and AF with HFrEF (CASTLE-AF).',
      'Know the targets (slow pathway for AVNRT, accessory pathway for WPW, bidirectional CTI block for flutter, PVI for AF by RF, cryo or pulsed field) and their specific risks.',
    ],
    overview: [
      'Mapping (activation, entrainment, voltage/substrate) locates the circuit or trigger',
      'Energy sources: radiofrequency (heat), cryoablation (freezing), pulsed field ablation (non-thermal electroporation)',
      'AVNRT and accessory pathway ablation cure rates ~95% with low recurrence',
      'Typical flutter: CTI ablation success > 90%, but many patients later develop AF',
      'AF: pulmonary vein isolation (PVI) is the cornerstone; success lower than SVT and repeat procedures are common',
      'VT ablation reduces ICD shocks and recurrent VT in structural heart disease',
    ],
    indications: [
      'Symptomatic AVNRT (slow pathway ablation) as first-line therapy',
      'WPW or accessory pathway AVRT, and high-risk asymptomatic pre-excitation',
      'Typical (CTI-dependent) atrial flutter as first-line therapy',
      'Symptomatic AF for rhythm control, including first-line in selected paroxysmal AF and AF with HFrEF',
      'Recurrent monomorphic VT despite antiarrhythmics or ICD therapies; idiopathic outflow tract VT/PVCs',
      'Frequent PVCs causing symptoms or PVC-induced cardiomyopathy',
    ],
    contraindications: [
      'Left atrial or LAA thrombus for left atrial ablation (exclude by TEE or CT when indicated)',
      'Inability to anticoagulate around left-sided ablation',
      'LV thrombus for LV/VT ablation',
      'Active infection or decompensated heart failure (relative)',
      'Relative: pregnancy (fluoroscopy-minimizing approaches possible)',
    ],
    anatomy: [
      'AVNRT: slow pathway in the posteroseptal RA near the CS ostium, inferior Koch triangle, away from the compact AV node',
      'Typical flutter: macro-reentry around the tricuspid annulus through the cavotricuspid isthmus (IVC to tricuspid annulus)',
      'AF triggers arise mostly in pulmonary vein muscle sleeves; PVI isolates them',
      'Accessory pathways cross the mitral or tricuspid annulus; left free wall is most common',
      'Esophagus lies directly behind the posterior LA; the right phrenic nerve runs near the right superior PV and SVC',
      'Left atrial access requires transseptal puncture through the fossa ovalis',
    ],
    accessSite:
      'Femoral veins (ultrasound guided); transseptal puncture through the fossa ovalis for left atrial targets; retrograde aortic or transseptal access for LV/VT ablation',
    steps: [
      {
        title: 'Prepare',
        description:
          'Uninterrupted or minimally interrupted anticoagulation for AF ablation; imaging to exclude LAA thrombus when indicated.',
      },
      {
        title: 'Anesthesia and access',
        description: 'Conscious sedation or general anesthesia; ultrasound-guided femoral venous access.',
      },
      {
        title: 'Diagnostic study',
        description: 'Position catheters, then induce and define the arrhythmia as in an EP study.',
      },
      {
        title: 'Transseptal puncture',
        description:
          'For left-sided targets, puncture the fossa ovalis under ICE and/or fluoroscopy and give heparin to ACT target (commonly ≥ 300 s).',
      },
      {
        title: 'Mapping',
        description:
          'Build a 3D electroanatomic map (activation, voltage) or define pulmonary vein anatomy.',
      },
      {
        title: 'Ablation',
        description:
          'Deliver RF, cryo or pulsed field energy at the target: PV antra, CTI, slow pathway, accessory pathway or VT isthmus.',
      },
      {
        title: 'Confirm endpoint',
        description:
          'Entrance/exit block for PVI, bidirectional CTI block, loss of pathway conduction, or noninducibility.',
      },
      {
        title: 'Wait and retest',
        description:
          'Observation period with isoproterenol or adenosine challenge to reveal recovered or dormant conduction.',
      },
      {
        title: 'Close',
        description:
          'Remove sheaths and achieve hemostasis (figure-of-8 suture or compression); consider protamine reversal.',
      },
    ],
    ecg: [
      'Junctional rhythm during slow pathway ablation is expected; fast junctional rhythm or VA block → stop (AV block risk)',
      'Delta wave disappears when an accessory pathway is successfully ablated',
      'Post-flutter ablation ECG should show no flutter waves; block is confirmed by pacing',
      'Early AF recurrence in the first ~3 months (blanking period) does not define failure',
      'Inferior ST elevation during left atrial ablation suggests air embolism to the RCA',
      'Vagal responses (bradycardia, asystole, hypotension) during PV or ganglionated plexus ablation; coronary spasm can occur with pulsed field near arteries',
    ],
    equipment: [
      '3D electroanatomic mapping system and multipolar mapping catheters',
      'Irrigated RF catheters with contact-force sensing, cryoballoon, pulsed field catheters',
      'Transseptal sheath and needle; intracardiac echocardiography (ICE)',
      'Esophageal temperature probe for thermal ablation',
      'Programmable stimulator, recording system and defibrillator',
      'Heparin, protamine, isoproterenol and adenosine',
    ],
    complications: [
      'Vascular access complications (most common)',
      'Cardiac tamponade (~0.5–1% in AF ablation)',
      'Stroke/TIA and silent cerebral emboli',
      'AV block with septal or slow pathway ablation (< 1%)',
      'Phrenic nerve palsy (cryoballoon, right PVs) and PV stenosis (rare with antral ablation)',
      'Atrioesophageal fistula (rare, often fatal, 1–6 weeks after thermal ablation); hemolysis with extensive pulsed field ablation',
    ],
    postCare: [
      'Continue oral anticoagulation for at least ~2–3 months after AF ablation',
      'Long-term anticoagulation follows stroke risk (CHA2DS2-VASc), not apparent rhythm success',
      'PPI is often given for several weeks after AF ablation for esophageal protection',
      'Many patients are discharged the same day after observation and groin checks',
      'Teach red flags: fever, chest pain, dysphagia, neurologic symptoms, hematemesis',
      'Rhythm monitoring (ECG, Holter, device) after the ~3-month blanking period',
    ],
    teaching: [
      'Targets: slow pathway (AVNRT), accessory pathway (WPW/AVRT), CTI line (typical flutter), PVI (AF), scar isthmus (VT)',
      'Pulsed field ablation is largely myocardium-selective, lowering esophageal and phrenic injury risk',
      'Typical flutter: sawtooth waves negative in II, III, aVF; counterclockwise around the tricuspid annulus',
      'Successful SVT ablation is usually curative and allows medications to be stopped',
      'Never endoscope a suspected atrioesophageal fistula; CT chest first',
      'Cryoablation reduces AV block risk near the compact AV node (e.g., in children or midseptal targets)',
    ],
    targetStructures: [
      'pulmonary-veins', 'left-atrium', 'right-atrium', 'av-node', 'coronary-sinus', 'ivc', 'tricuspid-valve',
      'fossa-ovalis', 'interatrial-septum',
    ],
    relatedConditions: [
      'atrial-fibrillation', 'atrial-flutter', 'avnrt', 'wpw-syndrome', 'monomorphic-vt', 'pvcs', 'hfref',
    ],
  },

  'pacemaker-implantation': {
    id: 'pacemaker-implantation',
    name: 'Pacemaker Implantation',
    category: 'Electrophysiology & Devices',
    summary:
      'A permanent pacemaker is a battery-powered generator placed under the skin with leads into the heart; it senses the heart\'s own activity and paces when the rate is too slow or conduction fails. It is the definitive treatment for symptomatic bradycardia and high-grade AV block.',
    levelNotes: [
      'Recognize the device bump below the clavicle and pacing spikes on the monitor, and defibrillate normally with pads not directly over the device (ideally ~8 cm away or anterior–posterior).',
      'Identify failure to capture (spikes without a complex) and failure to sense, and use transcutaneous pacing as the bridge for unstable bradycardia.',
      'After implant, watch for pneumothorax, pocket hematoma, lead dislodgement (loss of capture) and tamponade, and get a CXR and device interrogation.',
      'Pacing is indicated for symptomatic sinus node dysfunction, and for Mobitz II, high-grade or complete heart block not due to reversible causes even without symptoms.',
      'Choose venous access (cephalic, axillary, subclavian) and lead sites (RA appendage, RV septum/apex or conduction system) and confirm sensing, threshold, impedance and stability before closing.',
    ],
    overview: [
      'Generator in a subcutaneous (prepectoral) or submuscular pocket, usually left infraclavicular',
      'Leads to the RA and/or RV: single-chamber or dual-chamber systems',
      'Modes are described by the NBG code (e.g., DDD, VVI, AAI) with optional rate response (R)',
      'Battery longevity typically ~7–12 years depending on pacing burden and settings',
      'Conduction system pacing and leadless pacemakers are newer alternatives',
      'Remote monitoring is standard follow-up',
    ],
    indications: [
      'Symptomatic sinus node dysfunction (bradycardia, pauses, chronotropic incompetence) not due to reversible causes',
      'Mobitz II, high-grade or third-degree AV block not due to reversible causes, regardless of symptoms',
      'Alternating bundle branch block',
      'Tachy–brady syndrome needing rate-control drugs that worsen bradycardia',
      'Symptomatic bradycardia from essential guideline-directed drugs with no alternative',
      'Persistent high-grade AV block after TAVR or cardiac surgery',
    ],
    contraindications: [
      'Reversible causes: hyperkalemia, drug toxicity (beta-blocker, calcium channel blocker, digoxin), hypothyroidism, Lyme carditis',
      'Transient AV block in acute inferior MI (often resolves; observe first)',
      'Active systemic infection or bacteremia (use temporary pacing until cleared)',
      'Asymptomatic sinus bradycardia, asymptomatic first-degree AV block or nodal Mobitz I',
      'Relative: uncorrected coagulopathy (continued warfarin is safer than heparin bridging)',
      'Relative: venous occlusion (use contralateral side or a leadless device)',
    ],
    anatomy: [
      'Venous access: cephalic vein (deltopectoral groove), axillary vein (extrathoracic) or subclavian vein',
      'Lead path: brachiocephalic vein → SVC → RA → tricuspid valve → RV',
      'Atrial lead usually in the RA appendage; ventricular lead on the RV septum, apex or conduction system',
      'Subclavian crush: lead compressed between clavicle and first rib can fracture',
      'RV apical and free wall myocardium is thin (perforation risk with active fixation)',
      'Generator sits in a pocket over the pectoralis major fascia',
    ],
    accessSite:
      'Left (or right) infraclavicular incision with cephalic cutdown or ultrasound/fluoroscopy-guided axillary vein puncture; subclavian puncture as an alternative',
    steps: [
      {
        title: 'Prepare',
        description:
          'Give antibiotic prophylaxis (e.g., cefazolin within 60 minutes), manage anticoagulation, and prep skin with chlorhexidine–alcohol.',
      },
      {
        title: 'Anesthesia and incision',
        description: 'Local anesthesia with sedation; infraclavicular incision.',
      },
      {
        title: 'Venous access',
        description: 'Cephalic cutdown or guided axillary vein puncture and peel-away sheath placement.',
      },
      {
        title: 'Place leads',
        description:
          'Position the ventricular lead (RV septum/apex or conduction system) and atrial lead (RA appendage) with active or passive fixation.',
      },
      {
        title: 'Test leads',
        description:
          'Confirm sensing (R wave ≥ ~5 mV, P wave ≥ ~2 mV), capture threshold (≤ ~1 V at 0.4–0.5 ms), impedance (~300–1,200 Ω) and no diaphragmatic pacing at 10 V.',
      },
      {
        title: 'Secure leads',
        description: 'Suture lead sleeves to the pectoral fascia with appropriate slack.',
      },
      {
        title: 'Pocket and generator',
        description: 'Create the pocket, connect leads, irrigate and confirm meticulous hemostasis.',
      },
      {
        title: 'Close and program',
        description: 'Layered closure, program mode and lower rate, and confirm lead positions on fluoroscopy.',
      },
      {
        title: 'Post-implant checks',
        description: 'CXR for pneumothorax and lead position; device interrogation before discharge.',
      },
    ],
    ecg: [
      'Atrial spike followed by a P wave; ventricular spike followed by a wide QRS',
      'RV apical pacing gives an LBBB-like QRS with left superior axis',
      'Failure to capture: spike without depolarization (dislodgement, high threshold, lead fracture)',
      'Undersensing: spikes fire inappropriately into native complexes; oversensing causes pauses',
      'Pacemaker-mediated tachycardia in DDD: retrograde P waves trigger pacing at the upper rate',
      'Magnet over a pacemaker usually gives asynchronous pacing (DOO/VOO) at the magnet rate',
    ],
    equipment: [
      'Pulse generator and atrial/ventricular leads (active or passive fixation)',
      'Peel-away introducer sheaths, guidewires and stylets',
      'Pacing system analyzer for lead testing',
      'Fluoroscopy and ultrasound',
      'Surgical instruments and antibiotic prophylaxis',
      'Device programmer for interrogation',
    ],
    complications: [
      'Pocket hematoma (more with heparin bridging and antiplatelet therapy)',
      'Pneumothorax (subclavian > axillary; cephalic avoids it)',
      'Lead dislodgement, mostly in the first weeks and more often atrial',
      'Cardiac perforation and tamponade',
      'Device infection (pocket or systemic) requiring complete system removal',
      'Tricuspid regurgitation, venous thrombosis/occlusion, pacemaker syndrome with VVI pacing',
    ],
    postCare: [
      'CXR (PA and lateral) to exclude pneumothorax and confirm lead position',
      'Limit vigorous arm elevation on the implant side for a few weeks per local protocol',
      'Wound care: keep dry; report swelling, redness, drainage or fever',
      'Device check before discharge and at follow-up, plus remote monitoring',
      'MRI only with an MR-conditional system and protocol; avoid strong magnets over the device',
      'Driving restrictions are usually brief but follow local regulations',
    ],
    teaching: [
      'NBG code: 1st letter chamber paced, 2nd sensed, 3rd response (I inhibit, T trigger, D dual), 4th R = rate response',
      'DDD paces and senses both chambers; VVI paces and senses the ventricle and is inhibited by native beats',
      'Pacemakers treat slow rhythms; ICDs are needed to treat ventricular tachyarrhythmias',
      'High RV pacing burden (> ~20–40%) can cause pacing-induced cardiomyopathy',
      'An RBBB-pattern paced QRS from an "RV" lead may mean LV placement (perforation, PFO/ASD) and needs checking',
      'Atropine is often ineffective in infranodal block; pacing is definitive',
    ],
    targetStructures: [
      'right-atrium', 'right-atrial-appendage', 'right-ventricle', 'apex', 'interventricular-septum', 'svc',
      'tricuspid-valve', 'sa-node', 'av-node',
    ],
    relatedConditions: [
      'sinus-bradycardia', 'mobitz-type-ii', 'third-degree-av-block', 'bifascicular-block', 'paced-rhythm',
      'atrial-fibrillation',
    ],
  },

  'leadless-pacemaker': {
    id: 'leadless-pacemaker',
    name: 'Leadless Pacemaker',
    category: 'Electrophysiology & Devices',
    summary:
      'A self-contained capsule pacemaker is delivered through a femoral vein catheter and fixed directly inside the right ventricle, with no pocket and no transvenous leads. It avoids pocket and lead complications but offers more limited pacing options.',
    levelNotes: [
      'A patient can have a pacemaker with no chest bump or scar, so ask about devices and look for paced complexes on the monitor.',
      'Leadless devices produce paced complexes like conventional systems (the spike may be tiny or invisible), so manage bradycardia and arrest per ACLS and defibrillate normally.',
      'Early dangers are groin bleeding or AV fistula and cardiac perforation with tamponade, so hypotension after implant needs an urgent echo.',
      'Consider leadless pacing for patients needing mainly ventricular pacing (e.g., AF with slow ventricular response), with high infection risk, dialysis, limited venous access or prior device infection.',
      'Deploy on the RV mid-septum (avoid apex and free wall), confirm fixation with a tug test and electrical parameters, and plan for retrieval or end-of-life strategy.',
    ],
    overview: [
      'Capsule (~2.5–4 cm long) containing battery, electronics and electrode',
      'Delivered via a large-bore (~25–27 Fr) femoral venous sheath to the RV',
      'Fixed by nitinol tines or an active helix',
      'Originally VVI(R) only; accelerometer-based atrial sensing (VDD) and dual-chamber leadless systems now exist',
      'No pocket and no leads, avoiding pocket hematoma, pocket infection and lead fracture',
      'End-of-battery options include retrieval or implanting an additional device',
    ],
    indications: [
      'Bradycardia needing ventricular pacing, especially permanent AF with slow ventricular response',
      'High infection risk (dialysis, diabetes, immunosuppression) or prior device infection',
      'Limited upper-extremity venous access (occlusion, dialysis fistula)',
      'Infrequent pacing needs (e.g., paroxysmal AV block or pauses) where VVI is adequate',
      'AV block in sinus rhythm when atrial-sensing or dual-chamber leadless systems are available',
    ],
    contraindications: [
      'Need for defibrillator or CRT therapy (not provided by a leadless pacemaker alone)',
      'Femoral venous route not feasible (IVC occlusion, some IVC filters)',
      'Mechanical tricuspid valve',
      'Significant need for atrial pacing (sinus node dysfunction) when only single-chamber devices are available',
      'Active infection or bacteremia at time of implant (relative; timing per infection team)',
    ],
    anatomy: [
      'Route: femoral vein → IVC → RA → tricuspid valve → RV',
      'Target: RV mid-septum, with lower perforation risk than apex or free wall',
      'The thin RV apex and free wall are the main perforation sites',
      'Trabeculations and the moderator band can affect positioning',
      'Dual-chamber leadless systems add an atrial capsule in the right atrial appendage region',
    ],
    accessSite: 'Femoral vein (usually right) with ultrasound guidance and a large-bore introducer sheath',
    steps: [
      {
        title: 'Prepare',
        description:
          'Antibiotic prophylaxis, anticoagulation plan and femoral venous ultrasound to confirm suitable anatomy.',
      },
      {
        title: 'Access',
        description:
          'Ultrasound-guided femoral venous puncture, serial dilation, large-bore sheath placement and heparin.',
      },
      {
        title: 'Navigate',
        description:
          'Advance the steerable delivery catheter through the IVC and RA across the tricuspid valve into the RV.',
      },
      {
        title: 'Position',
        description:
          'Use contrast and orthogonal (RAO/LAO) views to place the device on the RV mid-septum.',
      },
      {
        title: 'Fix',
        description: 'Deploy the tines or screw in the helix to anchor the device.',
      },
      {
        title: 'Test',
        description:
          'Perform a tug test to confirm fixation and measure sensing, capture threshold and impedance.',
      },
      {
        title: 'Release',
        description:
          'Release the tether once parameters are acceptable; reposition first if they are not.',
      },
      {
        title: 'Close',
        description: 'Remove the sheath and close with a figure-of-8 suture or compression.',
      },
    ],
    ecg: [
      'Paced QRS resembles RV pacing (LBBB-like); septal sites give a narrower QRS than apical sites',
      'VVI mode lacks AV synchrony and can cause pacemaker syndrome',
      'Accelerometer-based VDD tracking may lose AV synchrony at higher sinus rates',
      'Early rise in capture threshold can signal poor contact or micro-dislodgement',
      'Magnet response varies by device and some leadless pacemakers have none; use a programmer',
    ],
    equipment: [
      'Leadless pacemaker with steerable delivery catheter',
      'Large-bore femoral venous introducer (~25–27 Fr)',
      'Fluoroscopy and contrast',
      'Device programmer',
      'Suture or closure method for venous hemostasis',
      'Pericardiocentesis kit on standby',
    ],
    complications: [
      'Cardiac perforation and tamponade (~1%; higher in elderly, female and low-weight patients)',
      'Groin complications: hematoma, AV fistula, pseudoaneurysm',
      'Device dislodgement or embolization (rare; snare retrieval)',
      'Pericardial effusion without tamponade',
      'Elevated capture thresholds',
      'Device infection is very rare',
    ],
    postCare: [
      'Short bed rest and groin checks',
      'Urgent echo for hypotension or chest pain',
      'Device interrogation before discharge',
      'No pocket care or arm restrictions are needed',
      'Remote monitoring where the system supports it',
      'Document device type and plan for future retrieval or additional device',
    ],
    teaching: [
      'No leads and no pocket removes most pocket and lead complications',
      'The trade-offs are perforation risk and large-bore femoral access',
      'Septal deployment lowers perforation risk compared with the apex',
      'A leadless pacemaker is not an ICD or a CRT device',
      'Registries show fewer overall complications than transvenous single-chamber systems',
      'Retrievability declines as the device becomes encapsulated; some designs are built for retrieval',
    ],
    targetStructures: [
      'right-ventricle', 'interventricular-septum', 'tricuspid-valve', 'ivc', 'right-atrium', 'right-atrial-appendage',
    ],
    relatedConditions: [
      'atrial-fibrillation', 'third-degree-av-block', 'mobitz-type-ii', 'sinus-bradycardia', 'paced-rhythm',
    ],
  },

  'his-bundle-pacing': {
    id: 'his-bundle-pacing',
    name: 'Conduction System Pacing (His / LBBAP)',
    category: 'Electrophysiology & Devices',
    summary:
      'Conduction system pacing places the lead at the His bundle or the left bundle branch area so the ventricles activate through the heart\'s own wiring, giving a narrower, more physiologic QRS than RV pacing. It is used to prevent pacing-induced cardiomyopathy and as an alternative to biventricular CRT.',
    levelNotes: [
      'Paced rhythms from these devices can look almost normal (narrow QRS), so a narrow complex does not rule out a pacemaker.',
      'Conduction system paced ECGs may show a narrow or RBBB-like QRS after a small spike, so check for spikes and ask about devices.',
      'A sudden change to a wider, LBBB-like paced QRS can mean loss of conduction system capture or a lead problem, so arrange device interrogation.',
      'CSP is reasonable when substantial ventricular pacing is expected (especially with LVEF 36–50%) and as an alternative to BiV CRT when CS lead placement fails or in selected patients (2023 HRS/APHRS/LAHRS guideline).',
      'For LBBAP, screw the lead deep into the septum ~1–2 cm distal to the His toward the apex and confirm left bundle capture by paced RBBB morphology and a short, stable V6 R-wave peak time.',
    ],
    overview: [
      'His bundle pacing (HBP): lead at the His bundle; most physiologic and can correct some bundle branch block',
      'Left bundle branch area pacing (LBBAP): lead screwed through the RV septum to the left-sided conduction system',
      'LBBAP has lower, more stable thresholds and is easier to learn than HBP, so it is now more widely used',
      'Avoids the dyssynchrony of RV apical pacing and pacing-induced cardiomyopathy',
      'Alternative or adjunct to biventricular CRT',
      'Uses fixed-helix lumenless leads delivered through dedicated sheaths',
    ],
    indications: [
      'Bradycardia or AV block expected to need frequent ventricular pacing',
      'Reduced or mildly reduced LVEF with an expected high pacing burden',
      'Alternative to BiV CRT when CS lead fails or in selected LBBB/HF patients',
      'Pacing-induced cardiomyopathy (upgrade)',
      'AV node ablation ("pace and ablate") for refractory AF, preserving synchronous activation',
    ],
    contraindications: [
      'No absolute contraindication; limited mainly by anatomy and operator experience',
      'Infra-Hisian block may not be corrected by HBP; LBBAP or a backup RV lead is preferred',
      'Septal scar from prior MI (difficult LBB capture, perforation risk)',
      'Relative: prosthetic tricuspid valve or ring near the His region',
      'Same general contraindications as transvenous pacing (e.g., active infection)',
    ],
    anatomy: [
      'His bundle penetrates the central fibrous body near the membranous septum at the apex of the triangle of Koch',
      'Left bundle fans along the left septal surface into anterior and posterior fascicles',
      'LBBAP lead crosses the septum from the RV side toward the left subendocardium',
      'Right bundle runs down the right septal surface toward the moderator band',
      'The septal tricuspid leaflet lies close to the His region',
    ],
    accessSite:
      'Left or right infraclavicular approach via cephalic or axillary vein, as for conventional pacing, with a dedicated delivery sheath',
    steps: [
      {
        title: 'Access',
        description:
          'Standard cephalic or axillary venous access and placement of a dedicated delivery sheath toward the septum.',
      },
      {
        title: 'Map',
        description:
          'Use the lead tip as an electrode to find the His potential (HBP) or a septal site ~1–2 cm distal toward the apex (LBBAP), guided by paced V1 morphology.',
      },
      {
        title: 'Fixate for HBP',
        description:
          'Screw in at the His position and confirm selective or nonselective His capture with thresholds.',
      },
      {
        title: 'Advance for LBBAP',
        description:
          'Rotate the lead deep into the septum while monitoring paced QRS morphology, impedance and current of injury.',
      },
      {
        title: 'Confirm LBB capture',
        description:
          'Look for a paced RBBB pattern in V1, short stable V6 R-wave peak time across outputs, LBB potential and capture transitions.',
      },
      {
        title: 'Avoid perforation',
        description:
          'A sudden impedance drop or loss of current of injury suggests LV perforation; assess depth with contrast and reposition.',
      },
      {
        title: 'Test and secure',
        description:
          'Check sensing, capture threshold and impedance, leave appropriate slack and suture the sleeve.',
      },
      {
        title: 'Complete the system',
        description:
          'Add an atrial lead (± backup RV lead with HBP), connect the generator and close.',
      },
    ],
    ecg: [
      'Selective His capture: paced QRS identical to native, with an isoelectric gap after the spike',
      'Nonselective His capture: pseudo-delta wave and slightly wider QRS',
      'LBBAP: RBBB-like paced QRS (qR or rSR′ in V1) with a short V6 R-wave peak time',
      'Loss of conduction system capture → wider septal RV-paced QRS',
      'HBP can undersense small ventricular signals or oversense atrial signals',
      'Capture thresholds may rise over time, especially with HBP',
    ],
    equipment: [
      'Lumenless fixed-helix pacing lead',
      'Fixed-curve or deflectable delivery sheath',
      'EP recording system or pacing analyzer with live 12-lead ECG',
      'Pacemaker or CRT generator',
      'Contrast for septal angiography',
    ],
    complications: [
      'Septal perforation into the LV during LBBAP',
      'Lead dislodgement',
      'Rising thresholds and earlier battery depletion (mainly HBP)',
      'Septal artery injury or septal hematoma (rare)',
      'Tricuspid valve interference (HBP)',
      'Standard implant risks: pocket hematoma, pneumothorax, infection',
    ],
    postCare: [
      'Same as conventional pacemaker implantation: CXR, wound care, device check',
      '12-lead ECG documenting the conduction system capture pattern',
      'Close threshold follow-up, especially for HBP',
      'Echo follow-up of LV function in high-pacing-burden patients',
      'Remote monitoring',
    ],
    teaching: [
      'RV apical pacing causes LBBB-like dyssynchrony and pacing-induced cardiomyopathy in a minority (~10–20%)',
      'LBBAP produces a paced RBBB pattern because the right bundle activates late',
      'HBP can correct some proximal LBBB by recruiting fibers destined for the left bundle',
      'LBBAP thresholds are usually lower and more stable than His thresholds',
      'Randomized comparisons with BiV CRT are emerging; CSP is a guideline-supported alternative',
      'Always record a 12-lead ECG at implant to document the capture type',
    ],
    targetStructures: [
      'bundle-of-his', 'left-bundle-branch', 'left-anterior-fascicle', 'left-posterior-fascicle',
      'interventricular-septum', 'right-ventricle', 'av-node',
    ],
    relatedConditions: [
      'third-degree-av-block', 'mobitz-type-ii', 'left-bundle-branch-block', 'hfref', 'dilated-cardiomyopathy',
      'atrial-fibrillation', 'paced-rhythm',
    ],
  },

  'icd-implantation': {
    id: 'icd-implantation',
    name: 'ICD Implantation',
    category: 'Electrophysiology & Devices',
    summary:
      'An implantable cardioverter-defibrillator detects life-threatening ventricular arrhythmias and treats them with antitachycardia pacing or a shock. It is used for secondary prevention after cardiac arrest or sustained VT and for primary prevention in patients at high risk of sudden death.',
    levelNotes: [
      'In cardiac arrest with an ICD, start CPR and use the AED as usual; a shock from the ICD during compressions may be felt but is not dangerous to rescuers.',
      'A magnet over an ICD suspends shocks without affecting bradycardia pacing, so use it per protocol for inappropriate shocks while treating true VT/VF per ACLS.',
      'After any shock, get an ECG, electrolytes, troponin and device interrogation, and treat electrical storm (≥ 3 VT/VF episodes in 24 h) with sedation, beta-blockade, amiodarone and early EP input.',
      'Primary prevention: LVEF ≤ 35% with NYHA II–III on ≥ 3 months GDMT (≥ 40 days post-MI, ≥ 90 days post-revascularization) or ischemic LVEF ≤ 30% NYHA I, with life expectancy > 1 year.',
      'Choose transvenous versus subcutaneous ICD (S-ICD when no pacing need, poor venous access or high infection risk) and program high-rate, delayed detection to cut inappropriate shocks.',
    ],
    overview: [
      'Generator with high-voltage capacitor and a lead with shock coil(s), or a subcutaneous lead',
      'Detects VT/VF by rate and discriminators; treats with antitachycardia pacing (ATP) and/or shock',
      'Transvenous ICDs deliver up to ~35–40 J shocks and provide bradycardia pacing',
      'S-ICD: entirely subcutaneous parasternal lead; no intravascular hardware, no ATP, only brief post-shock pacing',
      'Reduces sudden cardiac death but does not treat the underlying heart failure',
      'A wearable defibrillator may bridge waiting periods in selected patients (evidence limited)',
    ],
    indications: [
      'Secondary prevention: survived VF or unstable VT arrest not due to a reversible cause',
      'Sustained VT with structural heart disease',
      'Primary prevention, ischemic: LVEF ≤ 35%, NYHA II–III, ≥ 40 days post-MI, on ≥ 3 months GDMT',
      'Primary prevention, nonischemic: LVEF ≤ 35%, NYHA II–III on ≥ 3 months GDMT (benefit less certain, DANISH)',
      'Ischemic LVEF ≤ 30% NYHA I; post-MI LVEF ≤ 40% with NSVT and inducible sustained VT',
      'High-risk inherited or infiltrative disease (e.g., HCM risk factors, ARVC, long QT or Brugada with arrest or arrhythmic syncope, cardiac sarcoidosis)',
    ],
    contraindications: [
      'Reversible cause of VT/VF (acute ischemia within 48 h of MI, severe electrolyte disturbance, drug toxicity)',
      'Primary prevention within 40 days of MI or 90 days of revascularization (reassess LVEF first)',
      'NYHA IV drug-refractory heart failure unless a candidate for CRT, LVAD or transplant',
      'Not expected to survive > 1 year with acceptable functional status',
      'Incessant VT or VF (control first)',
      'Active systemic infection',
    ],
    anatomy: [
      'Transvenous lead: shock coil in the RV (± SVC coil), tip on RV septum or apex',
      'Left pectoral generator places more LV mass in the RV coil-to-can shock vector',
      'Right-sided implants tend to have higher defibrillation thresholds',
      'S-ICD: generator in the left lateral chest (mid-axillary), lead parallel to the left sternal border',
      'Lead route as for pacemakers: cephalic/axillary vein → SVC → RA → RV',
    ],
    accessSite:
      'Transvenous: left infraclavicular cephalic or axillary vein; subcutaneous ICD: left lateral thoracic pocket with parasternal tunneled lead',
    steps: [
      {
        title: 'Evaluate',
        description:
          'Confirm indication, LVEF and GDMT duration with shared decision-making; perform S-ICD surface ECG screening if a subcutaneous system is considered.',
      },
      {
        title: 'Prepare',
        description:
          'Antibiotic prophylaxis, anticoagulation plan, chlorhexidine–alcohol prep, defibrillator pads and anesthesia support.',
      },
      {
        title: 'Lead placement (transvenous)',
        description:
          'Venous access and positioning of the defibrillator lead on the RV septum or apex; test sensing, threshold and impedance.',
      },
      {
        title: 'Lead placement (S-ICD)',
        description:
          'Tunnel the lead subcutaneously parallel to the sternum and create an intermuscular left lateral thoracic pocket.',
      },
      {
        title: 'Generator',
        description: 'Connect leads to the generator and place it in the pocket with careful hemostasis.',
      },
      {
        title: 'Defibrillation testing (selective)',
        description:
          'Induce VF to confirm sensing and successful shock when indicated; no longer routine for standard left-sided transvenous systems.',
      },
      {
        title: 'Program',
        description:
          'Set detection zones with ATP in VT zones, high-rate or delayed detection and SVT discriminators to reduce inappropriate shocks.',
      },
      {
        title: 'Close and check',
        description: 'Layered closure, CXR and device interrogation before discharge.',
      },
    ],
    ecg: [
      'ATP appears as a short burst of rapid pacing that may terminate VT',
      'Inappropriate shocks: rapid AF or sinus tachycardia, lead noise from fracture, T-wave oversensing',
      'S-ICD screening checks surface ECG vectors for appropriate R-to-T wave ratio',
      'A magnet suspends tachy therapies in most ICDs without changing bradycardia pacing',
      'For external defibrillation, place pads away from the generator (anterior–posterior) and interrogate afterwards',
    ],
    equipment: [
      'ICD generator with single- or dual-coil transvenous lead, or subcutaneous lead and tunneling tools',
      'Venous access tools and peel-away sheaths',
      'Device programmer and pacing analyzer',
      'External defibrillator with pads applied before the procedure',
      'Anesthesia/sedation and antibiotic prophylaxis',
    ],
    complications: [
      'Pocket hematoma, pneumothorax, lead dislodgement, perforation/tamponade, infection',
      'Inappropriate shocks (SVT, oversensing, lead fracture) that impair quality of life',
      'Phantom shocks, anxiety, depression and post-traumatic stress',
      'Lead failure (conductor fracture, insulation breach)',
      'Tricuspid regurgitation and venous occlusion with transvenous leads',
      'S-ICD: pocket erosion or infection, but no intravascular lead complications',
    ],
    postCare: [
      'CXR, wound care and arm-activity advice per protocol',
      'Device check before discharge and remote monitoring',
      'Driving restrictions: commonly ~1–2 weeks after primary prevention and ~3–6 months after secondary prevention or an appropriate shock (jurisdiction dependent)',
      'Shock plan: one shock and well → contact clinic; repeated shocks or unwell → call EMS',
      'Continue and optimize GDMT; the ICD does not replace medical therapy',
      'Psychosocial support and advance care planning, including shock deactivation at end of life',
    ],
    teaching: [
      'Primary prevention ICD: LVEF ≤ 35% NYHA II–III on ≥ 3 months GDMT, ≥ 40 days post-MI, survival expected > 1 year',
      'Reassess LVEF after GDMT optimization; many patients improve above 35%',
      'S-ICD suits younger patients without pacing needs, prior infection or limited venous access',
      'ATP painlessly terminates many monomorphic VTs and avoids shocks',
      'MADIT-RIT: high-rate or delayed detection programming reduced inappropriate therapy and mortality',
      'Deactivating shocks at end of life is ethically and legally permissible; pacing can continue',
    ],
    targetStructures: [
      'right-ventricle', 'apex', 'interventricular-septum', 'svc', 'right-atrium', 'tricuspid-valve', 'left-ventricle',
    ],
    relatedConditions: [
      'monomorphic-vt', 'ventricular-fibrillation', 'torsades-de-pointes', 'hfref', 'dilated-cardiomyopathy', 'hcm',
      'anterior-stemi',
    ],
  },

  'crt-implantation': {
    id: 'crt-implantation',
    name: 'Cardiac Resynchronization Therapy',
    category: 'Electrophysiology & Devices',
    summary:
      'Cardiac resynchronization therapy paces both ventricles (or the conduction system) to restore coordinated contraction in heart failure with a wide QRS, improving symptoms, LV function and survival. It is delivered as CRT-P (pacemaker) or CRT-D (with defibrillator).',
    levelNotes: [
      'CRT patients have advanced heart failure with fragile hemodynamics, so support breathing, check SpO2 and transport to the implanting or heart failure center when possible.',
      'CRT works only when the ventricles are paced nearly all the time, so rapid AF or frequent PVCs can cause loss of CRT and heart failure decompensation.',
      'Interrogate for percent BiV pacing (goal ≥ ~98%), because AF, PVCs or LV lead dislodgement reduce delivery and can explain decompensation.',
      'The strongest indication is LVEF ≤ 35%, sinus rhythm, LBBB with QRS ≥ 150 ms and NYHA II to ambulatory IV on GDMT (Class 1), with weaker benefit for non-LBBB or QRS 120–149 ms.',
      'Cannulate the coronary sinus, map branches by venography, target a lateral or posterolateral non-scarred late-activated site, avoid phrenic stimulation, and consider LBBAP when CS anatomy fails.',
    ],
    overview: [
      'Leads in the RA, RV and LV (via a coronary sinus branch to the lateral LV wall)',
      'Corrects electrical dyssynchrony from LBBB, where the lateral wall contracts late',
      'Benefits: reverse remodeling, higher LVEF, less MR, fewer HF hospitalizations, lower mortality (CARE-HF, COMPANION, MADIT-CRT)',
      'CRT-D adds a defibrillator; CRT-P may be chosen in older, nonischemic or comorbid patients',
      'Requires near-100% biventricular pacing to be effective',
      'About one-third of patients do not respond clinically or echocardiographically',
    ],
    indications: [
      'LVEF ≤ 35%, sinus rhythm, LBBB with QRS ≥ 150 ms, NYHA II to ambulatory IV on GDMT (Class 1)',
      'LVEF ≤ 35% with LBBB QRS 120–149 ms or non-LBBB QRS ≥ 150 ms (reasonable)',
      'LVEF ≤ 35% with AF when near-100% BiV pacing is achievable (e.g., with AV node ablation)',
      'Reduced LVEF (≤ ~50%) with AV block expected to need substantial ventricular pacing',
      'Pacing-induced cardiomyopathy (upgrade from RV pacing)',
    ],
    contraindications: [
      'Narrow QRS (< 130 ms) without a pacing indication; CRT may harm (EchoCRT)',
      'NYHA I with non-LBBB and QRS < 150 ms (no benefit)',
      'Life expectancy < 1 year from noncardiac causes',
      'Active infection',
      'Non-ambulatory NYHA IV unless bridging to advanced therapies',
      'Unsuitable CS anatomy is a technical limit (use conduction system pacing or a surgical epicardial lead)',
    ],
    anatomy: [
      'Coronary sinus ostium lies in the posterior RA, guarded by the Thebesian valve',
      'CS runs in the posterior AV groove; tributaries include middle cardiac, posterolateral, lateral (marginal) and great cardiac veins',
      'Ideal LV lead site: lateral or posterolateral, mid-to-basal, away from scar',
      'Apical LV lead positions are associated with worse outcomes',
      'The left phrenic nerve crosses the lateral LV, causing diaphragmatic stimulation',
      'The valve of Vieussens at the great cardiac vein–CS junction can impede advancement',
    ],
    accessSite:
      'Left infraclavicular cephalic and/or axillary vein (often two to three punctures); right side if needed',
    steps: [
      {
        title: 'Evaluate',
        description:
          'Confirm QRS morphology and duration, LVEF and NYHA class on GDMT; choose CRT-D or CRT-P.',
      },
      {
        title: 'Venous access',
        description: 'Obtain cephalic and/or axillary venous access for three leads.',
      },
      {
        title: 'RV and RA leads',
        description: 'Place the RV pacing or defibrillator lead and the RA lead (omit RA in permanent AF).',
      },
      {
        title: 'Cannulate the CS',
        description:
          'Use a shaped delivery sheath with a guidewire or EP catheter to engage the coronary sinus ostium.',
      },
      {
        title: 'Venography',
        description: 'Balloon-occlusion venogram to map the CS tributaries.',
      },
      {
        title: 'Deliver LV lead',
        description:
          'Advance the LV lead over a 0.014-inch wire into a lateral or posterolateral branch; quadripolar leads offer multiple vectors.',
      },
      {
        title: 'Test LV lead',
        description:
          'Check threshold, sensing and impedance, test high output for phrenic stimulation, and confirm the paced QRS.',
      },
      {
        title: 'Remove sheaths',
        description: 'Slit or peel the delivery sheath carefully to avoid LV lead dislodgement; connect the generator.',
      },
      {
        title: 'Program',
        description: 'Set AV and VV timing and confirm biventricular capture on a 12-lead ECG.',
      },
    ],
    ecg: [
      'Effective BiV pacing usually shows a dominant R wave in V1 and a negative (Q/QS) complex in lead I',
      'Loss of LV capture produces an RV-paced pattern (LBBB-like, QS in V1)',
      'Target ≥ ~98% BiV pacing; AF, PVCs and intrinsic conduction reduce it',
      'Paced QRS narrowing versus baseline suggests effective electrical resynchronization',
      'Phrenic stimulation and anodal capture vary with the programmed LV vector',
    ],
    equipment: [
      'CRT-P or CRT-D generator with RA, RV and quadripolar LV leads',
      'Coronary sinus delivery sheaths and subselector catheters',
      'Balloon-occlusion venography catheter and contrast',
      '0.014-inch guidewires for LV lead delivery',
      'Sheath slitters, pacing analyzer, programmer and fluoroscopy',
    ],
    complications: [
      'LV lead dislodgement (more frequent than RA/RV leads)',
      'Phrenic nerve stimulation',
      'Coronary sinus dissection or perforation (usually benign, rarely tamponade)',
      'Pneumothorax, pocket hematoma and infection (higher with more leads and longer procedures)',
      'Contrast-associated AKI',
      'Clinical nonresponse',
    ],
    postCare: [
      'CXR for lead positions and 12-lead ECG to confirm BiV capture',
      'Device check of percent BiV pacing and thresholds',
      'Continue and up-titrate GDMT',
      'Echo at ~3–6 months to assess response (LVEF, LV end-systolic volume)',
      'Address low BiV pacing: AF rate or rhythm control, AV node ablation, PVC suppression',
      'Remote monitoring and heart failure clinic follow-up',
    ],
    teaching: [
      'Benefit is greatest with LBBB, QRS ≥ 150 ms, female sex and nonischemic cardiomyopathy',
      'CRT harms patients with narrow QRS (< 130 ms); echo dyssynchrony alone is not an indication',
      'Response is often defined as ≥ 15% reduction in LV end-systolic volume or symptomatic improvement',
      'Aim for ~100% BiV pacing; small losses reduce benefit',
      'Conduction system pacing (LBBAP) is an emerging alternative or complement to BiV CRT',
      'DANISH questioned added ICD benefit in nonischemic cardiomyopathy, especially in older patients',
    ],
    targetStructures: [
      'coronary-sinus', 'left-ventricle', 'right-ventricle', 'right-atrium', 'interventricular-septum', 'left-bundle-branch',
    ],
    relatedConditions: [
      'hfref', 'left-bundle-branch-block', 'dilated-cardiomyopathy', 'mitral-regurgitation', 'atrial-fibrillation',
      'paced-rhythm',
    ],
  },

  'lead-extraction': {
    id: 'lead-extraction',
    name: 'Transvenous Lead Extraction',
    category: 'Electrophysiology & Devices',
    summary:
      'Transvenous lead extraction removes chronically implanted pacemaker or defibrillator leads from the veins and heart using locking stylets, powered sheaths and snares. It is essential for device infection and is performed with immediate surgical backup because of the rare but life-threatening risk of vascular tear.',
    levelNotes: [
      'A red, swollen or draining device pocket, or fever in a device patient, may mean device infection and needs hospital evaluation rather than home antibiotics alone.',
      'Bacteremia in a device patient may mean device endocarditis, and after extraction sudden hypotension suggests bleeding or tamponade needing rapid transport and resuscitation.',
      'For suspected CIED infection, take ≥ 2 sets of blood cultures before antibiotics, obtain TEE and involve the device team early, because confirmed infection requires complete system removal.',
      'Complete device and lead removal is Class I for definite CIED infection (pocket infection, CIED endocarditis or persistent bacteremia) and should not be delayed by prolonged antibiotic courses.',
      'Extract in a hybrid OR or equipped lab with cardiac surgery immediately available, an SVC occlusion balloon ready, arterial line and TEE, because SVC/brachiocephalic tear is the most feared complication.',
    ],
    overview: [
      'Extraction = removal of a lead implanted > 1 year or requiring tools beyond simple traction',
      'Leads become encased in fibrous tissue along veins, SVC, tricuspid valve and RV over time',
      'Tools: locking stylets, mechanical rotational sheaths, laser sheaths and femoral snares',
      'Complete removal is achieved in > 95% of cases at experienced centers',
      'Major complications ~1–2%; procedure-related death ~0.5% or less',
      'Superior vena cava tear is the most feared complication',
    ],
    indications: [
      'Definite CIED infection: pocket infection, lead or valve endocarditis, or bacteremia (especially S. aureus)',
      'Lead malfunction or recalled leads where abandonment is problematic',
      'Venous occlusion preventing needed new leads (e.g., upgrade)',
      'Lead-related thrombosis or SVC syndrome',
      'Severe lead-related tricuspid regurgitation or interference with valve function',
      'Chronic pain at the pocket or lead site not manageable otherwise',
    ],
    contraindications: [
      'No immediate cardiac surgical backup or experienced team (do not proceed)',
      'Patient unable or unwilling to undergo emergency surgery (relative; weigh risk)',
      'Very large lead vegetations (consider percutaneous aspiration or surgical removal)',
      'Lead in an abnormal position (e.g., arterial system or LV via PFO) may require surgical extraction',
      'Limited life expectancy where noninfectious extraction risks outweigh benefits',
    ],
    anatomy: [
      'Binding sites: venous entry, brachiocephalic vein, SVC–RA junction, tricuspid valve and RV myocardium',
      'SVC tear causes rapid bleeding into the pericardium, mediastinum or pleura',
      'ICD leads with coils (especially SVC coils) develop more fibrous adhesion',
      'Older leads (> ~10 years) and multiple leads increase difficulty',
      'Tricuspid valve leaflets can be torn during extraction',
      'Femoral approach (IVC → RA) is used to snare free-floating or broken leads',
    ],
    accessSite:
      'Superior approach through the existing device pocket and lead venous entry site; femoral vein for snaring and for SVC occlusion balloon wire; arterial line for monitoring',
    steps: [
      {
        title: 'Assess',
        description:
          'Review indication, lead age and type, CXR/CT, TEE for vegetations and blood cultures; risk-stratify and obtain informed consent.',
      },
      {
        title: 'Set up',
        description:
          'Hybrid OR with cardiac surgery on immediate standby, general anesthesia, arterial line, TEE and crossmatched blood.',
      },
      {
        title: 'Safety access',
        description:
          'Femoral venous access with a stiff wire into the SVC for rapid SVC occlusion balloon deployment; temporary pacing if pacemaker dependent.',
      },
      {
        title: 'Open the pocket',
        description:
          'Remove the generator, free leads from the capsule and send pocket tissue for culture.',
      },
      {
        title: 'Simple traction',
        description: 'Retract active-fixation helices and attempt gentle manual traction.',
      },
      {
        title: 'Lock and sheath',
        description:
          'Insert a locking stylet and advance mechanical or laser sheaths over the lead with countertraction to free binding sites.',
      },
      {
        title: 'Remove and inspect',
        description:
          'Withdraw the lead, inspect for completeness and snare retained fragments from the femoral route.',
      },
      {
        title: 'Monitor and rescue',
        description:
          'Watch arterial pressure and TEE continuously; sudden hypotension → inflate SVC occlusion balloon and proceed to sternotomy.',
      },
      {
        title: 'Plan reimplantation',
        description:
          'In infection, reimplant only after blood cultures are negative (commonly ≥ 72 h), often on the opposite side or with a leadless or subcutaneous device.',
      },
    ],
    ecg: [
      'Pacemaker-dependent patients need temporary pacing during extraction',
      'Ventricular ectopy with traction on RV leads',
      'Bradycardia or asystole when leads are removed in dependent patients',
      'Tamponade: falling voltage, electrical alternans and PEA',
      'Monitor afterwards for new AV block or arrhythmias',
    ],
    equipment: [
      'Locking stylets, compression coils and ligatures',
      'Mechanical rotational and/or excimer laser sheaths, outer telescoping sheaths',
      'Femoral snares and workstation',
      'Endovascular SVC occlusion balloon',
      'TEE, arterial line, rapid infuser and blood products',
      'Sternotomy tray and cardiopulmonary bypass available',
    ],
    complications: [
      'SVC or brachiocephalic vein tear with massive hemorrhage',
      'Cardiac avulsion or perforation causing tamponade',
      'Tricuspid valve injury and new regurgitation',
      'Pulmonary embolism of vegetation fragments',
      'Hemothorax or pneumothorax',
      'Retained lead fragments and death (rare)',
    ],
    postCare: [
      'ICU or step-down monitoring with hemoglobin, arterial pressure and echo for effusion',
      'CXR for hemothorax or pneumothorax',
      'Antibiotics per infectious disease guidance (duration depends on bacteremia and endocarditis)',
      'Reimplant after negative blood cultures, usually on the contralateral side',
      'Pocket wound care with drain management as needed',
      'Temporary pacing with telemetry in pacemaker-dependent patients',
    ],
    teaching: [
      'CIED infection requires complete hardware removal; antibiotics alone have high relapse and mortality',
      'Do not delay extraction for prolonged antibiotic courses; earlier extraction improves survival',
      'An inflated SVC occlusion balloon buys time to reach sternotomy after an SVC tear',
      'Immediately available cardiothoracic surgery is mandatory for transvenous extraction',
      'Lead dwell time, ICD coils and multiple leads increase major complication risk',
      'Abandoned leads accumulate future risk, so lead management decisions are long term',
    ],
    targetStructures: ['svc', 'right-atrium', 'tricuspid-valve', 'right-ventricle', 'coronary-sinus', 'ivc'],
    relatedConditions: ['paced-rhythm', 'cardiac-tamponade', 'third-degree-av-block'],
  },
};
