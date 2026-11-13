import { beforeAll, describe, expect, it } from 'vitest';
import { answerQuestion, canReadMonitor, findTopic, type TutorContext } from '@/lib/tutor';
import { loadContent, useContentStore, type ContentLibrary } from '@/lib/content';
import { resolveProfile } from '@/lib/ecg/profiles';

let lib: ContentLibrary;
beforeAll(async () => {
  await loadContent();
  lib = useContentStore.getState().lib!;
});

const ctx = (over: Partial<TutorContext> = {}): TutorContext => ({
  level: 2, profileId: 'normal-sinus', selectedStructureId: null, selectedConditionId: null, selectedProcedureId: null, selectedMedicationId: null,
  ...over,
});
const ask = (q: string, over: Partial<TutorContext> = {}) => answerQuestion(q, lib, ctx(over));
/** everything an answer shows, as one string */
const shown = (q: string, over: Partial<TutorContext> = {}) => {
  const a = ask(q, over);
  return [a.title, a.text ?? '', ...a.bullets, ...a.followUps].join('\n');
};

describe('the tutor never names the rhythm while a question about it is open', () => {
  const paced = resolveProfile('paced');

  it('answers "What does this ECG show?" from the monitor when nothing is being asked', () => {
    expect(ask('What does this ECG show?', { profileId: 'paced' }).title).toBe(`On the monitor: ${paced.headline}`);
  });

  it.each([
    'What does this ECG show?', 'what rhythm is this', "What's on the monitor?", 'What is the current rhythm?',
    // these used to get the glossary's "Rhythm strip" with buttons to two rhythms, which read like hints
    'which rhythm is this?', 'Which rhythm is shown?', 'which ECG is this', 'what kind of rhythm is this?', 'which rhythm am I looking at',
    // …and these got the same, or "I could not find that"
    'which rhythm, please?', 'rhythm?', 'which rhythm is shown here?', 'which rhythm is displayed?', 'which rhythm is showing?',
    'which rhythm does this show?', 'which rhythm does it show?', 'which ECG is shown on screen', 'which rhythm is the patient in?',
  ])('blind: "%s" gets how to work it out, not the answer', (q) => {
    const a = ask(q, { profileId: 'paced', blind: true });
    const text = shown(q, { profileId: 'paced', blind: true });
    expect(a.title).toMatch(/once you have answered/);
    expect(text).not.toContain(paced.headline);
    expect(text).not.toContain(paced.name);
    for (const f of paced.findings) expect(text).not.toContain(f);
    expect(a.links).toEqual([]);
    expect(a.bullets.join(' ')).toMatch(/Rate/);
  });

  it('"which rhythm is this?" reads the monitor when no question is open', () => {
    expect(ask('which rhythm is this?', { profileId: 'paced' }).title).toBe(`On the monitor: ${paced.headline}`);
    expect(ask('Which rhythm is shown?', { profileId: 'paced' }).title).toBe(`On the monitor: ${paced.headline}`);
    const af = resolveProfile('atrial-fibrillation');
    for (const q of ['which rhythm is shown here?', 'which rhythm is displayed?', 'which rhythm does this show?', 'rhythm?']) {
      expect(ask(q, { profileId: 'atrial-fibrillation' }).title, q).toBe(`On the monitor: ${af.headline}`);
    }
  });

  it.each([
    'which rhythm loses the atrial kick completely?', 'What ECG is shown in hyperkalemia?', 'what is the ECG of a STEMI', 'What are the ECG changes in hyperkalemia?',
    // a verb between "the ECG" and "in …" used to make these monitor questions
    'what does the ECG look like in hyperkalemia', 'what does the ECG show in hyperkalemia', 'how does the ECG look in pericarditis',
    'what does the rhythm look like in atrial flutter', 'what is a rhythm strip',
  ])(
    '"%s" is about rhythms in general, not the monitor',
    (q) => {
      for (const blind of [false, true]) expect(ask(q, { blind }).title).not.toMatch(/^On the monitor|once you have answered/);
      expect(ask(q, { mode: 'home' }).title).not.toBe('There is no tracing on screen');
    },
  );

  it('…and gets the library page that answers it', () => {
    expect(ask('what does the ECG look like in hyperkalemia').title).toBe(`${lib.conditions.hyperkalemia.name} — ecg`);
    expect(ask('how does the ECG look in pericarditis').title).toBe(`${lib.conditions['acute-pericarditis'].name} — ecg`);
  });

  it.each(['what does the ECG show in lead II', 'what does the ECG look like in V1', 'what does the ECG look like', 'what does the ECG look like in this patient'])(
    '"%s" is still about the monitor',
    (q) => {
      expect(ask(q, { profileId: 'paced' }).title).toBe(`On the monitor: ${paced.headline}`);
      expect(ask(q, { profileId: 'paced', blind: true }).title).toMatch(/once you have answered/);
    },
  );

  it('says there is no tracing on the main menu or the course list, and does not name the case on the simulator', () => {
    expect(ask('What does this ECG show?', { mode: 'home' }).title).toBe('There is no tracing on screen');
    expect(ask('What does this ECG show?', { mode: 'courses' }).title).toBe('There is no tracing on screen');
    const sim = shown('What does this ECG show?', { mode: 'simulator', profileId: 'vt' });
    expect(sim).toMatch(/part of the case/);
    expect(sim).not.toContain(resolveProfile('vt').headline);
  });

  it('canReadMonitor: only on the learning screen with no question open', () => {
    expect(canReadMonitor({})).toBe(true);
    expect(canReadMonitor({ mode: 'learn' })).toBe(true);
    expect(canReadMonitor({ mode: 'learn', blind: true })).toBe(false);
    expect(canReadMonitor({ mode: 'home' })).toBe(false);
    expect(canReadMonitor({ mode: 'simulator' })).toBe(false);
  });

  it('a question it cannot place does not offer "What does this ECG show?" while blind', () => {
    const a = ask('qwertyuiop zxcvb', { blind: true });
    expect(a.title).toBe('I could not find that in the library');
    expect(a.followUps).not.toContain('What does this ECG show?');
  });
});

