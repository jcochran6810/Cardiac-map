'use client';

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { useSceneStore } from '@/store/useSceneStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { useAppStore } from '@/store/useAppStore';

// ─── Anatomical heart geometry builder ─────────────────────────────────
// Builds a realistic heart from multiple deformed ellipsoids fused together
// with surface grooves (sulci) and proper asymmetry.

function buildAnatomicalHeartGeometry(): THREE.BufferGeometry {
  const segments = 128;
  const rings = 96;
  const vertices: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j <= rings; j++) {
    const v = j / rings;
    const phi = v * Math.PI; // 0 to PI (top to bottom)

    for (let i = 0; i <= segments; i++) {
      const u = i / segments;
      const theta = u * Math.PI * 2; // 0 to 2PI around

      // --- Base ellipsoid (overall heart shape) ---
      // The heart is wider than tall, and deeper front-to-back
      let rx = 1.0;
      let ry = 1.25;
      let rz = 0.85;

      // --- Apex tapering (bottom comes to a point, shifted left) ---
      const apexFactor = Math.pow(Math.sin(phi), 0.6);
      const apexTaper = v > 0.55 ? 1.0 - 0.65 * Math.pow((v - 0.55) / 0.45, 1.8) : 1.0;

      // --- Atrial bulges (top of heart, two bumps) ---
      const atrialRegion = v < 0.35 ? Math.pow(1.0 - v / 0.35, 2) : 0;
      // Right atrium bulge (right-front)
      const raAngle = Math.cos(theta - 0.3) * 0.5 + 0.5;
      const raBulge = atrialRegion * raAngle * 0.25;
      // Left atrium bulge (left-back)
      const laAngle = Math.cos(theta - Math.PI + 0.3) * 0.5 + 0.5;
      const laBulge = atrialRegion * laAngle * 0.2;

      // --- Ventricular asymmetry ---
      // LV is thick and round (left-back), RV wraps around front-right
      const ventricularRegion = v > 0.3 && v < 0.85 ? Math.sin((v - 0.3) / 0.55 * Math.PI) : 0;
      // RV bulge on the front-right
      const rvAngle = Math.cos(theta - 0.4) * 0.5 + 0.5;
      const rvBulge = ventricularRegion * rvAngle * 0.15;
      // LV is slightly more convex on the left-back
      const lvAngle = Math.cos(theta - Math.PI - 0.2) * 0.5 + 0.5;
      const lvBulge = ventricularRegion * lvAngle * 0.1;

      // --- Interventricular sulcus (anterior groove) ---
      // Runs from base to apex on the front surface
      const ivSulcusAngle = Math.exp(-Math.pow((theta - 0.2), 2) * 8);
      const ivSulcusDepth = ventricularRegion * ivSulcusAngle * 0.08;
      // Posterior interventricular sulcus
      const pivSulcusAngle = Math.exp(-Math.pow((theta - Math.PI - 0.1), 2) * 8);
      const pivSulcusDepth = ventricularRegion * pivSulcusAngle * 0.06;

      // --- Coronary (atrioventricular) sulcus ---
      // Horizontal groove separating atria from ventricles
      const avSulcusRegion = Math.exp(-Math.pow((v - 0.33), 2) * 200);
      const avSulcusDepth = avSulcusRegion * 0.07;

      // --- Combine all modifiers ---
      const totalRadius = (1.0 + raBulge + laBulge + rvBulge + lvBulge
        - ivSulcusDepth - pivSulcusDepth - avSulcusDepth) * apexTaper;

      // Spherical to cartesian with ellipsoid radii
      let x = rx * totalRadius * Math.sin(phi) * Math.cos(theta);
      let y = ry * totalRadius * Math.cos(phi); // vertical
      let z = rz * totalRadius * Math.sin(phi) * Math.sin(theta);

      // --- Apex displacement (point shifts left and slightly forward) ---
      if (v > 0.6) {
        const apexShift = Math.pow((v - 0.6) / 0.4, 2);
        x -= apexShift * 0.15;
        z += apexShift * 0.08;
      }

      // --- Slight overall tilt (heart tilts left and forward) ---
      const tiltAngle = 0.15;
      const yTilted = y * Math.cos(tiltAngle) - z * Math.sin(tiltAngle);
      const zTilted = y * Math.sin(tiltAngle) + z * Math.cos(tiltAngle);

      // --- Surface irregularity (organic feel) ---
      const noise = Math.sin(theta * 7 + phi * 5) * 0.008
        + Math.sin(theta * 13 + phi * 11) * 0.005
        + Math.sin(theta * 23 + phi * 19) * 0.003;
      const finalX = x * (1 + noise);
      const finalY = yTilted * (1 + noise * 0.5);
      const finalZ = zTilted * (1 + noise);

      vertices.push(finalX, finalY, finalZ);
      uvs.push(u, v);
      // Placeholder normals - will recompute
      normals.push(0, 0, 0);
    }
  }

  // Build index buffer
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

