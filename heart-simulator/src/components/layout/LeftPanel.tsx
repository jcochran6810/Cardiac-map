'use client';

import React, { useState, useMemo } from 'react';
import { useAppStore, PanelCategory } from '@/store/useAppStore';
import { useSceneStore } from '@/store/useSceneStore';
import { useConditionStore } from '@/store/useConditionStore';
import { useProcedureStore } from '@/store/useProcedureStore';
import { usePharmacologyStore } from '@/store/usePharmacologyStore';
import { useCaseStore } from '@/store/useCaseStore';
import { useECGStore } from '@/store/useECGStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { useLearningStore } from '@/store/useLearningStore';
import { useIsMobile } from '@/hooks/useIsMobile';
import { CASE_DATA } from '@/data/caseData';
import { CONDITION_DATA } from '@/data/conditionData';
import { PROCEDURE_DATA, PROCEDURES_BY_CATEGORY } from '@/data/procedureData';
import { MEDICATION_DATA, MEDICATIONS_BY_CLASS } from '@/data/medicationData';
import {
  ANATOMY_TREE, CORONARY_TREE, CONDUCTION_TREE, CONDITION_CATEGORIES, CONDITION_SHORT_NAMES, CASE_LIST, NavItem,
} from '@/data/navigation';

const TABS: { value: PanelCategory; label: string }[] = [
  { value: 'anatomy', label: 'Anatomy' },
  { value: 'coronary', label: 'Coronary' },
  { value: 'conduction', label: 'Conduct.' },
  { value: 'conditions', label: 'Conditions' },
  { value: 'procedures', label: 'Procedures' },
  { value: 'medications', label: 'Meds' },
  { value: 'cases', label: 'Cases' },
];

const matches = (name: string, q: string) => !q || name.toLowerCase().includes(q);

