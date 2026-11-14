/**
 * Give a medication in the Learn view and watch what it does to the live 12-lead.
 *
 * For each drug: how it is given, the usual adult dose for this patient's weight, and — for the rhythm on
 * the monitor at the moment it is pushed — a timeline of what the ECG shows (rhythm changes, rate changes and
 * interval changes such as a longer PR or a wider QRS) with a note for each step, plus a verdict on the
 * choice of drug and dose. Pure and deterministic: the same push on the same rhythm always plays out the same
 * way, showing the classic expected response (the notes say where real patients often differ).
 *
 * Doses follow the drug cards in the Library (2025 AHA Guidelines for CPR and ECC; 2025 ACC/AHA ACS, 2026
 * AHA/ACC acute PE, 2023 ACC/AHA/ACCP/HRS AF, 2022 ACC/AHA aortic disease and 2015 ACC/AHA/HRS SVT guidelines).
 * Educational only — always follow current guidelines and local protocols.
 */
import { resolveProfile, type ECGProfile } from '@/lib/ecg/profiles';
import type { RhythmMods } from '@/lib/ecg/mods';
import type { MedicationId } from '@/types/content';
import type { Problem } from '@/lib/sim/scenario/types';

export type MedId = Extract<MedicationId,
  | 'adenosine' | 'diltiazem' | 'metoprolol' | 'esmolol' | 'amiodarone' | 'procainamide' | 'sotalol' | 'lidocaine' | 'digoxin'
  | 'atropine' | 'epinephrine' | 'magnesium-sulfate' | 'calcium-chloride' | 'sodium-bicarbonate' | 'insulin-dextrose' | 'albuterol'
  | 'aspirin' | 'ticagrelor' | 'clopidogrel' | 'prasugrel' | 'tenecteplase' | 'heparin' | 'nitroglycerin' | 'fentanyl' | 'phenylephrine'>;

export type DoseUnit = 'mg' | 'mcg' | 'g' | 'mEq' | 'units';
export type DoseClass = 'low' | 'usual' | 'high' | 'toxic';

export interface Given {
  id: MedId;
  dose: number;
  /** simulation time of the push (ms) */
  at: number;
}

/** The patient at the moment of the push */
export interface Patient {
  /** rhythm on the monitor (ECG profile id) and its rate setting */
  profileId: string;
  hr: number;
  kg: number;
  /** doses already given to this patient */
  given: Given[];
  /** systolic BP on the monitor at the push (falls back to the rhythm's typical hemodynamics) */
  sbp?: number;
  /**
   * drug time of this push (ms), on the same clock as `Given.at`: the store adds what skip-ahead has brought forward, so
   * the interval since an earlier dose is the time the drugs have really had. Without it no interval rule is applied.
   */
  now?: number;
  /** age in years, when the learner sets one (without it the doses are those for an adult under 75) */
  age?: number;
  /** what the patient has, in the case simulator's Problem words (without it: nothing known beyond the monitor) */
  problems?: readonly Problem[];
  /**
   * the library page the patient belongs to, when it says more than the tracing: SCAD draws an anterior STEMI, but a tear in
   * the artery wall is no clot to lyse
   */
  conditionId?: string;
}

export interface EffectStep {
  /** ms after the push */
  at: number;
  /** switch to this rhythm (profile id) and / or rate */
  profile?: string;
  hr?: number;
  /** this drug's effect on the intervals from now on (null removes it) */
  mods?: RhythmMods | null;
  /** a transient effect wearing off: back to the rhythm that was on the monitor at the push */
  restore?: boolean;
  /** what the learner should see now */
  note: string;
  tone: 'effect' | 'good' | 'warn' | 'info';
  /** short label marked on the ECG strip */
  mark?: string;
}

export interface Verdict {
  tone: 'good' | 'caution' | 'bad';
  text: string;
}

export interface DosePlan {
  doseClass: DoseClass;
  /** e.g. "20 mg = 0.25 mg/kg — the usual dose" */
  doseText: string;
  /** is this drug right for this rhythm? */
  verdict: Verdict;
  steps: EffectStep[];
}

type Range = { low: number; high: number };

export interface MedDef {
  id: MedId;
  name: string;
  group: (typeof MED_GROUPS)[number];
  unit: DoseUnit;
  /** how it is given */
  route: string;
  /** the button: "Push", "Give", "Start" */
  verb: string;
  onset: string;
  /** dosing guide (the drug card's summary for this use) */
  guide: string;
  /** usual adult dose for this patient (may depend on the rhythm, e.g. arrest vs with a pulse, or the doses so far) */
  usual(p: Patient): Range;
  /** a single dose above this is an overdose */
  max(p: Patient): number;
  /** suggested doses for the picker (the learner can also type any dose) */
  picks(p: Patient): number[];
  /** smallest dose step for the picker */
  step: number;
  /** how far from the usual range still counts as usual (default 15%: rounding to a syringe) */
  tolerance?: number;
  /**
   * A load given once (the P2Y12 inhibitors): the dose is judged on everything given of this drug so far, so a repeat
   * counts toward the load instead of passing as another "usual dose". `usual` and `max` are then totals.
   */
  cumulative?: boolean;
  /** what the drug does to this rhythm; `cls` is the dose class */
  plan(p: Patient, dose: number, cls: DoseClass): { verdict: Verdict; steps: EffectStep[] };
}

export const MED_GROUPS = ['Antiarrhythmics & rate control', 'Bradycardia & arrest', 'Electrolytes', 'Coronary care & other'] as const;

// ─── Rhythm categories ─────────────────────────────────────────────────────

export type Category =
  | 'arrest' | 'torsades' | 'svt' | 'af' | 'flutter' | 'vt' | 'brady' | 'junctional' | 'avb1' | 'wenckebach'
  | 'mobitz2' | 'chb' | 'paced' | 'aivr' | 'sinus-tach' | 'pvcs' | 'hyperk' | 'stemi' | 'sinus';

const STEMI = new Set(['anterior-stemi', 'inferior-stemi', 'lateral-stemi', 'inferior-stemi-chb', 'posterior-stemi']);
/** sinus tachycardia that is a response to something else (shock, PE, tamponade, pericarditis…) */
const COMPENSATORY = new Set(['sinus-tachycardia', 'cardiogenic-shock', 'pulmonary-embolism', 'tamponade', 'pericarditis']);
/** acute coronary syndromes, whatever the rhythm (antiplatelets and anticoagulation belong here) */
const ACS = new Set(['anterior-stemi', 'inferior-stemi', 'lateral-stemi', 'inferior-stemi-chb', 'posterior-stemi', 'cardiogenic-shock', 'anterior-stemi-reperfused', 'inferior-stemi-reperfused', 'nstemi', 'wellens']);
const isAcs = (p: ECGProfile) => ACS.has(p.id);
const DISSECTION = 'aortic-dissection';
/** anti-impulse therapy in acute aortic syndrome (2022 ACC/AHA aortic disease guideline) */
const DISSECTION_TARGET = 'target heart rate 60–80/min and systolic BP below 120 mmHg, or the lowest that keeps the organs perfused';
/**
 * β-blockade in dissection once the rate is already inside its target: the next step for a pressure still above
 * target is a vasodilator, which is safe now that the rate is controlled (no reflex tachycardia).
 */
const dissectionAtTarget = (hr: number): Verdict =>
  caution(`Acute aortic dissection with the heart rate already ${hr}/min — inside the 60–80/min target. If the systolic pressure is still above 120 mmHg, add a vasodilator now (nicardipine, clevidipine or nitroprusside); more β-blocker mainly adds bradycardia.`);

/**
 * A dynamic LV outflow obstruction on the page: obstructive HCM, or Takotsubo with LV outflow obstruction (its own heart,
 * the same 12-lead as Takotsubo). Nitrates, catecholamines and inotropes worsen it; fluid and phenylephrine help
 */
const outflowObstructed = (p: ECGProfile) => p.hemo === 'hcm' || p.hemo === 'takotsubo-lvoto';

/** below this rate the heart is slow, whatever the rhythm is called */
const SLOW = 60;
/** the bradycardia algorithm is for rates typically below this: from here to SLOW the rate alone seldom explains symptoms */
const BRADY_ALGORITHM = 50;

/**
 * What kind of rhythm the drugs see. With the rate on the monitor (`hr`), a sinus rhythm below 60/min is a
 * bradycardia whatever its page is called: normal sinus rhythm slowed to 35, a bundle branch block at 38.
 */
export function category(p: ECGProfile, hr?: number): Category {
  if (p.rhythm === 'torsades') return 'torsades';
  if (p.hemo === 'no-output') return 'arrest';
  // every stage of a high potassium (the peaked T waves, the moderate and the sine-wave tracings)
  if (p.id.startsWith('hyperkalemia')) return 'hyperk';
  if (STEMI.has(p.id) && p.rhythm !== 'chb') return 'stemi';
  switch (p.rhythm) {
    case 'svt': return 'svt';
    case 'af': return 'af';
    case 'flutter': return 'flutter';
    case 'vt': return 'vt';
    case 'junctional': return 'junctional';
    case 'wenckebach': return 'wenckebach';
    case 'mobitz2': return 'mobitz2';
    case 'chb': return 'chb';
    case 'paced': case 'vpaced': return 'paced';
    case 'pvc': return 'pvcs';
    // a ventricular focus, whatever its rate: never a "sinus bradycardia"
    case 'aivr': return 'aivr';
    default:
      if (p.id === 'sinus-bradycardia') return 'brady';
      if (p.id === 'first-degree-avb') return 'avb1';
      if (hr !== undefined && hr > 0 && hr < SLOW) return 'brady';
      if (COMPENSATORY.has(p.id)) return 'sinus-tach';
      return 'sinus';
  }
}

const BRADY: Category[] = ['brady', 'junctional', 'avb1', 'wenckebach', 'mobitz2', 'chb'];
const isBrady = (c: Category) => BRADY.includes(c);
/** rhythms driven by the sinus node with every beat conducted: the ones that can turn into "sinus rhythm with …" */
const SINUS: Category[] = ['sinus', 'sinus-tach', 'brady', 'avb1', 'stemi', 'pvcs', 'hyperk'];
const isSinus = (c: Category) => SINUS.includes(c);
/**
 * A slow sinus rate in a rhythm that keeps its own category, because the drugs still need to know what it is:
 * an infarct at 40/min is still an infarct (fibrinolysis, aspirin), and it is also a bradycardia.
 */
const slowSinus = (c: Category, p: Patient) => (c === 'stemi' || c === 'pvcs' || c === 'hyperk') && p.hr > 0 && p.hr < SLOW;
/**
 * AIVR (accelerated idioventricular rhythm): a ventricular focus a little faster than the sinus node, the classic
 * rhythm of reperfusion. It is benign, ends by itself and needs no treatment. It does not run through the AV node,
 * so AV-nodal drugs do not slow it; and it must not be suppressed — what is left underneath may be a slow sinus
 * rhythm, or nothing.
 */
function aivrNodal(): Verdict {
  return bad('No indication: AIVR is a ventricular rhythm (a focus a little faster than the sinus node) that needs no treatment. It does not run through the AV node, so AV-nodal blockers do not slow it.');
}
function suppressesAivr(drug: string, at: number): { verdict: Verdict; steps: EffectStep[] } {
  return {
    verdict: bad(`Do not suppress AIVR with ${drug}: it is a benign reperfusion rhythm that ends by itself, and with the ventricular focus suppressed what is left may be a slow sinus rhythm — or none. It needs no treatment.`),
    steps: [{ at, profile: 'sinus-bradycardia', hr: 48, note: 'The ventricular focus is suppressed: underneath it is a slow sinus rhythm (48/min) — a worse rhythm than the AIVR was.', tone: 'warn', mark: 'AIVR gone' }],
  };
}

/** AF or flutter that is not fast: for a rate-control drug there is no rate to control */
function noRateToControl(c: Category, p: Patient): Verdict | null {
  if (c !== 'af' && c !== 'flutter') return null;
  if (p.hr < SLOW) return bad(`The ventricular rate is already slow (${p.hr}/min): more AV-nodal block risks pauses, heart block and hypotension. Look for the cause of the slow rate (AV-nodal drugs, digoxin toxicity, ischemia, a diseased conduction system).`);
  if (p.hr < 110) return caution(`The rate is already controlled (${p.hr}/min — the goal is below 110 at rest, below 80 if symptoms persist): more AV-nodal block is not needed and risks bradycardia and hypotension.`);
  return null;
}
/**
 * Sustained polymorphic VT (torsades) is defibrillated at once, with an unsynchronized shock whether or not there is
 * a pulse (2025 AHA: a synchronized shock cannot reliably find the R waves of a polymorphic rhythm); magnesium follows.
 */
const TORSADES = 'Sustained torsades is defibrillated at once — unsynchronized, pulse or not; then magnesium 1–2 g, stop QT-prolonging drugs and correct K⁺.';

/**
 * An IV β-blocker in acute MI: the metoprolol label rules it out with a systolic below 100 mmHg (and a heart rate below 45,
 * a PR of 0.24 s or more, AV block beyond the first degree, moderate or severe failure); ACC/AHA calls it harmful with a
 * raised risk of cardiogenic shock — age over 70, a systolic under 120, a heart rate over 110 (or under 60, which the
 * slow-rate branches already refuse) and a late presentation (2013 ACCF/AHA STEMI, after COMMIT; 2025 ACC/AHA ACS)
 */
function miBetaRisk(p: Patient): string | null {
  if (p.sbp !== undefined && p.sbp < 100) return `Contraindicated here: a systolic of ${p.sbp} mmHg in an acute MI — the metoprolol injection label rules out IV use below 100 mmHg, and a β-blocker can tip a borderline pressure into cardiogenic shock (COMMIT).`;
  if (p.hr > 110) return `Harmful here: a heart rate of ${p.hr}/min in an acute MI is a risk factor for cardiogenic shock (the fast rate is often holding up the output) — no IV β-blocker (2013 ACCF/AHA STEMI guideline, after COMMIT). Find the cause; oral β-blockade later once stable.`;
  if (p.sbp !== undefined && p.sbp < 120) return `Harmful here: a systolic of ${p.sbp} mmHg (under 120) is a risk factor for cardiogenic shock in an acute MI — no IV β-blocker (2013 ACCF/AHA STEMI guideline, after COMMIT; 2025 ACC/AHA ACS). Oral β-blockade later once stable.`;
  if (p.age !== undefined && p.age > 70) return `Harmful here: an age over 70 (${p.age}) is a risk factor for cardiogenic shock in an acute MI — no IV β-blocker (2013 ACCF/AHA STEMI guideline, after COMMIT; 2025 ACC/AHA ACS). Oral β-blockade later once stable.`;
  return null;
}

/** hypotensive now (SBP < 90) */
const lowBP = (p: Patient, prof: ECGProfile) => (p.sbp !== undefined ? p.sbp < 90 : prof.hemo === 'shock' || prof.hemo === 'no-output');
/** heart failure or hypotension: negative inotropes are dangerous */
const failing = (p: Patient, prof: ECGProfile) => prof.hemo === 'hfref' || lowBP(p, prof);

// ─── Helpers ───────────────────────────────────────────────────────────────

const S = 1000;
const MIN = 60 * S;

const good = (text: string): Verdict => ({ tone: 'good', text });
const caution = (text: string): Verdict => ({ tone: 'caution', text });
const bad = (text: string): Verdict => ({ tone: 'bad', text });

const rate = (hr: number, f: number, lo = 30, hi = 220) => Math.round(Math.min(hi, Math.max(lo, hr * f)));
const round = (x: number, to: number) => Math.max(to, Math.round(x / to) * to);
const dosesOf = (p: Patient, id: MedId) => p.given.filter((g) => g.id === id);
const totalOf = (p: Patient, id: MedId) => dosesOf(p, id).reduce((s, g) => s + g.dose, 0);
const uniq = (xs: number[]) => Array.from(new Set(xs.map((x) => Math.round(x * 1000) / 1000))).sort((a, b) => a - b);

const noEcg = (at: number, note: string): EffectStep[] => [{ at, note, tone: 'info' }];

/** the patient has one of these (from the history the learner set) */
const hasProblem = (p: Patient, ...ps: Problem[]) => ps.some((x) => p.problems?.includes(x));
/** 75 or older (the half-dose lytic, prasugrel, the elderly opioid dose) */
const elderly = (p: Patient) => p.age !== undefined && p.age >= 75;
/** a denervated heart, or dipyridamole or carbamazepine on board: adenosine starts at 3 mg */
const adenosineSensitive = (p: Patient) => hasProblem(p, 'heart-transplant', 'adenosine-potentiator');

/**
 * A drug for a symptomatic bradycardia given at 50–59/min: the AHA algorithm is for rates typically below 50, and a
 * rate just under 60 seldom causes the symptoms by itself — so "the right drug" becomes "look for the cause first".
 */
const mildBrady = (p: Patient, v: Verdict): Verdict =>
  v.tone === 'good' && p.hr >= BRADY_ALGORITHM && p.hr < SLOW
    ? caution(`At ${p.hr}/min the rate alone seldom explains symptoms (the bradycardia algorithm is for rates typically below ${BRADY_ALGORITHM}/min) — look for another cause first. ${v.text}`)
    : v;

/**
 * The rhythm to show once a slow sinus rate has come up: the "sinus bradycardia" page becomes normal sinus rhythm;
 * any other rhythm (an infarct, a bundle branch block) keeps its own QRS and ST segments.
 */
const faster = (prof: ECGProfile): string | undefined => (prof.id === 'sinus-bradycardia' ? 'normal-sinus' : undefined);

/** Effect of an AV-nodal blocker on a slow or blocked rhythm (always unwanted) */
function slowsBrady(p: Patient, prof: ECGProfile, c: Category, at: number, f: number, prAdd: number): EffectStep[] {
  switch (c) {
    case 'brady':
    case 'junctional':
      return [{ at, hr: rate(p.hr, f, 25), mods: c === 'brady' ? { prAdd } : null, note: 'The rate falls further — bradycardia gets worse.', tone: 'warn', mark: 'slower' }];
    case 'avb1':
      return [{ at, hr: rate(p.hr, f), mods: { prAdd }, note: 'The PR interval lengthens further (more AV-nodal delay).', tone: 'warn', mark: 'PR ↑' }];
    case 'wenckebach':
      return [{ at, hr: rate(p.hr, f, 40), mods: { prAdd }, note: 'More AV-nodal delay: longer PR intervals before each dropped beat, and a slower ventricular rate.', tone: 'warn', mark: 'PR ↑' }];
    case 'mobitz2':
    case 'chb':
      return [{ at, hr: c === 'chb' ? rate(p.hr, f, 20) : p.hr, note: `${prof.name}: the block is below the AV node, so this drug cannot help — and it can slow the escape and drop the blood pressure. Pace.`, tone: 'warn' }];
    default:
      return [];
  }
}

// ─── The drugs ─────────────────────────────────────────────────────────────

const adenosine: MedDef = {
  id: 'adenosine',
  name: 'Adenosine',
  group: 'Antiarrhythmics & rate control',
  unit: 'mg',
  route: 'Rapid IV push in 1–2 s, then a 20 mL saline flush (arm raised)',
  verb: 'Push',
  onset: 'Reaches the heart in ~10–20 s; gone within a minute (half-life < 10 s)',
  guide: '6 mg rapid IV push + 20 mL flush; if no conversion in 1–2 min, 12 mg. 3 mg via a central line, after heart transplant, or with dipyridamole / carbamazepine. Not with: second- or third-degree AV block or sick sinus without a pacemaker, asthma, or an irregular or unstable wide-complex tachycardia.',
  // 6 mg first; 12 mg once a full dose (≥ 6 mg) has failed; after an under-dose, 6–12 mg
  usual: (p) => {
    const most = Math.max(0, ...dosesOf(p, 'adenosine').map((g) => g.dose));
    if (!most && adenosineSensitive(p)) return { low: 3, high: 3 };
    return most >= 6 ? { low: 12, high: 12 } : most > 0 ? { low: 6, high: 12 } : { low: 6, high: 6 };
  },
  max: () => 18,
  picks: () => [3, 6, 12, 18],
  step: 1,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof, p.hr);
    const arrive = 12 * S;
    const pause = cls === 'toxic' ? 9 * S : cls === 'high' ? 6 * S : dose >= 12 ? 4 * S : 3 * S;
    // the SVT regimen is 6 mg, then 12 mg: once a full first dose and a 12 mg dose have both failed, it is spent. (In
    // any other rhythm a further dose still blocks the AV node for a few seconds, as each dose does.)
    const full = dosesOf(p, 'adenosine').filter((g) => g.dose >= 6);
    const spent = full.length >= 2 && full.some((g) => g.dose >= 12);
    const flush: EffectStep = { at: arrive - 2500, note: 'Flushing, chest tightness, a feeling of doom — warn the patient first: it passes in seconds.', tone: 'info' };
    const big: EffectStep[] = dose > 12
      ? [{ at: arrive + 1500, note: `${dose} mg is more than the usual maximum single dose (12 mg): a longer pause, and bronchospasm in asthma.`, tone: 'warn' }]
      : [];
    if (c === 'arrest' || c === 'torsades') {
      return { verdict: bad('Adenosine has no place in cardiac arrest: CPR, defibrillate a shockable rhythm, epinephrine.'), steps: noEcg(arrive, 'No effect on the arrest rhythm.') };
    }
    if ((c === 'af' || c === 'flutter') && p.hr > 0 && p.hr < SLOW) {
      return { verdict: bad(`Not with a slow ventricular rate (${p.hr}/min): adenosine blocks the AV node outright, and a slow AV node then lets nothing through — a long pause (label: symptomatic bradycardia). Look for the cause of the slow rate.`), steps: [flush, { at: arrive, hr: 25, note: 'A long pause: the AV node lets nothing through for several seconds.', tone: 'warn', mark: 'pause' }, { at: arrive + pause + 2 * S, restore: true, note: 'Conduction returns: back to the slow ventricular rate.', tone: 'info' }] };
    }
    if (spent && c === 'svt') {
      return { verdict: caution('Adenosine is given as 6 mg, then 12 mg — both have been given, and more is unlikely to help. Think again about the rhythm, and about a calcium-channel blocker, a β-blocker or synchronized cardioversion.'), steps: noEcg(arrive, 'No further effect.') };
    }
    switch (c) {
      case 'svt':
        if (dose < 6 && !(adenosineSensitive(p) && !dosesOf(p, 'adenosine').length && dose >= 3)) {
          return {
            verdict: good('The right drug for a regular narrow-complex tachycardia (AVNRT) after vagal maneuvers — but too little of it.'),
            steps: [
              flush,
              { at: arrive, hr: rate(p.hr, 0.85), note: 'A flicker of slowing — too little adenosine reached the AV node.', tone: 'effect' },
              { at: arrive + 2500, hr: p.hr, note: `SVT carries on. Below 6 mg a peripheral dose rarely works (3 mg is for a central line). Give 12 mg.`, tone: 'warn' },
            ],
          };
        }
        return {
          verdict: dose > 12
            ? caution(`The right drug, but ${fmtDose(dose)} mg is more than the label allows (6 mg, then 12 mg): doses above 12 mg are not recommended. A longer pause, and bronchospasm in asthma.`)
            : good(`Indicated: regular narrow-complex SVT (AVNRT) that vagal maneuvers did not stop. Adenosine blocks the AV node for a few seconds and breaks the re-entry circuit (6 mg converts most; 12 mg if not).${lowBP(p, prof) ? ' With a low pressure the SVT is unstable: synchronized cardioversion is the treatment — adenosine may be tried while it is set up.' : ''}`),
          steps: [
            flush,
            { at: arrive, profile: 'normal-sinus', hr: 48, mods: { avBlock: true }, note: 'The AV node blocks and the re-entry circuit breaks: SVT stops. P waves with no QRS — a pause of a few seconds (expect it).', tone: 'effect', mark: 'AV block' },
            ...big,
            { at: arrive + pause, profile: 'normal-sinus', hr: 96, mods: null, note: 'Sinus rhythm returns: the SVT is terminated.', tone: 'good', mark: 'sinus' },
            { at: arrive + pause + 40 * S, hr: 84, note: 'Sinus rhythm settling. The adenosine is already gone, so the SVT can recur — if it does, repeat 12 mg or use a calcium-channel blocker.', tone: 'info' },
          ],
        };
      case 'flutter':
        return {
          verdict: caution('Adenosine does not convert atrial flutter — but its few seconds of AV block unmask the flutter waves, which makes the diagnosis. Rate control (diltiazem, a β-blocker) or cardioversion treats it.'),
          steps: [
            flush,
            { at: arrive, hr: 30, note: 'High-grade AV block for a few seconds: the sawtooth flutter waves (≈300/min) show between the QRS complexes.', tone: 'effect', mark: 'F waves' },
            ...big,
            { at: arrive + pause + 3 * S, restore: true, note: 'Conduction recovers: back to flutter with 2:1 block, unchanged.', tone: 'info', mark: 'flutter' },
          ],
        };
      case 'af':
        return {
          verdict: caution('Adenosine does not convert atrial fibrillation; the brief slowing only shows the chaotic baseline. Never give AV-nodal blockers in pre-excited (WPW) AF — it can accelerate into VF.'),
          steps: [
            flush,
            { at: arrive, hr: 40, note: 'The ventricular rate slows for a few seconds: an irregular, chaotic baseline with no P waves — AF.', tone: 'effect', mark: 'slowing' },
            { at: arrive + pause + 2 * S, restore: true, note: 'Back to AF at the same rate.', tone: 'info' },
          ],
        };
      case 'vt':
        return {
          verdict: lowBP(p, prof)
            ? bad('This VT is unstable (hypotensive): synchronized cardioversion now. Adenosine does not stop VT — the AV node is not part of its circuit — and it is only a diagnostic option for a regular, monomorphic wide-complex tachycardia in a stable patient.')
            : caution('VT does not involve the AV node, so adenosine does not stop it (it is only a diagnostic option for a regular, monomorphic wide-complex tachycardia). Use procainamide or amiodarone, or synchronized cardioversion if unstable.'),
          steps: noEcg(arrive, 'No change — the tachycardia carries on.'),
        };
      case 'junctional':
        return {
          verdict: bad('Not indicated: adenosine suppresses the AV junction — in a slow junctional rhythm that means a pause.'),
          steps: [flush, { at: arrive, profile: 'asystole', note: 'The junctional pacemaker stops for a few seconds: a flat line.', tone: 'warn', mark: 'pause' }, { at: arrive + pause, restore: true, note: 'The junctional rhythm returns.', tone: 'info' }],
        };
      case 'chb':
      case 'paced':
        return {
          verdict: bad(c === 'chb' ? 'Not indicated: the ventricles are driven by an escape rhythm below the block — adenosine cannot help and can make things worse.' : 'Not indicated: the pacemaker drives the ventricles.'),
          steps: noEcg(arrive, 'Little visible change.'),
        };
      case 'aivr':
        return {
          verdict: bad('Not indicated: AIVR is a ventricular rhythm — adenosine acts on the sinus and AV nodes, not on the ventricular focus, and AIVR needs no treatment.'),
          steps: [flush, { at: arrive, note: 'No change: the ventricular focus carries on (the sinus node underneath slows for a few seconds).', tone: 'info' }],
        };
      default: {
        // sinus rhythms (incl. ST changes, blocks above the His, PVCs): transient AV block and sinus slowing
        const v: Verdict = c === 'sinus-tach'
          ? bad('Not indicated: sinus tachycardia is a response (pain, fever, bleeding, hypoxia, shock…) — treat the cause. Adenosine only blocks the AV node for seconds, unmasking the P waves.')
          : isBrady(c)
            ? bad('Not indicated: adenosine slows the sinus node and blocks the AV node — it worsens bradycardia and AV block.')
            : prof.id === 'wpw'
              ? bad('Not indicated in sinus rhythm — and in WPW adenosine can trigger AF that races down the accessory pathway. Have a defibrillator ready if it is ever used.')
              : bad('Not indicated: there is no SVT to stop.');
        return {
          verdict: v,
          steps: [
            flush,
            { at: arrive, hr: rate(p.hr, 0.75, 25), mods: { avBlock: true }, note: 'Transient AV block: P waves march on without QRS complexes, and the sinus rate slows.', tone: 'effect', mark: 'AV block' },
            ...big,
            { at: arrive + pause, mods: null, restore: true, note: 'Conduction returns: the rhythm is unchanged.', tone: 'info' },
          ],
        };
      }
    }
  },
};

