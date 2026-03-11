'use client';

import React from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useSceneStore } from '@/store/useSceneStore';
import { useConditionStore } from '@/store/useConditionStore';
import { useProcedureStore } from '@/store/useProcedureStore';

const TABS = [
  'overview', 'anatomy', 'physiology', 'symptoms', 'ecg',
  'imaging', 'medications', 'field-care', 'hospital-care',
  'cardiology-care', 'procedure', 'complications', 'teaching',
];

// Content data for anatomy structures
const ANATOMY_INFO: Record<string, { title: string; summary: string; details: string[] }> = {
  // ─── Chambers ───────────────────────────────────────────────
  'right-atrium': {
    title: 'Right Atrium',
    summary: 'Receives deoxygenated blood from the systemic circulation via the SVC and IVC.',
    details: [
      'Thin-walled chamber receiving venous return',
      'Contains the SA node (primary pacemaker)',
      'Crista terminalis divides smooth from trabeculated portions',
      'Coronary sinus drains into the posterior floor',
      'Eustachian valve guards the IVC ostium',
    ],
  },
  'left-atrium': {
    title: 'Left Atrium',
    summary: 'Receives oxygenated blood from the pulmonary veins and passes it to the left ventricle.',
    details: [
      'Smooth-walled posterior chamber',
      'Receives 4 pulmonary veins (RS, RI, LS, LI)',
      'Left atrial appendage is a common site for thrombus in AF',
      'Posterior wall is adjacent to esophagus (TEE window)',
      'Important target for AF ablation (pulmonary vein isolation)',
    ],
  },
  'right-ventricle': {
    title: 'Right Ventricle',
    summary: 'Pumps deoxygenated blood to the lungs via the pulmonary artery.',
    details: [
      'Crescent-shaped chamber wrapping around the LV',
      'Thinner wall than LV (lower pressure system)',
      'Contains moderator band with RBB conduction',
      'RVOT leads to pulmonary valve',
      'Vulnerable to pressure overload in PE / pulmonary HTN',
    ],
  },
  'left-ventricle': {
    title: 'Left Ventricle',
    summary: 'The main pumping chamber of the heart, ejecting oxygenated blood into the aorta.',
    details: [
      'Thick-walled (8-12mm) conical chamber',
      'Generates systemic arterial pressure',
      'Papillary muscles anchor mitral leaflets via chordae',
      'Normal EF: 55-70%',
      'AHA 17-segment model used for wall motion assessment',
      'Apex is the most distal point, often supplied by LAD',
    ],
  },
  'right-atrial-appendage': {
    title: 'Right Atrial Appendage',
    summary: 'A small, ear-shaped pouch extending from the right atrium.',
    details: [
      'Trabeculated muscular pouch (auricle)',
      'Contains pectinate muscles',
      'Less prone to thrombus than LAA',
      'Landmark for identifying the morphologic right atrium',
      'Can be used for temporary pacing lead placement',
    ],
  },
  'left-atrial-appendage': {
    title: 'Left Atrial Appendage',
    summary: 'A small pouch arising from the left atrium, clinically significant as a common site for thrombus formation.',
    details: [
      'Primary site of thrombus formation in atrial fibrillation (>90%)',
      'Variable morphology: chicken wing, cactus, windsock, cauliflower',
      'Target for LAA occlusion devices (Watchman, Amulet)',
      'Produces atrial natriuretic peptide (ANP)',
      'Surgical ligation or exclusion performed during cardiac surgery',
    ],
  },
  // ─── Septa & Landmarks ─────────────────────────────────────
  'interatrial-septum': {
    title: 'Interatrial Septum',
    summary: 'The wall dividing the right and left atria, containing the fossa ovalis.',
    details: [
      'Separates the two atrial chambers',
      'Contains the fossa ovalis (thinnest region)',
      'Site for transseptal puncture in left-sided interventions',
      'ASDs and PFOs occur in this structure',
      'Best visualized on subcostal echocardiographic views',
    ],
  },
  'interventricular-septum': {
    title: 'Interventricular Septum',
    summary: 'The muscular and membranous wall separating the right and left ventricles.',
    details: [
      'Muscular portion: thick, contracts with systole',
      'Membranous portion: thin fibrous tissue near AV valves',
      'Contains the bundle of His and proximal bundle branches',
      'VSDs most commonly occur in membranous portion',
      'Dual blood supply from LAD (anterior) and PDA (posterior)',
    ],
  },
  'fossa-ovalis': {
    title: 'Fossa Ovalis',
    summary: 'An oval depression in the interatrial septum, remnant of the foramen ovale.',
    details: [
      'Thinnest portion of the interatrial septum',
      'Remnant of the embryonic foramen ovale',
      'Patent foramen ovale (PFO) occurs when it fails to close completely',
      'Target site for transseptal catheterization',
      'Important landmark in structural heart interventions',
    ],
  },
  'apex': {
    title: 'Apex',
    summary: 'The most inferior and lateral tip of the left ventricle.',
    details: [
      'Formed primarily by the left ventricle',
      'Located at the 5th intercostal space, midclavicular line',
      'Point of maximal impulse (PMI) palpable here',
      'Supplied by the distal LAD artery',
      'Common site for apical ballooning in Takotsubo cardiomyopathy',
      'LV apical thrombus can form after anterior MI',
    ],
  },
  'base-of-heart': {
    title: 'Base of Heart',
    summary: 'The superior broad portion of the heart where the great vessels attach.',
    details: [
      'Formed primarily by the left atrium posteriorly',
      'Great vessels enter and exit at the base',
      'Opposite the apex; faces posteriorly and superiorly',
      'Contains the fibrous skeleton and valve annuli',
      'Important landmark for echocardiographic measurements',
    ],
  },
  // ─── Valves ─────────────────────────────────────────────────
  'mitral-annulus': {
    title: 'Mitral Valve',
    summary: 'A bicuspid valve between the left atrium and left ventricle preventing backflow during systole.',
    details: [
      'Two leaflets: anterior (aortic) and posterior (mural)',
      'Annulus is saddle-shaped and D-shaped',
      'Supported by anterolateral and posteromedial papillary muscles',
      'Most common valve affected by rheumatic disease',
      'Mitral regurgitation and stenosis are major pathologies',
      'Target for MitraClip/TEER, surgical repair, or replacement',
    ],
  },
  'aortic-valve-rcc': {
    title: 'Aortic Valve',
    summary: 'A trileaflet semilunar valve between the left ventricle and ascending aorta.',
    details: [
      'Three cusps: right coronary (RCC), left coronary (LCC), non-coronary (NCC)',
      'Coronary artery ostia arise from the sinuses of Valsalva',
      'No chordae tendineae; opens/closes passively by pressure gradient',
      'Aortic stenosis is the most common valvular disease requiring intervention',
      'TAVR has revolutionized treatment of severe aortic stenosis',
      'Bicuspid aortic valve is the most common congenital valve defect (1-2%)',
    ],
  },
  'tricuspid-annulus': {
    title: 'Tricuspid Valve',
    summary: 'A three-leaflet valve between the right atrium and right ventricle.',
    details: [
      'Three leaflets: anterior, posterior, and septal',
      'Largest valve annulus in the heart',
      'AV node is located near the septal leaflet (Koch triangle)',
      'Functional TR common with RV dilation',
      'Annuloplasty is the main surgical repair technique',
      'Endocarditis of this valve often associated with IV drug use',
    ],
  },
  'pulmonary-valve-cusps': {
    title: 'Pulmonary Valve',
    summary: 'A trileaflet semilunar valve between the right ventricle and pulmonary trunk.',
    details: [
      'Three cusps: anterior, right, and left',
      'Lowest pressure valve in the heart',
      'Pulmonary stenosis often congenital; can be treated with balloon valvuloplasty',
      'Pulmonary regurgitation common after Tetralogy of Fallot repair',
      'Ross procedure: pulmonary valve used to replace diseased aortic valve',
    ],
  },
  // ─── Great Vessels ──────────────────────────────────────────
  'ascending-aorta': {
    title: 'Ascending Aorta',
    summary: 'The first segment of the aorta, arising from the left ventricle and giving rise to the coronary arteries.',
    details: [
      'Arises from the aortic root/valve complex',
      'Contains the sinuses of Valsalva and coronary ostia',
      'Normal diameter: 2.1-3.5 cm',
      'Aneurysm risk increases with bicuspid aortic valve, Marfan syndrome',
      'Site of acute type A aortic dissection (surgical emergency)',
    ],
  },
  'aortic-arch': {
    title: 'Aortic Arch',
    summary: 'The curved portion of the aorta giving rise to the brachiocephalic, left carotid, and left subclavian arteries.',
    details: [
      'Three major branches in typical anatomy',
      'Aortic isthmus: common site for coarctation',
      'Ligamentum arteriosum connects to pulmonary artery',
      'Recurrent laryngeal nerve loops around the arch',
      'Bovine arch variant present in ~15% of population',
    ],
  },
  'pulmonary-trunk': {
    title: 'Pulmonary Trunk',
    summary: 'The large artery carrying deoxygenated blood from the right ventricle to the lungs.',
    details: [
      'Bifurcates into right and left pulmonary arteries',
      'Normally low-pressure system (25/10 mmHg)',
      'Dilates in pulmonary hypertension',
      'Pulmonary embolism lodges at bifurcation (saddle PE)',
      'Connected to aorta by ligamentum arteriosum (ductus remnant)',
    ],
  },
  'svc': {
    title: 'Superior Vena Cava',
    summary: 'The large vein returning deoxygenated blood from the upper body to the right atrium.',
    details: [
      'Formed by junction of right and left brachiocephalic veins',
      'Enters the superior aspect of the right atrium',
      'SVC syndrome: obstruction causes facial/upper extremity edema',
      'Common site for pacing and central line placement',
      'Anomalous pulmonary vein drainage can connect to SVC (sinus venosus ASD)',
    ],
  },
  'ivc': {
    title: 'Inferior Vena Cava',
    summary: 'The large vein returning deoxygenated blood from the lower body to the right atrium.',
    details: [
      'Enters the inferior-posterior right atrium',
      'Guarded by the Eustachian valve remnant',
      'IVC diameter and collapsibility used to estimate RA pressure',
      'IVC filters placed for PE prophylaxis when anticoagulation contraindicated',
      'Important access route for cardiac catheterization (femoral approach)',
    ],
  },
  // ─── Pericardium & Layers ───────────────────────────────────
  'fibrous-pericardium': {
    title: 'Fibrous Pericardium',
    summary: 'The tough, non-distensible outer layer of the pericardial sac.',
    details: [
      'Anchored to the great vessels superiorly and diaphragm inferiorly',
      'Limits acute cardiac dilation',
      'Pericardial space normally contains 15-50 mL of fluid',
      'Rapid fluid accumulation causes tamponade physiology',
      'Surgically opened in pericardiectomy for constrictive pericarditis',
    ],
  },
  'epicardium': {
    title: 'Epicardium (Visceral Pericardium)',
    summary: 'The outermost layer of the heart wall, also known as the visceral pericardium.',
    details: [
      'Serous membrane covering the heart surface',
      'Contains the coronary arteries and cardiac veins',
      'Epicardial fat accumulates along coronary sulci',
      'Inflammation causes pericarditis (friction rub, ST changes)',
      'Epicardial mapping/ablation used for refractory VT',
    ],
  },
  'myocardium': {
    title: 'Myocardium',
    summary: 'The thick middle muscular layer of the heart wall responsible for contraction.',
    details: [
      'Composed of cardiac myocytes with intercalated discs',
      'LV myocardium is 8-12mm thick; RV is 3-5mm',
      'Spiral fiber orientation optimizes ejection mechanics',
      'Myocardial infarction: irreversible necrosis from ischemia',
      'Myocarditis: inflammatory infiltration (viral, autoimmune)',
      'Target tissue for cardiac MRI late gadolinium enhancement',
    ],
  },
  'endocardium': {
    title: 'Endocardium',
    summary: 'The smooth inner lining of the heart chambers and valves.',
    details: [
      'Continuous with vascular endothelium',
      'Lines all chambers, valves, and chordae tendineae',
      'Endocarditis: bacterial/fungal infection of endocardial surface',
      'Vegetations typically form on valve leaflets',
      'Subendocardial ischemia occurs first (watershed zone)',
    ],
  },
  // ─── Subvalvular ───────────────────────────────────────────
  'anterolateral-papillary-muscle': {
    title: 'Anterolateral Papillary Muscle',
    summary: 'A muscular projection in the LV anchoring chordae tendineae to the mitral valve.',
    details: [
      'Dual blood supply from LAD and LCx (more resilient to ischemia)',
      'Attaches chordae to both anterior and posterior mitral leaflets',
      'Less commonly ruptured than posteromedial papillary muscle',
      'Papillary muscle dysfunction causes mitral regurgitation',
      'Visualized on echocardiography in short-axis views',
    ],
  },
  'posteromedial-papillary-muscle': {
    title: 'Posteromedial Papillary Muscle',
    summary: 'A muscular projection in the LV, more vulnerable to ischemia than its anterolateral counterpart.',
    details: [
      'Single blood supply (typically from PDA or RCA)',
      'More vulnerable to ischemic rupture than AL papillary',
      'Rupture is a mechanical complication of inferior MI',
      'Causes acute severe mitral regurgitation (surgical emergency)',
      'Attaches chordae to both mitral leaflets',
    ],
  },
  'moderator-band': {
    title: 'Moderator Band',
    summary: 'A muscular band in the right ventricle carrying part of the conduction system.',
    details: [
      'Connects the interventricular septum to the anterior papillary muscle',
      'Carries the right bundle branch to the RV free wall',
      'Important echocardiographic landmark for identifying the RV',
      'Distinguishes the morphologic RV from the LV',
      'Can be prominent and mistaken for thrombus on imaging',
    ],
  },
  'crista-terminalis': {
    title: 'Crista Terminalis',
    summary: 'A ridge of muscle in the right atrium separating the smooth and trabeculated portions.',
    details: [
      'Separates sinus venarum (smooth) from pectinate muscles (trabeculated)',
      'Corresponds to the sulcus terminalis externally',
      'Can be a source of atrial tachycardia (crista terminalis tachycardia)',
      'Important anatomic landmark during EP studies',
      'Can be prominent and simulate a mass on imaging',
    ],
  },
  // ─── Coronary Arteries - Left ──────────────────────────────
  'lmca': {
    title: 'Left Main Coronary Artery (LMCA)',
    summary: 'The short trunk arising from the left aortic sinus, bifurcating into the LAD and LCx.',
    details: [
      'Typically 1-2.5 cm in length',
      'Supplies ~75% of the LV myocardium',
      'Left main disease is high-risk; often treated with CABG',
      'Stenosis >50% considered significant',
      'Trifurcation pattern includes ramus intermedius in ~15%',
    ],
  },
  'lad-proximal': {
    title: 'Proximal LAD',
    summary: 'The proximal segment of the left anterior descending artery, before the first septal perforator.',
    details: [
      'Supplies the anterior wall and anterior septum',
      'Gives off diagonal and septal perforator branches',
      'Proximal LAD occlusion causes extensive anterior STEMI',
      'ST elevation in V1-V4 on ECG',
      'High-risk lesion, often requires PCI or CABG',
    ],
  },
  'lad-mid': {
    title: 'Mid LAD',
    summary: 'The middle segment of the LAD, coursing in the anterior interventricular groove.',
    details: [
      'Located between first septal and apex',
      'Gives off diagonal branches (D1, D2)',
      'Supplies the anterior and anteroseptal walls',
      'Wellens pattern on ECG suggests critical mid-LAD stenosis',
      'Often amenable to PCI with drug-eluting stent',
    ],
  },
  'lad-distal': {
    title: 'Distal LAD',
    summary: 'The terminal segment of the LAD, wrapping around the apex.',
    details: [
      'Wraps around the cardiac apex in most patients',
      'Supplies the apical segments',
      'Occlusion may cause apical MI',
      'Smaller caliber; less commonly stented',
      'Can be target for LIMA graft in CABG',
    ],
  },
  'd1': {
    title: 'First Diagonal Branch (D1)',
    summary: 'The first major diagonal branch of the LAD supplying the anterolateral wall.',
    details: [
      'Arises from the LAD at an acute angle',
      'Supplies the anterolateral LV wall',
      'Occlusion can cause lateral ST changes (I, aVL)',
      'May be large enough to warrant revascularization',
      'Important collateral pathway',
    ],
  },
  'd2': {
    title: 'Second Diagonal Branch (D2)',
    summary: 'A smaller diagonal branch of the LAD supplying the lateral wall.',
    details: [
      'Smaller caliber than D1 typically',
      'Supplies the lateral wall',
      'Variable anatomy; may be absent',
      'Occlusion causes limited ischemic territory',
    ],
  },
  'lcx-proximal': {
    title: 'Left Circumflex Artery (LCx)',
    summary: 'Courses in the left AV groove, supplying the lateral and posterior walls.',
    details: [
      'Runs in the left atrioventricular groove',
      'Gives off obtuse marginal (OM) branches',
      'Supplies lateral and posterolateral LV walls',
      'May be dominant in ~15% (supplying PDA)',
      'Occlusion: lateral STEMI (I, aVL, V5-V6) or posterior MI',
    ],
  },
  'om1': {
    title: 'First Obtuse Marginal (OM1)',
    summary: 'The first major branch of the LCx supplying the lateral wall.',
    details: [
      'Major branch of the circumflex artery',
      'Supplies the lateral LV free wall',
      'Occlusion causes lateral wall ischemia',
      'ECG changes in leads I, aVL, V5-V6',
      'Often a target for PCI or saphenous vein graft in CABG',
    ],
  },
  'om2': {
    title: 'Second Obtuse Marginal (OM2)',
    summary: 'A branch of the LCx supplying the posterolateral wall.',
    details: [
      'Supplies the posterolateral wall',
      'Variable in size and presence',
      'May overlap territory with PDA in left-dominant systems',
      'Contributes to lateral wall perfusion',
    ],
  },
  // ─── Coronary Arteries - Right ─────────────────────────────
  'rca-proximal': {
    title: 'Proximal RCA',
    summary: 'The first segment of the right coronary artery as it exits the right aortic sinus.',
    details: [
      'Arises from the right coronary cusp of the aorta',
      'Gives off the conus branch and SA nodal artery',
      'Supplies the right atrium and proximal RV',
      'Proximal RCA lesions can cause inferior STEMI',
      'Accessed easily during catheterization',
    ],
  },
  'rca-mid': {
    title: 'Mid RCA',
    summary: 'The middle segment coursing in the right AV groove along the acute margin.',
    details: [
      'Runs in the right atrioventricular groove',
      'Gives off the acute marginal branch',
      'Supplies the RV free wall',
      'Most common site for RCA atherosclerosis',
      'Occlusion causes inferior STEMI (II, III, aVF)',
    ],
  },
  'rca-distal': {
    title: 'Distal RCA',
    summary: 'The terminal segment at the crux of the heart, giving rise to the PDA in right-dominant anatomy.',
    details: [
      'Located at the crux (junction of AV and interventricular grooves)',
      'Gives rise to PDA in right-dominant hearts (~85%)',
      'Supplies the AV node in right-dominant circulation',
      'Occlusion can cause AV block (inferior MI with bradycardia)',
      'Bifurcates into PDA and posterolateral branches',
    ],
  },
  'pda': {
    title: 'Posterior Descending Artery (PDA)',
    summary: 'Courses in the posterior interventricular groove, supplying the inferior septum.',
    details: [
      'Arises from RCA in ~85% (right-dominant)',
      'Arises from LCx in ~8% (left-dominant)',
      'Co-dominant in ~7% of patients',
      'Supplies the inferior septum via septal perforators',
      'Determines coronary dominance classification',
    ],
  },
  'am-branch': {
    title: 'Acute Marginal Branch',
    summary: 'A branch of the RCA supplying the right ventricular free wall.',
    details: [
      'Arises from the mid-RCA at the acute margin',
      'Supplies the RV free wall',
      'Important for RV perfusion',
      'RV infarction occurs when this territory is compromised',
      'Can serve as collateral pathway to LAD territory',
    ],
  },
  // ─── Conduction System ─────────────────────────────────────
  'sa-node': {
    title: 'Sinoatrial (SA) Node',
    summary: 'The primary pacemaker of the heart, located in the right atrium near the SVC junction.',
    details: [
      'Intrinsic firing rate: 60-100 bpm',
      'Located at the junction of SVC and right atrium',
      'Blood supply: SA nodal artery (from RCA in 60%, LCx in 40%)',
      'Dysfunction causes sick sinus syndrome',
      'Influenced by autonomic nervous system (sympathetic/parasympathetic)',
    ],
  },
  'av-node': {
    title: 'Atrioventricular (AV) Node',
    summary: 'The secondary pacemaker that delays conduction between atria and ventricles.',
    details: [
      'Located in Koch triangle (septal leaflet, coronary sinus, tendon of Todaro)',
      'Intrinsic rate: 40-60 bpm as backup pacemaker',
      'PR interval reflects AV nodal conduction delay',
      'Blood supply: AV nodal artery (from RCA in 85%)',
      'Site of AVNRT and target for slow-pathway ablation',
      'AV block occurs with disease or ischemia of this node',
    ],
  },
  'bundle-of-his': {
    title: 'Bundle of His',
    summary: 'The conduction pathway connecting the AV node to the bundle branches in the interventricular septum.',
    details: [
      'Penetrates the central fibrous body',
      'Located at the membranous interventricular septum',
      'Dual blood supply (AV nodal and septal perforator arteries)',
      'His bundle pacing is a physiologic pacing alternative',
      'Disease causes infra-nodal AV block',
    ],
  },
  'right-bundle-branch': {
    title: 'Right Bundle Branch',
    summary: 'A slender fascicle conducting impulses to the right ventricle.',
    details: [
      'Courses along the right side of the interventricular septum',
      'Travels via the moderator band to the RV free wall',
      'RBBB pattern: rsR\' in V1, wide S in I/V6',
      'Can be rate-dependent (aberrant conduction)',
      'New RBBB with chest pain: consider PE or anterior MI',
    ],
  },
  'left-bundle-branch': {
    title: 'Left Bundle Branch',
    summary: 'A broad conduction pathway that splits into anterior and posterior fascicles for the left ventricle.',
    details: [
      'Fans out over the left septal surface',
      'Divides into anterior and posterior fascicles',
      'LBBB pattern: broad notched R in I/V5-V6, QS/rS in V1',
      'New LBBB may indicate acute MI (Sgarbossa criteria)',
      'LBBB alters the sequence of ventricular depolarization',
      'LBBB with heart failure: candidate for CRT',
    ],
  },
  'left-anterior-fascicle': {
    title: 'Left Anterior Fascicle',
    summary: 'The anterior division of the left bundle branch, supplying the anterosuperior LV wall.',
    details: [
      'Thinner than the posterior fascicle (more vulnerable)',
      'Single blood supply (LAD septal perforators)',
      'LAFB: left axis deviation (-45 to -90 degrees)',
      'Most common fascicular block',
      'Combined with RBBB = bifascicular block',
    ],
  },
  'left-posterior-fascicle': {
    title: 'Left Posterior Fascicle',
    summary: 'The posterior division of the left bundle branch, supplying the inferoposterior LV wall.',
    details: [
      'Thicker with dual blood supply (LAD + RCA/PDA)',
      'Less commonly blocked in isolation (requires significant disease)',
      'LPFB: right axis deviation (>+110 degrees)',
      'Must exclude RVH and other causes of right axis deviation',
      'LPFB + RBBB = bifascicular block (higher risk for complete block)',
    ],
  },
  'purkinje-network-rv': {
    title: 'Purkinje Network (RV)',
    summary: 'The terminal conduction fibers distributed throughout the right ventricular endocardium.',
    details: [
      'Fastest conduction velocity in the heart (2-4 m/s)',
      'Ensures rapid, coordinated RV depolarization',
      'Can serve as source of ventricular arrhythmias',
      'Purkinje-related VT can occur in structurally normal hearts',
      'Target for catheter ablation of idiopathic VF',
    ],
  },
  'purkinje-network-lv': {
    title: 'Purkinje Network (LV)',
    summary: 'The terminal conduction fibers distributed throughout the left ventricular endocardium.',
    details: [
      'Extensive subendocardial distribution in the LV',
      'Ensures synchronous LV contraction from apex to base',
      'Purkinje fibers can act as tertiary pacemakers (20-40 bpm)',
      'Involved in fascicular VT (verapamil-sensitive)',
      'Can trigger ventricular fibrillation in certain channelopathies',
    ],
  },
};

