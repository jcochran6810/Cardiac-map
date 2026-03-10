'use client';

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { useSceneStore } from '@/store/useSceneStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { useAppStore } from '@/store/useAppStore';

// ─── Simple seeded hash noise ──────────────────────────────────────────
function hash(x: number, y: number): number {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) & 0x7fffffff) / 0x7fffffff;
}

function smoothNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = hash(ix, iy);
  const n10 = hash(ix + 1, iy);
  const n01 = hash(ix, iy + 1);
  const n11 = hash(ix + 1, iy + 1);
  return n00 * (1 - sx) * (1 - sy) + n10 * sx * (1 - sy) + n01 * (1 - sx) * sy + n11 * sx * sy;
}

function fbm(x: number, y: number, octaves: number): number {
  let value = 0, amplitude = 0.5, frequency = 1;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * smoothNoise(x * frequency, y * frequency);
    amplitude *= 0.5;
    frequency *= 2.0;
  }
  return value;
}

// ─── Procedural bump map texture ───────────────────────────────────────
function createBumpTexture(size: number = 512): THREE.DataTexture {
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;

      // Muscle fiber direction (mostly vertical with twist)
      const fiberAngle = u * Math.PI * 2;
      const fiberU = u * 12 + Math.sin(v * 8) * 0.3;
      const fiberV = v * 24;
      const fibers = fbm(fiberU * Math.cos(fiberAngle * 0.1) + fiberV * Math.sin(fiberAngle * 0.1),
        fiberV * Math.cos(fiberAngle * 0.1) - fiberU * Math.sin(fiberAngle * 0.1), 4);

      // Fine grain (connective tissue)
      const grain = fbm(u * 60, v * 60, 3) * 0.15;

      // Medium-scale surface undulation
      const undulation = fbm(u * 6 + 100, v * 8 + 100, 3) * 0.3;

      // Surface veins (sinuous raised lines)
      const vein1 = Math.exp(-Math.pow(Math.sin(u * Math.PI * 4 + fbm(u * 3, v * 5, 2) * 2) * 8, 2)) * 0.2;
      const vein2 = Math.exp(-Math.pow(Math.sin(v * Math.PI * 6 + fbm(u * 4, v * 3, 2) * 1.5) * 10, 2)) * 0.15;

      const combined = fibers * 0.4 + grain + undulation + vein1 + vein2;
      data[y * size + x] = Math.min(255, Math.max(0, Math.round(combined * 255)));
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

// ─── Procedural normal map from bump ───────────────────────────────────
function createNormalMapFromBump(size: number = 512): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const strength = 2.5;

  // Generate heightfield first
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;

      const fiberAngle = u * Math.PI * 2;
      const fiberU = u * 12 + Math.sin(v * 8) * 0.3;
      const fiberV = v * 24;
      const fibers = fbm(fiberU * Math.cos(fiberAngle * 0.1) + fiberV * Math.sin(fiberAngle * 0.1),
        fiberV * Math.cos(fiberAngle * 0.1) - fiberU * Math.sin(fiberAngle * 0.1), 4);
      const grain = fbm(u * 60, v * 60, 3) * 0.15;
      const undulation = fbm(u * 6 + 100, v * 8 + 100, 3) * 0.3;
      const vein1 = Math.exp(-Math.pow(Math.sin(u * Math.PI * 4 + fbm(u * 3, v * 5, 2) * 2) * 8, 2)) * 0.2;
      const vein2 = Math.exp(-Math.pow(Math.sin(v * Math.PI * 6 + fbm(u * 4, v * 3, 2) * 1.5) * 10, 2)) * 0.15;

      heights[y * size + x] = fibers * 0.4 + grain + undulation + vein1 + vein2;
    }
  }

  // Compute normals via finite differences
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const xp = heights[y * size + Math.min(x + 1, size - 1)];
      const xm = heights[y * size + Math.max(x - 1, 0)];
      const yp = heights[Math.min(y + 1, size - 1) * size + x];
      const ym = heights[Math.max(y - 1, 0) * size + x];

      const dx = (xp - xm) * strength;
      const dy = (yp - ym) * strength;
      const len = Math.sqrt(dx * dx + dy * dy + 1);

      data[idx * 4] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
      data[idx * 4 + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255);
      data[idx * 4 + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      data[idx * 4 + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

// ─── Anatomical heart geometry builder ─────────────────────────────────
function buildAnatomicalHeartGeometry(): THREE.BufferGeometry {
  const segments = 160;
  const rings = 120;
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j <= rings; j++) {
    const v = j / rings;
    const phi = v * Math.PI;

    for (let i = 0; i <= segments; i++) {
      const u = i / segments;
      const theta = u * Math.PI * 2;

      // Base ellipsoid radii
      const rx = 1.0;
      const ry = 1.3;
      const rz = 0.88;

      // Apex tapering - more aggressive, comes to a blunted point
      let apexTaper = 1.0;
      if (v > 0.5) {
        const t = (v - 0.5) / 0.5;
        apexTaper = 1.0 - 0.72 * Math.pow(t, 1.6);
        // Blunt the very tip slightly
        if (v > 0.92) {
          const blunt = (v - 0.92) / 0.08;
          apexTaper = Math.max(apexTaper, 0.04 * (1 - blunt));
        }
      }

      // Flat base at top (where vessels emerge)
      let baseFlatten = 1.0;
      if (v < 0.12) {
        const t = 1.0 - v / 0.12;
        baseFlatten = 1.0 - 0.25 * Math.pow(t, 1.5);
      }

      // Atrial bulges - more pronounced and shaped
      const atrialRegion = v < 0.38 ? Math.pow(Math.max(0, 1.0 - v / 0.38), 2.2) : 0;
      // Right atrium: front-right, with auricle protrusion
      const raBase = Math.cos(theta - 0.3) * 0.5 + 0.5;
      const raAuricle = Math.exp(-Math.pow(theta - 0.6, 2) * 12) * (v < 0.2 ? (1 - v / 0.2) : 0);
      const raBulge = atrialRegion * raBase * 0.22 + raAuricle * 0.18;
      // Left atrium: left-back, with its own auricle
      const laBase = Math.cos(theta - Math.PI + 0.3) * 0.5 + 0.5;
      const laAuricle = Math.exp(-Math.pow(theta - Math.PI + 0.8, 2) * 12) * (v < 0.2 ? (1 - v / 0.2) : 0);
      const laBulge = atrialRegion * laBase * 0.18 + laAuricle * 0.15;

      // Ventricular region
      const ventricularRegion = v > 0.28 && v < 0.88
        ? Math.sin((v - 0.28) / 0.6 * Math.PI)
        : 0;

      // RV: wraps around front-right with distinct outflow tract (conus)
      const rvBase = Math.cos(theta - 0.4) * 0.5 + 0.5;
      const rvBulge = ventricularRegion * rvBase * 0.18;
      // Conus arteriosus: upper-front protrusion from RV
      const conusRegion = Math.exp(-Math.pow(v - 0.32, 2) * 80) * Math.exp(-Math.pow(theta - 0.5, 2) * 8);
      const conusBulge = conusRegion * 0.12;

      // LV: convex on left-back, forms the cardiac apex
      const lvBase = Math.cos(theta - Math.PI - 0.15) * 0.5 + 0.5;
      const lvBulge = ventricularRegion * lvBase * 0.12;

      // Interventricular sulcus (anterior) - deeper, wider groove
      const aivSulcus = Math.exp(-Math.pow(theta - 0.15, 2) * 6) * ventricularRegion * 0.09;
      // Posterior interventricular sulcus
      const pivSulcus = Math.exp(-Math.pow(theta - Math.PI - 0.05, 2) * 6) * ventricularRegion * 0.07;

      // AV groove (coronary sulcus) - wraps around the heart
      const avGroove = Math.exp(-Math.pow(v - 0.32, 2) * 180) * 0.08;

      // Obtuse margin rounding (left lateral wall)
      const obtuseMargin = Math.exp(-Math.pow(theta - Math.PI * 0.65, 2) * 4)
        * ventricularRegion * 0.06;

      // Acute margin (right lateral wall - slightly sharper)
      const acuteMargin = -Math.exp(-Math.pow(theta - Math.PI * 1.65, 2) * 6)
        * ventricularRegion * 0.03;

      const totalRadius = (1.0 + raBulge + laBulge + rvBulge + lvBulge + conusBulge
        + obtuseMargin + acuteMargin
        - aivSulcus - pivSulcus - avGroove) * apexTaper * baseFlatten;

      // Spherical to cartesian
      let x = rx * totalRadius * Math.sin(phi) * Math.cos(theta);
      let y = ry * totalRadius * Math.cos(phi);
      let z = rz * totalRadius * Math.sin(phi) * Math.sin(theta);

      // Apex displacement (shifts left-anterior, slightly rotated)
      if (v > 0.55) {
        const apexShift = Math.pow((v - 0.55) / 0.45, 2.2);
        x -= apexShift * 0.18;
        z += apexShift * 0.1;
        // Slight twist at apex (LV spiral)
        const twist = apexShift * 0.15;
        const xr = x * Math.cos(twist) - z * Math.sin(twist);
        const zr = x * Math.sin(twist) + z * Math.cos(twist);
        x = xr;
        z = zr;
      }

      // Global tilt (heart sits at ~45 degrees in chest)
      const tiltX = 0.18;
      const tiltZ = 0.05;
      let y1 = y * Math.cos(tiltX) - z * Math.sin(tiltX);
      let z1 = y * Math.sin(tiltX) + z * Math.cos(tiltX);
      const x1 = x * Math.cos(tiltZ) + y1 * Math.sin(tiltZ);
      y1 = -x * Math.sin(tiltZ) + y1 * Math.cos(tiltZ);

      // Multi-frequency surface noise for organic feel
      const n1 = Math.sin(theta * 7 + phi * 5) * 0.006;
      const n2 = Math.sin(theta * 13.7 + phi * 11.3) * 0.004;
      const n3 = Math.sin(theta * 23.1 + phi * 19.7) * 0.002;
      const n4 = Math.sin(theta * 47 + phi * 37) * 0.001;
      const noise = n1 + n2 + n3 + n4;

      vertices.push(x1 * (1 + noise), y1 * (1 + noise * 0.5), z1 * (1 + noise));
      uvs.push(u, v);
    }
  }

  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * (segments + 1) + i;
      const b = a + 1;
      const c = (j + 1) * (segments + 1) + i;
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// ─── Vertex colors for tissue ──────────────────────────────────────────
function addVertexColors(geometry: THREE.BufferGeometry) {
  const uv = geometry.getAttribute('uv');
  const count = uv.count;
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    const theta = u * Math.PI * 2;

    // Deep reddish-brown base (realistic myocardium)
    let r = 0.42, g = 0.11, b = 0.09;

    const ventricularRegion = v > 0.3 && v < 0.85 ? Math.sin((v - 0.3) / 0.55 * Math.PI) : 0;

    // Epicardial fat in sulci (golden-yellow)
    const ivSulcus = Math.exp(-Math.pow(theta - 0.15, 2) * 6) * ventricularRegion;
    const pivSulcus = Math.exp(-Math.pow(theta - Math.PI - 0.05, 2) * 6) * ventricularRegion;
    const avSulcus = Math.exp(-Math.pow(v - 0.32, 2) * 180);
    const fatAmount = ivSulcus * 0.5 + pivSulcus * 0.4 + avSulcus * 0.45;

    r += fatAmount * 0.38;
    g += fatAmount * 0.32;
    b += fatAmount * 0.06;

    // Atria: slightly pinker/lighter
    if (v < 0.32) {
      const t = Math.pow(1.0 - v / 0.32, 1.5);
      r += t * 0.1;
      g += t * 0.03;
      b += t * 0.03;
    }

    // Ventricular surface: darker/redder toward apex
    if (v > 0.55) {
      const t = (v - 0.55) / 0.45;
      r -= t * 0.07;
      g -= t * 0.025;
      b -= t * 0.01;
    }

    // RV surface: slightly lighter/more pink (thinner wall)
    const rvFace = Math.cos(theta - 0.4) * 0.5 + 0.5;
    if (ventricularRegion > 0 && rvFace > 0.6) {
      const rvBlend = (rvFace - 0.6) / 0.4 * ventricularRegion;
      r += rvBlend * 0.04;
      g += rvBlend * 0.01;
    }

    // Surface veins (subtle blue-purple tint in patches)
    const veinPattern = Math.sin(theta * 5.3 + v * 7.1) * Math.sin(theta * 3.7 - v * 4.9);
    if (veinPattern > 0.4) {
      const veinIntensity = (veinPattern - 0.4) / 0.6 * 0.06;
      r -= veinIntensity;
      g -= veinIntensity * 0.5;
      b += veinIntensity * 1.5;
    }

    // Organic variation (mottled appearance)
    const mottled = fbm(u * 8, v * 12, 3);
    r += (mottled - 0.5) * 0.06;
    g += (mottled - 0.5) * 0.025;
    b += (mottled - 0.5) * 0.02;

    colors[i * 3] = Math.max(0, Math.min(1, r));
    colors[i * 3 + 1] = Math.max(0, Math.min(1, g));
    colors[i * 3 + 2] = Math.max(0, Math.min(1, b));
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

// ─── Heart mesh component ──────────────────────────────────────────────
function HeartMesh() {
  const meshRef = useRef<THREE.Mesh>(null);
  const { cycleProgress, playing } = useTimelineStore();
  const { hoveredStructureId } = useSceneStore();
  const { viewMode } = useAppStore();

  const { geometry, bumpMap, normalMap } = useMemo(() => {
    const geo = buildAnatomicalHeartGeometry();
    addVertexColors(geo);
    return {
      geometry: geo,
      bumpMap: createBumpTexture(512),
      normalMap: createNormalMapFromBump(512),
    };
  }, []);

  useFrame(() => {
    if (meshRef.current && playing) {
      const systolicPhase = cycleProgress > 0.11 && cycleProgress < 0.4;
      const t = systolicPhase ? (cycleProgress - 0.11) / 0.29 : 0;
      const contractAmount = systolicPhase ? Math.sin(t * Math.PI) : 0;

      // Anisotropic contraction: LV shortens longitudinally, thickens circumferentially
      const sx = 1 - contractAmount * 0.035;
      const sy = 1 + contractAmount * 0.025;
      const sz = 1 - contractAmount * 0.035;
      meshRef.current.scale.set(sx, sy, sz);
    }
  });

  const isHighlighted = hoveredStructureId === 'heart-external';

  return (
    <mesh ref={meshRef} geometry={geometry} castShadow receiveShadow>
      <meshPhysicalMaterial
        vertexColors
        roughness={0.55}
        metalness={0.01}
        clearcoat={0.35}
        clearcoatRoughness={0.35}
        sheen={0.5}
        sheenRoughness={0.4}
        sheenColor={new THREE.Color(0.55, 0.12, 0.08)}
        bumpMap={bumpMap}
        bumpScale={0.015}
        normalMap={normalMap}
        normalScale={new THREE.Vector2(0.4, 0.4)}
        transparent={viewMode === 'cutaway'}
        opacity={viewMode === 'cutaway' ? 0.5 : 1}
        side={viewMode === 'cutaway' ? THREE.DoubleSide : THREE.FrontSide}
        emissive={isHighlighted ? new THREE.Color(0.15, 0.03, 0.02) : new THREE.Color(0.02, 0.003, 0.002)}
      />
    </mesh>
  );
}

// ─── Surface veins (small visible veins on epicardium) ─────────────────
function SurfaceVeins() {
  const veins = useMemo(() => {
    const veinCurves: { curve: THREE.CatmullRomCurve3; radius: number }[] = [];

    // Anterior cardiac veins (3-4 small veins on RV surface)
    for (let i = 0; i < 4; i++) {
      const startAngle = 0.1 + i * 0.2;
      const startV = 0.35 + i * 0.03;
      const points: THREE.Vector3[] = [];
      for (let j = 0; j < 6; j++) {
        const t = j / 5;
        const angle = startAngle + t * 0.15 + Math.sin(t * 3 + i) * 0.05;
        const vPos = startV + t * 0.35;
        const r = 1.0 + 0.15 * Math.cos(angle) - 0.08 * (vPos - 0.5);
        const phi = vPos * Math.PI;
        const theta = angle * Math.PI * 2;
        points.push(new THREE.Vector3(
          r * Math.sin(phi) * Math.cos(theta),
          1.3 * r * Math.cos(phi) * 0.95,
          0.88 * r * Math.sin(phi) * Math.sin(theta)
        ));
      }
      veinCurves.push({ curve: new THREE.CatmullRomCurve3(points), radius: 0.005 + Math.random() * 0.003 });
    }

    // Great cardiac vein (follows AV groove and then IV sulcus)
    const gcv = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.08, -0.5, 0.5),
      new THREE.Vector3(-0.1, -0.15, 0.75),
      new THREE.Vector3(-0.06, 0.15, 0.82),
      new THREE.Vector3(-0.02, 0.38, 0.72),
      new THREE.Vector3(-0.3, 0.4, 0.55),
      new THREE.Vector3(-0.6, 0.38, 0.25),
    ]);
    veinCurves.push({ curve: gcv, radius: 0.008 });

    // Middle cardiac vein
    const mcv = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.1, -0.65, 0.15),
      new THREE.Vector3(-0.05, -0.35, -0.55),
      new THREE.Vector3(0.0, -0.05, -0.68),
      new THREE.Vector3(0.05, 0.25, -0.6),
    ]);
    veinCurves.push({ curve: mcv, radius: 0.007 });

    return veinCurves;
  }, []);

  return (
    <group>
      {veins.map((v, i) => (
        <mesh key={i}>
          <tubeGeometry args={[v.curve, 32, v.radius, 6, false]} />
          <meshPhysicalMaterial
            color="#2a1848"
            roughness={0.6}
            metalness={0.0}
            clearcoat={0.2}
          />
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
    { id: 'right-atrium', position: [0.45, 0.55, 0.15] as [number, number, number], color: '#4a6f9e', label: 'RA' },
    { id: 'left-atrium', position: [-0.35, 0.55, -0.2] as [number, number, number], color: '#8e3535', label: 'LA' },
    { id: 'right-ventricle', position: [0.35, -0.15, 0.25] as [number, number, number], color: '#5b7faa', label: 'RV' },
    { id: 'left-ventricle', position: [-0.2, -0.2, -0.05] as [number, number, number], color: '#a83030', label: 'LV' },
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
              transparent
              opacity={0.5}
              roughness={0.3}
            />
          </mesh>
          <Html center distanceFactor={3} style={{ pointerEvents: 'none' }}>
            <div className="bg-cardiac-panel/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
              {ch.label}
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}

// ─── Coronary arteries ─────────────────────────────────────────────────
function CoronaryOverlay() {
  const { viewMode } = useAppStore();

  const arteries = useMemo(() => {
    const lad = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.05, 0.45, 0.75),
      new THREE.Vector3(-0.08, 0.2, 0.82),
      new THREE.Vector3(-0.1, -0.05, 0.78),
      new THREE.Vector3(-0.12, -0.3, 0.65),
      new THREE.Vector3(-0.1, -0.55, 0.45),
      new THREE.Vector3(-0.08, -0.75, 0.25),
    ]);
    const lcx = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.05, 0.45, 0.75),
      new THREE.Vector3(-0.35, 0.42, 0.55),
      new THREE.Vector3(-0.65, 0.35, 0.2),
      new THREE.Vector3(-0.75, 0.3, -0.15),
      new THREE.Vector3(-0.6, 0.25, -0.45),
    ]);
    const rca = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.15, 0.5, 0.7),
      new THREE.Vector3(0.5, 0.42, 0.55),
      new THREE.Vector3(0.75, 0.35, 0.25),
      new THREE.Vector3(0.8, 0.3, -0.1),
      new THREE.Vector3(0.65, 0.2, -0.4),
      new THREE.Vector3(0.35, 0.1, -0.6),
    ]);
    const diag1 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.08, 0.2, 0.82),
      new THREE.Vector3(-0.3, 0.05, 0.75),
      new THREE.Vector3(-0.5, -0.1, 0.55),
    ]);
    const diag2 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.1, -0.05, 0.78),
      new THREE.Vector3(-0.35, -0.15, 0.7),
      new THREE.Vector3(-0.55, -0.25, 0.5),
    ]);
    const marginal = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.75, 0.35, 0.25),
      new THREE.Vector3(0.7, 0.1, 0.35),
      new THREE.Vector3(0.55, -0.15, 0.35),
    ]);
    const pda = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.35, 0.1, -0.6),
      new THREE.Vector3(0.15, -0.1, -0.62),
      new THREE.Vector3(-0.02, -0.35, -0.55),
      new THREE.Vector3(-0.08, -0.55, -0.38),
    ]);
    const obtuseMarg = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.65, 0.35, 0.2),
      new THREE.Vector3(-0.72, 0.15, 0.15),
      new THREE.Vector3(-0.68, -0.08, 0.05),
    ]);

    return [
      { curve: lad, name: 'LAD', color: '#bb1818', radius: 0.016 },
      { curve: lcx, name: 'LCx', color: '#bb2218', radius: 0.014 },
      { curve: rca, name: 'RCA', color: '#bb1818', radius: 0.015 },
      { curve: diag1, name: 'D1', color: '#cc3030', radius: 0.009 },
      { curve: diag2, name: 'D2', color: '#cc3030', radius: 0.007 },
      { curve: marginal, name: 'AM', color: '#cc3030', radius: 0.009 },
      { curve: pda, name: 'PDA', color: '#cc3030', radius: 0.01 },
      { curve: obtuseMarg, name: 'OM', color: '#cc3030', radius: 0.008 },
    ];
  }, []);

  if (viewMode !== 'coronary' && viewMode !== 'external') return null;

  return (
    <group>
      {arteries.map((a) => (
        <mesh key={a.name}>
          <tubeGeometry args={[a.curve, 64, a.radius, 8, false]} />
          <meshPhysicalMaterial
            color={a.color}
            roughness={0.45}
            clearcoat={0.3}
            emissive={a.color}
            emissiveIntensity={0.1}
          />
        </mesh>
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
    { id: 'sa-node', pos: [0.5, 0.65, 0.3] as [number, number, number], label: 'SA Node' },
    { id: 'av-node', pos: [0.1, 0.3, 0.3] as [number, number, number], label: 'AV Node' },
    { id: 'bundle-of-his', pos: [0, 0.1, 0.3] as [number, number, number], label: 'Bundle of His' },
    { id: 'rbb', pos: [0.25, -0.25, 0.3] as [number, number, number], label: 'RBB' },
    { id: 'lbb', pos: [-0.2, -0.25, 0.3] as [number, number, number], label: 'LBB' },
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
              <div className="text-yellow-400 text-xs font-bold whitespace-nowrap">
                {node.label}
              </div>
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
  const particlesRef = useRef<THREE.Points>(null);

  const particleCount = 200;
  const positions = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 1.6;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
      const isOxy = pos[i * 3] < 0;
      colors[i * 3] = isOxy ? 0.7 : 0.15;
      colors[i * 3 + 1] = 0.05;
      colors[i * 3 + 2] = isOxy ? 0.1 : 0.6;
    }
    return { positions: pos, colors };
  }, []);

  useFrame((_, delta) => {
    if (!particlesRef.current || !playing) return;
    const posArr = particlesRef.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < particleCount; i++) {
      posArr[i * 3 + 1] -= delta * 0.5 * (cycleProgress > 0.16 && cycleProgress < 0.4 ? 2 : 0.5);
      if (posArr[i * 3 + 1] < -1.2) posArr[i * 3 + 1] = 1.2;
    }
    particlesRef.current.geometry.attributes.position.needsUpdate = true;
  });

  if (viewMode !== 'internal' && viewMode !== 'perfusion') return null;

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[positions.colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.025} vertexColors transparent opacity={0.6} />
    </points>
  );
}

