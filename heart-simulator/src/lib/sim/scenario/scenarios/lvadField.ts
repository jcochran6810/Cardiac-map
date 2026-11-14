import type { Effect, Line, Scenario, SimState } from '../types';
import { allOf, atRate, bpAfter, count, firstDone, flagAt, has, mapOf } from '../kit';
import { NITRATE_RULES } from '../rules/acs';

/**
 * A man on a continuous-flow LVAD (a HeartMate 3, the only durable LVAD implanted in the US today) with two days of vomiting
 * and diarrhea, still taking his diuretic. He is dry: too little blood comes back to the pump, the controller sounds its
 * low-flow alarm, and his Doppler MAP is 58. He is awake and talking with no pulse to feel, the cuff and the NIBP read
 * nothing and the oximeter wanders over a nearly flat waveform. Being awake is the sign the pump is perfusing him: no
 * compressions, no AED (2025 AHA durable LVAD algorithm; 2017 AHA statement on CPR with mechanical circulatory support).
 * The right care is to check the pump, measure a Doppler MAP, call the VAD team, give fluid (the paramedic, or the
 * EMT's paramedic intercept), recheck, record a 12-lead, and take him to his implanting VAD center with his equipment and
 * his wife. The traps come from the numbers that cannot read (compressions, a vasopressor, CPAP for a "low" SpO₂), from
 * drugs that cut the preload a dry pump depends on, and from the destination and the equipment. Left without fluid he gets
 * worse at minute 14 and confused at minute 22.
 *
 * The flow model: his "level" is the boluses he has had minus the steps he has slipped while he waited. Each level has a
 * pump flow (the controller's number) and a heart rate; the Doppler MAP moves by the step each bolus or slip brings (from
 * 58: 66, 72, 74 with fluid; 52, 47 without), so other drugs that move the pressure keep their effect. His GCS follows the
 * MAP whatever moved it (gcsCap), and nothing takes the MAP under 45: he stays confused but answering, a perfusing pump.
 */

/** Minutes from the EMT's call until the paramedic intercept is at his side */
const ALS_MINUTES = 6;

/** Minutes of transport: his implanting VAD center (the heart center), and the nearest emergency department */
const TRANSPORT = 22;
const NEAREST = 8;

/** With no fluid by these minutes he slips: grayer and near fainting, then confused */
const WORSE_AT = 14;
const WORSE2_AT = 22;

/** The HeartMate 3 controller sounds its red low-flow (hazard) alarm under this flow, L/min */
const LOW_FLOW_ALARM = 2.5;

/** What his card says the pump usually moves, L/min */
const USUAL_FLOW = 4.5;

/** The controller's flow at each level (L/min): dry at 0, refilled from 1 */
const FLOW: Record<number, number> = { [-2]: 1.7, [-1]: 2.0, 0: 2.3, 1: 3.6, 2: 4.2, 3: 4.4 };

/** His heart rate at each level: a fast sinus rate is his answer to the low volume */
const HR: Record<number, number> = { [-2]: 126, [-1]: 120, 0: 112, 1: 102, 2: 94, 3: 90 };

/** What a bolus adds to the Doppler MAP, by the level it brings him to (58 → 66 → 72 → 74; 47 → 52 → 58) */
const MAP_STEP: Record<number, number> = { [-1]: 5, 0: 6, 1: 8, 2: 6, 3: 2 };

/** The oximeter finds a signal once the refilled heart adds a little pulsatility */
const SPO2_READS = 94;

const clampLevel = (n: number) => Math.max(-2, Math.min(3, n));

/** Fluid boluses he has had: the learner's, and the one the EMT's paramedic intercept gives */
const boluses = (s: SimState) => count(s, 'fluid') + (has(s, 'als-fluid') ? 1 : 0);

/** When the EMT's paramedic intercept reaches him: 6 minutes after the call (never, for the paramedic or with no call) */
const interceptAt = (s: SimState) => (s.role === 1 && has(s, 'als') ? s.flags.als + ALS_MINUTES : Infinity);

/** The steps he slipped while he waited for fluid */
const dryness = (s: SimState) => ['worse', 'worse2'].filter((id) => s.fired.includes(id)).length;

const level = (s: SimState) => clampLevel(boluses(s) - dryness(s));

/** GCS at a level: confused when he has slipped twice, near fainting once, otherwise awake and talking */
const gcsAt = (lv: number) => (lv <= -2 ? 12 : lv === -1 ? 14 : 15);

/**
 * How awake a Doppler MAP leaves him, whatever brought it there (the waiting, or a drug): under 55 slow and near
 * fainting, under 50 confused. The brain says what the pressure is doing, so a MAP in the 40s never comes with a man
 * chatting on the couch
 */
const gcsCap = (map: number) => (map < 50 ? 12 : map < 55 ? 14 : 15);

/** An opioid, a benzodiazepine, procedural sedation or IV diphenhydramine clouds him a little, whatever the pressure */
const sedated = (s: SimState) => ['analgesia', 'benzodiazepine', 'sedation', 'antihistamine'].some((f) => has(s, f));

/** His GCS for a new Doppler MAP and level (the lowest of the three limits) */
const gcsFor = (s: SimState, map: number, lv: number) => Math.min(gcsAt(lv), gcsCap(map), sedated(s) ? 14 : 15);

/**
 * The lowest Doppler MAP the waiting and the wrong drugs bring him to here: confused, but still answering — so still
 * perfusing (2025 AHA durable LVAD algorithm). The case teaches the perfusing pump; the unresponsive, unperfused LVAD
 * patient who needs compressions is the engine's own (and another case's) to play
 */
const MAP_FLOOR = 45;

/** A fall in his pressure: `d` mmHg off the systolic and the diastolic (so off the MAP), stopping at MAP_FLOOR */
function lower(s: SimState, d: number): { sbp: number; dbp: number } {
  const step = Math.max(0, Math.min(d, mapOf(s.vitals) - MAP_FLOOR));
  return bpAfter(s, -step, -step);
}

/** A drug that drops his pressure: the new pressure, and how awake it leaves him */
const dropped = (s: SimState, d: number) => {
  const bp = lower(s, d);
  return { ...bp, gcs: Math.min(s.vitals.gcs, gcsFor(s, mapOf(bp), level(s))) };
};

/** What he says, when he is awake enough to talk (GCS 13 or more); otherwise what the crew sees */
const ifTalking = (gcs: number, words: string, seen: string): Line => (gcs >= 13 ? ['patient', words, 'bad'] : ['partner', seen, 'bad']);

/**
 * The controller's flow, now or as an action about to take effect leaves it (`plus`): a bolus refills the pump; a
 * vasopressor tightens the outflow (the pump is afterload-sensitive); nitroglycerin and a rate-slowing drug cut what comes
 * back to it; raised legs return a little while he is dry
 */
function flowFor(s: SimState, plus: { bolus?: boolean; flag?: string } = {}): number {
  const lv = clampLevel(boluses(s) + (plus.bolus ? 1 : 0) - dryness(s));
  const on = (f: string) => has(s, f) || plus.flag === f;
  let f = FLOW[lv];
  if (lv <= 0 && on('legs-up')) f += 0.1;
  if (on('pressor')) f -= 0.4;
  if (on('nitro')) f -= 0.3;
  if (on('beta-blocker') || on('diltiazem')) f -= 0.3;
  return Math.max(1.5, Math.round(f * 10) / 10);
}

const lpm = (f: number) => f.toFixed(1);

/** The pump uses less power and shows less pulsatility when it has less blood to move */
const powerText = (f: number) => (2 + 0.55 * f).toFixed(1);
const piText = (f: number) => Math.max(0.8, f * 0.85 - 0.3).toFixed(1);