const CONDITION_INFO: Record<string, { title: string; summary: string; pathophys: string; ecg: string; treatment: string }> = {
  'anterior-stemi': {
    title: 'Anterior STEMI',
    summary: 'ST-elevation myocardial infarction affecting the anterior wall, typically from LAD occlusion.',
    pathophys: 'Acute thrombotic occlusion of the LAD causes transmural ischemia of the anterior wall, septum, and often the apex. Without reperfusion, myocardial necrosis progresses within hours.',
    ecg: 'ST elevation in V1-V4 (may extend to V5-V6). Reciprocal ST depression in inferior leads (II, III, aVF). May see hyperacute T waves early.',
    treatment: 'Emergent reperfusion: primary PCI (preferred) or fibrinolysis if PCI not available within 120 minutes. Dual antiplatelet therapy, anticoagulation, beta-blocker, statin, ACE inhibitor.',
  },
  'atrial-fibrillation': {
    title: 'Atrial Fibrillation',
    summary: 'Chaotic atrial electrical activity causing irregularly irregular ventricular response.',
    pathophys: 'Multiple wavelets of reentry or focal triggers (often from pulmonary veins) create disorganized atrial depolarization. AV node conducts irregularly to ventricles.',
    ecg: 'Absent P waves, irregular fibrillatory baseline, irregularly irregular RR intervals, narrow QRS (unless aberrant conduction).',
    treatment: 'Rate control (beta-blocker or CCB), rhythm control (amiodarone, cardioversion, ablation), anticoagulation for stroke prevention (CHA2DS2-VASc scoring).',
  },
};

