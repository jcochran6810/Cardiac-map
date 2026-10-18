'use client';

import React, { useMemo, useState } from 'react';
import { useAppStore, type PanelCategory } from '@/store/useAppStore';
import { useSceneStore } from '@/store/useSceneStore';
import { useConditionStore } from '@/store/useConditionStore';
import { useProcedureStore } from '@/store/useProcedureStore';
import { usePharmacologyStore } from '@/store/usePharmacologyStore';
import { useCaseStore } from '@/store/useCaseStore';
import { useCathLabStore } from '@/store/useCathLabStore';
import { useLearningStore } from '@/store/useLearningStore';
import { useContent } from '@/lib/content';
import { openCase, openCathLab, openCondition, openMedication, openProcedure, openStructure } from '@/lib/actions';
import { CASE_DATA } from '@/data/caseData';
import { CATHLAB_GROUPS, CONDITION_IDS, MEDICATION_IDS, PROCEDURE_IDS, STRUCTURE_IDS } from '@/types/content';
import { LANDMARK_BY_ID } from '@/lib/anatomy/landmarks';
import { CONDUCTION_IDS, CORONARY_IDS } from '@/lib/anatomy/categories';
import { IconCheck, IconChevron, IconDownload, IconHelp, IconSearch } from '@/components/ui/icons';
import { InstallButton } from '@/components/ui/InstallApp';

const TABS: { value: PanelCategory; label: string; title: string }[] = [
  { value: 'anatomy', label: 'Anatomy', title: 'Chambers, valves, vessels and layers' },
  { value: 'coronary', label: 'Coronary', title: 'Coronary arteries and territories' },
  { value: 'conduction', label: 'Conduction', title: 'SA node to Purkinje fibres' },
  { value: 'conditions', label: 'Conditions', title: 'Rhythms, ischaemia, structural disease' },
  { value: 'procedures', label: 'Procedures', title: 'Cath lab, EP, structural, surgical, bedside' },
  { value: 'medications', label: 'Drugs', title: 'Cardiac and ACLS pharmacology' },
  { value: 'cathlab', label: 'Cath lab', title: 'Views, catheters, wires, stents, lab drugs, pressures and complications' },
  { value: 'cases', label: 'Cases', title: 'Interactive clinical scenarios' },
];

const ANATOMY_GROUPS: { label: string; group: string }[] = [
  { label: 'Chambers', group: 'chambers' },
  { label: 'Septa & landmarks', group: 'septa' },
  { label: 'Valves', group: 'valves' },
  { label: 'Great vessels', group: 'great-vessels' },
  { label: 'Layers & pericardium', group: 'layers' },
  { label: 'Subvalvular & internal', group: 'subvalvular' },
];

const LEFT_CORONARY = ['lmca', 'lad-proximal', 'lad-mid', 'lad-distal', 'd1', 'd2', 'septal-perforators', 'ramus-intermedius', 'lcx-proximal', 'lcx-distal', 'om1', 'om2'];
const RIGHT_CORONARY = CORONARY_IDS.filter((id) => !LEFT_CORONARY.includes(id));

const MED_GROUPS: { label: string; ids: string[] }[] = [
  { label: 'Antiplatelet, anticoagulant & lytic', ids: ['aspirin', 'clopidogrel', 'ticagrelor', 'prasugrel', 'heparin', 'enoxaparin', 'bivalirudin', 'apixaban', 'warfarin', 'tenecteplase'] },
  { label: 'Anti-ischaemic & analgesia', ids: ['nitroglycerin', 'fentanyl', 'metoprolol', 'esmolol'] },
  { label: 'Antiarrhythmic & rate control', ids: ['adenosine', 'diltiazem', 'amiodarone', 'procainamide', 'lidocaine', 'digoxin', 'magnesium-sulfate'] },
  { label: 'ACLS, pressors & inotropes', ids: ['atropine', 'epinephrine', 'norepinephrine', 'vasopressin', 'phenylephrine', 'dopamine', 'dobutamine', 'milrinone'] },
  { label: 'Heart failure & prevention', ids: ['furosemide', 'lisinopril', 'sacubitril-valsartan', 'spironolactone', 'empagliflozin', 'atorvastatin'] },
  { label: 'Electrolytes & other', ids: ['calcium-chloride', 'sodium-bicarbonate', 'colchicine'] },
];

