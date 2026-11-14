import type { Effect, Line, Scenario, SimState } from '../types';
import { PADS, atRate, bpAfter, has, interpret, line } from '../kit';
import { nitrateCheckRule } from '../rules/acs';
import { LIDOCAINE_RULES, RATE_RULES, yieldToHeavier } from '../rules/rhythm';

/**
 * Posterior STEMI in the field. A 61-year-old woman with diabetes and high blood pressure had to sit down halfway up the
 * stairs 45 minutes ago: a heavy pressure in the chest that goes through to her back, nausea and a sweat. The 12-lead shows
 * no ST elevation at all — only ST depression in V1–V3 with upright T waves and tall R waves, the mirror image of ST
 * elevation in the back wall of the left ventricle, which no standard lead faces (a circumflex occlusion, usually).
 * Posterior leads V7–V9 show the ST elevation itself.
 *
 * Right care (2025 ACC/AHA/ACEP/NAEMSP/SCAI ACS guideline; 2022 ACC chest pain pathway: posterior MI is a STEMI equivalent;
 * 2021 AHA/ACC chest pain guideline: V7–V9 when the first 12-lead is not diagnostic; Fourth Universal Definition of MI: 0.5 mm
 * or more in V7–V9): a 12-lead within 10 minutes, the posterior leads, a STEMI alert from the field and straight to the
 * PCI-capable heart center; aspirin; nitroglycerin for the pain once the pressure is known and no PDE-5 inhibitor is on
 * board (she takes none); pads on; a repeat 12-lead on the way. The EMT gives the aspirin, acquires and transmits the
 * 12-lead (the physician reads it and sends her to the heart center), calls the paramedic intercept, and transports where
 * the physician directs. The simulator lets only ALS record the posterior leads, so in the EMT's run the intercept does.
 *
 * The traps: reading the tracing as ischemia only and taking her to the nearest emergency department (it has no cath lab),
 * calling the alert without the posterior leads (the interventional cardiologist asks for them first), nitroglycerin before
 * the pressure and the PDE-5 question, and oxygen with a normal saturation. Lingering on scene costs: her pain and pressure
 * get worse at minute 15, and at minute 20 her heart fibrillates; left more than 4 minutes without compressions or a shock,
 * she comes back comatose.
 */

/** Minutes from the EMT's call until the paramedic intercept is at her side */
const ALS_MINUTES = 6;

/** Still on scene at these minutes: worse at the first, VF at the second */
const WORSE_AT = 15;
const VF_AT = 20;

const ROSC_VITALS = { sbp: 118, dbp: 72, spo2: 95, rr: 18, etco2: 36, gcs: 14, pain: 6 };

/**
 * Minutes of VF with neither compressions nor a shock after which the brain has been without blood flow too long to wake
 * at ROSC: survival falls by about 7–10 % for every minute of untreated VF, and those who come back after a long no-flow
 * time are usually comatose at first
 */
const NO_FLOW_COMA = 4;
const ROSC_COMA_VITALS = { sbp: 98, dbp: 60, spo2: 92, rr: 12, etco2: 38, gcs: 6, pain: 0 };

/**
 * Sublingual nitroglycerin eases ischemic pain, but it cannot open an occluded artery: some relief, never all of it (relief, or
 * none, neither proves nor rules out an MI)
 */
const NITRO_PAIN_FLOOR = 4;

/** The monitor or the pads are on, so a change of rhythm sounds an alarm */
const ecgOn = (s: SimState) => has(s, 'monitor') || has(s, 'pads');

/** Awake enough to talk: she answers for herself (otherwise her husband does) */
const talks = (s: SimState) => s.pulse && s.vitals.gcs >= 13;

/** Only a patient awake enough to talk says how she feels */
const awake = (s: SimState, text: string, tone?: Line[2]): Line[] => (talks(s) ? [line('patient', text, tone)] : []);

function status(s: SimState): string {
  if (!s.pulse) return 'Unresponsive, not breathing normally.';
  if (s.vitals.gcs <= 8) return 'Unresponsive: no response to her name, only a moan to pain. She breathes on her own; there is a carotid pulse.';
  if (has(s, 'rosc')) return 'Awake but drowsy: "What happened? My chest still hurts."';
  const p = s.vitals.pain;
  if (p >= 7) return `"It's still pressing — right through to my back. ${p} out of 10, and I feel sick."`;
  return `"A little easier — ${p} out of 10."`;
}

/**
 * A shock for the VF that came while the crew lingered (or that an unsynchronized shock caused). Witnessed, with the pads on
 * or the AED at hand: a shock within 2 minutes, or after a cycle of CPR, brings her back; a late shock with no CPR first does
 * not. The longer she went with neither compressions nor a shock, the less of her wakes up: after NO_FLOW_COMA minutes the
 * heart comes back but she stays comatose.
 */
