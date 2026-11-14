/**
 * Scenario engine: pure, deterministic state transitions for the simulator.
 *
 *   start(scenario, role) → state
 *   perform(scenario, state, interventionId) → new state   (time passes, patient responds, events fire)
 *   stop(scenario, state) → ended state
 *   review(scenario, state) → score, timings, what went well, what to fix
 *
 * Each intervention has a default response here; a scenario overrides the ones that matter for its
 * patient (scenario.respond). Built-in safety rules (rules/) apply to every scenario on top of the scenario's
 * own harms; the drug rules also read what the case says the patient has (scenario.problems: high
 * potassium, an overdose, heart failure, a long QT). The scenario ends by itself once every critical
 * intervention for the learner's role is done and the patient has a pulse (plus any scenario-specific condition).
 *
 * Three settings (Scenario.setting): the field (a hand-off waits for arrival at the hospital), the emergency department
 * (the arrest is run there, and a hand-off waits for a disposition: the flag 'dispo', set by activating the cath lab,
 * admitting or transferring — or by a case event when the computer physician decides) and the cath lab (the hand-off
 * waits for the end of the procedure). In the department the built-in rules also hold the ER nurse to the physician's
 * orders (RN_ORDER_ONLY) and the ER doctor's procedures to their indications (see edKit).
 */
import type { LearningLevel } from '@/store/useAppStore';
import { resolveProfile, stLevel } from '@/lib/ecg/profiles';
import { INTERVENTION_BY_ID, detailFor, interventionsFor } from './interventions';
import { READ_KIND_NAME, READ_OPTION_BY_ID, answerFor, partialFor } from './reads';
import { angioGate } from './labKit';
import { LVAD_MIN_PULSE_PRESSURE, PERFUSING_FLOOR, arrestEtco2, atRate, bpAfter, canSwallow, mapOf, paced, ventilated } from './kit';
import type {
  Critical, Effect, FactKey, Harm, Intervention, Line, PendingRead, Problem, Review, ReviewItem, Scenario, SimState, Speaker, Tone,
} from './types';
import { BUILT_IN_HARMS } from './rules';
import { INDICATION_RULES, RN_ORDER_ONLY, rnWithoutOrderId } from './rules/scope';
import {
  did, ecgShowsStemi, hasProblem, lowPressure, lvadPerfusing, preexcitedAf, profileShowsStemi, rhythmKind, shockable, slowOrBlocked,
  tachyarrhythmia,
} from './rules/helpers';

