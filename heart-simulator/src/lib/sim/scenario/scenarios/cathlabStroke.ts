import type { Effect, Line, PendingRead, Scenario, SimState, Speaker } from '../types';
import { atRate, bpAfter, has } from '../kit';
import { INTERVENTION_BY_ID } from '../interventions';
import { MD, RN, TECH } from '../labKit';

/**
 * A stroke on the table. A diagnostic angiogram from the right radial: the left coronary is done, and a JR4 has just gone up
 * over a wire through the aortic arch for the right coronary when the patient's words come out slurred and jumbled and his
 * right hand goes limp — a left middle cerebral artery embolus, most likely debris the exchanges knocked off the arch. The
 * team has to see it for what it is (not the midazolam), stop safely, note the time, examine him, check the glucose, call
 * the stroke team and get him to CT and CT angiography — and leave his pressure alone. Thrombolysis is the stroke team's
 * decision, and the heparin he has had rules it out: the blocked artery goes to thrombectomy.
 *
 * The tech calls it out (with the time), shuts the injector and runs the ACT; the nurse calls it out, examines him, checks
 * the glucose, the airway and the pressure, and goes with him to CT; the cardiologist stops, examines, calls the stroke
 * team, finds out how much heparin is on board and sends him to CT, then hands him over for thrombectomy.
 */

