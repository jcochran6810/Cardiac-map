import type { Effect, Line, PendingRead, Scenario, SimState, Speaker } from '../types';
import { PADS, bpAfter, firstDone, has, line, mapOf } from '../kit';
import {
  LEFT_GUIDES, MD, RIGHT_GUIDES, RN, TECH, WIRES, angioGate, anticoagulated, askCritical, askEvents, askHarm, cine, type LabAsk,
} from '../labKit';
import { ANTITHROMBOTIC_RULES, NITRATE_RULES, PROTAMINE_RULES, SEDATIVE_RULES } from '../rules/acs';
import { RATE_RULES, yieldToHeavier } from '../rules/rhythm';

/**
 * A thrombotic left main in cardiogenic shock. A 72-year-old man comes straight up from the emergency department with
 * crushing chest pain, a pressure of 78/50 and wet lungs. The 12-lead shows ST elevation in aVR with ST depression in
 * most other leads: global subendocardial ischemia. That is not a formal STEMI criterion, but cardiogenic shock in an
 * acute coronary syndrome calls for emergency angiography and revascularization of the culprit either way (2025
 * ACC/AHA/ACEP/NAEMSP/SCAI ACS guideline). The angiogram shows thrombus in the left main trunk, with slow flow into both
 * the LAD and the circumflex; the dominant RCA has an old 70 % narrowing.
 *
 * Right care: a vasopressor (norepinephrine), oxygen, the surgeon told but not waited for, heparin with the ACT checked,
 * a microaxial flow pump (Impella) before the left main is touched, IVUS-guided stenting of the left main only — the RCA
 * is left for later (CULPRIT-SHOCK) — and IV cangrelor rather than tablets. Traps: no support (a balloon in the left
 * main of an unsupported, failing ventricle brings VF), nitroglycerin or a beta-blocker in shock, fluid or raised legs
 * into wet lungs, a sedative that drops the pressure, stenting the RCA too, and waiting for surgery while PCI is faster.
 *
 * The tech zeroes the transducers, puts the pads on, primes the pump, runs the ACT, hands the devices and calls out the
 * pressure; the nurse starts the pressor, gives the oxygen and the drugs the cardiologist orders, calls the surgeon and
 * watches the rhythm; the cardiologist does it all.
 */

/**
 * The real image: a left coronary run (LAO caudal) with thrombus partly blocking the left main trunk near its ostium. It
 * comes from another patient's article, managed there without a stent; what it shows — clot in the left main with
 * contrast still passing it — is what this patient's run shows. The after-picture from that article (days later, on
 * medical treatment) does not fit a stent, so the final run here is described in words.
 */
const IMAGES: Partial<Record<string, string>> = { angio: 'lm-thrombus-eptifibatide-before' };

/** The patient weighs 80 kg: the PCI heparin dose is 70–100 units/kg; he gets 100 units/kg because a pump is going in */
const HEPARIN_LINE = 'Heparin 8,000 units IV (100 units/kg), flushed.';

const IVUS_BEFORE = 'IVUS: plaque rupture with a large thrombus from the ostium of the left main over 9 mm of its shaft; minimum lumen area 3.1 mm². The left main is 13 mm long, its reference lumen 4.4 mm (vessel 5.0 mm). The distal left main and the ostia of the LAD and the circumflex are free of plaque.';
const IVUS_UNDER = 'IVUS: the stent covers the ostium and the whole lesion, but it is under-expanded at the ostium: minimum stent area 9.8 mm², 64 % of the reference lumen area. Post-dilate it with a non-compliant balloon sized to the left main.';
const IVUS_AFTER = 'IVUS after the post-dilation: minimum stent area 14.2 mm², 93 % of the reference lumen area; fully apposed; the ostium covered; no dissection at either edge; the LAD and circumflex ostia untouched.';
const FINAL_LINE = 'Final angiogram, LAO caudal and RAO caudal: the left main stent fully expanded and covering the ostium, no dissection at its edges; the LAD and the circumflex fill briskly to their ends (TIMI 3). The RCA narrowing is left alone.';

const angioRun = (who: Speaker) => cine('angio', 'Diagnostic angiography: left and right coronaries', IMAGES.angio, [
  [who, 'Thrombus in the left main trunk from just beyond its ostium; the LAD and the circumflex fill slowly beyond it. The dominant RCA has an old 70 % narrowing in its mid segment.'],
], {
  kind: 'angio', answer: 'angio-thrombus', partial: ['angio-lm'], prompt: 'What does the left coronary run show?',
  explain: 'A large thrombus in the left main trunk, with contrast still passing it slowly into the LAD and the circumflex: an acute thrombotic left main — the culprit that puts almost the whole left ventricle at risk, and the cause of the ST elevation in aVR with ST depression everywhere else. It is clot, not a fixed narrowing ("left main stenosis" is half the read), and it is not occluded: TIMI 0 would look different. The 70 % narrowing in the dominant RCA is old disease, not the culprit: in shock, open the culprit only (CULPRIT-SHOCK).',
}, [[who, 'Right coronary: dominant, with a 70 % narrowing in its mid segment. The left coronary run is on the Imaging screen.']]);

const rhcRead: Omit<PendingRead, 'minute'> = {
  kind: 'hemo', answer: 'hemo-cardiogenic', partial: ['hemo-lvedp-high'], prompt: 'What do these numbers show?',
  explain: 'A wedge of 30, a cardiac index of 1.5 and a PA saturation of 46 %: cardiogenic shock — a failed left ventricle with high filling pressures and a low output (cold and wet). A pressor for the pressure, a pump for the ventricle, open the culprit — and no fluid.',
};

/**
 * The right heart numbers in shock. The SVR is worked out from the pressure he has when they are taken (80 × (MAP − RA) / CO),
 * so it matches the arterial line: about 1,200 before the pressor, about 1,400 on it
 */
function rhcShock(s: SimState): string {
  const svr = Math.round((80 * (mapOf(s.vitals) - 14)) / 3.0 / 10) * 10;
  return `RA 14 · RV 46/14 · PA 46/28 (mean 34) · PCWP 30 · CO 3.0 L/min, CI 1.5 · SVR ${svr.toLocaleString('en-US')} · PA saturation 46 %.`;
}
const RHC_SUPPORTED = 'RA 10 · RV 36/10 · PA 34/20 (mean 26) · PCWP 16 · CO 4.4 L/min with the pump, CI 2.3 · PA saturation 58 %.';

/**
 * Where the pump goes. The catheters and the guide cannot share the Impella's 14 French sheath: when they come in through
 * the right groin, the pump goes in through the left one (its closure sutures placed with the first access); when they
 * come in through the wrist, the pump takes the right groin
 */
const pumpSide = (s: SimState) => (has(s, 'pump-left') ? 'left' : 'right');

/** The learner has read the run: until then nobody in the room says where the culprit is */
const named = (s: SimState) => s.reads.some((r) => r.kind === 'angio');

/**
 * Mechanical support is in: the Impella (it carries the circulation through a left main inflation) or a balloon pump (it does
 * far less). Either one's sheath stays in the groin until the pump comes out in the cardiac ICU
 */
const supported = (s: SimState) => has(s, 'impella') || has(s, 'iabp');

/** Only a patient awake enough to talk says how he feels */
const awake = (s: SimState, text: string): Line[] => (s.pulse && s.vitals.gcs >= 13 ? [['patient', `"${text}"`]] : []);

/** Things that drop the pressure or flood the lungs further: the pressure moves by (dSbp, dDbp), never below a perfusing floor */
function worse(s: SimState, dSbp: number, dDbp: number, text: (bp: string) => string, flags: string[], extra: Partial<SimState['vitals']> = {}): Effect {
  const bp = bpAfter(s, dSbp, dDbp);
  return { say: [['monitor', text(`${bp.sbp}/${bp.dbp}`), 'bad']], vitals: { ...bp, ...extra }, flags };
}

/** More volume for a failing, overfilled left ventricle (a bolus, raised legs, a unit of blood): it goes to the lungs */
function wetter(s: SimState, what: string, flags: string[]): Effect {
  const spo2 = Math.max(70, s.vitals.spo2 - 3);
  return worse(s, 2, 1, (bp) => `${what} BP ${bp}; SpO₂ ${spo2} %, breathing faster.`, flags, { spo2, rr: Math.min(44, s.vitals.rr + 4) });
}

/** Norepinephrine 0.1 mcg/kg/min, titrated to a mean of 65 or more (it never brings a higher pressure down) */
function norepinephrine(s: SimState, who: Speaker): Effect {
  const sbp = Math.max(s.vitals.sbp, 90);
  const dbp = Math.max(s.vitals.dbp, 56);
  return {
    say: [[who, who === 'you' ? 'Norepinephrine 0.1 mcg/kg/min running, titrated to a mean of 65.' : 'Norepinephrine running, titrated to a mean of 65.'], ['monitor', `BP ${sbp}/${dbp}.`]],
    vitals: { sbp, dbp }, flags: ['pressor'],
  };
}

/** The Impella CP across the aortic valve: it unloads the ventricle and adds about 3 L/min — the pressure and the oxygen come up */
function impellaIn(s: SimState, who: Speaker): Effect {
  const sbp = Math.max(s.vitals.sbp, has(s, 'pressor') ? 104 : 94);
  const dbp = Math.max(s.vitals.dbp, has(s, 'pressor') ? 72 : 62);
  return {
    say: [
      [who, `Impella CP from the ${pumpSide(s)} common femoral artery, through a 14 French sheath over the closure sutures, across the aortic valve: inlet 3.5 cm below the valve, P-8, flow 3.4 L/min.`],
      ['monitor', `BP ${sbp}/${dbp}. SpO₂ ${Math.max(s.vitals.spo2, 93)} %.`],
    ],
    vitals: { sbp, dbp, spo2: Math.max(s.vitals.spo2, 93), rr: Math.min(s.vitals.rr, 24) }, flags: ['impella', 'mcs'],
  };
}

/** The femoral access when the catheters come in through the groin: the left groin gets its closure sutures now, for the pump */
const BOTH_GROINS = 'Right common femoral artery under ultrasound, over the femoral head: a 7 French sheath for the catheters. The left common femoral artery under ultrasound too, with two closure sutures placed for the 14 French sheath the pump will need.';

/** The surgeon, once the run is on the screen: too sick for the operating room now, and the room needs 90 minutes — open it, I am the backup */
const SURGEON_SEEN: Line = ['hospital', 'Cardiac surgeon, on the phone: "I\'ve seen the run. He\'s too sick for the OR right now, and the room needs ninety minutes anyway. Open the left main — that\'s the fastest way to his heart. I\'ll be in the hospital as your backup, and we\'ll talk about the RCA once he\'s stable."'];

