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
import { resolveProfile, type RhythmKind } from '@/lib/ecg/profiles';
import { INTERVENTION_BY_ID, interventionsFor } from './interventions';
import type {
  Critical, Effect, FactKey, Harm, Intervention, Review, ReviewItem, Scenario, SimState, Speaker, Tone,
} from './types';

const round = (m: number) => Math.round(m * 10) / 10;
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

const RHYTHM_ON_MONITOR: Record<RhythmKind, string> = {
  sinus: 'sinus rhythm', af: 'atrial fibrillation', flutter: 'atrial flutter', svt: 'regular narrow-complex tachycardia (SVT)',
  junctional: 'junctional rhythm', wenckebach: 'second-degree AV block, Mobitz I (Wenckebach)', mobitz2: 'second-degree AV block, Mobitz II',
  chb: 'complete heart block', pvc: 'sinus rhythm with PVCs', vt: 'ventricular tachycardia', vf: 'ventricular fibrillation',
  torsades: 'polymorphic VT (torsades)', asystole: 'asystole', paced: 'paced rhythm', vpaced: 'paced rhythm',
};

/** The rhythm as a 3-lead monitor shows it: the rhythm only — diagnosing a STEMI takes a 12-lead */
export function rhythmOnMonitor(s: SimState): string {
  const p = resolveProfile(s.rhythm.profile);
  if (p.rhythm === 'sinus' && !s.pulse) return 'an organised rhythm (no pulse: PEA)';
  if (p.rhythm === 'sinus') return s.rhythm.hr < 60 ? 'sinus bradycardia' : s.rhythm.hr > 100 ? 'sinus tachycardia' : 'sinus rhythm';
  return RHYTHM_ON_MONITOR[p.rhythm];
}

function monitorLine(s: SimState): string {
  if (s.role === 1) return `Monitor on: heart rate ${s.pulse ? s.rhythm.hr : '—'}. Interpreting the rhythm is outside EMT scope — acquire and transmit a 12-lead.`;
  const k = rhythmKind(s);
  const rate = s.rhythm.hr > 0 && k !== 'vf' && k !== 'asystole' && k !== 'torsades' ? ` at ${s.rhythm.hr}` : '';
  const st = resolveProfile(s.rhythm.profile).injury && s.pulse ? ' The ST segments look abnormal — record a 12-lead.' : '';
  return `Monitor: ${rhythmOnMonitor(s)}${rate}.${st}`;
}

function ecgLine(sc: Scenario, s: SimState, repeat: boolean): string {
  if (s.role === 1) return `12-lead ${repeat ? 're-' : ''}acquired. You can't interpret it — transmit it to the hospital.`;
  const fact = factText(sc, s, 'ecg12');
  if (fact) return fact;
  const p = resolveProfile(s.rhythm.profile);
  return `12-lead: ${p.headline}.`;
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
    case 'ecg12': return { say: [['monitor', ecgLine(sc, s, false)]], flags: ['ecg12', 'monitor'] };
    case 'ecg12-repeat': return { say: [['monitor', ecgLine(sc, s, true)]], flags: ['ecg12', 'monitor', 'ecg12-repeat'] };
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
          say: [['monitor', 'Electrical capture at 80 mA, rate 70.'], ['you', `Femoral pulse matches the paced rate: mechanical capture. BP ${sbp}/${Math.max(v.dbp, 64)}.`, 'good']],
          rhythm: { profile: 'tcp', hr: 70 }, vitals: { sbp, dbp: Math.max(v.dbp, 64), pain: Math.max(v.pain, 6) }, flags: ['pads', 'monitor', 'paced'],
        };
      }
      return { say: [['monitor', 'Pacing: no improvement.']], flags: ['pads', 'monitor'] };
    case 'vagal': return { say: [['monitor', 'No change.']], flags: ['vagal'] };
    case 'hs-ts':
      return { say: [['you', 'Hs: hypoxia, hypovolaemia, acidosis, potassium, hypothermia. Ts: tension pneumothorax, tamponade, toxins, thrombosis (coronary or pulmonary).']], flags: ['hs-ts'] };

    case 'timeout': return { say: [['team', 'Time-out: patient, procedure, site, allergies and anticoagulation confirmed.']], flags: ['timeout'] };
    case 'consent': return { say: [['patient', fact('allergies') ?? 'No allergies. I understand and consent.']], flags: ['consent'] };
    case 'prep': return { say: [['you', 'Right radial and both groins prepped and draped.']], flags: ['prep'] };
    case 'access': return { say: [['operator', 'Radial access: 6 Fr sheath in.']], flags: ['access'] };
    case 'angio': return { say: [['operator', 'Angiography complete.']], flags: ['angio'] };
    case 'reposition': return { say: [['operator', 'Catheter disengaged and repositioned.']], flags: ['repositioned'] };
    case 'pci': return { say: [['operator', 'Stent deployed. TIMI 3 flow.']], flags: ['pci'] };
    case 'iabp': return { say: [['operator', 'Mechanical support running.']], flags: ['mcs'] };
    case 'temp-wire': return { say: [['operator', 'Temporary wire in the RV apex; pacing at 70 with capture.']], flags: ['temp-wire'] };
    case 'hemostasis': return { say: [['you', 'Radial band on; distal pulse and perfusion checked.']], flags: ['hemostasis'] };

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
  if (e.end && !s.ended) s.ended = { reason: e.end, minute: s.minute };
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

