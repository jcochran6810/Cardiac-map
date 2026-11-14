import type { Effect, Line, PendingRead, Scenario, SimState, Speaker } from '../types';
import { atRate, bpAfter, has, line, paced } from '../kit';
import { INTERVENTION_BY_ID } from '../interventions';
import {
  LEFT_VIEWS, MD, RCA_VIEWS, RIGHT_GUIDES, TECH, WIRES, askCritical, askEvents, askHarm, operator, type LabAsk,
} from '../labKit';
import { RATE_RULES } from '../rules/rhythm';

/**
 * A guide catheter tears the RCA ostium. Elective PCI of a proximal RCA narrowing from the right radial: the JR4 kept
 * backing out, so the operator changed to an Amplatz left guide for back-up. On a test injection before the wire, the
 * Amplatz dives deep into a small ostium, the pressure damps, and the injection through the wedged tip tears the wall:
 * contrast lingers at the ostium after the artery clears, the flow slows, and the inferior wall goes ischemic (pain, ST
 * elevation, a slow rate and a low pressure).
 *
 * The learner has to name it, then: stop injecting (every injection drives the tear — down the artery or back up into
 * the aortic root), back the guide out to coaxial, get a soft wire into the true lumen without contrast, confirm the
 * lumen with IVUS, and seal the entry with a stent from the ostium; then check the aortic root. The nurse treats what
 * the closing RCA does (the rate, the pressure, the pain); the tech calls it out, takes the injector off and hands the
 * devices. Traps: more injections (the stain climbs the ascending aorta: surgery), losing the wire (a diagnostic
 * angiogram or another catheter means pulling it), a hydrophilic wire (the false lumen), a stent before the lumen is known.
 *
 * Sources: Klaudel et al., Cardiol J 2022 (catheter-induced dissections: wedged contrast injection the commonest
 * mechanism; repeat injections and an unchanged catheter the commonest reasons they spread); Sanchez-Jimenez et al.,
 * JSCAI 2022 (iatrogenic aortocoronary dissection of the RCA: Dunning classes, ostial stenting in most, surgery in some);
 * Dunning et al., Catheter Cardiovasc Interv 2000 (class I cusp, II under 4 cm, III over 4 cm up the aorta).
 */

/**
 * The real image: a right coronary injection through an Amplatz left guide seated deep, the tip pulling on the wall — the
 * run just before the injection that tore it. It comes from another patient's article (Sanchez-Jimenez et al., JSCAI 2022,
 * fig. 1A); what it shows is where this patient's guide sat. It is shown once the learner has named what happened: its
 * caption names it.
 */
const IMAGES: Partial<Record<string, string>> = { 'deep-seat': 'amplatz-left-guide-rca' };

/** Every cine view: whatever the angle, a run means a contrast injection through the guide sitting in the torn ostium */
const VIEWS = [...LEFT_VIEWS, ...RCA_VIEWS];
/** What treats the slow rate: atropine first, pacing if it does not hold */
const RATE = ['atropine', 'pace', 'temp-wire'];
/** What holds the pressure up: fluid first (an ischemic right ventricle needs its filling), then a pressor */
const SUPPORT = ['fluid', 'push-epi', 'phenylephrine', 'pressor'];
const STENTS = ['stent-des', 'stent-covered'];
const IMAGING = ['ivus', 'oct'];
/**
 * Another catheter or guide shape in place of the Amplatz: the Amplatz comes out — and any wire with it. The first two
 * are engaged in the RCA with a puff of contrast; the others go to the left coronary or the ventricle
 */
const SWAPS = ['cath-jr4', 'cath-tiger', 'cath-jl4', 'cath-pigtail', 'guide-ebu'];
const SWAPS_INTO_RCA = ['cath-jr4', 'cath-tiger'];
/** Intracoronary drugs that open vessels or block the AV node: nothing for them to treat in a torn ostium */
const IC_VASODILATORS = ['ic-adenosine', 'ic-verapamil', 'ic-nitroprusside'];

const dissectionRead: Omit<PendingRead, 'minute'> = {
  kind: 'clinical', answer: 'clin-dissection', prompt: 'What just happened?',
  explain: 'A catheter-induced dissection of the RCA ostium. The Amplatz tip sat deep in a small ostium (the damped pressure), and the injection through it tore the wall: contrast trapped in the wall lingers after the lumen clears, and blood in the wall squeezes the lumen — slower flow, inferior ischemia, a slow rate and a low pressure. Stop injecting (every injection drives the tear down the artery or back up into the aortic root), back the guide out to coaxial, get a soft wire into the true lumen, confirm it with IVUS, and seal the entry with a stent from the ostium.',
};

const IVUS_TRUE = 'IVUS from the distal RCA back to the guide: the wire runs in the true lumen all the way. A crescent of blood in the wall squeezes the lumen from the ostium for 18 mm, with the entry right at the ostium; the plaque sits 10 mm in. Reference diameter 4.0 mm.';
const IVUS_FALSE = 'IVUS from the distal RCA back to the guide: from the ostium on, the wire runs outside the true lumen — in a blood-filled channel in the wall — with the true lumen squeezed to a slit beside it.';
const IVUS_AFTER = 'IVUS: the stent covers the ostium and the entry, well expanded and apposed (minimum stent area 11.0 mm²); the blood in the wall is sealed behind it, and there is no tear at its far edge.';

/** Only a patient awake enough to talk says how she feels */
const awake = (s: SimState, text: string): Line[] => (s.pulse && s.vitals.gcs >= 13 ? [['patient', `"${text}"`]] : []);

/** Who describes a run: the learner as the cardiologist, otherwise the operator */
const runner = (s: SimState): Speaker => (s.role === 5 ? 'you' : 'operator');

/** The entry is open: torn, and not yet sealed by a stent in the true lumen */
const torn = (s: SimState) => has(s, 'dissection') && !has(s, 'sealed');

/** The Amplatz is still jammed in the ostium (damping the pressure) */
const guideDeep = (s: SimState) => has(s, 'damped') && !has(s, 'repositioned');

/** Injections into the open tear since it happened (each one drives it further) */
const injections = (s: SimState) => ['inj-1', 'inj-2'].filter((f) => has(s, f)).length;

/** The cardiologist, with the tear open and a pulse: the one whose runs, wires and stents act on the artery */
const mdTorn = (s: SimState) => s.role === 5 && s.pulse && torn(s);

/** The atropine (the learner's, the operator's or the nurse's) holds her own rate up */
const rateHeld = (s: SimState) => has(s, 'atropine') || has(s, 'rn-treated') || paced(s);

/**
 * Nitrates are wrong until the entry is sealed, whatever the systolic: V4R shows the right ventricle ischemic, and the
 * pressure has fallen far more than 30 below her 136 (2025 ACC/AHA ACS: no nitrates with RV infarction, a systolic under
 * 90 or a fall of more than 30). Once the flow is back, only a low pressure still rules them out.
 */
const nitroWrong = (s: SimState) => s.pulse && (!has(s, 'sealed') || s.vitals.sbp < 100);

/** The closing RCA (or what it left behind) still holds her rate or pressure down: no IV beta-blocker */
const stillSlowOrLow = (s: SimState) => !has(s, 'sealed') || s.rhythm.hr < 60 || s.vitals.sbp < 100;

/** The heparin was reversed with protamine and not given again since */
const reversed = (s: SimState) => {
  const last = (id: string) => Math.max(-1, ...s.performed.filter((p) => p.id === id).map((p) => p.minute));
  return has(s, 'protamine') && last('heparin') < last('protamine');
};

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

/**
 * Another injection into the open tear (the cardiologist's): the first spreads the stain into the aortic wall around the
 * ostium (the cusp: Dunning class I) and slows the flow; the next drives it up the ascending aorta, more than 4 cm (class
 * III) — tearing pain, a falling pressure — and the RCA closes (the 'occlusion' event). `what` says what was done.
 */
function injection(s: SimState, what: string): Effect {
  const n = injections(s);
  if (n === 0) {
    const bp = bpAfter(s, -6, -4);
    return {
      say: [
        ['you', `${what} The smudge at the ostium is bigger: contrast now stains the aortic wall around the RCA ostium, and the RCA beyond fills more slowly.`, 'bad'],
        ['monitor', `BP ${bp.sbp}/${bp.dbp}.`],
      ],
      vitals: { ...bp, pain: Math.min(10, s.vitals.pain + 1) }, flags: ['inj-1'],
    };
  }
  const sbp = Math.min(s.vitals.sbp, 78);
  const dbp = Math.min(s.vitals.dbp, 46);
  return {
    say: [
      ['you', `${what} ${n === 1 ? 'A crescent of contrast now climbs the wall of the ascending aorta — well over 4 cm above the ostium — and the RCA barely fills.' : 'The crescent in the wall of the ascending aorta is longer still.'}`, 'bad'],
      ['monitor', `BP ${sbp}/${dbp}.`, 'bad'],
      ...awake(s, 'Now it\'s tearing — right through to my back!'),
      line('team', `Nurse: "Doctor — pressure ${sbp}!"`, 'warn'),
    ],
    vitals: { sbp, dbp, pain: 9 }, flags: ['inj-2', 'root-spread'],
  };
}

/**
 * Where a wire goes now. A hydrophilic wire slips into the false channel; after the wire has been pulled (the trap), the
 * first soft wire back down a torn ostium finds the false channel too — regaining the true lumen is the hard part. Any
 * other soft workhorse wire, through a guide sitting coaxial, follows the true lumen (with a wire in the false channel
 * already, it takes a different path down beside it).
 */
function lumenFor(s: SimState, id: string): 'true' | 'false' {
  if (id === 'wire-hydrophilic') return 'false';
  if (has(s, 'wire-lost') && !has(s, 'rewire-tried')) return 'false';
  return 'true';
}

