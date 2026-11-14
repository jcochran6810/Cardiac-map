/**
 * Built-in safety rules for acute coronary care: the nitrates and nitroprusside, the fibrinolytics, the antithrombotics,
 * protamine, the opioid and the sedatives (midazolam, sedation, procedural sedation), the antiemetic, and the drugs with no
 * role in a cardiac arrest.
 *
 * A drug family with several reasons to hold it is judged through a gate: its rules are ranked, and one dose earns only
 * the highest-ranked rule that applies (one dose, one penalty). Each rule's `when` asks the gate whether it is the top one.
 */
import { READ_OPTIONS } from '../reads';
import { has, mapOf, paced } from '../kit';
import type { Harm, Scenario, SimState } from '../types';
import {
  ANTITHROMBOTICS, AV_BLOCKS, BETA_BLOCKERS, LYTICS, NITRATES_ACS, NITRATES_ALL, NITRATES_SL, NO_DONORS, did, ecgShowsStemi, hasProblem, lastDoneAt,
  longQt, lowPressure, outflowObstruction, preloadDependent, rhythmKind, tachyarrhythmia,
} from './helpers';

type Check = (s: SimState, sc: Scenario, id: string) => boolean;

/** A rule judged through a gate: `applies` is its own condition; the gate decides whether it is the one that charges */
type GateRule = Omit<Harm, 'when'> & { applies: Check };

/**
 * The highest-ranked rule of a gate that applies to this dose (`id`), or null. A case rule with the same id as one of the
 * gate's rules (for this role) decides that rank in the built-in's place: while it applies to the dose it covers it (the
 * gate stops there, so no lower-ranked built-in adds a second penalty); while it does not — a deliberate exemption, or its
 * condition is false — the gate goes on to the next rank: the case has said this reason does not hold here, not that the
 * dose is right. (A case rule that lists the top rule in its `replaces` hides it while it applies: the whole dose is covered.)
 */
function topOf(rules: GateRule[], s: SimState, sc: Scenario, id: string): string | null {
  for (const r of rules) {
    if (!r.actions.includes(id)) continue;
    const own = sc.harms.filter((h) => h.id === r.id && (!h.roles || h.roles.includes(s.role)));
    if (own.length) {
      if (own.some((h) => h.actions.includes(id) && (!h.when || h.when(s, sc, id)))) return r.id;
    } else if (r.applies(s, sc, id)) return r.id;
  }
  return null;
}

/** The rules of a gate as built-in harms: each charges only when it is the gate's top rule for the dose */
function gate(rules: GateRule[], open: Check = () => true): { harms: Harm[]; top: (s: SimState, sc: Scenario, id: string) => string | null } {
  const top = (s: SimState, sc: Scenario, id: string) => (open(s, sc, id) ? topOf(rules, s, sc, id) : null);
  return { harms: rules.map(({ applies: _applies, ...h }) => ({ ...h, when: (s, sc, id) => top(s, sc, id) === h.id })), top };
}

// ─── Nitrates ──────────────────────────────────────────────────────────────

/** The 12-lead pattern on the monitor is an inferior STEMI (with or without complete heart block): the RV may be involved */
const inferiorStemi = (s: SimState) => {
  const read = READ_OPTIONS.find((o) => o.profiles?.includes(s.rhythm.profile));
  return !!read && ['stemi-inferior', 'stemi-inferior-chb'].includes(read.id);
};

/** A beta-blocker or diltiazem has been given (by the learner, or a teammate: the drug's flag) */
const rateSlowed = (s: SimState) => has(s, 'beta-blocker') || has(s, 'diltiazem') || BETA_BLOCKERS.some((b) => did(s, b)) || did(s, 'diltiazem');

/** Out of hospital or in the emergency department: the nitrate checklist (a pressure, the PDE-5 question, V4R) is the learner's */
const beforeTheLab = (sc: Scenario) => sc.setting === 'field' || sc.setting === 'ed';

/**
 * The nitrates (and nitroprusside), ranked: the most serious reason to hold the dose first. Only with a pulse (in an arrest
 * the no-role rule speaks). The radial cocktail and intracoronary nitroprusside stop after the preload rule: their
 * low-pressure rules are their own (the cocktail's, and nitroprusside-hypotension, which is ranked here)
 */
