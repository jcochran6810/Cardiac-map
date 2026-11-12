/**
 * Where the 3D heart's name tags go on screen (CSS px from the view's top-left).
 *
 * Every frame each tag is put in the first free slot near its dot: beside it on the right, then on the left, then a
 * row up or down, further out for the tags a lesson points at. A slot is free when it stays inside the view and
 * clear of the tags already placed and of the controls drawn over the heart, so no tag ever hides under a button.
 * A tag that must show and finds no slot beside its dot takes the nearest free place further out (a leader line
 * joins it to its dot); only when there is none at all does it overlap something, and then the view's edge before
 * another tag or a control.
 */

export interface Box { x0: number; y0: number; x1: number; y1: number }

export interface Slot {
  /** how far the tag moved from its natural place */
  dx: number;
  dy: number;
  box: Box;
}

export interface PlaceOptions {
  /** the view's size: a tag must stay inside it */
  width: number;
  height: number;
  /** the tags placed so far this frame */
  placed: Box[];
  /** the parts of the view covered by the overlay's controls */
  cover: Box[];
  /** the least space between two tags */
  gap: number;
  /** how many rows up or down a tag may move from its dot (a row is the tag's height plus the gap) */
  rows: number;
}

/** On a touch screen each tag has an invisible margin that makes it a finger-sized target: this far (px) beyond its sides, and above and below it */
export const TOUCH_MARGIN = { x: 6, y: 9 };
/**
 * The least space between two tags. On a touch screen it is wider than a tag's invisible margin, so the margin of
 * one never reaches the visible part of another, whichever of the two is drawn on top.
 */
export const TAG_GAP = { mouse: 2, touch: Math.max(TOUCH_MARGIN.x, TOUCH_MARGIN.y) + 1 };
/** the least space between a tag and a control */
const COVER_MARGIN = 2;
/** half the size of the space kept clear around a dot */
export const DOT = 4;
/** the grids, in px, on which a tag that must show looks for a free place further from its dot, and for the least crowded one */
const STEP = { free: 10, crowded: 16 };

/** do the boxes overlap, or come closer than `gap`? */
export function boxesHit(a: Box, b: Box, gap = 0): boolean {
  return a.x0 < b.x1 + gap && a.x1 + gap > b.x0 && a.y0 < b.y1 + gap && a.y1 + gap > b.y0;
}

function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

/** The slots to try, nearest first: on the dot's row (right, then left), then one row up and down, and so on */
export function slotOrder(rows: number): { flip: boolean; row: number }[] {
  const out: { flip: boolean; row: number }[] = [];
  for (let r = 0; r <= rows; r++) {
    for (const flip of [false, true]) for (const row of r === 0 ? [0] : [-r, r]) out.push({ flip, row });
  }
  return out;
}

/** The box of a w × h tag whose natural top-left corner is (x, y), moved to a slot; a flipped tag mirrors about the dot at `anchorX` */
function slotBox(anchorX: number, x: number, y: number, w: number, h: number, gap: number, s: { flip: boolean; row: number }): Slot {
  const dx = s.flip ? 2 * (anchorX - x) - w : 0;
  const dy = s.row * (h + gap);
  return { dx, dy, box: { x0: x + dx, y0: y + dy, x1: x + dx + w, y1: y + dy + h } };
}

/** is the box clear of the tags already placed (by the gap) and of the controls (by their margin)? */
function free(b: Box, o: PlaceOptions): boolean {
  return !o.placed.some((p) => boxesHit(b, p, o.gap)) && !o.cover.some((c) => boxesHit(b, c, COVER_MARGIN));
}

/**
 * The first free slot for the tag, or null when every one is taken (or off the view). Given the dot's height
 * `anchorY`, a slot whose leader line would run through another tag does not count as free either (a tag that must
 * show then looks further out, where such a line only costs extra).
 */
export function findSlot(anchorX: number, x: number, y: number, w: number, h: number, o: PlaceOptions, anchorY?: number): Slot | null {
  for (const s of slotOrder(o.rows)) {
    const slot = slotBox(anchorX, x, y, w, h, o.gap, s);
    const b = slot.box;
    if (b.x0 < 0 || b.y0 < 0 || b.x1 > o.width || b.y1 > o.height) continue;
    if (!free(b, o)) continue;
    if (anchorY !== undefined && crossings(b, anchorX, anchorY, o.placed) > 0) continue;
    return slot;
  }
  return null;
}

/** how far the dot at (ax, ay) is from the nearest point of the box (0 inside it) */
export function distanceTo(b: Box, ax: number, ay: number): number {
  return Math.hypot(Math.max(b.x0 - ax, 0, ax - b.x1), Math.max(b.y0 - ay, 0, ay - b.y1));
}

