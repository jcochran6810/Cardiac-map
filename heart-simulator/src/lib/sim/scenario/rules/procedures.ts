/**
 * Built-in safety rules for procedures and decisions: transport in an arrest, the pericardiocentesis, the STEMI alert
 * and the cath lab activation, the scanner, the central line and the transfer; in the cath lab, consent, anticoagulation,
 * the pumps (IABP, Impella), the femoral sheath, the catheter across the aortic valve, routine aspiration, the covered stent
 * and contrast after an earlier reaction or with failing kidneys.
 *
 * One dose, one penalty: where several rules here judge the same action, each lower one is written to stay silent while
 * a higher one applies (the gate order is noted above each group).
 */
import { CINE_VIEWS } from '@/lib/cathlab/views';
import { has, paced } from '../kit';
import { anticoagulated } from '../labKit';
import type { Harm, Problem, Scenario, SimState } from '../types';
import { ecgShowsStemi, hasProblem, lowPressure, profileShowsStemi, stemiNow } from './helpers';

// ─── What the rules read ───────────────────────────────────────────────────

/** What rules out either pump: a leaking aortic valve, a torn aorta, iliac and femoral arteries too diseased for the sheath */
const PUMP_CONTRA: Problem[] = ['aortic-dissection', 'aortic-regurgitation', 'peripheral-artery-disease'];
/**
 * …a balloon pump, which also deflates as the ventricle ejects: with a dynamic LV outflow obstruction the lower afterload
 * narrows the outflow tract and the gradient climbs (InterTAK 2018 consensus; HCM practice). An Impella carries the blood
 * past the obstruction, so it is not on the Impella's list
 */
const IABP_CONTRA: Problem[] = [...PUMP_CONTRA, 'lvot-obstruction'];
/** …and an Impella, which sits across the aortic valve in the left ventricle (its instructions for use) */
const IMPELLA_CONTRA: Problem[] = [...PUMP_CONTRA, 'mechanical-aortic-valve', 'severe-aortic-stenosis', 'lv-thrombus', 'ventricular-septal-rupture'];
/** The device's own contraindications (the action being judged: 'iabp' or 'impella') */
const pumpContraindicated = (sc: Scenario, id: string) => hasProblem(sc, id === 'iabp' ? IABP_CONTRA : IMPELLA_CONTRA);
/**
 * A tamponade not yet drained — the case's Problem, or the flag 'tamponade' a case sets when one begins mid-case (a
 * perforation, a wire through the RV wall). The Impella's instructions for use list cardiac tamponade among its
 * contraindications in cardiogenic shock, and a balloon pump adds nothing to a heart that cannot fill
 */
const undrainedTamponade = (s: SimState, sc: Scenario) => (hasProblem(sc, ['tamponade']) || has(s, 'tamponade')) && !has(s, 'drained');
/** What rules out a catheter across the aortic valve into the left ventricle */
const LV_CROSSING_CONTRA: Problem[] = ['mechanical-aortic-valve', 'lv-thrombus'];

/** The actions that put iodinated contrast into the patient: the runs in the lab, and the scanner */
const CONTRAST_RUNS = ['angio', 'final-angio', 'oct', 'ct-urgent', ...CINE_VIEWS.map((v) => v.id)];

/** An earlier contrast reaction, and no steroid given yet this time */
const contrastUnprepared = (s: SimState, sc: Scenario) => hasProblem(sc, ['contrast-allergy']) && !has(s, 'steroid');

/** The scanner rules before the contrast one (see contrast-allergy-unprepared) */
const ctUnstable = (s: SimState) => s.pulse && lowPressure(s);
/** …not once the angiogram has shown clean coronaries (flag 'normal-coronaries', e.g. Takotsubo): no artery is waiting */
const ctDelaysReperfusion = (s: SimState, sc: Scenario) =>
  s.pulse && !lowPressure(s) && stemiNow(s) && !has(s, 'pci') && !has(s, 'rosc') && !has(s, 'normal-coronaries')
  && !hasProblem(sc, ['aortic-dissection', 'pulmonary-embolism', 'bleeding', 'stroke']);

