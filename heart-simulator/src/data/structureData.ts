/**
 * Anatomy structure knowledge base for the info panel.
 * Major chambers have full per-tab content; other structures use a
 * summary + details record with generated tab fallbacks.
 */

// ─── Tab-specific content for anatomy structures ────────────────────────
export interface StructureTabData {
  title: string;
  overview: string[];
  anatomy: string[];
  physiology: string[];
  symptoms: string[];
  ecg: string[];
  imaging: string[];
  medications: string[];
  'field-care': string[];
  'hospital-care': string[];
  'cardiology-care': string[];
  procedure: string[];
  complications: string[];
  teaching: string[];
}

export const STRUCTURE_DATA: Record<string, StructureTabData> = {
  'right-atrium': {
    title: 'Right Atrium',
    overview: ['Thin-walled chamber receiving venous return', 'Contains the SA node (primary pacemaker)', 'Crista terminalis divides smooth from trabeculated portions', 'Coronary sinus drains into the posterior floor', 'Eustachian valve guards the IVC ostium'],
    anatomy: ['Wall thickness: 2-3mm', 'Receives SVC superiorly and IVC inferiorly', 'Koch triangle: AV node landmark bounded by coronary sinus, tendon of Todaro, and tricuspid annulus', 'Pectinate muscles line the anterior wall and appendage', 'Sinus venarum: smooth posterior wall derived from sinus venosus'],
    physiology: ['Reservoir function: stores venous return during ventricular systole', 'Conduit function: passive filling of RV in early diastole', 'Booster pump: atrial contraction (atrial kick) contributes 15-25% of ventricular filling', 'RA pressure normally 2-6 mmHg (CVP)', 'A, C, and V waves visible on RA pressure tracing'],
    symptoms: ['RA enlargement may cause no direct symptoms', 'Elevated RA pressure: JVD, peripheral edema, hepatic congestion', 'RA thrombus: can cause PE, may be seen on echo as mobile mass', 'Atrial flutter: sawtooth pattern, often originates from RA isthmus'],
    ecg: ['P wave represents atrial depolarization', 'RA enlargement: peaked P waves >2.5mm in leads II, III, aVF (P pulmonale)', 'Best seen in lead V1 (initial positive deflection of biphasic P wave)', 'RA rhythm: inverted P waves in inferior leads suggest low atrial focus'],
    imaging: ['Echo: subcostal and apical 4-chamber views', 'Normal RA area: 10-18 cm\u00B2', 'CT/MRI: excellent for RA masses, thrombus, and congenital anomalies', 'TEE: superior for interatrial septum and appendage evaluation'],
    medications: ['Anticoagulation for RA thrombus (heparin, warfarin, DOACs)', 'Diuretics for RA congestion (furosemide, bumetanide)', 'Rate control for atrial arrhythmias (beta-blockers, CCBs, digoxin)', 'Antiarrhythmics for rhythm control (amiodarone, flecainide, sotalol)'],
    'field-care': ['Assess JVP for RA pressure estimation', 'Right-sided ECG leads for RV/RA pathology', 'Fluid resuscitation cautiously if RA pressure low', 'Recognize signs of right heart failure: JVD, hepatomegaly, edema'],
    'hospital-care': ['Central venous catheter for CVP monitoring', 'PA catheter for RA pressure measurement', 'Echocardiography for RA size, function, and masses', 'IV diuretics for decompensated right heart failure'],
    'cardiology-care': ['Electrophysiology study: RA mapping for atrial flutter', 'CTI ablation for typical atrial flutter (RA isthmus)', 'TEE-guided cardioversion for atrial arrhythmias', 'RA lead placement for pacemaker/ICD'],
    procedure: ['Right heart catheterization: measures RA pressure', 'EP study: diagnostic catheters placed in RA', 'CTI ablation: linear lesion across cavotricuspid isthmus', 'Pacemaker lead: screwed into RA appendage or septum'],
    complications: ['RA perforation during catheter placement', 'RA thrombus with chronic indwelling catheters', 'Atrial flutter from surgical scarring (incisional reentry)', 'RA dilation with chronic volume overload (ASD, TR)'],
    teaching: ['The RA is the first chamber to receive deoxygenated blood returning from the body', 'The SA node in the RA sets the normal heart rhythm at 60-100 bpm', 'Koch triangle is the key landmark for understanding AV node location', 'RA pressure (CVP) is a critical hemodynamic parameter accessible via neck veins'],
  },
  'left-atrium': {
    title: 'Left Atrium',
    overview: ['Smooth-walled posterior chamber', 'Receives 4 pulmonary veins (RS, RI, LS, LI)', 'Left atrial appendage is a common site for thrombus in AF', 'Posterior wall is adjacent to esophagus (TEE window)', 'Important target for AF ablation (pulmonary vein isolation)'],
    anatomy: ['Wall thickness: 3mm', 'Four pulmonary veins enter posteriorly', 'LAA: trabeculated pouch with variable morphology', 'Posterior wall adjacent to esophagus', 'Mitral valve annulus forms the floor'],
    physiology: ['Reservoir: stores pulmonary venous return during LV systole', 'Conduit: passive LV filling in early diastole (E wave)', 'Booster pump: LA contraction (A wave) adds 15-25% filling', 'Normal LA pressure: 6-12 mmHg', 'Elevated LA pressure transmits to pulmonary veins causing congestion'],
    symptoms: ['Dyspnea from elevated LA pressure (pulmonary congestion)', 'Palpitations from atrial fibrillation', 'Stroke/TIA from LAA thrombus embolization', 'Hoarseness from LA compression of recurrent laryngeal nerve (Ortner syndrome)'],
    ecg: ['LA enlargement: wide, notched P wave >120ms in lead II (P mitrale)', 'Deep negative terminal portion of P wave in V1 (>1mm deep, >40ms wide)', 'Atrial fibrillation: absent P waves, irregularly irregular RR', 'LA origin focus: positive P in V1'],
    imaging: ['Echo: parasternal long axis and apical 4-chamber views', 'Normal LA diameter: 2.0-4.0 cm (parasternal)', 'Normal LA volume index: <34 mL/m\u00B2', 'TEE: gold standard for LAA thrombus detection', 'Cardiac MRI: LA fibrosis mapping for AF substrate'],
    medications: ['Anticoagulation for AF stroke prevention (DOACs preferred)', 'Antiarrhythmics: flecainide, propafenone, amiodarone, dofetilide', 'Rate control: beta-blocker, diltiazem, digoxin', 'Diuretics for LA pressure reduction'],
    'field-care': ['Assess for irregular pulse (AF)', 'Acute pulmonary edema management: upright positioning, O2, CPAP', 'Stroke assessment if suspected cardioembolic event', '12-lead ECG for rhythm identification'],
    'hospital-care': ['TEE to rule out LAA thrombus before cardioversion', 'IV amiodarone or ibutilide for pharmacologic cardioversion', 'Anticoagulation initiation (heparin bridge to DOAC)', 'Heart failure management with IV diuretics if congested'],
    'cardiology-care': ['Pulmonary vein isolation (PVI) ablation for AF', 'LAA occlusion device (Watchman) for stroke prevention', 'LA appendage ligation (surgical)', 'LA pressure monitoring (CardioMEMS in HF)'],
    procedure: ['PVI ablation: circumferential lesions around PV ostia', 'Cardioversion: synchronized shock for AF/flutter', 'TEE: probe in esophagus for LA/LAA visualization', 'Watchman device: catheter-delivered LAA occluder'],
    complications: ['Thromboembolism (stroke) from LAA thrombus', 'Pulmonary vein stenosis after ablation', 'Atrial-esophageal fistula (rare but fatal ablation complication)', 'LA roof perforation during transseptal access'],
    teaching: ['The LA is the most posterior cardiac chamber, explaining why TEE provides excellent views', 'AF is the most common sustained arrhythmia; LA is the primary source', '>90% of cardioembolic strokes in AF originate from the LAA', 'LA volume is a powerful predictor of cardiovascular outcomes'],
  },
  'right-ventricle': {
    title: 'Right Ventricle',
    overview: ['Crescent-shaped chamber wrapping around the LV', 'Thinner wall than LV (lower pressure system)', 'Contains moderator band with RBB conduction', 'RVOT leads to pulmonary valve', 'Vulnerable to pressure overload in PE / pulmonary HTN'],
    anatomy: ['Wall thickness: 3-5mm', 'Three portions: inlet, trabecular body, outlet (infundibulum)', 'Moderator band crosses from septum to anterior wall', 'Tricuspid valve forms the inlet', 'Conus arteriosus (infundibulum) leads to pulmonary valve'],
    physiology: ['Low-pressure pump: systolic 20-30 mmHg', 'Thin-walled, compliant: tolerates volume overload better than pressure overload', 'RV output = LV output (series circulation)', 'RV contraction: peristaltic pattern from apex to RVOT', 'RV is afterload-sensitive; acute PE can cause RV failure'],
    symptoms: ['RV failure: JVD, peripheral edema, ascites, hepatomegaly', 'Exercise intolerance from reduced cardiac output', 'Syncope in severe pulmonary hypertension', 'Chest pain from RV ischemia in RV infarction'],
    ecg: ['RV hypertrophy: right axis deviation, tall R in V1, deep S in V5-V6', 'RV strain: ST depression and T wave inversion in V1-V4 (right precordial)', 'RBBB: indicates conduction delay through RV', 'RV infarction: ST elevation in V4R'],
    imaging: ['Echo: RV focused apical view, parasternal views', 'TAPSE: tricuspid annular plane systolic excursion (normal >17mm)', 'RV fractional area change (normal >35%)', 'Cardiac MRI: gold standard for RV volumes and EF', 'CT: RV enlargement ratio >1.0 (RV/LV) suggests RV strain'],
    medications: ['Pulmonary vasodilators for pulmonary HTN (sildenafil, bosentan, epoprostenol)', 'Inotropes for acute RV failure (dobutamine, milrinone)', 'Diuretics for RV congestion', 'Avoid excessive fluid and vasodilators that drop preload'],
    'field-care': ['Right-sided ECG (V4R) for suspected RV infarction', 'Fluid bolus for RV infarction (preload-dependent)', 'Avoid nitroglycerin in RV infarction (drops preload)', 'Assess JVP and peripheral edema'],
    'hospital-care': ['Hemodynamic monitoring with PA catheter', 'Mechanical support: Impella RP or ECMO for refractory RV failure', 'Thrombolysis or catheter-directed therapy for massive PE', 'Vasopressors to maintain coronary perfusion (norepinephrine)'],
    'cardiology-care': ['Right heart catheterization for hemodynamic assessment', 'Pulmonary vasodilator testing in pulmonary HTN', 'RVAD (right ventricular assist device) for end-stage RV failure', 'Pericardiocentesis if tamponade contributing to RV failure'],
    procedure: ['Right heart cath: measures RV pressures directly', 'Catheter-directed thrombolysis for PE', 'EP study: RV mapping for RVOT tachycardia', 'Endomyocardial biopsy: taken from RV septum'],
    complications: ['RV free wall rupture (rare, post-MI)', 'Arrhythmogenic RV cardiomyopathy (ARVC): fibrofatty replacement', 'RVOT tachycardia: benign VT from RV outflow tract', 'Paradoxical septal motion in RV pressure/volume overload'],
    teaching: ['The RV is the most anterior chamber and forms most of the sternocostal surface', 'The RV is designed for volume work (low pressure, high compliance)', 'Acute RV failure from PE is a common and life-threatening emergency', 'The moderator band is a key landmark distinguishing the morphologic RV'],
  },
  'left-ventricle': {
    title: 'Left Ventricle',
    overview: ['Thick-walled (8-12mm) conical chamber', 'Generates systemic arterial pressure', 'Papillary muscles anchor mitral leaflets via chordae', 'Normal EF: 55-70%', 'AHA 17-segment model used for wall motion assessment', 'Apex is the most distal point, often supplied by LAD'],
    anatomy: ['Wall thickness: 8-12mm (2-3x RV)', 'Conical shape with smooth endocardial surface', 'Two papillary muscles: anterolateral and posteromedial', 'Chordae tendineae prevent mitral valve prolapse', 'LVOT between anterior mitral leaflet and septum'],
    physiology: ['High-pressure pump: systolic 100-140 mmHg', 'EF = (EDV - ESV) / EDV \u00D7 100; normal 55-70%', 'Frank-Starling mechanism: increased preload increases stroke volume', 'Diastolic function: relaxation, compliance, and filling', 'Cardiac output = HR \u00D7 stroke volume (normal 4-8 L/min)'],
    symptoms: ['LV failure: dyspnea, orthopnea, PND, pulmonary edema', 'Reduced cardiac output: fatigue, exercise intolerance, dizziness', 'Angina from myocardial ischemia', 'Palpitations from ventricular arrhythmias'],
    ecg: ['LV hypertrophy: tall R in V5-V6, deep S in V1-V2 (Sokolow-Lyon: SV1 + RV5 >35mm)', 'LV strain: ST depression with T wave inversion in lateral leads', 'Q waves: evidence of prior MI transmural necrosis', 'ST elevation: acute STEMI with transmural ischemia'],
    imaging: ['Echo: parasternal and apical views', 'Simpson biplane method for EF calculation', 'Speckle tracking for global longitudinal strain (GLS, normal < -18%)', 'Cardiac MRI: gold standard for LV volumes, mass, and scar', 'Nuclear perfusion: identifies ischemia and viability'],
    medications: ['ACEi/ARB for LV remodeling prevention', 'Beta-blocker for HF (carvedilol, metoprolol, bisoprolol)', 'ARNI (sacubitril/valsartan) for HFrEF', 'SGLT2 inhibitor (dapagliflozin, empagliflozin) for HF', 'MRA (spironolactone, eplerenone) for HFrEF'],
    'field-care': ['12-lead ECG for STEMI identification', 'Aspirin 325mg for suspected ACS', 'Nitroglycerin for chest pain (if no RV infarction)', 'STEMI alert and direct transport to PCI center', 'CPAP/BiPAP for acute pulmonary edema'],
    'hospital-care': ['Troponin for myocardial injury detection', 'Echocardiography for LV function assessment', 'Coronary angiography for ACS', 'IV diuretics for acute decompensated HF', 'Inotropes/vasopressors for cardiogenic shock'],
    'cardiology-care': ['PCI for coronary revascularization', 'CABG for multivessel or left main disease', 'CRT for LBBB with HFrEF (EF \u226435%)', 'ICD for primary prevention of sudden cardiac death (EF \u226435%)', 'LVAD as bridge to transplant or destination therapy'],
    procedure: ['Left heart catheterization: coronary angiography + LV pressures', 'PCI: stent placement for coronary stenosis', 'Endomyocardial biopsy for cardiomyopathy workup', 'CRT implantation: LV lead via coronary sinus'],
    complications: ['Myocardial infarction: necrosis from coronary occlusion', 'Heart failure: systolic (HFrEF) or diastolic (HFpEF)', 'Ventricular aneurysm post-MI', 'LV thrombus: risk of systemic embolization', 'Cardiogenic shock: pump failure'],
    teaching: ['The LV is the main systemic pump and the thickest chamber', 'EF is the most widely used measure of LV systolic function', 'GDMT for HFrEF: ACEi/ARNI + BB + MRA + SGLT2i (4 pillars)', 'The 17-segment model standardizes communication about wall motion'],
  },
};

