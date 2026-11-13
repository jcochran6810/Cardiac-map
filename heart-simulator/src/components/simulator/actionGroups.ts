/**
 * Smaller groups inside the case simulator's biggest action categories, so a category page is a short list of
 * groups to open rather than one long scroll (a cath lab cardiologist has over forty medications). Purely a way to
 * find an action: the engine never reads it. An action not listed here falls into "Other" in its category.
 */
import type { Category, Intervention } from '@/lib/sim/scenario/types';

interface Group { label: string; ids: string[] }

const SUBGROUPS: Partial<Record<Category, Group[]>> = {
  meds: [
    { label: 'Cardiac arrest', ids: ['epinephrine', 'amio-arrest', 'lidocaine'] },
    { label: 'Heart rhythm', ids: ['adenosine6', 'adenosine12', 'diltiazem', 'metoprolol', 'amio-infusion', 'procainamide', 'magnesium-sulfate', 'atropine'] },
    { label: 'Chest pain & clots', ids: ['aspirin', 'nitro', 'nitro-high', 'p2y12', 'cangrelor', 'heparin', 'bivalirudin', 'gp2b3a', 'tnk', 'protamine'] },
    { label: 'Pressure & shock', ids: ['push-epi', 'pressor', 'phenylephrine'] },
    { label: 'Breathing & allergy', ids: ['albuterol', 'epi-im', 'diphenhydramine', 'steroid'] },
    { label: 'Electrolytes, antidotes & glucose', ids: ['calcium-chloride', 'sodium-bicarbonate', 'insulin-dextrose', 'albuterol-hyperk', 'glucagon', 'oral-glucose', 'dextrose'] },
    { label: 'Pain, nausea & sedation', ids: ['fentanyl', 'sedation', 'midazolam', 'ondansetron'] },
    { label: 'Through the catheter', ids: ['radial-cocktail', 'ic-nitro', 'ic-adenosine', 'ic-verapamil', 'ic-nitroprusside', 'ic-epinephrine', 'adenosine-iv-ffr'] },
  ],
  devices: [
    { label: 'Diagnostic catheters', ids: ['cath-tiger', 'cath-jl4', 'cath-jr4', 'cath-pigtail'] },
    { label: 'Guides and wires', ids: ['guide-ebu', 'guide-jr4', 'guide-al1', 'wire-workhorse', 'wire-hydrophilic'] },
    { label: 'Balloons, stents and clot', ids: ['aspiration', 'balloon-predil', 'stent-des', 'balloon-nc', 'stent-covered', 'balloon-tamponade'] },
    { label: 'Pumps and pacing', ids: ['iabp', 'impella', 'temp-wire'] },
  ],
  imaging: [
    { label: 'Views of the left coronary', ids: ['view-rao-caudal', 'view-rao-cranial', 'view-ap-cranial', 'view-lao-cranial', 'view-lao-caudal'] },
    { label: 'Views of the right coronary', ids: ['view-rca-lao', 'view-rca-rao', 'view-rca-cranial'] },
    { label: 'Runs, physiology and imaging', ids: ['angio', 'lv-gram', 'final-angio', 'stop-contrast', 'ffr-equalize', 'ffr', 'ivus', 'oct'] },
  ],
}

/** a category with no more than this many actions reads well as one list */
const FLAT_UP_TO = 10;

/**
 * The groups to show on a category page, in order, each with the learner's actions in it (empty groups left out,
 * unlisted actions in "Other"); null when the category is short enough to show as one list.
 */
export function groupActions(category: Category, items: Intervention[]): { label: string; items: Intervention[] }[] | null {
  const groups = SUBGROUPS[category];
  if (!groups || items.length <= FLAT_UP_TO) return null;
  const used = new Set<string>();
  const out = groups.map((g) => {
    const its = items.filter((i) => g.ids.includes(i.id));
    its.forEach((i) => used.add(i.id));
    return { label: g.label, items: its };
  });
  const rest = items.filter((i) => !used.has(i.id));
  if (rest.length) out.push({ label: 'Other', items: rest });
  const shown = out.filter((g) => g.items.length > 0);
  return shown.length > 1 ? shown : null;
}
