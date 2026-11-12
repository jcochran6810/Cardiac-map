import { ecgChanged } from '@/lib/sim/scenario/engine';
import type { Verdict } from '@/lib/sim/scenario/reads';
import type { EndReason, SimState } from '@/lib/sim/scenario/types';

/**
 * How a finished case is announced, in a heading and one line. The action column (large screens, a phone on its side)
 * and the phone's bottom bar say the same, so a hand-off with critical steps missing never reads as a finished case.
 */
export function endedSummary(reason: EndReason, outcome?: string): { title: string; text: string } {
  // a hand-off also ends the case as complete: the review's outcome says what was still missing
  const handedOver = reason === 'complete' && !!outcome && !outcome.startsWith('Every critical');
  if (handedOver) return { title: 'Patient handed over', text: outcome! };
  if (reason === 'complete') return { title: 'Case complete', text: 'Every critical step for your role is done.' };
  if (reason === 'death') return { title: 'The patient died', text: 'There was no return of circulation.' };
  return { title: 'Case ended', text: 'You ended the case early.' };
}

/** What the 12-lead tab says about the tracing it shows */
export type TwelveLeadNote =
  | { kind: 'emt' } // reading is outside EMT scope: transmit it
  | { kind: 'ask' } // the read is open now
  | { kind: 'queued' } // its read comes once the question open now is answered
  | { kind: 'unread' } // the case ended before it was read
  | { kind: 'verdict'; verdict: Verdict; minute: number } // your read of this tracing
  | { kind: 'unchanged'; readAt: number } // a repeat that matched the tracing read at `readAt`
  | { kind: 'none' };

/**
 * `changed`: the patient's rhythm is no longer the one on this tracing, so what the tab draws below it (always the live
 * rhythm) is not what was recorded — said after the case too, where the review sets your read above it, and in an arrest.
 * `canRepeat`: a repeat 12-lead can still record the change — not once the case is over, and not without a pulse (a
 * 12-lead is no arrest tool).
 */
export function twelveLeadNote(state: SimState): { note: TwelveLeadNote; changed: boolean; canRepeat: boolean } {
  const last = state.lastEcg;
  const ended = !!state.ended;
  const canRepeat = !ended && state.pulse;
  if (!last) return { note: { kind: 'none' }, changed: false, canRepeat };
  // the engine's rule for a repeat 12-lead: another rhythm, or the same one at a rate out of the band it was read in
  const changed = ecgChanged(last, state.rhythm);
  const read = state.reads.filter((r) => r.kind === 'ecg').at(-1);
  let note: TwelveLeadNote;
  if (state.role === 1) note = { kind: 'emt' };
  else if (state.pendingRead?.kind === 'ecg') note = ended ? { kind: 'unread' } : { kind: 'ask' };
  else if (state.queuedReads.some((r) => r.kind === 'ecg')) note = ended ? { kind: 'unread' } : { kind: 'queued' };
  else if (read && read.minute === last.minute) note = { kind: 'verdict', verdict: read.verdict, minute: read.minute };
  else if (read) note = { kind: 'unchanged', readAt: read.minute };
  else note = { kind: 'none' };
  return { note, changed, canRepeat };
}
