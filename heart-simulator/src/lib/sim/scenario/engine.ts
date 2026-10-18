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
 * own harms. The scenario ends by itself once every critical intervention for the learner's role is
 * done and the patient has a pulse (plus any scenario-specific condition).
 */
import type { LearningLevel } from '@/store/useAppStore';
import { resolveProfile } from '@/lib/ecg/profiles';
import { INTERVENTION_BY_ID, interventionsFor } from './interventions';
import { READ_KIND_NAME, READ_OPTION_BY_ID, answerFor, partialFor } from './reads';
import { angioGate } from './labKit';
import type {
  Critical, Effect, FactKey, Harm, Intervention, PendingRead, Review, ReviewItem, Scenario, SimState, Speaker, Tone,
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

/** What the 12-lead shows, in words: the FTO's explanation after your read */
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
      if (!s.pulse) return { blocked: true, say: [['system', 'No 12-lead in cardiac arrest: treat the rhythm on the monitor.']] };
      return { say: [['monitor', ecgLine(s, id === 'ecg12-repeat')]], flags: id === 'ecg12' ? ['ecg12', 'monitor'] : ['ecg12', 'monitor', 'ecg12-repeat'] };
    case 'ecg-transmit':
      if (!has(s, 'ecg12')) return { blocked: true, say: [['system', 'Acquire a 12-lead first.']] };
      return { say: [['hospital', 'ECG received; the physician is reviewing it.']], flags: ['transmitted'] };
    case 'ecg-right': return { say: [['monitor', fact('ecgRight') ?? 'V4R: no ST elevation.']], flags: ['ecg-right'] };
    case 'ecg-posterior': return { say: [['monitor', fact('ecgPosterior') ?? 'V7–V9: no ST elevation.']], flags: ['ecg-posterior'] };
    case 'capno':
      return { say: [['monitor', s.pulse ? `EtCO₂ ${v.etco2} mmHg with a normal square waveform.` : `EtCO₂ ${has(s, 'cpr') ? 16 : 6} mmHg.`]], flags: ['capno'] };
    case 'transducer': return { say: [['you', 'Transducers zeroed to air and levelled at the phlebostatic axis.']], flags: ['transducer'] };
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
      return { say: [['you', 'Ventilating 1 breath every 6 seconds; chest rising.']], flags: ['ventilated'] };
    case 'cpap': return { say: [['you', 'CPAP applied at 5 cmH₂O.']], flags: ['cpap'] };
    case 'airway': return { say: [['you', 'Airway placed; confirmed with waveform capnography.']], flags: ['airway', 'ventilated'] };

    case 'iv': return { say: [['you', 'IV established: 18 G, left forearm.']], flags: ['iv'] };
    case 'io': return { say: [['you', 'IO established: proximal humerus.']], flags: ['iv'] };
    case 'fluid': {
      if (!s.pulse) return { say: [['you', 'Fluid running.']], flags: ['fluid'] };
      const sbp = Math.min(150, v.sbp + 8);
      return { say: [['monitor', `Bolus in. BP ${sbp}/${Math.min(90, v.dbp + 5)}.`]], vitals: { sbp, dbp: Math.min(90, v.dbp + 5) }, flags: ['fluid'] };
    }

    case 'aspirin': return { say: [['patient', 'Chews the aspirin.']], flags: ['aspirin'] };
    case 'nitro-assist':
      if (!fact('ownNitro')) return { blocked: true, say: [['patient', "I don't have any nitroglycerin of my own."]] };
      return nitroEffect(s);
    case 'nitro': return nitroEffect(s);
    case 'fentanyl': {
      const pain = Math.max(0, v.pain - 3);
      return { say: [['patient', pain <= 3 ? 'That takes the edge off.' : 'Still hurts, but a bit less.']], vitals: { pain, rr: Math.max(10, v.rr - 1) }, flags: ['analgesia'] };
    }
    case 'heparin': return { say: [['you', 'Heparin bolus given (weight-based).']], flags: ['heparin'] };
    case 'p2y12': return { say: [['you', 'P2Y12 loading dose given.']], flags: ['p2y12'] };
    case 'metoprolol':
      return { say: [['monitor', `Metoprolol given. BP ${v.sbp - 12}/${v.dbp - 8}.`]], vitals: { sbp: v.sbp - 12, dbp: v.dbp - 8 }, rhythm: { ...s.rhythm, hr: Math.max(40, s.rhythm.hr - 10) }, flags: ['beta-blocker'] };
    case 'atropine':
      if (rhythmKind(s) === 'sinus' && s.rhythm.hr < 60) return { say: [['monitor', 'Heart rate rises to 74.']], rhythm: { ...s.rhythm, hr: 74 }, flags: ['atropine'] };
      return { say: [['monitor', 'No change in heart rate.']], flags: ['atropine'] };
    case 'adenosine6':
    case 'adenosine12':
      return { say: [['monitor', 'A brief pause, then the same rhythm returns.']], flags: ['adenosine'] };
    case 'diltiazem': {
      const sbp = v.sbp - 12;
      return { say: [['monitor', `Diltiazem in. BP ${sbp}/${v.dbp - 8}.`]], vitals: { sbp, dbp: v.dbp - 8 }, flags: ['diltiazem'] };
    }
    case 'epinephrine': return { say: [['you', 'Epinephrine 1 mg IV/IO, flushed.']], flags: ['epi'] };
    case 'amio-arrest': return { say: [['you', `Amiodarone ${(s.counts['amio-arrest'] ?? 0) === 0 ? '300' : '150'} mg IV/IO, flushed.`]], flags: ['amiodarone'] };
    case 'amio-infusion': return { say: [['you', 'Amiodarone 150 mg running over 10 minutes.']], flags: ['amiodarone'] };
    case 'lidocaine': return { say: [['you', 'Lidocaine given.']], flags: ['lidocaine'] };
    case 'push-epi':
      if (!s.pulse) return { say: [['you', 'Push-dose epinephrine given.']], flags: ['push-epi'] };
      return { say: [['monitor', `BP ${Math.min(150, v.sbp + 16)}/${Math.min(90, v.dbp + 10)} for a few minutes.`]], vitals: { sbp: Math.min(150, v.sbp + 16), dbp: Math.min(90, v.dbp + 10) }, flags: ['push-epi'] };
    case 'pressor':
      return { say: [['monitor', `Infusion running. BP ${Math.min(140, v.sbp + 22)}/${Math.min(88, v.dbp + 14)}.`]], vitals: { sbp: Math.min(140, v.sbp + 22), dbp: Math.min(88, v.dbp + 14) }, flags: ['pressor'] };
    case 'sedation': return { say: [['you', 'Sedated and comfortable; airway maintained, capnography on.']], flags: ['sedation'] };
    case 'tnk': return { say: [['you', 'Tenecteplase given.']], flags: ['lytic'] };
    case 'epi-im': return { say: [['you', 'Epinephrine 0.5 mg IM, lateral thigh.']], flags: ['epi-im'] };
    case 'albuterol': return { say: [['you', 'Albuterol nebuliser running.']], flags: ['albuterol'] };
    case 'diphenhydramine': return { say: [['you', 'Diphenhydramine 50 mg IV.']], flags: ['antihistamine'] };
    case 'steroid': return { say: [['you', 'Methylprednisolone 125 mg IV.']], flags: ['steroid'] };
    case 'radial-cocktail': return { say: [['you', 'Radial cocktail through the sheath: verapamil 2.5 mg and nitroglycerin 200 mcg, diluted with blood.'], ['patient', '"Ooh, that burns up my arm."']], vitals: { sbp: v.sbp - 6, dbp: v.dbp - 4 }, flags: ['cocktail'] };
    case 'ic-nitro': return { say: [['you', 'Nitroglycerin 200 mcg intracoronary.'], ['monitor', `BP ${v.sbp - 10}/${v.dbp - 6}.`]], vitals: { sbp: v.sbp - 10, dbp: v.dbp - 6 }, flags: ['ic-nitro'] };
    case 'ic-adenosine': return { say: [['you', 'Adenosine 150 mcg intracoronary.'], ['monitor', 'A few seconds of slowing, then back to baseline.']], flags: ['ic-adenosine'] };
    case 'ic-verapamil': return { say: [['you', 'Verapamil 200 mcg intracoronary.']], flags: ['ic-verapamil'] };
    case 'adenosine-iv-ffr': return { say: [['you', 'Adenosine 140 mcg/kg/min IV running.'], ['patient', '"I feel flushed… a bit short of breath."']], flags: ['hyperemia'] };
    case 'bivalirudin': return { say: [['you', 'Bivalirudin 0.75 mg/kg bolus, 1.75 mg/kg/h running.']], flags: ['bivalirudin', 'anticoagulated'] };
    case 'gp2b3a': return { say: [['you', 'Eptifibatide 180 mcg/kg bolus, infusion running.']], flags: ['gp2b3a'] };
    case 'cangrelor': return { say: [['you', 'Cangrelor 30 mcg/kg bolus, 4 mcg/kg/min running.']], flags: ['p2y12', 'cangrelor'] };
    case 'protamine': return { say: [['you', 'Protamine 50 mg slowly IV.'], ['team', 'ACT falling.']], vitals: { sbp: v.sbp - 6, dbp: v.dbp - 4 }, flags: ['protamine'] };

    case 'cpr':
      if (s.pulse) return { say: [['patient', 'The patient cries out — they have a pulse and are breathing.', 'bad']] };
      return { say: [['you', '2 minutes of compressions: 100–120/min, 5–6 cm, full recoil, minimal pauses.']], flags: ['cpr'] };
    case 'aed':
      if (shockable(s)) return { say: [['monitor', 'AED: "Shock advised." Shock delivered. Resume CPR.']], flags: ['pads', 'monitor', 'shocked'] };
      return { say: [['monitor', s.pulse ? 'AED: "No shock advised."' : 'AED: "No shock advised. Start CPR."']], flags: ['pads', 'monitor'] };
    case 'defib':
      if (shockable(s)) return { say: [['monitor', 'Shock delivered: 200 J. Resume CPR immediately.']], flags: ['pads', 'monitor', 'shocked'] };
      return { say: [['monitor', 'Shock delivered: 200 J.']], flags: ['pads', 'monitor'] };
    case 'cardiovert':
      if (!s.pulse) return { say: [['monitor', 'SYNC is on: no R waves to synchronise to — the device does not fire.', 'bad']], flags: ['pads', 'monitor'] };
      return { say: [['monitor', 'Synchronised shock delivered: 100 J.']], flags: ['pads', 'monitor', 'cardioverted'] };
    case 'pace':
      if (s.pulse && s.rhythm.hr < 50) {
        const sbp = Math.max(v.sbp, 102);
        return {
          say: [['monitor', 'Pacer on: rate 70, output turned up to 80 mA.']],
          rhythm: { profile: 'tcp', hr: 70 }, vitals: { sbp, dbp: Math.max(v.dbp, 64), pain: Math.max(v.pain, 6) }, flags: ['pads', 'monitor', 'paced'],
        };
      }
      return { say: [['monitor', 'Pacer on: rate 70, output turned up to 80 mA.']], flags: ['pads', 'monitor'] };
    case 'vagal': return { say: [['monitor', 'No change.']], flags: ['vagal'] };
    case 'hs-ts':
      return { say: [['you', 'Hs: hypoxia, hypovolaemia, acidosis, potassium, hypothermia. Ts: tension pneumothorax, tamponade, toxins, thrombosis (coronary or pulmonary).']], flags: ['hs-ts'] };

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
    case 'closure-device': return { say: [['you', 'Femoral closure device deployed; haemostasis.']], flags: ['closure', 'hemostasis'] };
    case 'angio': return angioGate(s) ?? { say: [['you', 'Angiography complete.']], image: { id, view: 'Diagnostic angiography', image: sc.images?.angio }, flags: ['angio'] };
    case 'reposition': return { say: [['operator', 'Catheter disengaged and repositioned.']], flags: ['repositioned'] };
    case 'iabp':
      return s.role === 3
        ? { say: [['you', 'IABP console set up and the balloon prepped; timing on ECG trigger.']], flags: ['iabp-ready'] }
        : { say: [['you', 'IABP in, tip 2 cm below the left subclavian; 1:1, augmented diastolic 118 mmHg.']], vitals: { sbp: Math.min(140, v.sbp + 6), dbp: Math.min(90, v.dbp + 8) }, flags: ['iabp', 'mcs'] };
    case 'impella':
      return s.role === 3
        ? { say: [['you', 'Impella console primed and the purge set up; large-bore access kit and closure sutures open.']], flags: ['impella-ready'] }
        : { say: [['you', 'Impella CP across the aortic valve, inlet 3.5 cm below the valve; P-6, flow 3.3 L/min.']], vitals: { sbp: Math.min(140, v.sbp + 14), dbp: Math.min(90, v.dbp + 10) }, flags: ['impella', 'mcs'] };
    case 'temp-wire':
      return s.role === 3
        ? { say: [['you', 'Pacing wire and generator ready: rate 70, output 5 mA.']], flags: ['temp-wire-ready'] }
        : { say: [['you', 'Temporary wire in the RV apex: threshold 0.6 mA, pacing at 70, output 3 mA.']], flags: ['temp-wire'] };
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
    case 'ffr-equalize': return { say: [['monitor', 'Pressure wire equalised with the aortic pressure at the guide tip: Pd/Pa 1.00.']], flags: ['equalized'] };
    case 'ffr':
      if (!has(s, 'wired')) return noWire(s, 'Wire the vessel with the pressure wire first.');
      return { say: [['monitor', fact('ffr') ?? 'FFR 0.88 at maximal hyperaemia.']], flags: ['ffr'] };
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

    case 'call-help': return { say: [['team', 'Help is on the way.']], flags: ['help'] };
    case 'callout': return { say: [['operator', 'Copy.']], flags: ['callout'] };
    case 'als': return { say: [['dispatch', 'Medic unit assigned, about 6 minutes out.']], flags: ['als'] };
    case 'med-control': return { say: [['hospital', 'Medical control: continue per protocol.']], flags: ['med-control'] };
    case 'stemi-alert':
      if (!has(s, 'ecg12')) return { blocked: true, say: [['system', 'You need a 12-lead showing a STEMI first.']] };
      return { say: [['hospital', 'Cath lab activated — the team will meet you at the door.']], flags: ['alert'] };
    case 'notify': return { say: [['hospital', "Copy. We'll be ready for you."]], flags: ['notified'] };
    case 'transport-pci':
    case 'transport-near': {
      if (has(s, 'enroute')) return { blocked: true, say: [['system', 'You are already transporting.']] };
      const mins = id === 'transport-pci' ? sc.transportMinutes ?? 15 : sc.nearestMinutes ?? 8;
      return {
        say: [['you', `Patient loaded; transporting to the ${id === 'transport-pci' ? 'PCI-capable heart centre' : 'nearest emergency department'} (${mins} min).`]],
        flags: ['enroute', id === 'transport-pci' ? 'dest-pci' : 'dest-near'], timers: { arrive: s.minute + 2 + mins },
      };
    }
    case 'handoff':
      if (sc.setting === 'field' && !has(s, 'arrived')) return { blocked: true, say: [['system', 'Hand off on arrival: keep caring for the patient en route (reassess) until you get there.']] };
      return { say: [['you', 'SBAR hand-off given; the receiving team takes over.']], flags: ['handoff'] };
  }
  return { say: [['you', 'Done.']] };
}

