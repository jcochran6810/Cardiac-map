'use client';

import React from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useSceneStore } from '@/store/useSceneStore';
import { useConditionStore } from '@/store/useConditionStore';
import { useProcedureStore } from '@/store/useProcedureStore';

const TABS = [
  'overview', 'anatomy', 'physiology', 'symptoms', 'ecg',
  'imaging', 'medications', 'field-care', 'hospital-care',
  'cardiology-care', 'procedure', 'complications', 'teaching',
];

// Content data for anatomy structures
const ANATOMY_INFO: Record<string, { title: string; summary: string; details: string[] }> = {
  'right-atrium': {
    title: 'Right Atrium',
    summary: 'Receives deoxygenated blood from the systemic circulation via the SVC and IVC.',
    details: [
      'Thin-walled chamber receiving venous return',
      'Contains the SA node (primary pacemaker)',
      'Crista terminalis divides smooth from trabeculated portions',
      'Coronary sinus drains into the posterior floor',
      'Eustachian valve guards the IVC ostium',
    ],
  },
  'left-atrium': {
    title: 'Left Atrium',
    summary: 'Receives oxygenated blood from the pulmonary veins and passes it to the left ventricle.',
    details: [
      'Smooth-walled posterior chamber',
      'Receives 4 pulmonary veins (RS, RI, LS, LI)',
      'Left atrial appendage is a common site for thrombus in AF',
      'Posterior wall is adjacent to esophagus (TEE window)',
      'Important target for AF ablation (pulmonary vein isolation)',
    ],
  },
  'right-ventricle': {
    title: 'Right Ventricle',
    summary: 'Pumps deoxygenated blood to the lungs via the pulmonary artery.',
    details: [
      'Crescent-shaped chamber wrapping around the LV',
      'Thinner wall than LV (lower pressure system)',
      'Contains moderator band with RBB conduction',
      'RVOT leads to pulmonary valve',
      'Vulnerable to pressure overload in PE / pulmonary HTN',
    ],
  },
  'left-ventricle': {
    title: 'Left Ventricle',
    summary: 'The main pumping chamber of the heart, ejecting oxygenated blood into the aorta.',
    details: [
      'Thick-walled (8-12mm) conical chamber',
      'Generates systemic arterial pressure',
      'Papillary muscles anchor mitral leaflets via chordae',
      'Normal EF: 55-70%',
      'AHA 17-segment model used for wall motion assessment',
      'Apex is the most distal point, often supplied by LAD',
    ],
  },
};

const CONDITION_INFO: Record<string, { title: string; summary: string; pathophys: string; ecg: string; treatment: string }> = {
  'anterior-stemi': {
    title: 'Anterior STEMI',
    summary: 'ST-elevation myocardial infarction affecting the anterior wall, typically from LAD occlusion.',
    pathophys: 'Acute thrombotic occlusion of the LAD causes transmural ischemia of the anterior wall, septum, and often the apex. Without reperfusion, myocardial necrosis progresses within hours.',
    ecg: 'ST elevation in V1-V4 (may extend to V5-V6). Reciprocal ST depression in inferior leads (II, III, aVF). May see hyperacute T waves early.',
    treatment: 'Emergent reperfusion: primary PCI (preferred) or fibrinolysis if PCI not available within 120 minutes. Dual antiplatelet therapy, anticoagulation, beta-blocker, statin, ACE inhibitor.',
  },
  'atrial-fibrillation': {
    title: 'Atrial Fibrillation',
    summary: 'Chaotic atrial electrical activity causing irregularly irregular ventricular response.',
    pathophys: 'Multiple wavelets of reentry or focal triggers (often from pulmonary veins) create disorganized atrial depolarization. AV node conducts irregularly to ventricles.',
    ecg: 'Absent P waves, irregular fibrillatory baseline, irregularly irregular RR intervals, narrow QRS (unless aberrant conduction).',
    treatment: 'Rate control (beta-blocker or CCB), rhythm control (amiodarone, cardioversion, ablation), anticoagulation for stroke prevention (CHA2DS2-VASc scoring).',
  },
};