/** Awake and talking: the pump perfuses him well enough for the ride to his VAD center */
const stableEnough = (s: SimState) => s.pulse && s.vitals.gcs >= 14;

/** The pump is perfusing (2025 AHA durable LVAD algorithm): awake (GCS 9 or more), or a Doppler MAP over 50 */
const perfusing = (s: SimState) => s.pulse && (s.vitals.gcs >= 9 || mapOf(s.vitals) > 50);

/** What the oximeter shows: a number over a nearly flat waveform while he is dry, a real reading once he is refilled */
const spo2Text = (s: SimState) => (level(s) >= 1
  ? `SpO₂ ${s.vitals.spo2}% with a small waveform`
  : `the oximeter wanders around ${s.vitals.spo2}% over a nearly flat waveform — it has almost no pulse to read`);

/** The pump check: the hum, the controller's alarm and numbers, the power and the driveline */
function controllerText(s: SimState): string {
  const f = flowFor(s);
  const alarm = f < LOW_FLOW_ALARM ? 'a red heart symbol and a steady alarm tone (LOW FLOW)' : 'no alarm';
  return `A steady pump hum over the left chest: the pump is running. Controller: ${alarm}; flow ${lpm(f)} L/min (his card says it usually runs ${lpm(USUAL_FLOW)}), speed 5,400 rpm (his set speed), power ${powerText(f)} W, pulsatility index ${piText(f)}. Both batteries connected and charged; the driveline runs intact to a clean, dry dressing.`;
}

/**
 * The EMT's way to IV fluid, in the coordinator's words: the paramedic who is with them, the intercept on its way, or an
 * intercept still to be called (an EMT crew has no paramedic until it asks for one)
 */
function emtFluid(s: SimState, unstable: boolean): string {
  if (has(s, 'als-here')) return unstable ? 'Have your paramedic run another 500 mL on the way.' : 'He needs more fluid: have your paramedic give another 500 mL of saline, then recheck';
  if (has(s, 'als')) return unstable ? 'Your paramedic can start a line and run fluid when they reach you.' : 'He needs IV fluid: when your paramedic gets there, 500 mL of saline — lay him flat with his legs up while you wait';
  return unstable ? 'Get a paramedic intercept to meet you for IV fluid.' : 'He needs IV fluid: get a paramedic intercept to start a line and give 500 mL of saline — lay him flat with his legs up while you wait';
}

/** What the VAD coordinator says: the numbers first, then what to do and where to go */
function vadText(s: SimState): string {
  const missing = [!has(s, 'lvad-check') && 'read me the controller — the alarm, the flow, speed, power and PI', !has(s, 'doppler') && 'get me a Doppler MAP'].filter(Boolean);
  if (missing.length) {
    return `VAD coordinator: "This is his VAD team. Please ${missing.join(' and ')}, then call me straight back. Don't change anything on the controller, and whatever happens his travel bag goes with him."`;
  }
  const f = lpm(flowFor(s));
  const map = mapOf(s.vitals);
  const medic = s.role === 2;
  if (!stableEnough(s)) {
    return `VAD coordinator: "Flow ${f} and a MAP of ${map}, and he is confused now: he is too unstable for the long ride. Go to the nearest emergency department — we will call them, talk them through it and bring him over once he is stable. ${medic ? 'Run 500 mL of saline on the way, and more if the MAP stays under 60.' : emtFluid(s, true)} No compressions while he responds to you, and leave the controller alone."`;
  }
  if (flowFor(s) < LOW_FLOW_ALARM) {
    const fluid = medic
      ? `Give him ${boluses(s) > 0 ? 'another ' : ''}500 mL of normal saline now, then recheck the Doppler MAP and the controller.`
      : `${emtFluid(s, false)}.`;
    return `VAD coordinator: "Low flow at ${f} with a MAP of ${map}, after two days of vomiting and diarrhea and still on his furosemide: he is dry, and the pump can only move the blood that comes back to it. ${fluid} Leave the controller alone: no setting changes, no swapping controllers, and never disconnect the driveline — the alarm is telling you the truth. No compressions while he is talking to you. Bring him to us, his implanting center, with his travel bag and his wife, and call us when you leave."`;
  }
  return `VAD coordinator: "Flow ${f} and a MAP of ${map}: that is the fluid working. Bring him to us with his travel bag and his wife. Another 250 to 500 mL on the way if the alarm comes back or the MAP drops under 60."`;
}

/** A history answer: his own words while he is clear, his wife's once he is too confused to give them */
const byWife = (s: SimState, his: string, hers: string) => (s.vitals.gcs >= 13 ? his : `He is too muddled to answer; his wife answers for him: "${hers}"`);

/** What he says when reassessed */
function statusText(s: SimState): string {
  if (!s.pulse) return 'Unresponsive.';
  const lv = level(s);
  if (s.vitals.gcs <= 12) return '"Where… where are we going?" He drifts off between questions.';
  if (s.vitals.gcs <= 14) return '"I feel like I\'m going to pass out…"';
  if (lv >= 2) return '"I feel almost myself again."';
  if (lv === 1) return '"Better — not so dizzy. Still thirsty."';
  return '"Still dizzy… and so thirsty."';
}

/**
 * A fluid bolus (the learner's, or the one the EMT's paramedic intercept gives): one level up, the pressure up by the step
 * it brings, the rate down, and the alarm quiet once the flow is back over 2.5 L/min
 */
function bolusEffect(s: SimState, lead: Line[], flags: string[]): Effect {
  const before = level(s);
  const after = clampLevel(before + 1);
  if (after === before) {
    return { say: [...lead, ['you', 'No further change: the flow is back in his usual range, and he needs no more fluid for now.']], flags };
  }
  const step = MAP_STEP[after];
  const bp = bpAfter(s, step, step);
  const hr = Math.max(60, s.rhythm.hr + HR[after] - HR[before]);
  const f = flowFor(s, { bolus: true });
  // he wakes as far as the new pressure allows (a MAP a drug pushed down comes back only part of the way)
  const gcs = Math.max(s.vitals.gcs, gcsFor(s, mapOf(bp), after));
  const lines: Line[] = [...lead];
  if (f < LOW_FLOW_ALARM) lines.push(['you', 'The controller is still alarming.', 'warn']);
  else if (before <= 0) lines.push(['you', 'The controller\'s alarm goes quiet.', 'good']);
  else lines.push(['you', 'He looks pinker, and his hands are warmer.']);
  if (gcs >= 13) lines.push(['patient', after >= 2 ? '"I feel almost myself again."' : after === 1 ? '"That\'s better — the room has stopped spinning."' : '"A little better…"']);
  if (has(s, 'monitor')) lines.push(['monitor', `Heart rate ${hr}.`]);
  return { say: lines, vitals: { ...bp, gcs, ...(after >= 1 ? { spo2: Math.max(s.vitals.spo2, SPO2_READS) } : {}) }, rhythm: atRate(s, hr), flags };
}

/** A drug that slows the heart: the fast rate that holds up his output falls, and less blood comes back to the pump */
function rateDrug(s: SimState, what: string, flag: string): Effect | null {
  if (!s.pulse) return null;
  const vitals = dropped(s, 8);
  const hr = Math.min(s.rhythm.hr, Math.max(60, s.rhythm.hr - 12));
  const lines: Line[] = [['you', what], ifTalking(vitals.gcs, '"Oh… I\'m going to pass out…"', 'He goes gray and stops answering for a moment.')];
  if (has(s, 'monitor')) lines.push(['monitor', `Heart rate ${hr}.`]);
  return { say: lines, vitals, rhythm: atRate(s, hr), flags: [flag] };
}

