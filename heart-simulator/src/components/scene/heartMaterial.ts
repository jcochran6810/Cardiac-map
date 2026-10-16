/**
 * Physically-based heart material with shader injections for:
 *  - beat-synchronised contraction (atria and ventricles separately, with longitudinal
 *    shortening, radial thickening and a little LV twist)
 *  - fibrillatory quiver (AF: atria; VF: ventricles)
 *  - depolarisation wavefront glow (P wave from the SA node, QRS from the activation origin)
 *    and a faint repolarisation glow (T wave)
 *  - coronary territory painting and pulsing ischaemic territory
 *  - X-ray (fresnel) transparency
 * All positions are in the heart MODEL frame (+x left, +y posterior, +z superior).
 */
import * as THREE from 'three';

export const heartUniforms = {
  uVent: { value: 0 },
  uAtria: { value: 0 },
  uVentFib: { value: 0 },
  uAtriaFib: { value: 0 },
  uTime: { value: 0 },
  uActA: { value: -1 },
  uActV: { value: -1 },
  uRepol: { value: 0 },
  uGlow: { value: 0.7 },
  uTerritory: { value: 0 },
  uCulprit: { value: new THREE.Vector3(0, 0, 0) },
  uAOrigin: { value: new THREE.Vector3(-0.37, -0.08, 0.38) },
  uVOrigin: { value: new THREE.Vector3(0.05, -0.02, -0.35) },
  uXray: { value: 0 },
  uSelect: { value: new THREE.Vector3(0, 0, 0) },
  uSelectOn: { value: 0 },
};

const VERT_HEAD = /* glsl */ `
uniform float uVent;
uniform float uAtria;
uniform float uVentFib;
uniform float uAtriaFib;
uniform float uTime;
varying vec3 vModelPos;
`;

const VERT_BODY = /* glsl */ `
vModelPos = position;
float zav = -0.1 - 0.095 * position.y;
float atrM = smoothstep(zav - 0.04, zav + 0.12, position.z) * (1.0 - smoothstep(0.32, 0.5, position.z));
float venM = 1.0 - smoothstep(zav - 0.12, zav + 0.04, position.z);
// Ventricles: radial thickening toward the long axis, longitudinal shortening toward a fixed apex, slight twist
vec2 axisC = vec2(0.06, -0.02);
float apexZ = -0.98;
float h = clamp((position.z - apexZ) / max(0.2, zav - apexZ), 0.0, 1.25);
float vs = uVent * venM;
float radial = 1.0 - 0.07 * vs * (0.55 + 0.45 * h);
float tw = 0.07 * vs * h;
float cs = cos(tw);
float sn = sin(tw);
vec2 rxy = transformed.xy - axisC;
transformed.xy = axisC + vec2(rxy.x * cs - rxy.y * sn, rxy.x * sn + rxy.y * cs) * radial;
transformed.z = apexZ + (transformed.z - apexZ) * (1.0 - 0.075 * vs);
// The AV plane descends during ventricular systole, stretching the filling atria
transformed.z -= 0.04 * uVent * atrM;
// Atrial contraction toward each atrium's centre
vec3 raC = vec3(-0.36, 0.08, 0.12);
vec3 laC = vec3(0.12, 0.36, 0.12);
vec3 aC = mix(raC, laC, smoothstep(-0.2, 0.15, position.x));
transformed = mix(transformed, aC + (transformed - aC) * (1.0 - 0.07 * uAtria), atrM);
// Fibrillatory quiver
float q = sin(position.x * 37.0 + uTime * 43.0) * sin(position.y * 29.0 - uTime * 37.0) * sin(position.z * 31.0 + uTime * 31.0);
transformed += normal * q * (0.007 * uVentFib * venM + 0.005 * uAtriaFib * atrM);
`;

const FRAG_HEAD = /* glsl */ `
uniform float uActA;
uniform float uActV;
uniform float uRepol;
uniform float uGlow;
uniform float uTerritory;
uniform vec3 uCulprit;
uniform vec3 uAOrigin;
uniform vec3 uVOrigin;
uniform float uXray;
uniform float uTime;
uniform vec3 uSelect;
uniform float uSelectOn;
varying vec3 vModelPos;
float arcW(float th, float a, float b) {
  return smoothstep(a - 9.0, a + 9.0, th) * (1.0 - smoothstep(b - 9.0, b + 9.0, th));
}
`;

