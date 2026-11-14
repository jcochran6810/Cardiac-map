'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import type { CaseDecision, CathLabItem, ConditionContent, MedicationContent, ProcedureContent, QuizQuestion, StructureContent } from '@/types/content';
import type { Course } from '@/types/course';
import { LEVEL_LABELS, type LearningLevel } from '@/store/useAppStore';

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

// ─── Per-role notes ────────────────────────────────────────────────────────

/**
 * Whose note an ER learner reads while an item has no ER notes yet (levelNotes and case-study roleBriefs were written
 * for the first five roles; the ER nurse's and ER doctor's are being added). The stand-in is the role nearest in
 * license and authority, shown under its own name — never passed off as the ER role's note:
 *  - ER nurse → the cath lab RN. The same RN license and Nurse Practice Act: gives drugs on an order or a standing
 *    protocol, monitors, escalates to the physician; only the setting differs, and the label says so. The paramedic's
 *    note is nearer in setting but is written for protocols and medical direction and for skills an RN does not have
 *    (advanced airway, acting on one's own 12-lead read), so it would mislead about scope, which matters more.
 *  - ER doctor → the cardiologist: the physician who diagnoses, prescribes and decides. Cath lab procedures it names
 *    are the cardiologist's own, and the label says so.
 */
export const NOTE_STAND_IN: Partial<Record<LearningLevel, { from: LearningLevel; why: string }>> = {
  6: { from: 4, why: 'the same RN license and scope, written for the cath lab' },
  7: { from: 5, why: 'a physician’s view; cath lab procedures in it are the cardiologist’s' },
};

export interface RoleNote {
  text: string;
  /** the role the note was written for: the learner's own, or the stand-in's */
  from: LearningLevel;
  /** null for the learner's own note; for a stand-in, the line that says whose note it is and why */
  standIn: string | null;
}

/**
 * The note for this role from an item's per-role notes (`levelNotes`, a case study's `roleBriefs`), which are
 * positional: [EMT, Paramedic, Cath lab tech, Cath lab RN, Cardiologist, ER nurse, ER doctor]. Until an item has the
 * ER notes, the ER nurse and ER doctor get the stand-in's note, labelled (NOTE_STAND_IN). Null when there is none.
 */
export function levelNote(notes: readonly string[] | undefined, level: LearningLevel): RoleNote | null {
  const own = notes?.[level - 1]?.trim();
  if (own) return { text: own, from: level, standIn: null };
  const s = NOTE_STAND_IN[level];
  const other = s ? notes?.[s.from - 1]?.trim() : undefined;
  if (!s || !other) return null;
  return { text: other, from: s.from, standIn: `Not written for the ${LEVEL_LABELS[level].short} yet — this is the ${LEVEL_LABELS[s.from].short} note (${s.why})` };
}

// ─── Case-study decisions ──────────────────────────────────────────────────

/** the emergency department's roles: a decision made in the ED is theirs, whoever owns it in the other settings */
const ED_ROLES: readonly LearningLevel[] = [6, 7];

/**
 * Whose decision this is, as the learner should see it: the learner's own role when it owns the decision (`owner`) or
 * owns it too (`alsoOwner`). An ER learner sees the ED owner of a decision made in the ED (the ER doctor reads the
 * triage nurse's decision as the ER nurse's, not the cath lab RN's), and every other role sees `owner` as written, so
 * the first five roles read every case as before. Undefined when the decision names no owner.
 */
export function decisionOwner(d: Pick<CaseDecision, 'owner' | 'alsoOwner'>, level: LearningLevel): LearningLevel | undefined {
  if (d.owner === undefined) return undefined;
  if (d.owner === level || d.alsoOwner?.includes(level)) return level;
  if (ED_ROLES.includes(level)) {
    const ed = d.alsoOwner?.find((r) => ED_ROLES.includes(r));
    if (ed !== undefined) return ed;
  }
  return d.owner;
}

// ─── The quiz ──────────────────────────────────────────────────────────────

