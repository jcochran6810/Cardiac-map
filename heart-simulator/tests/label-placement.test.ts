import { describe, expect, it } from 'vitest';
import {
  TAG_GAP, TOUCH_MARGIN, boxesHit, distanceTo, findSlot, leaderLine, leastCrowdedSlot, nearestFreeSlot, segmentHits, slotOrder, touchMargins, type Box, type PlaceOptions,
} from '@/components/scene/labelPlacement';

const opts = (o: Partial<PlaceOptions> = {}): PlaceOptions => ({ width: 400, height: 300, placed: [], cover: [], gap: 2, rows: 2, ...o });

/** a 60 × 20 tag whose dot is at (100, 100): its natural box starts 4 px right of the dot, its bottom 3 px below it */
const tag = (o: PlaceOptions) => findSlot(100, 104, 83, 60, 20, o);

describe('name tag placement', () => {
  it('tries the dot\'s row first (right, then left), then rows further out', () => {
    expect(slotOrder(1)).toEqual([
      { flip: false, row: 0 }, { flip: true, row: 0 },
      { flip: false, row: -1 }, { flip: false, row: 1 }, { flip: true, row: -1 }, { flip: true, row: 1 },
    ]);
    expect(slotOrder(3)).toHaveLength(14);
  });

  it('keeps a tag beside its dot when there is room', () => {
    expect(tag(opts())).toEqual({ dx: 0, dy: 0, box: { x0: 104, y0: 83, x1: 164, y1: 103 } });
  });

  it('flips a tag to the left of its dot, mirrored, before moving it off the row', () => {
    const s = tag(opts({ placed: [{ x0: 110, y0: 80, x1: 200, y1: 100 }] }));
    expect(s?.dy).toBe(0);
    expect(s?.box).toEqual({ x0: 36, y0: 83, x1: 96, y1: 103 });
  });

  it('never puts a tag under a control drawn over the heart', () => {
    // a toolbar covers the dot's row and the row above, down to just under the dot
    const cover: Box[] = [{ x0: 0, y0: 0, x1: 400, y1: 60 }, { x0: 0, y0: 60, x1: 400, y1: 100 }];
    const s = tag(opts({ cover }));
    expect(s).not.toBeNull();
    expect(cover.some((c) => boxesHit(s!.box, c))).toBe(false);
    expect(s!.dy).toBe(22); // one row down: the tag's height plus the gap
    // and a control margin: a toolbar reaching 1 px further pushes it a row further
    expect(tag(opts({ cover: [{ x0: 0, y0: 0, x1: 400, y1: 104 }] }))?.dy).toBe(44);
  });

  it('keeps tags apart by the gap, which is wider on touch screens', () => {
    const placed = [{ x0: 104, y0: 105, x1: 164, y1: 125 }];
    expect(tag(opts({ placed, gap: TAG_GAP.mouse }))?.dy).toBe(0);
    // 2 px apart is too close for fingers: the tag moves to the other side of its dot when that is far enough…
    expect(tag(opts({ placed, gap: 6 }))?.box.x1).toBe(96);
    // … and a row up when it is not (the tag on the left would still be within the touch gap of the other)
    expect(tag(opts({ placed, gap: TAG_GAP.touch }))?.dy).toBe(-(20 + TAG_GAP.touch));
  });

  it('keeps tags inside the view', () => {
    // a dot near the right edge: the natural slot would spill off, so the tag goes to the left
    const s = findSlot(380, 384, 83, 60, 20, opts());
    expect(s?.box.x1).toBeLessThanOrEqual(400);
    expect(s?.box.x0).toBe(316);
    // a dot off the view: nowhere to go
    expect(findSlot(-50, -46, -40, 60, 20, opts())).toBeNull();
  });

  it('gives up when every slot beside the dot is taken', () => {
    expect(tag(opts({ rows: 1, placed: [{ x0: 0, y0: 50, x1: 400, y1: 140 }] }))).toBeNull();
  });

  it('keeps touch tags further apart than their invisible margins reach', () => {
    expect(TAG_GAP.touch).toBeGreaterThan(TOUCH_MARGIN.y);
    expect(TAG_GAP.touch).toBeGreaterThan(TOUCH_MARGIN.x);
    // a column of dots 12 px apart, each tag placed in turn as on a touch screen: no tag's invisible margin reaches
    // the visible part of another, so a tap on any visible tag reaches that tag
    const o = opts({ rows: 3, gap: TAG_GAP.touch, placed: [] });
    for (let k = 0; k < 6; k++) {
      const s = findSlot(150, 154, 60 + 12 * k + 3 - 22, 70, 22, o);
      if (s) o.placed.push(s.box);
    }
    expect(o.placed.length).toBeGreaterThan(3);
    const margin = (b: Box): Box => ({ x0: b.x0 - TOUCH_MARGIN.x, y0: b.y0 - TOUCH_MARGIN.y, x1: b.x1 + TOUCH_MARGIN.x, y1: b.y1 + TOUCH_MARGIN.y });
    for (const a of o.placed) for (const b of o.placed) if (a !== b) expect(boxesHit(margin(a), b)).toBe(false);
  });

  it('puts a tag that must show at the nearest free place further out, never on its own dot', () => {
    // a crowd fills the dot's row and the rows above and below it, right across the view
    const o = opts({ rows: 1, placed: [{ x0: 0, y0: 50, x1: 400, y1: 140 }] });
    const s = nearestFreeSlot(100, 100, 104, 83, 60, 20, o, 120);
    expect(s).not.toBeNull();
    expect(o.placed.some((p) => boxesHit(s!.box, p, o.gap))).toBe(false);
    // just below the crowd (the gap kept), about 40 px from the dot
    expect(s!.box.y0).toBeGreaterThanOrEqual(142);
    expect(distanceTo(s!.box, 100, 100)).toBeLessThan(52);
    // with the crowd reaching the bottom of the view it goes above it
    const up = nearestFreeSlot(100, 100, 104, 83, 60, 20, opts({ placed: [{ x0: 0, y0: 50, x1: 400, y1: 300 }] }), 120);
    expect(up!.box.y1).toBeLessThanOrEqual(48);
    // never over its own dot, even when that is the only free spot near it
    const ring: Box[] = [
      { x0: 0, y0: 0, x1: 400, y1: 85 }, { x0: 0, y0: 115, x1: 400, y1: 300 },
      { x0: 0, y0: 85, x1: 60, y1: 115 }, { x0: 140, y0: 85, x1: 400, y1: 115 },
    ];
    expect(nearestFreeSlot(100, 100, 104, 83, 40, 20, opts({ placed: ring }), 120)).toBeNull();
    // and nothing beyond its reach
    expect(nearestFreeSlot(100, 100, 104, 83, 60, 20, opts({ placed: [{ x0: 0, y0: 0, x1: 400, y1: 230 }] }), 100)).toBeNull();
    const far = nearestFreeSlot(100, 100, 104, 83, 60, 20, opts({ placed: [{ x0: 0, y0: 0, x1: 400, y1: 230 }] }), 140);
    expect(far!.box.y0).toBeGreaterThanOrEqual(232);
    expect(far!.box.y0).toBeLessThanOrEqual(240);
  });

  it('would rather draw a leader line around the other tags than through them', () => {
    expect(segmentHits(0, 0, 100, 100, { x0: 40, y0: 40, x1: 60, y1: 60 })).toBe(true);
    expect(segmentHits(0, 0, 100, 0, { x0: 40, y0: 10, x1: 60, y1: 30 })).toBe(false);
    expect(segmentHits(0, 0, 30, 30, { x0: 40, y0: 40, x1: 60, y1: 60 })).toBe(false);
    // a dot boxed in by four tags. The nearest free place is just below the one under it (22 px away), but its line
    // would cross that tag; every place above crosses one too. Out to the right (52 px) the line runs clear.
    const placed: Box[] = [
      { x0: 60, y0: 60, x1: 103, y1: 94 }, { x0: 104, y0: 70, x1: 150, y1: 88 },
      { x0: 60, y0: 102, x1: 150, y1: 120 }, { x0: 0, y0: 60, x1: 58, y1: 140 },
    ];
    const s = nearestFreeSlot(100, 100, 104, 89, 30, 14, opts({ rows: 1, placed }), 120);
    expect(s).not.toBeNull();
    const end = { x: Math.min(Math.max(100, s!.box.x0), s!.box.x1), y: Math.min(Math.max(100, s!.box.y0), s!.box.y1) };
    expect(placed.some((p) => segmentHits(100, 100, end.x, end.y, p))).toBe(false);
    expect(s!.box.x0).toBeGreaterThanOrEqual(152);
    expect(distanceTo(s!.box, 100, 100)).toBeLessThan(60);
  });

  it('crams a tag that must show where it crowds least: past the view\'s edge before over a control or a tag', () => {
    // a low view whose left part is a toolbar; every place inside the view either covers the tag's own dot or
    // goes under the toolbar. Cut off by the right edge is better than hidden under the toolbar.
    const o = opts({ width: 200, height: 30, rows: 1, cover: [{ x0: 0, y0: 0, x1: 140, y1: 30 }] });
    const s = leastCrowdedSlot(150, 15, 154, -2, 60, 20, o, 120);
    expect(s.box.x1).toBeGreaterThan(200);
    expect(o.cover.some((c) => boxesHit(s.box, c))).toBe(false);
    // the same with another tag there instead of the toolbar
    const t = leastCrowdedSlot(150, 15, 154, -2, 60, 20, { ...o, cover: [], placed: [{ x0: 0, y0: 0, x1: 140, y1: 30 }] }, 120);
    expect(t.box.x0).toBeGreaterThanOrEqual(140 + o.gap);
    // where every place overlaps another tag, the least overlap wins, and the gap counts
    const crowd = opts({ rows: 0, gap: TAG_GAP.touch, width: 200, height: 40, placed: [{ x0: 0, y0: 0, x1: 200, y1: 12 }] });
    expect(leastCrowdedSlot(100, 30, 104, 13, 60, 20, crowd, 120).box.y1).toBe(40); // as low as the view allows
  });

  it('cuts back a crammed touch tag\'s invisible margin where it would reach another tag', () => {
    const full = { top: TOUCH_MARGIN.y, right: TOUCH_MARGIN.x, bottom: TOUCH_MARGIN.y, left: TOUCH_MARGIN.x };
    const a: Box = { x0: 100, y0: 100, x1: 160, y1: 122 };
    // a tag the full gap away keeps the whole margin, on both tags
    expect(touchMargins([a, { x0: 100, y0: 122 + TAG_GAP.touch, x1: 160, y1: 154 }])).toEqual([full, full]);
    // one crammed 5 px above: both give up what would reach the other, and only on that side
    const above: Box = { x0: 104, y0: 73, x1: 194, y1: 95 };
    const [ma, mb] = touchMargins([a, above]);
    expect(ma).toEqual({ ...full, top: 5 });
    expect(mb).toEqual({ ...full, bottom: 5 });
    // diagonally close: the side that keeps more of the margin is cut
    const corner: Box = { x0: 40, y0: 80, x1: 97, y1: 96 }; // 3 px to the left, 4 px above
    expect(touchMargins([a, corner])[0]).toEqual({ ...full, top: 4 });
    // no margin, cut back or not, ever covers the other tag
    const grow = (b: Box, m: { top: number; right: number; bottom: number; left: number }): Box => ({ x0: b.x0 - m.left, y0: b.y0 - m.top, x1: b.x1 + m.right, y1: b.y1 + m.bottom });
    const boxes = [a, above, corner, { x0: 165, y0: 100, x1: 200, y1: 122 }];
    touchMargins(boxes).forEach((m, i) => boxes.forEach((b, j) => i !== j && expect(boxesHit(grow(boxes[i], m), b)).toBe(false)));
  });

  it('draws a leader line only for a tag that moved away from its dot', () => {
    expect(leaderLine({ x0: 104, y0: 83, x1: 164, y1: 103 }, 100, 100)).toBeNull();
    expect(leaderLine({ x0: 36, y0: 83, x1: 96, y1: 103 }, 100, 100)).toBeNull();
    const line = leaderLine({ x0: 104, y0: 39, x1: 164, y1: 59 }, 100, 100);
    expect(line?.length).toBeCloseTo(Math.hypot(4, 41));
    expect(line?.angle).toBeCloseTo(Math.atan2(-41, 4));
  });
});
