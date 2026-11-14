import type { Effect, Line, Scenario, SimState } from '../types';
import { atRate, bpAfter, has, line } from '../kit';

/**
 * Cocaine-associated chest pain in the field. A 34-year-old man snorted cocaine at a party an hour ago: squeezing chest pain,
 * agitation, sweating, a heart rate of 132, a pressure of 178/104 and a temperature of 38.4 °C. The 12-lead shows a fast sinus
 * rate and no STEMI. Cocaine hurts the heart three ways (it drives the rate and pressure up, squeezes the coronaries and makes
 * the blood clot), and the drug's own toxicity — agitation, heat — is what a benzodiazepine treats.
 *
 * Right care (AHA scientific statement on cocaine-associated chest pain, 2008; 2014 ACC/AHA NSTE-ACS guideline; 2023 AHA
 * poisoning update; 2025 ACC/AHA ACS guideline for aspirin, oxygen and the 12-lead): a calm approach, a benzodiazepine first
 * (paramedic) for the agitation, the rate and the pressure, aspirin, nitroglycerin for the pain, oxygen only below 90 %, the
 * temperature found and the patient cooled, a 12-lead within 10 minutes and a repeat, and transport. The EMT gives the aspirin,
 * acquires and transmits the 12-lead, finds the fever and cools him, and calls the paramedic intercept early.
 *
 * The traps: a beta-blocker (unopposed alpha: a higher pressure and worse coronary spasm), no 12-lead, missing the fever, and
 * more sedative than calm needs. Left without a benzodiazepine he gets worse at minute 10 and out of control at minute 16, his
 * temperature climbing each time (less if the crew is cooling him). The skin check finds him hot; the thermometer ('temp')
 * gives the number and active cooling ('cool') is its own step. Talking him down comes first ('calm'); restraint is the
 * last resort — never face down (the built-in prone-restraint rule), and never without the sedation that ends the fight.
 */

/** Minutes from the EMT's call until the paramedic intercept is at his side */
const ALS_MINUTES = 6;

/** Without a benzodiazepine the agitation feeds itself: worse at minute 10, out of control at minute 16 */
const WORSE_AT = 10;
const SEVERE_AT = 16;

/** Minutes after he is calm (and being cooled) before the heat comes off */
const COOLS_AFTER = 6;

/** A pressure that is already high can still be driven higher (bpAfter's default ceiling would hide the rise) */
const HIGH = { sbp: 220, dbp: 130 };

/** US crews read Fahrenheit; the case keeps Celsius and shows both */
const tempText = (c: number) => `${c.toFixed(1)} °C (${(c * 1.8 + 32).toFixed(1)} °F)`;

/** The temperature after it rises or falls, to one decimal */
const warmer = (s: SimState, by: number) => Math.round((s.vitals.temp + by) * 10) / 10;

/** The crew is cooling him (their own cooling, or the paramedic intercept's) */
const cooling = (s: SimState) => has(s, 'cooling');

/** The crew has taken his temperature (or the intercept has, with its thermometer) */
const tempKnown = (s: SimState) => has(s, 'temp');

/** Minutes a restrained patient may fight the straps before the missing sedation is charged */
const UNSEDATED_RESTRAINT = 5;

/** A benzodiazepine (the learner's or the intercept's) has settled the agitation */
const calm = (s: SimState) => has(s, 'calm');

/** In the ambulance: he is on the stretcher, and the partner is driving */
const enroute = (s: SimState) => has(s, 'enroute');

/** Minutes since the last sublingual nitroglycerin, or null (judged before this dose is recorded; minutes are sums of tenths) */
function sinceLastNitro(s: SimState): number | null {
  const last = s.performed.filter((p) => p.id === 'nitro' || p.id === 'nitro-high').at(-1);
  return last ? Math.round((s.minute - last.minute) * 10) / 10 : null;
}

/** Only a patient awake enough to talk says how he feels */
const awake = (s: SimState, text: string, tone?: Line[2]): Line[] => (s.pulse && s.vitals.gcs >= 13 ? [line('patient', text, tone)] : []);

