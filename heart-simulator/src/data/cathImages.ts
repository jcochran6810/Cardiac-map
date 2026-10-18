/**
 * Real angiograms, pressure-wire screens, intravascular images, echo and X-ray images shown in the cath
 * lab catalog and the simulator, stored in public/cath-images/. Every one is a figure from an open-access
 * journal article under a Creative Commons Attribution licence (CC BY 3.0 or 4.0) — checked against the
 * article's own licence text, not just its metadata (the two can disagree: a "CC BY" link on a
 * non-commercial article was found and left out) — and is credited, linked and marked "cropped" where
 * it is shown.
 *
 * Keys are referenced by catalog items (`image.keys`) and by scenarios (`Scenario.images`).
 * `alt` names the kind of image only — it must not give away the finding a learner is asked to read;
 * `caption` says what it shows and is revealed once the read is given.
 */
export interface CathImage {
  /** path under public/, e.g. /cath-images/lad-occlusion.jpg */
  src: string;
  width: number;
  height: number;
  /** what kind of image this is (no findings) */
  alt: string;
  /** what the image shows — the teaching point */
  caption: string;
  /** authors, journal and figure, as the licence asks; says when the figure was cropped */
  credit: string;
  license: string;
  licenseUrl: string;
  /** the article the image came from */
  source: string;
}

