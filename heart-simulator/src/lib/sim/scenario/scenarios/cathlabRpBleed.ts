import type { Effect, Line, PendingRead, Scenario, ScenarioEvent, SimState, Speaker } from '../types';
import { atRate, bpAfter, count, firstDone, has, line } from '../kit';
import { INTERVENTION_BY_ID } from '../interventions';
import { MD, RN, TECH, askCritical, askEvents, askHarm, cine, type LabAsk } from '../labKit';

/**
 * A retroperitoneal bleed after femoral access. Three hours after a PCI from the right groin, a small 76-year-old woman
 * becomes hypotensive and tachycardic, with low back and right flank pain and a falling hemoglobin; the groin looks fine.
 * The puncture was high, above the inguinal ligament, in the external iliac artery: it bleeds up behind the abdomen, out
 * of sight and out of reach of any hand pressing on the groin.
 *
 * The learner has to name it (not a vasovagal reaction: her heart is fast), resuscitate her (a second large-bore line,
 * saline, then blood early), give no more anticoagulant and reverse the heparin still on board (ACT, then protamine),
 * rule out the heart (12-lead, echo), and stop the bleeding from the inside while she is unstable: back to the lab, in from
 * the other groin, a balloon over the hole, then a covered stent — with vascular surgery called as the backup. She is a
 * transient responder: fluid and blood lift her pressure for a few minutes and the bleeding pulls it down again, so the
 * scanner is the wrong place for her until the hole is sealed.
 *
 * Who does what: the tech runs the ACT, pages vascular surgery, readies the room (transducer, pads, both groins), calls out
 * the changes and hands the covered stent; the recovery nurse finds her, calls the cardiologist, opens the fluids, draws the
 * labs, places the second line and gives the blood and the protamine on the cardiologist's order; the cardiologist makes
 * every call and does the procedure.
 *
 * Sources: Trimarchi et al., JACC Cardiovasc Interv 2010 (BMC2 registry, 112,340 PCIs: 0.4 %, 92 % managed medically,
 * in-hospital mortality 6.6 %; predictors female sex, BSA under 1.8 m², emergency PCI, cardiogenic shock, heparin or a GP
 * IIb/IIIa inhibitor started before the procedure, sheaths of 8 Fr or more, closure devices); Eisen et al., Cardiology 2013
 * (79 % conservative; bleeding later with a closure device, median 12 vs 5 h); protamine label (1–1.5 mg per 100 units within
 * 30 minutes of the heparin, 0.25–0.375 mg after 2 hours, at most 50 mg in 10 minutes); 2025 ACC/AHA/ACEP/NAEMSP/SCAI ACS
 * guideline (radial access first, COR 1; a hemoglobin of 10 g/dL or more may be reasonable in ACS with anemia and no active
 * bleeding, 2b, MINT).
 */

/**
 * The real image: a digital subtraction angiogram of contrast leaking from the external iliac artery after a femoral
 * puncture above the femoral head, after a PCI. It comes from another patient's article; what it shows is what this
 * patient's run shows.
 */
const IMAGES: Partial<Record<string, string>> = { iliac: 'high-puncture-iliac-extravasation' };

const pictureRead: Omit<PendingRead, 'minute'> = {
  kind: 'clinical', answer: 'clin-rp-bleed', partial: ['clin-hematoma'], prompt: 'What is happening?',
  explain: 'A retroperitoneal bleed. Three hours after a femoral PCI she has a falling pressure, a racing heart, pain low in the back and the right flank, numbness over the front of the thigh and a falling hemoglobin — with a groin that looks fine. A puncture above the inguinal ligament bleeds up behind the abdomen, where nothing shows and nothing can be pressed. An access-site hematoma is the same bleeding showing as a swelling at the groin; a vasovagal reaction slows the heart, and hers is fast. Resuscitate (a second large-bore line, saline, then blood), give no more anticoagulant and reverse what is left, and stop the bleeding.',
};

const runRead: Omit<PendingRead, 'minute'> = {
  kind: 'angio', answer: 'angio-perforation', prompt: 'What does the run of the right iliac and femoral arteries show?',
  explain: 'Contrast streaming out of the right external iliac artery at the old puncture, above the femoral head and the inguinal ligament — too high for any hand on the groin to press against: the source of the bleed. A balloon over the hole stops it at once; a covered stent seals it for good.',
};

const ILIAC_VIEW = 'The right iliac and femoral arteries, through the crossover sheath';
const LEAK_WORDS = 'Run of the right iliac: a jet of contrast leaves the back wall of the external iliac artery just above the femoral head and pools behind it.';
const ACCESS_LINE = 'Left common femoral artery over the femoral head, ultrasound-guided: 6 Fr sheath in. A wire and a curved catheter over the aortic bifurcation, then a 7 Fr crossover sheath up into the right external iliac.';
const FINAL_LINE = 'Final run in two views: no contrast outside the vessel; the covered stent is open, and the common femoral, the profunda and the internal iliac all fill normally.';
const CT_BEFORE = 'Radiology: a large right retroperitoneal hematoma along the psoas, from the groin up to the kidney, with contrast pooling beside the right external iliac artery — it is still bleeding.';
const CT_AFTER = 'Radiology: a large right retroperitoneal hematoma along the psoas, from the groin up to the kidney; no contrast outside the vessels now. No free fluid in the abdomen.';

/** The learner has named what is happening (the first read): until then nobody in the room says it */
const named = (s: SimState) => s.reads.some((r) => r.answer === 'clin-rp-bleed');

/** The hole is closed from the inside: a balloon up over it, or the covered stent across it */
const controlled = (s: SimState) => has(s, 'balloon-up') || has(s, 'sealed');

/** Who describes a step of the procedure: the learner as the cardiologist, otherwise the operator */
const runner = (s: SimState): Speaker => (s.role === 5 ? 'you' : 'operator');

/** Only a patient awake enough to talk says how she feels */
const awake = (s: SimState, text: string): Line[] => (s.pulse && s.vitals.gcs >= 13 ? [['patient', `"${text}"`]] : []);

/** Her answer when she is told she is going back to the lab: yes if she is awake enough, otherwise emergency (implied) consent */
const consentLines = (s: SimState): Line[] => {
  const yes = awake(s, '…Yes. Do whatever you need to.');
  return yes.length ? yes : [['team', 'She is too drowsy to understand or answer: the procedure goes ahead on emergency (implied) consent, and the reason is documented.']];
};

/** While she is still bleeding, volume lifts the pressure only so far: it runs out of the hole as fast as it goes in */
const ceiling = (s: SimState) => (controlled(s) ? { sbp: 126, dbp: 76 } : { sbp: 108, dbp: 66 });

/** A unit of blood or a bolus brings the rate down a little — not below 100 while the hole is open */
const slower = (s: SimState) => atRate(s, Math.max(controlled(s) ? 90 : 100, s.rhythm.hr - 4));

const vitalsText = (bp: { sbp: number; dbp: number }, hr: number) => `BP ${bp.sbp}/${bp.dbp}. Heart rate ${hr}.`;

/** Compressions have been given in this arrest */
const cprSinceArrest = (s: SimState) => s.timers.arrestAt !== undefined && s.performed.some((p) => p.id === 'cpr' && p.minute >= s.timers.arrestAt);

/**
 * An antithrombotic drug given now, on top of what she had for the stent: each keeps the hole bleeding faster. Protamine
 * undoes only heparin; bivalirudin has no antidote, and the GP IIb/IIIa inhibitor, cangrelor and a fibrinolytic are not
 * reversed by it either (the simulator cannot stop an infusion, so these last until the hole is closed)
 */
const EXTRA_ANTITHROMBOTIC = ['extra-heparin', 'extra-bivalirudin', 'extra-gp2b3a', 'extra-cangrelor', 'extra-lytic'];
const thinned = (s: SimState) => EXTRA_ANTITHROMBOTIC.some((f) => has(s, f));

/** A teammate beside the learner speaks up: the tech when the learner is the nurse, otherwise the nurse */
const teammate = (s: SimState, text: string, tone?: Line[2]): Line => line('team', `${s.role === 4 ? 'Tech' : 'Nurse'}: "${text}"`, tone);

/**
 * Her brain follows her pressure: foggy under 75 and drowsy under 65 (bleedingDrop), and awake again once volume brings it
 * back. Not after an arrest: that waits for the bleeding to be stopped
 */
const gcsAt = (s: SimState, sbp: number) => (has(s, 'arrest') ? s.vitals.gcs : sbp >= 85 ? 15 : sbp >= 75 ? Math.max(s.vitals.gcs, 14) : s.vitals.gcs);

