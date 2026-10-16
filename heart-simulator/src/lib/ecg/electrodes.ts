/**
 * Electrode-level ECG model: 10 physical electrodes → 12 standard leads.
 *
 * Each electrode records a potential φ = dipole · e(site). Leads are then formed
 * exactly as an electrocardiograph forms them:
 *   I = LA − RA   II = LL − RA   III = LL − LA          (Einthoven)
 *   WCT = (RA + LA + LL) / 3                             (Wilson central terminal)
 *   aVR = 3/2 (RA − WCT)  aVL = 3/2 (LA − WCT)  aVF = 3/2 (LL − WCT)   (Goldberger)
 *   Vn  = φ(Vn) − WCT
 * The right-leg electrode is the reference/ground and is not part of any lead.
 * Moving cables between sites therefore reproduces the classic reversal patterns
 * (e.g. lead I inverted with LA/RA reversal, a flat lead II with RA/RL reversal)
 * without hand-coding them.
 *
 * Lead-derivation formulas follow the standard definitions (see also the
 * `get_standard_leads` helper in LLNL's cardiac_challenge, MIT licence); this is an
 * independent implementation.
 */
import { LEAD_VECTORS, ALL_LEADS, type StandardLead, type Vec3, scale } from './vector';

export const ELECTRODES = ['RA', 'LA', 'RL', 'LL', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'] as const;
export type Electrode = (typeof ELECTRODES)[number];
/** Physical sites a cable can be attached to */
export type Site = Electrode;
/** cable → site it is attached to */
export type Placement = Record<Electrode, Site>;

export const STANDARD_PLACEMENT: Placement = {
  RA: 'RA', LA: 'LA', RL: 'RL', LL: 'LL', V1: 'V1', V2: 'V2', V3: 'V3', V4: 'V4', V5: 'V5', V6: 'V6',
};

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

// Limb electrode lead fields chosen so that RA + LA + LL = 0 (WCT at zero potential) and the
// Einthoven differences reproduce leads I and II exactly.
const eRA = scale(add(LEAD_VECTORS.I, LEAD_VECTORS.II), -1 / 3);
const eLA = add(eRA, LEAD_VECTORS.I);
const eLL = add(eRA, LEAD_VECTORS.II);

const SITE_FIELD: Record<Site, Vec3> = {
  RA: eRA,
  LA: eLA,
  LL: eLL,
  // The two legs are electrically almost equivalent (far from the heart, same side of it)
  RL: eLL,
  V1: LEAD_VECTORS.V1,
  V2: LEAD_VECTORS.V2,
  V3: LEAD_VECTORS.V3,
  V4: LEAD_VECTORS.V4,
  V5: LEAD_VECTORS.V5,
  V6: LEAD_VECTORS.V6,
};

/** Effective lead vectors for a given cable placement */
export function leadField(p: Placement): Record<StandardLead, Vec3> {
  const phi = (c: Electrode) => SITE_FIELD[p[c]];
  const ra = phi('RA');
  const la = phi('LA');
  const ll = phi('LL');
  const wct = scale(add(add(ra, la), ll), 1 / 3);
  const aug = (x: Vec3) => scale(sub(x, wct), 1.5);
  const out = {
    I: sub(la, ra),
    II: sub(ll, ra),
    III: sub(ll, la),
    aVR: aug(ra),
    aVL: aug(la),
    aVF: aug(ll),
  } as Record<StandardLead, Vec3>;
  for (const v of ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'] as const) out[v] = sub(phi(v), wct);
  return out;
}

export function isStandard(p: Placement): boolean {
  return ELECTRODES.every((e) => p[e] === e);
}

export function swapCables(p: Placement, a: Electrode, b: Electrode): Placement {
  return { ...p, [a]: p[b], [b]: p[a] };
}

export interface PlacementPreset {
  id: string;
  label: string;
  /** cables to swap */
  swap: [Electrode, Electrode];
  /** What to look for on the 12-lead */
  clues: string[];
}

export const PLACEMENT_PRESETS: PlacementPreset[] = [
  {
    id: 'la-ra', label: 'LA ↔ RA', swap: ['LA', 'RA'],
    clues: [
      'Lead I fully inverted: negative P wave, QRS and T',
      'aVR and aVL swap (aVR looks upright); II and III swap; aVF unchanged',
      'Precordial leads are normal — this separates it from dextrocardia, which also loses R-wave progression',
    ],
  },
  {
    id: 'la-ll', label: 'LA ↔ LL', swap: ['LA', 'LL'],
    clues: [
      'Leads I and II swap, aVL and aVF swap, and lead III is inverted; aVR unchanged',
      'Easy to miss: a P wave taller in lead I than in lead II is a useful clue',
      'Can mimic or hide inferior changes',
    ],
  },
  {
    id: 'ra-ll', label: 'RA ↔ LL', swap: ['RA', 'LL'],
    clues: [
      'I, II and III all inverted (I becomes −III, III becomes −I)',
      'aVR and aVF swap: aVR upright, aVF negative; aVL unchanged',
      'Inverted P waves in the inferior leads mimic an ectopic atrial rhythm',
    ],
  },
  {
    id: 'ra-rl', label: 'RA ↔ RL', swap: ['RA', 'RL'],
    clues: [
      'Lead II becomes an almost flat line (both of its electrodes now sit on the legs)',
      'Lead I looks like inverted lead III; aVR and aVF become nearly identical',
      'A near-flat limb lead is the giveaway for a neutral (RL) cable reversal',
      'Precordial leads can change slightly too, because the Wilson central terminal is distorted',
    ],
  },
  {
    id: 'la-rl', label: 'LA ↔ RL', swap: ['LA', 'RL'],
    clues: [
      'Lead III becomes an almost flat line',
      'Lead I looks like lead II',
      'aVL and aVF become nearly identical',
      'Precordial leads can change slightly too, because the Wilson central terminal is distorted',
    ],
  },
  {
    id: 'v1-v2', label: 'V1 ↔ V2', swap: ['V1', 'V2'],
    clues: [
      'R wave taller in V1 than V2, then growing again — broken R-wave progression',
      'An isolated anomaly in one or two adjacent leads that has no anatomical explanation suggests a precordial swap',
    ],
  },
  {
    id: 'v2-v3', label: 'V2 ↔ V3', swap: ['V2', 'V3'],
    clues: [
      'R/S ratio jumps up at V2 then falls at V3',
      'Can mimic a poor-R-wave-progression or septal-infarct pattern',
    ],
  },
];

export function applyPreset(preset: PlacementPreset): Placement {
  let p: Placement = { ...STANDARD_PLACEMENT };
  p = swapCables(p, preset.swap[0], preset.swap[1]);
  return p;
}

/** Human-readable description of what is wrong with a placement, or null if standard */
export function describePlacement(p: Placement): string | null {
  if (isStandard(p)) return null;
  const parts: string[] = [];
  const seen = new Set<Electrode>();
  for (const c of ELECTRODES) {
    if (seen.has(c) || p[c] === c) continue;
    const site = p[c];
    const other = ELECTRODES.find((o) => o !== c && p[o] === c && site === o);
    if (other) {
      parts.push(`${c} ↔ ${other}`);
      seen.add(c); seen.add(other);
    } else {
      parts.push(`${c} → ${site}`);
      seen.add(c);
    }
  }
  return parts.join(', ');
}

/** Matching preset for a placement (to show its clues), if any */
export function presetFor(p: Placement): PlacementPreset | null {
  for (const pre of PLACEMENT_PRESETS) {
    const q = applyPreset(pre);
    if (ELECTRODES.every((e) => q[e] === p[e])) return pre;
  }
  return null;
}

/** Electrode colour codes */
export const ELECTRODE_COLORS: Record<'aha' | 'iec', Record<Electrode, { fill: string; label: string }>> = {
  aha: {
    RA: { fill: '#f8fafc', label: 'RA' }, LA: { fill: '#111827', label: 'LA' }, RL: { fill: '#16a34a', label: 'RL' }, LL: { fill: '#dc2626', label: 'LL' },
    V1: { fill: '#dc2626', label: 'V1' }, V2: { fill: '#facc15', label: 'V2' }, V3: { fill: '#16a34a', label: 'V3' },
    V4: { fill: '#2563eb', label: 'V4' }, V5: { fill: '#f97316', label: 'V5' }, V6: { fill: '#9333ea', label: 'V6' },
  },
  iec: {
    RA: { fill: '#dc2626', label: 'R' }, LA: { fill: '#facc15', label: 'L' }, RL: { fill: '#111827', label: 'N' }, LL: { fill: '#16a34a', label: 'F' },
    V1: { fill: '#dc2626', label: 'C1' }, V2: { fill: '#facc15', label: 'C2' }, V3: { fill: '#16a34a', label: 'C3' },
    V4: { fill: '#92400e', label: 'C4' }, V5: { fill: '#111827', label: 'C5' }, V6: { fill: '#9333ea', label: 'C6' },
  },
};

export const ALL_STANDARD_LEADS = ALL_LEADS;
