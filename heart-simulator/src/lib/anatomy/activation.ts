/**
 * Epicardial activation-time (isochronal / "LAT") maps on the 3D heart surface.
 *
 * Local activation time at each surface vertex is the earliest arrival of any
 * activation source, propagating over the surface mesh (Dijkstra on the mesh graph)
 * with region-specific apparent conduction velocities:
 *   LAT(v) = min over sources s of [ t_s + pathLength(s → v) / CV(region) ]
 *
 * Breakthrough sites and timing follow the classic description of the normal human
 * heart by Durrer et al. (Circulation 1970;41:899–912): the first epicardial
 * breakthrough is in the anterior right-ventricular wall at ≈20 ms, the LV epicardium
 * is activated from apex toward base, and the last regions are the posterobasal LV and
 * the pulmonary conus/RV outflow (~60–80 ms). Bundle-branch block, pre-excitation,
 * ectopic and paced patterns use the textbook sequences (late lateral/posterolateral LV
 * in LBBB and RV pacing, late RV free wall in RBBB, earliest at the accessory-pathway
 * insertion in WPW, single focus for ectopy). Times are rescaled to each beat's QRS
 * duration so the 3D wavefront stays in step with the ECG.
 *
 * Concept inspired by the activation-map reconstruction tasks of LLNL's
 * cardiac_challenge (MIT); this is an independent, rule-based implementation and uses
 * none of that project's data.
 */
export type Region = 0 | 1 | 2 | 3 | 4; // 0 none, 1 RV, 2 LV, 3 RA, 4 LA
export const REGION_NAMES = ['non-myocardial', 'RV', 'LV', 'RA', 'LA'] as const;
type P3 = [number, number, number];

export interface SourceGroup {
  sources: { p: P3; t: number }[];
  /** apparent conduction velocity (model units per ms; 1 unit ≈ 10 cm) by region RV, LV, RA, LA */
  cv: Partial<Record<'RV' | 'LV' | 'RA' | 'LA', number>>;
}

export interface ActivationPattern {
  id: string;
  label: string;
  chamber: 'ventricles' | 'atria';
  groups: SourceGroup[];
  earliest: string;
  latest: string;
  note: string;
}

// ─── Reference sites (model frame: +x left, +y posterior, +z superior) ─────────
const RV_ANT: P3 = [-0.05, -0.57, -0.45]; // RV anterior "pretrabecular" breakthrough
const RV_APICAL: P3 = [-0.2, -0.48, -0.62];
const LV_APEX_ANT: P3 = [0.22, -0.45, -0.72];
const LV_INF_PARASEPTAL: P3 = [0.15, 0.32, -0.62];
const LV_LAT_MID: P3 = [0.6, -0.05, -0.5];

const FAST = 0.012; // Purkinje-driven apparent epicardial spread (~1.2 m/s)
const SLOW = 0.0055; // cell-to-cell myocardial conduction (~0.5 m/s)

const LV_APEX: P3 = [0.15, -0.25, -0.92];
const RV_INFERIOR: P3 = [-0.3, 0.15, -0.5];

const NORMAL_SOURCES = [
  { p: RV_ANT, t: 20 },
  { p: RV_APICAL, t: 24 },
  { p: LV_APEX_ANT, t: 26 },
  { p: LV_APEX, t: 28 },
  { p: LV_INF_PARASEPTAL, t: 30 },
  { p: RV_INFERIOR, t: 32 },
  { p: LV_LAT_MID, t: 40 },
];