// ─── What each step does ───────────────────────────────────────────────────

/**
 * Volume during the arrest: in a bleeding heart that has stopped for want of blood, volume pushed in while the compressions
 * go on is what brings the pulse back (the hole still bleeds, so the pressure keeps falling until it is closed)
 */
function volumeInArrest(s: SimState, who: Line[0], what: string, takes: number): Effect {
  if (!cprSinceArrest(s)) return { say: [[who, `${what} — with no circulation it goes nowhere until compressions move it.`, 'warn']] };
  // the pulse comes back when the volume is in (`takes`: the minutes the learner's action lasts), and the next fall 5 minutes after
  return {
    say: [[who, `${what} while the compressions go on.`], ['monitor', 'A pulse is back: BP 72/40. Heart rate 134.', 'good']],
    rhythm: { profile: 'sinus-tachycardia', hr: 134 }, pulse: true, vitals: { sbp: 72, dbp: 40, gcs: 8 }, timers: { nextDrop: s.minute + takes + 5 },
  };
}

/** A saline bolus: the first two lift the pressure; after that each does less and only thins the blood */
function fluid(s: SimState): Effect {
  if (!s.pulse) return { ...volumeInArrest(s, 'you', 'Saline squeezed in', INTERVENTION_BY_ID.fluid.minutes), flags: ['fluid'] };
  const first = count(s, 'fluid') < 2;
  const bp = bpAfter(s, first ? 8 : 4, first ? 5 : 2, ceiling(s));
  const rhythm = slower(s);
  return {
    say: [['you', first ? '500 mL of saline in, wide open.' : 'Another 500 mL of saline in — it does less each time.'], ['monitor', vitalsText(bp, rhythm.hr)]],
    vitals: { ...bp, gcs: gcsAt(s, bp.sbp) }, rhythm, flags: ['fluid'],
  };
}

/** Units of blood given so far, by anyone (the learner, or the teammate who hangs one): one flag per unit */
const units = (s: SimState) => Object.keys(s.flags).filter((f) => f.startsWith('unit-')).length;

/** A unit of emergency-release packed red cells (by the learner, or the teammate who hangs it) */
function transfusion(s: SimState, who: Line[0] = 'you'): Effect {
  const unit = units(s) + 1;
  if (!s.pulse) return { ...volumeInArrest(s, who, 'Packed red cells squeezed in through both lines', who === 'you' ? INTERVENTION_BY_ID.transfuse.minutes : 0), flags: ['transfused', `unit-${unit}`] };
  const bp = bpAfter(s, 12, 8, ceiling(s));
  const rhythm = slower(s);
  const what = `Unit ${unit} of emergency-release packed red cells`;
  const said: Line = who === 'team'
    ? ['team', `Nurse: "${what} running through the warmer."`]
    : [who, who === 'you' ? `${what}, checked at the bedside, running through the warmer.` : `${what} running through the warmer.`];
  return {
    say: [
      said,
      ['monitor', vitalsText(bp, rhythm.hr)],
      // three units within the hour is the usual trigger for the massive transfusion protocol (the blood bank does not start it alone)
      ...(unit === 3 ? [line('hospital', 'Blood bank: a third unit within the hour, so the massive transfusion protocol is activated — plasma comes up with the next red cells, one to one.')] : []),
    ],
    vitals: { ...bp, gcs: gcsAt(s, bp.sbp) }, rhythm, flags: ['transfused', `unit-${unit}`],
  };
}

/**
 * The ACT: 164 s with the heparin still on board (118 before the case), back to baseline once protamine has reversed it.
 * A fresh heparin bolus sends it up until protamine; bivalirudin sends it up and protamine does not bring it down
 */
function act(s: SimState, who: Speaker): Effect {
  const flags = ['act', 'act-known'];
  if (has(s, 'extra-bivalirudin')) return { say: [[who, 'ACT 338 s.']], flags };
  if (has(s, 'extra-heparin')) return { say: [[who, 'ACT 296 s.']], flags };
  if (has(s, 'reversed')) return { say: [[who, 'ACT 124 s — back to her baseline (118 before the case).']], flags };
  return { say: [[who, 'ACT 164 s — it was 118 before the case: some heparin is still on board.']], flags };
}

/**
 * Protamine for the heparin left from the case: 5,800 units more than 3 hours ago, so 0.25–0.375 mg per 100 units (the
 * label's dose after 2 hours). A heparin bolus just given needs about 1 mg per 100 units, which here runs into the 50 mg
 * that is the most for one dose. It reverses heparin only: bivalirudin has no antidote
 */
function protamine(s: SimState, who: Line[0]): Effect {
  const said: Line[] = [
    has(s, 'extra-heparin')
      ? [who, 'Protamine 50 mg IV, slowly over 10 minutes — the most for one dose: the bolus just given needs about 1 mg per 100 units, on top of what was left from the case. The ACT is rechecked after it.']
      : [who, 'Protamine 20 mg IV, slowly over 10 minutes: about 0.35 mg per 100 units of the 5,800 she had, since most of it has worn off.'],
    ['monitor', 'No flushing; the pressure holds.'],
  ];
  if (has(s, 'extra-bivalirudin')) said.push(teammate(s, 'The bivalirudin is still running — protamine does not reverse it.', 'warn'));
  return { say: said, flags: ['protamine', 'reversed'], clear: ['extra-heparin'] };
}

/** Across from the left groin, and the run of the right iliac and femoral arteries (a real image to read) */
function crossover(s: SimState): Effect {
  const who = runner(s);
  const run = cine('iliac', ILIAC_VIEW, IMAGES.iliac, [[who, LEAK_WORDS]], runRead);
  return { ...run, say: [[who, ACCESS_LINE], ...(run.say ?? [])], flags: ['access', 'femoral', 'contralateral', 'leak-seen', 'cine'] };
}

/** A peripheral balloon up over the hole: the bleeding stops while it is up */
const balloonUp = (s: SimState): Effect => ({
  say: [[runner(s), 'A 7 × 40 mm peripheral balloon up over the hole at low pressure: on the next puff of contrast nothing leaks.']],
  flags: ['balloon-up', 'balloon-tamponade', 'bleeding-stopped'],
});

/** The covered stent across the hole: sealed for good */
const coveredStent = (s: SimState): Effect => ({
  say: [[runner(s), 'Covered stent, 8 × 50 mm, across the hole in the right external iliac — above the femoral head, clear of the common femoral and its branches — deployed and molded with the balloon.']],
  flags: ['covered-stent', 'sealed', 'bleeding-stopped'],
});

/** The pressure falls as the blood leaves the circulation: faster with more anticoagulant on board, slower once the heparin is reversed */
function bleedingDrop(s: SimState): Effect {
  const [dS, dD] = thinned(s) ? [16, 10] : has(s, 'reversed') ? [8, 5] : [10, 6];
  const sbp = Math.max(50, s.vitals.sbp - dS);
  const dbp = Math.max(25, Math.min(s.vitals.dbp - dD, sbp - 10));
  const rhythm = atRate(s, Math.min(146, s.rhythm.hr + 6));
  const gcs = sbp < 65 ? Math.min(s.vitals.gcs, 12) : sbp < 75 ? Math.min(s.vitals.gcs, 14) : s.vitals.gcs;
  return {
    say: [
      ['monitor', vitalsText({ sbp, dbp }, rhythm.hr), 'bad'],
      ...awake(s, sbp < 75 ? 'I feel faint… everything\'s going gray.' : 'My back… it\'s getting worse.'),
      ...(s.role === 5 && sbp < 85 ? [line('team', `Nurse: "Doctor — ${sbp} systolic!"`, 'warn')] : []),
    ],
    vitals: { sbp, dbp, gcs, pain: Math.min(10, s.vitals.pain + 1) }, rhythm, timers: { nextDrop: s.minute + 5 },
  };
}

/** The pressure falls far enough that the heart has nothing left to pump: organized complexes, no pulse */
const arrest = (): Effect => ({
  say: [['monitor', 'Complexes at 132 on the monitor — but no pulse with them and no pressure.', 'bad'], ['team', 'She is unresponsive!', 'bad']],
  rhythm: { profile: 'pea', hr: 132 }, pulse: false,
});

// ─── The team: the operator's requests ─────────────────────────────────────

