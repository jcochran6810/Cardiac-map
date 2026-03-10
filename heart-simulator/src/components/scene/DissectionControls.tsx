'use client';

import React from 'react';
import { useSceneStore, CAMERA_PRESETS } from '@/store/useSceneStore';
import { useAppStore, ViewMode } from '@/store/useAppStore';

const VIEW_MODES: { value: ViewMode; label: string }[] = [
  { value: 'external', label: 'External' },
  { value: 'internal', label: 'Internal' },
  { value: 'cutaway', label: 'Cutaway' },
  { value: 'sectional', label: 'Sectional' },
  { value: 'dissection', label: 'Dissection' },
  { value: 'coronary', label: 'Coronary Map' },
  { value: 'conduction', label: 'Conduction' },
  { value: 'perfusion', label: 'Perfusion' },
  { value: 'wall-motion', label: 'Wall Motion' },
  { value: 'procedure-overlay', label: 'Procedure' },
  { value: 'imaging-correlation', label: 'Imaging' },
];

const LAYER_GROUPS = [
  'fibrous-pericardium',
  'epicardium',
  'myocardium',
  'endocardium',
  'chambers',
  'valves',
  'great-vessels',
  'coronary-arteries',
  'coronary-veins',
  'conduction',
  'landmarks',
];

export default function DissectionControls() {
  const { dissectionEnabled } = useAppStore();
  const { viewMode, setViewMode } = useAppStore();
  const {
    clipPlane, setClipPlane,
    explodedMode, toggleExploded,
    visibleLayers, setLayerVisibility,
    setCameraPreset,
  } = useSceneStore();

  if (!dissectionEnabled) return null;

  return (
    <div className="absolute top-2 left-2 z-10 bg-cardiac-panel/95 backdrop-blur-sm border border-slate-700 rounded-lg p-3 w-56 max-h-[calc(100%-16px)] overflow-y-auto">
      <h3 className="text-xs font-semibold text-white mb-2">View & Dissection</h3>

      {/* View mode */}
      <div className="mb-3">
        <label className="text-[10px] text-slate-500 uppercase tracking-wider">View Mode</label>
        <div className="grid grid-cols-2 gap-0.5 mt-1">
          {VIEW_MODES.map((vm) => (
            <button
              key={vm.value}
              onClick={() => setViewMode(vm.value)}
              className={`px-1.5 py-1 text-[10px] rounded transition-colors ${
                viewMode === vm.value
                  ? 'bg-cardiac-accent/20 text-cardiac-accent'
                  : 'text-slate-400 hover:text-white hover:bg-cardiac-surface'
              }`}
            >
              {vm.label}
            </button>
          ))}
        </div>
      </div>

      {/* Camera presets */}
      <div className="mb-3">
        <label className="text-[10px] text-slate-500 uppercase tracking-wider">Camera</label>
        <div className="grid grid-cols-2 gap-0.5 mt-1">
          {CAMERA_PRESETS.slice(0, 6).map((preset) => (
            <button
              key={preset.label}
              onClick={() => setCameraPreset(preset)}
              className="px-1.5 py-1 text-[10px] text-slate-400 hover:text-white hover:bg-cardiac-surface rounded transition-colors"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Clip plane */}
      <div className="mb-3">
        <label className="text-[10px] text-slate-500 uppercase tracking-wider">Clipping Plane</label>
        <div className="flex gap-1 mt-1">
          {(['x', 'y', 'z'] as const).map((axis) => (
            <button
              key={axis}
              onClick={() => setClipPlane(clipPlane?.axis === axis ? null : { axis, value: 0 })}
              className={`px-2 py-1 text-[10px] rounded ${
                clipPlane?.axis === axis
                  ? 'bg-cardiac-accent/20 text-cardiac-accent'
                  : 'text-slate-400 hover:text-white bg-cardiac-surface'
              }`}
            >
              {axis.toUpperCase()}
            </button>
          ))}
        </div>
        {clipPlane && (
          <input
            type="range"
            min={-2}
            max={2}
            step={0.01}
            value={clipPlane.value}
            onChange={(e) => setClipPlane({ ...clipPlane, value: Number(e.target.value) })}
            className="w-full mt-1 h-1 accent-cardiac-accent"
          />
        )}
      </div>

      {/* Layer toggles */}
      <div className="mb-3">
        <label className="text-[10px] text-slate-500 uppercase tracking-wider">Layers</label>
        <div className="space-y-0.5 mt-1">
          {LAYER_GROUPS.map((layer) => (
            <label key={layer} className="flex items-center gap-2 text-[10px] text-slate-400 hover:text-white cursor-pointer py-0.5">
              <input
                type="checkbox"
                checked={visibleLayers.includes(layer)}
                onChange={(e) => setLayerVisibility(layer, e.target.checked)}
                className="w-3 h-3 rounded accent-cardiac-accent"
              />
              <span className="capitalize">{layer.replace(/-/g, ' ')}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Exploded view */}
      <button
        onClick={toggleExploded}
        className={`w-full px-2 py-1.5 text-[10px] rounded transition-colors ${
          explodedMode
            ? 'bg-cardiac-accent/20 text-cardiac-accent'
            : 'text-slate-400 hover:text-white bg-cardiac-surface'
        }`}
      >
        {explodedMode ? 'Disable' : 'Enable'} Exploded View
      </button>
    </div>
  );
}
