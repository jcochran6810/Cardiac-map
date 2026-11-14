import type { Effect, Line, Scenario, SimState } from '../types';
import { bpAfter, has } from '../kit';
import { RATE_RULES, yieldToHeavier } from '../rules/rhythm';

/**
 * The version this case teaches: atrial fibrillation with a rapid ventricular response in a man whose heart pumps at
 * 30 % (HFrEF after an old infarct) and who is starting to back up into his lungs. His pressure is fine and he is alert,
 * so he is hemodynamically stable: the history decides the drug. Diltiazem is the trap (a reduced ejection fraction makes
 * it harmful); his congestion rules out an IV beta-blocker, so amiodarone is the rate control; a synchronized shock
 * (200 J or more) is for when he becomes unstable. His early congestion is the gray zone of "acute heart failure", so a
 * sedated shock while he is still stable is a small, explained deduction, not a major error.
 */
const AF = 'atrial-fibrillation';

/** He is still in atrial fibrillation, with a pulse */
const inAf = (s: SimState) => s.pulse && s.rhythm.profile === AF;

/** Unstable and still fibrillating: the shock is overdue */
const unstableAf = (s: SimState) => inAf(s) && has(s, 'unstable');

/** Only a patient awake enough to talk says how it feels */
const awake = (s: SimState, text: string, tone?: Line[2]): Line[] => (s.pulse && s.vitals.gcs >= 13 ? [tone ? ['patient', text, tone] : ['patient', text]] : []);

/** Worse, never better: a pressure or SpO₂ a drug has already pushed lower stays where it is */
function failing(s: SimState, sbp: number, dbp: number, spo2: number) {
  const v = s.vitals;
  return { sbp: Math.min(v.sbp, sbp), dbp: Math.min(v.dbp, dbp), spo2: Math.min(v.spo2, spo2), rr: Math.max(v.rr, 30), gcs: Math.min(v.gcs, 13) };
}

/** A shock (manual or AED) for the VF an unsynchronized shock caused: witnessed, with pads on, it converts at once */
function vfShock(s: SimState, how: string): Effect | null {
  if (s.pulse || s.rhythm.profile !== 'vf') return null;
  return {
    say: [['monitor', how], ['you', 'An organized rhythm and a pulse — ROSC.', 'good']],
    rhythm: { profile: 'sinus-tachycardia', hr: 106 }, pulse: true, vitals: { sbp: 94, dbp: 58, spo2: 90, rr: 26, gcs: 12 },
    flags: ['pads', 'monitor', 'shocked', 'converted'],
  };
}

/** Adenosine blocks the AV node for seconds: the atria keep fibrillating, so the same rhythm comes straight back */
function adenosine(s: SimState): Effect | null {
  if (!inAf(s)) return null;
  return {
    say: [['monitor', `A few seconds of slower, wider-spaced beats, then back to about ${s.rhythm.hr}.`], ...awake(s, '"Whoa — my chest went tight for a second."')],
    flags: ['adenosine'],
  };
}