export const VENT_PATTERNS: Record<string, ActivationPattern> = {
  normal: {
    id: 'normal', label: 'Normal conduction', chamber: 'ventricles',
    groups: [{ sources: NORMAL_SOURCES, cv: { RV: FAST, LV: FAST } }],
    earliest: 'Anterior RV wall (~20 ms) and LV apex',
    latest: 'Posterobasal LV and RV outflow tract (~60–80 ms)',
    note: 'Septum activates left → right first (not visible on the epicardium); LV spreads apex → base.',
  },
  lbbb: {
    id: 'lbbb', label: 'Left bundle branch block', chamber: 'ventricles',
    groups: [{
      sources: [{ p: RV_ANT, t: 20 }, { p: RV_APICAL, t: 24 }, { p: RV_INFERIOR, t: 32 }, { p: [0.2, -0.48, -0.5], t: 60 }, { p: [0.12, 0.3, -0.55], t: 70 }],
      cv: { RV: FAST, LV: SLOW },
    }],
    earliest: 'RV (normal right bundle)',
    latest: 'Lateral / posterolateral LV base — the target for a CRT LV lead',
    note: 'The LV is activated slowly through the septum and working myocardium, so the QRS widens.',
  },
  rbbb: {
    id: 'rbbb', label: 'Right bundle branch block', chamber: 'ventricles',
    groups: [{
      sources: [{ p: LV_APEX_ANT, t: 26 }, { p: LV_APEX, t: 28 }, { p: LV_INF_PARASEPTAL, t: 30 }, { p: LV_LAT_MID, t: 40 }, { p: [0.0, -0.57, -0.45], t: 55 }, { p: [-0.05, 0.3, -0.55], t: 65 }],
      cv: { RV: SLOW, LV: FAST },
    }],
    earliest: 'LV (normal left bundle)',
    latest: 'RV free wall and outflow tract — the terminal R′ in V1',
    note: 'The RV is reached late, across the septum from the LV.',
  },
  'rbbb-lafb': {
    id: 'rbbb-lafb', label: 'RBBB + left anterior fascicular block', chamber: 'ventricles',
    groups: [{
      sources: [{ p: LV_INF_PARASEPTAL, t: 26 }, { p: [0.45, 0.3, -0.45], t: 34 }, { p: [0.0, -0.57, -0.45], t: 60 }, { p: [-0.05, 0.3, -0.55], t: 55 }],
      cv: { RV: SLOW, LV: FAST },
    }],
    earliest: 'Inferior LV (left posterior fascicle)',
    latest: 'Anterosuperior LV base and RV outflow',
    note: 'Inferior-to-superior LV spread gives left axis deviation; the RV is late as in RBBB.',
  },
  preexcited: {
    id: 'preexcited', label: 'Pre-excitation (left lateral pathway)', chamber: 'ventricles',
    groups: [
      { sources: [{ p: [0.58, -0.02, -0.18], t: 0 }], cv: { RV: SLOW, LV: SLOW } },
      { sources: NORMAL_SOURCES.map((s) => ({ p: s.p, t: s.t + 40 })), cv: { RV: FAST, LV: FAST } },
    ],
    earliest: 'Lateral LV just below the mitral annulus — the accessory-pathway insertion (delta wave)',
    latest: 'RV and septal regions, reached by the normal conduction system (fusion)',
    note: 'Ablation targets the earliest site on the annulus.',
  },
  paced: {
    id: 'paced', label: 'RV apical pacing', chamber: 'ventricles',
    groups: [{ sources: [{ p: [-0.08, -0.35, -0.82], t: 0 }], cv: { RV: SLOW, LV: SLOW } }],
    earliest: 'RV apex (the pacing lead)',
    latest: 'Lateral / posterolateral LV base — an LBBB-like, dyssynchronous sequence',
    note: 'This is why chronic RV pacing can depress LV function; conduction-system pacing avoids it.',
  },
  pvc: {
    id: 'pvc', label: 'PVC from the RV outflow tract', chamber: 'ventricles',
    groups: [{ sources: [{ p: [0.0, -0.5, 0.0], t: 0 }], cv: { RV: SLOW, LV: SLOW } }],
    earliest: 'RV outflow tract (the ectopic focus)',
    latest: 'Inferior and posterolateral LV apex/base',
    note: 'Focus-to-myocardium spread without the conduction system gives a wide QRS; RVOT ectopy has an inferior axis.',
  },
  vt: {
    id: 'vt', label: 'VT exit from an inferolateral LV scar', chamber: 'ventricles',
    groups: [{ sources: [{ p: [0.45, 0.28, -0.55], t: 0 }], cv: { RV: SLOW, LV: SLOW } }],
    earliest: 'Inferolateral LV (scar exit site)',
    latest: 'RV free wall and outflow tract',
    note: 'Mapping the earliest site guides VT ablation.',
  },
  escape: {
    id: 'escape', label: 'Ventricular escape rhythm', chamber: 'ventricles',
    groups: [{ sources: [{ p: [0.1, -0.55, -0.5], t: 0 }, { p: [0.05, 0.3, -0.55], t: 12 }], cv: { RV: SLOW, LV: SLOW } }],
    earliest: 'Septal region near the escape focus',
    latest: 'Lateral LV and RV bases',
    note: 'A slow, wide escape from below the block.',
  },
};

