/**
 * Offline tutor: answers questions from CardioSim's reviewed content library.
 * It detects intent (ECG? treatment? dose? symptoms? mechanism?), finds the
 * best-matching item, and composes a level-appropriate answer with links.
 */
import type { ContentLibrary } from '@/lib/content';
import { searchLibrary } from '@/lib/content';
import type { LearningLevel } from '@/store/useAppStore';
import { LEVEL_LABELS } from '@/store/useAppStore';
import { resolveProfile, CONDITION_TO_PROFILE } from '@/lib/ecg/profiles';
import { CASE_DATA } from '@/data/caseData';

export interface TutorAnswer {
  title: string;
  text?: string;
  bullets: string[];
  links: string[];
  followUps: string[];
}

export interface TutorContext {
  level: LearningLevel;
  profileId: string;
  selectedStructureId: string | null;
  selectedConditionId: string | null;
  selectedProcedureId: string | null;
  selectedMedicationId: string | null;
}

const PRIMERS: { match: RegExp; answer: TutorAnswer }[] = [
  {
    match: /cardiac cycle|wiggers|systole.*diastole|diastole.*systole|phases? of the heart/i,
    answer: {
      title: 'The cardiac cycle',
      bullets: [
        'Atrial systole follows the P wave and tops up ventricular filling by ~15–25% (more in stiff ventricles; lost in AF)',
        'Isovolumetric contraction starts at S1 (mitral/tricuspid closure) just after the QRS: all valves closed, pressure rises, volume constant',
        'Ejection begins when LV pressure exceeds aortic pressure (aortic valve opens) — this sits under the ST segment; rapid then reduced ejection',
        'Isovolumetric relaxation begins at S2 (aortic/pulmonic closure, ≈ end of the T wave): pressure falls with no volume change',
        'Rapid filling starts when the mitral valve opens (S3 here: normal in the young, pathological in HF / volume overload), then diastasis — the phase that shortens most as heart rate rises',
        'At 75 bpm a cycle is ~0.8 s; systole ~0.3 s and diastole ~0.5 s, so tachycardia mainly steals diastolic filling and coronary perfusion time',
      ],
      links: [],
      followUps: ['What is ejection fraction?', 'Explain preload and afterload'],
      text: 'Open “Wiggers / PV” below the ECG to see pressures, volume and heart sounds move in time with this heart.',
    },
  },
  {
    match: /conduction system|how does the heart beat electrically|electrical (system|pathway)|sa node.*av node/i,
    answer: {
      title: 'The conduction system',
      bullets: [
        'SA node (RA at the SVC junction) fires 60–100/min → P wave as both atria depolarise (Bachmann\'s bundle carries it to the LA)',
        'AV node (Koch\'s triangle) delays conduction ~0.1 s — the PR segment — so the atria finish emptying first',
        'Bundle of His penetrates the fibrous skeleton, then divides into right and left bundle branches (left → anterior and posterior fascicles)',
        'Purkinje fibres spread activation endocardium → epicardium in ~80–100 ms, producing the narrow QRS',
        'Backup pacemakers: junction 40–60/min, ventricles 20–40/min — why escape rhythms are slow and wide escapes unreliable',
      ],
      links: ['sa-node', 'av-node', 'bundle-of-his', 'left-bundle-branch', 'right-bundle-branch'],
      followUps: ['What happens in complete heart block?', 'What does a bundle branch block look like?'],
      text: 'Switch the 3D view to “Conduction” to watch each segment fire with the ECG.',
    },
  },
  {
    match: /preload|afterload|frank.?starling|contractility/i,
    answer: {
      title: 'Preload, afterload and contractility',
      bullets: [
        'Preload = ventricular stretch at end-diastole (approximated by EDV or filling pressure); more stretch → stronger contraction (Frank–Starling) up to a limit',
        'Afterload = the load the ventricle ejects against (wall stress; clinically aortic pressure/SVR, or a stenotic aortic valve)',
        'Contractility = intrinsic strength of contraction independent of loading (raised by sympathetic tone/inotropes, reduced by ischaemia, HF)',
        'Stroke volume rises with preload and contractility and falls with afterload; CO = HR × SV',
        'Preload-dependent states: RV infarction, tamponade, hypovolaemia, HCM with obstruction — vasodilators/nitrates can crash the BP',
      ],
      links: ['left-ventricle', 'hfref', 'cardiogenic-shock'],
      followUps: ['What is ejection fraction?', 'Explain the cardiac cycle'],
    },
  },
  {
    match: /ejection fraction|\bef\b|cardiac output|stroke volume/i,
    answer: {
      title: 'Ejection fraction & cardiac output',
      bullets: [
        'EF = (EDV − ESV) / EDV × 100; normal LVEF ~ 52–72% (men) / 54–74% (women) by ASE',
        'HF categories (2022 AHA/ACC/HFSA): HFrEF ≤ 40%, HFmrEF 41–49%, HFpEF ≥ 50%',
        'Stroke volume = EDV − ESV (~60–100 mL); cardiac output = SV × HR (~4–8 L/min); cardiac index = CO / BSA (~2.5–4 L/min/m²)',
        'A normal EF does not mean normal output: tamponade and hypovolaemia shrink EDV, and severe MR inflates EF while forward flow falls',
      ],
      links: ['left-ventricle', 'hfref', 'hfpef'],
      followUps: ['Explain preload and afterload'],
      text: 'The Wiggers / PV panel shows EDV, ESV, stroke volume, EF and cardiac output for the current condition.',
    },
  },
  {
    match: /how (do|to) (i )?read an? (ecg|ekg)|systematic|interpret.*(ecg|ekg)|approach to (an )?(ecg|ekg)/i,
    answer: {
      title: 'A systematic 12-lead read',
      bullets: [
        'Rate: 300 ÷ large boxes between R waves, or count QRS in 10 s × 6 (best for irregular rhythms)',
        'Rhythm: regular? P before every QRS and QRS after every P? P upright in II (sinus)?',
        'Intervals: PR 120–200 ms; QRS < 120 ms; QTc < 450 (men) / < 460 (women) ms',
        'Axis: leads I and aVF (both positive = normal); if I is positive but aVF negative, a positive lead II keeps it normal (−30° to +90°)',
        'Morphology: P waves (enlargement), QRS (BBB, hypertrophy, Q waves), ST segments (elevation/depression in territories with reciprocity), T waves',
        'Compare with old ECGs and always correlate with the patient',
      ],
      links: [],
      followUps: ['What does this ECG show?', 'How do I localise a STEMI?'],
      text: 'Use “Inspect” on the ECG to label waves and intervals, and the calipers to measure them.',
    },
  },
  {
    match: /locali[sz]e.*(stemi|mi|infarct)|which (artery|vessel).*(stemi|mi)|territor/i,
    answer: {
      title: 'Localising a STEMI',
      bullets: [
        'Anterior/septal (V1–V4) → LAD; add I/aVL for proximal LAD or diagonal',
        'Inferior (II, III, aVF) → RCA in ~80%; STE III > II and STD in I/aVL favour RCA; STE II ≥ III with lateral STE favours LCx',
        'Lateral (I, aVL, V5–V6) → LCx or diagonal; high lateral (I, aVL ± V2) → first diagonal',
        'Posterior → STD V1–V3 with tall R; confirm with STE in V7–V9',
        'RV infarction → STE in V4R with inferior STEMI (proximal RCA): preload-dependent — avoid nitrates; fluid bolus if hypotensive',
        'Reciprocal ST depression supports a true STEMI over mimics such as pericarditis',
      ],
      links: ['anterior-stemi', 'inferior-stemi', 'lateral-stemi'],
      followUps: ['What is Wellens syndrome?'],
      text: 'Switch the 3D view to “Territories” and load each STEMI to see the culprit territory pulse.',
    },
  },
];

