import type { Effect, Line, PendingRead, Scenario, SimState, Speaker } from '../types';
import { PADS, atRate, bpAfter, firstDone, has, line } from '../kit';
import { INTERVENTION_BY_ID } from '../interventions';
import {
  LAD_VIEWS, LEFT_VIEWS, MD, RCA_VIEWS, TECH, WIRES, angioGate, anticoagulated, askCritical, askDone, askEvents, askHarm, doneAfter, operator,
  type LabAsk,
} from '../labKit';
import { ANTITHROMBOTIC_RULES, LYTIC_RULES, PROTAMINE_RULES, nitrateRulesExcept } from '../rules/acs';
import { BETA_BLOCKERS } from '../rules/helpers';
import { RATE_RULES, yieldToHeavier } from '../rules/rhythm';

/**
 * Spontaneous coronary artery dissection (SCAD). A 42-year-old woman eight weeks after childbirth, breastfeeding, comes
 * straight to the lab as a STEMI alert from the field. By the time she is on the table the pain has eased and the ST
 * elevation is coming down by itself. The left coronary run shows no plaque anywhere and a long, smooth narrowing of the
 * mid-to-distal LAD (type 2) with TIMI 3 flow: blood in the wall of the artery, not a clot on a plaque.
 *
 * The right care (2018 AHA SCAD statement; 2021 ACC/AHA/SCAI revascularization guideline): handle the catheter gently
 * (never inject into a damped pressure), rule out spasm with intracoronary nitroglycerin, and leave a stable SCAD with
 * preserved flow alone — no wire, no balloon, no stent, no intravascular imaging when the angiogram is already clear. Stop
 * the heparin once SCAD is diagnosed, never give a fibrinolytic, plan a beta-blocker, treat the ache without reading it
 * as new ischemia, and admit her to a monitored bed for several days. The tech and the nurse call out the damped
 * pressure, prepare what the cardiologist asks for, give the drugs (and read back "no more heparin"), and hand her over.
 *
 * No real image: the app has no SCAD angiogram yet, so the runs are described in words (and the read is still asked).
 */

/** A view's short name, e.g. 'LAO cranial view' */
const viewName = (id: string) => INTERVENTION_BY_ID[id].label.split(' — ')[0];

/** Who describes a run: the learner as the cardiologist, otherwise the operator */
const runner = (s: SimState): Speaker => (s.role === 5 ? 'you' : 'operator');

/** Only a patient awake enough to talk says how she feels */
const awake = (s: SimState, text: string): Line[] => (s.pulse && s.vitals.gcs >= 13 ? [['patient', `"${text}"`]] : []);

/**
 * The cardiologist has a catheter that can engage the left coronary (a JL4, a Tiger, or a left guide that is filmed
 * through; a JR4 does only the right)
 */
const leftCatheter = (s: SimState) => (s.counts['cath-jl4'] ?? 0) > 0 || (s.counts['cath-tiger'] ?? 0) > 0 || has(s, 'guide-left');

/**
 * The catheter tip is against the wall of the left main and nobody has backed it out yet. Only a back-out after the
 * damping (or the catheter falling out of the ostium) sets 'repositioned': a "reposition" before the catheter damps
 * changes nothing, so it cannot switch the damping off before it happens
 */
const dampedNow = (s: SimState) => has(s, 'damped') && !has(s, 'repositioned');

/**
 * First minute one of these was done while the catheter was still damped (from the damping until someone backed it
 * out): a call-out or a back-out after the operator has already fixed it — or the nurse's later "no more heparin" read-back
 * with the same call-out action — is not one
 */
function whileDamped(s: SimState, ids: string[]): number | null {
  const from = s.flags.damped;
  if (from === undefined) return null;
  const to = s.flags.repositioned ?? Infinity;
  const hit = s.performed.find((p) => ids.includes(p.id) && p.minute >= from && p.minute < to);
  return hit ? hit.minute : null;
}

/** Balloons, stents and an aspiration catheter: opened before anyone has seen the artery, they are wasted */
const TECH_EARLY_WASTE = ['aspiration', 'balloon-predil', 'stent-des', 'balloon-nc', 'stent-covered'];

/** The blood in the wall has been pushed along the artery (a balloon, a stent, a lytic) and no bail-out stent covers it: ongoing ischemia */
const ischemic = (s: SimState) => has(s, 'extended') && !has(s, 'bailout');

/** What eases the ache: an opioid (or the sedation-analgesia order), or a nitrate */
const PAIN_RELIEF = ['fentanyl', 'sedation', 'nitro', 'ic-nitro'];
const eased = (s: SimState) => has(s, 'ache-eased') || doneAfter(s, PAIN_RELIEF, 'ache') !== null;

/** What the tech could open towards an intervention that nobody is going to do */
const TECH_PCI = ['guide-ebu', 'guide-jr4', 'guide-al1', ...WIRES, 'aspiration', 'balloon-predil', 'stent-des', 'balloon-nc', 'stent-covered'];

/** The pressure before the catheter damped (kept on the clock's timers), so backing out brings back the real one */
const preDamp = (s: SimState) => ({ sbp: s.timers.preSbp ?? 134, dbp: s.timers.preDbp ?? 84 });

/** The left coronary run, in words (no real image of this patient's artery): what it shows, without naming it */
function leftRunText(both: boolean, afterNitro: boolean): string {
  return `${afterNitro ? 'Left coronary, after the nitroglycerin' : 'Left coronary'}: the left main, the proximal LAD and the circumflex are smooth, `
    + 'with no plaque anywhere, though every branch is unusually tortuous. From the mid LAD, just past the second diagonal, the lumen narrows '
    + 'smoothly and gradually over about 40 mm, tapering all the way toward the apex: about 70 % at its tightest, with no ragged edge, '
    + 'no filling defect and no contrast hanging in the wall. Contrast still reaches the apex briskly (TIMI 3).'
    + (both ? ' Right coronary: smooth and normal.' : '');
}

const scadRead: Omit<PendingRead, 'minute'> = {
  kind: 'angio', answer: 'angio-scad', partial: ['angio-dissection'], prompt: 'What does the left coronary run show?',
  explain: 'Spontaneous coronary artery dissection (SCAD), type 2: a long, smooth, diffuse narrowing of the mid-to-distal LAD — blood '
    + 'in the wall of the artery (an intramural hematoma) squeezing the lumen — in a young woman eight weeks after childbirth, with no '
    + 'plaque anywhere else and tortuous vessels. Not atherosclerosis, not clot and not a catheter injury (a "dissection" read alone '
    + 'misses that it came by itself, which is what changes the treatment). Flow is TIMI 3.',
};

const dampedRead: Omit<PendingRead, 'minute'> = {
  kind: 'hemo', answer: 'hemo-damped', prompt: 'What is the pressure from the catheter telling you?',
  explain: 'Damped: the catheter tip is jammed against the wall of the left main (or pushed in too deep), so it reads a low, blunted '
    + 'pressure — and the artery beyond may not be filling. Call it out before anyone injects: an injection against the wall can tear '
    + 'the lining of the artery. The operator backs out and re-seats the catheter coaxially.',
};

/** The first look down the LAD: the run (a cine view or the diagnostic study) and the read */
function firstLook(s: SimState, run: { id: string; view: string }, both: boolean): Effect {
  const afterNitro = has(s, 'ic-nitro');
  return {
    say: [[runner(s), leftRunText(both, afterNitro)]],
    image: run, read: scadRead,
    flags: ['angio', 'cine', 'scad', ...(run.id === 'angio' ? [] : [run.id]), ...(afterNitro ? ['spasm-excluded'] : []), ...(both ? ['rca-done'] : [])],
  };
}

/** Another look at the LAD once it has been seen: after nitroglycerin an unchanged narrowing is not spasm */
function repeatRun(s: SimState, id: string, label: string): Effect {
  const who = runner(s);
  const run = { id, view: label };
  const filmed: Line = ['monitor', `Cine recorded: ${label}.`];
  if (has(s, 'bailout')) {
    return { say: [filmed, [who, 'Two long stents line the LAD from its proximal third to beyond the far end of the old narrowing; contrast reaches the apex (TIMI 3).']], image: run, flags: ['cine', id] };
  }
  if (ischemic(s)) {
    return { say: [filmed, [who, 'The narrowing now starts just past the first diagonal and runs to the apex; the lumen is a thread and the contrast crawls (TIMI 2).', 'bad']], image: run, flags: ['cine', id] };
  }
  const afterNitro = has(s, 'ic-nitro');
  return {
    say: [filmed, [who, afterNitro
      ? 'After the nitroglycerin the long, smooth narrowing of the mid-to-distal LAD is unchanged: it does not relax. Flow still reaches the apex briskly (TIMI 3).'
      : 'The same long, smooth narrowing from the mid LAD toward the apex; flow brisk (TIMI 3).']],
    image: run, flags: ['cine', id, ...(afterNitro ? ['spasm-excluded'] : [])],
  };
}

/**
 * Contrast pushed into a catheter whose tip is against the wall: the dye squirts against the wall and hangs at the tip — a
 * near miss this time. The cardiologist backs out, re-seats it and finishes the run gently (so the run still counts).
 */
