'use client';

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { useSceneStore } from '@/store/useSceneStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { useAppStore } from '@/store/useAppStore';

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

// ─── Heart mesh ────────────────────────────────────────────────────────
function HeartMesh() {
  const ref = useRef<THREE.Mesh>(null);
  const { cycleProgress, playing } = useTimelineStore();
  const { hoveredStructureId } = useSceneStore();
  const { viewMode } = useAppStore();

  const { geometry, normalMap } = useMemo(() => {
    const geo = buildHeartGeometry();
    addVertexColors(geo);
    return { geometry: geo, normalMap: createNormalMap(512) };
  }, []);

  useFrame(() => {
    if (ref.current && playing) {
      const sys = cycleProgress > 0.11 && cycleProgress < 0.4;
      const t = sys ? (cycleProgress - 0.11) / 0.29 : 0;
      const c = sys ? Math.sin(t * Math.PI) : 0;
      ref.current.scale.set(1 - c * 0.035, 1 + c * 0.02, 1 - c * 0.035);
    }
  });

  return (
    <mesh ref={ref} geometry={geometry} castShadow receiveShadow>
      <meshPhysicalMaterial
        vertexColors
        roughness={0.38}
        metalness={0.02}
        clearcoat={0.6}
        clearcoatRoughness={0.25}
        sheen={0.6}
        sheenRoughness={0.35}
        sheenColor={new THREE.Color(0.75, 0.3, 0.25)}
        normalMap={normalMap}
        normalScale={new THREE.Vector2(0.5, 0.5)}
        transparent={viewMode === 'cutaway'}
        opacity={viewMode === 'cutaway' ? 0.5 : 1}
        side={viewMode === 'cutaway' ? THREE.DoubleSide : THREE.FrontSide}
        emissive={hoveredStructureId === 'heart-external' ? new THREE.Color(0.15, 0.03, 0.02) : new THREE.Color(0.025, 0.004, 0.003)}
      />
    </mesh>
  );
}

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
  const vessels = useMemo(() => {
    const V: { curve: THREE.CatmullRomCurve3; radius: number; color: string }[] = [];
    const BLUE = '#4070cc';
    const LBLUE = '#5585d8';
    const RED = '#cc2020';

    // Helper to add a tube
    function add(pts: THREE.Vector3[], r: number, c: string) {
      if (pts.length >= 2) V.push({ curve: new THREE.CatmullRomCurve3(pts), radius: r, color: c });
    }

    // Helper: generate sub-branches from a parent vessel
    function branch(pts: THREE.Vector3[], r: number, c: string, depth: number, max: number, seed: number) {
      add(pts, r, c);
      if (depth >= max) return;
      const nb = 1 + Math.floor(hash(seed, depth) * 2);
      for (let b = 0; b < nb; b++) {
        const t = 0.25 + hash(seed + b * 7, depth + 3) * 0.55;
        const pi = Math.min(Math.floor(t * (pts.length - 1)), pts.length - 2);
        const o = pts[pi].clone();
        const d = pts[pi + 1].clone().sub(o).normalize();
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

  // Always show coronary vessels — they define the external heart appearance
  return (
    <group>
      {vessels.map((v, i) => (
        <mesh key={i}>
          <tubeGeometry args={[v.curve, 48, v.radius, 8, false]} />
          <meshPhysicalMaterial
            color={v.color}
            roughness={0.32}
            clearcoat={0.55}
            clearcoatRoughness={0.22}
            emissive={v.color}
            emissiveIntensity={0.04}
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

// ─── Chamber meshes (internal view) ────────────────────────────────────
function ChamberMeshes() {
  const { viewMode } = useAppStore();
  const { selectedStructureId, selectStructure, hoverStructure } = useSceneStore();

  const chambers = useMemo(() => [
    { id: 'right-atrium', position: [0.5, 0.55, 0.2] as [number, number, number], color: '#4a6f9e', label: 'RA' },
    { id: 'left-atrium', position: [-0.4, 0.55, -0.2] as [number, number, number], color: '#8e3535', label: 'LA' },
    { id: 'right-ventricle', position: [0.4, -0.15, 0.3] as [number, number, number], color: '#5b7faa', label: 'RV' },
    { id: 'left-ventricle', position: [-0.2, -0.25, -0.05] as [number, number, number], color: '#a83030', label: 'LV' },
  ], []);

  if (viewMode !== 'internal' && viewMode !== 'cutaway' && viewMode !== 'sectional') return null;

  return (
    <group>
      {chambers.map((ch) => (
        <group key={ch.id} position={ch.position}>
          <mesh
            onClick={() => selectStructure(ch.id)}
            onPointerOver={() => hoverStructure(ch.id)}
            onPointerOut={() => hoverStructure(null)}
          >
            <sphereGeometry args={[0.3, 32, 32]} />
            <meshPhysicalMaterial
              color={selectedStructureId === ch.id ? '#ffff00' : ch.color}
              transparent opacity={0.5} roughness={0.3}
            />
          </mesh>
          <Html center distanceFactor={3} style={{ pointerEvents: 'none' }}>
            <div className="bg-cardiac-panel/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap">{ch.label}</div>
          </Html>
        </group>
      ))}
    </group>
  );
}

// ─── Conduction system ─────────────────────────────────────────────────
function ConductionOverlay() {
  const { viewMode } = useAppStore();
  const { conductionProgress } = useTimelineStore();
  if (viewMode !== 'conduction') return null;

  const nodes = [
    { id: 'sa-node', pos: [0.55, 0.7, 0.3] as [number, number, number], label: 'SA Node' },
    { id: 'av-node', pos: [0.15, 0.35, 0.3] as [number, number, number], label: 'AV Node' },
    { id: 'bundle-of-his', pos: [0, 0.15, 0.3] as [number, number, number], label: 'Bundle of His' },
    { id: 'rbb', pos: [0.3, -0.2, 0.3] as [number, number, number], label: 'RBB' },
    { id: 'lbb', pos: [-0.2, -0.2, 0.3] as [number, number, number], label: 'LBB' },
  ];

  return (
    <group>
      {nodes.map((node, i) => {
        const active = conductionProgress > i * 0.2;
        return (
          <group key={node.id} position={node.pos}>
            <mesh>
              <sphereGeometry args={[0.05, 16, 16]} />
              <meshStandardMaterial
                color={active ? '#fbbf24' : '#666'}
                emissive={active ? '#fbbf24' : '#000'}
                emissiveIntensity={active ? 0.8 : 0}
              />
            </mesh>
            <Html center distanceFactor={3} style={{ pointerEvents: 'none' }}>
              <div className="text-yellow-400 text-xs font-bold whitespace-nowrap">{node.label}</div>
            </Html>
          </group>
        );
      })}
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
    for (let i = 0; i < count; i++) {
      p[i * 3 + 1] -= dt * 0.5 * (cycleProgress > 0.16 && cycleProgress < 0.4 ? 2 : 0.5);
      if (p[i * 3 + 1] < -1.4) p[i * 3 + 1] = 1.4;
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

// ─── Animation tick ────────────────────────────────────────────────────
function AnimationTick() {
  const tick = useTimelineStore((s) => s.tick);
  useFrame((_, dt) => tick(dt * 1000));
  return null;
}

// ─── Camera controller ─────────────────────────────────────────────────
function CameraController() {
  const { camera } = useThree();
  const preset = useSceneStore((s) => s.cameraPreset);
  useFrame(() => {
    if (preset) {
      camera.position.lerp(new THREE.Vector3(...preset.position), 0.05);
      camera.lookAt(new THREE.Vector3(...preset.target));
    }
  });
  return null;
}

// ─── Main scene ────────────────────────────────────────────────────────
export default function HeartScene() {
  return (
    <div className="w-full h-full" style={{ background: 'linear-gradient(180deg, #a0a0a8 0%, #787880 100%)' }}>
      <Canvas
        camera={{ position: [0, 0.2, 4], fov: 40 }}
        shadows
        gl={{ antialias: true, alpha: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.15 }}
        style={{ background: 'linear-gradient(180deg, #a0a0a8 0%, #787880 100%)' }}
      >
        {/* 3-point lighting + accents for wet tissue look */}
        <directionalLight position={[5, 6, 4]} intensity={1.5} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} color="#fff0e0" />
        <directionalLight position={[-4, 3, 3]} intensity={0.4} color="#b0c4e8" />
        <directionalLight position={[1, 2, -5]} intensity={0.45} color="#e8d0b8" />
        <pointLight position={[0, -3, 2]} intensity={0.15} color="#ff6644" distance={7} />
        <ambientLight intensity={0.35} color="#d0c8e0" />
        <spotLight position={[2.5, 4, 5]} angle={0.35} penumbra={0.7} intensity={0.6} color="#ffe8d0" />
        <spotLight position={[-2, 1, 4]} angle={0.5} penumbra={0.9} intensity={0.25} color="#ffd8c0" />

        <AnimationTick />
        <CameraController />

        <group rotation={[0.1, -0.15, 0.12]}>
          <HeartMesh />
          <GreatVessels />
          <RightAuricle />
          <LeftAuricle />
          <EpicardialFat />
          <CoronaryNetwork />
          <ChamberMeshes />
          <ConductionOverlay />
          <BloodFlowParticles />
        </group>

        <ContactShadows position={[0, -2.2, 0]} opacity={0.5} blur={2.5} far={5} />
        <OrbitControls enablePan enableZoom enableRotate minDistance={1.5} maxDistance={8} dampingFactor={0.08} enableDamping />
        <Environment preset="studio" />
      </Canvas>
    </div>
  );
}