const noAccess: Effect = { blocked: true, say: [['system', 'No arterial access yet.']] };
const nothingToFilm: Effect = { blocked: true, say: [['system', 'Nothing to film yet: the operator has no catheter in.']] };
const noCatheter: Effect = { blocked: true, say: [['system', 'The operator has no catheter in yet.']] };
const noWire = (s: SimState, mine: string): Effect => ({ blocked: true, say: [['system', s.role === 5 ? mine : 'There is no wire in the vessel yet.']] });

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
  const v = s.vitals;
  const pain = Math.max(0, v.pain - 2);
  return {
    say: [['patient', pain <= 4 ? 'The pressure is easing.' : 'Maybe a little better.'], ['monitor', `BP ${v.sbp - 10}/${v.dbp - 6}.`]],
    vitals: { pain, sbp: v.sbp - 10, dbp: v.dbp - 6 }, flags: ['nitro'],
  };
}

// ─── Built-in safety rules (every scenario) ────────────────────────────────

export const BUILT_IN_HARMS: Harm[] = [
  { id: 'cpr-with-pulse', actions: ['cpr'], when: (s) => s.pulse, points: 10, severity: 'major', text: 'Chest compressions on a patient with a pulse. Check for a pulse (no more than 10 seconds) before starting CPR.' },
  { id: 'shock-with-pulse', actions: ['defib', 'aed'], when: (s) => s.pulse, points: 15, severity: 'critical', text: 'Unsynchronised shock to a patient with a pulse: it can land on the T wave and cause VF. Unstable tachycardia with a pulse needs synchronised cardioversion.' },
  { id: 'shock-nonshockable', actions: ['defib'], when: (s) => !s.pulse && !shockable(s), points: 10, severity: 'major', text: 'Asystole and PEA are not shockable: shocking them interrupts CPR and does not help. Give CPR and epinephrine and look for reversible causes.' },
  { id: 'sync-in-arrest', actions: ['cardiovert'], when: (s) => !s.pulse, points: 8, severity: 'major', text: 'Synchronised mode needs R waves; in VF or pulseless VT it may never fire. Defibrillate unsynchronised.' },
  { id: 'arrest-epi-with-pulse', actions: ['epinephrine'], when: (s) => s.pulse, points: 15, severity: 'critical', text: '1 mg IV epinephrine is the cardiac-arrest dose. With a pulse it causes severe hypertension, arrhythmias and ischaemia; use push-dose epinephrine or an infusion.' },
  { id: 'arrest-amio-with-pulse', actions: ['amio-arrest'], when: (s) => s.pulse, points: 10, severity: 'major', text: 'A 300 mg amiodarone push is for cardiac arrest. With a pulse, give 150 mg over 10 minutes.' },
  { id: 'airway-awake', actions: ['airway'], when: (s) => s.pulse && s.vitals.gcs > 8, points: 10, severity: 'major', text: 'An advanced airway is not indicated in a patient who is awake and protecting their own airway.' },
  { id: 'pace-not-slow', actions: ['pace'], when: (s) => s.pulse && s.rhythm.hr >= 60, points: 5, severity: 'minor', text: 'Transcutaneous pacing is for symptomatic bradycardia; the heart rate is not slow.' },
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
  if (e.image) s.images.push({ minute: s.minute, ...e.image });
  if (e.read && s.role !== 1) askRead(s, { ...e.read, minute: s.minute });
  if (e.end && !s.ended) s.ended = { reason: e.end, minute: s.minute };
}