export const ATRIAL_PATTERNS: Record<string, ActivationPattern> = {
  sinus: {
    id: 'sinus', label: 'Sinus rhythm', chamber: 'atria',
    groups: [{
      sources: [{ p: [-0.4, -0.06, 0.36], t: 0 }, { p: [0.22, -0.28, 0.24], t: 30 }, { p: [0.05, 0.5, -0.05], t: 55 }],
      cv: { RA: 0.01, LA: 0.009 },
    }],
    earliest: 'SA node at the SVC–RA junction',
    latest: 'Left atrial appendage and inferolateral LA',
    note: "The LA is entered mainly through Bachmann's bundle — the second half of the P wave.",
  },
  retrograde: {
    id: 'retrograde', label: 'Retrograde (junctional / AVNRT)', chamber: 'atria',
    groups: [{ sources: [{ p: [-0.2, 0.42, -0.08], t: 0 }, { p: [0.02, 0.5, -0.06], t: 8 }], cv: { RA: 0.01, LA: 0.009 } }],
    earliest: 'Low septum near the coronary sinus ostium',
    latest: 'High RA and both appendages — inverted P waves in II, III, aVF',
    note: 'Activation runs bottom-to-top, the reverse of sinus rhythm.',
  },
};

// ─── Mesh graph ─────────────────────────────────────────────────────────────

export interface MeshGraph {
  /** welded node positions */
  pos: Float32Array;
  region: Uint8Array;
  /** CSR adjacency */
  offs: Uint32Array;
  nbr: Uint32Array;
  len: Float32Array;
  /** mesh vertex → welded node */
  vertNode: Uint32Array;
}

function septalX(y: number, z: number): number {
  // Interventricular grooves: LAD anteriorly (x≈0.08–0.13), PDA posteriorly (x≈0.02)
  const xa = 0.105 + (z + 0.38) * 0.06;
  const t = Math.min(1, Math.max(0, (y + 0.53) / 0.86));
  return xa + (0.02 - xa) * t;
}

/** Classify a surface point. Atrial vs great-vessel separation uses the nearest chamber/vessel reference point. */
export function classify(p: P3, atrialRefs: { p: P3; r: Region }[]): Region {
  const [x, y, z] = p;
  const zav = -0.1 - 0.095 * y;
  const rvot = y < -0.28 && x > -0.22 && x < 0.13 && z < 0.06;
  if (z < zav - 0.01 || rvot) return x > septalX(y, z) && !rvot ? 2 : 1;
  if (z > 0.5) return 0;
  let best: Region = 0;
  let bd = Infinity;
  for (const a of atrialRefs) {
    const d = (x - a.p[0]) ** 2 + (y - a.p[1]) ** 2 + (z - a.p[2]) ** 2;
    if (d < bd) { bd = d; best = a.r; }
  }
  return best;
}

export function buildGraph(position: ArrayLike<number>, index: ArrayLike<number>, atrialRefs: { p: P3; r: Region }[]): MeshGraph {
  const nv = position.length / 3;
  const key = new Map<string, number>();
  const vertNode = new Uint32Array(nv);
  const pos: number[] = [];
  for (let i = 0; i < nv; i++) {
    const k = `${Math.round(position[3 * i] * 1e4)},${Math.round(position[3 * i + 1] * 1e4)},${Math.round(position[3 * i + 2] * 1e4)}`;
    let n = key.get(k);
    if (n === undefined) {
      n = pos.length / 3;
      key.set(k, n);
      pos.push(position[3 * i], position[3 * i + 1], position[3 * i + 2]);
    }
    vertNode[i] = n;
  }
  const nn = pos.length / 3;
  const sets: Set<number>[] = Array.from({ length: nn }, () => new Set<number>());
  for (let f = 0; f < index.length; f += 3) {
    const a = vertNode[index[f]], b = vertNode[index[f + 1]], c = vertNode[index[f + 2]];
    if (a !== b) { sets[a].add(b); sets[b].add(a); }
    if (b !== c) { sets[b].add(c); sets[c].add(b); }
    if (a !== c) { sets[a].add(c); sets[c].add(a); }
  }
  const offs = new Uint32Array(nn + 1);
  for (let i = 0; i < nn; i++) offs[i + 1] = offs[i] + sets[i].size;
  const nbr = new Uint32Array(offs[nn]);
  const len = new Float32Array(offs[nn]);
  for (let i = 0; i < nn; i++) {
    let k = offs[i];
    for (const j of Array.from(sets[i])) {
      nbr[k] = j;
      len[k] = Math.hypot(pos[3 * i] - pos[3 * j], pos[3 * i + 1] - pos[3 * j + 1], pos[3 * i + 2] - pos[3 * j + 2]);
      k++;
    }
  }
  const P = new Float32Array(pos);
  const region = new Uint8Array(nn);
  for (let i = 0; i < nn; i++) region[i] = classify([P[3 * i], P[3 * i + 1], P[3 * i + 2]], atrialRefs);
  return { pos: P, region, offs, nbr, len, vertNode };
}