/**
 * The call to cardiac surgery. Called before the run is read (a fair call in shock with this 12-lead), the surgeon asks for the
 * pictures and calls back once they are read (event 'surgeon-calls-back'); after it, the answer comes at once
 */
function surgeonCall(s: SimState): Effect {
  if (!named(s)) return { say: [['hospital', 'Cardiac surgery notified: the surgeon is coming in and wants to see the pictures as soon as there are some.']], flags: ['surgery-called'] };
  return { say: [SURGEON_SEEN], flags: ['surgery-called', 'surgeon-seen'] };
}

/**
 * Refused with the reason, at no cost: no time passes and nothing is counted (a drug already given by a teammate, a sheath that
 * carries the pump, a guide before the pictures)
 */
const notNow = (text: string): Effect => ({ blocked: true, say: [['system', text]] });

/** Fentanyl 25 mcg: the pain eases with no fall in the pressure (a sedative would drop it) */
function fentanyl(s: SimState, who: Speaker): Effect {
  return {
    say: [[who, 'Fentanyl 25 mcg IV.'], ...awake(s, 'That takes the edge off.')],
    vitals: { pain: Math.max(0, s.vitals.pain - 3), rr: Math.min(s.vitals.rr, Math.max(12, s.vitals.rr - 1)) }, flags: ['analgesia'],
  };
}

/** The ACT: in range once heparin (or bivalirudin) is on board */
function act(s: SimState, who: Speaker): Effect {
  if (has(s, 'bivalirudin')) return { say: [[who, 'ACT 338 s, with bivalirudin running.']], flags: ['act'] };
  if (has(s, 'heparin')) return { say: [[who, 'ACT 276 s: over 250 — ready for the pump and the wire.']], flags: ['act'] };
  return { say: [[who, 'ACT 132 s: no heparin on board yet.']], flags: ['act'] };
}

/**
 * A shock in VF. The rhythm comes back; the stented left main stays open (the reperfusion event then brings the rate and
 * the pressure up), an unopened one stays ischemic
 */
function shockOutcome(s: SimState): Effect | null {
  if (s.pulse || s.rhythm.profile !== 'vf') return null;
  // the pump goes on pulling blood through the arrest: with it in, the pressure comes back higher
  const sbp = has(s, 'impella') ? 96 : has(s, 'pressor') ? 84 : 70;
  const dbp = has(s, 'impella') ? 64 : has(s, 'pressor') ? 52 : 42;
  return {
    say: [['monitor', 'Shock delivered: 200 J.'], ['you', `An organized rhythm is back: ${sbp}/${dbp} on the arterial line.`, 'warn']],
    rhythm: has(s, 'pci') ? { profile: 'sinus-tachycardia', hr: 112 } : { profile: 'nstemi', hr: 118 }, pulse: true,
    vitals: { sbp, dbp, gcs: 9 }, flags: ['pads', 'monitor', 'shocked'],
  };
}

const vfLines = (s: SimState): Line[] => [
  ['monitor', 'Monitor alarm — he is unresponsive!', 'bad'],
  ...(s.role === 5 ? [line('team', 'Tech: "Doctor — look at the monitor!"', 'bad')] : []),
];

// ─── What the operator asks for ────────────────────────────────────────────

/** The tech: the diagnostic catheter, the pump, the ACT, the guide, the IVUS, the stent and the post-dilation balloon */
const TECH_ASKS: LabAsk[] = [
  {
    id: 'diag', when: (s) => has(s, 'access'), early: true,
    ask: 'Diagnostic catheter for the left coronary from the groin, please.',
    // the Tiger is a radial catheter: from the groin the Judkins curves are the ones that fit
    accept: ['cath-jl4'], wrong: ['cath-jr4', 'cath-pigtail', 'cath-tiger'],
    wrongSay: 'Not that one — from the groin, the left coronary first: a JL4.',
    thanks: 'JL4 — thanks. Left coronary first, then the right.', fallback: 'I\'ll open the JL4 myself.', gives: 'diag-in-hand',
    label: 'Diagnostic catheter for the left coronary (JL4)',
    why: 'From the femoral artery a Judkins left 4 engages the left coronary; the right coronary follows with a JR4. A pigtail is for the LV, not the coronaries, and a Tiger is shaped for the radial approach.',
  },
  {
    // fires as the run is recorded, before it is read: it says how sick he is, not where the culprit is
    id: 'impella', when: (s) => has(s, 'angio'), early: true,
    ask: 'He needs support before I go anywhere near this: prime the Impella, please.',
    accept: ['impella'], wrong: ['iabp'],
    wrongSay: 'Not the balloon pump — it does not change survival in infarct shock. The Impella, please.',
    thanks: 'Thanks — taking the pump across the valve once the ACT is over 250.', fallback: 'I\'ll prime the Impella myself.', gives: 'impella-primed',
    label: 'Prime the Impella console', points: 10,
    why: 'A microaxial flow pump pulls blood from the LV into the aorta: it unloads the failing ventricle and keeps the circulation going while a balloon blocks the left main. In STEMI shock it improved survival at 180 days (DanGer Shock: 45.8 % vs 58.5 % died); a balloon pump did not (IABP-SHOCK II). Prime it while the run is read, so the pump is not what everyone waits for.',
  },
  {
    // asked together with the pump, which takes 5 minutes to prime: either order is right, so the operator waits for both
    id: 'act', when: anticoagulated, within: 6, wait: 6,
    ask: 'Heparin\'s in. An ACT, please — I want it over 250 before the pump goes in.',
    accept: ['act'],
    thanks: 'Thanks.', fallback: 'I\'ll run the ACT myself.', gives: 'act-known',
    fallbackEffect: (s) => act(s, 'team'),
    label: 'ACT before the pump goes in',
    why: 'The large-bore sheath, the pump and the coronary wire clot without enough heparin: an ACT of 250 s or more before the Impella goes in (250–300 s for the PCI).',
  },
  {
    id: 'guide', when: (s) => has(s, 'impella'), early: true,
    ask: 'Pump\'s running. A guide for the left system with good back-up, please — 7 French.',
    accept: LEFT_GUIDES, wrong: RIGHT_GUIDES,
    wrongSay: 'That is a right-coronary guide. The culprit is on the left: the EBU, please.',
    thanks: 'EBU — thanks. Gently into the ostium.', fallback: 'I\'ll open the guide myself.', gives: 'guide-in-hand',
    label: 'A left guide with back-up (EBU)',
    why: 'An extra-back-up guide sits coaxially in the left main and gives the support to deliver the IVUS catheter, balloons and the stent. JR4 and AL1 are right-coronary shapes.',
  },
  {
    // OCT is the wrong tool here: the flush cannot clear an ostial left main with the guide sitting in it
    id: 'ivus', when: (s) => has(s, 'wired'),
    ask: 'Wire\'s down the LAD. IVUS, please — I want to see the left main and size it before I stent.',
    accept: ['ivus'], wrong: ['oct'],
    wrongSay: 'Not OCT — the flush can\'t clear an ostial left main, and he has had enough contrast. IVUS, please.',
    // the pullback's result comes with the run itself: the thanks follows it
    thanks: 'Thanks — that sizes it.', fallback: 'I\'ll set up the IVUS myself.', gives: 'ivus-done',
    fallbackEffect: () => ({ say: [['operator', IVUS_BEFORE]], flags: ['ivus'] }),
    label: 'IVUS set up for the left main',
    why: 'Intravascular imaging to guide left main PCI is a Class 1 recommendation (2025 ACC/AHA ACS): it sizes the stent to the vessel and shows whether it is fully expanded. IVUS, not OCT, at an ostial left main: OCT needs the blood flushed out, which a guide sitting in the ostium cannot do.',
  },
  {
    id: 'stent', when: (s) => has(s, 'ivus'),
    ask: 'Drug-eluting stent, 4.5 by 12, please.',
    accept: ['stent-des'], wrong: ['stent-covered', 'balloon-nc', 'balloon-predil'],
    wrongSay: 'No — a drug-eluting stent, 4.5 by 12.',
    thanks: '4.5 by 12 — confirmed. Positioning it at the ostium.', fallback: 'I\'ll open the stent myself.', gives: 'stent-in-hand',
    label: 'Drug-eluting stent, as ordered',
    why: 'Say the size back to the operator and check it on the box before you open it: sized from the IVUS reference (lumen 4.4 mm, vessel 5.0 mm), long enough to cover the ostium and the 9 mm of plaque and clot.',
  },
  {
    id: 'nc', when: (s) => has(s, 'pci') && s.pulse,
    ask: 'Non-compliant balloon, 5.0 by 8, please — to expand the stent and flare the ostium.',
    accept: ['balloon-nc'], wrong: ['balloon-predil', 'stent-des', 'stent-covered'],
    wrongSay: 'Not that — a non-compliant balloon, 5.0 by 8. A compliant one stretches the vessel at the stent edges instead of expanding the stent.',
    thanks: 'Thanks. High pressure in the left main now.', fallback: 'I\'ll get the NC balloon myself.', gives: 'nc-in-hand',
    label: 'Non-compliant balloon for the post-dilation',
    why: 'A non-compliant balloon sized to the left main expands the stent fully and flares it at the ostium. An under-expanded left main stent is the strongest predictor of stent thrombosis and restenosis — and in the left main either can kill.',
  },
];

