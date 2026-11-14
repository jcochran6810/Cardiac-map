import type { Effect, Harm, Line, PendingRead, Scenario, SimState, Speaker, Tone, Vitals } from '../types';
import { PADS, firstDone, has, line } from '../kit';
import { INTERVENTION_BY_ID } from '../interventions';
import {
  LEFT_VIEWS, MD, RCA_VIEWS, RN, TECH, WIRES, angioGate, anticoagulated, askCritical, askEvents, askHarm, cine, doneAfter, operator,
  type LabAsk,
} from '../labKit';
import { ANTITHROMBOTIC_RULES, LYTIC_RULES, NITRATE_RULES, PROTAMINE_RULES, SEDATIVE_RULES, nitrateRulesExcept } from '../rules/acs';

/**
 * Takotsubo syndrome with dynamic LV outflow tract obstruction. A 70-year-old woman comes to the lab as a STEMI alert an hour
 * after police told her that her husband had been killed: anterior ST elevation, clean coronaries. As the last run clears her
 * pressure falls to about 80 with a new harsh systolic murmur. The answer is in the ventricle: the apex and the mid-ventricle
 * are stunned and balloon out, the base squeezes so hard that it narrows its own outflow tract and pulls the mitral leaflet
 * into it — a gradient inside the ventricle, below the valve.
 *
 * The right care (InterTAK expert consensus 2018; the 2024 AHA/ACC HCM guideline for hypotension with outflow obstruction, by
 * analogy): measure it — a careful pigtail pullback from the apex, or an echo — then fill the ventricle (fluid) and raise the
 * afterload with a vasoconstrictor that has no inotropic effect (phenylephrine). A beta-blocker can help once the pressure is
 * up (a short-acting one); with a low pressure it is contraindicated. What empties the ventricle or drives it harder makes it
 * worse: catecholamines (epinephrine, norepinephrine, dopamine), nitrates, an intra-aortic balloon pump (diuretics too: the
 * simulator offers none). Mechanical support is for the patient fluid and phenylephrine fail. The tech zeroes the
 * transducers, records the pullback and runs the LV gram; the nurse calls out the drop and the murmur, and gives the fluid
 * and the right pressor; the cardiologist does it all.
 *
 * The gradient is the case's own number, kept on the clock's timers (as cathlabScad keeps its pre-damp pressure): every drug
 * or step that matters moves it, and the pressure and the rate follow from it. Two boluses of saline help; more add nothing
 * and wet the lungs, so the pressure comes back only with the afterload (phenylephrine). A beta-blocker lowers the gradient
 * only once the pressure is back: in shock it weakens the stunned apex as much as it calms the base.
 */

/** Real images: the normal left coronary in RAO caudal, for the first look at the left system (the right is in words) */
const IMAGES: Partial<Record<string, string>> = { angio: 'normal-left-rao-caudal', 'view-rao-caudal': 'normal-left-rao-caudal' };

/** What the tech could open towards an intervention that nobody is going to do: the arteries are clean */
const TECH_PCI = ['guide-ebu', 'guide-jr4', 'guide-al1', ...WIRES, 'aspiration', 'balloon-predil', 'stent-des', 'balloon-nc', 'stent-covered'];

/** mmHg: the gradient inside the ventricle at rest before the fall (a latent obstruction), and what the fall adds */
const RESTING_GRADIENT = 40;
const DROP_ADDS = 45;
/** At or below this gradient the obstruction no longer holds the pressure down ('relieved'); above RELAPSE it does again */
const RELIEF = 35;
const RELAPSE = 55;
/** mmHg: her LVEDP before any fluid — a ventricle that can take volume */
const LVEDP = 14;

const gradientOf = (s: SimState) => s.timers.gradient ?? RESTING_GRADIENT;
const hrShiftOf = (s: SimState) => s.timers.hrShift ?? 0;
const lvedpOf = (s: SimState) => LVEDP + 2 * (s.timers.boluses ?? 0);
/** The aortic pressure the obstruction leaves: 106/66 at the resting gradient, about 80/52 at its worst */
const pressureFor = (g: number) => ({ sbp: Math.round(130 - 0.6 * g), dbp: Math.round(78 - 0.3 * g) });
/** The rate climbs as the output falls (102 at rest, 120 at the worst); a beta-blocker shifts it down */
const rateFor = (g: number, shift: number) => Math.round(86 + 0.4 * g + shift);

/** The pressure has fallen with the obstruction and nothing has brought it back yet */
const obstructing = (s: SimState) => has(s, 'obstructed') && !has(s, 'relieved');

/** Since the fall, something has lowered the gradient (the timer 'lastHelp'): the decline stops while the team works */
const helped = (s: SimState) => s.timers.lastHelp !== undefined;

/** The learner has read the pullback or the echo: until then nobody names what they show */
const gradientRead = (s: SimState) => s.reads.some((r) => r.answer === 'hemo-lvoto' || r.answer === 'clin-lvoto');

/**
 * The coronary pictures are finished: the full diagnostic run, or a second view of the arteries — or a minute after the first
 * clean left view, so a cardiologist who stops at one view still meets the fall. Until then she holds on
 */
const picturesDone = (s: SimState) => has(s, 'angio')
  || s.performed.filter((p) => LEFT_VIEWS.includes(p.id) || RCA_VIEWS.includes(p.id)).length >= 2
  || s.minute >= s.flags['normal-coronaries'] + 1;

/** The operator has ordered phenylephrine from the nurse (the nurse gives drugs on the operator's order) */
const phenylephrineOrdered = (s: SimState) => has(s, 'asked-rn-vaso') || has(s, 'asked-rn-more');

/** More than two boluses: a stiff, stunned ventricle backs the extra volume up into the lungs */
const overfilled = (s: SimState) => (s.timers.boluses ?? 0) >= 3;

const viewName = (id: string) => INTERVENTION_BY_ID[id].label.split(' — ')[0];

/** Who describes a run or a pressure: the learner as the cardiologist, otherwise the operator */
const runner = (s: SimState): Speaker => (s.role === 5 ? 'you' : 'operator');

/** Only a patient awake enough to talk says how she feels */
const awake = (s: SimState, text: string, tone?: Tone): Line[] => (s.pulse && s.vitals.gcs >= 13 ? [line('patient', `"${text}"`, tone)] : []);

/** The nurse at her side: the learner as the nurse, otherwise the computer nurse */
const nurse = (s: SimState, text: string, tone?: Tone): Line => (s.role === 4 ? line('you', text, tone) : line('team', `Nurse: "${text}"`, tone));

/** A teammate who does what the learner was asked to do: the tech helps the nurse; the nurse helps the tech */
const teammate = (s: SimState, text: string): Line => ['team', `${s.role === 4 ? 'Tech' : 'Nurse'}: "${text}"`];

/** The cardiologist has a catheter that can engage the left coronary (a JL4 or a Tiger; a JR4 does only the right) */
const leftCatheter = (s: SimState) => (s.counts['cath-jl4'] ?? 0) > 0 || (s.counts['cath-tiger'] ?? 0) > 0;

interface Change {
  /** lines before the monitor's numbers (what was done) and after them (what is heard and said) */
  lead?: Line[];
  after?: Line[];
  flags?: string[];
  hrShift?: number;
  vitals?: Partial<Vitals>;
  timers?: Record<string, number>;
}

/**
 * The patient at a new gradient: the pressure and the rate follow from it, the monitor gives the numbers (never a name), and
 * once the obstruction has dropped the pressure, a gradient back at or under 35 relieves it (above 55 it is back)
 */
