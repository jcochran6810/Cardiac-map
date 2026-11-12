'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import type { CathLabItem, ConditionContent, MedicationContent, ProcedureContent, QuizQuestion, StructureContent } from '@/types/content';
import type { Course } from '@/types/course';

/**
 * The teaching library is large (~1 MB of text), so it is code-split and loaded
 * right after the app shell renders instead of blocking first paint.
 */
export interface ContentLibrary {
  structures: Record<string, StructureContent>;
  conditions: Record<string, ConditionContent>;
  procedures: Record<string, ProcedureContent>;
  medications: Record<string, MedicationContent>;
  /** the cath lab catalog: views, devices, drugs, pressures, complications, team */
  cathlab: Record<string, CathLabItem>;
  quiz: QuizQuestion[];
  /** guided courses: lessons that set up the heart and the ECG step by step */
  courses: Course[];
}

interface ContentState {
  lib: ContentLibrary | null;
  error: string | null;
  loading: boolean;
}

export const useContentStore = create<ContentState>(() => ({ lib: null, error: null, loading: false }));

let pending: Promise<void> | null = null;

export function loadContent(): Promise<void> {
  if (useContentStore.getState().lib) return Promise.resolve();
  if (pending) return pending;
  useContentStore.setState({ loading: true });
  pending = import('@/data/content')
    .then((m) => {
      useContentStore.setState({
        lib: { structures: m.STRUCTURES, conditions: m.CONDITIONS, procedures: m.PROCEDURES, medications: m.MEDICATIONS, cathlab: m.CATHLAB, quiz: m.QUIZ_QUESTIONS, courses: m.COURSES },
        loading: false,
      });
    })
    .catch((e: unknown) => {
      pending = null;
      useContentStore.setState({ error: e instanceof Error ? e.message : 'Failed to load content', loading: false });
    });
  return pending;
}

/** Returns the content library (null until loaded) and triggers loading on first use */
export function useContent(): ContentLibrary | null {
  const lib = useContentStore((s) => s.lib);
  useEffect(() => {
    if (!lib) void loadContent();
  }, [lib]);
  return lib;
}

export type SearchKind = 'structure' | 'condition' | 'procedure' | 'medication' | 'cathlab' | 'case' | 'lesson' | 'tool' | 'simcase';

export interface SearchHit {
  kind: SearchKind;
  /** the library item's id; for a lesson, "course/lesson" */
  id: string;
  name: string;
  sub: string;
  score: number;
}

function norm(s: string) {
  return s.toLowerCase().normalize('NFKD').replace(/[^\w\s/+-]/g, ' ');
}

/** Something to find that is not a library page: a tool, a simulator case */
export interface SearchExtra {
  kind: 'tool' | 'simcase';
  id: string;
  name: string;
  sub: string;
  /** other words people type for it */
  keys: string[];
}

/** What people type → the word the library uses for it */
const ALIASES: [RegExp, string][] = [
  [/\bekgs?\b/g, 'ecg'],
  [/\bheart attacks?\b/g, 'stemi'],
  [/\ba[- ]?fib\b/g, 'atrial fibrillation'],
  [/\ba[- ]?flutter\b/g, 'atrial flutter'],
  [/\bv[- ]?tach\b/g, 'ventricular tachycardia'],
  [/\bv[- ]?fib\b/g, 'ventricular fibrillation'],
  [/\bchf\b/g, 'heart failure'],
  [/\bheart block\b/g, 'av block'],
  [/\bnitro\b/g, 'nitroglycerin'],
  [/\bepi\b/g, 'epinephrine'],
  [/\basa\b/g, 'aspirin'],
  [/\btnk\b/g, 'tenecteplase'],
  [/\bblood thinners?\b/g, 'anticoagulant'],
  [/\bwidow ?maker\b/g, 'lad'],
  [/\bpacer\b/g, 'pacemaker'],
  [/\bbypass\b/g, 'cabg'],
];

