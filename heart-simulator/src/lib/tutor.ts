/**
 * Offline tutor: answers questions from CardioSim's reviewed content library.
 * It detects intent (ECG? treatment? dose? symptoms? mechanism?), finds the
 * best-matching item, and composes a level-appropriate answer with links.
 */
import type { ContentLibrary, SearchExtra, SearchHit } from '@/lib/content';
import { levelNote, searchLibrary, withAliases } from '@/lib/content';
import type { AppMode, LearningLevel } from '@/store/useAppStore';
import { LEVEL_LABELS, ROLE_SETTING } from '@/store/useAppStore';
import { resolveProfile, CONDITION_TO_PROFILE } from '@/lib/ecg/profiles';
import { CASE_DATA } from '@/data/caseData';
import { GLOSSARY, GLOSSARY_BY_ID, type GlossaryTerm } from '@/data/glossary';

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

/**
 * "What does this ECG show?" and its variations: "which rhythm is this?", "which ECG is shown here?", "which rhythm
 * is displayed?", "which rhythm does this show?", "which strip am I looking at?", "rhythm?". A question about rhythms
 * in general ("which rhythm loses the atrial kick?", "what ECG is shown in hyperkalemia?", "what does the ECG look
 * like in hyperkalemia?", "what is the ECG of a STEMI?", "the ECG changes in WPW") is not one of them: it is answered
 * from the library. "The rhythm in lead II", "what does the ECG show in lead II?" and "the ECG in this patient" are
 * still about the monitor.
 */
const MONITOR_QUESTION = new RegExp([
  String.raw`\b(this|current) (ecg|ekg|rhythm|strip|monitor|tracing)\b`,
  // "the ECG" — but not "the ECG changes in …", "the ECG of a STEMI" or "the ECG (looks like | shows) in hyperkalemia"
  String.raw`\bthe (ecg|ekg|rhythm|strip|monitor|tracing)\b(?!\s+(changes?|findings?|criteria|patterns?)\b)(?!\s+(?:(?:show|shows|showing|look|looks|looking|appear|appears)(?:\s+like)?\s+)?(of|in|for|with|after|during)\s+(?!(this|the|lead|leads|v\d|i|ii|iii|avr|avl|avf)\b))`,
  String.raw`what (rhythm|am i looking)`,
  String.raw`on the monitor`,
  String.raw`\b(rhythm|ecg|ekg|strip|tracing) is (this|that)\b`,
  String.raw`\b(rhythm|ecg|ekg|strip|tracing) is (it|shown|showing|displayed|here|on (the )?(screen|monitor))(\s+(here|now|on (the )?(screen|monitor)))?\s*[?.!]*\s*$`,
  String.raw`\bwhich (rhythm|ecg|ekg|strip|tracing) (am i|are we|do i|do we) (looking at|seeing|see)\b`,
  String.raw`\bwhich (rhythm|ecg|ekg|strip|tracing) (does|is) (this|it|the patient|this patient|he|she) (show|showing|have|having|in)\b`,
  String.raw`^\s*(which|what) (rhythm|ecg|ekg|strip|tracing)\s*,?\s*(please|now)?\s*[?.!]*\s*$`,
  // "rhythm?", "rhythm, please" (a bare "ECG" is a word to look up)
  String.raw`^\s*(rhythm|ecg|ekg|strip|tracing)\s*(,?\s*(please|now)\s*[?.!]*|\?+)\s*$`,
].join('|'), 'i');

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
      text: 'Open “Pressure & volume” below the ECG to see pressures, volume and heart sounds move in time with this heart.',
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
      text: 'The Pressure & volume panel (Wiggers diagram and PV loop) shows EDV, ESV, stroke volume, EF and cardiac output for the current condition.',
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

