import { describe, expect, it } from 'vitest';
import { CONDITIONS, MEDICATIONS, PROCEDURES, QUIZ_QUESTIONS, STRUCTURES } from '@/data/content';
import { CASE_DATA } from '@/data/caseData';
import { NOTE_STAND_IN, decisionOwner, levelNote, quizForRole } from '@/lib/content';
import { ROLES, type LearningLevel } from '@/store/useAppStore';
import type { QuizQuestion } from '@/types/content';

/**
 * Per-role notes (levelNotes on every library page, roleBriefs on the case studies) and the quiz, now that there are
 * seven roles. The ER nurse's and ER doctor's notes are written in a separate content phase: until an item has them,
 * levelNote() would give its ER readers a labelled stand-in; since 2026-11-13 every item has all seven notes, and the test
 * below requires them.
 */

const NOTED: { kind: string; id: string; notes: readonly string[] }[] = [
  ...Object.values(STRUCTURES).map((x) => ({ kind: 'structure', id: x.id, notes: x.levelNotes })),
  ...Object.values(CONDITIONS).map((x) => ({ kind: 'condition', id: x.id, notes: x.levelNotes })),
  ...Object.values(PROCEDURES).map((x) => ({ kind: 'procedure', id: x.id, notes: x.levelNotes })),
  ...Object.values(MEDICATIONS).map((x) => ({ kind: 'medication', id: x.id, notes: x.levelNotes })),
  ...Object.values(CASE_DATA).flatMap((x) => (x.roleBriefs ? [{ kind: 'case study', id: x.id, notes: x.roleBriefs }] : [])),
];

const FIVE = ['emt', 'paramedic', 'tech', 'lab rn', 'cardiologist'];
const SEVEN = [...FIVE, 'er nurse', 'er doctor'];

describe('levelNote: one note per role, and a labelled stand-in for the ER roles', () => {
  it('gives each of the first five roles its own note', () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(levelNote(FIVE, level)).toEqual({ text: FIVE[level - 1], from: level, standIn: null });
      expect(levelNote(SEVEN, level)).toEqual({ text: SEVEN[level - 1], from: level, standIn: null });
    }
  });

  it('gives the ER roles their own note once it is written', () => {
    expect(levelNote(SEVEN, 6)).toEqual({ text: 'er nurse', from: 6, standIn: null });
    expect(levelNote(SEVEN, 7)).toEqual({ text: 'er doctor', from: 7, standIn: null });
  });

  it('until then: the cath lab RN stands in for the ER nurse and the cardiologist for the ER doctor, under their own names', () => {
    expect(NOTE_STAND_IN).toEqual({ 6: expect.objectContaining({ from: 4 }), 7: expect.objectContaining({ from: 5 }) });
    const nurse = levelNote(FIVE, 6)!;
    expect(nurse).toMatchObject({ text: 'lab rn', from: 4 });
    expect(nurse.standIn).toMatch(/^Not written for the ER Nurse yet — this is the Cath Lab RN note \(/);
    const doctor = levelNote(FIVE, 7)!;
    expect(doctor).toMatchObject({ text: 'cardiologist', from: 5 });
    expect(doctor.standIn).toMatch(/^Not written for the ER Doctor yet — this is the Cardiologist note \(/);
  });

  it('treats a blank note as missing, and has nothing to show without notes', () => {
    expect(levelNote(undefined, 2)).toBeNull();
    expect(levelNote(undefined, 6)).toBeNull();
    expect(levelNote(['a', 'b', 'c', 'lab rn', 'e', '  ', ''], 6)).toMatchObject({ text: 'lab rn', from: 4 });
    expect(levelNote(['a', '', 'c', 'd', 'e'], 2)).toBeNull();
  });
});

