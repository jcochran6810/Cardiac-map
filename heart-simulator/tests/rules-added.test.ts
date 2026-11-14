/**
 * The built-in rules in rules/added.ts, one block per rule: it fires; it does not fire in the nearest correct state; a
 * case rule with the same id replaces it; and one dose earns one penalty (the gate order within a drug's rules).
 */
import { describe, expect, it } from 'vitest';
import type { Harm, Setting } from '@/lib/sim/scenario/types';
import type { LearningLevel } from '@/store/useAppStore';
import { fixture, penaltyIds } from './ruleFixture';

const SINUS = { profile: 'normal-sinus', hr: 80 };
/** A same-id case rule that never charges: it stands in for the built-in, which must then stay silent */
const exempt = (id: string, actions: string[]): Harm => ({ id, actions, when: () => false, points: 1, severity: 'minor', text: 'Exempt.' });
/** A patient whose case opens with these flags set (a line in, a sheath in) */
const opened = (setting: Setting, role: LearningLevel, flags: string[], over: Partial<Parameters<typeof fixture>[0]> = {}) => fixture({
  setting, role, rhythm: SINUS, ...over,
  extra: { events: [{ id: 'setup', when: () => true, effect: () => ({ flags }) }], ...(over.extra ?? {}) },
});

describe('heparin-repeat-unguided', () => {
  const lab = opened('cathlab', 4, ['iv']);

  it('fires for a second bolus with no low ACT since the first, in the lab; in the ED for every repeat', () => {
    expect(penaltyIds(lab, 4, ['heparin', 'heparin'])).toEqual(['heparin-repeat-unguided']);
    // an ACT checked after the first bolus that was in range is no guide either
    expect(penaltyIds(lab, 4, ['heparin', 'act', 'heparin'])).toEqual(['heparin-repeat-unguided']);
    const ed = opened('ed', 7, ['iv']);
    expect(penaltyIds(ed, 7, ['heparin', 'heparin'])).toEqual(['heparin-repeat-unguided']);
  });

  it('does not fire for the first bolus, or for one a low ACT asked for', () => {
    expect(penaltyIds(lab, 4, ['heparin'])).toEqual([]);
    // the ACT low after the first bolus (the case's own ACT sets the timer): the top-up is guided
    const low = opened('cathlab', 4, ['iv'], { extra: { respond: { act: (s) => ({ say: [['team', 'ACT 186 s.']], flags: ['act'], timers: { actLowAt: s.minute } }) } } });
    expect(penaltyIds(low, 4, ['heparin', 'act', 'heparin'])).toEqual([]);
  });

  it('a same-id case rule replaces it; a case rule listing it in replaces stands in for it while it applies', () => {
    expect(penaltyIds(opened('cathlab', 4, ['iv'], { harms: [exempt('heparin-repeat-unguided', ['heparin'])] }), 4, ['heparin', 'heparin'])).toEqual([]);
    const twice: Harm = { id: 'heparin-twice', actions: ['heparin'], roles: [4], replaces: ['heparin-repeat-unguided'], when: (s) => 'heparin' in s.flags, points: 8, severity: 'major', text: 'Twice.' };
    expect(penaltyIds(opened('cathlab', 4, ['iv'], { harms: [twice] }), 4, ['heparin', 'heparin'])).toEqual(['heparin-twice']);
  });

  it('charges once per case: a third unguided bolus adds nothing', () => {
    expect(penaltyIds(lab, 4, ['heparin', 'heparin', 'heparin'])).toEqual(['heparin-repeat-unguided']);
  });
});
