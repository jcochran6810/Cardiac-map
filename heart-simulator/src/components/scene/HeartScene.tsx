'use client';

import React, { Suspense, useRef, useMemo, useCallback, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Html, Environment, ContactShadows, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useSceneStore } from '@/store/useSceneStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { useAppStore } from '@/store/useAppStore';
import { useECGStore, ECGLead } from '@/store/useECGStore';

// ─── Anatomical region map ─────────────────────────────────────────────
// Maps 3D zones on the normalized heart model to structure IDs.
// The model is centered at origin, scale 1.4. Coordinates are in model-local space.
// Z axis is roughly superior-inferior, Y is anterior-posterior, X is left-right.
interface AnatomyZone {
  id: string;
  name: string;
  test: (p: THREE.Vector3) => number; // returns confidence 0-1
}

const ANATOMY_ZONES: AnatomyZone[] = [
  // ─── Great vessels (top of heart, Z > 0.5) ─────────────────────
  // Aortic arch: superior-left
  { id: 'aortic-arch', name: 'Aortic Arch',
    test: (p) => {
      if (p.z <= 0.6 || p.x > -0.05) return 0;
      return 0.92;
    }},
  // Ascending aorta: superior-center, slightly left/posterior
  { id: 'ascending-aorta', name: 'Ascending Aorta',
    test: (p) => {
      if (p.z <= 0.5) return 0;
      if (p.x < 0.15 && p.x > -0.15 && p.y < 0.1) return 0.9;
      return 0;
    }},
  // Pulmonary trunk: superior-center, slightly right/anterior
  { id: 'pulmonary-trunk', name: 'Pulmonary Trunk',
    test: (p) => {
      if (p.z <= 0.5) return 0;
      if (p.x >= -0.05 && p.y >= 0.0) return 0.88;
      return 0;
    }},
  // SVC: superior-right-posterior
  { id: 'svc', name: 'Superior Vena Cava',
    test: (p) => {
      if (p.z <= 0.5) return 0;
      if (p.x > 0.15 && p.y < 0.0) return 0.88;
      return 0;
    }},

  // ─── Atrial appendages (higher priority than atria) ────────────
  { id: 'right-atrial-appendage', name: 'Right Atrial Appendage',
    test: (p) => {
      if (p.z < 0.2 || p.z > 0.55) return 0;
      if (p.x > 0.28 && p.y > 0.08) return 0.93;
      return 0;
    }},
  { id: 'left-atrial-appendage', name: 'Left Atrial Appendage',
    test: (p) => {
      if (p.z < 0.15 || p.z > 0.5) return 0;
      if (p.x < -0.25 && p.y > -0.05) return 0.93;
      return 0;
    }},

  // ─── Valve plane (Z ~ 0.05 to 0.2, between atria and ventricles) ──
  // Aortic valve: center, slightly left-anterior, at the base of ascending aorta
  { id: 'aortic-valve-rcc', name: 'Aortic Valve',
    test: (p) => {
      if (p.z < 0.35 || p.z > 0.55) return 0;
      const dx = p.x + 0.05, dy = p.y - 0.05;
      if (dx * dx + dy * dy < 0.03) return 0.95;
      return 0;
    }},
  // Pulmonary valve: center-right-anterior, at the base of pulmonary trunk
  { id: 'pulmonary-valve-cusps', name: 'Pulmonary Valve',
    test: (p) => {
      if (p.z < 0.35 || p.z > 0.55) return 0;
      const dx = p.x - 0.1, dy = p.y - 0.15;
      if (dx * dx + dy * dy < 0.03) return 0.95;
      return 0;
    }},
  // Tricuspid valve: right side, at AV junction
  { id: 'tricuspid-annulus', name: 'Tricuspid Valve',
    test: (p) => {
      if (p.z < 0.0 || p.z > 0.2) return 0;
      if (p.x > 0.05 && p.x < 0.3 && Math.abs(p.y - 0.05) < 0.15) return 0.88;
      return 0;
    }},
  // Mitral valve: left side, at AV junction
  { id: 'mitral-annulus', name: 'Mitral Valve',
    test: (p) => {
      if (p.z < 0.0 || p.z > 0.2) return 0;
      if (p.x < -0.05 && p.x > -0.3 && Math.abs(p.y + 0.05) < 0.15) return 0.88;
      return 0;
    }},

  // ─── Atria (upper-mid region, Z ~ 0.1 to 0.5) ─────────────────
  { id: 'right-atrium', name: 'Right Atrium',
    test: (p) => {
      if (p.z < 0.1 || p.z > 0.5) return 0;
      if (p.x > 0.05) return 0.8;
      return 0;
    }},
  { id: 'left-atrium', name: 'Left Atrium',
    test: (p) => {
      if (p.z < 0.1 || p.z > 0.5) return 0;
      if (p.x < -0.05) return 0.8;
      return 0;
    }},

  // ─── IVC (inferior-posterior-right) ─────────────────────────────
  { id: 'ivc', name: 'Inferior Vena Cava',
    test: (p) => {
      if (p.z > -0.35 || p.z < -0.7) return 0;
      if (p.x > 0.1 && p.y < -0.1) return 0.85;
      return 0;
    }},

  // ─── Interventricular septum (anterior groove between ventricles) ──
  { id: 'interventricular-septum', name: 'Interventricular Septum',
    test: (p) => {
      if (p.z > 0.1 || p.z < -0.55) return 0;
      if (Math.abs(p.x) < 0.1 && p.y > 0.12) return 0.85;
      return 0;
    }},

  // ─── Coronary arteries on the surface ───────────────────────────
  // LAD: runs in the anterior interventricular groove
  { id: 'lad-proximal', name: 'LAD Proximal',
    test: (p) => {
      if (p.z < 0.15 || p.z > 0.4) return 0;
      if (Math.abs(p.x) < 0.08 && p.y > 0.15) return 0.9;
      return 0;
    }},
  { id: 'lad-mid', name: 'LAD Mid',
    test: (p) => {
      if (p.z < -0.15 || p.z > 0.15) return 0;
      if (Math.abs(p.x) < 0.08 && p.y > 0.15) return 0.9;
      return 0;
    }},
  { id: 'lad-distal', name: 'LAD Distal',
    test: (p) => {
      if (p.z < -0.5 || p.z > -0.15) return 0;
      if (Math.abs(p.x) < 0.1 && p.y > 0.1) return 0.9;
      return 0;
    }},
  // LCx: runs in the left AV groove (left side, mid-height)
  { id: 'lcx-proximal', name: 'Left Circumflex (LCx)',
    test: (p) => {
      if (p.z < 0.0 || p.z > 0.2) return 0;
      if (p.x < -0.15 && p.y > -0.1 && p.y < 0.1) return 0.87;
      return 0;
    }},
  // RCA: runs in the right AV groove
  { id: 'rca-mid', name: 'RCA Mid',
    test: (p) => {
      if (p.z < -0.05 || p.z > 0.2) return 0;
      if (p.x > 0.2 && Math.abs(p.y) < 0.12) return 0.87;
      return 0;
    }},

  // ─── Ventricles (lower region, Z ~ -0.65 to 0.1) ──────────────
  { id: 'right-ventricle', name: 'Right Ventricle',
    test: (p) => {
      if (p.z > 0.1 || p.z < -0.65) return 0;
      // Anterior and right side
      if (p.y > -0.05 && p.x > -0.05) return 0.75;
      return 0;
    }},
  { id: 'left-ventricle', name: 'Left Ventricle',
    test: (p) => {
      if (p.z > 0.1 || p.z < -0.65) return 0;
      // Posterior and/or left side
      if (p.y <= -0.05 || p.x <= -0.05) return 0.75;
      return 0;
    }},

  // ─── Apex (very bottom tip) ─────────────────────────────────────
  { id: 'apex', name: 'Apex',
    test: (p) => p.z < -0.6 ? 0.9 : 0 },

  // ─── Base of heart (broad top between atria and vessels) ────────
  { id: 'base-of-heart', name: 'Base of Heart',
    test: (p) => {
      if (p.z < 0.4 || p.z > 0.55) return 0;
      return 0.6;
    }},
];

function identifyRegion(point: THREE.Vector3): AnatomyZone | null {
  let best: AnatomyZone | null = null;
  let bestScore = 0;
  for (const zone of ANATOMY_ZONES) {
    const score = zone.test(point);
    if (score > bestScore) {
      bestScore = score;
      best = zone;
    }
  }
  return bestScore > 0.05 ? best : null;
}

// Reverse lookup: given a structure ID from the menu, where should we highlight?
const STRUCTURE_CENTERS: Record<string, [number, number, number]> = {
  // Coordinate system: X = right(+)/left(-), Y = posterior(+)/anterior(-), Z = superior(+)/inferior(-)
  // Chambers — positioned at the visible center of each chamber
  // RV is the most anterior chamber (most -Y), wraps around the LV
  // LA is the most posterior chamber (most +Y)
  // RA is anterior-right, LV is posterior-left
  'right-atrium': [0.3, -0.08, 0.25],
  'left-atrium': [-0.2, 0.15, 0.3],
  'right-ventricle': [0.15, -0.18, -0.12],
  'left-ventricle': [-0.15, 0.0, -0.25],
  'right-atrial-appendage': [0.35, -0.2, 0.35],
  'left-atrial-appendage': [-0.38, -0.08, 0.35],
  // Septa & Landmarks
  'interatrial-septum': [0.05, 0.02, 0.28],
  'interventricular-septum': [0.0, -0.05, -0.15],
  'fossa-ovalis': [0.05, 0.0, 0.25],
  'apex': [0.05, -0.05, -0.75],
  'base-of-heart': [0.0, 0.05, 0.52],
  // Valves — at their annular positions between chambers and outflow
  'mitral-annulus': [-0.12, 0.05, 0.08],
  'aortic-valve-rcc': [-0.05, -0.05, 0.42],
  'tricuspid-annulus': [0.15, -0.02, 0.05],
  'pulmonary-valve-cusps': [0.08, -0.15, 0.45],
  // Great Vessels — along the vessel paths above the base
  // Aorta: center-left, slightly anterior, exits superiorly
  'ascending-aorta': [-0.05, -0.05, 0.62],
  'aortic-arch': [-0.12, -0.05, 0.75],
  // Pulmonary trunk: anterior and to the right of aorta
  'pulmonary-trunk': [0.1, -0.15, 0.58],
  // SVC: enters RA from above, right-posterior
  'svc': [0.3, 0.05, 0.6],
  // IVC: enters RA from below, right-posterior
  'ivc': [0.25, 0.08, -0.55],
  // Pericardium & Layers — staggered outward from center so labels don't overlap
  'fibrous-pericardium': [0.0, -0.42, 0.05],
  'epicardium': [0.15, -0.35, 0.1],
  'myocardium': [-0.25, -0.3, -0.05],
  'endocardium': [-0.12, -0.12, -0.1],
  // Subvalvular structures — inside the LV/RV
  'anterolateral-papillary-muscle': [-0.2, -0.1, -0.38],
  'posteromedial-papillary-muscle': [-0.08, 0.12, -0.38],
  'moderator-band': [0.15, -0.1, -0.32],
  'crista-terminalis': [0.32, -0.05, 0.25],
  // Coronary arteries — Left system
  // LMCA originates from left aortic sinus, travels anteriorly
  'lmca': [-0.1, -0.1, 0.48],
  // LAD runs in anterior interventricular sulcus (anterior surface)
  'lad-proximal': [0.0, -0.22, 0.3],
  'lad-mid': [0.0, -0.25, 0.0],
  'lad-distal': [0.0, -0.22, -0.3],
  'd1': [-0.12, -0.25, 0.12],
  'd2': [-0.1, -0.23, -0.08],
  // LCx runs posteriorly in left AV groove
  'lcx-proximal': [-0.22, 0.0, 0.35],
  'om1': [-0.32, 0.05, 0.12],
  'om2': [-0.32, 0.1, -0.08],
  // Coronary arteries — Right system
  // RCA originates from right aortic sinus, travels in right AV groove
  'rca-proximal': [0.15, -0.1, 0.45],
  'rca-mid': [0.32, -0.02, 0.18],
  'rca-distal': [0.28, 0.08, -0.12],
  // PDA runs posteriorly in posterior interventricular sulcus
  'pda': [0.08, 0.18, -0.35],
  'am-branch': [0.35, -0.05, 0.0],
  // Conduction system
  // SA node: junction of SVC and RA, slightly posterior
  'sa-node': [0.35, 0.02, 0.55],
  // AV node: Koch's triangle — near coronary sinus os, septal, slightly posterior
  'av-node': [0.1, 0.02, 0.2],
  'bundle-of-his': [0.02, 0.0, 0.15],
  'right-bundle-branch': [0.1, -0.05, -0.1],
  'left-bundle-branch': [-0.08, 0.0, -0.1],
  'left-anterior-fascicle': [-0.15, -0.1, -0.32],
  'left-posterior-fascicle': [-0.1, 0.1, -0.32],
  'purkinje-network-rv': [0.15, -0.12, -0.48],
  'purkinje-network-lv': [-0.15, 0.0, -0.48],
  // Additional anatomy
  // RVOT: anterior, above RV, leads to pulmonary valve
  'right-ventricular-outflow-tract': [0.1, -0.18, 0.32],
  'left-ventricular-outflow-tract': [-0.08, -0.02, 0.32],
  // Coronary sinus: posterior AV groove, drains into RA
  'coronary-sinus': [0.1, 0.18, 0.1],
  // Eustachian valve: at IVC–RA junction, posterior
  'eustachian-valve': [0.22, 0.08, -0.48],
  'chordae-tendineae': [-0.15, 0.02, -0.22],
  // Pulmonary veins: enter LA posteriorly
  'pulmonary-veins': [-0.3, 0.2, 0.4],
  'descending-aorta': [-0.18, 0.15, 0.75],
  'right-coronary-ostium': [0.08, -0.08, 0.46],
  'left-coronary-ostium': [-0.08, -0.08, 0.46],
  'trabeculae-carneae': [0.15, -0.1, -0.42],
  'bachmanns-bundle': [0.12, -0.05, 0.45],
};