function shock(s: SimState, how: Line, aed: boolean): Effect | null {
  if (s.pulse || s.rhythm.profile !== 'vf') return null;
  const from = s.timers.arrestAt ?? s.minute;
  // minutes are sums of tenths: rounded as the review rounds them, a shock at exactly 2:00 is on time (22.3 − 20.3 is 2.0000000000000018)
  const since = (m: number) => Math.round((m - from) * 10) / 10;
  const cpr = s.performed.some((p) => p.id === 'cpr' && p.minute >= from);
  if (since(s.minute) > 2 && !cpr) {
    // an AED says what to do next; a manual defibrillator shows the same rhythm on its screen
    return {
      say: [how, aed ? ['monitor', 'AED: "Start CPR."', 'bad'] : ['monitor', 'No change on the monitor.', 'bad'], ['you', 'No pulse: on the chest, compressions now.']],
      flags: ['pads', 'monitor', 'shocked'],
    };
  }
  // the first compressions or shock in this arrest (this one, if nothing came before it)
  const firstCare = s.performed.find((p) => ['cpr', 'defib', 'aed'].includes(p.id) && p.minute >= from)?.minute ?? s.minute;
  if (since(firstCare) > NO_FLOW_COMA) {
    return {
      say: [
        how,
        ['you', interpret(s) ? 'An organized rhythm on the monitor and a carotid pulse — ROSC.' : 'There is a carotid pulse — ROSC.', 'good'],
        ['you', 'She does not wake: no response to her name, only a moan to pain. She breathes on her own, 12 a minute.', 'warn'],
      ],
      rhythm: { profile: 'posterior-stemi', hr: 104 }, pulse: true, phase: 'rosc', vitals: ROSC_COMA_VITALS,
      flags: ['pads', 'monitor', 'shocked'],
    };
  }
  return {
    say: [
      how,
      ['you', interpret(s) ? 'An organized rhythm on the monitor and a carotid pulse — ROSC.' : 'She coughs and moves; there is a carotid pulse — ROSC.', 'good'],
      ['patient', 'Groans and opens her eyes: "What happened?"'],
    ],
    rhythm: { profile: 'posterior-stemi', hr: 104 }, pulse: true, phase: 'rosc', vitals: ROSC_VITALS,
    flags: ['pads', 'monitor', 'shocked'],
  };
}

/** Sublingual nitroglycerin (0.4 mg, or the 0.8 mg high dose, which the built-in rule scores): the pressure falls, the pain eases only so far */
function nitro(s: SimState, high: boolean): Effect | null {
  if (!s.pulse) return null;
  const was = s.vitals.pain;
  const pain = Math.min(was, Math.max(NITRO_PAIN_FLOOR, was - 2));
  const bp = high ? bpAfter(s, -20, -10) : bpAfter(s, -10, -6);
  const feels = pain < was ? (pain <= NITRO_PAIN_FLOOR ? '"The pressure is easing a little — but it\'s still there."' : '"Maybe a little better."') : '"It\'s still there — about the same."';
  return { say: [...(was > 0 ? awake(s, feels) : []), ['monitor', `BP ${bp.sbp}/${bp.dbp}.`]], vitals: { pain, ...bp }, flags: high ? ['nitro', 'nitro-high'] : ['nitro'] };
}

/** The physician reading the transmitted 12-lead for the EMT: no read is asked of the EMT, the physician gives the destination */
const EMT_READ =
  'ECG received. The physician: "No ST elevation, but ST depression in V1–V3 with tall R waves — that can be a STEMI in the back wall of the heart, which the standard 12 leads do not face. Take her straight to the heart center, not the community hospital. If your paramedic intercept reaches you, have them record the posterior leads, V7 to V9, and send them to me."';

/** The same transmission from the paramedic, before the posterior leads */
const MEDIC_READ =
  'ECG received. The physician: "ST depression in V1–V3 with tall R waves. That may be the back wall — record V7 to V9 and send them; ST elevation there and the cath lab is activated. Bring her to the heart center either way."';