const INTENTS: { key: string; re: RegExp }[] = [
  { key: 'ecg', re: /\b(ecg|ekg|12.?lead|lead|st (elevation|depression)|wave|interval|rhythm strip|tracing)\b/i },
  { key: 'treat', re: /\b(treat|treatment|manage|management|therapy|what (do|should) (i|we) do|give|first.?line)\b/i },
  { key: 'dose', re: /\b(dose|dosing|how much|mg|mcg|joules?|energy)\b/i },
  { key: 'symptoms', re: /\b(symptom|sign|present|presentation|look like clinically|exam)\b/i },
  { key: 'mechanism', re: /\b(why|cause|causes|pathophys|mechanism|how does .* work|works?)\b/i },
  { key: 'complications', re: /\b(complication|risk|danger|side effect|adverse)\b/i },
  { key: 'steps', re: /\b(step|steps|how is .* (done|performed)|walk me through|procedure)\b/i },
  { key: 'imaging', re: /\b(echo|imaging|ct|mri|angiograph|x-?ray|tte|tee)\b/i },
  { key: 'contra', re: /\b(contraindicat|avoid|should not|never)\b/i },
  { key: 'anatomy', re: /\b(where|location|located|anatomy|blood supply|supplied)\b/i },
];

function intentOf(q: string): string {
  for (const i of INTENTS) if (i.re.test(q)) return i.key;
  return 'overview';
}

