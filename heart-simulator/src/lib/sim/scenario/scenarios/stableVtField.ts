import type { Effect, Line, Scenario, SimState } from '../types';
import { PADS, bpAfter, has, line } from '../kit';
import { LIDOCAINE_RULES, RATE_RULES, yieldToHeavier } from '../rules/rhythm';

/**
 * The version this case teaches: a regular wide-complex tachycardia in a man with an old infarct, whose pressure and
 * mind are normal — hemodynamically stable VT. The trap is to treat it as SVT because he looks well (diltiazem crashes
 * him). The US order (2025 AHA) is a 12-lead, one antiarrhythmic infusion and expert consultation, and a sedated
 * synchronized shock when the drug fails or he becomes unstable; a sedated shock first is accepted care too (medical
 * control's call in the field). Left untreated he becomes unstable at 15:00, and pulseless 6 minutes after that.
 */

/** Still in the tachycardia he presented with, and still with a pulse */
const inVt = (s: SimState) => s.pulse && s.rhythm.profile === 'vt';

/** Hypotension (or the other signs the case has flagged) makes the tachycardia unstable */
const unstable = (s: SimState) => has(s, 'unstable') || s.vitals.sbp < 90;

/** The drugs the 2025 algorithm lists for a stable wide-complex tachycardia */
const ANTIARRHYTHMICS = ['amio-infusion', 'procainamide'];

/** Those, plus the 300 mg arrest push of amiodarone: the wrong dose of the right drug still acts on the circuit */
const BREAKERS = [...ANTIARRHYTHMICS, 'amio-arrest'];

/**
 * Minutes from starting the drug to the tachycardia breaking: procainamide stops more of these, and sooner, than
 * amiodarone (PROCAMIO), and amiodarone often only slows it at first
 */
const BREAKS_AFTER: Record<string, number> = { procainamide: 10, 'amio-infusion': 14, 'amio-arrest': 14 };

/** The first of those drugs given while he was still in the tachycardia (before it stopped or he arrested): the one that plays out */
function firstAntiarrhythmic(s: SimState) {
  const until = Math.min(s.flags.converted ?? Infinity, s.flags.arrest ?? Infinity);
  return s.performed.find((p) => BREAKERS.includes(p.id) && p.minute < until) ?? null;
}

/** Sedated, or at least given an analgesic, before the shock */
const comfortable = (s: SimState) => has(s, 'sedation') || has(s, 'analgesia');

/** What the monitor shows — only once it is on (with no monitor, nothing alarms) */
const onMonitor = (s: SimState, text: string, tone?: Line[2]): Line[] => (has(s, 'monitor') ? [line('monitor', text, tone)] : []);

/** Adrenergic drugs push the pressure up and drive the circuit faster */
function adrenergic(s: SimState, dSbp: number, dDbp: number, ceiling: { sbp: number; dbp: number }, flag: string): Effect | null {
  if (!inVt(s)) return null;
  const bp = bpAfter(s, dSbp, dDbp, ceiling);
  const hr = Math.min(180, s.rhythm.hr + 8);
  return { say: [['monitor', `Rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`, 'bad']], rhythm: { profile: 'vt', hr }, vitals: bp, flags: [flag] };
}

/** When an action that set a flag was started (its performance at or before the flag's minute) */
function startOf(s: SimState, id: string, flag: string): number | null {
  if (!has(s, flag)) return null;
  return [...s.performed].reverse().find((p) => p.id === id && p.minute <= s.flags[flag])?.minute ?? null;
}

/** A shock for the VF an unsynchronized shock caused, or the pulseless VT a delay led to: witnessed, pads on, it converts at once */
function arrestShock(s: SimState, how: string): Effect | null {
  if (s.pulse || (s.rhythm.profile !== 'vf' && s.rhythm.profile !== 'pvt')) return null;
  return {
    say: [['monitor', how], ['you', 'He coughs and moves; there is a pulse — ROSC.', 'good']],
    rhythm: { profile: 'sinus-tachycardia', hr: 112 }, pulse: true, phase: 'rosc',
    vitals: { sbp: 96, dbp: 60, spo2: 94, rr: 20, gcs: 13, pain: 2 },
    flags: ['pads', 'monitor', 'shocked', 'converted'],
  };
}

/** Adenosine: a scar circuit in the ventricle does not run through the AV node, so nothing happens */
function adenosine(s: SimState): Effect | null {
  if (!inVt(s)) return null;
  const felt: Line[] = s.vitals.gcs >= 13 ? [['patient', '"Whoa — I felt a rush in my chest."']] : [];
  return { say: [...felt, ['monitor', `No pause and no change: rate still ${s.rhythm.hr}.`]], flags: ['adenosine'] };
}

