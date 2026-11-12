/**
 * How the 3D view's controls (SceneOverlay) are laid out for the size of the view, and how much of a phone on its
 * side the heart gets when it sits beside the ECG. Pure functions, so the rules can be unit-tested.
 */

/** The view is this narrow (CSS px) or less: the controls go "thin" (see overlaySize) */
export const THIN_WIDTH = 300;

export interface OverlaySize {
  /** a small view (a phone, a phone on its side, a low drawer): one View menu, a Views button, a small cycle box */
  narrow: boolean;
  /**
   * a slim view (the heart beside the ECG and a lesson's text on a phone on its side): one row along the top — the View
   * menu and More, which also holds the camera views — and the cycle box as one line under it
   */
  thin: boolean;
  /** no height to spare for a row of toggles: they fold into More */
  low: boolean;
  /** only a strip of the heart shows (the ECG enlarged over it, a lesson on a small phone): no controls, only the
   * one-line cycle box in a lesson */
  tiny: boolean;
}

export function overlaySize(width: number, height: number): OverlaySize {
  return {
    narrow: width < 640 || height < 380,
    thin: width < THIN_WIDTH,
    low: height < 300,
    tiny: height < 170,
  };
}

/**
 * Does the territory key start folded to its "Territory key" chip? Only in a lesson, and only where the view is short
 * of room: in a slim view it would cover most of the heart, and while a "tap the …" check is open in a low view it
 * would cover the arteries to be tapped. A lesson's ordinary small view (a desktop or tablet lesson) keeps it open,
 * and so does a step whose text or look sends the learner to the legend (`readsKey`). The learner can always open or
 * put it away.
 */
export function keyStartsFolded(o: { inLesson: boolean; thin: boolean; low: boolean; tapOpen: boolean; readsKey: boolean }): boolean {
  return o.inLesson && !o.readsKey && (o.thin || (o.low && o.tapOpen));
}

/** Does a lesson step's text or look send the learner to the territory key ("the legend names the artery …")? */
export function stepReadsKey(step: { text: readonly string[]; look?: string }): boolean {
  return /\blegend\b/i.test(`${step.look ?? ''} ${step.text.join(' ')}`);
}

/** Smallest width (CSS px) of the ECG beside the heart, and of the heart beside the ECG, on a phone on its side */
export const SIDE_ECG_MIN = 280;
export const SIDE_HEART_MIN = 180;
/** …beside a lesson's text column, where neither picture may crowd out the other */
export const LESSON_SIDE_MIN = 180;

/**
 * The range the ECG's width can be dragged to when the heart and the ECG sit side by side (a phone on its side), in
 * a learning area `areaW` wide. Beside a lesson's text the two share the room more evenly.
 */
export function sideBySideEcgRange(areaW: number, lesson: boolean): { min: number; max: number } {
  if (lesson) {
    const min = Math.min(LESSON_SIDE_MIN, Math.floor(areaW / 2));
    return { min, max: Math.max(min, areaW - LESSON_SIDE_MIN) };
  }
  return { min: SIDE_ECG_MIN, max: Math.max(SIDE_ECG_MIN, areaW - SIDE_HEART_MIN) };
}

/**
 * The ECG's width beside the heart: what the learner dragged it to, or the default — 55% of the area, or half of it
 * beside a lesson's text (the lesson's column takes 44% of the phone, and the old 55% with a 280-px floor left the
 * heart under 200 px, too slim for its name tags and controls).
 */
export function sideBySideEcgWidth(areaW: number, dragged: number | null, lesson: boolean): number {
  const { min, max } = sideBySideEcgRange(areaW, lesson);
  const want = dragged ?? (lesson ? Math.floor(areaW / 2) : areaW * 0.55);
  return Math.max(min, Math.min(max, want));
}