/** Ask the learner for a read (the next one waits if one is already open) */
function askRead(s: SimState, r: PendingRead) {
  if (s.ended) return;
  if (s.pendingRead) s.queuedReads.push(r);
  else s.pendingRead = r;
}

function harmsFor(sc: Scenario, s: SimState, id: string) {
  // a scenario harm with the same id replaces the built-in one (more specific wording)
  const own = new Set(sc.harms.map((h) => h.id));
  for (const h of [...BUILT_IN_HARMS.filter((b) => !own.has(b.id)), ...sc.harms]) {
    if (!h.actions.includes(id)) continue;
    if (h.roles && !h.roles.includes(s.role)) continue;
    if (s.penalties.some((p) => p.id === h.id)) continue;
    if (h.when && !h.when(s)) continue;
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
    say(s, 'system', 'Despite resuscitation there is no return of circulation. The patient has died.', 'bad');
    s.ended = { reason: 'death', minute: s.minute };
  }
}

/** The case ends by itself once everything is done (never while a 12-lead read is pending) */
function finish(sc: Scenario, s: SimState) {
  if (s.ended || s.pendingRead) return;
  if (isComplete(sc, s)) {
    say(s, 'system', 'All critical interventions are done — scenario complete.', 'good');
    s.ended = { reason: 'complete', minute: s.minute };
  } else if (has(s, 'handoff') && s.pulse) {
    // a hand-off ends your care, whatever is still missing
    say(s, 'system', 'Care handed over — scenario complete.', 'info');
    s.ended = { reason: 'complete', minute: s.minute };
  }
}

