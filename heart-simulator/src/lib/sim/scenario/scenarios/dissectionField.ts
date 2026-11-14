import type { Effect, Line, Scenario, SimState, Vitals } from '../types';
import { atRate, bpAfter, has, line } from '../kit';
import { NITRATE_RULES, nitrateCaseRule } from '../rules/acs';
import { RATE_RULES, yieldToHeavier } from '../rules/rhythm';
import { cpapHarmful } from '../rules/support';

/**
 * Acute type A aortic dissection in the field. A hypertensive man who ran out of his pills tears his ascending aorta lifting
 * groceries: sudden, worst-ever pain that rips through to his back, 40 mmHg less pressure in the left arm than the right and a
 * weaker left radial pulse (the flap runs through the arch into the left subclavian artery), and a 12-lead with only the LVH
 * of long-standing high blood pressure. The usual chest-pain answers are the traps: aspirin, nitroglycerin on its own, a STEMI
 * alert, the nearest emergency department. The right care is to find it (both arms, the pulses), withhold antithrombotics,
 * treat the pain, slow the heart only per protocol, and go straight to a center with cardiac surgery with an early call
 * (2022 ACC/AHA aortic disease guideline). Staying on scene lets it extend (minute 16), then bleed into the pericardium
 * (minute 22), then stop his heart.
 */

/** Minutes from the EMT's call until the paramedic intercept is at his side */
const ALS_MINUTES = 6;

/** What the flap takes off the left arm's pressure (the right arm, the higher one, is the pressure that is treated) */
const LEFT_DROP = { sbp: 40, dbp: 14 };

/** A pressure that is already high can still be driven higher (bpAfter's default ceiling would hide the rise) */
const HIGH = { sbp: 230, dbp: 130 };

/** On-scene minutes: the tear extends into the abdomen and the left leg, then bleeds into the pericardium, then he arrests */
const EXTENDS_AT = 16;
const TAMPONADE_AT = 22;
const ARREST_AFTER = 10;

const onScene = (s: SimState) => !has(s, 'enroute') && !has(s, 'arrived');

/** The highest the right arm's systolic is taken with fluid in the tamponade: a bridge to the surgeon, not a normal pressure */
const SHOCK_FLUID_CEILING = { sbp: 104, dbp: 72 };

/** On-scene heart-rate ceiling for the reflex tachycardia of sublingual nitroglycerin */
const NITRO_HR_CEILING = 120;

/** The left arm, past the flap: lower than the right by LEFT_DROP; too faint to hear once the right is low */
function leftArm(v: Pick<Vitals, 'sbp' | 'dbp'>): string {
  const sbp = v.sbp - LEFT_DROP.sbp;
  if (sbp < 60) return 'too faint to hear';
  return `${sbp}/${Math.min(v.dbp - LEFT_DROP.dbp, sbp - 10)}`;
}

/** The crew rechecks the right arm, the higher one, after anything that moves the pressure */
const rightArm = (bp: { sbp: number; dbp: number }): Line => ['you', `Right arm BP ${bp.sbp}/${bp.dbp}.`];

/** The rate after a drug: the monitor shows it once it is on; otherwise the crew counts it at the right wrist */
const rateLine = (s: SimState, hr: number, tone?: Line[2]): Line => (has(s, 'monitor') ? line('monitor', `Heart rate ${hr}.`, tone) : line('you', `Pulse ${hr}.`, tone));

/** A low pressure: a systolic under 90 in the right arm (the tamponade, or a drug that took it down) */
const low = (s: SimState) => s.vitals.sbp < 90;

/**
 * In shock: a low pressure, or the tamponade under way even after a bolus has brought the systolic back over 90 — the
 * pressure is held up by the fluid, and the rate drugs, the opioid and the nitroglycerin are still wrong while fluid is right
 */
const shock = (s: SimState) => low(s) || has(s, 'tamponade');

/** Something already slows the heart: the guideline's beta-blocker, or diltiazem for a patient who cannot take one */
const rateControlled = (s: SimState) => has(s, 'beta-blocker') || has(s, 'diltiazem');

/** Nitroglycerin: it does not touch this pain, and with nothing slowing the heart it makes it race (reflex tachycardia) */
function nitroEffect(s: SimState, how: 'own' | 'standard' | 'high'): Effect | null {
  if (!s.pulse) return null;
  const blocked = rateControlled(s);
  const bp = how === 'high' ? bpAfter(s, -22, -10) : bpAfter(s, -12, -6);
  // the reflex speeds the heart, but repeated tablets do not add up without end
  const hr = blocked ? s.rhythm.hr : Math.max(s.rhythm.hr, Math.min(NITRO_HR_CEILING, s.rhythm.hr + (how === 'high' ? 16 : 12)));
  const given = how === 'own' ? 'He puts one of his own nitroglycerin tablets under his tongue.' : `Nitroglycerin ${how === 'high' ? '0.8' : '0.4'} mg sublingual.`;
  return {
    say: [
      ['you', given],
      blocked ? ['patient', '"It\'s not touching the pain."'] : ['patient', '"It\'s not touching the pain — and now my heart is pounding."', 'bad'],
      rateLine(s, hr, blocked ? undefined : 'bad'),
      rightArm(bp),
    ],
    vitals: bp, rhythm: atRate(s, hr), flags: how === 'high' ? ['nitro', 'nitro-high'] : ['nitro'],
  };
}

