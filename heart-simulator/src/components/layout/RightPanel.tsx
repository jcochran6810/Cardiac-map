'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useAppStore, LEVEL_LABELS, type LearningLevel } from '@/store/useAppStore';
import { useSceneStore } from '@/store/useSceneStore';
import { useConditionStore } from '@/store/useConditionStore';
import { useProcedureStore } from '@/store/useProcedureStore';
import { usePharmacologyStore } from '@/store/usePharmacologyStore';
import { useCaseStore } from '@/store/useCaseStore';
import { useECGStore } from '@/store/useECGStore';
import { useLearningStore } from '@/store/useLearningStore';
import { useContent } from '@/lib/content';
import { kindOf, nameOf, openById, openCase, openCondition, openStructure, setRhythm } from '@/lib/actions';
import { CASE_DATA, type CaseData } from '@/data/caseData';
import { CONDITION_TO_PROFILE, resolveProfile } from '@/lib/ecg/profiles';
import { LANDMARK_BY_ID, PROFILE_TERRITORY } from '@/lib/anatomy/landmarks';
import type { ConditionContent, MedicationContent, ProcedureContent, StructureContent } from '@/types/content';
import { IconCheck, IconCube, IconFlag, IconPulse } from '@/components/ui/icons';
import ScopeCard from '@/components/ui/ScopeCard';
import { SCOPES } from '@/lib/scope';

type TabDef = { key: string; label: string; levels?: LearningLevel[] };

const KIND_CHIP: Record<string, string> = {
  structure: 'bg-sky-500/10 text-sky-300 border-sky-500/30 hover:bg-sky-500/20',
  condition: 'bg-rose-500/10 text-rose-300 border-rose-500/30 hover:bg-rose-500/20',
  procedure: 'bg-violet-500/10 text-violet-300 border-violet-500/30 hover:bg-violet-500/20',
  medication: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20',
  case: 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20',
};

// ─── Shared building blocks ────────────────────────────────────────────────

