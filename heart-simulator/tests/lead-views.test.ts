import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_LEADS } from '@/lib/ecg/vector';
import { ELECTRODES } from '@/lib/ecg/electrodes';
import { LEAD_VIEWS, describePoles, isBipolar, leadForElectrode } from '@/lib/ecg/leadViews';
import { HUMAN_ELECTRODE_SITES, HUMAN_HEART_CENTER, HUMAN_LANDMARKS, type P3 } from '@/lib/anatomy/humanBody';

/** Read the body mesh from the GLB (positions + triangle indices of the first mesh) */
function loadBody(): { pos: Float32Array; idx: Uint16Array | Uint32Array } {
  const buf = readFileSync(join(__dirname, '../public/models/human-v1.glb'));
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;
  const prim = gltf.meshes.find((m: { name: string }) => m.name === 'body').primitives[0];
  const view = (acc: number) => {
    const a = gltf.accessors[acc];
    const v = gltf.bufferViews[a.bufferView];
    const bytes = buf.subarray(binStart + v.byteOffset, binStart + v.byteOffset + v.byteLength);
    const copy = new Uint8Array(bytes).buffer;
    if (a.componentType === 5126) return new Float32Array(copy);
    return a.componentType === 5123 ? new Uint16Array(copy) : new Uint32Array(copy);
  };
  return { pos: view(prim.attributes.POSITION) as Float32Array, idx: view(prim.indices) as Uint16Array | Uint32Array };
}

/** Distance from a point to the nearest mesh vertex (the mesh is dense: ~1-2 cm spacing) */
function nearestVertex(pos: Float32Array, p: P3) {
  let best = Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    const d = Math.hypot(pos[i] - p[0], pos[i + 1] - p[1], pos[i + 2] - p[2]);
    if (d < best) best = d;
  }
  return best;
}

/** Hits of the ray (origin + t·dir) with the mesh, as distances t > 0 */
function rayHits(pos: Float32Array, idx: ArrayLike<number>, o: P3, d: P3) {
  const out: number[] = [];
  for (let k = 0; k < idx.length; k += 3) {
    const a = idx[k] * 3, b = idx[k + 1] * 3, c = idx[k + 2] * 3;
    const e1 = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]];
    const e2 = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
    const pv = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
    const det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
    if (Math.abs(det) < 1e-12) continue;
    const tv = [o[0] - pos[a], o[1] - pos[a + 1], o[2] - pos[a + 2]];
    const u = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) / det;
    if (u < 0 || u > 1) continue;
    const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]];
    const v = (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]) / det;
    if (v < 0 || u + v > 1) continue;
    const t = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) / det;
    if (t > 1e-6) out.push(t);
  }
  return out.sort((x, y) => x - y);
}

describe('lead views', () => {
  it('describes every standard lead', () => {
    for (const l of ALL_LEADS) {
      expect(LEAD_VIEWS[l].wall.length).toBeGreaterThan(3);
      expect(LEAD_VIEWS[l].artery.length).toBeGreaterThan(2);
    }
  });

  it('groups contiguous leads by wall', () => {
    for (const l of ['II', 'III', 'aVF'] as const) expect(LEAD_VIEWS[l].wall).toMatch(/Inferior/);
    for (const l of ['I', 'aVL'] as const) expect(LEAD_VIEWS[l].wall).toMatch(/High lateral/);
    for (const l of ['V5', 'V6'] as const) expect(LEAD_VIEWS[l].wall).toMatch(/Low lateral/);
    for (const l of ['V1', 'V2'] as const) expect(LEAD_VIEWS[l].wall).toMatch(/Septum/);
    for (const l of ['V3', 'V4'] as const) expect(LEAD_VIEWS[l].wall).toMatch(/Anterior/);
  });

  it('uses the Einthoven poles for the bipolar limb leads', () => {
    expect([LEAD_VIEWS.I.positive, LEAD_VIEWS.I.negative]).toEqual(['LA', 'RA']);
    expect([LEAD_VIEWS.II.positive, LEAD_VIEWS.II.negative]).toEqual(['LL', 'RA']);
    expect([LEAD_VIEWS.III.positive, LEAD_VIEWS.III.negative]).toEqual(['LL', 'LA']);
    expect(ALL_LEADS.filter(isBipolar)).toEqual(['I', 'II', 'III']);
    expect(describePoles('I')).toBe('LA (+) against RA (−)');
    expect(describePoles('V1')).toMatch(/Wilson central terminal/);
  });

  it('maps a tapped electrode to the lead it explores; the right leg is ground', () => {
    expect(leadForElectrode('RA')).toBe('aVR');
    expect(leadForElectrode('LA')).toBe('aVL');
    expect(leadForElectrode('LL')).toBe('aVF');
    expect(leadForElectrode('RL')).toBeNull();
    expect(leadForElectrode('V4')).toBe('V4');
  });
});

