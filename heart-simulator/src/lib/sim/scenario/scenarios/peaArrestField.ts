import type { Effect, Line, Scenario, SimState } from '../types';
import { bpAfter, firstDone, has, interpret, line } from '../kit';

/** Minutes from the EMT's call until the paramedic intercept is at her side */
const ALS_MINUTES = 6;

/** EtCO₂ during compressions once she is being ventilated: the CPR is producing some blood flow */
const CPR_ETCO2 = 26;

const map = (bp: { sbp: number; dbp: number }) => Math.round((bp.sbp + 2 * bp.dbp) / 3);

/** The monitor or the AED pads are on, so a change of rhythm sounds an alarm */
const ecgOn = (s: SimState) => has(s, 'monitor') || has(s, 'pads');

/** 2-minute CPR cycles started since a flag was set (the cycle being started now is not counted yet) */
function cyclesSince(s: SimState, flag: string): number {
  const from = s.flags[flag];
  if (from === undefined) return 0;
  return s.performed.filter((p) => p.id === 'cpr' && p.minute >= from).length;
}

/** Times a check (a pulse check, an AED analysis) was done since the last CPR cycle began — or since the crew arrived */
function checksSinceCpr(s: SimState, id: string): number {
  const last = s.performed.filter((p) => p.id === 'cpr').at(-1)?.minute ?? -1;
  return s.performed.filter((p) => p.id === id && p.minute > last).length;
}

/**
 * The minute her breaths were taken over after ROSC, or null: an airway placed during the arrest goes on being used
 * from the moment of ROSC; otherwise the bag (or an airway) after it
 */
function ventedAfterRosc(s: SimState): number | null {
  if (s.flags.rosc === undefined) return null;
  if (has(s, 'airway') && s.flags.airway <= s.flags.rosc) return s.flags.rosc;
  return firstDone(s, ['bvm', 'airway'], 'rosc');
}

/**
 * CPR cycles with breaths that bring her back. Hypoxia stopped her heart, so nothing works until oxygen reaches it:
 * two ventilated cycles with epinephrine on board; a heart that has gone flat needs a third. Without epinephrine
 * (the EMT before the medics arrive, or a paramedic who never gives it) breaths and CPR can still do it, two cycles later.
 */
function cyclesNeeded(s: SimState): number {
  return (has(s, 'flatline') ? 3 : 2) + (has(s, 'epi') ? 0 : 2);
}

function rosc(s: SimState): Effect {
  // an advanced airway placed during the arrest: the crew goes on ventilating through it, 10 breaths a minute
  const tubed = has(s, 'airway');
  const etco2 = has(s, 'capno') ? ' EtCO₂ jumps to 52 mmHg.' : '';
  return {
    say: [
      ['you', interpret(s)
        ? `Rhythm check after 2 minutes of compressions and breaths with oxygen: a carotid pulse — ROSC.${etco2}`
        : 'Pulse check after 2 minutes of compressions and breaths with oxygen: she gasps, and there is a carotid pulse — ROSC.', 'good'],
      tubed ? line('you', 'Still ventilating through the airway, 1 breath every 6 seconds.') : line('you', 'She breathes on her own, but only 6 times a minute.', 'warn'),
    ],
    rhythm: { profile: 'sinus-tachycardia', hr: 124 }, pulse: true, phase: 'rosc',
    vitals: { sbp: 84, dbp: 50, spo2: tubed ? 93 : 88, rr: tubed ? 10 : 6, etco2: tubed ? 46 : 52, gcs: 3, pain: 0 },
    flags: ['cpr'],
  };
}

/** A drug for the heart or the vessels pushed in arrest: with no circulation it reaches nothing */
const noCirculation = (what: string, flag: string): Effect => ({ say: [['you', `${what} pushed — with no circulation it reaches nothing, and nothing changes.`]], flags: [flag] });