// ─── Surface detail: fat/epicardial coloring via vertex colors ─────────
function addVertexColors(geometry: THREE.BufferGeometry) {
  const pos = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  const count = pos.count;
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    const theta = u * Math.PI * 2;

    // Base tissue color: deep reddish-brown
    let r = 0.45, g = 0.12, b = 0.1;

    // Darker in sulci regions
    const ventricularRegion = v > 0.3 && v < 0.85 ? Math.sin((v - 0.3) / 0.55 * Math.PI) : 0;
    const ivSulcus = Math.exp(-Math.pow((theta - 0.2), 2) * 8) * ventricularRegion;
    const avSulcus = Math.exp(-Math.pow((v - 0.33), 2) * 200);

    // Fat deposits along sulci (yellowish)
    const fatAmount = (ivSulcus * 0.6 + avSulcus * 0.5);
    r += fatAmount * 0.35;
    g += fatAmount * 0.3;
    b += fatAmount * 0.05;

    // Atria are slightly lighter/pinker
    if (v < 0.3) {
      const atrialBlend = 1.0 - v / 0.3;
      r += atrialBlend * 0.08;
      g += atrialBlend * 0.02;
      b += atrialBlend * 0.02;
    }

    // Ventricles slightly darker/redder toward apex
    if (v > 0.6) {
      const apexBlend = (v - 0.6) / 0.4;
      r -= apexBlend * 0.06;
      g -= apexBlend * 0.02;
    }

    // Slight variation for organic look
    const noise = Math.sin(theta * 17 + v * 31) * 0.02;
    r += noise;
    g += noise * 0.5;
    b += noise * 0.3;

    colors[i * 3] = Math.max(0, Math.min(1, r));
    colors[i * 3 + 1] = Math.max(0, Math.min(1, g));
    colors[i * 3 + 2] = Math.max(0, Math.min(1, b));
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

// ─── Pulsing anatomical heart mesh ─────────────────────────────────────
function HeartMesh() {
  const meshRef = useRef<THREE.Mesh>(null);
  const { cycleProgress, playing } = useTimelineStore();
  const { hoveredStructureId } = useSceneStore();
  const { viewMode } = useAppStore();

  const geometry = useMemo(() => {
    const geo = buildAnatomicalHeartGeometry();
    addVertexColors(geo);
    return geo;
  }, []);

  useFrame(() => {
    if (meshRef.current && playing) {
      // Systolic contraction: ventricles squeeze
      const systolicPhase = cycleProgress > 0.11 && cycleProgress < 0.4;
      const t = systolicPhase ? (cycleProgress - 0.11) / 0.29 : 0;
      const contractAmount = systolicPhase ? Math.sin(t * Math.PI) : 0;

      // Different contraction axes for realism
      const sx = 1 - contractAmount * 0.04;
      const sy = 1 + contractAmount * 0.02; // elongates slightly during systole
      const sz = 1 - contractAmount * 0.04;
      meshRef.current.scale.set(sx, sy, sz);
    }
  });

  const isHighlighted = hoveredStructureId === 'heart-external';

  return (
    <mesh ref={meshRef} geometry={geometry} castShadow receiveShadow>
      <meshPhysicalMaterial
        vertexColors
        roughness={0.65}
        metalness={0.02}
        clearcoat={0.3}
        clearcoatRoughness={0.4}
        sheen={0.4}
        sheenRoughness={0.5}
        sheenColor={new THREE.Color(0.5, 0.1, 0.08)}
        transparent={viewMode === 'cutaway'}
        opacity={viewMode === 'cutaway' ? 0.5 : 1}
        side={viewMode === 'cutaway' ? THREE.DoubleSide : THREE.FrontSide}
        emissive={isHighlighted ? new THREE.Color(0.15, 0.03, 0.02) : new THREE.Color(0, 0, 0)}
      />
    </mesh>
  );
}

// ─── Chamber meshes (internal view) ────────────────────────────────────
function ChamberMeshes() {
  const { viewMode } = useAppStore();
  const { selectedStructureId, selectStructure, hoverStructure } = useSceneStore();

  const chambers = useMemo(() => [
    { id: 'right-atrium', position: [0.45, 0.55, 0.15] as [number, number, number], color: '#4a6f9e', label: 'RA', size: [0.3, 0.25, 0.25] as [number, number, number] },
    { id: 'left-atrium', position: [-0.35, 0.55, -0.2] as [number, number, number], color: '#8e3535', label: 'LA', size: [0.3, 0.25, 0.25] as [number, number, number] },
    { id: 'right-ventricle', position: [0.35, -0.15, 0.25] as [number, number, number], color: '#5b7faa', label: 'RV', size: [0.3, 0.45, 0.25] as [number, number, number] },
    { id: 'left-ventricle', position: [-0.2, -0.2, -0.05] as [number, number, number], color: '#a83030', label: 'LV', size: [0.35, 0.5, 0.3] as [number, number, number] },
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

// ─── Coronary artery overlay ───────────────────────────────────────────
function CoronaryOverlay() {
  const { viewMode } = useAppStore();

  const arteries = useMemo(() => {
    // LAD runs along the anterior interventricular sulcus
    const lad = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.05, 0.45, 0.75),
      new THREE.Vector3(-0.08, 0.2, 0.82),
      new THREE.Vector3(-0.1, -0.05, 0.78),
      new THREE.Vector3(-0.12, -0.3, 0.65),
      new THREE.Vector3(-0.1, -0.55, 0.45),
      new THREE.Vector3(-0.08, -0.75, 0.25),
    ]);
    // LCx runs along the left AV groove
    const lcx = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.05, 0.45, 0.75),
      new THREE.Vector3(-0.35, 0.42, 0.55),
      new THREE.Vector3(-0.65, 0.35, 0.2),
      new THREE.Vector3(-0.75, 0.3, -0.15),
      new THREE.Vector3(-0.6, 0.25, -0.45),
    ]);
    // RCA runs along the right AV groove
    const rca = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.15, 0.5, 0.7),
      new THREE.Vector3(0.5, 0.42, 0.55),
      new THREE.Vector3(0.75, 0.35, 0.25),
      new THREE.Vector3(0.8, 0.3, -0.1),
      new THREE.Vector3(0.65, 0.2, -0.4),
      new THREE.Vector3(0.35, 0.1, -0.6),
    ]);
    // Diagonal branch
    const diag = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.08, 0.2, 0.82),
      new THREE.Vector3(-0.3, 0.05, 0.75),
      new THREE.Vector3(-0.5, -0.1, 0.55),
    ]);
    // Marginal branch from RCA
    const marginal = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.75, 0.35, 0.25),
      new THREE.Vector3(0.7, 0.1, 0.35),
      new THREE.Vector3(0.55, -0.15, 0.35),
    ]);

    return [
      { curve: lad, name: 'LAD', color: '#cc2222', radius: 0.018 },
      { curve: lcx, name: 'LCx', color: '#cc3322', radius: 0.015 },
      { curve: rca, name: 'RCA', color: '#cc2222', radius: 0.017 },
      { curve: diag, name: 'D1', color: '#cc3333', radius: 0.01 },
      { curve: marginal, name: 'OM', color: '#cc3333', radius: 0.01 },
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
            roughness={0.5}
            emissive={a.color}
            emissiveIntensity={0.15}
          />
        </mesh>
      ))}
    </group>
  );
}