const TECH_ASKS: LabAsk[] = [
  {
    id: 'act', when: (s) => has(s, 'md-here'), early: true,
    ask: 'Run an ACT for me, please — I need to know how much heparin is still on board.',
    accept: ['act'],
    thanks: 'Thanks.', fallback: 'I\'ll run the ACT myself.', gives: 'act-done',
    fallbackEffect: (s) => act(s, 'operator'),
    label: 'Run the ACT when asked',
    why: 'The ACT tells the team whether heparin from the case is still working — and so whether protamine has anything to reverse.',
  },
  {
    id: 'vascular', when: (s) => has(s, 'md-here') && named(s), early: true,
    ask: 'Page vascular surgery and IR now: a bleed from a high right femoral stick, and we are going back into the lab.',
    accept: ['call-vascular'],
    thanks: 'Thanks.', fallback: 'Has anyone paged vascular? I\'ll call them myself.', gives: 'vascular-asked',
    fallbackEffect: () => ({ say: [['hospital', 'Vascular surgery and interventional radiology paged.']], flags: ['vascular-called'] }),
    label: 'Page vascular surgery and IR at once',
    why: 'If the hole cannot be sealed from the inside, she needs an open repair: the surgeons need to know now, not after the balloon has failed.',
  },
  {
    id: 'covered', when: (s) => has(s, 'leak-persists'), early: true,
    ask: 'Still leaking. A covered stent, please — 8 by 50, a peripheral one for the iliac.',
    accept: ['stent-covered'], wrong: ['stent-des', 'balloon-nc', 'balloon-predil'],
    wrongSay: 'Not that — a coronary device neither fits the iliac nor seals a hole. A covered stent, 8 by 50.',
    thanks: '8 by 50 covered — confirmed.', fallback: 'I\'ll open the covered stent myself.', gives: 'covered-in-hand',
    label: 'Covered stent to seal the hole',
    why: 'A covered (stent-graft) stent across the hole in the external iliac seals it for good. Read the size back and check it on the box before you open it.',
  },
];

/** The cardiologist's protamine order to the nurse (the dose is in the words of each order) */
const PROTAMINE_ORDER = {
  role: 4, accept: ['protamine'], wrong: ['heparin', 'bivalirudin'],
  wrongSay: 'No — that is more anticoagulant! Protamine, to reverse the heparin.',
  thanks: 'Thanks.', fallback: 'I\'ll give the protamine myself.', gives: 'protamine-given',
  fallbackEffect: (s: SimState) => protamine(s, 'operator'),
  label: 'Protamine, slowly, as ordered', points: 10,
  why: 'Protamine binds the heparin that is left. Given fast it drops the pressure (and can cause a reaction): slowly, no more than 5 mg a minute and 50 mg in 10 minutes.',
} satisfies Partial<LabAsk>;

const RN_ASKS: LabAsk[] = [
  {
    id: 'rn-blood', role: 4, when: (s) => has(s, 'md-here') && named(s), early: true, within: 3,
    ask: 'She is bleeding. Get emergency-release blood up here and start the first unit as soon as it comes — through the warmer.',
    accept: ['transfuse'],
    thanks: 'Thanks — keep it going.', fallback: 'Where is the blood? I\'ll hang it myself.', gives: 'blood-going',
    fallbackEffect: (s) => transfusion(s, 'operator'),
    label: 'Blood started at once', points: 10,
    why: 'She is losing blood: saline only buys minutes and thins what is left. Emergency-release (uncrossmatched) red cells come within minutes; crossmatched units follow the sample you sent.',
  },
  {
    id: 'rn-act', role: 4, when: (s) => has(s, 'blood-going'), early: true,
    ask: 'Now an ACT, please.',
    accept: ['act'],
    thanks: 'Thanks.', fallback: 'I\'ll run the ACT myself.', gives: 'act-done',
    fallbackEffect: (s) => act(s, 'operator'),
    label: 'Run the ACT when asked',
    why: 'The ACT tells the team whether heparin from the case is still working — and so whether protamine has anything to reverse.',
  },
  // the order waits for the cardiologist at the bedside (an ACT the nurse ran before the call is still read then). More
  // heparin has its own penalty ('more-antithrombotic'): the operator's word only, no second one for the same choice
  {
    ...PROTAMINE_ORDER, id: 'rn-protamine',
    when: (s) => has(s, 'md-here') && has(s, 'act-known') && !has(s, 'reversed') && !has(s, 'extra-heparin'),
    ask: 'One sixty-four: there is still heparin on board. Protamine, 20 milligrams, slowly over 10 minutes.',
  },
  {
    // the ACT after a fresh heparin bolus (the nurse gave one): the dose for it, and the ACT again
    ...PROTAMINE_ORDER, id: 'rn-protamine-high',
    when: (s) => has(s, 'md-here') && has(s, 'act-known') && !has(s, 'reversed') && has(s, 'extra-heparin') && !has(s, 'asked-rn-protamine'),
    ask: 'Two ninety-six — that heparin bolus is working now. Protamine, 50 milligrams, slowly over 10 minutes, then the ACT again.',
  },
  {
    // a second unit on the table, unless one is already in (then there is nothing to ask for)
    id: 'rn-blood2', role: 4, when: (s) => has(s, 'on-table') && s.minute >= s.flags['on-table'] + 1 && !has(s, 'unit-2'),
    ask: 'Second unit, please — and tell the blood bank to keep it coming.',
    accept: ['transfuse'],
    thanks: 'Thanks.', fallback: 'I\'ll hang the second unit myself.', gives: 'blood2-going',
    fallbackEffect: (s) => transfusion(s, 'operator'),
    label: 'Second unit of blood on the table',
    why: 'Until the hole is closed she keeps bleeding: keep the blood going, and the blood bank ahead of you.',
  },
];

/** The pressure falls every 5 minutes while the hole is open (one step at a time, never several at once) */
const DROPS = 10;
const dropEvents: ScenarioEvent[] = Array.from({ length: DROPS }, (_, i) => ({
  id: `drop-${i + 1}`,
  when: (s: SimState) => s.pulse && !controlled(s) && (i === 0 || s.fired.includes(`drop-${i}`)) && s.minute >= (s.timers.nextDrop ?? 4),
  effect: bleedingDrop,
}));