// Proper display names for all structures (used for labels)
const STRUCTURE_NAMES: Record<string, string> = {
  // Chambers
  'right-atrium': 'Right Atrium',
  'left-atrium': 'Left Atrium',
  'right-ventricle': 'Right Ventricle',
  'left-ventricle': 'Left Ventricle',
  'right-atrial-appendage': 'Right Atrial Appendage',
  'left-atrial-appendage': 'Left Atrial Appendage',
  // Septa & Landmarks
  'interatrial-septum': 'Interatrial Septum',
  'interventricular-septum': 'Interventricular Septum',
  'fossa-ovalis': 'Fossa Ovalis',
  'apex': 'Apex',
  'base-of-heart': 'Base of Heart',
  // Valves
  'mitral-annulus': 'Mitral Valve',
  'aortic-valve-rcc': 'Aortic Valve',
  'tricuspid-annulus': 'Tricuspid Valve',
  'pulmonary-valve-cusps': 'Pulmonary Valve',
  // Great Vessels
  'ascending-aorta': 'Ascending Aorta',
  'aortic-arch': 'Aortic Arch',
  'pulmonary-trunk': 'Pulmonary Trunk',
  'svc': 'Superior Vena Cava',
  'ivc': 'Inferior Vena Cava',
  // Pericardium & Layers
  'fibrous-pericardium': 'Fibrous Pericardium',
  'epicardium': 'Epicardium',
  'myocardium': 'Myocardium',
  'endocardium': 'Endocardium',
  // Subvalvular
  'anterolateral-papillary-muscle': 'Anterolateral Papillary Muscle',
  'posteromedial-papillary-muscle': 'Posteromedial Papillary Muscle',
  'moderator-band': 'Moderator Band',
  'crista-terminalis': 'Crista Terminalis',
  // Coronary Arteries - Left
  'lmca': 'Left Main Coronary Artery',
  'lad-proximal': 'LAD Proximal',
  'lad-mid': 'LAD Mid',
  'lad-distal': 'LAD Distal',
  'd1': 'First Diagonal (D1)',
  'd2': 'Second Diagonal (D2)',
  'lcx-proximal': 'Left Circumflex (LCx)',
  'om1': 'Obtuse Marginal 1 (OM1)',
  'om2': 'Obtuse Marginal 2 (OM2)',
  // Coronary Arteries - Right
  'rca-proximal': 'RCA Proximal',
  'rca-mid': 'RCA Mid',
  'rca-distal': 'RCA Distal',
  'pda': 'Posterior Descending Artery',
  'am-branch': 'Acute Marginal Branch',
  // Conduction System
  'sa-node': 'SA Node',
  'av-node': 'AV Node',
  'bundle-of-his': 'Bundle of His',
  'right-bundle-branch': 'Right Bundle Branch',
  'left-bundle-branch': 'Left Bundle Branch',
  'left-anterior-fascicle': 'Left Anterior Fascicle',
  'left-posterior-fascicle': 'Left Posterior Fascicle',
  'purkinje-network-rv': 'Purkinje Network (RV)',
  'purkinje-network-lv': 'Purkinje Network (LV)',
  // Additional anatomy
  'right-ventricular-outflow-tract': 'Right Ventricular Outflow Tract (RVOT)',
  'left-ventricular-outflow-tract': 'Left Ventricular Outflow Tract (LVOT)',
  'coronary-sinus': 'Coronary Sinus',
  'eustachian-valve': 'Eustachian Valve',
  'chordae-tendineae': 'Chordae Tendineae',
  'pulmonary-veins': 'Pulmonary Veins',
  'descending-aorta': 'Descending Aorta',
  'right-coronary-ostium': 'Right Coronary Ostium',
  'left-coronary-ostium': 'Left Coronary Ostium',
  'trabeculae-carneae': 'Trabeculae Carneae',
  'bachmanns-bundle': "Bachmann's Bundle",
};

// Best camera angle to view each structure region
const STRUCTURE_CAMERA: Record<string, { position: [number, number, number]; target: [number, number, number] }> = {
  // Default anterior view for most structures
};

function getCameraForStructure(id: string): { position: [number, number, number]; target: [number, number, number] } {
  if (STRUCTURE_CAMERA[id]) return STRUCTURE_CAMERA[id];
  const center = STRUCTURE_CENTERS[id];
  if (!center) return { position: [0, 0.2, 4], target: [0, 0, 0] };
  // Position camera looking at the structure from a reasonable angle
  // Offset outward from center to frame the structure
  const [cx, cy, cz] = center;
  // Scale from model-local coords (inside scale 1.4 group) to world
  const wx = cx * 1.4, wy = cy * 1.4, wz = cz * 1.4;
  // Camera distance from target
  const dist = 3.0;
  // Compute a direction: prefer looking from front-ish angle biased by structure position
  const dx = wx * 0.5;
  const dy = wy * 0.3 + 0.3;
  const dz = 2.5;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return {
    position: [wx + (dx / len) * dist, wy + (dy / len) * dist, wz + (dz / len) * dist],
    target: [wx, wy, wz],
  };
}

// ─── Noise utilities ───────────────────────────────────────────────────
function hash(x: number, y: number): number {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) & 0x7fffffff) / 0x7fffffff;
}

function smoothNoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return hash(ix, iy) * (1 - sx) * (1 - sy) + hash(ix + 1, iy) * sx * (1 - sy)
    + hash(ix, iy + 1) * (1 - sx) * sy + hash(ix + 1, iy + 1) * sx * sy;
}

function fbm(x: number, y: number, oct: number): number {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += a * smoothNoise(x * f, y * f); a *= 0.5; f *= 2; }
  return v;
}

// ─── Procedural normal map ─────────────────────────────────────────────
function createNormalMap(size = 512): THREE.DataTexture {
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const fiber = fbm(u * 14 + Math.sin(v * 6) * 0.4, v * 28, 4);
      const grain = fbm(u * 50, v * 50, 3) * 0.12;
      const undulate = fbm(u * 5 + 77, v * 7 + 77, 3) * 0.25;
      heights[y * size + x] = fiber * 0.45 + grain + undulate;
    }
  }
  const data = new Uint8Array(size * size * 4);
  const str = 3.0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (heights[y * size + Math.min(x + 1, size - 1)] - heights[y * size + Math.max(x - 1, 0)]) * str;
      const dy = (heights[Math.min(y + 1, size - 1) * size + x] - heights[Math.max(y - 1, 0) * size + x]) * str;
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * size + x) * 4;
      data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

// ─── Anatomical heart geometry ─────────────────────────────────────────
// Creates a conical heart shape: broad flat base at top, tapered apex at bottom-left
function buildHeartGeometry(): THREE.BufferGeometry {
  const segs = 180, rings = 128;
  const verts: number[] = [], uvsArr: number[] = [], idxs: number[] = [];

  for (let j = 0; j <= rings; j++) {
    const v = j / rings;
    const phi = v * Math.PI;

    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const theta = u * Math.PI * 2;

      // Conical taper: widest at top (base), narrows toward apex
      // Real heart is ~2/3 as wide at mid-height as at base
      let profile = 1.0;
      if (v < 0.15) {
        // Base region: slightly narrower at very top (flat base)
        profile = 0.75 + 0.25 * (v / 0.15);
      } else if (v < 0.45) {
        // Widest region (mid-ventricles)
        profile = 1.0 + 0.05 * Math.sin((v - 0.15) / 0.3 * Math.PI);
      } else {
        // Taper to apex
        const t = (v - 0.45) / 0.55;
        profile = 1.05 * (1.0 - Math.pow(t, 1.4));
        // Blunt the very tip
        if (v > 0.93) profile = Math.max(profile, 0.03);
      }

      // Elliptical cross-section: wider left-right, flatter front-back
      const rx = 1.05;
      const rz = 0.82;

      // Right atrium bulge: prominent on the right-anterior side
      const raRegion = v < 0.42 ? Math.pow(Math.max(0, 1.0 - v / 0.42), 1.8) : 0;
      const raAngle = Math.exp(-Math.pow(theta - 0.5, 2) * 3);
      const raBulge = raRegion * raAngle * 0.28;

      // Left atrium: left-posterior
      const laRegion = v < 0.38 ? Math.pow(Math.max(0, 1.0 - v / 0.38), 2.0) : 0;
      const laAngle = Math.exp(-Math.pow(theta - Math.PI - 0.4, 2) * 3);
      const laBulge = laRegion * laAngle * 0.22;

      // RV: prominent anterior bulge, wraps around front-right
      const vent = v > 0.25 && v < 0.9 ? Math.sin((v - 0.25) / 0.65 * Math.PI) : 0;
      const rvAngle = Math.exp(-Math.pow(theta - 0.6, 2) * 1.5);
      const rvBulge = vent * rvAngle * 0.2;

      // Conus arteriosus (RV outflow tract)
      const conus = Math.exp(-Math.pow(v - 0.22, 2) * 60) * Math.exp(-Math.pow(theta - 0.7, 2) * 6) * 0.15;

      // LV: slightly convex on left-posterior, more muscular
      const lvAngle = Math.exp(-Math.pow(theta - Math.PI + 0.2, 2) * 1.8);
      const lvBulge = vent * lvAngle * 0.12;

      // Anterior interventricular sulcus (deep groove)
      const aivs = Math.exp(-Math.pow(theta - 0.15, 2) * 10) * vent * 0.1;
      // Posterior interventricular sulcus
      const pivs = Math.exp(-Math.pow(theta - Math.PI + 0.05, 2) * 8) * vent * 0.07;
      // AV groove (coronary sulcus)
      const avs = Math.exp(-Math.pow(v - 0.3, 2) * 250) * 0.09;

      const r = (1.0 + raBulge + laBulge + rvBulge + lvBulge + conus - aivs - pivs - avs) * profile;

      let x = rx * r * Math.sin(phi) * Math.cos(theta);
      let y = 1.35 * r * Math.cos(phi);
      let z = rz * r * Math.sin(phi) * Math.sin(theta);

      // Apex shifts left and slightly anterior
      if (v > 0.5) {
        const s = Math.pow((v - 0.5) / 0.5, 2.0);
        x -= s * 0.22;
        z += s * 0.12;
        // LV spiral twist
        const tw = s * 0.12;
        const xr = x * Math.cos(tw) - z * Math.sin(tw);
        const zr = x * Math.sin(tw) + z * Math.cos(tw);
        x = xr; z = zr;
      }

      // Organic surface noise
      const n = Math.sin(theta * 7 + phi * 5) * 0.005
        + Math.sin(theta * 15 + phi * 12) * 0.003
        + Math.sin(theta * 31 + phi * 23) * 0.002;

      verts.push(x * (1 + n), y * (1 + n * 0.4), z * (1 + n));
      uvsArr.push(u, v);
    }
  }

  for (let j = 0; j < rings; j++)
    for (let i = 0; i < segs; i++) {
      const a = j * (segs + 1) + i, b = a + 1, c = (j + 1) * (segs + 1) + i, d = c + 1;
      idxs.push(a, c, b, b, c, d);
    }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvsArr, 2));
  geo.setIndex(idxs);
  geo.computeVertexNormals();
  return geo;
}

