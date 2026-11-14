import { describe, expect, it } from 'vitest';
import { SCOPES, canUseManualDefib, drugAuthority, roleOf } from '@/lib/scope';
import { LEVEL_LABELS, ROLES, ROLE_SETTING, asLearningLevel, type LearningLevel } from '@/store/useAppStore';

const LEVELS: LearningLevel[] = [1, 2, 3, 4, 5, 6, 7];

describe('scope of practice', () => {
  it('defines seven distinct roles, one per learning level', () => {
    expect(Object.keys(SCOPES).map(Number)).toEqual(LEVELS);
    for (const l of LEVELS) expect(SCOPES[l].level).toBe(l);
    expect(new Set(LEVELS.map(roleOf)).size).toBe(7);
    expect(Object.keys(LEVEL_LABELS).map(Number)).toEqual(LEVELS);
    expect(new Set(LEVELS.map((l) => LEVEL_LABELS[l].short)).size).toBe(7);
  });

  it('lists every role once in the pickers, from the ambulance to the emergency department to the cath lab', () => {
    expect([...ROLES].sort()).toEqual(LEVELS);
    expect(ROLES.map((l) => ROLE_SETTING[l])).toEqual(['field', 'field', 'ed', 'ed', 'cathlab', 'cathlab', 'cathlab']);
  });

  it('reads a saved role back, ER roles included, and nothing else', () => {
    for (const l of LEVELS) {
      expect(asLearningLevel(String(l))).toBe(l);
      expect(asLearningLevel(l)).toBe(l);
    }
    for (const bad of [null, '', ' ', '0', '8', '2.5', 'ER Nurse', 6.5, NaN]) expect(asLearningLevel(bad), String(bad)).toBeNull();
  });

  it('keeps the ER nurse to RN scope and gives the ER doctor the physician procedures', () => {
    const rn = SCOPES[6];
    const md = SCOPES[7];
    expect(rn.framework).toMatch(/Nurse Practice Act/);
    expect(rn.framework).toMatch(/ENA/);
    expect(rn.can.join(' ')).toMatch(/12-lead ECG within 10 minutes/);
    expect(rn.can.join(' ')).toMatch(/standing order/);
    // the bedside-physician rule is for procedural sedation, not every sedative or analgesic given on order
    const sedation = rn.can.filter((c) => /sedation/.test(c));
    expect(sedation.length).toBeGreaterThan(0);
    for (const c of sedation) if (/at the bedside/.test(c)) expect(c).toMatch(/procedural sedation/i);
    // the ED escalates to its own physician and resuscitation team; rapid response teams cover inpatient floors
    expect(rn.escalateTo).toMatch(/ED physician/);
    expect(rn.escalateTo).not.toMatch(/rapid response/i);
    // the physician's procedures and decisions are named as outside the nurse's scope
    const rnMustNot = rn.mustNot.join(' ');
    for (const word of [/diagnosis/, /prescribe/, /intubation/, /central lines/, /pericardiocentesis/, /transvenous pacing/, /fibrinolysis/, /cath lab activation/]) {
      expect(rnMustNot).toMatch(word);
    }
    const mdCan = md.can.join(' ');
    for (const word of [/Diagnosis/, /intubation/, /Central venous/, /procedural sedation/, /pericardiocentesis/, /transvenous pacing/, /fibrinolytic/, /activate the cath lab/, /consult cardiology/]) {
      expect(mdCan).toMatch(word);
    }
    expect(md.framework).toMatch(/ABEM/);
    expect(md.mustNot.join(' ')).toMatch(/PCI/);
    // neither credential reads like an EMS one (the role pickers are found by these names)
    for (const l of [6, 7] as const) expect(SCOPES[l].credential).not.toMatch(/Paramedic|EMT/);
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

describe('the monitor-defibrillator by role', () => {
  it('keeps the EMT to the AED and CPR, and gives every other role the manual functions', () => {
    expect(canUseManualDefib(1)).toBe(false);
    for (const l of [2, 3, 4, 5, 6, 7] as const) expect(canUseManualDefib(l)).toBe(true);
  });

  it('gives the ACLS drugs on the right authority', () => {
    expect(drugAuthority(1)).toBeNull();
    expect(drugAuthority(2)).toMatch(/protocol|medical direction/);
    expect(drugAuthority(3)).toMatch(/physician's order/);
    expect(drugAuthority(4)).toMatch(/order|protocol/);
    expect(drugAuthority(5)).toBe('');
    expect(drugAuthority(6)).toMatch(/order|protocol/);
    // NPs and PAs write ED orders too, as the ER nurse's own scope line says
    expect(drugAuthority(6)).toMatch(/provider's order/);
    expect(drugAuthority(7)).toBe('');
  });
});
