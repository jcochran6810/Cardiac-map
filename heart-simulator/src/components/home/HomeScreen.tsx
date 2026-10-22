'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useAppStore, LEVEL_LABELS, type LearningLevel, type PanelCategory } from '@/store/useAppStore';
import { useTutorStore } from '@/store/useTutorStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { useLearningStore } from '@/store/useLearningStore';
import { useSceneStore } from '@/store/useSceneStore';
import { useConditionStore } from '@/store/useConditionStore';
import { useProcedureStore } from '@/store/useProcedureStore';
import { usePharmacologyStore } from '@/store/usePharmacologyStore';
import { useCaseStore } from '@/store/useCaseStore';
import { useCathLabStore } from '@/store/useCathLabStore';
import { useSimStore } from '@/store/useSimStore';
import { useContent } from '@/lib/content';
import { CATEGORIES } from '@/lib/categories';
import { nameOf, openById, openCase, openCategory, openCondition, openTool, showEcg, showHeart, type Tool } from '@/lib/actions';
import { scenariosFor, SCENARIO_BY_ID } from '@/lib/sim/scenario/scenarios';
import { CASE_DATA } from '@/data/caseData';
import { CONDITION_IDS, MEDICATION_IDS, PROCEDURE_IDS, STRUCTURE_IDS } from '@/types/content';
import { CONDUCTION_IDS, CORONARY_IDS, structureCategory } from '@/lib/anatomy/categories';
import ScopeCard from '@/components/ui/ScopeCard';
import { InstallButton } from '@/components/ui/InstallApp';
import SearchBox from '@/components/layout/SearchBox';
import {
  IconBook, IconChart, IconChevron, IconClipboard, IconCube, IconDownload, IconHeart, IconHeartPulse, IconHelp, IconPerson, IconPill, IconPlay, IconPulse, IconQuiz, IconTutor, IconZap,
} from '@/components/ui/icons';

const ROLES: LearningLevel[] = [1, 2, 3, 4, 5];

const CATEGORY_LOOK: Record<PanelCategory, { icon: React.ReactNode; tint: string }> = {
  conditions: { icon: <IconHeartPulse size={22} />, tint: 'text-rose-300 bg-rose-500/15' },
  anatomy: { icon: <IconBook size={22} />, tint: 'text-sky-300 bg-sky-500/15' },
  coronary: { icon: <IconHeart size={22} />, tint: 'text-red-300 bg-red-500/15' },
  conduction: { icon: <IconZap size={22} />, tint: 'text-yellow-300 bg-yellow-500/15' },
  medications: { icon: <IconPill size={22} />, tint: 'text-lime-300 bg-lime-500/15' },
  procedures: { icon: <IconClipboard size={22} />, tint: 'text-violet-300 bg-violet-500/15' },
  cathlab: { icon: <IconCube size={22} />, tint: 'text-cyan-300 bg-cyan-500/15' },
  cases: { icon: <IconClipboard size={22} />, tint: 'text-amber-300 bg-amber-500/15' },
};

const TOOLS: { tool: Tool; title: string; text: string; icon: React.ReactNode; tint: string }[] = [
  { tool: 'heart', title: '3D heart', text: 'Spin it, cut it open and tap any part to learn what it does.', icon: <IconCube size={22} />, tint: 'text-sky-300 bg-sky-500/15' },
  { tool: 'ecg', title: '12-lead ECG', text: 'A live 12-lead in step with the heart. Tap a lead to see where it looks.', icon: <IconPulse size={22} />, tint: 'text-emerald-300 bg-emerald-500/15' },
  { tool: 'lab', title: 'Electrode lab', text: 'Place the electrodes on a 3D patient and see what swapped cables do.', icon: <IconPerson size={22} />, tint: 'text-teal-300 bg-teal-500/15' },
  { tool: 'defib', title: 'Defibrillator', text: 'Shock, cardiovert and pace a live patient on a monitor-defibrillator.', icon: <IconZap size={22} />, tint: 'text-amber-300 bg-amber-500/15' },
  { tool: 'wiggers', title: 'Pressure & volume', text: 'The Wiggers diagram and pressure-volume loop, beat by beat.', icon: <IconChart size={22} />, tint: 'text-cyan-300 bg-cyan-500/15' },
];