export const cathlabRpBleed: Scenario = {
  id: 'retroperitoneal-bleed-cathlab',
  title: 'After a femoral PCI: a falling pressure and back pain',
  summary: '76-year-old woman, three hours after a stent from the right groin. Her pressure is falling, her heart is racing and her back hurts — but the groin looks fine. Find the cause, resuscitate her and stop it.',
  setting: 'cathlab',
  roles: [3, 4, 5],
  difficulty: 'intermediate',
  conditionId: 'sinus-tachycardia',
  images: IMAGES,
  briefing: {
    default: [
      ['team', 'Cath lab recovery, bay 3. 76-year-old woman, 58 kg, with a non-ST-elevation MI yesterday. This morning: a drug-eluting stent in the circumflex from the right femoral artery (the right radial went into spasm). Heparin 5,800 units in the lab; aspirin and ticagrelor on board. A closure device sealed the groin at the end of the case.'],
      ['scene', 'Three hours after the case: BP 84/50, heart rate 118. She is pale and sweaty and shifting in the bed; her right groin dressing is dry.'],
    ],
    3: [
      ['team', 'Cath lab recovery, bay 3. 76-year-old woman, 58 kg, with a non-ST-elevation MI yesterday. This morning: a drug-eluting stent in the circumflex from the right femoral artery (the right radial went into spasm). Heparin 5,800 units in the lab; aspirin and ticagrelor on board. A closure device sealed the groin at the end of the case.'],
      ['scene', 'Three hours after the case: BP 84/50, heart rate 118. She is pale and sweaty and shifting in the bed; her right groin dressing is dry.'],
      ['team', 'You are the cath lab tech. The recovery nurse has called you and the cardiologist on call to the bedside; Lab 2 is free.'],
    ],
    4: [
      ['team', 'Cath lab recovery, bay 3. 76-year-old woman, 58 kg, with a non-ST-elevation MI yesterday. This morning: a drug-eluting stent in the circumflex from the right femoral artery (the right radial went into spasm). Heparin 5,800 units in the lab; aspirin and ticagrelor on board. A closure device sealed the groin at the end of the case.'],
      ['scene', 'Three hours after the case: BP 84/50, heart rate 118. She is pale and sweaty and shifting in the bed; her right groin dressing is dry.'],
      ['team', 'You are her recovery nurse, and you have just found her like this. One 20 G IV in her left hand. The cardiologist on call is finishing a case in Lab 1.'],
    ],
    5: [
      ['team', 'Cath lab recovery, bay 3. 76-year-old woman, 58 kg, with a non-ST-elevation MI yesterday. This morning: a drug-eluting stent in the circumflex from the right femoral artery (the right radial went into spasm). Heparin 5,800 units in the lab; aspirin and ticagrelor on board. A closure device sealed the groin at the end of the case.'],
      ['scene', 'Three hours after the case: BP 84/50, heart rate 118. She is pale and sweaty and shifting in the bed; her right groin dressing is dry.'],
      ['team', 'You are the interventional cardiologist on call: your colleague did her case and has gone home, and the recovery nurse has called you to the bedside. One 20 G IV in her left hand. The nurse and the tech are with you; Lab 2 is free.'],
    ],
  },
  initial: {
    rhythm: { profile: 'sinus-tachycardia', hr: 118 },
    vitals: { sbp: 84, dbp: 50, spo2: 96, rr: 22, etco2: 30, pain: 7, gcs: 15, glucose: 132, temp: 36.2 },
  },
  // she is bleeding: blood for her is no mistake (the built-in transfusion rule reads it)
  problems: ['bleeding', 'heparin-on-board'],
  facts: {
    allergies: 'No allergies. …Yes — if you have to go back in, do it.',
    sample: 'No allergies. Aspirin and ticagrelor since yesterday, atorvastatin, lisinopril. High blood pressure; the heart attack yesterday.',
    opqrst: 'It\'s my lower back — the right side, going round into my side and down toward my groin. It started about half an hour ago, a deep ache, and it keeps getting worse: 7 out of 10. No chest pain at all. And the front of my right thigh feels numb.',
    perfusion: (s) => (has(s, 'stable')
      ? 'Pinker and warmer; capillary refill 2 seconds; neck veins flat. Both groins dry and soft; pulses present in both feet.'
      : 'Pale, cool and clammy; capillary refill 4 seconds; neck veins flat. Right groin: the dressing dry, the site soft and flat — no swelling, no bruit. Right foot pulses present, a little weaker than the left; the lower abdomen tender on the right.'),
    lungs: 'Clear on both sides.',
    neuro: 'Numb over the front of the right thigh, and she lifts the right leg less well than the left (the femoral nerve); otherwise no focal deficit.',
    ecg12: (s) => (s.rhythm.profile === 'sinus-tachycardia'
      ? `Sinus tachycardia at ${s.rhythm.hr}: no new ST elevation or depression compared with this morning — nothing points to the stent.`
      : `Sinus rhythm at ${s.rhythm.hr}: no new ST elevation or depression compared with this morning.`),
    echo: 'Bedside echo: no pericardial effusion. A small, vigorous left ventricle whose walls almost meet at the end of each beat; no new wall-motion problem; a small IVC that collapses with every breath — an empty heart, not a failing one.',
    ct: (s) => (has(s, 'sealed') ? CT_AFTER : CT_BEFORE),
    final: FINAL_LINE,
  },
  status: (s) => {
    if (!s.pulse) return 'Unresponsive.';
    if (has(s, 'stable')) return '"That\'s easier… my back still aches."';
    if (s.vitals.gcs < 13) return 'Drowsy; she mumbles when you call her name.';
    if (s.vitals.sbp < 75) return '"I feel faint… I\'m so thirsty."';
    return '"My back… it hurts so much."';
  },
  respond: {
    fluid,
    transfuse: (s) => transfusion(s),
    iv: () => ({ say: [['you', 'A second large-bore line: 16 G in the right antecubital fossa.']], flags: ['iv', 'large-bore'] }),
    labs: () => ({
      say: [['team', 'Sent: CBC, coagulation and fibrinogen, and a type and crossmatch for 4 units. The point-of-care hemoglobin reads 8.1 g/dL — it was 12.6 this morning.']],
      flags: ['labs'],
    }),
    act: (s) => act(s, s.role === 5 ? 'team' : 'you'),
    // once the heparin is reversed there is nothing left for it to bind, and protamine in excess is an anticoagulant itself
    protamine: (s) => (has(s, 'reversed') && !has(s, 'extra-heparin')
      ? { blocked: true, say: [['system', 'The protamine is already in and the heparin reversed: more would only add an anticoagulant effect of its own. The ACT tells you whether any heparin is left.']] }
      : protamine(s, 'you')),
    // more anticoagulant, another antiplatelet drug or a fibrinolytic: the bleeding speeds up (the penalties are the case's
    // 'more-antithrombotic' and 'lytic-in-bleeding'). Protamine undoes only the heparin (see thinned)
    heparin: () => ({ say: [['you', 'Heparin bolus given.']], flags: ['heparin', 'extra-heparin'], clear: ['reversed'] }),
    bivalirudin: () => ({ say: [['you', 'Bivalirudin 0.75 mg/kg bolus, 1.75 mg/kg/h running.']], flags: ['bivalirudin', 'anticoagulated', 'extra-bivalirudin'] }),
    gp2b3a: () => ({ say: [['you', 'Eptifibatide 180 mcg/kg bolus, infusion running.']], flags: ['gp2b3a', 'extra-gp2b3a'] }),
    cangrelor: () => ({ say: [['you', 'Cangrelor 30 mcg/kg bolus, 4 mcg/kg/min running.']], flags: ['p2y12', 'cangrelor', 'extra-cangrelor'] }),
    tnk: () => ({ say: [['you', 'Tenecteplase given.']], flags: ['lytic', 'extra-lytic'] }),
    // atropine speeds a heart that is already racing to keep up with the blood loss: nothing else changes
    atropine: (s) => {
      if (!s.pulse) return null;
      const hr = Math.min(150, s.rhythm.hr + 10);
      return { say: [['monitor', `Heart rate ${hr}. BP ${s.vitals.sbp}/${s.vitals.dbp}.`], ...awake(s, 'My heart\'s pounding…')], rhythm: atRate(s, hr), flags: ['atropine'] };
    },
    // a vasopressor holds the pressure for a few minutes; it puts no blood back in the vessels
    pressor: (s) => {
      if (!s.pulse) return null;
      const bp = bpAfter(s, 10, 6, ceiling(s));
      return { say: [['you', 'Norepinephrine running.'], ['monitor', vitalsText(bp, s.rhythm.hr)], teammate(s, 'It\'s holding her pressure for now — but she still needs volume, and the hole closed.')], vitals: { ...bp, gcs: gcsAt(s, bp.sbp) }, flags: ['pressor'] };
    },
    'push-epi': (s) => {
      if (!s.pulse) return null;
      const bp = bpAfter(s, 10, 6, ceiling(s));
      return { say: [['you', 'Push-dose epinephrine 20 mcg IV.'], ['monitor', `${vitalsText(bp, s.rhythm.hr)} For a few minutes.`]], vitals: { ...bp, gcs: gcsAt(s, bp.sbp) }, flags: ['push-epi'] };
    },
    phenylephrine: (s) => {
      if (!s.pulse) return null;
      const bp = bpAfter(s, 10, 6, ceiling(s));
      return { say: [['you', 'Phenylephrine 100 mcg IV, flushed.'], ['monitor', `${vitalsText(bp, s.rhythm.hr)} For a few minutes.`]], vitals: { ...bp, gcs: gcsAt(s, bp.sbp) }, flags: ['phenylephrine'] };
    },
    // the cardiologist's consent takes her back to the lab. Not in the middle of an arrest (the arrest is run where she is),
    // and a patient too drowsy to answer goes on emergency (implied) consent
    consent: (s) => {
      if (!s.pulse) return { blocked: true, say: [['system', 'Not in the middle of a cardiac arrest: run the arrest here, and take her back to the lab once there is a pulse.']] };
      if (s.role !== 5) return s.vitals.gcs >= 13 ? null : { say: [teammate(s, 'She is too drowsy to answer — the cardiologist will have to decide.', 'warn')], flags: ['consent'] };
      return {
        say: [...consentLines(s), ['team', 'The nurse and the tech unhook the recovery monitor and wheel her to Lab 2.']],
        flags: ['consent', 'to-lab'],
      };
    },
    // the team does the time-out and the prep with her on the table, before the new access
    timeout: (s) => (has(s, 'on-table') ? null : { blocked: true, say: [['system', 'The time-out is done in the lab, on the table, before the new access: she is not there yet.']] }),
    prep: (s) => (has(s, 'on-table')
      ? { say: [['you', 'Both groins prepped and draped: the left for the new access, the right to reach the old puncture.']], flags: ['prep'] }
      : { blocked: true, say: [['system', 'She is not on the table yet.']] }),
    // the radial route cannot carry a crossover sheath and a peripheral stent down to the right iliac
    access: (s) => (s.role === 5 ? { blocked: true, say: [['system', 'Not from the wrist: the hole is in the right external iliac. Go in from the other (left) groin and over the aortic bifurcation (Femoral arterial access).']] } : null),
    'access-femoral': (s) => {
      if (!has(s, 'on-table')) return { blocked: true, say: [['system', 'She is still in the recovery bay. Tell her what you need to do and confirm her consent: the team then takes her back to the lab.']] };
      return crossover(s);
    },
    'balloon-tamponade': (s) => (has(s, 'contralateral') ? balloonUp(s) : { blocked: true, say: [['system', 'Get across from the left groin first: a crossover sheath into the right iliac (Femoral arterial access).']] }),
    'stent-covered': (s) => {
      // a covered stent is opened for a hole the run has shown, at the size the operator picks from it — not before
      if (s.role === 3 && !has(s, 'leak-seen')) return { blocked: true, say: [['system', 'Nothing to size it to yet: the run comes first. The peripheral covered stents are in the room, still in their boxes.']] };
      if (s.role === 3) return { say: [['you', 'Peripheral covered stent, 8 × 50 mm: size read back and checked on the box, opened, prepped and handed up.']], flags: ['stent-covered-ready'] };
      if (s.role !== 5) return null;
      return has(s, 'contralateral') ? coveredStent(s) : { blocked: true, say: [['system', 'Get across from the left groin first: a crossover sheath into the right iliac (Femoral arterial access).']] };
    },
    // the coronary devices are far too small for a 7 mm iliac artery (the tech's choice is judged by the request)
    'stent-des': (s) => (s.role === 5 ? { blocked: true, say: [['system', 'A drug-eluting coronary stent is far too small for a 7 mm iliac artery, and it would not seal a hole: a covered stent does.']] } : null),
    'balloon-predil': (s) => (s.role === 5 ? { blocked: true, say: [['system', 'A 2.5 mm coronary balloon cannot fill a 7 mm iliac artery: the balloon over the hole is a peripheral one (Inflate a balloon over the perforation).']] } : null),
    'balloon-nc': (s) => (s.role === 5 ? { blocked: true, say: [['system', 'A coronary balloon cannot fill a 7 mm iliac artery: the balloon over the hole is a peripheral one (Inflate a balloon over the perforation).']] } : null),
    'final-angio': (s) => {
      if (!has(s, 'sealed')) return { blocked: true, say: [['system', s.role === 5 ? 'Not the final pictures yet: the hole is not sealed.' : 'The operator is not ready for the final pictures yet.']] };
      return s.role === 5 ? { say: [['you', FINAL_LINE, 'good']], image: { id: 'final-angio', view: 'Final run: the right iliac and femoral arteries' }, flags: ['final-angio'] } : null;
    },
    'closure-device': (s) => {
      if (!has(s, 'sealed')) return { blocked: true, say: [['system', s.role === 5 ? 'There is nothing to close yet: the old right sheath came out hours ago, and the new left one is still needed.' : 'The operator is not ready to close yet.']] };
      return { say: [['you', `Left femoral sheath out and the artery closed with a closure device${has(s, 'reversed') ? ' (the heparin reversed)' : ''}; pulses present in both feet by Doppler.`]], flags: ['closure', 'hemostasis'] };
    },
    hemostasis: (s) => {
      if (!has(s, 'sealed')) {
        return { say: [['you', 'Firm pressure over the right groin and just above it — but the groin was never the problem: the hole is above the ligament, where there is no bone to press against. Nothing changes.', 'warn']] };
      }
      // a 7 Fr sheath: about 20 minutes of pressure (3–4 minutes per French size)
      return { say: [['you', `Left groin: the 7 Fr crossover sheath out${has(s, 'reversed') ? ' (the heparin reversed)' : ''}, firm pressure for 20 minutes, then a dressing — no swelling. Both feet: pulses present by Doppler.`]], flags: ['hemostasis'] };
    },
    echo: (s) => ({ say: [['you', has(s, 'stable') ? 'Bedside echo: no pericardial effusion; the left ventricle fills and squeezes normally now; the IVC is fuller.' : 'Bedside echo: no pericardial effusion. A small, vigorous left ventricle whose walls almost meet at the end of each beat; no new wall-motion problem; a small IVC that collapses with every breath — an empty heart, not a failing one.']], flags: ['echo'] }),
    // a pump moves blood the ventricle has; hers is empty, so it adds nothing (the cardiologist's penalty is 'pump-in-bleeding')
    impella: (s) => (s.role === 5 && s.pulse
      ? { say: [['you', 'Impella CP across the aortic valve from a second, large-bore femoral sheath: suction alarms at once — flow 1.1 L/min; the ventricle is empty. The pressure does not move.', 'bad']], flags: ['impella', 'mcs'] }
      : null),
    iabp: (s) => (s.role === 5 && s.pulse
      ? { say: [['you', 'IABP in from the femoral artery, 1:1: there is little volume to augment — the pressure barely moves.', 'bad']], flags: ['iabp', 'mcs'] }
      : null),
    // she is bleeding: a needle in the pericardium finds nothing and risks the heart
    pericardiocentesis: (s) => (s.role === 5 ? { say: [['you', 'Echo-guided needle below the xiphoid: a dry tap — there is no fluid around the heart.', 'bad']], flags: ['pericardiocentesis'] } : null),
    'ct-urgent': (s) => {
      if (!s.pulse) return null;
      if (has(s, 'balloon-up') && !has(s, 'sealed')) return { blocked: true, say: [['system', 'Not with a balloon inflated in her iliac artery and a sheath across the aortic bifurcation: seal the hole first.']] };
      if (has(s, 'sealed')) return { say: [['team', 'Scanned and back: she went with a nurse and the monitor, the sheath secured.'], ['hospital', CT_AFTER]], flags: ['ct'] };
      // still bleeding: ten minutes away from the lab and its team, on a scanner table where nothing can be done for her
      const sbp = Math.max(50, s.vitals.sbp - 16);
      const dbp = Math.max(25, Math.min(s.vitals.dbp - 10, sbp - 10));
      return {
        say: [['team', `Scanned and back — her pressure fell to ${sbp}/${dbp} on the scanner table.`, 'warn'], ['hospital', CT_BEFORE]],
        vitals: { sbp, dbp, gcs: Math.min(s.vitals.gcs, 14) }, flags: ['ct'],
      };
    },
    'call-vascular': (s) => ({
      say: [['hospital', has(s, 'vascular-called')
        ? 'Vascular surgery: "Already on our way."'
        : 'Vascular surgery and interventional radiology paged: the vascular surgeon is on the way, to stand by in case it cannot be sealed from the inside.']],
      flags: ['vascular-called'],
    }),
    'call-surgery': () => ({ say: [['hospital', 'Cardiac surgery: "Nothing in the chest for us — for the iliac artery you want vascular surgery."']], flags: ['surgery-called'] }),
    callout: (s) => {
      if (s.role === 4 && !has(s, 'md-here') && !has(s, 'md-called')) {
        return { say: [['operator', 'On my way — two minutes. Open the fluids, a second large-bore line, labs with a type and crossmatch, and a 12-lead.']], flags: ['callout', 'md-called'] };
      }
      if (has(s, 'leak-seen') && !has(s, 'leak-called')) return { say: [['operator', 'I see it — getting the balloon.']], flags: ['callout', 'leak-called'] };
      if (has(s, 'transfer-drop') && !has(s, 'drop-called')) return { say: [['operator', 'Thanks — keep the blood going; I\'m going in from the left.']], flags: ['callout', 'drop-called'] };
      return null;
    },
  },
  events: [
    {
      // where the case stands: on the recovery monitor with one small IV; for the tech, the cardiologist is already at the bedside
      id: 'setup', when: () => true,
      effect: (s) => ({ flags: ['monitor', 'iv', ...(s.role === 3 ? ['md-here'] : [])] }),
    },
    {
      // what she looks like, put together: the learner names it before anyone in the room does
      id: 'picture', when: (s) => has(s, 'perfusion') || has(s, 'opqrst') || has(s, 'labs') || s.minute >= 2,
      effect: (s) => ({
        say: has(s, 'perfusion') || has(s, 'opqrst') ? [] : [
          ['patient', '"My back… low down on the right — it keeps getting worse."'],
          ...(s.role !== 4 ? [line('team', 'Nurse: "Her groin\'s dry and soft — no swelling at all."')] : []),
        ],
        flags: ['picture'], read: pictureRead,
      }),
    },
    // the recovery nurse's teammates when the learner is the tech: fluids, labs and the second line; then protamine and blood on order
    {
      id: 'rn-start-for-tech', when: (s) => s.role === 3 && s.minute >= 1,
      effect: (s) => {
        const bp = bpAfter(s, 8, 5, ceiling(s));
        return { say: [['team', 'Nurse: "Second large-bore line in, 500 of saline in wide open, labs and a type and crossmatch sent — her hemoglobin is 8.1, it was 12.6 this morning."'], ['monitor', vitalsText(bp, s.rhythm.hr)]], vitals: bp, flags: ['fluid', 'labs', 'large-bore'] };
      },
    },
    {
      id: 'rn-protamine-for-tech', when: (s) => s.role === 3 && named(s) && has(s, 'act-known') && !has(s, 'reversed'),
      effect: (s) => ({ ...protamine(s, 'team'), say: [['operator', 'Protamine, 20 milligrams, slowly.'], ['team', 'Nurse: "Protamine 20 mg going in over 10 minutes."']] }),
    },
    {
      id: 'rn-blood-for-tech', when: (s) => s.role === 3 && named(s) && s.minute >= 3 && s.pulse,
      effect: (s) => transfusion(s, 'team'),
    },
    {
      id: 'rn-blood2-for-tech', when: (s) => s.role === 3 && has(s, 'on-table') && s.minute >= s.flags['on-table'] + 1 && s.pulse,
      effect: (s) => transfusion(s, 'team'),
    },
    {
      // the nurse's call brings the cardiologist; without one she walks by and sees the monitor
      id: 'md-arrives', when: (s) => s.role === 4 && ((has(s, 'md-called') && s.minute >= s.flags['md-called'] + 1.5) || s.minute >= 4),
      effect: (s) => ({
        say: has(s, 'md-called')
          ? [['operator', 'Here. Show me.']]
          : [['team', 'The cardiologist comes out of Lab 1, sees the monitor and comes straight over.'], ['operator', 'Why didn\'t anyone call me?', 'warn']],
        flags: ['md-here'],
      }),
    },
    ...TECH_ASKS.flatMap(askEvents),
    ...RN_ASKS.flatMap(askEvents),
    {
      // the computer cardiologist decides: back to the lab, not to the scanner (once the learner has named it)
      id: 'md-decides', when: (s) => s.role !== 5 && has(s, 'md-here') && named(s) && s.minute >= s.flags['md-here'] + (s.role === 4 ? 2 : 1.5),
      effect: (s) => ({
        say: [
          ['operator', 'This is bleeding from the right femoral puncture, tracking up behind the abdomen — and she is not stable enough for the scanner. Back to Lab 2 now: I go in from the left groin, find the hole and close it from the inside.'],
          ...consentLines(s),
          ...(s.role === 3 ? [line('operator', 'Get the room ready: transducer, pads, both groins.')] : []),
          ...(s.role === 4 ? [line('operator', 'I\'ve paged vascular surgery myself.')] : []),
        ],
        flags: ['to-lab', 'consent', ...(s.role === 4 ? ['vascular-called'] : [])],
      }),
    },
    {
      // on the table: moving a patient this empty drops her pressure
      id: 'on-table', when: (s) => has(s, 'to-lab') && s.pulse && s.minute >= s.flags['to-lab'] + 3,
      effect: (s) => {
        const sbp = Math.max(50, s.vitals.sbp - 8);
        const dbp = Math.max(25, Math.min(s.vitals.dbp - 6, sbp - 10));
        return {
          say: [
            ['team', s.role === 3 ? 'On the table in Lab 2.' : 'On the table in Lab 2: the tech has both groins prepped and draped, the transducer zeroed and the pads on.'],
            ['monitor', vitalsText({ sbp, dbp }, s.rhythm.hr), 'bad'],
            ...(s.role === 5 ? [line('team', `Tech: "Doctor — she dropped to ${sbp} moving over!"`, 'warn')] : []),
          ],
          vitals: { sbp, dbp },
          flags: ['on-table', 'transfer-drop', ...(s.role !== 3 ? ['prep', 'transducer', 'pads'] : [])],
        };
      },
    },
    {
      // without the learner's time-out the team does it (the item is still missed): the procedure cannot wait
      id: 'team-timeout', when: (s) => s.role !== 5 && has(s, 'on-table') && !has(s, 'timeout') && s.minute >= s.flags['on-table'] + 4,
      effect: () => ({ say: [['team', 'Time-out, led by the operator: patient, procedure, the left groin, allergies, and the protamine.', 'warn']], flags: ['timeout'] }),
    },
    {
      // the new access and the crossover take the operator a couple of minutes
      id: 'md-access', when: (s) => s.role !== 5 && has(s, 'timeout') && !has(s, 'contralateral') && s.minute >= s.flags.timeout + 2,
      effect: crossover,
    },
    {
      id: 'md-balloon', when: (s) => s.role !== 5 && has(s, 'leak-seen') && !controlled(s) && s.minute >= s.flags['leak-seen'] + 0.5,
      effect: (s) => {
        const up = balloonUp(s);
        return { ...up, say: [...(s.role === 3 ? [line('operator', 'I\'ve got the balloon — 7 by 40.')] : []), ...(up.say ?? [])] };
      },
    },
    {
      // 5 minutes of balloon, then a look: a high hole with two antiplatelet drugs on board keeps leaking
      id: 'deflation-run', when: (s) => has(s, 'balloon-up') && !has(s, 'sealed') && s.minute >= s.flags['balloon-up'] + 5,
      effect: (s) => ({
        say: [[runner(s), 'Balloon down after 5 minutes: the next run still shows contrast leaking from the back wall of the external iliac — slower, but the hole has not sealed. Balloon back up.']],
        flags: ['leak-persists'],
      }),
    },
    {
      id: 'md-covered', when: (s) => s.role !== 5 && has(s, 'leak-persists') && !has(s, 'sealed') && (s.role === 3 ? has(s, 'covered-in-hand') : s.minute >= s.flags['leak-persists'] + 0.5),
      effect: coveredStent,
    },
    {
      id: 'md-final', when: (s) => s.role !== 5 && has(s, 'sealed') && !has(s, 'final-angio'),
      effect: () => ({ say: [['operator', FINAL_LINE, 'good']], image: { id: 'final-angio', view: 'Final run: the right iliac and femoral arteries' }, flags: ['final-angio'] }),
    },
    {
      // the hole closed: with blood given she comes back up; on saline alone she stays pale and soft
      id: 'stable', when: (s) => has(s, 'sealed') && s.pulse,
      effect: (s) => {
        const blood = has(s, 'transfused');
        const sbp = Math.max(s.vitals.sbp, blood ? 106 : 94);
        const dbp = Math.max(s.vitals.dbp, blood ? 64 : 56);
        const rhythm = atRate(s, blood ? 96 : 108);
        return {
          say: [['monitor', vitalsText({ sbp, dbp }, rhythm.hr), 'good'], ...awake(s, 'That\'s easier… my back still aches.')],
          vitals: { sbp, dbp, gcs: 15, pain: Math.min(s.vitals.pain, 4) }, rhythm, flags: ['stable'],
        };
      },
    },
    {
      id: 'vascular-arrives', when: (s) => has(s, 'vascular-called') && s.minute >= s.flags['vascular-called'] + 10,
      effect: (s) => ({
        say: [['hospital', has(s, 'final-angio')
          ? 'The vascular surgeon arrives, looks at the final run and agrees: sealed from the inside — no open repair. She will follow her in the ICU.'
          : has(s, 'sealed')
            ? 'The vascular surgeon arrives as the covered stent goes in: "Good. Show me the final run before you come out."'
            : 'The vascular surgeon arrives and scrubs in: "Keep going from the inside — the OR is ready if it will not seal."']],
      }),
    },
    {
      // the cardiologist who leaves the balloon up and never seals the hole: the leg below it has no blood (no score: a nudge)
      id: 'balloon-too-long', when: (s) => s.role === 5 && has(s, 'leak-persists') && !has(s, 'sealed') && s.minute >= s.flags['leak-persists'] + 6,
      effect: (s) => ({ say: [teammate(s, 'Doctor — her right foot is cold and white with the balloon up. How much longer can it stay? It still leaks when it comes down.', 'warn')] }),
    },
    // the arrest from blood loss, and the team's volume for it when the learner is the tech
    { id: 'arrest', when: (s) => s.pulse && !controlled(s) && s.vitals.sbp <= 60, effect: arrest },
    { id: 're-arrest', when: (s) => s.fired.includes('arrest') && has(s, 'rosc') && s.pulse && !controlled(s) && s.vitals.sbp <= 60, effect: arrest },
    // (the tech cannot give volume: the nurse does, once the compressions are going)
    ...['arrest', 're-arrest'].map((after): ScenarioEvent => ({
      id: `team-volume-${after}`, when: (s) => s.role === 3 && !s.pulse && s.fired.includes(after) && cprSinceArrest(s),
      effect: (s) => ({ ...volumeInArrest(s, 'team', 'Nurse: blood squeezed in through both lines', 0), flags: ['transfused', `unit-${units(s) + 1}`] }),
    })),
    // last: the bleeding itself (after the procedure events, so a balloon that went up in the same minute counts first)
    ...dropEvents,
  ],
  critical: [
    // every role
    {
      // a time-out after the needle is in is no time-out: it counts only before the cardiologist's own access
      id: 'timeout', label: 'Time-out on the table before the new access', why: 'Even in an emergency: patient, procedure, the side (the left groin), allergies and the anticoagulation.',
      done: (s) => {
        const hit = firstDone(s, ['timeout'], 'on-table');
        const access = firstDone(s, ['access-femoral']);
        return hit !== null && (access === null || access >= hit) ? hit : null;
      },
      uses: ['timeout'], roles: [3, 4, 5], points: 5, target: { within: { flag: 'on-table', minutes: 3 } }, applies: (s) => has(s, 'on-table'),
    },

    // the tech
    ...TECH_ASKS.map(askCritical),
    { id: 'tech-transducer', label: 'Zero and level the transducer for the new arterial line', why: 'Her pressure will be read beat by beat from the new sheath: zeroed and leveled before she arrives.', done: ['transducer'], roles: TECH, points: 5, target: { within: { flag: 'to-lab', minutes: 3 } }, applies: (s) => has(s, 'to-lab') },
    { id: 'tech-pads', label: 'Defibrillator pads on', why: 'A patient in shock going back on the table: the pads go on before anything else can go wrong.', done: ['pads'], roles: TECH, points: 5, target: { within: { flag: 'to-lab', minutes: 3 } }, applies: (s) => has(s, 'to-lab') },
    { id: 'tech-prep', label: 'Prep both groins', why: 'The left groin for the new access, and the right in case the old puncture has to be reached — from above or by the surgeon.', done: ['prep'], after: 'on-table', roles: TECH, points: 5, target: { within: { flag: 'on-table', minutes: 2 } }, applies: (s) => has(s, 'on-table') },
    { id: 'callout-leak', label: 'Call out the contrast leaving the vessel', why: 'Say it out loud as it appears on the run: the hole is found, and the team switches to closing it.', done: ['callout'], after: 'leak-seen', roles: TECH, points: 10, target: { within: { flag: 'leak-seen', minutes: 1 } }, applies: (s) => has(s, 'leak-seen') },

    // the nurse
    { id: 'rn-look', label: 'Look at the groin — and beyond it', why: 'Skin, capillary refill, neck veins, the groin, the foot pulses and the belly: a quiet groin does not rule out bleeding, and flat neck veins point to an empty circulation, not a squeezed or failing heart.', done: ['perfusion'], roles: RN, points: 5, target: { by: 2 } },
    {
      // only the call that brought the cardiologist counts: a callout on the table later is another item
      id: 'rn-call', label: 'Call the cardiologist at once (SBAR, closed loop)', roles: RN, points: 10, target: { by: 2 },
      why: 'A falling pressure with a fast rate after a femoral case is an emergency: the cardiologist needs to hear it now, with the numbers.',
      done: (s) => (has(s, 'md-called') ? s.performed.find((p) => p.id === 'callout' && p.minute <= s.flags['md-called'])?.minute ?? null : null),
      uses: ['callout'],
    },
    { id: 'rn-fluid', label: 'Open the fluids', why: 'A bolus of saline through the line she has buys minutes while the blood comes up.', done: ['fluid'], roles: RN, points: 10, target: { by: 3 } },
    { id: 'rn-labs', label: 'Labs with a type and crossmatch', why: 'The hemoglobin, the coagulation and a crossmatch sample before the first unit: emergency-release blood comes first, crossmatched units follow the sample.', done: ['labs'], roles: RN, points: 5, target: { by: 4 } },
    { id: 'rn-iv', label: 'A second large-bore IV', why: 'A 20 G line in the hand cannot run blood fast enough: a 16 or 18 G in a big vein, two lines in all.', done: ['iv', 'io'], roles: RN, points: 5, target: { by: 6 } },
    ...RN_ASKS.map(askCritical),
    { id: 'rn-ecg', label: '12-lead: is it the stent?', why: 'After a PCI a falling pressure can also be the stent closing: a 12-lead without new ST changes points away from the heart.', done: ['ecg12', 'ecg12-repeat'], roles: RN, points: 5 },
    { id: 'callout-drop', label: 'Call out the pressure drop when she moves to the table', why: 'Moving a patient this empty drops the pressure: say the number out loud so the operator knows before the needle goes in.', done: ['callout'], after: 'transfer-drop', roles: [3, 4], points: 10, target: { within: { flag: 'transfer-drop', minutes: 1 } }, applies: (s) => has(s, 'transfer-drop') },
    { id: 'hemostasis', label: 'Hold the new groin and check both feet', why: 'The new left sheath comes out once the hole is sealed and the heparin reversed: firm pressure, then the pulses in both feet — the covered stent sits in the right leg\'s main artery.', done: ['hemostasis'], after: 'final-angio', roles: [3, 4], points: 5, applies: (s) => has(s, 'sealed') },

    // the cardiologist
    // blood first, with no saline at all, is volume too (and better for a bleed)
    { id: 'md-fluid', label: 'Volume now: saline or blood', why: 'A bolus of saline through the line she has buys minutes while the blood comes up — or the blood itself, if it is already there.', done: ['fluid', 'transfuse'], roles: MD, points: 5, target: { by: 3 } },
    { id: 'md-labs', label: 'Hemoglobin, coagulation and a type and crossmatch', why: 'The hemoglobin confirms the loss (it lags behind it), and the crossmatch sample goes before the first unit.', done: ['labs'], roles: MD, points: 5, target: { by: 4 } },
    { id: 'md-blood', label: 'Blood early', why: 'She is losing blood: saline only buys minutes and thins what is left. Emergency-release red cells now, and the massive transfusion protocol if she keeps needing them.', done: ['transfuse'], roles: MD, points: 15, target: { by: 8 } },
    { id: 'md-act', label: 'Check the ACT', why: 'Is the heparin from the case still working? With the ACT above her baseline, there is something for protamine to reverse.', done: ['act'], roles: MD, points: 5 },
    { id: 'md-protamine', label: 'Reverse the heparin still on board (protamine)', why: 'In a life-threatening bleed, reverse what is left of the heparin: about 0.25–0.375 mg per 100 units given more than 2 hours ago, slowly. Protamine after a PCI has not been shown to clot the stent; the aspirin and ticagrelor stay, for the fresh stent.', done: ['protamine'], roles: MD, points: 10 },
    { id: 'md-ecg', label: '12-lead: rule out the stent', why: 'After a PCI a falling pressure can also be the stent closing: a 12-lead without new ST changes points away from the heart.', done: ['ecg12', 'ecg12-repeat'], roles: MD, points: 5 },
    { id: 'md-echo', label: 'Bedside echo: rule out tamponade and pump failure', why: 'A perforation can bleed into the pericardium hours later, and a closed stent can stun the heart: an echo with no effusion and a small, hard-squeezing ventricle says empty, not squeezed or failing.', done: ['echo'], roles: MD, points: 5 },
    { id: 'md-vascular', label: 'Call vascular surgery and IR early', why: 'If the hole cannot be sealed from the inside, she needs an open repair: the surgeons need to know now.', done: ['call-vascular'], roles: MD, points: 5, target: { by: 12 } },
    { id: 'md-lab', label: 'Back to the lab now (confirm her consent) — not to the scanner', why: 'She is a transient responder: the volume lifts her pressure for minutes and the bleeding pulls it down again. An unstable patient goes where the bleeding can be stopped; a CT confirms the diagnosis only in a patient who stays stable.', done: ['consent'], roles: MD, points: 10, target: { by: 8 } },
    { id: 'md-access', label: 'In from the other groin: crossover to the right iliac', why: 'Left common femoral access under ultrasound, over the aortic bifurcation into the right iliac: the run finds the hole, and the same sheath carries the balloon and the stent.', done: ['access-femoral'], after: 'on-table', roles: MD, points: 10, target: { within: { flag: 'on-table', minutes: 3 } }, applies: (s) => has(s, 'on-table') },
    { id: 'md-balloon', label: 'Stop the bleeding from the inside: a balloon over the hole', why: 'A peripheral balloon at low pressure over the hole stops the bleeding at once, while everything else is readied; 5–10 minutes of it seals some holes for good.', done: ['balloon-tamponade', 'stent-covered'], after: 'leak-seen', roles: MD, points: 15, target: { within: { flag: 'leak-seen', minutes: 2 } }, applies: (s) => has(s, 'leak-seen') },
    { id: 'md-covered', label: 'Seal the hole with a covered stent', why: 'A hole that still leaks after the balloon is sealed with a covered stent in the external iliac (not across the common femoral, where the hip bends and the profunda branches off), or by the surgeon.', done: ['stent-covered'], roles: MD, points: 10, applies: (s) => has(s, 'leak-seen') },
    { id: 'md-final', label: 'Final run: no more leak', why: 'Prove the seal, and that the femoral, the profunda and the internal iliac still fill, before you leave.', done: ['final-angio'], after: 'sealed', roles: MD, points: 5, applies: (s) => has(s, 'sealed') },
    { id: 'handoff', label: 'Hand-off to the ICU', why: 'The bleed and where it was, how it was sealed, the blood given and the hemoglobin, the protamine and the ACT, the aspirin and ticagrelor kept for the stent, the leg checks — and a hemoglobin again in a few hours.', done: ['handoff'], roles: [4, 5], points: 5 },
  ],
  harms: [
    {
      id: 'more-antithrombotic', actions: ['heparin', 'bivalirudin', 'gp2b3a', 'cangrelor'], points: 12, severity: 'critical',
      text: 'More anticoagulant or a GP IIb/IIIa or IV P2Y12 drug in a patient who is bleeding. It keeps the hole open and speeds the blood loss: stop every anticoagulant and give no more, and reverse what is left of the heparin with protamine — bivalirudin, eptifibatide and cangrelor have no antidote, so once given they keep working until they wear off.',
    },
    { id: 'lytic-in-bleeding', actions: ['tnk'], points: 15, severity: 'critical', text: 'A fibrinolytic in a patient who is bleeding. It dissolves every clot holding the hole closed.' },
    {
      id: 'extra-antiplatelet', actions: ['aspirin', 'p2y12'], points: 3, severity: 'minor',
      text: 'Another antiplatelet dose for a bleeding patient already on aspirin and ticagrelor. It adds to the bleeding and treats nothing; keep the daily doses for the fresh stent, and add none.',
    },
    {
      id: 'atropine-vasovagal', actions: ['atropine'], when: (s) => s.pulse && s.rhythm.hr >= 60, replaces: ['atropine-fast'], points: 8, severity: 'major',
      text: 'Atropine for a low pressure with a fast heart rate. A vasovagal reaction slows the heart; hers is racing to make up for the blood she is losing. Atropine only drives the rate and the heart\'s oxygen need higher: look for the bleeding, and give volume and blood.',
    },
    {
      id: 'rate-control-in-bleeding', actions: ['metoprolol', 'diltiazem'], points: 10, severity: 'major',
      text: 'A drug that slows the heart in a patient who is bleeding. The fast rate is what keeps her output up while the volume is low: take it away and the pressure falls further. Treat the cause.',
    },
    {
      id: 'ct-before-control', actions: ['ct-urgent'], when: (s) => s.pulse && !has(s, 'sealed'), replaces: ['ct-unstable'], points: 8, severity: 'major',
      text: 'Sending her to the scanner while she is still bleeding. She came in shocked, with a hemoglobin 4.5 g/dL down, and her pressure stays up only while volume goes in: an unstable or transient responder goes where the bleeding can be stopped. With the lab next door, the run from the other groin finds the hole and closes it in the same sitting; the scanner only finds it. The CT waits until the hole is closed (or is for a patient who stays stable).',
    },
    {
      id: 'pressor-before-volume', actions: ['pressor', 'push-epi', 'phenylephrine'], when: (s) => s.pulse && !has(s, 'fluid') && !has(s, 'transfused'), points: 3, severity: 'minor',
      text: 'A vasopressor before any volume in a bleeding patient. It squeezes an empty circulation: fill it first (saline, then blood), and use a pressor only as a bridge while the volume goes in.',
    },
    {
      id: 'saline-instead-of-blood', actions: ['fluid'], when: (s) => s.pulse && count(s, 'fluid') >= 2 && !has(s, 'transfused'), points: 3, severity: 'minor',
      text: 'A third saline bolus with no blood yet. After the first liter, saline only dilutes the red cells and the clotting factors she has left: a bleeding patient needs blood.',
    },
    {
      // it stands in for the built-in midazolam rule, so it keeps that rule's drowsy patient too
      id: 'sedation-in-shock', actions: ['sedation', 'midazolam'], when: (s) => s.pulse && (s.vitals.sbp < 90 || s.vitals.gcs <= 12), replaces: ['midazolam-unsafe'], points: 3, severity: 'minor',
      text: 'Sedation with a systolic under 90 or a drowsy patient. It drops the pressure and the breathing further: local anesthetic at the groin, and only a little analgesia once she is stable.',
    },
    {
      id: 'pericardiocentesis-no-effusion', actions: ['pericardiocentesis'], roles: MD, points: 15, severity: 'critical',
      text: 'A pericardiocentesis without an effusion. The needle can puncture the heart, a coronary artery or the liver; the echo shows an empty heart, not a squeezed one.',
    },
    {
      id: 'pump-in-bleeding', actions: ['iabp', 'impella'], roles: MD, points: 10, severity: 'major',
      text: 'A mechanical pump for a bleeding patient. Her heart squeezes hard and has nothing to pump: a pump needs another large-bore arterial sheath and full anticoagulation, and fixes neither.',
    },
    askHarm(TECH_ASKS[2], 'The wrong device when the operator asked for a covered stent. A coronary stent or balloon neither fits the iliac artery nor seals a hole: read the order back and check the box before you open it.'),
  ],
  timings: [
    { label: 'First unit of blood', actions: [], flag: 'transfused', target: 8 },
    { label: 'On the table in the lab', actions: [], flag: 'on-table', target: 12 },
    { label: 'Bleeding stopped from the inside', actions: [], flag: 'bleeding-stopped', target: 20 },
  ],
  deathAfter: 10,
  completeWhen: (s) => has(s, 'sealed') && has(s, 'final-angio'),
  teaching: [
    'Unexplained hypotension after femoral access is a retroperitoneal bleed until proven otherwise — look beyond the groin. It hides behind the abdomen: low back, flank or lower abdominal pain, a fast heart rate, a falling pressure and hemoglobin, and sometimes numbness or weakness of the thigh (the femoral nerve). The groin usually looks fine.',
    'Who bleeds there: a puncture above the inguinal ligament (above the lowest point of the inferior epigastric artery), women and smaller patients, emergency cases and cardiogenic shock, sheaths of 8 Fr or more, heparin or a GP IIb/IIIa inhibitor started before the procedure, and closure devices (which can also delay the bleeding by hours). About 1 femoral PCI in 250; in-hospital mortality about 1 in 15.',
    'Not vasovagal: a vasovagal reaction slows the heart and passes with fluid and atropine; a bleed speeds it (a vagal slowing can occur, but does not explain the back pain and the hemoglobin). Rule out the heart too — a 12-lead for the stent, an echo for tamponade.',
    'Resuscitate: two large-bore lines, saline while the blood comes, then emergency-release red cells early and the massive transfusion protocol if she keeps needing them. Transfuse for the bleeding and the pressure, not for a number; once it is controlled, a hemoglobin near 10 g/dL may be reasonable after an MI (2025 ACC/AHA ACS guideline, MINT).',
    'Antithrombotics: no more heparin, bivalirudin or GP IIb/IIIa drug; reverse residual heparin with protamine (1 mg per 100 units given in the last half hour, 0.25–0.375 mg per 100 units after 2 hours; at most 50 mg, no faster than 5 mg a minute). Bivalirudin has no antidote: stop it (it wears off within an hour or two). Keep aspirin and the P2Y12 inhibitor for a fresh stent unless the bleeding cannot be controlled — that call is the cardiologist\'s.',
    'Where to go: a patient who stays stable gets a CT of the abdomen and pelvis to confirm it, bed rest and serial hemoglobins — most retroperitoneal bleeds (8 to 9 in 10 in the registries) settle that way. An unstable or transient responder goes to the lab (or the OR), not the scanner.',
    'From the inside: access from the other groin, a crossover sheath over the aortic bifurcation, a run to find the hole; a peripheral balloon over it at low pressure for 5–10 minutes stops it and seals some; a covered stent seals the rest (in the external iliac — not across the common femoral, where the hip bends and the profunda branches off). Call vascular surgery early as the backup.',
    'Prevention: radial access first (2025 ACC/AHA ACS guideline, COR 1); from the groin, ultrasound and fluoroscopy to puncture the common femoral artery over the femoral head, below the inferior epigastric artery — and a femoral run before any closure device.',
  ],
};
