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
import { NITRATE_CHECK_IDS, builtInChargedBefore } from './charge';
import { indicationCovered } from './scope';
import {
  ANTITHROMBOTICS, AV_BLOCKS, BETA_BLOCKERS, LYTICS, NITRATES_ACS, NITRATES_ALL, NITRATES_SL, NO_DONORS, chargedBefore, did, ecgShowsStemi, hasProblem, lastDoneAt,
  longQt, lowPressure, outflowObstruction, preloadDependent, rhythmKind, tachyarrhythmia,
} from './helpers';

type Check = (s: SimState, sc: Scenario, id: string) => boolean;

/** A rule judged through a gate: `applies` is its own condition; the gate decides whether it is the one that charges */
type GateRule = Omit<Harm, 'when'> & { applies: Check };

/**
 * The highest-ranked rule of a gate that applies to this dose (`id`), or null. A case rule with the same id as one of the
 * gate's rules (for this role and this action) decides that rank in the built-in's place: while it applies to the dose it
 * covers it (the gate stops there, so no lower-ranked built-in adds a second penalty); while it does not — a deliberate
 * exemption, or its condition is false — the gate goes on to the next rank: the case has said this reason does not hold
 * here, not that the dose is right. (A case rule that lists the top rule in its `replaces` hides it while it applies: the
 * whole dose is covered.) A rank that already charged an earlier dose is passed over, and so is an indication rank the ER
 * nurse's missing order covers (rules/scope.ts indicationCovered).
 */