describe('finding what a question is about', () => {
  it('everyday questions that used to find nothing', () => {
    // "hold" means when not to give it
    const nitro = ask('when do I hold nitro');
    expect(nitro.title).toBe('Nitroglycerin — contraindications');
    expect(nitro.bullets.join(' ')).toMatch(/RV infarction/);
    // a drug and a condition together: the page that covers both
    const rv = shown('nitro in RV infarct?');
    expect(rv).toMatch(/right ventric|RV infarction/i);
    expect(rv).toMatch(/nitro/i);
    expect(ask('nitro in RV infarct?').title).not.toBe('I could not find that in the library');
  });

  it('the page whose name says more of the question wins over another name that says one word of it', () => {
    // "femoral" and "radial" are other names of the glossary's "Vascular access": they used to win over the cath lab pages
    expect(findTopic('femoral access', lib)?.id).toBe('cl-femoral-access');
    expect(findTopic('radial access', lib)?.id).toBe('cl-radial-access');
    expect(ask('femoral access').title).toBe(lib.cathlab['cl-femoral-access'].name);
    expect(ask('radial access').title).toBe(lib.cathlab['cl-radial-access'].name);
    expect(findTopic('vascular access', lib)?.id).toBe('term:access');
    // a whole short name still beats a longer one that only starts with it
    expect(findTopic('IVC', lib)?.id).toBe('ivc');
    expect(findTopic('what is a Q wave', lib)?.id).toBe('term:q-wave');
  });

  it('"what is a STEMI" gets the definition, not the cath lab checklist', () => {
    expect(findTopic('what is a stemi', lib)?.id).toBe('term:stemi');
    const a = ask('what is a stemi');
    expect(a.title).toBe('STEMI');
    expect(a.text).toMatch(/ST-elevation myocardial infarction/);
    // the page that teaches it comes first among the links
    expect(a.links[0]).toBe('anterior-stemi');
    expect(ask("What's a STEMI?").title).toBe('STEMI');
  });

  it('a "what is" question ranks the glossary and the clinical pages above the cath lab catalog', () => {
    for (const q of ['what is a stemi', 'what is STEMI?', 'define stemi', 'what are stemis']) {
      const id = findTopic(q, lib)?.id ?? '';
      expect(id.startsWith('cl-'), `${q} → ${id}`).toBe(false);
    }
  });

  it('any other question about a glossary word is answered from the page that teaches it', () => {
    // the glossary entry points at the page; the page has the treatment, the ECG and the rest
    expect(findTopic('how is a stemi treated', lib)?.id).toBe('anterior-stemi');
    expect(ask('how is a stemi treated').title).toMatch(/STEMI — field care$/);
    expect(findTopic('mobitz ii', lib)?.id).toBe('mobitz-type-ii');
    expect(findTopic('what do I give a patient with SVT', lib)?.id).toBe('avnrt');
  });

  it('keeps the answers that already worked', () => {
    expect(ask('amiodarone dose').title).toBe('Amiodarone — dosing');
    expect(ask('adenosine dose for SVT').title).toBe('Adenosine — dosing');
    expect(ask('epi dose cardiac arrest').title).toBe('Epinephrine — dosing');
    expect(ask('how do I localize a STEMI').title).toBe('Localizing a STEMI');
    expect(ask('Explain the cardiac cycle').title).toBe('The cardiac cycle');
    expect(ask('blorptastic frobnicator').title).toBe('I could not find that in the library');
  });

  it('a retry does not settle for a page that only shares a fragment of a word', () => {
    // "go" is inside "diagonal": the electrodes question is about electrodes
    expect(findTopic('where the electrodes go', lib)?.id).toBe('term:electrode');
    expect(findTopic('nitro in RV infarct?', lib)?.id).toBe('term:rv-infarction');
  });

  // each of these landed on a page that only shared a letter or a fragment with the question: for a teaching tool
  // "could not find" is better than a confident wrong answer
  it.each([
    ['what is a P wave', 'cl-ifr'], // "p" in "Pd/Pa"
    ['how do I count the rate', 'cl-iabp'], // "count" in "Counterpulsation"
    ['where do I put V1', 'vasopressin'], // its V1 receptor
    ['how do I place V1', 'tavr'], // "place" in "Replacement"
    ['limb leads', 'svc'],
    ['lead placement', 'leadless-pacemaker'], // "lead" in "Leadless"
    ['statin after MI', 'mitral-regurgitation'], // "mi" in "Mitral"
    ['oxygen in MI', 'metoprolol'],
    ['U wave', 'nstemi'], // "u" in "Unstable"
    ['heart rate calculation', 'hfref'],
    ['where does V4 go', 'inferior-stemi'], // "v4" in "V4R"
    ['T wave', 'cl-aortic-waveform'], // "t" and "wave" in "The arterial (aortic) waveform"
  ])('"%s" is not answered from %s', (q, wrong) => {
    expect(findTopic(q, lib)?.id).not.toBe(wrong);
  });

  it.each(['how do I count the rate', 'where do I put V1', 'how do I place V1', 'U wave', 'heart rate calculation', 'where does V4 go', 'oxygen in MI'])(
    '"%s" gets "could not find"',
    (q) => expect(ask(q).title).toBe('I could not find that in the library'),
  );

  it('a glossary word with no library page of its own is answered with its definition', () => {
    expect(ask('what is a P wave').title).toBe('P wave');
    expect(ask('limb leads').title).toBe('Limb leads');
    expect(ask('T wave').title).toBe('T wave');
    expect(ask('QT interval').title).toBe('QT interval');
  });

  it('a retry says which words its answer leaves out, and only then', () => {
    const lead = ask('lead placement');
    expect(lead.title).toBe('Lead');
    expect(lead.text).toMatch(/^Closest match: nothing here mentions “placement”\./);
    expect(ask('statin after MI').title).toMatch(/^Atorvastatin/);
    expect(ask('nitro in RV infarct?').text).not.toMatch(/Closest match/);
    expect(ask('amiodarone dose').text).not.toMatch(/Closest match/);
    expect(ask('digoxin toxicity').title).toBe('Digoxin — adverse effects');
    expect(ask('heparin for PE').title).toMatch(/Heparin — /);
  });

  it('every library page and glossary word is still found by its own name', () => {
    const pages = [...Object.values(lib.conditions), ...Object.values(lib.medications), ...Object.values(lib.structures)];
    const missing = pages.filter((p) => !findTopic(p.name, lib)).map((p) => p.name);
    expect(missing).toEqual([]);
  });

  it('never lands on a lesson, a tool or a simulator case it cannot answer from', () => {
    for (const q of ['where the electrodes go', 'rhythm trainer', 'glossary', 'electrode placement']) {
      const a = ask(q);
      expect(a.title, q).not.toBe('No answer found');
    }
  });
});

