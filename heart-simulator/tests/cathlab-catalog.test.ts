import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATHLAB, CATHLAB_ITEMS } from '@/data/content/cathlab';
import { CATH_IMAGES } from '@/data/cathImages';
import { CATHLAB_GROUPS, CONDITION_IDS, MEDICATION_IDS, PROCEDURE_IDS } from '@/types/content';
import { INTERVENTIONS, INTERVENTION_BY_ID } from '@/lib/sim/scenario/interventions';
import { CINE_VIEW_BY_ID, CINE_VIEWS } from '@/lib/cathlab/views';
import { SCENARIOS } from '@/lib/sim/scenario/scenarios';

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
      for (const k of i.image?.keys ?? []) expect(CATH_IMAGES[k], `${i.id} image ${k}`).toBeDefined();
    }
  });

  it('covers every cath lab action in the simulator and every standard view', () => {
    const taught = new Set(CATHLAB_ITEMS.flatMap((i) => i.sim ?? []));
    const lab = INTERVENTIONS.filter((iv) => iv.settings?.length === 1 && iv.settings[0] === 'cathlab' && iv.id !== 'labs');
    for (const iv of lab) expect(taught.has(iv.id), `no catalog item teaches ${iv.id}`).toBe(true);
    for (const v of CINE_VIEWS) expect(CATHLAB_ITEMS.some((i) => i.view === v.id), v.id).toBe(true);
  });
});

/** Width and height from a JPEG's start-of-frame marker */
function jpegSize(buf: Buffer): [number, number] {
  let i = 2;
  while (i < buf.length) {
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  throw new Error('no frame header');
}

describe('real cath lab images', () => {
  it('are in public/ at the size stated, openly licensed and credited to their source', () => {
    const entries = Object.entries(CATH_IMAGES);
    expect(entries.length).toBeGreaterThanOrEqual(10);
    for (const [key, img] of entries) {
      expect(img!.src, key).toBe(`/cath-images/${key}.jpg`);
      const size = jpegSize(readFileSync(join(__dirname, '..', 'public', img!.src)));
      expect(size, `${key} size`).toEqual([img!.width, img!.height]);
      expect(img!.license, key).toMatch(/^CC BY( |-SA )\d\.\d$|^CC0|^Public domain/);
      expect(img!.licenseUrl, key).toMatch(/^https:\/\/creativecommons\.org\//);
      expect(img!.source, key).toMatch(/^https:\/\//);
      expect(img!.credit.length, key).toBeGreaterThan(20);
      expect(img!.caption.length, key).toBeGreaterThan(30);
      // the alt text names the kind of image only: it is read out while the learner is asked what the image shows
      expect(img!.alt, key).not.toMatch(/occlu|stenos|narrow|thromb|perforat|aneurysm|normal|dissect/i);
    }
  });

  it('every image a case shows exists', () => {
    for (const sc of SCENARIOS) {
      for (const [view, key] of Object.entries(sc.images ?? {})) {
        expect(CATH_IMAGES[key!], `${sc.id} ${view} → ${key}`).toBeDefined();
      }
    }
  });
});