const NITRATE_GATE = gate([
  {
    id: 'nitro-pde5', actions: NO_DONORS, applies: (_s, sc) => hasProblem(sc, ['pde5-inhibitor']), points: 10, severity: 'major',
    text: 'A nitrate after a PDE-5 inhibitor (or riociguat). Within 12 hours of avanafil, 24 hours of sildenafil or vardenafil or 48 hours of tadalafil — and at any time with riociguat — nitroglycerin or nitroprusside can drop the pressure profoundly and for hours (2025 ACC/AHA ACS guideline; Nitrostat and Nipride labels: contraindicated). Treat the pain without nitrates.',
  },
  {
    id: 'nitro-preload-dependent', actions: NITRATES_ALL, applies: (s, sc) => preloadDependent(s, sc) || outflowObstruction(sc), points: 10, severity: 'major',
    text: 'A nitrate for a heart that lives on its preload — a tamponade not yet drained, a pulmonary embolism, a right-ventricular infarction — or that pumps against an outflow obstruction (severe aortic stenosis, LV outflow obstruction). Nitroglycerin pools the blood in the veins: the filling the heart depends on falls, and the pressure with it, often suddenly (2025 ACC/AHA ACS: no nitrates in RV infarction; 2020 ACC/AHA valve and 2024 AHA/ACC HCM guidelines). Fluid, not a vasodilator.',
  },
  {
    id: 'nitroprusside-hypotension', actions: ['ic-nitroprusside'], applies: (s) => lowPressure(s), points: 8, severity: 'major',
    text: 'Intracoronary nitroprusside with a systolic pressure under 90 mmHg. It drops the pressure further, and a low perfusion pressure makes no-reflow worse: support the pressure first, or use intracoronary epinephrine.',
  },
  {
    id: 'nitro-hypotension', actions: NITRATES_ACS, applies: (s) => lowPressure(s), points: 8, severity: 'major',
    text: 'Nitroglycerin with a systolic pressure under 90 mmHg (with an LVAD, a Doppler MAP under 60). Nitrates drop the pressure further: hold them until it is back up.',
  },
  {
    // nicardipine has no other rank here: it is judged on this one alone. The rate drug counts whoever gave it (a teammate's
    // dose sets the same flag)
    id: 'vasodilator-before-rate-control', actions: [...NITRATES_SL, 'nitro-iv', 'nicardipine'],
    applies: (s, sc) => hasProblem(sc, ['aortic-dissection']) && !lowPressure(s) && !rateSlowed(s),
    points: 5, severity: 'major',
    text: 'A vasodilator in an aortic dissection before the heart rate is slowed. On its own it makes the heart race (reflex tachycardia) and pump harder against the tear (2022 ACC/AHA aortic disease guideline: an IV beta-blocker first, to a rate of 60–80; a vasodilator only after it, for a systolic still over 120).',
  },
  {
    id: 'nitro-bradycardia', actions: NITRATES_ACS, applies: (s) => !paced(s) && s.rhythm.hr < 50, points: 5, severity: 'major',
    text: 'Nitroglycerin with a heart rate under 50. A slow heart cannot speed up to make good the pressure a nitrate takes away (ACC/AHA STEMI guideline and AHA ACLS: hold nitrates for a rate under 50): treat the slow rate first.',
  },
  {
    // the case's opening systolic stands in for the patient's usual one; not where lowering the pressure is the goal
    id: 'nitro-pressure-fall', actions: NITRATES_SL,
    applies: (s, sc) => !s.lvad && sc.initial.pulse !== false && s.vitals.sbp <= sc.initial.vitals.sbp - 30 && !hasProblem(sc, ['pulmonary-edema', 'aortic-dissection']),
    points: 5, severity: 'major',
    text: 'Another nitrate after the systolic had fallen 30 mmHg or more below where it started. A fall that size is itself a reason to hold nitrates (2025 ACC/AHA ACS): let the pressure come back up before any more.',
  },
  {
    // the EMT's assist is left out: an EMT records no V4R (the case's own rule judges it)
    id: 'nitro-inferior-no-v4r', actions: ['nitro', 'nitro-high'], applies: (s, sc) => beforeTheLab(sc) && inferiorStemi(s) && !has(s, 'ecg-right'), points: 5, severity: 'major',
    text: 'Nitroglycerin for an inferior STEMI before a right-sided lead. Up to half of inferior infarcts take in the right ventricle, which lives on its preload: record V4R first — ST elevation there means no nitrates (2025 ACC/AHA ACS).',
  },
  {
    // with an LVAD a Doppler MAP over 90 is the high pressure, 60 the low one
    id: 'nitro-high-not-hypertensive', actions: ['nitro-high', 'nitro-iv'], applies: (s) => !lowPressure(s) && (s.lvad ? mapOf(s.vitals) <= 90 : s.vitals.sbp < 160),
    points: 3, severity: 'minor',
    text: 'High-dose nitroglycerin without a high blood pressure. 0.8 mg is for hypertensive pulmonary edema with a systolic of 160 or more (with an LVAD, a Doppler MAP over 90); below that step down to 0.4 mg, and hold nitrates when the pressure is low.',
  },
  {
    // a stimulant's tachycardia is treated with a benzodiazepine and nitroglycerin (2014 AHA/ACC NSTE-ACS)
    id: 'nitro-tachycardia', actions: ['nitro', 'nitro-assist'],
    applies: (s, sc) => s.rhythm.hr > 100 && !hasProblem(sc, ['heart-failure', 'pulmonary-edema', 'sympathomimetic-toxicity', 'aortic-dissection']),
    points: 3, severity: 'minor',
    text: 'Nitroglycerin with a heart rate over 100 and no heart failure to treat. A fast rate is a reason to hold nitrates (ACC/AHA STEMI guideline; AHA ACLS): the reflex speeding they bring adds to the heart\'s oxygen demand. Find out why the heart is racing.',
  },
  {
    id: 'nitro-too-soon', actions: NITRATES_SL, applies: (s) => { const last = lastDoneAt(s, NITRATES_SL); return last !== null && s.minute - last < 3; },
    points: 3, severity: 'minor',
    text: 'Another nitroglycerin less than 3 minutes after the last. The tablet or spray is repeated every 5 minutes, three at most (Nitrostat label; every 3–5 minutes in AHA ACLS), with a blood pressure before each: each dose needs the time to show what it did to the pressure.',
  },
  {
    id: 'nitro-no-bp', actions: NITRATES_SL, applies: (s, sc) => beforeTheLab(sc) && !has(s, 'bp'), points: 5, severity: 'major',
    text: 'Nitroglycerin without a blood pressure first. A systolic under 90, or one 30 below the patient\'s usual, rules it out (2025 ACC/AHA ACS), so every protocol takes a pressure before each dose: the monitor\'s cuff, a manual set or a reassessment.',
  },
  {
    id: 'nitro-no-pde5', actions: NITRATES_SL, applies: (s, sc) => beforeTheLab(sc) && !has(s, 'pde5-asked'), points: 3, severity: 'minor',
    text: 'Nitroglycerin without asking about erectile-dysfunction or pulmonary-hypertension drugs. A PDE-5 inhibitor — avanafil within 12 hours, sildenafil or vardenafil within 24, tadalafil within 48 — or riociguat makes a nitrate drop the pressure profoundly (2025 ACC/AHA ACS): ask before the first dose.',
  },
  {
    id: 'nitro-no-pain', actions: ['nitro', 'nitro-assist'], applies: (s, sc) => s.vitals.pain === 0 && !hasProblem(sc, ['pulmonary-edema', 'aortic-dissection']),
    points: 3, severity: 'minor',
    text: 'Nitroglycerin with no chest pain to treat. Sublingual nitroglycerin is for ischemic chest pain (and the high pressure of pulmonary edema): without either it only lowers the pressure, and can bring a headache or a faint.',
  },
], (s) => s.pulse);

