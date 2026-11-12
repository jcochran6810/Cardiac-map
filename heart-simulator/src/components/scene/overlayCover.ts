import { create } from 'zustand';
import type { Box } from './labelPlacement';

/**
 * The parts of the 3D view that SceneOverlay's controls cover (CSS px from the view's top-left). The name tags are
 * placed clear of them, and in a small view the camera frames the heart below the controls along the top edge.
 */
interface OverlayCover {
  boxes: Box[];
  /** a small view: how far down the controls along its top edge reach over its middle, where the heart is drawn (else 0) */
  top: number;
  setCover: (boxes: Box[], top: number) => void;
}

const same = (a: Box[], b: Box[]) =>
  a.length === b.length && a.every((p, i) => p.x0 === b[i].x0 && p.y0 === b[i].y0 && p.x1 === b[i].x1 && p.y1 === b[i].y1);

export const useOverlayCover = create<OverlayCover>((set, get) => ({
  boxes: [],
  top: 0,
  setCover: (boxes, top) => {
    const s = get();
    if (s.top !== top || !same(s.boxes, boxes)) set({ boxes, top });
  },
}));