function tick(sc: Scenario, s: SimState) {
  advance(sc, s);
  finish(sc, s);
}

/** A new 12-lead tracing waits for the learner's read (EMTs acquire and transmit; they do not interpret) */
function requestRead(sc: Scenario, s: SimState) {
  if (s.ended || !s.pulse) return;
  const unchanged = s.lastEcg?.profile === s.rhythm.profile;
  s.lastEcg = { minute: s.minute, profile: s.rhythm.profile };
  if (s.role === 1) return;
  if (unchanged) say(s, 'monitor', 'Unchanged from the previous 12-lead.');
  else {
    const profile = s.rhythm.profile;
    askRead(s, { kind: 'ecg', minute: s.minute, answer: answerFor(profile).id, partial: partialFor(profile), explain: ecgExplanation(sc, s, profile) });
  }
}

/** Your read of what is waiting; the FTO / preceptor confirms or corrects it at once (no case time passes) */
export function answerRead(sc: Scenario, prev: SimState, optionId: string): SimState {
  const choice = READ_OPTION_BY_ID[optionId];
  if (!prev.pendingRead || prev.ended || !choice) return prev;
  const s: SimState = structuredClone(prev);
  const r = s.pendingRead!;
  s.pendingRead = s.queuedReads.shift() ?? null;
  const verdict = optionId === r.answer ? 'correct' : r.partial?.includes(optionId) ? 'partial' : 'wrong';
  const answer = READ_OPTION_BY_ID[r.answer];
  say(s, 'you', `My read: ${choice.label}.`);
  if (verdict === 'correct') say(s, 'fto', `Correct. ${r.explain}`, 'good');
  else if (verdict === 'partial') say(s, 'fto', `Partly right — the full read is ${answer.label}. ${r.explain}`, 'warn');
  else say(s, 'fto', `Not quite — this is ${answer.label}. ${r.explain}`, 'bad');
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
  if (iv.maxTimes && n >= iv.maxTimes) return `Maximum ${iv.maxTimes} doses`;
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

/** What the FTO / preceptor says when you ask for help with a read (it costs nothing) */
const READ_COACHING: Record<PendingRead['kind'], string> = {
  ecg: 'Work through it: rate, rhythm (P waves?), axis, PR / QRS / QT, then the ST segments lead by lead — which leads, and is there a reciprocal change?',
  hemo: 'Compare each number with normal: RA 2–8, RV 15–30/2–8, PA 15–30/4–12, PCWP 6–12, LVEDP under 12–15, cardiac index above 2.2. Then look at the pattern, and at the waveform itself.',
  physiology: 'FFR: 0.80 or less is significant. Before you trust the number, ask: was the wire equalised, and was hyperaemia adequate?',
  sizing: 'Diameter: match the reference vessel 1:1 (round to the nearest size up). Length: cover the lesion edge to edge, with a few millimetres of healthy vessel at each end.',
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
    say(s, 'fto', READ_COACHING[s.pendingRead.kind]);
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
    if (c.target?.by !== undefined && m > c.target.by) {
      onTime = false;
      target = `done at ${clockText(m)}; the goal is by ${clockText(c.target.by)}`;
    }
    const w = c.target?.within;
    if (w && s.flags[w.flag] !== undefined && m - s.flags[w.flag] > w.minutes) {
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
  if (s.ended?.reason === 'death') percent = Math.min(percent, 40);
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

  const outcome = s.ended?.reason === 'death'
    ? 'The patient died.'
    : s.ended?.reason === 'complete'
      ? `Every critical intervention done in ${clockText(s.ended.minute)}.`
      : `Ended early at ${clockText(s.minute)} with ${toFix.filter((t) => t.kind === 'missed').length} critical item(s) not done.`;

  const reads = s.reads.map((r) => ({ kind: r.kind, minute: r.minute, chosen: READ_OPTION_BY_ID[r.chosen].label, answer: READ_OPTION_BY_ID[r.answer].label, verdict: r.verdict }));
  return { percent, earned, max, penaltyPoints, grade: gradeFor(percent), outcome, timings, wentWell, toFix, reads, hints: s.penalties.filter(isHint).length, teaching: sc.teaching };
}
