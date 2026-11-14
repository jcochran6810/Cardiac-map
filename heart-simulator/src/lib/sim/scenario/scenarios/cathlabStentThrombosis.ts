import type { Effect, Line, PendingRead, Scenario, ScenarioEvent, SimState, Speaker } from '../types';
import { bpAfter, canSwallow, has, line } from '../kit';
import { INTERVENTION_BY_ID } from '../interventions';
import { lastDoneAt } from '../rules/helpers';
import { LEFT_VIEWS, MD, TECH, askCritical, askEvents, askHarm, type LabAsk } from '../labKit';

/**
 * Acute stent thrombosis on the table. A primary PCI of the proximal LAD: the stent went in on the emergency
 * department's heparin dose (4,000 units, not a PCI dose) and with no P2Y12 inhibitor (he vomited, and the ticagrelor was
 * held "for the lab"). Minutes later the pain and the ST elevation come back and the stent fills with clot (TIMI 0).
 *
 * The learner has to name it, then fix it on three fronts: the anticoagulant (check the ACT, top up the heparin), the
 * platelets (an IV drug that works in minutes — cangrelor or a GP IIb/IIIa inhibitor — and the oral load as well), and
 * the stent (reopen it with aspiration or a balloon, image it, and post-dilate the under-expansion the imaging shows with
 * a non-compliant balloon). Reopening it before the drugs are fixed lets it clot again; another stent fixes nothing.
 */

/**
 * The real image: an LAD occluded at the stent (RAO caudal). It comes from another patient's article (a very late stent
 * thrombosis); what it shows — the stent shut, nothing beyond — is what this patient's run shows.
 */
const IMAGES: Partial<Record<string, string>> = { thrombosis: 'stent-thrombosis' };

const IMAGING = ['ivus', 'oct'];

const thrombosisRead: Omit<PendingRead, 'minute'> = {
  kind: 'clinical', answer: 'clin-stent-thrombosis', prompt: 'What is happening?',
  explain: 'Acute stent thrombosis: the fresh stent has filled with clot and the LAD is shut again (TIMI 0) — so the pain and the ST elevation are back. Look for why on three fronts: the anticoagulant (4,000 units of heparin is the emergency department\'s dose, not a PCI dose: check the ACT), the platelets (no P2Y12 inhibitor on board yet) and the stent itself (under-expansion, malapposition, an edge dissection). Fix the drugs, reopen it, image it, then treat what the imaging shows — not another stent on top.',
};

/** The final pictures: TIMI 3 and a good blush — or, after a stent pushed over the clot, a slower distal LAD with a patchy blush */
const finalLine = (s: SimState) => (has(s, 'embolized')
  ? 'Final angiogram in two views: the stent fully open, its edges smooth, no clot in it; the LAD reaches the apex (TIMI 3), but the distal vessel fills a beat late, with a patchy blush at the apex — the clot the second stent squeezed downstream.'
  : 'Final angiogram in two views: the LAD fills briskly to the apex (TIMI 3) with a good myocardial blush; the stent fully open, its edges smooth; no clot.');

/** The learner has named what is happening (the first read): until then nobody in the room says it */
const named = (s: SimState) => s.reads.some((r) => r.answer === 'clin-stent-thrombosis');

/** The stent is shut (TIMI 0) right now */
const occluded = (s: SimState) => has(s, 'occluded');
/** His weight (kg): the heparin dose per kilo */
const KG = 90;

/** Flow is back through the stent right now (it can clot again) */
const flowing = (s: SimState) => has(s, 'open');

/**
 * The heparin is back in the PCI range: topped up (and not reversed with protamine since), or bivalirudin instead. The
 * emergency department's 4,000 units (about 44 units/kg) never was. The latest top-up counts (another after protamine
 * brings it back), and the latest protamine: a flag keeps only its first minute
 */
function anticoagulated(s: SimState): boolean {
  if (has(s, 'bivalirudin')) return true;
  if (!has(s, 'heparin-topup')) return false;
  const topup = Math.max(s.flags['heparin-topup'], lastDoneAt(s, ['heparin']) ?? -Infinity);
  const reversed = Math.max(s.flags.protamine ?? -Infinity, lastDoneAt(s, ['protamine']) ?? -Infinity);
  return !(reversed >= topup);
}

/** A drug that blocks the platelets within minutes is running: cangrelor or a GP IIb/IIIa inhibitor (a tablet takes an hour or more) */
const plateletsBlocked = (s: SimState) => has(s, 'cangrelor') || has(s, 'gp2b3a');

/** Who describes a run: the learner as the cardiologist, otherwise the operator */
const runner = (s: SimState): Speaker => (s.role === 5 ? 'you' : 'operator');

/**
 * A second stent pushed over the fresh clot squeezed some of it downstream: the distal LAD fills a little late, with a
 * patchy blush at the apex, even once the stent itself is fixed
 */
const embolized = (s: SimState) => has(s, 'embolized');

/** What the run shows of the vessel once the stent is fully open */
const openRun = (s: SimState) => (embolized(s)
  ? 'the stent fully open, its edges smooth — but the distal LAD fills a beat late, with a patchy blush at the apex where the clot went downstream'
  : 'brisk flow to the apex; the stent fully open, its edges smooth');

/**
 * Something by mouth: only with a pulse and awake enough to swallow (the engine's default then says why not). The
 * ticagrelor in this case is the nurse's or the operator's too, so their own steps check the same
 */
const canTakeTablet = (s: SimState) => s.pulse && canSwallow(s);

/** An order the nurse has been given and not yet carried out (a wrong answer to it is scored by that order alone) */
const openOrder = (s: SimState, id: string, gives: string) => has(s, `asked-${id}`) && !has(s, gives);

/** Only a patient awake enough to talk says how he feels */
const awake = (s: SimState, text: string): Line[] => (s.pulse && s.vitals.gcs >= 13 ? [['patient', `"${text}"`]] : []);

/** Who gives a drug: the learner, the computer operator, or the computer nurse (when the learner is the tech) */
type By = 'learner' | 'operator' | 'nurse';
const given = (by: By, text: string): Line => (by === 'learner' ? ['you', text] : by === 'operator' ? ['operator', text] : ['team', `Nurse: "${text}"`]);

const inArrest: Effect = { blocked: true, say: [['system', 'Not during the arrest: shock first, then treat the stent.']] };

/**
 * When the action behind a flag was started (the engine counts an action from its start; the flag is set when it is
 * done): the one of `ids` that finished at the flag's minute — otherwise the flag's own minute.
 */
function startedAt(s: SimState, flag: string, ids: string[]): number | null {
  const at = s.flags[flag];
  if (at === undefined) return null;
  const hit = s.performed.find((p) => ids.includes(p.id) && Math.abs(p.minute + INTERVENTION_BY_ID[p.id].minutes - at) < 0.05);
  return hit ? hit.minute : at;
}

// ─── What each step does ───────────────────────────────────────────────────

/** The ACT: 186 s on the emergency department's dose alone; in range once the heparin is topped up (lower with eptifibatide running) */
function actText(s: SimState): { text: string; low: boolean } {
  if (has(s, 'bivalirudin')) return { text: 'ACT 338 s, with bivalirudin running.', low: false };
  if (anticoagulated(s)) return { text: has(s, 'topup-small') ? 'ACT 238 s, with eptifibatide running.' : 'ACT 276 s.', low: false };
  if (has(s, 'protamine')) return { text: 'ACT 132 s.', low: true };
  return { text: 'ACT 186 s.', low: true };
}

function act(s: SimState, who: Speaker, prefix = ''): Effect {
  const { text, low } = actText(s);
  // a low ACT guides another heparin bolus (the built-in heparin-repeat-unguided reads the timer)
  return { say: [[who, prefix ? `${prefix}"${text}"` : text]], ...(low ? { flags: ['act', 'act-low'], timers: { actLowAt: s.minute } } : { flags: ['act'] }) };
}

/**
 * The heparin top-up: back to 70–100 units/kg in all (4,000 more units for his 90 kg) — or, with eptifibatide already
 * running, the smaller top-up that aims for an ACT of 200–250 s
 */