describe('3D patient electrode placement (MakeHuman body)', () => {
  const S = HUMAN_ELECTRODE_SITES;
  const body = loadBody();
  const cm = 0.01;

  it('puts every electrode on the skin, facing outward', () => {
    for (const e of ELECTRODES) {
      const { pos, normal } = S[e];
      // a ray from just outside the site back along the normal meets the skin within 2 mm
      const o: P3 = [pos[0] + normal[0] * 0.05, pos[1] + normal[1] * 0.05, pos[2] + normal[2] * 0.05];
      const hits = rayHits(body.pos, body.idx, o, [-normal[0], -normal[1], -normal[2]]);
      expect(hits.length).toBeGreaterThan(0);
      expect(Math.abs(hits[0] - 0.05)).toBeLessThan(0.2 * cm);
      expect(nearestVertex(body.pos, pos)).toBeLessThan(3 * cm);
      // outward: away from the body's long axis
      expect(normal[0] * pos[0] + normal[2] * (pos[2] - HUMAN_LANDMARKS.chestCentreZ)).toBeGreaterThan(0);
      expect(Math.hypot(...normal)).toBeCloseTo(1, 3);
    }
  });

  it('uses torso (Mason–Likar) sites: arms just below the clavicles, legs on the lower abdomen', () => {
    for (const e of ['RA', 'LA'] as const) {
      const below = HUMAN_LANDMARKS.sternalNotchY - S[e].pos[1];
      expect(below).toBeGreaterThan(1 * cm); // under the clavicle...
      expect(below).toBeLessThan(6 * cm); // ...in the infraclavicular fossa
      expect(Math.abs(S[e].pos[0])).toBeGreaterThan(9 * cm); // out toward the shoulder
      expect(S[e].pos[2]).toBeGreaterThan(HUMAN_LANDMARKS.chestCentreZ); // front of the body
    }
    for (const e of ['RL', 'LL'] as const) {
      expect(HUMAN_LANDMARKS.fifthIntercostalY - S[e].pos[1]).toBeGreaterThan(12 * cm);
      expect(S[e].pos[2]).toBeGreaterThan(HUMAN_LANDMARKS.chestCentreZ);
    }
    // patient's right is −x
    expect(S.RA.pos[0]).toBeLessThan(0);
    expect(S.LA.pos[0]).toBeGreaterThan(0);
    expect(S.RL.pos[0]).toBeLessThan(0);
    expect(S.LL.pos[0]).toBeGreaterThan(0);
  });

  it('places the precordial electrodes at their landmarks', () => {
    // V1/V2: 4th intercostal space either side of the sternum
    expect(S.V1.pos[0]).toBeLessThan(0);
    expect(S.V2.pos[0]).toBeGreaterThan(0);
    expect(Math.abs(S.V1.pos[0])).toBeLessThan(4 * cm);
    expect(S.V1.pos[1]).toBeCloseTo(S.V2.pos[1], 4);
    // V4–V6 level with each other, one space lower; V4 on the midclavicular line
    expect(S.V5.pos[1]).toBeCloseTo(S.V4.pos[1], 4);
    expect(S.V6.pos[1]).toBeCloseTo(S.V4.pos[1], 4);
    expect(S.V4.pos[1]).toBeLessThan(S.V2.pos[1]);
    expect(S.V4.pos[0]).toBeCloseTo(HUMAN_LANDMARKS.midclavicularX, 3);
    // V3 between V2 and V4
    expect(S.V3.pos[0]).toBeGreaterThan(S.V2.pos[0]);
    expect(S.V3.pos[0]).toBeLessThan(S.V4.pos[0]);
    // going round the left side: V6 is the most lateral and on the midaxillary line
    const order = ['V2', 'V3', 'V4', 'V5', 'V6'] as const;
    for (let i = 1; i < order.length; i++) expect(S[order[i]].pos[0]).toBeGreaterThan(S[order[i - 1]].pos[0]);
    expect(Math.abs(S.V6.pos[2] - HUMAN_LANDMARKS.chestCentreZ)).toBeLessThan(2 * cm);
    expect(S.V6.normal[0]).toBeGreaterThan(0.8);
  });

  it('keeps the heart inside the chest, behind the sternum and left of the midline', () => {
    const [x, y, z] = HUMAN_HEART_CENTER;
    expect(x).toBeGreaterThan(0);
    expect(y).toBeGreaterThan(S.V4.pos[1] - 2 * cm);
    expect(y).toBeLessThan(HUMAN_LANDMARKS.sternalNotchY);
    expect(z).toBeLessThan(HUMAN_LANDMARKS.chestFrontZ - 4 * cm);
    // a ray from the heart centre forward crosses the skin once: it is inside the body
    expect(rayHits(body.pos, body.idx, HUMAN_HEART_CENTER, [0, 0, 1]).length % 2).toBe(1);
  });
});