/** The case clock starts at 10:42, when the deficit is seen; he was last seen normal at 10:40 */
const LAST_WELL = '10:40';
const clock = (minute: number) => {
  const t = 10 * 60 + 42 + Math.floor(minute + 1e-9);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

/** Minutes from the stroke alert to the stroke neurologist at the table (an in-house team) */
const TEAM_MINUTES = 4;
/**
 * His pressure runs about 170. A systolic under 140 (some 20 % below it) is too low for the brain tissue living on
 * collaterals beyond the blocked artery: the deficit grows, and the pressure has to come back up. At 140 or more there is
 * nothing for a vasopressor to correct
 */
const LOW_FOR_STROKE = 140;
/** GCS once the deficit has grown: E3 (opens his eyes to voice) V2 (sounds, no words) M5 (the left hand localizes) */
const WORSE_GCS = 10;

/** More catheter work in the arch, for the cardiologist: the next runs and catheters of a case that should have stopped */
const CARRY_ON = [
  'view-rao-caudal', 'view-rao-cranial', 'view-ap-cranial', 'view-lao-cranial', 'view-lao-caudal', 'view-rca-lao', 'view-rca-rao', 'view-rca-cranial',
  'angio', 'lv-gram', 'lvedp', 'final-angio', 'cath-tiger', 'cath-jl4', 'cath-jr4', 'cath-pigtail', 'guide-ebu', 'guide-jr4', 'guide-al1',
];
/** The cardiologist can also put a pump in the aorta: more large catheters in a diseased aorta, with no shock to support */
const MD_CARRY_ON = [...CARRY_ON, 'iabp', 'impella'];
/** What the tech sets up or opens for the next step of the case */
const TECH_CARRY_ON = CARRY_ON.filter((id) => id !== 'angio' && id !== 'lvedp');
/** Drugs that bring the pressure down (the radial cocktail is verapamil and nitroglycerin) */
const LOWERING = ['nitro', 'nitro-high', 'ic-nitro', 'radial-cocktail', 'metoprolol', 'diltiazem', 'ic-nitroprusside', 'ic-verapamil'];
/** What brings a pressure that has fallen too low back up */
const RAISE = ['fluid', 'phenylephrine', 'pressor', 'push-epi', 'legs-up'];
/** Vasopressors: for a pressure that has fallen, not for one that is already high */
const PRESSORS = ['pressor', 'push-epi', 'phenylephrine', 'ic-epinephrine'];

const deficit = (s: SimState) => has(s, 'deficit');
/** The deficit has grown: a second embolus from more catheter work, collaterals failing on a lower pressure, or time */
const worse = (s: SimState) => has(s, 'worse');
const ctStarted = (s: SimState) => (s.counts['ct-urgent'] ?? 0) > 0 || has(s, 'to-ct');
const nihss = (s: SimState) => (worse(s) ? 19 : 10);
/** The NIHSS as the team can give it: extra sedation clouds the exam it is scored from */
const nihssWords = (s: SimState) => (has(s, 'oversedated') ? 'NIHSS hard to score through the extra sedation' : `NIHSS ${nihss(s)}`);

/** 5,000 units 20-odd minutes ago in an 82 kg man; more heparin lengthens it, protamine shortens it */
const actValue = (s: SimState) => (has(s, 'protamine') ? 134 : has(s, 'more-heparin') ? 312 : 238);

/** Who speaks up beside the learner: the nurse, or (when the learner is the nurse) the tech */
const teammate = (s: SimState) => (s.role === 4 ? 'Tech' : 'Nurse');

const strokeRead: Omit<PendingRead, 'minute'> = {
  kind: 'clinical', answer: 'clin-stroke', prompt: 'What is happening?',
  explain: 'A stroke. A sudden one-sided deficit — slurred, jumbled speech, a right facial droop and a limp right hand — during catheter work in the aortic arch is a stroke until proven otherwise: most often debris knocked off the arch, or clot from a catheter. Sedation never causes a one-sided weakness or a facial droop, and the radial sheath in his right wrist cannot explain a drooping face and broken speech. Note when he was last seen normal, stop safely, examine him, check the glucose, call the stroke team and get him to CT and CT angiography — and leave his pressure alone.',
};

/** The exam: a quick check from the tech, the NIH stroke scale from the nurse and the cardiologist */
function exam(s: SimState): string {
  const gcs = s.vitals.gcs;
  if (has(s, 'oversedated')) return `GCS ${gcs}: drowsy from the sedation — he rouses to his name, then drifts off. He cannot follow the commands the exam needs: whether the deficit is changing can no longer be told.`;
  // aphasic and drowsy: no words (V2), no commands followed (M5 at best)
  if (worse(s)) return `GCS ${gcs} (E3 V2 M5): drowsy, opens his eyes to voice; only groans, no words, and he follows no commands — his left hand reaches for a pinch. His eyes are turned to the left; the right face, arm and leg barely move. NIHSS ${nihss(s)}.`;
  if (s.role === 3) return 'Quick check (BE-FAST): the right side of his face droops, the right arm drifts down to the board, and the words come out slurred and wrong. He follows you with both eyes.';
  return `GCS ${gcs} (E4 V4 M6); pupils equal and reactive. NIHSS ${nihss(s)}: alert; gets his age but not the month; follows commands; full eye movements and visual fields; the right lower face droops; the right arm drifts down to the bed within 10 seconds, the right leg drifts but stays up; less feeling on the right; only fragments of words come out, and those are slurred. Last known well ${LAST_WELL}.`;
}

/** What the stroke neurologist says about the heparin (and any lytic) on arrival */
function anticoagWords(s: SimState): string {
  if (has(s, 'lytic')) return 'Tenecteplase — on top of the heparin, before a scan? That is a serious bleeding risk: nothing more of that.';
  if (has(s, 'act')) return `An ACT of ${actValue(s)} after 5,000 units of heparin: his clotting time is far too long for IV thrombolysis.`;
  return '5,000 units of heparin at 10:20? Then his clotting time is long, and IV thrombolysis is very likely out — I want an ACT.';
}

/** The stroke neurologist's plan once the CT angiogram is read */
function decision(s: SimState): string {
  const lysis = has(s, 'lytic')
    ? 'He has already had tenecteplase on top of the heparin: we watch him closely for a bleed.'
    : `No IV thrombolysis: 5,000 units of heparin at 10:20${has(s, 'act') ? ` and an ACT of ${actValue(s)}` : ''} — with his clotting time that long, the bleeding risk rules it out.`;
  // the pressure the plan asks for: leave a good one alone; one that has been pushed low comes back up first
  const bp = s.vitals.sbp < LOW_FOR_STROKE
    ? `His pressure is too low for the brain around the clot: bring it back up to where it was, and keep it no higher than 185/110.`
    : 'Leave his pressure where it is — no higher than 185/110, and nothing to bring it down.';
  return `"A large vessel occlusion, last known well ${LAST_WELL}, ${nihssWords(s)}. ${lysis} He goes straight to thrombectomy: neurointervention has the angio suite open. ${bp}"`;
}

function ctResult(s: SimState): string {
  return worse(s)
    ? 'Radiology: head CT — no bleeding; early ischemic change in the left insula, lentiform nucleus and frontal operculum (ASPECTS 7). CT angiography: the left middle cerebral artery is cut off in its M1 segment, with poor collaterals beyond it.'
    : 'Radiology: head CT — no bleeding; subtle early ischemic change in the left insula only (ASPECTS 9). CT angiography: the left middle cerebral artery is cut off in its M1 segment, with good collaterals beyond it.';
}

const sheath = (s: SimState) => (has(s, 'hemostasis') ? 'the radial sheath already out, a band on the wrist' : 'the radial sheath left in, flushed and secured');

/**
 * The stroke alert, from the learner or a teammate. Called out loud in the room, it tells the operator too ('aware'). Once the
 * scan is back the neurologist comes straight to it and decides
 */
function strokeAlert(s: SimState, who: Speaker, text: string): Effect {
  if (has(s, 'ct')) {
    return {
      say: [[who, text], ['team', `Stroke neurologist, there within minutes, the scan already on the screen: ${decision(s)}`]],
      flags: ['stroke-alert', 'time-noted', 'aware', 'team-here', 'thrombectomy'],
    };
  }
  return {
    say: [[who, text], ['hospital', 'Stroke alert received: the stroke neurologist is on the way, and CT is clearing the scanner for him.']],
    flags: ['stroke-alert', 'time-noted', 'aware'],
  };
}
const ALERT_CALL = `Stroke alert: 69-year-old man on the table in the cath lab — slurred, jumbled speech and right-sided weakness since 10:42, last known well ${LAST_WELL}.`;

/**
 * The tech's and the nurse's call-out: said out loud to the operator, with the time — or the stroke alert called in the room,
 * which says the same and stops him too. Only one made before a teammate had to speak up counts
 */
const SPEAK_UP = ['callout', 'stroke-team'];
/** The first time the learner did one of these after the deficit, if it came before a teammate had to do it (the fallback's flag) */
const beforeTeam = (ids: string[], teamFlag: string) => (s: SimState) =>
  s.performed.find((p) => ids.includes(p.id) && p.minute >= (s.flags.deficit ?? Infinity) && p.minute < (s.flags[teamFlag] ?? Infinity))?.minute ?? null;
const spokeUp = (s: SimState) => s.performed.find((p) => SPEAK_UP.includes(p.id) && p.minute < (s.flags['team-noticed'] ?? Infinity))?.minute ?? null;

/**
 * A drug that brings the pressure down. The tissue around the blocked artery lives on collaterals that need the pressure:
 * under 140 the deficit grows and the pressure has to come back up (the 'pressure-falls' and 'worse' events)
 */
function lowers(s: SimState, given: string, dSbp: number, dDbp: number, flags: string[], hr?: number): Effect {
  const bp = bpAfter(s, dSbp, dDbp);
  return {
    say: [['you', given], ['monitor', `${hr ? `Heart rate ${hr}. ` : ''}BP ${bp.sbp}/${bp.dbp}.`, 'bad']],
    vitals: bp, ...(hr ? { rhythm: atRate(s, hr) } : {}),
    // 'bp-drug': a lowering drug has been given (a second one is a mistake of its own)
    flags: [...flags, 'bp-lowered', 'bp-drug'],
  };
}

/** An intracoronary drug once the catheter is out of the body has nowhere to go */
const catheterOut: Effect = { blocked: true, say: [['system', 'The catheter is out: there is no coronary to inject.']] };

/** More sedation: the exam the stroke team needs is lost, and the breathing and the pressure fall */
function sedate(s: SimState, given: string, dGcs: number, flags: string[]): Effect {
  const v = s.vitals;
  const bp = bpAfter(s, -8, -5);
  return {
    say: [
      ['you', given],
      ['team', 'His eyes close; he rouses only to his name now — his speech and his right side can no longer be examined.', 'bad'],
      ['monitor', `BP ${bp.sbp}/${bp.dbp}. RR ${Math.min(v.rr, Math.max(10, v.rr - 3))}.`],
    ],
    vitals: { ...bp, gcs: Math.max(9, v.gcs - dGcs), rr: Math.min(v.rr, Math.max(10, v.rr - 3)), spo2: Math.max(90, v.spo2 - 2) },
    flags: [...flags, 'oversedated', 'bp-lowered'],
  };
}

/**
 * The next step of the case after the deficit. The cardiologist who goes on puts more catheter work in the arch (and can
 * knock off more debris); once the catheter is out there is nothing left to film. The tech who sets it up hands the
 * operator the means to carry on — or, once the operator has stopped, is told to put it away.
 */
function carryOn(s: SimState, id: string): Effect | null {
  if (!deficit(s) || !s.pulse) return null;
  const label = INTERVENTION_BY_ID[id].label.split(' — ')[0];
  if (s.role === 5) {
    if (has(s, 'stopped')) return { blocked: true, say: [['system', 'The catheter is out and the case is over: nothing more goes into his aorta today, and the coronary pictures can wait.']] };
    return { say: [['you', `${label}: more catheter work in the arch while his deficit goes on.`]], ...(CARRY_ON.includes(id) ? { image: { id, view: label } } : {}), flags: ['more-arch'] };
  }
  // no catheter is in his left ventricle: there is no LV pressure for the tech to record
  if (s.role === 3 && id === 'lvedp') return { blocked: true, say: [['system', 'There is no catheter in his left ventricle: the JR4 lies in the aorta, so there is no LV pressure to record.']] };
  // the tech's pump consoles are no next step of a diagnostic case: the default answers them
  if (s.role !== 3 || !TECH_CARRY_ON.includes(id)) return null;
  if (has(s, 'stopped')) return { say: [['you', `${label}: set up.`], ['operator', 'Put that away — we are finished here. He is going to CT.', 'warn']] };
  return { say: [['you', `${label}: set up.`], ['operator', 'Thanks — going on with it.']], flags: ['more-arch'] };
}

export const cathlabStroke: Scenario = {
  id: 'periprocedural-stroke-cathlab',
  title: 'Diagnostic cath: his words come out wrong',
  summary: '69-year-old man, diagnostic angiography from the right radial. During a catheter exchange in the aortic arch his speech slurs and his right hand goes limp. See it for what it is, stop safely, and get him to the treatment that works.',
  setting: 'cathlab',
  roles: [3, 4, 5],
  difficulty: 'intermediate',
  briefing: {
    default: [
      ['team', 'Diagnostic coronary angiography from the right radial: 69-year-old man with exertional chest tightness and an abnormal stress test; high blood pressure, high cholesterol, quit smoking ten years ago; 82 kg. Aspirin 81 mg this morning; no blood thinners. Midazolam 1 mg and fentanyl 25 mcg at 10:15; heparin 5,000 units and the radial cocktail through the sheath at 10:20.'],
      ['team', 'The Tiger would not seat in the left coronary, so it came out over a wire for a JL4: the left system is done — moderate disease, nothing critical. Now the JL4 has come out, and a JR4 is going up over the wire through the arch for the right coronary.'],
      ['scene', `He has been chatting with the nurse all along; at ${LAST_WELL} he told her he was "doing fine".`],
    ],
    3: [
      ['team', 'Diagnostic coronary angiography from the right radial: 69-year-old man with exertional chest tightness and an abnormal stress test; high blood pressure, high cholesterol, quit smoking ten years ago; 82 kg. Aspirin 81 mg this morning; no blood thinners. Midazolam 1 mg and fentanyl 25 mcg at 10:15; heparin 5,000 units and the radial cocktail through the sheath at 10:20.'],
      ['team', 'The Tiger would not seat in the left coronary, so it came out over a wire for a JL4: the left system is done — moderate disease, nothing critical. Now the JL4 has come out, and a JR4 is going up over the wire through the arch for the right coronary.'],
      ['scene', `He has been chatting with the nurse all along; at ${LAST_WELL} he told her he was "doing fine".`],
      ['team', 'You are the scrub tech: the manifold and the injector, the catheters and wires the cardiologist asks for, the ACT — and calling out anything you see. The nurse is at his side.'],
    ],
    4: [
      ['team', 'Diagnostic coronary angiography from the right radial: 69-year-old man with exertional chest tightness and an abnormal stress test; high blood pressure, high cholesterol, quit smoking ten years ago; 82 kg. Aspirin 81 mg this morning; no blood thinners. Midazolam 1 mg and fentanyl 25 mcg at 10:15; heparin 5,000 units and the radial cocktail through the sheath at 10:20.'],
      ['team', 'The Tiger would not seat in the left coronary, so it came out over a wire for a JL4: the left system is done — moderate disease, nothing critical. Now the JL4 has come out, and a JR4 is going up over the wire through the arch for the right coronary.'],
      ['scene', `He has been chatting with you all along; at ${LAST_WELL} he told you he was "doing fine".`],
      ['team', 'You are the procedural nurse: his sedation, rhythm, pressure, airway and comfort. The tech is scrubbed at the table.'],
    ],
    5: [
      ['team', 'Diagnostic coronary angiography from the right radial: 69-year-old man with exertional chest tightness and an abnormal stress test; high blood pressure, high cholesterol, quit smoking ten years ago; 82 kg. Aspirin 81 mg this morning; no blood thinners. Midazolam 1 mg and fentanyl 25 mcg at 10:15; heparin 5,000 units and the radial cocktail through the sheath at 10:20.'],
      ['team', 'The Tiger would not seat in the left coronary, so you brought it out over a wire for a JL4: the left system is done — moderate disease, nothing critical. Now the JL4 is out, and your JR4 is going up over the wire through the arch for the right coronary.'],
      ['scene', `He has been chatting with the nurse all along; at ${LAST_WELL} he told her he was "doing fine".`],
      ['team', 'You are the interventional cardiologist: every choice is yours. The tech and the nurse are with you.'],
    ],
  },
  initial: {
    rhythm: { profile: 'normal-sinus', hr: 84 },
    vitals: { sbp: 174, dbp: 92, spo2: 96, rr: 18, etco2: 36, pain: 0, gcs: 14, glucose: 126, temp: 36.6 },
  },
  facts: {
    // he cannot get the words out: the answers come from his chart and his nods
    opqrst: 'He shakes his head at "Any pain? A headache?" and points at his mouth.',
    sample: 'He cannot get the words out; from the chart: high blood pressure, high cholesterol, quit smoking ten years ago; aspirin 81 mg, atorvastatin, lisinopril and amlodipine; no blood thinners; no allergies; no stroke before.',
    lungs: 'Clear and equal on both sides.',
    perfusion: 'Warm and dry; the right hand pink below the sheath, a strong pulse at the left wrist.',
    // the right arm carries the radial sheath: no cuff goes on it
    bpArms: (s) => `Left arm ${s.vitals.sbp}/${s.vitals.dbp}. The right arm carries the radial sheath, so no cuff goes on it.`,
    labs: 'Stroke labs sent: CBC, PT/INR, aPTT, chemistry and a type and screen — the aPTT will be long after 5,000 units of heparin. This morning: hemoglobin 14.2, platelets 231, INR 1.0, creatinine 1.0.',
    echo: 'Bedside echo: normal LV size and function, EF about 60 %; no LV thrombus and no wall-motion abnormality; the aortic root is not dilated; no pericardial effusion.',
    ct: ctResult,
  },
  status: (s) => {
    if (!s.pulse) return 'Unresponsive.';
    if (has(s, 'oversedated')) return 'Eyes closed; he rouses to his name, mumbles, and drifts off again.';
    if (worse(s)) return 'He no longer speaks — only a groan; his eyes are turned to the left, and his right arm and leg lie still.';
    return '"I… can\'t… the word…" — he points at his mouth with his left hand; the right hand lies limp.';
  },
  respond: {
    // the tech and the nurse: say it out loud, with the time, and stop the operator who is about to go on
    callout: (s) => {
      if (!deficit(s) || has(s, 'aware')) return null;
      return {
        say: [
          ['you', `Doctor — stop! His speech is slurred and jumbled and his right side is weak — that is new, and sedation doesn't do that. He was talking normally at ${LAST_WELL}; it is ${clock(s.minute)} now.`],
          ['operator', 'You\'re right. Stopping.'],
        ],
        flags: ['callout', 'aware', 'called-out', 'time-noted'],
      };
    },
    'stop-contrast': (s) => {
      if (!deficit(s)) return null;
      if (s.role === 5) {
        return {
          say: [['you', 'Stop — no more injections and no more catheter work in the arch. The JR4 comes back over a J-wire and out; the sheath stays in, flushed and secured.'], ['team', 'Tech: "Injector off, manifold closed."']],
          // the JR4 is out of his body: nothing is left to aspirate through or inject down
          flags: ['contrast-stopped', 'stopped'], clear: ['catheter'],
        };
      }
      // a teammate (or the operator) has already shut it: there is nothing left to switch off
      if (has(s, 'contrast-stopped')) return { blocked: true, say: [['system', 'The injector is already off and the manifold closed.']] };
      if (!has(s, 'stopped')) return { say: [['you', 'Injector disarmed and the manifold closed.'], ['operator', 'What are you doing? I still have the right coronary to do.', 'warn']], flags: ['contrast-stopped'] };
      return {
        say: [['you', s.role === 3
          ? 'Injector disarmed and the manifold closed; J-wire handed up — the catheter comes out of the arch, and the sheath is flushed and secured.'
          : 'Injector off — nothing more goes in.']],
        flags: ['contrast-stopped'],
      };
    },
    neuro: (s) => (deficit(s) && s.pulse ? { say: [['you', exam(s)]], flags: ['neuro-done'] } : null),
    glucose: (s) => (deficit(s) ? { say: [['you', `Blood glucose ${s.vitals.glucose} mg/dL: not low.`]], flags: ['glucose-done'] } : null),
    // the nurse's airway and breathing check: protect the airway, oxygen only below 94 %, nothing by mouth
    primary: (s) => {
      if (!deficit(s) || !s.pulse) return null;
      const v = s.vitals;
      const vit = `Breathing ${v.rr}, SpO₂ ${v.spo2} %; pulse ${s.rhythm.hr}; BP ${v.sbp}/${v.dbp}.`;
      return {
        say: [['you', v.gcs <= 12
          ? `Airway: drowsy, and snoring until his jaw is lifted — he needs watching; suction ready, onto his side if he vomits. ${vit} Nothing by mouth.`
          : `Airway open: he swallows his saliva and coughs on command. ${vit} No oxygen needed: it is for an SpO₂ of 94 % or less. Suction ready; nothing by mouth until a swallow screen.`]],
        flags: ['airway-checked'],
      };
    },
    // the arterial trace came through the catheter, which is coming out; a cuff on the other arm cycles for the trip to CT
    nibp: (s) => (deficit(s) && s.pulse ? { say: [['monitor', `NIBP ${s.vitals.sbp}/${s.vitals.dbp} mmHg: cuff on the left arm, cycling every 5 minutes for the trip to CT.`]], flags: ['bp', 'bp-checked'] } : null),
    'stroke-team': (s) => {
      if (!deficit(s)) return null;
      // one alert brings the team: a second call adds nothing, and is not counted as the learner's alert
      if (has(s, 'stroke-alert')) {
        return { blocked: true, say: [['system', `The stroke alert was called at ${clock(s.flags['stroke-alert'])}: ${has(s, 'team-here') ? 'the stroke neurologist is already here' : 'the stroke neurologist is on the way'}.`]] };
      }
      return strokeAlert(s, 'you', ALERT_CALL);
    },
    act: (s) => ({ say: [[s.role === 5 ? 'team' : 'you', `ACT ${actValue(s)} s, ${22 + Math.round(s.minute)} minutes after 5,000 units of heparin.`]], flags: ['act'] }),
    'ct-urgent': (s) => {
      if (!deficit(s) || !s.pulse) return null;
      if (!has(s, 'stopped')) {
        return { blocked: true, say: [['system', s.role === 5
          ? 'Not with a catheter in his aortic arch: stop, bring it out over a wire and secure the sheath first.'
          : 'The operator is still working at the table: call out what you see first.']] };
      }
      // the stroke alert is the order: it brings the stroke team and clears the scanner
      if (s.role === 4 && !has(s, 'stroke-alert')) return { blocked: true, say: [['system', 'The scan comes with the stroke alert: call it first — it brings the stroke team and clears the scanner.']] };
      const alert = has(s, 'stroke-alert');
      const meet: Line[] = alert && !has(s, 'team-here') ? [['team', `Stroke neurologist, meeting you at the scanner: "${nihssWords(s)}; last known well ${LAST_WELL}, so we are well inside every window."`]] : [];
      const plan: Line = alert
        ? ['team', `Stroke neurologist: ${decision(s)}`]
        : ['hospital', 'Radiology: "That is a blocked middle cerebral artery — who is the stroke team on this? Call them now."', 'warn'];
      return {
        say: [['team', `To CT with the transport monitor, ${s.role === 4 ? 'you at his side' : 'the nurse and you'}; ${sheath(s)}.`], ...meet, ['hospital', ctResult(s)], plan],
        flags: ['ct', 'to-ct', 'lvo', ...(alert ? ['team-here', 'thrombectomy'] : [])],
      };
    },
    handoff: (s) => {
      // the nurse and the cardiologist hand him over once the scan is read and the plan made (the tech's part ends at the door)
      if (s.role !== 3 && deficit(s) && s.pulse && !(has(s, 'ct') && has(s, 'thrombectomy'))) {
        return { blocked: true, say: [['system', has(s, 'ct')
          ? 'Nobody has taken him on yet: the stroke team decides on thrombectomy — call the stroke alert, then hand him over to them.'
          : 'Not yet: he goes to CT and CT angiography first. Hand him over to the stroke and neurointerventional team once the scan is read and the plan is made.']] };
      }
      if (!(has(s, 'ct') && has(s, 'thrombectomy'))) return null;
      const v = s.vitals;
      return {
        say: [['you', `SBAR to the stroke and neurointerventional team: 69-year-old man, diagnostic cath from the right radial; slurred, jumbled speech and right-sided weakness at 10:42 during a catheter exchange in the arch, last known well ${LAST_WELL}; ${nihssWords(s)}; glucose ${v.glucose}; heparin 5,000 units at 10:20${has(s, 'act') ? `, ACT ${actValue(s)}` : ''}; midazolam 1 mg and fentanyl 25 mcg at 10:15; BP ${v.sbp}/${v.dbp}${has(s, 'bp-lowered') ? '' : ', not lowered'}; ${sheath(s)}; CT: no bleed, left M1 occlusion — straight to thrombectomy.`]],
        flags: ['handoff'],
      };
    },
    // the sheath is already in the right radial; a femoral closure device has nothing to close
    access: (s) => (deficit(s) ? { blocked: true, say: [['system', 'The 6 Fr sheath is already in his right radial artery.']] } : null),
    // a balloon needs a guide and a wire in a coronary, and the echo shows no effusion for a needle to drain
    'balloon-tamponade': (s) => (deficit(s) ? { blocked: true, say: [['system', 'There is no guide, wire or balloon in a coronary, and nothing is bleeding: there is nothing to inflate a balloon over.']] } : null),
    pericardiocentesis: (s) => (deficit(s) && s.role === 5 ? { blocked: true, say: [['system', 'The echo probe goes on first: no pericardial effusion, so there is nothing for a needle to drain.']] } : null),
    'closure-device': (s) => (has(s, 'femoral') ? null : { blocked: true, say: [['system', 'The only sheath is in his right radial artery: there is nothing for a femoral closure device to close.']] }),
    // cardiac surgery has nothing to offer a stroke: the surgeon sends the caller to the stroke alert
    'call-surgery': (s) => {
      if (!deficit(s)) return null;
      return { say: [['hospital', has(s, 'stroke-alert')
        ? 'Cardiac surgery: "A stroke on the table? Nothing for us to do — the stroke team you called has him."'
        : 'Cardiac surgery: "A new deficit on the table is not ours — call the stroke alert: the neurologist and neurointervention come through it."']], flags: ['surgery-called'] };
    },
    // interventional radiology sends the cardiologist back to the stroke alert: neurointervention comes through the stroke team
    'call-vascular': (s) => {
      if (!deficit(s)) return null;
      return { say: [['hospital', has(s, 'stroke-alert')
        ? 'Interventional radiology: "Neurointervention is already coming through the stroke alert."'
        : 'Interventional radiology: "A new deficit on the table? Call the stroke alert — the neurologist and neurointervention come through it."']], flags: ['vascular-called'] };
    },
    consent: (s) => (deficit(s) ? { say: [['patient', 'He tries to answer, but the words will not come: he cannot consent to anything new right now.']] } : null),
    // the JR4 sits free in the ascending aorta: there is nothing to disengage
    reposition: (s) => (deficit(s) && s.role === 5 ? { blocked: true, say: [['system', has(s, 'stopped') ? 'The catheter is already out.' : 'The JR4 is not in a coronary: it sits free in the ascending aorta.']] } : null),
    ...Object.fromEntries(MD_CARRY_ON.map((id) => [id, (s: SimState) => carryOn(s, id)])),

    // the traps: more sedation, lowering the pressure, a lytic, more antithrombotics, anything by mouth
    midazolam: (s) => (deficit(s) && s.pulse ? sedate(s, 'Midazolam 1 mg IV.', 2, ['benzodiazepine', 'sedation']) : null),
    fentanyl: (s) => (deficit(s) && s.pulse ? sedate(s, 'Fentanyl 25 mcg IV.', 1, ['analgesia']) : null),
    sedation: (s) => (deficit(s) && s.pulse ? sedate(s, 'More sedation: midazolam 1 mg and fentanyl 25 mcg IV.', 3, ['sedation']) : null),
    nitro: (s) => (deficit(s) && s.pulse ? lowers(s, 'Nitroglycerin 0.4 mg sublingual.', -18, -9, ['nitro']) : null),
    'nitro-high': (s) => (deficit(s) && s.pulse ? lowers(s, 'Nitroglycerin 0.8 mg sublingual.', -30, -14, ['nitro', 'nitro-high']) : null),
    'radial-cocktail': (s) => (deficit(s) && s.pulse ? lowers(s, 'Radial cocktail through the sheath: verapamil 2.5 mg and nitroglycerin 200 mcg.', -12, -6, ['cocktail']) : null),
    metoprolol: (s) => (deficit(s) && s.pulse ? lowers(s, 'Metoprolol 5 mg IV.', -12, -8, ['beta-blocker'], Math.max(60, s.rhythm.hr - 10)) : null),
    diltiazem: (s) => (deficit(s) && s.pulse ? lowers(s, 'Diltiazem 20 mg IV.', -16, -10, ['diltiazem']) : null),
    'ic-nitro': (s) => {
      if (!deficit(s) || !s.pulse) return null;
      return has(s, 'stopped') ? catheterOut : lowers(s, 'Nitroglycerin 200 mcg down the catheter.', -12, -6, ['ic-nitro']);
    },
    'ic-nitroprusside': (s) => {
      if (!deficit(s) || !s.pulse) return null;
      return has(s, 'stopped') ? catheterOut : lowers(s, 'Nitroprusside 100 mcg down the catheter.', -16, -10, ['ic-nitroprusside']);
    },
    'ic-verapamil': (s) => {
      if (!deficit(s) || !s.pulse) return null;
      return has(s, 'stopped') ? catheterOut : lowers(s, 'Verapamil 200 mcg down the catheter.', -10, -6, ['ic-verapamil']);
    },
    'ic-adenosine': (s) => (deficit(s) && has(s, 'stopped') ? catheterOut : null),
    'ic-epinephrine': (s) => (deficit(s) && has(s, 'stopped') ? catheterOut : null),
    tnk: (s) => (deficit(s) ? {
      say: [['you', 'Tenecteplase IV, weight-based.'], ['team', 'Nurse: "Before the CT — on top of the heparin?"', 'warn'], ['team', 'Nurse: "He\'s oozing around the sheath now."', 'bad']],
      flags: ['lytic'],
    } : null),
    heparin: (s) => (deficit(s) ? { say: [['you', 'Heparin 3,000 units IV.']], flags: ['heparin', 'more-heparin'] } : null),
    aspirin: (s) => {
      if (!deficit(s) || !s.pulse || s.vitals.gcs < 11) return null;
      return { say: [['patient', 'He chews the aspirin — then coughs and splutters as he tries to swallow: his swallow is not safe.', 'bad']], flags: ['aspirin'] };
    },
    p2y12: (s) => {
      if (!deficit(s) || !s.pulse || s.vitals.gcs < 11) return null;
      return { say: [['patient', 'He takes the ticagrelor — then coughs and splutters as he tries to swallow: his swallow is not safe.', 'bad']], flags: ['p2y12'] };
    },
  },
  events: [
    {
      // where the case stands: the sheath in, heparin and the cocktail given, the left coronary done, the JR4 in the arch
      id: 'setup', when: () => true,
      effect: () => ({ flags: ['consent', 'timeout', 'iv', 'prep', 'transducer', 'monitor', 'access', 'catheter', 'heparin', 'cocktail', 'sedation', 'angio', 'cine'] }),
    },
    {
      // the deficit, as the team sees it — and the explanation everyone in the room would like it to be
      id: 'deficit', when: () => true,
      effect: (s) => ({
        say: [
          [s.role === 5 ? 'you' : 'operator', 'JR4 up through the arch over the wire; wire out, catheter flushed — next, the right coronary.'],
          ['patient', '"I… the… it\'s… mm… wrong…" — he frowns: the words come out slurred and jumbled.'],
          ['scene', 'His right hand has gone limp on the arm board, and the right corner of his mouth droops.'],
          ['monitor', 'Heart rate 84. BP 174/92 on the arterial line.'],
          s.role === 5
            ? ['team', `Nurse: "Doctor — his speech! He was talking normally to me at ${LAST_WELL}. He had midazolam 1 mg and fentanyl 25 at 10:15 — is he just drowsy?"`, 'warn']
            : ['operator', 'Probably the midazolam catching up with him. Let\'s finish: two runs of the right coronary and we\'re done.'],
        ],
        flags: ['deficit'], read: strokeRead,
      }),
    },
    {
      // nobody has told the operator: he finishes what he set out to do — more catheter work in the arch
      id: 'operator-carries-on', when: (s) => s.role !== 5 && deficit(s) && !has(s, 'aware') && s.minute >= 1.5,
      effect: () => ({
        say: [['operator', 'JR4 into the right coronary — hand injection.'], ['monitor', 'Cine recorded: LAO view of the right coronary.']],
        image: { id: 'view-rca-lao', view: 'LAO view of the right coronary' }, flags: ['more-arch', 'cine', 'view-rca-lao'],
      }),
    },
    {
      id: 'callout-fallback', when: (s) => s.role !== 5 && deficit(s) && !has(s, 'aware') && s.minute >= 2,
      effect: (s) => ({
        say: [['team', `${teammate(s)}: "Doctor — stop! His speech is slurred and his right side is weak — that is new. He was fine at ${LAST_WELL}."`, 'warn'], ['operator', 'You\'re right. Stopping.']],
        flags: ['aware', 'team-noticed', 'time-noted'],
      }),
    },
    {
      // the operator stops once told: no more injections, the catheter out over a wire, the sheath left in
      id: 'md-stops', when: (s) => s.role !== 5 && has(s, 'aware') && !has(s, 'stopped'),
      effect: (s) => ({
        say: [
          ['operator', 'No more injections and no more catheter work in the arch: the JR4 comes back over a J-wire and out; the sheath stays in, flushed and secured.'],
          s.role === 3
            ? (has(s, 'contrast-stopped') ? ['operator', 'Injector\'s already off — good. J-wire, please.'] : ['operator', 'Injector off and the manifold closed, please — and hand me a J-wire.'])
            : ['team', 'Tech: "Injector off, manifold closed."'],
        ],
        flags: ['stopped', ...(s.role === 4 ? ['contrast-stopped'] : [])], clear: ['catheter'],
      }),
    },
    {
      id: 'injector-fallback', when: (s) => s.role === 3 && has(s, 'stopped') && !has(s, 'contrast-stopped') && s.minute >= s.flags.stopped + 2,
      effect: () => ({ say: [['operator', 'I\'ve closed the manifold myself — nothing more goes in.', 'warn']], flags: ['contrast-stopped', 'injector-by-team'] }),
    },
    {
      id: 'alert-ask', when: (s) => s.role !== 5 && has(s, 'stopped') && !has(s, 'stroke-alert'),
      effect: () => ({ say: [['operator', `Call a stroke alert, please — now. Last seen normal at ${LAST_WELL}.`]], flags: ['alert-asked'] }),
    },
    {
      id: 'alert-fallback', when: (s) => s.role !== 5 && has(s, 'stopped') && !has(s, 'stroke-alert') && s.minute >= 3,
      effect: (s) => {
        const e = strokeAlert(s, 'team', `${teammate(s)}, on the phone: "${ALERT_CALL}"`);
        return { ...e, flags: [...(e.flags ?? []), 'alert-by-team'] };
      },
    },
    {
      id: 'md-stop-nudge', when: (s) => s.role === 5 && deficit(s) && !has(s, 'stopped') && s.minute >= 1,
      effect: () => ({ say: [['team', 'Tech: "Doctor — do we stop? No more injections, and the catheter out over a wire?"', 'warn']] }),
    },
    {
      id: 'md-alert-nudge', when: (s) => s.role === 5 && deficit(s) && !has(s, 'stroke-alert') && s.minute >= 3,
      effect: () => ({ say: [['team', 'Nurse: "Doctor — shall I call a stroke alert?"', 'warn']] }),
    },
    {
      // the nurse examines him and checks his glucose while the tech works the table (the exam and the meter take a minute)
      id: 'rn-assesses-for-tech', when: (s) => s.role === 3 && has(s, 'stopped') && s.minute >= s.flags.stopped + 1,
      effect: (s) => ({
        say: [['team', `Nurse: "Glucose ${s.vitals.glucose}. ${worse(s)
          ? 'Drowsy, eyes to the left, no words at all; the right face, arm and leg barely move'
          : 'Right face droops, the right arm drifts to the bed, the right leg drifts; only fragments of words, slurred'}. NIHSS ${nihss(s)}. Cuff on the left arm: ${s.vitals.sbp}/${s.vitals.dbp}."`]],
        flags: ['neuro-done', 'glucose-done', 'bp-checked'],
      }),
    },
    {
      id: 'act-ask', when: (s) => s.role === 3 && has(s, 'stroke-alert') && !has(s, 'act'),
      effect: () => ({ say: [['operator', 'Run an ACT, please — the stroke team will want to know how much heparin is on board.']] }),
    },
    {
      id: 'act-fallback', when: (s) => s.role === 3 && has(s, 'stroke-alert') && !has(s, 'act') && s.minute >= s.flags['stroke-alert'] + 3,
      effect: (s) => ({ say: [['team', `Nurse: "I ran the ACT: ${actValue(s)}."`, 'warn']], flags: ['act', 'act-by-team'] }),
    },
    {
      // the stroke neurologist at the table; in the tech's case the nurse and the neurologist take him to CT from here
      id: 'stroke-team-arrives', when: (s) => s.pulse && has(s, 'stroke-alert') && !has(s, 'team-here') && s.minute >= s.flags['stroke-alert'] + TEAM_MINUTES,
      effect: (s) => ({
        say: [
          ['team', `Stroke neurologist at the table: "${nihssWords(s)}; last known well ${LAST_WELL}, so we are well inside every window. ${anticoagWords(s)} CT and CT angiography now — if a large artery is blocked, he goes for thrombectomy."`],
          ...(s.role === 3 ? [['team', `The nurse and the neurologist take him to CT with the transport monitor; ${sheath(s)}.`] as Line] : []),
        ],
        flags: ['team-here', ...(s.role === 3 ? ['to-ct'] : [])],
      }),
    },
    {
      id: 'ct-nudge', when: (s) => s.role !== 3 && has(s, 'team-here') && !ctStarted(s) && s.minute >= s.flags['team-here'] + 2,
      effect: () => ({ say: [['team', 'Stroke neurologist: "The scanner is ready — we need to go now."', 'warn']] }),
    },
    {
      // whatever brought it down (a vasodilator, a beta-blocker, sedation), a systolic under 140 is too low for him: the
      // teammate says so, and from here the pressure has to come back up (the 'bp-low' item)
      id: 'pressure-falls', when: (s) => s.pulse && deficit(s) && s.vitals.sbp < LOW_FOR_STROKE,
      effect: (s) => ({ say: [['team', `${teammate(s)}: "Pressure ${s.vitals.sbp}/${s.vitals.dbp} — that's a long way below his usual 170s."`, 'warn']], flags: ['bp-low'] }),
    },
    {
      // the deficit grows: another embolus from more catheter work, collaterals failing on a pressure pushed too low, or time lost
      id: 'worse',
      when: (s) => s.pulse && deficit(s) && !worse(s)
        && (has(s, 'more-arch') || has(s, 'bp-low') || (s.minute >= 6 && !has(s, 'stroke-alert')) || (s.minute >= 20 && !ctStarted(s))),
      effect: (s) => {
        // the stress of a growing stroke speeds the heart a little, from whatever rate a drug has left it at
        const hr = s.rhythm.hr + 8;
        return {
          say: [
            ['team', `${teammate(s)}: "His arm — it's gone completely. And he's stopped talking."`, 'bad'],
            ['scene', 'His eyes have turned to the left; the right arm and leg lie still; he no longer speaks.'],
            ['monitor', `Heart rate ${hr}. BP ${s.vitals.sbp}/${s.vitals.dbp}.`],
          ],
          rhythm: atRate(s, hr), vitals: { gcs: Math.min(s.vitals.gcs, WORSE_GCS) }, flags: ['worse'],
        };
      },
    },
    {
      // in the tech's case the nurse brings a pressure the tech's drugs pushed too low back up
      id: 'nurse-supports', when: (s) => s.role === 3 && s.pulse && has(s, 'bp-low') && s.vitals.sbp < LOW_FOR_STROKE,
      effect: (s) => {
        const bp = bpAfter(s, 24, 12, { sbp: 160, dbp: 90 });
        return { say: [['team', 'Nurse: "Phenylephrine 100 mcg and a saline bolus going in — and no more of those drugs, please."', 'warn'], ['monitor', `BP ${bp.sbp}/${bp.dbp}.`]], vitals: bp, flags: ['supported'] };
      },
    },
  ],
  critical: [
    // the tech
    {
      id: 'tech-callout', label: 'Call it out at once, with the time', roles: TECH, points: 10, target: { within: { flag: 'deficit', minutes: 1 } },
      why: `Slurred speech and a limp hand during catheter work in the arch is a stroke until proven otherwise — not the midazolam. Say it out loud so the operator stops, and give the time: he was last seen normal at ${LAST_WELL}, and that time decides what treatment is possible.`,
      done: spokeUp, uses: SPEAK_UP,
    },
    { id: 'tech-stop', label: 'Injector off and the manifold closed', why: 'Nothing more goes in: the catheter comes out over a wire, and the case is over.', done: beforeTeam(['stop-contrast'], 'injector-by-team'), uses: ['stop-contrast'], roles: TECH, points: 5, target: { within: { flag: 'deficit', minutes: 2 } } },
    { id: 'tech-alert', label: 'Call the stroke alert', why: `One call brings the stroke neurologist and clears the CT scanner: give the place, what you see and the time last seen normal (${LAST_WELL}).`, done: ['stroke-team'], after: 'deficit', roles: TECH, points: 10, target: { within: { flag: 'deficit', minutes: 3 } } },
    { id: 'tech-act', label: 'Run an ACT for the stroke team', why: 'He has had 5,000 units of heparin: how long his blood takes to clot decides whether IV thrombolysis is even possible.', done: beforeTeam(['act'], 'act-by-team'), uses: ['act'], roles: TECH, points: 5, target: { within: { flag: 'stroke-alert', minutes: 3 } } },

    // the nurse
    {
      id: 'rn-callout', label: 'Call it out at once, with the time', roles: RN, points: 10, target: { within: { flag: 'deficit', minutes: 1 } },
      why: `Slurred speech and a limp hand during catheter work in the arch is a stroke until proven otherwise — sedation never causes a one-sided deficit. Say it out loud so the operator stops, and give the time: last seen normal at ${LAST_WELL}.`,
      done: spokeUp, uses: SPEAK_UP,
    },
    { id: 'rn-alert', label: 'Call the stroke alert', why: `One call brings the stroke neurologist and clears the CT scanner: give the place, what you see and the time last seen normal (${LAST_WELL}).`, done: ['stroke-team'], after: 'deficit', roles: RN, points: 10, target: { within: { flag: 'deficit', minutes: 3 } } },
    { id: 'rn-neuro', label: 'Neuro check (NIH stroke scale)', why: 'Level of consciousness, gaze, visual fields, face, arm and leg drift, sensation, language and speech: the baseline every later check is compared with, and what the stroke team needs to decide.', done: ['neuro'], after: 'deficit', roles: RN, points: 10, target: { within: { flag: 'deficit', minutes: 3 } } },
    { id: 'rn-glucose', label: 'Check the glucose', why: 'A low glucose can mimic a stroke — check it, but never wait on it to call the stroke team.', done: ['glucose'], after: 'deficit', roles: RN, points: 10, target: { within: { flag: 'deficit', minutes: 5 } } },
    { id: 'rn-bp', label: 'Blood pressure on the cuff, for the trip to CT', why: 'The arterial trace goes when the catheter comes out: a cuff on the other arm, cycling, keeps the pressure in view. Know it — and do not lower it.', done: ['nibp', 'vitals', 'bp-both-arms'], after: 'deficit', roles: RN, points: 5, target: { within: { flag: 'deficit', minutes: 5 } } },
    { id: 'rn-airway', label: 'Airway and breathing: protect them, nothing by mouth', why: 'A new deficit can take the swallow and the gag: suction ready, oxygen only to keep the SpO₂ above 94 % (not for a patient already above it), and nothing by mouth until a swallow screen.', done: ['primary'], after: 'deficit', roles: RN, points: 5, target: { within: { flag: 'deficit', minutes: 5 } } },
    { id: 'rn-anticoag', label: 'An ACT (or coagulation labs) for the stroke team', why: 'He has had 5,000 units of heparin: how long his blood takes to clot decides whether IV thrombolysis is even possible.', done: ['act', 'labs'], after: 'deficit', roles: RN, points: 5, target: { within: { flag: 'deficit', minutes: 10 } } },
    { id: 'rn-ct', label: 'To CT and CT angiography with him', why: 'The scan excludes a bleed and finds a blocked large artery that thrombectomy can open: the nurse goes with him, with the monitor.', done: ['ct-urgent'], after: 'deficit', roles: RN, points: 10, target: { by: 20 } },

    // the cardiologist
    { id: 'md-stop', label: 'Stop the procedure safely', why: 'No more injections and no more catheter work in the arch — every pass can knock off more debris: bring the catheter out over a wire and leave the sheath in, flushed. The right coronary can wait.', done: ['stop-contrast'], after: 'deficit', roles: MD, points: 10, target: { within: { flag: 'deficit', minutes: 1 } } },
    { id: 'md-alert', label: 'Call the stroke alert', why: `One call brings the stroke neurologist and clears the CT scanner; with him last seen normal at ${LAST_WELL}, every minute counts.`, done: ['stroke-team'], after: 'deficit', roles: MD, points: 10, target: { within: { flag: 'deficit', minutes: 3 } } },
    { id: 'md-neuro', label: 'Examine him (NIH stroke scale)', why: 'Which side, how severe, and whether a large artery is likely blocked (aphasia, a facial droop, an arm and a leg: NIHSS 10): the baseline every later check is compared with.', done: ['neuro'], after: 'deficit', roles: MD, points: 10, target: { within: { flag: 'deficit', minutes: 3 } } },
    { id: 'md-glucose', label: 'Check the glucose', why: 'A low glucose can mimic a stroke — check it, but never wait on it to call the stroke team.', done: ['glucose'], after: 'deficit', roles: MD, points: 5, target: { within: { flag: 'deficit', minutes: 5 } } },
    { id: 'md-anticoag', label: 'Know the heparin: an ACT (or coagulation labs)', why: '5,000 units at 10:20: how long his blood takes to clot is the first thing the stroke team asks — it decides whether IV thrombolysis is even possible.', done: ['act', 'labs'], after: 'deficit', roles: MD, points: 5, target: { within: { flag: 'deficit', minutes: 10 } } },
    { id: 'md-ct', label: 'CT and CT angiography now', why: 'The CT excludes a bleed (he is on heparin); the CT angiogram finds a blocked large artery that thrombectomy can open.', done: ['ct-urgent'], after: 'deficit', roles: MD, points: 15, target: { by: 20 } },

    // the nurse and the cardiologist
    {
      id: 'bp-low', label: 'Bring a pressure that has fallen under 140 back up', roles: [4, 5], points: 10, target: { within: { flag: 'bp-low', minutes: 3 } }, applies: (s) => has(s, 'bp-low'),
      why: 'His pressure runs in the 170s, and the brain tissue around the blocked artery lives on collaterals that need it: stop whatever dropped it, give a saline bolus or a vasopressor bolus (phenylephrine), and lay him flat with the legs raised — back toward where it was, never above 185/110.',
      done: (s) => s.performed.find((p) => RAISE.includes(p.id) && p.minute >= s.flags['bp-low'])?.minute ?? null, uses: RAISE,
    },
    { id: 'handoff', label: 'Hand-off to the stroke and neurointerventional team', why: `What happened and when (last known well ${LAST_WELL}), the NIHSS, the glucose, the heparin and the ACT, the sedation, the pressure, the sheath, and the CT — so thrombectomy starts without a question.`, done: ['handoff'], roles: [4, 5], points: 5 },
  ],
  harms: [
    { id: 'carry-on', actions: MD_CARRY_ON, roles: MD, when: (s) => deficit(s) && !has(s, 'stopped'), points: 8, severity: 'major', text: 'More catheter work after a new neurologic deficit. Every pass in the arch can knock off more debris, and every minute before the stroke team is called costs brain: stop the injections, bring the catheter out over a wire and leave the sheath in — the coronary pictures can wait.' },
    { id: 'tech-carry-on', actions: TECH_CARRY_ON, roles: TECH, when: deficit, points: 3, severity: 'minor', text: 'Setting up the next step of the case when the patient has a new deficit. Call it out and help stop the procedure instead: slurred speech and a weak arm during catheter work in the arch is a stroke until proven otherwise.' },
    { id: 'sedation-for-deficit', actions: ['midazolam', 'fentanyl', 'sedation'], when: (s) => deficit(s) && s.pulse, replaces: ['midazolam-unsafe'], points: 8, severity: 'major', text: 'More sedation for a new one-sided deficit. Sedation does not cause a one-sided weakness or a facial droop: more of it hides the exam the stroke team needs, slows the breathing and lowers the pressure the brain is living on.' },
    { id: 'lower-bp-stroke', actions: LOWERING, when: (s) => s.pulse && deficit(s) && s.vitals.sbp <= 185 && s.vitals.dbp <= 110, replaces: ['nitro-high-not-hypertensive'], points: 8, severity: 'major', text: 'Lowering the blood pressure in an acute ischemic stroke. The tissue around the blocked artery lives on collaterals that need the pressure: a pressure of 185/110 or less is left alone (before thrombolysis or thrombectomy it must be 185/110 or less; without either it is treated only above 220/120). Nitroglycerin, a beta-blocker, the radial cocktail and the other vasodilators all drop it.' },
    // the monitor has already shown the fall: another dose on top is a second mistake, so a run of them cannot cost the same as one
    { id: 'lower-bp-again', actions: LOWERING, when: (s) => s.pulse && deficit(s) && has(s, 'bp-drug') && s.vitals.sbp <= 185 && s.vitals.dbp <= 110, replaces: ['nitro-high-not-hypertensive'], points: 5, severity: 'major', text: 'Lowering his pressure again after a first drug had already brought it down. The monitor showed the fall: each further dose takes more pressure from the brain living on collaterals around the clot. Stop the drugs that lower it, and bring it back if it has fallen well below his usual.' },
    { id: 'lytic-in-lab', actions: ['tnk'], when: deficit, points: 15, severity: 'critical', text: 'A fibrinolytic from the cardiologist, for the stroke. Before a CT has excluded a bleed it can kill; after 5,000 units of heparin (a long ACT) IV thrombolysis is generally not given at all; the stroke dose of tenecteplase is 0.25 mg/kg (25 mg at most), not the STEMI dose; and the decision is the stroke team\'s. A blocked large artery is treated with thrombectomy.' },
    { id: 'more-antithrombotic', actions: ['heparin', 'bivalirudin', 'gp2b3a', 'cangrelor'], when: deficit, points: 5, severity: 'major', text: 'More anticoagulant or antiplatelet drug for the stroke. Before the scan has excluded a bleed, more of it can turn a small bleed into a fatal one; after it, antithrombotic drugs are the stroke team\'s decision — and it all stacks on the 5,000 units of heparin already given.' },
    { id: 'nothing-by-mouth', actions: ['aspirin', 'p2y12'], when: deficit, points: 5, severity: 'major', text: 'Something by mouth with a new deficit and slurred speech. His swallow may not be safe — nothing by mouth until a swallow screen — and no new antiplatelet drug before the CT has excluded a bleed and the stroke team has decided on thrombolysis (no aspirin within 24 hours of it); he had his aspirin this morning.' },
    { id: 'protamine-no-bleed', actions: ['protamine'], when: deficit, points: 3, severity: 'minor', text: 'Protamine for a stroke with no bleed on the scan. Reversing the heparin is for a bleed the CT shows, or on the stroke team\'s advice: most strokes in the lab are embolic, protamine does nothing for a blocked artery, and it can let clot form on the sheath and the catheter.' },
    // one rule for every vasopressor, at the same line as the 'bp-low' item: under 140 bringing it back up is right
    // (the built-in phenylephrine rule, same id: a deliberate exemption — once the deficit is there, 120–139 is a pressure
    // to bring back up, not a normal one; only before it does the built-in's line hold)
    { id: 'phenylephrine-no-hypotension', actions: ['phenylephrine'], when: (s) => s.pulse && !deficit(s) && s.vitals.sbp >= 120, points: 3, severity: 'minor', text: 'Phenylephrine without a low blood pressure. It is a pure vasoconstrictor for hypotension; with a normal pressure it only adds afterload and slows the heart.' },
    { id: 'pressor-high-bp', actions: PRESSORS, when: (s) => s.pulse && deficit(s) && s.vitals.sbp >= LOW_FOR_STROKE, replaces: ['phenylephrine-no-hypotension'], points: 3, severity: 'minor', text: 'A vasopressor with a systolic of 140 or more. Raising the pressure with drugs has no established benefit in acute ischemic stroke and adds their risks: keep it where it is, and support it only if it falls well below his usual.' },
  ],
  timings: [
    { label: 'Procedure stopped', actions: [], flag: 'stopped', target: 1, from: 'deficit' },
    { label: 'Stroke team called', actions: ['stroke-team'], flag: 'stroke-alert', target: 3, from: 'deficit' },
    { label: 'Glucose checked', actions: ['glucose'], flag: 'glucose-done', target: 5, from: 'deficit' },
    { label: 'Off to CT', actions: ['ct-urgent'], flag: 'to-ct', target: 20, from: 'deficit' },
  ],
  // the tech's part ends when he leaves the lab for CT; the nurse and the cardiologist see the scan read and the plan made
  completeWhen: (s) => (s.role === 3 ? has(s, 'to-ct') : has(s, 'ct') && has(s, 'thrombectomy')),
  teaching: [
    'A sudden new deficit on the table — slurred or jumbled speech, a facial droop, a weak arm or leg, lost vision or a drop in alertness — is a stroke until proven otherwise. It follows about 0.05–0.1 % of diagnostic caths and 0.2–0.4 % of PCIs; most are embolic: debris scraped off the aortic arch by catheters and wires (above all during exchanges), clot from a catheter or wire, or air. A few are bleeds on full anticoagulation.',
    'Sedation does not cause a one-sided deficit, and a weak hand on the access side is not the sheath when the face droops and the words come out wrong. Look-alikes are a low glucose, oversedation, a seizure and, rarely, contrast-induced encephalopathy: check them, but never wait on them to call the stroke team.',
    `Say it out loud and note the time: "last known well" (${LAST_WELL} here) decides what treatment is possible. Anyone in the room can — and should — stop the case.`,
    'Stop safely: no more injections or catheter work in the arch; bring the catheter out over a wire; leave the sheath in, flushed. Do not finish "two more runs".',
    'Examine (the NIH stroke scale: consciousness, gaze, visual fields, face, arm and leg drift, sensation, language, speech, neglect), check the glucose, protect the airway — oxygen only to keep the SpO₂ above 94 %, nothing by mouth until a swallow screen — and call the stroke team at once.',
    'Non-contrast CT and CT angiography: the CT excludes a bleed, the CT angiogram finds a blocked large artery. A large vessel occlusion is treated with mechanical thrombectomy — within 6 hours, and up to 24 hours in selected patients — and heparin does not rule it out.',
    'Thrombolysis is the stroke team\'s decision. A stroke during a cath is judged by the usual eligibility rules, and a heparin bolus that leaves the aPTT or ACT prolonged generally rules IV thrombolysis out; the cardiologist never gives a STEMI-dose lytic for a stroke (the stroke dose of tenecteplase is 0.25 mg/kg, 25 mg at most).',
    'Leave the pressure alone: without reperfusion therapy it is treated only above 220/120; before thrombolysis or thrombectomy it must be 185/110 or less (180/105 for 24 hours after), and lowering it further before the artery is open is linked to a bigger infarct. Correct a pressure that falls well below the patient\'s usual. Nitroglycerin, beta-blockers, the radial cocktail and more sedation can drop the pressure the brain around the clot is living on.',
    'No more heparin or antiplatelet drugs before the scan, and no protamine unless the CT shows a bleed (or the stroke team asks for it).',
    'Prevention: exchange catheters over a long wire, flush and wipe them, keep arch time and exchanges to a minimum — and in long cases ask the patient to talk and squeeze your hands: an early deficit is found by someone who looks.',
  ],
};
