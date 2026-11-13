import type { Effect, Line, Scenario, ScenarioEvent, SimState, Vitals } from '../types';
import { INTERVENTION_BY_ID } from '../interventions';
import { LOW_GLUCOSE, PADS, PERFUSING_FLOOR, canSwallow, count, firstDone, has } from '../kit';

/**
 * Extended-release metoprolol overdose. The patient is computed, not patched: her rate and pressure are the untreated
 * course (it gets worse with time while nothing supports her) plus what every treatment adds or takes away. So the
 * order of the drugs never matters, a drug that dropped the pressure keeps it lower for the rest of the case, and a
 * short-acting drug (atropine, push-dose epinephrine, a glucagon bolus) shows its effect only while it lasts.
 */

type Delta = [hr: number, sbp: number, dbp: number];

/** The untreated course: at first contact, after about 10 minutes without support, after about 20 */
const STAGES = [
  { hr: 38, sbp: 74, dbp: 40, gcs: 14 },
  { hr: 36, sbp: 66, dbp: 36, gcs: 12 },
  { hr: 35, sbp: 58, dbp: 30, gcs: 8 },
];

// what each treatment adds to the poisoned heart [rate, systolic, diastolic]
/** glucagon works past the blocked beta receptors (its own receptor raises cAMP): rate and squeeze, for 10–20 minutes */
const GLUCAGON: Delta = [12, 12, 8];
const GLUCAGON_TWICE: Delta = [16, 16, 10];
/** an epinephrine infusion adds rate (beta-1, against the blocker) and tone (alpha), and it lasts */
const EPI_INFUSION: Delta = [16, 18, 10];
const PUSH_EPI: Delta = [6, 16, 10];
/** the 1 mg arrest dose with a pulse: a surge of pressure (alpha) the blocked heart cannot answer with much rate */
const EPI_BOLUS: Delta = [14, 90, 56];
/** atropine lifts the vagal brake only: in a beta-blocker overdose that is a few beats, for a few minutes */
const ATROPINE: Delta = [4, 2, 0];
const CALCIUM: Delta = [0, 6, 3];
const FLUID: Delta = [0, 5, 3];
/** a paced rate of 70 helps the pressure a little: the squeeze is still poisoned */
const PACED: Delta = [0, 8, 6];
// and what the wrong drugs take away
/** a calcium-channel blocker or more beta-blocker: slower, weaker and wider open vessels */
const AV_BLOCKER: Delta = [-8, -20, -12];
const ANTIARRHYTHMIC: Delta = [-6, -10, -6];
const VASODILATOR: Delta = [0, -10, -6];
const MAGNESIUM: Delta = [0, -6, -4];
const CPAP: Delta = [0, -6, -4];
const OPIOID: Delta = [0, -4, -2];
const SEDATIVE: Delta = [0, -6, -4];

/** Minutes each effect lasts after the dose is in */
const GLUCAGON_LASTS = 15;
const ATROPINE_LASTS = 5;
const PUSH_EPI_LASTS = 5;
const EPI_BOLUS_LASTS = 3;

const round = (m: number) => Math.round(m * 10) / 10;
/** The clock when an action that starts now is finished */
const end = (s: SimState, id: string) => round(s.minute + INTERVENTION_BY_ID[id].minutes);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const running = (s: SimState, timer: string, at = s.minute) => at < (s.timers[timer] ?? -Infinity);

interface Picture {
  rhythm: { profile: string; hr: number };
  sbp: number;
  dbp: number;
  gcs: number;
  /** the systolic before the perfusing floor: below it the circulation stops */
  raw: number;
}

/** Her heart rate, rhythm, pressure and level of consciousness at clock minute `at`, from the course and the treatments */
function picture(s: SimState, at = s.minute): Picture {
  const st = STAGES[has(s, 'peri') ? 2 : has(s, 'worse') ? 1 : 0];
  const pressor = has(s, 'pressor');
  // while the infusion runs it is titrated to cover the glucagon bolus wearing off
  const glucagon = count(s, 'glucagon') > 0 && (pressor || running(s, 'glucagonUntil', at));
  const pushEpi = running(s, 'pushEpiUntil', at);
  const bolus = running(s, 'epiBolusUntil', at);
  // two doses add up only while both work: a dose given after the first wore off acts as a fresh single dose
  const twice = count(s, 'glucagon') >= 2 && !has(s, 'glucagon-faded');
  const parts: [Delta, number][] = [
    [twice ? GLUCAGON_TWICE : GLUCAGON, glucagon ? 1 : 0],
    [EPI_INFUSION, pressor ? 1 : 0],
    [PUSH_EPI, pushEpi ? 1 : 0],
    [EPI_BOLUS, bolus ? 1 : 0],
    [ATROPINE, running(s, 'atropineUntil', at) ? 1 : 0],
    [CALCIUM, Math.min(2, count(s, 'calcium-chloride'))],
    [FLUID, Math.min(2, count(s, 'fluid'))],
    [PACED, has(s, 'paced') ? 1 : 0],
    [AV_BLOCKER, count(s, 'diltiazem') + count(s, 'metoprolol')],
    [ANTIARRHYTHMIC, count(s, 'lidocaine') + count(s, 'amio-infusion') + count(s, 'amio-arrest') + count(s, 'procainamide')],
    [VASODILATOR, count(s, 'nitro') + 2 * count(s, 'nitro-high')],
    [MAGNESIUM, count(s, 'magnesium-sulfate')],
    [CPAP, count(s, 'cpap')],
    [OPIOID, Math.min(1, count(s, 'fentanyl'))],
    [SEDATIVE, count(s, 'sedation') + count(s, 'midazolam')],
  ];
  let { hr, sbp, dbp } = st;
  for (const [d, k] of parts) {
    hr += d[0] * k;
    sbp += d[1] * k;
    dbp += d[2] * k;
  }
  // with the cAMP restored the sinus node takes over again; without it the junction keeps the beat (never below 35)
  const stimulated = glucagon || pressor || pushEpi || bolus;
  const own = stimulated && hr >= 46
    ? { profile: hr < 60 ? 'sinus-bradycardia' : hr <= 100 ? 'normal-sinus' : 'sinus-tachycardia', hr }
    : { profile: 'junctional', hr: clamp(hr, 35, 59) };
  // a demand pacer at 70 drives the heart unless its own rate is faster
  const rhythm = has(s, 'paced') && own.hr <= 70 ? { profile: 'tcp', hr: 70 } : own;
  const shownSbp = clamp(sbp, PERFUSING_FLOOR.sbp, 190);
  const shownDbp = clamp(dbp, PERFUSING_FLOOR.dbp, Math.min(110, shownSbp - 10));
  const g = s.vitals.glucose;
  const gcs = st.gcs - (g < LOW_GLUCOSE ? 1 : 0) - (g < 50 ? 1 : 0) + (sbp >= 90 ? 1 : 0) - (sbp < 56 ? 2 : 0)
    - (count(s, 'sedation') + count(s, 'midazolam') > 0 ? 1 : 0) - (has(s, 'rosc') ? 3 : 0);
  return { rhythm, sbp: shownSbp, dbp: shownDbp, gcs: clamp(gcs, 3, 15), raw: sbp };
}

