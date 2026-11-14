import { describe, expect, it } from 'vitest';
import { MEDICATIONS } from '@/data/content/medications';
import { MEDICATION_IDS } from '@/types/content';

/**
 * The drug cards' contraindications, brought to the current US labels and guidelines (the contraindication audit,
 * cards B1–B41, rhythm C1–C8, support G32). A contraindication that is not absolute says so: "(relative)", "(label
 * warning)", "not recommended".
 */

const card = (id: string) => MEDICATIONS[id];
const contra = (id: string) => card(id).contraindications.join('\n');

/** how many contraindication lines each card had before the audit: none is lost (only reworded, merged or moved) */
const BEFORE: Record<string, number> = {
  aspirin: 5, clopidogrel: 3, ticagrelor: 5, prasugrel: 4, heparin: 4, enoxaparin: 4, bivalirudin: 2, apixaban: 5, warfarin: 4,
  tenecteplase: 7, nitroglycerin: 6, fentanyl: 4, metoprolol: 6, esmolol: 4, adenosine: 4, diltiazem: 5, amiodarone: 5,
  procainamide: 4, lidocaine: 4, digoxin: 5, 'magnesium-sulfate': 4, atropine: 4, epinephrine: 4, norepinephrine: 3,
  vasopressin: 3, phenylephrine: 3, dopamine: 3, dobutamine: 4, milrinone: 4, furosemide: 4, lisinopril: 5,
  'sacubitril-valsartan': 5, spironolactone: 4, empagliflozin: 4, atorvastatin: 4, 'calcium-chloride': 4,
  'insulin-dextrose': 2, albuterol: 2, 'sodium-bicarbonate': 4, sotalol: 6, colchicine: 4,
};

describe('no contraindication line is lost', () => {
  it.each(Object.entries(BEFORE))('%s', (id, n) => {
    // two lines moved out on purpose: calcium's digoxin line (no longer a contraindication — Levine 2011) to the
    // interactions, and atorvastatin's pregnancy line (removed from the label, FDA 2021) to the monitoring
    const moved = id === 'calcium-chloride' || id === 'atorvastatin' ? 1 : 0;
    expect(card(id).contraindications.length).toBeGreaterThanOrEqual(n - moved);
  });

  it('the two lines that moved say where they went and why', () => {
    expect(contra('calcium-chloride')).not.toMatch(/digoxin/i);
    expect(card('calcium-chloride').interactions.join(' ')).toMatch(/Digoxin toxicity is no longer considered a contraindication \(Levine 2011\) — its hyperkalemia is treated with digoxin Fab \(2023 AHA, COR 1\)/);
    expect(contra('atorvastatin')).not.toMatch(/pregnan/i);
    expect(card('atorvastatin').monitoring.join(' ')).toMatch(/Pregnancy: no longer a label contraindication \(FDA 2021\) — stop it in most pregnant patients; breastfeeding not recommended/);
  });
});

