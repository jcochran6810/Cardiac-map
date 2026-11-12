'use client';

import { sim } from '@/lib/sim/simulation';
import { useECGStore } from '@/store/useECGStore';
import { STANDARD_PLACEMENT, isStandard, leadField, type Placement } from '@/lib/ecg/electrodes';
import { onNewPatient } from '@/lib/rhythm';

/** Attach the ECG cables as described and redraw every lead */
export function applyPlacement(p: Placement, hidden = false) {
  sim.engine.setLeadField(isStandard(p) ? null : leadField(p));
  sim.epoch++;
  useECGStore.getState().setPlacementState(p, hidden);
}

/**
 * Put every cable back on its own electrode (and end a "mystery reversal" nobody answered).
 * A reversal is an exercise of the electrode lab. Left on, it would spoil every 12-lead read afterwards — in the
 * simulator and after a mystery reversal with nothing on screen to say that the cables are swapped.
 */
export function standardPlacement() {
  const ecg = useECGStore.getState();
  if (isStandard(ecg.placement) && !ecg.placementHidden) return;
  applyPlacement(STANDARD_PLACEMENT);
}

// a new patient is wired up correctly
onNewPatient(standardPlacement);