// ─── Conduction system overlay ─────────────────────────────────────────
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

// ─── Great vessels (anatomically placed) ───────────────────────────────
function GreatVessels() {
  const vessels = useMemo(() => {
    // Aorta: rises from LV, arches over and back
    const aorta = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.05, 0.85, 0.1),
      new THREE.Vector3(-0.05, 1.15, 0.15),
      new THREE.Vector3(0.0, 1.35, 0.05),
      new THREE.Vector3(0.15, 1.45, -0.1),
      new THREE.Vector3(0.3, 1.4, -0.3),
      new THREE.Vector3(0.25, 1.2, -0.5),
      new THREE.Vector3(0.15, 0.9, -0.6),
    ]);
    // Pulmonary trunk: rises from RV, splits left
    const pulmonaryTrunk = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.15, 0.8, 0.35),
      new THREE.Vector3(0.1, 1.1, 0.4),
      new THREE.Vector3(-0.05, 1.2, 0.35),
      new THREE.Vector3(-0.25, 1.15, 0.2),
    ]);
    // Right pulmonary artery
    const rpa = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.05, 1.2, 0.35),
      new THREE.Vector3(0.2, 1.25, 0.15),
      new THREE.Vector3(0.45, 1.2, 0.0),
    ]);
    // SVC
    const svc = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.4, 0.75, 0.15),
      new THREE.Vector3(0.42, 1.1, 0.12),
      new THREE.Vector3(0.4, 1.45, 0.1),
    ]);
    // IVC
    const ivc = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.3, -0.5, -0.2),
      new THREE.Vector3(0.32, -0.85, -0.25),
      new THREE.Vector3(0.3, -1.15, -0.3),
    ]);
    // Pulmonary veins (left pair)
    const lpv = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.55, 0.6, -0.2),
      new THREE.Vector3(-0.85, 0.65, -0.35),
      new THREE.Vector3(-1.1, 0.7, -0.4),
    ]);
    // Pulmonary veins (right pair)
    const rpv = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.25, 0.6, -0.25),
      new THREE.Vector3(0.55, 0.65, -0.4),
      new THREE.Vector3(0.8, 0.7, -0.45),
    ]);

    return [
      { id: 'aorta', curve: aorta, color: '#a82020', radius: 0.09 },
      { id: 'pulmonary-trunk', curve: pulmonaryTrunk, color: '#2a4a7a', radius: 0.075 },
      { id: 'rpa', curve: rpa, color: '#2a4a7a', radius: 0.045 },
      { id: 'svc', curve: svc, color: '#2a3f6a', radius: 0.055 },
      { id: 'ivc', curve: ivc, color: '#2a3f6a', radius: 0.06 },
      { id: 'lpv', curve: lpv, color: '#7a2828', radius: 0.035 },
      { id: 'rpv', curve: rpv, color: '#7a2828', radius: 0.035 },
    ];
  }, []);

  return (
    <group>
      {vessels.map((v) => (
        <mesh key={v.id} castShadow>
          <tubeGeometry args={[v.curve, 48, v.radius, 12, false]} />
          <meshPhysicalMaterial
            color={v.color}
            roughness={0.55}
            metalness={0.02}
            clearcoat={0.2}
            clearcoatRoughness={0.5}
          />
        </mesh>
      ))}
    </group>
  );
}