/**
 * Every built-in nitrate rule, and the rule for a drug with no role in an arrest: a case rule that says a nitrate is wrong
 * for its patient lists them in `replaces` (one that also applies in an arrest then stands for that rule too)
 */
export const NITRATE_RULES = [...NITRATE_GATE.harms.map((h) => h.id), 'no-role-in-arrest'];

/**
 * The nitrate rules but these: for a case rule that judges a nitrate dose in its own words but leaves some built-in rules
 * to charge beside it (e.g. the low-pressure rule, which a rule about the PDE-5 question never stood in for)
 */
export const nitrateRulesExcept = (...kept: string[]) => NITRATE_RULES.filter((id) => !kept.includes(id));

/**
 * The nitrate rule that charges this dose (the gate's top rule), or null: for a rule elsewhere that must not add a second
 * penalty to a nitrate dose this gate already charges (e.g. the radial cocktail's low-pressure rule)
 */
export const topNitrate = NITRATE_GATE.top;

// ─── Fibrinolytics ─────────────────────────────────────────────────────────

/** The minutes of compressions in one CPR cycle: more than 10 minutes of CPR is a relative contraindication to a lytic for a STEMI */
const CPR_MINUTES_PER_CYCLE = 2;

/**
 * The fibrinolytics (tenecteplase, alteplase), ranked: the dissection, the absolute contraindications, a second dose, the
 * lab, a STEMI that PCI can reach in time, no indication, then the relative contraindications (2013 ACCF/AHA STEMI table,
 * kept by the 2025 ACC/AHA ACS guideline; TNKase and Activase labels)
 */