export default function LeftPanel({ style }: { style?: React.CSSProperties }) {
  const { leftPanelOpen, searchQuery, activePanelCategory, setActivePanelCategory, compareMode, setViewMode, setMobileView } = useAppStore();
  const isMobile = useIsMobile();
  const showInfo = () => { if (isMobile) setMobileView('info'); };
  const activeTab = activePanelCategory;
  const { selectStructure, selectedStructureId, setMultiSelect, setCameraPresetByLabel } = useSceneStore();
  const { selectCondition, selectedConditionId, setCompareCondition, compareConditionId } = useConditionStore();
  const { selectProcedure, selectedProcedureId } = useProcedureStore();
  const { selectMedication, selectedMedicationId } = usePharmacologyStore();
  const { startCase, activeCaseId } = useCaseStore();
  const { setActiveProfile, setCompareProfile } = useECGStore();
  const { setHeartRate, refresh } = useTimelineStore();
  const learning = useLearningStore();

  const q = searchQuery.trim().toLowerCase();

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Chambers', 'Left Coronary', 'Rhythm Disorders', 'Cath Lab', 'Antiplatelet']));

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };
  // While searching, every group is expanded so matches are visible
  const isExpanded = (cat: string) => q.length > 0 || expandedCategories.has(cat);

  // ─── Selection handlers: each one syncs the 3D scene, the ECG and progress ───
  const handleSelectStructure = (id: string) => {
    selectStructure(id);
    setMultiSelect([]);
    learning.markStructureViewed(id);
    showInfo();
  };

  const handleSelectCondition = (id: string) => {
    const info = CONDITION_DATA[id];
    if (compareMode && selectedConditionId && selectedConditionId !== id) {
      // Compare mode: overlay this condition's ECG on top of the current one
      setCompareCondition(id);
      setCompareProfile(info?.ecgProfile ?? null);
      return;
    }
    selectCondition(id);
    setCompareCondition(null);
    setCompareProfile(null);
    selectStructure(null);
    if (info) {
      setActiveProfile(info.ecgProfile);
      if (info.heartRate) setHeartRate(info.heartRate);
      setMultiSelect(info.affectedAnatomy);
    }
    refresh();
    learning.markConditionStudied(id);
    showInfo();
  };

  const handleSelectProcedure = (id: string) => {
    const info = PROCEDURE_DATA[id];
    selectProcedure(id);
    selectStructure(null);
    if (info) {
      setMultiSelect(info.anatomyTargets);
      if (info.viewMode) setViewMode(info.viewMode);
      if (info.ecgProfile) { setActiveProfile(info.ecgProfile); refresh(); }
      const firstView = info.steps.find((s) => s.view)?.view;
      if (firstView) setCameraPresetByLabel(firstView);
    }
    learning.markProcedureReviewed(id);
    showInfo();
  };

  const handleSelectMedication = (id: string) => {
    selectMedication(id);
    learning.markMedicationViewed(id);
    showInfo();
  };

  const handleSelectCase = (id: string) => {
    startCase(id, 'initial');
    selectStructure(null);
    const caseInfo = CASE_DATA[id];
    if (caseInfo) {
      setActiveProfile(caseInfo.ecgProfile);
      setHeartRate(caseInfo.heartRate);
      refresh();
    }
    setMultiSelect([]);
    showInfo();
  };

  const filteredConditionGroups = useMemo(() => CONDITION_CATEGORIES.map((g) => ({
    cat: g.cat,
    ids: g.ids.filter((id) => {
      const c = CONDITION_DATA[id];
      return matches(CONDITION_SHORT_NAMES[id] ?? id, q) || matches(c?.title ?? '', q) || matches(c?.category ?? '', q);
    }),
  })).filter((g) => g.ids.length > 0), [q]);

  const filteredProcedureGroups = useMemo(() => PROCEDURES_BY_CATEGORY.map((g) => ({
    cat: g.cat,
    items: g.items.filter((p) => matches(p.name, q) || matches(g.cat, q)),
  })).filter((g) => g.items.length > 0), [q]);

  const filteredMedicationGroups = useMemo(() => MEDICATIONS_BY_CLASS.map((g) => ({
    cat: g.cat,
    items: g.items.filter((m) => {
      const med = MEDICATION_DATA[m.id];
      return matches(m.name, q) || matches(g.cat, q) || med.brandNames.some((b) => matches(b, q));
    }),
  })).filter((g) => g.items.length > 0), [q]);

  if (!leftPanelOpen) return null;

  const renderGroupHeader = (cat: string, count?: number) => (
    <button
      onClick={() => toggleCategory(cat)}
      className="w-full flex items-center gap-1 px-2 py-1.5 text-slate-300 hover:text-white font-medium"
    >
      <span className="text-[10px]">{isExpanded(cat) ? '▼' : '▶'}</span>
      <span className="truncate">{cat}</span>
      {count !== undefined && <span className="ml-auto text-[10px] text-slate-600">{count}</span>}
    </button>
  );

  const renderItem = (item: NavItem, selected: boolean, onClick: () => void, viewed: boolean, activeClass = 'bg-cardiac-accent/20 text-cardiac-accent') => (
    <button
      key={item.id}
      onClick={onClick}
      title={item.name}
      className={`w-full text-left px-2 py-1.5 sm:py-1 min-h-[32px] sm:min-h-0 rounded transition-colors flex items-center gap-1 ${
        selected ? activeClass : 'text-slate-400 hover:text-white hover:bg-cardiac-surface'
      }`}
    >
      <span className="truncate flex-1">{item.name}</span>
      {viewed && <span className="text-[9px] text-emerald-500/80 shrink-0" title="Viewed">✓</span>}
    </button>
  );

  return (
    <aside style={style} className="bg-cardiac-panel border-r border-slate-700 flex flex-col shrink-0 overflow-hidden">
      {/* Tab selector */}
      <div className="flex border-b border-slate-700 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActivePanelCategory(tab.value)}
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

      {/* Compare-mode hint */}
      {activeTab === 'conditions' && compareMode && (
        <div className="px-2 py-1.5 text-[10px] bg-blue-900/30 text-blue-300 border-b border-blue-800/40">
          Compare mode: click a second condition to overlay its ECG in blue.
          {compareConditionId && <span className="block text-blue-200 mt-0.5">Comparing with {CONDITION_SHORT_NAMES[compareConditionId] ?? compareConditionId}</span>}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2 text-xs">
        {activeTab === 'anatomy' && (
          <div className="space-y-1">
            {ANATOMY_TREE.map((group) => {
              const items = group.items.filter((i) => matches(i.name, q));
              if (items.length === 0) return null;
              return (
                <div key={group.category}>
                  {renderGroupHeader(group.category)}
                  {isExpanded(group.category) && (
                    <div className="ml-3 space-y-0.5">
                      {items.map((item) => renderItem(item, selectedStructureId === item.id, () => handleSelectStructure(item.id), learning.structuresViewed.includes(item.id)))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'coronary' && (
          <div className="space-y-1">
            {CORONARY_TREE.map((group) => {
              const items = group.items.filter((i) => matches(i.name, q));
              if (items.length === 0) return null;
              return (
                <div key={group.category}>
                  {renderGroupHeader(group.category)}
                  {isExpanded(group.category) && (
                    <div className="ml-3 space-y-0.5">
                      {items.map((item) => renderItem(item, selectedStructureId === item.id, () => handleSelectStructure(item.id), learning.structuresViewed.includes(item.id), 'bg-cardiac-red/20 text-cardiac-red'))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'conduction' && (
          <div className="space-y-0.5">
            {CONDUCTION_TREE.filter((i) => matches(i.name, q)).map((item) =>
              renderItem(item, selectedStructureId === item.id, () => handleSelectStructure(item.id), learning.structuresViewed.includes(item.id), 'bg-cardiac-conduction/20 text-cardiac-conduction'),
            )}
          </div>
        )}

        {activeTab === 'conditions' && (
          <div className="space-y-1">
            {filteredConditionGroups.map((group) => (
              <div key={group.cat}>
                {renderGroupHeader(group.cat, group.ids.length)}
                {isExpanded(group.cat) && (
                  <div className="ml-3 space-y-0.5">
                    {group.ids.map((id) => {
                      const isCompare = compareConditionId === id;
                      return renderItem(
                        { id, name: CONDITION_SHORT_NAMES[id] ?? id.replace(/-/g, ' ') },
                        selectedConditionId === id || isCompare,
                        () => handleSelectCondition(id),
                        learning.conditionsStudied.includes(id),
                        isCompare ? 'bg-blue-500/20 text-blue-300' : 'bg-cardiac-accent/20 text-cardiac-accent',
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
            {filteredConditionGroups.length === 0 && <p className="text-slate-500 px-2">No conditions match “{searchQuery}”.</p>}
          </div>
        )}

        {activeTab === 'procedures' && (
          <div className="space-y-1">
            {filteredProcedureGroups.map((group) => (
              <div key={group.cat}>
                {renderGroupHeader(group.cat, group.items.length)}
                {isExpanded(group.cat) && (
                  <div className="ml-3 space-y-0.5">
                    {group.items.map((proc) => renderItem(proc, selectedProcedureId === proc.id, () => handleSelectProcedure(proc.id), learning.proceduresReviewed.includes(proc.id)))}
                  </div>
                )}
              </div>
            ))}
            {filteredProcedureGroups.length === 0 && <p className="text-slate-500 px-2">No procedures match “{searchQuery}”.</p>}
          </div>
        )}

        {activeTab === 'medications' && (
          <div className="space-y-1">
            {filteredMedicationGroups.map((group) => (
              <div key={group.cat}>
                {renderGroupHeader(group.cat, group.items.length)}
                {isExpanded(group.cat) && (
                  <div className="ml-3 space-y-0.5">
                    {group.items.map((med) => renderItem(med, selectedMedicationId === med.id, () => handleSelectMedication(med.id), learning.medicationsViewed.includes(med.id), 'bg-emerald-500/20 text-emerald-300'))}
                  </div>
                )}
              </div>
            ))}
            {filteredMedicationGroups.length === 0 && <p className="text-slate-500 px-2">No medications match “{searchQuery}”.</p>}
          </div>
        )}

        {activeTab === 'cases' && (
          <div className="space-y-0.5">
            {CASE_LIST.filter((c) => matches(c.name, q) || matches(c.diff, q)).map((c) => {
              const done = learning.casesCompleted.includes(c.id);
              const best = learning.caseScores[c.id];
              return (
                <button
                  key={c.id}
                  onClick={() => handleSelectCase(c.id)}
                  className={`w-full text-left px-2 py-1.5 rounded transition-colors ${
                    activeCaseId === c.id
                      ? 'bg-cardiac-accent/20 text-cardiac-accent'
                      : 'text-slate-400 hover:text-white hover:bg-cardiac-surface'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <span className="truncate flex-1">{c.name}</span>
                    {done && <span className="text-[9px] text-emerald-500/80" title={`Best score ${best ?? 0}`}>✓ {best}</span>}
                  </div>
                  <span className={`text-[10px] ${
                    c.diff === 'beginner' ? 'text-green-400' :
                    c.diff === 'intermediate' ? 'text-yellow-400' :
                    c.diff === 'advanced' ? 'text-orange-400' : 'text-red-400'
                  }`}>
                    {c.diff}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
