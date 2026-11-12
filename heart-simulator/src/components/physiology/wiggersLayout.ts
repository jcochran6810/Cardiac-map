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

/**
 * `stack` (a phone held upright): the chart is never drawn shorter than this. A shorter panel (a small phone) scrolls
 * instead, so the chart's rows, the valve labels and the heart-sound labels keep a readable size.
 */
export const STACK_CHART_MIN = 84;
/** `stack`: the strip under the chart (the loop beside the numbers) is never shorter than the numbers' three rows */
export const STACK_STRIP_MIN = 94;

/**
 * `stack`: height of the strip under the chart — about 40% of the panel, between the numbers' height and 112 px. While
 * the heart sounds play, what they are is written under the strip, and the strip keeps only the numbers' height.
 */
export function stackStripHeight(panelHeight: number, soundsOn = false): number {
  if (soundsOn) return STACK_STRIP_MIN;
  return Math.round(Math.min(112, Math.max(STACK_STRIP_MIN, panelHeight * 0.4)));
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
  /** baselines of the lane's rows: two staggered rows, or one on a short chart */
  laneRows: number[];
  /** the pressure plot itself, under the lane */
  press: Band;
  vol: Band;
  phono: Band;
  /** baselines of the heart-sound labels: S1/S2 above the extra sounds when the row has room for two lines, else one */
  soundRows: number[];
}

/** Charts at least this tall stagger the valve labels on two rows; a shorter one has a single row (MC and AC always) */
export const TWO_LANE_ROWS_MIN = 110;
/** The pressure plot keeps at least this height before the other rows give up their minimum sizes */
const PRESS_MIN = 18;

/** The chart's rows for a canvas `H` px tall: the ECG, the event-label lane, pressure, LV volume and the heart sounds */
export function chartRows(H: number): ChartRows {
  const font = H >= 300 ? 12 : 11;
  // (a short chart — a phone held upright — packs the label rows a pixel tighter, and has room for one row of them)
  const pitch = font + (H >= 200 ? 2 : 1);
  const laneCount = H >= TWO_LANE_ROWS_MIN ? 2 : 1;
  const laneH = laneCount * pitch + 3;
  const avail = H - laneH;
  const gap = 0.02 * avail;
  const bottom = 0.01 * avail;
  // The rows keep their old shares of what is left once the lane is taken out (ECG 17%, pressure 41%, volume 19%,
  // sounds 16%), but on a short chart never less than their names and labels need, so nothing is written outside its
  // row or off the canvas: the pressure plot gives up the difference. Only on a chart too short for even that (the
  // panel never draws one) do the rows shrink in proportion, with the labels kept on the canvas.
  let ecgH = Math.max(font + 1, 0.17 * avail - 4);
  let volH = Math.max(font + 2, 0.19 * avail);
  let phonoH = Math.max(font + 3, 0.16 * avail);
  if (H - 4 - ecgH - laneH - volH - phonoH - 3 * gap - bottom < PRESS_MIN) {
    ecgH = 0.17 * avail - 4;
    volH = 0.19 * avail;
    phonoH = 0.16 * avail;
  }
  const ecg = { y0: 4, y1: 4 + ecgH };
  const lane = { y0: ecg.y1 + gap, y1: ecg.y1 + gap + laneH };
  const phono = { y0: H - bottom - phonoH, y1: H - bottom };
  const vol = { y0: phono.y0 - gap - volH, y1: phono.y0 - gap };
  const press = { y0: lane.y1, y1: vol.y0 - gap };
  const twoSoundRows = phonoH >= 2 * pitch + 6;
  const laneRows = laneCount === 2 ? [lane.y0 + font, lane.y0 + font + pitch] : [lane.y0 + font];
  return {
    font,
    ecg,
    lane,
    laneRows,
    press,
    vol,
    phono,
    soundRows: twoSoundRows ? [phono.y0 + font, phono.y0 + font + pitch] : [Math.min(phono.y0 + font, H - 1)],
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
 * fast rates on a narrow chart) is left out; its line is still drawn. With a single row (a short chart) MC and AC come
 * first, and AO and MO are written only where they fit.
 */
export function placeEventLabels(
  marks: { x: number; label: ValveEvent }[],
  width: (label: ValveEvent) => number,
  { gap = 3, rows = 2 }: { gap?: number; rows?: number } = {},
) {
  const second = (l: ValveEvent) => l === 'AO' || l === 'MO';
  const wanted = marks.map((m) => ({ item: m, x: m.x + 3, row: rows > 1 && second(m.label) ? 1 : 0 }));
  if (rows > 1) return fitRows(wanted, (p) => width(p.item.label), gap);
  // one row: the closures (MC, AC) are placed first, the openings fill the gaps left between them
  const w = (p: PlacedLabel<{ x: number; label: ValveEvent }>) => width(p.item.label);
  const firsts = fitRows(wanted.filter((p) => !second(p.item.label)), w, gap);
  const out = [...firsts];
  for (const p of wanted.filter((q) => second(q.item.label)).sort((a, b) => a.x - b.x)) {
    if (out.every((q) => p.x + w(p) + gap <= q.x || q.x + w(q) + gap <= p.x)) out.push(p);
  }
  return out.sort((a, b) => a.x - b.x);
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