/** "not", "never", "don't", "shouldn't", "cannot" (with or without the apostrophe) */
const NEGATION = String.raw`(?:(?:don|doesn|didn|shouldn|mustn|can|couldn|wouldn|won|isn|aren|wasn|weren)['’]?t|not|never|cannot)`;
/** "should not", "should a patient not", "must not", "can't", "won't": what may not be done */
const MODAL_NEGATION = String.raw`(?:(?:should|must|can|could|may|might|would|will|shall)(?:\s+\w+){0,2}?\s+not|(?:shouldn|mustn|can|couldn|wouldn|won)['’]?t|cannot)`;
/** What is done with a drug or a treatment: "give", "be given", "use", "push" … */
const GIVING = String.raw`(?:give|given|giving|use|used|using|administer\w*|push|pushed|pushing|start|started|starting|do|done)`;
/** …and what the patient does with it: "who should not have tenecteplase?", "who can't take aspirin?" */
const RECEIVING = String.raw`(?:have|has|had|get|gets|getting|got|receive|receives|received|receiving|take|takes|taken|taking)`;
/** "not safe", "not indicated", "not recommended", "not a candidate" */
const UNFIT = String.raw`(?:(?:a|an|always|considered|really|very)\s+)?(?:indicated|recommended|safe|appropriate|advis\w*|allowed|ok|okay|suitable|eligible|candidates?)`;
/** the words that may stand between "not" and "give": "should I not give", "not to give", "not be given", "not give it" */
const BETWEEN = String.raw`(?:(?:i|we|you|they|it|he|she|one|to|be|ever|a|the|this|any|patients?|him|her|them|us)\s+){0,2}`;
/**
 * A question about when NOT to give something: "when should I not give nitro?", "when not to give aspirin?", "who
 * shouldn't get it?", "when is it not safe to give nitro?", "when is aspirin not indicated?", "who can't have
 * tenecteplase?", "when do I hold nitro?". A "not" that is not about giving ("why don't I see P waves?", "why do
 * diabetics not have chest pain?") is no such question, nor is "how to avoid bleeding" or "how long do I hold pressure".
 */
const CONTRA = new RegExp(
  String.raw`\b(contraindicat\w*|avoid\w*(?!(?:\s+\w+){0,2}?\s+(?:complication|risk|bleed|hematoma|injur|infection|problem|harm|mistake|error|pitfall|damage|spasm|occlusion|nephropathy)\w*)|never|(?:hold|holding|held)(?!\s+(?:\w+\s+)?pressure)|withhold\w*|withheld|${NEGATION}\s+${BETWEEN}${GIVING}|${MODAL_NEGATION}\s+${BETWEEN}${RECEIVING}|${NEGATION}\s+${UNFIT})\b`,
  'i',
);
/** a negation of any kind: what a question about the indications says when it asks the opposite */
const NEGATED = new RegExp(String.raw`\b${NEGATION}\b`, 'i');
/** "the risks of not giving aspirin": what happens without the drug, not what the drug does */
const OMISSION = new RegExp(String.raw`\b(?:of|from|by|in)\s+${NEGATION}\s+(?:giving|using|treating|starting|taking|getting|receiving|doing)\b`, 'i');

/**
 * The question without its "if …" or "unless …": a "not" there says when, not what ("what is the dose of epinephrine
 * if I can't get IV access?", "how do I treat AF if I can't use a beta-blocker?").
 */
const mainClause = (q: string) => q.replace(/\b(?:if|unless)\b[^,;.?!]*/gi, ' ');

const DOSE = /\b(doses?|dosing|dosage|how much|mg|mcg|joules?|energy)\b/i;
const COMPLICATIONS = /\b(complications?|risks?|dangers?|side effects?|adverse|toxicity|toxic)\b/i;

// Every word form is spelled out (or ends in \w*): a bare stem such as `complication` never matches "complications"
// because the closing \b needs the word to end there.
const INTENTS: { key: string; re: RegExp }[] = [
  { key: 'ecg', re: /\b(ecg|ekg|12.?lead|lead|st (elevation|depression)|waves?|intervals?|rhythm strip|tracing)\b/i },
  // before "treat": "how much amiodarone do I give?" asks for the dose
  { key: 'dose', re: DOSE },
  { key: 'treat', re: /\b(treat|treats|treated|treating|treatments?|manage|managed|managing|management|therapy|therapies|what (do|should) (i|we) do|give|first.?line)\b/i },
  { key: 'symptoms', re: /\b(symptoms?|signs?|presents?|presentation|look like clinically|exam)\b/i },
  { key: 'mechanism', re: /\b(why|cause|causes|caused|pathophys\w*|mechanisms?|how does .* work|works?)\b/i },
  { key: 'complications', re: COMPLICATIONS },
  { key: 'steps', re: /\b(step|steps|how is .* (done|performed)|walk me through|procedure)\b/i },
  { key: 'imaging', re: /\b(echo|imaging|ct|mri|angiograph\w*|x-?ray|tte|tee)\b/i },
  { key: 'anatomy', re: /\b(where|location|located|anatomy|blood supply|supplied)\b/i },
];

