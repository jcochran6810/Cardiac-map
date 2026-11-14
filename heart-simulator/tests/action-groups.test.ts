import { describe, expect, it } from 'vitest';
import { groupActions } from '@/components/simulator/actionGroups';
import { interventionsFor } from '@/lib/sim/scenario/interventions';
import type { Setting } from '@/lib/sim/scenario/types';
import type { LearningLevel } from '@/store/useAppStore';

const ROLES: [LearningLevel, Setting][] = [[1, 'field'], [2, 'field'], [3, 'cathlab'], [4, 'cathlab'], [5, 'cathlab'], [6, 'ed'], [7, 'ed']];

describe('the action menu groups the big categories', () => {
  it('splits each big category into groups that hold every action exactly once', () => {
    for (const [role, setting] of ROLES) {
      const all = interventionsFor(role, setting);
      for (const cat of ['meds', 'devices', 'imaging'] as const) {
        const items = all.filter((i) => i.category === cat);
        const groups = groupActions(cat, items);
        if (!groups) {
          expect(items.length <= 10 || items.length === 0, `${role} ${cat}`).toBe(true);
          continue;
        }
        const ids = groups.flatMap((g) => g.items.map((i) => i.id));
        expect(ids.sort(), `${role} ${cat}`).toEqual(items.map((i) => i.id).sort());
        expect(groups.every((g) => g.items.length > 0)).toBe(true);
      }
    }
  });

  it('gives a paramedic and a cardiologist their medications in groups, and keeps a short category as one list', () => {
    const para = interventionsFor(2, 'field').filter((i) => i.category === 'meds');
    expect(groupActions('meds', para)?.map((g) => g.label)).toContain('Cardiac arrest');
    const md = interventionsFor(5, 'cathlab').filter((i) => i.category === 'meds');
    expect(groupActions('meds', md)?.map((g) => g.label)).toContain('Through the catheter');
    const assess = interventionsFor(2, 'field').filter((i) => i.category === 'assess');
    expect(groupActions('assess', assess)).toBeNull();
  });
});
