/**
 * Where the 3D heart's name tags go on screen (CSS px from the view's top-left).
 *
 * Every frame each tag is put in the first free slot near its dot: beside it on the right, then on the left, then a
 * row up or down, further out for the tags a lesson points at. A slot is free when it stays inside the view and
 * clear of the tags already placed and of the controls drawn over the heart, so no tag ever hides under a button.
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

/** the least space between a tag and a control */
const COVER_MARGIN = 2;

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

/** The first free slot for the tag, or null when every one is taken (or off the view) */
export function findSlot(anchorX: number, x: number, y: number, w: number, h: number, o: PlaceOptions): Slot | null {
  for (const s of slotOrder(o.rows)) {
    const slot = slotBox(anchorX, x, y, w, h, o.gap, s);
    const b = slot.box;
    if (b.x0 < 0 || b.y0 < 0 || b.x1 > o.width || b.y1 > o.height) continue;
    if (o.placed.some((p) => boxesHit(b, p, o.gap)) || o.cover.some((c) => boxesHit(b, c, COVER_MARGIN))) continue;
    return slot;
  }
  return null;
}

/** For a tag that must show even when no slot is free: the slot it overlaps least (other tags, controls, the view's edge) */
export function leastCrowdedSlot(anchorX: number, x: number, y: number, w: number, h: number, o: PlaceOptions): Slot {
  const view: Box = { x0: 0, y0: 0, x1: o.width, y1: o.height };
  let best: Slot | null = null;
  let bestScore = Infinity;
  for (const s of slotOrder(o.rows)) {
    const slot = slotBox(anchorX, x, y, w, h, o.gap, s);
    let score = w * h - overlapArea(slot.box, view);
    for (const p of o.placed) score += overlapArea(slot.box, p);
    for (const c of o.cover) score += overlapArea(slot.box, c);
    if (score < bestScore) {
      best = slot;
      bestScore = score;
    }
  }
  return best!;
}

/** A short line from the dot (at 0, 0) to the nearest point of a tag that had to move away from it; null when the tag is beside its dot */
export function leaderLine(box: Box, anchorX: number, anchorY: number, min = 12): { length: number; angle: number } | null {
  const cx = Math.min(Math.max(anchorX, box.x0), box.x1) - anchorX;
  const cy = Math.min(Math.max(anchorY, box.y0), box.y1) - anchorY;
  const length = Math.hypot(cx, cy);
  return length < min ? null : { length, angle: Math.atan2(cy, cx) };
}