function careField(level: LearningLevel): 'fieldCare' | 'hospitalCare' | 'cardiologyCare' {
  // EMS roles → field care; cath lab tech / nurse → in-hospital care (carried out on orders); cardiologist → specialist care
  return level <= 2 ? 'fieldCare' : level <= 4 ? 'hospitalCare' : 'cardiologyCare';
}

export function answerQuestion(question: string, lib: ContentLibrary, ctx: TutorContext): TutorAnswer {
  const q = question.trim();
  const level = ctx.level;

  for (const p of PRIMERS) if (p.match.test(q)) return p.answer;

  // "What's on the monitor?"
  if (/\b(this|current|the) (ecg|ekg|rhythm|strip|monitor|tracing)\b|what (rhythm|am i looking)|on the monitor/i.test(q)) {
    const prof = resolveProfile(ctx.profileId);
    const condId = Object.entries(CONDITION_TO_PROFILE).find(([, v]) => v === prof.id)?.[0];
    return {
      title: `On the monitor: ${prof.headline}`,
      bullets: prof.findings,
      links: condId ? [condId] : [],
      followUps: condId ? [`How is ${lib.conditions[condId]?.name ?? prof.name} treated?`, 'How do I read an ECG systematically?'] : ['How do I read an ECG systematically?'],
      text: prof.keyLeads?.length ? `Key leads: ${prof.keyLeads.join(', ')} (tinted on the ECG).` : undefined,
    };
  }

  // Resolve "this/it" to the current selection
  let targetId: string | null = null;
  if (/\b(this|it|that|selected)\b/i.test(q)) {
    targetId = ctx.selectedConditionId ?? ctx.selectedStructureId ?? ctx.selectedProcedureId ?? ctx.selectedMedicationId;
  }
  const stop = /\b(what|whats|is|are|the|a|an|of|in|on|for|to|how|do|does|i|we|you|me|explain|tell|about|and|with|why|when|which|should|can|please|give|treat|treated|treatment|manage|management|dose|dosing|ecg|ekg|signs?|symptoms?|causes?|look|like|this|that|it|steps?|work|works|done|performed|walk|through)\b/gi;
  if (!targetId) {
    const cleaned = q.replace(/[?.!,]/g, ' ').replace(stop, ' ').replace(/\s+/g, ' ').trim();
    const hits = searchLibrary(lib, Object.values(CASE_DATA).map((c) => ({ id: c.id, title: c.title })), cleaned || q, 5);
    if (hits.length) targetId = hits[0].id;
  }
  if (!targetId) {
    return {
      title: 'I could not find that in the library',
      bullets: [
        'Try naming a structure, condition, procedure or drug (e.g. “mitral valve”, “Mobitz II”, “TAVR”, “amiodarone dose”)',
        'Or ask about a concept: cardiac cycle, conduction system, preload/afterload, ejection fraction, reading an ECG, localising a STEMI',
      ],
      links: [],
      followUps: ['What does this ECG show?', 'Explain the cardiac cycle'],
    };
  }

  const intent = intentOf(q);
  const lv = `Focus for ${LEVEL_LABELS[level].long}`;
  const s = lib.structures[targetId];
  if (s) {
    const field = intent === 'ecg' ? 'ecg' : intent === 'imaging' ? 'imaging' : intent === 'steps' ? 'procedures'
      : intent === 'mechanism' ? 'physiology' : intent === 'anatomy' ? 'anatomy' : intent === 'symptoms' || intent === 'complications' ? 'clinical' : 'overview';
    const bullets = (s as unknown as Record<string, string[]>)[field] ?? s.overview;
    return {
      title: `${s.name}${field !== 'overview' ? ` — ${field}` : ''}`,
      text: `${s.summary}${s.bloodSupply && field === 'anatomy' ? ` Blood supply: ${s.bloodSupply}.` : ''}`,
      bullets: [...bullets.slice(0, 6), `${lv}: ${s.levelNotes[level - 1]}`],
      links: [s.id, ...s.relatedConditions.slice(0, 3)],
      followUps: [`What does ${s.name.toLowerCase()} pathology look like on ECG?`, `Which procedures involve the ${s.name.toLowerCase()}?`],
    };
  }
  const c = lib.conditions[targetId];
  if (c) {
    const field = intent === 'ecg' ? 'ecg' : intent === 'treat' || intent === 'dose' ? careField(level) : intent === 'symptoms' ? 'symptoms'
      : intent === 'mechanism' ? 'pathophysiology' : intent === 'complications' ? 'complications' : intent === 'imaging' ? 'imaging'
        : intent === 'steps' ? 'procedure' : intent === 'anatomy' ? 'anatomy' : intent === 'contra' ? 'medications' : 'overview';
    const bullets = (c as unknown as Record<string, string[]>)[field] ?? c.overview;
    const extra = field === 'overview' && c.redFlags.length ? [`Red flag: ${c.redFlags[0]}`] : [];
    const labels: Record<string, string> = { fieldCare: 'field care', hospitalCare: 'ED / ICU care', cardiologyCare: 'cardiology care', pathophysiology: 'pathophysiology' };
    return {
      title: `${c.name}${field !== 'overview' ? ` — ${labels[field] ?? field}` : ''}`,
      text: c.summary,
      bullets: [...bullets.slice(0, 6), ...extra, `${lv}: ${c.levelNotes[level - 1]}`],
      links: [c.id, ...c.relatedMedications.slice(0, 3), ...c.relatedProcedures.slice(0, 2)],
      followUps: [`What does ${c.name} look like on ECG?`, `How is ${c.name} treated?`, `What are the complications of ${c.name}?`].filter((f) => !f.toLowerCase().includes(field)),
    };
  }
  const p = lib.procedures[targetId];
  if (p) {
    if (intent === 'steps' || /how is|walk/i.test(q)) {
      return {
        title: `${p.name} — steps`,
        text: `Access: ${p.accessSite}`,
        bullets: p.steps.map((st, i) => `${i + 1}. ${st.title}: ${st.description}`).slice(0, 10),
        links: [p.id, ...p.relatedConditions.slice(0, 3)],
        followUps: [`What are the complications of ${p.name}?`, `What are the indications for ${p.name}?`],
      };
    }
    const field = intent === 'complications' ? 'complications' : intent === 'ecg' ? 'ecg' : intent === 'contra' ? 'contraindications'
      : /indicat|when/i.test(q) ? 'indications' : intent === 'anatomy' ? 'anatomy' : 'overview';
    const bullets = (p as unknown as Record<string, string[]>)[field] ?? p.overview;
    return {
      title: `${p.name}${field !== 'overview' ? ` — ${field}` : ''}`,
      text: p.summary,
      bullets: [...bullets.slice(0, 6), `${lv}: ${p.levelNotes[level - 1]}`],
      links: [p.id, ...p.relatedConditions.slice(0, 3)],
      followUps: [`Walk me through ${p.name}`, `What are the complications of ${p.name}?`],
    };
  }
  const m = lib.medications[targetId];
  if (m) {
    const field = intent === 'dose' ? 'dosing' : intent === 'contra' ? 'contraindications' : intent === 'complications' ? 'adverseEffects'
      : intent === 'ecg' ? 'ecgEffects' : intent === 'mechanism' ? 'mechanism' : /indicat|used for|when/i.test(q) ? 'indications' : 'mechanism';
    const bullets = (m as unknown as Record<string, string[]>)[field] ?? m.mechanism;
    const note = field === 'dosing' ? ['Typical adult dosing for education — always follow current guidelines and local protocol'] : [];
    return {
      title: `${m.name} — ${field === 'adverseEffects' ? 'adverse effects' : field === 'ecgEffects' ? 'ECG effects' : field}`,
      text: `${m.drugClass}. ${m.summary}`,
      bullets: [...bullets.slice(0, 6), ...note, `${lv}: ${m.levelNotes[level - 1]}`],
      links: [m.id, ...m.relatedConditions.slice(0, 3)],
      followUps: [`What is the dose of ${m.name}?`, `What are the contraindications to ${m.name}?`],
    };
  }
  const cs = CASE_DATA[targetId];
  if (cs) {
    return { title: cs.title, text: cs.presentation, bullets: cs.teaching.slice(0, 5), links: [cs.id], followUps: [] };
  }
  return { title: 'No answer found', bullets: [], links: [], followUps: [] };
}