const diltiazem: MedDef = {
  id: 'diltiazem',
  name: 'Diltiazem',
  group: 'Antiarrhythmics & rate control',
  unit: 'mg',
  route: 'IV over 2 min',
  verb: 'Give',
  onset: 'Starts in 2–3 min, full effect in ~5–10 min, lasts 1–3 h',
  guide: '0.25 mg/kg actual body weight (≈15–20 mg) IV over 2 min; if not enough after 15 min, 0.35 mg/kg (≈20–25 mg). Infusion 5–15 mg/h. Not with: hypotension, HFrEF, pre-excited AF (WPW), VT, second- or third-degree AV block, or an IV β-blocker within a few hours.',
  usual: (p) => (dosesOf(p, 'diltiazem').length ? { low: 0.3 * p.kg, high: 0.4 * p.kg } : { low: 0.2 * p.kg, high: 0.3 * p.kg }),
  // by weight only: a fixed ceiling would let a light patient have three times the weight-based dose
  max: (p) => 0.45 * p.kg,
  picks: (p) => uniq([5, round(0.15 * p.kg, 2.5), round(0.25 * p.kg, 2.5), round(0.35 * p.kg, 2.5), round(0.6 * p.kg, 5)]),
  step: 2.5,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof, p.hr);
    const f = { low: 0.92, usual: 0.68, high: 0.55, toxic: 0.42 }[cls];
    const prAdd = { low: 10, usual: 30, high: 50, toxic: 90 }[cls];
    const hypo: EffectStep[] = cls === 'high' || cls === 'toxic'
      ? [{ at: 4 * MIN, note: 'Blood pressure falling: too much calcium-channel blocker. Fluids; calcium chloride reverses it; pace if needed.', tone: 'warn' }]
      : [];
    if (c === 'arrest' || c === 'torsades') return { verdict: bad('Not an arrest drug.'), steps: noEcg(2 * MIN, 'No effect on the arrest rhythm.') };
    const failingNote = failing(p, prof) ? ' This patient has a failing ventricle — diltiazem is a negative inotrope and can tip them into shock.' : '';
    switch (c) {
      case 'af':
      case 'flutter':
        return {
          verdict: failing(p, prof)
            ? bad(`Harmful here: IV diltiazem in HFrEF or hypotension can cause collapse (AF guideline 2023: class 3, harm). Use a β-blocker with care, amiodarone or digoxin — or cardiovert if unstable.${failingNote}`)
            : noRateToControl(c, p)
              ?? good(`Rate control for ${c === 'af' ? 'AF' : 'atrial flutter'}: a non-dihydropyridine calcium-channel blocker slows AV-nodal conduction (avoid in HFrEF, hypotension and pre-excitation). Goal: resting rate < 110.`),
          steps: [
            { at: 2 * MIN, hr: rate(p.hr, (1 + f) / 2, 40), note: `The ventricular rate begins to fall${c === 'flutter' ? ' — in flutter it steps down as the conduction ratio changes (2:1 → 3:1 → 4:1)' : ''}.`, tone: 'effect', mark: 'slowing' },
            p.hr < 110
              ? { at: 5 * MIN, hr: rate(p.hr, f, 40), note: 'The rate was not fast to begin with, and now it is slower still: watch for bradycardia and a falling blood pressure.', tone: 'warn', mark: 'rate ↓' }
              : { at: 5 * MIN, hr: rate(p.hr, f, 40), note: cls === 'low' ? 'Only a small fall in rate: the dose was below 0.25 mg/kg.' : 'Rate controlled. The atria are still in AF/flutter — rate control does not restore sinus rhythm.', tone: cls === 'low' ? 'warn' : 'good', mark: 'rate ↓' },
            ...hypo,
          ],
        };
      case 'svt':
        if (failing(p, prof)) {
          return {
            verdict: bad('Not with a low pressure or a failing ventricle: IV diltiazem is contraindicated in severe hypotension and cardiogenic shock (label) and avoided in HFrEF — a negative inotrope can tip this patient into shock. An unstable SVT gets synchronized cardioversion (adenosine may be tried while it is set up).'),
            steps: [{ at: 3 * MIN, hr: rate(p.hr, 0.92), note: 'The SVT slows a little — and the blood pressure falls further.', tone: 'warn' }, ...hypo],
          };
        }
        if (cls === 'low') {
          return {
            verdict: good('A calcium-channel blocker terminates most AVNRT when adenosine fails or the SVT keeps recurring — but the dose was low.'),
            steps: [{ at: 4 * MIN, hr: rate(p.hr, 0.9), note: 'The SVT slows a little but carries on: give 0.25 mg/kg.', tone: 'warn' }],
          };
        }
        return {
          verdict: good('Second line for AVNRT (after vagal maneuvers and adenosine): a calcium-channel blocker terminates most by blocking the AV node.'),
          steps: [
            { at: 2 * MIN, hr: rate(p.hr, 0.92), note: 'The SVT slows slightly as AV-nodal conduction slows.', tone: 'effect' },
            { at: 3 * MIN, profile: 'normal-sinus', hr: cls === 'toxic' ? 48 : cls === 'high' ? 70 : 88, mods: { prAdd }, note: 'SVT terminated: sinus rhythm, with a slightly longer PR (diltiazem is still slowing the AV node).', tone: 'good', mark: 'sinus' },
            ...hypo,
          ],
        };
      case 'vt':
        return {
          verdict: bad('Dangerous: calcium-channel blockers can cause collapse in VT. Never give diltiazem or verapamil for a wide-complex tachycardia unless it is known to be SVT with aberrancy.'),
          steps: [{ at: 3 * MIN, note: 'VT carries on — and the blood pressure is falling.', tone: 'warn' }],
        };
      case 'paced':
        return { verdict: bad('No indication.'), steps: noEcg(3 * MIN, 'No change: the pacemaker sets the rate.') };
      case 'aivr':
        return { verdict: aivrNodal(), steps: [{ at: 3 * MIN, note: 'No change in the ventricular rate — and the blood pressure dips.', tone: 'warn' }, ...hypo] };
      default:
        if (isBrady(c)) return { verdict: bad('Not indicated: diltiazem slows the sinus node and the AV node — it worsens bradycardia and AV block.'), steps: slowsBrady(p, prof, c, 3 * MIN, 0.8, prAdd + 20) };
        if (prof.id === DISSECTION) {
          return {
            verdict: caution('Aortic dissection: a β-blocker comes first; a non-dihydropyridine calcium-channel blocker (diltiazem, verapamil) controls the rate (target 60–80/min) when β-blockers cannot be used.'),
            steps: [{ at: 4 * MIN, hr: rate(p.hr, 0.8, cls === 'high' || cls === 'toxic' ? 45 : 60), mods: { prAdd }, note: 'The heart rate falls — less force on the torn aortic wall.', tone: 'effect', mark: 'rate ↓' }, ...hypo],
          };
        }
        return {
          verdict: c === 'sinus-tach'
            ? bad('Not indicated: sinus tachycardia is a response — treat the cause. Slowing it can drop the blood pressure.')
            : c === 'stemi' ? bad('Not for acute MI: calcium-channel blockers do not improve outcome and can cause hypotension and heart failure.')
              : prof.id === 'wpw' ? bad('Avoid AV-nodal blockers in WPW: in pre-excited AF they can accelerate conduction down the accessory pathway into VF.')
                : bad('No indication in this rhythm.'),
          steps: [{ at: 4 * MIN, hr: rate(p.hr, 0.9), mods: { prAdd }, note: 'The sinus rate falls a little and the PR lengthens.', tone: 'effect', mark: 'PR ↑' }, ...hypo],
        };
    }
  },
};

const metoprolol: MedDef = {
  id: 'metoprolol',
  name: 'Metoprolol',
  group: 'Antiarrhythmics & rate control',
  unit: 'mg',
  route: 'IV over 2 min; may repeat every 5 min',
  verb: 'Give',
  onset: 'Starts in 2–5 min (peak ~20 min)',
  guide: '2.5–5 mg IV over 2 min, repeated every 5 min to a maximum of 15 mg. Avoid in decompensated heart failure, shock, bradycardia / heart block and bronchospasm.',
  usual: () => ({ low: 2.5, high: 5 }),
  max: () => 10,
  picks: () => [2.5, 5, 10, 15],
  step: 2.5,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof, p.hr);
    const total = totalOf(p, 'metoprolol') + dose;
    const f = Math.min(total / 15, 1.4);
    const over: EffectStep[] = total > 15 ? [{ at: 3 * MIN, note: `${total} mg in total — above the 15 mg maximum: bradycardia, hypotension, heart block.`, tone: 'warn' }] : [];
    const mods: RhythmMods = { prAdd: Math.round(10 * f) };
    if (c === 'arrest' || c === 'torsades') return { verdict: bad('Not an arrest drug.'), steps: noEcg(2 * MIN, 'No effect on the arrest rhythm.') };
    if (prof.id === DISSECTION && !lowBP(p, prof) && c !== 'brady') {
      const atTarget = p.hr <= 80;
      return {
        verdict: atTarget
          ? dissectionAtTarget(p.hr)
          : good(`Acute aortic dissection: IV β-blockade first (${DISSECTION_TARGET}) to cut the force of each ejection on the torn wall; add a vasodilator only after the rate is controlled. Then imaging and surgery for type A.`),
        // titrated in 5 mg steps to the target, not past it (an overdose can overshoot)
        steps: [{ at: 3 * MIN, hr: rate(p.hr, 1 - 0.3 * f, total > 15 ? 45 : 60), mods, note: atTarget ? 'The heart rate falls a little further, toward the bottom of the target range.' : 'The heart rate falls toward the target of 60–80/min.', tone: atTarget ? 'effect' : 'good', mark: 'rate ↓' }, ...over],
      };
    }
    if (failing(p, prof)) {
      return {
        verdict: bad(`Dangerous here: a β-blocker is a negative inotrope — in decompensated heart failure or shock it can cause collapse.${c === 'vt' ? ' This VT is unstable: synchronized cardioversion now.' : ''}`),
        steps: [{ at: 3 * MIN, hr: rate(p.hr, 1 - 0.15 * f), mods, note: 'The rate falls — and so does the cardiac output.', tone: 'warn' }, ...over],
      };
    }
    switch (c) {
      case 'af':
      case 'flutter':
        return {
          verdict: noRateToControl(c, p) ?? good('Rate control: β-blockers slow AV-nodal conduction (avoid in decompensated HF, hypotension, bronchospasm and pre-excitation).'),
          steps: [{ at: 3 * MIN, hr: rate(p.hr, 1 - 0.3 * f, 45), note: `Ventricular rate slowing (${total} mg given so far; up to 15 mg in 5 mg steps).`, tone: 'effect', mark: 'rate ↓' }, ...over],
        };
      case 'svt':
        return total >= 10
          ? { verdict: caution('β-blockers are second line for AVNRT — they terminate it less reliably than adenosine or a calcium-channel blocker.'), steps: [{ at: 4 * MIN, profile: 'normal-sinus', hr: 86, mods, note: 'SVT terminated: sinus rhythm.', tone: 'good', mark: 'sinus' }, ...over] }
          : { verdict: caution('β-blockers are second line for AVNRT — adenosine or a calcium-channel blocker works more reliably.'), steps: [{ at: 4 * MIN, hr: rate(p.hr, 1 - 0.08 * f), note: 'The SVT slows slightly but carries on.', tone: 'effect' }] };
      case 'vt':
        return { verdict: caution('β-blockers help prevent recurrent (ischemic) VT, but rarely stop sustained VT: procainamide, amiodarone or synchronized cardioversion.'), steps: noEcg(3 * MIN, 'VT carries on.') };
      case 'sinus-tach':
        return { verdict: bad('Usually wrong: sinus tachycardia is compensating for something (bleeding, sepsis, PE, tamponade, low output) — slowing it can cause collapse. Treat the cause.'), steps: [{ at: 3 * MIN, hr: rate(p.hr, 1 - 0.25 * f), mods, note: 'The sinus rate falls.', tone: 'effect', mark: 'rate ↓' }, ...over] };
      case 'stemi':
        if (slowSinus(c, p)) return { verdict: bad(`Harmful here: the heart rate is already ${p.hr}/min. A β-blocker in an infarct with bradycardia (often vagal, or an ischemic AV node in inferior MI) invites heart block and low output.`), steps: [{ at: 3 * MIN, hr: rate(p.hr, 1 - 0.18 * f, 25), mods, note: 'The rate falls further — bradycardia gets worse.', tone: 'warn', mark: 'slower' }, ...over] };
        if (miBetaRisk(p)) return { verdict: bad(miBetaRisk(p)!), steps: [{ at: 3 * MIN, hr: rate(p.hr, 1 - 0.18 * f), mods, note: 'The rate falls — and so does the cardiac output.', tone: 'warn' }, ...over] };
        return { verdict: caution('IV β-blocker in acute MI only for hypertension or ongoing ischemia with tachycardia, and never with signs of heart failure, low output, shock risk or AV block. Oral β-blockade within 24 h is the routine.'), steps: [{ at: 3 * MIN, hr: rate(p.hr, 1 - 0.18 * f), mods, note: 'The sinus rate falls and the PR lengthens slightly.', tone: 'effect', mark: 'rate ↓' }, ...over] };
      case 'paced':
        return { verdict: bad('No indication.'), steps: noEcg(3 * MIN, 'No change: the pacemaker sets the rate.') };
      case 'aivr':
        return { verdict: aivrNodal(), steps: [...noEcg(3 * MIN, 'No change in the ventricular rate.'), ...over] };
      default:
        if (isBrady(c)) return { verdict: bad('Not indicated: β-blockers worsen bradycardia and AV block.'), steps: slowsBrady(p, prof, c, 3 * MIN, 0.8, 40) };
        if (isAcs(prof) && c === 'sinus') {
          const risk = miBetaRisk(p);
          return { verdict: risk ? bad(risk) : caution('IV β-blocker in an acute coronary syndrome only for hypertension or ongoing ischemia with tachycardia, and never with signs of heart failure, low output, shock risk or AV block. Oral β-blockade within 24 h is the routine.'), steps: [{ at: 3 * MIN, hr: rate(p.hr, 1 - 0.18 * f), mods, note: 'The sinus rate falls and the PR lengthens slightly.', tone: 'effect', mark: 'rate ↓' }, ...over] };
        }
        return { verdict: bad('No indication in this rhythm.'), steps: [{ at: 3 * MIN, hr: rate(p.hr, 1 - 0.15 * f), mods, note: 'The sinus rate falls a little.', tone: 'effect' }, ...over] };
    }
  },
};

const esmolol: MedDef = {
  id: 'esmolol',
  name: 'Esmolol',
  group: 'Antiarrhythmics & rate control',
  unit: 'mg',
  route: 'Loading dose IV over 1 min, then an infusion of 50–200 mcg/kg/min',
  verb: 'Give',
  onset: 'Within 1–2 min; wears off 10–20 min after the infusion stops',
  guide: 'Load 500 mcg/kg (0.5 mg/kg) IV over 1 min, then 50 mcg/kg/min, increasing by 50 every ~4 min (usual max ~200). Not with: bradycardia, AV block, shock, decompensated heart failure, pulmonary hypertension, or IV diltiazem or verapamil.',
  usual: (p) => ({ low: 0.4 * p.kg, high: 0.5 * p.kg }),
  max: (p) => 1 * p.kg,
  picks: (p) => uniq([round(0.25 * p.kg, 5), round(0.5 * p.kg, 5), round(1.2 * p.kg, 10)]),
  step: 5,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof, p.hr);
    const f = Math.min(dose / (0.5 * p.kg), 2);
    if (c === 'arrest' || c === 'torsades') return { verdict: bad('Not an arrest drug.'), steps: noEcg(90 * S, 'No effect on the arrest rhythm.') };
    const warn: EffectStep[] = cls === 'toxic' ? [{ at: 2 * MIN, note: 'Overdose: profound bradycardia and hypotension — stop the infusion (it wears off in minutes).', tone: 'warn' }] : [];
    if (prof.id === DISSECTION && !lowBP(p, prof) && c !== 'brady') {
      const atTarget = p.hr <= 80;
      return {
        verdict: atTarget
          ? dissectionAtTarget(p.hr)
          : good(`Acute aortic dissection: IV β-blockade first (${DISSECTION_TARGET}) — esmolol is easy to titrate and stop; add a vasodilator only after the rate is controlled.`),
        steps: [{ at: 90 * S, hr: rate(p.hr, 1 - 0.22 * f, cls === 'toxic' ? 45 : 60), note: atTarget ? 'The heart rate falls a little further, toward the bottom of the target range.' : 'The heart rate falls toward the target of 60–80/min.', tone: atTarget ? 'effect' : 'good', mark: 'rate ↓' }, ...warn],
      };
    }
    // obstructive HCM: the low pressure comes from the outflow obstruction, which a slower, less forceful heart relieves
    if (prof.hemo === 'hcm' && lowBP(p, prof) && c !== 'vt') {
      return {
        verdict: caution('Obstructive HCM with a low pressure: give fluid and phenylephrine first; after them a β-blocker lowers the outflow gradient (a slower, less forceful heart fills better and obstructs less — 2024 AHA/ACC HCM). Esmolol is the one to titrate: it wears off within minutes.'),
        steps: [{ at: 90 * S, hr: rate(p.hr, 1 - 0.18 * f), note: 'The rate falls; with fluid on board the outflow gradient eases.', tone: 'effect', mark: 'rate ↓' }, ...warn],
      };
    }
    if (failing(p, prof)) return { verdict: bad(`Dangerous in decompensated heart failure or shock (negative inotrope) — though esmolol wears off fastest of the β-blockers.${c === 'vt' ? ' This VT is unstable: synchronized cardioversion now.' : ''}`), steps: [{ at: 90 * S, hr: rate(p.hr, 1 - 0.15 * f), note: 'The rate falls — and so does the output.', tone: 'warn' }, ...warn] };
    switch (c) {
      case 'af':
      case 'flutter':
        return { verdict: noRateToControl(c, p) ?? good('Rate control with a short-acting β-blocker — useful when you may need to stop quickly (e.g. after surgery).'), steps: [{ at: 90 * S, hr: rate(p.hr, 1 - 0.22 * f, 45), note: 'The ventricular rate falls within a couple of minutes.', tone: 'effect', mark: 'rate ↓' }, ...warn] };
      case 'svt':
        return { verdict: caution('Second line for AVNRT; adenosine or a calcium-channel blocker is more reliable.'), steps: [{ at: 90 * S, hr: rate(p.hr, 1 - 0.1 * f), note: 'The SVT slows but carries on.', tone: 'effect' }, ...warn] };
      case 'vt':
        return { verdict: caution('β-blockade helps in VT storm, but rarely stops sustained VT.'), steps: noEcg(90 * S, 'VT carries on.') };
      case 'aivr':
        return { verdict: aivrNodal(), steps: [...noEcg(90 * S, 'No change in the ventricular rate.'), ...warn] };
      default:
        if (isBrady(c)) return { verdict: bad('Not indicated: worsens bradycardia and AV block.'), steps: slowsBrady(p, prof, c, 90 * S, 0.8, 40) };
        return {
          verdict: c === 'sinus-tach' ? bad('Usually wrong: sinus tachycardia is compensating for something — treat the cause.')
            : slowSinus(c, p) ? bad(`Harmful here: the heart rate is already ${p.hr}/min — a β-blocker worsens bradycardia and AV block.`)
              : (c === 'stemi' || (isAcs(prof) && c === 'sinus')) ? (miBetaRisk(p) ? bad(miBetaRisk(p)!) : caution('Short-acting β-blockade in MI only without heart failure, low output or AV block.')) : bad('No indication in this rhythm.'),
          steps: [{ at: 90 * S, hr: rate(p.hr, 1 - 0.18 * f), mods: { prAdd: Math.round(8 * f) }, note: 'The sinus rate falls.', tone: 'effect', mark: 'rate ↓' }, ...warn],
        };
    }
  },
};