describe('what kind of answer a question wants', () => {
  it('reads plural and past-tense words (the suggestion chips use them)', () => {
    const af = lib.conditions['atrial-fibrillation'].name;
    expect(ask('How is atrial fibrillation treated?').title).toBe(`${af} — field care`);
    expect(ask('How is atrial fibrillation treated?', { level: 4 }).title).toBe(`${af} — ED / ICU care`);
    // the ER nurse and the ER doctor get the ED care, not the field's or the cardiologist's
    expect(ask('How is atrial fibrillation treated?', { level: 6 }).title).toBe(`${af} — ED / ICU care`);
    expect(ask('How is atrial fibrillation treated?', { level: 7 }).title).toBe(`${af} — ED / ICU care`);
    expect(ask('How is atrial fibrillation treated?', { level: 5 }).title).toBe(`${af} — cardiology care`);
    expect(ask('What are the complications of atrial fibrillation?').title).toBe(`${af} — complications`);
    expect(ask('What are the signs of cardiac tamponade?').title).toMatch(/ — symptoms$/);
    expect(ask('What are the contraindications to nitroglycerin?').title).toBe('Nitroglycerin — contraindications');
    expect(ask('What are the side effects of amiodarone?').title).toBe('Amiodarone — adverse effects');
  });

  // "give" used to make these treatment questions, and "when" then picked the indications: the opposite of what was asked
  it.each([
    ['when should I not give nitroglycerin', 'nitroglycerin'],
    ['when not to give nitro', 'nitroglycerin'],
    ['when is nitro not given', 'nitroglycerin'],
    ["don't give nitro if", 'nitroglycerin'],
    ['when do I hold nitro', 'nitroglycerin'],
    ['when not to give aspirin', 'aspirin'],
    ["when shouldn't I give aspirin", 'aspirin'],
    ['who should not get aspirin', 'aspirin'],
    ['when should I not give amiodarone', 'amiodarone'],
    // used to land on the cath lab's "IV adenosine for hyperemia"
    ['when should I not give adenosine', 'adenosine'],
    ["when can't I give metoprolol", 'metoprolol'],
    ['when to avoid diltiazem', 'diltiazem'],
    // a "not" before a word for "safe" or "indicated", or before what the patient does ("have", "take"): these got the
    // indications (or the mechanism) too
    ['when is it not safe to give nitro', 'nitroglycerin'],
    ['when is nitroglycerin not safe', 'nitroglycerin'],
    ['when is aspirin not indicated', 'aspirin'],
    ['when is adenosine not recommended', 'adenosine'],
    ['in which patients is adenosine not recommended', 'adenosine'],
    ['when is amiodarone not appropriate', 'amiodarone'],
    ['who should not have tenecteplase', 'tenecteplase'],
    ["who can't have tenecteplase", 'tenecteplase'],
    ['who is not a candidate for fibrinolysis', 'tenecteplase'],
    ['which patients should not have a beta blocker', 'metoprolol'],
    ["who doesn't get aspirin", 'aspirin'],
    ['when do patients not get aspirin', 'aspirin'],
    // "push" was searched for, and found the cath lab's "IV adenosine for hyperemia"
    ["when shouldn't you push adenosine", 'adenosine'],
  ])('"%s" gets the contraindications to %s', (q, id) => {
    const a = ask(q);
    expect(a.title).toBe(`${lib.medications[id].name} — contraindications`);
    expect(a.bullets[0]).toBe(lib.medications[id].contraindications[0]);
    expect(a.text).not.toMatch(/Closest match/);
  });

  it('a "not" that is not about giving a drug, and a plain "when to give", keep their meaning', () => {
    expect(ask("why don't I see P waves in atrial fibrillation").title).toBe(`${lib.conditions['atrial-fibrillation'].name} — ecg`);
    expect(ask('when to give aspirin').title).toBe('Aspirin — indications');
    expect(ask('what is aspirin used for').title).toBe('Aspirin — indications');
    expect(ask('who gets aspirin').title).toBe('Aspirin — indications');
    expect(ask('why do diabetics not have chest pain in an MI').title).not.toMatch(/contraindications|medications/);
  });

  it('procedures: a "not" with "when" or "who" asks for the contraindications', () => {
    const tavr = lib.procedures.tavr.name;
    expect(ask('when is TAVR not appropriate').title).toBe(`${tavr} — contraindications`);
    expect(ask('who should not have a TAVR').title).toBe(`${tavr} — contraindications`);
    expect(ask('when should PCI not be done').title).toBe(`${lib.procedures['pci-stent'].name} — contraindications`);
    expect(ask('when is TAVR indicated').title).toBe(`${tavr} — indications`);
  });

  // a "not", a "never" or an "avoid" used to win over everything else the question asked
  it('a dose question with a "not" or "never" in it is still a dose question', () => {
    expect(ask("what is the dose of epinephrine if I can't get IV access").title).toBe('Epinephrine — dosing');
    expect(ask("what dose of epinephrine if we can't get an IV").title).toBe('Epinephrine — dosing');
    expect(ask('how much amiodarone do I give').title).toBe('Amiodarone — dosing');
    expect(ask('what dose of aspirin do I give').title).toBe('Aspirin — dosing');
    // …but a "when not to give" question that mentions a dose is still about when not to give it
    expect(ask('when should I not give a second dose of adenosine').title).toBe('Adenosine — contraindications');
  });

  it('how to avoid complications, and the risks of not giving a drug, are not contraindication questions', () => {
    const pci = lib.procedures['pci-stent'].name;
    expect(ask('how to avoid complications of PCI').title).toBe(`${pci} — complications`);
    expect(ask('how do I avoid complications of femoral access').title).toBe(lib.cathlab['cl-femoral-access'].name);
    expect(ask('how to avoid complications after an MI').title).not.toMatch(/Ventricular Septal Defect|contraindications|medications/);
    // what aspirin prevents: its indications, not its contraindications or its side effects
    expect(ask('what are the risks of not giving aspirin').title).toBe('Aspirin — indications');
    expect(ask('what are the risks of aspirin').title).toBe('Aspirin — adverse effects');
  });

  it('nitroglycerin: every contraindication is shown, the heart-rate limits included', () => {
    const a = ask('when do I hold nitro');
    for (const c of lib.medications.nitroglycerin.contraindications) expect(a.bullets).toContain(c);
    expect(a.bullets.join(' ')).toMatch(/bradycardia \(< 50\/min\), or tachycardia \(> 100\/min\) without heart failure/);
  });

  it('"what is a Q wave?" gets the definition (with the page that teaches it), not the ECG section of that page', () => {
    for (const q of ['what is a Q wave', 'what is a Q-wave?', 'what are pathologic Q waves']) {
      const a = ask(q);
      expect(a.title, q).toBe('Q wave');
      expect(a.links[0], q).toBe('anterior-stemi');
    }
    expect(ask('what is a delta wave').title).toBe('Delta wave');
    // the page's own question still gets the page
    expect(ask('what is the ECG of a STEMI').title).toMatch(/STEMI — ecg$/);
  });

  it('does not offer the question it has just answered as a follow-up', () => {
    const a = ask('How is atrial fibrillation treated?');
    expect(a.followUps).not.toContain(`How is ${lib.conditions['atrial-fibrillation'].name} treated?`);
    expect(a.followUps.length).toBeGreaterThan(0);
  });
});