function heparin(s: SimState, by: By): Effect {
  const small = has(s, 'gp2b3a');
  // the units given so far, the emergency department's 4,000 first: each top-up adds to them
  const total = (s.timers.heparinUnits ?? 4000) + (small ? 2000 : 4000);
  const perKg = Math.round(total / KG / 10) * 10;
  const text = small
    ? 'Heparin 2,000 units IV, flushed — a smaller top-up with eptifibatide running.'
    : `Heparin 4,000 units IV, flushed: ${total.toLocaleString('en-US')} units in all, about ${perKg} units/kg.`;
  return { say: [given(by, text)], flags: ['heparin', 'heparin-topup', ...(small ? ['topup-small'] : [])], timers: { heparinUnits: total } };
}

const cangrelor = (by: By): Effect => ({
  say: [given(by, 'Cangrelor 30 mcg/kg IV bolus, then 4 mcg/kg/min running.')], flags: ['cangrelor', 'iv-platelets'],
});

const eptifibatide = (by: By): Effect => ({
  say: [given(by, 'Eptifibatide 180 mcg/kg IV bolus (a second in 10 minutes), then 2 mcg/kg/min running.')], flags: ['gp2b3a', 'iv-platelets'],
});

/**
 * The missed oral load. Ticagrelor can go in during the cangrelor infusion (prasugrel and clopidogrel could not: cangrelor
 * blocks their effect until it stops). By itself it is too slow for clot forming now: an hour or more, longer after
 * opioids and vomiting
 */
function ticagrelor(s: SimState, by: By): Effect {
  const text = `Ticagrelor 180 mg, crushed and swallowed with a sip of water${has(s, 'cangrelor') ? ' — it can go in while the cangrelor runs' : ''}.`;
  const slow: Line[] = [];
  if (!plateletsBlocked(s) && by === 'learner') {
    if (s.role === 5) slow.push(['team', 'Nurse: "In. It won\'t work for an hour or more, though — longer after the fentanyl and the vomiting."']);
    if (s.role === 4 && has(s, 'asked-rn-platelets')) slow.push(['operator', 'Good — he needs that too. But a tablet takes an hour or more to work: I need his platelets blocked IV, now.', 'warn']);
  }
  return { say: [given(by, text), ...slow], flags: ['p2y12'] };
}

/** Flow back through the stent (aspiration, a balloon): slow at first, with a hazy, narrow segment in the middle of it */
function reopen(s: SimState, how: Line, flags: string[]): Effect {
  const bp = { sbp: Math.max(s.vitals.sbp, 116), dbp: Math.max(s.vitals.dbp, 72) };
  return {
    say: [how, ['monitor', `Heart rate 92. BP ${bp.sbp}/${bp.dbp}.`], ...awake(s, 'It\'s easing a bit.')],
    rhythm: { profile: 'anterior-stemi-reperfused', hr: 92 }, vitals: { ...bp, pain: Math.min(s.vitals.pain, 4) },
    clear: ['occluded'], flags: ['open', 'reopened', ...flags],
  };
}

const aspirate = (s: SimState, who: Speaker): Effect => reopen(s, [who, 'Aspiration catheter down the wire through the stent: dark red clot fills the syringe — two passes. Next run: flow to the apex again, slow at first, with a hazy, narrow segment in the middle of the stent.'], ['aspirated']);

/**
 * A non-compliant balloon at high pressure inside the stent: it reaches its size and no further, so the under-expanded
 * middle opens without tearing the vessel at the edges (and in a shut stent it squeezes the clot aside as well)
 */
function postDilate(s: SimState, who: Speaker): Effect {
  const bp = { sbp: Math.max(s.vitals.sbp, 122), dbp: Math.max(s.vitals.dbp, 76) };
  const how = occluded(s)
    ? 'Non-compliant 3.5 × 15 balloon inside the shut stent, two inflations at 20 atmospheres along its length: the clot is squeezed aside and the waist on the balloon opens out. Next run: flow to the apex again.'
    : embolized(s)
      ? 'Non-compliant 3.5 × 15 balloon inside both layers of stent, two inflations at 20 atmospheres along their length: the waist on the balloon opens out at the second. Next run: the hazy, narrow segment is gone — but the distal LAD still fills a beat late, with a patchy blush at the apex.'
      : 'Non-compliant 3.5 × 15 balloon inside the stent, two inflations at 20 atmospheres along its length: the waist on the balloon opens out at the second. Next run: brisk flow to the apex; the hazy, narrow segment is gone.';
  return {
    say: [[who, how], ['monitor', `Heart rate 84. BP ${bp.sbp}/${bp.dbp}.`], ...awake(s, embolized(s) ? 'That\'s better — still a bit of an ache.' : 'That\'s much better.')],
    // the clot squeezed downstream leaves a little of the apex without flow, and it still aches
    rhythm: { profile: 'anterior-stemi-reperfused', hr: 84 }, vitals: { ...bp, pain: Math.min(s.vitals.pain, embolized(s) ? 3 : 2) },
    clear: ['occluded'], flags: ['open', 'reopened', 'postdilated', 'expanded'],
  };
}

/**
 * What IVUS or OCT shows: nothing it can be trusted for through a stent full of clot; with flow back, the cause (an
 * under-expanded stent over a band of calcium — no edge dissection); after the non-compliant balloon, the result. OCT
 * measures a little smaller than IVUS, so its numbers are its own (and under its 4.5 mm² threshold, not on it)
 */
function imagingFinding(s: SimState, kind: 'ivus' | 'oct', who: Speaker): Effect {
  if (occluded(s)) {
    // IVUS sees through blood and clot, but in a stent packed with fresh clot it cannot size the lumen or judge the
    // edges, and pushing a catheter through fresh clot can send it downstream; OCT needs flow to flush the blood away
    return {
      say: [[who, kind === 'ivus'
        ? 'IVUS: the catheter crosses, but the stent is packed with clot — the struts show through it, the lumen and the edges cannot be judged, and pushing through fresh clot risks sending it downstream. Get flow back first, then look.'
        : 'OCT: the flush cannot clear a vessel with no flow — the picture is all blood. Get flow back first, then look.']],
      flags: [kind],
    };
  }
  if (has(s, 'expanded')) {
    return {
      say: [[who, kind === 'ivus'
        ? 'IVUS: the stent is well expanded now — minimum stent area 7.4 mm² (94 % of the distal reference); struts fully apposed; no edge dissection; no clot left.'
        : 'OCT: the stent is well expanded now — minimum stent area 6.9 mm² (93 % of the distal reference); struts fully apposed; no edge dissection; no clot left.', 'good']],
      flags: [kind, 'imaged', 'confirmed'],
    };
  }
  const layers = has(s, 'more-metal') ? ' Two layers of stent now, both pinched at the same spot.' : '';
  return {
    say: [[who, kind === 'ivus'
      ? `IVUS: the stent is under-expanded — minimum stent area 4.6 mm² in its middle, over a band of calcium (an arc of about 120°), against a distal reference lumen of 7.9 mm² (58 %); fresh clot between the struts; struts apposed; no dissection at either edge; the vessel beyond is free of disease.${layers}`
      : `OCT: the stent is under-expanded — minimum stent area 4.1 mm² in its middle, over a band of calcium (an arc of about 120°, 0.6 mm thick), against a distal reference lumen of 7.4 mm² (55 %); red clot protruding between the struts; struts apposed; no dissection at either edge.${layers}`]],
    flags: [kind, 'imaged', 'underexpansion'],
  };
}