function injectDamped(s: SimState, run: { id: string; view: string }, both: boolean): Effect {
  const bp = preDamp(s);
  const look = firstLook(s, run, both);
  return {
    ...look,
    say: [
      ['you', 'You inject with the pressure still damped: the dye squirts against the wall and hangs at the catheter tip, and she groans. You stop, back out and re-seat the catheter coaxially — the waveform is normal again — and finish with gentle injections. The ostium looks intact: this time.', 'bad'],
      ['monitor', `BP ${bp.sbp}/${bp.dbp}.`],
      ...(look.say ?? []),
    ],
    vitals: bp, flags: ['repositioned', ...(look.flags ?? [])],
  };
}

/** Backing the catheter out of the left main: the real pressure comes back */
function backOut(s: SimState, lead: Line[]): Effect {
  const bp = preDamp(s);
  return { say: [...lead, ['monitor', `BP ${bp.sbp}/${bp.dbp}.`], ...awake(s, 'That tightness has eased again.')], vitals: bp, flags: ['repositioned'] };
}

/** A cine view of the left system: the first look at the LAD, an injection into a damped catheter, or a repeat */
function leftView(id: string) {
  return (s: SimState): Effect | null => {
    if (!has(s, 'access')) return null;
    const run = { id, view: viewName(id) };
    if (s.role === 5) {
      if (!leftCatheter(s)) return { blocked: true, say: [['system', 'Engage the left coronary first (a JL4, a Tiger or a left guide): a JR4 sees only the right.']] };
      if (dampedNow(s)) return injectDamped(s, run, false);
      if (!has(s, 'scad')) return firstLook(s, run, false);
    } else if (!has(s, 'scad')) {
      // the tech (or the nurse) only moves the C-arm: the operator decides when to inject, and nobody films the left
      // coronary through a damped catheter or before the first run
      return { say: [['you', `C-arm set for the ${run.view}.`]] };
    }
    return repeatRun(s, id, run.view);
  };
}

/**
 * Balloon, stent or lytic in the stable dissection: the blood in the wall is pushed up and down the artery. The lumen
 * shrinks to a thread, flow slows, and the pain and the ST elevation come back: what conservative care would have avoided.
 */
function extend(s: SimState, lead: Line[], stented: boolean, how = 'Next run'): Effect {
  const sbp = Math.min(s.vitals.sbp, 104);
  const dbp = Math.min(s.vitals.dbp, 66);
  return {
    say: [
      ...lead,
      [runner(s), `${how}: the narrowing has not gone — it has moved. The blood in the wall has been pushed back up the LAD to just past the first diagonal and on down to the apex; the lumen is a thread, and the contrast crawls (TIMI 2).`, 'bad'],
      ['monitor', `Heart rate 112. BP ${sbp}/${dbp}.`, 'bad'],
      ...awake(s, 'The pain\'s back — worse than this morning!'),
    ],
    rhythm: { profile: 'anterior-stemi', hr: 112 }, vitals: { sbp, dbp, pain: 8 },
    flags: ['extended', 'scad', ...(stented ? ['stented', 'pci'] : ['predilated'])],
  };
}

/** Once the hematoma has spread and the flow is failing, long stents beyond both its ends are the bail-out (2021 ACC/AHA/SCAI: 2b) */
function bailout(s: SimState): Effect {
  const bp = bpAfter(s, 14, 8);
  return {
    say: [
      ['you', 'Two long drug-eluting stents, from the proximal LAD to well beyond the far end of the blood in the wall, deployed directly — no more balloon inflations.'],
      ['you', 'Next run: contrast reaches the apex again (TIMI 3) — through about 60 mm of metal, in an artery that would most likely have healed by itself.', 'warn'],
      ['monitor', `Heart rate 96. BP ${bp.sbp}/${bp.dbp}.`],
      ...awake(s, 'It\'s easing… a bit.'),
    ],
    rhythm: { profile: 'anterior-stemi-reperfused', hr: 96 }, vitals: { ...bp, pain: 3 }, flags: ['bailout', 'stented', 'pci'],
  };
}

/** The cardiologist's devices: a wire, a balloon, a stent, an aspiration catheter in a stable SCAD (the default once there is a bail-out to do) */
function mdDevice(s: SimState, id: string): Effect | null {
  if (WIRES.includes(id)) {
    if (!has(s, 'guide') || has(s, 'extended')) return null;
    // nobody wires a coronary that has not been filmed: the run is what tells you what the wire would go into
    if (!has(s, 'scad')) return { blocked: true, say: [['system', 'Film the left coronary first: no wire goes down an artery nobody has looked at yet.']] };
    return { say: [['you', 'Wire down the LAD: its tip buckles and drifts where the lumen narrows, and a test puff shows it in the true lumen — this time.', 'warn']], flags: ['wired'] };
  }
  if (!has(s, 'wired')) return null;
  if (id === 'aspiration') return has(s, 'extended') ? null : { say: [['you', 'Aspiration catheter down the LAD: nothing comes back but blood — there is no clot to remove.']], flags: ['aspirated'] };
  if (id === 'balloon-predil') return has(s, 'extended') ? null : extend(s, [['you', 'Compliant balloon inflated in the narrowest part of the mid LAD.']], false);
  if (id === 'stent-des' || id === 'stent-covered') {
    if (has(s, 'bailout')) return null;
    if (has(s, 'extended')) return id === 'stent-des' ? bailout(s) : null;
    return extend(s, [['you', `${id === 'stent-des' ? 'Drug-eluting stent' : 'Covered stent'} deployed across the narrowest part of the mid LAD.`]], true);
  }
  return null;
}

/**
 * The tech opens what the cardiologist asks for. A guide or a wire opened ahead in a STEMI is anticipation; a balloon, a
 * stent or an aspiration catheter before anyone has seen the artery is waste; and once it is decided that nobody touches
 * the artery, the operator refuses all of them
 */
function techDevice(s: SimState, id: string): Effect | null {
  if (has(s, 'decided')) return { say: [['you', `${viewName(id)}: opened.`], ['operator', 'Put that away — we are not touching this artery.', 'warn']], flags: [`${id}-ready`] };
  if (TECH_EARLY_WASTE.includes(id)) return { say: [['you', `${viewName(id)}: opened.`], ['operator', 'Too early — nobody has seen the artery yet. Open devices when I ask for them.', 'warn']], flags: [`${id}-ready`] };
  return null;
}

/** Nitroglycerin 200 mcg into the coronary: it relaxes spasm, never blood in the wall */
function icNitro(s: SimState, by: 'learner' | 'operator'): Effect | null {
  if (!s.pulse) return null;
  if (!has(s, 'catheter') && !has(s, 'guide')) return { blocked: true, say: [['system', s.role === 5 ? 'There is no catheter in a coronary yet.' : 'The operator has no catheter in a coronary yet.']] };
  const bp = bpAfter(s, -8, -4);
  const given: Line[] = by === 'operator'
    ? [['operator', 'Nitroglycerin 200 mcg down the catheter.']]
    : s.role === 5
      ? [['you', 'Nitroglycerin 200 mcg down the catheter.']]
      : [['you', 'Nitroglycerin 200 mcg drawn up, labeled and handed up — her pressure checked first, the dose read back.'], ['operator', 'Injecting.']];
  return { say: [...given, ['monitor', `BP ${bp.sbp}/${bp.dbp}.`]], vitals: bp, flags: ['ic-nitro', 'nitro-in'] };
}

/** Metoprolol 5 mg IV: the rate and the force of each beat come down, and with them the stress on the torn wall */
function metoprolol(s: SimState, by: 'learner' | 'operator', drug = 'Metoprolol 5 mg IV over 2 minutes', dSbp = -10, dDbp = -6): Effect | null {
  if (!s.pulse) return null;
  const bp = bpAfter(s, dSbp, dDbp);
  const hr = Math.min(s.rhythm.hr, Math.max(60, s.rhythm.hr - 12));
  const given: Line = by === 'operator' ? ['operator', `${drug}.`] : ['you', s.role === 4 ? `${drug}, the dose read back.` : `${drug}.`];
  return { say: [given, ['monitor', `Heart rate ${hr}. BP ${bp.sbp}/${bp.dbp}.`]], vitals: bp, rhythm: atRate(s, hr), flags: ['beta-blocker'] };
}

/**
 * Heparin (one bolus: the action is not repeatable): right for the STEMI before anyone has seen the artery; given only once
 * the SCAD is on the screen, it can feed the bleed in the wall
 */
function heparin(s: SimState): Effect {
  const dose: Line = ['you', s.role === 4 ? 'Heparin 4,800 units IV (70 units/kg), the dose read back.' : 'Heparin 4,800 units IV (70 units/kg).'];
  if (has(s, 'scad') && !has(s, 'extended')) {
    return { say: [dose, ...(s.role === 5 ? [line('team', 'Nurse: "Heparin now — with blood in the wall of that artery?"', 'warn')] : [])], flags: ['heparin', 'heparin-after'] };
  }
  // the nurse who gives the bolus after the operator already gave it (the order's fallback): twice the dose
  if (s.role === 4 && has(s, 'heparin')) {
    return { say: [dose, ['operator', 'Stop — she already had 4,800 units from me! That is a double dose: 140 units per kilo.', 'bad']], flags: ['heparin', 'heparin-twice'] };
  }
  return { say: [dose], flags: ['heparin'] };
}

