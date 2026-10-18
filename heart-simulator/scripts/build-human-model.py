#!/usr/bin/env python3
"""
Build the electrode-lab human model (public/models/human-v1.glb) and its anatomy data
(src/lib/anatomy/humanBody.ts) from the MakeHuman base mesh.

Source: MakeHuman 1.x base mesh "hm08" and its macro targets, released under CC0 1.0 by the
MakeHuman project (see THIRD_PARTY_NOTICES.md). The script downloads them with curl into a cache
directory, morphs the base mesh into an average young adult male, lowers the arms a little from the
modelling A-pose, cuts athletic shorts from the "tights" helper, and finds the ten ECG electrode
sites on the skin from anatomical landmarks (sternal notch, intercostal spaces, clavicle,
axillary lines, costal margin / iliac crest).

Usage (from heart-simulator/):  python3 scripts/build-human-model.py [cache-dir]
Requires numpy. Output units are metres; +x patient's left, +y up, +z anterior.
"""
import json
import os
import struct
import subprocess
import sys
from collections import OrderedDict

import numpy as np

RAW = 'https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data'
FILES = {
    'base.obj': f'{RAW}/3dobjs/base.obj',
    'african-male-young.target': f'{RAW}/targets/macrodetails/african-male-young.target',
    'asian-male-young.target': f'{RAW}/targets/macrodetails/asian-male-young.target',
    'caucasian-male-young.target': f'{RAW}/targets/macrodetails/caucasian-male-young.target',
    'universal-male-young-maxmuscle-averageweight.target':
        f'{RAW}/targets/macrodetails/universal-male-young-maxmuscle-averageweight.target',
}
HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
SCALE = 0.1  # MakeHuman decimetres -> metres
ARM_DROP_DEG = 18.0  # lower the arms from the 49 degree modelling pose


def fetch(cache):
    os.makedirs(cache, exist_ok=True)
    for name, url in FILES.items():
        path = os.path.join(cache, name)
        if not os.path.exists(path):
            subprocess.run(['curl', '-sSf', '--max-time', '120', '-o', path, url], check=True)
    return cache


def load_obj(path):
    verts, groups, cur = [], OrderedDict(), None
    for line in open(path):
        if line.startswith('v '):
            verts.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('g '):
            cur = line.split()[1]
            groups.setdefault(cur, [])
        elif line.startswith('f ') and cur:
            groups[cur].append([int(t.split('/')[0]) - 1 for t in line.split()[1:]])
    return np.array(verts), groups


def load_target(path, n):
    d = np.zeros((n, 3))
    for line in open(path):
        if line.startswith('#') or not line.strip():
            continue
        p = line.split()
        d[int(p[0])] = [float(p[1]), float(p[2]), float(p[3])]
    return d


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def lower_arms(M, joint):
    """Rotate each arm about the shoulder joint in the frontal plane, blending in near the shoulder."""
    out = M.copy()
    for side in (1, -1):
        s = joint('l-shoulder' if side > 0 else 'r-shoulder')
        e = joint('l-elbow' if side > 0 else 'r-elbow')
        u = (e - s) / np.linalg.norm(e - s)
        L = np.linalg.norm(e - s)
        rel = M - s
        t = rel @ u / L
        r = np.linalg.norm(rel - np.outer(rel @ u, u), axis=1)
        # forearm, hand and every finger move as one piece: everything lateral to (and below) the
        # elbow. In the modelling pose that region holds no torso or thigh vertices.
        upper = (t > -0.15) & (t <= 1.05) & (r < 0.62 + 0.1 * np.clip(1 - t, 0, 1))
        lower = (M[:, 0] * side > e[0] * side - 0.35) & (M[:, 1] < e[1] + 0.6)
        w = np.where(upper, smoothstep(0.02, 0.42, t), 0.0)
        w = np.where(lower & ~upper, 1.0, w)
        w = np.where(lower & upper, np.maximum(w, smoothstep(0.02, 0.42, t)), w)
        a = np.radians(ARM_DROP_DEG) * w * side  # left arm (x>0) rotates clockwise seen from the front
        c, sn = np.cos(-a), np.sin(-a)
        x, y = rel[:, 0], rel[:, 1]
        moved = np.stack([s[0] + c * x - sn * y, s[1] + sn * x + c * y, M[:, 2]], axis=1)
        sel = w > 0
        out[sel] = moved[sel]
    return out


