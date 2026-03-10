'use client';

import React, { useRef, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Html, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { useSceneStore, CAMERA_PRESETS } from '@/store/useSceneStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { useAppStore } from '@/store/useAppStore';

// Procedural heart geometry using parametric surface
function createHeartShape(): THREE.Shape {
  const shape = new THREE.Shape();
  // Heart outline using bezier curves
  shape.moveTo(0, -0.8);
  shape.bezierCurveTo(0, -1.2, -0.5, -1.4, -0.8, -1.0);
  shape.bezierCurveTo(-1.2, -0.6, -1.2, 0.2, -0.8, 0.6);
  shape.bezierCurveTo(-0.5, 0.9, -0.1, 1.1, 0, 1.3);
  shape.bezierCurveTo(0.1, 1.1, 0.5, 0.9, 0.8, 0.6);
  shape.bezierCurveTo(1.2, 0.2, 1.2, -0.6, 0.8, -1.0);
  shape.bezierCurveTo(0.5, -1.4, 0, -1.2, 0, -0.8);
  return shape;
}

// Pulsing heart mesh
function HeartMesh() {
  const meshRef = useRef<THREE.Mesh>(null);
  const { cycleProgress, playing } = useTimelineStore();
  const { selectedStructureId, hoveredStructureId } = useSceneStore();
  const { viewMode } = useAppStore();

  const geometry = useMemo(() => {
    const shape = createHeartShape();
    const extrudeSettings = {
      depth: 0.8,
      bevelEnabled: true,
      bevelSegments: 12,
      steps: 2,
      bevelSize: 0.3,
      bevelThickness: 0.3,
    };
    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.center();
    geo.computeVertexNormals();
    return geo;
  }, []);

  useFrame(() => {
    if (meshRef.current && playing) {
      // Simulate cardiac contraction
      const contractPhase = cycleProgress > 0.11 && cycleProgress < 0.4;
      const scale = contractPhase
        ? 1 - 0.05 * Math.sin((cycleProgress - 0.11) / 0.29 * Math.PI)
        : 1;
      meshRef.current.scale.setScalar(scale);
    }
  });

  const isHighlighted = hoveredStructureId === 'heart-external';

  return (
    <mesh ref={meshRef} geometry={geometry} castShadow receiveShadow>
      <meshPhysicalMaterial
        color={isHighlighted ? '#ff6b6b' : '#cc3333'}
        roughness={0.4}
        metalness={0.1}
        transparent={viewMode === 'cutaway'}
        opacity={viewMode === 'cutaway' ? 0.5 : 1}
        side={viewMode === 'cutaway' ? THREE.DoubleSide : THREE.FrontSide}
      />
    </mesh>
  );
}

// Chamber meshes
function ChamberMeshes() {
  const { viewMode } = useAppStore();
  const { selectedStructureId, selectStructure, hoverStructure } = useSceneStore();

  const chambers = useMemo(() => [
    { id: 'right-atrium', position: [0.5, 0.4, 0] as [number, number, number], color: '#4a90d9', label: 'RA', size: 0.35 },
    { id: 'left-atrium', position: [-0.5, 0.4, -0.3] as [number, number, number], color: '#d94a4a', label: 'LA', size: 0.35 },
    { id: 'right-ventricle', position: [0.4, -0.3, 0.2] as [number, number, number], color: '#5b9bd5', label: 'RV', size: 0.45 },
    { id: 'left-ventricle', position: [-0.3, -0.3, -0.1] as [number, number, number], color: '#e04040', label: 'LV', size: 0.5 },
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
            <sphereGeometry args={[ch.size, 32, 32]} />
            <meshPhysicalMaterial
              color={selectedStructureId === ch.id ? '#ffff00' : ch.color}
              transparent
              opacity={0.6}
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

// Coronary artery overlay
function CoronaryOverlay() {
  const { viewMode } = useAppStore();

  const arteries = useMemo(() => {
    const lad = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.1, 0.8, 0.6),
      new THREE.Vector3(-0.2, 0.3, 0.7),
      new THREE.Vector3(-0.15, -0.2, 0.65),
      new THREE.Vector3(-0.1, -0.7, 0.5),
    ]);
    const lcx = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.1, 0.8, 0.6),
      new THREE.Vector3(-0.5, 0.6, 0.3),
      new THREE.Vector3(-0.8, 0.3, -0.1),
      new THREE.Vector3(-0.7, 0, -0.3),
    ]);
    const rca = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.2, 0.8, 0.5),
      new THREE.Vector3(0.6, 0.5, 0.4),
      new THREE.Vector3(0.8, 0.1, 0.1),
      new THREE.Vector3(0.6, -0.3, -0.2),
      new THREE.Vector3(0.3, -0.5, -0.4),
    ]);
    return [
      { curve: lad, name: 'LAD', color: '#ff4444' },
      { curve: lcx, name: 'LCx', color: '#ff6644' },
      { curve: rca, name: 'RCA', color: '#ff8844' },
    ];
  }, []);

  if (viewMode !== 'coronary' && viewMode !== 'external') return null;

  return (
    <group>
      {arteries.map((a) => (
        <mesh key={a.name}>
          <tubeGeometry args={[a.curve, 64, 0.025, 8, false]} />
          <meshStandardMaterial color={a.color} emissive={a.color} emissiveIntensity={0.3} />
        </mesh>
      ))}
    </group>
  );
}