describe('rhythm and rate cards', () => {
  it('metoprolol: cocaine, IV diltiazem or verapamil, the MI label limits, shock risk, pheochromocytoma', () => {
    const c = contra('metoprolol');
    expect(c).toMatch(/cocaine or methamphetamine intoxication.*3 — Harm/);
    expect(c).toMatch(/IV diltiazem or verapamil within a few hours/);
    expect(c).toMatch(/heart rate below 45\/min, PR 0\.24 s or longer, or systolic below 100 mmHg/);
    expect(c).toMatch(/age over 70, systolic under 120, heart rate over 110 or under 60, late presentation \(COMMIT; 2013 ACCF\/AHA\): no IV dose/);
    expect(c).toMatch(/Untreated pheochromocytoma \(label\)/);
  });

  it('esmolol: IV calcium-channel blockers, pulmonary hypertension as a label contraindication, cocaine', () => {
    const c = contra('esmolol');
    expect(c).toMatch(/IV calcium-channel blockers \(verapamil, diltiazem\) while their effect lasts — fatal cardiac arrests reported \(label\)/);
    expect(c).toMatch(/Pulmonary hypertension with RV failure \(label\)/);
    expect(c).not.toMatch(/pulmonary hypertension \(relative\)/i);
    expect(c).toMatch(/cocaine/);
  });

  it('diltiazem: the IV β-blocker is a contraindication now, not only an interaction', () => {
    const c = contra('diltiazem');
    expect(c).toMatch(/An IV β-blocker given together or within a few hours \(label\)/);
    expect(c).toMatch(/Compensatory sinus tachycardia.*\(relative\)/);
    expect(c).toMatch(/Hypersensitivity/);
  });

  it('lidocaine, magnesium, procainamide, adenosine, digoxin, atropine, amiodarone and sotalol', () => {
    expect(contra('lidocaine')).toMatch(/Wolff-Parkinson-White syndrome or pre-excited AF \(label\)[\s\S]*Stokes-Adams attacks \(label\)/);
    expect(contra('magnesium-sulfate')).toMatch(/Heart block or myocardial damage \(label contraindication for parenteral magnesium; in torsades the indication decides, with pacing ready\)/);
    expect(contra('procainamide')).toMatch(/sodium-channel-blocker overdose[\s\S]*procainamide or procaine[\s\S]*Myasthenia gravis/);
    const ado = contra('adenosine');
    expect(ado).toMatch(/unstable wide-complex tachycardia \(2025 AHA: 3 — Harm\)/);
    expect(ado).toMatch(/contraindicated for the IV infusion \(stress imaging, FFR hyperemia — Adenoscan label\); avoid the 6\/12 mg push as well/);
    expect(ado).toMatch(/Severe hypotension \(the infusion\)/);
    expect(card('adenosine').dosing.join(' ')).toMatch(/FFR hyperemia: 140 mcg\/kg\/min IV through a large vein, or an intracoronary bolus/);
    expect(contra('digoxin')).toMatch(/Elective electrical cardioversion while digoxin-toxic/);
    expect(card('atropine').contraindications[0]).toBe('The US label lists no contraindications; these are guideline limits');
    expect(contra('atropine')).toMatch(/Acute MI or ischemia — use cautiously/);
    expect(contra('amiodarone')).toMatch(/including iodine \(label\) — a seafood "allergy" is not one, and none stands in a shock-refractory arrest/);
    expect(contra('sotalol')).toMatch(/Potassium below 4 mEq\/L \(label\) or a low magnesium — correct first/);
    expect(card('sotalol').indications[0]).toMatch(/no longer in the 2025 AHA tachycardia algorithm/);
  });
});

