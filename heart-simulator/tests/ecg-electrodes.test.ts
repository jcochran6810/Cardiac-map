import { describe, expect, it } from 'vitest';
import { ELECTRODES, PLACEMENT_PRESETS, STANDARD_PLACEMENT, applyPreset, describePlacement, isStandard, leadField, presetFor, swapCables } from '@/lib/ecg/electrodes';
import { ALL_LEADS, LEAD_VECTORS, scale } from '@/lib/ecg/vector';
import { add, expectVec } from './helpers';

describe('electrode → lead derivation', () => {
  it('reproduces the reference lead vectors with standard placement', () => {
    const field = leadField(STANDARD_PLACEMENT);
    for (const lead of ALL_LEADS) expectVec(field[lead], LEAD_VECTORS[lead]);
  });

  it("keeps Einthoven's and Goldberger's identities for every possible cable swap", () => {
    for (const a of ELECTRODES) {
      for (const b of ELECTRODES) {
        if (a === b) continue;
        const f = leadField(swapCables(STANDARD_PLACEMENT, a, b));
        expectVec(add(f.I, f.III), f.II);
        expectVec(add(add(f.aVR, f.aVL), f.aVF), [0, 0, 0]);
      }
    }
  });
});

describe('classic limb-lead reversals', () => {
  const std = leadField(STANDARD_PLACEMENT);
  const swapped = (a: (typeof ELECTRODES)[number], b: (typeof ELECTRODES)[number]) => leadField(swapCables(STANDARD_PLACEMENT, a, b));

  it('LA ↔ RA inverts lead I, swaps II/III and aVR/aVL, leaves aVF and the chest leads alone', () => {
    const f = swapped('LA', 'RA');
    expectVec(f.I, scale(std.I, -1));
    expectVec(f.II, std.III);
    expectVec(f.III, std.II);
    expectVec(f.aVR, std.aVL);
    expectVec(f.aVL, std.aVR);
    expectVec(f.aVF, std.aVF);
    for (const v of ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'] as const) expectVec(f[v], std[v]);
  });

  it('LA ↔ LL swaps I/II and aVL/aVF, inverts III, leaves aVR alone', () => {
    const f = swapped('LA', 'LL');
    expectVec(f.I, std.II);
    expectVec(f.II, std.I);
    expectVec(f.III, scale(std.III, -1));
    expectVec(f.aVL, std.aVF);
    expectVec(f.aVF, std.aVL);
    expectVec(f.aVR, std.aVR);
  });

  it('RA ↔ LL inverts all three limb leads (I → −III, III → −I) and swaps aVR/aVF', () => {
    const f = swapped('RA', 'LL');
    expectVec(f.I, scale(std.III, -1));
    expectVec(f.II, scale(std.II, -1));
    expectVec(f.III, scale(std.I, -1));
    expectVec(f.aVR, std.aVF);
    expectVec(f.aVF, std.aVR);
    expectVec(f.aVL, std.aVL);
  });

  it('a neutral (RL) reversal flattens one limb lead: RA ↔ RL flattens II, LA ↔ RL flattens III', () => {
    expectVec(swapped('RA', 'RL').II, [0, 0, 0]);
    expectVec(swapped('LA', 'RL').III, [0, 0, 0]);
  });
});

describe('placement helpers', () => {
  it('swapping twice restores the placement and never mutates the input', () => {
    const before = { ...STANDARD_PLACEMENT };
    const once = swapCables(STANDARD_PLACEMENT, 'V1', 'V2');
    expect(STANDARD_PLACEMENT).toEqual(before);
    expect(swapCables(once, 'V1', 'V2')).toEqual(STANDARD_PLACEMENT);
  });

  it('round-trips every teaching preset and names the reversal', () => {
    for (const preset of PLACEMENT_PRESETS) {
      const p = applyPreset(preset);
      expect(isStandard(p)).toBe(false);
      expect(presetFor(p)).toBe(preset);
      const text = describePlacement(p)!;
      expect(text).toContain('↔');
      for (const e of preset.swap) expect(text).toContain(e);
    }
  });

  it('reports nothing wrong with standard placement', () => {
    expect(isStandard(STANDARD_PLACEMENT)).toBe(true);
    expect(describePlacement(STANDARD_PLACEMENT)).toBeNull();
    expect(presetFor(STANDARD_PLACEMENT)).toBeNull();
  });
});