/** The nurse: the pressor, the heparin, the surgeon, the ACT, the IV P2Y12 inhibitor and a careful analgesic */
const RN_ASKS: LabAsk[] = [
  {
    // fluid, raised legs, blood and phenylephrine each carry their own penalty: the operator's word only, no second one. Push-dose
    // epinephrine is a bridge, not the answer: it wears off in minutes, so the operator still wants the infusion (event
    // 'push-epi-bridge'). An IV takes 2 minutes first, so the operator waits 4 before starting it himself
    id: 'pressor', role: 4, when: () => true, within: 3, wait: 4,
    ask: 'His pressure is 78 over 50 and his lungs are wet. Get his pressure up, please.',
    accept: ['pressor'], wrong: ['fluid', 'legs-up', 'transfuse', 'phenylephrine'],
    wrongSay: 'Not that — his lungs are already full and his heart is failing. A pressor: norepinephrine, to a mean of 65.',
    thanks: 'Thanks — titrate to a mean of 65.', fallback: 'I\'ll start the norepinephrine myself.', gives: 'pressor-given',
    fallbackEffect: (s) => norepinephrine(s, 'team'),
    label: 'A vasopressor for the cardiogenic shock (norepinephrine)', points: 10,
    why: 'Norepinephrine is the first vasopressor in cardiogenic shock: it raises the pressure with fewer arrhythmias than dopamine. Push-dose epinephrine only bridges a few minutes. A failing, overfilled left ventricle cannot use more volume — fluid goes to the lungs.',
  },
  {
    // protamine carries its own penalty (protamine-in-pci): the operator's word only. Bivalirudin instead of the heparin that
    // was ordered gets its own word (event 'rn-bivalirudin-instead'), and the item is simply not done. Heparin the nurse gave
    // before the order counts (early): nobody gives a second bolus
    id: 'heparin', role: 4, when: (s) => has(s, 'angio'), early: true,
    ask: 'Heparin, 100 units per kilo, please — a pump is going in.',
    accept: ['heparin'], wrong: ['protamine'],
    wrongSay: 'No — protamine reverses it! Heparin: he needs anticoagulation for the pump and the wire.',
    thanks: 'Thanks. ACT in a few minutes.', fallback: 'I\'ll give the heparin myself.', gives: 'heparin-given',
    fallbackEffect: () => ({ say: [['team', HEPARIN_LINE]], flags: ['heparin', 'anticoag'] }),
    label: 'Heparin for the pump and the PCI',
    why: 'Unfractionated heparin 70–100 units/kg for PCI (ACT 250–300 s); the Impella and its large-bore sheath clot without it.',
  },
  {
    // a call made before the run was read counts (early): the surgeon calls back once the pictures are read
    id: 'surgery', role: 4, when: named, early: true,
    ask: 'Call cardiac surgery for me, please: a thrombotic left main in shock. I\'m stenting it now — I want the surgeon aware and the OR as a backup.',
    accept: ['call-surgery'],
    thanks: 'Thanks.', fallback: 'I\'ll call surgery myself.', gives: 'surgeon-aware',
    fallbackEffect: surgeonCall,
    label: 'Call cardiac surgery (the heart team)',
    why: 'A left main culprit is a heart-team decision: the surgeon hears about it at once, even when PCI is the fastest way in, so the operating room is ready if the PCI fails or the anatomy needs surgery.',
  },
  {
    // after the pictures: an early heparin bolus waits for the operator's plan before its ACT is asked for
    id: 'rn-act', role: 4, when: (s) => anticoagulated(s) && has(s, 'angio'),
    ask: 'An ACT, please — I want it over 250 before the pump goes in.',
    accept: ['act'],
    thanks: 'Thanks — taking the pump in.', fallback: 'I\'ll run the ACT myself.', gives: 'act-known',
    fallbackEffect: (s) => act(s, 'team'),
    label: 'ACT before the pump goes in',
    why: 'The large-bore sheath, the pump and the coronary wire clot without enough heparin: an ACT of 250 s or more before the Impella goes in.',
  },
  {
    // cangrelor the nurse started before the order counts (early): it is not started twice
    id: 'p2y12', role: 4, when: (s) => has(s, 'impella'), early: true,
    ask: 'Support is in. Now a P2Y12 inhibitor, please — the IV one.',
    accept: ['cangrelor'], wrong: ['p2y12'],
    wrongSay: 'Not a tablet — he is drowsy, the gut absorbs little in shock, and if the surgeon has to take him a ticagrelor load means days of bleeding. Cangrelor: it works in minutes and wears off within an hour.',
    thanks: 'Thanks.', fallback: 'I\'ll start the cangrelor myself.', gives: 'p2y12-given',
    fallbackEffect: () => ({ say: [['team', 'Cangrelor 30 mcg/kg bolus, 4 mcg/kg/min running.']], flags: ['p2y12', 'cangrelor'] }),
    label: 'IV P2Y12 inhibitor (cangrelor)',
    why: 'In shock the gut absorbs oral P2Y12 tablets slowly and a drowsy patient may aspirate them; cangrelor works within minutes, and its effect is gone within an hour of stopping it if he needs emergency surgery.',
  },
  {
    // a sedative carries its own penalty (sedation-in-shock): the operator's word only
    id: 'pain', role: 4, when: (s) => has(s, 'p2y12-given'),
    ask: 'He\'s hurting and frightened. Something small for the pain, please — nothing that drops his pressure.',
    accept: ['fentanyl'], wrong: ['midazolam', 'sedation'],
    wrongSay: 'Not a sedative — it will drop his pressure and his breathing. Fentanyl, 25 micrograms.',
    thanks: 'Thanks.', fallback: 'I\'ll give him a little fentanyl myself.', gives: 'pain-treated',
    fallbackEffect: (s) => fentanyl(s, 'team'),
    label: 'A small dose of fentanyl, not a sedative',
    why: 'Fentanyl 25 mcg IV eases the pain with little effect on the pressure; a benzodiazepine or a sedation dose drops the pressure and the breathing of a shocked, hypoxic patient.',
  },
];