// ─── Vertex colors ─────────────────────────────────────────────────────
function addVertexColors(geo: THREE.BufferGeometry) {
  const uv = geo.getAttribute('uv');
  const n = uv.count;
  const c = new Float32Array(n * 3);

  for (let i = 0; i < n; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    const theta = u * Math.PI * 2;

    // Muted rose-red body matching reference (pinkish-red, not dark)
    let r = 0.7, g = 0.28, b = 0.26;

    const vent = v > 0.3 && v < 0.85 ? Math.sin((v - 0.3) / 0.55 * Math.PI) : 0;

    // Fat in sulci (cream/white like reference)
    const ivs = Math.exp(-Math.pow(theta - 0.15, 2) * 10) * vent;
    const avs = Math.exp(-Math.pow(v - 0.3, 2) * 250);
    const fat = ivs * 0.5 + avs * 0.5;
    r += fat * 0.22; g += fat * 0.45; b += fat * 0.4;

    // Atria: lighter pink
    if (v < 0.3) {
      const t = Math.pow(1.0 - v / 0.3, 1.5);
      r += t * 0.12; g += t * 0.05; b += t * 0.05;
    }

    // Darker toward apex
    if (v > 0.6) {
      const t = (v - 0.6) / 0.4;
      r -= t * 0.08; g -= t * 0.03;
    }

    // RV slightly lighter (thinner wall, more pink)
    const rvFace = Math.exp(-Math.pow(theta - 0.6, 2) * 1.5);
    r += rvFace * vent * 0.06;
    g += rvFace * vent * 0.02;

    // Mottled organic variation
    const m = fbm(u * 10, v * 14, 3);
    r += (m - 0.5) * 0.08; g += (m - 0.5) * 0.03; b += (m - 0.5) * 0.02;

    c[i * 3] = Math.max(0, Math.min(1, r));
    c[i * 3 + 1] = Math.max(0, Math.min(1, g));
    c[i * 3 + 2] = Math.max(0, Math.min(1, b));
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
}

// ─── Opacity / side helpers per view mode ─────────────────────────────
function getHeartOpacity(viewMode: string): number {
  switch (viewMode) {
    case 'dissection': return 0.18;
    case 'cutaway': case 'sectional': return 0.5;
    case 'coronary': return 0.35;
    case 'internal': return 0.4;
    case 'perfusion': return 0.55;
    case 'conduction': return 0.45;
    case 'wall-motion': return 0.7;
    default: return 1;
  }
}
function isTransparentMode(viewMode: string): boolean {
  return viewMode !== 'external' && viewMode !== 'procedure-overlay' && viewMode !== 'imaging-correlation';
}

// ─── Basal cap (seals top of heart so interior is hidden) ─────────────
function BasalCap() {
  const { viewMode } = useAppStore();
  const geo = useMemo(() => {
    // Disc that covers the base opening where great vessels emerge
    const g = new THREE.CircleGeometry(0.7, 48);
    g.computeVertexNormals();
    return g;
  }, []);

  if (isTransparentMode(viewMode)) return null;

  return (
    <mesh geometry={geo} position={[0.05, 1.1, -0.05]} rotation={[-Math.PI / 2 + 0.08, 0, 0]}>
      <meshPhysicalMaterial
        color="#b05050"
        roughness={0.45}
        clearcoat={0.3}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// ─── Heart mesh (realistic GLB model with textured surface) ───────────
function HeartMesh() {
  const ref = useRef<THREE.Group>(null);
  const { selectedStructureId, hoverStructure, multiSelectIds } = useSceneStore();
  const { viewMode, labelsVisible } = useAppStore();
  const [hoveredZone, setHoveredZone] = useState<string | null>(null);

  const { scene } = useGLTF('/models/heart_closed.glb');
  const heartModel = useMemo(() => scene.clone(), [scene]);

  // Apply enhanced materials to the loaded model
  useMemo(() => {
    heartModel.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const oldMap = (child.material as THREE.MeshStandardMaterial)?.map;
        child.material = new THREE.MeshPhysicalMaterial({
          map: oldMap,
          color: new THREE.Color(1.4, 1.2, 1.1),
          roughness: 0.42,
          metalness: 0.01,
          clearcoat: 0.5,
          clearcoatRoughness: 0.3,
          sheen: 0.5,
          sheenRoughness: 0.4,
          sheenColor: new THREE.Color(0.9, 0.4, 0.35),
          emissive: new THREE.Color(0.08, 0.02, 0.015),
        });
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [heartModel]);

  // Store shader refs for per-frame uniform updates
  const shaderRefs = useRef<THREE.WebGLProgramParametersWithUniforms[]>([]);

  // Inject custom vertex/fragment code for regional contraction + activation glow
  useMemo(() => {
    shaderRefs.current = [];
    heartModel.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshPhysicalMaterial) {
        child.material.onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
          shader.uniforms.uCycleProgress = { value: 0 };
          shader.uniforms.uAtrialProgress = { value: 0 };
          shader.uniforms.uAtriaActive = { value: 1 };
          shader.uniforms.uVentActive = { value: 1 };
          shader.uniforms.uFib = { value: 0 };
          shader.uniforms.uTime = { value: 0 };
          shaderRefs.current.push(shader);

          // Vertex: regional contraction deformation
          shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            `#include <common>
            uniform float uCycleProgress;
            uniform float uAtrialProgress;
            uniform float uAtriaActive;
            uniform float uVentActive;
            uniform float uFib;
            uniform float uTime;
            varying vec3 vLocalPos;`
          );
          shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            vLocalPos = position;
            // The model's long axis is Z: base/atria at +Z, apex at -Z.
            // Atria occupy roughly z 0.1..0.5; great vessels sit above 0.5.
            float atrialMask = smoothstep(0.02, 0.22, position.z) * (1.0 - smoothstep(0.5, 0.72, position.z));
            // Atrial systole follows the P wave (mechanical phase 0.14-0.28)
            float pOn  = smoothstep(0.13, 0.17, uAtrialProgress);
            float pOff = 1.0 - smoothstep(0.24, 0.30, uAtrialProgress);
            float atrialSqueeze = atrialMask * pOn * pOff * 0.045 * uAtriaActive;
            // Ventricular systole follows the QRS and lasts through the T wave (0.30-0.62)
            float ventMask = 1.0 - smoothstep(-0.02, 0.16, position.z);
            float qrsOn  = smoothstep(0.29, 0.34, uCycleProgress);
            float qrsOff = 1.0 - smoothstep(0.56, 0.64, uCycleProgress);
            float ventSqueeze = ventMask * qrsOn * qrsOff * 0.055 * uVentActive;
            // Fibrillation: fine, disorganised quiver instead of a coordinated squeeze
            float quiver = uFib * 0.012 * sin(uTime * 55.0 + position.x * 25.0 + position.z * 19.0);
            // Apply squeeze: compress the short axes (X/Y), shorten the long axis (Z) toward the base
            float squeeze = atrialSqueeze + ventSqueeze + quiver;
            transformed.x *= 1.0 - squeeze;
            transformed.y *= 1.0 - squeeze;
            transformed.z += ventSqueeze * 0.35 * (0.2 - position.z) + atrialSqueeze * 0.2 * (0.35 - position.z);`
          );

          // Fragment: activation glow overlay
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            `#include <common>
            uniform float uCycleProgress;
            uniform float uAtrialProgress;
            uniform float uAtriaActive;
            uniform float uVentActive;
            uniform float uFib;
            uniform float uTime;
            varying vec3 vLocalPos;`
          );
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
            // Atrial depolarization glow (warm yellow-orange) during the P wave (0.12-0.20)
            float aGlow = smoothstep(0.02, 0.22, vLocalPos.z) * (1.0 - smoothstep(0.5, 0.72, vLocalPos.z));
            float pA = smoothstep(0.11, 0.14, uAtrialProgress) * (1.0 - smoothstep(0.19, 0.23, uAtrialProgress));
            totalEmissiveRadiance += vec3(0.35, 0.18, 0.05) * aGlow * pA * uAtriaActive;
            // Ventricular depolarization glow (orange-red) sweeping base→apex during the QRS (0.27-0.38)
            float vGlow = 1.0 - smoothstep(-0.02, 0.16, vLocalPos.z);
            float depth = clamp((0.15 - vLocalPos.z) / 0.85, 0.0, 1.0); // 0 at base, 1 at apex
            float front = (uCycleProgress - 0.27) / 0.11;             // 0..1 across the QRS
            float qrsG = smoothstep(front - 0.35, front, depth) * (1.0 - smoothstep(front, front + 0.35, depth));
            qrsG *= step(0.24, uCycleProgress) * (1.0 - smoothstep(0.40, 0.46, uCycleProgress));
            totalEmissiveRadiance += vec3(0.45, 0.13, 0.04) * vGlow * qrsG * 1.4 * uVentActive;
            // Repolarization glow (subtle blue-purple) during the T wave (0.49-0.61)
            float tG = smoothstep(0.48, 0.52, uCycleProgress) * (1.0 - smoothstep(0.60, 0.65, uCycleProgress));
            totalEmissiveRadiance += vec3(0.08, 0.05, 0.25) * vGlow * tG * uVentActive;
            // Fibrillating myocardium shimmers chaotically
            float shimmer = uFib * (0.5 + 0.5 * sin(uTime * 40.0 + vLocalPos.x * 30.0 + vLocalPos.z * 22.0));
            totalEmissiveRadiance += vec3(0.35, 0.08, 0.05) * vGlow * shimmer;`
          );
        };
        child.material.needsUpdate = true;
      }
    });
  }, [heartModel]);

  // Update shader uniforms every frame
  useFrame(({ clock }) => {
    const t = useTimelineStore.getState();
    for (const shader of shaderRefs.current) {
      shader.uniforms.uCycleProgress.value = t.cycleProgress;
      shader.uniforms.uAtrialProgress.value = t.atrialProgress;
      shader.uniforms.uAtriaActive.value = t.beatHasP ? 1 : 0;
      shader.uniforms.uVentActive.value = t.beatHasQRS ? 1 : 0;
      shader.uniforms.uFib.value = t.fibrillating ? 1 : 0;
      shader.uniforms.uTime.value = clock.elapsedTime;
    }
  });

  // Update material properties reactively based on view mode
  const transparent = isTransparentMode(viewMode);
  const opacity = getHeartOpacity(viewMode);
  useMemo(() => {
    heartModel.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshPhysicalMaterial) {
        child.material.transparent = transparent;
        child.material.opacity = opacity;
        child.material.side = transparent ? THREE.DoubleSide : THREE.FrontSide;
        child.material.depthWrite = !transparent || opacity > 0.4;
        child.material.clearcoat = transparent ? 0.2 : 0.6;
        child.material.sheen = transparent ? 0.2 : 0.6;
        child.material.emissive = new THREE.Color(0.08, 0.02, 0.015);
        child.material.needsUpdate = true;
      }
    });
  }, [heartModel, transparent, opacity]);

  // Click handler: identify which anatomical region was clicked (no selection from 3D click)
  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
  }, []);

  // Hover handler: show which region the cursor is over
  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (!ref.current) return;
    const localPoint = ref.current.worldToLocal(e.point.clone());
    const zone = identifyRegion(localPoint);
    const zoneId = zone?.id ?? null;
    if (zoneId !== hoveredZone) {
      setHoveredZone(zoneId);
      hoverStructure(zoneId);
    }
  }, [hoveredZone, hoverStructure]);

  const handlePointerLeave = useCallback(() => {
    setHoveredZone(null);
    hoverStructure(null);
  }, [hoverStructure]);

  // Selected structure from left menu: show yellow label with leader line
  const activeId = selectedStructureId;
  const activeCenter = activeId ? STRUCTURE_CENTERS[activeId] : null;
  const activeName = activeId
    ? STRUCTURE_NAMES[activeId] ?? activeId.replace(/-/g, ' ')
    : null;

  // Hovered structure name for black tooltip
  const hoverName = hoveredZone
    ? STRUCTURE_NAMES[hoveredZone] ?? ANATOMY_ZONES.find(z => z.id === hoveredZone)?.name ?? hoveredZone.replace(/-/g, ' ')
    : null;

  return (
    <group ref={ref} scale={1.4}>
      <primitive
        object={heartModel}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      />

      {/* Yellow label with leader line - only when selected from left menu */}
      {activeCenter && labelsVisible && (
        <group position={activeCenter}>
          <HighlightRing />
          <group>
            <line>
              <bufferGeometry>
                <bufferAttribute
                  attach="attributes-position"
                  args={[new Float32Array([0, 0, 0, 0.5, 0.3, 0.4]), 3]}
                />
              </bufferGeometry>
              <lineBasicMaterial color="#00ccff" transparent opacity={0.6} />
            </line>
            <Html position={[0.5, 0.3, 0.4]} center distanceFactor={3} style={{ pointerEvents: 'none' }}>
              <div className="bg-cardiac-accent/90 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap font-semibold capitalize">
                {activeName}
              </div>
            </Html>
          </group>
        </group>
      )}

      {/* Secondary highlights: anatomy affected by a condition or targeted by a procedure */}
      {multiSelectIds.map((id) => {
        const center = STRUCTURE_CENTERS[id];
        if (!center || id === activeId) return null;
        return (
          <group key={id} position={center}>
            <SecondaryRing />
            {labelsVisible && (
              <Html position={[0, 0, 0.12]} center distanceFactor={4} style={{ pointerEvents: 'none' }}>
                <div className="bg-red-500/80 text-white text-[10px] px-1.5 py-0.5 rounded shadow whitespace-nowrap">
                  {STRUCTURE_NAMES[id] ?? id.replace(/-/g, ' ')}
                </div>
              </Html>
            )}
          </group>
        );
      })}

      {/* Black hover tooltip - shows anatomy name on hover */}
      {hoverName && (
        <HoverTooltip name={hoverName} />
      )}
    </group>
  );
}

