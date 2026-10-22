import type { PanelCategory } from '@/store/useAppStore';

/** The library's sections, in main-menu order: what each is called and what it holds */
export const CATEGORIES: { value: PanelCategory; label: string; short: string; text: string }[] = [
  { value: 'conditions', label: 'Conditions & rhythms', short: 'Conditions', text: 'Rhythms, heart attacks and heart disease — each with its live 12-lead.' },
  { value: 'anatomy', label: 'Anatomy', short: 'Anatomy', text: 'Chambers, valves, great vessels and the layers of the heart.' },
  { value: 'coronary', label: 'Coronary arteries', short: 'Coronary', text: 'The left and right coronary systems and the territories they feed.' },
  { value: 'conduction', label: 'Conduction system', short: 'Conduction', text: 'SA node to Purkinje fibres, in the order they fire.' },
  { value: 'medications', label: 'Drugs', short: 'Drugs', text: 'Doses, uses and cautions for cardiac and resuscitation drugs.' },
  { value: 'procedures', label: 'Procedures', short: 'Procedures', text: 'Cath lab, EP, structural, surgical and bedside procedures, step by step.' },
  { value: 'cathlab', label: 'Cath lab catalog', short: 'Cath lab', text: 'Views, catheters, wires, stents, lab drugs, pressures and complications — and who does what.' },
  { value: 'cases', label: 'Case studies', short: 'Case studies', text: 'Step-by-step decisions with feedback on classic cases.' },
];

export const CATEGORY_BY_VALUE = Object.fromEntries(CATEGORIES.map((c) => [c.value, c])) as Record<PanelCategory, (typeof CATEGORIES)[number]>;
