import { describe, expect, it } from 'vitest';
import { boxesHit, findSlot, leaderLine, leastCrowdedSlot, slotOrder, type Box, type PlaceOptions } from '@/components/scene/labelPlacement';

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
    expect(tag(opts({ placed, gap: 2 }))?.dy).toBe(0);
    // 2 px apart is too close for fingers: the tag moves to the other side of its dot
    expect(tag(opts({ placed, gap: 6 }))?.box.x1).toBe(96);
  });

  it('keeps tags inside the view', () => {
    // a dot near the right edge: the natural slot would spill off, so the tag goes to the left
    const s = findSlot(380, 384, 83, 60, 20, opts());
    expect(s?.box.x1).toBeLessThanOrEqual(400);
    expect(s?.box.x0).toBe(316);
    // a dot off the view: nowhere to go
    expect(findSlot(-50, -46, -40, 60, 20, opts())).toBeNull();
  });

  it('gives up when every slot is taken; a tag that must show goes where it overlaps least', () => {
    const o = opts({ rows: 1, placed: [{ x0: 0, y0: 50, x1: 400, y1: 140 }] });
    expect(tag(o)).toBeNull();
    const forced = leastCrowdedSlot(100, 104, 83, 60, 20, { ...o, placed: [{ x0: 0, y0: 50, x1: 400, y1: 120 }] });
    // the row below sticks out of the crowd furthest
    expect(forced.dy).toBe(22);
    // the gap counts: on the right the tag would sit flush under another along its whole length, on the left it
    // only clips a corner of one. Pressed flush, a touch tag's margin would take the other's taps: the left wins.
    const placed = [{ x0: 104, y0: 60, x1: 164, y1: 82 }, { x0: 0, y0: 100, x1: 40, y1: 110 }];
    const touchGap = opts({ rows: 0, gap: 6, placed });
    expect(tag(touchGap)).toBeNull();
    expect(leastCrowdedSlot(100, 104, 83, 60, 20, touchGap).box.x1).toBe(96);
    expect(leastCrowdedSlot(100, 104, 83, 60, 20, { ...touchGap, gap: 0 }).box.x1).toBe(164);
  });

  it('draws a leader line only for a tag that moved away from its dot', () => {
    expect(leaderLine({ x0: 104, y0: 83, x1: 164, y1: 103 }, 100, 100)).toBeNull();
    expect(leaderLine({ x0: 36, y0: 83, x1: 96, y1: 103 }, 100, 100)).toBeNull();
    const line = leaderLine({ x0: 104, y0: 39, x1: 164, y1: 59 }, 100, 100);
    expect(line?.length).toBeCloseTo(Math.hypot(4, 41));
    expect(line?.angle).toBeCloseTo(Math.atan2(-41, 4));
  });
});