// Animated highlight ring that pulses around the selected structure
function HighlightRing() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      const s = 1 + Math.sin(clock.elapsedTime * 3) * 0.15;
      ref.current.scale.set(s, s, s);
      (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.4 + Math.sin(clock.elapsedTime * 3) * 0.2;
    }
  });
  return (
    <mesh ref={ref} rotation={[Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.08, 0.12, 32]} />
      <meshBasicMaterial color="#00ccff" transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

// Static red ring marking a secondary highlight (affected / targeted anatomy)
function SecondaryRing() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(clock.elapsedTime * 2) * 0.15;
    }
  });
  return (
    <mesh ref={ref} rotation={[Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.06, 0.09, 32]} />
      <meshBasicMaterial color="#ef4444" transparent opacity={0.45} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

// Floating tooltip that follows the cursor ray
function HoverTooltip({ name }: { name: string }) {
  const { pointer, camera, viewport } = useThree();
  const screenPos = useMemo(() => {
    const x = (pointer.x * viewport.width) / 2;
    const y = (pointer.y * viewport.height) / 2;
    return [x + 0.3, y + 0.3, 0] as [number, number, number];
  }, [pointer, viewport]);

  return (
    <Html position={screenPos} center distanceFactor={4} style={{ pointerEvents: 'none' }}>
      <div className="bg-black/80 text-white text-[11px] px-2 py-1 rounded shadow whitespace-nowrap capitalize">
        {name}
      </div>
    </Html>
  );
}

// Preload the GLB for instant rendering
useGLTF.preload('/models/heart_closed.glb');

// ─── Right atrial appendage (auricle) ──────────────────────────────────
function RightAuricle() {
  const geo = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(0.15, 0.05, 0.25, 0.15, 0.3, 0.1);
    shape.bezierCurveTo(0.35, 0.05, 0.32, -0.08, 0.25, -0.1);
    shape.bezierCurveTo(0.18, -0.12, 0.08, -0.06, 0, 0);
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: 0.12, bevelEnabled: true, bevelThickness: 0.04,
      bevelSize: 0.04, bevelSegments: 8, curveSegments: 24,
    });
    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <mesh geometry={geo} position={[0.75, 0.45, 0.55]} rotation={[0.3, -0.8, 0.2]} castShadow>
      <meshPhysicalMaterial
        color="#b04545"
        roughness={0.4}
        clearcoat={0.5}
        clearcoatRoughness={0.3}
        sheen={0.4}
        sheenColor={new THREE.Color(0.6, 0.12, 0.1)}
      />
    </mesh>
  );
}

// ─── Left atrial appendage ─────────────────────────────────────────────
function LeftAuricle() {
  const geo = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(-0.12, 0.06, -0.22, 0.12, -0.25, 0.08);
    shape.bezierCurveTo(-0.28, 0.02, -0.24, -0.06, -0.18, -0.08);
    shape.bezierCurveTo(-0.1, -0.1, -0.04, -0.04, 0, 0);
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: 0.1, bevelEnabled: true, bevelThickness: 0.035,
      bevelSize: 0.035, bevelSegments: 8, curveSegments: 24,
    });
    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <mesh geometry={geo} position={[-0.6, 0.5, 0.45]} rotation={[0.2, 0.6, -0.15]} castShadow>
      <meshPhysicalMaterial
        color="#a84040"
        roughness={0.4}
        clearcoat={0.5}
        clearcoatRoughness={0.3}
        sheen={0.4}
        sheenColor={new THREE.Color(0.6, 0.12, 0.1)}
      />
    </mesh>
  );
}

// ─── Great vessels (thick, prominent, matching reference images) ───────
function GreatVessels() {
  const vessels = useMemo(() => {
    // Aorta: thick arch curving prominently over the top
    const aorta = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.1, 0.95, 0.15),
      new THREE.Vector3(-0.1, 1.3, 0.2),
      new THREE.Vector3(0.0, 1.55, 0.1),
      new THREE.Vector3(0.2, 1.65, -0.1),
      new THREE.Vector3(0.4, 1.6, -0.35),
      new THREE.Vector3(0.35, 1.35, -0.55),
      new THREE.Vector3(0.2, 1.0, -0.7),
    ]);
    // Brachiocephalic trunk (right, thick)
    const bct = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.12, 1.58, -0.02),
      new THREE.Vector3(0.25, 1.85, 0.05),
      new THREE.Vector3(0.4, 2.1, 0.1),
    ]);
    // Left common carotid
    const lcc = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.05, 1.62, -0.08),
      new THREE.Vector3(-0.02, 1.9, -0.02),
      new THREE.Vector3(-0.08, 2.15, 0.02),
    ]);
    // Left subclavian
    const lsc = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.25, 1.63, -0.2),
      new THREE.Vector3(0.0, 1.8, -0.3),
      new THREE.Vector3(-0.3, 1.9, -0.35),
    ]);
    // Pulmonary trunk: thick, crosses anterior to aorta
    const pt = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.2, 0.9, 0.5),
      new THREE.Vector3(0.15, 1.2, 0.55),
      new THREE.Vector3(0.0, 1.4, 0.45),
      new THREE.Vector3(-0.2, 1.45, 0.3),
    ]);
    // Left pulmonary artery
    const lpa = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.2, 1.45, 0.3),
      new THREE.Vector3(-0.45, 1.4, 0.15),
      new THREE.Vector3(-0.65, 1.3, 0.0),
    ]);
    // Right pulmonary artery (passes behind aorta)
    const rpa = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.05, 1.4, 0.4),
      new THREE.Vector3(0.2, 1.42, 0.2),
      new THREE.Vector3(0.45, 1.35, 0.05),
      new THREE.Vector3(0.65, 1.25, -0.05),
    ]);
    // SVC: thick, enters right atrium from above
    const svc = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.55, 0.85, 0.2),
      new THREE.Vector3(0.58, 1.2, 0.18),
      new THREE.Vector3(0.55, 1.6, 0.15),
      new THREE.Vector3(0.5, 1.95, 0.12),
    ]);
    // IVC
    const ivc = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.4, -0.6, -0.2),
      new THREE.Vector3(0.42, -0.95, -0.25),
      new THREE.Vector3(0.4, -1.3, -0.3),
    ]);
    // Left pulmonary veins (upper and lower)
    const lpvu = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.6, 0.7, -0.15),
      new THREE.Vector3(-0.9, 0.75, -0.3),
      new THREE.Vector3(-1.15, 0.8, -0.4),
    ]);
    const lpvl = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.55, 0.5, -0.25),
      new THREE.Vector3(-0.85, 0.52, -0.4),
      new THREE.Vector3(-1.1, 0.55, -0.48),
    ]);
    // Right pulmonary veins
    const rpvu = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.35, 0.7, -0.2),
      new THREE.Vector3(0.65, 0.75, -0.4),
      new THREE.Vector3(0.9, 0.78, -0.5),
    ]);
    const rpvl = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.3, 0.5, -0.3),
      new THREE.Vector3(0.6, 0.52, -0.45),
      new THREE.Vector3(0.85, 0.55, -0.55),
    ]);

    const artMat = { color: '#c42020', roughness: 0.3, clearcoat: 0.55, clearcoatRoughness: 0.2, sheen: 0.3, sheenColor: '#ff4040' };
    const venMat = { color: '#3060b8', roughness: 0.32, clearcoat: 0.55, clearcoatRoughness: 0.2, sheen: 0.3, sheenColor: '#5080e0' };
    const pvMat = { color: '#8a2828', roughness: 0.33, clearcoat: 0.5, clearcoatRoughness: 0.22, sheen: 0.25, sheenColor: '#c04040' };

    return [
      { curve: aorta, radius: 0.14, mat: artMat },
      { curve: bct, radius: 0.06, mat: artMat },
      { curve: lcc, radius: 0.05, mat: artMat },
      { curve: lsc, radius: 0.055, mat: artMat },
      { curve: pt, radius: 0.12, mat: venMat },
      { curve: lpa, radius: 0.065, mat: venMat },
      { curve: rpa, radius: 0.06, mat: venMat },
      { curve: svc, radius: 0.09, mat: venMat },
      { curve: ivc, radius: 0.085, mat: venMat },
      { curve: lpvu, radius: 0.045, mat: pvMat },
      { curve: lpvl, radius: 0.04, mat: pvMat },
      { curve: rpvu, radius: 0.045, mat: pvMat },
      { curve: rpvl, radius: 0.04, mat: pvMat },
    ];
  }, []);

  return (
    <group>
      {vessels.map((v, i) => (
        <mesh key={i} castShadow>
          <tubeGeometry args={[v.curve, 64, v.radius, 16, false]} />
          <meshPhysicalMaterial
            color={v.mat.color}
            roughness={v.mat.roughness}
            metalness={0.02}
            clearcoat={v.mat.clearcoat}
            clearcoatRoughness={v.mat.clearcoatRoughness}
            sheen={v.mat.sheen}
            sheenColor={new THREE.Color(v.mat.sheenColor)}
          />
        </mesh>
      ))}
    </group>
  );
}

