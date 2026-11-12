/**
 * Offline tutor: answers questions from CardioSim's reviewed content library.
 * It detects intent (ECG? treatment? dose? symptoms? mechanism?), finds the
 * best-matching item, and composes a level-appropriate answer with links.
 */
import type { ContentLibrary, SearchExtra, SearchHit } from '@/lib/content';
import { searchLibrary, withAliases } from '@/lib/content';
import type { AppMode, LearningLevel } from '@/store/useAppStore';
import { LEVEL_LABELS } from '@/store/useAppStore';
import { resolveProfile, CONDITION_TO_PROFILE } from '@/lib/ecg/profiles';
import { CASE_DATA } from '@/data/caseData';
import { GLOSSARY, GLOSSARY_BY_ID } from '@/data/glossary';

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
  /**
   * A question about the tracing is open (the rhythm trainer, a lesson check, a quiz strip): like everything else on
   * screen, the tutor must not name the rhythm until it has been answered.
   */
  blind?: boolean;
  /** The screen the learner is on. Only the learning screen shows the patient on the monitor (default: 'learn'). */
  mode?: AppMode;
}

/** "What does this ECG show?" and its variations */
const MONITOR_QUESTION = /\b(this|current|the) (ecg|ekg|rhythm|strip|monitor|tracing)\b|what (rhythm|am i looking)|on the monitor/i;

/** How to work a tracing out without being told: what the tutor offers instead of the answer */
const READ_IT_YOURSELF = [
  'Rate: count the QRS complexes in 6 seconds and multiply by 10, or divide 300 by the large boxes between two R waves',
  'Rhythm: are the R–R intervals regular, regularly irregular or irregularly irregular?',
  'P waves: is there one before every QRS, and a QRS after every P?',
  'PR interval: 120–200 ms, and the same every beat?',
  'QRS width: narrow (under 120 ms) or wide?',
];

