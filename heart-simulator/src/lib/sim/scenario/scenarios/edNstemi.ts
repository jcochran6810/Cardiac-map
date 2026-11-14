import type { Effect, Line, Scenario, SimState, Timing } from '../types';
import { allOf, bpAfter, canSwallow, firstDone, has, orderedFlag } from '../kit';
import { askCritical, askEvents, type LabAsk } from '../labKit';
import { DOOR_TO_ECG, ED_MD, ED_RN, edNurse, edOrder, physicianDispo } from '../edKit';

/**
 * An acute coronary syndrome without ST elevation, in a PCI-capable emergency department on a weekday afternoon. A
 * 64-year-old woman with type 2 diabetes is driven in by her husband after two hours of chest pressure that came and went;
 * she is pain-free at triage. Her 12-lead shows widespread ST depression (I, II, aVF, V4–V6) with ST elevation in aVR — no
 * STEMI criteria. Her first high-sensitivity troponin is above the women's limit (though it would pass for a man's), and the
 * repeat an hour later has tripled: an NSTEMI. Half an hour in, the pressure comes back at rest.
 *
 * The ER nurse triages her (ESI 2), records the 12-lead within 10 minutes and shows it to the ED physician, puts her on the
 * monitor, gives aspirin on the chest pain standing order, records the posterior leads and gives heparin on the physician's
 * orders, records a new 12-lead and gives nitroglycerin (standing order) when the pain comes back and reports it, and
 * draws the repeat troponin on time. The ER doctor reads the 12-lead (not a STEMI; V7–V9 for a hidden posterior one),
 * orders aspirin, heparin and the serial troponin, decides the P2Y12 with cardiology (held until the anatomy is known: she
 * may need bypass), admits her for angiography within 24 hours, and treats the returning pain with a new 12-lead and
 * nitroglycerin. The traps: a fibrinolytic or a cath lab activation for ST depression, missing the new 12-lead with the new
 * pain, and reading one "normal-looking" troponin as reassurance.
 */

/** Minutes from a troponin draw to its result (the lab runs chest pain troponins STAT) */
const TROP_TAT = 8;
/** The 0/1-hour pathway: the repeat an hour after the first draw */
const TROP_REPEAT = 60;
/** From this many minutes after the first draw a repeat counts as the 1-hour sample; before it the change means nothing */
const TROP_EARLIEST = 50;
/** Her troponins (ng/L), and this assay's sex-specific 99th-percentile upper reference limits */
const TROP_1 = 24;
const TROP_2 = 78;
const URL_WOMEN = 16;
const URL_MEN = 34;
/** The clock minute at which the pressure comes back, whatever has been done */
const PAIN_MINUTE = 30;
/** The clock minute at which the step-down bed is ready: until then she boards in the department, on the monitor */
const BED_MINUTE = 70;

/** The ER nurse's run: the computer ED physician decides. The ER doctor's run: a computer nurse does the nursing */
const nurseRun = (s: SimState) => s.role === 6;
const doctorRun = (s: SimState) => s.role === 7;