/** Nitroglycerin: it pools blood in the veins, and less comes back to a pump already short of it */
function nitrate(s: SimState, what: string, d: number, flags: string[]): Effect | null {
  if (!s.pulse) return null;
  const vitals = dropped(s, d);
  return { say: [['you', what], ifTalking(vitals.gcs, '"Whoa — everything is going gray…"', 'He goes gray and slow to answer.')], vitals, flags };
}

/** A drug with nothing to treat here that drops the pressure (an antiarrhythmic, magnesium) */
function pressureDrop(s: SimState, what: string, d: number, flags: string[]): Effect | null {
  if (!s.pulse) return null;
  const vitals = dropped(s, d);
  const lines: Line[] = [['you', what]];
  if (vitals.gcs < s.vitals.gcs) lines.push(ifTalking(vitals.gcs, '"I feel faint again…"', 'He is slower to answer.'));
  return { say: lines, vitals, flags };
}

/** A sedative or an opioid: no pain or agitation to treat, and the pressure and the breathing drop */
function sedative(s: SimState, what: string, flags: string[]): Effect | null {
  if (!s.pulse) return null;
  const bp = lower(s, 5);
  const rr = Math.min(s.vitals.rr, Math.max(10, s.vitals.rr - 2));
  // drowsier from the drug, and from the pressure it takes away
  const gcs = Math.min(s.vitals.gcs, 14, gcsCap(mapOf(bp)));
  return { say: [['you', what], ifTalking(gcs, '"I feel woozy… and sick again."', 'He mumbles and drifts off.')], vitals: { ...bp, rr, gcs }, flags };
}

/** The SBAR hand-off: only what this crew found and did (no "after the fluid" for a man who never had any) */
function handoffText(s: SimState): string {
  const parts = [
    s.vitals.gcs >= 13 ? 'no palpable pulse, awake and talking' : 'no palpable pulse, confused but answering',
    has(s, 'lvad-check') ? 'the low-flow alarm and the controller\'s numbers' : 'the controller alarming (not read)',
    has(s, 'doppler') ? (boluses(s) > 0 ? 'the Doppler MAP before and after the fluid' : 'the Doppler MAP, and no IV fluid yet') : 'no Doppler MAP taken',
    has(s, 'sample') || has(s, 'opqrst') ? 'two days of vomiting and diarrhea on a diuretic' : 'two days of vomiting and diarrhea',
    ...(has(s, 'ecg12') ? ['the 12-lead'] : []),
    ...(has(s, 'vad-advice') ? ['what the VAD team advised'] : []),
    ...(has(s, 'sample') ? ['his medicines — warfarin, aspirin, sildenafil'] : []),
  ];
  return `SBAR hand-off: ${parts.join('; ')}.`;
}

/** Two minutes of transport, then the drive: the default's flags and timers, in this case's words */
function transport(s: SimState, to: 'pci' | 'near'): Effect | null {
  if (has(s, 'enroute')) return null;
  const mins = to === 'pci' ? TRANSPORT : NEAREST;
  const where = to === 'pci' ? 'the heart center, his implanting VAD center' : 'the nearest emergency department';
  const bag = has(s, 'equipment')
    ? ' His travel bag rides on the stretcher, and his wife climbs in beside him.'
    : ' His wife climbs in beside him; his travel bag is still by the door.';
  // the nearest department is the right call once he is too unstable for the long ride, and the long ride the wrong one
  const flags = to === 'pci'
    ? ['enroute', 'dest-pci', ...(stableEnough(s) ? [] : ['pci-unstable'])]
    : ['enroute', 'dest-near', ...(stableEnough(s) ? [] : ['near-justified'])];
  return { say: [['you', `Loaded lying flat; transporting to ${where} (${mins} min).${bag}`]], flags, timers: { arrive: s.minute + 2 + mins } };
}