/** The rate and pressure after a drug: on the monitor once it is on, otherwise counted and taken by hand */
function numbers(s: SimState, hr: number, bp: { sbp: number; dbp: number }, tone?: Line[2]): Line {
  return has(s, 'monitor')
    ? line('monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`, tone)
    : line('you', `Pulse ${hr} · BP ${bp.sbp}/${bp.dbp}.`, tone);
}

/** What an event shows on the monitor — only once it is on */
const onMonitor = (s: SimState, hr: number, bp: { sbp: number; dbp: number }): Line[] =>
  (has(s, 'monitor') ? [line('monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`, 'bad')] : []);

/** A set of vital signs; the temperature once the crew has taken it */
function vitalsText(s: SimState): string {
  const v = s.vitals;
  return `BP ${v.sbp}/${v.dbp} · pulse ${s.rhythm.hr} · RR ${v.rr} · SpO₂ ${v.spo2}%${tempKnown(s) ? ` · temp ${tempText(v.temp)}` : ''}`;
}

function status(s: SimState): string {
  if (!s.pulse) return 'Unresponsive.';
  if (has(s, 'oversedated')) return s.vitals.gcs <= 11 ? 'Snoring; he opens his eyes only when you shake him.' : 'Drowsy: he opens his eyes when you speak to him, then drifts off again.';
  if (calm(s)) return s.vitals.pain <= 2 ? '"I feel a lot calmer. My chest is just a little sore now."' : `"I feel calmer. My chest is ${s.vitals.pain} out of 10."`;
  if (has(s, 'severe')) return '"Get off me! Who are you?" He does not know where he is.';
  // just back from the VF a shock caused — until the cocaine winds him up again (the events clear it)
  if (has(s, 'groggy')) return 'Groggy: "What happened? My chest is sore."';
  return `"I can't sit still — my heart is pounding out of my chest. ${s.vitals.pain} out of 10."`;
}

/**
 * A benzodiazepine: the first treatment of cocaine toxicity. It calms the agitation and brings down the rate, the pressure and
 * the heat the muscles make, and it eases the chest pain. Titrated to calm, not to sleep: a dose for a patient who is already
 * calm only makes him drowsy (the beers he drank add to it), and every dose after that slows his breathing further — so no
 * extra dose is ever free of effect. Once he is out of control the first dose takes the edge off and a second one settles him.
 */
function benzo(s: SimState, given: string): Effect | null {
  if (!s.pulse) return null;
  const v = s.vitals;
  if (has(s, 'oversedated')) {
    const gcs = Math.max(8, Math.min(v.gcs - 2, 11));
    const rr = Math.max(6, Math.min(v.rr - 4, 8));
    const spo2 = Math.max(84, Math.min(v.spo2 - 6, 89));
    const bp = bpAfter(s, -6, -4);
    return {
      say: [
        ['you', given],
        ['partner', `Now he is snoring and hard to rouse, breathing ${rr} times a minute.`, 'bad'],
        ...(has(s, 'monitor') ? [line('monitor', `SpO₂ ${spo2}%. BP ${bp.sbp}/${bp.dbp}.`, 'bad')] : []),
      ],
      vitals: { ...bp, gcs, rr, spo2 }, flags: ['benzodiazepine', 'sedation'],
    };
  }
  if (calm(s)) {
    const bp = bpAfter(s, -8, -5);
    const spo2 = Math.min(v.spo2, 95);
    return {
      say: [
        ['you', given],
        ['partner', 'He was already calm — now he is drowsy, his eyes closing, breathing 12 times a minute.', 'warn'],
        ...(has(s, 'monitor') ? [line('monitor', `SpO₂ ${spo2}%. BP ${bp.sbp}/${bp.dbp}.`, 'warn')] : []),
      ],
      vitals: { ...bp, gcs: Math.min(v.gcs, 13), rr: Math.min(v.rr, 12), spo2 }, flags: ['benzodiazepine', 'sedation', 'oversedated'],
    };
  }
  if (has(s, 'severe') && !has(s, 'benzodiazepine')) {
    const hr = Math.max(104, s.rhythm.hr - 12);
    const bp = bpAfter(s, -12, -6);
    return {
      say: [['you', given], ['partner', 'He has slowed down a little, but he is still fighting the cuff and shouting.', 'warn'], numbers(s, hr, bp)],
      vitals: { ...bp, pain: Math.max(0, v.pain - 1) }, rhythm: atRate(s, hr), flags: ['benzodiazepine', 'sedation'],
    };
  }
  const hr = Math.max(104, s.rhythm.hr - 24);
  const bp = bpAfter(s, -22, -12);
  const settles: Line = has(s, 'severe')
    ? ['partner', 'He stops fighting, lies back on the stretcher and lets you hold his hand. "…Where am I?"', 'good']
    : ['patient', '"…Okay. I feel calmer. My heart isn\'t racing like it was."', 'good'];
  return {
    say: [['you', given], settles, numbers(s, hr, bp)],
    // out of control before it, he is calm but drowsy after the second dose; otherwise awake and calm
    vitals: { ...bp, rr: Math.min(v.rr, 18), pain: Math.max(0, v.pain - 2), gcs: has(s, 'severe') ? 14 : v.gcs },
    rhythm: atRate(s, hr), flags: ['benzodiazepine', 'sedation', 'calm'],
  };
}

/** Nitroglycerin: it opens the squeezed coronaries and lowers the pressure; with a benzodiazepine on board it works better */
function nitroEffect(s: SimState, high: boolean): Effect | null {
  if (!s.pulse) return null;
  const bp = high ? bpAfter(s, -20, -10) : bpAfter(s, -12, -6);
  const pain = Math.max(0, s.vitals.pain - (has(s, 'benzodiazepine') ? 3 : 2));
  const feels = s.vitals.pain > 0 ? awake(s, pain <= 3 ? '"The squeezing is easing off."' : '"Maybe a little better."') : [];
  return {
    say: [['you', `Nitroglycerin ${high ? '0.8' : '0.4'} mg sublingual.`], ...feels, numbers(s, s.rhythm.hr, bp)],
    vitals: { ...bp, pain }, flags: high ? ['nitro', 'nitro-high'] : ['nitro'],
  };
}

/** Adrenergic drugs: cocaine already floods the receptors, so the rate, the pressure and the chest pain all climb */
function adrenergic(s: SimState, what: string, dHr: number, dSbp: number, dDbp: number, flag: string): Effect | null {
  if (!s.pulse) return null;
  const hr = Math.min(170, s.rhythm.hr + dHr);
  const bp = bpAfter(s, dSbp, dDbp, HIGH);
  return {
    say: [['you', what], numbers(s, hr, bp, 'bad'), ...awake(s, '"My chest — it\'s squeezing harder!"', 'bad')],
    vitals: { ...bp, pain: Math.min(10, s.vitals.pain + 2) }, rhythm: atRate(s, hr), flags: [flag],
  };
}

/** A shock for the VF an unsynchronized shock caused: witnessed, pads on, it converts at once */
function arrestShock(s: SimState, how: string): Effect | null {
  if (s.pulse || s.rhythm.profile !== 'vf') return null;
  return {
    say: [['monitor', how], ['you', 'He coughs and moves; there is a pulse — ROSC.', 'good']],
    rhythm: { profile: 'sinus-tachycardia', hr: 124 }, pulse: true, phase: 'rosc',
    vitals: { sbp: 132, dbp: 80, spo2: 95, rr: 20, gcs: 13, pain: 4 },
    flags: ['pads', 'monitor', 'shocked', 'groggy'],
  };
}

/**
 * What the crew finds at the door, for both roles. The calm approach starts here: the police have made the scene safe, and
 * the crew keeps a way out, turns the noise down and talks to him calmly — one voice, nobody crowding him.
 */
const SCENE: Line = ['scene', 'A friend\'s apartment after a party. He is pacing the living room, sweating through his hoodie, rubbing his chest and talking fast. His friend: "He did a few lines of coke about an hour ago. Then he started saying his chest was tight and his heart was going to explode." A police officer stands by the door: "He hasn\'t hurt anyone — he\'s just wound up and scared." No weapons in sight. Gloves on; you keep a clear path to the door, turn the music off and talk to him calmly, one voice at a time.'];

export const cocaineField: Scenario = {
  id: 'cocaine-chest-pain-field',
  title: 'Chest pain after the party',
  summary: '34-year-old man with chest pain an hour after using cocaine: agitated, sweating, his heart pounding. Treat the chest pain and the drug — and know which usual drug to leave in the box.',
  setting: 'field',
  roles: [1, 2],
  difficulty: 'intermediate',
  conditionId: 'sinus-tachycardia',
  briefing: {
    default: [
      ['dispatch', 'Priority 1: 34-year-old man, chest pain, "acting wild". Police are on scene and say it is safe to enter. You are the ALS crew.'],
      SCENE,
      ['partner', 'Your partner, an EMT, has the stretcher and the oxygen; you have the monitor and the drug box.'],
      ['hospital', 'Regional heart center (cath lab, ICU): 14 minutes. Nearest emergency department: 8 minutes.'],
    ],
    1: [
      ['dispatch', 'Priority 1: 34-year-old man, chest pain, "acting wild". Police are on scene and say it is safe to enter. You are the BLS crew; a paramedic unit can meet you as an intercept if you ask for one.'],
      SCENE,
      ['partner', 'Your partner, an EMT, has the stretcher and the oxygen; the 12-lead monitor and the AED are in your bag.'],
      ['hospital', 'Regional heart center (cath lab, ICU): 14 minutes. Nearest emergency department: 8 minutes.'],
    ],
  },
  initial: {
    rhythm: { profile: 'sinus-tachycardia', hr: 132 },
    vitals: { sbp: 178, dbp: 104, spo2: 97, rr: 24, etco2: 32, pain: 7, gcs: 15, glucose: 112, temp: 38.4 },
  },
  // the built-in beta-blocker rule reads it (the case's own rule of the same id replaces it, in its words)
  problems: ['sympathomimetic-toxicity', 'acs', 'severe-agitation'],
  facts: {
    // asked later, after the drugs, he says how it is now (and in the VF a shock can cause, his friend answers)
    opqrst: (s) => (s.pulse
      ? `It started about 45 minutes ago, after the second line — a tight, squeezing pressure in the middle of my chest, going into my left arm. ${s.vitals.pain} out of 10 now. ${calm(s) ? 'My heart was pounding out of my chest; it is slower now.' : 'My heart is pounding out of my chest. Nothing makes it better.'}`
      : 'He cannot answer. His friend: "His chest got tight about 45 minutes ago, after the second line."'),
    sample: (s) => (s.pulse
      ? 'No allergies. No medicines. Cocaine tonight — snorted, a few lines, the last one about an hour ago — and a few beers. I use it at parties, maybe once a month. Never had chest pain before, no heart problems that I know of. My dad had a heart attack at 50. I smoke. Pizza around nine.'
      : 'He cannot answer. His friend: "A few lines of coke and some beers tonight. No medicines, no allergies that I know of."'),
    pde5: (s) => (s.pulse ? '"No — nothing like that."' : 'He cannot answer.'),
    lungs: (s) => (s.pulse ? 'Clear and equal on both sides; he is breathing fast.' : 'No breaths of his own.'),
    // with no pulse the engine refuses the neuro check (nothing for it to find)
    neuro: (s) => {
      if (has(s, 'oversedated')) return `Drowsy: he opens his eyes only ${s.vitals.gcs <= 11 ? 'to a shake' : 'when you speak to him'}; pupils mid-sized; moves all four limbs.`;
      if (has(s, 'severe') && !calm(s)) return 'Confused — he does not know where he is; pupils wide and reactive; moves all four limbs; no facial droop.';
      return 'Oriented, but restless and talking fast; pupils wide and reactive; no facial droop or weakness; speech clear.';
    },
    ecg12: (s) => (s.rhythm.profile === 'normal-sinus'
      ? `Sinus rhythm ${s.rhythm.hr}: a normal P wave before every QRS, normal PR, QRS and QT, and no ST elevation or depression — no STEMI. The rate has come down; a 12-lead without ST elevation still does not rule out a heart attack after cocaine, so the hospital repeats it with troponins.`
      : `Sinus tachycardia ${s.rhythm.hr}: a normal P wave before every QRS, normal PR, QRS and QT, and no ST elevation or depression — no STEMI. The fast rate is the cocaine and the agitation. After cocaine a first 12-lead like this does not rule out a heart attack: repeat it while the pain goes on.`),
    // the poison center's advice for a stimulant (the default would say nothing points to a poisoning)
    poisonControl: 'Poison center: "Cocaine with chest pain, a fast heart, a high pressure and a fever: a benzodiazepine first for the agitation, the rate and the pressure; cool him; aspirin and nitroglycerin for the chest pain; no beta-blocker. He needs an emergency department, with serial ECGs and troponins."',
  },
  status,
  respond: {
    // a manual set: the hand on his wrist feels the heat before anyone takes a temperature
    vitals: (s) => (s.pulse
      ? { say: [['you', `${vitalsText(s)}${tempKnown(s) ? '' : '. His wrist is hot and slick with sweat under your fingers.'}`]], flags: ['bp'] }
      : null),
    reassess: (s) => (s.pulse ? { say: [['you', vitalsText(s)], ['patient', status(s)]] } : null),
    // the skin check finds him hot: the thermometer gives the number
    perfusion: (s) => {
      // the default would report equal pulses: in the VF a shock can cause there are none, and the shock comes first
      if (!s.pulse) return { blocked: true, say: [['system', 'He has no pulse: CPR and a shock come first.']] };
      return { say: [['you', 'Hot to the touch, flushed and drenched in sweat; pupils wide; strong, fast radial pulses; no JVD.']], flags: ['perfusion'] };
    },
    temp: (s) => ({ say: [['you', `Temperature ${tempText(s.vitals.temp)}.`]], flags: ['temp'] }),
    // the crew cools him (more of it the hotter he is); the heat comes off over the next minutes once he is calm
    cool: (s) => {
      if (!s.pulse) return null;
      const how = s.vitals.temp >= 39
        ? 'Clothes off, cold packs to his neck, armpits and groin, and a fan on his wet skin.'
        : 'His sweat-soaked hoodie comes off, the air conditioning goes up, and cold packs are ready if it climbs.';
      return { say: [['you', how]], flags: ['cooling'] };
    },
    // the first step with a stimulant's agitation: it helps, but only the benzodiazepine settles what the drug drives
    calm: (s) => (s.pulse
      ? { say: [['you', 'One calm voice, the friends out of the room, each step explained before it is done.'], ...awake(s, '"Okay… okay. But my heart won\'t slow down."')], flags: ['de-escalated'] }
      : null),
    midazolam: (s) => benzo(s, has(s, 'iv') ? 'Midazolam 2.5 mg IV.' : 'Midazolam 5 mg IM in the thigh (no IV yet); it takes hold over the next few minutes.'),
    // the paramedic's sedation protocol for a stimulant's agitation is a benzodiazepine
    sedation: (s) => benzo(s, 'Sedation per protocol: midazolam 2.5 mg IV.'),
    nitro: (s) => nitroEffect(s, false),
    'nitro-high': (s) => nitroEffect(s, true),
    // the trap: with the beta receptors blocked, cocaine's alpha effect goes unopposed — the pressure climbs and the
    // coronaries squeeze harder, while the rate falls only a little
    metoprolol: (s) => {
      if (!s.pulse) return null;
      const hr = Math.max(60, s.rhythm.hr - 8);
      const bp = bpAfter(s, 14, 8, HIGH);
      return {
        say: [['you', 'Metoprolol 5 mg IV.'], numbers(s, hr, bp, 'bad'), ...awake(s, '"It\'s squeezing harder — like a band around my chest!"', 'bad')],
        vitals: { ...bp, pain: Math.min(10, s.vitals.pain + 2) }, rhythm: atRate(s, hr), flags: ['beta-blocker'],
      };
    },
    diltiazem: (s) => {
      if (!s.pulse) return null;
      const hr = Math.max(60, s.rhythm.hr - 8);
      const bp = bpAfter(s, -12, -8);
      return { say: [['you', 'Diltiazem IV over 2 minutes.'], numbers(s, hr, bp)], vitals: bp, rhythm: atRate(s, hr), flags: ['diltiazem'] };
    },
    'push-epi': (s) => adrenergic(s, 'Push-dose epinephrine 20 mcg IV.', 10, 16, 10, 'push-epi'),
    pressor: (s) => adrenergic(s, 'Norepinephrine infusion running.', 12, 22, 14, 'pressor'),
    // too much midazolam and he breathes 8 times a minute or less: drowsy, he lets a bag-mask assist his own breaths (the
    // default pushes the mask away from anyone with a GCS over 8, which would block the rescue this mistake calls for)
    bvm: (s) => {
      if (!s.pulse || !has(s, 'oversedated') || s.vitals.rr > 8) return null;
      const spo2 = Math.max(s.vitals.spo2, 96);
      return {
        say: [
          ['you', 'Jaw thrust and a nasal airway; bag-mask with oxygen assisting his own breaths, 1 every 6 seconds. He tolerates it.'],
          ...(has(s, 'monitor') ? [line('monitor', `SpO₂ ${spo2}%.`, 'good')] : []),
        ],
        vitals: { spo2, rr: 10 }, flags: ['ventilated'],
      };
    },
    // he has sweated through his clothes: the bolus replaces some of it and changes nothing else
    fluid: (s) => (s.pulse ? { say: [['you', 'Normal saline 500 mL running: he has sweated through his clothes.']], flags: ['fluid'] } : null),
    // an unsynchronized shock on a beating heart lands on a T wave
    defib: (s) => {
      if (s.pulse) {
        return {
          say: [['monitor', 'Unsynchronized shock delivered — he goes limp, and the monitor alarms!', 'bad']],
          rhythm: { profile: 'vf', hr: 0 }, pulse: false, phase: 'arrest', vitals: { sbp: 0, dbp: 0, gcs: 3, rr: 0 }, flags: ['pads', 'monitor', 'iatrogenic-vf'],
        };
      }
      return arrestShock(s, 'Shock delivered: 200 J.');
    },
    // with a pulse the AED is not applied (the default refuses it); in the VF a shock caused, it shocks
    aed: (s) => arrestShock(s, 'AED: "Shock advised." Shock delivered.'),
    // the physician reads what was sent: a fast rate, no STEMI (the EMT does not interpret it)
    'ecg-transmit': (s) => (has(s, 'ecg12')
      ? { say: [['hospital', 'ECG received. The physician: "A fast rate, and no ST elevation that meets STEMI criteria — the cath lab is not activated. After cocaine a first 12-lead like this does not rule out a heart attack: repeat it on the way, and call us if the pain changes."']], flags: ['transmitted'] }
      : null),
    'med-control': (s) => {
      if (!s.pulse) return null;
      if (s.role === 1) {
        return {
          say: [['hospital', 'Medical control: "Aspirin 324 mg chewed if he is not allergic, and a 12-lead transmitted. Keep him calm — a quiet space, one voice, nobody holding him down, and never face down. Take his temperature and cool him if he is hot. Get the paramedic intercept to meet you, and do not wait on scene for it."']],
          flags: ['med-control'],
        };
      }
      return {
        say: [['hospital', calm(s)
          ? 'Medical control: "Good — he is calm. Aspirin, and nitroglycerin for the pain once you have his pressure. No beta-blocker while he is intoxicated. Keep cooling him, repeat the 12-lead, and bring him in."'
          : 'Medical control: "Midazolam for the agitation — 2.5 mg IV or 5 mg IM, repeated until he is calm, not asleep. Aspirin, and nitroglycerin for the pain once you have his pressure. No beta-blocker while he is intoxicated. Take his temperature and cool him, repeat the 12-lead, and bring him in."']],
        flags: ['med-control'],
      };
    },
    // the hospital repeats only what it has been told: the EMT's 12-lead is "no STEMI" once the physician has seen it
    notify: (s) => {
      const state = calm(s) ? 'calm now after midazolam' : 'still agitated';
      const ecg = s.role === 1
        ? (has(s, 'transmitted') ? ', and we have his 12-lead: no STEMI' : '. Send us his 12-lead')
        : (has(s, 'ecg12') ? ', no STEMI on your 12-lead' : '. Get a 12-lead on him');
      return {
        say: [['hospital', tempKnown(s)
          ? `Copy: chest pain an hour after cocaine, ${state}, temperature ${tempText(s.vitals.temp)}${ecg}. A monitored bed will be ready.`
          : `Copy: chest pain an hour after cocaine, ${state}${ecg}. Do you have a temperature on him? A monitored bed will be ready.`]],
        flags: ['notified'],
      };
    },
    handoff: (s) => {
      if (!has(s, 'arrived') || !s.pulse) return null;
      const lines: Line[] = [
        ['you', 'SBAR hand-off: the cocaine and when, the chest pain, both 12-leads, his temperature, what was given and when — and what was held.'],
        ['hospital', 'The emergency physician: "Troponins now and again in a few hours, serial 12-leads, a CK for his muscles and a core temperature. More benzodiazepine if the agitation comes back."'],
      ];
      // what the crew left undone arrives with him
      if (!calm(s)) lines.push(['hospital', `"He is still agitated${has(s, 'severe') ? ' and confused' : ''}, at ${tempText(s.vitals.temp)}: midazolam now, and we cool him fast."`, 'warn']);
      if (has(s, 'oversedated')) lines.push(['hospital', '"He is very drowsy: we will watch his breathing and his airway."', 'warn']);
      if (has(s, 'beta-blocker')) lines.push(['hospital', '"He had metoprolol? We will watch his pressure and his chest pain closely."', 'warn']);
      return { say: lines, flags: ['handoff'] };
    },
  },
  events: [
    {
      // the EMT's intercept: the paramedic gives the benzodiazepine and the nitroglycerin; the aspirin, the 12-lead and the
      // temperature stay the EMT's to do
      id: 'als-arrives',
      when: (s) => s.role === 1 && s.pulse && has(s, 'als') && !has(s, 'arrived') && s.minute >= s.flags.als + ALS_MINUTES,
      effect: (s) => {
        const where = has(s, 'enroute') ? 'The medic unit meets you on the way; the paramedic climbs in' : 'The paramedic arrives';
        const severe = has(s, 'severe');
        const hr = Math.max(104, s.rhythm.hr - 24);
        const bp = bpAfter(s, -34, -18);
        const lines: Line[] = [
          ['team', `${where}: an IV, midazolam ${severe ? '5 mg IM, then 2.5 mg IV,' : '2.5 mg IV'} for the agitation, then nitroglycerin 0.4 mg under his tongue for the chest pain. "Heart rate ${hr}, pressure ${bp.sbp}/${bp.dbp}."`],
          severe ? ['partner', 'He stops fighting and lies back on the stretcher. "…Where am I?"', 'good'] : ['patient', '"…Okay. I feel calmer. The squeezing is easing off."', 'good'],
        ];
        if (!has(s, 'aspirin')) lines.push(['team', '"Has he had aspirin? That one is yours — 324 mg, chewed."', 'warn']);
        // the paramedic's thermometer: the number the crew's reassessments show from now on
        if (!cooling(s)) lines.push(['team', `"Feel his skin — he is burning up: ${tempText(s.vitals.temp)}. Get that hoodie off and the cold packs out."`, 'warn']);
        return {
          say: lines,
          vitals: { ...bp, pain: Math.max(0, s.vitals.pain - 5), rr: Math.min(s.vitals.rr, 18), gcs: severe ? 14 : s.vitals.gcs },
          rhythm: atRate(s, hr), flags: ['iv', 'benzodiazepine', 'sedation', 'calm', 'nitro', 'cooling', 'temp', 'als-here'],
        };
      },
    },
    {
      // no benzodiazepine yet: the agitation feeds itself — faster, higher, hotter
      id: 'worse',
      when: (s) => s.pulse && !has(s, 'benzodiazepine') && s.minute >= WORSE_AT,
      effect: (s) => {
        const hr = Math.min(170, s.rhythm.hr + 12);
        const bp = bpAfter(s, 10, 6, HIGH);
        // in the apartment he paces; in the ambulance the straps hold him to the stretcher (and the partner is driving)
        const restless: Line = enroute(s)
          ? ['you', 'He cannot keep still — straining at the stretcher straps and pulling at the cuff, drenched in sweat: "My heart is going to explode!"', 'bad']
          : ['partner', 'He cannot keep still — back on his feet, pacing and pulling at the cuff, drenched in sweat: "My heart is going to explode!"', 'bad'];
        return {
          say: [restless, ...onMonitor(s, hr, bp)],
          vitals: { ...bp, temp: warmer(s, cooling(s) ? 0.2 : 0.5), rr: Math.max(s.vitals.rr, 26), pain: Math.min(10, s.vitals.pain + 1) },
          rhythm: atRate(s, hr), flags: ['worse'], clear: ['groggy'],
        };
      },
    },
    {
      // still none: he is out of control and confused, and the heat climbs fastest in a patient nobody is cooling. Holding him
      // face down is the reflex that kills: the partner stops it (the simulator has no restraint action yet)
      id: 'severe',
      when: (s) => s.pulse && !has(s, 'benzodiazepine') && s.minute >= SEVERE_AT,
      effect: (s) => {
        const hr = Math.min(170, s.rhythm.hr + 8);
        const bp = bpAfter(s, 8, 4, HIGH);
        // the EMT who never called for a paramedic has no drug to calm him: the partner says who has
        const needs = s.role === 1 && !has(s, 'als') ? 'He needs a paramedic and something to calm him — get a medic unit to meet us.' : 'He needs something to calm him.';
        const fight: Line[] = enroute(s)
          ? [
            ['you', 'He is shouting and thrashing against the stretcher straps, swinging at you — he has torn off the cuff, and he does not know where he is.', 'bad'],
            ['partner', `From the driver's seat: "Keep him on his back — never face down, and nothing pressing on his chest or neck: he can't breathe like that, and fighting only makes him hotter. ${needs}"`, 'warn'],
          ]
          : [
            ['partner', 'He is shouting and swinging at the officer — he has torn off the cuff, and he does not know where he is.', 'bad'],
            ['partner', `The officer moves to pin him face down on the floor. "Not face down — he can't breathe like that, and fighting it only makes him hotter. ${needs}"`, 'warn'],
          ];
        return {
          // the cuff is off: the monitor counts the rate, and the next pressure is taken by hand
          say: [...fight, ...(has(s, 'monitor') ? [line('monitor', `Heart rate ${hr}.`, 'bad')] : [])],
          vitals: { ...bp, temp: warmer(s, cooling(s) ? 0.3 : 0.7), rr: Math.max(s.vitals.rr, 28), gcs: Math.min(s.vitals.gcs, 14), pain: Math.min(10, s.vitals.pain + 1) },
          rhythm: atRate(s, hr), flags: ['severe'], clear: ['groggy'],
        };
      },
    },
    {
      // restrained and still unsedated: he fights the straps, and the heat and the acid climb (charged once)
      id: 'restrained-unsedated',
      when: (s) => s.pulse && !has(s, 'benzodiazepine') && ['restrained', 'restrained-prone'].some((f) => has(s, f) && s.minute >= s.flags[f] + UNSEDATED_RESTRAINT),
      effect: (s) => ({
        say: [['partner', 'He is still fighting the straps — hotter, soaked and breathing hard.', 'bad']],
        vitals: { temp: warmer(s, 0.3) },
        penalty: {
          id: 'restraint-without-sedation', points: 5, severity: 'major',
          text: 'Restraint with no sedation to follow. A patient who keeps fighting the restraints makes more heat and more acid in his blood — the road to a sudden arrest: restraint is only a bridge to a benzodiazepine given promptly (by the paramedic), with his breathing, SpO₂ and EtCO₂ watched without a break (joint NAEMSP/NASEMSO/NEMSMA/NAEMT/APA position statement, 2021).',
        },
      }),
    },
    {
      // calm, and being cooled: the heat comes off
      id: 'cooler',
      when: (s) => s.pulse && calm(s) && cooling(s) && s.minute >= Math.max(s.flags.calm, s.flags.cooling) + COOLS_AFTER,
      effect: (s) => ({ say: [['partner', 'He has stopped sweating so hard, and his skin feels cooler.', 'good']], vitals: { temp: Math.max(37.8, warmer(s, -0.6)) } }),
    },
  ],
  // in the order a hint should name them (the first missing one), which is roughly the order of their targets: the EMT's
  // intercept call comes before anything else that takes time
  critical: [
    {
      // the EMT's one way to the drug he needs: as much as the paramedic's benzodiazepine is worth
      id: 'als', label: 'Request a paramedic intercept early', roles: [1], points: 20, target: { by: 4 }, done: ['als'],
      why: 'He needs a benzodiazepine for the agitation, the rate and the pressure, and nitroglycerin for the pain — both ALS. Call at once; the intercept meets you, and you never wait on scene for it.',
    },
    // a pressure in both arms is a pressure too (and a fair look for a dissection, which cocaine can also cause)
    { id: 'vitals', label: 'Vital signs', why: 'A pressure and a pulse before aspirin, nitroglycerin or a sedative: his are 178/104 and 132.', done: ['vitals', 'nibp', 'bp-both-arms'], points: 5, target: { by: 5 } },
    {
      id: 'benzo', label: 'Midazolam for the agitation, the racing heart and the high pressure', roles: [2], points: 20, target: { by: 10 }, done: ['midazolam', 'sedation'],
      why: 'A benzodiazepine is the first treatment of cocaine toxicity: it calms the agitation, brings down the rate, the pressure and the heat the muscles make, and eases the chest pain (2014 ACC/AHA NSTE-ACS guideline: alone or with nitroglycerin for the hypertension and tachycardia of acute intoxication). Midazolam 2.5–5 mg IV, or 5 mg IM or intranasal without a line, repeated until he is calm — not asleep.',
    },
    {
      id: 'ecg', label: '12-lead ECG within 10 minutes', points: 15, target: { by: 10 }, done: ['ecg12'],
      why: 'Chest pain after cocaine can be a heart attack: coronary spasm, a clot, or a heart driven past its oxygen supply. A 12-lead within 10 minutes of first contact looks for a STEMI — his shows none.',
    },
    {
      id: 'temperature', label: 'Take his temperature', points: 5, target: { by: 10 }, done: ['temp'],
      why: 'Cocaine makes heat (agitation, muscle work, skin vessels clamped shut): his 38.4 °C (101.1 °F) climbs while he stays agitated, and hyperthermia is one of the deadliest effects of a stimulant. A hot, sweaty skin says to measure it.',
    },
    {
      id: 'cool', label: 'Cool him: undress, cold packs, mist and a fan', points: 5, target: { by: 12 }, done: ['cool'],
      why: 'Cool him as the temperature climbs: undress him, cool the room, cold packs to the neck, armpits and groin, mist and a fan — rapid external cooling is for a life-threatening temperature (2023 AHA) — and treat the agitation that makes the heat.',
    },
    {
      id: 'calm-approach', label: 'Talk him down first: one calm voice, a quiet space', roles: [1, 2], points: 5, target: { by: 5 }, done: ['calm'],
      why: 'Verbal de-escalation comes before any drug or restraint (joint NAEMSP/NASEMSO/NEMSMA/NAEMT/APA position statement, 2021): one calm voice, fewer people and less noise, each step explained. It lowers the fight — and the heat and the rate that come with it — even when he still needs the benzodiazepine.',
    },
    {
      // by the time the aspirin and the nitroglycerin are due: a paramedic who treats first and asks second is not late
      id: 'history', label: 'The pain and the history (OPQRST and SAMPLE)', points: 5, target: { by: 15 },
      why: 'What he took, how much, how and when; what the pain is like; allergies and medicines (an erectile-dysfunction drug rules out nitroglycerin). Cocaine an hour ago with squeezing chest pain is a possible heart attack until the hospital rules it out.',
      done: (s) => (has(s, 'opqrst') && has(s, 'sample') ? Math.max(s.flags.opqrst, s.flags.sample) : null), uses: ['opqrst', 'sample'],
    },
    { id: 'transmit', label: 'Transmit the 12-lead (you do not interpret it)', roles: [1], points: 10, target: { by: 15 }, done: ['ecg-transmit'], why: 'The physician reads it from the field: no STEMI, so no cath lab — and the hospital knows what is coming.' },
    {
      id: 'aspirin', label: 'Aspirin 162–325 mg chewed', points: 10, target: { by: 15 }, done: ['aspirin'],
      why: 'Cocaine makes the blood clot as well as squeezing the coronaries: aspirin is given for cocaine chest pain as for any possible heart attack, unless he is allergic or bleeding (AHA).',
    },
    { id: 'iv', label: 'IV access', roles: [2], points: 5, done: ['iv', 'io'], why: 'For more midazolam if the agitation comes back, fluid for a man who has sweated through his clothes, and anything else he needs.' },
    {
      id: 'nitro', label: 'Nitroglycerin for the chest pain', roles: [2], points: 10, target: { by: 15 }, done: ['nitro', 'nitro-high'],
      why: 'Nitroglycerin opens the coronaries cocaine has squeezed and lowers the pressure: 0.4 mg sublingual every 5 minutes for the pain, once you have his pressure and know he has taken no erectile-dysfunction drug (AHA; 2014 ACC/AHA NSTE-ACS).',
    },
    { id: 'glucose', label: 'Blood glucose', points: 5, target: { by: 15 }, done: ['glucose'], why: 'Every agitated or confused patient gets a glucose: a low one looks the same and needs a different treatment.' },
    {
      id: 'repeat-ecg', label: 'Repeat the 12-lead', points: 5, done: ['ecg12-repeat'],
      why: 'A first 12-lead without ST elevation does not rule out a heart attack after cocaine: repeat it while the pain goes on, and whenever it changes. ST elevation on a repeat means the cath lab.',
    },
    {
      id: 'transport', label: 'Transport', points: 10, target: { by: 18 }, done: ['transport-pci', 'transport-near'],
      why: 'He needs an emergency department: troponins and serial 12-leads, a CK for his muscles, a core temperature and a monitored bed. Treat the agitation and start cooling on scene, then go — the intercept can meet you on the way.',
    },
    { id: 'notify', label: 'Radio report to the hospital', points: 5, done: ['notify'], why: 'A call ahead with the cocaine, the chest pain, the 12-lead, his temperature and what was given has a monitored bed ready.' },
    { id: 'handoff', label: 'Hand-off', points: 5, done: ['handoff'], why: 'Report the cocaine and when, the chest pain, both 12-leads, the temperature, what was given and when — and what was held (no beta-blocker).' },
    {
      id: 'arrest-shock', label: 'No pulse: defibrillate within 2 minutes', points: 15, done: ['defib', 'aed'], after: 'arrest',
      target: { within: { flag: 'arrest', minutes: 2 } }, applies: (s) => has(s, 'arrest'),
      why: 'Witnessed VF with the pads on: shock it at once — every minute without a shock lowers survival.',
    },
  ],
  harms: [
    {
      // the case declares severe agitation for the whole case, but he is oriented and only restless until the 'severe'
      // event (a benzodiazepine before it prevents it), and calm once one takes hold: restraint is right only in between
      id: 'restraint-not-yet', actions: ['restrain'], when: (s) => s.pulse && (!has(s, 'severe') || calm(s)), points: 5, severity: 'major',
      replaces: ['restraint-no-indication'],
      text: 'Restraining him while he is no danger to himself or the crew. Oriented and restless, he can be talked down, and the benzodiazepine treats what the cocaine drives; calmed by it, he needs no straps at all. Restraint is the last resort, for agitation that endangers him or the crew once talking has failed — face up, with the sedation that ends the fight (joint NAEMSP/NASEMSO/NEMSMA/NAEMT/APA position statement, 2021).',
    },
    {
      // the same id as the built-in rule, in this case's words and weight: the beta-blocker is this case's main trap, weighted
      // as the other field cases weight a Class 3 — Harm drug (it must not leave an otherwise perfect run "Excellent")
      id: 'beta-blocker-stimulant', actions: ['metoprolol'], when: (s) => s.pulse, points: 15, severity: 'critical',
      text: 'A beta-blocker in acute cocaine intoxication. With the beta receptors blocked, cocaine\'s alpha effect goes unopposed: the pressure climbs and the coronaries squeeze harder, while the rate barely falls. No beta-blocker while the signs of acute intoxication last — a fast rate, a high pressure, agitation (2014 ACC/AHA NSTE-ACS guideline: 3 — Harm; AHA statement on cocaine chest pain). A benzodiazepine brings the rate and the pressure down by treating their cause, and nitroglycerin treats the pain.',
    },
    {
      id: 'oxygen-normoxic', actions: ['o2-nc', 'o2-nrb'], when: (s) => s.pulse && s.vitals.spo2 >= 90 && !has(s, 'oversedated') && !has(s, 'rosc'), points: 3, severity: 'minor',
      text: 'Oxygen with an SpO₂ of 90 % or more. In a possible acute coronary syndrome oxygen is for an SpO₂ under 90 % (2025 ACC/AHA ACS guideline): his is 97 %, and extra oxygen brings no benefit.',
    },
    {
      id: 'nitro-no-bp', actions: ['nitro', 'nitro-high'], when: (s) => s.pulse && !has(s, 'bp'), points: 5, severity: 'major',
      text: 'Nitroglycerin without a blood pressure. Take it first: nitrates need a systolic of at least 90–100 mmHg (per protocol).',
    },
    {
      id: 'nitro-no-pde5', actions: ['nitro', 'nitro-high'], when: (s) => s.pulse && !has(s, 'pde5-asked'), points: 3, severity: 'minor',
      text: 'Nitroglycerin without asking about erectile-dysfunction drugs — often taken with cocaine at parties. No nitrate within 12 h of avanafil, 24 h of sildenafil or vardenafil, or 48 h of tadalafil: together they can cause profound hypotension.',
    },
    {
      id: 'nitro-high-chest-pain', actions: ['nitro-high'], when: (s) => s.pulse, points: 2, severity: 'minor', replaces: ['nitro-high-not-hypertensive'],
      text: 'High-dose nitroglycerin for chest pain. 0.8 mg is the dose for hypertensive pulmonary edema, and his lungs are clear: for the pain the dose is 0.4 mg every 5 minutes, with the benzodiazepine bringing the pressure down.',
    },
    {
      id: 'nitro-too-soon', actions: ['nitro', 'nitro-high'], when: (s) => s.pulse && (sinceLastNitro(s) ?? Infinity) < 5, points: 2, severity: 'minor',
      text: 'Nitroglycerin repeated within 5 minutes. Sublingual nitroglycerin is 0.4 mg every 5 minutes, up to 3 doses: each dose needs its 5 minutes to work, and the pressure is checked before the next.',
    },
    // titrated to calm: one unneeded dose is a small mistake (some protocols repeat it for a rate or pressure that stays up);
    // dosing a patient already drowsy from it is a real one
    {
      id: 'midazolam-calm', actions: ['midazolam', 'sedation'], when: (s) => s.pulse && calm(s) && !has(s, 'oversedated'), points: 2, severity: 'minor',
      text: 'More midazolam for a patient who was already calm. A benzodiazepine is titrated to calm, not to sleep — and with the beers on board each dose goes further: more only makes him drowsy and slows his breathing. Treat the chest pain that is left with nitroglycerin, and repeat the benzodiazepine if the agitation comes back.',
    },
    {
      // the dose after the extra one (GCS 13, which the built-in 'midazolam-unsafe' does not yet catch); a dose after that,
      // with a GCS of 12 or less or a low pressure, breaks the built-in rule as well — each dose is a mistake of its own
      id: 'midazolam-oversedated', actions: ['midazolam', 'sedation'], when: (s) => s.pulse && has(s, 'oversedated'), points: 8, severity: 'major',
      text: 'Midazolam for a patient already drowsy from it. Each dose deepens the sedation and slows the breathing further, and the alcohol he drank adds to it: stop, keep his airway open and his head up, watch the breathing, SpO₂ and EtCO₂, and be ready to assist his breathing with the bag-mask.',
    },
    {
      // the built-in 'midazolam-unsafe' watches the midazolam action only; here the sedation protocol is the same drug
      id: 'sedation-drowsy', actions: ['sedation'], when: (s) => s.pulse && (s.vitals.gcs <= 12 || s.vitals.sbp < 90), points: 5, severity: 'major',
      text: 'More midazolam (the sedation protocol) for a patient this drowsy. A benzodiazepine drops the breathing and the pressure further: with a GCS of 12 or less, support the airway and the breathing instead.',
    },
    {
      id: 'pressor-stimulant', actions: ['push-epi', 'pressor'], when: (s) => s.pulse, points: 8, severity: 'major',
      text: 'A vasopressor or push-dose epinephrine in cocaine toxicity with a high pressure. Cocaine already floods the adrenergic receptors: more drives the rate, the pressure and the coronary spasm higher.',
    },
    {
      id: 'antiarrhythmic-sinus', actions: ['adenosine3', 'adenosine6', 'adenosine12', 'amio-infusion', 'procainamide', 'lidocaine'], points: 3, severity: 'minor',
      when: (s) => s.pulse && ['sinus-tachycardia', 'normal-sinus'].includes(s.rhythm.profile),
      text: 'A drug for an arrhythmia, given for a fast sinus rate. The rate is the cocaine and the agitation driving a normal heart: adenosine and the antiarrhythmics treat nothing here. A benzodiazepine brings the rate down by treating its cause.',
    },
    {
      // a calcium-channel blocker is a vasodilator the AHA lists for cocaine's coronary spasm or a dangerous pressure (2023
      // poisoning update) — after the benzodiazepine and nitroglycerin, not instead of them: then it costs nothing
      id: 'diltiazem-stimulant', actions: ['diltiazem'], points: 2, severity: 'minor',
      when: (s) => s.pulse && !(has(s, 'benzodiazepine') && has(s, 'nitro') && s.vitals.sbp >= 160),
      text: 'IV diltiazem for the fast rate and the high pressure of cocaine. A benzodiazepine treats both at their cause and nitroglycerin the coronary spasm; a calcium-channel blocker is a later option for spasm or a pressure that stays dangerously high after them (AHA statement on cocaine-associated chest pain; 2023 AHA poisoning update) — and in field protocols IV diltiazem is a rate drug for atrial fibrillation or flutter, not for a fast sinus rate.',
    },
    {
      id: 'cpap-clear-lungs', actions: ['cpap'], when: (s) => s.pulse, points: 3, severity: 'minor',
      text: 'CPAP with clear lungs. It is for respiratory distress from fluid on the lungs; his lungs are clear, and a mask strapped over the face of an agitated patient makes the agitation worse.',
    },
    {
      id: 'legs-up-hypertensive', actions: ['legs-up'], when: (s) => s.pulse, points: 2, severity: 'minor',
      text: 'Raising the legs of a patient whose pressure is already high. It returns more blood to a heart that is already working too hard: let him sit in the position of comfort.',
    },
  ],
  timings: [
    { label: 'First 12-lead', actions: ['ecg12'], target: 10 },
    // the EMT's intercept gives it: the flag counts theirs
    { label: 'Benzodiazepine', actions: ['midazolam', 'sedation'], flag: 'benzodiazepine', target: 10 },
    { label: 'Temperature taken', actions: ['temp'], target: 10 },
    { label: 'Aspirin', actions: ['aspirin'], target: 15 },
    { label: 'Left the scene', actions: ['transport-pci', 'transport-near'], target: 18 },
  ],
  transportMinutes: 14,
  nearestMinutes: 8,
  arrival: 'You arrive; the emergency team meets you at the door.',
  teaching: [
    'Cocaine (and methamphetamine) hurts the heart three ways: it drives the rate and the pressure up, it squeezes the coronary arteries (spasm), and it makes the blood clot. A small but real share of cocaine chest pain is a heart attack — treat it as possible ACS.',
    'A benzodiazepine first: it calms the agitation and brings down the rate, the pressure and the heat the muscles make, and it eases the chest pain (2014 ACC/AHA NSTE-ACS guideline: alone or with nitroglycerin for the hypertension and tachycardia of acute intoxication; 2023 AHA poisoning update). Midazolam 2.5–5 mg IV, or 5 mg IM or intranasal without a line, repeated until calm — not asleep; watch the breathing.',
    'Aspirin 162–325 mg chewed and nitroglycerin 0.4 mg sublingual for the chest pain, as for any possible ACS (AHA statement on cocaine-associated chest pain); oxygen only for an SpO₂ under 90 % (2025 ACC/AHA ACS guideline). Ask about erectile-dysfunction drugs before any nitrate.',
    'No beta-blocker while the signs of acute intoxication last — a fast rate, a high pressure, agitation (2014 ACC/AHA NSTE-ACS guideline: 3 — Harm). With the beta receptors blocked, cocaine\'s alpha effect goes unopposed: the pressure climbs and the coronary spasm worsens. Treat the rate by treating its cause.',
    'Take the temperature of every stimulant patient. Hyperthermia is one of the deadliest effects of a stimulant: undress, cool the room, cold packs to the neck, armpits and groin, mist and fan; rapid external cooling (ice water where your protocol has it) for a life-threatening temperature (2023 AHA). The benzodiazepine stops the muscle work that makes the heat.',
    'Calm talk comes first with any agitated patient, and it goes on while the benzodiazepine works: the drug treats what the cocaine does to his rate, pressure and heat, and the words keep him from fighting. Make sure the scene is safe (here the police are already there), keep a clear way out for you and for him, turn the noise down and approach calmly: one voice, a quiet room, nobody crowding him.',
    'Never restrain a patient face down, hobbled or hog-tied, under a backboard or mattress, or with a hold that presses on the neck or chest (NAEMSP joint position statement on restraint, 2021): positional asphyxia kills. Talk him down first; if he must be restrained, keep him on his back or side, sedate him (ALS) so he is not fighting the restraints — which drives up the heat and the acid in his blood — and watch his breathing, SpO₂ and EtCO₂ without a break.',
    'A 12-lead within 10 minutes of first contact, transmitted from the field, and repeated: a first tracing without ST elevation does not rule out a heart attack after cocaine. ST elevation that meets STEMI criteria on any tracing means a STEMI alert, as for any patient (2025 ACC/AHA ACS guideline) — give the nitroglycerin and the benzodiazepine too, but do not wait to see whether it settles; primary PCI is preferred over a fibrinolytic after cocaine (AHA).',
    'Agitation has other causes: check the glucose, look for a head injury, an infection, withdrawal or other drugs. EMTs: aspirin, the 12-lead acquired and transmitted, the temperature and cooling, a calm approach, and a paramedic intercept called early — and never wait on scene for it.',
  ],
};
