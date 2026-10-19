/**
 * Give a medication in the Learn view and watch what it does to the live 12-lead.
 *
 * For each drug: how it is given, the usual adult dose for this patient's weight, and — for the rhythm on
 * the monitor at the moment it is pushed — a timeline of what the ECG shows (rhythm changes, rate changes and
 * interval changes such as a longer PR or a wider QRS) with a note for each step, plus a verdict on the
 * choice of drug and dose. Pure and deterministic: the same push on the same rhythm always plays out the same
 * way, showing the classic expected response (the notes say where real patients often differ).
 *
 * Doses follow the drug cards in the Library (AHA ACLS 2020 with the 2023 focused updates; ACC/AHA/HRS SVT
 * 2015 and AF 2023 guidelines). Educational only — always follow current guidelines and local protocols.
 */
import { resolveProfile, type ECGProfile } from '@/lib/ecg/profiles';
import type { RhythmMods } from '@/lib/ecg/mods';
import type { MedicationId } from '@/types/content';

export type MedId = Extract<MedicationId,
  | 'adenosine' | 'diltiazem' | 'metoprolol' | 'esmolol' | 'amiodarone' | 'procainamide' | 'lidocaine' | 'digoxin'
  | 'atropine' | 'epinephrine' | 'magnesium-sulfate' | 'calcium-chloride' | 'sodium-bicarbonate'
  | 'tenecteplase' | 'heparin' | 'nitroglycerin' | 'fentanyl' | 'phenylephrine'>;

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
  /** what the drug does to this rhythm; `cls` is the dose class */
  plan(p: Patient, dose: number, cls: DoseClass): { verdict: Verdict; steps: EffectStep[] };
}

export const MED_GROUPS = ['Antiarrhythmics & rate control', 'Bradycardia & arrest', 'Electrolytes', 'Coronary care & other'] as const;

// ─── Rhythm categories ─────────────────────────────────────────────────────

export type Category =
  | 'arrest' | 'torsades' | 'svt' | 'af' | 'flutter' | 'vt' | 'brady' | 'junctional' | 'avb1' | 'wenckebach'
  | 'mobitz2' | 'chb' | 'paced' | 'sinus-tach' | 'pvcs' | 'hyperk' | 'stemi' | 'sinus';

const STEMI = new Set(['anterior-stemi', 'inferior-stemi', 'lateral-stemi', 'inferior-stemi-chb']);
/** sinus tachycardia that is a response to something else (shock, PE, tamponade, pericarditis…) */
const COMPENSATORY = new Set(['sinus-tachycardia', 'cardiogenic-shock', 'pulmonary-embolism', 'tamponade', 'pericarditis', 'aortic-dissection']);

export function category(p: ECGProfile): Category {
  if (p.rhythm === 'torsades') return 'torsades';
  if (p.hemo === 'no-output') return 'arrest';
  if (p.id === 'hyperkalemia') return 'hyperk';
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
    default:
      if (p.id === 'sinus-bradycardia') return 'brady';
      if (p.id === 'first-degree-avb') return 'avb1';
      if (COMPENSATORY.has(p.id)) return 'sinus-tach';
      return 'sinus';
  }
}