const LYTIC_GATE = gate([
  {
    id: 'lytic-dissection', actions: LYTICS, applies: (_s, sc) => hasProblem(sc, ['aortic-dissection']), points: 15, severity: 'critical',
    text: 'A fibrinolytic in an aortic dissection. It can turn the tear into a fatal hemorrhage: a dissection that blocks a coronary ostium can mimic a STEMI — think of it before any lytic.',
  },
  {
    id: 'lytic-absolute', actions: LYTICS, applies: (_s, sc) => hasProblem(sc, ['intracranial-hemorrhage', 'recent-stroke', 'intracranial-risk', 'bleeding']),
    points: 15, severity: 'critical',
    text: 'A fibrinolytic with an absolute contraindication: an intracranial hemorrhage ever, an ischemic stroke within 3 months, an intracranial lesion (an AVM, an aneurysm, a tumor), significant head or face trauma within 3 months, brain or spinal surgery within 2 months, or active bleeding or a bleeding disorder (2013 ACCF/AHA STEMI table, kept by the 2025 ACC/AHA ACS guideline; TNKase and Activase labels). The bleeding risk is prohibitive: primary PCI for a STEMI; for a pulmonary embolism, catheter-directed therapy or surgery.',
  },
  {
    id: 'second-lytic', actions: LYTICS, applies: (s) => has(s, 'lytic'), points: 15, severity: 'critical',
    text: 'A second fibrinolytic. One full dose has been given: another adds the bleeding — in the brain too — and opens nothing the first could not. A STEMI that does not reperfuse goes for rescue PCI (2025 ACC/AHA ACS); a pulmonary embolism that does not respond, for catheter-directed therapy or surgery.',
  },
  {
    id: 'lytic-in-lab', actions: LYTICS, applies: (_s, sc) => sc.setting === 'cathlab', points: 15, severity: 'critical',
    text: 'A fibrinolytic in the cath lab. The artery is opened here mechanically: on top of heparin, the antiplatelet drugs and an arterial sheath, a lytic only adds bleeding — at the access site and in the brain (2025 ACC/AHA ACS: primary PCI, not fibrinolysis, where PCI is available).',
  },
  {
    id: 'lytic-pci-available', actions: LYTICS,
    applies: (s, sc) => sc.setting === 'ed' && ecgShowsStemi(s) && !hasProblem(sc, ['pulmonary-embolism']) && !sc.noTimelyPci, points: 15, severity: 'critical',
    text: 'A fibrinolytic for a STEMI that primary PCI can reach in time. With a cath lab within 120 minutes of first medical contact, primary PCI is the reperfusion (2025 ACC/AHA ACS, 1): it opens more arteries with less bleeding — a lytic adds an intracranial bleed in about 1 in 100. Activate the cath lab.',
  },
  {
    id: 'lytic-no-indication', actions: LYTICS,
    applies: (s, sc) => sc.setting === 'ed' && !has(s, 'ecg-stemi') && !hasProblem(sc, ['pe-high-risk', 'aortic-dissection']) && !(hasProblem(sc, ['pulmonary-embolism']) && !s.pulse),
    points: 15, severity: 'critical',
    text: 'A fibrinolytic without an indication. In the emergency department it is for a STEMI on the 12-lead when PCI cannot happen within 120 minutes of first medical contact (then within 30 minutes of arrival), or a pulmonary embolism with cardiopulmonary failure (shock, or an arrest); a PE without it gets only the bleeding (AHA/ACC 2026: systemic lysis 3 — Harm in categories A–C), and so does any other patient — intracranial in about 1 in 100.',
  },
  {
    id: 'lytic-hypertension', actions: LYTICS, applies: (s) => s.pulse && (s.vitals.sbp > 180 || s.vitals.dbp > 110), points: 5, severity: 'major',
    text: 'A fibrinolytic with a systolic over 180 or a diastolic over 110. A severe, uncontrolled pressure is a relative contraindication (2013 ACCF/AHA STEMI table, kept by the 2025 ACC/AHA ACS guideline): the intracranial bleeding risk climbs steeply. Bring the pressure down first, or choose PCI.',
  },
  {
    id: 'lytic-relative', actions: LYTICS,
    applies: (s, sc) => hasProblem(sc, ['oral-anticoagulant', 'recent-surgery', 'recent-bleeding', 'pregnancy', 'prior-stroke'])
      || (ecgShowsStemi(s) && !hasProblem(sc, ['pulmonary-embolism']) && (s.counts.cpr ?? 0) * CPR_MINUTES_PER_CYCLE > 10),
    points: 5, severity: 'major',
    text: 'A fibrinolytic with a relative contraindication: an oral anticoagulant, major surgery within 3 weeks, internal bleeding within 2–4 weeks or an active ulcer, pregnancy, a stroke more than 3 months ago or a TIA, or more than 10 minutes of CPR (2013 ACCF/AHA STEMI table, kept by the 2025 ACC/AHA ACS guideline). For a STEMI, PCI is the safer reperfusion; for a pulmonary embolism in shock or arrest the lysis may still be right — weigh the bleeding against catheter-directed therapy or surgery, it is not forbidden.',
  },
]);

