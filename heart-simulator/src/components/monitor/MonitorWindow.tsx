'use client';

import React, { useEffect, useState } from 'react';
import SimulationDriver from '@/components/sim/SimulationDriver';
import MonitorDisplay from '@/components/monitor/MonitorDisplay';
import { CHANNEL, type MonitorMessage } from '@/lib/sim/projector';
import { mirrorRemote } from '@/lib/sim/defib';
import { setRhythm } from '@/lib/actions';
import { useECGStore } from '@/store/useECGStore';
import { useTimelineStore } from '@/store/useTimelineStore';

/** Full-screen monitor mirrored from the main CardioSim window (projector / second screen). */
export default function MonitorWindow() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = (e: MessageEvent<MonitorMessage | string>) => {
      const m = e.data;
      if (typeof m === 'string') return;
      setConnected(true);
      const tl = useTimelineStore.getState();
      if (useECGStore.getState().activeProfileId !== m.profileId || tl.heartRate !== m.hr) setRhythm(m.profileId, m.hr);
      if (tl.playing !== m.playing || tl.speed !== m.speed) useTimelineStore.setState({ playing: m.playing, speed: m.speed });
      mirrorRemote(m);
    };
    ch.postMessage('hello');
    document.title = 'CardioSim — Monitor';
    return () => ch.close();
  }, []);

  return (
    <div className="h-screen w-screen bg-black p-2 flex flex-col">
      <SimulationDriver />
      <div className="flex-1 min-h-0">
        <MonitorDisplay large />
      </div>
      {!connected && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-center p-6">
          <div>
            <div className="text-slate-200 text-lg font-semibold">Waiting for the CardioSim window…</div>
            <p className="text-slate-400 text-sm mt-1">Open Monitor / Defib in the main window and press “Projector”. This screen mirrors it.</p>
          </div>
        </div>
      )}
    </div>
  );
}