const CC_BY_4 = { license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' } as const;
const CC_BY_3 = { license: 'CC BY 3.0', licenseUrl: 'https://creativecommons.org/licenses/by/3.0/' } as const;
const pmc = (id: string) => `https://pmc.ncbi.nlm.nih.gov/articles/${id}/`;

const SAITO = 'Saito R, Koyama K, Kongoji K, Soejima K. BMC Cardiovasc Disord 2022;22:206';
const KLEMENC = 'Klemenc M, Budihna G, Kranjec I. Eur Heart J Case Rep 2023;8:ytad605';
const LAHIRI = 'Lahiri S, Rashid O, Goel A, Moondhra A. Cureus 2025;17:e98607';
const KANDA = 'Kanda D, Takumi T, Sonoda T, et al. BMC Cardiovasc Disord 2021;21:55';
const BARUS = 'Baruś P, Piasecki A, Gumiężna K, et al. Front Cardiovasc Med 2023;10:1021023';
const ALSARA = 'Alsara O, Alsarah A, Kalavakunta JK, et al. Case Rep Med 2013;2013:834164';
const CHATURVEDI = 'Chaturvedi A, Rotman Y, Hoang T, et al. Insights Imaging 2023;14:122';

export const CATH_IMAGES: Partial<Record<string, CathImage>> = {
  'lad-occlusion': {
    src: '/cath-images/lad-occlusion.jpg', width: 777, height: 912,
    alt: 'Left coronary angiogram',
    caption: 'The proximal LAD stops dead (arrow): a total occlusion with no flow beyond it (TIMI 0).',
    credit: `${SAITO}, fig. 7B (cropped)`, ...CC_BY_4, source: pmc('PMC9088105'),
  },
  'lad-open-after-aspiration': {
    src: '/cath-images/lad-open-after-aspiration.jpg', width: 402, height: 351,
    alt: 'Left coronary angiogram',
    caption: 'The same LAD after a balloon, a stent and thrombus aspiration: contrast now runs to the apex (TIMI 3 flow). In this patient the flow soon slowed again (no-reflow) and VF followed.',
    credit: 'Oktaviono YH, Hutomo SA, Al-Farabi MJ. Medicine (Baltimore) 2020;99:e19288, fig. 4D (cropped)', ...CC_BY_4, source: pmc('PMC7478610'),
  },
  'lad-open-impella': {
    src: '/cath-images/lad-open-impella.jpg', width: 758, height: 925,
    alt: 'Left coronary angiogram',
    caption: 'The same LAD after stenting: open to the apex with TIMI 3 flow. The thick catheter crossing the picture is an Impella CP pump, which supported this patient in cardiogenic shock during the PCI.',
    credit: `${SAITO}, fig. 8B (cropped)`, ...CC_BY_4, source: pmc('PMC9088105'),
  },
  'rca-open-timi3': {
    src: '/cath-images/rca-open-timi3.jpg', width: 831, height: 925,
    alt: 'Right coronary angiogram',
    caption: 'The same right coronary after stenting: open all the way to the crux with TIMI 3 flow and no narrowing left. The wire loop in the middle is a temporary pacing catheter — this patient had complete heart block.',
    credit: `${SAITO}, fig. 8A (cropped)`, ...CC_BY_4, source: pmc('PMC9088105'),
  },
  'lad-intermediate-ffr-positive': {
    src: '/cath-images/lad-intermediate-ffr-positive.jpg', width: 368, height: 369,
    alt: 'Left coronary angiogram',
    caption: 'An intermediate narrowing in the distal LAD (arrow) — borderline by eye. The pressure wire showed it limits flow (FFR below 0.80), so it was stented.',
    credit: 'Matsuo A, Shimoo S, Takamatsu K, et al. Cardiovasc Interv Ther 2018;33:99, fig. 5a (cropped)', ...CC_BY_4, source: pmc('PMC5880845'),
  },
  'lad-stented-after-ffr': {
    src: '/cath-images/lad-stented-after-ffr.jpg', width: 368, height: 369,
    alt: 'Left coronary angiogram',
    caption: 'The same LAD after the stent: no narrowing is left where the lesion was.',
    credit: 'Matsuo A, Shimoo S, Takamatsu K, et al. Cardiovasc Interv Ther 2018;33:99, fig. 5b (cropped)', ...CC_BY_4, source: pmc('PMC5880845'),
  },
  'lad-perforation-ellis3': {
    src: '/cath-images/lad-perforation-ellis3.jpg', width: 878, height: 852,
    alt: 'Left coronary angiogram',
    caption: 'An Ellis type III perforation at the edge of a newly implanted LAD scaffold, right after high-pressure post-dilation: contrast pours out of the vessel and nothing flows beyond the tear. Prolonged balloon inflation, fluids and pressors stabilized the patient.',
    credit: 'Chen D, Gadeley R, Wang A, Jepson N. BMC Cardiovasc Disord 2022;22:66, fig. 2 (cropped)', ...CC_BY_4, source: pmc('PMC8864843'),
  },
  'lad-covered-stent-sealed': {
    src: '/cath-images/lad-covered-stent-sealed.jpg', width: 888, height: 861,
    alt: 'Left coronary angiogram',
    caption: 'The same LAD after a 3.0 × 21 mm covered stent (BeGraft) across the tear: the leak has stopped and flow down the LAD is normal again.',
    credit: 'Chen D, Gadeley R, Wang A, Jepson N. BMC Cardiovasc Disord 2022;22:66, fig. 3 (cropped)', ...CC_BY_4, source: pmc('PMC8864843'),
  },
  'rca-occlusion': {
    src: '/cath-images/rca-occlusion.jpg', width: 804, height: 912,
    alt: 'Right coronary angiogram',
    caption: 'The right coronary artery ends abruptly in its proximal segment (arrow): a total occlusion (TIMI 0). Nothing fills beyond it.',
    credit: `${SAITO}, fig. 7A (cropped)`, ...CC_BY_4, source: pmc('PMC9088105'),
  },
  'lad-intermediate-rao-cranial': {
    src: '/cath-images/lad-intermediate-rao-cranial.jpg', width: 648, height: 609,
    alt: 'Left coronary angiogram, RAO cranial view',
    caption: 'RAO cranial view of the left coronary: a moderate narrowing of the LAD (arrow) with flow preserved beyond it. By eye nobody can tell whether it limits flow — the pressure wire can.',
    credit: `${KLEMENC}, fig. 2 (cropped)`, ...CC_BY_4, source: pmc('PMC10762887'),
  },
  'lad-occlusion-thrombus': {
    src: '/cath-images/lad-occlusion-thrombus.jpg', width: 394, height: 391,
    alt: 'Left coronary angiogram',
    caption: 'The proximal LAD is totally occluded (arrow), with a large thrombus burden.',
    credit: 'Oktaviono YH, Hutomo SA, Al-Farabi MJ. Medicine (Baltimore) 2020;99:e19288, fig. 2B (cropped)', ...CC_BY_4, source: pmc('PMC7478610'),
  },
  'normal-left-rao-caudal': {
    src: '/cath-images/normal-left-rao-caudal.jpg', width: 382, height: 345,
    alt: 'Left coronary angiogram, RAO caudal view',
    caption: 'A normal left coronary system in the RAO caudal view: the left main dividing into a smooth LAD and circumflex, no narrowing anywhere.',
    credit: `${LAHIRI}, fig. 2B (cropped)`, ...CC_BY_4, source: pmc('PMC12770860'),
  },
  'normal-rca-lao': {
    src: '/cath-images/normal-rca-lao.jpg', width: 272, height: 409,
    alt: 'Right coronary angiogram, LAO view',
    caption: 'A normal but small right coronary in the LAO view. It is non-dominant: the posterior descending artery comes from the circumflex instead.',
    credit: `${LAHIRI}, fig. 2A (cropped)`, ...CC_BY_4, source: pmc('PMC12770860'),
  },
  'left-rao-caudal': {
    src: '/cath-images/left-rao-caudal.jpg', width: 880, height: 902,
    alt: 'Left coronary angiogram, RAO 30° caudal 25°',
    caption: 'The left coronary in RAO 30° caudal 25° (the angles are printed in the corner) — the classic view of the left main bifurcation and the circumflex with its marginal branches. The arrow marks an occluded circumflex branch in this patient.',
    credit: `${KANDA}, fig. 3a (cropped)`, ...CC_BY_4, source: pmc('PMC7845111'),
  },
  'left-lao-cranial': {
    src: '/cath-images/left-lao-cranial.jpg', width: 886, height: 902,
    alt: 'Left coronary angiogram, LAO 50° cranial 25°',
    caption: 'The same left coronary in LAO 50° cranial 25°: the tree looks completely different from the RAO caudal view. The arrow marks the same occluded circumflex branch.',
    credit: `${KANDA}, fig. 3b (cropped)`, ...CC_BY_4, source: pmc('PMC7845111'),
  },
  'rca-perforation': {
    src: '/cath-images/rca-perforation.jpg', width: 880, height: 933,
    alt: 'Right coronary angiogram, LAO 50°',
    caption: 'Contrast leaking out of the acute marginal branch of the right coronary (arrow): a coronary perforation. In this patient the needle of an emergency pericardiocentesis had nicked it; coils sealed it.',
    credit: `${KANDA}, fig. 3c (cropped)`, ...CC_BY_4, source: pmc('PMC7845111'),
  },
  'rca-lao-coils': {
    src: '/cath-images/rca-lao-coils.jpg', width: 886, height: 933,
    alt: 'Right coronary angiogram, LAO 50°',
    caption: 'The right coronary in LAO 50°: the classic "C" from the ostium round to the crux. The arrow marks coils that sealed a perforated branch.',
    credit: `${KANDA}, fig. 3d (cropped)`, ...CC_BY_4, source: pmc('PMC7845111'),
  },
  'ffr-console': {
    src: '/cath-images/ffr-console.jpg', width: 417, height: 228,
    alt: 'Pressure-wire console screen',
    caption: 'A pressure-wire console: FFR 0.90 (Pd 70 ÷ Pa 78 at maximal hyperemia) and a resting Pd/Pa of 0.96 — not significant (FFR ≤ 0.80 is). It also shows CFR and IMR, which test the small vessels.',
    credit: 'Provera A, Andreini D, Petersen K, et al. Eur Heart J Case Rep 2024;8:ytae172, fig. 2B (cropped)', ...CC_BY_4, source: pmc('PMC11033843'),
  },
  'rfr-pullback': {
    src: '/cath-images/rfr-pullback.jpg', width: 800, height: 469,
    alt: 'Resting pressure-ratio pullback through the LAD',
    caption: 'A resting pressure-ratio (RFR) pullback from the distal LAD (left) to the proximal LAD (right): the ratio rises gradually from 0.82 with no single step — diffuse disease, not one focal narrowing (a resting ratio ≤ 0.89 is significant).',
    credit: `${KLEMENC}, fig. 4`, ...CC_BY_4, source: pmc('PMC10762887'),
  },
  'oct-tcfa': {
    src: '/cath-images/oct-tcfa.jpg', width: 579, height: 579,
    alt: 'Optical coherence tomography cross-section of a coronary artery',
    caption: 'OCT cross-section: a thin-cap fibroatheroma (white arrow) over a dense lipid pool (red arrow), cholesterol crystals (green arrow) and fibrous tissue (asterisk). The bright rings in the lumen are the imaging catheter.',
    credit: 'Vijayvergiya R, Kanabar K, Panda P, Lal A. Eur Heart J Case Rep 2019;3:ytz139, fig. 2 (cropped)', ...CC_BY_4, source: pmc('PMC6764536'),
  },
  'lv-gram-aneurysm': {
    src: '/cath-images/lv-gram-aneurysm.jpg', width: 313, height: 359,
    alt: 'Left ventriculogram',
    caption: 'A left ventriculogram with a large apical aneurysm: a thin-walled pouch at the apex that bulges out while the rest of the ventricle squeezes. (This patient\'s coronaries were normal.)',
    credit: 'Roy Choudhury A, Valakkada J, Ayappan A. Eur Heart J Case Rep 2025;9:ytaf125, fig. 1D (cropped)', ...CC_BY_4, source: pmc('PMC12012445'),
  },
  'ffr-significant': {
    src: '/cath-images/ffr-significant.jpg', width: 712, height: 448,
    alt: 'Pressure-wire console screen',
    caption: 'FFR 0.63: at maximal hyperemia the distal pressure (Pd, green) runs well below the aortic pressure (Pa, red) — Pd 62 ÷ Pa 98. Under 0.80, so the narrowing limits flow: treat it.',
    credit: `${BARUS}, fig. 3 top (cropped)`, ...CC_BY_4, source: pmc('PMC10325624'),
  },
  'ffr-not-significant': {
    src: '/cath-images/ffr-not-significant.jpg', width: 712, height: 471,
    alt: 'Pressure-wire console screen',
    caption: 'FFR 0.93: Pd 76 ÷ Pa 82 at maximal hyperemia — the narrowing does not limit flow. Above 0.80 it is treated with medicines, not a stent (FAME, DEFER).',
    credit: `${BARUS}, fig. 3 bottom (cropped)`, ...CC_BY_4, source: pmc('PMC10325624'),
  },
  'lad-dissection': {
    src: '/cath-images/lad-dissection.jpg', width: 661, height: 764,
    alt: 'Left coronary angiogram',
    caption: 'An LAD dissection after PCI (arrow): the false lumen fills late and faintly beside the brightly filled true lumen, and a thin lucent line — the intimal flap — runs between them.',
    credit: 'Fabrizio R, Mascitti L, Furci C. Radiol Case Rep 2023;19:35–8, fig. 1 (cropped)', ...CC_BY_4, source: pmc('PMC10598716'),
  },
  'radial-spasm': {
    src: '/cath-images/radial-spasm.jpg', width: 746, height: 691,
    alt: 'Forearm angiogram through a radial sheath',
    caption: 'Radial artery spasm: the artery is clamped tight around the sheath (red arrow). In this patient the sheath could not be pulled out until a nerve block relaxed the arm.',
    credit: 'Kovacs PL, Deutch Z, Castillo D. Cureus 2022;14:e33068, fig. 1 (cropped)', ...CC_BY_4, source: pmc('PMC9886372'),
  },
  'stent-thrombosis': {
    src: '/cath-images/stent-thrombosis.jpg', width: 750, height: 823,
    alt: 'Left coronary angiogram, RAO caudal view',
    caption: 'Stent thrombosis: the LAD is occluded at the stent (arrow). In this patient an allergic reaction to contrast set it off (Kounis syndrome).',
    credit: 'Okuda R, Utsumi S, Tanaka H, et al. Cureus 2024;16:e55514, fig. 2', ...CC_BY_4, source: pmc('PMC10915903'),
  },
  'lm-lao-caudal': {
    src: '/cath-images/lm-lao-caudal.jpg', width: 556, height: 522,
    alt: 'Left coronary angiogram, LAO caudal view',
    caption: 'LAO caudal ("spider") view: a severe narrowing right at the ostium of the left main (arrow). This view lays out the left main and its split into the LAD and circumflex.',
    credit: `${ALSARA}, fig. 3 (cropped)`, ...CC_BY_3, source: pmc('PMC3876687'),
  },
  'lm-rao-caudal': {
    src: '/cath-images/lm-rao-caudal.jpg', width: 559, height: 518,
    alt: 'Left coronary angiogram, RAO caudal view',
    caption: 'The same ostial left main narrowing (arrow) in the RAO caudal view. A left main lesion puts most of the left ventricle at risk.',
    credit: `${ALSARA}, fig. 2 (cropped)`, ...CC_BY_3, source: pmc('PMC3876687'),
  },
  'ivus-plaque-normal': {
    src: '/cath-images/ivus-plaque-normal.jpg', width: 798, height: 258,
    alt: 'Intravascular ultrasound cross-sections',
    caption: 'IVUS: left, an eccentric fibrous plaque (thicker on one side) at a left main narrowing; middle and right, normal vessel beyond it — a thin bright wall around a round lumen. The black circle in the centre is the catheter.',
    credit: 'Li B, Liu Y, Lou Z, et al. Medicine (Baltimore) 2022;101:e29116, fig. 2a–c (cropped)', ...CC_BY_4, source: pmc('PMC9276303'),
  },
  'oct-ivus-plaques': {
    src: '/cath-images/oct-ivus-plaques.jpg', width: 760, height: 376,
    alt: 'OCT and IVUS cross-sections side by side',
    caption: 'The same plaque types by OCT (top, orange) and IVUS (bottom, grey): A healthy wall, B calcium, C fibrous plaque, D lipid (asterisks mark the plaque). OCT is sharper near the lumen; IVUS sees deeper into the wall.',
    credit: `${BARUS}, fig. 2`, ...CC_BY_4, source: pmc('PMC10325624'),
  },
  'ivus-stent-expansion': {
    src: '/cath-images/ivus-stent-expansion.jpg', width: 793, height: 652,
    alt: 'IVUS measurements after stenting',
    caption: 'IVUS after stenting in four patients (rows A–D): the proximal reference, the narrowest stent area (MSA) and the distal reference, with the numbers on the right. An MSA well below the reference areas means an under-expanded stent — post-dilate it.',
    credit: 'Wu X, Wu MX, Huang HB, et al. Rev Cardiovasc Med 2024;25:57, fig. 5', ...CC_BY_4, source: pmc('PMC11263152'),
  },
  'tamponade-echo': {
    src: '/cath-images/tamponade-echo.jpg', width: 354, height: 265,
    alt: 'Echocardiogram, apical four-chamber view',
    caption: 'A large pericardial effusion all around the heart, squeezing the right atrium and right ventricle: tamponade. (In this patient a chest wound caused it.)',
    credit: 'Almehmadi F, Chandy M, Connelly KA, Edwards J. Case Rep Cardiol 2016;2016:2154748, fig. 2a (cropped)', ...CC_BY_4, source: pmc('PMC5019924'),
  },
  'impella-position': {
    src: '/cath-images/impella-position.jpg', width: 797, height: 275,
    alt: 'Chest X-ray and CT with an Impella pump',
    caption: 'An Impella in the right place: the outlet in the ascending aorta (solid arrow), the inlet over the left ventricle (dashed arrow), about 3.5 cm below the aortic valve. This one went in through the axillary artery.',
    credit: `${CHATURVEDI}, fig. 5`, ...CC_BY_4, source: pmc('PMC10350447'),
  },
  'iabp-low': {
    src: '/cath-images/iabp-low.jpg', width: 482, height: 684,
    alt: 'Chest X-ray with an intra-aortic balloon pump',
    caption: 'An IABP sitting too low: its tip marker (arrow) is below the carina. In this patient the balloon blocked the celiac and mesenteric arteries and the bowel became ischemic. The tip belongs 1–2 cm below the left subclavian artery, about level with the carina.',
    credit: `${CHATURVEDI}, fig. 3a (cropped)`, ...CC_BY_4, source: pmc('PMC10350447'),
  },
  'lad-no-reflow-pci': {
    src: '/cath-images/lad-no-reflow-pci.jpg', width: 799, height: 381,
    alt: 'Two left coronary angiogram frames during PCI',
    caption: 'PCI of the LAD in a patient with polycythemia vera: after thrombus aspiration the artery briefly filled (D, TIMI 3), then no-reflow developed (E) and the patient went into ventricular fibrillation. The authors suspected distal embolization after balloon pre-dilation.',
    credit: 'Oktaviono YH, Hutomo SA, Al-Farabi MJ. Medicine (Baltimore) 2020;99:e19288, fig. 4D–E (cropped)',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7478610/',
  },
  'lad-no-reflow-after-treatment': {
    src: '/cath-images/lad-no-reflow-after-treatment.jpg', width: 796, height: 728,
    alt: 'Left coronary angiogram',
    caption: 'Same LAD after the no-reflow was managed with resuscitation, repeated thrombus aspiration and intracoronary thrombolysis: flow improved but is still slow (TIMI 2).',
    credit: 'Oktaviono YH, Hutomo SA, Al-Farabi MJ. Medicine (Baltimore) 2020;99:e19288, fig. 5 (cropped)',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7478610/',
  },
  'contrast-anaphylaxis-flushing': {
    src: '/cath-images/contrast-anaphylaxis-flushing.jpg', width: 525, height: 508,
    alt: 'Clinical photograph of a patient\'s chest',
    caption: 'Diffuse flushing of the chest on arrival in the emergency room after iohexol contrast for a coronary CT scan (not a cath), in a man with suspected anaphylactic shock reported as contrast-induced Kounis syndrome. Flushing plus low blood pressure after contrast is an emergency.',
    credit: 'Liao B, Ding Z, Lin Z, et al. Cureus 2026;18:e105111, fig. 1 (cropped)',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC13081044/',
  },
  'iodixanol-delayed-skin-reaction': {
    src: '/cath-images/iodixanol-delayed-skin-reaction.jpg', width: 764, height: 988,
    alt: 'Clinical photograph of the skin',
    caption: 'A delayed reaction to iodixanol given for a CT scan (not a cath): a large red rash with dense, white, pinpoint sterile pustules (acute generalized exanthematous pustulosis). Itching began within 12 hours, so contrast reactions can appear after the patient leaves.',
    credit: 'Ma X, He C, Zeng X, et al. Medicine (Baltimore) 2025;104:e41301, fig. 1 (cropped)',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11789881/',
  },
  'high-puncture-iliac-extravasation': {
    src: '/cath-images/high-puncture-iliac-extravasation.jpg', width: 703, height: 703,
    alt: 'Digital subtraction angiogram of the external iliac and femoral arteries',
    caption: 'After PCI, a femoral puncture 2.5 cm above the femoral head, above the inguinal ligament, caused a rapidly growing hematoma; angiography shows contrast leaking from the external iliac artery. Punctures this high are hard to compress and a classic source of retroperitoneal bleeding.',
    credit: 'Schahab N, Kavsur R, Mahn T, et al. PLoS One 2020;15:e0230535, fig. 1A (cropped)',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7082010/',
  },
  'rca-air-embolism': {
    src: '/cath-images/rca-air-embolism.jpg', width: 633, height: 640,
    alt: 'Right coronary angiogram, LAO 45° view',
    caption: 'Right coronary angiogram (LAO 45°) taken while an atrial fibrillation ablation balloon was being inserted through its sheath: massive air bubbles (red arrowheads) block the RCA. Careful flushing and de-airing of catheters and sheaths prevents this.',
    credit: 'Sawada M, Nagashima K, Wakamatsu Y, et al. HeartRhythm Case Rep 2022;8:748-751, fig. 3A (cropped)',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9811017/',
  },
  'rca-spasm-occlusion-ic-ntg': {
    src: '/cath-images/rca-spasm-occlusion-ic-ntg.jpg', width: 796, height: 335,
    alt: 'Two right coronary angiogram frames, before and after intracoronary nitroglycerin',
    caption: 'The right coronary artery looks completely blocked in its proximal segment (C, arrow), then fills fully after intracoronary nitroglycerin (D); no significant fixed narrowing remained. The blockage was spasm, which is why nitroglycerin is given before judging a lesion.',
    credit: 'Wang Y, Si G, Li X, et al. Medicine (Baltimore) 2023;102:e32656, fig. 2C–D (cropped)',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9839286/',
  },
  'rca-catheter-spasm-ntg': {
    src: '/cath-images/rca-catheter-spasm-ntg.jpg', width: 800, height: 379,
    alt: 'Right coronary angiograms before and after intracoronary nitroglycerin',
    caption: 'Catheter-induced spasm: diffuse spasm of the right coronary artery (left, arrows) completely resolved after intracoronary nitroglycerin (right). Recognizing spasm avoids treating it as fixed disease with balloons or stents.',
    credit: 'Esenboga K, Baskovski E, Ozyuncu N, Tutar E. Cureus 2020;12:e7456, fig. 2',
    license: 'CC BY 3.0', licenseUrl: 'https://creativecommons.org/licenses/by/3.0/', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7188002/',
  },
  'hand-arteries-ia-ntg': {
    src: '/cath-images/hand-arteries-ia-ntg.jpg', width: 746, height: 445,
    alt: 'Digital subtraction angiograms of the wrist and hand, before and after intra-arterial nitroglycerin',
    caption: 'Delayed spasm after transradial cerebral angiography: before treatment (A) the palmar arch is spastic and the finger arteries are not seen; after intra-arterial nitroglycerin (B) the digital arteries fill well. The same drug relieves radial spasm in the cath lab.',
    credit: 'Mikami K, Kuramoto Y, Kuroyama T, Ueno Y. Cureus 2025;17:e86238, fig. 3 (cropped)',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12270547/',
  },
  'rca-no-reflow-adenosine': {
    src: '/cath-images/rca-no-reflow-adenosine.jpg', width: 731, height: 743,
    alt: 'Four right coronary angiogram frames during PCI, labeled a to d',
    caption: 'RCA stenting complicated by no-reflow: (a) stent deployment, (b) no-reflow after the stent, (c) 250 mcg adenosine injected into the distal RCA through a perforated balloon, (d) TIMI 3 flow restored. Distal delivery puts the drug where flow has stalled.',
    credit: 'Cetin M, Kiziltunc E, Güven Cetin Z, et al. Case Rep Cardiol 2016;2016:9596123, fig. 3 (cropped)',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4766333/',
  },
  'lm-thrombus-eptifibatide-before': {
    src: '/cath-images/lm-thrombus-eptifibatide-before.jpg', width: 736, height: 530,
    alt: 'Left coronary angiogram, LAO caudal view',
    caption: 'LAO caudal view at presentation: a thrombus partly blocks the left main trunk (arrow). Because it was ostial and floating, the team avoided aspiration and gave two intracoronary eptifibatide boluses through the guide, then an IV infusion for 48 hours.',
    credit: 'Alipour-Parsa S, Farahani E. J Tehran Heart Cent 2016;11:143-148, fig. 2B (cropped)',
    license: 'CC BY 3.0', licenseUrl: 'https://creativecommons.org/licenses/by/3.0/', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5148817/',
  },
  'lm-eptifibatide-after': {
    src: '/cath-images/lm-eptifibatide-after.jpg', width: 736, height: 532,
    alt: 'Left coronary angiogram, LAO caudal view, three days later',
    caption: 'Same view three days after eptifibatide treatment: the left main filling defect has disappeared and the coronary arteries look normal.',
    credit: 'Alipour-Parsa S, Farahani E. J Tehran Heart Cent 2016;11:143-148, fig. 3A (cropped)',
    license: 'CC BY 3.0', licenseUrl: 'https://creativecommons.org/licenses/by/3.0/', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5148817/',
  },
  'act-timeline-heparin-resistance': {
    src: '/cath-images/act-timeline-heparin-resistance.jpg', width: 752, height: 646,
    alt: 'Chart of activated clotting time values and heparin doses during a procedure',
    caption: 'ACT readings during STEMI PCI in a patient who had received andexanet alfa (a reversal drug for factor Xa blockers): despite repeated heparin boluses (arrowheads, x1000 units), the ACT rose slowly, showing heparin resistance. Recheck the ACT after each bolus.',
    credit: 'Sasaki S, Matsumoto D, Takeshige R, Iwata S. Eur Heart J Case Rep 2025;9:ytaf497, summary figure',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12548570/',
  },
  'atropine-ecg-before': {
    src: '/cath-images/atropine-ecg-before.jpg', width: 750, height: 474,
    alt: '12-lead electrocardiogram before treatment',
    caption: '12-lead ECG showing sinus bradycardia before treatment in a man with mad honey (grayanotoxin) poisoning, seen in the emergency room, not a cath lab. Compare with his ECG after IV atropine.',
    credit: 'Islamoglu MS, Dokur M, Talibli K, et al. Cureus 2021;13:e17165, fig. 3',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8367389/',
  },
  'atropine-ecg-after': {
    src: '/cath-images/atropine-ecg-after.jpg', width: 750, height: 470,
    alt: '12-lead electrocardiogram after intravenous atropine',
    caption: 'Same patient after IV atropine: sinus rhythm at a much faster rate. Atropine blocks vagal slowing of the heart; in the cath lab it is used for vagal bradycardia.',
    credit: 'Islamoglu MS, Dokur M, Talibli K, et al. Cureus 2021;13:e17165, fig. 4',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8367389/',
  },
  'fast-flush-square-wave-strip': {
    src: '/cath-images/fast-flush-square-wave-strip.jpg', width: 470, height: 344,
    alt: 'Paper strip of an ECG and an arterial pressure tracing during a fast-flush test',
    caption: 'A real fast-flush (square-wave) test on an arterial line: the flush makes a square wave, then oscillations. The amplitude ratio A2/A1 of 0.43 gives a damping coefficient of 0.28, and the spacing P gives a natural frequency of 12.5 Hz.',
    credit: 'Romagnoli S, Ricci Z, Quattrone D, et al. Crit Care 2014;18(6):644, fig. 2 (cropped)',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4279904/',
  },
  'pressure-transducer-kit-photo': {
    src: '/cath-images/pressure-transducer-kit-photo.jpg', width: 581, height: 328,
    alt: 'Photo of a disposable dual pressure transducer kit laid on a sheet',
    caption: 'A real disposable pressure transducer kit: two fluid-filled transducers share one arterial line so pressure can be read at the phlebostatic axis (red) and at ear level (white). Each is name-tagged with a roller clamp colored to match its monitor channel.',
    credit: 'Mikkonen E, Blixt J, Ercole A, et al. Neurocrit Care 2023;40(2):391-4, fig. 2',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10959835/',
  },
  'aortic-pressure-cath-printout': {
    src: '/cath-images/aortic-pressure-cath-printout.jpg', width: 750, height: 458,
    alt: 'Cath lab printout of three ECG leads above an aortic pressure tracing',
    caption: 'Aortic pressure recorded through the catheter during coronary angiography, with ECG above. Each beat rises sharply to the systolic peak (blue arrow, 168 mmHg) and falls through diastole to 64 mmHg (red arrow): a wide pulse pressure of 104 mmHg in this dialysis patient.',
    credit: 'Ng C, Ng Ping Vey A, Ng KT, Fan KS. Cureus 2025;17(11):e96545, fig. 3 (cropped)',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12604742/',
  },
  'pressure-damping-catheter-tip': {
    src: '/cath-images/pressure-damping-catheter-tip.jpg', width: 542, height: 232,
    alt: 'Monitor photo of catheter pressure and ECG traces beside a contrast injection image',
    caption: 'The catheter pressure damped (arrow, left) as the catheter was pulled from the ascending aorta into the innominate artery; contrast showed a tight spot at the catheter tip (arrow, right). Here the cause was a type A aortic dissection, not a coronary ostium.',
    credit: 'Huang CY, Hung YP, Lin TH, et al. Medicine (Baltimore) 2020;99(3):e18796, fig. 1B-C (cropped)',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7220141/',
  },
  'lvedp-tracings-lvad-on-off': {
    src: '/cath-images/lvedp-tracings-lvad-on-off.jpg', width: 740, height: 447,
    alt: 'Cath lab recordings of ECG leads with aortic and left ventricular pressure tracings',
    caption: 'Aortic (left) and LV (right) pressures with ECG; the circled end-diastolic part of the LV tracing is magnified. LVEDP was 44 mmHg with a pulsatile LV assist pump in place (top) and fell to 22 mmHg once it was removed (bottom).',
    credit: 'de Sá Marchi MF, Verhemel S, Nuis RJ, Van Mieghem NM. Eur Heart J Case Rep 2024;8(6):ytae291, fig. 5 (cropped)',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11210297/',
  },
  'rhc-ra-rv-pa-pcwp-tracings': {
    src: '/cath-images/rhc-ra-rv-pa-pcwp-tracings.jpg', width: 633, height: 363,
    alt: 'Right heart catheterization pressure tracings from four catheter positions',
    caption: 'Right heart cath tracings from one patient: right atrium (A, 19 mmHg), right ventricle (B, 61/9), pulmonary artery (C, 64/26) and wedge (D, 21 mmHg). All are elevated here, from an infiltrative cardiomyopathy, so they are not normal values.',
    credit: 'Lee DH, Kasprowicz T, Morales A, et al. Cureus 2021;13(9):e17914, fig. 2 (cropped)',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8515910/',
  },
  'rv-pressure-monitor-edp': {
    src: '/cath-images/rv-pressure-monitor-edp.jpg', width: 783, height: 650,
    alt: 'Monitor recording of ECG leads and a right ventricular pressure waveform',
    caption: 'Right ventricular pressure on a hemodynamic recording system, with ECG above. The system marks each systolic peak (S) and the end-diastolic pressure (EDP) just before the next upstroke.',
    credit: 'Katbamna B, Wu L, Rodriguez M, et al. Am Heart J Plus 2024;49:100488, fig. 6 (cropped)',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11699050/',
  },
  'thermodilution-curves-co-screen': {
    src: '/cath-images/thermodilution-curves-co-screen.jpg', width: 777, height: 435,
    alt: 'Thermodilution system screen with temperature curves and a results table',
    caption: 'Thermodilution curves from a cath-lab flow system: cold saline injected near the right atrium is sensed downstream. The IVC-to-pulmonary artery curve gave cardiac output 5.32 L/min (average 5.68), and the table shows cardiac index 3.25. Here it also measured a PFO shunt.',
    credit: 'Podolec M, Dostál J, Volf P, et al. J Clin Med 2026;15(4):1523, fig. 8',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12942256/',
  },
  'cardiac-output-monitor-ci-svri': {
    src: '/cath-images/cardiac-output-monitor-ci-svri.jpg', width: 750, height: 531,
    alt: 'Photo of a hemodynamic monitor screen with an arterial waveform and calculated values',
    caption: 'A cardiac output monitor (EV1000) during surgery showing the arterial waveform with cardiac index 2.0 L/min/m², SVRI 2854 dyne·s·m²/cm⁵, stroke volume variation 3%, dP/dt 0.91 and Ea 1.50.',
    credit: 'Pathak S, Bhardwaj M. Cureus 2025;17(8):e90824, fig. 2',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12376080/',
  },
  'constriction-lv-rv-dip-plateau': {
    src: '/cath-images/constriction-lv-rv-dip-plateau.jpg', width: 794, height: 386,
    alt: 'Simultaneous left and right ventricular pressure tracings before and after surgery',
    caption: 'Constrictive pericarditis: before surgery (A) the RV tracing shows a dip-and-plateau and LV and RV end-diastolic pressures are almost equal (20 and 22 mmHg). After pericardiectomy (B) the dip-and-plateau is gone and the pressures separate.',
    credit: 'Nakata Y, Shibahashi E, Iwanami Y, et al. Eur Heart J Case Rep 2025;9(8):ytaf369, fig. 3',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12342887/',
  },
  'constriction-square-root-equalization': {
    src: '/cath-images/constriction-square-root-equalization.jpg', width: 778, height: 359,
    alt: 'Simultaneous left and right ventricular pressure tracings on a hemodynamic printout',
    caption: 'Constrictive pericarditis on simultaneous LV and RV pressures: diastolic pressures are equal, the RV shows the "square root" sign (red arrow), and LV and RV systolic peaks move in opposite directions with breathing (discordance, green arrows).',
    credit: 'Bahrou M, Rafique S, Missula K, Salih M. Eur Heart J Case Rep 2026;10(3):ytag181, fig. 3',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC13034812/',
  },
  'va-ecmo-cxr-venous-cannula-ra': {
    src: '/cath-images/va-ecmo-cxr-venous-cannula-ra.jpg', width: 726, height: 709,
    alt: 'Frontal chest X-ray with labeled cannula and balloon pump marker',
    caption: 'Chest X-ray of a patient on VA-ECMO with an intra-aortic balloon pump for cardiogenic shock: the ECMO venous (drainage) cannula tip lies in the right atrium, and the balloon pump\'s proximal marker sits at the aortic knob.',
    credit: 'Fister M, Goslar T, Radsel P, Noc M. J Clin Med 2025;14(11):3687, fig. 1',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12156822/',
  },
  'aivr-telemetry-run': {
    src: '/cath-images/aivr-telemetry-run.jpg', width: 800, height: 343,
    alt: 'Telemetry monitor screen with two ECG leads, respiration and SpO2 waveforms',
    caption: 'Telemetry showing accelerated idioventricular rhythm (wide beats marked V, rate 101/min) just after ST elevation from coronary spasm resolved. AIVR is a known marker of reperfusion; here flow returned as the spasm eased, not after PCI.',
    credit: 'Assefa M, Yasar SJ, Abdullah O, et al. Cureus 2019;11(1):e3895, fig. 5 (cropped)',
    license: 'CC BY 3.0', licenseUrl: 'https://creativecommons.org/licenses/by/3.0/', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6433444/',
  },
  'reperfusion-pause-monitor-strip': {
    src: '/cath-images/reperfusion-pause-monitor-strip.jpg', width: 750, height: 563,
    alt: 'Printed monitor strip of ECG leads II and V2',
    caption: 'Monitor strip in an inferior STEMI with a right coronary culprit: shortly after clot-dissolving therapy the rhythm stops in a transient pause (arrow). The authors link such reperfusion pauses to a surge in vagal tone; reperfusion here was by thrombolysis, not PCI.',
    credit: 'Koutroulos MV, Chalikias G, Lampropoulos K, et al. Cureus 2026;18(7):e112379, fig. 2',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC13453318/',
  },
  'av-block-pressure-fall-telemetry': {
    src: '/cath-images/av-block-pressure-fall-telemetry.jpg', width: 763, height: 415,
    alt: 'ICU telemetry with three ECG leads, arterial pressure and pleth waveforms',
    caption: 'ICU telemetry showing sudden complete AV block with a marked fall in arterial pressure. Different setting: a patient with a thoracic epidural sitting up during a bowel movement; the authors discuss vagal reflexes such as the Bezold-Jarisch reflex.',
    credit: 'Patel HB, Ho J, Blakely AM, Chertow DS. Front Med (Lausanne) 2026;13:1829484, fig. 1 (cropped)',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC13216194/',
  },
  'vasovagal-tilt-map-hr-trend': {
    src: '/cath-images/vasovagal-tilt-map-hr-trend.jpg', width: 630, height: 300,
    alt: 'Graph of mean arterial pressure and heart rate over time during a tilt test',
    caption: 'Vasovagal syncope recorded during a head-up tilt test: after about 25 minutes upright, mean arterial pressure and heart rate fall together, and pressure recovers when the tilt ends. Recorded in a tilt lab, not during a procedure.',
    credit: 'Fortrat JO, Gharib C. Front Physiol 2016;7:113, fig. 1',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4812062/',
  },
};