// ─── Coronary vessel network matching reference image ──────────────────
// Blue veins are dominant on anterior surface, branching downward from AV groove.
// Red arteries run in sulci, less visible from front.
function CoronaryNetwork() {
  const { viewMode } = useAppStore();
  const vessels = useMemo(() => {
    const V: { curve: THREE.CatmullRomCurve3; radius: number; color: string }[] = [];
    const BLUE = '#4070cc';
    const LBLUE = '#5585d8';
    const RED = '#cc2020';

    // Snap points onto heart surface so vessels don't float
    function snap(p: THREE.Vector3): THREE.Vector3 {
      const q = p.clone();
      // The heart surface z-extent is ~0.82 * profile at anterior/posterior.
      // Pull all points radially inward toward the y-axis to sit on surface.
      const radXZ = Math.sqrt(q.x * q.x + q.z * q.z);
      if (radXZ > 0.1) {
        // Heart surface max radial extent at any height is ~0.86 (rx*profile)
        // Scale radial distance to 92% to ensure surface contact
        const scale = 0.92;
        q.x *= scale;
        q.z *= scale;
      }
      return q;
    }

    // Helper to add a tube (snaps points to surface)
    function add(pts: THREE.Vector3[], r: number, c: string) {
      const snapped = pts.map(snap);
      if (snapped.length >= 2) V.push({ curve: new THREE.CatmullRomCurve3(snapped), radius: r, color: c });
    }

    // Helper: generate sub-branches from a parent vessel
    function branch(pts: THREE.Vector3[], r: number, c: string, depth: number, max: number, seed: number) {
      const snapped = pts.map(snap);
      add(pts, r, c);
      if (depth >= max) return;
      const nb = 1 + Math.floor(hash(seed, depth) * 2);
      for (let b = 0; b < nb; b++) {
        const t = 0.25 + hash(seed + b * 7, depth + 3) * 0.55;
        const pi = Math.min(Math.floor(t * (snapped.length - 1)), snapped.length - 2);
        const o = snapped[pi].clone();
        const d = snapped[pi + 1].clone().sub(o).normalize();
        const px = (hash(seed + b * 13, depth * 5) - 0.5) * 2;
        const pz = (hash(seed + b * 23, depth * 11) - 0.5) * 2;
        const perp = new THREE.Vector3(px, -0.3, pz).normalize();
        const bd = d.clone().multiplyScalar(0.5).add(perp.multiplyScalar(0.5)).normalize();
        const len = 0.12 + hash(seed + b, depth) * 0.22;
        const bp: THREE.Vector3[] = [o.clone()];
        for (let p = 1; p <= 4; p++) {
          const f = p / 4;
          bp.push(o.clone().add(bd.clone().multiplyScalar(len * f)).add(
            new THREE.Vector3((hash(seed + p * 31, b * 41) - 0.5) * 0.04, (hash(seed + p * 37, b * 43) - 0.5) * 0.03, (hash(seed + p * 41, b * 47) - 0.5) * 0.04)
          ));
        }
        branch(bp, r * 0.55, c, depth + 1, max, seed + b * 100 + depth * 50);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // BLUE VEINS — dominant on anterior surface (matching reference)
    // ═══════════════════════════════════════════════════════════════

    // Central anterior interventricular vein (main trunk down the center)
    branch([
      new THREE.Vector3(-0.04, 0.42, 0.88),
      new THREE.Vector3(-0.06, 0.2, 0.95),
      new THREE.Vector3(-0.08, -0.02, 0.92),
      new THREE.Vector3(-0.1, -0.25, 0.8),
      new THREE.Vector3(-0.11, -0.48, 0.62),
      new THREE.Vector3(-0.1, -0.68, 0.42),
      new THREE.Vector3(-0.08, -0.85, 0.22),
    ], 0.018, BLUE, 0, 4, 100);

    // Right branch 1 — fans upper-right from center trunk
    branch([
      new THREE.Vector3(-0.06, 0.2, 0.95),
      new THREE.Vector3(0.15, 0.08, 0.92),
      new THREE.Vector3(0.35, -0.05, 0.82),
      new THREE.Vector3(0.5, -0.2, 0.65),
    ], 0.014, BLUE, 0, 3, 200);

    // Right branch 2 — mid-right
    branch([
      new THREE.Vector3(-0.08, -0.02, 0.92),
      new THREE.Vector3(0.18, -0.12, 0.9),
      new THREE.Vector3(0.4, -0.25, 0.78),
      new THREE.Vector3(0.55, -0.4, 0.6),
    ], 0.013, BLUE, 0, 3, 250);

    // Right branch 3 — lower-right
    branch([
      new THREE.Vector3(-0.1, -0.25, 0.8),
      new THREE.Vector3(0.12, -0.35, 0.82),
      new THREE.Vector3(0.32, -0.48, 0.7),
      new THREE.Vector3(0.45, -0.6, 0.52),
    ], 0.012, BLUE, 0, 3, 300);

    // Right branch 4 — far lower-right
    branch([
      new THREE.Vector3(-0.11, -0.48, 0.62),
      new THREE.Vector3(0.08, -0.55, 0.65),
      new THREE.Vector3(0.25, -0.65, 0.55),
      new THREE.Vector3(0.38, -0.75, 0.38),
    ], 0.01, BLUE, 0, 2, 350);

    // Left branch 1 — fans upper-left from center
    branch([
      new THREE.Vector3(-0.06, 0.2, 0.95),
      new THREE.Vector3(-0.28, 0.08, 0.88),
      new THREE.Vector3(-0.48, -0.05, 0.72),
      new THREE.Vector3(-0.62, -0.2, 0.52),
    ], 0.014, BLUE, 0, 3, 400);

    // Left branch 2 — mid-left
    branch([
      new THREE.Vector3(-0.08, -0.02, 0.92),
      new THREE.Vector3(-0.3, -0.12, 0.85),
      new THREE.Vector3(-0.52, -0.25, 0.68),
      new THREE.Vector3(-0.65, -0.38, 0.48),
    ], 0.013, BLUE, 0, 3, 450);

    // Left branch 3 — lower-left
    branch([
      new THREE.Vector3(-0.1, -0.25, 0.8),
      new THREE.Vector3(-0.32, -0.35, 0.75),
      new THREE.Vector3(-0.5, -0.48, 0.58),
      new THREE.Vector3(-0.6, -0.58, 0.38),
    ], 0.012, BLUE, 0, 3, 500);

    // Left branch 4 — far lower-left
    branch([
      new THREE.Vector3(-0.11, -0.48, 0.62),
      new THREE.Vector3(-0.28, -0.55, 0.6),
      new THREE.Vector3(-0.42, -0.65, 0.45),
      new THREE.Vector3(-0.5, -0.72, 0.28),
    ], 0.01, BLUE, 0, 2, 550);

    // AV groove horizontal vein (connects across the top of ventricles)
    add([
      new THREE.Vector3(0.6, 0.38, 0.5),
      new THREE.Vector3(0.4, 0.4, 0.7),
      new THREE.Vector3(0.1, 0.42, 0.85),
      new THREE.Vector3(-0.15, 0.42, 0.82),
      new THREE.Vector3(-0.4, 0.4, 0.65),
      new THREE.Vector3(-0.6, 0.38, 0.42),
    ], 0.015, BLUE);

    // Additional fine veins on RV surface (right side of anterior view)
    branch([
      new THREE.Vector3(0.4, 0.4, 0.7),
      new THREE.Vector3(0.5, 0.2, 0.72),
      new THREE.Vector3(0.58, -0.02, 0.62),
      new THREE.Vector3(0.6, -0.22, 0.48),
    ], 0.009, LBLUE, 0, 2, 600);

    branch([
      new THREE.Vector3(0.55, 0.3, 0.62),
      new THREE.Vector3(0.62, 0.1, 0.58),
      new THREE.Vector3(0.65, -0.1, 0.45),
    ], 0.008, LBLUE, 0, 2, 620);

    // Fine veins on LV surface (left side of anterior view)
    branch([
      new THREE.Vector3(-0.4, 0.4, 0.65),
      new THREE.Vector3(-0.52, 0.2, 0.6),
      new THREE.Vector3(-0.6, -0.02, 0.48),
      new THREE.Vector3(-0.58, -0.2, 0.32),
    ], 0.009, LBLUE, 0, 2, 650);

    branch([
      new THREE.Vector3(-0.55, 0.3, 0.52),
      new THREE.Vector3(-0.62, 0.1, 0.42),
      new THREE.Vector3(-0.6, -0.08, 0.3),
    ], 0.008, LBLUE, 0, 2, 670);

    // Posterior veins (visible when rotated)
    branch([
      new THREE.Vector3(0.1, 0.38, -0.65),
      new THREE.Vector3(0.05, 0.1, -0.72),
      new THREE.Vector3(0.0, -0.18, -0.68),
      new THREE.Vector3(-0.05, -0.45, -0.52),
    ], 0.013, BLUE, 0, 3, 700);

    branch([
      new THREE.Vector3(-0.5, 0.2, -0.5),
      new THREE.Vector3(-0.55, -0.05, -0.38),
      new THREE.Vector3(-0.48, -0.3, -0.22),
    ], 0.01, BLUE, 0, 2, 720);

    branch([
      new THREE.Vector3(0.6, 0.28, -0.35),
      new THREE.Vector3(0.58, 0.05, -0.28),
      new THREE.Vector3(0.5, -0.18, -0.15),
    ], 0.01, BLUE, 0, 2, 740);

    // ═══════════════════════════════════════════════════════════════
    // RED ARTERIES — less prominent, run in sulci
    // ═══════════════════════════════════════════════════════════════

    // LAD (runs in AIV sulcus, partially hidden by the central vein)
    add([
      new THREE.Vector3(-0.02, 0.48, 0.84),
      new THREE.Vector3(-0.04, 0.25, 0.9),
      new THREE.Vector3(-0.06, 0.0, 0.86),
      new THREE.Vector3(-0.08, -0.25, 0.74),
      new THREE.Vector3(-0.08, -0.5, 0.56),
      new THREE.Vector3(-0.06, -0.72, 0.34),
    ], 0.012, RED);

    // LCx (runs in AV groove to left/posterior)
    add([
      new THREE.Vector3(-0.02, 0.48, 0.84),
      new THREE.Vector3(-0.3, 0.45, 0.62),
      new THREE.Vector3(-0.58, 0.38, 0.32),
      new THREE.Vector3(-0.72, 0.32, 0.0),
      new THREE.Vector3(-0.62, 0.25, -0.35),
    ], 0.011, RED);

    // RCA (runs in AV groove to right/posterior)
    add([
      new THREE.Vector3(0.15, 0.5, 0.78),
      new THREE.Vector3(0.45, 0.45, 0.62),
      new THREE.Vector3(0.7, 0.38, 0.32),
      new THREE.Vector3(0.78, 0.32, 0.0),
      new THREE.Vector3(0.65, 0.25, -0.38),
      new THREE.Vector3(0.4, 0.12, -0.58),
    ], 0.011, RED);

    return V;
  }, []);

  const isCoronaryMode = viewMode === 'coronary';

  // Always show coronary vessels — they define the external heart appearance
  return (
    <group>
      {vessels.map((v, i) => (
        <mesh key={i}>
          <tubeGeometry args={[v.curve, 48, v.radius, 8, false]} />
          <meshPhysicalMaterial
            color={v.color}
            roughness={isCoronaryMode ? 0.2 : 0.32}
            clearcoat={isCoronaryMode ? 0.8 : 0.55}
            clearcoatRoughness={0.22}
            emissive={v.color}
            emissiveIntensity={isCoronaryMode ? 0.25 : 0.04}
          />
        </mesh>
      ))}
    </group>
  );
}

// ─── Epicardial fat ────────────────────────────────────────────────────
function EpicardialFat() {
  const fat = useMemo(() => {
    const avFat = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.7, 0.42, 0.55),
      new THREE.Vector3(0.85, 0.38, 0.2),
      new THREE.Vector3(0.8, 0.35, -0.15),
      new THREE.Vector3(0.5, 0.33, -0.45),
      new THREE.Vector3(0.0, 0.34, -0.6),
      new THREE.Vector3(-0.5, 0.37, -0.45),
      new THREE.Vector3(-0.75, 0.39, -0.1),
      new THREE.Vector3(-0.7, 0.42, 0.3),
    ]);
    const aivFat = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.06, 0.45, 0.88),
      new THREE.Vector3(-0.1, 0.1, 0.9),
      new THREE.Vector3(-0.12, -0.2, 0.78),
      new THREE.Vector3(-0.12, -0.5, 0.55),
    ]);
    const baseFat = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.2, 0.85, 0.25),
      new THREE.Vector3(0.05, 0.88, 0.4),
      new THREE.Vector3(0.3, 0.85, 0.3),
    ]);

    return [
      { curve: avFat, radius: 0.07, color: '#e8d8c0' },
      { curve: aivFat, radius: 0.055, color: '#e8d8c0' },
      { curve: baseFat, radius: 0.07, color: '#ece0cc' },
    ];
  }, []);

  return (
    <group>
      {fat.map((f, i) => (
        <mesh key={i}>
          <tubeGeometry args={[f.curve, 40, f.radius, 10, false]} />
          <meshPhysicalMaterial color={f.color} roughness={0.75} metalness={0.0} clearcoat={0.2} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Build chamber geometry (elongated, anatomically shaped) ──────────
function buildChamberGeo(
  scaleX: number, scaleY: number, scaleZ: number,
  flattenTop: boolean, flattenBottom: boolean
): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 32, 32);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    // Flatten poles
    if (flattenTop && y > 0.7) y = 0.7 + (y - 0.7) * 0.3;
    if (flattenBottom && y < -0.7) y = -0.7 + (y + 0.7) * 0.3;
    pos.setXYZ(i, x * scaleX, y * scaleY, z * scaleZ);
  }
  geo.computeVertexNormals();
  return geo;
}

// ─── Valve ring geometry ──────────────────────────────────────────────
function buildValveGeo(innerR: number, outerR: number, leaflets: number): THREE.BufferGeometry {
  // Annulus ring
  const ring = new THREE.RingGeometry(innerR, outerR, 32);
  // Leaflets: partial discs that partially close the opening
  const geos: THREE.BufferGeometry[] = [ring];
  const leafletAngle = (Math.PI * 2) / leaflets;
  for (let l = 0; l < leaflets; l++) {
    const startAngle = l * leafletAngle + 0.05;
    const arcAngle = leafletAngle * 0.75;
    const leafGeo = new THREE.RingGeometry(0, innerR * 0.85, 16, 1, startAngle, arcAngle);
    // Curve leaflets slightly downward (cup shape)
    const lPos = leafGeo.attributes.position;
    for (let i = 0; i < lPos.count; i++) {
      const r = Math.sqrt(lPos.getX(i) ** 2 + lPos.getY(i) ** 2);
      const droop = (r / (innerR * 0.85)) * 0.06;
      lPos.setZ(i, lPos.getZ(i) - droop);
    }
    leafGeo.computeVertexNormals();
    geos.push(leafGeo);
  }
  // Merge all into one
  const merged = mergeBufferGeometries(geos);
  return merged;
}

// Simple geometry merge utility
function mergeBufferGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let totalVerts = 0, totalIdx = 0;
  for (const g of geos) { totalVerts += g.attributes.position.count; totalIdx += (g.index ? g.index.count : 0); }
  const pos = new Float32Array(totalVerts * 3);
  const norm = new Float32Array(totalVerts * 3);
  const idx = new Uint32Array(totalIdx);
  let vo = 0, io = 0;
  for (const g of geos) {
    const gp = g.attributes.position;
    const gn = g.attributes.normal;
    for (let i = 0; i < gp.count; i++) {
      pos[(vo + i) * 3] = gp.getX(i); pos[(vo + i) * 3 + 1] = gp.getY(i); pos[(vo + i) * 3 + 2] = gp.getZ(i);
      if (gn) { norm[(vo + i) * 3] = gn.getX(i); norm[(vo + i) * 3 + 1] = gn.getY(i); norm[(vo + i) * 3 + 2] = gn.getZ(i); }
    }
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + vo;
      io += g.index.count;
    }
    vo += gp.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  merged.setIndex(new THREE.BufferAttribute(idx, 1));
  merged.computeVertexNormals();
  return merged;
}