/** A left ventriculogram in shock or with fluid on the lungs (lv-gram-in-shock) */
const lvGramInShock = (s: SimState, sc: Scenario) => s.pulse && (lowPressure(s) || hasProblem(sc, ['cardiogenic-shock', 'pulmonary-edema']));

export const PROCEDURE_RULES: Harm[] = [
  // on-scene resuscitation until a sustained ROSC, for most adults (2025 AHA Systems of Care). Only the loading is judged:
  // an arrest that begins en route is worked in the ambulance, and that is no mistake
  { id: 'transport-in-arrest', actions: ['transport-near', 'transport-pci'], when: (s, sc) => sc.setting === 'field' && !s.pulse, points: 6, severity: 'major', text: 'Loading the patient for transport during cardiac arrest. Compressions on a stretcher and in a moving ambulance are poorer and keep being interrupted, and what the arrest needs — high-quality CPR, a shock for VF or pulseless VT, epinephrine and the reversible causes — works right here. For most adults, work the arrest on scene until there is a sustained ROSC, then transport (2025 AHA).' },
  // the physician's needle, in the lab or the department (the tech only opens the tray). A case whose tamponade begins on
  // the way (a perforation, a dissection bleeding into the pericardium) sets the flag 'tamponade' then. The rule after it
  // judges a dissection's tamponade: the two never apply together
  { id: 'pericardiocentesis-no-tamponade', actions: ['pericardiocentesis'], roles: [5, 7], when: (s, sc) => !hasProblem(sc, ['tamponade']) && !has(s, 'tamponade'), points: 15, severity: 'critical', text: 'A pericardiocentesis without tamponade. The needle can puncture the heart, a coronary artery or the lung: it is for an effusion that is squeezing the heart (a low pressure, distended neck veins, the right heart collapsing in diastole on the ultrasound). Find the real cause of the shock instead.' },
  { id: 'pericardiocentesis-dissection-tamponade', actions: ['pericardiocentesis'], roles: [5, 7], when: (s, sc) => s.pulse && hasProblem(sc, ['aortic-dissection']) && (hasProblem(sc, ['tamponade']) || has(s, 'tamponade')), points: 8, severity: 'major', text: 'A needle drain for the tamponade of a torn aorta while a surgeon can operate. Emptying the sac lets the pressure rise and the bleeding restart, often worse: the operating room is the treatment. A controlled drainage of small amounts is a last resort only when no surgery can happen at once (2022 ACC/AHA aortic disease guideline).' },

  // The STEMI alert and the cath lab activation. Gate order: the no-STEMI rules > cath-lab-dissection
  // the physician stands the cath lab down (the default response); a case can say it in its own words
  { id: 'stemi-alert-no-ste', actions: ['stemi-alert'], when: (s) => !ecgShowsStemi(s), points: 3, severity: 'minor', text: 'A STEMI alert for a 12-lead that does not meet STEMI criteria. The alert calls the cath lab team in for an artery that is not known to be blocked (pericarditis, a bundle branch block, a thick heart muscle or a high potassium can raise the ST segments too). Transmit the 12-lead or give a radio report, and let the hospital decide.' },
  // the emergency department's activation, in its own words (the interventional cardiologist declines it: the default)
  { id: 'cath-lab-no-ste', actions: ['cath-lab-activate'], when: (s) => !ecgShowsStemi(s), points: 3, severity: 'minor', text: 'Activating the cath lab for a 12-lead that does not meet STEMI criteria. It calls the team in for an artery that is not known to be blocked (pericarditis, a bundle branch block, a thick heart muscle or a high potassium can raise the ST segments too). Repeat the 12-lead every 15–30 minutes while the pain goes on, add the posterior leads, send a troponin and consult cardiology.' },
  { id: 'cath-lab-dissection', actions: ['stemi-alert', 'cath-lab-activate'], when: (s, sc) => hasProblem(sc, ['aortic-dissection']) && ecgShowsStemi(s), points: 8, severity: 'major', text: 'Sending a torn aorta to the cath lab. A dissection can reach a coronary ostium and raise the ST segments, but the cath lab brings heparin, antiplatelet loading and catheters up the aorta — the worst treatment for the tear. Image the aorta (CT angiography or the bedside echo) and call the cardiac surgeon (2022 ACC/AHA aortic disease guideline).' },

  // The scanner. Gate order: ct-unstable > ct-delays-reperfusion > contrast-allergy-unprepared (below)
  { id: 'ct-unstable', actions: ['ct-urgent'], when: (s) => ctUnstable(s), points: 5, severity: 'major', text: 'Sending an unstable patient to the CT scanner. A systolic under 90 (with an LVAD, a Doppler MAP under 60) needs treatment here first (fluids, blood, pressors, the bleeding stopped): the scanner is no place to deteriorate.' },
  // after ROSC a CT to find the cause may be reasonable (2025 AHA), and a dissection, a PE, a bleed or a stroke are reasons
  { id: 'ct-delays-reperfusion', actions: ['ct-urgent'], roles: [4, 5, 7], when: (s, sc) => ctDelaysReperfusion(s, sc), points: 5, severity: 'major', text: 'A CT scan before the blocked artery is opened, with nothing to suggest a dissection, a pulmonary embolism, a bleed or a stroke. It takes the patient away from the defibrillator and the lab in the hours VF is most likely, adds a contrast load before the angiogram\'s own, and delays the artery being opened: in a STEMI the clock runs to the device (2025 ACC/AHA ACS).' },

  // The emergency department's lines and transfers
  { id: 'central-line-no-indication', actions: ['central-line'], roles: [7], when: (s, sc) => sc.setting === 'ed' && s.pulse && has(s, 'iv') && !lowPressure(s) && s.rhythm.hr >= 50 && !paced(s) && !has(s, 'pressor'), points: 3, severity: 'minor', text: 'A central line with no indication. The patient has a working IV and needs no vasopressor and no pacing wire: the line brings only its risks — a pneumothorax, an arterial puncture, bleeding, a line infection.' },
  // the cases' hospitals can treat what their patients have; a case whose hospital cannot (a STEMI in shock at a hospital
  // with no cath lab, where the transfer is the treatment) needs its own rule in this one's place
  { id: 'transfer-unstable', actions: ['transfer'], roles: [7], when: (s) => s.pulse && lowPressure(s), points: 5, severity: 'major', text: 'Transferring a patient with a systolic under 90 (with an LVAD, a Doppler MAP under 60) out of a hospital that can treat the cause. Stabilize and treat here: an unstable transfer is for a patient this hospital cannot treat, with a physician certifying that its benefit outweighs the risk (EMTALA), and the ambulance is no place to deteriorate.' },

  // The cath lab: consent, then anticoagulation before anything goes down the coronary
  // (an unresponsive patient's emergency is implied consent)
  { id: 'access-no-consent', actions: ['access', 'access-femoral', 'access-venous'], roles: [5], when: (s, sc) => sc.setting === 'cathlab' && s.pulse && s.vitals.gcs >= 14 && !has(s, 'consent'), points: 5, severity: 'major', text: 'Access before confirming consent, an earlier contrast reaction and the anticoagulants, in a patient awake enough to answer. The check finds what changes the plan: a contrast reaction to premedicate, a blood thinner that makes the puncture bleed, metformin and the kidneys.' },
  { id: 'pci-no-heparin', actions: ['wire-workhorse', 'wire-hydrophilic', 'balloon-predil', 'stent-des', 'aspiration'], roles: [5], when: (s) => !anticoagulated(s), points: 15, severity: 'critical', text: 'Wiring and ballooning the artery without anticoagulation. Catheters, wires and stents clot without heparin (70–100 U/kg, an ACT of 250–300 s) or bivalirudin, given for every PCI (2025 ACC/AHA ACS).' },
  // routine (upfront) aspiration before the vessel is opened in a primary PCI; a large thrombus left after the balloon is a
  // bail-out (flag 'predilated'), and so is a case that declares a large thrombus burden
  { id: 'aspiration-routine', actions: ['aspiration'], roles: [5], when: (s, sc) => anticoagulated(s) && profileShowsStemi(sc.initial.rhythm.profile) && !has(s, 'pci') && !has(s, 'predilated') && !hasProblem(sc, ['large-thrombus-burden']), points: 3, severity: 'minor', text: 'Routine aspiration thrombectomy in a primary PCI, before the balloon. It brings no benefit (TASTE, TOTAL), and in TOTAL more strokes (2025 ACC/AHA ACS: 3 — No Benefit): keep it as a bail-out for a large thrombus still there after the balloon.' },
  { id: 'covered-no-perforation', actions: ['stent-covered'], roles: [5], when: (s, sc) => !has(s, 'perforation') && !hasProblem(sc, ['bleeding']), points: 4, severity: 'minor', text: 'A covered stent without a perforation. Covered stents seal perforations; they restenose and clot more than drug-eluting stents.' },

  // The femoral sheath with the iliac and femoral arteries too diseased for it: the radial artery is the way in
  { id: 'femoral-access-pad', actions: ['access-femoral'], roles: [5], when: (_s, sc) => hasProblem(sc, ['peripheral-artery-disease']), points: 5, severity: 'major', text: 'Femoral access with severe iliofemoral disease (or an aortofemoral graft). The sheath can block or dissect a diseased artery, or go through a graft, and cost the leg: go radial, the preferred access anyway (2025 ACC/AHA ACS: radial over femoral).' },

  // The catheter across the aortic valve. Gate order (the LV gram): lv-crossing-contraindicated >
  // contrast-allergy-unprepared > lv-gram-in-shock > lv-gram-renal-failure
  { id: 'lv-crossing-contraindicated', actions: ['cath-pigtail', 'lv-gram', 'lvedp'], roles: [5], when: (_s, sc) => hasProblem(sc, LV_CROSSING_CONTRA), points: 15, severity: 'critical', text: 'A catheter across the aortic valve into the ventricle with a mechanical aortic valve or a clot in the left ventricle. A catheter can jam a mechanical leaflet open or shut, and it can knock the clot loose to the brain. The echo answers the question.' },
  { id: 'lv-gram-in-shock', actions: ['lv-gram'], roles: [5], when: (s, sc) => lvGramInShock(s, sc) && !hasProblem(sc, LV_CROSSING_CONTRA) && !contrastUnprepared(s, sc), points: 3, severity: 'minor', text: 'A left ventriculogram in shock or pulmonary edema. 30–40 mL of contrast at high speed into a failing ventricle: more volume for wet lungs and more contrast for failing kidneys, for what the echo shows at the bedside.' },
  { id: 'lv-gram-renal-failure', actions: ['lv-gram'], roles: [5], when: (s, sc) => hasProblem(sc, ['renal-failure']) && !lvGramInShock(s, sc) && !hasProblem(sc, LV_CROSSING_CONTRA) && !contrastUnprepared(s, sc), points: 3, severity: 'minor', text: 'A left ventriculogram with failing kidneys. 30–40 mL more contrast for what the echo shows at the bedside: with kidneys already failing, every milliliter counts toward contrast-associated kidney injury — keep the contrast to the minimum (2021 ACC/AHA/SCAI revascularization guideline).' },
  // the operator's (and the nurse's or the ER doctor's) decision: the tech's cine run is the operator's order. The scanner
  // counts too — the stroke's CT angiography as well as a chest CT carries contrast
  { id: 'contrast-allergy-unprepared', actions: CONTRAST_RUNS, roles: [4, 5, 7], when: (s, sc, id) => contrastUnprepared(s, sc) && !(id === 'lv-gram' && s.role === 5 && hasProblem(sc, LV_CROSSING_CONTRA)) && !(id === 'ct-urgent' && (ctUnstable(s) || ([4, 5, 7].includes(s.role) && ctDelaysReperfusion(s, sc)))), points: 5, severity: 'major', text: 'Contrast for a patient who reacted to it before, without the steroid (and antihistamine) given first. In an emergency give IV methylprednisolone (and diphenhydramine) and go — do not delay the artery — with epinephrine drawn up (ACR Manual on Contrast Media).' },

  // The pumps (the operator's). Gate order: iabp-contraindicated and impella-contraindicated > mcs-tamponade >
  // mcs-bleeding > mcs-no-cardiogenic-shock > iabp-routine-shock
  { id: 'iabp-contraindicated', actions: ['iabp'], roles: [5], when: (s, sc) => s.pulse && hasProblem(sc, IABP_CONTRA), points: 15, severity: 'critical', text: 'A balloon pump in a patient it can harm. Inflating in diastole it pours blood back through a leaking aortic valve and can extend an aortic dissection, and its sheath in a diseased iliac or femoral artery can cost the leg (IABP instructions for use); with LV outflow obstruction its deflation lowers the afterload as the ventricle ejects and the gradient climbs (InterTAK 2018). Choose another support, or none.' },
  { id: 'impella-contraindicated', actions: ['impella'], roles: [5], when: (s, sc) => s.pulse && hasProblem(sc, IMPELLA_CONTRA), points: 15, severity: 'critical', text: 'An Impella in a patient its label rules out: a clot in the left ventricle (the pump can suck it in and throw it to the brain), a mechanical aortic valve, severe aortic stenosis or regurgitation, a ventricular septal rupture, an aortic dissection, or iliac and femoral arteries too diseased for the sheath (Impella instructions for use).' },
  { id: 'mcs-tamponade', actions: ['iabp', 'impella'], roles: [5], when: (s, sc, id) => s.pulse && undrainedTamponade(s, sc) && !pumpContraindicated(sc, id), points: 10, severity: 'major', text: 'A mechanical pump with the heart squeezed by a tamponade not yet drained. No pump can fill a heart that cannot fill: the Impella\'s instructions for use list cardiac tamponade as a contraindication, and a balloon pump adds nothing to a squeezed heart. Drain it first (pericardiocentesis), with fluid meanwhile.' },
  { id: 'mcs-bleeding', actions: ['iabp', 'impella'], roles: [5], when: (s, sc, id) => s.pulse && hasProblem(sc, ['bleeding']) && !undrainedTamponade(s, sc) && !pumpContraindicated(sc, id), points: 10, severity: 'major', text: 'A mechanical pump in a bleeding patient. It needs another large-bore arterial sheath and full anticoagulation, and it fixes neither the bleeding nor a squeezed heart: stop the bleeding, drain a tamponade, give volume and blood.' },
  { id: 'mcs-no-cardiogenic-shock', actions: ['iabp', 'impella'], roles: [5], when: (s, sc, id) => s.pulse && !lowPressure(s) && !hasProblem(sc, ['cardiogenic-shock', 'bleeding']) && !undrainedTamponade(s, sc) && !pumpContraindicated(sc, id), points: 5, severity: 'major', text: 'A balloon pump or an Impella without cardiogenic shock. Nothing needs support (outside a planned high-risk PCI, where the heart team may choose one), and the large-bore femoral access brings bleeding, limb ischemia and stroke (and with an Impella, hemolysis).' },
  // heavier than routine aspiration (3, minor), the same class (3 — No Benefit): the balloon pump also takes a large-bore
  // arterial sheath, and choosing it puts off the support with a survival benefit
  { id: 'iabp-routine-shock', actions: ['iabp'], roles: [5], when: (s, sc) => s.pulse && hasProblem(sc, ['cardiogenic-shock']) && !undrainedTamponade(s, sc) && !hasProblem(sc, ['mechanical-complication', 'bleeding', ...IABP_CONTRA]), points: 5, severity: 'major', text: 'A routine balloon pump in infarct-related cardiogenic shock. It did not improve survival (IABP-SHOCK II; 2025 ACC/AHA ACS: 3 — No Benefit); a microaxial pump (Impella) is the support with a survival benefit in selected STEMI shock (2a), and a balloon pump is kept for a mechanical complication, as a bridge to surgery.' },
];
