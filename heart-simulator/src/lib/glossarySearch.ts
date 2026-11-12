/** The Glossary's own filter: which terms match what was typed, and in what order to list them */
import type { GlossaryTerm } from '@/data/glossary';

/** Lower case, with hyphens, slashes and other punctuation as spaces ("12-lead ECG" → "12 lead ecg") */
const plain = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u00c0-\u024f\u0370-\u03ff]+/g, ' ').trim();
/** Does a word of `name` start with `q`? */
const wordStart = (name: string, q: string) => ` ${name}`.includes(` ${q}`);

/**
 * Does the term (its name, other names or definition) contain every word typed? A word of one or two characters
 * ("q", "mi", "st", "v1") counts only as a whole word, or as the start of a word of the term's name or other names
 * (so "at" still finds Atrium while it is being typed). Anywhere else in a longer word it is no match: the "q" of
 * "quiver" in a definition is not a Q wave, and the "mi" of "minute" is not an MI. Longer words match anywhere.
 */
export function matchesTerm(term: GlossaryTerm, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${term.term} ${(term.aka ?? []).join(' ')} ${term.def}`.toLowerCase();
  const wholeWords = ` ${plain(hay)} `;
  const names = [term.term, ...(term.aka ?? [])].map(plain);
  return words.every((w) => {
    const short = plain(w);
    if (!short || short.length > 2 || short.includes(' ')) return hay.includes(w);
    return wholeWords.includes(` ${short} `) || names.some((n) => wordStart(n, short));
  });
}

/**
 * How well a matching term fits the query, best first:
 * 0 the term itself ("stemi" → STEMI), 1 one of its other names ("acs" → Acute coronary syndrome),
 * 2 the start of the term ("stemi" → STEMI criteria), 3 the start of another name,
 * 4 the start of a word in the term or another name ("fib" → Atrial fibrillation),
 * 5 inside the term ("stemi" → NSTEMI), 6 a word of the definition ("stemi" → 12-lead ECG),
 * 7 anywhere else, such as inside a word ("stemi" → SVR, "systemic vascular resistance").
 */
export function termRank(term: GlossaryTerm, query: string): number {
  const q = plain(query);
  const name = plain(term.term);
  const aka = (term.aka ?? []).map(plain);
  if (!q || name === q) return 0;
  if (aka.includes(q)) return 1;
  if (name.startsWith(q)) return 2;
  if (aka.some((a) => a.startsWith(q))) return 3;
  if ([name, ...aka].some((n) => wordStart(n, q))) return 4;
  if (name.includes(q)) return 5;
  return wordStart(plain(term.def), q) ? 6 : 7;
}

/** The terms that match the query, best fit first; equally good ones keep their order (A–Z in the Glossary) */
export function findTerms(terms: readonly GlossaryTerm[], query: string): GlossaryTerm[] {
  const hits = terms.filter((t) => matchesTerm(t, query));
  if (!query.trim()) return hits;
  return hits
    .map((t, i) => ({ t, i, rank: termRank(t, query) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((h) => h.t);
}