const amiodarone: MedDef = {
  id: 'amiodarone',
  name: 'Amiodarone',
  group: 'Antiarrhythmics & rate control',
  unit: 'mg',
  route: 'Arrest: IV/IO push · with a pulse: IV over 10 min',
  verb: 'Give',
  onset: 'Arrest: helps the next shock · with a pulse: works over 10–30 min',
  guide: 'VF / pulseless VT: 300 mg IV/IO push, then 150 mg. Stable VT and other uses: 150 mg IV over 10 min (repeat as needed), then 1 mg/min. Not with: cardiogenic shock, marked bradycardia, AV block, a long QT, or pre-excited AF.',
  usual: (p) => (category(resolveProfile(p.profileId)) === 'arrest' ? (dosesOf(p, 'amiodarone').length ? { low: 150, high: 150 } : { low: 300, high: 300 }) : { low: 150, high: 150 }),
  max: (p) => (category(resolveProfile(p.profileId)) === 'arrest' ? 450 : 300),
  picks: () => [150, 300, 450],
  step: 50,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof, p.hr);
    const mods: RhythmMods = { qtcAdd: 25, prAdd: 15 };
    const fast: EffectStep[] = cls === 'high' || cls === 'toxic' ? [{ at: 3 * MIN, note: `${dose} mg at once in a patient with a pulse: hypotension and bradycardia — give 150 mg over 10 min.`, tone: 'warn' }] : [];
    switch (c) {
      case 'arrest':
        return prof.rhythm === 'vf' || prof.rhythm === 'vt'
          ? { verdict: good('Refractory VF / pulseless VT: amiodarone after the third shock (300 mg, then 150 mg).'), steps: noEcg(30 * S, 'No visible change: amiodarone does not convert VF by itself — it makes the next shock more likely to work. Defibrillate and continue CPR.') }
          : { verdict: bad('No role in asystole or PEA: CPR, epinephrine, find the cause.'), steps: noEcg(30 * S, 'No change.') };
      case 'torsades':
        return { verdict: bad(`Avoid in torsades: amiodarone prolongs the QT. ${TORSADES}`), steps: [{ at: 30 * S, mods: { qtcAdd: 30 }, note: 'No improvement — and the QT gets longer.', tone: 'warn' }] };
      case 'vt':
        // unstable first: whatever the dose, the treatment is the shock — the drug is not waited for
        if (lowBP(p, prof)) {
          return {
            verdict: caution('This VT is unstable — the patient is hypotensive: synchronized cardioversion now (sedate if possible). Amiodarone is for stable VT, or to keep it from coming back after cardioversion.'),
            steps: [
              { at: 5 * MIN, hr: rate(p.hr, 0.92), mods, note: 'VT slows a little but carries on, and the blood pressure stays low: do not wait for the drug — synchronized cardioversion.', tone: 'warn', mark: 'slower' },
              ...fast,
            ],
          };
        }
        if (cls === 'low') return { verdict: good('For stable monomorphic VT (and VT with structural heart disease) — but the dose was low.'), steps: [{ at: 8 * MIN, hr: rate(p.hr, 0.9), mods, note: 'VT slows slightly but carries on: give 150 mg over 10 min.', tone: 'warn' }] };
        return {
          verdict: good('Stable monomorphic VT: amiodarone 150 mg over 10 min (in trials it terminates only about a third — procainamide does better; synchronized cardioversion if it fails or the patient becomes unstable).'),
          steps: [
            { at: 5 * MIN, hr: rate(p.hr, 0.88), mods, note: 'VT slowing.', tone: 'effect', mark: 'slower' },
            ...fast,
            { at: 12 * MIN, profile: 'normal-sinus', hr: 82, note: 'VT terminated: sinus rhythm, with a slightly longer PR and QT (amiodarone on board).', tone: 'good', mark: 'sinus' },
          ],
        };
      case 'af':
      case 'flutter':
        return {
          verdict: (p.hr < SLOW && noRateToControl(c, p)) || caution('Rate control in heart failure or critical illness when other drugs are unsafe — but it can convert to sinus rhythm: think about anticoagulation if the arrhythmia is > 48 h old.'),
          steps: [{ at: 10 * MIN, hr: rate(p.hr, 0.8, 50), mods, note: 'The ventricular rate falls; the PR / QT lengthen slightly.', tone: 'effect', mark: 'rate ↓' }, ...fast],
        };
      case 'svt':
        return { verdict: caution(`Not a first-line SVT drug — vagal maneuvers, adenosine, then a calcium-channel blocker or β-blocker.${lowBP(p, prof) ? ' With a low pressure the SVT is unstable: synchronized cardioversion (adenosine may be tried while it is set up).' : ''}`), steps: [{ at: 10 * MIN, profile: 'normal-sinus', hr: 88, mods, note: 'SVT terminated: sinus rhythm.', tone: 'good', mark: 'sinus' }, ...fast] };
      case 'aivr': {
        const s = suppressesAivr('amiodarone', 10 * MIN);
        return { verdict: s.verdict, steps: [{ ...s.steps[0], mods }, ...fast] };
      }
      default:
        if (isBrady(c)) return { verdict: bad('Not indicated: amiodarone slows the sinus node and AV conduction.'), steps: slowsBrady(p, prof, c, 10 * MIN, 0.85, 30) };
        return { verdict: bad('No indication in this rhythm.'), steps: [{ at: 10 * MIN, hr: rate(p.hr, 0.92), mods, note: 'The rate falls slightly; PR and QT lengthen.', tone: 'effect', mark: 'QT ↑' }, ...fast] };
    }
  },
};

const procainamide: MedDef = {
  id: 'procainamide',
  name: 'Procainamide',
  group: 'Antiarrhythmics & rate control',
  unit: 'mg',
  route: 'Infusion at 20–50 mg/min (shown at 30 mg/min)',
  verb: 'Start',
  onset: 'Works during the loading infusion (≈20–40 min)',
  guide: '20–50 mg/min IV until the arrhythmia stops, hypotension, the QRS widens > 50%, or 17 mg/kg has been given; then 1–4 mg/min. Avoid in long QT and heart failure.',
  usual: (p) => ({ low: 10 * p.kg, high: 17 * p.kg }),
  max: (p) => 17.5 * p.kg,
  picks: (p) => uniq([round(5 * p.kg, 100), round(12 * p.kg, 100), Math.floor((17 * p.kg) / 50) * 50, round(25 * p.kg, 100)]),
  step: 50,
  tolerance: 0.02,
  cumulative: true,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof, p.hr);
    const T = Math.max(3 * MIN, (dose / 30) * MIN);
    // one load, given in parts or not: the QRS and QT follow everything given so far (17 mg/kg in all is the ceiling)
    const before = totalOf(p, 'procainamide');
    const m = (frac: number): RhythmMods => {
      const perKg = (before + dose * frac) / p.kg;
      return { qrsWiden: 1 + 0.3 * (perKg / 17), qtcAdd: Math.round(60 * (perKg / 17)) };
    };
    const widening: EffectStep[] = [
      { at: T / 3, mods: m(1 / 3), note: 'The QRS starts to widen and the QT to lengthen (sodium- and potassium-channel block).', tone: 'effect', mark: 'QRS ↑' },
      { at: (2 * T) / 3, mods: m(2 / 3), note: 'QRS and QT longer still — watch both, and the blood pressure.', tone: 'effect' },
      { at: T, mods: m(1), note: `Loading infusion finished (${Math.round((before + dose) / p.kg)} mg/kg${before ? ' in all' : ''}).`, tone: 'info' },
    ];
    const toxic: EffectStep[] = cls === 'toxic' ? [
      { at: T + 5 * S, note: 'QRS widened by more than 50% and the QT is very long: stop the infusion (hypotension, torsades risk).', tone: 'warn' },
      { at: T + 40 * S, profile: 'torsades', note: 'Torsades de pointes — procainamide toxicity. Stop the infusion and defibrillate now (unsynchronized), pulse or not; then magnesium.', tone: 'warn', mark: 'torsades' },
    ] : [];
    if (c === 'arrest') return { verdict: bad('Not used in cardiac arrest (too slow to load).'), steps: noEcg(T / 3, 'No change.') };
    if (c === 'torsades') return { verdict: bad(`Dangerous: procainamide prolongs the QT and worsens torsades. ${TORSADES}`), steps: widening };
    // the label: contraindicated in complete heart block, avoided in second-degree block — it suppresses the escape below
    if (c === 'chb' || c === 'mobitz2') {
      return {
        verdict: bad(c === 'chb'
          ? 'Contraindicated (label): complete heart block. The escape rhythm below the block is what keeps this patient alive, and procainamide suppresses nodal and ventricular pacemakers — it can leave asystole. Pace; atropine or epinephrine for the rate.'
          : 'Avoid (label: second-degree AV block): procainamide slows conduction below the AV node and can turn Mobitz II into complete heart block — with an escape it also suppresses. Pace; atropine or epinephrine for the rate.'),
        steps: [
          widening[0],
          c === 'chb'
            ? { at: (2 * T) / 3, hr: rate(p.hr, 0.8, 20), mods: m(2 / 3), note: 'The escape slows and the QRS widens: the drug is suppressing the only pacemaker left.', tone: 'warn', mark: 'escape ↓' }
            : { at: (2 * T) / 3, hr: rate(p.hr, 0.85, 25), mods: m(2 / 3), note: 'More beats are dropped as conduction below the AV node slows: watch for complete heart block.', tone: 'warn', mark: 'more block' },
          widening[2],
          ...toxic,
        ],
      };
    }
    if (c !== 'vt' && failing(p, prof)) {
      return {
        verdict: bad(`${prof.pathway ? 'Unstable pre-excited AF: synchronized cardioversion now (2023 AF guideline) — procainamide is for the stable patient. ' : ''}Not with a low pressure or a failing ventricle: procainamide lowers the blood pressure (hypotension is a reason to stop the load) and depresses the heart; avoid it in heart failure.${c === 'af' || c === 'flutter' || c === 'svt' ? ' Unstable: synchronized cardioversion.' : ''}`),
        steps: [...widening, { at: T / 3 + 20 * S, note: 'The blood pressure falls further.', tone: 'warn' }, ...toxic],
      };
    }
    switch (c) {
      case 'vt':
        if (lowBP(p, prof)) {
          return {
            verdict: bad('Not for this patient: the VT is unstable (hypotensive) and procainamide lowers the blood pressure further. Synchronized cardioversion now; procainamide is for stable VT.'),
            steps: [widening[0], { at: T / 3 + 20 * S, note: 'The blood pressure falls further while the VT carries on.', tone: 'warn' }],
          };
        }
        if (cls === 'low') return { verdict: good('Stable monomorphic VT — but load to 10–17 mg/kg.'), steps: [...widening, { at: T + 10 * S, hr: rate(p.hr, 0.85), note: 'VT slows but carries on: the loading dose was too small.', tone: 'warn' }] };
        return {
          verdict: good('Stable monomorphic VT: procainamide terminates more VT than amiodarone (PROCAMIO). Avoid in long QT and heart failure.'),
          steps: [widening[0], { at: (2 * T) / 3, profile: 'normal-sinus', hr: 84, mods: m(2 / 3), note: 'VT terminated: sinus rhythm — note the wider QRS and longer QT from the drug.', tone: 'good', mark: 'sinus' }, widening[2], ...toxic],
        };
      case 'af':
      case 'flutter':
        return {
          verdict: caution(c === 'af'
            ? 'Can convert recent-onset AF, and it is the drug for pre-excited AF (WPW) because it does not block the AV node. Anticoagulation if > 48 h.'
            : 'Class IA drugs can slow the flutter waves and allow 1:1 conduction — give an AV-nodal blocker first. Cardioversion is usually better.'),
          steps: c === 'af' && cls !== 'low' ? [...widening.slice(0, 2), { at: T, profile: 'normal-sinus', hr: 86, mods: m(1), note: 'Converted to sinus rhythm.', tone: 'good', mark: 'sinus' }, ...toxic] : [...widening, ...toxic],
        };
      case 'svt':
        return { verdict: caution('Can terminate AVRT / AVNRT, but adenosine and AV-nodal blockers come first.'), steps: [widening[0], { at: (2 * T) / 3, profile: 'normal-sinus', hr: 88, mods: m(2 / 3), note: 'SVT terminated: sinus rhythm.', tone: 'good', mark: 'sinus' }, widening[2], ...toxic] };
      case 'aivr': {
        const s = suppressesAivr('procainamide', (2 * T) / 3);
        return { verdict: s.verdict, steps: [widening[0], { ...s.steps[0], mods: m(2 / 3) }, widening[2], ...toxic] };
      }
      default:
        return { verdict: bad('No indication in this rhythm — you will only see the QRS widen and the QT lengthen.'), steps: [...widening, ...toxic] };
    }
  },
};

const sotalol: MedDef = {
  id: 'sotalol',
  name: 'Sotalol',
  group: 'Antiarrhythmics & rate control',
  unit: 'mg',
  route: 'IV over 5 min',
  verb: 'Give',
  onset: 'Minutes; the QT is longest at the end of the infusion',
  guide: 'Stable monomorphic VT: 1.5 mg/kg (about 100 mg) IV over 5 min. Avoid with a long QT (QTc above 450 ms), bradycardia, heart failure, shock or asthma; correct K⁺ and Mg²⁺ first; dose by kidney function.',
  // the AHA dose is "100 mg (1.5 mg/kg)"; IV loading doses on the label stop at 150 mg
  usual: (p) => ({ low: Math.min(1.5 * p.kg, 150), high: Math.min(1.5 * p.kg, 150) }),
  max: (p) => Math.min(2 * p.kg, 200),
  picks: (p) => uniq([round(0.75 * p.kg, 10), round(1.5 * p.kg, 10), round(2.5 * p.kg, 10)]),
  step: 10,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof, p.hr);
    const mods: RhythmMods = { qtcAdd: cls === 'low' ? 25 : cls === 'usual' ? 45 : 70, prAdd: 15 };
    // a long QT to start with (a QT long from repolarization, not from a wide QRS), or too much: the dose that ends in torsades
    const longQt = (prof.qtc > 450 && prof.qrs === 'normal') || hasProblem(p, 'long-qt');
    const torsades: EffectStep[] = cls === 'toxic' || (longQt && c !== 'torsades' && c !== 'arrest')
      ? [{ at: 9 * MIN, profile: 'torsades', note: `Torsades de pointes — ${cls === 'toxic' ? 'an overdose of a QT-prolonging drug' : 'sotalol on top of a QT that was already long'}. Defibrillate now (unsynchronized), pulse or not; then magnesium.`, tone: 'warn', mark: 'torsades' }]
      : [];
    const qtWarn = longQt ? (prof.qtc > 450 ? ` The QTc was already ${prof.qtc} ms: sotalol is contraindicated above 450 ms.` : ' The patient has a long QT: sotalol is contraindicated with a QTc above 450 ms.') : '';
    if (c === 'arrest') return { verdict: bad('Not an arrest drug: for shock-refractory VF or pulseless VT, amiodarone or lidocaine.'), steps: noEcg(60 * S, 'No change.') };
    if (c === 'torsades') return { verdict: bad(`Dangerous: sotalol lengthens the QT and feeds torsades. ${TORSADES}`), steps: [{ at: 60 * S, mods, note: 'No improvement — and the QT gets longer.', tone: 'warn' }] };
    switch (c) {
      case 'vt':
        if (failing(p, prof)) {
          return {
            verdict: bad('Not for this patient: sotalol lowers the blood pressure and the heart\'s contractility, and this VT is unstable or the heart is failing. Synchronized cardioversion now.'),
            steps: [{ at: 3 * MIN, mods, note: 'The blood pressure falls further while the VT carries on.', tone: 'warn' }],
          };
        }
        if (cls === 'low') return { verdict: longQt ? bad(`Not with a long QT.${qtWarn} Procainamide lengthens it too: lidocaine (no effect on the QT) or synchronized cardioversion.`) : good('Stable monomorphic VT — but the dose is 1.5 mg/kg.'), steps: [{ at: 5 * MIN, hr: rate(p.hr, 0.9), mods, note: 'VT slows slightly but carries on.', tone: 'warn' }, ...torsades] };
        return {
          verdict: longQt
            ? bad(`Not with a long QT.${qtWarn} Procainamide lengthens it too: lidocaine (no effect on the QT) or synchronized cardioversion.`)
            : good('Stable monomorphic VT: IV sotalol may be considered (1.5 mg/kg over 5 min; 2025 AHA class 2b, as are procainamide and amiodarone), though the 2025 tachycardia algorithm now lists only procainamide and amiodarone. Avoid with a long QT or heart failure; synchronized cardioversion if it fails or the patient becomes unstable.'),
          steps: [
            { at: 3 * MIN, hr: rate(p.hr, 0.9), mods, note: 'VT slowing; the QT lengthens.', tone: 'effect', mark: 'slower' },
            ...(torsades.length ? torsades : [{ at: 8 * MIN, profile: 'normal-sinus', hr: 62, mods, note: 'VT terminated: sinus rhythm — a slow rate (β-blockade) and a longer QT. Keep watching the QTc and the potassium and magnesium.', tone: 'good' as const, mark: 'sinus' }]),
          ],
        };
      case 'af':
      case 'flutter':
        if (failing(p, prof)) return { verdict: bad('Not with heart failure or a low blood pressure: β-blockade and a long QT. For the rate, amiodarone or digoxin; cardioversion if unstable.'), steps: [{ at: 8 * MIN, hr: rate(p.hr, 0.85, 50), mods, note: 'The rate falls and so does the blood pressure.', tone: 'warn' }] };
        if (longQt) return { verdict: bad(`Not with a long QT.${qtWarn} For the rate, a β-blocker or diltiazem; correct potassium and magnesium.`), steps: [{ at: 8 * MIN, hr: rate(p.hr, 0.82, 35), mods, note: 'The ventricular rate falls (β-blockade); the QT lengthens further.', tone: 'warn', mark: 'QT ↑' }, ...torsades] };
        return {
          verdict: (p.hr < SLOW && noRateToControl(c, p)) || caution(`Sotalol keeps AF or flutter in sinus rhythm once it has been restored (by mouth, or started with an IV load on ECG monitoring) — for rate control now, a β-blocker or diltiazem is simpler.${qtWarn}`),
          steps: [{ at: 8 * MIN, hr: rate(p.hr, 0.82, 35), mods, note: 'The ventricular rate falls (β-blockade); the QT lengthens.', tone: 'effect', mark: 'rate ↓' }, ...torsades],
        };
      case 'svt':
        return { verdict: longQt ? bad(`Not with a long QT.${qtWarn} For the SVT: vagal maneuvers, adenosine, then a calcium-channel blocker or β-blocker.`) : caution('Not a first-line SVT drug: vagal maneuvers, adenosine, then a calcium-channel blocker or β-blocker.'), steps: [{ at: 8 * MIN, profile: 'normal-sinus', hr: 76, mods, note: 'SVT terminated: sinus rhythm, with a longer QT.', tone: 'good', mark: 'sinus' }, ...torsades] };
      case 'aivr': {
        const s = suppressesAivr('sotalol', 8 * MIN);
        return { verdict: s.verdict, steps: [{ ...s.steps[0], mods }] };
      }
      default:
        if (isBrady(c) || slowSinus(c, p)) return { verdict: bad('Not here: a slow or blocked rhythm, and sotalol is a β-blocker too — it slows the rate and lengthens the PR. It is contraindicated with sinus bradycardia below 50/min, sick sinus syndrome, or second- or third-degree AV block without a pacemaker.'), steps: slowsBrady(p, prof, c, 8 * MIN, 0.85, 25).concat(isBrady(c) ? [] : [{ at: 8 * MIN, hr: rate(p.hr, 0.85, 30), mods, note: 'Slower still, and the QT lengthens.', tone: 'warn' }]) };
        return { verdict: bad(`No indication in this rhythm — you will only see the rate fall and the QT lengthen.${qtWarn}`), steps: [{ at: 8 * MIN, hr: rate(p.hr, 0.88, 30), mods, note: 'The rate falls; the QT lengthens.', tone: 'effect', mark: 'QT ↑' }, ...torsades] };
    }
  },
};

const lidocaine: MedDef = {
  id: 'lidocaine',
  name: 'Lidocaine',
  group: 'Antiarrhythmics & rate control',
  unit: 'mg',
  route: 'IV/IO push',
  verb: 'Push',
  onset: 'Within 1–2 min; redistributes in ~15 min',
  guide: '1–1.5 mg/kg IV/IO, then 0.5–0.75 mg/kg every 5–10 min, to a maximum of 3 mg/kg. Infusion 1–4 mg/min. Not with: severe AV block or a ventricular escape rhythm, WPW, or an amide allergy.',
  usual: (p) => (dosesOf(p, 'lidocaine').length ? { low: 0.5 * p.kg, high: 0.75 * p.kg } : { low: 1 * p.kg, high: 1.5 * p.kg }),
  max: (p) => 2 * p.kg,
  picks: (p) => uniq([round(0.5 * p.kg, 10), round(1 * p.kg, 10), round(1.5 * p.kg, 10), round(3 * p.kg, 10)]),
  step: 10,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof, p.hr);
    const total = (totalOf(p, 'lidocaine') + dose) / p.kg;
    const tox: EffectStep[] = cls === 'toxic' || total > 3
      ? [{ at: 2 * MIN, note: `${total.toFixed(1)} mg/kg in total — above 3 mg/kg: lidocaine toxicity (perioral numbness, confusion, seizures, then bradycardia).`, tone: 'warn' },
        ...(c === 'sinus' || c === 'sinus-tach' || c === 'stemi' ? [{ at: 3 * MIN, hr: rate(p.hr, 0.75), note: 'Bradycardia from lidocaine toxicity.', tone: 'warn' as const }] : [])]
      : [];
    switch (c) {
      case 'arrest':
        return prof.rhythm === 'vf' || prof.rhythm === 'vt'
          ? { verdict: good('An alternative to amiodarone for refractory VF / pulseless VT.'), steps: [...noEcg(30 * S, 'No visible change: it helps the next shock work. Defibrillate.'), ...tox] }
          : { verdict: bad('No role in asystole or PEA.'), steps: noEcg(30 * S, 'No change.') };
      case 'torsades':
        return { verdict: caution(`Not the treatment for torsades. ${TORSADES} Overdrive pacing (or isoproterenol) prevents pause-dependent recurrences.`), steps: noEcg(60 * S, 'No change.') };
      case 'vt':
        return {
          verdict: caution(lowBP(p, prof)
            ? 'This VT is unstable (hypotensive): synchronized cardioversion now. Lidocaine stops only about 1 in 5 VTs even when stable.'
            : 'Lidocaine stops only about 1 in 5 stable monomorphic VTs (it works best in ischemic VT): procainamide or amiodarone, or synchronized cardioversion.'),
          steps: [{ at: 2 * MIN, hr: rate(p.hr, 0.9), note: 'VT slows slightly but carries on.', tone: 'effect' }, ...tox],
        };
      case 'pvcs':
        return {
          verdict: caution(`It suppresses ventricular ectopy, but routine suppression of PVCs is not recommended — find the cause (ischemia, K⁺, Mg²⁺, drugs).${p.hr < SLOW ? ` At ${p.hr}/min the label warns that lidocaine for ectopy in a slow rhythm, without first raising the rate, can bring on worse ventricular arrhythmias or complete heart block — treat the rate first.` : ''}`),
          steps: [{ at: 90 * S, profile: 'normal-sinus', hr: p.hr, note: 'PVCs suppressed: sinus rhythm.', tone: 'effect', mark: 'no PVCs' }, ...tox],
        };
      case 'aivr': {
        const s = suppressesAivr('lidocaine', 90 * S);
        return { verdict: s.verdict, steps: [...s.steps, ...tox] };
      }
      case 'chb':
      case 'mobitz2':
        return {
          verdict: bad(`Contraindicated (label): severe AV block without a pacemaker. ${c === 'chb' ? 'The escape rhythm below the block is what keeps this patient alive, and lidocaine suppresses ventricular pacemakers — it can leave asystole.' : 'It does nothing for the block and can suppress the escape rhythm if the block becomes complete.'} Pace; atropine or epinephrine for the rate.`),
          steps: [{ at: 2 * MIN, hr: c === 'chb' ? rate(p.hr, 0.7, 20) : p.hr, note: c === 'chb' ? 'The escape rhythm slows: lidocaine is suppressing the only pacemaker left.' : 'No help for the block.', tone: 'warn', mark: c === 'chb' ? 'escape ↓' : undefined }, ...tox],
        };
      default:
        if (c === 'junctional' && p.hr < SLOW) return { verdict: bad('Not with a slow escape rhythm: the label rules lidocaine out in severe sinoatrial or AV-nodal disease without a pacemaker — it can suppress the escape pacemaker.'), steps: [{ at: 2 * MIN, hr: rate(p.hr, 0.85, 25), note: 'The escape rhythm slows.', tone: 'warn' }, ...tox] };
        return {
          verdict: bad(prof.id === 'wpw' || prof.pathway
            ? 'No indication — and the label lists Wolff-Parkinson-White as a contraindication. Pre-excited AF: synchronized cardioversion, or IV procainamide or ibutilide if stable.'
            : c === 'stemi' || isAcs(prof)
              ? 'No indication: lidocaine is for sustained VT or VF. Given to prevent arrhythmias in an acute MI it saves no one and causes more bradycardia and asystole — not recommended.'
              : 'No indication: lidocaine (class IB) acts on ventricular tissue — no effect on sinus, atrial or AV-nodal rhythms.'),
          steps: [...noEcg(2 * MIN, 'No visible change.'), ...tox],
        };
    }
  },
};

