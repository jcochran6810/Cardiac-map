/**
 * Local tutor engine.
 *
 * Answers questions from the built-in knowledge base (conditions, procedures,
 * medications, structures, cases) with content adapted to the learner's level.
 * It runs entirely in the browser and is used as the fallback when no Claude
 * API key is configured on the server.
 */
import { CONDITION_DATA, CONDITION_IDS, type ConditionInfo } from '@/data/conditionData';
import { PROCEDURE_DATA, PROCEDURE_IDS } from '@/data/procedureData';
import { MEDICATION_DATA, MEDICATION_IDS } from '@/data/medicationData';
import { STRUCTURE_IDS, getStructureTitle, getStructureTabContent } from '@/data/structureData';
import { CASE_DATA } from '@/data/caseData';
import { CONDITION_SHORT_NAMES, LEVEL_LABELS } from '@/data/navigation';

export interface TutorContextInfo {
  learningLevel: number;
  selectedStructureId: string | null;
  selectedConditionId: string | null;
  selectedProcedureId: string | null;
  selectedMedicationId: string | null;
  activeCaseId: string | null;
  activeProfileId: string;
  heartRate: number;
}

/** A compact, plain-text description of the current app context (also sent to the API). */
export function describeContext(ctx: TutorContextInfo): string {
  const parts: string[] = [`Learner level: ${LEVEL_LABELS[ctx.learningLevel - 1]}`];
  if (ctx.selectedConditionId && CONDITION_DATA[ctx.selectedConditionId]) parts.push(`Selected condition: ${CONDITION_DATA[ctx.selectedConditionId].title}`);
  if (ctx.selectedProcedureId && PROCEDURE_DATA[ctx.selectedProcedureId]) parts.push(`Selected procedure: ${PROCEDURE_DATA[ctx.selectedProcedureId].name}`);
  if (ctx.selectedMedicationId && MEDICATION_DATA[ctx.selectedMedicationId]) parts.push(`Selected medication: ${MEDICATION_DATA[ctx.selectedMedicationId].name}`);
  if (ctx.selectedStructureId) parts.push(`Selected anatomy: ${getStructureTitle(ctx.selectedStructureId)}`);
  if (ctx.activeCaseId && CASE_DATA[ctx.activeCaseId]) parts.push(`Active case: ${CASE_DATA[ctx.activeCaseId].title}`);
  parts.push(`ECG rhythm shown: ${ctx.activeProfileId.replace(/-/g, ' ')} at ${ctx.heartRate} bpm`);
  return parts.join('\n');
}

/** Reference material for the selected context, used to ground the Claude answer. */
export function contextReference(ctx: TutorContextInfo): string {
  const lvl = ctx.learningLevel;
  const out: string[] = [];
  const cond = ctx.selectedConditionId ? CONDITION_DATA[ctx.selectedConditionId] : null;
  if (cond) {
    out.push(`## ${cond.title}\n${cond.overview}\nPathophysiology: ${cond.pathophysiology}\nECG: ${cond.ecg.join('; ')}\nField care: ${cond.fieldCare.join('; ')}\nHospital care: ${cond.hospitalCare.join('; ')}\nCardiology care: ${cond.cardiologyCare.join('; ')}\nMedications: ${cond.medications.join('; ')}\nComplications: ${cond.complications.join('; ')}\nTeaching: ${cond.teaching.join('; ')}\nLevel summary: ${cond.levelSummaries[lvl - 1]}`);
  }
  const proc = ctx.selectedProcedureId ? PROCEDURE_DATA[ctx.selectedProcedureId] : null;
  if (proc) {
    out.push(`## ${proc.name}\n${proc.overview}\nIndications: ${proc.indications.join('; ')}\nSteps: ${proc.steps.map((s) => `${s.step}. ${s.title}: ${s.description}`).join(' ')}\nComplications: ${proc.complications.join('; ')}\nTeaching: ${proc.teaching.join('; ')}`);
  }
  const med = ctx.selectedMedicationId ? MEDICATION_DATA[ctx.selectedMedicationId] : null;
  if (med) {
    out.push(`## ${med.name} (${med.drugClass})\n${med.overview}\nMechanism: ${med.mechanism}\nDosing: ${med.dosing.join('; ')}\nContraindications: ${med.contraindications.join('; ')}\nECG effects: ${med.ecgEffects.join('; ')}\nTeaching: ${med.teaching.join('; ')}`);
  }
  if (ctx.selectedStructureId) {
    out.push(`## ${getStructureTitle(ctx.selectedStructureId)}\n${getStructureTabContent(ctx.selectedStructureId, 'overview').join('; ')}\nPhysiology: ${getStructureTabContent(ctx.selectedStructureId, 'physiology').join('; ')}\nECG: ${getStructureTabContent(ctx.selectedStructureId, 'ecg').join('; ')}`);
  }
  const c = ctx.activeCaseId ? CASE_DATA[ctx.activeCaseId] : null;
  if (c) {
    out.push(`## Case: ${c.title}\n${c.presentation}\nGuidelines: ${c.guidelines.join(' ')}\nPitfalls: ${c.pitfalls.join('; ')}\nTeaching: ${c.teaching.join('; ')}`);
  }
  return out.join('\n\n');
}