// ─── Great vessels ─────────────────────────────────────────────────────
function GreatVessels() {
  const vessels = useMemo(() => {
    const aorta = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.05, 0.85, 0.1),
      new THREE.Vector3(-0.05, 1.15, 0.15),
      new THREE.Vector3(0.0, 1.35, 0.05),
      new THREE.Vector3(0.15, 1.45, -0.1),
      new THREE.Vector3(0.3, 1.4, -0.3),
      new THREE.Vector3(0.25, 1.2, -0.5),
      new THREE.Vector3(0.15, 0.9, -0.6),
    ]);
    // Brachiocephalic trunk
    const bct = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.1, 1.4, -0.05),
      new THREE.Vector3(0.2, 1.6, 0.0),
      new THREE.Vector3(0.35, 1.75, 0.05),
    ]);
    // Left common carotid
    const lcc = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.05, 1.42, -0.08),
      new THREE.Vector3(-0.02, 1.65, -0.05),
      new THREE.Vector3(-0.08, 1.8, 0.0),
    ]);
    // Left subclavian
    const lsc = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.2, 1.43, -0.15),
      new THREE.Vector3(-0.05, 1.55, -0.25),
      new THREE.Vector3(-0.3, 1.6, -0.3),
    ]);
    const pulmonaryTrunk = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.15, 0.8, 0.35),
      new THREE.Vector3(0.1, 1.1, 0.4),
      new THREE.Vector3(-0.05, 1.2, 0.35),
      new THREE.Vector3(-0.25, 1.15, 0.2),
    ]);
    const rpa = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.05, 1.2, 0.35),
      new THREE.Vector3(0.2, 1.25, 0.15),
      new THREE.Vector3(0.45, 1.2, 0.0),
    ]);
    const svc = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.4, 0.75, 0.15),
      new THREE.Vector3(0.42, 1.1, 0.12),
      new THREE.Vector3(0.4, 1.45, 0.1),
    ]);
    const ivc = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.3, -0.5, -0.2),
      new THREE.Vector3(0.32, -0.85, -0.25),
      new THREE.Vector3(0.3, -1.15, -0.3),
    ]);
    const lpv = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.55, 0.6, -0.2),
      new THREE.Vector3(-0.85, 0.65, -0.35),
      new THREE.Vector3(-1.1, 0.7, -0.4),
    ]);
    const rpv = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.25, 0.6, -0.25),
      new THREE.Vector3(0.55, 0.65, -0.4),
      new THREE.Vector3(0.8, 0.7, -0.45),
    ]);

    return [
      { id: 'aorta', curve: aorta, color: '#8a1a1a', radius: 0.09 },
      { id: 'bct', curve: bct, color: '#8a1a1a', radius: 0.04 },
      { id: 'lcc', curve: lcc, color: '#8a1a1a', radius: 0.032 },
      { id: 'lsc', curve: lsc, color: '#8a1a1a', radius: 0.035 },
      { id: 'pulmonary-trunk', curve: pulmonaryTrunk, color: '#223a60', radius: 0.075 },
      { id: 'rpa', curve: rpa, color: '#223a60', radius: 0.045 },
      { id: 'svc', curve: svc, color: '#1e3050', radius: 0.055 },
      { id: 'ivc', curve: ivc, color: '#1e3050', radius: 0.06 },
      { id: 'lpv', curve: lpv, color: '#6a2020', radius: 0.035 },
      { id: 'rpv', curve: rpv, color: '#6a2020', radius: 0.035 },
    ];
  }, []);

  return (
    <group>
      {vessels.map((v) => (
        <mesh key={v.id} castShadow>
          <tubeGeometry args={[v.curve, 48, v.radius, 12, false]} />
          <meshPhysicalMaterial
            color={v.color}
            roughness={0.5}
            metalness={0.01}
            clearcoat={0.25}
            clearcoatRoughness={0.4}
          />
        </mesh>
      ))}
    </group>
  );
}

