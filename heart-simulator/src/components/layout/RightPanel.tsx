'use client';

import React, { useEffect, useMemo } from 'react';
import { useAppStore, PanelCategory } from '@/store/useAppStore';
import { useSceneStore } from '@/store/useSceneStore';
import { useConditionStore } from '@/store/useConditionStore';
import { useProcedureStore } from '@/store/useProcedureStore';
import { usePharmacologyStore } from '@/store/usePharmacologyStore';
import { useCaseStore } from '@/store/useCaseStore';
import { useLearningStore } from '@/store/useLearningStore';
import { CASE_DATA } from '@/data/caseData';
import { CONDITION_DATA, CONDITION_TAB_FIELDS } from '@/data/conditionData';
import { PROCEDURE_DATA, PROCEDURE_TAB_FIELDS } from '@/data/procedureData';
import { MEDICATION_DATA, MEDICATION_TAB_FIELDS } from '@/data/medicationData';
import { getStructureTitle, getStructureTabContent } from '@/data/structureData';
import { LEVEL_LABELS, CONDITION_SHORT_NAMES } from '@/data/navigation';
import CaseSimulator from '@/components/cases/CaseSimulator';

// ─── Context-sensitive tab configuration ─────────────────────────────
const TABS_BY_CATEGORY: Record<PanelCategory, string[]> = {
  anatomy: ['overview', 'anatomy', 'physiology', 'symptoms', 'ecg', 'imaging', 'medications', 'field-care', 'hospital-care', 'cardiology-care', 'procedure', 'complications', 'teaching'],
  coronary: ['overview', 'anatomy', 'physiology', 'symptoms', 'ecg', 'imaging', 'medications', 'teaching'],
  conduction: ['overview', 'anatomy', 'physiology', 'symptoms', 'ecg', 'imaging', 'medications', 'teaching'],
  conditions: ['overview', 'anatomy', 'pathophysiology', 'symptoms', 'ecg', 'imaging', 'medications', 'field-care', 'hospital-care', 'cardiology-care', 'procedure', 'complications', 'teaching'],
  procedures: ['overview', 'indications', 'anatomy', 'procedure', 'ecg', 'equipment', 'complications', 'teaching'],
  medications: ['overview', 'mechanism', 'indications', 'acls', 'dosing', 'contraindications', 'side-effects', 'ecg', 'hemodynamics', 'monitoring', 'interactions', 'teaching'],
  cases: ['overview', 'simulate', 'symptoms', 'ecg', 'medications', 'field-care', 'hospital-care', 'cardiology-care', 'procedure', 'complications', 'teaching'],
};

/** The care tab most relevant to each learning level — moved next to Overview. */
const LEVEL_PRIORITY_TAB: Record<number, string> = {
  1: 'field-care', 2: 'field-care', 3: 'hospital-care', 4: 'cardiology-care', 5: 'procedure',
};

function orderTabsForLevel(tabs: string[], level: number): string[] {
  const priority = LEVEL_PRIORITY_TAB[level];
  if (!priority || !tabs.includes(priority)) return tabs;
  return ['overview', priority, ...tabs.filter((t) => t !== 'overview' && t !== priority)];
}

const TAB_LABELS: Record<string, string> = {
  'acls': 'ACLS', 'ecg': 'ECG', 'side-effects': 'Side effects', 'simulate': 'Simulate',
};
const tabLabel = (t: string) => TAB_LABELS[t] ?? t.replace(/-/g, ' ');

// ─── Small render helpers ────────────────────────────────────────────
function Bullets({ items, marker = '•', markerClass = 'text-cardiac-accent' }: { items: string[]; marker?: string; markerClass?: string }) {
  return (
    <ul className="space-y-1">
      {items.map((d, i) => (
        <li key={i} className="flex gap-2">
          <span className={`${markerClass} mt-0.5 shrink-0`}>{marker}</span>
          <span className="text-slate-400 leading-relaxed">{d}</span>
        </li>
      ))}
    </ul>
  );
}

