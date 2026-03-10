'use client';

import React, { useState, useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useSceneStore } from '@/store/useSceneStore';
import { useConditionStore } from '@/store/useConditionStore';
import { useProcedureStore } from '@/store/useProcedureStore';
import { useCaseStore } from '@/store/useCaseStore';

type PanelTab = 'anatomy' | 'coronary' | 'conduction' | 'conditions' | 'procedures' | 'cases';

// Anatomical structure tree (simplified for initial render; full data loaded from JSON)
const ANATOMY_TREE = [
  {
    category: 'Chambers',
    items: [
      { id: 'right-atrium', name: 'Right Atrium' },
      { id: 'left-atrium', name: 'Left Atrium' },
      { id: 'right-ventricle', name: 'Right Ventricle' },
      { id: 'left-ventricle', name: 'Left Ventricle' },
      { id: 'right-atrial-appendage', name: 'Right Atrial Appendage' },
      { id: 'left-atrial-appendage', name: 'Left Atrial Appendage' },
    ],
  },
  {
    category: 'Septa & Landmarks',
    items: [
      { id: 'interatrial-septum', name: 'Interatrial Septum' },
      { id: 'interventricular-septum', name: 'Interventricular Septum' },
      { id: 'fossa-ovalis', name: 'Fossa Ovalis' },
      { id: 'apex', name: 'Apex' },
      { id: 'base-of-heart', name: 'Base of Heart' },
    ],
  },
  {
    category: 'Valves',
    items: [
      { id: 'mitral-annulus', name: 'Mitral Valve' },
      { id: 'aortic-valve-rcc', name: 'Aortic Valve' },
      { id: 'tricuspid-annulus', name: 'Tricuspid Valve' },
      { id: 'pulmonary-valve-cusps', name: 'Pulmonary Valve' },
    ],
  },
  {
    category: 'Great Vessels',
    items: [
      { id: 'ascending-aorta', name: 'Ascending Aorta' },
      { id: 'aortic-arch', name: 'Aortic Arch' },
      { id: 'pulmonary-trunk', name: 'Pulmonary Trunk' },
      { id: 'svc', name: 'Superior Vena Cava' },
      { id: 'ivc', name: 'Inferior Vena Cava' },
    ],
  },
  {
    category: 'Pericardium & Layers',
    items: [
      { id: 'fibrous-pericardium', name: 'Fibrous Pericardium' },
      { id: 'epicardium', name: 'Epicardium' },
      { id: 'myocardium', name: 'Myocardium' },
      { id: 'endocardium', name: 'Endocardium' },
    ],
  },
  {
    category: 'Subvalvular',
    items: [
      { id: 'anterolateral-papillary-muscle', name: 'AL Papillary Muscle' },
      { id: 'posteromedial-papillary-muscle', name: 'PM Papillary Muscle' },
      { id: 'moderator-band', name: 'Moderator Band' },
      { id: 'crista-terminalis', name: 'Crista Terminalis' },
    ],
  },
];

const CORONARY_TREE = [
  {
    category: 'Left Coronary',
    items: [
      { id: 'lmca', name: 'Left Main' },
      { id: 'lad-proximal', name: 'LAD Proximal' },
      { id: 'lad-mid', name: 'LAD Mid' },
      { id: 'lad-distal', name: 'LAD Distal' },
      { id: 'd1', name: 'First Diagonal' },
      { id: 'd2', name: 'Second Diagonal' },
      { id: 'lcx-proximal', name: 'LCx Proximal' },
      { id: 'om1', name: 'OM1' },
      { id: 'om2', name: 'OM2' },
    ],
  },
  {
    category: 'Right Coronary',
    items: [
      { id: 'rca-proximal', name: 'RCA Proximal' },
      { id: 'rca-mid', name: 'RCA Mid' },
      { id: 'rca-distal', name: 'RCA Distal' },
      { id: 'pda', name: 'PDA' },
      { id: 'am-branch', name: 'Acute Marginal' },
    ],
  },
];

const CONDUCTION_TREE = [
  { id: 'sa-node', name: 'SA Node' },
  { id: 'av-node', name: 'AV Node' },
  { id: 'bundle-of-his', name: 'Bundle of His' },
  { id: 'right-bundle-branch', name: 'Right Bundle' },
  { id: 'left-bundle-branch', name: 'Left Bundle' },
  { id: 'left-anterior-fascicle', name: 'Left Anterior Fascicle' },
  { id: 'left-posterior-fascicle', name: 'Left Posterior Fascicle' },
  { id: 'purkinje-network-rv', name: 'Purkinje (RV)' },
  { id: 'purkinje-network-lv', name: 'Purkinje (LV)' },
];