const digoxin: MedDef = {
  id: 'digoxin',
  name: 'Digoxin',
  group: 'Antiarrhythmics & rate control',
  unit: 'mg',
  route: 'IV over 5 min',
  verb: 'Give',
  onset: 'Slow: starts in 30–60 min, peaks in 2–6 h',
  guide: 'AF rate control: 0.25–0.5 mg IV, then 0.25 mg every ~6 h (max ~1.5 mg in 24 h); less in renal impairment and the elderly. Not with: WPW, AV block, obstructive HCM or a low K⁺; halve it with amiodarone.',
  usual: () => ({ low: 0.25, high: 0.5 }),
  max: () => 1,
  picks: () => [0.125, 0.25, 0.5, 1.5],
  step: 0.125,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof, p.hr);
    const total = totalOf(p, 'digoxin') + dose;
    const effect: RhythmMods = { scoop: 0.07, tScale: 0.6, qtcAdd: -25, prAdd: 20 };
    const toxic = cls === 'toxic' || total > 1.5;
    if (c === 'arrest' || c === 'torsades') return { verdict: bad('Not an arrest drug.'), steps: noEcg(30 * MIN, 'No change.') };
    if (toxic) {
      return {
        verdict: bad(`${total} mg is a toxic load: digoxin toxicity causes ectopy, AV block, junctional rhythms and bidirectional VT (with nausea and yellow vision). Antidote: digoxin-specific Fab.`),
        steps: c === 'af' || c === 'flutter'
          ? [{ at: 30 * MIN, profile: 'junctional', hr: 56, mods: effect, note: 'AF with a regular, slow ventricular rhythm: complete AV block with a junctional escape — a classic sign of digoxin toxicity.', tone: 'warn', mark: 'toxicity' }]
          : isSinus(c)
            ? [{ at: 30 * MIN, profile: 'pvcs', hr: p.hr, mods: { ...effect, prAdd: 80 }, note: 'Ectopy (PVCs) and a long PR: digoxin toxicity.', tone: 'warn', mark: 'toxicity' }]
            // a tachycardia, a heart block or a paced rhythm does not turn into sinus rhythm with PVCs: it stays what it is
            : [{ at: 30 * MIN, mods: effect, note: 'Digoxin toxicity. The rhythm is unchanged for now — watch for new ectopy, a slower rate, more AV block or ventricular tachycardia.', tone: 'warn', mark: 'toxicity' }],
      };
    }
    if (c === 'af' || c === 'flutter') {
      return {
        verdict: noRateToControl(c, p) ?? caution('Slow but useful in heart failure or hypotension, where β-blockers and calcium-channel blockers are risky. Not a first choice for fast rate control.'),
        steps: [
          { at: 30 * MIN, hr: rate(p.hr, 0.88, 50), mods: effect, note: 'Digoxin effect: sagging ("scooped") ST depression, flatter T waves, a shorter QT — and the rate begins to fall.', tone: 'effect', mark: 'dig effect' },
          { at: 2 * 60 * MIN, hr: rate(p.hr, 0.78, 50), note: 'Two hours on: rate better controlled.', tone: 'good', mark: 'rate ↓' },
        ],
      };
    }
    if (isBrady(c)) return { verdict: bad('Not indicated: digoxin slows the AV node — it worsens bradycardia and AV block.'), steps: slowsBrady(p, prof, c, 30 * MIN, 0.85, 40) };
    return {
      verdict: c === 'aivr' ? aivrNodal() : bad('No indication in this rhythm.'),
      steps: [{ at: 30 * MIN, mods: effect, note: 'Digoxin effect: sagging ST depression, flatter T waves and a shorter QT — expected at therapeutic levels, not a sign of toxicity.', tone: 'effect', mark: 'dig effect' }],
    };
  },
};

const atropine: MedDef = {
  id: 'atropine',
  name: 'Atropine',
  group: 'Bradycardia & arrest',
  unit: 'mg',
  route: 'IV/IO push',
  verb: 'Push',
  onset: 'Within 1 min, peak 2–4 min',
  guide: 'Symptomatic bradycardia: 1 mg IV every 3–5 min, maximum 3 mg. Not for asystole or PEA. Doses below 0.5 mg can paradoxically slow the heart. Not with: a heart transplant; for wide-complex Mobitz II or complete heart block, pace.',
  usual: () => ({ low: 1, high: 1 }),
  max: () => 2,
  picks: () => [0.4, 0.5, 1, 3],
  step: 0.1,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof, p.hr);
    const before = totalOf(p, 'atropine');
    if (before >= 3) return { verdict: bad('3 mg already given — the maximum (full vagal block). More will not help: pace, or start epinephrine or dopamine.'), steps: noEcg(60 * S, 'No further effect.') };
    // The indication is the rate, not the name of the rhythm: a slow sinus node (the bradycardia page, or any
    // sinus rhythm below 60 — an inferior MI at 40, a bundle branch block at 38) or a slow AV node
    const sinusBrady = c === 'brady' || slowSinus(c, p);
    const slow = p.hr > 0 && p.hr < SLOW;
    const nodal = (c === 'junctional' && slow) || (c === 'avb1' && slow) || c === 'wenckebach';
    const sinusNode = sinusBrady || c === 'sinus' || c === 'sinus-tach' || c === 'stemi' || c === 'pvcs' || c === 'hyperk' || c === 'junctional' || c === 'avb1' || c === 'wenckebach';
    if (c === 'hyperk' && sinusBrady) {
      return {
        verdict: caution('The bradycardia of hyperkalemia often does not respond to atropine: treat the potassium — calcium first, then insulin + dextrose and a β-agonist — and be ready to pace.'),
        steps: [{ at: 60 * S, hr: rate(p.hr, 1.1), note: 'Little change in the rate: the potassium, not vagal tone, is slowing this heart.', tone: 'warn' }],
      };
    }
    if (dose < 0.5 && sinusNode) {
      return {
        verdict: sinusBrady || nodal
          ? caution('The right drug for a symptomatic sinus or AV-nodal bradycardia — but below 0.5 mg it can paradoxically slow the heart. Give 1 mg.')
          : bad('No bradycardia to treat — and a dose below 0.5 mg can paradoxically slow the heart.'),
        steps: [{ at: 45 * S, hr: rate(p.hr, 0.85, 25), note: 'Paradoxical slowing (a central vagal effect of a small dose).', tone: 'warn', mark: 'slower' }, { at: 3 * MIN, restore: true, note: 'Back to where it was.', tone: 'info' }],
      };
    }
    const tachy: EffectStep[] = [
      ...(cls === 'high' || cls === 'toxic' ? [{ at: 2 * MIN, note: 'More than 1 mg at once: tachycardia, confusion, urinary retention, hot dry skin.', tone: 'warn' as const }] : []),
    ];
    if (sinusBrady) {
      const why = c !== 'stemi' ? 'Symptomatic sinus bradycardia'
        : prof.id.startsWith('inferior') ? 'Bradycardia in inferior MI is usually vagal (the Bezold–Jarisch reflex) or an ischemic AV node. If it is symptomatic (hypotension, poor perfusion)'
          : 'Symptomatic bradycardia in acute MI (give no more than is needed: a fast rate raises the oxygen demand of the infarct)';
      if (cls === 'low') {
        return {
          verdict: mildBrady(p, good(`${why}: atropine — the current dose is 1 mg (0.5 mg was the pre-2020 dose).`)),
          steps: [{ at: 60 * S, profile: faster(prof), hr: 62, note: 'The sinus rate rises a little — 1 mg gives a fuller response.', tone: 'effect', mark: 'rate ↑' }],
        };
      }
      const over = cls === 'high' || cls === 'toxic';
      return {
        verdict: mildBrady(p, good(`${why}: atropine 1 mg blocks vagal tone at the sinus node (every 3–5 min, max 3 mg).`)),
        steps: [
          { at: 60 * S, profile: faster(prof), hr: 66, note: 'The sinus rate rises.', tone: 'effect', mark: 'rate ↑' },
          { at: 150 * S, profile: over && faster(prof) ? 'sinus-tachycardia' : faster(prof), hr: over ? 118 : 84, note: over ? 'Overshoot into sinus tachycardia.' : 'Sinus rhythm at a normal rate.', tone: over ? 'warn' : 'good' },
          ...tachy,
        ],
      };
    }
    if ((c === 'af' || c === 'flutter') && slow) {
      return {
        verdict: caution(`A slow ventricular rate in ${c === 'af' ? 'AF' : 'flutter'} means the AV node is letting too few impulses through. If the patient is symptomatic, atropine speeds AV-nodal conduction — look for the cause (AV-nodal drugs, digoxin toxicity, ischemia, a diseased conduction system) and be ready to pace.`),
        steps: [{ at: 60 * S, hr: rate(p.hr, 1.3, 30, 90), note: 'The ventricular rate rises as more impulses cross the AV node.', tone: 'effect', mark: 'rate ↑' }, ...tachy],
      };
    }
    switch (c) {
      case 'junctional':
        if (!slow) return { verdict: bad('No bradycardia to treat: a junctional rhythm at this rate is accelerated, not slow — look for the cause (digoxin toxicity, ischemia, recent heart surgery).'), steps: noEcg(60 * S, 'No useful change.') };
        return { verdict: mildBrady(p, good('A slow junctional rhythm from vagal tone or a sick sinus node often responds: atropine speeds the sinus node so it takes over again.')), steps: [{ at: 75 * S, profile: 'normal-sinus', hr: 78, note: 'The sinus node takes over again: P waves before every QRS.', tone: 'good', mark: 'sinus' }, ...tachy] };
      case 'avb1':
        return { verdict: slow ? mildBrady(p, good('Symptomatic bradycardia with a long PR interval: atropine speeds the sinus node and shortens the AV-nodal delay (1 mg every 3–5 min, max 3 mg).')) : bad('No bradycardia to treat: first-degree AV block alone needs no treatment, and a faster rate only adds oxygen demand.'), steps: [{ at: 60 * S, hr: rate(p.hr, 1.25), mods: { prAdd: -80 }, note: 'The PR shortens and the rate rises (vagal block at the AV node).', tone: 'effect', mark: 'PR ↓' }, ...tachy] };
      case 'wenckebach':
        if (!slow) return { verdict: bad(`No bradycardia to treat: Mobitz I with a ventricular rate of ${p.hr}/min needs no treatment — watch it.`), steps: noEcg(60 * S, 'No useful change.') };
        return { verdict: mildBrady(p, good('Mobitz I (Wenckebach) is AV-nodal — if symptomatic it usually responds to atropine.')), steps: [{ at: 75 * S, profile: 'first-degree-avb', hr: 92, mods: { prAdd: -40 }, note: 'Every P now conducts (1:1), with a still-long PR: the Wenckebach pattern has gone.', tone: 'good', mark: '1:1' }, ...tachy] };
      case 'mobitz2':
        return { verdict: caution('Mobitz II is below the AV node: atropine rarely helps and can worsen it by sending more impulses at the block. Prepare transcutaneous pacing; epinephrine or dopamine infusion.'), steps: [{ at: 60 * S, hr: Math.min(110, p.hr + 15), note: 'The atrial rate rises, but beats are still dropped — the block is unchanged.', tone: 'warn' }] };
      case 'chb':
        return prof.id === 'inferior-stemi-chb'
          ? { verdict: caution('In inferior MI the block is usually AV-nodal (vagal / ischemic) and may respond — but do not delay pacing or reperfusion.'), steps: [{ at: 90 * S, profile: 'inferior-stemi', hr: 70, note: 'AV conduction returns: sinus rhythm with the inferior ST elevation.', tone: 'good', mark: 'conducting' }] }
          : { verdict: caution('Complete heart block with a wide escape is below the AV node: atropine will not help. Transcutaneous pacing; epinephrine or dopamine infusion.'), steps: noEcg(60 * S, 'No change in the escape rhythm.') };
      case 'arrest':
        return { verdict: bad('Atropine was removed from the arrest algorithm in 2010 — no benefit in asystole or PEA.'), steps: noEcg(60 * S, 'No change.') };
      case 'torsades':
        return { verdict: bad('Not a treatment for torsades.'), steps: noEcg(60 * S, 'No change.') };
      case 'paced':
        return { verdict: bad('No indication: the pacemaker sets the rate.'), steps: noEcg(60 * S, 'No change.') };
      case 'aivr':
        // the ventricular focus keeps its own rate: atropine can only speed the sinus node past it
        if (p.hr >= 100) return { verdict: bad('No bradycardia to treat: AIVR at this rate needs no treatment, and a faster sinus rate only adds oxygen demand.'), steps: noEcg(60 * S, 'No useful change.') };
        if (dose < 0.5) return { verdict: caution('AIVR rarely needs treatment — and below 0.5 mg atropine can slow the sinus node further, leaving the ventricular focus in charge. If the pressure is low, give 1 mg.'), steps: noEcg(45 * S, 'No change: the ventricular focus carries on.') };
        return {
          verdict: caution('AIVR is a benign reperfusion rhythm that ends by itself and as a rule needs no treatment. Only if losing the atrial kick drops the blood pressure: atropine speeds the sinus node until it outpaces the ventricular focus and takes over again.'),
          steps: [{ at: 75 * S, profile: 'normal-sinus', hr: Math.min(110, Math.max(80, p.hr + 12)), note: 'The sinus node outpaces the ventricular focus and takes over: P waves before every narrow QRS.', tone: 'effect', mark: 'sinus' }, ...tachy],
        };
      case 'af':
        return { verdict: bad('No bradycardia to treat — and blocking vagal tone speeds AV conduction.'), steps: [{ at: 60 * S, hr: rate(p.hr, 1.15), note: 'The ventricular rate rises.', tone: 'warn', mark: 'rate ↑' }] };
      case 'svt':
      case 'flutter':
      case 'vt':
        return { verdict: bad('No bradycardia to treat — a faster rate only adds myocardial oxygen demand.'), steps: noEcg(60 * S, 'No useful change.') };
      default:
        return { verdict: bad(c === 'stemi' ? 'No bradycardia to treat: tachycardia raises oxygen demand in an infarcting heart.' : 'No bradycardia to treat.'), steps: [{ at: 60 * S, hr: rate(p.hr, 1.25, 30, 160), note: 'Sinus tachycardia.', tone: 'warn', mark: 'rate ↑' }, ...tachy] };
    }
  },
};

const epinephrine: MedDef = {
  id: 'epinephrine',
  name: 'Epinephrine',
  group: 'Bradycardia & arrest',
  unit: 'mg',
  route: 'Arrest: 1 mg (0.1 mg/mL) IV/IO push · push-dose: 0.01–0.02 mg (10–20 mcg)',
  verb: 'Push',
  onset: 'Within 1 min; push-dose lasts 5–10 min',
  guide: 'Cardiac arrest: 1 mg IV/IO every 3–5 min. With a pulse: an infusion (2–10 mcg/min for bradycardia) or, by protocol, push-dose 10–20 mcg. Never 1 mg IV to a patient with a pulse.',
  usual: (p) => (resolveProfile(p.profileId).hemo === 'no-output' ? { low: 1, high: 1 } : { low: 0.01, high: 0.02 }),
  max: (p) => (resolveProfile(p.profileId).hemo === 'no-output' ? 1 : 0.05),
  picks: () => [0.01, 0.02, 0.1, 1],
  step: 0.01,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof, p.hr);
    if (c === 'arrest') {
      return prof.rhythm === 'vf' || prof.rhythm === 'vt'
        ? { verdict: good('Shockable arrest: epinephrine 1 mg after the second shock, then every 3–5 min.'), steps: noEcg(30 * S, 'No change on the monitor: epinephrine raises coronary perfusion pressure during CPR but does not convert VF. Shock it.') }
        : { verdict: good('Non-shockable arrest: epinephrine 1 mg as soon as possible, then every 3–5 min, with high-quality CPR and a search for the cause.'), steps: noEcg(30 * S, 'No immediate change: keep compressing and check the rhythm at the 2-minute pause.') };
    }
    if (c === 'torsades') {
      return {
        verdict: caution('Pulseless torsades is treated like VF: defibrillate, CPR, epinephrine 1 mg after the second shock — plus magnesium 2 g. (Catecholamines are harmful in congenital long-QT; in acquired, pause-dependent torsades, raising the rate with isoproterenol or overdrive pacing prevents recurrence.)'),
        steps: noEcg(30 * S, 'Torsades carries on — epinephrine does not convert it. Shock it.'),
      };
    }
    // the bradycardia branch is for a slow rate, not for the name of a block: first-degree block at 180 is no bradycardia
    const slowNow = (isBrady(c) && p.hr > 0 && p.hr < SLOW) || slowSinus(c, p);
    // obstructive HCM (and Takotsubo with LV outflow obstruction): a catecholamine makes the ventricle squeeze harder and
    // faster, and the outflow obstruction worse
    if (outflowObstructed(prof) && cls !== 'toxic') {
      return {
        verdict: bad(`Not in ${prof.hemo === 'hcm' ? 'obstructive HCM' : 'Takotsubo with LV outflow obstruction'}: epinephrine makes the ventricle squeeze harder and faster, and the outflow obstruction worse — the pressure falls further. Fluid and phenylephrine (2024 AHA/ACC HCM).`),
        steps: [{ at: 30 * S, hr: rate(p.hr, 1.2, 30, 200), note: 'The rate rises — and the outflow gradient with it.', tone: 'warn', mark: 'rate ↑' }, { at: 7 * MIN, restore: true, note: 'Wears off.', tone: 'info' }],
      };
    }
    if (cls === 'high') {
      return {
        verdict: (slowNow || lowBP(p, prof) ? caution : bad)(`${fmtDose(dose * 1000)} mcg is above the usual push-dose (10–20 mcg): expect marked tachycardia and hypertension.${slowNow || lowBP(p, prof) ? '' : ' And there is no slow rate or low pressure to treat.'} With a pulse, epinephrine is titrated in small steps or as an infusion (2–10 mcg/min).`),
        steps: [
          { at: 20 * S, hr: rate(p.hr, 1.35, 30, 170), note: 'Marked tachycardia and a surge in blood pressure.', tone: 'warn', mark: 'rate ↑' },
          { at: 7 * MIN, restore: true, note: 'Wears off in 5–10 min.', tone: 'info' },
        ],
      };
    }
    if (cls === 'toxic') {
      return {
        verdict: bad(`${dose} mg IV to a patient with a pulse is a massive overdose: severe hypertension, ischemia and ventricular arrhythmias. With a pulse use an infusion or push-dose 10–20 mcg.`),
        steps: [
          // only a sinus rhythm becomes a sinus tachycardia: AF stays AF and a heart block stays blocked, just faster
          isSinus(c)
            ? { at: 15 * S, profile: 'sinus-tachycardia', hr: 165, note: 'Extreme sinus tachycardia and hypertension.', tone: 'warn', mark: 'tachy' }
            : { at: 15 * S, hr: c === 'paced' ? undefined : rate(p.hr, 1.4, 40, 220), note: c === 'paced' ? 'Severe hypertension (the pacemaker still sets the rate).' : 'The rate jumps and the blood pressure surges.', tone: 'warn', mark: 'surge' },
          ...(dose >= 0.5
            ? [{ at: 45 * S, profile: 'vt', hr: 190, note: 'Ventricular tachycardia — epinephrine overdose.', tone: 'warn' as const, mark: 'VT' }]
            : isSinus(c)
              ? [{ at: 45 * S, profile: 'pvcs', hr: 130, note: 'Frequent PVCs.', tone: 'warn' as const, mark: 'PVCs' }]
              : [{ at: 45 * S, note: 'Ventricular ectopy and chest pain: the heart is being driven too hard.', tone: 'warn' as const }]),
        ],
      };
    }
    if (slowNow) {
      const up: EffectStep = c === 'brady' || slowSinus(c, p)
        ? { at: 30 * S, profile: faster(prof), hr: 74, note: 'The sinus rate rises.', tone: 'effect', mark: 'rate ↑' }
        : c === 'chb' ? { at: 30 * S, hr: Math.min(60, p.hr + 10), note: 'The escape rhythm speeds up a little.', tone: 'effect', mark: 'rate ↑' }
          : { at: 30 * S, hr: rate(p.hr, 1.3, 30, 140), note: 'The rate rises.', tone: 'effect', mark: 'rate ↑' };
      return {
        verdict: caution('Bradycardia not responding to atropine: an epinephrine infusion (2–10 mcg/min) — or push-dose epinephrine by protocol — while transcutaneous pacing is set up.'),
        steps: [up, { at: 7 * MIN, restore: true, note: 'The push-dose wears off in 5–10 min: start an infusion or pace.', tone: 'info' }],
      };
    }
    // a low pressure (behind a compensating sinus tachycardia — shock, PE, tamponade — or any other): push-dose epinephrine
    // is a bridge, as the above-usual dose already says (the high-dose branch is "with care" for any low pressure too)
    if (lowBP(p, prof)) {
      return {
        verdict: caution(COMPENSATORY.has(prof.id)
          ? 'A bridge for a low pressure while the cause is treated (a pump that is failing, a clot, a tamponade): push-dose epinephrine buys minutes — norepinephrine is the usual infusion, and the cause is what has to be fixed.'
          : 'A bridge for a low pressure while its cause is found and treated: push-dose epinephrine buys minutes — norepinephrine is the usual infusion.'),
        steps: [{ at: 30 * S, hr: rate(p.hr, 1.1, 30, 200), note: 'The pressure rises for a few minutes, and the rate a little.', tone: 'effect', mark: 'BP ↑' }, { at: 7 * MIN, restore: true, note: 'The push-dose wears off in 5–10 min.', tone: 'info' }],
      };
    }
    return {
      verdict: bad('No indication in this rhythm — it only adds rate, blood pressure and oxygen demand.'),
      steps: [{ at: 30 * S, hr: rate(p.hr, 1.15, 30, 200), note: 'The rate rises.', tone: 'warn', mark: 'rate ↑' }, { at: 7 * MIN, restore: true, note: 'Wears off.', tone: 'info' }],
    };
  },
};