/** The query with everyday words swapped for the library's own (null when nothing changes) */
export function withAliases(q: string): string | null {
  let out = q;
  for (const [re, to] of ALIASES) out = out.replace(re, to);
  return out === q ? null : out;
}

/**
 * Lightweight ranked search across the whole library (names, synonyms, summaries), the guided lessons and
 * whatever else the caller offers (`extras`: tools, simulator cases). Everyday words are understood too
 * ("ekg", "heart attack", "afib"): a query is tried as typed and with those words swapped for the library's own.
 */
export function searchLibrary(lib: ContentLibrary, cases: { id: string; title: string }[], query: string, limit = 24, extras: SearchExtra[] = []): SearchHit[] {
  const q = norm(query).trim();
  if (q.length < 2) return [];
  const alias = withAliases(q);
  const queries = [q, ...(alias ? [alias] : [])].map((x) => x.split(/\s+/).filter(Boolean));
  const hits: SearchHit[] = [];
  const scoreFor = (terms: string[], name: string, extra: string[], body: string) => {
    const n = norm(name);
    let s = 0;
    for (const t of terms) {
      if (n === t) s += 12;
      else if (n.startsWith(t)) s += 8;
      else if (n.includes(t)) s += 6;
      else if (extra.some((x) => norm(x).includes(t))) s += 4;
      else if (body.includes(t)) s += 1;
      else return 0;
    }
    return s;
  };
  const score = (name: string, extra: string[], body: string) => Math.max(...queries.map((terms) => scoreFor(terms, name, extra, body)));
  for (const s of Object.values(lib.structures)) {
    const sc = score(s.name, s.synonyms, norm(s.summary));
    if (sc) hits.push({ kind: 'structure', id: s.id, name: s.name, sub: s.group.replace('-', ' '), score: sc + 0.5 });
  }
  for (const c of Object.values(lib.conditions)) {
    const sc = score(c.name, c.synonyms, norm(c.summary));
    if (sc) hits.push({ kind: 'condition', id: c.id, name: c.name, sub: c.category, score: sc + 0.4 });
  }
  for (const p of Object.values(lib.procedures)) {
    const sc = score(p.name, [], norm(p.summary));
    if (sc) hits.push({ kind: 'procedure', id: p.id, name: p.name, sub: p.category, score: sc + 0.3 });
  }
  for (const m of Object.values(lib.medications)) {
    const sc = score(m.name, m.brandNames.concat(m.drugClass), norm(m.summary));
    if (sc) hits.push({ kind: 'medication', id: m.id, name: m.name, sub: m.drugClass, score: sc + 0.2 });
  }
  for (const i of Object.values(lib.cathlab)) {
    const sc = score(i.name, i.synonyms ?? [], norm(i.summary));
    if (sc) hits.push({ kind: 'cathlab', id: i.id, name: i.name, sub: 'Cath lab', score: sc + 0.25 });
  }
  for (const c of cases) {
    const sc = score(c.title, [], '');
    if (sc) hits.push({ kind: 'case', id: c.id, name: c.title, sub: 'Case scenario', score: sc });
  }
  // guided lessons: by title, by what the lesson teaches and by the titles of its steps
  for (const course of lib.courses) {
    for (const l of course.lessons) {
      const sc = score(l.title, [course.title, ...l.steps.map((s) => s.title)], norm(l.goal));
      if (sc) hits.push({ kind: 'lesson', id: `${course.id}/${l.id}`, name: l.title, sub: `Lesson · ${course.title}`, score: sc + 0.1 });
    }
  }
  for (const x of extras) {
    const sc = score(x.name, x.keys, '');
    // a tool named in the query is very likely what was wanted
    if (sc) hits.push({ kind: x.kind, id: x.id, name: x.name, sub: x.sub, score: sc + (x.kind === 'tool' ? 2 : 0) });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
