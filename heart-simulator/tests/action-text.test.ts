import { describe, expect, it } from 'vitest';
import { INTERVENTION_BY_ID, detailFor, interventionsFor } from '@/lib/sim/scenario/interventions';
import type { Setting } from '@/lib/sim/scenario/types';

/**
 * The action menu names who must NOT get a drug or a procedure next to its dose, the way procainamide's line always has:
 * a learner who reads the button before pressing it meets the contraindication there. Each line is pinned by the clause
 * that carries the contraindication (sources: the US labels, 2025 AHA, 2025 ACC/AHA ACS, 2026 AHA/ACC PE, as in the rules).
 */
const detail = (id: string, setting?: Setting) => {
  const iv = INTERVENTION_BY_ID[id];
  expect(iv, id).toBeDefined();
  return (setting ? detailFor(iv, setting) : iv.detail) ?? '';
};

describe('the action menu names the contraindications next to the dose', () => {
  it.each([
    ['aspirin', /^324 mg \(162–325 mg\) non-enteric-coated; not with a true aspirin allergy \(clopidogrel instead\) or active bleeding$/],
    ['nitro', /^0\.4 mg, every 5 min, max 3; hold for a systolic under 90 or 30 below baseline, a rate under 50 or over 100, an RV infarct, or a PDE-5 inhibitor \(24 h; tadalafil 48 h\) or riociguat$/],
    ['nitro-high', /; not after a PDE-5 inhibitor or with a low pressure$/],
    ['fentanyl', /; hold for a systolic under 90 or breathing under 10\/min$/],
    ['metoprolol', /over 2 min \(every 5 min, max 15 mg\); not with a low pressure, wet lungs, AV block, a stimulant on board or pre-excited AF$/],
    ['atropine', /max 3 mg; pace instead of repeating it for Mobitz II, a wide escape or a transplanted heart$/],
    ['adenosine6', /pads on, strip running; not for an irregular or polymorphic wide rhythm, AV block or asthma \(3 mg via a central line or after a transplant\)$/],
    ['adenosine12', /pads on, strip running; not for an irregular or polymorphic wide rhythm, AV block or asthma/],
    ['diltiazem', /not with a low pressure, heart failure \(EF ≤ 40 %\), a wide or pre-excited tachycardia, AV block, or an IV beta-blocker within hours$/],
    ['epinephrine', /cardiac arrest only \(with a pulse: push-dose or an infusion\)$/],
    ['amio-arrest', /VF or pulseless VT after the third shock$/],
    ['amio-infusion', /then 1 mg\/min; not with a long QT, AV block or a slow rate without a pacer, or pre-excited AF; slow it for a falling pressure$/],
    ['lidocaine', /max 3 mg\/kg\); never for a slow wide escape rhythm or AV block; not in WPW$/],
    ['push-epi', /for a low pressure with a pulse, repeat as needed — never the 1 mg arrest dose$/],
    ['pressor', /volume first in bleeding; no catecholamine with LV outflow obstruction; not in arrest$/],
    ['magnesium-sulfate', /^diluted, over about 5–15 min with a pulse.*not routine in arrest, not in heart block without pacing ready$/],
    ['o2-nc', /^2–4 L\/min; for an SpO₂ under 90 % in ACS; only a breathing patient — bag-mask otherwise$/],
    ['o2-nrb', /^15 L\/min; for an SpO₂ under 90 % in ACS; only a breathing patient — bag-mask otherwise$/],
    ['fluid', /not with pulmonary edema; at most 500 mL in a PE with a failing RV$/],
    ['cpap', /only an awake patient breathing on their own with a systolic of 90 or more — not with vomiting, a pneumothorax, facial trauma or a patient who cannot protect the airway$/],
    ['rsi', /half the induction dose with a low pressure; ketamine not with an aortic dissection or a hypertensive emergency; rocuronium, not succinylcholine, with a high potassium$/],
    ['transfuse', /with a massive transfusion, give calcium$/],
    ['calcium-chloride', /never through the same line as bicarbonate; a large or central vein$/],
    ['sodium-bicarbonate', /for hyperkalemia with acidosis or a sodium-channel-blocker overdose — not routine in arrest; ventilate$/],
    ['insulin-dextrose', /^regular insulin 10 units \(5 units with kidney failure or a low weight: fewer lows\), then D50 50 mL unless the glucose is over 250; check the glucose first \(none under 70\); recheck at 30 minutes, then every hour$/],
    ['glucagon', /not with a pheochromocytoma — protect the airway \(it makes patients vomit\)$/],
    ['dextrose', /check the glucose first/],
    ['epi-im', /for anaphylaxis — never the route in cardiac arrest \(1 mg IV\/IO\)$/],
    ['diphenhydramine', /after epinephrine in anaphylaxis; sedating; push slowly$/],
    ['steroid', /an adjunct after epinephrine — it treats neither the airway nor the pressure$/],
    ['alteplase', /^100 mg over 2 hours after the bleeding checklist.*PE with shock or cardiopulmonary failure only; in a cardiac arrest from PE, a 50 mg bolus per protocol$/],
    ['tnk', /^weight-based \(30–50 mg in five bands\), after the contraindication checklist$/],
    ['gp2b3a', /1 mcg\/kg\/min if CrCl < 50; not on dialysis, with active bleeding or a stroke within 30 days$/],
    ['cangrelor', /clopidogrel or prasugrel only after the infusion ends \(ticagrelor any time\)$/],
    ['protamine', /^1 mg per 100 units of heparin given in the last 30 minutes \(0\.25–0\.375 mg per 100 units after 2 hours\); at most 50 mg, slowly over 10 minutes; reactions are likelier after NPH \(protamine\) insulin, a fish allergy or a vasectomy; only for real bleeding$/],
    ['iabp', /not routine in infarct shock \(2025 ACC\/AHA: no benefit\); not with aortic regurgitation, an aortic dissection or severe iliofemoral disease/],
    ['impella', /not with an LV clot, a mechanical aortic valve, severe aortic stenosis or regurgitation, a VSD, an aortic dissection or severe PAD; full heparin$/],
    ['aspiration', /bail-out for a large thrombus only; routine use: no benefit, more strokes \(TOTAL\)/],
    ['cath-pigtail', /^never across a mechanical aortic valve; avoid with an LV clot, severe AS, shock or decompensated heart failure \(the echo answers it\)$/],
    ['lvedp', /^never across a mechanical aortic valve/],
    ['lv-gram', /30–36 mL at 10–15 mL\/s; never across a mechanical aortic valve/],
    ['adenosine-iv-ffr', /through a large vein — not with asthma, 2nd\/3rd-degree AV block or sinus node disease without a pacemaker, or a low pressure; no caffeine for 12 h/],
    ['ic-adenosine', /a few seconds of AV block \(worse in the RCA\): not in AV block without pacing, not with a low pressure$/],
    ['ic-verapamil', /not with a low pressure, AV block or cardiogenic shock$/],
    ['radial-cocktail', /leave out the verapamil with a low pressure, AV block or shock, and the nitroglycerin with a low pressure or a PDE-5 inhibitor$/],
    ['closure-device', /^femoral only, after a femoral angiogram: puncture in the common femoral artery above the bifurcation and below the inguinal ligament/],
    ['central-line', /after a fibrinolytic or with anticoagulation: a compressible site under ultrasound \(femoral or internal jugular\), never subclavian$/],
    ['temp-wire', /pads on first; through a compressible vein \(femoral, or internal jugular under ultrasound\); not through a mechanical tricuspid valve/],
    ['legs-up', /^for a low pressure \(a faint, blood loss\); not with fluid on the lungs or a patient who cannot breathe lying flat$/],
    ['consent', /an earlier reaction to contrast \(shellfish and iodine allergies do not count\), anticoagulants, metformin and the kidney function$/],
    ['ct-urgent', /not before the culprit artery is open in a STEMI; an earlier contrast reaction needs premedication$/],
    ['stop-contrast', /^injector off, manifold closed \(and, when the case must end, the catheter out over a wire, the sheath left in\)$/],
  ] as const)('%s', (id, words) => {
    expect(detail(id)).toMatch(words);
  });

  it('gives the ED its own CPAP and P2Y12 lines: non-invasive ventilation, and prasugrel with its exclusions', () => {
    expect(detail('cpap', 'ed')).toMatch(/^non-invasive ventilation with respiratory therapy: CPAP 5–10 cmH₂O or BiPAP .*not with a systolic under 90, vomiting or a pneumothorax$/);
    expect(detail('cpap', 'field')).toMatch(/^5–10 cmH₂O for respiratory distress from pulmonary edema/);
    expect(detail('p2y12', 'ed')).toBe('by mouth: ticagrelor 180 mg, or prasugrel 60 mg (never after a stroke or TIA; not usually at 75 or over; in NSTE-ACS only once the anatomy is known); with a fibrinolytic, clopidogrel 300 mg (75 mg, no load, over age 75)');
    expect(detail('p2y12', 'cathlab')).toBe('ticagrelor 180 mg (or prasugrel 60 mg: not after a stroke or TIA, not at 75 or over, and not during a cangrelor infusion)');
    expect(detail('ct-urgent', 'ed')).toMatch(/leave the department; an earlier contrast reaction needs premedication$/);
    // the paramedic sees the field CPAP line, the ER doctor the ED one
    expect(interventionsFor(2, 'field').find((i) => i.id === 'cpap')!.detail).toBe(detail('cpap', 'field'));
    expect(interventionsFor(7, 'ed').find((i) => i.id === 'cpap')!.detail).toBe(detail('cpap', 'ed'));
  });

  it('names what the buttons are for: the PDE-5 question, the lab wire, the level of care and the regional heart center', () => {
    expect(INTERVENTION_BY_ID['ask-pde5'].label).toBe('Ask about PDE-5 inhibitors and riociguat (sildenafil, vardenafil, tadalafil, avanafil — for erections, pulmonary hypertension or the prostate)');
    expect(INTERVENTION_BY_ID.reposition.label).toBe('Disengage and reposition the catheter (or the pacing wire)');
    expect(INTERVENTION_BY_ID.admit.label).toBe('Admit (CCU, ICU or a monitored bed)');
    expect(INTERVENTION_BY_ID['insulin-dextrose'].label).toBe('Insulin 5–10 units IV with dextrose 25 g');
    expect(detail('transport-pci')).toMatch(/the region's cardiac arrest center, with ECMO, a PE response team and the VAD program$/);
  });
});
