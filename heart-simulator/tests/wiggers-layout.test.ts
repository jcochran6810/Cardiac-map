import { describe, expect, it } from 'vitest';
import { ECGEngine, cycleEvents } from '@/lib/ecg/engine';
import { HemoModel } from '@/lib/physiology/hemodynamics';
import { auscultate, type SoundKind } from '@/lib/physiology/heartSounds';
import {
  LOOP_MIN_HEIGHT,
  chartRows,
  placeEventLabels,
  placeSoundLabels,
  rowLoopWidth,
  wiggersLayout,
  type ValveEvent,
} from '@/components/physiology/wiggersLayout';

// The chart's sizes as WiggersPanel draws it: a 44-px margin on the left, 8 px on the right, 2.6 s across
const WINDOW_MS = 2600;
const T = 20_000;
const textWidth = (font: number) => (s: string) => s.length * font * 0.62;

function chartWindow(profile: string, hr: number, canvasW: number) {
  const engine = new ECGEngine(profile, hr);
  engine.ensure(T + 3_000);
  const hemo = new HemoModel(engine);
  const left = 44;
  const plotW = canvasW - 8 - left;
  const t0 = T - WINDOW_MS;
  const X = (t: number) => left + ((t - t0) * plotW) / WINDOW_MS;
  const marks: { x: number; label: ValveEvent; beat: number }[] = [];
  for (let i = Math.max(0, engine.lastVentIndex(t0) - 1); i <= engine.lastVentIndex(T); i++) {
    const ev = cycleEvents(engine.vent[i], engine.vent[i + 1] ?? null);
    for (const [t, label] of [[ev.mc, 'MC'], [ev.ao, 'AO'], [ev.ac, 'AC'], [ev.mo, 'MO']] as [number, ValveEvent][]) {
      if (t >= t0 && t <= T) marks.push({ x: X(t), label, beat: i });
    }
  }
  const sounds = auscultate(engine, hemo, t0, T).sounds.map((s) => ({ x: X(s.t), kind: s.kind }));
  return { marks, sounds, left };
}

/** no two labels on the same row touch */
function expectApart(placed: { x: number; row: number; w: number }[], gap = 3) {
  for (const r of [0, 1]) {
    const row = placed.filter((p) => p.row === r).sort((a, b) => a.x - b.x);
    for (let i = 1; i < row.length; i++) expect(row[i].x).toBeGreaterThanOrEqual(row[i - 1].x + row[i - 1].w + gap);
  }
}