/** Every built-in fibrinolytic rule: a case rule that says a lytic is wrong for its patient lists them in `replaces` */
export const LYTIC_RULES = LYTIC_GATE.harms.map((h) => h.id);

// ─── Analgesia and sedation ────────────────────────────────────────────────

/**
 * A procedure that needs sedation or analgesia is running or about to start: a cardioversion (a tachyarrhythmia, or torsades
 * to be defibrillated), transcutaneous pacing, or the pads on for a rate under 50 that the pacer is about to take. A heart
 * already paced by a transvenous wire needs none, and a slow rate with no pads on is no procedure yet
 */
export const sedationForProcedure = (s: SimState) =>
  tachyarrhythmia(s) || rhythmKind(s) === 'torsades' || s.rhythm.profile === 'tcp' || (s.rhythm.hr < 50 && !paced(s) && has(s, 'pads'));

/**
 * Too unwell to sedate: a low pressure, breathing under 10 a minute, or drowsy (GCS 12 or less) — and no procedure to sedate
 * for. In the emergency department a drowsy patient with an advanced airway (RSI, or a tube after the arrest) is a ventilated
 * one, sedated for the tube on the physician's decision: no mistake there
 */
export const unsafeToSedate: Check = (s, sc) =>
  s.pulse && (lowPressure(s) || s.vitals.rr < 10 || (s.vitals.gcs <= 12 && !(sc.setting === 'ed' && has(s, 'airway')))) && !sedationForProcedure(s);

/** The opioid (fentanyl), ranked: the breathing first, then the pressure, then whether there is pain to treat */
const OPIOID_GATE = gate([
  {
    id: 'opioid-respiratory', actions: ['fentanyl'], applies: (s) => s.vitals.rr < 10 || (s.vitals.gcs <= 8 && !has(s, 'airway') && !sedationForProcedure(s)),
    points: 5, severity: 'major',
    text: 'An opioid for a patient breathing under 10 a minute, or too drowsy to protect the airway (GCS 8 or less, no airway in place). Fentanyl slows the breathing further and can stop it (label boxed warning: life-threatening respiratory depression): support the breathing and the airway first.',
  },
  {
    id: 'opioid-hypotension', actions: ['fentanyl'], applies: (s) => lowPressure(s) && !sedationForProcedure(s), points: 3, severity: 'minor',
    text: 'An opioid with a systolic under 90 (with an LVAD, a Doppler MAP under 60) and no cardioversion or pacing to give it for. It widens the veins and blunts the drive holding the pressure up (label: severe hypotension): support the pressure first, then small doses, titrated.',
  },
  {
    id: 'opioid-no-pain', actions: ['fentanyl'], applies: (s) => s.vitals.pain === 0 && !sedationForProcedure(s), points: 3, severity: 'minor',
    text: 'An opioid with no pain to treat, and no cardioversion or pacing to give it for. Without either it brings only its risks — slower breathing, a lower pressure, nausea — and in an acute coronary syndrome an opioid also slows the oral P2Y12 inhibitor (2025 ACC/AHA ACS).',
  },
], (s) => s.pulse);

/**
 * Every built-in rule for the opioid and the sedatives (midazolam, the paramedic's and the lab's sedation), and the rule for a
 * drug with no role in an arrest: a case rule that says a sedative or an opioid is wrong for its patient lists them in
 * `replaces`
 */
export const SEDATIVE_RULES = [...OPIOID_GATE.harms.map((h) => h.id), 'midazolam-unsafe', 'sedation-unsafe', 'no-role-in-arrest'];