/** Pressors and push-dose epinephrine: with a pressure of 190 they only drive it higher, and the heart harder */
function pressorEffect(s: SimState, flag: string): Effect | null {
  if (!s.pulse || low(s)) return null;
  const bp = bpAfter(s, 20, 10, HIGH);
  const hr = Math.min(140, s.rhythm.hr + 10);
  return {
    say: [['patient', '"It\'s tearing worse — oh, my back!"', 'bad'], rateLine(s, hr, 'bad'), rightArm(bp)],
    vitals: { ...bp, pain: 10 }, rhythm: atRate(s, hr), flags: [flag],
  };
}

/** A rate-slowing drug: the heart slows, the pressure falls with it (and in shock that is the last thing he needs) */
function rateDrug(s: SimState, what: string, dHr: number, flag: string): Effect | null {
  if (!s.pulse) return null;
  const bp = bpAfter(s, -16, -8);
  const hr = Math.min(s.rhythm.hr, Math.max(52, s.rhythm.hr - dHr));
  return { say: [['you', what], rateLine(s, hr, shock(s) ? 'bad' : undefined), rightArm(bp)], vitals: bp, rhythm: atRate(s, hr), flags: [flag] };
}

/** What the crew says it handed over: only what it actually found and did */
function handoffReport(s: SimState): string {
  const parts = ['the sudden tearing pain and when it began'];
  if (has(s, 'bp-arms')) parts.push(has(s, 'perfusion') ? 'the pressure in each arm and the pulses' : 'the pressure in each arm');
  else if (has(s, 'perfusion')) parts.push('the pulses');
  if (has(s, 'ecg12')) parts.push('the 12-lead');
  parts.push('what was given and what was held', 'and how he changed');
  return `SBAR hand-off: ${parts.join(', ')}.`;
}