export const peaArrestField: Scenario = {
  id: 'pea-arrest-field',
  title: 'Gasping, then quiet',
  summary: '64-year-old woman on home oxygen, in cardiac arrest on her living-room floor while her husband does compressions. Run the arrest — and find what stopped her heart.',
  setting: 'field',
  roles: [1, 2],
  difficulty: 'advanced',
  briefing: {
    default: [
      ['dispatch', 'Priority 1: 64-year-old woman, unresponsive and not breathing normally. The caller says she has struggled to breathe for three days. The dispatcher is coaching him through compressions.'],
      ['scene', 'A small apartment. Her husband is pushing on her chest on the living-room floor, beside a recliner with home-oxygen tubing and an inhaler on the armrest. Her lips are blue-gray. "She was gasping, then she went quiet — four, five minutes ago."'],
      ['partner', 'Your partner, an EMT, has the bag-valve mask and the airway kit; you have the monitor and the drug box.'],
      ['hospital', 'Regional medical center (ICU, cardiac arrest center): 14 minutes. Nearest emergency department: 7 minutes.'],
    ],
    1: [
      ['dispatch', 'Priority 1: 64-year-old woman, unresponsive and not breathing normally. The caller says she has struggled to breathe for three days. The dispatcher is coaching him through compressions.'],
      ['scene', 'A small apartment. Her husband is pushing on her chest on the living-room floor, beside a recliner with home-oxygen tubing and an inhaler on the armrest. Her lips are blue-gray. "She was gasping, then she went quiet — four, five minutes ago."'],
      ['partner', 'Your partner, an EMT, has the AED and the airway bag. Your BLS unit is first on scene: no paramedic unit has been sent yet.'],
      ['hospital', 'Regional medical center (ICU, cardiac arrest center): 14 minutes. Nearest emergency department: 7 minutes.'],
    ],
  },
  initial: {
    rhythm: { profile: 'pea', hr: 34 }, pulse: false, phase: 'arrest',
    // compressions only so far: no one has given her a breath, so there is nothing for a capnograph to measure
    vitals: { sbp: 0, dbp: 0, spo2: 60, rr: 0, etco2: 3, pain: 0, gcs: 3, glucose: 146, temp: 36.4 },
  },
  facts: {
    opqrst: 'She cannot answer. Her husband: "Three days of getting more and more short of breath, coughing up thick green phlegm. Today she couldn\'t finish a sentence or lie flat, and she was using her inhaler every hour. Then she started gasping, her lips went blue, and she went quiet."',
    sample: 'Her husband: "She has bad COPD — emphysema — and she\'s on 2 liters of oxygen at home. Albuterol and ipratropium inhalers, tiotropium, and prednisone her doctor started on Monday for a chest cold. No allergies. She smoked for 40 years. No heart trouble that we know of, no kidney problems. There\'s no DNR — she would want you to try."',
    pde5: 'Her husband: "No."',
    lungs: (s) => {
      if (!s.pulse && !has(s, 'ventilated')) return 'Nothing to hear: no one has given her a breath yet. Barrel-shaped chest; trachea midline.';
      if (!s.pulse) return 'Faint breath sounds on both sides with each squeeze of the bag, equal, with wheezes; the chest rises evenly and the trachea is midline — no sign of a tension pneumothorax.';
      return 'Wheezes on both sides, equal air entry with each breath; coarse crackles at the right base.';
    },
    perfusion: (s) => (s.pulse
      ? 'Still dusky, but color is coming back to her lips; weak radial pulse; capillary refill 4 seconds.'
      : 'Blue-gray lips and nail beds; skin cool; no pulses. Neck veins flat, no leg swelling, no sign of bleeding.'),
    neuro: (s) => (s.pulse ? 'No response to pain; pupils mid-sized and sluggish to light.' : 'Unresponsive.'),
    ecg12: (s) => (s.pulse
      ? `Sinus tachycardia ${s.rhythm.hr}: a normal P wave before every QRS, normal intervals, no ST elevation or depression — no sign of a coronary occlusion. The fast rate is her response to the arrest, the epinephrine and the low pressure.`
      : 'No 12-lead during CPR.'),
  },
  status: (s) => {
    if (!s.pulse) return 'Unresponsive; CPR continues.';
    return ventedAfterRosc(s) !== null ? `Unresponsive; ventilated at ${s.vitals.rr}/min.` : `Unresponsive, breathing only ${s.vitals.rr} times a minute on her own.`;
  },
  respond: {
    // Ventilation is what brings her back: the cycle that ends with enough oxygen-carrying CPR behind it gives ROSC.
    // Compressions alone (the default line) keep a little blood moving, but carry no oxygen to the heart.
    cpr: (s) => {
      if (s.pulse || !has(s, 'ventilated')) return null;
      if (cyclesSince(s, 'ventilated') + 1 >= cyclesNeeded(s)) return rosc(s);
      // oxygen is reaching the heart: complexes come back on a flat screen, or come faster — still no pulse
      const hr = s.rhythm.profile === 'asystole' ? 30 : Math.max(s.rhythm.hr, 52);
      return {
        say: [['you', 'Two minutes of compressions with 2 breaths of oxygen after every 30. Pulse check: still no pulse.']],
        rhythm: { profile: 'pea', hr }, vitals: { etco2: CPR_ETCO2 }, flags: ['cpr'],
      };
    },
    // the first breaths she has had in minutes; the partner keeps bagging from now on
    bvm: (s) => {
      if (!s.pulse) {
        return has(s, 'ventilated')
          ? { say: [['you', 'Still bagging: 2 breaths over 1 second each after every 30 compressions, oxygen at 15 L/min.']], flags: ['ventilated'] }
          : {
            say: [['you', 'Bag-mask with an oral airway on 15 L/min of oxygen: 2 breaths, each over 1 second, after every 30 compressions. The chest rises; your partner keeps bagging.']],
            vitals: { etco2: 58 }, flags: ['ventilated'],
          };
      }
      if (s.vitals.gcs > 8) return null;
      return {
        say: [['you', 'Assisting her breaths with the bag, 1 breath every 6 seconds, slow squeezes that let each breath out.'], ['monitor', 'SpO₂ 95%. EtCO₂ 44 mmHg.']],
        vitals: { spo2: 95, rr: 10, etco2: 44 }, flags: ['ventilated'],
      };
    },
    // an advanced airway ventilates her as the bag does; it is confirmed (and watched) with capnography
    airway: (s) => {
      if (!s.pulse) {
        return {
          say: [['you', 'Supraglottic airway placed while compressions go on; confirmed with waveform capnography. Ventilating through it, 1 breath every 6 seconds, compressions continuous.']],
          ...(has(s, 'ventilated') ? {} : { vitals: { etco2: 58 } }), flags: ['airway', 'ventilated', 'capno'],
        };
      }
      if (s.vitals.gcs > 8) return null;
      return {
        say: [['you', 'Airway placed; confirmed with waveform capnography. Ventilating through it, 1 breath every 6 seconds.'], ['monitor', 'SpO₂ 95%. EtCO₂ 44 mmHg.']],
        vitals: { spo2: 95, rr: 10, etco2: 44 }, flags: ['airway', 'ventilated', 'capno'],
      };
    },
    // a mask offers oxygen only to someone who breathes
    'o2-nrb': (s) => {
      if (!s.pulse) return { say: [['you', 'Non-rebreather on at 15 L/min — but she is not breathing, and a mask only offers oxygen to someone who is.']], flags: ['o2'] };
      if (s.vitals.gcs > 8) return null;
      if (ventedAfterRosc(s) !== null) return { say: [['you', 'She is already being bagged on 15 L/min: a mask on top adds nothing.']] };
      const spo2 = Math.min(88, s.vitals.spo2 + 2);
      return { say: [['you', `She breathes only ${s.vitals.rr} times a minute: a mask alone will not ventilate her.`], ['monitor', `SpO₂ ${spo2}%.`]], vitals: { spo2 }, flags: ['o2'] };
    },
    'o2-nc': (s) => {
      if (!s.pulse) return { say: [['you', 'Nasal cannula on — but she is not breathing, and a cannula only offers oxygen to someone who is.']], flags: ['o2'] };
      if (s.vitals.gcs > 8) return null;
      if (ventedAfterRosc(s) !== null) return { say: [['you', 'She is already being bagged on 15 L/min: a cannula adds nothing.']] };
      return { say: [['you', `She breathes only ${s.vitals.rr} times a minute: a cannula will not ventilate her.`]], flags: ['o2'] };
    },
    // CPAP supports breaths a patient takes; it gives none
    cpap: (s) => {
      if (s.pulse && s.vitals.gcs > 8) return null;
      return {
        say: [['you', s.pulse
          ? `CPAP mask on — but she is unresponsive and breathes ${s.vitals.rr} times a minute: CPAP supports breaths, it does not give them, and she cannot protect her airway.`
          : 'CPAP mask on — but CPAP only supports breaths a patient takes: she is not breathing, so it moves no air.', 'bad']],
        flags: ['cpap'],
      };
    },
    // Capnography reads only what is breathed out. Before anyone ventilates her it reads almost nothing — the trap is to
    // take that for futility. After an asphyxial arrest the first breaths wash out the CO₂ she could not breathe off.
    capno: (s) => {
      if (s.pulse) return { say: [['monitor', `EtCO₂ ${s.vitals.etco2} mmHg.`]], flags: ['capno'] };
      if (!has(s, 'ventilated')) {
        return {
          say: [['monitor', 'EtCO₂ 3 mmHg: almost no waveform.'], ['partner', 'EtCO₂ is 3. She has been down a while — do we call it?', 'warn']],
          vitals: { etco2: 3 }, flags: ['capno'],
        };
      }
      if (cyclesSince(s, 'ventilated') === 0) {
        return { say: [['monitor', `EtCO₂ 58 mmHg on the first breaths, then ${CPR_ETCO2} mmHg as compressions go on.`]], vitals: { etco2: CPR_ETCO2 }, flags: ['capno'] };
      }
      return { say: [['monitor', `EtCO₂ ${s.vitals.etco2} mmHg during compressions.`]], flags: ['capno'] };
    },
    'pulse-check': (s) => (s.pulse ? null : { say: [['you', 'No carotid pulse (checked for less than 10 seconds).', 'bad']], flags: ['pulseless-confirmed'] }),
    // a manual shock fires whatever the rhythm; on a heart that is not fibrillating it changes nothing
    defib: (s) => (s.pulse ? null : {
      say: [['monitor', 'Shock delivered: 200 J.'], ['you', 'Back on the chest: still no pulse. Compressions stopped for the charge and the shock.', 'bad']],
      flags: ['pads', 'monitor'],
    }),
    // her heart is slow because it is starved of oxygen, not because of the vagus (and the default would speed a "sinus" rate)
    atropine: (s) => (s.pulse ? null : { say: [['you', 'Atropine 1 mg IV — no change on the monitor.']], flags: ['atropine'] }),
    adenosine6: (s) => (s.pulse ? null : noCirculation('Adenosine', 'adenosine')),
    adenosine12: (s) => (s.pulse ? null : noCirculation('Adenosine', 'adenosine')),
    'epi-im': (s) => (s.pulse ? null : { say: [['you', 'Epinephrine 0.5 mg IM in the thigh — with no circulation, nothing carries it out of the muscle.']], flags: ['epi-im'] }),
    iv: () => ({ say: [['you', 'IV on the first attempt: 18 G in the left antecubital vein, flushed and running.']], flags: ['iv'] }),
    // the Hs and Ts against what the crew knows about her
    'hs-ts': (s) => ({
      say: [['you', `Hs and Ts against what you know. Hypoxia: three days of worsening COPD, blue lips, gasping before she went quiet, and only compressions since — the likeliest cause${has(s, 'ventilated') ? ', and the bag is treating it' : ': she needs breaths with oxygen now'}. Hypovolemia: no bleeding, no vomiting. Hydrogen ion: the CO₂ she could not breathe off and the acid that hypoxia makes — breaths treat both. Potassium: no kidney disease. Hypothermia: she is warm. Tension pneumothorax: possible with emphysema — listen for equal breath sounds as she is bagged. Tamponade: nothing to suggest it. Toxins: only her inhalers and prednisone. Thrombosis: a clot in the lungs or the heart is possible, but the story is her breathing.`]],
      flags: ['hs-ts'],
    }),
    // medical control will not end a witnessed arrest whose likely cause has not been treated, and not on EtCO₂ alone
    'med-control': (s) => {
      if (s.pulse) return null;
      const cause = has(s, 'ventilated') ? 'is only now being treated' : 'has not been treated yet';
      return {
        say: [['hospital', interpret(s)
          ? `Medical control: keep going — this is not one to stop. She was witnessed, she had bystander CPR, and the likely cause, her breathing, ${cause}. ${has(s, 'ventilated') ? '' : 'An EtCO₂ taken before anyone ventilates her measures nothing, and even later, '}never stop on EtCO₂ alone. Breaths with oxygen, epinephrine every 3 to 5 minutes, and call back if there is still no ROSC after 20 minutes of ALS.`
          : `Medical control: keep going. She was witnessed, she had bystander CPR, and the likely cause, her breathing, ${cause}: ventilate her with oxygen and keep compressions going until the paramedics take over.`]],
        flags: ['med-control'],
      };
    },
    // a nebulizer needs a patient who breathes; after ROSC it goes in line with the bag
    albuterol: (s) => {
      if (!s.pulse) return { blocked: true, say: [['system', 'Not in cardiac arrest: a nebulizer needs a patient who is breathing, and inhaled bronchodilators are not part of the arrest algorithm — breaths with oxygen are.']] };
      const spo2 = Math.min(98, s.vitals.spo2 + 1);
      return { say: [['you', 'Albuterol 2.5 mg nebulized in line with the bag: the wheezes ease a little.'], ['monitor', `SpO₂ ${spo2}%.`]], vitals: { spo2 }, flags: ['albuterol'] };
    },
    aspirin: (s) => (!s.pulse || s.vitals.gcs <= 8 ? { blocked: true, say: [['system', 'Not by mouth: she is unresponsive and cannot chew or swallow it.']] } : null),
    'nitro-assist': () => ({ blocked: true, say: [['system', 'She is unresponsive, and she has no nitroglycerin of her own.']] }),
    // after ROSC: fluid, a vasopressor or push-dose epinephrine bring the pressure up — never down from a higher one
    fluid: (s) => {
      if (!s.pulse) return null;
      const bp = bpAfter(s, 12, 8);
      return { say: [['monitor', `Bolus in. BP ${bp.sbp}/${bp.dbp}, MAP ${map(bp)}.`]], vitals: bp, flags: ['fluid'] };
    },
    pressor: (s) => {
      if (!s.pulse) return null;
      const bp = { sbp: Math.max(s.vitals.sbp, 104), dbp: Math.max(s.vitals.dbp, 64) };
      return { say: [['monitor', `Norepinephrine infusion running: BP ${bp.sbp}/${bp.dbp}, MAP ${map(bp)}.`, 'good']], vitals: bp, flags: ['pressor'] };
    },
    'push-epi': (s) => {
      if (!s.pulse) return null;
      const bp = { sbp: Math.max(s.vitals.sbp, 100), dbp: Math.max(s.vitals.dbp, 62) };
      return { say: [['monitor', `BP ${bp.sbp}/${bp.dbp} for a few minutes.`]], vitals: bp, flags: ['push-epi'] };
    },
    notify: (s) => ({
      say: [['hospital', s.pulse
        ? 'Copy: ROSC after a cardiac arrest, a patient with COPD on home oxygen. The resuscitation bay and respiratory therapy will be ready.'
        : 'Copy: cardiac arrest, resuscitation under way. Call back when you have a pulse or need orders.']],
      flags: ['notified'],
    }),
  },
  events: [
    {
      // no breaths yet: the heart slows as the last of the oxygen runs out
      id: 'slower',
      when: (s) => !s.pulse && s.rhythm.profile === 'pea' && !has(s, 'ventilated') && s.minute >= 4,
      effect: (s) => ({
        say: [['partner', 'She is turning a darker blue-gray, even with the compressions.', 'warn']],
        rhythm: { profile: 'pea', hr: Math.min(s.rhythm.hr, 24) },
      }),
    },
    {
      // the cause missed: the starved heart stops making complexes at all
      id: 'flatline',
      when: (s) => !s.pulse && s.rhythm.profile === 'pea' && !has(s, 'ventilated') && s.minute >= 9,
      effect: (s) => ({
        say: [...(ecgOn(s) ? [line('monitor', 'Monitor alarm.', 'bad')] : []), ['partner', 'Her chest has not risen once since we got here.', 'bad']],
        rhythm: { profile: 'asystole', hr: 0 }, flags: ['flatline'],
      }),
    },
    {
      // the EMT's intercept: the medics take over the drugs; the BLS crew keeps compressions and the bag
      id: 'als-arrives',
      when: (s) => s.role === 1 && has(s, 'als') && s.minute >= s.flags.als + ALS_MINUTES,
      effect: (s) => {
        if (s.pulse) return { say: [['team', 'The paramedics arrive and take over the drugs: an IO in her arm, ready for her blood pressure.']], flags: ['iv', 'als-here'] };
        const lines: Line[] = [['team', 'The paramedics arrive and take over the drugs: IO in her arm, epinephrine 1 mg in. "Keep the compressions and the bag going — the breaths are yours."']];
        if (!has(s, 'ventilated')) lines.push(['team', '"Has she had any breaths yet? With lungs like hers, oxygen is what she needs — get the bag on her."', 'warn']);
        return { say: lines, flags: ['iv', 'epi', 'als-here'] };
      },
    },
    {
      id: 'als-epi-repeat',
      when: (s) => s.role === 1 && has(s, 'als-here') && has(s, 'epi') && !s.pulse && s.minute >= s.flags['als-here'] + 4,
      effect: () => ({ say: [['team', 'Epinephrine 1 mg again, 4 minutes after the first.']] }),
    },
    {
      // after ROSC the medics treat her low pressure; the EMT's job is to measure and report it
      id: 'als-post-rosc',
      when: (s) => s.role === 1 && s.pulse && has(s, 'rosc') && has(s, 'als-here') && s.minute >= Math.max(s.flags.rosc, s.flags['als-here']) + 2,
      effect: (s) => {
        const bp = bpAfter(s, 12, 8);
        return { say: [['team', `The paramedic runs a fluid bolus for her pressure: BP ${bp.sbp}/${bp.dbp}.`]], vitals: bp, flags: ['fluid'] };
      },
    },
    {
      // back with a pulse but breathing 6 a minute: left unassisted, she desaturates again
      id: 'post-rosc-desat',
      when: (s) => s.pulse && has(s, 'rosc') && ventedAfterRosc(s) === null && s.minute >= s.flags.rosc + 3,
      effect: (s) => {
        const spo2 = Math.min(s.vitals.spo2, 80);
        return {
          say: [['partner', 'She is taking a breath only every 10 seconds, and her lips are going dusky again.', 'bad'], ...(has(s, 'monitor') ? [line('monitor', `SpO₂ ${spo2}%.`, 'bad')] : [])],
          vitals: { spo2, etco2: Math.max(s.vitals.etco2, 60) },
        };
      },
    },
  ],
  critical: [
    { id: 'cpr', label: 'Take over high-quality CPR at once', why: 'Her husband is tiring. Compressions 100–120 a minute, 5–6 cm deep, full recoil, and as few pauses as possible.', done: ['cpr'], points: 10, target: { by: 1.5 } },
    {
      id: 'aed', label: 'AED on: let it analyze', roles: [1], points: 10, target: { by: 3 }, done: ['aed'],
      why: 'It rules out a shockable rhythm. "No shock advised" means compressions again at once: this arrest is treated with CPR, breaths and the cause, not a shock.',
    },
    {
      id: 'rhythm', label: 'Rhythm check on the monitor, then a pulse check (10 seconds or less)', roles: [2], points: 10, target: { by: 4 },
      why: 'Organized complexes with no pulse are PEA: the pulse check, not the screen, makes the diagnosis — and PEA is not shockable.',
      done: (s) => {
        const on = firstDone(s, ['pads', 'monitor', 'aed']);
        if (on === null) return null;
        return s.performed.find((p) => p.id === 'pulse-check' && p.minute >= on && p.minute < (s.flags.rosc ?? Infinity))?.minute ?? null;
      },
      uses: ['pads', 'monitor', 'aed', 'pulse-check'],
    },
    { id: 'als', label: 'Request ALS (paramedic intercept)', why: 'Epinephrine, IV or IO access and an advanced airway need a paramedic: call at once — the intercept takes minutes to arrive.', done: ['als'], roles: [1], points: 10, target: { by: 3 } },
    {
      id: 'ventilate', label: 'Treat the cause: breaths with oxygen (bag-mask or advanced airway)', points: 20, target: { by: 4 }, done: ['bvm', 'airway'],
      why: 'Her arrest began with three days of worsening COPD, blue lips and gasping: hypoxia. Compressions alone cannot fix it. She needs breaths with high-flow oxygen: a bag-mask at 30:2, each breath over 1 second, just enough to see the chest rise — or an advanced airway, 1 breath every 6 seconds.',
    },
    { id: 'access', label: 'Vascular access: IV first, IO if the IV fails', why: 'For epinephrine. 2025 AHA: try IV first; IO if IV attempts are unsuccessful or not feasible.', done: ['iv', 'io'], roles: [2], points: 5 },
    {
      // 8 minutes leaves room for a crew that places an advanced airway (3 minutes) before the IV or IO
      id: 'epi', label: 'Epinephrine 1 mg IV/IO as soon as possible', roles: [2], points: 15, target: { by: 8 },
      why: 'In a non-shockable rhythm give epinephrine 1 mg as soon as possible, then every 3–5 minutes.',
      // it is for the arrest: a dose after ROSC does not count (and the built-in rule penalizes it)
      done: (s) => s.performed.find((p) => p.id === 'epinephrine' && p.minute < (s.flags.rosc ?? Infinity))?.minute ?? null,
      uses: ['epinephrine'],
    },
    { id: 'hs-ts', label: 'Look for the reversible cause (Hs and Ts)', why: 'PEA rarely comes back until its cause is treated. Her story — three days of worsening COPD, blue lips, gasping — points to hypoxia.', done: ['hs-ts'], roles: [2], points: 5, target: { by: 10 } },
    {
      id: 'capno', label: 'Waveform capnography', roles: [2], points: 5,
      why: 'It shows whether the breaths are getting in and how well CPR is working, and an abrupt, sustained rise signals ROSC. A low reading means fix the CPR or the ventilation — it is never a reason on its own to stop.',
      // an airway confirmed with capnography counts: the capnograph is on
      done: (s) => s.flags.capno ?? null,
      uses: ['capno', 'airway'],
    },
    {
      id: 'post-vent', label: 'After ROSC: ventilate her (she breathes 6 a minute) to SpO₂ 90–98 %', points: 10, applies: (s) => has(s, 'rosc'),
      why: 'After ROSC keep SpO₂ 90–98 % and EtCO₂ 35–45 mmHg, about 10 breaths a minute: unresponsive and breathing 6 a minute, she needs her breaths assisted — through the airway if one is in.',
      done: ventedAfterRosc,
      uses: ['bvm', 'airway'],
    },
    {
      id: 'post-bp', label: 'After ROSC: treat the low pressure (MAP ≥ 65)', roles: [2], points: 10, applies: (s) => has(s, 'rosc'),
      why: 'Her pressure after ROSC is 84/50, a MAP of 61. Avoid hypotension: fluid, and a vasopressor if needed, to a MAP of 65 mmHg or more.',
      done: ['fluid', 'pressor', 'push-epi'], after: 'rosc',
    },
    {
      id: 'post-bp-check', label: 'After ROSC: check her blood pressure', roles: [1], points: 5, applies: (s) => has(s, 'rosc'),
      why: 'The pressure is often low after ROSC: measure it and report it, so the paramedics can treat a MAP under 65 mmHg.',
      done: ['vitals', 'nibp'], after: 'rosc',
    },
    {
      id: 'post-ecg', label: '12-lead after ROSC', points: 10, applies: (s) => has(s, 'rosc'),
      why: 'ST elevation after ROSC means emergent coronary angiography. Hers shows none: the arrest was respiratory. EMTs acquire and transmit it.',
      done: ['ecg12', 'ecg12-repeat'], after: 'rosc',
    },
    {
      id: 'transport', label: 'Transport after ROSC', points: 5, applies: (s) => has(s, 'rosc'),
      why: 'She needs an ICU: ventilation, pressure support, temperature control and treatment of her COPD. Either hospital can take her once she has a pulse.',
      done: (s) => s.flags.enroute ?? null,
      uses: ['transport-near', 'transport-pci'],
    },
    { id: 'handoff', label: 'Hand-off', why: 'Report the downtime and bystander CPR, the first rhythm, what brought her back (breaths with oxygen), each epinephrine dose and its time, the time of ROSC, and the vitals and 12-lead after it.', done: ['handoff'], points: 5, applies: (s) => has(s, 'rosc') },
  ],
  harms: [
    {
      // she never has a shockable rhythm: organized complexes, or a flat line
      id: 'shock-pea', actions: ['defib', 'cardiovert'], when: (s) => !s.pulse, points: 10, severity: 'major', replaces: ['shock-nonshockable'],
      text: 'A shock for a rhythm that is not shockable. Organized complexes without a pulse (PEA), like a flat line, are not VF or VT: a shock cannot convert them, and the charge and the shock take hands off the chest. Give CPR and epinephrine and treat the cause: here, breaths with oxygen.',
    },
    {
      id: 'long-pause', actions: ['pulse-check'], when: (s) => !s.pulse && checksSinceCpr(s, 'pulse-check') >= 1, points: 5, severity: 'major',
      text: 'A second pulse check with no compressions in between. Every check is a pause in the blood flow CPR makes: check the pulse in 10 seconds or less at the 2-minute rhythm check, then straight back on the chest.',
    },
    {
      id: 'long-pause-aed', actions: ['aed'], when: (s) => !s.pulse && checksSinceCpr(s, 'aed') >= 1, points: 5, severity: 'major',
      text: 'A second AED analysis with no compressions in between. Every analysis is a pause: when the AED advises no shock, start compressions at once and let it analyze again after 2 minutes of CPR.',
    },
    {
      id: 'transport-in-arrest', actions: ['transport-near', 'transport-pci'], when: (s) => !s.pulse, points: 6, severity: 'major',
      text: 'Loading her for transport while she is in cardiac arrest. Compressions on a stretcher and in a moving ambulance are poorer and keep being interrupted, and everything she needs — breaths with oxygen, epinephrine and CPR — works right here. Work the arrest on scene and transport after ROSC.',
    },
    {
      id: 'atropine-arrest', actions: ['atropine'], when: (s) => !s.pulse, points: 3, severity: 'minor',
      text: 'Atropine for a slow PEA. It has not been part of the cardiac arrest algorithm since 2010: the slow complexes come from a heart starved of oxygen, not from the vagus. CPR, epinephrine and the cause — here, breaths with oxygen.',
    },
    {
      // one rule for all of them, in its own words; it stands in for the built-in procainamide-in-arrest rule
      id: 'antiarrhythmic-pea', actions: ['amio-arrest', 'lidocaine', 'adenosine6', 'adenosine12', 'procainamide'], when: (s) => !s.pulse, points: 3, severity: 'minor',
      replaces: ['procainamide-in-arrest'],
      text: 'An antiarrhythmic in PEA. Amiodarone and lidocaine are for VF or pulseless VT that shocks have not fixed, adenosine and procainamide for tachycardias with a pulse: in PEA they treat nothing. CPR, epinephrine and the cause.',
    },
    {
      // the same id as the built-in rule, in this case's words
      id: 'bicarbonate-no-indication', actions: ['sodium-bicarbonate'], points: 3, severity: 'minor',
      text: 'Sodium bicarbonate in an arrest from a breathing problem. Routine bicarbonate in cardiac arrest brings no benefit (2025 AHA), and her acid is mostly the CO₂ she could not breathe off: bicarbonate turns into more CO₂, which only ventilation removes. Ventilate her.',
    },
    {
      id: 'cpap-not-breathing', actions: ['cpap'], when: (s) => !s.pulse || s.vitals.gcs <= 8, points: 5, severity: 'major',
      text: 'CPAP for a patient who is not breathing on her own. CPAP supports breaths a patient takes and needs someone awake enough to protect the airway; it gives no breaths. In the arrest, and unresponsive after ROSC, she needs ventilation with a bag-mask or an advanced airway.',
    },
    {
      id: 'epi-im-arrest', actions: ['epi-im'], when: (s) => !s.pulse, points: 3, severity: 'minor',
      text: 'IM epinephrine in cardiac arrest. With no circulation nothing carries it out of the muscle, and 0.3–0.5 mg is the anaphylaxis dose. Epinephrine for an arrest is 1 mg IV/IO, from ALS: call for them, and keep CPR and breaths going.',
    },
    {
      id: 'rate-control-post-rosc', actions: ['metoprolol', 'diltiazem'], when: (s) => s.pulse, points: 8, severity: 'major',
      text: 'A beta-blocker or calcium-channel blocker after ROSC. Her fast rate is the body\'s answer to the arrest, the epinephrine and a low pressure: slowing it drops a pressure already below a MAP of 65, and can bring the arrest back.',
    },
  ],
  timings: [
    { label: 'CPR taken over', actions: ['cpr'], target: 1.5 },
    { label: 'Rhythm analyzed (AED or monitor)', actions: ['aed', 'pads', 'monitor'], target: 3 },
    { label: 'First breaths with oxygen', actions: ['bvm', 'airway'], target: 4 },
    // the EMT's medics give it: the flag counts theirs
    { label: 'First epinephrine', actions: ['epinephrine'], flag: 'epi' },
    { label: 'ROSC', actions: [], flag: 'rosc' },
    { label: '12-lead after ROSC', actions: ['ecg12', 'ecg12-repeat'], from: 'rosc' },
  ],
  transportMinutes: 14,
  nearestMinutes: 7,
  arrival: 'You arrive; the resuscitation team and a respiratory therapist meet you at the door.',
  deathAfter: 24,
  completeWhen: (s) => has(s, 'rosc'),
  teaching: [
    'PEA is organized electrical activity on the monitor without a pulse: the pulse check (10 seconds or less), not the screen, makes the diagnosis. It is not shockable — an AED advises no shock, and a manual shock only takes hands off the chest.',
    'High-quality CPR (2025 AHA): 100–120 compressions a minute, at least 5 cm (2 in) deep while avoiding more than 6 cm (2.4 in), full recoil, and as few pauses as possible — check the rhythm every 2 minutes and the pulse in 10 seconds or less, then straight back on the chest.',
    'Epinephrine 1 mg IV/IO as soon as possible for a non-shockable rhythm, then every 3–5 minutes. Vascular access: IV first; IO if IV attempts are unsuccessful or not feasible (2025 AHA).',
    'Find the cause — the Hs and Ts: hypovolemia, hypoxia, hydrogen ion (acidosis), hypo-/hyperkalemia, hypothermia; tension pneumothorax, tamponade, toxins, thrombosis (pulmonary or coronary). A slow, wide PEA favors hypoxia and metabolic causes; a narrow, fast one favors mechanical causes (hypovolemia, tamponade, tension pneumothorax, a large pulmonary embolism).',
    'An arrest that begins with a breathing problem (COPD, asthma, pneumonia, an opioid overdose, drowning, choking) is hypoxic until proven otherwise, and compressions alone cannot fix it: ventilate with a bag-mask on high-flow oxygen — 30:2, each breath over 1 second, just enough to make the chest rise — or through an advanced airway, 1 breath every 6 seconds with continuous compressions.',
    'With COPD or asthma, bag slowly and let each breath out: fast bagging traps air in the chest (auto-PEEP), which squeezes the heart and can itself cause PEA. Listen for equal breath sounds — a tension pneumothorax needs needle decompression where your protocol allows.',
    'Capnography measures only what is breathed out: with no breaths it reads almost nothing, however good the compressions. After an asphyxial arrest the first readings are often high (the CO₂ that built up while she could not breathe), then fall. During CPR a low or falling EtCO₂ means improve the compressions and check the airway; an abrupt, sustained rise (often to 40 mmHg or more) suggests ROSC.',
    'Never use EtCO₂ alone, or any single cutoff, to stop a resuscitation (2025 AHA). Termination follows your protocol\'s rule and medical direction — not before the reversible causes have been treated.',
    'Atropine has not been part of the cardiac arrest algorithm since 2010; amiodarone and lidocaine are for VF or pulseless VT. Routine calcium and sodium bicarbonate bring no benefit in cardiac arrest (2025 AHA), and bicarbonate turns into CO₂ that only ventilation removes.',
    'Work the arrest where you find it: compressions in a moving ambulance are poorer and more often interrupted (a mechanical CPR device may be considered when CPR during transport cannot be avoided). Transport after ROSC.',
    'After ROSC (2025 AHA): 100 % oxygen until the SpO₂ can be measured reliably, then titrate to SpO₂ 90–98 %; ventilate to an EtCO₂ of about 35–45 mmHg, about 10 breaths a minute; keep MAP ≥ 65 mmHg with fluid and a vasopressor; record a 12-lead (ST elevation → emergent coronary angiography); check the glucose. A patient who does not follow commands needs temperature control in hospital (32–37.5 °C for at least 36 hours).',
  ],
};
