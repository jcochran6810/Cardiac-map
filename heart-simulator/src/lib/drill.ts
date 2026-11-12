/**
 * Rhythm trainer: which tracings each practice set draws from, how the next one is chosen (rhythms the
 * learner gets wrong come back more often) and how mastery is counted. Pure — the screen side is in drillRun.ts.
 */
import type { ECGProfileId } from '@/types/content';

export interface DrillItem {
  profile: ECGProfileId;
  /** the answer as the learner reads it */
  label: string;
  /** rates to draw from, so the same rhythm does not always look the same (omit: the profile's own rate) */
  hr?: [number, number];
  /** other answers it is most often mistaken for (offered first when the option list is cut down) */
  confuse?: ECGProfileId[];
}

export interface DrillSet {
  id: string;
  title: string;
  text: string;
  /** a rhythm strip (three limb leads) or the whole 12-lead */
  layout: 'monitor' | 'simultaneous';
  items: DrillItem[];
}

const SINUS: DrillItem = { profile: 'normal-sinus', label: 'Normal sinus rhythm', hr: [62, 96] };
const BRADY: DrillItem = { profile: 'sinus-bradycardia', label: 'Sinus bradycardia', hr: [38, 56], confuse: ['junctional', 'third-degree-avb'] };

export const DRILL_SETS: DrillSet[] = [
  {
    id: 'core',
    title: 'Core rhythms',
    text: 'The ten rhythms everyone on a monitor must know at a glance.',
    layout: 'monitor',
    items: [
      SINUS,
      BRADY,
      { profile: 'sinus-tachycardia', label: 'Sinus tachycardia', hr: [104, 150], confuse: ['avnrt', 'atrial-flutter'] },
      { profile: 'atrial-fibrillation', label: 'Atrial fibrillation', hr: [70, 160], confuse: ['atrial-flutter'] },
      { profile: 'atrial-flutter', label: 'Atrial flutter', confuse: ['atrial-fibrillation', 'avnrt', 'sinus-tachycardia'] },
      { profile: 'avnrt', label: 'SVT', hr: [160, 220], confuse: ['sinus-tachycardia', 'atrial-flutter'] },
      { profile: 'vt', label: 'Ventricular tachycardia', hr: [140, 210], confuse: ['vf', 'avnrt'] },
      { profile: 'vf', label: 'Ventricular fibrillation', confuse: ['vt', 'asystole'] },
      { profile: 'asystole', label: 'Asystole', confuse: ['vf'] },
      { profile: 'paced', label: 'Paced rhythm', hr: [60, 80], confuse: ['vt'] },
    ],
  },
  {
    id: 'blocks',
    title: 'Blocks and extra beats',
    text: 'AV blocks, junctional rhythm, PVCs and torsades — the ones that are decided by the PR interval and the P-to-QRS relationship.',
    layout: 'monitor',
    items: [
      SINUS,
      BRADY,
      { profile: 'first-degree-avb', label: 'First-degree AV block', confuse: ['mobitz-i', 'normal-sinus'] },
      { profile: 'mobitz-i', label: 'Mobitz I (Wenckebach)', hr: [60, 90], confuse: ['mobitz-ii', 'first-degree-avb'] },
      { profile: 'mobitz-ii', label: 'Mobitz II', hr: [60, 90], confuse: ['mobitz-i', 'third-degree-avb'] },
      { profile: 'third-degree-avb', label: 'Complete heart block', hr: [30, 44], confuse: ['mobitz-ii', 'junctional', 'sinus-bradycardia'] },
      { profile: 'junctional', label: 'Junctional rhythm', hr: [40, 58], confuse: ['sinus-bradycardia', 'third-degree-avb'] },
      { profile: 'pvcs', label: 'Sinus rhythm with PVCs', confuse: ['normal-sinus', 'mobitz-i'] },
      { profile: 'torsades', label: 'Torsades de pointes', confuse: ['pvcs'] },
    ],
  },
  {
    id: 'twelve',
    title: '12-lead patterns',
    text: 'Heart attacks by wall, the bundle branch blocks and the patterns that imitate them, on the full 12-lead.',
    layout: 'simultaneous',
    items: [
      { profile: 'normal-sinus', label: 'Normal 12-lead', hr: [62, 90] },
      { profile: 'anterior-stemi', label: 'Anterior STEMI', confuse: ['lateral-stemi', 'pericarditis', 'wellens', 'lbbb'] },
      { profile: 'inferior-stemi', label: 'Inferior STEMI', confuse: ['pericarditis', 'lateral-stemi'] },
      { profile: 'lateral-stemi', label: 'Lateral STEMI', confuse: ['anterior-stemi', 'inferior-stemi', 'pericarditis'] },
      { profile: 'nstemi', label: 'ST depression (ischemia)', confuse: ['wellens', 'lbbb', 'normal-sinus'] },
      { profile: 'wellens', label: 'Wellens pattern', confuse: ['nstemi', 'anterior-stemi'] },
      { profile: 'pericarditis', label: 'Acute pericarditis', confuse: ['anterior-stemi', 'inferior-stemi', 'lateral-stemi'] },
      { profile: 'rbbb', label: 'Right bundle branch block', confuse: ['lbbb', 'wpw'] },
      { profile: 'lbbb', label: 'Left bundle branch block', confuse: ['rbbb', 'wpw', 'anterior-stemi', 'paced'] },
      { profile: 'wpw', label: 'WPW (pre-excitation)', confuse: ['lbbb', 'rbbb'] },
      { profile: 'hyperkalemia', label: 'Hyperkalemia', confuse: ['anterior-stemi', 'lbbb'] },
    ],
  },
];

