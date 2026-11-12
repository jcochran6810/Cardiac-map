import { describe, expect, it } from 'vitest';
import { GLOSSARY, GLOSSARY_BY_ID, GLOSSARY_GROUPS } from '@/data/glossary';
import { CONDITION_IDS, MEDICATION_IDS, PROCEDURE_IDS, STRUCTURE_IDS } from '@/types/content';

const LIBRARY: readonly string[] = [...STRUCTURE_IDS, ...CONDITION_IDS, ...PROCEDURE_IDS, ...MEDICATION_IDS];
/** British spellings that must not reach a US learner */
const BRITISH = /haem|aemi[ac]|ischaem|oedema|fibre|litre|tumour|colour|centre|labelled|practise|synchronis|recognis|organis|stabilis|localis|minimis|visualis|catheteris|anaesth|polaris|analys(e|ed|ing)\b|paralys|manoeuvr|oesoph|paediatr|characteris|normalis|utilis|hospitalis|vascularis/i;

describe('glossary', () => {
  it('has unique ids and terms, each in a known group', () => {
    const groups = GLOSSARY_GROUPS.map((g) => g.id);
    expect(new Set(GLOSSARY.map((g) => g.id)).size).toBe(GLOSSARY.length);
    expect(new Set(GLOSSARY.map((g) => g.term.toLowerCase())).size).toBe(GLOSSARY.length);
    for (const g of GLOSSARY) {
      expect(g.id).toMatch(/^[a-z0-9-]+$/);
      expect(groups, g.id).toContain(g.group);
      expect(GLOSSARY_BY_ID[g.id]).toBe(g);
    }
    // every group is used
    for (const id of groups) expect(GLOSSARY.some((g) => g.group === id), id).toBe(true);
  });

  it.each(GLOSSARY.map((g) => [g.term, g] as const))('%s: a short, plain definition', (_, g) => {
    expect(g.def.length, 'long enough to explain').toBeGreaterThanOrEqual(40);
    expect(g.def.length, 'short enough to read at a glance').toBeLessThanOrEqual(330);
    expect(g.def.trim()).toMatch(/[.)]$/);
    // a definition does not open by repeating the term's name
    expect(g.def.toLowerCase().startsWith(`${g.term.toLowerCase()} is`)).toBe(false);
    expect(`${g.term} ${g.def} ${(g.aka ?? []).join(' ')}`).not.toMatch(BRITISH);
  });

  it('links only to pages that exist in the library', () => {
    for (const g of GLOSSARY) if (g.see) expect(LIBRARY, `${g.id} → ${g.see}`).toContain(g.see);
    // most terms lead somewhere to read more
    expect(GLOSSARY.filter((g) => g.see).length / GLOSSARY.length).toBeGreaterThan(0.5);
  });
});
