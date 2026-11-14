/**
 * Built-in safety rules for the actions added after the first rule files: the heparin top-up, and the drugs, positions and
 * team actions the simulator gained with them (each ships with its label contraindications). Within one action the rules
 * are written in their gate order: the first that applies is the one that charges (one dose, one penalty).
 */
import type { Harm } from '../types';
import { did, lastDoneAt } from './helpers';

export const ADDED_RULES: Harm[] = [
  // In the lab extra heparin follows the ACT (the default ACT, or a case's, sets the timer 'actLowAt' when it is low); the
  // emergency department has no ACT: its bolus is followed by the infusion, so every repeat bolus there is unguided
  {
    id: 'heparin-repeat-unguided', actions: ['heparin'],
    when: (s, sc) => did(s, 'heparin') && (sc.setting === 'ed' || !((s.timers.actLowAt ?? -Infinity) > (lastDoneAt(s, ['heparin']) ?? Infinity))),
    points: 5, severity: 'major',
    text: 'Another heparin bolus without a low ACT to guide it. During PCI extra heparin is given to a target ACT — 250–300 s on heparin alone, 200–250 s with a GP IIb/IIIa inhibitor (ACCF/AHA/SCAI PCI guideline): check the ACT first, since an unguided bolus only adds bleeding. In the emergency department the bolus is followed by the infusion, adjusted to the aPTT or anti-Xa level, not by more boluses.',
  },
];