/** The cardiologist wires the torn RCA (no contrast to steer by) */
function wire(s: SimState, id: string): Effect | null {
  if (!mdTorn(s) || !has(s, 'guide')) return null;
  if (has(s, 'false-stent')) return { say: [['you', 'The wire will not find the true lumen past the crushed stent: it keeps running behind the struts.', 'bad']], flags: ['wired'] };
  if (lumenFor(s, id) === 'false') {
    const rewire = has(s, 'wire-lost') && !has(s, 'rewire-tried');
    return {
      say: [['you', id === 'wire-hydrophilic'
        ? 'The polymer-jacketed wire slides down easily to the distal RCA — with no contrast, there is no telling which channel it took.'
        : 'The soft wire goes down again to the distal RCA — but with the ostium torn wider by the catheter changes, there is no telling which channel it took.']],
      flags: ['wired', 'wire-false', ...(rewire ? ['rewire-tried'] : [])],
    };
  }
  if (has(s, 'wire-true')) return { say: [['you', 'A second soft wire down beside the first, to the distal RCA.']], flags: ['wired'] };
  const beside = has(s, 'wire-false');
  return {
    say: [['you', beside
      ? `A second soft workhorse wire, ${has(s, 'false-known') ? 'the first left in the false channel as a marker' : 'beside the first'}: it takes a different path down to the distal RCA.`
      : 'Soft workhorse wire steered gently past the ostium and down to the distal RCA, with no contrast.']],
    flags: ['wired', 'wire-true'],
  };
}

/** What IVUS shows, and what it settles: the lumen the working wire is in (and, once sealed, the stent) */
function ivusEffect(s: SimState, who: Speaker): Effect {
  if (has(s, 'sealed')) return { say: [[who, IVUS_AFTER]], flags: ['ivus'] };
  if (has(s, 'wire-true')) return { say: [[who, IVUS_TRUE]], flags: ['ivus', 'lumen-known'] };
  return { say: [[who, IVUS_FALSE, 'bad']], flags: ['ivus', 'false-known'] };
}

/**
 * A stent over the true-lumen wire, placed 1 mm out into the aorta: it covers the entry and the blood in the wall, the tear
 * stops growing, and the RCA fills again — the ischemia ends (the ST segments settle, her own rate and pressure come back).
 */
function seal(s: SimState, who: Speaker, covered = false): Effect {
  const hr = rateHeld(s) ? 82 : 76;
  const stain = has(s, 'root-spread')
    ? ' The crescent in the wall of the ascending aorta is no longer growing.'
    : has(s, 'inj-1') ? ' The stain in the aortic wall around the ostium is no bigger.' : ' The smudge at the ostium is no bigger.';
  return {
    say: [
      [who, `${covered ? 'Covered stent' : 'Drug-eluting stent'}, 4.0 × 23, placed 1 mm out into the aorta so it covers the ostium and the entry and runs past the end of the blood in the wall; deployed at 14 atmospheres.`],
      [who, `A gentle run with the guide backed out: the RCA fills briskly to the crux.${stain}`, 'good'],
      ['monitor', `Heart rate ${hr}. BP 124/74.`, 'good'],
      ...awake(s, 'Oh — that pressure in my chest is easing off.'),
    ],
    rhythm: { profile: 'normal-sinus', hr }, vitals: { sbp: 124, dbp: 74, pain: 1, gcs: 15 },
    flags: ['sealed', 'stented', 'pci', 'reflow', ...(covered ? ['covered-stent'] : [])],
  };
}

/** A stent over a wire in the false channel: it opens the channel in the wall and crushes the true lumen — the RCA shuts */
function falseStent(s: SimState, covered: boolean): Effect {
  return {
    say: [
      ['you', `${covered ? 'Covered stent' : 'Drug-eluting stent'}, 4.0 × 23, deployed at 14 atmospheres over the wire.`],
      ['you', 'A gentle run: the RCA stops dead at the stent — nothing fills beyond it.', 'bad'],
      ['monitor', 'Heart rate 40. BP 70/40.', 'bad'],
      ...awake(s, 'It\'s crushing… I\'m going to pass out…'),
    ],
    rhythm: { profile: 'inferior-stemi', hr: 40 }, vitals: { sbp: 70, dbp: 40, pain: 10, gcs: 13 },
    flags: ['false-stent', 'stented', 'occluded'],
  };
}

/** The cardiologist puts a stent in the torn RCA */
function stent(s: SimState, covered: boolean): Effect | null {
  if (s.role !== 5 || !torn(s) || !has(s, 'wired')) return null;
  if (!s.pulse) return { blocked: true, say: [['system', 'Not during the arrest: shock first.']] };
  if (has(s, 'false-stent')) return { say: [['you', 'Another stent cannot reach the true lumen past the crushed one: the RCA stays shut.', 'bad']] };
  if (!has(s, 'wire-true')) return falseStent(s, covered);
  return seal(s, 'you', covered);
}

/** The last runs, with the guide backed out into the root: the stent, the flow, and whether the stain in the aortic wall is growing */
function rootCheck(s: SimState, who: Speaker): Effect {
  const root = has(s, 'root-spread')
    ? 'A gentle injection in the aortic root: the crescent in the wall of the ascending aorta has not grown since the stent went in, and no contrast enters it from the ostium any more.'
    : has(s, 'inj-1')
      ? 'A gentle injection in the aortic root: the stain stays in the wall right around the ostium and has not grown; nothing climbs the ascending aorta.'
      : 'A gentle injection in the aortic root: no contrast in the aortic wall; the old smudge at the ostium is covered by the stent.';
  return {
    say: [[who, `Final runs in two views: the stent covers the ostium, the RCA fills briskly to the crux (TIMI 3), and there is no tear at the stent's far edge. ${root}`, 'good']],
    image: { id: 'final-angio', view: 'Final angiogram: the RCA and the aortic root' }, flags: ['final-angio', 'root-checked'],
  };
}

/** Atropine 1 mg: her own (sinus) rate, held down by the ischemic inferior wall, comes back up */
function atropineBy(s: SimState, who: Speaker): Effect {
  if (!s.pulse || paced(s) || s.rhythm.hr >= 60) return { say: [[who, 'Atropine 1 milligram in.']], flags: ['atropine'] };
  return { say: [[who, 'Atropine 1 milligram in.'], ['monitor', 'Heart rate 74.']], rhythm: atRate(s, 74), flags: ['atropine'] };
}

/** Fluid wide open: the ischemic right ventricle fills better and the pressure comes up */
function fluid(s: SimState): Effect {
  if (!s.pulse) return { say: [['you', 'Fluid running.']], flags: ['fluid'] };
  const bp = bpAfter(s, 12, 8, { sbp: 130, dbp: 80 });
  return { say: [['monitor', `Fluid running wide open. BP ${bp.sbp}/${bp.dbp}.`]], vitals: bp, flags: ['fluid'] };
}

/** A cine run while the tear is open: the cardiologist injects into it; the operator refuses a tech who sets one up */
function viewRun(s: SimState, id: string): Effect | null {
  if (!torn(s) || !s.pulse) return null;
  const label = INTERVENTION_BY_ID[id].label.split(' — ')[0];
  if (s.role === 3) return { say: [['you', `C-arm set for the ${label}.`], ['operator', 'No runs — nobody injects into that ostium.', 'warn']] };
  if (s.role !== 5) return null;
  const inj = injection(s, `Cine: ${label}.`);
  return { ...inj, image: { id, view: label }, flags: ['cine', id, ...(inj.flags ?? [])] };
}

/**
 * The Amplatz pulled out of the torn ostium for something else (the cardiologist): any wire comes out with it, and a
 * catheter that has to find the RCA ostium again does it with contrast. `what` says what went in instead
 */
function pullOut(s: SimState, what: string, intoRca: boolean): Effect {
  const wired = has(s, 'wired');
  const out = `The Amplatz comes out${wired ? ', and the wire with it,' : ''} for ${what}.`;
  const inj: Effect = intoRca ? injection(s, out) : { say: [['you', out]] };
  return {
    ...inj,
    flags: ['catheter', ...(wired ? ['wire-lost'] : []), ...(inj.flags ?? [])],
    clear: ['wired', 'wire-true', 'wire-false', 'lumen-known', 'false-known', 'rewire-tried', 'guide', 'guide-right', 'damped'],
  };
}

/**
 * A guide exchange (the cardiologist): back on after the trap's diagnostic run, sat without contrast; over the wire, the
 * wire stays and the new guide sits coaxial; without a wire, finding a torn ostium takes contrast — another injection.
 */
function guide(s: SimState, id: string): Effect | null {
  if (!mdTorn(s)) return null;
  const name = id === 'guide-jr4' ? 'JR4' : 'AL1';
  if (!has(s, 'guide')) {
    return { say: [['you', `${name} guide brought up and sat gently at the RCA ostium, coaxial, on the roadmap of the last runs — no injection; the pressure trace stays sharp.`]], flags: ['guide', 'guide-right', 'repositioned'] };
  }
  if (has(s, 'wired')) {
    return { say: [['you', `The old guide comes out over the wire and a ${name} goes in on it, sitting coaxial at the ostium; the wire stays where it was.`]], flags: ['guide', 'guide-right', 'repositioned'] };
  }
  const inj = injection(s, `The Amplatz comes out and a ${name} goes in; finding the torn ostium takes a puff of contrast.`);
  return { ...inj, flags: ['guide', 'guide-right', 'repositioned', ...(inj.flags ?? [])] };
}

/** VF from the closed RCA: a shock brings her own rhythm back, with the artery still shut */
function shockOutcome(s: SimState): Effect | null {
  if (s.pulse || s.rhythm.profile !== 'vf') return null;
  return {
    say: [['monitor', 'Shock delivered: 200 J.'], ['you', 'An organized rhythm is back: 82/50 on the arterial line. The RCA is still shut.', 'warn']],
    rhythm: { profile: 'inferior-stemi', hr: 64 }, pulse: true, vitals: { sbp: 82, dbp: 50, gcs: 13, pain: 8 }, flags: ['pads', 'monitor', 'shocked'],
  };
}

// ─── The operator's asks ───────────────────────────────────────────────────

