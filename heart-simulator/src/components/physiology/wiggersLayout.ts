import type { SoundKind } from '@/lib/physiology/heartSounds';

/**
 * Geometry of the Wiggers panel, kept apart from the drawing so it can be tested: how the chart, the PV loop and the
 * numbers share the panel, where each row of the chart sits, and where its labels go so that none of them collide.
 */

/**
 * - `stack`: the chart on top, the loop and the numbers side by side in a strip under it (a narrow panel: phones)
 * - `column`: the loop above the numbers, in a column beside the chart (a wide panel with height to spare)
 * - `row`: the loop and the numbers side by side, beside the chart (a wide but short panel: a phone on its side, or the
 *   drawer under the 3D heart and a reading)
 */
export type WiggersLayout = 'stack' | 'column' | 'row';

/** The PV loop is never drawn shorter than this where there is room: below it the axis labels collide and the loop flattens */
export const LOOP_MIN_HEIGHT = 140;

/** Panels narrower than this stack the chart above the loop */
const STACK_BELOW_WIDTH = 620;
/** Below this height a column could not hold a readable loop above the numbers and the Listen button */
const ROW_BELOW_HEIGHT = 340;

export function wiggersLayout(width: number, height: number): WiggersLayout {
  if (width < STACK_BELOW_WIDTH) return 'stack';
  return height < ROW_BELOW_HEIGHT ? 'row' : 'column';
}

/** Width of the loop in the `row` layout: about square, but never more than a quarter of the panel, so the chart keeps the room */
export function rowLoopWidth(width: number, height: number): number {
  return Math.round(Math.max(LOOP_MIN_HEIGHT, Math.min(height, 260, width * 0.25)));
}

export interface Band {
  y0: number;
  y1: number;
}

export interface ChartRows {
  /** size (px) of the valve-event and heart-sound labels */
  font: number;
  ecg: Band;
  /** the lane for the valve-event labels (MC, AO, AC, MO) above the pressure plot, so they never sit on the curves */
  lane: Band;
  /** baselines of the lane's two staggered rows */
  laneRows: [number, number];
  /** the pressure plot itself, under the lane */
  press: Band;
  vol: Band;
  phono: Band;
  /** baselines of the heart-sound labels: S1/S2 above the extra sounds when the row has room for two lines, else one */
  soundRows: number[];
}

/** The chart's rows for a canvas `H` px tall: the ECG, the event-label lane, pressure, LV volume and the heart sounds */
export function chartRows(H: number): ChartRows {
  const font = H >= 300 ? 12 : 11;
  // (a short chart — a phone held upright — packs the label rows a pixel tighter)
  const pitch = font + (H >= 200 ? 2 : 1);
  const laneH = 2 * pitch + 3;
  // the rows keep their old proportions of what is left once the lane is taken out
  const avail = H - laneH;
  const at = (f: number) => f * avail;
  const ecg = { y0: 4, y1: at(0.17) };
  const lane = { y0: at(0.19), y1: at(0.19) + laneH };
  const press = { y0: lane.y1, y1: at(0.6) + laneH };
  const vol = { y0: at(0.62) + laneH, y1: at(0.81) + laneH };
  const phono = { y0: at(0.83) + laneH, y1: at(0.99) + laneH };
  const twoSoundRows = phono.y1 - phono.y0 >= 2 * pitch + 6;
  return {
    font,
    ecg,
    lane,
    laneRows: [lane.y0 + font, lane.y0 + font + pitch],
    press,
    vol,
    phono,
    soundRows: twoSoundRows ? [phono.y0 + font, phono.y0 + font + pitch] : [phono.y0 + font],
  };
}

export interface PlacedLabel<T> {
  item: T;
  /** left edge of the text */
  x: number;
  row: number;
}

/** Keep the labels of one row apart: a label that would run into the one before it in its row is left out */
function fitRows<T>(wanted: PlacedLabel<T>[], width: (p: PlacedLabel<T>) => number, gap: number): PlacedLabel<T>[] {
  const lastRight: number[] = [];
  const out: PlacedLabel<T>[] = [];
  for (const p of [...wanted].sort((a, b) => a.x - b.x)) {
    if (p.x < (lastRight[p.row] ?? -Infinity) + gap) continue;
    out.push(p);
    lastRight[p.row] = p.x + width(p);
  }
  return out;
}

export type ValveEvent = 'MC' | 'AO' | 'AC' | 'MO';

/**
 * Valve-event labels, each just right of its dashed line. MC and AO (and AC and MO) are only ~50 ms apart, so each pair is
 * staggered: MC and AC on the first row, AO and MO on the second. A label that would still run into its neighbour (very
 * fast rates on a narrow chart) is left out; its line is still drawn.
 */
export function placeEventLabels(marks: { x: number; label: ValveEvent }[], width: (label: ValveEvent) => number, gap = 3) {
  return fitRows(
    marks.map((m) => ({ item: m, x: m.x + 3, row: m.label === 'AO' || m.label === 'MO' ? 1 : 0 })),
    (p) => width(p.item.label),
    gap,
  );
}

/**
 * Heart-sound labels next to their sounds on the sound trace. With two rows: S1 and S2 above, the extra sounds (S3, S4, an
 * opening snap) below. With one row the extra sounds share it, so S4 goes left of its sound (it comes just before S1), and
 * S2 moves to the left of its sound when an opening snap or S3 follows too closely for both to fit after it.
 * A label with no room left in its row is left out. `taken[row]`: where something else already written on that row ends.
 */
export function placeSoundLabels(
  sounds: { x: number; kind: SoundKind }[],
  width: (kind: SoundKind) => number,
  rows: number,
  { gap = 3, taken = [] }: { gap?: number; taken?: number[] } = {},
) {
  const sorted = [...sounds].sort((a, b) => a.x - b.x);
  const lastRight: number[] = [...taken];
  const out: PlacedLabel<{ x: number; kind: SoundKind }>[] = [];
  sorted.forEach((s, i) => {
    const extra = s.kind !== 's1' && s.kind !== 's2';
    const row = rows > 1 && extra ? 1 : 0;
    const w = width(s.kind);
    const right = s.x + 3;
    const left = s.x - w - 3;
    const before = (lastRight[row] ?? -Infinity) + gap;
    let x = s.kind === 's4' ? left : right;
    if (rows === 1 && s.kind === 's2') {
      const next = sorted[i + 1];
      const crowded = !!next && (next.kind === 's3' || next.kind === 'snap') && next.x + 3 < right + w + gap;
      if (crowded && left >= before) x = left;
    }
    if (x < before) return;
    out.push({ item: s, x, row });
    lastRight[row] = x + w;
  });
  return out;
}
