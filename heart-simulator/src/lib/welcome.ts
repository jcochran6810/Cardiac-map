/**
 * The first-visit welcome card's state, kept outside the component so the phone's Back button (lib/backNav.ts)
 * can close it the way "Decide later" does.
 */
import { create } from 'zustand';
import type { LearningLevel } from '@/store/useAppStore';

const KEY = 'cardiosim.welcomed';

/** Has this device been through the welcome (or already chosen a role in an earlier version)? */
export function welcomeSeen(): boolean {
  try {
    return !!window.localStorage.getItem(KEY) || !!window.localStorage.getItem('cardiosim.level');
  } catch {
    return true; // storage unavailable: asking on every visit would be worse than not asking
  }
}

interface WelcomeState {
  /** the card is on screen (set by the card itself when it mounts on a first visit) */
  open: boolean;
  /** the role the learner picked on the card, if they picked one */
  picked: LearningLevel | null;
  /** the card was put off without a role: tell the learner which role they have and where to change it */
  notice: boolean;
}

export const useWelcomeStore = create<WelcomeState>(() => ({ open: false, picked: null, notice: false }));

/** Close the card for good (Decide later, Look around first, Start, Esc or the phone's Back) */
export function closeWelcome() {
  try { window.localStorage.setItem(KEY, '1'); } catch { /* storage unavailable */ }
  useWelcomeStore.setState((s) => ({ open: false, notice: s.picked === null }));
}