/** A clock minute as the case clock shows it (minutes:seconds) */
const clock = (m: number) => {
  const total = Math.round(m * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/** The minute the 1-hour troponin is due: an hour after the first was drawn */
const tropDue = (s: SimState) => s.flags.labs + TROP_REPEAT;

/** The pressure is back and has not yet gone */
const painOn = (s: SimState) => has(s, 'pain-back') && !has(s, 'pain-relieved');

/** When the ER nurse drew the repeat troponin late enough after the first to count as the 1-hour sample, or null */
const onTimeRepeat = (s: SimState) => {
  if (!has(s, 'labs')) return null;
  return s.performed.find((p) => p.id === 'troponin-repeat' && p.minute >= s.flags.labs + TROP_EARLIEST)?.minute ?? null;
};

/** The learner's own 12-leads */
const ECGS = ['ecg12-repeat', 'ecg12'];

/**
 * A 12-lead recorded by the learner since the pain came back. One that was being recorded as it came back counts from that
 * moment (the pain event flags it 'ecg-at-pain'): the tracing it gave, and the learner read, is the one with the pain
 */
const ecgSincePain = (s: SimState) => firstDone(s, ECGS, 'pain-back') ?? (has(s, 'ecg-at-pain') ? s.flags['pain-back'] : null);

/** What her 12-lead shows: the explanation the feedback gives after the learner's read */
function ecgFact(s: SimState): string {
  const rate = `${s.rhythm.hr > 100 ? 'Sinus tachycardia' : 'Sinus rhythm'} ${s.rhythm.hr}`;
  // the 'nstemi' profile's vector model: about −1 to −1.5 mm in I, II and V4–V6 (deepest in V5), −0.6 to −0.8 in V3 and aVF,
  // +1.2 mm in aVR and +0.4 in V1 — and in V7–V9 depression, not elevation
  const tracing = `${rate}: horizontal ST depression of about 1 to 1.5 mm in I, II and V4–V6 (deepest in V5; less in aVF and V3), and about 1 mm of ST elevation in aVR (a little in V1) — no ST elevation meeting STEMI criteria in any two contiguous leads.`;
  if (painOn(s)) {
    return `${tracing} Recorded with the pain back: the same widespread ST depression and no new ST elevation — still not a STEMI, but ischemia going on now. Treat the pain (nitroglycerin, with the heparin running) and tell ${s.role === 6 ? 'the physician' : 'cardiology'}: pain that will not settle, a falling pressure or an arrhythmia takes her to the cath lab now.`;
  }
  return `${tracing} Widespread ST depression with ST elevation in aVR is subendocardial ischemia — in a woman with chest pressure today, an acute coronary syndrome without ST elevation (NSTE-ACS) until proven otherwise, and a high-risk pattern (left main or three-vessel disease). ${s.role === 6
    ? 'Show it to the ED physician now: it is not a STEMI, but it is not a tracing to file.'
    : 'Not a STEMI: no cath lab activation and no fibrinolytic. Record V7–V9 as well: ST depression deepest in V1–V3 is the classic mirror image of a posterior STEMI — hers is deepest in V5, but a circumflex occlusion can hide from the standard 12 leads.'}`;
}

/** Cardiology on the P2Y12: held until the anatomy is known, or — already given — worked with */
const p2y12Word = (s: SimState) => (has(s, 'p2y12')
  ? 'She has had ticagrelor already? Then that\'s done — if she turns out to need bypass, the surgeons will wait a few days for it to wear off.'
  : 'Hold the P2Y12 until I\'ve seen her arteries: with aVR up she may have left main or three-vessel disease, and as a diabetic she may be better off with bypass — ticagrelor would hold the surgeons up for days. We\'ll load her on the table.');

/** Cardiology's plan, the first time the ER doctor calls with the 12-lead: the risk, the admission, angiography, the P2Y12 */
function consultPlan(s: SimState): string {
  const trop = has(s, 'trop1-back') ? `a troponin of ${TROP_1} — above the limit for a woman` : 'the troponin still pending';
  return `Widespread ST depression with aVR up, a diabetic, ${trop}: high-risk NSTE-ACS — her GRACE score is over 140. Not an emergency case while she is pain-free and stable: aspirin, heparin, admit her to us on the step-down unit, and angiography within 24 hours — first case tomorrow. ${p2y12Word(s)} Serial troponins, a 12-lead with any pain, and call me straight back if the pain comes back and won't settle, her pressure drops or she has an arrhythmia — then she comes to the lab now.`;
}

/** What cardiology says, depending on when the ER doctor calls (the plan is given once, with the first call that has a 12-lead) */
function consultText(s: SimState): string {
  // nothing to discuss yet: the consultant asks for the tracing (and nothing names what it will show)
  if (!has(s, 'ecg12')) return 'Cardiology: "Chest pressure on and off in a 64-year-old with diabetes — what does her 12-lead show? Get me the tracing and the first troponin, then call me back."';
  const planned = has(s, 'consult-plan');
  if (painOn(s)) {
    const ecg = ecgSincePain(s) !== null ? 'The same ST depression on the new 12-lead, no ST elevation — good that you repeated it.' : 'A 12-lead with the pain, please — now.';
    const nitro = has(s, 'nitro-for-pain') ? 'Another nitroglycerin in 5 minutes if it hasn\'t gone' : 'Nitroglycerin now';
    const plan = planned ? '' : ` Either way she is a high-risk NSTE-ACS: admit her to us. ${p2y12Word(s)}`;
    return `Cardiology: "Pain back at rest? ${ecg} ${nitro}, and make sure the heparin is running. If it won't settle on that, or her pressure drops or she has an arrhythmia, she comes to the lab now — not tomorrow: call me straight back.${plan}"`;
  }
  if (has(s, 'pain-relieved')) {
    const rest = planned
      ? `Heparin on, nitroglycerin as needed${has(s, 'p2y12') ? '' : ', and still no P2Y12 until I\'ve seen her arteries'}.`
      : consultPlan(s);
    return `Cardiology: "Good that it settled with the nitroglycerin. Pain at rest again puts her first on the table tomorrow morning — sooner if it comes back and won't settle. ${rest}"`;
  }
  return `Cardiology: "${consultPlan(s)}"`;
}

/** The ED physician's read of the 12-lead (the ER nurse's run): the one the nurse brings, finds on the printer or records */
const PHYSICIAN_READ = 'No ST elevation that meets STEMI criteria, so no cath lab activation for this. But that is ST depression in I, II, aVF and V4 to V6, with aVR up about a millimeter: widespread ischemia — it can mean left main or three-vessel disease. With her story she is high risk. Aspirin on the standing order if she hasn\'t had it, a line and the first troponin now; keep her on the monitor, and a new 12-lead with any new pain.';

/** The physician's answer when the nurse reports the returning pain: what is done is acknowledged, what is not is asked for */
function painReply(s: SimState): string {
  const ecg = ecgSincePain(s) !== null
    ? 'I\'ve seen the new 12-lead: the same ST depression, no new ST elevation — still not a STEMI.'
    : 'A new 12-lead now, while she has the pain, and show it to me.';
  const nitro = has(s, 'nitro-for-pain')
    ? 'Good — another nitroglycerin in 5 minutes if it hasn\'t gone, up to three, holding for a systolic under 90.'
    : 'Nitroglycerin on the standing order: 0.4 under the tongue every 5 minutes, up to three, holding for a systolic under 90.';
  return `Her chest pressure is back? ${ecg} ${nitro} I'm letting cardiology know — if it won't settle, she goes to the lab now.`;
}

/** The ER nurse's report to the ED physician (SBAR): the 12-lead, the returning pain, the repeat troponin — each answered once */
function report(s: SimState): Effect {
  const flags = ['physician-notified'];
  const say: Line[] = [];
  if (!has(s, 'physician-read')) {
    if (!has(s, 'ecg12')) {
      say.push(['physician', 'Two hours of chest pressure on and off, in a woman with diabetes? Pain-free or not, get me a 12-lead right now — within 10 minutes of her arrival — and put her on the monitor. I\'m coming.', 'warn']);
    } else {
      say.push(['physician', `Let me see it — thank you. ${PHYSICIAN_READ}`]);
      flags.push('physician-read');
    }
  }
  if (has(s, 'pain-back') && !has(s, 'pain-reported')) {
    say.push(['physician', painReply(s)]);
    flags.push('pain-reported');
  }
  if (has(s, 'trop2-back') && !has(s, 'trop2-reported')) {
    say.push(['physician', `From ${TROP_1} to ${TROP_2} in an hour: a real rise — this is an NSTEMI. Cardiology has it; put it in your report to the step-down nurse.`]);
    flags.push('trop2-reported');
  }
  if (!say.length) say.push(['physician', 'Thanks — keep me posted.']);
  return { say, flags };
}

/**
 * Nitroglycerin for the returning pain: the first dose eases it, a second takes it away (the case's own numbers). The ED
 * physician may run it as an IV infusion instead (`iv`): 10 mcg/min with no bolus, titrated to the pain — the guideline
 * drug for ischemic pain that persists (2014 AHA/ACC NSTE-ACS, 2025 ACC/AHA ACS)
 */
function nitroForPain(s: SimState, who: 'learner' | 'physician' | 'nurse', iv = false): Effect {
  const bp = bpAfter(s, -14, -8);
  const first = !has(s, 'nitro-for-pain');
  const hr = first ? 96 : 90;
  const given: Line[] = who === 'physician'
    ? [['physician', 'I\'m giving her a nitroglycerin myself — 0.4 under the tongue.', 'warn']]
    : who === 'nurse' ? [['nurse', 'I gave her a nitroglycerin on the chest pain standing order, doctor.', 'warn']]
      : iv ? [['you', first ? 'Nitroglycerin infusion started at 10 mcg/min, no bolus, to be titrated up 10 mcg/min every 3–5 minutes to the pain.' : 'The nitroglycerin infusion up by 10 mcg/min.']] : [];
  return {
    say: [...given, ['patient', first ? '"It\'s easing… maybe a 2 now."' : '"It\'s gone."'], ['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`]],
    vitals: { ...bp, pain: first ? 2 : 0 }, rhythm: { profile: s.rhythm.profile, hr },
    flags: who === 'learner' ? ['nitro', ...(iv ? ['nitro-iv'] : []), first ? 'nitro-for-pain' : 'pain-relieved'] : ['nitro-for-pain'],
  };
}

// The ED physician's orders in the ER nurse's run: each sets `ordered:<id>`, so the nurse may then give it

const POSTERIOR_ORDER: LabAsk = edOrder({
  id: 'posterior', when: (s) => has(s, 'physician-read'), early: true,
  ask: 'And posterior leads for me, please — V7, V8 and V9: a circumflex occlusion can hide from the standard 12 leads, and I want to be sure there is no posterior STEMI behind that ST depression.',
  accept: ['ecg-posterior'],
  thanks: 'No ST elevation in V7 to V9 — no posterior STEMI hiding behind it. Thanks.',
  fallback: 'I\'ll record the posterior leads myself.',
  fallbackEffect: () => ({ say: [['monitor', 'V7–V9: no ST elevation.']] }),
  gives: 'posterior-recorded', points: 5,
  label: 'Posterior leads V7–V9 on the physician\'s order',
  why: 'ST depression deepest in V1–V3 (often with tall R waves there) is the classic mirror image of ST elevation at the back of the heart; hers is deepest in V5, which points to subendocardial ischemia — but circumflex occlusions are often silent on the standard 12 leads. Moving three electrodes to the back (V7–V9: 0.5 mm of ST elevation is the threshold) takes a minute and settles whether this is a STEMI equivalent.',
});

const HEPARIN_ORDER: LabAsk = edOrder({
  // not once it is in: a nurse who gave it before the order is told so (the event 'rn-heparin-unordered'), not dosed twice
  // nor on top of a fibrinolytic the nurse started without an order (the physician stops it and watches for bleeding)
  id: 'heparin', when: (s) => has(s, 'posterior-recorded') && !has(s, 'heparin') && !has(s, 'lytic') && (has(s, 'iv') || s.minute >= s.flags['posterior-recorded'] + 4),
  ask: 'This is an acute coronary syndrome without ST elevation, and she is high risk: heparin, please — 4,000 units IV now (60 units a kilo, capped at 4,000), then the drip at 980 units an hour on the ACS nomogram. The baseline aPTT and platelets are in her first labs.',
  accept: ['heparin'],
  thanks: 'Thanks — an aPTT in 6 hours, per the nomogram.',
  fallback: 'I need that heparin in now — I\'m getting it hung myself.',
  // nobody started a line: another nurse puts one in first
  fallbackEffect: (s) => (has(s, 'iv')
    ? { flags: ['heparin'] }
    : { say: [['team', 'Another nurse puts an 18-gauge line in her right forearm, and the heparin goes up: 4,000 units, then 980 units an hour.']], flags: ['iv', 'heparin'] }),
  gives: 'heparin-given', points: 10,
  label: 'Heparin on the physician\'s order',
  why: 'Every NSTE-ACS gets an anticoagulant on top of aspirin, whatever the plan for the cath lab: unfractionated heparin 60 units/kg (at most 4,000) then 12 units/kg/h (at most 1,000) on a nomogram. The ER nurse gives it on the order, reads the dose back, has it double-checked and starts the aPTT schedule.',
});

const RN_ORDERS = [POSTERIOR_ORDER, HEPARIN_ORDER];

/** The timing goals: the department's 12-lead, aspirin, the new 12-lead with the new pain, and the serial troponin */
const TIMINGS: Timing[] = [
  DOOR_TO_ECG,
  { label: 'Door to aspirin', actions: ['aspirin'], target: 15 },
  { label: 'New pain to a new 12-lead', actions: ECGS, flag: 'ecg-at-pain', from: 'pain-back', target: 10 },
  // the interval itself is the point: the pathway's repeat is 1–3 hours after the first draw (no single target)
  { label: 'First troponin to the repeat (goal: 1–3 hours)', actions: [], flag: 'trop2-drawn', from: 'labs' },
];

export const edNstemi: Scenario = {
  id: 'nstemi-troponin-ed',
  title: 'Chest pressure that comes and goes',
  // the picker shows it before the case starts: it names neither the tracing nor what happens next
  summary: '64-year-old woman with diabetes, two hours of chest pressure on and off, pain-free at triage. Read her 12-lead, follow her troponins, and decide what she needs — and what she must not get.',
  setting: 'ed',
  roles: [6, 7],
  difficulty: 'intermediate',
  conditionId: 'nstemi',
  briefing: {
    default: [
      ['team', 'A weekday afternoon. A 64-year-old woman walks up to the triage desk with her husband: "I\'ve had a pressure in my chest on and off for two hours. It\'s gone right now — I almost didn\'t come."'],
      ['team', 'She is a little pale. She has diabetes. The waiting room is full.'],
      ['team', 'Your hospital has a cath lab, cardiology on call and cardiac surgery.'],
    ],
    6: [
      ['team', 'A weekday afternoon. A 64-year-old woman walks up to the triage desk with her husband: "I\'ve had a pressure in my chest on and off for two hours. It\'s gone right now — I almost didn\'t come."'],
      ['team', 'She is a little pale. She has diabetes. The waiting room is full.'],
      ['team', 'You are the triage nurse, and she will be your patient. The ED physician is in the next room. Your hospital has a cath lab, cardiology on call and cardiac surgery.'],
    ],
    7: [
      ['team', 'A weekday afternoon. A 64-year-old woman with diabetes was driven in by her husband after two hours of chest pressure that came and went. Triage made her ESI 2 and brought her straight back to bed 7.'],
      ['nurse', 'She\'s pain-free right now, doctor. She\'s on the monitor, and I\'m recording her 12-lead; then a line and the chest pain labs.'],
      ['team', 'You are the ED physician. Nothing has been given yet. Your hospital has a cath lab, cardiology on call and cardiac surgery.'],
    ],
  },
  initial: {
    rhythm: { profile: 'nstemi', hr: 92 },
    vitals: { sbp: 138, dbp: 80, spo2: 97, rr: 18, etco2: 36, pain: 0, gcs: 15, glucose: 212, temp: 36.9 },
  },
  // what the built-in safety rules read (types.ts Problem)
  problems: ['acs'],
  facts: {
    triage: 'ESI 2: two hours of chest pressure coming and going, in a 64-year-old woman with diabetes — high risk, even pain-free right now. A monitored bed now, not the waiting room; the 12-lead within 10 minutes of arrival, and the physician told.',
    opqrst: 'It started about two hours ago while I was folding laundry — a pressure across my chest, up into my jaw, with some nausea and a sweat. It came and went three times, ten minutes or so each; the last one stopped about 20 minutes ago, in the car. Right now there\'s nothing. It doesn\'t change when I breathe or move, and I\'ve never had it before.',
    sample: 'I\'m allergic to penicillin — a rash. Metformin twice a day, lisinopril, atorvastatin, and a baby aspirin every morning; I took it today. Diabetes for 12 years, high blood pressure and cholesterol. I quit smoking 10 years ago, and my mother had a heart attack at 60. Lunch at noon. About 180 pounds.',
    pde5: 'No — nothing like that.',
    lungs: 'Clear and equal on both sides.',
    perfusion: (s) => (painOn(s)
      ? 'Pale and clammy now; neck veins flat; radial pulses strong and equal.'
      : 'Skin warm and dry, a little pale; neck veins flat; radial pulses strong and equal; no leg swelling.'),
    ecg12: ecgFact,
    // the aPTT is a baseline only when it is drawn before the heparin
    labs: (s) => `Blood drawn and sent STAT: high-sensitivity troponin I, CBC with platelets, a chemistry panel with creatinine and potassium, PT/INR and aPTT (${has(s, 'heparin') ? 'drawn after the heparin bolus: no baseline' : 'a baseline before heparin'}). The troponin is back in about 10 minutes.`,
    troponin: 'Repeat high-sensitivity troponin drawn and sent STAT.',
    cxr: 'Portable chest X-ray: normal heart size, clear lungs, a normal mediastinum.',
    pocus: 'Bedside ultrasound: the left ventricle squeezes well overall, perhaps a little less in the lateral wall; no pericardial effusion; the right ventricle is not dilated; the lungs slide, with A-lines; the aortic root is not dilated.',
    ct: 'Radiology: no aortic dissection and no pulmonary embolism.',
    consult: consultText,
  },
  status: (s) => {
    if (painOn(s)) return `"The pressure's still there — ${s.vitals.pain} out of 10."`;
    if (has(s, 'pain-relieved')) return '"It\'s gone again. I just feel worn out."';
    return '"No pain right now. Just tired — and a little queasy."';
  },
  respond: {
    'notify-physician': report,
    // the nurse gives the drugs in both runs: the ER doctor orders them (the action's own line), the computer nurse gives them
    heparin: (s) => ({
      say: [[edNurse(s), doctorRun(s)
        ? 'Heparin 4,000 units in, doctor, and the drip running at 980 units an hour on the ACS nomogram; an aPTT in 6 hours.'
        : 'Heparin 4,000 units IV push (60 units/kg, capped at 4,000), then the drip at 980 units an hour (12 units/kg/h) on the ACS nomogram — double-checked with a second nurse; an aPTT in 6 hours.']],
      flags: ['heparin'],
    }),
    // the ER doctor's P2Y12 order: the nurse gives it, and says so if cardiology asked to hold it (the nurse's run: the default)
    p2y12: (s) => {
      if (!doctorRun(s) || !s.pulse || !canSwallow(s)) return null;
      return {
        say: [has(s, 'p2y12-hold')
          ? ['nurse', 'Ticagrelor 180 mg given on your order, doctor — though cardiology asked us to hold it until they have seen her arteries.', 'warn']
          : ['nurse', 'Ticagrelor 180 mg: she swallows the two tablets.']],
        flags: ['p2y12'],
      };
    },
    // nitroglycerin while the pain is back eases it; at any other time the default (no pain to relieve, the pressure falls)
    nitro: (s) => (s.pulse && painOn(s) ? nitroForPain(s, 'learner') : null),
    'nitro-iv': (s) => (s.pulse && painOn(s) ? nitroForPain(s, 'learner', true) : null),
    // the serial troponin: the ER doctor orders it for the 1-hour mark (the nurse draws it then); the ER nurse draws it, and
    // a sample drawn too soon after the first cannot show the change
    'troponin-repeat': (s) => {
      if (!has(s, 'labs')) return null;
      const due = tropDue(s);
      if (doctorRun(s)) {
        if (has(s, 'trop2-ordered')) return { blocked: true, say: [['system', `The repeat troponin is already ordered: the nurse draws it at ${clock(due)}.`]] };
        if (s.minute < due) return { say: [['nurse', `Repeat high-sensitivity troponin ordered for one hour after the first — I'll draw it at ${clock(due)}.`]], flags: ['troponin-repeat', 'trop2-ordered'] };
        return { say: [['nurse', 'Repeat high-sensitivity troponin drawn now and sent STAT.']], flags: ['troponin-repeat', 'trop2-ordered', 'trop2-drawn'] };
      }
      if (has(s, 'trop2-drawn')) return { blocked: true, say: [['system', 'The 1-hour troponin is already drawn and on its way to the lab.']] };
      const since = Math.round(s.minute - s.flags.labs);
      if (since < TROP_EARLIEST) {
        return {
          say: [
            ['you', `Repeat troponin drawn — only ${since} minutes after the first.`],
            ['hospital', 'Lab: that is too soon after the first sample for the change to mean anything — the pathway\'s repeat is 1 to 3 hours after the first. It will have to be drawn again at the 1-hour mark.', 'warn'],
          ],
          flags: ['troponin-repeat', 'trop-early'],
        };
      }
      return { say: [['you', `Repeat high-sensitivity troponin drawn — ${since} minutes after the first — and sent STAT.`]], flags: ['troponin-repeat', 'trop2-drawn'] };
    },
    // ST depression is not a STEMI: the interventional cardiologist declines, in words that fit her (the harm scores it)
    'cath-lab-activate': (s) => {
      if (!has(s, 'ecg12') || has(s, 'ecg-stemi')) return null;
      return {
        say: [['consultant', `Interventional cardiology calls back: "I've looked at her 12-lead. ST depression with aVR up is not a STEMI — I'm not bringing the team in for it. She is high risk, though: aspirin, heparin, admit her to us, and angiography within 24 hours. ${painOn(s)
          ? 'Treat the pain she has now — nitroglycerin, the heparin running — and if it won\'t settle, or her pressure drops or she has an arrhythmia, call me: then she comes to the lab now."'
          : 'If the pain comes back and won\'t settle on nitroglycerin, or her pressure drops or she has an arrhythmia, call me — then she comes to the lab now."'}`, 'warn']],
        flags: ['alert-declined'],
      };
    },
    // cardiology's advice, and the P2Y12 held until the anatomy is known whenever the consultant says so (a call before
    // there is a 12-lead to discuss gives no plan: the consultant asks for the tracing)
    'consult-cardiology': (s) => ({
      say: [['consultant', consultText(s)]],
      flags: ['consult', ...(has(s, 'ecg12') ? ['consult-plan', ...(has(s, 'p2y12') ? [] : ['p2y12-hold'])] : [])],
    }),
    admit: (s) => {
      if (!s.pulse) return null;
      // where she goes rests on the 12-lead: a STEMI goes to the cath lab now, this one to cardiology's bed
      if (!has(s, 'ecg12')) return { blocked: true, say: [['system', 'Admit her for what? Look at her 12-lead first: whether it shows a STEMI (the cath lab now) or not decides where she goes.']] };
      const bed = s.minute >= BED_MINUTE ? 'The bed is ready now.' : `The bed should be ready at about ${clock(BED_MINUTE)} — until then she boards here, on the monitor.`;
      return { say: [['hospital', `Cardiology accepts her to a monitored bed on the cardiac step-down unit, for angiography within 24 hours. ${bed}`]], flags: ['dispo', 'admit'] };
    },
    transfer: () => ({ blocked: true, say: [['system', 'Not needed: this hospital has a cath lab, cardiology and cardiac surgery. Consult cardiology and admit her — a transfer only adds delay and risk.']] }),
    // she leaves the department only once the step-down bed is ready
    handoff: (s) => {
      if (!s.pulse || !has(s, 'admit') || has(s, 'bed-ready')) return null;
      return { blocked: true, say: [['system', `The step-down bed is not ready yet (about ${clock(BED_MINUTE)}): she boards here on the monitor — keep caring for her (reassess).`]] };
    },
  },
  events: [
    // ─── the ER doctor's run: the computer nurse ───
    { id: 'md-setup', when: doctorRun, effect: () => ({ flags: ['monitor', 'triage'] }) },
    {
      // the nurse's 12-lead is a recorded tracing: the engine asks the doctor to read it (no read of its own here)
      id: 'md-nurse-ecg', when: (s) => doctorRun(s) && s.pulse && !has(s, 'ecg12') && s.minute >= 2,
      effect: () => ({ say: [['nurse', 'Doctor — her 12-lead, bed 7. She\'s pain-free right now.']], flags: ['ecg12'] }),
    },
    {
      // the first troponin is on the chest pain order: the nurse draws it with the line (one the doctor placed is not placed twice)
      id: 'md-nurse-iv', when: (s) => doctorRun(s) && s.minute >= 3,
      effect: (s) => {
        // what the doctor already did (a line, the labs) is not done twice
        const line = has(s, 'iv') ? '' : 'An 18-gauge in her right forearm';
        const blood = has(s, 'labs') ? 'your bloods are already off' : 'blood is off on the chest pain order: high-sensitivity troponin, CBC, chemistry, coags. The troponin is back in about 10 minutes';
        const text = line ? `${line}, doctor; ${blood}.` : has(s, 'labs') ? '' : `${blood.charAt(0).toUpperCase()}${blood.slice(1)}.`;
        return { say: text ? [['nurse', text]] : [], flags: ['iv', 'labs'] };
      },
    },
    {
      id: 'md-aspirin-ask', when: (s) => doctorRun(s) && s.pulse && !has(s, 'aspirin') && s.minute >= 6,
      effect: () => ({ say: [['nurse', 'She took her usual baby aspirin this morning, doctor — do you want the full dose chewed?']] }),
    },
    {
      id: 'md-plan-nudge', when: (s) => doctorRun(s) && has(s, 'trop1-back') && !has(s, 'dispo') && s.minute >= s.flags['trop1-back'] + 12,
      effect: () => ({ say: [['nurse', 'Doctor — what\'s the plan for bed 7? Her husband is asking whether she\'s staying.', 'warn']] }),
    },
    {
      id: 'md-trop-ask', when: (s) => doctorRun(s) && has(s, 'labs') && !has(s, 'trop2-ordered') && s.minute >= tropDue(s) + 6,
      effect: () => ({ say: [['nurse', 'Doctor, her first troponin was drawn over an hour ago — do you want the repeat?', 'warn']] }),
    },
    {
      id: 'md-trop-draw', when: (s) => doctorRun(s) && has(s, 'trop2-ordered') && !has(s, 'trop2-drawn') && s.minute >= tropDue(s),
      effect: () => ({ say: [['nurse', 'Repeat troponin drawn — one hour after the first — and sent STAT.']], flags: ['trop2-drawn'] }),
    },
    {
      // nobody asked for a new 12-lead with the new pain: the nurse records it on the chest pain protocol, and the doctor reads it
      id: 'md-nurse-ecg-pain', when: (s) => doctorRun(s) && s.pulse && has(s, 'pain-back') && ecgSincePain(s) === null && s.minute >= s.flags['pain-back'] + 10,
      effect: () => ({ say: [['nurse', 'I\'ve repeated her 12-lead on the chest pain protocol, doctor — here it is.', 'warn']], flags: ['ecg12', 'nurse-ecg-pain'] }),
    },
    {
      id: 'md-nurse-nitro', when: (s) => doctorRun(s) && s.pulse && painOn(s) && !has(s, 'nitro-for-pain') && s.minute >= s.flags['pain-back'] + 12,
      effect: (s) => nitroForPain(s, 'nurse'),
    },

    // ─── the ER nurse's run: the computer ED physician ───
    ...RN_ORDERS.flatMap(askEvents),
    {
      id: 'rn-physician-wants-ecg', when: (s) => nurseRun(s) && s.pulse && !has(s, 'ecg12') && !has(s, 'physician-read') && s.minute >= 10,
      effect: () => ({ say: [['physician', 'The woman with the chest pressure — has she had her 12-lead? Pain-free or not, she should have had it within 10 minutes of walking in. I need it now.', 'warn']] }),
    },
    {
      // nobody recorded it: the physician does, and reads it (no tracing for the nurse to read)
      id: 'rn-physician-ecg', when: (s) => nurseRun(s) && s.pulse && !has(s, 'ecg12') && !has(s, 'physician-read') && s.minute >= 13,
      effect: () => ({ say: [['physician', `I've recorded her 12-lead myself. ${PHYSICIAN_READ}`, 'warn']], flags: ['physician-ecg', 'physician-read'] }),
    },
    {
      // recorded but never shown: the physician finds it on the printer
      id: 'rn-physician-sees-ecg', when: (s) => nurseRun(s) && has(s, 'ecg12') && !has(s, 'physician-read') && s.minute >= s.flags.ecg12 + 5,
      effect: () => ({ say: [['physician', `Is this her 12-lead, sitting on the printer? Every chest pain 12-lead comes to me the moment it prints. ${PHYSICIAN_READ}`, 'warn']], flags: ['physician-read'] }),
    },
    {
      // no first troponin yet: the physician has another nurse draw it, so the pathway (and the case) can go on
      id: 'rn-physician-labs', when: (s) => nurseRun(s) && s.pulse && has(s, 'physician-read') && !has(s, 'labs') && s.minute >= 15,
      effect: () => ({ say: [['physician', 'Her first troponin hasn\'t gone yet? It starts the whole pathway — I\'ve asked another nurse to draw it now.', 'warn']], flags: ['labs'] }),
    },
    {
      // heparin given before anyone ordered it (the built-in rule scores it): the physician says so once she has seen the
      // 12-lead, writes the order after the fact and does not hang a second bolus
      id: 'rn-heparin-unordered', when: (s) => nurseRun(s) && has(s, 'heparin') && !has(s, 'asked-heparin') && has(s, 'physician-read'),
      effect: () => ({
        say: [['physician', 'Heparin is in already? Nobody had ordered it — heparin is not on the chest pain standing order: ask me first, every time. For her it is the right drug, so I\'m writing the order now: the drip stays at 980 units an hour on the ACS nomogram.', 'warn']],
        flags: ['heparin-given', orderedFlag('heparin')],
      }),
    },
    {
      // a fibrinolytic nobody ordered (the case harm scores it): the physician stops it, and holds the heparin for now
      id: 'rn-lytic-stopped', when: (s) => nurseRun(s) && has(s, 'lytic'),
      effect: () => ({ say: [['physician', 'Alteplase is running? Nobody ordered a fibrinolytic — stop it now. ST depression is no indication for one: it opens nothing here and only makes her bleed. No heparin on top of it for now; we watch her for bleeding.', 'bad']], flags: ['lytic-stopped'] }),
    },
    {
      // the first troponin and the 12-lead decide the plan: the physician calls cardiology and admits her
      id: 'rn-dispo', when: (s) => nurseRun(s) && s.pulse && has(s, 'trop1-back') && (has(s, 'heparin-given') || has(s, 'lytic')) && s.minute >= s.flags['trop1-back'] + 2,
      effect: (s) => {
        const d = physicianDispo(s, 'admit', `Her troponin is ${TROP_1}: above the upper limit for a woman (${URL_WOMEN}), even though it would pass under the men's (${URL_MEN}). With that 12-lead and her story, this is NSTE-ACS. I've talked to cardiology: she's admitted to the cardiac step-down unit, for angiography within 24 hours — sooner if the pain comes back and won't settle. No ticagrelor until they've seen her arteries: with aVR up she may need bypass surgery. The repeat troponin is due one hour after the first, at ${clock(tropDue(s))} — please draw it on time. The bed should be ready at about ${clock(BED_MINUTE)}.`);
        return { ...d, flags: [...(d.flags ?? []), 'p2y12-hold'] };
      },
    },
    {
      // the returning pain nobody reported: the physician walks in
      id: 'rn-physician-pain', when: (s) => nurseRun(s) && s.pulse && has(s, 'pain-back') && !has(s, 'pain-reported') && s.minute >= s.flags['pain-back'] + 10,
      effect: () => ({ say: [['physician', 'Her chest pressure came back ten minutes ago and nobody told me? New pain is a new 12-lead, nitroglycerin on the standing order, and a call to me — every time.', 'warn']], flags: ['pain-reported'] }),
    },
    {
      id: 'rn-physician-ecg-pain', when: (s) => nurseRun(s) && s.pulse && has(s, 'pain-back') && ecgSincePain(s) === null && s.minute >= s.flags['pain-back'] + 12,
      effect: () => ({ say: [['physician', 'I\'ve recorded her 12-lead myself, with the pain: the same ST depression, no new ST elevation.', 'warn']], flags: ['physician-ecg-pain'] }),
    },
    {
      id: 'rn-physician-nitro', when: (s) => nurseRun(s) && s.pulse && painOn(s) && !has(s, 'nitro-for-pain') && s.minute >= s.flags['pain-back'] + 12,
      effect: (s) => nitroForPain(s, 'physician'),
    },
    {
      id: 'rn-cardiology-update', when: (s) => nurseRun(s) && has(s, 'pain-reported') && has(s, 'pain-relieved'),
      effect: (s) => ({ say: [['physician', `Cardiology knows about the pain: it settled with the nitroglycerin${has(s, 'heparin') ? ' and she is on heparin' : ''}, so she stays on for angiography first thing tomorrow — sooner if it comes back and won't settle.`]] }),
    },
    {
      id: 'rn-trop-reminder', when: (s) => nurseRun(s) && has(s, 'labs') && !has(s, 'trop2-drawn') && s.minute >= tropDue(s) + 10,
      effect: (s) => ({ say: [['physician', `Has her one-hour troponin gone? It was due at ${clock(tropDue(s))}.`, 'warn']] }),
    },

    // ─── both runs ───
    {
      id: 'trop1-back', when: (s) => has(s, 'labs') && s.minute >= s.flags.labs + TROP_TAT,
      effect: (s) => ({
        say: [
          ['hospital', `Lab: high-sensitivity troponin I ${TROP_1} ng/L — flagged high (this assay's 99th-percentile upper reference limit: ${URL_WOMEN} ng/L for women, ${URL_MEN} for men). Creatinine 1.0 mg/dL, potassium 4.3 mmol/L, hemoglobin 12.8 g/dL, platelets 241,000, INR 1.0, aPTT ${s.flags.heparin <= s.flags.labs ? '78 s (drawn after the heparin bolus)' : '29 s'}; glucose 212 mg/dL.`],
          ...(doctorRun(s) ? [['nurse', `Her troponin is back at ${TROP_1}, doctor — flagged high for a woman, though it's under the men's ${URL_MEN}. Her husband is asking whether she can go home tonight if it's only a little high.`] as Line] : []),
        ],
        flags: ['trop1-back'],
      }),
    },
    // the 1-hour mark (the timing target of the repeat): no line of its own — the order said when
    { id: 'trop2-due', when: (s) => has(s, 'labs') && s.minute >= tropDue(s), effect: () => ({ flags: ['trop2-due'] }) },
    {
      // half an hour in, at rest, the pressure comes back: the rate and the pressure climb with it
      id: 'pain-back', when: (s) => s.pulse && s.minute >= PAIN_MINUTE,
      effect: (s) => ({
        say: doctorRun(s)
          ? [['nurse', 'Doctor — bed 7: her chest pressure is back, 6 out of 10, up into her jaw, and she\'s clammy. Heart rate 104, pressure 152 over 88.', 'warn']]
          : [['patient', '"It\'s back — the same pressure, up into my jaw… and I feel sick."', 'warn'], ['monitor', 'Heart rate 104. BP 152/88.']],
        rhythm: { profile: s.rhythm.profile, hr: 104 }, vitals: { sbp: 152, dbp: 88, pain: 6, rr: 20 },
        // the learner's 12-lead was being recorded as it came back (it is the action that just ended): the tracing, read
        // next, is the one with the pain
        flags: ['pain-back', ...(ECGS.includes(s.performed.at(-1)?.id ?? '') ? ['ecg-at-pain'] : [])],
      }),
    },
    {
      // one nitroglycerin eases it; within a few minutes it is gone
      id: 'pain-settles', when: (s) => has(s, 'nitro-for-pain') && !has(s, 'pain-relieved') && s.minute >= s.flags['nitro-for-pain'] + 8,
      effect: (s) => ({ say: [['patient', '"It\'s gone now."']], vitals: { pain: 0 }, rhythm: { profile: s.rhythm.profile, hr: 90 }, flags: ['pain-relieved'] }),
    },
    {
      id: 'trop2-back', when: (s) => has(s, 'trop2-drawn') && s.minute >= s.flags['trop2-drawn'] + TROP_TAT,
      effect: (s) => ({
        say: [['hospital', `Lab: repeat high-sensitivity troponin I ${TROP_2} ng/L, drawn ${Math.round(s.flags['trop2-drawn'] - s.flags.labs)} minutes after the first (${TROP_1}) — a rise of ${TROP_2 - TROP_1} ng/L.`]],
        flags: ['trop2-back'],
      }),
    },
    {
      id: 'bed-ready', when: (s) => has(s, 'admit') && s.minute >= BED_MINUTE,
      effect: () => ({ say: [['hospital', 'Bed board: her step-down bed is ready — the nurse there is waiting for report.']], flags: ['bed-ready'] }),
    },
    {
      // a fibrinolytic opens nothing here (the clot is not occlusive): only its bleeding shows
      id: 'lytic-bleed', when: (s) => has(s, 'lytic') && s.minute >= s.flags.lytic + 5,
      effect: (s) => ({ say: [[doctorRun(s) ? 'nurse' : 'team', 'Her IV sites are oozing through the dressings, and there is blood at her gums. The 12-lead has not changed.', 'bad']] }),
    },
  ],
  critical: [
    // ─── the ER nurse ───
    {
      id: 'rn-triage', label: 'Triage: ESI 2 — straight to a monitored bed, pain-free or not', roles: ED_RN, points: 5, target: { by: 5 }, done: ['triage'],
      why: 'Chest pain that could be an acute coronary syndrome is at least ESI 2, even when it has stopped: a monitored bed now — not the waiting room — and the physician told. Two hours of pressure that comes and goes, at rest, in a woman with diabetes is high risk.',
    },
    {
      id: 'rn-ecg', label: '12-lead within 10 minutes of arrival', roles: ED_RN, points: 15, target: { by: 10 }, done: ['ecg12'],
      why: 'Every patient with chest pain gets a 12-lead within 10 minutes of arrival (2021 AHA/ACC chest pain guideline; 2025 ACC/AHA ACS guideline) — pain-free or not: it finds the STEMI that needs the cath lab now, and the ischemia that sets her on the troponin pathway.',
    },
    {
      id: 'rn-show', label: 'Show the 12-lead to the ED physician the moment it prints', roles: ED_RN, points: 10, target: { within: { flag: 'ecg12', minutes: 2 } },
      // when no 12-lead came in time and the physician recorded it, there was nothing to show: the missed 12-lead is scored once
      applies: (s) => !has(s, 'physician-ecg'),
      why: 'The 12-lead is read by the physician, not filed: this one is not a STEMI, but widespread ST depression with aVR up is a high-risk pattern that starts the treatment. Take it to the physician (SBAR, closed loop).',
      done: (s) => firstDone(s, ['notify-physician'], 'ecg12'), uses: ['notify-physician', 'ecg12'],
    },
    {
      id: 'rn-monitor', label: 'Continuous cardiac monitoring', roles: ED_RN, points: 5, target: { by: 10 }, done: ['monitor', 'pads'],
      why: 'An acute coronary syndrome can bring an arrhythmia at any time: she stays on the monitor, with the alarms on, from the first minutes until she is handed over.',
    },
    {
      id: 'rn-aspirin', label: 'Aspirin 324 mg chewed, on the chest pain standing order', roles: ED_RN, points: 10, target: { by: 15 }, done: ['aspirin'],
      why: 'Aspirin 162–325 mg, non-enteric-coated and chewed, as soon as possible for every suspected acute coronary syndrome without a true allergy or active bleeding — her daily 81 mg does not replace it. It is on the chest pain standing order: no need to wait for the physician.',
    },
    {
      id: 'rn-iv-labs', label: 'IV access, and the first troponin drawn', roles: ED_RN, points: 5, target: { by: 15 },
      why: 'The line carries the heparin; the first high-sensitivity troponin starts the clock of the 0/1–3-hour pathway (with the CBC, chemistry and a baseline aPTT before the heparin).',
      done: (s) => allOf(firstDone(s, ['iv', 'io']), firstDone(s, ['labs'])), uses: ['iv', 'io', 'labs'],
    },
    ...RN_ORDERS.map(askCritical),
    {
      id: 'rn-ecg-pain', label: 'A new 12-lead within 10 minutes of the returning pain', roles: ED_RN, points: 10, applies: (s) => has(s, 'pain-back'),
      target: { within: { flag: 'pain-back', minutes: 10 } }, done: (s) => ecgSincePain(s), uses: ['ecg12-repeat', 'ecg12'],
      why: 'New or returning pain is a new 12-lead, every time, while the pain is there: an NSTE-ACS can evolve into a STEMI, and the tracing during pain is the one that shows it. This one shows the same ST depression and no ST elevation.',
    },
    {
      id: 'rn-nitro-pain', label: 'Nitroglycerin 0.4 mg for the returning pain, on the standing order', roles: ED_RN, points: 10, applies: (s) => has(s, 'pain-back'),
      target: { within: { flag: 'pain-back', minutes: 10 } }, done: ['nitro'], after: 'pain-back',
      why: 'Sublingual nitroglycerin every 5 minutes, up to three doses, treats ongoing ischemic pain — after checking the pressure (hold for a systolic under 90), a PDE-5 inhibitor and a right ventricular infarct. It is on the chest pain standing order.',
    },
    {
      id: 'rn-report-pain', label: 'Report the returning pain to the ED physician', roles: ED_RN, points: 5, applies: (s) => has(s, 'pain-back'),
      target: { within: { flag: 'pain-back', minutes: 10 } }, done: (s) => firstDone(s, ['notify-physician'], 'pain-back'), uses: ['notify-physician'],
      why: 'Pain at rest that comes back on treatment changes the plan: pain that will not settle, a falling pressure or an arrhythmia means angiography now, not tomorrow. The physician and cardiology need to know at once (SBAR: the pain, the vitals, the new 12-lead, what you gave).',
    },
    {
      id: 'rn-trop', label: 'Repeat troponin drawn on time: one hour after the first', roles: ED_RN, points: 10,
      target: { within: { flag: 'trop2-due', minutes: 10 } },
      done: onTimeRepeat, uses: ['troponin-repeat'],
      why: 'The change between two high-sensitivity troponins decides as much as either value: the pathway repeats it 1–3 hours after the first (here at 1 hour). Too early, and the change means nothing; forgotten, and the diagnosis waits. Her repeat has tripled: an NSTEMI.',
    },

    // ─── the ER doctor ───
    {
      id: 'md-history', label: 'The history: the pain (OPQRST), her medicines and allergies (SAMPLE)', roles: ED_MD, points: 5,
      why: 'Pressure at rest coming and going for two hours, into the jaw, with nausea and a sweat; diabetes, hypertension, a mother with an early MI; a daily aspirin; allergic to penicillin. The story and the risk factors make it an acute coronary syndrome until proven otherwise.',
      done: (s) => allOf(firstDone(s, ['opqrst']), firstDone(s, ['sample'])), uses: ['opqrst', 'sample'],
    },
    {
      id: 'md-posterior', label: 'Posterior leads V7–V9: is a posterior STEMI hiding behind the ST depression?', roles: ED_MD, points: 5, done: ['ecg-posterior'],
      why: 'ST depression deepest in V1–V3 is the classic mirror image of posterior ST elevation; hers is deepest in V5, which points to subendocardial ischemia — but circumflex occlusions are often silent on the standard 12 leads. V7–V9 (0.5 mm of ST elevation is the threshold) take a minute and settle whether this is a STEMI equivalent; hers show none.',
    },
    {
      id: 'md-aspirin', label: 'Aspirin 162–325 mg chewed — on top of her daily 81 mg', roles: ED_MD, points: 10, target: { by: 15 }, done: ['aspirin'],
      why: 'Non-enteric-coated aspirin, chewed, as soon as possible for every suspected acute coronary syndrome without a true allergy or active bleeding. A daily low dose does not replace the loading dose.',
    },
    {
      id: 'md-heparin', label: 'Anticoagulation: unfractionated heparin', roles: ED_MD, points: 10, target: { by: 25 }, done: ['heparin'],
      why: 'Every NSTE-ACS gets an anticoagulant on top of aspirin, whatever the plan for the cath lab (2025 ACC/AHA ACS guideline): unfractionated heparin 60 units/kg (at most 4,000) then 12 units/kg/h (at most 1,000) — or enoxaparin. Start it on the 12-lead and the story; do not wait for the second troponin.',
    },
    {
      id: 'md-trop', label: 'The serial troponin: order the repeat for 1 hour after the first', roles: ED_MD, points: 10,
      target: { within: { flag: 'trop2-due', minutes: 5 } }, done: (s) => firstDone(s, ['troponin-repeat'], 'labs'), uses: ['troponin-repeat'],
      why: 'High-sensitivity troponin at 0 and 1–3 hours (2021 AHA/ACC chest pain guideline): the rise confirms the infarct and its size adds to the risk. One value never sends this patient home — a single troponin rules out an MI only when it is below the limit of detection, the 12-lead is normal and the pain began 3 hours or more before arrival. Hers is above the women\'s limit and her ECG is ischemic.',
    },
    {
      id: 'md-consult', label: 'Consult cardiology: the timing of angiography and the P2Y12 decision', roles: ED_MD, points: 10,
      // a call before there is a 12-lead to discuss decides nothing
      done: (s) => firstDone(s, ['consult-cardiology'], 'ecg12'), uses: ['consult-cardiology'],
      why: 'A high-risk NSTE-ACS (GRACE over 140, dynamic ischemia, a rising troponin) goes to angiography within 24 hours; refractory pain, instability or an arrhythmia means now. Whether and when to load a P2Y12 inhibitor is decided with the interventional cardiologist: with an early invasive plan, loading before the anatomy is known brings no clear benefit, and if she needs bypass it delays the surgery.',
    },
    {
      id: 'md-admit', label: 'Admit her for an early invasive strategy (angiography within 24 hours)', roles: ED_MD, points: 10, done: ['admit'],
      why: 'NSTE-ACS at high risk: a monitored bed on the cardiology service, heparin running, and angiography within 24 hours (2025 ACC/AHA ACS guideline) — sooner for refractory pain, instability or an arrhythmia. Not home, and not a cath lab activation.',
    },
    {
      id: 'md-ecg-pain', label: 'A new 12-lead within 10 minutes of the returning pain', roles: ED_MD, points: 10, applies: (s) => has(s, 'pain-back'),
      target: { within: { flag: 'pain-back', minutes: 10 } }, done: (s) => ecgSincePain(s), uses: ['ecg12-repeat', 'ecg12'],
      why: 'New pain is a new 12-lead before anything else: an NSTE-ACS can evolve into a STEMI, and the tracing during the pain is the one that shows it. Hers shows the same ST depression and no ST elevation: still the NSTE-ACS pathway.',
    },
    {
      id: 'md-nitro-pain', label: 'Nitroglycerin for the returning pain', roles: ED_MD, points: 5, applies: (s) => has(s, 'pain-back'),
      target: { within: { flag: 'pain-back', minutes: 10 } }, done: ['nitro', 'nitro-iv'], after: 'pain-back',
      why: 'Sublingual nitroglycerin, 0.4 mg every 5 minutes up to three doses (or an IV infusion from 10 mcg/min, no bolus), for ongoing ischemic pain (hold for a systolic under 90, a PDE-5 inhibitor, a right ventricular infarct). Pain that will not settle despite it and the heparin takes her to the lab now.',
    },

    // ─── both ───
    {
      id: 'handoff', label: 'Hand-off to the step-down team', points: 5, done: ['handoff'],
      why: 'SBAR with the times (arrival, the 12-leads, each troponin and when it was drawn), the 12-lead findings (ST depression with aVR up, V7–V9 negative), the drugs with doses and times (aspirin, the heparin bolus and rate, the nitroglycerin), the P2Y12 held for cardiology, the returning pain and what settled it, and the plan: angiography within 24 hours, sooner if the pain comes back.',
    },
  ],
  harms: [
    {
      // the "discharge after one troponin" trap, in this case's words: it stands in for the built-in unsafe discharge
      id: 'discharge-acs', actions: ['discharge'], roles: ED_MD, points: 15, severity: 'critical', replaces: ['discharge-unsafe'],
      text: 'Discharging a woman with an NSTE-ACS. Diffuse ST depression with aVR up, recurring pain, diabetes and a first troponin above the women\'s limit make her high risk: one troponin rules nothing out — the chest pain pathway repeats the high-sensitivity troponin at 1–3 hours (2021 AHA/ACC chest pain guideline), and her picture needs admission, antithrombotic treatment and an early invasive strategy (2025 ACC/AHA ACS guideline).',
    },
    {
      // one penalty for one fibrinolytic: it stands in for the built-in rule (and, for the nurse, the built-in 'no order')
      id: 'lytic-st-depression', actions: ['tnk', 'alteplase'], roles: ED_MD, when: (s) => !has(s, 'ecg-stemi'), points: 15, severity: 'critical',
      replaces: ['lytic-no-indication', 'rn-without-order-alteplase'],
      text: 'A fibrinolytic for ST depression. In an acute coronary syndrome without ST elevation the clot does not close the artery: a fibrinolytic opens nothing, and it adds bleeding — in the brain too — and more infarcts (TIMI IIIB). It is harmful in NSTE-ACS; the only ST depression it treats is the mirror image of a posterior STEMI, confirmed on V7–V9. Aspirin, heparin and angiography are the treatment.',
    },
    {
      id: 'rn-lytic-st-depression', actions: ['alteplase'], roles: ED_RN, when: (s) => !has(s, 'ecg-stemi'), points: 15, severity: 'critical',
      replaces: ['lytic-no-indication', 'rn-without-order-alteplase'],
      text: 'A fibrinolytic with no order, for ST depression. The ER nurse gives a fibrinolytic only on the physician\'s order, and none is indicated here. In an acute coronary syndrome without ST elevation the clot does not close the artery: a fibrinolytic opens nothing, and it adds bleeding — in the brain too — and more infarcts (TIMI IIIB). It is harmful in NSTE-ACS; the only ST depression it treats is the mirror image of a posterior STEMI, confirmed on V7–V9. Aspirin, heparin and angiography are the treatment.',
    },
    {
      id: 'cath-lab-st-depression', actions: ['cath-lab-activate'], roles: ED_MD, when: (s) => has(s, 'ecg12') && !has(s, 'ecg-stemi'), points: 5, severity: 'major',
      replaces: ['cath-lab-no-ste'],
      text: 'Activating the cath lab for ST depression. The STEMI activation calls the team in for an occluded artery; widespread ST depression with aVR up is not a STEMI (nor is a raised troponin). Her timing is cardiology\'s to set: angiography within 24 hours for high risk — immediately (within 2 hours) only for refractory pain, a falling pressure or an arrhythmia. Consult cardiology, and keep V7–V9 for a posterior STEMI.',
    },
    {
      id: 'oxygen-normoxic', actions: ['o2-nc', 'o2-nrb'], when: (s) => s.pulse && s.vitals.spo2 >= 90, points: 3, severity: 'minor',
      text: 'Oxygen with an SpO₂ of 90 % or more. Oxygen is for an SpO₂ under 90 % in an acute coronary syndrome: routine oxygen gives no benefit (AVOID, DETO2X; 2025 ACC/AHA ACS guideline).',
    },
    {
      // the built-in "without an order", in words that fit her: nobody ordered it, and cardiology is holding it
      id: 'rn-p2y12-no-order', actions: ['p2y12'], roles: ED_RN, points: 5, severity: 'major', replaces: ['rn-without-order-p2y12'],
      text: 'A P2Y12 loading dose with no order. The ER nurse gives it only on a provider\'s order — and in an NSTE-ACS whether and when to load one is the interventional cardiologist\'s call: with angiography within 24 hours, loading before the anatomy is known brings no clear benefit, and if she needs bypass surgery it holds the surgeons up for days. Ask the physician; give it once it is ordered.',
    },
    {
      id: 'p2y12-against-plan', actions: ['p2y12'], roles: ED_MD, when: (s) => has(s, 'p2y12-hold'), points: 3, severity: 'minor',
      text: 'A P2Y12 loading dose after cardiology asked to hold it. With angiography planned within 24 hours, loading before the anatomy is known brings no clear benefit (the 2025 ACC/AHA ACS guideline says upstream clopidogrel or ticagrelor may be considered when angiography is more than 24 hours away, and does not support routine loading when it is sooner), and with ST elevation in aVR and diabetes she may need bypass surgery, which ticagrelor delays by days. The plan you agreed with the interventional cardiologist stands: they load her on the table.',
    },
  ],
  timings: TIMINGS,
  teaching: [
    'Chest pain that could be an acute coronary syndrome is at least ESI 2 and gets a 12-lead within 10 minutes of arrival — even when the pain has stopped. A tracing without ST elevation does not end the work-up: repeat it every 15–30 minutes while symptoms go on, and with every new pain, since an NSTE-ACS can evolve into a STEMI.',
    'STEMI criteria are ST elevation in two contiguous leads. Widespread ST depression with ST elevation in aVR is diffuse subendocardial ischemia — high risk (left main or three-vessel disease), but not a STEMI: no cath lab activation and no fibrinolytic, which in NSTE-ACS adds bleeding and infarcts without opening anything (TIMI IIIB). The exception is a posterior STEMI, whose mirror image is ST depression deepest in V1–V3: record V7–V9 (0.5 mm of ST elevation is the threshold) whenever precordial ST depression could be one.',
    'High-sensitivity troponin at 0 and 1–3 hours (2021 AHA/ACC chest pain guideline): the change between the two decides as much as either value, and a rise confirms an NSTEMI. A single value rules out an MI only when it is below the assay\'s limit of detection (US labs report down to the limit of quantitation: the lowest value they report), the 12-lead is normal and the pain began 3 hours or more before arrival. Use the sex-specific upper limits: her first value would pass for a man\'s and is high for a woman.',
    'Treatment in the department: aspirin 162–325 mg chewed (a daily 81 mg does not replace it); an anticoagulant for every NSTE-ACS — unfractionated heparin 60 units/kg (at most 4,000) then 12 units/kg/h (at most 1,000), or enoxaparin; sublingual nitroglycerin for ongoing pain (held for a systolic under 90, a PDE-5 inhibitor or a right ventricular infarct); oxygen only for an SpO₂ under 90 %; opioids only for pain the nitrates do not relieve; no NSAIDs.',
    'The P2Y12 inhibitor is decided with cardiology. Ticagrelor or prasugrel is preferred for PCI, but with angiography planned within 24 hours, loading before the anatomy is known brings no clear benefit (2025 ACC/AHA ACS guideline: upstream clopidogrel or ticagrelor may be considered when angiography is more than 24 hours away, with no support for routine loading when it is sooner; prasugrel only once the anatomy is known). A diabetic with ST elevation in aVR may need bypass surgery, which a loaded P2Y12 inhibitor delays.',
    'Invasive timing for NSTE-ACS (2025 ACC/AHA ACS guideline): immediate (within 2 hours) for refractory angina, hemodynamic or electrical instability (class 1); within 24 hours is reasonable for high risk — a GRACE score over 140, dynamic ST changes, a rising troponin (2a); before discharge for the rest at intermediate risk. Risk scores (GRACE, TIMI, HEART) put a number on what the story, the 12-lead and the troponin already say.',
    'Women and people with diabetes are more likely to come with pressure plus nausea, sweating, jaw or back pain, or tiredness, to wait longer before coming in, and to be under-treated: her two hours of pressure that came and went, at rest, pain-free at the door, is the classic way an NSTE-ACS is missed.',
    'The ER nurse triages, records the 12-lead and takes it to the physician, gives aspirin and nitroglycerin on the chest pain standing order, gives heparin on the physician\'s order, records a new 12-lead with any new pain and reports it, and draws the serial troponin on time. The diagnosis, the drugs beyond the standing order, the consult and where she goes are the physician\'s.',
  ],
};