const CONDITION_CATEGORIES = [
  { cat: 'Rhythm Disorders', ids: ['normal-sinus-rhythm', 'sinus-bradycardia', 'sinus-tachycardia', 'atrial-fibrillation', 'atrial-flutter', 'avnrt', 'wpw-syndrome'] },
  { cat: 'AV Block', ids: ['first-degree-av-block', 'mobitz-type-i', 'mobitz-type-ii', 'third-degree-av-block'] },
  { cat: 'Bundle Branch Blocks', ids: ['right-bundle-branch-block', 'left-bundle-branch-block', 'bifascicular-block'] },
  { cat: 'Ventricular', ids: ['pvcs', 'monomorphic-vt', 'ventricular-fibrillation', 'torsades-de-pointes'] },
  { cat: 'Ischemia / MI', ids: ['anterior-stemi', 'inferior-stemi', 'lateral-stemi', 'nstemi', 'wellens-pattern'] },
  { cat: 'Cardiomyopathies', ids: ['dilated-cardiomyopathy', 'hcm', 'takotsubo'] },
  { cat: 'Heart Failure', ids: ['hfref', 'hfpef', 'cardiogenic-shock'] },
  { cat: 'Valvular', ids: ['aortic-stenosis', 'mitral-regurgitation', 'mitral-stenosis'] },
  { cat: 'Pericardial', ids: ['acute-pericarditis', 'cardiac-tamponade'] },
  { cat: 'Congenital', ids: ['asd', 'vsd', 'pfo'] },
];

const PROCEDURE_LIST = [
  { id: 'coronary-angiography', name: 'Coronary Angiography' },
  { id: 'pci', name: 'PCI' },
  { id: 'right-heart-catheterization', name: 'Right Heart Cath' },
  { id: 'ep-study', name: 'EP Study' },
  { id: 'catheter-ablation', name: 'Catheter Ablation' },
  { id: 'pacemaker-implantation', name: 'Pacemaker' },
  { id: 'icd-implantation', name: 'ICD' },
  { id: 'crt-implantation', name: 'CRT' },
  { id: 'tavr', name: 'TAVR' },
  { id: 'mitraclip-teer', name: 'MitraClip / TEER' },
  { id: 'asd-closure', name: 'ASD Closure' },
  { id: 'laa-occlusion', name: 'LAA Occlusion' },
  { id: 'pericardiocentesis', name: 'Pericardiocentesis' },
  { id: 'cardioversion', name: 'Cardioversion' },
  { id: 'defibrillation', name: 'Defibrillation' },
];

const CASE_LIST = [
  { id: 'chest-pain-acs', name: 'Chest Pain / ACS', diff: 'beginner' },
  { id: 'stemi-activation', name: 'STEMI Activation', diff: 'intermediate' },
  { id: 'unstable-svt', name: 'Unstable SVT', diff: 'intermediate' },
  { id: 'bradycardia-with-shock', name: 'Bradycardia with Shock', diff: 'advanced' },
  { id: 'vt-storm', name: 'VT Storm', diff: 'expert' },
  { id: 'tamponade', name: 'Cardiac Tamponade', diff: 'advanced' },
  { id: 'pe-presentation', name: 'Pulmonary Embolism', diff: 'intermediate' },
  { id: 'aortic-dissection', name: 'Aortic Dissection', diff: 'advanced' },
  { id: 'cardiogenic-shock', name: 'Cardiogenic Shock', diff: 'expert' },
];

