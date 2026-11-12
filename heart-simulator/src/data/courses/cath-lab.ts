import type { Course } from '@/types/course';

/**
 * Course: cath lab foundations — the room and the team, access and hemostasis, catheters, wires, balloons and
 * stents, the angiographic views, the pressures and numbers on the screen, and the first move in five lab
 * emergencies. Every number agrees with the cath lab catalog (src/data/content/cathlab-a/b/c.ts).
 * View angles are given as short ranges that cover both the catalog's typical angle and the app's camera preset
 * (the Angio readout on the heart shows the preset's angle, so the text must not contradict it).
 * Coronary arteries can be tapped only by their name tags, so the tap checks about arteries say so.
 * Educational content only; local protocols and the operator's orders rule.
 */
export const CATH_LAB: Course = {
  id: 'cath-lab',
  title: 'Cath lab foundations',
  summary: 'How a cath lab case runs: who does what, the way into the artery and out again, the catheters, wires, balloons and stents, and the angiographic views. Then the pressures on the screen, and the first move when something goes wrong.',
  roles: [3, 4, 5],
  level: 'core',
  lessons: [
    // ─── 1 ───────────────────────────────────────────────────────────────
    {
      id: 'room-and-team',
      title: 'The room and the team',
      goal: 'Say who does what in the lab, run a time-out and a closed loop, and keep your radiation dose low.',
      minutes: 9,
      steps: [
        {
          title: 'One patient, one team',
          text: [
            'A cardiac catheterization laboratory (cath lab) is an X-ray room where thin tubes called catheters are passed through a blood vessel, usually an artery, to the heart. A typical case needs a cardiologist and two or three staff: a scrub tech, a monitoring tech and a nurse (RN).',
            'The cardiologist, often called the operator, decides the plan, does the procedure, reads the pictures, orders every drug and device and manages complications. Everyone else makes that work safe and fast.',
            'One rule holds all case long: someone is watching the patient and the monitor at every moment.',
          ],
          look: 'The heart beats in normal sinus rhythm, with three monitor leads below it. The patient\'s heart and its tracing are what the whole team works around.',
          show: { heart: 'external', camera: 'Front', ecg: 'ecg', layout: 'monitor', rhythm: 'normal-sinus', focus: 'heart' },
          more: ['cl-lab-roles'],
        },
        {
          title: 'The scrub tech and the circulator',
          text: [
            'The scrub tech is gowned and gloved at the table beside the operator. The scrub sets up and guards the sterile table, prepares each catheter, wire, balloon and stent (the mesh tube that props an artery open), and hands it over after reading its size aloud.',
            'In many labs the scrub also runs the injector for contrast, the liquid that shows up on X-ray, and moves the C-arm, the arm that carries the X-ray tube and the image detector.',
            'The circulator, a tech or an RN, is not scrubbed. The circulator opens sterile supplies onto the table, fetches devices, scans each implanted device into the record and helps wherever hands are needed outside the sterile area.',
          ],
          show: { focus: 'heart' },
          check: {
            kind: 'choice',
            question: 'Mid-case the operator needs a stent that is still in the cabinet. Who fetches it and opens it onto the table?',
            options: ['The circulator', 'The scrub tech', 'The monitoring tech', 'The operator'],
            answer: 0,
            explain: 'The circulator is not scrubbed, so can leave the table, fetch the box, show it for the size check and open it onto the sterile table. The scrub tech stays sterile at the table; walking to the cabinet would break that. The monitoring tech stays at the recording system.',
          },
          roleNote: {
            3: 'As scrub you move catheters and wires only as the operator directs. Where state law reserves fluoroscopy for licensed staff, the X-ray pedal is not yours to press.',
          },
          more: ['cl-lab-roles'],
        },
        {
          title: 'The monitoring tech',
          text: [
            'The monitoring tech sits at the hemodynamic recording system. Hemodynamics means the pressures and flow of the blood. The system shows the ECG and the pressure from the catheter tip together, beat by beat.',
            'The monitoring tech measures and labels the pressures and logs the times, devices and events. The tech also keeps two running totals and calls them out: contrast, because too much can injure the kidneys, and radiation dose. Any change in rhythm or pressure is called out the moment it appears.',
          ],
          look: 'The chart draws the ECG on top and the pressures under it. The red line is the pressure in the aorta, the trace a monitoring tech watches all case long.',
          show: { ecg: 'wiggers', heart: false },
          roleNote: {
            3: 'Call out what the screen shows: "pressure is 80 over 50", "wide beats on the monitor". Deciding what it means for treatment belongs to the operator.',
          },
          more: ['cl-lab-roles', 'cl-aortic-waveform'],
        },
        {
          title: 'The nurse',
          text: [
            'The RN owns the patient. Before the case the RN checks identity, consent, allergies, kidney function and blood thinners, and secures an IV line. During it the RN watches the patient, gives sedation and every other drug on the operator\'s order, and keeps the patient comfortable. Afterward come the access-site checks, the record and the hand-off.',
            'Under sedation the RN watches breathing with capnography, a continuous reading of exhaled carbon dioxide. A slowing or flattening capnogram shows too much sedation before the oxygen level falls.',
          ],
          look: 'This is the monitor view: the ECG in green, the pulse-oximeter wave (labeled Pleth) in blue and the capnogram (labeled CO₂) in yellow. Each yellow hump is one breath out.',
          show: { ecg: 'defib' },
          check: {
            kind: 'choice',
            question: 'A sedated patient\'s capnogram humps turn slow and small, but the oxygen saturation still reads 97%. What does that mean?',
            options: [
              'Breathing is slowing: act before the saturation falls',
              'Nothing yet: wait until the saturation drops below 90%',
              'The ECG electrodes have come off the chest',
              'The patient is waking up and needs more sedation',
            ],
            answer: 0,
            explain: 'Capnography shows slow or shallow breathing as it happens. Oxygen saturation falls later, especially on extra oxygen, so waiting for it wastes the warning. Tell the operator and support the airway.',
          },
          roleNote: {
            4: 'Moderate sedation is given on the operator\'s order with the operator present. Deep sedation and general anesthesia belong to an anesthesia professional.',
          },
          more: ['cl-drug-sedation', 'cl-lab-roles'],
        },
        {
          title: 'The time-out',
          text: [
            'Before the first puncture everyone stops for the time-out. It is part of the Universal Protocol, the Joint Commission\'s safeguard against the wrong patient, the wrong procedure and the wrong site.',
            'The team reads out and agrees on the patient (two identifiers, such as name and date of birth), the procedure, the site and side, the allergies, the blood thinners and any special equipment. Consent is signed before any sedation is given.',
            'It is not a formality. Anyone who sees something that does not match says so, and the case waits until it is fixed. In an emergency the time-out is short, never skipped.',
          ],
          show: { heart: 'external', camera: 'Front', ecg: 'ecg', layout: 'monitor', focus: 'heart' },
          check: {
            kind: 'choice',
            question: 'During the time-out the wristband shows a different date of birth from the consent form. What happens next?',
            options: [
              'The case stops until the mismatch is resolved',
              'The case goes on, because the name matches',
              'The circulator corrects the form while the operator gets access',
              'It is noted in the record and checked after the case',
            ],
            answer: 0,
            explain: 'Both identifiers must match the wristband, the consent and the orders. A matching name is not enough: two patients can share one. Nothing starts, not even sedation, until the team is sure it has the right patient.',
          },
          more: ['cl-timeout'],
        },
        {
          title: 'The sterile field',
          text: [
            'The sterile field is the draped patient, the table of instruments and the fronts of the scrubbed team\'s gowns. It keeps bacteria out of the bloodstream.',
            'Three rules protect it. Only scrubbed people touch it. Anything below the table edge or behind your back counts as not sterile. A break is called out at once, by whoever sees it, so the item can be replaced.',
          ],
          show: { focus: 'heart' },
          check: {
            kind: 'choice',
            question: 'A scrubbed tech lets the back end of a wire drop below the edge of the table. What should happen?',
            options: [
              'Say so at once: the wire is no longer sterile',
              'Lift it back and wipe it with saline gauze',
              'Carry on if nobody else saw it',
              'Carry on, since the back end never enters the patient',
            ],
            answer: 0,
            explain: 'Below the table edge is not sterile. The back end of a wire is held by sterile gloves and passes through every balloon and stent, so it carries whatever it touched to the field. Wiping does not make it sterile again. Calling your own break is expected, not a fault.',
          },
          more: ['cl-lab-roles'],
        },
        {
          title: 'Closed-loop communication',
          text: [
            'A message is complete only when it has gone around a loop. The sender names a person and gives one clear order. The receiver repeats it back word for word. The sender confirms. When the task is done, the receiver says so.',
            'The loop applies to every device size, every drug dose and every warning. Say numbers with their units: "heparin 5,000 units", never "five".',
            'Warnings travel the same way. A change in rhythm or pressure is called out to the operator by name, and the operator answers.',
          ],
          look: 'The monitor now shows early, wide beats among the normal ones: premature ventricular contractions (PVCs), common while a catheter touches the wall of the ventricle. This is the kind of change you call out.',
          show: { rhythm: 'pvcs', focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'The operator says, "Sam, open a 3.0 by 18 drug-eluting stent." Which reply closes the loop?',
            options: [
              'Repeating "3.0 by 18 drug-eluting stent" and showing the box',
              'Saying "OK, got it" and opening the box at once',
              'Opening the box without speaking, to save time',
              'Saying "three-oh stent coming" and opening the nearest 3.0 box',
            ],
            answer: 0,
            explain: 'The size and type are repeated in full, the box is shown, and nothing is opened until the operator confirms. "OK" proves you heard something, not what you heard. A 3.0 by 18 and a 3.0 by 28 sit side by side in the cabinet, and an opened stent cannot be reused.',
          },
          roleNote: {
            3: 'Read back every device before you open it, and show the box. Call out changes by name: "Dr. Lee, PVCs on the monitor."',
            4: 'Read back every drug order with its name, dose and route before you give it, and say when it has been given.',
            5: 'Give each order to a named person, confirm the read-back and acknowledge every call-out.',
          },
          more: ['cl-closed-loop', 'pvcs'],
        },
        {
          title: 'Radiation: time, distance, shielding',
          text: [
            'The X-ray beam that makes the picture also scatters off the patient in every direction. That scatter is the staff\'s dose. The goal is ALARA: as low as reasonably achievable. Three things lower it.',
            'Time: the beam is on only while someone is looking. Live X-ray (fluoroscopy) is used at a low frame rate, and recording (cine) is kept short, because it gives roughly 10 times the dose rate. Distance: dose falls with the square of the distance. Shielding: a lead apron (about 0.5 mm of lead at the front), a thyroid collar, leaded glasses, the ceiling shield and the table skirt.',
            'Scatter is strongest on the side of the X-ray tube, which sits under the table opposite the image detector.',
          ],
          look: 'The heart has turned to a left anterior oblique (LAO) view: you are looking from where the detector sits, at the patient\'s left front. The X-ray tube is opposite you, under the table on the patient\'s right, where the operator stands.',
          show: { heart: 'external', camera: 'LAO', ecg: false, rhythm: 'normal-sinus' },
          check: {
            kind: 'choice',
            question: 'You stand 1 m from the patient during a cine run. If you step back to 2 m, your dose from scatter becomes about…',
            options: ['One half', 'One quarter', 'One eighth', 'One sixteenth'],
            answer: 1,
            fixed: true,
            explain: 'Dose falls with the square of the distance: twice as far gives one quarter (1 ÷ 2²). Half would be true only if dose fell in step with distance. One step back during a recording costs nothing.',
          },
          roleNote: {
            3: 'Where you drive the C-arm, much of the dose is in your hands: tight collimation (a narrow beam), the detector close to the patient, a low frame rate and the shields in place before the first run.',
            5: 'Use the pedal sparingly, store fluoroscopy instead of cine when it answers the question, and avoid steeper angles than you need.',
          },
          more: ['cl-radiation'],
        },
        {
          title: 'Radiation: the numbers to know',
          text: [
            'The system displays the patient\'s dose as reference air kerma, in gray (Gy). It estimates the dose to the skin where the beam enters.',
            'Skin reddening can begin at about 2 Gy to one area. Staff tell the operator when the air kerma reaches about 3 Gy, and again at every further 1 Gy. Above 5 Gy the dose is documented, the patient is told and a skin check is arranged.',
            'Staff wear dosimeters, badges that record their own dose: one at the collar outside the apron and often a second at the waist under it. The US limit for staff is 50 millisieverts (mSv) a year to the whole body. Once a pregnancy is declared, the limit for the fetus is 5 mSv for the whole pregnancy.',
          ],
          check: {
            kind: 'choice',
            question: 'In a long case the display reads 3.1 Gy of reference air kerma. What should the monitoring tech do?',
            options: [
              'Tell the operator now, and again at each further 1 Gy',
              'Nothing until it passes 5 Gy',
              'Stop the case: the limit has been reached',
              'Report the fluoroscopy time instead, which matters more',
            ],
            answer: 0,
            explain: 'About 3 Gy is the first call-out, then every 1 Gy, so the operator can change the angle, the frame rate or the plan. No dose forces a needed procedure to stop, and 5 Gy is the point for documentation and skin follow-up, not the first warning. Fluoroscopy time is a poor measure of dose.',
          },
          more: ['cl-radiation', 'cl-closed-loop'],
        },
      ],
    },

    // ─── 2 ───────────────────────────────────────────────────────────────
    {
      id: 'access',
      title: 'Getting in and getting out',
      goal: 'Describe radial and femoral access, stop the bleeding safely at each site and spot access-site complications early.',
      minutes: 9,
      steps: [
        {
          title: 'Two ways in, one destination',
          text: [
            'To reach the heart a catheter needs a way into an artery. There are two usual doors: the radial artery at the wrist and the common femoral artery in the groin. A short tube called a sheath holds the door open.',
            'From the right wrist the catheter runs up the arm and enters the aorta through the first branch of its arch. From the groin it climbs the aorta from below and passes over the arch. Either way its tip ends in the ascending aorta, right above the aortic valve, where the coronary arteries begin.',
          ],
          look: 'The aortic arch is ringed. Catheters from the right wrist arrive at the top of it; catheters from the groin come over it from behind.',
          show: { heart: 'external', structure: 'aortic-arch', rhythm: 'normal-sinus' },
          check: {
            kind: 'tap',
            question: 'Tap the part of the aorta where the catheter tip sits to reach the coronary arteries.',
            targets: ['ascending-aorta'],
            explain: 'The ascending aorta rises from the left ventricle. The two coronary arteries leave it right above the aortic valve, so that is where the tip of every coronary catheter is steered.',
          },
          more: ['cl-radial-access', 'cl-femoral-access', 'ascending-aorta'],
        },
        {
          title: 'The wrist: radial access',
          text: [
            'Radial access is the default for coronary work. In large trials (RIVAL, MATRIX) it caused fewer bleeding and vessel complications than the groin, and the patient can sit up as soon as the case ends.',
            'The landmark is the radial pulse, felt 1–2 cm up the forearm from the bony point on the thumb side of the wrist (the radial styloid). The wrist is extended a little on an arm board. Ultrasound shows the artery and raises the chance of entering it at the first pass.',
            'The artery is small, 2–3 mm across, about the outer width of the sheath it has to hold. It is also muscular, so it can clamp down on the sheath. That is spasm, and the radial cocktail later in this lesson is there to prevent it.',
          ],
          look: 'The ascending aorta is ringed. From the right wrist the catheter reaches it by a short, direct path.',
          show: { structure: 'ascending-aorta' },
          roleNote: {
            3: 'Set the arm board with the wrist slightly extended, open the radial kit and prepare the ultrasound probe. Prep the groin as well, so the team can switch without stopping.',
            4: 'Before the drapes go on, record the radial and ulnar pulses, and ask about a dialysis fistula in that arm.',
            5: 'An Allen or Barbeau test is not required before radial access. Consider the left radial when a left internal mammary artery graft must be studied.',
          },
          more: ['cl-radial-access'],
        },
        {
          title: 'The groin: femoral access',
          text: [
            'Femoral access is the route for large devices, such as heart pumps and valves, and the backup when the wrist fails.',
            'The target is the common femoral artery where it crosses the head of the thigh bone (the femoral head): below the inguinal ligament, the band that runs across the top of the groin, and above the point where the artery divides. X-ray shows the bone, and ultrasound shows the artery, its division and the vein beside it. The skin crease is not a reliable landmark.',
            'Height matters. Over the bone the artery can be pressed flat to stop bleeding. Too high, above the ligament, there is nothing to press against, and blood can track out of sight behind the abdomen: a retroperitoneal bleed. Too low, the puncture is prone to a false aneurysm (pseudoaneurysm) or an abnormal join between artery and vein (an arteriovenous fistula).',
          ],
          look: 'The descending aorta is ringed, behind the heart. A catheter from the groin climbs it, crosses the arch and comes down the ascending aorta to the valve.',
          show: { structure: 'descending-aorta' },
          check: {
            kind: 'choice',
            question: 'A femoral puncture turns out to be above the inguinal ligament. Which complication does that make more likely?',
            options: [
              'A retroperitoneal bleed',
              'A pseudoaneurysm',
              'An arteriovenous fistula',
              'Radial artery occlusion',
            ],
            answer: 0,
            explain: 'Above the ligament the artery cannot be pressed against the femoral head, so it can bleed into the space behind the abdomen (the retroperitoneum) while the groin looks normal. A pseudoaneurysm and an arteriovenous fistula are the risks of a puncture that is too low. Radial artery occlusion belongs to the wrist.',
          },
          more: ['cl-femoral-access', 'cl-comp-rp-bleed'],
        },
        {
          title: 'The sheath and French sizes',
          text: [
            'A sheath is a short tube with a one-way valve and a side arm. Catheters go in and out through the valve without a new puncture. The side arm is used to flush, to read the arterial pressure, to draw blood and to give drugs.',
            'Catheters and sheaths are sized in French (Fr). One French is a third of a millimeter, so dividing by 3 gives millimeters. A catheter is named by its outer width. A sheath is named by the catheter it accepts, so the sheath itself is 1–2 Fr wider on the outside.',
            'Before any flush, pull back on the side arm first: blood comes out, and any air or clot with it, instead of going in. The same care goes for every syringe and line in the lab: a bubble injected into an artery can block it like a clot.',
          ],
          show: { camera: 'Front' },
          check: {
            kind: 'choice',
            question: 'How wide is a 6 Fr catheter?',
            options: ['2.0 mm', '3.0 mm', '6.0 mm', '18 mm'],
            answer: 0,
            fixed: true,
            explain: '6 ÷ 3 = 2.0 mm: French is divided by 3, not multiplied. A 6 Fr sheath accepts that catheter, so its own outer width is larger, about 2.6 mm: as wide as many radial arteries.',
          },
          roleNote: {
            3: 'Say the French size and length aloud before the sheath goes onto the table. A side arm that will not draw back may hold clot or air: do not flush it, and tell the operator.',
          },
          more: ['cl-sheaths', 'cl-comp-air-embolism'],
        },
        {
          title: 'The radial cocktail',
          text: [
            'Right after the radial sheath goes in, the operator gives a vasodilator through its side arm to relax the artery and prevent spasm. This is the radial cocktail: commonly verapamil 2.5–5 mg, with or without nitroglycerin 100–200 mcg, diluted in the patient\'s own blood and given slowly. Warn the patient about a brief warm or burning feeling up the arm.',
            'Heparin, a blood thinner, is given too: about 50 units/kg, often 5,000 units, through the sheath or by vein. It keeps the radial artery from clotting shut after the case.',
            'Verapamil given in the arm still reaches the heart. It slows the signal through the AV node, the relay that passes each beat from the atria to the ventricles, and it lowers the blood pressure.',
          ],
          look: 'The heart is see-through and its wiring glows, with the AV node tagged in blue. Verapamil slows the signal here, so a slow heart rate, heart block or a low pressure is called out before the cocktail is given.',
          show: { heart: 'conduction', structure: 'av-node' },
          check: {
            kind: 'choice',
            question: 'The radial sheath is in. The monitor shows a heart rate of 44 a minute and a pressure of 86/50 mmHg. What is the right move before the cocktail?',
            options: [
              'Tell the operator the rate and the pressure first',
              'Give the usual cocktail: spasm is the bigger risk',
              'Leave out the heparin and give the rest',
              'Give the nitroglycerin alone without asking',
            ],
            answer: 0,
            explain: 'Verapamil slows the heart and lowers the pressure, and nitroglycerin lowers the pressure further. The operator chooses the drugs and doses, but can adjust them only if someone calls out the numbers. Heparin does not change rate or pressure, and it still protects the artery.',
          },
          roleNote: {
            3: 'Make sure the cocktail syringe on the sterile table is labeled, and watch the pressure and heart rate after it goes in.',
            4: 'Check the pressure, the heart rate and any recent sildenafil or tadalafil before drawing up the ordered drugs, and read back each drug and dose.',
            5: 'Choose the drugs and doses for this patient\'s pressure and rate. Leave out nitroglycerin with a low pressure, a right ventricular infarct or a recent PDE5 inhibitor.',
          },
          more: ['cl-drug-radial-cocktail', 'cl-comp-radial-spasm', 'heparin'],
        },
        {
          title: 'Hemostasis at the wrist',
          text: [
            'Hemostasis means stopping the bleeding when the sheath comes out. At the wrist it is done with a compression band: a strap with a small air balloon over the puncture.',
            'The aim is patent hemostasis: enough pressure to stop bleeding while blood still flows through the artery (patent means open). The band is inflated with about 13–15 mL of air. Air is then let out until a little blood appears, and 1–2 mL is put back.',
            'Flow is confirmed with a pulse oximeter on the thumb while the other wrist artery, the ulnar, is pressed shut. A wave that persists is coming through the radial artery. Later the band is deflated a few mL at a time, per protocol.',
          ],
          look: 'This is the monitor view. The blue trace, labeled Pleth, is the pulse-oximeter wave. With the ulnar artery pressed, a wave like this from the thumb proves the radial artery is still open under the band.',
          show: { heart: false, ecg: 'defib' },
          check: {
            kind: 'choice',
            question: 'The band is on and the wrist is dry, but with the ulnar artery pressed the thumb\'s oximeter wave goes flat. What does that mean?',
            options: [
              'The band is too tight: the radial artery is squeezed shut',
              'The band is set correctly',
              'The band is too loose',
              'The patient\'s blood pressure is too low to read',
            ],
            answer: 0,
            explain: 'A flat wave with the ulnar artery pressed means no blood is passing through the radial artery. An artery held shut for hours is more likely to clot and stay blocked. Air is let out until the wave returns and the site still does not bleed.',
          },
          roleNote: {
            3: 'Apply the band where you are trained to, and say the volume of air aloud so it is recorded.',
            4: 'Run the deflation on schedule and add air back if the site oozes. Check the radial pulse or repeat the oximeter test before discharge: a blocked radial artery is often silent.',
          },
          more: ['cl-hemostasis', 'cl-radial-access'],
        },
        {
          title: 'Hemostasis at the groin',
          text: [
            'A femoral sheath comes out once the heparin has worn off: an activated clotting time (ACT, a bedside clotting test) below about 150–180 seconds, by local protocol. The exception is a closure device, which seals the artery in the lab.',
            'Manual pressure is firm pressure with the fingers for about 15–20 minutes after a 6 Fr sheath, longer after larger sheaths or with blood thinners. Press over the hole in the artery, not the hole in the skin. The needle went in at a slant, so the artery was entered 1–2 cm closer to the head than the skin nick.',
            'Closure devices seal the artery at once: a collagen plug held by a small anchor inside the artery, a stitch, or a sealant placed outside the artery wall. They shorten bed rest, which is about 2–6 hours after manual pressure. They do not replace the site and pulse checks.',
          ],
          check: {
            kind: 'choice',
            question: 'Where do the fingers press after a femoral sheath is pulled?',
            options: [
              '1–2 cm above the skin hole, toward the head',
              'Directly on the skin hole',
              '1–2 cm below the skin hole, toward the foot',
              'On the inner thigh, over the vein',
            ],
            answer: 0,
            explain: 'The needle travels up at a slant, so the hole in the artery is higher than the hole in the skin. Pressing on the skin hole alone leaves the artery free to bleed under the skin.',
          },
          roleNote: {
            3: 'Pull a sheath or hold pressure only where you are trained and signed off to do it, with IV access and help already in place.',
            4: 'Confirm the ACT and the IV line before the sheath comes out. Check the site, the pulses beyond it and the vital signs on schedule, and mark the edge of any swelling.',
          },
          more: ['cl-hemostasis', 'cl-act', 'cl-femoral-access'],
        },
        {
          title: 'The vagal reaction',
          text: [
            'Pain, fear and pressure on the groin can set off a reflex through the vagus nerve, the nerve that slows the heart. The heart rate and the blood pressure fall together. The patient turns pale and sweaty, yawns, feels sick or says "I don\'t feel right".',
            'It is most common, and most dangerous, during femoral sheath removal. The first moves are to say what you see, lay the patient flat and raise the legs. IV fluid and atropine, a drug that blocks the vagus nerve\'s signal and speeds the heart, are given on the physician\'s order or by protocol.',
            'Most reactions pass within minutes. One that does not is a warning: a hidden bleed can look the same at first.',
          ],
          look: 'The heart-rate number has fallen, and the green ECG shows a slow, regular rhythm with a P wave before every QRS: sinus bradycardia, the rhythm of a vagal reaction.',
          show: { rhythm: 'sinus-bradycardia', hr: 42 },
          check: {
            kind: 'choice',
            question: 'While pressure is held on the groin the patient yawns and turns pale, and the monitor changes to this. What do you do first?',
            options: [
              'Call it out, lay the patient flat and raise the legs',
              'Let go of the groin and fetch the crash cart',
              'Wait five minutes to see whether it passes',
              'Sit the patient up to ease the nausea',
            ],
            answer: 0,
            explain: 'A slow rate with pallor and yawning during sheath removal is a vagal reaction. Calling it out brings the nurse and physician for fluid and atropine, and raising the legs returns blood to the heart. Letting go of the artery adds bleeding to a low pressure. Sitting up lowers the pressure further.',
          },
          roleNote: {
            3: 'Call out the falling rate and pressure and help position the patient. The drugs are the nurse\'s and the physician\'s part.',
            4: 'Have IV access, fluid and atropine ready before a femoral sheath is pulled. Give them on order or by your bradycardia protocol, and check the site for hidden bleeding.',
            5: 'When recovery is slow or the picture does not fit, look for a retroperitoneal bleed, tamponade, a contrast reaction or AV block.',
          },
          more: ['cl-comp-vasovagal', 'cl-drug-atropine', 'sinus-bradycardia'],
        },
        {
          title: 'Trouble at the access site',
          text: [
            'At the wrist: during the case, pain and a catheter that will not move mean spasm, and nothing is forced. Afterward, watch for swelling of the forearm (bleeding into the arm) and a lost radial pulse (a blocked artery).',
            'At the groin: a firm swelling is a hematoma, a pool of blood under the skin. A pulsing lump with a whooshing sound (a bruit) suggests a pseudoaneurysm, a leak walled off outside the artery. A cold, pale or numb leg means blood is not reaching it.',
            'The most dangerous bleed is the one you cannot see. Back, flank or lower belly pain with a falling pressure and a rising heart rate after a femoral case is a retroperitoneal bleed until proven otherwise, even when the groin looks normal.',
          ],
          look: 'The heart-rate number has climbed, and the ECG shows a fast, regular rhythm with normal P waves: sinus tachycardia. After a femoral case, a rate that climbs while the pressure falls points to blood loss.',
          show: { rhythm: 'sinus-tachycardia', hr: 118 },
          check: {
            kind: 'choice',
            question: 'Two hours after a femoral case the patient has new back pain. The pressure is 84/50 mmHg and the monitor shows this rhythm at 118 a minute. The groin looks normal. What do you suspect first?',
            options: ['A retroperitoneal bleed', 'A vagal reaction', 'A pseudoaneurysm', 'Radial artery spasm'],
            answer: 0,
            explain: 'Back pain, a low pressure and a fast rate after femoral access is a retroperitoneal bleed until proven otherwise; the groin often looks normal. A vagal reaction usually slows the heart. A pseudoaneurysm is a pulsing lump at the site, not shock. Escalate at once.',
          },
          roleNote: {
            4: 'Escalate unexplained hypotension at once. Fluid, blood and reversal of the blood thinner are given on order.',
            5: 'Do not delay treating an unstable patient for a scan. A non-contrast CT confirms the bleed when there is time.',
          },
          more: ['cl-comp-rp-bleed', 'cl-comp-radial-spasm', 'cl-hemostasis'],
        },
      ],
    },

    // ─── 3 ───────────────────────────────────────────────────────────────
    {
      id: 'catheters-and-wires',
      title: 'Catheters, wires, balloons and stents',
      goal: 'Name the catheter, wire, balloon or stent for each job and say how each one is sized.',
      minutes: 9,
      steps: [
        {
          title: 'Shaped to find an opening',
          text: [
            'The two coronary arteries open from the aorta right above the aortic valve. Each opening, called an ostium, is only a few millimeters wide, and the catheter that must enter it is steered from a meter away, at the wrist or the groin.',
            'So catheters are made with a curve already set into the tip. Advance the right shape to the right place and its tip points at the ostium. A diagnostic catheter has two jobs: to deliver contrast, the liquid that shows up on X-ray, and to read the pressure at its tip.',
            'The classic shapes in this lesson were designed for the route from the groin. From the right wrist they still work, often one size smaller, and many operators use a single catheter shaped for both arteries, such as the Tiger. Fewer catheter changes mean less spasm in the radial artery.',
          ],
          look: 'The heart is see-through. Amber tags mark the left main coronary artery, the start of the right coronary artery (RCA) and the aortic valve between them. The glowing track inside is the heart\'s wiring, which this view also draws.',
          show: { heart: 'xray', camera: 'Front', labels: false, highlight: ['lmca', 'rca-proximal', 'aortic-valve'], rhythm: 'normal-sinus' },
          more: ['coronary-angiography', 'cl-cath-tiger', 'lmca', 'rca-proximal'],
        },
        {
          title: 'Judkins left: the left coronary',
          text: [
            'The classic diagnostic catheter for the left coronary is the Judkins left, or JL. The number after the name is the distance between its two curves in centimeters: a JL4 has 4 cm.',
            'From the groin, a JL4 advanced slowly around the arch usually drops into the left main ostium by itself, while its second curve rests on the opposite wall of the aorta. Seating a catheter tip in an ostium is called engaging the artery. A Judkins left is advanced, not spun: twisting can flip it out.',
            'The size is matched to the aorta. A 3.5 suits a small aorta or the route from the right wrist; a 5 or 6 suits a widened one. If the tip will not reach, the answer is another size, not more force.',
          ],
          look: 'The left main is tagged in blue. It is short, and it divides into the left anterior descending artery (LAD) and the circumflex. A tip pushed in too far can slip into one branch and miss the other.',
          show: { structure: 'lmca' },
          check: {
            kind: 'choice',
            question: 'In a patient whose aorta is widened where it leaves the heart, the tip of a JL4 hangs short of the left main. What does the operator usually do?',
            options: ['Change to a longer curve, such as a JL5', 'Push harder until it seats', 'Spin the catheter to drive the tip up', 'Change to a Judkins right'],
            answer: 0,
            explain: 'The curve has to span the aorta, so a wider aorta needs a longer curve (JL5 or JL6). Force or spin can injure the ostium or flip the catheter out. A Judkins right is shaped for the other coronary artery.',
          },
          more: ['cl-cath-jl4', 'lmca'],
        },
        {
          title: 'Judkins right: the right coronary',
          text: [
            'The Judkins right (JR4) is the standard catheter for the right coronary, from the wrist or the groin. Its tip is drawn back until it sits right above the valve, then turned slowly clockwise until it swings into the ostium.',
            'The shaft stores twist. Turn a little, wait for the tip to follow, and stop before it jumps in deep.',
            'A small branch called the conus branch often has its own opening beside the RCA, and the tip can enter it by mistake. The pressure from the catheter tip gives the warning, and it is checked before every injection. Lesson 5 shows what to look for.',
          ],
          look: 'This is a left anterior oblique (LAO) view, from the patient\'s left front, the view used to engage the RCA. Amber tags mark the start of the RCA and the conus branch beside it: the two lie close together.',
          show: { camera: 'LAO', highlight: ['rca-proximal', 'conus-branch'] },
          roleNote: {
            3: 'Watch the pressure trace through the whole rotation, and say at once if its shape changes as the catheter engages.',
            4: 'Injections into the right coronary often slow the heart for a few seconds. Watch the rate and pressure, and have atropine ready to give on order.',
          },
          more: ['cl-cath-jr4', 'cl-view-rca-lao', 'cl-damped'],
        },
        {
          title: 'The pigtail: inside the ventricle',
          text: [
            'A pigtail catheter ends in a loop with several side holes. The loop keeps the tip off the heart wall, and the holes spread out a fast, large injection instead of jetting it from one end hole.',
            'It is passed backward across the aortic valve into the left ventricle (LV). There it reads the LV pressure. Then a power injector delivers about 30–36 mL of contrast at 10–15 mL a second to film the ventricle squeezing: the left ventriculogram.',
            'The loop should float in the middle of the cavity. If it touches the wall it sets off early beats, and the catheter is moved.',
          ],
          look: 'The heart is cut open and the left ventricle is ringed: the loop sits in the middle of this cavity. On the monitor the early, wide beats are PVCs, as when a catheter touches the wall.',
          show: { heart: 'sectioned', structure: 'left-ventricle', labels: true, rhythm: 'pvcs', ecg: 'ecg', layout: 'monitor', focus: 'heart' },
          check: {
            kind: 'tap',
            question: 'Tap the valve the pigtail crosses to enter the left ventricle.',
            targets: ['aortic-valve'],
            explain: 'The catheter comes down the ascending aorta and passes backward through the aortic valve, against the flow of blood, into the left ventricle. The mitral valve is the way in from the left atrium, which a catheter in an artery does not reach.',
          },
          more: ['cl-cath-pigtail', 'cl-lv-gram', 'left-heart-cath'],
        },
        {
          title: 'Guide catheters and support',
          text: [
            'Treating a narrowing from inside the artery is called percutaneous coronary intervention (PCI). Its wires, balloons and stents must pass through the catheter, and that takes a guide catheter: the same shapes, with a bigger channel (about 1.8 mm, or 0.070 inch, in a 6 Fr guide), a stiffer shaft and a soft tip.',
            'A guide\'s second job is support, also called back-up. Pushing a stent through a tight, hard narrowing pushes the guide backward with equal force. A guide that leans on the opposite wall of the aorta, like the EBU (extra back-up) shape for the left coronary, holds its place.',
            'With too little support the guide backs out of the ostium at each push. Seated too deep, it can block flow or tear the artery.',
          ],
          look: 'The heart is see-through again, with the left main tagged in amber: the guide\'s tip sits at its opening. The long second curve of an EBU leans on the wall of the aorta on the far side from it.',
          show: { heart: 'xray', camera: 'Front', labels: false, highlight: ['lmca'], rhythm: 'normal-sinus', ecg: false },
          check: {
            kind: 'choice',
            question: 'Each time the operator advances the stent, the guide tip backs out of the ostium and the stent stops short of the narrowing. What is the problem?',
            options: [
              'The guide gives too little support',
              'The stent is too short for the narrowing',
              'The coronary wire is too thin',
              'The guide is seated too deep',
            ],
            answer: 0,
            explain: 'A guide that backs out at every push is not giving enough back-up. Say what you see: the operator may choose a more supportive shape or add a guide extension, a thin tube run through the guide and into the artery. A guide seated too deep shows as a change in the pressure trace, not as backing out.',
          },
          more: ['cl-guide-ebu', 'cl-guide-jr4', 'cl-guide-al1'],
        },
        {
          title: 'Two sizes of wire',
          text: [
            'Wires are sized in inches, and two sizes do almost all the work.',
            'The 0.035 inch wire (0.89 mm) carries catheters up the aorta. Its tip is curled into a J, so it slides along the vessel wall instead of digging into it or entering small branches.',
            'The 0.014 inch wire (0.36 mm) is the coronary wire. The operator bends its soft tip, steers it across the narrowing and parks it far down the artery. Every balloon and stent then rides over it like a train on a rail. As devices advance, the wire can creep forward, so its tip is kept in view: it can poke through the wall of a small end branch.',
          ],
          look: 'Amber tags run along the LAD from its start to its far end near the apex. A coronary wire lies along that whole path, with its tip parked in the far segment.',
          show: { heart: 'external', camera: 'Front', highlight: ['lad-proximal', 'lad-mid', 'lad-distal'] },
          check: {
            kind: 'choice',
            question: 'During a stent advance, the tip of the 0.014 inch wire is seen to move forward into a tiny end branch. Why call it out?',
            options: [
              'The tip can perforate the branch and bleed around the heart',
              'The wire will lose its J shape',
              'The stent cannot be deployed while the wire moves',
              'The wire will block flow in the branch',
            ],
            answer: 0,
            explain: 'A wire tip pushed into a small end branch can go through its wall. The bleeding may be slow and show itself hours later, so the tip is watched on every device advance. The J tip belongs to the 0.035 inch catheter wire.',
          },
          more: ['cl-wire-workhorse', 'cl-wire-hydrophilic', 'cl-comp-perforation'],
        },
        {
          title: 'Balloons: compliant and non-compliant',
          text: [
            'A balloon is inflated with a screw syringe that reads pressure in atmospheres (atm). Each balloon has a nominal pressure, where it reaches the size on its label, and a rated burst pressure that is never exceeded.',
            'A compliant balloon (strictly, semi-compliant) grows as the pressure rises, about 10% between nominal and rated burst. It opens the narrowing before the stent, called pre-dilation, and is sized a little under the vessel.',
            'A non-compliant balloon barely grows, about 5%, so the force goes into the stent and the plaque, the fatty, often hard deposit that makes the narrowing. It is used inside the stent at high pressure, often 14–20 atm, to expand it fully. It is sized to match the vessel and kept inside the stent\'s edges.',
          ],
          look: 'While a balloon is up, the artery is blocked. The picture shows a blocked LAD: the front wall pulses purple and the ST segment, the stretch right after each QRS, rises in the chest leads. It should settle soon after the balloon comes down.',
          show: { rhythm: 'anterior-stemi', labels: true, ecg: 'ecg', layout: 'simultaneous', focus: 'ecg' },
          check: {
            kind: 'lead',
            question: 'Tap a chest lead where the ST segment is clearly raised.',
            targets: ['V1', 'V2', 'V3', 'V4', 'V5'],
            explain: 'The LAD feeds the front wall, which faces the chest leads: the ST segment rises most in V2 to V4. If pain or ST change does not settle after the balloon comes down, the team looks for a tear, a lost side branch or slow flow.',
          },
          roleNote: {
            3: 'Say the size and pressure aloud ("two-five by fifteen, eight atmospheres"), inflate and deflate on the operator\'s command, and time each inflation.',
            4: 'Chest pain, ST change or slowing during an inflation is expected. Watch that it settles after deflation, and say so if it does not.',
          },
          more: ['cl-balloon-compliant', 'cl-balloon-nc', 'anterior-stemi'],
        },
        {
          title: 'The drug-eluting stent',
          text: [
            'A stent is a metal mesh tube crimped onto a balloon. Inflating the balloon presses it into the artery wall, where it stays as a scaffold. A drug-eluting stent (DES) has a coating that slowly releases a drug to stop scar tissue from narrowing it again. It is the default stent.',
            'Two numbers size it. The diameter matches the healthy vessel beside the narrowing, about 1:1. The length runs from healthy vessel to healthy vessel, covering the whole narrowing. On the X-ray picture the guide catheter works as a ruler: a 6 Fr guide is 2.0 mm wide.',
            'Each box is read aloud (diameter, length, lot, expiry) and opened only after the operator says yes. An opened stent cannot be reused. Until the artery heals over the metal, clot can form on it, so the patient takes two antiplatelet drugs, which keep platelets from clumping: aspirin plus a second one. Stopping them early is a leading cause of a stent clotting shut.',
          ],
          look: 'The middle of the LAD is ringed. Picture the narrowing there: the stent must cover all of it and land in healthy artery at both ends.',
          show: { rhythm: 'normal-sinus', structure: 'lad-mid', ecg: false },
          check: {
            kind: 'choice',
            question: 'On the screen the healthy artery looks one and a half times as wide as the 6 Fr guide. About what stent diameter fits?',
            options: ['1.5 mm', '2.0 mm', '2.5 mm', '3.0 mm'],
            answer: 3,
            fixed: true,
            explain: 'A 6 Fr guide is 2.0 mm wide, and 1.5 × 2.0 = 3.0 mm. Stents are sized about 1:1 to the healthy vessel. Too small and the stent does not press against the wall; too large and it can tear the artery.',
          },
          roleNote: {
            3: 'Read the box aloud and wait for the operator\'s yes. Do not touch or wipe the crimped stent, and log the lot number.',
            4: 'Confirm that the antiplatelet loading dose and the blood thinner were given as ordered, and that the stent card and the antiplatelet plan go with the patient.',
            5: 'Angiography tends to undersize. Intravascular imaging shows the true vessel size and confirms that the stent is fully expanded.',
          },
          more: ['cl-stent-des', 'cl-stent-sizing', 'pci-stent'],
        },
        {
          title: 'One stent, start to finish',
          text: [
            'Put the pieces in order. Heparin is given and its effect is checked, so that blood does not clot on the equipment. The guide engages the ostium. The 0.014 inch wire crosses the narrowing. A compliant balloon opens it. The stent is placed and deployed. A non-compliant balloon expands it fully from inside. Final pictures in two views check the result.',
            'At every step the tech reads back the size, and the nurse watches the patient, the rhythm and the pressure. The clotting test that checks the heparin is in lesson 5.',
          ],
          show: { camera: 'Front' },
          check: {
            kind: 'choice',
            question: 'What usually comes straight after the stent is deployed?',
            options: [
              'A non-compliant balloon inside the stent',
              'A compliant balloon to pre-dilate the narrowing',
              'Removing the coronary wire',
              'A larger stent on top of the first',
            ],
            answer: 0,
            explain: 'Deployment at nominal pressure often leaves a stent short of its full size. A non-compliant balloon, kept inside the stent, finishes the job: an under-expanded stent is a leading cause of clotting and re-narrowing. The wire stays in until the final pictures are accepted.',
          },
          more: ['pci-stent', 'cl-balloon-nc', 'cl-drug-heparin'],
        },
      ],
    },

    // ─── 4 ───────────────────────────────────────────────────────────────
    {
      id: 'views',
      title: 'Angiographic views',
      goal: 'Name each standard view from where the detector sits and choose the view that lays out a given coronary segment.',
      minutes: 9,
      steps: [
        {
          title: 'An angiogram is a shadow',
          text: [
            'A coronary angiogram is made by filling an artery with contrast, a liquid that blocks X-rays, and recording its shadow. X-rays pass through the whole chest, so the picture is flat. It has no depth, and near and far vessels land on top of each other.',
            'That causes two problems. Overlap: one vessel hides another. Foreshortening: a segment that points toward the detector looks shorter than it is, and a narrowing in it can vanish.',
            'The cure is to move the camera. The X-ray tube and the image detector ride on a C-shaped arm, the C-arm, that swings around the patient. Every segment is filmed in at least two views about 90° apart.',
          ],
          look: 'The heart is see-through, as it is to X-rays. Amber tags mark the start, middle and far end of the left anterior descending artery (LAD). The glowing track is the heart\'s wiring; an angiogram does not show it.',
          show: { heart: 'xray', camera: 'Front', labels: false, highlight: ['lad-proximal', 'lad-mid', 'lad-distal'], rhythm: 'normal-sinus' },
          more: ['cl-angio-basics', 'coronary-angiography'],
        },
        {
          title: 'Foreshortening, seen for yourself',
          text: [
            'The heart has turned so that you look up at it from below. Nothing about the artery has changed, only where you stand.',
            'From the front the three LAD tags were strung out in a long line. From here they crowd together, because you are looking along the artery instead of across it. A narrowing between two of those tags would look shorter than it is, or hide behind the vessel itself.',
          ],
          look: 'Compare the spacing of the three amber LAD tags with the last step. Drag the heart back toward the front and watch them spread apart again.',
          show: { camera: 'Bottom', highlight: ['lad-proximal', 'lad-mid', 'lad-distal'] },
          check: {
            kind: 'choice',
            question: 'A narrowing in the mid LAD looks short and mild in one view. What is the safest reading?',
            options: [
              'It may be foreshortened: judge it in a second view',
              'It is mild: one clear view is enough',
              'It is an artifact: a real narrowing looks the same in every view',
              'It must be severe: narrowings always look milder than they are',
            ],
            answer: 0,
            explain: 'One flat picture cannot show length along the line of sight, and plaque is often lopsided, so a narrowing can look mild from one side and tight from another. A second view at about a right angle settles it.',
          },
          more: ['cl-angio-basics'],
        },
        {
          title: 'How views are named',
          text: [
            'A view is named for where the image detector sits, and the picture is what you would see from there.',
            'The first word is the side. LAO (left anterior oblique) means the detector has swung toward the patient\'s left. RAO (right anterior oblique) means toward the right. AP means straight over the chest.',
            'The second word is the tilt. Cranial means the detector is tipped toward the patient\'s head, so it looks down on the heart. Caudal means tipped toward the feet, so it looks up from below. The angles in this lesson are starting points: operators adjust each view by a few degrees for each patient.',
          ],
          look: 'This is LAO: you are looking from the patient\'s left front. Tap Angio at the bottom right of the heart (under Views on a small screen) to read the C-arm angle of any view you turn to.',
          show: { camera: 'LAO' },
          check: {
            kind: 'choice',
            question: 'The detector sits over the patient\'s right side and is tipped toward the feet. What is this view called?',
            options: ['RAO caudal', 'RAO cranial', 'LAO caudal', 'LAO cranial'],
            answer: 0,
            explain: 'The right side makes it RAO, and the tilt toward the feet makes it caudal. Cranial would mean tipped toward the head.',
          },
          more: ['cl-angio-basics'],
        },
        {
          title: 'RAO caudal: the circumflex',
          text: [
            'RAO caudal is often the first picture of the left coronary. The detector is about 25° to the patient\'s right and 25° toward the feet.',
            'It lays out the circumflex and its branches, the obtuse marginals, along their length, and shows the left main and the start of the LAD. It is the working view for circumflex disease.',
            'Its weakness is the rest of the LAD: the middle and far segments are foreshortened and their branches overlap. Those need the cranial views.',
          ],
          look: 'You are looking from the patient\'s right and from below. Amber tags mark the left main, the start of the LAD, and the circumflex with its two marginal branches.',
          show: { camera: 'RAO Ca', highlight: ['lmca', 'lad-proximal', 'lcx-proximal', 'lcx-distal', 'om1', 'om2'] },
          more: ['cl-view-rao-caudal', 'lcx-proximal', 'om1'],
        },
        {
          title: 'The spider view: the left main',
          text: [
            'Swing the detector about 45° to the patient\'s left and keep it tipped 25–30° toward the feet: LAO caudal. It is called the spider view. The left main is the spider\'s body, and the LAD, the circumflex and any branch between them are its legs.',
            'It is the view for any question about the left main, the point where it divides, and the first few millimeters of the LAD and the circumflex.',
            'The steep angles send the beam through more tissue, and the X-ray tube is on the operator\'s side of the table, so it is one of the highest-dose views.',
          ],
          look: 'You are looking up from below the patient\'s left side. Amber tags mark the left main and the vessels that leave it: the LAD, the circumflex and, between them, the ramus, a branch only some hearts have.',
          show: { camera: 'Spider', highlight: ['lmca', 'lad-proximal', 'lcx-proximal', 'ramus-intermedius'] },
          check: {
            kind: 'choice',
            question: 'The operator wants to know whether a narrowing involves the opening of the circumflex. Which view is asked for?',
            options: ['LAO caudal (spider)', 'RAO cranial', 'LAO cranial', 'LAO with no tilt'],
            answer: 0,
            explain: 'The spider view opens the left main and the origins of the LAD and the circumflex. The cranial views foreshorten the left main and the circumflex, and a straight LAO view is used for the right coronary.',
          },
          roleNote: {
            3: 'LAO views put the X-ray tube on the operator\'s side of the table. Check the ceiling shield and table skirt before the run, and collimate tightly to the left main.',
          },
          more: ['cl-view-lao-caudal', 'lmca', 'cl-radiation'],
        },
        {
          title: 'The cranial views: the LAD',
          text: [
            'Tip the detector toward the head and the LAD stretches out. RAO cranial (about RAO 20–30°, cranial 25–30°) lays out its middle and far segments down to the apex. It also splits its two kinds of branch apart: diagonals, which run over the front and side wall, and septals, short straight branches that dive into the septum, the wall between the ventricles.',
            'LAO cranial (about LAO 35–40°, cranial 25°) is its partner. It shows the LAD running down the septum and opens up the points where the diagonals leave it. With the detector straight over the chest, AP cranial does a similar job when the other two leave vessels overlapping.',
            'Cranial views look through the diaphragm. The patient takes a deep breath in and holds it, so the diaphragm drops out of the picture.',
          ],
          look: 'This is RAO cranial: you are looking down on the heart from the patient\'s right. Amber tags mark the middle and far LAD, two diagonals and the septal branches.',
          show: { camera: 'RAO Cr', highlight: ['lad-mid', 'lad-distal', 'd1', 'd2', 'septal-perforators'] },
          check: {
            kind: 'choice',
            question: 'A narrowing sits where the first diagonal leaves the LAD. Which pair of views is used to judge it?',
            options: [
              'RAO cranial and LAO cranial',
              'RAO caudal and LAO caudal',
              'LAO and RAO with no tilt',
              'RAO caudal, filmed twice',
            ],
            answer: 0,
            explain: 'The cranial views lay out the mid LAD and open the origins of the diagonals, and using both gives two looks from different sides. The caudal views foreshorten that part of the LAD. The views with no tilt are for the right coronary.',
          },
          roleNote: {
            4: 'Coach a deep breath in and hold for every cranial run. A normal held breath is enough for the caudal ones.',
          },
          more: ['cl-view-rao-cranial', 'cl-view-lao-cranial', 'cl-view-ap-cranial'],
        },
        {
          title: 'The right coronary: LAO and RAO',
          text: [
            'The right coronary artery (RCA) has its own views, both with no tilt. In LAO, about 30–45°, the whole RCA appears as a letter C: from its ostium, down the groove between the right atrium and right ventricle, to the crux, the point on the underside of the heart where it divides. This is the view in which the catheter is turned into the RCA.',
            'In RAO, about 30°, the artery looks like a letter L: the middle segment runs down, then the posterior descending artery (PDA) runs along the underside of the heart toward the apex. RAO shows the mid RCA, the branches to the right ventricle and the length of the PDA.',
            'Injections into the RCA often slow the heart and lower the pressure for a few seconds. A strong cough helps clear the contrast.',
          ],
          look: 'This is the LAO view, from the patient\'s left front. Amber tags follow the RCA from its start, around the right side of the heart, to its far segment underneath. Two more mark the conus branch and the acute marginal branch to the right ventricle.',
          show: { camera: 'LAO', highlight: ['rca-proximal', 'rca-mid', 'rca-distal', 'conus-branch', 'am-branch'] },
          roleNote: {
            3: 'Watch the pressure trace closely as the catheter engages: a small RCA can wedge the tip without warning.',
            4: 'Watch for a slow rate, pauses and a falling pressure after each RCA injection, prompt a cough when the operator asks, and have atropine ready to give on order.',
          },
          more: ['cl-view-rca-lao', 'rca-proximal', 'cl-cath-jr4'],
        },
        {
          title: 'The crux',
          text: [
            'Neither of those views opens the crux, where the far RCA parts into the PDA and the posterolateral branches, which run on to the back of the left ventricle. In LAO the PDA runs toward the detector and is foreshortened. In RAO the posterolateral branches overlap.',
            'The answer is to tip the detector toward the head: AP cranial, about 25°, or LAO cranial in some patients. It is the working view for a narrowing at the crux. As with every cranial view, it needs a deep held breath, because the crux sits right on the diaphragm.',
          ],
          look: 'This is LAO cranial; the app has no AP cranial preset. Through the see-through heart, amber tags mark the far RCA on the underside and the two branches it divides into: the PDA and the posterolateral branch.',
          show: { camera: 'LAO Cr', highlight: ['rca-distal', 'pda', 'posterolateral-branch'] },
          check: {
            kind: 'choice',
            question: 'After stenting the far RCA, the operator wants to confirm that both the PDA and the posterolateral branch still fill. Which view opens that division?',
            options: ['AP cranial', 'LAO with no tilt', 'RAO with no tilt', 'RAO caudal'],
            answer: 0,
            explain: 'A cranial tilt opens the crux and separates the PDA from the posterolateral branches. Straight LAO foreshortens the PDA, and in straight RAO the posterolateral branches overlap, so a lost branch could be missed in either. RAO caudal is a view of the left coronary.',
          },
          more: ['cl-view-rca-rao', 'cl-view-rca-cranial', 'pda'],
        },
        {
          title: 'Check yourself: which artery?',
          text: [
            'The heart is solid again and painted by the artery that feeds each part, with name tags on the main artery segments. The operator calls for RAO caudal: the detector at the patient\'s right, tipped toward the feet.',
            'Which artery is that view mainly used to lay out? Tap one of its name tags. Turn the heart if the tag is out of sight.',
          ],
          show: { heart: 'territories', camera: 'Front', labels: true },
          check: {
            kind: 'tap',
            question: 'Tap a name tag on the artery that RAO caudal lays out best (any part of it).',
            targets: ['lcx-proximal', 'lcx-distal', 'om1', 'om2'],
            explain: 'RAO caudal lays out the circumflex and its obtuse marginals along their length. Beyond its first part the LAD is foreshortened there and is judged in the cranial views. The RCA has its own LAO and RAO views.',
          },
          more: ['cl-view-rao-caudal', 'cl-angio-basics', 'lcx-proximal'],
        },
      ],
    },

    // ─── 5 ───────────────────────────────────────────────────────────────
    {
      id: 'pressures',
      title: 'Pressures and numbers',
      goal: 'Read the arterial waveform, recognize a damped or ventricularized trace, and use the LVEDP, ACT, FFR and iFR numbers.',
      minutes: 9,
      steps: [
        {
          title: 'The arterial waveform',
          text: [
            'A catheter is a tube full of fluid, so the pressure at its tip travels down it to a transducer, a sensor that turns pressure into a tracing. With the tip in the aorta, or at the mouth of a coronary artery, that tracing is the arterial waveform.',
            'Each beat has four parts. A steep upstroke as the left ventricle opens the aortic valve. A peak, the systolic pressure. A small notch, the dicrotic notch, as the aortic valve snaps shut. Then a slow fall while blood runs off to the body, down to the lowest point, the diastolic pressure.',
            'A normal trace is tall, sharp and notched. Learn that shape: the catheter\'s warnings are changes in it.',
          ],
          look: 'Follow the red line, the aortic pressure. It climbs at the dashed line marked AO (aortic valve opens), peaks, dips in a small notch at AC (aortic valve closes), then slides down until the next beat.',
          show: { ecg: 'wiggers', heart: false, rhythm: 'normal-sinus', hr: 70, speed: 0.5 },
          check: {
            kind: 'choice',
            question: 'What does the dicrotic notch on the arterial waveform mark?',
            options: ['The aortic valve closing', 'The aortic valve opening', 'The mitral valve closing', 'The atria squeezing'],
            answer: 0,
            explain: 'The notch is the small rebound in pressure as the aortic valve shuts at the end of ejection. On the chart it sits at the line marked AC. The valve opens earlier, at the foot of the upstroke.',
          },
          roleNote: {
            3: 'Level the transducer at the height of the heart and zero it to air before the first measurement and after any table or patient move. Each centimeter off level changes every reading by about 0.74 mmHg.',
          },
          more: ['cl-aortic-waveform', 'cl-transducer'],
        },
        {
          title: 'Damping: round and small',
          text: [
            'When a catheter engages a coronary artery, the pressure from its tip should not change. If the tip plugs the opening, blood can no longer flow freely past it, and the waveform shows it.',
            'A damped trace loses its notch and turns rounded and smaller, with a lower systolic pressure than before. Common causes are a narrowing right at the ostium, a tip pushed in too deep, a small or spasming artery, or a tip against the wall. A kink, a bubble or a clot in the line can do the same.',
            'Damping is not a low blood pressure. The patient\'s pressure is unchanged; the catheter is reading from a blocked artery.',
          ],
          look: 'Find the sharp peak and the notch on the red line. In a damped trace both are gone: the peak is lower and the whole wave is rounded.',
          more: ['cl-damped'],
        },
        {
          title: 'Ventricularization: the floor drops',
          text: [
            'The second warning shape is ventricularization. The systolic pressure stays close to normal but the diastolic pressure falls, so the trace from the catheter looks like the pressure inside a ventricle instead of an artery.',
            'It means the same thing as damping: the tip is blocking the artery it sits in, most often at a narrowed ostium, in a small right coronary or in its conus branch.',
          ],
          look: 'Compare the red aortic line with the yellow left ventricle line. Both reach about the same peak. Between beats the red line stays high while the yellow one drops to the floor. A ventricularized trace keeps the peak and loses the floor.',
          check: {
            kind: 'choice',
            question: 'As a catheter engages, its trace keeps a systolic pressure of 118 mmHg but the diastolic falls from 75 to 20 mmHg. What is this?',
            options: [
              'A ventricularized trace: the tip is blocking the artery',
              'A damped trace: rounded, with a lower peak',
              'A true fall in the patient\'s blood pressure',
              'A normal change on engaging a coronary artery',
            ],
            answer: 0,
            explain: 'Systolic kept, diastolic collapsed: the trace has taken the shape of a ventricle\'s pressure. A damped trace would be rounded with a lower peak. A true fall in blood pressure lowers the whole wave without changing its shape. Engaging a coronary artery should not change the trace at all.',
          },
          more: ['cl-damped', 'cl-cath-jr4'],
        },
        {
          title: 'Damped or ventricularized: do not inject',
          text: [
            'Both shapes carry one rule: no injection. Contrast forced through a wedged tip can tear the artery wall, push air or clot down the artery, or set off ventricular fibrillation (VF), the chaotic rhythm of cardiac arrest. The right coronary and its conus branch are the classic places.',
            'The action is always the same. Whoever sees it says "damped" or "ventricularized" aloud. The operator eases the catheter back until the normal waveform returns. Only then is blood drawn back through the catheter, the line flushed and the injection made.',
            'Re-zeroing does not fix it, because nothing is wrong with the zero. Look at the pressure before every single injection: it is the last chance to catch a wedged catheter.',
          ],
          check: {
            kind: 'choice',
            question: 'The JR4 engages the right coronary and the trace turns small and rounded, with no notch. The injection syringe is ready. What is the first move?',
            options: [
              'Say "damped" aloud: nobody injects yet',
              'Give a small test injection to see where the tip is',
              'Re-zero the transducer',
              'Flush the catheter hard to clear it',
            ],
            answer: 0,
            explain: 'A damped trace means the tip is wedged. Even a small test injection, or a hard flush, drives fluid into a blocked artery and can cause a tear or VF. Re-zeroing changes the number, not the wedge. The call-out comes first, then the operator repositions.',
          },
          roleNote: {
            3: 'Watch the trace at every engagement and before every injection, and call a change at once by name. Nothing is injected until the operator clears it.',
            4: 'While a catheter is engaged, watch the patient and the ECG for chest pain, ST change, slowing or VF, and keep the defibrillator ready.',
            5: 'If the trace damps at every engagement, suspect a narrowing at the ostium: consider a smaller catheter, one with side holes, or a non-selective injection.',
          },
          more: ['cl-damped', 'cl-comp-dissection', 'ventricular-fibrillation'],
        },
        {
          title: 'LVEDP: how full, how stiff',
          text: [
            'With a pigtail catheter in the left ventricle, the trace is the ventricle\'s own pressure: a tall systolic peak, a fall almost to zero, then a slow rise as the chamber fills.',
            'The left ventricular end-diastolic pressure (LVEDP) is the pressure at the end of filling, right before the ventricle squeezes. On the tracing it is read after the small bump of the atrial kick (the atria topping up the ventricle) and before the steep upstroke, in line with the R wave, the tall spike of the ECG.',
            'Normal is about 12 mmHg or less. Above about 18 mmHg the filling pressure is clearly high: the ventricle is overfilled, stiff or failing. It is measured before any contrast goes into the ventricle, because contrast raises it.',
          ],
          look: 'Follow the yellow line, the left ventricle. Find the point right before it shoots upward at the dashed line marked MC: that level is the LVEDP. The line of text that starts "Model" next to the chart gives its value.',
          check: {
            kind: 'choice',
            question: 'Where on the left ventricle\'s trace is the LVEDP read?',
            options: [
              'After the atrial kick, before the upstroke',
              'At the lowest point, early in diastole',
              'At the top of the systolic peak',
              'At the dicrotic notch',
            ],
            answer: 0,
            explain: 'End-diastole is the moment filling ends, in line with the R wave. The lowest point comes earlier, as the ventricle relaxes, and is close to zero in almost everyone, so reading there hides a high filling pressure. The dicrotic notch belongs to the arterial trace.',
          },
          more: ['cl-lvedp', 'cl-cath-pigtail'],
        },
        {
          title: 'A high LVEDP changes the plan',
          text: [
            'This is the same chart in a failing left ventricle. The chamber is large and empties poorly, so it starts each beat already full, and the pressure at the end of filling is high.',
            'The number guides the case. A high LVEDP warns that more fluid, or a large contrast injection into the ventricle, could push fluid into the lungs, so the operator may skip the ventriculogram and limit contrast. A low one, after a long fast, calls for more fluid. In the POSEIDON trial, matching the IV fluid rate to the LVEDP cut kidney injury from contrast.',
          ],
          look: 'The yellow line now starts its upstroke from a much higher level, and the blue left atrial line rides high with it. The "Model" line now reads an LVEDP of about 24 mmHg, against about 9 in the last step.',
          show: { rhythm: 'hfref' },
          check: {
            kind: 'choice',
            question: 'The pigtail is in the ventricle and the LVEDP reads 28 mmHg. The injector is set for a ventriculogram. What should the monitoring tech do?',
            options: [
              'Call out the number before the injection',
              'Record it and report it after the ventriculogram',
              'Ask the nurse to speed up the IV fluid',
              'Re-zero until the reading is below 12 mmHg',
            ],
            answer: 0,
            explain: 'A very high LVEDP changes what the operator does next, so it is reported before the injection, not after. More fluid is the wrong direction for an overfilled ventricle. Re-zeroing is for a line that was set up wrongly, not for a number you did not expect.',
          },
          roleNote: {
            3: 'Record the LV pressure on a zeroed, leveled channel, mark end-diastole at the R wave, and report the LVEDP before the ventriculogram.',
            4: 'Set the IV fluid rate from the LVEDP on order, and watch for breathlessness and a falling oxygen saturation.',
            5: 'With a very high LVEDP, consider skipping the ventriculogram and limiting contrast and fluid.',
          },
          more: ['cl-lvedp', 'cl-drug-contrast', 'hfref'],
        },
        {
          title: 'ACT: is the blood thin enough?',
          text: [
            'Blood clots on wires, balloons and stents unless a blood thinner is on board, usually heparin. The activated clotting time (ACT) is a bedside test of how many seconds a blood sample takes to clot. Without heparin it is roughly 90–140 seconds.',
            'For PCI with heparin alone the target is about 250–300 seconds, or 300–350 on Hemochron machines, which read higher. When a glycoprotein IIb/IIIa inhibitor (a strong IV antiplatelet drug) is also given, the target is lower: 200–250 seconds.',
            'The ACT is checked about 5 minutes after the heparin and before the coronary wire crosses, then every 20–30 minutes. Before a femoral sheath is pulled it should be back below about 150–180 seconds.',
          ],
          show: { heart: 'external', camera: 'Front', ecg: false, rhythm: 'normal-sinus', hr: 70, speed: 1 },
          check: {
            kind: 'choice',
            question: 'Heparin alone has been given, and the lab\'s machine uses the 250–300 second target. Which ACT says the wire can cross?',
            options: ['135 seconds', '190 seconds', '270 seconds', 'Any value, as long as the heparin was given'],
            answer: 2,
            fixed: true,
            explain: '270 seconds is inside 250–300. A result of 135 looks like blood with no heparin in it: check that the full dose went in and the IV is running. 190 is too low for heparin alone. The dose is confirmed by the test, never assumed.',
          },
          roleNote: {
            3: 'Draw the sample after discarding the dead space, clear of the heparinized flush, and read the result back to the operator and the nurse.',
            4: 'Give each heparin dose on order, record every ACT with its time and the dose given, and check the ACT before a femoral sheath comes out.',
            5: 'Set the target for the drugs and the machine in use, and order further doses to hold it in long cases.',
          },
          more: ['cl-act', 'cl-drug-heparin', 'heparin'],
        },
        {
          title: 'The pressure wire',
          text: [
            'An angiogram shows how narrow an artery looks, not whether the narrowing starves the muscle. A pressure wire answers that. It is a 0.014 inch coronary wire with a pressure sensor near its tip.',
            'The sensor is parked well beyond the narrowing and reads the pressure there, called Pd (distal pressure). The guide catheter reads the pressure in front of the narrowing, in the aorta, called Pa. If the narrowing does not matter, the two are almost equal. If it does, Pd falls behind.',
            'The result is the ratio Pd ÷ Pa. Before crossing, the two readings are matched with the sensor at the guide\'s tip (equalizing). At the end the sensor is drawn back there to confirm the ratio returns to 1.00, give or take 0.02: the drift check.',
          ],
          look: 'The surface is colored by the artery that feeds it, with the LAD\'s territory in green. The middle of the LAD is ringed: picture the narrowing there. The guide reads Pa upstream, at the mouth of the artery.',
          show: { heart: 'territories', structure: 'lad-mid', ecg: false },
          check: {
            kind: 'tap',
            question: 'Tap the name tag of the LAD segment where the wire\'s sensor should sit to test this mid-LAD narrowing.',
            targets: ['lad-distal'],
            explain: 'The sensor has to be beyond the narrowing, ideally in the far third of the artery, so that it feels the whole pressure loss. Parked in the first segment it sits upstream and reads the same as the guide, whatever the narrowing is doing.',
          },
          roleNote: {
            3: 'When the operator holds the sensor at the guide tip, equalize the two pressures on the console before the wire crosses, and check the drift when the sensor returns there. A ratio outside 0.98–1.02 means the reading cannot be trusted.',
          },
          more: ['cl-ffr', 'ffr-ifr', 'lad-mid'],
        },
        {
          title: 'FFR and iFR: the cut-offs',
          text: [
            'Fractional flow reserve (FFR) is Pd ÷ Pa measured while a drug, adenosine, opens the small vessels of the heart to maximum flow. A healthy artery reads 1.00. An FFR of 0.80 or less means the narrowing limits flow and is worth treating. Above 0.80 it can be left alone and treated with medication.',
            'The instantaneous wave-free ratio (iFR) is read from the same wire at rest, during a quiet part of diastole (the phase when the heart relaxes and fills), with no adenosine. Its cut-off is different: 0.89 or less is significant.',
            'Both depend on a clean pressure from the guide. A guide seated deep enough to damp its own trace gives a falsely high, falsely reassuring result.',
          ],
          look: 'The ring has gone and the heart is back in view from the front. The green territory is the muscle a narrowing in the LAD would starve.',
          show: { camera: 'Front' },
          check: {
            kind: 'choice',
            question: 'Which of these results says the narrowing limits blood flow?',
            options: ['FFR 0.78', 'FFR 0.86', 'iFR 0.93', 'iFR 0.91'],
            answer: 0,
            explain: 'FFR is significant at 0.80 or less, and iFR at 0.89 or less. An FFR of 0.86 and iFR values of 0.91 and 0.93 are all above their cut-offs. The two scales differ: 0.86 would be abnormal for iFR but is normal for FFR, so always say which one you are reading out.',
          },
          roleNote: {
            4: 'Before IV adenosine, screen for asthma, high-grade AV block, a low blood pressure and recent caffeine. Warn the patient about flushing, chest tightness and breathlessness: they pass within a minute or two of stopping.',
            5: 'Avoid pressure ratios in the artery that caused an ST-elevation heart attack (STEMI), and weigh borderline values with the symptoms and the size of the territory.',
          },
          more: ['cl-ffr', 'cl-ifr', 'cl-drug-adenosine-ffr'],
        },
      ],
    },

    // ─── 6 ───────────────────────────────────────────────────────────────
    {
      id: 'when-it-goes-wrong',
      title: 'When it goes wrong',
      goal: 'Recognize five lab emergencies by how each first shows itself, and make your own role\'s first move.',
      minutes: 10,
      steps: [
        {
          title: 'Trouble shows on the monitor first',
          text: [
            'Most emergencies in the lab show on the screen before anyone feels them: a rhythm changes, a pressure falls, an ST segment moves. A team that knows the starting picture sees the change at once.',
            'This patient has come in with a heart attack from a blocked right coronary artery (RCA). The ST segment, the stretch right after each QRS, is raised in the leads that face the underside of the heart.',
            'Whatever happens next, the first move is the same for every role: say what you see, out loud, to the operator by name.',
          ],
          look: 'You are looking at the heart from below. The underside and the right ventricle pulse purple: muscle starved by the blocked RCA. On the 12-lead, find the leads where the ST segment sits above the baseline.',
          show: { heart: 'external', camera: 'Bottom', ecg: 'ecg', layout: 'simultaneous', rhythm: 'inferior-stemi', focus: 'ecg' },
          check: {
            kind: 'lead',
            question: 'Tap a lead where the ST segment is raised.',
            targets: ['II', 'III', 'aVF'],
            explain: 'Leads II, III and aVF face the underside (inferior wall) of the heart, which the RCA feeds in most people. Leads I and aVL face the other way and show the mirror image, an ST segment below the baseline. During an RCA case, ST that rises again in II, III and aVF after the artery was opened means it has closed, or flow has stalled.',
          },
          more: ['inferior-stemi', 'cl-stemi-system'],
        },
        {
          title: 'Reperfusion rhythms: the harmless one',
          text: [
            'Reperfusion means blood returning to muscle that was cut off. The moment the wire or balloon reopens the artery, that muscle is electrically irritable, and rhythms from the ventricles are common.',
            'The usual one is accelerated idioventricular rhythm (AIVR): a run of wide, regular beats at about 50–120 a minute, close to the patient\'s own rate. The patient stays awake and the pressure holds. It usually means flow is back, it stops by itself, and it is left alone. Drugs that suppress it can leave no rhythm at all.',
            'Check the pressure before naming any wide rhythm. A wide rhythm at 80 a minute with a good pressure is AIVR, not ventricular tachycardia (VT), the fast, dangerous rhythm from the ventricles.',
          ],
          look: 'The artery is open: the purple pulsing has stopped, and in lead II the ST segment is back near the baseline with the T wave now upside down. AIVR itself is not drawn here: picture a run of wide beats at about this rate.',
          show: { rhythm: 'inferior-stemi-reperfused', layout: 'monitor', camera: 'Bottom', focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'Seconds after the balloon opens the artery, the monitor shows a wide, regular rhythm at 85 a minute. The patient is talking and the arterial pressure is 118/70 mmHg. What is the right response?',
            options: [
              'Call it out and watch: this is AIVR and needs no drug',
              'Shock at once: any wide rhythm is ventricular tachycardia',
              'Ask for a drug to suppress it, such as amiodarone',
              'Start chest compressions',
            ],
            answer: 0,
            explain: 'Wide, regular, about 50–120 a minute, with the patient awake and a good pressure, is AIVR: a marker of returning flow that ends by itself. Ventricular tachycardia is faster and the pressure usually falls. Suppressing AIVR risks leaving the patient with no rhythm.',
          },
          roleNote: {
            3: 'In every heart-attack case, have the defibrillator pads on and connected before the wire crosses. Call the new rhythm and read out the pressure.',
            4: 'Confirm that the patient is awake and has a pressure. Give no antiarrhythmic drug unless it is ordered.',
            5: 'Leave AIVR alone and finish the case. Do not suppress it with amiodarone or lidocaine.',
          },
          more: ['cl-comp-reperfusion-arrhythmia', 'monomorphic-vt'],
        },
        {
          title: 'Reperfusion rhythms: the lethal one',
          text: [
            'Ventricular fibrillation (VF) can strike at the same moment. The ventricles quiver instead of pumping, the arterial pressure trace goes flat, and the patient loses consciousness within seconds.',
            'In the lab VF is seen the instant it starts, with pads already on. The treatment is a shock, at once. Drugs come second. Most VF in the lab ends with the first shock, and the patient wakes within seconds. If the arterial trace shows no pulse after the shock, chest compressions start immediately.',
          ],
          look: 'The tracing is chaotic, with no P waves, QRS complexes or T waves to pick out. On the heart the ventricles quiver instead of squeezing, and the cardiac cycle box says "Fibrillation".',
          show: { rhythm: 'vf', camera: 'Front', focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'VF appears on the monitor during a heart-attack case. The pads are on. What happens first?',
            options: [
              'A shock, at once',
              'Amiodarone, then a shock if it fails',
              'Two minutes of chest compressions, then a rhythm check',
              'A 12-lead ECG to confirm the rhythm',
            ],
            answer: 0,
            explain: 'VF that is witnessed with pads on is shocked immediately: a shock within seconds works far better than any drug. Compressions start if the shock does not bring back a pulse. Waiting for a drug or a 12-lead costs heart and brain.',
          },
          roleNote: {
            3: 'Call "VF" and charge the defibrillator. Deliver the shock on the operator\'s command, or as your training and facility policy allow.',
            4: 'Be ready to start compressions if the shock fails, give the arrest drugs on order or by protocol, and record the times of each shock and drug.',
            5: 'Call for the shock without delay, then finish opening the artery: the cause is in the vessel. For VF that keeps returning, give amiodarone or lidocaine and correct potassium and magnesium.',
          },
          more: ['cl-comp-reperfusion-arrhythmia', 'ventricular-fibrillation', 'defibrillation'],
        },
        {
          title: 'The Bezold–Jarisch reflex',
          text: [
            'Reopening the right coronary can trigger a reflex instead of a fast rhythm. Nerve endings in the underside of the left ventricle fire through the vagus nerve, the nerve that slows the heart. The heart slows and the blood vessels relax together, so the pressure falls further than the slow rate alone explains. This is the Bezold–Jarisch reflex.',
            'It shows within seconds of flow returning: a sudden slow rhythm, a falling pressure, nausea, yawning, sweating, a patient who says they feel faint.',
            'It usually passes within minutes. Atropine speeds the heart and fluid restores the pressure, both on order, and pacing (driving the heart with small electrical pulses) is ready if the rate does not recover. The operator also looks at the artery, because a new blockage can look the same on the monitor.',
          ],
          look: 'The same patient, seconds after the artery opened. The heart now beats only about 40 times a minute. On the tracing the rhythm is still sinus, with a P wave before every QRS.',
          show: { rhythm: 'inferior-stemi-reperfused', hr: 40, camera: 'Front', focus: 'heart' },
          check: {
            kind: 'tap',
            question: 'Tap a name tag on the artery whose reopening classically sets off this reflex (any part of it).',
            targets: ['rca-proximal', 'rca-mid', 'rca-distal', 'pda', 'posterolateral-branch', 'am-branch'],
            explain: 'The right coronary artery feeds the underside of the left ventricle, where the nerve endings behind the reflex sit, and usually the AV node as well. That is why slow rhythms belong to RCA cases, and fast ventricular rhythms more often to the LAD.',
          },
          roleNote: {
            3: 'Call out the falling rate and pressure at once. Have the pacing pads connected and a temporary pacing wire and a venous sheath within reach.',
            4: 'Give atropine and a fluid bolus on order and raise the legs. Talk to the patient, and recheck the rate and pressure every minute.',
            5: 'Atropine may restore the rate but not the vessel tone: give fluid too, avoid nitrates when the right ventricle is involved, and look at the artery.',
          },
          more: ['cl-comp-bezold', 'cl-drug-atropine', 'cl-temp-wire'],
        },
        {
          title: 'No-reflow',
          text: [
            'Sometimes the artery is open and the stent looks perfect, yet contrast crawls down the vessel or stalls. This is no-reflow. The blockage has moved downstream, into vessels too small to see, plugged by debris, clot and spasm.',
            'It shows on the angiogram first, as slow flow, and then on the monitor: the ST segments rise again, the chest pain returns, and the pressure or the heart rate may fall.',
            'Another balloon or stent will not fix it and can make it worse. After ruling out a tear, a clot or a wedged guide, the operator delivers a vessel-relaxing drug (adenosine, verapamil or nitroprusside) far down the artery. Meanwhile the team keeps the blood pressure up, because flow through the damaged muscle depends on it.',
          ],
          look: 'The purple pulsing is back, and the ST segment in lead II is raised again. The large artery is open, but the muscle it feeds is still starved.',
          show: { rhythm: 'inferior-stemi', camera: 'Bottom', focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'After a stent, contrast moves slowly down the artery and stalls. The stent looks fully open and there is no tear. The ST segments rise again. What is this?',
            options: [
              'No-reflow in the small vessels',
              'The stent has clotted shut',
              'A coronary perforation',
              'A normal finding right after stenting',
            ],
            answer: 0,
            explain: 'An open artery with slow flow and returning ST elevation is no-reflow. A clotted stent shows a cut-off inside the stent, and a perforation shows contrast outside the vessel. Slow flow is never normal: call it out along with the ST change.',
          },
          roleNote: {
            3: 'Call out slow flow, returning ST elevation and any fall in pressure. Have a microcatheter or aspiration catheter ready to hand over, and log the drugs and times.',
            4: 'Prepare and label each intracoronary drug on order: the diluted syringes look identical. Support the pressure as ordered, and watch for heart block after each dose.',
            5: 'Rule out dissection, thrombus and a wedged guide, deliver the vasodilator distally, and use epinephrine instead when the pressure is low.',
          },
          more: ['cl-comp-no-reflow', 'cl-drug-ic-adenosine'],
        },
        {
          title: 'Perforation',
          text: [
            'A perforation is a hole through the wall of a coronary artery. It can follow an oversized or high-pressure balloon, a stent, or a wire tip pushed out through a small end branch.',
            'It shows on the angiogram: contrast outside the outline of the vessel, as a stain, a blush or a jet. The patient may have sudden, sharp chest pain.',
            'The first move is the operator\'s, and it is mechanical: a balloon is inflated across the hole at low pressure and kept up for 5–10 minutes to plug the leak. Everything else happens around that balloon. Surgery is called, the echo (heart ultrasound) machine comes in, the tray for draining the pericardium (the sac around the heart) is opened, and any glycoprotein IIb/IIIa inhibitor, a strong IV antiplatelet drug, is stopped.',
          ],
          look: 'One artery, the LAD, is tagged in amber as an example. Blood that leaks from any coronary artery collects in the pericardium around the heart and has nowhere else to go.',
          show: { rhythm: 'normal-sinus', hr: 90, camera: 'Front', labels: false, highlight: ['lad-proximal', 'lad-mid', 'lad-distal'], focus: 'heart' },
          check: {
            kind: 'choice',
            question: 'Contrast is seen streaming out of the artery after a balloon inflation. What does the operator do first?',
            options: [
              'Inflate a balloon over the hole',
              'Give protamine to reverse the heparin',
              'Remove the wire and the guide',
              'Open a covered stent and deliver it',
            ],
            answer: 0,
            explain: 'The balloon goes up first: it stops the bleeding within seconds and buys time. Reversing the heparin with protamine, and sealing the hole for good with a covered stent (a stent wrapped in a thin membrane), come after the leak is controlled. The wire is not pulled, because it is the path back to the hole.',
          },
          roleNote: {
            3: 'Call out contrast outside the vessel the moment you see it. Hand over the balloon, covered stent or coils as asked, open the pericardial drainage tray, bring in the echo machine and watch the pressure.',
            4: 'Stop any IIb/IIIa inhibitor infusion, open the fluids, and give protamine and pressors on the operator\'s order. Call cardiac surgery when asked.',
            5: 'Balloon first. Then weigh protamine against clot in a fresh stent, and choose a covered stent for a large vessel or coils for a small end branch.',
          },
          more: ['cl-comp-perforation', 'cl-stent-covered', 'cl-drug-protamine'],
        },
        {
          title: 'Tamponade',
          text: [
            'Blood that leaks into the pericardium squeezes the heart from outside, so it cannot fill. This is tamponade. When the bleeding is fast, as little as 100–200 mL is enough, because the sac has no time to stretch.',
            'It shows in the pressures: the arterial pressure falls, the heart rate climbs, and the gap between systolic and diastolic narrows. The systolic pressure also dips with each breath in. On the X-ray screen the edge of the heart stops moving.',
            'The treatment is to drain the blood through a needle and tube guided by echo (pericardiocentesis) while the hole is kept sealed. IV fluid and pressors, drugs that raise the blood pressure, only buy minutes.',
          ],
          look: 'The red aortic line is low, with peaks close to troughs: the BP box reads about 88/68. The peaks also sag a few mmHg and recover as the patient breathes. The small, alternating QRS complexes fit a large, slow effusion; in the lab they are often absent.',
          show: { rhythm: 'tamponade', ecg: 'wiggers', heart: false, labels: true },
          check: {
            kind: 'choice',
            question: 'Ten minutes after a difficult stent, the arterial pressure has drifted from 120/70 to 84/66 mmHg and the heart rate from 80 to 115 a minute. On the X-ray screen the edge of the heart has stopped moving. What do you suspect?',
            options: ['Tamponade from a perforation', 'A vagal reaction', 'A contrast reaction', 'The Bezold–Jarisch reflex'],
            answer: 0,
            explain: 'A falling pressure with a rising rate, a narrow gap between systolic and diastolic, and a still heart border is tamponade until proven otherwise. A vagal reaction and the Bezold–Jarisch reflex slow the heart. A contrast reaction can also give a low pressure with a fast rate, but it brings hives or wheeze, and the heart border still moves.',
          },
          roleNote: {
            3: 'Call out the falling pressure and the rising rate. Open and set up the pericardiocentesis tray, bring in the echo machine, and record the volume drained.',
            4: 'Open the fluids, give pressors on order, get blood products ready as ordered, and keep talking to the patient.',
            5: 'Do not wait for swollen neck veins or muffled heart sounds: in the lab often only the pressures change. Drain under echo guidance and keep the source sealed.',
          },
          more: ['cl-comp-tamponade', 'cardiac-tamponade', 'pericardiocentesis'],
        },
        {
          title: 'Contrast reaction',
          text: [
            'Contrast can set off an allergic-like reaction, usually within minutes of an injection. Mild ones are a few hives or an itch. Severe ones threaten life: a low blood pressure with a fast heart rate, swelling of the throat with noisy breathing, or wheeze with a falling oxygen level.',
            'The first moves: stop the contrast, call it out and call for help. For a severe or worsening reaction epinephrine is the first drug, backed by fluid and oxygen. Antihistamines and steroids come second and never replace it.',
            'Not every low pressure after contrast is an allergy. A low pressure with a slow heart rate, pallor and nausea, and no hives or wheeze, is more likely a vagal reaction, which is treated differently.',
          ],
          look: 'The monitor shows a fast, regular rhythm with normal P waves: sinus tachycardia. A fast rate with a low pressure after contrast fits an allergic-like reaction. A slow rate points to a vagal one.',
          show: { rhythm: 'sinus-tachycardia', hr: 128, heart: 'external', camera: 'Front', ecg: 'ecg', layout: 'monitor', focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'Three minutes after an injection the pressure is 72/40 mmHg and the heart rate is 46 a minute. The patient is pale and nauseated, with no rash and clear breathing. What is most likely?',
            options: ['A vagal reaction', 'A severe contrast reaction', 'Tamponade', 'Ventricular fibrillation'],
            answer: 0,
            explain: 'A low pressure with a slow rate, pallor and nausea, and without hives, swelling or wheeze, points to a vagal reaction: legs up, with fluid and atropine on order. A severe contrast reaction and tamponade both drive the heart rate up. Call out the rate along with the pressure, because the rate is what separates them.',
          },
          roleNote: {
            3: 'Stop the injector and all contrast, call out the reaction, bring the crash cart and airway equipment, and record the times.',
            4: 'Assess the airway, breathing and pressure. For a severe reaction give epinephrine first, on order or by your anaphylaxis protocol, with fluid and oxygen.',
            5: 'Grade the reaction, order epinephrine early for a low pressure, noisy breathing or severe wheeze, and write the plan for any future contrast.',
          },
          more: ['cl-comp-contrast-reaction', 'cl-drug-anaphylaxis', 'cl-comp-vasovagal'],
        },
        {
          title: 'One habit for all of them',
          text: [
            'Five emergencies, five different treatments, one shared start. Each was caught by someone who knew the starting picture, saw it change and said so at once.',
            'Slow and low after the right coronary opens: think reflex. Fast and low: think bleeding, tamponade or a reaction to contrast. Chaos on the monitor: shock. ST rising again: look at the flow. Contrast outside the vessel: balloon.',
            'Your role sets what you do next. A tech calls it and readies the equipment. A nurse assesses the patient and gives what is ordered. The physician decides. Nobody stays silent.',
          ],
          show: { rhythm: 'normal-sinus', focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'Which finding should make the team think of bleeding or tamponade rather than a reflex?',
            options: [
              'A falling pressure with a rising heart rate',
              'A falling pressure with a falling heart rate',
              'A wide, regular rhythm at 80 a minute with a good pressure',
              'A few seconds of slowing right after an RCA injection',
            ],
            answer: 0,
            explain: 'Blood loss and tamponade make the heart speed up to keep its output going. The reflexes (vagal, Bezold–Jarisch) slow it. A wide rhythm at 80 with a good pressure is AIVR, and brief slowing after an RCA injection is common and passes with a cough.',
          },
          more: ['cl-closed-loop', 'cl-lab-roles', 'tamponade'],
        },
      ],
    },
  ],
};