const BRADY: Category[] = ['brady', 'junctional', 'avb1', 'wenckebach', 'mobitz2', 'chb'];
const isBrady = (c: Category) => BRADY.includes(c);
/** heart failure or shock: negative inotropes are dangerous */
const failing = (p: ECGProfile) => p.hemo === 'hfref' || p.hemo === 'shock';

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
  guide: '6 mg rapid IV push + 20 mL flush; if no conversion in 1–2 min, 12 mg (a second 12 mg in some protocols). 3 mg via a central line, after heart transplant, or with dipyridamole / carbamazepine.',
  usual: (p) => (dosesOf(p, 'adenosine').length ? { low: 12, high: 12 } : { low: 6, high: 6 }),
  max: () => 18,
  picks: () => [3, 6, 12, 18],
  step: 1,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof);
    const arrive = 12 * S;
    const pause = cls === 'toxic' ? 9 * S : cls === 'high' ? 6 * S : dose >= 12 ? 4 * S : 3 * S;
    const total = totalOf(p, 'adenosine') + dose;
    const flush: EffectStep = { at: arrive - 2500, note: 'Flushing, chest tightness, a feeling of doom — warn the patient first: it passes in seconds.', tone: 'info' };
    const big: EffectStep[] = cls === 'high' || cls === 'toxic'
      ? [{ at: arrive + 1500, note: `${dose} mg is more than the usual maximum single dose (12 mg): a longer pause, and bronchospasm in asthma.`, tone: 'warn' }]
      : [];
    if (c === 'arrest' || c === 'torsades') {
      return { verdict: bad('Adenosine has no place in cardiac arrest: CPR, defibrillate a shockable rhythm, epinephrine.'), steps: noEcg(arrive, 'No effect on the arrest rhythm.') };
    }
    if (total > 30) {
      return { verdict: caution('More adenosine is unlikely to help after 6 + 12 + 12 mg: think again about the rhythm, and about a calcium-channel blocker, a β-blocker or cardioversion.'), steps: noEcg(arrive, 'No further effect.') };
    }
    switch (c) {
      case 'svt':
        if (cls === 'low') {
          return {
            verdict: good('The right drug for a regular narrow-complex tachycardia (AVNRT) after vagal manoeuvres — but too little of it.'),
            steps: [
              flush,
              { at: arrive, hr: rate(p.hr, 0.85), note: 'A flicker of slowing — too little adenosine reached the AV node.', tone: 'effect' },
              { at: arrive + 2500, hr: p.hr, note: `SVT carries on. Below 6 mg a peripheral dose rarely works (3 mg is for a central line). Give 12 mg.`, tone: 'warn' },
            ],
          };
        }
        return {
          verdict: good('Indicated: regular narrow-complex SVT (AVNRT) that vagal manoeuvres did not stop. Adenosine blocks the AV node for a few seconds and breaks the re-entry circuit (6 mg converts most; 12 mg if not).'),
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
          verdict: caution('VT does not involve the AV node, so adenosine does not stop it (it is only a diagnostic option for a regular, monomorphic wide-complex tachycardia). Use procainamide or amiodarone, or synchronised cardioversion if unstable.'),
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
  guide: '0.25 mg/kg actual body weight (≈15–20 mg) IV over 2 min; if not enough after 15 min, 0.35 mg/kg (≈20–25 mg). Infusion 5–15 mg/h.',
  usual: (p) => (dosesOf(p, 'diltiazem').length ? { low: 0.3 * p.kg, high: 0.4 * p.kg } : { low: 0.2 * p.kg, high: 0.3 * p.kg }),
  max: (p) => Math.max(35, 0.45 * p.kg),
  picks: (p) => uniq([5, round(0.15 * p.kg, 2.5), round(0.25 * p.kg, 2.5), round(0.35 * p.kg, 2.5), round(0.6 * p.kg, 5)]),
  step: 2.5,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof);
    const f = { low: 0.92, usual: 0.68, high: 0.55, toxic: 0.42 }[cls];
    const prAdd = { low: 10, usual: 30, high: 50, toxic: 90 }[cls];
    const hypo: EffectStep[] = cls === 'high' || cls === 'toxic'
      ? [{ at: 4 * MIN, note: 'Blood pressure falling: too much calcium-channel blocker. Fluids; calcium chloride reverses it; pace if needed.', tone: 'warn' }]
      : [];
    if (c === 'arrest' || c === 'torsades') return { verdict: bad('Not an arrest drug.'), steps: noEcg(2 * MIN, 'No effect on the arrest rhythm.') };
    const failingNote = failing(prof) ? ' This patient has a failing ventricle — diltiazem is a negative inotrope and can tip them into shock.' : '';
    switch (c) {
      case 'af':
      case 'flutter':
        return {
          verdict: failing(prof)
            ? caution(`Rate control works, but avoid diltiazem in decompensated HFrEF or hypotension.${failingNote}`)
            : good(`Rate control for ${c === 'af' ? 'AF' : 'atrial flutter'}: a non-dihydropyridine calcium-channel blocker slows AV-nodal conduction (avoid in HFrEF, hypotension and pre-excitation). Goal: resting rate < 110.`),
          steps: [
            { at: 2 * MIN, hr: rate(p.hr, (1 + f) / 2, 40), note: `The ventricular rate begins to fall${c === 'flutter' ? ' — in flutter it steps down as the conduction ratio changes (2:1 → 3:1 → 4:1)' : ''}.`, tone: 'effect', mark: 'slowing' },
            { at: 5 * MIN, hr: rate(p.hr, f, 40), note: cls === 'low' ? 'Only a small fall in rate: the dose was below 0.25 mg/kg.' : 'Rate controlled. The atria are still in AF/flutter — rate control does not restore sinus rhythm.', tone: cls === 'low' ? 'warn' : 'good', mark: 'rate ↓' },
            ...hypo,
          ],
        };
      case 'svt':
        if (cls === 'low') {
          return {
            verdict: good('A calcium-channel blocker terminates most AVNRT when adenosine fails or the SVT keeps recurring — but the dose was low.'),
            steps: [{ at: 4 * MIN, hr: rate(p.hr, 0.9), note: 'The SVT slows a little but carries on: give 0.25 mg/kg.', tone: 'warn' }],
          };
        }
        return {
          verdict: good(`Second line for AVNRT (after vagal manoeuvres and adenosine): a calcium-channel blocker terminates most by blocking the AV node.${failingNote}`),
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
      default:
        if (isBrady(c)) return { verdict: bad('Not indicated: diltiazem slows the sinus node and the AV node — it worsens bradycardia and AV block.'), steps: slowsBrady(p, prof, c, 3 * MIN, 0.8, prAdd + 20) };
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
  route: 'IV over 1–2 min; may repeat every 5 min',
  verb: 'Give',
  onset: 'Starts in 2–5 min (peak ~20 min)',
  guide: '2.5–5 mg IV over 2 min, repeated every 5 min to a maximum of 15 mg. Avoid in decompensated heart failure, shock, bradycardia / heart block and bronchospasm.',
  usual: () => ({ low: 2.5, high: 5 }),
  max: () => 10,
  picks: () => [2.5, 5, 10, 15],
  step: 2.5,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof);
    const total = totalOf(p, 'metoprolol') + dose;
    const f = Math.min(total / 15, 1.4);
    const over: EffectStep[] = total > 15 ? [{ at: 3 * MIN, note: `${total} mg in total — above the 15 mg maximum: bradycardia, hypotension, heart block.`, tone: 'warn' }] : [];
    const mods: RhythmMods = { prAdd: Math.round(10 * f) };
    if (c === 'arrest' || c === 'torsades') return { verdict: bad('Not an arrest drug.'), steps: noEcg(2 * MIN, 'No effect on the arrest rhythm.') };
    if (failing(prof)) {
      return {
        verdict: bad('Dangerous here: a β-blocker is a negative inotrope — in decompensated heart failure or shock it can cause collapse.'),
        steps: [{ at: 3 * MIN, hr: rate(p.hr, 1 - 0.15 * f), mods, note: 'The rate falls — and so does the cardiac output.', tone: 'warn' }, ...over],
      };
    }
    switch (c) {
      case 'af':
      case 'flutter':
        return {
          verdict: good('Rate control: β-blockers slow AV-nodal conduction (avoid in decompensated HF, hypotension, bronchospasm and pre-excitation).'),
          steps: [{ at: 3 * MIN, hr: rate(p.hr, 1 - 0.3 * f, 45), note: `Ventricular rate slowing (${total} mg given so far; up to 15 mg in 5 mg steps).`, tone: 'effect', mark: 'rate ↓' }, ...over],
        };
      case 'svt':
        return total >= 10
          ? { verdict: caution('β-blockers are second line for AVNRT — they terminate it less reliably than adenosine or a calcium-channel blocker.'), steps: [{ at: 4 * MIN, profile: 'normal-sinus', hr: 86, mods, note: 'SVT terminated: sinus rhythm.', tone: 'good', mark: 'sinus' }, ...over] }
          : { verdict: caution('β-blockers are second line for AVNRT — adenosine or a calcium-channel blocker works more reliably.'), steps: [{ at: 4 * MIN, hr: rate(p.hr, 1 - 0.08 * f), note: 'The SVT slows slightly but carries on.', tone: 'effect' }] };
      case 'vt':
        return { verdict: caution('β-blockers help prevent recurrent (ischaemic) VT, but rarely stop sustained VT: procainamide, amiodarone or synchronised cardioversion.'), steps: noEcg(3 * MIN, 'VT carries on.') };
      case 'sinus-tach':
        return { verdict: bad('Usually wrong: sinus tachycardia is compensating for something (bleeding, sepsis, PE, tamponade, low output) — slowing it can cause collapse. Treat the cause.'), steps: [{ at: 3 * MIN, hr: rate(p.hr, 1 - 0.25 * f), mods, note: 'The sinus rate falls.', tone: 'effect', mark: 'rate ↓' }, ...over] };
      case 'stemi':
        return { verdict: caution('IV β-blocker in acute MI only for hypertension or ongoing ischaemia with tachycardia, and never with signs of heart failure, low output, shock risk or AV block. Oral β-blockade within 24 h is the routine.'), steps: [{ at: 3 * MIN, hr: rate(p.hr, 1 - 0.18 * f), mods, note: 'The sinus rate falls and the PR lengthens slightly.', tone: 'effect', mark: 'rate ↓' }, ...over] };
      case 'paced':
        return { verdict: bad('No indication.'), steps: noEcg(3 * MIN, 'No change: the pacemaker sets the rate.') };
      default:
        if (isBrady(c)) return { verdict: bad('Not indicated: β-blockers worsen bradycardia and AV block.'), steps: slowsBrady(p, prof, c, 3 * MIN, 0.8, 40) };
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
  guide: 'Load 500 mcg/kg (0.5 mg/kg) IV over 1 min, then 50 mcg/kg/min, increasing by 50 every ~4 min (usual max ~200).',
  usual: (p) => ({ low: 0.4 * p.kg, high: 0.5 * p.kg }),
  max: (p) => 1 * p.kg,
  picks: (p) => uniq([round(0.25 * p.kg, 5), round(0.5 * p.kg, 5), round(1.2 * p.kg, 10)]),
  step: 5,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof);
    const f = Math.min(dose / (0.5 * p.kg), 2);
    if (c === 'arrest' || c === 'torsades') return { verdict: bad('Not an arrest drug.'), steps: noEcg(90 * S, 'No effect on the arrest rhythm.') };
    const warn: EffectStep[] = cls === 'toxic' ? [{ at: 2 * MIN, note: 'Overdose: profound bradycardia and hypotension — stop the infusion (it wears off in minutes).', tone: 'warn' }] : [];
    if (failing(prof)) return { verdict: bad('Dangerous in decompensated heart failure or shock (negative inotrope) — though esmolol wears off fastest of the β-blockers.'), steps: [{ at: 90 * S, hr: rate(p.hr, 1 - 0.15 * f), note: 'The rate falls — and so does the output.', tone: 'warn' }, ...warn] };
    switch (c) {
      case 'af':
      case 'flutter':
        return { verdict: good('Rate control with a short-acting β-blocker — useful when you may need to stop quickly (e.g. after surgery).'), steps: [{ at: 90 * S, hr: rate(p.hr, 1 - 0.22 * f, 45), note: 'The ventricular rate falls within a couple of minutes.', tone: 'effect', mark: 'rate ↓' }, ...warn] };
      case 'svt':
        return { verdict: caution('Second line for AVNRT; adenosine or a calcium-channel blocker is more reliable.'), steps: [{ at: 90 * S, hr: rate(p.hr, 1 - 0.1 * f), note: 'The SVT slows but carries on.', tone: 'effect' }, ...warn] };
      case 'vt':
        return { verdict: caution('β-blockade helps in VT storm, but rarely stops sustained VT.'), steps: noEcg(90 * S, 'VT carries on.') };
      default:
        if (isBrady(c)) return { verdict: bad('Not indicated: worsens bradycardia and AV block.'), steps: slowsBrady(p, prof, c, 90 * S, 0.8, 40) };
        return {
          verdict: c === 'sinus-tach' ? bad('Usually wrong: sinus tachycardia is compensating for something — treat the cause.') : c === 'stemi' ? caution('Short-acting β-blockade in MI only without heart failure, low output or AV block.') : bad('No indication in this rhythm.'),
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
  guide: 'VF / pulseless VT: 300 mg IV/IO push, then 150 mg. Stable VT and other uses: 150 mg IV over 10 min (repeat as needed), then 1 mg/min.',
  usual: (p) => (category(resolveProfile(p.profileId)) === 'arrest' ? (dosesOf(p, 'amiodarone').length ? { low: 150, high: 150 } : { low: 300, high: 300 }) : { low: 150, high: 150 }),
  max: (p) => (category(resolveProfile(p.profileId)) === 'arrest' ? 450 : 300),
  picks: () => [150, 300, 450],
  step: 50,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof);
    const mods: RhythmMods = { qtcAdd: 25, prAdd: 15 };
    const fast: EffectStep[] = cls === 'high' || cls === 'toxic' ? [{ at: 3 * MIN, note: `${dose} mg at once in a patient with a pulse: hypotension and bradycardia — give 150 mg over 10 min.`, tone: 'warn' }] : [];
    switch (c) {
      case 'arrest':
        return prof.rhythm === 'vf' || prof.rhythm === 'vt'
          ? { verdict: good('Refractory VF / pulseless VT: amiodarone after the third shock (300 mg, then 150 mg).'), steps: noEcg(30 * S, 'No visible change: amiodarone does not convert VF by itself — it makes the next shock more likely to work. Defibrillate and continue CPR.') }
          : { verdict: bad('No role in asystole or PEA: CPR, epinephrine, find the cause.'), steps: noEcg(30 * S, 'No change.') };
      case 'torsades':
        return { verdict: bad('Avoid in torsades: amiodarone prolongs the QT. Magnesium, defibrillate if pulseless, stop QT-prolonging drugs.'), steps: [{ at: 30 * S, mods: { qtcAdd: 30 }, note: 'No improvement — and the QT gets longer.', tone: 'warn' }] };
      case 'vt':
        if (cls === 'low') return { verdict: good('For stable monomorphic VT (and VT with structural heart disease) — but the dose was low.'), steps: [{ at: 8 * MIN, hr: rate(p.hr, 0.9), mods, note: 'VT slows slightly but carries on: give 150 mg over 10 min.', tone: 'warn' }] };
        return {
          verdict: good('Stable monomorphic VT: amiodarone 150 mg over 10 min (in trials it terminates only about a third — procainamide does better; synchronised cardioversion if it fails or the patient becomes unstable).'),
          steps: [
            { at: 5 * MIN, hr: rate(p.hr, 0.88), mods, note: 'VT slowing.', tone: 'effect', mark: 'slower' },
            ...fast,
            { at: 12 * MIN, profile: 'normal-sinus', hr: 82, note: 'VT terminated: sinus rhythm, with a slightly longer PR and QT (amiodarone on board).', tone: 'good', mark: 'sinus' },
          ],
        };
      case 'af':
      case 'flutter':
        return {
          verdict: caution('Rate control in heart failure or critical illness when other drugs are unsafe — but it can convert to sinus rhythm: think about anticoagulation if the arrhythmia is > 48 h old.'),
          steps: [{ at: 10 * MIN, hr: rate(p.hr, 0.8, 50), mods, note: 'The ventricular rate falls; the PR / QT lengthen slightly.', tone: 'effect', mark: 'rate ↓' }, ...fast],
        };
      case 'svt':
        return { verdict: caution('Not a first-line SVT drug — vagal manoeuvres, adenosine, then a calcium-channel blocker or β-blocker.'), steps: [{ at: 10 * MIN, profile: 'normal-sinus', hr: 88, mods, note: 'SVT terminated: sinus rhythm.', tone: 'good', mark: 'sinus' }, ...fast] };
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
  max: (p) => 20 * p.kg,
  picks: (p) => uniq([round(5 * p.kg, 100), round(12 * p.kg, 100), round(17 * p.kg, 50), round(25 * p.kg, 100)]),
  step: 50,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof);
    const T = Math.max(3 * MIN, (dose / 30) * MIN);
    const perKg = dose / p.kg;
    const m = (frac: number): RhythmMods => ({ qrsWiden: 1 + 0.3 * ((perKg * frac) / 17), qtcAdd: Math.round(60 * ((perKg * frac) / 17)) });
    const widening: EffectStep[] = [
      { at: T / 3, mods: m(1 / 3), note: 'The QRS starts to widen and the QT to lengthen (sodium- and potassium-channel block).', tone: 'effect', mark: 'QRS ↑' },
      { at: (2 * T) / 3, mods: m(2 / 3), note: 'QRS and QT longer still — watch both, and the blood pressure.', tone: 'effect' },
      { at: T, mods: m(1), note: `Loading infusion finished (${Math.round(perKg)} mg/kg).`, tone: 'info' },
    ];
    const toxic: EffectStep[] = cls === 'toxic' ? [
      { at: T + 5 * S, note: 'QRS widened by more than 50% and the QT is very long: stop the infusion (hypotension, torsades risk).', tone: 'warn' },
      { at: T + 40 * S, profile: 'torsades', note: 'Torsades de pointes — procainamide toxicity. Defibrillate if pulseless; magnesium.', tone: 'warn', mark: 'torsades' },
    ] : [];
    if (c === 'arrest') return { verdict: bad('Not used in cardiac arrest (too slow to load).'), steps: noEcg(T / 3, 'No change.') };
    if (c === 'torsades') return { verdict: bad('Dangerous: procainamide prolongs the QT and worsens torsades. Magnesium; defibrillate if pulseless.'), steps: widening };
    switch (c) {
      case 'vt':
        if (cls === 'low') return { verdict: good('Stable monomorphic VT — but load to 10–17 mg/kg.'), steps: [...widening, { at: T + 10 * S, hr: rate(p.hr, 0.85), note: 'VT slows but carries on: the loading dose was too small.', tone: 'warn' }] };
        return {
          verdict: good(`Stable monomorphic VT: procainamide terminates more VT than amiodarone (PROCAMIO). Avoid in long QT and heart failure.${failing(prof) ? ' This patient is hypotensive — synchronised cardioversion is safer.' : ''}`),
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
      default:
        return { verdict: bad('No indication in this rhythm — you will only see the QRS widen and the QT lengthen.'), steps: [...widening, ...toxic] };
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
  guide: '1–1.5 mg/kg IV/IO, then 0.5–0.75 mg/kg every 5–10 min, to a maximum of 3 mg/kg. Infusion 1–4 mg/min.',
  usual: (p) => (dosesOf(p, 'lidocaine').length ? { low: 0.5 * p.kg, high: 0.75 * p.kg } : { low: 1 * p.kg, high: 1.5 * p.kg }),
  max: (p) => 2 * p.kg,
  picks: (p) => uniq([round(0.5 * p.kg, 10), round(1 * p.kg, 10), round(1.5 * p.kg, 10), round(3 * p.kg, 10)]),
  step: 10,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof);
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
        return { verdict: caution('Not the treatment for torsades — magnesium, defibrillate if pulseless, overdrive pacing.'), steps: noEcg(60 * S, 'No change.') };
      case 'vt':
        return {
          verdict: caution('Lidocaine stops only about 1 in 5 stable monomorphic VTs (it works best in ischaemic VT): procainamide or amiodarone, or synchronised cardioversion.'),
          steps: [{ at: 2 * MIN, hr: rate(p.hr, 0.9), note: 'VT slows slightly but carries on.', tone: 'effect' }, ...tox],
        };
      case 'pvcs':
        return {
          verdict: caution('It suppresses ventricular ectopy, but routine suppression of PVCs is not recommended — find the cause (ischaemia, K⁺, Mg²⁺, drugs).'),
          steps: [{ at: 90 * S, profile: 'normal-sinus', hr: p.hr, note: 'PVCs suppressed: sinus rhythm.', tone: 'effect', mark: 'no PVCs' }, ...tox],
        };
      default:
        return { verdict: bad('No indication: lidocaine (class IB) acts on ventricular tissue — no effect on sinus, atrial or AV-nodal rhythms.'), steps: [...noEcg(2 * MIN, 'No visible change.'), ...tox] };
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
  guide: 'AF rate control: 0.25–0.5 mg IV, then 0.25 mg every ~6 h (max ~1.5 mg in 24 h); less in renal impairment and the elderly.',
  usual: () => ({ low: 0.25, high: 0.5 }),
  max: () => 1,
  picks: () => [0.125, 0.25, 0.5, 1.5],
  step: 0.125,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof);
    const total = totalOf(p, 'digoxin') + dose;
    const effect: RhythmMods = { scoop: 0.07, tScale: 0.6, qtcAdd: -25, prAdd: 20 };
    const toxic = cls === 'toxic' || total > 1.5;
    if (c === 'arrest' || c === 'torsades') return { verdict: bad('Not an arrest drug.'), steps: noEcg(30 * MIN, 'No change.') };
    if (toxic) {
      return {
        verdict: bad(`${total} mg is a toxic load: digoxin toxicity causes ectopy, AV block, junctional rhythms and bidirectional VT (with nausea and yellow vision). Antidote: digoxin-specific Fab.`),
        steps: c === 'af' || c === 'flutter'
          ? [{ at: 30 * MIN, profile: 'junctional', hr: 56, mods: effect, note: 'AF with a regular, slow ventricular rhythm: complete AV block with a junctional escape — a classic sign of digoxin toxicity.', tone: 'warn', mark: 'toxicity' }]
          : [{ at: 30 * MIN, profile: 'pvcs', hr: p.hr, mods: { ...effect, prAdd: 80 }, note: 'Ectopy (PVCs) and a long PR: digoxin toxicity.', tone: 'warn', mark: 'toxicity' }],
      };
    }
    if (c === 'af' || c === 'flutter') {
      return {
        verdict: caution('Slow but useful in heart failure or hypotension, where β-blockers and calcium-channel blockers are risky. Not a first choice for fast rate control.'),
        steps: [
          { at: 30 * MIN, hr: rate(p.hr, 0.88, 50), mods: effect, note: 'Digoxin effect: sagging ("scooped") ST depression, flatter T waves, a shorter QT — and the rate begins to fall.', tone: 'effect', mark: 'dig effect' },
          { at: 2 * 60 * MIN, hr: rate(p.hr, 0.78, 50), note: 'Two hours on: rate better controlled.', tone: 'good', mark: 'rate ↓' },
        ],
      };
    }
    if (isBrady(c)) return { verdict: bad('Not indicated: digoxin slows the AV node — it worsens bradycardia and AV block.'), steps: slowsBrady(p, prof, c, 30 * MIN, 0.85, 40) };
    return {
      verdict: bad('No indication in this rhythm.'),
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
  guide: 'Symptomatic bradycardia: 1 mg IV every 3–5 min, maximum 3 mg. Not for asystole or PEA. Doses below 0.5 mg can paradoxically slow the heart.',
  usual: () => ({ low: 1, high: 1 }),
  max: () => 2,
  picks: () => [0.4, 0.5, 1, 3],
  step: 0.1,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof);
    const before = totalOf(p, 'atropine');
    if (before >= 3) return { verdict: bad('3 mg already given — the maximum (full vagal block). More will not help: pace, or start epinephrine or dopamine.'), steps: noEcg(60 * S, 'No further effect.') };
    if (dose < 0.5 && (c === 'brady' || c === 'junctional' || c === 'avb1' || c === 'wenckebach' || c === 'sinus')) {
      return {
        verdict: caution('The right drug for a symptomatic sinus or AV-nodal bradycardia — but below 0.5 mg it can paradoxically slow the heart. Give 1 mg.'),
        steps: [{ at: 45 * S, hr: rate(p.hr, 0.85, 25), note: 'Paradoxical slowing (a central vagal effect of a small dose).', tone: 'warn', mark: 'slower' }, { at: 3 * MIN, restore: true, note: 'Back to where it was.', tone: 'info' }],
      };
    }
    const tachy: EffectStep[] = cls === 'high' || cls === 'toxic' ? [{ at: 2 * MIN, note: 'More than 1 mg at once: tachycardia, confusion, urinary retention, hot dry skin.', tone: 'warn' }] : [];
    switch (c) {
      case 'brady':
        if (cls === 'low') {
          return {
            verdict: good('Symptomatic sinus bradycardia: atropine — the current dose is 1 mg (0.5 mg was the pre-2020 dose).'),
            steps: [{ at: 60 * S, profile: 'normal-sinus', hr: 62, note: 'The sinus rate rises a little — 1 mg gives a fuller response.', tone: 'effect', mark: 'rate ↑' }],
          };
        }
        return {
          verdict: good('Symptomatic sinus bradycardia: atropine 1 mg blocks vagal tone at the sinus node (every 3–5 min, max 3 mg).'),
          steps: [
            { at: 60 * S, profile: 'normal-sinus', hr: 66, note: 'The sinus rate rises.', tone: 'effect', mark: 'rate ↑' },
            { at: 150 * S, profile: cls === 'high' || cls === 'toxic' ? 'sinus-tachycardia' : 'normal-sinus', hr: cls === 'high' || cls === 'toxic' ? 118 : 84, note: cls === 'high' || cls === 'toxic' ? 'Overshoot into sinus tachycardia.' : 'Sinus rhythm at a normal rate.', tone: cls === 'high' || cls === 'toxic' ? 'warn' : 'good' },
            ...tachy,
          ],
        };
      case 'junctional':
        return { verdict: good('A slow junctional rhythm from vagal tone or a sick sinus node often responds: atropine speeds the sinus node so it takes over again.'), steps: [{ at: 75 * S, profile: 'normal-sinus', hr: 78, note: 'The sinus node takes over again: P waves before every QRS.', tone: 'good', mark: 'sinus' }, ...tachy] };
      case 'avb1':
        return { verdict: caution('First-degree AV block alone needs no treatment — but atropine does shorten AV-nodal delay.'), steps: [{ at: 60 * S, hr: rate(p.hr, 1.25), mods: { prAdd: -80 }, note: 'The PR shortens and the rate rises (vagal block at the AV node).', tone: 'effect', mark: 'PR ↓' }, ...tachy] };
      case 'wenckebach':
        return { verdict: good('Mobitz I (Wenckebach) is AV-nodal — if symptomatic it usually responds to atropine.'), steps: [{ at: 75 * S, profile: 'first-degree-avb', hr: 92, mods: { prAdd: -40 }, note: 'Every P now conducts (1:1), with a still-long PR: the Wenckebach pattern has gone.', tone: 'good', mark: '1:1' }, ...tachy] };
      case 'mobitz2':
        return { verdict: caution('Mobitz II is below the AV node: atropine rarely helps and can worsen it by sending more impulses at the block. Prepare transcutaneous pacing; epinephrine or dopamine infusion.'), steps: [{ at: 60 * S, hr: Math.min(110, p.hr + 15), note: 'The atrial rate rises, but beats are still dropped — the block is unchanged.', tone: 'warn' }] };
      case 'chb':
        return prof.id === 'inferior-stemi-chb'
          ? { verdict: caution('In inferior MI the block is usually AV-nodal (vagal / ischaemic) and may respond — but do not delay pacing or reperfusion.'), steps: [{ at: 90 * S, profile: 'inferior-stemi', hr: 70, note: 'AV conduction returns: sinus rhythm with the inferior ST elevation.', tone: 'good', mark: 'conducting' }] }
          : { verdict: caution('Complete heart block with a wide escape is below the AV node: atropine will not help. Transcutaneous pacing; epinephrine or dopamine infusion.'), steps: noEcg(60 * S, 'No change in the escape rhythm.') };
      case 'arrest':
        return { verdict: bad('Atropine was removed from the arrest algorithm in 2010 — no benefit in asystole or PEA.'), steps: noEcg(60 * S, 'No change.') };
      case 'torsades':
        return { verdict: bad('Not a treatment for torsades.'), steps: noEcg(60 * S, 'No change.') };
      case 'paced':
        return { verdict: bad('No indication: the pacemaker sets the rate.'), steps: noEcg(60 * S, 'No change.') };
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
  usual: (p) => (category(resolveProfile(p.profileId)) === 'arrest' ? { low: 1, high: 1 } : { low: 0.01, high: 0.02 }),
  max: (p) => (category(resolveProfile(p.profileId)) === 'arrest' ? 1 : 0.05),
  picks: () => [0.01, 0.02, 0.1, 1],
  step: 0.01,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof);
    if (c === 'arrest') {
      return prof.rhythm === 'vf' || prof.rhythm === 'vt'
        ? { verdict: good('Shockable arrest: epinephrine 1 mg after the second shock, then every 3–5 min.'), steps: noEcg(30 * S, 'No change on the monitor: epinephrine raises coronary perfusion pressure during CPR but does not convert VF. Shock it.') }
        : { verdict: good('Non-shockable arrest: epinephrine 1 mg as soon as possible, then every 3–5 min, with high-quality CPR and a search for the cause.'), steps: noEcg(30 * S, 'No immediate change: keep compressing and check the rhythm at the 2-minute pause.') };
    }
    if (c === 'torsades') return { verdict: bad('Catecholamines can worsen torsades: magnesium and defibrillation.'), steps: noEcg(30 * S, 'No improvement.') };
    if (cls === 'toxic' || cls === 'high') {
      return {
        verdict: bad(`${dose} mg IV to a patient with a pulse is a massive overdose: severe hypertension, ischaemia and ventricular arrhythmias. With a pulse use an infusion or push-dose 10–20 mcg.`),
        steps: [
          { at: 15 * S, profile: 'sinus-tachycardia', hr: 165, note: 'Extreme sinus tachycardia and hypertension.', tone: 'warn', mark: 'tachy' },
          ...(dose >= 0.5
            ? [{ at: 45 * S, profile: 'vt', hr: 190, note: 'Ventricular tachycardia — epinephrine overdose.', tone: 'warn' as const, mark: 'VT' }]
            : [{ at: 45 * S, profile: 'pvcs', hr: 130, note: 'Frequent PVCs.', tone: 'warn' as const, mark: 'PVCs' }]),
        ],
      };
    }
    if (isBrady(c)) {
      const up: EffectStep = c === 'brady'
        ? { at: 30 * S, profile: 'normal-sinus', hr: 74, note: 'The sinus rate rises.', tone: 'effect', mark: 'rate ↑' }
        : c === 'chb' ? { at: 30 * S, hr: Math.min(60, p.hr + 10), note: 'The escape rhythm speeds up a little.', tone: 'effect', mark: 'rate ↑' }
          : { at: 30 * S, hr: rate(p.hr, 1.3, 30, 140), note: 'The rate rises.', tone: 'effect', mark: 'rate ↑' };
      return {
        verdict: caution('Bradycardia not responding to atropine: an epinephrine infusion (2–10 mcg/min) — or push-dose epinephrine by protocol — while transcutaneous pacing is set up.'),
        steps: [up, { at: 7 * MIN, restore: true, note: 'The push-dose wears off in 5–10 min: start an infusion or pace.', tone: 'info' }],
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
  guide: 'Torsades: 1–2 g IV/IO diluted — as a push if pulseless, over ~15 min with a pulse. Lower doses in renal impairment.',
  usual: () => ({ low: 1, high: 2 }),
  max: () => 4,
  picks: () => [0.5, 1, 2, 6],
  step: 0.5,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof);
    const toxic: EffectStep[] = cls === 'toxic' ? [{ at: 2 * MIN, hr: rate(p.hr, 0.85, 30), mods: { prAdd: 40 }, note: 'Hypermagnesaemia: bradycardia, AV block, lost reflexes, respiratory depression. Antidote: calcium.', tone: 'warn' }] : [];
    if (c === 'torsades') {
      if (cls === 'low') return { verdict: good('Magnesium is the drug for torsades — but give 1–2 g.'), steps: noEcg(2 * MIN, 'Torsades carries on.') };
      return {
        verdict: good('Torsades de pointes: magnesium 1–2 g suppresses the early afterdepolarisations that trigger it (if pulseless, defibrillate first). Then stop QT-prolonging drugs and correct K⁺ and Mg²⁺.'),
        steps: [
          { at: 60 * S, profile: 'normal-sinus', hr: 92, mods: { qtcAdd: 120 }, note: 'Torsades stops: sinus rhythm — but look at the QT: still very long. Magnesium removes the trigger, not the cause.', tone: 'good', mark: 'sinus' },
          ...toxic,
        ],
      };
    }
    if (c === 'af') return { verdict: caution('Magnesium modestly helps rate control in AF (and replaces a low level) — not a first-line drug.'), steps: [{ at: 5 * MIN, hr: rate(p.hr, 0.93), note: 'A small fall in the ventricular rate.', tone: 'effect' }, ...toxic] };
    if (c === 'arrest') return { verdict: caution('Only for torsades (or suspected low magnesium) in arrest — it does not help VF in general.'), steps: noEcg(60 * S, 'No change.') };
    return { verdict: caution('No direct ECG effect at normal levels: magnesium corrects a low level (which can provoke ectopy and torsades).'), steps: [...noEcg(2 * MIN, 'No visible change.'), ...toxic] };
  },
};

const calcium: MedDef = {
  id: 'calcium-chloride',
  name: 'Calcium chloride 10%',
  group: 'Electrolytes',
  unit: 'g',
  route: 'IV over 2–5 min (push in arrest), large vein',
  verb: 'Give',
  onset: 'Within 1–3 min; lasts 30–60 min',
  guide: 'Hyperkalaemia with ECG changes: 1 g (10 mL of 10%) IV over 2–5 min; repeat if changes persist. 3 g calcium gluconate ≈ 1 g calcium chloride.',
  usual: () => ({ low: 1, high: 1 }),
  max: () => 2,
  picks: () => [0.5, 1, 3],
  step: 0.5,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof);
    const toxic: EffectStep[] = cls === 'toxic' ? [{ at: 2 * MIN, hr: rate(p.hr, 0.85, 30), note: 'Too much, too fast: bradycardia (dangerous with digoxin). Tissue necrosis if it leaks.', tone: 'warn' }] : [];
    if (c === 'hyperk') {
      return {
        verdict: good('Hyperkalaemia with ECG changes: calcium stabilises the cardiac membrane within minutes — it does not lower K⁺. Then insulin + dextrose, a β-agonist, and K⁺ removal.'),
        steps: [
          { at: 90 * S, mods: { qrsWiden: cls === 'low' ? 0.9 : 0.78, tScale: 0.9 }, note: 'The QRS narrows: the membrane is stabilised (for 30–60 min). The T waves stay peaked — the K⁺ is still high.', tone: 'good', mark: 'QRS ↓' },
          ...toxic,
        ],
      };
    }
    if (c === 'arrest') return { verdict: caution('Only when hyperkalaemia, hypocalcaemia or calcium-channel-blocker overdose is suspected — not routine in arrest.'), steps: noEcg(60 * S, 'No change.') };
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
  guide: '1 mEq/kg IV (typically 50–100 mEq). For hyperkalaemia with acidosis and for sodium-channel-blocker (TCA) overdose; not routine in arrest.',
  usual: (p) => ({ low: 0.8 * p.kg, high: 1.2 * p.kg }),
  max: (p) => 2 * p.kg,
  picks: (p) => uniq([50, round(p.kg, 10), 100, round(2.5 * p.kg, 50)]),
  step: 10,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof);
    const alk: EffectStep[] = cls === 'toxic' ? [{ at: 5 * MIN, note: 'Alkalosis and sodium overload: hypokalaemia, hypocalcaemia, fluid overload.', tone: 'warn' }] : [];
    if (c === 'hyperk') return { verdict: caution('Shifts K⁺ into cells modestly — most useful when the patient is acidotic. Calcium comes first, then insulin + dextrose.'), steps: [{ at: 5 * MIN, mods: { qrsWiden: 0.92 }, note: 'The QRS narrows slightly.', tone: 'effect', mark: 'QRS ↓' }, ...alk] };
    if (c === 'arrest') return { verdict: caution('Not routine in arrest: only for hyperkalaemia, TCA overdose or pre-existing metabolic acidosis.'), steps: [...noEcg(60 * S, 'No change.'), ...alk] };
    return { verdict: bad('No indication in this rhythm.'), steps: [...noEcg(2 * MIN, 'No visible change.'), ...alk] };
  },
};