const magnesium: MedDef = {
  id: 'magnesium-sulfate',
  name: 'Magnesium sulfate',
  group: 'Electrolytes',
  unit: 'g',
  route: 'Pulseless: IV/IO push (diluted) · with a pulse: IV over ~15 min',
  verb: 'Give',
  onset: 'Within 1–2 min (push)',
  guide: 'Torsades: 1–2 g IV/IO diluted — as a push if pulseless, over ~15 min with a pulse. Lower doses in renal impairment. Not with: heart block (torsades is the exception, with pacing ready).',
  usual: () => ({ low: 1, high: 2 }),
  max: () => 4,
  picks: () => [0.5, 1, 2, 6],
  step: 0.5,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof, p.hr);
    const toxic: EffectStep[] = cls === 'toxic' ? [{ at: 2 * MIN, hr: rate(p.hr, 0.85, 30), mods: { prAdd: 40 }, note: 'Hypermagnesemia: bradycardia, AV block, lost reflexes, respiratory depression. Antidote: calcium.', tone: 'warn' }] : [];
    if (c === 'torsades') {
      if (cls === 'low') return { verdict: good('Magnesium is the drug for torsades — but give 1–2 g.'), steps: noEcg(2 * MIN, 'Torsades carries on.') };
      return {
        verdict: good('Torsades de pointes: magnesium 1–2 g suppresses the early afterdepolarizations that trigger it and prevents recurrence. But sustained torsades is defibrillated first — unsynchronized, pulse or not — and this patient is pulseless: shock now (Defibrillator tab), CPR, then stop QT-prolonging drugs and correct K⁺ and Mg²⁺.'),
        steps: [
          { at: 60 * S, note: 'Sustained torsades does not stop with magnesium alone: defibrillate (unsynchronized). Magnesium on board makes it less likely to come back after the shock.', tone: 'warn' },
          ...toxic,
        ],
      };
    }
    if (c === 'af') return { verdict: caution('Magnesium modestly helps rate control in AF (and replaces a low level) — not a first-line drug.'), steps: [{ at: 5 * MIN, hr: rate(p.hr, 0.93), note: 'A small fall in the ventricular rate.', tone: 'effect' }, ...toxic] };
    if (c === 'arrest') return { verdict: caution('Only for torsades (or suspected low magnesium) in arrest — it does not help VF in general.'), steps: noEcg(60 * S, 'No change.') };
    if (c === 'vt') {
      const why = 'Magnesium does not stop monomorphic VT with a normal QT — it is the drug for torsades (and it replaces a low level).';
      return {
        verdict: lowBP(p, prof)
          ? bad(`This VT is unstable (hypotensive): synchronized cardioversion now. ${why}`)
          : caution(`${why} For stable monomorphic VT: procainamide or amiodarone; synchronized cardioversion if it fails or the patient becomes unstable.`),
        steps: [...noEcg(2 * MIN, 'VT carries on.'), ...toxic],
      };
    }
    if (c === 'chb' || c === 'mobitz2' || c === 'wenckebach') return { verdict: bad('Contraindicated (label): parenteral magnesium in heart block — it slows AV conduction further. Torsades is the exception, with pacing ready.'), steps: [{ at: 2 * MIN, hr: rate(p.hr, 0.9, 20), mods: { prAdd: 20 }, note: 'AV conduction slows further: a longer PR, more dropped beats, a slower rate.', tone: 'warn', mark: 'PR ↑' }, ...toxic] };
    if (isAcs(prof)) return { verdict: caution('Not routine in an acute MI: magnesium did not help in ISIS-4, and the label lists myocardial damage among its contraindications — give it to replace a low level or for torsades.'), steps: [...noEcg(2 * MIN, 'No visible change.'), ...toxic] };
    return { verdict: caution('No direct ECG effect at normal levels: magnesium corrects a low level (which can provoke ectopy and torsades).'), steps: [...noEcg(2 * MIN, 'No visible change.'), ...toxic] };
  },
};

/** 2025 AHA: in a hyperkalemic arrest, IV calcium, bicarbonate and insulin + glucose may be considered, nothing more */
const ARREST_K = 'Even in a hyperkalemic arrest its benefit is not well established (2025): give it without pausing CPR or shocks — high-quality CPR, defibrillation of a shockable rhythm and epinephrine come first.';

const calcium: MedDef = {
  id: 'calcium-chloride',
  name: 'Calcium chloride 10%',
  group: 'Electrolytes',
  unit: 'g',
  route: 'IV over 2–5 min (push in arrest), large vein',
  verb: 'Give',
  onset: 'Within 1–3 min; lasts 30–60 min',
  guide: 'Hyperkalemia with ECG changes: 1 g (10 mL of 10%) IV over 2–5 min; repeat if changes persist. Arrest with suspected hyperkalemia: 1 g IV/IO push, without pausing CPR or shocks (benefit not well established). 3 g calcium gluconate ≈ 1 g calcium chloride. Not through the bicarbonate line (they precipitate); slowly with digoxin on board.',
  usual: () => ({ low: 1, high: 1 }),
  max: () => 2,
  picks: () => [0.5, 1, 3],
  step: 0.5,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof, p.hr);
    const toxic: EffectStep[] = cls === 'toxic' ? [{ at: 2 * MIN, hr: rate(p.hr, 0.85, 30), note: 'Too much, too fast: bradycardia (dangerous with digoxin). Tissue necrosis if it leaks.', tone: 'warn' }] : [];
    if (c === 'hyperk') {
      return {
        verdict: good('Hyperkalemia with ECG changes: calcium stabilizes the cardiac membrane within minutes — it does not lower K⁺. Then insulin + dextrose, a β-agonist, and K⁺ removal.'),
        steps: [
          { at: 90 * S, mods: { qrsWiden: cls === 'low' ? 0.9 : 0.78, tScale: 0.9 }, note: 'The QRS narrows: the membrane is stabilized (for 30–60 min). The T waves stay peaked — the K⁺ is still high.', tone: 'good', mark: 'QRS ↓' },
          ...toxic,
        ],
      };
    }
    if (c === 'arrest') return { verdict: caution(`Not routine in arrest (no benefit): only when hyperkalemia, hypocalcemia or a calcium-channel-blocker overdose is suspected. ${ARREST_K}`), steps: noEcg(60 * S, 'No change.') };
    // too much diltiazem: a single bolus above its 0.45 mg/kg maximum, more than the two-bolus regimen at its top (0.3 + 0.4
    // mg/kg, with the syringe's rounding), or a pressure it has dropped — the usual 0.25 + 0.35 mg/kg is not an overdose
    const dilt = dosesOf(p, 'diltiazem');
    const ccbToxic = dilt.length > 0 && (lowBP(p, prof) || dilt.some((g) => g.dose > 0.45 * p.kg + 1e-6) || totalOf(p, 'diltiazem') > 0.8 * p.kg + 1e-6);
    // too much magnesium shows as a low pressure, a slow rate or heart block (and weakness, slow breathing): calcium treats those
    const mgOver = totalOf(p, 'magnesium-sulfate') > 4 + 1e-6;
    const mgSigns = lowBP(p, prof) || isBrady(c) || slowSinus(c, p);
    const mgToxic = mgOver && mgSigns;
    const back: EffectStep = p.hr < 100 ? { at: 3 * MIN, hr: rate(p.hr, 1.1, 30, 120), note: 'The blood pressure and the rate recover a little.', tone: 'good' } : { at: 3 * MIN, note: 'The blood pressure recovers a little.', tone: 'good' };
    if (ccbToxic || mgToxic) return { verdict: good(`${ccbToxic ? 'Too much calcium-channel blocker (diltiazem)' : 'Too much magnesium'}: IV calcium is the antidote — 1 g of calcium chloride (or 3 g of gluconate), repeated as needed, with fluids; pace a slow rate.`), steps: [back, ...toxic] };
    if (mgOver) return { verdict: caution(`${fmtDose(totalOf(p, 'magnesium-sulfate'))} g of magnesium in all: calcium is its antidote, but for the signs of too much — a low pressure, a slow rate or heart block, lost reflexes, slow breathing. None shows yet: check the magnesium level and stop the magnesium.`), steps: [...noEcg(2 * MIN, 'No visible change.'), ...toxic] };
    // a slow rhythm: calcium helps only when its cause is one calcium reverses
    if (isBrady(c) || slowSinus(c, p)) return { verdict: caution('Only when a calcium-channel-blocker or β-blocker overdose, hyperkalemia or a low calcium causes the slow rate — then 1 g, repeated as needed. Otherwise it does nothing for a bradycardia: atropine, pacing, epinephrine.'), steps: [...noEcg(2 * MIN, 'No change in the rate: nothing here for calcium to reverse.'), ...toxic] };
    return { verdict: bad('No indication: calcium has no useful ECG effect at a normal potassium.'), steps: [...noEcg(2 * MIN, 'No visible change.'), ...toxic] };
  },
};

const bicarbonate: MedDef = {
  id: 'sodium-bicarbonate',
  name: 'Sodium bicarbonate 8.4%',
  group: 'Electrolytes',
  unit: 'mEq',
  route: 'IV push (1 mEq/mL)',
  verb: 'Push',
  onset: 'Minutes',
  guide: '50 mEq IV over 5 min (up to 1 mEq/kg, typically 50–100 mEq) for hyperkalemia with metabolic acidosis and for sodium-channel-blocker (TCA) overdose. Not routine in arrest; in a hyperkalemic arrest its benefit is not well established — never pause CPR or shocks for it.',
  // (in a light patient the usual range stops at the overdose line, 2 mEq/kg)
  usual: (p) => ({ low: 50, high: Math.min(Math.max(100, p.kg), 2 * p.kg) }),
  max: (p) => 2 * p.kg,
  picks: (p) => uniq([50, round(p.kg, 10), 100, round(2.5 * p.kg, 50)]),
  step: 10,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof, p.hr);
    const alk: EffectStep[] = cls === 'toxic' ? [{ at: 5 * MIN, note: 'Alkalosis and sodium overload: hypokalemia, hypocalcemia, fluid overload.', tone: 'warn' }] : [];
    if (c === 'hyperk') return { verdict: caution('Shifts K⁺ into cells modestly — most useful when the patient is acidotic. Calcium comes first, then insulin + dextrose.'), steps: [{ at: 5 * MIN, mods: { qrsWiden: 0.92 }, note: 'The QRS narrows slightly.', tone: 'effect', mark: 'QRS ↓' }, ...alk] };
    if (c === 'arrest') return { verdict: caution(`Not routine in arrest (no benefit): for a sodium-channel-blocker (TCA) overdose, or a suspected hyperkalemia or severe metabolic acidosis. ${ARREST_K}`), steps: [...noEcg(60 * S, 'No change.'), ...alk] };
    return { verdict: bad('No indication in this rhythm.'), steps: [...noEcg(2 * MIN, 'No visible change.'), ...alk] };
  },
};

const insulinDextrose: MedDef = {
  id: 'insulin-dextrose',
  name: 'Insulin (regular) + dextrose 25 g',
  group: 'Electrolytes',
  unit: 'units',
  route: 'Regular insulin IV push, with dextrose 25 g IV (50 mL of D50)',
  verb: 'Give',
  onset: '10–20 min; peak 30–60 min; lasts 4–6 h',
  guide: 'Hyperkalemia: regular insulin 10 units IV with dextrose 25 g (if the glucose is below about 250 mg/dL). 5 units, or a dextrose infusion afterwards, when hypoglycemia is likely (kidney failure, low weight, no diabetes, a low starting glucose). Lowers K⁺ by about 0.6–1.0 mmol/L. Check the glucose hourly for 6 h.',
  // 5 units when hypoglycemia is likely: kidney failure (the label and KDIGO); 5–10 units otherwise
  usual: (p) => (hasProblem(p, 'renal-failure', 'dialysis') ? { low: 5, high: 5 } : { low: 5, high: 10 }),
  max: () => 20,
  picks: () => [5, 10, 20],
  step: 1,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof, p.hr);
    const low: EffectStep[] = cls === 'high' || cls === 'toxic'
      ? [{ at: 90 * MIN, note: 'Above 10 units: more hypoglycemia (most lows come at 1–3 h) with little extra fall in K⁺. Check the glucose and give more dextrose.', tone: 'warn' }]
      : [{ at: 90 * MIN, note: 'Check the glucose: hypoglycemia is the common harm, at 1–3 h. Recheck K⁺ at 1 h — it rebounds as the insulin wears off unless K⁺ is removed.', tone: 'info' }];
    if (c === 'hyperk') {
      return {
        verdict: good('Hyperkalemia: insulin drives K⁺ into the cells (by about 0.6–1.0 mmol/L at 30–60 min); the dextrose prevents hypoglycemia. It follows calcium when the ECG has changed, and buys time for K⁺ removal (dialysis, binders, diuretics).'),
        steps: [
          { at: 15 * MIN, mods: { tScale: cls === 'low' ? 0.92 : 0.85, qrsWiden: 0.96 }, note: 'K⁺ starting to fall (onset 10–20 min): the T waves begin to shrink.', tone: 'effect', mark: 'K⁺ ↓' },
          { at: 45 * MIN, mods: { tScale: cls === 'low' ? 0.85 : 0.72, qrsWiden: 0.92 }, note: 'Peak effect (30–60 min): K⁺ down by about 0.6–1.0 mmol/L — smaller T waves and a slightly narrower QRS.', tone: 'good', mark: 'K⁺ ↓' },
          ...low,
        ],
      };
    }
    if (c === 'arrest') return { verdict: caution(`Only when hyperkalemia is the suspected cause. ${ARREST_K}`), steps: noEcg(60 * S, 'No change during the arrest.') };
    return {
      verdict: bad('No indication here: insulin with dextrose treats hyperkalemia (very high doses are a specialist treatment for a beta- or calcium-channel-blocker overdose). Given at a normal K⁺ it risks hypokalemia and hypoglycemia.'),
      steps: [...noEcg(30 * MIN, 'No useful ECG change.'), ...low],
    };
  },
};

const albuterol: MedDef = {
  id: 'albuterol',
  name: 'Albuterol (nebulized)',
  group: 'Electrolytes',
  unit: 'mg',
  route: 'Nebulized over about 10 min',
  verb: 'Give',
  onset: 'K⁺ falls from ~30 min, most at 60–90 min',
  guide: 'Hyperkalemia with a pulse: 10–20 mg nebulized (4–8 times the asthma dose), alongside insulin + dextrose; lowers K⁺ by about 0.5–1.0 mmol/L. Bronchospasm: 2.5–5 mg. Not a cardiac-arrest drug. Watch for tachycardia, tremor and chest pain.',
  usual: (p) => (category(resolveProfile(p.profileId), p.hr) === 'hyperk' ? { low: 10, high: 20 } : { low: 2.5, high: 5 }),
  max: () => 20,
  picks: () => [2.5, 5, 10, 20],
  step: 2.5,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof, p.hr);
    const tachy: EffectStep = { at: 10 * MIN, hr: rate(p.hr, dose >= 10 ? 1.12 : 1.06, 30, 200), note: 'The heart rate rises (β₂ stimulation) and a fine tremor appears.', tone: 'effect', mark: 'rate ↑' };
    if (c === 'arrest' || c === 'torsades') return { verdict: bad('Not in cardiac arrest: a nebulizer delivers nothing without breathing and a circulation. When hyperkalemia is suspected, insulin + dextrose (and calcium) may be considered — neither has proven benefit in arrest, and neither may pause CPR or shocks.'), steps: noEcg(60 * S, 'No change.') };
    if (c === 'hyperk') {
      return {
        verdict: cls === 'low'
          ? caution('Hyperkalemia needs 10–20 mg — four to eight times the asthma dose. At 2.5–5 mg the fall in K⁺ is small.')
          : good('Hyperkalemia: nebulized albuterol shifts K⁺ into the cells (about 0.5–1.0 mmol/L), adding to insulin. Calcium comes first when the ECG has changed.'),
        steps: [tachy, { at: 45 * MIN, mods: { tScale: cls === 'low' ? 0.92 : 0.8 }, note: 'K⁺ falling: the peaked T waves shrink.', tone: 'good', mark: 'K⁺ ↓' }],
      };
    }
    const fast = ['svt', 'vt', 'sinus-tach'].includes(c) || ((c === 'af' || c === 'flutter') && p.hr >= 100);
    // a long QT on the monitor (QTc 500 ms or more), or one the history names
    const longQt = prof.qtc >= 500 || hasProblem(p, 'long-qt');
    const qtWords = prof.qtc >= 500 ? `a long QT (QTc about ${prof.qtc} ms)` : 'a long QT';
    // wheezing now (the history the learner set): albuterol is the treatment, with care where the heart objects
    if (hasProblem(p, 'bronchospasm')) {
      const care = fast ? 'the rate is already fast and it speeds the heart' : longQt ? `with ${qtWords} it lowers the potassium` : isAcs(prof) ? 'a faster rate raises the oxygen demand of an ischemic heart' : null;
      return {
        verdict: care
          ? caution(`Wheezing: albuterol 2.5–5 mg nebulized treats it — but ${care}. The smallest dose that works, and watch the monitor.`)
          : good('Wheezing: albuterol 2.5–5 mg nebulized relaxes the airways within minutes (the heart rate rises a little).'),
        steps: [tachy],
      };
    }
    if (fast) {
      return { verdict: bad('Avoid: it speeds the heart and can provoke arrhythmias — the rate is already fast.'), steps: [tachy] };
    }
    if (isAcs(prof)) return { verdict: caution('Only for real bronchospasm: the faster rate raises the oxygen demand of an ischemic heart.'), steps: [tachy] };
    if (longQt) return { verdict: caution(`Only for real bronchospasm: with ${qtWords} a β-agonist lowers the potassium and adds adrenergic drive — both make torsades more likely. Avoid it unless the patient is wheezing.`), steps: [tachy] };
    return { verdict: caution('A bronchodilator (2.5–5 mg for wheezing) — no indication for the rhythm on the monitor.'), steps: [tachy] };
  },
};

type P2y12 = 'ticagrelor' | 'clopidogrel' | 'prasugrel';
const P2Y12: P2y12[] = ['ticagrelor', 'clopidogrel', 'prasugrel'];
/** a fibrinolytic has been given: the P2Y12 inhibitor, and its load, follow from that */
const lysed = (p: Patient) => p.given.some((g) => g.id === 'tenecteplase');
/** the post-lysis clopidogrel load depends on an age the simulator does not set: say which age the 300 mg is for */
const LYSIS_AGE = 'This patient\'s age is not set: 300 mg is the load at 75 or younger.';
/** over 75: clopidogrel after lysis is 75 mg with no load (2025 ACC/AHA ACS) */
const over75 = (p: Patient) => p.age !== undefined && p.age > 75;

/** One plan for the three oral P2Y12 inhibitors: who gets the load, who must not, and what it does (nothing on the ECG) */
function p2y12Plan(p: Patient, drug: P2y12, dose: number, cls: DoseClass): { verdict: Verdict; steps: EffectStep[] } {
  const prof = resolveProfile(p.profileId);
  const c = category(prof, p.hr);
  const none = noEcg(60 * S, 'No ECG change: the load stops platelets adding to the clot (onset ~30 min for ticagrelor and prasugrel, 2–6 h for clopidogrel). It does not open the artery.');
  if (c === 'arrest' || c === 'torsades') return { verdict: bad('Not in cardiac arrest — nothing by mouth.'), steps: noEcg(60 * S, 'No change.') };
  if (prof.id === DISSECTION) return { verdict: bad('Contraindicated: aortic dissection can mimic an MI — a P2Y12 inhibitor feeds the bleeding and delays surgery.'), steps: noEcg(60 * S, 'No ECG change.') };
  if (!isAcs(prof)) return { verdict: bad('No indication: a P2Y12 load is for an acute coronary syndrome or a planned stent.'), steps: none };
  // aspirin plus ONE P2Y12 inhibitor, loaded once (2025 ACC/AHA ACS): a second load — the same drug again or another —
  // only adds bleeding, and a switch between them has its own timing rules. A load given in parts is still one load:
  // a dose that adds to too little of this same drug (ticagrelor 90 mg, then 90 mg) is judged with it, on the total.
  const loaded = P2Y12.filter((id) => dosesOf(p, id).length);
  const before = totalOf(p, drug);
  const def = MED_BY_ID[drug];
  const short = before < def.usual(p).low * (1 - (def.tolerance ?? 0.15)) - 1e-6;
  const partial = loaded.length === 1 && loaded[0] === drug && short;
  if (loaded.length && !partial) {
    const what = loaded.map((id) => `${id} ${fmtDose(totalOf(p, id))} mg`).join(', then ');
    return {
      verdict: bad(`A P2Y12 inhibitor has already been loaded (${what}): one at a time, with aspirin. A second load — the same drug again or another one — adds bleeding with no benefit. A switch, or a top-up load before PCI, is the cardiologist's decision, with its own timing rules.`),
      steps: noEcg(60 * S, 'No ECG change — only more bleeding risk.'),
    };
  }
  if (prof.id === 'cardiogenic-shock' && !lysed(p)) {
    return { verdict: caution(`Cardiogenic shock: oral loads are absorbed poorly and late, and the angiogram may send the patient for urgent bypass surgery (${drug === 'prasugrel' ? 'the prasugrel label: do not start it when urgent CABG is likely' : 'a loaded P2Y12 inhibitor delays CABG by days'}) — the interventionalist usually decides at the angiogram (IV cangrelor is an option).`), steps: none };
  }
  const plan = p2y12Load(p, drug, before + dose, partial, cls, c, prof.id, none);
  // after lysis the clopidogrel verdict already says what a total other than 300 mg means
  if (!partial || (lysed(p) && drug === 'clopidogrel' && cls !== 'usual')) return plan;
  const sum = `${fmtDose(before)} mg given before, ${fmtDose(before + dose)} mg in all`;
  const note = cls === 'usual'
    ? `This dose completes the load (${sum}).`
    : cls === 'low'
      ? `The load is still short (${sum}).`
      : `With the earlier dose this is more than one load (${sum}): more bleeding, no more benefit.`;
  return { ...plan, verdict: { ...plan.verdict, text: `${plan.verdict.text} ${note}` } };
}

