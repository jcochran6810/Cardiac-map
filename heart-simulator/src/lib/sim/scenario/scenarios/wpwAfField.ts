import type { Effect, Line, Scenario, SimState } from '../types';
import { PADS, bpAfter, has, line } from '../kit';
import { nitrateCaseRule } from '../rules/acs';
import { LIDOCAINE_RULES, RATE_RULES, yieldToHeavier } from '../rules/rhythm';
import { cpapHarmful } from '../rules/support';

/**
 * Pre-excited atrial fibrillation (Wolff-Parkinson-White). A 24-year-old man whose heart took off in a pickup basketball
 * game: an irregular, very fast wide-complex tachycardia whose complexes change shape beat to beat, a pressure of 104/68,
 * awake and dizzy. He is stable for now — and the pathway can drive him into VF at any moment.
 *
 * Right care: pads on, a 12-lead read as pre-excited AF, and no AV-nodal blocker of any kind. Stable: a sedated synchronized
 * cardioversion (200 J), or IV procainamide as the alternative. Unstable: synchronized cardioversion at once. Then the heart
 * center, where the pathway is ablated. An AV-nodal blocker (adenosine, diltiazem, metoprolol, amiodarone) sends every
 * impulse down the pathway: the rate climbs and he goes into VF — adenosine at once, the others within 2 minutes unless he is
 * shocked first. Left untreated he becomes unstable at minute 12 and goes into VF 5 minutes later. The EMT cannot treat the
 * rhythm: the AED pads, the instability check, an early ALS call, the transmitted 12-lead and the AED if he loses his pulse
 * are the EMT's part; the paramedic intercept treats him when it arrives.
 *
 * Sources: 2023 ACC/AHA/ACCP/HRS AF guideline, section 10.6 (pre-excited AF and instability: electrical cardioversion, COR 1;
 * stable: IV ibutilide or procainamide as an alternative to elective cardioversion, COR 1; verapamil, diltiazem, amiodarone,
 * digoxin, adenosine and beta-blockers contraindicated, COR 3: Harm; catheter ablation of the pathway, COR 1). 2025 AHA adult
 * ALS (unstable tachycardia: synchronized cardioversion, sedated if possible; atrial fibrillation at least 200 J biphasic;
 * procainamide 20–50 mg/min with its stop rules; oxygen only if hypoxemic). National EMS Scope of Practice Model (2019).
 */

/** The rhythm he presents with: AF down a pathway whose shortest pre-excited RR is about 250 ms */
const START = { profile: 'af-wpw', hr: 214 };
/** Sinus rhythm once converted: the pathway is still there, so the WPW pattern shows (short PR, delta wave) */
const SINUS = { profile: 'wpw', hr: 92 };
/** What a shock leaves on the screen in VF: organized complexes, no pulse yet */
const AFTER_SHOCK = { profile: 'wpw', hr: 84 };
/** His rhythm once the pulse is back after CPR */
const AFTER_ROSC = { profile: 'wpw', hr: 108 };

/** Left untreated (no procainamide running, no shock), the fast rate wears him down: unstable at this minute */
export const UNSTABLE_AT = 12;
/** Unstable and not shocked: the rhythm breaks down into VF this many minutes later */
const VF_AFTER_UNSTABLE = 5;
/** After an AV-nodal blocker or adrenaline drives the rate up: VF this many minutes later unless he is shocked first */
const VF_AFTER_FASTER = 2;
/**
 * Minutes from the procainamide running to the AF stopping (it slows the pathway first). At 50 mg/min that is about 500 mg,
 * some 6 mg/kg: well inside the 17 mg/kg ceiling, where a loading dose that works usually does
 */
const PROCAINAMIDE_CONVERTS = 10;
/** mg/min: the top of the 20–50 mg/min range, for a stable patient whose pressure allows it */
const PROCAINAMIDE_RATE = 50;
/** Minutes from the EMT's call until the paramedic intercept reaches him */
export const ALS_MINUTES = 8;
/** VF left this long without CPR: a shock alone no longer brings back an organized rhythm */
const VF_LONG = 4;
/** His weight, for the procainamide ceiling (17 mg/kg) */
const KG = 78;

/** Still in the pre-excited AF he presented with, with a pulse */
const inAf = (s: SimState) => s.pulse && s.rhythm.profile === START.profile;

/** Hypotension (or the other signs the case has flagged: altered mind, chest pain) makes the tachycardia unstable */
const unstable = (s: SimState) => has(s, 'unstable') || s.vitals.sbp < 90;

/** Sedated, or at least given an analgesic, before a shock */
const comfortable = (s: SimState) => has(s, 'sedation') || has(s, 'analgesia') || has(s, 'benzodiazepine');

/**
 * A monitor is on, so a change of rhythm sounds an alarm and the rate and pressure show: the cardiac monitor, or the
 * paramedic's pads on the monitor-defibrillator. The EMT's AED pads are not one: an AED shows no rate, takes no pressure
 * and stays silent until it is asked to analyze
 */
const ecgOn = (s: SimState) => has(s, 'monitor') || (s.role !== 1 && has(s, 'pads'));

/** What the monitor shows — only once it is on (with no monitor, nothing alarms) */
const onMonitor = (s: SimState, text: string, tone?: Line[2]): Line[] => (ecgOn(s) ? [line('monitor', text, tone)] : []);

/** Only a patient awake enough to talk says how something feels */
const ifAwake = (s: SimState, text: string, tone?: Line[2]): Line[] => (s.pulse && s.vitals.gcs >= 13 ? [line('patient', text, tone)] : []);

/** A shock was delivered in the arrest he is in now */
const shockedThisArrest = (s: SimState) => s.timers.lastShockAt !== undefined && s.timers.arrestAt !== undefined && s.timers.lastShockAt >= s.timers.arrestAt;

/** When an action that set a flag was started (its last performance at or before the flag's minute) */
function startOf(s: SimState, id: string, flag: string): number | null {
  if (!has(s, flag)) return null;
  return [...s.performed].reverse().find((p) => p.id === id && p.minute <= s.flags[flag])?.minute ?? null;
}

/** The pathway gives out under the fast rate: VF, and he is pulseless */
function toVf(s: SimState, lead: Line[] = []): Effect {
  return {
    say: [...lead, line('partner', 'He has gone limp — he is not responding!', 'bad'), ...onMonitor(s, 'Monitor alarm!', 'bad')],
    rhythm: { profile: 'vf', hr: 0 }, pulse: false, phase: 'arrest', vitals: { sbp: 0, dbp: 0, gcs: 3, rr: 0 },
    clear: ['pathway-driven'], flags: ['vf'],
  };
}

/**
 * An AV-nodal blocker in pre-excited AF: with the node blocked, every impulse races down the pathway — faster, wider
 * complexes and a pressure that falls away. VF follows within 2 minutes unless he is shocked first. The monitor line
 * describes what is seen and names nothing.
 */