// ─── Chamber meshes (internal/dissection view) ──────────────────────────
function ChamberMeshes() {
  const { viewMode } = useAppStore();
  const { selectedStructureId, selectStructure, hoverStructure } = useSceneStore();

  const chambers = useMemo(() => [
    {
      id: 'right-atrium', position: [0.45, 0.5, 0.15] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [0.32, 0.28, 0.28] as [number, number, number],
      color: '#4a6f9e', label: 'RA', flatTop: true, flatBottom: true,
    },
    {
      id: 'left-atrium', position: [-0.35, 0.5, -0.15] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [0.3, 0.26, 0.28] as [number, number, number],
      color: '#8e3535', label: 'LA', flatTop: true, flatBottom: true,
    },
    {
      id: 'right-ventricle', position: [0.35, -0.2, 0.25] as [number, number, number],
      rotation: [0.05, 0, 0.08] as [number, number, number],
      scale: [0.3, 0.5, 0.3] as [number, number, number],
      color: '#5b7faa', label: 'RV', flatTop: true, flatBottom: false,
    },
    {
      id: 'left-ventricle', position: [-0.15, -0.25, -0.02] as [number, number, number],
      rotation: [0.05, 0, -0.1] as [number, number, number],
      scale: [0.32, 0.55, 0.32] as [number, number, number],
      color: '#a83030', label: 'LV', flatTop: true, flatBottom: false,
    },
  ], []);

  const chamberGeos = useMemo(() => chambers.map(ch =>
    buildChamberGeo(1, 1, 1, ch.flatTop, !ch.flatTop)
  ), []);

  if (viewMode !== 'internal' && viewMode !== 'cutaway' && viewMode !== 'sectional' && viewMode !== 'dissection') return null;

  const isDissection = viewMode === 'dissection';

  return (
    <group>
      {chambers.map((ch, ci) => (
        <group key={ch.id} position={ch.position} rotation={ch.rotation}>
          <mesh
            scale={ch.scale}
            geometry={chamberGeos[ci]}
            onClick={() => selectStructure(ch.id)}
            onPointerOver={() => hoverStructure(ch.id)}
            onPointerOut={() => hoverStructure(null)}
          >
            <meshPhysicalMaterial
              color={selectedStructureId === ch.id ? '#ffff00' : ch.color}
              transparent
              opacity={isDissection ? 0.45 : 0.5}
              roughness={0.35}
              side={THREE.DoubleSide}
              clearcoat={isDissection ? 0.3 : 0}
            />
          </mesh>
          <Html center distanceFactor={3} style={{ pointerEvents: 'none' }}>
            <div className="bg-cardiac-panel/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap font-bold">{ch.label}</div>
          </Html>
        </group>
      ))}
    </group>
  );
}