function withGradient(s: SimState, next: number, c: Change = {}): Effect {
  const before = gradientOf(s);
  const g = Math.max(10, Math.min(120, Math.round(next)));
  const shift = c.hrShift ?? hrShiftOf(s);
  const bp = pressureFor(g);
  const hr = rateFor(g, shift);
  const flags = [...(c.flags ?? [])];
  const clear: string[] = [];
  const say: Line[] = [...(c.lead ?? []), line('monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`, g > before ? 'bad' : undefined), ...(c.after ?? [])];
  let pain = c.vitals?.pain;
  if (has(s, 'obstructed') && !has(s, 'relieved') && g <= RELIEF) {
    flags.push('relieved');
    say.push(nurse(s, 'The murmur is softer — and her color is coming back.', 'good'), ...awake(s, 'That\'s better… the room has stopped spinning.'));
    pain = Math.min(pain ?? s.vitals.pain, 4);
  } else if (has(s, 'relieved') && g > RELAPSE) {
    clear.push('relieved');
    say.push(nurse(s, 'That murmur is loud again — and she\'s gray.', 'bad'), ...awake(s, 'Oh… it\'s going dark again…'));
  }
  return {
    say,
    vitals: { ...bp, ...c.vitals, ...(pain !== undefined ? { pain } : {}) },
    rhythm: { profile: s.rhythm.profile, hr },
    timers: {
      gradient: g, hrShift: shift, peak: Math.max(s.timers.peak ?? before, g),
      ...(has(s, 'obstructed') && g < before ? { lastHelp: s.minute } : {}), ...c.timers,
    },
    flags,
    ...(clear.length ? { clear } : {}),
  };
}

/** Who gives the bolus: the learner, or a teammate who steps in (the tech's hands for the nurse) */
type By = 'learner' | 'team';

/**
 * A 500 mL bolus: a fuller ventricle holds the outflow tract open. The first two count; after a liter the stunned ventricle
 * gains nothing more and the lungs start to fill (fluid alone does not relieve her: the afterload has to come up too)
 */
function fluidEffect(s: SimState, by: By): Effect {
  const n = s.timers.boluses ?? 0;
  const lead: Line[] = [by === 'team' ? teammate(s, 'Saline 500 running wide open.') : ['you', s.role === 4 ? 'Saline 500 mL running wide open, read back.' : 'Saline 500 mL wide open.']];
  if (n < 2) return withGradient(s, gradientOf(s) - 20, { lead, flags: ['fluid'], timers: { boluses: n + 1 } });
  return withGradient(s, gradientOf(s), {
    lead, flags: ['fluid'], timers: { boluses: n + 1 },
    after: [nurse(s, 'She\'s more short of breath — I can hear crackles at both bases now.', 'warn')],
    vitals: { spo2: Math.max(88, s.vitals.spo2 - 2), rr: Math.min(28, s.vitals.rr + 2) },
  });
}

/** Phenylephrine 100 mcg: afterload up, outflow tract held open, the rate a little slower through the baroreflex */
function phenylephrineEffect(s: SimState): Effect {
  const n = s.timers.phenyl ?? 0;
  // the nurse gives a pressor on the operator's order (the review scores it: rn-no-order)
  const unordered = s.role === 4 && !phenylephrineOrdered(s);
  const lead: Line[] = [['you', s.role === 4 && !unordered ? 'Phenylephrine 100 mcg IV, the dose read back.' : 'Phenylephrine 100 mcg IV.']];
  const after: Line[] = unordered ? [line('operator', 'Tell me before you push a pressor, please — I need to know what she has had, and why.', 'warn')] : [];
  return withGradient(s, gradientOf(s) - (n < 2 ? 30 : 10), { lead, after, flags: ['phenylephrine'], timers: { phenyl: n + 1 } });
}

/** A teammate who steps in titrates to effect: phenylephrine boluses until the gradient is down (however far it had climbed) */
function titrated(s: SimState, lead: Line[], flags: string[], timers: Record<string, number> = {}): Effect {
  return withGradient(s, Math.min(gradientOf(s) - 30, RELIEF), { lead, flags: ['phenylephrine', ...flags], timers: { phenyl: (s.timers.phenyl ?? 0) + 1, ...timers } });
}

const pullbackRead = (g: number, edp: number): Omit<PendingRead, 'minute'> => ({
  kind: 'hemo', answer: 'hemo-lvoto', prompt: 'What does the pullback show?',
  explain: `A gradient of ${g} mmHg inside the left ventricle: the pressure drops while the catheter is still below the aortic valve, in the outflow tract, and not across the valve as it would in aortic stenosis — dynamic LV outflow tract obstruction. The hyperdynamic base squeezes the outflow tract narrow and pulls the anterior mitral leaflet into it (systolic anterior motion), which also leaks. After an extra beat the gradient rises and the aortic pulse pressure narrows (the Brockenbrough–Braunwald–Morrow sign). With an LVEDP of ${edp} the ventricle can take volume: fill it, raise the afterload, slow the rate — and give nothing that empties it or drives it harder.`,
});

/** The LV pressure at the apex and a slow pullback to the aorta, recorded: where the pressure drops is the diagnosis */
function pullback(s: SimState, by: 'learner' | 'operator'): Effect {
  const g = gradientOf(s);
  const { sbp, dbp } = s.vitals;
  const edp = lvedpOf(s);
  const lead: Line[] = by === 'operator'
    ? [['operator', 'Pulling back slowly from the apex — recording.']]
    : s.role === 3
      ? [['you', 'Recording at 25 mm/s: the LV pressure at the apex, then all through the operator\'s slow pullback to the aorta.']]
      : [['you', 'LV pressure at the apex, then a slow pullback to the aorta, recording all the way.']];
  return {
    say: [...lead, ['monitor', `LV ${sbp + g}/${edp} mmHg at the apex (LVEDP ${edp}). Pulling back, the systolic pressure falls to ${sbp} while the catheter is still below the aortic valve, and does not change as it crosses into the aorta (${sbp}/${dbp}). After an extra beat the apex pressure jumps and the aortic pulse narrows.`]],
    // 'gradient-timed': measured once the pressure had fallen (the review times it from the fall)
    flags: ['lvedp', 'pullback', 'lvoto-known', ...(has(s, 'obstructed') ? ['gradient-timed'] : [])], timers: { recorded: g }, read: pullbackRead(g, edp),
  };
}

/** The LV gram: the wall motion that names the problem (no real image of it yet: in words) */
function lvGram(s: SimState, by: 'learner' | 'operator'): Effect {
  const fired: Line[] = by === 'learner' && s.role === 3 ? [['you', 'Injector armed, the line cleared of air: 25 mL at 12 mL/s, RAO 30°. Fired.']] : [];
  return {
    say: [...fired, [by === 'learner' && s.role === 5 ? 'you' : 'operator', 'LV gram, RAO 30°: in systole the apex and the middle of the ventricle balloon out and do not move, while the base squeezes so hard it nearly empties — a round pot with a narrow neck. The still segments reach well beyond what any one coronary supplies. Moderate mitral regurgitation; EF about 35 %.']],
    image: { id: 'lv-gram', view: 'Left ventriculogram' }, flags: ['lv-gram', 'ballooning'],
  };
}

const echoRead: Omit<PendingRead, 'minute'> = {
  kind: 'clinical', answer: 'clin-lvoto', prompt: 'What does the echo show?',
  explain: 'Dynamic LV outflow tract obstruction: the stunned apex balloons, the hyperdynamic base narrows the outflow tract, the mitral leaflet is pulled into it (systolic anterior motion, with mitral regurgitation), and continuous-wave Doppler shows the late-peaking, dagger-shaped signal of a gradient that builds through systole. No effusion, so not tamponade; no septal rupture. Fill the ventricle and raise the afterload; no inotropes, no nitrates, no balloon pump.',
};

const angioRead: Omit<PendingRead, 'minute'> = {
  kind: 'angio', answer: 'angio-normal', partial: ['angio-timi3'], prompt: 'What does the left coronary run show?',
  explain: 'No significant coronary disease: a smooth left main, LAD and circumflex with brisk flow, and a smooth right coronary. Nothing here explains anterior ST elevation — no occlusion, no clot, no dissection. When a STEMI alert has clean arteries, look at the ventricle next: its pressure, a pullback, and an LV gram or an echo.',
};

const LEFT_WORDS = 'the left main, the LAD to the apex and the circumflex are smooth — no narrowing, no clot, brisk flow.';

const angioRun = (who: 'you' | 'operator') => cine('angio', 'Diagnostic angiography: left and right coronaries', IMAGES.angio, [
  [who, `Left coronary: ${LEFT_WORDS} Right coronary: smooth, no narrowing.`],
], angioRead, [[who, 'Right coronary: smooth, no narrowing. The left coronary run is on the Imaging screen.']]);

/** The cardiologist's left coronary views before the angiogram has been read: the first look at the left system */
function leftView(id: string) {
  return (s: SimState): Effect | null => {
    if (s.role !== 5 || !has(s, 'access') || has(s, 'normal-coronaries')) return null;
    if (!leftCatheter(s)) return { blocked: true, say: [['system', 'Engage the left coronary first (a Tiger, or a JL4): a JR4 sees only the right.']] };
    const run = cine(id, viewName(id), IMAGES[id], [['you', `Left coronary, ${viewName(id)}: ${LEFT_WORDS}`]], angioRead);
    return { ...run, flags: ['cine', id, 'angio-left', 'normal-coronaries'] };
  };
}

/** The cardiologist's right coronary views: smooth */
function rcaView(id: string) {
  return (s: SimState): Effect | null => {
    if (s.role !== 5 || !has(s, 'access') || !has(s, 'catheter')) return null;
    return { say: [['you', `Right coronary, ${viewName(id)}: smooth, no narrowing anywhere.`]], image: { id, view: viewName(id) }, flags: ['cine', id] };
  };
}

/**
 * An intracoronary drug or the radial cocktail drawn up by the tech or the nurse without an order: the operator gives what
 * the operator asks for. Before the fall the radial cocktail is routine (and goes in); once the pressure has fallen, nothing
 * goes in that the operator did not ask for
 */
function unasked(s: SimState, what: string): Effect | null {
  if (s.role === 5) return null;
  if (has(s, 'obstructed')) {
    return { say: [['you', `${what} drawn up.`], ['operator', 'Not in this patient — I didn\'t ask for that, and it would make her worse. Put it away.', 'warn']], flags: ['unasked-drug'] };
  }
  return { say: [['you', `${what} drawn up.`], ['operator', 'Not now — I didn\'t ask for that.']] };
}

/** The tech opens what the operator asks for: with clean coronaries, the operator refuses anything towards an intervention */
function techDevice(s: SimState, id: string): Effect | null {
  if (s.role !== 3 || !has(s, 'normal-coronaries')) return null;
  return { say: [['you', `${viewName(id)}: opened.`], ['operator', 'Put that away — there is nothing in these arteries to treat.', 'warn']], flags: [`${id}-ready`] };
}

/** "a, b and c" */
const listOf = (parts: string[]) => (parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]);

/** The hand-off: what was found, what was done (the harm too: the next team must know), what to avoid, and what to watch for */
function handoffText(s: SimState): string {
  const peak = s.timers.peak ?? gradientOf(s);
  const gave = listOf([has(s, 'fluid') && 'saline', has(s, 'phenylephrine') && 'phenylephrine', has(s, 'beta-blocker') && 'metoprolol', has(s, 'impella') && 'an Impella']
    .filter((x): x is string => !!x));
  const worse = listOf([
    has(s, 'catecholamine') && 'a catecholamine', has(s, 'nitrate') && 'a nitrate', has(s, 'iabp') && 'a balloon pump',
    has(s, 'diltiazem') && 'diltiazem', (has(s, 'benzodiazepine') || has(s, 'sedation-worse')) && 'sedation',
  ].filter((x): x is string => !!x));
  const site = has(s, 'femoral') ? 'the femoral sheath is out, with pressure held' : 'the radial band is on';
  return `SBAR hand-off to the CCU nurse: 70-year-old woman, anterior ST elevation an hour after the news that her husband had died; clean coronaries, and an apex that balloons over a hyperdynamic base — Takotsubo syndrome. On the table her pressure fell to about 80 with a new systolic murmur: a gradient of ${peak} mmHg inside the ventricle (dynamic outflow obstruction). `
    + `Treated with ${gave || 'the team\'s fluid and phenylephrine'}; the gradient is now about ${gradientOf(s)} and her pressure ${s.vitals.sbp}/${s.vitals.dbp}. `
    + (worse ? `She was also given ${worse}, and the gradient climbed with it. ` : '')
    + (overfilled(s) ? `She has had ${(s.timers.boluses ?? 0) * 500} mL of saline and has crackles at both bases: no more volume without an echo. ` : '')
    + `If she drops again: ${overfilled(s) ? 'phenylephrine' : 'fluid, phenylephrine'} and an echo for the gradient — no inotropes, no nitrates, no diuretics, no balloon pump. `
    + 'This is an acquired long QT (QTc about 480 now): torsades is most likely on days 2 to 4 — telemetry, no QT-prolonging drugs, and her potassium (3.6) and magnesium (1.8) brought up to 4 or more and 2 or more. '
    + `Echo tomorrow for the gradient and an apical thrombus; an ACE inhibitor as her pressure allows; ${site}. Her daughter is on the way — and social work and the chaplain: she has just lost her husband.`;
}

/** What the operator asks the tech for */
const TECH_ASKS: LabAsk[] = [
  {
    id: 'diag', when: (s) => has(s, 'access'), early: true,
    ask: 'Diagnostic catheter, please — one that does both coronaries from the right radial.',
    accept: ['cath-tiger'], wrong: ['cath-jl4', 'cath-jr4', 'cath-pigtail', 'guide-ebu', 'guide-jr4', 'guide-al1'],
    wrongSay: 'That one does only one side, or it is for an intervention. One catheter for both coronaries, please — a Tiger.',
    thanks: 'Tiger — thanks. Left coronary first.', fallback: 'I\'ll open a Tiger myself.', gives: 'diag-in-hand',
    label: 'Diagnostic catheter for both coronaries (Tiger), as asked',
    why: 'From the right radial a Tiger engages both coronaries, so the diagnostic pictures need no catheter exchange: less spasm, less time.',
  },
  {
    id: 'pigtail', when: (s) => has(s, 'obstructed') && has(s, 'normal-coronaries'), early: true,
    ask: 'Clean arteries, ST elevation — and now this pressure and a new murmur. I want the pressure inside the ventricle: a pigtail, please.',
    accept: ['cath-pigtail'], wrong: ['guide-ebu', 'guide-jr4', 'guide-al1', 'cath-jl4', 'cath-jr4'],
    wrongSay: 'Not that — there is nothing in these arteries to treat. A pigtail, for the ventricle.',
    thanks: 'Thanks — going across the valve.', fallback: 'I\'ll open a pigtail myself.', gives: 'pigtail-in-hand',
    label: 'A pigtail for the LV pressure, as asked',
    why: 'Clean coronaries, ST elevation, and a falling pressure with a new murmur: the answer is in the ventricle. A pigtail measures the pressure inside it, records the pullback and shoots the LV gram.',
  },
  {
    id: 'pullback', when: (s) => has(s, 'pigtail-in') && has(s, 'obstructed'), within: 1,
    ask: 'Pigtail\'s at the apex. Record the LV pressure, and keep recording while I pull back slowly to the aorta, please.',
    accept: ['lvedp'],
    thanks: 'Thanks — there it is.', fallback: 'I\'ll record it myself.', gives: 'pullback-done',
    fallbackEffect: (s) => pullback(s, 'operator'),
    label: 'Record the LV pressure and the pullback, as asked', points: 15,
    why: 'A slow pullback from the apex to the aorta shows where the pressure drops: inside the ventricle, below the valve, in dynamic outflow obstruction (about 1 in 5 Takotsubo patients); across the valve in aortic stenosis. Record it on the screen and on paper — and only a zeroed, leveled transducer makes the numbers true.',
  },
  {
    // an LV gram shot before the order (once the pigtail was in) counts: the picture is on the screen
    id: 'lvgram', when: (s) => has(s, 'relieved') && has(s, 'pigtail-in'), early: true,
    ask: 'Pressure\'s back up. LV gram now, please — RAO 30, 25 mL at 12 a second.',
    accept: ['lv-gram'],
    thanks: 'Thanks — look at that apex.', fallback: 'I\'ll run the injector myself.', gives: 'lvgram-done',
    fallbackEffect: (s) => lvGram(s, 'operator'),
    label: 'LV gram on the power injector, as asked',
    why: 'The LV gram shows the wall motion that names the problem: an apex and a mid-ventricle that balloon and do not move, over a base that squeezes hard. The pressure comes first; then the picture, with a modest contrast load.',
  },
];

/** What the operator asks the nurse for */
const RN_ASKS: LabAsk[] = [
  {
    id: 'rn-heparin', role: 4, when: () => true,
    ask: 'STEMI on the field 12-lead: heparin 70 units a kilo, please — she\'s 62 kilos, so 4,300 units. And check her consent and allergies.',
    accept: ['heparin'], wrong: ['bivalirudin', 'gp2b3a', 'cangrelor', 'protamine'],
    wrongSay: 'That\'s not what I ordered — unfractionated heparin, 4,300 units.',
    thanks: 'Thanks.', fallback: 'I\'ll get the heparin in myself.', gives: 'heparin-given',
    fallbackEffect: () => ({ say: [['team', 'Heparin 4,300 units IV.']], flags: ['heparin'] }),
    label: 'Heparin for the STEMI, as ordered',
    why: 'Until the angiogram says otherwise this is a STEMI: anticoagulate before the catheters go in (unfractionated heparin 70–100 units/kg, which also keeps the radial artery open). Read the dose back.',
  },
  {
    // a unit of blood has its own penalty (transfuse-no-bleeding): the operator's word only, no second one for the same choice
    id: 'rn-fluid', role: 4, when: (s) => gradientRead(s) && obstructing(s), early: true,
    ask: 'There it is: a big gradient inside the ventricle, below the valve, and a normal LVEDP — she\'s obstructing, and that ventricle can take volume. Saline 500, wide open, please.',
    accept: ['fluid'], wrong: ['transfuse'],
    wrongSay: 'Not blood — she isn\'t bleeding. Saline, 500, wide open.',
    thanks: 'Thanks — let it run.', fallback: 'I\'ll hang the saline myself.', gives: 'fluid-given',
    fallbackEffect: (s) => fluidEffect(s, 'team'),
    label: 'Fluid bolus for the obstruction, as ordered', points: 10,
    why: 'A fuller ventricle holds its outflow tract open: volume is the first treatment for dynamic outflow obstruction when the lungs are clear and the LVEDP is not high. Hang it, open it up, read it back.',
  },
  {
    // the catecholamines carry their own penalty (catecholamine-lvoto, and the built-in one for 1 mg of epinephrine)
    id: 'rn-vaso', role: 4, when: (s) => has(s, 'fluid-given') && obstructing(s), early: true,
    ask: 'Better, but not enough. I need her pressure up without making that base squeeze any harder — a vasoconstrictor with no inotropic effect. A bolus, please.',
    accept: ['phenylephrine'], wrong: ['pressor', 'push-epi', 'epinephrine', 'ic-epinephrine'],
    wrongSay: 'Not that — it drives the heart harder, and the gradient climbs with it. Phenylephrine: it only squeezes the vessels.',
    thanks: 'Thanks — watch the gradient come down.', fallback: 'Phenylephrine, please — where is it?', gives: 'phenylephrine-given',
    // a pressure already back (raised legs and saline) needs no pressor pushed for the sake of the order
    fallbackEffect: (s) => (obstructing(s)
      ? titrated(s, [teammate(s, 'Phenylephrine 100 micrograms, then another — titrating to her pressure.')], [])
      : { say: [['operator', 'Never mind — her pressure is back. Hold it.']] }),
    label: 'Phenylephrine for the obstruction, as ordered', points: 15,
    why: 'Phenylephrine is a pure alpha agonist: it raises the afterload, which holds the outflow tract open, and slows the rate a little through the baroreflex — with no push on the contractility. Epinephrine, norepinephrine and dopamine all drive the hyperdynamic base harder and raise the gradient.',
  },
  {
    // only when the first bolus was not enough (a fall left untreated for minutes climbs higher): the catecholamines have their own penalty
    id: 'rn-more', role: 4, when: (s) => has(s, 'phenylephrine-given') && obstructing(s),
    ask: 'Still not enough. Another 100 of phenylephrine, please — and keep the saline running.',
    accept: ['phenylephrine'], wrong: ['pressor', 'push-epi', 'epinephrine', 'ic-epinephrine'],
    wrongSay: 'Not that — it drives the heart harder, and the gradient climbs with it. More phenylephrine.',
    thanks: 'Thanks.', fallback: 'Is that phenylephrine coming?', gives: 'more-given',
    fallbackEffect: (s) => (obstructing(s)
      ? titrated(s, [['operator', 'Phenylephrine 100 micrograms, and again — titrating to her pressure.']], [])
      : { say: [['operator', 'Never mind — her pressure is back. Hold it.']] }),
    label: 'More phenylephrine until the pressure is back, as ordered', points: 5,
    why: 'Phenylephrine is given in boluses (50–100 mcg) and repeated, or run as an infusion, until the gradient and the pressure respond: the longer the fall went untreated, the more it takes.',
  },
  {
    // nitrates have their own penalty (nitrate-lvoto, or the operator refusing an intracoronary one): the ask's harm is midazolam only.
    // Fentanyl already given for her chest pain counts: a nurse who treats the pain before being asked has done the job
    id: 'rn-pain', role: 4, when: (s) => has(s, 'ballooning') && has(s, 'relieved'), early: true,
    ask: 'She\'s still sore, and frightened. Something for the pain, please — and stay with her.',
    accept: ['fentanyl'], wrong: ['nitro', 'nitro-high', 'ic-nitro', 'midazolam'],
    wrongSay: 'Not that — a nitrate empties the ventricle and the gradient comes straight back, and a sedative drops her pressure. Fentanyl, 25 micrograms.',
    thanks: 'Thanks.', fallback: 'Is anyone giving her something for the pain?', gives: 'pain-treated',
    fallbackEffect: (s) => ({ say: [['team', 'Fentanyl 25 mcg IV.']], vitals: { pain: Math.max(0, s.vitals.pain - 3) }, flags: ['analgesia'] }),
    label: 'Treat the pain when the operator asks (fentanyl)',
    why: 'A small dose of an opioid (fentanyl 25–50 mcg IV) eases the pain without emptying the ventricle. Nitroglycerin lowers the preload and the afterload — the two things holding the outflow tract open.',
  },
];

/** What every role hears first: the STEMI alert, what EMS gave, and the patient on the table */
const BRIEFING: Line[] = [
  ['team', 'STEMI alert from the field: 70-year-old woman, heavy central chest pressure and breathlessness for 50 minutes. It began an hour after police came to her door to tell her that her husband had been killed in a car crash. The field 12-lead showed about 2.5 mm of ST elevation in V3–V5.'],
  ['team', 'EMS gave aspirin 324 mg; an 18 G IV is in her left forearm. High blood pressure on lisinopril; no heart history; never smoked. 62 kg.'],
  ['scene', 'She is pale, sweaty and crying; the pressure in her chest is 6 out of 10. Her daughter is on the way.'],
];

const CATECHOLAMINE_TEXT = 'A catecholamine in Takotsubo syndrome with outflow obstruction. Epinephrine, norepinephrine and dopamine all push the contractility up: the hyperdynamic base squeezes harder, the outflow tract narrows further, the gradient climbs and the pressure falls — and a catecholamine surge is what stunned the apex in the first place (about 20 % of patients given catecholamines in the InterTAK registry died — sicker patients, but a warning). For a low pressure with outflow obstruction: fluid, then a vasoconstrictor with no inotropic effect (phenylephrine); if those fail, mechanical support.';
/**
 * The nurse gives a drug on the operator's order. Only where no other rule of the case already scores the same dose: one
 * mistake, one penalty
 */
const rnNoOrder = (id: string, actions: string[], name: string, when: (s: SimState) => boolean): Harm => ({
  id: `rn-no-order-${id}`, actions, roles: RN, points: 3, severity: 'minor', when: (s) => s.pulse && when(s),
  text: `${name} without the operator's order. In the cath lab the nurse gives drugs on the operator's order (spoken and read back) or a standing protocol: say what you see and what you think she needs, and give it once it is ordered.`,
});

const NITRATE_TEXT = 'A nitrate with dynamic outflow obstruction. Nitroglycerin lowers the preload and the afterload — the two things holding the outflow tract open — so the ventricle empties faster, the gradient climbs and the pressure falls (InterTAK 2018: avoid nitroglycerin with LV outflow tract obstruction). For her pain, a small dose of fentanyl.';

export const cathlabTakotsubo: Scenario = {
  id: 'takotsubo-lvot-cathlab',
  title: 'STEMI alert the morning she lost her husband',
  summary: '70-year-old woman with anterior ST elevation an hour after police told her that her husband had died. The arteries are clean — then her pressure falls and a new murmur appears. Find out why, and treat it without making it worse.',
  setting: 'cathlab',
  roles: [3, 4, 5],
  difficulty: 'advanced',
  conditionId: 'takotsubo',
  images: IMAGES,
  // Takotsubo is an acquired long QT (InterTAK 2018; QTc 480 on her tracing, in a woman): the built-in rules then hold
  // ondansetron, amiodarone and procainamide to it, as her hand-off says
  problems: ['long-qt'],
  briefing: {
    default: BRIEFING,
    3: [
      ...BRIEFING,
      ['team', 'You are the scrub tech: set-up, the transducers and the pads, the catheters and the power injector the cardiologist asks for, the pressure recordings — and calling out every change you see. The nurse is with her.'],
    ],
    4: [
      ...BRIEFING,
      ['team', 'You are the procedural nurse: consent, the drugs the cardiologist orders, her rhythm, pressure and comfort, and the hand-off. The tech has set up; the cardiologist is scrubbing.'],
    ],
    5: [
      ...BRIEFING,
      ['team', 'You are the interventional cardiologist: every choice is yours. The tech and the nurse are with you.'],
    ],
  },
  initial: {
    // a resting gradient of 40 already: 106/66 and a rate of 102 (pressureFor and rateFor)
    rhythm: { profile: 'takotsubo', hr: 102 },
    vitals: { sbp: 106, dbp: 66, spo2: 96, rr: 22, etco2: 33, pain: 6, gcs: 15, glucose: 162, temp: 36.6 },
  },
  facts: {
    sample: 'No allergies. Just lisinopril, for my blood pressure. I\'ve never had heart trouble… The police came to the door at seven. Jim\'s gone.',
    opqrst: 'It came on about an hour after the police left — a heavy pressure right in the middle of my chest, and I can\'t get my breath. About a six.',
    lungs: (s) => (obstructing(s)
      ? `${overfilled(s) ? 'Fine crackles at both bases now.' : 'Clear on both sides.'} Over the heart, a new loud, harsh crescendo–decrescendo systolic murmur at the left lower sternal edge.`
      : has(s, 'relieved')
        ? `${overfilled(s) ? 'Fine crackles at both bases.' : 'Clear on both sides.'} The murmur over the heart is much softer.`
        : 'Clear on both sides.'),
    perfusion: (s) => (obstructing(s)
      ? s.vitals.sbp >= 100 ? 'Cool hands; capillary refill 3 seconds; neck veins flat.' : 'Cool, clammy hands; capillary refill 4 seconds; neck veins flat.'
      : has(s, 'relieved') ? 'Warmer hands; capillary refill 2 seconds; neck veins flat.' : 'Warm and a little clammy; neck veins flat; radial pulses equal.'),
    labs: 'Troponin I 1.6 ng/mL; NT-proBNP 3,900. Potassium 3.6, magnesium 1.8, creatinine 0.9, hemoglobin 12.9, platelets 240.',
    ecg12: (s) => `${s.rhythm.hr > 100 ? 'Sinus tachycardia' : 'Sinus rhythm'} ${s.rhythm.hr}: ST elevation in V2–V6, most in V3–V5 (about 2.5 mm), and in I and II, with ST depression in aVR, almost none in V1 and no reciprocal depression in the inferior leads; QTc about 480 ms. That is the pattern Takotsubo gives — yet on the ECG alone it cannot be told from an anterior STEMI: only the angiogram can.`,
    echo: 'Echo: the apex and the middle of the left ventricle are akinetic and ballooned; the base is hyperdynamic. LVEF about 35 %. No pericardial effusion.',
    lvgram: 'LV gram: the apex and the middle of the ventricle balloon out over a hyperdynamic base; EF about 35 %.',
    rhc: (s) => (obstructing(s)
      ? 'RA 3 · RV 34/3 · PA 34/14 (mean 21) · PCWP 15 with v waves to 28 · CO 3.2 L/min, CI 1.9.'
      : 'RA 6 · RV 30/6 · PA 30/12 (mean 18) · PCWP 12 · CO 4.4 L/min, CI 2.6.'),
    final: 'Final pictures in two views: smooth coronaries; nothing to treat.',
  },
  status: (s) => {
    if (!s.pulse) return 'Unresponsive.';
    if (obstructing(s)) {
      if (s.vitals.gcs <= 12) return 'Drowsy: she mumbles and closes her eyes again.';
      return s.vitals.sbp >= 100 ? '"A little better… still light-headed, and so short of breath."' : '"I feel so faint… I can\'t get my breath."';
    }
    if (has(s, 'relieved')) return `"That's better. It still aches — about a ${s.vitals.pain}. Has anyone reached my daughter?"`;
    return `"It's like a weight on my chest — about a ${s.vitals.pain}. I keep seeing the policeman at the door."`;
  },
  respond: {
    consent: () => ({
      say: [['patient', '"No allergies, no blood thinners. Do whatever you have to… My daughter is on her way."']],
      flags: ['consent'],
    }),
    access: (s) => ({ say: [[operator(s), 'Right radial: 6 French sheath in.']], flags: ['access'] }),
    // a second bolus on top of the operator's would double the dose: refused, at no cost (as the aspirin EMS gave)
    heparin: (s) => (has(s, 'heparin')
      ? { blocked: true, say: [['system', 'Heparin 4,300 units is already in: a second bolus would double the dose. Check the ACT if you are unsure.']] }
      : { say: [['you', s.role === 4 ? 'Heparin 4,300 units IV (70 units/kg), the dose read back.' : 'Heparin 4,300 units IV (70 units/kg).']], flags: ['heparin'] }),
    aspirin: () => ({ blocked: true, say: [['system', 'She chewed aspirin 324 mg with EMS an hour ago: no second dose.']] }),
    angio: (s) => {
      const gate = angioGate(s);
      if (gate) return gate;
      if (!leftCatheter(s)) return { blocked: true, say: [['system', 'A JR4 sees only the right coronary: engage the left with a JL4 (or use a Tiger) first.']] };
      if (has(s, 'normal-coronaries')) return { say: [['you', 'Both coronaries again in standard views: smooth, no narrowing anywhere.']], image: { id: 'angio', view: 'Diagnostic angiography' }, flags: ['angio', 'cine'] };
      return { ...angioRun('you'), flags: ['angio', 'cine', 'normal-coronaries'] };
    },
    ...Object.fromEntries(LEFT_VIEWS.map((id) => [id, leftView(id)])),
    ...Object.fromEntries(RCA_VIEWS.map((id) => [id, rcaView(id)])),
    'cath-pigtail': (s) => {
      if (s.role !== 5) return null;
      if (!has(s, 'access')) return { blocked: true, say: [['system', 'No arterial access yet.']] };
      return { say: [['you', 'Pigtail over a J-wire, across the aortic valve, down to the apex.']], flags: ['pigtail', 'pigtail-in'] };
    },
    lvedp: (s) => {
      if (!has(s, 'pigtail-in')) return { blocked: true, say: [['system', s.role === 5 ? 'Put a pigtail across the aortic valve into the ventricle first.' : 'The operator has no catheter in the ventricle yet.']] };
      // the operator recorded it while the tech was busy: it is on the screen and on paper already
      if (has(s, 'pullback')) return { blocked: true, say: [['system', 'The pullback is already recorded: it is on the screen and on paper.']] };
      return pullback(s, 'learner');
    },
    'lv-gram': (s) => {
      if (!has(s, 'pigtail-in')) return { blocked: true, say: [['system', s.role === 5 ? 'Put a pigtail across the aortic valve into the ventricle first.' : 'The operator has no catheter in the ventricle yet.']] };
      if (has(s, 'ballooning') && has(s, 'lv-gram')) return { blocked: true, say: [['system', 'The LV gram is done: no more contrast for it.']] };
      // the tech fires the injector when the operator calls for it — not into a ventricle in shock, and not before the pressures
      if (s.role === 3 && !has(s, 'asked-lvgram')) {
        return { blocked: true, say: [['operator', has(s, 'pullback') ? 'Not while she\'s this low — fluid and pressure first. I\'ll call for the LV gram.' : 'Not yet — pressures first. I\'ll call for the LV gram.']] };
      }
      return lvGram(s, 'learner');
    },
    // the cardiologist's echo: the wall motion and the gradient, the mitral leaflet and what is not there (an effusion, a rupture)
    echo: (s) => {
      const g = gradientOf(s);
      // what is seen, not its name: naming it is the read
      const sam = g > 60
        ? 'In systole the anterior mitral leaflet swings forward and touches the septum, with a jet of moderate mitral regurgitation behind it.'
        : 'The anterior mitral leaflet still brushes toward the septum late in systole, with mild mitral regurgitation.';
      const ivc = (s.timers.boluses ?? 0) > 0 ? 'the IVC is normal in size' : 'the IVC is small and collapses with each breath';
      return {
        say: [['you', `Echo: the apex and the middle of the left ventricle are akinetic and ballooned, while the base is hyperdynamic. ${sam} Continuous-wave Doppler just below the aortic valve: a late-peaking, dagger-shaped signal, peak gradient about ${g} mmHg. LVEF about 35 %. No pericardial effusion, no septal rupture, no thrombus at the apex; the right ventricle squeezes normally; ${ivc}.`]],
        flags: ['echo', 'ballooning', 'lvoto-known', ...(has(s, 'obstructed') ? ['gradient-timed'] : [])],
        ...(has(s, 'lvoto-known') ? {} : { read: echoRead }),
      };
    },
    fluid: (s) => (s.pulse ? fluidEffect(s, 'learner') : null),
    'legs-up': (s) => {
      if (!s.pulse) return null;
      // about 300 mL back from the legs, once: a bridge to the bolus
      return withGradient(s, gradientOf(s) - (has(s, 'legs-up') ? 0 : 10), { lead: [['you', 'Table tilted a little head-down, legs raised.']], flags: ['legs-up'] });
    },
    // a unit of blood is volume too (and there is no bleeding: the built-in rule scores it)
    transfuse: (s) => (s.pulse ? withGradient(s, gradientOf(s) - 15, { lead: [['you', 'A unit of packed red cells running through the warmer.']], flags: ['transfused'] }) : null),
    phenylephrine: (s) => (s.pulse ? phenylephrineEffect(s) : null),
    metoprolol: (s) => {
      if (!s.pulse) return null;
      // nobody orders it in this case: no dose to read back
      const lead: Line[] = [['you', 'Metoprolol 5 mg IV over 2 minutes.']];
      // once the pressure is back it slows the rate and calms the base, so the gradient falls. Before that — in shock, or before
      // anyone knows why — what it takes off the gradient it takes off the stunned apex's squeeze too: the rate slows, the
      // pressure does not come up (InterTAK 2018: contraindicated with hypotension and acute heart failure with a low EF)
      if (!has(s, 'relieved')) {
        const after: Line[] = s.role === 5 && !has(s, 'lvoto-known')
          ? [line('team', 'Nurse: "Metoprolol — before we know what her heart is doing?"', 'warn')]
          : has(s, 'obstructed') ? [line('monitor', 'The rate slows, but the pressure does not come up.', 'warn')] : [];
        return withGradient(s, gradientOf(s), { lead, after, hrShift: hrShiftOf(s) - 12, flags: ['beta-blocker'] });
      }
      return withGradient(s, gradientOf(s) - 15, { lead, hrShift: hrShiftOf(s) - 12, flags: ['beta-blocker'] });
    },
    diltiazem: (s) => {
      if (!s.pulse) return null;
      // it slows the rate a little, but it weakens the stunned ventricle and dilates the vessels: the afterload that holds the
      // outflow tract open falls
      return withGradient(s, gradientOf(s) + 10, { lead: [['you', 'Diltiazem IV over 2 minutes.']], hrShift: hrShiftOf(s) - 8, flags: ['diltiazem'] });
    },
    pressor: (s) => {
      if (!s.pulse) return null;
      const after: Line[] = [s.role === 5
        ? line('team', 'Nurse: "Doctor — she\'s lower on it, and that murmur is louder. I\'m turning it off."', 'warn')
        : line('operator', 'She\'s worse on it — the base is whipping harder. Turn it off!', 'warn')];
      return withGradient(s, gradientOf(s) + 15, { lead: [['you', 'Norepinephrine started at 0.1 mcg/kg/min.']], after, flags: ['pressor', 'catecholamine'] });
    },
    'push-epi': (s) => {
      if (!s.pulse) return null;
      return withGradient(s, gradientOf(s) + 20, { lead: [['you', 'Push-dose epinephrine 20 mcg IV.']], after: [nurse(s, 'The murmur is roaring now.', 'bad')], flags: ['push-epi', 'catecholamine'] });
    },
    epinephrine: (s) => {
      if (!s.pulse) return null;
      return withGradient(s, gradientOf(s) + 35, { lead: [['you', 'Epinephrine 1 mg IV.']], after: [nurse(s, 'Her heart is racing and the murmur is roaring — she\'s gray.', 'bad')], flags: ['epi-with-pulse', 'catecholamine'] });
    },
    'ic-epinephrine': (s) => {
      if (!s.pulse) return null;
      if (s.role !== 5) return unasked(s, 'Epinephrine 100 mcg for the guide');
      return withGradient(s, gradientOf(s) + 20, { lead: [['you', 'Epinephrine 100 mcg down the catheter.']], flags: ['ic-epinephrine', 'catecholamine'] });
    },
    nitro: (s) => {
      if (!s.pulse) return null;
      return withGradient(s, gradientOf(s) + 20, { lead: [['you', 'Nitroglycerin 0.4 mg sublingual.']], vitals: { pain: Math.max(0, s.vitals.pain - 1) }, flags: ['nitro', 'nitrate'] });
    },
    'nitro-high': (s) => {
      if (!s.pulse) return null;
      return withGradient(s, gradientOf(s) + 30, { lead: [['you', 'Nitroglycerin 0.8 mg sublingual.']], vitals: { pain: Math.max(0, s.vitals.pain - 1) }, flags: ['nitro', 'nitro-high', 'nitrate'] });
    },
    'ic-nitro': (s) => {
      if (!s.pulse) return null;
      if (s.role !== 5) return unasked(s, 'Nitroglycerin 200 mcg for the catheter');
      if (!has(s, 'catheter') && !has(s, 'pigtail-in')) return { blocked: true, say: [['system', 'There is no catheter in yet.']] };
      return withGradient(s, gradientOf(s) + 15, { lead: [['you', 'Nitroglycerin 200 mcg down the catheter.']], flags: ['ic-nitro', 'nitrate'] });
    },
    'radial-cocktail': (s) => {
      if (!s.pulse) return null;
      if (!has(s, 'access')) return { blocked: true, say: [['system', 'There is no radial sheath in yet.']] };
      if (s.role !== 5 && has(s, 'obstructed')) return unasked(s, 'The radial cocktail');
      // verapamil and nitroglycerin through the sheath: routine before the fall, a little afterload and preload lost
      return withGradient(s, gradientOf(s) + 10, { lead: [['you', 'Radial cocktail through the sheath: verapamil 2.5 mg and nitroglycerin 200 mcg.']], flags: ['cocktail', 'nitrate'] });
    },
    sedation: (s) => {
      if (!s.pulse || !has(s, 'obstructed')) return null;
      return withGradient(s, gradientOf(s) + 10, { lead: [['you', 'Sedated: midazolam and fentanyl, a little at a time.']], flags: ['sedation', 'sedation-worse'] });
    },
    midazolam: (s) => {
      if (!s.pulse) return null;
      // it drops the preload and the afterload a little, and each dose leaves her drowsier (as the engine's default does)
      const gcs = Math.min(s.vitals.gcs, Math.max(12, 14 - (s.counts.midazolam ?? 0)));
      return withGradient(s, gradientOf(s) + (obstructing(s) ? 10 : 5), {
        lead: [['you', 'Midazolam 1 mg IV.']], vitals: { gcs, rr: Math.min(s.vitals.rr, Math.max(10, s.vitals.rr - 2)) }, flags: ['benzodiazepine', 'sedation'],
      });
    },
    iabp: (s) => {
      if (s.role === 3) {
        if (has(s, 'lvoto-known')) return { say: [['you', 'IABP console set up and the balloon prepped.'], ['operator', 'Put that away — a balloon pump drops her afterload: it would make the obstruction worse.', 'warn']], flags: ['iabp-ready'] };
        if (obstructing(s)) return { say: [['you', 'IABP console set up and the balloon prepped.'], ['operator', 'Hold that — I don\'t know yet why she\'s dropped.']], flags: ['iabp-ready'] };
        return null;
      }
      if (!s.pulse) return null;
      return withGradient(s, gradientOf(s) + 20, {
        lead: [['you', 'IABP in from the right femoral artery, 1:1.']],
        after: [['you', 'The diastolic augments, but the systolic falls and the murmur gets louder: with the afterload dropped, the base empties the ventricle even faster.', 'bad']],
        flags: ['iabp', 'mcs'],
      });
    },
    impella: (s) => {
      if (s.role === 3) {
        if (obstructing(s) && !(has(s, 'fluid') && has(s, 'phenylephrine'))) return { say: [['you', 'Impella console primed, purge running; large-bore sheath and closure sutures open.'], ['operator', 'Keep it on standby — fluid and phenylephrine first.']], flags: ['impella-ready'] };
        return null;
      }
      if (!s.pulse) return null;
      return withGradient(s, gradientOf(s) - 50, {
        lead: [['you', 'Impella CP from the right femoral artery, across the aortic valve: flow 2.8 L/min.']],
        // what it does, said only once the gradient is known (before that, nobody has named it)
        after: [['you', has(s, 'lvoto-known')
          ? 'The pump carries blood from the apex past the narrowed outflow tract; with it in place the gradient and the leak fall away (as in published cases).'
          : 'The pressure comes up with the pump\'s flow.']],
        flags: ['impella', 'mcs'],
      });
    },
    pericardiocentesis: (s) => {
      if (s.role !== 5) return null;
      return { say: [['you', 'Needle in below the xiphoid under echo: no fluid comes back — there is no effusion. The needle comes out.', 'bad']], flags: ['pericardiocentesis-dry'] };
    },
    ...Object.fromEntries(TECH_PCI.map((id) => [id, (s: SimState) => techDevice(s, id)])),
    callout: (s) => {
      const { sbp, dbp } = s.vitals;
      if (obstructing(s) && !has(s, 'drop-called')) {
        const pre = s.timers.preSbp ?? 106;
        return s.role === 4
          ? { say: [['you', `"Doctor — ${sbp} over ${dbp}, heart rate ${s.rhythm.hr}, and she has a new loud systolic murmur at the left sternal edge!"`], ['operator', 'Thanks — keep calling it.']], flags: ['callout', 'drop-called'] }
          : { say: [['you', `"Pressure's ${sbp} over ${dbp} — down from ${pre}. Heart rate ${s.rhythm.hr}!"`], ['operator', 'I see it — thanks. Keep calling it.']], flags: ['callout', 'drop-called'] };
      }
      if (s.role === 3 && has(s, 'pullback') && !has(s, 'gradient-called')) {
        return { say: [['you', `"Gradient of ${s.timers.recorded ?? gradientOf(s)} — inside the ventricle, below the valve."`], ['operator', 'Agreed.']], flags: ['callout', 'gradient-called'] };
      }
      if (has(s, 'relieved') && !has(s, 'relief-called')) return { say: [['you', `"${sbp} over ${dbp} now, heart rate ${s.rhythm.hr}."`], ['operator', 'Good. Keep calling it.']], flags: ['callout', 'relief-called'] };
      return null;
    },
    // the band goes on when the operator pulls the sheath, at the end
    hemostasis: (s) => (has(s, 'proc-over') ? null : { blocked: true, say: [['system', 'The sheath is still in and the operator is still working: the radial band goes on when the sheath comes out.']] }),
    handoff: (s) => {
      if (!s.pulse || !has(s, 'relieved') || !has(s, 'ballooning') || (s.role !== 5 && !has(s, 'proc-over'))) return null;
      return { say: [['you', handoffText(s)]], flags: ['handoff'] };
    },
  },
  events: [
    // EMS's IV and aspirin come with her
    { id: 'arrival', when: () => true, effect: () => ({ flags: ['iv', 'aspirin'] }) },
    {
      id: 'tech-setup', when: (s) => s.role !== 3,
      effect: () => ({ say: [['team', 'Tech: both radials and the right groin prepped and draped, transducers zeroed and leveled, monitor and defibrillator pads on.']], flags: ['prep', 'transducer', 'monitor', 'pads'] }),
    },
    {
      id: 'rn-setup-for-tech', when: (s) => s.role === 3,
      effect: () => ({ say: [['team', 'Nurse: consent and allergies checked — no allergies, no blood thinners; the EMS IV flushes well; heparin 4,300 units given on the cardiologist\'s order.']], flags: ['consent', 'heparin', 'monitor'] }),
    },
    {
      id: 'rn-setup-for-md', when: (s) => s.role === 5,
      effect: () => ({ say: [['team', 'Nurse: the EMS IV flushes well and labs are drawn. Waiting for your orders.']], flags: ['labs'] }),
    },
    {
      // a STEMI cannot wait: by 6 minutes the operator leads the time-out (and checks the consent) the learner never ran
      id: 'team-timeout', when: (s) => s.role !== 5 && s.minute >= 6 && !(has(s, 'timeout') && has(s, 'consent')),
      effect: (s) => ({
        say: [
          ...(!has(s, 'consent') ? [line('operator', 'I\'ve confirmed her consent and allergies with her myself.', 'warn')] : []),
          ...(!has(s, 'timeout') ? [line('operator', 'We can\'t wait any longer — time-out, everyone: patient, procedure, site, allergies, anticoagulation.', 'warn')] : []),
        ],
        flags: ['consent', 'timeout'],
      }),
    },
    {
      id: 'md-access', when: (s) => s.role !== 5 && has(s, 'timeout') && has(s, 'consent') && anticoagulated(s) && !has(s, 'access'),
      effect: () => ({ say: [['operator', 'Right radial: 6 French sheath in.']], flags: ['access'] }),
    },
    {
      // the operator's diagnostic pictures: once the tech has handed the catheter (with the nurse: a minute after access)
      id: 'md-angio',
      when: (s) => s.role !== 5 && has(s, 'access') && !has(s, 'angio') && (s.role === 3 ? has(s, 'diag-in-hand') : s.minute >= s.flags.access + 1),
      effect: () => ({ ...angioRun('operator'), flags: ['angio', 'catheter', 'cine', 'normal-coronaries'] }),
    },
    {
      // the contrast, the catecholamine surge and a night without fluids: the hyperdynamic base closes its own outflow tract
      id: 'drop', when: (s) => s.pulse && has(s, 'normal-coronaries') && !has(s, 'obstructed') && picturesDone(s),
      effect: (s) => {
        const g = gradientOf(s) + DROP_ADDS;
        const bp = pressureFor(Math.min(120, g));
        // a harsh crescendo–decrescendo murmur, the sound of a gradient building through systole (a holosystolic one at the
        // same spot would point to a septal rupture instead)
        const murmur: Line = s.role === 4
          ? ['you', 'At her side you hear something new: a loud, harsh crescendo–decrescendo systolic murmur at the left lower sternal edge. Neither the crew nor the ED heard a murmur.', 'warn']
          : s.role === 3
            ? ['team', 'Nurse: "She has a new murmur — loud and harsh, rising and falling in systole, at the left sternal edge. Nobody heard that in the ED."', 'warn']
            : ['team', `Nurse: "Doctor — ${bp.sbp} over ${bp.dbp}, and she has a new murmur: loud and harsh, rising and falling in systole, at the left sternal edge. Nobody heard that in the ED."`, 'warn'];
        return withGradient(s, g, {
          lead: [[runner(s), `${s.minute >= s.flags['normal-coronaries'] + 1 ? 'A minute after the run' : 'As the last run clears'}, she groans and her face goes gray.`]],
          after: [...awake(s, 'I\'m going to pass out… I can\'t get my breath.'), murmur],
          // a gradient already measured before the fall counts as known at the fall (the review times it from there)
          vitals: { pain: Math.max(s.vitals.pain, 6), spo2: Math.min(s.vitals.spo2, 94) },
          flags: ['obstructed', ...(has(s, 'lvoto-known') ? ['gradient-timed'] : [])], timers: { preSbp: s.vitals.sbp },
        });
      },
    },
    {
      id: 'md-pigtail', when: (s) => s.role === 3 && has(s, 'pigtail-in-hand') && !has(s, 'pigtail-in'),
      effect: () => ({ say: [['operator', 'Pigtail over a J-wire, across the aortic valve, down to the apex.']], flags: ['pigtail', 'pigtail-in'] }),
    },
    {
      // the nurse's call brings the operator into the ventricle at once; silence costs a minute
      id: 'md-pullback-for-rn',
      when: (s) => s.role === 4 && has(s, 'obstructed') && !has(s, 'lvoto-known') && (doneAfter(s, ['callout'], 'obstructed') !== null || s.minute >= s.flags.obstructed + 2),
      effect: (s) => {
        const e = pullback(s, 'operator');
        // the nurse who treated the fall on her own still gets the measurement: why it fell decides what she must never be given
        const lead: Line = !obstructing(s)
          ? ['operator', 'Her pressure is back — but I want to know why it fell. Pigtail across the valve to the apex.']
          : has(s, 'drop-called')
            ? ['operator', 'Clean arteries, ST elevation, and now this with a new murmur. Pigtail across the valve to the apex.']
            : ['operator', 'Who\'s watching her pressure? Clean arteries, ST elevation, and now this. Pigtail across the valve to the apex.', 'warn'];
        return { ...e, say: [lead, ...(e.say ?? [])], flags: [...(e.flags ?? []), 'pigtail', 'pigtail-in'] };
      },
    },
    ...TECH_ASKS.flatMap(askEvents),
    ...RN_ASKS.flatMap(askEvents),
    {
      // the operator orders, the nurse gives (the tech's case): fluid wide open and phenylephrine
      id: 'rn-treats-for-tech', when: (s) => s.role === 3 && gradientRead(s) && obstructing(s) && !has(s, 'rn-treated'),
      // titrated to effect: saline wide open and phenylephrine boluses until the gradient is down
      effect: (s) => titrated(s, [
        ['operator', 'That\'s a gradient inside the ventricle — she\'s obstructing. Saline 500 wide open, and phenylephrine 100, please.'],
        ['team', 'Nurse: "Saline running wide open; phenylephrine 100 micrograms in."'],
      ], ['fluid', 'rn-treated'], { boluses: (s.timers.boluses ?? 0) + 1 }),
    },
    {
      // the operator measures first, then films the ventricle
      id: 'md-lvgram-for-rn', when: (s) => s.role === 4 && has(s, 'lvoto-known') && has(s, 'relieved') && !has(s, 'ballooning')
        && s.minute >= Math.max(s.flags.relieved, s.flags['lvoto-known']) + 1,
      effect: (s) => lvGram(s, 'operator'),
    },
    {
      id: 'md-done', when: (s) => s.role !== 5 && has(s, 'lvoto-known') && has(s, 'relieved') && has(s, 'ballooning') && !has(s, 'proc-over'),
      effect: () => ({ say: [['operator', 'Clean coronaries, and a ventricle that tells the story: nothing to stent. Pigtail out, sheath out.']], flags: ['proc-over'] }),
    },
    {
      // something helped, but not enough: the nurse says so once (the cardiologist decides what is next)
      id: 'not-enough', when: (s) => s.role === 5 && obstructing(s) && helped(s) && s.minute >= (s.timers.lastHelp ?? 0) + 2,
      effect: (s) => ({ say: [['team', `Nurse: "Still ${s.vitals.sbp} over ${s.vitals.dbp}, doctor — and she still has that murmur."`, 'warn']] }),
    },
    {
      // nothing has filled the ventricle or raised the afterload since the fall: the gradient keeps climbing
      id: 'worse', when: (s) => s.pulse && obstructing(s) && !helped(s) && s.minute >= s.flags.obstructed + 4,
      effect: (s) => withGradient(s, gradientOf(s) + 15, {
        after: [...awake(s, 'Everything\'s going gray…'), ...(s.role === 5 ? [line('team', 'Nurse: "Doctor — she\'s still dropping."', 'warn')] : [])],
        vitals: { gcs: Math.min(s.vitals.gcs, 14) },
      }),
    },
    {
      id: 'worse-2', when: (s) => s.pulse && obstructing(s) && !helped(s) && s.minute >= s.flags.obstructed + 8,
      effect: (s) => withGradient(s, gradientOf(s) + 15, {
        after: [['team', 'She is drowsy now, her knees mottled.', 'bad']],
        vitals: { gcs: Math.min(s.vitals.gcs, 12), spo2: Math.min(s.vitals.spo2, 92) },
      }),
    },
  ],
  critical: [
    { id: 'consent', label: 'Consent, contrast allergy and anticoagulants checked', why: 'Even in a STEMI, confirm consent and allergies with the patient before access — she can give them.', done: ['consent'], roles: [4, 5], points: 5, target: { by: 6 } },
    { id: 'timeout', label: 'Procedural time-out before access', why: 'The time-out catches wrong-patient, wrong-procedure and allergy errors before anyone punctures an artery.', done: ['timeout'], points: 5, target: { by: 6 } },
    { id: 'prep', label: 'Prep and drape the radial and femoral sites', why: 'Radial first, with a groin ready in case she needs a pump.', done: ['prep'], roles: TECH, points: 5, target: { by: 6 } },
    { id: 'transducer', label: 'Zero and level the transducers', why: 'The gradient you will record is only as true as the zero: transducers zeroed to air and leveled at the phlebostatic axis.', done: ['transducer'], roles: TECH, points: 10, target: { by: 6 } },
    { id: 'pads', label: 'Defibrillator pads on before the catheter goes in', why: 'A STEMI alert on the table can fibrillate at any moment: pads on before the first catheter.', done: PADS, roles: TECH, points: 5, target: { by: 8 } },
    askCritical(TECH_ASKS[0]),
    askCritical(RN_ASKS[0]),
    {
      id: 'md-heparin', label: 'Heparin for the STEMI before the catheters go in', roles: MD, points: 5, target: { by: 10 },
      why: 'Until the angiogram says otherwise this is a STEMI: anticoagulate at the start (unfractionated heparin 70–100 units/kg, which also protects the radial artery).',
      done: (s) => {
        const m = firstDone(s, ['heparin', 'bivalirudin']);
        return m !== null && (s.flags['normal-coronaries'] === undefined || m < s.flags['normal-coronaries']) ? m : null;
      },
      uses: ['heparin', 'bivalirudin'],
    },
    { id: 'access', label: 'Arterial access (radial first)', why: 'Radial access cuts bleeding in a STEMI.', done: ['access', 'access-femoral'], roles: MD, points: 5, target: { by: 12 } },
    { id: 'md-angio', label: 'Diagnostic angiography: look for the culprit', why: 'Angiography as early as possible after a STEMI alert: only the angiogram tells Takotsubo from an anterior STEMI, and it decides what she needs.', done: ['angio', ...LEFT_VIEWS], roles: MD, points: 10, target: { by: 15 } },
    { id: 'callout-drop', label: 'Call out the falling pressure at once', why: 'A pressure that falls from 106 to about 80 with a new murmur, right after clean arteries: say it out loud so the whole team turns to it. Closed loop: the numbers, and what you hear.', done: ['callout'], after: 'obstructed', roles: [3, 4], points: 10, target: { within: { flag: 'obstructed', minutes: 1 } }, applies: (s) => has(s, 'obstructed') },
    askCritical(TECH_ASKS[1]),
    askCritical(TECH_ASKS[2]),
    { id: 'callout-gradient', label: 'Call out the gradient', why: 'Say what the recording shows, out loud: the number, and where the pressure drops — inside the ventricle, below the valve. The whole team needs it before anyone reaches for a drug.', done: ['callout'], after: 'pullback', roles: TECH, points: 5, target: { within: { flag: 'pullback', minutes: 1 } }, applies: (s) => has(s, 'pullback') },
    {
      id: 'md-gradient', label: 'Measure the gradient: a pigtail pullback or an echo', roles: MD, points: 15, applies: (s) => has(s, 'obstructed'),
      target: { within: { flag: 'obstructed', minutes: 4 } },
      why: 'A Takotsubo patient whose pressure falls must be checked for outflow obstruction (about 1 in 5): a careful pullback of the pigtail from the apex, or continuous-wave Doppler on an echo (InterTAK 2018). Obstruction and a failing pump look the same at the bedside and need opposite drugs.',
      done: ['lvedp', 'echo'],
    },
    askCritical(RN_ASKS[1]),
    askCritical(RN_ASKS[2]),
    {
      id: 'md-fluid', label: 'Fill the ventricle: a fluid bolus', roles: MD, points: 10, applies: (s) => has(s, 'obstructed'),
      target: { within: { flag: 'obstructed', minutes: 5 } },
      why: 'With clear lungs and an LVEDP of 14, volume is the first treatment for dynamic outflow obstruction: a fuller ventricle holds its outflow tract open. (Diuretics do the opposite.)',
      done: ['fluid'],
    },
    {
      id: 'md-phenylephrine', label: 'Raise the afterload: phenylephrine', roles: MD, points: 15,
      target: { within: { flag: 'obstructed', minutes: 6 } },
      why: 'A vasoconstrictor with no inotropic effect raises the afterload that holds the outflow tract open, and slows the rate a little (2024 AHA/ACC HCM guideline for hypotension with outflow obstruction that fluid does not fix). Epinephrine, norepinephrine and dopamine drive the base harder.',
      done: ['phenylephrine'],
      // the obstruction relieved without it (volume and a beta-blocker once the pressure allowed) needs none
      applies: (s) => has(s, 'obstructed') && !(has(s, 'relieved') && (firstDone(s, ['phenylephrine']) ?? Infinity) > s.flags.relieved),
    },
    askCritical(TECH_ASKS[3]),
    {
      id: 'md-lv', label: 'Look at the ventricle: an LV gram or an echo', roles: MD, points: 5,
      why: 'With ST elevation and clean coronaries, the wall motion is the diagnosis: an apex that balloons over a hyperdynamic base, reaching beyond any one coronary territory, is Takotsubo (the LV gram is part of the work-up, InterTAK 2018).',
      done: (s) => (has(s, 'ballooning') ? firstDone(s, ['lv-gram', 'echo']) : null), uses: ['lv-gram', 'echo'],
    },
    askCritical(RN_ASKS[3]),
    askCritical(RN_ASKS[4]),
    { id: 'post-ecg', label: '12-lead once she is stable: the QTc', why: 'Takotsubo is an acquired long QT: the T waves invert and the QT lengthens over the next days, and torsades is most likely on days 2 to 4. A 12-lead now gives the unit its baseline QTc.', done: ['ecg12', 'ecg12-repeat'], after: 'relieved', points: 5, applies: (s) => has(s, 'relieved') },
    { id: 'hemostasis', label: 'Radial band and distal perfusion check', why: 'Patent hemostasis, as always — she has had heparin and aspirin.', done: ['hemostasis'], after: 'proc-over', roles: [3, 4], points: 5, applies: (s) => has(s, 'proc-over') },
    { id: 'handoff', label: 'Hand-off to the cardiac care unit', why: 'What was found and done, what never to give her (inotropes, nitrates, diuretics, a balloon pump), the QTc and the electrolytes, the echo tomorrow — and that she has just lost her husband.', done: ['handoff'], roles: [4, 5], points: 5 },
  ],
  harms: [
    { id: 'access-no-timeout', actions: ['access', 'access-femoral'], when: (s) => !has(s, 'timeout'), points: 5, severity: 'major', text: 'Arterial access before the time-out.' },
    { id: 'access-no-consent', actions: ['access', 'access-femoral'], when: (s) => !has(s, 'consent'), points: 5, severity: 'major', text: 'Access before confirming consent and allergies in an awake patient who can give them.' },
    { id: 'catecholamine-lvoto', actions: ['pressor', 'push-epi'], roles: [4, 5], when: (s) => s.pulse, points: 10, severity: 'major', text: CATECHOLAMINE_TEXT },
    { id: 'catecholamine-lvoto-ic', actions: ['ic-epinephrine'], roles: MD, when: (s) => s.pulse, points: 10, severity: 'major', text: CATECHOLAMINE_TEXT },
    { id: 'nitrate-lvoto', actions: ['nitro', 'nitro-high'], roles: [4, 5], replaces: NITRATE_RULES, when: (s) => s.pulse && has(s, 'obstructed'), points: 10, severity: 'major', text: NITRATE_TEXT },
    { id: 'nitrate-lvoto-ic', actions: ['ic-nitro', 'radial-cocktail'], roles: MD, when: (s) => s.pulse && has(s, 'obstructed'), replaces: NITRATE_RULES, points: 10, severity: 'major', text: NITRATE_TEXT },
    // the built-in rule, kept for the time before the fall (afterwards nitrate-lvoto covers it): one mistake, one penalty
    { id: 'nitro-high-not-hypertensive', actions: ['nitro-high'], when: (s) => s.pulse && !has(s, 'obstructed') && s.vitals.sbp >= 90 && s.vitals.sbp < 160, points: 3, severity: 'minor', replaces: nitrateRulesExcept('nitro-hypotension', 'nitro-high-not-hypertensive'), text: 'High-dose nitroglycerin without a high blood pressure. 0.8 mg is for hypertensive pulmonary edema with a systolic of 160 or more; below that step down to 0.4 mg, and hold nitrates when the pressure is low.' },
    { id: 'unasked-ic-drug', actions: ['ic-nitro', 'ic-epinephrine', 'radial-cocktail'], roles: [3, 4], when: (s) => has(s, 'obstructed'), replaces: NITRATE_RULES, points: 3, severity: 'minor', text: 'A vasodilator or a catecholamine drawn up for the catheter without an order, while her pressure was down. The operator gives what the operator asks for — and a nitrate or epinephrine would make the outflow obstruction worse.' },
    { id: 'iabp-lvoto', actions: ['iabp'], roles: MD, points: 15, severity: 'critical', text: 'An intra-aortic balloon pump in Takotsubo with outflow obstruction. Its deflation drops the afterload just as the ventricle ejects: the base empties the ventricle faster, the outflow tract narrows, and the gradient and the pressure get worse. Avoid it whenever there is an outflow gradient; if fluid and phenylephrine fail, the support is an Impella (it carries blood past the obstruction) or VA-ECMO.' },
    { id: 'tech-iabp', actions: ['iabp'], roles: TECH, when: (s) => has(s, 'lvoto-known'), points: 3, severity: 'minor', text: 'The balloon pump readied once the gradient was on the screen. A balloon pump lowers the afterload and makes outflow obstruction worse: open devices when the operator asks for them.' },
    { id: 'mcs-first', actions: ['impella'], roles: MD, when: (s) => !(obstructing(s) && has(s, 'fluid') && has(s, 'phenylephrine')), points: 5, severity: 'major', text: 'An Impella without refractory shock: before fluid and phenylephrine had been tried, or with her pressure already back. Large-bore femoral access brings bleeding, limb ischemia and hemolysis, and outflow obstruction in Takotsubo usually answers to volume and afterload within minutes: mechanical support is for the patient they fail.' },
    { id: 'bb-before-diagnosis', actions: ['metoprolol'], roles: [4, 5], when: (s) => s.pulse && !has(s, 'lvoto-known'), points: 8, severity: 'major', text: 'IV metoprolol before anyone knew why her heart was failing. In COMMIT early IV metoprolol raised the risk of cardiogenic shock, most in older patients with a fast rate and a systolic under 120 — like her; in an ACS the beta-blocker is started by mouth once there are no signs of heart failure, low output or shock risk. In Takotsubo it is contraindicated with hypotension or acute heart failure with a low ejection fraction (InterTAK 2018). It can help only once outflow obstruction is proven and the pressure is back — and then a short-acting one, carefully.' },
    // in shock is more than a number: cool and clammy with a systolic of 91 after a fall to 79 is no recovered pressure
    { id: 'bb-hypotension', actions: ['metoprolol'], roles: [4, 5], when: (s) => s.pulse && has(s, 'lvoto-known') && (obstructing(s) || s.vitals.sbp < 90), points: 8, severity: 'major', text: 'A beta-blocker while she was still in shock. It can lower the gradient by slowing the rate and calming the base, but in Takotsubo it is contraindicated with hypotension, acute heart failure with a low ejection fraction or bradycardia (InterTAK 2018): it weakens the stunned apex as much as it calms the base — and IV metoprolol lasts hours. Fluid and phenylephrine first; once the pressure is back, a low dose of a short-acting beta-1 blocker (esmolol) if she stays fast.' },
    // her fast rate is sinus, a heart compensating: diltiazem has nothing to treat at any point of the case
    { id: 'diltiazem-takotsubo', actions: ['diltiazem'], roles: [4, 5], when: (s) => s.pulse, points: 8, severity: 'major', text: 'Diltiazem for a sinus tachycardia in a failing heart. Her fast rate is the heart compensating, not an arrhythmia to slow. A calcium-channel blocker weakens the stunned ventricle (EF about 35 %: IV diltiazem is harmful with a reduced ejection fraction, 2023 ACC/AHA/ACCP/HRS AF guideline) and dilates the vessels, dropping the afterload that holds the outflow tract open (verapamil is potentially harmful with obstruction and hypotension, 2024 AHA/ACC HCM guideline).' },
    { id: 'no-culprit-pci', actions: TECH_PCI, roles: MD, when: (s) => has(s, 'normal-coronaries'), points: 8, severity: 'major', text: 'A guide, wire, balloon or stent with no culprit lesion. The coronaries are clean: there is nothing to open, and every device in a normal artery risks a dissection. The ST elevation comes from the muscle, not an artery — look at the ventricle.' },
    { id: 'tech-unasked-device', actions: TECH_PCI, roles: TECH, when: (s) => has(s, 'normal-coronaries'), points: 3, severity: 'minor', text: 'A guide, wire, balloon or stent opened with no culprit lesion. The operator did not ask for it and the arteries are clean: open devices when the operator asks for them.' },
    { id: 'antiplatelet-no-acs', actions: ['p2y12', 'cangrelor', 'gp2b3a'], roles: [4, 5], when: (s) => has(s, 'normal-coronaries'), points: 4, severity: 'minor', text: 'A P2Y12 or GP IIb/IIIa inhibitor after the angiogram showed clean coronaries. There is no plaque rupture and no stent to protect: it adds only bleeding.' },
    { id: 'lytic-lab', actions: ['tnk'], roles: MD, points: 15, severity: 'critical', replaces: LYTIC_RULES, text: 'A fibrinolytic in the cath lab, with the arteries on the screen. There is no clot to dissolve — only a bleeding risk (intracranial in about 1 in 100), on top of heparin and aspirin.' },
    { id: 'pericardiocentesis-no-effusion', actions: ['pericardiocentesis'], roles: MD, points: 15, severity: 'critical', text: 'A pericardiocentesis without an effusion. The low pressure comes from inside the ventricle, and the needle can puncture the right ventricle or a coronary artery. Look first: an echo shows the pericardium and the outflow tract within a minute.' },
    { id: 'sedation-low-pressure', actions: ['sedation'], roles: [4, 5], when: (s) => s.pulse && (obstructing(s) || s.vitals.sbp < 90), points: 5, severity: 'major', replaces: SEDATIVE_RULES, text: 'Sedation while her pressure was down. Sedatives and opioids in sedating doses dilate the veins and the arteries: less preload and less afterload, a bigger gradient and a lower pressure.' },
    // same id as the built-in rule (which waits for a systolic of 120): before the fall her 106 needed no vasoconstrictor either
    { id: 'phenylephrine-no-hypotension', actions: ['phenylephrine'], roles: [4, 5], when: (s) => s.pulse && (!has(s, 'obstructed') || s.vitals.sbp >= 120), points: 3, severity: 'minor', text: 'Phenylephrine without a low blood pressure. It is a pure vasoconstrictor for hypotension — here, the fall with outflow obstruction; before the fall, or with a systolic of 120 or more, it only loads a ventricle under stress and slows the heart.' },
    rnNoOrder('phenylephrine', ['phenylephrine'], 'Phenylephrine', (s) => has(s, 'obstructed') && !phenylephrineOrdered(s)),
    // before the gradient is known, or in shock, the beta-blocker rules above score it
    rnNoOrder('metoprolol', ['metoprolol'], 'IV metoprolol', (s) => has(s, 'lvoto-known') && has(s, 'relieved')),
    // after the fall nitrate-lvoto scores it; 0.8 mg is scored by nitro-high-not-hypertensive
    { ...rnNoOrder('nitro', ['nitro'], 'Sublingual nitroglycerin', (s) => !has(s, 'obstructed')), replaces: nitrateRulesExcept('nitro-hypotension') },
    // after the clean pictures antiplatelet-no-acs scores it
    rnNoOrder('antiplatelet', ['p2y12', 'cangrelor', 'gp2b3a'], 'An antiplatelet loading dose', (s) => !has(s, 'normal-coronaries')),
    { id: 'oxygen-normoxic', actions: ['o2-nc', 'o2-nrb'], when: (s) => s.pulse && s.vitals.spo2 >= 90, points: 2, severity: 'minor', text: 'Oxygen with an SpO₂ of 90 % or more. Oxygen is for SpO₂ below 90 % (2025 ACC/AHA ACS).' },
    askHarm(TECH_ASKS[0], 'The wrong catheter when the operator asked for one that does both coronaries from the radial (a Tiger). A JL4 or a JR4 does one side; a guide is for an intervention.'),
    // a guide has its own penalty once the arteries are known to be clean (tech-unasked-device): the ask's harm is the diagnostic catheters
    { ...askHarm(TECH_ASKS[1], 'A coronary catheter when the operator asked for a pigtail. The coronaries are clean: the answer is in the ventricle.'), actions: ['cath-jl4', 'cath-jr4'] },
    { ...askHarm(RN_ASKS[0], 'Not the drug the operator ordered: unfractionated heparin, 4,300 units. Read the order back before you give it.'), replaces: [...ANTITHROMBOTIC_RULES, ...PROTAMINE_RULES] },
    { ...askHarm(RN_ASKS[4], 'Midazolam when the operator asked for something for the pain. A benzodiazepine calms; it does not treat pain — and it drops the pressure.', 2), actions: ['midazolam'] },
  ],
  timings: [
    { label: 'Time-out', actions: ['timeout'], target: 6 },
    { label: 'Gradient measured after the fall', actions: [], flag: 'gradient-timed', target: 3, from: 'obstructed' },
    { label: 'Pressure back up', actions: [], flag: 'relieved', target: 8, from: 'obstructed' },
  ],
  completeWhen: (s) => has(s, 'relieved') && has(s, 'ballooning') && (s.role === 5 || has(s, 'proc-over')),
  teaching: [
    'Takotsubo syndrome: a sudden, usually reversible stunning of the left ventricle after an emotional or physical stress — about 9 in 10 patients are women, most of them after menopause. Its ST elevation (centered on V2–V5, little in V1, usually no reciprocal change) can look exactly like an anterior STEMI: treat it as a STEMI — aspirin, heparin, the cath lab — until the angiogram shows clean arteries (InterTAK 2018).',
    'Clean coronaries with a STEMI: look at the ventricle. Typical Takotsubo: the apex and the mid-ventricle balloon and do not move while the base squeezes hard, the still segments reaching beyond any one coronary territory; the troponin is modest for the size of the wall-motion change, the BNP high.',
    'About 1 in 5 develop dynamic LV outflow tract obstruction: the hyperdynamic base narrows its own outflow tract and pulls the anterior mitral leaflet into it (systolic anterior motion), with mitral regurgitation. Signs: a falling pressure, a fast rate and a new harsh systolic murmur. Measure it in every Takotsubo patient whose pressure falls — a careful pigtail pullback from the apex (the pressure drops below the valve, not across it), or continuous-wave Doppler on an echo.',
    'Treat it by filling and squeezing: a fluid bolus when the lungs are clear and the LVEDP is not high (500 mL at a time, listening to the lungs: a stunned ventricle floods them once it has had about a liter), then a vasoconstrictor with no inotropic effect — phenylephrine 50–100 mcg boluses or an infusion (2024 AHA/ACC HCM guideline for hypotension with outflow obstruction that fluid does not fix, by analogy). Raised legs are a bridge. In the lab the nurse gives the pressor on the operator\'s order.',
    'A beta-blocker can lower the gradient (a slower rate, a calmer base, more filling time), but in Takotsubo it is contraindicated with hypotension, severe heart failure with a low ejection fraction or bradycardia, and used with care when the QTc is over 500 ms (InterTAK 2018). Once the pressure is up, a low dose of a short-acting beta-1 blocker (esmolol) if she stays fast.',
    'Avoid what empties the ventricle or drives it harder: catecholamine inotropes (dobutamine, epinephrine, dopamine — and norepinephrine has a beta-1 push too), nitrates, diuretics and other vasodilators, and an intra-aortic balloon pump (it drops the afterload). About 20 % of patients given catecholamines in the InterTAK registry died (sicker patients get them, but it is a warning).',
    'Refractory shock: mechanical support as a bridge to recovery — an Impella carries blood past the obstruction, VA-ECMO for collapse. Without outflow obstruction, a failing pump in Takotsubo also gets mechanical support rather than catecholamines.',
    'Takotsubo is an acquired long QT: the T waves invert deeply and the QT lengthens over days, and torsades or VF is most likely on days 2 to 4. Telemetry, potassium at 4 or more and magnesium at 2 or more, no QT-prolonging drugs. Watch for an apical thrombus, and give an ACE inhibitor or ARB as the pressure allows; the ventricle usually recovers within weeks.',
    'In the lab: the tech zeroes and levels the transducers (the gradient is only as true as the zero), records the pullback and runs the LV gram; the nurse calls out the fall and the murmur and knows which pressor raises the pressure without driving the heart; the cardiologist measures before treating — obstruction and a failing pump look alike and need opposite drugs.',
  ],
};