/** `from` and every `step` px from it, both ways, that lie in [lo, hi], and the two ends */
function steps(from: number, lo: number, hi: number, step: number): number[] {
  if (hi < lo) return [];
  if (hi === lo) return [lo];
  const out = [lo, hi];
  for (let v = from - Math.floor((from - lo) / step) * step; v <= hi; v += step) if (v > lo && v < hi) out.push(v);
  return out;
}

/**
 * Calls `visit` with every place for a w × h tag inside the view within `reach` px of its dot at (anchorX, anchorY),
 * on a `step` px grid that runs through its natural top-left corner (x, y), and with `d`, how far the place is from
 * the dot. None of them covers the tag's own dot. (It runs every frame for each crowded tag: no allocations per place.)
 */
function eachGridPlace(
  anchorX: number, anchorY: number, x: number, y: number, w: number, h: number, o: PlaceOptions, reach: number, step: number,
  visit: (x0: number, y0: number, d: number) => void,
): void {
  const ys = steps(y, Math.max(0, anchorY - reach - h), Math.min(o.height - h, anchorY + reach), step);
  for (const x0 of steps(x, Math.max(0, anchorX - reach - w), Math.min(o.width - w, anchorX + reach), step)) {
    const ex = Math.max(x0 - anchorX, 0, anchorX - x0 - w);
    for (const y0 of ys) {
      // (strictly inside the box around its own dot: the tag would cover it)
      if (x0 < anchorX + DOT && x0 + w > anchorX - DOT && y0 < anchorY + DOT && y0 + h > anchorY - DOT) continue;
      const ey = Math.max(y0 - anchorY, 0, anchorY - y0 - h);
      const d = Math.sqrt(ex * ex + ey * ey);
      if (d <= reach) visit(x0, y0, d);
    }
  }
}

/** The options with only the tags and controls that reach the part of the view within `reach` of the dot (the rest cannot matter) */
function near(anchorX: number, anchorY: number, w: number, h: number, o: PlaceOptions, reach: number): PlaceOptions {
  const area: Box = { x0: anchorX - reach - w, y0: anchorY - reach - h, x1: anchorX + reach + w, y1: anchorY + reach + h };
  const pad = Math.max(o.gap, COVER_MARGIN);
  return { ...o, placed: o.placed.filter((p) => boxesHit(p, area, pad)), cover: o.cover.filter((c) => boxesHit(c, area, pad)) };
}

