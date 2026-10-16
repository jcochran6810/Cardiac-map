import type { ProcedureContent } from '../../types/content';

/**
 * Procedure content, part B: structural heart, vascular & peripheral,
 * cardiac surgery, and emergency & bedside procedures.
 * Educational content only. Doses and energies are typical adult values;
 * always verify against local protocol and device manufacturer guidance.
 */
export const PROCEDURES_B: Record<string, ProcedureContent> = {
  // ─── Structural Heart ──────────────────────────────────────────────────────
  tavr: {
    id: 'tavr',
    name: 'Transcatheter Aortic Valve Replacement (TAVR)',
    category: 'Structural Heart',
    summary:
      'A catheter-delivered bioprosthetic valve is expanded inside the diseased native aortic valve, most often from the femoral artery, avoiding open-heart surgery. It is an established treatment for severe symptomatic aortic stenosis across surgical risk groups, with patient selection by a multidisciplinary heart team.',
    levelNotes: [
      'Fainting, a very slow pulse or new breathlessness after TAVR can mean delayed heart block — request ALS and transport promptly; hold firm pressure on any groin bleeding and report the new valve at handover',
      'Post-TAVR syncope may be high-grade AV block: get pads on, acquire a 12-lead (new LBBB, complete heart block) and treat symptomatic bradycardia with atropine, a chronotrope or TCP per protocol; check the access site and distal pulses',
      'Prepare the valve system, large-bore sheath, stiff pre-shaped LV wire, pigtail and pacing set-up; confirm rapid-pacing capture, record simultaneous LV–aortic gradients before and after deployment, and call out new AV block, hypotension or ST change immediately',
      'Complete pre-checks (consent, allergies, renal function, anticoagulants); give heparin and moderate sedation only on order with the practitioner present, monitoring ACT and capnography; afterwards watch for new heart block, access bleeding, tamponade and neuro deficits and escalate immediately',
      'Transfemoral TAVR is favoured > 80 y, SAVR generally < 65 y, with shared decision at 65–80 (2020 ACC/AHA); gated CT sizing, coronary heights and iliofemoral size predict annular rupture, coronary obstruction and PVL, and pre-existing RBBB plus deep implant predict PPM',
    ],
    overview: [
      'A balloon-expandable or self-expanding bioprosthesis is implanted within the calcified native valve, pushing the native leaflets aside',
      'Decision made by a multidisciplinary heart team of interventional cardiology and cardiac surgery',
      '2020 ACC/AHA VHD: transfemoral TAVR for age > 80 y or high/prohibitive risk; TAVR or SAVR by shared decision at 65–80 y',
      'Valve-in-valve TAVR treats a failed surgical bioprosthesis without redo sternotomy',
      'Most transfemoral cases use a minimalist approach with conscious sedation and next-day discharge',
    ],
    indications: [
      'Severe symptomatic AS (e.g. Vmax ≥ 4 m/s, mean gradient ≥ 40 mmHg, AVA ≤ 1.0 cm²)',
      'Severe AS with LVEF < 50% or other guideline triggers for intervention, when the heart team favours TAVR',
      'Low-flow, low-gradient severe AS confirmed by dobutamine stress echo or CT calcium score',
      'Failed surgical aortic bioprosthesis (valve-in-valve)',
      'High or prohibitive surgical risk, frailty, porcelain aorta or hostile chest',
    ],
    contraindications: [
      'Life expectancy < ~1 year or comorbidity making meaningful benefit unlikely (futility)',
      'Active infective endocarditis',
      'Left ventricular thrombus',
      'Annulus outside the size range of available valves or otherwise unsuitable anatomy',
      'Relative: bicuspid anatomy with unfavourable features, or concomitant CABG/valve surgery needs that favour SAVR',
      'Unsuitable iliofemoral arteries (consider transsubclavian/axillary, transcarotid or transcaval access)',
    ],
    anatomy: [
      'The aortic annulus is a virtual ring joining the basal hinge points of the three cusps',
      'Coronary ostia usually sit > ~10 mm above the annulus; lower heights with narrow sinuses raise obstruction risk',
      'The AV node and His bundle lie in the membranous septum beneath the non-coronary/right-coronary commissure',
      'Deep implantation compresses the left bundle branch in the LVOT, causing new LBBB or complete heart block',
      'Iliofemoral vessels must accommodate the delivery sheath (minimal lumen typically ≥ ~5–5.5 mm)',
    ],
    accessSite:
      'Transfemoral artery in > 90% of cases, plus a second arterial access (femoral or radial) for a pigtail and venous or LV-wire pacing; alternatives are transsubclavian/axillary, transcarotid, transcaval and, rarely, transapical or direct aortic',
    steps: [
      {
        title: 'Heart team and CT planning',
        description:
          'ECG-gated CT angiography measures annular area/perimeter, coronary heights, sinus dimensions, LVOT calcium and iliofemoral size',
      },
      {
        title: 'Access and pre-closure',
        description:
          'Ultrasound-guided common femoral puncture, pre-closure with suture-based devices, heparin, then large-bore sheath insertion',
      },
      {
        title: 'Pacing set-up',
        description: 'Temporary pacing via a transvenous RV lead or directly through the LV guidewire',
      },
      {
        title: 'Cross the valve',
        description:
          'Cross the stenotic valve retrograde with a straight wire, then exchange for a stiff pre-shaped wire curled in the LV apex',
      },
      {
        title: 'Optional predilation',
        description: 'Balloon valvuloplasty under rapid pacing for selected heavily calcified or very tight valves',
      },
      {
        title: 'Position and deploy',
        description:
          'Align with the annular plane; balloon-expandable valves deploy during rapid ventricular pacing (~180–200 bpm), self-expanding valves deploy gradually, often with moderate-rate pacing',
      },
      {
        title: 'Assess result',
        description:
          'Aortography, invasive gradients and echo assess paravalvular leak, gradient, valve position and coronary flow',
      },
      {
        title: 'Post-dilate if needed',
        description: 'Balloon post-dilation for significant PVL or underexpansion, balanced against annular rupture risk',
      },
      {
        title: 'Closure and pacing decision',
        description:
          'Close the femoral artery, confirm distal pulses, and keep or remove the temporary wire depending on conduction',
      },
    ],
    ecg: [
      'New LBBB is common (roughly 10–30%), more often with self-expanding valves and deeper implants',
      'Permanent pacemaker need ~5–20% depending on valve platform and implant depth',
      'Pre-existing RBBB is the strongest ECG predictor of complete heart block after TAVR',
      'Delayed high-grade AV block can appear after discharge; ambulatory monitoring is used for new or progressive conduction disease',
      'New-onset AF is common and adds to later stroke risk',
      'Rapid pacing causes deliberate transient hypotension; prolonged runs risk ischemia or VF',
    ],
    equipment: [
      'Balloon-expandable or self-expanding transcatheter valve and delivery system',
      'Large-bore femoral sheath (typically ~14–16 Fr)',
      'Suture-mediated or plug-based vascular closure devices',
      'Stiff pre-shaped LV guidewire and pigtail catheter',
      'Temporary pacing lead and external generator (or LV-wire pacing)',
      'Fluoroscopy and TTE/TEE; optional cerebral embolic protection device',
    ],
    complications: [
      'Conduction disturbance: new LBBB or high-grade AV block needing a permanent pacemaker',
      'Paravalvular leak — moderate or greater PVL is associated with higher mortality',
      'Stroke (~1–3% at 30 days) from embolised debris; new AF adds later risk',
      'Annular rupture — rare (< 1%) but often fatal; linked to oversizing and LVOT calcium',
      'Coronary obstruction (< 1%) — highest risk in valve-in-valve with low coronary height and narrow sinuses',
      'Vascular complications: dissection, perforation, bleeding, pseudoaneurysm, closure failure',
      'Tamponade, valve embolisation/malposition, AKI, and subclinical leaflet thrombosis',
    ],
    postCare: [
      'Telemetry with daily ECG; ambulatory monitoring if new LBBB or PR/QRS prolongation',
      'Access-site and distal pulse checks per protocol',
      'Neurological checks to detect stroke early',
      'Typically lifelong low-dose aspirin alone if no other indication; anticoagulant alone if AF requires it',
      'Echo at ~30 days for gradients and PVL, then periodic surveillance',
      'Endocarditis prophylaxis before dental procedures (prosthetic valve)',
    ],
    teaching: [
      'Rapid ventricular pacing transiently abolishes stroke volume so the valve does not move during deployment',
      'Valve-in-valve gradients are higher in small surgical valves (patient–prosthesis mismatch)',
      'Leaflet laceration (BASILICA) can prevent coronary obstruction in high-risk valve-in-valve cases',
      'Lifetime management matters in younger patients: future coronary access and TAV-in-TAV options',
      'New conduction disease is the most common reason for an unplanned pacemaker after TAVR',
    ],
    targetStructures: ['aortic-valve', 'ascending-aorta', 'left-ventricle', 'left-bundle-branch', 'bundle-of-his', 'av-node'],
    relatedConditions: ['aortic-stenosis', 'left-bundle-branch-block', 'third-degree-av-block', 'atrial-fibrillation'],
  },

  'mitraclip-teer': {
    id: 'mitraclip-teer',
    name: 'Mitral TEER (MitraClip / PASCAL)',
    category: 'Structural Heart',
    summary:
      'Transcatheter edge-to-edge repair grasps the anterior and posterior mitral leaflets with a clip delivered from the femoral vein across the interatrial septum, reducing mitral regurgitation. It treats primary MR in patients at high surgical risk and selected secondary MR despite optimal medical therapy.',
    levelNotes: [
      'New breathlessness, low blood pressure or groin swelling after TEER needs urgent transport: sit the patient up if breathing is hard and BP allows, give oxygen to target, press on any bleeding and request ALS',
      'TEER patients have advanced heart failure and often AF: treat pulmonary edema with CPAP and nitrates per protocol if BP allows, identify the rhythm, and suspect tamponade if hypotension and JVD follow a recent transseptal procedure',
      'Prepare the steerable guide, clip delivery system and transseptal needle; transduce and record LA pressure and v-waves before and after each clip, hand components only as the operator directs, and report hypotension or arrhythmia immediately',
      'Complete pre-checks and hand over to the anesthesia team, who manage general anesthesia; give heparin on order and report ACT (commonly ≥ 250 s); afterwards monitor for tamponade, femoral venous bleeding and worsening heart failure, and teach patients to report breathlessness',
      'Secondary MR benefits with a COAPT-like profile (optimised GDMT, LVEF 20–50%, LVESD ≤ 70 mm, PASP ≤ 70 mmHg); puncture inferior-posterior ~3.5–4.5 cm above the annulus, and accept a post-clip mean gradient ≤ ~5 mmHg to avoid iatrogenic MS',
    ],
    overview: [
      'Percutaneous adaptation of the surgical Alfieri edge-to-edge stitch',
      'Creates a double-orifice mitral valve, most often by clipping A2 to P2',
      'Performed under general anesthesia with 3D TEE and fluoroscopic guidance',
      'COAPT showed fewer HF hospitalisations and lower mortality in selected secondary MR; MITRA-FR did not, highlighting patient selection',
      'Distinguishing primary (leaflet) from secondary (ventricular or atrial) MR determines eligibility',
    ],
    indications: [
      'Severe symptomatic primary (degenerative) MR at high or prohibitive surgical risk with favourable anatomy',
      'Chronic severe secondary MR with persistent NYHA II–IV symptoms despite optimised GDMT (and CRT if indicated)',
      'Secondary MR meeting COAPT-type criteria: LVEF 20–50%, LVESD ≤ 70 mm, PASP ≤ 70 mmHg',
      'Heart team agreement that surgery is not the preferred option',
    ],
    contraindications: [
      'Small mitral valve area or baseline stenosis that a clip would worsen',
      'Rheumatic or heavily calcified leaflets in the grasping zone',
      'Unfavourable anatomy: short or restricted posterior leaflet, wide flail gap, large cleft',
      'LA/LAA thrombus or venous thrombus blocking access',
      'Active endocarditis',
      'End-stage LV or severe RV failure where MR correction is unlikely to help',
    ],
    anatomy: [
      'Anterior (A1–A3) and posterior (P1–P3) leaflet scallops; central A2–P2 is the usual target',
      'The fossa ovalis is the thin central part of the interatrial septum crossed to reach the left atrium',
      'An inferior-posterior puncture gives adequate height and a coaxial trajectory toward the mitral valve',
      'The aortic root lies anterior and superior to the fossa — avoid anterior punctures',
      'Chordae can entangle the device; subvalvular anatomy is assessed on TEE',
    ],
    accessSite:
      'Right femoral vein → IVC → right atrium → transseptal puncture → left atrium, using a large-bore (~22–24 Fr) steerable guide',
    steps: [
      {
        title: 'Anesthesia and TEE',
        description: 'Confirm MR mechanism, leaflet anatomy and baseline gradient; exclude LA/LAA thrombus',
      },
      {
        title: 'Venous access',
        description: 'Ultrasound-guided femoral venous access; heparin to target ACT (commonly ≥ 250 s)',
      },
      {
        title: 'Transseptal puncture',
        description: 'TEE-guided puncture of the inferior-posterior fossa ovalis at ~3.5–4.5 cm above the mitral annular plane',
      },
      {
        title: 'Guide and steer',
        description: 'Advance the steerable guide into the LA and steer the delivery system toward the mitral valve',
      },
      {
        title: 'Align and cross',
        description: 'Orient the open clip arms perpendicular to the coaptation line and advance into the LV',
      },
      {
        title: 'Grasp leaflets',
        description: 'Pull back to capture both leaflets, lower the grippers/clasps and close the device',
      },
      {
        title: 'Assess before release',
        description: 'Confirm adequate leaflet insertion, MR reduction and acceptable mean gradient before release',
      },
      {
        title: 'Additional devices',
        description: 'Place further clips for residual MR, balancing MR reduction against stenosis',
      },
      {
        title: 'Withdraw and close',
        description: 'Remove the system, close the vein (figure-of-eight suture or closure device) and assess the iatrogenic ASD',
      },
    ],
    ecg: [
      'AF is common in this population; continue rate control and anticoagulation per AF guidelines',
      'Atrial ectopy and transient atrial arrhythmias occur during transseptal and LA manipulation',
      'Hypotension under anesthesia can produce ischemic changes in severe cardiomyopathy',
      'Monitor for new AF after the procedure',
    ],
    equipment: [
      'Large-bore steerable guide catheter and clip delivery system',
      'Transseptal needle (mechanical or radiofrequency) and sheath',
      '3D TEE with real-time multiplanar imaging',
      'Fluoroscopy; heparin with ACT monitoring',
      'Venous closure suture or device',
    ],
    complications: [
      'Single-leaflet device attachment (SLDA) causing recurrent MR',
      'Leaflet tear or chordal entanglement',
      'Iatrogenic mitral stenosis',
      'Tamponade from transseptal puncture or LA perforation',
      'Persistent iatrogenic ASD (usually small)',
      'Femoral venous bleeding, stroke or air embolism; device embolisation is rare',
    ],
    postCare: [
      'TTE before discharge for residual MR, mean gradient, device position and effusion',
      'Antiplatelet therapy, or anticoagulation if AF; regimens are not standardised',
      'Continue and up-titrate GDMT for secondary MR',
      'Groin checks for venous hematoma',
      'Endocarditis prophylaxis (prosthetic material used for valve repair)',
    ],
    teaching: [
      'Primary and secondary MR have different evidence bases and indications',
      'COAPT vs MITRA-FR: benefit seen when MR is disproportionate to LV dilation and GDMT is optimised',
      'Transseptal height and position dictate whether the clip can reach and align with the valve',
      'A post-clip mean gradient > ~5 mmHg suggests iatrogenic stenosis',
      'TEER can be followed by surgery or other transcatheter options, but it may complicate them',
    ],
    targetStructures: ['mitral-valve', 'fossa-ovalis', 'interatrial-septum', 'left-atrium', 'chordae-tendineae'],
    relatedConditions: ['mitral-regurgitation', 'hfref', 'dilated-cardiomyopathy', 'atrial-fibrillation'],
  },

  'laa-occlusion': {
    id: 'laa-occlusion',
    name: 'Left Atrial Appendage Occlusion',
    category: 'Structural Heart',
    summary:
      'A self-expanding device placed through the femoral vein and a transseptal puncture seals the left atrial appendage, where most AF-related thrombi form. It is a stroke-prevention alternative for non-valvular AF patients who cannot safely take long-term anticoagulation.',
    levelNotes: [
      'LAAO patients have AF and often a past stroke or major bleed: screen for stroke, record time last known well, check glucose where protocols allow, and mention the device and any blood thinner at handover',
      'Patients may be on limited antithrombotic therapy, so any new deficit is still a stroke alert; identify AF and its rate on the monitor, and suspect tamponade with hypotension, tachycardia and JVD in the days after implant',
      'Prepare the transseptal kit, access sheath, pigtail, contrast and occluder; record LA pressure, keep the pericardiocentesis tray ready, and alert the operator to falling pressure or inferior ST elevation (possible air embolism)',
      'Verify consent, renal function and anticoagulant instructions; give heparin on order and track ACT (commonly ~250–350 s); post-implant monitor for tamponade, access bleeding and new neuro deficits, and teach the prescribed antithrombotic schedule and follow-up imaging',
      'Reasonable for non-valvular AF with high CHA₂DS₂-VASc when long-term OAC is contraindicated for a nonreversible reason (2023 ACC/AHA/ACCP/HRS); size from landing zone and depth on TEE/CT, confirm PASS-type release criteria, and re-image at ~45 days–1 year for DRT and leak',
    ],
    overview: [
      'About 90% of thrombi in non-valvular AF arise in the LAA',
      'Endocardial plug or plug-and-disc devices are implanted under TEE or intracardiac echo (ICE) and fluoroscopy',
      'Randomised trials (PROTECT AF, PREVAIL, PRAGUE-17) broadly support non-inferiority to warfarin or DOAC in selected patients (PREVAIL missed one efficacy endpoint)',
      '2023 ACC/AHA/ACCP/HRS AF guideline: reasonable when long-term OAC is contraindicated for a nonreversible reason',
      'Not a substitute for anticoagulation in patients who can safely take it',
    ],
    indications: [
      'Non-valvular AF with elevated stroke risk (CHA₂DS₂-VASc ≥ 2 in men, ≥ 3 in women)',
      'Contraindication to long-term OAC from a nonreversible cause (e.g. prior intracranial or recurrent major bleeding)',
      'High bleeding risk where shared decision-making favours LAAO',
      'Able to tolerate short-term post-implant antithrombotic therapy',
    ],
    contraindications: [
      'LA or LAA thrombus on pre-procedure imaging',
      'Valvular AF (moderate–severe rheumatic MS or mechanical valve) — warfarin is still required',
      'Another indication for long-term anticoagulation (e.g. recurrent VTE)',
      'LAA anatomy unsuitable for available devices',
      'Active infection',
      'Relative: prior septal closure device that blocks transseptal access',
    ],
    anatomy: [
      'The LAA is a trabeculated pouch from the LA anterolateral wall between the left superior pulmonary vein and mitral annulus',
      'The ridge between the LAA ostium and left superior pulmonary vein is a key imaging landmark',
      'The wall is thin with pectinate muscles — perforation risk with wire or sheath manipulation',
      'The left circumflex artery runs close to the LAA ostium',
      'Morphologies include chicken wing, windsock, cactus and cauliflower',
    ],
    accessSite:
      'Femoral vein → IVC → right atrium → inferior-posterior transseptal puncture → left atrium → LAA',
    steps: [
      {
        title: 'Pre-procedure imaging',
        description: 'TEE or cardiac CT excludes thrombus and measures LAA ostium, landing zone and usable depth',
      },
      {
        title: 'Anesthesia and access',
        description: 'General anesthesia with TEE or sedation with ICE; ultrasound-guided femoral venous access',
      },
      {
        title: 'Transseptal puncture',
        description: 'Inferior-posterior fossa puncture for coaxial LAA alignment; heparin to therapeutic ACT',
      },
      {
        title: 'Engage the appendage',
        description: 'Advance the access sheath over a pigtail into the LAA and perform angiography',
      },
      {
        title: 'Size the device',
        description: 'Choose a device oversized to the landing zone per manufacturer criteria',
      },
      {
        title: 'Deploy',
        description: 'Unsheath the device in the LAA neck under imaging',
      },
      {
        title: 'Confirm release criteria',
        description:
          'Check position, anchoring (tug test), compression and seal (e.g. PASS criteria, residual leak ≤ 5 mm) on TEE/ICE',
      },
      {
        title: 'Release and close',
        description: 'Release the device, withdraw the sheath, exclude pericardial effusion and secure venous hemostasis',
      },
    ],
    ecg: [
      'Patients are in AF or have paroxysmal AF; usual rate or rhythm control continues',
      'Atrial ectopy is common during LA manipulation',
      'LAAO does not treat the arrhythmia — AF management is unchanged',
      'Inferior ST elevation during the case can signal air embolism to the RCA',
    ],
    equipment: [
      'LAA occlusion device and delivery system',
      'Transseptal needle and access sheath (~12–14 Fr)',
      'TEE or ICE, fluoroscopy and contrast',
      'Pigtail catheter',
      'Pericardiocentesis kit immediately available',
    ],
    complications: [
      'Pericardial effusion or tamponade (~0.5–2%)',
      'Device embolisation (rare) — snare retrieval or surgery',
      'Device-related thrombus (DRT, ~2–4%) on the atrial surface, associated with stroke',
      'Peri-device leak — residual flow around the device; larger leaks linked to thromboembolism',
      'Procedural stroke from air or thrombus',
      'Vascular access complications and persistent iatrogenic ASD',
    ],
    postCare: [
      'TTE before discharge to exclude effusion and confirm device position',
      'Antithrombotic regimen is device- and patient-specific, e.g. ~45 days of OAC plus aspirin or DAPT, then DAPT to ~6 months, then long-term aspirin',
      'TEE or cardiac CT at ~45 days to ~1 year to check seal and device-related thrombus',
      'If DRT is found, resume or intensify anticoagulation and re-image',
      'Continue risk factor control and AF follow-up',
    ],
    teaching: [
      'LAAO prevents LAA-origin emboli but not strokes from other sources',
      'It is an alternative for patients who cannot take long-term OAC, not a first-line replacement',
      'Device-related thrombus and peri-device leak are the key follow-up imaging findings',
      'Surgical LAA occlusion during cardiac surgery also reduces stroke in AF (LAAOS III)',
      'Antithrombotic therapy is still needed for months while the device endothelialises',
    ],
    targetStructures: ['left-atrial-appendage', 'left-atrium', 'fossa-ovalis', 'interatrial-septum', 'lcx-proximal'],
    relatedConditions: ['atrial-fibrillation'],
  },

  'asd-closure': {
    id: 'asd-closure',
    name: 'Transcatheter ASD Closure',
    category: 'Structural Heart',
    summary:
      'A double-disc occluder delivered from the femoral vein seals a secundum atrial septal defect, stopping left-to-right shunting. It avoids open surgery for most secundum defects with adequate surrounding rims.',
    levelNotes: [
      'Sudden chest pain, fainting or collapse in someone with a septal closure device could be device erosion with tamponade — treat as time-critical, request ALS and transport urgently with early notification',
      'AF and flutter are common after closure — acquire a 12-lead and treat per tachycardia protocol; hypotension with JVD, tachycardia and chest pain suggests erosion with tamponade, so give fluid per protocol and pre-alert',
      'Draw serial oximetry samples (SVC, IVC, PA, systemic) and calculate Qp:Qs, record RA and PA pressures, and prepare the sizing balloon, delivery sheath and occluder; flush meticulously to avoid air and alert the operator to arrhythmia or ST change',
      'Check consent, allergies (including nickel), renal function and anticoagulants; give heparin and moderate sedation on order (practitioner present) with capnography; afterwards monitor rhythm, the venous site and tamponade signs, and teach antiplatelet adherence and 6-month endocarditis prophylaxis',
      'Close secundum ASDs with RA/RV enlargement and Qp:Qs ≥ 1.5 if PASP < 50% systemic and PVR < 1/3 systemic; assess all rims on TEE/ICE (deficient aortic rim acceptable, deficient IVC/posterior not), avoid oversizing to limit erosion, and consider test occlusion in older adults',
    ],
    overview: [
      'Only secundum ASDs are suitable; primum, sinus venosus and coronary sinus defects need surgery',
      'Self-centring double-disc nitinol occluders are delivered under TEE or ICE guidance',
      'High success rates with short hospital stays',
      'Earlier closure gives the best RV remodelling, but adults also benefit',
    ],
    indications: [
      'Secundum ASD with RA and/or RV enlargement',
      'Net left-to-right shunt with Qp:Qs ≥ 1.5',
      'PA systolic pressure < 50% systemic and PVR < 1/3 systemic',
      'Paradoxical embolism or platypnea-orthodeoxia (selected)',
    ],
    contraindications: [
      'Primum, sinus venosus or unroofed coronary sinus defects',
      'Severe irreversible pulmonary arterial hypertension (Eisenmenger physiology)',
      'Defect too large for devices or deficient rims other than the aortic rim',
      'Intracardiac thrombus or active infection',
      'Significant LV diastolic dysfunction unmasked by test balloon occlusion (relative)',
    ],
    anatomy: [
      'Secundum ASDs lie in the fossa ovalis region and make up ~70–75% of ASDs',
      'Rims assessed: aortic, SVC, posterior, IVC and AV valve; ≥ ~5 mm ideally',
      'A deficient aortic rim is acceptable for most devices but raises erosion concern with oversizing',
      'Chronic left-to-right shunt dilates the RA, RV and pulmonary arteries',
    ],
    accessSite: 'Femoral vein → IVC → right atrium → directly across the defect into the left atrium (no transseptal puncture)',
    steps: [
      {
        title: 'Imaging',
        description: 'TEE or ICE defines defect size, number of defects and rims; exclude anomalous pulmonary venous return',
      },
      {
        title: 'Access and hemodynamics',
        description: 'Femoral venous access, heparin, and right heart cath for PA pressure, PVR and oximetry Qp:Qs',
      },
      {
        title: 'Cross the defect',
        description: 'Pass a catheter and stiff wire across the ASD into the left upper pulmonary vein',
      },
      {
        title: 'Size',
        description: 'Measure the defect on echo, with optional stop-flow balloon sizing',
      },
      {
        title: 'Deploy LA disc',
        description: 'Advance the delivery sheath into the LA and open the left atrial disc',
      },
      {
        title: 'Deploy RA disc',
        description: 'Pull the LA disc against the septum and open the right atrial disc',
      },
      {
        title: 'Confirm and release',
        description: 'Check rim capture, stability (push-pull), residual shunt and AV valve function, then release',
      },
    ],
    ecg: [
      'Secundum ASD often shows incomplete RBBB with right axis deviation',
      'Atrial arrhythmias (AF, flutter, ectopy) may occur during and after closure',
      'AV block is uncommon but possible with large devices',
      'Arrhythmias that predate closure in older adults may persist',
    ],
    equipment: [
      'Double-disc septal occluder and delivery sheath',
      'Sizing balloon (optional)',
      'TEE or ICE and fluoroscopy',
      'Stiff exchange wire and multipurpose catheter',
      'Oximetry for shunt calculation',
    ],
    complications: [
      'Device embolisation',
      'Device erosion into the aorta or pericardium (~0.1–0.3%) causing late tamponade',
      'Atrial arrhythmias',
      'Device thrombus and stroke',
      'Residual shunt or AV valve interference',
      'Nickel hypersensitivity (rare)',
    ],
    postCare: [
      'Echo before discharge for position and effusion',
      'Aspirin for ~6 months (± clopidogrel for a shorter period) while the device endothelialises',
      'Endocarditis prophylaxis for 6 months after device placement',
      'Follow-up echo for RV remodelling, residual shunt and signs of erosion',
    ],
    teaching: [
      'Fixed split S2 and RV volume overload are classic ASD clues',
      'Sinus venosus ASD is associated with anomalous right upper pulmonary venous drainage — repaired surgically',
      'Test balloon occlusion in older adults can unmask LV diastolic dysfunction (rising LA pressure)',
      'Closing an ASD in Eisenmenger syndrome removes the pop-off and worsens RV failure',
    ],
    targetStructures: ['interatrial-septum', 'fossa-ovalis', 'right-atrium', 'left-atrium', 'right-ventricle'],
    relatedConditions: ['asd', 'atrial-fibrillation', 'atrial-flutter', 'right-bundle-branch-block'],
  },

  'pfo-closure': {
    id: 'pfo-closure',
    name: 'PFO Closure',
    category: 'Structural Heart',
    summary:
      'A double-disc device delivered from the femoral vein closes a patent foramen ovale to prevent paradoxical embolism. It lowers recurrent stroke risk in carefully selected younger patients whose stroke is probably PFO-related.',
    levelNotes: [
      'A young adult with sudden stroke symptoms may have a PFO-related stroke: do a stroke scale, check glucose where protocols allow, record time last known well and transport to a stroke centre with early notification',
      'Apply the stroke protocol regardless of age and report recent straining, long travel or leg swelling (possible DVT); after PFO closure, palpitations warrant a 12-lead — new AF or flutter is the most common early complication',
      'Prepare agitated saline for bubble studies, a multipurpose catheter, exchange wire and occluder; flush and de-air the delivery system meticulously because air crosses to the systemic side, record RA pressure and alert the operator to arrhythmia or ST change',
      'Confirm consent and that pre-procedure antiplatelet doses were given as ordered; give heparin and moderate sedation on order with the practitioner present and capnography; afterwards check the venous site and rhythm, and teach antiplatelet adherence and reporting palpitations or neuro symptoms',
      'Reasonable for ~18–60 y with non-lacunar cryptogenic embolic stroke and a high-risk PFO (atrial septal aneurysm or large shunt) after excluding AF and other mechanisms; RoPE and PASCAL estimate causality (CLOSE, RESPECT, REDUCE), and a ~6-month bubble study confirms closure',
    ],
    overview: [
      'A PFO is present in ~25% of adults and is usually incidental',
      'Closure is indicated only when the PFO is the probable stroke mechanism',
      'CLOSE, RESPECT and REDUCE showed fewer recurrent strokes than antiplatelet therapy alone in selected patients',
      'RoPE score estimates the probability that a PFO is causal',
      'PASCAL classification combines RoPE with high-risk PFO features to grade causality as unlikely, possible or probable',
    ],
    indications: [
      'Age ~18–60 y with non-lacunar, embolic-appearing ischemic stroke and no other cause after thorough evaluation',
      'High-risk PFO features: atrial septal aneurysm and/or large right-to-left shunt',
      'PASCAL probable (or possible, after shared decision-making) PFO-related stroke',
      'Selected non-stroke indications such as platypnea-orthodeoxia — individualised',
    ],
    contraindications: [
      'Alternative stroke mechanism (AF, large-artery atherosclerosis, small-vessel lacunar disease)',
      'PASCAL unlikely: low RoPE score without high-risk PFO features',
      'Intracardiac thrombus or active infection',
      'Separate indication for lifelong anticoagulation (benefit of closure uncertain)',
      'Contraindication to antiplatelet therapy',
    ],
    anatomy: [
      'A PFO is a flap-like channel between septum primum and septum secundum at the fossa ovalis',
      'It opens when RA pressure exceeds LA pressure (Valsalva, coughing, straining)',
      'Atrial septal aneurysm is a hypermobile septum with excursion ≥ ~10 mm',
      'A prominent Eustachian valve or Chiari network directs IVC flow toward the septum',
    ],
    accessSite: 'Femoral vein → IVC → right atrium → through the PFO tunnel into the left atrium',
    steps: [
      {
        title: 'Neurology–cardiology workup',
        description: 'Brain MRI, vascular imaging, prolonged rhythm monitoring for AF, bubble echo and thrombophilia review as indicated',
      },
      {
        title: 'Access',
        description: 'Femoral venous access and heparin, with ICE or TEE guidance',
      },
      {
        title: 'Cross the PFO',
        description: 'Cross the tunnel with a multipurpose catheter and wire into the left upper pulmonary vein',
      },
      {
        title: 'Select device',
        description: 'Choose device size from septal length and PFO anatomy',
      },
      {
        title: 'Deploy discs',
        description: 'Open the LA disc, pull it against the septum, then open the RA disc',
      },
      {
        title: 'Confirm',
        description: 'Check stable position with a push-pull test and colour Doppler or bubble study',
      },
      {
        title: 'Release and hemostasis',
        description: 'Release the device and secure venous hemostasis',
      },
    ],
    ecg: [
      'New AF or flutter after closure occurs in ~2–6%, usually transient and within the first ~45 days',
      'Prolonged rhythm monitoring before closure excludes occult AF as the stroke mechanism',
      'Atrial ectopy is common after implant',
    ],
    equipment: [
      'PFO occluder (double disc) and delivery sheath',
      'ICE or TEE and fluoroscopy',
      'Multipurpose catheter and exchange wire',
      'Agitated saline for bubble study',
    ],
    complications: [
      'Atrial fibrillation (most common)',
      'Device thrombus or embolisation',
      'Residual shunt',
      'Erosion (very rare with PFO devices)',
      'Vascular access complications',
      'Pericardial effusion (rare)',
    ],
    postCare: [
      'Antiplatelet therapy, often DAPT for 1–6 months then long-term single antiplatelet',
      'Endocarditis prophylaxis for 6 months after device placement',
      'Bubble echo at ~6 months to confirm closure',
      'Teach patients to report palpitations (possible AF)',
    ],
    teaching: [
      'Most PFOs are innocent bystanders; benefit concentrates in high-RoPE patients with high-risk anatomy',
      'RoPE points: younger age, no hypertension, no diabetes, no prior stroke/TIA, non-smoker, cortical infarct',
      'Paradoxical embolism: venous clot crosses to the systemic circulation when RA pressure exceeds LA pressure',
      'Exclude AF and other mechanisms before attributing a stroke to a PFO',
    ],
    targetStructures: ['fossa-ovalis', 'interatrial-septum', 'right-atrium', 'left-atrium'],
    relatedConditions: ['pfo', 'atrial-fibrillation'],
  },

  bav: {
    id: 'bav',
    name: 'Balloon Aortic Valvuloplasty',
    category: 'Structural Heart',
    summary:
      'A balloon inflated across a stenotic aortic valve fractures calcium and stretches the leaflets to temporarily enlarge the valve opening. Benefit in calcific stenosis is short-lived, so it is mainly a bridge to TAVR/SAVR or palliation.',
    levelNotes: [
      'Severe aortic stenosis can cause fainting with exertion: keep the patient at rest, lay them flat if hypotensive, give oxygen if hypoxic, consult medical direction before assisting with nitroglycerin, and transport',
      'Severe AS is preload-dependent — avoid nitrates and vasodilators and give small fluid boluses for hypotension per protocol; after BAV check the groin for bleeding and the ECG for new LBBB or AV block',
      'Prepare the valvuloplasty balloon (diluted contrast), stiff LV wire, pacing lead and large-bore sheath; confirm pacing capture, record simultaneous LV–aortic gradients before and after inflation, and call out sustained hypotension or VF after rapid pacing',
      'Patients are often frail or in shock: confirm consent and renal function, give heparin, vasopressors or inotropes on order, and after BAV monitor for access bleeding, acute AR (hypotension, pulmonary edema), stroke and conduction block, escalating immediately',
      'BAV is temporising — restenosis within ~6–12 months and no survival benefit alone — so use it to bridge unstable AS to TAVR/SAVR or as palliation; size the balloon at or slightly below the annulus, inflate under rapid pacing and reassess for severe AR',
    ],
    overview: [
      'Retrograde transfemoral balloon dilation of the aortic valve',
      'Modest increase in valve area with falling gradients that recur within months',
      'Rapid ventricular pacing stabilises the balloon during inflation',
      'Largely replaced by TAVR but still used as a bridge or diagnostic test',
    ],
    indications: [
      'Bridge to TAVR/SAVR in hemodynamically unstable severe AS',
      'Severe symptomatic AS needing urgent non-cardiac surgery (selected)',
      'Palliation when valve replacement is not an option',
      'Assessing response when the contribution of AS to symptoms is uncertain',
      'Congenital non-calcified AS in children and young adults (more durable results)',
    ],
    contraindications: [
      'Moderate or severe aortic regurgitation',
      'Unsuitable femoral or iliac access',
      'LV thrombus or active endocarditis',
      'Patient able to proceed directly to definitive valve replacement',
    ],
    anatomy: [
      'Calcified trileaflet aortic valve; fracturing nodular calcium improves leaflet mobility',
      'Annular dimensions on echo or CT guide balloon size',
      'Coronary ostia and conduction tissue lie close to the annulus',
    ],
    accessSite: 'Retrograde transfemoral arterial access with a large-bore sheath; femoral venous access for a pacing wire',
    steps: [
      {
        title: 'Access',
        description: 'Ultrasound-guided femoral arterial access with pre-closure; venous access for temporary pacing',
      },
      {
        title: 'Baseline hemodynamics',
        description: 'Simultaneous LV and aortic pressures to measure the transvalvular gradient',
      },
      {
        title: 'Cross the valve',
        description: 'Cross with a straight wire, then exchange for a stiff pre-shaped wire in the LV',
      },
      {
        title: 'Position balloon',
        description: 'Centre the balloon across the annulus under fluoroscopy',
      },
      {
        title: 'Rapid pacing and inflation',
        description: 'Pace rapidly until systolic pressure falls, inflate and deflate quickly, then stop pacing',
      },
      {
        title: 'Reassess',
        description: 'Repeat gradient and check for AR; repeat or upsize if needed',
      },
      {
        title: 'Closure',
        description: 'Remove the sheath and close the arterial access',
      },
    ],
    ecg: [
      'Baseline LVH with repolarisation (strain) changes is common in severe AS',
      'Rapid pacing causes deliberate transient hypotension; prolonged hypotension risks ischemia and VF',
      'Transient LBBB or AV block can occur',
    ],
    equipment: [
      'Valvuloplasty balloon sized to the annulus',
      'Large-bore arterial sheath and closure device',
      'Temporary pacing lead and generator',
      'Stiff LV wire and pigtail catheters for pressure measurement',
    ],
    complications: [
      'Access-site bleeding and vascular injury (most common)',
      'Severe acute aortic regurgitation',
      'Stroke',
      'Annular rupture or LV perforation with tamponade',
      'Conduction block and arrhythmias',
      'Substantial mortality in patients treated while in shock',
    ],
    postCare: [
      'Access-site and limb checks',
      'Telemetry for conduction disturbance',
      'Echo for gradient and AR',
      'Plan definitive TAVR or SAVR — restenosis is expected',
    ],
    teaching: [
      'BAV is temporising in calcific AS',
      'Low-flow states can mask AS severity (low-flow, low-gradient AS)',
      'In AS with shock, BAV plus inotropes or mechanical support may stabilise the patient',
      'Younger patients with congenital AS get more durable results',
    ],
    targetStructures: ['aortic-valve', 'left-ventricle', 'ascending-aorta'],
    relatedConditions: ['aortic-stenosis', 'cardiogenic-shock'],
  },

  bmv: {
    id: 'bmv',
    name: 'Balloon Mitral Valvuloplasty (PMBC)',
    category: 'Structural Heart',
    summary:
      'A balloon passed across the atrial septum is inflated in the stenotic mitral valve to split fused commissures. Percutaneous mitral balloon commissurotomy is first-line treatment for symptomatic severe rheumatic mitral stenosis with favourable valve anatomy.',
    levelNotes: [
      'Mitral stenosis patients often have AF and pulmonary edema, and pregnancy can unmask it: sit them up, give oxygen to target, monitor closely and transport promptly',
      'In MS a fast rate shortens diastolic filling and raises LA pressure — identify the rhythm, treat rapid AF per protocol (rate control helps more than inotropes) and use CPAP for pulmonary edema if BP allows',
      'Set up transducers for simultaneous LA (or PCWP) and LV pressures, record the mean transmitral gradient and calculate MVA before and after each inflation, prepare the Inoue balloon at the size the operator chooses, and report falling BP or rising v-waves',
      'Verify the pre-procedure TEE and anticoagulation status (and the obstetric plan if pregnant); give heparin and moderate sedation on order (practitioner present), then monitor for tamponade, acute MR (pulmonary edema, hypotension) and neuro deficits, escalating immediately',
      'Recommended for symptomatic severe rheumatic MS (MVA ≤ 1.5 cm²) with favourable morphology, no LA thrombus and < moderate MR; Wilkins ≤ 8 without commissural calcium predicts success — inflate stepwise from below reference size and stop if MR rises ≥ 1 grade',
    ],
    overview: [
      'Percutaneous mitral balloon commissurotomy, usually with the Inoue balloon',
      'Splits the commissural fusion typical of rheumatic MS',
      'Results comparable to surgical commissurotomy in suitable valves',
      'Pre-procedure TEE is mandatory to exclude LA/LAA thrombus',
    ],
    indications: [
      'Symptomatic severe rheumatic MS (MVA ≤ 1.5 cm²) with favourable anatomy and less than moderate MR',
      'Asymptomatic severe MS with PASP > 50 mmHg and favourable anatomy (reasonable)',
      'Severe MS in pregnancy with persistent symptoms despite medical therapy',
      'Selected patients with less favourable anatomy who are high surgical risk',
    ],
    contraindications: [
      'Left atrial or LAA thrombus',
      'Moderate or greater mitral regurgitation',
      'Severe or bicommissural calcification',
      'High Wilkins score with severe subvalvular disease (relative)',
      'Concomitant severe aortic or tricuspid disease or CAD needing surgery',
    ],
    anatomy: [
      'Rheumatic MS: commissural fusion, leaflet thickening and chordal shortening give a fish-mouth orifice',
      'Normal MVA is 4–6 cm²; severe MS is ≤ 1.5 cm²',
      'The LA enlarges and the LAA is the usual thrombus site',
      'Route: fossa ovalis → LA → antegrade across the mitral valve into the LV',
    ],
    accessSite: 'Femoral vein → IVC → right atrium → transseptal puncture → left atrium → antegrade across the mitral valve',
    steps: [
      {
        title: 'TEE assessment',
        description: 'Exclude LA/LAA thrombus, grade MR, and score valve morphology (Wilkins) and commissural calcium',
      },
      {
        title: 'Baseline hemodynamics',
        description: 'Measure LA (or PCWP) and LV pressures for the transmitral gradient, plus PA pressure',
      },
      {
        title: 'Transseptal puncture',
        description: 'Fossa ovalis puncture under fluoroscopy and echo; heparin after septal crossing',
      },
      {
        title: 'Septal dilation',
        description: 'Dilate the septum to allow passage of the balloon',
      },
      {
        title: 'Cross the mitral valve',
        description: 'Steer the balloon into the LV with a stylet, avoiding entanglement in the chordae',
      },
      {
        title: 'Stepwise inflation',
        description: 'Inflate the distal portion, pull back to the valve, then fully inflate, starting below reference size',
      },
      {
        title: 'Reassess after each inflation',
        description: 'Measure gradient, MVA and MR; stop if MR worsens by ≥ 1 grade or the result is adequate',
      },
      {
        title: 'Final check',
        description: 'Final hemodynamics, exclude effusion and assess the iatrogenic ASD before removing sheaths',
      },
    ],
    ecg: [
      'AF is common in MS; continue rate control and anticoagulation (warfarin for rheumatic MS with AF)',
      'Baseline ECG may show LA enlargement (broad notched P in II) and RV hypertrophy with right axis deviation',
      'Atrial arrhythmias may occur during transseptal manipulation',
    ],
    equipment: [
      'Inoue balloon catheter (or double-balloon technique)',
      'Transseptal needle, sheath and septal dilator',
      'TEE/TTE or ICE and fluoroscopy',
      'Pressure transducers for simultaneous LA and LV pressures',
    ],
    complications: [
      'Severe mitral regurgitation from leaflet tear (~2–10%)',
      'Tamponade from transseptal or LV perforation',
      'Systemic embolism and stroke',
      'Residual iatrogenic ASD',
      'Restenosis over years',
    ],
    postCare: [
      'Echo within ~24–72 h for MVA, MR and pericardial effusion',
      'Continue anticoagulation if AF or prior embolism',
      'Secondary prevention of rheumatic fever with penicillin prophylaxis as indicated',
      'Clinical and echo follow-up for restenosis',
    ],
    teaching: [
      'Wilkins score grades mobility, thickening, calcification and subvalvular disease 1–4 each (total 4–16)',
      'Pressure half-time is unreliable for ~72 h after PMBC — use planimetry or repeat later',
      'Inoue reference balloon size ≈ height (cm) / 10 + 10, in mm',
      'Slowing the heart rate prolongs diastole and lowers LA pressure in MS',
    ],
    targetStructures: ['mitral-valve', 'left-atrium', 'left-atrial-appendage', 'fossa-ovalis', 'interatrial-septum'],
    relatedConditions: ['mitral-stenosis', 'atrial-fibrillation', 'mitral-regurgitation'],
  },

  'alcohol-septal-ablation': {
    id: 'alcohol-septal-ablation',
    name: 'Alcohol Septal Ablation',
    category: 'Structural Heart',
    summary:
      'Dehydrated alcohol injected into a septal perforator artery creates a controlled infarct of the thickened basal septum, relieving left ventricular outflow tract obstruction in obstructive hypertrophic cardiomyopathy. It is a catheter-based alternative to surgical myectomy for patients with symptoms despite medical therapy.',
    levelNotes: [
      'HCM patients can faint with exertion — keep them lying down and still, and consult medical direction before assisting with nitroglycerin; fainting or a slow pulse in the days after ablation may be heart block, so request ALS',
      'In obstructive HCM avoid nitrates and give fluid for hypotension; after ASA watch for RBBB progressing to complete heart block or VT and be ready for TCP, cardioversion or defibrillation per protocol',
      'Prepare the coronary guide, short OTW balloon, echo contrast and temporary pacing set-up, with dehydrated ethanol drawn up and labelled only on the physician’s order; record rest and post-PVC LV–aortic gradients and alert the operator to heart block or ST change',
      'Expect chest pain from the intended septal infarct — give analgesia and heparin on order; monitor continuously for complete heart block (temporary pacing ready), VT and hypotension for several days, trend ECGs and troponin as ordered, and escalate rhythm changes',
      'For obstructive HCM with LVOT gradient ≥ 50 mmHg and symptoms despite GDMT (including myosin inhibitors), choose ASA vs myectomy at an experienced centre (2024 AHA/ACC); confirm the perforator territory on myocardial contrast echo and seal it with an OTW balloon to prevent LAD reflux',
    ],
    overview: [
      'Percutaneous septal reduction therapy for obstructive HCM',
      'The infarcted basal septum thins over weeks to months, widening the LVOT',
      'Gradient falls acutely (stunning), may partly recur, then falls further with remodelling',
      '2024 AHA/ACC HCM guideline: perform at experienced centres; myectomy favoured when other surgical problems coexist',
    ],
    indications: [
      'Obstructive HCM with resting or provoked LVOT gradient ≥ 50 mmHg',
      'NYHA III–IV symptoms or exertional syncope despite maximal medical therapy',
      'Suitable septal perforator anatomy',
      'Older age, high surgical risk or preference for a percutaneous approach after shared decision-making',
    ],
    contraindications: [
      'Thin septum (< ~15 mm) because of VSD risk; very thick septum (> ~30 mm) responds less well',
      'Disease needing surgery anyway (multivessel CAD, intrinsic mitral or papillary muscle abnormality)',
      'No suitable perforator, or contrast echo shows the perforator supplies a remote territory',
      'Children and young adults (myectomy preferred)',
      'Non-obstructive HCM',
    ],
    anatomy: [
      'Basal septal hypertrophy plus systolic anterior motion (SAM) of the mitral valve causes dynamic LVOT obstruction',
      'Septal perforators arise from the LAD; the first major branch usually supplies the basal septum',
      'The right bundle branch runs in the septum and is frequently injured',
      'Contrast echo confirms the perforator does not supply papillary muscles or the RV free wall',
    ],
    accessSite:
      'Femoral or radial artery for the coronary guide plus an LV pigtail for gradients; femoral or jugular vein for a temporary pacing wire',
    steps: [
      {
        title: 'Baseline set-up',
        description: 'Place a temporary pacing wire; measure LV–aortic gradient at rest and with provocation (post-PVC beat, Valsalva)',
      },
      {
        title: 'Coronary angiography',
        description: 'Identify septal perforators from the LAD',
      },
      {
        title: 'Wire and balloon',
        description: 'Wire the target septal branch and inflate a short over-the-wire balloon in its proximal segment',
      },
      {
        title: 'Confirm seal',
        description: 'Inject contrast through the balloon lumen to confirm no reflux into the LAD',
      },
      {
        title: 'Myocardial contrast echo',
        description: 'Inject echo contrast to confirm opacification of the SAM–septal contact area only',
      },
      {
        title: 'Alcohol injection',
        description: 'Slowly inject a small volume (~1–3 mL) of dehydrated alcohol, keeping the balloon inflated for several minutes',
      },
      {
        title: 'Reassess gradient',
        description: 'Measure the LVOT gradient; consider an additional perforator if relief is inadequate',
      },
      {
        title: 'Finish',
        description: 'Deflate and remove the balloon, confirm LAD patency, and leave the pacing wire in place',
      },
    ],
    ecg: [
      'RBBB develops in roughly half of patients',
      'Transient complete heart block is common; permanent pacemaker needed in ~10–15%',
      'Pre-existing LBBB makes complete heart block very likely if RBBB develops',
      'Anteroseptal ST elevation/Q waves reflect the intended infarct; troponin and CK rise is expected',
      'Ventricular arrhythmias may arise from the septal scar — monitor for several days',
    ],
    equipment: [
      'Coronary guide catheter and coronary wire',
      'Short over-the-wire balloon',
      'Dehydrated (absolute) ethanol',
      'Echo contrast agent and TTE',
      'Temporary pacing lead and pigtail catheter',
    ],
    complications: [
      'Complete heart block needing a permanent pacemaker (~10–15%)',
      'Alcohol spill into the LAD causing a large anterior MI',
      'Ventricular arrhythmias',
      'Coronary dissection',
      'Ventricular septal defect (rare)',
      'Tamponade from the temporary pacing wire',
    ],
    postCare: [
      'ICU or telemetry for ~3–5 days with temporary pacing available',
      'Serial ECGs and cardiac biomarkers',
      'Echo for LVOT gradient; improvement continues over ~3–6 months',
      'Reassess sudden cardiac death risk and ICD indication',
      'Continue beta-blocker or non-dihydropyridine CCB as needed',
    ],
    teaching: [
      'Brockenbrough sign: after a PVC the LVOT gradient rises but aortic pulse pressure falls in obstructive HCM',
      'Low preload, inotropes and vasodilators all worsen dynamic LVOT obstruction',
      'Surgical myectomy remains the reference treatment in experienced centres; ASA avoids sternotomy',
      'Cardiac myosin inhibitors now offer a medical option before septal reduction',
    ],
    targetStructures: ['interventricular-septum', 'septal-perforators', 'lad-proximal', 'right-bundle-branch', 'mitral-valve'],
    relatedConditions: ['hcm', 'third-degree-av-block', 'right-bundle-branch-block'],
  },

  'paravalvular-leak-closure': {
    id: 'paravalvular-leak-closure',
    name: 'Paravalvular Leak Closure',
    category: 'Structural Heart',
    summary:
      'Occluder devices delivered by catheter plug a channel between a prosthetic valve sewing ring and the surrounding native tissue. It treats heart failure or hemolysis from paravalvular regurgitation without redo surgery.',
    levelNotes: [
      'A prosthetic valve patient with dark urine, yellowing skin, unusual fatigue or new breathlessness may have a leaking valve: assess, give oxygen to target, note any blood thinner and transport for evaluation',
      'New heart failure in a prosthetic valve patient needs hospital assessment: treat pulmonary edema per protocol, consider endocarditis if febrile, identify AF on the monitor and note warfarin use for bleeding risk',
      'Prepare steerable sheaths, hydrophilic wires, snares, several plug sizes and an AV-rail set-up if planned; record gradients across the prosthesis before and after each plug and alert the operator to a rising gradient, arrhythmia or hypotension',
      'Check hemoglobin, LDH, INR and the anticoagulation plan before the case; give heparin on order and track ACT; afterwards trend hemolysis labs, watch for tamponade, stroke and bleeding, and restart anticoagulation for mechanical valves promptly as ordered',
      'Transcatheter closure is reasonable for PVL with intractable hemolysis or NYHA III–IV HF at high surgical risk with suitable anatomy at an expert centre (2020 ACC/AHA, 2a); exclude endocarditis, localise on a 3D TEE/CT clock face and size plugs to avoid leaflet impingement',
    ],
    overview: [
      'Paravalvular leak is commoner with mitral and mechanical prostheses and also occurs after TAVR',
      'Defects are often crescentic — several devices may be needed',
      'Mitral PVL is approached transseptally or transapically; aortic PVL usually retrograde',
      'Technically demanding; done in experienced structural centres with imaging support',
    ],
    indications: [
      'Moderate–severe PVL causing NYHA III–IV heart failure',
      'Hemolytic anemia needing transfusion',
      'High or prohibitive risk for redo surgery',
      'Anatomically suitable defect without large sewing-ring dehiscence',
    ],
    contraindications: [
      'Active endocarditis',
      'Rocking or unstable prosthesis from large dehiscence',
      'Intracardiac thrombus',
      'Prosthetic valve dysfunction that requires replacement anyway',
      'Defect shape or size where devices would impinge on leaflets',
    ],
    anatomy: [
      'The leak lies outside the sewing ring, between ring and native annulus',
      'Location is reported on a clock face seen from the surgical (atrial or aortic) view',
      'Mechanical leaflets can be trapped by oversized devices',
      'Prosthesis shadowing makes mitral PVL hard to see on TTE — TEE is needed',
    ],
    accessSite:
      'Mitral PVL: femoral vein with transseptal puncture (antegrade) or transapical; aortic PVL: retrograde femoral or radial artery; an arteriovenous rail can add support',
    steps: [
      {
        title: 'Imaging',
        description: '3D TEE and/or CT define location, size, shape and number of defects',
      },
      {
        title: 'Access',
        description: 'Choose antegrade, retrograde or transapical access; anticoagulate with heparin',
      },
      {
        title: 'Cross the defect',
        description: 'Steerable catheter and hydrophilic wire passed through the leak',
      },
      {
        title: 'Build support',
        description: 'Exchange for a stiffer wire or create an arteriovenous rail if needed',
      },
      {
        title: 'Size and deploy',
        description: 'Deploy one or more sized plugs, often sequentially with an anchor wire',
      },
      {
        title: 'Check function',
        description: 'Confirm leak reduction and free prosthetic leaflet motion before release',
      },
      {
        title: 'Close access',
        description: 'Close vascular or apical access with careful hemostasis',
      },
    ],
    ecg: [
      'Atrial arrhythmias are common in mitral prosthesis patients',
      'Ventricular ectopy occurs with wire and catheter manipulation',
      'Conduction disturbance is uncommon but possible with devices near the aortic annulus',
    ],
    equipment: [
      'Vascular plugs or occluder devices (often used off-label)',
      'Steerable sheaths, hydrophilic wires and snares',
      '3D TEE; CT for planning',
      'Apical closure device if transapical',
    ],
    complications: [
      'Leaflet impingement causing prosthetic valve dysfunction',
      'Device embolisation',
      'Worsened hemolysis from small high-velocity residual jets',
      'Tamponade and stroke',
      'Vascular or apical access bleeding',
    ],
    postCare: [
      'Echo for residual leak, gradients and leaflet motion',
      'Track hemoglobin, LDH and haptoglobin for hemolysis',
      'Resume anticoagulation promptly for mechanical valves',
      'Endocarditis prophylaxis (prosthetic valve)',
    ],
    teaching: [
      'Hemolysis can worsen if a large leak becomes a small high-velocity residual jet',
      'Reducing the leak by even one grade often improves symptoms',
      'PVL can be the first sign of prosthetic valve endocarditis — always exclude infection',
      'Accurate localisation is the key determinant of procedural success',
    ],
    targetStructures: ['mitral-valve', 'aortic-valve', 'left-atrium', 'interatrial-septum'],
    relatedConditions: ['mitral-regurgitation', 'aortic-stenosis', 'hfref'],
  },

  // ─── Vascular & Peripheral ─────────────────────────────────────────────────
  'peripheral-angiography': {
    id: 'peripheral-angiography',
    name: 'Peripheral Angiography',
    category: 'Vascular & Peripheral',
    summary:
      'Contrast angiography of the aorta and limb arteries maps the location and severity of peripheral artery disease. It is used mainly to plan revascularisation after non-invasive testing.',
    levelNotes: [
      'A cold, pale, pulseless, painful limb is acute limb ischemia — a time-critical emergency; for bleeding after a groin or wrist puncture hold firm direct pressure just above the skin puncture, and transport rapidly to a vascular-capable centre',
      'Document the 6 Ps plus distal pulses, colour, sensation and movement; hypotension with back or flank pain after femoral access suggests retroperitoneal bleeding — IV access, fluids per protocol and early notification',
      'Prepare the micropuncture kit, sheaths, pigtail and selective catheters and the DSA runoff set-up (or CO₂ system in CKD); program the power injector as directed, coach breath-holds for subtraction runs and apply ALARA with collimation and shielding',
      'Check allergies, renal function, metformin and antithrombotic instructions and baseline distal pulses; after the case perform access-site, pulse and neurovascular checks per protocol, encourage hydration as ordered, and escalate hematoma, back pain with hypotension or a cold limb',
      'ABI and duplex, CTA or MRA come first; invasive angiography plans revascularisation of refractory claudication, CLTI or ALI — choose contralateral up-and-over, antegrade, radial or pedal access by lesion, use CO₂ in CKD and image runoff to the foot',
    ],
    overview: [
      'Invasive imaging of the aorta, iliac, femoropopliteal and infrapopliteal arteries',
      'Digital subtraction angiography (DSA) improves vessel visualisation',
      'Often combined with endovascular treatment in the same session',
      'CTA, MRA and duplex often suffice for diagnosis',
    ],
    indications: [
      'Chronic limb-threatening ischemia (rest pain, ulcers, gangrene)',
      'Lifestyle-limiting claudication despite exercise and medical therapy, when revascularisation is planned',
      'Acute limb ischemia with planned endovascular treatment',
      'Inconclusive non-invasive imaging',
      'Selected renal or mesenteric artery evaluation',
    ],
    contraindications: [
      'Prior severe contrast reaction (relative — premedicate or use CO₂)',
      'Advanced CKD (relative — minimise iodinated contrast)',
      'Uncorrected coagulopathy',
      'Inability to lie flat or cooperate',
    ],
    anatomy: [
      'The abdominal aorta bifurcates at ~L4 into the common iliac arteries',
      'The external iliac becomes the common femoral artery below the inguinal ligament',
      'The CFA divides into the superficial femoral and profunda femoris arteries',
      'Popliteal artery → anterior tibial and tibioperoneal trunk → posterior tibial and peroneal arteries',
      'CFA puncture over the femoral head avoids high (retroperitoneal) and low (bifurcation) sticks',
    ],
    accessSite:
      'Common femoral artery (retrograde with contralateral up-and-over), antegrade femoral, radial with long catheters, or retrograde pedal/tibial access for complex disease',
    steps: [
      {
        title: 'Pre-procedure review',
        description: 'Review ABI, duplex or CTA, renal function, allergies and antithrombotic therapy',
      },
      {
        title: 'Access',
        description: 'Ultrasound- and fluoroscopy-guided CFA puncture over the femoral head',
      },
      {
        title: 'Aortogram',
        description: 'Pigtail injection in the abdominal aorta to image renal and aortoiliac arteries',
      },
      {
        title: 'Selective runoff',
        description: 'Image each limb segment from iliac to pedal arteries',
      },
      {
        title: 'Pressure gradients',
        description: 'Measure translesional pressure gradients when stenosis significance is uncertain',
      },
      {
        title: 'Treatment decision',
        description: 'Proceed to endovascular therapy or plan surgical bypass with the vascular team',
      },
      {
        title: 'Closure',
        description: 'Manual compression or closure device, then distal pulse checks',
      },
    ],
    ecg: [
      'PAD patients have a high prevalence of coronary disease — obtain a baseline ECG',
      'Vasovagal bradycardia and hypotension can occur during sheath removal',
      'Contrast reactions can cause tachycardia and hypotension',
    ],
    equipment: [
      'Micropuncture kit and 4–6 Fr sheath',
      'Pigtail and selective catheters',
      'Hydrophilic guidewires',
      'Iodinated contrast or CO₂ delivery system',
      'Vascular closure device',
    ],
    complications: [
      'Hematoma, pseudoaneurysm and arteriovenous fistula',
      'Retroperitoneal hemorrhage from a high puncture',
      'Contrast-associated AKI',
      'Dissection or distal embolisation',
      'Contrast reaction',
    ],
    postCare: [
      'Bed rest per closure method with access-site and distal pulse checks',
      'Hydration and creatinine check in high-risk patients',
      'Optimise antiplatelet therapy, statin, smoking cessation and exercise',
    ],
    teaching: [
      'ABI ≤ 0.90 diagnoses PAD; > 1.40 indicates non-compressible arteries',
      'Acute limb ischemia 6 Ps: pain, pallor, pulselessness, paresthesia, paralysis, poikilothermia',
      'Retroperitoneal bleeding presents with back pain and hypotension but little visible groin swelling',
      'PAD signals high cardiovascular risk — statin for all, plus antiplatelet therapy for symptomatic PAD',
    ],
    targetStructures: ['descending-aorta'],
    relatedConditions: [],
  },

  'peripheral-intervention': {
    id: 'peripheral-intervention',
    name: 'Peripheral Angioplasty / Stenting',
    category: 'Vascular & Peripheral',
    summary:
      'Balloon angioplasty, stents, drug-coated devices or atherectomy reopen narrowed or blocked limb arteries. It relieves disabling claudication and helps save limbs in chronic limb-threatening ischemia.',
    levelNotes: [
      'After leg artery stenting, a newly cold, pale, painful or numb leg suggests acute blockage — emergency transport; hold firm direct pressure on groin bleeding and ask about antiplatelet drugs and recent procedures',
      'After reperfusion of an ischemic limb watch for hyperkalemia (peaked T waves, widening QRS, arrhythmias) and treat per protocol; a tense, painful calf suggests compartment syndrome, and access bleeding with hypotension needs IV fluids per protocol',
      'Prepare balloons, drug-coated devices, stents, atherectomy or lithotripsy consoles and long sheaths per the operator’s plan; track ACT timing and contrast volume, record pressure gradients if requested, and alert the operator to patient pain, hemodynamic change or arrhythmia',
      'Give heparin on order to the ACT target and antiplatelet loading as prescribed; after the case do frequent distal pulse/Doppler and neurovascular checks, watch for compartment syndrome, hyperkalemia and access bleeding, and reinforce antiplatelet, statin and smoking-cessation teaching',
      'Revascularise for lifestyle-limiting claudication after exercise therapy and GDMT, or for CLTI; match tool to segment (iliac stents, drug-coated femoropopliteal devices, inline tibial flow to the wound), consider vein bypass (BEST-CLI) and afterwards rivaroxaban 2.5 mg bid plus aspirin (VOYAGER PAD)',
    ],
    overview: [
      'Endovascular-first strategies are common for many lesions',
      'Tools: plain and drug-coated balloons, bare-metal, drug-eluting and covered stents, atherectomy and lithotripsy',
      'Chronic total occlusions are crossed intraluminally or subintimally with re-entry',
      'Surgical bypass with good saphenous vein is preferred for some CLTI anatomy (BEST-CLI)',
    ],
    indications: [
      'Lifestyle-limiting claudication despite supervised exercise and medical therapy',
      'Chronic limb-threatening ischemia',
      'Acute limb ischemia (with thrombectomy or thrombolysis)',
      'Selected symptomatic renal, mesenteric or subclavian stenosis',
    ],
    contraindications: [
      'Asymptomatic PAD (no prophylactic revascularisation)',
      'Non-salvageable limb (primary amputation)',
      'Inability to take antiplatelet therapy (relative)',
      'Prior severe contrast reaction or advanced CKD (relative)',
    ],
    anatomy: [
      'Iliac arteries: stents give high long-term patency',
      'Superficial femoral artery is long and subject to compression and torsion — stent fracture risk',
      'Popliteal artery crosses the knee flexion zone, where stents are avoided when possible',
      'Tibial arteries are small and calcified, typical in diabetes and CKD',
    ],
    accessSite:
      'Contralateral common femoral (up-and-over), ipsilateral antegrade femoral, radial in selected cases, or retrograde pedal/tibial',
    steps: [
      {
        title: 'Diagnostic angiography',
        description: 'Image inflow, the target lesion and runoff',
      },
      {
        title: 'Anticoagulation',
        description: 'Heparin to target ACT before crossing',
      },
      {
        title: 'Cross the lesion',
        description: 'Wire across intraluminally, or subintimally with re-entry for occlusions',
      },
      {
        title: 'Vessel preparation',
        description: 'Predilation, atherectomy or lithotripsy for heavy calcium',
      },
      {
        title: 'Treat',
        description: 'Angioplasty (often drug-coated), with stenting for flow-limiting dissection or recoil',
      },
      {
        title: 'Completion angiography',
        description: 'Confirm result and check runoff for distal embolisation',
      },
      {
        title: 'Closure',
        description: 'Achieve hemostasis and check distal pulses or Doppler signals',
      },
    ],
    ecg: [
      'Coexisting coronary disease is common — hypotension can provoke ischemic changes',
      'Vasovagal bradycardia during sheath removal',
      'Reperfusion of an acutely ischemic limb can cause hyperkalemia with peaked T waves and arrhythmias',
    ],
    equipment: [
      'Sheaths, crossing catheters and guidewires',
      'Plain and drug-coated balloons',
      'Self-expanding and balloon-expandable stents',
      'Atherectomy or lithotripsy devices',
      'Embolic protection or thrombectomy devices when needed',
    ],
    complications: [
      'Access-site hematoma, pseudoaneurysm or retroperitoneal bleeding',
      'Dissection, perforation or distal embolisation',
      'Acute thrombosis',
      'Restenosis',
      'Compartment syndrome after reperfusion',
      'Contrast-associated AKI',
    ],
    postCare: [
      'Distal pulse, Doppler and ABI checks',
      'Antiplatelet therapy (often DAPT for a period after stenting), statin and smoking cessation',
      'Duplex surveillance of treated segments',
      'Wound care and podiatry for CLTI',
    ],
    teaching: [
      'Revascularisation is for symptoms or limb salvage — not for asymptomatic disease',
      'Reperfusion injury: hyperkalemia, myoglobinuria and compartment syndrome',
      'Diabetes and CKD predict tibial disease and worse limb outcomes',
      'Medical therapy and smoking cessation drive long-term outcomes',
    ],
    targetStructures: ['descending-aorta'],
    relatedConditions: ['hyperkalemia'],
  },

  'carotid-stenting': {
    id: 'carotid-stenting',
    name: 'Carotid Artery Stenting',
    category: 'Vascular & Peripheral',
    summary:
      'A stent is placed across a carotid bifurcation narrowing, with an embolic protection device, to lower future stroke risk. It is an alternative to carotid endarterectomy, particularly for patients at high surgical risk.',
    levelNotes: [
      'After carotid stenting, new facial droop, arm weakness, speech change, severe headache or seizure is a stroke alert: record time last known well, check glucose where protocols allow and transport to a stroke centre',
      'Carotid sinus stretch can cause bradycardia and hypotension for 24–48 h — treat symptomatic bradycardia per protocol (atropine, pacing) and avoid hypertension; severe headache or seizure suggests hyperperfusion syndrome or hemorrhage',
      'Prepare the long sheath, embolic protection device, carotid stent and balloons, with atropine or glycopyrrolate drawn up on the physician’s order; record continuous arterial pressure and heart rate and call out bradycardia or asystole during post-dilation immediately',
      'Perform baseline and serial neuro checks (speech, grip, facial symmetry) during and after the case; give atropine or vasopressors on order for bradycardia or hypotension, keep BP within the ordered range to limit hyperperfusion, and escalate any neuro change immediately',
      'For symptomatic severe stenosis choose CEA, transfemoral CAS or TCAR by age, arch anatomy and surgical risk — CAS carries more periprocedural stroke in older patients (CREST); pretreat with DAPT and statin, use embolic protection and blunt reflex bradycardia before post-dilation',
    ],
    overview: [
      'Transfemoral CAS with embolic protection; transcarotid revascularisation (TCAR) with flow reversal is an alternative',
      'CREST: similar composite outcomes for CAS and CEA, with more periprocedural stroke after CAS and more MI after CEA',
      'Symptomatic patients benefit most; treat early (ideally within 2 weeks of TIA or minor stroke)',
      'Dual antiplatelet therapy before and after stenting',
    ],
    indications: [
      'Symptomatic stenosis ≥ 70% by non-invasive imaging or ≥ 50% by catheter angiography, at acceptable procedural risk',
      'High surgical risk: prior neck radiation, restenosis after CEA, high lesion, tracheostomy, severe cardiopulmonary disease',
      'Selected asymptomatic severe stenosis with low procedural risk (benefit debated with modern medical therapy)',
    ],
    contraindications: [
      'Unfavourable arch (type III), severe tortuosity or heavy circumferential calcification',
      'Visible fresh thrombus in the lesion',
      'Inability to take DAPT',
      'Older age (> ~70 y) favours CEA (relative)',
      'Chronic total occlusion',
    ],
    anatomy: [
      'The common carotid bifurcates at ~C3–C4 into internal and external carotid arteries',
      'Carotid sinus baroreceptors sit at the bifurcation — stretch causes bradycardia and hypotension',
      'The left CCA arises directly from the aortic arch; the right from the brachiocephalic trunk',
      'Arch type I–III describes how far below the arch top the great vessels arise',
    ],
    accessSite:
      'Common femoral artery for transfemoral CAS; radial or brachial in selected cases; direct common carotid access with flow reversal for TCAR',
    steps: [
      {
        title: 'Pre-treatment',
        description: 'Load DAPT and statin before the procedure',
      },
      {
        title: 'Access and heparin',
        description: 'Arterial access and heparin to target ACT',
      },
      {
        title: 'Angiography',
        description: 'Arch aortogram and selective carotid and intracranial angiography',
      },
      {
        title: 'Position sheath',
        description: 'Advance a long sheath or guide into the common carotid artery',
      },
      {
        title: 'Embolic protection',
        description: 'Deploy a distal ICA filter or establish proximal occlusion or flow reversal',
      },
      {
        title: 'Stent',
        description: 'Deploy a self-expanding stent across the lesion, with predilation if needed',
      },
      {
        title: 'Post-dilate',
        description: 'Give atropine or glycopyrrolate, then perform modest post-dilation',
      },
      {
        title: 'Retrieve and image',
        description: 'Retrieve the protection device and perform final cervical and intracranial angiography',
      },
    ],
    ecg: [
      'Bradycardia or brief asystole during balloon inflation from carotid sinus stimulation',
      'Hemodynamic depression (hypotension, bradycardia) can persist for 24–48 h',
      'Coexisting coronary disease — watch for ischemic changes during hypotension',
    ],
    equipment: [
      'Long sheath or guide catheter',
      'Embolic protection device (distal filter or proximal occlusion/flow reversal)',
      'Self-expanding carotid stent',
      'Angioplasty balloons',
      'Atropine and vasopressors immediately available',
    ],
    complications: [
      'Embolic stroke or TIA',
      'Hyperperfusion syndrome: headache, seizure or intracerebral hemorrhage',
      'Bradycardia and hypotension',
      'Myocardial infarction',
      'Access complications and contrast-associated AKI',
      'In-stent restenosis',
    ],
    postCare: [
      'Frequent neurological checks',
      'Tight blood pressure control: avoid hypertension and treat hypotension',
      'DAPT for ≥ 1 month, then long-term single antiplatelet and statin',
      'Duplex ultrasound surveillance',
    ],
    teaching: [
      'The carotid sinus reflex explains post-stent bradycardia and hypotension',
      'CEA vs CAS: CAS has more minor strokes; CEA has more MI and cranial nerve injury',
      'Hyperperfusion syndrome classically presents with ipsilateral headache days after revascularisation',
      'Best medical therapy (antiplatelet, statin, BP control, smoking cessation) underpins every strategy',
    ],
    targetStructures: ['aortic-arch'],
    relatedConditions: ['sinus-bradycardia'],
  },

  'catheter-directed-thrombolysis': {
    id: 'catheter-directed-thrombolysis',
    name: 'Catheter-Directed Therapy for PE / DVT',
    category: 'Vascular & Peripheral',
    summary:
      'Catheters placed directly into pulmonary artery or deep vein clot deliver low-dose thrombolytic drug and/or mechanically remove thrombus. It is used for selected high-risk or deteriorating intermediate-risk PE and severe DVT when benefit outweighs bleeding risk.',
    levelNotes: [
      'Sudden breathlessness, chest pain, a fast pulse and low oxygen after immobility, surgery or travel may be PE: give oxygen to target, monitor closely, be ready for CPR and transport rapidly with early notification',
      'Recognise tachycardia and RV-strain patterns (S1Q3T3, new RBBB, anterior T inversion); in massive PE give only small fluid boluses, use vasopressors per protocol, avoid intubation if possible and pre-alert for PE team activation',
      'Prepare venous sheaths, a pigtail, and infusion or large-bore aspiration catheters; record RA, RV and PA pressures before and after treatment, watch for ectopy or VT during RV passage, and track aspirated blood loss for the operator',
      'Verify lytic contraindication screening and orders; give alteplase and heparin exactly as ordered and monitor frequently per protocol for bleeding, access-site oozing and neuro change, with hemoglobin and fibrinogen as ordered, escalating any decline immediately',
      'Risk-stratify by hemodynamics, RV function, troponin and sPESI; high-risk PE needs reperfusion (systemic lysis first, catheter or surgical therapy if contraindicated or failed), while routine catheter therapy in intermediate-high risk remains under study — decide with the PERT',
    ],
    overview: [
      'Includes catheter-directed thrombolysis, ultrasound-facilitated thrombolysis and mechanical or aspiration thrombectomy',
      'Lower lytic doses than systemic thrombolysis aim to reduce bleeding',
      'For DVT: severe iliofemoral DVT or phlegmasia cerulea dolens',
      'Multidisciplinary PE response teams (PERT) coordinate decisions',
      'ATTRACT: routine catheter therapy for proximal DVT did not reduce post-thrombotic syndrome overall',
    ],
    indications: [
      'High-risk (massive) PE with contraindication to or failure of systemic thrombolysis',
      'Intermediate-high-risk PE with clinical deterioration (centre-dependent)',
      'Iliofemoral DVT with limb threat (phlegmasia) or severe symptoms',
      'Acute proximal DVT with severe symptoms despite anticoagulation and low bleeding risk (selected)',
    ],
    contraindications: [
      'Absolute lytic contraindications (prior ICH, recent ischemic stroke, CNS tumour, active bleeding, recent major trauma or surgery) — favour mechanical thrombectomy',
      'Low-risk PE — anticoagulation alone',
      'No suitable venous access',
      'Thrombus in transit across a PFO (relative — surgical options considered)',
    ],
    anatomy: [
      'Venous route: femoral or internal jugular vein → RA → RV → main PA → left and right PAs',
      'Saddle or bilateral central clot raises RV afterload, causing RV dilation and septal shift',
      'Iliofemoral DVT may reflect May-Thurner compression of the left common iliac vein by the right common iliac artery',
    ],
    accessSite:
      'Common femoral or internal jugular vein (ultrasound-guided) for PE; popliteal or femoral vein for iliofemoral DVT',
    steps: [
      {
        title: 'Risk stratification',
        description: 'Assess hemodynamics, RV function, troponin and bleeding risk; PERT decision',
      },
      {
        title: 'Access and anticoagulation',
        description: 'Ultrasound-guided venous access; continue therapeutic heparin',
      },
      {
        title: 'Hemodynamics and angiography',
        description: 'Measure RA, RV and PA pressures and localise thrombus',
      },
      {
        title: 'Position catheters',
        description: 'Place infusion catheters into bilateral PA thrombus, or advance a large-bore aspiration catheter',
      },
      {
        title: 'Treat',
        description: 'Infuse low-dose alteplase over several hours, or aspirate thrombus mechanically',
      },
      {
        title: 'Monitor',
        description: 'ICU monitoring for bleeding, hemoglobin and hemodynamics during infusion',
      },
      {
        title: 'Reassess and remove',
        description: 'Repeat PA pressures or imaging, then remove catheters',
      },
      {
        title: 'Transition',
        description: 'Continue full-dose anticoagulation',
      },
    ],
    ecg: [
      'Sinus tachycardia is the most common ECG finding in PE',
      'RV strain: S1Q3T3, new RBBB, right axis deviation, T-wave inversion V1–V4',
      'Catheter passage through the RV can trigger PVCs, VT or transient RBBB',
      'Falling heart rate and resolving strain pattern support a good response',
    ],
    equipment: [
      'Infusion catheters (standard or ultrasound-facilitated)',
      'Large-bore aspiration thrombectomy system',
      'Thrombolytic (alteplase) infusion',
      'Venous sheaths and pigtail catheter for pressures and angiography',
      'Ultrasound for access',
    ],
    complications: [
      'Major bleeding (less than systemic lysis but not zero); intracranial hemorrhage is rare',
      'Access-site bleeding or hematoma',
      'Pulmonary artery injury or perforation',
      'Arrhythmias',
      'Blood loss with aspiration thrombectomy',
      'Collapse with sedation or intubation in RV failure',
    ],
    postCare: [
      'ICU or step-down monitoring during infusion',
      'Therapeutic anticoagulation (DOAC or LMWH/warfarin) for ≥ 3 months',
      'Echo to assess RV recovery',
      'Follow-up for persistent dyspnea (CTEPH screening if symptomatic at 3–6 months)',
      'Compression and early ambulation for DVT',
    ],
    teaching: [
      'Avoid intubation in RV failure when possible — sedation and positive pressure can precipitate arrest',
      'Give only small fluid boluses; norepinephrine is the usual first vasopressor in PE shock',
      'RV dysfunction plus raised troponin defines intermediate-high-risk PE',
      'IVC filters do not treat PE; anticoagulation is the backbone of therapy',
    ],
    targetStructures: ['pulmonary-trunk', 'right-ventricle', 'right-atrium', 'ivc'],
    relatedConditions: ['pulmonary-embolism', 'sinus-tachycardia', 'right-bundle-branch-block', 'cardiogenic-shock'],
  },

  'ivc-filter': {
    id: 'ivc-filter',
    name: 'IVC Filter Placement',
    category: 'Vascular & Peripheral',
    summary:
      'A metal filter placed in the inferior vena cava, usually below the renal veins, traps large clots travelling from the legs toward the lungs. It is reserved mainly for acute venous thromboembolism when anticoagulation cannot be given, and retrievable filters should be removed once no longer needed.',
    levelNotes: [
      'A filter does not make PE impossible — treat breathlessness, chest pain and low oxygen as possible PE, give oxygen to target and transport, and mention the filter at handover',
      'Filter patients still develop DVT and PE; new swelling of both legs may mean filter or IVC thrombosis — monitor for tachycardia and hypoxia, look for RV strain on the 12-lead and treat hypotension per protocol',
      'Prepare the filter kit and delivery sheath, a marker pigtail for cavography and the power injector as directed; record filter type, lot and position for retrieval tracking, and apply ALARA during jugular or femoral access',
      'Confirm the indication and retrieval plan are documented; after placement check the access site and both legs, monitor for bleeding and new swelling, and teach the filter type, MRI-conditional status and the need for retrieval follow-up',
      'Place filters only for acute proximal DVT/PE with an absolute contraindication to anticoagulation — not routinely with anticoagulation (PREPIC 2) or for primary prophylaxis; cavography defines renal veins and IVC diameter, then anticoagulate when safe and retrieve promptly',
    ],
    overview: [
      'A mechanical barrier — it does not stop clot formation',
      'Retrievable filters are now standard, but many are never removed',
      'Complications rise with longer dwell time',
      'Retrieval is recommended as soon as protection is no longer needed',
    ],
    indications: [
      'Acute proximal DVT or PE with an absolute contraindication to anticoagulation (e.g. active bleeding)',
      'Anticoagulation that must be stopped for urgent surgery soon after acute VTE',
      'Recurrent PE despite therapeutic anticoagulation (selected; limited evidence)',
      'Selected high-risk trauma patients (controversial)',
    ],
    contraindications: [
      'Patients who can be anticoagulated — no added benefit',
      'Thrombus at the intended deployment site (consider suprarenal placement)',
      'No venous access route',
      'IVC diameter larger than the filter is rated for (megacava)',
    ],
    anatomy: [
      'The IVC forms at ~L5 from the common iliac veins and ascends right of the aorta',
      'Renal veins enter at ~L1–L2; the left renal vein crosses anterior to the aorta',
      'Variants: duplicated or left-sided IVC, circumaortic or retroaortic left renal vein',
      'Suprarenal placement is used for renal vein or infrarenal IVC thrombus and in pregnancy',
    ],
    accessSite: 'Right internal jugular or common femoral vein (ultrasound-guided)',
    steps: [
      {
        title: 'Confirm indication',
        description: 'Document the contraindication to anticoagulation and the plan for retrieval',
      },
      {
        title: 'Access',
        description: 'Ultrasound-guided jugular or femoral venous access',
      },
      {
        title: 'Cavogram',
        description: 'Contrast venography to define renal veins, IVC diameter, thrombus and anomalies',
      },
      {
        title: 'Position',
        description: 'Advance the delivery sheath to the infrarenal IVC',
      },
      {
        title: 'Deploy',
        description: 'Release the filter and check tilt and position',
      },
      {
        title: 'Plan retrieval',
        description: 'Record filter type and schedule follow-up for removal',
      },
    ],
    ecg: [
      'Jugular wire passage through the RA can trigger atrial or ventricular ectopy',
      'Baseline sinus tachycardia or RV strain may reflect underlying PE',
      'Filter fragment embolisation to the heart can rarely cause arrhythmias',
    ],
    equipment: [
      'Retrievable IVC filter and delivery sheath',
      'Pigtail catheter and contrast',
      'Ultrasound for access',
      'Snare or cone retrieval devices for later removal',
    ],
    complications: [
      'Recurrent DVT and IVC thrombosis',
      'Filter tilt or strut penetration of the IVC wall',
      'Fracture, migration or embolisation to the heart or pulmonary arteries',
      'Access-site thrombosis',
      'Difficult retrieval after prolonged dwell',
      'Recurrent PE remains possible',
    ],
    postCare: [
      'Start anticoagulation as soon as the contraindication resolves',
      'Enrol in a retrieval tracking pathway',
      'Monitor for leg swelling',
      'Record filter type and MRI conditional status',
    ],
    teaching: [
      'A filter is not a treatment for DVT — anticoagulation is',
      'PREPIC 2: adding a filter to anticoagulation did not reduce recurrent PE',
      'Permanent filters increase long-term DVT risk',
      'Historically low retrieval rates make systematic follow-up essential',
    ],
    targetStructures: ['ivc', 'right-atrium'],
    relatedConditions: ['pulmonary-embolism'],
  },

  // ─── Cardiac Surgery ───────────────────────────────────────────────────────
  cabg: {
    id: 'cabg',
    name: 'Coronary Artery Bypass Grafting',
    category: 'Cardiac Surgery',
    summary:
      'Surgeons attach arterial and vein grafts beyond blocked coronary arteries, usually through a sternotomy. It improves survival in left main and complex multivessel disease, especially with diabetes or reduced LV function.',
    levelNotes: [
      'Post-CABG patients with chest pain, fever or wound drainage need evaluation; follow sternal precautions and avoid pulling on the arms',
      'Treat a STEMI in a post-CABG patient per protocol; atrial fibrillation is common in the first week after surgery',
      'Early post-CABG problems: bleeding, tamponade (can be localised and atypical), post-op AF (~20–40%), vasoplegia, AKI and stroke',
      'CABG is preferred for left main disease with high SYNTAX score, multivessel disease with diabetes (FREEDOM) and ischemic cardiomyopathy with LVEF ≤ 35% (STICH); the heart team uses SYNTAX and STS scores',
      'LIMA-to-LAD is the key survival graft (> 90% patency at 10 years); radial artery or a second IMA outperforms vein for high-grade non-LAD targets',
    ],
    overview: [
      'Conduits: left and right internal mammary arteries, radial artery and saphenous vein',
      'Performed on-pump (cardiopulmonary bypass with cardioplegic arrest) or off-pump',
      'About half of saphenous vein grafts are occluded or diseased by ~10 years',
      'Heart team decision for complex disease, weighing CABG vs PCI',
      'Minimally invasive (MIDCAB) and hybrid surgical-PCI approaches exist',
    ],
    indications: [
      'Significant left main disease, especially with high anatomic complexity',
      'Multivessel CAD involving the LAD in diabetes (FREEDOM)',
      'Multivessel CAD with LVEF ≤ 35% (STICH/STICHES survival benefit)',
      'Three-vessel disease with high SYNTAX score',
      'Anatomy unsuitable for PCI, failed PCI, or concomitant valve or aortic surgery',
      'Mechanical complications of MI requiring surgery with CAD',
    ],
    contraindications: [
      'No graftable distal targets',
      'Prohibitive surgical risk or severe frailty',
      'No viable myocardium in target territories (relative)',
      'Limited life expectancy from other illness',
    ],
    anatomy: [
      'The LIMA arises from the left subclavian artery and is anastomosed in situ to the LAD',
      'Vein grafts run from the ascending aorta to the coronary target',
      'Radial artery grafts are spasm-prone and best for high-grade stenoses',
      'Sequential and composite (Y or T) grafts extend arterial revascularisation',
    ],
    accessSite:
      'Median sternotomy (standard) or left mini-thoracotomy for MIDCAB; conduits harvested from the chest wall, leg (saphenous vein) and forearm (radial artery)',
    steps: [
      {
        title: 'Pre-operative planning',
        description:
          'Heart team review and STS risk; continue aspirin, hold P2Y12 inhibitors for elective surgery (agent-specific, ~3–7 days)',
      },
      {
        title: 'Sternotomy and conduit harvest',
        description: 'Open the chest and harvest the IMA, radial artery and/or saphenous vein',
      },
      {
        title: 'Heparin and cannulation',
        description: 'Full heparinisation, aortic and right atrial cannulation for cardiopulmonary bypass',
      },
      {
        title: 'Cardioplegic arrest',
        description: 'Aortic cross-clamp and cardioplegia to arrest and protect the heart',
      },
      {
        title: 'Distal anastomoses',
        description: 'Sew grafts to coronary targets beyond the stenoses',
      },
      {
        title: 'Proximal anastomoses',
        description: 'Attach vein and free arterial grafts to the ascending aorta',
      },
      {
        title: 'Wean from bypass',
        description: 'Reperfuse, rewarm and wean, placing temporary epicardial pacing wires',
      },
      {
        title: 'Hemostasis and closure',
        description: 'Protamine reversal, chest tubes and sternal wire closure',
      },
    ],
    ecg: [
      'Post-operative AF peaks around days 2–4; beta-blockers reduce its incidence',
      'Epicardial wires allow pacing for post-operative bradycardia or AV block',
      'Diffuse ST elevation may reflect post-pericardiotomy pericarditis; new regional changes suggest graft failure',
      'New Q waves or a troponin rise beyond the expected range prompt evaluation for perioperative MI',
    ],
    equipment: [
      'Cardiopulmonary bypass circuit (pump and oxygenator)',
      'Cardioplegia delivery system',
      'Off-pump tissue stabilisers (OPCAB)',
      'Epicardial pacing wires and chest drains',
      'Intra-operative TEE',
    ],
    complications: [
      'Bleeding and tamponade',
      'Post-operative AF (~20–40%)',
      'Stroke (~1–2%)',
      'AKI, vasoplegia and low-output syndrome',
      'Sternal wound infection or mediastinitis (diabetes, obesity, bilateral IMA)',
      'Graft failure and perioperative MI',
      'Post-pericardiotomy syndrome',
    ],
    postCare: [
      'ICU monitoring of hemodynamics, chest tube output and ventilator weaning',
      'Aspirin within ~6 h after surgery, high-intensity statin and beta-blocker',
      'DAPT continued after ACS presentations',
      'Glycaemic control to reduce wound infection',
      'Sternal precautions for ~6–12 weeks and cardiac rehabilitation',
    ],
    teaching: [
      'LIMA-to-LAD drives most of the survival benefit of CABG',
      'Post-cardiac surgery tamponade can be localised and missed on TTE — keep a high index of suspicion',
      'SYNTAX score quantifies anatomic complexity; higher scores favour CABG',
      'CABG vs PCI depends on diabetes, LV function, anatomic complexity, surgical risk and patient preference',
    ],
    targetStructures: ['lmca', 'lad-proximal', 'lad-mid', 'lcx-proximal', 'om1', 'rca-mid', 'ascending-aorta'],
    relatedConditions: ['nstemi', 'anterior-stemi', 'hfref', 'cardiogenic-shock', 'atrial-fibrillation'],
  },

  'valve-surgery': {
    id: 'valve-surgery',
    name: 'Surgical Valve Repair / Replacement',
    category: 'Cardiac Surgery',
    summary:
      'Open or minimally invasive surgery repairs a diseased valve or replaces it with a mechanical or bioprosthetic valve. It remains the standard for many patients with severe valve disease, endocarditis or combined surgical problems.',
    levelNotes: [
      'A mechanical valve click is normal; these patients take warfarin, so bleeding or head injury needs urgent assessment',
      'Stroke symptoms in a patient on warfarin may be hemorrhagic — rapid transport to a stroke centre; fever in a valve patient may be endocarditis',
      'Muffled valve clicks, a new murmur, emboli or heart failure suggest prosthetic thrombosis or endocarditis; DOACs are contraindicated with mechanical valves',
      'Repair beats replacement for primary MR when durable repair is likely; choose mechanical vs bioprosthetic by age, anticoagulation tolerance and preference',
      'Record prosthesis type, label size and true internal diameter for future valve-in-valve planning, and avoid patient–prosthesis mismatch (consider root enlargement)',
    ],
    overview: [
      'Includes SAVR, mitral repair or replacement, tricuspid repair and the Ross procedure',
      'Mitral repair (leaflet resection, neochords, annuloplasty ring) is preferred for degenerative MR',
      'Mechanical valves are durable but need lifelong warfarin',
      'Bioprosthetic valves avoid long-term anticoagulation but degenerate over ~10–20 years',
      'Often combined with CABG, surgical AF ablation, LAA occlusion or aortic surgery',
    ],
    indications: [
      'Severe symptomatic aortic or mitral stenosis or regurgitation meeting guideline criteria',
      'Asymptomatic severe valve disease with LV dysfunction or progressive dilation',
      'Infective endocarditis with heart failure, uncontrolled infection, abscess or high embolic risk',
      'Severe valve disease in patients undergoing other cardiac surgery',
      'Prosthetic valve dysfunction (thrombosis, paravalvular leak, structural degeneration)',
    ],
    contraindications: [
      'Prohibitive surgical risk or frailty (consider transcatheter options)',
      'Limited life expectancy from other disease',
      'End-stage LV dysfunction or irreversible severe pulmonary hypertension (relative)',
    ],
    anatomy: [
      'The conduction system lies near the non-coronary/right-coronary commissure of the aortic valve',
      'The mitral valve is reached through a left atriotomy or transseptally via the right atrium',
      'The circumflex artery runs close to the posterior mitral annulus — injury risk',
      'Annuloplasty rings remodel and stabilise a dilated mitral or tricuspid annulus',
    ],
    accessSite:
      'Median sternotomy; upper hemisternotomy or right mini-thoracotomy for minimally invasive approaches; robotic mitral surgery in selected centres',
    steps: [
      {
        title: 'Pre-operative assessment',
        description: 'Echo, coronary angiography or CT, dental clearance and heart team review',
      },
      {
        title: 'Access and bypass',
        description: 'Sternotomy or mini-access, heparin and cardiopulmonary bypass',
      },
      {
        title: 'Cardioplegic arrest',
        description: 'Cross-clamp and cardioplegia',
      },
      {
        title: 'Expose the valve',
        description: 'Aortotomy for the aortic valve, atriotomy for the mitral or tricuspid valve',
      },
      {
        title: 'Repair or replace',
        description: 'Repair leaflets and annulus, or excise, debride calcium, size and implant a prosthesis',
      },
      {
        title: 'Assess',
        description: 'De-air, close, and assess with TEE after weaning from bypass',
      },
      {
        title: 'Finish',
        description: 'Place epicardial pacing wires and chest drains, then close',
      },
    ],
    ecg: [
      'Post-operative AF is common',
      'AV block after aortic valve replacement needs a permanent pacemaker in a few percent (~3–8%)',
      'Mitral and tricuspid surgery can also injure the AV node or His bundle',
      'Epicardial wires support pacing in the early post-operative period',
    ],
    equipment: [
      'Cardiopulmonary bypass circuit',
      'Mechanical or bioprosthetic valves and annuloplasty rings',
      'Artificial chordae (neochords)',
      'Intra-operative TEE',
    ],
    complications: [
      'Bleeding and tamponade',
      'Heart block requiring pacing',
      'Stroke',
      'Prosthetic valve endocarditis',
      'Valve thrombosis (mechanical) or structural deterioration (bioprosthetic)',
      'Patient–prosthesis mismatch or paravalvular leak',
      'Post-operative AF and AKI',
    ],
    postCare: [
      'Mechanical valve: lifelong warfarin (INR target by valve type, position and risk, e.g. 2.5 aortic, 3.0 mitral)',
      'Low-dose aspirin may be added for mechanical valves if bleeding risk is low',
      'Bioprosthetic valve: aspirin, with warfarin for ~3–6 months reasonable if bleeding risk is low',
      'Baseline post-operative echo and endocarditis prophylaxis for dental procedures',
      'Cardiac rehabilitation',
    ],
    teaching: [
      'DOACs are contraindicated with mechanical valves (RE-ALIGN)',
      'Loss of crisp mechanical clicks suggests valve thrombosis',
      'Patient–prosthesis mismatch: a prosthesis too small for body size causes persistently high gradients',
      'Bioprosthesis choice anticipates future valve-in-valve TAVR',
    ],
    targetStructures: ['aortic-valve', 'mitral-valve', 'tricuspid-valve', 'ascending-aorta'],
    relatedConditions: ['aortic-stenosis', 'mitral-regurgitation', 'mitral-stenosis', 'atrial-fibrillation', 'third-degree-av-block'],
  },

  'lvad-implantation': {
    id: 'lvad-implantation',
    name: 'LVAD Implantation',
    category: 'Cardiac Surgery',
    summary:
      'A surgically implanted continuous-flow pump draws blood from the left ventricular apex and returns it to the ascending aorta, powered through a driveline by external batteries. It supports advanced heart failure as a bridge to transplant or as lifelong destination therapy.',
    levelNotes: [
      'An LVAD patient may have no palpable pulse or readable cuff BP — judge perfusion by mental status and skin, listen for the pump hum, and bring the caregiver and all equipment',
      'Use a Doppler opening pressure as the MAP; if the patient is unresponsive without signs of perfusion and the pump cannot be quickly restarted, start chest compressions and call the VAD centre',
      'Key emergencies: GI bleeding, pump thrombosis (hemolysis, high LDH, power rise, dark urine), driveline infection, stroke, RV failure and suction events',
      'Select patients by INTERMACS profile, RV function, comorbidity and support; HeartMate 3 reduced pump thrombosis and stroke vs older axial devices (MOMENTUM 3)',
      'Inflow cannula orientation, RV failure prevention, de novo aortic regurgitation and outflow graft obstruction are key surgical and interventional issues',
    ],
    overview: [
      'Fully magnetically levitated centrifugal pumps (HeartMate 3) now dominate; the HeartWare HVAD was withdrawn in 2021',
      'Strategies: bridge to transplant, destination therapy, bridge to candidacy or decision, rarely bridge to recovery',
      'Continuous flow narrows pulse pressure — a peripheral pulse may be absent',
      'Requires warfarin; aspirin is increasingly omitted with HeartMate 3 (ARIES-HM3)',
      'Survival with current devices is ~80% at 2 years',
    ],
    indications: [
      'Stage D HFrEF with NYHA IIIb–IV symptoms despite GDMT and device therapy',
      'Inotrope dependence or progressive end-organ dysfunction from low output',
      'Bridge to transplant in listed or potential candidates',
      'Destination therapy for transplant-ineligible patients',
      'Markers of poor prognosis such as low peak VO₂ or a high-risk INTERMACS profile',
    ],
    contraindications: [
      'Severe RV failure (consider biventricular support or total artificial heart)',
      'Irreversible severe liver, kidney or lung disease',
      'Active systemic infection or recent disabling stroke',
      'Inability to tolerate anticoagulation',
      'Inadequate caregiver support or inability to manage the device',
      'Severe frailty or limited life expectancy from non-cardiac disease',
    ],
    anatomy: [
      'Inflow cannula sits in the LV apex; outflow graft is sewn to the ascending aorta',
      'A driveline is tunnelled through the abdominal wall to an external controller and batteries',
      'The RV must handle the increased venous return — RV failure is common early',
      'The aortic valve may stay closed, promoting aortic regurgitation and aortic root thrombus',
    ],
    accessSite: 'Median sternotomy (standard) or less-invasive thoracotomy approaches; the driveline exits the abdominal wall',
    steps: [
      {
        title: 'Candidacy evaluation',
        description: 'Heart team assessment, right heart cath, RV function, frailty and psychosocial review',
      },
      {
        title: 'Sternotomy and bypass',
        description: 'Open the chest and establish cardiopulmonary bypass, often with the heart beating',
      },
      {
        title: 'Apical coring and inflow',
        description: 'Sew the sewing ring to the LV apex, core the apex and insert the pump inflow',
      },
      {
        title: 'Outflow graft',
        description: 'Anastomose the outflow graft to the ascending aorta',
      },
      {
        title: 'Address other lesions',
        description: 'Close a PFO and repair significant aortic or tricuspid regurgitation as needed',
      },
      {
        title: 'Start the pump',
        description: 'De-air, start the pump and wean bypass, using TEE to check septal position and RV function',
      },
      {
        title: 'Support the RV',
        description: 'Inotropes, inhaled pulmonary vasodilators and temporary RVAD if needed',
      },
      {
        title: 'Driveline and closure',
        description: 'Tunnel the driveline, secure it and close',
      },
    ],
    ecg: [
      'Ventricular arrhythmias are common; patients may remain conscious in VT or VF because of pump flow',
      'Sustained VT/VF still impairs RV function — cardiovert or defibrillate',
      'External defibrillation is safe without disconnecting the pump',
      'Suction events from hypovolemia can trigger VT',
      'Many patients also have an ICD',
    ],
    equipment: [
      'LVAD pump, outflow graft and driveline',
      'System controller, batteries and power module',
      'Cardiopulmonary bypass and TEE',
      'Doppler probe and sphygmomanometer for blood pressure',
    ],
    complications: [
      'GI bleeding (angiodysplasia, acquired von Willebrand syndrome)',
      'Pump thrombosis (hemolysis, high LDH, power spikes, dark urine)',
      'Driveline infection',
      'Ischemic and hemorrhagic stroke',
      'Right ventricular failure',
      'Aortic regurgitation and ventricular arrhythmias',
      'Suction events from hypovolemia',
    ],
    postCare: [
      'Warfarin to the centre target INR; antiplatelet use per device and centre',
      'Doppler MAP monitoring with centre target ranges (commonly ~60–80 mmHg) — hypertension raises stroke risk',
      'Sterile driveline dressing changes',
      'Monitor LDH, hemoglobin and pump speed, power, flow and pulsatility',
      'Patient and caregiver training; always carry backup controller and charged batteries',
    ],
    teaching: [
      'No pulse does not mean cardiac arrest in an LVAD patient — assess perfusion and the pump',
      'Pulse oximetry may fail because of low pulsatility',
      'Pump parameters: speed (set), power (measured), flow (estimated) and pulsatility index',
      'Hypovolemia → suction events → low flow and VT',
      'Never disconnect both power sources at once',
    ],
    targetStructures: ['left-ventricle', 'apex', 'ascending-aorta', 'aortic-valve', 'right-ventricle'],
    relatedConditions: ['hfref', 'dilated-cardiomyopathy', 'cardiogenic-shock', 'monomorphic-vt', 'ventricular-fibrillation'],
  },

  'heart-transplant': {
    id: 'heart-transplant',
    name: 'Heart Transplantation',
    category: 'Cardiac Surgery',
    summary:
      'A donor heart replaces the failing heart in selected patients with end-stage heart failure. Lifelong immunosuppression and rejection surveillance are required, and the transplanted heart is denervated.',
    levelNotes: [
      'Transplant patients may feel little chest pain with ischemia, a resting rate of ~90–110 is normal, and they are immunosuppressed — take infection seriously',
      'Atropine does not work on a denervated heart; use pacing or epinephrine for symptomatic bradycardia, and give adenosine only at a reduced dose',
      'New arrhythmia, heart failure or hypotension in a transplant patient is rejection until proven otherwise; check tacrolimus levels and drug interactions',
      'Surveil for cellular and antibody-mediated rejection with EMB (± gene-expression profiling or donor-derived cell-free DNA) and screen yearly for cardiac allograft vasculopathy',
      'CAV is diffuse and concentric — IVUS detects early intimal thickening; surveillance EMB targets the RV septum via the RIJ or femoral vein',
    ],
    overview: [
      'Median survival after adult heart transplant is ~12–13 years',
      'The bicaval anastomosis technique is now most common',
      'Allocation by urgency status, blood group, size and HLA antibody compatibility',
      'Immunosuppression usually combines tacrolimus, mycophenolate and tapering steroids',
      'Donation after circulatory death with machine perfusion is expanding the donor pool',
    ],
    indications: [
      'Stage D heart failure refractory to GDMT, devices and mechanical support',
      'Cardiogenic shock dependent on inotropes or temporary MCS',
      'Peak VO₂ ≤ 12 mL/kg/min on beta-blocker (≤ 14 if beta-blocker intolerant)',
      'Refractory angina or ventricular arrhythmias not controlled by other therapy',
      'Selected congenital, restrictive or hypertrophic cardiomyopathy',
    ],
    contraindications: [
      'Irreversible pulmonary hypertension (e.g. PVR > ~5 Wood units despite vasodilator challenge)',
      'Active malignancy or uncontrolled infection',
      'Severe irreversible end-organ dysfunction',
      'Active substance use, non-adherence or inadequate social support',
      'Severe frailty or advanced age and obesity (relative)',
    ],
    anatomy: [
      'Bicaval technique: anastomoses at the left atrial cuff, SVC, IVC, aorta and pulmonary artery',
      'Bicaval technique preserves donor RA anatomy, with less atrial arrhythmia and TR than the biatrial technique',
      'The heart is denervated; partial reinnervation may occur over years',
      'With biatrial anastomosis, a remnant recipient atrium can produce a second set of P waves',
    ],
    accessSite: 'Median sternotomy with cardiopulmonary bypass (often redo sternotomy after prior LVAD or surgery)',
    steps: [
      {
        title: 'Listing and allocation',
        description: 'Transplant committee evaluation, listing and donor matching',
      },
      {
        title: 'Donor procurement',
        description: 'Cardioplegic arrest and cold storage or ex vivo machine perfusion',
      },
      {
        title: 'Recipient cardiectomy',
        description: 'Sternotomy, cardiopulmonary bypass and removal of the native heart (and LVAD if present)',
      },
      {
        title: 'Implant',
        description: 'Left atrial, caval, aortic and pulmonary artery anastomoses',
      },
      {
        title: 'Reperfusion and wean',
        description: 'Reperfuse, de-air and wean bypass with inotropes and chronotropic support',
      },
      {
        title: 'Immunosuppression',
        description: 'Induction and maintenance immunosuppression begun peri-operatively',
      },
      {
        title: 'ICU care',
        description: 'Monitor for primary graft dysfunction and RV failure; pacing or isoproterenol for slow rates',
      },
    ],
    ecg: [
      'Resting sinus tachycardia (~90–110 bpm) from loss of vagal tone',
      'RBBB is common after transplant',
      'Two sets of P waves may appear with biatrial anastomosis',
      'New atrial arrhythmias can signal rejection',
      'Atropine is ineffective; adenosine effect is exaggerated, so ACLS advises a reduced initial dose (3 mg)',
      'Early sinus node dysfunction may need temporary pacing',
    ],
    equipment: [
      'Cardiopulmonary bypass circuit',
      'Organ preservation (cold static storage or ex vivo perfusion)',
      'Epicardial pacing wires',
      'Bioptome for surveillance biopsy',
    ],
    complications: [
      'Primary graft dysfunction',
      'Acute cellular and antibody-mediated rejection',
      'Infection, including CMV and opportunistic organisms',
      'Cardiac allograft vasculopathy',
      'Malignancy (skin cancer, post-transplant lymphoproliferative disorder)',
      'Calcineurin inhibitor nephrotoxicity, hypertension and diabetes',
      'RV failure from pre-existing pulmonary hypertension',
    ],
    postCare: [
      'Lifelong immunosuppression with trough levels and interaction checks (azoles, macrolides, rifampin)',
      'Rejection surveillance with EMB, most frequently in the first year',
      'Annual CAV screening with angiography/IVUS or non-invasive testing',
      'Infection prophylaxis (CMV, Pneumocystis)',
      'Statin therapy for all recipients and regular skin cancer screening',
    ],
    teaching: [
      'The denervated heart responds to circulating catecholamines, not autonomic nerves',
      'Exercise heart rate rises slowly and recovers slowly after transplant',
      'CAV often presents silently with HF, arrhythmia or sudden death rather than angina',
      'Rejection can be asymptomatic — surveillance is essential',
      'Tacrolimus has many CYP3A4 drug interactions',
    ],
    targetStructures: ['left-ventricle', 'right-ventricle', 'left-atrium', 'right-atrium', 'ascending-aorta', 'pulmonary-trunk', 'sa-node'],
    relatedConditions: ['hfref', 'dilated-cardiomyopathy', 'cardiogenic-shock', 'sinus-tachycardia', 'right-bundle-branch-block'],
  },

  // ─── Emergency & Bedside ───────────────────────────────────────────────────
  defibrillation: {
    id: 'defibrillation',
    name: 'Defibrillation',
    category: 'Emergency & Bedside',
    summary:
      'An unsynchronised high-energy shock depolarises a critical mass of myocardium to terminate ventricular fibrillation or pulseless ventricular tachycardia. Early defibrillation with high-quality CPR is the single most important treatment for shockable cardiac arrest.',
    levelNotes: [
      'Attach the AED as soon as it arrives, follow the prompts, make sure no one is touching the patient, and restart compressions immediately after each shock',
      'For VF/pVT use the manufacturer biphasic energy (often 120–200 J) or 360 J monophasic, charge during compressions and keep pre-shock pauses as short as possible',
      'For refractory VF consider changing pad vector (anterolateral to anteroposterior) or double sequential defibrillation (DOSE-VF), along with epinephrine and amiodarone or lidocaine',
      'Electrical storm needs reversal of ischemia, electrolyte correction, beta-blockade, sedation and early consideration of revascularisation or ablation',
      'Place pads before high-risk lab cases so VF is shocked immediately; in device patients avoid placing pads directly over the generator and interrogate the device afterwards',
    ],
    overview: [
      'Unsynchronised shock delivered at any point in the cardiac cycle',
      'Shockable rhythms are VF and pulseless VT only',
      'Not effective for asystole or PEA',
      'Without CPR, VF survival falls ~7–10% for each minute until defibrillation',
      'Biphasic waveforms terminate VF at lower energy than monophasic',
    ],
    indications: [
      'Ventricular fibrillation',
      'Pulseless ventricular tachycardia',
      'Polymorphic VT (including torsades) with instability — synchronisation is unreliable, so defibrillate',
      'Unstable VT when the device cannot synchronise',
    ],
    contraindications: [
      'Asystole and PEA (non-shockable rhythms)',
      'Conscious patient with a pulse in a stable rhythm',
      'Unsafe environment (standing water, rescuer contact, oxygen flowing over the chest — remove first)',
      'Valid do-not-attempt-resuscitation decision',
    ],
    anatomy: [
      'Current must cross a critical mass of ventricular myocardium',
      'Anterolateral: one pad below the right clavicle, the other at the left mid-axillary line (V6 level)',
      'Anteroposterior: left precordium anteriorly and left infrascapular area posteriorly',
      'Good pad contact, shaving chest hair and drying the skin lower transthoracic impedance',
    ],
    accessSite:
      'Transthoracic self-adhesive pads (preferred) or paddles in anterolateral or anteroposterior position; internal paddles during open-chest surgery',
    steps: [
      {
        title: 'Recognise and start CPR',
        description: 'Confirm unresponsiveness and absent normal breathing; start high-quality compressions',
      },
      {
        title: 'Apply pads',
        description: 'Place pads while compressions continue',
      },
      {
        title: 'Rhythm check',
        description: 'Pause briefly (≤ 10 s) to analyse rhythm',
      },
      {
        title: 'Charge',
        description: 'Resume compressions while the defibrillator charges',
      },
      {
        title: 'Clear and shock',
        description: 'Ensure no one is touching the patient and deliver the shock at the recommended energy',
      },
      {
        title: 'Resume CPR immediately',
        description: 'Continue 2 minutes of CPR without a pulse check after the shock',
      },
      {
        title: 'Drugs and repeat',
        description:
          'Epinephrine 1 mg IV/IO every 3–5 min after the second shock; amiodarone 300 mg then 150 mg, or lidocaine 1–1.5 mg/kg then 0.5–0.75 mg/kg, for refractory VF/pVT',
      },
      {
        title: 'Post-ROSC care',
        description: 'Start the post-cardiac arrest bundle once spontaneous circulation returns',
      },
    ],
    ecg: [
      'VF: chaotic irregular deflections with no identifiable QRS complexes',
      'Pulseless VT: wide regular complexes without a palpable pulse',
      'Fine VF can mimic asystole — check gain and leads',
      'Brief asystole or PEA often follows a shock — continue CPR',
      'CPR and movement artefact mimic VF; confirm during a pause',
    ],
    equipment: [
      'AED or manual defibrillator',
      'Adult and paediatric self-adhesive pads',
      'Razor and towel',
      'CPR feedback device and waveform capnography',
    ],
    complications: [
      'Skin burns',
      'Post-shock myocardial stunning and transient arrhythmias',
      'Shock to a rescuer in contact with the patient',
      'Fire risk from oxygen near the pads',
      'Implanted device malfunction after external shock',
    ],
    postCare: [
      'Post-arrest bundle: secure airway, SpO₂ 92–98%, avoid hypotension (SBP ≥ 90 mmHg, MAP ≥ 65 mmHg)',
      '12-lead ECG; emergent coronary angiography for STEMI',
      'Deliberate temperature control and fever prevention in comatose patients',
      'Identify and treat reversible causes (Hs and Ts)',
      'Interrogate any implanted device after external shocks',
    ],
    teaching: [
      'Minimise pauses — longer pre- and post-shock pauses reduce shock success and survival',
      'Do not check pulse or rhythm immediately after the shock — resume CPR',
      'Paediatric dose: 2 J/kg, then 4 J/kg, up to 10 J/kg or the adult dose',
      'Only VF and pulseless VT are shockable',
    ],
    targetStructures: ['left-ventricle', 'right-ventricle', 'myocardium', 'purkinje-fibers'],
    relatedConditions: ['ventricular-fibrillation', 'monomorphic-vt', 'torsades-de-pointes'],
  },

  cardioversion: {
    id: 'cardioversion',
    name: 'Synchronized Cardioversion',
    category: 'Emergency & Bedside',
    summary:
      'A shock timed to the R wave terminates re-entrant tachyarrhythmias such as atrial fibrillation, flutter, SVT and VT with a pulse. It is used emergently for unstable patients and electively to restore sinus rhythm.',
    levelNotes: [
      'Unstable tachycardia (low BP, confusion, chest pain, signs of shock) needs ALS — keep the patient lying down, give oxygen if hypoxic and transport',
      'Turn on sync and confirm markers on each R wave, sedate when possible, use typical starting energies (narrow regular 50–100 J, AF 120–200 J biphasic, monomorphic VT ~100 J) and re-enable sync before each repeat shock',
      'Before elective cardioversion of AF or flutter lasting ≥ 48 h or of unknown duration, give ≥ 3 weeks of therapeutic anticoagulation or exclude LAA thrombus by TEE, and continue anticoagulation ≥ 4 weeks afterwards',
      'Plan elective cardioversion within a rhythm-control strategy: antiarrhythmic pretreatment for early recurrence and long-term stroke prevention by CHA₂DS₂-VASc',
      'Anteroposterior pads and adequate energy improve AF cardioversion success; internal cardioversion is an option in the EP lab, and CIEDs need interrogation afterwards',
    ],
    overview: [
      'Delivering the shock on the R wave avoids the vulnerable period of the T wave (R-on-T can induce VF)',
      'Effective for re-entrant rhythms: AF, atrial flutter, AVNRT, AVRT and monomorphic VT',
      'Ineffective for automatic rhythms such as sinus tachycardia, multifocal or focal atrial tachycardia',
      'Emergent for unstable patients; elective for rhythm control',
    ],
    indications: [
      'Unstable tachyarrhythmia with a pulse (hypotension, altered mental status, shock, ischemic chest pain, acute HF)',
      'Stable monomorphic VT not responding to drugs',
      'SVT refractory to vagal manoeuvres and adenosine',
      'Elective rhythm control of persistent AF or atrial flutter',
    ],
    contraindications: [
      'Sinus tachycardia and other automatic rhythms',
      'Pulseless or polymorphic VT — defibrillate (unsynchronised) instead',
      'Elective AF/flutter ≥ 48 h without adequate anticoagulation or TEE',
      'Digoxin toxicity or hypokalemia (relative — correct first when elective)',
    ],
    anatomy: [
      'Re-entry circuits: flutter around the tricuspid annulus, AVNRT in the AV node region, AVRT via an accessory pathway, VT around scar',
      'The shock depolarises excitable tissue in the circuit, terminating re-entry',
      'Anterolateral or anteroposterior pad positions are both acceptable',
    ],
    accessSite: 'Transthoracic self-adhesive pads (anterolateral or anteroposterior); internal cardioversion via catheters in the EP lab',
    steps: [
      {
        title: 'Assess',
        description: 'Determine stability and rhythm; 12-lead ECG if time allows',
      },
      {
        title: 'Prepare',
        description: 'IV access, monitoring, oxygen if hypoxic, suction and airway equipment',
      },
      {
        title: 'Anticoagulation check',
        description: 'For elective AF/flutter confirm adequate anticoagulation or a TEE excluding thrombus',
      },
      {
        title: 'Sedation and analgesia',
        description: 'Procedural sedation for conscious patients, without delaying treatment in peri-arrest patients',
      },
      {
        title: 'Pads and sync',
        description: 'Apply pads and ECG leads, press SYNC and confirm markers on R waves, not T waves',
      },
      {
        title: 'Select energy and shock',
        description: 'Charge, clear, then press and hold the shock button until it discharges on the next R wave',
      },
      {
        title: 'Reassess',
        description: 'Check rhythm and pulse; if unsuccessful re-enable sync and escalate energy',
      },
      {
        title: 'Post-shock monitoring',
        description: 'Monitor until recovered from sedation and obtain a 12-lead ECG',
      },
    ],
    ecg: [
      'Sync markers must sit on QRS complexes, not on tall T waves',
      'A short delay between pressing shock and discharge is expected while the device waits for an R wave',
      'Post-conversion pauses or bradycardia may unmask sinus node disease — have pacing available',
      'If VF develops, turn sync off and defibrillate immediately',
      'Many devices revert to unsynchronised mode after each shock',
    ],
    equipment: [
      'Manual defibrillator with sync function',
      'Self-adhesive pads and monitoring leads',
      'Procedural sedation drugs, airway equipment and suction',
      'Waveform capnography',
    ],
    complications: [
      'VF from an unsynchronised shock delivered on the T wave',
      'Thromboembolism or stroke after AF/flutter cardioversion without adequate anticoagulation',
      'Post-conversion bradycardia or asystole',
      'Sedation complications (hypoventilation, hypotension, aspiration)',
      'Skin burns',
      'Early recurrence of the arrhythmia',
    ],
    postCare: [
      'Monitor rhythm, BP and SpO₂ until recovered from sedation',
      'Continue anticoagulation ≥ 4 weeks after AF/flutter cardioversion, then long-term by CHA₂DS₂-VASc',
      'Investigate precipitating causes and plan rhythm or rate control',
      'Interrogate pacemakers or ICDs after external shocks',
    ],
    teaching: [
      'Synchronisation prevents shocking on the T wave (R-on-T)',
      'Pulseless patient or polymorphic rhythm: defibrillate, do not synchronise',
      'Atrial flutter often converts at low energy',
      'Sedate whenever possible, but never delay cardioversion in a peri-arrest patient',
    ],
    targetStructures: ['left-atrium', 'right-atrium', 'av-node', 'left-ventricle', 'myocardium'],
    relatedConditions: ['atrial-fibrillation', 'atrial-flutter', 'avnrt', 'wpw-syndrome', 'monomorphic-vt'],
  },

  'temporary-pacing': {
    id: 'temporary-pacing',
    name: 'Temporary Pacing (Transcutaneous / Transvenous)',
    category: 'Emergency & Bedside',
    summary:
      'External pads or a wire in the right ventricle deliver electrical impulses to maintain heart rate when the heart\'s own rhythm or conduction fails. Transcutaneous pacing is a rapid bridge; transvenous pacing is more reliable until the cause resolves or a permanent device is placed.',
    levelNotes: [
      'Recognise symptomatic bradycardia (low BP, confusion, fainting, chest pain) and request ALS early — pacing is an ALS skill',
      'For transcutaneous pacing set the rate ~60–80, increase mA until electrical capture, confirm mechanical capture with a femoral pulse or pleth, and give analgesia/sedation',
      'Atropine often fails in high-grade AV block with a wide escape — move promptly to pacing or a chronotrope infusion (epinephrine or dopamine) and arrange transvenous pacing',
      'Look for reversible causes (ischemia, hyperkalemia, drug toxicity, Lyme carditis) before permanent pacing; AV block in inferior MI often resolves',
      'Place the transvenous wire via the RIJ or left subclavian to the RV, aim for a capture threshold < ~1 mA, set output ~2–3× threshold and check sensing',
    ],
    overview: [
      'Transcutaneous pacing (TCP) uses external pads — fast but painful and less reliable',
      'Transvenous pacing (TVP) uses a bipolar lead in the RV — reliable but needs central venous access',
      'Epicardial wires are used after cardiac surgery',
      'Bridge until a reversible cause is corrected or a permanent pacemaker is implanted',
    ],
    indications: [
      'Symptomatic or unstable bradycardia not responding to atropine',
      'Mobitz II or complete heart block with symptoms, instability or wide escape rhythm',
      'Drug-induced bradycardia (beta-blocker, calcium channel blocker, digoxin) while antidotes take effect',
      'Overdrive pacing for recurrent pause-dependent torsades (selected)',
      'Prophylaxis during procedures with high block risk, or new AV block in aortic valve endocarditis',
    ],
    contraindications: [
      'Asystolic cardiac arrest — pacing is not recommended',
      'Bradycardia from severe hypothermia (rewarm instead)',
      'Stable asymptomatic bradycardia',
      'TVP: mechanical tricuspid valve; coagulopathy for central access (relative)',
    ],
    anatomy: [
      'The transvenous lead travels SVC → RA → across the tricuspid valve → RV apex or septum',
      'The RIJ gives a direct route to the RV; the left subclavian has a natural curve toward the tricuspid valve',
      'Avoid the left subclavian if a left-sided permanent device is anticipated',
      'The femoral route needs fluoroscopy and limits mobility',
      'TCP pads are placed anteroposterior (often preferred) or anterolateral',
    ],
    accessSite:
      'Transcutaneous: pads (anteroposterior or anterolateral). Transvenous: right internal jugular or left subclavian vein, or femoral under fluoroscopy, ultrasound-guided',
    steps: [
      {
        title: 'Confirm indication',
        description: 'Symptomatic bradycardia with poor perfusion; prepare analgesia and sedation',
      },
      {
        title: 'TCP: apply pads and leads',
        description: 'Apply pacing pads and connect monitoring ECG leads for demand pacing',
      },
      {
        title: 'TCP: set rate',
        description: 'Select demand mode with a rate of ~60–80 bpm',
      },
      {
        title: 'TCP: increase output',
        description: 'Increase mA until electrical capture (each spike followed by a wide QRS and T wave), then set slightly above threshold',
      },
      {
        title: 'Confirm mechanical capture',
        description: 'Palpate a femoral pulse or check SpO₂ pleth or arterial line matching the paced rate',
      },
      {
        title: 'TVP: access',
        description: 'Ultrasound-guided RIJ or left subclavian sheath',
      },
      {
        title: 'TVP: position lead',
        description: 'Advance a balloon-tipped lead into the RV under fluoroscopy or ECG guidance',
      },
      {
        title: 'TVP: test and set',
        description: 'Measure capture threshold and sensing, set output and rate, secure the lead and obtain a chest X-ray',
      },
    ],
    ecg: [
      'Electrical capture: pacing spike followed by a wide QRS and opposite-direction T wave',
      'Failure to capture: pacing spikes without a following QRS',
      'Failure to sense: spikes falling on intrinsic beats, with R-on-T risk',
      'RV pacing gives an LBBB-like pattern; an RBBB pattern raises concern for septal perforation or coronary sinus position',
      'TCP artefact can obscure the ECG and mimic capture',
    ],
    equipment: [
      'Defibrillator with pacing function and pads',
      'Balloon-tipped bipolar pacing lead and introducer sheath',
      'External pulse generator',
      'Ultrasound and fluoroscopy',
      'Analgesia and sedation',
    ],
    complications: [
      'TCP: pain, skin burns and failure to capture',
      'TVP: pneumothorax, arterial puncture and infection',
      'RV perforation and tamponade',
      'Lead dislodgement with loss of capture',
      'Ventricular arrhythmias',
      'Venous thrombosis',
    ],
    postCare: [
      'Daily threshold and sensing checks',
      'Continuous telemetry',
      'Secure the lead and limit movement of the access limb',
      'Treat reversible causes and decide on permanent pacing or removal',
    ],
    teaching: [
      'Use the femoral pulse to confirm mechanical capture — muscle twitching can mimic a carotid pulse',
      'Electrical capture without a pulse is PEA — start CPR',
      'Atropine 1 mg IV every 3–5 min to a maximum of 3 mg; often ineffective in infranodal block and in transplanted hearts',
      'Chronotrope alternatives: epinephrine 2–10 μg/min or dopamine 5–20 μg/kg/min infusion',
    ],
    targetStructures: ['right-ventricle', 'right-atrium', 'svc', 'tricuspid-valve', 'av-node', 'bundle-of-his'],
    relatedConditions: [
      'third-degree-av-block',
      'mobitz-type-ii',
      'sinus-bradycardia',
      'hyperkalemia',
      'paced-rhythm',
      'torsades-de-pointes',
    ],
  },

  pericardiocentesis: {
    id: 'pericardiocentesis',
    name: 'Pericardiocentesis',
    category: 'Emergency & Bedside',
    summary:
      'A needle guided by echocardiography drains fluid from the pericardial sac to relieve cardiac tamponade or obtain diagnostic fluid. A pigtail drain is usually left in place to prevent rapid reaccumulation.',
    levelNotes: [
      'Low blood pressure, distended neck veins and muffled heart sounds (Beck triad), especially after chest trauma or with cancer, suggest tamponade — transport rapidly and pre-alert',
      'Tamponade is preload-dependent — give fluid for hypotension, avoid positive pressure ventilation if possible, and consider tamponade as a cause of PEA',
      'Echo shows effusion with RA systolic and RV diastolic collapse and a plethoric IVC; perform echo-guided pericardiocentesis, but call surgery for trauma or aortic dissection',
      'Tamponade is a clinical diagnosis; drain for tamponade or diagnosis, and identify the cause (malignancy, post-procedure, uremia, infection, hypothyroidism)',
      'Choose subxiphoid, apical or parasternal entry by echo for the largest, closest pocket, confirm position with agitated saline, and leave a pigtail drain',
    ],
    overview: [
      'Echo guidance gives high success and low complication rates',
      'Removing even a small volume improves hemodynamics because of the steep pericardial pressure–volume curve',
      'Fluid analysis: cell count, glucose, protein, LDH, cytology, Gram stain and cultures',
      'Surgical drainage (pericardial window) is preferred for clotted, loculated or recurrent effusions',
    ],
    indications: [
      'Cardiac tamponade',
      'Suspected purulent, tuberculous or neoplastic effusion (diagnostic)',
      'Large effusion (> ~20 mm in diastole) not responding to medical therapy',
      'Post-procedural effusion with hemodynamic compromise (e.g. cath or EP lab perforation)',
    ],
    contraindications: [
      'Type A aortic dissection with hemopericardium — emergency surgery instead',
      'Traumatic hemopericardium — surgical management (needle only as a bridge if surgery is unavailable)',
      'Free wall rupture after MI — surgery',
      'Relative: coagulopathy, thrombocytopenia, small, posterior or loculated effusion',
    ],
    anatomy: [
      'The pericardial space normally holds ~15–50 mL of fluid',
      'The fibrous pericardium is non-compliant — rapid accumulation of small volumes causes tamponade',
      'Subxiphoid route: below the costal margin toward the left shoulder; risks to liver and RV',
      'Apical route near the LV apex; pneumothorax risk',
      'Parasternal route: avoid the internal mammary artery (~1–2 cm from the sternal edge) and pass above the rib',
    ],
    accessSite: 'Subxiphoid (classic), apical or left parasternal approach, chosen by echo to reach the largest, closest fluid pocket',
    steps: [
      {
        title: 'Confirm and prepare',
        description: 'Confirm tamponade clinically and on echo; IV fluids; correct coagulopathy if time allows',
      },
      {
        title: 'Position',
        description: 'Semi-recumbent at ~30–45° to pool fluid anteriorly and inferiorly',
      },
      {
        title: 'Map entry site',
        description: 'Use echo to choose the entry point, depth and trajectory',
      },
      {
        title: 'Prep and anesthetise',
        description: 'Sterile preparation and local anesthesia along the planned track',
      },
      {
        title: 'Needle insertion',
        description: 'Advance with continuous aspiration under echo guidance until fluid returns',
      },
      {
        title: 'Confirm position',
        description: 'Inject agitated saline and see bubbles in the pericardial space',
      },
      {
        title: 'Place drain',
        description: 'Seldinger technique: wire, dilator and pigtail catheter',
      },
      {
        title: 'Drain and sample',
        description: 'Drain fluid, send samples and reassess hemodynamics and echo',
      },
    ],
    ecg: [
      'Low-voltage QRS and electrical alternans suggest a large effusion with tamponade',
      'Sinus tachycardia is expected in tamponade; bradycardia is an ominous late sign',
      'Ectopy or ST elevation during the procedure suggests needle contact with the myocardium',
      'Vasovagal bradycardia can occur during drainage',
    ],
    equipment: [
      'Pericardiocentesis kit (needle, J-wire, dilator, pigtail drain)',
      'Echo machine with sterile probe cover',
      'Agitated saline',
      'Drainage bag and specimen tubes',
      'Full resuscitation equipment',
    ],
    complications: [
      'Cardiac chamber puncture or coronary laceration',
      'Pneumothorax',
      'Liver injury with the subxiphoid approach',
      'Arrhythmias and vasovagal reactions',
      'Pericardial decompression syndrome (rare ventricular dysfunction after drainage)',
      'Infection',
    ],
    postCare: [
      'Keep the drain until output falls to < ~25–50 mL/24 h',
      'Repeat echo to detect reaccumulation',
      'Monitor hemodynamics and the drain site',
      'Treat the underlying cause (e.g. NSAID plus colchicine for pericarditis)',
      'Consider a pericardial window for recurrent effusion',
    ],
    teaching: [
      'Beck triad: hypotension, raised JVP, muffled heart sounds',
      'Pulsus paradoxus > 10 mmHg supports tamponade',
      'Positive pressure ventilation can precipitate arrest in tamponade',
      'Bloody aspirate that clots suggests intracardiac blood rather than pericardial fluid',
    ],
    targetStructures: ['fibrous-pericardium', 'epicardium', 'right-ventricle', 'right-atrium', 'apex'],
    relatedConditions: ['cardiac-tamponade', 'acute-pericarditis', 'aortic-dissection'],
  },

  'ecmo-cannulation': {
    id: 'ecmo-cannulation',
    name: 'VA-ECMO Cannulation',
    category: 'Emergency & Bedside',
    summary:
      'Large cannulas drain venous blood to an external pump and oxygenator and return it to the arterial system, providing combined heart and lung support. It is used for refractory cardiogenic shock or cardiac arrest as a bridge to recovery, a durable device or transplant.',
    levelNotes: [
      'High-quality CPR with minimal interruptions and early notification keep options like ECPR open for refractory VF arrest in selected systems',
      'In ECPR-capable systems, refractory shockable arrest with a short low-flow time may trigger early transport with mechanical CPR — follow local criteria',
      'Watch for LV distension (pulmonary edema, closed aortic valve), differential hypoxia (check right radial SpO₂ or gas), limb ischemia and bleeding on heparin',
      'VA-ECMO is a bridge — define the exit strategy early; consider LV venting, and note ECLS-SHOCK showed no mortality benefit from routine use in AMI shock',
      'Femoral–femoral cannulation under ultrasound and fluoroscopy, venous cannula tip at the RA–IVC junction, and a distal perfusion cannula in the SFA to protect the leg',
    ],
    overview: [
      'Peripheral VA-ECMO: femoral venous drainage → pump → oxygenator → femoral arterial return with retrograde aortic flow',
      'Central ECMO (RA and ascending aorta) is used after cardiac surgery',
      'VA-ECMO supports heart and lungs; VV-ECMO supports lungs only',
      'Retrograde arterial flow increases LV afterload',
      'ECPR means starting VA-ECMO during ongoing cardiac arrest',
    ],
    indications: [
      'Refractory cardiogenic shock despite inotropes and vasopressors (SCAI stage D–E)',
      'Refractory cardiac arrest (ECPR) in selected patients',
      'Massive PE with shock or arrest',
      'Post-cardiotomy shock, fulminant myocarditis or cardiotoxic drug overdose',
      'Bridge to recovery, decision, durable LVAD or transplant',
    ],
    contraindications: [
      'Unrecoverable heart disease without candidacy for durable support or transplant',
      'Severe irreversible brain injury or prolonged low-flow arrest',
      'Contraindication to anticoagulation (relative)',
      'Severe aortic regurgitation (worsens LV distension)',
      'Aortic dissection',
      'Severe peripheral artery disease (consider alternative cannulation)',
    ],
    anatomy: [
      'Venous drainage cannula (~21–25 Fr) via the femoral vein to the RA–IVC junction',
      'Arterial return cannula (~15–19 Fr) in the common femoral artery',
      'Distal perfusion cannula (~6–8 Fr) into the superficial femoral artery perfuses the leg',
      'A mixing zone forms in the aorta where retrograde ECMO flow meets native cardiac output',
      'Right radial blood reflects native LV output reaching the brain and coronaries',
    ],
    accessSite:
      'Femoral–femoral peripheral cannulation (femoral vein drainage, femoral artery return plus distal perfusion cannula); axillary/subclavian arterial return or central cannulation as alternatives',
    steps: [
      {
        title: 'Activate team',
        description: 'Confirm candidacy and goals; prime the circuit',
      },
      {
        title: 'Ultrasound-guided access',
        description: 'Access the common femoral vein and artery, ideally before arrest or during mechanical CPR',
      },
      {
        title: 'Anticoagulate',
        description: 'Heparin bolus once wires are confirmed in position',
      },
      {
        title: 'Insert cannulas',
        description: 'Serial dilation and cannula insertion with wire position confirmed by fluoroscopy or TEE',
      },
      {
        title: 'Connect and start flow',
        description: 'Connect without air, start pump flow and titrate sweep gas and FiO₂',
      },
      {
        title: 'Distal perfusion',
        description: 'Place a distal perfusion cannula into the SFA to prevent limb ischemia',
      },
      {
        title: 'Assess the LV',
        description: 'Echo for aortic valve opening and LV distension; vent the LV if needed',
      },
    ],
    ecg: [
      'Patients may remain in VT or VF on ECMO — still defibrillate to prevent LV distension and thrombus',
      'The ECG may reveal the cause (e.g. STEMI) and guide emergent angiography',
      'A flat arterial line waveform suggests no native LV ejection',
      'Electrolyte shifts and ischemia trigger arrhythmias',
    ],
    equipment: [
      'Centrifugal pump, membrane oxygenator and heater–cooler',
      'Drainage, return and distal perfusion cannulas',
      'Ultrasound, fluoroscopy or TEE',
      'Heparin with ACT or anti-Xa monitoring',
      'Mechanical CPR device for ECPR',
    ],
    complications: [
      'Limb ischemia and compartment syndrome (reduced by a distal perfusion cannula)',
      'Bleeding (access site, GI, intracranial)',
      'LV distension, pulmonary edema and LV thrombus',
      'Differential hypoxia (Harlequin or north–south syndrome)',
      'Stroke, hemolysis and circuit thrombosis',
      'Infection and AKI',
    ],
    postCare: [
      'Right radial arterial line and right-hand SpO₂ to detect differential hypoxia',
      'Daily echo; LV venting (IABP, Impella or atrial septostomy) for distension',
      'Hourly limb perfusion checks (Doppler, near-infrared spectroscopy)',
      'Anticoagulation and hemolysis monitoring',
      'Daily weaning assessment and decannulation planning',
    ],
    teaching: [
      'Differential hypoxia: a recovering heart ejects poorly oxygenated blood from injured lungs to the brain and coronaries while the lower body receives oxygenated ECMO blood',
      'Fixes include optimising ventilation, adding a venous return limb (V-AV ECMO) or moving arterial return to the axillary artery',
      'VA-ECMO raises LV afterload — a persistently closed aortic valve signals the need to vent',
      'Arterial pulse pressure is a bedside marker of native LV ejection',
    ],
    targetStructures: ['ivc', 'right-atrium', 'descending-aorta', 'left-ventricle', 'aortic-valve'],
    relatedConditions: ['cardiogenic-shock', 'ventricular-fibrillation', 'pulmonary-embolism', 'anterior-stemi'],
  },

  'endomyocardial-biopsy': {
    id: 'endomyocardial-biopsy',
    name: 'Endomyocardial Biopsy',
    category: 'Emergency & Bedside',
    summary:
      'A bioptome passed through a central vein takes small samples of right ventricular septal myocardium for histology. It diagnoses heart transplant rejection and selected myocardial diseases such as giant cell myocarditis.',
    levelNotes: [
      'New chest pain, low blood pressure or breathlessness after a heart biopsy may mean cardiac perforation — urgent transport',
      'Post-biopsy tamponade presents with hypotension, tachycardia and distended neck veins; treat hypotension and transport rapidly',
      'Fulminant myocarditis with shock, heart block or VT warrants early EMB to find giant cell or eosinophilic myocarditis that need immunosuppression',
      'Key indications: transplant rejection surveillance, new HF < 2 weeks with hemodynamic compromise, or HF of 2 weeks–3 months with new ventricular arrhythmias or high-grade block',
      'Direct the bioptome to the RV septum (not the free wall or apex) via the RIJ or femoral vein, take multiple samples (~4–6), and avoid tricuspid chordal injury',
    ],
    overview: [
      'Usually right ventricular biopsy via jugular or femoral venous access',
      'Left ventricular biopsy via arterial access is used occasionally',
      'Samples go for histology, immunohistochemistry, viral PCR and electron microscopy',
      'Patchy diseases such as sarcoidosis can be missed (sampling error)',
      'CMR- or electroanatomic map-guided biopsy improves diagnostic yield',
    ],
    indications: [
      'Surveillance for cardiac allograft rejection',
      'Suspected giant cell myocarditis (rapid HF, VT, heart block, poor response to usual care)',
      'Suspected eosinophilic or necrotising myocarditis',
      'Suspected infiltrative disease (amyloid, sarcoid) when non-invasive tests are inconclusive',
      'Unexplained cardiomyopathy with ventricular arrhythmias or conduction disease',
    ],
    contraindications: [
      'RV thrombus',
      'Uncorrected coagulopathy or full anticoagulation (relative)',
      'Mechanical tricuspid valve',
      'Recent RV infarction or very thin RV wall',
      'Severe pulmonary hypertension (relative — higher risk if perforation occurs)',
    ],
    anatomy: [
      'Route: SVC (or IVC) → RA → across the tricuspid valve → RV septum',
      'The septum is thick and safer; the RV free wall is thin (~3–5 mm) and perforates easily',
      'Tricuspid chordae can be caught, causing tricuspid regurgitation',
      'The right bundle branch runs along the septum — transient RBBB or AV block can occur',
    ],
    accessSite:
      'Right internal jugular vein (most common) or femoral vein with a long sheath, ultrasound-guided; LV biopsy via femoral or radial artery occasionally',
    steps: [
      {
        title: 'Indication and consent',
        description: 'Confirm the biopsy will change management and correct coagulopathy',
      },
      {
        title: 'Venous access',
        description: 'Ultrasound-guided RIJ or femoral venous sheath',
      },
      {
        title: 'Optional hemodynamics',
        description: 'Right heart pressures and cardiac output, especially in transplant patients',
      },
      {
        title: 'Cross the tricuspid valve',
        description: 'Advance the bioptome or long sheath into the RV under fluoroscopy ± echo',
      },
      {
        title: 'Target the septum',
        description: 'Confirm septal orientation and avoid the free wall and apex',
      },
      {
        title: 'Take samples',
        description: 'Open the jaws, contact the septum (PVCs confirm contact), close and withdraw; repeat for ~4–6 samples',
      },
      {
        title: 'Process samples',
        description: 'Place samples in formalin and other media for specialised testing',
      },
      {
        title: 'Check for effusion',
        description: 'Echo after the procedure to exclude pericardial effusion',
      },
    ],
    ecg: [
      'PVCs confirm myocardial contact',
      'Transient RBBB, AV block or non-sustained VT may occur',
      'Pre-existing LBBB raises the risk of complete heart block if RBBB develops',
      'Atrial arrhythmias may occur during RA passage',
    ],
    equipment: [
      'Bioptome (flexible forceps)',
      'Long sheath',
      'Fluoroscopy and echo',
      'Specimen containers (formalin, glutaraldehyde, frozen)',
      'Pericardiocentesis kit immediately available',
    ],
    complications: [
      'RV perforation and tamponade (uncommon, ~0.5% or less)',
      'Tricuspid valve injury and regurgitation, especially after repeated transplant biopsies',
      'Arrhythmias and transient heart block',
      'Pneumothorax or carotid puncture with jugular access',
      'Air or thrombus embolism',
    ],
    postCare: [
      'Echo to exclude pericardial effusion',
      'Monitor vital signs and access-site hemostasis',
      'Review results: ISHLT grading of cellular (0R–3R) and antibody-mediated rejection in transplants',
      'Start targeted therapy (e.g. immunosuppression for giant cell myocarditis)',
    ],
    teaching: [
      'Giant cell myocarditis causes rapid HF, VT and heart block — EMB diagnosis and immunosuppression improve survival',
      'Gene-expression profiling and donor-derived cell-free DNA reduce surveillance biopsies in low-risk transplant recipients',
      'Target the septum, not the free wall',
      'A negative biopsy does not exclude patchy disease',
    ],
    targetStructures: ['interventricular-septum', 'right-ventricle', 'tricuspid-valve', 'svc', 'right-atrium'],
    relatedConditions: ['dilated-cardiomyopathy', 'hfref', 'third-degree-av-block', 'monomorphic-vt', 'cardiac-tamponade'],
  },
};