export default function RightPanel() {
  const { rightPanelOpen, rightPanelTab, setRightPanelTab, learningLevel } = useAppStore();
  const { selectedStructureId } = useSceneStore();
  const { selectedConditionId } = useConditionStore();
  const { selectedProcedureId } = useProcedureStore();

  if (!rightPanelOpen) return null;

  const anatomyInfo = selectedStructureId ? ANATOMY_INFO[selectedStructureId] : null;
  const conditionInfo = selectedConditionId ? CONDITION_INFO[selectedConditionId] : null;

  return (
    <aside className="w-80 bg-cardiac-panel border-l border-slate-700 flex flex-col shrink-0 overflow-hidden">
      {/* Tabs */}
      <div className="flex flex-wrap border-b border-slate-700 px-1 py-1 gap-0.5">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setRightPanelTab(tab)}
            className={`px-2 py-1 text-[10px] rounded capitalize transition-colors ${
              rightPanelTab === tab
                ? 'bg-cardiac-accent/20 text-cardiac-accent'
                : 'text-slate-500 hover:text-white'
            }`}
          >
            {tab.replace('-', ' ')}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 text-xs text-slate-300 space-y-3">
        {/* Welcome / empty state */}
        {!anatomyInfo && !conditionInfo && !selectedProcedureId && (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">♥</div>
            <h3 className="text-sm font-semibold text-white mb-2">Cardiac Education Platform</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Select a structure, condition, or procedure from the left panel to view detailed information.
            </p>
            <div className="mt-4 p-3 bg-cardiac-dark rounded-lg text-left">
              <p className="text-cardiac-accent text-[10px] font-semibold mb-1">EDUCATIONAL DISCLAIMER</p>
              <p className="text-slate-500 text-[10px] leading-relaxed">
                This is an educational simulation only. Not intended for diagnosis or treatment.
                Waveforms and animations are representative teaching models.
              </p>
            </div>
            <div className="mt-3 text-slate-500 text-[10px]">
              Current Level: {['', 'EMT', 'Paramedic', 'ED/ICU', 'Cardiology', 'Interventional'][learningLevel]}
            </div>
          </div>
        )}

        {/* Anatomy detail */}
        {anatomyInfo && (
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">{anatomyInfo.title}</h3>
            <p className="text-slate-300 mb-3 leading-relaxed">{anatomyInfo.summary}</p>

            <div className="space-y-2">
              <h4 className="text-[10px] font-semibold text-cardiac-accent uppercase tracking-wider">Key Points</h4>
              <ul className="space-y-1">
                {anatomyInfo.details.map((d, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-cardiac-accent mt-0.5">•</span>
                    <span className="text-slate-400 leading-relaxed">{d}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 p-2 bg-cardiac-dark rounded">
              <h4 className="text-[10px] font-semibold text-cardiac-accent uppercase mb-1">Learning Level</h4>
              <p className="text-slate-500 text-[10px]">
                Viewing at {['', 'EMT', 'Paramedic', 'ED/ICU', 'Cardiology', 'Interventional'][learningLevel]} level
              </p>
            </div>
          </div>
        )}

        {/* Condition detail */}
        {conditionInfo && (
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">{conditionInfo.title}</h3>
            <p className="text-slate-300 mb-3 leading-relaxed">{conditionInfo.summary}</p>

            {rightPanelTab === 'overview' && (
              <div className="space-y-3">
                <Section title="Pathophysiology" content={conditionInfo.pathophys} />
                <Section title="ECG Findings" content={conditionInfo.ecg} />
                <Section title="Treatment" content={conditionInfo.treatment} />
              </div>
            )}

            {rightPanelTab === 'ecg' && (
              <Section title="ECG Interpretation" content={conditionInfo.ecg} />
            )}

            {rightPanelTab === 'medications' && (
              <Section title="Treatment Approach" content={conditionInfo.treatment} />
            )}
          </div>
        )}

        {/* Procedure detail */}
        {selectedProcedureId && !conditionInfo && (
          <div>
            <h3 className="text-sm font-semibold text-white mb-1 capitalize">
              {selectedProcedureId.replace(/-/g, ' ')}
            </h3>
            <p className="text-slate-400 mb-3">
              Select steps from the procedure panel to view the simulation.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}

function Section({ title, content }: { title: string; content: string }) {
  return (
    <div className="p-2 bg-cardiac-dark rounded">
      <h4 className="text-[10px] font-semibold text-cardiac-accent uppercase tracking-wider mb-1">{title}</h4>
      <p className="text-slate-400 leading-relaxed">{content}</p>
    </div>
  );
}