function fasterDown(s: SimState, given: Line[], flags: string[]): Effect | null {
  if (!inAf(s)) return null;
  // the same climb as the engine's default and the Give-meds tool: ×1.12, 250 at most
  const hr = Math.min(250, Math.round(s.rhythm.hr * 1.12));
  const bp = { sbp: Math.min(s.vitals.sbp, 80), dbp: Math.min(s.vitals.dbp, 48) };
  return {
    say: [...given, line('monitor', `The complexes come faster and wider: heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`, 'bad'),
      ...ifAwake(s, '"Something\'s wrong — everything is going gray…"', 'bad')],
    rhythm: { profile: START.profile, hr }, vitals: { ...bp, gcs: Math.min(s.vitals.gcs, 13), spo2: Math.min(s.vitals.spo2, 93) },
    flags: [...flags, 'unstable', 'pathway-driven'],
  };
}

/** Adrenergic drugs shorten the pathway's refractory period: the ventricles are driven faster */
function adrenergic(s: SimState, dSbp: number, dDbp: number, ceiling: { sbp: number; dbp: number }, flag: string): Effect | null {
  if (!inAf(s)) return null;
  const bp = bpAfter(s, dSbp, dDbp, ceiling);
  const hr = Math.min(250, s.rhythm.hr + 16);
  return { say: [line('monitor', `The complexes come faster: heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`, 'bad')], rhythm: { profile: START.profile, hr }, vitals: bp, flags: [flag] };
}

/**
 * A shock in VF. Caught within minutes it stops at once; VF left for minutes with no compressions needs CPR behind it first.
 * Either way the stunned heart beats in an organized way but gives no pulse yet: CPR now, and the pulse returns with it.
 * `mine`: the learner's own shock (not the paramedic intercept's), the one the "shock at once" item scores
 */
function shock(s: SimState, how: string, mine = true): Effect | null {
  if (s.pulse || s.rhythm.profile !== 'vf') return null;
  // the EMT's own AED is no monitor; the paramedics' defibrillator is
  const flags = ['pads', ...(s.role !== 1 || !mine ? ['monitor'] : []), 'shocked', ...(mine ? ['arrest-shock'] : [])];
  const from = s.timers.arrestAt ?? s.minute;
  const cpr = s.performed.some((p) => p.id === 'cpr' && p.minute >= from);
  // no pulse check straight after a shock (2025 AHA): compressions resume at once, and the check comes after 2 minutes.
  // The EMT sees no rhythm (the AED's own prompt says "Start CPR"), only a man who is still unresponsive
  const emt = s.role === 1 ? 'He is still unresponsive and not breathing normally.' : null;
  if (s.minute - from >= VF_LONG && !cpr) {
    return { say: [line('monitor', how), line('you', emt ?? 'The same chaotic line on the screen: back to compressions at once.', 'warn')], flags };
  }
  return {
    say: [line('monitor', how), line('you', emt ?? 'Organized complexes on the screen now — no pause for a pulse check after a shock: compressions resume at once.', 'warn')],
    rhythm: { ...AFTER_SHOCK }, flags: [...flags, 'shock-converted'],
  };
}

/** Two minutes of compressions after the shock bring the pulse back */
function rosc(s: SimState): Effect {
  return {
    say: [line('you', `2 minutes of compressions. At the ${s.role === 1 ? 'pulse' : 'rhythm'} check he coughs and moves his arm: a carotid pulse — ROSC.`, 'good')],
    rhythm: { ...AFTER_ROSC }, pulse: true, phase: 'rosc', vitals: { sbp: 104, dbp: 66, spo2: 95, rr: 18, gcs: 13, pain: 2 }, flags: ['cpr', 'converted'],
  };
}

/** The radial pulse in AF this fast: irregular, and some beats too weak to reach the wrist */
const pulseText = (s: SimState) => `very fast and irregular, about ${Math.round(s.rhythm.hr / 10) * 10} — some beats too weak to feel at the wrist`;

/** The vitals as the crew finds them: the pressure, and the pulse as it can be felt */
const vitalsText = (s: SimState) => `BP ${s.vitals.sbp}/${s.vitals.dbp} · pulse ${pulseText(s)} · RR ${s.vitals.rr} · SpO₂ ${s.vitals.spo2}%`;

/** What he says when reassessed */
function statusOf(s: SimState): string {
  if (!s.pulse) return 'Unresponsive.';
  if (has(s, 'rosc')) return 'Awake but groggy: "What happened? My chest is sore."';
  if (!inAf(s)) return '"That\'s so much better — it feels normal again."';
  if (unstable(s)) return '"I feel like I\'m going to pass out…"';
  if (has(s, 'proc-running')) return '"It still feels fast, but not as wild."';
  return '"It\'s still going crazy… I get dizzy if I sit up straight."';
}

/** Sedation for the shock: a small, titrated dose that keeps the pressure */
function sedate(s: SimState, what: string, flags: string[]): Effect | null {
  if (!inAf(s)) return null;
  return { say: [line('you', `${what}: drowsy but rousable, breathing well, capnography on.`)], vitals: { ...bpAfter(s, -4, -2), gcs: Math.min(s.vitals.gcs, 14) }, flags };
}

/** Adenosine acts in seconds: in pre-excited AF the node blocks, the pathway takes every impulse, and VF follows at once */
function adenosine(s: SimState, mg: 6 | 12): Effect | null {
  const given = line('you', `Adenosine ${mg} mg rapid push, flushed.`);
  if (!s.pulse) return { say: [given, line('you', 'It has no place in cardiac arrest, and nothing changes on the monitor.')], flags: ['adenosine'] };
  if (!inAf(s)) return null;
  return { ...toVf(s, [given, line('monitor', 'No pause at all. The complexes come faster and wider.', 'bad'), ...ifAwake(s, '"Whoa — what was —"', 'bad')]), flags: ['adenosine', 'vf'] };
}