export const dissectionField: Scenario = {
  id: 'aortic-dissection-field',
  title: 'Groceries on the kitchen floor',
  summary: '59-year-old man with sudden, severe chest pain that began as he lifted the groceries out of the car. Find what is causing it before you treat it: the 12-lead is not the whole story.',
  setting: 'field',
  roles: [1, 2],
  difficulty: 'intermediate',
  conditionId: 'aortic-dissection',
  briefing: {
    default: [
      ['dispatch', 'Priority 1: 59-year-old man, sudden severe chest pain, sweating. You are the ALS crew.'],
      ['scene', 'He is sitting on the kitchen floor beside a dropped bag of groceries, pale and sweating, one hand pressed to his chest and the other reaching around to his back. His wife: "It hit him all at once, about 25 minutes ago, as he lifted the bags out of the car."'],
      ['partner', 'Your partner, an EMT, has the stretcher and the airway bag; you have the monitor and the drug box.'],
      ['hospital', 'Regional heart center (cath lab, cardiac surgery, ICU): 16 minutes. Nearest emergency department (no cath lab, no cardiac surgery): 7 minutes.'],
    ],
    1: [
      ['dispatch', 'Priority 1: 59-year-old man, sudden severe chest pain, sweating. You are the BLS crew; a paramedic unit can meet you as an intercept if you ask for one.'],
      ['scene', 'He is sitting on the kitchen floor beside a dropped bag of groceries, pale and sweating, one hand pressed to his chest and the other reaching around to his back. His wife: "It hit him all at once, about 25 minutes ago, as he lifted the bags out of the car."'],
      ['partner', 'Your partner, an EMT, has the stretcher, the oxygen and the AED; the 12-lead monitor is in your bag.'],
      ['hospital', 'Regional heart center (cath lab, cardiac surgery, ICU): 16 minutes. Nearest emergency department (no cath lab, no cardiac surgery): 7 minutes.'],
    ],
  },
  initial: {
    // the 'aortic-dissection' profile: sinus with the LVH and strain of years of high pressure, no STEMI. Under 100 so the
    // tracing is read as what it is (LVH), not as a sinus tachycardia
    rhythm: { profile: 'aortic-dissection', hr: 96 },
    vitals: { sbp: 190, dbp: 100, spo2: 96, rr: 22, etco2: 34, pain: 10, gcs: 15, glucose: 118, temp: 36.7 },
  },
  problems: ['aortic-dissection'],
  facts: {
    opqrst: 'It hit me all at once, lifting the bags — like something ripping inside my chest and going straight through to between my shoulder blades. The worst pain of my life, 10 out of 10, from the very first second. Nothing makes it better or worse. Now it\'s moving down my back.',
    sample: 'No allergies. High blood pressure for 15 years — amlodipine and lisinopril, but I ran out a couple of weeks ago. A cholesterol pill. I smoke a pack a day. No heart attacks, no blood thinners. My doctor gave me nitroglycerin tablets a few months ago for some chest tightness; I\'ve never used them. No drugs. Lunch at noon.',
    pde5: '"No, nothing like that."',
    ownNitro: 'A bottle of nitroglycerin 0.4 mg tablets in the kitchen cabinet, prescribed eight months ago and never opened.',
    bpArms: (s) => {
      const left = leftArm(s.vitals);
      return left === 'too faint to hear'
        ? `Right arm ${s.vitals.sbp}/${s.vitals.dbp} · left arm too faint to hear. The left radial pulse is barely there.`
        : `Right arm ${s.vitals.sbp}/${s.vitals.dbp} · left arm ${left}: ${LEFT_DROP.sbp} mmHg lower on the left. The left radial pulse is weaker than the right, and a beat behind it.`;
    },
    lungs: 'Clear and equal on both sides.',
    perfusion: (s) => {
      if (!s.pulse) return 'No pulse.';
      const legs = has(s, 'extended') ? 'right femoral and foot pulses present; the left femoral and foot pulses are gone, and the left leg is cool and mottled' : 'femoral and foot pulses present and equal';
      if (has(s, 'tamponade')) return `Gray, cool and clammy; neck veins distended; a fast, thready right radial pulse, the left one gone; ${legs}.`;
      return `Pale and sweaty; no JVD. Right radial pulse strong; left radial pulse weak and a beat behind it; ${legs}.`;
    },
    neuro: (s) => (has(s, 'extended')
      ? 'Alert and oriented. Face, speech and arms normal; his left leg is numb and weak.'
      : 'Alert and oriented. Face, speech, strength and sensation normal in all four limbs.'),
    // what the profile draws (its T vector projected on each lead): tall LVH voltages, T waves inverted in I, II, aVF, V5 and
    // V6, only just in III and aVL, flat in V4 and upright in V1–V3; no ST shift in any lead
    ecg12: (s) => `Sinus ${s.rhythm.hr > 100 ? 'tachycardia' : 'rhythm'} ${s.rhythm.hr} with left ventricular hypertrophy: tall QRS voltages and a strain pattern, T waves inverted in I, II, aVF, V5 and V6 (shallow in III and aVL, flat in V4) — the thick heart muscle of years of high blood pressure. No ST elevation anywhere, so it does not meet STEMI criteria. A 12-lead like this does not show what is causing his pain.`,
  },
  status: (s) => {
    if (!s.pulse) return 'Unresponsive.';
    const p = s.vitals.pain;
    if (has(s, 'tamponade')) return '"I feel like I\'m going to pass out…"';
    if (has(s, 'extended')) return `"It's down in my belly now — and I can't feel my left leg." Pain ${p} out of 10.`;
    if (p >= 7) return `"It's still tearing through to my back — ${p} out of 10."`;
    if (p >= 4) return `"Easier — ${p} out of 10. It's still there between my shoulder blades."`;
    return `"Much better — ${p} out of 10, a dull ache in my back."`;
  },
  respond: {
    // one arm at a time: the manual set is taken on the right; the monitor's cuff went on the left, past the flap
    vitals: (s) => (s.pulse
      ? { say: [['you', `BP ${s.vitals.sbp}/${s.vitals.dbp} in the right arm · pulse ${s.rhythm.hr} · RR ${s.vitals.rr} · SpO₂ ${s.vitals.spo2}%`]], flags: ['bp'] }
      : null),
    nibp: (s) => {
      if (!s.pulse || !has(s, 'monitor')) return null;
      const left = leftArm(s.vitals);
      return { say: [['monitor', `${left === 'too faint to hear' ? 'NIBP: unable to measure' : `NIBP ${left} mmHg`} — the monitor's cuff is on his left arm.`]], flags: ['bp'] };
    },
    reassess: (s) => (s.pulse
      ? { say: [['you', `Right arm BP ${s.vitals.sbp}/${s.vitals.dbp} · pulse ${s.rhythm.hr} · RR ${s.vitals.rr} · SpO₂ ${s.vitals.spo2}%`], ['patient', dissectionField.status!(s)]] }
      : null),
    // the physician reads what was sent: no STEMI, so no cath lab (the EMT does not interpret it)
    'ecg-transmit': (s) => (has(s, 'ecg12')
      ? { say: [['hospital', 'ECG received. The physician: "No ST elevation that meets STEMI criteria — it shows the thick heart muscle of years of high blood pressure. The cath lab is not activated. Call in your report."']], flags: ['transmitted'] }
      : null),
    'stemi-alert': (s) => (has(s, 'ecg12')
      ? { say: [['hospital', 'The interventional cardiologist reviews your 12-lead: LVH with strain, and no ST elevation that meets STEMI criteria — the cath lab is not activated. Bring him to the emergency department.', 'warn']], flags: ['alert-declined'] }
      : null),
    // pain control is part of the treatment: the surge of pain drives the rate and the pressure
    fentanyl: (s) => {
      if (!s.pulse) return null;
      const pain = Math.max(2, s.vitals.pain - 4);
      const bp = bpAfter(s, -12, -6);
      const hr = Math.min(s.rhythm.hr, Math.max(60, s.rhythm.hr - 6));
      const rr = Math.min(s.vitals.rr, Math.max(12, s.vitals.rr - 2));
      const feels = pain <= 3 ? '"That\'s much better… I feel a bit floaty."' : '"That takes the edge off."';
      return { say: [['you', 'Fentanyl 50 mcg IV.'], ['patient', feels], rateLine(s, hr), rightArm(bp)], vitals: { ...bp, pain, rr }, rhythm: atRate(s, hr), flags: ['analgesia'] };
    },
    metoprolol: (s) => rateDrug(s, 'Metoprolol 5 mg slow IV.', 14, 'beta-blocker'),
    diltiazem: (s) => rateDrug(s, 'Diltiazem IV, slowly.', 10, 'diltiazem'),
    'nitro-assist': (s) => nitroEffect(s, 'own'),
    nitro: (s) => nitroEffect(s, 'standard'),
    'nitro-high': (s) => nitroEffect(s, 'high'),
    // fluid for a pressure of 190 pushes it higher; in shock small boluses are the bridge to the surgeon — to a systolic
    // near 90 to 100, never back to a normal pressure that would push the tear on
    fluid: (s) => {
      if (!s.pulse) return null;
      if (shock(s)) {
        const bp = bpAfter(s, 10, 6, SHOCK_FLUID_CEILING);
        return { say: [['you', 'Bolus in.'], rightArm(bp)], vitals: bp, flags: ['fluid'] };
      }
      const bp = bpAfter(s, 8, 4, HIGH);
      return { say: [['you', 'Bolus in.'], ['patient', '"The ripping is worse again."', 'bad'], rightArm(bp)], vitals: { ...bp, pain: Math.min(10, s.vitals.pain + 2) }, flags: ['fluid'] };
    },
    'push-epi': (s) => pressorEffect(s, 'push-epi'),
    pressor: (s) => pressorEffect(s, 'pressor'),
    // online medical control: it asks for what decides this patient's care, and gives the paramedic an order for the rate
    'med-control': (s) => {
      if (!s.pulse) return null;
      // shock comes first, whatever has been measured: there is no rate or pressure to bring down any more (a bolus that has
      // brought the systolic back over 90 in the tamponade has not ended the shock)
      if (shock(s)) {
        return {
          say: [['hospital', s.role === 1
            ? 'Medical control: "He is in shock — no aspirin, no nitroglycerin. Keep him still, oxygen if his saturation drops, and go now: the heart center, where the surgeon is, with your intercept meeting you."'
            : 'Medical control: "He is in shock — no beta-blocker, no nitroglycerin, no more opioid. Small fluid boluses to keep him talking and his systolic near 90, and go now: the heart center, where the surgeon is."', 'warn']],
          flags: ['med-control', 'nitro-held'],
        };
      }
      if (!has(s, 'bp-arms')) {
        return { say: [['hospital', 'Medical control: "Tell me more — where does the pain go, and what is his pressure in each arm? Call me back with both before any aspirin or nitroglycerin."']], flags: ['med-control'] };
      }
      if (s.role === 1) {
        return { say: [['hospital', 'Medical control: "Hold the aspirin and the nitroglycerin. Go straight to the heart center — they have the cardiac surgeon — with your intercept meeting you on the way, and call them now with what you found."']], flags: ['med-control', 'nitro-held'] };
      }
      return {
        say: [['hospital', 'Medical control: "Hold the aspirin and the nitroglycerin. Fentanyl for the pain first. If his heart rate is still over 60 and his systolic over 120 after it, metoprolol 5 mg slow IV, once, on the monitor — aim for a rate of 60 to 80 and a systolic under 120, and hold it if his systolic is under 100. No nitroglycerin to bring the pressure down. Then straight to the heart center — they have the cardiac surgeon — and call them now."']],
        flags: ['med-control', 'rate-order', 'nitro-held'],
      };
    },
    // the early call: what the crew found decides what is waiting for him
    notify: (s) => {
      const near = has(s, 'dest-near');
      if (has(s, 'bp-arms')) {
        const given = has(s, 'aspirin') ? ' Note the aspirin he was given.' : '';
        const ecg = has(s, 'ecg12') ? ', no STEMI on the 12-lead' : '';
        // in shock the surgeon and the operating room come first: no trip to the scanner for a patient this unstable
        const ready = shock(s)
          ? 'He is in shock, with full neck veins: the cardiac surgeon and the operating room are being readied, and we will scan his heart at the door.'
          : 'We are clearing the CT scanner and calling the cardiac surgeon in.';
        return {
          say: [['hospital', near
            ? `Copy: sudden tearing chest pain through to the back, a ${LEFT_DROP.sbp} mmHg difference between the arms. We have no cardiac surgeon here — we will start a transfer when you arrive.${given}`
            : `Copy: sudden tearing chest pain through to the back, a ${LEFT_DROP.sbp} mmHg difference between the arms, a weak left radial pulse${ecg}. ${ready}${given}`]],
          flags: ['notified', 'notified-findings'],
        };
      }
      return { say: [['hospital', `Copy: chest pain, blood pressure ${s.vitals.sbp}/${s.vitals.dbp}. We'll see him in the emergency department.`]], flags: ['notified'] };
    },
    // the hand-off ends the field care; the scan tells what the crew suspected (in shock, the ultrasound at the door does)
    handoff: (s) => {
      if (!has(s, 'arrived') || !s.pulse) return null;
      const bled = has(s, 'aspirin') ? ' The aspirin he was given will add to the bleeding in the operating room.' : '';
      const found = has(s, 'tamponade')
        ? 'Bedside ultrasound at the door: blood around the heart and a flap in the ascending aorta.'
        : 'CT angiography 12 minutes later: a tear in the ascending aorta just above the valve, running through the arch into the left subclavian artery.';
      return {
        say: [
          ['you', handoffReport(s)],
          ['hospital', has(s, 'dest-pci')
            ? `${found} He goes straight to the operating room.${bled}`
            : `${has(s, 'tamponade') ? found : 'CT angiography: a tear in the ascending aorta.'} There is no cardiac surgeon here — he waits for the transfer to the heart center.${bled}`],
        ],
        flags: ['handoff'],
      };
    },
  },
  events: [
    {
      // the EMT's intercept: the paramedic takes over the IV and the pain relief
      id: 'als-arrives',
      when: (s) => s.role === 1 && has(s, 'als') && !has(s, 'arrived') && s.minute >= s.flags.als + ALS_MINUTES,
      effect: (s) => {
        const where = has(s, 'enroute') ? 'The medic unit meets you on the way; the paramedic climbs in' : 'The paramedic arrives';
        // called late, the intercept can find him already in arrest: ALS joins the CPR (nothing in the field relieves the cause)
        if (!s.pulse) {
          return { say: [['team', `${where}: an IO, epinephrine and an airway, while your compressions go on.`]], flags: ['iv', 'als-here'] };
        }
        const lines: Line[] = [];
        let vitals: Partial<Vitals>;
        let hr = s.rhythm.hr;
        if (shock(s)) {
          const bp = bpAfter(s, 10, 6, SHOCK_FLUID_CEILING);
          lines.push(['team', `${where}: an IV, and a small fluid bolus for his pressure.`], rightArm(bp));
          vitals = bp;
        } else {
          const bp = bpAfter(s, -12, -6);
          hr = Math.min(s.rhythm.hr, Math.max(60, s.rhythm.hr - 6));
          lines.push(['team', `${where}: an IV, and fentanyl 50 mcg for his pain.`], ['patient', '"That takes the edge off."'], rightArm(bp));
          vitals = { ...bp, pain: Math.max(2, s.vitals.pain - 4) };
        }
        if (has(s, 'aspirin')) lines.push(['team', '"He had aspirin? For pain that tears through to the back I hold it until the hospital has scanned him — tell them at the hand-off."', 'warn']);
        if (has(s, 'nitro')) lines.push(['team', '"And no more nitro for him — it only made his heart race."', 'warn']);
        return { say: lines, vitals, rhythm: atRate(s, hr), flags: ['iv', 'analgesia', 'als-here'] };
      },
    },
    {
      // left on scene, the tear runs on down the aorta: the gut and the left leg lose their blood supply
      id: 'extension',
      when: (s) => s.pulse && onScene(s) && s.minute >= EXTENDS_AT,
      effect: (s) => ({
        say: [
          ['patient', '"It\'s moving — it\'s in my belly now… and my left leg has gone numb."', 'bad'],
          ['partner', 'His left leg is pale and cool, and I can\'t find a pulse in that foot.', 'bad'],
        ],
        vitals: { pain: 10 }, flags: ['extended'],
      }),
    },
    {
      // still on scene: it bleeds into the sac around the heart (tamponade) — a fast rate, a falling pressure, full neck veins
      id: 'tamponade',
      when: (s) => s.pulse && onScene(s) && s.minute >= TAMPONADE_AT,
      effect: (s) => {
        const hr = Math.min(140, Math.max(s.rhythm.hr + 24, 118));
        const v = { sbp: Math.min(s.vitals.sbp, 84), dbp: Math.min(s.vitals.dbp, 62) };
        return {
          say: [
            ['patient', '"I feel like I\'m going to pass out…"', 'bad'],
            ['partner', 'He has gone gray and clammy, and his neck veins are standing out.', 'bad'],
            rateLine(s, hr, 'bad'),
          ],
          vitals: { ...v, gcs: 14, spo2: Math.min(s.vitals.spo2, 93), rr: 28 }, rhythm: atRate(s, hr), flags: ['tamponade'],
        };
      },
    },
    {
      // nothing in the field relieves it: left on scene, the heart stops
      id: 'arrest',
      when: (s) => s.pulse && onScene(s) && has(s, 'tamponade') && s.minute >= s.flags.tamponade + ARREST_AFTER,
      effect: (s) => ({
        say: [['partner', 'He\'s gone limp — not responding, not breathing normally!', 'bad'], ...(has(s, 'monitor') ? [line('monitor', 'Monitor alarm.', 'bad')] : [])],
        rhythm: { profile: 'pea-narrow', hr: 112 }, pulse: false, phase: 'arrest', vitals: { sbp: 0, dbp: 0, gcs: 3, rr: 0 }, flags: ['tamponade-arrest'],
      }),
    },
    {
      // the call ahead decides what is waiting at the door
      id: 'arrive-center',
      when: (s) => has(s, 'arrived') && has(s, 'dest-pci'),
      effect: (s) => ({
        say: [['hospital', has(s, 'notified-findings')
          ? (has(s, 'tamponade')
            ? 'Your call ahead set it up: the cardiac surgeon and the operating room are ready for him.'
            : 'Your call ahead set it up: the CT scanner is clear and the cardiac surgeon is on the way in.')
          : has(s, 'notified')
            ? 'He goes to a chest-pain bay; the physician takes the pressure in both arms before calling for the scanner and the surgeon.'
            : 'Nobody was expecting him: the team starts his workup from the beginning.']],
      }),
    },
    {
      id: 'arrive-near',
      when: (s) => has(s, 'arrived') && has(s, 'dest-near'),
      effect: () => ({ say: [['hospital', 'The emergency physician: "He needs a cardiac surgeon, and there is none here. We are calling for a transfer to the heart center — that will take an hour or more."', 'warn']] }),
    },
  ],
  critical: [
    // the arm pressures are a blood pressure and a pulse too: a crew that starts with them has taken the vital signs
    { id: 'vitals', label: 'Vital signs', why: 'A blood pressure and pulse before any drug or destination decision: his is 190/100 in the right arm.', done: ['vitals', 'nibp', 'bp-both-arms'], points: 5, target: { by: 5 } },
    {
      id: 'history', label: 'The pain and the history (OPQRST and SAMPLE)',
      why: 'Sudden, worst-ever pain that rips through to the back, at its worst from the first second, in a man whose blood pressure is untreated: the history is what makes you suspect the aorta.',
      done: (s) => (has(s, 'opqrst') && has(s, 'sample') ? Math.max(s.flags.opqrst, s.flags.sample) : null), uses: ['opqrst', 'sample'], points: 5, target: { by: 8 },
    },
    {
      id: 'both-arms', label: 'Blood pressure in both arms',
      why: 'Sudden tearing pain that goes through to the back is a torn aorta until proven otherwise. A systolic difference of more than 20 mmHg between the arms, or a weaker pulse on one side, backs it up — and decides the aspirin, the drugs and the destination (2022 ACC/AHA: measure the pressure in both arms).',
      done: ['bp-both-arms'], points: 15, target: { by: 10 },
    },
    { id: 'pulses', label: 'Compare the pulses: both wrists, the groins and the feet', why: 'A missing or delayed pulse marks a branch the flap has blocked; a new one lost later means the tear is spreading.', done: ['perfusion'], points: 5, target: { by: 10 } },
    // 6 minutes leaves room for the assessment that raises the suspicion (the pain, the vitals, both arms, the pulses) first
    { id: 'als', label: 'Request a paramedic intercept', roles: [1], why: 'He needs IV pain relief and may need his rate and pressure treated: the intercept meets you, but never wait on scene for it.', done: ['als'], points: 10, target: { by: 6 } },
    { id: 'ecg', label: '12-lead ECG within 10 minutes', why: 'Every chest pain needs a 12-lead within 10 minutes. His shows no STEMI — only the thick heart muscle of years of high blood pressure — which is common with a torn aorta and does not rule it out.', done: ['ecg12'], points: 10, target: { by: 10 } },
    { id: 'transmit', label: 'Transmit the 12-lead (you do not interpret it)', roles: [1], why: 'The physician reads it and keeps the cath lab down for a tracing with no STEMI.', done: ['ecg-transmit'], points: 10, target: { by: 15 } },
    { id: 'iv', label: 'IV access', roles: [2], why: 'For pain relief, the rate drug medical control may order and fluid if he deteriorates.', done: ['iv', 'io'], points: 5 },
    {
      id: 'analgesia', label: 'Pain relief: fentanyl IV', roles: [2], points: 10, target: { by: 15 }, done: ['fentanyl'],
      why: 'Pain drives his rate and pressure, and both tear the aorta further: an IV opioid is part of the treatment (2022 ACC/AHA: pain control to help with hemodynamic management). Preferred over nitroglycerin for this pain.',
    },
    {
      id: 'consult', label: 'Medical control: report, and ask about the rate and pressure', roles: [2], points: 5, done: ['med-control'],
      why: 'Lowering the rate and pressure (a beta-blocker first, to a rate of 60–80 and a systolic under 120) is the treatment once the tear is confirmed. In the field, before a scan, it is a drug for your protocol or medical control — and so is the destination.',
    },
    {
      id: 'destination', label: 'Leave the scene for the heart center with cardiac surgery', points: 15, target: { by: 15 }, done: ['transport-pci'],
      why: 'A tear in the ascending aorta needs emergency surgery (2022 ACC/AHA: COR 1), and untreated its early death rate is about 1–2 % an hour. Go straight to the center with a cardiac surgeon: a stop at an emergency department without one only adds a transfer.',
    },
    {
      // within 8 minutes of loading leaves the hospital 8 minutes or more of the 16-minute ride to clear the scanner and call
      // the surgeon in: a crew that leaves first and finds the arm pressures on the way still calls early enough
      id: 'notify', label: 'Early notification: radio report with what you found', points: 10, done: ['notify'], target: { within: { flag: 'enroute', minutes: 8 } },
      why: 'A call ahead with the tearing pain, the pressure in each arm and the 12-lead clears the CT scanner and brings the cardiac surgeon in before he arrives.',
    },
    { id: 'handoff', label: 'Hand-off', why: 'Report the onset, the pressure in each arm and the pulses, the 12-lead, what was given — and what was held (aspirin, nitroglycerin) — and how he changed.', done: ['handoff'], points: 5 },
  ],
  harms: yieldToHeavier([
    {
      // the same id as the built-in rule, in this case's words and weight: the aspirin is this case's main trap
      id: 'antithrombotic-dissection', actions: ['aspirin'], points: 10, severity: 'major',
      text: 'Aspirin for sudden tearing pain that goes through to the back. That pain is a torn aorta until a scan says otherwise: aspirin makes the tear bleed and adds to the bleeding in the emergency surgery he needs. With a high suspicion of dissection, hold aspirin (and every antithrombotic) and tell medical control why; aspirin is for chest pain you suspect is coronary.',
    },
    {
      id: 'nitro-dissection', actions: ['nitro', 'nitro-assist'], when: (s) => s.pulse && (!rateControlled(s) || shock(s)), points: 5, severity: 'major',
      // it stands in for the low-pressure rule: one mistake, one penalty
      replaces: NITRATE_RULES,
      text: 'Nitroglycerin on its own for this pain. A vasodilator with nothing slowing the heart makes it race (reflex tachycardia) and pump harder against the tear — the 2022 ACC/AHA aortic guideline starts a vasodilator only after a beta-blocker (or diltiazem), never first — and in shock it takes away the pressure he has left. It does not ease a tearing pain: an opioid is the pain relief here. For an EMT, report the findings instead of helping with his own nitroglycerin.',
    },
    // after the beta-blocker the guideline's vasodilator is an IV infusion in the hospital; medical control said no to this one
    nitrateCaseRule({
      id: 'nitro-against-order', actions: ['nitro'], when: (s) => s.pulse && rateControlled(s) && !shock(s) && has(s, 'nitro-held'), points: 2, severity: 'minor',
      text: 'Nitroglycerin after medical control said no. Once the beta-blocker is in, the vasodilator the 2022 ACC/AHA guideline adds is an IV infusion titrated in the hospital (nicardipine, clevidipine or nitroprusside); a sublingual dose drops the pressure by an amount nobody controls, and it does not ease this pain. Follow the order, and let fentanyl treat the pain.',
    }, 'nitro-high-not-hypertensive'),
    {
      id: 'nitro-high-dissection', actions: ['nitro-high'], when: (s) => s.pulse && (!rateControlled(s) || shock(s) || s.vitals.sbp < 160 || has(s, 'nitro-held')), points: 5, severity: 'major',
      replaces: NITRATE_RULES,
      text: 'High-dose nitroglycerin for this patient. 0.8 mg is the dose for hypertensive pulmonary edema. With nothing slowing his heart it makes the heart race and pump harder against the tear (2022 ACC/AHA: a vasodilator only after a beta-blocker); even after one, a sublingual bolus this size drops the pressure by an amount nobody can titrate, and medical control did not order it. His pain needs an opioid.',
    },
    {
      id: 'stemi-alert-dissection', actions: ['stemi-alert'], points: 5, severity: 'major', replaces: ['stemi-alert-no-ste', 'cath-lab-dissection'],
      text: 'A STEMI alert for a 12-lead that does not meet STEMI criteria. His shows the LVH of years of high blood pressure, and the alert sends him toward a cath lab and its heparin and antiplatelets — the worst place for a torn aorta. Transmit the 12-lead and report the tearing pain and the arm pressures.',
    },
    {
      // in the tamponade a bolus is right, even once the first one has brought the systolic back over 90
      id: 'fluid-hypertensive', actions: ['fluid'], when: (s) => s.pulse && !shock(s), points: 5, severity: 'major',
      text: 'A fluid bolus for a patient who is not in shock. He came hypertensive: more volume raises the pressure and the force on the torn wall. Fluid is for the shock of tamponade or rupture, in small boluses.',
    },
    // a drug contraindication of the case's own: push-dose epinephrine and the infusion each charge it (rules/charge.ts perDrug)
    {
      id: 'pressor-hypertensive', actions: ['push-epi', 'pressor'], when: (s) => s.pulse && !low(s), replaces: ['pressor-no-hypotension'], points: 5, severity: 'major', perDrug: true,
      text: 'A vasopressor or push-dose epinephrine without a low blood pressure. It drives the pressure and the heart harder against the tear: the goal is a lower rate and pressure, not a higher one.',
    },
    {
      id: 'legs-up-hypertensive', actions: ['legs-up'], when: (s) => s.pulse && !shock(s), points: 2, severity: 'minor',
      text: 'Raising the legs of a patient who is not in shock. It returns more blood to a heart that is already pushing too hard against the tear: let him rest in the position of comfort.',
    },
    {
      id: 'rate-drug-low', actions: ['metoprolol', 'diltiazem'], when: (s) => s.pulse && (shock(s) || s.vitals.sbp < 100 || s.rhythm.hr < 60), replaces: RATE_RULES, points: 8, severity: 'major',
      text: 'A beta-blocker or diltiazem in shock, or with a systolic under 100 or a rate under 60. With a torn aorta a falling pressure means tamponade, rupture or a leaking aortic valve: slowing the heart takes away the rate that is holding up his output.',
    },
    {
      // metoprolol and diltiazem are offered once each: one already on board means this is the second AV-nodal blocker
      id: 'rate-drug-double', actions: ['metoprolol', 'diltiazem'], when: (s) => s.pulse && !shock(s) && s.vitals.sbp >= 100 && s.rhythm.hr >= 60 && rateControlled(s), replaces: RATE_RULES, points: 5, severity: 'major',
      text: 'IV diltiazem and an IV beta-blocker together. Two AV-nodal blockers on top of each other can bring profound bradycardia, heart block and a falling pressure. The guideline gives one: a beta-blocker, or diltiazem only for a patient who cannot take one.',
    },
    {
      // the rate drug is right once the tear is suspected (2022 ACC/AHA), but in the field it is protocol or medical control's call
      id: 'rate-drug-no-order', actions: ['metoprolol'], when: (s) => s.pulse && !has(s, 'rate-order') && !shock(s) && s.vitals.sbp >= 100 && s.rhythm.hr >= 60 && !rateControlled(s), points: 2, severity: 'minor',
      text: 'A beta-blocker without an order. Slowing the heart and lowering the pressure is the treatment for a torn aorta (2022 ACC/AHA: a beta-blocker first), but in the field — with no scan yet, and a leaking valve or tamponade still possible — it is given per your protocol or on medical control\'s order: call first.',
    },
    {
      // medical control orders the beta-blocker, never diltiazem: it is the second choice, for a patient who cannot take one
      id: 'diltiazem-not-ordered', actions: ['diltiazem'], when: (s) => s.pulse && !shock(s) && s.vitals.sbp >= 100 && s.rhythm.hr >= 60 && !rateControlled(s), points: 2, severity: 'minor',
      text: 'Diltiazem without an order for it. The 2022 ACC/AHA guideline starts with an IV beta-blocker and keeps diltiazem for a patient who cannot take one; in the field either is given only per your protocol or on medical control\'s order — and the order here was for metoprolol.',
    },
    {
      id: 'rate-drug-unmonitored', actions: ['metoprolol', 'diltiazem'], when: (s) => s.pulse && !has(s, 'monitor'), points: 3, severity: 'minor',
      text: 'An IV rate-slowing drug without the cardiac monitor on. Metoprolol and diltiazem can bring bradycardia, heart block and a falling pressure within minutes: the monitor goes on (and stays on) before the first dose.',
    },
    {
      id: 'opioid-hypotension', actions: ['fentanyl'], when: (s) => s.pulse && shock(s), points: 3, severity: 'minor',
      text: 'Fentanyl in shock. An opioid lowers the pressure further in a patient whose pressure is failing (the tamponade, or a systolic under 90): support the pressure first, and go.',
    },
    {
      id: 'nearest-ed', actions: ['transport-near'], when: (s) => s.pulse, points: 8, severity: 'major',
      text: 'The nearest emergency department, with no cardiac surgeon. A tear in the ascending aorta needs emergency surgery; a stop where there is none adds a transfer of an hour or more, and the early death rate is about 1–2 % an hour. Go to the center with cardiac surgery, and call ahead.',
    },
    {
      // the delay itself: on scene so long that the tear spread, or bled around the heart (the later, the worse; one penalty)
      id: 'scene-delay', actions: ['transport-pci', 'transport-near'], when: (s) => s.pulse && has(s, 'extended') && !has(s, 'tamponade'), points: 8, severity: 'major',
      text: 'Still on scene when the tear spread. Sixteen minutes and more on scene with a suspected tear in the ascending aorta: while he waited, it ran on into his belly and his left leg. Nothing in the field repairs it — find it, treat the pain and go; the rest can be done on the way.',
    },
    {
      id: 'scene-delay-shock', actions: ['transport-pci', 'transport-near'], when: (s) => s.pulse && has(s, 'tamponade'), points: 15, severity: 'critical',
      text: 'Still on scene when he went into shock. More than 20 minutes on scene with a suspected tear in the ascending aorta: it bled into the sac around his heart while he waited. Nothing in the field relieves it — find it, treat the pain and go; the rest can be done on the way.',
    },
    {
      // the lungs are clear: a lighter mistake than CPAP on a low pressure, a heart that lives on its preload or a patient
      // about to vomit — there (cpapHarmful) the built-in rules speak, at their own weight
      id: 'cpap-no-distress', actions: ['cpap'], when: (s, sc) => s.pulse && !cpapHarmful(s, sc), replaces: ['cpap-no-indication', 'cpap-drowsy'], points: 3, severity: 'minor',
      text: 'CPAP with clear lungs. It is for respiratory distress from fluid on the lungs; his lungs are clear, and positive pressure cuts the blood returning to the heart — dangerous if the tear bleeds into the pericardium.',
    },
  ]),
  timings: [
    { label: 'Blood pressure in both arms', actions: ['bp-both-arms'], target: 10 },
    { label: 'First 12-lead', actions: ['ecg12'], target: 10 },
    // the EMT's intercept gives it: the flag counts theirs
    { label: 'Pain relief', actions: ['fentanyl'], flag: 'analgesia', target: 15 },
    { label: 'Left the scene', actions: ['transport-pci', 'transport-near'], target: 15 },
    { label: 'Hospital notified', actions: ['notify'] },
  ],
  transportMinutes: 16,
  nearestMinutes: 7,
  arrival: 'You arrive; the emergency team meets you at the door.',
  teaching: [
    'Think of the aorta in every chest pain: sudden, severe pain that is at its worst from the first second, described as tearing or ripping, going through to the back or moving down it. Hypertension is the commonest risk factor; cocaine, Marfan and other connective-tissue disorders, a bicuspid aortic valve, a known aneurysm and recent heart surgery are the others.',
    'Take the pressure in both arms and feel both radial pulses, the groins and the feet (2022 ACC/AHA): a systolic difference of more than 20 mmHg, or a pulse that is weak, delayed or missing, backs up the suspicion — report it to medical control, because it changes the destination. Treat the higher arm\'s pressure; a monitor cuff on the low side reads falsely reassuring numbers.',
    'The 12-lead is often normal or shows only LVH from years of high blood pressure, and that does not rule out a dissection. A flap that blocks a coronary ostium (usually the right) can produce a real STEMI pattern: with tearing pain or an arm difference, report it before anyone gives antithrombotics or activates the cath lab.',
    'Suspect a dissection, and hold the aspirin, heparin and fibrinolytics: they make the tear bleed and complicate the surgery. Hold the nitroglycerin too: a vasodilator on its own makes the heart race (reflex tachycardia) and pump harder against the tear, and it does not ease this pain. Fluid, a vasopressor or raised legs only push a high pressure higher.',
    'Treat the pain with an IV opioid (fentanyl): pain drives the rate and the pressure (2022 ACC/AHA: pain control to help with hemodynamic management).',
    'Anti-impulse therapy (2022 ACC/AHA, COR 1): a heart rate of 60–80 and a systolic under 120 mmHg, or the lowest pressure that keeps the organs perfused — an IV beta-blocker first (esmolol, labetalol or metoprolol; diltiazem if a beta-blocker cannot be used), with the monitor on, and an IV vasodilator only after it, if the pressure is still high — never first. In the field, only per protocol or medical control: before a scan, a leaking aortic valve or tamponade can make a beta-blocker dangerous.',
    'A falling pressure is the danger sign: tamponade (distended neck veins, a fast thready pulse), rupture or severe aortic regurgitation. Stop rate drugs and opioids, give small fluid boluses to keep him talking (a systolic near 90, not a normal pressure), and go — the surgeon is the treatment. Every minute on scene is a minute for the tear to spread or bleed.',
    'A tear in the ascending aorta (type A) needs emergency surgery (COR 1); untreated, its early death rate is about 1–2 % an hour. Go straight to a center with cardiac surgery and call ahead with the tearing pain, the arm pressures and the 12-lead, so the CT scanner and the surgeon are ready. Never wait on scene for an ALS intercept: let it meet you on the way.',
    'CPAP is for wet lungs: his are clear, and positive pressure cuts the blood returning to a heart that may soon be squeezed by blood around it.',
  ],
};