/** The first load of a P2Y12 inhibitor (`amount`: everything of it given, this dose included; `partial`: given in parts) */
function p2y12Load(p: Patient, drug: P2y12, amount: number, partial: boolean, cls: DoseClass, c: Category, profId: string, none: EffectStep[]): { verdict: Verdict; steps: EffectStep[] } {
  // after a fibrinolytic the P2Y12 inhibitor is clopidogrel (2025 ACC/AHA, class 1): the others were not tested in the first hours after lysis
  if (lysed(p)) {
    if (drug !== 'clopidogrel') {
      return { verdict: caution(`Not with a fibrinolytic: ${drug} was not tested in the first hours after lysis and adds bleeding. Give clopidogrel 300 mg (75 mg with no load over 75 years); any later switch is the interventionalist's decision at PCI.`), steps: none };
    }
    const mg = `${fmtDose(amount)} mg${partial ? ' in all' : ''}`;
    const old = over75(p);
    const doseNote = cls === 'high' || cls === 'toxic'
      ? ` ${mg} is more than the ${old ? 'dose' : 'load'} after lysis${old ? ` at ${p.age} (75 mg, no load)` : ''}: it adds bleeding on top of the fibrinolytic.`
      : cls === 'low'
        ? (Math.abs(amount - 75) < 1e-6
          ? ` 75 mg with no load is the dose over 75 years; at ${p.age === undefined ? '75 or younger' : p.age} the load after lysis is 300 mg.`
          : ` ${mg} is short of the ${old ? '75 mg dose' : '300 mg load'} after lysis${old ? '' : ' (over 75 years: 75 mg, no load)'}.`)
        : '';
    const warn: EffectStep[] = cls === 'high' || cls === 'toxic'
      ? [{ at: 60 * S, note: `${mg} is more than the ${old ? 'dose' : 'load'} with a fibrinolytic (${old ? `75 mg with no load at ${p.age}` : '300 mg; no load over 75 years'}) — 600 mg is the PCI load: more bleeding risk, no extra benefit.`, tone: 'warn' }]
      : [];
    const ageNote = p.age === undefined ? LYSIS_AGE : old ? `At ${p.age}: 75 mg, no load.` : `At ${p.age}: the 300 mg load.`;
    return {
      verdict: good(`After fibrinolysis the P2Y12 inhibitor is clopidogrel: a 300 mg load (75 mg with no load over 75 years), then 75 mg daily, with aspirin and an anticoagulant. 600 mg is the PCI load. ${ageNote}${doseNote}`),
      steps: [...none, ...warn],
    };
  }
  const stemi = c === 'stemi' || ['inferior-stemi-chb', 'cardiogenic-shock', 'anterior-stemi-reperfused', 'inferior-stemi-reperfused'].includes(profId);
  const lysisNote = 'With fibrinolysis the P2Y12 inhibitor is clopidogrel (300 mg, or 75 mg with no load over 75 years).';
  if (drug === 'ticagrelor') {
    if (c === 'chb' || c === 'mobitz2' || c === 'wenckebach') return { verdict: caution(`ACS with second- or third-degree AV block: ticagrelor can cause ventricular pauses and AV block (FDA warning; PLATO excluded such patients without a pacemaker). Clopidogrel, or prasugrel at PCI, avoids this — or give it once pacing protects the rate. ${lysisNote}`), steps: none };
    return { verdict: good(`ACS with aspirin: ticagrelor 180 mg is preferred over clopidogrel (PLATO), then 90 mg twice daily. It can cause breathlessness and pauses. ${lysisNote}`), steps: none };
  }
  if (drug === 'prasugrel') {
    return {
      verdict: stemi
        ? caution('STEMI going to PCI: prasugrel 60 mg before or at primary PCI is an alternative to ticagrelor (2025 ACC/AHA: either is preferred over clopidogrel). Never with a previous stroke or TIA; generally not from 75 years; 5 mg maintenance under 60 kg. Not with fibrinolysis — that is clopidogrel.')
        : caution('NSTE-ACS: prasugrel is loaded at PCI once the anatomy is known (pretreatment added bleeding without benefit, ACCOAST). Never with a previous stroke or TIA.'),
      steps: none,
    };
  }
  return { verdict: caution(`Clopidogrel 600 mg before PCI works, but slower and less reliably than ticagrelor or prasugrel — it is the choice with fibrinolysis or an oral anticoagulant, or when the others cannot be used. ${lysisNote}`), steps: none };
}

const ticagrelor: MedDef = {
  id: 'ticagrelor', name: 'Ticagrelor', group: 'Coronary care & other', unit: 'mg', route: 'By mouth (tablets may be crushed)', verb: 'Give',
  onset: '~30 min; peak ~2 h',
  guide: 'ACS: 180 mg load, then 90 mg twice daily, with aspirin 81 mg (no more than 100 mg a day). Preferred over clopidogrel. Not with a previous intracranial hemorrhage or active bleeding.',
  usual: () => ({ low: 180, high: 180 }), max: () => 360, picks: () => [90, 180, 360], step: 90, tolerance: 0.02, cumulative: true,
  plan: (p, dose, cls) => p2y12Plan(p, 'ticagrelor', dose, cls),
};
const clopidogrel: MedDef = {
  id: 'clopidogrel', name: 'Clopidogrel', group: 'Coronary care & other', unit: 'mg', route: 'By mouth', verb: 'Give',
  onset: '~2 h after 600 mg, ~6 h after 300 mg',
  guide: 'PCI: 600 mg load. With fibrinolysis: 300 mg (no load, 75 mg, over 75 years). Then 75 mg daily. The P2Y12 inhibitor with an oral anticoagulant and after lysis. Not with: active bleeding.',
  // with a fibrinolytic the load is 300 mg: the 600 mg PCI load adds bleeding on top of the lysis
  usual: (p) => (lysed(p) ? (over75(p) ? { low: 75, high: 75 } : { low: 300, high: 300 }) : { low: 300, high: 600 }), max: () => 900, picks: () => [75, 300, 600, 900], step: 75, tolerance: 0.02, cumulative: true,
  plan: (p, dose, cls) => p2y12Plan(p, 'clopidogrel', dose, cls),
};
const prasugrel: MedDef = {
  id: 'prasugrel', name: 'Prasugrel', group: 'Coronary care & other', unit: 'mg', route: 'By mouth', verb: 'Give',
  onset: '~30 min',
  guide: '60 mg load at PCI once the anatomy is known, then 10 mg daily (5 mg under 60 kg). Contraindicated after a stroke or TIA; generally avoided from 75 years.',
  usual: () => ({ low: 60, high: 60 }), max: () => 120, picks: () => [10, 60, 120], step: 10, tolerance: 0.02, cumulative: true,
  plan: (p, dose, cls) => p2y12Plan(p, 'prasugrel', dose, cls),
};

const aspirin: MedDef = {
  id: 'aspirin',
  name: 'Aspirin',
  group: 'Coronary care & other',
  unit: 'mg',
  route: 'Chewed (non-enteric-coated tablets), by mouth',
  verb: 'Give',
  onset: 'Platelets inhibited within ~15–30 min when chewed',
  guide: 'Suspected ACS: 162–325 mg chewed as early as possible (150–300 mg in European guidance), then 75–100 mg daily. Not with a true aspirin allergy, active bleeding or suspected aortic dissection.',
  // pericarditis is treated at the anti-inflammatory dose (650–1000 mg every 8 h), not the ACS load
  usual: (p) => (p.profileId === 'pericarditis' ? { low: 650, high: 1000 } : { low: 162, high: 325 }),
  max: (p) => (p.profileId === 'pericarditis' ? 1000 : 650),
  picks: (p) => (p.profileId === 'pericarditis' ? [81, 325, 650, 1000] : [81, 162, 325, 1000]),
  step: 81,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof, p.hr);
    const none = 'No direct ECG change: aspirin stops platelets building the clot — it does not reopen the artery, so the ST segments stay as they are.';
    const big: EffectStep[] = cls === 'toxic' ? [{ at: 30 * MIN, note: 'High doses add bleeding and stomach injury with no extra benefit.', tone: 'warn' }] : [];
    if (c === 'arrest' || c === 'torsades') return { verdict: bad('Not in cardiac arrest — nothing by mouth.'), steps: noEcg(60 * S, 'No change.') };
    if (prof.id === DISSECTION) return { verdict: bad('Contraindicated: aortic dissection can mimic an MI — antiplatelets feed the bleeding into the wall.'), steps: noEcg(60 * S, 'No ECG change.') };
    if (prof.id === 'pericarditis') return { verdict: caution('Pericarditis: aspirin is first line (with colchicine; aspirin is the one after an MI) — but at the anti-inflammatory dose, 650–1000 mg every 8 h (2025 ACC), not the 162–325 mg ACS load. A tamponade is drained first; avoid it with a hemorrhagic effusion or a possible dissection.'), steps: [...noEcg(60 * S, 'No direct ECG change: the pericarditis settles over days, not minutes.'), ...big] };
    if (isAcs(prof) && dosesOf(p, 'aspirin').length) return { verdict: caution(`Aspirin has already been given (${fmtDose(totalOf(p, 'aspirin'))} mg): the load is once, then 75–100 mg daily. More adds bleeding and stomach injury, no benefit.`), steps: [...noEcg(60 * S, none), ...big] };
    if (isAcs(prof)) {
      return {
        verdict: good('Every suspected acute coronary syndrome gets aspirin, chewed, as early as possible (it cut deaths by about a fifth in ISIS-2) — within EMT scope by protocol. A P2Y12 inhibitor and an anticoagulant follow in hospital.'),
        steps: [...noEcg(60 * S, none), ...big],
      };
    }
    return { verdict: bad('No indication in this condition.'), steps: [...noEcg(60 * S, 'No ECG change.'), ...big] };
  },
};

/** the PE that systemic thrombolysis is for, in the 2026 AHA/ACC words */
const PE_FAILURE = 'PE with cardiopulmonary failure (AHA/ACC 2026 category E, formerly "massive")';

/** Tenecteplase weight bands (single bolus) */
function tnkBand(kg: number): number {
  return kg < 60 ? 30 : kg < 70 ? 35 : kg < 80 ? 40 : kg < 90 ? 45 : 50;
}

const tenecteplase: MedDef = {
  id: 'tenecteplase',
  name: 'Tenecteplase',
  group: 'Coronary care & other',
  unit: 'mg',
  route: 'Single IV bolus over about 5 s',
  verb: 'Push',
  onset: 'Reperfusion in ~30–60 min if it works (about 6 in 10)',
  guide: 'STEMI within 12 h of symptom onset when primary PCI cannot happen within 120 min: by weight — < 60 kg 30 mg, 60–69 kg 35 mg, 70–79 kg 40 mg, 80–89 kg 45 mg, ≥ 90 kg 50 mg (consider half dose from 75 y: STREAM-2, ESC — not in the US label). Not with: any prior intracranial hemorrhage, an ischemic stroke within 3 months, a known intracranial lesion, brain or spine surgery or significant head trauma within 3 months, active bleeding, suspected aortic dissection, or severe uncontrolled hypertension. With care (relative): a TIA or a stroke more than 3 months ago, an oral anticoagulant, major surgery within 3 weeks, recent internal bleeding, pregnancy, a systolic above 180. With aspirin, clopidogrel and an anticoagulant; then transfer for angiography.',
  // 75 or older: half the weight band is considered (STREAM-2; ESC) and the full band is the US label's dose — both usual
  usual: (p) => (elderly(p) ? { low: tnkBand(p.kg) / 2, high: tnkBand(p.kg) } : { low: tnkBand(p.kg), high: tnkBand(p.kg) }),
  max: () => 50,
  picks: () => [30, 35, 40, 45, 50],
  step: 5,
  tolerance: 0.02,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof, p.hr);
    const band = tnkBand(p.kg);
    const bleed: EffectStep[] = dose > band * 1.02 || cls === 'toxic'
      ? [{ at: 10 * MIN, note: 'Above the weight band: more bleeding (intracranial hemorrhage ~1%) with no extra benefit.', tone: 'warn' }]
      : elderly(p) && dose > (band / 2) * 1.02
        ? [{ at: 10 * MIN, note: `${dose >= band * 0.98 ? 'The full' : 'More than half the'} weight-band dose at ${p.age}: intracranial hemorrhage rises with age, and STREAM-2 halved the dose from 75 to cut it (ESC; the US label keeps the full band).`, tone: 'warn' }]
        : [];
    if (dosesOf(p, 'tenecteplase').length) {
      return { verdict: bad('Tenecteplase has already been given: it is one bolus. A failed lysis (less than 50% ST resolution at 60–90 min) goes for rescue PCI — repeat fibrinolysis did no better than none and worse than rescue PCI (REACT), and it adds bleeding.'), steps: [...noEcg(10 * MIN, 'No further reperfusion — only more bleeding risk.'), ...bleed] };
    }
    if (p.conditionId === 'scad') {
      return { verdict: bad('Not in spontaneous coronary artery dissection: the artery is closed by blood in its wall, not by a clot. A fibrinolytic can extend the bleed into the wall and the dissection, and SCAD is treated conservatively where the flow allows (2018 AHA scientific statement on SCAD). The angiogram, not the 12-lead, tells SCAD from a clot: for a STEMI that is the cath lab.'), steps: [...noEcg(10 * MIN, 'No reperfusion — the wall hematoma can grow.'), ...bleed] };
    }
    if (prof.id === DISSECTION) {
      return { verdict: bad('Absolutely contraindicated: aortic dissection — fibrinolysis can cause fatal bleeding into the dissection (it can mimic an MI: check before lysis).'), steps: [...noEcg(10 * MIN, 'No benefit — and catastrophic bleeding risk.'), ...bleed] };
    }
    if (c === 'arrest' || c === 'torsades') {
      return { verdict: bad('Not routine in cardiac arrest: fibrinolysis did not improve survival in unselected arrests, and it adds bleeding to CPR. The exception is an arrest from a suspected pulmonary embolism, where it may be considered (2025 AHA) — nothing on this page says PE.'), steps: [...noEcg(10 * MIN, 'No change in the arrest rhythm.'), ...bleed] };
    }
    if (prof.id === 'cardiogenic-shock') {
      return {
        verdict: caution('Cardiogenic shock from STEMI: immediate PCI is the treatment (and mechanical support if needed). Lysis works less well in shock — give it only if PCI is more than 120 min away and mechanical complications are excluded.'),
        steps: [{ at: 45 * MIN, mods: { stScale: 0.6 }, note: 'Only partial ST resolution — lysis often fails in shock: transfer for rescue PCI.', tone: 'warn', mark: 'ST partly ↓' }, ...bleed],
      };
    }
    if (prof.id === 'pulmonary-embolism') {
      // The indication is the circulation, not the clot: systemic lysis is for a PE that has caused hypotension or shock
      const lyses: EffectStep = { at: 30 * MIN, hr: rate(p.hr, 0.8), note: 'The tachycardia eases as the clot lyses and the RV unloads.', tone: 'good', mark: 'rate ↓' };
      return lowBP(p, prof)
        ? { verdict: caution(`${PE_FAILURE}: systemic thrombolysis is reasonable when bleeding risk allows (alteplase is the usual agent; tenecteplase is used off-label) — or catheter-directed therapy or surgical embolectomy.`), steps: [lyses, ...bleed] }
        : { verdict: bad('Not for this PE: the blood pressure is holding. Systemic thrombolysis is for PE with cardiopulmonary failure (AHA/ACC 2026 category E — hypotension or shock), may be considered when it is incipient (category D), and should not be used in categories A–C, where it adds bleeding (including intracranial hemorrhage) without benefit. Anticoagulate, and watch for deterioration.'), steps: [lyses, ...bleed] };
    }
    if (c !== 'stemi' && prof.id !== 'inferior-stemi-chb') {
      if (prof.id === 'anterior-stemi-reperfused' || prof.id === 'inferior-stemi-reperfused') {
        return { verdict: bad('Already reperfused: the ST elevation has resolved — more lysis adds only bleeding. Angiography within 2–24 h.'), steps: [...noEcg(30 * MIN, 'No change.'), ...bleed] };
      }
      return { verdict: bad('Fibrinolysis is only for STEMI (or PE with cardiopulmonary failure): no benefit here, and a real risk of bleeding, including intracranial hemorrhage.'), steps: [...noEcg(30 * MIN, 'No change.'), ...bleed] };
    }
    if (cls === 'low') {
      return {
        verdict: good('STEMI without timely PCI: fibrinolysis — but the dose was below the weight band.'),
        steps: [{ at: 60 * MIN, mods: { stScale: 0.75 }, note: 'Less than 50% ST resolution at 60 min: failed reperfusion — rescue PCI.', tone: 'warn', mark: 'ST still ↑' }],
      };
    }
    const hypertensive = p.sbp !== undefined && p.sbp > 180;
    const reperfused = prof.id === 'anterior-stemi' ? 'anterior-stemi-reperfused' : prof.id === 'inferior-stemi' || prof.id === 'inferior-stemi-chb' ? 'inferior-stemi-reperfused' : null;
    const opened = 'ST elevation resolving (> 50%) — the artery has opened. Brief reperfusion arrhythmias such as accelerated idioventricular rhythm (a wide, regular rhythm at about 50–120/min, usually under 100) are common and need no treatment.';
    return {
      verdict: hypertensive
        ? caution(`A systolic of ${p.sbp} mmHg: above 180 (or a diastolic above 110) is a relative contraindication to fibrinolysis — the risk of intracranial hemorrhage rises steeply. Lower the pressure first; if it cannot be controlled, lysis is contraindicated — transfer for PCI.`)
        : good(`STEMI within 12 h of onset when primary PCI cannot be done within 120 min: fibrinolysis as soon as possible (ESC: within 10 min of the diagnosis; ACC/AHA door-to-needle ≤ 30 min) — then transfer for angiography (within 2–24 h, or at once if it fails).${elderly(p) ? ` At ${p.age}, half the weight-band dose is considered (STREAM-2; ESC) — not in the US label.` : ''}`),
      steps: [
        reperfused
          ? { at: 30 * MIN, profile: reperfused, hr: prof.id === 'anterior-stemi' ? 80 : 70, note: `${opened} Terminal T-wave inversion follows.`, tone: 'good', mark: 'reperfused' }
          : { at: 30 * MIN, profile: p.profileId, hr: p.hr, mods: { stScale: 0.3 }, note: opened, tone: 'good', mark: 'reperfused' },
        ...bleed,
      ],
    };
  },
};

const heparin: MedDef = {
  id: 'heparin',
  name: 'Heparin (UFH)',
  group: 'Coronary care & other',
  unit: 'units',
  route: 'IV bolus, then an infusion',
  verb: 'Push',
  onset: 'Immediate anticoagulation',
  guide: 'ACS: 60 units/kg IV bolus (max 4000 units), then 12 units/kg/h (max 1000 units/h). Primary PCI: 70–100 units/kg to a target ACT. PE: LMWH is preferred over UFH (2026 AHA/ACC); UFH — 80 units/kg, then 18 units/kg/h — when renal function is severely impaired, or rapid reversal or a procedure (lysis, catheter therapy, surgery) may be needed. Not with: HIT, active bleeding or severe thrombocytopenia.',
  // ACS / AF: 60 units/kg (max 4000); PE: 80 units/kg, no cap
  usual: (p) => (p.profileId === 'pulmonary-embolism' ? { low: 75 * p.kg, high: 85 * p.kg } : { low: Math.min(4000, 50 * p.kg), high: Math.min(4000, 60 * p.kg) }),
  // 100 units/kg is the top of any bolus (PCI); the old habit of a flat 5000 units is 125 units/kg in a 40 kg patient
  max: (p) => 100 * p.kg,
  picks: (p) => uniq([2000, Math.min(4000, round(60 * p.kg, 500)), 5000, 10000]),
  step: 500,
  plan(p) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof, p.hr);
    if (prof.id === DISSECTION) return { verdict: bad('Contraindicated: aortic dissection — anticoagulation feeds the bleeding into the wall.'), steps: noEcg(60 * S, 'No ECG change.') };
    const none = noEcg(60 * S, 'No direct ECG effect: heparin prevents clot extension — the tracing does not change.');
    const useful = isAcs(prof) || c === 'af' || c === 'flutter';
    // one bolus, then the infusion — in a PE as in an ACS
    if ((useful || prof.id === 'pulmonary-embolism') && dosesOf(p, 'heparin').length) return { verdict: caution('The bolus has already been given: unfractionated heparin is one bolus, then an infusion adjusted to the aPTT (or ACT in the lab). A second full bolus doubles the anticoagulation — more bleeding.'), steps: none };
    if (prof.id === 'pulmonary-embolism') {
      // which heparin depends on what may come next: lysis or a procedure needs one that can be stopped and reversed
      return {
        verdict: lowBP(p, prof)
          ? good(`${PE_FAILURE}: anticoagulate at once with unfractionated heparin — systemic lysis, catheter therapy or embolectomy may follow, and UFH wears off within a few hours of stopping it (protamine reverses it at once). It does not dissolve the clot.`)
          : caution('Anticoagulate at once — but for PE, LMWH is preferred over unfractionated heparin (2026 AHA/ACC). UFH is the choice when renal function is severely impaired, or when rapid reversal or a procedure (lysis, catheter therapy, surgery) may be needed.'),
        steps: none,
      };
    }
    return {
      verdict: useful ? good('Anticoagulation to stop the clot growing (ACS, AF before cardioversion). It does not open an occluded artery.')
        : prof.id === 'pericarditis' || prof.hemo === 'tamponade' ? bad('No indication — and in pericarditis or a tamponade, anticoagulation risks bleeding into the pericardium.')
          : bad('No indication here.'),
      steps: none,
    };
  },
};

