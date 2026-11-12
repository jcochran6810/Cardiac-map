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

  it.each(['What does this ECG show?', 'what rhythm is this', "What's on the monitor?", 'What is the current rhythm?'])('blind: "%s" gets how to work it out, not the answer', (q) => {
    const a = ask(q, { profileId: 'paced', blind: true });
    const text = shown(q, { profileId: 'paced', blind: true });
    expect(a.title).toMatch(/once you have answered/);
    expect(text).not.toContain(paced.headline);
    expect(text).not.toContain(paced.name);
    for (const f of paced.findings) expect(text).not.toContain(f);
    expect(a.links).toEqual([]);
    expect(a.bullets.join(' ')).toMatch(/Rate/);
  });

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
    expect(ask('What are the complications of atrial fibrillation?').title).toBe(`${af} — complications`);
    expect(ask('What are the signs of cardiac tamponade?').title).toMatch(/ — symptoms$/);
    expect(ask('What are the contraindications to nitroglycerin?').title).toBe('Nitroglycerin — contraindications');
    expect(ask('What are the side effects of amiodarone?').title).toBe('Amiodarone — adverse effects');
  });

  it('does not offer the question it has just answered as a follow-up', () => {
    const a = ask('How is atrial fibrillation treated?');
    expect(a.followUps).not.toContain(`How is ${lib.conditions['atrial-fibrillation'].name} treated?`);
    expect(a.followUps.length).toBeGreaterThan(0);
  });
});
