'use client';

import React, { useEffect } from 'react';
import { enterSimulator, leaveSimulator, useSimStore } from '@/store/useSimStore';
import ScenarioPicker from './ScenarioPicker';
import ScenarioRunner from './ScenarioRunner';
import ReviewReport from './ReviewReport';

/** The case simulator: pick a case, run it, read the scored review. */
export default function SimulatorScreen() {
  const state = useSimStore((s) => s.state);
  const reviewOpen = useSimStore((s) => s.reviewOpen);
  const setReviewOpen = useSimStore((s) => s.setReviewOpen);

  // While this screen is open the scenario drives the shared monitor and ECG
  useEffect(() => {
    enterSimulator();
    return () => leaveSimulator();
  }, []);

  return (
    <div className="flex-1 min-h-0 relative bg-cardiac-dark" aria-label="Case simulator">
      {!state ? (
        <ScenarioPicker />
      ) : state.ended && reviewOpen ? (
        <ReviewReport onBack={() => setReviewOpen(false)} />
      ) : (
        <ScenarioRunner onReview={() => setReviewOpen(true)} />
      )}
    </div>
  );
}