describe('Wiggers panel layout', () => {
  it('picks the arrangement from the panel’s own size', () => {
    // phone held upright: the default drawer, and the same drawer during a lesson
    expect(wiggersLayout(390, 256)).toBe('stack');
    expect(wiggersLayout(390, 239)).toBe('stack');
    // phone on its side, and the desktop drawer under the 3D heart and a reading: too short for a loop above the numbers
    expect(wiggersLayout(844, 220)).toBe('row');
    expect(wiggersLayout(1440, 254)).toBe('row');
    expect(wiggersLayout(1440, 292)).toBe('row');
    // tablet, and the desktop drawer beside a lesson
    expect(wiggersLayout(820, 374)).toBe('column');
    expect(wiggersLayout(1008, 712)).toBe('column');
  });

  it('never squeezes the PV loop below a readable height when the panel has the room', () => {
    // a column only where a full-height loop still leaves room for Listen, its legend and the numbers under it
    for (let h = 100; h <= 900; h += 2) {
      if (wiggersLayout(900, h) === 'column') expect(h - LOOP_MIN_HEIGHT).toBeGreaterThanOrEqual(190);
    }
    // side by side, the loop has the panel's whole height and is about as wide as it is tall
    for (const [w, h] of [[844, 220], [1440, 254], [1440, 300], [700, 330]]) {
      expect(wiggersLayout(w, h)).toBe('row');
      expect(h).toBeGreaterThanOrEqual(LOOP_MIN_HEIGHT);
      expect(rowLoopWidth(w, h)).toBeGreaterThanOrEqual(LOOP_MIN_HEIGHT);
      expect(rowLoopWidth(w, h)).toBeLessThanOrEqual(Math.max(LOOP_MIN_HEIGHT, h));
    }
    // and the chart keeps most of the width
    expect(rowLoopWidth(844, 220)).toBeLessThanOrEqual(844 * 0.25);
  });

  it('stacks the chart rows without overlap, with a lane for the valve labels above the pressure curves', () => {
    for (let H = 100; H <= 900; H += 7) {
      const r = chartRows(H);
      expect(r.font).toBeGreaterThanOrEqual(11);
      expect(r.font).toBeLessThanOrEqual(12);
      expect(r.ecg.y0).toBeLessThan(r.ecg.y1);
      expect(r.ecg.y1).toBeLessThanOrEqual(r.lane.y0);
      // the pressure plot starts under the lane: no label sits on a curve
      expect(r.press.y0).toBe(r.lane.y1);
      expect(r.press.y1).toBeLessThanOrEqual(r.vol.y0);
      expect(r.vol.y1).toBeLessThanOrEqual(r.phono.y0);
      expect(r.phono.y1).toBeLessThanOrEqual(H);
      // both label rows fit in the lane, a full line apart
      expect(r.laneRows[0] - r.font).toBeGreaterThanOrEqual(r.lane.y0 - 0.01);
      expect(r.laneRows[1] - r.laneRows[0]).toBeGreaterThanOrEqual(r.font + 1 - 1e-9);
      expect(r.laneRows[1]).toBeLessThanOrEqual(r.lane.y1 - 2);
      // the heart-sound labels stay on the sound trace's row
      for (const y of r.soundRows) {
        expect(y - r.font).toBeGreaterThanOrEqual(r.phono.y0 - 0.01);
        expect(y).toBeLessThanOrEqual(r.phono.y1);
      }
      if (r.soundRows.length > 1) expect(r.soundRows[1] - r.soundRows[0]).toBeGreaterThanOrEqual(r.font + 1 - 1e-9);
    }
    // labels big enough to read: 12 px on a tall chart, 11 px on a phone
    expect(chartRows(690).font).toBe(12);
    expect(chartRows(122).font).toBe(11);
    // a tall chart gives the extra heart sounds a row of their own
    expect(chartRows(690).soundRows).toHaveLength(2);
  });

  it('staggers MC and AO (and AC and MO) on two rows so no valve label runs into another', () => {
    for (const [profile, hr] of [['normal-sinus', 60], ['normal-sinus', 100], ['normal-sinus', 150], ['aortic-stenosis', 70]] as [string, number][]) {
      for (const canvasW of [390, 560, 748, 1180]) {
        const font = canvasW < 500 ? 11 : 12;
        const w = textWidth(font);
        const { marks } = chartWindow(profile, hr, canvasW);
        const placed = placeEventLabels(marks, w);
        expectApart(placed.map((p) => ({ x: p.x, row: p.row, w: w(p.item.label) })));
        for (const p of placed) {
          // each label sits just right of its own line, on its pair's row
          expect(p.x).toBeGreaterThan(p.item.x);
          expect(p.x - p.item.x).toBeLessThanOrEqual(4);
          expect(p.row).toBe(p.item.label === 'AO' || p.item.label === 'MO' ? 1 : 0);
        }
        // at a resting rate every event gets its label, even on a phone
        if (hr <= 100) expect(placed).toHaveLength(marks.length);
      }
    }
  });

  it('writes S1 and S2 next to their sounds, and fits the extra sounds in without collisions', () => {
    const name = (k: SoundKind) => ({ s1: 'S1', s2: 'S2', s3: 'S3', s4: 'S4', snap: 'OS' })[k];
    for (const profile of ['normal-sinus', 'aortic-stenosis', 'mitral-stenosis', 'mitral-regurgitation']) {
      for (const canvasW of [390, 748, 1180]) {
        for (const rows of [1, 2]) {
          const font = canvasW < 500 ? 11 : 12;
          const w = (k: SoundKind) => textWidth(font)(name(k));
          const { sounds } = chartWindow(profile, 0, canvasW);
          const placed = placeSoundLabels(sounds, w, rows);
          expectApart(placed.map((p) => ({ x: p.x, row: p.row, w: w(p.item.kind) })));
          // S1 and S2 are never the ones left out
          const main = sounds.filter((s) => s.kind === 's1' || s.kind === 's2');
          expect(placed.filter((p) => p.item.kind === 's1' || p.item.kind === 's2')).toHaveLength(main.length);
          for (const p of placed) {
            // within a few pixels of its sound, on the left only for S4 (just before S1) or a crowded S2
            const gapToSound = p.x < p.item.x ? p.item.x - (p.x + w(p.item.kind)) : p.x - p.item.x;
            expect(gapToSound).toBeLessThanOrEqual(4);
            if (p.x < p.item.x) expect(['s4', 's2']).toContain(p.item.kind);
            expect(p.row).toBe(rows > 1 && p.item.kind !== 's1' && p.item.kind !== 's2' ? 1 : 0);
          }
        }
      }
    }
  });

  it('moves S2 to the left of its sound on a narrow chart when the opening snap follows close behind', () => {
    const w = (k: SoundKind) => textWidth(11)(k === 'snap' ? 'OS' : k.toUpperCase());
    const { sounds } = chartWindow('mitral-stenosis', 0, 390);
    expect(sounds.some((s) => s.kind === 'snap')).toBe(true);
    const placed = placeSoundLabels(sounds, w, 1);
    const s2 = placed.filter((p) => p.item.kind === 's2');
    expect(s2.length).toBeGreaterThan(0);
    expect(s2.some((p) => p.x < p.item.x)).toBe(true);
    // and the snap still gets its name
    expect(placed.some((p) => p.item.kind === 'snap')).toBe(true);
  });

  it('keeps sound labels clear of the row’s own name', () => {
    const w = (k: SoundKind) => textWidth(11)(k.toUpperCase());
    const { sounds, left } = chartWindow('aortic-stenosis', 0, 390);
    const nameEnd = left + 4 + 70;
    const placed = placeSoundLabels(sounds, w, 1, { taken: [nameEnd] });
    expect(placed.length).toBeGreaterThan(0);
    for (const p of placed) expect(p.x).toBeGreaterThanOrEqual(nameEnd + 3);
  });
});