// ─── Heart valves ────────────────────────────────────────────────────────
function HeartValves() {
  const { viewMode } = useAppStore();
  const { selectedStructureId, selectStructure, hoverStructure } = useSceneStore();

  const valves = useMemo(() => [
    {
      id: 'tricuspid-annulus',
      label: 'Tricuspid',
      position: [0.38, 0.22, 0.2] as [number, number, number],
      rotation: [0.15, 0, 0.1] as [number, number, number],
      innerR: 0.1, outerR: 0.14, leaflets: 3,
      color: '#c49060',
    },
    {
      id: 'mitral-annulus',
      label: 'Mitral',
      position: [-0.22, 0.22, -0.05] as [number, number, number],
      rotation: [-0.1, 0, -0.08] as [number, number, number],
      innerR: 0.09, outerR: 0.13, leaflets: 2,
      color: '#c47060',
    },
    {
      id: 'pulmonary-valve-cusps',
      label: 'Pulmonary',
      position: [0.2, 0.85, 0.45] as [number, number, number],
      rotation: [-0.3, 0, 0.1] as [number, number, number],
      innerR: 0.06, outerR: 0.09, leaflets: 3,
      color: '#6080b0',
    },
    {
      id: 'aortic-valve-rcc',
      label: 'Aortic',
      position: [-0.1, 0.88, 0.15] as [number, number, number],
      rotation: [-0.15, 0, -0.05] as [number, number, number],
      innerR: 0.065, outerR: 0.095, leaflets: 3,
      color: '#b06060',
    },
  ], []);

  const valveGeos = useMemo(() =>
    valves.map(v => buildValveGeo(v.innerR, v.outerR, v.leaflets))
  , []);

  if (viewMode !== 'dissection' && viewMode !== 'internal' && viewMode !== 'cutaway') return null;

  return (
    <group>
      {valves.map((v, i) => (
        <group key={v.id} position={v.position} rotation={v.rotation}>
          <mesh
            geometry={valveGeos[i]}
            onClick={() => selectStructure(v.id)}
            onPointerOver={() => hoverStructure(v.id)}
            onPointerOut={() => hoverStructure(null)}
          >
            <meshPhysicalMaterial
              color={selectedStructureId === v.id ? '#ffff00' : v.color}
              roughness={0.3}
              clearcoat={0.4}
              clearcoatRoughness={0.3}
              side={THREE.DoubleSide}
              transparent
              opacity={0.85}
              sheen={0.3}
              sheenColor={new THREE.Color(v.color).multiplyScalar(1.3)}
            />
          </mesh>
          {/* Chordae tendineae for AV valves (fibrous cords) */}
          {(v.id === 'tricuspid-annulus' || v.id === 'mitral-annulus') && (
            <ChordaeTendineae valveId={v.id} innerR={v.innerR} />
          )}
          <Html center distanceFactor={3} style={{ pointerEvents: 'none' }}>
            <div className="bg-cardiac-panel/90 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap">
              {v.label}
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}

// ─── Chordae tendineae (fibrous cords from valve to papillary muscles) ──
function ChordaeTendineae({ valveId, innerR }: { valveId: string; innerR: number }) {
  const cords = useMemo(() => {
    const isTri = valveId === 'tricuspid-annulus';
    const count = isTri ? 6 : 4;
    const cordLen = isTri ? 0.25 : 0.3;
    const result: THREE.CatmullRomCurve3[] = [];

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + 0.3;
      const startX = Math.cos(angle) * innerR * 0.6;
      const startY = Math.sin(angle) * innerR * 0.6;
      const endX = Math.cos(angle + (Math.random() - 0.5) * 0.4) * innerR * 1.2;
      const endY = Math.sin(angle + (Math.random() - 0.5) * 0.4) * innerR * 1.2;
      result.push(new THREE.CatmullRomCurve3([
        new THREE.Vector3(startX, startY, 0),
        new THREE.Vector3((startX + endX) * 0.5, (startY + endY) * 0.5, -cordLen * 0.5),
        new THREE.Vector3(endX, endY, -cordLen),
      ]));
    }
    return result;
  }, [valveId, innerR]);

  return (
    <group>
      {cords.map((c, i) => (
        <mesh key={i}>
          <tubeGeometry args={[c, 12, 0.005, 6, false]} />
          <meshStandardMaterial color="#d4b896" roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Interventricular septum (wall between L and R ventricles) ────────
function Septum() {
  const { viewMode } = useAppStore();

  const geo = useMemo(() => {
    // Curved wall separating LV and RV
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.22);
    shape.bezierCurveTo(0.06, 0.1, 0.08, -0.2, 0.04, -0.55);
    shape.bezierCurveTo(0.02, -0.7, -0.02, -0.78, -0.04, -0.8);
    shape.lineTo(-0.08, -0.8);
    shape.bezierCurveTo(-0.06, -0.78, -0.04, -0.7, -0.04, -0.55);
    shape.bezierCurveTo(-0.04, -0.2, -0.02, 0.1, -0.04, 0.22);
    shape.lineTo(0, 0.22);

    const g = new THREE.ExtrudeGeometry(shape, {
      depth: 0.06,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.015,
      bevelSegments: 4,
      curveSegments: 24,
    });
    g.computeVertexNormals();
    return g;
  }, []);

  if (viewMode !== 'dissection' && viewMode !== 'internal' && viewMode !== 'cutaway') return null;

  return (
    <mesh geometry={geo} position={[0.1, 0, 0.08]} rotation={[0.05, -0.3, 0.05]} castShadow>
      <meshPhysicalMaterial
        color="#9e4545"
        roughness={0.4}
        clearcoat={0.3}
        transparent
        opacity={0.6}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// ─── Wall motion overlay (17-segment AHA model) ──────────────────────
function WallMotionOverlay() {
  const { viewMode } = useAppStore();

  const segments = useMemo(() => {
    // Simplified 6 basal + 6 mid + 4 apical + 1 apex = 17 segments
    const segs: { pos: [number, number, number]; color: string; label: string }[] = [];
    const colors = ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444', '#22c55e'];
    const baseY = 0.35, midY = -0.1, apicalY = -0.55;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      segs.push({ pos: [Math.cos(a) * 0.55, baseY, Math.sin(a) * 0.55], color: colors[i], label: `B${i + 1}` });
      segs.push({ pos: [Math.cos(a) * 0.5, midY, Math.sin(a) * 0.5], color: colors[(i + 1) % 6], label: `M${i + 1}` });
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      segs.push({ pos: [Math.cos(a) * 0.35, apicalY, Math.sin(a) * 0.35], color: colors[i % 6], label: `A${i + 1}` });
    }
    segs.push({ pos: [-0.1, -0.8, 0.05], color: '#22c55e', label: 'Apex' });
    return segs;
  }, []);

  if (viewMode !== 'wall-motion') return null;

  return (
    <group>
      {segments.map((s, i) => (
        <group key={i} position={s.pos}>
          <mesh>
            <sphereGeometry args={[0.06, 12, 12]} />
            <meshStandardMaterial color={s.color} emissive={s.color} emissiveIntensity={0.5} transparent opacity={0.8} />
          </mesh>
          <Html center distanceFactor={4} style={{ pointerEvents: 'none' }}>
            <div className="text-white text-[8px] font-bold bg-black/60 px-1 rounded">{s.label}</div>
          </Html>
        </group>
      ))}
    </group>
  );
}

// ─── Procedure overlay (common intervention sites) ───────────────────
function ProcedureOverlay() {
  const { viewMode } = useAppStore();
  if (viewMode !== 'procedure-overlay') return null;

  const sites = [
    { pos: [0.15, 0.5, 0.75] as [number, number, number], label: 'Femoral Access', color: '#60a5fa' },
    { pos: [-0.1, 0.88, 0.15] as [number, number, number], label: 'Aortic Valve (TAVR)', color: '#f472b6' },
    { pos: [-0.22, 0.22, -0.05] as [number, number, number], label: 'Mitral Valve (MitraClip)', color: '#fb923c' },
    { pos: [-0.06, 0.0, 0.86] as [number, number, number], label: 'LAD Stent Site', color: '#34d399' },
    { pos: [0.55, 0.7, 0.3] as [number, number, number], label: 'Pacemaker Lead (RA)', color: '#a78bfa' },
    { pos: [0.3, -0.3, 0.3] as [number, number, number], label: 'RV Lead', color: '#a78bfa' },
  ];

  return (
    <group>
      {sites.map((s, i) => (
        <group key={i} position={s.pos}>
          <mesh>
            <sphereGeometry args={[0.04, 16, 16]} />
            <meshStandardMaterial color={s.color} emissive={s.color} emissiveIntensity={0.7} />
          </mesh>
          {/* Pulsing ring */}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.05, 0.07, 24]} />
            <meshStandardMaterial color={s.color} emissive={s.color} emissiveIntensity={0.5} transparent opacity={0.6} side={THREE.DoubleSide} />
          </mesh>
          <Html center distanceFactor={3} style={{ pointerEvents: 'none' }}>
            <div className="text-white text-[9px] font-semibold bg-black/70 px-1.5 py-0.5 rounded whitespace-nowrap">{s.label}</div>
          </Html>
        </group>
      ))}
    </group>
  );
}

// ─── Imaging correlation overlay (imaging planes) ────────────────────
function ImagingOverlay() {
  const { viewMode } = useAppStore();
  if (viewMode !== 'imaging-correlation') return null;

  const planes = [
    { pos: [0, 0, 0] as [number, number, number], rot: [0, 0, 0] as [number, number, number], label: 'PLAX', color: '#60a5fa' },
    { pos: [0, 0, 0] as [number, number, number], rot: [0, Math.PI / 2, 0] as [number, number, number], label: 'PSAX', color: '#f472b6' },
    { pos: [0, -0.1, 0] as [number, number, number], rot: [Math.PI / 2, 0, 0.3] as [number, number, number], label: 'A4C', color: '#34d399' },
  ];

  return (
    <group>
      {planes.map((p, i) => (
        <group key={i} position={p.pos} rotation={p.rot}>
          <mesh>
            <planeGeometry args={[2.5, 2.5]} />
            <meshStandardMaterial color={p.color} transparent opacity={0.12} side={THREE.DoubleSide} emissive={p.color} emissiveIntensity={0.15} />
          </mesh>
          <Html position={[1.3, 0, 0]} distanceFactor={3} style={{ pointerEvents: 'none' }}>
            <div className="text-white text-xs font-bold bg-black/70 px-1.5 py-0.5 rounded">{p.label}</div>
          </Html>
        </group>
      ))}
    </group>
  );
}

// ─── Sectional view (clip plane visualization) ──────────────────────
function SectionalClipPlane() {
  const { viewMode } = useAppStore();
  const { clipPlane } = useSceneStore();
  if (viewMode !== 'sectional') return null;

  return (
    <group>
      {/* Show a visible clip plane indicator */}
      <mesh position={[0, 0, 0]} rotation={[0, 0, 0]}>
        <planeGeometry args={[3, 3]} />
        <meshStandardMaterial color="#ff6b6b" transparent opacity={0.08} side={THREE.DoubleSide} />
      </mesh>
      <Html position={[0, 1.5, 0]} center distanceFactor={4} style={{ pointerEvents: 'none' }}>
        <div className="text-red-400 text-xs font-bold bg-black/60 px-2 py-1 rounded">
          {clipPlane ? `Clip: ${clipPlane.axis.toUpperCase()} = ${clipPlane.value.toFixed(1)}` : 'Use clipping controls to section'}
        </div>
      </Html>
    </group>
  );
}

// ─── ECG Lead Axis Visualization ──────────────────────────────────────
// Each ECG lead views the heart from a specific electrical angle.
// Frontal plane leads (I, II, III, aVR, aVL, aVF) are in the X-Z plane.
// Precordial leads (V1-V6) are in the horizontal X-Y plane.
const LEAD_AXIS_VECTORS: Record<ECGLead, [number, number, number]> = {
  // Frontal plane — angle measured from leftward horizontal
  // Direction = [-cos(angle), 0, -sin(angle)] where 0° = leftward, 90° = inferior
  'I':   [-1,     0,      0],       // 0° — leftward
  'II':  [-0.5,   0,     -0.866],   // 60° — left-inferior
  'III': [ 0.5,   0,     -0.866],   // 120° — right-inferior
  'aVR': [ 0.866, 0,      0.5],     // -150° — right-superior
  'aVL': [-0.866, 0,      0.5],     // -30° — left-superior
  'aVF': [ 0,     0,     -1],       // 90° — inferior
  // Horizontal plane — precordial leads wrap around the chest
  'V1':  [ 0.5,  -0.866,  0],       // right parasternal
  'V2':  [ 0.17, -0.985,  0],       // left parasternal
  'V3':  [-0.26, -0.966,  0],       // between V2 and V4
  'V4':  [-0.64, -0.766,  0],       // midclavicular
  'V5':  [-0.866,-0.5,    0],       // anterior axillary
  'V6':  [-0.985,-0.17,   0],       // midaxillary
};

function LeadAxisLine() {
  const { selectedLead } = useECGStore();
  const groupRef = useRef<THREE.Group>(null);
  const labelPosRef = useRef<THREE.Group>(null);
  const labelNegRef = useRef<THREE.Group>(null);

  // Create a THREE.Line object imperatively
  const lineObj = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({
      color: '#f59e0b',
      transparent: true,
      opacity: 0.85,
    });
    return new THREE.Line(geo, mat);
  }, []);

  useFrame(() => {
    if (!selectedLead || !groupRef.current) return;

    const dir = LEAD_AXIS_VECTORS[selectedLead];
    if (!dir) return;

    // Heart center is roughly at origin, line extends 1.8 units each way
    const len = 1.8;
    const positions = lineObj.geometry.attributes.position as THREE.BufferAttribute;
    positions.setXYZ(0, dir[0] * len, dir[1] * len, dir[2] * len);
    positions.setXYZ(1, -dir[0] * len, -dir[1] * len, -dir[2] * len);
    positions.needsUpdate = true;

    // Position labels at endpoints
    if (labelPosRef.current) {
      labelPosRef.current.position.set(dir[0] * (len + 0.15), dir[1] * (len + 0.15), dir[2] * (len + 0.15));
    }
    if (labelNegRef.current) {
      labelNegRef.current.position.set(-dir[0] * (len + 0.15), -dir[1] * (len + 0.15), -dir[2] * (len + 0.15));
    }
  });

  if (!selectedLead) return null;

  return (
    <group ref={groupRef}>
      {/* Axis line via primitive */}
      <primitive object={lineObj} />

      {/* Positive electrode label */}
      <group ref={labelPosRef}>
        <mesh>
          <sphereGeometry args={[0.04, 12, 12]} />
          <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={1.0} />
        </mesh>
        <Html center distanceFactor={3} style={{ pointerEvents: 'none' }}>
          <div className="bg-amber-500/90 text-black text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap">
            {selectedLead} (+)
          </div>
        </Html>
      </group>

      {/* Negative electrode label */}
      <group ref={labelNegRef}>
        <mesh>
          <sphereGeometry args={[0.03, 12, 12]} />
          <meshStandardMaterial color="#6b7280" emissive="#6b7280" emissiveIntensity={0.5} />
        </mesh>
        <Html center distanceFactor={3} style={{ pointerEvents: 'none' }}>
          <div className="bg-slate-600/90 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap">
            (-)
          </div>
        </Html>
      </group>
    </group>
  );
}

// ─── Conduction system with animated arrows ───────────────────────────
// Conduction pathway definitions: each path has 3D control points and a timing window
// within cycleProgress that maps to the corresponding EKG feature.
const CONDUCTION_PATHWAYS = [
  // SA node → Right atrial spread (P wave)
  // SA node at SVC-RA junction, spreads down through right atrium to AV node
  { name: 'SA → RA',
    points: [[0.38, 0.05, 0.55], [0.35, 0.0, 0.45], [0.25, -0.02, 0.35], [0.1, 0.0, 0.25]] as [number,number,number][],
    startTime: 0.12, endTime: 0.17, color: new THREE.Color('#fbbf24'), atrial: true },
  // SA node → Left atrial spread (P wave, via Bachmann's bundle)
  { name: 'SA → LA',
    points: [[0.38, 0.05, 0.55], [0.2, 0.0, 0.5], [0.0, -0.05, 0.4], [-0.25, -0.1, 0.3]] as [number,number,number][],
    startTime: 0.13, endTime: 0.20, color: new THREE.Color('#fbbf24'), atrial: true },
  // AV node → Bundle of His (PR interval delay)
  { name: 'AV → His',
    points: [[0.1, 0.0, 0.25], [0.08, 0.02, 0.22], [0.05, 0.04, 0.2], [0.02, 0.05, 0.18]] as [number,number,number][],
    startTime: 0.20, endTime: 0.27, color: new THREE.Color('#f59e0b'), atrial: false },
  // His → Right Bundle Branch (QRS) — travels along the right side of the interventricular septum
  { name: 'RBB',
    points: [[0.02, 0.05, 0.18], [0.08, 0.08, 0.1], [0.12, 0.1, -0.1], [0.15, 0.1, -0.3], [0.2, 0.08, -0.5]] as [number,number,number][],
    startTime: 0.27, endTime: 0.32, color: new THREE.Color('#ef4444'), atrial: false },
  // His → Left Bundle Branch (QRS) — travels along the left side of the interventricular septum
  { name: 'LBB',
    points: [[0.02, 0.05, 0.18], [-0.04, 0.02, 0.1], [-0.1, 0.0, -0.1], [-0.12, -0.05, -0.3], [-0.15, -0.05, -0.5]] as [number,number,number][],
    startTime: 0.27, endTime: 0.32, color: new THREE.Color('#ef4444'), atrial: false },
  // RBB → Purkinje spread (RV wall, QRS) — multiple branches for surface coverage
  { name: 'Purkinje RV anterior',
    points: [[0.15, 0.1, -0.3], [0.22, 0.12, -0.25], [0.30, 0.14, -0.15], [0.35, 0.12, -0.05]] as [number,number,number][],
    startTime: 0.30, endTime: 0.36, color: new THREE.Color('#f87171'), atrial: false },
  { name: 'Purkinje RV lateral',
    points: [[0.15, 0.1, -0.3], [0.25, 0.08, -0.35], [0.32, 0.05, -0.45], [0.30, 0.0, -0.55]] as [number,number,number][],
    startTime: 0.30, endTime: 0.36, color: new THREE.Color('#f87171'), atrial: false },
  { name: 'Purkinje RV inferior',
    points: [[0.20, 0.08, -0.5], [0.22, 0.0, -0.55], [0.18, -0.05, -0.6]] as [number,number,number][],
    startTime: 0.33, endTime: 0.38, color: new THREE.Color('#fb923c'), atrial: false },
  // LBB → Purkinje spread (LV wall, QRS) — multiple branches for surface coverage
  { name: 'Purkinje LV anterior',
    points: [[-0.12, -0.05, -0.3], [-0.20, -0.10, -0.20], [-0.30, -0.15, -0.10], [-0.35, -0.12, 0.0]] as [number,number,number][],
    startTime: 0.30, endTime: 0.36, color: new THREE.Color('#f87171'), atrial: false },
  { name: 'Purkinje LV lateral',
    points: [[-0.12, -0.05, -0.3], [-0.22, -0.08, -0.35], [-0.30, -0.05, -0.45], [-0.28, 0.0, -0.55]] as [number,number,number][],
    startTime: 0.30, endTime: 0.36, color: new THREE.Color('#f87171'), atrial: false },
  { name: 'Purkinje LV apical',
    points: [[-0.15, -0.05, -0.5], [-0.12, -0.08, -0.6], [-0.05, -0.05, -0.65]] as [number,number,number][],
    startTime: 0.33, endTime: 0.38, color: new THREE.Color('#fb923c'), atrial: false },
];

// Single animated conduction arrow along a curve
function ConductionArrow({ curve, startTime, endTime, color, cycleProgress }: {
  curve: THREE.CatmullRomCurve3;
  startTime: number;
  endTime: number;
  color: THREE.Color;
  cycleProgress: number;
}) {
  const arrowRef = useRef<THREE.Group>(null);
  const trailRef = useRef<THREE.Mesh>(null);
  const trailMatRef = useRef<THREE.ShaderMaterial>(null);

  // Tube geometry for the trail — thicker for better visibility on heart surface
  const tubeGeo = useMemo(() => new THREE.TubeGeometry(curve, 80, 0.018, 12, false), [curve]);

  // Outer glow tube (larger, semi-transparent)
  const glowGeo = useMemo(() => new THREE.TubeGeometry(curve, 80, 0.035, 12, false), [curve]);

  // Shader material for animated trail reveal
  const trailMat = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uProgress: { value: 0 },
        uColor: { value: color },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uProgress;
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          float leading = uProgress;
          float behindLeading = step(vUv.x, leading);
          float trailFade = smoothstep(leading - 0.6, leading, vUv.x);
          // Brighter glow pulse at the leading edge
          float edgeDist = abs(vUv.x - leading);
          float edgeGlow = exp(-edgeDist * 20.0) * 2.0;
          float alpha = (behindLeading * trailFade * 0.8 + edgeGlow) * step(0.01, uProgress);
          alpha *= 1.0 - smoothstep(0.95, 1.0, uProgress) * 0.5;
          gl_FragColor = vec4(uColor * (1.0 + edgeGlow * 0.8), alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    return mat;
  }, [color]);

  // Glow material — soft outer halo
  const glowMat = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uProgress: { value: 0 },
        uColor: { value: color },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uProgress;
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          float leading = uProgress;
          float edgeDist = abs(vUv.x - leading);
          float edgeGlow = exp(-edgeDist * 12.0) * 1.0;
          float behindLeading = step(vUv.x, leading);
          float trailFade = smoothstep(leading - 0.4, leading, vUv.x);
          float alpha = (behindLeading * trailFade * 0.15 + edgeGlow * 0.4) * step(0.01, uProgress);
          alpha *= 1.0 - smoothstep(0.90, 1.0, uProgress) * 0.8;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }, [color]);

  const glowMatRef = useRef<THREE.ShaderMaterial>(null);

  // Arrowhead cone geometry — larger for better visibility
  const coneGeo = useMemo(() => new THREE.ConeGeometry(0.035, 0.08, 12), []);

  // Animate each frame
  useFrame(() => {
    // Calculate progress along this path based on cycleProgress
    let pathProgress = 0;
    if (cycleProgress >= startTime && cycleProgress <= endTime) {
      pathProgress = (cycleProgress - startTime) / (endTime - startTime);
    } else if (cycleProgress > endTime && cycleProgress < endTime + 0.08) {
      // Brief linger after completion
      pathProgress = 1.0;
    }

    // Update trail and glow shaders
    if (trailMatRef.current) {
      trailMatRef.current.uniforms.uProgress.value = pathProgress;
    }
    if (glowMatRef.current) {
      glowMatRef.current.uniforms.uProgress.value = pathProgress;
    }

    // Position arrowhead along curve
    if (arrowRef.current && pathProgress > 0 && pathProgress <= 1) {
      const t = Math.min(pathProgress, 0.999);
      const pos = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t);
      arrowRef.current.position.copy(pos);
      // Orient cone along tangent direction
      const up = new THREE.Vector3(0, 1, 0);
      const quat = new THREE.Quaternion().setFromUnitVectors(up, tangent.normalize());
      arrowRef.current.quaternion.copy(quat);
      arrowRef.current.visible = true;
    } else if (arrowRef.current) {
      arrowRef.current.visible = false;
    }
  });

  return (
    <group>
      {/* Outer glow tube */}
      <mesh geometry={glowGeo}>
        <primitive object={glowMat} ref={glowMatRef} attach="material" />
      </mesh>
      {/* Core trail tube */}
      <mesh ref={trailRef} geometry={tubeGeo}>
        <primitive object={trailMat} ref={trailMatRef} attach="material" />
      </mesh>
      {/* Arrowhead */}
      <group ref={arrowRef}>
        <mesh geometry={coneGeo}>
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={2.0}
            transparent
            opacity={0.95}
          />
        </mesh>
      </group>
    </group>
  );
}