describe('antithrombotic, lytic and nitrate cards', () => {
  it('ticagrelor: severe hepatic impairment is a label warning now (wrong today), plus angioedema, urgent CABG, dissection, lysis', () => {
    const c = contra('ticagrelor');
    expect(c).toMatch(/Severe hepatic impairment — avoid \(label warning; not studied\)/);
    expect(card('ticagrelor').contraindications).not.toContain('Severe hepatic impairment');
    expect(c).toMatch(/angioedema[\s\S]*urgent CABG — do not start \(boxed warning\)[\s\S]*aortic dissection[\s\S]*Within 24 h of a fibrinolytic — use clopidogrel/);
  });

  it('prasugrel and clopidogrel: lysis, age, dissection, CYP2C19, and cangrelor first', () => {
    expect(contra('prasugrel')).toMatch(/within 24 h of a fibrinolytic[\s\S]*Age 75 or older — generally not recommended \(boxed warning\)[\s\S]*aortic dissection/);
    expect(card('prasugrel').interactions.join(' ')).toMatch(/Cangrelor: give prasugrel only after the infusion stops/);
    const c = contra('clopidogrel');
    expect(c).toMatch(/stop 5 days before when possible \(timing, not a contraindication\)/);
    expect(c).toMatch(/aortic dissection/);
    expect(c).toMatch(/CYP2C19 poor metabolizer \(boxed warning\)/);
    expect(card('clopidogrel').interactions.join(' ')).toMatch(/Cangrelor: give clopidogrel only after the infusion stops/);
  });

  it('the anticoagulants: pork, dissection, the pericardium, SCAD, benzyl alcohol, valves, neuraxial timing, lysis', () => {
    const hep = contra('heparin');
    expect(hep).toMatch(/heparin or pork products \(label\)/);
    expect(hep).toMatch(/aortic dissection/);
    expect(hep).toMatch(/pericardial effusion or tamponade — bleeding into the pericardium \(relative\)/);
    expect(hep).toMatch(/SCAD without a stent/);
    expect(card('heparin').interactions.join(' ')).toMatch(/Not with a bivalirudin infusion/);
    expect(card('bivalirudin').interactions.join(' ')).toMatch(/Not on top of a full heparin bolus/);
    expect(contra('bivalirudin')).toMatch(/aortic dissection/);
    const enox = contra('enoxaparin');
    expect(enox).toMatch(/pork products, or to benzyl alcohol \(multiple-dose vial\)/);
    expect(enox).toMatch(/UFH generally preferred \(relative\)/);
    expect(enox).toMatch(/Mechanical heart valve.*\(label warning\)/);
    const war = contra('warfarin');
    for (const re of [/bleeding tendency or blood dyscrasia/, /cerebral aneurysm/, /Aortic dissection/, /Pericarditis or a pericardial effusion/, /Bacterial endocarditis/, /Malignant hypertension/, /threatened abortion, eclampsia, pre-eclampsia/, /major regional or lumbar block/, /Inability to take or monitor it reliably/]) {
      expect(war).toMatch(re);
    }
    expect(card('warfarin').interactions.join(' ')).toMatch(/relative contraindication to STEMI and PE lysis; an INR above 1\.7 bars stroke lysis/);
    expect(contra('apixaban')).toMatch(/Neuraxial anesthesia or spinal puncture — timing \(boxed warning/);
    expect(card('apixaban').interactions.join(' ')).toMatch(/a DOAC within 48 h bars stroke lysis/);
  });

  it('tenecteplase: an ischemic stroke within 3 months is absolute; a TIA or a stroke after 3 months, and the other relatives, say "relative"', () => {
    const lines = card('tenecteplase').contraindications;
    expect(lines).toContain('Ischemic stroke within 3 months (unless treating acute stroke in window)');
    expect(lines).toContain('A TIA, or an ischemic stroke more than 3 months ago (relative)');
    for (const re of [/Systolic above 180 or diastolic above 110/, /oral anticoagulant/, /Major surgery within 3 weeks, or traumatic or prolonged CPR \(more than 10 min\)/, /Internal bleeding within 2–4 weeks, or an active peptic ulcer/, /Non-compressible vascular punctures/, /Pregnancy/, /Dementia/]) {
      const line = lines.find((l) => re.test(l));
      expect(line, String(re)).toBeDefined();
      expect(line).toMatch(/\(relative/);
    }
    expect(lines.join('\n')).toMatch(/Pulmonary embolism without cardiopulmonary failure \(AHA\/ACC 2026 categories A1–C2\) — systemic lysis must not be used/);
    expect(card('tenecteplase').dosing.join(' ')).toMatch(/Age ≥ 75: consider half dose \(STREAM-2; ESC\) — not in the US label or confirmed in the 2025 ACC\/AHA table/);
    expect(card('tenecteplase').levelNotes.join(' ')).not.toMatch(/half dose if ≥ 75/);
  });

  it('nitroglycerin: the preload-dependent hearts, dynamic LVOT obstruction, raised ICP, severe anemia, shock, no role in arrest', () => {
    const c = contra('nitroglycerin');
    expect(c).toMatch(/riociguat/);
    expect(c).toMatch(/shock or hypovolemia/);
    expect(c).toMatch(/cardiac tamponade, constrictive pericarditis or restrictive cardiomyopathy \(IV label\)/);
    expect(c).toMatch(/a massive PE with a failing right ventricle/);
    expect(c).toMatch(/dynamic LV outflow obstruction \(obstructive HCM, Takotsubo with LVOTO\)/);
    expect(c).toMatch(/Raised intracranial pressure.*severe anemia \(label\)/);
    expect(c).toMatch(/cardiac arrest: no role/);
  });

  it('fentanyl: the MAOI line is the label\'s "not recommended", the rest are practice limits', () => {
    const c = contra('fentanyl');
    expect(c).toMatch(/MAOI within 14 days — not recommended \(label interaction: serotonin syndrome or opioid toxicity\)/);
    expect(c).toMatch(/a practice limit; the label lists only hypersensitivity/);
    expect(c).toMatch(/Cardiac arrest: no role/);
  });
});

describe('support and chronic cards', () => {
  it('calcium: the gluconate dose, by a peripheral line', () => {
    expect(card('calcium-chloride').dosing.join(' ')).toMatch(/Calcium gluconate 10%: 3 g \(30 mL\) IV over 2–5 min through a peripheral line/);
  });

  it('catecholamines and inodilators in dynamic LV outflow obstruction; the pressor labels list no contraindications', () => {
    for (const id of ['epinephrine', 'norepinephrine', 'dopamine', 'dobutamine', 'milrinone']) {
      expect(contra(id), id).toMatch(/Dynamic LV outflow obstruction[\s\S]*Takotsubo with LVOTO/);
    }
    expect(contra('epinephrine')).toMatch(/IM is for anaphylaxis — never the route in cardiac arrest/);
    expect(card('norepinephrine').contraindications[0]).toMatch(/^The current US label lists no contraindications/);
    expect(card('phenylephrine').contraindications[0]).toMatch(/^The current US label lists no contraindications/);
    expect(contra('phenylephrine')).toMatch(/Pulmonary arterial hypertension/);
    expect(contra('milrinone')).toMatch(/Acute phase of MI — not recommended \(label\)/);
  });

  it('milrinone dosing: 0.125–0.75 mcg/kg/min, no routine bolus, a lower rate with kidney disease', () => {
    const d = card('milrinone').dosing.join(' ');
    expect(d).toMatch(/0\.125–0\.75 mcg\/kg\/min/);
    expect(d).toMatch(/No routine loading bolus/);
    expect(d).toMatch(/A lower rate with kidney disease \(label: dose-adjust for creatinine clearance\)/);
  });

  it('furosemide, atorvastatin, lisinopril, empagliflozin, colchicine, sacubitril-valsartan, spironolactone', () => {
    expect(contra('furosemide')).toMatch(/Hypotension or shock — restore perfusion first \(relative\)[\s\S]*tamponade, RV infarction, dynamic LV outflow obstruction \(relative\)[\s\S]*Sulfonamide allergy — low cross-reactivity; give with care \(relative\)/);
    expect(card('atorvastatin').contraindications).toEqual(['Acute liver failure or decompensated cirrhosis', 'Hypersensitivity', 'Prior statin-associated rhabdomyolysis (practice)']);
    expect(contra('lisinopril')).toMatch(/Hereditary or idiopathic angioedema[\s\S]*Aliskiren in diabetes/);
    expect(contra('lisinopril')).toMatch(/Bilateral renal artery stenosis \(relative\)/);
    expect(contra('empagliflozin')).toMatch(/Dialysis \(not recommended — label\)[\s\S]*Type 1 diabetes \(not recommended — label; DKA risk\)/);
    expect(contra('colchicine')).toMatch(/contraindicated with the 0\.5 mg cardiovascular dose in everyone, and with any dose in renal or hepatic impairment/);
    expect(contra('colchicine')).toMatch(/Creatinine clearance under 15 mL\/min or dialysis \(cardiovascular dose\)/);
    expect(contra('sacubitril-valsartan')).toMatch(/Child-Pugh C\) — not recommended \(label\)/);
    expect(contra('spironolactone')).toMatch(/Eplerenone together/);
  });
});

describe('every card in the Library', () => {
  it('has an id in MEDICATION_IDS and is keyed by it', () => {
    for (const [key, m] of Object.entries(MEDICATIONS)) {
      expect(m.id).toBe(key);
      expect(MEDICATION_IDS as readonly string[]).toContain(m.id);
    }
    for (const id of MEDICATION_IDS) expect(MEDICATIONS[id], id).toBeDefined();
  });
});