/** Adrenergic drugs raise the pressure and speed AV conduction: in atrial fibrillation the rate goes up */
function adrenergic(s: SimState, dSbp: number, dDbp: number, flag: string): Effect | null {
  if (!inAf(s)) return null;
  const bp = bpAfter(s, dSbp, dDbp);
  const hr = Math.min(180, s.rhythm.hr + 8);
  return { say: [['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`]], rhythm: { ...s.rhythm, hr }, vitals: bp, flags: [flag] };
}

/** Nitroglycerin for his congested lungs (no chest pain): 0.4 mg, or the 0.8 mg high dose */
function nitroAf(s: SimState, high: boolean): Effect | null {
  if (!inAf(s)) return null;
  const bp = high ? bpAfter(s, -20, -10) : bpAfter(s, -10, -6);
  return { say: [['monitor', `BP ${bp.sbp}/${bp.dbp}.`], ...awake(s, '"Maybe a little easier to breathe."')], vitals: bp, flags: high ? ['nitro', 'nitro-high'] : ['nitro'] };
}

export const afRvrField: Scenario = {
  id: 'af-rvr-field',
  title: 'Racing, irregular heart and short of breath',
  // the picker must not answer the first question (stable or unstable?) for the learner
  summary: '70-year-old man with a fast, irregular heartbeat since breakfast and breathlessness. Stable or unstable — and which drug is safe for him?',
  setting: 'field',
  roles: [2],
  difficulty: 'intermediate',
  conditionId: 'atrial-fibrillation',
  briefing: {
    default: [
      ['dispatch', 'Priority 2: 70-year-old man with a racing heart and shortness of breath.'],
      ['scene', 'He is sitting up on the edge of his bed, breathing a little fast but talking in full sentences. "My heart has been racing since breakfast and I can\'t get my breath." His wife holds out a bag of pill bottles.'],
      ['hospital', 'Nearest emergency department: 9 minutes. Heart center: 14 minutes.'],
    ],
  },
  initial: {
    rhythm: { profile: AF, hr: 148 },
    vitals: { sbp: 112, dbp: 74, spo2: 93, rr: 24, etco2: 33, pain: 0, gcs: 15, glucose: 132, temp: 36.8 },
  },
  // what the built-in drug rules need to know: a weak heart (procainamide is to be avoided in heart failure), and the fluid
  // backing up into his lungs (crackles at both bases: no legs up, no bolus)
  problems: ['heart-failure', 'pulmonary-edema'],
  facts: {
    // the onset time is what the hospital needs to decide on cardioversion and anticoagulation
    opqrst: 'It started suddenly at breakfast, about 7 o\'clock — three hours ago: a fluttering, racing heartbeat. Now I get breathless walking to the bathroom. No chest pain, no fainting. I\'ve never felt this before.',
    // the history that makes this the heart-failure version of the case
    sample: 'No allergies. Heart attack six years ago, and since then a weak heart: the heart-failure clinic letter in the bag says "ejection fraction 30 %". Medicines: carvedilol 12.5 mg twice a day, sacubitril–valsartan, spironolactone, dapagliflozin, furosemide 40 mg, atorvastatin and aspirin 81 mg — no blood thinner. No pacemaker or implanted defibrillator. Never had an irregular heartbeat before. Breakfast at 7.',
    pde5: 'No.',
    lungs: (s) => {
      if (unstableAf(s)) return 'Crackles halfway up both sides.';
      if (has(s, 'rate-controlled') || has(s, 'converted')) return 'A few fine crackles at both bases, quieter than before.';
      // a bolus goes to the lungs of a failing heart: what the partner heard, the learner hears too
      if (has(s, 'fluid')) return 'Crackles a third of the way up both sides — higher than before the fluid.';
      return 'Fine crackles at both bases.';
    },
    perfusion: (s) => (unstableAf(s)
      ? 'Gray, cool and clammy; weak radial pulse; neck veins distended to the jaw.'
      : `Pale, cool hands; radial pulse ${inAf(s) ? `${s.rhythm.hr >= 120 ? 'fast and ' : ''}irregular, varying in strength` : 'regular'}; neck veins distended sitting up at 45°; pitting edema of both ankles.`),
    // atrial fibrillation throws clots: the stroke screen is part of the assessment
    neuro: (s) => (s.vitals.gcs >= 15 ? 'Alert and oriented; no facial droop, no arm drift, speech normal.' : 'Drowsy but oriented; no facial droop, no arm drift.'),
    ecg12: (s) => {
      if (s.rhythm.profile === AF) {
        return `Irregularly irregular narrow-complex rhythm at about ${s.rhythm.hr} with no P waves — a wavy, fibrillating baseline in V1: atrial fibrillation with a rapid ventricular response. Narrow QRS with no delta wave (not pre-excited), no ST elevation.`;
      }
      if (s.rhythm.profile === 'normal-sinus') return `Sinus rhythm at ${s.rhythm.hr}: a P wave before every QRS again, normal PR, narrow QRS with no delta wave, no ST elevation.`;
      if (s.rhythm.profile === 'sinus-tachycardia') return `Sinus tachycardia ${s.rhythm.hr} after the shock: narrow QRS, no delta wave, no ST elevation.`;
      return 'No 12-lead possible right now.';
    },
  },
  status: (s) => {
    if (!s.pulse) return 'Unresponsive.';
    // back from the VF an unsynchronized shock caused: groggy, not chatting
    if (has(s, 'rosc')) return 'Groggy and confused, slowly coming round: "What happened? My chest is sore."';
    if (has(s, 'converted')) return '"My heart has settled — I can breathe again."';
    if (s.vitals.gcs < 13) return 'Barely responding; gray and gasping.';
    // unstable from chest pain (the epinephrine surge) he is wide awake; from a low pressure he is drowsy
    if (has(s, 'unstable')) return s.vitals.pain >= 5 ? '"My chest — it\'s crushing… I can\'t get my breath."' : 'Drowsy, gasping out a few words at a time.';
    if (has(s, 'rate-controlled')) return '"That\'s much better. Still fluttery, but I can get my breath."';
    return '"It\'s still racing, and I\'m short of breath."';
  },
  respond: {
    // a hand on the wrist feels a fast, irregular pulse; naming the rhythm is the 12-lead's job
    primary: (s) => (s.pulse
      ? { say: [['you', `Airway open; breathing ${s.vitals.rr}/min, sitting up; radial pulse ${inAf(s) ? 'fast and irregular, about' : 'regular,'} ${s.rhythm.hr}/min; GCS ${s.vitals.gcs}.`]] }
      : null),
    // each call (up to three) is answered for where the crew is then; the order never names the rhythm
    'med-control': (s) => {
      let advice: string;
      if (!s.pulse) advice = 'Medical control: "No pulse — defibrillate and run the arrest algorithm, then call me back."';
      else if (has(s, 'converted')) advice = 'Medical control: "Good. Pads stay on, repeat the 12-lead and bring him in: anticoagulation is our decision here, so tell us exactly when it started."';
      else if (unstableAf(s)) advice = 'Medical control: "He is unstable now: synchronized cardioversion at 200 J or more, with sedation only if his pressure allows. Don\'t wait on a drug."';
      else if (has(s, 'amio-drip')) advice = 'Medical control: "Let the amiodarone run — nothing on top of it, and no diltiazem. Pads on standby: if he becomes unstable, synchronized cardioversion at 200 J or more."';
      // without the tracing and the history the physician cannot choose the drug: a conditional order, not a guess
      else if (!has(s, 'ecg12') || !has(s, 'sample')) {
        advice = 'Medical control: "I need his 12-lead and his history before a rate drug. If his heart is weak or he has heart failure, no diltiazem: amiodarone 150 mg over 10 minutes instead. If there is a delta wave, no AV-nodal drug at all, amiodarone included. If he becomes unstable, synchronized cardioversion at 200 J or more. And get me the time it started."';
      } else {
        advice = 'Medical control: "No diltiazem with an ejection fraction of 30 %, and no IV beta-blocker while he is congested. Amiodarone 150 mg over 10 minutes, pads on standby; synchronized cardioversion at 200 J or more only if he becomes unstable. And get me the time it started."';
      }
      return { say: [['hospital', advice]], flags: ['med-control'] };
    },
    adenosine6: adenosine,
    adenosine12: adenosine,
    diltiazem: (s) => {
      if (!inAf(s)) return null;
      // it slows the AV node a little, but in a heart pumping at 30 % it weakens the squeeze and dilates the vessels
      const v = failing(s, 78, 46, 88);
      const hr = Math.min(s.rhythm.hr, 128);
      return {
        say: [
          ['monitor', `Heart rate ${hr}, but BP falls to ${v.sbp}/${v.dbp}. SpO₂ ${v.spo2}%.`, 'bad'],
          ['partner', 'He has gone gray and sweaty, he can only get a few words out, and he is fighting to sit up straight.', 'bad'],
        ],
        rhythm: { ...s.rhythm, hr }, vitals: v, flags: ['diltiazem', 'unstable'],
      };
    },
    metoprolol: (s) => {
      if (!inAf(s)) return null;
      // on top of his carvedilol, the extra beta-blockade weakens the squeeze more than it slows the rate
      const bp = bpAfter(s, -14, -8);
      const hr = Math.min(s.rhythm.hr, 136);
      const spo2 = Math.min(s.vitals.spo2, 92);
      return {
        say: [['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}. SpO₂ ${spo2}%.`], ...awake(s, '"I\'m no better — if anything, more out of breath."')],
        rhythm: { ...s.rhythm, hr }, vitals: { ...bp, spo2 }, flags: ['beta-blocker'],
      };
    },
    'amio-infusion': (s) => {
      if (!inAf(s)) return null;
      // once he is unstable a 10-minute infusion is too slow, and it only drops the pressure further
      if (has(s, 'unstable')) {
        const low = bpAfter(s, -6, -4);
        return { say: [['you', 'Amiodarone 150 mg running over 10 minutes.'], ['monitor', `Heart rate ${s.rhythm.hr}. BP ${low.sbp}/${low.dbp}.`, 'bad']], vitals: low, flags: ['amiodarone'] };
      }
      // the rate starts to come down at once; the full effect comes over the next minutes (event 'rate-down')
      const hr = Math.min(s.rhythm.hr, 132);
      const bp = bpAfter(s, -4, -2);
      return {
        say: [['you', 'Amiodarone 150 mg in 100 mL running over 10 minutes; BP checked every few minutes.'], ['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`]],
        rhythm: { ...s.rhythm, hr }, vitals: bp, flags: ['amiodarone', 'amio-drip'],
      };
    },
    // the 300 mg arrest push, given with a pulse: the solvent drops the pressure hard and nothing slows
    'amio-arrest': (s) => {
      if (!inAf(s)) return null;
      const bp = bpAfter(s, -24, -14);
      return { say: [['you', 'Amiodarone 300 mg pushed.'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`, 'bad']], vitals: bp, flags: ['amiodarone'] };
    },
    procainamide: (s) => {
      if (!inAf(s)) return null;
      // in a heart pumping at 30 % it weakens the squeeze and dilates the vessels more than usual; it does not slow the rate
      const bp = bpAfter(s, -18, -10);
      return {
        say: [['you', 'Procainamide running at 30 mg/min; BP and QRS width checked every few minutes.'], ['monitor', `Heart rate ${s.rhythm.hr}. BP ${bp.sbp}/${bp.dbp}.`, 'bad']],
        vitals: bp, flags: ['procainamide'],
      };
    },
    // calcium reverses part of what diltiazem did to the vessels and the squeeze; the fast rate is still the problem
    'calcium-chloride': (s) => {
      if (!inAf(s) || !has(s, 'diltiazem')) return null;
      const bp = { sbp: Math.max(s.vitals.sbp, 92), dbp: Math.max(s.vitals.dbp, 56) };
      return {
        say: [['you', 'Calcium chloride 1 g in slowly over a few minutes; line flushed.'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`, 'good'], ...awake(s, '"That burns going up my arm."')],
        vitals: bp, flags: ['calcium'],
      };
    },
    sedation: (s) => {
      if (!inAf(s)) return null;
      // a heart pumping at 30 % tolerates sedatives badly: the pressure falls more than in a normal heart
      const bp = has(s, 'unstable') ? bpAfter(s, -4, -2) : bpAfter(s, -8, -4);
      return {
        say: [['you', 'Small, titrated dose of sedation/analgesia: drowsy but rousable, airway fine, capnography on.'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`]],
        vitals: bp, flags: ['sedation'],
      };
    },
    // midazolam is his sedation before a shock: the same small, titrated dose, and the weak heart drops the pressure the same way
    midazolam: (s) => {
      if (!inAf(s)) return null;
      const bp = has(s, 'unstable') ? bpAfter(s, -4, -2) : bpAfter(s, -8, -4);
      return {
        say: [['you', 'Midazolam 1 mg IV, small and titrated: drowsy but rousable, airway fine, capnography on.'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`]],
        vitals: bp, flags: ['sedation', 'benzodiazepine'],
      };
    },
    cardiovert: (s) => {
      if (!inAf(s)) return null;
      // 200 J biphasic (2025 AHA: atrial fibrillation 200 J or more); with a normal rate the failing heart fills and pumps again
      const unstable = has(s, 'unstable');
      // a normal rate lets the weak heart hold a fair pressure (an epinephrine surge wears off); a brain that was barely
      // perfused comes round over minutes, not at the moment of the shock
      const within = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
      const vitals = unstable
        ? { sbp: within(s.vitals.sbp, 102, 128), dbp: within(s.vitals.dbp, 64, 80), spo2: Math.max(s.vitals.spo2, 92), rr: 22, gcs: s.vitals.gcs >= 13 ? 15 : 14, pain: 0 }
        : { spo2: Math.max(s.vitals.spo2, 95), rr: Math.min(s.vitals.rr, 20) };
      return {
        say: [
          ['monitor', 'Synchronized shock delivered at 200 J. The rhythm changes: heart rate 92.', 'good'],
          ...awake(s, has(s, 'sedation') ? '"…Is it over? My heart has calmed down."' : '"Aagh! What was that? …My heart has slowed right down."'),
        ],
        rhythm: { profile: 'normal-sinus', hr: 92 }, vitals, flags: ['pads', 'monitor', 'cardioverted', 'converted'],
      };
    },
    // an unsynchronized shock can land on the T wave: VF, as in any rhythm with a pulse
    defib: (s) => {
      if (inAf(s)) {
        return {
          say: [['monitor', 'Unsynchronized shock delivered — he goes limp and the monitor alarms!', 'bad']],
          rhythm: { profile: 'vf', hr: 0 }, pulse: false, flags: ['pads', 'monitor', 'iatrogenic-vf'],
        };
      }
      return vfShock(s, 'Shock delivered.');
    },
    // with his pulse the AED is not applied (the default refuses it); in the VF it shocks, as the manual defibrillator does
    aed: (s) => vfShock(s, 'AED: "Shock advised." Shock delivered.'),
    // a failing heart cannot take more volume: it goes to the lungs
    fluid: (s) => {
      if (!s.pulse) return null;
      const bp = bpAfter(s, 4, 2);
      const spo2 = Math.max(80, s.vitals.spo2 - 3);
      return {
        say: [['monitor', `Bolus in. BP ${bp.sbp}/${bp.dbp}. SpO₂ ${spo2}%.`], ['partner', 'The crackles are higher than before.', 'warn']],
        vitals: { ...bp, spo2 }, flags: ['fluid'],
      };
    },
    cpap: (s) => {
      if (!s.pulse) return null;
      // positive pressure cuts venous return: with a low pressure it drops it further
      if (s.vitals.sbp < 90) {
        const bp = bpAfter(s, -8, -4);
        return { say: [['you', 'CPAP applied at 5 cmH₂O.'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`, 'bad']], vitals: bp, flags: ['cpap'] };
      }
      const spo2 = Math.min(97, s.vitals.spo2 + 3);
      return { say: [['you', 'CPAP applied at 5 cmH₂O.'], ['monitor', `SpO₂ ${spo2}%.`]], vitals: { spo2, rr: Math.max(18, s.vitals.rr - 2) }, flags: ['cpap'] };
    },
    'push-epi': (s) => adrenergic(s, 16, 10, 'push-epi'),
    pressor: (s) => adrenergic(s, 22, 14, 'pressor'),
    // IM epinephrine and a bronchodilator are beta-agonists too: the rate goes up and his crackles do not clear
    'epi-im': (s) => adrenergic(s, 10, 6, 'epi-im'),
    albuterol: (s) => {
      if (!inAf(s)) return null;
      const hr = Math.min(180, s.rhythm.hr + 6);
      return { say: [['you', 'Albuterol nebulizer running.'], ['monitor', `Heart rate ${hr}.`], ...awake(s, '"I\'m no less short of breath — just shaky."')], rhythm: { ...s.rhythm, hr }, flags: ['albuterol'] };
    },
    // the arrest dose with a pulse: a surge of pressure and rate that a heart pumping at 30 % cannot meet — chest pain
    // and wetter lungs, so he is now unstable (ischemic chest pain, worse pulmonary edema) despite the high pressure
    epinephrine: (s) => {
      if (!inAf(s)) return null;
      const bp = bpAfter(s, 50, 24, { sbp: 200, dbp: 110 });
      const hr = Math.min(180, s.rhythm.hr + 24);
      const spo2 = Math.max(80, s.vitals.spo2 - 4);
      return {
        say: [
          ['you', 'Epinephrine 1 mg IV, flushed.'],
          ['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}. SpO₂ ${spo2}%.`, 'bad'],
          ['partner', 'He grabs his chest — crushing pain — and he is fighting for breath.', 'bad'],
        ],
        rhythm: { ...s.rhythm, hr }, vitals: { ...bp, spo2, pain: Math.max(s.vitals.pain, 7), rr: Math.max(s.vitals.rr, 30) }, flags: ['epi', 'unstable'],
      };
    },
    // atropine speeds AV conduction: with fibrillating atria more impulses get through and the rate rises
    atropine: (s) => {
      if (!inAf(s)) return null;
      const hr = Math.min(180, s.rhythm.hr + 10);
      return { say: [['monitor', `Heart rate ${hr}.`]], rhythm: { ...s.rhythm, hr }, flags: ['atropine'] };
    },
    // he has no chest pain: nitroglycerin only unloads his congested lungs a little, and lowers the pressure (the high
    // dose twice as much)
    nitro: (s) => nitroAf(s, false),
    'nitro-high': (s) => nitroAf(s, true),
    // no pain to treat: fentanyl only takes the edge off a shock to come (it counts as analgesia for one)
    fentanyl: (s) => {
      if (!inAf(s)) return null;
      const bp = bpAfter(s, -4, -2);
      return { say: [['you', 'Fentanyl 50 mcg IV.'], ...awake(s, '"I feel a bit floaty."'), ['monitor', `BP ${bp.sbp}/${bp.dbp}.`]], vitals: bp, flags: ['analgesia'] };
    },
    // the physician reads the transmitted 12-lead and stands the cath lab down: no ST elevation (the learner has read it)
    'stemi-alert': (s) => {
      if (!has(s, 'ecg12')) return null;
      return { say: [['hospital', 'The interventional cardiologist looks at your 12-lead: no ST elevation — the cath lab is not activated. Bring him to the emergency department.']], flags: ['alert-declined'] };
    },
  },
  events: [
    {
      // a failing heart cannot keep up with a rate near 150 for long: untreated, he decompensates
      id: 'worse',
      when: (s) => inAf(s) && s.minute >= 14 && !has(s, 'amio-drip') && !has(s, 'unstable') && !has(s, 'arrived'),
      effect: (s) => {
        const v = failing(s, 86, 54, 88);
        return {
          say: [
            ['partner', 'He is getting more breathless and drowsy — a few words at a time now, pale and clammy.', 'bad'],
            ['monitor', `BP ${v.sbp}/${v.dbp}. SpO₂ ${v.spo2}%.`, 'bad'],
          ],
          vitals: v, flags: ['unstable'],
        };
      },
    },
    {
      // whatever pushed it there (a drug, sedation, positive pressure), a pressure under 90 makes him unstable
      id: 'hypotensive',
      when: (s) => inAf(s) && s.vitals.sbp < 90 && !has(s, 'unstable'),
      effect: (s) => ({ say: [['partner', 'His pressure is under 90 now and he is drowsier.', 'bad']], vitals: { gcs: Math.min(s.vitals.gcs, 13) }, flags: ['unstable'] }),
    },
    {
      // unstable and not shocked: a heart pumping at 30 % slides into cardiogenic shock (worse, never better)
      id: 'shock-deepens',
      when: (s) => unstableAf(s) && s.minute >= s.flags.unstable + 8,
      effect: (s) => {
        const v = { sbp: Math.min(s.vitals.sbp, 72), dbp: Math.min(s.vitals.dbp, 42), spo2: Math.min(s.vitals.spo2, 84), rr: Math.max(s.vitals.rr, 32), gcs: Math.min(s.vitals.gcs, 10) };
        return {
          say: [['partner', 'He is barely responding now — gray, mottled and gasping.', 'bad'], ['monitor', `BP ${v.sbp}/${v.dbp}. SpO₂ ${v.spo2}%.`, 'bad']],
          vitals: v,
        };
      },
    },
    {
      // amiodarone slows AV conduction over the minutes of the infusion: a slower rate lets the weak heart fill and pump
      id: 'rate-down',
      when: (s) => inAf(s) && has(s, 'amio-drip') && !has(s, 'unstable') && s.minute >= s.flags['amio-drip'] + 6,
      effect: (s) => {
        const hr = Math.min(s.rhythm.hr, 108);
        const bp = bpAfter(s, 6, 4);
        return {
          say: [['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`, 'good'], ...awake(s, '"That\'s better — I can get my breath now."', 'good')],
          rhythm: { ...s.rhythm, hr }, vitals: { ...bp, spo2: Math.max(s.vitals.spo2, 95), rr: Math.min(s.vitals.rr, 20) }, flags: ['rate-controlled'],
        };
      },
    },
  ],
  critical: [
    // only once he has arrested: the VF an unsynchronized shock causes is witnessed, with the pads already on. First, so
    // that a hint in the arrest names the shock, not an item from before it
    {
      id: 'arrest-shock', label: 'No pulse: defibrillate within 2 minutes', points: 15,
      why: 'The unsynchronized shock caused VF: witnessed, with the pads on, VF is defibrillated at once (now an unsynchronized shock is the right one) — every minute without a shock lowers survival.',
      done: ['defib', 'aed'], after: 'arrest', target: { within: { flag: 'arrest', minutes: 2 } }, applies: (s) => has(s, 'arrest'),
    },
    // a hint can name these before the 12-lead is read or the history taken: they say what to look for, not what he has
    { id: 'instability', label: 'Check for instability: blood pressure and mental status', why: 'Stable or unstable decides drug or shock: hypotension, acutely altered mental status, signs of shock, ischemic chest pain or acute heart failure make a tachycardia unstable.', done: ['vitals', 'nibp'], points: 5, target: { by: 4 } },
    { id: 'ecg', label: '12-lead ECG', why: 'The 12-lead names the rhythm, and shows what the monitor cannot: a delta wave (pre-excitation, where every AV-nodal drug, amiodarone included, is dangerous) or ST elevation.', done: ['ecg12'], points: 10, target: { by: 8 } },
    { id: 'history', label: 'SAMPLE history before choosing a drug', why: 'The history decides the drug: a weak heart (an ejection fraction of 40 % or less) rules out diltiazem and verapamil, heart failure that is backing up rules out an IV beta-blocker, and the hospital needs to know whether he takes an anticoagulant.', done: ['sample'], points: 10, target: { by: 10 } },
    { id: 'onset', label: 'When did it start?', why: 'About 3 hours ago — under 48 hours. The onset time decides whether the hospital can restore sinus rhythm without 3 weeks of anticoagulation or a TEE first, and it is easy to lose later.', done: ['opqrst'], points: 5 },
    { id: 'lungs', label: 'Listen to the lungs', why: 'Crackles mean a weak heart is backing up into the lungs — one more reason to avoid drugs that weaken the squeeze (diltiazem; an IV beta-blocker in decompensated heart failure) and to give no fluid.', done: ['lungs'], points: 5 },
    { id: 'iv', label: 'IV access', why: 'For amiodarone, and for sedation if he needs a shock.', done: ['iv', 'io'], points: 5 },
    {
      id: 'rate', label: 'Control the rate safely: amiodarone 150 mg over 10 minutes (a synchronized shock once he is unstable)',
      why: 'With a reduced ejection fraction IV diltiazem is harmful, and an IV beta-blocker is to be avoided while he is congested; amiodarone slows the rate without weakening the squeeze much (2023 AF guideline: reasonable in heart failure when those are ruled out). A rate near 150 is more than a heart pumping at 30 % can keep up with for long.',
      done: (s) => {
        // amiodarone counts while he is stable; once unstable, only the shock does
        const amio = s.performed.find((p) => p.id === 'amio-infusion' && (s.flags.unstable === undefined || p.minute < s.flags.unstable));
        const conv = has(s, 'converted') && !has(s, 'iatrogenic-vf') ? s.flags.converted : null;
        const times = [amio?.minute ?? null, conv].filter((m): m is number => m !== null);
        return times.length ? Math.min(...times) : null;
      },
      uses: ['amio-infusion', 'cardiovert'], points: 20, target: { by: 12 },
    },
    {
      id: 'shock', label: 'Unstable: synchronized cardioversion at 200 J or more', points: 15,
      why: 'Once he is unstable — a pressure under 90, drowsy and gasping, or chest pain — the treatment is an immediate synchronized shock (2025 AHA: atrial fibrillation 200 J or more, biphasic), with sedation only if his pressure allows. Left in it, the weak heart slides into cardiogenic shock.',
      done: (s) => (has(s, 'unstable') && has(s, 'converted') && !has(s, 'iatrogenic-vf') && s.flags.converted >= s.flags.unstable ? s.flags.converted : null),
      uses: ['cardiovert'], applies: (s) => has(s, 'unstable'), target: { within: { flag: 'unstable', minutes: 5 } },
    },
    { id: 'post-ecg', label: '12-lead after conversion', why: 'A baseline in sinus rhythm for the hospital: look for ischemia and for a delta wave (pre-excitation).', done: ['ecg12', 'ecg12-repeat'], after: 'converted', points: 5, applies: (s) => has(s, 'converted') },
    { id: 'transport', label: 'Transport', why: 'He needs the hospital to decide on rhythm control and anticoagulation, and his heart failure treated.', done: ['transport-near', 'transport-pci'], points: 5 },
    { id: 'handoff', label: 'Hand-off', why: 'Report the onset time (about 3 hours: under 48), the ejection fraction of 30 %, his medicines (no anticoagulant), what you gave and when, and how he responded.', done: ['handoff'], points: 5 },
  ],
  harms: yieldToHeavier([
    // the case's central trap: rescued perfectly, it still leaves the run below "Competent"
    { id: 'diltiazem-hfref', actions: ['diltiazem'], when: (s) => s.pulse, points: 25, severity: 'critical', replaces: ['diltiazem-heart-failure'], text: 'Diltiazem in a heart that pumps at 30 %. Calcium-channel blockers weaken the squeeze and dilate the vessels: with a reduced ejection fraction IV diltiazem and verapamil must not be given, with or without decompensated heart failure (2023 ACC/AHA AF guideline: 3 — Harm), and his failing heart could not hold its pressure. Take the history before the drug; with a weak, congested heart, amiodarone (or a synchronized shock if he is unstable).' },
    { id: 'metoprolol-decompensated', actions: ['metoprolol'], when: (s) => inAf(s), replaces: RATE_RULES, points: 4, severity: 'minor', text: 'IV metoprolol in a weak heart that is backing up into the lungs. A beta-blocker is a fair choice for a weak heart that is not congested (2023 AF guideline), but his crackles, low SpO₂ and new breathlessness are decompensated heart failure, where IV beta-blockers are to be avoided (2025 AHA) — and he already takes carvedilol: the extra dose weakened the squeeze more than it slowed the rate. Amiodarone is the drug here.' },
    { id: 'adenosine-af', actions: ['adenosine6', 'adenosine12'], when: (s) => inAf(s), replaces: RATE_RULES, points: 3, severity: 'minor', text: 'Adenosine does not convert atrial fibrillation. The atria fibrillate on their own, with no circuit through the AV node to break: adenosine slows the rate for seconds and the same rhythm comes back. It is for a regular narrow-complex tachycardia — and in pre-excited AF it can be dangerous.' },
    // he takes aspirin 81 mg for his old infarct, so the point is "aspirin is not anticoagulation", not "aspirin is never right"
    { id: 'aspirin-anticoagulation', actions: ['aspirin'], points: 3, severity: 'minor', text: 'A loading dose of aspirin with no indication. Aspirin is not stroke prevention in atrial fibrillation (2023 ACC/AHA AF guideline: aspirin as an alternative to anticoagulation is not recommended), he already takes 81 mg a day for his old infarct, and with no ischemic chest pain and no ST elevation a 324 mg dose treats nothing. Whether and how he is anticoagulated — and when sinus rhythm can safely be restored — is decided at the hospital, from the onset time you report.' },
    // a judgment call: his early congestion is the gray zone of "acute heart failure", so a sedated shock costs a little and
    // keeps him out of the top grade only when it comes with another slip (an unsedated shock, say)
    { id: 'cardiovert-stable', actions: ['cardiovert'], when: (s) => inAf(s) && !has(s, 'unstable'), points: 5, severity: 'minor', text: 'Synchronized cardioversion while he was hemodynamically stable. His pressure was normal and he was alert and talking in full sentences: the basal crackles were early congestion, not the shock or pulmonary edema that makes a shock urgent, so rate control comes first. An elective shock in a man with his stroke risk (CHA₂DS₂-VASc 3: heart failure, age 70, old infarct) needs anticoagulation started before it (2023 ACC/AHA AF guideline), and its sedation is hard on a heart pumping at 30 %: restoring sinus rhythm is the hospital\'s decision.' },
    { id: 'no-sedation', actions: ['cardiovert'], when: (s) => inAf(s) && s.vitals.gcs >= 14 && !has(s, 'sedation') && !has(s, 'analgesia'), points: 3, severity: 'minor', text: 'Cardioversion of an awake patient without sedation or analgesia.' },
    {
      id: 'antiarrhythmic-unstable', actions: ['amio-infusion', 'procainamide', 'diltiazem', 'metoprolol'], when: (s) => unstableAf(s), points: 8, severity: 'major',
      // the same mistake as the built-in "procainamide with a pressure under 90": one mistake, one penalty
      replaces: ['procainamide-hypotension', ...RATE_RULES],
      text: 'A drug for an unstable patient. Once he had become unstable, the treatment was an immediate synchronized shock (200 J or more), not an infusion that takes minutes to work and drops the pressure further.',
    },
    // atropine is for a slow rate; in a fast one it only lets more impulses through the AV node
    { id: 'atropine-fast', actions: ['atropine'], when: (s) => inAf(s), points: 3, severity: 'minor', text: 'Atropine for a fast heart rate. It is for symptomatic bradycardia; it speeds AV conduction, so with fibrillating atria the ventricular rate went up.' },
    { id: 'beta-agonist-no-indication', actions: ['epi-im', 'albuterol'], when: (s) => inAf(s), replaces: ['albuterol-no-bronchospasm', 'epi-im-no-anaphylaxis'], points: 3, severity: 'minor', text: 'A beta-agonist with no anaphylaxis and no wheeze. His breathlessness is fluid from a weak heart (crackles, not wheezing): IM epinephrine or albuterol treats nothing here, and speeds AV conduction, so the rate went up.' },
    { id: 'stemi-alert-no-ste', actions: ['stemi-alert'], when: (s) => s.pulse, points: 3, severity: 'minor', text: 'A STEMI alert without ST elevation. His 12-lead shows none: a fast rate in a weak heart can cause chest tightness and a troponin rise, but that is the emergency department\'s to sort out, not the cath lab team\'s to be called in for.' },
    { id: 'fluid-hf', actions: ['fluid'], replaces: ['fluid-pulmonary-edema'], when: (s) => s.pulse, points: 3, severity: 'minor', text: 'A fluid bolus for a failing heart with crackles at both bases. It goes to the lungs: his pressure falls because of the fast rate (and any drug), not for want of volume.' },
    { id: 'cpap-hypotension', actions: ['cpap'], when: (s) => s.pulse && s.vitals.sbp < 90, replaces: ['cpap-vomiting', 'cpap-preload-dependent', 'cpap-drowsy', 'cpap-no-indication'], points: 5, severity: 'major', text: 'CPAP with a systolic pressure under 90. Positive pressure cuts the blood returning to the heart and drops the pressure further.' },
    // calcium for the low pressure diltiazem caused: the built-in rule 'calcium-no-indication' spares it (a pulse and a
    // systolic under 90), and still charges it once the pressure is back or in the arrest an unsynchronized shock can cause
    { id: 'pressor-not-low', actions: ['push-epi', 'pressor'], when: (s) => s.pulse && s.vitals.sbp >= 90, replaces: ['pressor-no-hypotension'], points: 3, severity: 'minor', text: 'A pressor or push-dose epinephrine with a systolic pressure of 90 or more. His pressure did not need raising, and adrenergic drugs speed AV conduction: in atrial fibrillation the rate goes up.' },
  ]),
  timings: [
    { label: '12-lead', actions: ['ecg12'], target: 8 },
    { label: 'Rate control started (amiodarone or a synchronized shock)', actions: ['amio-infusion', 'cardiovert'], target: 12 },
    { label: 'Synchronized shock after he became unstable', actions: ['cardiovert'], from: 'unstable', target: 5 },
  ],
  transportMinutes: 14,
  nearestMinutes: 9,
  arrival: 'You arrive at the emergency department.',
  teaching: [
    'Tachycardia with a pulse: first decide stable or unstable — hypotension, acutely altered mental status, signs of shock, ischemic chest pain, acute heart failure. Unstable atrial fibrillation → immediate synchronized cardioversion at 200 J or more (biphasic, 2025 AHA), with sedation if his pressure allows.',
    'His early congestion (basal crackles, SpO₂ 93 %, with a normal pressure and a clear head) is the gray zone: he is hemodynamically stable, so rate control first, with a shock ready if he gets worse.',
    'Stable atrial fibrillation with a rapid ventricular response gets rate control (2023 ACC/AHA AF guideline: COR 1): a beta-blocker (metoprolol 2.5–5 mg IV), or — only with an ejection fraction above 40 % — IV diltiazem (0.25 mg/kg over 2 minutes).',
    'Take the history before the drug. With a reduced ejection fraction (40 % or less) IV diltiazem and verapamil are harmful, with or without decompensated heart failure (2023 AF guideline: 3 — Harm). An IV beta-blocker is still an option for a weak heart that is not congested, but is to be avoided in decompensated heart failure (2025 AHA). When both are ruled out: amiodarone 150 mg over 10 minutes (2023 AF guideline: reasonable in heart failure), or digoxin in the hospital.',
    'Adenosine does not convert atrial fibrillation; it only slows the rate for a few seconds. In pre-excited AF (wide, bizarre, very fast complexes) every AV-nodal drug, amiodarone included, is dangerous: procainamide or cardioversion.',
    'Find out when it started. AF of 48 hours or more needs 3 weeks of anticoagulation or a TEE before an elective cardioversion; under 48 hours, with his stroke risk, anticoagulation is still started before it. Amiodarone can convert AF too, so the hospital needs the onset time whichever you give. Anticoagulation is decided at the hospital; aspirin is not stroke prevention in AF.',
    'Atrial fibrillation throws clots: include a stroke screen in the assessment.',
    'No fluid bolus for a failing heart with crackles; never an unsynchronized shock with a pulse; no atropine or adrenergic drug for a fast rate with a normal pressure — they speed AV conduction. If diltiazem has dropped the pressure, calcium chloride reverses part of it.',
  ],
};