/** The state as it will be once this action (or event) has taken effect: what the picture is computed from */
function after(s: SimState, o: { id?: string; flags?: string[]; timers?: Record<string, number>; vitals?: Partial<Vitals> } = {}): SimState {
  const flags = { ...s.flags };
  for (const f of o.flags ?? []) if (!(f in flags)) flags[f] = s.minute;
  return {
    ...s,
    counts: o.id ? { ...s.counts, [o.id]: count(s, o.id) + 1 } : s.counts,
    flags,
    timers: { ...s.timers, ...o.timers },
    vitals: { ...s.vitals, ...o.vitals },
  };
}

/**
 * Something holds the poisoned heart up: an epinephrine infusion, or a dose of glucagon or epinephrine still working.
 * The pacer is not on the list: it holds the rate, but the tablets keep releasing the drug and the squeeze keeps
 * weakening, so a patient who is only paced still gets worse (she does not arrest while it captures).
 */
const supported = (s: SimState) => has(s, 'pressor')
  || (count(s, 'glucagon') > 0 && running(s, 'glucagonUntil')) || running(s, 'pushEpiUntil') || running(s, 'epiBolusUntil');

/** Fentanyl or sedation given this many minutes or less before the pacer goes on covers the pacing (premedication) */
const PREMED_WINDOW = 5;
const ANALGESICS = ['fentanyl', 'sedation', 'midazolam'];
/** The minute the pacer was started, if it took over the rhythm */
const paceStart = (s: SimState) => (has(s, 'paced') ? s.performed.find((p) => p.id === 'pace')?.minute ?? null : null);
/** A dose of fentanyl or sedation in the last few minutes, ready for the pacer about to go on */
const premedicated = (s: SimState) => s.performed.some((p) => ANALGESICS.includes(p.id) && p.minute >= s.minute - PREMED_WINDOW);
/**
 * A dose was given to cover pacing (she was slow and failing, not yet paced), and no dose came in the few minutes
 * before the pacer went on: the pacer never followed, or followed too late for it
 */
const premedUnused = (s: SimState) => {
  if (!has(s, 'premed')) return false;
  const pace = paceStart(s);
  return pace === null || !s.performed.some((p) => ANALGESICS.includes(p.id) && p.minute >= pace - PREMED_WINDOW && p.minute < pace);
};

/**
 * A rate worth pacing: under 50, or under 60 with the pressure still under 90 (in the poisoned heart a faster rate is
 * the one thing that still adds output, so a glucagon-lifted 50–59 with a low pressure may still be paced)
 */
const slowAndFailing = (s: SimState) => s.rhythm.hr < 50 || (s.rhythm.hr < 60 && s.vitals.sbp < 90);

/** Something more than atropine has been started */
const escalated = (s: SimState) => count(s, 'glucagon') > 0 || has(s, 'pressor') || has(s, 'paced') || count(s, 'push-epi') > 0;

const BP = (p: Picture) => `BP ${p.sbp}/${p.dbp}`;
const numbers = (p: Picture) => (p.rhythm.profile === 'tcp' ? `The pacer holds 70. ${BP(p)}.` : `Heart rate ${p.rhythm.hr}. ${BP(p)}.`);
const awake = (p: Picture, text: string, tone?: Line[2]): Line[] => (p.gcs >= 13 ? [tone ? ['patient', text, tone] : ['patient', text]] : []);

/** The circulation stops: a slow, organized rhythm with no pulse (the capnograph follows the shared arrest rule) */
function arrest(say: Line[], flags: string[] = []): Effect {
  return {
    say: [...say, ['monitor', 'Monitor alarm!', 'bad'], ['partner', "She's gone limp and gray — I can't feel a pulse!", 'bad']],
    rhythm: { profile: 'pea', hr: 30 }, pulse: false, vitals: { sbp: 0, dbp: 0, gcs: 3, rr: 0 }, flags,
  };
}

/**
 * Apply the new picture. `next` is the state with this action or event in it; below the perfusing floor she arrests
 * (once: after a return of circulation the floor holds).
 */
function settle(s: SimState, next: SimState, at: number, before: Line[], lines: (p: Picture) => Line[], flags: string[] = [], more: Effect = {}): Effect {
  const p = picture(next, at);
  if (s.pulse && p.raw < PERFUSING_FLOOR.sbp && !has(s, 'arrest')) return arrest(before, flags);
  return {
    ...more,
    say: [...before, ...lines(p)],
    rhythm: p.rhythm,
    vitals: { ...more.vitals, sbp: p.sbp, dbp: p.dbp, gcs: p.gcs },
    flags: [...flags, ...(more.flags ?? []), ...(p.gcs <= 8 ? ['obtunded'] : [])],
  };
}

/**
 * A short-acting drug wears off when its timer runs out: the patient is recomputed then, not only at the next look at
 * her (an assessment, the 10-minute worsening), so the monitor stops showing a rate and a pressure the drug no longer
 * gives. Each dose's end is marked as faded (`<timer>Faded`), so it acts once; an event fires only once, so there is
 * one copy per dose that can wear off. A drug whose end changes nothing (the pacer holds the rate) passes quietly.
 */
function fades(timer: string, said: string, copies: number): ScenarioEvent[] {
  const faded = `${timer}Faded`;
  const due = (s: SimState) => s.pulse && s.timers[timer] !== undefined && s.minute >= s.timers[timer] && s.timers[faded] !== s.timers[timer];
  return Array.from({ length: copies }, (_, i) => ({
    id: `${timer}-fades${i ? `-${i + 1}` : ''}`,
    when: due,
    effect: (s: SimState): Effect => {
      const timers = { [faded]: s.timers[timer] };
      const p = picture(s);
      const changed = p.rhythm.profile !== s.rhythm.profile || p.rhythm.hr !== s.rhythm.hr || p.sbp !== s.vitals.sbp || p.dbp !== s.vitals.dbp || p.gcs !== s.vitals.gcs;
      if (!changed) return { timers };
      const e = settle(s, s, s.minute, [['partner', said, 'bad']], (q) => [['monitor', numbers(q), 'bad']]);
      return { ...e, timers: { ...e.timers, ...timers } };
    },
  }));
}

/**
 * Sedation or midazolam: with the pacer on it treats the pain of it; just before pacing it is premedication; with neither it
 * only deepens the shock
 */
function sedate(s: SimState, id: 'sedation' | 'midazolam', said: string): Effect | null {
  if (!s.pulse) return null;
  const pacing = has(s, 'paced');
  const premed = !pacing && slowAndFailing(s);
  return settle(s, after(s, { id }), end(s, id), [['you', said]],
    (p) => [['monitor', `${BP(p)}.`]], pacing ? ['sedation', 'analgesia'] : ['sedation', ...(premed ? ['premed'] : [])], pacing ? { vitals: { pain: 1 } } : {});
}