// Fallback tab content generator for structures not in STRUCTURE_DATA
export function getGenericStructureTab(tab: string, structId: string, info: { title: string; summary: string; details: string[] }): string[] {
  switch (tab) {
    case 'overview': return [info.summary, ...info.details];
    case 'anatomy': return info.details;
    case 'physiology': return [`${info.title} plays a role in cardiac physiology as described in the overview.`];
    case 'symptoms': return [`Pathology of the ${info.title.toLowerCase()} may present with structure-specific symptoms.`];
    case 'ecg': return [`ECG changes associated with ${info.title.toLowerCase()} pathology vary by condition.`];
    case 'imaging': return [`${info.title} can be visualized with echocardiography, CT, MRI, and/or angiography.`];
    case 'medications': return [`Medications targeting the ${info.title.toLowerCase()} depend on the specific pathology.`];
    case 'field-care': return [`Prehospital assessment should include relevant physical exam findings.`];
    case 'hospital-care': return [`Inpatient evaluation includes imaging and laboratory workup.`];
    case 'cardiology-care': return [`Subspecialty evaluation may include advanced imaging and invasive assessment.`];
    case 'procedure': return [`Procedures involving the ${info.title.toLowerCase()} are condition-specific.`];
    case 'complications': return [`Complications depend on the underlying pathology and any interventions performed.`];
    case 'teaching': return [info.summary, ...info.details.slice(0, 2)];
    default: return [info.summary];
  }
}