export const lvadField: Scenario = {
  id: 'lvad-field',
  title: 'No pulse, still talking',
  summary: '66-year-old man with a heart pump, dizzy after two days of vomiting and diarrhea, and a controller that will not stop alarming. You cannot feel a pulse — and he is talking to you.',
  setting: 'field',
  roles: [1, 2],
  difficulty: 'intermediate',
  conditionId: 'hfref',
  briefing: {
    default: [
      ['dispatch', 'Priority 1: 66-year-old man, dizzy and weak after two days of vomiting and diarrhea. The caller says his heart pump is alarming. You are the ALS crew.'],
      ['scene', 'A tidy living room. He sits on the couch, pale and sweaty, an emesis bowl in his lap — but he looks up and talks to you. A controller on his belt shows a red heart symbol and beeps steadily; a cable runs from it under his shirt, and two batteries sit in holsters under his arms. His wife: "It started beeping 20 minutes ago. He has an LVAD — the number for his VAD team is on the controller."'],
      ['partner', 'Your partner, an EMT, has the stretcher and the airway bag; you have the monitor, the Doppler and the drug box.'],
      ['hospital', 'The heart center — his implanting VAD center, with the VAD team and cardiac surgery: 22 minutes. Nearest emergency department (no VAD program): 8 minutes.'],
    ],
    1: [
      ['dispatch', 'Priority 1: 66-year-old man, dizzy and weak after two days of vomiting and diarrhea. The caller says his heart pump is alarming. You are the BLS crew; a paramedic unit can meet you as an intercept if you ask for one.'],
      ['scene', 'A tidy living room. He sits on the couch, pale and sweaty, an emesis bowl in his lap — but he looks up and talks to you. A controller on his belt shows a red heart symbol and beeps steadily; a cable runs from it under his shirt, and two batteries sit in holsters under his arms. His wife: "It started beeping 20 minutes ago. He has an LVAD — the number for his VAD team is on the controller."'],
      ['partner', 'Your partner, an EMT, has the stretcher, the oxygen and the AED; the 12-lead monitor and the Doppler are in your bag.'],
      ['hospital', 'The heart center — his implanting VAD center, with the VAD team and cardiac surgery: 22 minutes. Nearest emergency department (no VAD program): 8 minutes.'],
    ],
  },
  initial: {
    // a sinus rate that is his answer to the low volume
    rhythm: { profile: 'sinus-tachycardia', hr: HR[0] },
    // a continuous-flow pump: a narrow pulse pressure around a Doppler MAP of 58. The SpO₂ is the oximeter's number over a
    // nearly flat waveform, not his saturation (his lips are pink and his lungs clear)
    vitals: { sbp: 62, dbp: 56, spo2: 86, rr: 18, etco2: 32, pain: 0, gcs: 15, glucose: 104, temp: 36.9 },
    lvad: true,
  },
  // his ischemic cardiomyopathy: IV diltiazem and procainamide are harmful (this case's own rules say so in its words);
  // sildenafil and warfarin; an ICD
  problems: ['heart-failure', 'pde5-inhibitor', 'oral-anticoagulant', 'implanted-device'],
  facts: {
    opqrst: (s) => byWife(s, 'No chest pain, and I\'m not short of breath. Two days of throwing up and the runs — half the family caught it at our grandson\'s birthday party. Since this morning I go gray and dizzy whenever I stand up, and an hour ago I nearly passed out on the way to the bathroom. Then the controller started beeping.', 'No chest pain, and he hasn\'t been short of breath. Two days of throwing up and diarrhea — half the family caught it at our grandson\'s birthday party. Since this morning he goes gray and dizzy whenever he stands, and an hour ago he nearly passed out on the way to the bathroom. Then the controller started beeping.'),
    sample: (s) => byWife(s, 'No allergies. Warfarin, a baby aspirin, furosemide 40 and losartan every morning — "I took them today like always" — sildenafil three times a day for the pressure in my lungs, and a cholesterol pill. Two heart attacks; the LVAD went in two years ago at the heart center, for good, and I have a defibrillator that has never fired. Diabetes on pills. Nothing has stayed down since yesterday, only sips of water. No blood in the vomit, and the diarrhea is watery and brown, never black.', 'No allergies. Warfarin, a baby aspirin, furosemide 40 and losartan every morning — he took them today like always — sildenafil three times a day for the pressure in his lungs, and a cholesterol pill. Two heart attacks; the LVAD went in two years ago at the heart center, and he has a defibrillator that has never fired. Diabetes on pills. Nothing has stayed down since yesterday, only sips of water. No blood in the vomit, and the diarrhea is watery and brown, never black.'),
    pde5: (s) => byWife(s, '"Sildenafil — 20 mg three times a day, for the pressure in my lungs. The last one at breakfast."', 'Sildenafil — 20 mg three times a day, for the pressure in his lungs. The last one at breakfast.'),
    // no ownNitro: he has no nitroglycerin of his own, so the EMT's 'nitro-assist' is refused (the default)
    lungs: 'Clear and equal on both sides, no crackles; he breathes easily.',
    perfusion: (s) => {
      // the skin follows the pressure too: a MAP a drug pushed under 55 looks like the second slip
      const lv = mapOf(s.vitals) < 55 ? Math.min(level(s), -1) : level(s);
      const pulses = 'No pulse to feel at the wrist, the groin or the foot — normal over his pump.';
      if (lv <= -1) return `Gray, with cool, clammy hands; capillary refill 4 seconds; a dry mouth and a furrowed tongue; neck veins flat even lying back; no leg swelling. ${pulses}`;
      if (lv === 0) return `Pale, with cool hands; capillary refill 3 seconds; a dry mouth and a furrowed tongue; neck veins flat; no leg swelling. ${pulses}`;
      return `Color coming back; warmer hands, capillary refill 2 seconds; still a dry mouth; neck veins flat; no leg swelling. ${pulses}`;
    },
    neuro: (s) => (s.vitals.gcs <= 12
      ? 'Confused and drowsy; he moves all four limbs; face and speech symmetrical.'
      : s.vitals.gcs <= 14
        ? 'Slow to answer; face, speech and arms normal.'
        : 'Alert and oriented; face, speech and arms normal — no sign of a stroke.'),
    lvad: controllerText,
    vadTeam: vadText,
    // what the profile draws: sinus at his rate, narrow QRS, no ST shift
    ecg12: (s) => {
      const hr = s.rhythm.hr;
      const rhythm = hr > 100 ? `Sinus tachycardia ${hr}` : `Sinus rhythm ${hr}`;
      // a rate that came down with the fluid, or one a drug pushed down while the cause stayed
      const why = hr > 100
        ? 'A fast sinus rate is his answer to a low volume: it needs fluid, not a drug.'
        : boluses(s) > 0 && !has(s, 'beta-blocker') && !has(s, 'diltiazem')
          ? 'The rate has come down as the fluid went in.'
          : 'A drug has pushed the rate down, but not the cause: a fast sinus rate was his answer to a low volume, and it needs fluid.';
      return `${rhythm}: a normal P wave before every QRS, a narrow QRS and normal intervals, with no ST elevation or depression. ${why} The 12-lead matters with an LVAD all the same: ventricular arrhythmias are common, and he could be awake and talking in VT or even VF — only the tracing tells.`;
    },
  },
  status: statusText,
  respond: {
    // the cuff hears nothing over a continuous-flow pump, and the oximeter has almost no pulse to read
    vitals: (s) => (s.pulse
      ? { say: [['you', `No palpable pulse, and no sounds with the cuff: no blood pressure by hand. RR ${s.vitals.rr}; ${spo2Text(s)}. His lips and nail beds are pink.`]] }
      : null),
    reassess: (s) => {
      if (!s.pulse) return null;
      const parts = ['No palpable pulse'];
      if (has(s, 'monitor')) parts.push(`heart rate ${s.rhythm.hr} on the monitor`);
      if (has(s, 'doppler')) parts.push(`Doppler MAP ${mapOf(s.vitals)}`);
      parts.push(`RR ${s.vitals.rr}`, spo2Text(s), flowFor(s) < LOW_FLOW_ALARM ? 'the controller still alarming' : 'the controller quiet');
      return { say: [['you', `${parts.join(' · ')}.`], ['patient', statusText(s)]] };
    },
    monitor: (s) => (s.pulse
      ? {
        say: [
          ['monitor', s.role === 1 ? `Monitor on: heart rate ${s.rhythm.hr}. Interpreting the rhythm is outside EMT scope — acquire and transmit a 12-lead.` : `Monitor attached: heart rate ${s.rhythm.hr}.`],
          ['you', level(s) >= 1 ? `SpO₂ ${s.vitals.spo2}% with a small pleth.` : `The pleth is nearly flat, and the SpO₂ number wanders between 80 and 90: the probe has almost no pulse to read. His lips are pink.`],
        ],
        flags: ['monitor'],
      }
      : null),
    // front and back, clear of the pump at the apex and the ICD under the left collarbone
    pads: () => ({ say: [['you', 'Pads on front and back (anterior–posterior), clear of the pump and of the ICD under his left collarbone: ready if the rhythm changes.']], flags: ['pads', 'monitor'] }),
    'lvad-check': (s) => {
      if (!s.pulse) return null;
      const lines: Line[] = [['you', controllerText(s)]];
      if (!has(s, 'equipment')) lines.push(['partner', 'His wife hands over his travel bag — two charged spare batteries in their clips, the backup controller, the power cable and his emergency card — and I have put it on the stretcher.']);
      return { say: lines, flags: ['lvad-check', 'equipment'] };
    },
    // the coordinator needs the controller's numbers and a Doppler MAP to advise; whatever happens, the bag goes with him
    'call-vad': (s) => {
      const advised = has(s, 'lvad-check') && has(s, 'doppler');
      return { say: [['hospital', vadText(s)]], flags: ['vad-team', 'equipment', ...(advised ? ['vad-advice'] : [])] };
    },
    // he is dry: each bolus refills the pump
    fluid: (s) => (s.pulse ? bolusEffect(s, [['you', '500 mL of normal saline in through the IV.']], ['fluid']) : null),
    // about 300 mL comes back from the legs while he is dry; an emesis bag stays in his hand in case he vomits
    'legs-up': (s) => {
      if (!s.pulse) return null;
      if (level(s) >= 1) return { say: [['you', 'Lying flat with his legs raised.']], flags: ['legs-up'] };
      return {
        say: [['you', 'Lying flat with his legs raised, an emesis bag in his hand in case he vomits.'], ...(s.vitals.gcs >= 13 ? [['patient', '"…That\'s a little better."'] as Line] : [])],
        vitals: bpAfter(s, 3, 3), flags: ['legs-up'],
      };
    },
    // oxygen for a number that cannot be trusted: the probe still has no pulse to read
    'o2-nc': (s) => (s.pulse && level(s) <= 0
      ? { say: [['you', `Nasal cannula on at 2–4 L/min. The oximeter still wanders around ${s.vitals.spo2}% over a nearly flat waveform — it has no pulse to read. His lips are pink, and he breathes easily.`]], flags: ['o2'] }
      : null),
    'o2-nrb': (s) => (s.pulse && level(s) <= 0
      ? { say: [['you', `Non-rebreather on at 15 L/min. The oximeter still wanders around ${s.vitals.spo2}% over a nearly flat waveform — it has no pulse to read. His lips are pink, and he breathes easily.`]], flags: ['o2'] }
      : null),
    // positive pressure in the chest cuts the venous return a dry pump depends on
    cpap: (s) => {
      if (!s.pulse) return null;
      const f = flowFor(s);
      return {
        say: [['you', `CPAP mask on at 5 cmH₂O. Within a minute the controller's flow falls from ${lpm(f)} to ${lpm(Math.max(1.5, f - 0.3))} L/min and ${s.vitals.gcs >= 13 ? 'he says he is about to faint' : 'he slumps, harder to rouse'}: the pressure in his chest cuts the blood coming back to his heart. You take the mask off.`, 'bad']],
        flags: ['cpap'],
      };
    },
    cpr: (s) => (perfusing(s) && s.vitals.gcs >= 9
      ? { say: [['patient', '"Ow — what are you doing?" He pushes your hands away: awake and talking, the pump perfusing him.', 'bad']] }
      : null),
    // an unsynchronized shock to an awake man in a sinus rhythm
    defib: (s) => (s.pulse
      ? { say: [['monitor', 'Shock delivered: 200 J.'], ['patient', '"Aaagh!" He doubles over on the couch — he was awake the whole time.', 'bad']], flags: ['pads', 'monitor'] }
      : null),
    // a vasopressor tightens the outflow of a pump that is afterload-sensitive: the MAP creeps up, the flow falls
    pressor: (s) => {
      if (!s.pulse) return null;
      return {
        say: [['you', 'Norepinephrine infusion running.'], ['you', `The controller's flow falls to ${lpm(flowFor(s, { flag: 'pressor' }))} L/min as the vessels tighten: the pump is pushing against the squeeze.`, 'bad']],
        vitals: bpAfter(s, 6, 6), flags: ['pressor'],
      };
    },
    'push-epi': (s) => (s.pulse
      ? { say: [['you', 'Push-dose epinephrine 10–20 mcg IV.'], ['you', 'For a few minutes his heart races and the controller\'s flow dips; then both settle back where they were.', 'warn']], flags: ['push-epi'] }
      : null),
    // nitrates cut the preload a dry pump depends on (and he takes sildenafil)
    nitro: (s) => nitrate(s, 'Nitroglycerin 0.4 mg under the tongue.', 5, ['nitro']),
    'nitro-high': (s) => nitrate(s, 'Nitroglycerin 0.8 mg under the tongue.', 8, ['nitro', 'nitro-high']),
    metoprolol: (s) => rateDrug(s, 'Metoprolol 5 mg IV.', 'beta-blocker'),
    diltiazem: (s) => rateDrug(s, 'Diltiazem IV.', 'diltiazem'),
    // the antiarrhythmics and magnesium: no arrhythmia to treat, and each drops a pressure that is already low
    'amio-infusion': (s) => pressureDrop(s, 'Amiodarone 150 mg running over 10 minutes.', 4, ['amiodarone']),
    'amio-arrest': (s) => pressureDrop(s, `Amiodarone ${count(s, 'amio-arrest') === 0 ? 300 : 150} mg IV push.`, 6, ['amiodarone']),
    procainamide: (s) => pressureDrop(s, 'Procainamide running at 30 mg/min.', 7, ['procainamide']),
    'magnesium-sulfate': (s) => pressureDrop(s, 'Magnesium sulfate 2 g running over 15 minutes.', 4, ['magnesium']),
    fentanyl: (s) => sedative(s, 'Fentanyl 50 mcg IV.', ['analgesia']),
    midazolam: (s) => sedative(s, has(s, 'iv') ? 'Midazolam 2.5 mg IV.' : 'Midazolam 5 mg IM (no IV yet).', ['benzodiazepine', 'sedation']),
    sedation: (s) => sedative(s, 'Sedation given per protocol.', ['sedation']),
    // IV diphenhydramine: no allergy to treat; it sedates and drops the pressure a little
    diphenhydramine: (s) => sedative(s, 'Diphenhydramine 50 mg IV.', ['antihistamine']),
    // a beta-agonist with no wheeze: it only speeds a rate that is already fast
    albuterol: (s) => {
      if (!s.pulse) return null;
      const hr = Math.min(150, s.rhythm.hr + 6);
      const lines: Line[] = [['you', 'Albuterol nebulizer running.'], ...(s.vitals.gcs >= 13 ? [['patient', '"My hands are shaking…"'] as Line] : [])];
      if (has(s, 'monitor')) lines.push(['monitor', `Heart rate ${hr}.`]);
      return { say: lines, rhythm: atRate(s, hr), flags: ['albuterol'] };
    },
    // he already takes a baby aspirin with his warfarin, and he is vomiting
    aspirin: (s) => (s.pulse ? { say: [['patient', s.vitals.gcs >= 13 ? '"I already take a baby aspirin with my warfarin…" He chews it — and retches.' : 'He chews it slowly — and retches.']], flags: ['aspirin'] } : null),
    // two days of vomiting: settling his nausea is good care (his QT is normal)
    ondansetron: (s) => (s.pulse ? { say: [['you', 'Ondansetron 4 mg IV, slowly over 30 seconds.'], ...(s.vitals.gcs >= 13 ? [['patient', '"The sick feeling is settling."'] as Line] : [])], flags: ['antiemetic'] } : null),
    'hs-ts': (s) => ({
      say: [['you', `Causes of a low-flow alarm against what you know. Too little volume: two days of vomiting and diarrhea, his furosemide this morning, a dry mouth and flat neck veins — the likeliest. Bleeding: no blood in the vomit and no black stools, but he takes warfarin and aspirin — keep asking. A failing right ventricle: no distended neck veins, no leg swelling. An arrhythmia: the 12-lead tells. Tamponade or a clot in the pump: the VAD center's echo and the controller's power. A pressure too high for the pump: ${has(s, 'doppler') ? `not with a Doppler MAP of ${mapOf(s.vitals)}` : 'the Doppler MAP tells'}.`]],
      flags: ['hs-ts'],
    }),
    // the physician reads what was sent: no STEMI; the cause is the volume
    'ecg-transmit': (s) => (has(s, 'ecg12')
      ? { say: [['hospital', 'ECG received. The physician: "No ST elevation — this is not a cath lab call. The rate is fast: treat his volume as his VAD team advises, and call me if the rhythm changes."']], flags: ['transmitted'] }
      : null),
    'stemi-alert': (s) => (has(s, 'ecg12')
      ? { say: [['hospital', 'The interventional cardiologist reviews your 12-lead: no ST elevation — the cath lab is not activated. Take him where his VAD team is.', 'warn']], flags: ['alert-declined'] }
      : null),
    'med-control': (s) => ({
      say: [['hospital', `Medical control: "Talk to his VAD team — the number is on the controller — and follow them: they know his pump. No compressions while he is awake; ${s.role === 2 ? 'fluid for the low flow' : 'a paramedic for IV fluid'}; and take him to his VAD center with all his equipment unless he gets too unstable for the ride."`]],
      flags: ['med-control'],
    }),
    notify: (s) => ({
      say: [['hospital', has(s, 'dest-pci')
        ? 'Heart center: "Copy. His VAD team will meet you in the emergency department."'
        : has(s, 'dest-near')
          ? 'Copy. We have no VAD program here: we will call his VAD team.'
          : 'Copy. Call us when you know where you are taking him.']],
      flags: ['notified'],
    }),
    'transport-pci': (s) => transport(s, 'pci'),
    'transport-near': (s) => transport(s, 'near'),
    handoff: (s) => {
      if (!has(s, 'arrived') || !s.pulse) return null;
      return {
        say: [
          ['you', handoffText(s)],
          ['hospital', has(s, 'dest-pci')
            ? 'His VAD team takes over. The bedside echo shows a small, underfilled left ventricle and a working right ventricle — no clot, no fluid around the heart. His kidneys are dry and his potassium is low from the diarrhea: he stays for fluids and potassium, with his diuretic on hold.'
            : 'The emergency physician talks with his VAD team: fluids here, then a transfer to them.'],
        ],
        flags: ['handoff'],
      };
    },
  },
  events: [
    {
      // still dry: less and less comes back to the pump
      id: 'worse',
      // not if the EMT's intercept reached him first (an action can end after both)
      when: (s) => s.pulse && !has(s, 'fluid') && !has(s, 'arrived') && s.minute >= WORSE_AT && interceptAt(s) > WORSE_AT,
      effect: (s) => {
        const hr = s.rhythm.hr + HR[-1] - HR[0];
        // the slip is already counted (fired), so level(s) is the new one
        const vitals = dropped(s, 6);
        const lines: Line[] = [
          ...(vitals.gcs >= 13 ? [['patient', '"I feel like I\'m going to pass out…"', 'bad'] as Line] : []),
          ['partner', 'He has gone grayer and sweatier, and the controller has not stopped alarming.', 'bad'],
        ];
        if (has(s, 'monitor')) lines.push(['monitor', `Heart rate ${hr}.`]);
        return { say: lines, vitals, rhythm: atRate(s, hr) };
      },
    },
    {
      id: 'worse2',
      when: (s) => s.pulse && !has(s, 'fluid') && !has(s, 'arrived') && s.fired.includes('worse') && s.minute >= WORSE2_AT && interceptAt(s) > WORSE2_AT,
      effect: (s) => {
        const hr = s.rhythm.hr + HR[-2] - HR[-1];
        const lines: Line[] = [['partner', 'He is drowsy and slow to answer, and he keeps asking where he is.', 'bad']];
        if (has(s, 'monitor')) lines.push(['monitor', `Heart rate ${hr}.`]);
        return { say: lines, vitals: dropped(s, 5), rhythm: atRate(s, hr) };
      },
    },
    {
      // the EMT's intercept: the paramedic starts a line and gives the fluid the pump needs (after the slips in this list,
      // so a slip that came first is played first)
      id: 'als-arrives',
      when: (s) => s.role === 1 && s.pulse && has(s, 'als') && !has(s, 'arrived') && s.minute >= interceptAt(s),
      effect: (s) => {
        const where = has(s, 'enroute') ? 'The medic unit meets you on the way; the paramedic climbs in' : 'The paramedic arrives';
        const lead: Line[] = [['team', `${where}: an IV in his left forearm, and 500 mL of normal saline running in.`]];
        if (!has(s, 'vad-team')) lead.push(['team', '"Has anyone called his VAD team? The number is on the controller."', 'warn']);
        return bolusEffect(s, lead, ['iv', 'fluid', 'als-fluid', 'als-here']);
      },
    },
    {
      // the VAD team is waiting if it was called; his own batteries and backup controller are there if they came with him
      id: 'arrive-center',
      when: (s) => has(s, 'arrived') && has(s, 'dest-pci'),
      effect: (s) => {
        const team = has(s, 'vad-team') ? 'His VAD team meets you at the door with an echo machine.' : 'Nobody told his VAD team he was coming: they are paged from the emergency department.';
        const bag: Line = has(s, 'equipment')
          ? ['hospital', `${team} His wife hands them the travel bag.`]
          : ['hospital', `${team} "Where are his spare batteries and his backup controller?" They plug him into one of their power modules, and his wife has to go home for the bag.`, 'warn'];
        return { say: [bag] };
      },
    },
    {
      id: 'arrive-near',
      when: (s) => has(s, 'arrived') && has(s, 'dest-near'),
      effect: (s) => ({
        say: [['hospital', `The emergency physician: "We have no VAD program here — I am calling his VAD team, and he will be transferred to them."${has(s, 'equipment') ? '' : ' "And his spare batteries? These are the only ones he has."'}`, has(s, 'equipment') ? 'info' : 'warn']],
      }),
    },
  ],
  critical: [
    {
      id: 'primary', label: 'Primary survey: awake, talking and breathing — not cardiac arrest', points: 5, target: { by: 2 }, done: ['primary'],
      why: 'A continuous-flow LVAD leaves no pulse to feel. Awake and talking means the pump is perfusing his brain: this is not cardiac arrest (2025 AHA durable LVAD algorithm), and compressions and the AED are not for him.',
    },
    {
      id: 'lvad-check', label: 'Check the pump: hum, controller alarm and numbers, power and driveline', points: 15, target: { by: 5 }, done: ['lvad-check'],
      why: 'Listen for the hum over the left chest, read the controller (the alarm, flow, speed, power and PI), check both power sources and the driveline. His is running with a red LOW FLOW alarm at 2.3 L/min: too little blood is getting through the pump.',
    },
    {
      id: 'doppler', label: 'Doppler MAP: the cuff and the oximeter cannot read him', points: 15, target: { by: 6 }, done: ['doppler-map'],
      why: 'With no pulse the cuff hears nothing and the NIBP fails: a manual cuff with a Doppler probe over the brachial artery gives the MAP (the pressure at which the flow sound returns). His is 58 — low (his usual range is about 70–90).',
    },
    {
      // a first look at him and the pump comes before the call; by 5 minutes the intercept still gets there before he slips
      id: 'als', label: 'Request a paramedic intercept for IV fluid', roles: [1], points: 15, target: { by: 5 }, done: ['als'],
      why: 'His pump is short of blood and he needs IV fluid, which an EMT cannot give: call the intercept early — it can meet you on the way.',
    },
    {
      // the EMT's share of the treatment: what the call brings, in time. Without it he arrives confused with a MAP in the 40s
      id: 'intercept-fluid', label: 'IV fluid through the paramedic intercept before he gets worse', roles: [1], points: 20, target: { by: WORSE_AT },
      why: 'The fluid is his treatment: a pump short of blood needs volume. The intercept takes 6 minutes, so call it within the first few minutes and it reaches him — on scene or on the way — before he slips (at 14 minutes he is near fainting, at 22 confused).',
      done: (s) => flagAt(s)('als-fluid'),
      uses: ['als'],
    },
    {
      id: 'perfusion', label: 'Judge perfusion without a pulse: mental status, skin and capillary refill', points: 5, target: { by: 10 }, done: ['perfusion'],
      why: 'Perfusion, not a pulse, is what you assess over an LVAD: he is awake, pale and cool with a slow capillary refill, a dry mouth and flat neck veins — a perfusing pump that is running dry.',
    },
    {
      id: 'vad-team', label: 'Call the VAD team with the controller numbers and the Doppler MAP', points: 10, target: { by: 9 },
      why: 'His implanting center\'s VAD coordinator is on call around the clock (the number is on the controller): with the alarm, the flow and the MAP they tell you what to do — and what not to touch — and where to take him.',
      done: (s) => {
        const ready = allOf(flagAt(s)('lvad-check'), flagAt(s)('doppler'));
        if (ready === null) return null;
        return s.performed.find((p) => p.id === 'call-vad' && p.minute >= ready)?.minute ?? null;
      },
      uses: ['call-vad', 'lvad-check', 'doppler-map'],
    },
    {
      id: 'history', label: 'History: the vomiting and diarrhea, and his medicines (SAMPLE)', points: 5, target: { by: 10 }, done: ['sample'],
      why: 'Two days of losses with nothing staying down, and his furosemide taken this morning: he is dry. No blood in the vomit and no black stools (GI bleeding is the commonest LVAD complication, and he takes warfarin and aspirin); sildenafil rules out nitroglycerin.',
    },
    {
      id: 'ecg', label: '12-lead ECG', points: 10, target: { by: 14 }, done: ['ecg12'],
      why: 'Ventricular arrhythmias are common with an LVAD, and the patient can be awake and talking in VT or even VF: only the tracing tells. His shows a fast sinus rate — his answer to the low volume — and no ST elevation. EMTs acquire and transmit it.',
    },
    { id: 'transmit', label: 'Transmit the 12-lead (you do not interpret it)', roles: [1], points: 5, target: { by: 16 }, done: ['ecg-transmit'], why: 'The physician reads it: no STEMI, a fast rate to treat with volume.' },
    { id: 'iv', label: 'IV access', roles: [2], points: 5, done: ['iv', 'io'], why: 'For the fluid his pump needs.' },
    {
      // the paramedic's treatment, weighted so that a case without it cannot pass as competent
      id: 'fluid', label: 'Fluid bolus for the low flow: 500 mL normal saline', roles: [2], points: 35, target: { by: 12 }, done: ['fluid'],
      why: 'A continuous-flow pump can only move the blood that comes back to it. Dry, with flat neck veins and clear lungs, he needs volume: 250–500 mL, then recheck. Not a vasopressor, which tightens the outflow a pump is sensitive to.',
    },
    {
      // a reassessment reads the controller (and the Doppler MAP, once there is one): it is a recheck too
      id: 'recheck', label: 'Recheck after the bolus: Doppler MAP or the controller', points: 10, done: ['doppler-map', 'lvad-check', 'reassess'], after: 'fluid',
      target: { within: { flag: 'fluid', minutes: 5 } }, applies: (s) => has(s, 'fluid'),
      why: 'Did it work? After his first 500 mL the alarm goes quiet, the flow comes back to 3.6 L/min and the MAP to 66 — and that tells the VAD team and you whether he needs more.',
    },
    {
      id: 'destination', label: 'Transport to his VAD center while he is stable (the nearest department once he is confused)', points: 15, target: { by: 20 },
      why: 'Awake and perfusing, he goes to his implanting center: the VAD team, his device records and an echo are there. Only a patient too unstable for the ride (in arrest, unresponsive or confused with a falling MAP) goes to the nearest emergency department, with the VAD team on the phone. His travel bag (spare batteries, backup controller) and his wife go with him.',
      // whichever fits him when he is loaded: his VAD center while he is awake, the nearest department once he is confused
      done: (s) => (has(s, 'pci-unstable') ? null : firstDone(s, ['transport-pci'])) ?? (has(s, 'near-justified') ? firstDone(s, ['transport-near']) : null),
      uses: ['transport-pci', 'transport-near'],
    },
    { id: 'handoff', label: 'Hand-off', points: 5, done: ['handoff'], why: 'Report the alarm and the controller\'s numbers, the Doppler MAP before and after the fluid, the losses and the diuretic, the 12-lead, the VAD team\'s advice, and his anticoagulants and sildenafil.' },
  ],
  harms: [
    {
      // the same id as the built-in rule, in this case's words and weight: the case's main trap
      id: 'cpr-lvad-perfusing', actions: ['cpr'], when: (s) => perfusing(s), points: 15, severity: 'critical',
      text: 'Chest compressions on a man who is awake and talking to you. A continuous-flow pump leaves no pulse to feel, and the cuff and the oximeter cannot read him: being awake is the sign that the pump is perfusing his brain (2025 AHA durable LVAD algorithm). Compressions hurt him and, on warfarin, bleed; they are for an LVAD patient who is unresponsive with inadequate perfusion — a Doppler MAP of 50 or less — and then without delay.',
    },
    {
      id: 'cpap-dry-pump', actions: ['cpap'], when: (s) => s.pulse, points: 5, severity: 'major',
      text: 'CPAP for an SpO₂ that cannot be trusted. Over a continuous-flow pump the oximeter has almost no pulse to read; his lips are pink, his lungs clear and he breathes easily. Positive pressure in the chest cuts the blood returning to the heart, and a dry pump needs every drop: judge oxygenation by the patient, not the number.',
    },
    {
      // fluid first; once the MAP is back over 65 nothing calls for one
      id: 'pressor-dry-pump', actions: ['pressor', 'push-epi'], roles: [2], when: (s) => s.pulse && (!has(s, 'fluid') || mapOf(s.vitals) >= 65), points: 5, severity: 'major',
      text: 'A vasopressor for a pump that is running dry. A continuous-flow LVAD is sensitive to afterload: squeezing the vessels raises the MAP a little and cuts the pump\'s flow further. A low-flow alarm from vomiting and diarrhea needs volume — a fluid bolus, then recheck — and a vasopressor only if the MAP stays low after it, with the VAD team.',
    },
    {
      id: 'nitro-no-indication', actions: ['nitro', 'nitro-high'], roles: [2], when: (s) => s.pulse, points: 8, severity: 'major',
      replaces: NITRATE_RULES,
      text: 'Nitroglycerin for a man with no chest pain and a pump short of blood. It pools blood in the veins and cuts what comes back to the pump, his MAP is already low, and he takes sildenafil, which no nitrate may follow within 24 hours.',
    },
    {
      id: 'beta-blocker-compensation', actions: ['metoprolol'], roles: [2], when: (s) => s.pulse, points: 8, severity: 'major',
      text: 'A beta-blocker for a fast sinus rate that is his answer to a low volume. Slowing it takes away what holds up his output and weakens the right ventricle the pump depends on: treat the cause, with fluid.',
    },
    {
      id: 'diltiazem-lvad', actions: ['diltiazem'], roles: [2], when: (s) => s.pulse, points: 15, severity: 'critical', replaces: ['diltiazem-heart-failure'],
      text: 'Diltiazem for a fast sinus rate in a man with a failing heart. His rate is his answer to a low volume, and a calcium-channel blocker drops the pressure and weakens the squeeze of the right ventricle the pump depends on (IV diltiazem with a reduced ejection fraction: 3 — Harm). Treat the cause, with fluid.',
    },
    {
      id: 'antiarrhythmic-sinus', actions: ['amio-infusion', 'procainamide', 'lidocaine'], roles: [2], when: (s) => s.pulse, points: 8, severity: 'major',
      replaces: ['procainamide-hypotension', 'procainamide-heart-failure'],
      text: 'An antiarrhythmic for a sinus rhythm. His 12-lead shows a fast sinus rate with no arrhythmia to treat; amiodarone and procainamide drop a pressure that is already low, and procainamide weakens a failing heart. Ventricular arrhythmias with an LVAD are treated when the monitor shows one.',
    },
    {
      id: 'adenosine-sinus', actions: ['adenosine6', 'adenosine12'], roles: [2], when: (s) => s.pulse, points: 3, severity: 'minor',
      text: 'Adenosine for a fast sinus rate. It only stops a rhythm whose circuit runs through the AV node; a sinus rate slows for a moment and comes straight back, and his is his answer to a low volume.',
    },
    {
      // either crew can try one
      id: 'vagal-sinus', actions: ['vagal'], when: (s) => s.pulse, points: 3, severity: 'minor',
      text: 'A vagal maneuver for a fast sinus rate. It only stops a rhythm whose circuit runs through the AV node; his rate is his answer to a low volume, and bearing down cuts the blood returning to a heart — and a pump — already short of it.',
    },
    {
      id: 'magnesium-no-indication', actions: ['magnesium-sulfate'], roles: [2], when: (s) => s.pulse, points: 3, severity: 'minor',
      text: 'Magnesium without torsades or a long QT. His monitor shows a sinus rhythm with nothing for it to treat, and it drops a pressure that is already low; his electrolytes are the hospital\'s to check and replace.',
    },
    {
      id: 'beta-agonist-antihistamine-no-indication', actions: ['albuterol', 'diphenhydramine'], roles: [2], when: (s) => s.pulse, points: 3, severity: 'minor',
      text: 'Albuterol or diphenhydramine with nothing to treat: no wheeze and no allergic reaction. Albuterol speeds a heart already racing for its volume; IV diphenhydramine drops the pressure and clouds the mental status that is your best sign of his perfusion.',
    },
    // The built-in rules for these say "with a pulse", and the learner has just found no pulse to feel: the case says the
    // same mistakes in words that fit a man awake on his pump (same ids, so they replace the built-in ones)
    {
      id: 'shock-with-pulse', actions: ['defib'], roles: [2], when: (s) => s.pulse, points: 15, severity: 'critical',
      text: 'An unsynchronized shock to a man who is awake on his pump. No pulse to feel is normal with a continuous-flow LVAD — he was talking to you — and the monitor shows a sinus rhythm, which no shock treats. Defibrillation with an LVAD is for VF or VT, with the pads front and back and the pump left running.',
    },
    {
      id: 'arrest-epi-with-pulse', actions: ['epinephrine'], roles: [2], when: (s) => s.pulse, points: 15, severity: 'critical',
      text: '1 mg IV epinephrine, the cardiac-arrest dose, for a man who is awake on his pump. No pulse to feel is normal with a continuous-flow LVAD, and he is not in arrest: the surge races his heart and squeezes against a pump that is sensitive to afterload. His low flow needs volume.',
    },
    {
      id: 'arrest-amio-with-pulse', actions: ['amio-arrest'], roles: [2], when: (s) => s.pulse, points: 10, severity: 'major',
      text: 'A 300 mg amiodarone push, the cardiac-arrest dose, for a man who is awake on his pump. No pulse to feel is normal with a continuous-flow LVAD, and the monitor shows a sinus rhythm: there is no arrhythmia to treat at any dose, and amiodarone drops a pressure that is already low.',
    },
    {
      id: 'sedative-no-indication', actions: ['fentanyl', 'midazolam', 'sedation'], roles: [2], when: (s) => s.pulse, points: 5, severity: 'major', replaces: ['midazolam-unsafe'],
      text: 'An opioid or a sedative with no pain or agitation to treat. Both lower the pressure and the breathing of a man whose pump is already short of blood, and they cloud the mental status that is your best sign of his perfusion.',
    },
    {
      id: 'aspirin-no-acs', actions: ['aspirin'], when: (s) => s.pulse, points: 3, severity: 'minor',
      text: 'Aspirin with no chest pain. Nothing here suggests a coronary cause; he already takes aspirin with warfarin — bleeding, often from the gut, is the commonest LVAD complication — and he is vomiting.',
    },
    {
      id: 'glucagon-no-indication', actions: ['glucagon'], roles: [2], points: 3, severity: 'minor',
      text: 'Glucagon without a beta- or calcium-channel-blocker overdose. It treats nothing he has, and the vomiting it brings is the last thing a dry patient needs.',
    },
    {
      id: 'epi-im-no-anaphylaxis', actions: ['epi-im'], when: (s) => s.pulse, points: 3, severity: 'minor',
      text: 'IM epinephrine without anaphylaxis. His low MAP comes from a pump running dry, not from an allergic reaction: it needs fluid.',
    },
    {
      id: 'no-equipment', actions: ['transport-pci', 'transport-near'], when: (s) => !has(s, 'equipment'), points: 8, severity: 'major',
      text: 'Transport without his LVAD equipment. His pump stops when its power runs out: the spare batteries, the backup controller and the power cable go with him on every trip, and his trained caregiver too if she can come. Check the pump (or call the VAD team) before you leave — the bag is part of the pump.',
    },
    {
      id: 'nearest-ed', actions: ['transport-near'], when: (s) => stableEnough(s), points: 8, severity: 'major',
      text: 'The nearest emergency department for an LVAD patient who is awake and perfusing. Only his implanting center has his VAD team, his device records and the people who can adjust the pump; a department without them only adds a transfer. The nearest department is for a patient too unstable for the ride — in arrest, or confused or unresponsive with a falling MAP — with the VAD team on the phone.',
    },
    {
      // the mirror image: once he is confused, the long ride is the wrong one (and his VAD team says so if called)
      id: 'long-ride-unstable', actions: ['transport-pci'], when: (s) => s.pulse && !stableEnough(s), points: 8, severity: 'major',
      text: 'The 22-minute ride to his VAD center for a man who is now confused, with his Doppler MAP down around 50. He is too unstable for the long ride: the nearest emergency department, 8 minutes away, with the VAD team on the phone — they call ahead, talk the department through the pump and take him once he is stable — and IV fluid on the way.',
    },
  ],
  timings: [
    { label: 'Pump checked', actions: ['lvad-check'], target: 5 },
    { label: 'Doppler MAP', actions: ['doppler-map'], target: 6 },
    { label: 'VAD team called', actions: ['call-vad'], target: 9 },
    // the EMT's intercept gives it: the flag counts theirs
    { label: 'Fluid bolus', actions: ['fluid'], flag: 'fluid', target: 12 },
    { label: 'First 12-lead', actions: ['ecg12'], target: 14 },
    { label: 'Left the scene', actions: ['transport-pci', 'transport-near'], target: 20 },
  ],
  transportMinutes: TRANSPORT,
  nearestMinutes: NEAREST,
  arrival: 'You arrive at the emergency entrance.',
  teaching: [
    'A continuous-flow LVAD (in the US today, the HeartMate 3) moves blood with little or no pulse: usually no radial or carotid pulse to feel, no sounds with the cuff, an NIBP that fails, and an oximeter that may not read or reads wrong. Judge perfusion by the patient — awake and talking, skin color and temperature, capillary refill — and measure a Doppler MAP: a manual cuff with a Doppler probe over the brachial artery, the pressure at which the flow sound returns. About 70–90 mmHg is usual; under 60 is low.',
    'Awake and talking means the pump is perfusing: no compressions and no AED (2025 AHA durable LVAD algorithm; 2017 AHA statement on CPR with mechanical circulatory support). For an LVAD patient who is unresponsive, perfusion decides: skin color and temperature, capillary refill, a Doppler MAP over 50 (or an arterial line), and an EtCO₂ over 20 — read only through an endotracheal tube or tracheostomy, since a supraglottic airway reads falsely high. Inadequate perfusion (a Doppler MAP of 50 or less, an EtCO₂ of 20 or less through the tube) means compressions without delay, while a second rescuer checks the pump.',
    'Check the pump: listen for the hum over the left chest; read the controller (the alarm, flow, speed, power and pulsatility index); make sure both power sources are connected and charged and the driveline is intact. Never disconnect the driveline, and change a controller only when the VAD team (or the trained patient or caregiver) tells you to.',
    'A low-flow alarm (on the HeartMate 3 a red heart and a steady tone, under 2.5 L/min) means too little blood is getting through the pump: too little volume (vomiting, diarrhea, a diuretic), bleeding (GI bleeding is the commonest LVAD complication: ask about black stools), a failing right ventricle, an arrhythmia, tamponade — or a pressure too high for a pump that is sensitive to afterload. Dry, with flat neck veins and clear lungs: a fluid bolus (250–500 mL), then recheck the Doppler MAP and the controller.',
    'Call the VAD team early — the number is on the controller and the patient\'s card, around the clock — with the alarm, the controller\'s numbers and the Doppler MAP. They know the pump, they tell you what to do and what not to touch, and they say where to take the patient.',
    'Record a 12-lead: ventricular arrhythmias are common with an LVAD, and a patient can be awake and talking in VT or even VF; the pump can add fine electrical noise to the tracing. If pads are needed they go front and back (anterior–posterior), clear of the pump and the ICD; defibrillation and cardioversion are safe with the pump running.',
    'What cuts the preload a dry pump depends on makes it worse: nitroglycerin (and never within 24 hours of the sildenafil many LVAD patients take), CPAP, sedatives and opioids, and drugs that slow a compensating heart. A vasopressor squeezes against a pump that is sensitive to afterload: volume first.',
    'Destination: the implanting VAD center for a patient stable enough for the ride; the nearest emergency department for one in arrest or too unstable, with the VAD team on the phone. Bring everything: the controller he wears, the spare batteries, the backup controller, the power cable and the emergency card — and his trained caregiver.',
  ],
};