// ─── The antiemetic ────────────────────────────────────────────────────────

/** The label's advice to monitor the ECG: a failing heart, a high potassium, a slow rate or AV block */
const ondansetronRisk = (s: SimState, sc: Scenario) =>
  hasProblem(sc, ['heart-failure', 'hyperkalemia']) || s.rhythm.hr < 50 || AV_BLOCKS.includes(rhythmKind(s));

export const ACS_RULES: Harm[] = [
  // the emergency department's procedural sedation (ACEP clinical policy: monitoring and capnography)
  { id: 'sedation-unmonitored', actions: ['procedural-sedation'], when: (s) => !has(s, 'monitor'), points: 5, severity: 'major', text: 'Procedural sedation without the cardiac monitor on. Sedation can stop the breathing and drop the pressure: the ECG, pulse oximetry, the blood pressure and capnography run from before the first dose until the patient is awake again.' },
  { id: 'sedation-no-procedure', actions: ['procedural-sedation'], when: (s) => s.pulse && !sedationForProcedure(s), points: 3, severity: 'minor', text: 'Procedural sedation with no procedure that needs it. Deep sedation is for a cardioversion, a shock or pacing in a patient who is awake; without one it only puts the airway, the breathing and the pressure at risk.' },
  ...LYTIC_GATE.harms,
  ...NITRATE_GATE.harms,
  { id: 'ondansetron-long-qt', actions: ['ondansetron'], when: (s, sc) => longQt(s, sc), points: 5, severity: 'major', text: 'Ondansetron with a long QT. It lengthens the QT further, more with each dose, and can set off torsades de pointes: avoid it with a long QT or torsades.' },
  // the long-QT rule above speaks for a pulseless torsades
  {
    id: 'no-role-in-arrest', actions: ['nitro', 'nitro-high', 'nitro-iv', 'ic-nitro', 'fentanyl', 'midazolam', 'ondansetron'],
    when: (s, sc, id) => !s.pulse && !(id === 'ondansetron' && longQt(s, sc)), points: 3, severity: 'minor',
    text: 'A drug with no role in cardiac arrest. Nitroglycerin, fentanyl, midazolam and ondansetron treat a patient with a circulation: in an arrest they do nothing (2025 AHA) and take time from what does — compressions, a shock for VF or pulseless VT, epinephrine and the reversible causes.',
  },
  {
    // in the lab the monitor is always on
    id: 'ondansetron-unmonitored', actions: ['ondansetron'],
    when: (s, sc) => s.pulse && sc.setting !== 'cathlab' && !has(s, 'monitor') && !longQt(s, sc) && ondansetronRisk(s, sc), points: 2, severity: 'minor',
    text: 'Ondansetron without the cardiac monitor on, for a patient with a failing heart, a high potassium, a slow rate or AV block. It lengthens the QT, and its label advises ECG monitoring for exactly these patients: put the monitor on first.',
  },
  ...OPIOID_GATE.harms,
  // sedation before a cardioversion or for the pacer is needed even with a low pressure (a smaller dose, titrated): a case
  // with its own sedation rule says so in its own words
  { id: 'midazolam-unsafe', actions: ['midazolam'], when: unsafeToSedate, points: 5, severity: 'major', text: 'Midazolam with a low pressure, slow breathing or a drowsy patient, and no cardioversion or pacing to sedate for. A benzodiazepine drops the pressure and the breathing further (label boxed warning: respiratory depression): it is for agitation, seizures or stimulant toxicity in a patient who can take it — here support the pressure and the airway instead.' },
  { id: 'sedation-unsafe', actions: ['sedation'], when: unsafeToSedate, points: 5, severity: 'major', text: 'Sedation with a low pressure, slow breathing or a drowsy patient, and no cardioversion or pacing to sedate for. A sedative drops the pressure and the breathing further (midazolam label boxed warning: respiratory depression, continuous monitoring): sedation is for a procedure in a patient awake enough to feel it — here support the pressure and the airway instead.' },
  { id: 'antithrombotic-dissection', actions: ANTITHROMBOTICS, when: (_s, sc) => hasProblem(sc, ['aortic-dissection']), points: 8, severity: 'major', text: 'An antiplatelet or anticoagulant in an aortic dissection. It makes the torn aorta bleed — into the chest, the pericardium or the abdomen — and complicates the surgery the patient needs. Tearing pain to the back, a pressure difference between the arms or a new murmur: think dissection before giving antithrombotics.' },
];