/**
 * What kind of answer a question wants. "When should I NOT give nitro?" comes first: it says "give" (a treatment
 * question) and "when" (which picks the indications), and read any other way it gets the opposite of what was asked.
 * But a question that asks for a dose or a risk before its "not" or "never" ("what is the max dose you should never
 * exceed?", "what are the risks of not giving aspirin?") still wants the dose or the risk.
 */
function intentOf(q: string): string {
  const main = mainClause(q);
  const contra = CONTRA.exec(main);
  if (contra && ![DOSE, COMPLICATIONS].some((re) => { const m = re.exec(main); return m !== null && m.index < contra.index; })) return 'contra';
  for (const i of INTENTS) if (i.re.test(q)) return i.key;
  return 'overview';
}

/** "when to give …?", "who gets …?": the indications — or, asked with a "not", the contraindications */
const whenField = (q: string): 'indications' | 'contraindications' | null => (
  /\b(indicat\w*|used for|when|who|which patients)\b/i.test(q) ? (NEGATED.test(mainClause(q)) ? 'contraindications' : 'indications') : null
);

/** "What is …?", "define …", "what does … mean?": the learner wants to know what a word means */
const DEFINITION = /^\s*(what\s*['’]?\s*(is|are|was|s)\b|define\b|definition of\b|meaning of\b|what does .+ mean\b)/i;

/** A name as a pattern that also takes "Q-wave" for "Q wave" */
const namePattern = (name: string) => new RegExp(name.split(/[\s\-–]+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\-–]+'), 'gi');

/**
 * "What is a Q wave?", "what are delta waves?": a "what is …?" question whose only word for the kind of answer wanted
 * ("wave", "lead") is part of the term's own name. It wants the definition, not the ECG section of the page the term
 * points to — unlike "what is the ECG of a STEMI?".
 */
function definesTerm(q: string, term: GlossaryTerm): boolean {
  if (!DEFINITION.test(q)) return false;
  const rest = [term.term, ...(term.aka ?? [])].reduce((s, name) => s.replace(namePattern(name), ' '), q);
  return intentOf(rest) === 'overview';
}

/**
 * Words that say what kind of answer is wanted, not what it is about: they are not searched for. The contractions
 * come first, so that "can't" goes whole rather than leaving a stray "'t" behind "can". "Push" goes only as a verb
 * ("push adenosine"): "push-dose pressors" and "IV push" keep it.
 */
const STOP = /\b((don|doesn|didn|shouldn|mustn|can|couldn|wouldn|won|isn|aren|wasn|weren)['’]?t|not|never|cannot|avoid\w*|given|giving|use|used|using|get|gets|getting|got|receive|receives|received|receiving|have|has|had|take|takes|taken|taking|took|push(?![\s\-–]*dos)(?=\s+\w)|pushed|pushing|administer\w*|start|started|starting|safe|safely|ok|okay|appropriate|recommended|indicated|allowed|advis\w*|candidates?|suitable|eligible|must|after|much|would|will|may|might|held|holding|withheld|who|what|whats|is|are|was|be|the|a|an|of|in|on|at|for|to|how|do|does|i|we|you|me|my|our|explain|tell|about|and|or|with|why|when|where|which|should|can|could|please|give|treat|treated|treatment|manage|management|dose|dosing|ecg|ekg|signs?|symptoms?|causes?|look|like|this|that|it|steps?|work|works|done|performed|walk|through|hold|withhold|contraindications?|contraindicated|complications?|indications?|define|definition|meaning|mean|means|patients?|go|goes|put|need|needs)\b/gi;

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

/** "electrodes" → "electrode" (the search matches inside words, so the singular still finds the plural) */
const singular = (w: string) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

/** The words of a text, lower-cased: "V1–V6" → v1, v6; "Pd/Pa" → pd, pa */
const tokens = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter(Boolean);

/**
 * The forms one word can take, so that "infarct" meets "infarction", "electrode" "electrodes" and "paced" "pacing" —
 * but "lead" never meets "Leadless" and "place" never meets "Replacement".
 */
function forms(w: string): string[] {
  const out = [w];
  const n = w.length;
  if (n > 3 && w.endsWith('s') && !w.endsWith('ss')) out.push(w.slice(0, -1));
  if (n > 4 && /(s|x|z|ch|sh)es$/.test(w)) out.push(w.slice(0, -2));
  if (n > 4 && w.endsWith('ies')) out.push(`${w.slice(0, -3)}y`);
  if (n > 4 && w.endsWith('ed')) out.push(w.slice(0, -2), w.slice(0, -1));
  if (n > 5 && w.endsWith('ing')) out.push(w.slice(0, -3), `${w.slice(0, -3)}e`);
  if (n > 5 && w.endsWith('ion')) out.push(w.slice(0, -3), `${w.slice(0, -3)}e`);
  if (n > 6 && w.endsWith('ions')) out.push(w.slice(0, -4), `${w.slice(0, -4)}e`);
  return out;
}

/** Every string inside a library item */
function strings(x: unknown, out: string[] = []): string[] {
  if (typeof x === 'string') out.push(x);
  else if (Array.isArray(x)) for (const v of x) strings(v, out);
  else if (x && typeof x === 'object') for (const v of Object.values(x)) strings(v, out);
  return out;
}

/** A page's words, as whole words with all their forms */
interface PageWords {
  /** each of its names, word by word: ["right", "ventricular", "infarction"], ["rv", "infarct"] */
  names: string[][];
  /** its name and other names (a drug's brand names, a glossary term's other spellings) */
  named: Set<string>;
  drugClass: Set<string>;
  /** what the page says it is: its names, its drug class and its summary (a glossary term's definition) */
  gist: Set<string>;
  /** everything it says */
  text: Set<string>;
}

function pageWords(lib: ContentLibrary, hit: SearchHit): PageWords {
  let named: string[] = [hit.name];
  let drugClass: string[] = [];
  let summary = '';
  let item: unknown = null;
  if (hit.kind === 'term') {
    const g = GLOSSARY_BY_ID[hit.id.slice(5)];
    if (g) { named = [g.term, ...(g.aka ?? [])]; summary = g.def; item = g.def; }
  } else if (hit.kind === 'case') {
    item = CASE_DATA[hit.id];
    summary = CASE_DATA[hit.id]?.presentation ?? '';
  } else if (lib.medications[hit.id]) {
    const m = lib.medications[hit.id];
    named = [m.name, ...m.brandNames];
    drugClass = [m.drugClass];
    summary = m.summary;
    item = m;
  } else {
    const page = lib.structures[hit.id] ?? lib.conditions[hit.id] ?? lib.cathlab[hit.id] ?? lib.procedures[hit.id];
    if (page) { named = [page.name, ...(('synonyms' in page && page.synonyms) || [])]; summary = page.summary; item = page; }
  }
  const words = (list: string[]) => new Set(list.flatMap(tokens).flatMap(forms));
  return {
    names: named.map(tokens).filter((n) => n.length > 0),
    named: words(named),
    drugClass: words(drugClass),
    gist: words([...named, ...drugClass, summary]),
    text: words([...named, ...drugClass, ...strings(item)]),
  };
}

/** Whether a word of the question is among `set`'s words, as typed or in the library's own words ("nitro" → "nitroglycerin") */
function has(word: string, set: Set<string>): boolean {
  return [word, withAliases(word)].some((variant) => {
    const toks = variant ? tokens(variant) : [];
    return toks.length > 0 && toks.every((t) => forms(t).some((f) => set.has(f)));
  });
}

/**
 * How well one word of a question fits a page, as whole words only (a letter or a fragment inside a longer word is
 * no match): 3 = the page's name or other names, 2 = a drug's class, 1 = somewhere in what the page says, 0 = nowhere.
 */
const fitOf = (word: string, page: PageWords): number => (has(word, page.named) ? 3 : has(word, page.drugClass) ? 2 : has(word, page.text) ? 1 : 0);

/** How much of a page's name the question says: "Lead" is all of it for "lead placement", "IVC Filter Placement" a third */
function nameShare(page: PageWords, said: Set<string>): number {
  let best = 0;
  for (const name of page.names) best = Math.max(best, name.filter((t) => forms(t).some((f) => said.has(f))).length / name.length);
  return best;
}

/** "p", "u", "mi", "v1": a letter or a two-character code is what the question is about, and it is found inside almost anything */
const isShort = (w: string) => tokens(w).every((t) => t.length < 3);

export interface TopicMatch {
  /** a library page id, or `term:<glossary id>` */
  id: string;
  /** other library pages the question named, worth a link beside a glossary definition */
  also: string[];
  /** words of the question the page never mentions (a retry left them out): the answer says so */
  missed?: string[];
}

/**
 * What a question is about: a library page or a glossary term, or null.
 *
 * The question's own words are searched first (with plurals made singular if that finds nothing). A glossary term
 * answers "what is …?"; any other question about it ("how is a STEMI treated?", "Mobitz II") is answered from the
 * library page the term points to, which says far more. A "what is …?" question also puts the cath lab catalog below
 * the glossary and the clinical pages: "what is a STEMI" wants the definition, not the door-to-device checklist.
 *
 * The search matches inside words, so every hit is checked word by word (`fitOf`): each word must be a whole word of
 * the page, a letter or a short code ("P wave", "V1", "MI") must be one of the page's names, and at least one word
 * must name the page unless two or more words all appear in it. "What is a P wave" is not about "Pd/Pa", and
 * "where do I put V1" is not about the V1 receptor in vasopressin's drug class.
 *
 * If no page has all the words ("digoxin toxicity", "nitro in RV infarct?"), fewer are tried, one more left out at a
 * time and never more than half of the longer words. Each word kept must name the page (its name, other names,
 * glossary entry or drug class), and a short word left out must still appear in the page. The winner is the page
 * whose summary mentions the most of the words left out, then the one the kept words name best (a name before a drug
 * class), then the one whose name the question says most of — but only a clear winner. Two pages that fit what is left
 * equally well are a guess, and the tutor says it could not find the answer instead: for a teaching tool a confident
 * wrong answer is worse than none. (Two names for one thing, such as the glossary's "IABP" and the cath lab's
 * "Intra-aortic balloon pump (IABP)", are not a guess.) Words the winning page never mentions come back in `missed`.
 */
export function findTopic(question: string, lib: ContentLibrary): TopicMatch | null {
  const q = question.trim();
  const definition = DEFINITION.test(q) && intentOf(q) === 'overview';
  const typed = q.toLowerCase().replace(/['’]s\b/g, '').replace(/[?.!,;:()"“”]/g, ' ').replace(STOP, ' ').split(/\s+/)
    .filter((w) => tokens(w).length > 0);
  const cases = caseTitles();
  const known = new Map<string, PageWords>();
  const wordsOf = (hit: SearchHit) => {
    const key = `${hit.kind}:${hit.id}`;
    if (!known.has(key)) known.set(key, pageWords(lib, hit));
    return known.get(key)!;
  };
  const search = (text: string) => searchLibrary(lib, cases, text, 8, GLOSSARY_EXTRAS)
    .filter((h) => ANSWERABLE.has(h.kind))
    .map((h) => (definition && h.kind === 'cathlab' ? { ...h, score: h.score - 3 } : h))
    .sort((a, b) => b.score - a.score);
  /** how each word of `ws` fits a hit, or null when the hit only has the letters somewhere, not the words */
  const fitting = (hit: SearchHit, ws: string[]) => {
    const page = wordsOf(hit);
    const fits = ws.map((w) => fitOf(w, page));
    const sound = fits.every((f) => f >= 1)
      && ws.every((w, i) => !isShort(w) || fits[i] === 3)
      && (fits.some((f) => f >= 2) || ws.filter((w) => !isShort(w)).length >= 2);
    return sound ? fits : null;
  };
  /** how many of the words `ws` one of the page's names says: "Femoral artery access" two of "femoral access", "femoral" one */
  const covers = (hit: SearchHit, ws: string[]) => Math.max(0, ...wordsOf(hit).names.map((name) => {
    const set = new Set(name.flatMap(forms));
    return ws.filter((w) => has(w, set)).length;
  }));
  /** whether the question says the whole of one of the page's names ("Q-wave" is all of "Q wave", half of "Non-Q-wave MI") */
  const inQuestion = new Set(tokens(q).flatMap(forms));
  const namesAll = (hit: SearchHit) => nameShare(wordsOf(hit), inQuestion) === 1;
  /**
   * the hits about all of `ws`: a page they name before one that only mentions them; then the one with a name that says
   * the most of them ("femoral access" is two words of "Femoral artery access", one of "Vascular access" or its other
   * name "femoral"); then one whose whole name the question says ("IVC" before "IVC Filter Placement")
   */
  const about = (ws: string[]) => search(ws.join(' '))
    .map((hit) => ({ hit, fits: fitting(hit, ws), cover: covers(hit, ws), whole: namesAll(hit) }))
    .filter((x): x is { hit: SearchHit; fits: number[]; cover: number; whole: boolean } => x.fits !== null)
    .sort((a, b) => Number(b.fits.some((f) => f >= 2)) - Number(a.fits.some((f) => f >= 2)) || b.cover - a.cover
      || Number(b.whole) - Number(a.whole) || b.hit.score - a.hit.score)
    .map((x) => x.hit);

  // a question of nothing but question words ("what is an ECG?"): its last word is what it asks about
  const asTyped = typed.length ? typed : q.toLowerCase().replace(/[?.!,;:()"“”]/g, ' ').split(/\s+/).filter(Boolean).slice(-1);
  const words = asTyped.map(singular);
  let asked = about(asTyped);
  if (!asked.length && words.join(' ') !== asTyped.join(' ')) asked = about(words);
  if (asked.length) {
    const top = asked[0];
    const pages = asked.filter((h) => h.kind !== 'term').map((h) => h.id);
    if (top.kind !== 'term') return { id: top.id, also: [] };
    const term = GLOSSARY_BY_ID[top.id.slice(5)];
    const see = term?.see;
    // "what is …?", or a term no library page teaches ("limb leads", "QT interval"): the definition itself
    if (definition || !see || definesTerm(q, term)) return { id: top.id, also: pages.slice(0, 2) };
    return { id: see, also: [] };
  }

  const all = words.map((_, i) => i);
  const long = all.filter((i) => !isShort(words[i]));
  const said = new Set(words.flatMap((w) => [w, withAliases(w) ?? '']).flatMap(tokens).flatMap(forms));
  type Fit = { hit: SearchHit; covered: number; named: number; share: number };
  // which of two fits is better: 1 / -1, or 0 when nothing but the search score tells them apart
  const better = (a: Fit, b: Fit) => Math.sign(a.covered - b.covered || a.named - b.named || a.share - b.share);
  for (let drop = 1; drop <= MAX_DROPPED && drop < words.length; drop++) {
    // the best way each page fits what is left (a glossary term and the page it points to are one answer)
    const found = new Map<string, Fit>();
    for (const kept of keeping(all, words.length - drop)) {
      // two-letter words alone ("rv", "mi") cannot stand for the question, nor one longer word out of three
      if (kept.every((i) => isShort(words[i]))) continue;
      if (kept.filter((i) => !isShort(words[i])).length * 2 < long.length) continue;
      const left = all.filter((i) => !kept.includes(i));
      for (const hit of search(kept.map((i) => words[i]).join(' '))) {
        const page = wordsOf(hit);
        const fits = kept.map((i) => fitOf(words[i], page));
        if (!kept.every((i, k) => fits[k] >= (isShort(words[i]) ? 3 : 2))) continue;
        // "U wave" without the "U" is any wave
        if (left.some((i) => isShort(words[i]) && fitOf(words[i], page) === 0)) continue;
        const fit: Fit = {
          hit,
          covered: left.filter((i) => has(words[i], page.gist)).length,
          named: fits.reduce((s, f) => s + f, 0),
          share: nameShare(page, said),
        };
        const key = (hit.kind === 'term' && GLOSSARY_BY_ID[hit.id.slice(5)]?.see) || hit.id;
        const prev = found.get(key);
        if (!prev || better(fit, prev) > 0 || (better(fit, prev) === 0 && hit.score > prev.hit.score)) found.set(key, fit);
      }
    }
    const ranked = Array.from(found.values()).sort((a, b) => better(b, a) || b.hit.score - a.hit.score);
    if (!ranked.length) continue;
    const [top] = ranked;
    const topNames = new Set(wordsOf(top.hit).names.map((n) => n.join(' ')));
    const sameThing = (f: Fit) => wordsOf(f.hit).names.some((n) => topNames.has(n.join(' ')));
    if (!ranked.every((f) => f === top || better(top, f) > 0 || sameThing(f))) return null;
    // of two names for one thing, the library page says more than the glossary (unless a definition was asked for)
    const pick = (!definition && top.hit.kind === 'term' && ranked.find((f) => f.hit.kind !== 'term' && better(top, f) === 0 && sameThing(f))) || top;
    const page = wordsOf(pick.hit);
    return { id: pick.hit.id, also: [], missed: all.filter((i) => fitOf(words[i], page) === 0).map((i) => asTyped[i]) };
  }
  return null;
}

function careField(level: LearningLevel): 'fieldCare' | 'hospitalCare' | 'cardiologyCare' {
  // EMS roles → field care; the ER nurse and doctor, and the cath lab tech and nurse → in-hospital (ED / ICU) care;
  // cardiologist → specialist care
  if (ROLE_SETTING[level] === 'field') return 'fieldCare';
  return level === 5 ? 'cardiologyCare' : 'hospitalCare';
}

export function answerQuestion(question: string, lib: ContentLibrary, ctx: TutorContext): TutorAnswer {
  const missed: string[] = [];
  const answer = composeAnswer(question, lib, ctx, missed);
  if (!missed.length) return answer;
  // the closest page left part of the question out: say so rather than pass it off as the answer
  const note = `Closest match: nothing here mentions ${missed.map((w) => `“${w}”`).join(' or ')}.`;
  return { ...answer, text: answer.text ? `${note} ${answer.text}` : note };
}

function composeAnswer(question: string, lib: ContentLibrary, ctx: TutorContext, missed: string[]): TutorAnswer {
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
    missed.push(...(match?.missed ?? []));
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
  // the role's own note, or (an ER role before the item's ER notes are written) the stand-in, labelled
  const focus = (notes: readonly string[]): string[] => {
    const n = levelNote(notes, level);
    return n ? [n.standIn ? `${lv} — ${n.standIn}: ${n.text}` : `${lv}: ${n.text}`] : [];
  };
  const s = lib.structures[targetId];
  if (s) {
    const field = intent === 'ecg' ? 'ecg' : intent === 'imaging' ? 'imaging' : intent === 'steps' ? 'procedures'
      : intent === 'mechanism' ? 'physiology' : intent === 'anatomy' ? 'anatomy' : intent === 'symptoms' || intent === 'complications' ? 'clinical' : 'overview';
    const bullets = (s as unknown as Record<string, string[]>)[field] ?? s.overview;
    return {
      title: `${s.name}${field !== 'overview' ? ` — ${field}` : ''}`,
      text: `${s.summary}${s.bloodSupply && field === 'anatomy' ? ` Blood supply: ${s.bloodSupply}.` : ''}`,
      bullets: [...bullets.slice(0, 6), ...focus(s.levelNotes)],
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
      bullets: [...bullets.slice(0, 6), ...extra, ...focus(c.levelNotes)],
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
      : whenField(q) ?? (intent === 'anatomy' ? 'anatomy' : 'overview');
    const bullets = (p as unknown as Record<string, string[]>)[field] ?? p.overview;
    return {
      title: `${p.name}${field !== 'overview' ? ` — ${field}` : ''}`,
      text: p.summary,
      bullets: [...bullets.slice(0, 6), ...focus(p.levelNotes)],
      links: [p.id, ...p.relatedConditions.slice(0, 3)],
      followUps: [`Walk me through ${p.name}`, `What are the complications of ${p.name}?`],
    };
  }
  const m = lib.medications[targetId];
  if (m) {
    // "the risks of not giving aspirin" are what it prevents: its indications
    const field = intent === 'dose' ? 'dosing' : intent === 'contra' ? 'contraindications'
      : intent === 'complications' ? (OMISSION.test(q) ? 'indications' : 'adverseEffects')
      : intent === 'ecg' ? 'ecgEffects' : intent === 'mechanism' ? 'mechanism' : whenField(q) ?? 'mechanism';
    const bullets = (m as unknown as Record<string, string[]>)[field] ?? m.mechanism;
    const note = field === 'dosing' ? ['Typical adult dosing for education — always follow current guidelines and local protocol'] : [];
    return {
      title: `${m.name} — ${field === 'adverseEffects' ? 'adverse effects' : field === 'ecgEffects' ? 'ECG effects' : field}`,
      text: `${m.drugClass}. ${m.summary}`,
      bullets: [...bullets.slice(0, 6), ...note, ...focus(m.levelNotes)],
      links: [m.id, ...m.relatedConditions.slice(0, 3)],
      followUps: [`What is the dose of ${m.name}?`, `What are the contraindications to ${m.name}?`],
    };
  }
  const cl = lib.cathlab[targetId];
  if (cl) {
    const numbers = (intent === 'dose' || /normal|value|size|how much|target|range/i.test(q)) && cl.numbers?.length;
    // the catalog is written for the three lab roles; the others (the EMS and ER roles) get no lab-role line
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