/** A drug that only takes away: it is in, and the monitor shows what it did */
function harmful(id: string, said: string, flag: string) {
  return (s: SimState): Effect | null => {
    if (!s.pulse) return null;
    return settle(s, after(s, { id }), end(s, id), [['you', said]], (p) => [['monitor', numbers(p), 'bad']], [flag]);
  };
}

/**
 * What medical control and the poison center order once they know what she took, for her as she is now (a call can be
 * repeated): no glucagon past its two doses, nothing started twice
 */
function orders(s: SimState): string {
  const glucagon = count(s, 'glucagon');
  return [
    glucagon === 0 ? 'Glucagon 5 mg IV, once more if needed' : glucagon === 1 ? 'a second 5 mg of glucagon if she is still slow' : 'the glucagon is used up',
    has(s, 'pressor') ? 'titrate the epinephrine infusion to a MAP of 65' : 'an epinephrine infusion to a MAP of 65',
    has(s, 'paced') ? 'keep pacing, with analgesia' : 'pace if she stays slow',
    has(s, 'dextrose') || has(s, 'glucose-by-mouth') ? 'recheck her glucose' : 'treat her glucose',
  ].join('; ').replace(/^./, (c) => c.toUpperCase());
}

/**
 * The same experts in her cardiac arrest: the arrest's own care, on scene. Never pacing (the built-in harm), and no
 * glucagon or infusion titrated to a pressure she does not have. Glucagon is named only once they know what she took.
 */
const arrestOrders = (s: SimState) => `no pulse — CPR and epinephrine 1 mg every 3–5 minutes, and work the arrest on scene; no pacing in arrest.${has(s, 'sample') ? ' Glucagon will not restart her either.' : ''}`;

/** What she says, or does, when reassessed */
function status(s: SimState, p: Picture): string {
  if (!s.pulse) return 'Unresponsive.';
  if (p.gcs <= 8) return 'No response to her name; slow, snoring breaths.';
  if (p.gcs < 13) return 'Mumbles a word or two; her eyes keep closing.';
  if (p.rhythm.profile === 'tcp' && !has(s, 'analgesia')) return '"Ow — that thumping in my chest hurts!"';
  if (p.sbp >= 90) return '"I feel more awake… I\'m sorry. I just wanted to sleep and not wake up."';
  return '"So tired… everything spins when I lift my head."';
}

