import type { Critical, Effect, Line, Scenario, SimState, Vitals } from '../types';
import { atRate, bpAfter, has, line, orderedFlag } from '../kit';
import { askCritical, askEvents, askHarm, type LabAsk } from '../labKit';
import { DOOR_TO_ECG, ED_MD, ED_RN, edNurse, edOrder } from '../edKit';
import { ANTITHROMBOTIC_RULES, NITRATE_RULES, nitrateCaseRule, nitrateRulesExcept } from '../rules/acs';
import { RATE_RULES, yieldToHeavier } from '../rules/rhythm';
import { cpapHarmful } from '../rules/support';

/**
 * Acute type A aortic dissection in the emergency department. A 63-year-old man whose blood pressure has gone untreated
 * for a month walks in with his wife: sudden, worst-ever pain that went through to his back, 196/104 in the right arm and
 * 150/88 in the left, a new early diastolic murmur (the root is stretched and the aortic valve leaks), and a 12-lead with
 * only the LVH of years of high pressure. The chest pain order set is the trap: aspirin, nitroglycerin on its own, heparin,
 * the cath lab, a fibrinolytic.
 *
 * The ER nurse triages, monitors, records the 12-lead, takes the pressure in both arms and reports it, places two
 * large-bore lines, draws the labs with a type and crossmatch, holds the aspirin, gives the drugs the (computer) ED
 * physician orders — the beta-blocker first, the opioid, then the vasodilator — takes him to the scanner on the monitor
 * and hands him to the surgical team. The ER doctor suspects it (the history, both arms, the murmur), scans the root and
 * the pericardium, starts anti-impulse therapy (2022 ACC/AHA: an IV beta-blocker first to a heart rate of 60–80, then a
 * vasodilator for a systolic under 120, and an IV opioid), orders the CT angiogram, gives no antithrombotic, fibrinolytic
 * or cath lab, and calls the cardiac surgeon (emergency surgery, COR 1); a computer nurse does the nursing.
 *
 * Delay matters: without rate control the tear spreads to the gut and the left leg (minute 20); left in the department it
 * bleeds into the pericardium (minute 40, or 55 with the rate and pressure controlled; minutes after heparin or a
 * fibrinolytic), and 10 minutes later his heart stops.
 *
 * The IV beta-blockers are metoprolol (one action stands for the titrated doses), esmolol and labetalol; the vasodilator is
 * the nicardipine infusion — sublingual nitroglycerin, which the case accepted before the infusion had an action of its
 * own, still brings the pressure toward the goal (RATE_DRUGS and VASODILATORS below).
 *
 * The hospital is a high-volume cardiac surgery center: the 2022 guideline's transfer of a stable type A patient to an
 * aortic center is for hospitals without one, so here the surgeon on call is the answer and a transfer only loses time.
 */

/** What the flap takes off the left arm's pressure (the right arm, the higher one, is the pressure that is treated) */
const LEFT_DROP = { sbp: 46, dbp: 16 };

/** A pressure that is already high can still be driven higher (bpAfter's default ceiling would hide the rise) */
const HIGH = { sbp: 230, dbp: 130 };

/** The nurse's run: the ED physician comes to see a new ESI 2 chest pain by this minute, called or not */
const MD_ARRIVES = 8;
/** The nurse's run: from the physician's CT order until the patient is back from the scanner */
const CT_MINUTES = 10;
/** From the cardiac surgeon's call until the operating room and anesthesia are ready */
const OR_MINUTES = 20;

/** With nothing slowing the heart, the tear runs on down the aorta (the gut, the left leg) */
const EXTENDS_AT = 20;
/** It bleeds into the pericardium: untreated by 40 minutes; with the rate and pressure controlled, later (still in the department) */
const BLEEDS_UNTREATED = 40;
const BLEEDS_TREATED = 55;
/** An anticoagulant or a fibrinolytic makes the tear bleed sooner */
const HEPARIN_BLEED = 10;
const LYTIC_BLEED = 4;
/** Minutes of tamponade before the heart stops, if he is still in the department */
const ARREST_AFTER = 10;

/** IV drugs that control the rate first (2022 ACC/AHA: a beta-blocker; a non-dihydropyridine calcium-channel blocker if one cannot be used) */
const RATE_DRUGS = ['metoprolol', 'esmolol', 'labetalol', 'diltiazem'];
/** Vasodilators for a systolic still over 120 once the rate is controlled */
const VASODILATORS = ['nitro', 'nitro-high', 'nitro-iv', 'nicardipine'];
/** What makes the tear bleed (the fibrinolytics are the built-in rule's: 'lytic-dissection') */
const ANTITHROMBOTICS = ['aspirin', 'heparin', 'p2y12'];
const ANTITHROMBOTIC_NAMES: [string, string][] = [['aspirin', 'aspirin'], ['heparin', 'heparin'], ['p2y12', 'a P2Y12 inhibitor']];

// ─── State ───────────────────────────────────────────────────────────────

/** A low pressure: a systolic under 90 in the right arm (the engine's own drug rules use the same line) */
const low = (s: SimState) => s.vitals.sbp < 90;
/** The tear has bled into the pericardium */
const bled = (s: SimState) => has(s, 'tamponade');
/**
 * In shock: a low pressure, or the tamponade under way even after a bolus has brought the systolic back over 90 — the
 * pressure is then held up by the fluid and a fast rate, and the rate drugs, the vasodilator and the CT are still wrong
 * while a small bolus is right
 */
const shock = (s: SimState) => low(s) || bled(s);

/** The highest the right arm's systolic is taken with fluid in the tamponade: a bridge to the surgeon, not a normal pressure */
const SHOCK_FLUID_CEILING = { sbp: 104, dbp: 72 };
/** Still in the department: the hand-off to the operating room (or anywhere) ends the case */
const inDepartment = (s: SimState) => !has(s, 'handoff');

/**
 * An item that is right only before the bleed (rate control, the opioid, the vasodilator, the scan): it counts if it was
 * done before it, and stops applying once the patient is in shock without it — then the operating room is the treatment
 */
const beforeBleed = (s: SimState, flag: string) => !bled(s) || (has(s, flag) && s.flags[flag] <= s.flags.tamponade);

/** The minute the tear bleeds into the pericardium if he is still in the department */
function bleedsAt(s: SimState): number {
  const at = [has(s, 'rate-controlled') ? BLEEDS_TREATED : BLEEDS_UNTREATED];
  if (has(s, 'heparin')) at.push(s.flags.heparin + HEPARIN_BLEED);
  if (has(s, 'lytic')) at.push(s.flags.lytic + LYTIC_BLEED);
  return Math.min(...at);
}

/** The left arm, past the flap: lower than the right by LEFT_DROP; too faint to hear once the right is low */
function leftArm(v: Pick<Vitals, 'sbp' | 'dbp'>): string {
  const sbp = v.sbp - LEFT_DROP.sbp;
  if (sbp < 60) return 'too faint to hear';
  return `${sbp}/${Math.min(v.dbp - LEFT_DROP.dbp, sbp - 10)}`;
}