const nitroglycerin: MedDef = {
  id: 'nitroglycerin',
  name: 'Nitroglycerin (SL)',
  group: 'Coronary care & other',
  unit: 'mg',
  route: 'Sublingual tablet or spray, every 5 min up to 3 doses',
  verb: 'Give',
  onset: '1–3 min',
  guide: '0.4 mg SL every 5 min, up to 3 doses. Hold if SBP < 90 mmHg or ≥ 30 mmHg below baseline, with marked bradycardia (< 50/min) or tachycardia (> 100/min) without heart failure, with RV infarction or severe aortic stenosis, or after a PDE-5 inhibitor: avanafil within 12 h, sildenafil or vardenafil within 24 h, tadalafil within 48 h. Not with riociguat or raised intracranial pressure either.',
  usual: () => ({ low: 0.4, high: 0.4 }),
  max: () => 0.8,
  picks: () => [0.3, 0.4, 0.8, 1.2],
  step: 0.1,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof, p.hr);
    const reflex: EffectStep = { at: 2 * MIN, hr: rate(p.hr, 1.08, 30, 180), note: 'Reflex tachycardia as the blood pressure falls a little.', tone: 'effect' };
    const drop: EffectStep[] = cls === 'high' || cls === 'toxic' ? [{ at: 3 * MIN, note: 'A large dose: headache and hypotension.', tone: 'warn' }] : [];
    if (c === 'arrest' || c === 'torsades') return { verdict: bad('Not in arrest.'), steps: noEcg(2 * MIN, 'No change.') };
    if (['aortic-stenosis', 'hcm', 'takotsubo-lvoto'].includes(prof.id)) return { verdict: bad('Dangerous: a preload-dependent heart (aortic stenosis, obstructive HCM, Takotsubo with LV outflow obstruction) — nitrates can cause collapse.'), steps: [reflex, { at: 3 * MIN, note: 'Blood pressure falling.', tone: 'warn' }] };
    if (lowBP(p, prof)) return { verdict: bad('Contraindicated: the patient is hypotensive (SBP < 90) — nitrates drop the pressure further.'), steps: [reflex, { at: 3 * MIN, note: 'Blood pressure falling further.', tone: 'warn' }] };
    if (prof.hemo === 'tamponade' || prof.hemo === 'pe') return { verdict: bad(`Dangerous: ${prof.hemo === 'tamponade' ? 'a tamponade' : 'a PE straining the right ventricle'} makes the heart preload-dependent — a nitrate drops the filling and the pressure.`), steps: [reflex, { at: 3 * MIN, note: 'Blood pressure falling.', tone: 'warn' }] };
    if (prof.id === DISSECTION) return { verdict: caution('Aortic dissection: vasodilators lower the BP only after β-blockade — alone they cause a reflex tachycardia that increases the shear on the aortic wall.'), steps: [reflex, ...drop] };
    // ACC/AHA (STEMI guideline; AHA ACLS ACS): no nitrates with marked bradycardia (< 50/min) — the heart cannot speed
    // up to make up for the fall in preload — or with tachycardia (> 100/min) without heart failure, which can mean low
    // volume or a large infarct heading for shock, and which the reflex tachycardia only makes worse
    const slow = p.hr > 0 && p.hr < 50;
    const onRate: EffectStep = slow ? { at: 3 * MIN, note: 'The blood pressure falls and the slow heart barely speeds up to make up for it.', tone: 'warn' } : reflex;
    const inferior = prof.id.startsWith('inferior');
    // an infarct whose rhythm is a heart block: the ischemic pain is there, but so is a reason to hold the nitrates
    if (isAcs(prof) && (c === 'chb' || c === 'mobitz2')) {
      return {
        verdict: bad(`Hold the nitrates: this infarct comes with heart block at ${p.hr}/min, and the heart cannot speed up to hold the pressure when the preload falls${inferior ? ' — an inferior MI with AV block also often involves the right ventricle (check V4R), which makes the fall steeper' : ''}. Treat the rate (atropine, pacing) and reperfuse.`),
        steps: [onRate, ...drop],
      };
    }
    const failure = prof.hemo === 'hfref' || prof.hemo === 'hfpef';
    if (c === 'stemi' || ['nstemi', 'wellens', 'hfref', 'hfpef'].includes(prof.id)) {
      if (slow) {
        return {
          verdict: bad(`Hold the nitrates: a heart rate of ${p.hr}/min is marked bradycardia (< 50/min), a contraindication — a slow heart cannot speed up to make up for the fall in preload, so the pressure can drop sharply${inferior ? '. A slow inferior MI also often involves the right ventricle (check V4R)' : ''}. Treat the cause of the slow rate first.`),
          steps: [onRate, ...drop],
        };
      }
      if (p.hr > 100 && !failure) {
        return {
          verdict: bad(`Hold the nitrates: a heart rate of ${p.hr}/min without heart failure is a contraindication — the fast rate can mean low volume or a large infarct heading for shock, and the reflex tachycardia from nitrates raises the heart's oxygen demand further. Find and treat the cause of the fast rate.`),
          steps: [reflex, ...drop],
        };
      }
    }
    // three sublingual doses is the regimen: pain they do not relieve is not treated with a fourth
    if (dosesOf(p, 'nitroglycerin').length >= 3 && (c === 'stemi' || ['nstemi', 'wellens', 'hfref', 'hfpef'].includes(prof.id))) {
      return { verdict: caution('Three doses already: pain that 3 doses of nitroglycerin do not relieve is an MI until proven otherwise — reperfusion, and IV nitroglycerin or an opioid in hospital, not a fourth tablet.'), steps: [onRate, ...drop] };
    }
    if (c === 'stemi') {
      return {
        verdict: inferior
          ? caution('Chest pain relief in STEMI if BP allows — but in inferior MI check right-sided leads (V4R) first: RV infarction makes nitrates drop the blood pressure. Nitrates do not open a thrombosed artery.')
          : caution('Relieves ischemic pain and congestion if BP allows. It does not open a thrombosed artery — reperfusion does.'),
        steps: [{ ...reflex, note: 'Reflex tachycardia; the ST elevation is unchanged — nitrates cannot open an occluded artery.' }, ...drop],
      };
    }
    if (['nstemi', 'wellens', 'hfref', 'hfpef'].includes(prof.id)) {
      return { verdict: good('Ongoing ischemic pain or congestion: nitrates lower preload and relieve symptoms (watch the BP).'), steps: [onRate, ...drop] };
    }
    return { verdict: bad('No indication in this rhythm.'), steps: [onRate, ...drop] };
  },
};

const fentanyl: MedDef = {
  id: 'fentanyl',
  name: 'Fentanyl',
  group: 'Coronary care & other',
  unit: 'mcg',
  route: 'IV slow push',
  verb: 'Give',
  onset: '1–2 min',
  guide: '~1 mcg/kg IV (typically 25–100 mcg), titrated; about 0.5 mcg/kg in the elderly or frail. Not with: hypotension or respiratory depression; with benzodiazepines only on monitoring (boxed warning).',
  // about 0.5 mcg/kg in the elderly: half the adult range
  usual: (p) => (elderly(p) ? { low: 0.25 * p.kg, high: 0.5 * p.kg } : { low: 0.5 * p.kg, high: 1 * p.kg }),
  max: (p) => 2 * p.kg,
  picks: (p) => uniq([25, 50, round(p.kg, 25), round(2.5 * p.kg, 25)]),
  step: 25,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof, p.hr);
    const resp: EffectStep[] = cls === 'toxic' ? [{ at: 3 * MIN, note: 'Respiratory depression (and chest-wall rigidity with large fast doses): support the airway; naloxone.', tone: 'warn' }] : [];
    if (c === 'arrest' || c === 'torsades') return { verdict: bad('Not in arrest.'), steps: noEcg(2 * MIN, 'No change.') };
    if (lowBP(p, prof)) return { verdict: caution('A low pressure: an opioid blunts the sympathetic drive that is holding it up (and more so with an RV infarct or a tamponade). Support the pressure first; then small, titrated doses.'), steps: [{ at: 2 * MIN, hr: rate(p.hr, 0.93, 30), note: 'The heart rate falls slightly — and the pressure dips.', tone: 'warn' }, ...resp] };
    return {
      verdict: c === 'stemi' || ['nstemi', 'pericarditis', 'aortic-dissection'].includes(prof.id) ? good('Analgesia: pain drives catecholamines and oxygen demand. No direct ECG effect.') : caution('Analgesia only — no direct effect on the rhythm.'),
      steps: [{ at: 2 * MIN, hr: rate(p.hr, 0.93, 30), note: 'A slight fall in heart rate (vagotonic) as the pain settles.', tone: 'effect' }, ...resp],
    };
  },
};

const phenylephrine: MedDef = {
  id: 'phenylephrine',
  name: 'Phenylephrine',
  group: 'Coronary care & other',
  unit: 'mcg',
  route: 'IV push (100 mcg/mL)',
  verb: 'Push',
  onset: 'Within 1 min; lasts 10–20 min',
  guide: '~40–100 mcg IV every 1–2 min as needed (protocol-dependent); infusion 10–200 mcg/min. A pure α-agonist: raises BP by vasoconstriction. Not with: bradycardia; only for a low pressure.',
  usual: () => ({ low: 40, high: 100 }),
  max: () => 200,
  picks: () => [50, 100, 200, 500],
  step: 10,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof, p.hr);
    if (c === 'arrest' || c === 'torsades') return { verdict: bad('Not an arrest drug.'), steps: noEcg(60 * S, 'No change.') };
    const fall = cls === 'toxic' ? 0.7 : cls === 'high' ? 0.78 : 0.86;
    const low = lowBP(p, prof);
    return {
      verdict: isBrady(c) || slowSinus(c, p) ? bad('Avoid in bradycardia: the reflex slowing makes it worse.')
        : !low ? bad('No low pressure to treat: phenylephrine only adds afterload and slows the heart.')
          : outflowObstructed(prof) || prof.hemo === 'aortic-stenosis' || hasProblem(p, 'lvot-obstruction', 'severe-aortic-stenosis') ? good('Hypotension with outflow obstruction (obstructive HCM, Takotsubo with LV outflow obstruction) or severe aortic stenosis: a vasoconstrictor without inotropy is the drug, after fluid (2024 AHA/ACC HCM).')
            : prof.hemo === 'tamponade' ? caution('Tamponade: the output depends on the fast rate, and phenylephrine slows it (reflex). Drain the pericardium; fluid meanwhile.')
              : prof.hemo === 'hfref' || prof.hemo === 'shock' || isAcs(prof) ? caution('Raises the afterload of a failing ventricle: norepinephrine is the usual first pressor in cardiogenic shock.')
                : caution('A vasopressor for hypotension from vasodilation (e.g. anesthesia) — not for a rhythm problem. Note the reflex slowing.'),
      steps: [{ at: 40 * S, hr: rate(p.hr, fall, 25), note: 'The blood pressure rises and the heart rate falls (baroreceptor reflex).', tone: 'effect', mark: 'reflex ↓' }, { at: 12 * MIN, restore: true, note: 'Wears off.', tone: 'info' }],
    };
  },
};

export const MEDS: MedDef[] = [
  adenosine, diltiazem, metoprolol, esmolol, amiodarone, procainamide, sotalol, lidocaine, digoxin,
  atropine, epinephrine,
  magnesium, calcium, bicarbonate, insulinDextrose, albuterol,
  aspirin, ticagrelor, clopidogrel, prasugrel, tenecteplase, heparin, nitroglycerin, fentanyl, phenylephrine,
];

export const MED_BY_ID = Object.fromEntries(MEDS.map((m) => [m.id, m])) as Record<MedId, MedDef>;

// ─── Doses ─────────────────────────────────────────────────────────────────

/** The amount the dose class is judged on: this dose, plus what was given before for a drug judged on its total */
const judgedAmount = (def: MedDef, p: Patient, dose: number) => dose + (def.cumulative ? totalOf(p, def.id) : 0);

export function classifyDose(def: MedDef, p: Patient, dose: number): DoseClass {
  const u = def.usual(p);
  const tol = def.tolerance ?? 0.15;
  const eps = 1e-6;
  const amount = judgedAmount(def, p, dose);
  if (amount > def.max(p) + eps) return 'toxic';
  if (amount < u.low * (1 - tol) - eps) return 'low';
  if (amount > u.high * (1 + tol) + eps) return 'high';
  return 'usual';
}

/** Is the dose given per kilogram (so the picker shows mg/kg)? */
export const PER_KG: Partial<Record<MedId, true>> = {
  diltiazem: true, esmolol: true, procainamide: true, sotalol: true, lidocaine: true, 'sodium-bicarbonate': true, heparin: true, fentanyl: true,
};

export function fmtDose(x: number): string {
  if (x >= 100) return String(Math.round(x));
  if (x >= 10) return String(Math.round(x * 10) / 10);
  return String(Math.round(x * 1000) / 1000);
}

/** "20 mg = 0.25 mg/kg — the usual dose" */
export function describeDose(def: MedDef, p: Patient, dose: number, cls = classifyDose(def, p, dose)): string {
  const perKg = `${fmtDose(dose / p.kg)} ${def.unit}/kg`;
  const u = def.usual(p);
  const usual = u.low === u.high ? `${fmtDose(u.low)} ${def.unit}` : `${fmtDose(u.low)}–${fmtDose(u.high)} ${def.unit}`;
  const what = { low: `below the usual ${usual}`, usual: 'the usual dose', high: `above the usual ${usual}`, toxic: `an overdose (usual ${usual})` }[cls];
  const amount = judgedAmount(def, p, dose);
  const total = amount !== dose ? ` (${fmtDose(amount)} ${def.unit} in all)` : '';
  return `${fmtDose(dose)} ${def.unit}${PER_KG[def.id] ? ` = ${perKg}` : ''}${total} — ${what}`;
}

/** Drugs that block or slow the AV node: in pre-excited AF they send every impulse down the accessory pathway (sotalol is a β-blocker too) */
const NODAL_BLOCKERS: MedId[] = ['adenosine', 'diltiazem', 'metoprolol', 'esmolol', 'sotalol', 'digoxin', 'amiodarone'];
/** Drugs that lengthen the QT further */
const QT_PROLONGING: MedId[] = ['amiodarone', 'procainamide', 'sotalol'];

/**
 * What a drug's own plan, which reads the rhythm by its category, does not see: atrial fibrillation down an accessory
 * pathway (pre-excited AF, the 'af-wpw' profile — 2023 ACC/AHA/ACCP/HRS AF and 2015 ACC/AHA/HRS SVT guidelines) and a
 * long QT outside torsades (QTc 500 ms or more, the 'long-qt' profile — 2017 AHA/ACC/HRS ventricular arrhythmia guideline)
 */
function rhythmCaveats(id: MedId, p: Patient, plan: { verdict: Verdict; steps: EffectStep[] }): { verdict: Verdict; steps: EffectStep[] } {
  const prof = resolveProfile(p.profileId);
  if (prof.hemo === 'no-output') return plan;
  if (prof.pathway) {
    if (NODAL_BLOCKERS.includes(id)) {
      return {
        verdict: bad(`Harmful in pre-excited AF: blocking the AV node sends every impulse down the accessory pathway — the rate climbs and it can degenerate into VF (2023 ACC/AHA/ACCP/HRS AF guideline: adenosine, diltiazem, verapamil, digoxin, IV amiodarone and β-blockers — 3: Harm${id === 'sotalol' ? '; sotalol is a β-blocker' : ''}). Unstable: synchronized cardioversion; stable: cardioversion, or IV procainamide or ibutilide.`),
        steps: [{ at: id === 'adenosine' ? 20 * S : 2 * MIN, hr: rate(p.hr, 1.12, 30, 250), note: 'With the AV node blocked, more impulses race down the pathway: the rate climbs and the complexes widen.', tone: 'warn', mark: 'faster' }],
      };
    }
    if (id === 'procainamide' && plan.verdict.tone !== 'bad') {
      return {
        verdict: good('Stable pre-excited AF: IV procainamide (or ibutilide) slows conduction down the accessory pathway and can convert it (2023 AF guideline); synchronized cardioversion if the patient is unstable or it fails.'),
        // once converted, the sinus beats still come down the pathway: the WPW pattern returns
        steps: plan.steps.map((st) => (st.profile === 'normal-sinus' ? { ...st, profile: 'wpw', note: 'Converted to sinus rhythm — with the delta waves of the pathway (WPW pattern).' } : st)),
      };
    }
    // magnesium slows the AV node a little, which does nothing for impulses that go down the pathway
    if (id === 'magnesium-sulfate' && plan.verdict.tone !== 'bad') {
      return {
        verdict: caution('Not a treatment for pre-excited AF: magnesium acts on the AV node, not the accessory pathway, so it does not slow the ventricles here (it can replace a low level). Unstable: synchronized cardioversion; stable: IV procainamide or ibutilide.'),
        steps: plan.steps.map((st) => (st.hr !== undefined && st.profile === undefined && st.hr < p.hr
          ? { at: st.at, note: 'No change in the ventricular rate: the accessory pathway, not the AV node, sets it.', tone: 'effect' as const }
          : st)),
      };
    }
  }
  if (prof.qtc >= 500 && prof.rhythm !== 'torsades') {
    // a drug that suppresses the PVCs (lidocaine) does not shorten the QT: the tracing keeps its long QT (and the risk)
    const longQtStays = `The QT stays long (QTc about ${prof.qtc} ms): this drug does not shorten it. Magnesium, potassium to 4.0 or more and stopping every QT-prolonging drug are the treatment.`;
    if (plan.steps.some((st) => st.profile !== undefined && st.profile !== prof.id)) {
      return {
        verdict: { ...plan.verdict, text: `${plan.verdict.text} ${longQtStays}` },
        steps: plan.steps.map((st) => (st.profile !== undefined && st.profile !== prof.id ? { ...st, profile: prof.id, note: longQtStays, mark: undefined } : st)),
      };
    }
    if (QT_PROLONGING.includes(id) && plan.verdict.tone !== 'bad') {
      return { verdict: bad(`Not with a long QT (QTc about ${prof.qtc} ms): it lengthens the QT further and can set off torsades de pointes. Magnesium, potassium to 4.0 or more, and stop every QT-prolonging drug.`), steps: plan.steps };
    }
    if (id === 'magnesium-sulfate' && plan.verdict.tone !== 'bad') {
      return { verdict: good(`A long QT (QTc about ${prof.qtc} ms) with PVCs: magnesium 2 g IV suppresses the afterdepolarizations that start torsades (it does not shorten the QT). Correct potassium to 4.0 or more and stop the QT-prolonging drugs.`), steps: plan.steps };
    }
  }
  return plan;
}

type Plan = { verdict: Verdict; steps: EffectStep[] };

const RANK: Record<Verdict['tone'], number> = { good: 0, caution: 1, bad: 2 };
/**
 * The verdict made at least as bad as `tone`, with the reason: first when it raises the tone (it is now the point), after
 * the drug's own verdict when it does not (it is then one more thing to know)
 */
function worse(v: Verdict, tone: Verdict['tone'], reason: string): Verdict {
  return RANK[tone] > RANK[v.tone] ? { tone, text: `${reason} ${v.text}` } : { tone: v.tone, text: `${v.text} ${reason}` };
}
/** one more thing to know, whatever the verdict */
const also = (v: Verdict, text: string): Verdict => ({ ...v, text: `${v.text} ${text}` });
/** one warning on the timeline, without a rate of its own: it shows when the drug's last effect does (a minute at the earliest) */
const warnStep = (steps: EffectStep[], note: string): EffectStep => ({ at: Math.max(60 * S, ...steps.map((st) => st.at)), note, tone: 'warn' });

/** IV β-blockers (sotalol is one too) */
const IV_BETA: MedId[] = ['metoprolol', 'esmolol', 'sotalol'];
const givenOf = (p: Patient, ids: MedId[]) => ids.filter((id) => dosesOf(p, id).length);
const names = (ids: MedId[]) => ids.map((id) => MED_BY_ID[id].name.toLowerCase()).join(' and ');
/** time since the last dose of a drug, in drug time (null without the clock, or before the first dose) */
const sinceLast = (p: Patient, id: MedId): number | null => {
  const doses = dosesOf(p, id);
  return p.now === undefined || !doses.length ? null : p.now - Math.max(...doses.map((g) => g.at));
};
const minutes = (ms: number) => (ms < MIN ? `${Math.round(ms / S)} s` : ms < 2 * 60 * MIN ? `${Math.round(ms / MIN)} min` : `${Math.round(ms / (60 * MIN))} h`);
/** "together or in close proximity (within a few hours)": the diltiazem label's window for an IV β-blocker */
const FEW_HOURS = 4 * 60 * MIN;

/**
 * What a drug's own plan, which looks at this one dose, does not see: the doses of it given before — a regimen that
 * stops (atropine 3 mg, amiodarone 300 + 150 mg in an arrest, two diltiazem boluses), a total past what is safe, and a
 * repeat sooner than the regimen allows (it needs the drug clock, `now`). Each drug's own verdict is kept; this only
 * makes it worse.
 */
function repeatCaveats(id: MedId, p: Patient, dose: number, cls: DoseClass, plan: Plan): Plan {
  const prof = resolveProfile(p.profileId);
  const c = category(prof, p.hr);
  const total = totalOf(p, id) + dose;
  let { verdict } = plan;
  const warns: EffectStep[] = [];
  const since = sinceLast(p, id);
  switch (id) {
    case 'epinephrine':
      // every 3–5 min in an arrest (about every other 2-minute cycle)
      if (prof.hemo === 'no-output' && since !== null && since < 3 * MIN) verdict = worse(verdict, 'caution', `Too soon: the last epinephrine was ${minutes(since)} ago — 1 mg every 3–5 min (about every other 2-minute cycle). Keep compressing.`);
      break;
    case 'atropine':
      if (total > 3 + 1e-6 && totalOf(p, 'atropine') < 3) {
        verdict = worse(verdict, 'caution', `${fmtDose(total)} mg in total — past the 3 mg maximum (full vagal block): more only adds anticholinergic toxicity. Pace, or start an epinephrine infusion.`);
        // on the timeline in every rhythm, not only where the drug's own plan has a rate to show
        warns.push(warnStep(plan.steps, `${fmtDose(total)} mg in total — past the 3 mg maximum (full vagal block): more only adds anticholinergic toxicity.`));
      }
      break;
    case 'diltiazem':
      if (dosesOf(p, 'diltiazem').length >= 2) verdict = worse(verdict, 'caution', 'Two boluses already (0.25, then 0.35 mg/kg): the label does not give a third — start an infusion (5–15 mg/h), or think again about the rhythm.');
      else if (since !== null && since < 15 * MIN) verdict = worse(verdict, 'caution', `Too soon: the last bolus was ${minutes(since)} ago — the label repeats it after 15 min, once the first has had its full effect.`);
      break;
    case 'amiodarone':
      if (c === 'arrest' && dosesOf(p, 'amiodarone').length >= 2) verdict = worse(verdict, 'caution', 'The arrest doses are 300 mg, then 150 mg — both have been given. The algorithm stops there; after ROSC an infusion (1 mg/min) follows.');
      break;
    case 'procainamide':
      if (cls === 'toxic') verdict = worse(verdict, 'bad', `${fmtDose(total / p.kg)} mg/kg in all — past the 17 mg/kg ceiling of the load (label): stop the infusion. Hypotension, a QRS widened by half and torsades come next.`);
      break;
    case 'magnesium-sulfate':
      if (c !== 'torsades' && total > 4 + 1e-6 && cls !== 'toxic') verdict = worse(verdict, 'caution', `${fmtDose(total)} g in all: more than 4 g without torsades risks hypermagnesemia (weakness, hypotension, heart block — worse when the kidneys are poor). Check the level before more.`);
      break;
    case 'sodium-bicarbonate':
      if (dosesOf(p, id).length && total > 2 * p.kg + 1e-6 && cls !== 'toxic') verdict = worse(verdict, 'caution', `${fmtDose(total)} mEq in all — more than 2 mEq/kg: alkalosis, a low potassium and calcium, and a sodium and fluid load. Check a blood gas before more.`);
      break;
    case 'fentanyl':
      if (dosesOf(p, id).length && total > 2 * p.kg + 1e-6 && cls !== 'toxic') verdict = worse(verdict, 'caution', `${fmtDose(total)} mcg in all — more than 2 mcg/kg: respiratory depression and a falling pressure. Watch the breathing, and have naloxone and a bag-mask ready.`);
      break;
    case 'insulin-dextrose':
      // regular insulin IV acts for 4–6 h: a second dose inside that stacks on the first
      if (dosesOf(p, id).length && (since === null || since < 6 * 60 * MIN)) verdict = worse(verdict, 'caution', 'A second dose of insulin: most lows come at 1–3 h, and two doses stack. Recheck the potassium and the glucose first — a repeat is for a potassium still high at the recheck, with more dextrose.');
      break;
    case 'sotalol':
      if (dosesOf(p, id).length) verdict = worse(verdict, 'caution', 'A second IV load: sotalol is loaded once, then given by the kidneys\' clock. Its effect on the QT builds with the level — check the QTc before any more.');
      break;
    default:
      break;
  }
  return { verdict, steps: [...plan.steps, ...warns] };
}

/**
 * What a drug's own plan does not see: the drugs already given — dangerous pairs, a second drug of the same kind, a
 * level that another drug raises. Not in a pulseless patient (the arrest drugs are given together by design). It keeps
 * the plan's own steps and adds one warning to the timeline, without a rate of its own.
 */