export default function RightPanel({ style }: { style?: React.CSSProperties }) {
  const { rightPanelOpen, rightPanelTab, setRightPanelTab, learningLevel } = useAppStore();
  const { selectedStructureId } = useSceneStore();
  const { selectedConditionId } = useConditionStore();
  const { selectedProcedureId } = useProcedureStore();

  if (!rightPanelOpen) return null;

  const anatomyInfo = selectedStructureId ? ANATOMY_INFO[selectedStructureId] : null;
  const conditionInfo = selectedConditionId ? CONDITION_INFO[selectedConditionId] : null;

  return (
    <aside style={style} className="bg-cardiac-panel border-t border-slate-700 flex flex-col shrink-0 overflow-hidden">
      {/* Tabs */}
      <div className="flex flex-wrap border-b border-slate-700 px-1 py-1 gap-0.5 shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setRightPanelTab(tab)}
            className={`px-2 py-1 text-[10px] rounded capitalize transition-colors ${
              rightPanelTab === tab
                ? 'bg-cardiac-accent/20 text-cardiac-accent'
                : 'text-slate-500 hover:text-white'
            }`}
          >
            {tab.replace('-', ' ')}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 text-xs text-slate-300 space-y-3">
        {/* Welcome / empty state */}
        {!anatomyInfo && !conditionInfo && !selectedProcedureId && (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">♥</div>
            <h3 className="text-sm font-semibold text-white mb-2">Cardiac Education Platform</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Select a structure, condition, or procedure from the left panel to view detailed information.
            </p>
            <div className="mt-4 p-3 bg-cardiac-dark rounded-lg text-left">
              <p className="text-cardiac-accent text-[10px] font-semibold mb-1">EDUCATIONAL DISCLAIMER</p>
              <p className="text-slate-500 text-[10px] leading-relaxed">
                This is an educational simulation only. Not intended for diagnosis or treatment.
                Waveforms and animations are representative teaching models.
              </p>
            </div>
            <div className="mt-3 text-slate-500 text-[10px]">
              Current Level: {['', 'EMT', 'Paramedic', 'ED/ICU', 'Cardiology', 'Interventional'][learningLevel]}
            </div>
          </div>
        )}

        {/* Anatomy detail */}
        {anatomyInfo && (
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">{anatomyInfo.title}</h3>
            <p className="text-slate-300 mb-3 leading-relaxed">{anatomyInfo.summary}</p>

            <div className="space-y-2">
              <h4 className="text-[10px] font-semibold text-cardiac-accent uppercase tracking-wider">Key Points</h4>
              <ul className="space-y-1">
                {anatomyInfo.details.map((d, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-cardiac-accent mt-0.5">•</span>
                    <span className="text-slate-400 leading-relaxed">{d}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 p-2 bg-cardiac-dark rounded">
              <h4 className="text-[10px] font-semibold text-cardiac-accent uppercase mb-1">Learning Level</h4>
              <p className="text-slate-500 text-[10px]">
                Viewing at {['', 'EMT', 'Paramedic', 'ED/ICU', 'Cardiology', 'Interventional'][learningLevel]} level
              </p>
            </div>
          </div>
        )}

        {/* Condition detail */}
        {conditionInfo && (
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">{conditionInfo.title}</h3>
            <p className="text-slate-300 mb-3 leading-relaxed">{conditionInfo.summary}</p>

            {rightPanelTab === 'overview' && (
              <div className="space-y-3">
                <Section title="Pathophysiology" content={conditionInfo.pathophys} />
                <Section title="ECG Findings" content={conditionInfo.ecg} />
                <Section title="Treatment" content={conditionInfo.treatment} />
              </div>
            )}

            {rightPanelTab === 'ecg' && (
              <Section title="ECG Interpretation" content={conditionInfo.ecg} />
            )}

            {rightPanelTab === 'medications' && (
              <Section title="Treatment Approach" content={conditionInfo.treatment} />
            )}
          </div>
        )}

        {/* Procedure detail */}
        {selectedProcedureId && !conditionInfo && (
          <div>
            <h3 className="text-sm font-semibold text-white mb-1 capitalize">
              {selectedProcedureId.replace(/-/g, ' ')}
            </h3>
            <p className="text-slate-400 mb-3">
              Select steps from the procedure panel to view the simulation.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}

function Section({ title, content }: { title: string; content: string }) {
  return (
    <div className="p-2 bg-cardiac-dark rounded">
      <h4 className="text-[10px] font-semibold text-cardiac-accent uppercase tracking-wider mb-1">{title}</h4>
      <p className="text-slate-400 leading-relaxed">{content}</p>
    </div>
  );
}