function shockOutcome(s: SimState): Effect | null {
  if (s.pulse || s.rhythm.profile !== 'vf') return null;
  // with the LAD still failing (the blood in the wall spread and not stented) the pressure comes back low
  const sick = ischemic(s);
  const bp = sick ? { sbp: 100, dbp: 64 } : { sbp: 112, dbp: 70 };
  return {
    say: [['monitor', 'Shock delivered: 200 J.'], ['you', `An organized rhythm is back within seconds: ${bp.sbp}/${bp.dbp} on the arterial line.`, 'good'], ['patient', '"What happened? Where am I?"']],
    rhythm: sick ? { profile: 'anterior-stemi', hr: 112 } : { profile: 'anterior-stemi-reperfused', hr: 104 },
    pulse: true, vitals: { ...bp, gcs: 14 }, flags: ['pads', 'monitor', 'shocked'],
  };
}

/** The hand-off: what was found, what was done, and why she stays on a monitor for days — in the words of what happened */
function handoffText(s: SimState): string {
  const stented = has(s, 'stented');
  const course = has(s, 'bailout')
    ? 'it extended after a balloon or stent and is now covered by two long stents, with TIMI 3 flow'
    : ischemic(s)
      ? `it has extended: the LAD is slow (TIMI 2), with pain and ST elevation${has(s, 'surgery-called') ? ', and cardiac surgery is reviewing the films' : ' — she needs bail-out stents or bypass now, not a bed upstairs'}`
      : 'TIMI 3 flow, managed without a wire or a stent';
  const heparinPlan = has(s, 'heparin-after')
    ? 'Heparin was given after the diagnosis; no more, and no infusion.'
    : has(s, 'heparin-twice') ? 'She had a second heparin bolus by mistake; no more, and no infusion.' : 'No more heparin after the diagnosis, and no infusion.';
  const antiplatelet = stented
    ? `Aspirin given; the stents need a P2Y12 inhibitor as well (${has(s, 'p2y12') ? 'loaded' : 'not yet given'}) — talk with her about breastfeeding on it, since there are few safety data.`
    : 'Aspirin given (low-dose aspirin is safe while breastfeeding); no second antiplatelet drug without a stent unless the team decides otherwise.';
  const given = ['esmolol', 'labetalol'].find((id) => (s.counts[id] ?? 0) > 0);
  const beta = !has(s, 'beta-blocker') ? 'Metoprolol by mouth to start on the unit.' : given ? `${given === 'esmolol' ? 'Esmolol' : 'Labetalol'} given; metoprolol by mouth to follow.` : 'Metoprolol started.';
  const site = has(s, 'femoral') ? 'Right femoral sheath out, pressure held, groin and foot pulses checked.' : 'Right radial band on.';
  const lv = has(s, 'echo') || has(s, 'lv-gram') ? 'LVEF about 50 %. Still to do: ' : 'Still to do: an echo for the LV function; ';
  return `SBAR hand-off to the CCU team: 42-year-old, eight weeks after delivery and breastfeeding, anterior STEMI from a spontaneous coronary artery dissection of the mid-to-distal LAD (type 2) — ${course}. ${heparinPlan} `
    + `${antiplatelet} ${beta} ${site} Telemetry for 3 to 5 days, not an early discharge: new pain with ST change or an arrhythmia means a call and a repeat angiogram. `
    + `${lv}imaging from head to pelvis for fibromuscular dysplasia and aneurysms (MR angiography spares a breastfeeding mother the radiation and the contrast); a lactation consult; cardiac rehab.`;
}

/** What the operator asks the tech for */
const TECH_ASKS: LabAsk[] = [
  {
    id: 'diag', when: (s) => has(s, 'access'), early: true,
    ask: 'JL4 diagnostic for the left coronary, please — I\'ll do the right with a JR4 after.',
    accept: ['cath-jl4'], wrong: ['cath-tiger', 'cath-jr4', 'cath-pigtail', 'guide-ebu', 'guide-jr4', 'guide-al1'],
    wrongSay: 'Not that one — a JL4 diagnostic, for the left coronary.',
    thanks: 'JL4 — thanks. Engaging the left.', fallback: 'I\'ll open the JL4 myself.', gives: 'diag-in-hand',
    label: 'Diagnostic catheter for the left coronary (JL4), as asked',
    why: 'Say it back and hand the catheter the operator asked for: a JL4 engages the left coronary, a JR4 the right; a guide is for an intervention, not for the diagnostic pictures.',
  },
  {
    id: 'view', when: (s) => has(s, 'nitro-in') && has(s, 'scad'),
    ask: 'Nitro\'s in. Repeat the LAD for me, please — a cranial view.',
    accept: LAD_VIEWS, wrong: RCA_VIEWS,
    wrongSay: 'That\'s the right coronary — I\'m in the left. A cranial view of the LAD, please.',
    thanks: 'That\'s my view — hold it.', fallback: 'I\'ll take the table-side controls: LAO cranial.', gives: 'repeat-done',
    fallbackEffect: (s) => repeatRun(s, 'view-lao-cranial', viewName('view-lao-cranial')),
    label: 'Repeat the LAD in a cranial view after the nitroglycerin', points: 10,
    why: 'Cranial views (RAO, AP or LAO cranial) lay the mid and distal LAD out clear of its branches. Repeated after intracoronary nitroglycerin, the run shows whether the narrowing relaxes (spasm) or stays (blood in the wall of the artery).',
  },
  {
    id: 'jr4', when: (s) => has(s, 'decided'), early: true,
    ask: 'Right coronary next — JR4, please.',
    accept: ['cath-jr4'], wrong: ['cath-tiger', 'cath-pigtail'],
    wrongSay: 'A JR4, please — for the right coronary.',
    thanks: 'Thanks.', fallback: 'I\'ll open the JR4 myself.', gives: 'jr4-in-hand',
    label: 'Diagnostic catheter for the right coronary (JR4), as asked',
    why: 'Every coronary gets looked at: SCAD involves more than one artery in up to a quarter of patients.',
  },
];

/** What the operator asks the nurse for */
const RN_ASKS: LabAsk[] = [
  {
    id: 'rn-heparin', role: 4, when: () => true,
    ask: 'STEMI on the field 12-lead: heparin 70 units per kilo, please — she\'s 68 kilos, so 4,800 units. And check her consent.',
    accept: ['heparin'], wrong: ['bivalirudin', 'gp2b3a', 'protamine'],
    wrongSay: 'That\'s not what I ordered — unfractionated heparin, 4,800 units.',
    thanks: 'Thanks.', fallback: 'I\'ll get the heparin in myself.', gives: 'heparin-given',
    fallbackEffect: () => ({ say: [['team', 'Heparin 4,800 units IV.']], flags: ['heparin'] }),
    label: 'Heparin for the STEMI, as ordered',
    why: 'With ST elevation on the field 12-lead she is anticoagulated before the catheters go in (heparin 70–100 units/kg; it also keeps the radial artery open). Read the dose back.',
  },
  {
    id: 'rn-nitro', role: 4, when: (s) => has(s, 'scad'),
    ask: 'I want spasm ruled out. Two hundred micrograms of nitroglycerin down the catheter, please — check her pressure first.',
    accept: ['ic-nitro'], wrong: ['ic-adenosine', 'ic-verapamil', 'ic-nitroprusside', 'ic-epinephrine', 'nitro', 'nitro-high', 'nitro-iv'],
    wrongSay: 'Not that — nitroglycerin, 200 micrograms, into the coronary.',
    thanks: 'Thanks — pressure\'s fine. I\'ll repeat the LAD.', fallback: 'I\'ll draw up the nitro myself.', gives: 'nitro-given',
    fallbackEffect: (s) => icNitro(s, 'operator') ?? {},
    label: 'Intracoronary nitroglycerin to rule out spasm, as ordered', points: 10,
    why: 'A long, smooth narrowing can be spasm: 100–200 mcg of nitroglycerin into the coronary relaxes spasm, but not blood in the wall of the artery. Check the pressure first (it drops it), label the syringe and read the dose back.',
  },
  {
    // the read-back is the nurse's part of stopping it: no heparin infusion runs here, so nothing else has to be turned off
    id: 'rn-heparin-off', role: 4, when: (s) => has(s, 'decided'),
    ask: 'So: no more heparin — no top-up now, and no heparin drip on the unit. Read that back to me, please.',
    // the read-back, or the stop itself (nothing runs, so it says no top-up and no drip)
    accept: ['callout', 'stop-antithrombotics'], wrong: ['heparin', 'bivalirudin', 'gp2b3a', 'cangrelor'],
    wrongSay: 'No! No more anticoagulation — it can feed the bleeding inside the wall of that artery.',
    thanks: 'That\'s right. Thank you.', fallback: 'Did anyone hear me? No more heparin — I\'ll write it on the orders myself.', gives: 'heparin-off',
    label: 'Read back the order: no more heparin', points: 10,
    why: 'Once SCAD is diagnosed, the heparin given for the STEMI is stopped when nothing else calls for it: it could feed the bleed in the wall of the artery (AHA 2018: "consideration of discontinuation is appropriate"). Closed loop: read the order back, and make sure no infusion is started on the unit.',
  },
  {
    id: 'rn-bb', role: 4, when: (s) => has(s, 'heparin-off'),
    ask: 'And metoprolol 5 milligrams IV, please — I want her rate, and the force on that artery, down.',
    accept: ['metoprolol'], wrong: ['diltiazem', 'amio-infusion', 'adenosine3', 'adenosine6', 'adenosine12', 'procainamide', 'esmolol', 'labetalol', 'metoprolol-po'],
    wrongSay: 'Not that — metoprolol, 5 milligrams IV.',
    thanks: 'Thanks.', fallback: 'I\'ll push the metoprolol myself.', gives: 'bb-given',
    fallbackEffect: (s) => metoprolol(s, 'operator') ?? {},
    label: 'Metoprolol IV, as ordered',
    why: 'A beta-blocker lowers the heart rate and the force of each beat, and with them the stress on the wall of the dissected artery; after SCAD it has been linked to fewer recurrences. Metoprolol is compatible with breastfeeding (atenolol is not).',
  },
  {
    id: 'rn-pain', role: 4, when: (s) => has(s, 'ache'),
    ask: 'She\'s still sore — something for the pain, please.',
    accept: ['fentanyl', 'sedation', 'nitro'], wrong: ['midazolam'],
    wrongSay: 'That calms her; it doesn\'t treat pain. Fentanyl, please.',
    thanks: 'Thanks.', fallback: 'Is anyone giving her something for the pain?', gives: 'pain-treated',
    fallbackEffect: (s) => ({ say: [['team', 'Fentanyl 50 mcg IV.']], vitals: { pain: Math.max(0, s.vitals.pain - 3) }, flags: ['analgesia', 'ache-eased'] }),
    label: 'Treat the pain when the operator asks',
    why: 'An ache after SCAD can come from the torn wall itself, without new ischemia: treat it (fentanyl 25–50 mcg IV, titrated) and repeat the 12-lead.',
  },
];