// ─── Local answer generation ─────────────────────────────────────────

type Aspect = 'overview' | 'pathophysiology' | 'ecg' | 'symptoms' | 'treatment' | 'medications' | 'complications' | 'anatomy' | 'imaging' | 'teaching' | 'procedure' | 'dosing' | 'mechanism' | 'contraindications';

const ASPECT_KEYWORDS: [Aspect, RegExp][] = [
  ['ecg', /\b(ecg|ekg|12.?lead|rhythm|st (elevation|depression)|qrs|p wave|t wave|interval|lead)/i],
  ['dosing', /\b(dose|dosing|how much|mg|mcg|bolus|infusion|how many)/i],
  ['mechanism', /\b(mechanism|how does .* work|works by|action)/i],
  ['contraindications', /\b(contraindicat|avoid|should not|shouldn'?t|safe to|when not)/i],
  ['pathophysiology', /\b(patho|why|cause|mechanism|what happens|how does)/i],
  ['symptoms', /\b(symptom|present|sign|feel|look like|exam)/i],
  ['treatment', /\b(treat|manage|care|protocol|what (do|should) i do|first.?line|algorithm|handle)/i],
  ['medications', /\b(medic|drug|pharm|give|administer)/i],
  ['complications', /\b(complication|risk|danger|pitfall|worst|go wrong)/i],
  ['anatomy', /\b(anatom|where|located|structure|supply|artery)/i],
  ['imaging', /\b(imag|echo|ultrasound|ct\b|mri|angiogra|x-?ray)/i],
  ['procedure', /\b(procedure|step|walk (me )?through|how is .* (done|performed)|technique)/i],
  ['teaching', /\b(pearl|tip|remember|teach|key point|summar)/i],
];

function detectAspect(q: string): Aspect {
  for (const [aspect, re] of ASPECT_KEYWORDS) if (re.test(q)) return aspect;
  return 'overview';
}

const bullets = (items: string[], max = 6) => items.slice(0, max).map((i) => `• ${i}`).join('\n');

function levelPrefix(level: number) {
  return `*[${LEVEL_LABELS[level - 1]} level]*\n\n`;
}

function answerCondition(c: ConditionInfo, aspect: Aspect, level: number): string {
  const tailored = level <= 2 ? c.fieldCare : level === 3 ? c.hospitalCare : level === 4 ? c.cardiologyCare : c.procedure;
  const tailoredLabel = level <= 2 ? 'Field care' : level === 3 ? 'Hospital care' : level === 4 ? 'Cardiology care' : 'Procedures';
  switch (aspect) {
    case 'pathophysiology': return `**${c.title} — pathophysiology**\n\n${c.pathophysiology}\n\n**Anatomy involved**\n${bullets(c.anatomy)}`;
    case 'ecg': return `**${c.title} — ECG findings**\n${bullets(c.ecg, 8)}\n\nThe 12-lead below is showing this rhythm now — click a lead to see its axis through the 3D heart.`;
    case 'symptoms': return `**${c.title} — presentation**\n${bullets(c.symptoms, 8)}`;
    case 'treatment': return `**${c.title} — ${tailoredLabel}**\n${bullets(tailored, 8)}\n\n**Medications**\n${bullets(c.medications, 5)}`;
    case 'medications': case 'dosing': return `**${c.title} — medications**\n${bullets(c.medications, 8)}\n\nOpen the Meds tab for full dosing, contraindications and monitoring of each drug.`;
    case 'complications': return `**${c.title} — complications and pitfalls**\n${bullets(c.complications, 8)}`;
    case 'anatomy': return `**${c.title} — anatomy**\n${bullets(c.anatomy, 8)}\n\nThe affected structures are highlighted on the 3D heart.`;
    case 'imaging': return `**${c.title} — imaging**\n${bullets(c.imaging, 8)}`;
    case 'procedure': return `**${c.title} — procedures**\n${bullets(c.procedure, 8)}`;
    case 'teaching': return `**${c.title} — key points**\n${bullets(c.teaching, 8)}`;
    default: return `**${c.title}**\n\n${c.levelSummaries[level - 1]}\n\n${c.overview}\n\n**${tailoredLabel}**\n${bullets(tailored, 4)}\n\nAsk me about the ECG, pathophysiology, treatment, medications or complications.`;
  }
}

function answerProcedure(id: string, aspect: Aspect, level: number): string {
  const p = PROCEDURE_DATA[id];
  switch (aspect) {
    case 'procedure': return `**${p.name} — steps**\n${p.steps.map((s) => `${s.step}. **${s.title}** — ${s.description}`).join('\n')}\n\nUse the Procedure tab's Prev/Next to follow each step on the 3D heart.`;
    case 'ecg': return `**${p.name} — ECG considerations**\n${bullets(p.ecgConsiderations)}`;
    case 'complications': return `**${p.name} — complications**\n${bullets(p.complications, 8)}`;
    case 'anatomy': return `**${p.name} — anatomy**\n${bullets(p.anatomy, 8)}\n\nAccess: ${p.accessSite}`;
    case 'treatment': case 'symptoms': return `**${p.name} — indications**\n${bullets(p.indications)}\n\n**Contraindications**\n${bullets(p.contraindications)}`;
    case 'imaging': return `**${p.name} — imaging**\n${bullets(p.imaging)}`;
    case 'teaching': return `**${p.name} — key points**\n${bullets(p.teaching)}`;
    default: return `**${p.name}**\n\n${p.levelSummaries[level - 1]}\n\n${p.overview}\n\n**Indications**\n${bullets(p.indications, 4)}\n\nAsk me to walk through the steps, or about complications, ECG changes or equipment.`;
  }
}

function answerMedication(id: string, aspect: Aspect, level: number): string {
  const m = MEDICATION_DATA[id];
  switch (aspect) {
    case 'mechanism': case 'pathophysiology': return `**${m.name} — mechanism**\n\n${m.mechanism}\n\n**Hemodynamic effects**\n${bullets(m.hemodynamicEffects)}`;
    case 'dosing': return `**${m.name} — dosing**\n${bullets(m.dosing)}\n\nRoutes: ${m.routes.join(', ')}\n\n*Reference values only — follow local protocols.*`;
    case 'contraindications': case 'complications': return `**${m.name} — contraindications**\n${bullets(m.contraindications)}\n\n**Side effects**\n${bullets(m.sideEffects)}`;
    case 'ecg': return `**${m.name} — ECG effects**\n${bullets(m.ecgEffects)}`;
    case 'treatment': case 'symptoms': return `**${m.name} — indications**\n${bullets(m.indications)}\n\n**ACLS**\n${bullets(m.aclsUses)}`;
    case 'teaching': return `**${m.name} — key points**\n${bullets(m.teaching)}`;
    default: return `**${m.name}** (${m.drugClass})\n\n${m.levelSummaries[level - 1]}\n\n${m.overview}\n\nAsk about the mechanism, dosing, contraindications, ECG effects or monitoring.`;
  }
}

function answerStructure(id: string, aspect: Aspect): string {
  const title = getStructureTitle(id);
  const tab = aspect === 'pathophysiology' ? 'physiology' : aspect === 'treatment' ? 'hospital-care' : aspect === 'dosing' ? 'medications' : aspect === 'mechanism' ? 'physiology' : aspect === 'contraindications' ? 'complications' : aspect;
  const content = getStructureTabContent(id, tab);
  if (content.length === 0) return `**${title}**\n${bullets(getStructureTabContent(id, 'overview'))}`;
  return `**${title} — ${tab.replace(/-/g, ' ')}**\n${bullets(content, 8)}`;
}

function answerCase(id: string, aspect: Aspect, level: number): string {
  const c = CASE_DATA[id];
  switch (aspect) {
    case 'treatment': case 'procedure': return `**${c.title} — management**\n${bullets(c.guidelines, 10)}`;
    case 'medications': case 'dosing': return `**${c.title} — medications**\n${bullets(c.medications)}`;
    case 'complications': return `**${c.title} — pitfalls**\n${bullets(c.pitfalls)}`;
    case 'ecg': return `**${c.title} — ECG**\n\nThe monitor shows ${c.ecgProfile.replace(/-/g, ' ')} at ${c.heartRate} bpm. ${CONDITION_IDS.find((cid) => CONDITION_DATA[cid].ecgProfile === c.ecgProfile) ? 'Select the matching condition for a full ECG breakdown.' : ''}`;
    case 'symptoms': return `**${c.title} — presentation**\n\n${c.presentation}\n\n**Exam:** ${c.physicalExam}`;
    case 'teaching': return `**${c.title} — teaching points**\n${bullets(c.teaching)}\n\n**Disposition:** ${c.disposition}`;
    default: return `**${c.title}** (${c.difficulty})\n\n${c.presentation}\n\n**Key interventions**\n${bullets(c.keyInterventions)}\n\nTry the Simulate tab to work through it — I can explain any step. ${level <= 2 ? 'Focus on the first three steps: they are the ones you own in the field.' : ''}`;
  }
}

/** Find knowledge-base entries mentioned in the question. */
function findMentions(q: string): { conditions: string[]; procedures: string[]; medications: string[]; structures: string[] } {
  const text = q.toLowerCase();
  const conditions = CONDITION_IDS.filter((id) => {
    const names = [CONDITION_DATA[id].title, CONDITION_SHORT_NAMES[id] ?? '', id.replace(/-/g, ' ')].map((n) => n.toLowerCase());
    return names.some((n) => n.length > 2 && text.includes(n));
  });
  const procedures = PROCEDURE_IDS.filter((id) => {
    const p = PROCEDURE_DATA[id];
    const names = [p.name.toLowerCase(), id.replace(/-/g, ' ')];
    return names.some((n) => text.includes(n)) || p.name.toLowerCase().split(/[\s/()]+/).filter((w) => w.length > 4).some((w) => text.includes(w) && !['implantation', 'placement', 'closure', 'assessment', 'imaging'].includes(w));
  });
  const medications = MEDICATION_IDS.filter((id) => {
    const m = MEDICATION_DATA[id];
    return [m.name, ...m.brandNames, id.replace(/-/g, ' ')].some((n) => text.includes(n.toLowerCase().split(' (')[0]));
  });
  const structures = STRUCTURE_IDS.filter((id) => text.includes(getStructureTitle(id).toLowerCase()) || text.includes(id.replace(/-/g, ' ')));
  return { conditions, procedures, medications, structures };
}

const GENERAL_TOPICS: { re: RegExp; answer: string }[] = [
  {
    re: /cardiac cycle|systole|diastole/i,
    answer: `**The cardiac cycle**\n\nOne beat has two big phases, and the ECG, the 3D heart and the Hemodynamics panel all show the same moment:\n\n**Systole** (ventricles squeeze): after the QRS the ventricles contract. First all four valves are shut and pressure climbs (isovolumetric contraction), then the aortic and pulmonary valves open and blood is ejected (rapid then reduced ejection, through the T wave).\n\n**Diastole** (ventricles relax and fill): all valves shut again while pressure falls (isovolumetric relaxation), then the mitral and tricuspid valves open — rapid filling, a slow phase (diastasis), and finally the atrial kick after the P wave tops up the last ~20%.\n\nAt 72 bpm a cycle is ~0.83 s: systole ~0.3 s, diastole the rest. Faster rates shorten diastole most — which is why tachycardia hurts filling and coronary perfusion.`,
  },
  {
    re: /conduction system|how does the (heart'?s )?electric|sa node|sinus node|av node|purkinje|bundle of his/i,
    answer: `**The conduction system**\n\n1. **SA node** (top of the right atrium) fires 60-100/min → atria depolarise → **P wave**.\n2. **AV node** deliberately delays the impulse (the PR segment) so the atria can finish emptying.\n3. **Bundle of His** carries it through the fibrous skeleton.\n4. **Right and left bundle branches** (the left splits into anterior and posterior fascicles) run down the septum.\n5. **Purkinje fibres** spread it through both ventricles in ~80 ms → **QRS**.\n6. Ventricles repolarise → **T wave**.\n\nWatch the yellow-to-red arrows on the 3D heart: they run exactly in step with the playhead on the ECG. Select "Conduction" in the left panel for each structure.`,
  },
  {
    re: /ejection fraction|\bef\b/i,
    answer: `**Ejection fraction**\n\nEF = stroke volume ÷ end-diastolic volume. Normal is 55-70%: a 120 mL ventricle ejecting 70 mL has an EF of ~58%.\n\n• ≤ 40% = HFrEF (reduced)\n• 41-49% = mildly reduced\n• ≥ 50% with heart-failure symptoms = HFpEF (preserved)\n\nThe Hemodynamics panel shows the live LV volume curve and EF; select "HFrEF" or "Dilated Cardiomyopathy" to see a dilated ventricle with a low EF.`,
  },
  {
    re: /preload|afterload|contractility|frank.?starling/i,
    answer: `**Preload, afterload and contractility**\n\n• **Preload** — how stretched the ventricle is at end-diastole (≈ end-diastolic volume, driven by venous return). More preload → stronger contraction (Frank-Starling), up to a point. Nitrates and diuretics reduce it; fluids raise it.\n• **Afterload** — the pressure the ventricle must overcome to eject (≈ aortic pressure / systemic vascular resistance, or a stenotic aortic valve). Vasodilators lower it; vasopressors raise it.\n• **Contractility** — the intrinsic force of contraction at a given preload and afterload. Inotropes (dobutamine, milrinone) raise it; beta-blockers and ischaemia lower it.\n\nCardiac output = HR × stroke volume, and stroke volume rises with preload and contractility and falls with afterload.`,
  },
  {
    re: /stemi|st elevation/i,
    answer: `**ST elevation and STEMI**\n\nA completely occluded coronary artery causes full-thickness (transmural) injury; the injured muscle produces an injury current that lifts the ST segment in the leads that face it, with reciprocal depression in the opposite leads.\n\n• Anterior V1-V4 → LAD\n• Inferior II, III, aVF → RCA (check V4R for RV infarct)\n• Lateral I, aVL, V5-V6 → LCx / diagonal\n\nTreatment is reperfusion — primary PCI within 90-120 min or fibrinolysis — plus aspirin, a P2Y12 inhibitor and heparin. Select a STEMI condition to see the regional ST changes on the 12-lead and the affected artery on the heart.`,
  },
  {
    re: /atrial fibrillation|\bafib\b|\baf\b/i,
    answer: answerCondition(CONDITION_DATA['atrial-fibrillation'], 'overview', 2),
  },
  {
    re: /beta.?blocker/i,
    answer: `**Beta-blockers**\n\nThey block beta-1 receptors in the heart: slower sinus rate, slower AV conduction, weaker contraction and less oxygen demand. Uses: rate control in AF, angina, after MI, and — as metoprolol succinate, carvedilol or bisoprolol — long-term survival benefit in HFrEF.\n\nDo not give them in cardiogenic shock, decompensated heart failure, severe bradycardia or AV block, pre-excited AF, or severe asthma. Open the Meds tab (Metoprolol, Carvedilol, Esmolol) for dosing.`,
  },
];

/**
 * Produce an answer from the local knowledge base.
 */
export function localTutorAnswer(question: string, ctx: TutorContextInfo): string {
  const q = question.trim();
  const level = ctx.learningLevel;
  const aspect = detectAspect(q);
  const mentions = findMentions(q);

  // 1. Explicit mentions win
  if (mentions.conditions.length > 0) return levelPrefix(level) + answerCondition(CONDITION_DATA[mentions.conditions[0]], aspect, level);
  if (mentions.medications.length > 0) return levelPrefix(level) + answerMedication(mentions.medications[0], aspect, level);
  if (mentions.procedures.length > 0) return levelPrefix(level) + answerProcedure(mentions.procedures[0], aspect, level);
  if (mentions.structures.length > 0) return levelPrefix(level) + answerStructure(mentions.structures[0], aspect);

  // 2. General topics
  for (const t of GENERAL_TOPICS) if (t.re.test(q)) return levelPrefix(level) + t.answer;

  // 3. Fall back to whatever is selected in the app
  if (ctx.activeCaseId && CASE_DATA[ctx.activeCaseId]) return levelPrefix(level) + answerCase(ctx.activeCaseId, aspect, level);
  if (ctx.selectedConditionId && CONDITION_DATA[ctx.selectedConditionId]) return levelPrefix(level) + answerCondition(CONDITION_DATA[ctx.selectedConditionId], aspect, level);
  if (ctx.selectedProcedureId && PROCEDURE_DATA[ctx.selectedProcedureId]) return levelPrefix(level) + answerProcedure(ctx.selectedProcedureId, aspect, level);
  if (ctx.selectedMedicationId && MEDICATION_DATA[ctx.selectedMedicationId]) return levelPrefix(level) + answerMedication(ctx.selectedMedicationId, aspect, level);
  if (ctx.selectedStructureId) return levelPrefix(level) + answerStructure(ctx.selectedStructureId, aspect);

  // 4. Rhythm currently on the monitor
  const rhythmCondition = CONDITION_IDS.find((id) => CONDITION_DATA[id].ecgProfile === ctx.activeProfileId);
  if (/rhythm|monitor|this ecg|what (is|am i) (this|looking)/i.test(q) && rhythmCondition) {
    return levelPrefix(level) + answerCondition(CONDITION_DATA[rhythmCondition], 'ecg', level);
  }

  return `I could not match that to a topic yet. Try naming a condition, procedure, medication or structure — for example:\n\n• "Explain the ECG in inferior STEMI"\n• "How much adenosine for SVT?"\n• "Walk me through pericardiocentesis"\n• "Why does aortic stenosis cause syncope?"\n\nOr select something in the left panel and just ask "explain this", "treatment?" or "complications?".`;
}

/** Context-aware suggested questions. */
export function suggestedQuestions(ctx: TutorContextInfo): string[] {
  if (ctx.activeCaseId && CASE_DATA[ctx.activeCaseId]) return ['What is my first priority in this case?', 'Which pitfalls should I avoid?', 'What medications are used here?', 'Explain the ECG in this case'];
  if (ctx.selectedConditionId && CONDITION_DATA[ctx.selectedConditionId]) return ['Explain the ECG findings', 'What is the pathophysiology?', 'How do I treat this?', 'What are the complications?'];
  if (ctx.selectedProcedureId && PROCEDURE_DATA[ctx.selectedProcedureId]) return ['Walk me through the steps', 'What are the indications?', 'What can go wrong?', 'What ECG changes should I expect?'];
  if (ctx.selectedMedicationId && MEDICATION_DATA[ctx.selectedMedicationId]) return ['How does it work?', 'What is the dose?', 'When should I not give it?', 'What ECG effects does it have?'];
  if (ctx.selectedStructureId) return ['What does this structure do?', 'How does it relate to the ECG?', 'What conditions affect it?'];
  return ['Explain the cardiac cycle', 'How does the conduction system work?', 'What happens during a STEMI?', 'Explain preload and afterload', 'What causes atrial fibrillation?'];
}