export const wpwAfField: Scenario = {
  id: 'wpw-af-field',
  title: 'Too fast to count',
  summary: '24-year-old man whose heart took off in a pickup basketball game: a racing, irregular pulse and dizziness. Read the tracing before you reach for a drug.',
  setting: 'field',
  roles: [1, 2],
  difficulty: 'advanced',
  conditionId: 'wpw-syndrome',
  briefing: {
    default: [
      ['dispatch', 'Priority 1: 24-year-old man, heart racing, dizzy. Awake and talking.'],
      ['scene', 'A community gym. A young man sits on the bench beside the basketball court, pale and sweaty, one hand pressed flat over his heart: "It\'s going crazy." His friend: "It started half an hour ago, in the middle of a game."'],
      ['partner', 'Your partner, an EMT, has the stretcher and the jump bag; you have the monitor and the drug box.'],
      ['hospital', 'Regional heart center (cardiology, electrophysiology lab, ICU): 15 minutes. Nearest emergency department: 8 minutes.'],
    ],
    1: [
      ['dispatch', 'Priority 1: 24-year-old man, heart racing, dizzy. Awake and talking.'],
      ['scene', 'A community gym. A young man sits on the bench beside the basketball court, pale and sweaty, one hand pressed flat over his heart: "It\'s going crazy." His friend: "It started half an hour ago, in the middle of a game."'],
      ['partner', `Your partner, an EMT, has the AED and the jump bag. You are a BLS unit: the nearest paramedic unit is about ${ALS_MINUTES} minutes away once you ask for it.`],
      ['hospital', 'Regional heart center (cardiology, electrophysiology lab, ICU): 15 minutes. Nearest emergency department: 8 minutes.'],
    ],
  },
  initial: {
    rhythm: { ...START },
    vitals: { sbp: 104, dbp: 68, spo2: 97, rr: 20, etco2: 34, pain: 0, gcs: 15, glucose: 102, temp: 36.9 },
  },
  facts: {
    opqrst: '"It started all at once, about half an hour ago, going up for a rebound — my heart just took off, pounding and fluttering, all over the place. No chest pain, and I can breathe. I got dizzy when I stood up, so I sat down. It\'s not slowing down."',
    // what decides the drugs: no heart failure, nothing that lengthens the QT, nothing taken; the old ECG is the clue
    sample: `"No allergies. No medicines, no drugs — just two energy drinks this afternoon. A couple of times in high school my heart raced for a few seconds and stopped on its own. At a sports physical two years ago the doctor said my ECG was abnormal — something about the wiring — and told me to see a heart doctor. I never went. Nobody in my family has heart trouble." About ${KG} kg. He ate lunch at noon.`,
    pde5: '"No."',
    allergies: 'No allergies.',
    lungs: 'Clear and equal on both sides.',
    perfusion: (s) => {
      if (!s.pulse) return 'No pulse.';
      if (!inAf(s)) return has(s, 'rosc') ? 'Pale but pinking up; a regular radial pulse; skin cool.' : 'Warm and dry; a regular radial pulse; no JVD.';
      if (unstable(s)) return `Gray, cool and clammy; the radial pulse ${s.vitals.sbp < 90 ? 'weak and thready' : 'bounding'}, ${pulseText(s)}.`;
      return `Pale and sweaty, but warm; radial pulse ${pulseText(s)}; capillary refill 2 seconds; no JVD.`;
    },
    neuro: (s) => (s.vitals.gcs >= 15 ? 'Alert and oriented; no focal deficit.' : 'Slow to answer and a little confused; no focal deficit.'),
    ecg12: (s) => {
      switch (s.rhythm.profile) {
        case START.profile:
          return `Irregularly irregular and very fast — about ${s.rhythm.hr} a minute, the shortest RR intervals 250 ms or less — with no P waves and wide QRS complexes that change in width and shape from beat to beat, each with a slurred upstroke (a delta wave): atrial fibrillation conducted down an accessory pathway, pre-excited AF (WPW). An irregular wide-complex tachycardia over 200 in a young person is pre-excited AF until proven otherwise: no AV-nodal blockers.`;
        case SINUS.profile:
          return `Sinus rhythm ${s.rhythm.hr} with a short PR interval (under 120 ms), a slurred upstroke at the start of each QRS (a delta wave) and a QRS a little wide: the WPW pattern — the accessory pathway is still there, ready to carry the next AF. No acute ST elevation. He needs an electrophysiology study and ablation of the pathway.`;
        default:
          return 'No 12-lead possible right now.';
      }
    },
  },
  status: statusOf,
  respond: {
    // a pulse this fast and irregular cannot be counted at the wrist: the crew says what it feels
    primary: (s) => (inAf(s) ? { say: [['you', `Airway open, breathing ${s.vitals.rr}/min, radial pulse ${pulseText(s)}, GCS ${s.vitals.gcs}.`]] } : null),
    vitals: (s) => (inAf(s) ? { say: [['you', vitalsText(s)]], flags: ['bp'] } : null),
    reassess: (s) => (inAf(s) ? { say: [['you', vitalsText(s)], ['patient', statusOf(s)]] } : null),
    'pulse-check': (s) => (inAf(s) ? { say: [['you', `Pulse present: ${pulseText(s)}.`]] } : null),
    // the EMT's AED pads go on now and stay on: the AED analyzes only once he is unresponsive and pulseless (and, being
    // an AED, it shows no rate or pressure: no 'monitor' flag)
    pads: (s) => {
      if (s.role !== 1) return null;
      return {
        say: [['you', s.pulse
          ? 'AED pads on his chest, the AED ready beside him: it analyzes only if he becomes unresponsive, stops breathing normally and has no pulse.'
          : 'AED pads on his chest.']],
        flags: ['pads'],
      };
    },

    // Stable: procainamide slows the pathway, then stops the AF (2023 AF guideline: the alternative to a sedated shock)
    procainamide: (s) => {
      if (!inAf(s)) return null;
      const bp = bpAfter(s, -6, -4);
      const hr = Math.min(s.rhythm.hr, 176);
      return {
        say: [
          ['you', `Procainamide running at ${PROCAINAMIDE_RATE} mg/min — stop at 17 mg/kg (about ${(Math.round((17 * KG) / 10) * 10).toLocaleString('en-US')} mg for his ${KG} kg), or sooner if the systolic falls under 90, the QRS widens by half or the arrhythmia stops; BP and QRS width checked every few minutes.`],
          ['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`],
        ],
        rhythm: { profile: START.profile, hr }, vitals: bp, flags: ['procainamide', 'proc-running'],
      };
    },
    // the AV-nodal blockers: faster and wider, the pressure gone — VF follows (adenosine acts in seconds: at once)
    adenosine6: (s) => adenosine(s, 6),
    adenosine12: (s) => adenosine(s, 12),
    diltiazem: (s) => fasterDown(s, [line('you', 'Diltiazem 20 mg IV over 2 minutes.')], ['diltiazem']),
    metoprolol: (s) => fasterDown(s, [line('you', 'Metoprolol 5 mg IV.')], ['beta-blocker']),
    'amio-infusion': (s) => fasterDown(s, [line('you', 'Amiodarone 150 mg running over 10 minutes.')], ['amiodarone']),
    // the arrest push with a pulse: amiodarone all the same, and the same pathway effect
    'amio-arrest': (s) => fasterDown(s, [line('you', 'Amiodarone 300 mg pushed fast.')], ['amiodarone']),
    // the arrest dose of epinephrine with a pulse: the pathway conducts faster still, and the heart is starved — VF follows
    epinephrine: (s) => {
      if (!inAf(s)) return null;
      const bp = bpAfter(s, 50, 26, { sbp: 190, dbp: 110 });
      return {
        say: [['you', 'Epinephrine 1 mg IV, flushed.'], ['monitor', `The complexes come faster: heart rate 250. BP ${bp.sbp}/${bp.dbp}.`, 'bad'], ['patient', 'He grabs his chest: "It\'s crushing — my heart is going to explode!"', 'bad']],
        rhythm: { profile: START.profile, hr: 250 }, vitals: { ...bp, pain: Math.max(s.vitals.pain, 7), gcs: Math.min(s.vitals.gcs, 14) },
        flags: ['epi-with-pulse', 'unstable', 'pathway-driven'],
      };
    },
    'push-epi': (s) => adrenergic(s, 16, 10, { sbp: 150, dbp: 90 }, 'push-epi'),
    pressor: (s) => adrenergic(s, 22, 14, { sbp: 140, dbp: 88 }, 'pressor'),
    'epi-im': (s) => adrenergic(s, 10, 6, { sbp: 150, dbp: 90 }, 'epi-im'),
    // lidocaine barely touches the pathway (Barrett 1980): nothing changes
    lidocaine: (s) => (inAf(s) ? { say: [['you', `Lidocaine 1.5 mg/kg IV (${Math.round(1.5 * KG)} mg).`], ['monitor', `No change: heart rate ${s.rhythm.hr}.`]], flags: ['lidocaine'] } : null),
    // a vagal maneuver slows the AV node, not the pathway: nothing changes
    vagal: (s) => (inAf(s) ? { say: [['you', 'Modified Valsalva: he strains for 15 seconds, then lies back with his legs raised.'], ...onMonitor(s, `No change: heart rate ${s.rhythm.hr}.`)], flags: ['vagal'] } : null),
    sedation: (s) => sedate(s, 'A small dose of procedural sedation and analgesia', ['sedation']),
    // midazolam is the procedural sedation before his shock, as 'sedation' is: 1 mg IV at a time, titrated. An IM dose
    // takes 15 minutes to act and cannot be titrated, so sedation for the shock waits for a line
    midazolam: (s) => {
      if (inAf(s) && !has(s, 'iv')) return { blocked: true, say: [['system', 'Sedation for the shock goes in IV, a little at a time and titrated: start a line first.']] };
      return sedate(s, 'Midazolam 1 mg IV, small and titrated', ['sedation', 'benzodiazepine']);
    },

    // Electrical: synchronized at 200 J stops it; unsynchronized with a pulse lands on a T wave
    cardiovert: (s) => {
      if (!inAf(s)) return null;
      const awake = s.vitals.gcs >= 14 && !comfortable(s);
      const low = unstable(s);
      return {
        say: [
          ['monitor', `Synchronized shock delivered: 200 J. The rhythm changes: heart rate ${SINUS.hr}, regular.`, 'good'],
          awake ? ['patient', '"Aagh! What was that?"', 'bad'] : ['patient', 'He stirs, then opens his eyes: "Is it over? My heart feels normal."', 'good'],
        ],
        rhythm: { ...SINUS },
        vitals: { sbp: Math.max(s.vitals.sbp, low ? 108 : 118), dbp: Math.max(s.vitals.dbp, low ? 66 : 74), pain: 0, rr: 16, spo2: Math.max(s.vitals.spo2, 97), gcs: has(s, 'sedation') ? 14 : 15 },
        clear: ['pathway-driven'],
        // 'elective': the shock was chosen while he was still stable (the sedation item asks for it then)
        flags: ['pads', 'monitor', 'cardioverted', 'converted', ...(low ? [] : ['elective'])],
      };
    },
    defib: (s) => {
      if (inAf(s)) {
        return {
          say: [['monitor', 'Unsynchronized shock delivered: 200 J — he goes limp and the monitor alarms!', 'bad']],
          rhythm: { profile: 'vf', hr: 0 }, pulse: false, phase: 'arrest', vitals: { sbp: 0, dbp: 0, gcs: 3, rr: 0 },
          clear: ['pathway-driven'], flags: ['pads', 'monitor', 'vf', 'iatrogenic-vf'],
        };
      }
      return shock(s, 'Shock delivered: 200 J.');
    },
    // with his pulse the AED is not applied (the default refuses it: it would read this rhythm as shockable); without one it shocks
    aed: (s) => {
      const shocked = shock(s, 'AED: "Shock advised." Shock delivered. "Start CPR."');
      // an AED cannot analyze in a moving ambulance: the driver pulls over
      if (shocked && has(s, 'enroute') && !has(s, 'arrived')) return { ...shocked, say: [line('partner', 'Pulling over for the AED.'), ...(shocked.say ?? [])] };
      return shocked;
    },
    cpr: (s) => (!s.pulse && s.rhythm.profile === AFTER_SHOCK.profile ? rosc(s) : null),

    als: () => ({ say: [['dispatch', `Medic unit assigned — about ${ALS_MINUTES} minutes out. They will meet you wherever you are.`]], flags: ['als'] }),
    // the physician reads the 12-lead the EMT cannot interpret; the paramedic has already read it
    'ecg-transmit': (s) => {
      if (!has(s, 'ecg12') || s.role !== 1) return null;
      // what the crew passes on depends on where the intercept is: with them, on its way, or not called yet
      const medics = has(s, 'als-here') ? 'the paramedics with you need to know' : has(s, 'als') ? 'the paramedics on their way need to know'
        : 'get a paramedic intercept on the way now, and tell them';
      return {
        say: [['hospital', `ECG received. The emergency physician: "This is fast, irregular and wide, the complexes changing shape from beat to beat — atrial fibrillation running down an extra pathway, WPW. It can turn into VF. Keep the AED pads on him and bring him in; ${medics}: no adenosine, no diltiazem, no beta-blocker and no amiodarone."`]],
        flags: ['transmitted'],
      };
    },
    notify: (s) => ({
      say: [['hospital', s.pulse
        ? 'Copy: a 24-year-old man with a very fast, irregular heart rate and dizziness. The emergency physician and the cardiologist will meet you; keep the pads on.'
        : 'Copy: cardiac arrest, resuscitation under way. Call back when you have a pulse.']],
      flags: ['notified'],
    }),
    // online medical direction: what it says depends on where he is, and it names nothing before the 12-lead is in
    'med-control': (s) => {
      let advice: string;
      if (!s.pulse) advice = s.role === 1 ? 'Medical control: no pulse — AED now, compressions straight after the shock, and keep the paramedics coming.' : 'Medical control: no pulse — defibrillate now, compressions straight after the shock, and call me back.';
      else if (!inAf(s)) advice = 'Medical control: good. Keep the pads on, repeat the 12-lead and bring him to the heart center: the pathway is still there, and he needs the electrophysiologists. No AV-nodal blockers for him.';
      else if (s.role === 1) {
        const medics = has(s, 'als-here') ? 'let the paramedics with you run the drugs' : has(s, 'als') ? 'keep the paramedics coming' : 'get a paramedic intercept on the way now';
        // once the 12-lead is in, the physician has read it: the EMT hears what it means for the crew
        advice = has(s, 'transmitted')
          ? `Medical control: I have your 12-lead — atrial fibrillation down an extra pathway, and it can turn into VF. Keep the AED pads on him, ${medics}, and bring him to the heart center with the pads on. If he goes unresponsive with no pulse, AED at once.`
          : `Medical control: a pulse this fast and irregular in a young man who feels faint can turn into a cardiac arrest. Keep the AED pads on him, ${medics}, and transmit me a 12-lead. If he goes unresponsive with no pulse, AED at once.`;
      } else if (unstable(s)) advice = 'Medical control: he is unstable — synchronized cardioversion now at 200 J, sedated if his pressure allows. No drug first.';
      else if (has(s, 'proc-running')) advice = 'Medical control: let the procainamide run — nothing else on top. Stop it if the systolic falls under 90 or the QRS widens by half. If he becomes unstable, synchronized cardioversion at 200 J.';
      else if (!has(s, 'ecg12')) advice = 'Medical control: get me a 12-lead with the pads on, and call me back before you give anything.';
      else {
        advice = 'Medical control: thanks for the 12-lead — irregular, wide and over 200 in a 24-year-old: treat it as pre-excited atrial fibrillation. No adenosine, no diltiazem, no beta-blocker and no amiodarone: blocking the node opens the pathway wider. Either a sedated synchronized cardioversion at 200 J, or procainamide 20–50 mg/min with its stop rules. Pads stay on: if he becomes unstable, cardiovert at once. Then bring him to the heart center.';
      }
      return { say: [['hospital', advice]], flags: ['med-control'] };
    },
  },
  events: [
    {
      // the EMT's intercept: the medics treat him — the drug if he is stable, a sedated shock if not, a defibrillation if pulseless.
      // They bring their own monitor-defibrillator, so its lines show whatever the EMT had on (flag 'monitor')
      id: 'als-arrives',
      when: (s) => s.role === 1 && has(s, 'als') && !has(s, 'handoff') && s.minute >= s.flags.als + ALS_MINUTES,
      effect: (s) => {
        if (!s.pulse) {
          const shocked = s.rhythm.profile === 'vf' && !shockedThisArrest(s) ? shock(s, 'The paramedics shock him at once: 200 J.', false) : null;
          const first: Line[] = shocked ? [line('team', 'The paramedics arrive: he has not been shocked yet — they defibrillate at once.', 'bad'), ...(shocked.say ?? [])] : [];
          return {
            ...(shocked ?? {}),
            say: [...first, line('team', 'The paramedics take over the drugs and the airway: an IV in his arm. "Keep the compressions going."')],
            flags: [...(shocked?.flags ?? []), 'iv', 'als-here', 'monitor'],
          };
        }
        if (!inAf(s)) return { say: [line('team', 'The paramedic intercept arrives and takes over: an IV in his arm, the pads stay on. "Good — keep him on the monitor all the way in."')], flags: ['iv', 'als-here', 'monitor'] };
        if (unstable(s)) {
          return {
            say: [
              line('team', 'The paramedic intercept arrives: he is unstable — midazolam 1 mg IV, then a synchronized shock at 200 J.'),
              line('monitor', `Synchronized shock delivered: 200 J. The rhythm changes: heart rate ${SINUS.hr}, regular.`, 'good'),
              line('patient', 'He stirs, then opens his eyes: "Is it over?"', 'good'),
            ],
            rhythm: { ...SINUS }, vitals: { sbp: Math.max(s.vitals.sbp, 108), dbp: Math.max(s.vitals.dbp, 66), gcs: 14, rr: 16, spo2: Math.max(s.vitals.spo2, 97) },
            clear: ['pathway-driven'], flags: ['iv', 'als-here', 'sedation', 'pads', 'monitor', 'cardioverted', 'converted', 'treated'],
          };
        }
        const bp = bpAfter(s, -6, -4);
        // with no 12-lead from the EMT the medics record their own before they treat
        const ecg = has(s, 'ecg12') ? 'a look at your 12-lead' : 'their own 12-lead';
        return {
          say: [line('team', `The paramedic intercept arrives and takes over the drugs: an IV, ${ecg} and a call to medical control, then procainamide running at ${PROCAINAMIDE_RATE} mg/min. "No adenosine and no diltiazem for this one."`),
            line('monitor', `Heart rate 176. BP ${bp.sbp}/${bp.dbp}.`)],
          rhythm: { profile: START.profile, hr: 176 }, vitals: bp, flags: ['iv', 'als-here', 'monitor', 'procainamide', 'proc-running', 'treated'],
        };
      },
    },
    {
      // an AV-nodal blocker or adrenaline drove the rate up: unshocked, it breaks down into VF
      id: 'faster-vf',
      when: (s) => inAf(s) && has(s, 'pathway-driven') && s.minute >= s.flags['pathway-driven'] + VF_AFTER_FASTER,
      effect: (s) => toVf(s),
    },
    {
      // the procainamide has slowed the pathway enough: the AF stops
      id: 'drug-converts',
      when: (s) => inAf(s) && has(s, 'proc-running') && s.minute >= s.flags['proc-running'] + PROCAINAMIDE_CONVERTS,
      effect: (s) => ({
        say: [
          ...(ecgOn(s) ? [line('monitor', `The rate falls suddenly: heart rate ${SINUS.hr}, regular.`, 'good')] : [line('partner', 'His pulse has suddenly slowed right down — regular, about 90.', 'good')]),
          line('patient', '"It stopped! My heart feels normal again."', 'good'),
          line(has(s, 'als-here') ? 'team' : 'you', 'Procainamide loading stopped: the arrhythmia has stopped, which is one of its stop rules.'),
        ],
        rhythm: { ...SINUS }, vitals: { sbp: Math.max(s.vitals.sbp, 112), dbp: Math.max(s.vitals.dbp, 70), rr: 16, gcs: 15 },
        flags: ['converted', 'drug-converted'],
      }),
    },
    {
      // left with no procainamide and no shock, the fast rate wears him down: now he is unstable
      id: 'unstable-delay',
      when: (s) => inAf(s) && !has(s, 'unstable') && !has(s, 'proc-running') && s.minute >= UNSTABLE_AT,
      effect: (s) => {
        // worse, never better: a pressure a drug has already pushed lower stays where it is
        const sbp = Math.min(s.vitals.sbp, 84);
        const dbp = Math.min(s.vitals.dbp, 52);
        const hr = Math.min(250, Math.max(s.rhythm.hr, 236));
        return {
          say: [line('partner', 'He has gone gray and sweaty — he says the room is spinning, and he is slow to answer.', 'bad'), ...onMonitor(s, `Heart rate ${hr}. BP ${sbp}/${dbp}.`, 'bad')],
          rhythm: { profile: START.profile, hr },
          vitals: { sbp, dbp, gcs: Math.min(s.vitals.gcs, 14), rr: Math.max(s.vitals.rr, 24), spo2: Math.min(s.vitals.spo2, 94) },
          flags: ['unstable'],
        };
      },
    },
    {
      // any other way his pressure ends up under 90 (nitroglycerin, stacked drugs) makes him unstable too
      id: 'unstable-low-bp',
      when: (s) => inAf(s) && !has(s, 'unstable') && s.vitals.sbp < 90,
      effect: (s) => ({
        say: [line('partner', 'His pressure is under 90 now; he is getting foggy.', 'bad')],
        vitals: { gcs: Math.min(s.vitals.gcs, 14) },
        flags: ['unstable'],
      }),
    },
    {
      // unstable and not shocked: the rhythm breaks down and he loses his pulse
      id: 'vf-unstable',
      when: (s) => inAf(s) && has(s, 'unstable') && s.minute >= s.flags.unstable + VF_AFTER_UNSTABLE,
      effect: (s) => toVf(s),
    },
    {
      // the heart beats again after the shock but gives no pulse: it needs compressions
      id: 'no-cpr-after-shock',
      when: (s) => !s.pulse && s.rhythm.profile === AFTER_SHOCK.profile && has(s, 'shock-converted') && s.minute >= s.flags['shock-converted'] + 1
        && !s.performed.some((p) => p.id === 'cpr' && p.minute >= s.flags['shock-converted']),
      effect: () => ({ say: [line('partner', 'Still no pulse — he needs compressions!', 'bad')] }),
    },
  ],
  critical: [
    // the items a hint can name before the 12-lead is read say nothing about what the tracing shows
    {
      id: 'pads', label: 'Defibrillator pads on him at once', points: 10, target: { by: 4 }, done: PADS,
      why: 'A heart this fast can turn unstable or pulseless at any moment: with the pads on, a shock is seconds away. An EMT puts the AED pads on now and lets it analyze only if he becomes unresponsive, not breathing normally and pulseless.',
    },
    {
      id: 'instability', label: 'Check for instability: blood pressure and mental status', points: 10, target: { by: 4 }, done: ['vitals', 'nibp', 'bp-both-arms'],
      why: 'Hypotension, an acute change in mental status, signs of shock, ischemic chest pain or acute heart failure make a tachycardia unstable — and decide between a drug and a shock (and, for an EMT, how urgent the paramedics are).',
    },
    {
      id: 'als', roles: [1], label: 'Request ALS (paramedic intercept) at once', points: 10, target: { by: 3 },
      why: `A pulse this fast and irregular needs a monitor, a manual defibrillator and a drug box, and the nearest paramedic unit is ${ALS_MINUTES} minutes away: call at once — a call made only once he has arrested comes too late to prevent it.`,
      // the call is the decision while he still has a pulse: one made only after he arrested is not late, it is missed
      done: (s) => {
        const call = s.performed.find((p) => p.id === 'als')?.minute;
        if (call === undefined) return null;
        return has(s, 'arrest') && call >= s.flags.arrest ? null : call;
      },
      uses: ['als'],
    },
    {
      id: 'history', label: 'Past history, medicines and drugs (SAMPLE)', points: 5, target: { by: 10 }, done: ['sample'],
      why: 'Earlier spells of racing, an ECG someone called abnormal, stimulants or drugs, heart failure and medicines decide what a fast rhythm is likely to be and which drugs are safe.',
    },
    {
      id: 'ecg-sent', roles: [1], label: '12-lead acquired and transmitted', points: 10, target: { by: 10 },
      why: 'You cannot interpret it, but the physician can: it shows what the rhythm is — and which drugs the paramedics must never give.',
      done: (s) => s.flags.transmitted ?? null, uses: ['ecg12', 'ecg-transmit'],
    },
    {
      id: 'ecg', roles: [2], label: '12-lead of the tachycardia itself, before it stops', points: 10, target: { by: 8 },
      why: 'The 12-lead decides the treatment — regular or irregular, narrow or wide, and the shape of each complex — and the tracing of the arrhythmia itself is what the electrophysiologist needs later.',
      // a 12-lead whose tracing showed the AF: the read asked for it, whatever the learner answered
      done: (s) => {
        const r = s.reads.find((x) => x.kind === 'ecg' && x.answer === 'afib-preexcited');
        if (!r) return null;
        return [...s.performed].reverse().find((p) => (p.id === 'ecg12' || p.id === 'ecg12-repeat') && p.minute < r.minute)?.minute ?? r.minute;
      },
      uses: ['ecg12', 'ecg12-repeat'],
    },
    { id: 'iv', roles: [2], label: 'IV access', why: 'For procainamide, and for sedation before a shock.', done: ['iv', 'io'], points: 5 },
    {
      id: 'stop-it', roles: [2], label: 'Convert him while he is stable: a sedated synchronized cardioversion at 200 J, or IV procainamide', points: 15, target: { by: UNSTABLE_AT },
      why: 'Stable pre-excited AF is stopped, never rate-controlled: an elective synchronized cardioversion (200 J or more, sedated), or IV procainamide (or ibutilide in hospital) as the alternative (2023 ACC/AHA/ACCP/HRS AF guideline, COR 1). Both slow or stop the pathway; no AV-nodal blocker can.',
      done: (s) => {
        // only while he was stable: a shock or a drug once he is unstable is the next item's
        const before = s.flags.unstable ?? Infinity;
        const proc = s.performed.find((p) => p.id === 'procainamide' && p.minute < before && p.minute < (s.flags.converted ?? Infinity) && p.minute < (s.flags.arrest ?? Infinity));
        const shockAt = has(s, 'elective') ? startOf(s, 'cardiovert', 'elective') : null;
        const times = [proc?.minute ?? null, shockAt].filter((m): m is number => m !== null);
        return times.length ? Math.min(...times) : null;
      },
      uses: ['procainamide', 'cardiovert'],
    },
    {
      id: 'consult', roles: [2], label: 'Expert consultation: online medical control', points: 5, done: ['med-control'],
      why: 'The tachycardia algorithm lists expert consultation for a wide-complex tachycardia (2025 AHA): in the field that is online medical control, which many protocols require for procainamide or an elective shock.',
    },
    {
      id: 'cardiovert-unstable', roles: [2], label: 'Unstable: synchronized cardioversion at 200 J within 3 minutes', points: 15, target: { within: { flag: 'unstable', minutes: 3 } },
      why: 'Unstable pre-excited AF is shocked at once (2023 AF guideline, COR 1): synchronized, 200 J or more biphasic for atrial fibrillation (2025 AHA), sedated if his pressure allows. Left unshocked, it breaks down into VF.',
      done: (s) => (has(s, 'unstable') && has(s, 'cardioverted') && s.flags.cardioverted >= s.flags.unstable ? startOf(s, 'cardiovert', 'cardioverted') : null),
      uses: ['cardiovert'],
      // procainamide already running that stopped it within those 3 minutes left nothing to shock
      applies: (s) => has(s, 'unstable') && !(has(s, 'drug-converted') && s.flags['drug-converted'] <= s.flags.unstable + 3),
    },
    {
      id: 'sedation', roles: [2], label: 'Sedation or analgesia before the elective cardioversion', points: 5,
      why: 'A shock is painful: sedate a patient who is awake and stable before an elective cardioversion — a small, titrated dose that keeps the pressure.',
      done: (s) => {
        const at = Math.min(s.flags.sedation ?? Infinity, s.flags.analgesia ?? Infinity, s.flags.benzodiazepine ?? Infinity);
        return at <= (s.flags.elective ?? -Infinity) ? at : null;
      },
      uses: ['sedation', 'midazolam', 'fentanyl'], applies: (s) => has(s, 'elective'),
    },
    {
      id: 'arrest-shock', label: 'No pulse: shock at once (the AED, or unsynchronized defibrillation)', points: 15,
      why: 'Witnessed VF with the pads already on: shock it at once — every minute without a shock lowers survival. An EMT uses the AED now: he is unresponsive, not breathing normally and pulseless.',
      // the learner's own shock in the arrest (not the paramedic intercept's): when it was started
      done: (s) => (has(s, 'arrest-shock') ? [...s.performed].reverse().find((p) => (p.id === 'defib' || p.id === 'aed') && p.minute <= s.flags['arrest-shock'])?.minute ?? null : null),
      uses: ['aed', 'defib'], target: { within: { flag: 'arrest', minutes: 2 } }, applies: (s) => has(s, 'arrest'),
    },
    {
      id: 'cpr', label: 'CPR straight after the shock', points: 10, done: ['cpr'], after: 'shock-converted',
      target: { within: { flag: 'shock-converted', minutes: 1 } }, applies: (s) => has(s, 'shock-converted'),
      why: 'After a shock, compressions resume at once for 2 minutes before the next rhythm and pulse check: the stunned heart beats again but gives no pulse yet.',
    },
    {
      id: 'post-bp', roles: [1], label: 'After ROSC: check his blood pressure', points: 5, done: ['vitals', 'nibp', 'reassess', 'bp-both-arms'], after: 'rosc',
      applies: (s) => has(s, 'rosc'),
      why: 'The pressure is often low after an arrest: measure it and report it to the paramedics.',
    },
    {
      id: 'post-ecg', label: '12-lead once he is back in a regular rhythm', points: 5, done: ['ecg12', 'ecg12-repeat'], after: 'converted',
      why: 'In sinus rhythm the 12-lead shows the pathway itself (a short PR and a delta wave): the evidence the electrophysiologist needs. EMTs acquire it and hand it over.',
      // converted while the hand-off was being given leaves no time for one: the receiving team records it
      applies: (s) => {
        const handoff = s.performed.find((p) => p.id === 'handoff')?.minute;
        return has(s, 'converted') && (handoff === undefined || s.flags.converted <= handoff);
      },
    },
    {
      id: 'transport', label: 'Transport promptly', points: 5, target: { by: 15 },
      why: 'He needs a monitored bed and an electrophysiology study: ablation of the pathway is the cure. Treat on scene what cannot wait (a shock), and be on the way within 15 minutes with the pads on — a BLS crew meets the intercept on the way rather than waiting on scene with a rhythm it cannot treat. A pulseless patient is worked on scene until ROSC.',
      done: (s) => {
        const load = s.performed.find((p) => p.id === 'transport-pci' || p.id === 'transport-near')?.minute;
        if (load === undefined) return null;
        // loaded before he arrested (or he never did): the transport began then, and an arrest on the way does not undo it
        if (!has(s, 'arrest') || load < s.flags.arrest) return load;
        // loaded in the arrest or after it: it counts from ROSC
        return has(s, 'rosc') ? Math.max(load, s.flags.rosc) : null;
      },
      uses: ['transport-pci', 'transport-near'],
    },
    {
      id: 'handoff', label: 'Hand-off', points: 5, done: ['handoff'],
      why: 'Report the onset, the 12-lead of the arrhythmia and the one after it, every drug and shock with its time, and that no AV-nodal blocker was given.',
    },
  ],
  harms: yieldToHeavier([
    {
      // the same id as the built-in rule, in this case's words; the 300 mg push with a pulse is the same mistake made worse
      id: 'av-blocker-preexcited-af', actions: ['adenosine6', 'adenosine12', 'diltiazem', 'metoprolol', 'amio-infusion', 'amio-arrest'],
      // amiodarone on top of procainamide is this same mistake here: one penalty
      when: (s) => inAf(s), points: 15, severity: 'critical', replaces: ['amiodarone-after-procainamide'],
      text: 'An AV-nodal blocker for pre-excited atrial fibrillation. With the AV node blocked, every impulse races down the accessory pathway: the rate climbs and it turns into VF. Adenosine, diltiazem and verapamil, beta-blockers, digoxin and amiodarone are all contraindicated (2023 ACC/AHA/ACCP/HRS AF guideline: 3 — Harm). Stable: a sedated synchronized cardioversion, or IV procainamide; unstable: synchronized cardioversion now.',
    },
    {
      // the built-in rule in its own words: the pre-excited AF rule above covers the push while he is in it
      id: 'arrest-amio-with-pulse', actions: ['amio-arrest'], when: (s) => s.pulse && !inAf(s), points: 10, severity: 'major',
      text: 'A 300 mg amiodarone push with a pulse. It is the cardiac-arrest dose, for VF or pulseless VT that shocks have not fixed: with a pulse it drops the pressure — and he has nothing left for it to treat.',
    },
    {
      id: 'no-sedation', actions: ['cardiovert'], when: (s) => inAf(s) && !unstable(s) && s.vitals.gcs >= 14 && !comfortable(s), points: 3, severity: 'minor',
      text: 'An elective cardioversion of an awake patient without sedation or analgesia. He was stable: there was time for a small, titrated dose first.',
    },
    {
      // the same mistake as procainamide with a low pressure, in the words of this case: one penalty, not two
      id: 'drug-while-unstable', actions: ['procainamide', 'lidocaine', 'magnesium-sulfate'], when: (s) => inAf(s) && unstable(s),
      replaces: [...LIDOCAINE_RULES, 'magnesium-no-indication'], points: 8, severity: 'major',
      text: 'A drug for a tachycardia that had become unstable. Hypotension, a change in mental status, chest pain or heart failure make it unstable: synchronized cardioversion now (200 J), not an infusion that takes minutes and drops the pressure further.',
    },
    {
      // the built-in rule, kept for a low pressure outside the AF (the rule above says it in the AF)
      id: 'procainamide-hypotension', actions: ['procainamide'], when: (s) => s.pulse && !inAf(s) && s.vitals.sbp < 90, points: 8, severity: 'major',
      text: 'Procainamide with a systolic pressure under 90 mmHg. Hypotension is one of its stop rules, so it is no drug to start with one.',
    },
    {
      id: 'magnesium-preexcited-af', actions: ['magnesium-sulfate'], when: (s) => inAf(s) && !unstable(s), replaces: ['magnesium-no-indication'], points: 3, severity: 'minor',
      text: 'Magnesium for pre-excited atrial fibrillation. It acts on the AV node, not the pathway: it cannot slow or stop this rhythm, and it drops the pressure. A sedated synchronized cardioversion, or procainamide.',
    },
    {
      id: 'vagal-preexcited-af', actions: ['vagal'], when: (s) => inAf(s), points: 3, severity: 'minor',
      text: 'A vagal maneuver for a very fast, irregular heartbeat. Vagal maneuvers are for a regular narrow-complex tachycardia that runs through the AV node; this irregular wide-complex one is atrial fibrillation down an accessory pathway, which they cannot stop — and slowing the node only leaves more of the impulses to the pathway.',
    },
    {
      // at any pressure: catecholamines shorten the pathway's refractory period (the EP lab uses isoproterenol to unmask a
      // dangerous pathway), and a low pressure here comes from the rate, which only the shock fixes
      id: 'adrenergic-preexcited-af', actions: ['push-epi', 'pressor'], when: (s) => inAf(s), replaces: ['pressor-no-hypotension'], points: 3, severity: 'minor',
      text: 'A pressor or push-dose epinephrine in pre-excited atrial fibrillation. Adrenergic drugs make the pathway conduct faster still, and the low pressure of an unstable patient comes from the rate: synchronized cardioversion fixes it, a pressor does not.',
    },
    {
      id: 'epi-im-no-anaphylaxis', actions: ['epi-im'], when: (s) => s.pulse, points: 5, severity: 'major',
      text: 'IM epinephrine without anaphylaxis. Nothing he has calls for it, and adrenaline makes the pathway conduct faster still.',
    },
    nitrateCaseRule({
      id: 'nitro-no-pain', actions: ['nitro'], when: (s) => s.pulse && s.vitals.pain === 0 && s.vitals.sbp >= 90, points: 3, severity: 'minor',
      text: 'Nitroglycerin with no chest pain. It treats ischemic chest pain; he has none, and it only lowers a pressure the fast rate is already straining.',
    }, 'nitro-high-not-hypertensive'),
    {
      id: 'aspirin-no-acs', actions: ['aspirin'], points: 2, severity: 'minor',
      text: 'Aspirin with no suspected acute coronary syndrome. It is for chest pain that may be a heart attack; he is 24, with palpitations and no chest pain — it treats nothing he has.',
    },
    {
      // the built-in's id, in this case's words; with a low pressure (cpapHarmful) the built-in cpap-hypotension speaks instead
      id: 'cpap-no-indication', actions: ['cpap'], when: (s, sc) => s.pulse && !cpapHarmful(s, sc), replaces: ['cpap-drowsy'], points: 3, severity: 'minor',
      text: 'CPAP with no breathing problem to treat. His lungs are clear and his oxygen normal; positive pressure cuts the blood returning to the heart and drops a pressure the fast rate is already straining.',
    },
    {
      // once he is back in sinus there is nothing left for them to treat; in WPW adenosine can even set off AF again
      // amiodarone after the procainamide that converted him is this same mistake: one penalty
      id: 'rate-drug-after-conversion', actions: ['adenosine6', 'adenosine12', 'diltiazem', 'metoprolol', 'amio-infusion'], when: (s) => s.pulse && !inAf(s), points: 3, severity: 'minor',
      replaces: ['amiodarone-after-procainamide', ...RATE_RULES],
      text: 'A rate or rhythm drug once he was back in a regular rhythm. There is nothing left to treat: they only drop the pressure — and in WPW adenosine can set off atrial fibrillation again.',
    },
    {
      // one rule for them all, in its own words; it stands in for the built-in procainamide-in-arrest rule
      id: 'rate-drug-in-arrest', actions: ['adenosine6', 'adenosine12', 'diltiazem', 'metoprolol', 'procainamide', 'amio-infusion'], when: (s) => !s.pulse, points: 3, severity: 'minor',
      replaces: ['procainamide-in-arrest'],
      text: 'A drug for a tachycardia with a pulse, given in cardiac arrest. In VF the treatment is a shock, CPR, epinephrine and — for VF that shocks have not fixed — amiodarone 300 mg or lidocaine.',
    },
    {
      id: 'delay-shock', actions: ['iv', 'io', 'epinephrine', 'amio-arrest', 'lidocaine', 'magnesium-sulfate', 'airway'],
      when: (s) => !s.pulse && s.rhythm.profile === 'vf' && has(s, 'pads') && !shockedThisArrest(s), replaces: ['airway-before-shock', 'epi-before-shock'], points: 5, severity: 'major',
      text: 'Something else before the shock, with the pads already on. Witnessed VF needs a shock first: IV access, drugs and the airway come after it, during CPR.',
    },
  ]),
  timings: [
    { label: 'Pads on', actions: PADS, target: 4 },
    { label: 'First 12-lead', actions: ['ecg12'], target: 8 },
    // the EMT's medics give it: the flag counts theirs
    { label: 'Procainamide or synchronized cardioversion started', actions: ['procainamide', 'cardiovert'], flag: 'treated' },
    { label: 'Back in a regular rhythm', actions: [], flag: 'converted' },
    { label: 'Transport started', actions: ['transport-pci', 'transport-near'], target: 15 },
    // the EMT's paramedic intercept gives it: the flag counts theirs
    { label: 'Synchronized cardioversion once unstable', actions: ['cardiovert'], flag: 'cardioverted', target: 3, from: 'unstable' },
    { label: 'First shock once pulseless', actions: ['defib', 'aed'], target: 2, from: 'arrest' },
  ],
  transportMinutes: 15,
  nearestMinutes: 8,
  // one arrival line for either destination (the heart center or the nearest emergency department): both have an ED
  arrival: 'You arrive at the emergency department: the emergency physician meets you at the door, and cardiology is on the way down.',
  teaching: [
    'Pre-excited atrial fibrillation: irregularly irregular, very fast (often 200–300 a minute), with wide QRS complexes that change in width and shape from beat to beat and slurred upstrokes (delta waves). An irregular wide-complex tachycardia over 200 in a young person is pre-excited AF until proven otherwise. Shortest pre-excited RR intervals of 250 ms or less mark a pathway that can drive the ventricles into VF.',
    'No AV-nodal blocker — ever: adenosine, diltiazem and verapamil, beta-blockers, digoxin and amiodarone are contraindicated in pre-excited AF (2023 ACC/AHA/ACCP/HRS AF guideline: 3 — Harm). With the node blocked, every impulse races down the pathway: the rate climbs and it can turn into VF. Magnesium and vagal maneuvers act on the node too, and cannot help.',
    'Unstable (hypotension, an acute change in mental status, signs of shock, ischemic chest pain, acute heart failure): synchronized cardioversion at once (2023 AF guideline, COR 1) — atrial fibrillation 200 J or more biphasic (2025 AHA), sedated if the pressure allows.',
    'Stable: stop it, never rate-control it — an elective synchronized cardioversion with sedation, or IV procainamide (or ibutilide, in hospital) as the alternative (2023 AF guideline, COR 1). Procainamide 20–50 mg/min until the arrhythmia stops, the systolic falls under 90, the QRS widens by more than 50 % or 17 mg/kg is in; avoid it in heart failure or a long QT. In the field, online medical control is the expert consultation the algorithm asks for.',
    'Never an unsynchronized shock with a pulse: it can land on the T wave and set off VF. If he does go into VF: shock at once, then 2 minutes of CPR straight away before the next check.',
    'EMT: a very fast, irregular pulse in a young person who feels faint is a high-risk rhythm. Check the pressure and the mind, put the AED pads on (it analyzes only once he is unresponsive, not breathing normally and pulseless), call ALS at once, acquire and transmit the 12-lead, and transport promptly with the pads on, meeting the paramedics on the way. Oxygen only if he is hypoxemic (the AHA tachycardia algorithm) — his SpO₂ is 97 %.',
    'Once he is back in sinus rhythm the 12-lead shows the pathway itself: a short PR (under 120 ms), a delta wave and a wide QRS. AF in a young person with no heart disease may be riding on a pathway. He needs an electrophysiology study and catheter ablation of the pathway (COR 1; 93–95 % success) — and no AV-nodal blockers until then.',
  ],
};