def tris_of(faces):
    tris = []
    for f in faces:
        for k in range(1, len(f) - 1):
            tris.append([f[0], f[k], f[k + 1]])
    return np.array(tris, dtype=np.int64)


def ray_hits(origin, direction, P, T):
    """All hit distances of a ray with triangles T (Moller-Trumbore, both sides)."""
    v0, v1, v2 = P[T[:, 0]], P[T[:, 1]], P[T[:, 2]]
    e1, e2 = v1 - v0, v2 - v0
    pv = np.cross(direction, e2)
    det = np.einsum('ij,ij->i', e1, pv)
    ok = np.abs(det) > 1e-12
    inv = np.where(ok, 1.0 / np.where(ok, det, 1), 0)
    tv = origin - v0
    u = np.einsum('ij,ij->i', tv, pv) * inv
    qv = np.cross(tv, e1)
    v = (qv @ direction) * inv
    t = np.einsum('ij,ij->i', e2, qv) * inv
    hit = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 1e-6)
    idx = np.nonzero(hit)[0]
    order = np.argsort(t[idx])
    return t[idx][order], idx[order]


def face_normal(P, tri):
    a, b, c = P[tri[0]], P[tri[1]], P[tri[2]]
    n = np.cross(b - a, c - a)
    return n / np.linalg.norm(n)


def write_glb(path, meshes):
    """meshes: list of (name, positions float32 Nx3, indices uint16/uint32 Mx3)"""
    bin_parts, views, accessors, gl_meshes, nodes = [], [], [], [], []
    offset = 0
    for name, pos, idx in meshes:
        pos = np.ascontiguousarray(pos, dtype=np.float32)
        ind_type = 5123 if pos.shape[0] < 65536 else 5125
        ind = np.ascontiguousarray(idx.reshape(-1), dtype=np.uint16 if ind_type == 5123 else np.uint32)
        for arr, target in ((pos, 34962), (ind, 34963)):
            data = arr.tobytes()
            pad = (-len(data)) % 4
            views.append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(data), 'target': target})
            bin_parts.append(data + b'\0' * pad)
            offset += len(data) + pad
        accessors.append({'bufferView': len(views) - 2, 'componentType': 5126, 'count': int(pos.shape[0]), 'type': 'VEC3',
                          'min': pos.min(0).tolist(), 'max': pos.max(0).tolist()})
        accessors.append({'bufferView': len(views) - 1, 'componentType': ind_type, 'count': int(ind.size), 'type': 'SCALAR'})
        gl_meshes.append({'name': name, 'primitives': [{'attributes': {'POSITION': len(accessors) - 2}, 'indices': len(accessors) - 1, 'mode': 4}]})
        nodes.append({'name': name, 'mesh': len(gl_meshes) - 1})
    binary = b''.join(bin_parts)
    gltf = {
        'asset': {'version': '2.0', 'generator': 'CardioSim build-human-model.py (MakeHuman hm08 base mesh, CC0)'},
        'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}], 'nodes': nodes, 'meshes': gl_meshes,
        'accessors': accessors, 'bufferViews': views, 'buffers': [{'byteLength': len(binary)}],
    }
    js = json.dumps(gltf, separators=(',', ':')).encode()
    js += b' ' * ((-len(js)) % 4)
    with open(path, 'wb') as fh:
        fh.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binary)))
        fh.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
        fh.write(struct.pack('<II', len(binary), 0x004E4942) + binary)