// ─── Epicardial fat ────────────────────────────────────────────────────
function EpicardialFat() {
  const fatDeposits = useMemo(() => {
    const avGrooveFat = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.6, 0.38, 0.5),
      new THREE.Vector3(0.75, 0.35, 0.2),
      new THREE.Vector3(0.7, 0.33, -0.15),
      new THREE.Vector3(0.4, 0.32, -0.45),
      new THREE.Vector3(0.0, 0.33, -0.6),
      new THREE.Vector3(-0.4, 0.35, -0.45),
      new THREE.Vector3(-0.7, 0.36, -0.15),
      new THREE.Vector3(-0.65, 0.38, 0.25),
    ]);
    const aivFat = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.05, 0.4, 0.78),
      new THREE.Vector3(-0.08, 0.1, 0.8),
      new THREE.Vector3(-0.1, -0.2, 0.7),
      new THREE.Vector3(-0.1, -0.45, 0.5),
    ]);
    // Fat pad at base of aorta
    const aorticFat = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.15, 0.75, 0.2),
      new THREE.Vector3(0.05, 0.78, 0.3),
      new THREE.Vector3(0.2, 0.75, 0.2),
    ]);

    return [
      { curve: avGrooveFat, radius: 0.04, color: '#b89838' },
      { curve: aivFat, radius: 0.035, color: '#b89838' },
      { curve: aorticFat, radius: 0.05, color: '#c4a84a' },
    ];
  }, []);

  return (
    <group>
      {fatDeposits.map((f, i) => (
        <mesh key={i}>
          <tubeGeometry args={[f.curve, 32, f.radius, 8, false]} />
          <meshPhysicalMaterial
            color={f.color}
            roughness={0.85}
            metalness={0.0}
            transparent
            opacity={0.65}
          />
        </mesh>
      ))}
    </group>
  );
}