/** The learner's IVUS or OCT: the tech preps it and hands it up (the operator runs it once asked); the cardiologist runs it */
function imaging(s: SimState, kind: 'ivus' | 'oct'): Effect | null {
  if (!s.pulse) return inArrest;
  if (s.role === 3) {
    const prep: Line = ['you', kind === 'ivus' ? 'IVUS catheter flushed, prepped and handed up; pullback set.' : 'OCT catheter flushed, prepped and handed up; contrast flush loaded.'];
    const waiting = (has(s, 'asked-imaging') && !has(s, 'imaging-in-hand')) || (has(s, 'asked-confirm') && !has(s, 'confirm-in-hand'));
    if (waiting) return { say: [prep], flags: [`${kind}-ready`] };
    return { say: [prep, ['operator', occluded(s) ? 'Keep it ready — I need flow before it can show me anything.' : 'Thanks — keep it on the table.']], flags: [`${kind}-ready`] };
  }
  return s.role === 5 ? imagingFinding(s, kind, 'monitor') : null;
}

/**
 * Another stent — a drug-eluting one, or a covered one: it does not fix an under-expanded stent, and stenting into fresh
 * clot squeezes it downstream (a covered stent does the same, and clots more). The tech only opens it: the operator refuses it
 */
function anotherStent(s: SimState, covered: boolean): Effect | null {
  const what = covered ? 'A covered stent' : 'A second drug-eluting stent';
  if (s.role === 3) {
    return { say: [['you', `${covered ? 'Covered (PTFE) stent' : 'Drug-eluting stent'} opened and prepped.`], ['operator', covered
      ? 'Put that away — there\'s no perforation. Nobody puts a covered stent in a stent that has just clotted.'
      : 'Put that away — nobody puts a second stent in before we know why the first one clotted.', 'warn']] };
  }
  if (s.role !== 5) return null;
  if (!s.pulse) return inArrest;
  if (occluded(s)) {
    return {
      say: [
        ['you', `${what}, 3.5 × 24, deployed over the clot at nominal pressure. Next run: the segment opens, but the contrast crawls beyond it and the distal LAD fills late — clot squeezed downstream.`, 'bad'],
        ['monitor', `Heart rate 100. BP ${Math.max(s.vitals.sbp, 104)}/${Math.max(s.vitals.dbp, 66)}.`],
      ],
      rhythm: { profile: 'anterior-stemi', hr: 100 }, vitals: { sbp: Math.max(s.vitals.sbp, 104), dbp: Math.max(s.vitals.dbp, 66), pain: Math.min(10, Math.max(s.vitals.pain, 6)) },
      clear: ['occluded'], flags: ['open', 'reopened', 'more-metal', 'embolized', ...(covered ? ['covered-stent'] : [])],
    };
  }
  if (has(s, 'expanded')) return { say: [['you', `${what} deployed inside the first. Next run: the same as before it — there was nothing left for it to fix.`]], flags: ['more-metal', ...(covered ? ['covered-stent'] : [])] };
  return {
    say: [['you', `${what} deployed inside the first at nominal pressure. Next run: no better — the middle of the segment still looks narrow and hazy, now under two layers of metal.`, 'bad']],
    vitals: { pain: Math.min(10, s.vitals.pain + 1) }, flags: ['more-metal', ...(covered ? ['covered-stent'] : [])],
  };
}

/** Another projection of the LAD (cardiologist): what the run shows now, in words */
function viewOfStent(s: SimState, id: string, label: string): Effect | null {
  if (s.role !== 5 || !s.pulse || !has(s, 'access')) return null;
  const what = occluded(s)
    ? 'The contrast stops inside the stent at a rounded filling defect; nothing fills beyond it.'
    : !has(s, 'expanded')
      ? `Flow to the apex; a hazy, narrow segment in the middle of the stent; its edges look smooth.${embolized(s) ? ' The distal LAD fills a beat late.' : ''}`
      : `${openRun(s).charAt(0).toUpperCase()}${openRun(s).slice(1)}.`;
  return { say: [['monitor', `Cine recorded: ${label}. ${what}`]], image: { id, view: label }, flags: ['cine', id] };
}

/** A shock for the VF the shut LAD set off: a rhythm and a pressure come back, the stent is still as it was */
function shockOutcome(s: SimState): Effect | null {
  if (s.pulse || s.rhythm.profile !== 'vf') return null;
  const shut = occluded(s);
  return {
    say: [['monitor', 'Shock delivered: 200 J.'], ['you', `An organized rhythm is back: 84/52 on the arterial line.${shut ? ' The LAD is still shut.' : ''}`, 'warn']],
    rhythm: shut ? { profile: 'anterior-stemi', hr: 112 } : { profile: 'anterior-stemi-reperfused', hr: 96 }, pulse: true,
    vitals: { sbp: 84, dbp: 52, gcs: 13, pain: 8 }, flags: ['pads', 'monitor', 'shocked'],
  };
}

/**
 * With the drugs still missing (the ACT low, or nothing IV blocking the platelets) the reopened stent clots again two
 * minutes later. Up to three times; reopened with the drugs on board, it stays open.
 */
const reocclusion = (n: number): ScenarioEvent => ({
  id: `reocclusion-${n}`,
  when: (s) => s.pulse && flowing(s) && !(anticoagulated(s) && plateletsBlocked(s)) && s.minute >= s.flags.open + 2
    && (n === 1 || s.fired.includes(`reocclusion-${n - 1}`)),
  effect: (s) => {
    const sbp = Math.min(s.vitals.sbp, 100);
    const dbp = Math.min(s.vitals.dbp, 64);
    return {
      say: [
        [runner(s), 'Next run: the stent has filled again — the contrast stops inside it, and nothing beyond.', 'bad'],
        ['monitor', `Heart rate 106. BP ${sbp}/${dbp}.`, 'bad'],
        ...awake(s, 'It\'s back — the same pain!'),
      ],
      rhythm: { profile: 'anterior-stemi', hr: 106 }, vitals: { sbp, dbp, pain: Math.max(s.vitals.pain, 8) },
      clear: ['open'], flags: ['occluded', 'reoccluded'],
    };
  },
});

// ─── The tech's and the nurse's parts ──────────────────────────────────────

const TECH_ASKS: LabAsk[] = [
  {
    // at once, and nothing in it names what is happening: the ACT comes first whatever it is
    id: 'act', when: (s) => has(s, 'thrombosis'), early: true,
    ask: 'Run an ACT — now, please.',
    accept: ['act'],
    thanks: 'One-eighty-six — that\'s the emergency department\'s heparin and nothing more. Nurse, top it up.', fallback: 'I\'ll get the ACT run myself.', gives: 'act-known',
    fallbackEffect: (s) => act(s, 'operator'),
    label: 'ACT at once', points: 10,
    why: 'A stent that shuts on the table: the ACT first. 4,000 units of heparin is the emergency department\'s dose for an ACS, not a PCI dose; during PCI the ACT should be 250–300 s on heparin alone (200–250 s with a GP IIb/IIIa inhibitor).',
  },
  {
    id: 'aspiration', when: (s) => has(s, 'act-known') && named(s), early: true,
    ask: 'Heparin\'s going in, cangrelor\'s running. Aspiration catheter, please — I want that clot out.',
    accept: ['aspiration'], wrong: ['balloon-predil', 'balloon-nc'],
    wrongSay: 'Not a balloon yet — the aspiration catheter: I want the clot out before I squash it into the wall.',
    thanks: 'Thanks — aspirating.', fallback: 'I\'ll open the aspiration catheter myself.', gives: 'aspiration-in-hand',
    label: 'Aspiration catheter, as ordered', points: 10,
    why: 'With a stent full of fresh clot, aspiration pulls the thrombus out before a balloon squeezes it into the wall or downstream. Routine aspiration brings no benefit (TASTE, TOTAL); a large thrombus is the time for it.',
  },
  {
    id: 'imaging', when: (s) => has(s, 'reopened'), early: true,
    ask: 'Flow\'s back — but I want to know why it clotted. IVUS on the table, please.',
    accept: IMAGING,
    thanks: 'Thanks — running the pullback.', fallback: 'I\'ll set up the IVUS myself.', gives: 'imaging-in-hand',
    label: 'IVUS or OCT set up to find the cause', points: 15,
    why: 'A stent that clots on the table usually has a mechanical cause as well as a drug one: under-expansion, malapposition, an edge dissection, plaque or clot through the struts. IVUS or OCT shows which — and which fix it needs.',
  },
  {
    id: 'nc', when: (s) => has(s, 'underexpansion'), early: true,
    // the same words whichever catheter the tech handed: IVUS and OCT give different numbers
    ask: 'Under-expanded over that calcium, and no edge dissection. Non-compliant balloon, 3.5 by 15, please: I\'m going to 20 atmospheres.',
    accept: ['balloon-nc'], wrong: ['balloon-predil'],
    wrongSay: 'No — non-compliant. A compliant balloon at 20 atmospheres grows past its size and tears the vessel at the stent edges.',
    thanks: '3.5 by 15 non-compliant — confirmed.', fallback: 'I\'ll open the balloon myself.', gives: 'nc-in-hand',
    label: 'Non-compliant balloon for the under-expanded stent', points: 10,
    why: 'An under-expanded stent is opened with a non-compliant balloon at high pressure: it reaches its size and no further, so the stent opens without stretching the vessel at its edges. Another stent does not fix it.',
  },
  {
    id: 'confirm', when: (s) => has(s, 'expanded'),
    ask: 'Once more with the imaging catheter, please — I want the numbers after the balloon.',
    accept: IMAGING,
    thanks: 'Thanks.', fallback: 'I\'ll run the imaging again myself.', gives: 'confirm-in-hand',
    label: 'IVUS again to confirm the expansion', points: 5,
    why: 'Check the result: a minimum stent area of at least 90 % of the distal reference (and over 5.5 mm² by IVUS outside the left main), no edge dissection, no clot left.',
  },
];

