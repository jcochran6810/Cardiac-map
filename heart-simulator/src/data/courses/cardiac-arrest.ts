import type { Course } from '@/types/course';

/**
 * Course: cardiac arrest and the defibrillator — recognizing an arrest, high-quality CPR, the four
 * arrest rhythms, the two-minute ALS cycle, the reversible causes, care after the pulse returns, and
 * the unstable patient who still has a pulse.
 *
 * Numbers follow the 2025 AHA Guidelines for CPR and ECC (energies, doses, targets, sequence).
 * Role notes stay inside each role's scope (lib/scope.ts): the EMT does CPR and uses the AED.
 * Educational content only.
 */
export const CARDIAC_ARREST: Course = {
  id: 'cardiac-arrest',
  title: 'Cardiac arrest and the defibrillator',
  summary: 'Recognize a cardiac arrest, give CPR that works, know which rhythms a shock can fix, run the two-minute cycle, find the cause and protect the patient once the pulse is back. With a working monitor-defibrillator to practice on.',
  roles: [1, 2, 4],
  level: 'core',
  lessons: [
    // ─── 1 ───────────────────────────────────────────────────────────────
    {
      id: 'recognize-and-start',
      title: 'Recognize it and start',
      goal: 'Recognize cardiac arrest within 10 seconds, start CPR, send for the defibrillator and explain why every minute counts.',
      minutes: 7,
      steps: [
        {
          title: 'What cardiac arrest is',
          text: [
            'Cardiac arrest means the heart has stopped pumping blood. No blood reaches the brain, so the person collapses and stops responding within seconds.',
            'It is not the same as a heart attack. In a heart attack an artery of the heart is blocked, but the heart keeps beating and the patient is usually awake. A heart attack can lead to a cardiac arrest, and so can many other things.',
          ],
          look: 'This heart is beating normally. The blue and red dots are blood moving through it with every beat. Remember this picture: it is what you are trying to get back.',
          show: { heart: 'sectioned', flow: true, rhythm: 'normal-sinus' },
        },
        {
          title: 'When the pump stops',
          text: [
            'A sudden collapse often starts as ventricular fibrillation (VF). The electrical signals in the ventricles, the two pumping chambers, turn chaotic, and the muscle quivers instead of squeezing.',
            'The heart is still full of blood and still using oxygen, but nothing is pushed out. The brain is without blood flow from the first second and is damaged within minutes.',
          ],
          look: 'The same heart in VF. The walls only quiver, the dots have all but stopped, and the Cardiac cycle box reads "Fibrillation — no effective contraction".',
          show: { rhythm: 'vf' },
          check: {
            kind: 'tap',
            question: 'Tap one of the chambers that should be pumping blood out and is only quivering.',
            targets: ['left-ventricle', 'right-ventricle', 'apex'],
            explain: 'The ventricles are the pumping chambers. In VF they quiver without squeezing, so no blood leaves the heart even though it is full. The atria above them only top the ventricles up; they cannot move blood to the body.',
          },
        },
        {
          title: 'Three findings, ten seconds',
          text: [
            'You recognize cardiac arrest from three findings: the person does not respond, is not breathing normally, and has no pulse that you can feel.',
            'Tap the shoulders and shout. Then watch the chest for breathing while you feel for the carotid pulse in the neck, both at the same time, for no more than 10 seconds.',
            'If you do not definitely feel a pulse within 10 seconds, treat it as cardiac arrest. Compressions on someone who turns out to have a pulse do little harm. Waiting on someone who has none costs them their brain.',
          ],
          look: 'The dots are still not moving. Every second spent checking is a second like this one, which is why the check is limited to 10 seconds.',
          check: {
            kind: 'choice',
            question: 'An unresponsive man is not breathing. After 10 seconds you are not sure whether you feel a pulse. What do you do?',
            options: [
              'Start chest compressions and send for the defibrillator',
              'Check for another 10 seconds to be certain',
              'Give two rescue breaths and check again',
              'Wait for the cardiac monitor before deciding',
            ],
            answer: 0,
            explain: 'If you are not sure there is a pulse within 10 seconds, start CPR. A longer check delays compressions, and rescuers under stress often believe they feel a pulse that is not there. A monitor cannot settle it either: it shows electricity, not a pulse.',
          },
        },
        {
          title: 'Gasping is not breathing',
          text: [
            'In the first minutes of an arrest many patients gasp: slow, noisy, irregular breaths, sometimes with a snore or a groan. These are agonal gasps, a reflex of a brain that is running out of oxygen.',
            'Gasping is not normal breathing. It moves almost no air, and it does not mean the heart is working. A brief stiffening or jerking at the moment of collapse, like a short seizure, is common too.',
            'Unresponsive with no breathing, or only gasping: treat it as cardiac arrest.',
          ],
          check: {
            kind: 'choice',
            question: 'A woman collapses in a store. She does not respond, and every 10 seconds or so she takes a snoring gasp. A bystander says, "She is still breathing." What is this?',
            options: [
              'Cardiac arrest: start CPR',
              'A seizure: protect her head and wait for it to pass',
              'A faint: raise her legs',
              'Normal breathing: roll her onto her side',
            ],
            answer: 0,
            explain: 'Slow, snoring gasps in an unresponsive person are agonal gasps, a sign of cardiac arrest. After a faint or a seizure a person breathes regularly and has a pulse. Mistaking gasps for breathing is one of the most common reasons CPR starts late.',
          },
        },
        {
          title: 'Two things at once',
          text: [
            'The moment you recognize an arrest, two things start together: chest compressions, and getting a defibrillator to the patient.',
            'Call for help out loud. Send a named person for the AED (automated external defibrillator) or the monitor-defibrillator, and have the emergency response activated: 911 outside a hospital, the code team inside one.',
            'Do not wait for equipment, a second opinion or a better position. The first compression should come within seconds of the decision.',
          ],
          look: 'The heart is still in VF and still full of blood. From this point on, your hands are the only thing that can move that blood.',
          roleNote: {
            1: 'On an ambulance crew, one of you starts compressions while the other brings the AED and the airway bag to the patient\'s side. Request ALS at once, per protocol.',
            2: 'Compressions start before the monitor is on. Your partner or the first crew on scene pushes while you attach the pads.',
            4: 'In the lab or a recovery bay: call the code per facility policy, start compressions and have the defibrillator brought to the bedside. If a case is in progress, tell the operator at once.',
          },
        },
        {
          title: 'Why every minute counts',
          text: [
            'In VF the chance of survival falls by about 7 to 10% for every minute that passes without CPR and a shock. Ten minutes with no help leaves almost no chance.',
            'CPR slows that fall. Compressions push a small but vital flow of blood through the brain and through the heart\'s own arteries, which keeps the heart muscle able to respond when the shock comes.',
            'CPR alone rarely ends VF. It buys time. The shock is what ends VF.',
          ],
          look: 'The bottom panel draws pressures. The red line is the pressure in the aorta: in VF it lies low and flat, and the BP box reads "no pulse". The green line at the top is the ECG: busy, but moving no blood.',
          show: { ecg: 'wiggers', focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'A bystander has done good CPR for 6 minutes on a man in VF. No defibrillator has arrived yet. What has the CPR achieved?',
            options: [
              'It has kept the brain and heart supplied, so a shock can still work',
              'It has probably converted the VF to a normal rhythm by now',
              'It has done nothing useful: only a shock helps in VF',
              'It has made the defibrillator unnecessary for the moment',
            ],
            answer: 0,
            explain: 'Compressions move enough blood to slow the damage and keep the heart able to respond to a shock. They rarely end VF by themselves, so the defibrillator is still needed as fast as it can be brought. Each one does a job the other cannot.',
          },
        },
        {
          title: 'The chain of survival',
          text: [
            'Survival depends on a chain of actions, each one handing on to the next: recognize the arrest and call for help, start CPR, defibrillate early, advanced life support, care after the pulse returns, and recovery.',
            'The 2025 AHA guidelines use one chain for every patient: adult or child, in a hospital or outside one. The early links decide the most, and they need no drugs and no advanced skills: recognition, CPR and an early shock.',
            'The rest of this course follows the chain, link by link.',
          ],
          look: 'The heart is beating again, with blood moving through it. That is the purpose of every link in the chain.',
          show: { rhythm: 'normal-sinus', ecg: false },
          check: {
            kind: 'choice',
            question: 'Which links of the chain do the most to decide whether a patient in VF survives?',
            options: [
              'Early recognition, CPR and an early shock',
              'A breathing tube and drugs through an IV',
              'Fast transport to the nearest hospital',
              'Temperature control after the pulse returns',
            ],
            answer: 0,
            explain: 'Recognition, CPR and early defibrillation save the most lives, and any trained rescuer can deliver them. Tubes, drugs and hospital care build on those links. None of them can make up for a late start.',
          },
          roleNote: {
            1: 'You hold the links that decide the most. High-quality CPR and a fast AED shock from an EMT crew do more for survival than anything that is added later.',
          },
          more: ['ventricular-fibrillation', 'defibrillation'],
        },
      ],
    },

    // ─── 2 ───────────────────────────────────────────────────────────────
    {
      id: 'high-quality-cpr',
      title: 'High-quality CPR',
      goal: 'Give chest compressions at the right rate and depth with full recoil and short pauses, and use the capnography number to judge them.',
      minutes: 8,
      steps: [
        {
          title: 'Your hands are the pump',
          text: [
            'In cardiac arrest, chest compressions are the circulation. Each push on the breastbone squeezes the heart against the spine and raises the pressure inside the chest, and blood moves forward. Each release lets the chest spring back and the heart refill.',
            'Even very good CPR moves only a fraction of the blood a beating heart does. That fraction keeps the brain and the heart muscle alive, but only while every compression is a good one.',
            'Kneel or stand close, with the patient on a firm surface if you can. Put the heel of one hand on the lower half of the breastbone and the other hand on top. Lock your elbows and bring your shoulders over your hands.',
          ],
          look: 'The heart seen from the front, as it lies behind the breastbone. It is still in VF. The name tags are switched off.',
          show: { heart: 'external', camera: 'Front', rhythm: 'vf', labels: false },
          check: {
            kind: 'tap',
            question: 'Your hands are on the lower half of the breastbone. Tap the chamber that lies directly under them.',
            targets: ['right-ventricle'],
            explain: 'The right ventricle forms most of the front of the heart, so it sits directly behind the lower breastbone. A compression squeezes both ventricles between the breastbone and the spine.',
          },
        },
        {
          title: 'Rate: 100 to 120 a minute',
          text: [
            'Push at a rate of 100 to 120 compressions a minute, a little under two a second.',
            'Below 100, too little blood is moved each minute. Above 120, compressions become shallow and the heart has no time to refill between them. Faster is not better.',
            'Rescuers tend to speed up under stress. A metronome, or the feedback built into many monitors, keeps the rate honest.',
          ],
          look: 'This is the monitor-defibrillator. Press START CPR in the panel next to it. Each compression makes one bump on the blue Pleth line. The screen holds 6 seconds: count the bumps in one sweep and multiply by 10.',
          show: { heart: false, ecg: 'defib', labels: true },
          check: {
            kind: 'choice',
            question: 'In one 6-second sweep you count 11 compression bumps. What is the rate, and is it right?',
            options: [
              'About 110 a minute: on target',
              'About 66 a minute: too slow',
              'About 180 a minute: too fast',
              'About 110 a minute: too slow',
            ],
            answer: 0,
            explain: '11 bumps in 6 seconds is 110 a minute, inside the target of 100 to 120. Counting for 6 seconds and multiplying by 10 works for anything regular on a monitor.',
          },
        },
        {
          title: 'Depth: at least 2 inches',
          text: [
            'On an adult, push down at least 2 inches (5 cm), and no more than 2.4 inches (6 cm).',
            'Shallow compressions are a common fault. They feel like work, but they do not squeeze the heart enough to move blood. Pushing deeper than 2.4 inches adds injuries without adding flow.',
            'Depth comes from body weight, not arm strength: arms straight, shoulders over your hands, and bend at the hips.',
          ],
          look: 'Change the box next to the CPR button from "High-quality CPR" to "Poor CPR". In this trainer that means slow and shallow: the bumps on the Pleth line shrink and spread apart. Then switch it back.',
          check: {
            kind: 'choice',
            question: 'A feedback device shows your compressions are 1.5 inches (4 cm) deep, at 110 a minute, with full recoil. What needs to change?',
            options: [
              'Push deeper: at least 2 inches (5 cm)',
              'Push faster to make up for the depth',
              'Nothing: the rate and the recoil are right',
              'Push less deep: 1.5 inches already risks injury',
            ],
            answer: 0,
            explain: 'Depth must reach at least 2 inches (5 cm). A faster rate cannot make up for shallow compressions; it makes them shallower still. The rate and the recoil are right here, so only the depth changes.',
          },
        },
        {
          title: 'Recoil: let the chest come all the way up',
          text: [
            'After every push, take your weight off and let the chest return fully to its resting position. This is recoil.',
            'Blood returns to the heart only while the chest is coming back up, and the heart\'s own arteries are fed in that same moment. If you lean on the chest between compressions, the heart starts each push half empty and the next compression moves less blood.',
            'Keep your hands in contact with the skin, but carry no weight on them at the top.',
          ],
          look: 'A normal heart, slowed down, to show one thing: the ventricles fill only while they relax. Watch the dots cross the valves between squeezes. Under your hands, that filling happens during recoil.',
          show: { ecg: false, heart: 'sectioned', flow: true, rhythm: 'normal-sinus', speed: 0.5 },
        },
        {
          title: 'Pauses: the flow you lose',
          text: [
            'Each time compressions stop, the blood pressure you have built up falls away within seconds. When you start again, it takes several compressions to build it back.',
            'So every pause is planned and short: a rhythm check, a shock, two breaths. A pulse check gets no more than 10 seconds. The defibrillator is charged while compressions continue, and compressions restart the instant a shock has been given.',
            'Nothing else stops compressions: not an IV, not a drug, and not moving the patient if that can be avoided.',
          ],
          look: 'Back at the monitor, in VF. With CPR running, press STOP CPR: the Pleth bumps vanish and the EtCO₂ number drops at once. Press START CPR to bring them back.',
          show: { heart: false, ecg: 'defib', rhythm: 'vf', speed: 1 },
          check: {
            kind: 'choice',
            question: 'The AED has delivered its shock. What do you do next?',
            options: [
              'Resume compressions at once',
              'Feel for a pulse for 10 seconds',
              'Wait for the AED to analyze again',
              'Give two breaths and watch the monitor',
            ],
            answer: 0,
            explain: 'Compressions restart immediately after any shock and continue for 2 minutes. Even when a shock ends VF, the heart rarely pumps well in the first moments, so a pulse check then only adds a pause. The AED will tell you when it is ready to analyze again.',
          },
        },
        {
          title: 'Breaths: 30 to 2',
          text: [
            'Without an advanced airway, the pattern is 30 compressions, then 2 breaths: 30:2. An advanced airway is a tube placed in the windpipe or a device seated right above it.',
            'Give each breath over 1 second, with only enough air to see the chest begin to rise. Then go straight back to compressions. Big or fast breaths raise the pressure in the chest, which holds blood back from the heart.',
            'Once an advanced airway is in place, compressions run without pauses and one breath is given every 6 seconds: 10 a minute.',
          ],
          look: 'The yellow line at the bottom of the monitor is the carbon dioxide in each breath out. Every wave is one breath. You will use its number in the last step.',
          check: {
            kind: 'choice',
            question: 'Two EMTs are doing CPR on an adult with a bag-valve-mask. No advanced airway is in place. What is the pattern?',
            options: [
              '30 compressions, then 2 breaths',
              '15 compressions, then 2 breaths',
              'Continuous compressions with a breath every 6 seconds',
              '30 compressions, then 5 breaths',
            ],
            answer: 0,
            explain: '30:2 until an advanced airway is in place. Continuous compressions with one breath every 6 seconds is the pattern once it is. 15:2 belongs to two-rescuer CPR in children, not adults.',
          },
        },
        {
          title: 'Change compressors every 2 minutes',
          text: [
            'Good compressions are hard physical work. Depth falls off within a couple of minutes, often before the rescuer notices.',
            'Change the person compressing every 2 minutes, or sooner if they tire. Make the change at the rhythm check, when compressions pause anyway, and take only a few seconds over it.',
            'Mechanical compression devices are not recommended for routine use. They may be considered where good manual compressions are hard or unsafe, such as in a moving ambulance or under the X-ray equipment of a cath lab.',
          ],
          look: 'A CPR timer runs at the bottom of the numbers column on the monitor. At 2:00 it turns amber and adds "rhythm check": the moment to change compressors.',
          check: {
            kind: 'choice',
            question: 'You have been compressing for 90 seconds and feel fine. Your partner offers to take over at the 2-minute rhythm check. What is right?',
            options: [
              'Change at 2 minutes: depth drops before you feel tired',
              'Keep going until you feel tired',
              'Change now, in the middle of the cycle',
              'Keep going: changing compressors interrupts CPR',
            ],
            answer: 0,
            explain: 'Compressions get shallower before the rescuer feels it, so the change is made by the clock, not by how you feel. The rhythm check is the natural moment: compressions are paused anyway, and the change adds almost nothing to the pause.',
          },
          roleNote: {
            1: 'With two EMTs, change places every 2 minutes: when the AED announces that it is analyzing, the one on the bag moves to the chest.',
            3: 'In the cath lab, lower the table, move the X-ray arm out of the way and use a step so that your shoulders are over the chest. Say early if you are tiring.',
            4: 'In the cath lab, lower the table, move the X-ray arm out of the way and use a step so that your shoulders are over the chest. Say early if you are tiring.',
          },
        },
        {
          title: 'Capnography: a window on your CPR',
          text: [
            'Capnography measures the carbon dioxide (CO2) in each breath out. The value at the end of the breath is the end-tidal CO2 (EtCO2), normally 35 to 45 mmHg.',
            'CO2 reaches the lungs only if blood carries it there. During CPR the EtCO2 therefore follows blood flow: better compressions, higher number.',
            'A number that is low or falling is a message about the CPR: check depth, rate and recoil, and change the compressor. The 2025 guidelines give no single cutoff, and EtCO2 is never used alone to decide to stop. A sudden, lasting rise, typically to 40 mmHg or more, suggests the pulse is back.',
          ],
          look: 'Find the yellow EtCO₂ number. With CPR running, switch between "High-quality CPR" and "Poor CPR" and watch it change. Then press STOP CPR and leave it stopped, so that no compression marks appear on later tracings.',
          check: {
            kind: 'choice',
            question: 'Ten minutes into a resuscitation the EtCO2 drifts down from 18 to 9 mmHg. The airway and the breaths have not changed. What do you check first?',
            options: [
              'The compressions: depth, rate, recoil and a tired compressor',
              'Nothing: a falling number means the patient is improving',
              'Whether it is time to stop the resuscitation',
              'Whether another dose of epinephrine is due',
            ],
            answer: 0,
            explain: 'With the breaths unchanged, a falling EtCO2 means less blood is reaching the lungs: the compressions have weakened. Fix the CPR first. A low number alone is never the reason to stop, and a drug cannot make up for poor compressions.',
          },
          roleNote: {
            1: 'Reading capnography is usually the ALS crew\'s job. When they call out a falling number, the message is for the person on the chest: push deeper, recoil fully, or change places.',
            2: 'Connect waveform capnography as soon as the airway allows, and say the number out loud at every rhythm check. Read the trend, not a single value.',
          },
        },
      ],
    },

    // ─── 3 ───────────────────────────────────────────────────────────────
    {
      id: 'shock-or-no-shock',
      title: 'Shock or no shock',
      goal: 'Sort the four arrest rhythms into shockable and not shockable, and explain what a shock does to the heart.',
      minutes: 8,
      steps: [
        {
          title: 'Four rhythms, two groups',
          text: [
            'Once the pads are on, every arrest comes down to one question: will a shock help? The answer depends on the rhythm.',
            'Two rhythms are shockable: ventricular fibrillation (VF) and pulseless ventricular tachycardia (pulseless VT). Two are not: asystole and pulseless electrical activity (PEA).',
            'All four have one thing in common: no pulse. The CPR is the same for all of them. Only the shock differs.',
          ],
          look: 'VF on three monitor leads: a chaotic, wavy line with no P waves, no QRS complexes and no T waves. No two stretches look the same.',
          show: { heart: false, ecg: 'ecg', layout: 'monitor', rhythm: 'vf' },
        },
        {
          title: 'VF: electrical chaos',
          text: [
            'In a normal beat one signal sweeps through the ventricles and the muscle squeezes as one. In VF many small waves of electricity circle through the ventricles at once, each firing a different patch of muscle. No patch waits for any other.',
            'Early on, the waves on the tracing are large: coarse VF. As the heart muscle runs out of oxygen and energy, the waves shrink to fine VF and finally to a flat line. A shock is more likely to work on coarse VF, which is one more reason for CPR and speed.',
          ],
          look: 'The ventricles quiver, and no glow sweeps across them as it does in a normal beat. The tracing below is the same chaos, recorded from the skin.',
          show: { heart: 'external', camera: 'Front', focus: 'heart' },
          check: {
            kind: 'choice',
            question: 'What on this tracing tells you it is VF and not an organized rhythm?',
            options: [
              'Nothing repeats: no QRS complexes, only waves of changing size',
              'The complexes are wide and fast, but all the same shape',
              'The line is completely flat in all three leads',
              'There are P waves with no QRS complex after them',
            ],
            answer: 0,
            explain: 'VF is chaos: no P waves, no QRS complexes, no T waves, and no two stretches alike. Wide complexes that repeat are VT. A flat line is asystole. P waves alone mean the atria are firing and the ventricles are not.',
          },
          more: ['ventricular-fibrillation'],
        },
        {
          title: 'What a shock does',
          text: [
            'A defibrillator does not jump-start the heart. It passes a brief, large current through the chest that fires nearly every heart muscle cell at the same instant. All the circling waves are stopped at once.',
            'For a moment the heart is electrically silent. Then the cells with the fastest built-in rhythm can take charge again and send one organized signal down the normal wiring.',
            'A shock is a reset. It can only help when the problem is electrical chaos, and the heart can only restart afterward if CPR has kept it supplied with oxygen.',
          ],
          look: 'The heart is now see-through, showing its wiring. In VF the ventricles quiver and no signal travels down the wiring.',
          show: { heart: 'conduction', ecg: false },
          check: {
            kind: 'tap',
            question: 'Once a shock has silenced the chaos, which structure should take over as the pacemaker? Tap it.',
            targets: ['sa-node'],
            explain: 'The SA node, at the top of the right atrium, has the fastest built-in rhythm, so it normally takes charge once the chaos is cleared. If it is slow to wake, a slower backup lower down may fire first. That is one reason the first rhythm after a shock is often slow or has no pulse yet.',
          },
          more: ['defibrillation'],
        },
        {
          title: 'Pulseless VT: organized, but far too fast',
          text: [
            'Ventricular tachycardia (VT) is a fast, regular rhythm that starts in the ventricles themselves instead of coming down the normal wiring. On the tracing it is a run of wide QRS complexes, 0.12 s (3 small boxes) or more, all the same shape.',
            'VT can still produce a pulse. When it is very fast, the ventricles have no time to fill and the pulse disappears. Pulseless VT is treated exactly like VF: CPR and an immediate shock.',
            'The tracing alone cannot tell you which of the two it is. The pulse does.',
          ],
          look: 'Wide, regular complexes at about 200 a minute, each one like the last. Compare this with VF: here the pattern repeats, and in VF nothing did.',
          show: { heart: false, ecg: 'ecg', layout: 'monitor', rhythm: 'pvt' },
          check: {
            kind: 'choice',
            question: 'A monitor shows this wide, fast, regular rhythm. The patient is unresponsive, is not breathing and has no pulse. What is the treatment?',
            options: [
              'CPR and an immediate unsynchronized shock, as for VF',
              'A synchronized shock, timed to the QRS',
              'A drug to slow the rate, then another pulse check',
              'CPR only: an organized rhythm cannot be shocked',
            ],
            answer: 0,
            explain: 'With no pulse this is pulseless VT, a shockable arrest rhythm: defibrillate, as for VF. A synchronized shock is for VT in a patient who still has a pulse, and it comes in the last lesson. "Organized" does not mean "not shockable".',
          },
        },
        {
          title: 'Asystole: nothing to reset',
          text: [
            'Asystole is the absence of any electrical activity: a flat or nearly flat line. No signal, no squeeze.',
            'A shock stops electrical activity. In asystole there is none to stop, so a shock does nothing useful and costs a pause in compressions. The treatment is CPR, epinephrine from the ALS crew, and a search for a cause that can be reversed.',
            'A flat line can also be a loose electrode, a disconnected cable or the display size turned down. Check the patient, the connections and a second lead before you call it asystole. Very fine VF can look flat too.',
          ],
          look: 'All twelve leads are flat. Seeing the same flat line in more than one lead is what separates true asystole from a loose electrode, or from very fine VF hiding in a single lead.',
          show: { rhythm: 'asystole', layout: 'simultaneous' },
          check: {
            kind: 'choice',
            question: 'The monitor suddenly shows a flat line. The patient is talking to you. What is the most likely explanation?',
            options: [
              'An electrode or a cable has come off',
              'Asystole: start CPR',
              'Fine VF: shock now',
              'The heart has stopped, but the patient has not collapsed yet',
            ],
            answer: 0,
            explain: 'Treat the patient, not the monitor. A person who is awake and talking has a heartbeat, so the flat line is a technical problem: a loose electrode, a disconnected cable or the wrong lead selected. Asystole and fine VF both come with an unresponsive patient who has no pulse.',
          },
        },
        {
          title: 'PEA: a rhythm without a pulse',
          text: [
            'In pulseless electrical activity (PEA) the monitor shows an organized rhythm, sometimes one that looks almost normal, but the heart is not moving enough blood to make a pulse.',
            'The wiring is working. The pump is not: it may be empty, squeezed from outside, blocked, or too short of oxygen to contract. A shock cannot fix any of that, because the electrical signal is already organized.',
            'PEA is diagnosed with your fingers, not with the monitor: an organized rhythm and no pulse. The treatment is CPR, epinephrine and finding the cause. That search is lesson 5.',
          ],
          look: 'The monitor counts a heart rate from the green ECG, but the blue Pleth line is flat and SpO₂ reads "---": no pulse reaches the finger. Press Pulse check in the panel. (If CPR is still running, press STOP CPR first.)',
          show: { ecg: 'defib', rhythm: 'pea' },
          check: {
            kind: 'choice',
            question: 'The monitor shows an organized rhythm at 48 a minute. The patient is unresponsive and you feel no pulse. What do you do?',
            options: [
              'Start CPR: this is PEA',
              'Nothing yet: a rhythm on the monitor means the heart is beating',
              'Shock: every arrest rhythm should be shocked',
              'Wait for a blood pressure reading before deciding',
            ],
            answer: 0,
            explain: 'An organized rhythm with no pulse is PEA, and the treatment starts with CPR. The monitor shows electricity, not pumping. A shock does not help, because there is no chaos to reset, and waiting for a blood pressure only delays compressions.',
          },
        },
        {
          title: 'The AED decides',
          text: [
            'An AED reads the rhythm for you. It advises a shock for VF and for fast VT, and no shock for everything else.',
            'An AED cannot feel a pulse. It is only put on a patient who is unresponsive, is not breathing normally and has no pulse. Nobody touches the patient while it analyzes: movement, including compressions, disturbs the reading.',
            '"No shock advised" does not mean the patient is better. Resume CPR at once and keep going until the AED asks to analyze again, the ALS crew takes over or the patient starts to move.',
          ],
          look: 'VF is on the monitor. Press AED at the top of the panel, then ANALYZE, and keep your hands off while it works. When the message bar reads "SHOCK ADVISED", press SHOCK and watch the green trace.',
          show: { rhythm: 'vf' },
          check: {
            kind: 'choice',
            question: 'An AED is attached to a patient with no pulse and announces, "No shock advised." What does the crew do?',
            options: [
              'Resume CPR immediately',
              'Press the shock button anyway',
              'Take the pads off: the AED is no longer needed',
              'Stop CPR: the heart has restarted',
            ],
            answer: 0,
            explain: 'No shock advised means the rhythm is not VF or fast VT. In a patient with no pulse that leaves asystole or PEA, and both are treated with CPR. The pads stay on: the AED analyzes again every 2 minutes, and the rhythm can change.',
          },
          roleNote: {
            1: 'This is your defibrillator. You do not need to name the rhythm: pads on, everyone clear, follow the prompts, and be back on the chest the moment the shock is given or refused.',
            2: 'In manual mode you make this decision yourself at every rhythm check. If you cannot tell fine VF from asystole, look at a second lead; do not hold compressions while you puzzle over it.',
            3: 'Call out the rhythm the moment you see it, and charge the defibrillator. Give the shock on the operator\'s command, or as your ACLS training and facility policy allow.',
            4: 'Lab defibrillators are normally used in manual mode by ACLS-trained staff, per facility policy. Know where the AED mode is as well: it is there for anyone who is alone or unsure.',
          },
        },
        {
          title: 'Shock or no shock',
          text: [
            'Shockable: VF and pulseless VT. The problem is electrical chaos or a runaway circuit, and a shock can stop it.',
            'Not shockable: asystole and PEA. There is nothing to reset, so the work is CPR and finding the cause.',
            'For all four: compressions first, and back on the chest within seconds of every rhythm check.',
          ],
          look: 'Asystole again, on the three monitor leads: flat in all of them.',
          show: { ecg: 'ecg', layout: 'monitor', rhythm: 'asystole' },
          check: {
            kind: 'choice',
            question: 'After 2 minutes of CPR the rhythm check shows this flat line. The cables are connected. Your partner charges the defibrillator "to be safe". What is right?',
            options: [
              'No shock: asystole has nothing to reset. Resume compressions',
              'Shock once at the highest energy, then resume compressions',
              'Shock: it might be fine VF, and a shock does no harm',
              'Stop compressions and watch the monitor for a minute',
            ],
            answer: 0,
            explain: 'A shock stops electrical activity, and asystole has none. Shocking it only takes time away from compressions. If you truly cannot tell fine VF from asystole, check a second lead while CPR continues.',
          },
          more: ['ventricular-fibrillation', 'defibrillation'],
        },
      ],
    },

    // ─── 4 ───────────────────────────────────────────────────────────────
    {
      id: 'two-minute-cycles',
      title: 'Two-minute cycles',
      goal: 'Run a shockable arrest in two-minute cycles: shock, CPR, rhythm check, access, epinephrine and an antiarrhythmic, in the right order.',
      minutes: 10,
      steps: [
        {
          title: 'The rhythm of a resuscitation',
          text: [
            'Advanced life support (ALS) is built on top of basic life support, not in place of it. Its frame is a repeating two-minute cycle: CPR for 2 minutes, a rhythm check of a few seconds, a shock if the rhythm is shockable, and straight back to CPR.',
            'Everything else, the IV, the drugs, the airway, is fitted into the 2 minutes of CPR, so that compressions never stop for it.',
            'One person leads and watches the clock. Everyone else has one job.',
          ],
          look: 'VF on the monitor: a chaotic green trace, a flat blue Pleth line and "---" for the heart rate. Press START CPR in the panel next to it and leave it running. A CPR timer starts at the bottom of the numbers column.',
          show: { heart: false, ecg: 'defib', rhythm: 'vf' },
          roleNote: {
            1: 'In this trainer the Manual and Pacer buttons and the drugs are locked for your role, as they are on the street. Use AED mode and the CPR buttons. Read the ALS steps to know what the crew next to you will do next, and what they need from you: compressions that do not stop.',
          },
        },
        {
          title: 'The first shock',
          text: [
            'As soon as the defibrillator is ready and the rhythm is VF or pulseless VT, shock. Nothing comes before the first shock except CPR while the pads go on.',
            'A biphasic defibrillator uses the dose its manufacturer recommends, for example 120 to 200 J. If you do not know it, use the maximum. An older monophasic one uses 360 J. Give one shock at a time, and use the same dose or a higher one for later shocks.',
            'Charge while compressions continue. Then say "Clear", look to see that nobody is touching the patient, shock, and restart compressions at once. Do not stop to read the monitor or feel for a pulse.',
          ],
          look: 'Press Manual. Leave the energy at 200 J and press CHARGE while CPR runs. When the monitor reads "READY": STOP CPR, SHOCK, then START CPR again at once. The next step puts VF back so that you can keep practicing.',
          check: {
            kind: 'choice',
            question: 'The defibrillator is charged and the rhythm is VF. The IV is not in yet and no drug has been given. What do you do?',
            options: [
              'Shock now, then resume CPR',
              'Wait for the IV and give epinephrine first',
              'Give 2 more minutes of CPR before the first shock',
              'Feel for a pulse once more before shocking',
            ],
            answer: 0,
            explain: 'Defibrillation is the treatment for VF, and it is never held back for an IV, a drug or an airway. CPR fills only the time it takes to get the defibrillator ready. The pulse was already absent, so another check adds nothing but a pause.',
          },
          roleNote: {
            1: 'Use AED mode here: press AED, then STOP CPR, then ANALYZE, and press SHOCK when it is advised. Restart CPR the moment the shock has been given.',
          },
        },
        {
          title: 'Two minutes of CPR, then look',
          text: [
            'After the shock, give 2 full minutes of CPR before you look at the rhythm again. Change the compressor at the 2-minute mark.',
            'The rhythm check is a pause of a few seconds: compressions stop, everyone looks at the monitor, and the leader calls it. Shockable: charge with compressions running, clear and shock. Asystole: back to CPR.',
            'An organized rhythm is the one time you feel for a pulse, for no more than 10 seconds. A pulse means circulation has returned. No pulse means PEA, and CPR restarts at once.',
          ],
          look: 'VF is back on the monitor for the next cycle. Restart CPR if it has stopped. At 2:00 the CPR timer turns amber and reads "rhythm check". You do not need to wait the full 2 minutes here.',
          check: {
            kind: 'choice',
            question: 'At the rhythm check the monitor shows an organized rhythm with narrow complexes at 70 a minute. What is the next step?',
            options: [
              'Feel for a pulse, for no more than 10 seconds',
              'Shock: the last rhythm was VF',
              'Resume CPR for 2 minutes without checking anything',
              'Give amiodarone to keep the rhythm steady',
            ],
            answer: 0,
            explain: 'A narrow, organized rhythm is not shockable, whatever came before it. It may or may not be producing a pulse, so this is the moment to feel for one. With a pulse you move to care after the arrest. Without one it is PEA, and CPR restarts at once.',
          },
        },
        {
          title: 'Access: IV first',
          text: [
            'The drugs need a route into the bloodstream. The 2025 guidelines are clear about the order: try for an IV, a line in a vein, first. If IV attempts fail or are not feasible, place an IO line: a needle into the marrow space of a bone, usually the shin or the upper arm.',
            'Access is placed during CPR. Nobody stops compressions for it, and it never delays a shock.',
          ],
          look: 'The Code record at the bottom of the panel lists every event with its time. In a real arrest one person keeps this record: it is how the team knows when the next drug is due.',
          check: {
            kind: 'choice',
            question: 'During CPR the first IV attempt fails, and no other vein can be found. What is the next route?',
            options: [
              'An IO line, into the bone marrow',
              'Down the breathing tube',
              'An injection into the thigh muscle',
              'Wait for the hospital to place a line in a large central vein',
            ],
            answer: 0,
            explain: 'IV first, and IO when an IV fails or is not feasible. A drug injected into muscle is not carried anywhere while the circulation is this poor, uptake from the breathing tube is unpredictable, and waiting leaves the patient without epinephrine.',
          },
          roleNote: {
            2: 'IV first, then IO if it fails or is not feasible, per protocol. Choose a site that keeps you out of the compressor\'s way.',
            4: 'In the lab a working IV is usually in place already. Confirm that it runs, and say out loud which line is the drug line.',
          },
        },
        {
          title: 'Epinephrine',
          text: [
            'Epinephrine is the main drug of cardiac arrest. It does not restart the heart. It tightens the blood vessels, which raises the pressure that CPR produces and sends more of that flow to the heart muscle and the brain.',
            'The dose is 1 mg by IV or IO, repeated every 3 to 5 minutes for as long as the arrest lasts.',
            'In VF and pulseless VT the shocks come first: epinephrine is given once the first shocks have failed, at the point your protocol names. In asystole and PEA there is no shock to wait for, so it is given as soon as access is ready.',
          ],
          look: 'Press Epinephrine in the Medications list. A new timer appears at the bottom of the numbers column on the monitor: "Epi 0:10 ago". At 3 minutes it turns amber and adds "due".',
          check: {
            kind: 'choice',
            question: 'The rhythm is asystole. CPR is running and the IV is now in place. When is the first epinephrine given?',
            options: [
              'Now, as soon as the line is in',
              'After the second shock',
              'After 10 minutes of CPR',
              'Only if the rhythm changes to VF',
            ],
            answer: 0,
            explain: 'Asystole and PEA are not shockable, so there is nothing to wait for: epinephrine is given as soon as access is ready and repeated every 3 to 5 minutes. Holding it until shocks have failed applies only to VF and pulseless VT.',
          },
          roleNote: {
            1: 'Epinephrine for cardiac arrest is an ALS drug, and the button is locked for you. Your part is the compressions: a drug only reaches the heart if CPR carries it there.',
            4: 'Arrest doses are given per the ACLS protocol. Say the drug, the dose and the time out loud as you give it, and make sure the recorder has heard you.',
          },
          more: ['epinephrine'],
        },
        {
          title: 'Amiodarone or lidocaine',
          text: [
            'If VF or pulseless VT is still there after repeated shocks, an antiarrhythmic drug may be added. It does not convert the rhythm by itself. It is given to help the next shock work.',
            'There are two choices: amiodarone, 300 mg by IV or IO, with one further dose of 150 mg; or lidocaine, 1 to 1.5 mg/kg, then 0.5 to 0.75 mg/kg. Your protocol names which one to use and after which shock.',
            'Neither drug has been shown to increase the number of patients who leave the hospital alive. Neither is ever a reason to delay a shock or interrupt compressions.',
          ],
          look: 'The Amiodarone button shows the dose that is due: 300 mg for the first dose, 150 mg for the second. The Lidocaine button next to it works the same way.',
          check: {
            kind: 'choice',
            question: 'VF persists after three shocks and a dose of epinephrine. The team gives amiodarone 300 mg. What happens next?',
            options: [
              'CPR continues, and the next shock is given at the next rhythm check',
              'CPR pauses for 2 minutes to let the drug work',
              'No more shocks are needed once amiodarone is in',
              'Lidocaine is given straight away on top of the amiodarone',
            ],
            answer: 0,
            explain: 'An antiarrhythmic supports defibrillation; it does not replace it. Compressions carry the drug to the heart, and the next shock comes at the next rhythm check. Amiodarone and lidocaine are alternatives: a protocol chooses one of them.',
          },
          more: ['amiodarone', 'lidocaine'],
        },
        {
          title: 'What does not help',
          text: [
            'A resuscitation has no time for treatments that do not work. The 2025 guidelines advise against several that are still seen.',
            'Not recommended as routine: calcium, sodium bicarbonate, high doses of epinephrine, and CPR with the head and chest raised. Vasopressin offers no advantage over epinephrine. Calcium and bicarbonate keep a place when a specific cause calls for them, such as certain overdoses.',
            'For VF that survives three or more shocks, moving the pads to a new position (vector change) and firing two defibrillators one after the other (double sequential defibrillation) are unproven: the AHA says their usefulness has not been established. Use them only if your protocol directs.',
          ],
          look: 'The Medications list also holds drugs for patients who have a pulse. Press Adenosine now: the Code record answers that it has no role in cardiac arrest.',
          check: {
            kind: 'choice',
            question: 'Twenty minutes into a VF arrest a team member suggests sodium bicarbonate, "because the patient must be full of acid by now". No overdose is suspected. What is the best reply?',
            options: [
              'Not as a routine: it has shown no benefit in cardiac arrest',
              'Yes: give a dose after every 10 minutes of CPR',
              'Yes, but only together with a dose of calcium',
              'Yes, once the third dose of epinephrine is in',
            ],
            answer: 0,
            explain: 'Routine sodium bicarbonate in cardiac arrest is not recommended: it has shown no benefit. Acid builds up because blood is not flowing, and the treatment for that is circulation and breathing. Bicarbonate is kept for specific causes, such as certain overdoses.',
          },
          more: ['sodium-bicarbonate', 'calcium-chloride'],
        },
        {
          title: 'One full cycle',
          text: [
            'Now run one cycle of a VF arrest from start to finish.',
            'CPR running. Charge during compressions. Clear, shock. CPR again at once, for 2 minutes. During those 2 minutes: access, then the drug that is due. Rhythm check, and around again.',
            'Say each step out loud as you press it, the way a team leader would.',
          ],
          look: 'In the panel: START CPR, CHARGE, then STOP CPR, SHOCK and START CPR again. Give epinephrine during the CPR. Then read the Code record: it should show no long gap without compressions.',
          show: { rhythm: 'vf' },
          check: {
            kind: 'choice',
            question: 'The defibrillator is ready and the rhythm is VF. Which order is right for one cycle?',
            options: [
              'Shock, 2 minutes of CPR with the drugs given during it, rhythm check',
              'Drug, 2 minutes of CPR to circulate it, shock, rhythm check',
              'Rhythm check, pulse check, drug, shock, 2 minutes of CPR',
              'Shock, pulse check, drug, 2 minutes of CPR, rhythm check',
            ],
            answer: 0,
            explain: 'Shock first, then 2 minutes of CPR without stopping to feel for a pulse, with access and drugs fitted into that CPR, then the rhythm check. Any order that puts a drug or a pulse check between the shock and the compressions adds a pause and gains nothing.',
          },
          roleNote: {
            1: 'Your cycle: START CPR, then AED, STOP CPR, ANALYZE, SHOCK when it is advised, and START CPR again.',
          },
        },
        {
          title: 'If the rhythm is not shockable',
          text: [
            'At any rhythm check the rhythm may have changed. If it is asystole, or an organized rhythm with no pulse (PEA), the shocks stop but the cycle goes on: 2 minutes of CPR, a rhythm check, 2 more minutes of CPR.',
            'Epinephrine is given as soon as access is ready and every 3 to 5 minutes after that. The antiarrhythmic drugs have no part here. Their place is taken by the search for a cause that can be reversed, which is the next lesson.',
            'A rhythm can change back, too. If VF or pulseless VT appears at a later check, shock it.',
          ],
          look: 'Asystole on the monitor: a flat green line. Before you leave this lesson, press STOP CPR in the panel, so that no compression marks appear on the tracings in later lessons.',
          show: { rhythm: 'asystole' },
          check: {
            kind: 'choice',
            question: 'At a rhythm check the monitor shows a flat line in two leads, and the cables are connected. An IV is in place and no epinephrine has been given yet. What now?',
            options: [
              'Resume CPR and give epinephrine 1 mg',
              'Shock at the highest energy',
              'Give amiodarone 300 mg',
              'Wait 2 minutes to see whether a rhythm returns',
            ],
            answer: 0,
            explain: 'Asystole is not shockable: CPR continues, and epinephrine is given as soon as access is ready. Amiodarone is for VF and pulseless VT that resist shocks, and it has no role in asystole. Waiting without compressions leaves the brain with no blood flow at all.',
          },
          more: ['defibrillation', 'epinephrine'],
        },
      ],
    },

    // ─── 5 ───────────────────────────────────────────────────────────────
    {
      id: 'find-the-cause',
      title: 'Find the cause',
      goal: 'Name the reversible causes of cardiac arrest, the Hs and Ts, and match the clues at the scene to the most likely one.',
      minutes: 8,
      steps: [
        {
          title: 'When CPR and epinephrine are not enough',
          text: [
            'Some arrests cannot be fixed by CPR, shocks and epinephrine alone, because something is still stopping the heart from pumping: no blood to pump, no oxygen, a clot, or pressure from outside. Until that is corrected the heart will not restart, or will not stay restarted.',
            'These are the reversible causes. The search for them runs during CPR in every arrest. In PEA it is the heart of the treatment: an organized rhythm with no pulse means the wiring works and something else is wrong.',
            'They are remembered as the Hs and the Ts.',
          ],
          look: 'PEA on the monitor again: an organized green rhythm and a flat blue Pleth line. The rhythm tells you the electrical system is working. Your task is to find out why the pump is not.',
          show: { heart: false, ecg: 'defib', rhythm: 'pea' },
        },
        {
          title: 'The Hs',
          text: [
            'Hypovolemia: too little blood in the circulation, from bleeding or severe fluid loss. Hypoxia: too little oxygen, from an airway, breathing or lung problem. Hydrogen ion: acidosis, too much acid in the blood.',
            'Hypokalemia or hyperkalemia: potassium too low or too high. Hypothermia: a dangerously low body temperature.',
            'Hypoxia and visible bleeding are the two you can act on first and with the least equipment: open the airway and give breaths with oxygen, and stop any bleeding you can reach.',
          ],
          look: 'This PEA is slow, and its QRS complexes are wide. Keep that in mind: the shape of the rhythm is a clue, and you will use it at the end of this lesson.',
          check: {
            kind: 'choice',
            question: 'A man chokes on food in a restaurant, turns blue and collapses with no pulse. Which reversible cause started this arrest, and what must the team be sure to do?',
            options: [
              'Hypoxia: clear the airway and give breaths with oxygen during CPR',
              'Hypovolemia: give IV fluid as fast as the line allows',
              'Hyperkalemia: give calcium as soon as an IV is in place',
              'Hypothermia: warm the patient before anything else is done',
            ],
            answer: 0,
            explain: 'His heart stopped because no oxygen was reaching it. Compressions alone will not correct that: the airway must be cleared and breaths with oxygen given as part of the CPR. Nothing in the story points to blood loss, potassium or cold.',
          },
        },
        {
          title: 'Potassium: a cause the ECG can warn you about',
          text: [
            'Potassium controls how heart cells recharge after each beat. Too much of it, hyperkalemia, slows the signal through the heart until it stops. It is the classic arrest of kidney failure and missed dialysis.',
            'The ECG gives warning before the arrest: tall, narrow, pointed T waves first, then a longer PR interval and flattened P waves, then a QRS that widens until the tracing looks like a rolling wave.',
            'While such a patient still has a pulse, calcium by IV is the standard first treatment, per protocol or on a physician\'s order. Once the heart has arrested, the 2025 guidelines rate calcium, bicarbonate and insulin with glucose as of uncertain benefit: none of them may interrupt CPR.',
          ],
          look: 'A 12-lead from a patient with high potassium, recorded before any arrest. Look at the T waves in the chest leads: tall, narrow and pointed, like a tent. The QRS is already wider than normal.',
          show: { ecg: 'ecg', layout: 'simultaneous', rhythm: 'hyperkalemia' },
          check: {
            kind: 'lead',
            question: 'Tap a lead that shows a tall, pointed T wave.',
            targets: ['I', 'II', 'aVF', 'V2', 'V3', 'V4', 'V5', 'V6'],
            explain: 'The tallest pointed T waves are in the chest leads V2 to V5, with smaller ones in I, II, aVF and V6. A T wave that is tall, narrow and symmetrical in a patient with kidney failure means high potassium until a blood test says otherwise.',
          },
          roleNote: {
            1: 'Reading a 12-lead is outside your scope. Your clue is the history: a dialysis patient who has missed sessions and is weak, with a slow pulse. Say so to the ALS crew, because it changes what they do.',
            4: 'In a patient with a pulse, calcium is given on order, slowly, through a good vein, and never in the same line as bicarbonate without a flush. Watch the QRS narrow on the monitor.',
          },
          more: ['hyperkalemia', 'calcium-chloride'],
        },
        {
          title: 'The Ts',
          text: [
            'Tension pneumothorax: air trapped under pressure around a lung, squeezing the heart and the large veins. Tamponade: blood or fluid in the sac around the heart, so the heart cannot fill.',
            'Toxins: an overdose or a poisoning. Thrombosis in the lungs: a pulmonary embolism, a large clot blocking the arteries to the lungs. Thrombosis in a coronary artery: a heart attack.',
            'Three of these, tension pneumothorax, tamponade and pulmonary embolism, are obstructions: the heart is able to beat, but blood cannot get into it or out of it.',
          ],
          look: 'A normal heart, cut open, with blood flowing. Follow the blue dots from the right atrium through the right ventricle and out toward the lungs. Each obstruction blocks this path at a different point.',
          show: { ecg: false, heart: 'sectioned', flow: true, rhythm: 'normal-sinus' },
          check: {
            kind: 'tap',
            question: 'A large pulmonary embolism blocks the way out of the right side of the heart. Tap the vessel where the clot lodges.',
            targets: ['pulmonary-trunk'],
            explain: 'A pulmonary embolism lodges in the pulmonary trunk and its branches. The right ventricle cannot empty against the blockage, so little blood crosses the lungs to fill the left side, and the pulse disappears even though the ECG still shows a rhythm.',
          },
          more: ['pulmonary-embolism'],
        },
        {
          title: 'Tamponade and tension: no room to fill',
          text: [
            'The heart sits inside a tough sac, the pericardium. If blood or fluid collects in the sac quickly, it squeezes the heart from outside. The thin-walled right side gives way first, the heart cannot fill, and with nothing to pump the pulse fades. That is cardiac tamponade.',
            'A tension pneumothorax does the same from further out: air under pressure in the chest flattens the large veins and the heart.',
            'Both are treated by letting the pressure out: a needle or a drain into the sac for tamponade, a needle or an opening in the chest wall for a tension pneumothorax. Bedside ultrasound in trained hands may show either, as long as it does not interrupt CPR.',
          ],
          look: 'The right ventricle is ringed. Compare its thin wall with the thick wall of the left ventricle next to it: under pressure from outside, the right side is squeezed shut first.',
          show: { structure: 'right-ventricle' },
          check: {
            kind: 'choice',
            question: 'During a coronary procedure the blood pressure falls suddenly and the patient stops responding. The monitor still shows a fast rhythm with narrow complexes, but there is no pulse. Which cause must the team think of first?',
            options: [
              'Tamponade: bleeding into the sac around the heart',
              'Hyperkalemia: the potassium has risen',
              'A pulmonary embolism from the leg veins',
              'An overdose of the sedative that was given',
            ],
            answer: 0,
            explain: 'A wire or a balloon can tear a coronary artery or the heart wall, and blood then fills the pericardial sac within minutes. A fast, narrow rhythm with no pulse fits a heart that is beating but cannot fill. A clot in the lungs can look the same, but here the collapse followed a device inside the heart. The fix is drainage, with CPR until it is done.',
          },
          roleNote: {
            2: 'Needle decompression of a suspected tension pneumothorax is in your scope where protocol allows. Draining the pericardium is not: for suspected tamponade your part is to say so and to move, with CPR on the way.',
            3: 'You are often the first to see it: the arterial pressure trace falls and flattens. Call it out to the operator at once, and have the pericardiocentesis tray and the echo machine brought to the table.',
            4: 'In the lab, a sudden fall in pressure after a wire or a device has been inside the heart is tamponade until proven otherwise. Tell the operator, bring the pericardiocentesis tray and get the echo machine to the table.',
          },
          more: ['cardiac-tamponade', 'pericardiocentesis', 'cl-comp-tamponade'],
        },
        {
          title: 'Toxins: when a drug stopped the heart',
          text: [
            'Toxins are drugs and poisons. Some stop the breathing first, and the heart then arrests for lack of oxygen: opioids are the most common example. Others act on the heart itself, such as an overdose of a heart or blood pressure medicine.',
            'Look for the evidence: pill bottles, patches, syringes, and what bystanders say. Bring the containers with the patient.',
            'In a suspected opioid overdose with a pulse but no adequate breathing, naloxone and rescue breathing are the treatment. Once there is no pulse, CPR with breaths and the AED come first. Naloxone may be given if it does not delay them.',
          ],
          look: 'PEA on the monitor. The yellow CO₂ line at the bottom is flat: this patient is not breathing and nobody is giving breaths yet. In an overdose arrest the breaths are an essential part of the CPR.',
          show: { heart: false, ecg: 'defib', rhythm: 'pea' },
          check: {
            kind: 'choice',
            question: 'You find a 25-year-old unresponsive with a syringe next to him. He is not breathing and you feel no pulse. Naloxone is in your bag. What comes first?',
            options: [
              'CPR with breaths, and the AED as soon as it is on',
              'Naloxone, then check again in 2 minutes',
              'Rescue breaths only: opioids stop the breathing, not the heart',
              'Two doses of naloxone before starting compressions',
            ],
            answer: 0,
            explain: 'With no pulse this is a cardiac arrest, and CPR with breaths and early use of the AED come first. Naloxone may be given, but it must not delay them. Rescue breathing with naloxone is the treatment for an overdose patient who still has a pulse.',
          },
          roleNote: {
            1: 'Naloxone is in your scope, per protocol. In a patient with no pulse, give it only once CPR is running and the AED is on, and only if a free pair of hands can do it without stopping either.',
          },
        },
        {
          title: 'Search while you compress',
          text: [
            'The search never stops CPR. One team member, usually the leader, runs through the Hs and Ts out loud while compressions continue, and asks three things: what happened before the collapse, what is at the scene, and what does the body show?',
            'A rule of thumb for PEA: a fast rhythm with narrow complexes points toward a heart that is empty or obstructed (bleeding, tamponade, tension pneumothorax, pulmonary embolism). A slow rhythm with wide complexes points toward a chemical cause (high potassium, acidosis, lack of oxygen, some overdoses).',
            'Treat what you find while CPR goes on. A cause that is not corrected will stop the heart again.',
          ],
          look: 'This PEA is slow, with wide complexes. By the rule of thumb, think first of a chemical cause.',
          check: {
            kind: 'choice',
            question: 'A dialysis patient who has missed two sessions collapses. The monitor shows this slow, wide rhythm and there is no pulse. Which reversible cause is the most likely?',
            options: [
              'Hyperkalemia: potassium has built up between dialysis sessions',
              'Hypovolemia: dialysis patients are always short of fluid',
              'Tension pneumothorax: air trapped under pressure around a lung',
              'Pulmonary embolism: a clot that has traveled from the leg veins',
            ],
            answer: 0,
            explain: 'Missed dialysis lets potassium climb, and high potassium produces this picture: a slow, widening rhythm that ends in PEA or asystole. The team continues CPR and treats the potassium per protocol. A pulmonary embolism or a tension pneumothorax would more often show a fast, narrow rhythm.',
          },
          more: ['hyperkalemia', 'pulmonary-embolism', 'cardiac-tamponade', 'pe-presentation'],
        },
      ],
    },

    // ─── 6 ───────────────────────────────────────────────────────────────
    {
      id: 'after-the-pulse-returns',
      title: 'After the pulse returns',
      goal: 'Recognize the return of circulation and set the first targets of care: oxygen, blood pressure, a 12-lead ECG, temperature and the right hospital.',
      minutes: 8,
      steps: [
        {
          title: 'ROSC: the pulse is back',
          text: [
            'ROSC means return of spontaneous circulation: the heart is pumping by itself again. You find it at a rhythm check, when an organized rhythm comes with a pulse you can feel.',
            'Other signs can arrive first: a sudden, lasting jump in the EtCO2, typically to 40 mmHg or more, a pulse wave on the oximeter, or a patient who starts to breathe, cough or move.',
            'Whatever the first sign, confirm it with a pulse check and a blood pressure.',
          ],
          look: 'Circulation is back. The blue Pleth line pulses with every beat, SpO₂ shows a number, and the yellow CO₂ wave rises with each breath. Press Pulse check in the panel.',
          show: { heart: false, ecg: 'defib', rhythm: 'sinus-tachycardia', hr: 108 },
          check: {
            kind: 'choice',
            question: 'During CPR the EtCO2 has been about 15 mmHg. It suddenly rises to 45 mmHg and stays there. What does this most likely mean?',
            options: [
              'Circulation has returned: confirm it with a pulse check',
              'The compressor is pushing too hard and too fast',
              'The breathing tube has slipped out of the windpipe',
              'The last dose of epinephrine was given too fast',
            ],
            answer: 0,
            explain: 'CO2 reaches the lungs only as fast as blood carries it. A sudden, lasting rise, typically to 40 mmHg or more, means far more blood is flowing: the heart has probably restarted. A tube that has come out makes the number fall to almost nothing.',
          },
        },
        {
          title: 'The first minutes are fragile',
          text: [
            'A heart that restarted a minute ago is stunned. It may pump weakly, the blood pressure may be low, and the rhythm that caused the arrest may return within minutes.',
            'The brain has been short of oxygen and is easily injured a second time: by low blood pressure, by too little oxygen, by too much oxygen, and by fever.',
            'Care after an arrest means protecting the brain and the heart from that second injury while you find and treat the cause. Keep the pads on, keep the monitor on, and keep checking the pulse.',
          ],
          look: 'Sinus tachycardia on the monitor: fast and regular, with narrow complexes. A fast rate is expected in the first minutes, partly from the epinephrine still in the blood.',
        },
        {
          title: 'Oxygen: 90 to 98%',
          text: [
            'Give 100% oxygen until the saturation can be measured reliably. Then turn the oxygen down to keep the SpO2 between 90 and 98%.',
            'Too little oxygen injures the brain a second time. Too much is harmful as well, so 100% is not the target once you have a reading you can trust.',
            'If you are breathing for the patient, do not overdo it: start at about 10 breaths a minute. Fast, deep breaths lower the blood pressure and narrow the blood vessels of the brain.',
          ],
          look: 'Find the SpO₂ number, in blue. A reading can be trusted only when the Pleth wave next to it is clean and regular, as it is here.',
          check: {
            kind: 'choice',
            question: 'Ten minutes after ROSC the oximeter shows a clean wave and reads 100% on high-flow oxygen. What saturation should the team aim for now?',
            options: ['85 to 89%', '90 to 98%', '99 to 100%', 'Any value, as long as the oxygen stays at 100%'],
            answer: 1,
            fixed: true,
            explain: 'Once the reading can be trusted, the oxygen is turned down to keep the SpO2 between 90 and 98%. Staying on 100% oxygen gives the brain more than it needs, which is harmful too, and below 90% it is starved. Before 2025 the lower limit was 92%.',
          },
          roleNote: {
            1: 'Oxygen and bag-valve-mask breaths are in your scope. For a patient who has a pulse but is not breathing, squeeze the bag once every 6 seconds and watch the chest rise: enough to see it, no more.',
          },
        },
        {
          title: 'Blood pressure: a MAP of at least 65',
          text: [
            'Low blood pressure after ROSC starves a brain and a heart that have already been without blood flow. The target is a mean arterial pressure (MAP) of at least 65 mmHg. The MAP is the average pressure across one whole heartbeat.',
            'Measure the pressure straight away and every few minutes after that. Low pressure is treated with IV fluid when the patient is short of volume, and with a drug that tightens the blood vessels or strengthens the heartbeat. The 2025 guidelines do not prefer one such drug over another.',
          ],
          look: 'Press NIBP in the panel. After a few seconds the cuff pressure appears in the NIBP box on the monitor, with the MAP in brackets underneath.',
          check: {
            kind: 'choice',
            question: 'After ROSC the blood pressure is 82/50 mmHg, a MAP of about 61. What does that mean for this patient?',
            options: [
              'It is too low: the target is a MAP of at least 65 mmHg',
              'It is acceptable: any pulse is enough after an arrest',
              'It is too high: the heart needs rest',
              'It can wait until the patient reaches the hospital',
            ],
            answer: 0,
            explain: 'A MAP of 61 is below the target of at least 65 mmHg. Low pressure adds to the injury of a brain and a heart that have already gone without blood flow, so it is treated now, not on arrival. A pulse alone does not show that the pressure is enough.',
          },
          roleNote: {
            2: 'Treat low pressure per protocol: fluid when it fits the patient, then a vasopressor infusion. Recheck after every change.',
            4: 'With an arterial line you have the MAP beat by beat. Call it out, and prepare the vasopressor the physician orders.',
          },
        },
        {
          title: 'The 12-lead: looking for a blocked artery',
          text: [
            'Record a 12-lead ECG as soon as you can after ROSC. You are looking for the most treatable cause of all: a coronary artery blocked by a clot.',
            'If the 12-lead shows ST elevation, a STEMI, the patient needs emergency coronary angiography to find the artery and open it. That holds whether the patient is awake or still unconscious.',
          ],
          look: 'This 12-lead was recorded after ROSC. Compare the segment that follows each QRS with the flat line before the P wave. In several chest leads it is lifted well above that line: ST elevation.',
          show: { ecg: 'ecg', layout: 'simultaneous', rhythm: 'anterior-stemi' },
          check: {
            kind: 'lead',
            question: 'Tap a lead that shows ST elevation.',
            targets: ['V1', 'V2', 'V3', 'V4', 'V5'],
            explain: 'The ST segment is raised in V1 to V5, most of all in V2 to V4. These are the leads that look at the front of the heart: an anterior STEMI. Leads I and aVL are lifted only slightly, and the leads that look at the bottom of the heart are not raised at all.',
          },
          roleNote: {
            1: 'Where your protocol allows, you record and transmit this 12-lead. Reading it is for the paramedic and the physician. A clean tracing sent early is your contribution: a still patient, electrodes pressed on firmly, cables untangled.',
            2: 'ST elevation after ROSC: activate the STEMI system per protocol and give both facts in your report: an arrest with ROSC, and now ST elevation.',
            4: 'A STEMI patient after an arrest often arrives with a breathing tube and infusions running, and may arrest again. Have the defibrillator pads on and connected before the patient is moved to the table.',
          },
          more: ['anterior-stemi'],
        },
        {
          title: 'Where the clot is',
          text: [
            'ST elevation in the front leads comes from the front wall of the left ventricle, which is fed by the LAD (left anterior descending artery). The clot is in that artery.',
            'The muscle beyond the clot is dying minute by minute, and an injured, irritable ventricle is what set off the VF. Opening the artery treats the cause of the arrest and protects against the next one.',
          ],
          look: 'The dusky, pulsing area on the front of the heart is the muscle that is losing its blood supply.',
          show: { ecg: false, heart: 'external', camera: 'Front' },
          check: {
            kind: 'tap',
            question: 'Tap the artery that is blocked.',
            targets: ['lad-proximal', 'lad-mid', 'lad-distal'],
            explain: 'The LAD runs down the front of the heart between the two ventricles and feeds the front wall, the front of the septum and the apex. Blocked near its start, it puts more heart muscle at risk than any other artery, which is why this heart went into VF.',
          },
          more: ['coronary-angiography', 'pci-stent'],
        },
        {
          title: 'Temperature: control it on purpose',
          text: [
            'A patient who does not follow commands after ROSC has a brain injury in progress, and fever makes it worse.',
            'These patients receive temperature control in the hospital: the team chooses a target between 32 and 37.5 °C (89.6 and 99.5 °F) and holds the body there with a cooling and warming device, for at least 36 hours in all.',
            'Your part before the intensive care unit: check whether the patient follows a simple command, such as "squeeze my hand", and record that together with the time of ROSC.',
          ],
          look: 'Back at the monitor. It shows the heart, the oxygen and the breathing, but not the brain. Whether the patient follows commands is something only you can check, at the bedside.',
          show: { heart: false, ecg: 'defib', rhythm: 'sinus-tachycardia', hr: 104 },
          check: {
            kind: 'choice',
            question: 'Twenty minutes after ROSC a patient has a good blood pressure and saturation but does not follow commands. What does that mean for the hospital care?',
            options: [
              'Temperature control: a target between 32 and 37.5 °C for at least 36 hours',
              'Nothing special: the patient will wake up once the drugs have worn off',
              'Active warming to above 38 °C, to speed up the recovery of the brain',
              'Temperature control, but only if the first rhythm of the arrest was VF',
            ],
            answer: 0,
            explain: 'Adults who do not follow commands after ROSC receive temperature control, whatever the first rhythm was and wherever the arrest happened: a target between 32 and 37.5 °C, held for at least 36 hours. Fever is the thing to prevent.',
          },
        },
        {
          title: 'Where the patient goes',
          text: [
            'A patient with ROSC needs a hospital that can provide everything the next days require: emergency coronary angiography at any hour, temperature control and intensive care. In many regions these are designated cardiac arrest centers. Follow your destination protocol.',
            'Tell the hospital early: the time of collapse, whether bystanders gave CPR, the first rhythm, the number of shocks, the drugs, the time of ROSC, and what the 12-lead shows.',
            'Then expect the arrest to happen again on the way, and be ready for it: pads on, monitor on, a hand free for the pulse.',
          ],
          look: 'Keep watching the green trace. If it turns chaotic again, you are back in lesson 4: pulse check, CPR, shock.',
          check: {
            kind: 'choice',
            question: 'On the way to the hospital after ROSC, the monitor suddenly shows a chaotic rhythm and the patient stops moving. What do you do first?',
            options: [
              'Check for a pulse, start CPR and defibrillate: the arrest is back',
              'Record another 12-lead before doing anything else',
              'Turn up the oxygen and keep watching the monitor',
              'Continue to the hospital and report the change on arrival',
            ],
            answer: 0,
            explain: 'VF often returns in the first minutes and hours after ROSC. An unresponsive patient with a chaotic rhythm and no pulse is in cardiac arrest again, and the treatment is the same as the first time: CPR and an immediate shock, with the pads that are already on.',
          },
          roleNote: {
            1: 'Hand over in the same order every time: what happened, what was done, when the pulse came back, and how the patient is now.',
            4: 'When the call comes that a patient with ROSC and ST elevation is on the way, prepare for an unstable patient: defibrillator checked, pads ready, and the drugs and pumps the physician is likely to order within reach.',
          },
          more: ['ventricular-fibrillation', 'cl-stemi-system'],
        },
      ],
    },

    // ─── 7 ───────────────────────────────────────────────────────────────
    {
      id: 'unstable-with-a-pulse',
      title: 'Unstable, but with a pulse',
      goal: 'Recognize an unstable patient who still has a pulse, and explain synchronized cardioversion for a fast rhythm and atropine then pacing for a slow one.',
      minutes: 10,
      steps: [
        {
          title: 'A pulse, but not for long',
          text: [
            'Not every emergency rhythm is a cardiac arrest. Some patients still have a pulse, but the heart is beating so fast or so slowly that it cannot supply the body. Left alone, they are on the way to an arrest.',
            'The question is not the number on the monitor. It is whether the rhythm is making the patient unstable. The signs: low blood pressure, sudden confusion or drowsiness, signs of shock (pale, cold, sweaty skin), chest pain from the heart, and acute heart failure (sudden breathlessness with fluid in the lungs).',
            'Unstable means treat now, with the fastest treatment that works. Stable means there is time for a 12-lead ECG and a careful plan.',
          ],
          look: 'A fast, regular rhythm with narrow complexes, at about 190 a minute. The blue Pleth line still pulses: this patient has a pulse. The monitor cannot show confusion, cold skin or chest pain. Those you find on the patient.',
          show: { heart: false, ecg: 'defib', rhythm: 'avnrt', hr: 190 },
          check: {
            kind: 'choice',
            question: 'Four patients have a heart rate of 180. Which one is unstable?',
            options: [
              'A 70-year-old who is confused, pale and sweaty, with a blood pressure of 76/40',
              'A 25-year-old who feels her heart racing and is alert, with a blood pressure of 118/70',
              'A 40-year-old who is anxious, with warm dry skin and a blood pressure of 130/80',
              'A 30-year-old who has finished a run, breathing hard and alert, with a blood pressure of 124/76',
            ],
            answer: 0,
            explain: 'Confusion, cold sweaty skin and a low blood pressure show that the fast rhythm is failing to supply the brain and the body. The other three have the same number on the monitor but a clear head, warm skin and a good pressure: they are stable, and there is time.',
          },
          roleNote: {
            1: 'This step is your part of the lesson. You do not name the rhythm, and you do not cardiovert or pace. You recognize the unstable patient from these signs, request ALS at once, give oxygen if the saturation is low, and keep the AED next to the patient.',
          },
        },
        {
          title: 'Fast and unstable: synchronized cardioversion',
          text: [
            'When a fast rhythm is making a patient with a pulse unstable, the treatment is a shock called synchronized cardioversion. Like defibrillation, it fires all the heart muscle at once. That breaks the short circuit driving the fast rhythm and lets the SA node take over.',
            'The difference is timing. A defibrillation shock is given the instant you press the button. A synchronized shock waits until the machine finds the next R wave, the tall peak of the QRS, and fires on it.',
            'If the patient is awake, give sedation first whenever there is time: the shock hurts.',
          ],
          look: 'Press Manual, then SYNC. A white "SYNC" tag appears at the top of the monitor, and a small white marker sits above each QRS: the machine is showing you the beats it will fire on.',
          roleNote: {
            1: 'The Manual button is locked for your role: cardioversion is an ALS skill. Read on to understand what the paramedics will do, and why they will ask everyone to stand clear.',
            4: 'Sedation for cardioversion is given on the practitioner\'s order, with the practitioner present. Have suction, a bag-valve-mask and capnography ready before the first dose.',
          },
          more: ['cardioversion'],
        },
        {
          title: 'Why the timing matters',
          text: [
            'Every heartbeat has a short vulnerable period, during the T wave, when the ventricles are recharging and are electrically unstable. A shock that lands there can throw an organized rhythm into VF.',
            'A patient in VF has no R waves and no T waves: there is nothing to synchronize to and nothing to lose, so you defibrillate. A patient with an organized rhythm and a pulse has a great deal to lose, so the shock is tied to the R wave, safely away from the T wave.',
            'Two cautions. If the markers sit on T waves instead of QRS complexes, do not shock: choose another lead. And many defibrillators switch SYNC off after each shock, so check it before every one.',
          ],
          look: 'One lead of a normal rhythm, enlarged and slowed down, with its waves labeled. The QRS is the tall narrow spike: a synchronized shock fires there. The T wave is the rounded hump after it: the vulnerable period.',
          show: { ecg: 'ecg', rhythm: 'normal-sinus', hr: 70, inspect: 'II', speed: 0.5 },
          check: {
            kind: 'choice',
            question: 'SYNC is on, ready to cardiovert a patient in VT. Before you shock, the pulse is lost and the rhythm turns to VF. You press SHOCK and nothing happens. Why, and what do you do?',
            options: [
              'The machine is waiting for an R wave: switch SYNC off and defibrillate',
              'The battery is flat: fetch another defibrillator and start again',
              'The energy is too low: raise it and try again with SYNC on',
              'VF cannot be shocked: continue with CPR and nothing else',
            ],
            answer: 0,
            explain: 'A synchronized shock is only released on an R wave. VF has none, so the machine waits and no shock comes. Switch SYNC off, defibrillate and start CPR. This is why you always know whether SYNC is on or off before you press the button.',
          },
        },
        {
          title: 'How much energy',
          text: [
            'The 2025 AHA guidelines give a starting energy for each rhythm, for a biphasic defibrillator. Narrow and regular: 100 J. Monomorphic VT with a pulse (wide, regular, every complex the same shape): 100 J. Atrial flutter: 200 J. Atrial fibrillation (narrow and irregular): at least 200 J.',
            'If the first shock fails, raise the energy. If you do not know the right setting for your machine, use the maximum. Some of these values are higher than the ones taught before 2025, which older reference cards still show. Your protocol and your device have the last word.',
            'Polymorphic VT, a wide rhythm whose complexes keep changing shape, is the exception. The machine cannot lock on to it, so it is given an unsynchronized shock at the defibrillation dose, like VF.',
          ],
          look: 'Narrow and regular: the starting energy is 100 J. With Manual and SYNC on, tap 100J, press CHARGE, then SHOCK. The shock fires on the next R wave, and the Code record reports whether the rhythm converted.',
          show: { ecg: 'defib', rhythm: 'avnrt', hr: 190, speed: 1 },
          check: {
            kind: 'choice',
            question: 'An unstable patient has a narrow, irregular rhythm at 160 a minute: atrial fibrillation. What is the starting energy for synchronized cardioversion?',
            options: ['50 J', '100 J', 'At least 200 J', 'No shock: atrial fibrillation is treated with drugs only'],
            answer: 2,
            fixed: true,
            explain: 'Atrial fibrillation needs more energy than the regular rhythms: at least 200 J biphasic to start. 100 J is the starting energy for a narrow regular tachycardia and for monomorphic VT with a pulse. An unstable patient is not left to wait for drugs.',
          },
          roleNote: {
            2: 'Per protocol: SYNC on, markers confirmed on the QRS, sedation if time allows, energy selected, everyone clear, then press and hold until it fires. Reassess the rhythm and the pulse after every shock.',
          },
          more: ['cardioversion', 'avnrt', 'atrial-fibrillation', 'unstable-svt'],
        },
        {
          title: 'Wide and fast: check the pulse',
          text: [
            'A wide, fast, regular rhythm is treated as VT. What you do next depends on one finding: the pulse.',
            'A pulse with signs of instability: synchronized cardioversion, starting at 100 J. No pulse: this is pulseless VT, a cardiac arrest. SYNC off, defibrillate, CPR.',
            'These patients can lose their pulse from one minute to the next. Keep the pads on and a hand on the pulse, and be ready to change plans.',
          ],
          look: 'Wide complexes, all the same shape, at about 170 a minute. Press Pulse check in the panel: this patient still has a pulse. If SYNC is on, a marker sits above every complex.',
          show: { rhythm: 'vt', hr: 170 },
          check: {
            kind: 'choice',
            question: 'This wide, regular rhythm at 170 a minute belongs to a man who is confused, with a weak pulse and a systolic pressure of 70. What is the treatment?',
            options: [
              'Synchronized cardioversion, starting at 100 J',
              'An unsynchronized shock and CPR',
              'Watch and wait: he still has a pulse',
              'Atropine 1 mg',
            ],
            answer: 0,
            explain: 'VT with a pulse and signs of instability is cardioverted with a synchronized shock, starting at 100 J. An unsynchronized shock and CPR are for the moment the pulse is lost. Waiting risks exactly that, and atropine is for slow rhythms.',
          },
          more: ['monomorphic-vt', 'vt-storm'],
        },
        {
          title: 'Slow and unstable',
          text: [
            'A slow heart can fail the body as surely as a fast one. A slow rate, typically below 50 a minute, needs treatment when it is the reason for the low blood pressure, the confusion, the chest pain or the shock.',
            'First look for a cause you can correct. Lack of oxygen is one: support the airway and the breathing before anything else. Others are a heart attack, medicines that slow the heart, and high potassium.',
            'This patient is in complete heart block. No signal crosses from the atria to the ventricles, and a slow backup pacemaker in the ventricles is all that keeps the blood moving.',
          ],
          look: 'The heart is see-through, showing its wiring. The atria fire at their own pace, and each signal stops at the red ✕. The ventricles answer to a separate, much slower pacemaker.',
          show: { heart: 'conduction', ecg: 'ecg', layout: 'monitor', rhythm: 'third-degree-avb', hr: 34, focus: 'heart' },
          check: {
            kind: 'tap',
            question: 'Tap the structure where the signal from the atria is being stopped.',
            targets: ['av-node', 'bundle-of-his'],
            explain: 'In complete heart block the signal from the atria gets no further than the AV node or the bundle of His below it. The red ✕ marks the spot. In this patient the backup rhythm of the ventricles is wide and slow, which points to a block low down, below the AV node.',
          },
          more: ['third-degree-av-block'],
        },
        {
          title: 'Atropine first',
          text: [
            'The first drug for an unstable slow rhythm is atropine: 1 mg by IV, repeated every 3 to 5 minutes, up to a total of 3 mg.',
            'Atropine blocks the vagus nerve, the nerve that acts as a brake on the SA node and the AV node. With the brake released, the SA node fires faster and the AV node lets more signals through.',
            'That is also its limit. When the block lies below the AV node, as in most complete heart block with a wide, slow rhythm, atropine has nothing to act on and usually fails. Do not wait for it: get the pacer ready while the first dose goes in.',
          ],
          look: 'The same patient on the monitor. Press Atropine in the Medications list and keep an eye on the Code record: after about 15 seconds it reports no response in this wide, slow rhythm.',
          show: { heart: false, ecg: 'defib' },
          check: {
            kind: 'choice',
            question: 'Why does atropine so often fail in complete heart block with a wide, slow rhythm?',
            options: [
              'The block lies below the AV node, where atropine has no effect',
              'A dose of 1 mg is too small to work in most adults',
              'Atropine only acts on fast rhythms, not on slow ones',
              'It needs about 30 minutes before it takes effect',
            ],
            answer: 0,
            explain: 'Atropine speeds up the SA node and the AV node by blocking the vagus nerve. A block further down the wiring is beyond its reach, so the ventricles stay slow. 1 mg is the full adult dose, and when atropine works it does so within minutes.',
          },
          roleNote: {
            1: 'Atropine is an ALS drug and the button is locked for you. A slow pulse with low pressure, confusion or chest pain is your cue to request ALS and to support the breathing.',
            4: 'Atropine is given on order or per the ACLS protocol. In the lab the common reason is a vagal reaction, with a slow pulse, low pressure, nausea and sweating: tell the operator as you see it.',
          },
          more: ['atropine'],
        },
        {
          title: 'Pacing: an outside pacemaker',
          text: [
            'If atropine fails, the heart is paced from outside. In transcutaneous pacing the defibrillator sends small, regular pulses of current through the pads, and each one triggers a beat. The alternative is an infusion of epinephrine or dopamine, per protocol.',
            'Set a rate, then raise the current (in mA) until every pacing spike is followed by a wide QRS. That is electrical capture.',
            'Then make sure each paced beat produces a pulse. Feel it at the groin or see it on the oximeter wave, because the current makes the chest and neck muscles twitch and can fool a finger on the neck. Pacing hurts: give pain relief and sedation, per protocol.',
          ],
          look: 'Press Pacer, then START PACER, and raise Output with the + button. At first the spikes fire with no effect and the monitor reads "no capture". Past the threshold, every spike is followed by a wide QRS.',
          check: {
            kind: 'choice',
            question: 'The pacer fires at 70 a minute and every spike is followed by a wide QRS. You feel no pulse and the Pleth line is flat. What is this?',
            options: [
              'Electrical capture with no pulse: treat it as PEA and start CPR',
              'Successful pacing: continue to the hospital as planned',
              'Too much current: turn the output down a little',
              'A normal finding in the first few minutes of pacing',
            ],
            answer: 0,
            explain: 'A QRS after every spike only shows that the electricity is getting through. If no pulse comes with it, the heart is not pumping: an organized rhythm with no pulse is PEA, whether a pacemaker or the heart itself is producing it. Start CPR.',
          },
          roleNote: {
            1: 'Pacing is an ALS skill and the Pacer button is locked for you. If the pulse is lost at any point, your skills take over: CPR and the AED.',
            2: 'Per protocol: set the rate, raise the output to capture and a little above it, confirm a pulse with every paced beat, and treat the pain.',
            4: 'Assess pain and sedation and give what is ordered. Watch the groin pulse or the arterial line for each paced beat, not the neck.',
          },
          more: ['temporary-pacing', 'bradycardia-with-shock'],
        },
        {
          title: 'The patient decides, not the number',
          text: [
            'Fast and unstable, with a pulse: a synchronized shock. Slow and unstable, with a pulse: atropine, then pacing. No pulse: CPR, and a shock if the rhythm is VF or pulseless VT.',
            'In every case the decision starts with the patient: responsive or not, pulse or no pulse, stable or unstable. The monitor comes second.',
          ],
          look: 'A slow, regular rhythm at 38 a minute, with a pulse on the Pleth line. If the pacer is still running from the last step, press STOP PACER.',
          show: { rhythm: 'sinus-bradycardia', hr: 38 },
          check: {
            kind: 'choice',
            question: 'A woman has a heart rate of 38. She is alert, warm and talking comfortably, with a blood pressure of 124/78. What is the right approach?',
            options: [
              'Monitor her and look for the cause: she is stable',
              'Atropine 1 mg now: the rate is below 50',
              'Pacing now, before she becomes unstable',
              'Synchronized cardioversion at 100 J',
            ],
            answer: 0,
            explain: 'Treatment is driven by instability, not by the number. A slow rate that is supplying the brain and the body well is watched while the cause is looked for. Atropine and pacing are for a slow rate that causes low pressure, confusion, chest pain or shock.',
          },
          more: ['sinus-bradycardia', 'cardioversion', 'temporary-pacing'],
        },
      ],
    },
  ],
};