/** The rate and the right-arm pressure after a drug: on the monitor once it is on, otherwise the nurse's own recheck */
function pressures(s: SimState, hr: number, bp: { sbp: number; dbp: number }, tone?: Line[2]): Line {
  return has(s, 'monitor')
    ? line('monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`, tone)
    : line(edNurse(s), `Pulse ${hr}; right arm BP ${bp.sbp}/${bp.dbp}.`, tone);
}

/** Only a patient awake enough to talk says how a drug feels */
const awake = (s: SimState, text: string, tone?: Line[2]): Line[] => (s.pulse && s.vitals.gcs >= 13 ? [line('patient', text, tone)] : []);

/**
 * Who gives a drug: the learner as the ER nurse; the computer nurse on the ER doctor's order; or the ED physician, when the
 * nurse has not carried out an order in time
 */
type By = 'learner' | 'physician';
function giver(s: SimState, by: By, text: string): Line {
  if (by === 'physician') return ['physician', `${text}.`];
  return s.role === 7 ? ['nurse', `${text} — in, on your order.`] : ['you', `${text}.`];
}

// ─── What the drugs do ───────────────────────────────────────────────────

/** Fentanyl: the pain drives his rate and pressure, so relieving it brings both down; in shock it only drops the pressure */
function fentanyl(s: SimState, by: By): Effect | null {
  if (!s.pulse) return null;
  if (shock(s)) {
    const bp = bpAfter(s, -8, -4);
    return { say: [giver(s, by, 'Fentanyl 50 mcg IV'), pressures(s, s.rhythm.hr, bp, 'bad')], vitals: { ...bp, pain: Math.max(2, s.vitals.pain - 3) }, flags: ['analgesia'] };
  }
  const pain = Math.max(2, s.vitals.pain - 4);
  const bp = bpAfter(s, -14, -6);
  const hr = s.rhythm.hr > 66 ? Math.max(66, s.rhythm.hr - 6) : s.rhythm.hr;
  const rr = Math.min(s.vitals.rr, Math.max(12, s.vitals.rr - 2));
  return {
    say: [giver(s, by, 'Fentanyl 50 mcg IV'), ...awake(s, pain <= 3 ? '"That\'s much better… I feel a bit floaty."' : '"That takes the edge off."'), pressures(s, hr, bp)],
    vitals: { ...bp, pain, rr }, rhythm: atRate(s, hr), flags: ['analgesia'],
  };
}

/**
 * The IV beta-blocker (or diltiazem when one cannot be used): titrated to a rate of 60–80, it cuts the force of each beat
 * on the torn wall and brings the pressure down with it. One action stands for the titrated doses. In shock, or with the
 * rate already slow, it takes away the rate that is holding up his output; on top of another rate drug it overshoots
 */
function rateDrug(s: SimState, by: By, id: 'metoprolol' | 'esmolol' | 'labetalol' | 'diltiazem'): Effect | null {
  if (!s.pulse) return null;
  const text = {
    metoprolol: 'Metoprolol 5 mg IV over 2 minutes, then 5 mg every 5 minutes to the rate goal: 15 mg in all',
    esmolol: 'Esmolol 500 mcg/kg IV over 1 minute, then the infusion titrated to the rate goal',
    labetalol: 'Labetalol 20 mg IV over 2 minutes, then 40 mg to the rate goal',
    diltiazem: 'Diltiazem 0.25 mg/kg IV over 2 minutes',
  }[id];
  const flag = id === 'diltiazem' ? 'diltiazem' : 'beta-blocker';
  if (shock(s) || s.vitals.sbp < 100 || s.rhythm.hr < 60) {
    const bp = bpAfter(s, -14, -8);
    const hr = Math.max(48, s.rhythm.hr - 14);
    return { say: [giver(s, by, text), pressures(s, hr, bp, 'bad'), ...awake(s, '"I feel faint…"', 'bad')], vitals: bp, rhythm: atRate(s, hr), flags: [flag] };
  }
  if (has(s, 'rate-controlled')) {
    const bp = bpAfter(s, -10, -6);
    const hr = Math.max(52, s.rhythm.hr - 12);
    return { say: [giver(s, by, text), pressures(s, hr, bp, 'warn')], vitals: bp, rhythm: atRate(s, hr), flags: [flag] };
  }
  const goal = id === 'diltiazem' ? 72 : 66;
  const hr = s.rhythm.hr > goal ? goal : Math.max(60, s.rhythm.hr - 6);
  const bp = bpAfter(s, -18, -10);
  return {
    say: [giver(s, by, text), pressures(s, hr, bp)],
    vitals: bp, rhythm: atRate(s, hr), flags: [flag, 'rate-controlled', ...(bp.sbp > 120 ? ['needs-vasodilator'] : [])],
  };
}

/**
 * Nitroglycerin, the vasodilator. Before the rate is controlled it makes the heart race (reflex tachycardia) and pound
 * harder against the tear, and does nothing for this pain; once the rate is controlled it brings the pressure toward the
 * goal. With the systolic already at 120 or less it overshoots; with a low pressure the engine's own rule answers
 */
function vasodilator(s: SimState, by: By, drug: 'nitro' | 'nitro-high' | 'nitro-iv' | 'nicardipine'): Effect | null {
  if (!s.pulse || low(s)) return null;
  const high = drug === 'nitro-high' || drug === 'nicardipine';
  const dose = {
    nitro: 'Nitroglycerin 0.4 mg sublingual', 'nitro-high': 'Nitroglycerin 0.8 mg sublingual',
    'nitro-iv': 'Nitroglycerin infusion IV at 10 mcg/min, titrated up 10 mcg/min every 3–5 minutes',
    nicardipine: 'Nicardipine infusion at 5 mg/h, titrated up 2.5 mg/h every 5–15 minutes',
  }[drug];
  const flags = { nitro: ['nitro'], 'nitro-high': ['nitro', 'nitro-high'], 'nitro-iv': ['nitro', 'nitro-iv'], nicardipine: ['vasodilator', 'nicardipine'] }[drug];
  // in the tamponade a bolus may hold the systolic over 90, and a nitrate takes it away again
  if (bled(s)) {
    const bp = bpAfter(s, high ? -20 : -14, high ? -10 : -8);
    return { say: [giver(s, by, dose), ...awake(s, '"I\'m going to pass out…"', 'bad'), pressures(s, s.rhythm.hr, bp, 'bad')], vitals: bp, flags };
  }
  if (!has(s, 'rate-controlled')) {
    const bp = bpAfter(s, high ? -20 : -12, high ? -10 : -6);
    const hr = Math.min(130, s.rhythm.hr + (high ? 16 : 12));
    const physician: Line[] = s.role === 6 && has(s, 'md-here') && by === 'learner'
      ? [['physician', `"Hold the ${drug === 'nicardipine' ? 'nicardipine' : 'nitroglycerin'} — his rate first. On its own it makes his heart race and pound harder; the metoprolol goes in before any vasodilator."`, 'warn']]
      : [];
    return {
      say: [giver(s, by, dose), ...awake(s, '"It\'s not touching the pain — and now my heart is pounding."', 'bad'), pressures(s, hr, bp, 'bad'), ...physician],
      vitals: bp, rhythm: atRate(s, hr), flags: [...flags, 'reflex'],
    };
  }
  const atGoal = s.vitals.sbp <= 120;
  const bp = bpAfter(s, high ? -28 : -20, high ? -14 : -10);
  return {
    say: [giver(s, by, dose), ...awake(s, atGoal ? '"I feel light-headed…"' : '"A bit of a headache. The pain\'s no worse."', atGoal ? 'bad' : undefined), pressures(s, s.rhythm.hr, bp, atGoal ? 'bad' : undefined)],
    vitals: bp, flags: atGoal ? flags : [...flags, 'vasodilated'],
  };
}

/** Pressors and push-dose epinephrine: with a pressure this high they only drive it higher, and the heart harder */
function pressorEffect(s: SimState, flag: string): Effect | null {
  if (!s.pulse || shock(s)) return null;
  const bp = bpAfter(s, 20, 10, HIGH);
  const hr = Math.min(140, s.rhythm.hr + 10);
  return {
    say: [giver(s, 'learner', flag === 'pressor' ? 'Norepinephrine infusion running' : 'Push-dose epinephrine 20 mcg IV'), ...awake(s, '"It\'s tearing worse — oh, my back!"', 'bad'), pressures(s, hr, bp, 'bad')],
    vitals: { ...bp, pain: 10 }, rhythm: atRate(s, hr), flags: [flag],
  };
}

// ─── What the tests show ─────────────────────────────────────────────────

const LABS_SENT = 'Labs sent: high-sensitivity troponin, CBC, electrolytes and creatinine (for the contrast), coagulation and lactate — with a type and crossmatch for 4 units of red cells, in case he goes to the operating room.';
/** The ER nurse's labs before the physician has seen him: the chest pain order set's, with no blood ordered yet */
const LABS_PROTOCOL = 'Labs sent on the chest pain order set: high-sensitivity troponin, CBC, electrolytes and creatinine, coagulation and lactate — and an extra set of tubes held in the lab, so the physician can add tests without another stick.';
const LABS_BACK = 'Labs back: high-sensitivity troponin 8 ng/L (normal); hemoglobin 13.8 g/dL; creatinine 1.0 mg/dL; potassium 4.1 mmol/L; lactate 1.6 mmol/L; INR 1.0. Type and crossmatch: 4 units ready.';

/** The radiologist's read of the CT angiogram (the ER doctor ordered it) */
function ctRead(s: SimState): string {
  return `Radiology, CT angiography of the chest, abdomen and pelvis: an intimal flap that starts just above the aortic valve in a 4.9 cm ascending aorta and runs through the arch and down the descending aorta to both iliac arteries, with a true and a false lumen. The left subclavian artery fills from the false lumen; both coronary arteries fill from the true lumen. ${bled(s) ? 'A moderate pericardial effusion' : 'A small pericardial effusion'}; no free blood around the aorta.`;
}

/** The same scan, read to the ER nurse on the way back from the scanner (in the findings' words) */
const CT_FOR_NURSE = 'Radiology: a flap that starts just above the valve and runs through the arch all the way down to both iliac arteries, with a true and a false lumen; the left subclavian artery fills from the false lumen; a small pericardial effusion.';

// ─── The ED physician's orders (the ER nurse's run) ──────────────────────

const RN_BETA: LabAsk = edOrder({
  id: 'rn-beta',
  when: (s) => has(s, 'md-here') && has(s, 'iv') && s.pulse && !bled(s) && !has(s, 'rate-controlled'),
  ask: '"Metoprolol 5 milligrams IV now, then 5 every 5 minutes up to 15 — I want his heart rate 60 to 80. Hold it if his systolic goes under 100 or his rate under 60."',
  accept: ['metoprolol'],
  // he can take a beta-blocker: diltiazem is the drug for one who cannot, and it is not what was ordered
  wrong: ['diltiazem'],
  wrongSay: '"Diltiazem? I ordered metoprolol — he has no reason not to take a beta-blocker. Read the order back before you give it."',
  thanks: '"Thanks. The rate first — then we bring the pressure down."',
  fallback: '"I\'ll see to his rate myself."',
  // never a second rate drug on top of one already in (the nurse's diltiazem)
  fallbackEffect: (s) => (has(s, 'rate-controlled') ? { say: [['physician', '"It is already down — no metoprolol on top of what he has had."']] } : rateDrug(s, 'physician', 'metoprolol') ?? {}),
  gives: 'beta-done',
  label: 'IV beta-blocker on the physician\'s order: the rate first',
  why: 'Slowing the heart cuts the force of each beat on the torn wall (2022 ACC/AHA: an IV beta-blocker first, to a heart rate of 60–80). Read the order back with its hold parameters, give it, and watch the rate and the pressure after each dose.',
  points: 10,
});

const RN_FENTANYL: LabAsk = edOrder({
  id: 'rn-fentanyl',
  when: (s) => has(s, 'md-here') && has(s, 'iv') && s.pulse && !bled(s) && !has(s, 'analgesia'),
  ask: '"Fentanyl 50 micrograms IV for his pain, please — the pain is pushing his pressure up too."',
  accept: ['fentanyl'],
  thanks: '"Thanks."',
  fallback: '"I\'ll give the fentanyl myself."',
  fallbackEffect: (s) => fentanyl(s, 'physician') ?? {},
  gives: 'fentanyl-done',
  // one dose: more needs another order
  doses: 1,
  label: 'IV opioid for the pain, on the physician\'s order',
  why: 'Pain drives his heart rate and pressure, and both tear the wall further: the opioid is part of the treatment (2022 ACC/AHA).',
  points: 5,
});

const RN_VASODILATOR: LabAsk = edOrder({
  id: 'rn-vasodilator',
  when: (s) => has(s, 'md-here') && has(s, 'rate-controlled') && has(s, 'needs-vasodilator') && !has(s, 'vasodilated') && s.pulse && !bled(s) && s.vitals.sbp > 120,
  ask: '"His rate is controlled. Now the pressure: a nicardipine infusion at 5 milligrams an hour, or nitroglycerin 0.4 milligrams sublingual — I want his systolic between 100 and 120."',
  accept: ['nicardipine', 'nitro'],
  // twice the ordered dose is a medication error, whatever the drug
  wrong: ['nitro-high'],
  wrongSay: '"That was 0.8 — I ordered 0.4. Read the dose back before you give it."',
  thanks: '"Thanks — rate and pressure both coming into range."',
  fallback: '"I\'ll see to his pressure myself."',
  // never a second vasodilator on top of one already in (the nurse's double dose)
  fallbackEffect: (s) => (has(s, 'vasodilated') ? { say: [['physician', '"It is coming down on what he has had — nothing more for now."']] } : vasodilator(s, 'physician', 'nicardipine') ?? {}),
  gives: 'vasodilator-done',
  label: 'The vasodilator on order, once the rate is controlled',
  why: 'With the rate at 60–80, a vasodilator brings the systolic under 120 without a reflex surge in the heart rate (2022 ACC/AHA). Give it only after the beta-blocker, at the dose ordered, and recheck the pressure in the higher arm.',
  points: 10,
});

/** The physician's drug orders, in the order they are given: the rate first, the pain, then the pressure */
const RN_ORDERS = [RN_BETA, RN_FENTANYL, RN_VASODILATOR];

/** Drugs the physician orders here that the nurse may give only on that order (engine RN_ORDER_ONLY), as the physician names them */
const UNORDERED_NAMES: [string, string][] = [
  ['metoprolol', 'metoprolol'], ['esmolol', 'esmolol'], ['labetalol', 'labetalol'], ['diltiazem', 'diltiazem'], ['nicardipine', 'nicardipine'], ['fentanyl', 'fentanyl'],
];

/** The nurse gave one of these before anyone ordered it (the chest pain standing order covers none of them) */
const givenUnordered = (s: SimState, ids: string[]) => s.performed.some((p) => ids.includes(p.id) && !(s.flags[orderedFlag(p.id)] <= p.minute));

/**
 * The nurse's item for an order. A drug that needs one, given before it, still leaves the order's item to count (as
 * missed): otherwise the item would drop out with the order the physician no longer needs to give, and acting alone
 * would score better than carrying the order out late
 */
function rnOrderCritical(a: LabAsk, unordered: string[]): Critical {
  const c = askCritical(a);
  return { ...c, applies: (s) => c.applies!(s) || givenUnordered(s, unordered) };
}

export const edDissection: Scenario = {
  id: 'aortic-dissection-ed',
  title: 'Chest pain at the triage desk',
  summary: '63-year-old man who walked in with sudden, severe chest pain and a very high blood pressure. The 12-lead is not the whole story: find what is causing the pain before the chest pain order set treats the wrong thing.',
  setting: 'ed',
  roles: [6, 7],
  difficulty: 'intermediate',
  conditionId: 'aortic-dissection',
  briefing: {
    default: [
      ['team', 'Emergency department triage desk. A 63-year-old man walks in with his wife, pale and sweating, one hand pressed to his chest and the other reaching round to his back. His wife: "It hit him all at once, about forty minutes ago, in front of the television. He wouldn\'t let me call an ambulance."'],
      ['hospital', 'This hospital has a cath lab, a high-volume cardiac surgery program on call around the clock and a cardiac ICU.'],
    ],
    6: [
      ['team', 'Emergency department triage desk. A 63-year-old man walks in with his wife, pale and sweating, one hand pressed to his chest and the other reaching round to his back. His wife: "It hit him all at once, about forty minutes ago, in front of the television. He wouldn\'t let me call an ambulance."'],
      ['team', 'You are his nurse: triage, the monitor, the 12-lead, his lines and labs, the drugs the ED physician orders, and every finding reported to the physician. The chest pain standing order covers aspirin, nitroglycerin 0.4 mg, oxygen, the monitor, the 12-lead, an IV, labs and the chest film. A monitored bed is open.'],
      ['hospital', 'This hospital has a cath lab, a high-volume cardiac surgery program on call around the clock and a cardiac ICU.'],
    ],
    7: [
      ['team', 'The triage nurse brings a 63-year-old man straight back to bed 5: he walked in with his wife, pale and sweating, one hand pressed to his chest and the other reaching round to his back. His wife: "It hit him all at once, about forty minutes ago, in front of the television. He wouldn\'t let me call an ambulance."'],
      ['team', 'You are the ED physician: the diagnosis, every order and where he goes are yours. His nurse does the nursing — the monitor, the lines and labs, and the drugs you order.'],
      ['hospital', 'This hospital has a cath lab, a high-volume cardiac surgery program on call around the clock and a cardiac ICU.'],
    ],
  },
  initial: {
    // the 'aortic-dissection' profile: sinus with the LVH and strain of years of high pressure, no STEMI. Under 100 so the
    // tracing is read as what it is (LVH), not as a sinus tachycardia
    rhythm: { profile: 'aortic-dissection', hr: 98 },
    vitals: { sbp: 196, dbp: 104, spo2: 96, rr: 22, etco2: 34, pain: 10, gcs: 15, glucose: 128, temp: 36.8 },
  },
  // the built-in antithrombotic and fibrinolytic rules read it (this case words its own for the antithrombotics)
  problems: ['aortic-dissection'],
  facts: {
    opqrst: 'It hit me all at once, sitting in my chair — like something tearing in my chest and going straight through to my back, between the shoulder blades. The worst pain of my life, 10 out of 10 from the very first second. Nothing makes it better or worse. Now it\'s creeping lower down my back.',
    sample: 'No allergies. High blood pressure for years — amlodipine and lisinopril, but I stopped taking them a month ago. A cholesterol pill. I smoked for thirty years; quit last year. No blood thinners, no heart trouble that I know of. Dinner at six.',
    pde5: '"No, nothing like that."',
    bpArms: (s) => {
      const left = leftArm(s.vitals);
      return left === 'too faint to hear'
        ? `Right arm ${s.vitals.sbp}/${s.vitals.dbp} · left arm too faint to hear. The left radial pulse is barely there.`
        : `Right arm ${s.vitals.sbp}/${s.vitals.dbp} · left arm ${left}: ${LEFT_DROP.sbp} mmHg lower on the left. The left radial pulse is weaker than the right.`;
    },
    // the root is stretched and the valve leaks: a new early diastolic murmur; blood in the pericardium muffles the sounds
    lungs: (s) => (bled(s)
      ? 'Lungs clear and equal. The heart sounds are muffled now.'
      : 'Lungs clear and equal. Over the heart: a soft, high-pitched, blowing murmur right after the second heart sound, loudest down the right side of the breastbone (the root, not the valve, is stretched) — his wife says no doctor has ever mentioned a murmur.'),
    perfusion: (s) => {
      if (!s.pulse) return 'No pulse.';
      const legs = has(s, 'extended') ? 'the right femoral and foot pulses present; the left femoral and foot pulses gone, the left leg cool and mottled' : 'femoral and foot pulses present and equal';
      if (bled(s)) return `Gray, cool and clammy; neck veins distended; a fast, thready right radial pulse, the left one gone; ${legs}.`;
      return `Pale and sweaty; no JVD. Right radial pulse strong; left radial pulse weaker; ${legs}.`;
    },
    neuro: (s) => (has(s, 'extended')
      ? 'Alert and oriented. Face, speech and arms normal; his left leg is numb and weak.'
      : 'Alert and oriented. Face, speech, strength and sensation normal in all four limbs.'),
    // what the profile draws: tall LVH voltages and inverted lateral and inferior T waves; no ST shift
    ecg12: (s) => `Sinus ${s.rhythm.hr > 100 ? 'tachycardia' : 'rhythm'} ${s.rhythm.hr} with left ventricular hypertrophy: tall QRS voltages, and T waves inverted in I, II, aVF, aVL and V4–V6 (a strain pattern) — the thick heart muscle of years of high blood pressure. No ST elevation anywhere, so it does not meet STEMI criteria. A 12-lead like this does not show what is causing his pain.`,
    // the crossmatch is the physician's order: the nurse's labs before the physician has seen him are the order set's
    labs: (s) => (s.role === 6 && !has(s, 'md-here') ? LABS_PROTOCOL : LABS_SENT),
    troponin: 'Repeat high-sensitivity troponin: 9 ng/L — no rise from the first.',
    cxr: 'Portable chest X-ray: the upper mediastinum is wide and the aortic knob blurred; the heart is not enlarged; the lungs are clear, with no pneumothorax. A normal film would not have ruled anything out.',
    pocus: (s) => (bled(s)
      ? 'Bedside ultrasound: the aortic root is 4.8 cm with a flap flickering inside it; a moderate pericardial effusion now, with the right ventricle collapsing in diastole; the IVC is plump and does not narrow with breathing.'
      : 'Bedside ultrasound: the aortic root is wide — 4.8 cm — with a thin, mobile flap flickering just above the valve; color flow shows a jet of aortic regurgitation; a small pericardial effusion, with no collapse of the right heart; both ventricles squeeze well; the lungs slide, with A-lines.'),
    ct: ctRead,
    // the consultant answers what the doctor brings: a nudge to look before the findings are in, the surgeon once they are.
    // The anti-impulse plan stays the doctor's decision
    consult: (s) => (has(s, 'bp-arms') || has(s, 'pocus') || has(s, 'ct')
      ? 'Cardiology: "Tearing pain through to the back, a difference between the arms and what you have seen — that is not a coronary problem, and it is not mine: it is the cardiac surgeon he needs, now. No aspirin, no heparin, no cath lab."'
      : 'Cardiology: "Sudden pain going through to his back, that pressure and no ST elevation? Before anyone calls it a heart attack: the pressure in both arms, a listen for a new murmur and a look at his aortic root. Call me back with what you find — and nothing that thins his blood until then."'),
  },
  status: (s) => {
    if (!s.pulse) return 'Unresponsive.';
    const p = s.vitals.pain;
    if (bled(s)) return '"I feel like I\'m going to pass out…"';
    if (has(s, 'extended')) return `"It's down in my belly now — and I can't feel my left leg." Pain ${p} out of 10.`;
    if (p >= 7) return `"It's still tearing through to my back — ${p} out of 10."`;
    if (p >= 4) return `"Easier — ${p} out of 10. It's still there between my shoulder blades."`;
    return `"Much better — ${p} out of 10, a dull ache in my back."`;
  },
  respond: {
    // the cuffs are on the right arm, the higher one: the pressure that is treated
    vitals: (s) => (s.pulse ? { say: [['you', `BP ${s.vitals.sbp}/${s.vitals.dbp} in the right arm · pulse ${s.rhythm.hr} · RR ${s.vitals.rr} · SpO₂ ${s.vitals.spo2}%`]], flags: ['bp'] } : null),
    iv: (s) => {
      if (!s.pulse) return { say: [['you', 'IV established: 18 G, right antecubital fossa.']], flags: ['iv'] };
      // the physician may have put the first one in (the nurse was slow): this is the second
      if (has(s, 'iv')) return { say: [['you', 'A second large-bore IV: 18 G in the other antecubital fossa. Two lines now.']], flags: ['iv'] };
      return { say: [['you', 'Two large-bore IVs: an 18 G in each antecubital fossa — the right one for the CT contrast.']], flags: ['iv'] };
    },
    fentanyl: (s) => fentanyl(s, 'learner'),
    metoprolol: (s) => rateDrug(s, 'learner', 'metoprolol'),
    esmolol: (s) => rateDrug(s, 'learner', 'esmolol'),
    labetalol: (s) => rateDrug(s, 'learner', 'labetalol'),
    diltiazem: (s) => rateDrug(s, 'learner', 'diltiazem'),
    nitro: (s) => vasodilator(s, 'learner', 'nitro'),
    'nitro-high': (s) => vasodilator(s, 'learner', 'nitro-high'),
    'nitro-iv': (s) => vasodilator(s, 'learner', 'nitro-iv'),
    nicardipine: (s) => vasodilator(s, 'learner', 'nicardipine'),
    // fluid for a pressure of 196 pushes it higher; in shock a small bolus is the bridge to the operating room
    fluid: (s) => {
      if (!s.pulse) return null;
      if (shock(s)) {
        const bp = bpAfter(s, 10, 6, SHOCK_FLUID_CEILING);
        return { say: [giver(s, 'learner', 'Normal saline 250 mL bolus'), pressures(s, s.rhythm.hr, bp)], vitals: bp, flags: ['fluid'] };
      }
      const bp = bpAfter(s, 8, 4, HIGH);
      return {
        say: [giver(s, 'learner', 'Normal saline bolus'), ...awake(s, '"The tearing is worse again."', 'bad'), pressures(s, s.rhythm.hr, bp)],
        vitals: { ...bp, pain: Math.min(10, s.vitals.pain + 2) }, flags: ['fluid'],
      };
    },
    'push-epi': (s) => pressorEffect(s, 'push-epi'),
    pressor: (s) => pressorEffect(s, 'pressor'),
    // the interventional cardiologist turns it down, and says why
    'cath-lab-activate': (s) => {
      if (!has(s, 'ecg12')) return null;
      const why = has(s, 'bp-arms')
        ? 'And with sudden pain tearing through to the back and a pressure difference between the arms, think of his aorta before any cath lab, heparin or antiplatelet: image his chest.'
        : 'And with sudden pain going through to the back, check the pressure in both arms and think of his aorta before any cath lab, heparin or antiplatelet.';
      return { say: [['consultant', `The interventional cardiologist calls back: "His 12-lead shows LVH with strain and no ST elevation that meets STEMI criteria — I am not bringing the team in. ${why}"`, 'warn']], flags: ['alert-declined'] };
    },
    // the scanner: what radiology sees; in shock he is no patient for it (the operating room, and its echo, is)
    'ct-urgent': (s) => {
      if (!s.pulse) return null;
      if (shock(s)) {
        const bp = { sbp: Math.min(s.vitals.sbp, 68), dbp: Math.min(s.vitals.dbp, 44) };
        return {
          say: [['team', 'On the scanner table his pressure falls to 68 and he stops answering; the team rushes him back to the resuscitation bay.', 'bad'], ['hospital', ctRead(s)]],
          vitals: { ...bp, gcs: 12 }, flags: ['ct'],
        };
      }
      return { say: [['team', `Scanned and back: he went with a nurse on the monitor${has(s, 'rate-controlled') ? ', his drugs running' : ''}.`], ['hospital', ctRead(s)]], flags: ['ct'] };
    },
    // the treatment is the operating room: the surgeon comes in (and asks for the CT, if the patient is stable enough)
    'call-surgery': (s) => {
      if (!s.pulse) return null;
      const want = has(s, 'ct')
        ? 'A flap from just above the valve — he\'s mine. I\'m on my way in; the operating room and anesthesia are being set up, about 20 minutes.'
        : has(s, 'pocus')
          ? 'A flap at the root on your scan — he\'s mine until the CT says otherwise. I\'m coming in and the operating room is being set up, about 20 minutes. Get the CT angiogram now while he is stable enough to go.'
          : 'Tearing pain to the back and a difference between the arms — I\'m coming in, and the operating room is being set up, about 20 minutes. Get me a CT angiogram while he is stable enough to go.';
      const now = bled(s) ? 'He\'s bleeding around the heart — bring him straight up; we open now.' : `${want} Keep his heart rate 60 to 80 and his systolic under 120, and nothing that thins his blood.`;
      const aspirin = has(s, 'aspirin') || has(s, 'heparin') || has(s, 'p2y12') ? ' He has had an antithrombotic: we\'ll have platelets ready, and he will bleed more.' : '';
      return {
        say: [['hospital', `Cardiac surgery: "${now}${aspirin}"`]],
        flags: ['surgery-called', 'or-called', 'dispo'], timers: { orReady: s.minute + (bled(s) ? 0 : OR_MINUTES) },
      };
    },
    // the hospital has its own cardiac surgeon: a transfer would only add hours
    transfer: (s) => {
      if (!s.pulse) return null;
      return { say: [['hospital', 'Transfer center: "This hospital has a high-volume cardiac surgery program, and the surgeon on call tonight is a page away. There is nowhere better to send him: call the surgeon."', 'warn']], flags: ['transfer-declined'] };
    },
    // a needle in the pericardium of a torn aorta: little to drain before the bleed, and a restarted bleed after it
    pericardiocentesis: (s) => {
      if (s.role !== 7) return null;
      // in the arrest it is a last try, and the tear fills the sac as fast as it drains
      if (!s.pulse && bled(s)) {
        const how = has(s, 'pocus') ? 'Drain in under ultrasound during the pulse check' : 'Needle below the xiphoid during the arrest, aimed at the left shoulder';
        return { say: [['you', `${how}: blood comes back, and keeps coming — the sac fills again as fast as it drains. Still no pulse.`, 'bad']], flags: ['pericardiocentesis'] };
      }
      if (!s.pulse || !has(s, 'pocus')) return null;
      if (!bled(s)) return { say: [['you', 'Needle in under ultrasound: only a thin rim of fluid, and what comes back is blood. Drain left in.', 'bad']], flags: ['pericardiocentesis'] };
      const bp = { sbp: Math.min(s.vitals.sbp, 76), dbp: Math.min(s.vitals.dbp, 52) };
      return {
        say: [['you', 'Drain in under ultrasound: 60 mL of blood out, and the pressure climbs to 110 — then the drain keeps filling with fresh blood.', 'bad'], pressures(s, s.rhythm.hr, bp, 'bad')],
        vitals: bp, flags: ['pericardiocentesis'],
      };
    },
    // the nurse's report: what the physician does with it depends on what the nurse has found
    'notify-physician': (s) => {
      if (s.role !== 6 || !s.pulse) return null;
      if (bled(s)) return { say: [['physician', '"Coming now — the surgeon takes him straight up. Nothing more to slow his heart or lower his pressure; a 250 mL bolus to hold him."']], flags: ['physician-notified'] };
      if (has(s, 'md-here')) return { say: [['physician', `"Thanks — right arm ${s.vitals.sbp}/${s.vitals.dbp}, rate ${s.rhythm.hr}. Keep calling me with every change: under 100 systolic or a rate under 60, I want to know at once."`]], flags: ['physician-notified'] };
      if (has(s, 'bp-arms')) {
        return {
          say: [['physician', `"Sudden pain through to his back, ${s.vitals.sbp}/${s.vitals.dbp} on the right and ${leftArm(s.vitals)} on the left? I'm coming now. Hold the aspirin and the nitroglycerin from the chest pain order set until I've seen him."`]],
          flags: ['physician-notified', 'reported-arms'],
        };
      }
      return { say: [['physician', '"Coming. Get me a blood pressure in both arms while I walk over."']], flags: ['physician-notified'] };
    },
    // the hand-off waits for the operating room once the surgeon has him; otherwise the department's own rule
    handoff: (s) => {
      if (!s.pulse || !has(s, 'or-called')) return null;
      if (!has(s, 'or-ready')) {
        return { blocked: true, say: [['system', 'The operating room is not ready yet: keep him here on the monitor, his rate and pressure controlled (reassess), and hand off when the surgeon calls for him.']] };
      }
      const held = has(s, 'aspirin') || has(s, 'heparin') || has(s, 'p2y12') ? 'the antithrombotic he was given' : 'what was held (no aspirin, no heparin)';
      return {
        say: [['you', `SBAR hand-off to ${s.role === 6 ? 'the operating room nurse and the anesthesiologist' : 'the cardiac surgeon and the anesthesiologist'}: the onset and the pain, the pressure in each arm, the murmur, the scans, every drug and dose and ${held}, his rate and pressure now, and the blood on hold.`]],
        flags: ['handoff', 'to-or'],
      };
    },
  },
  events: [
    // ── the ER doctor's run: the computer nurse rooms him, records the 12-lead (the doctor reads it) and places the lines
    {
      id: 'rn-room', when: (s) => s.role === 7,
      effect: () => ({ say: [['nurse', '"Bed 5, on the monitor and the pulse oximeter. The 12-lead next, then two IVs and the chest pain labs."']], flags: ['monitor'] }),
    },
    {
      id: 'rn-ecg', when: (s) => s.role === 7 && s.pulse && s.minute >= 1 && !has(s, 'ecg12'),
      effect: () => ({ say: [['nurse', '"12-lead done — here it is."']], flags: ['ecg12'] }),
    },
    {
      id: 'rn-lines', when: (s) => s.role === 7 && s.pulse && s.minute >= 2,
      effect: (s) => ({
        say: [['nurse', has(s, 'iv')
          ? '"A second 18-gauge in the other arm, and labs sent with a type and crossmatch for 4 units. The chest pain order set has aspirin — do you want it given?"'
          : '"Two 18-gauge IVs in, one in each arm, and labs sent with a type and crossmatch for 4 units. The chest pain order set has aspirin — do you want it given?"']],
        flags: ['iv', 'labs'],
      }),
    },

    // ── the ER nurse's run: the ED physician comes, examines, scans and orders
    {
      id: 'md-here', when: (s) => s.role === 6 && s.pulse && (has(s, 'physician-notified') || has(s, 'help') || s.minute >= MD_ARRIVES),
      effect: (s) => {
        const lines: Line[] = [];
        // called by the report or with the help call, the physician is already on the way; otherwise comes by minute 8
        if (!has(s, 'physician-notified') && !has(s, 'help')) lines.push(['physician', 'The ED physician comes over to see the new chest pain.']);
        lines.push(['physician', 'Listens to his chest: "A soft, blowing murmur right after the second heart sound, down the right side of the breastbone — new, his wife says."']);
        // the arms: the nurse's job once the physician has asked for them; nobody asked, the physician takes them
        if (!has(s, 'bp-arms')) {
          lines.push(has(s, 'physician-notified')
            ? ['physician', '"And I still need that pressure in both arms — now, please."', 'warn']
            : ['physician', `Takes the pressure in both arms: "Right ${s.vitals.sbp}/${s.vitals.dbp}, left ${leftArm(s.vitals)} — and his left radial pulse is weaker."`]);
        }
        const thinners = ANTITHROMBOTIC_NAMES.filter(([id]) => has(s, id)).map(([, name]) => name);
        if (thinners.length) lines.push(['physician', `"He has had ${thinners.join(' and ')}? Not for this pain: nothing more that thins his blood until his chest is imaged. I'll tell the surgeon."`, 'warn']);
        if (has(s, 'nitro') && !has(s, 'rate-controlled')) lines.push(['physician', '"And no more nitroglycerin until his rate is down."', 'warn']);
        // a drug that needs an order, given before the physician had seen him
        const alone = UNORDERED_NAMES.filter(([id]) => givenUnordered(s, [id])).map(([, name]) => name);
        if (alone.length) lines.push(['physician', `"He has had ${alone.join(' and ')}? Who ordered that? Call me first: I need to see him before he gets anything that is not on the order set."`, 'warn']);
        const need = [has(s, 'iv') ? '' : 'Two large-bore lines', has(s, 'labs') ? 'a type and crossmatch for 4 units added to his labs' : 'labs with a type and crossmatch for 4 units'].filter(Boolean).join(' and ');
        lines.push(['physician', `"${need.charAt(0).toUpperCase()}${need.slice(1)}, please. I'm scanning his heart."`]);
        return { say: lines, flags: ['md-here'] };
      },
    },
    {
      // the nurse has not placed a line by the time the drugs are needed: the physician does it
      id: 'md-line', when: (s) => s.role === 6 && s.pulse && has(s, 'md-here') && !has(s, 'iv') && s.minute >= s.flags['md-here'] + 4,
      effect: () => ({ say: [['physician', '"Still no line? I\'ll put one in myself — get the second one in."', 'warn']], flags: ['iv'] }),
    },
    {
      // the physician's bedside scan (in the findings' words), and the call to the surgeon
      id: 'md-scan', when: (s) => s.role === 6 && s.pulse && has(s, 'md-here') && s.minute >= s.flags['md-here'] + 2,
      effect: (s) => ({
        say: [
          ['physician', 'Bedside ultrasound: "The root is wide — 4.8 centimeters — with a thin flap flickering just above the valve, and color flow shows the valve leaking back. A small rim of fluid around the heart, not squeezing it; both ventricles squeeze well."'],
          ['physician', '"I\'m calling the cardiac surgeon now, and he needs a CT angiogram of the chest, abdomen and pelvis."'],
          ['hospital', bled(s) ? 'Cardiac surgery: "Bring him straight up — we open now."' : 'Cardiac surgery: the surgeon on call is coming in, and the operating room and anesthesia are being set up.'],
        ],
        flags: ['md-scanned', 'pocus', 'surgery-called', 'or-called', 'dispo'], timers: { orReady: s.minute + (bled(s) ? 0 : OR_MINUTES) },
      }),
    },
    ...RN_ORDERS.flatMap(askEvents),
    {
      id: 'ct-order', when: (s) => s.role === 6 && s.pulse && !bled(s) && has(s, 'md-scanned') && (has(s, 'beta-done') || has(s, 'rate-controlled')),
      effect: () => ({
        say: [['physician', '"CT is clearing the scanner. He goes on the transport monitor with his drugs, and you go with him — call me if his systolic goes under 100 or his rate over 80."']],
        flags: ['ct-ordered'],
      }),
    },
    {
      // nobody leaves for the scanner without a monitor
      id: 'ct-no-monitor', when: (s) => s.role === 6 && has(s, 'ct-ordered') && !has(s, 'monitor') && s.minute >= s.flags['ct-ordered'] + 1,
      effect: () => ({ say: [['physician', '"He doesn\'t go to the scanner without a monitor — put him on one."', 'warn']] }),
    },
    {
      id: 'ct-trip', when: (s) => s.role === 6 && s.pulse && !bled(s) && has(s, 'ct-ordered') && has(s, 'monitor') && s.minute >= s.flags['ct-ordered'] + CT_MINUTES,
      effect: () => ({
        say: [
          ['team', 'Back from the scanner: you went with him on the transport monitor, his rate and pressure watched all the way.'],
          ['hospital', CT_FOR_NURSE],
          ['physician', '"It starts just above the valve: that is the surgeon\'s, now. He goes straight to the operating room when they call for him — keep his rate and pressure where they are."'],
        ],
        flags: ['ct'],
      }),
    },

    // ── both runs
    {
      id: 'labs-back', when: (s) => has(s, 'labs') && s.minute >= s.flags.labs + 12,
      effect: () => ({ say: [['team', LABS_BACK]] }),
    },
    {
      // the beta-blocker, the opioid and the nicardipine infusion (started as the vasodilator, or after a first sublingual
      // nitroglycerin): the pressure settles into the goal (the pain, if it is still untreated, holds it higher)
      id: 'settle', when: (s) => s.pulse && !bled(s) && has(s, 'vasodilated') && s.minute >= s.flags.vasodilated + 4,
      effect: (s) => {
        const goal = has(s, 'analgesia') ? { sbp: 116, dbp: 70 } : { sbp: 128, dbp: 76 };
        const bp = { sbp: Math.min(s.vitals.sbp, goal.sbp), dbp: Math.min(s.vitals.dbp, goal.dbp) };
        // untreated pain holds the pressure over the goal whatever the infusion does: the opioid is part of the treatment
        const pain = has(s, 'analgesia') ? '' : ` His pain is still ${s.vitals.pain} out of 10, and it holds his pressure up.`;
        const drip: Line = has(s, 'nicardipine')
          ? [s.role === 7 ? 'nurse' : 'team', `The nicardipine infusion titrated to the systolic goal.${pain}`]
          : s.role === 7
            ? ['nurse', `"The nicardipine infusion is up from pharmacy and running at 5 milligrams an hour — I'll titrate it to your systolic goal."${pain}`]
            : ['team', `Pharmacy brings the nicardipine infusion: running at 5 mg/h on the physician's order, titrated to his systolic.${pain}`];
        return { say: [drip, pressures(s, s.rhythm.hr, bp)], vitals: bp, flags: bp.sbp <= 120 ? ['bp-goal'] : [] };
      },
    },
    {
      // nothing slowing the heart: the tear runs on down the aorta — the gut and the left leg lose their blood supply
      id: 'extension', when: (s) => s.pulse && inDepartment(s) && !has(s, 'rate-controlled') && s.minute >= EXTENDS_AT,
      effect: () => ({
        say: [
          ['patient', '"It\'s moving — it\'s in my belly now… and my left leg has gone numb."', 'bad'],
          ['team', 'His left leg is pale and cool, and there is no pulse in that foot.', 'bad'],
        ],
        vitals: { pain: 10 }, flags: ['extended'],
      }),
    },
    {
      // still in the department, it bleeds into the pericardium: a fast rate, a falling pressure, full neck veins
      id: 'tamponade', when: (s) => s.pulse && inDepartment(s) && s.minute >= bleedsAt(s),
      effect: (s) => {
        const hr = Math.min(140, Math.max(s.rhythm.hr + 30, 112));
        const v = { sbp: Math.min(s.vitals.sbp, 82), dbp: Math.min(s.vitals.dbp, 60) };
        const told: Line[] = s.role === 6 && has(s, 'or-called')
          ? [['physician', '"He goes to the operating room now — I\'ve told the surgeon. Nothing more to slow his heart or lower his pressure."', 'warn']]
          : [];
        return {
          say: [
            ['patient', '"I feel like I\'m going to pass out…"', 'bad'],
            ['team', 'He has gone gray and clammy, and his neck veins are standing out.', 'bad'],
            ...(has(s, 'monitor') ? [line('monitor', `Heart rate ${hr}. BP ${v.sbp}/${v.dbp}.`, 'bad')] : []),
            ...told,
          ],
          vitals: { ...v, gcs: 14, spo2: Math.min(s.vitals.spo2, 93), rr: 28 }, rhythm: atRate(s, hr), flags: ['tamponade'],
        };
      },
    },
    {
      // the surgeon is ready: after the CT for a stable patient, at once for one in shock
      id: 'or-ready', when: (s) => s.pulse && has(s, 'or-called') && (bled(s) || (has(s, 'ct') && s.minute >= s.timers.orReady)),
      effect: (s) => ({
        say: [['hospital', bled(s) ? 'Cardiac surgery: "Bring him up now — we open as soon as he is on the table."' : 'Operating room: the cardiac surgeon and anesthesia are ready — bring him up.']],
        flags: ['or-ready'],
      }),
    },
    {
      // nothing in the department relieves it: left there, the heart stops
      id: 'arrest', when: (s) => s.pulse && inDepartment(s) && bled(s) && s.minute >= s.flags.tamponade + ARREST_AFTER,
      effect: (s) => ({
        say: [['team', 'He has gone limp — not responding, not breathing normally!', 'bad'], ...(has(s, 'monitor') ? [line('monitor', 'Monitor alarm.', 'bad')] : [])],
        rhythm: { profile: 'pea', hr: Math.min(140, s.rhythm.hr) }, pulse: false, phase: 'arrest', vitals: { sbp: 0, dbp: 0, gcs: 3, rr: 0 }, flags: ['tamponade-arrest'],
      }),
    },
  ],
  critical: [
    // the ER nurse
    { id: 'rn-triage', roles: ED_RN, label: 'Triage: ESI level', why: 'Sudden, severe chest pain with a pressure of 196/104 is high risk — at least ESI 2: a monitored bed now, the physician told, and a 12-lead within 10 minutes of arrival.', done: ['triage'], points: 5, target: { by: 3 } },
    { id: 'rn-monitor', roles: ED_RN, label: 'Cardiac monitor and pulse oximeter', why: 'He can bleed into the pericardium or rupture at any moment: the monitor goes on at once, and stays on wherever he goes.', done: ['monitor', 'pads'], points: 5, target: { by: 5 } },
    { id: 'rn-ecg', roles: ED_RN, label: '12-lead ECG within 10 minutes of arrival', why: 'Every chest pain gets a 12-lead within 10 minutes, shown to the physician at once. His shows the thick heart muscle of years of high blood pressure and no STEMI — which neither explains the pain nor rules out the aorta.', done: ['ecg12'], points: 10, target: { by: 10 } },
    {
      id: 'rn-arms', roles: ED_RN, label: 'Blood pressure in both arms', points: 10, target: { by: 10 }, done: ['bp-both-arms'],
      why: 'Sudden pain that tears through to the back is a torn aorta until proven otherwise. A systolic difference of more than 20 mmHg between the arms, or a weaker pulse on one side, backs it up — and the higher arm is the pressure that is treated.',
    },
    {
      id: 'rn-report', roles: ED_RN, label: 'Report to the ED physician: the pain, the arm difference, the 12-lead (SBAR)', points: 10, done: ['notify-physician'], after: 'bp-arms', target: { within: { flag: 'bp-arms', minutes: 5 } },
      why: 'Speak up: the tearing pain, the 46 mmHg difference and the weak left pulse are what make the physician think of the aorta — and what make the chest pain order set the wrong one. Report them at once, and hold the aspirin and the nitroglycerin until the physician has seen him.',
    },
    { id: 'rn-iv', roles: ED_RN, label: 'Two large-bore IVs', why: 'For the drugs, the CT contrast (an 18 G in the antecubital fossa) and blood if he bleeds.', done: ['iv'], points: 5, target: { by: 15 } },
    rnOrderCritical(RN_BETA, RATE_DRUGS),
    rnOrderCritical(RN_FENTANYL, ['fentanyl']),
    // nitroglycerin 0.4 mg is on the chest pain standing order: given early it is the vasodilator-before-rate rule's, and the order still comes
    askCritical(RN_VASODILATOR),
    { id: 'rn-labs', roles: ED_RN, label: 'Labs, with a type and crossmatch', why: 'The creatinine for the contrast, the hemoglobin and clotting, and blood crossmatched: he may be in the operating room within the hour.', done: ['labs'], points: 5, target: { by: 15 } },
    // the ER doctor
    { id: 'md-history', roles: ED_MD, label: 'The pain: onset, character and where it goes (OPQRST)', why: 'Sudden, worst-ever pain at its peak from the first second, tearing through to the back: the history is what makes you think of the aorta.', done: ['opqrst'], points: 5, target: { by: 10 } },
    {
      id: 'md-arms', roles: ED_MD, label: 'Blood pressure in both arms', points: 10, target: { by: 10 }, done: ['bp-both-arms'],
      why: 'A systolic difference of more than 20 mmHg between the arms, or a pulse deficit, backs up the suspicion (2022 ACC/AHA) — and the higher arm is the pressure to treat and to put the arterial line in.',
    },
    {
      id: 'md-pocus', roles: ED_MD, label: 'Bedside ultrasound: the aortic root, the valve, the pericardium', points: 10, target: { by: 15 }, done: ['pocus'],
      why: 'A dilated root with a flap, new aortic regurgitation or a pericardial effusion makes it a proximal tear and raises the stakes; a normal scan does not rule it out.',
    },
    {
      id: 'md-rate', roles: ED_MD, label: 'IV beta-blocker first: heart rate 60–80', points: 15, target: { by: 15 }, done: RATE_DRUGS, applies: (s) => beforeBleed(s, 'rate-controlled'),
      why: 'Anti-impulse therapy starts as soon as the tear is suspected (2022 ACC/AHA, COR 1): an IV beta-blocker first — esmolol, labetalol or metoprolol — to a heart rate of 60–80, cutting the force of each beat on the torn wall; diltiazem if a beta-blocker cannot be used.',
    },
    {
      id: 'md-analgesia', roles: ED_MD, label: 'IV opioid for the pain', points: 10, target: { by: 15 }, done: ['fentanyl'], applies: (s) => beforeBleed(s, 'analgesia'),
      why: 'Pain drives the heart rate and pressure, and both tear the wall further: an IV opioid is part of the treatment (2022 ACC/AHA).',
    },
    {
      id: 'md-vasodilator', roles: ED_MD, label: 'Then a vasodilator: systolic under 120', points: 10, done: VASODILATORS, after: 'rate-controlled', target: { within: { flag: 'rate-controlled', minutes: 10 } },
      applies: (s) => (bled(s) ? beforeBleed(s, 'vasodilated') : !has(s, 'rate-controlled') || has(s, 'needs-vasodilator')),
      why: 'With the rate controlled and the systolic still over 120, a vasodilator brings it under 120, or to the lowest pressure that keeps him perfused (2022 ACC/AHA) — given only after the beta-blocker, so the heart cannot race in reflex.',
    },
    {
      id: 'md-ct', roles: ED_MD, label: 'CT angiography of the chest, abdomen and pelvis', points: 10, target: { by: 30 }, done: ['ct-urgent'], applies: (s) => beforeBleed(s, 'ct'),
      why: 'CT angiography is the first test for a stable patient: where the tear starts and ends, the branches it takes, the pericardium. In shock the patient goes to the operating room instead, where an echo through the esophagus answers the same question.',
    },
    {
      id: 'md-surgery', roles: ED_MD, label: 'Call the cardiac surgeon: emergency surgery', points: 15, target: { by: 20 }, done: ['call-surgery'],
      why: 'A tear in the ascending aorta (type A) needs emergency surgery (2022 ACC/AHA, COR 1); untreated, about 1–2 % die each hour in the first day. Call as soon as you suspect it — the operating room takes time to set up — not after every test is back.',
    },
    // both
    { id: 'handoff', label: 'Hand-off to the operating room team (SBAR)', why: 'The onset and the pain, the pressure in each arm, the murmur, the scans, every drug and dose — and what was held (aspirin, heparin) — his rate and pressure now, and the blood on hold.', done: ['handoff'], points: 5 },
  ],
  harms: yieldToHeavier([
    {
      // the chest pain standing order's aspirin is this case's main trap for the nurse; heparin or a P2Y12 would also be given
      // with no order, so this rule stands for that one too (one mistake, one penalty)
      id: 'antithrombotic-dissection-rn', actions: ANTITHROMBOTICS, roles: ED_RN, points: 10, severity: 'major',
      replaces: [...ANTITHROMBOTIC_RULES, 'rn-without-order-heparin', 'rn-without-order-p2y12'],
      text: 'An antithrombotic for sudden pain that tears through to the back. The chest pain standing order covers aspirin, but it also asks you to screen first: pain that goes through to the back, a difference between the arms or a new murmur means a torn aorta until a scan says otherwise, and aspirin, heparin or a P2Y12 inhibitor make it bleed — into the chest, the pericardium — and add to the bleeding in the emergency surgery he needs. Hold it, and tell the ED physician why.',
    },
    {
      id: 'antithrombotic-dissection-md', actions: ANTITHROMBOTICS, roles: ED_MD, points: 10, severity: 'major', replaces: ANTITHROMBOTIC_RULES,
      text: 'An antithrombotic for sudden pain that tears through to the back. With a pressure difference between the arms, a new diastolic murmur and a 12-lead without a STEMI, this is a torn aorta until a scan says otherwise: aspirin, heparin or a P2Y12 inhibitor make the tear bleed and add to the bleeding in the emergency surgery. Hold every antithrombotic until the aorta is imaged.',
    },
    {
      // before the beta-blocker: a vasodilator makes the heart race and pound harder (not with a low pressure: the engine's rule)
      id: 'vasodilator-before-rate-rn', actions: ['nitro', 'nitro-high', 'nitro-iv'], roles: ED_RN, when: (s) => s.pulse && !shock(s) && !has(s, 'rate-controlled'), points: 5, severity: 'major',
      // the IV infusion has no standing order at all: this one rule stands for that missing order too
      replaces: [...NITRATE_RULES, 'rn-without-order-nitro-iv'],
      text: 'Nitroglycerin for this pain before the rate is controlled. The sublingual dose is on the chest pain standing order (the IV infusion needs the physician\'s), but not for pain that tears through to the back with a difference between the arms: on its own a vasodilator makes the heart race (reflex tachycardia) and pound harder against the tear, and it does not ease this pain. Report what you found; the physician orders the beta-blocker first, and a vasodilator only after it.',
    },
    {
      id: 'vasodilator-before-rate-md', actions: VASODILATORS, roles: ED_MD, when: (s) => s.pulse && !shock(s) && !has(s, 'rate-controlled'), points: 5, severity: 'major',
      replaces: [...NITRATE_RULES, 'nicardipine-no-hypertension'],
      text: 'A vasodilator before the rate is controlled. On its own it makes the heart race (reflex tachycardia) and pump harder against the tear (2022 ACC/AHA: an IV beta-blocker first, to a rate of 60–80; a vasodilator only after it, for a systolic still over 120).',
    },
    nitrateCaseRule({
      id: 'vasodilator-below-goal', actions: VASODILATORS, when: (s) => s.pulse && !shock(s) && has(s, 'rate-controlled') && s.vitals.sbp <= 120, points: 3, severity: 'minor', replaces: ['nicardipine-no-hypertension'],
      text: 'More vasodilator with the systolic already at 120 or less. The goal is a systolic under 120, or the lowest pressure that keeps the brain, the kidneys and the gut perfused — not lower: a falling pressure in a torn aorta also hides the bleed into the pericardium.',
    }, 'nitro-high-not-hypertensive'),
    {
      // the built-in 0.8 mg rule, same id: a deliberate exemption. This case judges every vasodilator dose itself — before the
      // rate is controlled, in shock, at the goal, and the nurse's 0.8 mg for an ordered 0.4 (the order's own rule); with the
      // rate controlled and the systolic still over 120 it allows a vasodilator toward its goal of under 120 (one rule per dose)
      id: 'nitro-high-not-hypertensive', actions: ['nitro-high'], when: () => false, points: 3, severity: 'minor',
      text: 'High-dose nitroglycerin without a high blood pressure.',
    },
    {
      id: 'rate-drug-low', actions: [...RATE_DRUGS, 'metoprolol-po'], when: (s) => s.pulse && (bled(s) || s.vitals.sbp < 100 || s.rhythm.hr < 60), replaces: RATE_RULES, points: 8, severity: 'major',
      text: 'A beta-blocker or diltiazem in shock, or with a systolic under 100 or a rate under 60. With a torn aorta a falling pressure means tamponade, rupture or a badly leaking aortic valve: slowing the heart takes away the rate that is holding up his output.',
    },
    {
      id: 'second-rate-drug', actions: [...RATE_DRUGS, 'metoprolol-po'], when: (s) => s.pulse && has(s, 'rate-controlled') && s.vitals.sbp >= 100 && s.rhythm.hr >= 60, replaces: RATE_RULES, points: 3, severity: 'minor',
      text: 'A second rate-slowing drug with the rate already at 60–80. More beta-blocker or diltiazem now only adds bradycardia (and with the aortic valve leaking, a slow rate lets more blood fall back into the ventricle): a systolic still over 120 needs a vasodilator.',
    },
    {
      // the engine's low-pressure nitrate rule, in this case's words, and also over 90 once the tamponade is under way
      id: 'vasodilator-in-shock', actions: VASODILATORS, when: (s) => s.pulse && shock(s), points: 8, severity: 'major', replaces: [...NITRATE_RULES, 'vasodilator-hypotension', 'nicardipine-no-hypertension'],
      text: 'A vasodilator in shock. With blood around his heart (or a systolic under 90) his pressure is held up by tight vessels, a fast rate and whatever fluid he has had: a nitrate drops it further. Stop the rate drugs and the vasodilators, give small fluid boluses and get him to the operating room.',
    },
    {
      id: 'fluid-hypertensive', actions: ['fluid'], when: (s) => s.pulse && !shock(s), points: 5, severity: 'major',
      text: 'A fluid bolus for a patient whose pressure is already high. More volume raises the pressure and the force on the torn wall. Fluid is for the shock of tamponade or rupture, in small boluses, on the way to the operating room.',
    },
    {
      // the built-in rule, same id (a deliberate exemption): in the tamponade a bolus can lift the systolic over 90 and he
      // is still in shock — a pressor then is the bridge to the operating room. The rule below judges the pressure
      id: 'pressor-no-hypotension', actions: ['push-epi', 'pressor'], when: () => false, points: 3, severity: 'minor',
      text: 'A vasopressor without a low pressure: in this case the rule for a high pressure judges it.',
    },
    {
      id: 'pressor-hypertensive', actions: ['push-epi', 'pressor'], when: (s) => s.pulse && !shock(s), points: 5, severity: 'major',
      text: 'A vasopressor or push-dose epinephrine with a high blood pressure. It drives the pressure and the heart harder against the tear: the goal is a lower rate and pressure, not a higher one.',
    },
    {
      id: 'legs-up-hypertensive', actions: ['legs-up'], when: (s) => s.pulse && !shock(s), points: 2, severity: 'minor',
      text: 'Raising the legs of a patient whose pressure is high. It returns more blood to a heart that is already pushing too hard against the tear.',
    },
    {
      id: 'opioid-hypotension', actions: ['fentanyl'], when: (s) => s.pulse && low(s), points: 3, severity: 'minor',
      text: 'Fentanyl with a systolic under 90. An opioid lowers the pressure further in a patient already in shock: support the pressure and get him to the operating room.',
    },
    {
      id: 'cath-lab-dissection', actions: ['cath-lab-activate'], roles: ED_MD, points: 8, severity: 'major', replaces: ['cath-lab-no-ste'],
      text: 'Activating the cath lab for a 12-lead without a STEMI, in a patient whose pain tears through to the back. His tracing shows the LVH of years of high blood pressure, and the cath lab brings heparin and antiplatelets — the worst treatment for a torn aorta. Image the aorta and call the surgeon.',
    },
    {
      // the case's own lesson for any transfer (an unstable one too): the surgeon is here — one penalty, not the EMTALA rule's as well
      id: 'transfer-in-house', actions: ['transfer'], roles: ED_MD, replaces: ['transfer-unstable'], points: 3, severity: 'minor',
      text: 'A transfer request from a high-volume cardiac surgery center. Moving a type A tear to a high-volume aortic center is right from a hospital without cardiac surgery, or one that rarely does these operations (2022 ACC/AHA: a stable patient is considered for that transfer); this hospital is one, with its surgeon on call, and a transfer only adds an hour or more to a tear that kills about 1–2 % of patients an hour in the first day. Call the surgeon here.',
    },
    {
      // the main mistake for the ER doctor after the antithrombotics: the patient goes to a bed for blood pressure control,
      // not to the operating room
      id: 'admit-without-surgeon', actions: ['admit'], roles: ED_MD, when: (s) => s.pulse && !has(s, 'surgery-called'), points: 10, severity: 'major',
      text: 'Admitting him to the ICU without calling the cardiac surgeon. A tear that starts in the ascending aorta is an emergency operation (2022 ACC/AHA, COR 1), not a bed for blood pressure control: untreated, about 1–2 % of these patients die each hour in the first day, of rupture, tamponade or a blocked coronary. Call the surgeon from the department; the ICU is where he goes after the operating room.',
    },
    {
      // the engine's rule, in this case's words: after the bleed, blood is a fair bridge to the operating room
      id: 'transfuse-no-bleeding', actions: ['transfuse'], when: (s) => s.pulse && !bled(s), points: 3, severity: 'minor',
      text: 'Packed red cells before any bleeding. His hemoglobin is normal and his pressure high: the units are crossmatched and held for the operating room, where the repair can bleed.',
    },
    {
      id: 'pericardiocentesis-dissection', actions: ['pericardiocentesis'], roles: ED_MD, when: (s) => !bled(s), points: 15, severity: 'critical', replaces: ['pericardiocentesis-no-tamponade'],
      text: 'A pericardiocentesis without tamponade. The rim of fluid around his heart is not squeezing it: there is nothing to drain, and the needle can puncture the heart or a coronary artery. The torn aorta needs the surgeon.',
    },
    {
      // with a pulse: once his heart has stopped, a needle in the pericardium is a last try that costs nothing more. The
      // built-in rule for it, in this case's words
      id: 'pericardiocentesis-before-or', actions: ['pericardiocentesis'], roles: ED_MD, when: (s) => s.pulse && bled(s), replaces: ['pericardiocentesis-dissection-tamponade'], points: 8, severity: 'major',
      text: 'A needle drain for the tamponade of a torn aorta while a surgeon can operate. Emptying the sac lets the pressure rise and the bleeding restart, often worse: the operating room is the treatment. A controlled drainage of small amounts is a last resort only when no surgery can happen at once.',
    },
    {
      // the engine's rule, in this case's words: in shock the scanner is the wrong room
      id: 'ct-unstable', actions: ['ct-urgent'], roles: ED_MD, when: (s) => s.pulse && shock(s), points: 8, severity: 'major',
      text: 'Sending him to the CT scanner in shock. With a torn aorta a falling pressure means tamponade or rupture: he goes straight to the operating room, where an echo through the esophagus confirms the tear, not to a scanner where nobody can treat him.',
    },
    {
      // the lungs are clear: a lighter mistake than CPAP on a low pressure, a heart that lives on its preload or a patient
      // about to vomit — there (cpapHarmful) the built-in rules speak, at their own weight
      id: 'cpap-no-distress', actions: ['cpap'], when: (s, sc) => s.pulse && !cpapHarmful(s, sc), replaces: ['cpap-no-indication', 'cpap-drowsy'], points: 3, severity: 'minor',
      text: 'CPAP with clear lungs. It is for respiratory distress from fluid on the lungs; positive pressure cuts the blood returning to the heart — dangerous if the tear bleeds into the pericardium.',
    },
    // the nurse's answer to an order that is not the order: a medication error, scored once (not also as a drug with no order)
    { ...askHarm(RN_BETA, 'Diltiazem in place of the metoprolol the physician ordered. He has no reason not to take a beta-blocker, the drug the guideline puts first (2022 ACC/AHA); diltiazem is for a patient who cannot. Give the drug, the dose and the route that were ordered — read the order back, and ask if it seems wrong.', 5), replaces: RATE_RULES },
    { ...askHarm(RN_VASODILATOR, 'Nitroglycerin 0.8 mg when 0.4 mg was ordered. Twice the ordered dose of a vasodilator in a patient whose pressure is coming down to a goal of 100–120 is a medication error: give the dose that was ordered, read it back, and recheck the pressure in the higher arm.'), replaces: nitrateRulesExcept('nitro-hypotension') },
  ]),
  timings: [
    DOOR_TO_ECG,
    { label: 'Blood pressure in both arms', actions: ['bp-both-arms'], target: 10 },
    // the physician's own dose counts in the nurse's run (the flag)
    { label: 'Rate control (IV beta-blocker)', actions: RATE_DRUGS, flag: 'rate-controlled', target: 15 },
    { label: 'Cardiac surgeon called', actions: ['call-surgery'], flag: 'surgery-called', target: 20 },
    { label: 'Arrival to the operating room', actions: [], flag: 'to-or' },
  ],
  deathAfter: 10,
  teaching: [
    'Think of the aorta in every chest pain: sudden, severe pain that is at its worst from the first second, described as tearing or ripping, going through to the back or moving down it. Hypertension is the commonest risk factor (his had gone untreated for a month); cocaine, Marfan and other connective-tissue disorders, a bicuspid aortic valve, a known aneurysm and recent heart surgery are the others.',
    'Look for what backs it up: a systolic difference of more than 20 mmHg between the arms, a weak or missing pulse, a new early diastolic murmur (the root stretched and the aortic valve leaking), a neurologic deficit or a cold leg. Treat the higher arm\'s pressure; put the arterial line on that side.',
    'The 12-lead is often normal or shows only LVH from years of high blood pressure, and that does not rule out a dissection; a flap that blocks a coronary ostium (usually the right) can even produce a real STEMI pattern. The chest film can show a wide mediastinum, but a normal one rules nothing out.',
    'Suspect it, and hold the aspirin, heparin, P2Y12 inhibitors, fibrinolytics and the cath lab: they make the tear bleed and complicate the surgery. For the ER nurse, the chest pain standing order is the trap: screen before you give it, and tell the physician what you found (SBAR, closed loop).',
    'Anti-impulse therapy starts at once (2022 ACC/AHA, COR 1): an IV beta-blocker first — esmolol, labetalol or metoprolol — to a heart rate of 60–80, then, if the systolic is still over 120, an IV vasodilator (a nicardipine, clevidipine or nitroprusside infusion) only once the rate is controlled, for a systolic under 120 or the lowest pressure that keeps the organs perfused, with an arterial line. A vasodilator on its own makes the heart race and pound harder against the tear. An IV non-dihydropyridine calcium-channel blocker (diltiazem) if a beta-blocker cannot be used. In this simulator the nicardipine infusion is the vasodilator (sublingual nitroglycerin, which the case also accepts, brings the pressure down the same way here).',
    'Treat the pain with an IV opioid: pain drives the rate and the pressure (2022 ACC/AHA).',
    'Imaging: bedside ultrasound can show a dilated root with a flap, aortic regurgitation or a pericardial effusion, and none of them rules it out when absent; CT angiography of the chest, abdomen and pelvis is the test for a stable patient. A patient in shock goes to the operating room, where a transesophageal echo confirms it — not to the scanner, and never unmonitored.',
    'A tear in the ascending aorta (type A) needs emergency surgery (2022 ACC/AHA, COR 1); untreated, about 1–2 % die each hour in the first day. Call the cardiac surgeon as soon as you suspect it — not after every test is back. Where there is no cardiac surgery, or the hospital rarely does these operations, transfer to a high-volume aortic center at once (2022 ACC/AHA: considered for a stable patient).',
    'A falling pressure is the danger sign: tamponade (muffled heart sounds, distended neck veins, a fast thready pulse), rupture or severe aortic regurgitation. Stop the rate drugs and the vasodilator, give small fluid boluses to keep him perfused, and go straight to the operating room. A needle drain lets the bleeding restart; a controlled drainage of small amounts is a last resort only when no surgeon can operate at once.',
    'Fluid, vasopressors and raised legs push a high pressure higher; CPAP is for wet lungs. None of them belongs in a hypertensive patient with a torn aorta.',
    'The ER nurse\'s part: triage (ESI 2), the monitor, a 12-lead within 10 minutes, the pressure in both arms, an SBAR report with the difference, two large-bore lines and labs with a type and crossmatch, each drug on the physician\'s order with its hold parameters (the beta-blocker before the vasodilator), the trip to the scanner on the monitor, and the hand-off to the surgical team.',
  ],
};
