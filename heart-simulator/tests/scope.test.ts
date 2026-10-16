import { describe, expect, it } from 'vitest';
import { SCOPES, roleOf } from '@/lib/scope';
import { LEVEL_LABELS, type LearningLevel } from '@/store/useAppStore';

const LEVELS: LearningLevel[] = [1, 2, 3, 4, 5];

describe('scope of practice', () => {
  it('defines five distinct roles, one per learning level', () => {
    expect(Object.keys(SCOPES).map(Number)).toEqual(LEVELS);
    for (const l of LEVELS) expect(SCOPES[l].level).toBe(l);
    expect(new Set(LEVELS.map(roleOf)).size).toBe(5);
  });

  it('states what each role may do, may not do, and who it escalates to', () => {
    for (const l of LEVELS) {
      const s = SCOPES[l];
      expect(s.can.length, s.role).toBeGreaterThan(0);
      expect(s.mustNot.length, s.role).toBeGreaterThan(0);
      expect(s.escalateTo.trim(), s.role).not.toBe('');
      expect(s.framework.trim(), s.role).not.toBe('');
    }
  });

  it('matches the role names shown in the top bar', () => {
    for (const l of LEVELS) expect(LEVEL_LABELS[l].short.toLowerCase()).toContain(roleOf(l).split(' ')[0].toLowerCase());
  });
});
