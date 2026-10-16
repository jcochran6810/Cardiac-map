'use client';

import { sim } from '@/lib/sim/simulation';
import { useECGStore } from '@/store/useECGStore';
import { isStandard, leadField, type Placement } from '@/lib/ecg/electrodes';

/** Attach the ECG cables as described and redraw every lead */
export function applyPlacement(p: Placement, hidden = false) {
  sim.engine.setLeadField(isStandard(p) ? null : leadField(p));
  sim.epoch++;
  useECGStore.getState().setPlacementState(p, hidden);
}