describe('the role focus line', () => {
  const focusOf = (q: string, level: TutorContext['level']) => ask(q, { level }).bullets.filter((b) => b.startsWith('Focus for '));

  it.each([
    ['What is amiodarone?', 'amiodarone'], ['What is atrial fibrillation?', 'atrial-fibrillation'],
    ['What is the mitral valve?', 'mitral-valve'], ['What is pericardiocentesis?', 'pericardiocentesis'],
  ])('"%s": every role gets one focus line, never "undefined"', (q) => {
    for (const level of [1, 2, 3, 4, 5, 6, 7] as const) {
      const lines = focusOf(q, level);
      expect(lines, `level ${level}`).toHaveLength(1);
      expect(lines[0], `level ${level}`).not.toMatch(/undefined/);
    }
  });

  it('labels a stand-in note as another role\'s until the ER notes are written', () => {
    const notes = lib.medications.amiodarone.levelNotes;
    const [nurse] = focusOf('What is amiodarone?', 6);
    const [doctor] = focusOf('What is amiodarone?', 7);
    if (notes.length === 7) {
      expect(nurse).toBe(`Focus for Emergency Nurse (RN · ED): ${notes[5]}`);
      expect(doctor).toBe(`Focus for Emergency Physician (MD/DO): ${notes[6]}`);
    } else {
      expect(nurse).toMatch(/^Focus for Emergency Nurse \(RN · ED\) — Not written for the ER Nurse yet — this is the Cath Lab RN note/);
      expect(nurse.endsWith(notes[3])).toBe(true);
      expect(doctor).toMatch(/^Focus for Emergency Physician \(MD\/DO\) — Not written for the ER Doctor yet — this is the Cardiologist note/);
      expect(doctor.endsWith(notes[4])).toBe(true);
    }
  });
});