describe('every library page and case study carries five or seven role notes', () => {
  it.each(NOTED.map((n) => [`${n.kind} ${n.id}`, n] as const))('%s', (_, { notes }) => {
    // every page carries all seven roles' notes: a new page must come with its ER nurse and ER doctor notes too
    expect(notes.length).toBe(7);
    for (const note of notes) expect(note.trim().length).toBeGreaterThan(20);
    // every role has something to read, its own note or a labelled stand-in
    for (const level of ROLES) expect(levelNote(notes, level), `role ${level}`).not.toBeNull();
  });
});

describe('ER nurse and ER doctor notes (written in the content phase)', () => {
  const waiting = NOTED.filter((n) => n.notes.length < 7);
  const done = NOTED.filter((n) => n.notes.length === 7);
  // the list of what is still to write: shown as todos, not failures, until the content phase is finished
  for (const n of waiting) it.todo(`${n.kind} ${n.id}: ER nurse and ER doctor notes`);
  if (done.length) {
    it.each(done.map((n) => [`${n.kind} ${n.id}`, n] as const))('%s has its own ER notes', (_, { notes }) => {
      expect(levelNote(notes, 6)?.standIn).toBeNull();
      expect(levelNote(notes, 7)?.standIn).toBeNull();
      // two notes, not one copied into both places
      expect(notes[5]).not.toBe(notes[6]);
    });
  }
});

describe('case-study decisions', () => {
  it('are owned by one of the seven roles', () => {
    for (const c of Object.values(CASE_DATA)) for (const d of c.decisions) if (d.owner !== undefined) expect(ROLES, `${c.id} ${d.id}`).toContain(d.owner);
  });

  const decisions = Object.values(CASE_DATA).flatMap((c) => c.decisions);
  const decision = (id: string) => decisions.find((d) => d.id === id)!;

  it('name real, other roles in alsoOwner, only on decisions that have an owner', () => {
    for (const d of decisions) {
      if (!d.alsoOwner) continue;
      expect(d.owner, d.id).toBeDefined();
      expect(d.alsoOwner.length, d.id).toBeGreaterThan(0);
      for (const r of d.alsoOwner) {
        expect(ROLES, d.id).toContain(r);
        expect(r, d.id).not.toBe(d.owner);
      }
    }
  });

  it('give the ER roles their own ED decisions without re-owning them', () => {
    // the walk-in received under the chest-pain protocol: the cath lab RN's decision as written, the ER nurse's too
    expect(decisionOwner(decision('chest-pain-acs-1'), 4)).toBe(4);
    expect(decisionOwner(decision('chest-pain-acs-1'), 6)).toBe(6);
    // the ER doctor reads it as the ER nurse's, not the cath lab RN's; the cardiologist as before
    expect(decisionOwner(decision('chest-pain-acs-1'), 7)).toBe(6);
    expect(decisionOwner(decision('chest-pain-acs-1'), 5)).toBe(4);
    // triage in the ED: the treating physician is the ER doctor as well as the cardiologist
    expect(decisionOwner(decision('aortic-dissection-1'), 5)).toBe(5);
    expect(decisionOwner(decision('aortic-dissection-1'), 7)).toBe(7);
    expect(decisionOwner(decision('aortic-dissection-1'), 6)).toBe(7);
    expect(decisionOwner(decision('aortic-dissection-1'), 2)).toBe(5);
    for (const id of ['chest-pain-acs-2', 'chest-pain-acs-3', 'tamponade-1', 'tamponade-2', 'tamponade-3', 'pe-presentation-1', 'pe-presentation-2', 'pe-presentation-3', 'aortic-dissection-2', 'aortic-dissection-3', 'cardiogenic-shock-1', 'cardiogenic-shock-2']) {
      expect(decisionOwner(decision(id), 7), id).toBe(7);
    }
    // the cath lab and the ward stay the cardiologist's, for the ER roles too
    for (const id of ['cardiogenic-shock-3', 'cardiogenic-shock-4', 'stemi-activation-4', 'chest-pain-acs-4']) {
      expect(decisionOwner(decision(id), 7), id).toBe(5);
      expect(decisionOwner(decision(id), 6), id).toBe(5);
    }
    expect(decisionOwner({}, 7)).toBeUndefined();
  });

  it('keep every decision owned as written for the first five roles', () => {
    for (const d of decisions) for (const level of [1, 2, 3, 4, 5] as const) expect(decisionOwner(d, level), `${d.id} as ${level}`).toBe(d.owner === level ? level : d.owner);
  });
});

