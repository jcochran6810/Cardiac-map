'use client';

/**
 * Projector / second-screen monitor: the main window broadcasts the patient and device state
 * over a BroadcastChannel; the /monitor page mirrors it on its own simulation clock.
 * Works between windows of the same browser (e.g. a laptop driving a projector).
 */
import { useECGStore } from '@/store/useECGStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { useDefibStore, type DefibState } from '@/lib/sim/defib';
import { sim } from '@/lib/sim/simulation';

export const CHANNEL = 'cardiosim-monitor';

export interface MonitorMessage {
  profileId: string;
  hr: number;
  playing: boolean;
  speed: number;
  baseline: DefibState['baseline'];
  defib: Pick<DefibState, 'mode' | 'energy' | 'sync' | 'charge' | 'message' | 'pacer' | 'vitals' | 'nibp' | 'shocks' | 'trainee' | 'cpr' | 'aed'>;
  /** ages (ms) rather than absolute times, because each window has its own clock */
  ages: { code: number | null; epi: number | null; shock: number | null; cpr: number | null };
}

let channel: BroadcastChannel | null = null;
let started = false;

function snapshot(): MonitorMessage {
  const d = useDefibStore.getState();
  const tl = useTimelineStore.getState();
  const t = sim.time;
  return {
    profileId: useECGStore.getState().activeProfileId,
    hr: tl.heartRate,
    playing: tl.playing,
    speed: tl.speed,
    baseline: d.baseline,
    defib: { mode: d.mode, energy: d.energy, sync: d.sync, charge: d.charge, message: d.message, pacer: d.pacer, vitals: d.vitals, nibp: d.nibp, shocks: d.shocks, trainee: d.trainee, cpr: d.cpr, aed: d.aed },
    ages: {
      code: d.codeStart !== null ? t - d.codeStart : null,
      epi: d.lastEpi !== null ? t - d.lastEpi : null,
      shock: d.lastShock > -1e8 ? t - d.lastShock : null,
      cpr: d.cpr.on ? t - d.cpr.cycleStart : null,
    },
  };
}

function startBroadcast() {
  if (started || typeof BroadcastChannel === 'undefined') return;
  started = true;
  channel = new BroadcastChannel(CHANNEL);
  const send = () => channel?.postMessage(snapshot());
  useDefibStore.subscribe(send);
  useECGStore.subscribe(send);
  useTimelineStore.subscribe(send);
  channel.onmessage = (e) => { if (e.data === 'hello') send(); };
  window.setInterval(send, 2000);
  send();
}

export function openProjector() {
  startBroadcast();
  window.open('/monitor', 'cardiosim-monitor', 'popup,width=1280,height=720');
}