/** Guided starts: each sets up the heart, the ECG and the reading for one idea */
const TOURS: { title: string; text: string; go: () => void }[] = [
  {
    title: 'Watch one heartbeat', text: 'Slowed to 0.25× in the sectioned heart: the P wave lights the atria, the QRS spreads through the ventricles, the valves open and close.',
    go: () => { openCategory('anatomy'); useAppStore.getState().setViewMode('sectioned'); showHeart(); showEcg('ecg'); useTimelineStore.getState().setSpeed(0.25); useTimelineStore.getState().play(); },
  },
  {
    title: 'See the conduction system fire', text: 'SA node → AV node → His → bundles → Purkinje in time with the ECG — here in complete heart block.',
    go: () => { openCondition('third-degree-av-block'); useAppStore.getState().setViewMode('conduction'); showHeart(); showEcg('ecg'); },
  },
  {
    title: 'Read a STEMI', text: 'Anterior STEMI: ST elevation V1–V4 with reciprocal inferior change, and the LAD territory pulsing on the heart.',
    go: () => { openCondition('anterior-stemi'); showHeart(); showEcg('ecg'); },
  },
  {
    title: 'Compare valve disease', text: 'Aortic stenosis on the Wiggers diagram and PV loop — then try mitral regurgitation and heart failure.',
    go: () => { openCondition('aortic-stenosis'); showEcg('wiggers'); },
  },
  {
    title: 'Map the activation', text: 'The order the ventricles activate in, like an EP mapping system — normal conduction against LBBB and WPW.',
    go: () => { openCondition('left-bundle-branch-block'); useAppStore.getState().setViewMode('activation'); showHeart(); },
  },
  {
    title: 'Work through a case study', text: 'Step-by-step decisions with feedback in an unstable SVT case.',
    go: () => { openCase('unstable-svt'); showEcg('ecg'); },
  },
];

/** The item you were last reading, so the menu can take you straight back to it */
function useLastItem(): string | null {
  const cat = useAppStore((s) => s.activePanelCategory);
  const structure = useSceneStore((s) => s.selectedStructureId);
  const condition = useConditionStore((s) => s.selectedConditionId);
  const procedure = useProcedureStore((s) => s.selectedProcedureId);
  const medication = usePharmacologyStore((s) => s.selectedMedicationId);
  const caseId = useCaseStore((s) => s.activeCaseId);
  const cathlab = useCathLabStore((s) => s.selectedId);
  switch (cat) {
    case 'conditions': return condition;
    case 'procedures': return procedure;
    case 'medications': return medication;
    case 'cases': return caseId;
    case 'cathlab': return cathlab;
    default: return structure;
  }
}