describe('the quiz by role', () => {
  const pool = (role: LearningLevel) => QUIZ_QUESTIONS.filter((q) => quizForRole(q, role));
  const levels = (role: LearningLevel) => new Set(pool(role).map((q) => q.level));

  it('gives every role questions to answer', () => {
    for (const role of ROLES) expect(pool(role).length, `role ${role}`).toBeGreaterThanOrEqual(8);
  });

  it('keeps the first five roles as they were', () => {
    const q = (level: QuizQuestion['level'], topic: QuizQuestion['topic'] = 'anatomy') => ({ level, topic });
    expect(quizForRole(q(1), 1)).toBe(true);
    expect(quizForRole(q(2), 1)).toBe(false);
    expect(quizForRole(q(2), 2)).toBe(true);
    expect(quizForRole(q(3), 2)).toBe(false);
    // cath lab staff: BLS, their own levels and the ALS questions on ACLS, rhythms, the ECG and drugs
    expect(quizForRole(q(2, 'acls'), 3)).toBe(true);
    expect(quizForRole(q(2, 'coronary'), 3)).toBe(false);
    expect(quizForRole(q(4), 3)).toBe(false);
    expect(quizForRole(q(4), 4)).toBe(true);
    expect(quizForRole(q(5), 4)).toBe(false);
    for (const level of ROLES) expect(quizForRole(q(level), 5)).toBe(true);
    // the ER levels are not "above" the cath lab ones
    expect(quizForRole(q(6), 4)).toBe(false);
    expect(quizForRole(q(7), 4)).toBe(false);
  });

  it('gives the ER nurse BLS, ALS, the nurse questions and its own, not the tech or cardiologist questions', () => {
    for (const q of pool(6)) expect([1, 2, 4, 6], q.id).toContain(q.level);
    for (const l of [1, 2, 4]) expect(levels(6).has(l as LearningLevel), `level ${l}`).toBe(true);
    expect(pool(6).some((q) => q.level === 2 && q.topic === 'coronary')).toBe(true);
    expect(quizForRole({ level: 3, topic: 'procedures' }, 6)).toBe(false);
    expect(quizForRole({ level: 5, topic: 'ischemia' }, 6)).toBe(false);
    expect(quizForRole({ level: 7, topic: 'acls' }, 6)).toBe(false);
  });

  it('gives the ER doctor the acute-care cardiologist questions, but not the cath lab, EP or structural ones', () => {
    const doctor = pool(7);
    const cardiology = doctor.filter((q) => q.level === 5);
    expect(cardiology.length).toBeGreaterThan(0);
    for (const q of cardiology) expect(q.alsoFor, q.id).toContain(7);
    for (const id of ['quiz-procedures-02', 'quiz-valvular-03', 'quiz-arrhythmia-04', 'quiz-congenital-02', 'quiz-conduction-03']) {
      expect(doctor.some((q) => q.id === id), id).toBe(false);
    }
    expect(doctor.some((q) => q.level === 3)).toBe(false);
    expect(quizForRole({ level: 6, topic: 'acls' }, 7)).toBe(true);
    expect(quizForRole({ level: 7, topic: 'acls' }, 7)).toBe(true);
  });

  it('names real roles in alsoFor', () => {
    for (const q of QUIZ_QUESTIONS) for (const r of q.alsoFor ?? []) expect(ROLES, q.id).toContain(r);
  });
});
