'use client';

import React, { useEffect, useState } from 'react';
import { enterSimulator, leaveSimulator, useSimStore } from '@/store/useSimStore';
import ScenarioPicker from './ScenarioPicker';
import ScenarioRunner from './ScenarioRunner';
import ReviewReport from './ReviewReport';

/** The case simulator: pick a case, run it, read the scored review. */
export default function SimulatorScreen() {
  const state = useSimStore((s) => s.state);
  const [showReview, setShowReview] = useState(false);

  // While this screen is open the scenario drives the shared monitor and ECG
  useEffect(() => {
    enterSimulator();
    return () => leaveSimulator();
  }, []);
  useEffect(() => {
    if (!state?.ended) setShowReview(false);
  }, [state?.ended]);

  return (
    <div className="flex-1 min-h-0 relative bg-cardiac-dark" aria-label="Case simulator">
      {!state ? (
        <ScenarioPicker />
      ) : state.ended && showReview ? (
        <ReviewReport onBack={() => setShowReview(false)} />
      ) : (
        <ScenarioRunner onReview={() => setShowReview(true)} />
      )}
    </div>
  );
}
