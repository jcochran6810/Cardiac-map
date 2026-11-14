import type { Effect, Line, Scenario, SimState } from '../types';
import { bpAfter, firstDone, has, interpret, line } from '../kit';

/** Minutes from the EMT's call until the paramedic intercept is at her side */
const ALS_MINUTES = 6;

/**
 * The paramedic's ALS starts on arrival (minute 0): medical control asks for a call back after 20 minutes of it, which
 * the case's death clock (deathAfter 24) leaves room for. The EMT's medics arrive too late for it, and the EMT is never
 * asked for it.
 */
const ALS_CALL_BACK = 20;

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

/** Minutes since the learner's last dose of arrest epinephrine, or null (judged before this dose is recorded) */
function sinceLastEpi(s: SimState): number | null {
  const last = s.performed.filter((p) => p.id === 'epinephrine').at(-1);
  return last ? s.minute - last.minute : null;
}

/** She is unresponsive with a GCS of 3 throughout: nothing that needs her awake can be done */
const unresponsive = (s: SimState) => !s.pulse || s.vitals.gcs <= 8;

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

/** A drug with no role in her arrest, pushed during it: the compressions carry it, but it has nothing to treat */
const noRoleInArrest = (what: string, flag: string): Effect => ({ say: [['you', `${what} pushed — it has no place in her arrest, and nothing changes on the monitor.`]], flags: [flag] });

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
      ['hospital', 'Regional heart center (ICU, cardiac arrest center): 14 minutes. Nearest emergency department: 7 minutes.'],
    ],
    1: [
      ['dispatch', 'Priority 1: 64-year-old woman, unresponsive and not breathing normally. The caller says she has struggled to breathe for three days. The dispatcher is coaching him through compressions.'],
      ['scene', 'A small apartment. Her husband is pushing on her chest on the living-room floor, beside a recliner with home-oxygen tubing and an inhaler on the armrest. Her lips are blue-gray. "She was gasping, then she went quiet — four, five minutes ago."'],
      ['partner', 'Your partner, an EMT, has the AED and the airway bag. Your BLS unit is first on scene: no paramedic unit has been sent yet.'],
      ['hospital', 'Regional heart center (ICU, cardiac arrest center): 14 minutes. Nearest emergency department: 7 minutes.'],
    ],
  },
  initial: {
    rhythm: { profile: 'pea', hr: 34 }, pulse: false, phase: 'arrest',
    // compressions only so far: no one has given her a breath, so there is nothing for a capnograph to measure
    vitals: { sbp: 0, dbp: 0, spo2: 60, rr: 0, etco2: 3, pain: 0, gcs: 3, glucose: 146, temp: 36.4 },
  },
  // what the built-in safety rules read (types.ts Problem): her COPD, wheezing after the ROSC — albuterol and a steroid
  // treat it, and it rules out the drugs that tighten the airways
  problems: ['asthma', 'bronchospasm'],
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
      ? `Sinus tachycardia ${s.rhythm.hr}: a normal P wave before every QRS, normal intervals, no ST elevation or depression — nothing to suggest a coronary occlusion caused the arrest. The fast rate is her response to the arrest${has(s, 'epi') ? ', the epinephrine' : ''} and the low pressure.`
      : 'No 12-lead during CPR.'),
  },
  status: (s) => {
    // a reassessment is not a CPR cycle (only those bring her back), so it must not say that compressions go on
    if (!s.pulse) return has(s, 'cpr') ? 'Unresponsive, no pulse.' : 'Unresponsive, no pulse; her husband is still doing compressions.';
    return ventedAfterRosc(s) !== null ? `Unresponsive; ventilated at ${s.vitals.rr}/min.` : `Unresponsive, breathing only ${s.vitals.rr} times a minute on her own.`;
  },
  respond: {
    // Ventilation is what brings her back: the cycle that ends with enough oxygen-carrying CPR behind it gives ROSC.
    // Compressions alone (the default line) keep a little blood moving, but carry no oxygen to the heart.
    cpr: (s) => {
      // she is unresponsive, so she cannot cry out as the default says: the partner stops it
      if (s.pulse) return { say: [['partner', 'Stop — she has a pulse now. No compressions on a beating heart.', 'bad']] };
      if (!has(s, 'ventilated')) return null;
      if (cyclesSince(s, 'ventilated') + 1 >= cyclesNeeded(s)) return rosc(s);
      // Oxygen is reaching the heart: complexes come back on a flat screen, or come faster — still no pulse. The line
      // does not report a pulse check: organized complexes call for one, and that is the learner's to do.
      const flat = s.rhythm.profile === 'asystole';
      return {
        say: [['you', 'Two minutes of compressions with 2 breaths of oxygen after every 30.'], ...(flat && ecgOn(s) ? [line('monitor', 'Monitor alarm.')] : [])],
        rhythm: { profile: 'pea', hr: flat ? 30 : Math.max(s.rhythm.hr, 52) }, vitals: { etco2: CPR_ETCO2 }, flags: ['cpr'],
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
    // her heart is slow because it is starved of oxygen, not because of the vagus (and the default would speed a "sinus" rate);
    // after ROSC, blocking the vagus speeds a heart that is already fast
    atropine: (s) => {
      if (!s.pulse) return { say: [['you', 'Atropine 1 mg IV — no change on the monitor.']], flags: ['atropine'] };
      const hr = Math.min(150, s.rhythm.hr + 10);
      return { say: [['monitor', `Heart rate ${hr}.`]], rhythm: { ...s.rhythm, hr }, flags: ['atropine'] };
    },
    adenosine6: (s) => (s.pulse ? null : noRoleInArrest('Adenosine', 'adenosine')),
    adenosine12: (s) => (s.pulse ? null : noRoleInArrest('Adenosine', 'adenosine')),
    // with a pulse it is absorbed: the rate and the pressure rise a little — and it is still the wrong drug for her
    'epi-im': (s) => {
      if (!s.pulse) return { say: [['you', 'Epinephrine 0.5 mg IM in the thigh — a muscle barely absorbs it during CPR, and it is not the arrest dose.']], flags: ['epi-im'] };
      const bp = bpAfter(s, 8, 4);
      const hr = Math.min(150, s.rhythm.hr + 6);
      return { say: [['you', 'Epinephrine 0.5 mg IM in the thigh.'], ['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`]], vitals: bp, rhythm: { ...s.rhythm, hr }, flags: ['epi-im'] };
    },
    // the drugs that slow or convert a rhythm, given after ROSC: they weaken the squeeze and widen the vessels
    'amio-infusion': (s) => {
      if (!s.pulse) return { say: [['you', 'Amiodarone 150 mg infusion started — it has no place in her arrest, and nothing changes on the monitor.']], flags: ['amiodarone'] };
      const bp = bpAfter(s, -10, -6);
      return { say: [['you', 'Amiodarone 150 mg running over 10 minutes.'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`, 'bad']], vitals: bp, flags: ['amiodarone'] };
    },
    'amio-arrest': (s) => {
      if (!s.pulse) return null;
      const bp = bpAfter(s, -16, -10);
      return { say: [['you', 'Amiodarone 300 mg pushed.'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`, 'bad']], vitals: bp, flags: ['amiodarone'] };
    },
    // the arrest dose with a pulse: a surge that passes in minutes (the built-in rule scores it). No numbers, because the
    // monitor's own rate and pressure are back where they were by the time the next action ends.
    epinephrine: (s) => (s.pulse
      ? { say: [['you', 'Epinephrine 1 mg IV, flushed.'], ['monitor', 'The heart races and the pressure surges for a few minutes, with runs of extra beats — then it settles back.', 'bad']], flags: ['epi-with-pulse'] }
      : null),
    // she is unresponsive: the monitor shows what nitroglycerin does to her pressure (the default has the patient speak)
    nitro: (s) => {
      if (!s.pulse) return null;
      const bp = bpAfter(s, -10, -6);
      return { say: [['monitor', `BP ${bp.sbp}/${bp.dbp}.`, 'bad']], vitals: bp, flags: ['nitro'] };
    },
    'nitro-high': (s) => {
      if (!s.pulse) return null;
      const bp = bpAfter(s, -20, -10);
      return { say: [['monitor', `BP ${bp.sbp}/${bp.dbp}.`, 'bad']], vitals: bp, flags: ['nitro', 'nitro-high'] };
    },
    // no pain or agitation to treat in someone with a GCS of 3: they only slow her breathing and lower her pressure
    fentanyl: (s) => {
      if (!s.pulse) return { blocked: true, say: [['system', 'She is in cardiac arrest: there is no pain to treat, and fentanyl is no arrest drug.']] };
      const bp = bpAfter(s, -6, -4);
      return { say: [['you', 'Fentanyl 50 mcg IV — she shows no sign of pain.'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`, 'bad']], vitals: bp, flags: ['opioid'] };
    },
    sedation: (s) => {
      if (!s.pulse) return { blocked: true, say: [['system', 'She is in cardiac arrest: there is nothing to sedate.']] };
      const bp = bpAfter(s, -10, -6);
      return { say: [['you', 'Sedation given — to a patient with a GCS of 3.'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`, 'bad']], vitals: bp, flags: ['sedation'] };
    },
    // 10–20 mcg is for a low pressure with a pulse: in the arrest it is a tiny fraction of the dose, and does not count as it
    'push-epi': (s) => {
      if (!s.pulse) return { say: [['you', 'Push-dose epinephrine, 10–20 mcg — a dose for a low pressure with a pulse. In cardiac arrest the dose is 1 mg.', 'warn']], flags: ['push-epi'] };
      const bp = { sbp: Math.max(s.vitals.sbp, 100), dbp: Math.max(s.vitals.dbp, 62) };
      return { say: [['monitor', `BP ${bp.sbp}/${bp.dbp} for a few minutes.`]], vitals: bp, flags: ['push-epi'] };
    },
    // no 12-lead of any kind during CPR (the default would read the right-sided and posterior leads in the arrest)
    'ecg-right': (s) => (s.pulse ? null : { blocked: true, say: [['system', 'No 12-lead in cardiac arrest: treat the rhythm on the monitor.']] }),
    'ecg-posterior': (s) => (s.pulse ? null : { blocked: true, say: [['system', 'No 12-lead in cardiac arrest: treat the rhythm on the monitor.']] }),
    vagal: (s) => (unresponsive(s) ? { blocked: true, say: [['system', 'A vagal maneuver needs an awake patient who can bear down.']] } : null),
    // "help" means something different to each crew: the EMT's real call is the paramedic intercept, and nothing arrives
    // on a vague request (the default promises help that never comes)
    'call-help': (s) => ({
      say: [['dispatch', s.role === 1
        ? '"Copy. What do you need — a paramedic (ALS) intercept?"'
        : '"Copy. The nearest engine company is committed on another call: it is your crew and her husband for now."']],
      flags: ['help'],
    }),
    iv: () => ({ say: [['you', 'IV on the first attempt: 18 G in the left antecubital vein, flushed and running.']], flags: ['iv'] }),
    // the Hs and Ts against what the crew knows about her
    'hs-ts': (s) => ({
      say: [['you', `Hs and Ts against what you know. Hypoxia: three days of worsening COPD, blue lips, gasping before she went quiet, and only compressions since — the likeliest cause${has(s, 'ventilated') ? ', and the bag is treating it' : ': she needs breaths with oxygen now'}. Hypovolemia: no bleeding, no vomiting. Hydrogen ion: the CO₂ she could not breathe off and the acid that hypoxia makes — breaths treat both. Potassium: no kidney disease. Hypothermia: she is warm. Tension pneumothorax: possible with emphysema — listen for equal breath sounds as she is bagged. Tamponade: nothing to suggest it. Toxins: only her inhalers and prednisone. Thrombosis: a clot in the lungs or the heart is possible, but the story is her breathing.`]],
      flags: ['hs-ts'],
    }),
    // Medical control will not end a witnessed arrest whose likely cause has not been treated, and not on EtCO₂ alone.
    // A call can be repeated: the call back it asks for (20 minutes of ALS, from the paramedic's arrival at minute 0)
    // gets its own answer, never the same instruction again
    'med-control': (s) => {
      if (s.pulse) return null;
      const cause = has(s, 'ventilated') ? 'is only now being treated' : 'has not been treated yet';
      if (!interpret(s)) {
        const medics = has(s, 'als-here') ? ', with the paramedics running the drugs' : has(s, 'als') ? ' until the paramedics take over' : '. And get a paramedic intercept on the way: she needs epinephrine';
        return {
          say: [['hospital', `Medical control: keep going. She was witnessed, she had bystander CPR, and the likely cause, her breathing, ${cause}: ventilate her with oxygen and keep compressions going${medics}.`]],
          flags: ['med-control'],
        };
      }
      if (s.minute >= ALS_CALL_BACK) {
        return {
          say: [['hospital', `Medical control: 20 minutes of ALS and still no ROSC — and I am still not stopping this one. She was witnessed, she had bystander CPR, and the likely cause, her breathing, ${has(s, 'ventilated') ? 'is being treated — and the oxygen reaches her heart only while the compressions go on' : 'has still not been treated: ventilate her with oxygen now'}. A low EtCO₂ alone is never a reason to stop. Keep going: compressions, breaths with oxygen in slow squeezes that let each breath out — check for equal breath sounds on both sides — and epinephrine every 3 to 5 minutes.`]],
          flags: ['med-control'],
        };
      }
      return {
        say: [['hospital', `Medical control: keep going — this is not one to stop. She was witnessed, she had bystander CPR, and the likely cause, her breathing, ${cause}. ${has(s, 'ventilated') ? '' : 'An EtCO₂ taken before anyone ventilates her measures nothing, and even later, '}never stop on EtCO₂ alone. Breaths with oxygen, epinephrine every 3 to 5 minutes, and call back if there is still no ROSC after 20 minutes of ALS.`]],
        flags: ['med-control'],
      };
    },
    // the physician reads the 12-lead the crew describes and stands the cath lab down: there is no ST elevation
    'stemi-alert': (s) => (s.pulse && has(s, 'ecg12')
      ? { say: [['hospital', 'The interventional cardiologist reviews your 12-lead: no ST elevation — the cath lab is not activated. Bring her to the emergency department.']], flags: ['alert-declined'] }
      : null),
    // arriving in the arrest: the resuscitation team takes over the CPR, and her care is no longer the crew's (the review
    // scores a hand-over without ROSC as it scores a death)
    handoff: (s) => (!s.pulse && has(s, 'arrived')
      ? { say: [['you', 'Hand-off to the resuscitation team: CPR continues in the emergency department.']], flags: ['handoff'], end: 'complete' }
      : null),
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
        // IV first, as the case teaches (2025 AHA): the intercept crew gets one on the first try
        if (s.pulse) return { say: [['team', 'The paramedics arrive and take over the drugs: an IV in her arm, ready for her blood pressure.']], flags: ['iv', 'als-here'] };
        const lines: Line[] = [['team', 'The paramedics arrive and take over the drugs: an IV in her arm, epinephrine 1 mg in. "Keep the compressions and the bag going — the breaths are yours."']];
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
      why: 'After ROSC keep SpO₂ 90–98 % and a PaCO₂ of 35–45 mmHg (2025 AHA), starting at 1 breath every 6 seconds: unresponsive and breathing 6 a minute, she needs her breaths assisted — through the airway if one is in. In the field EtCO₂ is the guide; with COPD it reads lower than the PaCO₂.',
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
      // a crew that loaded her during the arrest (a harm) is transporting her from the moment of ROSC, not before it
      done: (s) => (s.flags.enroute === undefined || s.flags.rosc === undefined ? null : Math.max(s.flags.enroute, s.flags.rosc)),
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
      // the bag and the airway go on during compressions, so "before the next cycle", not "with no compressions in between"
      id: 'long-pause', actions: ['pulse-check'], when: (s) => !s.pulse && checksSinceCpr(s, 'pulse-check') >= 1, points: 5, severity: 'major',
      text: 'A second pulse check before the next 2 minutes of CPR. Every check is a pause in the blood flow CPR makes: check the pulse in 10 seconds or less at the 2-minute rhythm check, then straight back on the chest.',
    },
    {
      id: 'long-pause-aed', actions: ['aed'], when: (s) => !s.pulse && checksSinceCpr(s, 'aed') >= 1, points: 5, severity: 'major',
      text: 'A second AED analysis before the next 2 minutes of CPR. Every analysis is a pause: when the AED advises no shock, start compressions at once and let it analyze again after 2 minutes of CPR.',
    },
    {
      // the learner's own doses; for the EMT the medics give it, on time
      id: 'epi-too-soon', actions: ['epinephrine'], when: (s) => !s.pulse && (sinceLastEpi(s) ?? Infinity) < 3, points: 3, severity: 'minor',
      text: 'Epinephrine again less than 3 minutes after the last dose. The interval is 3–5 minutes: stacked doses add up to high-dose epinephrine, which brings no benefit (2025 AHA) and drives up the oxygen demand of a heart that is already starved of it.',
    },
    {
      id: 'transport-in-arrest', actions: ['transport-near', 'transport-pci'], when: (s) => !s.pulse, points: 6, severity: 'major',
      text: 'Loading her for transport while she is in cardiac arrest. Compressions on a stretcher and in a moving ambulance are poorer and keep being interrupted, and everything she needs — breaths with oxygen, epinephrine and CPR — works right here. Work the arrest on scene and transport after ROSC.',
    },
    {
      // in the arrest, and after ROSC on a heart that is already fast: one rule, so one mistake costs once
      id: 'atropine-no-indication', actions: ['atropine'], when: (s) => !s.pulse || s.rhythm.hr >= 60, points: 3, severity: 'minor', replaces: ['atropine-fast', 'atropine-in-arrest'],
      text: 'Atropine with no slow pulse to treat. It has not been part of the cardiac arrest algorithm since 2010: the slow complexes of her PEA came from a heart starved of oxygen, not from the vagus — CPR, epinephrine and breaths with oxygen treat it. After ROSC her heart is already fast, and atropine only makes it faster.',
    },
    {
      // one rule for all of them, in its own words; it stands in for the built-in procainamide-in-arrest rule
      id: 'antiarrhythmic-pea', actions: ['amio-arrest', 'amio-infusion', 'lidocaine', 'adenosine6', 'adenosine12', 'procainamide', 'metoprolol', 'diltiazem'],
      when: (s) => !s.pulse, points: 3, severity: 'minor', replaces: ['procainamide-in-arrest'],
      text: 'A rate or rhythm drug in PEA. Amiodarone and lidocaine are for VF or pulseless VT that shocks have not fixed; adenosine, procainamide, beta-blockers and diltiazem are for tachycardias with a pulse: in PEA they treat nothing. CPR, epinephrine and the cause.',
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
      // in the arrest and after it: she never has anaphylaxis
      id: 'epi-im-no-anaphylaxis', actions: ['epi-im'], points: 3, severity: 'minor',
      text: 'IM epinephrine without anaphylaxis. In the arrest nothing carries it out of the muscle, and 0.3–0.5 mg is the anaphylaxis dose: epinephrine for an arrest is 1 mg IV/IO, from ALS. After ROSC her low pressure is the after-effect of the arrest, not anaphylaxis: it is treated with fluid and a vasopressor.',
    },
    {
      // procainamide included: its built-in rule only fires while the systolic is under 90, and after a bolus it may not be
      id: 'rate-control-post-rosc', actions: ['metoprolol', 'diltiazem', 'amio-infusion', 'procainamide'], when: (s) => s.pulse, points: 8, severity: 'major',
      replaces: ['procainamide-hypotension'],
      text: 'A drug to slow or convert her rhythm after ROSC. Her fast rate is the body\'s answer to the arrest, the epinephrine and a low pressure — there is no arrhythmia to treat: beta-blockers, diltiazem, amiodarone and procainamide drop a pressure that is barely held up, and can bring the arrest back.',
    },
    {
      id: 'antiarrhythmic-post-rosc', actions: ['adenosine6', 'adenosine12', 'lidocaine'], when: (s) => s.pulse, points: 3, severity: 'minor',
      text: 'Adenosine or lidocaine after ROSC. Her fast rate is the body\'s answer to the arrest, not an arrhythmia: adenosine only stops a rhythm whose circuit runs through the AV node, and hers does not; lidocaine treats nothing after an arrest that was never VF.',
    },
    {
      // the default nitroglycerin rule only fires under a systolic of 90: after a bolus she has no reason for it either
      id: 'nitro-post-rosc', actions: ['nitro', 'nitro-high'], when: (s) => s.pulse, points: 8, severity: 'major', replaces: ['nitro-hypotension', 'nitro-high-not-hypertensive'],
      text: 'Nitroglycerin after ROSC. She has no chest pain and no ST elevation, and her pressure is low or only just held up by treatment: nitrates drop it further.',
    },
    {
      id: 'sedation-unresponsive', actions: ['fentanyl', 'sedation', 'midazolam'], replaces: ['midazolam-unsafe'], when: (s) => s.pulse, points: 5, severity: 'major',
      text: 'Fentanyl or sedation for a patient who is unresponsive. With a GCS of 3 she shows no pain or agitation to treat: an opioid or a sedative slows the breathing she has left and lowers her pressure.',
    },
    {
      id: 'glucagon-no-indication', actions: ['glucagon'], points: 3, severity: 'minor',
      text: 'Glucagon without a beta- or calcium-channel-blocker overdose. It treats nothing she has, and the vomiting it brings is dangerous in a patient who cannot protect her airway.',
    },
    {
      id: 'stemi-alert-no-ste', actions: ['stemi-alert'], when: (s) => s.pulse, points: 3, severity: 'minor',
      text: 'A STEMI alert without ST elevation. Her 12-lead after ROSC shows none, and her arrest began with her breathing: it calls in the cath lab team for an artery that is not blocked.',
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
    'After ROSC (2025 AHA): 100 % oxygen until the SpO₂ can be measured reliably, then titrate to SpO₂ 90–98 %; ventilate to a PaCO₂ of 35–45 mmHg, starting at 1 breath every 6 seconds — in the field EtCO₂ is the guide, though with COPD it reads lower than the PaCO₂; keep the breaths slow, since fast bagging traps air; keep MAP ≥ 65 mmHg with fluid and a vasopressor; record a 12-lead (ST elevation → emergent coronary angiography); check the glucose. A patient who does not follow commands needs temperature control in hospital (32–37.5 °C for at least 36 hours).',
  ],
};