export const betaBlockerField: Scenario = {
  id: 'beta-blocker-overdose-field',
  title: 'Drowsy beside an empty bottle',
  summary: '44-year-old woman found drowsy by her sister, with a slow pulse, a low blood pressure and an empty pill bottle. Find out what she took, and treat the poison — not just the rate.',
  setting: 'field',
  roles: [2],
  difficulty: 'advanced',
  conditionId: 'junctional-rhythm',
  briefing: {
    default: [
      ['dispatch', 'Priority 1: 44-year-old woman "not acting right," per her sister.'],
      ['scene', 'She is slumped on the couch, pale and slow to answer. Her sister is holding an empty pharmacy bottle and a phone: "She texted me \'sorry\' and stopped answering."'],
      ['hospital', 'Heart center (ICU, transvenous pacing, ECMO): 14 minutes. Nearest emergency department: 8 minutes.'],
    ],
  },
  initial: {
    rhythm: { profile: 'junctional', hr: 38 },
    vitals: { sbp: 74, dbp: 40, spo2: 95, rr: 14, etco2: 36, pain: 0, gcs: 13, glucose: 58, temp: 35.9 },
  },
  // calcium and high-dose insulin are for this overdose: the built-in rules do not count them as given without a reason
  problems: ['beta-blocker-overdose'],
  facts: {
    opqrst: 'No pain. "Just so tired… and dizzy when I sit up."',
    sample: 'Her sister: "That\'s her metoprolol — the long-acting kind, 100 mg. She picked up 30 last week and the bottle is empty. She texted me about two hours ago." No allergies. Takes it for high blood pressure, and sertraline for depression (that bottle looks full). Nothing to eat today, no alcohol that her sister knows of.',
    pde5: 'No.',
    lungs: 'Clear and equal on both sides.',
    perfusion: (s) => (s.vitals.sbp >= 90
      ? 'Hands warmer; capillary refill 2–3 seconds; radial pulse easy to feel.'
      : 'Pale, cool and clammy; capillary refill 4 seconds; weak radial pulse; neck veins flat.'),
    neuro: (s) => `${s.vitals.gcs >= 13 ? 'Drowsy but follows commands' : s.vitals.gcs > 8 ? 'Opens her eyes to a loud voice, confused' : 'Groans to pain only'}; pupils 4 mm, equal and reactive; moves all four limbs; no focal deficit.`,
    ecg12: (s) => {
      const hr = s.rhythm.hr;
      const cause = has(s, 'sample')
        ? 'With the hypotension and the empty metoprolol bottle, this is beta-blocker toxicity; a narrow QRS fits metoprolol (propranolol can widen it, sotalol lengthens the QT).'
        : 'Look for the cause: beta-blockers, calcium-channel blockers or digoxin, an inferior MI, a high potassium, the cold.';
      if (s.rhythm.profile === 'junctional') return `Junctional rhythm at ${hr}: regular narrow QRS complexes with no P wave before them (inverted retrograde P waves after some in II, III and aVF); QRS narrow, QTc about 410 ms, no ST elevation. ${cause}`;
      if (s.rhythm.profile === 'sinus-bradycardia') return `Sinus bradycardia at ${hr}: a P wave before every narrow QRS, normal PR, QRS and QT, no ST elevation — the sinus node is waking up with the treatment.`;
      if (s.rhythm.profile === 'tcp') return 'Paced at 70: a wide QRS after every pacing spike — electrical capture. Feel for a femoral pulse at 70 to confirm the pacing moves blood.';
      return `Sinus rhythm at ${hr}: normal PR, QRS and QT, no ST elevation.`;
    },
    // the poison center needs what the bottle says; once SAMPLE has found it, it advises as medical control does — for her
    // as she is now, and in the arrest the arrest comes first
    poisonControl: (s) => {
      const bottle = 'read us the bottle — the drug, the strength and whether it is extended-release — how many are missing, and when. Then call us back.';
      if (!s.pulse) {
        return has(s, 'sample')
          ? `Poison center: "She has ${arrestOrders(s)} Call us back with ROSC: then an epinephrine infusion to a MAP of 65; the hospital should have high-dose insulin ready, and an extended-release tablet means at least 24 hours of monitoring."`
          : `Poison center: "She has ${arrestOrders(s)} When you can, ${bottle}"`;
      }
      return has(s, 'sample')
        ? `Poison center: "Extended-release metoprolol, up to 3 grams, about two hours ago: expect her to get worse, and for it to last. ${orders(s)}. The hospital should have high-dose insulin ready, and she needs at least 24 hours of monitoring for an extended-release tablet."`
        : `Poison center: "Tell us what she took: ${bottle}"`;
    },
  },
  status: (s) => status(s, picture(s)),
  respond: {
    // ── assessment: every look at her reads the picture as it is now (short-acting drugs wear off)
    vitals: (s) => {
      if (!s.pulse) return null;
      const at = end(s, 'vitals');
      return settle(s, s, at, [], (p) => [['you', `BP ${p.sbp}/${p.dbp} · pulse ${p.rhythm.hr} · RR ${s.vitals.rr} · SpO₂ ${s.vitals.spo2}%`]], ['bp']);
    },
    nibp: (s) => {
      if (!s.pulse || !has(s, 'monitor')) return null;
      return settle(s, s, end(s, 'nibp'), [], (p) => [['monitor', `NIBP ${p.sbp}/${p.dbp} mmHg.`]], ['bp']);
    },
    reassess: (s) => {
      if (!s.pulse) return null;
      const at = end(s, 'reassess');
      return settle(s, s, at, [], (p) => [
        ['you', `BP ${p.sbp}/${p.dbp} · pulse ${p.rhythm.hr} · RR ${s.vitals.rr} · SpO₂ ${s.vitals.spo2}%`],
        ['patient', status(s, p)],
      ]);
    },
    'pulse-check': (s) => {
      if (!s.pulse) return null;
      return settle(s, s, end(s, 'pulse-check'), [], (p) => (p.rhythm.profile === 'tcp'
        ? [p.sbp >= 90
          ? ['you', 'Femoral pulse at 70, matching the pacer: mechanical capture.', 'good']
          : ['you', 'Femoral pulse at 70, matching the pacer: mechanical capture — but the pulse is weak.', 'warn']]
        : [['you', `Pulse present: ${p.rhythm.hr}/min${p.sbp < 90 ? ', weak and thready' : ''}.`]]), has(s, 'paced') ? ['capture-confirmed'] : []);
    },
    // the 12-lead records the heart as it is when the tracing is taken: a short-acting drug that has worn off is gone from it
    ecg12: (s) => (s.pulse ? settle(s, s, end(s, 'ecg12'), [], () => [['monitor', '12-lead acquired.']], ['ecg12', 'monitor']) : null),
    'ecg12-repeat': (s) => (s.pulse && has(s, 'ecg12')
      ? settle(s, s, end(s, 'ecg12-repeat'), [], () => [['monitor', '12-lead re-acquired.']], ['ecg12', 'monitor', 'ecg12-repeat'])
      : null),
    // the cath lab is for an artery to open; the cardiologist hears there is no ST elevation and stands the team down
    'stemi-alert': (s) => (has(s, 'ecg12')
      ? { say: [['hospital', 'The interventional cardiologist reviews your 12-lead: no ST elevation — the cath lab is not activated. Treat the cause of the slow rate, and bring her in.', 'warn']], flags: ['alert-declined'] }
      : null),

    // ── glucose: the check remembers a low reading, so the first dose for it is never judged on a later value
    glucose: (s) => {
      const g = s.vitals.glucose;
      return { say: [['you', `Blood glucose ${g} mg/dL.`]], flags: g < LOW_GLUCOSE ? ['low-glucose'] : [] };
    },
    dextrose: (s) => {
      if (!s.pulse) return null;
      const glucose = s.vitals.glucose + 120;
      return settle(s, after(s, { id: 'dextrose', vitals: { glucose } }), end(s, 'dextrose'), [['you', 'Dextrose 25 g IV in.']],
        (p) => awake(p, '"Where am I? … Why are you all here?"'), ['dextrose'], { vitals: { glucose } });
    },
    'oral-glucose': (s) => {
      // too drowsy to swallow: the engine's own response (the gel pools in the cheek, and its safety rule)
      if (!canSwallow(s)) return null;
      const glucose = s.vitals.glucose + 40;
      return settle(s, after(s, { id: 'oral-glucose', vitals: { glucose } }), end(s, 'oral-glucose'), [['patient', 'Swallows the glucose gel.']],
        () => [], ['oral-glucose', 'glucose-by-mouth'], { vitals: { glucose } });
    },

    // ── the slow rate and the low pressure
    atropine: (s) => {
      if (!s.pulse) return { say: [['you', 'Atropine given — it has no place in cardiac arrest and changes nothing on the monitor.']], flags: ['atropine'] };
      if (count(s, 'atropine') > 0) return { say: [['monitor', has(s, 'paced') ? 'No change: the pacer holds 70.' : 'No change in heart rate.']], flags: ['atropine'] };
      const until = end(s, 'atropine') + ATROPINE_LASTS;
      return settle(s, after(s, { id: 'atropine', timers: { atropineUntil: until } }), end(s, 'atropine'), [],
        (p) => [['monitor', numbers(p)]], ['atropine'], { timers: { atropineUntil: until } });
    },
    glucagon: (s) => {
      // the bolus she needed was for her slow rate and low pressure: in the arrest it is CPR and epinephrine, and it does not count
      if (!s.pulse) return { say: [['you', 'Glucagon given — in the arrest it changes nothing on the monitor: CPR and epinephrine come first.']] };
      const done = end(s, 'glucagon');
      const timers = { glucagonUntil: done + GLUCAGON_LASTS, glucagonGiven: s.timers.glucagonGiven ?? s.minute };
      const glucose = s.vitals.glucose + 30;
      const dose = count(s, 'glucagon') === 0 ? 'Glucagon 5 mg IV over 3 minutes.' : 'Another 5 mg of glucagon IV (10 mg in all).';
      // vomiting is the rule at these doses: the drowsy patient is rolled and suctioned
      const sick: Line = s.vitals.gcs >= 13 ? ['patient', '"I\'m going to be sick…" — and vomits.'] : ['partner', 'Vomiting: rolled onto her side and suctioned.', 'warn'];
      return settle(s, after(s, { id: 'glucagon', timers, vitals: { glucose } }), done, [['you', dose], sick],
        (p) => [['monitor', numbers(p), p.sbp >= 90 ? 'good' : 'info']], ['glucagon'], { timers, vitals: { glucose } });
    },
    pressor: (s) => {
      if (!s.pulse) return null;
      return settle(s, after(s, { id: 'pressor', flags: ['pressor'] }), end(s, 'pressor'), [],
        (p) => [['monitor', `Epinephrine infusion started at 2 mcg/min and titrated up: ${p.rhythm.profile === 'tcp' ? 'the pacer holds 70' : `heart rate ${p.rhythm.hr}`}, ${BP(p)}.`, p.sbp >= 90 ? 'good' : 'info']], ['pressor']);
    },
    'push-epi': (s) => {
      if (!s.pulse) return null;
      const until = end(s, 'push-epi') + PUSH_EPI_LASTS;
      return settle(s, after(s, { id: 'push-epi', timers: { pushEpiUntil: until } }), end(s, 'push-epi'), [['you', 'Epinephrine 10 mcg IV push.']],
        (p) => [['monitor', `${numbers(p)} It will last a few minutes.`]], ['push-epi'], { timers: { pushEpiUntil: until } });
    },
    // the arrest dose with a pulse: a pressure surge, then it wears off (the built-in rule penalizes it)
    epinephrine: (s) => {
      if (!s.pulse) return null;
      const until = end(s, 'epinephrine') + EPI_BOLUS_LASTS;
      return settle(s, after(s, { id: 'epinephrine', timers: { epiBolusUntil: until } }), end(s, 'epinephrine'), [['you', 'Epinephrine 1 mg IV.']],
        (p) => [['monitor', numbers(p), 'bad'], ...awake(p, '"My head — it\'s pounding!"', 'bad')], ['epi'], { timers: { epiBolusUntil: until } });
    },
    fluid: (s) => {
      if (!s.pulse) return null;
      return settle(s, after(s, { id: 'fluid' }), end(s, 'fluid'), [], (p) => [['monitor', `Bolus in. ${BP(p)}.`]], ['fluid']);
    },
    'calcium-chloride': (s) => {
      if (!s.pulse) return null;
      return settle(s, after(s, { id: 'calcium-chloride' }), end(s, 'calcium-chloride'), [['you', 'Calcium chloride 1 g in slowly over a few minutes; line flushed.']],
        (p) => [...awake(p, '"That burns going up my arm."'), ['monitor', `${BP(p)}.`]], ['calcium']);
    },
    pace: (s) => {
      // pacing in arrest, or a rate that needs no pacer: the engine's own response
      if (!s.pulse || has(s, 'paced') || !slowAndFailing(s)) return null;
      // only a patient who still feels it needs analgesia for it; a dose given just before covers it
      const feels = s.vitals.gcs >= 9;
      const covered = feels && premedicated(s);
      const flags = ['pads', 'monitor', 'paced', ...(feels ? ['paced-awake'] : []), ...(covered ? ['analgesia'] : [])];
      return settle(s, after(s, { id: 'pace', flags: ['paced'] }), end(s, 'pace'), [['monitor', 'Pacer on: rate 70, output turned up to 90 mA.']],
        (p) => [...(covered ? awake(p, '"That thumps… but I can stand it."') : awake(p, '"Ow! What is that?"', 'bad')), ['monitor', `${BP(p)}.`]],
        flags, { vitals: { pain: covered ? 2 : 6 } });
    },
    // with the pacer on it is analgesia; just before pacing it is premedication; with neither it only deepens the shock
    fentanyl: (s) => {
      if (!s.pulse) return null;
      const pacing = has(s, 'paced');
      const premed = !pacing && slowAndFailing(s);
      return settle(s, after(s, { id: 'fentanyl' }), end(s, 'fentanyl'), [['you', 'Fentanyl 25 mcg IV.']],
        (p) => [...(pacing ? awake(p, '"That\'s easier, thank you."', 'good') : []), ['monitor', `${BP(p)}.`]],
        pacing ? ['analgesia'] : ['opioid', ...(premed ? ['premed'] : [])], pacing ? { vitals: { pain: 2 } } : {});
    },
    sedation: (s) => sedate(s, 'sedation', 'Small dose of sedation and analgesia; capnography on.'),
    midazolam: (s) => sedate(s, 'midazolam', has(s, 'iv') ? 'Midazolam 2.5 mg IV; capnography on.' : 'Midazolam 5 mg IM; capnography on.'),

    // ── the wrong drugs do what they would
    diltiazem: harmful('diltiazem', 'Diltiazem in.', 'diltiazem'),
    metoprolol: harmful('metoprolol', 'Metoprolol 5 mg IV.', 'beta-blocker'),
    lidocaine: harmful('lidocaine', 'Lidocaine in.', 'lidocaine'),
    'amio-infusion': harmful('amio-infusion', 'Amiodarone 150 mg running over 10 minutes.', 'amiodarone'),
    'amio-arrest': harmful('amio-arrest', 'Amiodarone 300 mg IV push.', 'amiodarone'),
    procainamide: harmful('procainamide', 'Procainamide running at 30 mg/min.', 'procainamide'),
    nitro: harmful('nitro', 'Nitroglycerin 0.4 mg under the tongue.', 'nitro'),
    'nitro-high': harmful('nitro-high', 'Nitroglycerin 0.8 mg under the tongue.', 'nitro'),
    'magnesium-sulfate': harmful('magnesium-sulfate', 'Magnesium sulfate 2 g running over 15 minutes.', 'magnesium'),
    cpap: harmful('cpap', 'CPAP applied at 5 cmH₂O.', 'cpap'),
    // adenosine blocks the AV node for seconds: a pause, then the same beats (the pacer is not blocked)
    adenosine6: (s) => (s.pulse ? { say: [['monitor', has(s, 'paced') ? 'No change: the pacer holds 70.' : 'Seven seconds with no QRS complexes… then the same slow beats return.', 'bad']], flags: ['adenosine'] } : null),
    adenosine12: (s) => (s.pulse ? { say: [['monitor', has(s, 'paced') ? 'No change: the pacer holds 70.' : 'Nine seconds with no QRS complexes… then the same slow beats return.', 'bad']], flags: ['adenosine'] } : null),
    vagal: (s) => (s.pulse && !has(s, 'paced') ? { say: [['monitor', 'Heart rate 33 for a few seconds, then back.', 'bad']], flags: ['vagal'] } : null),
    // the potassium dose of albuterol: the poisoned receptors give no rate back, only the tremor (the built-in rule penalizes it)
    'albuterol-hyperk': (s) => (s.pulse
      ? settle(s, s, end(s, 'albuterol-hyperk'), [['you', 'High-dose albuterol nebulizer running.']], (p) => [...awake(p, '"I feel shaky."'), ['monitor', numbers(p)]], ['albuterol-hyperk'])
      : null),

    // ── airway: only once she can no longer protect it (an awake patient gets the engine's response)
    bvm: (s) => (s.pulse && s.vitals.gcs <= 8
      ? { say: [['you', 'Assisting her breathing, 1 breath every 6 s: SpO₂ 97 %, EtCO₂ 40.']], vitals: { spo2: 97, rr: 12, etco2: 40 }, flags: ['ventilated'] }
      : null),
    airway: (s) => (s.pulse && s.vitals.gcs <= 8
      ? { say: [['you', 'Airway placed; confirmed with waveform capnography. Ventilating 1 breath every 6 s: SpO₂ 97 %, EtCO₂ 40.']], vitals: { spo2: 97, rr: 12, etco2: 40 }, flags: ['airway', 'ventilated'] }
      : null),

    // ── expert advice: medical control brings in the poison center, once you can tell them what she took
    // a call can be repeated: in her arrest it gets the arrest's orders (the drug, if known, is for after ROSC)
    'med-control': (s) => {
      if (!s.pulse) {
        return has(s, 'sample')
          ? {
            say: [['hospital', `Medical control, with the poison center on the line: ${arrestOrders(s)} Call me back with ROSC: then an epinephrine infusion to a MAP of 65, and we will have high-dose insulin ready.`]],
            flags: ['med-control', 'consulted'],
          }
          : { say: [['hospital', `Medical control: ${arrestOrders(s)} Find out from her sister what she took, and call me back with ROSC.`]], flags: ['med-control'] };
      }
      return has(s, 'sample')
        ? {
          say: [['hospital', `Medical control, with the poison center on the line: extended-release metoprolol, up to 3 grams, two hours ago — expect it to get worse and to last. ${orders(s)}. We will have high-dose insulin ready.`]],
          flags: ['med-control', 'consulted'],
        }
        : { blocked: true, say: [['system', 'Find out what she took first (SAMPLE): medical control and the poison center need the drug, the dose and the time.']] };
    },
    notify: (s) => (has(s, 'sample')
      ? { say: [['hospital', 'Copy: extended-release metoprolol, slow and hypotensive. We are calling the poison center and getting high-dose insulin and a pacing wire ready; the ICU knows.']], flags: ['notified', 'consulted'] }
      : null),
  },
  events: [
    {
      // beta-blockers hide the shakes and the racing heart of a low glucose, not the sweating
      id: 'glucose-falls',
      when: (s) => s.pulse && s.minute >= 12 && s.vitals.glucose < LOW_GLUCOSE,
      effect: (s) => settle(s, after(s, { vitals: { glucose: 44 } }), s.minute, [['partner', 'She is sweaty now, and much harder to wake.', 'bad']], () => [], [], { vitals: { glucose: 44 } }),
    },
    {
      id: 'glucagon-fades',
      when: (s) => s.pulse && count(s, 'glucagon') > 0 && !has(s, 'pressor') && s.minute >= s.timers.glucagonUntil,
      effect: (s) => settle(s, s, s.minute, [['partner', 'The glucagon is wearing off: she is slowing down and going pale again.', 'bad']], (p) => [['monitor', numbers(p), 'bad']], ['glucagon-faded']),
    },
    {
      // a second dose given after the first one faded wears off too
      id: 'glucagon-fades-again',
      when: (s) => s.pulse && s.fired.includes('glucagon-fades') && s.timers.glucagonUntil > s.flags['glucagon-faded'] && !has(s, 'pressor') && s.minute >= s.timers.glucagonUntil,
      effect: (s) => settle(s, s, s.minute, [['partner', 'The second dose is wearing off as well.', 'bad']], (p) => [['monitor', numbers(p), 'bad']]),
    },
    // the other short-acting drugs: atropine is timed once (a repeat dose does nothing), the epinephrine doses each time
    ...fades('atropineUntil', 'The atropine has worn off.', 1),
    ...fades('pushEpiUntil', 'The push-dose epinephrine has worn off.', 12),
    ...fades('epiBolusUntil', 'The epinephrine surge has worn off.', 6),
    {
      // extended-release tablets keep releasing the drug: unsupported, she gets worse
      id: 'worse',
      when: (s) => s.pulse && s.minute >= 10 && !has(s, 'peri') && !supported(s),
      effect: (s) => settle(s, after(s, { flags: ['worse'] }), s.minute, [['partner', 'She is harder to rouse, and her hands are cold.', 'bad']], (p) => [['monitor', numbers(p), 'bad']], ['worse']),
    },
    {
      id: 'peri',
      when: (s) => s.pulse && has(s, 'worse') && s.minute >= Math.max(20, s.flags.worse + 8) && !supported(s),
      effect: (s) => settle(s, after(s, { flags: ['peri'] }), s.minute, [['partner', 'She only groans to a sternal rub now, and her breathing is slow and snoring.', 'bad']],
        (p) => [['monitor', numbers(p), 'bad']], ['peri'], { vitals: { rr: 8, spo2: 90, etco2: 50 } }),
    },
    {
      // a pacer that captures keeps a low output going: she stays obtunded and hypotensive, but she does not arrest
      id: 'arrest-untreated',
      when: (s) => s.pulse && has(s, 'peri') && !has(s, 'arrest') && s.minute >= s.flags.peri + 6 && !supported(s) && !has(s, 'paced'),
      effect: () => arrest([]),
    },
    {
      // CPR and epinephrine bring back a pulse — with the poison still there, and a brain that has been without flow
      id: 'rosc',
      when: (s) => !s.pulse && has(s, 'arrest')
        && s.performed.filter((p) => p.id === 'cpr' && p.minute >= s.flags.arrest).length >= 2
        && s.performed.some((p) => p.id === 'epinephrine' && p.minute >= s.flags.arrest),
      effect: (s) => {
        const p = picture(after(s, { flags: ['rosc', 'peri'] }));
        return {
          say: [['you', 'After CPR and epinephrine: a weak carotid pulse — ROSC.', 'good'], ['monitor', numbers(p)]],
          pulse: true, rhythm: p.rhythm, vitals: { sbp: p.sbp, dbp: p.dbp, gcs: p.gcs, rr: 6, spo2: 88, etco2: 46 }, flags: ['peri', 'obtunded'],
        };
      },
    },
  ],
  critical: [
    // only once she has arrested (an AV-nodal blocker on top of the overdose, or no support): PEA, worked on scene.
    // First, so that a hint in the arrest names CPR and epinephrine, not the pacing pads or the 12-lead. The why names
    // no drug: as a hint it can show before the history has found the bottle
    {
      id: 'arrest-cpr', label: 'Cardiac arrest: CPR at once', why: 'PEA is not shockable: high-quality CPR at once, without pauses, then epinephrine — and the cause, the poison. No pacing in arrest.',
      done: ['cpr'], after: 'arrest', points: 10, target: { within: { flag: 'arrest', minutes: 1 } }, applies: (s) => has(s, 'arrest'),
    },
    {
      id: 'arrest-epi', label: 'Cardiac arrest: epinephrine as soon as possible', why: 'For PEA, epinephrine 1 mg IV/IO as soon as possible, then every 3–5 minutes.',
      done: ['epinephrine'], after: 'arrest', points: 5, target: { within: { flag: 'arrest', minutes: 5 } }, applies: (s) => has(s, 'arrest'),
    },
    // a pulse needs more than the first cycle: until it returns, a hint keeps naming the resuscitation, not the pads
    {
      id: 'arrest-cycles', label: 'Cardiac arrest: keep up CPR cycles until a pulse returns',
      why: 'Compressions straight back on after each 2-minute rhythm and pulse check, epinephrine every 3–5 minutes, and the cause — the poison — in mind. No pacing in arrest.',
      done: (s) => s.flags.rosc ?? null, uses: ['cpr'], points: 5, applies: (s) => has(s, 'arrest'),
    },
    { id: 'pads', label: 'Monitor and pacing pads on at once', why: 'A slow rate with a systolic pressure in the 70s: with pads on you can pace in seconds if the drugs fail.', done: PADS, points: 10, target: { by: 5 } },
    // a hint shows these before the history is taken, so they point to the question, not to the answer
    { id: 'ecg', label: '12-lead ECG', why: 'The rhythm, the QRS width and the QT (some overdoses widen the QRS or lengthen the QT), and no inferior STEMI behind the slow rate.', done: ['ecg12'], points: 5, target: { by: 15 } },
    { id: 'ingestion', label: 'Find out what she took, how much and when', why: 'The empty bottle is the key: the drug, its form (immediate or extended release), the dose and the time decide the treatment, the call to the poison center and how long she must be watched. Bring every bottle.', done: ['sample'], points: 10, target: { by: 8 } },
    { id: 'iv', label: 'IV access', why: 'For dextrose, glucagon and the epinephrine infusion.', done: ['iv', 'io'], points: 5, target: { by: 8 } },
    { id: 'glucose', label: 'Check the blood glucose', why: 'Every drowsy patient gets a glucose check. Beta-blockers can lower it and hide the warning signs (no shakes, no racing heart — only the sweating); a high glucose points to a calcium-channel blocker instead.', done: ['glucose'], points: 5, target: { by: 10 } },
    {
      id: 'dextrose', label: 'Correct the low glucose', why: 'A glucose under 70 mg/dL in a drowsy patient: IV dextrose (by mouth only if she can swallow and protect her airway).',
      done: (s) => {
        const from = s.flags['low-glucose'];
        if (from === undefined) return null;
        const hits = [firstDone(s, ['dextrose'], 'low-glucose'), s.flags['glucose-by-mouth'] !== undefined && s.flags['glucose-by-mouth'] >= from ? s.flags['glucose-by-mouth'] : null];
        const ok = hits.filter((m): m is number => m !== null);
        return ok.length ? Math.min(...ok) : null;
      },
      uses: ['dextrose', 'oral-glucose'], points: 5, applies: (s) => has(s, 'low-glucose'), target: { within: { flag: 'low-glucose', minutes: 5 } },
    },
    {
      id: 'glucagon', label: 'Glucagon IV for the slow rate and the low pressure',
      why: 'Glucagon raises the rate and the squeeze through its own receptor, past the blocked beta receptors: a bolus, then an infusion, is reasonable for bradycardia or hypotension from a beta-blocker overdose (2025 AHA). Expect vomiting.',
      done: (s) => s.timers.glucagonGiven ?? null, uses: ['glucagon'], points: 15, target: { by: 12 },
    },
    {
      id: 'pressor', label: 'Epinephrine infusion for the hypotension',
      why: 'A vasopressor is recommended for hypotension from a beta-blocker overdose (AHA 2023 poisoning update); epinephrine adds rate and squeeze as well as tone and, unlike a glucagon bolus, it lasts. Titrate to a MAP of 65 or more.',
      done: ['pressor'], points: 15, target: { by: 18 },
    },
    { id: 'consult', label: 'Expert advice early: medical control and the poison center', why: 'Glucagon and an infusion are often an online-medical-control order, and the poison center (1-800-222-1222) and the hospital can get high-dose insulin, pacing and ECMO ready before she arrives.', done: ['med-control', 'notify', 'poison-control'], after: 'sample', points: 5 },
    { id: 'capture', label: 'Confirm mechanical capture with a pulse', why: 'Spikes followed by wide complexes are electrical capture only: feel a femoral pulse at the paced rate (or check the BP).', done: ['pulse-check', 'nibp', 'vitals'], after: 'paced', points: 5, applies: (s) => has(s, 'paced') },
    {
      id: 'analgesia', label: 'Analgesia for pacing', why: 'Transcutaneous pacing hurts: a small dose of fentanyl (or sedation) just before the pacer goes on, or as soon as it captures.',
      // premedication counts: a dose in the few minutes before the pacer started, or any dose after
      done: (s) => {
        const pace = paceStart(s);
        const hit = pace === null ? undefined : s.performed.find((p) => ANALGESICS.includes(p.id) && p.minute >= pace - PREMED_WINDOW);
        return hit ? hit.minute : null;
      },
      uses: ANALGESICS, points: 5, applies: (s) => has(s, 'paced-awake'),
    },
    { id: 'airway', label: 'Support her breathing once she cannot protect her airway', why: 'At a GCS of 8 or less with slow, snoring breaths: bag-valve-mask ventilation or an advanced airway — and suction, because glucagon makes her vomit.', done: ['bvm', 'airway'], after: 'obtunded', points: 5, applies: (s) => has(s, 'obtunded'), target: { within: { flag: 'obtunded', minutes: 3 } } },
    { id: 'transport', label: 'Transport early', why: 'Treat on the way: she needs high-dose insulin, perhaps a transvenous pacing wire or ECMO, and 24 hours of ICU monitoring for an extended-release tablet.', done: ['transport-pci', 'transport-near'], points: 10, target: { by: 20 } },
    { id: 'handoff', label: 'Hand-off', why: 'The drug and its form (extended-release), the dose and the time, the glucose, what you gave and how she responded, and that this was a suicide attempt.', done: ['handoff'], points: 5 },
  ],
  harms: [
    { id: 'av-blocker', actions: ['diltiazem', 'metoprolol'], points: 20, severity: 'critical', text: 'Another AV-nodal blocker on top of a beta-blocker overdose. A calcium-channel blocker or more beta-blocker slows the heart, weakens the squeeze and opens the vessels further, and can stop the heart: treat the poison, never add to it.' },
    { id: 'adenosine-brady', actions: ['adenosine6', 'adenosine12'], points: 10, severity: 'major', text: 'Adenosine for a slow rhythm. It blocks the AV node and gives seconds of standstill; it is a drug for a fast, regular narrow-complex tachycardia.' },
    // one penalty for one mistake: these stand in for the engine's procainamide and arrest-dose amiodarone rules
    { id: 'antiarrhythmic-brady', actions: ['lidocaine', 'amio-infusion', 'amio-arrest', 'procainamide'], when: (s) => s.pulse, points: 15, severity: 'critical', replaces: ['procainamide-slow', 'procainamide-hypotension', 'arrest-amio-with-pulse'], text: 'An antiarrhythmic for a slow rhythm with a low pressure. Amiodarone and procainamide slow conduction and drop the pressure, and all three can suppress the backup pacemaker that is keeping her going; there is nothing here to suppress.' },
    // her arrest is an organized rhythm without a pulse: nothing for amiodarone or lidocaine to treat (procainamide has its own built-in rule)
    { id: 'antiarrhythmic-pea', actions: ['lidocaine', 'amio-infusion', 'amio-arrest'], when: (s) => !s.pulse, points: 3, severity: 'minor', text: 'An antiarrhythmic in a cardiac arrest without VF or VT. Amiodarone and lidocaine are for shock-refractory VF or pulseless VT; with an organized rhythm and no pulse: CPR, epinephrine and the cause.' },
    { id: 'atropine-loop', actions: ['atropine'], when: (s) => s.pulse && count(s, 'atropine') >= 2 && !escalated(s), points: 5, severity: 'major', text: 'A third dose of atropine with nothing else started, while the pressure falls. Atropine often does little in a beta-blocker overdose: when the first dose fails, move on — glucagon, an epinephrine infusion, pacing.' },
    { id: 'atropine-in-arrest', actions: ['atropine'], when: (s) => !s.pulse, points: 3, severity: 'minor', text: 'Atropine in cardiac arrest. It is no longer recommended for PEA or asystole: CPR, epinephrine and the reversible causes.' },
    // the engine's own rule judges on the real glucose; after a low one was found, the first dose is right even if glucagon has since raised it
    { id: 'glucose-not-low', actions: ['oral-glucose', 'dextrose'], when: (s) => s.vitals.glucose >= LOW_GLUCOSE && !(has(s, 'low-glucose') && count(s, 'dextrose') === 0 && !has(s, 'glucose-by-mouth')), points: 3, severity: 'minor', text: 'Glucose given with a blood glucose of 70 mg/dL or more. Check it first: glucose treats a low one, and a high glucose harms an injured brain or heart.' },
    // a dose while she is slow and failing may be premedication for the pacer: judged at the hand-off, by whether pacing followed
    // her own rule judges midazolam as it judges sedation (premedication for the pacer is right even with a low pressure)
    { id: 'sedative-no-indication', actions: ['fentanyl', 'sedation', 'midazolam'], replaces: ['midazolam-unsafe'], when: (s) => s.pulse && !has(s, 'paced') && !slowAndFailing(s), points: 5, severity: 'minor', text: 'An opioid or a sedative with no pain to treat and no pacing to cover. In a drowsy patient with a low pressure it deepens the sedation and the hypotension.' },
    { id: 'premed-no-pacing', actions: ['handoff'], when: (s) => premedUnused(s), points: 5, severity: 'minor', text: 'Fentanyl or sedation given before pacing that never came. Premedicate just before the pacer goes on; with no pacing, an opioid or a sedative in a drowsy patient with a low pressure only deepens the sedation and the hypotension.' },
    { id: 'false-stemi-alert', actions: ['stemi-alert'], when: (s) => s.pulse, points: 3, severity: 'minor', replaces: ['stemi-alert-no-ste'], text: 'A STEMI alert without ST elevation. Her 12-lead shows none: the slow rate and the low pressure have another cause, and the cath lab team is called in for nothing.' },
    { id: 'cpap-shock', actions: ['cpap'], when: (s) => s.pulse, points: 6, severity: 'major', text: 'CPAP for a patient who is not short of breath. It cuts the venous return; with a systolic pressure in the 70s it deepens the shock.' },
    { id: 'magnesium-no-indication', actions: ['magnesium-sulfate'], when: (s) => s.pulse, points: 3, severity: 'minor', text: 'Magnesium without torsades or a long QT. It has no role in a metoprolol overdose and drops the pressure (sotalol, which lengthens the QT, is the exception).' },
    // stands in for the engine's rule (a rate of 50 or more): here a rate of 50–59 with the pressure still low may be paced
    { id: 'pace-not-slow', actions: ['pace'], when: (s) => s.pulse && !has(s, 'paced') && !slowAndFailing(s), points: 5, severity: 'minor', text: 'Transcutaneous pacing without a slow, failing rate to treat. Pace a rate under 50 — or under 60 with the pressure still under 90 — that the drugs have not fixed; above that it adds pain, not perfusion.' },
    { id: 'vagal-brady', actions: ['vagal'], when: (s) => s.pulse, points: 3, severity: 'minor', text: 'A vagal maneuver for a slow rhythm. It slows the heart further; it is for a fast, regular narrow-complex tachycardia.' },
  ],
  timings: [
    { label: 'Pads on', actions: PADS, target: 5 },
    { label: 'Glucose checked', actions: ['glucose'], target: 10 },
    { label: 'Glucagon', actions: ['glucagon'], target: 12 },
    { label: 'Epinephrine infusion', actions: ['pressor'], target: 18 },
    { label: 'Transport started', actions: ['transport-pci', 'transport-near'], target: 20 },
  ],
  transportMinutes: 14,
  nearestMinutes: 8,
  arrival: 'You arrive; the emergency team takes over, with high-dose insulin being mixed and the poison center on the phone.',
  teaching: [
    'Think of a beta-blocker or calcium-channel-blocker overdose in anyone slow and hypotensive: ask what they take, count the pills, bring every bottle — and treat a suicide attempt as one: never leave the patient alone.',
    'Check the glucose in every drowsy patient. Beta-blockers can lower it and hide the warning signs (no shakes, no racing heart; the sweating remains); a high glucose points to a calcium-channel blocker.',
    'Atropine (0.5–1 mg) may be tried and pacing may be reasonable (AHA 2023 poisoning update), but both often fail here: do not keep repeating atropine while the pressure falls.',
    'Glucagon works past the blocked beta receptors: a bolus of 3–10 mg (0.05–0.15 mg/kg) IV over 3–5 minutes, then an infusion, is reasonable for bradycardia or hypotension (2025 AHA). Its effect fades within 10–20 minutes, and it makes patients vomit: protect the airway.',
    'A vasopressor is recommended for the hypotension (AHA 2023 poisoning update): an epinephrine infusion adds rate and squeeze as well as tone. Titrate to a MAP of 65 or more.',
    'Transcutaneous pacing fixes the rate, not the poisoned squeeze: confirm mechanical capture with a femoral pulse, expect the pressure to still need a vasopressor, and give analgesia (just before the pacer goes on, if there is time).',
    'In hospital: high-dose insulin is recommended for hypotension despite, or alongside, vasopressors (about 1 unit/kg IV, then 1–10 units/kg/h, with dextrose and potassium; AHA 2023 and 2025); calcium may be reasonable, and hemodialysis may be reasonable for atenolol, nadolol or sotalol (2025 AHA); VA-ECMO is reasonable for shock that drugs cannot reverse, and lipid emulsion is not likely to help (AHA 2023).',
    'Extended-release tablets can make the poisoning start late and last more than 24 hours: ICU monitoring even when the patient looks better.',
    'Never add an AV-nodal blocker (a calcium-channel blocker, more beta-blocker, adenosine) or an antiarrhythmic that can slow conduction or suppress the backup pacemaker (amiodarone, procainamide, lidocaine).',
    'The exceptions: propranolol also blocks sodium channels (a wide QRS, seizures — sodium bicarbonate) and sotalol lengthens the QT (torsades — magnesium). Call the poison center early: 1-800-222-1222.',
  ],
};