export default function LeftPanel() {
  const [activeTab, setActiveTab] = useState<PanelTab>('anatomy');
  const { leftPanelOpen, searchQuery, mode } = useAppStore();
  const { selectStructure, selectedStructureId } = useSceneStore();
  const { selectCondition, selectedConditionId } = useConditionStore();
  const { selectProcedure, selectedProcedureId } = useProcedureStore();
  const { startCase, activeCaseId } = useCaseStore();

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Chambers']));

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  if (!leftPanelOpen) return null;

  const tabs: { value: PanelTab; label: string }[] = [
    { value: 'anatomy', label: 'Anatomy' },
    { value: 'coronary', label: 'Coronary' },
    { value: 'conduction', label: 'Conduct.' },
    { value: 'conditions', label: 'Conditions' },
    { value: 'procedures', label: 'Procedures' },
    { value: 'cases', label: 'Cases' },
  ];

  return (
    <aside className="w-64 bg-cardiac-panel border-r border-slate-700 flex flex-col shrink-0 overflow-hidden">
      {/* Tab selector */}
      <div className="flex border-b border-slate-700 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-2 py-2 text-xs whitespace-nowrap transition-colors ${
              activeTab === tab.value
                ? 'text-cardiac-accent border-b-2 border-cardiac-accent'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2 text-xs">
        {activeTab === 'anatomy' && (
          <div className="space-y-1">
            {ANATOMY_TREE.map((group) => (
              <div key={group.category}>
                <button
                  onClick={() => toggleCategory(group.category)}
                  className="w-full flex items-center gap-1 px-2 py-1.5 text-slate-300 hover:text-white font-medium"
                >
                  <span className="text-[10px]">{expandedCategories.has(group.category) ? '▼' : '▶'}</span>
                  {group.category}
                </button>
                {expandedCategories.has(group.category) && (
                  <div className="ml-3 space-y-0.5">
                    {group.items
                      .filter((item) => !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map((item) => (
                        <button
                          key={item.id}
                          onClick={() => selectStructure(item.id)}
                          className={`w-full text-left px-2 py-1 rounded transition-colors ${
                            selectedStructureId === item.id
                              ? 'bg-cardiac-accent/20 text-cardiac-accent'
                              : 'text-slate-400 hover:text-white hover:bg-cardiac-surface'
                          }`}
                        >
                          {item.name}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'coronary' && (
          <div className="space-y-1">
            {CORONARY_TREE.map((group) => (
              <div key={group.category}>
                <button
                  onClick={() => toggleCategory(group.category)}
                  className="w-full flex items-center gap-1 px-2 py-1.5 text-slate-300 hover:text-white font-medium"
                >
                  <span className="text-[10px]">{expandedCategories.has(group.category) ? '▼' : '▶'}</span>
                  {group.category}
                </button>
                {expandedCategories.has(group.category) && (
                  <div className="ml-3 space-y-0.5">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => selectStructure(item.id)}
                        className={`w-full text-left px-2 py-1 rounded transition-colors ${
                          selectedStructureId === item.id
                            ? 'bg-cardiac-red/20 text-cardiac-red'
                            : 'text-slate-400 hover:text-white hover:bg-cardiac-surface'
                        }`}
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'conduction' && (
          <div className="space-y-0.5">
            {CONDUCTION_TREE.map((item) => (
              <button
                key={item.id}
                onClick={() => selectStructure(item.id)}
                className={`w-full text-left px-2 py-1.5 rounded transition-colors ${
                  selectedStructureId === item.id
                    ? 'bg-cardiac-conduction/20 text-cardiac-conduction'
                    : 'text-slate-400 hover:text-white hover:bg-cardiac-surface'
                }`}
              >
                {item.name}
              </button>
            ))}
          </div>
        )}

        {activeTab === 'conditions' && (
          <div className="space-y-1">
            {CONDITION_CATEGORIES.map((group) => (
              <div key={group.cat}>
                <button
                  onClick={() => toggleCategory(group.cat)}
                  className="w-full flex items-center gap-1 px-2 py-1.5 text-slate-300 hover:text-white font-medium"
                >
                  <span className="text-[10px]">{expandedCategories.has(group.cat) ? '▼' : '▶'}</span>
                  {group.cat}
                </button>
                {expandedCategories.has(group.cat) && (
                  <div className="ml-3 space-y-0.5">
                    {group.ids
                      .filter((id) => !searchQuery || id.includes(searchQuery.toLowerCase()))
                      .map((id) => (
                        <button
                          key={id}
                          onClick={() => selectCondition(id)}
                          className={`w-full text-left px-2 py-1 rounded transition-colors capitalize ${
                            selectedConditionId === id
                              ? 'bg-cardiac-accent/20 text-cardiac-accent'
                              : 'text-slate-400 hover:text-white hover:bg-cardiac-surface'
                          }`}
                        >
                          {id.replace(/-/g, ' ')}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'procedures' && (
          <div className="space-y-0.5">
            {PROCEDURE_LIST.map((proc) => (
              <button
                key={proc.id}
                onClick={() => selectProcedure(proc.id)}
                className={`w-full text-left px-2 py-1.5 rounded transition-colors ${
                  selectedProcedureId === proc.id
                    ? 'bg-cardiac-accent/20 text-cardiac-accent'
                    : 'text-slate-400 hover:text-white hover:bg-cardiac-surface'
                }`}
              >
                {proc.name}
              </button>
            ))}
          </div>
        )}

        {activeTab === 'cases' && (
          <div className="space-y-0.5">
            {CASE_LIST.map((c) => (
              <button
                key={c.id}
                onClick={() => startCase(c.id, 'initial')}
                className={`w-full text-left px-2 py-1.5 rounded transition-colors ${
                  activeCaseId === c.id
                    ? 'bg-cardiac-accent/20 text-cardiac-accent'
                    : 'text-slate-400 hover:text-white hover:bg-cardiac-surface'
                }`}
              >
                <span>{c.name}</span>
                <span className={`ml-1 text-[10px] ${
                  c.diff === 'beginner' ? 'text-green-400' :
                  c.diff === 'intermediate' ? 'text-yellow-400' :
                  c.diff === 'advanced' ? 'text-orange-400' : 'text-red-400'
                }`}>
                  ({c.diff})
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