const RN_ASKS: LabAsk[] = [
  {
    // after the read: the order itself says what is wrong. A tablet is not wrong (he needs it too) — only not what was asked
    id: 'rn-platelets', role: 4, when: (s) => has(s, 'thrombosis') && named(s), early: true,
    // true whether or not the tablet has just gone in: nothing blocks his platelets yet
    ask: 'Nothing is blocking his platelets yet, and that stent is clotting as we watch. I need them blocked now — IV, something that works in minutes.',
    accept: ['cangrelor', 'gp2b3a'], wrong: ['bivalirudin'],
    wrongSay: 'That\'s an anticoagulant, not a platelet drug — the heparin covers that. Cangrelor, or eptifibatide.',
    thanks: 'Thanks — that works in minutes.', fallback: 'I\'ll start the cangrelor myself.', gives: 'platelets-given',
    fallbackEffect: () => cangrelor('operator'),
    label: 'IV platelet blocker for the clot (cangrelor or eptifibatide)', points: 15,
    why: 'With no P2Y12 inhibitor on board, an IV drug blocks the platelets within minutes: cangrelor (an IV P2Y12 inhibitor) or a GP IIb/IIIa inhibitor (eptifibatide). A ticagrelor tablet takes an hour or more — longer after opioids and vomiting.',
  },
  {
    // not asked once the tablet is in already (a nurse who gave it early): the order would ask for what he has had
    id: 'rn-ticagrelor', role: 4, when: (s) => has(s, 'platelets-given') && !has(s, 'p2y12'), early: true,
    ask: 'And the ticagrelor he never got: 180 milligrams, crushed, now please — it can go in with the IV drug running.',
    accept: ['p2y12'],
    thanks: 'Thanks.', fallback: 'I\'ll have the ticagrelor given myself.', gives: 'ticagrelor-given',
    fallbackEffect: (s) => (canTakeTablet(s) ? { say: [['operator', 'Ticagrelor 180 mg, crushed, given.']], flags: ['p2y12'] } : {}),
    label: 'Ticagrelor 180 mg loading dose, as ordered', points: 5,
    why: 'The IV drug bridges; the tablet carries him through the next year. Ticagrelor can go in during the cangrelor infusion; prasugrel or clopidogrel only once it stops, or the cangrelor blocks their effect.',
  },
  {
    // protamine has its own penalty (protamine-in-thrombosis): the operator's word only, no second one for the same choice
    id: 'rn-heparin', role: 4, when: (s) => has(s, 'act-low') && named(s), early: true,
    ask: 'One-eighty-six — that\'s only the emergency department\'s 4,000 units. Top up the heparin, please.',
    accept: ['heparin'], wrong: ['protamine'],
    wrongSay: 'No — protamine reverses it! He needs more heparin, not less.',
    thanks: 'Thanks.', fallback: 'I\'ll give the heparin myself.', gives: 'heparin-given',
    // bivalirudin given instead closes the order (respond.bivalirudin): the operator never stacks heparin on top of it
    fallbackEffect: (s) => heparin(s, 'operator'),
    label: 'Heparin top-up for an ACT of 186', points: 10,
    why: 'During PCI the ACT should be 250–300 s on heparin alone (200–250 s with a GP IIb/IIIa inhibitor). 4,000 units is the emergency department\'s ACS dose; a PCI needs 70–100 units/kg — about 8,000 units for his 90 kg.',
  },
  {
    id: 'rn-pain', role: 4, when: (s) => has(s, 'platelets-given') && has(s, 'p2y12'), early: true,
    ask: 'And something for his pain, please.',
    accept: ['fentanyl'], wrong: ['midazolam'],
    wrongSay: 'That\'s a sedative — it won\'t touch the pain. Fentanyl, 25 to 50 micrograms.',
    thanks: 'Thanks.', fallback: 'I\'ll give him fentanyl myself.',
    fallbackEffect: (s) => ({ say: [['operator', 'Fentanyl 50 mcg IV.']], vitals: { pain: Math.max(0, s.vitals.pain - 3) }, flags: ['analgesia'] }),
    gives: 'pain-treated',
    label: 'Fentanyl for the pain', points: 5,
    why: 'Opening the artery is what ends ischemic pain; until then a small IV opioid dose eases it. Opioids slow the absorption of P2Y12 tablets — one more reason the IV platelet drug comes first.',
  },
];

// ─── The case ──────────────────────────────────────────────────────────────

const CASE_LINES: Line[] = [
  ['team', 'Primary PCI from the right radial: 58-year-old man, anterior STEMI, 2 hours of pain; 90 kg. In the emergency department: aspirin 324 mg chewed, heparin 4,000 units IV (the ACS protocol dose: 60 units/kg, at most 4,000) and fentanyl 50 mcg. He vomited, and the ticagrelor was held "for the cath lab."'],
  ['team', 'The proximal LAD was occluded. The wire crossed, a 2.5 mm balloon brought flow back, and a 3.5 × 24 mm drug-eluting stent went in at 12 atmospheres six minutes ago: TIMI 3 flow to the apex, and the pain eased to 2 out of 10.'],
];