export const cathlabLeftMain: Scenario = {
  id: 'left-main-shock-cathlab',
  title: 'Cardiogenic shock: the whole left ventricle at risk',
  summary: '72-year-old man in cardiogenic shock with crushing chest pain and wet lungs. Read his 12-lead, hold up his pressure and his pump, find the culprit — and open only that, fast.',
  setting: 'cathlab',
  roles: [3, 4, 5],
  difficulty: 'advanced',
  // strictly an NSTE-ACS (no STEMI criteria): the NSTEMI page teaches the aVR pattern and the left main; the shock page already
  // links to the anterior STEMI shock case
  conditionId: 'nstemi',
  images: IMAGES,
  briefing: {
    default: [
      ['team', 'Lab activated from the emergency department: 72-year-old man, 80 kg, crushing chest pain for 2 hours, then breathless and gray. BP 78/50, HR 112, SpO₂ 86 % on 4 L by nasal cannula, lactate 6.1. The ED physician calls the 12-lead "diffuse ST changes". Aspirin 324 mg given; heparin and the P2Y12 inhibitor left for the lab.'],
      ['scene', 'He is gray, sweaty and drowsy, propped up and fighting for breath; you can hear the crackles from the door.'],
    ],
    3: [
      ['team', 'Lab activated from the emergency department: 72-year-old man, 80 kg, crushing chest pain for 2 hours, then breathless and gray. BP 78/50, HR 112, SpO₂ 86 % on 4 L by nasal cannula, lactate 6.1. The ED physician calls the 12-lead "diffuse ST changes". Aspirin 324 mg given; heparin and the P2Y12 inhibitor left for the lab.'],
      ['scene', 'He is gray, sweaty and drowsy, propped up and fighting for breath; you can hear the crackles from the door.'],
      ['team', 'You are the scrub tech: the room, the pads, the transducers and the pressures, the pump console, the ACT, the devices the cardiologist asks for — and calling out what you see. The nurse is at his head.'],
    ],
    4: [
      ['team', 'Lab activated from the emergency department: 72-year-old man, 80 kg, crushing chest pain for 2 hours, then breathless and gray. BP 78/50, HR 112, SpO₂ 86 % on 4 L by nasal cannula, lactate 6.1. The ED physician calls the 12-lead "diffuse ST changes". Aspirin 324 mg given; heparin and the P2Y12 inhibitor left for the lab.'],
      ['scene', 'He is gray, sweaty and drowsy, propped up and fighting for breath; you can hear the crackles from the door.'],
      ['team', 'You are the procedural nurse: his airway, oxygen and comfort, his rhythm, the pressor, and the drugs the cardiologist orders. The tech is scrubbed at the table.'],
    ],
    5: [
      ['team', 'Lab activated from the emergency department: 72-year-old man, 80 kg, crushing chest pain for 2 hours, then breathless and gray. BP 78/50, HR 112, SpO₂ 86 % on 4 L by nasal cannula, lactate 6.1. The ED physician calls the 12-lead "diffuse ST changes". Aspirin 324 mg given; heparin and the P2Y12 inhibitor left for the lab.'],
      ['scene', 'He is gray, sweaty and drowsy, propped up and fighting for breath; you can hear the crackles from the door.'],
      ['team', 'You are the interventional cardiologist: every choice is yours. The tech and the nurse are with you; his wife is on the phone.'],
    ],
  },
  initial: {
    rhythm: { profile: 'nstemi', hr: 112 },
    vitals: { sbp: 78, dbp: 50, spo2: 86, rr: 30, etco2: 28, pain: 7, gcs: 14, glucose: 214, temp: 36.2 },
  },
  // wet lungs and a high wedge: no bolus and no raised legs. An LVEF of about 25 %: no IV diltiazem or verapamil, no
  // procainamide (the built-in rules know both)
  problems: ['pulmonary-edema', 'heart-failure', 'acs', 'cardiogenic-shock'],
  facts: {
    allergies: 'His wife, on the phone: "No allergies. He takes metformin, lisinopril and a statin. Yes — do whatever he needs."',
    sample: 'No allergies. Metformin, lisinopril, atorvastatin. Diabetes, high blood pressure and cholesterol; quit smoking ten years ago.',
    opqrst: '"Two hours… crushing… right across my chest… can\'t breathe lying down…"',
    lungs: (s) => (has(s, 'impella') || has(s, 'reperfused') ? 'Crackles at both bases — less than on arrival.' : 'Crackles to the mid-zones on both sides.'),
    perfusion: (s) => (has(s, 'impella')
      ? `${pumpSide(s) === 'left' ? 'Left' : 'Right'} leg below the large-bore sheath: the foot is pink and warm, with dorsalis pedis and posterior tibial signals on the Doppler; capillary refill 3 seconds. His knees are less mottled than on arrival.`
      : 'Cold, mottled knees; thready pulses; capillary refill 5 seconds; neck veins full.'),
    labs: 'Lactate 6.1, creatinine 1.8 (1.0 last year), potassium 4.9, hemoglobin 13.4, platelets 228, INR 1.1. High-sensitivity troponin 4,200 ng/L.',
    // the explanation the feedback gives after each 12-lead read: the vector model's ST shifts for the 'nstemi' profile are
    // about 1–1.5 mm down in I, II and V4–V6, less in aVF and V3, and about 1 mm up in aVR (a little in V1)
    ecg12: (s) => {
      if (s.rhythm.profile === 'nstemi') {
        return `Sinus tachycardia ${s.rhythm.hr}: ST depression in I, II, aVF and V3–V6 (deepest in II and V5), with ST elevation in aVR and a little in V1. ST elevation in aVR with ST depression in most other leads is global subendocardial ischemia: in a patient in shock, think left main or three-vessel disease. It is not a formal STEMI criterion — but cardiogenic shock makes emergency angiography the rule either way.`;
      }
      const rate = s.rhythm.hr > 100 ? `Sinus tachycardia ${s.rhythm.hr}` : `Sinus rhythm ${s.rhythm.hr}`;
      return `${rate}: the ST depression has largely resolved and aVR is back near baseline — the subendocardium is perfused again. A baseline for the cardiac ICU.`;
    },
    echo: (s) => (has(s, 'impella')
      ? 'Severe global hypokinesis, LVEF about 25 %; the Impella inlet 3.5 cm below the aortic valve, clear of the mitral apparatus. No pericardial effusion.'
      : 'Severe global hypokinesis, worst in the anterior and lateral walls; LVEF about 25 %. No LV thrombus; the aortic valve opens normally with no regurgitation — nothing in the way of an Impella. No ventricular septal rupture, no severe mitral regurgitation, no effusion.'),
    lvedp: (s) => (has(s, 'impella') ? 'LV 98/14: LVEDP 14 mmHg, with the pump unloading the ventricle.' : 'LV 80/32: LVEDP 32 mmHg.'),
    lvgram: 'LV gram: the whole ventricle barely moves, the lateral wall and the apex least; EF about 25 %. The LVEDP is 38 after the injection.',
    rhc: (s) => (has(s, 'impella') ? RHC_SUPPORTED : rhcShock(s)),
    final: FINAL_LINE,
  },
  status: (s) => {
    if (!s.pulse) return 'Unresponsive.';
    if (has(s, 'reperfused')) return '"The weight on my chest is lifting."';
    if (has(s, 'impella')) return 'Drowsy, but answers: "A bit easier to breathe."';
    return '"Can\'t… get… my breath…"';
  },
  respond: {
    // he is already on 4 L by nasal cannula: more of the same is no answer to his SpO₂, and once the non-rebreather is on,
    // stepping down waits until the lungs are drier
    'o2-nc': (s) => {
      if (!s.pulse) return null;
      if (has(s, 'o2')) return { blocked: true, say: [['system', `He is on the non-rebreather with an SpO₂ of ${s.vitals.spo2} %: stepping down to a nasal cannula waits until his lungs are drier.`]] };
      return { blocked: true, say: [['system', `He is already on 4 L by nasal cannula, with an SpO₂ of ${s.vitals.spo2} %: more oxygen means the non-rebreather.`]] };
    },
    // the infusion is titrated, never started twice (the operator may already have started it)
    pressor: (s) => {
      if (!s.pulse) return null;
      if (has(s, 'pressor')) return notNow('Norepinephrine is already running, titrated to a mean of 65.');
      return norepinephrine(s, 'you');
    },
    heparin: (s) => (has(s, 'heparin') ? notNow('Heparin 8,000 units is already in: check the ACT.') : { say: [['you', HEPARIN_LINE]], flags: ['heparin', 'anticoag'] }),
    bivalirudin: () => ({ say: [['you', 'Bivalirudin 0.75 mg/kg bolus, 1.75 mg/kg/h running.']], flags: ['bivalirudin', 'anticoagulated', 'anticoag'] }),
    cangrelor: (s) => (has(s, 'cangrelor') ? notNow('Cangrelor is already running.') : null),
    // he chewed 324 mg in the emergency department: no second dose, and no time lost
    aspirin: () => notNow('He chewed aspirin 324 mg in the emergency department: no second dose.'),
    act: (s) => act(s, 'you'),
    fentanyl: (s) => (s.pulse ? fentanyl(s, 'you') : null),
    'call-surgery': (s) => (has(s, 'surgery-called') ? notNow('Cardiac surgery already knows: the surgeon is on the way in.') : surgeonCall(s)),
    // an acute thrombotic culprit is no place for physiology: the clot and the stunned microvessels make the number meaningless
    ffr: (s) => (has(s, 'wired') ? notNow('No FFR at an acute culprit: the clot and the injured microvessels make the number meaningless, and the angiogram and the IVUS already show what this artery needs. FFR is for stable, intermediate lesions.') : null),
    callout: (s) => {
      if (has(s, 'inflation-dip') && !has(s, 'dip-called')) return { say: [['operator', 'Copy — balloon\'s down and he\'s back. Keep calling it.']], flags: ['callout', 'dip-called'] };
      return null;
    },
    // the radial artery: the catheters and the guide can come in through the wrist, leaving the right groin for the pump
    access: (s) => (s.role === 5 ? { say: [['you', 'Right radial artery under ultrasound: a 6 French slender sheath for the catheters.']], flags: ['access', 'radial'] } : null),
    // the pump needs a 14 French sheath: its closure sutures go in while the hole is still small. With the catheters coming in
    // through the right groin, the pump gets the left one (the catheters cannot share its sheath)
    'access-femoral': (s) => (has(s, 'radial')
      ? { say: [['you', 'Right common femoral artery under ultrasound, over the femoral head: a 7 French sheath, and two closure sutures placed for the 14 French sheath the pump will need. The catheters stay in the wrist.']], flags: ['access', 'femoral'] }
      : { say: [['you', BOTH_GROINS]], flags: ['access', 'femoral', 'pump-left'] }),
    // seated gently: the operator does not yet know what sits at that ostium (and says nothing of it before the run is read)
    'cath-jl4': (s) => (s.role === 5 && has(s, 'access') ? { say: [['you', 'JL4 seated gently in the left coronary ostium.']], flags: ['catheter'] } : null),
    angio: (s) => angioGate(s) ?? { ...angioRun('you'), flags: ['angio'] },
    rhc: (s) => {
      if (!has(s, 'venous')) return null;
      return has(s, 'impella') ? { say: [['monitor', RHC_SUPPORTED]], flags: ['rhc'] } : { say: [['monitor', rhcShock(s)]], flags: ['rhc'], read: rhcRead };
    },
    impella: (s) => {
      if (s.role === 3) return { say: [['you', 'Impella console primed, purge running with heparinized fluid; the 14 French sheath, the wire and the closure sutures open on the table.']], flags: ['impella-ready'] };
      if (!has(s, 'femoral')) return { blocked: true, say: [['system', 'The Impella CP needs a 14 French sheath in a femoral artery: get ultrasound-guided femoral access first.']] };
      return impellaIn(s, 'you');
    },
    // a balloon pump adds a little diastolic pressure; in infarct shock it does not change survival (IABP-SHOCK II)
    iabp: (s) => {
      if (s.role !== 5) return null;
      if (!has(s, 'femoral')) return { blocked: true, say: [['system', 'A balloon pump goes in from a femoral artery: get femoral access first.']] };
      const bp = bpAfter(s, 4, 8, { sbp: 140, dbp: 90 });
      return { say: [['you', `IABP in from the ${pumpSide(s)} common femoral artery, tip 2 cm below the left subclavian; 1:1 on the ECG trigger.`], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`]], vitals: bp, flags: ['iabp'] };
    },
    // the sheath that carries a pump stays in: the closure sutures are tied when the pump comes out in the cardiac ICU
    'closure-device': (s) => (supported(s) ? notNow('Not while the pump runs: its sheath stays in, and the closure sutures are tied when the pump comes out in the cardiac ICU.') : null),
    hemostasis: (s) => (supported(s) ? notNow('Not while the pump runs: its sheath stays in for the cardiac ICU. Check the leg below it instead.') : null),
    // a guide goes where the angiogram shows the culprit: no guide, and no wire, before the pictures
    'guide-ebu': (s) => {
      if (s.role !== 5 || !has(s, 'access')) return null;
      if (!has(s, 'angio')) return notNow('Take the diagnostic pictures first: a guide goes where the angiogram shows the culprit.');
      return { say: [['you', 'EBU 3.5 guide engaged gently and coaxially in the left main ostium; the pressure holds.']], flags: ['guide', 'guide-left'], clear: ['on-rca'] };
    },
    // the right coronary guide. Before the left main is open it comes straight back out (the EBU cannot be opened twice, so the
    // culprit must stay within reach); once the left main is stented the case remembers the guide sits in the RCA, and wiring
    // the RCA is the trap
    ...Object.fromEntries(RIGHT_GUIDES.map((id) => [id, (s: SimState): Effect | null => {
      if (s.role !== 5 || !has(s, 'access')) return null;
      if (!has(s, 'angio')) return notNow('Take the diagnostic pictures first: a guide goes where the angiogram shows the culprit.');
      const name = id === 'guide-al1' ? 'AL1' : 'JR4';
      if (!has(s, 'pci')) {
        return { say: [['you', `${name} guide engaged in the right coronary. The culprit is in the left main: it comes back out${has(s, 'guide-left') ? ', and the EBU goes back in' : ''}.`]] };
      }
      return { say: [['you', `${name} guide engaged in the right coronary.`]], flags: ['guide', 'guide-right', 'on-rca'] };
    }])),
    ...Object.fromEntries(WIRES.map((id) => [id, (s: SimState): Effect | null => {
      if (s.role !== 5 || !has(s, 'guide')) return null;
      const kind = id === 'wire-hydrophilic' ? 'Hydrophilic wire' : 'Workhorse wire';
      if (has(s, 'on-rca')) {
        if (!has(s, 'pci')) return { blocked: true, say: [['system', 'This guide sits in the right coronary, and the culprit is not there: engage a left guide.']] };
        return { say: [['you', `${kind} across the RCA narrowing.`]], flags: ['rca-wired'] };
      }
      return { say: [['you', `${kind} through the clot in the left main and down into the distal LAD.`]], flags: ['wired'] };
    }])),
    // before the stent it sizes the left main; after it, it shows the under-expansion until the non-compliant balloon has gone in
    ivus: (s) => {
      if (!has(s, 'wired') || (s.role !== 3 && s.role !== 5)) return null;
      const prep: Line[] = s.role === 3 ? [['you', 'IVUS catheter flushed, prepped and handed up; automatic pullback set.']] : [];
      const who: Speaker = s.role === 3 ? 'operator' : 'monitor';
      if (has(s, 'on-rca')) return { say: [...prep, [who, 'IVUS of the RCA: a fibrocalcific plaque in the mid vessel, minimum lumen area 3.6 mm²; no thrombus.']], flags: ['ivus'] };
      if (!has(s, 'pci')) return { say: [...prep, [who, IVUS_BEFORE]], flags: ['ivus'] };
      if (!has(s, 'postdilated')) return { say: [...prep, [who, IVUS_UNDER]], flags: ['ivus'] };
      return { say: [...prep, [who, IVUS_AFTER]], flags: ['ivus', 'optimized'] };
    },
    // the flush cannot clear blood from an ostial left main with the guide engaged in it, and every run is more contrast
    oct: (s) => {
      if (!has(s, 'wired')) return null;
      if (s.role === 3) return { say: [['you', 'OCT catheter flushed, prepped and handed up; contrast flush loaded.']], flags: ['oct-ready'] };
      if (s.role !== 5) return null;
      return {
        say: [['monitor', 'OCT: the flush cannot clear the blood from the ostium with the guide sitting in it — the first millimeters of the left main are not seen; beyond them, plaque rupture with red thrombus. Another 15 mL of contrast for kidneys that are already failing.']],
        flags: ['oct'],
      };
    },
    // aspiration at the ostium: little comes back, and the clot can be dragged out into the aorta (the harm says so)
    aspiration: (s) => {
      if (s.role !== 5 || !has(s, 'wired') || has(s, 'on-rca')) return null;
      return { say: [['you', 'Aspiration catheter at the left main ostium: a few red fragments come back, and the flow looks no different.']], flags: ['aspirated'] };
    },
    'balloon-predil': (s) => {
      if (s.role !== 5 || !has(s, 'guide')) return null;
      if (has(s, 'on-rca')) {
        if (!has(s, 'rca-wired')) return { blocked: true, say: [['system', 'Wire the right coronary first.']] };
        return { say: [['you', 'Pre-dilated the mid RCA with a 3.0 compliant balloon.']], flags: ['rca-predilated'] };
      }
      if (!has(s, 'wired')) return null;
      if (has(s, 'pci')) return { say: [['you', 'A compliant balloon inside the left main stent: it stretches the vessel at the stent edges more than it expands the stent — a non-compliant balloon sized to the left main is the tool.']], flags: ['predilated'] };
      return { say: [['you', 'Pre-dilating the left main lesion with a 3.0 compliant balloon.']], flags: ['predilated', 'lm-inflated'] };
    },
    'stent-des': (s) => {
      if (s.role !== 5) return null;
      if (has(s, 'on-rca')) {
        if (!has(s, 'rca-wired')) return { blocked: true, say: [['system', 'Wire the right coronary first.']] };
        const bp = bpAfter(s, -6, -4);
        return { say: [['you', 'Drug-eluting stent deployed in the mid RCA: another 40 mL of contrast.'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`]], vitals: bp, flags: ['rca-pci'] };
      }
      if (!has(s, 'wired')) return null;
      if (has(s, 'pci')) return { blocked: true, say: [['system', 'The left main is already stented: IVUS, not another stent, tells you whether it is fully expanded.']] };
      return {
        say: [['you', `Drug-eluting stent, ${has(s, 'ivus') ? '4.5 × 12 sized from the IVUS' : '4.0 × 12 sized by eye'}, from the left main ostium (1–2 mm into the aorta) to the mid shaft, at 14 atmospheres.`]],
        flags: ['stented', 'pci', 'lm-inflated'],
      };
    },
    'balloon-nc': (s) => {
      if (s.role !== 5 || !has(s, 'stented')) return null;
      if (has(s, 'on-rca')) return { say: [['you', 'Post-dilated the RCA stent with a non-compliant balloon.']], flags: ['rca-postdilated'] };
      return { say: [['you', 'Non-compliant balloon, 5.0 × 8, at 18 atmospheres in the shaft and at the ostium: the stent expanded and the ostium flared.']], flags: ['postdilated'] };
    },
    'final-angio': (s) => {
      if (!has(s, 'pci')) return { blocked: true, say: [['system', s.role === 5 ? 'Open the culprit first: the final pictures come after the stent.' : 'The operator is not ready for the final pictures yet.']] };
      if (s.role === 3) return { say: [['you', 'C-arm to LAO caudal, then RAO caudal, for the final runs.']] };
      if (s.role !== 5) return null;
      return { say: [['you', FINAL_LINE, 'good']], image: { id: 'final-angio', view: 'Final angiogram: the left main in two views' }, flags: ['final-angio'] };
    },
    // shock: everything below drops the pressure, slows the breathing or floods the lungs
    nitro: (s) => (s.pulse ? worse(s, -14, -10, (bp) => `BP ${bp}.`, ['nitro']) : null),
    'nitro-high': (s) => (s.pulse ? worse(s, -24, -14, (bp) => `BP ${bp}.`, ['nitro', 'nitro-high']) : null),
    'ic-nitro': (s) => (s.pulse && s.vitals.sbp < 90 ? worse(s, -14, -10, (bp) => `BP ${bp}.`, ['ic-nitro']) : null),
    metoprolol: (s) => (s.pulse ? worse(s, -18, -12, (bp) => `BP ${bp}.`, ['beta-blocker']) : null),
    sedation: (s) => (s.pulse ? worse(s, -10, -8, (bp) => `Sedated. BP ${bp}, breathing slower.`, ['sedation'], { rr: Math.max(10, s.vitals.rr - 8), spo2: Math.max(70, s.vitals.spo2 - 4) }) : null),
    midazolam: (s) => (s.pulse ? worse(s, -10, -8, (bp) => `Midazolam 1 mg in. BP ${bp}, breathing slower.`, ['sedation', 'benzodiazepine'], { rr: Math.max(10, s.vitals.rr - 8), spo2: Math.max(70, s.vitals.spo2 - 4) }) : null),
    fluid: (s) => (s.pulse ? wetter(s, 'Bolus in.', ['fluid']) : null),
    'legs-up': (s) => (s.pulse ? wetter(s, 'Legs raised; more breathless lying flat.', ['legs-up']) : null),
    transfuse: (s) => (s.pulse ? wetter(s, 'A unit of red cells running.', ['transfused']) : null),
    // IV adenosine dilates every arteriole: in shock the pressure falls (the harm says why it has no place here)
    'adenosine-iv-ffr': (s) => (s.pulse ? worse(s, -12, -8, (bp) => `Adenosine running. BP ${bp}; he is flushed and more short of breath.`, ['hyperemia']) : null),
    // a pure vasoconstrictor squeezes the vessels the failing LV must empty into: a little pressure, less output
    phenylephrine: (s) => {
      if (!s.pulse) return null;
      const spo2 = Math.max(70, s.vitals.spo2 - 2);
      return worse(s, 6, 4, (bp) => `Phenylephrine in. BP ${bp} — but his hands are colder and SpO₂ ${spo2} %.`, ['phenylephrine'], { spo2 });
    },
    defib: shockOutcome,
    aed: shockOutcome,
  },
  events: [
    // ── The teammates the learner is not playing ──
    {
      id: 'tech-setup', when: (s) => s.role !== 3,
      effect: () => ({ say: [['team', 'Tech: both groins and the right wrist prepped, transducers zeroed and leveled, monitor and pads on, Impella console on standby.']], flags: ['prep', 'transducer', 'monitor', 'pads'] }),
    },
    {
      id: 'rn-setup-for-tech', when: (s) => s.role === 3,
      effect: () => ({
        say: [['team', 'Nurse: his wife gave consent by phone. Two IVs in, non-rebreather on, norepinephrine running on the cardiologist\'s order.'], ['monitor', 'BP 90/58. SpO₂ 92 %.']],
        flags: ['consent', 'iv', 'o2', 'pressor', 'monitor'], vitals: { sbp: 90, dbp: 58, spo2: 92 },
      }),
    },
    {
      id: 'rn-setup-for-md', when: (s) => s.role === 5,
      effect: () => ({ say: [['team', 'Nurse: two IVs in, labs sent — lactate 6.1. Waiting for your orders.']], flags: ['iv', 'labs', 'monitor'] }),
    },
    {
      id: 'md-access', when: (s) => s.role !== 5 && has(s, 'timeout') && !has(s, 'access'),
      effect: () => ({ say: [['operator', BOTH_GROINS]], flags: ['access', 'femoral', 'pump-left'] }),
    },
    {
      // push-dose epinephrine buys a few minutes: the operator still wants the infusion
      id: 'push-epi-bridge', when: (s) => s.role === 4 && has(s, 'push-epi') && has(s, 'asked-pressor') && !has(s, 'pressor'),
      effect: () => ({ say: [['operator', 'Good — that buys us a few minutes. Now the norepinephrine infusion, please, to a mean of 65.']] }),
    },
    {
      // bivalirudin instead of the heparin that was ordered: it is in now, so nobody adds heparin on top of it
      id: 'rn-bivalirudin-instead', when: (s) => s.role === 4 && has(s, 'asked-heparin') && has(s, 'bivalirudin') && !has(s, 'heparin-given'),
      effect: () => ({
        say: [['operator', 'Bivalirudin? I asked for heparin — say it back and check it before you push it. It\'s in now, so no heparin on top of it.', 'warn']],
        flags: ['heparin-given'],
      }),
    },
    ...TECH_ASKS.flatMap(askEvents),
    ...RN_ASKS.flatMap(askEvents),
    {
      id: 'md-angio', when: (s) => s.role !== 5 && has(s, 'access') && !has(s, 'angio') && (s.role === 4 ? s.minute >= s.flags.access + 1 : has(s, 'diag-in-hand')),
      effect: () => ({ ...angioRun('operator'), flags: ['angio', 'catheter'] }),
    },
    {
      id: 'rn-heparin-for-tech', when: (s) => s.role === 3 && has(s, 'angio') && !has(s, 'heparin'),
      effect: () => ({ say: [['team', `Nurse: "${HEPARIN_LINE.replace(', flushed.', '')} in, on the doctor's order."`]], flags: ['heparin', 'anticoag'] }),
    },
    {
      id: 'team-surgery-for-tech', when: (s) => s.role === 3 && named(s) && !has(s, 'surgery-called'),
      effect: () => ({ say: [['team', 'Nurse: "Cardiac surgery is on the phone."'], SURGEON_SEEN], flags: ['surgery-called', 'surgeon-seen'] }),
    },
    {
      // the surgeon was called before the run was read: once it is, the surgeon has seen it and calls back
      id: 'surgeon-calls-back', when: (s) => named(s) && has(s, 'surgery-called') && !has(s, 'surgeon-seen'),
      effect: () => ({ say: [SURGEON_SEEN], flags: ['surgeon-seen'] }),
    },
    {
      // once the run is on the screen and the ACT is known (a nurse who gave the heparin early does not bring the pump in before the pictures)
      id: 'md-impella', when: (s) => s.role !== 5 && !has(s, 'impella') && has(s, 'angio') && has(s, 'act-known') && (s.role === 4 || has(s, 'impella-primed')),
      effect: (s) => impellaIn(s, 'operator'),
    },
    {
      id: 'rn-cangrelor-for-tech', when: (s) => s.role === 3 && has(s, 'impella') && !has(s, 'cangrelor'),
      effect: () => ({ say: [['team', 'Nurse: "Cangrelor bolus in and the infusion running, on the doctor\'s order."']], flags: ['p2y12', 'cangrelor'] }),
    },
    {
      id: 'md-guide', when: (s) => s.role !== 5 && has(s, 'impella') && !has(s, 'guide') && (s.role === 4 ? s.minute >= s.flags.impella + 1 : has(s, 'guide-in-hand')),
      effect: () => ({ say: [['operator', 'EBU guide through the right femoral sheath, engaged gently in the left main ostium; the pressure holds.']], flags: ['guide', 'guide-left'] }),
    },
    {
      id: 'md-wire', when: (s) => s.role !== 5 && has(s, 'guide') && !has(s, 'wired') && (s.role === 4 ? s.minute >= s.flags.guide + 1 : true),
      effect: () => ({ say: [['operator', 'Wire through the clot in the left main and down the LAD.']], flags: ['wired'] }),
    },
    {
      // the nurse does not run the IVUS: the operator does, and says what it shows
      id: 'md-ivus-for-rn', when: (s) => s.role === 4 && has(s, 'wired') && !has(s, 'ivus') && s.minute >= s.flags.wired + 1,
      effect: () => ({ say: [['operator', IVUS_BEFORE]], flags: ['ivus'] }),
    },
    {
      id: 'md-stent', when: (s) => s.role !== 5 && has(s, 'ivus') && !has(s, 'pci') && (s.role === 4 ? s.minute >= s.flags.ivus + 1 : has(s, 'stent-in-hand')),
      effect: () => ({ say: [['operator', 'Drug-eluting stent, 4.5 × 12, from the ostium to the mid shaft: inflating.']], flags: ['stented', 'pci', 'lm-inflated'] }),
    },
    {
      // a balloon in the left main stops the flow to most of the left ventricle for the length of the inflation: with the
      // Impella carrying the circulation the pressure dips and comes back; a balloon pump does far less; without support the
      // failing ventricle fibrillates
      id: 'inflation', when: (s) => has(s, 'lm-inflated') && s.pulse,
      effect: (s) => {
        const { sbp, dbp } = s.vitals;
        if (has(s, 'impella')) {
          return {
            say: [
              ['monitor', `Balloon up in the left main: BP falls to ${Math.max(60, sbp - 30)}/${Math.max(40, dbp - 16)} and the complexes widen for a few beats, while the pump keeps up its flow of 3.4 L/min. Balloon down after 15 seconds: BP back to ${sbp}/${dbp}.`, 'warn'],
              ...(s.role === 5 ? [line('team', `Tech: "${Math.max(60, sbp - 30)} with the balloon up — he's back now."`, 'warn')] : []),
            ],
            flags: ['inflation-dip'],
          };
        }
        if (has(s, 'iabp')) {
          return {
            say: [
              ['monitor', `Balloon up in the left main: BP falls to 58/34 despite the balloon pump, and the complexes widen. Balloon down: it climbs back slowly to ${sbp}/${dbp}.`, 'bad'],
              ...awake(s, 'I\'m… going…'),
              ...(s.role === 5 ? [line('team', 'Tech: "Fifty-eight with the balloon up!"', 'warn')] : []),
            ],
            flags: ['inflation-dip'],
          };
        }
        return {
          say: [['monitor', 'Balloon up in the left main: the pressure falls away to 52/28, and the complexes widen and run together.', 'bad'], ...vfLines(s)],
          rhythm: { profile: 'vf', hr: 0 }, pulse: false, flags: ['vf', 'inflation-dip'],
        };
      },
    },
    {
      // the left main is open: the subendocardium is perfused again, the rate settles and the pressure comes up
      id: 'reperfused', when: (s) => has(s, 'pci') && s.pulse,
      effect: (s) => {
        const sbp = Math.max(s.vitals.sbp, has(s, 'impella') ? 108 : 94);
        const dbp = Math.max(s.vitals.dbp, has(s, 'impella') ? 72 : 60);
        const gcs = Math.max(s.vitals.gcs, has(s, 'arrest') ? 13 : 14);
        return {
          say: [['monitor', `Heart rate 96. BP ${sbp}/${dbp}.`, 'good'], ...(gcs >= 13 ? [line('patient', '"The weight on my chest is lifting."')] : [])],
          rhythm: { profile: 'normal-sinus', hr: 96 }, vitals: { sbp, dbp, gcs, pain: 2, spo2: Math.max(s.vitals.spo2, 94), rr: Math.min(s.vitals.rr, 22) },
          flags: ['reperfused'],
        };
      },
    },
    {
      id: 'md-pot', when: (s) => s.role !== 5 && has(s, 'reperfused') && !has(s, 'postdilated') && (s.role === 4 ? s.minute >= s.flags.pci + 1 : has(s, 'nc-in-hand')),
      effect: () => ({ say: [['operator', 'Non-compliant balloon, 5.0 × 8, at 18 atmospheres: the stent expanded and the ostium flared.']], flags: ['postdilated'] }),
    },
    {
      id: 'md-ivus-after', when: (s) => s.role !== 5 && has(s, 'postdilated') && !has(s, 'optimized'),
      effect: () => ({ say: [['operator', IVUS_AFTER]], flags: ['optimized'] }),
    },
    {
      id: 'md-final', when: (s) => s.role !== 5 && has(s, 'optimized') && !has(s, 'final-angio'),
      effect: () => ({ say: [['operator', FINAL_LINE, 'good']], image: { id: 'final-angio', view: 'Final angiogram: the left main in two views' }, flags: ['final-angio'] }),
    },

    // ── What delay does ──
    {
      // no oxygen beyond the nasal cannula: the wet lungs win
      id: 'hypoxia-worse', when: (s) => s.pulse && !has(s, 'o2') && !has(s, 'airway') && !has(s, 'impella') && s.minute >= 6,
      effect: (s) => {
        const spo2 = Math.min(s.vitals.spo2, 80);
        return {
          say: [['monitor', `SpO₂ ${spo2} %.`, 'bad'], ...awake(s, 'Can\'t… breathe…'), ...(s.role === 5 ? [line('team', `Nurse: "Doctor — his sat's ${spo2}."`, 'warn')] : [])],
          vitals: { spo2, rr: Math.max(s.vitals.rr, 34), gcs: Math.min(s.vitals.gcs, 13) },
        };
      },
    },
    {
      // nothing holds the pressure up: the shock deepens (never better on its own, even if a drug had pushed a number lower)
      // (a push-dose of epinephrine has worn off by then: only an infusion or a pump holds it)
      id: 'shock-worse', when: (s) => s.pulse && !has(s, 'pressor') && !supported(s) && s.minute >= 8,
      effect: (s) => {
        const v = { sbp: Math.min(s.vitals.sbp, 68), dbp: Math.min(s.vitals.dbp, 42), spo2: Math.min(s.vitals.spo2, 84), gcs: Math.min(s.vitals.gcs, 12) };
        return {
          say: [
            ['monitor', `BP ${v.sbp}/${v.dbp}. SpO₂ ${v.spo2} %.`, 'bad'],
            ['you', 'He is harder to rouse.'],
            ...(s.role === 5 ? [line('team', `Nurse: "Doctor, his pressure is ${v.sbp} — do you want a pressor?"`, 'warn')] : []),
          ],
          vitals: v,
        };
      },
    },
    {
      // the culprit is known and still closed: every minute the left main stays shut the shock deepens — waiting for the
      // operating room (90 minutes away) is no option when PCI can open it now
      id: 'delay-worse', when: (s) => s.pulse && has(s, 'angio') && !has(s, 'pci') && s.minute >= s.flags.angio + 25,
      effect: (s) => {
        const v = { sbp: Math.min(s.vitals.sbp, 72), dbp: Math.min(s.vitals.dbp, 44), gcs: Math.min(s.vitals.gcs, 11) };
        return {
          say: [
            ['monitor', `BP ${v.sbp}/${v.dbp}.`, 'bad'],
            ['team', 'Nurse: "Lactate 8.4 and climbing. Surgery says the room is still more than an hour away."', 'warn'],
          ],
          vitals: v,
        };
      },
    },
    {
      id: 'delay-vf', when: (s) => s.pulse && has(s, 'angio') && !has(s, 'pci') && s.minute >= s.flags.angio + 35,
      effect: (s) => ({ say: vfLines(s), rhythm: { profile: 'vf', hr: 0 }, pulse: false, flags: ['vf'] }),
    },
  ],
  // in the order the work comes, so a hint names the most urgent step still missing (an arrest first)
  critical: [
    { id: 'defib', label: 'Defibrillate VF within 1 minute', why: 'In the lab, VF is witnessed with the pads on: shock it within seconds.', done: ['defib', 'aed'], after: 'arrest', points: 15, target: { within: { flag: 'arrest', minutes: 1 } }, applies: (s) => has(s, 'arrest') },

    // ── Arrival: the room, the pressure, the oxygen, the 12-lead ──
    { id: 'prep', label: 'Prep both groins', why: 'Shock: the pump needs a large-bore femoral artery, and a vein may be needed for a PA catheter or a pacing wire.', done: ['prep'], roles: TECH, points: 5, target: { by: 6 } },
    { id: 'transducer', label: 'Zero and level the transducers', why: 'The arterial pressure drives every decision in shock — and its dips are what you call out: it must be right.', done: ['transducer'], roles: TECH, points: 5, target: { by: 6 } },
    { id: 'pads', label: 'Defibrillator pads on', why: 'Shock with global ischemia, and a balloon about to block a culprit that may feed most of the ventricle: VT and VF are likely.', done: PADS, roles: TECH, points: 10, target: { by: 6 } },
    { id: 'iv', label: 'IV access', why: 'For the pressor and the drugs.', done: ['iv', 'io'], roles: RN, points: 5 },
    askCritical(RN_ASKS[0]),
    // an infusion: push-dose epinephrine bridges a few minutes, and then the shock is back
    { id: 'md-pressor', label: 'A vasopressor early (norepinephrine)', why: 'Norepinephrine first in cardiogenic shock, to a mean of 65 or more, while the support goes in. Push-dose epinephrine only bridges a few minutes.', done: ['pressor'], roles: MD, points: 10, target: { by: 6 } },
    {
      id: 'oxygen', label: 'Oxygen for an SpO₂ of 86 %', why: 'He is hypoxic from pulmonary edema on 4 L by nasal cannula: a non-rebreather now, and be ready to ventilate if he tires.', roles: [4, 5], points: 5, target: { by: 5 },
      // an airway counts only once it is in: tried on him awake, it comes straight out
      done: (s) => {
        const mask = firstDone(s, ['o2-nrb']);
        const tube = has(s, 'airway') ? firstDone(s, ['airway']) : null;
        return mask === null ? tube : tube === null ? mask : Math.min(mask, tube);
      },
      uses: ['o2-nrb', 'airway'],
    },
    { id: 'consent', label: 'Consent (his wife, by phone) and allergies checked', why: 'Even in shock: confirm consent with whoever can give it, and check the allergies and the anticoagulants.', done: ['consent'], roles: [4, 5], points: 5, target: { by: 6 } },
    { id: 'timeout', label: 'Procedural time-out before access', why: 'Patient, procedure, sites, allergies, anticoagulation — and the support plan — in one minute, even in shock.', done: ['timeout'], points: 5, target: { by: 6 } },
    // the emergency department already has one: the pressor, the oxygen, consent and the time-out come first, and the lab's own
    // 12-lead can follow them (by 10 minutes, before the pictures)
    { id: 'ecg-first', label: 'A 12-lead on the table, read', why: 'The lab\'s own 12-lead before the pictures: in shock its pattern says how much of the ventricle is at risk and where to look first, and it is the baseline for every change that follows.', done: ['ecg12'], roles: [4, 5], points: 5, target: { by: 10 } },

    // ── Finding the culprit ──
    askCritical(TECH_ASKS[0]),
    { id: 'femoral', label: 'Ultrasound-guided femoral access for the pump', why: 'Radial access is the default in ACS, but the Impella needs a 14 French femoral sheath: ultrasound-guided, over the femoral head, with the closure sutures placed first — and the catheters and the guide through a second artery (the wrist or the other groin), since they cannot share the pump\'s sheath.', done: ['access-femoral'], roles: MD, points: 5 },
    { id: 'md-angio', label: 'Diagnostic angiography: find the culprit', why: 'Shock in an acute coronary syndrome calls for emergency angiography and revascularization of the culprit, whatever the ECG shows.', done: ['angio'], roles: MD, points: 5 },

    // ── The heart team, the heparin and the pump ──
    ...[RN_ASKS[1], RN_ASKS[2], RN_ASKS[3], TECH_ASKS[1], TECH_ASKS[2]].map(askCritical),
    {
      id: 'md-surgery', label: 'Call cardiac surgery — without waiting for them', roles: MD, points: 5, target: { within: { flag: 'angio', minutes: 5 } },
      why: 'A left main culprit is a heart-team decision: the surgeon hears at once and stands by. But in shock the culprit is opened by the fastest route — here PCI, now — not after an hour and a half waiting for an operating room.',
      done: ['call-surgery'],
    },
    { id: 'md-heparin', label: 'Heparin before the pump and the wire', why: 'Unfractionated heparin 70–100 units/kg: the pump, the large-bore sheath and the wire clot without it.', done: ['heparin', 'bivalirudin'], roles: MD, points: 10 },
    {
      id: 'md-act', label: 'Check the ACT before the pump goes in', why: 'An ACT of 250 s or more before the Impella goes in, and 250–300 s for the PCI.', roles: MD, points: 5, applies: (s) => has(s, 'anticoag'),
      // after the anticoagulant, and before the pump if one went in: an ACT taken with the pump already in is too late for it
      done: (s) => {
        const check = firstDone(s, ['act'], 'anticoag');
        const pump = firstDone(s, ['impella']);
        return check !== null && (pump === null || check < pump) ? check : null;
      },
      uses: ['act'],
    },
    {
      id: 'echo', label: 'Echo before the pump goes in', roles: MD, points: 5,
      why: 'How badly the ventricle has failed, the mechanical complications that cause shock (septal or papillary muscle rupture, free-wall rupture) — and nothing that rules out an Impella: no LV thrombus, no severe aortic stenosis or regurgitation, no mechanical aortic valve.',
      done: (s) => {
        const echo = firstDone(s, ['echo']);
        const pump = firstDone(s, ['impella']);
        return echo !== null && (pump === null || echo < pump) ? echo : null;
      },
      uses: ['echo'],
    },
    {
      id: 'mcs', label: 'Mechanical support before the left main is touched (Impella)', roles: MD, points: 15,
      why: 'A balloon in the left main stops the flow to most of a ventricle that is already failing. A microaxial flow pump carries the circulation through it: in STEMI with severe shock it improved survival (DanGer Shock; 2025 ACC/AHA: 2a for selected patients). This patient has no ST elevation, so using it here extrapolates from that trial — the step most teams take when a left main culprit puts almost the whole ventricle at risk. Routine balloon pumps do not help (IABP-SHOCK II; 2025 ACC/AHA: 3, no benefit).',
      done: (s) => {
        const pump = firstDone(s, ['impella']);
        const inflation = firstDone(s, ['balloon-predil', 'stent-des']);
        return pump !== null && (inflation === null || pump < inflation) ? pump : null;
      },
      uses: ['impella'],
    },

    // ── With the pump in: the antiplatelet drug, the leg, the guide, the imaging ──
    ...[RN_ASKS[4], RN_ASKS[5], TECH_ASKS[3]].map(askCritical),
    { id: 'limb-check', label: 'Check the leg below the large-bore sheath', why: 'A 14 French sheath can starve the leg: check the foot pulses (by Doppler), color and warmth once the pump is in, then every hour. The sheath stays in while the pump runs, so there is no hemostasis to do yet.', done: ['perfusion', 'pulse-check'], after: 'impella', roles: [3, 4], points: 5, applies: (s) => has(s, 'impella') },
    { id: 'md-p2y12', label: 'A P2Y12 inhibitor (IV cangrelor in shock)', why: 'Cangrelor works within minutes and is gone within an hour of stopping it if he needs surgery; tablets are absorbed poorly in shock, may be aspirated, and a ticagrelor load means days of bleeding risk if the surgeon has to take him.', done: ['cangrelor', 'p2y12'], roles: MD, points: 5 },
    { id: 'guide', label: 'A left guide for the left main (EBU)', why: 'Engaged gently and coaxially: a guide pushed deep into a diseased left main ostium damps the pressure and can dissect it.', done: LEFT_GUIDES, roles: MD, points: 5 },
    ...[TECH_ASKS[4], TECH_ASKS[5]].map(askCritical),
    {
      id: 'imaging', label: 'IVUS to size and check the left main stent', roles: MD, points: 10,
      why: 'Intravascular imaging to guide left main PCI is Class 1 (2025 ACC/AHA ACS): it sizes the stent to the vessel and shows the under-expansion that causes stent thrombosis. IVUS, not OCT, at an ostial left main.',
      done: (s) => firstDone(s, ['ivus'], 'wired'), uses: ['ivus'],
    },

    // ── Opening the left main, and after ──
    { id: 'stent', label: 'Stent the culprit left main', why: 'Open the culprit as fast as the support allows: every minute it stays shut the shock deepens.', done: ['stent-des'], roles: MD, points: 15, target: { within: { flag: 'angio', minutes: 25 } } },
    {
      id: 'callout-dip', label: 'Call out the pressure dip with the balloon up', roles: [3, 4], points: 10,
      why: 'A balloon in the left main stops the flow to most of the left ventricle: the pressure falls and the complexes widen. Say it out loud, with the number, so the operator deflates on time.',
      done: ['callout'], after: 'inflation-dip', target: { within: { flag: 'inflation-dip', minutes: 1 } }, applies: (s) => has(s, 'inflation-dip') && s.pulse,
    },
    askCritical(TECH_ASKS[6]),
    { id: 'pot', label: 'Post-dilate the left main stent with a non-compliant balloon', why: 'A non-compliant balloon sized to the left main (here 5.0 mm) expands the stent fully and flares the ostium; IVUS confirms it.', done: ['balloon-nc'], after: 'pci', roles: MD, points: 5, applies: (s) => has(s, 'pci') },
    { id: 'final', label: 'Final angiogram', why: 'TIMI 3 flow down the LAD and the circumflex, the stent edges smooth — and the RCA left for later.', done: ['final-angio'], after: 'pci', roles: MD, points: 5, applies: (s) => has(s, 'pci') },
    { id: 'post-ecg', label: '12-lead once the left main is open', why: 'The ST depression and the ST elevation in aVR resolving confirm the reperfusion; it is the baseline for the cardiac ICU.', done: ['ecg12', 'ecg12-repeat'], after: 'pci', points: 5, applies: (s) => has(s, 'pci') },
    { id: 'handoff', label: 'Hand-off to the cardiac ICU', why: 'The shock and the lactate, the Impella settings, purge and flow, the femoral sheath and the hourly leg checks, the pressor, the left main stent and its IVUS result, cangrelor and the switch to a tablet, and the RCA left for the heart team.', done: ['handoff'], roles: [4, 5], points: 5 },
  ],
  harms: yieldToHeavier([
    { id: 'fluid-in-shock', actions: ['fluid'], replaces: ['fluid-pulmonary-edema'], when: (s) => s.pulse, points: 8, severity: 'major', text: 'A fluid bolus with pulmonary edema and a failing left ventricle. An overfilled ventricle cannot use more volume: it goes to the lungs, and the oxygen falls.' },
    { id: 'nitro-in-shock', actions: ['nitro', 'nitro-high'], replaces: NITRATE_RULES, when: (s) => s.pulse, points: 8, severity: 'major', text: 'Nitroglycerin in cardiogenic shock. It drops a pressure that is already too low to perfuse the heart and the brain; the chest pain is treated by opening the artery.' },
    // the built-in nitroglycerin rule is replaced above for every nitrate: intracoronary nitroglycerin with a low pressure keeps its own
    { id: 'ic-nitro-low-pressure', actions: ['ic-nitro'], when: (s) => s.pulse && s.vitals.sbp < 90, replaces: NITRATE_RULES, points: 8, severity: 'major', text: 'Intracoronary nitroglycerin with a systolic pressure under 90 mmHg. It drops the pressure further.' },
    { id: 'beta-blocker', actions: ['metoprolol'], replaces: RATE_RULES, points: 12, severity: 'critical', text: 'An IV beta-blocker in cardiogenic shock. It takes away the little output the heart still has.' },
    { id: 'phenylephrine-in-shock', actions: ['phenylephrine'], replaces: ['phenylephrine-no-hypotension', 'phenylephrine-slow'], points: 5, severity: 'major', text: 'Phenylephrine in cardiogenic shock. A pure vasoconstrictor raises the afterload the failing ventricle must pump against: the pressure rises a little while the output falls. Norepinephrine is the first vasopressor in cardiogenic shock.' },
    // a benzodiazepine, named as one, is the bigger mistake; the generic "sedation / analgesia" order is a smaller one
    { id: 'benzodiazepine-in-shock', actions: ['midazolam'], replaces: SEDATIVE_RULES, when: (s) => s.pulse, points: 5, severity: 'major', text: 'Midazolam in a shocked, hypoxic, drowsy patient. A benzodiazepine drops the pressure and the breathing; a small dose of fentanyl eases the pain without either.' },
    { id: 'sedation-in-shock', actions: ['sedation'], when: (s) => s.pulse, points: 3, severity: 'minor', replaces: SEDATIVE_RULES, text: 'Procedural sedation in a shocked, hypoxic, drowsy patient. It drops the pressure and the breathing; a small dose of fentanyl alone eases the pain without either.' },
    { id: 'pci-no-heparin', actions: [...WIRES, 'balloon-predil', 'stent-des', 'impella'], roles: MD, when: (s) => !anticoagulated(s), points: 15, severity: 'critical', text: 'A pump or a coronary wire without anticoagulation. Both clot without heparin.' },
    { id: 'right-guide-for-lm', actions: RIGHT_GUIDES, roles: MD, when: (s) => has(s, 'angio') && !has(s, 'pci'), points: 5, severity: 'minor', text: 'A right-coronary guide while the left main is still shut. The culprit is on the left: a left guide with back-up (EBU).' },
    // judged when the RCA is wired or treated (PCI starts with the wire): a guide alone treats nothing
    { id: 'non-culprit-pci', actions: [...WIRES, 'balloon-predil', 'stent-des'], roles: MD, when: (s) => has(s, 'pci') && has(s, 'on-rca'), points: 15, severity: 'critical', text: 'Going after the non-culprit RCA in cardiogenic shock. Routine PCI of a non-culprit artery at the index procedure is harmful in shock (2025 ACC/AHA ACS: 3 — Harm): in CULPRIT-SHOCK it brought more death and kidney failure. Open the culprit only; the heart team deals with the RCA once he is stable.' },
    { id: 'oral-p2y12-early', actions: ['p2y12'], roles: [4, 5], when: (s) => !has(s, 'angio'), points: 3, severity: 'minor', text: 'An oral P2Y12 load before the angiogram, in a patient who may need surgery. Upstream loading brings no benefit when the angiogram is minutes away, and if the anatomy calls for bypass surgery a ticagrelor load means days of bleeding risk. Load once the anatomy is known — in shock, with IV cangrelor.' },
    { id: 'aspiration-ostial-lm', actions: ['aspiration'], roles: MD, when: (s) => !has(s, 'on-rca'), points: 3, severity: 'minor', text: 'Aspiration thrombectomy at the left main ostium. Routine aspiration brings no benefit (TASTE, TOTAL — and more strokes in TOTAL), and at the ostium the catheter can drag clot out into the aorta. Stent it; a GP IIb/IIIa inhibitor is the bail-out for a heavy thrombus burden.' },
    { id: 'lv-gram-in-shock', actions: ['lv-gram'], roles: [3, 5], points: 3, severity: 'minor', text: 'A left ventriculogram in cardiogenic shock. 30–40 mL of contrast at high speed into a failing ventricle with an LVEDP over 30: more volume for wet lungs and more contrast for failing kidneys, for what the echo shows at the bedside.' },
    { id: 'access-no-timeout', actions: ['access', 'access-femoral', 'access-venous'], when: (s) => !has(s, 'timeout'), points: 5, severity: 'major', text: 'Access before the time-out.' },
    { id: 'protamine-in-pci', actions: ['protamine'], when: (s) => !has(s, 'final-angio'), points: 10, severity: 'major', replaces: PROTAMINE_RULES, text: 'Protamine in the middle of a thrombotic left main PCI with a pump in. Reversing the heparin lets clot form on the wire, in the fresh stent and in the pump.' },
    // the main trap: a balloon in the left main of a failing ventricle with nothing to carry the circulation (it brings VF here).
    // A balloon pump is support, if far less: no penalty for it (the support item is missed instead)
    {
      id: 'lm-unsupported', actions: ['balloon-predil', 'stent-des'], roles: MD, points: 8, severity: 'major',
      when: (s) => s.pulse && has(s, 'wired') && !has(s, 'on-rca') && !has(s, 'lm-inflated') && !supported(s),
      text: 'A balloon in the left main of a shocked, failing ventricle with no mechanical support. It stops the flow to most of the left ventricle, and with nothing to carry the circulation the heart fibrillates: the pump goes in first.',
    },
    // waiting until the shock has run on into VF (35 minutes after the angiogram): the delay itself was the mistake
    {
      id: 'lm-delay', actions: ['balloon-predil', 'stent-des'], roles: MD, points: 10, severity: 'major',
      when: (s) => has(s, 'angio') && !has(s, 'on-rca') && !has(s, 'lm-inflated') && s.minute >= s.flags.angio + 35,
      text: 'The left main left shut for more than half an hour after the angiogram showed it. The shock deepened and ran on into VF: in shock the culprit is opened by the fastest route — PCI now, with the surgeon as the backup — not after waiting for an operating room.',
    },
    { id: 'lytic-in-lab', actions: ['tnk'], points: 15, severity: 'critical', text: 'A systemic fibrinolytic in the lab. The culprit is being opened mechanically; a lytic on top of heparin, cangrelor and a large-bore sheath only adds major bleeding.' },
    { id: 'covered-no-perforation', actions: ['stent-covered'], roles: [3, 5], when: (s) => !has(s, 'perforation'), points: 4, severity: 'minor', text: 'A covered stent without a perforation. Covered stents seal perforations; they restenose and clot more than drug-eluting stents.' },
    // IV adenosine for hyperemia: no physiology to measure at an acute culprit, and it drops the pressure of a shocked patient
    { id: 'adenosine-in-shock', actions: ['adenosine-iv-ffr'], when: (s) => s.pulse, replaces: ['ffr-adenosine-unsafe', 'ffr-adenosine-no-wire'], points: 5, severity: 'major', text: 'An IV adenosine infusion in cardiogenic shock. It is for hyperemia during FFR of a stable lesion: here it drops a pressure that is already failing, and FFR means nothing at an acute culprit.' },
    // the radial cocktail is verapamil and nitroglycerin: both drop a low pressure. The same id as the built-in rule, which
    // it hides for every action: so it says intracoronary verapamil too
    { id: 'cocktail-low-pressure', actions: ['radial-cocktail', 'ic-verapamil'], when: (s) => s.pulse && s.vitals.sbp < 90, replaces: RATE_RULES, points: 3, severity: 'minor', text: 'Verapamil — the radial cocktail, or intracoronary — with a systolic pressure under 90 mmHg. Verapamil (and the cocktail\'s nitroglycerin) drops the pressure further: in shock, heparin alone through the sheath — and no verapamil even once a pressor holds the pressure (its label rules it out in cardiogenic shock).' },
    { id: 'opened-early', actions: ['balloon-predil', 'stent-des', 'balloon-nc', 'stent-covered'], roles: TECH, when: (s) => !has(s, 'wired'), points: 2, severity: 'minor', text: 'A balloon or stent opened before there was a wire to put it on. Open devices when the operator asks for them.' },
    askHarm(TECH_ASKS[0], 'The wrong catheter when the operator asked for one for the left coronary from the groin. A JR4 is shaped for the right coronary, a pigtail for the left ventricle, and a Tiger for the radial approach.', 2),
    askHarm(TECH_ASKS[1], 'A balloon pump when the operator asked for the Impella. In infarct-related shock a routine IABP does not improve survival (IABP-SHOCK II; 2025 ACC/AHA: 3, no benefit).'),
    askHarm(TECH_ASKS[3], 'A right-coronary guide when the operator asked for a left guide.'),
    askHarm(TECH_ASKS[4], 'OCT when the operator asked for IVUS. The OCT flush cannot clear an ostial left main with the guide sitting in it, and it costs contrast a shocked patient\'s kidneys cannot spare.', 2),
    askHarm(TECH_ASKS[5], 'The wrong device when the operator asked for a drug-eluting stent. Check the order and the box before you open it.'),
    askHarm(TECH_ASKS[6], 'The wrong balloon when the operator asked for a non-compliant one. A compliant balloon at high pressure over-stretches the vessel at the stent edges instead of expanding the stent.'),
    { ...askHarm(RN_ASKS[4], 'Oral P2Y12 tablets when the operator asked for the IV drug. In shock they are absorbed poorly and a drowsy patient may aspirate them; if the surgeon has to take him, a ticagrelor load means days of bleeding risk.'), replaces: ANTITHROMBOTIC_RULES },
  ]),
  timings: [
    { label: 'Pressor running', actions: ['pressor'], flag: 'pressor', target: 6 },
    // when the pump is working (the tech's priming does not count)
    { label: 'Mechanical support in', actions: [], flag: 'impella', target: 30 },
    { label: 'Left main open, from the angiogram', actions: [], flag: 'pci', target: 25, from: 'angio' },
  ],
  deathAfter: 8,
  completeWhen: (s) => has(s, 'pci') && has(s, 'final-angio'),
  teaching: [
    'ST elevation in aVR with ST depression in most other leads is global subendocardial ischemia: think left main or three-vessel disease. It is not a formal STEMI criterion, but an acute coronary syndrome with cardiogenic shock calls for emergency angiography and revascularization of the culprit either way (2025 ACC/AHA ACS: Class 1).',
    'Cardiogenic shock: a norepinephrine infusion first, to a mean of 65 or more (push-dose epinephrine only bridges a few minutes); oxygen for an SpO₂ under 90 %, and be ready to ventilate. No fluid or raised legs for wet lungs, no nitrates, no beta-blockers, no sedatives that drop the pressure — a small dose of fentanyl for the pain.',
    'A balloon in the left main stops the flow to most of the left ventricle. Get the support in first: a microaxial flow pump (Impella CP) improved 180-day survival in STEMI shock (DanGer Shock: 45.8 % vs 58.5 % died), at the cost of more bleeding, limb ischemia and dialysis — 2025 ACC/AHA: 2a for selected patients. The trial was in STEMI shock; with almost the whole left ventricle at risk, a left main culprit in shock is where teams lean on it most. A routine balloon pump does not help (IABP-SHOCK II: 3, no benefit).',
    'Before the pump: an echo for LV thrombus and the aortic valve, heparin with an ACT of 250 s or more, ultrasound-guided femoral access with the closure sutures placed first, and the catheters and the guide through a second artery (they cannot share the pump\'s sheath) — and after it, the leg below the sheath checked every hour, with the sheath left in until the pump comes out.',
    'Heart team: call the surgeon at once, but do not wait for the operating room. In shock the culprit is opened by the fastest route — usually PCI; surgery when the anatomy cannot be treated with a stent, or the PCI fails.',
    'Open the culprit only (CULPRIT-SHOCK): routine PCI of a non-culprit artery during the emergency procedure is harmful in shock (2025 ACC/AHA: 3 — Harm). The RCA is dealt with once he is stable.',
    'Left main PCI is guided by intravascular imaging (2025 ACC/AHA: Class 1): size the stent to the reference, cover the ostium 1–2 mm into the aorta, post-dilate with a non-compliant balloon sized to the left main, and check the expansion (here 93 % of the reference area). IVUS, not OCT, at an ostial left main: the flush cannot clear it.',
    'P2Y12 in shock: IV cangrelor works in minutes and is gone within an hour if he needs surgery; no oral load before the anatomy is known when bypass surgery is still possible.',
    'Clot at the left main ostium: routine aspiration brings no benefit (TASTE, TOTAL) and can drag clot into the aorta; a GP IIb/IIIa inhibitor is the bail-out for a heavy thrombus burden.',
    'The tech zeroes the transducers, puts the pads on and primes the pump while the run is being read; the tech and the nurse call out every pressure dip during the inflations, with the number.',
  ],
};