const PRIMERS: { match: RegExp; answer: TutorAnswer }[] = [
  {
    match: /cardiac cycle|wiggers|systole.*diastole|diastole.*systole|phases? of the heart/i,
    answer: {
      title: 'The cardiac cycle',
      bullets: [
        'Atrial systole follows the P wave and tops up ventricular filling by ~20–30% (more in stiff ventricles; lost in AF)',
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
        'SA node (RA at the SVC junction) fires 60–100/min → P wave as both atria depolarize (Bachmann\'s bundle carries it to the LA)',
        'AV node (Koch\'s triangle) delays conduction ~0.1 s — the PR segment — so the atria finish emptying first',
        'Bundle of His penetrates the fibrous skeleton, then divides into right and left bundle branches (left → anterior and posterior fascicles)',
        'Purkinje fibers spread activation endocardium → epicardium in ~80–100 ms, producing the narrow QRS',
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
        'Contractility = intrinsic strength of contraction independent of loading (raised by sympathetic tone/inotropes, reduced by ischemia, HF)',
        'Stroke volume rises with preload and contractility and falls with afterload; CO = HR × SV',
        'Preload-dependent states: RV infarction, tamponade, hypovolemia, HCM with obstruction — vasodilators/nitrates can crash the BP',
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
        'A normal EF does not mean normal output: tamponade and hypovolemia shrink EDV, and severe MR inflates EF while forward flow falls',
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
      followUps: ['What does this ECG show?', 'How do I localize a STEMI?'],
      text: 'Use “Inspect” on the ECG to label waves and intervals, and the calipers to measure them.',
    },
  },
  {
    match: /locali[sz](e|ing).*(stemi|mi|infarct)|which (artery|vessel).*(stemi|mi)|territor/i,
    answer: {
      title: 'Localizing a STEMI',
      bullets: [
        'Anterior/septal (V1–V4) → LAD; add I/aVL for proximal LAD or diagonal',
        'Inferior (II, III, aVF) → RCA in ~80%; STE III > II and STD in I/aVL favor RCA; STE II ≥ III with lateral STE favors LCx',
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

// Every word form is spelled out (or ends in \w*): a bare stem such as `complication` never matches "complications"
// because the closing \b needs the word to end there.
const INTENTS: { key: string; re: RegExp }[] = [
  { key: 'ecg', re: /\b(ecg|ekg|12.?lead|lead|st (elevation|depression)|waves?|intervals?|rhythm strip|tracing)\b/i },
  { key: 'treat', re: /\b(treat|treats|treated|treating|treatments?|manage|managed|managing|management|therapy|therapies|what (do|should) (i|we) do|give|first.?line)\b/i },
  { key: 'dose', re: /\b(doses?|dosing|dosage|how much|mg|mcg|joules?|energy)\b/i },
  { key: 'symptoms', re: /\b(symptoms?|signs?|presents?|presentation|look like clinically|exam)\b/i },
  { key: 'mechanism', re: /\b(why|cause|causes|caused|pathophys\w*|mechanisms?|how does .* work|works?)\b/i },
  { key: 'complications', re: /\b(complications?|risks?|dangers?|side effects?|adverse)\b/i },
  { key: 'steps', re: /\b(step|steps|how is .* (done|performed)|walk me through|procedure)\b/i },
  { key: 'imaging', re: /\b(echo|imaging|ct|mri|angiograph\w*|x-?ray|tte|tee)\b/i },
  // "when do I hold nitro?" asks when not to give it
  { key: 'contra', re: /\b(contraindicat\w*|avoid|should not|never|hold|withhold)\b/i },
  { key: 'anatomy', re: /\b(where|location|located|anatomy|blood supply|supplied)\b/i },
];

function intentOf(q: string): string {
  for (const i of INTENTS) if (i.re.test(q)) return i.key;
  return 'overview';
}

/** "What is …?", "define …", "what does … mean?": the learner wants to know what a word means */
const DEFINITION = /^\s*(what\s*['’]?\s*(is|are|was|s)\b|define\b|definition of\b|meaning of\b|what does .+ mean\b)/i;

/** Words that say what kind of answer is wanted, not what it is about: they are not searched for */
const STOP = /\b(what|whats|is|are|was|be|the|a|an|of|in|on|at|for|to|how|do|does|i|we|you|me|my|our|explain|tell|about|and|or|with|why|when|where|which|should|can|could|please|give|treat|treated|treatment|manage|management|dose|dosing|ecg|ekg|signs?|symptoms?|causes?|look|like|this|that|it|steps?|work|works|done|performed|walk|through|hold|withhold|contraindications?|contraindicated|complications?|indications?|define|definition|meaning|mean|means|patients?|go|goes|put|need|needs)\b/gi;

/** Glossary terms answer "what is …?" in a sentence or two */
const GLOSSARY_EXTRAS: SearchExtra[] = GLOSSARY.map((g) => ({ kind: 'term', id: `term:${g.id}`, name: g.term, sub: g.def, keys: g.aka ?? [] }));

/** The kinds of search hit the tutor can answer from (lessons, tools and simulator cases are not library pages) */
const ANSWERABLE = new Set<SearchHit['kind']>(['structure', 'condition', 'procedure', 'medication', 'cathlab', 'case', 'term']);

/** At most this many words are dropped when a question finds nothing as asked */
const MAX_DROPPED = 3;

/** the case scenarios, as the search takes them */
const caseTitles = () => Object.values(CASE_DATA).map((c) => ({ id: c.id, title: c.title }));

/** Every way of keeping `size` of the words, in their order */
function keeping<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const [first, ...rest] = items;
  return [...keeping(rest, size - 1).map((k) => [first, ...k]), ...keeping(rest, size)];
}

/** Everything a hit's page says, lower-cased: used to tell which page also covers the words a retry left out */
function pageText(lib: ContentLibrary, hit: SearchHit): string {
  const item = hit.kind === 'term' ? GLOSSARY_BY_ID[hit.id.slice(5)]
    : hit.kind === 'case' ? CASE_DATA[hit.id]
      : lib.structures[hit.id] ?? lib.conditions[hit.id] ?? lib.procedures[hit.id] ?? lib.medications[hit.id] ?? lib.cathlab[hit.id];
  return item ? JSON.stringify(item).toLowerCase() : hit.name.toLowerCase();
}

/** "electrodes" → "electrode" (the search matches inside words, so the singular still finds the plural) */
const singular = (w: string) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

export interface TopicMatch {
  /** a library page id, or `term:<glossary id>` */
  id: string;
  /** other library pages the question named, worth a link beside a glossary definition */
  also: string[];
}

/**
 * What a question is about: a library page or a glossary term, or null.
 *
 * The question's own words are searched first (with plurals made singular if that finds nothing). A glossary term
 * answers "what is …?"; any other question about it ("how is a STEMI treated?", "Mobitz II") is answered from the
 * library page the term points to, which says far more. A "what is …?" question also puts the cath lab catalog below
 * the glossary and the clinical pages: "what is a STEMI" wants the definition, not the door-to-device checklist.
 *
 * If no page has all the words ("when do I hold nitro", "nitro in RV infarct?"), fewer are tried, one more left out
 * at a time; each word kept must match a page's name, other names or glossary entry (not just appear in its text),
 * and the page that also mentions the words left out wins.
 */
export function findTopic(question: string, lib: ContentLibrary): TopicMatch | null {
  const q = question.trim();
  const definition = DEFINITION.test(q) && intentOf(q) === 'overview';
  const typed = q.toLowerCase().replace(/['’]s\b/g, '').replace(/[?.!,;:()"“”]/g, ' ').replace(STOP, ' ').split(/\s+/).filter((w) => w.length > 0);
  const cases = caseTitles();
  const search = (text: string) => searchLibrary(lib, cases, text, 8, GLOSSARY_EXTRAS)
    .filter((h) => ANSWERABLE.has(h.kind))
    .map((h) => (definition && h.kind === 'cathlab' ? { ...h, score: h.score - 3 } : h))
    .sort((a, b) => b.score - a.score);

  const words = typed.map(singular);
  let asked = search(typed.length ? typed.join(' ') : q);
  if (!asked.length && words.join(' ') !== typed.join(' ')) asked = search(words.join(' '));
  if (asked.length) {
    const top = asked[0];
    const pages = asked.filter((h) => h.kind !== 'term').map((h) => h.id);
    if (top.kind !== 'term') return { id: top.id, also: [] };
    if (definition) return { id: top.id, also: pages.slice(0, 2) };
    const see = GLOSSARY_BY_ID[top.id.slice(5)]?.see;
    return see ? { id: see, also: [] } : pages.length ? { id: pages[0], also: [] } : { id: top.id, also: [] };
  }

  // each word, as typed and in the library's own words ("nitro" → "nitroglycerin")
  const forms = words.map((w) => [w, ...(withAliases(w) ? [withAliases(w)!] : [])]);
  const texts = new Map<string, string>();
  const textOf = (hit: SearchHit) => {
    if (!texts.has(hit.id)) texts.set(hit.id, pageText(lib, hit));
    return texts.get(hit.id)!;
  };
  for (let drop = 1; drop <= MAX_DROPPED && drop < words.length; drop++) {
    let best: { hit: SearchHit; covered: number } | null = null;
    for (const kept of keeping(words.map((_, i) => i), words.length - drop)) {
      // two-letter words alone ("rv", "mi") match inside too many names to stand for the question
      if (kept.every((i) => words[i].length < 3)) continue;
      for (const hit of search(kept.map((i) => words[i]).join(' '))) {
        if (hit.score < 4 * kept.length - 0.5) continue;
        const text = textOf(hit);
        const covered = forms.filter((f, i) => !kept.includes(i) && f.some((w) => text.includes(w))).length;
        if (!best || covered > best.covered || (covered === best.covered && hit.score > best.hit.score)) best = { hit, covered };
      }
    }
    if (best) return { id: best.hit.id, also: [] };
  }
  return null;
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
  if (MONITOR_QUESTION.test(q)) return monitorAnswer(lib, ctx);

  // Resolve "this/it" to the current selection
  let targetId: string | null = null;
  let also: string[] = [];
  if (/\b(this|it|that|selected)\b/i.test(q)) {
    targetId = ctx.selectedConditionId ?? ctx.selectedStructureId ?? ctx.selectedProcedureId ?? ctx.selectedMedicationId;
  }
  if (!targetId) {
    const match = findTopic(q, lib);
    targetId = match?.id ?? null;
    also = match?.also ?? [];
  }
  if (!targetId) {
    return {
      title: 'I could not find that in the library',
      bullets: [
        'Try naming a structure, condition, procedure or drug (e.g. “mitral valve”, “Mobitz II”, “TAVR”, “amiodarone dose”)',
        'Or ask about a concept: cardiac cycle, conduction system, preload/afterload, ejection fraction, reading an ECG, localizing a STEMI',
      ],
      links: [],
      followUps: [canReadMonitor(ctx) ? 'What does this ECG show?' : 'How do I read an ECG systematically?', 'Explain the cardiac cycle'],
    };
  }
  if (targetId.startsWith('term:')) return termAnswer(targetId.slice(5), lib, also);

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
    // offer what has not just been answered
    const next: [string, string][] = [['ecg', `What does ${c.name} look like on ECG?`], ['treat', `How is ${c.name} treated?`], ['complications', `What are the complications of ${c.name}?`]];
    return {
      title: `${c.name}${field !== 'overview' ? ` — ${labels[field] ?? field}` : ''}`,
      text: c.summary,
      bullets: [...bullets.slice(0, 6), ...extra, `${lv}: ${c.levelNotes[level - 1]}`],
      links: [c.id, ...c.relatedMedications.slice(0, 3), ...c.relatedProcedures.slice(0, 2)],
      followUps: next.filter(([k]) => k !== (intent === 'dose' ? 'treat' : intent)).map(([, f]) => f),
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
  const cl = lib.cathlab[targetId];
  if (cl) {
    const numbers = (intent === 'dose' || /normal|value|size|how much|target|range/i.test(q)) && cl.numbers?.length;
    const role = level === 3 ? cl.roles.tech : level === 4 ? cl.roles.rn : level === 5 ? cl.roles.md : null;
    return {
      title: `${cl.name}${numbers ? ' — numbers to know' : ''}`,
      text: cl.summary,
      bullets: [...(numbers ? cl.numbers! : cl.details).slice(0, 6), ...(role ? [`${lv}: ${role}`] : [])],
      links: [cl.id, ...(cl.related ?? []).slice(0, 3)],
      followUps: cl.numbers?.length && !numbers ? [`What are the numbers to know for ${cl.name}?`] : [],
    };
  }
  const cs = CASE_DATA[targetId];
  if (cs) {
    return { title: cs.title, text: cs.presentation, bullets: cs.teaching.slice(0, 5), links: [cs.id], followUps: [] };
  }
  return { title: 'No answer found', bullets: [], links: [], followUps: [] };
}

/** Whether "What does this ECG show?" can be answered now: a tracing is on screen and no question about it is open */
export function canReadMonitor(ctx: Pick<TutorContext, 'blind' | 'mode'>): boolean {
  return !ctx.blind && (ctx.mode ?? 'learn') === 'learn';
}

/** "What does this ECG show?" — the patient on the monitor, unless naming it would give an answer away */
function monitorAnswer(lib: ContentLibrary, ctx: TutorContext): TutorAnswer {
  if (ctx.blind) {
    return {
      title: 'I will tell you once you have answered',
      text: 'A question about this tracing is still open. Work it out the way you would on a call:',
      bullets: READ_IT_YOURSELF,
      links: [],
      followUps: ['How do I read an ECG systematically?'],
    };
  }
  const mode = ctx.mode ?? 'learn';
  if (mode === 'simulator') {
    return {
      title: 'Reading the monitor is part of the case',
      text: 'I will not name the rhythm while you run the case. Work it out from the tracing:',
      bullets: READ_IT_YOURSELF,
      links: [],
      followUps: ['How do I read an ECG systematically?'],
    };
  }
  if (mode !== 'learn') {
    return {
      title: 'There is no tracing on screen',
      text: 'Open a condition from the library, the 12-lead ECG from the main menu, or practice rhythms, and ask me again.',
      bullets: [],
      links: [],
      followUps: ['How do I read an ECG systematically?', 'How do I localize a STEMI?'],
    };
  }
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

/** A glossary term: its plain-words definition, the library page that teaches it, and any other page the question named */
function termAnswer(id: string, lib: ContentLibrary, also: string[] = []): TutorAnswer {
  const g = GLOSSARY_BY_ID[id];
  const see = g.see;
  const followUps: string[] = [];
  if (see && lib.conditions[see]) followUps.push(`How is ${lib.conditions[see].name} treated?`, `What does ${lib.conditions[see].name} look like on ECG?`);
  else if (see && lib.medications[see]) followUps.push(`What is the dose of ${lib.medications[see].name}?`, `What are the contraindications to ${lib.medications[see].name}?`);
  else if (see && lib.procedures[see]) followUps.push(`Walk me through ${lib.procedures[see].name}`);
  else if (see && lib.structures[see]) followUps.push(`Tell me about the ${lib.structures[see].name.toLowerCase()}`);
  return { title: g.term, text: g.def, bullets: [], links: Array.from(new Set([...(see ? [see] : []), ...also])), followUps };
}