export const cathlabStentThrombosis: Scenario = {
  id: 'stent-thrombosis-cathlab',
  title: 'Primary PCI: the LAD shuts again after the stent',
  summary: '58-year-old man with an anterior STEMI. Minutes after the stent the pain and the ST elevation come back and the LAD is shut again. Find out why — in the drugs and in the stent — and fix both without piling on metal.',
  setting: 'cathlab',
  roles: [3, 4, 5],
  difficulty: 'advanced',
  conditionId: 'anterior-stemi',
  images: IMAGES,
  briefing: {
    default: [...CASE_LINES, ['scene', 'He is awake, pale and anxious. The operator takes one more run of the LAD before post-dilating the stent.']],
    3: [
      ...CASE_LINES,
      ['scene', 'He is awake, pale and anxious. The operator takes one more run of the LAD before post-dilating the stent.'],
      ['team', 'You are the scrub tech: the ACT, the devices the cardiologist asks for, and calling out every change you see. The nurse is at his side.'],
    ],
    4: [
      ...CASE_LINES,
      ['scene', 'He is awake, pale and anxious. The operator takes one more run of the LAD before post-dilating the stent.'],
      ['team', 'You are the procedural nurse: the drugs the cardiologist orders, and his rhythm, pressure and pain. The tech is scrubbed at the table.'],
    ],
    5: [
      ...CASE_LINES,
      ['scene', 'He is awake, pale and anxious. You take one more run of the LAD before post-dilating the stent.'],
      ['team', 'You are the interventional cardiologist: every choice from here is yours. The tech and the nurse are with you.'],
    ],
  },
  initial: {
    rhythm: { profile: 'anterior-stemi-reperfused', hr: 84 },
    vitals: { sbp: 126, dbp: 78, spo2: 96, rr: 18, etco2: 34, pain: 2, gcs: 15, glucose: 142, temp: 36.8 },
  },
  // what the built-in safety rules read (types.ts Problem)
  problems: ['acs', 'large-thrombus-burden'],
  facts: {
    allergies: 'No allergies. Yes — whatever you need to do.',
    sample: 'No allergies. Lisinopril and atorvastatin; high blood pressure and cholesterol; quit smoking two years ago. "I threw up downstairs — they said I\'d get the blood-thinner pill up here."',
    opqrst: (s) => (occluded(s)
      ? 'It\'s back — crushing, right in the middle of my chest, same as this morning.'
      : 'It started two hours ago — crushing, in the middle of my chest, into my left arm. It eased when you opened it up.'),
    labs: 'Hemoglobin 14.2, platelets 245, creatinine 0.9, potassium 4.1, glucose 142. Troponin rising.',
    lungs: 'Clear on both sides.',
    ecg12: (s) => (s.rhythm.profile === 'anterior-stemi'
      ? `${s.rhythm.hr > 100 ? 'Sinus tachycardia' : 'Sinus rhythm'} ${s.rhythm.hr}: the ST segments in V1–V4, I and aVL are back up, with reciprocal depression in III and aVF — the anterior wall is ischemic again.`
      : `Sinus rhythm ${s.rhythm.hr}: the ST elevation in V1–V4 has come down by more than half, with early T-wave inversion — the anterior wall is reperfused.`),
    echo: (s) => (occluded(s)
      ? 'The anterior wall, the septum and the apex barely move; LVEF about 35 %. No pericardial effusion; no mitral regurgitation.'
      : 'Anterior and apical hypokinesis; LVEF about 45 %. No pericardial effusion; no mitral regurgitation.'),
    lvedp: (s) => (occluded(s) ? `LV ${s.vitals.sbp}/26 mmHg: LVEDP 26 mmHg.` : `LV ${s.vitals.sbp}/18 mmHg: LVEDP 18 mmHg.`),
    final: finalLine,
  },
  status: (s) => {
    if (!s.pulse) return 'Unresponsive.';
    if (occluded(s)) return '"It\'s crushing again — like this morning."';
    if (has(s, 'expanded')) return '"The pain\'s nearly gone."';
    return '"It\'s easing."';
  },
  respond: {
    act: (s) => act(s, 'you'),
    heparin: (s) => heparin(s, 'learner'),
    bivalirudin: (s) => {
      const bival: Line = ['you', 'Bivalirudin 0.75 mg/kg IV bolus, then 1.75 mg/kg/h running — no more heparin.'];
      // the nurse's answer to the heparin order (unless the platelet order is open too: that one has its own word): the
      // operator lets it stand rather than stack heparin on top of it, and the order is closed
      if (s.role === 4 && openOrder(s, 'rn-heparin', 'heparin-given') && !openOrder(s, 'rn-platelets', 'platelets-given')) {
        return {
          say: [bival, ['operator', 'Bivalirudin? I asked for heparin. It\'s in now, so no heparin on top of it — but check an order with me before you switch his anticoagulant.', 'warn']],
          flags: ['bivalirudin', 'anticoagulated', 'heparin-given'],
        };
      }
      return { say: [bival], flags: ['bivalirudin', 'anticoagulated'] };
    },
    cangrelor: () => cangrelor('learner'),
    gp2b3a: () => eptifibatide('learner'),
    // by mouth: not in the arrest, nor too drowsy to swallow (the engine's default says why)
    p2y12: (s) => (canTakeTablet(s) ? ticagrelor(s, 'learner') : null),
    aspiration: (s) => {
      if (s.role !== 5) return null;
      if (!s.pulse) return inArrest;
      if (occluded(s)) return aspirate(s, 'you');
      return { say: [['you', 'Another aspiration run through the stent: a few small fragments; the flow looks the same.']], flags: ['aspirated'] };
    },
    'balloon-predil': (s) => {
      if (s.role !== 5) return null;
      if (!s.pulse) return inArrest;
      if (occluded(s)) return reopen(s, ['you', 'Compliant 2.5 × 15 balloon inside the stent at 8 atmospheres: the clot is pushed aside. Next run: flow to the apex again, slow at first, with a hazy, narrow segment in the middle of the stent.'], ['predilated']);
      return { say: [['you', has(s, 'expanded') ? 'Compliant balloon inside the stent: no change — the stent is already open.' : 'Compliant balloon inside the stent at nominal pressure: the waist in the middle of the stent does not change.']], flags: ['predilated'] };
    },
    'balloon-nc': (s) => {
      if (s.role !== 5) return null;
      if (!s.pulse) return inArrest;
      if (has(s, 'expanded') && flowing(s)) return { say: [['you', 'Another high-pressure inflation: no change — the stent is already fully open.']], flags: ['postdilated'] };
      return postDilate(s, 'you');
    },
    'stent-des': (s) => anotherStent(s, false),
    'stent-covered': (s) => anotherStent(s, true),
    ivus: (s) => imaging(s, 'ivus'),
    oct: (s) => imaging(s, 'oct'),
    // the wire never came out: it is still across the stent, in the distal LAD
    'wire-workhorse': (s) => (s.role === 5 ? { blocked: true, say: [['system', 'The wire is still across the stent, in the distal LAD: keep it there.']] } : null),
    'wire-hydrophilic': (s) => (s.role === 5 ? { blocked: true, say: [['system', 'The wire is still across the stent, in the distal LAD: keep it there.']] } : null),
    ...Object.fromEntries(LEFT_VIEWS.map((id) => [id, (s: SimState) => viewOfStent(s, id, INTERVENTION_BY_ID[id].label.split(' — ')[0])])),
    angio: (s) => {
      if (!s.pulse) return { blocked: true, say: [['system', 'Not during the arrest: treat the rhythm first.']] };
      const lad = occluded(s)
        ? 'the LAD stops inside the stent at a rounded filling defect, with nothing beyond'
        : !has(s, 'expanded') ? 'the LAD fills to the apex through a hazy, narrow segment in the middle of the stent' : `the LAD: ${openRun(s)}`;
      return { say: [['you', `Both coronaries in standard views: ${lad}; the right coronary has mild disease only.`]], image: { id: 'angio', view: 'Diagnostic angiography: both coronaries in standard views' }, flags: ['cine'] };
    },
    'final-angio': (s) => {
      if (!has(s, 'expanded') || !flowing(s)) return { blocked: true, say: [['system', s.role === 5 ? 'Not the final pictures yet: the stent is not fixed.' : 'The operator is not ready for the final pictures yet.']] };
      // the tech runs the final cine once the operator has the numbers after the balloon, not before
      if (s.role !== 5 && !has(s, 'confirmed')) return { blocked: true, say: [['system', 'The operator is not ready for the final pictures yet: the imaging after the balloon comes first.']] };
      return s.role === 5 ? { say: [['you', finalLine(s), embolized(s) ? 'warn' : 'good']], image: { id: 'final-angio', view: 'Final angiogram' }, flags: ['final-angio'] } : null;
    },
    // nitroglycerin into a shut stent: the pressure falls a little and the flow is no different (spasm is not what shut it)
    'ic-nitro': (s) => {
      if (!s.pulse || !occluded(s)) return null;
      const bp = bpAfter(s, -10, -6);
      // the tech or the nurse draws it up and hands it to the operator, who injects it
      const injected: Line[] = s.role === 5
        ? [['you', 'Nitroglycerin 200 mcg intracoronary.']]
        : [['you', 'Nitroglycerin 200 mcg drawn up, labeled and handed to the operator — dose read back.'], ['operator', 'Injecting down the guide.']];
      return {
        say: [...injected, ['monitor', `BP ${bp.sbp}/${bp.dbp}.`], [runner(s), 'Next run: no change — the contrast still stops inside the stent.', 'bad']],
        vitals: bp, flags: ['ic-nitro'],
      };
    },
    // the radial band goes on once the guide and the sheath come out, after the final pictures — not while the operator works
    hemostasis: (s) => (has(s, 'final-angio') ? null : { blocked: true, say: [['system', 'Not yet: the operator is still working through the radial sheath. The band goes on once the guide and the sheath come out, after the final pictures.']] }),
    callout: (s) => {
      if (has(s, 'thrombosis') && !has(s, 'thrombosis-called')) return { say: [['operator', 'I see it — thanks. Keep calling the pressure and the rhythm.']], flags: ['callout', 'thrombosis-called'] };
      return null;
    },
    defib: shockOutcome,
    aed: shockOutcome,
  },
  events: [
    {
      // where the case stands: set up, on the emergency department's heparin, the wire across and the stent in — no P2Y12 inhibitor
      id: 'setup', when: () => true,
      effect: () => ({
        flags: ['consent', 'timeout', 'iv', 'prep', 'transducer', 'monitor', 'pads', 'access', 'catheter', 'angio', 'heparin',
          'guide', 'guide-left', 'wired', 'predilated', 'stented', 'pci', 'cine'],
      }),
    },
    {
      // the run before the post-dilation: the stent has filled with clot. Nothing here names it: the learner reads the run
      id: 'thrombosis', when: () => true,
      effect: (s) => ({
        say: [
          s.role === 5 ? line('you', 'One more run of the LAD before you post-dilate…') : line('operator', 'One more look before I post-dilate…'),
          ['monitor', IMAGES.thrombosis
            ? 'Cine recorded: the LAD, six minutes after the stent — look at the run (Imaging). Heart rate 104. BP 104/66.'
            : 'The contrast stops abruptly inside the stent at a rounded filling defect, and nothing fills beyond it. Heart rate 104. BP 104/66.', 'bad'],
          ['patient', '"The pain\'s back — crushing, like this morning!"'],
          ...(s.role === 5 ? [line('team', 'Tech: "Doctor — he\'s grabbing his chest, and look at the monitor!"', 'warn')] : []),
        ],
        rhythm: { profile: 'anterior-stemi', hr: 104 }, vitals: { sbp: 104, dbp: 66, pain: 8 },
        image: { id: 'thrombosis', view: 'The LAD six minutes after the stent', image: IMAGES.thrombosis },
        flags: ['thrombosis', 'occluded'], read: thrombosisRead,
      }),
    },
    // The teammates' parts (before the asks, so the story reads in order). With the learner as the tech, the nurse gives
    // the drugs the operator orders
    {
      id: 'rn-platelets-for-tech', when: (s) => s.role === 3 && named(s),
      effect: () => ({ say: [['team', 'Nurse: "Cangrelor bolus in and the infusion running, on the doctor\'s order — he never had his ticagrelor."']], flags: ['cangrelor', 'iv-platelets'] }),
    },
    {
      id: 'rn-heparin-for-tech', when: (s) => s.role === 3 && has(s, 'act-low') && has(s, 'act-known') && !anticoagulated(s),
      effect: () => ({ say: [['team', 'Nurse: "Heparin 4,000 units in."']], flags: ['heparin-topup'] }),
    },
    {
      id: 'rn-ticagrelor-for-tech', when: (s) => s.role === 3 && has(s, 'cangrelor') && s.minute >= s.flags.cangrelor + 1 && canTakeTablet(s),
      effect: () => ({ say: [['team', 'Nurse: "Ticagrelor 180, crushed, given."']], flags: ['p2y12'] }),
    },
    {
      // with the learner as the nurse, the tech runs the ACT
      id: 'tech-act-for-rn', when: (s) => s.role === 4 && has(s, 'thrombosis') && !has(s, 'act') && s.minute >= s.flags.thrombosis + 1,
      effect: (s) => act(s, 'team', 'Tech: '),
    },
    ...TECH_ASKS.flatMap(askEvents),
    ...RN_ASKS.flatMap(askEvents),

    // The operator's procedure when the learner is the tech or the nurse: reopen once the clot can be dealt with (the tech
    // has handed the catheter; the drugs are in), then image, post-dilate, image again and take the final pictures
    {
      id: 'md-reopen', when: (s) => s.role !== 5 && s.pulse && occluded(s) && (s.role === 3 ? has(s, 'aspiration-in-hand') : anticoagulated(s) && plateletsBlocked(s)),
      effect: (s) => aspirate(s, 'operator'),
    },
    {
      id: 'md-ivus', when: (s) => s.role !== 5 && s.pulse && flowing(s) && !has(s, 'imaged') && (s.role === 3 ? has(s, 'imaging-in-hand') : s.minute >= s.flags.open + 1),
      effect: (s) => imagingFinding(s, has(s, 'oct-ready') && !has(s, 'ivus-ready') ? 'oct' : 'ivus', 'operator'),
    },
    {
      id: 'md-nc', when: (s) => s.role !== 5 && s.pulse && has(s, 'imaged') && !has(s, 'expanded') && (s.role === 3 ? has(s, 'nc-in-hand') : s.minute >= s.flags.imaged + 1),
      effect: (s) => postDilate(s, 'operator'),
    },
    {
      id: 'md-confirm', when: (s) => s.role !== 5 && s.pulse && flowing(s) && has(s, 'expanded') && !has(s, 'confirmed') && (s.role === 3 ? has(s, 'confirm-in-hand') : s.minute >= s.flags.expanded + 1),
      effect: (s) => imagingFinding(s, has(s, 'oct-ready') && !has(s, 'ivus-ready') ? 'oct' : 'ivus', 'operator'),
    },
    {
      id: 'md-final', when: (s) => s.role !== 5 && has(s, 'confirmed') && flowing(s) && !has(s, 'final-angio'),
      effect: (s) => ({ say: [['operator', finalLine(s), embolized(s) ? 'warn' : 'good']], image: { id: 'final-angio', view: 'Final angiogram' }, flags: ['final-angio'] }),
    },

    reocclusion(1), reocclusion(2), reocclusion(3),
    {
      // the shut LAD drags the pressure down (never up from a lower one)
      id: 'pressure-falls', when: (s) => s.pulse && occluded(s) && s.minute >= s.flags.occluded + 4,
      effect: (s) => {
        const sbp = Math.min(s.vitals.sbp, 88);
        const dbp = Math.min(s.vitals.dbp, 56);
        return {
          say: [
            ['monitor', `Heart rate 112. BP ${sbp}/${dbp}.`, 'bad'],
            ...awake(s, 'I feel faint…'),
            ...(s.role === 5 ? [line('team', `Nurse: "Doctor — ${sbp} systolic!"`, 'warn')] : []),
          ],
          rhythm: { ...s.rhythm, hr: 112 }, vitals: { sbp, dbp, pain: 9, gcs: Math.min(s.vitals.gcs, 14) },
        };
      },
    },
    {
      // the ischemic anterior wall fibrillates if the LAD stays shut
      id: 'vf', when: (s) => s.pulse && occluded(s) && s.minute >= s.flags.occluded + 7,
      effect: (s) => ({
        say: [['monitor', 'Monitor alarm — he is unresponsive!', 'bad'], ...(s.role === 5 ? [line('team', 'Tech: "Doctor — look at the monitor!"', 'bad')] : [])],
        rhythm: { profile: 'vf', hr: 0 }, pulse: false, flags: ['vf'],
      }),
    },
    {
      // shocked back but still shut: the same ischemic wall fibrillates again (no stent work was ever possible in the arrest)
      id: 'vf-again', when: (s) => s.pulse && occluded(s) && has(s, 'vf') && s.minute >= Math.max(s.flags.rosc ?? Infinity, s.flags.occluded) + 7,
      effect: (s) => ({
        say: [['monitor', 'Monitor alarm — he is unresponsive again!', 'bad'], ...(s.role === 5 ? [line('team', 'Tech: "Doctor — the monitor, again!"', 'bad')] : [])],
        rhythm: { profile: 'vf', hr: 0 }, pulse: false,
      }),
    },
  ],
  critical: [
    { id: 'defib', label: 'Defibrillate VF within 1 minute', why: 'In the lab, VF is witnessed with the pads on: shock it within seconds.', done: ['defib', 'aed'], after: 'arrest', points: 15, target: { within: { flag: 'arrest', minutes: 1 } }, applies: (s) => has(s, 'arrest') },
    { id: 'callout', label: 'Call out the returning pain, the ST segments and the falling pressure at once', why: 'The pain back, the ST segments up again and the pressure down, minutes after the stent: say it out loud so the whole team switches to the problem.', done: ['callout'], after: 'thrombosis', roles: [3, 4], points: 10, target: { within: { flag: 'thrombosis', minutes: 1 } } },
    ...TECH_ASKS.map(askCritical),
    ...RN_ASKS.map(askCritical),
    { id: 'md-act', label: 'Check the ACT', why: 'A stent that clots on the table: the ACT first. 4,000 units is the emergency department\'s ACS dose, not a PCI dose; during PCI the ACT should be 250–300 s on heparin alone (200–250 s with a GP IIb/IIIa inhibitor).', done: ['act'], after: 'thrombosis', roles: MD, points: 10, target: { within: { flag: 'thrombosis', minutes: 3 } } },
    { id: 'md-anticoag', label: 'Top up the heparin (or switch to bivalirudin)', why: 'A PCI needs 70–100 units/kg of heparin (about 8,000 units for him; less with a GP IIb/IIIa inhibitor): with the ACT at 186, clot keeps forming on the wire and in the stent.', done: ['heparin', 'bivalirudin'], after: 'thrombosis', roles: MD, points: 10, target: { within: { flag: 'thrombosis', minutes: 4 } } },
    { id: 'md-platelets', label: 'Block the platelets IV: cangrelor or a GP IIb/IIIa inhibitor', why: 'He has no P2Y12 inhibitor on board, and a tablet takes an hour or more to work (longer after opioids and vomiting). Cangrelor or eptifibatide blocks the platelets within minutes; without one, the reopened stent clots again.', done: ['cangrelor', 'gp2b3a'], after: 'thrombosis', roles: MD, points: 15, target: { within: { flag: 'thrombosis', minutes: 5 } } },
    { id: 'md-ticagrelor', label: 'Give the missed P2Y12 load (ticagrelor 180 mg)', why: 'The IV drug bridges; the tablet carries him through the next year. Ticagrelor can go in during the cangrelor infusion (prasugrel or clopidogrel only once it stops).', done: ['p2y12'], roles: MD, points: 5 },
    { id: 'md-reopen', label: 'Reopen the stent: aspiration or a balloon', why: 'The wire is still across: aspirate the clot (a large thrombus is the time for aspiration) or open it with a balloon inside the stent. Every minute it stays shut, more of the anterior wall dies.', done: ['aspiration', 'balloon-predil', 'balloon-nc'], after: 'thrombosis', roles: MD, points: 15, target: { within: { flag: 'thrombosis', minutes: 6 } } },
    {
      id: 'md-image', label: 'Image the stent once the flow is back (IVUS or OCT)', roles: MD, points: 15, target: { within: { flag: 'reopened', minutes: 6 } },
      why: 'A stent that clots on the table usually has a mechanical cause: under-expansion, malapposition, an edge dissection, plaque or clot through the struts. IVUS or OCT shows which — and which fix it needs. Through a shut stent it cannot be trusted (and pushing through fresh clot sends it downstream): get flow back first.',
      done: (s) => startedAt(s, 'imaged', IMAGING), uses: IMAGING,
    },
    { id: 'md-optimize', label: 'Post-dilate with a non-compliant balloon at high pressure', why: 'Under-expansion is the strongest mechanical cause of stent thrombosis. A non-compliant balloon at high pressure opens the stent to its size without tearing the edges; another stent does not fix it.', done: ['balloon-nc'], after: 'thrombosis', roles: MD, points: 10 },
    {
      id: 'md-confirm', label: 'Confirm the expansion with IVUS or OCT', roles: MD, points: 5,
      why: 'Check the result before you leave: a minimum stent area of at least 90 % of the distal reference (over 5.5 mm² by IVUS outside the left main), no edge dissection, no clot left.',
      done: (s) => startedAt(s, 'confirmed', IMAGING), uses: IMAGING,
    },
    { id: 'md-final', label: 'Final angiogram in two views', why: 'Confirm TIMI 3 flow, a myocardial blush and smooth stent edges before you leave the vessel.', done: ['final-angio'], roles: MD, points: 5 },
    { id: 'post-ecg', label: '12-lead once the flow is back', why: 'The ST elevation coming down again confirms the muscle is reperfused; it is the baseline for the CCU — and for the next time he has pain.', done: ['ecg12', 'ecg12-repeat'], after: 'reopened', points: 5, applies: (s) => has(s, 'reopened') },
    { id: 'hemostasis', label: 'Radial band and distal perfusion check', why: 'Patent hemostasis, as always — with full heparin, aspirin, ticagrelor and an IV platelet drug on board.', done: ['hemostasis'], after: 'final-angio', roles: [3, 4], points: 5, applies: (s) => has(s, 'final-angio') },
    { id: 'handoff', label: 'Hand-off to the cardiac care unit', why: 'The stent thrombosis and its causes (the low ACT, the missed ticagrelor, the under-expanded stent), every drug and when — how long the cangrelor or eptifibatide runs — the final result, and the access site: a second stent thrombosis is the risk to watch for.', done: ['handoff'], roles: [4, 5], points: 5 },
  ],
  harms: [
    { id: 'stent-without-imaging', actions: ['stent-des'], roles: MD, when: (s) => !has(s, 'imaged'), points: 10, severity: 'major', text: 'Another stent for a stent thrombosis, before imaging the first one. The clot is the result; the cause is in the drugs (a low ACT, no P2Y12 inhibitor) or in the stent itself (under-expansion, malapposition, an edge dissection). A second stent fixes none of these, and stenting into fresh clot squeezes it downstream. Fix the drugs, reopen it, image it, then treat what the imaging shows.' },
    { id: 'stent-for-underexpansion', actions: ['stent-des'], roles: MD, when: (s) => has(s, 'imaged') && !has(s, 'expanded'), points: 6, severity: 'major', text: 'Another stent for an under-expanded stent. The imaging showed no edge dissection: the first stent never opened fully over a band of calcium. A second layer of metal does not expand it — a non-compliant balloon at high pressure does.' },
    // once the imaging has shown it fully open there is nothing left for a stent to fix: metal for nothing
    { id: 'stent-no-indication', actions: ['stent-des'], roles: MD, when: (s) => has(s, 'imaged') && has(s, 'expanded'), points: 5, severity: 'major', text: 'Another stent in a stent that the imaging had shown fully expanded, apposed and free of edge dissection. There was nothing left for it to fix: a second layer of metal only adds to the risk of restenosis and of the stent clotting again.' },
    // the tech only opens it — the operator refuses it and nothing reaches the patient — so a smaller penalty than the operator's
    { id: 'tech-unasked-stent', actions: ['stent-des'], roles: TECH, points: 3, severity: 'minor', text: 'A stent opened that the operator did not ask for, while the first one was clotting. Nobody knows yet why it clotted, and another stent fixes neither the drugs nor an under-expanded stent. Open devices when the operator asks for them.' },
    { id: 'protamine-in-thrombosis', actions: ['protamine'], points: 12, severity: 'critical', text: 'Protamine during a stent thrombosis. It reverses the heparin — the one thing holding back more clot — while the stent is filling with thrombus. The ACT is already too low: he needs more heparin, not less.' },
    { id: 'lytic-in-lab', actions: ['tnk'], points: 15, severity: 'critical', text: 'A systemic fibrinolytic in the lab. On top of heparin, aspirin and an IV platelet drug it brings major (and intracranial) bleeding, and the clot in the stent is treated mechanically — aspiration, a balloon, then the cause the imaging shows.' },
    // switching from heparin to bivalirudin is fine; adding one on top of the other once the ACT is back in range is not. The
    // nurse's bivalirudin given to an open order is scored by that order's own wrong answer (one mistake, one penalty)
    { id: 'double-anticoagulant', actions: ['heparin', 'bivalirudin'], roles: [4, 5], when: (s) => !(s.role === 4 && (openOrder(s, 'rn-platelets', 'platelets-given') || openOrder(s, 'rn-heparin', 'heparin-given'))) && (has(s, 'bivalirudin') || (has(s, 'heparin-topup') && anticoagulated(s))), points: 5, severity: 'major', text: 'Heparin and bivalirudin on top of each other. One anticoagulant brought back to the PCI range is enough: both together only add bleeding. Switch from one to the other, or top up the one he has.' },
    // a covered stent is another stent, and a worse one: the same weight as another stent before imaging, not a lesser fault
    { id: 'covered-no-perforation', actions: ['stent-covered'], roles: MD, points: 10, severity: 'major', text: 'A covered stent without a perforation. Covered stents seal perforations; they clot and restenose far more than drug-eluting stents and can shut the side branches they cover — the last thing a stent that has just clotted needs. Fix the drugs, reopen it, image it, then treat what the imaging shows.' },
    { id: 'tech-unasked-covered', actions: ['stent-covered'], roles: TECH, points: 3, severity: 'minor', text: 'A covered stent opened that nobody asked for. Covered stents are for perforations; there is none, and in a stent that has just clotted it would clot again. Open devices when the operator asks for them.' },
    { id: 'beta-blocker', actions: ['metoprolol'], points: 8, severity: 'major', text: 'An IV beta-blocker in an evolving anterior STEMI. His systolic fell to about 100 when the stent shut — a systolic under 120, like a heart rate over 110, is a risk factor for cardiogenic shock (COMMIT) — and IV beta-blockers are not routine in STEMI. An oral one starts within 24 hours, once he is stable with no heart failure or low output.' },
    // shocked back to 84 systolic (or worse) a pump is a defensible choice; above 90 it treats nothing he has
    { id: 'pump-no-shock', actions: ['iabp', 'impella'], roles: MD, when: (s) => s.pulse && s.vitals.sbp >= 90, points: 3, severity: 'minor', text: 'A mechanical pump without cardiogenic shock. It does nothing for the clot in the stent, it takes minutes while the LAD stays shut, and it adds a large-bore femoral puncture in a patient on heparin and antiplatelet drugs. Reopen the artery: that is what supports this heart.' },
    { id: 'ic-epi-no-indication', actions: ['ic-epinephrine'], when: (s) => s.pulse, points: 3, severity: 'minor', text: 'Intracoronary epinephrine for a stent thrombosis. It is a drug for no-reflow with a low pressure; it does nothing for clot in the stent, and it speeds the heart and raises the oxygen need of an infarcting heart.' },
    { id: 'oxygen-normoxic', actions: ['o2-nc', 'o2-nrb'], when: (s) => s.pulse && s.vitals.spo2 >= 90, points: 2, severity: 'minor', text: 'Oxygen with an SpO₂ of 90 % or more. Oxygen is for SpO₂ below 90 %.' },
    askHarm(TECH_ASKS[3], 'A compliant balloon when the operator asked for a non-compliant one. Taken to high pressure, a compliant balloon grows past its size and can tear the vessel at the stent edges. Check the order and the box before you open it.'),
    askHarm(RN_ASKS[0], 'Bivalirudin when the operator asked for a drug that blocks the platelets. Bivalirudin is an anticoagulant, like the heparin: cangrelor or eptifibatide blocks the platelets within minutes.'),
    // the nurse's bivalirudin for the heparin order (respond.bivalirudin closes it): the platelet order's own wrong answer covers it when that one is open too
    { id: 'wrong-rn-heparin', actions: ['bivalirudin'], roles: [4], when: (s) => openOrder(s, 'rn-heparin', 'heparin-given') && !openOrder(s, 'rn-platelets', 'platelets-given'), points: 3, severity: 'minor', text: 'Bivalirudin when the operator asked for a heparin top-up. Switching the anticoagulant is the operator\'s decision, with its own dosing: give what was ordered, or ask first.' },
    askHarm(RN_ASKS[3], 'Midazolam when the operator asked for something for the pain. A sedative does not relieve ischemic pain, and it lowers the pressure and the breathing: fentanyl 25–50 mcg IV.'),
  ],
  timings: [
    { label: 'ACT known', actions: ['act'], flag: 'act', target: 3, from: 'thrombosis' },
    { label: 'Platelets blocked IV', actions: ['cangrelor', 'gp2b3a'], flag: 'iv-platelets', target: 5, from: 'thrombosis' },
    { label: 'Flow back', actions: [], flag: 'reopened', target: 6, from: 'thrombosis' },
  ],
  deathAfter: 8,
  completeWhen: (s) => flowing(s) && has(s, 'final-angio'),
  teaching: [
    'Acute stent thrombosis on the table: minutes after the stent it fills with clot — the pain and the ST elevation come back, the pressure falls, and VF can follow. It happens in under 1 % of PCIs — most often in a STEMI with a heavy clot load — and it carries a high mortality.',
    'Look for the cause on three fronts: the anticoagulant (the ACT), the platelets (was the P2Y12 inhibitor given — and has it had time to work?) and the stent (under-expansion, malapposition, an edge dissection, plaque or clot through the struts, untreated disease at either end).',
    'ACT during PCI: 250–300 s on heparin alone (HemoTec or i-STAT; 300–350 s on a Hemochron), 200–250 s with a GP IIb/IIIa inhibitor. The emergency department\'s ACS bolus (60 units/kg, at most 4,000 units) is not a PCI dose: top it up to 70–100 units/kg and check the ACT before the wire goes in — and again in a long case.',
    'Platelets: a ticagrelor or prasugrel tablet takes an hour or more to work — far longer in a STEMI, after opioids (morphine, fentanyl) or with vomiting. When clot forms on the table with no P2Y12 inhibitor on board, an IV drug works in minutes: cangrelor (30 mcg/kg bolus, 4 mcg/kg/min, for at least 2 hours or the length of the PCI, whichever is longer) or a GP IIb/IIIa inhibitor (eptifibatide 180 mcg/kg bolus twice, 2 mcg/kg/min), the bail-out for a large thrombus. Either one does the job: the second on top adds bleeding (cangrelor is labeled for patients not given a GP IIb/IIIa inhibitor), so keep it for clot that goes on forming.',
    'Give the oral load as well: the IV drug bridges, the tablet carries on. Ticagrelor 180 mg (crushed, it acts sooner) can go in during the cangrelor infusion; prasugrel or clopidogrel only once it stops — cangrelor blocks their effect.',
    'Reopen it: keep the wire across the stent. Aspiration pulls out a large clot (routine aspiration brings no benefit — TASTE, TOTAL — but a heavy thrombus is the time for it); a balloon inside the stent restores flow. Fix the drugs at the same time, or the stent clots again within minutes.',
    'Then image it: IVUS or OCT shows why it clotted. Under-expansion is the strongest mechanical cause — a minimum stent area under 80–90 % of the reference lumen (90 % is the goal), or under 5.5 mm² by IVUS (4.5 mm² by OCT) outside the left main. It is fixed with a non-compliant balloon at high pressure, not another stent on top; heavy calcium that a balloon cannot crack may need intravascular lithotripsy.',
    'Another stent is for what imaging shows needs one: a significant edge dissection (by OCT: over 60° of the circumference, over 3 mm long, or reaching the media) or untreated disease at an edge. Image once the flow is back: through a shut stent IVUS cannot size the lumen or judge the edges (and pushing it through fresh clot sends clot downstream), and OCT sees only blood.',
    'Never reverse the heparin (protamine) or give a systemic fibrinolytic: the first lets the clot grow; the second adds major bleeding on top of heparin and two antiplatelet drugs.',
    'The team: the tech runs the ACT and has the aspiration catheter, non-compliant balloons and the IVUS ready; the nurse gives the drugs on order, watches the rhythm and the pressure, and treats the pain; everyone calls out what they see.',
  ],
};