def main():
    cache = fetch(sys.argv[1] if len(sys.argv) > 1 else '/tmp/makehuman-cache')
    V, groups = load_obj(os.path.join(cache, 'base.obj'))
    n = len(V)
    tg = lambda name: load_target(os.path.join(cache, name + '.target'), n)
    # average young adult male: equal ethnic mix, slightly above-average muscle tone
    M = V + sum(tg(f'{e}-male-young') for e in ('african', 'asian', 'caucasian')) / 3
    M = M + 0.3 * tg('universal-male-young-maxmuscle-averageweight')

    def joint_of(P):
        return lambda name: P[sorted({i for f in groups['joint-' + name] for i in f})].mean(0)
    joint = joint_of(M)
    M = lower_arms(M, joint)
    joint = joint_of(M)

    body_faces = groups['body']
    body_ids = np.array(sorted({i for f in body_faces for i in f}))
    T_all = tris_of(body_faces)
    # make sure triangles face outward (front of the chest must point +z)
    chest = np.argmin(np.abs(M[T_all[:, 0], 1] - 4.6) + np.abs(M[T_all[:, 0], 0]) + (M[T_all[:, 0], 2] < 0) * 10)
    if face_normal(M, T_all[chest])[2] < 0:
        T_all = T_all[:, [0, 2, 1]]

    def hit(origin, direction, first=True):
        d = np.asarray(direction, float)
        d /= np.linalg.norm(d)
        ts, idx = ray_hits(np.asarray(origin, float), d, M, T_all)
        if not len(ts):
            raise RuntimeError(f'no hit from {origin} along {direction}')
        k = 0 if first else -1
        p = np.asarray(origin, float) + d * ts[k]
        # triangles face outward (checked above), so this is the outward skin normal
        return p, face_normal(M, T_all[idx[k]])

    def front(x, y):
        return hit([x, y, 10.0], [0, 0, -1])

    def centre_z(y):
        zf = hit([0, y, 10.0], [0, 0, -1])[0][2]
        zb = hit([0, y, -10.0], [0, 0, 1])[0][2]
        return (zf + zb) / 2, zf

    def around(y, deg):
        cz, _ = centre_z(y)
        a = np.radians(deg)  # 0 = straight anterior, 90 = patient's left
        return hit([0, y, cz], [np.sin(a), 0, np.cos(a)])

    clav_l, clav_r = joint('l-clavicle'), joint('r-clavicle')
    sh_l = joint('l-shoulder')
    notch_y = (clav_l[1] + clav_r[1]) / 2
    mcl_x = (clav_l[0] + sh_l[0] * 0.92) / 2  # midpoint of the clavicle
    ics4 = notch_y - 1.15  # 4th intercostal space at the sternal border (~11.5 cm below the notch)
    ics5 = notch_y - 1.55  # 5th intercostal space at the midclavicular line
    sternal = 0.28  # sternal border ~2.8 cm from the midline

    sites = {}
    sites['V1'] = front(-sternal, ics4)
    sites['V2'] = front(sternal, ics4)
    sites['V4'] = front(mcl_x, ics5)
    mid = (sites['V2'][0] + sites['V4'][0]) / 2
    sites['V3'] = front(mid[0], mid[1])
    sites['V5'] = around(ics5, 58)  # anterior axillary line
    sites['V6'] = around(ics5, 90)  # midaxillary line
    # Mason-Likar limb sites: infraclavicular fossae medial to the deltoid; anterior axillary line
    # midway between the costal margin and the iliac crest
    sites['RA'] = front(-0.7 * sh_l[0], notch_y - 0.32)
    sites['LA'] = front(0.7 * sh_l[0], notch_y - 0.32)
    abd_y = joint('pelvis')[1] + 1.55
    half = around(abd_y, 90)[0][0]
    sites['RL'] = front(-0.72 * half, abd_y)
    sites['LL'] = front(0.72 * half, abd_y)

    cz4, zf4 = centre_z(ics4 - 0.3)
    heart = np.array([0.28, ics4 - 0.3, zf4 - 0.62])
    nipple_y = notch_y - 1.05
    nipples = [front(s * mcl_x, nipple_y)[0] for s in (1, -1)]

    # eyes: centre and radius of the helper eye balls
    eyes = []
    for g in ('helper-l-eye', 'helper-r-eye'):
        ids = sorted({i for f in groups[g] for i in f})
        c = M[ids].mean(0)
        eyes.append((c, float(np.linalg.norm(M[ids] - c, axis=1).mean())))

    # shorts: whole quads of the tights helper between mid-thigh and just below the navel, hips and
    # thighs only (the helper is a full body suit; this keeps its sleeves and wrists out)
    top, bottom = joint('pelvis')[1] + 0.75, joint('pelvis')[1] - 2.2
    quads = [f for f in groups['helper-tights']
             if all(bottom < M[i, 1] < top and abs(M[i, 0]) < 2.2 for i in f)]
    shorts = tris_of(quads)

    def compact(T):
        ids, inv = np.unique(T.reshape(-1), return_inverse=True)
        return (M[ids] * SCALE).astype(np.float32), inv.reshape(-1, 3)

    bp, bi = compact(T_all)
    sp, si = compact(shorts)
    # shorts face outward like the body
    write_glb(os.path.join(APP, 'public/models/human-v1.glb'), [('body', bp, bi), ('shorts', sp, si)])

    f = lambda v: [round(float(x) * SCALE, 4) for x in v]
    fn = lambda v: [round(float(x), 4) for x in v]
    order = ['RA', 'LA', 'RL', 'LL', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']
    lines = [
        '/**',
        ' * GENERATED by scripts/build-human-model.py from the MakeHuman base mesh (CC0) -- do not edit.',
        ' * Metres; +x patient\'s left, +y up, +z anterior. Matches public/models/human-v1.glb.',
        ' */',
        "import type { Electrode } from '@/lib/ecg/electrodes';",
        '',
        'export type P3 = [number, number, number];',
        '',
        '/** Electrode sites on the skin with the outward skin normal */',
        'export const HUMAN_ELECTRODE_SITES: Record<Electrode, { pos: P3; normal: P3 }> = {',
    ]
    for k in order:
        p, nrm = sites[k]
        lines.append(f'  {k}: {{ pos: {f(p)}, normal: {fn(nrm)} }},')
    lines += [
        '};',
        '',
        '/** Anatomical landmarks used to place the electrodes */',
        'export const HUMAN_LANDMARKS = {',
        f'  sternalNotchY: {round(notch_y * SCALE, 4)},',
        f'  fourthIntercostalY: {round(ics4 * SCALE, 4)},',
        f'  fifthIntercostalY: {round(ics5 * SCALE, 4)},',
        f'  midclavicularX: {round(mcl_x * SCALE, 4)},',
        f'  chestFrontZ: {round(zf4 * SCALE, 4)},',
        f'  chestCentreZ: {round(cz4 * SCALE, 4)},',
        f'  nipples: [{f(nipples[0])}, {f(nipples[1])}] as [P3, P3],',
        '};',
        '',
        '/** Heart centre inside the chest: behind the lower sternum, a little left of the midline */',
        f'export const HUMAN_HEART_CENTER: P3 = {f(heart)};',
        '/** Scale for the heart model (2 units long) -> about 12 cm */',
        'export const HUMAN_HEART_SCALE = 0.062;',
        '',
        '/** Eyeballs (centre, radius) to fill the eye sockets */',
        f'export const HUMAN_EYES: {{ center: P3; radius: number }}[] = [',
        *[f'  {{ center: {f(c)}, radius: {round(r * SCALE, 4)} }},' for c, r in eyes],
        '];',
        '',
        f'export const HUMAN_HEIGHT = {round(float(M[body_ids][:, 1].max() - M[body_ids][:, 1].min()) * SCALE, 3)};',
        '',
    ]
    with open(os.path.join(APP, 'src/lib/anatomy/humanBody.ts'), 'w') as fh:
        fh.write('\n'.join(lines))
    print('body verts', len(bp), 'tris', len(bi), '| shorts verts', len(sp), 'tris', len(si))
    for k in order:
        print(k, f(sites[k][0]), fn(sites[k][1]))
    print('heart', f(heart), 'notch', round(notch_y * SCALE, 3))


if __name__ == '__main__':
    main()