function topOf(rules: GateRule[], s: SimState, sc: Scenario, id: string): string | null {
  for (const r of rules) {
    if (!r.actions.includes(id)) continue;
    // a rank that charged an earlier dose is passed over: each rule charges once a case, so a later dose is judged by the
    // next reason that holds and never goes free because an earlier one was charged (the penalty pushed for this dose has
    // this minute: every drug the gates judge takes time)
    if (builtInChargedBefore(s, r, id)) continue;
    const own = sc.harms.filter((h) => h.id === r.id && (!h.roles || h.roles.includes(s.role)) && h.actions.includes(id));
    if (own.length) {
      if (own.some((h) => !h.when || h.when(s, sc, id))) return r.id;
    } else if (r.applies(s, sc, id) && !indicationCovered(r.id, s, sc, id)) return r.id;
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

/**
 * The rate is slowed: a beta-blocker or diltiazem was given — by the learner, or by a teammate or the physician's fallback
 * (the drug's flag)
 */
export const rateSlowed = (s: SimState) => has(s, 'beta-blocker') || has(s, 'diltiazem') || BETA_BLOCKERS.some((b) => did(s, b)) || did(s, 'diltiazem');

/**
 * An aortic dissection whose rate is not yet slowed, with a pressure that is not low: a vasodilator there comes too early
 * (vasodilator-before-rate-control). The nicardipine rules (rules/added.ts) stand aside while it holds
 */
export const vasodilatorBeforeRateControl = (s: SimState, sc: Scenario) => hasProblem(sc, ['aortic-dissection']) && !lowPressure(s) && !rateSlowed(s);

/** Out of hospital or in the emergency department: the nitrate checklist (a pressure, the PDE-5 question, V4R) is the learner's */
const beforeTheLab = (sc: Scenario) => sc.setting === 'field' || sc.setting === 'ed';

/**
 * The minute of the latest sublingual nitroglycerin before this dose, or null: the learner's own (s.performed), or one a
 * teammate gave that the case records with a flag ('nitro' — e.g. the ALS crew's on arrival — or the NSTEMI's
 * 'nitro-for-pain'). A flag holds the minute it was first set, and the learner's own dose sets it as the dose ends: a flag
 * set within a minute after one of the learner's doses is that dose, which s.performed already gives
 */
const TEAM_NITRO_FLAGS = ['nitro', 'nitro-for-pain'];
const lastSublingualAt = (s: SimState): number | null => {
  const own = lastDoneAt(s, NITRATES_SL);
  const byLearner = (m: number) => s.performed.some((p) => NITRATES_SL.includes(p.id) && p.minute <= m && m - p.minute <= 1);
  const team = TEAM_NITRO_FLAGS.map((f) => s.flags[f]).filter((m): m is number => m !== undefined && m <= s.minute && !byLearner(m));
  const all = own === null ? team : [own, ...team];
  return all.length ? Math.max(...all) : null;
};

/**
 * The nitrates (and nitroprusside), ranked: the most serious reason to hold the dose first. Only with a pulse (in an arrest
 * the no-role rule speaks). The radial cocktail and intracoronary nitroprusside stop after the preload rule: their
 * low-pressure rules are their own (the cocktail's, and nitroprusside-hypotension, which is ranked here)
 */
const NITRATE_RANKS: GateRule[] = [
  {
    id: 'nitro-pde5', actions: NO_DONORS, applies: (_s, sc) => hasProblem(sc, ['pde5-inhibitor']), points: 10, severity: 'major',
    text: 'A nitrate after a PDE-5 inhibitor (or riociguat). Within 12 hours of avanafil, 24 hours of sildenafil or vardenafil or 48 hours of tadalafil — and at any time with riociguat — nitroglycerin or nitroprusside can drop the pressure profoundly and for hours (2025 ACC/AHA ACS guideline; Nitrostat and Nipride labels: contraindicated). Treat the pain without nitrates.',
  },
  {
    id: 'nitro-preload-dependent', actions: NO_DONORS, applies: (s, sc) => preloadDependent(s, sc) || outflowObstruction(sc), points: 10, severity: 'major',
    text: 'A nitrate or nitroprusside for a heart that lives on its preload — a tamponade not yet drained, a pulmonary embolism, a right-ventricular infarction — or that pumps against an outflow obstruction (severe aortic stenosis, LV outflow obstruction). Nitroglycerin pools the blood in the veins, and nitroprusside opens the arteries too: the filling the heart depends on falls, and the pressure with it, often suddenly (2025 ACC/AHA ACS: no nitrates in RV infarction; 2020 ACC/AHA valve and 2024 AHA/ACC HCM guidelines; Nipride label). Fluid, not a vasodilator.',
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
    // a pressure still at 90 or more in a bleeding patient is held up by tight veins: the nitrate takes that away (the radial
    // cocktail's nitroglycerin and nitroprusside too; under 90 their own low-pressure rules speak)
    id: 'nitro-volume-depleted', actions: NO_DONORS, applies: (s, sc) => hasProblem(sc, ['bleeding']), points: 8, severity: 'major',
    text: 'Nitroglycerin (or nitroprusside, or the radial cocktail) for a patient who is losing blood. Bleeding leaves the heart short of filling, and the pressure is held up by tightened veins: a nitrate opens them and the pressure can fall suddenly (Nitrostat label: caution with volume depletion; hold nitrates in hypotension). Stop the bleeding and replace the volume; treat the pain another way.',
  },
  {
    // nicardipine has no other rank here: it is judged on this one alone. The rate drug counts whoever gave it (a teammate's
    // dose sets the same flag)
    id: 'vasodilator-before-rate-control', actions: [...NITRATES_SL, 'nitro-iv', 'nicardipine'],
    applies: vasodilatorBeforeRateControl,
    points: 5, severity: 'major',
    text: 'A vasodilator in an aortic dissection before the heart rate is slowed. On its own it makes the heart race (reflex tachycardia) and pump harder against the tear (2022 ACC/AHA aortic disease guideline: an IV beta-blocker first, to a rate of 60–80; a vasodilator only after it, for a systolic still over 120).',
  },
  {
    id: 'nitro-bradycardia', actions: NITRATES_ACS, applies: (s) => !paced(s) && s.rhythm.hr < 50, points: 5, severity: 'major',
    text: 'Nitroglycerin with a heart rate under 50. A slow heart cannot speed up to make good the pressure a nitrate takes away (ACC/AHA STEMI guideline and AHA ACLS: hold nitrates for a rate under 50): treat the slow rate first.',
  },
  {
    // the case's opening systolic stands in for the patient's usual one — not where it opened high (a hypertensive or
    // stimulant-driven pressure is not the patient's usual one), nor where lowering the pressure is the goal: a
    // benzodiazepine and nitroglycerin bringing a stimulant's pressure down is the treatment (2014 AHA/ACC NSTE-ACS)
    id: 'nitro-pressure-fall', actions: NITRATES_SL,
    applies: (s, sc) => !s.lvad && sc.initial.pulse !== false && sc.initial.vitals.sbp < 160 && s.vitals.sbp <= sc.initial.vitals.sbp - 30
      && !hasProblem(sc, ['pulmonary-edema', 'aortic-dissection', 'sympathomimetic-toxicity']),
    points: 5, severity: 'major',
    text: 'Nitroglycerin with the systolic 30 mmHg or more below where it started. A fall that size is itself a reason to hold nitrates (2025 ACC/AHA ACS): let the pressure come back up before any more.',
  },
  {
    // the EMT's assist is left out: an EMT records no V4R (the case's own rule judges it)
    id: 'nitro-inferior-no-v4r', actions: ['nitro', 'nitro-high'], applies: (s, sc) => beforeTheLab(sc) && inferiorStemi(s) && !has(s, 'ecg-right'), points: 5, severity: 'major',
    text: 'Nitroglycerin for an inferior STEMI before a right-sided lead. Up to half of inferior infarcts take in the right ventricle, which lives on its preload: record V4R first — ST elevation there means no nitrates (2025 ACC/AHA ACS).',
  },
  {
    // with an LVAD a Doppler MAP over 90 is the high pressure, 60 the low one. The IV infusion is dosed by its indication
    // (the high-dose bolus only for hypertensive pulmonary edema at 160 or more; otherwise 10 mcg/min, no bolus): not this rule's
    id: 'nitro-high-not-hypertensive', actions: ['nitro-high'], applies: (s) => !lowPressure(s) && (s.lvad ? mapOf(s.vitals) <= 90 : s.vitals.sbp < 160),
    points: 3, severity: 'minor',
    text: 'High-dose nitroglycerin without a high blood pressure. 0.8 mg is for hypertensive pulmonary edema with a systolic of 160 or more (with an LVAD, a Doppler MAP over 90); below that step down to 0.4 mg, and hold nitrates when the pressure is low.',
  },
  {
    // ranked over the fast rate, the interval, the PDE-5 question and no pain (3 points each): without a pressure the learner
    // cannot know the dose is safe. Under the 0.8 mg dose rule, which the ER nurse's missing order covers (one act, one
    // penalty) and which the cases' checks have always charged beside
    id: 'nitro-no-bp', actions: NITRATES_SL, applies: (s, sc) => beforeTheLab(sc) && !has(s, 'bp'), points: 5, severity: 'major',
    text: 'Nitroglycerin without a blood pressure first. A systolic under 90, or one 30 below the patient\'s usual, rules it out (2025 ACC/AHA ACS), so every protocol takes a pressure before each dose: the monitor\'s cuff, a manual set or a reassessment.',
  },
  {
    // a stimulant's tachycardia is treated with a benzodiazepine and nitroglycerin (2014 AHA/ACC NSTE-ACS)
    id: 'nitro-tachycardia', actions: ['nitro', 'nitro-assist'],
    applies: (s, sc) => s.rhythm.hr > 100 && !hasProblem(sc, ['heart-failure', 'pulmonary-edema', 'sympathomimetic-toxicity', 'aortic-dissection']),
    points: 3, severity: 'minor',
    text: 'Nitroglycerin with a heart rate over 100 and no heart failure to treat. A fast rate is a reason to hold nitrates (ACC/AHA STEMI guideline; AHA ACLS): the reflex speeding they bring adds to the heart\'s oxygen demand. Find out why the heart is racing.',
  },
  {
    // no indication is ranked over the interval and the PDE-5 question: a dose that should not be given at all teaches that first
    id: 'nitro-no-pain', actions: ['nitro', 'nitro-assist'], applies: (s, sc) => s.vitals.pain === 0 && !hasProblem(sc, ['pulmonary-edema', 'aortic-dissection']),
    points: 3, severity: 'minor',
    text: 'Nitroglycerin with no chest pain to treat. Sublingual nitroglycerin is for ischemic chest pain (and the high pressure of pulmonary edema): without either it only lowers the pressure, and can bring a headache or a faint.',
  },
  {
    id: 'nitro-too-soon', actions: NITRATES_SL, applies: (s) => { const last = lastSublingualAt(s); return last !== null && s.minute - last < 3; },
    points: 3, severity: 'minor',
    text: 'Another nitroglycerin less than 3 minutes after the last (yours, or one a teammate or the patient took). The tablet or spray is repeated every 5 minutes, three at most (Nitrostat label; every 3–5 minutes in AHA ACLS), with a blood pressure before each: each dose needs the time to show what it did to the pressure.',
  },
  {
    id: 'nitro-no-pde5', actions: NITRATES_SL, applies: (s, sc) => beforeTheLab(sc) && !has(s, 'pde5-asked'), points: 3, severity: 'minor',
    text: 'Nitroglycerin without asking about erectile-dysfunction or pulmonary-hypertension drugs. A PDE-5 inhibitor — avanafil within 12 hours, sildenafil or vardenafil within 24, tadalafil within 48 — or riociguat makes a nitrate drop the pressure profoundly (2025 ACC/AHA ACS): ask before the first dose.',
  },
];
const NITRATE_GATE = gate(NITRATE_RANKS, (s) => s.pulse);

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

/** The checks before a sublingual dose — the pressure, the interval, the PDE-5 question: each one a mistake of its own */
export const NITRATE_CHECKS = NITRATE_CHECK_IDS;

/**
 * The gate's reasons to hold a nitrate dose altogether (its contraindications): the ranks above the 0.8 mg dose rule, and the
 * fast rate. The other ranks judge the size of the dose, the checks before it and whether it is indicated
 */
const NITRATE_CONTRAINDICATIONS = [
  ...NITRATE_RANKS.slice(0, NITRATE_RANKS.findIndex((r) => r.id === 'nitro-high-not-hypertensive')).map((r) => r.id), 'nitro-tachycardia',
];


/** Another case rule (not `selfId`) applies to this dose and lists the built-in `ruleId` in its `replaces`: it speaks in its place */
const hiddenByCase = (ruleId: string, selfId: string, s: SimState, sc: Scenario, id: string) =>
  sc.harms.some((h) => h.id !== selfId && (!h.roles || h.roles.includes(s.role)) && h.actions.includes(id) && !!h.replaces?.includes(ruleId) && (!h.when || h.when(s, sc, id)));

/**
 * A case rule that judges a nitrate dose in its own words, kept in the gate's order: one dose, one penalty, the most
 * serious reason — so skipping a check is never cheaper than making it, and no contraindication hides behind a smaller
 * rule. `rank` is the most serious built-in rank the rule stands for (by default its own id: a rule with a built-in's id
 * decides that rank in the built-in's place).
 * - It gives way to a contraindication the gate ranks above `rank` that charges this dose instead — the built-in, or the
 *   case's own rule with its id — and in an arrest to the no-role rule. (A contraindication another case rule speaks for in
 *   its `replaces` is that rule's: this one charges beside it, as before the gate.)
 * - While it applies it hides the built-in ranks it stands for: the contraindications from `rank` down, and every check,
 *   dose and indication rank.
 * - The ranks in `beside` it neither gives way to nor hides: they charge beside it (NITRATE_CHECKS for a case rule that is
 *   a check itself — the checks are each a mistake of their own).
 * - A rule with a built-in's id stands aside once it has charged, as the gate passes its rank over: a later dose is judged
 *   by the gate again. A rule with another id keeps covering its ranks, so a repeated mistake is charged once.
 */
export function nitrateCaseRule(harm: Harm, rank: string = harm.id, beside: string[] = [], yieldTo: string[] = []): Harm {
  const at = NITRATE_RANKS.findIndex((r) => r.id === rank);
  if (at < 0) throw new Error(`nitrateCaseRule: ${rank} is not a rank of the nitrate gate`);
  const above = NITRATE_RANKS.slice(0, at);
  const builtInId = NITRATE_RANKS.some((r) => r.id === harm.id);
  const outranked: Check = (s, sc, id) => {
    if (!s.pulse) return true;
    const top = topOf(above, s, sc, id);
    if (top !== null && NITRATE_CONTRAINDICATIONS.includes(top) && !beside.includes(top) && !hiddenByCase(top, harm.id, s, sc, id)) return true;
    // a rank of `yieldTo` above this one holds for the dose: e.g. a check ranked higher (one check a dose) — the built-in, or
    // the case's own rule with its id, which may judge an action the built-in does not (a case's IV nitroglycerin). Whoever
    // charges it (that rule, or a case rule standing in for it), this one gives way. A rank that charged an earlier dose is
    // passed over, as the gate passes it over: a later dose is judged anew
    return above.filter((r) => yieldTo.includes(r.id) && !chargedBefore(s, r.id)).some((r) => {
      const own = sc.harms.filter((h) => h.id === r.id && (!h.roles || h.roles.includes(s.role)) && h.actions.includes(id));
      return own.length ? own.some((h) => !h.when || h.when(s, sc, id)) : r.actions.includes(id) && r.applies(s, sc, id) && !indicationCovered(r.id, s, sc, id);
    });
  };
  const covers = NITRATE_RANKS.map((r) => r.id)
    .filter((id, i) => id === rank || (!beside.includes(id) && (i >= at || !NITRATE_CONTRAINDICATIONS.includes(id))))
    .filter((id) => !harm.replaces?.includes(id));
  return {
    ...harm,
    when: (s, sc, id) => (!harm.when || harm.when(s, sc, id)) && !outranked(s, sc, id) && !(builtInId && chargedBefore(s, harm.id)),
    replaces: [...(harm.replaces ?? []), ...covers],
  };
}

/**
 * A case rule that is one of the checks before a sublingual dose (the pressure, the interval, the PDE-5 question), at its
 * rank in the gate, as the built-in check is: one dose, one penalty. It gives way to any rank above it that holds for the
 * dose — a contraindication, the 0.8 mg dose rule, no pain to treat, or a check ranked higher (the pressure, then the
 * interval, then the PDE-5 question): the built-in, or the case's own rule with its id — and hides the built-in ranks
 * below it. (The ER nurse's missing order is no rank of the gate: a check still charges beside it, lead decision 2)
 */
export const nitrateCheckRule = (harm: Harm, rank: string = harm.id) =>
  nitrateCaseRule(harm, rank, [], NITRATE_RANKS.map((r) => r.id));

/**
 * The nitrate gate charges this dose: its top rule, or a case rule standing in for that rule (its id, or listing it in
 * `replaces`) that has not charged an earlier dose. For a rule elsewhere that must not add a second penalty to the same
 * dose — the rhythm rules on the radial cocktail, which carries nitroglycerin with its verapamil (rules/rhythm.ts)
 */
export function nitrateCharges(s: SimState, sc: Scenario, id: string): boolean {
  const top = NITRATE_GATE.top(s, sc, id);
  if (!top) return false;
  const standIns = sc.harms.filter((h) => (!h.roles || h.roles.includes(s.role)) && h.actions.includes(id)
    && (h.id === top || !!h.replaces?.includes(top)) && (!h.when || h.when(s, sc, id)));
  return !standIns.length || standIns.some((h) => !chargedBefore(s, h.id));
}

// ─── Fibrinolytics ─────────────────────────────────────────────────────────

/** The minutes of compressions in one CPR cycle: more than 10 minutes of CPR is a relative contraindication to a lytic for a STEMI */
const CPR_MINUTES_PER_CYCLE = 2;

/** IV drugs that lower a severe pressure before a fibrinolytic (some are actions still to come) */
const IV_ANTIHYPERTENSIVES = ['metoprolol', 'esmolol', 'labetalol', 'nicardipine', 'clevidipine', 'nitro-iv'];

/**
 * A pulmonary embolism with cardiopulmonary failure — in shock (category D or E) or in arrest: the lysis may still be right
 * with a relative contraindication, weighed against catheter-directed therapy or surgery (2025 AHA ACLS 2a in the arrest;
 * 2026 AHA/ACC PE), so it is not counted against it
 */
const peNeedsLysis = (s: SimState, sc: Scenario) => hasProblem(sc, ['pulmonary-embolism']) && (!s.pulse || hasProblem(sc, ['pe-high-risk']));

/**
 * The fibrinolytics (tenecteplase, alteplase), ranked: the dissection, the absolute contraindications (with a severe
 * pressure that emergency treatment did not bring down), a second dose, the lab, a STEMI that PCI can reach in time, no
 * indication, then the relative contraindications (2013 ACCF/AHA STEMI table, kept by the 2025 ACC/AHA ACS guideline;
 * TNKase and Activase labels)
 */
const LYTIC_GATE = gate([
  {
    id: 'lytic-dissection', actions: LYTICS, applies: (_s, sc) => hasProblem(sc, ['aortic-dissection']), points: 15, severity: 'critical',
    text: 'A fibrinolytic in an aortic dissection. It can turn the tear into a fatal hemorrhage: a dissection that blocks a coronary ostium can mimic a STEMI — think of it before any lytic.',
  },
  {
    // a stroke under way now: an ischemic stroke within 3 months, and before a CT a bleed is not excluded (the stroke dose of
    // alteplase or tenecteplase is the stroke team's decision, not a STEMI or PE dose)
    id: 'lytic-absolute', actions: LYTICS, applies: (_s, sc) => hasProblem(sc, ['intracranial-hemorrhage', 'recent-stroke', 'stroke', 'intracranial-risk', 'bleeding']),
    points: 15, severity: 'critical',
    text: 'A fibrinolytic with an absolute contraindication: an intracranial hemorrhage ever, an ischemic stroke within 3 months or one under way now (before a CT has excluded a bleed), an intracranial lesion (an AVM, an aneurysm, a tumor), significant head or face trauma within 3 months, brain or spinal surgery within 2 months, or active bleeding or a bleeding disorder (2013 ACCF/AHA STEMI table, kept by the 2025 ACC/AHA ACS guideline; TNKase and Activase labels). The bleeding risk is prohibitive: primary PCI for a STEMI; for a pulmonary embolism, catheter-directed therapy or surgery.',
  },
  {
    id: 'lytic-uncontrolled-hypertension', actions: LYTICS,
    applies: (s) => s.pulse && (s.vitals.sbp > 180 || s.vitals.dbp > 110) && IV_ANTIHYPERTENSIVES.some((d) => did(s, d)),
    points: 15, severity: 'critical',
    text: 'A fibrinolytic with a systolic still over 180 or a diastolic over 110 after IV treatment to bring it down. Severe hypertension that does not respond to emergency treatment is an absolute contraindication (2013 ACCF/AHA STEMI table, kept by the 2025 ACC/AHA ACS guideline; TNKase and Activase labels: severe uncontrolled hypertension): the intracranial bleeding risk is prohibitive. Primary PCI, even with a longer delay.',
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
    text: 'A fibrinolytic with a systolic over 180 or a diastolic over 110. Significant hypertension on presentation is a relative contraindication (2013 ACCF/AHA STEMI table, kept by the 2025 ACC/AHA ACS guideline) — and one that IV treatment does not bring down is an absolute one: the intracranial bleeding risk climbs steeply. Bring the pressure down first, or choose PCI.',
  },
  {
    id: 'lytic-relative', actions: LYTICS,
    applies: (s, sc) => (!peNeedsLysis(s, sc) && hasProblem(sc, ['oral-anticoagulant', 'recent-surgery', 'recent-bleeding', 'pregnancy', 'prior-stroke', 'thrombocytopenia']))
      || (ecgShowsStemi(s) && !hasProblem(sc, ['pulmonary-embolism']) && (s.counts.cpr ?? 0) * CPR_MINUTES_PER_CYCLE > 10),
    points: 5, severity: 'major',
    text: 'A fibrinolytic with a relative contraindication: an oral anticoagulant, major surgery within 3 weeks, internal bleeding within 2–4 weeks or an active ulcer, pregnancy, platelets under 100,000, a stroke more than 3 months ago or a TIA (the TNKase label lists any earlier stroke), or more than 10 minutes of CPR (2013 ACCF/AHA STEMI table, kept by the 2025 ACC/AHA ACS guideline). For a STEMI, PCI is the safer reperfusion. (For a pulmonary embolism in shock or in arrest these are weighed against catheter-directed therapy or surgery, not counted against the lysis.)',
  },
]);

/** Every built-in fibrinolytic rule: a case rule that says a lytic is wrong for its patient lists them in `replaces` */
export const LYTIC_RULES = LYTIC_GATE.harms.map((h) => h.id);

// ─── Antithrombotics and protamine ─────────────────────────────────────────

/** The anticoagulants and the antiplatelet loading doses a tamponade bleeds with (aspirin is the case's to judge) */
const TAMPONADE_ANTITHROMBOTICS = ['heparin', 'bivalirudin', 'gp2b3a', 'cangrelor', 'p2y12'];

/**
 * The antiplatelet and anticoagulant drugs, ranked: heparin with HIT, active bleeding, the dissection, a true aspirin
 * allergy, a tamponade, a low platelet count for eptifibatide, the eptifibatide label's other contraindications, then the
 * combinations
 */
const ANTITHROMBOTIC_GATE = gate([
  {
    id: 'heparin-hit', actions: ['heparin'], applies: (_s, sc) => hasProblem(sc, ['hit']), points: 15, severity: 'critical',
    text: 'Heparin for a patient with heparin-induced thrombocytopenia, now or before. It can set off a new fall in the platelets with clots in the arteries and veins (heparin label; ACCP and ASH: no heparin with HIT): anticoagulate with bivalirudin or argatroban.',
  },
  {
    // a bleed in the head, or a stroke under way that no CT has yet shown is not one: no antithrombotic until the stroke
    // team decides (an ischemic stroke's aspirin comes after the scan)
    id: 'antithrombotic-intracranial', actions: ANTITHROMBOTICS, applies: (_s, sc) => hasProblem(sc, ['intracranial-hemorrhage', 'stroke']), points: 15, severity: 'critical',
    text: 'An antiplatelet or anticoagulant with a bleed in the head, or a stroke under way that no CT has yet shown is not a bleed. It can turn a small bleed into a fatal one (aspirin, P2Y12 inhibitor, heparin, bivalirudin and cangrelor labels: active pathological or intracranial bleeding; AHA/ASA stroke guidelines: no antithrombotic before the scan, and none within 24 hours of thrombolysis): get the CT, and leave the antithrombotic drugs to the stroke team.',
  },
  {
    id: 'antithrombotic-bleeding', actions: ANTITHROMBOTICS, applies: (_s, sc) => hasProblem(sc, ['bleeding']), points: 10, severity: 'major',
    text: 'An antiplatelet or anticoagulant with active bleeding. It keeps the bleeding going (the aspirin, P2Y12 inhibitor, heparin, bivalirudin, eptifibatide and cangrelor labels: contraindicated with active pathological bleeding): hold the antithrombotics, stop the bleeding, and reverse what can be reversed.',
  },
  {
    id: 'antithrombotic-dissection', actions: ANTITHROMBOTICS, applies: (_s, sc) => hasProblem(sc, ['aortic-dissection']), points: 8, severity: 'major',
    text: 'An antiplatelet or anticoagulant in an aortic dissection. It makes the torn aorta bleed — into the chest, the pericardium or the abdomen — and complicates the surgery the patient needs. Tearing pain to the back, a pressure difference between the arms or a new murmur: think dissection before giving antithrombotics.',
  },
  {
    id: 'aspirin-allergy', actions: ['aspirin'], applies: (_s, sc) => hasProblem(sc, ['aspirin-allergy']), points: 10, severity: 'major',
    text: 'Aspirin for a patient with a true aspirin allergy (anaphylaxis, angioedema, hives) or aspirin-exacerbated asthma. It can set off the same reaction: give clopidogrel instead (2014 AHA/ACC NSTE-ACS, kept in the 2025 ACC/AHA ACS guideline).',
  },
  {
    // a tamponade that began mid-case (a perforation: the flag 'tamponade') counts too, drained or not — the blood in the sac
    // is still the reason
    id: 'antithrombotic-tamponade', actions: TAMPONADE_ANTITHROMBOTICS, applies: (s, sc) => hasProblem(sc, ['tamponade']) || has(s, 'tamponade'), points: 8, severity: 'major',
    text: 'An anticoagulant or an antiplatelet loading dose in cardiac tamponade. Blood in the pericardium can be the cause (a dissection, a ruptured wall, a perforation), and the needle that drains it needs blood that clots: an antithrombotic keeps the effusion bleeding and makes the drain riskier. Drain it and find the cause first.',
  },
  {
    // heparin is not held for a count under 100,000 (unfractionated heparin is given for ACS and PCI down to about 50,000,
    // with the dose weighed and the count watched): the 100,000 line is eptifibatide's
    id: 'gp-thrombocytopenia', actions: ['gp2b3a'], applies: (_s, sc) => hasProblem(sc, ['thrombocytopenia']), points: 8, severity: 'major',
    text: 'Eptifibatide with platelets under 100,000. It can drop them further and adds to the bleeding (Integrilin label: contraindicated under 100,000): find the cause of the low count, and leave the GP IIb/IIIa inhibitor out.',
  },
  {
    // the label's stroke is any within 30 days (a recent stroke here means 3 months, which covers it) or one under way now
    id: 'gp-contraindicated', actions: ['gp2b3a'], applies: (_s, sc) => hasProblem(sc, ['intracranial-hemorrhage', 'recent-stroke', 'stroke', 'recent-surgery', 'surgery-within-6-weeks', 'recent-bleeding', 'dialysis']),
    points: 10, severity: 'major',
    text: 'Eptifibatide with a contraindication on its label: a bleed in the head ever, a stroke now or a recent one (the label: within 30 days), major surgery within 6 weeks, bleeding within 30 days, or dialysis (Integrilin label). It doubles the bleeding risk where it is highest — and on dialysis it is not cleared at all.',
  },
  {
    id: 'gp-after-lytic', actions: ['gp2b3a'], applies: (s) => has(s, 'lytic'), points: 8, severity: 'major',
    text: 'Eptifibatide after a fibrinolytic. Together they add major and intracranial bleeding without saving more lives (ASSENT-3, GUSTO V): after lysis, PCI goes ahead with heparin and the oral antiplatelet drugs.',
  },
  {
    id: 'gp-hypertension', actions: ['gp2b3a'], applies: (s) => s.pulse && (s.vitals.sbp > 200 || s.vitals.dbp > 110), points: 5, severity: 'major',
    text: 'Eptifibatide with a systolic over 200 or a diastolic over 110. Severe, uncontrolled hypertension is a contraindication on its label: the risk of a bleed in the brain is too high — bring the pressure down first.',
  },
  {
    id: 'double-anticoagulant', actions: ['heparin'], applies: (s) => has(s, 'bivalirudin'), points: 5, severity: 'major',
    text: 'Heparin on top of a running bivalirudin infusion. Two anticoagulants at once add bleeding and no protection (2025 ACC/AHA ACS): choose one — switching from heparin to bivalirudin is accepted practice, adding heparin to bivalirudin is not.',
  },
  {
    id: 'heparin-after-lmwh', actions: ['heparin'], applies: (_s, sc) => hasProblem(sc, ['lmwh-on-board']), points: 3, severity: 'minor',
    text: 'Unfractionated heparin within 12 hours of enoxaparin. Switching between them adds bleeding (SYNERGY; 2014 AHA/ACC NSTE-ACS: no crossover): for PCI, an extra IV dose of enoxaparin if the last was 8–12 hours ago, none if under 8.',
  },
  {
    // an indication rule (INDICATION_RULES): the ER nurse's missing order covers it. In the lab the PCI is the indication
    id: 'antithrombotic-no-indication', actions: ['heparin', 'p2y12', 'gp2b3a', 'cangrelor', 'bivalirudin'],
    applies: (s, sc) => sc.setting !== 'cathlab' && !anticoagulationIndicated(s, sc), points: 3, severity: 'minor',
    text: 'An anticoagulant or a P2Y12 loading dose with nothing to treat. Heparin is for an acute coronary syndrome, a pulmonary embolism or atrial fibrillation and flutter (around a cardioversion), and a P2Y12 inhibitor for an acute coronary syndrome or a stent (their labels; 2025 ACC/AHA ACS): without one they bring only bleeding — and a P2Y12 load holds the platelets for 5–7 days, through any line, wire or surgery to come.',
  },
]);

/**
 * Something heparin or a P2Y12 inhibitor is given for: an acute coronary syndrome, a pulmonary embolism, AF or flutter (lasting,
 * or on the monitor now), or another reason the case declares ('anticoagulation-indicated')
 */
const anticoagulationIndicated = (s: SimState, sc: Scenario) =>
  hasProblem(sc, ['acs', 'pulmonary-embolism', 'af-over-48h', 'anticoagulation-indicated']) || (s.pulse && ['af', 'flutter'].includes(rhythmKind(s)));

/** Every built-in antithrombotic rule: a case rule that says an antithrombotic is wrong for its patient lists them in `replaces` */
export const ANTITHROMBOTIC_RULES = ANTITHROMBOTIC_GATE.harms.map((h) => h.id);

/**
 * The antithrombotic gate charges this dose: its top rule, or a case rule standing in for that rule (its id, or listing it
 * in `replaces`) that has not charged an earlier dose. For a rule elsewhere that must not add a second penalty to the same
 * dose (e.g. the unguided heparin top-up, rules/added.ts). A stand-in that charged already makes this dose a repeat of
 * that mistake, which costs nothing more: the dose is then left to the next reason that holds
 */
export function antithromboticCharges(s: SimState, sc: Scenario, id: string): boolean {
  const top = ANTITHROMBOTIC_GATE.top(s, sc, id);
  if (!top) return false;
  const standIns = sc.harms.filter((h) => (!h.roles || h.roles.includes(s.role)) && h.actions.includes(id)
    && (h.id === top || !!h.replaces?.includes(top)) && (!h.when || h.when(s, sc, id)));
  return !standIns.length || standIns.some((h) => !chargedBefore(s, h.id));
}

/** Protamine, ranked: an earlier reaction to it, the PCI not finished, no heparin to reverse, then a sensitized patient */
const PROTAMINE_GATE = gate([
  {
    id: 'protamine-allergy', actions: ['protamine'], applies: (_s, sc) => hasProblem(sc, ['protamine-allergy']), points: 10, severity: 'major',
    text: 'Protamine for a patient who reacted to it before. Another dose can bring anaphylaxis, a collapse of the pressure and severe pulmonary hypertension (protamine label: contraindicated after an earlier intolerance; boxed warning): let the heparin wear off, or control the bleeding another way.',
  },
  {
    id: 'protamine-mid-pci', actions: ['protamine'], applies: (s, sc) => has(s, 'wired') && !has(s, 'final-angio') && !hasProblem(sc, ['bleeding']), points: 8, severity: 'major',
    text: 'Protamine with the wire still across and the PCI not finished. Reversing the heparin with hardware in the artery invites a clot on the wire and in a fresh stent: reverse only after the final angiogram, or for bleeding that threatens life.',
  },
  {
    // enoxaparin within 12 hours counts: protamine reverses part of it (2020 ACC expert consensus on bleeding: 1 mg per mg of
    // enoxaparin within 8 hours, 0.5 mg per mg at 8–12)
    id: 'protamine-no-heparin', actions: ['protamine'], applies: (s, sc) => !has(s, 'heparin') && !hasProblem(sc, ['heparin-on-board', 'lmwh-on-board']), points: 5, severity: 'major',
    text: 'Protamine with no heparin to reverse. It reverses heparin — fully for unfractionated heparin, only partly for enoxaparin — and not bivalirudin, cangrelor or eptifibatide; on its own it can drop the pressure, set off a reaction and act as an anticoagulant itself (protamine label, boxed warning).',
  },
  {
    id: 'protamine-sensitized', actions: ['protamine'], applies: (_s, sc) => hasProblem(sc, ['protamine-sensitized']) && !hasProblem(sc, ['bleeding']), points: 5, severity: 'major',
    text: 'Protamine for a patient sensitized to it — NPH or protamine-zinc insulin, an earlier protamine dose, a fish allergy or a vasectomy — with no bleeding that needs it. These, like severe left-ventricular dysfunction or pulmonary hypertension, raise the risk of a severe reaction (protamine label, boxed warning): reverse heparin only for real bleeding, with a small test dose first, then slowly (no more than 50 mg over 10 minutes), with epinephrine at hand.',
  },
]);

/** Every built-in protamine rule: a case rule that says protamine is wrong for its patient lists them in `replaces` */
export const PROTAMINE_RULES = PROTAMINE_GATE.harms.map((h) => h.id);

// ─── Analgesia and sedation ────────────────────────────────────────────────

/**
 * A procedure that needs sedation or analgesia is running or about to start: a cardioversion (a tachyarrhythmia that is
 * unstable — a low pressure — or with the pads already on for the shock; or torsades to be defibrillated), transcutaneous
 * pacing, or the pads on for a rate under 50 that the pacer is about to take. A heart already paced by a transvenous wire
 * needs none, a stable tachycardia being slowed with drugs is no procedure, and a slow rate with no pads on is no procedure
 * yet. In the cath lab the pads are on from the start, so there they say nothing about pacing: only pads the learner puts on
 * for it, or the pacer running, do
 */
export const sedationForProcedure = (s: SimState, sc: Scenario) =>
  (tachyarrhythmia(s) && (lowPressure(s) || has(s, 'pads'))) || rhythmKind(s) === 'torsades' || s.rhythm.profile === 'tcp'
  || (s.rhythm.hr < 50 && !paced(s) && (sc.setting === 'cathlab' ? did(s, 'pads') : has(s, 'pads')));

/**
 * Too unwell to sedate: a low pressure, breathing under 10 a minute, or drowsy (GCS 12 or less) — and no procedure to sedate
 * for, and for midazolam no seizure under way. In the emergency department a drowsy patient with an advanced airway (RSI, or a tube after the arrest) is a ventilated
 * one, sedated for the tube on the physician's decision: no mistake there
 */
export const unsafeToSedate: Check = (s, sc, id) =>
  s.pulse && (lowPressure(s) || s.vitals.rr < 10 || (s.vitals.gcs <= 12 && !(sc.setting === 'ed' && has(s, 'airway')))) && !sedationForProcedure(s, sc)
  // a seizure under way: midazolam is its treatment, given with the airway supported (2016 AES status epilepticus guideline)
  && !(id === 'midazolam' && hasProblem(sc, ['seizure']));

/**
 * A cath-lab procedure is under way: consented, timed out or with a sheath in, and no hemostasis yet. Moderate sedation —
 * a benzodiazepine and an opioid — is part of it (for opioid-no-pain only: the wider procedure test above is for a
 * cardioversion or a pacer)
 */
const labProcedureUnderWay = (s: SimState, sc: Scenario) =>
  sc.setting === 'cathlab' && (has(s, 'consent') || has(s, 'timeout') || has(s, 'access')) && !has(s, 'hemostasis');

/** The opioid (fentanyl), ranked: the breathing first, then the pressure, then whether there is pain to treat */
const OPIOID_GATE = gate([
  {
    id: 'opioid-respiratory', actions: ['fentanyl'], applies: (s, sc) => s.vitals.rr < 10 || (s.vitals.gcs <= 8 && !has(s, 'airway') && !sedationForProcedure(s, sc)),
    points: 5, severity: 'major',
    text: 'An opioid for a patient breathing under 10 a minute, or too drowsy to protect the airway (GCS 8 or less, no airway in place). Fentanyl slows the breathing further and can stop it (label boxed warning: life-threatening respiratory depression): support the breathing and the airway first.',
  },
  {
    id: 'opioid-hypotension', actions: ['fentanyl'], applies: (s, sc) => lowPressure(s) && !sedationForProcedure(s, sc), points: 3, severity: 'minor',
    text: 'An opioid with a systolic under 90 (with an LVAD, a Doppler MAP under 60) and no cardioversion or pacing to give it for. It widens the veins and blunts the drive holding the pressure up (label: severe hypotension): support the pressure first, then small doses, titrated.',
  },
  {
    // an intubated patient (RSI, or a tube after the arrest) feels the tube whatever the pain score says: analgesia first
    // (SCCM PADIS 2018), and promptly after a long-acting paralytic
    // a cath-lab procedure under way (consent, the time-out or a sheath in, no hemostasis yet): fentanyl is part of the
    // moderate sedation for it (ASA 2018 moderate procedural sedation; SCAI cath lab best practices)
    id: 'opioid-no-pain', actions: ['fentanyl'], applies: (s, sc) => s.vitals.pain === 0 && !has(s, 'airway') && !sedationForProcedure(s, sc) && !labProcedureUnderWay(s, sc), points: 3, severity: 'minor',
    text: 'An opioid with no pain to treat, and no cardioversion, pacing, procedure or breathing tube to give it for. Without one it brings only its risks — slower breathing, a lower pressure, nausea — and in an acute coronary syndrome an opioid also slows the oral P2Y12 inhibitor (2025 ACC/AHA ACS).',
  },
], (s) => s.pulse);

/**
 * Every built-in rule for the opioid and the sedatives (midazolam, the paramedic's and the lab's sedation), and the rule for a
 * drug with no role in an arrest: a case rule that says a sedative or an opioid is wrong for its patient lists them in
 * `replaces`
 */
export const SEDATIVE_RULES = [...OPIOID_GATE.harms.map((h) => h.id), 'midazolam-glaucoma', 'midazolam-unsafe', 'sedation-unsafe', 'no-role-in-arrest'];

// ─── The antiemetic ────────────────────────────────────────────────────────

/** Drugs on board that lengthen the QT too (amiodarone, procainamide; sotalol is an action still to come) */
const QT_DRUGS = ['amio-arrest', 'amio-infusion', 'procainamide', 'sotalol'];

/**
 * The patients ondansetron's label says to monitor (Zofran label, QT prolongation: electrolyte abnormalities such as a low
 * potassium or magnesium, congestive heart failure, bradyarrhythmias, other QT-prolonging drugs) — a low calcium lengthens
 * the QT too, and a high potassium belongs on the monitor in its own right
 */
const ondansetronRisk = (s: SimState, sc: Scenario) =>
  hasProblem(sc, ['heart-failure', 'hypokalemia', 'hypomagnesemia', 'hypocalcemia', 'hyperkalemia'])
  || s.rhythm.hr < 50 || AV_BLOCKS.includes(rhythmKind(s)) || QT_DRUGS.some((d) => did(s, d));

export const ACS_RULES: Harm[] = [
  // the emergency department's procedural sedation (ACEP clinical policy: monitoring and capnography)
  { id: 'sedation-unmonitored', actions: ['procedural-sedation'], when: (s) => !has(s, 'monitor'), points: 5, severity: 'major', text: 'Procedural sedation without the cardiac monitor on. Sedation can stop the breathing and drop the pressure: the ECG, pulse oximetry, the blood pressure and capnography run from before the first dose until the patient is awake again.' },
  { id: 'sedation-no-procedure', actions: ['procedural-sedation'], when: (s, sc) => s.pulse && !sedationForProcedure(s, sc), points: 3, severity: 'minor', text: 'Procedural sedation with no procedure that needs it. Deep sedation is for a cardioversion, a shock or pacing in a patient who is awake; without one it only puts the airway, the breathing and the pressure at risk.' },
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
    text: 'Ondansetron without the cardiac monitor on, for a patient its label says to monitor: a low potassium, magnesium or calcium, a failing heart, a slow rate or AV block, or another QT-prolonging drug on board (and a high potassium needs the monitor in its own right). It lengthens the QT: put the monitor on first.',
  },
  ...OPIOID_GATE.harms,
  // sedation before a cardioversion or for the pacer is needed even with a low pressure (a smaller dose, titrated): a case
  // with its own sedation rule says so in its own words
  { id: 'midazolam-glaucoma', actions: ['midazolam'], when: (s, sc) => s.pulse && hasProblem(sc, ['glaucoma']), points: 5, severity: 'major', text: 'Midazolam with acute narrow-angle glaucoma. Its label rules it out there (a benzodiazepine can raise the pressure in the eye): for an agitated patient choose another sedative, and for a procedure ask anesthesia.' },
  { id: 'midazolam-unsafe', actions: ['midazolam'], when: (s, sc, id) => unsafeToSedate(s, sc, id) && !hasProblem(sc, ['glaucoma']), points: 5, severity: 'major', text: 'Midazolam with a low pressure, slow breathing or a drowsy patient, and no cardioversion or pacing to sedate for. A benzodiazepine drops the pressure and the breathing further (label boxed warning: respiratory depression): it is for agitation, seizures or stimulant toxicity in a patient who can take it — here support the pressure and the airway instead.' },
  { id: 'sedation-unsafe', actions: ['sedation'], when: unsafeToSedate, points: 5, severity: 'major', text: 'Sedation with a low pressure, slow breathing or a drowsy patient, and no cardioversion or pacing to sedate for. A sedative drops the pressure and the breathing further (midazolam label boxed warning: respiratory depression, continuous monitoring): sedation is for a procedure in a patient awake enough to feel it — here support the pressure and the airway instead.' },
  ...ANTITHROMBOTIC_GATE.harms,
  ...PROTAMINE_GATE.harms,
];
