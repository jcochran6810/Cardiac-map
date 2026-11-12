import { describe, expect, it } from 'vitest';
import {
  LESSON_SIDE_MIN,
  SIDE_ECG_MIN,
  THIN_WIDTH,
  keyStartsFolded,
  overlaySize,
  sideBySideEcgRange,
  sideBySideEcgWidth,
  stepReadsKey,
} from '@/components/scene/overlayLayout';
import { CHEST_PAIN_CALL } from '@/data/courses/chest-pain-call';

// A phone on its side with a lesson open: the lesson's column takes 44% of the screen and the heart and the ECG
// share the rest. Widths of the learning area beside the column on common phones (667, 740, 844, 932 px wide).
const LESSON_AREAS = [374, 414, 473, 522];

describe('the heart beside the ECG on a phone on its side', () => {
  it('splits the room half and half beside a lesson, so the heart is no longer squeezed under 200 px', () => {
    for (const w of LESSON_AREAS) {
      const ecg = sideBySideEcgWidth(w, null, true);
      const heart = w - ecg;
      expect(Math.abs(heart - ecg)).toBeLessThanOrEqual(1);
      expect(heart).toBeGreaterThanOrEqual(LESSON_SIDE_MIN);
    }
    // the case the review measured (844 x 390): the heart had 193 px beside a 280-px ECG
    expect(473 - sideBySideEcgWidth(473, null, true)).toBeGreaterThanOrEqual(236);
  });

  it('gives the heart at least 280 px once the room allows it', () => {
    expect(600 - sideBySideEcgWidth(600, null, true)).toBeGreaterThanOrEqual(280);
  });

  it('keeps a dragged width within the range the drag handle allows, beside a lesson or not', () => {
    for (const lesson of [true, false]) {
      for (const w of [374, 473, 844]) {
        const { min, max } = sideBySideEcgRange(w, lesson);
        expect(sideBySideEcgWidth(w, 10, lesson)).toBe(min);
        expect(sideBySideEcgWidth(w, 5000, lesson)).toBe(max);
        expect(min).toBeLessThanOrEqual(max);
      }
    }
    // beside a lesson the learner can drag either picture down to the same minimum
    const { min, max } = sideBySideEcgRange(473, true);
    expect(min).toBe(LESSON_SIDE_MIN);
    expect(473 - max).toBe(LESSON_SIDE_MIN);
  });

  it('leaves the library layout (no lesson) as it was: 55% for the ECG, at least 280 px', () => {
    expect(sideBySideEcgWidth(844, null, false)).toBeCloseTo(844 * 0.55);
    expect(sideBySideEcgWidth(473, null, false)).toBe(SIDE_ECG_MIN);
  });
});

describe('the 3D view’s controls for the size of the view', () => {
  it('goes slim below 300 px wide: the side-by-side lesson layout on a phone on its side', () => {
    const side = overlaySize(237, 282);
    expect(side).toEqual({ narrow: true, thin: true, low: true, tiny: false });
    expect(overlaySize(THIN_WIDTH, 282).thin).toBe(false);
    // an upright phone, a tablet and a desktop lesson are small (narrow) but not slim
    for (const [w, h] of [[390, 203], [820, 301], [1008, 376], [473, 270]]) {
      const s = overlaySize(w, h);
      expect(s.narrow).toBe(true);
      expect(s.thin).toBe(false);
    }
    expect(overlaySize(1008, 600).narrow).toBe(false);
  });

  it('starts the territory key folded to its chip only where a lesson’s view is short of room', () => {
    const fold = (w: number, h: number, more: { inLesson?: boolean; tapOpen?: boolean; readsKey?: boolean } = {}) => {
      const { thin, low } = overlaySize(w, h);
      return keyStartsFolded({ inLesson: true, tapOpen: false, readsKey: false, ...more, thin, low });
    };
    // a slim view (beside the ECG and the text on a phone on its side): it would cover most of the heart
    expect(fold(237, 282)).toBe(true);
    // a low view during a "tap the …" check (an upright phone, a phone on its side): it would cover the arteries
    expect(fold(390, 203, { tapOpen: true })).toBe(true);
    expect(fold(473, 270, { tapOpen: true })).toBe(true);
    expect(fold(390, 203)).toBe(false);
    // a desktop or tablet lesson's view is small but has room for it, tap check or not
    expect(fold(1008, 376, { tapOpen: true })).toBe(false);
    expect(fold(820, 301, { tapOpen: true })).toBe(false);
    // outside a lesson the learner chose to look at the territories
    expect(fold(237, 282, { inLesson: false, tapOpen: true })).toBe(false);
  });

  it('keeps the territory key open at a step that sends the learner to the legend, on every layout', () => {
    for (const [w, h] of [[237, 282], [390, 203], [473, 270], [820, 301], [1008, 376]]) {
      const { thin, low } = overlaySize(w, h);
      expect(keyStartsFolded({ inLesson: true, thin, low, tapOpen: true, readsKey: true })).toBe(false);
    }
  });

  it('finds the lesson steps that send the learner to the legend', () => {
    expect(stepReadsKey({ text: ['The pulsing area is the underside.'], look: 'The legend names the artery that feeds the inferior wall.' })).toBe(true);
    expect(stepReadsKey({ text: ['Here the heart is painted by artery, and the Legend lists the wall each artery feeds.'] })).toBe(true);
    expect(stepReadsKey({ text: ['Tap the artery that feeds the bottom wall.'], look: 'A legendary heart.' })).toBe(false);
    expect(stepReadsKey({ text: [] })).toBe(false);
  });

  it('keeps the key open at the chest pain call’s two tap checks that say to read the legend', () => {
    // ("Reading it fast", steps 6 and 7: the learner finds the artery's name in the key, then its tag on the heart)
    const steps = CHEST_PAIN_CALL.lessons.flatMap((l) => l.steps).filter((s) => s.title === 'Find it from below' || s.title.startsWith('The side wall'));
    expect(steps).toHaveLength(2);
    for (const s of steps) {
      expect(s.check?.kind, s.title).toBe('tap');
      expect(s.show?.heart, s.title).toBe('territories');
      expect(stepReadsKey(s), s.title).toBe(true);
    }
  });
});
