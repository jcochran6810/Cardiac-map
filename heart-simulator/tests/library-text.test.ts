import { describe, expect, it } from 'vitest';
import { CATH_IMAGES } from '@/data/cathImages';
import { CONDITIONS } from '@/data/content';
import { CATHLAB } from '@/data/content/cathlab';
import { SCENARIO_BY_ID } from '@/lib/sim/scenario/scenarios';
import { CONDITION_IDS } from '@/types/content';

/**
 * Library and image words the case reviews corrected (follow-ups 18, 26, 29, 64, 78, 83, 129): a caption that is about the
 * published patient, not the learner's; the vasovagal and retroperitoneal cards; the SCAD page the SCAD case now links.
 */

const BRITISH = /haem|aemia|ischaem|oedem|centre|colour|\bgrey|favour|recognis|organis|litres|metres/i;

describe('image captions say whose image it is', () => {
  it('the stent thrombosis: the published case, not the patient in the case', () => {
    const c = CATH_IMAGES['stent-thrombosis']!.caption;
    expect(c).toMatch(/^Stent thrombosis: the LAD is occluded at the stent \(arrow\)\. In the published case this image comes from, a stent placed years earlier clotted about 30 minutes after an allergic reaction to CT contrast \(Kounis syndrome type III\); whatever sets it off, a stent that has clotted looks the same\.$/);
    expect(c).not.toMatch(/In this patient/);
  });

  it('the tamponade echo: the chest wound was the published patient\'s', () => {
    expect(CATH_IMAGES['tamponade-echo']!.caption).toMatch(/\(In the patient this image comes from, a chest wound caused it\.\)$/);
  });
});

describe('cath lab catalog cards', () => {
  it('the coronary dissection card shows the deep-seated Amplatz dissection too', () => {
    expect(CATHLAB['cl-comp-dissection'].image!.keys).toEqual(['lad-dissection', 'amplatz-left-guide-rca']);
  });

  it('vasovagal: the legs above the heart (the bed tilted after a femoral puncture); prevention names the trial correctly', () => {
    const text = CATHLAB['cl-comp-vasovagal'].details.join(' ');
    expect(text).toMatch(/legs above the heart \(after a femoral puncture, tilt the whole bed head-down so the punctured hip stays straight\)/);
    expect(text).toMatch(/radial access where it suits \(or a closure device\)/);
    expect(text).toMatch(/611-patient randomized trial \(Int J Cardiol 2007\) IV fentanyl and midazolam gave less pain than local lidocaine/);
    expect(text).not.toMatch(/Kiat Ang|raise the legs/);
  });

  it('the retroperitoneal bleed: plain CT shows the hematoma, CT angiography whether it still bleeds', () => {
    expect(CATHLAB['cl-comp-rp-bleed'].details.join(' ')).toMatch(/Confirm with a CT of the abdomen and pelvis \(without contrast it shows the hematoma; CT angiography also shows whether it is still bleeding\), but do not delay treating an unstable patient for the scan\./);
  });
});

describe('library conditions', () => {
  it('a search for a posterior STEMI finds the lateral STEMI page that teaches V7–V9', () => {
    // a lead name in a page's name would answer "where do I put V1" with this page: the synonym says it without one
    expect(CONDITIONS['lateral-stemi'].synonyms).toEqual(expect.arrayContaining(['Posterior STEMI', 'Isolated posterior MI (anterior ST depression)']));
    expect(CONDITIONS['lateral-stemi'].ecg.join(' ')).toMatch(/ST depression in V1–V3 suggests posterior involvement; record V7–V9/);
  });

  it('SCAD has a page of its own, linked by the SCAD case: conservative care, no fibrinolysis, heparin stopped, a beta-blocker, 3–5 days on the monitor', () => {
    const scad = CONDITIONS.scad;
    expect(scad).toBeDefined();
    expect(CONDITION_IDS as readonly string[]).toContain('scad');
    expect(SCENARIO_BY_ID['scad-cathlab'].conditionId).toBe('scad');
    expect(scad.levelNotes).toHaveLength(7);
    const all = [scad.summary, ...scad.levelNotes, ...scad.overview, ...scad.anatomy, ...scad.pathophysiology, ...scad.symptoms, ...scad.ecg,
      ...scad.imaging, ...scad.medications, ...scad.fieldCare, ...scad.hospitalCare, ...scad.cardiologyCare, ...scad.procedure,
      ...scad.complications, ...scad.teaching, ...scad.redFlags].join(' ');
    expect(all).toMatch(/conservative/i);
    expect(all).toMatch(/Avoid fibrinolysis/);
    expect(all).toMatch(/once SCAD is diagnosed and no stent is placed, stopping it is appropriate/);
    expect(all).toMatch(/A beta-blocker is reasonable/);
    expect(all).toMatch(/Telemetry for 3–5 days/);
    expect(all).toMatch(/fibromuscular dysplasia/);
    expect(all).not.toMatch(BRITISH);
    // the ER doctor is told to send her to the lab, not to lyse her
    expect(scad.levelNotes[6]).toMatch(/activate the cath lab rather than giving a fibrinolytic/);
    // the page links no clot-dissolving drug
    expect(scad.relatedMedications).not.toContain('tenecteplase');
  });

  it('SCAD: every line that recommends an ACE inhibitor or ARB warns against it in pregnancy; the lysis line names its source', () => {
    // her population is peripartum: renin-angiotensin blockers are fetotoxic (AHA 2018 statement; the labels' boxed warning)
    const scad = CONDITIONS.scad;
    const lines = [...scad.levelNotes, ...scad.medications, ...scad.hospitalCare, ...scad.cardiologyCare].filter((l) => /ACE inhibitor|ARB/.test(l));
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const l of lines) expect(l).toMatch(/never in pregnancy/);
    expect(scad.medications.join(' ')).toMatch(/atenolol and statins are avoided in pregnancy/);
    expect(scad.cardiologyCare.join(' ')).toMatch(/while breastfeeding, enalapril or captopril/);
    // the AHA statement does not address lysis: the ESC position paper does
    expect(scad.medications.find((l) => /fibrinolysis/.test(l))).toMatch(/^Avoid fibrinolysis \(ESC position paper 2018\)/);
  });

  it('Takotsubo: with outflow obstruction no diuretic or nitrate (they empty the ventricle); diuretics only without it', () => {
    const meds = CONDITIONS.takotsubo.medications.join(' ');
    expect(meds).toMatch(/Diuretics for congestion without outflow obstruction; with LVOT obstruction avoid diuretics and nitrates \(fluid and phenylephrine instead\)/);
    expect(meds).not.toMatch(/Diuretics for congestion;/);
  });
});