const TECH_ASKS: LabAsk[] = [
  {
    // in an emergency the operator waits a minute and a half, not three, before getting a device himself
    id: 'wire', when: (s) => has(s, 'dissection') && has(s, 'repositioned'), wait: 1.5,
    ask: 'Guide\'s backed out. A soft workhorse wire, please — I need the true lumen, and no contrast to find it.',
    accept: ['wire-workhorse'], wrong: ['wire-hydrophilic'],
    wrongSay: 'Not a hydrophilic wire — it slips into the false lumen. A soft workhorse, please.',
    thanks: 'Workhorse — thanks. Going down gently.', fallback: 'I\'ll get the wire myself.', gives: 'wire-in-hand',
    label: 'A soft workhorse wire, as asked', points: 10,
    why: 'A soft, non-hydrophilic workhorse wire follows the true lumen; a polymer-jacketed (hydrophilic) wire slips under the flap into the false channel. Read the order back and check the box.',
  },
  {
    id: 'imaging', when: (s) => has(s, 'dissection') && has(s, 'wired'), wait: 1.5,
    ask: 'Wire\'s down. IVUS, please — before anything goes in, I want to see that the wire is in the true lumen, and how far the blood in the wall runs.',
    accept: ['ivus'], wrong: ['oct'],
    wrongSay: 'Not OCT — it needs a forceful contrast flush down this ostium, and it cannot clear the blood at the ostium anyway. IVUS, please.',
    thanks: 'Thanks.', fallback: 'I\'ll set up the IVUS myself.', gives: 'imaging-done',
    fallbackEffect: (s) => ivusEffect(s, 'operator'),
    label: 'IVUS catheter set up, as asked', points: 10,
    why: 'IVUS needs no contrast, sees the aorto-ostial junction, and shows which lumen the wire is in, where the entry is and how far the blood in the wall runs. OCT needs a forceful contrast flush — another injection into the tear — and cannot clear the blood at the ostium.',
  },
  {
    id: 'stent', when: (s) => torn(s) && has(s, 'lumen-known'), wait: 1.5,
    ask: 'True lumen all the way, entry at the ostium. Drug-eluting stent, 4.0 by 23, please — it has to cover the ostium.',
    accept: ['stent-des'], wrong: ['stent-covered', 'balloon-predil', 'balloon-nc', 'aspiration'],
    wrongSay: 'Not that — a drug-eluting stent, 4.0 by 23, straight in to seal the entry.',
    thanks: '4.0 by 23 — confirmed. Deploying.', fallback: 'I\'ll open the stent myself.', gives: 'stent-in-hand',
    label: 'Drug-eluting stent, as ordered', points: 5,
    why: 'Say the size back to the operator and check it on the box: a stent long enough to cover the ostium and run past the end of the blood in the wall, put in directly — no balloon in the torn segment first.',
  },
  {
    id: 'nc', when: (s) => has(s, 'sealed'),
    ask: 'Sealed. Non-compliant balloon, 4.5 by 8, to flare the ostium, please.',
    accept: ['balloon-nc'], wrong: ['balloon-predil'],
    wrongSay: 'Not a compliant balloon — at high pressure it grows past its size and tears the edges. Non-compliant, 4.5 by 8.',
    thanks: 'Thanks. Flaring the ostium.', fallback: 'I\'ll open the balloon myself.', gives: 'nc-in-hand',
    label: 'Non-compliant balloon to flare the ostium', points: 5,
    why: 'An ostial stent is post-dilated with a non-compliant balloon at high pressure, its aortic end flared, so it is fully expanded right at the ostium and seals it. A compliant balloon grows past its size and can tear the edges.',
  },
];

const RN_ASKS: LabAsk[] = [
  {
    // metoprolol gets the operator's word too, but its penalty is the case's own 'beta-blocker' (see the harm below)
    id: 'rn-rate', role: 4, when: (s) => has(s, 'dissection'), within: 1.5,
    ask: 'Rate\'s 48 and she\'s gray — something for her rate, please.',
    accept: ['atropine', 'pace'], wrong: ['adenosine6', 'adenosine12', 'diltiazem', 'metoprolol'],
    wrongSay: 'No! That slows her further. Atropine, 1 milligram.',
    thanks: 'Thanks — rate\'s coming up.', fallback: 'I\'ll give the atropine myself.', gives: 'rate-treated',
    fallbackEffect: (s) => atropineBy(s, 'operator'),
    label: 'Something for the slow rate: atropine (or pacing)', points: 10,
    why: 'The RCA feeds the sinus and AV nodes and the inferior wall: as its flow falls, the rate falls with it. Atropine 1 mg IV (every 3–5 minutes, 3 mg in all); pacing if it does not hold.',
  },
  {
    id: 'rn-pressure', role: 4, when: (s) => has(s, 'dissection'), within: 2,
    ask: 'And her pressure is 84 — what does she need?',
    accept: SUPPORT, wrong: ['nitro', 'nitro-high', 'ic-nitro'],
    wrongSay: 'No — that drops it further. Fluid, wide open.',
    thanks: 'Thanks — pressure\'s coming up.', fallback: 'Open the fluids, someone!', gives: 'pressure-supported',
    fallbackEffect: (s) => {
      const f = fluid(s);
      return { ...f, say: [['team', 'Tech: fluid wide open.'], ...(f.say ?? [])] };
    },
    label: 'Something for the low pressure: fluid first', points: 10,
    why: 'An ischemic inferior wall (and right ventricle) needs its filling: fluid wide open, 250–500 mL at a time, and reassess; push-dose epinephrine or a pressor if that is not enough. Nitroglycerin drops it further.',
  },
  {
    // a nurse who has already eased her pain (fentanyl before the operator asks) has answered it: it counts
    id: 'rn-pain', role: 4, when: (s) => has(s, 'pressure-supported'), within: 2, early: true,
    ask: 'She\'s still in pain — something for it, please.',
    accept: ['fentanyl'], wrong: ['nitro', 'nitro-high', 'ic-nitro'],
    wrongSay: 'Not nitroglycerin — her pressure won\'t take it. Fentanyl, 25 micrograms.',
    thanks: 'Thanks.', fallback: 'I\'ll give the fentanyl myself.', gives: 'pain-treated',
    fallbackEffect: (s) => ({ say: [['operator', 'Fentanyl 25 micrograms IV.']], vitals: { pain: Math.max(0, s.vitals.pain - 3) }, flags: ['analgesia'] }),
    label: 'Fentanyl for the pain', points: 5,
    why: 'Her pain is ischemia from a closing artery: fentanyl 25–50 mcg IV eases it without dropping the pressure much; the fix is the stent. Nitroglycerin opens nothing here and drops a low pressure further.',
  },
];