// ─── Pericardial fat deposits along sulci ──────────────────────────────
function EpicardialFat() {
  const fatDeposits = useMemo(() => {
    // Fat along the AV groove
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
    // Fat along anterior IV sulcus
    const aivFat = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.05, 0.4, 0.78),
      new THREE.Vector3(-0.08, 0.1, 0.8),
      new THREE.Vector3(-0.1, -0.2, 0.7),
      new THREE.Vector3(-0.1, -0.45, 0.5),
    ]);

    return [
      { curve: avGrooveFat, radius: 0.04, color: '#c4a84a' },
      { curve: aivFat, radius: 0.03, color: '#c4a84a' },
    ];
  }, []);

  return (
    <group>
      {fatDeposits.map((f, i) => (
        <mesh key={i}>
          <tubeGeometry args={[f.curve, 32, f.radius, 8, false]} />
          <meshPhysicalMaterial
            color={f.color}
            roughness={0.8}
            metalness={0.0}
            transparent
            opacity={0.7}
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
        gl={{ antialias: true, alpha: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
        style={{ background: '#0a0f1a' }}
      >
        {/* Key light - warm, from upper right */}
        <directionalLight
          position={[4, 5, 3]}
          intensity={1.2}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          color="#fff5ee"
        />
        {/* Fill light - cooler, from left */}
        <directionalLight position={[-3, 2, 2]} intensity={0.4} color="#c0d0e8" />
        {/* Rim light - from behind */}
        <directionalLight position={[0, 1, -4]} intensity={0.3} color="#e8d0c0" />
        {/* Subtle ambient */}
        <ambientLight intensity={0.25} color="#d0c8e0" />
        {/* Warm accent from below (simulating reflected light from tissue) */}
        <pointLight position={[0, -2, 1]} intensity={0.15} color="#ff8866" />

        <AnimationTick />
        <CameraController />

        <group rotation={[0.2, -0.3, 0.1]}>
          <HeartMesh />
          <GreatVessels />
          <EpicardialFat />
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
