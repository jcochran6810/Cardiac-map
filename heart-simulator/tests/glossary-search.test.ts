import { describe, expect, it } from 'vitest';
import { GLOSSARY } from '@/data/glossary';
import { findTerms, termRank } from '@/lib/glossarySearch';

const A_TO_Z = [...GLOSSARY].sort((a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }));
const names = (q: string) => findTerms(A_TO_Z, q).map((t) => t.term);

describe('the glossary filter puts the best match first', () => {
  it('the term itself comes first, then terms that start with it, then definitions that mention it', () => {
    const hits = names('stemi');
    expect(hits.slice(0, 3)).toEqual(['STEMI', 'STEMI criteria', 'NSTEMI']);
    // terms that only mention STEMI in their definition come after every name match …
    const rank = (n: string) => termRank(GLOSSARY.find((t) => t.term === n)!, 'stemi');
    const defOnly = hits.filter((n) => rank(n) === 6);
    expect(defOnly).toContain('12-lead ECG');
    expect(defOnly).toContain('Acute coronary syndrome');
    expect(hits.indexOf(defOnly[0])).toBe(3);
    // … and the letters inside another word ("systemic vascular resistance") come last
    expect(hits[hits.length - 1]).toBe('SVR');
    // the filter itself is unchanged: the same terms, only in a better order
    expect([...hits].sort()).toEqual(A_TO_Z.filter((t) => `${t.term} ${(t.aka ?? []).join(' ')} ${t.def}`.toLowerCase().includes('stemi')).map((t) => t.term).sort());
  });

  it('an exact other name beats a term that only starts with the query', () => {
    expect(names('acs')[0]).toBe('Acute coronary syndrome');
  });

  it('ignores case and treats hyphens as spaces', () => {
    expect(names('12 LEAD')[0]).toBe('12-lead ECG');
    expect(termRank(GLOSSARY.find((t) => t.id === 'twelve-lead')!, '12-lead ecg')).toBe(0);
  });

  it('ranks each kind of match in order', () => {
    const term = { id: 'x', term: 'Atrial fibrillation', aka: ['AF', 'A-fib'], def: 'An irregular rhythm with no P waves.', group: 'rhythm' } as (typeof GLOSSARY)[number];
    expect(termRank(term, 'atrial fibrillation')).toBe(0);
    expect(termRank(term, 'af')).toBe(1);
    expect(termRank(term, 'atrial')).toBe(2);
    expect(termRank(term, 'a fi')).toBe(3);
    expect(termRank(term, 'fib')).toBe(4);
    expect(termRank(term, 'brill')).toBe(5);
    expect(termRank(term, 'irregular')).toBe(6);
    expect(termRank(term, 'regular')).toBe(7);
  });

  it('with nothing typed, lists every term A to Z', () => {
    expect(names('')).toEqual(A_TO_Z.map((t) => t.term));
    expect(names('   ')).toEqual(A_TO_Z.map((t) => t.term));
  });
});
