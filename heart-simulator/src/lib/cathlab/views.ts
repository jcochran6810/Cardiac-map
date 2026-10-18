/**
 * The standard angiographic views. Angles follow the angiography convention used by the 3D scene's
 * C-arm read-out (CArmTracker): rotation is LAO + / RAO − (the image detector toward the patient's
 * left or right), angulation is cranial + / caudal − (the detector toward the head or the feet).
 */
export interface CineView {
  /** the simulator intervention id */
  id: string;
  name: string;
  rot: number;
  ang: number;
  system: 'left' | 'right' | 'lv';
  /** what the view shows best */
  best: string;
  /** coronary segments to highlight on the 3D heart (structure ids) */
  vessels: string[];
}

export const CINE_VIEWS: CineView[] = [
  { id: 'view-rao-caudal', name: 'RAO caudal', rot: -25, ang: -25, system: 'left', best: 'The left main, proximal LAD and the circumflex with its obtuse marginals', vessels: ['lmca', 'lad-proximal', 'lcx-proximal', 'lcx-distal', 'om1', 'om2'] },
  { id: 'view-rao-cranial', name: 'RAO cranial', rot: -20, ang: 30, system: 'left', best: 'The mid and distal LAD, with the diagonals and septals split apart', vessels: ['lad-mid', 'lad-distal', 'd1', 'd2', 'septal-perforators'] },
  { id: 'view-ap-cranial', name: 'AP cranial', rot: 0, ang: 35, system: 'left', best: 'The mid LAD and its diagonals, opened up', vessels: ['lad-proximal', 'lad-mid', 'd1', 'd2'] },
  { id: 'view-lao-cranial', name: 'LAO cranial', rot: 35, ang: 25, system: 'left', best: 'The LAD running down the septum, and the LAD–diagonal bifurcations', vessels: ['lad-proximal', 'lad-mid', 'lad-distal', 'd1', 'd2'] },
  { id: 'view-lao-caudal', name: 'LAO caudal ("spider")', rot: 45, ang: -25, system: 'left', best: 'The left main and its bifurcation: ostial LAD and ostial circumflex', vessels: ['lmca', 'lad-proximal', 'lcx-proximal', 'ramus-intermedius'] },
  { id: 'view-rca-lao', name: 'LAO, right coronary', rot: 30, ang: 0, system: 'right', best: 'The whole RCA as a "C": ostium, proximal and mid segments, down to the crux', vessels: ['rca-proximal', 'rca-mid', 'rca-distal', 'conus-branch', 'am-branch'] },
  { id: 'view-rca-rao', name: 'RAO, right coronary', rot: -30, ang: 0, system: 'right', best: 'The mid RCA, its RV (acute marginal) branches and the length of the PDA', vessels: ['rca-mid', 'am-branch', 'pda'] },
  { id: 'view-rca-cranial', name: 'AP cranial, right coronary', rot: 0, ang: 25, system: 'right', best: 'The crux: the PDA and the posterolateral branches, opened up', vessels: ['rca-distal', 'pda', 'posterolateral-branch'] },
  { id: 'lv-gram', name: 'RAO 30°, ventriculogram', rot: -30, ang: 0, system: 'lv', best: 'Left ventricular wall motion (anterior, apical, inferior), the ejection fraction and mitral regurgitation', vessels: [] },
];

export const CINE_VIEW_BY_ID: Record<string, CineView> = Object.fromEntries(CINE_VIEWS.map((v) => [v.id, v]));

/** "RAO 20° / cranial 30°" */
export function angleText(v: Pick<CineView, 'rot' | 'ang'>): string {
  const rot = v.rot === 0 ? 'AP' : `${v.rot < 0 ? 'RAO' : 'LAO'} ${Math.abs(v.rot)}°`;
  return v.ang === 0 ? rot : `${rot} / ${v.ang > 0 ? 'cranial' : 'caudal'} ${Math.abs(v.ang)}°`;
}