const REGION_KEY: Record<number, 'RV' | 'LV' | 'RA' | 'LA' | null> = { 0: null, 1: 'RV', 2: 'LV', 3: 'RA', 4: 'LA' };

function nearestNode(g: MeshGraph, p: P3, allowed: (r: number) => boolean): number {
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < g.region.length; i++) {
    if (!allowed(g.region[i])) continue;
    const d = (g.pos[3 * i] - p[0]) ** 2 + (g.pos[3 * i + 1] - p[1]) ** 2 + (g.pos[3 * i + 2] - p[2]) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/** Binary-heap Dijkstra with per-region speed; returns arrival time (ms) per node */
function propagate(g: MeshGraph, group: SourceGroup, allowed: (r: number) => boolean): Float64Array {
  const n = g.region.length;
  const T = new Float64Array(n).fill(Infinity);
  const heapN: number[] = [];
  const heapT: number[] = [];
  const push = (node: number, t: number) => {
    heapN.push(node); heapT.push(t);
    let i = heapN.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapT[p] <= heapT[i]) break;
      [heapN[p], heapN[i]] = [heapN[i], heapN[p]];
      [heapT[p], heapT[i]] = [heapT[i], heapT[p]];
      i = p;
    }
  };
  const pop = (): [number, number] => {
    const rn = heapN[0], rt = heapT[0];
    const ln = heapN.pop()!, lt = heapT.pop()!;
    if (heapN.length) {
      heapN[0] = ln; heapT[0] = lt;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heapN.length && heapT[l] < heapT[m]) m = l;
        if (r < heapN.length && heapT[r] < heapT[m]) m = r;
        if (m === i) break;
        [heapN[m], heapN[i]] = [heapN[i], heapN[m]];
        [heapT[m], heapT[i]] = [heapT[i], heapT[m]];
        i = m;
      }
    }
    return [rn, rt];
  };
  for (const s of group.sources) {
    const node = nearestNode(g, s.p, allowed);
    if (node >= 0 && s.t < T[node]) { T[node] = s.t; push(node, s.t); }
  }
  while (heapN.length) {
    const [u, tu] = pop();
    if (tu > T[u]) continue;
    for (let k = g.offs[u]; k < g.offs[u + 1]; k++) {
      const v = g.nbr[k];
      const rk = REGION_KEY[g.region[v]];
      if (!rk || !allowed(g.region[v])) continue;
      const cv = group.cv[rk];
      if (!cv) continue;
      const tv = tu + g.len[k] / cv;
      if (tv < T[v]) { T[v] = tv; push(v, tv); }
    }
  }
  return T;
}

export interface ActivationMap {
  /** per welded node: activation time (ms, before rescaling), Infinity where not activated */
  t: Float32Array;
  maxT: number;
}

export function computeActivation(g: MeshGraph, pattern: ActivationPattern): ActivationMap {
  const allowed = pattern.chamber === 'ventricles' ? (r: number) => r === 1 || r === 2 : (r: number) => r === 3 || r === 4;
  const n = g.region.length;
  const t = new Float32Array(n).fill(Infinity);
  for (const grp of pattern.groups) {
    const T = propagate(g, grp, allowed);
    for (let i = 0; i < n; i++) if (T[i] < t[i]) t[i] = T[i];
  }
  let maxT = 0;
  for (let i = 0; i < n; i++) if (Number.isFinite(t[i]) && t[i] > maxT) maxT = t[i];
  return { t, maxT };
}

/** Pattern key for a ventricular beat (conduction type, or the ectopic beat kind) */
export function ventPatternKey(conduction: string, kind: string): string | null {
  if (kind === 'torsades') return null;
  if (conduction === 'ectopic') return VENT_PATTERNS[kind] ? kind : 'pvc';
  return VENT_PATTERNS[conduction] ? conduction : 'normal';
}
