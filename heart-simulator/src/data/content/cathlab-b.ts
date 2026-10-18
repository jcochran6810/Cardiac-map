import type { CathLabItem } from '../../types/content';

/**
 * Cath lab catalog B: physiology and intravascular imaging, mechanical support and pacing,
 * pressures and hemodynamics, and team and safety.
 * Educational content only: typical adult values from current practice (ACC/AHA/SCAI, ESC);
 * local protocols and the operator's orders always rule.
 */
export const CATHLAB_B: CathLabItem[] = [
  // ─── Physiology & intravascular imaging ────────────────────────────────────

  {
    id: 'cl-ffr',
    name: 'Fractional flow reserve (FFR)',
    group: 'imaging-physiology',
    synonyms: ['FFR', 'Pressure wire', 'Hyperemic Pd/Pa'],
    summary:
      'A pressure wire measures the pressure beyond a narrowing (Pd) and divides it by the aortic pressure (Pa) while coronary flow is at its maximum. An FFR of 0.80 or less means the narrowing limits flow and is worth treating.',
    details: [
      'FFR = mean distal pressure ÷ mean aortic pressure at maximal hyperemia; 1.00 is normal, and 0.75 means maximal flow is only 75 % of what the vessel should carry.',
      'Set-up: heparin given, a guide without side holes, the wire introducer removed and the line flushed, so the guide shows a clean aortic pressure.',
      'Equalize first: with the sensor (about 3 cm from the wire tip) just outside the guide tip, the console is set so Pd/Pa reads 1.00.',
      'Give intracoronary nitroglycerin, cross the lesion and park the sensor well beyond it, ideally in the distal third of the vessel.',
      'Hyperemia: IV adenosine 140 mcg/kg/min through a large vein, or an intracoronary adenosine bolus; the FFR is the lowest stable Pd/Pa.',
      'For serial lesions or diffuse disease, a slow pullback under hyperemia shows where the pressure steps up and which segment matters most.',
      'Finish with a drift check: back at the guide tip Pd/Pa should read 1.00 ± 0.02; if not, re-equalize and measure again.',
    ],
    roles: {
      tech: 'Zeroes the aortic transducer, runs the pressure-wire console, equalizes at the guide tip and records the resting ratio, the hyperemic FFR and any pullback. Confirms the wire back before opening it and calls out drift, a damped guide pressure, AV block or hypotension.',
      rn: 'Screens for asthma, high-grade AV block, low blood pressure and recent caffeine, then runs the IV adenosine infusion through a large vein on order. Warns the patient about flushing, chest tightness and breathlessness, and watches the rhythm and blood pressure.',
      md: 'Chooses which lesion to test and how to cause hyperemia, places the sensor beyond the lesion and interprets the FFR and the pullback. Decides whether to stent or to defer.',
    },
    numbers: [
      'FFR ≤ 0.80: flow-limiting, revascularize; > 0.80: defer and treat medically (FAME; deferral proved safe long term in DEFER)',
      '0.75–0.80 is a gray zone: weigh symptoms, territory size and the pullback',
      'IV adenosine 140 mcg/kg/min (some labs go to 180) for at least 1–2 minutes to reach steady hyperemia',
      'IC adenosine bolus: commonly ≥ 100 mcg in the right coronary and ≥ 200 mcg in the left',
      'IC nitroglycerin 100–200 mcg before measuring',
      'Drift check: Pd/Pa 1.00 ± 0.02 (0.98–1.02) back at the guide tip',
    ],
    pearls: [
      'Drift: if Pd/Pa is not 1.00 ± 0.02 when the sensor returns to the guide tip, the reading cannot be trusted; re-equalize and remeasure.',
      'A guide seated deep in the ostium (damped pressure) or one with side holes blunts hyperemia and gives a falsely high FFR; disengage the guide slightly during IV adenosine.',
      'Inadequate hyperemia also gives a falsely high FFR: ask about caffeine (coffee, tea, cola, chocolate) in the past 12–24 hours, because it blocks adenosine.',
      'Whipping, sharp spikes on the Pd trace usually from the sensor touching the vessel wall, makes Pd unreliable; move the wire slightly and remeasure.',
    ],
    image: {
      keys: ['ffr-significant', 'ffr-not-significant', 'ffr-console'],
      want: 'A real pressure-wire console screen showing the aortic (Pa) and distal (Pd) tracings separating during adenosine hyperemia, with the FFR value displayed.',
    },
    sim: ['ffr', 'ffr-equalize'],
    related: ['ffr-ifr', 'adenosine', 'cl-drug-adenosine-ffr', 'cl-drug-ic-nitro', 'cl-ifr'],
  },

  {
    id: 'cl-ifr',
    name: 'Resting indices (iFR, RFR, Pd/Pa)',
    group: 'imaging-physiology',
    synonyms: ['iFR', 'Instantaneous wave-free ratio', 'RFR', 'Resting full-cycle ratio', 'Non-hyperemic pressure ratio (NHPR)', 'Resting Pd/Pa'],
    summary:
      'Resting pressure ratios use the same pressure wire as FFR but need no adenosine. An iFR or RFR of 0.89 or less is treated as significant.',
    details: [
      'iFR (instantaneous wave-free ratio) measures Pd/Pa only in the wave-free period of diastole, when resistance in the small vessels is naturally low and steady.',
      'RFR (resting full-cycle ratio) takes the lowest Pd/Pa anywhere in the heartbeat; dPR and DFR are similar ratios from other vendors with the same cut-off.',
      'Resting whole-cycle Pd/Pa is the simplest ratio and is recorded before every FFR, but its cut-off is less well validated.',
      'Set-up is the same as for FFR: heparin, IC nitroglycerin, equalize at the guide tip, cross, record several stable beats, then check drift at the end.',
      'An iFR pullback, often co-registered with the angiogram, maps how much pressure each segment loses, which helps with serial lesions and predicts the result of stenting.',
      'DEFINE-FLAIR and iFR-SWEDEHEART (2017, about 4,500 patients) found iFR-guided treatment non-inferior to FFR at 1 year, with shorter and more comfortable procedures.',
      'Angiography-derived FFR (such as QFR) estimates FFR from two angiographic views with no wire or drug; trial results are mixed, so the pressure wire stays the reference.',
    ],
    roles: {
      tech: 'Runs the pressure-wire console: equalizes at the guide tip, records the resting ratio over several stable beats and the pullback, and marks the pullback on the angiogram when co-registration is used. Checks drift at the end.',
      rn: 'Monitors the rhythm, blood pressure and comfort and documents the values. Prepares and gives IV adenosine on order if the operator decides to confirm the result with FFR.',
      md: 'Chooses a resting index or FFR, interprets the value and the pullback map, and decides whether to stent, which segment to treat, or to defer.',
    },
    numbers: [
      'iFR ≤ 0.89: significant; > 0.89: defer',
      'RFR, dPR and DFR: the same ≤ 0.89 cut-off',
      'Resting Pd/Pa: about ≤ 0.91–0.92 is often treated as abnormal (less validated)',
      'Hybrid approach: iFR < 0.86 treat, > 0.93 defer, 0.86–0.93 confirm with FFR',
      'Drift check: 1.00 ± 0.02 back at the guide tip',
    ],
    pearls: [
      'No adenosine means no flushing, chest tightness or AV block, so a resting index is useful when adenosine is contraindicated (severe bronchospasm, high-grade AV block).',
      'Pooled 5-year follow-up of the two trials found more deaths after iFR-guided treatment, so FFR remains the reference and borderline iFR values are often confirmed with it.',
      'Resting ratios need the same care as FFR: a clean equalization, no damped guide, the sensor well beyond the lesion and a drift check.',
      'Avoid any pressure ratio on a STEMI culprit lesion; severe aortic stenosis can also make the ratios less reliable.',
    ],
    image: {
      keys: ['rfr-pullback'],
      want: 'A real iFR pullback screen showing the pressure-ratio curve along the vessel, with the step-up at the lesion marked on the co-registered angiogram.',
    },
    sim: [],
    related: ['ffr-ifr', 'cl-ffr'],
  },

  {
    id: 'cl-ivus',
    name: 'Intravascular ultrasound (IVUS)',
    group: 'imaging-physiology',
    synonyms: ['IVUS', 'Intracoronary ultrasound'],
    summary:
      'A tiny ultrasound probe on a catheter is pulled back through the artery to show the lumen, the vessel wall and the plaque in cross-section. It is used to size stents, plan lesion preparation and check that a stent is fully expanded.',
    details: [
      'A monorail catheter rides over the 0.014 inch coronary wire and images at 20–60 MHz while a motor pulls it back at a set speed.',
      'Ultrasound passes through blood and deep into the wall, so it shows the external elastic membrane (EEM), the true vessel size; no contrast flush is needed.',
      'Key measurements: lumen area, EEM area, plaque burden (EEM area minus lumen area, divided by EEM area), minimal lumen area (MLA) and lesion length.',
      'Calcium is bright with an acoustic shadow behind it, so IVUS shows its arc and length but cannot measure its thickness.',
      'After stenting it checks expansion (minimal stent area, MSA), apposition, edge dissection and whether the stent edges land on plaque (geographic miss).',
      'ULTIMATE (2018) and RENOVATE-COMPLEX-PCI (2023) showed fewer target-vessel failures when PCI was guided by intravascular imaging rather than angiography alone.',
      'In the left main, an MLA below about 6 mm² suggests a significant narrowing; in smaller vessels MLA cut-offs are unreliable, so physiology is preferred.',
    ],
    roles: {
      tech: 'Preps and flushes the IVUS catheter, connects it to the motor drive and console, confirms the catheter back and runs the pullback. Bookmarks and measures lumen, EEM, plaque burden, calcium and stent area as the operator asks.',
      rn: 'Prepares IC nitroglycerin and extra heparin on order and keeps the ACT therapeutic. Watches for chest pain, ST change or bradycardia while the catheter is across a tight lesion.',
      md: 'Decides when imaging is needed and reads vessel size, plaque, calcium and lesion length to plan lesion preparation and stent size. Checks expansion, apposition and the edges before finishing.',
    },
    numbers: [
      'Frequency 20–60 MHz; resolution about 100–200 µm; penetration about 4–8 mm',
      'Expansion goal: MSA ≥ 90 % of the distal reference lumen area, or > 5.5 mm² outside the left main',
      'Landing zones: plaque burden < 50 % at the stent edges',
      'Left main MLA < about 6 mm² is significant (about 4.5–4.8 mm² in Asian studies)',
      'Left main stent goals (5-6-7-8 rule): about 5 mm² LCx ostium, 6 mm² LAD ostium, 7 mm² at the carina, 8 mm² in the left main body',
    ],
    pearls: [
      'Give IC nitroglycerin before the run so spasm does not make the vessel look smaller than it is.',
      'Flush mechanical (rotating) catheters with saline to clear air before use; air in the catheter gives a dim, poor-quality image.',
      'Superficial calcium of ≥ 270° over ≥ 5 mm warns that a stent may not expand: prepare the lesion first (scoring or cutting balloon, lithotripsy or atherectomy).',
      'Say whether a size came from the lumen or the EEM; the two give different stent diameters.',
    ],
    image: {
      keys: ['ivus-plaque-normal', 'oct-ivus-plaques'],
      want: 'A real IVUS cross-section of a coronary artery with the lumen and EEM borders traced, showing the plaque burden and a calcium arc with its acoustic shadow.',
    },
    sim: ['ivus'],
    related: ['ivus-oct', 'cl-stent-sizing', 'cl-balloon-nc'],
  },

  {
    id: 'cl-oct',
    name: 'Optical coherence tomography (OCT)',
    group: 'imaging-physiology',
    synonyms: ['OCT', 'Intracoronary OCT', 'OFDI'],
    summary:
      'OCT uses near-infrared light on a catheter to image the artery wall at near-microscopic resolution. Each run needs a contrast flush to clear the blood, and gives very sharp pictures of the lumen, calcium, thrombus and stent struts.',
    details: [
      'Near-infrared light (about 1,300 nm) gives about 10–20 µm resolution, roughly ten times sharper than IVUS, but it sees only 1–2 mm into the wall.',
      'Blood scatters light, so contrast is flushed through the guide (by injector or by hand) for a few seconds while a fast motorized pullback images 50–75 mm.',
      'It measures lumen and stent areas very accurately and shows calcium with clear edges, so its arc, thickness and length can all be measured.',
      'It shows lipid and fibrous plaque, thin-cap fibroatheroma, red and white thrombus, plaque rupture or erosion, dissections and every stent strut.',
      'Poor depth and the need to clear blood make it a poor choice for the ostial left main, very large vessels and patients who need minimal contrast.',
      'ILUMIEN IV (2023) gave larger stent areas and fewer stent thromboses than angiography guidance but no significant drop in target-vessel failure.',
      'OCTOBER (2023) found fewer major adverse cardiac events with OCT-guided PCI of complex bifurcation lesions than with angiography guidance.',
    ],
    roles: {
      tech: 'Purges the catheter with contrast, connects it to the console, sets the pullback length and the flush, and starts the run when the lumen clears. Measures lumen and stent areas, calcium and apposition for the operator and adds the flush to the contrast tally.',
      rn: 'Tracks total contrast against the patient’s kidney function and keeps IV hydration running as ordered. Watches for chest pain, ST change or bradycardia during each flush.',
      md: 'Chooses OCT when fine detail matters (calcium thickness, thrombus, dissection, stent struts), interprets the pullback and decides on lesion preparation, stent size and post-dilation.',
    },
    numbers: [
      'Wavelength about 1,300 nm; resolution about 10–20 µm; penetration about 1–2 mm (IVUS about 4–8 mm)',
      'Flush: about 10–20 mL of contrast per run at about 3–4 mL/s',
      'Expansion goal: MSA > 4.5 mm² outside the left main, or ≥ 90 % of the nearest reference lumen (ILUMIEN IV)',
      'Malapposition worth correcting: a gap > 0.4 mm over more than 1 mm of length',
      'OCT calcium score: arc > 180° (2 points), thickness > 0.5 mm (1), length > 5 mm (1); 4 points = high risk of underexpansion',
      'Edge dissection usually treated if ≥ 60° of the circumference or ≥ 3 mm long',
    ],
    pearls: [
      'Purge the OCT catheter with 100 % contrast, not saline, and check the image is clear before the run; blood in the lumen means a poor flush.',
      'Engage the guide coaxially so the flush fills the artery; most systems start the pullback automatically when the lumen clears.',
      'Add every OCT run to the contrast tally (roughly 10–20 mL each), which matters in kidney disease.',
      'Red thrombus and lipid block the light and hide the outer wall; use IVUS when the true vessel size (EEM) is needed.',
    ],
    image: {
      keys: ['oct-tcfa', 'oct-ivus-plaques'],
      want: 'A real OCT cross-section showing a stent with struts well apposed to the wall, or a calcified plaque with its arc and thickness measured.',
    },
    sim: ['oct'],
    related: ['ivus-oct', 'cl-ivus'],
  },

  {
    id: 'cl-stent-sizing',
    name: 'Sizing a stent',
    group: 'imaging-physiology',
    synonyms: ['Stent sizing', 'Stent diameter and length', 'Landing zones'],
    summary:
      'Choosing a stent’s diameter and length so it opens fully against healthy vessel at both ends. The diameter comes from the reference vessel; the length runs from one healthy landing zone to the other.',
    details: [
      'By angiography, measure the normal-looking reference segments beside the lesion with quantitative coronary angiography (QCA), calibrated on the guide catheter or the system isocenter.',
      'The guide is a ruler: a 6 Fr catheter is about 2.0 mm wide, so a vessel about one and a half times as wide is about 3.0 mm.',
      'By IVUS or OCT, size to the distal reference: the lumen diameter rounded up, or the EEM (outer vessel) diameter rounded down, to the nearest stent size.',
      'Length runs from landing zone to landing zone, the nearest segments with plaque burden under 50 %, covering the whole lesion with a small margin.',
      'Avoid geographic miss: stent edges on plaque, or balloon injury outside the stent, raise the risk of edge dissection and restenosis.',
      'When two stents are needed, overlap them by about 2–3 mm with no gap, usually placing the distal stent first.',
      'Post-dilate with a non-compliant balloon sized 1:1 to the stent or the reference, at high pressure and inside the stent edges.',
    ],
    roles: {
      tech: 'Calibrates QCA or measures on the IVUS or OCT console when asked, reads the stent diameter and length back before opening it, and has matching non-compliant balloons ready.',
      rn: 'Records each stent and balloon size, lot number and inflation pressure in the implant log. Watches for chest pain, ST change or arrhythmia during inflations.',
      md: 'Chooses the reference segments and landing zones, picks the stent diameter and length, plans overlap and post-dilation, and checks the final result, ideally with imaging.',
    },
    numbers: [
      'French size ÷ 3 = millimeters: 6 Fr ≈ 2.0 mm, 7 Fr ≈ 2.3 mm, 8 Fr ≈ 2.7 mm',
      'Stent-to-artery ratio about 1.0–1.1 : 1',
      'Diameters about 2.0–4.0 mm in 0.25–0.5 mm steps (to 4.5–5.0 mm for the left main); lengths about 8–38 mm, some to 48 mm',
      'Overlap 2–3 mm; landing zones with plaque burden < 50 %',
      'Post-dilation: NC balloon 1:1, high pressure, never above its rated burst pressure',
    ],
    pearls: [
      'Angiography tends to undersize: diffuse disease and positive remodeling hide the true vessel size, so imaging often picks a larger stent.',
      'Give IC nitroglycerin before measuring, or spasm makes the reference look small.',
      'Vessels taper, so size to the distal reference and expand the proximal part with a short, larger NC balloon (proximal optimization at bifurcations).',
      'Check the stent’s maximum expansion diameter on its label before post-dilating with a much larger balloon.',
    ],
    image: {
      keys: ['ivus-stent-expansion'],
      want: 'A real QCA or IVUS measurement screen showing the proximal and distal reference diameters and the lesion length used to choose a stent.',
    },
    sim: [],
    related: ['cl-ivus', 'cl-oct', 'cl-stent-des', 'cl-balloon-nc'],
  },

  // ─── Mechanical support & pacing ───────────────────────────────────────────

  {
    id: 'cl-impella',
    name: 'Impella (micro-axial flow pump)',
    group: 'support',
    synonyms: ['Impella CP', 'Micro-axial flow pump', 'Percutaneous LV assist device', 'pVAD'],
    summary:
      'A catheter-mounted pump that sits across the aortic valve and pulls blood from the left ventricle into the aorta. It unloads the ventricle and adds forward flow in cardiogenic shock and high-risk PCI.',
    details: [
      'The inlet sits in the left ventricle about 3.5 cm below the aortic valve and the outlet in the ascending aorta; a tiny motor spins to push blood forward.',
      'Impella CP goes in through a 14 Fr femoral arterial sheath over a placement wire and gives up to about 3.5–4 L/min; larger pumps go in surgically.',
      'Power is set in P-levels (up to P-9); the actual flow depends on the P-level, the patient’s filling (preload) and the pressure difference across the valve.',
      'A purge solution runs through the motor to keep blood out: dextrose with heparin, or a bicarbonate-based purge when heparin must be avoided.',
      'Position is checked by fluoroscopy, by echo and on the console: the placement signal should look aortic and the motor current pulsatile.',
      'DanGer Shock (2024): in STEMI with cardiogenic shock, Impella CP lowered 180-day death (45.8 % vs 58.5 %) but caused more bleeding, limb ischemia and kidney replacement therapy.',
      'Contraindications: LV thrombus, a mechanical aortic valve, severe aortic regurgitation, severe peripheral artery disease and aortic dissection.',
    ],
    roles: {
      tech: 'Sets up and primes the console and purge, preps the pump and the 14 Fr sheath and confirms sizes back. Watches the placement signal, motor current and flow and calls out alarms or position changes.',
      rn: 'Gives heparin and pressors on order and keeps the ACT in range. Checks the leg’s pulses, color and sensation and the access site, watches urine color and output, and documents P-level, flow and alarms.',
      md: 'Decides who needs support and rules out LV thrombus, a mechanical aortic valve, severe aortic regurgitation and poor iliofemoral access. Places the pump, sets the P-level and plans weaning.',
    },
    numbers: [
      'Impella CP: 14 Fr sheath, up to about 3.5–4 L/min',
      'Inlet about 3.5 cm below the aortic valve annulus',
      'ACT about 250 s for insertion; lower targets during support, per protocol',
      'Purge: dextrose with heparin (commonly 25–50 units/mL), or 25 mEq/L sodium bicarbonate in D5W',
      'DanGer Shock: 180-day death 45.8 % vs 58.5 % (HR 0.74); kidney replacement therapy 41.9 % vs 26.7 %',
    ],
    pearls: [
      'Suction alarms usually mean low filling (bleeding, hypovolemia, RV failure) or the inlet against the wall: check position by echo and volume before the P-level is lowered.',
      'A ventricular-looking placement signal or a flat motor current means the pump has moved: call it out at once so the position is rechecked before repositioning.',
      'Check the leg below the 14 Fr sheath often (Doppler pulses, color, warmth); limb ischemia may need a distal perfusion catheter.',
      'Red or tea-colored urine and a rising LDH suggest hemolysis, often from poor position or suction.',
    ],
    image: {
      keys: ['impella-position'],
      want: 'A real fluoroscopy frame of an Impella CP across the aortic valve, with the inlet in the left ventricle and the outlet in the ascending aorta.',
    },
    sim: ['impella'],
    related: ['impella-placement', 'cardiogenic-shock', 'cl-femoral-access', 'cl-iabp'],
  },

  {
    id: 'cl-iabp',
    name: 'Intra-aortic balloon pump (IABP)',
    group: 'support',
    synonyms: ['IABP', 'Balloon pump', 'Counterpulsation'],
    summary:
      'A long balloon in the descending aorta inflates in diastole and deflates just before systole. It raises coronary perfusion pressure and lowers the work of the left ventricle (counterpulsation).',
    details: [
      'A 7–8 Fr catheter carries a 25–50 mL helium balloon, sized to the patient’s height, through the femoral artery into the descending thoracic aorta.',
      'The tip sits 1–2 cm below the left subclavian artery, about level with the carina on a chest film, and the balloon must end above the renal arteries.',
      'Inflation at the dicrotic notch (aortic valve closure) pushes blood back toward the coronary arteries: diastolic augmentation.',
      'Deflation just before the aortic valve opens drops the aortic end-diastolic pressure, so the LV ejects against less resistance: afterload reduction.',
      'The pump triggers from the ECG (R wave) or the arterial pressure, at 1:1 for full support, or 1:2 and 1:3 while weaning or checking timing.',
      'IABP-SHOCK II (2012) found no mortality benefit from routine IABP in MI with cardiogenic shock, so it is no longer routine there.',
      'It is still used for mechanical complications of MI, such as acute severe mitral regurgitation or a ventricular septal rupture, as a bridge to surgery.',
    ],
    roles: {
      tech: 'Sets up the console, preps and hands the catheter with the right balloon size, and connects the ECG and pressure triggers. Checks the timing on the arterial waveform and calls out timing errors or alarms.',
      rn: 'Checks the left radial and leg pulses, urine output and the access site, keeps the leg straight and gives anticoagulation on order. Documents augmentation, ratio and alarms.',
      md: 'Decides on an IABP and rules out aortic regurgitation, dissection and severe peripheral artery disease. Places it under fluoroscopy and orders the ratio, anticoagulation and weaning.',
    },
    numbers: [
      'Catheter 7–8 Fr; balloon 25–50 mL by height (40 mL for about 163–183 cm)',
      'Tip 1–2 cm below the left subclavian artery (carina level on chest X-ray)',
      'Good timing: augmented diastolic pressure above the unassisted systolic; assisted end-diastolic about 5–15 mmHg below the unassisted',
      'Cardiac output rises only about 0.5–1 L/min',
      'IABP-SHOCK II: 30-day death 39.7 % vs 41.3 % (no difference)',
    ],
    pearls: [
      'Early inflation (before the notch) and late deflation (after the valve opens) are the harmful errors: both make the LV work against an inflated balloon.',
      'Late inflation and early deflation waste the benefit (less augmentation or unloading) but are less dangerous.',
      'Contraindicated in moderate to severe aortic regurgitation, aortic dissection, abdominal aortic aneurysm and severe peripheral artery disease.',
      'A weaker left radial pulse can mean the balloon sits too high, and a fall in urine output that it sits too low; blood in the gas line means a rupture: stop pumping and call it out.',
    ],
    image: {
      keys: ['iabp-low'],
      want: 'A real arterial pressure tracing during 1:2 IABP support showing inflation at the dicrotic notch, diastolic augmentation and the lower assisted end-diastolic pressure.',
    },
    sim: ['iabp'],
    related: ['iabp-placement', 'cardiogenic-shock', 'cl-impella'],
  },

  {
    id: 'cl-temp-wire',
    name: 'Temporary transvenous pacing wire',
    group: 'support',
    synonyms: ['Temporary pacemaker', 'Transvenous pacing', 'Temp wire', 'TVP'],
    summary:
      'A pacing catheter passed through a vein into the right ventricle and connected to an external pulse generator. It keeps the heart rate up in high-grade AV block or severe bradycardia until the rhythm recovers or a permanent device is placed.',
    details: [
      'A 5–6 Fr bipolar pacing catheter, often balloon-tipped so it floats with blood flow, goes through the femoral or internal jugular vein to the RV apex.',
      'The distal electrode connects to the negative (−) terminal of the generator and the proximal electrode to the positive (+) terminal.',
      'Capture threshold: lower the output until capture is lost; a good position captures at less than 1 mA.',
      'Set the output at 2–3 times the threshold (or start at about 5 mA), the rate at 60–80 per minute, in demand (VVI) mode.',
      'Set the sensitivity so the pacer sees the patient’s own beats; if it undersenses, it can pace on a T wave and trigger VT or VF.',
      'In the cath lab it is used for inferior STEMI with complete heart block or bradycardia not responding to atropine, and as standby in some atherectomy cases.',
      'Risks: RV perforation and tamponade, loss of capture when the wire moves, VT from the wire irritating the ventricle, bleeding, infection and thrombosis.',
    ],
    roles: {
      tech: 'Preps the catheter and the generator (fresh battery, cables, rate 70, output 5 mA), confirms the size back and connects distal to negative and proximal to positive. Tests threshold and sensing on the operator’s word and calls out capture.',
      rn: 'Gives atropine or other drugs on order and keeps transcutaneous pads on as a backup. Checks capture, pulse, blood pressure and the insertion site, and documents rate, output, threshold and mode.',
      md: 'Decides pacing is needed, places the wire at the RV apex under fluoroscopy and sets the output and rate. Manages complications such as perforation or loss of capture.',
    },
    numbers: [
      'Catheter 5–6 Fr, bipolar, often balloon-tipped',
      'Capture threshold < 1 mA',
      'Output at least 2–3 × threshold (often 5 mA until the threshold is known)',
      'Rate 60–80 per minute, demand (VVI) mode',
      'Distal electrode to negative (−), proximal to positive (+)',
    ],
    pearls: [
      'Paced beats from the RV should look like left bundle branch block; a right bundle pattern raises concern that the wire is in the coronary sinus or the left ventricle.',
      'New chest pain, a rising threshold, loss of capture or a pericardial rub suggests perforation: check for an effusion on echo.',
      'Spikes without a QRS mean failure to capture; spikes landing in the T wave mean failure to sense. Check connections, battery and settings at every hand-off.',
      'Keep transcutaneous pads on while the wire goes in and until it is secure.',
    ],
    image: {
      keys: ['temp-pacing-wire-rv-apex'],
      want: 'A real fluoroscopy frame of a temporary pacing wire from the femoral vein with its tip at the RV apex, beside an ECG strip showing paced capture.',
    },
    sim: ['temp-wire'],
    related: ['temporary-pacing', 'third-degree-av-block', 'cl-venous-access', 'cl-comp-bezold'],
  },

  {
    id: 'cl-ecmo',
    name: 'VA-ECMO',
    group: 'support',
    synonyms: ['Veno-arterial ECMO', 'ECLS', 'Extracorporeal life support', 'ECPR'],
    summary:
      'A pump drains venous blood, adds oxygen and removes CO₂ in an oxygenator, and returns it to the arterial system. It gives full heart-and-lung support in refractory cardiogenic shock or cardiac arrest.',
    details: [
      'Peripheral VA-ECMO drains blood through a femoral vein cannula with its tip near the right atrium and returns it through a femoral artery cannula up the aorta.',
      'A centrifugal pump and a membrane oxygenator give full support (about 3–5 L/min); the sweep gas sets CO₂ removal and its oxygen fraction sets oxygenation.',
      'It is used for refractory cardiogenic shock (SCAI stage D–E), refractory VT or VF, and in selected patients during CPR (ECPR).',
      'Blood pumped up the aorta raises LV afterload: the LV may stop opening the aortic valve, distend and cause pulmonary edema or LV thrombus.',
      'The LV can be vented with an Impella (“ECPELLA”), an IABP or an atrial septostomy.',
      'A small distal perfusion cannula into the superficial femoral artery keeps blood flowing to the leg below the arterial cannula.',
      'ECLS-SHOCK (2023): routine early VA-ECMO in MI with cardiogenic shock did not lower 30-day death and caused more bleeding and vascular complications.',
    ],
    roles: {
      tech: 'Opens and hands the cannulas, wires and dilators and confirms sizes back, records hemodynamics and helps the perfusionist or ECMO specialist with the circuit. Calls out a narrowing pulse pressure or falling flow.',
      rn: 'Gives heparin and pressors on order and checks both legs and the cannula sites. Monitors right radial oxygen saturation, urine output and neurologic status, and documents.',
      md: 'Decides on VA-ECMO or ECPR with the shock team and places the cannulas. Chooses a venting strategy and a distal perfusion cannula, and sets flow and anticoagulation targets.',
    },
    numbers: [
      'Drainage (venous) cannula about 21–25 Fr; return (arterial) cannula about 15–19 Fr',
      'Distal perfusion cannula about 6–8 Fr',
      'Full support about 3–5 L/min of blood flow in an adult',
      'Heparin to an aPTT, anti-Xa or ACT target, per protocol',
      'ECLS-SHOCK: 30-day death 47.8 % vs 49.0 %; moderate or severe bleeding 23.4 % vs 9.6 %',
    ],
    pearls: [
      'Watch the arterial pulse pressure: if it narrows toward zero, the LV is not ejecting and may need venting.',
      'Check oxygen saturation from the right radial artery: if the lungs are poor, the heart and brain may get poorly oxygenated blood from the LV (north-south or “harlequin” syndrome).',
      'Check the cannulated leg often (Doppler pulses, color, warmth) and confirm the distal perfusion cannula is flowing.',
      'Chattering lines or falling flow at the same pump speed mean low preload or a cannula problem: think volume, bleeding, tamponade and cannula position.',
    ],
    image: {
      keys: ['va-ecmo-cxr-venous-cannula-ra'],
      want: 'A real photo of a VA-ECMO circuit (centrifugal pump, oxygenator and femoral cannulas), or a fluoroscopy frame showing the venous cannula tip at the right atrium.',
    },
    sim: [],
    related: ['ecmo-cannulation', 'cardiogenic-shock', 'cl-impella'],
  },

  // ─── Pressures & hemodynamics ──────────────────────────────────────────────

  {
    id: 'cl-transducer',
    name: 'Zeroing and leveling transducers',
    group: 'hemodynamics',
    synonyms: ['Zeroing', 'Leveling', 'Phlebostatic axis', 'Square-wave test', 'Fast-flush test'],
    summary:
      'Every fluid-filled pressure line must be leveled at the heart and zeroed to air before its numbers can be trusted. Leveling sets the height reference; zeroing removes atmospheric pressure.',
    details: [
      'Level the transducer’s air-fluid interface (the zeroing stopcock) at the phlebostatic axis: the 4th intercostal space at mid-chest, often taken as the mid-axillary line.',
      'To zero, turn the stopcock off to the patient and open to air, press zero on the recording system, then close it to air and open it to the patient.',
      'Re-level whenever the table height or the patient’s position changes, unless the transducer is mounted on the table and moves with it.',
      'Every centimeter the transducer sits below the heart adds about 0.74 mmHg to the reading; above the heart lowers it by the same amount.',
      'A continuous flush (pressure bag at 300 mmHg) keeps lines open, and every line must be free of air bubbles and clots.',
      'Fast-flush (square-wave) test: pull the flush and let go; about 1.5–2 oscillations before the trace returns is optimal.',
      'Use short, stiff tubing with few stopcocks: bubbles, clots, kinks, and long or soft tubing all distort the waveform.',
    ],
    roles: {
      tech: 'Fills and de-airs the manifold and transducer lines, levels them at the phlebostatic axis and zeroes each channel on the recording system. Runs the square-wave test and calls out damping or ringing.',
      rn: 'Keeps the patient flat and still for measurements and the flush bag pressurized. Says when the table or the patient moves so the lines can be re-leveled.',
      md: 'Checks the lines were zeroed and leveled before trusting a number, and asks for a re-zero when values don’t fit the clinical picture. Interprets the pressures.',
    },
    numbers: [
      'Phlebostatic axis: 4th intercostal space, mid-chest (half the front-to-back chest depth)',
      '1 cm off level ≈ 0.74 mmHg; 10 cm ≈ 7.4 mmHg',
      'Flush bag at 300 mmHg (about 3 mL/h through a continuous flush device)',
      'Square wave: about 1.5–2 oscillations = optimal; none = overdamped; many = underdamped (ringing)',
    ],
    pearls: [
      'A transducer too low reads too high, and too high reads too low: a common cause of a falsely high RA pressure or PCWP.',
      'Zeroing does not fix a leveling error: zeroing corrects for air pressure, leveling for height.',
      'An overdamped trace (rounded, no notch) under-reads the systolic and over-reads the diastolic; a ringing, underdamped trace over-reads the systolic. The mean changes least.',
      'Zero and level before the first measurement, after any table or patient move, and whenever a number doesn’t fit the patient.',
    ],
    image: {
      keys: ['fast-flush-square-wave-strip', 'pressure-transducer-kit-photo'],
      want: 'A real photo of a pressure transducer mounted at the phlebostatic axis with its stopcock open to air for zeroing, or a monitor showing an optimal square-wave test.',
    },
    sim: ['transducer'],
    related: ['cl-damped', 'cl-rhc'],
  },

  {
    id: 'cl-aortic-waveform',
    name: 'The arterial (aortic) waveform',
    group: 'hemodynamics',
    synonyms: ['Aortic pressure', 'Arterial waveform', 'Ao pressure', 'Dicrotic notch'],
    summary:
      'The pressure tracing from the guide or arterial sheath shows each heartbeat: a sharp upstroke, a systolic peak, the dicrotic notch when the aortic valve closes, and a slow fall through diastole. Its shape tells you about the valve, the ventricle and the catheter.',
    details: [
      'Upstroke: pressure rises steeply once the LV opens the aortic valve; a brisk upstroke means good contractility and an open valve.',
      'After the systolic peak, the dicrotic notch (incisura) marks aortic valve closure and the end of systole.',
      'Diastolic runoff: pressure falls slowly as blood flows out to the body; the lowest point before the next beat is the diastolic pressure.',
      'Mean arterial pressure (MAP) is about the diastolic plus one third of the pulse pressure; the recording system calculates it from the whole curve.',
      'Farther from the heart (a femoral sheath), the systolic peak is higher and narrower and the notch smaller and later: peripheral amplification.',
      'Aortic stenosis gives a slow, late, small upstroke (pulsus parvus et tardus); aortic regurgitation gives a wide pulse pressure with a low diastolic.',
      'Pulsus alternans (strong and weak beats alternating) signals severe LV dysfunction; pulsus paradoxus (systolic falls > 10 mmHg on inspiration) suggests tamponade.',
    ],
    roles: {
      tech: 'Records and labels the aortic pressure continuously and measures systolic, diastolic and mean pressures and any pullback gradient. Calls out a damped, falling or abnormal waveform at once.',
      rn: 'Correlates the pressure with the patient (mental status, pain, skin, urine output), gives fluids or pressors on order when it falls, and documents trends.',
      md: 'Interprets the waveform shape and the gradients, tells catheter artifact from true hypotension, and treats the cause.',
    },
    numbers: [
      'Normal central aortic pressure about 100–140 / 60–90 mmHg',
      'MAP ≈ diastolic + (systolic − diastolic) ÷ 3; MAP ≥ 65 mmHg is the usual minimum in shock',
      'Pulse pressure = systolic − diastolic, normally about 30–50 mmHg',
      'Pulsus paradoxus: inspiratory fall in systolic pressure > 10 mmHg',
      'Severe aortic stenosis: mean LV–aortic gradient ≥ 40 mmHg (with normal flow)',
    ],
    pearls: [
      'A rounded wave that loses its notch after the catheter engages suggests damping, not true hypotension: check the catheter and the line before treating the number.',
      'A narrow pulse pressure (less than about 25 % of the systolic) suggests a low stroke volume, as in cardiogenic shock or tamponade.',
      'The coronary arteries fill mainly in diastole, so a low diastolic pressure (aortic regurgitation, vasodilation) lowers coronary perfusion.',
      'Compare with a cuff pressure or a second arterial line when the numbers don’t fit the patient.',
    ],
    image: {
      keys: ['aortic-pressure-cath-printout'],
      want: 'A real aortic pressure tracing from a cath lab recording system with the upstroke, systolic peak, dicrotic notch and diastolic runoff labeled.',
    },
    sim: [],
    related: ['cl-damped', 'cl-transducer', 'aortic-stenosis'],
  },

  {
    id: 'cl-damped',
    name: 'Damped and ventricularized pressures',
    group: 'hemodynamics',
    synonyms: ['Damping', 'Pressure damping', 'Ventricularization', 'Wedged catheter'],
    summary:
      'When a catheter tip blocks a coronary ostium, the pressure from it falls or changes shape. It warns that blood is not flowing down the artery: call it out and do not inject.',
    details: [
      'Damped: the tracing loses its dicrotic notch and looks rounded and smaller, with the systolic (and usually the diastolic) pressure below the true aortic pressure.',
      'Ventricularized: the systolic pressure stays close to aortic but the diastolic pressure falls, so the trace looks like a ventricular pressure.',
      'Causes at the tip: an ostial stenosis, a catheter seated too deep, a small or spasming vessel (often the RCA), the conus branch, or the tip against the wall.',
      'Causes in the line: a kinked catheter, air or clot in the catheter or tubing, or a half-turned stopcock.',
      'Danger: injecting into a wedged catheter can dissect the ostium, push air or clot down the artery, or cause ischemia and VF.',
      'Action: call it out, do not inject, and let the operator back the catheter out until the aortic waveform returns; then aspirate and flush.',
      'If it damps every time the catheter engages, suspect an ostial lesion: the operator may use a smaller catheter, one with side holes, or a non-selective injection.',
    ],
    roles: {
      tech: 'Watches the catheter pressure at every engagement and before every injection, and calls out “damped” or “ventricularized” at once in closed loop. Does not inject until the operator clears it.',
      rn: 'Watches the patient and the ECG for chest pain, ST change, bradycardia or VF while the catheter is engaged. Keeps the defibrillator ready and gives drugs on order.',
      md: 'Disengages and repositions the catheter and decides whether an ostial lesion is the cause. Chooses a different catheter or approach before injecting again.',
    },
    pearls: [
      'Look at the pressure before every injection: it is the last chance to catch a wedged catheter.',
      'Never inject into a damped RCA: a forceful injection into a wedged catheter or the conus branch can cause VF.',
      'Re-zeroing does not fix damping: check the catheter tip first, then air, clot, kinks and stopcocks.',
      'A deep-seated guide during FFR or imaging also damps the pressure, causing ischemia and a falsely high FFR.',
    ],
    image: {
      keys: ['pressure-damping-catheter-tip'],
      want: 'A real pressure tracing showing a normal aortic waveform changing to a damped and then a ventricularized pattern as a catheter engages a tight ostial stenosis.',
    },
    sim: ['reposition', 'callout'],
    related: ['cl-transducer', 'cl-aortic-waveform', 'cl-guide-ebu'],
  },

  {
    id: 'cl-lvedp',
    name: 'LVEDP',
    group: 'hemodynamics',
    synonyms: ['Left ventricular end-diastolic pressure', 'LV end-diastolic pressure'],
    summary:
      'The pressure in the left ventricle at the end of filling, just before it contracts. It shows how full and how stiff the ventricle is and helps guide fluids and contrast.',
    details: [
      'Measured through a pigtail (or end-hole) catheter in the LV, whose trace has a high systolic peak, a low early diastolic pressure and a slow rise as it fills.',
      'The end-diastolic point comes after the a wave (atrial kick) and just before the systolic upstroke, at the R wave of the ECG.',
      'Normal LVEDP is about 12 mmHg or less; above about 18 mmHg means filling pressures are clearly high.',
      'High LVEDP: heart failure, ischemia (a stiff ventricle), volume overload, aortic stenosis or LV hypertrophy; low: dehydration from NPO, or bleeding.',
      'Measure it before the LV gram, because contrast raises it, and at end-expiration with the patient breathing quietly.',
      'It guides hydration to protect the kidneys: in POSEIDON (2014), LVEDP-guided IV fluids cut contrast kidney injury compared with a standard fluid rate.',
      'If the LVEDP is very high, the operator may skip the LV gram and limit contrast and fluids to avoid pulmonary edema.',
    ],
    roles: {
      tech: 'Records the LV pressure on a zeroed, leveled channel and marks the end-diastolic point at the R wave at end-expiration. Reports the LV systolic pressure and LVEDP before the LV gram.',
      rn: 'Sets the IV fluid rate on order from the LVEDP (for example a POSEIDON-style protocol). Watches for ectopy, breathlessness and falling oxygen saturation, and documents.',
      md: 'Crosses the aortic valve with the pigtail and interprets the LVEDP with the clinical picture. Decides on the LV gram, fluids or diuretics and the contrast plan.',
    },
    numbers: [
      'Normal LV pressure about 100–140 / 3–12 mmHg',
      'LVEDP ≤ 12 mmHg normal; 13–18 mmHg borderline to mildly high; > 18 mmHg elevated',
      'POSEIDON fluid rates: LVEDP < 13 → 5 mL/kg/h; 13–18 → 3 mL/kg/h; > 18 → 1.5 mL/kg/h',
      'POSEIDON: contrast kidney injury 6.7 % vs 16.3 %',
    ],
    pearls: [
      'Read the true end-diastolic point after the a wave, not the lowest early diastolic pressure, which is close to zero.',
      'Breath-holding or straining (Valsalva) falsely raises it; measure at end-expiration during quiet breathing.',
      'In atrial fibrillation there is no a wave: take the pressure at the R wave.',
      'The pigtail can trigger PVCs or VT; reposition it if ectopy persists, because ectopy also distorts the reading.',
    ],
    image: {
      keys: ['lvedp-tracings-lvad-on-off'],
      want: 'A real LV pressure tracing with the ECG showing the a wave and the end-diastolic point marked at the R wave.',
    },
    sim: ['lvedp'],
    related: ['left-heart-cath', 'cl-cath-pigtail', 'cl-drug-contrast', 'hfref'],
  },

  {
    id: 'cl-rhc',
    name: 'Right heart catheterization: normal pressures',
    group: 'hemodynamics',
    synonyms: ['RHC', 'Swan-Ganz', 'Pulmonary artery catheter', 'Right heart run', 'PCWP', 'Wedge pressure'],
    summary:
      'A balloon-tipped catheter is floated from a vein through the right atrium, right ventricle and pulmonary artery to the wedge position, recording each pressure. It measures filling pressures, pulmonary pressures and cardiac output.',
    details: [
      'A balloon-tipped catheter goes in through the femoral, internal jugular or an arm vein and is floated through each chamber in turn.',
      'RA trace: a wave (atrial contraction), c wave (tricuspid valve bulging back as the RV contracts), x descent (atrial relaxation), v wave (atrial filling) and y descent (tricuspid opening).',
      'RV trace: a sharp systolic peak with a low diastolic pressure that rises during filling; in the PA a dicrotic notch appears and the diastolic pressure steps up.',
      'PCWP: with the balloon inflated in a branch pulmonary artery, the trace reflects left atrial pressure, with a and v waves and a mean at or below the PA diastolic.',
      'Confirm a true wedge by the atrial-type waveform and the lower mean and, if unsure, by a blood sample from the wedge position with saturation about 95 % or higher.',
      'An oxygen saturation run (SVC, IVC, RA, RV, PA) looks for a step-up that points to a left-to-right shunt such as an ASD, VSD or PDA.',
      'Pulmonary hypertension is a mean PA pressure > 20 mmHg; it is pre-capillary if the PCWP is ≤ 15 mmHg and the PVR > 2 Wood units.',
    ],
    roles: {
      tech: 'Zeroes and levels the transducer, records and labels each pressure at end-expiration, and runs the saturation and cardiac output measurements. Calls out ectopy or a catheter that stays wedged.',
      rn: 'Prepares the patient and the venous access site and monitors the rhythm (RV ectopy, new bundle branch block) and oxygen saturation. Gives drugs or oxygen on order, for example during vasodilator testing, and documents.',
      md: 'Advances the catheter through each chamber, confirms the wedge and interprets pressures, waveforms and saturations. Diagnoses heart failure, shunts or pulmonary hypertension.',
    },
    numbers: [
      'RA mean 2–8 mmHg',
      'RV 15–30 / 2–8 mmHg',
      'PA 15–30 / 4–12 mmHg, mean ≤ 20 mmHg',
      'PCWP mean 6–12 mmHg',
      'Shunt step-up: ≥ 7 % at the atrial level, ≥ 5 % at the RV or PA level',
      'Mixed venous saturation for a shunt run: (3 × SVC + IVC) ÷ 4',
      'Qp/Qs = (SaO₂ − mixed venous) ÷ (pulmonary venous − PA saturation); ≥ 1.5 suggests a significant shunt',
    ],
    pearls: [
      'Read pressures at end-expiration, when breathing affects them least: just before the inspiratory dip in a patient breathing on their own.',
      'Large v waves (for example acute mitral regurgitation) make the mean PCWP higher than the LVEDP.',
      'Inflate the balloon slowly, stop as soon as the trace becomes a wedge, and deflate after each reading to avoid pulmonary artery injury.',
      'In a patient with left bundle branch block, the catheter can bump the right bundle and cause complete heart block: have pacing ready.',
    ],
    image: {
      keys: ['rhc-ra-rv-pa-pcwp-tracings', 'rv-pressure-monitor-edp'],
      want: 'A real right heart pullback tracing showing PCWP, PA, RV and RA waveforms in sequence.',
    },
    sim: ['rhc'],
    related: ['right-heart-cath', 'cl-venous-access', 'cl-cardiac-output', 'cl-shock-profiles'],
  },

  {
    id: 'cl-cardiac-output',
    name: 'Cardiac output, index, SVR and PVR',
    group: 'hemodynamics',
    synonyms: ['Cardiac index', 'Fick', 'Thermodilution', 'SVR', 'PVR', 'Cardiac power output'],
    summary:
      'Cardiac output is the blood the heart pumps each minute; dividing it by body surface area gives the cardiac index. Combined with the pressures it gives the vascular resistances and cardiac power, the core of shock and heart failure assessment.',
    details: [
      'Fick method: cardiac output = oxygen consumption ÷ the arterial–venous oxygen content difference, from arterial and mixed venous (PA) saturations and hemoglobin.',
      'Most labs assume the oxygen consumption (about 125 mL/min per m² of body surface area) instead of measuring it, which can be off by 25 % or more.',
      'Thermodilution: cold saline injected through the RA port is sensed by a thermistor near the PA tip; average three readings that agree within about 10 %.',
      'Thermodilution is unreliable with severe tricuspid regurgitation, intracardiac shunts and very low output; use Fick then.',
      'Cardiac index = cardiac output ÷ body surface area, so patients of different sizes can be compared.',
      'Resistances are calculated, not measured: SVR from MAP minus RA pressure, PVR from mean PA pressure minus PCWP, each divided by the cardiac output.',
      'Cardiac power output (MAP × CO ÷ 451, in watts) is the strongest hemodynamic predictor of death in cardiogenic shock.',
    ],
    roles: {
      tech: 'Runs thermodilution (injecting and averaging three readings) or the Fick calculation from the saturations and hemoglobin. Calculates CI, SVR, PVR and cardiac power for the operator.',
      rn: 'Draws or sends the arterial and mixed venous samples together and records the oxygen the patient is on. Titrates pressors or inotropes on order using the results.',
      md: 'Chooses Fick or thermodilution and checks the numbers fit the patient. Uses CO, CI, SVR, PVR and cardiac power to diagnose and to guide drugs or mechanical support.',
    },
    numbers: [
      'Fick: CO (L/min) = VO₂ (mL/min) ÷ [13.4 × Hb (g/dL) × (SaO₂ − SvO₂)], saturations as decimals',
      'Normal CO about 4–8 L/min; CI 2.5–4.0 L/min/m²; CI < 2.2 is low',
      'SVR = 80 × (MAP − RAP) ÷ CO; normal 800–1200 dyn·s/cm⁵',
      'PVR = (mean PA − PCWP) ÷ CO; normal < 2 Wood units (1 WU = 80 dyn·s/cm⁵)',
      'Mixed venous (PA) saturation 65–75 %',
      'Cardiac power output = MAP × CO ÷ 451; normal about 1 W; < 0.6 W = poor prognosis',
    ],
    pearls: [
      'Draw the arterial and PA samples at the same time, on the same oxygen, in a steady state; otherwise the Fick output is wrong.',
      'An assumed oxygen consumption makes Fick an estimate: when the result doesn’t fit the patient, compare it with thermodilution.',
      'For thermodilution, inject quickly and smoothly (in under about 4 seconds) and check the catheter constant entered on the system.',
      'A wrong cardiac output or a badly leveled RA pressure gives a wrong SVR: the resistances are only as good as the numbers that go in.',
    ],
    image: {
      keys: ['thermodilution-curves-co-screen', 'cardiac-output-monitor-ci-svri'],
      want: 'A real hemodynamic system screen showing a thermodilution curve with three averaged readings and the calculated cardiac index, SVR and PVR.',
    },
    sim: ['rhc'],
    related: ['cl-rhc', 'cl-shock-profiles'],
  },

  {
    id: 'cl-shock-profiles',
    name: 'Hemodynamic profiles of shock',
    group: 'hemodynamics',
    synonyms: ['Shock hemodynamics', 'SCAI shock stages', 'Shock phenotypes'],
    summary:
      'Each type of shock has its own pattern of filling pressures, cardiac output and vascular resistance. Reading the pattern from a right heart cath tells the team which fluid, drug or device fits.',
    details: [
      'Cardiogenic (LV): high PCWP, low cardiac index, high SVR and a low mixed venous saturation; the patient is cold and wet.',
      'Hypovolemic: low RA pressure and PCWP, low cardiac index and high SVR; cold and dry.',
      'Distributive (sepsis, anaphylaxis, vasoplegia): low SVR with a normal or high cardiac index and low to normal filling pressures; warm.',
      'RV infarction: RA ≥ 10 mmHg with RA/PCWP > 0.8, a low cardiac index and a normal or low PCWP; clear lungs but raised neck veins.',
      'Tamponade: diastolic pressures equalize (RA ≈ RV diastolic ≈ PA diastolic ≈ PCWP), the y descent is blunted and pulsus paradoxus appears.',
      'SCAI stages: A at risk, B beginning (low pressure or fast pulse, perfusion intact), C classic (hypoperfusion needing treatment), D deteriorating, E extremis (arrest, CPR or ECMO).',
      'Mixed shock is common: sepsis on top of cardiogenic shock lowers the SVR, so a “normal” value can hide two problems.',
    ],
    roles: {
      tech: 'Records the full hemodynamic set and calculates CI, SVR, PVR, PAPi and cardiac power. Flags pattern changes on repeat measurements.',
      rn: 'Correlates the numbers with the bedside picture (skin, mental status, urine output, lactate), titrates fluids, pressors and inotropes on order, and documents trends.',
      md: 'Names the shock type and SCAI stage and chooses fluids, vasopressors, inotropes or mechanical support. Treats the cause, such as the culprit artery or tamponade.',
    },
    numbers: [
      'Cardiogenic: SBP < 90 mmHg, CI < 2.2 L/min/m² (< 1.8 without support), PCWP > 15 mmHg',
      'RV infarction: RA ≥ 10 mmHg and RA/PCWP > 0.8; PAPi < 0.9 suggests RV failure',
      'PAPi = (PA systolic − PA diastolic) ÷ RA pressure',
      'Tamponade: diastolic pressures within about 5 mmHg of each other',
      'Distributive: SVR < 800 dyn·s/cm⁵',
      'Cardiac power output < 0.6 W: high risk of death',
    ],
    pearls: [
      'Get the full set together (RA, PA, PCWP, CI, SVR, PA saturation, cardiac power) and match the pattern instead of chasing one number.',
      'In RV infarction, fluids help only until the RA pressure reaches about 10–15 mmHg; more volume swells the RV, squeezes the LV and lowers output.',
      'Equal diastolic pressures also occur in constriction: tamponade blunts the y descent, while constriction gives a deep y descent (dip and plateau).',
      'A rising lactate and falling urine output show the profile worsening, often before the numbers do.',
    ],
    image: {
      keys: ['constriction-lv-rv-dip-plateau', 'constriction-square-root-equalization'],
      want: 'A real right heart tracing from a tamponade case showing equalized diastolic pressures in the RA, RV, PA and wedge positions.',
    },
    sim: [],
    related: ['cardiogenic-shock', 'cardiac-tamponade', 'cl-rhc', 'cl-cardiac-output'],
  },

  {
    id: 'cl-act',
    name: 'Activated clotting time (ACT)',
    group: 'hemodynamics',
    synonyms: ['ACT', 'Point-of-care coagulation test'],
    summary:
      'A bedside test of how long whole blood takes to clot after an activator is added. In the lab it confirms there is enough heparin during PCI and support devices, and little enough before a sheath comes out.',
    details: [
      'A little whole blood is mixed with an activator (celite or kaolin) in a point-of-care machine, which reports the clotting time in seconds.',
      'Baseline ACT without heparin is roughly 90–140 seconds, depending on the machine; heparin prolongs it in a dose-related way.',
      'Check about 5 minutes after a heparin bolus, then about every 30 minutes in long cases and after any extra bolus.',
      'Targets depend on the drugs and the machine: about 250–300 s for PCI with heparin alone, about 200–250 s with a GP IIb/IIIa inhibitor.',
      'Machines differ: the classic heparin-only PCI targets were 250–300 s on HemoTec and 300–350 s on Hemochron, so know which one your lab uses.',
      'Draw the sample from a line free of heparinized flush, discarding the dead space first, or the result will be falsely long.',
      'Before femoral sheath removal the ACT is usually allowed to fall below about 150–180 s.',
    ],
    roles: {
      tech: 'Draws the sample from the sheath or line after discarding the dead space, runs it at the right times, and reads the result back to the operator and the RN.',
      rn: 'Gives heparin or bivalirudin boluses on order, times and documents each ACT with the dose given, and checks the ACT before sheath removal.',
      md: 'Orders the anticoagulant and the target ACT for the case and device, decides on extra boluses or reversal, and decides when sheaths can come out.',
    },
    numbers: [
      'Baseline about 90–140 s (machine-dependent)',
      'PCI, heparin alone: about 250–300 s (300–350 s on Hemochron)',
      'PCI with a GP IIb/IIIa inhibitor: about 200–250 s',
      'Mechanical support insertion (for example Impella): about 250 s',
      'Femoral sheath removal: below about 150–180 s',
      'Heparin for PCI: 70–100 units/kg (50–70 units/kg with a GP IIb/IIIa inhibitor)',
    ],
    pearls: [
      'If the ACT is low after a bolus, check that the full dose was given and the IV is running before simply giving more.',
      'With bivalirudin, an ACT 5 minutes after the bolus confirms it is working; an extra 0.3 mg/kg is given if it is low.',
      'Record each ACT with its time and the heparin given; the trend matters more than one value.',
      'After protamine (on order), recheck the ACT before the sheath comes out.',
    ],
    image: {
      want: 'A real photo of a point-of-care ACT analyzer showing a result in seconds, with its sample cartridge.',
    },
    sim: ['act'],
    related: ['heparin', 'cl-drug-heparin', 'cl-drug-protamine'],
  },

  // ─── Team & safety ─────────────────────────────────────────────────────────

  {
    id: 'cl-timeout',
    name: 'Consent, time-out and the Universal Protocol',
    group: 'team',
    synonyms: ['Time-out', 'Universal Protocol', 'Pre-procedure verification', 'Consent'],
    summary:
      'Before the first puncture the whole team stops to confirm the right patient, procedure and site, the consent, the allergies and the plan. This is the Joint Commission’s Universal Protocol, the main defense against wrong-patient and wrong-procedure errors.',
    details: [
      'Pre-procedure check: two patient identifiers (name plus date of birth or record number) matched to the wristband, the consent and the orders.',
      'Consent covers the procedure and likely PCI, the risks (bleeding, stroke, kidney injury, emergency surgery, death) and the alternatives, and is signed before sedation.',
      'Allergies: a previous reaction to contrast matters; shellfish, “iodine” or povidone-iodine allergies do not predict one. A latex allergy needs a latex-free room.',
      'Check anticoagulants and antiplatelets (warfarin and INR, DOACs and the last dose), metformin, kidney function, potassium, hemoglobin, NPO status and pregnancy where relevant.',
      'Confirm the planned equipment and implants are in the room (stents, balloons, pump, pacing) and that backup such as surgery is known for high-risk cases.',
      'The time-out: everyone stops, and the patient, procedure, site and side, allergies, anticoagulation and special equipment are read out and agreed aloud.',
      'Prep and drape both the radial and femoral sites so the team can switch access without stopping.',
    ],
    roles: {
      tech: 'Preps and drapes both access sites and confirms the planned equipment and sizes are in the room. Takes part in the time-out and speaks up if anything doesn’t match.',
      rn: 'Checks identity with two identifiers, the signed consent, allergies, labs, anticoagulants, NPO status and IV access, and leads or documents the time-out. Gives no sedation before consent.',
      md: 'Explains the procedure, risks and alternatives and obtains consent, and confirms the indication and plan in the time-out. Decides how to handle allergies, anticoagulants and kidney risk.',
    },
    numbers: [
      'Two patient identifiers at every check',
      'Time-out before the first puncture, and again before any new procedure or site',
      'eGFR < 30 mL/min/1.73 m²: high contrast-kidney risk; plan hydration and minimal contrast',
    ],
    pearls: [
      'A shellfish or iodine “allergy” is not a contrast allergy; only a previous contrast reaction changes the plan (premedication or another agent).',
      'The time-out is not a formality: anyone who sees a problem says so, and the case waits until it is fixed.',
      'In a STEMI the time-out is quick but never skipped: confirm identity, allergies and anticoagulants at the door.',
      'Ask when the last DOAC or warfarin dose was taken; it changes the access choice, heparin dosing and bleeding risk.',
    ],
    sim: ['timeout', 'consent', 'prep'],
    related: ['cl-closed-loop', 'cl-lab-roles', 'cl-drug-contrast'],
  },

  {
    id: 'cl-closed-loop',
    name: 'Closed-loop communication and call-outs',
    group: 'team',
    synonyms: ['Closed loop', 'Read-back', 'Check-back', 'Call-out', 'Speaking up'],
    summary:
      'A message is not complete until the receiver repeats it back and the sender confirms it. In the lab this applies to every device size, every drug dose and every warning sign.',
    details: [
      'The sender names the person and gives one clear order: “Sam, open a 3.0 by 18 drug-eluting stent.”',
      'The receiver repeats it back exactly (“3.0 by 18 drug-eluting stent”) and the sender confirms (“Correct”) before it is done.',
      'Device sizes and types, and drug names, doses and routes, are always read back before anything is opened or given; the box is shown to the operator.',
      'Anyone, in any role, can stop the procedure for a safety concern; the team pauses and resolves it before going on.',
      'Call out at once: a damped or ventricularized pressure, arrhythmias, a falling pressure or SpO₂, new ST change, and the patient’s complaints.',
      'Also call out running totals and thresholds: contrast volume, radiation dose levels and ACT results.',
      'Close the loop when the task is done: “Heparin 5,000 units given,” “Pressure back to 120.”',
    ],
    roles: {
      tech: 'Reads back every device size and type before opening it and shows the box. Calls out pressure, rhythm, contrast and dose changes to the operator by name.',
      rn: 'Reads back every drug order (name, dose, route) before giving it and confirms when it is given. Calls out changes in vital signs, symptoms and comfort.',
      md: 'Gives clear orders to a named person, confirms read-backs and acknowledges every call-out. Invites anyone to speak up or stop the case.',
    },
    pearls: [
      'Use names and eye contact: “someone check the ACT” gets done by no one.',
      'Say numbers with their units (“heparin 5,000 units”), never just “five”.',
      'If a read-back is wrong, the sender corrects it at once and the loop starts again.',
      'Silence is not agreement: if you are not sure, ask again.',
    ],
    sim: ['callout'],
    related: ['cl-damped', 'cl-timeout', 'cl-lab-roles'],
  },

  {
    id: 'cl-radiation',
    name: 'Radiation safety',
    group: 'team',
    synonyms: ['ALARA', 'Radiation protection', 'Air kerma', 'Dose reduction', 'Dosimetry'],
    summary:
      'Fluoroscopy and cine expose the patient and the staff to X-rays. Keeping doses as low as reasonably achievable (ALARA) means less time, more distance and good shielding, while watching the patient’s skin dose.',
    details: [
      'Time: step on the pedal only while watching, use low-frame-rate fluoroscopy (for example 7.5 frames per second), and store fluoroscopy instead of cine when that is enough.',
      'Distance: scatter falls with the square of the distance, so one step back cuts the dose a lot; scatter is highest on the X-ray tube side.',
      'Shielding: lead aprons (about 0.5 mm lead equivalent at the front), a thyroid collar, leaded glasses, the ceiling-mounted shield and the table skirt.',
      'Geometry: the detector close to the patient, the table high enough to keep the tube away, tight collimation, and no steeper angles than needed, because they raise dose sharply.',
      'Patient dose is shown as reference air kerma (Gy) and kerma-area product (Gy·cm²); skin effects start above about 2 Gy to one area.',
      'Staff wear dosimeters: one at the collar outside the apron and often a second at the waist under it.',
      'Pregnancy: staff who declare it get a fetal badge and a lower dose limit; patients who could be pregnant are asked before elective cases.',
    ],
    roles: {
      tech: 'Drives the C-arm with tight collimation, low frame rates and the detector close to the patient, and positions the shields. Watches the air kerma and calls out dose thresholds.',
      rn: 'Wears a dosimeter and shielding and stays as far from the tube as patient care allows. Documents fluoroscopy time and air kerma and gives skin follow-up instructions after a high-dose case.',
      md: 'Uses the pedal sparingly, chooses fluoro store over cine when possible and limits steep angles. Arranges skin follow-up when the reference air kerma exceeds about 5 Gy.',
    },
    numbers: [
      'Skin: about 2 Gy transient redness, about 3 Gy temporary hair loss; higher doses can cause ulcers weeks later',
      'Tell the operator at about 3 Gy reference air kerma, then every 1 Gy',
      'Reference air kerma > 5 Gy: document it and arrange skin follow-up',
      'Inverse square law: double the distance, one quarter of the dose',
      'Cine gives roughly 10 times the dose rate of fluoroscopy',
      'US staff limits: 50 mSv per year whole body; a declared pregnancy limits the fetus to 5 mSv for the whole pregnancy',
    ],
    pearls: [
      'Keep your hands out of the beam: if your fingers show on the screen, they are in the primary beam.',
      'Steep LAO cranial and LAO caudal views give high doses; in long cases, change the angle slightly to spread the skin dose.',
      'Large patients and long CTO or complex PCI cases build dose fast: watch the air kerma and call out thresholds.',
      'Step back during cine runs and stay behind the shield; it costs nothing.',
    ],
    image: {
      want: 'A real photo of a cath lab with the ceiling shield and table skirt in place, or a dose display showing reference air kerma and kerma-area product during a case.',
    },
    sim: [],
    related: ['cl-angio-basics', 'cl-closed-loop'],
  },

  {
    id: 'cl-lab-roles',
    name: 'Who does what in the cath lab',
    group: 'team',
    synonyms: ['Cath lab team', 'Scrub tech', 'Monitoring tech', 'Circulator', 'RCIS'],
    summary:
      'A cath lab team usually has a scrubbed tech beside the operator, a monitoring tech at the recording system, an RN caring for the patient and the cardiologist making the decisions. Clear roles keep the case safe and fast.',
    details: [
      'Scrub tech: sets up and keeps the sterile table, preps devices and hands them to the operator with a read-back of sizes, and often runs the injector and the C-arm.',
      'Monitoring tech: runs the hemodynamic recording system, measures and labels pressures, logs times, devices and events, tracks contrast and dose, and calls out changes.',
      'Circulator (tech or RN): opens sterile supplies, fetches devices, scans implants and helps outside the sterile field.',
      'RN: assesses and monitors the patient, gives sedation and medications on order, and manages comfort, access-site and limb checks, documentation and hand-off.',
      'Cardiologist: decides the indication and strategy, performs the procedure, interprets the findings, orders drugs and devices and manages complications.',
      'RCIS (Registered Cardiovascular Invasive Specialist, from Cardiovascular Credentialing International) is the main US credential for cath lab techs.',
      'Sterile field rules: only scrubbed people touch it, anything below the table edge or behind your back is not sterile, and a break is called out at once.',
    ],
    roles: {
      tech: 'Works as scrub (table, devices, injector, C-arm) or monitor (hemodynamics, recording, consoles, dose tracking), and confirms every device in closed loop.',
      rn: 'Owns the patient: assessment, consent and allergy checks, IV access, sedation and drugs on order, monitoring, comfort, access-site care, documentation and hand-off.',
      md: 'Leads the team and the procedure: indications, strategy, device choice, interpretation, drug orders and complication management.',
    },
    numbers: [
      'Typical team: the cardiologist plus 2–3 staff (scrub, monitor, RN), more for STEMI, shock or support devices',
      'Common target: the STEMI team in the lab within about 30 minutes of activation',
    ],
    pearls: [
      'Someone must watch the patient and the monitor at every moment; when the RN is busy with a drug, the monitoring tech keeps eyes on the pressures and rhythm.',
      'Scope matters: techs don’t give drugs, RNs give drugs on order and the operator decides, but anyone can stop the case for safety.',
      'In an emergency, the operator or a named leader assigns roles out loud: compressions, defibrillator, drugs, recorder.',
    ],
    sim: [],
    related: ['cl-timeout', 'cl-closed-loop', 'cl-radiation'],
  },

  {
    id: 'cl-stemi-system',
    name: 'STEMI: from first contact to device',
    group: 'team',
    synonyms: ['STEMI system of care', 'Door-to-balloon', 'FMC-to-device', 'Cath lab activation', 'Door-in-door-out'],
    summary:
      'STEMI care is a race against heart muscle loss: the system aims to open the artery within 90 minutes of first medical contact. Prehospital ECGs, early cath lab activation and a ready team make that possible.',
    details: [
      'The clock starts at first medical contact (FMC), when a paramedic or the ED first sees the patient; a 12-lead ECG should be done within 10 minutes.',
      'Paramedics transmit the ECG and activate the cath lab from the field, then take the patient straight to a PCI center, bypassing non-PCI hospitals.',
      'Primary PCI is preferred if it can happen within 120 minutes of FMC; if not, fibrinolysis within 30 minutes of arrival, then transfer for angiography.',
      'At a non-PCI hospital, door-in-door-out (arrival to leaving for the PCI center) should be 30 minutes or less.',
      'In the lab: radial access first, aspirin, anticoagulation and a P2Y12 inhibitor as the operator orders, and the culprit artery opened first.',
      'In stable patients, significant non-culprit lesions are treated too, at the same sitting or staged; in cardiogenic shock, CULPRIT-SHOCK showed culprit-only PCI is better at first.',
      'Every case is audited: door-to-balloon, FMC-to-device and the reasons for any delay are reviewed to improve the system.',
    ],
    roles: {
      tech: 'Opens and sets up the lab within the activation target (both access sites prepped, guides, wires, aspiration, pump and pacing ready) and records the key times on the hemodynamic system.',
      rn: 'Receives the patient and confirms identity, allergies, aspirin and anticoagulants, and starts monitoring. Gives heparin, a P2Y12 inhibitor and sedation on order and documents the times for the audit.',
      md: 'Confirms the STEMI, chooses primary PCI or fibrinolysis by the timeline, and finds and opens the culprit artery. Decides on non-culprit lesions and support.',
    },
    numbers: [
      'FMC to device ≤ 90 minutes (≤ 120 minutes with transfer)',
      'Door-in-door-out ≤ 30 minutes',
      'Fibrinolysis door-to-needle ≤ 30 minutes when PCI can’t happen within 120 minutes',
      '12-lead ECG within 10 minutes of first contact',
      'After fibrinolysis: angiography within about 2–24 hours, at once if it fails (rescue PCI)',
      'Reperfusion for symptoms < 12 hours old (later if ischemia or shock persists)',
    ],
    pearls: [
      'Record the times as they happen (symptom onset, FMC, door, activation, team arrival, puncture, device); reconstructing them later is unreliable.',
      'Device time is when the first device (balloon, aspiration catheter or stent) treats the culprit artery, not when the stent goes in.',
      'In inferior STEMI, check right-sided leads (V4R): RV involvement means avoiding nitrates and supporting preload with fluids.',
      'Review false activations as well as delays; both improve ECG reading and the system.',
    ],
    image: { keys: ['lad-occlusion', 'rca-occlusion'], want: 'Real angiograms of the culprit occlusions the whole system races to open.' },
    sim: [],
    related: ['anterior-stemi', 'inferior-stemi', 'tenecteplase', 'aspirin', 'cl-radial-access', 'pci-stent'],
  },
];
