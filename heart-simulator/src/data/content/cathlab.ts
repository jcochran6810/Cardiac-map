import type { CathLabItem } from '../../types/content';
import { CATHLAB_A } from './cathlab-a';
import { CATHLAB_B } from './cathlab-b';
import { CATHLAB_C } from './cathlab-c';

/** The cath lab catalog: views, access, devices, physiology, support, pressures, drugs, complications, team */
export const CATHLAB_ITEMS: CathLabItem[] = [...CATHLAB_A, ...CATHLAB_B, ...CATHLAB_C];

export const CATHLAB: Record<string, CathLabItem> = Object.fromEntries(CATHLAB_ITEMS.map((i) => [i.id, i]));