function tick(sc: Scenario, s: SimState) {
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
    return;
  }
  if (!s.ended && isComplete(sc, s)) {
    say(s, 'system', 'All critical interventions are done — scenario complete.', 'good');
    s.ended = { reason: 'complete', minute: s.minute };
  } else if (!s.ended && has(s, 'handoff') && s.pulse) {
    // a hand-off ends your care, whatever is still missing
    say(s, 'system', 'Care handed over — scenario complete.', 'info');
    s.ended = { reason: 'complete', minute: s.minute };
  }
}

export function start(sc: Scenario, role: LearningLevel): SimState {
  const s: SimState = {
    scenarioId: sc.id, role, minute: 0,
    rhythm: { ...sc.initial.rhythm }, vitals: { ...sc.initial.vitals },
    pulse: sc.initial.pulse ?? true, phase: sc.initial.phase ?? 'initial',
    flags: {}, timers: {}, counts: {}, performed: [], log: [], penalties: [], fired: [], ended: null,
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
  if (!s.ended) tick(sc, s);
  return s;
}

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
    if (m === null) {
      toFix.push({ kind: 'missed', label: c.label, detail: c.why, points: pts });
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
      toFix.push({ kind: 'late', label: c.label, detail: `${target}. ${c.why}`, points: pts / 2 });
    }
  }
  const penaltyPoints = s.penalties.reduce((a, p) => a + p.points, 0);
  for (const p of s.penalties) {
    if (isHint(p)) toFix.push({ kind: 'hint', label: p.text, detail: 'You asked for a hint. Try the case again without one.', points: p.points });
    else {
      // the first sentence is the headline, the rest explains it
      const [first, ...rest] = p.text.split('. ');
      toFix.push({ kind: 'harm', label: first.endsWith('.') ? first : `${first}.`, detail: rest.join('. '), points: p.points, severity: p.severity });
    }
  }
  let percent = max > 0 ? Math.round((100 * Math.max(0, earned - penaltyPoints)) / max) : 0;
  if (s.ended?.reason === 'death') percent = Math.min(percent, 40);
  const sev = { critical: 0, major: 1, minor: 2 };
  const rank = (t: Review['toFix'][number]) => (t.kind === 'harm' ? sev[t.severity ?? 'minor'] : t.kind === 'hint' ? 4 : 3);
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

  return { percent, earned, max, penaltyPoints, grade: gradeFor(percent), outcome, timings, wentWell, toFix, hints: s.penalties.filter(isHint).length, teaching: sc.teaching };
}