function comboCaveats(id: MedId, p: Patient, plan: Plan): Plan {
  const prof = resolveProfile(p.profileId);
  if (prof.hemo === 'no-output') return plan;
  let { verdict } = plan;
  const warns: string[] = [];
  // IV diltiazem and an IV β-blocker: the diltiazem label rules out giving them together or within a few hours, and the
  // esmolol label rules out a cardiodepressant calcium-channel blocker while its effects last
  const ccbThenBeta = IV_BETA.includes(id) && dosesOf(p, 'diltiazem').length > 0;
  const betaThenCcb = id === 'diltiazem' && givenOf(p, IV_BETA).length > 0;
  if (ccbThenBeta || betaThenCcb) {
    // "within a few hours" (diltiazem label): without the drug clock the other drug counts as on board
    const ago = (ccbThenBeta ? sinceLast(p, 'diltiazem') : Math.min(...givenOf(p, IV_BETA).map((x) => sinceLast(p, x) ?? 0))) ?? 0;
    const recent = p.now === undefined || ago < FEW_HOURS;
    const other = ccbThenBeta ? 'IV diltiazem' : `an IV β-blocker (${names(givenOf(p, IV_BETA))})`;
    verdict = recent
      ? worse(verdict, 'bad', `Not on top of ${other}: the diltiazem and esmolol labels rule out giving them together or within a few hours — profound bradycardia, AV block, hypotension, even asystole. More of the same drug, or cardioversion.`)
      : worse(verdict, 'caution', `${other[0].toUpperCase()}${other.slice(1)} ${minutes(ago)} ago: past the few hours the labels ask for, but the two still add AV block and slowing — watch the rate and the pressure.`);
    warns.push('A calcium-channel blocker and a β-blocker together: watch for bradycardia, AV block and a falling pressure.');
  }
  // two antiarrhythmics that lengthen the QT
  const qt = QT_PROLONGING.includes(id) ? givenOf(p, QT_PROLONGING.filter((x) => x !== id)) : [];
  if (qt.length) {
    verdict = worse(verdict, id === 'sotalol' ? 'bad' : 'caution', `${MED_BY_ID[qt[0]].name}${qt.length > 1 ? ` and ${names(qt.slice(1))}` : ''} already given: a second QT-prolonging antiarrhythmic stacks the QT (torsades) — not without expert advice; synchronized cardioversion is the usual next step.`);
    warns.push('Two QT-prolonging drugs on board: watch the QTc.');
  }
  // two β-blockers
  const beta = IV_BETA.includes(id) ? givenOf(p, IV_BETA.filter((x) => x !== id)) : [];
  if (beta.length) {
    verdict = worse(verdict, 'caution', `${MED_BY_ID[beta[0]].name} already given: a second β-blocker on top adds bradycardia and hypotension — titrate one.`);
    warns.push('Two β-blockers on board: watch the rate and the pressure.');
  }
  // digoxin with amiodarone: amiodarone roughly doubles the digoxin level (either order)
  if ((id === 'digoxin' && dosesOf(p, 'amiodarone').length) || (id === 'amiodarone' && dosesOf(p, 'digoxin').length)) {
    verdict = worse(verdict, 'caution', id === 'digoxin'
      ? 'Amiodarone already given: it roughly doubles the digoxin level — halve the digoxin.'
      : 'Digoxin already given: amiodarone roughly doubles its level — halve the digoxin and watch for toxicity.');
    warns.push('Amiodarone and digoxin: watch for slowing, AV block and new ectopy (a rising digoxin level).');
  }
  // calcium in a patient given digoxin (Levine 2011: no excess arrhythmias or deaths in digoxin toxicity)
  if (id === 'calcium-chloride' && dosesOf(p, 'digoxin').length) {
    verdict = worse(verdict, 'caution', 'Digoxin on board: give the calcium slowly (label). The hyperkalemia of digoxin toxicity is treated with digoxin Fab (2023 AHA); calcium is no longer considered contraindicated (Levine 2011).');
    warns.push('Calcium on top of digoxin: watch for ectopy and slowing.');
  }
  // lidocaine after procainamide: two class I drugs
  if (id === 'lidocaine' && dosesOf(p, 'procainamide').length) {
    verdict = worse(verdict, 'caution', 'Procainamide already given: two class I drugs add their toxicity (QRS widening, a falling pressure, seizures).');
    warns.push('Two class I drugs on board: watch the QRS width and the pressure.');
  }
  // text only: the label warning, the unopposed α, the delayed absorption
  if (id === 'adenosine' && dosesOf(p, 'digoxin').length) verdict = also(verdict, 'Digoxin on board: the label reports rare ventricular fibrillation after adenosine with digoxin — have the defibrillator ready.');
  if (id === 'epinephrine' && givenOf(p, IV_BETA).length) verdict = also(verdict, 'A β-blocker on board: epinephrine\'s α effect is unopposed — the pressure can surge, with a reflex slowing.');
  if (P2Y12.includes(id as P2y12) && dosesOf(p, 'fentanyl').length) verdict = also(verdict, 'An opioid has been given: it delays the absorption of the oral load (2025 ACC/AHA ACS).');
  if (!warns.length) return { verdict, steps: plan.steps };
  return { verdict, steps: [...plan.steps, warnStep(plan.steps, warns.join(' '))] };
}

/**
 * What the patient has that the monitor cannot show — the history the learner sets on the page (`Patient.problems`, in
 * the case simulator's words) — and the age. Sources: the US labels, 2025 ACC/AHA ACS (and the 2013 ACCF/AHA STEMI
 * lytic table it keeps), 2023 AF, 2018 bradycardia, 2025 AHA.
 */
const RENAL: Partial<Record<MedId, string>> = {
  'magnesium-sulfate': 'magnesium is cleared by the kidneys and accumulates — a lower dose, and check the level',
  digoxin: 'digoxin is cleared by the kidneys — a smaller dose, and its level rises over days',
  procainamide: 'its active metabolite NAPA accumulates and lengthens the QT — a lower maintenance rate, and watch the QTc',
};
/** a rule's reason for this patient, rhythm, drug and dose (null: the rule has nothing to say here) */
type HistoryText = (p: Patient, c: Category, id: MedId, dose: number) => string | null;
const HISTORY_RULES: { problems: Problem[]; drugs: MedId[]; tone: Verdict['tone']; text: HistoryText }[] = [
  // the airway
  { problems: ['asthma', 'bronchospasm'], drugs: ['adenosine'], tone: 'bad', text: (_p, c) => `Not with asthma or bronchospastic lung disease: adenosine can bring on severe bronchospasm (label).${c === 'svt' ? ' An SVT here: vagal maneuvers, a calcium-channel blocker, or synchronized cardioversion.' : c === 'vt' ? ' A wide-complex tachycardia: synchronized cardioversion, or procainamide or amiodarone if stable.' : ''}` },
  { problems: ['asthma', 'bronchospasm'], drugs: ['sotalol'], tone: 'bad', text: () => 'Contraindicated with asthma or bronchospasm (label): sotalol is a non-selective β-blocker.' },
  { problems: ['asthma', 'bronchospasm'], drugs: ['metoprolol', 'esmolol'], tone: 'caution', text: () => 'Asthma or bronchospasm: a β1-selective blocker only with care, at the smallest dose, watching the breathing — esmolol stops fastest if it tightens.' },
  // a denervated heart; adenosine made stronger
  { problems: ['heart-transplant'], drugs: ['atropine'], tone: 'bad', text: () => 'Not after a heart transplant (2018 ACC/AHA/HRS bradycardia: 3 — Harm): the denervated heart does not respond to atropine, and it can cause high-grade AV block. Pace, or start epinephrine; aminophylline may help.' },
  { problems: ['heart-transplant', 'adenosine-potentiator'], drugs: ['adenosine'], tone: 'caution', text: (p, _c, _id, dose) => (dosesOf(p, 'adenosine').length || dose <= 3 * 1.15 ? null : `${hasProblem(p, 'heart-transplant') ? 'A transplanted heart is supersensitive to adenosine' : 'Dipyridamole or carbamazepine makes adenosine\'s block stronger and longer'}: start at 3 mg (label) — a long asystolic pause otherwise.`) },
  // the vessels
  { problems: ['pde5-inhibitor'], drugs: ['nitroglycerin'], tone: 'bad', text: () => 'Contraindicated (label): a PDE-5 inhibitor within its window (avanafil 12 h, sildenafil or vardenafil 24 h, tadalafil 48 h) or riociguat — together with a nitrate the pressure can fall catastrophically.' },
  { problems: ['sympathomimetic-toxicity'], drugs: ['metoprolol', 'esmolol', 'sotalol'], tone: 'bad', text: () => 'Not in acute cocaine or methamphetamine intoxication (2025 ACC/AHA ACS: 3 — Harm): a β-blocker leaves the α effect unopposed — the pressure and the coronary spasm get worse. Benzodiazepines, then nitroglycerin or a calcium-channel blocker.' },
  // bleeding
  { problems: ['aspirin-allergy'], drugs: ['aspirin'], tone: 'bad', text: () => 'Not with a true aspirin allergy (anaphylaxis, angioedema, aspirin-exacerbated asthma): give a P2Y12 inhibitor alone (2025 ACC/AHA ACS).' },
  { problems: ['bleeding'], drugs: ['aspirin', 'ticagrelor', 'clopidogrel', 'prasugrel', 'heparin', 'tenecteplase'], tone: 'bad', text: () => 'Not with active bleeding: this drug feeds the bleeding (label).' },
  // an intracranial hemorrhage at any time: absolute for lysis (2013 ACCF/AHA STEMI, kept in 2025), a label contraindication
  // for ticagrelor (history of ICH) and prasugrel (prior stroke); for aspirin, clopidogrel and heparin it is the bleed now
  // (Plavix: active pathological bleeding such as ICH) that rules them out, and an old, healed one only raises the risk
  { problems: ['intracranial-hemorrhage'], drugs: ['tenecteplase'], tone: 'bad', text: () => 'Absolutely contraindicated: any prior intracranial hemorrhage (2013 ACCF/AHA STEMI, kept in 2025; label) — however long ago. Transfer for primary PCI.' },
  { problems: ['intracranial-hemorrhage'], drugs: ['ticagrelor'], tone: 'bad', text: () => 'Contraindicated (label): a history of intracranial hemorrhage — ticagrelor raised intracranial bleeding (PLATO). Clopidogrel, once the bleed is old and healed.' },
  { problems: ['intracranial-hemorrhage'], drugs: ['aspirin', 'clopidogrel', 'heparin'], tone: 'caution', text: () => 'A prior intracranial hemorrhage raises the bleeding risk; a recent or active one rules this drug out — ask when, and give the ACS antithrombotics if it is old and healed.' },
  { problems: ['recent-stroke', 'intracranial-risk'], drugs: ['tenecteplase'], tone: 'bad', text: (p) => `Absolutely contraindicated: ${hasProblem(p, 'recent-stroke') ? 'an ischemic stroke within 3 months' : 'an intracranial lesion, or brain or spine surgery or significant head trauma within 3 months'} (2013 ACCF/AHA STEMI, kept in 2025) — the risk of intracranial hemorrhage. Transfer for primary PCI.` },
  { problems: ['recent-stroke', 'prior-stroke', 'stroke', 'intracranial-hemorrhage'], drugs: ['prasugrel'], tone: 'bad', text: (p) => `Contraindicated after any stroke or TIA (label, boxed)${hasProblem(p, 'intracranial-hemorrhage') ? ' — an intracranial hemorrhage is one' : ''}: in TRITON prasugrel caused more intracranial bleeding in these patients. ${hasProblem(p, 'intracranial-hemorrhage') ? 'Clopidogrel, once the bleed is old and healed.' : 'Ticagrelor or clopidogrel.'}` },
  { problems: ['prior-stroke', 'oral-anticoagulant', 'recent-surgery', 'recent-bleeding', 'pregnancy'], drugs: ['tenecteplase'], tone: 'caution', text: (p) => `A relative contraindication (2013 ACCF/AHA STEMI, kept in 2025): ${[
    hasProblem(p, 'prior-stroke') && 'a TIA or a stroke more than 3 months ago',
    hasProblem(p, 'oral-anticoagulant') && 'an oral anticoagulant',
    hasProblem(p, 'recent-surgery') && 'major surgery within 3 weeks',
    hasProblem(p, 'recent-bleeding') && 'internal bleeding within 2–4 weeks or an active ulcer',
    hasProblem(p, 'pregnancy') && 'pregnancy',
  ].filter(Boolean).join(', ')}. Weigh it against the infarct — primary PCI if it can be reached in time.` },
  { problems: ['oral-anticoagulant'], drugs: ['ticagrelor', 'prasugrel'], tone: 'caution', text: () => 'An oral anticoagulant on board: the P2Y12 inhibitor to add is clopidogrel (2025 ACC/AHA ACS) — ticagrelor or prasugrel with an anticoagulant bleeds more.' },
  { problems: ['hit'], drugs: ['heparin'], tone: 'bad', text: () => 'Contraindicated (label): heparin-induced thrombocytopenia — heparin restarts the clotting; use bivalirudin or argatroban.' },
  { problems: ['thrombocytopenia'], drugs: ['heparin'], tone: 'caution', text: (p) => (hasProblem(p, 'hit') ? null : 'Platelets under 100,000: find the cause first (HIT?) — under about 50,000 avoid full-dose anticoagulation; the label rules heparin out in severe thrombocytopenia.') },
  { problems: ['thrombocytopenia'], drugs: ['tenecteplase'], tone: 'bad', text: () => 'Platelets under 100,000: a bleeding diathesis — an absolute contraindication to fibrinolysis (2013 ACCF/AHA STEMI, kept in 2025; TNKase label). Primary PCI.' },
  { problems: ['thrombocytopenia'], drugs: ['aspirin', 'ticagrelor', 'clopidogrel', 'prasugrel'], tone: 'caution', text: () => 'Platelets under 100,000: an antiplatelet adds to the bleeding risk — weigh the count and find the cause; under about 50,000 avoid it.' },
  // the brain: raised intracranial pressure is a nitroglycerin label contraindication; neurosurgery a relative one for heparin
  { problems: ['intracranial-hemorrhage', 'intracranial-risk'], drugs: ['nitroglycerin'], tone: 'caution', text: () => 'Raised intracranial pressure is a label contraindication: no nitrate with an acute intracranial bleed or a recent head injury (an old, healed lesion is no bar).' },
  { problems: ['intracranial-risk'], drugs: ['heparin'], tone: 'caution', text: () => 'An intracranial lesion, or recent brain or spine surgery or head trauma: full anticoagulation is a relative contraindication (label: hemorrhage after surgery of the brain or spinal cord) — weigh it, with the neurosurgeon.' },
  // a preload-dependent heart: a nitrate drops the filling and the pressure
  { problems: ['rv-infarction', 'severe-aortic-stenosis', 'lvot-obstruction'], drugs: ['nitroglycerin'], tone: 'bad', text: (p) => (['aortic-stenosis', 'hcm', 'takotsubo-lvoto'].includes(p.profileId) ? null : `Not with ${[
    hasProblem(p, 'rv-infarction') && 'an RV infarction (2025 ACC/AHA ACS)',
    hasProblem(p, 'severe-aortic-stenosis') && 'severe aortic stenosis (2020 ACC/AHA valve)',
    hasProblem(p, 'lvot-obstruction') && 'dynamic LV outflow obstruction (2024 AHA/ACC HCM)',
  ].filter(Boolean).join(' or ')}: a preload-dependent heart — a nitrate drops the filling, and the pressure can collapse. Fluid if the pressure is low; an opioid in small doses for the pain.`) },
  { problems: ['rv-infarction'], drugs: ['fentanyl'], tone: 'caution', text: (p) => (lowBP(p, resolveProfile(p.profileId)) ? null : 'RV infarction: a preload-dependent heart — an opioid can drop the pressure. Small titrated doses, with fluid ready.') },
  // dynamic LV outflow obstruction: a catecholamine worsens it (in an arrest epinephrine is still the arrest drug)
  { problems: ['lvot-obstruction'], drugs: ['epinephrine'], tone: 'bad', text: (p, c) => (c === 'arrest' || c === 'torsades' || outflowObstructed(resolveProfile(p.profileId)) ? null : 'Not with dynamic LV outflow obstruction (obstructive HCM, Takotsubo with LVOTO): epinephrine makes the ventricle squeeze harder and faster, and the obstruction worse — the pressure falls further. Fluid and phenylephrine (2024 AHA/ACC HCM).') },
  // digoxin toxicity
  { problems: ['digoxin-toxicity'], drugs: ['digoxin'], tone: 'bad', text: () => 'Not with digoxin toxicity: more digoxin feeds it (label). Digoxin Fab is the treatment for a dangerous arrhythmia or a high potassium (2023 AHA); correct the potassium and magnesium.' },
  { problems: ['digoxin-toxicity'], drugs: ['calcium-chloride'], tone: 'caution', text: () => 'Digoxin toxicity: digoxin Fab treats its hyperkalemia (2023 AHA). The calcium label still lists digitalis toxicity; the evidence (Levine 2011) found no harm — if calcium is needed, give it slowly.' },
  // the pump
  { problems: ['heart-failure'], drugs: ['diltiazem'], tone: 'bad', text: (_, c) => (['af', 'flutter', 'svt'].includes(c) ? 'Not with HFrEF (2023 ACC/AHA/ACCP/HRS AF: IV non-dihydropyridine calcium-channel blockers — 3: Harm): a negative inotrope can tip the failing ventricle into shock. A β-blocker if compensated, amiodarone or digoxin; cardiovert if unstable.' : null) },
  { problems: ['heart-failure'], drugs: ['diltiazem'], tone: 'caution', text: (_, c) => (['af', 'flutter', 'svt'].includes(c) ? null : 'HFrEF: diltiazem is a negative inotrope — avoided in a failing ventricle.') },
  { problems: ['heart-failure'], drugs: ['procainamide'], tone: 'bad', text: () => 'Avoid in heart failure (AHA): procainamide depresses the heart and drops the pressure. Amiodarone, or synchronized cardioversion.' },
  { problems: ['lupus'], drugs: ['procainamide'], tone: 'bad', text: () => 'Contraindicated (label): systemic lupus erythematosus — procainamide can worsen it (drug-induced lupus). Amiodarone, or synchronized cardioversion.' },
  { problems: ['heart-failure'], drugs: ['sotalol'], tone: 'bad', text: () => 'Not with heart failure (label: decompensated failure, cardiogenic shock): sotalol is a β-blocker that lengthens the QT.' },
  { problems: ['heart-failure'], drugs: ['metoprolol', 'esmolol'], tone: 'caution', text: () => 'HFrEF: a β-blocker only while the failure is compensated (no wet lungs, no low output) — never in decompensated failure or shock.' },
  // the kidneys and the potassium
  { problems: ['renal-failure', 'dialysis'], drugs: ['magnesium-sulfate', 'digoxin', 'procainamide'], tone: 'caution', text: (p, _, id) => `${hasProblem(p, 'dialysis') ? 'On dialysis' : 'Kidney failure'}: ${RENAL[id]}.` },
  { problems: ['renal-failure', 'dialysis'], drugs: ['sotalol'], tone: 'bad', text: (_p, c) => (c === 'af' || c === 'flutter' ? 'Not for AF or flutter with kidney failure: the sotalol label rules it out below a creatinine clearance of 40 mL/min — it is cleared by the kidneys, and its level (and the QT) climbs.' : null) },
  { problems: ['renal-failure', 'dialysis'], drugs: ['sotalol'], tone: 'caution', text: (_p, c) => (c === 'af' || c === 'flutter' ? null : 'Kidney failure: sotalol is cleared by the kidneys — a longer dosing interval by the creatinine clearance (label), with QTc monitoring; and it is no longer in the 2025 AHA tachycardia algorithm.') },
  { problems: ['renal-failure', 'dialysis'], drugs: ['insulin-dextrose'], tone: 'caution', text: (_p, _c, _id, dose) => (dose > 5 * 1.15 ? 'Kidney failure: 5 units, not 10 — insulin is cleared by the kidneys, and hypoglycemia is much more likely.' : null) },
  { problems: ['hypokalemia'], drugs: ['sotalol'], tone: 'bad', text: () => 'Not with a potassium below 4 mEq/L (label): a low potassium and sotalol together set off torsades. Correct the potassium and magnesium first.' },
  { problems: ['hypokalemia'], drugs: ['digoxin'], tone: 'caution', text: () => 'A low potassium makes digoxin toxicity more likely (arrhythmias at a "normal" level): correct it first.' },
  // (sotalol's own plan reads the long QT in the history, with its torsades step)
  { problems: ['long-qt'], drugs: ['amiodarone', 'procainamide'], tone: 'bad', text: (p) => (resolveProfile(p.profileId).hemo === 'no-output' ? null : 'Not with a long QT: it lengthens the QT further and can set off torsades de pointes. Magnesium, potassium to 4.0 or more, stop every QT-prolonging drug; lidocaine or synchronized cardioversion for a VT.') },
  { problems: ['long-qt'], drugs: ['amiodarone', 'procainamide'], tone: 'caution', text: (p) => (resolveProfile(p.profileId).hemo === 'no-output' ? 'A long QT: for shock-refractory VF or pulseless VT, lidocaine is the better choice (it does not lengthen the QT); magnesium; keep defibrillating.' : null) },
];

/**
 * The history the learner can set on the Give-meds page (Patient.problems), in plain words: every item is one the drugs
 * above read. The words are the case simulator's (Problem), so a case and this page mean the same thing by them.
 */
export const HISTORY: readonly { id: Problem; label: string }[] = [
  { id: 'asthma', label: 'Asthma / bronchospastic lung disease' },
  { id: 'bronchospasm', label: 'Wheezing now' },
  { id: 'heart-failure', label: 'HFrEF' },
  { id: 'renal-failure', label: 'Kidney failure' },
  { id: 'dialysis', label: 'On dialysis' },
  { id: 'hypokalemia', label: 'Low potassium' },
  { id: 'long-qt', label: 'Long QT' },
  { id: 'heart-transplant', label: 'Heart transplant' },
  { id: 'adenosine-potentiator', label: 'Dipyridamole / carbamazepine' },
  { id: 'pde5-inhibitor', label: 'PDE-5 inhibitor / riociguat' },
  { id: 'sympathomimetic-toxicity', label: 'Cocaine / meth now' },
  { id: 'aspirin-allergy', label: 'Aspirin allergy' },
  { id: 'bleeding', label: 'Active bleeding' },
  { id: 'intracranial-hemorrhage', label: 'Brain bleed (ever)' },
  { id: 'recent-stroke', label: 'Ischemic stroke < 3 months' },
  { id: 'prior-stroke', label: 'TIA, or stroke > 3 months' },
  { id: 'intracranial-risk', label: 'Brain lesion, head trauma or neurosurgery' },
  { id: 'oral-anticoagulant', label: 'Oral anticoagulant' },
  { id: 'recent-surgery', label: 'Major surgery < 3 weeks' },
  { id: 'recent-bleeding', label: 'Internal bleeding < 4 weeks' },
  { id: 'pregnancy', label: 'Pregnancy' },
  { id: 'hit', label: 'HIT' },
  { id: 'thrombocytopenia', label: 'Low platelets (< 100,000)' },
  { id: 'rv-infarction', label: 'RV infarction (V4R)' },
  { id: 'severe-aortic-stenosis', label: 'Severe aortic stenosis' },
  { id: 'lvot-obstruction', label: 'LV outflow obstruction (HCM, Takotsubo)' },
  { id: 'digoxin-toxicity', label: 'Digoxin toxicity' },
  { id: 'lupus', label: 'Lupus (SLE)' },
];

function historyCaveats(id: MedId, p: Patient, dose: number, plan: Plan): Plan {
  if (!p.problems?.length && p.age === undefined) return plan;
  const c = category(resolveProfile(p.profileId), p.hr);
  let { verdict } = plan;
  for (const rule of HISTORY_RULES) {
    if (!rule.drugs.includes(id) || !hasProblem(p, ...rule.problems)) continue;
    const text = rule.text(p, c, id, dose);
    if (text) verdict = worse(verdict, rule.tone, text);
  }
  // the age
  if (id === 'prasugrel' && elderly(p)) verdict = worse(verdict, 'caution', `At ${p.age}: prasugrel is generally not recommended from 75 (boxed warning — fatal and intracranial bleeding, no net benefit) except with diabetes or a prior MI. Ticagrelor or clopidogrel.`);
  return { verdict, steps: plan.steps };
}

/** Everything that happens when this dose is given to this patient now */
export function planDose(id: MedId, p: Patient, dose: number): DosePlan {
  const def = MED_BY_ID[id];
  const doseClass = classifyDose(def, p, dose);
  const own = rhythmCaveats(id, p, def.plan(p, dose, doseClass));
  const { verdict, steps } = historyCaveats(id, p, dose, comboCaveats(id, p, repeatCaveats(id, p, dose, doseClass, own)));
  return { doseClass, doseText: describeDose(def, p, dose, doseClass), verdict, steps: [...steps].sort((a, b) => a.at - b.at) };
}