export const stableVtField: Scenario = {
  id: 'stable-vt-field',
  title: 'Pounding heart, steady pressure',
  summary: '64-year-old man with an old heart attack, a pounding pulse of 150 and a normal blood pressure. Read the tracing, treat it safely — and be ready if he changes.',
  setting: 'field',
  roles: [2],
  difficulty: 'intermediate',
  conditionId: 'monomorphic-vt',
  briefing: {
    default: [
      ['dispatch', 'Priority 2: 64-year-old man, "heart racing", awake and talking.'],
      ['scene', 'He is sitting on his couch, pale but alert, a hand on his chest: "My heart has been pounding for about 40 minutes." His wife says he had a heart attack seven years ago.'],
      ['hospital', 'Heart center (cardiology and an electrophysiology lab): 15 minutes. Nearest emergency department: 8 minutes.'],
    ],
  },
  initial: {
    rhythm: { profile: 'vt', hr: 150 },
    vitals: { sbp: 118, dbp: 76, spo2: 96, rr: 18, etco2: 36, pain: 0, gcs: 15, glucose: 124, temp: 36.8 },
  },
  facts: {
    opqrst: 'It started all at once about 40 minutes ago while I was watching TV — my heart just took off pounding. No chest pain and I can breathe fine. I felt a bit lightheaded at first, but sitting down helped.',
    // what decides the drug: an old infarct (so a scar), no heart failure (so procainamide is an option), nothing that lengthens the QT
    sample: 'No allergies. Metoprolol, lisinopril, atorvastatin and a baby aspirin — took them this morning. Heart attack seven years ago, they put in a stent. My last heart ultrasound said it pumps at about 50 percent; no heart failure, no defibrillator. Never had this before. Ate lunch at noon.',
    pde5: 'No.',
    lungs: (s) => (inVt(s) && has(s, 'unstable') ? 'Fine crackles at both bases.' : 'Clear and equal on both sides.'),
    perfusion: (s) => {
      if (!s.pulse) return 'No pulse.';
      if (!inVt(s)) return 'Warm and dry; regular radial pulse; no JVD.';
      if (!has(s, 'unstable')) return `Warm and dry; a strong, regular radial pulse at ${s.rhythm.hr}; now and then a big pulsation in the neck (a cannon a wave).`;
      // unstable: a weak pulse with a low pressure, a bounding one when the arrest dose of epinephrine drove it up
      return `Pale, cool and clammy; a ${s.vitals.sbp < 90 ? 'weak' : 'bounding'}, fast radial pulse; now and then a big pulsation in the neck (a cannon a wave).`;
    },
    neuro: (s) => (s.vitals.gcs >= 15 ? 'Alert and oriented; no focal deficit.' : 'Slow to answer and a little confused; no focal deficit.'),
    ecg12: (s) => {
      switch (s.rhythm.profile) {
        case 'vt':
          return `Regular wide-complex tachycardia at ${s.rhythm.hr}: QRS well over 120 ms, every complex the same shape, and P waves marching through on their own (AV dissociation): monomorphic VT. After an infarct, a regular wide-complex tachycardia is VT until proven otherwise.`;
        case 'normal-sinus':
          return `Sinus rhythm ${s.rhythm.hr}: normal PR, QRS and QT, no acute ST elevation or depression — the tachycardia has stopped. Nothing points to acute ischemia, so the scar of the old infarct is the likely source; he needs his potassium and magnesium checked, an echo and an electrophysiology review.`;
        case 'sinus-tachycardia':
          return `Sinus tachycardia ${s.rhythm.hr} after the shock, with no acute ST elevation and a normal QT: the arrhythmia has stopped. Watch closely for it to come back, with the pads on.`;
        default:
          return 'No 12-lead possible right now.';
      }
    },
  },
  status: (s) => {
    if (!s.pulse) return 'Unresponsive.';
    if (has(s, 'rosc')) return 'Awake but groggy: "What happened? My chest is sore."';
    if (has(s, 'converted')) return '"That\'s so much better. It feels normal again."';
    if (has(s, 'unstable')) return s.vitals.sbp < 90 ? '"I feel like I\'m going to pass out… my chest is tight."' : '"My chest — it\'s crushing… I feel awful."';
    return '"My heart is still pounding, but I\'m OK sitting here."';
  },
  respond: {
    adenosine6: adenosine,
    adenosine12: adenosine,
    'amio-infusion': (s) => {
      if (!inVt(s)) return null;
      // on top of procainamide the two drop the pressure together; on its own amiodarone first slows the circuit
      const stacked = has(s, 'procainamide');
      const bp = bpAfter(s, stacked ? -16 : -6, stacked ? -10 : -4);
      const hr = stacked ? s.rhythm.hr : 132;
      return {
        say: [['you', 'Amiodarone 150 mg in 100 mL running over 10 minutes; pads stay on.'], ['monitor', `Rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`, stacked ? 'bad' : 'info']],
        rhythm: { profile: 'vt', hr }, vitals: bp, flags: ['amiodarone'],
      };
    },
    procainamide: (s) => {
      if (!inVt(s)) return null;
      const stacked = has(s, 'amiodarone');
      const bp = bpAfter(s, stacked ? -18 : -8, stacked ? -12 : -4);
      const hr = stacked ? s.rhythm.hr : 140;
      const widening: Line[] = stacked ? [['partner', 'On top of the amiodarone his complexes are getting even wider, and his pressure is dropping.', 'bad']] : [];
      return {
        say: [
          ['you', 'Procainamide running at 50 mg/min — stop at 17 mg/kg (about 1,400 mg for his 82 kg), or sooner if the pressure falls or the QRS widens by half; BP and QRS width checked every few minutes.'],
          ['monitor', `Rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`, stacked ? 'bad' : 'info'],
          ...widening,
        ],
        rhythm: { profile: 'vt', hr }, vitals: bp, flags: ['procainamide'],
      };
    },
    // the arrest dose pushed into a patient with a pulse: a sharp fall in the pressure; it breaks the circuit no sooner
    // than the 10-minute infusion would (it is one of BREAKERS)
    'amio-arrest': (s) => {
      if (!s.pulse) return null;
      const bp = bpAfter(s, -22, -14);
      return { say: [['you', 'Amiodarone 300 mg pushed fast.'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`, 'bad']], vitals: bp, flags: ['amiodarone'] };
    },
    // some US protocols still list lidocaine for this; it seldom stops a scar circuit, and here it does not
    lidocaine: (s) => (inVt(s) ? { say: [['you', 'Lidocaine 1.5 mg/kg IV (120 mg).'], ['monitor', `No change: rate still ${s.rhythm.hr}.`]], flags: ['lidocaine'] } : null),
    // he has no pain to treat: it only takes the edge off a shock
    fentanyl: (s) => (inVt(s)
      ? { say: [['patient', s.vitals.pain > 0 ? '"That takes the edge off."' : '"I feel a bit floaty."']], vitals: { pain: Math.max(0, s.vitals.pain - 3) }, flags: ['analgesia'] }
      : null),
    // the arrest dose with a pulse: a surge of pressure and rate, and an ischemic heart — crushing chest pain makes him unstable
    epinephrine: (s) => {
      if (!inVt(s)) return null;
      const bp = bpAfter(s, 50, 26, { sbp: 196, dbp: 112 });
      const hr = Math.min(190, s.rhythm.hr + 20);
      return {
        say: [['monitor', `Rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`, 'bad'], ['patient', 'He grabs his chest: "It\'s crushing — my heart is going even faster!"', 'bad']],
        rhythm: { profile: 'vt', hr }, vitals: { ...bp, pain: Math.max(s.vitals.pain, 8), gcs: Math.min(s.vitals.gcs, 14) }, flags: ['epi', 'unstable'],
      };
    },
    'push-epi': (s) => adrenergic(s, 16, 10, { sbp: 150, dbp: 90 }, 'push-epi'),
    pressor: (s) => adrenergic(s, 22, 14, { sbp: 140, dbp: 88 }, 'pressor'),
    // the trap: treated as a narrow-complex tachycardia, the calcium-channel blocker leaves the rate and takes the pressure
    diltiazem: (s) => {
      if (!inVt(s)) return null;
      const sbp = Math.min(s.vitals.sbp, 76);
      const dbp = Math.min(s.vitals.dbp, 44);
      return {
        say: [['monitor', `Rate still ${s.rhythm.hr}, but BP falls to ${sbp}/${dbp}.`, 'bad'], ['patient', 'He goes gray and slumps sideways: "I\'m going to pass out… my chest is tight."', 'bad']],
        vitals: { sbp, dbp, gcs: Math.min(s.vitals.gcs, 13), pain: Math.max(s.vitals.pain, 5), spo2: Math.min(s.vitals.spo2, 93) },
        flags: ['diltiazem', 'unstable'],
      };
    },
    // calcium counters the calcium-channel blocker a little; it does nothing for the tachycardia, so he stays unstable
    'calcium-chloride': (s) => {
      if (!s.pulse || !has(s, 'diltiazem')) return null;
      const bp = bpAfter(s, 10, 6);
      return { say: [['you', 'Calcium chloride 1 g in slowly to counter the diltiazem; line flushed.'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`]], vitals: bp, flags: ['calcium'] };
    },
    metoprolol: (s) => {
      if (!inVt(s)) return null;
      const bp = bpAfter(s, -12, -8);
      return { say: [['monitor', `Metoprolol in. Rate still ${s.rhythm.hr}; BP ${bp.sbp}/${bp.dbp}.`]], vitals: bp, flags: ['beta-blocker'] };
    },
    sedation: (s) => (inVt(s)
      ? { say: [['you', 'Small dose of procedural sedation and analgesia: drowsy but rousable, breathing well, capnography on.']], vitals: bpAfter(s, -4, -2), flags: ['sedation'] }
      : null),
    // midazolam is the procedural sedation before his shock, as 'sedation' is
    midazolam: (s) => (inVt(s)
      ? { say: [['you', 'Midazolam 1 mg IV, small and titrated: drowsy but rousable, breathing well, capnography on.']], vitals: bpAfter(s, -4, -2), flags: ['sedation', 'benzodiazepine'] }
      : null),
    cardiovert: (s) => {
      if (!inVt(s)) return null;
      const awake = s.vitals.gcs >= 14 && !comfortable(s);
      const low = unstable(s);
      return {
        say: [
          ['monitor', 'Synchronized shock at 100 J: the rhythm changes, rate 84.', 'good'],
          awake ? ['patient', '"Aagh! What was that?"', 'bad'] : ['patient', 'He stirs, then opens his eyes: "Is it over? It feels normal."', 'good'],
        ],
        rhythm: { profile: 'normal-sinus', hr: 84 },
        vitals: { sbp: Math.max(s.vitals.sbp, low ? 108 : 122), dbp: Math.max(s.vitals.dbp, low ? 68 : 78), pain: 0, rr: 18, spo2: Math.max(s.vitals.spo2, 96), gcs: has(s, 'sedation') ? 14 : 15 },
        flags: ['pads', 'monitor', 'cardioverted', 'converted'],
      };
    },
    defib: (s) => {
      // unsynchronized, the shock lands on a T wave
      if (inVt(s)) {
        return {
          say: [['monitor', 'Unsynchronized shock delivered — he goes limp and the monitor alarms!', 'bad']],
          rhythm: { profile: 'vf', hr: 0 }, pulse: false, phase: 'arrest', vitals: { sbp: 0, dbp: 0, gcs: 3, rr: 0 }, flags: ['pads', 'monitor', 'iatrogenic-vf'],
        };
      }
      return arrestShock(s, 'Shock delivered: 200 J.');
    },
    // with his pulse the AED is not applied (the default refuses it: it would read his VT as shockable); without one it
    // shocks, as the manual defibrillator does
    aed: (s) => arrestShock(s, 'AED: "Shock advised." Shock delivered.'),
    // expert consultation in the field: what the physician says depends on where he is; it never names the rhythm
    'med-control': (s) => {
      const drug = firstAntiarrhythmic(s);
      let advice: string;
      if (!s.pulse) advice = 'Medical control: no pulse — defibrillate and run the arrest algorithm, then call me back.';
      else if (has(s, 'converted')) advice = 'Medical control: good. Keep the pads on, repeat the 12-lead, no new bolus unless it comes back, and bring him to the heart center.';
      else if (has(s, 'unstable')) advice = 'Medical control: he is unstable — synchronized cardioversion now at 100 J, sedated if his pressure allows. Do not wait on a drug.';
      else if (drug) advice = `Medical control: let the ${drug.id === 'procainamide' ? 'procainamide' : 'amiodarone'} work — no second antiarrhythmic on top. Pads stay on: if it has not broken by the end of the dose, or he becomes unstable, synchronized cardioversion at 100 J, sedated if you can. No diltiazem or verapamil.`;
      else if (!has(s, 'ecg12')) advice = 'Medical control: get a 12-lead of it before you treat it, and keep the pads on. Call me back if he changes.';
      else {
        // the expert can also choose the shock first (the European guideline's first line when sedation is safe)
        advice = `Medical control: thanks for the 12-lead. ${has(s, 'lidocaine') ? 'Lidocaine seldom breaks these. ' : ''}One antiarrhythmic only — procainamide or amiodarone per your protocol, not both; call me before adding anything. A sedated synchronized cardioversion at 100 J now is a reasonable alternative if you prefer it. Pads stay on: if his pressure drops, he gets confused or has chest pain, synchronized cardioversion at 100 J, sedated if you can. No diltiazem or verapamil. Bring him to the heart center.`;
      }
      return { say: [['hospital', advice]], flags: ['med-control'] };
    },
  },
  events: [
    {
      // the first antiarrhythmic breaks it (a second one on top does not hurry it)
      id: 'drug-breaks',
      when: (s) => {
        const drug = firstAntiarrhythmic(s);
        return inVt(s) && drug !== null && s.minute >= drug.minute + BREAKS_AFTER[drug.id];
      },
      effect: (s) => {
        const amio = firstAntiarrhythmic(s)!.id !== 'procainamide';
        const lowered = has(s, 'unstable');
        return {
          say: [
            ...(has(s, 'monitor') ? [line('monitor', 'The rate falls suddenly to 78.', 'good')] : [line('partner', 'His pulse has suddenly slowed right down — regular, about 78.', 'good')]),
            line('patient', '"It stopped! My heart feels normal again."', 'good'),
            line('you', amio ? 'Amiodarone 1 mg/min maintenance infusion running, per protocol.' : 'Procainamide loading stopped: the arrhythmia has stopped, which is one of its stop rules.'),
          ],
          rhythm: { profile: 'normal-sinus', hr: 78 },
          vitals: { sbp: Math.max(s.vitals.sbp, lowered ? 100 : 116), dbp: Math.max(s.vitals.dbp, lowered ? 62 : 74), pain: 0, rr: 16, spo2: Math.max(s.vitals.spo2, 96), gcs: 15 },
          flags: ['converted', 'drug-converted'],
        };
      },
    },
    {
      // left without an antiarrhythmic, the tachycardia wears him down: now he is unstable
      id: 'unstable-delay',
      when: (s) => inVt(s) && !has(s, 'unstable') && s.minute >= 15 && firstAntiarrhythmic(s) === null,
      effect: (s) => {
        // worse, never better: a pressure a drug has already pushed lower stays where it is
        const sbp = Math.min(s.vitals.sbp, 84);
        const dbp = Math.min(s.vitals.dbp, 52);
        return {
          say: [['partner', 'He has gone pale and sweaty: he says he feels faint and his chest is getting tight.', 'bad'], ...onMonitor(s, `BP ${sbp}/${dbp}.`, 'bad')],
          vitals: { sbp, dbp, gcs: Math.min(s.vitals.gcs, 14), pain: Math.max(s.vitals.pain, 5), rr: Math.max(s.vitals.rr, 24), spo2: Math.min(s.vitals.spo2, 93) },
          flags: ['unstable'],
        };
      },
    },
    {
      // any other way his pressure ends up under 90 (drugs stacked on each other) makes him unstable too
      id: 'unstable-low-bp',
      when: (s) => inVt(s) && !has(s, 'unstable') && s.vitals.sbp < 90,
      effect: (s) => ({
        say: [['partner', 'His pressure is under 90 now; he is getting foggy and says his chest feels tight.', 'bad']],
        vitals: { gcs: Math.min(s.vitals.gcs, 14), pain: Math.max(s.vitals.pain, 4) },
        flags: ['unstable'],
      }),
    },
    {
      // unstable and not shocked: it degenerates and he loses his pulse
      id: 'pulseless',
      when: (s) => inVt(s) && has(s, 'unstable') && s.minute >= s.flags.unstable + 6,
      effect: (s) => ({
        say: [['partner', "He's gone limp — he's not responding!", 'bad'], ...onMonitor(s, 'Monitor alarm!', 'bad')],
        rhythm: { profile: 'pvt', hr: 190 }, pulse: false, phase: 'arrest', vitals: { sbp: 0, dbp: 0, gcs: 3, rr: 0 }, flags: ['pulseless-vt'],
      }),
    },
  ],
  critical: [
    // the items a hint can name before the 12-lead is read say nothing about what the tracing shows
    { id: 'pads', label: 'Monitor and pads on at once', why: 'A fast heart rate can turn unstable or pulseless at any moment: with pads on you can cardiovert or defibrillate in seconds.', done: PADS, points: 10, target: { by: 4 } },
    { id: 'instability', label: 'Check for instability: blood pressure and mental status', why: 'Hypotension, an acute change in mental status, signs of shock, ischemic chest pain or acute heart failure make a tachycardia unstable — and decide between a drug and a shock.', done: ['vitals', 'nibp'], points: 5, target: { by: 4 } },
    { id: 'history', label: 'Past history and medicines (SAMPLE)', why: 'An old infarct, heart failure, his medicines and anything that lengthens the QT decide what a fast rhythm is likely to be and which drugs are safe.', done: ['sample'], points: 5, target: { by: 10 } },
    {
      id: 'ecg-tachycardia', label: '12-lead of the tachycardia itself, before it stops',
      why: 'The 12-lead decides the treatment (the QRS width, and whether the rhythm is regular), and the tracing of the tachycardia itself is what the cardiologists need later.',
      // a 12-lead whose tracing showed the tachycardia: the read asked for it, whatever the learner answered
      done: (s) => {
        const r = s.reads.find((x) => x.kind === 'ecg' && x.answer === 'vt');
        if (!r) return null;
        return [...s.performed].reverse().find((p) => (p.id === 'ecg12' || p.id === 'ecg12-repeat') && p.minute < r.minute)?.minute ?? r.minute;
      },
      uses: ['ecg12', 'ecg12-repeat'], points: 10, target: { by: 8 },
    },
    { id: 'iv', label: 'IV access', why: 'For the antiarrhythmic, and for sedation if he needs a shock.', done: ['iv', 'io'], points: 5 },
    {
      id: 'antiarrhythmic', label: 'Stop it while he is stable: procainamide or amiodarone 150 mg over 10 minutes (or a sedated synchronized cardioversion)',
      why: 'A stable regular wide-complex tachycardia gets an antiarrhythmic infusion (2025 AHA): procainamide 20–50 mg/min or amiodarone 150 mg over 10 minutes — one of them, while he is still stable — and a synchronized shock when the drug fails. A sedated cardioversion first is accepted too (the European guidelines\' first line when sedation is safe; in the field, ask medical control).',
      done: (s) => {
        // only a dose given for the tachycardia while he was stable counts: not one after it stopped, not one once a shock was due,
        // and not the 300 mg arrest push (the wrong dose, penalized on its own)
        const before = s.flags.unstable ?? Infinity;
        const drug = firstAntiarrhythmic(s);
        const drugAt = drug && drug.id !== 'amio-arrest' && drug.minute < before ? drug.minute : null;
        const shockAt = has(s, 'cardioverted') && s.flags.cardioverted < before ? startOf(s, 'cardiovert', 'cardioverted') : null;
        const times = [drugAt, shockAt].filter((m): m is number => m !== null);
        return times.length ? Math.min(...times) : null;
      },
      uses: [...ANTIARRHYTHMICS, 'cardiovert'], points: 15, target: { by: 12 },
    },
    { id: 'consult', label: 'Expert consultation: online medical control', why: 'The algorithm lists expert consultation for a wide-complex tachycardia (2025 AHA, as in 2020): in the field that is online medical control — before a second drug or an elective shock.', done: ['med-control'], points: 5 },
    {
      id: 'cardiovert-unstable', label: 'Unstable: synchronized cardioversion at 100 J within 3 minutes',
      why: 'Once a tachycardia with a pulse is unstable, the treatment is electrical: synchronized cardioversion, 100 J biphasic for monomorphic VT (2025), sedated if possible. Left unshocked, it degenerates and he loses his pulse.',
      done: (s) => (has(s, 'unstable') && has(s, 'cardioverted') && s.flags.cardioverted >= s.flags.unstable ? startOf(s, 'cardiovert', 'cardioverted') : null),
      uses: ['cardiovert'], points: 15, target: { within: { flag: 'unstable', minutes: 3 } },
      // a drug already running that broke it within those 3 minutes left nothing to shock
      applies: (s) => has(s, 'unstable') && !(has(s, 'drug-converted') && s.flags['drug-converted'] <= s.flags.unstable + 3),
    },
    {
      id: 'sedation', label: 'Sedation or analgesia before the cardioversion (he was awake)', why: 'Cardioversion is painful: sedate the conscious patient (or at least give an analgesic) when the situation allows.',
      done: (s) => {
        const at = Math.min(s.flags.sedation ?? Infinity, s.flags.analgesia ?? Infinity);
        return at <= (s.flags.cardioverted ?? Infinity) && at < Infinity ? at : null;
      },
      uses: ['sedation', 'fentanyl', 'midazolam'], points: 5, applies: (s) => has(s, 'cardioverted'),
    },
    {
      id: 'arrest-shock', label: 'No pulse: defibrillate within 2 minutes', why: 'Witnessed VF or pulseless VT with pads on: shock it at once — every minute without a shock lowers survival.',
      done: ['defib', 'aed'], after: 'arrest', points: 15, target: { within: { flag: 'arrest', minutes: 2 } }, applies: (s) => has(s, 'arrest'),
    },
    {
      id: 'post-ecg', label: '12-lead after conversion', why: 'After it stops, the 12-lead looks for ischemia, a long QT or pre-excitation, and is the baseline the cardiologists compare with.', done: ['ecg12', 'ecg12-repeat'], after: 'converted', points: 5,
      // a drug that breaks it while the hand-off is being given leaves no time for one: the receiving team records it
      applies: (s) => {
        const handoff = s.performed.find((p) => p.id === 'handoff')?.minute;
        return has(s, 'converted') && (handoff === undefined || s.flags.converted <= handoff);
      },
    },
    { id: 'transport', label: 'Transport', why: 'He needs a monitored bed, his potassium and magnesium, an echo and an electrophysiology review (ICD, ablation) — the heart center has them. The pads stay on en route; an unstable patient is shocked on scene, not driven further first.', done: ['transport-pci', 'transport-near'], points: 5 },
    { id: 'handoff', label: 'Hand-off', why: 'Report both 12-leads, the drug and dose, when it stopped and any shocks.', done: ['handoff'], points: 5 },
  ],
  harms: yieldToHeavier([
    { id: 'ccb-wide-complex', actions: ['diltiazem'], when: (s) => inVt(s), points: 15, severity: 'critical', replaces: ['diltiazem-vt'], text: 'Diltiazem for a regular wide-complex tachycardia. Treat it as VT until proven otherwise: diltiazem and verapamil drop the pressure and can turn VT into VF or arrest — COR 3: Harm (2025 AHA). For a stable one the drugs are procainamide or amiodarone.' },
    // a manual shock only: with his pulse the AED is not applied, so nothing happened to penalize
    { id: 'shock-with-pulse', actions: ['defib'], when: (s) => s.pulse, points: 20, severity: 'critical', text: 'An unsynchronized shock to a patient with a pulse. It can land on the T wave and set off VF. A tachycardia with a pulse that needs a shock gets synchronized cardioversion: 100 J for monomorphic VT (2025).' },
    {
      // its words cover the pressure too: procainamide with a low one is this same mistake (one penalty)
      id: 'two-antiarrhythmics', actions: ANTIARRHYTHMICS, when: (s) => s.pulse && (has(s, 'amiodarone') || has(s, 'procainamide')), points: 8, severity: 'major',
      replaces: ['procainamide-after-amiodarone', 'amiodarone-after-procainamide', 'procainamide-hypotension', ...RATE_RULES],
      text: 'A second antiarrhythmic dose on top of the first. Procainamide and amiodarone both lengthen the QT and drop the pressure: give one, and if it fails the next step is synchronized cardioversion (with sedation) or expert advice — not a second drug.',
    },
    {
      id: 'drug-while-unstable', actions: [...ANTIARRHYTHMICS, 'lidocaine'], when: (s) => inVt(s) && unstable(s), points: 8, severity: 'major',
      // the same mistake as procainamide with a low pressure, in the words of this case: one penalty, not two
      replaces: ['procainamide-hypotension', ...LIDOCAINE_RULES, ...RATE_RULES],
      text: 'An antiarrhythmic for a tachycardia that had become unstable. Hypotension, a change in mental status, chest pain or heart failure make it unstable: synchronized cardioversion now (100 J), not a drug that takes minutes and drops the pressure further.',
    },
    { id: 'no-sedation', actions: ['cardiovert'], when: (s) => inVt(s) && s.vitals.gcs >= 14 && !comfortable(s), points: 3, severity: 'minor', text: 'Cardioversion of an awake patient without sedation or analgesia. Sedate the conscious patient when you can.' },
    // accepted care, so it costs little, and nothing once medical control has been asked (an elective shock is their call in the field)
    { id: 'cardiovert-stable', actions: ['cardiovert'], when: (s) => inVt(s) && !unstable(s) && !has(s, 'med-control'), points: 2, severity: 'minor', text: 'An elective shock for a stable tachycardia without asking medical control. The 2025 AHA order is a drug first and synchronized cardioversion when it fails; a sedated shock first is also accepted care (the European guidelines\' first line when sedation is safe), but for a stable patient in the field it is medical control\'s call.' },
    // no penalty for lidocaine: some US protocols still list it for a stable wide-complex tachycardia. It just does not work here.
    { id: 'beta-blocker-vt', actions: ['metoprolol'], when: (s) => inVt(s), replaces: RATE_RULES, points: 3, severity: 'minor', text: 'IV metoprolol for a wide-complex tachycardia. It does not stop a monomorphic VT and it lowers the pressure; for a stable one the drugs are procainamide or amiodarone.' },
    // the 2015–2025 rule: adenosine only for a regular, monomorphic and STABLE wide-complex tachycardia
    { id: 'adenosine-unstable', actions: ['adenosine6', 'adenosine12'], when: (s) => inVt(s) && unstable(s), replaces: RATE_RULES, points: 5, severity: 'major', text: 'Adenosine for a wide-complex tachycardia that had become unstable (2025 AHA: 3 — Harm). Unstable means synchronized cardioversion now; adenosine only delays it, and in a wide-complex tachycardia it can set off VF.' },
    // with a low pressure a pressor is a bridge (the shock is still what he needs), so only a normal pressure makes it a mistake
    { id: 'pressor-not-low', actions: ['push-epi', 'pressor'], when: (s) => inVt(s) && s.vitals.sbp >= 90, points: 3, severity: 'minor', text: 'A pressor or push-dose epinephrine with a systolic pressure of 90 or more. His pressure did not need raising, and adrenergic drugs drive a ventricular circuit faster and can turn it into VF.' },
    { id: 'nitro-no-pain', actions: ['nitro', 'nitro-high'], when: (s) => inVt(s) && s.vitals.pain === 0 && s.vitals.sbp >= 90, points: 3, severity: 'minor', text: 'Nitroglycerin with no chest pain. It treats ischemic chest pain; in a fast tachycardia it only lowers the pressure the heart is struggling to keep up.' },
    { id: 'stemi-alert-no-ste', actions: ['stemi-alert'], when: (s) => s.pulse, points: 3, severity: 'minor', text: 'A STEMI alert without ST elevation. His 12-lead shows none: the heart center needs a radio report for its cardiologist and electrophysiology team, not a cath lab activation.' },
    { id: 'cpap-hypotension', actions: ['cpap'], when: (s) => s.pulse && s.vitals.sbp < 90, points: 5, severity: 'major', text: 'CPAP with a systolic pressure under 90. Positive pressure cuts the blood returning to the heart and drops the pressure further: an unstable tachycardia needs synchronized cardioversion.' },
    // after the shock that brought him back, oxygen titrated to 90–98 % is post-arrest care, not a mistake
    { id: 'oxygen-normoxic', actions: ['o2-nc', 'o2-nrb'], when: (s) => s.pulse && s.vitals.spo2 >= 90 && !has(s, 'rosc'), points: 2, severity: 'minor', text: 'Oxygen with an SpO₂ of 90 % or more. The tachycardia algorithm gives oxygen only if he is hypoxemic (below 90 %).' },
    // calcium is a fair answer to the pressure drop diltiazem caused, so only without it does it count as no indication
    { id: 'calcium-no-indication', actions: ['calcium-chloride'], when: (s) => !has(s, 'diltiazem'), points: 3, severity: 'minor', text: 'Calcium chloride without an indication. He has no high potassium, no low calcium and no calcium-channel-blocker overdose: it cannot stop the tachycardia, and it burns the tissue if it leaks.' },
  ]),
  timings: [
    { label: 'Pads on', actions: PADS, target: 4 },
    { label: 'First 12-lead', actions: ['ecg12'], target: 8 },
    { label: 'Antiarrhythmic (or a sedated cardioversion) started', actions: [...ANTIARRHYTHMICS, 'cardiovert'], target: 12 },
    { label: 'Synchronized cardioversion once unstable', actions: ['cardiovert'], target: 3, from: 'unstable' },
    { label: 'First shock once pulseless', actions: ['defib', 'aed'], target: 2, from: 'arrest' },
  ],
  transportMinutes: 15,
  nearestMinutes: 8,
  arrival: 'You arrive at the heart center; the emergency physician and the cardiologist on call meet you.',
  teaching: [
    'A regular wide-complex tachycardia is VT until proven otherwise — after a myocardial infarction nearly all of them are. A normal blood pressure does not make it SVT: stable VT is still VT.',
    'Stable or unstable? Hypotension, an acute change in mental status, signs of shock, ischemic chest discomfort or acute heart failure make a tachycardia unstable (2025 AHA).',
    'Stable wide QRS (2025 AHA): a 12-lead of the tachycardia and IV access, with the pads on in case he changes; consider adenosine only if it is regular and monomorphic (it seldom stops a scar VT, and never give it once the patient is unstable); an antiarrhythmic infusion; and expert consultation — in the field, online medical control.',
    'Procainamide 20–50 mg/min until the arrhythmia stops, hypotension, QRS widening by more than 50 % or 17 mg/kg (avoid it in heart failure or a long QT); or amiodarone 150 mg over 10 minutes, then 1 mg/min. In PROCAMIO (2017) procainamide stopped more tolerated wide-complex tachycardias than amiodarone (67 % vs 38 % within 40 minutes) with fewer major adverse events. Sotalol is no longer in the 2025 algorithm; lidocaine is not in it either and seldom stops a monomorphic VT, though some US protocols still list it.',
    'One antiarrhythmic. If it fails, the next step is synchronized cardioversion with sedation (2025 AHA: recommended when drugs fail or cannot be given), or expert advice — not a second drug: procainamide and amiodarone together lengthen the QT and drop the pressure. A sedated cardioversion first is accepted care too (the European guidelines\' first line when sedation is safe); in the field it is medical control\'s call.',
    'Never diltiazem or verapamil for a wide-complex tachycardia (2025 AHA: COR 3, Harm): they drop the pressure and can turn VT into VF. Magnesium is for torsades, not for monomorphic VT.',
    'Unstable → synchronized cardioversion, biphasic: monomorphic VT 100 J (2025), sedated if possible. Monomorphic VT with a pulse is never shocked unsynchronized: the shock can land on the T wave. Pulseless VT, and sustained polymorphic VT with or without a pulse, get an unsynchronized defibrillation dose.',
    'Record a 12-lead before and after conversion: the tracing of the tachycardia guides the electrophysiologist, the one after it looks for ischemia, a long QT or pre-excitation. He needs his potassium and magnesium checked, an echo and an electrophysiology evaluation (ICD, ablation).',
  ],
};