/** Does the segment from (x0, y0) to (x1, y1) pass through the box? (Liang–Barsky clipping) */
export function segmentHits(x0: number, y0: number, x1: number, y1: number, b: Box): boolean {
  let lo = 0, hi = 1;
  const dx = x1 - x0, dy = y1 - y0;
  for (const [p, q] of [[-dx, x0 - b.x0], [dx, b.x1 - x0], [-dy, y0 - b.y0], [dy, b.y1 - y0]]) {
    if (p === 0) {
      if (q <= 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) lo = Math.max(lo, r);
    else hi = Math.min(hi, r);
    if (lo >= hi) return false;
  }
  return true;
}

/** How much further a place seems for each tag its leader line would cross (a line through other tags is hard to follow) */
const CROSSING = 40;

/** How many of the tags the leader line from the dot to the box would run through (none when no line is drawn) */
function crossings(b: Box, anchorX: number, anchorY: number, placed: Box[]): number {
  if (distanceTo(b, anchorX, anchorY) < 12) return 0;
  const ex = Math.min(Math.max(anchorX, b.x0), b.x1), ey = Math.min(Math.max(anchorY, b.y0), b.y1);
  return placed.filter((p) => segmentHits(anchorX, anchorY, ex, ey, p)).length;
}

/**
 * For a tag that must show and has no free slot beside its dot: the nearest free place within `reach` px of the dot,
 * anywhere around it (a leader line joins them), or null when there is none. A place whose leader line would cross
 * another tag counts as CROSSING px further for each; between two as near, the one nearer its natural place.
 */
export function nearestFreeSlot(anchorX: number, anchorY: number, x: number, y: number, w: number, h: number, o: PlaceOptions, reach: number): Slot | null {
  const local = near(anchorX, anchorY, w, h, o, reach);
  const best: { box: Box | null; d: number; t: number } = { box: null, d: Infinity, t: Infinity };
  eachGridPlace(anchorX, anchorY, x, y, w, h, o, reach, STEP.free, (x0, y0, d) => {
    const t = Math.abs(x0 - x) + Math.abs(y0 - y);
    if (d > best.d || (d === best.d && t >= best.t)) return; // (only a place that may be nearer is worth checking)
    const box = { x0, y0, x1: x0 + w, y1: y0 + h };
    if (!free(box, local)) return;
    const eff = d + CROSSING * crossings(box, anchorX, anchorY, local.placed);
    if (eff < best.d || (eff === best.d && t < best.t)) Object.assign(best, { box, d: eff, t });
  });
  return best.box ? { dx: best.box.x0 - x, dy: best.box.y0 - y, box: best.box } : null;
}

/**
 * What a crowded place costs, in px² of tag: the part cut off by the view's edge counts once (it cannot be read,
 * but a tap there does nothing wrong); the part over another tag, gap included, counts three times (it takes that
 * tag's taps, and on a touch screen a tag's invisible margin reaches into the gap); the part under a control three
 * times too (it is hidden, and a tap aimed at it works the control). Each px further from the dot adds two.
 */
const COST = { edge: 1, tag: 3, control: 3, distance: 2 };

/**
 * For a tag that must show even when no place near its dot is free: the place that costs least (see COST) among
 * the slots beside the dot and the places within `reach` of it.
 */
export function leastCrowdedSlot(anchorX: number, anchorY: number, x: number, y: number, w: number, h: number, o: PlaceOptions, reach: number): Slot {
  const view: Box = { x0: 0, y0: 0, x1: o.width, y1: o.height };
  const local = near(anchorX, anchorY, w, h, o, reach);
  const cost = (b: Box, d: number) => {
    const spaced = { x0: b.x0 - o.gap, y0: b.y0 - o.gap, x1: b.x1 + o.gap, y1: b.y1 + o.gap };
    let c = COST.edge * (w * h - overlapArea(b, view)) + COST.distance * d;
    for (const p of local.placed) c += COST.tag * overlapArea(spaced, p);
    for (const k of local.cover) c += COST.control * overlapArea(b, k);
    return c;
  };
  // the slots beside the dot first (they may reach past the view's edge), then the places further out
  const best = { slot: slotBox(anchorX, x, y, w, h, o.gap, { flip: false, row: 0 }), cost: Infinity };
  for (const s of slotOrder(o.rows)) {
    const slot = slotBox(anchorX, x, y, w, h, o.gap, s);
    const c = cost(slot.box, distanceTo(slot.box, anchorX, anchorY));
    if (c < best.cost) Object.assign(best, { slot, cost: c });
  }
  eachGridPlace(anchorX, anchorY, x, y, w, h, o, reach, STEP.crowded, (x0, y0, d) => {
    if (COST.distance * d >= best.cost) return; // (already further than the best place costs in all)
    const box = { x0, y0, x1: x0 + w, y1: y0 + h };
    const c = cost(box, d);
    if (c < best.cost) Object.assign(best, { slot: { dx: x0 - x, dy: y0 - y, box }, cost: c });
  });
  return best.slot;
}

/** A short line from the dot (at 0, 0) to the nearest point of a tag that had to move away from it; null when the tag is beside its dot */
export function leaderLine(box: Box, anchorX: number, anchorY: number, min = 12): { length: number; angle: number } | null {
  const cx = Math.min(Math.max(anchorX, box.x0), box.x1) - anchorX;
  const cy = Math.min(Math.max(anchorY, box.y0), box.y1) - anchorY;
  const length = Math.hypot(cx, cy);
  return length < min ? null : { length, angle: Math.atan2(cy, cx) };
}

export interface Margins { top: number; right: number; bottom: number; left: number }

/**
 * The invisible touch margin of each placed tag, side by side: the full TOUCH_MARGIN, cut back on any side where it
 * would reach another tag. Tags placed in free slots are TAG_GAP apart and keep it all; a tag that had to be crammed
 * in closer gives up what would cover its neighbour, so a tap on the visible part of a tag always reaches that tag.
 * (Where two tags overlap outright no margin can help; the cost of a crowded place keeps that rare.)
 */
export function touchMargins(boxes: Box[], m = TOUCH_MARGIN): Margins[] {
  return boxes.map((a) => {
    const out: Margins = { top: m.y, right: m.x, bottom: m.y, left: m.x };
    for (const b of boxes) {
      if (b === a) continue;
      // does b reach into a's margin as it stands?
      if (!(b.x0 < a.x1 + out.right && b.x1 > a.x0 - out.left && b.y0 < a.y1 + out.bottom && b.y1 > a.y0 - out.top)) continue;
      const above = a.y0 - b.y1, below = b.y0 - a.y1, before = a.x0 - b.x1, after = b.x0 - a.x1;
      // b is clear of a on one side or two (diagonally): give up the margin on the side that keeps the most of it
      const sides = ([['top', above], ['bottom', below], ['left', before], ['right', after]] as const).filter(([, d]) => d >= 0);
      if (!sides.length) continue; // they overlap: nothing to cut
      const [side, d] = sides.reduce((x, y) => (y[1] > x[1] ? y : x));
      out[side] = Math.min(out[side], Math.floor(d));
    }
    return out;
  });
}