// ─── Legacy anatomy info (for structures not yet in STRUCTURE_DATA) ──────
export const ANATOMY_INFO: Record<string, { title: string; summary: string; details: string[] }> = {
  'right-atrial-appendage': { title: 'Right Atrial Appendage', summary: 'A small, ear-shaped pouch extending from the right atrium.', details: ['Trabeculated muscular pouch (auricle)', 'Contains pectinate muscles', 'Less prone to thrombus than LAA', 'Landmark for identifying the morphologic right atrium', 'Can be used for temporary pacing lead placement'] },
  'left-atrial-appendage': { title: 'Left Atrial Appendage', summary: 'A small pouch arising from the left atrium, clinically significant as a common site for thrombus formation.', details: ['Primary site of thrombus formation in atrial fibrillation (>90%)', 'Variable morphology: chicken wing, cactus, windsock, cauliflower', 'Target for LAA occlusion devices (Watchman, Amulet)', 'Produces atrial natriuretic peptide (ANP)', 'Surgical ligation or exclusion performed during cardiac surgery'] },
  'interatrial-septum': { title: 'Interatrial Septum', summary: 'The wall dividing the right and left atria, containing the fossa ovalis.', details: ['Separates the two atrial chambers', 'Contains the fossa ovalis (thinnest region)', 'Site for transseptal puncture in left-sided interventions', 'ASDs and PFOs occur in this structure', 'Best visualized on subcostal echocardiographic views'] },
  'interventricular-septum': { title: 'Interventricular Septum', summary: 'The muscular and membranous wall separating the right and left ventricles.', details: ['Muscular portion: thick, contracts with systole', 'Membranous portion: thin fibrous tissue near AV valves', 'Contains the bundle of His and proximal bundle branches', 'VSDs most commonly occur in membranous portion', 'Dual blood supply from LAD (anterior) and PDA (posterior)'] },
  'fossa-ovalis': { title: 'Fossa Ovalis', summary: 'An oval depression in the interatrial septum, remnant of the foramen ovale.', details: ['Thinnest portion of the interatrial septum', 'Remnant of the embryonic foramen ovale', 'PFO occurs when it fails to close completely', 'Target site for transseptal catheterization', 'Important landmark in structural heart interventions'] },
  'apex': { title: 'Apex', summary: 'The most inferior and lateral tip of the left ventricle.', details: ['Formed primarily by the left ventricle', 'Located at 5th intercostal space, midclavicular line', 'Point of maximal impulse (PMI) palpable here', 'Supplied by the distal LAD artery', 'Common site for apical ballooning in Takotsubo'] },
  'base-of-heart': { title: 'Base of Heart', summary: 'The superior broad portion of the heart where the great vessels attach.', details: ['Formed primarily by the left atrium posteriorly', 'Great vessels enter and exit at the base', 'Contains the fibrous skeleton and valve annuli'] },
  'mitral-annulus': { title: 'Mitral Valve', summary: 'A bicuspid valve between the left atrium and left ventricle.', details: ['Two leaflets: anterior (aortic) and posterior (mural)', 'Annulus is saddle-shaped', 'Supported by anterolateral and posteromedial papillary muscles', 'Most common valve affected by rheumatic disease', 'Target for MitraClip/TEER, surgical repair, or replacement'] },
  'aortic-valve-rcc': { title: 'Aortic Valve', summary: 'A trileaflet semilunar valve between the LV and ascending aorta.', details: ['Three cusps: RCC, LCC, NCC', 'Coronary ostia arise from sinuses of Valsalva', 'No chordae tendineae', 'Aortic stenosis is most common valvular disease', 'TAVR has revolutionized treatment'] },
  'tricuspid-annulus': { title: 'Tricuspid Valve', summary: 'A three-leaflet valve between the right atrium and right ventricle.', details: ['Three leaflets: anterior, posterior, and septal', 'Largest valve annulus', 'AV node near septal leaflet (Koch triangle)', 'Functional TR common with RV dilation'] },
  'pulmonary-valve-cusps': { title: 'Pulmonary Valve', summary: 'A trileaflet semilunar valve between the RV and pulmonary trunk.', details: ['Three cusps: anterior, right, and left', 'Lowest pressure valve', 'PS often congenital; balloon valvuloplasty', 'PR common after TOF repair'] },
  'ascending-aorta': { title: 'Ascending Aorta', summary: 'The first segment of the aorta.', details: ['Contains sinuses of Valsalva and coronary ostia', 'Normal diameter: 2.1-3.5 cm', 'Type A dissection is a surgical emergency'] },
  'aortic-arch': { title: 'Aortic Arch', summary: 'The curved portion giving rise to head and arm vessels.', details: ['Three major branches', 'Aortic isthmus: coarctation site', 'Ligamentum arteriosum connects to PA'] },
  'pulmonary-trunk': { title: 'Pulmonary Trunk', summary: 'The large artery carrying deoxygenated blood from the RV to the lungs.', details: ['Bifurcates into right and left PA', 'Low-pressure system (25/10 mmHg)', 'Saddle PE at bifurcation'] },
  'svc': { title: 'Superior Vena Cava', summary: 'Large vein returning blood from the upper body.', details: ['Formed by brachiocephalic veins', 'SVC syndrome: obstruction causes facial edema', 'Common site for central lines'] },
  'ivc': { title: 'Inferior Vena Cava', summary: 'Large vein returning blood from the lower body.', details: ['Guarded by Eustachian valve', 'IVC diameter estimates RA pressure on echo', 'IVC filters for PE prophylaxis'] },
  'fibrous-pericardium': { title: 'Fibrous Pericardium', summary: 'The tough outer layer of the pericardial sac.', details: ['Limits acute cardiac dilation', 'Pericardial space: 15-50 mL fluid', 'Rapid accumulation causes tamponade'] },
  'epicardium': { title: 'Epicardium', summary: 'Outermost layer (visceral pericardium).', details: ['Contains coronary arteries and veins', 'Inflammation causes pericarditis', 'Epicardial ablation for refractory VT'] },
  'myocardium': { title: 'Myocardium', summary: 'The muscular layer responsible for contraction.', details: ['LV 8-12mm, RV 3-5mm', 'MI: irreversible necrosis', 'Target for cardiac MRI LGE'] },
  'endocardium': { title: 'Endocardium', summary: 'Smooth inner lining of heart chambers.', details: ['Continuous with vascular endothelium', 'Endocarditis: infection of this surface', 'Subendocardial ischemia occurs first'] },
  'anterolateral-papillary-muscle': { title: 'AL Papillary Muscle', summary: 'A muscular projection in the LV.', details: ['Dual blood supply (LAD and LCx)', 'Less commonly ruptured', 'Anchors mitral chordae'] },
  'posteromedial-papillary-muscle': { title: 'PM Papillary Muscle', summary: 'More vulnerable to ischemia.', details: ['Single blood supply (PDA/RCA)', 'Rupture: acute severe MR (surgical emergency)', 'Mechanical complication of inferior MI'] },
  'moderator-band': { title: 'Moderator Band', summary: 'A muscular band in the RV carrying conduction.', details: ['Carries RBB to RV free wall', 'Key RV landmark', 'Can mimic thrombus on imaging'] },
  'crista-terminalis': { title: 'Crista Terminalis', summary: 'Ridge in RA separating smooth from trabeculated.', details: ['Corresponds to sulcus terminalis externally', 'Source of crista terminalis tachycardia', 'Can simulate mass on imaging'] },
  'lmca': { title: 'LMCA', summary: 'Short trunk bifurcating into LAD and LCx.', details: ['Supplies ~75% of LV', 'Left main disease: high-risk, often CABG', 'Stenosis >50% significant'] },
  'lad-proximal': { title: 'Proximal LAD', summary: 'Before the first septal perforator.', details: ['Supplies anterior wall and septum', 'Occlusion: extensive anterior STEMI', 'ST elevation V1-V4'] },
  'lad-mid': { title: 'Mid LAD', summary: 'Coursing in the anterior IV groove.', details: ['Gives off diagonal branches', 'Wellens pattern: critical mid-LAD stenosis'] },
  'lad-distal': { title: 'Distal LAD', summary: 'Terminal segment wrapping around apex.', details: ['Supplies apical segments', 'Target for LIMA graft in CABG'] },
  'd1': { title: 'First Diagonal (D1)', summary: 'First major diagonal branch.', details: ['Supplies anterolateral wall', 'Occlusion: lateral ST changes (I, aVL)'] },
  'd2': { title: 'Second Diagonal (D2)', summary: 'Smaller diagonal branch.', details: ['Variable anatomy, may be absent'] },
  'lcx-proximal': { title: 'LCx', summary: 'Courses in left AV groove.', details: ['Gives off OM branches', 'May be dominant in ~15%', 'Occlusion: lateral STEMI'] },
  'om1': { title: 'OM1', summary: 'First obtuse marginal.', details: ['Supplies lateral LV wall', 'ECG changes in I, aVL, V5-V6'] },
  'om2': { title: 'OM2', summary: 'Second obtuse marginal.', details: ['Supplies posterolateral wall'] },
  'rca-proximal': { title: 'Proximal RCA', summary: 'First segment exiting right aortic sinus.', details: ['Gives off SA nodal artery', 'Proximal lesions cause inferior STEMI'] },
  'rca-mid': { title: 'Mid RCA', summary: 'Along the acute margin.', details: ['Gives off acute marginal branch', 'Most common RCA disease site', 'Inferior STEMI: II, III, aVF'] },
  'rca-distal': { title: 'Distal RCA', summary: 'At the crux of the heart.', details: ['Gives rise to PDA (85%)', 'Supplies AV node', 'Occlusion: AV block'] },
  'pda': { title: 'PDA', summary: 'Posterior descending artery.', details: ['From RCA in 85%', 'Determines dominance', 'Supplies inferior septum'] },
  'am-branch': { title: 'Acute Marginal', summary: 'RCA branch to RV free wall.', details: ['RV infarction when compromised'] },
  'sa-node': { title: 'SA Node', summary: 'Primary pacemaker.', details: ['Intrinsic rate: 60-100 bpm', 'Located at SVC-RA junction', 'Dysfunction: sick sinus syndrome'] },
  'av-node': { title: 'AV Node', summary: 'Secondary pacemaker with conduction delay.', details: ['Intrinsic rate: 40-60 bpm', 'In Koch triangle', 'AV block from disease or ischemia'] },
  'bundle-of-his': { title: 'Bundle of His', summary: 'Connects AV node to bundle branches.', details: ['Penetrates central fibrous body', 'His bundle pacing alternative'] },
  'right-bundle-branch': { title: 'Right Bundle Branch', summary: 'Conducts to RV.', details: ['Via moderator band to RV wall', 'RBBB: rsR\' in V1'] },
  'left-bundle-branch': { title: 'Left Bundle Branch', summary: 'Splits into anterior and posterior fascicles.', details: ['LBBB: broad R in I, V5-V6', 'New LBBB may indicate MI'] },
  'left-anterior-fascicle': { title: 'Left Anterior Fascicle', summary: 'Anterior division of LBB.', details: ['LAFB: left axis deviation', 'Most common fascicular block'] },
  'left-posterior-fascicle': { title: 'Left Posterior Fascicle', summary: 'Posterior division of LBB.', details: ['Dual blood supply', 'LPFB: right axis deviation'] },
  'purkinje-network-rv': { title: 'Purkinje Network (RV)', summary: 'Terminal conduction fibers in RV.', details: ['Fastest conduction (2-4 m/s)', 'Can source arrhythmias'] },
  'purkinje-network-lv': { title: 'Purkinje Network (LV)', summary: 'Terminal conduction fibers in LV.', details: ['Extensive subendocardial distribution', 'Tertiary pacemaker (20-40 bpm)'] },
};

/** Resolve the display title for a structure id. */
export function getStructureTitle(id: string): string {
  return STRUCTURE_DATA[id]?.title ?? ANATOMY_INFO[id]?.title ?? id.replace(/-/g, ' ');
}

/** Tab content for a structure (empty array when the structure is unknown). */
export function getStructureTabContent(id: string, tab: string): string[] {
  const full = STRUCTURE_DATA[id];
  if (full) {
    return (full as unknown as Record<string, string[]>)[tab] || full.overview;
  }
  const info = ANATOMY_INFO[id];
  if (info) return getGenericStructureTab(tab, id, info);
  return [];
}

export const STRUCTURE_IDS = Array.from(new Set([...Object.keys(STRUCTURE_DATA), ...Object.keys(ANATOMY_INFO)]));