const round = (m: number) => Math.round(m * 10) / 10;
const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
export const clockText = (minute: number) => {
  const total = Math.round(minute * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

// ─── State helpers ─────────────────────────────────────────────────────────

// these live with the built-in safety rules (rules/helpers.ts), which never import the engine; re-exported for the callers
export { did, lowPressure, lvadPerfusing, rhythmKind, shockable, tachyarrhythmia };

export const has = (s: SimState, flag: string) => flag in s.flags;
export const bpText = (s: SimState) => `${s.vitals.sbp}/${s.vitals.dbp}`;

function say(s: SimState, who: Speaker, text: string, tone?: Tone) {
  s.log.push({ minute: s.minute, who, text, ...(tone ? { tone } : {}) });
}

function setFlag(s: SimState, flag: string) {
  if (!(flag in s.flags)) s.flags[flag] = s.minute;
}

function factText(sc: Scenario, s: SimState, key: FactKey): string | null {
  const f = sc.facts[key];
  if (f === undefined) return null;
  return typeof f === 'function' ? f(s) : f;
}

export function vitalsLine(s: SimState): string {
  if (!s.pulse) return 'No pulse. Not breathing normally.';
  const v = s.vitals;
  if (s.lvad) {
    // a continuous-flow pump: no pulse to count and no cuff pressure — the rate comes off the monitor, the pressure from
    // the Doppler once the crew has one on the arm
    const parts = ['No palpable pulse'];
    if (has(s, 'monitor')) parts.push(`heart rate ${s.rhythm.hr} on the monitor`);
    if (has(s, 'doppler')) parts.push(`Doppler MAP ${mapOf(v)}`);
    return `${parts.join(' · ')} · RR ${v.rr} · SpO₂ ${v.spo2}%`;
  }
  return `BP ${v.sbp}/${v.dbp} · pulse ${s.rhythm.hr} · RR ${v.rr} · SpO₂ ${v.spo2}%`;
}

/** The monitor shows the trace and the numbers; reading the rhythm is the learner's job */
function monitorLine(s: SimState): string {
  if (s.role === 1) return `Monitor on: heart rate ${s.pulse ? s.rhythm.hr : '—'}. Interpreting the rhythm is outside EMT scope — acquire and transmit a 12-lead.`;
  return s.pulse ? `Monitor attached: heart rate ${s.rhythm.hr}.` : 'Monitor attached.';
}

function ecgLine(s: SimState, repeat: boolean): string {
  if (s.role === 1) return `12-lead ${repeat ? 're-' : ''}acquired. You can't interpret it — transmit it to the hospital.`;
  return `12-lead ${repeat ? 're-' : ''}acquired.`;
}

/** What the 12-lead shows, in words: the explanation the feedback gives after your read */
function ecgExplanation(sc: Scenario, s: SimState, profile: string): string {
  const fact = factText(sc, s, 'ecg12');
  if (fact) return fact;
  const p = resolveProfile(profile);
  return `${p.headline}: ${p.findings.slice(0, 2).join('; ')}.`;
}

// ─── Default responses ─────────────────────────────────────────────────────

function defaultEffect(sc: Scenario, s: SimState, id: string): Effect {
  const fact = (k: FactKey) => factText(sc, s, k);
  const v = s.vitals;
  switch (id) {
    case 'ems-handoff': {
      // a patient who walked in has no crew to report
      const report = fact('ems');
      if (!report) return { blocked: true, say: [['system', 'This patient came in on their own: there is no EMS crew to give a report. Take the history from the patient.']] };
      return { say: [['ems', report]], flags: ['ems-report'] };
    }
    case 'triage': {
      const own = fact('triage');
      if (own) return { say: [['you', own]], flags: ['triage'] };
      const esi = triageLevel(s);
      return {
        say: [['you', esi === 1
          ? 'ESI 1: this patient needs a life-saving intervention now — straight to a resuscitation bed, and the physician to the bedside.'
          : 'ESI 2: high risk — a monitored bed now, the physician told, and a 12-lead within 10 minutes of arrival.']],
        flags: ['triage', `esi-${esi}`],
      };
    }
    case 'primary':
      if (s.pulse && s.lvad) return { say: [['you', `Airway open, breathing ${v.rr}/min, no palpable radial or carotid pulse, GCS ${v.gcs}.`]] };
      return s.pulse
        ? { say: [['you', `Airway open, breathing ${v.rr}/min, radial pulse ${s.rhythm.hr}/min, GCS ${v.gcs}.`]] }
        : { say: [['you', 'Unresponsive, not breathing normally, no pulse.', 'bad']] };
    case 'opqrst': return historyAnswer(s, fact('opqrst'), 'It just feels wrong.', 'opqrst');
    case 'sample': return historyAnswer(s, fact('sample'), 'No allergies, no medicines.', 'sample');
    case 'ask-pde5': return historyAnswer(s, fact('pde5'), 'No, nothing like that.', 'pde5-asked');
    case 'vitals':
      // with an LVAD the cuff hears no Korotkoff sounds: no pressure by hand (the Doppler finds the MAP)
      if (s.pulse && s.lvad) return { say: [['you', `No palpable pulse, and no sounds with the cuff: no blood pressure by hand. RR ${v.rr} · SpO₂ ${v.spo2}%.`]] };
      return { say: [['you', vitalsLine(s)]], flags: ['bp'] };
    case 'nibp':
      if (!has(s, 'monitor')) return { blocked: true, say: [['system', 'Attach the monitor first, or take a manual set of vitals.']] };
      // an oscillometric cuff reads the pulsations in the artery: a continuous-flow pump gives it none
      if (s.pulse && s.lvad) return { say: [['monitor', 'NIBP: unable to measure.']] };
      return { say: [['monitor', s.pulse ? `NIBP ${bpText(s)} mmHg.` : 'NIBP: no reading.']], flags: ['bp'] };
    case 'bp-both-arms': {
      if (!s.pulse) return { blocked: true, say: [['system', 'No circulation: there is no blood pressure to take. CPR first.']] };
      const arms = fact('bpArms');
      if (arms) return { say: [['you', arms]], flags: s.lvad ? ['bp-arms'] : ['bp', 'bp-arms'] };
      if (s.lvad) return { say: [['you', 'No sounds with the cuff on either arm: no blood pressure by hand.']], flags: ['bp-arms'] };
      // the same pressure in both arms, within a few mmHg (a case with a difference says so in its own words)
      const left = { sbp: Math.max(PERFUSING_FLOOR.sbp, v.sbp - 4), dbp: Math.max(PERFUSING_FLOOR.dbp, v.dbp - 2) };
      return { say: [['you', `Right arm ${v.sbp}/${v.dbp} · left arm ${left.sbp}/${left.dbp}.`]], flags: ['bp', 'bp-arms'] };
    }
    case 'doppler-map':
      if (!s.pulse) return { say: [['you', 'Doppler over the brachial artery: no flow sound.', 'bad']], flags: ['doppler'] };
      // over a continuous-flow pump the flow sound returns at about the mean pressure; with a pulse, at the systolic
      if (s.lvad) return { say: [['you', `Doppler MAP ${mapOf(v)} mmHg: the whooshing flow sound returns at ${mapOf(v)} as the cuff goes down.`]], flags: ['bp', 'doppler'] };
      return { say: [['you', `Doppler over the brachial artery: the first beat returns at ${v.sbp} mmHg (the systolic pressure).`]], flags: ['bp', 'doppler'] };
    case 'lvad-check':
      if (!s.lvad) return { say: [['you', 'No pump hum over the chest, and no controller, batteries or driveline: this patient has no LVAD.']], flags: ['lvad-check'] };
      return {
        say: [['you', fact('lvad') ?? (s.pulse
          ? 'A steady pump hum over the left chest. Controller: no alarms; both batteries connected and charged; driveline dressing clean and dry.'
          : 'No pump hum over the chest. The controller shows a red pump-stop alarm.')]],
        flags: ['lvad-check'],
      };
    case 'pulse-check':
      // a continuous-flow LVAD perfuses without a pulse: no pulse here is not cardiac arrest
      if (s.pulse && s.lvad) return { say: [['you', v.gcs >= 13 ? 'No palpable pulse — yet the patient is awake and talking to you.' : 'No palpable pulse.', 'warn']] };
      return s.pulse
        ? { say: [['you', `Pulse present: ${s.rhythm.hr}/min${v.sbp < 90 ? ', weak and thready' : ''}.`]] }
        : { say: [['you', 'No pulse.', 'bad']], flags: ['pulseless-confirmed'] };
    case 'lungs': return { say: [['you', fact('lungs') ?? 'Clear and equal on both sides.']], flags: ['lungs'] };
    case 'perfusion': return { say: [['you', fact('perfusion') ?? (s.lvad ? 'Skin warm and dry; no JVD; no pulse to feel at the wrist, the groin or the foot.' : 'Skin warm and dry; no JVD; pulses equal.')]], flags: ['perfusion'] };
    case 'glucose': return { say: [['you', `Blood glucose ${v.glucose} mg/dL.`]] };
    case 'neuro': return { say: [['you', `GCS ${v.gcs}. ${fact('neuro') ?? 'No focal deficit.'}`]] };
    case 'reassess':
      // the line prints the pressure: perform() sets the flag 'bp' after any reassessment, this one or a case's own
      return { say: [['you', vitalsLine(s)], ['patient', sc.status?.(s) ?? (s.pulse ? `Pain ${v.pain}/10.` : 'Unresponsive.')]] };

    case 'monitor': return { say: [['monitor', monitorLine(s)]], flags: ['monitor'] };
    case 'pads': return { say: [['you', 'Pads on: anterior–lateral.']], flags: ['pads', 'monitor'] };
    case 'ecg12':
    case 'ecg12-repeat':
      if (!s.pulse) return noEcgInArrest;
      if (id === 'ecg12-repeat' && !has(s, 'ecg12')) return { blocked: true, say: [['system', 'There is nothing to repeat yet: record a first 12-lead.']] };
      return { say: [['monitor', ecgLine(s, id === 'ecg12-repeat')]], flags: id === 'ecg12' ? ['ecg12', 'monitor'] : ['ecg12', 'monitor', 'ecg12-repeat'] };
    case 'ecg-transmit':
      if (!has(s, 'ecg12')) return { blocked: true, say: [['system', 'Acquire a 12-lead first.']] };
      return { say: [['hospital', 'ECG received; the physician is reviewing it.']], flags: ['transmitted'] };
    // extra leads are a 12-lead too: none during CPR
    case 'ecg-right':
      if (!s.pulse) return noEcgInArrest;
      return { say: [['monitor', fact('ecgRight') ?? 'V4R: no ST elevation.']], flags: ['ecg-right'] };
    case 'ecg-posterior':
      if (!s.pulse) return noEcgInArrest;
      return { say: [['monitor', fact('ecgPosterior') ?? posteriorLeads(s)]], flags: ['ecg-posterior'] };
    case 'capno': {
      if (s.pulse) return { say: [['monitor', `EtCO₂ ${v.etco2} mmHg with a normal square waveform.`]], flags: ['capno'] };
      // the shared arrest rule, which the case monitor shows too: almost nothing with no breaths, then the blood flow
      const etco2 = arrestEtco2(s);
      return { say: [['monitor', ventilated(s) ? `EtCO₂ ${etco2} mmHg.` : `EtCO₂ ${etco2} mmHg: almost no waveform.`]], flags: ['capno'] };
    }
    case 'transducer': return { say: [['you', 'Transducers zeroed to air and leveled at the phlebostatic axis.']], flags: ['transducer'] };
    case 'labs': return { say: [['team', fact('labs') ?? 'Labs sent: troponin, electrolytes, CBC, coagulation.']], flags: ['labs'] };
    case 'troponin-repeat':
      // the second of the serial high-sensitivity troponins: the change from the first decides as much as either value
      if (!has(s, 'labs') && !did(s, 'labs')) return { blocked: true, say: [['system', 'There is nothing to repeat yet: draw the first set of labs (with the first troponin).']] };
      return { say: [['team', fact('troponin') ?? 'Repeat high-sensitivity troponin drawn and sent; the result is back within the hour.']], flags: ['troponin-repeat'] };
    case 'act': return { say: [['team', has(s, 'heparin') ? 'ACT 286 s: therapeutic for PCI.' : 'ACT 128 s: no heparin effect yet.']], flags: ['act'] };
    case 'echo': return { say: [['you', fact('echo') ?? 'Normal biventricular function; no effusion.']], flags: ['echo'] };
    case 'lvedp':
      if (!has(s, 'access')) return s.role === 5 ? noAccess : noCatheter;
      return { say: [['monitor', fact('lvedp') ?? 'LV 128/10, LVEDP 10 mmHg.']], flags: ['lvedp'] };
    case 'rhc':
      if (!has(s, 'venous')) return { blocked: true, say: [['system', s.role === 5 ? 'A right heart run needs venous access first.' : 'No venous sheath in yet.']] };
      return { say: [['monitor', fact('rhc') ?? 'RA 6 · RV 26/6 · PA 26/10 (mean 16) · PCWP 10 · CO 5.2 L/min, CI 2.8.']], flags: ['rhc'] };

    case 'o2-nc': {
      const spo2 = Math.min(97, v.spo2 + (v.spo2 < 94 ? 4 : 1));
      return { say: [['monitor', `Nasal cannula on. SpO₂ ${spo2}%.`]], vitals: { spo2 }, flags: ['o2'] };
    }
    case 'o2-nrb': {
      const spo2 = Math.min(100, v.spo2 + 5);
      return { say: [['monitor', `Non-rebreather at 15 L/min. SpO₂ ${spo2}%.`]], vitals: { spo2 }, flags: ['o2'] };
    }
    case 'bvm':
      if (s.pulse && v.gcs > 8) return { say: [['patient', 'The patient pushes the mask away: they are breathing on their own.']] };
      // in arrest (2025 AHA): 30:2 with a bag-mask; 1 breath every 6 seconds only through an advanced airway, with
      // continuous compressions. With a pulse (rescue breathing): 1 breath every 6 seconds
      if (!s.pulse) {
        return {
          say: [['you', has(s, 'airway')
            ? 'Ventilating through the airway, 1 breath every 6 seconds; chest rising.'
            : 'Bag-mask with oxygen: 2 breaths, each over 1 second, after every 30 compressions; chest rising.']],
          flags: ['ventilated'],
        };
      }
      return { say: [['you', 'Ventilating 1 breath every 6 seconds; chest rising.']], flags: ['ventilated'] };
    case 'cpap':
      // a mask that pushes air in helps only a patient who breathes on their own and can guard the airway
      if (!s.pulse) return { blocked: true, say: [['system', 'Not in cardiac arrest: CPAP needs a patient who breathes on their own. Ventilate with the bag-mask.']] };
      if (v.gcs <= 8) return { blocked: true, say: [['system', 'Not with a GCS of 8 or less: CPAP needs a patient awake enough to breathe on their own and protect the airway. Ventilate with the bag-mask instead.']] };
      return { say: [['you', 'CPAP applied at 5 cmH₂O.']], flags: ['cpap'] };
    case 'rsi': {
      // drugs to take the airway of a patient who still has a pulse; in an arrest the advanced airway needs none
      if (!s.pulse) return { blocked: true, say: [['system', 'Not in cardiac arrest: no induction drug or paralytic is needed. Place the advanced airway (or keep bagging) without stopping compressions.']] };
      // induction and positive pressure drop the pressure; the oxygen comes up on the ventilator; sedated and paralyzed
      const bp = bpAfter(s, -14, -8);
      const spo2 = Math.min(99, v.spo2 + 6);
      return {
        say: [['you', 'Preoxygenated; induction drug and paralytic pushed; tube through the cords on the first pass, confirmed with waveform capnography; on the ventilator.'], ...bpLine(s, bp)],
        vitals: { ...bp, spo2: Math.max(v.spo2, spo2), rr: 16, gcs: 3 }, flags: ['airway', 'ventilated', 'sedation', 'rsi'],
      };
    }
    case 'airway':
      // an awake patient gags on any airway device and protects their own airway: it cannot be placed
      if (s.pulse && v.gcs > 8) return { say: [['patient', 'The patient gags, coughs and pushes it away: someone this awake protects their own airway. The airway comes out.', 'bad']] };
      return { say: [['you', 'Airway placed; confirmed with waveform capnography.']], flags: ['airway', 'ventilated'] };

    case 'iv': return { say: [['you', 'IV established: 18 G, left forearm.']], flags: ['iv'] };
    case 'io': return { say: [['you', 'IO established: proximal humerus.']], flags: ['iv'] };
    case 'central-line':
      // an introducer sheath: vascular access for drugs and pressors (its side port), and the way in for a transvenous
      // pacing wire — which goes through a sheath, not through the lumens of a multi-lumen catheter
      return {
        say: [['you', s.pulse
          ? 'Right internal jugular introducer sheath (6 Fr, with a side port) placed under ultrasound, full sterile barrier: dark venous blood back, flushed and secured; the tip still to be confirmed (chest film or ultrasound).'
          : 'Femoral venous introducer sheath placed under ultrasound while the compressions go on; flushed and secured.']],
        flags: ['central', 'venous', 'iv'],
      };
    case 'fluid': {
      if (!s.pulse) return { say: [['you', 'Fluid running.']], flags: ['fluid'] };
      const bp = bpAfter(s, 8, 5);
      return { say: bpLine(s, bp, 'Bolus in.'), vitals: bp, flags: ['fluid'] };
    }
    case 'transfuse': {
      if (!s.pulse) return { say: [['you', 'Packed red cells running in fast; compressions go on.']], flags: ['transfused'] };
      const bp = bpAfter(s, 10, 6);
      return { say: [['you', `Unit ${(s.counts.transfuse ?? 0) + 1} of packed red cells checked at the bedside and running through the warmer.`], ...bpLine(s, bp)], vitals: bp, flags: ['transfused'] };
    }
    case 'legs-up': {
      if (!s.pulse) return { blocked: true, say: [['system', 'Not in cardiac arrest: compressions move the blood, not the position of the legs.']] };
      // about 300 mL of blood comes back from the legs for a few minutes
      const bp = bpAfter(s, 8, 4);
      return { say: [['you', 'Lying flat with the legs raised.'], ...bpLine(s, bp)], vitals: bp, flags: ['legs-up'] };
    }

    case 'aspirin':
    case 'p2y12': {
      // by mouth: only for a patient awake enough to chew and swallow (the P2Y12 inhibitor the lab gives IV is cangrelor)
      const what = id === 'aspirin' ? 'Aspirin' : 'The P2Y12 loading dose';
      if (!s.pulse) return { blocked: true, say: [['system', `Not in cardiac arrest: ${what.charAt(0).toLowerCase()}${what.slice(1)} goes by mouth, and nothing goes in the mouth of a patient who cannot swallow.`]] };
      if (!canSwallow(s)) return { blocked: true, say: [['system', `${what} goes by mouth, and this patient is too drowsy to swallow safely (it could be inhaled): nothing by mouth until they are awake enough.`]] };
      return id === 'aspirin' ? { say: [['patient', 'Chews the aspirin.']], flags: ['aspirin'] } : { say: [['you', 'P2Y12 loading dose given.']], flags: ['p2y12'] };
    }
    case 'nitro-assist':
      if (!fact('ownNitro')) return { blocked: true, say: [['patient', "I don't have any nitroglycerin of my own."]] };
      return nitroEffect(s);
    case 'nitro': return nitroEffect(s);
    case 'nitro-high': return nitroEffect(s, true);
    case 'fentanyl': {
      // no flag 'analgesia' in arrest: nothing was relieved, and it must not count as analgesia for a later shock
      if (!s.pulse) return noRoleInArrest('Fentanyl', 'fentanyl');
      const pain = Math.max(0, v.pain - 3);
      // an opioid slows the breathing a little (not below 10 on this dose); it never speeds a slow one
      const rr = Math.min(v.rr, Math.max(10, v.rr - 1));
      const feels = v.pain === 0 ? '"I feel a bit floaty."' : pain <= 3 ? '"That takes the edge off."' : '"Still hurts, but a bit less."';
      return { say: [['you', 'Fentanyl IV given.'], ...ifAwake(s, feels)], vitals: { pain, rr }, flags: ['analgesia'] };
    }
    case 'heparin': return { say: [['you', 'Heparin bolus given (weight-based).']], flags: ['heparin'] };
    case 'metoprolol': {
      if (!s.pulse) return noRoleInArrest('Metoprolol', 'beta-blocker');
      const bp = bpAfter(s, -12, -8);
      if (preexcitedAf(s)) return { say: [...bpLine(s, bp, 'Metoprolol given.'), pathwayFaster], vitals: bp, rhythm: fasterDownPathway(s), flags: ['beta-blocker'] };
      // a pacer sets the rate, so only the heart's own rate slows — by 10, not below 40, and never up to 40 from a slower one
      const hr = Math.min(s.rhythm.hr, Math.max(40, s.rhythm.hr - 10));
      return { say: bpLine(s, bp, 'Metoprolol given.'), vitals: bp, ...(paced(s) ? {} : { rhythm: atRate(s, hr) }), flags: ['beta-blocker'] };
    }
    case 'atropine': {
      if (!s.pulse) return noRoleInArrest('Atropine', 'atropine');
      // it blocks the vagus at the sinus node: a slow sinus rate comes up to 74, a faster one climbs a little. A rhythm
      // the vagus does not hold down (a block below the node, a high potassium) is the case's to answer
      if (sinusNode(s) && s.rhythm.hr < 60) return { say: [['monitor', 'Heart rate rises to 74.']], rhythm: atRate(s, 74), flags: ['atropine'] };
      const hr = sinusFaster(s, 10, 150);
      if (hr) return { say: [['monitor', `Heart rate ${hr}.`]], rhythm: atRate(s, hr), flags: ['atropine'] };
      return { say: [['monitor', 'No change in heart rate.']], flags: ['atropine'] };
    }
    case 'adenosine6':
    case 'adenosine12':
      // down an accessory pathway there is no AV-nodal pause to see: the node's share of the impulses goes to the pathway
      if (preexcitedAf(s)) return { say: [['you', `Adenosine ${id === 'adenosine6' ? 6 : 12} mg rapid push, flushed.`], ['monitor', 'No pause at all. The complexes come faster and wider.', 'bad']], rhythm: fasterDownPathway(s), flags: ['adenosine'] };
      return { say: [['monitor', 'A brief pause, then the same rhythm returns.']], flags: ['adenosine'] };
    case 'diltiazem': {
      if (!s.pulse) return noRoleInArrest('Diltiazem', 'diltiazem');
      const bp = bpAfter(s, -12, -8);
      if (preexcitedAf(s)) return { say: [...bpLine(s, bp, 'Diltiazem in.'), pathwayFaster], vitals: bp, rhythm: fasterDownPathway(s), flags: ['diltiazem'] };
      return { say: bpLine(s, bp, 'Diltiazem in.'), vitals: bp, flags: ['diltiazem'] };
    }
    case 'epinephrine': {
      if (!s.pulse) return { say: [['you', 'Epinephrine 1 mg IV/IO, flushed.']], flags: ['epi'] };
      // the arrest dose with a pulse (the built-in rule scores it): a surge of rate and pressure that passes in a few
      // minutes. In words only: written into the vitals it would last for the rest of the case and "treat" a low pressure
      // that needs fluid or an infusion. Its own flag, so a case never counts it as the arrest epinephrine
      return {
        say: [
          ['you', 'Epinephrine 1 mg IV, flushed.'],
          ['monitor', 'The heart races and the pressure surges, with runs of extra beats — for a few minutes, then it settles back where it was.', 'bad'],
          ...ifAwake(s, '"My heart is pounding — and my head is splitting!"'),
        ],
        flags: ['epi-with-pulse'],
      };
    }
    case 'amio-arrest': return { say: [['you', `Amiodarone ${(s.counts['amio-arrest'] ?? 0) === 0 ? '300' : '150'} mg IV/IO, flushed.`]], flags: ['amiodarone'] };
    case 'amio-infusion':
      if (preexcitedAf(s)) return { say: [['you', 'Amiodarone 150 mg running over 10 minutes.'], pathwayFaster], rhythm: fasterDownPathway(s), flags: ['amiodarone'] };
      return { say: [['you', 'Amiodarone 150 mg running over 10 minutes.']], flags: ['amiodarone'] };
    case 'lidocaine': return { say: [['you', 'Lidocaine given.']], flags: ['lidocaine'] };
    case 'push-epi': {
      if (!s.pulse) return { say: [['you', 'Push-dose epinephrine given.']], flags: ['push-epi'] };
      const bp = bpAfter(s, 16, 10);
      return { say: s.lvad ? [] : [['monitor', `BP ${bp.sbp}/${bp.dbp} for a few minutes.`]], vitals: bp, flags: ['push-epi'] };
    }
    case 'pressor': {
      if (!s.pulse) return { say: [['you', 'Infusion running — with no circulation there is no pressure to raise yet.']], flags: ['pressor'] };
      const bp = bpAfter(s, 22, 14, { sbp: 140, dbp: 88 });
      return { say: bpLine(s, bp, 'Infusion running.'), vitals: bp, flags: ['pressor'] };
    }
    case 'sedation':
      if (!s.pulse) return { blocked: true, say: [['system', 'Not in cardiac arrest: there is no one awake to sedate. CPR, the rhythm and the cause come first.']] };
      return { say: [['you', 'Sedated and comfortable; airway maintained, capnography on.']], flags: ['sedation'] };
    case 'procedural-sedation': {
      if (!s.pulse) return { blocked: true, say: [['system', 'Not in cardiac arrest: there is no one awake to sedate. CPR, the rhythm and the cause come first.']] };
      const bp = bpAfter(s, -6, -4);
      return {
        say: [['you', 'Etomidate 0.15 mg/kg IV: eyes closed, no response to voice, still breathing on their own; the capnography waveform stays steady.'], ...bpLine(s, bp)],
        vitals: bp, flags: ['sedation', 'procedural-sedation'],
      };
    }
    case 'midazolam': {
      if (!s.pulse) return noRoleInArrest('Midazolam', 'benzodiazepine');
      // a benzodiazepine calms (and is the first drug for a stimulant's agitation, racing heart and high pressure): it drops
      // the pressure and the breathing a little, and each dose leaves the patient a little drowsier (never below 12 here)
      const bp = bpAfter(s, -8, -5);
      const rr = Math.min(v.rr, Math.max(10, v.rr - 2));
      const gcs = Math.min(v.gcs, Math.max(12, 14 - (s.counts.midazolam ?? 0)));
      // in the lab, and in the emergency department before a shock or the pacer, it is procedural (moderate) sedation:
      // 0.5–1 mg IV at a time, titrated, never IM. For agitation or a stimulant (the field): 2.5 mg IV, or 5 mg IM
      const procedure = sc.setting === 'ed' && (tachyarrhythmia(s) || s.rhythm.hr < 50 || paced(s));
      if (procedure && !has(s, 'iv')) return { blocked: true, say: [['system', 'Sedation for a procedure goes in IV, a little at a time and titrated: start a line first.']] };
      const dose = sc.setting === 'cathlab' ? 'Midazolam 1 mg IV.' : procedure ? 'Midazolam 1 mg IV, titrated.' : has(s, 'iv') ? 'Midazolam 2.5 mg IV.' : 'Midazolam 5 mg IM (no IV yet).';
      return { say: [['you', dose], ...ifAwake(s, '"…Okay. I feel calmer."'), ...bpLine(s, bp)], vitals: { ...bp, rr, gcs }, flags: ['benzodiazepine', 'sedation'] };
    }
    case 'tnk': return { say: [['you', 'Tenecteplase given.']], flags: ['lytic'] };
    case 'alteplase': return { say: [['you', 'Alteplase running: 100 mg over 2 hours.']], flags: ['lytic', 'alteplase'] };
    case 'epi-im': return { say: [['you', 'Epinephrine 0.5 mg IM, lateral thigh.']], flags: ['epi-im'] };
    case 'albuterol': return { say: [['you', 'Albuterol nebulizer running.']], flags: ['albuterol'] };
    case 'diphenhydramine': return { say: [['you', 'Diphenhydramine 50 mg IV.']], flags: ['antihistamine'] };
    case 'steroid': return { say: [['you', 'Methylprednisolone 125 mg IV.']], flags: ['steroid'] };
    case 'radial-cocktail': return { say: [['you', 'Radial cocktail through the sheath: verapamil 2.5 mg and nitroglycerin 200 mcg, diluted with blood.'], ['patient', '"Ooh, that burns up my arm."']], vitals: bpAfter(s, -6, -4), flags: ['cocktail'] };
    case 'ic-nitro': {
      if (!s.pulse) return noRoleInArrest('Intracoronary nitroglycerin', 'ic-nitro');
      const bp = bpAfter(s, -10, -6);
      return { say: [['you', 'Nitroglycerin 200 mcg intracoronary.'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`]], vitals: bp, flags: ['ic-nitro'] };
    }
    case 'ic-adenosine':
      if (!s.pulse) return noRoleInArrest('Intracoronary adenosine', 'ic-adenosine');
      return { say: [['you', 'Adenosine 150 mcg intracoronary.'], ['monitor', 'A few seconds of slowing, then back to baseline.']], flags: ['ic-adenosine'] };
    case 'ic-verapamil':
      if (!s.pulse) return noRoleInArrest('Intracoronary verapamil', 'ic-verapamil');
      return { say: [['you', 'Verapamil 200 mcg intracoronary.']], flags: ['ic-verapamil'] };
    case 'adenosine-iv-ffr': return { say: [['you', 'Adenosine 140 mcg/kg/min IV running.'], ['patient', '"I feel flushed… a bit short of breath."']], flags: ['hyperemia'] };
    case 'bivalirudin': return { say: [['you', 'Bivalirudin 0.75 mg/kg bolus, 1.75 mg/kg/h running.']], flags: ['bivalirudin', 'anticoagulated'] };
    case 'gp2b3a': return { say: [['you', 'Eptifibatide 180 mcg/kg bolus, infusion running.']], flags: ['gp2b3a'] };
    case 'cangrelor': return { say: [['you', 'Cangrelor 30 mcg/kg bolus, 4 mcg/kg/min running.']], flags: ['p2y12', 'cangrelor'] };
    case 'protamine': return { say: [['you', 'Protamine 50 mg slowly IV.'], ['team', 'ACT falling.']], vitals: bpAfter(s, -6, -4), flags: ['protamine'] };
    case 'ic-nitroprusside': {
      if (!s.pulse) return noRoleInArrest('Intracoronary nitroprusside', 'ic-nitroprusside');
      const bp = bpAfter(s, -12, -8);
      return { say: [['you', 'Nitroprusside 100 mcg intracoronary.'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`]], vitals: bp, flags: ['ic-nitroprusside'] };
    }
    case 'ic-epinephrine': {
      if (!s.pulse) return noRoleInArrest('Intracoronary epinephrine', 'ic-epinephrine');
      // it washes out of the coronary into the whole circulation: the pressure and the sinus rate rise for a few minutes
      const bp = bpAfter(s, 16, 8);
      const hr = sinusFaster(s, 10);
      return {
        say: [['you', 'Epinephrine 100 mcg intracoronary.'], ['monitor', `${hr ? `Heart rate ${hr}. ` : ''}BP ${bp.sbp}/${bp.dbp}.`]],
        vitals: bp, ...(hr ? { rhythm: atRate(s, hr) } : {}), flags: ['ic-epinephrine'],
      };
    }
    case 'phenylephrine': {
      if (!s.pulse) return noRoleInArrest('Phenylephrine', 'phenylephrine');
      // a pure alpha agonist: the pressure rises, and the baroreflex slows a sinus node a little (to 50 at the lowest)
      const bp = bpAfter(s, 16, 10);
      const slower = sinusNode(s) && bp.sbp > v.sbp ? Math.min(s.rhythm.hr, Math.max(50, s.rhythm.hr - 6)) : s.rhythm.hr;
      const hr = slower !== s.rhythm.hr ? slower : null;
      return {
        say: [['you', 'Phenylephrine 100 mcg IV, flushed.'], ['monitor', `${hr ? `Heart rate ${hr}. ` : ''}BP ${bp.sbp}/${bp.dbp}.`]],
        vitals: bp, ...(hr ? { rhythm: atRate(s, hr) } : {}), flags: ['phenylephrine'],
      };
    }

    // Electrolytes, antidotes and glucose: by themselves they change no rhythm (only the case knows whether the
    // patient's potassium, overdose or glucose is what they treat), so a case that uses them writes its own response
    case 'calcium-chloride':
      // given slowly with a pulse, as the label says, so no bradycardia from a fast push; it burns going in
      if (!s.pulse) return { say: [['you', 'Calcium chloride 1 g pushed and flushed; compressions go on.']], flags: ['calcium'] };
      return { say: [['you', 'Calcium chloride 1 g in slowly over a few minutes; line flushed.'], ...ifAwake(s, '"That burns going up my arm."')], flags: ['calcium'] };
    case 'sodium-bicarbonate':
      return { say: [['you', s.pulse ? 'Sodium bicarbonate 50 mEq IV; line flushed.' : 'Sodium bicarbonate 50 mEq pushed and flushed; compressions go on.']], flags: ['bicarbonate'] };
    case 'insulin-dextrose':
      // the dextrose covers the insulin for now; the low glucose it can bring comes hours later, after most cases end
      return { say: [['you', 'Regular insulin 10 units IV (dose double-checked), then dextrose 25 g (D50 50 mL).']], flags: ['insulin'] };
    case 'albuterol-hyperk': {
      // a nebulizer needs someone breathing, and albuterol has no proven benefit in arrest (2025 AHA)
      if (!s.pulse) return { blocked: true, say: [['system', 'Not in cardiac arrest: a nebulizer needs a patient who is breathing, and albuterol has no proven benefit in arrest (2025 AHA).']] };
      const hr = sinusFaster(s, 8);
      return {
        say: [['you', 'High-dose albuterol nebulizer running.'], ...ifAwake(s, '"I feel shaky."'), ...(hr ? [['monitor', `Heart rate ${hr}.`] as Line] : [])],
        ...(hr ? { rhythm: atRate(s, hr) } : {}), flags: ['albuterol-hyperk'],
      };
    }
    case 'magnesium-sulfate': {
      if (!s.pulse) return { say: [['you', 'Magnesium sulfate 2 g pushed; compressions go on.']], flags: ['magnesium'] };
      // diluted over 15 minutes it flushes the skin and drops the pressure a little
      const bp = bpAfter(s, -6, -4);
      return { say: [['you', 'Magnesium sulfate 2 g running over 15 minutes.'], ...ifAwake(s, '"I feel warm and flushed."'), ...bpLine(s, bp)], vitals: bp, flags: ['magnesium'] };
    }
    case 'procainamide': {
      if (!s.pulse) return noRoleInArrest('Procainamide', 'procainamide');
      // it vasodilates and weakens the squeeze: the pressure falls; whether the arrhythmia stops is the case's to say
      const bp = bpAfter(s, -10, -6);
      return { say: [['you', 'Procainamide running at 30 mg/min; BP and QRS width checked every few minutes.'], ...bpLine(s, bp)], vitals: bp, flags: ['procainamide'] };
    }
    case 'glucagon': {
      if (!s.pulse) return noRoleInArrest('Glucagon', 'glucagon');
      // vomiting is the rule at these doses, and it raises the glucose; what it does to the rate and pressure depends on the overdose
      const sick: Line = v.gcs >= 13 ? ['patient', '"I\'m going to be sick…" — and vomits.'] : [teammate(sc), 'Vomiting: rolled onto the side and suctioned.', 'warn'];
      const dose = (s.counts.glucagon ?? 0) === 0 ? 'Glucagon 5 mg IV over 3 minutes.' : 'Another 5 mg of glucagon IV (10 mg in all).';
      return { say: [['you', dose], sick], vitals: { glucose: v.glucose + 30 }, flags: ['glucagon'] };
    }
    case 'oral-glucose':
      if (!s.pulse) return { blocked: true, say: [['system', 'Not in cardiac arrest: nothing goes in the mouth of a patient who cannot swallow.']] };
      if (!canSwallow(s)) return { say: [['you', 'The gel pools in the cheek: the patient is too drowsy to swallow it. Suctioned out.', 'bad']], flags: ['oral-glucose'] };
      return { say: [['patient', 'Swallows the glucose gel.']], vitals: { glucose: v.glucose + 40 }, flags: ['oral-glucose'] };
    case 'dextrose':
      return { say: [['you', s.pulse ? 'Dextrose 25 g IV in.' : 'Dextrose 25 g pushed; compressions go on.']], vitals: { glucose: v.glucose + 120 }, flags: ['dextrose'] };
    case 'ondansetron':
      if (!s.pulse) return noRoleInArrest('Ondansetron', 'antiemetic');
      // it settles nausea and treats nothing else: whether there was nausea to settle is the case's to say
      return { say: [['you', 'Ondansetron 4 mg IV, slowly over 30 seconds.']], flags: ['antiemetic'] };

    case 'cpr':
      // an LVAD patient has no pulse to feel: the question is whether the pump perfuses (2025 AHA durable LVAD algorithm).
      // Unresponsive with a MAP of 50 or less, compressions are right — and start without delay
      if (s.pulse && s.lvad) {
        if (!lvadPerfusing(s)) return { say: [['you', '2 minutes of compressions: 100–120/min, 5–6 cm, full recoil — the pump is checked (hum, alarms, power, driveline) as they go on.']], flags: ['cpr'] };
        return v.gcs >= 9
          ? { say: [['patient', 'The patient cries out — awake and talking: the pump is perfusing.', 'bad']] }
          : { say: [[teammate(sc), `Stop — the pump is humming and the Doppler MAP is ${mapOf(v)}: check perfusion first.`, 'bad']] };
      }
      if (s.pulse) {
        // only a patient awake enough to feel it cries out; otherwise a teammate stops it
        return v.gcs >= 9
          ? { say: [['patient', 'The patient cries out — they have a pulse and are breathing.', 'bad']] }
          : { say: [[teammate(sc), 'Stop — there is a pulse. No compressions on a beating heart.', 'bad']] };
      }
      return { say: [['you', '2 minutes of compressions: 100–120/min, 5–6 cm, full recoil, minimal pauses.']], flags: ['cpr'] };
    case 'aed':
      // An AED reads only the rhythm: it cannot feel a pulse, and it would advise a shock for a fast VT that has one.
      // So it goes only on a patient who is unresponsive, not breathing normally and pulseless: with a pulse it is not
      // applied at all (no time passes, nothing is scored)
      if (lvadPerfusing(s)) return { blocked: true, say: [['system', 'Not while the pump is perfusing: an AED is only for a patient who is unresponsive, not breathing normally and without circulation. A continuous-flow LVAD leaves no pulse to feel even when it is working: judge perfusion by responsiveness, skin color, capillary refill and the Doppler MAP (over 50), and listen for the pump hum.']] };
      // an unresponsive LVAD patient who is not perfusing gets BLS/ALS: the AED reads the rhythm alone, as it always does
      if (s.pulse && s.lvad) {
        if (['vf', 'vt', 'torsades'].includes(rhythmKind(s))) return { say: [['monitor', 'AED: "Shock advised." Shock delivered. Resume CPR.']], flags: ['pads', 'monitor', 'shocked'] };
        return { say: [['monitor', 'AED: "No shock advised. Start CPR."']], flags: ['pads', 'monitor'] };
      }
      if (s.pulse) return { blocked: true, say: [['system', 'Not with a pulse: an AED is only for a patient who is unresponsive, not breathing normally and has no pulse. It reads the rhythm alone — it cannot feel a pulse — and would advise a shock for a fast VT. Keep assessing; if the pulse is lost, start CPR and analyze.']] };
      if (shockable(s)) return { say: [['monitor', 'AED: "Shock advised." Shock delivered. Resume CPR.']], flags: ['pads', 'monitor', 'shocked'] };
      return { say: [['monitor', 'AED: "No shock advised. Start CPR."']], flags: ['pads', 'monitor'] };
    case 'defib':
      if (shockable(s)) return { say: [['monitor', 'Shock delivered: 200 J. Resume CPR immediately.']], flags: ['pads', 'monitor', 'shocked'] };
      return { say: [['monitor', 'Shock delivered: 200 J.']], flags: ['pads', 'monitor'] };
    case 'cardiovert': {
      if (!s.pulse) {
        // SYNC fires only on an R wave: none in VF or asystole, hard to find in pulseless VT; PEA has them, so it fires
        const k = rhythmKind(s);
        if (k === 'vf' || k === 'torsades' || k === 'asystole') return { say: [['monitor', 'SYNC is on: no R waves to synchronize to — the device does not fire.', 'bad']], flags: ['pads', 'monitor'] };
        if (k === 'vt') return { say: [['monitor', 'SYNC is on: the device hunts for R waves in the fast, wide complexes and does not fire.', 'bad']], flags: ['pads', 'monitor'] };
        return { say: [['monitor', 'Synchronized shock delivered: 100 J. The same complexes come back — still no pulse.', 'bad']], flags: ['pads', 'monitor'] };
      }
      // polymorphic VT has no R waves the device can lock onto (2025 AHA: defibrillate it, pulse or not)
      if (rhythmKind(s) === 'torsades') return { say: [['monitor', 'SYNC is on: the device cannot lock onto the twisting complexes and does not fire.', 'bad']], flags: ['pads', 'monitor'] };
      if (!tachyarrhythmia(s)) {
        const awake: Line[] = v.gcs >= 13 ? [['patient', '"Aagh! What was that?"', 'bad']] : [];
        return { say: [['monitor', `Synchronized shock delivered: ${syncEnergy(s)}. No change on the monitor.`], ...awake], flags: ['pads', 'monitor'] };
      }
      return { say: [['monitor', `Synchronized shock delivered: ${syncEnergy(s)}.`]], flags: ['pads', 'monitor', 'cardioverted'] };
    }
    case 'pace': {
      if (!s.pulse) {
        return { say: [['monitor', 'Pacer on: rate 70, output turned up to 80 mA.'], ['you', 'Pacing spikes on the screen, but no pulse with them.', 'bad']], flags: ['pads', 'monitor'] };
      }
      if (s.rhythm.hr < 50) {
        return {
          say: [['monitor', 'Pacer on: rate 70, output turned up to 80 mA.']],
          rhythm: { profile: 'tcp', hr: 70 }, vitals: { sbp: Math.max(v.sbp, 102), dbp: Math.max(v.dbp, 64), pain: Math.max(v.pain, 6) }, flags: ['pads', 'monitor', 'paced'],
        };
      }
      // already paced (a wire or a pacemaker): the pads are a backup, and the demand pacer senses the paced beats
      if (paced(s) && s.rhythm.hr >= 70) {
        return { say: [['monitor', `Pacer on standby at 70 as a backup: the heart is already paced at ${s.rhythm.hr}, so it senses those beats and does not fire.`]], flags: ['pads', 'monitor'] };
      }
      // a demand pacer set to 70 stays silent above 70; between 50 and 70 it would take over a rate that needs no help
      if (s.rhythm.hr > 70) {
        return { say: [['monitor', `Pacer on in demand mode at 70: the heart's own rate of ${s.rhythm.hr} is faster, so it senses and does not fire.`]], flags: ['pads', 'monitor'] };
      }
      return {
        say: [
          ['monitor', 'Pacer on at 70.'],
          [teammate(sc), `Hold on — the heart's own rate is ${s.rhythm.hr}. Pacing is for a symptomatic rate under 50 that atropine has not fixed. Pacer off.`, 'warn'],
        ],
        flags: ['pads', 'monitor'],
      };
    }
    case 'vagal': return { say: [['monitor', 'No change.']], flags: ['vagal'] };
    case 'hs-ts':
      return { say: [['you', 'Hs: hypoxia, hypovolemia, acidosis, potassium, hypothermia. Ts: tension pneumothorax, tamponade, toxins, thrombosis (coronary or pulmonary).']], flags: ['hs-ts'] };

    case 'timeout': return { say: [['team', 'Time-out: patient, procedure, site, allergies and anticoagulation confirmed.']], flags: ['timeout'] };
    case 'consent': return { say: [['patient', fact('allergies') ?? 'No allergies. I understand and consent.']], flags: ['consent'] };
    case 'prep': return { say: [['you', 'Right radial and both groins prepped and draped.']], flags: ['prep'] };
    case 'access': return { say: [['operator', 'Radial access: 6 Fr sheath in.']], flags: ['access'] };
    case 'access-femoral': return { say: [['you', 'Common femoral artery over the femoral head, ultrasound-guided: 6 Fr sheath in.']], flags: ['access', 'femoral'] };
    case 'access-venous': return { say: [['you', 'Femoral venous sheath in.']], flags: ['venous'] };
    case 'balloon-tamponade': return { say: [['you', 'Balloon inflated at low pressure over the site.']], flags: ['balloon-tamponade'] };
    case 'pericardiocentesis':
      if (s.role === 3) return { say: [['you', 'Pericardiocentesis tray open: needle, wire, drain and a drainage bag; echo probe in a sterile sleeve.']], flags: ['pericardiocentesis-ready'] };
      // in the emergency department the physician's own ultrasound finds the effusion and the window first; only in an
      // arrest, with no time for it, does the needle go in blind
      if (sc.setting === 'ed' && !has(s, 'pocus')) {
        if (s.pulse) return { blocked: true, say: [['system', 'The needle goes in under ultrasound: scan the heart first (point-of-care ultrasound) — is there an effusion, is it squeezing the heart, and where is the safest window?']] };
        return { say: [['you', 'Emergency pericardiocentesis during the arrest, without imaging: a long needle below the xiphoid, aimed at the left shoulder and aspirating as it goes; a drain left in.']], flags: ['pericardiocentesis'] };
      }
      return { say: [['you', 'Pericardial drain in under echo guidance.']], flags: ['pericardiocentesis'] };
    case 'closure-device': return { say: [['you', 'Femoral closure device deployed; hemostasis.']], flags: ['closure', 'hemostasis'] };
    case 'angio': return angioGate(s) ?? { say: [['you', 'Angiography complete.']], image: { id, view: 'Diagnostic angiography', image: sc.images?.angio }, flags: ['angio'] };
    case 'reposition': return { say: [['operator', 'Catheter disengaged and repositioned.']], flags: ['repositioned'] };
    case 'iabp':
      return s.role === 3
        ? { say: [['you', 'IABP console set up and the balloon prepped; timing on ECG trigger.']], flags: ['iabp-ready'] }
        : { say: [['you', 'IABP in, tip 2 cm below the left subclavian; 1:1, augmented diastolic 118 mmHg.']], vitals: bpAfter(s, 6, 8, { sbp: 140, dbp: 90 }), flags: ['iabp', 'mcs'] };
    case 'impella':
      return s.role === 3
        ? { say: [['you', 'Impella console primed and the purge set up; large-bore access kit and closure sutures open.']], flags: ['impella-ready'] }
        : { say: [['you', 'Impella CP across the aortic valve, inlet 3.5 cm below the valve; P-6, flow 3.3 L/min.']], vitals: bpAfter(s, 14, 10, { sbp: 140, dbp: 90 }), flags: ['impella', 'mcs'] };
    case 'temp-wire': {
      if (s.role === 3) return { say: [['you', 'Pacing wire and generator ready: rate 70, output 5 mA.']], flags: ['temp-wire-ready'] };
      // a transvenous wire goes up a vein into the right ventricle, and nobody floats one during CPR. In the lab through a
      // femoral venous sheath; in the emergency department through a central line ('central-line')
      if (!has(s, 'venous')) {
        return { blocked: true, say: [['system', sc.setting === 'ed'
          ? 'A transvenous pacing wire goes in through a central vein: place a central venous line first.'
          : 'A transvenous pacing wire goes in through a vein: get femoral venous access first.']] };
      }
      if (!s.pulse) return { blocked: true, say: [['system', 'Not during cardiac arrest: CPR and the arrest algorithm come first.']] };
      // in the emergency department a balloon-tipped wire is floated through the central line's introducer sheath
      const wire = sc.setting === 'ed' ? 'Balloon-tipped pacing wire floated through the introducer sheath, ECG-guided, to the RV apex' : 'Temporary wire in the RV apex';
      if (s.rhythm.hr < 50) {
        const bp = { sbp: Math.max(v.sbp, 100), dbp: Math.max(v.dbp, 62) };
        return {
          say: [['you', `${wire}: threshold 0.6 mA; pacing at 70, output 3 mA.`], ['monitor', `Heart rate 70. BP ${bp.sbp}/${bp.dbp}.`, 'good']],
          rhythm: { profile: 'paced', hr: 70 }, vitals: bp, flags: ['temp-wire', 'paced'],
        };
      }
      const faster = paced(s) ? `The heart is already paced at ${s.rhythm.hr}` : `The heart's own rate of ${s.rhythm.hr} is faster`;
      return { say: [['you', `${wire}: threshold 0.6 mA, output 3 mA, set to pace on demand below 50. ${faster}, so it is not pacing.`]], flags: ['temp-wire'] };
    }
    case 'cath-tiger': case 'cath-jl4': case 'cath-jr4': case 'cath-pigtail':
    case 'guide-ebu': case 'guide-jr4': case 'guide-al1':
    case 'wire-workhorse': case 'wire-hydrophilic': case 'aspiration':
    case 'balloon-predil': case 'stent-des': case 'balloon-nc': case 'stent-covered':
      return deviceEffect(s, id);
    case 'view-rao-caudal': case 'view-rao-cranial': case 'view-ap-cranial': case 'view-lao-cranial': case 'view-lao-caudal':
    case 'view-rca-lao': case 'view-rca-rao': case 'view-rca-cranial': {
      if (!has(s, 'access')) return s.role === 5 ? noAccess : nothingToFilm;
      const iv = INTERVENTION_BY_ID[id];
      return { say: [['monitor', `Cine recorded: ${iv.label.split(' — ')[0]} (${iv.detail}).`]], image: { id, view: iv.label, image: sc.images?.[id] }, flags: ['cine', id] };
    }
    case 'lv-gram':
      if (!has(s, 'access')) return s.role === 5 ? noAccess : nothingToFilm;
      return { say: [['monitor', fact('lvgram') ?? 'LV gram: normal wall motion, EF about 60 %, no mitral regurgitation.']], image: { id, view: 'Left ventriculogram', image: sc.images?.[id] }, flags: ['lv-gram'] };
    case 'ffr-equalize': return { say: [['monitor', 'Pressure wire equalized with the aortic pressure at the guide tip: Pd/Pa 1.00.']], flags: ['equalized'] };
    case 'ffr':
      if (!has(s, 'wired')) return noWire(s, 'Wire the vessel with the pressure wire first.');
      return { say: [['monitor', fact('ffr') ?? 'FFR 0.88 at maximal hyperemia.']], flags: ['ffr'] };
    case 'ivus':
      if (!has(s, 'wired')) return noWire(s, 'Wire the vessel first.');
      return { say: [['monitor', fact('ivus') ?? 'IVUS: no significant plaque.']], flags: ['ivus'] };
    case 'oct':
      if (!has(s, 'wired')) return noWire(s, 'Wire the vessel first.');
      return { say: [['monitor', fact('oct') ?? 'OCT: no significant plaque.']], flags: ['oct'] };
    case 'final-angio':
      if (!has(s, 'access')) return s.role === 5 ? noAccess : nothingToFilm;
      return { say: [['monitor', fact('final') ?? 'Final angiogram recorded in two views.']], image: { id, view: 'Final angiogram', image: sc.images?.[id] }, flags: ['final-angio'] };
    case 'stop-contrast': return { say: [['you', 'No more contrast — injector and manifold off.']], flags: ['contrast-stopped'] };
    case 'call-surgery': return { say: [['hospital', 'Cardiac surgery notified: the surgeon is on the way and the OR is being prepared.']], flags: ['surgery-called'] };
    case 'call-vascular': return { say: [['hospital', 'Vascular surgery and interventional radiology paged: they are on their way to see the patient and review the imaging.']], flags: ['vascular-called'] };
    case 'stroke-team': return { say: [['hospital', 'Stroke alert: the stroke neurologist is on the way, and CT is clearing the scanner for this patient.']], flags: ['stroke-alert'] };
    case 'ct-urgent':
      // nobody goes to the scanner in the middle of CPR (an unstable patient can be sent: the built-in rule scores it)
      if (!s.pulse) return { blocked: true, say: [['system', 'Not in cardiac arrest: nobody goes to the scanner during CPR.']] };
      return {
        say: [['team', sc.setting === 'cathlab' ? 'Scanned and back: the patient went with a nurse and the monitor, the sheath secured.' : 'Scanned and back: the patient went with a nurse and the monitor.'], ['hospital', fact('ct') ?? 'Radiology: no acute finding on the CT.']],
        flags: ['ct'],
      };
    // emergency department imaging: the ER doctor reads the film and scans the patient; the ER nurse hears the physician's read
    case 'cxr':
      if (!s.pulse) return { blocked: true, say: [['system', 'Not during cardiac arrest: the chest film waits until there is a pulse.']] };
      return { say: [[s.role === 6 ? 'physician' : 'you', fact('cxr') ?? 'Portable chest X-ray: normal heart size, clear lungs, a normal mediastinum.']], flags: ['cxr'] };
    case 'pocus': {
      const own = fact('pocus') ?? fact('echo');
      // in an arrest it is done within the 10-second pulse check, never by pausing the compressions longer
      if (!s.pulse) return { say: [['you', own ?? 'Ultrasound during the 10-second pulse check: no pericardial effusion and no dilated right ventricle; compressions resume.']], flags: ['pocus'] };
      return { say: [['you', own ?? 'Bedside ultrasound: both ventricles squeeze well; no pericardial effusion; the lungs slide, with A-lines; the IVC is normal in size and narrows with each breath; the aortic root is not dilated.']], flags: ['pocus'] };
    }
    case 'clear-air':
      // the tech readies the syringes and keeps the line free of air; the operator aspirates and flushes (whether the
      // bubbles clear and the flow comes back is the case's to say)
      if (s.role === 3) return { say: [['you', 'Aspiration syringe on the manifold, tip down; guide back-bled; a 10 mL saline syringe drawn up free of bubbles for the forceful flush.']], flags: ['clear-air-ready'] };
      if (!has(s, 'guide') && !has(s, 'catheter')) return { blocked: true, say: [['system', 'There is no catheter in a coronary to aspirate through.']] };
      return { say: [['you', 'Aspirated back through the guide until the blood came back free of bubbles, then a forceful saline flush down the artery.']], flags: ['air-cleared'] };
    case 'hemostasis':
      return has(s, 'femoral')
        ? { say: [['you', 'Femoral sheath out; firm pressure for 15 minutes, then a dressing. Distal pulses checked; no hematoma.']], flags: ['hemostasis'] }
        : { say: [['you', 'Radial band on; distal pulse and perfusion checked.']], flags: ['hemostasis'] };

    case 'call-help':
      // in the lab the code team is down the hall; in the field nobody comes without a named request, so nothing is promised
      if (sc.setting === 'cathlab') return { say: [['team', 'Help is on the way.']], flags: ['help'] };
      // in the emergency department more hands come into the room (for the nurse, the physician too)
      if (sc.setting === 'ed') {
        return {
          say: [['team', s.role === 6
            ? 'The ED physician, the charge nurse and another nurse come into the room; respiratory therapy is on the way.'
            : 'The charge nurse, another nurse, a tech and respiratory therapy come into the room.']],
          flags: ['help'],
        };
      }
      return {
        say: [['dispatch', s.role === 1
          ? '"Copy. What do you need? For a paramedic, request an ALS intercept."'
          : '"Copy. No other unit is free right now: it is your crew for the moment. Tell us if you need something specific."']],
        flags: ['help'],
      };
    case 'callout': return { say: [['operator', 'Copy.']], flags: ['callout'] };
    case 'als': return { say: [['dispatch', 'Medic unit assigned, about 6 minutes out.']], flags: ['als'] };
    case 'med-control': return { say: [['hospital', 'Medical control: continue per protocol.']], flags: ['med-control'] };
    case 'call-vad': {
      if (!s.lvad) return { blocked: true, say: [['system', 'This patient has no VAD: there is no controller, and no VAD team to call.']] };
      // the field: where to take the patient; the department: where the patient is treated is the ED physician's call
      const coordinator = sc.setting !== 'ed'
        ? 'VAD coordinator: "Read me the controller — flow, speed, power and any alarms — and give me a Doppler MAP. Then bring the patient to us, the implanting center, with the controller, the spare batteries and the charger."'
        : s.role === 7
          ? 'VAD coordinator: "Read me the controller — flow, speed, power, alarms — and a Doppler MAP. If you are not our implanting center, we will arrange the transfer with you, physician to physician."'
          : 'VAD coordinator: "Read me the controller — flow, speed, power, alarms — and a Doppler MAP. Have your ED physician call me: if you are not our implanting center, we will arrange the transfer."';
      return { say: [['hospital', fact('vadTeam') ?? coordinator]], flags: ['vad-team'] };
    }
    case 'poison-control': {
      // a case with a poisoning says what the specialist advises (fact 'poisonControl'); one that lists an overdose but
      // says nothing gets the specialist's first questions, never "no poisoning"
      const reply = fact('poisonControl') ?? (hasProblem(sc, OVERDOSES)
        ? 'Poison center: "What was taken, how much, and when? Read us the label on the bottle, and call back with what you find."'
        : 'Poison center: "Nothing you describe points to a poisoning or an overdose. Treat what you find, and call us back if you learn of an exposure."');
      return { say: [['hospital', reply]], flags: ['poison-control'] };
    }
    case 'stemi-alert':
      if (!has(s, 'ecg12')) return { blocked: true, say: [['system', 'You need a 12-lead showing a STEMI first.']] };
      // the physician reviews the 12-leads you describe: none meets STEMI criteria, so no cath lab (the built-in rule scores
      // the call). Not "no ST elevation": pericarditis, a bundle branch block, LVH or a high potassium can raise it too
      if (!ecgShowsStemi(s)) {
        return { say: [['hospital', 'The interventional cardiologist reviews your 12-lead: it does not meet STEMI criteria — the cath lab is not activated. Bring the patient to the emergency department.', 'warn']], flags: ['alert-declined'] };
      }
      return { say: [['hospital', 'Cath lab activated — the team will meet you at the door.']], flags: ['alert'] };
    case 'notify': return { say: [['hospital', "Copy. We'll be ready for you."]], flags: ['notified'] };

    // Emergency department: the nurse's report, and the physician's calls and decisions. A case answers each in its own words
    // (respond): the ED physician's orders, the consultant's advice, who accepts the patient
    case 'notify-physician': return { say: [['physician', "Got it — I'm coming to the bedside."]], flags: ['physician-notified'] };
    case 'cath-lab-activate': {
      if (!has(s, 'ecg12')) return { blocked: true, say: [['system', 'You need a 12-lead showing a STEMI first.']] };
      // the same test as the field's STEMI alert: a tracing so far met STEMI criteria (the built-in rule scores the call)
      if (!ecgShowsStemi(s)) {
        return { say: [['consultant', 'The interventional cardiologist calls back: "This 12-lead does not meet STEMI criteria — I am not bringing the team in. Repeat the 12-lead while the pain goes on, send a troponin, and call me with what you find."', 'warn']], flags: ['alert-declined'] };
      }
      const mins = sc.cathLabMinutes ?? CATH_LAB_MINUTES;
      return {
        say: [['hospital', `Cath lab activated: the interventional cardiologist and the team are on their way — the room will be ready in about ${mins} minutes.`]],
        flags: ['alert', 'dispo'], timers: { cathReady: s.minute + mins },
      };
    }
    case 'consult-cardiology':
      return { say: [['consultant', fact('consult') ?? 'Cardiology: "Thanks for the call — I\'ll come down and see the patient. Keep them on the monitor, and call me back if anything changes."']], flags: ['consult'] };
    case 'admit':
    case 'transfer':
      // nobody leaves the department in the middle of a cardiac arrest
      if (!s.pulse) return { blocked: true, say: [['system', 'Not in cardiac arrest: the resuscitation goes on here. Decide where the patient goes once there is a pulse.']] };
      return id === 'admit'
        ? { say: [['hospital', 'Admission accepted: the inpatient team takes the patient, and a monitored bed in the CCU or ICU is being readied.']], flags: ['dispo', 'admit'] }
        : { say: [['hospital', 'The receiving center accepts the patient, physician to physician: a critical care transport team is on its way.']], flags: ['dispo', 'transfer'] };
    case 'transport-pci':
    case 'transport-near': {
      if (has(s, 'enroute')) return { blocked: true, say: [['system', 'You are already transporting.']] };
      const mins = id === 'transport-pci' ? sc.transportMinutes ?? 15 : sc.nearestMinutes ?? 8;
      return {
        say: [['you', `Patient loaded; transporting to the ${id === 'transport-pci' ? 'regional heart center' : 'nearest emergency department'} (${mins} min).`]],
        flags: ['enroute', id === 'transport-pci' ? 'dest-pci' : 'dest-near'], timers: { arrive: s.minute + 2 + mins },
      };
    }
    case 'handoff':
      if (sc.setting === 'ed') return edHandoff(s);
      if (sc.setting === 'field' && !has(s, 'arrived')) return { blocked: true, say: [['system', 'Hand off on arrival: keep caring for the patient en route (reassess) until you get there.']] };
      // in the lab the patient leaves the table (and your care) only once the procedure is over
      if (sc.setting === 'cathlab' && sc.completeWhen && !sc.completeWhen(s)) return { blocked: true, say: [['system', 'The procedure is not over yet: keep caring for the patient (reassess) and hand off at the end.']] };
      if (!s.pulse) {
        // in the lab the resuscitation team is already in the room: the arrest is run there, not handed over
        if (sc.setting === 'cathlab') return { blocked: true, say: [['system', 'Not in the middle of a cardiac arrest: run the arrest here, and hand off once there is a pulse.']] };
        // arriving in the arrest: the emergency department team takes over the CPR, and the case ends there
        return { say: [['you', 'Hand-off to the resuscitation team: CPR continues in the emergency department.']], flags: ['handoff'] };
      }
      return { say: [['you', 'SBAR hand-off given; the receiving team takes over.']], flags: ['handoff'] };
  }
  return { say: [['you', 'Done.']] };
}

const noAccess: Effect = { blocked: true, say: [['system', 'No arterial access yet.']] };
const nothingToFilm: Effect = { blocked: true, say: [['system', 'Nothing to film yet: the operator has no catheter in.']] };
const noCatheter: Effect = { blocked: true, say: [['system', 'The operator has no catheter in yet.']] };
const noWire = (s: SimState, mine: string): Effect => ({ blocked: true, say: [['system', s.role === 5 ? mine : 'There is no wire in the vessel yet.']] });

/** Minutes from activating the cath lab in the emergency department to the team being ready (Scenario.cathLabMinutes) */
export const CATH_LAB_MINUTES = 20;

/**
 * The emergency department's triage level when the case gives none of its own (ENA Emergency Severity Index): ESI 1 when
 * the patient needs a life-saving intervention now — no pulse, unresponsive or nearly, failing breathing or oxygen, a low
 * pressure, or a rate that needs pacing or a shock; every other cardiac complaint in these cases is high risk, ESI 2
 */
function triageLevel(s: SimState): 1 | 2 {
  const v = s.vitals;
  const rate = !paced(s) && (s.rhythm.hr < 40 || s.rhythm.hr > 150);
  return !s.pulse || v.gcs <= 8 || v.spo2 < 90 || v.rr < 8 || v.rr > 30 || lowPressure(s) || rate ? 1 : 2;
}

/**
 * A hand-off in the emergency department: the arrest is run in the department, and the patient leaves only once someone
 * has decided where to (the flag 'dispo') — and, for the cath lab, once the team is ready ('cath-ready')
 */
function edHandoff(s: SimState): Effect {
  if (!s.pulse) return { blocked: true, say: [['system', 'Not in the middle of a cardiac arrest: the resuscitation is run here, and the patient goes nowhere until there is a pulse.']] };
  if (!has(s, 'dispo')) {
    return { blocked: true, say: [['system', s.role === 7
      ? 'Decide where the patient goes first: the cath lab, admission or a transfer. Until then keep caring for them (reassess).'
      : 'The patient stays in the department until the ED physician decides where they go: keep caring for them (reassess).']] };
  }
  if (has(s, 'alert') && !has(s, 'cath-ready') && !has(s, 'admit') && !has(s, 'transfer')) {
    return { blocked: true, say: [['system', 'The cath lab team is still on its way: keep caring for the patient (reassess), and hand off when the lab is ready.']] };
  }
  const to = has(s, 'transfer') ? 'the transport team' : has(s, 'admit') ? 'the admitting team' : has(s, 'alert') ? 'the cath lab team' : 'the receiving team';
  return { say: [['you', `SBAR hand-off to ${to}; they take over.`]], flags: ['handoff'] };
}

/**
 * A drug with no role in cardiac arrest, given in one. Not "it cannot circulate": compressions move enough blood to carry
 * an IV/IO drug (that is how epinephrine and amiodarone work during CPR) — this one simply has nothing to treat there.
 */
const noRoleInArrest = (what: string, flag: string): Effect => ({ say: [['you', `${what} given — it has no place in cardiac arrest and changes nothing on the monitor.`]], flags: [flag] });

/** The crew member or teammate who speaks up beside the learner */
const teammate = (sc: Scenario): Speaker => (sc.setting === 'field' ? 'partner' : 'team');

/** Only a patient awake enough to talk says how a drug feels */
const ifAwake = (s: SimState, text: string): Line[] => (s.pulse && s.vitals.gcs >= 13 ? [['patient', text]] : []);

/**
 * An answer to a history question (OPQRST, SAMPLE, the erectile-dysfunction drugs). The case's own answer is said as the
 * case wrote it (for a patient who cannot talk, it gives a bystander's words); without one, nobody answers in cardiac
 * arrest, and a patient too drowsy to talk gives no history
 */
function historyAnswer(s: SimState, own: string | null, text: string, flag: string): Effect {
  if (own) return { say: [['patient', own]], flags: [flag] };
  if (!s.pulse) return { blocked: true, say: [['system', 'Not in cardiac arrest: the patient cannot answer. Ask whoever is with them once the resuscitation allows.']] };
  const said = ifAwake(s, text);
  return said.length ? { say: said, flags: [flag] } : { say: [['you', 'No answer: the patient is too drowsy to give a history. Ask whoever came with them.', 'warn']] };
}

const noEcgInArrest: Effect = { blocked: true, say: [['system', 'No 12-lead in cardiac arrest: treat the rhythm on the monitor.']] };

/**
 * The sinus node sets the rate, with a pulse. Not in PEA (organized complexes, no output), and not with a high potassium:
 * its slow rate comes from the potassium, which neither the vagus nor an adrenergic drug undoes — the case says what helps.
 */
const sinusNode = (s: SimState) => s.pulse && rhythmKind(s) === 'sinus' && s.rhythm.profile !== 'hyperkalemia';

/**
 * The heart rate after an adrenergic or vagolytic drug speeds the sinus node (up to `cap`), or null: other rhythms are left
 * to the case (an agonist does not simply speed a VT, and a pacer holds its own rate)
 */
const sinusFaster = (s: SimState, by: number, cap = Infinity): number | null =>
  (sinusNode(s) ? Math.max(s.rhythm.hr, Math.min(cap, s.rhythm.hr + by)) : null);

/** The first synchronized energy (2025 AHA, biphasic): atrial fibrillation 200 J or more, flutter 200 J, a regular narrow or monomorphic VT 100 J */
function syncEnergy(s: SimState): string {
  const k = rhythmKind(s);
  return k === 'af' || k === 'flutter' ? '200 J' : '100 J';
}

/** The tech opens, prepares and hands a device; the cardiologist uses it */
function deviceEffect(s: SimState, id: string): Effect {
  const label = INTERVENTION_BY_ID[id].label.split(' — ')[0];
  if (s.role === 3) return { say: [['you', `${label}: opened, prepped and handed to the operator.`]], flags: [`${id}-ready`] };
  const needs: Record<string, [string, string]> = {
    'guide-ebu': ['access', 'No arterial access yet.'], 'guide-jr4': ['access', 'No arterial access yet.'], 'guide-al1': ['access', 'No arterial access yet.'],
    'cath-tiger': ['access', 'No arterial access yet.'], 'cath-jl4': ['access', 'No arterial access yet.'], 'cath-jr4': ['access', 'No arterial access yet.'], 'cath-pigtail': ['access', 'No arterial access yet.'],
    'wire-workhorse': ['guide', 'Engage a guide catheter first.'], 'wire-hydrophilic': ['guide', 'Engage a guide catheter first.'],
    aspiration: ['wired', 'Wire the vessel first.'], 'balloon-predil': ['wired', 'Wire the vessel first.'], 'stent-des': ['wired', 'Wire the vessel first.'],
    'stent-covered': ['wired', 'Wire the vessel first.'], 'balloon-nc': ['stented', 'There is no stent to post-dilate yet.'],
  };
  const need = needs[id];
  if (need && !has(s, need[0])) return { blocked: true, say: [['system', need[1]]] };
  const result: Record<string, Effect> = {
    'cath-tiger': { say: [['you', 'Tiger catheter engaged — both coronaries can be injected with it.']], flags: ['catheter'] },
    'cath-jl4': { say: [['you', 'JL4 engaged in the left main.']], flags: ['catheter'] },
    'cath-jr4': { say: [['you', 'JR4 engaged in the right coronary ostium.']], flags: ['catheter'] },
    'cath-pigtail': { say: [['you', 'Pigtail across the aortic valve into the LV.']], flags: ['pigtail'] },
    'guide-ebu': { say: [['you', 'EBU 3.5 guide engaged in the left main.']], flags: ['guide', 'guide-left'] },
    'guide-jr4': { say: [['you', 'JR4 guide engaged in the right coronary.']], flags: ['guide', 'guide-right'] },
    'guide-al1': { say: [['you', 'AL1 guide engaged in the right coronary: strong back-up.']], flags: ['guide', 'guide-right'] },
    'wire-workhorse': { say: [['you', 'Workhorse wire across the lesion into the distal vessel.']], flags: ['wired'] },
    'wire-hydrophilic': { say: [['you', 'Hydrophilic wire across the lesion — watch the tip.']], flags: ['wired'] },
    aspiration: { say: [['you', 'Aspiration run: a little thrombus retrieved.']], flags: ['aspirated'] },
    'balloon-predil': { say: [['you', 'Pre-dilated with a 2.5 × 15 compliant balloon.']], flags: ['predilated'] },
    'stent-des': { say: [['you', 'Drug-eluting stent deployed at nominal pressure.']], flags: ['stented', 'pci'] },
    'balloon-nc': { say: [['you', 'Post-dilated with a non-compliant balloon at high pressure: good expansion.']], flags: ['postdilated'] },
    'stent-covered': { say: [['you', 'Covered stent deployed over the site.']], flags: ['covered-stent'] },
  };
  return result[id];
}

/** 0.4 mg sublingual; `high`: 0.8 mg, the pulmonary-edema dose, which unloads the heart (and drops the pressure) about twice as much */
function nitroEffect(s: SimState, high = false): Effect {
  if (!s.pulse) return noRoleInArrest('Nitroglycerin', 'nitro');
  const pain = Math.max(0, s.vitals.pain - 2);
  const bp = high ? bpAfter(s, -20, -10) : bpAfter(s, -10, -6);
  // only a patient who has chest pain, and is awake enough to say so, says how it feels
  const feels = s.vitals.pain > 0 ? ifAwake(s, pain <= 4 ? '"The pressure is easing."' : '"Maybe a little better."') : [];
  return {
    say: [...feels, ...bpLine(s, bp)],
    vitals: { pain, ...bp }, flags: high ? ['nitro', 'nitro-high'] : ['nitro'],
  };
}

/**
 * The monitor line after a drug or a bolus moves the pressure (`lead` first, e.g. "Bolus in."). With an LVAD no cuff
 * reads the pressure: the line keeps only what can be seen, and the Doppler MAP (or a reassessment after one) tells the rest.
 */
function bpLine(s: SimState, bp: { sbp: number; dbp: number }, lead = ''): Line[] {
  if (s.lvad) return lead ? [['monitor', lead]] : [];
  return [['monitor', `${lead ? `${lead} ` : ''}BP ${bp.sbp}/${bp.dbp}.`]];
}

/**
 * What V7–V9 show when the case gives no words of its own: the ST elevation (0.5 mm or more, to the nearest 0.5 mm) that
 * the rhythm's injury current projects onto the posterior leads — the same vector model the 12-lead is drawn from
 */
export function posteriorLeads(s: Pick<SimState, 'rhythm'>): string {
  const p = resolveProfile(s.rhythm.profile);
  const up = (['V7', 'V8', 'V9'] as const).map((l) => [l, Math.round(stLevel(p, l) * 2) / 2] as const).filter(([, mm]) => mm >= 0.5);
  if (!up.length) return 'V7–V9: no ST elevation.';
  return `V7–V9: ST elevation ${up.map(([l, mm]) => `${mm} mm in ${l}`).join(', ')}.`;
}

// ─── Built-in safety rules (every scenario): see rules/ ─────────────────────

/** The poisonings a case can list: the poison center has something to say about them */
const OVERDOSES: Problem[] = ['beta-blocker-overdose', 'ccb-overdose', 'sodium-channel-blocker-overdose'];

/**
 * An AV-nodal blocker in pre-excited AF (the default; a case can answer it in its own words): with the node blocked,
 * more impulses race down the pathway — the rate climbs (×1.12, 250 at most, as the Give-meds tool and the
 * defibrillator panel show), never falls. The monitor line describes what is seen and names nothing
 */
const fasterDownPathway = (s: SimState) => atRate(s, Math.min(250, Math.round(s.rhythm.hr * 1.12)));
const pathwayFaster: Line = ['monitor', 'The complexes come faster and wider.', 'bad'];

export { BUILT_IN_HARMS, RN_ORDER_ONLY };

// ─── Engine ────────────────────────────────────────────────────────────────

export function interventionsForScenario(sc: Scenario, role: LearningLevel): Intervention[] {
  return interventionsFor(role, sc.setting);
}

function applyEffect(s: SimState, e: Effect) {
  for (const line of e.say ?? []) say(s, line[0], line[1], line[2]);
  if (e.vitals) s.vitals = { ...s.vitals, ...e.vitals };
  if (e.rhythm) s.rhythm = { ...e.rhythm };
  if (e.pulse === false && s.pulse) {
    s.pulse = false;
    s.timers.arrestAt = s.minute;
    setFlag(s, 'arrest');
  } else if (e.pulse === true && !s.pulse) {
    s.pulse = true;
    delete s.timers.arrestAt;
    setFlag(s, 'rosc');
  }
  if (e.phase) s.phase = e.phase;
  for (const f of e.flags ?? []) setFlag(s, f);
  for (const f of e.clear ?? []) delete s.flags[f];
  if (e.timers) s.timers = { ...s.timers, ...e.timers };
  // the flag keeps the first shock's minute; the death line needs to know whether one was delivered in this arrest
  if (e.flags?.includes('shocked')) s.timers.lastShockAt = s.minute;
  if (e.image) s.images.push({ minute: s.minute, ...e.image });
  if (e.read && s.role !== 1) askRead(s, { ...e.read, minute: s.minute, ...(e.image?.image ? { run: s.images.length } : {}) });
  // a preventable deterioration the case charges: once per id
  if (e.penalty && !s.penalties.some((p) => p.id === e.penalty!.id)) s.penalties.push({ ...e.penalty, minute: s.minute });
  if (e.end && !s.ended) s.ended = { reason: e.end, minute: s.minute };
  boundVitals(s);
  noteBradycardia(s);
}

/**
 * The flag 'brady-seen': a slow heart of its own (a rate under 50, or second- or third-degree AV block, with a pulse and no
 * pacer driving it) has been on the monitor at some point — set the first time, at the start or after any change. A rule
 * about something meant for a slow rate (e.g. a pacing wire in the lab) reads it once the rate has come back up
 */
function noteBradycardia(s: SimState) {
  if (slowOrBlocked(s)) setFlag(s, 'brady-seen');
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/**
 * The last safety net for the vitals (each response should already keep inside them, so its text matches): a patient
 * with a pulse keeps a measurable pressure, the diastolic stays below the systolic, and nothing leaves its scale.
 */
function boundVitals(s: SimState) {
  const v = s.vitals;
  v.spo2 = clamp(v.spo2, 0, 100);
  v.rr = clamp(v.rr, 0, 60);
  v.etco2 = clamp(v.etco2, 0, 99);
  v.pain = clamp(v.pain, 0, 10);
  v.gcs = clamp(v.gcs, 3, 15);
  v.sbp = clamp(v.sbp, s.pulse ? PERFUSING_FLOOR.sbp : 0, 250);
  v.dbp = clamp(v.dbp, s.pulse ? PERFUSING_FLOOR.dbp : 0, 140);
  // a continuous-flow LVAD narrows the pulse pressure to a few mmHg: keep the case's own
  const pp = s.lvad ? LVAD_MIN_PULSE_PRESSURE : 10;
  if (s.pulse && v.dbp > v.sbp - pp) v.dbp = Math.max(PERFUSING_FLOOR.dbp, v.sbp - pp);
}

/** Ask the learner for a read (the next one waits if one is already open) */
function askRead(s: SimState, r: PendingRead) {
  if (s.ended) return;
  if (s.pendingRead) s.queuedReads.push(r);
  else s.pendingRead = r;
}

/**
 * The rules that charge this action (`id`), judged on the state just before it takes effect. Each rule charges at most
 * once per case. One mistake, one penalty:
 * - a case rule with the same id as a built-in replaces it always, for the roles the case rule is written for (a
 *   deliberate exemption);
 * - a case rule's `replaces` hides those built-ins only while the case rule applies to this action — same action, a role
 *   it is written for, its `when` true now (whether or not it was charged before). In any other state the built-ins apply;
 * - the ER nurse giving a drug without the order it needs: when the missing order is scored for this act — the built-in
 *   'rn-without-order-<id>' charges it, or a case rule that stands in for that one (same id, or listed in its `replaces`)
 *   applies to it, whether it charges now or already did — the built-in indication rules (INDICATION_RULES) are skipped
 *   for it: the missing order covers the indication. The contraindication rules still apply.
 */
function harmsFor(sc: Scenario, s: SimState, id: string) {
  const roleOk = (h: Harm) => !h.roles || h.roles.includes(s.role);
  const applies = (h: Harm) => h.actions.includes(id) && roleOk(h) && (!h.when || h.when(s, sc, id));
  const charged = (h: Harm) => s.penalties.some((p) => p.id === h.id);
  const own = new Set([...sc.harms.filter(roleOk).map((h) => h.id), ...sc.harms.filter(applies).flatMap((h) => h.replaces ?? [])]);
  const builtIn = BUILT_IN_HARMS.filter((b) => !own.has(b.id));
  const noOrderId = rnWithoutOrderId(id);
  const noOrderRule = BUILT_IN_HARMS.find((b) => b.id === noOrderId);
  // only for the role the order rule is written for (the ER nurse): a case rule for every role is no order for the doctor
  const orderCovers = !!noOrderRule && roleOk(noOrderRule) && (
    (!own.has(noOrderId) && !charged(noOrderRule) && applies(noOrderRule))
    || sc.harms.some((h) => (h.id === noOrderId || !!h.replaces?.includes(noOrderId)) && applies(h))
  );
  for (const h of [...builtIn.filter((b) => !(orderCovers && INDICATION_RULES.includes(b.id))), ...sc.harms]) {
    if (!applies(h) || charged(h)) continue;
    s.penalties.push({ id: h.id, minute: s.minute, points: h.points, severity: h.severity, text: h.text });
  }
}

export function criticalsFor(sc: Scenario, role: LearningLevel): Critical[] {
  return sc.critical.filter((c) => !c.roles || c.roles.includes(role));
}

/** Minute a critical item was achieved, or null */
export function achieved(c: Critical, s: SimState): number | null {
  if (typeof c.done === 'function') return c.done(s);
  const from = c.after !== undefined ? s.flags[c.after] : -Infinity;
  if (from === undefined) return null;
  const hit = s.performed.find((p) => (c.done as string[]).includes(p.id) && p.minute >= from);
  return hit ? hit.minute : null;
}

function isComplete(sc: Scenario, s: SimState) {
  if (!s.pulse) return false;
  if (sc.completeWhen && !sc.completeWhen(s)) return false;
  return criticalsFor(sc, s.role).every((c) => (c.applies && !c.applies(s)) || achieved(c, s) !== null);
}

/** Time has passed: arrival, scripted events, death */
function advance(sc: Scenario, s: SimState) {
  if (s.timers.arrive !== undefined && s.minute >= s.timers.arrive && !has(s, 'arrived')) {
    setFlag(s, 'arrived');
    // the hospital's words can depend on the patient's state on arrival (Scenario.arrival as a function)
    const arrival = typeof sc.arrival === 'function' ? sc.arrival(s) : sc.arrival;
    say(s, 'hospital', arrival ?? 'You arrive at the hospital; the team meets you at the door.');
  }
  // emergency department: the cath lab team activated earlier is ready for the patient
  if (s.timers.cathReady !== undefined && s.minute >= s.timers.cathReady && !has(s, 'cath-ready')) {
    setFlag(s, 'cath-ready');
    say(s, 'hospital', 'Cath lab: the team is in and the room is ready — bring the patient up.');
  }
  for (let pass = 0; pass < 4; pass++) {
    let fired = false;
    for (const ev of sc.events) {
      if (s.fired.includes(ev.id) || !ev.when(s)) continue;
      s.fired.push(ev.id);
      const e = ev.effect(s);
      applyEffect(s, e);
      // a teammate's 12-lead (an event that sets 'ecg12': the computer nurse's, in the ER doctor's run) is a recorded
      // tracing like the learner's own — it asks for the read, and a STEMI on it counts for the activation and the lytic
      if (e.flags?.includes('ecg12')) requestRead(sc, s);
      fired = true;
      if (s.ended) return;
    }
    if (!fired) break;
  }
  if (!s.pulse && s.timers.arrestAt !== undefined && s.minute - s.timers.arrestAt >= (sc.deathAfter ?? 15)) {
    // say what happened: a resuscitation that failed, or none at all from you in this arrest (a bystander's CPR is not yours).
    // Only compressions, or a shock that was delivered to VF or pulseless VT, resuscitate: a SYNC shock that never fired, an AED
    // that advised no shock, or a shock on PEA or asystole does not
    const from = s.timers.arrestAt;
    const cpr = s.performed.some((p) => p.id === 'cpr' && p.minute >= from);
    const shocked = s.timers.lastShockAt !== undefined && s.timers.lastShockAt >= from;
    // PEA and asystole are not shockable, so a missing shock is no omission there
    const none = shockable(s) ? 'You gave no CPR and no shock in this arrest.' : 'You gave no CPR in this arrest.';
    say(s, 'system', cpr || shocked
      ? 'Despite resuscitation there is no return of circulation. The patient has died.'
      : `${none} There is no return of circulation: the patient has died.`, 'bad');
    s.ended = { reason: 'death', minute: s.minute };
  }
}

/** The critical items for your role that apply now and are not done (the review counts the same ones as missed) */
function missingCriticals(sc: Scenario, s: SimState): number {
  return criticalsFor(sc, s.role).filter((c) => (!c.applies || c.applies(s)) && achieved(c, s) === null).length;
}

/** The case ends by itself once everything is done (never while a 12-lead read is pending) */
function finish(sc: Scenario, s: SimState) {
  if (s.ended || s.pendingRead) return;
  if (isComplete(sc, s)) {
    say(s, 'system', 'All critical interventions are done — scenario complete.', 'good');
    s.ended = { reason: 'complete', minute: s.minute };
  } else if (has(s, 'handoff')) {
    // a hand-off ends your care, whatever is still missing — in an arrest too: the receiving team takes over the CPR. The
    // review scores a hand-over without ROSC as it scores a death: it is no finished case
    // never "scenario complete" here: the case is not complete (isComplete failed), and the story must not read as if it were
    if (!s.pulse) say(s, 'system', sc.setting === 'field' ? 'Care handed over in cardiac arrest: the emergency department team takes over the resuscitation.' : 'Care handed over in cardiac arrest: the resuscitation team takes over.', 'warn');
    else {
      const missing = missingCriticals(sc, s);
      if (missing > 0) say(s, 'system', `Care handed over with ${missing} critical item${missing === 1 ? '' : 's'} still not done.`, 'warn');
      else say(s, 'system', 'Care handed over before the case was over.', 'info');
    }
    s.ended = { reason: 'complete', minute: s.minute };
  }
}

function tick(sc: Scenario, s: SimState) {
  advance(sc, s);
  finish(sc, s);
}

/** The rate band a tracing is read in: under 60 (brady-), 60–100, over 100 (tachy-), as atRate names a sinus rhythm */
const rateBand = (hr: number) => (hr < 60 ? 0 : hr <= 100 ? 1 : 2);

/** A rate change of more than this (per minute) makes a new tracing even within one band */
const ECG_RATE_CHANGE = 20;

/**
 * The patient's rhythm is no longer the one on the last 12-lead: another rhythm, or the same one at a rate out of the
 * band it was read in (crossing 60 or 100) or more than 20/min away. A repeat 12-lead then needs a new read, and the
 * 12-lead view says the patient has changed since it was recorded.
 */
export function ecgChanged(last: SimState['lastEcg'], rhythm: SimState['rhythm']): boolean {
  if (!last) return true;
  if (last.profile !== rhythm.profile) return true;
  return rateBand(last.hr) !== rateBand(rhythm.hr) || Math.abs(last.hr - rhythm.hr) > ECG_RATE_CHANGE;
}

/** A new 12-lead tracing waits for the learner's read (EMTs acquire and transmit; they do not interpret) */
function requestRead(sc: Scenario, s: SimState) {
  if (s.ended || !s.pulse) return;
  const prev = s.lastEcg;
  const unchanged = !ecgChanged(prev, s.rhythm);
  // an unchanged repeat is the tracing already read: it keeps that one's rate, so a slow drift still adds up to a change
  s.lastEcg = { minute: s.minute, profile: s.rhythm.profile, hr: unchanged && prev ? prev.hr : s.rhythm.hr };
  // remembered for good, for every role: the STEMI alert rests on the tracing that showed it
  if (profileShowsStemi(s.rhythm.profile)) setFlag(s, 'ecg-stemi');
  if (s.role === 1) return;
  if (unchanged) say(s, 'monitor', 'Unchanged from the previous 12-lead.');
  else {
    const profile = s.rhythm.profile;
    askRead(s, { kind: 'ecg', minute: s.minute, answer: answerFor(profile).id, partial: partialFor(profile), explain: ecgExplanation(sc, s, profile) });
  }
}

/** Your read of what is waiting; the feedback confirms or corrects it at once (no case time passes) */
export function answerRead(sc: Scenario, prev: SimState, optionId: string): SimState {
  const choice = READ_OPTION_BY_ID[optionId];
  if (!prev.pendingRead || prev.ended || !choice) return prev;
  const s: SimState = structuredClone(prev);
  const r = s.pendingRead!;
  s.pendingRead = s.queuedReads.shift() ?? null;
  const verdict = optionId === r.answer ? 'correct' : r.partial?.includes(optionId) ? 'partial' : 'wrong';
  const answer = READ_OPTION_BY_ID[r.answer];
  say(s, 'you', `My read: ${choice.label}.`);
  if (verdict === 'correct') say(s, 'feedback', `Correct. ${r.explain}`, 'good');
  else if (verdict === 'partial') say(s, 'feedback', `Partly right — the full read is ${answer.label}. ${r.explain}`, 'warn');
  else say(s, 'feedback', `Not quite — this is ${answer.label}. ${r.explain}`, 'bad');
  s.reads.push({ kind: r.kind, minute: r.minute, answer: r.answer, chosen: optionId, verdict });
  if (verdict !== 'correct') {
    s.penalties.push({
      id: `misread-${s.reads.length}`, minute: r.minute, points: verdict === 'partial' ? 2 : 5, severity: verdict === 'partial' ? 'minor' : 'major',
      text: `${capitalize(READ_KIND_NAME[r.kind])} at ${clockText(r.minute)}: you read “${choice.label}”; it was ${answer.label}.`,
    });
  }
  finish(sc, s);
  return s;
}


export function start(sc: Scenario, role: LearningLevel): SimState {
  const s: SimState = {
    scenarioId: sc.id, role, minute: 0,
    rhythm: { ...sc.initial.rhythm }, vitals: { ...sc.initial.vitals },
    pulse: sc.initial.pulse ?? true, phase: sc.initial.phase ?? 'initial',
    flags: {}, timers: {}, counts: {}, performed: [], log: [], penalties: [], fired: [], ended: null,
    pendingRead: null, queuedReads: [], reads: [], images: [], lastEcg: null,
  };
  if (sc.initial.lvad) s.lvad = true;
  if (!s.pulse) {
    s.timers.arrestAt = 0;
    setFlag(s, 'arrest');
  }
  noteBradycardia(s);
  for (const line of sc.briefing[role] ?? sc.briefing.default) say(s, line[0], line[1], line[2]);
  tick(sc, s);
  return s;
}

/** Why an intervention can't be chosen right now (null if it can) */
export function unavailableReason(sc: Scenario, s: SimState, id: string): string | null {
  const iv = INTERVENTION_BY_ID[id];
  if (!iv) return 'Unknown intervention';
  if (s.ended) return 'The scenario has ended';
  if (s.pendingRead) return `Give your ${READ_KIND_NAME[s.pendingRead.kind]} read first`;
  if (!iv.roles.includes(s.role) || (iv.settings && !iv.settings.includes(sc.setting))) return 'Outside your scope';
  const n = s.counts[id] ?? 0;
  if (!iv.repeatable && n > 0) return 'Already done';
  // a drug or a bolus counts doses; a call (medical control, the poison center) counts calls
  if (iv.maxTimes && n >= iv.maxTimes) return `Maximum ${iv.maxTimes} ${iv.category === 'team' ? 'calls' : 'doses'}`;
  return null;
}

export function perform(sc: Scenario, prev: SimState, id: string): SimState {
  const reason = unavailableReason(sc, prev, id);
  if (reason) return prev;
  const iv = INTERVENTION_BY_ID[id];
  const s: SimState = structuredClone(prev);
  if (iv.needsAccess && !has(s, 'iv')) {
    say(s, 'system', 'No IV or IO access yet — start one first.');
    return s;
  }
  const effect = sc.respond[id]?.(s) ?? defaultEffect(sc, s, id);
  if (effect.blocked) {
    for (const line of effect.say ?? []) say(s, line[0], line[1], line[2]);
    return s;
  }
  harmsFor(sc, s, id);
  // a reassessment prints the pressure — the default line, and a case's own reassessment alike (not with an LVAD: no cuff
  // reads it; not in an arrest) — so the learner has seen one: the "pressure before nitroglycerin" rules read 'bp'. (A
  // copy: a case may answer with a shared Effect object)
  const shown = id === 'reassess' && s.pulse && !s.lvad ? { ...effect, flags: [...(effect.flags ?? []), 'bp'] } : effect;
  // an intervention counts from the minute it was started; its result comes when it is finished
  const detail = detailFor(iv, sc.setting);
  say(s, 'you', detail ? `${iv.label} — ${detail}` : iv.label);
  s.counts[id] = (s.counts[id] ?? 0) + 1;
  s.performed.push({ id, minute: s.minute });
  s.minute = round(s.minute + iv.minutes);
  applyEffect(s, shown);
  if (!s.ended) advance(sc, s);
  if (id === 'ecg12' || id === 'ecg12-repeat') requestRead(sc, s);
  finish(sc, s);
  return s;
}

/** The method, when you ask for help with a read (it costs nothing) */
const READ_COACHING: Record<PendingRead['kind'], string> = {
  ecg: 'Work through it: rate, rhythm (P waves?), axis, PR / QRS / QT, then the ST segments lead by lead — which leads, and is there a reciprocal change?',
  hemo: 'Compare each number with normal: RA 2–8, RV 15–30/2–8, PA 15–30/4–12, PCWP 6–12, LVEDP under 12–15, cardiac index above 2.2. Then look at the pattern, and at the waveform itself.',
  physiology: 'FFR: 0.80 or less is significant. Before you trust the number, ask: was the wire equalized, and was hyperemia adequate?',
  sizing: 'Diameter: match the reference vessel 1:1 (round to the nearest size up). Length: cover the lesion edge to edge, with a few millimeters of healthy vessel at each end.',
  clinical: 'Put it together: what just happened (contrast, a balloon, a wire, a drug), then the rate, the pressure, the skin, the breathing and what the patient says.',
  angio: 'Go segment by segment: left main, LAD, diagonals, circumflex, marginals, RCA, PDA. Where does the contrast stop or narrow, and how fast does it fill the vessel beyond?',
};

/** Points a hint costs */
export const HINT_POINTS = 2;
export const isHint = (p: { id: string }) => p.id.startsWith('hint-');

/** The next critical item still missing, if any */
export function nextCritical(sc: Scenario, s: SimState): Critical | null {
  return criticalsFor(sc, s.role).find((c) => (!c.applies || c.applies(s)) && achieved(c, s) === null) ?? null;
}

/** A hint names the next critical item still missing — at a small cost — and takes no scenario time */
export function takeHint(sc: Scenario, prev: SimState): SimState {
  if (prev.ended) return prev;
  const s: SimState = structuredClone(prev);
  if (s.pendingRead) {
    say(s, 'feedback', READ_COACHING[s.pendingRead.kind]);
    return s;
  }
  const next = nextCritical(sc, s);
  if (!next) {
    say(s, 'system', 'Hint: nothing critical is missing right now — keep reassessing and watch the monitor.');
    return s;
  }
  s.penalties.push({ id: `hint-${s.penalties.filter(isHint).length + 1}`, minute: s.minute, points: HINT_POINTS, severity: 'minor', text: `Hint used: ${next.label}.` });
  say(s, 'system', `Hint: ${next.label}. ${next.why}`, 'info');
  return s;
}

export function stop(prev: SimState): SimState {
  if (prev.ended) return prev;
  const s: SimState = structuredClone(prev);
  say(s, 'system', 'Scenario ended early.', 'warn');
  s.ended = { reason: 'stopped', minute: s.minute };
  return s;
}

// ─── Review ────────────────────────────────────────────────────────────────

/** The highest score a case can earn when it ends with the patient in cardiac arrest: dead, or handed over still in arrest */
const NO_ROSC_CAP = 40;

function gradeFor(p: number): Review['grade'] {
  if (p >= 90) return 'Excellent';
  if (p >= 75) return 'Competent';
  if (p >= 50) return 'Needs practice';
  return 'Unsafe';
}

export function review(sc: Scenario, s: SimState): Review {
  const wentWell: ReviewItem[] = [];
  const toFix: Review['toFix'] = [];
  let earned = 0;
  let max = 0;
  for (const c of criticalsFor(sc, s.role)) {
    if (c.applies && !c.applies(s)) continue;
    const pts = c.points ?? 10;
    max += pts;
    const m = achieved(c, s);
    const actions = Array.isArray(c.done) ? c.done : c.uses ?? [];
    if (m === null) {
      toFix.push({ kind: 'missed', label: c.label, detail: c.why, points: pts, actions });
      continue;
    }
    let onTime = true;
    let target = '';
    // minutes are sums of tenths: round before comparing, so 9.3 − 7.3 (2.000000000000001) is on time for "within 2"
    if (c.target?.by !== undefined && round(m) > c.target.by) {
      onTime = false;
      target = `done at ${clockText(m)}; the goal is by ${clockText(c.target.by)}`;
    }
    const w = c.target?.within;
    if (w && s.flags[w.flag] !== undefined && round(m - s.flags[w.flag]) > w.minutes) {
      onTime = false;
      target = `done ${clockText(m - s.flags[w.flag])} after it was needed; the goal is within ${clockText(w.minutes)}`;
    }
    if (onTime) {
      earned += pts;
      wentWell.push({ label: c.label, detail: `at ${clockText(m)}`, points: pts });
    } else {
      earned += pts / 2;
      toFix.push({ kind: 'late', label: c.label, detail: `${target}. ${c.why}`, points: pts / 2, actions });
    }
  }
  const penaltyPoints = s.penalties.reduce((a, p) => a + p.points, 0);
  for (const p of s.penalties) {
    if (isHint(p)) toFix.push({ kind: 'hint', label: p.text, detail: 'You asked for a hint. Try the case again without one.', points: p.points });
    else if (p.id.startsWith('misread-')) {
      // "12-lead at 3:00: you read …" → label "Misread 12-lead at 3:00", detail "You read …"
      const cut = p.text.indexOf(': ');
      const what = p.text.slice(0, cut);
      toFix.push({ kind: 'read', label: `Misread ${what.charAt(0).toLowerCase()}${what.slice(1)}`, detail: p.text.slice(cut + 2).replace(/^you/, 'You'), points: p.points, severity: p.severity });
    }
    else {
      // the first sentence is the headline, the rest explains it
      const [first, ...rest] = p.text.split('. ');
      const actions = [...BUILT_IN_HARMS, ...sc.harms].find((h) => h.id === p.id)?.actions;
      toFix.push({ kind: 'harm', label: first.endsWith('.') ? first : `${first}.`, detail: rest.join('. '), points: p.points, severity: p.severity, actions });
    }
  }
  let percent = max > 0 ? Math.round((100 * Math.max(0, earned - penaltyPoints)) / max) : 0;
  // handed over still in cardiac arrest (a hand-off on arrival, or a case's own): the items that wait for ROSC drop out,
  // so without a cap a pulseless "load and go" would score as a finished case
  const arrestHandover = s.ended?.reason === 'complete' && !s.pulse;
  if (s.ended?.reason === 'death' || arrestHandover) percent = Math.min(percent, NO_ROSC_CAP);
  const sev = { critical: 0, major: 1, minor: 2 };
  const rank = (t: Review['toFix'][number]) => (t.kind === 'harm' ? sev[t.severity ?? 'minor'] : t.kind === 'read' ? 2.5 : t.kind === 'hint' ? 4 : 3);
  toFix.sort((a, b) => rank(a) - rank(b) || b.points - a.points);

  const timings: Review['timings'] = [];
  for (const t of sc.timings ?? []) {
    const from = t.from ? s.flags[t.from] : 0;
    if (from === undefined) continue; // the event it is timed from never happened
    const hit = s.performed.find((p) => t.actions.includes(p.id) && p.minute >= from);
    const at = hit ? hit.minute : t.flag !== undefined && s.flags[t.flag] !== undefined ? s.flags[t.flag] : null;
    const minute = at !== null ? round(at - from) : null;
    timings.push({ label: t.label, minute, target: t.target, met: t.target === undefined ? null : minute !== null && minute <= t.target });
  }

  // a hand-off also ends the case as complete, whatever is still missing: say which it was. Items that had not come up
  // yet are not counted as missed, so the count alone cannot tell a finished case from an early hand-off — and a hand-over
  // in cardiac arrest says so, since every item that waits for ROSC has dropped out.
  const missed = toFix.filter((t) => t.kind === 'missed').length;
  const notDone = `${missed} critical item${missed === 1 ? '' : 's'} not done`;
  let outcome: string;
  if (s.ended?.reason === 'death') outcome = 'The patient died.';
  else if (arrestHandover) {
    const how = has(s, 'rosc') ? ', after the pulse was lost again' : ', without ROSC';
    outcome = `Handed over in cardiac arrest at ${clockText(s.ended!.minute)}${how}${missed === 0 ? '' : `, with ${notDone}`}.`;
  }
  else if (s.ended?.reason === 'complete') {
    outcome = isComplete(sc, s)
      ? `Every critical intervention done in ${clockText(s.ended.minute)}.`
      : `Care handed over at ${clockText(s.ended.minute)}${missed === 0 ? ', before the case was over' : ` with ${notDone}`}.`;
  } else outcome = `Ended early at ${clockText(s.minute)} with ${notDone}.`;

  const reads = s.reads.map((r) => ({ kind: r.kind, minute: r.minute, chosen: READ_OPTION_BY_ID[r.chosen].label, answer: READ_OPTION_BY_ID[r.answer].label, verdict: r.verdict }));
  return { percent, earned, max, penaltyPoints, grade: gradeFor(percent), outcome, missed, timings, wentWell, toFix, reads, hints: s.penalties.filter(isHint).length, teaching: sc.teaching };
}
