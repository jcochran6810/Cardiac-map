'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { LANDMARK_BY_ID, HEART_CENTER, type Landmark } from '@/lib/anatomy/landmarks';
import { CONDUCTION_IDS } from '@/lib/anatomy/categories';
import type { ViewMode } from '@/store/useAppStore';
import { useSceneStore } from '@/store/useSceneStore';
import { LABEL_SETS } from '@/lib/anatomy/labelSets';
import { useIsTouch } from '@/lib/device';
import {
  DOT, TAG_GAP, TOUCH_MARGIN, findSlot, leaderLine, leastCrowdedSlot, nearestFreeSlot, touchMargins, type Box, type PlaceOptions, type Slot,
} from './labelPlacement';
import { useOverlayCover } from './overlayCover';

export { LABEL_SETS };

export function anchorFor(l: Landmark, mode: ViewMode): [number, number, number] {
  if (mode === 'sectioned' && l.section) return l.section;
  return l.pos;
}

/** Is this landmark meaningfully visible in the given view? */
function relevant(l: Landmark, mode: ViewMode): boolean {
  switch (mode) {
    case 'external':
    case 'territories':
    case 'activation':
      return l.surface;
    case 'sectioned':
      return !!l.section;
    case 'conduction':
      return CONDUCTION_IDS.includes(l.id) || !l.surface;
    case 'xray':
      return true;
  }
}

interface Props {
  mode: ViewMode;
  labelsVisible: boolean;
  selectedId: string | null;
  highlightIds: string[];
  /** `keyboard`: the label was activated from the keyboard rather than by a press that might have been a drag */
  onSelect: (id: string, keyboard: boolean) => void;
}

type Kind = 'selected' | 'highlight' | 'normal';

/** Where a tag sits beside its dot when it has room: its left edge `x` px right of the dot, its bottom edge `y` px below it */
const NATURAL: Record<Kind, { x: number; y: number }> = { selected: { x: 8, y: -6 }, highlight: { x: 6, y: 1 }, normal: { x: 4, y: 3 } };
/** How many rows up or down a tag may move to find room: one for most tags (they are left out when there is none) … */
const ROWS = 1;
/** … and more for a tag that must show — one a lesson points at, or any tag while a check asks for one by its tag */
const MUST_ROWS = 3;
/** When even those are taken, a tag that must show goes to the nearest free place this far (px) from its dot */
const REACH = 120;
/** the invisible margin of a tag on a touch screen, side by side (drawn by the button's `touch:before:` classes) */
const HIT = { top: '--hit-t', right: '--hit-r', bottom: '--hit-b', left: '--hit-l' } as const;
const HIT_AREA = {
  [HIT.top]: `${TOUCH_MARGIN.y}px`, [HIT.right]: `${TOUCH_MARGIN.x}px`, [HIT.bottom]: `${TOUCH_MARGIN.y}px`, [HIT.left]: `${TOUCH_MARGIN.x}px`,
} as React.CSSProperties;

interface Size { w: number; h: number }
interface Sizes { full: Size; short?: Size }

/** A tag's size on screen, measured once (and again after the fonts arrive); `short` for a tag that also has a short name */
function measure(pill: HTMLButtonElement): Sizes | null {
  if (!pill.offsetWidth) return null; // not laid out yet (or behind the camera)
  const [full, short] = Array.from(pill.children) as HTMLElement[];
  if (!short) return { full: { w: pill.offsetWidth, h: pill.offsetHeight } };
  const showing = short.style.display !== 'none';
  full.style.display = '';
  short.style.display = 'none';
  const f = { w: pill.offsetWidth, h: pill.offsetHeight };
  full.style.display = 'none';
  short.style.display = '';
  const s = { w: pill.offsetWidth, h: pill.offsetHeight };
  full.style.display = showing ? 'none' : '';
  short.style.display = showing ? '' : 'none';
  return { full: f, short: s };
}

/**
 * A ref callback that files a tag's element under `key`. It only forgets an element that has left the page: each
 * tag is drawn in its own React root, so a detach can never clear the element of a tag mounted again under the same key.
 */
const hold = <T extends HTMLElement>(map: Record<string, T>, key: string) => (el: T | null) => {
  if (el) map[key] = el;
  else if (map[key] && !map[key].isConnected) delete map[key];
};