export const cathlabScad: Scenario = {
  id: 'scad-cathlab',
  title: 'STEMI alert eight weeks after childbirth',
  summary: '42-year-old woman, eight weeks after delivery, with an anterior STEMI that has eased by the time she reaches the table. Find out what the angiogram shows — and decide what she needs, and what she does not.',
  setting: 'cathlab',
  roles: [3, 4, 5],
  difficulty: 'advanced',
  conditionId: 'scad',
  briefing: {
    default: [
      ['team', 'STEMI alert from the field: 42-year-old woman, eight weeks after an uncomplicated vaginal delivery, breastfeeding. Crushing central chest pain into the left arm and jaw since 5:40 this morning, after a night up with the baby. The field 12-lead showed 3 mm of ST elevation in V2–V4.'],
      ['team', 'EMS gave aspirin 324 mg and one nitroglycerin spray; an 18 G IV is in the left forearm. No heart history and no risk factors; migraines since her teens. 68 kg.'],
      ['scene', 'She is pale and frightened, the pain down to 5 out of 10, asking who is with her baby.'],
    ],
    3: [
      ['team', 'STEMI alert from the field: 42-year-old woman, eight weeks after an uncomplicated vaginal delivery, breastfeeding. Crushing central chest pain into the left arm and jaw since 5:40 this morning, after a night up with the baby. The field 12-lead showed 3 mm of ST elevation in V2–V4.'],
      ['team', 'EMS gave aspirin 324 mg and one nitroglycerin spray; an 18 G IV is in the left forearm. No heart history and no risk factors; migraines since her teens. 68 kg.'],
      ['scene', 'She is pale and frightened, the pain down to 5 out of 10, asking who is with her baby.'],
      ['team', 'You are the scrub tech: set-up, the transducers and the pads, the C-arm views, and the catheters the cardiologist asks for — and calling out every change you see. The nurse is with her.'],
    ],
    4: [
      ['team', 'STEMI alert from the field: 42-year-old woman, eight weeks after an uncomplicated vaginal delivery, breastfeeding. Crushing central chest pain into the left arm and jaw since 5:40 this morning, after a night up with the baby. The field 12-lead showed 3 mm of ST elevation in V2–V4.'],
      ['team', 'EMS gave aspirin 324 mg and one nitroglycerin spray; an 18 G IV is in the left forearm. No heart history and no risk factors; migraines since her teens. 68 kg.'],
      ['scene', 'She is pale and frightened, the pain down to 5 out of 10, asking who is with her baby.'],
      ['team', 'You are the procedural nurse: consent, the drugs the cardiologist orders, her comfort and safety, and the hand-off. The tech has set up; the cardiologist is scrubbing.'],
    ],
    5: [
      ['team', 'STEMI alert from the field: 42-year-old woman, eight weeks after an uncomplicated vaginal delivery, breastfeeding. Crushing central chest pain into the left arm and jaw since 5:40 this morning, after a night up with the baby. The field 12-lead showed 3 mm of ST elevation in V2–V4.'],
      ['team', 'EMS gave aspirin 324 mg and one nitroglycerin spray; an 18 G IV is in the left forearm. No heart history and no risk factors; migraines since her teens. 68 kg.'],
      ['scene', 'She is pale and frightened, the pain down to 5 out of 10, asking who is with her baby.'],
      ['team', 'You are the interventional cardiologist: every choice is yours. The tech and the nurse are with you.'],
    ],
  },
  initial: {
    // the ST elevation was coming down by itself before she reached the table: the flow down the LAD is still there
    rhythm: { profile: 'anterior-stemi-reperfused', hr: 98 },
    vitals: { sbp: 138, dbp: 86, spo2: 98, rr: 18, etco2: 35, pain: 5, gcs: 15, glucose: 98, temp: 36.8 },
  },
  // what the built-in safety rules read (types.ts Problem)
  problems: ['acs'],
  facts: {
    sample: 'No allergies. Prenatal vitamins and nothing else. Her third baby, born eight weeks ago after an uncomplicated vaginal delivery; she is breastfeeding. Migraines since her teens. Never smoked; no high blood pressure, diabetes or high cholesterol.',
    opqrst: (s) => (has(s, 'ache')
      ? 'It\'s a dull, tearing sort of ache now, right in the middle. About a four.'
      : 'It came on at twenty to six this morning, out of nowhere — crushing, right in the middle, into my left arm and my jaw. It was an eight; about a five since the spray.'),
    lungs: 'Clear on both sides.',
    perfusion: 'Warm and dry; no JVD; radial and pedal pulses strong and equal.',
    // one draw on arrival: a single value cannot say "rising"
    labs: 'High-sensitivity troponin I 2,900 ng/L (far above the 99th percentile). Hemoglobin 11.6, platelets 318, creatinine 0.6, potassium 4.1; hCG negative.',
    ecg12: (s) => (s.rhythm.profile === 'anterior-stemi'
      ? `Sinus rhythm ${s.rhythm.hr}: the ST segments in V1–V4 are back up, with reciprocal depression in III and aVF — the anterior wall is ischemic again.`
      : `Sinus rhythm ${s.rhythm.hr}: the ST elevation in V2–V4 is down to about 1 mm (3 mm on the field 12-lead), with Q waves in V1–V3 and the T waves turning over: the anterior wall has reperfused, without anyone opening the artery.`),
    echo: 'The apex and the distal anterior wall move poorly; LVEF about 50 %; no pericardial effusion; the valves are normal.',
    lvgram: 'LV gram: the apex and the distal anterior wall barely move; EF about 50 %; no mitral regurgitation.',
    lvedp: 'LV 132/14 mmHg: LVEDP 14 mmHg.',
    final: (s) => (has(s, 'bailout')
      ? 'Final pictures in two views: two long stents in the LAD; contrast reaches the apex (TIMI 3).'
      : ischemic(s)
        ? 'Final pictures in two views: the narrowing runs from just past the first diagonal to the apex; the contrast crawls (TIMI 2).'
        : 'Final pictures in two views: the long, smooth narrowing of the mid-to-distal LAD as before; contrast reaches the apex briskly (TIMI 3).'),
  },
  status: (s) => {
    if (!s.pulse) return 'Unresponsive.';
    if (ischemic(s)) return '"It\'s crushing again — worse than this morning."';
    if (dampedNow(s)) return '"It\'s getting tighter in my chest… something\'s not right."';
    if (has(s, 'ache')) return eased(s) ? `"That's easier — maybe a ${s.vitals.pain}. Is someone with my baby?"` : `"Still that tearing ache — about a ${s.vitals.pain}."`;
    return `"About a ${s.vitals.pain} — it comes and goes."`;
  },
  respond: {
    consent: () => ({
      say: [
        ['patient', '"No allergies, no blood thinners. I\'m breastfeeding — is the dye safe for the baby?"'],
        ['you', 'Hardly any contrast reaches the milk, and the baby absorbs almost none of that: she can keep feeding.'],
        ['patient', '"Then yes — do what you need to."'],
      ],
      flags: ['consent'],
    }),
    access: (s) => ({ say: [[operator(s), 'Right radial: 6 French sheath in.']], flags: ['access'] }),
    heparin,
    reposition: (s) => {
      if (dampedNow(s)) return backOut(s, [['you', 'Catheter backed out of the left main and re-seated coaxially at the ostium: the waveform is normal again.', 'good']]);
      if (!has(s, 'catheter') && !has(s, 'guide')) return { blocked: true, say: [['system', 'There is no catheter in a coronary to reposition.']] };
      // nothing is wedged: nothing to do, and the one back-out is kept for when the pressure damps (it is not repeatable)
      return { blocked: true, say: [['system', 'Nothing to reposition: the catheter tip is coaxial and the pressure waveform is normal.']] };
    },
    angio: (s) => {
      const gate = angioGate(s);
      if (gate) return gate;
      if (!leftCatheter(s)) return { blocked: true, say: [['system', 'A JR4 sees only the right coronary: engage the left with a JL4 (or use a Tiger) first.']] };
      const run = { id: 'angio', view: 'Diagnostic angiography: both coronaries' };
      if (dampedNow(s)) return injectDamped(s, run, true);
      return has(s, 'scad') ? null : firstLook(s, run, true);
    },
    ...Object.fromEntries(LEFT_VIEWS.map((id) => [id, leftView(id)])),
    'final-angio': (s) => {
      if (!has(s, 'access')) return null;
      // the "final" pictures before anyone has filmed the coronaries would show the finding without the run and its read
      if (!has(s, 'scad')) return { blocked: true, say: [['system', s.role === 5 ? 'Film the coronaries first: the final pictures come at the end.' : 'The operator has not filmed the coronaries yet: the final pictures come at the end.']] };
      // the cardiologist's final pictures after the nitroglycerin are a repeat of the LAD too
      return s.role === 5 ? repeatRun(s, 'final-angio', 'Final angiogram in two views') : null;
    },
    'ic-nitro': (s) => {
      if (!s.pulse) return null;
      // nothing goes down a catheter whose tip is against the wall — not even a drug
      if (dampedNow(s)) return { blocked: true, say: [['system', 'The pressure is damped: nothing goes down that catheter until it is backed out and re-seated.']] };
      // an intracoronary drug is the operator's to order: the tech (the nurse hands it up in this lab) and the nurse before the order hold it
      if (s.role === 3 || (s.role === 4 && !has(s, 'asked-rn-nitro'))) {
        return { say: [['you', 'Nitroglycerin 200 mcg drawn up and labeled.'], ['operator', has(s, 'nitro-in') ? 'It\'s already in — put that one aside.' : 'Hold it — not until I ask for it.']] };
      }
      return icNitro(s, 'learner');
    },
    metoprolol: (s) => metoprolol(s, 'learner'),
    // any IV beta-blocker does the same for the torn wall (labetalol drops the pressure a little more)
    esmolol: (s) => metoprolol(s, 'learner', 'Esmolol 500 mcg/kg IV over 1 minute, then the infusion'),
    labetalol: (s) => metoprolol(s, 'learner', 'Labetalol 20 mg IV over 2 minutes', -14, -8),
    fentanyl: (s) => {
      if (!s.pulse) return null;
      const pain = Math.max(0, s.vitals.pain - 3);
      const rr = Math.min(s.vitals.rr, Math.max(10, s.vitals.rr - 1));
      return {
        say: [['you', s.role === 4 ? 'Fentanyl 50 mcg IV, the dose read back.' : 'Fentanyl 50 mcg IV.'], ...awake(s, pain <= 2 ? 'That takes the edge off.' : 'A little better.')],
        vitals: { pain, rr }, flags: ['analgesia', ...(has(s, 'ache') ? ['ache-eased'] : [])],
      };
    },
    // the tech opens devices; the cardiologist uses them
    ...Object.fromEntries(TECH_PCI.map((id) => [id, (s: SimState) => (s.role === 3 ? techDevice(s, id) : s.role === 5 ? mdDevice(s, id) : null)])),
    ivus: (s) => {
      if (s.role !== 5 || !has(s, 'wired')) return null;
      return {
        say: [['monitor', has(s, 'extended')
          ? 'IVUS: the wire is in the true lumen; blood fills the wall from the first diagonal to the apex and squeezes the true lumen to a slit.'
          : 'IVUS: no plaque at all. From the mid LAD a crescent of blood in the wall of the artery squeezes the true lumen over about 40 mm, with no tear in the lining — what the angiogram already showed.']],
        flags: ['ivus'],
      };
    },
    oct: (s) => {
      if (s.role !== 5 || !has(s, 'wired')) return null;
      return {
        say: [['monitor', 'OCT, with a forceful contrast flush to clear the blood: a dark crescent of blood in the wall of the artery squeezes the true lumen over about 40 mm, with no tear in the lining — what the angiogram already showed.'], ...awake(s, 'Ooh — that went right through my chest.')],
        flags: ['oct'],
      };
    },
    'clear-air': (s) => {
      if (s.role !== 5 || (!has(s, 'guide') && !has(s, 'catheter'))) return null;
      return { say: [['you', 'Aspirated back through the catheter, then a forceful saline flush down the artery: there was no air to clear.'], ...awake(s, 'Ow — that burned right through my chest.')], flags: ['flushed'] };
    },
    tnk: (s) => {
      const lead: Line[] = [['you', 'Tenecteplase IV.'], ['team', 'Nurse: "Doctor — she\'s on the table for an angiogram!"', 'warn']];
      if (has(s, 'scad') && !has(s, 'extended')) return { ...extend(s, lead, false, 'Within minutes the pain surges, and the next run shows why'), flags: ['lytic', 'extended', 'scad'] };
      return { say: lead, flags: ['lytic'] };
    },
    // the band goes on as the sheath comes out, at the end
    hemostasis: (s) => (s.role !== 5 && !has(s, 'proc-over')
      ? { blocked: true, say: [['system', has(s, 'access') ? 'The sheath is still in: the band goes on when the operator pulls it at the end.' : 'There is no sheath in yet.']] }
      : null),
    callout: (s) => {
      if (dampedNow(s) && !has(s, 'damped-called')) return { say: [['you', `"Pressure's damped — ${s.vitals.sbp} over ${s.vitals.dbp}!"`]], flags: ['callout', 'damped-called'] };
      if (s.role === 4 && has(s, 'asked-rn-heparin-off') && !has(s, 'heparin-off')) {
        return { say: [['you', '"No more heparin: no top-up now, and no heparin drip on the unit." Written on the orders for the hand-off.']], flags: ['callout', 'heparin-stopped'] };
      }
      return null;
    },
    handoff: (s) => {
      if (!s.pulse || !has(s, 'scad') || (s.role !== 5 && !has(s, 'proc-over'))) return null;
      return { say: [['you', handoffText(s)]], flags: ['handoff'] };
    },
    defib: shockOutcome,
    aed: shockOutcome,
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
      effect: () => ({ say: [['team', 'Nurse: consent and contrast allergy checked — she is breastfeeding; the EMS IV flushes well; heparin 4,800 units given on the cardiologist\'s order.']], flags: ['consent', 'heparin', 'monitor'] }),
    },
    {
      id: 'rn-setup-for-md', when: (s) => s.role === 5,
      effect: () => ({ say: [['team', 'Nurse: the EMS IV flushes well and labs are drawn. Waiting for your orders.']], flags: ['labs'] }),
    },
    ...TECH_ASKS.flatMap(askEvents),
    ...RN_ASKS.flatMap(askEvents),
    {
      // a STEMI does not wait: by 6 minutes the operator checks the consent and calls the time-out with whoever is there
      // (the learner's items are missed, but the case goes on)
      id: 'md-starts', when: (s) => s.role !== 5 && s.minute >= 6 && (!has(s, 'timeout') || !has(s, 'consent')),
      effect: (s) => ({
        say: [['operator', `We cannot wait any longer — ${has(s, 'consent') ? '' : 'I have confirmed her consent and allergies myself. '}Time-out: right patient, coronary angiography by the right radial, no allergies, heparin ${anticoagulated(s) ? 'given' : 'ordered'}.`, 'warn']],
        flags: ['timeout', 'consent'],
      }),
    },
    {
      id: 'md-access', when: (s) => s.role !== 5 && has(s, 'timeout') && anticoagulated(s) && has(s, 'consent') && !has(s, 'access'),
      effect: () => ({ say: [['operator', 'Right radial: 6 French sheath in.']], flags: ['access'] }),
    },
    {
      // the operator engages the left coronary once the tech has handed the catheter (with the nurse: a minute after access)
      id: 'md-engage',
      when: (s) => s.role !== 5 && has(s, 'access') && (s.role === 3 ? has(s, 'diag-in-hand') : s.minute >= s.flags.access + 1),
      effect: () => ({ say: [['operator', 'JL4 up to the left coronary ostium… engaging.']], flags: ['catheter', 'left-engaged'] }),
    },
    {
      // the tip lands against the wall of the left main: the pressure damps, and the artery beyond may not fill
      id: 'damped',
      when: (s) => s.pulse && (s.role === 5 ? has(s, 'access') && leftCatheter(s) : has(s, 'left-engaged')),
      effect: (s) => ({
        say: [
          ['monitor', 'Arterial pressure 84/66 — and the waveform has changed shape since the catheter went in.', 'bad'],
          ...awake(s, 'My chest — it\'s getting tighter.'),
          ...(s.role === 5 ? [line('team', 'Tech: "Doctor — the pressure\'s damped!"', 'warn')] : []),
        ],
        vitals: { sbp: 84, dbp: 66 }, timers: { preSbp: s.vitals.sbp, preDbp: s.vitals.dbp }, flags: ['damped'],
        ...(s.role !== 5 ? { read: dampedRead } : {}),
      }),
    },
    {
      // left wedged in the left main, the whole left heart goes without flow
      id: 'damped-vf', when: (s) => s.role === 5 && s.pulse && dampedNow(s) && s.minute >= s.flags.damped + 3,
      effect: () => ({
        say: [['monitor', 'Monitor alarm — she is unresponsive!', 'bad'], ['team', 'Tech: "Doctor — look at the monitor!" The catheter has dropped back out of the ostium.', 'bad']],
        rhythm: { profile: 'vf', hr: 0 }, pulse: false, flags: ['vf', 'repositioned'],
      }),
    },
    {
      id: 'md-reposition', when: (s) => s.role !== 5 && dampedNow(s) && (doneAfter(s, ['callout'], 'damped') !== null || s.minute >= s.flags.damped + 2),
      effect: (s) => backOut(s, has(s, 'damped-called')
        ? [['operator', 'Thanks — backing out. Re-seated coaxially; the waveform\'s back.', 'good']]
        : [['operator', 'Pressure\'s damped — who\'s watching the waveform? I was about to inject into that. Backing out now.', 'warn']]),
    },
    {
      id: 'md-left-run', when: (s) => s.role !== 5 && has(s, 'repositioned') && !has(s, 'scad'),
      effect: (s) => firstLook(s, { id: 'angio', view: 'Left coronary run' }, false),
    },
    {
      id: 'rn-nitro-for-tech', when: (s) => s.role === 3 && has(s, 'scad') && !has(s, 'nitro-in'),
      effect: (s) => {
        const bp = bpAfter(s, -8, -4);
        return {
          say: [
            ['operator', 'I want spasm ruled out: 200 micrograms of nitroglycerin down the catheter, please.'],
            ['team', 'Nurse: "Nitroglycerin 200 micrograms, pressure checked first — handing it up."'],
            ['monitor', `BP ${bp.sbp}/${bp.dbp}.`],
          ],
          vitals: bp, flags: ['ic-nitro', 'nitro-in'],
        };
      },
    },
    {
      id: 'md-repeat-for-rn', when: (s) => s.role === 4 && has(s, 'nitro-given') && !has(s, 'spasm-excluded'),
      effect: (s) => repeatRun(s, 'view-lao-cranial', viewName('view-lao-cranial')),
    },
    {
      id: 'md-decides', when: (s) => s.role !== 5 && has(s, 'spasm-excluded') && !has(s, 'decided'),
      effect: () => ({
        say: [['operator', 'Unchanged after the nitro: that\'s a spontaneous dissection, type 2 — blood in the wall, TIMI 3 flow, and she\'s stable. We leave it alone: no wire, no balloon, no stent, and no imaging catheter down a vessel that is already telling us what it is.']],
        flags: ['decided'],
      }),
    },
    {
      // pain after SCAD can come from the torn wall itself, without new ischemia (AHA 2018): the trap is to go in for the pain alone
      id: 'ache', when: (s) => s.pulse && has(s, 'scad') && !ischemic(s) && (has(s, 'spasm-excluded') || s.minute >= s.flags.scad + 4),
      effect: (s) => ({
        say: [
          ['patient', '"It still aches in the middle of my chest — a dull, tearing sort of ache. About a four."'],
          ['monitor', `Heart rate ${s.rhythm.hr}. BP ${s.vitals.sbp}/${s.vitals.dbp}.`],
          ...(s.role === 5 ? [line('team', 'Tech: "Guide and a workhorse wire for the LAD, doctor?"')] : []),
        ],
        vitals: { pain: 4 }, flags: ['ache'],
      }),
    },
    {
      id: 'rn-pain-for-tech', when: (s) => s.role === 3 && has(s, 'ache') && !eased(s),
      effect: (s) => ({ say: [['team', 'Nurse: "Fentanyl 50 micrograms in for her pain."']], vitals: { pain: Math.max(0, s.vitals.pain - 3) }, flags: ['analgesia', 'ache-eased'] }),
    },
    {
      id: 'md-rca', when: (s) => s.role !== 5 && has(s, 'decided') && !has(s, 'rca-done') && (s.role === 3 ? has(s, 'jr4-in-hand') : s.minute >= s.flags.decided + 1),
      effect: () => ({
        say: [['operator', 'JR4 into the right coronary: smooth and normal — no narrowing anywhere.']],
        image: { id: 'view-rca-lao', view: 'Right coronary' }, flags: ['rca-done', 'cine'],
      }),
    },
    {
      id: 'md-done', when: (s) => s.role !== 5 && has(s, 'rca-done') && !has(s, 'proc-over'),
      effect: () => ({ say: [['operator', 'That\'s all the pictures we need. No intervention: catheter out, and the sheath out.']], flags: ['proc-over'] }),
    },
    {
      id: 'home', when: (s) => s.pulse && has(s, 'ache') && eased(s),
      effect: () => ({ say: [['patient', '"When can I go home? The baby has never been away from me."']] }),
    },
    {
      // the extension left alone: the starved anterior wall fibrillates
      id: 'extended-vf', when: (s) => s.pulse && ischemic(s) && s.minute >= s.flags.extended + 8,
      effect: () => ({ say: [['monitor', 'Monitor alarm — she is unresponsive!', 'bad']], rhythm: { profile: 'vf', hr: 0 }, pulse: false, flags: ['vf'] }),
    },
  ],
  critical: [
    { id: 'consent', label: 'Consent, contrast allergy and anticoagulants checked', why: 'Even in a STEMI, confirm consent and allergies before access — and answer her question: iodinated contrast is no reason to stop breastfeeding.', done: ['consent'], roles: [4, 5], points: 10, target: { by: 6 } },
    { id: 'timeout', label: 'Procedural time-out before access', why: 'The time-out catches wrong-patient, wrong-procedure and allergy errors before anyone punctures an artery.', done: ['timeout'], points: 10, target: { by: 6 } },
    { id: 'prep', label: 'Prep and drape both radial and femoral sites', why: 'Radial first, with a femoral site ready for a bail-out.', done: ['prep'], roles: TECH, points: 5, target: { by: 6 } },
    { id: 'transducer', label: 'Zero and level the transducers', why: 'An accurate pressure is what shows a damped catheter: zeroed to air, leveled at the phlebostatic axis.', done: ['transducer'], roles: TECH, points: 10, target: { by: 6 } },
    { id: 'pads', label: 'Defibrillator pads on before the catheter goes in', why: 'A STEMI on the table can fibrillate at any moment: pads on before the first catheter.', done: PADS, roles: TECH, points: 5, target: { by: 8 } },
    {
      id: 'md-heparin', label: 'Heparin for the STEMI before the catheters go in', roles: MD, points: 5, target: { by: 10 },
      why: 'ST elevation on the field 12-lead: anticoagulate at the start (heparin 70–100 units/kg, which also protects the radial artery) — before anyone knows what the artery holds.',
      // given once the dissection is on the screen it is the wrong dose at the wrong time (a harm), not this item
      done: (s) => {
        const m = firstDone(s, ['heparin', 'bivalirudin']);
        return m !== null && (s.flags.scad === undefined || m < s.flags.scad) ? m : null;
      },
      uses: ['heparin', 'bivalirudin'],
    },
    { id: 'access', label: 'Arterial access', why: 'Radial access cuts bleeding in STEMI. With a SCAD suspected (a young woman after a pregnancy), take extra care with the radial or go femoral: catheter-induced dissection is more frequent in these fragile arteries.', done: ['access', 'access-femoral'], roles: MD, points: 5, target: { by: 12 } },
    askCritical(TECH_ASKS[0]),
    {
      // once the operator has given the heparin (the order's fallback), the nurse's own bolus is a second dose, not the order
      ...askCritical(RN_ASKS[0]),
      done: (s) => (s.fired.includes('rn-heparin-fallback') ? null : askDone(s, RN_ASKS[0])),
    },
    {
      id: 'callout-damped', label: 'Call out the damped pressure at once', roles: [3, 4], points: 15, target: { within: { flag: 'damped', minutes: 1 } }, applies: (s) => has(s, 'damped'),
      why: 'A damped pressure means the catheter tip is against the wall or too deep: say it before anyone injects. An injection against the wall can tear the lining of the artery.',
      done: (s) => whileDamped(s, ['callout']), uses: ['callout'],
    },
    {
      id: 'reposition', label: 'Back the damped catheter out before injecting', roles: MD, points: 10, target: { within: { flag: 'damped', minutes: 1 } }, applies: (s) => has(s, 'damped'),
      why: 'Never inject into a damped pressure: back out and re-seat the catheter coaxially. In a fragile artery a forceful injection against the wall can start a dissection of its own.',
      done: (s) => whileDamped(s, ['reposition']), uses: ['reposition'],
    },
    { id: 'angio', label: 'Diagnostic angiography: find the cause', why: 'Coronary angiography as early as possible after a STEMI: it is what shows the cause, and the cause decides the treatment.', done: ['angio', ...LEFT_VIEWS], roles: MD, points: 5, target: { by: 15 } },
    {
      id: 'md-spasm', label: 'Rule out spasm: intracoronary nitroglycerin, then repeat the LAD', roles: MD, points: 10, applies: (s) => has(s, 'scad'),
      why: 'A long, smooth narrowing can be spasm. 100–200 mcg of nitroglycerin into the coronary, then the same artery again: spasm relaxes, blood in the wall does not.',
      done: (s) => (has(s, 'spasm-excluded') ? firstDone(s, ['angio', ...LEFT_VIEWS, 'final-angio'], 'ic-nitro') ?? s.flags['spasm-excluded'] : null),
      uses: ['ic-nitro', ...LEFT_VIEWS, 'final-angio'],
    },
    askCritical(TECH_ASKS[1]),
    askCritical(RN_ASKS[1]),
    askCritical(RN_ASKS[2]),
    {
      // the cardiologist's decision once the SCAD is seen: the heparin given for the STEMI stops (no top-up, no drip). Only
      // when one was given: with nothing running there is nothing to stop (the missed heparin is its own item)
      id: 'md-heparin-off', label: 'Once the SCAD is seen: stop the heparin — no top-up, no drip', roles: MD, points: 5,
      applies: (s) => has(s, 'scad') && ['heparin', 'bivalirudin', 'gp2b3a', 'cangrelor'].some((f) => has(s, f)),
      why: 'Once SCAD is diagnosed, the heparin given for the STEMI is stopped when nothing else calls for it: it could feed the bleed in the wall of the artery (AHA 2018: "consideration of discontinuation is appropriate"). Say it, and write it: no top-up now and no heparin drip on the unit.',
      done: (s) => firstDone(s, ['stop-antithrombotics'], 'scad'), uses: ['stop-antithrombotics'],
    },
    // the cardiologist's beta-blocker: IV metoprolol in the lab or metoprolol by mouth are both right (AHA 2018: "should be
    // considered"). The nurse gives it because the operator orders it
    {
      id: 'md-bb', label: 'A beta-blocker once the SCAD is seen: IV, or by mouth', roles: MD, points: 5, applies: (s) => has(s, 'scad'),
      why: 'A beta-blocker brings down the rate and the force of each beat, and with them the stress on the torn wall; it is part of the care after SCAD (2018 AHA scientific statement: it should be considered). IV metoprolol in the lab or metoprolol by mouth are both right — not with a low pressure, a slow rate or a failing ventricle.',
      done: (s) => firstDone(s, BETA_BLOCKERS, 'scad'), uses: BETA_BLOCKERS,
    },
    askCritical(RN_ASKS[3]),
    askCritical(TECH_ASKS[2]),
    { id: 'md-pain', label: 'Treat the ache — not with a stent', why: 'Pain after SCAD can come from the torn wall itself. Treat it (fentanyl, or nitroglycerin), repeat the 12-lead, and go back in only for new ischemia on the ECG, an arrhythmia or failing flow: chest pain alone is no reason to intervene.', done: PAIN_RELIEF, after: 'ache', roles: MD, points: 5, target: { within: { flag: 'ache', minutes: 5 } }, applies: (s) => has(s, 'ache') },
    askCritical(RN_ASKS[4]),
    { id: 'post-ecg', label: '12-lead when the ache comes back', why: 'New pain needs a new 12-lead: unchanged ST segments say the ache is the torn wall, not a newly blocked artery.', done: ['ecg12', 'ecg12-repeat'], after: 'ache', points: 5, target: { within: { flag: 'ache', minutes: 8 } }, applies: (s) => has(s, 'ache') },
    { id: 'md-lv', label: 'LV function: echocardiogram (or LV gram)', why: 'The size of the infarct and the ejection fraction decide the medicines and the follow-up.', done: ['echo', 'lv-gram'], roles: MD, points: 5, applies: (s) => has(s, 'scad') },
    {
      // only on the wrong road: stents in the LAD need a second antiplatelet drug, breastfeeding or not
      id: 'md-dapt', label: 'A P2Y12 inhibitor once stents are in', roles: MD, points: 5, applies: (s) => has(s, 'stented'),
      why: 'Stents need dual antiplatelet therapy: aspirin plus a P2Y12 inhibitor (ticagrelor or prasugrel by mouth, or cangrelor IV), whatever the cause of the infarct. In a breastfeeding mother the choice is talked through with her: there are few safety data in breast milk, and clopidogrel is generally not recommended (AHA 2018) — one more reason a stable SCAD is left without a stent.',
      done: ['p2y12', 'cangrelor'],
    },
    { id: 'hemostasis', label: 'Radial band and distal perfusion check', why: 'Patent hemostasis, as always — she has had heparin and aspirin.', done: ['hemostasis'], after: 'proc-over', roles: [3, 4], points: 5, applies: (s) => has(s, 'proc-over') },
    { id: 'defib', label: 'Defibrillate VF within 1 minute', why: 'In the lab VF is witnessed with the pads on: shock it within seconds.', done: ['defib', 'aed'], after: 'arrest', points: 15, target: { within: { flag: 'arrest', minutes: 1 } }, applies: (s) => has(s, 'arrest') },
    { id: 'handoff', label: 'Hand-off to the cardiac care unit', why: 'SCAD extends in 5–10 % of patients in the first week: she stays on telemetry for 3–5 days, not an early discharge. Say what was found and done, that no more heparin is to be given, and what should bring the team back.', done: ['handoff'], roles: [4, 5], points: 5 },
  ],
  harms: yieldToHeavier([
    { id: 'access-no-timeout', actions: ['access', 'access-femoral', 'access-venous'], when: (s) => !has(s, 'timeout'), points: 5, severity: 'major', text: 'Access before the time-out.' },
    { id: 'access-no-consent', actions: ['access', 'access-femoral', 'access-venous'], when: (s) => !has(s, 'consent'), points: 5, severity: 'major', text: 'Access before confirming consent and allergies in an awake patient who can give them.' },
    { id: 'inject-damped', actions: ['angio', ...LEFT_VIEWS], roles: MD, when: (s) => dampedNow(s), points: 10, severity: 'major', text: 'Contrast injected into a damped catheter. With the tip against the wall the jet hits the wall: that is how catheters dissect coronaries, and a fragile artery (a young woman after a pregnancy) tears more easily — catheter-induced dissection is about 3 % in SCAD patients, under 0.2 % in others. Back out, re-seat coaxially, inject gently.' },
    { id: 'forceful-flush', actions: ['clear-air'], roles: MD, points: 8, severity: 'major', text: 'A forceful saline flush down a coronary with no air in it. In a fragile, dissected artery a jet of fluid can extend the dissection (hydraulic extension): gentle injections only.' },
    { id: 'wire-stable-scad', actions: WIRES, roles: MD, when: (s) => !has(s, 'extended'), points: 8, severity: 'major', text: 'A wire down a stable SCAD with TIMI 3 flow. The wire can slip into the false lumen and extend the dissection — and nothing needs it: a stable SCAD with preserved flow is managed without intervention.' },
    { id: 'aspiration-scad', actions: ['aspiration'], roles: MD, when: (s) => !has(s, 'extended'), points: 5, severity: 'major', text: 'An aspiration catheter down a dissected artery. There is no clot to remove — the narrowing is blood in the wall — and the catheter can extend the tear.' },
    { id: 'ivus-scad', actions: ['ivus'], roles: MD, when: (s) => !has(s, 'extended'), points: 4, severity: 'minor', text: 'IVUS for a SCAD the angiogram had already shown. Intracoronary imaging is for an uncertain diagnosis (a short narrowing that looks like plaque: type 3) in a vessel big enough for it, and then only the proximal part: the wire and the catheter can extend the dissection (AHA 2018).' },
    { id: 'oct-scad', actions: ['oct'], roles: MD, when: (s) => !has(s, 'extended'), points: 8, severity: 'major', text: 'OCT for a SCAD the angiogram had already shown. Its forceful contrast flush can push the dissection further along the vessel (hydraulic extension), on top of the risks of the wire and the catheter: image only when the diagnosis is uncertain, and only the proximal part (AHA 2018).' },
    { id: 'pci-stable-scad', actions: ['balloon-predil', 'balloon-nc', 'stent-des', 'stent-covered'], roles: MD, when: (s) => !has(s, 'extended'), points: 15, severity: 'critical', text: 'A balloon or stent in a stable SCAD with TIMI 3 flow. Routine revascularization for SCAD should not be performed (2021 ACC/AHA/SCAI: 3 — Harm): the balloon or stent pushes the blood in the wall up and down the vessel, PCI fails technically in 30–50 % and sends some patients to emergency bypass, and most dissections heal by themselves within weeks. Revascularization may be considered only for ongoing ischemia or hemodynamic instability despite conservative therapy (2b) — or a left main dissection.' },
    { id: 'antithrombotic-after-scad', actions: ['heparin', 'bivalirudin', 'gp2b3a', 'cangrelor'], roles: [4, 5], when: (s) => has(s, 'scad') && !has(s, 'extended'), replaces: [...ANTITHROMBOTIC_RULES, 'heparin-repeat-unguided'], points: 8, severity: 'major', text: 'More anticoagulant or IV antiplatelet after the SCAD was diagnosed. Once SCAD is diagnosed, stopping the heparin given for the STEMI is appropriate when nothing else calls for it (AHA 2018) — it could feed the bleed in the wall — and GP IIb/IIIa inhibitors and cangrelor, drugs for PCI, have no place without one.' },
    // before the diagnosis: the nurse's bolus on top of the one the operator gave (the order's fallback). Bivalirudin after
    // heparin is not scored here: switching to it for a PCI is accepted practice (after the diagnosis it is the harm above)
    { id: 'heparin-twice', actions: ['heparin'], roles: [4], replaces: [...ANTITHROMBOTIC_RULES, 'heparin-repeat-unguided'], when: (s) => has(s, 'heparin') && !has(s, 'scad'), points: 8, severity: 'major', text: 'A second heparin bolus on top of the first. She already had heparin 70 units/kg: check what has been given before you draw up a dose — a double dose doubles the bleeding risk, at the radial artery and in the wall of a fragile coronary.' },
    { id: 'lytic-scad', actions: ['tnk'], roles: MD, points: 15, severity: 'critical', replaces: LYTIC_RULES, text: 'A fibrinolytic in the cath lab, where the artery can be seen and treated. It adds only bleeding — and in SCAD it can make the blood in the wall spread (case reports of extension, rupture and tamponade). In a young woman after a pregnancy with a STEMI, think of SCAD before any lytic.' },
    // the spread hematoma has made the anterior wall ischemic again, with a fast rate and a falling pressure (COMMIT)
    { id: 'beta-blocker-shock-risk', actions: BETA_BLOCKERS, roles: MD, when: (s) => s.pulse && ischemic(s), replaces: [...RATE_RULES, 'oral-beta-blocker-shock-risk'], points: 6, severity: 'major', text: 'A beta-blocker (IV, or by mouth) with the anterior wall ischemic again, a heart rate over 110 and the pressure falling. A failing ventricle leans on its rate: a beta-blocker now risks cardiogenic shock (COMMIT). Restore the flow first, and start the beta-blocker once she is stable.' },
    { id: 'mcs-stable', actions: ['iabp', 'impella'], roles: MD, when: (s) => s.pulse && s.vitals.sbp >= 90, replaces: ['mcs-no-cardiogenic-shock'], points: 8, severity: 'major', text: 'A balloon pump or Impella for a stable patient. Nothing needs support, large-bore femoral access risks an iliac dissection in a woman who may have fibromuscular dysplasia, and a balloon pump can push a coronary dissection further.' },
    { id: 'oxygen-normoxic', actions: ['o2-nc', 'o2-nrb'], when: (s) => s.pulse && s.vitals.spo2 >= 90, points: 2, severity: 'minor', text: 'Oxygen with an SpO₂ of 90 % or more. Oxygen is for SpO₂ below 90 %.' },
    // the tech only opens it — the operator refuses it and nothing reaches the patient — so a small penalty
    { id: 'tech-unasked-device', actions: TECH_PCI, roles: TECH, when: (s) => has(s, 'decided'), points: 3, severity: 'minor', text: 'A guide, wire, balloon or stent opened after the operator had said the artery is left alone. A stable SCAD is not touched: open devices when the operator asks for them.' },
    { id: 'tech-opened-early', actions: TECH_EARLY_WASTE, roles: TECH, when: (s) => !has(s, 'decided'), points: 2, severity: 'minor', text: 'A balloon, stent or aspiration catheter opened before anyone had seen the artery. Open devices when the operator asks for them (and confirm the size): an opened device that is not used is wasted.' },
    askHarm(TECH_ASKS[0], 'The wrong catheter when the operator asked for a JL4. A JL4 engages the left coronary; a JR4 the right; a guide is for an intervention.'),
    askHarm(TECH_ASKS[1], 'A right-coronary view when the operator asked to repeat the LAD. Cranial views lay out the mid and distal LAD.'),
    askHarm(TECH_ASKS[2], 'The wrong catheter when the operator asked for a JR4 for the right coronary.', 2),
    { ...askHarm(RN_ASKS[0], 'Not the drug the operator ordered: unfractionated heparin, 4,800 units. Read the order back before you give it.'), replaces: [...ANTITHROMBOTIC_RULES, ...PROTAMINE_RULES] },
    // the wrong answer is the order's own mistake: one penalty, not the epinephrine rule's as well
    { ...askHarm(RN_ASKS[1], 'Not the drug the operator ordered: nitroglycerin 200 mcg into the coronary, to see whether the narrowing relaxes. Read the order back and check the syringe label.'), replaces: [...nitrateRulesExcept('nitro-hypotension', 'nitro-high-not-hypertensive', 'nitroprusside-hypotension'), ...RATE_RULES, 'ic-epi-no-indication'] },
    { ...askHarm(RN_ASKS[3], 'Not the drug the operator ordered: metoprolol 5 mg IV. Read the order back before you give it.'), replaces: RATE_RULES },
    askHarm(RN_ASKS[4], 'Midazolam when the operator asked for something for the pain. A benzodiazepine calms; it does not treat pain.', 2),
  ]),
  timings: [
    { label: 'Time-out', actions: ['timeout'], target: 6 },
    // from the damping to the catheter backed out, whoever did it (a call-out, the back-out, the operator alone or the VF)
    { label: 'Damped pressure dealt with', actions: [], flag: 'repositioned', target: 1, from: 'damped' },
    { label: 'Arrival to the diagnostic run', actions: [], flag: 'scad', target: 15 },
    { label: 'Shock after VF began', actions: ['defib', 'aed'], target: 1, from: 'arrest', shocksOnly: true },
  ],
  deathAfter: 8,
  completeWhen: (s) => has(s, 'scad') && (s.role === 5 || has(s, 'proc-over')),
  teaching: [
    'SCAD: blood in the wall of a coronary artery (an intramural hematoma, with or without a tear in the lining) squeezes the lumen — not plaque rupture, not clot, not a catheter injury. It causes up to a third of heart attacks in women 50 and younger, and it is the most common cause of a heart attack in pregnancy and the weeks after delivery (where it is more often proximal, a STEMI, with worse LV function).',
    'Think of it in a young woman with few or no risk factors — after a pregnancy, an extreme emotional or physical stress, with migraines or fibromuscular dysplasia — and in tortuous coronaries. The mid-to-distal LAD is the most common site.',
    'On the angiogram (Saw types): 1 — contrast in the wall, two lumens; 2 — a long (usually over 20 mm), smooth, diffuse narrowing, bordered by normal artery (2A) or running to the tip (2B), the most common type; 3 — a short narrowing that looks like plaque and needs IVUS or OCT. Give 100–200 mcg of nitroglycerin into the coronary and repeat: spasm relaxes, blood in the wall does not.',
    'Gentle catheter work: catheter-induced dissection is about 3 % in SCAD patients (under 0.2 % otherwise). No deep engagement, a coaxial tip, never inject into a damped pressure, no forceful injections; femoral access or extra care with the radial. The tech and the nurse call out a damped pressure before anyone injects.',
    'Intracoronary imaging only when the diagnosis is uncertain and the vessel is large enough — and then only the proximal part: the wire and the catheter can extend the dissection, and OCT\'s contrast flush can push it further (AHA 2018).',
    'Stable, with preserved flow: leave it alone. Most SCAD heals by itself within weeks to months (70–97 % on repeat angiography); PCI fails technically in 30–50 %, the stent pushes the hematoma along the vessel, and some patients end up in emergency bypass. Routine revascularization should not be performed (2021 ACC/AHA/SCAI: 3 — Harm); it may be considered for ongoing ischemia or instability despite conservative therapy (2b) — stents well beyond both ends of the hematoma, or bypass for the left main.',
    'Chest pain after SCAD is common and can come from the torn wall itself: treat it, repeat the 12-lead, and go back in only for new ischemia on the ECG, an arrhythmia or failing flow — not for the pain alone.',
    'Heparin is right for the STEMI before anyone has seen the artery. Once SCAD is diagnosed, stopping it is appropriate when nothing else calls for it (AHA 2018: "consideration of discontinuation is appropriate"): no more boluses and no infusion. GP IIb/IIIa inhibitors only with great caution, and no fibrinolytic once SCAD is suspected or seen (case reports of extension and rupture).',
    'Medicines: aspirin (low-dose aspirin is safe while breastfeeding); a second antiplatelet drug without a stent is debated, and clopidogrel is generally not recommended while breastfeeding; a beta-blocker should be considered — fewer recurrences in the Vancouver cohort (HR 0.36) — by mouth on the unit or IV in the lab if the rate and pressure call for it (metoprolol or labetalol, not atenolol, while breastfeeding); a statin only for the usual reasons.',
    'SCAD extends in 5–10 % of patients in the first week: a monitored bed for 3–5 days, not an early discharge. Then imaging from head to pelvis for fibromuscular dysplasia and aneurysms (CT or MR angiography; in a breastfeeding mother MR spares the radiation and contrast, and non-urgent imaging can wait), cardiac rehab, and counseling about another pregnancy and hormones. Iodinated contrast is no reason to stop breastfeeding.',
  ],
};