/** ALS questions the cath lab staff are certified in too (ACLS, rhythms, the ECG, drugs) */
const ACLS_TOPICS = ['acls', 'rhythm-id', 'ecg', 'pharmacology'];

/**
 * Does this quiz question suit this role? A question's level is the role it is written for first; the roles are not a
 * ladder, so each one is spelled out:
 *  - EMT: BLS (level 1). Paramedic: BLS and ALS (1–2).
 *  - Cath lab tech: BLS, the tech's questions (3) and the ALS questions on ACLS, rhythms, the ECG and drugs.
 *    Cath lab RN: the same plus the nurse's questions (4).
 *  - Cardiologist: every question.
 *  - ER nurse: BLS, ALS, the hospital nurse's questions (4) and the ER nurse's own (6) — not the cath lab tech's
 *    or the cardiologist's.
 *  - ER doctor: BLS, ALS, the nurse's questions, both ER levels (6–7), and the cardiologist's questions marked
 *    `alsoFor` the ER doctor (acute care) — not cath lab, EP or structural work.
 *  - Any role also gets the questions whose `alsoFor` names it.
 */
export function quizForRole(q: Pick<QuizQuestion, 'level' | 'topic' | 'alsoFor'>, role: LearningLevel): boolean {
  if (q.alsoFor?.includes(role)) return true;
  switch (role) {
    case 1: return q.level === 1;
    case 2: return q.level === 1 || q.level === 2;
    case 3: return q.level === 1 || q.level === 3 || (q.level === 2 && ACLS_TOPICS.includes(q.topic));
    case 4: return q.level === 1 || q.level === 3 || q.level === 4 || (q.level === 2 && ACLS_TOPICS.includes(q.topic));
    case 5: return true;
    case 6: return q.level === 1 || q.level === 2 || q.level === 4 || q.level === 6;
    case 7: return q.level === 1 || q.level === 2 || q.level === 4 || q.level === 6 || q.level === 7;
  }
}

// ─── Search ────────────────────────────────────────────────────────────────

export type SearchKind = 'structure' | 'condition' | 'procedure' | 'medication' | 'cathlab' | 'case' | 'lesson' | 'tool' | 'simcase' | 'term';

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

/** Something to find that is not a library page: a tool, a simulator case, a glossary term */
export interface SearchExtra {
  kind: 'tool' | 'simcase' | 'term';
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
  // the brand names patients say for the drugs that rule out a nitrate (nitroglycerin label): PDE-5 inhibitors and riociguat
  // (the final s is optional: a search also tries each word without it, "cialis" as "ciali")
  [/\b(?:viagra|revatio)\b/g, 'sildenafil'],
  [/\b(?:cialis?|adcirca)\b/g, 'tadalafil'],
  [/\blevitra\b/g, 'vardenafil'],
  [/\bstendra\b/g, 'avanafil'],
  [/\badempas?\b/g, 'riociguat'],
  [/\b(?:coke|crack)\b/g, 'cocaine'],
  // short drug names, the lytics as a class, and the procedures by the verb or another name
  [/\bamio\b/g, 'amiodarone'],
  [/\bdilt\b/g, 'diltiazem'],
  [/\bbicarb\b/g, 'sodium bicarbonate'],
  [/\br?t-?pa\b/g, 'alteplase'],
  [/\b(?:thrombolytics?|fibrinolytics?|lytics?)\b/g, 'tenecteplase'],
  [/\bcardiovert\w*\b/g, 'cardioversion'],
  [/\b(?:bi-?pap|niv|non-?invasive\s+(?:positive[\s-]+pressure\s+)?ventilation)\b/g, 'cpap'],
  // the verb for the rapid sequence intubation page ("when should I not intubate?")
  [/\bintubat(?:e|es|ed|ing)\b/g, 'intubation'],
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
    // a tool named in the query is very likely what was wanted; a glossary term comes just after the library page of the same name
    if (sc) hits.push({ kind: x.kind, id: x.id, name: x.name, sub: x.sub, score: sc + (x.kind === 'tool' ? 2 : x.kind === 'term' ? -0.2 : 0) });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