// Conduction system overlay
function ConductionOverlay() {
  const { viewMode } = useAppStore();
  const { conductionProgress } = useTimelineStore();

  if (viewMode !== 'conduction') return null;

  const nodes = [
    { id: 'sa-node', pos: [0.4, 0.7, 0.3] as [number, number, number], label: 'SA Node' },
    { id: 'av-node', pos: [0.1, 0.2, 0.3] as [number, number, number], label: 'AV Node' },
    { id: 'bundle-of-his', pos: [0, 0, 0.3] as [number, number, number], label: 'Bundle of His' },
    { id: 'rbb', pos: [0.3, -0.3, 0.3] as [number, number, number], label: 'RBB' },
    { id: 'lbb', pos: [-0.3, -0.3, 0.3] as [number, number, number], label: 'LBB' },
  ];

  return (
    <group>
      {nodes.map((node, i) => {
        const active = conductionProgress > i * 0.2;
        return (
          <group key={node.id} position={node.pos}>
            <mesh>
              <sphereGeometry args={[0.06, 16, 16]} />
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

// Blood flow particles
function BloodFlowParticles() {
  const { viewMode } = useAppStore();
  const { cycleProgress, playing } = useTimelineStore();
  const particlesRef = useRef<THREE.Points>(null);

  const particleCount = 200;
  const positions = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 2;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
      // Red for oxygenated, blue for deoxygenated
      const isOxy = pos[i * 3] < 0;
      colors[i * 3] = isOxy ? 0.9 : 0.2;
      colors[i * 3 + 1] = 0.1;
      colors[i * 3 + 2] = isOxy ? 0.2 : 0.9;
    }
    return { positions: pos, colors };
  }, []);

  useFrame((_, delta) => {
    if (!particlesRef.current || !playing) return;
    const posArr = particlesRef.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < particleCount; i++) {
      posArr[i * 3 + 1] -= delta * 0.5 * (cycleProgress > 0.16 && cycleProgress < 0.4 ? 2 : 0.5);
      if (posArr[i * 3 + 1] < -1.5) posArr[i * 3 + 1] = 1.5;
    }
    particlesRef.current.geometry.attributes.position.needsUpdate = true;
  });

  if (viewMode !== 'internal' && viewMode !== 'perfusion') return null;

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions.positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[positions.colors, 3]}
        />
      </bufferGeometry>
      <pointsMaterial size={0.03} vertexColors transparent opacity={0.7} />
    </points>
  );
}

// Great vessels
function GreatVessels() {
  const vessels = useMemo(() => [
    {
      id: 'aorta',
      curve: new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.1, 0.8, 0),
        new THREE.Vector3(-0.1, 1.3, 0),
        new THREE.Vector3(0.3, 1.6, -0.1),
        new THREE.Vector3(0.5, 1.5, -0.3),
        new THREE.Vector3(0.3, 1.2, -0.5),
      ]),
      color: '#dd3333',
      radius: 0.08,
    },
    {
      id: 'pulmonary-trunk',
      curve: new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.2, 0.7, 0.2),
        new THREE.Vector3(0.1, 1.1, 0.3),
        new THREE.Vector3(-0.2, 1.2, 0.2),
      ]),
      color: '#4477bb',
      radius: 0.07,
    },
    {
      id: 'svc',
      curve: new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.4, 0.8, 0.1),
        new THREE.Vector3(0.4, 1.4, 0.1),
      ]),
      color: '#3366aa',
      radius: 0.06,
    },
    {
      id: 'ivc',
      curve: new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.3, -0.6, -0.1),
        new THREE.Vector3(0.3, -1.2, -0.1),
      ]),
      color: '#3366aa',
      radius: 0.06,
    },
  ], []);

  return (
    <group>
      {vessels.map((v) => (
        <mesh key={v.id}>
          <tubeGeometry args={[v.curve, 32, v.radius, 12, false]} />
          <meshPhysicalMaterial color={v.color} roughness={0.3} metalness={0.1} />
        </mesh>
      ))}
    </group>
  );
}

// Animation tick
function AnimationTick() {
  const tick = useTimelineStore((s) => s.tick);
  useFrame((_, delta) => {
    tick(delta * 1000);
  });
  return null;
}

// Camera controller
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

// Main 3D Scene
export default function HeartScene() {
  return (
    <div className="w-full h-full bg-cardiac-dark">
      <Canvas
        camera={{ position: [0, 0, 4], fov: 50 }}
        shadows
        gl={{ antialias: true, alpha: false }}
        style={{ background: '#0F172A' }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} castShadow />
        <directionalLight position={[-3, 3, -3]} intensity={0.3} />
        <pointLight position={[0, 0, 3]} intensity={0.2} color="#ff6666" />

        <AnimationTick />
        <CameraController />

        <group rotation={[0.1, 0, 0]}>
          <HeartMesh />
          <ChamberMeshes />
          <CoronaryOverlay />
          <ConductionOverlay />
          <GreatVessels />
          <BloodFlowParticles />
        </group>

        <ContactShadows position={[0, -2, 0]} opacity={0.4} blur={2} />
        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          minDistance={1.5}
          maxDistance={10}
          dampingFactor={0.1}
          enableDamping
        />
        <Environment preset="studio" />
      </Canvas>
    </div>
  );
}
