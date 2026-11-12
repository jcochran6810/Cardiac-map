/**
 * Scenario engine: pure, deterministic state transitions for the simulator.
 *
 *   start(scenario, role) → state
 *   perform(scenario, state, interventionId) → new state   (time passes, patient responds, events fire)
 *   stop(scenario, state) → ended state
 *   review(scenario, state) → score, timings, what went well, what to fix
 *
 * Each intervention has a default response here; a scenario overrides the ones that matter for its
 * patient (scenario.respond). Built-in safety rules apply to every scenario on top of the scenario's
 * own harms; the drug rules also read what the case says the patient has (scenario.problems: high
 * potassium, an overdose, heart failure, a long QT). The scenario ends by itself once every critical
 * intervention for the learner's role is done and the patient has a pulse (plus any scenario-specific condition).
 */
import type { LearningLevel } from '@/store/useAppStore';
import { resolveProfile } from '@/lib/ecg/profiles';
import { INTERVENTION_BY_ID, interventionsFor } from './interventions';
import { READ_KIND_NAME, READ_OPTIONS, READ_OPTION_BY_ID, answerFor, partialFor } from './reads';
import { angioGate } from './labKit';
import { LOW_GLUCOSE, PERFUSING_FLOOR, arrestEtco2, atRate, bpAfter, canSwallow, paced, ventilated } from './kit';
import type {
  Critical, Effect, FactKey, Harm, Intervention, Line, PendingRead, Problem, Review, ReviewItem, Scenario, SimState, Speaker, Tone,
} from './types';