// ─── Animation tick ────────────────────────────────────────────────────
function AnimationTick() {
  const tick = useTimelineStore((s) => s.tick);
  useFrame((_, delta) => {
    tick(delta * 1000);
  });
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

// ─── Main 3D Scene ─────────────────────────────────────────────────────
export default function HeartScene() {
  return (
    <div className="w-full h-full bg-cardiac-dark">
      <Canvas
        camera={{ position: [0, 0, 3.5], fov: 45 }}
        shadows
        gl={{
          antialias: true,
          alpha: false,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
        }}
        style={{ background: '#080c14' }}
      >
        {/* Key light: warm, upper-right-front */}
        <directionalLight
          position={[4, 5, 3]}
          intensity={1.4}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          color="#fff0e0"
        />
        {/* Fill light: cooler blue, from left */}
        <directionalLight position={[-4, 2, 2]} intensity={0.35} color="#b8c8e0" />
        {/* Rim/back light: warm edge highlight */}
        <directionalLight position={[1, 2, -5]} intensity={0.4} color="#e0c8b0" />
        {/* Bottom bounce: warm reflected light */}
        <pointLight position={[0, -2.5, 1.5]} intensity={0.12} color="#ff7755" distance={6} />
        {/* Subtle ambient to prevent pure black shadows */}
        <ambientLight intensity={0.18} color="#c0b8d0" />
        {/* Spot highlight on the heart center for depth */}
        <spotLight
          position={[2, 3, 4]}
          angle={0.4}
          penumbra={0.8}
          intensity={0.5}
          color="#ffe8d8"
          castShadow={false}
        />

        <AnimationTick />
        <CameraController />

        <group rotation={[0.2, -0.3, 0.1]}>
          <HeartMesh />
          <GreatVessels />
          <EpicardialFat />
          <SurfaceVeins />
          <CoronaryOverlay />
          <ChamberMeshes />
          <ConductionOverlay />
          <BloodFlowParticles />
        </group>

        <ContactShadows position={[0, -2, 0]} opacity={0.5} blur={2.5} far={4} />
        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          minDistance={1.5}
          maxDistance={8}
          dampingFactor={0.08}
          enableDamping
        />
        <Environment preset="studio" />
      </Canvas>
    </div>
  );
}