function Bullets({ items, accent = 'text-cardiac-accent' }: { items: string[]; accent?: string }) {
  const role = useAppStore((s) => s.learningLevel);
  if (!items?.length) return <p className="text-slate-500 italic">No content for this section.</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((d, i) => {
        // Field-care bullets prefixed "ALS:" are paramedic-only skills
        const als = /^ALS:\s*/.test(d);
        const text = als ? d.replace(/^ALS:\s*/, '') : d;
        const outOfScope = als && role === 1;
        return (
          <li key={i} className={`flex gap-2 ${outOfScope ? 'opacity-55' : ''}`}>
            <span className={`${accent} mt-[1px] shrink-0`}>•</span>
            <span className="text-slate-300 leading-relaxed">
              {als && (
                <span
                  className="mr-1 px-1 py-px rounded text-[9px] font-semibold bg-orange-500/20 text-orange-200 align-middle"
                  title={outOfScope ? 'Paramedic (ALS) skill — outside EMT scope' : 'Advanced life support (paramedic) skill'}
                >
                  ALS{outOfScope ? ' · paramedic' : ''}
                </span>
              )}
              {text}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Chips({ ids, label }: { ids: string[]; label: string }) {
  const valid = ids.filter((id) => kindOf(id));
  if (!valid.length) return null;
  return (
    <div className="mt-3">
      <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      <div className="flex flex-wrap gap-1">
        {valid.map((id) => (
          <button key={id} onClick={() => openById(id)} className={`px-1.5 py-0.5 rounded border text-[10px] transition-colors ${KIND_CHIP[kindOf(id)!]}`}>
            {nameOf(id)}
          </button>
        ))}
      </div>
    </div>
  );
}

function Tabs({ tabs, active, onChange, level }: { tabs: TabDef[]; active: string; onChange: (k: string) => void; level: LearningLevel }) {
  return (
    <div className="flex flex-wrap gap-0.5 px-2 py-1.5 border-b border-slate-700 shrink-0 bg-cardiac-panel" role="tablist">
      {tabs.map((t) => {
        const rec = t.levels?.includes(level);
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            role="tab"
            aria-selected={active === t.key}
            title={rec ? `Recommended for ${LEVEL_LABELS[level].long}` : undefined}
            className={`relative px-2 py-1 text-[10px] rounded transition-colors ${
              active === t.key ? 'bg-cardiac-accent/20 text-cardiac-accent font-semibold' : 'text-slate-400 hover:text-white hover:bg-cardiac-surface/70'
            }`}
          >
            {t.label}
            {rec && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400" />}
          </button>
        );
      })}
    </div>
  );
}

function Header({ title, badge, badgeClass, summary, children }: { title: string; badge?: string; badgeClass?: string; summary?: string; children?: React.ReactNode }) {
  return (
    <div className="px-3 pt-3 pb-2 border-b border-slate-700/60 shrink-0">
      {badge && <span className={`inline-block text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded mb-1 ${badgeClass ?? 'bg-slate-700 text-slate-300'}`}>{badge}</span>}
      <h2 className="text-base font-semibold text-white leading-tight">{title}</h2>
      {summary && <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">{summary}</p>}
      {children}
    </div>
  );
}

function LevelFocus({ notes, level }: { notes?: string[]; level: LearningLevel }) {
  const [showScope, setShowScope] = useState(false);
  const note = notes?.[level - 1];
  if (!note) return null;
  return (
    <div className="mt-2 p-2 rounded-md bg-emerald-500/10 border border-emerald-500/25">
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <div className="text-[9px] uppercase tracking-wider text-emerald-300 font-semibold">Focus for {LEVEL_LABELS[level].long}</div>
        <button onClick={() => setShowScope((v) => !v)} className="text-[9px] text-emerald-300/80 hover:text-emerald-200 whitespace-nowrap" title="What this role may and may not do">
          {showScope ? 'hide scope' : 'scope ▸'}
        </button>
      </div>
      <p className="text-[11px] text-slate-200 leading-relaxed">{note}</p>
      <p className="mt-1 text-[9px] text-slate-500">Within {SCOPES[level].role} scope · {SCOPES[level].framework.split(' · ')[0]}</p>
      {showScope && <div className="mt-2 pt-2 border-t border-emerald-500/20"><ScopeCard level={level} compact /></div>}
    </div>
  );
}

function ActionBtn({ onClick, children, title }: { onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button onClick={onClick} title={title} className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] bg-cardiac-surface/70 text-slate-200 hover:bg-cardiac-surface hover:text-white border border-slate-600/60">
      {children}
    </button>
  );
}

function useTab(tabs: TabDef[], resetKey: string) {
  const tab = useAppStore((s) => s.rightPanelTab);
  const setTab = useAppStore((s) => s.setRightPanelTab);
  const valid = tabs.some((t) => t.key === tab) ? tab : tabs[0].key;
  useEffect(() => {
    if (!tabs.some((t) => t.key === tab)) setTab(tabs[0].key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);
  return [valid, setTab] as const;
}

// ─── Structure ─────────────────────────────────────────────────────────────

const STRUCTURE_TABS: TabDef[] = [
  { key: 'overview', label: 'Overview', levels: [1, 2] },
  { key: 'anatomy', label: 'Anatomy', levels: [3, 5] },
  { key: 'physiology', label: 'Physiology', levels: [4] },
  { key: 'clinical', label: 'Clinical', levels: [1, 2, 4] },
  { key: 'ecg', label: 'ECG', levels: [2, 3] },
  { key: 'imaging', label: 'Imaging', levels: [3, 5] },
  { key: 'procedures', label: 'Procedures', levels: [3, 4, 5] },
  { key: 'teaching', label: 'Pearls' },
];

function StructureView({ s, level }: { s: StructureContent; level: LearningLevel }) {
  const [tab, setTab] = useTab(STRUCTURE_TABS, s.id);
  const l = LANDMARK_BY_ID[s.id];
  const viewMode = useAppStore((st) => st.viewMode);
  const setViewMode = useAppStore((st) => st.setViewMode);
  const body = (s as unknown as Record<string, string[]>)[tab] ?? s.overview;
  return (
    <>
      <Header title={s.name} badge={s.group.replace('-', ' ')} badgeClass="bg-sky-500/15 text-sky-300" summary={s.summary}>
        {s.synonyms.length > 0 && <p className="text-[10px] text-slate-500 mt-1">Also: {s.synonyms.join(', ')}</p>}
        <LevelFocus notes={s.levelNotes} level={level} />
        <div className="flex flex-wrap gap-1 mt-2">
          {l && <ActionBtn onClick={() => openStructure(s.id)} title="Frame this structure in the 3D view"><IconCube size={11} /> Show in 3D</ActionBtn>}
          {l?.section && viewMode !== 'sectioned' && <ActionBtn onClick={() => { setViewMode('sectioned'); openStructure(s.id); }}>Sectioned view</ActionBtn>}
        </div>
      </Header>
      <Tabs tabs={STRUCTURE_TABS} active={tab} onChange={setTab} level={level} />
      <div className="flex-1 overflow-y-auto p-3 text-xs">
        {tab === 'anatomy' && s.bloodSupply && (
          <div className="mb-2 p-2 rounded bg-red-500/10 border border-red-500/20 text-[11px]">
            <span className="text-red-300 font-semibold">Blood supply: </span><span className="text-slate-200">{s.bloodSupply}</span>
          </div>
        )}
        <Bullets items={body} />
        {(tab === 'clinical' || tab === 'overview') && <Chips ids={s.relatedConditions} label="Related conditions" />}
        {(tab === 'procedures' || tab === 'overview') && <Chips ids={s.relatedProcedures} label="Related procedures" />}
      </div>
    </>
  );
}

// ─── Condition ─────────────────────────────────────────────────────────────

const CONDITION_TABS: TabDef[] = [
  { key: 'overview', label: 'Overview', levels: [1] },
  { key: 'pathophysiology', label: 'Pathophysiology', levels: [5] },
  { key: 'symptoms', label: 'Signs & symptoms', levels: [1, 2, 4] },
  { key: 'ecg', label: 'ECG', levels: [2, 3, 5] },
  { key: 'imaging', label: 'Imaging', levels: [5] },
  { key: 'medications', label: 'Medications', levels: [2, 4] },
  { key: 'fieldCare', label: 'Field care', levels: [1, 2] },
  { key: 'hospitalCare', label: 'ED / ICU', levels: [4] },
  { key: 'cardiologyCare', label: 'Cardiology', levels: [5] },
  { key: 'procedure', label: 'Procedures', levels: [3, 4, 5] },
  { key: 'complications', label: 'Complications', levels: [3, 4] },
  { key: 'anatomy', label: 'Anatomy' },
  { key: 'teaching', label: 'Pearls' },
];

function ConditionView({ c, level }: { c: ConditionContent; level: LearningLevel }) {
  const [tab, setTab] = useTab(CONDITION_TABS, c.id);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const ecg = useECGStore();
  const profile = resolveProfile(CONDITION_TO_PROFILE[c.id]);
  const territory = PROFILE_TERRITORY[profile.id];
  const body = (c as unknown as Record<string, string[]>)[tab] ?? c.overview;
  const showsHemo = profile.hemo !== 'normal' && profile.hemo !== 'stemi';
  return (
    <>
      <Header title={c.name} badge={c.category} badgeClass="bg-rose-500/15 text-rose-300" summary={c.summary}>
        <LevelFocus notes={c.levelNotes} level={level} />
        <div className="flex flex-wrap gap-1 mt-2">
          <ActionBtn onClick={() => { setRhythm(profile.id); ecg.setBottomView('ecg'); }} title="Load this pattern on the ECG"><IconPulse size={11} /> Replay ECG</ActionBtn>
          {profile.keyLeads?.[0] && (
            <ActionBtn onClick={() => { ecg.setBottomView('ecg'); ecg.setInspectLead(profile.keyLeads![0] as never); }}>Inspect lead {profile.keyLeads[0]}</ActionBtn>
          )}
          {showsHemo && <ActionBtn onClick={() => ecg.setBottomView('wiggers')}>Hemodynamics</ActionBtn>}
          {territory && <ActionBtn onClick={() => setViewMode('territories')}>Culprit territory ({territory})</ActionBtn>}
        </div>
      </Header>
      <Tabs tabs={CONDITION_TABS} active={tab} onChange={setTab} level={level} />
      <div className="flex-1 overflow-y-auto p-3 text-xs space-y-3">
        {tab === 'overview' && c.redFlags.length > 0 && (
          <div className="p-2 rounded-md bg-red-500/10 border border-red-500/30">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-red-300 font-semibold mb-1"><IconFlag size={11} /> Red flags</div>
            <Bullets items={c.redFlags} accent="text-red-400" />
          </div>
        )}
        <Bullets items={body} />
        {tab === 'ecg' && (
          <div className="p-2 rounded-md bg-cardiac-dark border border-slate-700">
            <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">On the live monitor now</div>
            <p className="text-[11px] text-white font-medium mb-1">{profile.headline}</p>
            <Bullets items={profile.findings} accent="text-emerald-400" />
          </div>
        )}
        {(tab === 'medications' || tab === 'overview') && <Chips ids={c.relatedMedications} label="Drug cards" />}
        {(tab === 'procedure' || tab === 'cardiologyCare' || tab === 'overview') && <Chips ids={c.relatedProcedures} label="Procedures" />}
        {(tab === 'anatomy' || tab === 'overview') && <Chips ids={c.affectedStructures} label="Anatomy involved (highlighted in 3D)" />}
      </div>
    </>
  );
}

// ─── Procedure ─────────────────────────────────────────────────────────────

const PROCEDURE_TABS: TabDef[] = [
  { key: 'overview', label: 'Overview', levels: [1, 2] },
  { key: 'indications', label: 'Indications', levels: [5] },
  { key: 'contraindications', label: 'Contraindications', levels: [4, 5] },
  { key: 'anatomy', label: 'Anatomy & access', levels: [3, 5] },
  { key: 'steps', label: 'Steps', levels: [3, 4, 5] },
  { key: 'ecg', label: 'ECG / rhythm', levels: [3] },
  { key: 'equipment', label: 'Equipment', levels: [3] },
  { key: 'complications', label: 'Complications', levels: [2, 3, 4, 5] },
  { key: 'postCare', label: 'Post-care', levels: [1, 2, 4] },
  { key: 'teaching', label: 'Pearls' },
];

function ProcedureView({ p, level }: { p: ProcedureContent; level: LearningLevel }) {
  const [tab, setTab] = useTab(PROCEDURE_TABS, p.id);
  const [step, setStep] = useState(0);
  useEffect(() => setStep(0), [p.id]);
  const body = (p as unknown as Record<string, string[]>)[tab];
  return (
    <>
      <Header title={p.name} badge={p.category} badgeClass="bg-violet-500/15 text-violet-300" summary={p.summary}>
        <LevelFocus notes={p.levelNotes} level={level} />
      </Header>
      <Tabs tabs={PROCEDURE_TABS} active={tab} onChange={setTab} level={level} />
      <div className="flex-1 overflow-y-auto p-3 text-xs">
        {tab === 'anatomy' && (
          <div className="mb-2 p-2 rounded bg-violet-500/10 border border-violet-500/25 text-[11px]">
            <span className="text-violet-300 font-semibold">Access: </span><span className="text-slate-200">{p.accessSite}</span>
          </div>
        )}
        {tab === 'steps' ? (
          <div>
            <div className="flex items-center gap-1 mb-2">
              {p.steps.map((_, i) => (
                <button key={i} onClick={() => setStep(i)} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-violet-400' : 'bg-slate-700'}`} aria-label={`Step ${i + 1}`} />
              ))}
            </div>
            <ol className="space-y-1.5">
              {p.steps.map((s, i) => (
                <li key={i}>
                  <button
                    onClick={() => setStep(i)}
                    className={`w-full text-left p-2 rounded-md border transition-colors ${i === step ? 'bg-violet-500/10 border-violet-500/40' : 'bg-cardiac-dark/60 border-transparent hover:border-slate-600'}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold ${i < step ? 'bg-violet-500 text-white' : 'bg-violet-500/20 text-violet-300'}`}>
                        {i < step ? <IconCheck size={10} /> : i + 1}
                      </span>
                      <div>
                        <div className="text-white font-medium">{s.title}</div>
                        {i === step && <p className="text-slate-300 leading-relaxed mt-0.5">{s.description}</p>}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ol>
            <div className="flex justify-between mt-2">
              <ActionBtn onClick={() => setStep((s) => Math.max(0, s - 1))}>← Previous</ActionBtn>
              <ActionBtn onClick={() => setStep((s) => Math.min(p.steps.length - 1, s + 1))}>Next →</ActionBtn>
            </div>
          </div>
        ) : (
          <Bullets items={body ?? p.overview} />
        )}
        {tab === 'overview' && <Chips ids={p.relatedConditions} label="Used for" />}
        {(tab === 'anatomy' || tab === 'overview') && <Chips ids={p.targetStructures} label="Target anatomy (highlighted in 3D)" />}
      </div>
    </>
  );
}

// ─── Medication ────────────────────────────────────────────────────────────

const MED_TABS: TabDef[] = [
  { key: 'mechanism', label: 'Mechanism', levels: [5] },
  { key: 'indications', label: 'Indications', levels: [1, 2, 5] },
  { key: 'dosing', label: 'Dosing', levels: [2, 4] },
  { key: 'contraindications', label: 'Contraindications', levels: [1, 2, 4] },
  { key: 'adverseEffects', label: 'Adverse effects', levels: [3, 4] },
  { key: 'ecgEffects', label: 'ECG effects', levels: [2, 3] },
  { key: 'hemodynamics', label: 'Hemodynamics', levels: [3] },
  { key: 'monitoring', label: 'Monitoring', levels: [3, 4] },
  { key: 'interactions', label: 'Interactions', levels: [4, 5] },
  { key: 'teaching', label: 'Pearls' },
];

function MedicationView({ m, level }: { m: MedicationContent; level: LearningLevel }) {
  const [tab, setTab] = useTab(MED_TABS, m.id);
  const body = (m as unknown as Record<string, string[]>)[tab] ?? m.mechanism;
  return (
    <>
      <Header title={m.name} badge={m.drugClass} badgeClass="bg-emerald-500/15 text-emerald-300" summary={m.summary}>
        {m.brandNames.length > 0 && <p className="text-[10px] text-slate-500 mt-1">Brand names: {m.brandNames.join(', ')}</p>}
        <LevelFocus notes={m.levelNotes} level={level} />
      </Header>
      <Tabs tabs={MED_TABS} active={tab} onChange={setTab} level={level} />
      <div className="flex-1 overflow-y-auto p-3 text-xs">
        {tab === 'dosing' && (
          <div className="mb-2 p-2 rounded bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-200 leading-snug">
            Typical adult doses for education only. Always follow current guidelines, local protocols and medical direction.
          </div>
        )}
        <Bullets items={body} />
        {(tab === 'indications' || tab === 'teaching') && <Chips ids={m.relatedConditions} label="Related conditions" />}
      </div>
    </>
  );
}

// ─── Case ──────────────────────────────────────────────────────────────────

const CASE_TABS: TabDef[] = [
  { key: 'scenario', label: 'Scenario' },
  { key: 'decisions', label: 'Decisions', levels: [1, 2, 3, 4, 5] },
  { key: 'management', label: 'Management' },
  { key: 'medications', label: 'Medications' },
  { key: 'pitfalls', label: 'Pitfalls' },
  { key: 'debrief', label: 'Debrief' },
];

function Vitals({ c }: { c: CaseData }) {
  const v = c.vitals;
  const sbp = Number(v.bp.split('/')[0]);
  const cells: [string, string, string, boolean][] = [
    ['HR', String(v.hr), 'bpm', v.hr < 50 || v.hr > 120],
    ['BP', v.bp, 'mmHg', sbp < 90 || sbp > 180],
    ['SpO₂', `${v.spo2}%`, '', v.spo2 < 92],
    ['RR', String(v.rr), '/min', v.rr > 24 || v.rr < 10],
  ];
  if (v.temp) cells.push(['Temp', v.temp, '', false]);
  if (v.gcs) cells.push(['GCS', String(v.gcs), '', v.gcs < 14]);
  if (v.etco2) cells.push(['EtCO₂', String(v.etco2), 'mmHg', v.etco2 < 20]);
  return (
    <div className="grid grid-cols-4 gap-1 mt-2 p-1.5 rounded-md bg-black/50 border border-slate-700 font-mono">
      {cells.map(([k, val, unit, bad]) => (
        <div key={k} className="px-1">
          <div className="text-[9px] text-slate-500">{k}</div>
          <div className={`text-sm font-bold leading-none ${bad ? 'text-red-400' : 'text-emerald-300'}`}>{val}<span className="text-[9px] text-slate-500 ml-0.5">{unit}</span></div>
        </div>
      ))}
    </div>
  );
}

function CaseDecisions({ c, level }: { c: CaseData; level: LearningLevel }) {
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<Record<number, number>>({});
  const markCaseCompleted = useLearningStore((s) => s.markCaseCompleted);
  useEffect(() => { setIdx(0); setPicked({}); }, [c.id]);
  const decisions = c.decisions ?? [];
  if (!decisions.length) return <p className="text-slate-500">No decision points for this case.</p>;
  const done = idx >= decisions.length;
  const correctCount = decisions.reduce((n, d, i) => n + (picked[i] !== undefined && d.options[picked[i]]?.correct ? 1 : 0), 0);

  if (done) {
    return (
      <div className="space-y-2">
        <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-center">
          <div className="text-2xl font-bold text-white">{correctCount}/{decisions.length}</div>
          <div className="text-[11px] text-emerald-200">correct on first attempt</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Disposition</div>
          <p className="text-slate-300 leading-relaxed">{c.disposition}</p>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Teaching points</div>
          <Bullets items={c.teaching} />
        </div>
        <ActionBtn onClick={() => { setIdx(0); setPicked({}); }}>Restart case</ActionBtn>
      </div>
    );
  }

  const d = decisions[idx];
  const choice = picked[idx];
  const answered = choice !== undefined;
  return (
    <div>
      <div className="flex items-center gap-1 mb-2">
        {decisions.map((_, i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full ${i < idx ? 'bg-amber-400' : i === idx ? 'bg-amber-400/50' : 'bg-slate-700'}`} />
        ))}
      </div>
      <div className="text-[9px] uppercase tracking-wider text-amber-300 font-semibold">{d.stage} · decision {idx + 1} of {decisions.length}</div>
      {d.owner && (
        <div className={`mt-1 text-[10px] px-2 py-1 rounded border ${d.owner === level ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-slate-600 bg-cardiac-dark/60 text-slate-300'}`}>
          Decision owner: <b>{SCOPES[d.owner].role}</b>
          {d.owner !== level && (
            <span className="text-slate-400"> — outside your role as {SCOPES[level].role}{c.roleBriefs ? `. Your part: ${c.roleBriefs[level - 1]}` : '. Know what to anticipate and how to assist.'}</span>
          )}
        </div>
      )}
      {d.update && (
        <div className="mt-1.5 p-2 rounded bg-sky-500/10 border border-sky-500/25 text-[11px] text-sky-100 leading-relaxed">
          <b className="text-sky-300">Update: </b>{d.update}
        </div>
      )}
      <p className="text-white font-medium mt-2 leading-relaxed">{d.prompt}</p>
      <div className="mt-2 space-y-1.5">
        {d.options.map((o, i) => {
          const isPicked = choice === i;
          const reveal = answered && (isPicked || o.correct);
          return (
            <div key={i}>
              <button
                disabled={answered}
                onClick={() => setPicked((p) => ({ ...p, [idx]: i }))}
                className={`w-full text-left p-2 rounded-md border text-[11px] leading-snug transition-colors ${
                  !answered ? 'bg-cardiac-dark/70 border-slate-600 hover:border-amber-400/60 text-slate-200'
                    : o.correct ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-100'
                      : isPicked ? 'bg-red-500/15 border-red-500/50 text-red-100' : 'bg-cardiac-dark/40 border-slate-700 text-slate-500'
                }`}
              >
                {o.text}
              </button>
              {reveal && <p className={`mt-1 ml-2 text-[11px] leading-relaxed ${o.correct ? 'text-emerald-200' : 'text-red-200'}`}>{o.feedback}</p>}
            </div>
          );
        })}
      </div>
      {answered && (
        <div className="flex justify-end mt-2">
          <ActionBtn
            onClick={() => {
              const next = idx + 1;
              if (next >= decisions.length) {
                const correct = decisions.reduce((n, dd, i) => n + (picked[i] !== undefined && dd.options[picked[i]]?.correct ? 1 : 0), 0);
                markCaseCompleted(c.id, correct, decisions.length);
              }
              setIdx(next);
            }}
          >
            {idx + 1 >= decisions.length ? 'Finish & debrief →' : 'Next decision →'}
          </ActionBtn>
        </div>
      )}
    </div>
  );
}

function CaseView({ c, level }: { c: CaseData; level: LearningLevel }) {
  const [tab, setTab] = useTab(CASE_TABS, c.id);
  const diff: Record<string, string> = {
    beginner: 'bg-emerald-500/15 text-emerald-300', intermediate: 'bg-yellow-500/15 text-yellow-300',
    advanced: 'bg-orange-500/15 text-orange-300', expert: 'bg-red-500/15 text-red-300',
  };
  return (
    <>
      <Header title={c.title} badge={`${c.difficulty} case`} badgeClass={diff[c.difficulty]}>
        <Vitals c={c} />
        <div className="flex flex-wrap gap-1 mt-2">
          <ActionBtn onClick={() => setTab('decisions')}>Work the case →</ActionBtn>
          <ActionBtn onClick={() => openCase(c.id)} title="Restart and reload the monitor"><IconPulse size={11} /> Reload monitor</ActionBtn>
        </div>
      </Header>
      <Tabs tabs={CASE_TABS} active={tab} onChange={setTab} level={level} />
      <div className="flex-1 overflow-y-auto p-3 text-xs space-y-3">
        {tab === 'scenario' && (
          <>
            <p className="text-slate-200 leading-relaxed">{c.presentation}</p>
            {c.roleBriefs && (
              <div className="p-2 rounded-md bg-emerald-500/10 border border-emerald-500/25">
                <div className="text-[9px] uppercase tracking-wider text-emerald-300 font-semibold mb-0.5">Your role: {LEVEL_LABELS[level].long}</div>
                <p className="text-[11px] text-slate-200 leading-relaxed">{c.roleBriefs[level - 1]}</p>
              </div>
            )}
            <div><div className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">History</div><p className="text-slate-300 leading-relaxed">{c.history}</p></div>
            <div><div className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Examination</div><p className="text-slate-300 leading-relaxed">{c.physicalExam}</p></div>
            <p className="text-[10px] text-slate-500">Look at the live ECG below, then open <b>Decisions</b>.</p>
          </>
        )}
        {tab === 'decisions' && <CaseDecisions c={c} level={level} />}
        {tab === 'management' && (<><Bullets items={c.guidelines} /><div><div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1 mt-2">Key interventions</div><Bullets items={c.keyInterventions} accent="text-emerald-400" /></div></>)}
        {tab === 'medications' && <Bullets items={c.medications} />}
        {tab === 'pitfalls' && <Bullets items={c.pitfalls} accent="text-red-400" />}
        {tab === 'debrief' && (<><Bullets items={c.teaching} /><div className="p-2 rounded bg-cardiac-dark"><div className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Disposition</div><p className="text-slate-300">{c.disposition}</p></div></>)}
      </div>
    </>
  );
}

// ─── Welcome ───────────────────────────────────────────────────────────────

function Welcome({ level }: { level: LearningLevel }) {
  const setQuizOpen = useAppStore((s) => s.setQuizOpen);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const setHelpOpen = useAppStore((s) => s.setHelpOpen);
  const ecg = useECGStore();
  const cards: { title: string; text: string; go: () => void }[] = [
    { title: 'Watch one heartbeat', text: 'Slow the simulation to 0.25× and watch the P wave light the atria, the QRS spread through the ventricles and the valves open in the sectioned view.', go: () => { setViewMode('sectioned'); } },
    { title: 'Conduction system', text: 'See SA → AV node → His → bundles → Purkinje fire in time with the ECG. Try Mobitz II or complete heart block.', go: () => { setViewMode('conduction'); openCondition('third-degree-av-block'); } },
    { title: 'Read a STEMI', text: 'Anterior STEMI: ST elevation V1–V4 with reciprocal inferior change, and the LAD territory pulsing on the heart.', go: () => openCondition('anterior-stemi') },
    { title: 'Pressure & volume', text: 'Open the Wiggers diagram and PV loop; compare aortic stenosis, mitral regurgitation and heart failure.', go: () => { ecg.setBottomView('wiggers'); openCondition('aortic-stenosis'); } },
    { title: 'Run a case', text: 'Make time-critical decisions with feedback in an unstable SVT scenario.', go: () => openCase('unstable-svt') },
    { title: 'Run a code', text: 'Monitor-defibrillator trainer: AED, defibrillation, synchronised cardioversion, pacing, CPR and ACLS drugs on a live patient. Open Instructor for scenarios.', go: () => ecg.setBottomView('defib') },
    { title: 'Map the activation', text: 'See the order in which the ventricles activate, like an EP mapping system — compare normal conduction, LBBB and WPW.', go: () => { setViewMode('activation'); openCondition('left-bundle-branch-block'); } },
    { title: 'Swap the electrodes', text: 'Reverse the ECG cables and learn the tell-tale patterns, or take the mystery-reversal challenge.', go: () => { ecg.setBottomView('ecg'); ecg.setElectrodeLab(true); } },
    { title: 'Quiz yourself', text: '66 questions across all levels, including live rhythm identification.', go: () => setQuizOpen(true) },
  ];
  return (
    <div className="flex-1 overflow-y-auto p-3">
      <h2 className="text-base font-semibold text-white">Welcome to CardioSim</h2>
      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
        An interactive heart where the anatomy, ECG, conduction system and hemodynamics all run from one beat-by-beat model.
        Pick anything in the navigator, click the heart, or start below. Guidance is written for <b className="text-emerald-300">{LEVEL_LABELS[level].long}</b> and stays within that role&apos;s scope of practice — change your role in the top bar.
      </p>
      <div className="grid gap-2 mt-3">
        {cards.map((c) => (
          <button key={c.title} onClick={c.go} className="text-left p-2.5 rounded-lg bg-cardiac-dark/70 border border-slate-700 hover:border-cardiac-accent/60 transition-colors">
            <div className="text-xs font-semibold text-white">{c.title} →</div>
            <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{c.text}</div>
          </button>
        ))}
      </div>
      <button onClick={() => setHelpOpen(true)} className="mt-3 text-[11px] text-sky-300 hover:underline">Keyboard shortcuts & tips</button>
      <div className="mt-3 p-2.5 bg-cardiac-dark rounded-lg">
        <p className="text-cardiac-accent text-[10px] font-semibold mb-0.5">EDUCATIONAL USE ONLY</p>
        <p className="text-slate-500 text-[10px] leading-relaxed">
          CardioSim is a teaching simulation. Waveforms and hemodynamics are idealised models, and doses are typical adult values for
          education. It is not a medical device and must not be used for diagnosis or treatment.
        </p>
      </div>
    </div>
  );
}

// ─── Panel ─────────────────────────────────────────────────────────────────

export default function RightPanel({ style }: { style?: React.CSSProperties }) {
  const category = useAppStore((s) => s.activePanelCategory);
  const level = useAppStore((s) => s.learningLevel);
  const selectedStructureId = useSceneStore((s) => s.selectedStructureId);
  const selectedConditionId = useConditionStore((s) => s.selectedConditionId);
  const selectedProcedureId = useProcedureStore((s) => s.selectedProcedureId);
  const selectedMedicationId = usePharmacologyStore((s) => s.selectedMedicationId);
  const activeCaseId = useCaseStore((s) => s.activeCaseId);
  const lib = useContent();

  const view = useMemo(() => {
    if (!lib) return <div className="flex-1 flex items-center justify-center text-xs text-slate-500">Loading library…</div>;
    if ((category === 'anatomy' || category === 'coronary' || category === 'conduction') && selectedStructureId && lib.structures[selectedStructureId]) {
      return <StructureView s={lib.structures[selectedStructureId]} level={level} />;
    }
    if (category === 'conditions' && selectedConditionId && lib.conditions[selectedConditionId]) return <ConditionView c={lib.conditions[selectedConditionId]} level={level} />;
    if (category === 'procedures' && selectedProcedureId && lib.procedures[selectedProcedureId]) return <ProcedureView p={lib.procedures[selectedProcedureId]} level={level} />;
    if (category === 'medications' && selectedMedicationId && lib.medications[selectedMedicationId]) return <MedicationView m={lib.medications[selectedMedicationId]} level={level} />;
    if (category === 'cases' && activeCaseId && CASE_DATA[activeCaseId]) return <CaseView c={CASE_DATA[activeCaseId]} level={level} />;
    return <Welcome level={level} />;
  }, [lib, category, level, selectedStructureId, selectedConditionId, selectedProcedureId, selectedMedicationId, activeCaseId]);

  return (
    <aside style={style} className="bg-cardiac-panel border-r border-slate-700 flex flex-col shrink-0 overflow-hidden min-h-0" aria-label="Information">
      {view}
    </aside>
  );
}