const round = (m: number) => Math.round(m * 10) / 10;
const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
export const clockText = (minute: number) => {
  const total = Math.round(minute * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

// ─── State helpers ─────────────────────────────────────────────────────────

export function rhythmKind(s: SimState) {
  return resolveProfile(s.rhythm.profile).rhythm;
}

/** Pulseless VF / VT / torsades */
export function shockable(s: SimState): boolean {
  const k = rhythmKind(s);
  return !s.pulse && (k === 'vf' || k === 'vt' || k === 'torsades');
}

/** Rhythms synchronized cardioversion treats (with a pulse and a fast rate): SVT, atrial fibrillation or flutter, monomorphic VT */
const CARDIOVERTIBLE = ['svt', 'af', 'flutter', 'vt'];
export function tachyarrhythmia(s: SimState): boolean {
  return s.pulse && CARDIOVERTIBLE.includes(rhythmKind(s)) && s.rhythm.hr >= 100;
}

export const has = (s: SimState, flag: string) => flag in s.flags;
export const did = (s: SimState, id: string) => (s.counts[id] ?? 0) > 0;
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
    case 'scene': return { say: [['scene', 'Scene is safe. Gloves on.']] };
    case 'primary':
      return s.pulse
        ? { say: [['you', `Airway open, breathing ${v.rr}/min, radial pulse ${s.rhythm.hr}/min, GCS ${v.gcs}.`]] }
        : { say: [['you', 'Unresponsive, not breathing normally, no pulse.', 'bad']] };
    case 'opqrst': return { say: [['patient', fact('opqrst') ?? 'It just feels wrong.']], flags: ['opqrst'] };
    case 'sample': return { say: [['patient', fact('sample') ?? 'No allergies, no medicines.']], flags: ['sample'] };
    case 'ask-pde5': return { say: [['patient', fact('pde5') ?? 'No, nothing like that.']], flags: ['pde5-asked'] };
    case 'vitals': return { say: [['you', vitalsLine(s)]], flags: ['bp'] };
    case 'nibp':
      if (!has(s, 'monitor')) return { blocked: true, say: [['system', 'Attach the monitor first, or take a manual set of vitals.']] };
      return { say: [['monitor', s.pulse ? `NIBP ${bpText(s)} mmHg.` : 'NIBP: no reading.']], flags: ['bp'] };
    case 'pulse-check':
      return s.pulse
        ? { say: [['you', `Pulse present: ${s.rhythm.hr}/min${v.sbp < 90 ? ', weak and thready' : ''}.`]] }
        : { say: [['you', 'No pulse.', 'bad']], flags: ['pulseless-confirmed'] };
    case 'lungs': return { say: [['you', fact('lungs') ?? 'Clear and equal on both sides.']], flags: ['lungs'] };
    case 'perfusion': return { say: [['you', fact('perfusion') ?? 'Skin warm and dry; no JVD; pulses equal.']], flags: ['perfusion'] };
    case 'glucose': return { say: [['you', `Blood glucose ${v.glucose} mg/dL.`]] };
    case 'neuro': return { say: [['you', `GCS ${v.gcs}. ${fact('neuro') ?? 'No focal deficit.'}`]] };
    case 'reassess':
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
      return { say: [['monitor', fact('ecgPosterior') ?? 'V7–V9: no ST elevation.']], flags: ['ecg-posterior'] };
    case 'capno': {
      if (s.pulse) return { say: [['monitor', `EtCO₂ ${v.etco2} mmHg with a normal square waveform.`]], flags: ['capno'] };
      // the shared arrest rule, which the case monitor shows too: almost nothing with no breaths, then the blood flow
      const etco2 = arrestEtco2(s);
      return { say: [['monitor', ventilated(s) ? `EtCO₂ ${etco2} mmHg.` : `EtCO₂ ${etco2} mmHg: almost no waveform.`]], flags: ['capno'] };
    }
    case 'transducer': return { say: [['you', 'Transducers zeroed to air and leveled at the phlebostatic axis.']], flags: ['transducer'] };
    case 'labs': return { say: [['team', fact('labs') ?? 'Labs sent: troponin, electrolytes, CBC, coagulation.']], flags: ['labs'] };
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
    case 'cpap': return { say: [['you', 'CPAP applied at 5 cmH₂O.']], flags: ['cpap'] };
    case 'airway':
      // an awake patient gags on any airway device and protects their own airway: it cannot be placed
      if (s.pulse && v.gcs > 8) return { say: [['patient', 'The patient gags, coughs and pushes it away: someone this awake protects their own airway. The airway comes out.', 'bad']] };
      return { say: [['you', 'Airway placed; confirmed with waveform capnography.']], flags: ['airway', 'ventilated'] };

    case 'iv': return { say: [['you', 'IV established: 18 G, left forearm.']], flags: ['iv'] };
    case 'io': return { say: [['you', 'IO established: proximal humerus.']], flags: ['iv'] };
    case 'fluid': {
      if (!s.pulse) return { say: [['you', 'Fluid running.']], flags: ['fluid'] };
      const bp = bpAfter(s, 8, 5);
      return { say: [['monitor', `Bolus in. BP ${bp.sbp}/${bp.dbp}.`]], vitals: bp, flags: ['fluid'] };
    }

    case 'aspirin': return { say: [['patient', 'Chews the aspirin.']], flags: ['aspirin'] };
    case 'nitro-assist':
      if (!fact('ownNitro')) return { blocked: true, say: [['patient', "I don't have any nitroglycerin of my own."]] };
      return nitroEffect(s);
    case 'nitro': return nitroEffect(s);
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
    case 'p2y12': return { say: [['you', 'P2Y12 loading dose given.']], flags: ['p2y12'] };
    case 'metoprolol': {
      if (!s.pulse) return noRoleInArrest('Metoprolol', 'beta-blocker');
      const bp = bpAfter(s, -12, -8);
      // a pacer sets the rate, so only the heart's own rate slows — by 10, not below 40, and never up to 40 from a slower one
      const hr = Math.min(s.rhythm.hr, Math.max(40, s.rhythm.hr - 10));
      return { say: [['monitor', `Metoprolol given. BP ${bp.sbp}/${bp.dbp}.`]], vitals: bp, ...(paced(s) ? {} : { rhythm: atRate(s, hr) }), flags: ['beta-blocker'] };
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
      return { say: [['monitor', 'A brief pause, then the same rhythm returns.']], flags: ['adenosine'] };
    case 'diltiazem': {
      if (!s.pulse) return noRoleInArrest('Diltiazem', 'diltiazem');
      const bp = bpAfter(s, -12, -8);
      return { say: [['monitor', `Diltiazem in. BP ${bp.sbp}/${bp.dbp}.`]], vitals: bp, flags: ['diltiazem'] };
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
    case 'amio-infusion': return { say: [['you', 'Amiodarone 150 mg running over 10 minutes.']], flags: ['amiodarone'] };
    case 'lidocaine': return { say: [['you', 'Lidocaine given.']], flags: ['lidocaine'] };
    case 'push-epi': {
      if (!s.pulse) return { say: [['you', 'Push-dose epinephrine given.']], flags: ['push-epi'] };
      const bp = bpAfter(s, 16, 10);
      return { say: [['monitor', `BP ${bp.sbp}/${bp.dbp} for a few minutes.`]], vitals: bp, flags: ['push-epi'] };
    }
    case 'pressor': {
      if (!s.pulse) return { say: [['you', 'Infusion running — with no circulation there is no pressure to raise yet.']], flags: ['pressor'] };
      const bp = bpAfter(s, 22, 14, { sbp: 140, dbp: 88 });
      return { say: [['monitor', `Infusion running. BP ${bp.sbp}/${bp.dbp}.`]], vitals: bp, flags: ['pressor'] };
    }
    case 'sedation':
      if (!s.pulse) return { blocked: true, say: [['system', 'Not in cardiac arrest: there is no one awake to sedate. CPR, the rhythm and the cause come first.']] };
      return { say: [['you', 'Sedated and comfortable; airway maintained, capnography on.']], flags: ['sedation'] };
    case 'tnk': return { say: [['you', 'Tenecteplase given.']], flags: ['lytic'] };
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
      return { say: [['you', 'Magnesium sulfate 2 g running over 15 minutes.'], ...ifAwake(s, '"I feel warm and flushed."'), ['monitor', `BP ${bp.sbp}/${bp.dbp}.`]], vitals: bp, flags: ['magnesium'] };
    }
    case 'procainamide': {
      if (!s.pulse) return noRoleInArrest('Procainamide', 'procainamide');
      // it vasodilates and weakens the squeeze: the pressure falls; whether the arrhythmia stops is the case's to say
      const bp = bpAfter(s, -10, -6);
      return { say: [['you', 'Procainamide running at 30 mg/min; BP and QRS width checked every few minutes.'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`]], vitals: bp, flags: ['procainamide'] };
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
      return s.role === 3
        ? { say: [['you', 'Pericardiocentesis tray open: needle, wire, drain and a drainage bag; echo probe in a sterile sleeve.']], flags: ['pericardiocentesis-ready'] }
        : { say: [['you', 'Pericardial drain in under echo guidance.']], flags: ['pericardiocentesis'] };
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
      // a transvenous wire goes up a vein into the right ventricle, and nobody floats one during CPR
      if (!has(s, 'venous')) return { blocked: true, say: [['system', 'A transvenous pacing wire goes in through a vein: get femoral venous access first.']] };
      if (!s.pulse) return { blocked: true, say: [['system', 'Not during cardiac arrest: CPR and the arrest algorithm come first.']] };
      if (s.rhythm.hr < 50) {
        const bp = { sbp: Math.max(v.sbp, 100), dbp: Math.max(v.dbp, 62) };
        return {
          say: [['you', 'Temporary wire in the RV apex: threshold 0.6 mA; pacing at 70, output 3 mA.'], ['monitor', `Heart rate 70. BP ${bp.sbp}/${bp.dbp}.`, 'good']],
          rhythm: { profile: 'paced', hr: 70 }, vitals: bp, flags: ['temp-wire', 'paced'],
        };
      }
      const faster = paced(s) ? `The heart is already paced at ${s.rhythm.hr}` : `The heart's own rate of ${s.rhythm.hr} is faster`;
      return { say: [['you', `Temporary wire in the RV apex: threshold 0.6 mA, output 3 mA, set to pace on demand below 50. ${faster}, so it is not pacing.`]], flags: ['temp-wire'] };
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
    case 'hemostasis':
      return has(s, 'femoral')
        ? { say: [['you', 'Femoral sheath out; firm pressure for 15 minutes, then a dressing. Distal pulses checked; no hematoma.']], flags: ['hemostasis'] }
        : { say: [['you', 'Radial band on; distal pulse and perfusion checked.']], flags: ['hemostasis'] };

    case 'call-help':
      // in the lab the code team is down the hall; in the field nobody comes without a named request, so nothing is promised
      if (sc.setting === 'cathlab') return { say: [['team', 'Help is on the way.']], flags: ['help'] };
      return {
        say: [['dispatch', s.role === 1
          ? '"Copy. What do you need? For a paramedic, request an ALS intercept."'
          : '"Copy. No other unit is free right now: it is your crew for the moment. Tell us if you need something specific."']],
        flags: ['help'],
      };
    case 'callout': return { say: [['operator', 'Copy.']], flags: ['callout'] };
    case 'als': return { say: [['dispatch', 'Medic unit assigned, about 6 minutes out.']], flags: ['als'] };
    case 'med-control': return { say: [['hospital', 'Medical control: continue per protocol.']], flags: ['med-control'] };
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

/**
 * A drug with no role in cardiac arrest, given in one. Not "it cannot circulate": compressions move enough blood to carry
 * an IV/IO drug (that is how epinephrine and amiodarone work during CPR) — this one simply has nothing to treat there.
 */
const noRoleInArrest = (what: string, flag: string): Effect => ({ say: [['you', `${what} given — it has no place in cardiac arrest and changes nothing on the monitor.`]], flags: [flag] });

/** The crew member or teammate who speaks up beside the learner */
const teammate = (sc: Scenario): Speaker => (sc.setting === 'field' ? 'partner' : 'team');

/** Only a patient awake enough to talk says how a drug feels */
const ifAwake = (s: SimState, text: string): Line[] => (s.pulse && s.vitals.gcs >= 13 ? [['patient', text]] : []);

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

/**
 * 12-lead patterns whose ST elevation meets STEMI criteria, so the cath lab is activated (a Takotsubo pattern looks the
 * same until the angiogram shows open arteries)
 */
const STEMI_READS = ['stemi-anterior', 'stemi-inferior', 'stemi-lateral', 'stemi-inferior-chb', 'takotsubo'];

/** A tracing of this rhythm meets STEMI criteria */
function profileShowsStemi(profile: string): boolean {
  const read = READ_OPTIONS.find((o) => o.profiles?.includes(profile));
  return !!read && STEMI_READS.includes(read.id);
}

/**
 * A 12-lead recorded so far showed a STEMI (flag 'ecg-stemi', set as each tracing is recorded). The diagnostic tracing
 * decides: a later one that hides the ST elevation (paced beats, a new bundle branch block) does not open the artery,
 * so the patient still needs primary PCI (2025 ACC/AHA ACS guideline).
 */
const ecgShowsStemi = (s: SimState) => has(s, 'ecg-stemi');

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

function nitroEffect(s: SimState): Effect {
  if (!s.pulse) return noRoleInArrest('Nitroglycerin', 'nitro');
  const pain = Math.max(0, s.vitals.pain - 2);
  const bp = bpAfter(s, -10, -6);
  // only a patient who has chest pain, and is awake enough to say so, says how it feels
  const feels = s.vitals.pain > 0 ? ifAwake(s, pain <= 4 ? '"The pressure is easing."' : '"Maybe a little better."') : [];
  return {
    say: [...feels, ['monitor', `BP ${bp.sbp}/${bp.dbp}.`]],
    vitals: { pain, ...bp }, flags: ['nitro'],
  };
}

// ─── Built-in safety rules (every scenario) ────────────────────────────────

/** The case says the patient has at least one of these problems */
function hasProblem(sc: Scenario, problems: Problem[]): boolean {
  return problems.some((p) => sc.problems?.includes(p));
}
const CALCIUM_FOR: Problem[] = ['hyperkalemia', 'hypocalcemia', 'ccb-overdose', 'beta-blocker-overdose'];
/** The poisonings a case can list: the poison center has something to say about them */
const OVERDOSES: Problem[] = ['beta-blocker-overdose', 'ccb-overdose', 'sodium-channel-blocker-overdose'];
const BICARBONATE_FOR: Problem[] = ['hyperkalemia', 'metabolic-acidosis', 'sodium-channel-blocker-overdose'];
/** Second- and third-degree AV block */
const AV_BLOCKS = ['wenckebach', 'mobitz2', 'chb'];

export const BUILT_IN_HARMS: Harm[] = [
  { id: 'cpr-with-pulse', actions: ['cpr'], when: (s) => s.pulse, points: 10, severity: 'major', text: 'Chest compressions on a patient with a pulse. Check for a pulse (no more than 10 seconds) before starting CPR.' },
  // a manual shock fires whatever the rhythm; an AED is not applied to a patient with a pulse (the default refuses it)
  { id: 'shock-with-pulse', actions: ['defib'], when: (s) => s.pulse, points: 15, severity: 'critical', text: 'Unsynchronized shock to a patient with a pulse: it can land on the T wave and cause VF. Unstable tachycardia with a pulse needs synchronized cardioversion.' },
  { id: 'shock-nonshockable', actions: ['defib', 'cardiovert'], when: (s) => !s.pulse && !shockable(s), points: 10, severity: 'major', text: 'Asystole and PEA are not shockable: shocking them interrupts CPR and does not help. Give CPR and epinephrine and look for reversible causes.' },
  { id: 'sync-in-arrest', actions: ['cardiovert'], when: (s) => shockable(s), points: 8, severity: 'major', text: 'Synchronized mode needs R waves; in VF or pulseless VT it may never fire. Defibrillate unsynchronized.' },
  { id: 'cardiovert-no-tachycardia', actions: ['cardiovert'], when: (s) => s.pulse && !tachyarrhythmia(s), points: 8, severity: 'major', text: 'Synchronized cardioversion without a tachyarrhythmia to treat. It is for an unstable SVT, atrial fibrillation or flutter, or monomorphic VT; on any other rhythm the shock cannot help, and it hurts an awake patient.' },
  { id: 'arrest-epi-with-pulse', actions: ['epinephrine'], when: (s) => s.pulse, points: 15, severity: 'critical', text: '1 mg IV epinephrine is the cardiac-arrest dose. With a pulse it causes severe hypertension, arrhythmias and ischemia; use push-dose epinephrine or an infusion.' },
  { id: 'arrest-amio-with-pulse', actions: ['amio-arrest'], when: (s) => s.pulse, points: 10, severity: 'major', text: 'A 300 mg amiodarone push is for cardiac arrest. With a pulse, give 150 mg over 10 minutes.' },
  // on-scene resuscitation until a sustained ROSC, for most adults (2025 AHA Systems of Care). Only the loading is judged:
  // an arrest that begins en route is worked in the ambulance, and that is no mistake
  { id: 'transport-in-arrest', actions: ['transport-near', 'transport-pci'], when: (s, sc) => sc.setting === 'field' && !s.pulse, points: 6, severity: 'major', text: 'Loading the patient for transport during cardiac arrest. Compressions on a stretcher and in a moving ambulance are poorer and keep being interrupted, and what the arrest needs — high-quality CPR, a shock for VF or pulseless VT, epinephrine and the reversible causes — works right here. For most adults, work the arrest on scene until there is a sustained ROSC, then transport (2025 AHA).' },
  { id: 'airway-awake', actions: ['airway'], when: (s) => s.pulse && s.vitals.gcs > 8, points: 10, severity: 'major', text: 'An advanced airway is not indicated in a patient who is awake and protecting their own airway.' },
  // pads on standby over a paced heart (a temporary wire) are a backup, not a mistake
  { id: 'pace-not-slow', actions: ['pace'], when: (s) => s.pulse && s.rhythm.hr >= 50 && !paced(s), points: 5, severity: 'minor', text: 'Transcutaneous pacing without a slow heart rate to treat. Pacing is for symptomatic bradycardia (usually under 50/min) that atropine has not fixed.' },
  { id: 'pace-in-arrest', actions: ['pace'], when: (s) => !s.pulse, points: 5, severity: 'major', text: 'Pacing in cardiac arrest. It does not restart a heart in arrest and cannot treat VF: CPR, a shock for VF or pulseless VT, and epinephrine.' },
  { id: 'nitro-hypotension', actions: ['nitro', 'nitro-assist', 'ic-nitro'], when: (s) => s.pulse && s.vitals.sbp < 90, points: 8, severity: 'major', text: 'Nitroglycerin with a systolic pressure under 90 mmHg. Nitrates drop the pressure further: hold them until it is back above 90.' },
  { id: 'nitroprusside-hypotension', actions: ['ic-nitroprusside'], when: (s) => s.pulse && s.vitals.sbp < 90, points: 8, severity: 'major', text: 'Intracoronary nitroprusside with a systolic pressure under 90 mmHg. It drops the pressure further, and a low perfusion pressure makes no-reflow worse: support the pressure first, or use intracoronary epinephrine.' },
  // atropine is for symptomatic bradycardia. With a pulse: a rate of 60 or more has nothing for it to treat (over a pacer,
  // whose 70 hides a slow rate of the heart's own, it is still a fair try). In arrest: out of the algorithm since 2010
  { id: 'atropine-fast', actions: ['atropine'], when: (s) => s.pulse && s.rhythm.hr >= 60 && !paced(s), points: 3, severity: 'minor', text: 'Atropine with no slow pulse to treat. It is for symptomatic bradycardia: with a normal or fast rate it has nothing to treat, and any speeding only adds to the heart\'s oxygen demand — in an acute MI that can worsen the ischemia.' },
  { id: 'atropine-in-arrest', actions: ['atropine'], when: (s) => !s.pulse, points: 3, severity: 'minor', text: 'Atropine in cardiac arrest. It has not been part of the cardiac arrest algorithm since 2010: routine atropine does not help PEA or asystole, and it does nothing for VF. CPR, epinephrine, a shock for VF or pulseless VT, and the reversible causes.' },
  // the physician stands the cath lab down (the default response); a case can say it in its own words
  { id: 'stemi-alert-no-ste', actions: ['stemi-alert'], when: (s) => !ecgShowsStemi(s), points: 3, severity: 'minor', text: 'A STEMI alert for a 12-lead that does not meet STEMI criteria. The alert calls the cath lab team in for an artery that is not known to be blocked (pericarditis, a bundle branch block, a thick heart muscle or a high potassium can raise the ST segments too). Transmit the 12-lead or give a radio report, and let the hospital decide.' },
  // diltiazem's contraindications (verapamil is the same drug class; the simulator offers it only intracoronary)
  { id: 'diltiazem-heart-failure', actions: ['diltiazem'], when: (s, sc) => s.pulse && hasProblem(sc, ['heart-failure']), points: 15, severity: 'critical', text: 'Diltiazem in a patient with heart failure. Calcium-channel blockers weaken the squeeze and open the vessels: with a reduced ejection fraction (40 % or less), with or without decompensated heart failure, IV diltiazem and verapamil must not be given (2023 ACC/AHA/ACCP/HRS AF guideline: 3 — Harm). Control the rate with amiodarone, or a beta-blocker if the lungs are not congested; an unstable patient needs synchronized cardioversion.' },
  { id: 'diltiazem-vt', actions: ['diltiazem'], when: (s) => s.pulse && ['vt', 'torsades'].includes(rhythmKind(s)), points: 15, severity: 'critical', text: 'Diltiazem for ventricular tachycardia. Treat a wide-complex tachycardia as VT until proven otherwise: diltiazem and verapamil drop the pressure and can turn VT into VF or arrest (2025 AHA: 3 — Harm). A stable monomorphic VT gets procainamide or amiodarone; an unstable one, synchronized cardioversion.' },
  { id: 'ondansetron-long-qt', actions: ['ondansetron'], when: (s, sc) => hasProblem(sc, ['long-qt']) || rhythmKind(s) === 'torsades', points: 5, severity: 'major', text: 'Ondansetron with a long QT. It lengthens the QT further, more with each dose, and can set off torsades de pointes: avoid it with a long QT or torsades.' },

  // Drugs for a specific problem: without it they cannot help and only bring their risks. The case lists what the patient
  // has (Scenario.problems); "not well established" in a hyperkalemic arrest (2025 AHA) is never penalized.
  // calcium also reverses part of the low pressure IV diltiazem causes: for that low pressure (a pulse, a systolic under 90)
  // it is a fair answer. Not routinely in a later arrest, and not once the pressure is back: one therapeutic dose is no overdose
  { id: 'calcium-no-indication', actions: ['calcium-chloride'], when: (s, sc) => !hasProblem(sc, CALCIUM_FOR) && !(has(s, 'diltiazem') && s.pulse && s.vitals.sbp < 90), points: 3, severity: 'minor', text: 'Calcium chloride without an indication. It is for hyperkalemia, a calcium-channel- or beta-blocker overdose (or the low pressure IV diltiazem causes) or a low calcium; otherwise it does not help (routine calcium in cardiac arrest: no benefit, 2025 AHA), and it burns the tissue if it leaks.' },
  { id: 'bicarbonate-no-indication', actions: ['sodium-bicarbonate'], when: (_s, sc) => !hasProblem(sc, BICARBONATE_FOR), points: 3, severity: 'minor', text: 'Sodium bicarbonate without an indication. It is for hyperkalemia, metabolic acidosis or a sodium-channel-blocker (e.g. tricyclic) overdose; routine bicarbonate in cardiac arrest has no benefit (2025 AHA), and it adds a sodium load and CO₂ the lungs must clear.' },
  { id: 'insulin-hypoglycemia', actions: ['insulin-dextrose'], when: (s) => s.vitals.glucose < LOW_GLUCOSE, points: 10, severity: 'major', text: 'Insulin with a blood glucose under 70 mg/dL. Treat the low glucose first: insulin drives it lower, and the worst lows come 1–3 hours later.' },
  // 10 units is the potassium dose; a beta- or calcium-channel-blocker overdose needs far more, so it is too little there, not a mistake
  { id: 'insulin-no-indication', actions: ['insulin-dextrose'], when: (_s, sc) => !hasProblem(sc, ['hyperkalemia', 'beta-blocker-overdose', 'ccb-overdose']), points: 5, severity: 'minor', text: 'Insulin and dextrose without hyperkalemia. They shift potassium into the cells; with no high potassium they only risk a low glucose.' },
  { id: 'albuterol-hyperk-no-indication', actions: ['albuterol-hyperk'], when: (_s, sc) => !hasProblem(sc, ['hyperkalemia']), points: 3, severity: 'minor', text: 'High-dose albuterol (10–20 mg) without hyperkalemia. That dose is for shifting potassium and it races the heart; for wheezing the dose is 2.5–5 mg.' },
  { id: 'magnesium-routine-arrest', actions: ['magnesium-sulfate'], when: (s, sc) => !s.pulse && rhythmKind(s) !== 'torsades' && !hasProblem(sc, ['long-qt']), points: 3, severity: 'minor', text: 'Magnesium in a cardiac arrest without torsades. Routine magnesium does not help VF, pulseless VT, PEA or asystole; it is for torsades de pointes.' },

  // Procainamide: the stop rules and contraindications on its drug card (2025 AHA tachycardia algorithm)
  { id: 'procainamide-in-arrest', actions: ['procainamide'], when: (s) => !s.pulse, points: 3, severity: 'minor', text: 'Procainamide in cardiac arrest. It is a slow infusion (20–50 mg/min), not an arrest drug: amiodarone 300 mg or lidocaine is.' },
  { id: 'procainamide-hypotension', actions: ['procainamide'], when: (s) => s.pulse && s.vitals.sbp < 90, points: 8, severity: 'major', text: 'Procainamide with a systolic pressure under 90 mmHg. Hypotension is one of its stop rules, so it is no drug to start with one: an unstable tachycardia needs synchronized cardioversion.' },
  // a pacer (pads or a wire) protects against the block it would deepen
  { id: 'procainamide-slow', actions: ['procainamide'], when: (s) => s.pulse && !paced(s) && (AV_BLOCKS.includes(rhythmKind(s)) || s.rhythm.hr < 50), points: 10, severity: 'major', text: 'Procainamide with AV block or a slow heart rate. It slows conduction further and can stop the heart; it is a drug for tachycardia.' },
  { id: 'procainamide-heart-failure', actions: ['procainamide'], when: (_s, sc) => hasProblem(sc, ['heart-failure']), points: 8, severity: 'major', text: 'Procainamide in a patient with heart failure. It weakens the squeeze and drops the pressure: in heart failure use amiodarone, or synchronized cardioversion.' },
  { id: 'procainamide-long-qt', actions: ['procainamide'], when: (s, sc) => hasProblem(sc, ['long-qt']) || rhythmKind(s) === 'torsades', points: 10, severity: 'major', text: 'Procainamide with a long QT. It lengthens the QT further and can set off torsades de pointes.' },
  // when one antiarrhythmic has not worked, the next step is a shock or expert advice, not a second drug on top
  { id: 'procainamide-after-amiodarone', actions: ['procainamide'], when: (s) => s.pulse && has(s, 'amiodarone'), points: 5, severity: 'minor', text: 'Procainamide on top of amiodarone. Both lengthen the QT and drop the pressure: when one antiarrhythmic fails, cardiovert (with sedation) or get expert advice instead of adding another.' },
  { id: 'amiodarone-after-procainamide', actions: ['amio-infusion'], when: (s) => s.pulse && has(s, 'procainamide'), points: 5, severity: 'minor', text: 'Amiodarone on top of procainamide. Both lengthen the QT and drop the pressure: when one antiarrhythmic fails, cardiovert (with sedation) or get expert advice instead of adding another.' },

  // Glucose: judged on the patient's real glucose, checked or not
  { id: 'glucose-not-low', actions: ['oral-glucose', 'dextrose'], when: (s) => s.vitals.glucose >= LOW_GLUCOSE, points: 3, severity: 'minor', text: 'Glucose given with a blood glucose of 70 mg/dL or more. Check it first: glucose treats a low one, and a high glucose harms an injured brain or heart.' },
  { id: 'oral-glucose-cannot-swallow', actions: ['oral-glucose'], when: (s) => !canSwallow(s), points: 8, severity: 'major', text: 'Oral glucose for a patient too drowsy to swallow. It can be inhaled into the lungs: by mouth only if awake enough to swallow and protect the airway — otherwise IV dextrose (ALS).' },
];

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
  if (e.end && !s.ended) s.ended = { reason: e.end, minute: s.minute };
  boundVitals(s);
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
  if (s.pulse && v.dbp > v.sbp - 10) v.dbp = Math.max(PERFUSING_FLOOR.dbp, v.sbp - 10);
}

/** Ask the learner for a read (the next one waits if one is already open) */
function askRead(s: SimState, r: PendingRead) {
  if (s.ended) return;
  if (s.pendingRead) s.queuedReads.push(r);
  else s.pendingRead = r;
}

function harmsFor(sc: Scenario, s: SimState, id: string) {
  // a scenario harm with the same id, or one that says it covers a built-in one, replaces it (more specific wording)
  const own = new Set(sc.harms.flatMap((h) => [h.id, ...(h.replaces ?? [])]));
  for (const h of [...BUILT_IN_HARMS.filter((b) => !own.has(b.id)), ...sc.harms]) {
    if (!h.actions.includes(id)) continue;
    if (h.roles && !h.roles.includes(s.role)) continue;
    if (s.penalties.some((p) => p.id === h.id)) continue;
    if (h.when && !h.when(s, sc)) continue;
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
    say(s, 'hospital', sc.arrival ?? 'You arrive at the hospital; the team meets you at the door.');
  }
  for (let pass = 0; pass < 4; pass++) {
    let fired = false;
    for (const ev of sc.events) {
      if (s.fired.includes(ev.id) || !ev.when(s)) continue;
      s.fired.push(ev.id);
      applyEffect(s, ev.effect(s));
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
    if (!s.pulse) say(s, 'system', 'Care handed over in cardiac arrest: the emergency department team takes over the resuscitation.', 'warn');
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
  if (!s.pulse) {
    s.timers.arrestAt = 0;
    setFlag(s, 'arrest');
  }
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
  // an intervention counts from the minute it was started; its result comes when it is finished
  say(s, 'you', iv.detail ? `${iv.label} — ${iv.detail}` : iv.label);
  s.counts[id] = (s.counts[id] ?? 0) + 1;
  s.performed.push({ id, minute: s.minute });
  s.minute = round(s.minute + iv.minutes);
  applyEffect(s, effect);
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