export const DRILL_SET_BY_ID: Record<string, DrillSet> = Object.fromEntries(DRILL_SETS.map((s) => [s.id, s]));

// ─── Mastery ───────────────────────────────────────────────────────────────

/** How well one rhythm is known: its box moves up a step with each right answer and down two with a wrong one */
export interface DrillStat {
  seen: number;
  right: number;
  /** 0 (new or shaky) … 4 (solid) */
  box: number;
}

export type DrillStats = Record<string, DrillStat>;

export const MAX_BOX = 4;
/** from this box up a rhythm counts as mastered */
export const MASTERED = 3;
/** how much more often a rhythm in each box is asked than a solid one */
const WEIGHT = [8, 5, 3, 2, 1];

export const statKey = (setId: string, profile: string) => `${setId}:${profile}`;

export function grade(stat: DrillStat | undefined, right: boolean): DrillStat {
  const s = stat ?? { seen: 0, right: 0, box: 0 };
  return {
    seen: s.seen + 1,
    right: s.right + (right ? 1 : 0),
    box: right ? Math.min(MAX_BOX, s.box + 1) : Math.max(0, s.box - 2),
  };
}

export function mastery(set: DrillSet, stats: DrillStats): { mastered: number; total: number; seen: number; right: number } {
  let mastered = 0, seen = 0, right = 0;
  for (const it of set.items) {
    const s = stats[statKey(set.id, it.profile)];
    if (!s) continue;
    if (s.box >= MASTERED) mastered++;
    seen += s.seen;
    right += s.right;
  }
  return { mastered, total: set.items.length, seen, right };
}

// ─── The next question ─────────────────────────────────────────────────────

export interface DrillQuestion {
  profile: ECGProfileId;
  hr?: number;
  /** the answers offered (profile ids), in the set's own order so each keeps its place on screen */
  options: ECGProfileId[];
}

/** at most this many answers are offered; the rest of a long set is left out, confusable ones kept */
export const MAX_OPTIONS = 12;

/**
 * Choose the next tracing: never the one just shown, and shaky rhythms more often than solid ones.
 * `rng` returns numbers in [0, 1) (Math.random in the app, a fixed sequence in tests).
 */
export function nextQuestion(set: DrillSet, stats: DrillStats, last: string | null, rng: () => number): DrillQuestion {
  const pool = set.items.length > 1 ? set.items.filter((it) => it.profile !== last) : set.items;
  const weights = pool.map((it) => WEIGHT[Math.min(MAX_BOX, stats[statKey(set.id, it.profile)]?.box ?? 0)]);
  let x = rng() * weights.reduce((a, b) => a + b, 0);
  let item = pool[pool.length - 1];
  for (let i = 0; i < pool.length; i++) {
    x -= weights[i];
    if (x < 0) { item = pool[i]; break; }
  }
  let hr: number | undefined;
  if (item.hr) {
    const [lo, hi] = item.hr;
    hr = Math.round((lo + rng() * (hi - lo)) / 2) * 2;
  }
  return { profile: item.profile, hr, options: optionsFor(set, item, rng) };
}

export function optionsFor(set: DrillSet, item: DrillItem, rng: () => number): ECGProfileId[] {
  if (set.items.length <= MAX_OPTIONS) return set.items.map((it) => it.profile);
  const inSet = new Set(set.items.map((it) => it.profile));
  const keep = new Set<ECGProfileId>([item.profile, ...(item.confuse ?? []).filter((p) => inSet.has(p))]);
  const rest = set.items.map((it) => it.profile).filter((p) => !keep.has(p));
  while (keep.size < MAX_OPTIONS && rest.length) keep.add(rest.splice(Math.floor(rng() * rest.length), 1)[0]);
  return set.items.map((it) => it.profile).filter((p) => keep.has(p));
}

export const labelOf = (set: DrillSet, profile: string) => set.items.find((it) => it.profile === profile)?.label ?? profile;