export const posteriorStemiField: Scenario = {
  id: 'posterior-stemi-field',
  title: 'Halfway up the stairs',
  summary: '61-year-old woman with chest pressure, nausea and a sweat. Read the 12-lead for what it shows — and for what it cannot see — and pick the right hospital.',
  setting: 'field',
  roles: [1, 2],
  difficulty: 'intermediate',
  // the library's circumflex occlusion: it covers posterior extension and the V7–V9 criteria
  conditionId: 'lateral-stemi',
  briefing: {
    default: [
      ['dispatch', 'Priority 1: 61-year-old woman, chest pressure and nausea. You are the ALS crew.'],
      ['scene', 'A two-story house. She is sitting on the stairs, pale and sweating, a hand pressed to her chest, a laundry basket beside her. Her husband: "She got halfway up with the laundry and had to sit down — about 45 minutes ago. She said it was indigestion."'],
      ['partner', 'Your partner, an EMT, has the stretcher; you have the 12-lead monitor and the drug box.'],
      ['hospital', 'Regional heart center (PCI, cath lab around the clock): 16 minutes. Nearest emergency department (community hospital, no cath lab): 7 minutes.'],
    ],
    1: [
      ['dispatch', 'Priority 1: 61-year-old woman, chest pressure and nausea. You are the BLS crew; a paramedic unit can meet you as an intercept if you ask for one.'],
      ['scene', 'A two-story house. She is sitting on the stairs, pale and sweating, a hand pressed to her chest, a laundry basket beside her. Her husband: "She got halfway up with the laundry and had to sit down — about 45 minutes ago. She said it was indigestion."'],
      ['partner', 'Your partner, an EMT, has the stretcher; the 12-lead monitor (acquire and transmit) and the AED are in your bag.'],
      ['hospital', 'Regional heart center (PCI, cath lab around the clock): 16 minutes. Nearest emergency department (community hospital, no cath lab): 7 minutes.'],
    ],
  },
  initial: {
    rhythm: { profile: 'posterior-stemi', hr: 84 },
    vitals: { sbp: 142, dbp: 86, spo2: 96, rr: 18, etco2: 35, pain: 7, gcs: 15, glucose: 188, temp: 36.7 },
  },
  // what the built-in safety rules read (types.ts Problem)
  problems: ['acs'],
  facts: {
    // pressure that builds over minutes and goes through to the back: an MI can do that too, and it is not the tearing,
    // sudden pain of a dissection
    opqrst: (s) => (talks(s)
      ? `It came on about 45 minutes ago carrying the laundry up — a heavy pressure in the middle of my chest that goes straight through to my back, between my shoulder blades, and down my left arm. It built up over a few minutes; nothing ripping or tearing. ${s.vitals.pain} out of 10. I feel sick to my stomach. Sitting still hasn't helped.`
      : 'She cannot answer. Her husband: "A pressure in her chest and back for the last hour — she said it was indigestion."'),
    sample: (s) => (talks(s)
      ? 'No allergies. Metformin, lisinopril and atorvastatin. Type 2 diabetes, high blood pressure and high cholesterol; I quit smoking ten years ago. I\'ve never had heart trouble, and I don\'t have any nitroglycerin. No blood thinners. My mother had a heart attack at 64. Toast and coffee at breakfast.'
      : 'She cannot answer. Her husband: "Diabetes and high blood pressure — metformin, lisinopril and a cholesterol pill. No allergies."'),
    // women take sildenafil and tadalafil too (pulmonary hypertension): she takes neither
    pde5: (s) => (talks(s) ? '"No — I don\'t take any of those, for anything."' : 'Her husband: "No."'),
    lungs: (s) => (s.pulse ? 'Clear and equal on both sides.' : 'No breaths of her own.'),
    perfusion: (s) => (s.pulse
      ? 'Pale, cool and clammy. No JVD. Radial pulses present and equal on both sides; capillary refill 3 seconds.'
      : 'No pulses. Pale and gray.'),
    bpArms: (s) => `Right arm ${s.vitals.sbp}/${s.vitals.dbp} · left arm ${Math.max(50, s.vitals.sbp - 4)}/${Math.max(25, s.vitals.dbp - 2)}: the same within a few mmHg.`,
    // the explanation the feedback gives after the paramedic's read (the profile draws about 2 mm of ST depression in V1–V3,
    // deepest in V2, 1.5 mm in V4, and nothing over 0.5 mm in the limb leads or aVR)
    ecg12: (s) => (s.rhythm.profile === 'posterior-stemi'
      ? `Sinus ${s.rhythm.hr > 100 ? 'tachycardia' : 'rhythm'} ${s.rhythm.hr} with horizontal ST depression of about 2 mm in V1–V3 (deepest in V2, 1.5 mm in V4), upright T waves, and tall R waves in V1–V2 (R/S over 1 in V2): the mirror image, seen from the front, of ST elevation in the back wall. No ST elevation in any of the 12 leads and none in aVR — this is not the diffuse ST depression of subendocardial ischemia. A posterior STEMI (usually the circumflex) until proven otherwise: record V7–V9, where 0.5 mm of ST elevation or more confirms it.`
      : 'No 12-lead during CPR.'),
  },
  status,
  respond: {
    // the physician reads what was sent: the EMT does not interpret it, and the posterior leads decide the activation
    'ecg-transmit': (s) => {
      if (!has(s, 'ecg12')) return null;
      if (has(s, 'alert')) return { say: [['hospital', 'ECG received — the cath lab team has it and is getting ready for her.']], flags: ['transmitted', 'pci-advised'] };
      if (has(s, 'ecg-posterior')) {
        return {
          say: [['hospital', 'ECG and posterior leads received. The physician: "ST depression in V1–V3 and ST elevation in V7–V9 — a posterior STEMI. Cath lab activated: bring her straight to the heart center."']],
          flags: ['transmitted', 'pci-advised', 'alert'],
        };
      }
      return { say: [['hospital', s.role === 1 ? EMT_READ : MEDIC_READ]], flags: ['transmitted', 'pci-advised', 'alert-asked'] };
    },
    // the interventional cardiologist activates on ST elevation in V7–V9; ST depression in V1–V3 alone could be ischemia,
    // so without the posterior leads the call brings a request for them (and the lab follows them: the event below)
    'stemi-alert': (s) => {
      if (!s.pulse || !has(s, 'ecg12')) return null;
      if (has(s, 'alert')) return { say: [['hospital', 'The cath lab is already activated — the team will meet you at the door.']], flags: ['alert'] };
      if (has(s, 'ecg-posterior')) {
        return { say: [['hospital', 'The interventional cardiologist: "ST depression in V1–V3 and ST elevation in V7–V9 — a posterior STEMI. Cath lab activated; the team will meet you at the door."']], flags: ['alert'] };
      }
      return {
        say: [['hospital', 'The interventional cardiologist: "ST depression in V1–V3 with tall R waves and upright T waves — that looks like the back wall. Move V4–V6 around to her back and send me V7–V9: ST elevation there confirms it, and I bring the team in."', 'warn']],
        flags: ['alert-asked'],
      };
    },
    // medical control and the receiving hospital know only what has been recorded and sent: nothing about the tracing before
    // the 12-lead (the paramedic's read comes first), and for the EMT nothing before the transmission
    'med-control': (s) => {
      if (!s.pulse) return null;
      if (s.role === 1) {
        return has(s, 'transmitted')
          ? { say: [['hospital', 'Medical control: "I have her 12-lead: ST depression in V1–V3 — this can be a STEMI in the back wall. Take her straight to the heart center, not the community hospital. Aspirin 324 mg chewed if she has not had it, and let the paramedics record the posterior leads when they reach you."']], flags: ['med-control', 'pci-advised'] }
          : { say: [['hospital', 'Medical control: "Transmit the 12-lead so I can read it. Aspirin 324 mg chewed if she is not allergic, and get the paramedic intercept to meet you — do not wait on scene for it."']], flags: ['med-control'] };
      }
      if (!has(s, 'ecg12')) {
        return { say: [['hospital', 'Medical control: "Get a 12-lead on her — within 10 minutes of reaching her — and tell me what it shows, or transmit it. Aspirin 324 mg chewed if she is not allergic, and nitroglycerin while her pressure holds."']], flags: ['med-control'] };
      }
      return {
        say: [['hospital', has(s, 'ecg-posterior')
          ? 'Medical control: "ST elevation in V7–V9 is a STEMI — call the alert and take her to the heart center. Aspirin, and nitroglycerin while her pressure holds."'
          : 'Medical control: "Where is the ST depression? If it is deepest in V1–V3, record V7–V9: ST elevation of half a millimeter or more there is a STEMI — call the alert and take her to the heart center. Aspirin, and nitroglycerin while her pressure holds."']],
        flags: ['med-control'],
      };
    },
    notify: (s) => {
      const seen = s.role === 1 ? has(s, 'transmitted') : has(s, 'ecg12');
      return {
        say: [['hospital', has(s, 'alert')
          ? 'Copy: 61-year-old woman, posterior STEMI, the cath lab activated. We will meet you at the door.'
          : seen
            ? 'Copy: chest pressure with ST depression in V1–V3. Do you have posterior leads on her? We will be ready for you.'
            : 'Copy: 61-year-old woman, 45 minutes of chest pressure with nausea and a sweat. Send us her 12-lead as soon as you have it. We will be ready for you.']],
        flags: ['notified'],
      };
    },
    // she has no nausea medicine of her own; ondansetron settles it (her QT is normal)
    ondansetron: (s) => (s.pulse ? { say: [['you', 'Ondansetron 4 mg IV, slowly over 30 seconds.'], ...awake(s, '"The sick feeling is going away."')], flags: ['antiemetic'] } : null),
    nitro: (s) => nitro(s, false),
    'nitro-high': (s) => nitro(s, true),
    // an unsynchronized shock on a beating heart can land on the T wave
    defib: (s) => {
      if (s.pulse) {
        return {
          say: [['monitor', 'Unsynchronized shock delivered — she goes limp, and the monitor alarms!', 'bad']],
          rhythm: { profile: 'vf', hr: 0 }, pulse: false, phase: 'arrest', vitals: { gcs: 3, rr: 0 }, flags: ['pads', 'monitor', 'iatrogenic-vf'],
        };
      }
      return shock(s, line('monitor', 'Shock delivered: 200 J.'), false);
    },
    // with a pulse the AED is not applied (the default refuses it); in VF it shocks
    aed: (s) => shock(s, line('monitor', 'AED: "Shock advised." Shock delivered.'), true),
    handoff: (s) => {
      if (!has(s, 'arrived') || !s.pulse) return null;
      if (has(s, 'dest-near')) {
        return {
          say: [
            ['you', 'SBAR hand-off in the community emergency department.'],
            ['hospital', 'The emergency physician: "ST depression in V1–V3 — let\'s get V7 to V9… ST elevation. A posterior STEMI, and we have no cath lab here: she needs a transfer to the heart center. Even a fast transfer adds half an hour, and often more than an hour, before the artery is opened."', 'warn'],
          ],
          flags: ['handoff'],
        };
      }
      if (!has(s, 'alert')) {
        return {
          say: [
            ['you', 'SBAR hand-off in the emergency department: the onset, the 12-lead, what was given and when.'],
            ['hospital', 'The emergency physician records V7–V9 at once: ST elevation. "Posterior STEMI — call the cath lab." The team is paged now: minutes a field activation would have saved.', 'warn'],
          ],
          flags: ['handoff'],
        };
      }
      return {
        say: [
          ['you', 'SBAR hand-off at the cath lab door: the onset 45 minutes before you arrived, the 12-lead and V7–V9, aspirin and nitroglycerin and their times, her pressure.'],
          ['hospital', 'The interventional cardiologist: "Thanks — the circumflex, most likely. Straight to the lab."'],
        ],
        flags: ['handoff'],
      };
    },
  },
  events: [
    {
      // the EMT's intercept: ALS care, the paramedic's own read and the posterior leads; the aspirin, the 12-lead, its
      // transmission and the transport stay the EMT's to do. In a cardiac arrest the medics still come: the EMT keeps the
      // compressions and the AED (the items the EMT is scored on), the paramedic starts the line
      id: 'als-arrives',
      when: (s) => s.role === 1 && has(s, 'als') && !has(s, 'arrived') && s.minute >= s.flags.als + ALS_MINUTES,
      effect: (s) => {
        const where = has(s, 'enroute') ? 'The medic unit meets you on the way; the paramedic climbs in' : 'The paramedic arrives';
        if (!s.pulse) {
          return { say: [['team', `${where} and kneels beside her: "Keep compressing, and let your AED shock her when it advises — I'm getting an IV in."`, 'warn']], flags: ['als-here', 'iv'] };
        }
        const nitro = s.vitals.sbp >= 100;
        const bp = nitro ? bpAfter(s, -10, -6) : { sbp: s.vitals.sbp, dbp: s.vitals.dbp };
        const lines: Line[] = [
          ['team', nitro
            ? `${where}: pads on, an IV, and — her pressure is ${s.vitals.sbp}/${s.vitals.dbp} and she takes no erectile-dysfunction or pulmonary-hypertension drug — nitroglycerin 0.4 mg under her tongue. "Pressure now ${bp.sbp}/${bp.dbp}."`
            : `${where}: pads on and an IV. "Her pressure is ${s.vitals.sbp}/${s.vitals.dbp}: no nitroglycerin for now."`],
          ...(nitro ? awake(s, '"The pressure is easing a little."') : []),
        ];
        if (!has(s, 'aspirin')) lines.push(['team', '"Has she had aspirin? That one is yours — 324 mg, chewed."', 'warn']);
        if (!has(s, 'ecg12')) lines.push(['team', '"Get the 12-lead on her and send it — I want to see it."', 'warn']);
        return {
          say: lines,
          vitals: nitro ? { ...bp, pain: Math.max(0, s.vitals.pain - 2) } : {},
          flags: ['als-here', 'iv', 'pads', 'monitor', ...(nitro ? ['nitro'] : [])],
        };
      },
    },
    {
      // once the paramedic is there and the 12-lead is in, the posterior leads: V4–V6 move around to her back
      id: 'als-posterior',
      when: (s) => s.role === 1 && s.pulse && has(s, 'als-here') && has(s, 'ecg12') && !has(s, 'ecg-posterior'),
      effect: (s) => {
        const lines: Line[] = [
          ['team', 'The paramedic reads your 12-lead, then moves V4–V6 around to her back, below the left shoulder blade, and records V7–V9: "ST elevation in all three. This is a posterior STEMI — the back wall. I\'m calling the alert."'],
          // the heart center's team waits at its own door: on the way to the community hospital it waits for a transfer
          has(s, 'dest-near')
            ? ['hospital', 'The heart center activates its cath lab — and hears she is on her way to the community hospital: the team will wait for the transfer.', 'warn']
            : ['hospital', 'Cath lab activated — the team will meet you at the door.'],
        ];
        if (has(s, 'dest-near')) lines.push(['team', '"We\'re headed to the community hospital? It has no cath lab — she will need a transfer."', 'warn']);
        return { say: lines, flags: ['ecg-posterior', 'alert'] };
      },
    },
    {
      // the cardiologist (or the physician on the transmission) asked for V7–V9: they arrive, and the lab is activated
      id: 'posterior-confirms',
      when: (s) => s.pulse && has(s, 'alert-asked') && has(s, 'ecg-posterior') && !has(s, 'alert'),
      effect: () => ({
        say: [['hospital', 'The interventional cardiologist has the posterior leads: "ST elevation in V7–V9 — that confirms it. Cath lab activated; the team will meet you at the door."', 'good']],
        flags: ['alert'],
      }),
    },
    {
      // still on scene at minute 15: the infarct grows — more pain, a faster rate, a softer pressure
      id: 'worse',
      when: (s) => s.pulse && s.phase === 'initial' && !has(s, 'enroute') && s.minute >= WORSE_AT,
      effect: (s) => {
        const hr = Math.min(130, s.rhythm.hr + 12);
        const bp = bpAfter(s, -10, -6);
        return {
          say: [
            ['partner', `She is grayer and sweating more${has(s, 'antiemetic') ? '' : ', and she just vomited'}. We have been here 15 minutes — we need to be moving.`, 'warn'],
            ...awake(s, '"It\'s worse — it\'s going right through to my back."', 'bad'),
            ...(has(s, 'monitor') ? [line('monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`, 'warn')] : []),
          ],
          vitals: { ...bp, pain: Math.min(10, s.vitals.pain + 2) }, rhythm: atRate(s, hr), flags: ['worse'],
        };
      },
    },
    {
      // still on scene at minute 20: the ischemic heart fibrillates — pads on means a shock in seconds
      id: 'vf',
      when: (s) => s.pulse && s.phase === 'initial' && !has(s, 'enroute') && s.minute >= VF_AT,
      effect: (s) => ({
        say: [
          ['partner', 'She has gone limp — she is not responding, and she is gasping!', 'bad'],
          ...(ecgOn(s) ? [line('monitor', 'Monitor alarm!', 'bad')] : []),
          // the EMT's intercept is beside her: the compressions and the AED stay the EMT's
          ...(s.role === 1 && has(s, 'als-here') ? [line('team', 'The paramedic: "Start compressions — and analyze with your AED, now!"', 'warn')] : []),
        ],
        rhythm: { profile: 'vf', hr: 0 }, pulse: false, phase: 'arrest', vitals: { gcs: 3, rr: 0 }, flags: ['vf'],
      }),
    },
  ],
  critical: [
    // first in the list, so a hint in the arrest names them before anything else
    {
      id: 'vf-response', label: 'No pulse: CPR or a shock within 1 minute', points: 10, done: ['cpr', 'defib', 'aed'], after: 'arrest',
      target: { within: { flag: 'arrest', minutes: 1 } }, applies: (s) => has(s, 'arrest'),
      why: 'Every minute of untreated VF lowers survival by about 7–10 %: compressions at once, and the shock as soon as the defibrillator or the AED is ready.',
    },
    {
      id: 'shock', label: 'Defibrillate within 2 minutes', points: 15, done: ['defib', 'aed'], after: 'arrest',
      target: { within: { flag: 'arrest', minutes: 2 } }, applies: (s) => has(s, 'arrest'),
      why: 'Witnessed VF with the pads on (or the AED at hand) should be shocked within seconds: early defibrillation is the biggest single factor in survival.',
    },
    { id: 'vitals', label: 'Vital signs', points: 5, target: { by: 6 }, done: ['vitals', 'nibp', 'bp-both-arms'], why: 'A pressure and a pulse before aspirin, nitroglycerin or the choice of hospital: hers are 142/86 and 84.' },
    {
      id: 'ecg', label: '12-lead ECG within 10 minutes of first contact', points: 15, target: { by: 10 }, done: ['ecg12'],
      why: 'Every possible ACS needs a 12-lead within 10 minutes of first medical contact (2025 ACC/AHA ACS guideline): it finds a STEMI, or the clues to one, and decides the hospital. Read every lead — what is missing matters as much as what is there.',
    },
    {
      id: 'als', label: 'Request a paramedic intercept', roles: [1], points: 10, target: { by: 6 }, done: ['als'],
      why: 'A STEMI can turn into VF or shock at any moment, and nitroglycerin, an IV and the posterior leads need a paramedic. Call at once; the intercept meets you, and you never wait on scene for it.',
    },
    {
      id: 'history', label: 'The pain and the history (OPQRST and SAMPLE)', points: 5, target: { by: 10 },
      why: 'Chest pain or pressure is the main symptom in women as in men, but women (and people with diabetes) more often have nausea, a sweat, shortness of breath or pain in the back, jaw or arm with it, and many call it "indigestion" (2021 AHA/ACC chest pain guideline). Pressure that built over minutes is not the tearing, sudden pain of a dissection. The SAMPLE screens for allergies, blood thinners and nitrates.',
      done: (s) => (has(s, 'opqrst') && has(s, 'sample') ? Math.max(s.flags.opqrst, s.flags.sample) : null), uses: ['opqrst', 'sample'],
    },
    {
      id: 'aspirin', label: 'Aspirin 162–325 mg chewed', points: 10, target: { by: 15 }, done: ['aspirin'],
      why: 'Early aspirin lowers the death rate in STEMI. Give it to every suspected ACS unless the patient is truly allergic or bleeding: she is neither.',
    },
    {
      id: 'transmit', label: 'Transmit the 12-lead (you do not interpret it)', roles: [1], points: 10, target: { by: 15 }, done: ['ecg-transmit'],
      why: 'An EMT acquires and transmits; the physician reads it. Hers has no ST elevation — the physician sees the ST depression in V1–V3, suspects the back wall and sends her to the heart center.',
    },
    {
      id: 'posterior', label: 'Posterior leads V7–V9 for ST depression in V1–V3', roles: [2], points: 15, target: { by: 15 }, done: ['ecg-posterior'],
      why: 'No standard lead faces the back wall of the left ventricle: its STEMI shows up front only as ST depression in V1–V3, and the 2025 ACC/AHA ACS guideline says to record V7–V9 for exactly that. Move V4–V6 around to the back (V7 posterior axillary line, V8 below the tip of the shoulder blade, V9 beside the spine, level with V6): 0.5 mm of ST elevation or more confirms it (1 mm in men under 40).',
    },
    {
      id: 'alert', label: 'STEMI alert from the field', roles: [2], points: 15, target: { by: 15 },
      why: 'A posterior STEMI is a STEMI equivalent (2022 ACC chest pain pathway): it needs the cath lab as urgently as any other. Activated from the field, the team is waiting when she arrives.',
      done: (s) => s.flags.alert ?? null, uses: ['stemi-alert', 'ecg-transmit', 'ecg-posterior'],
    },
    { id: 'pads', label: 'Defibrillation pads on', roles: [2], points: 5, target: { by: 12 }, done: PADS, why: 'A STEMI carries a high early risk of VF: with the pads on, a shock takes seconds.' },
    { id: 'iv', label: 'IV access', roles: [2], points: 5, done: ['iv', 'io'], why: 'For analgesia, antiemetics and anything the trip brings — it can go in on the way.' },
    {
      id: 'nitro', label: 'Nitroglycerin 0.4 mg for the ongoing pain', roles: [2], points: 5, done: ['nitro'],
      why: 'Sublingual nitroglycerin eases ischemic pain: 0.4 mg every 5 minutes, up to 3, once the systolic is known to be 90 or more (per protocol often 100) and has not fallen 30 mmHg or more below her baseline, with no RV infarction and no PDE-5 inhibitor on board — she takes none. It eases the pain of an occluded artery only partly: relief, or none, neither proves nor rules out an MI.',
    },
    {
      id: 'pci', label: 'Straight to the PCI-capable heart center', points: 10, target: { by: 15 }, done: ['transport-pci'],
      why: 'Primary PCI within 90 minutes of first medical contact: a suspected STEMI goes straight to a PCI-capable center (2025 ACC/AHA ACS guideline), past the community hospital without a cath lab. Leave the scene within 15 minutes (the AHA Mission: Lifeline EMS measure) — the IV and the nitroglycerin can go in on the way. An EMT takes her where the physician who read the 12-lead directs.',
    },
    {
      id: 'repeat', label: 'Repeat the 12-lead', points: 5, done: ['ecg12-repeat'],
      why: 'Repeat it on the way and with any change in the pain or the rhythm: a STEMI evolves, and the cath lab team wants the latest tracing.',
    },
    { id: 'post-ecg', label: '12-lead after ROSC', points: 5, done: ['ecg12-repeat', 'ecg12'], after: 'rosc', applies: (s) => has(s, 'rosc'), why: 'The tracing after ROSC goes to the cath lab team with the rest: the occlusion that caused the VF is still there.' },
    // wherever she arrives: the destination is scored by 'pci' and the nearest-ED harm, so the label names no hospital
    { id: 'handoff', label: 'Hand-off on arrival (SBAR)', points: 5, done: ['handoff'], why: 'SBAR: when the pain began, the 12-lead and V7–V9, what was given and when, the pressure — at the heart center the team takes her straight to the lab.' },
  ],
  harms: yieldToHeavier([
    {
      id: 'nearest-ed', actions: ['transport-near'], roles: [2], points: 10, severity: 'major',
      text: 'Transport to the nearest emergency department, which has no cath lab. ST depression in V1–V3 with tall R waves and upright T waves is a STEMI in the back wall until the posterior leads say otherwise — not "just ischemia". A STEMI goes straight to a PCI-capable center (first medical contact to device within 90 minutes); a stop at a hospital without a cath lab adds a transfer.',
    },
    {
      id: 'nearest-ed-emt', actions: ['transport-near'], roles: [1], points: 10, severity: 'major',
      text: 'Transport to the nearest emergency department, which has no cath lab. Transmit the 12-lead and follow the physician who reads it: her ST depression in V1–V3 can be a STEMI in the back wall, and a STEMI goes straight to the PCI-capable heart center — a stop at a hospital without a cath lab adds a transfer.',
    },
    nitrateCheckRule({ id: 'nitro-no-bp', actions: ['nitro', 'nitro-high'], when: (s) => s.pulse && !has(s, 'bp'), points: 5, severity: 'major', text: 'Nitroglycerin without a blood pressure. Take it first: nitrates need a systolic of at least 90 mmHg (100 in many protocols), and are held for a fall of 30 mmHg or more below her baseline.' }),
    nitrateCheckRule({
      id: 'nitro-no-pde5', actions: ['nitro', 'nitro-high'], when: (s) => s.pulse && !has(s, 'pde5-asked'), points: 3, severity: 'minor',
      text: 'Nitroglycerin without asking about PDE-5 inhibitors. Ask women too: sildenafil and tadalafil are also prescribed for pulmonary hypertension. No nitrate within 12 h of avanafil, 24 h of sildenafil or vardenafil, or 48 h of tadalafil: together they can cause profound hypotension.',
    }),
    {
      id: 'oxygen-normoxic', actions: ['o2-nc', 'o2-nrb'], when: (s) => s.pulse && s.vitals.spo2 >= 90 && !has(s, 'rosc'), points: 3, severity: 'minor',
      text: 'Oxygen with an SpO₂ of 90 % or more. In ACS, oxygen is for an SpO₂ under 90 % (2025 ACC/AHA ACS guideline): hers is 96 %, and extra oxygen brings no benefit.',
    },
    // the 2025 guideline does not support routine IV beta-blockade before primary PCI (it allows it in a stable patient with
    // ongoing ischemia, in hospital): in the field it is off protocol and adds risk for no gain, so a minor penalty
    {
      id: 'beta-blocker', actions: ['metoprolol'], roles: [2], when: (s) => s.pulse, replaces: RATE_RULES, points: 3, severity: 'minor',
      text: 'IV metoprolol in the field. Routine IV beta-blockade before primary PCI is not supported (2025 ACC/AHA ACS guideline), and it is no part of US prehospital STEMI protocols: given early it can bring on bradycardia, hypotension and cardiogenic shock (COMMIT). The hospital starts an oral beta-blocker within 24 hours once heart failure, a low output and the risk of shock are excluded.',
    },
    {
      id: 'adrenergic-mi', actions: ['push-epi', 'pressor', 'epi-im'], when: (s) => s.pulse && s.vitals.sbp >= 90, points: 5, severity: 'major',
      text: 'Epinephrine or a vasopressor with a normal pressure in an acute MI. It drives up the rate, the pressure and the oxygen the starving muscle needs, and can set off arrhythmias: her pressure needs no support.',
    },
    {
      id: 'rate-drug-sinus', actions: ['adenosine6', 'adenosine12', 'diltiazem', 'amio-infusion', 'procainamide', 'lidocaine'], when: (s) => s.pulse, replaces: [...LIDOCAINE_RULES, ...RATE_RULES], points: 3, severity: 'minor',
      text: 'A drug for an arrhythmia with a regular sinus rate. Her rhythm needs no treatment: adenosine, diltiazem and the antiarrhythmics have nothing to treat and bring only their side effects — a pause, a falling pressure, slower conduction (prophylactic lidocaine in MI was abandoned decades ago). The treatment of her heart is opening the artery.',
    },
    {
      id: 'cpap-clear', actions: ['cpap'], when: (s) => s.pulse, points: 3, severity: 'minor',
      text: 'CPAP with clear lungs. It is for respiratory distress from fluid on the lungs; hers are clear, and the pressure in the chest lowers the blood returning to the heart.',
    },
  ]),
  timings: [
    { label: 'First 12-lead', actions: ['ecg12'], target: 10 },
    // the EMT's intercept records them: the flag counts theirs
    { label: 'Posterior leads (V7–V9)', actions: ['ecg-posterior'], flag: 'ecg-posterior', target: 15 },
    { label: 'Aspirin', actions: ['aspirin'], target: 15 },
    { label: 'Cath lab activated', actions: [], flag: 'alert', target: 15 },
    { label: 'Left the scene', actions: ['transport-pci', 'transport-near'], target: 15 },
    { label: 'First shock after VF began', actions: ['defib', 'aed'], target: 2, from: 'arrest' },
  ],
  transportMinutes: 16,
  nearestMinutes: 7,
  arrival: 'You arrive; the team meets you at the door.',
  teaching: [
    'A posterior STEMI is an occlusion of the circumflex (or of a dominant right coronary\'s posterolateral branches) that injures the back wall of the left ventricle — a wall no standard lead faces. The 12-lead shows no ST elevation, only its mirror image in V1–V3: horizontal ST depression with upright T waves and tall R waves (R/S over 1 in V2).',
    'ST depression deepest in V1–V3 (rather than in V4–V6, or diffuse with ST elevation in aVR) points to the back wall, not to subendocardial ischemia. It often comes with inferior or lateral ST elevation; alone, it is easily missed.',
    'Record posterior leads: move V4–V6 around to the back, level with V6 — V7 on the posterior axillary line, V8 below the tip of the shoulder blade, V9 beside the spine. Record them for ST depression in V1–V3, and with ongoing symptoms and a nondiagnostic 12-lead (2025 ACC/AHA ACS guideline). ST elevation of 0.5 mm or more (1 mm in men under 40) confirms it (Fourth Universal Definition of MI). They sit far from the heart, so the elevation is small: a classic mirror image in V1–V3 with ongoing symptoms still deserves a call to the cardiologist.',
    'A posterior STEMI is a STEMI equivalent (2022 ACC chest pain pathway): a STEMI alert from the field, straight to a PCI-capable center, first medical contact to device within 90 minutes (2025 ACC/AHA ACS guideline). The nearest hospital without a cath lab adds a transfer.',
    'Chest pain or pressure is the main symptom in women as in men; women, older adults and people with diabetes more often have nausea, a sweat, shortness of breath or pain in the back, jaw or arm with it, and many call it "indigestion" (2021 AHA/ACC chest pain guideline). Pressure that builds over minutes is not the tearing, sudden pain of a dissection — when in doubt, compare the pressure in both arms.',
    'Aspirin 162–325 mg chewed for every suspected ACS. Nitroglycerin 0.4 mg sublingual every 5 minutes, up to 3, for the pain — only with a systolic of 90 or more (100 in many protocols) and no fall of 30 mmHg or more below baseline, no RV infarction, and no PDE-5 inhibitor within 12 h (avanafil), 24 h (sildenafil, vardenafil) or 48 h (tadalafil). Ask women too: sildenafil and tadalafil also treat pulmonary hypertension. Relief with nitroglycerin neither proves nor rules out an MI. Oxygen only for an SpO₂ under 90 %.',
    'EMTs: acquire the 12-lead within 10 minutes and transmit it — the physician reads it and names the destination; give aspirin; call a paramedic intercept at once, and never wait on scene for it. Leave the scene within 15 minutes (the AHA Mission: Lifeline EMS measure): the intercept meets you on the way, and a repeat 12-lead goes with any change.',
  ],
};
