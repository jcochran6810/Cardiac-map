/**
 * AHA 17-segment model of the left ventricle and its usual coronary territories.
 * Cerqueira MD et al. "Standardized myocardial segmentation and nomenclature for
 * tomographic imaging of the heart." Circulation 2002;105:539–542.
 *
 * Territory assignment follows the standard AHA figure (right-dominant). Real
 * coronary anatomy varies — notably the apex (17), apical lateral (16) and inferior
 * segments can be supplied by a wrap-around LAD, a large LCx or a dominant RCA.
 *
 * Bull's-eye orientation (standard): anterior at the top, septum on the left,
 * lateral wall on the right, inferior at the bottom. Angles are in degrees,
 * counter-clockwise from 3 o'clock.
 */
export type Territory = 'LAD' | 'LCx' | 'RCA';

export interface Segment17 {
  n: number;
  name: string;
  level: 'basal' | 'mid' | 'apical' | 'apex';
  territory: Territory;
  /** start/end angle (degrees) on the bull's-eye */
  a0: number;
  a1: number;
}

const ring = (level: 'basal' | 'mid', base: number): Segment17[] => {
  const names = ['anterior', 'anteroseptal', 'inferoseptal', 'inferior', 'inferolateral', 'anterolateral'];
  const terr: Territory[] = ['LAD', 'LAD', 'RCA', 'RCA', 'LCx', 'LCx'];
  return names.map((nm, i) => ({
    n: base + i,
    name: `${level === 'basal' ? 'Basal' : 'Mid'} ${nm}`,
    level,
    territory: terr[i],
    a0: 60 + i * 60,
    a1: 120 + i * 60,
  }));
};

export const AHA17: Segment17[] = [
  ...ring('basal', 1),
  ...ring('mid', 7),
  { n: 13, name: 'Apical anterior', level: 'apical', territory: 'LAD', a0: 45, a1: 135 },
  { n: 14, name: 'Apical septal', level: 'apical', territory: 'LAD', a0: 135, a1: 225 },
  { n: 15, name: 'Apical inferior', level: 'apical', territory: 'RCA', a0: 225, a1: 315 },
  { n: 16, name: 'Apical lateral', level: 'apical', territory: 'LCx', a0: 315, a1: 405 },
  { n: 17, name: 'Apex', level: 'apex', territory: 'LAD', a0: 0, a1: 360 },
];

export const TERRITORY_COLORS: Record<Territory, string> = {
  LAD: '#26d973',
  LCx: '#4d8cff',
  RCA: '#ff8c1f',
};

/** ECG leads that face each LV wall (for linking the bull's-eye to the 12-lead) */
export const WALL_LEADS: Record<string, string> = {
  anterior: 'V3–V4',
  anteroseptal: 'V1–V2',
  inferoseptal: 'II, III, aVF',
  inferior: 'II, III, aVF',
  inferolateral: 'V7–V9 (posterior); reciprocal ST depression V1–V3',
  anterolateral: 'I, aVL, V5–V6',
  septal: 'V1–V2',
  lateral: 'I, aVL, V5–V6',
  apex: 'V3–V6',
};

export function wallOf(seg: Segment17): string {
  if (seg.level === 'apex') return 'apex';
  return seg.name.split(' ')[1];
}