function Paragraph({ text }: { text: string }) {
  return (
    <div className="p-2 bg-cardiac-dark rounded">
      <p className="text-slate-400 leading-relaxed">{text}</p>
    </div>
  );
}

function Content({ value }: { value: string | string[] | undefined }) {
  if (!value) return null;
  if (Array.isArray(value)) return <Bullets items={value} />;
  return <Paragraph text={value} />;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h4 className="text-[10px] font-semibold text-cardiac-accent uppercase tracking-wider mb-2 capitalize">{children}</h4>;
}

function LevelBox({ summaries, level }: { summaries: [string, string, string, string, string]; level: number }) {
  return (
    <div className="p-2 rounded-lg border border-cardiac-accent/30 bg-cardiac-accent/5">
      <p className="text-[10px] font-semibold text-cardiac-accent uppercase tracking-wider mb-1">At the {LEVEL_LABELS[level - 1]} level</p>
      <p className="text-slate-300 leading-relaxed">{summaries[level - 1]}</p>
    </div>
  );
}

function Chip({ children, onClick, color = 'accent' }: { children: React.ReactNode; onClick?: () => void; color?: 'accent' | 'blue' | 'green' }) {
  const cls = color === 'blue' ? 'bg-blue-500/15 text-blue-300 hover:bg-blue-500/30' : color === 'green' ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/30' : 'bg-cardiac-accent/15 text-cardiac-accent hover:bg-cardiac-accent/30';
  return (
    <button onClick={onClick} className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${cls}`}>{children}</button>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────
export default function RightPanel({ style }: { style?: React.CSSProperties }) {
  const { rightPanelOpen, rightPanelTab, setRightPanelTab, learningLevel, activePanelCategory, setActivePanelCategory } = useAppStore();
  const { selectedStructureId, selectStructure, setCameraPresetByLabel } = useSceneStore();
  const { selectedConditionId, selectCondition } = useConditionStore();
  const { selectedProcedureId, selectProcedure, currentStepIndex, setStep, nextStep, prevStep } = useProcedureStore();
  const { selectedMedicationId, selectMedication } = usePharmacologyStore();
  const { activeCaseId } = useCaseStore();
  const learning = useLearningStore();

  const activeTabs = useMemo(() => orderTabsForLevel(TABS_BY_CATEGORY[activePanelCategory] || TABS_BY_CATEGORY.anatomy, learningLevel), [activePanelCategory, learningLevel]);
  const tab = activeTabs.includes(rightPanelTab) ? rightPanelTab : 'overview';

  const conditionData = selectedConditionId ? CONDITION_DATA[selectedConditionId] : null;
  const procedureData = selectedProcedureId ? PROCEDURE_DATA[selectedProcedureId] : null;
  const medicationData = selectedMedicationId ? MEDICATION_DATA[selectedMedicationId] : null;
  const caseData = activeCaseId ? CASE_DATA[activeCaseId] : null;

  // Procedure step player: highlight the step's anatomy in the 3D scene and fly the camera
  const currentStep = procedureData ? procedureData.steps[Math.min(currentStepIndex, procedureData.steps.length - 1)] : null;
  useEffect(() => {
    if (activePanelCategory !== 'procedures' || !currentStep) return;
    if (currentStep.anatomyTarget) selectStructure(currentStep.anatomyTarget);
    if (currentStep.view) setCameraPresetByLabel(currentStep.view);
  }, [activePanelCategory, currentStep, selectStructure, setCameraPresetByLabel]);

  if (!rightPanelOpen) return null;

  // Cross-links between the knowledge bases
  const goToProcedure = (id: string) => { selectProcedure(id); learning.markProcedureReviewed(id); setActivePanelCategory('procedures'); };
  const goToMedication = (id: string) => { selectMedication(id); learning.markMedicationViewed(id); setActivePanelCategory('medications'); };
  const goToCondition = (id: string) => { selectCondition(id); learning.markConditionStudied(id); setActivePanelCategory('conditions'); };
  const goToStructure = (id: string) => { selectStructure(id); learning.markStructureViewed(id); setActivePanelCategory('anatomy'); };

  const isStructureCategory = activePanelCategory === 'anatomy' || activePanelCategory === 'coronary' || activePanelCategory === 'conduction';
  const structTitle = isStructureCategory && selectedStructureId ? getStructureTitle(selectedStructureId) : null;
  const structContent = isStructureCategory && selectedStructureId ? getStructureTabContent(selectedStructureId, tab) : [];

  const hasContent =
    (isStructureCategory && !!structTitle) ||
    (activePanelCategory === 'conditions' && !!conditionData) ||
    (activePanelCategory === 'procedures' && !!procedureData) ||
    (activePanelCategory === 'medications' && !!medicationData) ||
    (activePanelCategory === 'cases' && !!caseData);

  return (
    <aside style={style} className="bg-cardiac-panel border-r border-slate-700 flex flex-col shrink-0 overflow-hidden">
      {/* Context-sensitive Tabs */}
      <div className="flex flex-wrap border-b border-slate-700 px-1 py-1 gap-0.5 shrink-0">
        {activeTabs.map((t) => (
          <button
            key={t}
            onClick={() => setRightPanelTab(t)}
            className={`px-2 py-1 text-[10px] rounded capitalize transition-colors ${
              tab === t ? 'bg-cardiac-accent/20 text-cardiac-accent' : 'text-slate-500 hover:text-white'
            } ${t === LEVEL_PRIORITY_TAB[learningLevel] ? 'ring-1 ring-cardiac-accent/30' : ''}`}
            title={t === LEVEL_PRIORITY_TAB[learningLevel] ? `Recommended for the ${LEVEL_LABELS[learningLevel - 1]} level` : undefined}
          >
            {tabLabel(t)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 text-xs text-slate-300 space-y-3">
        {/* Welcome / empty state */}
        {!hasContent && (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">{'♥'}</div>
            <h3 className="text-sm font-semibold text-white mb-2">Cardiac Education Platform</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              {activePanelCategory === 'medications'
                ? 'Select a medication from the left panel to see its mechanism, dosing, ECG effects and cautions.'
                : activePanelCategory === 'cases'
                  ? 'Select a case to read the presentation, then use the Simulate tab to work through it step by step.'
                  : activePanelCategory === 'procedures'
                    ? 'Select a procedure to walk through it step by step; the 3D heart follows each step.'
                    : 'Select a structure, condition, procedure or medication from the left panel to view detailed information.'}
            </p>
            <div className="mt-4 p-3 bg-cardiac-dark rounded-lg text-left">
              <p className="text-cardiac-accent text-[10px] font-semibold mb-1">EDUCATIONAL DISCLAIMER</p>
              <p className="text-slate-500 text-[10px] leading-relaxed">
                This is an educational simulation only. Not intended for diagnosis or treatment. Doses are reference values — follow local protocols.
              </p>
            </div>
            <div className="mt-3 text-slate-500 text-[10px]">
              Current Level: {LEVEL_LABELS[learningLevel - 1]} · Content and tab order adapt to your level.
            </div>
          </div>
        )}

        {/* ─── Structure detail ─── */}
        {isStructureCategory && structTitle && (
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">{structTitle}</h3>
            <SectionHeading>{tabLabel(tab)}</SectionHeading>
            {structContent.length > 0 ? <Bullets items={structContent} /> : <p className="text-slate-500">No content for this tab.</p>}
          </div>
        )}

        {/* ─── Condition detail ─── */}
        {activePanelCategory === 'conditions' && conditionData && (
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-white mb-1">{conditionData.title}</h3>
              <div className="flex flex-wrap gap-1">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cardiac-surface text-slate-300">{conditionData.category}</span>
                {conditionData.heartRate && <span className="text-[10px] px-1.5 py-0.5 rounded bg-cardiac-red/15 text-cardiac-red">typical HR {conditionData.heartRate}</span>}
              </div>
            </div>

            {tab === 'overview' && <LevelBox summaries={conditionData.levelSummaries} level={learningLevel} />}

            <div>
              <SectionHeading>{tabLabel(tab)}</SectionHeading>
              <Content value={conditionData[CONDITION_TAB_FIELDS[tab] ?? 'overview'] as string | string[]} />
            </div>

            {tab === 'overview' && (
              <div className="space-y-2">
                {conditionData.affectedAnatomy.length > 0 && (
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase mb-1">Affected anatomy (highlighted in 3D)</p>
                    <div className="flex flex-wrap gap-1">
                      {conditionData.affectedAnatomy.map((id) => <Chip key={id} onClick={() => goToStructure(id)}>{getStructureTitle(id)}</Chip>)}
                    </div>
                  </div>
                )}
                {conditionData.relatedProcedures.length > 0 && (
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase mb-1">Related procedures</p>
                    <div className="flex flex-wrap gap-1">
                      {conditionData.relatedProcedures.filter((id) => PROCEDURE_DATA[id]).map((id) => <Chip key={id} color="blue" onClick={() => goToProcedure(id)}>{PROCEDURE_DATA[id].name}</Chip>)}
                    </div>
                  </div>
                )}
                {conditionData.relatedMedications.length > 0 && (
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase mb-1">Key medications</p>
                    <div className="flex flex-wrap gap-1">
                      {conditionData.relatedMedications.filter((id) => MEDICATION_DATA[id]).map((id) => <Chip key={id} color="green" onClick={() => goToMedication(id)}>{MEDICATION_DATA[id].name}</Chip>)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── Procedure detail ─── */}
        {activePanelCategory === 'procedures' && procedureData && (
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-white mb-1">{procedureData.name}</h3>
              <div className="flex flex-wrap gap-1">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cardiac-surface text-slate-300">{procedureData.category}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cardiac-surface text-slate-400">Access: {procedureData.accessSite}</span>
              </div>
            </div>

            {tab === 'overview' && <LevelBox summaries={procedureData.levelSummaries} level={learningLevel} />}

            {tab === 'procedure' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <SectionHeading>Step {Math.min(currentStepIndex + 1, procedureData.steps.length)} of {procedureData.steps.length}</SectionHeading>
                  <div className="flex gap-1 mb-2">
                    <button onClick={prevStep} disabled={currentStepIndex === 0} className="px-2 py-0.5 text-[10px] rounded bg-cardiac-surface text-slate-300 disabled:opacity-40 hover:text-white">◀ Prev</button>
                    <button onClick={() => { if (currentStepIndex < procedureData.steps.length - 1) nextStep(); }} disabled={currentStepIndex >= procedureData.steps.length - 1} className="px-2 py-0.5 text-[10px] rounded bg-cardiac-accent/20 text-cardiac-accent disabled:opacity-40 hover:bg-cardiac-accent/30">Next ▶</button>
                  </div>
                </div>
                <div className="h-1 bg-cardiac-dark rounded overflow-hidden">
                  <div className="h-full bg-cardiac-accent transition-all" style={{ width: `${((currentStepIndex + 1) / procedureData.steps.length) * 100}%` }} />
                </div>
                {procedureData.steps.map((s, i) => {
                  const active = i === currentStepIndex;
                  return (
                    <button
                      key={s.step}
                      onClick={() => setStep(i)}
                      className={`w-full text-left p-2 rounded transition-colors ${active ? 'bg-cardiac-accent/10 border border-cardiac-accent/40' : 'bg-cardiac-dark hover:bg-cardiac-surface/60'}`}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${active ? 'bg-cardiac-accent text-cardiac-dark' : 'bg-cardiac-accent/20 text-cardiac-accent'}`}>{s.step}</span>
                        <div className="min-w-0">
                          <h5 className={`font-medium text-xs mb-0.5 ${active ? 'text-white' : 'text-slate-300'}`}>{s.title}</h5>
                          {(active || i < currentStepIndex) && <p className="text-slate-400 leading-relaxed">{s.description}</p>}
                          {active && (s.anatomyTarget || s.view) && (
                            <p className="text-[10px] text-slate-500 mt-1">
                              {s.anatomyTarget && <>3D: <span className="text-cardiac-accent">{getStructureTitle(s.anatomyTarget)}</span></>}
                              {s.anatomyTarget && s.view && ' · '}
                              {s.view && <>view: <span className="text-cardiac-accent">{s.view}</span></>}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div>
                <SectionHeading>{tabLabel(tab)}</SectionHeading>
                <Content value={procedureData[PROCEDURE_TAB_FIELDS[tab] ?? 'overview'] as string | string[]} />
                {tab === 'overview' && (
                  <div className="mt-2 space-y-2">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase mb-1">Imaging</p>
                      <Bullets items={procedureData.imaging} />
                    </div>
                    {procedureData.contraindications.length > 0 && (
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase mb-1">Contraindications</p>
                        <Bullets items={procedureData.contraindications} marker="!" markerClass="text-red-400" />
                      </div>
                    )}
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase mb-1">Anatomy targets (highlighted in 3D)</p>
                      <div className="flex flex-wrap gap-1">
                        {procedureData.anatomyTargets.map((id) => <Chip key={id} onClick={() => goToStructure(id)}>{getStructureTitle(id)}</Chip>)}
                      </div>
                    </div>
                    <button onClick={() => { setStep(0); setRightPanelTab('procedure'); }} className="w-full py-1.5 rounded bg-cardiac-accent/20 text-cardiac-accent text-xs hover:bg-cardiac-accent/30">▶ Walk through the steps</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── Medication detail ─── */}
        {activePanelCategory === 'medications' && medicationData && (
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-white mb-1">{medicationData.name}</h3>
              <div className="flex flex-wrap gap-1">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300">{medicationData.drugClass}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cardiac-surface text-slate-400">{medicationData.subclass}</span>
              </div>
              {medicationData.brandNames.length > 0 && <p className="text-[10px] text-slate-500 mt-1">Brands: {medicationData.brandNames.join(', ')}</p>}
            </div>

            {tab === 'overview' && <LevelBox summaries={medicationData.levelSummaries} level={learningLevel} />}

            <div>
              <SectionHeading>{tabLabel(tab)}</SectionHeading>
              <Content value={medicationData[MEDICATION_TAB_FIELDS[tab] ?? 'overview'] as string | string[]} />
            </div>

            {tab === 'overview' && (
              <div className="space-y-2">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase mb-1">Routes</p>
                  <div className="flex flex-wrap gap-1">{medicationData.routes.map((r) => <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-cardiac-surface text-slate-300">{r}</span>)}</div>
                </div>
                {medicationData.relatedConditions.length > 0 && (
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase mb-1">Used in</p>
                    <div className="flex flex-wrap gap-1">
                      {medicationData.relatedConditions.filter((id) => CONDITION_DATA[id]).map((id) => <Chip key={id} onClick={() => goToCondition(id)}>{CONDITION_SHORT_NAMES[id] ?? CONDITION_DATA[id].title}</Chip>)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── Case detail ─── */}
        {activePanelCategory === 'cases' && caseData && (
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-white mb-1">{caseData.title}</h3>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                caseData.difficulty === 'beginner' ? 'bg-green-900/40 text-green-400' :
                caseData.difficulty === 'intermediate' ? 'bg-yellow-900/40 text-yellow-400' :
                caseData.difficulty === 'advanced' ? 'bg-orange-900/40 text-orange-400' : 'bg-red-900/40 text-red-400'
              }`}>
                {caseData.difficulty}
              </span>
            </div>

            {/* Vitals display */}
            <div className="bg-cardiac-dark rounded-lg p-2">
              <h4 className="text-[10px] font-semibold text-cardiac-red uppercase tracking-wider mb-1.5">Vitals</h4>
              <div className="grid grid-cols-2 gap-1">
                <div className="flex items-center gap-1"><span className="text-cardiac-red font-bold text-sm">{caseData.vitals.hr}</span><span className="text-[10px] text-slate-500">bpm</span></div>
                <div className="flex items-center gap-1"><span className="text-blue-400 font-bold text-sm">{caseData.vitals.bp}</span><span className="text-[10px] text-slate-500">mmHg</span></div>
                <div className="flex items-center gap-1"><span className={`font-bold text-sm ${caseData.vitals.spo2 < 92 ? 'text-red-400' : 'text-green-400'}`}>{caseData.vitals.spo2}%</span><span className="text-[10px] text-slate-500">SpO2</span></div>
                <div className="flex items-center gap-1"><span className="text-yellow-400 font-bold text-sm">{caseData.vitals.rr}</span><span className="text-[10px] text-slate-500">RR</span></div>
                {caseData.vitals.temp && <div className="flex items-center gap-1"><span className="text-slate-300 font-bold text-sm">{caseData.vitals.temp}</span><span className="text-[10px] text-slate-500">Temp</span></div>}
                {caseData.vitals.gcs && <div className="flex items-center gap-1"><span className="text-purple-400 font-bold text-sm">{caseData.vitals.gcs}</span><span className="text-[10px] text-slate-500">GCS</span></div>}
              </div>
            </div>

            {tab === 'overview' && (
              <div className="space-y-2">
                <Paragraph text={caseData.presentation} />
                <div><h4 className="text-[10px] font-semibold text-slate-500 uppercase mb-1">History</h4><p className="text-slate-400 leading-relaxed">{caseData.history}</p></div>
                <div><h4 className="text-[10px] font-semibold text-slate-500 uppercase mb-1">Physical Exam</h4><p className="text-slate-400 leading-relaxed">{caseData.physicalExam}</p></div>
                <button onClick={() => setRightPanelTab('simulate')} className="w-full py-1.5 rounded bg-cardiac-accent/20 text-cardiac-accent text-xs hover:bg-cardiac-accent/30">▶ Run this case</button>
              </div>
            )}

            {tab === 'simulate' && <CaseSimulator caseId={caseData.id} />}

            {(tab === 'field-care' || tab === 'hospital-care' || tab === 'cardiology-care' || tab === 'procedure') && (
              <div>
                <SectionHeading>Management guidelines</SectionHeading>
                <Bullets items={caseData.guidelines} />
              </div>
            )}

            {tab === 'ecg' && (
              <div>
                <SectionHeading>ECG</SectionHeading>
                <Paragraph text={`This case displays the "${caseData.ecgProfile.replace(/-/g, ' ')}" rhythm at ${caseData.heartRate} bpm on the 12-lead below. Select a lead on the ECG to see its electrical axis through the 3D heart.`} />
              </div>
            )}

            {tab === 'medications' && (
              <div>
                <SectionHeading>Medications</SectionHeading>
                <Bullets items={caseData.medications} />
              </div>
            )}

            {tab === 'complications' && (
              <div>
                <SectionHeading>Common pitfalls</SectionHeading>
                <Bullets items={caseData.pitfalls} marker="!" markerClass="text-red-400" />
              </div>
            )}

            {tab === 'teaching' && (
              <div>
                <SectionHeading>Teaching points</SectionHeading>
                <Bullets items={caseData.teaching} />
                <div className="mt-2 p-2 bg-cardiac-dark rounded">
                  <h4 className="text-[10px] font-semibold text-slate-500 uppercase mb-1">Disposition</h4>
                  <p className="text-slate-400">{caseData.disposition}</p>
                </div>
              </div>
            )}

            {tab === 'symptoms' && (
              <div className="p-2 bg-cardiac-dark rounded">
                <h4 className="text-[10px] font-semibold text-slate-500 uppercase mb-1">Key interventions</h4>
                <Bullets items={caseData.keyInterventions} />
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
