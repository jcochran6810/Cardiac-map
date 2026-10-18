import { describe, expect, it } from 'vitest';
import { CATHLAB, CATHLAB_ITEMS } from '@/data/content/cathlab';
import { CATH_IMAGES } from '@/data/cathImages';
import { CATHLAB_GROUPS, CONDITION_IDS, MEDICATION_IDS, PROCEDURE_IDS } from '@/types/content';
import { INTERVENTIONS, INTERVENTION_BY_ID } from '@/lib/sim/scenario/interventions';
import { CINE_VIEW_BY_ID, CINE_VIEWS } from '@/lib/cathlab/views';

const LIBRARY = new Set<string>([...CONDITION_IDS, ...PROCEDURE_IDS, ...MEDICATION_IDS]);

describe('cath lab catalog', () => {
  it('has unique cl- ids, a known group and every field filled in', () => {
    expect(CATHLAB_ITEMS.length).toBeGreaterThanOrEqual(70);
    expect(new Set(CATHLAB_ITEMS.map((i) => i.id)).size).toBe(CATHLAB_ITEMS.length);
    const groups = new Set<string>(CATHLAB_GROUPS.map((g) => g.id));
    for (const i of CATHLAB_ITEMS) {
      expect(i.id, i.id).toMatch(/^cl-[a-z0-9-]+$/);
      expect(groups.has(i.group), `${i.id} group`).toBe(true);
      expect(i.name.trim(), i.id).not.toBe('');
      expect(i.summary.length, `${i.id} summary`).toBeGreaterThan(30);
      expect(i.details.length, `${i.id} details`).toBeGreaterThanOrEqual(3);
      for (const r of [i.roles.tech, i.roles.rn, i.roles.md]) expect(r.length, `${i.id} roles`).toBeGreaterThan(20);
    }
    for (const g of CATHLAB_GROUPS) expect(CATHLAB_ITEMS.some((i) => i.group === g.id), g.id).toBe(true);
  });

  it('links only to things that exist', () => {
    for (const i of CATHLAB_ITEMS) {
      for (const r of i.related ?? []) expect(LIBRARY.has(r) || !!CATHLAB[r], `${i.id} → ${r}`).toBe(true);
      for (const s of i.sim ?? []) expect(INTERVENTION_BY_ID[s], `${i.id} sim ${s}`).toBeDefined();
      if (i.view) expect(CINE_VIEW_BY_ID[i.view], `${i.id} view`).toBeDefined();
      if (i.image?.key) expect(CATH_IMAGES[i.image.key], `${i.id} image`).toBeDefined();
    }
  });

  it('covers every cath lab action in the simulator and every standard view', () => {
    const taught = new Set(CATHLAB_ITEMS.flatMap((i) => i.sim ?? []));
    const lab = INTERVENTIONS.filter((iv) => iv.settings?.length === 1 && iv.settings[0] === 'cathlab' && iv.id !== 'labs');
    for (const iv of lab) expect(taught.has(iv.id), `no catalog item teaches ${iv.id}`).toBe(true);
    for (const v of CINE_VIEWS) expect(CATHLAB_ITEMS.some((i) => i.view === v.id), v.id).toBe(true);
  });
});