/** Tenecteplase weight bands (single bolus) */
function tnkBand(kg: number): number {
  return kg < 60 ? 30 : kg < 70 ? 35 : kg < 80 ? 40 : kg < 90 ? 45 : 50;
}

const tenecteplase: MedDef = {
  id: 'tenecteplase',
  name: 'Tenecteplase',
  group: 'Coronary care & other',
  unit: 'mg',
  route: 'Single IV bolus over 5–10 s',
  verb: 'Push',
  onset: 'Reperfusion in ~30–60 min if it works (about 6 in 10)',
  guide: 'STEMI when primary PCI cannot happen within 120 min: by weight — < 60 kg 30 mg, 60–69 kg 35 mg, 70–79 kg 40 mg, 80–89 kg 45 mg, ≥ 90 kg 50 mg (half dose from 75 y). With aspirin, clopidogrel and an anticoagulant; then transfer for angiography.',
  usual: (p) => ({ low: tnkBand(p.kg), high: tnkBand(p.kg) }),
  max: () => 50,
  picks: () => [30, 35, 40, 45, 50],
  step: 5,
  tolerance: 0.02,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof);
    const bleed: EffectStep[] = cls === 'high' || cls === 'toxic' ? [{ at: 10 * MIN, note: 'Above the weight band: more bleeding (intracranial haemorrhage ~1%) with no extra benefit.', tone: 'warn' }] : [];
    if (prof.id === 'pulmonary-embolism') {
      return { verdict: caution('Massive PE with shock: systemic thrombolysis (alteplase is the usual agent; tenecteplase is used off-label).'), steps: [{ at: 30 * MIN, hr: rate(p.hr, 0.8), note: 'The tachycardia eases as the clot lyses and the RV unloads.', tone: 'good', mark: 'rate ↓' }, ...bleed] };
    }
    if (c !== 'stemi' && prof.id !== 'inferior-stemi-chb') {
      return { verdict: bad('Fibrinolysis is only for STEMI (or massive PE): no benefit here, and a real risk of bleeding, including intracranial haemorrhage.'), steps: [...noEcg(30 * MIN, 'No change.'), ...bleed] };
    }
    if (cls === 'low') {
      return {
        verdict: good('STEMI without timely PCI: fibrinolysis — but the dose was below the weight band.'),
        steps: [{ at: 60 * MIN, mods: { stScale: 0.75 }, note: 'Less than 50% ST resolution at 60 min: failed reperfusion — rescue PCI.', tone: 'warn', mark: 'ST still ↑' }],
      };
    }
    const reperfused = prof.id === 'anterior-stemi' ? 'anterior-stemi-reperfused' : prof.id === 'inferior-stemi' || prof.id === 'inferior-stemi-chb' ? 'inferior-stemi-reperfused' : null;
    return {
      verdict: good('STEMI when primary PCI cannot be done within 120 min of first contact: fibrinolysis, ideally within 30 min — then transfer for angiography (within 2–24 h).'),
      steps: [
        { at: 30 * MIN, profile: 'vt', hr: 88, note: 'Accelerated idioventricular rhythm (AIVR): a wide, regular rhythm at ~90/min — a classic sign of reperfusion. It needs no treatment.', tone: 'effect', mark: 'AIVR' },
        reperfused
          ? { at: 30 * MIN + 25 * S, profile: reperfused, hr: prof.id === 'anterior-stemi' ? 80 : 70, note: 'ST elevation resolving (> 50%) and terminal T-wave inversion: the artery has opened.', tone: 'good', mark: 'reperfused' }
          : { at: 30 * MIN + 25 * S, profile: p.profileId, hr: p.hr, mods: { stScale: 0.3 }, note: 'ST elevation resolving (> 50%): the artery has opened.', tone: 'good', mark: 'reperfused' },
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
  guide: 'ACS: 60 units/kg IV bolus (max 4000 units), then 12 units/kg/h (max 1000 units/h). Primary PCI: 70–100 units/kg to a target ACT.',
  usual: (p) => ({ low: Math.min(4000, 50 * p.kg), high: Math.min(4000, 60 * p.kg) }),
  max: (p) => Math.max(5000, 100 * p.kg),
  picks: (p) => uniq([2000, Math.min(4000, round(60 * p.kg, 500)), 5000, 10000]),
  step: 500,
  plan(p) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof);
    const useful = c === 'stemi' || ['nstemi', 'wellens', 'pulmonary-embolism'].includes(prof.id) || c === 'af' || c === 'flutter';
    return {
      verdict: useful ? good('Anticoagulation to stop the clot growing (ACS, PE, AF before cardioversion). It does not open an occluded artery.') : bad('No indication here.'),
      steps: noEcg(60 * S, 'No direct ECG effect: heparin prevents clot extension — the tracing does not change.'),
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
  guide: '0.4 mg SL every 5 min (max 3) if SBP ≥ 90–100. Avoid with RV infarction, a PDE-5 inhibitor in the last 24–48 h, severe aortic stenosis, or HR < 50.',
  usual: () => ({ low: 0.4, high: 0.4 }),
  max: () => 0.8,
  picks: () => [0.3, 0.4, 0.8, 1.2],
  step: 0.1,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof);
    const reflex: EffectStep = { at: 2 * MIN, hr: rate(p.hr, 1.08, 30, 180), note: 'Reflex tachycardia as the blood pressure falls a little.', tone: 'effect' };
    const drop: EffectStep[] = cls === 'high' || cls === 'toxic' ? [{ at: 3 * MIN, note: 'A large dose: headache and hypotension.', tone: 'warn' }] : [];
    if (c === 'arrest' || c === 'torsades') return { verdict: bad('Not in arrest.'), steps: noEcg(2 * MIN, 'No change.') };
    if (['aortic-stenosis', 'hcm'].includes(prof.id)) return { verdict: bad('Dangerous: a preload-dependent heart (aortic stenosis, obstructive HCM) — nitrates can cause collapse.'), steps: [reflex, { at: 3 * MIN, note: 'Blood pressure falling.', tone: 'warn' }] };
    if (c === 'stemi') {
      return {
        verdict: prof.id.startsWith('inferior')
          ? caution('Chest pain relief in STEMI if BP allows — but in inferior MI check right-sided leads (V4R) first: RV infarction makes nitrates drop the blood pressure. Nitrates do not open a thrombosed artery.')
          : caution('Relieves ischaemic pain and congestion if BP allows. It does not open a thrombosed artery — reperfusion does.'),
        steps: [{ ...reflex, note: 'Reflex tachycardia; the ST elevation is unchanged — nitrates cannot open an occluded artery.' }, ...drop],
      };
    }
    if (['nstemi', 'wellens', 'hfref', 'hfpef'].includes(prof.id)) return { verdict: good('Ongoing ischaemic pain or congestion: nitrates lower preload and relieve symptoms (watch the BP).'), steps: [reflex, ...drop] };
    return { verdict: bad('No indication in this rhythm.'), steps: [reflex, ...drop] };
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
  guide: '~1 mcg/kg IV (typically 25–100 mcg), titrated; about 0.5 mcg/kg in the elderly or frail.',
  usual: (p) => ({ low: 0.5 * p.kg, high: 1 * p.kg }),
  max: (p) => 2 * p.kg,
  picks: (p) => uniq([25, 50, round(p.kg, 25), round(2.5 * p.kg, 25)]),
  step: 25,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof);
    const resp: EffectStep[] = cls === 'toxic' ? [{ at: 3 * MIN, note: 'Respiratory depression (and chest-wall rigidity with large fast doses): support the airway; naloxone.', tone: 'warn' }] : [];
    if (c === 'arrest' || c === 'torsades') return { verdict: bad('Not in arrest.'), steps: noEcg(2 * MIN, 'No change.') };
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
  guide: '~40–100 mcg IV every 1–2 min as needed (protocol-dependent); infusion 10–200 mcg/min. A pure α-agonist: raises BP by vasoconstriction.',
  usual: () => ({ low: 40, high: 100 }),
  max: () => 200,
  picks: () => [50, 100, 200, 500],
  step: 10,
  plan(p, dose, cls) {
    const prof = resolveProfile(p.profileId);
    const c = category(prof);
    if (c === 'arrest' || c === 'torsades') return { verdict: bad('Not an arrest drug.'), steps: noEcg(60 * S, 'No change.') };
    const fall = cls === 'toxic' ? 0.7 : cls === 'high' ? 0.78 : 0.86;
    return {
      verdict: isBrady(c) ? bad('Avoid in bradycardia: the reflex slowing makes it worse.') : caution('A vasopressor for hypotension from vasodilation (e.g. anaesthesia) — not for a rhythm problem. Note the reflex slowing.'),
      steps: [{ at: 40 * S, hr: rate(p.hr, fall, 25), note: 'The blood pressure rises and the heart rate falls (baroreceptor reflex).', tone: 'effect', mark: 'reflex ↓' }, { at: 12 * MIN, restore: true, note: 'Wears off.', tone: 'info' }],
    };
  },
};