export const cathlabGuideDissection: Scenario = {
  id: 'guide-dissection-cathlab',
  title: 'PCI of the right coronary: a test injection goes wrong',
  summary: '69-year-old woman, elective PCI of a proximal RCA narrowing through an Amplatz guide. One test injection changes everything: read what it did, keep it from getting worse, and fix it.',
  setting: 'cathlab',
  roles: [3, 4, 5],
  difficulty: 'advanced',
  conditionId: 'inferior-stemi',
  images: IMAGES,
  briefing: {
    default: [
      ['team', 'Elective PCI from the right radial: 69-year-old woman, angina on the stairs, a 75 % narrowing of the proximal RCA 1 cm from a small ostium, with ischemia on her stress test; high blood pressure; 64 kg. Aspirin and clopidogrel 600 mg this morning; heparin 70 units/kg on board (ACT 280 s).'],
      ['team', 'The JR4 guide kept backing out of the ostium, so the operator changed to an Amplatz left guide (AL 0.75) for back-up. No wire is across yet.'],
      ['scene', 'She is awake and chatting, free of pain.'],
    ],
    3: [
      ['team', 'Elective PCI from the right radial: 69-year-old woman, angina on the stairs, a 75 % narrowing of the proximal RCA 1 cm from a small ostium, with ischemia on her stress test; high blood pressure; 64 kg. Aspirin and clopidogrel 600 mg this morning; heparin 70 units/kg on board (ACT 280 s).'],
      ['team', 'The JR4 guide kept backing out of the ostium, so the operator changed to an Amplatz left guide (AL 0.75) for back-up. No wire is across yet.'],
      ['scene', 'She is awake and chatting, free of pain.'],
      ['team', 'You are the scrub tech: the injector and the manifold, the pressures, the C-arm, and every wire and device the cardiologist asks for — and calling out every change you see. The nurse is at her side.'],
    ],
    4: [
      ['team', 'Elective PCI from the right radial: 69-year-old woman, angina on the stairs, a 75 % narrowing of the proximal RCA 1 cm from a small ostium, with ischemia on her stress test; high blood pressure; 64 kg. Aspirin and clopidogrel 600 mg this morning; heparin 70 units/kg on board (ACT 280 s).'],
      ['team', 'The JR4 guide kept backing out of the ostium, so the operator changed to an Amplatz left guide (AL 0.75) for back-up. No wire is across yet.'],
      ['scene', 'She is awake and chatting, free of pain.'],
      ['team', 'You are the procedural nurse: her rhythm, pressure and pain, and the drugs the cardiologist orders. The tech is scrubbed at the table.'],
    ],
    5: [
      ['team', 'Elective PCI from the right radial: 69-year-old woman, angina on the stairs, a 75 % narrowing of the proximal RCA 1 cm from a small ostium, with ischemia on her stress test; high blood pressure; 64 kg. Aspirin and clopidogrel 600 mg this morning; heparin 70 units/kg on board (ACT 280 s).'],
      ['team', 'The JR4 guide kept backing out of the ostium, so you changed to an Amplatz left guide (AL 0.75) for back-up. No wire is across yet.'],
      ['scene', 'She is awake and chatting, free of pain.'],
      ['team', 'You are the interventional cardiologist: every choice from here is yours. The tech and the nurse are with you.'],
    ],
  },
  initial: {
    rhythm: { profile: 'normal-sinus', hr: 72 },
    vitals: { sbp: 136, dbp: 78, spo2: 97, rr: 16, etco2: 35, pain: 0, gcs: 15, glucose: 112, temp: 36.6 },
  },
  facts: {
    allergies: 'No allergies. Yes — I understand, go ahead.',
    sample: 'No allergies. Aspirin, clopidogrel since this morning, amlodipine and atorvastatin. High blood pressure; angina on the stairs for two months.',
    opqrst: (s) => (has(s, 'sealed')
      ? 'Almost gone now — just a little ache.'
      : has(s, 'root-spread')
        ? 'It\'s tearing now, right through to my back — and the pressure in my chest is crushing.'
        : 'A heavy pressure in the middle of my chest — it came on just now, while you were working. 6 out of 10. I feel sick.'),
    labs: 'Pre-procedure: hemoglobin 12.8, creatinine 0.9, potassium 4.2, platelets 250, INR 1.0.',
    lungs: 'Clear on both sides.',
    perfusion: (s) => (!s.pulse
      ? 'Gray and mottled; no pulse at the wrist or the groin.'
      : has(s, 'sealed')
        ? 'Warm and pink again; neck veins flat; radial pulse strong.'
        : 'Pale, cool and clammy; neck veins not distended; the radial pulse slow and weak.'),
    // an ischemic right ventricle: a high right atrial pressure with a normal wedge, and a low output
    rhc: (s) => (has(s, 'sealed')
      ? 'RA 7 · RV 28/7 · PA 28/12 (mean 18) · PCWP 12 · CO 5.0 L/min, CI 2.9.'
      : 'RA 14 · RV 30/14 · PA 28/12 (mean 18) · PCWP 11 · CO 3.4 L/min, CI 2.0.'),
    // an ostial RCA takes the right ventricular branches with it
    ecgRight: (s) => (s.rhythm.profile === 'inferior-stemi' ? 'V4R: 1 mm ST elevation.' : 'V4R: no ST elevation.'),
    lvedp: (s) => (has(s, 'sealed') ? `LV ${s.vitals.sbp}/12 mmHg: LVEDP 12 mmHg.` : `LV ${s.vitals.sbp}/18 mmHg: LVEDP 18 mmHg.`),
    lvgram: (s) => (has(s, 'sealed')
      ? 'LV gram: the inferior wall moving again; EF about 55 %; no mitral regurgitation.'
      : 'LV gram: the inferior wall barely moves; EF about 50 %; no mitral regurgitation.'),
    ecg12: (s) => (s.rhythm.profile === 'inferior-stemi'
      ? `${s.rhythm.hr < 60 ? 'Sinus bradycardia' : 'Sinus rhythm'} ${s.rhythm.hr}: new ST elevation in II, III and aVF (III more than II), with reciprocal ST depression in I and aVL — the inferior wall is ischemic, from the right coronary.`
      : s.rhythm.profile === 'normal-sinus'
        ? `Sinus rhythm ${s.rhythm.hr}: the inferior ST elevation has resolved — the ST segments are back at baseline, with no Q waves.`
        : `${s.rhythm.profile === 'tcp' ? 'Transcutaneous pacing' : 'Pacing'} at ${s.rhythm.hr}: the paced beats hide the ST segments.`),
  },
  status: (s) => {
    if (!s.pulse) return 'Unresponsive.';
    if (has(s, 'sealed')) return '"Much better — that pressure has nearly gone."';
    if (has(s, 'root-spread')) return '"It\'s tearing… right through to my back."';
    if (has(s, 'occluded')) return '"It\'s crushing now… I feel faint."';
    return has(s, 'analgesia') ? '"Still a pressure in my chest — but easier."' : '"It\'s a heavy pressure… and I feel sick."';
  },
  respond: {
    'stop-contrast': (s) => (has(s, 'dissection')
      ? { say: [['you', s.role === 3 ? 'Injector off and disarmed, manifold closed to contrast — nobody injects.' : 'No more contrast: injector off, manifold closed.']], flags: ['contrast-stopped'] }
      : null),
    callout: (s) => {
      if (!has(s, 'dissection') || has(s, 'dissection-called')) return null;
      const said = s.role === 4 ? '"Rate 48, pressure 84 — and she has chest pain!"' : '"Pressure\'s damped — and contrast is hanging at the ostium!"';
      const reply = s.role === 4 ? 'I see it — thanks. Treat her rate and her pressure for me.' : 'I see it — thanks. Nobody injects.';
      return { say: [['you', said], ['operator', reply]], flags: ['callout', 'dissection-called'] };
    },
    // the heparin from the start of the case, unless it was reversed (protamine) or topped up on top of a good ACT
    act: (s) => ({
      say: [['team', reversed(s)
        ? 'ACT 158 s: the heparin is largely reversed — too low for a wire and a stent in a coronary.'
        : (s.counts.heparin ?? 0) > 0 && !has(s, 'protamine')
          ? 'ACT 356 s: above the PCI range.'
          : 'ACT 272 s: in range for PCI.']],
      flags: ['act'],
    }),
    // nobody answers questions in cardiac arrest (the case's own answers would otherwise be spoken by her)
    opqrst: (s) => (s.pulse ? null : { blocked: true, say: [['system', 'Not in cardiac arrest: she cannot answer. Shock first.']] }),
    sample: (s) => (s.pulse ? null : { blocked: true, say: [['system', 'Not in cardiac arrest: she cannot answer. Shock first.']] }),
    consent: (s) => (s.pulse ? null : { blocked: true, say: [['system', 'Not in cardiac arrest: she cannot answer. Shock first.']] }),
    // the engine's own lines have her feel these drugs; in an arrest nobody does
    'radial-cocktail': (s) => (s.pulse ? null : { say: [['you', 'Radial cocktail given through the sheath — it has no place in cardiac arrest and changes nothing on the monitor.']], flags: ['cocktail'] }),
    'adenosine-iv-ffr': (s) => (s.pulse ? null : { say: [['you', 'Adenosine infusion running — it has no place in cardiac arrest and changes nothing on the monitor.']], flags: ['hyperemia'] }),
    reposition: (s) => {
      if (!has(s, 'dissection') || !s.pulse) return null;
      return {
        say: [
          ['you', has(s, 'wired') ? 'Guide eased back out of the ostium over the wire, coaxial; the wire stays down.' : 'Guide eased gently back out of the ostium until it sits coaxial at the mouth of the RCA.'],
          ['monitor', `The arterial trace has its notch back: BP ${s.vitals.sbp}/${s.vitals.dbp}.`],
        ],
        flags: ['repositioned'],
      };
    },
    'wire-workhorse': (s) => wire(s, 'wire-workhorse'),
    'wire-hydrophilic': (s) => wire(s, 'wire-hydrophilic'),
    'guide-jr4': (s) => guide(s, 'guide-jr4'),
    'guide-al1': (s) => guide(s, 'guide-al1'),
    ivus: (s) => {
      if (!has(s, 'dissection') || !has(s, 'wired')) return null;
      const prep: Line[] = s.role === 3 ? [['you', 'IVUS catheter flushed with saline, prepped and handed up; pullback set.']] : [];
      const e = ivusEffect(s, s.role === 3 ? 'operator' : 'monitor');
      return { ...e, say: [...prep, ...(e.say ?? [])] };
    },
    oct: (s) => {
      if (!has(s, 'dissection') || !has(s, 'wired')) return null;
      if (has(s, 'sealed')) return { say: [[s.role === 3 ? 'operator' : 'monitor', 'OCT: the stent well expanded and apposed; the blood in the wall sealed behind it; no tear at its far edge.']], flags: ['oct'] };
      // while the operator's IVUS request is open, the ask's own word answers it
      if (s.role === 3) {
        const asked = has(s, 'asked-imaging') && !has(s, 'imaging-done');
        return { say: [['you', 'OCT catheter flushed and prepped; contrast flush loaded.'], ...(asked ? [] : [line('operator', 'Not OCT in this ostium — no forceful flush into it.', 'warn')])], flags: ['oct-ready'] };
      }
      if (!s.pulse) return null;
      // the OCT flush is a forceful contrast injection through the guide: it cannot clear the blood at an aorto-ostial tear,
      // and it drives the tear like any other injection
      const inj = injection(s, 'OCT run: 14 mL of contrast flushed through the guide at 4 mL/s.');
      const found: Line = has(s, 'wire-true')
        ? ['you', 'OCT: the flush cannot clear the blood at the ostium — its first 10 mm are a blur. Beyond it the wire runs in the true lumen, with blood in the wall around it.']
        : ['you', 'OCT: the flush cannot clear the blood at the ostium — its first 10 mm are a blur. Beyond it the wire runs outside the true lumen, in a blood-filled channel in the wall.', 'bad'];
      return { ...inj, say: [...(inj.say ?? []), found], flags: ['oct', ...(has(s, 'wire-true') ? ['lumen-known'] : ['false-known']), ...(inj.flags ?? [])] };
    },
    'stent-des': (s) => stent(s, false),
    'stent-covered': (s) => stent(s, true),
    'balloon-predil': (s) => {
      if (!mdTorn(s) || !has(s, 'wired')) return null;
      return {
        say: [['you', 'Compliant balloon up in the torn segment at 8 atmospheres, and down: the RCA looks no better — the blood in the wall has been pushed further along.', 'bad']],
        vitals: { pain: Math.min(10, s.vitals.pain + 1) }, flags: ['predilated'],
      };
    },
    aspiration: (s) => (s.role === 5 && has(s, 'dissection') && has(s, 'wired') ? { say: [['you', 'Aspiration run: nothing but blood — there is no clot to retrieve.']], flags: ['aspirated'] } : null),
    'balloon-tamponade': (s) => (has(s, 'dissection') ? { blocked: true, say: [['system', 'Nothing is leaking out of the artery: there is no hole for a balloon to cover.']] } : null),
    // the operator aspirates and then flushes hard down the guide: in a torn ostium the flush drives the tear like contrast
    'clear-air': (s) => (mdTorn(s) && has(s, 'guide') ? injection(s, 'Aspirated back through the guide, then a forceful saline flush down the artery.') : null),
    ...Object.fromEntries(SWAPS.map((id) => [id, (s: SimState) => (mdTorn(s) && has(s, 'guide')
      ? pullOut(s, `the ${INTERVENTION_BY_ID[id].label.split(' — ')[0].replace(/^Pigtail/, 'pigtail')}`, SWAPS_INTO_RCA.includes(id))
      : null)])),
    'balloon-nc': (s) => {
      if (s.role !== 5) return null;
      if (has(s, 'sealed')) return { say: [['you', 'Non-compliant 4.5 balloon at the ostium, 18 atmospheres: the stent\'s aortic end flared and fully expanded.']], flags: ['postdilated'] };
      // the stent sits in the channel in the wall: a bigger balloon only widens that channel
      if (has(s, 'false-stent')) return { say: [['you', 'Non-compliant balloon at high pressure inside the stent: still nothing fills beyond it.', 'bad']], flags: ['postdilated'] };
      return null;
    },
    // the LV gram and the LVEDP need a pigtail in the ventricle: with the tear open, that means pulling the Amplatz (and
    // any wire) out of the ostium. Refused, at no cost: the echo shows the wall motion. After a swap to a pigtail they work
    'lv-gram': (s) => (torn(s) && has(s, 'guide')
      ? { blocked: true, say: [['system', 'Not now: an LV gram needs a pigtail in the ventricle — the Amplatz would have to come out of the torn ostium, and any wire with it — and 30 mL more contrast. The echo shows the wall motion without touching the guide.']] }
      : null),
    lvedp: (s) => (torn(s) && has(s, 'guide')
      ? { blocked: true, say: [['system', 'Not now: the LVEDP needs a catheter in the ventricle — the Amplatz would have to come out of the torn ostium, and any wire with it.']] }
      : null),
    // a pressure wire and hyperemia grade a narrowing; a flap at the ostium is not one
    ffr: (s) => (torn(s) ? { blocked: true, say: [['system', 'Not in a torn artery: an FFR grades a narrowing, and this is a flap with blood in the wall. IVUS shows the lumen, the entry and how far it runs.']] } : null),
    'ffr-equalize': (s) => (torn(s) ? { blocked: true, say: [['system', 'Not in a torn artery: an FFR grades a narrowing, and this is a flap with blood in the wall. IVUS shows the lumen, the entry and how far it runs.']] } : null),
    // she was done from the right radial: there is no groin puncture to close
    'closure-device': (s) => (has(s, 'femoral') ? null : { blocked: true, say: [['system', 'This was done from the right radial: there is no femoral puncture to close.']] }),
    // the radial sheath carries the guide and the wire until the end of the procedure
    hemostasis: (s) => {
      if (has(s, 'root-checked')) return null;
      return { blocked: true, say: [['system', has(s, 'to-surgery')
        ? 'The radial sheath stays in: she goes to the operating room with it, and the wire, in place.'
        : 'Not yet: the operator is still working through the radial sheath. The band goes on once the final runs are done and the guide and the wire are out.']] };
    },
    ...Object.fromEntries(VIEWS.map((id) => [id, (s: SimState) => viewRun(s, id)])),
    angio: (s) => {
      if (s.role !== 5 || !has(s, 'dissection')) return null;
      if (!s.pulse) return { blocked: true, say: [['system', 'Not during the arrest: treat the rhythm first.']] };
      const view = { id: 'angio', view: 'Diagnostic angiography: both coronaries in standard views' };
      if (!torn(s)) return { say: [['you', 'Both coronaries in standard views: mild disease only in the left system; the RCA is open through the stent to the crux.']], image: view, flags: ['cine'] };
      // standard views of both coronaries need a diagnostic catheter: the guide comes out — and the wire with it
      const wired = has(s, 'wired');
      const inj = injection(s, `${wired ? 'The guide comes out, and the wire with it,' : 'The guide comes out'} for a diagnostic catheter; both coronaries in standard views — mild disease only in the left system.`);
      return {
        ...inj, image: view,
        flags: ['cine', 'catheter', ...(wired ? ['wire-lost'] : []), ...(inj.flags ?? [])],
        clear: ['wired', 'wire-true', 'wire-false', 'lumen-known', 'false-known', 'rewire-tried', 'guide', 'guide-right', 'damped'],
      };
    },
    'final-angio': (s) => {
      if (!has(s, 'dissection')) return null;
      if (!has(s, 'sealed')) return { blocked: true, say: [['system', s.role === 5 ? 'Not the final pictures yet: the procedure is not over.' : 'The operator is not ready for the final pictures yet.']] };
      return rootCheck(s, runner(s));
    },
    echo: (s) => {
      if (!has(s, 'dissection')) return null;
      if (!s.pulse) return { blocked: true, say: [['system', 'Not during the arrest: shock first — the echo can wait for a pulse.']] };
      const wall = has(s, 'sealed') ? 'the inferior wall moving again' : 'the inferior wall barely moving';
      const root = has(s, 'root-spread')
        ? 'a thin flap in the proximal ascending aorta; mild aortic regurgitation; no pericardial effusion'
        : 'the aortic root normal in size, no flap seen, no aortic regurgitation, no pericardial effusion';
      return { say: [['you', `Bedside echo: ${wall}; LVEF about 55 %; ${root}.`]], flags: ['echo'] };
    },
    // a patient with a torn, closing artery and a wire in it is fixed on the table, not sent to the scanner
    'ct-urgent': (s) => {
      if (!has(s, 'dissection')) return null;
      if (torn(s)) return { blocked: true, say: [['system', 'Not now: a torn, closing artery with a wire in it is fixed on the table first. A CT of the aorta can wait until she is stable.']] };
      return {
        say: [['team', 'Scanned and back: she went with a nurse and the monitor, the radial sheath secured.'], ['hospital', has(s, 'root-spread')
          ? 'CT angiography of the chest: a dissection flap from the right coronary cusp up the ascending aorta for 6 cm, stopping short of the arch; the stent is in the RCA ostium; no pericardial effusion.'
          : 'CT angiography of the chest: a thin crescent of contrast in the aortic wall right around the RCA ostium only — no flap in the ascending aorta; the stent is in the RCA ostium; no pericardial effusion.']],
        flags: ['ct'],
      };
    },
    'call-surgery': (s) => {
      if (!has(s, 'dissection')) return null;
      const text = has(s, 'false-stent')
        ? 'Cardiac surgery: the surgeon is on the way to see the runs — the OR is being readied for an emergency bypass to the RCA.'
        : has(s, 'root-spread')
          ? 'Cardiac surgery: the surgeon is on the way to the lab to look at the aorta, and the OR is being readied.'
          : 'Cardiac surgery notified: the surgeon is aware and on standby while the ostium is sealed.';
      return { say: [['hospital', text]], flags: ['surgery-called'] };
    },
    // nothing to drain: the echo shows no effusion (and a needle into a dry pericardium can lacerate the heart)
    pericardiocentesis: (s) => {
      if (s.role === 3 || !has(s, 'dissection')) return null;
      return { blocked: true, say: [['system', has(s, 'echo') ? 'The echo shows no pericardial effusion: there is nothing to drain.' : 'Get the echo first: it shows whether there is any effusion to drain.']] };
    },
    fluid,
    defib: shockOutcome,
    aed: shockOutcome,
  },
  events: [
    {
      // where the case stands: set up, anticoagulated and loaded, the Amplatz guide in the RCA, no wire yet
      id: 'setup', when: () => true,
      effect: () => ({ flags: ['consent', 'timeout', 'iv', 'prep', 'transducer', 'monitor', 'pads', 'access', 'catheter', 'angio', 'heparin', 'p2y12', 'guide', 'guide-right', 'cine'] }),
    },
    {
      // the Amplatz dives into the small ostium and the injection through its wedged tip tears the wall
      id: 'dissection', when: () => true,
      effect: (s) => ({
        say: [
          [operator(s), 'Test injection to line up the wire…'],
          ['monitor', 'The pressure trace damps as the guide tip dives deep into the RCA ostium. On the run, a smudge of contrast lingers at the ostium after the rest of the artery has cleared, and the RCA beyond fills slowly. Heart rate 48. BP 84/52.', 'bad'],
          ['patient', '"Ooh — a heavy pressure in my chest… I feel sick."'],
          ...(s.role === 5 ? [line('team', 'Tech: "Doctor — the pressure\'s damped!"', 'warn'), line('team', 'Nurse: "Rate 48, pressure 84."', 'warn')] : []),
        ],
        rhythm: { profile: 'inferior-stemi', hr: 48 }, vitals: { sbp: 84, dbp: 52, pain: 6 },
        flags: ['dissection', 'damped'], read: dissectionRead,
      }),
    },
    {
      // the real run from just before the tear: its caption names what happened, so it comes once the learner has
      id: 'deep-seat-run', when: (s) => s.reads.some((r) => r.answer === 'clin-dissection'),
      effect: () => ({
        say: [['team', 'The run from just before the stain is on the Imaging screen: look at where the guide tip sits.']],
        image: { id: 'deep-seat', view: 'The run before the stain: the Amplatz tip in the RCA ostium', image: IMAGES['deep-seat'] },
      }),
    },
    // the operator stops the contrast and backs the guide out (the tech has the injector: the operator steps in after a minute)
    {
      id: 'md-stop-for-rn', when: (s) => s.role === 4 && has(s, 'dissection') && !has(s, 'contrast-stopped'),
      effect: () => ({ say: [['operator', 'No more injections — injector off, manifold closed.']], flags: ['contrast-stopped'] }),
    },
    {
      id: 'tech-stop-fallback', when: (s) => s.role === 3 && has(s, 'dissection') && !has(s, 'contrast-stopped') && s.minute >= s.flags.dissection + 1,
      effect: () => ({ say: [['operator', 'Who has the injector? Off — nobody injects!', 'warn']], flags: ['contrast-stopped'] }),
    },
    {
      id: 'md-disengage', when: (s) => s.role !== 5 && s.pulse && has(s, 'contrast-stopped') && !has(s, 'repositioned'),
      effect: (s) => ({
        say: [['operator', `Easing the guide back out of the ostium… there: coaxial at the mouth of the RCA. The trace has its notch back: ${s.vitals.sbp}/${s.vitals.dbp} is her real pressure.`]],
        flags: ['repositioned'],
      }),
    },
    {
      // the nurse treats the rate and the pressure on the operator's order while the tech works the table
      id: 'rn-for-tech', when: (s) => s.role === 3 && has(s, 'dissection') && s.pulse,
      effect: (s) => {
        const bp = bpAfter(s, 12, 8, { sbp: 130, dbp: 80 });
        return {
          say: [['team', `Nurse: "Rate ${s.rhythm.hr}, pressure ${s.vitals.sbp} — atropine 1 milligram in and fluid wide open, on the doctor's order."`], ['monitor', `Heart rate 74. BP ${bp.sbp}/${bp.dbp}.`]],
          rhythm: atRate(s, 74), vitals: bp, flags: ['rn-treated'],
        };
      },
    },
    ...TECH_ASKS.flatMap(askEvents),
    ...RN_ASKS.flatMap(askEvents),
    {
      id: 'md-wire', when: (s) => s.role !== 5 && s.pulse && torn(s) && has(s, 'repositioned') && !has(s, 'wired')
        && (s.role === 3 ? has(s, 'wire-in-hand') : s.minute >= s.flags.repositioned + 1),
      effect: () => ({ say: [['operator', 'Soft workhorse wire steered past the ostium to the distal RCA — no contrast.']], flags: ['wired', 'wire-true'] }),
    },
    {
      id: 'md-ivus-for-rn', when: (s) => s.role === 4 && s.pulse && torn(s) && has(s, 'wired') && !has(s, 'lumen-known') && s.minute >= s.flags.wired + 1.5,
      effect: (s) => ivusEffect(s, 'operator'),
    },
    {
      id: 'md-stent', when: (s) => s.role !== 5 && s.pulse && torn(s) && has(s, 'lumen-known')
        && (s.role === 3 ? has(s, 'stent-in-hand') : s.minute >= s.flags['lumen-known'] + 1),
      effect: (s) => seal(s, 'operator'),
    },
    {
      id: 'md-post', when: (s) => s.role === 3 && has(s, 'sealed') && has(s, 'nc-in-hand') && !has(s, 'postdilated'),
      effect: () => ({ say: [['operator', 'Non-compliant 4.5 at the ostium, 18 atmospheres: the aortic end flared.']], flags: ['postdilated'] }),
    },
    {
      id: 'md-final', when: (s) => s.role !== 5 && s.pulse && has(s, 'sealed') && !has(s, 'root-checked')
        && (s.role === 3 ? has(s, 'postdilated') : s.minute >= s.flags.sealed + 1),
      effect: (s) => rootCheck(s, 'operator'),
    },
    {
      // the blood in the wall closes the RCA: within minutes without a wire in the true lumen (or with the guide still jammed
      // in the ostium), at once after a second injection; with a wire and the guide backed out it holds for about ten minutes
      id: 'occlusion',
      when: (s) => s.pulse && torn(s) && !has(s, 'false-stent')
        && (injections(s) >= 2 || (s.minute >= s.flags.dissection + 4 && (!has(s, 'wire-true') || guideDeep(s))) || s.minute >= s.flags.dissection + 10),
      effect: (s) => {
        const hr = rateHeld(s) ? Math.min(s.rhythm.hr, 56) : 40;
        const sbp = Math.min(s.vitals.sbp, 72);
        const dbp = Math.min(s.vitals.dbp, 40);
        return {
          say: [
            ['monitor', `Heart rate ${hr}. BP ${sbp}/${dbp}.`, 'bad'],
            ...awake(s, 'It\'s crushing now… I feel faint.'),
            ...(s.role === 5 ? [line('team', `Nurse: "Doctor — rate ${hr}, pressure ${sbp}!"`, 'warn')] : []),
          ],
          rhythm: paced(s) ? s.rhythm : { profile: 'inferior-stemi', hr }, vitals: { sbp, dbp, pain: 9, gcs: Math.min(s.vitals.gcs, 14) }, flags: ['occluded'],
        };
      },
    },
    {
      // the inferior wall fibrillates once the RCA has been shut for a few minutes
      id: 'vf', when: (s) => s.pulse && has(s, 'occluded') && !has(s, 'sealed') && s.minute >= s.flags.occluded + 4,
      effect: (s) => ({
        say: [['monitor', 'Monitor alarm — she is unresponsive!', 'bad'], ...(s.role === 5 ? [line('team', 'Tech: "Doctor — look at the monitor!"', 'bad')] : [])],
        rhythm: { profile: 'vf', hr: 0 }, pulse: false, flags: ['vf'],
      }),
    },
    {
      id: 'to-surgery', when: (s) => s.pulse && has(s, 'false-stent') && has(s, 'surgery-called'),
      effect: () => ({ say: [['hospital', 'The surgeon has seen the runs: emergency bypass to the RCA. The OR is ready — she goes now, with the wire left in place.']], flags: ['to-surgery'] }),
    },
  ],
  critical: [
    { id: 'callout', label: 'Call out the damped pressure and the change at once', why: 'A damped trace, contrast lingering at the ostium, the rate and the pressure falling, chest pain: say it out loud so nobody injects again and the whole team switches to the problem.', done: ['callout'], after: 'dissection', roles: [3, 4], points: 10, target: { within: { flag: 'dissection', minutes: 1 } } },
    { id: 'tech-stop', label: 'Injector off: no more contrast', why: 'Every injection through a guide in a torn ostium drives the tear further — down the artery, or back up into the aortic root. The tech has the injector and the manifold: off, and closed to contrast.', done: ['stop-contrast'], after: 'dissection', roles: TECH, points: 10, target: { within: { flag: 'dissection', minutes: 1 } } },
    ...TECH_ASKS.map(askCritical),
    ...RN_ASKS.map(askCritical),
    { id: 'md-stop', label: 'Stop injecting', why: 'Repeat injections and an unchanged catheter are the commonest reasons a catheter dissection spreads: each one drives the tear further — down the RCA, or back up into the aortic root.', done: ['stop-contrast'], after: 'dissection', roles: MD, points: 10, target: { within: { flag: 'dissection', minutes: 1 } } },
    {
      id: 'md-disengage', label: 'Back the guide out of the ostium to coaxial', roles: MD, points: 10, target: { within: { flag: 'dissection', minutes: 2 } },
      why: 'The deep-seated Amplatz tip (the damped trace) caused the tear and keeps working on it: ease it back until it sits coaxial and the trace has its notch back — then check the real pressure.',
      done: (s) => startedAt(s, 'repositioned', ['reposition', ...RIGHT_GUIDES]), uses: ['reposition', ...RIGHT_GUIDES],
    },
    { id: 'md-rate', label: 'Treat the slow rate (atropine first)', why: 'The closing RCA takes the sinus and AV nodes with it: atropine 1 mg IV; pace if it does not hold.', done: RATE, after: 'dissection', roles: MD, points: 5, target: { within: { flag: 'dissection', minutes: 3 } } },
    { id: 'md-pressure', label: 'Support the pressure (fluid first)', why: 'An ischemic inferior wall and right ventricle need their filling: fluid wide open; push-dose epinephrine or a pressor if it is not enough.', done: SUPPORT, after: 'dissection', roles: MD, points: 5, target: { within: { flag: 'dissection', minutes: 3 } } },
    {
      id: 'md-wire', label: 'A soft workhorse wire into the true lumen', roles: MD, points: 10, target: { within: { flag: 'dissection', minutes: 4 } },
      why: 'The wire in the true lumen is the lifeline: it carries the IVUS and the stent, and keeps a way back if the artery closes. A soft, non-hydrophilic workhorse, steered without contrast, through a guide sitting coaxial; never pull it out once it is there.',
      done: (s) => startedAt(s, 'wire-true', WIRES), uses: WIRES,
    },
    {
      id: 'md-ivus', label: 'Confirm the true lumen with IVUS before any stent', roles: MD, points: 15, target: { within: { flag: 'dissection', minutes: 6 } },
      why: 'A stent over a wire in the false lumen crushes the true one and shuts the artery. IVUS needs no contrast, sees the aorto-ostial junction, and shows which lumen the wire is in, where the entry is and how far the blood in the wall runs.',
      done: (s) => (has(s, 'lumen-known') && (!has(s, 'sealed') || s.flags['lumen-known'] <= s.flags.sealed) ? startedAt(s, 'lumen-known', IMAGING) : null), uses: IMAGING,
    },
    {
      id: 'md-seal', label: 'Seal the entry: a stent from the ostium', roles: MD, points: 15, target: { within: { flag: 'dissection', minutes: 8 } },
      why: 'A stent placed 1 mm out into the aorta covers the entry at the ostium and the blood in the wall: the tear stops growing and the RCA fills again.',
      done: (s) => startedAt(s, 'sealed', STENTS), uses: STENTS,
    },
    { id: 'md-root', label: 'Final runs: the stent, the flow and the aortic root', why: 'With the guide backed out into the root, a gentle injection shows whether the stain in the aortic wall is limited to the ostium or climbing the ascending aorta — and confirms TIMI 3 flow and the stent edges.', done: ['final-angio'], after: 'sealed', roles: MD, points: 5, applies: (s) => has(s, 'sealed') },
    // an echo any time after the tear counts (one done early, to look at the root and the pericardium, is no mistake —
    // and the echo cannot be repeated); it is asked for once the entry is sealed
    { id: 'md-echo', label: 'Echo: the aortic root, the valve and the pericardium', why: 'A tear that reached the aortic root can bring a flap, aortic regurgitation or blood in the pericardium; the echo also shows the wall motion.', done: ['echo'], after: 'dissection', roles: MD, points: 5, applies: (s) => has(s, 'sealed') },
    {
      id: 'md-surgery', label: 'Call cardiac surgery when it climbs the aorta (or the artery is lost)', roles: MD, points: 10,
      why: 'A tear that runs more than 4 cm up the ascending aorta (Dunning class III), or an RCA that cannot be reopened, needs the surgeons involved at once: some can be sealed and watched, some need repair or a bypass.',
      done: ['call-surgery'], target: { within: { flag: 'root-spread', minutes: 2 } }, applies: (s) => has(s, 'root-spread') || has(s, 'false-stent'),
    },
    { id: 'defib', label: 'Defibrillate VF within 1 minute', why: 'In the lab, VF is witnessed with the pads on: shock it within seconds.', done: ['defib', 'aed'], after: 'arrest', points: 15, target: { within: { flag: 'arrest', minutes: 1 } }, applies: (s) => has(s, 'arrest') },
    { id: 'post-ecg', label: '12-lead once the flow is back', why: 'The inferior ST elevation settling confirms the RCA is perfusing again; it is the baseline for the unit.', done: ['ecg12', 'ecg12-repeat'], after: 'reflow', points: 5, applies: (s) => has(s, 'reflow') },
    { id: 'hemostasis', label: 'Radial band and distal perfusion check', why: 'Patent hemostasis, as always — with heparin, aspirin and clopidogrel on board.', done: ['hemostasis'], after: 'root-checked', roles: [3, 4], points: 5, applies: (s) => has(s, 'root-checked') },
    { id: 'handoff', label: 'Hand-off to the cardiac unit', why: 'The tear at the RCA ostium and how far it went (the aortic root), the stent, the drugs, the final flow, the access site — and the plan: watch the pressure and the chest pain, CT of the aorta once she is stable, aspirin and clopidogrel without a break.', done: ['handoff'], roles: [4, 5], points: 5 },
  ],
  harms: [
    { id: 'inject-into-dissection', actions: [...VIEWS, 'clear-air'], roles: MD, when: (s) => mdTorn(s) && !has(s, 'inj-1'), points: 8, severity: 'major', text: 'Another contrast injection through a guide in a torn ostium. Each injection drives the tear further — down the RCA, or back up into the aortic root — and repeat injections are the commonest reason a catheter dissection spreads. Stop injecting; wire the true lumen without contrast and look with IVUS.' },
    { id: 'inject-again', actions: [...VIEWS, 'oct', 'clear-air'], roles: MD, when: (s) => mdTorn(s) && has(s, 'inj-1'), points: 12, severity: 'critical', text: 'Injecting again after the stain had already spread into the aortic wall. The next injection drives it up the ascending aorta — an aortocoronary dissection that may need surgery — and closes the RCA.' },
    { id: 'angio-after-dissection', actions: ['angio'], roles: MD, when: (s) => mdTorn(s), points: 10, severity: 'major', text: 'A diagnostic angiogram of both coronaries after the tear. Standard views need a diagnostic catheter: the guide comes out — and any wire with it — and a fresh catheter injects into the torn ostium. Never pull a wire out of a dissected artery: getting back into the true lumen may be impossible.' },
    // the same mistake by another name: a catheter or guide shape swapped in for the Amplatz. Like the angiogram, one
    // penalty covers its puff into the RCA too; what that puff does to the tear is the consequence
    { id: 'guide-out-after-dissection', actions: SWAPS, roles: MD, when: (s) => mdTorn(s) && has(s, 'guide'), points: 8, severity: 'major', text: 'Pulling the Amplatz out of a torn ostium for another catheter. Any wire comes out with it, and a catheter that has to find the RCA again does it with contrast. Keep the guide (backed out to coaxial) and the wire where they are, and fix the RCA through them; exchange a guide only over a wire in the true lumen.' },
    { id: 'ic-vasodilator-dissection', actions: IC_VASODILATORS, replaces: ['nitroprusside-hypotension', ...RATE_RULES], when: (s) => s.pulse && torn(s), points: 5, severity: 'major', text: 'An intracoronary vasodilator down a guide in a torn ostium. There is no slow flow in the small vessels and no spasm to treat: the flow is slow because blood in the wall squeezes the lumen. Adenosine and verapamil slow a heart the ischemia is already slowing, and verapamil and nitroprusside drop a low pressure further.' },
    { id: 'ic-epi-no-indication', actions: ['ic-epinephrine'], when: (s) => s.pulse, points: 3, severity: 'minor', text: 'Intracoronary epinephrine with nothing for it to treat. It is a drug for no-reflow with a low pressure; here the flow is squeezed by blood in the wall, and the pressure is held up with fluid (or a pressor).' },
    { id: 'cocktail-low-pressure', actions: ['radial-cocktail'], when: (s) => s.pulse && s.vitals.sbp < 100, replaces: RATE_RULES, points: 3, severity: 'minor', text: 'The radial cocktail (verapamil and nitroglycerin) with a low pressure. Nothing in the radial needs it now, and both drugs drop the pressure further.' },
    { id: 'mcs-torn-root', actions: ['iabp', 'impella'], roles: MD, when: (s) => s.pulse && torn(s), points: 3, severity: 'minor', text: 'A mechanical pump while the RCA ostium is torn open. The tear can reach the aortic root, where an aortic dissection is a contraindication to a balloon pump and an Impella crosses the valve right beside it — and neither seals anything; both take minutes the artery does not have. Fluid and a pressor hold the pressure until the stent is in.' },
    { id: 'oct-flush', actions: ['oct'], roles: MD, when: (s) => mdTorn(s) && has(s, 'wired') && !has(s, 'inj-1'), points: 4, severity: 'minor', text: 'OCT for a tear at the ostium. Its forceful contrast flush is another injection into the tear, and it cannot clear the blood at the aorto-ostial junction. IVUS needs no contrast and sees the ostium, the lumen the wire is in and the blood in the wall.' },
    { id: 'guide-exchange-unwired', actions: RIGHT_GUIDES, roles: MD, when: (s) => mdTorn(s) && has(s, 'guide') && !has(s, 'wired') && !has(s, 'inj-1'), points: 4, severity: 'minor', text: 'Changing the guide at a torn ostium before a wire is down the true lumen. The new guide needs contrast to find the ostium — another injection into the tear — and its tip probes the flap. Back the guide out to coaxial and wire through it; exchange later over the wire if you must.' },
    { id: 'guide-exchange-again', actions: RIGHT_GUIDES, roles: MD, when: (s) => mdTorn(s) && has(s, 'guide') && !has(s, 'wired') && has(s, 'inj-1'), points: 12, severity: 'critical', text: 'A guide exchange that needed contrast after the stain had already spread into the aortic wall. The puff to find the ostium drives the tear up the ascending aorta and closes the RCA.' },
    { id: 'hydrophilic-in-dissection', actions: ['wire-hydrophilic'], roles: MD, when: (s) => mdTorn(s) && has(s, 'guide'), points: 5, severity: 'major', text: 'A hydrophilic wire in a dissected artery. A polymer-jacketed wire slips under the flap into the false channel; a soft, non-hydrophilic workhorse follows the true lumen.' },
    { id: 'stent-false-lumen', actions: STENTS, roles: MD, when: (s) => mdTorn(s) && has(s, 'wired') && !has(s, 'wire-true') && !has(s, 'false-stent'), points: 15, severity: 'critical', text: 'A stent over a wire in the false lumen. It opens the channel in the wall and crushes the true lumen: the artery shuts, and reopening it may need surgery. Confirm the true lumen with IVUS before any stent.' },
    { id: 'stent-blind', actions: STENTS, roles: MD, when: (s) => mdTorn(s) && has(s, 'wire-true') && !has(s, 'lumen-known'), points: 8, severity: 'major', text: 'A stent before knowing which lumen the wire is in. This time it was the true lumen; over a wire in the false one the stent crushes the true lumen and shuts the artery. IVUS first: it needs no contrast.' },
    { id: 'covered-for-dissection', actions: ['stent-covered'], roles: MD, when: (s) => mdTorn(s) && has(s, 'wire-true'), points: 3, severity: 'minor', text: 'A covered stent for a tear at the ostium. A drug-eluting stent seals the entry; a covered stent shuts every side branch it covers (the conus and sinus node branches leave the proximal RCA), clots and restenoses more, and is kept for a tear a drug-eluting stent has not sealed.' },
    { id: 'balloon-in-dissection', actions: ['balloon-predil'], roles: MD, when: (s) => mdTorn(s) && has(s, 'wired'), points: 3, severity: 'minor', text: 'A balloon inflated in the torn segment before the stent. It pushes the blood in the wall further along and can lengthen the tear: with the wire in the true lumen, seal the entry with a stent directly.' },
    { id: 'aspiration-in-dissection', actions: ['aspiration'], roles: MD, when: (s) => mdTorn(s) && has(s, 'wired'), points: 3, severity: 'minor', text: 'An aspiration catheter in a dissected artery. There is no clot to retrieve, and a stiff catheter pushed past the flap can lengthen the tear.' },
    // the tech only sets up the run or opens the device — the operator refuses it and nothing reaches the patient
    { id: 'tech-cine-dissection', actions: VIEWS, roles: TECH, when: (s) => torn(s), points: 3, severity: 'minor', text: 'A cine run set up while the ostium was torn. Every run is a contrast injection into the tear: nobody injects until the entry is sealed.' },
    { id: 'tech-unasked-stent', actions: STENTS, roles: TECH, when: (s) => torn(s) && !has(s, 'lumen-known'), points: 2, severity: 'minor', text: 'A stent opened before anyone knew which lumen the wire was in. Open devices when the operator asks for them: the stent waits for the IVUS.' },
    // until the entry is sealed the right ventricle is ischemic, whatever the pressure has been pushed up to: this covers the
    // built-in rule under 90 too. Once the flow is back, only a systolic under 100 still counts
    { id: 'nitro-low-pressure', actions: ['nitro', 'nitro-high', 'ic-nitro'], replaces: ['nitro-hypotension'], when: nitroWrong, points: 6, severity: 'major', text: 'Nitroglycerin while the torn RCA was closing (or the pressure low). V4R shows the right ventricle ischemic, and her pressure had fallen far more than 30 below her 136: nitrates are avoided with a right ventricular infarction, a systolic under 90 or a fall of more than 30 (2025 ACC/AHA ACS), because they drop the filling an ischemic right ventricle depends on — and the pressure with it. They open nothing here either: the flap is mechanical, and the fix is a stent. For the pain: fentanyl.' },
    // the built-in rule in its own words, only where the one above does not already apply: one mistake, one penalty
    { id: 'nitro-high-not-hypertensive', actions: ['nitro-high'], when: (s) => s.pulse && !nitroWrong(s) && s.vitals.sbp < 160, points: 3, severity: 'minor', text: 'High-dose nitroglycerin without a high blood pressure. 0.8 mg is for hypertensive pulmonary edema with a systolic of 160 or more; below that step down to 0.4 mg, and hold nitrates when the pressure is low.' },
    { id: 'beta-blocker', actions: ['metoprolol'], when: stillSlowOrLow, replaces: RATE_RULES, points: 8, severity: 'major', text: 'An IV beta-blocker with a slow rate and a low pressure from a closing RCA. It slows the rate and weakens the squeeze further.' },
    // once the flow is back: no longer dangerous at once, but nothing to give it for, minutes after a rate of 48 and a pressure of 84
    { id: 'beta-blocker-after', actions: ['metoprolol'], when: (s) => !stillSlowOrLow(s), replaces: RATE_RULES, points: 3, severity: 'minor', text: 'An IV beta-blocker with nothing to treat. Minutes ago the closing RCA gave her a rate of 48 and a pressure of 84: an IV beta-blocker is not routine after a myocardial infarction and is avoided in anyone at risk of a low output (2025 ACC/AHA ACS). An oral one can start on the unit once she is stable.' },
    // the heparin from the start of the case still holds the ACT in range (272 s): more only adds bleeding. After protamine
    // has reversed it, a new bolus is right
    { id: 'heparin-extra', actions: ['heparin'], when: (s) => !reversed(s), points: 3, severity: 'minor', text: 'Another heparin bolus with the ACT already in range. More heparin adds bleeding — into the wall of the torn artery among other places — and treats nothing: check the ACT and redose only when it falls below the PCI target (250–300 s).' },
    // no tachycardia anywhere in this case: drugs that slow the node or treat an arrhythmia only slow a heart the RCA has
    // slowed and drop its pressure. While the nurse's rate request is open, a wrong answer to it is that request's own
    // penalty ('wrong-rn-rate'): one mistake, one penalty
    { id: 'nodal-blocker-no-tachycardia', actions: ['adenosine6', 'adenosine12', 'diltiazem'], when: (s) => s.pulse && !(s.role === 4 && has(s, 'asked-rn-rate') && !has(s, 'rate-treated')), replaces: RATE_RULES, points: 5, severity: 'major', text: 'Adenosine or diltiazem with no tachycardia to treat. They slow the AV node, and diltiazem drops the pressure — in a heart the RCA has just slowed, with a right ventricle that needs its rate and its filling.' },
    { id: 'antiarrhythmic-no-arrhythmia', actions: ['amio-infusion', 'procainamide'], replaces: ['procainamide-hypotension', 'procainamide-slow', ...RATE_RULES], when: (s) => s.pulse, points: 8, severity: 'major', text: 'An antiarrhythmic infusion with no arrhythmia to treat. Amiodarone and procainamide slow the heart and drop the pressure; the slow rate and the low pressure here come from the RCA, and the fix is the stent.' },
    { id: 'lidocaine-no-arrhythmia', actions: ['lidocaine'], when: (s) => s.pulse, points: 3, severity: 'minor', text: 'Lidocaine with no ventricular arrhythmia to treat. Lidocaine to prevent VF in an acute MI brings no benefit and more asystole; here it only adds its toxicity.' },
    { id: 'epi-im-no-anaphylaxis', actions: ['epi-im'], when: (s) => s.pulse, points: 3, severity: 'minor', text: 'IM epinephrine with no anaphylaxis. It speeds the heart and raises its oxygen demand while the RCA is closing; a low pressure here takes fluid first, then push-dose epinephrine or an infusion that can be titrated.' },
    { id: 'adenosine-infusion-dissection', actions: ['adenosine-iv-ffr'], when: (s) => s.pulse && torn(s), replaces: ['ffr-adenosine-unsafe', 'ffr-adenosine-no-wire'], points: 3, severity: 'minor', text: 'An IV adenosine infusion with nothing to measure. It makes the hyperemia for an FFR of a narrowing; in a torn ostium it only drops the pressure and slows the AV node of a heart the ischemia is already slowing.' },
    { id: 'protamine-dissection', actions: ['protamine'], points: 10, severity: 'major', text: 'Protamine with a wire in a torn artery and a stent to come (or just in). Reversing the heparin lets clot form on the wire, in the false channel and in the fresh stent; the tear is sealed with a stent, not by reversing the anticoagulant.' },
    { id: 'gp-in-dissection', actions: ['gp2b3a'], points: 4, severity: 'minor', text: 'A GP IIb/IIIa inhibitor with no clot to treat. It adds bleeding — into the wall of a torn artery and the aortic root among other places — and treats nothing here.' },
    { id: 'lytic-in-lab', actions: ['tnk'], points: 15, severity: 'critical', text: 'A systemic fibrinolytic in the lab. A torn artery is closed by the blood in its wall, not by clot: a lytic treats nothing and makes the wall — and everything else — bleed.' },
    { id: 'oxygen-normoxic', actions: ['o2-nc', 'o2-nrb'], when: (s) => s.pulse && s.vitals.spo2 >= 90, points: 2, severity: 'minor', text: 'Oxygen with an SpO₂ of 90 % or more. Oxygen is for SpO₂ below 90 %.' },
    askHarm(TECH_ASKS[0], 'A hydrophilic wire when the operator asked for a soft workhorse. In a dissected artery it slips into the false channel. Check the order and the box before you open it.'),
    askHarm(TECH_ASKS[1], 'OCT when the operator asked for IVUS. Its forceful contrast flush is another injection into the torn ostium, and it cannot clear the blood there.'),
    askHarm(TECH_ASKS[2], 'The wrong device when the operator asked for a drug-eluting stent to seal the ostium. Check the order and the box before you open it.'),
    askHarm(TECH_ASKS[3], 'A compliant balloon when the operator asked for a non-compliant one. Taken to high pressure, it grows past its size and can tear the vessel at the stent edges.'),
    { ...askHarm(RN_ASKS[0], 'A drug that slows the rate further when the operator asked for something for a rate of 48. Atropine 1 mg IV.', 5), actions: ['adenosine6', 'adenosine12', 'diltiazem'], replaces: RATE_RULES },
  ],
  timings: [
    { label: 'Contrast stopped', actions: ['stop-contrast'], flag: 'contrast-stopped', target: 1, from: 'dissection' },
    { label: 'Wire in the true lumen', actions: [], flag: 'wire-true', target: 4, from: 'dissection' },
    { label: 'Entry sealed with a stent', actions: [], flag: 'sealed', target: 9, from: 'dissection' },
  ],
  deathAfter: 8,
  // the procedure is over once the entry is sealed and the root checked (with the surgeons involved if it climbed the aorta),
  // or once the surgeons take her for a bypass after a stent in the false lumen
  completeWhen: (s) => (has(s, 'sealed') && has(s, 'root-checked') && (!has(s, 'root-spread') || has(s, 'surgery-called'))) || has(s, 'to-surgery'),
  teaching: [
    'A guide catheter can tear the coronary it sits in: an Amplatz or other aggressive guide that deep-seats, a tip against the wall, and above all an injection through a wedged tip (a damped or ventricularized pressure). A small or diseased ostium, female sex, high blood pressure, the radial route and an acute MI raise the risk; the RCA ostium is the classic site.',
    'Signs: contrast that lingers at the ostium after the artery has cleared (a stain or cap), a thin lucent flap, slower flow — then chest pain, ST elevation in that territory and, from the RCA, a slow rate and a low pressure.',
    'Stop injecting. Every injection through a guide in a torn ostium drives the tear further, down the artery or back up into the aortic root (an aortocoronary dissection); repeat injections and an unchanged catheter are the commonest reasons it spreads. Look at the pressure before every injection: a damped trace means no injection until the catheter is repositioned.',
    'Back the guide out to coaxial, and keep or regain a wire in the true lumen: a soft, non-hydrophilic workhorse, steered without contrast. Never pull out a wire that is in the true lumen — getting back may be impossible. Hydrophilic wires slip into the false channel.',
    'Confirm the true lumen with IVUS before any stent: it needs no contrast, sees the aorto-ostial junction, and shows the entry, the length of the blood in the wall and the vessel size. OCT needs a forceful contrast flush and cannot clear the blood at an ostial tear. A stent over a wire in the false lumen crushes the true lumen and shuts the artery.',
    'Seal the entry: a drug-eluting stent placed 1 mm out into the aorta, long enough to cover the ostium and run past the end of the blood in the wall, put in directly (no balloon in the torn segment first); then a non-compliant balloon to flare the ostium.',
    'Check the aortic root: gentle runs with the guide backed out, and an echo (the root, the aortic valve, the pericardium). A tear limited to the cusp, or less than 4 cm up the aorta (Dunning class I–II), is usually sealed by the ostial stent and watched, with a CT of the aorta once she is stable. One that climbs farther up the ascending aorta (class III) needs cardiac surgery involved at once: many are still sealed with a stent and watched; some need repair.',
    'The nurse treats what the closing RCA does: atropine for the slow rate, fluid for the low pressure (an ischemic right ventricle needs its filling), fentanyl for the pain — no nitroglycerin while the RCA is closing (V4R shows the right ventricle ischemic, and the pressure is low). The heparin and the antiplatelet drugs stay on: the stent needs them.',
    'The tech calls it out at once — a damped trace, a stain at the ostium, the rate and the pressure falling — takes the injector off, and hands the soft wire, the IVUS catheter, the stent and the non-compliant balloon as they are asked for.',
  ],
};
