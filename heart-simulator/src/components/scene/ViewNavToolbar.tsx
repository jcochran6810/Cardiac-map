'use client';

import React, { useState } from 'react';
import { useSceneStore, CAMERA_PRESETS } from '@/store/useSceneStore';
import { useAppStore } from '@/store/useAppStore';

// Icons as simple SVG components for compactness
function RotateLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}

function ZoomInIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}

function ZoomOutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

// Primary view presets with short labels and position in the button grid
const PRIMARY_VIEWS = [
  { label: 'Front', presetLabel: 'Anterior' },
  { label: 'Back', presetLabel: 'Posterior' },
  { label: 'Left', presetLabel: 'Left Lateral' },
  { label: 'Right', presetLabel: 'Right Lateral' },
  { label: 'Top', presetLabel: 'Superior' },
  { label: 'Bottom', presetLabel: 'Inferior' },
];

const ANGIO_VIEWS = [
  { label: 'RAO Cr', presetLabel: 'RAO Cranial' },
  { label: 'LAO Cr', presetLabel: 'LAO Cranial' },
  { label: 'RAO Ca', presetLabel: 'RAO Caudal' },
  { label: 'LAO Ca', presetLabel: 'LAO Caudal' },
];

export default function ViewNavToolbar() {
  const { setCameraPreset } = useSceneStore();
  const { resetView } = useAppStore();
  const [showAngio, setShowAngio] = useState(false);

  const handlePreset = (presetLabel: string) => {
    const preset = CAMERA_PRESETS.find((p) => p.label === presetLabel);
    if (preset) setCameraPreset(preset);
  };

  const handleZoom = (direction: 'in' | 'out') => {
    // Dispatch a synthetic wheel event on the canvas to trigger OrbitControls zoom
    const canvas = document.querySelector('canvas');
    if (canvas) {
      const delta = direction === 'in' ? -300 : 300;
      canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: delta, bubbles: true }));
    }
  };

  const handleReset = () => {
    resetView();
    // Reset camera to default anterior position (looking from -Y toward heart's front)
    setCameraPreset({ position: [0, -3.8, 0], target: [0, 0, 0], fov: 40, label: 'Default' });
  };

  return (
    <div className="absolute bottom-10 right-3 z-10 flex flex-col items-end gap-2">
      {/* Angio views (expandable) */}
      {showAngio && (
        <div className="bg-black/70 backdrop-blur-sm border border-slate-600/50 rounded-lg p-1.5 shadow-xl">
          <div className="text-[9px] text-slate-500 uppercase tracking-wider px-1 mb-1">Angio Views</div>
          <div className="grid grid-cols-2 gap-0.5">
            {ANGIO_VIEWS.map((v) => (
              <button
                key={v.label}
                onClick={() => handlePreset(v.presetLabel)}
                className="px-2 py-1.5 text-[10px] text-slate-300 hover:text-white hover:bg-white/10 rounded transition-colors whitespace-nowrap"
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main navigation group */}
      <div className="bg-black/70 backdrop-blur-sm border border-slate-600/50 rounded-lg shadow-xl overflow-hidden">
        {/* View preset buttons */}
        <div className="p-1.5">
          <div className="grid grid-cols-3 gap-0.5">
            {PRIMARY_VIEWS.map((v) => (
              <button
                key={v.label}
                onClick={() => handlePreset(v.presetLabel)}
                className="px-2.5 py-1.5 text-[10px] font-medium text-slate-300 hover:text-white hover:bg-white/10 rounded transition-colors"
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-600/40" />

        {/* Zoom + Reset + Angio toggle */}
        <div className="p-1.5 flex items-center gap-1">
          <button
            onClick={() => handleZoom('in')}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors"
            title="Zoom in"
          >
            <ZoomInIcon />
          </button>
          <button
            onClick={() => handleZoom('out')}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors"
            title="Zoom out"
          >
            <ZoomOutIcon />
          </button>

          <div className="w-px h-4 bg-slate-600/40 mx-0.5" />

          <button
            onClick={handleReset}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors"
            title="Reset view"
          >
            <HomeIcon />
          </button>

          <div className="w-px h-4 bg-slate-600/40 mx-0.5" />

          <button
            onClick={() => setShowAngio(!showAngio)}
            className={`px-2 py-1 text-[9px] rounded transition-colors ${
              showAngio
                ? 'bg-cardiac-accent/20 text-cardiac-accent'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/10'
            }`}
            title="Angiographic views"
          >
            Angio
          </button>
        </div>
      </div>

      {/* Interaction hint */}
      <div className="hidden sm:block text-[8px] text-slate-600 text-right leading-tight">
        Drag to rotate &middot; Scroll to zoom &middot; Right-drag to pan
      </div>
    </div>
  );
}