function ConductionOverlay() {
  const { cycleProgress, atrialProgress, playing, beatHasP, beatHasQRS, fibrillating } = useTimelineStore();
  const { labelsVisible } = useAppStore();

  // Build curves from pathway definitions
  const pathData = useMemo(() =>
    CONDUCTION_PATHWAYS.map((p) => ({
      ...p,
      curve: new THREE.CatmullRomCurve3(p.points.map((pt) => new THREE.Vector3(...pt))),
    })),
  []);

  // Conduction node positions for labels — must match STRUCTURE_CENTERS and pathway starts
  const nodes = [
    { label: 'SA Node', pos: [0.38, 0.05, 0.55] as [number,number,number] },
    { label: 'AV Node', pos: [0.1, 0.0, 0.25] as [number,number,number] },
    { label: 'Bundle of His', pos: [0.02, 0.05, 0.18] as [number,number,number] },
  ];

  return (
    <group>
      {/* Animated arrow paths */}
      {!fibrillating && pathData.map((p, i) => {
        // Atrial paths follow the atrial timeline; AV/His/bundle/Purkinje paths only
        // run on beats that actually conduct to the ventricles (blocked P → no arrows).
        if (p.atrial && !beatHasP) return null;
        if (!p.atrial && !beatHasQRS) return null;
        return (
          <ConductionArrow
            key={i}
            curve={p.curve}
            startTime={p.startTime}
            endTime={p.endTime}
            color={p.color}
            cycleProgress={p.atrial ? atrialProgress : cycleProgress}
          />
        );
      })}
      {/* Node labels */}
      {playing && labelsVisible && nodes.map((node, i) => (
        <group key={i} position={node.pos}>
          <mesh>
            <sphereGeometry args={[0.03, 12, 12]} />
            <meshStandardMaterial
              color="#fbbf24"
              emissive="#fbbf24"
              emissiveIntensity={0.8}
            />
          </mesh>
          <Html center distanceFactor={3} style={{ pointerEvents: 'none' }}>
            <div className="text-yellow-400 text-xs font-bold whitespace-nowrap drop-shadow-lg">{node.label}</div>
          </Html>
        </group>
      ))}
    </group>
  );
}

// ─── Blood flow particles ──────────────────────────────────────────────
function BloodFlowParticles() {
  const { viewMode } = useAppStore();
  const { cycleProgress, playing } = useTimelineStore();
  const ref = useRef<THREE.Points>(null);
  const count = 200;

  const data = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 1.6;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 2.4;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
      const oxy = pos[i * 3] < 0;
      col[i * 3] = oxy ? 0.7 : 0.15;
      col[i * 3 + 1] = 0.05;
      col[i * 3 + 2] = oxy ? 0.1 : 0.6;
    }
    return { positions: pos, colors: col };
  }, []);

  useFrame((_, dt) => {
    if (!ref.current || !playing) return;
    const p = ref.current.geometry.attributes.position.array as Float32Array;
    const ejecting = cycleProgress > 0.36 && cycleProgress < 0.6;
    for (let i = 0; i < count; i++) {
      // Blood is pulled toward the apex during filling and pushed toward the base during ejection
      p[i * 3 + 2] += dt * 0.5 * (ejecting ? 2.2 : -0.6);
      if (p[i * 3 + 2] > 1.2) p[i * 3 + 2] = -1.2;
      if (p[i * 3 + 2] < -1.2) p[i * 3 + 2] = 1.2;
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  if (viewMode !== 'internal' && viewMode !== 'perfusion') return null;

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[data.colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.025} vertexColors transparent opacity={0.6} />
    </points>
  );
}

// ─── Camera controller ─────────────────────────────────────────────────
// Animates camera to a target on selection, then stops so OrbitControls can work freely.
function CameraController() {
  const { camera, gl } = useThree();
  const preset = useSceneStore((s) => s.cameraPreset);
  const setCameraPreset = useSceneStore((s) => s.setCameraPreset);
  const selectedStructureId = useSceneStore((s) => s.selectedStructureId);
  const prevSelectedRef = useRef<string | null>(null);
  const targetRef = useRef<{ position: THREE.Vector3; lookAt: THREE.Vector3 } | null>(null);
  const animatingRef = useRef(false);
  const frameCountRef = useRef(0);
  const presetFrameRef = useRef(0);

  // Clear preset when user starts dragging/interacting with the canvas
  // so that manual manipulation overrides any preset view
  useEffect(() => {
    const canvas = gl.domElement;
    const handleInteraction = () => {
      if (preset) {
        setCameraPreset(null);
      }
      animatingRef.current = false;
    };
    canvas.addEventListener('pointerdown', handleInteraction);
    canvas.addEventListener('wheel', handleInteraction);
    return () => {
      canvas.removeEventListener('pointerdown', handleInteraction);
      canvas.removeEventListener('wheel', handleInteraction);
    };
  }, [gl, preset, setCameraPreset]);

  // Set initial camera up to Z-up so heart is upright on load
  useEffect(() => {
    camera.up.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  useFrame(() => {
    // Detect new selection
    if (selectedStructureId && selectedStructureId !== prevSelectedRef.current) {
      prevSelectedRef.current = selectedStructureId;
      const cam = getCameraForStructure(selectedStructureId);
      targetRef.current = {
        position: new THREE.Vector3(...cam.position),
        lookAt: new THREE.Vector3(...cam.target),
      };
      animatingRef.current = true;
      frameCountRef.current = 0;
    } else if (!selectedStructureId && prevSelectedRef.current) {
      prevSelectedRef.current = null;
      targetRef.current = null;
      animatingRef.current = false;
    }

    // Camera preset: lerp toward target then auto-clear so OrbitControls resumes
    if (preset) {
      const targetUp = new THREE.Vector3(...(preset.up || [0, 0, 1]));
      camera.up.lerp(targetUp, 0.08);
      camera.up.normalize();
      camera.position.lerp(new THREE.Vector3(...preset.position), 0.08);
      camera.lookAt(new THREE.Vector3(...preset.target));
      presetFrameRef.current++;
      // After ~40 frames (~0.7s) the camera is close enough — clear preset
      // so OrbitControls takes over and user can drag freely
      if (presetFrameRef.current > 40) {
        presetFrameRef.current = 0;
        setCameraPreset(null);
      }
      return;
    }

    // Animate toward structure for ~60 frames (~1 second), then stop
    if (animatingRef.current && targetRef.current) {
      camera.position.lerp(targetRef.current.position, 0.06);
      camera.lookAt(targetRef.current.lookAt);
      frameCountRef.current++;
      if (frameCountRef.current > 60) {
        animatingRef.current = false;
      }
    }
  });
  return null;
}

// ─── Background click deselect ─────────────────────────────────────────
function BackgroundDeselect() {
  const { selectStructure } = useSceneStore();
  const handleMissed = useCallback(() => {
    selectStructure(null);
  }, [selectStructure]);

  return (
    <mesh visible={false} onClick={handleMissed}>
      <sphereGeometry args={[50, 8, 8]} />
      <meshBasicMaterial side={THREE.BackSide} />
    </mesh>
  );
}

// ─── Environment map with graceful failure ─────────────────────────────
class EnvironmentBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { /* swallow: the scene lights are sufficient */ }
  render() { return this.state.failed ? null : this.props.children; }
}

function SafeEnvironment() {
  return (
    <EnvironmentBoundary>
      <Suspense fallback={null}>
        <Environment preset="studio" />
      </Suspense>
    </EnvironmentBoundary>
  );
}

// ─── Main scene ────────────────────────────────────────────────────────
export default function HeartScene({ mobile = false }: { mobile?: boolean }) {
  return (
    <div className="w-full h-full" style={{ background: '#0a0a0f' }}>
      <Canvas
        // Portrait phones have a narrow view: start further back so the whole heart fits
        camera={{ position: mobile ? [0, -6.2, 0.4] : [0, -3.8, 0.5], fov: 40 }}
        // Phones: cap the pixel ratio and skip shadow maps to keep the frame rate up
        shadows={!mobile}
        dpr={mobile ? [1, 1.5] : [1, 2]}
        gl={{ antialias: !mobile, alpha: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.8, powerPreference: 'high-performance' }}
        style={{ background: '#0a0a0f', touchAction: 'none' }}
      >
        {/* Bright 3-point lighting for realistic tissue illumination */}
        <directionalLight position={[5, 6, 4]} intensity={3.0} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} color="#fff0e0" />
        <directionalLight position={[-4, 3, 3]} intensity={1.5} color="#b0c4e8" />
        <directionalLight position={[1, 2, -5]} intensity={1.2} color="#e8d0b8" />
        <directionalLight position={[0, -2, 3]} intensity={0.8} color="#ffd0c0" />
        <pointLight position={[0, -3, 2]} intensity={0.6} color="#ff8866" distance={10} />
        <ambientLight intensity={1.0} color="#e0d8f0" />
        <spotLight position={[2.5, 4, 5]} angle={0.35} penumbra={0.7} intensity={1.5} color="#ffe8d0" />
        <spotLight position={[-2, 1, 4]} angle={0.5} penumbra={0.9} intensity={0.8} color="#ffd8c0" />

        <CameraController />
        <BackgroundDeselect />

        <group rotation={[0, 0, 0.1]}>
          <HeartMesh />
          <WallMotionOverlay />
          <ProcedureOverlay />
          <ImagingOverlay />
          <SectionalClipPlane />
          <ConductionOverlay />
          <LeadAxisLine />
          <BloodFlowParticles />
        </group>

        <ContactShadows position={[0, -2.2, 0]} opacity={0.5} blur={2.5} far={5} />
        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          rotateSpeed={0.5}
          panSpeed={0.6}
          zoomSpeed={0.8}
          minDistance={1.5}
          maxDistance={8}
          dampingFactor={0.12}
          enableDamping
          mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
          touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
        />
        {/* The HDR environment map comes from a CDN; if it cannot be fetched
            (offline, blocked network) fall back silently to the scene lights. */}
        <SafeEnvironment />
      </Canvas>
    </div>
  );
}
