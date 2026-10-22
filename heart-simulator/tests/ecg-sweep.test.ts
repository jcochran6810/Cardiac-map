import { describe, expect, it } from 'vitest';
import { eraseSpan, sampleTimes, windowStart, xInWindow } from '@/lib/ecg/sweep';

// Desktop 12-lead at 25 mm/s: an awkward page length like the real layout produces
const pxPerMs = (3.6470588235294117 * 25) / 1000;
const page = 12705.806451612903;

describe('ECG sweep geometry', () => {
  it('starts every page of a full-width strip at the left edge and ends it at the right edge', () => {
    const w = page * pxPerMs;
    for (let k = 1; k <= 500; k++) {
      const ws = k * page;
      expect(xInWindow(ws, ws, page, pxPerMs)).toBe(0);
      expect(xInWindow(ws + page, ws, page, pxPerMs)).toBeCloseTo(w, 6);
    }
  });

  it('the old modulo mapping put some page starts at the right edge (the straight-line bug)', () => {
    const atRightEdge = Array.from({ length: 500 }, (_, i) => (i + 1) * page).filter((ws) => (((ws % page) + page) % page) > page / 2);
    expect(atRightEdge.length).toBeGreaterThan(0);
  });

  it('returns null outside the window', () => {
    const ws = 3 * page;
    expect(xInWindow(ws - 1.5, ws, page / 4, pxPerMs)).toBeNull();
    expect(xInWindow(ws + page / 4 + 1, ws, page / 4, pxPerMs)).toBeNull();
    expect(xInWindow(ws + page / 8, ws, page / 4, pxPerMs)).toBeCloseTo((page / 8) * pxPerMs, 9);
  });

  it('finds the window that contains a time, for strips with an offset', () => {
    const offset = page / 2;
    for (const t of [0, 1, 1234.5, page, 10 * page + 17, 99_999.9]) {
      const ws = windowStart(t, offset, page);
      expect(ws).toBeLessThanOrEqual(t + 1e-6);
      expect(t - ws).toBeLessThan(page + 1e-6);
      expect(Math.abs(((ws - offset) / page) - Math.round((ws - offset) / page))).toBeLessThan(1e-9);
    }
  });
});

describe('monitor sweep sampling', () => {
  it('draws a segment even when a frame is shorter than the sample step (120 Hz phone)', () => {
    expect(sampleTimes(1000, 1008.3, 23)).toEqual([1000, 1008.3]);
  });

  it('steps through long frames and always ends exactly at the frame end', () => {
    const ts = sampleTimes(0, 100, 23);
    expect(ts).toEqual([0, 23, 46, 69, 92, 100]);
  });

  it('joins consecutive frames into one continuous line', () => {
    let t = 5000;
    for (let f = 0; f < 50; f++) {
      const next = t + 8.3;
      const ts = sampleTimes(t, next, 23);
      expect(ts[0]).toBe(t);
      expect(ts[ts.length - 1]).toBe(next);
      t = next;
    }
  });
});

describe('the sweep erases ahead of the trace, never over it', () => {
  const PEN = 1.35; // line width in CSS px
  it('a continuing sweep leaves the newest trace whole at any screen density and pace', () => {
    for (const dpr of [1, 1.5, 2, 2.625, 3]) {
      for (const pxPerFrame of [0.2, 0.7, 1.3, 2.5, 6]) {
        let x = 37.3;
        for (let f = 0; f < 50; f++) {
          const next = x + pxPerFrame;
          const [d0, d1] = eraseSpan(x, next, 14, dpr, 4000, false);
          // the piece drawn last frame ends at x, its round end reaching PEN / 2 further
          expect(d0 / dpr).toBeGreaterThanOrEqual(x + PEN / 2);
          // and everything the new piece will cover past x + 1 was wiped this frame or earlier
          expect(d1 / dpr).toBeGreaterThanOrEqual(next + 14);
          x = next;
        }
      }
    }
  });

  it('a new sweep wipes from the left edge; the erase stays inside the strip', () => {
    expect(eraseSpan(0, 3, 14, 2.625, 800, true)[0]).toBe(0);
    expect(eraseSpan(290, 300, 14, 2, 600, false)[1]).toBe(600);
  });
});
