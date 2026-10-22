/**
 * Sweep geometry for the ECG strips.
 *
 * A strip shows the time windows [k·page + offset, k·page + offset + dur]; the rhythm strip,
 * monitor and inspect views have dur === page, the 12-lead columns show one window in four.
 * Positions are measured from the window's own start. Working them out with `t % page` instead
 * lets rounding put the first sample of about half the pages at the right edge, and the pen then
 * draws a straight line across the whole strip.
 */

/** Allowed rounding error (ms) when deciding whether a time is inside a window */
const EPS = 1e-6;

/** Start time of the window that contains t */
export function windowStart(t: number, offset: number, page: number): number {
  return Math.floor((t - offset) / page) * page + offset;
}

/** x (px from the strip's left edge) of time t in the window starting at ws, or null if t is outside it */
export function xInWindow(t: number, ws: number, dur: number, pxPerMs: number): number | null {
  const rel = t - ws;
  if (rel < -EPS || rel > dur + EPS) return null;
  return Math.min(dur, Math.max(0, rel)) * pxPerMs;
}

/**
 * Sample times for drawing (t0, t1] one frame at a time: every `step` ms from t0, always ending
 * exactly at t1. The next frame starts where this one ended, so frames join into one line even
 * when a frame is shorter than `step` (a 120 Hz phone drawing a narrow trace).
 */
export function sampleTimes(t0: number, t1: number, step: number): number[] {
  const out: number[] = [];
  for (let t = t0; t < t1; t += step) out.push(t);
  out.push(t1);
  return out;
}

/**
 * Device-pixel columns [d0, d1) a frame erases before drawing the trace from xu to xv (CSS px): the gap ahead of
 * the cursor, and on a new sweep the left edge too. It never reaches back over the trace already drawn — erasing
 * from behind the cursor nibbled a sliver off the newest trace every frame, so it came out thin and dashed.
 */
export function eraseSpan(xu: number, xv: number, gapPx: number, dpr: number, widthDevice: number, newSweep: boolean): [number, number] {
  const from = newSweep ? 0 : xu + 1; // the pen is 1.35 px wide: its round end reaches 0.7 px past xu
  return [Math.max(0, Math.ceil(from * dpr)), Math.min(widthDevice, Math.ceil((xv + gapPx) * dpr))];
}