const DIFF_STYLE: Record<string, string> = {
  beginner: 'text-emerald-400 bg-emerald-500/10',
  intermediate: 'text-yellow-300 bg-yellow-500/10',
  advanced: 'text-orange-300 bg-orange-500/10',
  expert: 'text-red-300 bg-red-500/10',
};

interface Item { id: string; name: string; sub?: string }
interface Group { label: string; items: Item[] }

export default function LeftPanel({ style }: { style?: React.CSSProperties }) {
  const activeTab = useAppStore((s) => s.activePanelCategory);
  const setHelpOpen = useAppStore((s) => s.setHelpOpen);
  const setActiveTab = useAppStore((s) => s.setActivePanelCategory);
  const selectedStructureId = useSceneStore((s) => s.selectedStructureId);
  const selectedConditionId = useConditionStore((s) => s.selectedConditionId);
  const selectedProcedureId = useProcedureStore((s) => s.selectedProcedureId);
  const selectedMedicationId = usePharmacologyStore((s) => s.selectedMedicationId);
  const activeCaseId = useCaseStore((s) => s.activeCaseId);
  const selectedCathLabId = useCathLabStore((s) => s.selectedId);
  const learning = useLearningStore();
  const lib = useContent();
  const [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const nameOf = (id: string) =>
    lib?.structures[id]?.name ?? lib?.conditions[id]?.name ?? lib?.procedures[id]?.name ?? lib?.medications[id]?.name ?? LANDMARK_BY_ID[id]?.name ?? id.replace(/-/g, ' ');

  const groups: Group[] = useMemo(() => {
    const it = (id: string, sub?: string): Item => ({ id, name: nameOf(id), sub });
    switch (activeTab) {
      case 'anatomy':
        return ANATOMY_GROUPS.map((g) => ({
          label: g.label,
          items: STRUCTURE_IDS.filter((id) => !CORONARY_IDS.includes(id) && !CONDUCTION_IDS.includes(id))
            .filter((id) => (lib?.structures[id]?.group ?? guessGroup(id)) === g.group)
            .map((id) => it(id)),
        }));
      case 'coronary':
        return [
          { label: 'Left coronary system', items: LEFT_CORONARY.map((id) => it(id)) },
          { label: 'Right coronary system', items: RIGHT_CORONARY.map((id) => it(id)) },
        ];
      case 'conduction':
        return [{ label: 'Conduction system (in order of activation)', items: CONDUCTION_IDS.map((id) => it(id)) }];
      case 'conditions': {
        const by = new Map<string, Item[]>();
        CONDITION_IDS.forEach((id) => {
          const cat = lib?.conditions[id]?.category ?? 'Conditions';
          if (!by.has(cat)) by.set(cat, []);
          by.get(cat)!.push(it(id));
        });
        return Array.from(by, ([label, items]) => ({ label, items }));
      }
      case 'procedures': {
        const by = new Map<string, Item[]>();
        PROCEDURE_IDS.forEach((id) => {
          const cat = lib?.procedures[id]?.category ?? 'Procedures';
          if (!by.has(cat)) by.set(cat, []);
          by.get(cat)!.push(it(id));
        });
        return Array.from(by, ([label, items]) => ({ label, items }));
      }
      case 'medications':
        return MED_GROUPS.map((g) => ({ label: g.label, items: g.ids.filter((id) => (MEDICATION_IDS as readonly string[]).includes(id)).map((id) => it(id, lib?.medications[id]?.drugClass)) }));
      case 'cathlab':
        return CATHLAB_GROUPS.map((g) => ({ label: g.label, items: Object.values(lib?.cathlab ?? {}).filter((i) => i.group === g.id).map((i) => ({ id: i.id, name: i.name })) }));
      case 'cases':
        return [{ label: 'Clinical scenarios', items: Object.values(CASE_DATA).map((c) => ({ id: c.id, name: c.title, sub: c.difficulty })) }];
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, lib]);

  const f = filter.trim().toLowerCase();
  const visibleGroups = groups
    .map((g) => ({ ...g, items: f ? g.items.filter((i) => i.name.toLowerCase().includes(f) || (i.sub ?? '').toLowerCase().includes(f)) : g.items }))
    .filter((g) => g.items.length > 0);

  const isSelected = (id: string) => {
    switch (activeTab) {
      case 'conditions': return selectedConditionId === id;
      case 'procedures': return selectedProcedureId === id;
      case 'medications': return selectedMedicationId === id;
      case 'cathlab': return selectedCathLabId === id;
      case 'cases': return activeCaseId === id;
      default: return selectedStructureId === id;
    }
  };
  const isDone = (id: string) => {
    switch (activeTab) {
      case 'conditions': return learning.conditionsStudied.includes(id);
      case 'procedures': return learning.proceduresReviewed.includes(id);
      case 'medications': return learning.medicationsReviewed.includes(id);
      case 'cathlab': return learning.cathlabStudied.includes(id);
      case 'cases': return learning.casesCompleted.includes(id);
      default: return learning.structuresViewed.includes(id);
    }
  };
  const open = (id: string) => {
    switch (activeTab) {
      case 'conditions': return openCondition(id);
      case 'procedures': return openProcedure(id);
      case 'medications': return openMedication(id);
      case 'cathlab': return openCathLab(id);
      case 'cases': return openCase(id);
      default: return openStructure(id);
    }
  };

  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const done = groups.reduce((n, g) => n + g.items.filter((i) => isDone(i.id)).length, 0);

  return (
    <aside style={style} className="bg-cardiac-panel border-r border-slate-700 flex flex-col shrink-0 overflow-hidden" aria-label="Navigator">
      <nav className="grid grid-cols-4 gap-0.5 p-1 border-b border-slate-700 shrink-0" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setActiveTab(tab.value); setFilter(''); }}
            title={tab.title}
            role="tab"
            aria-selected={activeTab === tab.value}
            className={`px-0.5 py-1.5 touch:py-2.5 text-[10.5px] leading-none rounded transition-colors whitespace-nowrap overflow-hidden ${
              activeTab === tab.value ? 'bg-cardiac-accent/20 text-cardiac-accent font-semibold' : 'text-slate-400 hover:text-white hover:bg-cardiac-surface'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="px-2 pt-2 pb-1 shrink-0">
        <div className="relative">
          <IconSearch size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`Filter ${TABS.find((t) => t.value === activeTab)?.label.toLowerCase()}…`}
            className="w-full bg-cardiac-dark text-[11px] text-slate-200 rounded pl-6 pr-2 py-1 touch:py-1.5 border border-slate-700 focus:outline-none focus:border-cardiac-accent placeholder-slate-500"
            aria-label="Filter list"
          />
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <div className="flex-1 h-1 rounded-full bg-cardiac-dark overflow-hidden">
            <div className="h-full bg-emerald-500/80 transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
          </div>
          <span className="text-[9px] text-slate-500 whitespace-nowrap">{done}/{total} studied</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 pb-3 text-xs">
        {activeTab === 'cases' && (
          <button
            onClick={() => useAppStore.getState().setMode('simulator')}
            className="mx-1 my-1.5 w-[calc(100%-0.5rem)] text-left p-2 touch:p-2.5 rounded-md border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20"
          >
            <span className="block text-[11px] font-semibold text-amber-100">Want to treat the patient yourself? →</span>
            <span className="block text-[10px] text-amber-200/70 leading-snug mt-0.5">The case simulator runs a full case with your scope&apos;s actions and scores you. These case studies are step-by-step decisions.</span>
          </button>
        )}
        {activeTab === 'cathlab' && (
          <p className="mx-1.5 my-1 text-[10px] text-slate-500 leading-snug">
            Everything the cath lab cases use — what it is, and what the tech, the nurse and the cardiologist each do with it. A view also turns the 3D heart to that angle.
          </p>
        )}
        {activeTab === 'coronary' && (
          <p className="mx-1.5 my-1 text-[10px] text-slate-500 leading-snug">
            Right-dominant anatomy shown (~70–85% of people): the PDA arises from the RCA. Try the <b className="text-slate-300">Territories</b> view.
          </p>
        )}
        {visibleGroups.map((g) => {
          const isCol = collapsed.has(g.label) && !f;
          return (
            <div key={g.label} className="mt-1.5">
              <button
                onClick={() => setCollapsed((prev) => { const n = new Set(prev); if (n.has(g.label)) n.delete(g.label); else n.add(g.label); return n; })}
                className="w-full flex items-center gap-1 px-1.5 py-1 touch:py-2 text-[10px] uppercase tracking-wider text-slate-500 hover:text-slate-300"
                aria-expanded={!isCol}
              >
                <IconChevron size={11} className={`transition-transform ${isCol ? '' : 'rotate-90'}`} />
                {g.label}
                <span className="ml-auto normal-case tracking-normal text-slate-600">{g.items.length}</span>
              </button>
              {!isCol && (
                <ul className="space-y-px">
                  {g.items.map((item) => {
                    const sel = isSelected(item.id);
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => open(item.id)}
                          className={`w-full flex items-center gap-1.5 text-left pl-5 pr-2 py-1.5 touch:py-2.5 rounded transition-colors ${
                            sel ? 'bg-cardiac-accent/15 text-cardiac-accent' : 'text-slate-300 hover:text-white hover:bg-cardiac-surface/70'
                          }`}
                          aria-current={sel ? 'true' : undefined}
                        >
                          <span className="truncate">{item.name}</span>
                          {activeTab === 'cases' && item.sub && (
                            <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded capitalize ${DIFF_STYLE[item.sub] ?? ''}`}>{item.sub}</span>
                          )}
                          {isDone(item.id) && (
                            <IconCheck size={11} className={`${activeTab === 'cases' ? '' : 'ml-auto'} text-emerald-500 shrink-0`} />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
        {visibleGroups.length === 0 && <p className="px-2 py-4 text-slate-500 text-center">Nothing matches “{filter}”.</p>}
      </div>
      <InstallButton className="flex items-center gap-2 px-3 py-3 border-t border-slate-700 text-xs text-emerald-300 hover:text-white shrink-0">
        <IconDownload size={15} /> Install CardioSim on this device
      </InstallButton>
      {/* Small phones have no room for Help in the top bar */}
      <button
        onClick={() => setHelpOpen(true)}
        className="xs:hidden flex items-center gap-2 px-3 py-3 border-t border-slate-700 text-xs text-slate-300 hover:text-white shrink-0"
      >
        <IconHelp size={15} /> Help &amp; guide
      </button>
    </aside>
  );
}

function guessGroup(id: string): string {
  const order: [string, string[]][] = [
    ['chambers', ['right-atrium', 'left-atrium', 'right-ventricle', 'left-ventricle', 'right-atrial-appendage', 'left-atrial-appendage']],
    ['septa', ['interatrial-septum', 'fossa-ovalis', 'interventricular-septum', 'apex', 'base-of-heart']],
    ['valves', ['tricuspid-valve', 'pulmonary-valve', 'mitral-valve', 'aortic-valve']],
    ['great-vessels', ['svc', 'ivc', 'coronary-sinus', 'pulmonary-trunk', 'pulmonary-veins', 'ascending-aorta', 'aortic-arch', 'descending-aorta']],
    ['layers', ['fibrous-pericardium', 'epicardium', 'myocardium', 'endocardium']],
  ];
  for (const [g, ids] of order) if (ids.includes(id)) return g;
  return 'subvalvular';
}
