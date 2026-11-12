import type { StandardLead } from '@/lib/ecg/vector';

/** a lead written in a question: "V1", "aVF", or "I", "II", "III" */
const LEAD = /\b(aVR|aVL|aVF|V[1-6]|III|II|I)\b/g;
/** what comes just before a Roman-numeral lead: "in II", "leads II, III and aVF", "I and aVL" ("Mobitz II" is not one) */
const BEFORE_ROMAN = /(\blead|\bleads|\bin|\band|\bor|,|\/|–|-)\s*$/i;
/** …or just after it: "II, III and aVF", "I and V6" */
const AFTER_ROMAN = /^\s*(,|\/|–|-|and\b|or\b)\s*(aVR|aVL|aVF|V[1-6]|III|II|I)\b/;
/** a group of leads named by the wall they face */
const GROUPS: [RegExp, StandardLead][] = [
  [/\binferior leads\b/i, 'II'],
  [/\blateral leads\b/i, 'I'],
  [/\b(precordial|chest|anterior|septal) leads\b/i, 'V1'],
];

/**
 * The lead a strip question asks about, for the quiz card's strip to start on: the first lead the question names
 * ("ST elevation in V1–V4" → V1, "in II, III and aVF" → II, "the inferior leads" → II), or lead II when it names
 * none. Only the question's own words count, so the starting lead never hints at the answer.
 */
export function leadNamedIn(question: string): StandardLead {
  for (const m of Array.from(question.matchAll(LEAD))) {
    const lead = m[1] as StandardLead;
    if (!/^I+$/.test(lead)) return lead;
    const at = m.index ?? 0;
    if (BEFORE_ROMAN.test(question.slice(0, at)) || AFTER_ROMAN.test(question.slice(at + lead.length))) return lead;
  }
  let first: { at: number; lead: StandardLead } | null = null;
  for (const [re, lead] of GROUPS) {
    const at = question.search(re);
    if (at >= 0 && (!first || at < first.at)) first = { at, lead };
  }
  return first?.lead ?? 'II';
}