/** The main menu: every part of CardioSim starts here */
export default function HomeScreen() {
  const role = useAppStore((s) => s.learningLevel);
  const setRole = useAppStore((s) => s.setLearningLevel);
  const lib = useContent();
  const learning = useLearningStore();
  const simState = useSimStore((s) => s.state);
  const lastItem = useLastItem();
  const [scopeOpen, setScopeOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const cases = scenariosFor(role).length;

  // "/" searches from the main menu too
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const studied = (cat: PanelCategory): [number, number] => {
    const inCat = (ids: readonly string[], done: string[]) => [ids.filter((id) => done.includes(id)).length, ids.length] as [number, number];
    switch (cat) {
      case 'conditions': return inCat(CONDITION_IDS, learning.conditionsStudied);
      case 'medications': return inCat(MEDICATION_IDS, learning.medicationsReviewed);
      case 'procedures': return inCat(PROCEDURE_IDS, learning.proceduresReviewed);
      case 'cathlab': return inCat(Object.keys(lib?.cathlab ?? {}), learning.cathlabStudied);
      case 'cases': return inCat(Object.keys(CASE_DATA), learning.casesCompleted);
      case 'coronary': return inCat(CORONARY_IDS, learning.structuresViewed);
      case 'conduction': return inCat(CONDUCTION_IDS, learning.structuresViewed);
      default: return inCat(STRUCTURE_IDS.filter((id) => structureCategory(id) === 'anatomy'), learning.structuresViewed);
    }
  };

  const caseInProgress = simState && !simState.ended ? SCENARIO_BY_ID[simState.scenarioId] : null;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-cardiac-dark" aria-label="Main menu">
      <div className="max-w-5xl mx-auto px-4 pt-4 pb-10 sm:px-6 sm:pt-7">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.webp" alt="" width={33} height={48} className="h-12 w-auto drop-shadow-[0_2px_8px_rgba(220,38,38,0.4)]" />
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold text-white leading-tight">Main menu</h1>
            <p className="text-sm text-slate-300">Learn the heart, read the ECG, and treat patients in realistic cases.</p>
          </div>
        </div>

        <SearchBox
          id="menu-search"
          ref={searchRef}
          className="mt-4 !max-w-none"
          inputClassName="!h-12 !text-[15px] !rounded-xl"
          placeholder="Search anything — a rhythm, a drug, a valve, a stent…"
        />

        {/* ── Pick up where you left off ── */}
        {(caseInProgress || lastItem) && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {caseInProgress && (
              <ContinueCard label="Continue your case" title={caseInProgress.title} onClick={() => useAppStore.getState().setMode('simulator')} />
            )}
            {lastItem && (
              <ContinueCard label="Continue reading" title={nameOf(lastItem)} onClick={() => openById(lastItem)} />
            )}
          </div>
        )}

        {/* ── Role ── */}
        <section className="mt-5" aria-labelledby="menu-role">
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <h2 id="menu-role" className="text-[11px] uppercase tracking-wider text-slate-400">Your role — everything stays within its scope of practice</h2>
            <button onClick={() => setScopeOpen((v) => !v)} className="shrink-0 text-xs text-sky-300 hover:underline" aria-expanded={scopeOpen}>
              {scopeOpen ? 'Hide scope' : 'What can I do?'}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby="menu-role">
            {ROLES.map((l) => (
              <button
                key={l}
                onClick={() => setRole(l)}
                role="radio"
                aria-checked={l === role}
                className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                  l === role ? 'bg-cardiac-accent/20 border-cardiac-accent/60 text-cardiac-accent font-semibold' : 'border-slate-600 text-slate-200 hover:bg-cardiac-surface'
                }`}
              >
                {LEVEL_LABELS[l].short}
              </button>
            ))}
          </div>
          {scopeOpen && <div className="mt-2 p-3 rounded-xl bg-cardiac-panel border border-slate-700"><ScopeCard level={role} /></div>}
        </section>

        {/* ── Simulator ── */}
        <button
          onClick={() => useAppStore.getState().setMode('simulator')}
          className="mt-5 w-full text-left flex items-center gap-4 p-4 sm:p-5 rounded-2xl border border-cardiac-accent/50 bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent hover:border-cardiac-accent transition-colors"
        >
          <span className="w-12 h-12 shrink-0 rounded-xl bg-cardiac-accent text-slate-950 flex items-center justify-center"><IconPlay size={28} /></span>
          <span className="min-w-0">
            <span className="block text-base sm:text-lg font-semibold text-white">Case simulator</span>
            <span className="block text-xs sm:text-sm text-slate-300 leading-snug mt-0.5">
              Treat a patient from first contact to hand-off. What you do changes the monitor, the 12-lead and the story — then you get a score and what to fix.
              {' '}{cases} case{cases === 1 ? '' : 's'} for {LEVEL_LABELS[role].short}.
            </span>
          </span>
          <span className="ml-auto text-cardiac-accent text-xl shrink-0" aria-hidden>→</span>
        </button>

        {/* ── Library ── */}
        <MenuSection title="Learn" hint="Open a section, pick a topic and read. The 12-lead slides up from the bottom and the 3D heart slides down from the top whenever you want them.">
          {CATEGORIES.map((c) => {
            const [done, total] = studied(c.value);
            const look = CATEGORY_LOOK[c.value];
            return (
              <Tile key={c.value} title={c.label} text={c.text} icon={look.icon} tint={look.tint} onClick={() => openCategory(c.value)}>
                {total > 0 && (
                  <span className="mt-2 flex items-center gap-1.5 w-full" title={`${done} of ${total} studied`}>
                    <span className="flex-1 h-1 rounded-full bg-cardiac-dark overflow-hidden">
                      <span className="block h-full bg-emerald-500/80" style={{ width: `${(done / total) * 100}%` }} />
                    </span>
                    <span className="text-[10px] text-slate-500 whitespace-nowrap">{done}/{total}</span>
                  </span>
                )}
              </Tile>
            );
          })}
        </MenuSection>

        {/* ── Tools ── */}
        <MenuSection title="Tools" hint="Each opens full screen. Close it from its bar to get back to the reading.">
          {TOOLS.map((t) => <Tile key={t.tool} title={t.title} text={t.text} icon={t.icon} tint={t.tint} onClick={() => openTool(t.tool)} />)}
        </MenuSection>

        {/* ── Guided ── */}
        <MenuSection title="Try this" hint="Guided starts that set up the heart, the ECG and the reading for you." cols="sm:grid-cols-2 lg:grid-cols-3">
          {TOURS.map((t) => (
            <button key={t.title} onClick={t.go} className="text-left p-3 rounded-xl bg-cardiac-panel border border-slate-700 hover:border-cardiac-accent/60 transition-colors">
              <span className="block text-[13px] sm:text-sm font-semibold text-white">{t.title} →</span>
              <span className="block mt-1 text-[11px] sm:text-xs text-slate-400 leading-snug">{t.text}</span>
            </button>
          ))}
        </MenuSection>

        {/* ── Practise ── */}
        <MenuSection title="Practise">
          <Tile
            title="Quiz yourself" text={`${lib ? `${lib.quiz.length} questions` : 'Questions'} at every level, including live rhythm strips.`}
            icon={<IconQuiz size={22} />} tint="text-orange-300 bg-orange-500/15" onClick={() => useAppStore.getState().setQuizOpen(true)}
          />
          <Tile
            title="Ask the tutor" text="Ask a question in plain words and get an answer for your role."
            icon={<IconTutor size={22} />} tint="text-fuchsia-300 bg-fuchsia-500/15" onClick={() => useTutorStore.getState().setTutorOpen(true)}
          />
        </MenuSection>

        {/* ── More ── */}
        <MenuSection title="More">
          <Tile
            title="Help & shortcuts" text="How to get around, touch gestures and keyboard shortcuts."
            icon={<IconHelp size={22} />} tint="text-slate-200 bg-slate-500/20" onClick={() => useAppStore.getState().setHelpOpen(true)}
          />
          <InstallButton className="flex flex-col items-start text-left p-3 sm:p-3.5 rounded-xl bg-cardiac-panel border border-slate-700 hover:border-slate-500 transition-colors">
            <span className="w-9 h-9 rounded-lg flex items-center justify-center text-emerald-300 bg-emerald-500/15"><IconDownload size={22} /></span>
            <span className="block mt-2 text-[13px] sm:text-sm font-semibold text-white leading-tight">Install the app</span>
            <span className="block mt-1 text-[11px] sm:text-xs text-slate-400 leading-snug">Full screen, an icon on your home screen, and it works offline.</span>
          </InstallButton>
        </MenuSection>

        <p className="mt-8 text-[11px] text-slate-500 leading-relaxed max-w-3xl">
          Educational simulation only. Waveforms and hemodynamics are idealised models and doses are typical adult values for teaching.
          It is not a medical device and must not be used for diagnosis or treatment.
        </p>
      </div>
    </div>
  );
}

function MenuSection({ title, hint, cols = 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4', children }: { title: string; hint?: string; cols?: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      {hint && <p className="text-xs text-slate-400 mt-0.5 leading-snug">{hint}</p>}
      <div className={`mt-2.5 grid gap-2 sm:gap-3 ${cols}`}>{children}</div>
    </section>
  );
}

function Tile({ title, text, icon, tint, onClick, children }: { title: string; text: string; icon: React.ReactNode; tint: string; onClick: () => void; children?: React.ReactNode }) {
  return (
    <button onClick={onClick} className="flex flex-col items-start text-left p-3 sm:p-3.5 rounded-xl bg-cardiac-panel border border-slate-700 hover:border-slate-500 transition-colors">
      <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${tint}`}>{icon}</span>
      <span className="block mt-2 text-[13px] sm:text-sm font-semibold text-white leading-tight">{title}</span>
      <span className="block mt-1 text-[11px] sm:text-xs text-slate-400 leading-snug">{text}</span>
      {children}
    </button>
  );
}

function ContinueCard({ label, title, onClick }: { label: string; title: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-3 p-3 rounded-xl bg-sky-500/10 border border-sky-500/40 hover:border-sky-400 text-left transition-colors">
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] uppercase tracking-wider text-sky-300">{label}</span>
        <span className="block text-sm font-semibold text-white truncate">{title}</span>
      </span>
      <IconChevron size={18} className="text-sky-300 shrink-0" />
    </button>
  );
}