export const MEDS: MedDef[] = [
  adenosine, diltiazem, metoprolol, esmolol, amiodarone, procainamide, lidocaine, digoxin,
  atropine, epinephrine,
  magnesium, calcium, bicarbonate,
  tenecteplase, heparin, nitroglycerin, fentanyl, phenylephrine,
];

export const MED_BY_ID = Object.fromEntries(MEDS.map((m) => [m.id, m])) as Record<MedId, MedDef>;

// ─── Doses ─────────────────────────────────────────────────────────────────

export function classifyDose(def: MedDef, p: Patient, dose: number): DoseClass {
  const u = def.usual(p);
  const tol = def.tolerance ?? 0.15;
  const eps = 1e-6;
  if (dose > def.max(p) + eps) return 'toxic';
  if (dose < u.low * (1 - tol) - eps) return 'low';
  if (dose > u.high * (1 + tol) + eps) return 'high';
  return 'usual';
}

/** Is the dose given per kilogram (so the picker shows mg/kg)? */
export const PER_KG: Partial<Record<MedId, true>> = {
  diltiazem: true, esmolol: true, procainamide: true, lidocaine: true, 'sodium-bicarbonate': true, heparin: true, fentanyl: true,
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
  return `${fmtDose(dose)} ${def.unit}${PER_KG[def.id] ? ` = ${perKg}` : ''} — ${what}`;
}

/** Everything that happens when this dose is given to this patient now */
export function planDose(id: MedId, p: Patient, dose: number): DosePlan {
  const def = MED_BY_ID[id];
  const doseClass = classifyDose(def, p, dose);
  const { verdict, steps } = def.plan(p, dose, doseClass);
  return { doseClass, doseText: describeDose(def, p, dose, doseClass), verdict, steps: [...steps].sort((a, b) => a.at - b.at) };
}