const FRAG_BODY = /* glsl */ `
{
  float zav = -0.1 - 0.095 * vModelPos.y;
  float atrM = smoothstep(zav - 0.04, zav + 0.12, vModelPos.z) * (1.0 - smoothstep(0.32, 0.55, vModelPos.z));
  float venM = 1.0 - smoothstep(zav - 0.12, zav + 0.04, vModelPos.z);
  // Depolarisation wavefronts
  if (uActA >= 0.0) {
    float d = distance(vModelPos, uAOrigin);
    float front = uActA * 1.05;
    float edge = smoothstep(front - 0.28, front, d) * (1.0 - smoothstep(front, front + 0.05, d));
    float done = 1.0 - smoothstep(front - 0.02, front + 0.03, d);
    totalEmissiveRadiance += vec3(1.0, 0.72, 0.18) * atrM * uGlow * (0.75 * edge + 0.12 * done);
  }
  if (uActV >= 0.0) {
    float d = distance(vModelPos, uVOrigin);
    float front = uActV * 1.25;
    float edge = smoothstep(front - 0.3, front, d) * (1.0 - smoothstep(front, front + 0.06, d));
    float done = 1.0 - smoothstep(front - 0.02, front + 0.04, d);
    totalEmissiveRadiance += vec3(1.0, 0.42, 0.12) * venM * uGlow * (0.8 * edge + 0.14 * done);
  }
  if (uRepol > 0.0) {
    totalEmissiveRadiance += vec3(0.25, 0.35, 1.0) * venM * uGlow * 0.22 * sin(3.14159 * clamp(uRepol, 0.0, 1.0));
  }
  // Coronary territories (right-dominant): angle around the LV long axis, -90 deg = anterior
  if (uTerritory > 0.0 || dot(uCulprit, vec3(1.0)) > 0.0) {
    vec2 rxy = vModelPos.xy - vec2(0.08, 0.0);
    float th = degrees(atan(rxy.y, rxy.x));
    float apex = 1.0 - smoothstep(-0.86, -0.7, vModelPos.z);
    float lad = max(arcW(th, -105.0, -20.0), apex);
    float lcx = arcW(th, -20.0, 62.0) * (1.0 - apex);
    float rca = max(arcW(th, 62.0, 190.0), arcW(th, -190.0, -105.0)) * (1.0 - apex);
    float sum = max(0.001, lad + lcx + rca);
    lad /= sum; lcx /= sum; rca /= sum;
    vec3 tcol = lad * vec3(0.15, 0.85, 0.45) + lcx * vec3(0.3, 0.55, 1.0) + rca * vec3(1.0, 0.55, 0.12);
    float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    diffuseColor.rgb = mix(diffuseColor.rgb, tcol * (0.55 + 0.9 * lum), 0.78 * uTerritory * venM);
    totalEmissiveRadiance += tcol * 0.12 * uTerritory * venM;
    // territory borders
    float edge = 1.0 - smoothstep(0.0, 0.22, min(abs(lad - lcx) + rca, min(abs(lcx - rca) + lad, abs(rca - lad) + lcx)));
    diffuseColor.rgb *= 1.0 - 0.45 * edge * uTerritory * venM;
    float isch = dot(vec3(lad, lcx, rca), uCulprit) * venM;
    float pulse = 0.55 + 0.45 * sin(uTime * 3.5);
    // ischaemic zone: dusky, cyanotic purple that pulses — distinct from the red tissue
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.34, 0.12, 0.42), 0.6 * isch);
    totalEmissiveRadiance += vec3(0.75, 0.12, 0.85) * isch * pulse * 0.32;
  }
  // Selection halo
  if (uSelectOn > 0.0) {
    float d = distance(vModelPos, uSelect);
    float ring = smoothstep(0.2, 0.12, d) * (0.6 + 0.4 * sin(uTime * 5.0));
    totalEmissiveRadiance += vec3(0.1, 0.55, 0.9) * ring * uSelectOn * 0.6;
  }
  // X-ray: fresnel transparency
  if (uXray > 0.0) {
    vec3 vd = normalize(vViewPosition);
    float rim = pow(1.0 - abs(dot(vd, normal)), 2.2);
    diffuseColor.a *= mix(1.0, 0.07 + 0.6 * rim, uXray);
    totalEmissiveRadiance += vec3(0.35, 0.12, 0.1) * rim * uXray * 0.35;
  }
}
`;

export function createHeartMaterial(map: THREE.Texture | null, opts: { interior?: boolean } = {}): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    map: map ?? undefined,
    color: new THREE.Color(1.12, 1.06, 1.04),
    roughness: 0.5,
    metalness: 0,
    clearcoat: 0.42,
    clearcoatRoughness: 0.3,
    sheen: 0.35,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color('#ff8a7a'),
    emissive: new THREE.Color(1, 1, 1),
    emissiveMap: map ?? undefined,
    emissiveIntensity: opts.interior ? 0.42 : 0.14,
    side: opts.interior ? THREE.DoubleSide : THREE.FrontSide,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, heartUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FRAG_BODY}`);
  };
  // distinct program cache keys for the two variants
  mat.customProgramCacheKey = () => (opts.interior ? 'heart-interior' : 'heart-exterior');
  return mat;
}