/** Before a tag can be measured: about 6 px a letter at 10 px (7 at 12 px), plus the padding */
const guess = (text: string, big: boolean): Sizes => ({ full: { w: text.length * (big ? 7 : 6) + 16, h: big ? 22 : 21 } });

export default function Labels3D({ mode, labelsVisible, selectedId, highlightIds, onSelect }: Props) {
  const g3 = useRef<THREE.Group>(null);
  // the elements of each tag, by the same key as its Html
  const dotRefs = useRef<Record<string, HTMLDivElement>>({});
  const pillRefs = useRef<Record<string, HTMLButtonElement>>({});
  const lineRefs = useRef<Record<string, HTMLSpanElement>>({});
  /** the styles each element was last given, so a style is only written when it changes (and a move animates once) */
  const written = useRef(new WeakMap<HTMLElement, Record<string, string | number>>());
  const frame = useRef(0);
  const sizes = useRef(new Map<string, Sizes>());
  /** what the last layout was made from: while the heart and the controls stay put, the tags need no new one */
  const laidOut = useRef<{ key: string; items: unknown; controls: unknown } | null>(null);
  const { size } = useThree();
  const allLabels = useSceneStore((s) => s.allLabels);
  // Fingers need bigger tags (12 px text, a 40 px touch target) with more space between them
  const touch = useIsTouch();
  useEffect(() => {
    const remeasure = () => {
      sizes.current.clear();
      laidOut.current = null;
    };
    remeasure();
    if (!document.fonts) return;
    let live = true;
    void document.fonts.ready.then(() => { if (live) remeasure(); });
    return () => { live = false; };
  }, [touch]);
  // A small view (a phone, a drawer sharing the screen) shows only the most important tags — the sets list them
  // in order of importance — so the tags do not bury the heart. Views whose tags are the only way to pick a part keep them all.
  const room = Math.max(5, Math.floor((size.width * size.height) / 16000));
  const cap = allLabels || mode === 'conduction' || mode === 'territories' || mode === 'xray' ? Infinity : room;

  const items = useMemo(() => {
    const out: { l: Landmark; kind: Kind }[] = [];
    const seen = new Set<string>();
    const push = (id: string, kind: Kind) => {
      const l = LANDMARK_BY_ID[id];
      if (!l || seen.has(id)) return;
      if (kind !== 'selected' && !relevant(l, mode)) return;
      seen.add(id);
      out.push({ l, kind });
    };
    if (selectedId) push(selectedId, 'selected');
    highlightIds.forEach((id) => push(id, 'highlight'));
    if (labelsVisible) {
      let shown = 0;
      for (const id of LABEL_SETS[mode]) {
        if (shown >= cap) break;
        const before = out.length;
        push(id, 'normal');
        if (out.length > before) shown++;
      }
    }
    return out;
  }, [mode, labelsVisible, selectedId, highlightIds, cap]);

  const tmpA = useMemo(() => new THREE.Vector3(), []);
  const tmpN = useMemo(() => new THREE.Vector3(), []);
  const tmpC = useMemo(() => new THREE.Vector3(), []);
  const center = useMemo(() => new THREE.Vector3(...HEART_CENTER), []);

  useFrame(({ camera }) => {
    const g = g3.current;
    if (!g) return;
    const occluding = mode === 'external' || mode === 'territories' || mode === 'activation';
    const n = ++frame.current;
    const set = (el: HTMLElement, prop: 'opacity' | 'transform' | 'width' | 'pointerEvents' | 'display' | (typeof HIT)[keyof typeof HIT], value: string) => {
      let w = written.current.get(el);
      if (!w) written.current.set(el, (w = {}));
      if (w[prop] === value) return;
      w[prop] = value;
      if (prop.startsWith('--')) el.style.setProperty(prop, value);
      else el.style[prop as 'opacity'] = value;
    };
    /** a tag that moves to another slot glides there; the first time it is placed it simply appears */
    const glide = (el: HTMLElement, prop: 'transform' | 'width', value: string) => {
      let w = written.current.get(el);
      if (!w) written.current.set(el, (w = {}));
      if (w.since === undefined) {
        w.since = n;
        el.style.transitionDuration = '0s';
      } else if (w.since !== -1 && n > (w.since as number)) {
        w.since = -1;
        el.style.transitionDuration = '';
      }
      set(el, prop, value);
    };

    // 1. where each dot is on screen, and how much of it faces the viewer
    const spots = items.map(({ l, kind }) => {
      const a = anchorFor(l, mode);
      tmpA.set(a[0], a[1], a[2]);
      // facing test for surface labels (cheap stand-in for occlusion)
      let alpha = 1;
      if (occluding && l.surface) {
        tmpN.copy(tmpA).sub(center).normalize().transformDirection(g.matrixWorld);
        tmpC.copy(tmpA).applyMatrix4(g.matrixWorld);
        const facing = tmpN.dot(camera.position.clone().sub(tmpC).normalize());
        alpha = facing > 0.05 ? 1 : facing > -0.15 ? 0.25 + (facing + 0.15) * 3.5 : 0;
      } else if (mode === 'sectioned') {
        alpha = camera.position.z > -0.5 ? 1 : 0;
      }
      if (kind === 'selected') alpha = Math.max(alpha, 0.9);
      tmpC.copy(tmpA).applyMatrix4(g.matrixWorld).project(camera);
      return { alpha, x: (tmpC.x * 0.5 + 0.5) * size.width, y: (-tmpC.y * 0.5 + 0.5) * size.height };
    });
    // a tag must not hide another tag's dot (or it reads as that tag's)
    const dots = spots.map((p) => (p.alpha > 0.3 ? { x0: p.x - DOT, y0: p.y - DOT, x1: p.x + DOT, y1: p.y + DOT } : null));
    const controls = useOverlayCover.getState().boxes;
    // nothing moved (to the pixel) since the last complete layout: it still holds
    const layout = `${size.width}x${size.height} ${touch} ${allLabels} ${spots.map((p) => `${Math.round(p.x)},${Math.round(p.y)},${p.alpha.toFixed(2)}`).join(' ')}`;
    const last = laidOut.current;
    if (last && last.key === layout && last.items === items && last.controls === controls) return;
    let complete = true;

    // 2. screen-space de-cluttering, in order of importance: each tag takes the first free slot near its dot,
    // clear of the tags already placed, the other dots and the controls over the heart
    const placed: Box[] = [];
    const placedPills: HTMLButtonElement[] = [];
    items.forEach(({ l, kind }, i) => {
      const key = `${l.id}-${kind}`;
      const dot = dotRefs.current[key];
      const pill = pillRefs.current[key];
      const line = lineRefs.current[key];
      if (!dot || !pill || !line) {
        complete = false;
        return;
      }
      const { x: sx, y: sy } = spots[i];
      let alpha = spots[i].alpha;
      let short = false;
      if (alpha >= 0.05) {
        let sz = sizes.current.get(key);
        if (!sz) {
          const m = measure(pill);
          if (m) sizes.current.set(key, m);
          else complete = false;
          sz = m ?? guess(kind === 'normal' ? l.short ?? l.name : l.name, touch || kind === 'selected');
        }
        const must = kind !== 'normal' || allLabels;
        const opts: PlaceOptions = {
          width: size.width, height: size.height, placed, cover: [...controls, ...dots.filter((b, j): b is Box => !!b && j !== i)], gap: touch ? TAG_GAP.touch : TAG_GAP.mouse, rows: must ? MUST_ROWS : ROWS,
        };
        const nat = NATURAL[kind];
        const place = (s: Size) => findSlot(sx, sx + nat.x, sy + nat.y - s.h, s.w, s.h, opts);
        let slot: Slot | null = place(sz.full);
        // a tag that must show does: by its short name (LM, pLAD, OM1…) when the full one has no room beside its dot,
        // then at the nearest free place further out (with a leader line), and where it crowds least when there is none
        if (!slot && must) {
          if (sz.short) {
            slot = place(sz.short);
            short = true;
          }
          const s = sz.short ?? sz.full;
          const at = [sx, sy, sx + nat.x, sy + nat.y - s.h, s.w, s.h, opts, REACH] as const;
          if (!slot) slot = nearestFreeSlot(...at) ?? leastCrowdedSlot(...at);
        }
        if (slot) {
          placed.push(slot.box);
          placedPills.push(pill);
          const s = short && sz.short ? sz.short : sz.full;
          glide(pill, 'transform', `translate(${nat.x + slot.dx}px, ${nat.y - s.h + slot.dy}px)`);
          const lead = leaderLine(slot.box, sx, sy);
          glide(line, 'width', lead ? `${Math.round(lead.length)}px` : '0px');
          if (lead) glide(line, 'transform', `rotate(${lead.angle.toFixed(3)}rad)`);
        } else {
          alpha = 0; // no room for it in this view
        }
      }
      if (pill.children.length > 1) {
        const [fullEl, shortEl] = Array.from(pill.children) as HTMLElement[];
        set(fullEl, 'display', short ? 'none' : '');
        set(shortEl, 'display', short ? '' : 'none');
      }
      set(dot, 'opacity', String(alpha));
      set(pill, 'pointerEvents', alpha > 0.3 ? 'auto' : 'none');
      const tabIndex = alpha > 0.3 ? 0 : -1;
      if (pill.tabIndex !== tabIndex) {
        pill.tabIndex = tabIndex;
        pill.setAttribute('aria-hidden', String(alpha <= 0.3));
      }
    });
    // 3. on a touch screen, a tag crammed in closer than the gap gives up the part of its invisible margin that
    // would cover its neighbour (and so take its taps)
    if (touch) {
      touchMargins(placed).forEach((m, i) => {
        for (const side of ['top', 'right', 'bottom', 'left'] as const) set(placedPills[i], HIT[side], `${m[side]}px`);
      });
    }
    laidOut.current = complete ? { key: layout, items, controls } : null;
  });

  return (
    <group ref={g3}>
      {items.map(({ l, kind }) => {
        const p = anchorFor(l, mode);
        const key = `${l.id}-${kind}`;
        // a tag a lesson points at may fall back to its short name when it has no room: both are kept, one shown
        const twoNames = kind === 'highlight' && !!l.short && l.short !== l.name;
        return (
          <Html key={key} position={p} zIndexRange={kind === 'selected' ? [40, 30] : kind === 'highlight' ? [29, 20] : [19, 0]} style={{ pointerEvents: 'none' }}>
            <div ref={hold(dotRefs.current, key)} className="relative transition-opacity duration-150">
              {/* the leader line, drawn when the tag had to move away from its dot */}
              <span
                ref={hold(lineRefs.current, key)}
                aria-hidden
                className={`absolute left-0 top-0 h-px origin-left transition-[transform,width] duration-200 ${kind === 'selected' ? 'bg-sky-300/80' : kind === 'highlight' ? 'bg-amber-300/80' : 'bg-white/50'}`}
                style={{ width: 0 }}
              />
              <span
                className={`absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full ${kind === 'selected' ? 'w-2.5 h-2.5 bg-sky-400 ring-2 ring-sky-200/60' : kind === 'highlight' ? 'w-2 h-2 bg-amber-400' : 'w-1.5 h-1.5 bg-white/80'}`}
              />
              <button
                ref={hold(pillRefs.current, key)}
                onClick={(e) => onSelect(l.id, e.detail === 0)}
                aria-label={twoNames ? l.name : undefined}
                title={twoNames ? l.name : undefined}
                // on touch screens an invisible margin makes the tag a 40 px target without making it look bigger
                // (tags are kept further apart than it reaches, TAG_GAP, and one crammed in closer has it cut back)
                style={HIT_AREA}
                className={`absolute left-0 top-0 whitespace-nowrap rounded px-1.5 py-0.5 touch:px-2 font-medium shadow-lg border backdrop-blur-sm transition-transform duration-200 touch:before:absolute touch:before:-top-[var(--hit-t)] touch:before:-right-[var(--hit-r)] touch:before:-bottom-[var(--hit-b)] touch:before:-left-[var(--hit-l)] touch:before:content-[''] ${
                  kind === 'selected'
                    ? 'text-xs bg-sky-500/90 text-white border-sky-300/60'
                    : kind === 'highlight'
                      ? 'text-[10px] touch:text-xs bg-amber-500/85 text-slate-950 border-amber-300/60'
                      : 'text-[10px] touch:text-xs bg-slate-950/70 text-slate-100 border-white/10 hover:bg-slate-800/90'
                }`}
              >
                {twoNames ? (
                  <>
                    <span>{l.name}</span>
                    <span style={{ display: 'none' }}>{l.short}</span>
                  </>
                ) : kind === 'normal' ? l.short ?? l.name : l.name}
              </button>
            </div>
          </Html>
        );
      })}
    </group>
  );
}
