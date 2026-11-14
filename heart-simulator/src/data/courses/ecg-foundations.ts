import type { Course } from '@/types/course';

/**
 * Course: reading an ECG from scratch — what the tracing records, the waves and intervals, rate and
 * rhythm, the twelve leads and the wall each one faces, electrode placement, the axis, and one fixed
 * order for reading any 12-lead. No ECG background needed.
 *
 * Numbers follow the AHA/ACCF/HRS recommendations for the standardization and interpretation of the
 * electrocardiogram (2007–2009), the Fourth Universal Definition of Myocardial Infarction (2018) and
 * the 2025 ACC/AHA acute coronary syndromes guideline, and agree with the app's own rhythm profiles
 * and library pages (the reading order is the library's: rate, rhythm, intervals, axis, ST-T).
 * Educational content only.
 *
 * Two things the lesson player does that the steps are written around:
 *  - a step that selects a lead lets the lead view frame the heart itself (a `camera` on the same
 *    step is overridden, or cuts the line of sight off), so those steps name no camera angle;
 *  - a step cannot set the cable placement, so lesson 5 asks the learner to swap and reset the cables.
 */
export const ECG_FOUNDATIONS: Course = {
  id: 'ecg-foundations',
  title: 'Reading an ECG from scratch',
  summary: 'Start from zero and finish able to read a 12-lead: what the tracing measures, the waves and intervals, rate and rhythm, the twelve leads, where the electrodes go, the axis, and one fixed order for every ECG.',
  roles: [2, 3, 4, 5, 6, 7],
  level: 'beginner',
  lessons: [
    // ─── 1 ───────────────────────────────────────────────────────────────
    {
      id: 'what-it-measures',
      title: 'What an ECG measures',
      goal: 'Explain what an ECG records, say why a wave points up or down, and measure time and voltage on the grid.',
      minutes: 7,
      steps: [
        {
          title: 'Electricity, not the squeeze',
          text: [
            'An ECG (electrocardiogram, also written EKG) is a recording of the heart\'s electrical activity, picked up by electrodes: sticky sensors on the skin. Every heartbeat starts as an electrical signal that spreads through the heart muscle. The muscle squeezes a split second later.',
            'The ECG shows the signal. It does not show the squeeze, the blood pressure or the pulse. That is the first rule of reading one: the tracing tells you about the heart\'s wiring and muscle cells, and the patient tells you whether blood is moving.',
          ],
          look: 'The heart is see-through and slowed to a quarter of real speed. With each beat a glow sweeps across it. On the tracing below, the green line draws the waves at the same moment, just behind the thin white sweep line.',
          show: { heart: 'conduction', camera: 'Front', labels: false, ecg: 'ecg', layout: 'monitor', rhythm: 'normal-sinus', hr: 70, speed: 0.25, focus: 'heart' },
        },
        {
          title: 'The signal comes first',
          text: [
            'This chart puts the ECG on the top row and, below it in yellow, the pressure inside the left ventricle (the heart\'s main pumping chamber). Watch the order. First the tall spike on the ECG. Then the pressure climbs.',
            'That short delay is the muscle answering the signal. If the signal is there but the heart pumps too little blood to make a pulse, the monitor shows a rhythm and the patient has none. That is pulseless electrical activity (PEA), and it is treated as cardiac arrest.',
          ],
          look: 'Top row: the ECG in green. In the panel below it, the yellow line (left ventricle pressure) starts to rise right after each tall spike, at the dashed line marked MC. Ignore the other curves for now.',
          show: { ecg: 'wiggers', heart: false, speed: 0.5 },
          check: {
            kind: 'choice',
            question: 'A monitor shows a regular, normal-looking rhythm. What does that tell you about the pulse?',
            options: [
              'Nothing: you have to check the patient',
              'The pulse rate matches the number on the monitor',
              'The blood pressure is at least adequate',
              'The heart is pumping, though perhaps weakly',
            ],
            answer: 0,
            explain: 'The ECG records electrical activity only. An organized rhythm with no pulse is pulseless electrical activity (PEA). The number on the monitor counts electrical complexes, not beats you can feel.',
          },
          roleNote: {
            1: 'A rhythm on the monitor never replaces a pulse check. No pulse means CPR and the AED, whatever the screen shows.',
            2: 'An organized rhythm without a pulse is PEA: start CPR and follow the cardiac arrest algorithm per protocol.',
          },
          more: ['normal-sinus-rhythm'],
        },
        {
          title: 'A lead is a camera',
          text: [
            'A lead is one view of the heart\'s electricity. The machine makes it by comparing electrodes: one acts as the positive end, and the lead records the voltage between it and a negative reference point.',
            'Think of the positive electrode as a camera. It looks at the heart from where it sits. Lead II has its positive electrode on the left leg, so it looks up at the heart from below and a little to the patient\'s left.',
          ],
          look: 'The cyan line is lead II\'s line of sight. It starts at the tag "II (+) looks from here", passes through the heart and leaves at (−). The ring marks the wall it faces.',
          show: { heart: 'external', labels: false, ecg: 'ecg', lead: 'II', speed: 0.25, focus: 'heart' },
        },
        {
          title: 'Toward the camera draws upward',
          text: [
            'One rule explains the shape of every ECG. When the electrical wave travels toward a lead\'s positive electrode, that lead draws an upward wave. When it travels away, the lead draws a downward wave. When it travels across the line of sight, the wave is small or flat.',
            'In a normal heart the main wave travels down and to the patient\'s left, almost straight at lead II. That is why lead II draws its waves tall and upright, and why it is the favorite lead for watching a rhythm.',
          ],
          look: 'Watch the bead on the cyan line. As lead II draws its tall spike, the bead turns green and slides toward the (+) end. The yellow arrow shows which way the wave is heading at that instant.',
          show: { lead: 'II', focus: 'heart' },
          check: {
            kind: 'choice',
            question: 'An electrical wave travels directly away from a lead\'s positive electrode. What does that lead draw?',
            options: [
              'A downward wave',
              'An upward wave',
              'A flat line',
              'Nothing: a lead only records waves coming toward it',
            ],
            answer: 0,
            explain: 'Away from the positive electrode draws downward. A flat or very small wave means the electricity is crossing the line of sight at a right angle. Every lead records every wave: only the direction on the paper changes.',
          },
        },
        {
          title: 'The same beat from the other side',
          text: [
            'Lead aVR has its positive electrode on the right arm. It looks at the heart from the right shoulder, so the normal wave travels away from it.',
            'That is why everything in aVR normally points down. Nothing is wrong with the heart: the camera is on the far side. Twelve leads are twelve cameras around one heartbeat, and each draws it differently.',
          ],
          look: 'All twelve leads are on screen now. aVR\'s line of sight starts at the patient\'s right shoulder. During the tall spike the bead turns red and slides toward (−), and aVR draws the spike downward.',
          show: { layout: 'simultaneous', lead: 'aVR', focus: 'ecg' },
          check: {
            kind: 'lead',
            question: 'aVR is not the only lead that points down. Tap another lead whose biggest deflection is downward.',
            targets: ['V1', 'V2'],
            explain: 'V1 and V2 sit on the front of the chest, to the right of the main pumping muscle. The main wave travels to the left and toward the back, away from them, so they draw a small upward blip and then a deep downward wave.',
          },
        },
        {
          title: 'The grid is a ruler: time',
          text: [
            'ECG paper is a grid, and the grid is a ruler. Left to right is time. At the standard speed of 25 mm per second, each small box (1 mm) is 0.04 seconds and each large box (5 small boxes) is 0.20 seconds. Five large boxes make 1 second.',
            'Almost everything you measure on an ECG is a count of boxes, so learn these two numbers by heart: small box 0.04 s, large box 0.20 s.',
          ],
          look: 'One lead is enlarged. Thin lines mark the small boxes and heavier lines mark the large ones. The corner of the tracing shows the speed: 25 mm/s. Ignore the yellow labels for now.',
          show: { heart: false, inspect: 'II', speed: 1 },
          check: {
            kind: 'choice',
            question: 'A wave is 3 small boxes wide at standard speed. How long does it last?',
            options: ['0.04 s', '0.12 s', '0.20 s', '0.60 s'],
            answer: 1,
            fixed: true,
            explain: '3 × 0.04 s = 0.12 s. One large box is 0.20 s, so 0.60 s would be 3 large boxes, not 3 small ones.',
          },
        },
        {
          title: 'The grid is a ruler: voltage',
          text: [
            'Up and down is voltage, measured in millivolts (mV). At the standard setting, called a gain of 10 mm/mV, 10 mm of height equals 1 mV, so each small box is 0.1 mV. In practice people count millimeters: "a spike 12 mm tall" means 12 small boxes.',
            'Every tracing carries a calibration mark: a square step exactly 1 mV tall. At the standard setting it is 10 small boxes (2 large boxes) high. If the mark is half that height or double it, the gain was changed, and every wave on the page is half or double size too.',
          ],
          look: 'Find the square step at the far left of the tracing: 2 large boxes tall and 1 large box wide. The corner of the tracing shows the gain: 10 mm/mV.',
          show: { inspect: 'II' },
          check: {
            kind: 'choice',
            question: 'The calibration mark on a tracing is only 5 mm tall. What does that tell you?',
            options: [
              'Every wave is drawn at half its usual height',
              'The paper is running at half speed',
              'The patient has weak heart muscle',
              'The heart rate is half of what it looks like',
            ],
            answer: 0,
            explain: 'The mark is always 1 mV. If 1 mV is drawn 5 mm tall, the whole tracing is at half size, so check the mark before you call any wave tall or small. Paper speed changes the width of waves, not their height.',
          },
          roleNote: {
            3: 'On the lab\'s recording system, confirm the sweep speed and gain shown on screen before you compare a tracing with an earlier one.',
          },
        },
      ],
    },

    // ─── 2 ───────────────────────────────────────────────────────────────
    {
      id: 'waves-and-intervals',
      title: 'Waves and intervals',
      goal: 'Name each wave and interval, say what the heart is doing during it, and check it against its normal limit.',
      minutes: 9,
      steps: [
        {
          title: 'One heartbeat, three waves',
          text: [
            'A normal heartbeat draws the same three shapes every time: a small bump (the P wave), a tall narrow spike (the QRS complex) and a broader bump (the T wave). Each one is a different part of the heart firing or resetting.',
            'Two words first. Depolarization is the electrical firing that makes muscle squeeze. Repolarization is the reset that gets it ready to fire again. The flat line between beats, when nothing is firing or resetting, is the baseline.',
          ],
          look: 'Lead II is enlarged and the clock is slowed to a quarter of real speed. The yellow letters P, QRS and T name the three waves of the last complete beat.',
          show: { heart: 'conduction', camera: 'Front', ecg: 'ecg', inspect: 'II', rhythm: 'normal-sinus', hr: 70, speed: 0.25, focus: 'ecg' },
        },
        {
          title: 'The P wave: the atria fire',
          text: [
            'The beat starts in the sinoatrial (SA) node, the heart\'s natural pacemaker, high in the right atrium. The signal spreads across both atria (the two upper chambers) and draws the P wave. Then the atria squeeze.',
            'A normal P wave is small and rounded: less than 0.12 s wide (3 small boxes) and less than 2.5 mm tall. In lead II it is upright, because the signal travels down from the SA node toward lead II\'s camera.',
          ],
          look: 'The SA node is marked with a blue tag. Each beat starts there: the yellow tracks across the atria light up, and the atria glow while the P wave is drawn.',
          show: { structure: 'sa-node', inspect: 'II', focus: 'heart' },
          more: ['sa-node'],
        },
        {
          title: 'The PR interval: the pause at the AV node',
          text: [
            'The PR interval runs from the start of the P wave to the start of the QRS. In that time the signal crosses the atria and is then held briefly at the atrioventricular (AV) node, the only electrical doorway from the atria to the ventricles (the two lower, pumping chambers).',
            'The flat line after the P wave is that hold. It gives the atria time to finish topping up the ventricles. A normal PR interval is 0.12 to 0.20 s: 3 to 5 small boxes, never more than 1 large box.',
          ],
          look: 'Watch the signal reach the AV node (orange) and wait there before the ventricles light up. On the enlarged lead, the bracket marked PR measures that time in milliseconds (ms): 160 ms is 0.16 s.',
          show: { camera: 'Front', inspect: 'II', focus: 'heart' },
          check: {
            kind: 'tap',
            question: 'Tap the AV node: find its name tag on the heart.',
            targets: ['av-node'],
            explain: 'The AV node sits low in the wall between the atria, right above the ventricles. It holds each signal for about a tenth of a second, and that hold draws the flat part of the PR interval.',
          },
          more: ['av-node'],
        },
        {
          title: 'The QRS complex: the ventricles fire',
          text: [
            'From the AV node the signal runs down a fast wiring system (the bundle of His, the right and left bundle branches and the Purkinje fibers) and reaches both ventricles almost at once. That draws the QRS complex. It is the biggest wave on the ECG because the ventricles are the biggest muscle.',
            'The letters name its parts: a first downward wave is a Q wave, the upward wave is the R wave, and a downward wave after the R is an S wave. Many normal complexes lack one of the three. It is still called a QRS.',
            'Because the wiring is fast, a normal QRS is narrow: less than 0.12 s (3 small boxes), usually 0.08 to 0.10 s. A QRS of 0.12 s or more is called wide, and it means the signal took a slow route through the muscle.',
          ],
          look: 'The bundle of His is marked with a blue tag. The signal races down the red bundle branches, and the ventricles glow orange while the QRS is drawn.',
          show: { structure: 'bundle-of-his', inspect: 'II', focus: 'heart' },
          more: ['bundle-of-his', 'purkinje-fibers'],
        },
        {
          title: 'The ST segment: fired and squeezing',
          text: [
            'The ST segment is the line from the end of the QRS to the start of the T wave. The point where the QRS ends and the ST segment begins is called the J point.',
            'During the ST segment every ventricular muscle cell has fired and none has reset yet. No electricity is moving, so the line sits flat, level with the baseline. This is also when the ventricles are squeezing blood out.',
            'Fix the normal picture in your mind: an ST segment level with the baseline. One lifted above it (ST elevation) or pushed below it (ST depression) is among the most important findings on any ECG.',
          ],
          look: 'The heart is cut open. Just after each QRS the Cardiac cycle box reads "Rapid ejection" and blood leaves the ventricles. On the enlarged lead, a dashed line marks the ST segment: its label reads close to 0 mm.',
          show: { heart: 'sectioned', camera: 'Front', flow: true, inspect: 'II', focus: 'heart' },
          check: {
            kind: 'choice',
            question: 'What are the ventricles doing during the ST segment?',
            options: [
              'Squeezing blood out',
              'Filling with blood',
              'Resting between beats',
              'Waiting for the signal to cross the AV node',
            ],
            answer: 0,
            explain: 'Every ventricular cell has fired, so the line is flat, and the muscle is contracting: the Cardiac cycle box reads ejection. Filling comes later, after the T wave. The wait at the AV node is the PR interval, before the QRS.',
          },
        },
        {
          title: 'The T wave: the ventricles reset',
          text: [
            'The T wave is the ventricles repolarizing: resetting so they can fire again. It is lower and broader than the QRS because resetting is a slower, more gradual process than firing.',
            'A normal T wave is upright in most leads, including lead II, and it is lopsided: a slow rise and a quicker fall. The atria reset too, but that small wave is buried under the QRS.',
          ],
          look: 'On the enlarged lead, T marks the broad bump after the QRS. On the heart, a faint blue glow passes over the ventricles while it is drawn.',
          show: { inspect: 'II', focus: 'ecg' },
        },
        {
          title: 'The QT interval',
          text: [
            'The QT interval runs from the start of the QRS to the end of the T wave: the whole time the ventricles take to fire and reset. A QT that is too long leaves the heart open to a dangerous fast rhythm called torsades de pointes.',
            'The QT shortens as the heart speeds up, so it is corrected for heart rate and reported as the QTc. The machine does the math. A QTc of 450 ms (0.45 s) or more in men, or 460 ms or more in women, is prolonged. Above 500 ms the risk of torsades rises sharply.',
            'A quick screen at heart rates of 60 to 100: the QT should be less than half the distance from one QRS to the next. If it looks longer, or the heart is slow, go by the QTc.',
          ],
          look: 'The longest bracket on the enlarged lead is the QT. In parentheses beside it is the corrected value, labeled QTcF (F for Fridericia, one of the standard correction formulas).',
          show: { heart: false, inspect: 'II', speed: 1 },
          check: {
            kind: 'choice',
            question: 'Which QTc is prolonged for a man but still within the limit for a woman?',
            options: ['430 ms', '455 ms', '465 ms', '510 ms'],
            answer: 1,
            fixed: true,
            explain: 'The limits are 450 ms for men and 460 ms for women, so 455 ms is over one and under the other. 465 ms is prolonged for both, and above 500 ms the risk of torsades de pointes rises sharply.',
          },
          roleNote: {
            4: 'Check the QTc on the baseline ECG before QT-prolonging drugs are given, and tell the physician if it is over the limit or lengthens during the case.',
            5: 'Bazett overcorrects at fast heart rates and undercorrects at slow ones; the 2009 AHA/ACCF/HRS statement recommends a linear-regression correction, and this app reports Fridericia.',
          },
          more: ['torsades-de-pointes'],
        },
        {
          title: 'Measure one yourself: the PR interval',
          text: [
            'Here is a different patient. Use the brackets on the enlarged lead and check each interval against its limit: PR 120 to 200 ms (0.12 to 0.20 s), QRS under 120 ms (0.12 s).',
            'On paper you would count boxes. A PR interval longer than 1 large box is too long.',
          ],
          look: 'Read the bracket marked PR. Then look at the gap between each P wave and its QRS on the grid.',
          show: { rhythm: 'first-degree-avb', inspect: 'II' },
          check: {
            kind: 'choice',
            question: 'Which interval is abnormal on this tracing?',
            options: [
              'The PR interval is too long',
              'The QRS is too wide',
              'The QT interval is too long',
              'None: every interval is within its limit',
            ],
            answer: 0,
            explain: 'The PR interval is about 0.29 s, well over the 0.20 s limit: each signal is held too long at the AV node. That is first-degree AV block. The QRS (about 0.09 s) is narrow and the QT is normal.',
          },
          more: ['first-degree-av-block'],
        },
        {
          title: 'Measure one yourself: the QRS',
          text: [
            'One more patient. This time measure the QRS.',
            'When a bundle branch is blocked, the signal reaches that ventricle late, by the slow route through muscle. The two ventricles no longer fire together, and the QRS spreads out.',
          ],
          look: 'Read the bracket marked QRS on the enlarged lead. On the heart, a red × appears on the blocked branch with each beat, and the left ventricle lights up late.',
          show: { rhythm: 'lbbb', heart: 'conduction', camera: 'Front', inspect: 'II', speed: 0.25, focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'What does the QRS on this tracing tell you?',
            options: [
              'It is wide (0.12 s or more): the ventricles are not firing together',
              'It is normal: under 0.12 s',
              'It is wide because the PR interval is long',
              'It is tall, so the calibration must be wrong',
            ],
            answer: 0,
            explain: 'The QRS measures about 0.15 s, over the 0.12 s limit (3 small boxes). The left bundle branch is blocked, so the left ventricle is reached late. The PR interval (about 0.17 s) is normal: the delay is below the AV node, not in it. The T wave here points the opposite way to the QRS, which is expected when a bundle branch is blocked.',
          },
          more: ['left-bundle-branch-block', 'left-bundle-branch'],
        },
      ],
    },

    // ─── 3 ───────────────────────────────────────────────────────────────
    {
      id: 'rate-and-rhythm',
      title: 'Rate and rhythm',
      goal: 'Work out a heart rate two ways, and decide whether a rhythm is regular and whether it is sinus.',
      minutes: 9,
      steps: [
        {
          title: 'How fast, how regular, who is in charge',
          text: [
            'Every reading starts with the same three questions. How fast is the heart beating? Is the rhythm regular? And what is starting each beat? This lesson answers all three by counting boxes and looking for P waves.',
            'The peak of the QRS is the R wave, and the distance from one R wave to the next (the R-R interval) is one heartbeat. A normal resting heart rate for an adult is 60 to 100 beats a minute. Slower than 60 is called bradycardia. Faster than 100 is called tachycardia.',
          ],
          look: 'One lead is enlarged. Pick two R waves next to each other and count the large boxes between them.',
          show: { heart: false, ecg: 'ecg', inspect: 'II', rhythm: 'normal-sinus', hr: 75 },
        },
        {
          title: 'The 300 rule',
          text: [
            'For a regular rhythm, count the large boxes between two R waves and divide 300 by that number. One box apart is 300 beats a minute, two is 150, three is 100, four is 75, five is 60 and six is 50.',
            'It works because 300 large boxes pass in 1 minute: 5 each second for 60 seconds. Learn the sequence 300, 150, 100, 75, 60, 50 and you can read a rate at a glance.',
          ],
          look: 'Here the R waves are about 4 large boxes apart: 300 ÷ 4 = 75 a minute. The green number on the bar above the tracing is the monitor\'s own count.',
          show: { inspect: 'II' },
          check: {
            kind: 'choice',
            question: 'On a regular strip the R waves are 3 large boxes apart. What is the heart rate?',
            options: ['60 a minute', '75 a minute', '100 a minute', '150 a minute'],
            answer: 2,
            fixed: true,
            explain: '300 ÷ 3 = 100 a minute. Four boxes apart would be 75, and two boxes apart would be 150.',
          },
        },
        {
          title: 'Try it: a faster heart',
          text: [
            'Here is a faster rhythm. Count the large boxes between two R waves and use the 300 rule. The monitor\'s own number stays hidden until you answer.',
            'For fast rhythms the small-box version is more exact: divide 1500 by the number of small boxes between two R waves, because 1500 small boxes pass in 1 minute.',
          ],
          look: 'Count the large boxes from one R wave to the next.',
          show: { rhythm: 'sinus-tachycardia', hr: 150, inspect: 'II' },
          check: {
            kind: 'choice',
            question: 'How fast is this heart beating?',
            options: ['About 75 a minute', 'About 100 a minute', 'About 150 a minute', 'About 300 a minute'],
            answer: 2,
            fixed: true,
            hideRate: true,
            explain: 'The R waves are 2 large boxes apart: 300 ÷ 2 = 150. In small boxes that is 10, and 1500 ÷ 10 = 150. A rate of 300 would need R waves only 1 large box apart.',
          },
        },
        {
          title: 'Try it: a slower heart',
          text: [
            'Now a slow one. The rule is the same: large boxes between R waves, divided into 300.',
            'Slow is not always sick. A fit person at rest, or anyone asleep, can have a heart rate in the 40s or 50s. What matters is whether the patient has symptoms and enough blood flow.',
          ],
          look: 'The R waves are far apart now. Count the large boxes between two of them.',
          show: { rhythm: 'sinus-bradycardia', hr: 50, inspect: 'II' },
          check: {
            kind: 'choice',
            question: 'How fast is this slower heart beating?',
            options: ['About 40 a minute', 'About 50 a minute', 'About 60 a minute', 'About 75 a minute'],
            answer: 1,
            fixed: true,
            hideRate: true,
            explain: 'The R waves are 6 large boxes apart: 300 ÷ 6 = 50. Five boxes apart would be 60. Under 60 a minute is bradycardia.',
          },
          more: ['sinus-bradycardia', 'sinus-tachycardia'],
        },
        {
          title: 'Regular or irregular?',
          text: [
            'A rhythm is regular when every R-R interval is the same. Check it along a whole strip: mark two R waves on the edge of a sheet of paper, or set calipers (a two-pointed measuring tool) to them, and move along. If every R wave lands on a mark, the rhythm is regular.',
            'A healthy heart speeds up and slows down a little with breathing, so allow a small variation, up to about 3 small boxes. An irregular rhythm is one where R waves clearly miss the marks.',
          ],
          look: 'Use the long strip along the bottom, labeled II (rhythm strip). The R waves are evenly spaced from one end to the other.',
          show: { rhythm: 'normal-sinus', hr: 75, layout: 'simultaneous' },
        },
        {
          title: 'An irregular rhythm',
          text: [
            'Compare this patient. The R waves come early, late, close together and far apart, with no pattern at all. That is called irregularly irregular, and its most common cause is atrial fibrillation.',
            'The 300 rule fails here, because every R-R interval gives a different answer. You need an average over several seconds.',
          ],
          look: 'On the rhythm strip along the bottom, no two gaps between R waves match. The green number on the bar keeps changing, because the monitor averages only the last few beats.',
          show: { rhythm: 'atrial-fibrillation' },
        },
        {
          title: 'The 6-second method',
          text: [
            'For an irregular rhythm, count the QRS complexes in 6 seconds and multiply by 10. Six seconds is 30 large boxes. The method works for any rhythm, and it is the one to use when the rhythm is irregular.',
            'Many rhythm strips carry a small mark every 3 seconds along the edge. A standard printed 12-lead is 10 seconds long, so there you can count every QRS on the rhythm strip and multiply by 6.',
          ],
          look: 'This is the monitor view, and its screen is exactly 6 seconds wide. Pause it with the round button on the bar above. Count the QRS complexes on the top trace (lead II) and multiply by 10.',
          show: { ecg: 'defib', heart: false },
          check: {
            kind: 'choice',
            question: 'You count 11 QRS complexes on a 6-second strip. What is the heart rate?',
            options: ['About 66 a minute', 'About 90 a minute', 'About 110 a minute', 'About 180 a minute'],
            answer: 2,
            fixed: true,
            explain: '11 × 10 = 110 a minute. Multiplying by 6 gives 66, but that is the sum for a 10-second strip. Six seconds is one tenth of a minute, so multiply by 10.',
          },
          roleNote: {
            2: 'A 6-second count on the monitor strip is the quickest honest rate for an irregular rhythm. Compare it with the pulse you feel: in fast atrial fibrillation some beats are too weak to reach the wrist.',
          },
        },
        {
          title: 'Sinus rhythm: a P before every QRS',
          text: [
            'Rate and regularity describe the ventricles. The third question is what starts each beat. In sinus rhythm the SA node does, and the strip proves it: one P wave before every QRS, one QRS after every P wave, and the same PR interval each time.',
            'A sinus P wave is upright in lead II and upside down in aVR. Sinus rhythm at 60 to 100 a minute is normal sinus rhythm. Slower is sinus bradycardia and faster is sinus tachycardia: the same rhythm at a different rate.',
          ],
          look: 'On lead II, the top strip, every QRS has a small P wave shortly before it. On the heart, each beat runs in the same order: atria, AV node, ventricles.',
          show: { rhythm: 'normal-sinus', hr: 75, heart: 'conduction', camera: 'Front', ecg: 'ecg', layout: 'monitor', speed: 0.5, focus: 'heart' },
          check: {
            kind: 'tap',
            question: 'Sinus rhythm is named after the structure that starts each beat. Tap its name tag on the heart.',
            targets: ['sa-node'],
            explain: 'The sinoatrial (SA, or sinus) node, high in the right atrium, starts every beat in sinus rhythm. Its signal crossing the atria draws the P wave.',
          },
          more: ['normal-sinus-rhythm', 'sa-node'],
        },
        {
          title: 'No P waves: atrial fibrillation',
          text: [
            'Back to the irregular patient. Look for P waves and you will not find any. In atrial fibrillation the atria do not fire together. Disorganized electrical activity races through them 350 to 600 times a minute, so no P wave forms: the baseline between the QRS complexes only wobbles.',
            'The AV node lets some of that chaos through at random, which is why the ventricles beat irregularly. The atria quiver and do not squeeze, so the ventricles lose the top-up the atria normally give them.',
          ],
          look: 'On the heart, yellow sparks flicker across the atria and never settle into a beat. On the tracing no QRS has a P wave in front of it, the QRS complexes are unevenly spaced, and in V1 (middle strip) the baseline wobbles.',
          show: { rhythm: 'atrial-fibrillation', focus: 'heart' },
          check: {
            kind: 'choice',
            question: 'A strip shows a rate of 80, R waves spaced unevenly with no pattern, and no P waves. What is the rhythm?',
            options: ['Atrial fibrillation', 'Normal sinus rhythm', 'Sinus bradycardia', 'Sinus tachycardia'],
            answer: 0,
            explain: 'Irregularly irregular with no P waves is atrial fibrillation at any rate. A rate of 80 fits normal sinus rhythm too, which is why rate alone never names a rhythm: sinus rhythm needs even spacing and a P wave before every QRS.',
          },
          more: ['atrial-fibrillation'],
        },
      ],
    },

    // ─── 4 ───────────────────────────────────────────────────────────────
    {
      id: 'twelve-leads',
      title: 'Twelve leads, twelve views',
      goal: 'Say what each of the 12 leads looks at, and pick the leads that face each wall of the heart.',
      minutes: 9,
      steps: [
        {
          title: 'Ten electrodes, twelve leads',
          text: [
            'A 12-lead ECG uses 10 electrodes: one on each arm, one on each leg and six across the chest. From them the machine builds 12 leads. Each lead is a different camera angle on the same heartbeat.',
            'Twelve views are needed because a problem in one wall of the heart shows only in the leads that face that wall. Know where each camera is and you can say where in the heart the problem lies.',
          ],
          look: 'The 12-lead shows four columns of three leads. Left to right: I, II, III, then aVR, aVL, aVF, then V1 to V3, then V4 to V6. The long strip along the bottom is lead II again.',
          show: { heart: 'external', camera: 'Front', labels: false, ecg: 'ecg', layout: 'simultaneous', rhythm: 'normal-sinus', focus: 'ecg' },
        },
        {
          title: 'Six limb leads: the frontal plane',
          text: [
            'The six limb leads are built from the arm and leg electrodes. I, II and III each compare two limbs. aVR, aVL and aVF each look from one limb: the Right arm, the Left arm and the left Foot. (The right-leg electrode is an electrical ground and makes no lead.)',
            'Together they view the heart in the frontal plane. Picture the patient standing with their back to a wall and six cameras fixed to that wall in a circle around the heart. They see up, down, left and right. They cannot see front to back.',
          ],
          look: 'Lead I is selected. Its line of sight runs straight across the chest from the patient\'s left side, and the tag on the heart names the wall it faces.',
          show: { lead: 'I', focus: 'heart' },
        },
        {
          title: 'The inferior leads: II, III and aVF',
          text: [
            'Leads that face the same wall are called contiguous leads, and they are read as a group. The first group is the inferior leads: II, III and aVF. All three have their positive electrode on the left leg, so they look up at the underside of the heart, the inferior wall, which rests on the diaphragm.',
            'In most people the inferior wall is fed by the right coronary artery.',
          ],
          look: 'On the 12-lead, II and III are the lower two leads of the first column, and aVF (outlined) is at the bottom of the second. On the heart, aVF\'s line of sight comes straight up from below, and its tag reads Inferior wall.',
          show: { lead: 'aVF', focus: 'ecg' },
          check: {
            kind: 'lead',
            question: 'aVF is one of three inferior leads. Tap one of the other two.',
            targets: ['II', 'III'],
            explain: 'II, III and aVF all look up at the inferior wall from the left leg. A change that appears in these leads together points to the inferior wall and, in most people, to the right coronary artery.',
          },
          more: ['rca-proximal'],
        },
        {
          title: 'aVR: the lead on the far side',
          text: [
            'aVR looks from the right shoulder down into the heart, toward the inside of the ventricles and the top of the septum (the wall between the two ventricles). No outer wall faces it, so it belongs to no group, and every normal wave in it points down.',
            'Do not skip it. If aVR is upright in an otherwise ordinary tracing, suspect swapped arm cables first. And ST elevation in aVR together with ST depression in many other leads warns of severe narrowing of the left main artery (the short trunk that feeds most of the left ventricle) or of several arteries at once.',
          ],
          look: 'aVR\'s line of sight starts above the patient\'s right shoulder, and its tag reads Basal septum / cavity. Compare aVR with lead II on the 12-lead: the same beat, drawn upside down.',
          show: { lead: 'aVR', focus: 'heart' },
          more: ['lmca', 'nstemi'],
        },
        {
          title: 'Six chest leads: the horizontal plane',
          text: [
            'The six chest leads, V1 to V6, come from the six electrodes across the chest. They view the heart in the horizontal plane. Picture looking down from above at a slice through the chest, with six cameras wrapped around the front and the left side.',
            'V1 and V2 sit beside the breastbone, V3 and V4 over the front of the heart, and V5 and V6 around the left side. They see front to back, which the limb leads cannot.',
          ],
          look: 'V2 is selected. The heart turns so you can see its line of sight from the side: it comes in from the front of the chest and runs back through the heart. Its tag reads Septum.',
          show: { lead: 'V2', focus: 'heart' },
          check: {
            kind: 'choice',
            question: 'Which leads can show whether the electrical wave is moving toward the front or the back of the chest?',
            options: [
              'The chest leads, V1 to V6',
              'Leads I, II and III',
              'Leads aVR, aVL and aVF',
              'All twelve leads equally',
            ],
            answer: 0,
            explain: 'The chest leads sit in the horizontal plane and look front to back. All six limb leads lie in the frontal plane: they see up, down, left and right only.',
          },
        },
        {
          title: 'The septal and anterior leads: V1 to V4',
          text: [
            'V1 and V2 sit on either side of the breastbone and face the septum. V3 and V4 sit further to the left and face the front (anterior) wall of the left ventricle. V4 is close to the apex, the tip of the heart.',
            'All four areas are fed by the left anterior descending artery (LAD), which runs down the front of the heart. The two groups blend into each other, so you will often hear V1 to V4 together called the anteroseptal leads.',
          ],
          look: 'On the 12-lead, V1 to V3 fill the third column and V4 heads the fourth; V3 is outlined. On the heart, V3\'s line of sight comes in from the front of the chest, and its tag reads Anterior wall.',
          show: { lead: 'V3', focus: 'ecg' },
          check: {
            kind: 'lead',
            question: 'Tap a lead that faces the septum.',
            targets: ['V1', 'V2'],
            explain: 'V1 and V2, beside the breastbone, face the septum. V3 and V4 face the anterior wall. A blocked LAD can change all four.',
          },
          more: ['lad-proximal', 'interventricular-septum'],
        },
        {
          title: 'The lateral leads: I, aVL, V5 and V6',
          text: [
            'The lateral leads face the left side wall of the left ventricle. There are four. I and aVL look from the left arm at the upper part of that wall, the high lateral wall. V5 and V6 look from the left side of the chest at the lower part.',
            'This is the one group that mixes limb leads and chest leads. The lateral wall is usually fed by the circumflex artery, which wraps around the left side of the heart, or by diagonal branches of the LAD.',
          ],
          look: 'On the 12-lead, V6 (outlined) is at the bottom of the last column; I and aVL are in the first two. On the heart, V6\'s line of sight comes in from the patient\'s left side, and its tag reads Low lateral wall.',
          show: { lead: 'V6', focus: 'ecg' },
          check: {
            kind: 'lead',
            question: 'Tap a limb lead that faces the lateral wall.',
            targets: ['I', 'aVL'],
            explain: 'I and aVL look from the left arm at the high lateral wall, and V5 and V6 see the same wall lower down. aVR is also built from an arm electrode, but the right one: it looks into the heart from the opposite side.',
          },
          more: ['lcx-proximal'],
        },
        {
          title: 'Leads, walls and arteries',
          text: [
            'Put the groups on one page. Inferior: II, III, aVF. Lateral: I, aVL, V5, V6. Septal: V1, V2. Anterior: V3, V4. aVR stands alone.',
            'A finding carries more weight when it shows in two or more contiguous leads: two cameras facing the same wall agree. Leads on the opposite side of the heart often show its mirror image, which is called a reciprocal change.',
            'Two regions have no camera of their own: the back (posterior) wall and the right ventricle. When trouble is suspected there, extra electrodes are added on the back (V7 to V9) or on the right side of the chest (V4R).',
          ],
          look: 'The heart is painted by artery: green for the LAD (front wall, septum, apex), blue for the circumflex (lateral wall), orange for the right coronary artery (inferior wall, right ventricle). Its tags read pRCA, mRCA and dRCA.',
          show: { heart: 'territories', camera: 'Front', labels: true, focus: 'heart' },
          check: {
            kind: 'tap',
            question: 'Leads II, III and aVF all show the same change. Tap the artery (any of its name tags) that usually supplies the wall they face.',
            targets: ['rca-proximal', 'rca-mid', 'rca-distal', 'pda', 'posterolateral-branch', 'am-branch'],
            explain: 'II, III and aVF face the inferior wall, which the right coronary artery supplies in most people (the circumflex in the rest).',
          },
          roleNote: {
            2: 'Naming the leads tells the receiving team which wall and artery to expect: report "ST elevation in II, III and aVF", not only "STEMI".',
            3: 'During a case, an ST change in the leads that face the artery being treated is yours to spot. Know which leads those are, and tell the operator at once.',
          },
        },
        {
          title: 'Check yourself: which leads belong together?',
          text: [
            'One last check on the groups. Contiguous leads face the same wall and are read together. Leads that face opposite walls tend to show mirror images of each other.',
          ],
          look: 'All twelve leads are on screen with nothing selected. Use the columns to find each pair.',
          show: { heart: 'external', camera: 'Front', labels: false, focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'Which pair of leads is contiguous?',
            options: ['II and aVF', 'II and aVR', 'V1 and V6', 'III and aVL'],
            answer: 0,
            explain: 'II and aVF both face the inferior wall. III and aVL face nearly opposite walls (inferior and high lateral), so one often shows the mirror image of the other. V1 and V6 sit at opposite ends of the chest leads, and aVR faces no wall.',
          },
          more: ['inferior-stemi', 'lateral-stemi', 'anterior-stemi'],
        },
      ],
    },

    // ─── 5 ───────────────────────────────────────────────────────────────
    {
      id: 'electrodes',
      title: 'Where the electrodes go',
      goal: 'Place all ten electrodes correctly, spot a swapped or misplaced cable, and record a clean tracing.',
      minutes: 10,
      steps: [
        {
          title: 'The reading starts with the electrodes',
          text: [
            'Every rule in this course assumes the ten electrodes are in their standard places. Move one, or swap two cables, and the machine still draws a neat tracing. It is only wrong, and it can copy a heart attack or hide one.',
            'Whoever places the electrodes decides how good the ECG can be. This lesson covers the six chest positions, the four limb positions, the errors that happen most often, and how to get a clean recording.',
          ],
          look: 'This is the electrode lab: a patient wearing all ten electrodes, with the heart beating behind a window in the chest. Drag to turn the patient. Tap an electrode to see its lead and where it belongs. On a small screen, scroll down in the lab to read it.',
          show: { ecg: 'lab', heart: false, rhythm: 'normal-sinus' },
          roleNote: {
            1: 'Acquiring and transmitting a 12-lead is in the EMT scope where protocols allow. Correct placement is the part you control. The reading is left to a paramedic or physician.',
            2: 'For chest pain or other signs of a possible heart attack, aim to record the first 12-lead within 10 minutes of reaching the patient, and repeat it if symptoms change.',
          },
        },
        {
          title: 'V1 and V2: find the fourth space',
          text: [
            'Start at the notch at the top of the breastbone and slide a finger down about 5 cm (2 inches) to a bony ridge, the sternal angle. The second rib joins the breastbone there. The gap right below that rib is the second intercostal space (intercostal means between the ribs).',
            'Count down two more spaces to the fourth. V1 goes in the fourth intercostal space at the right edge of the breastbone. V2 goes in the same space at the left edge.',
            'Do not judge the level by eye, and do not count from the collarbone: the first rib is tucked behind it and is easy to miscount. The sternal angle marks the second rib every time.',
          ],
          look: 'Tap V1 on the patient, then V2. The lab shows the position of each: 4th intercostal space, right and left sternal border (the edge of the breastbone).',
          check: {
            kind: 'choice',
            question: 'Where does V1 go?',
            options: [
              'Fourth intercostal space, right edge of the breastbone',
              'Fourth intercostal space, left edge of the breastbone',
              'Second intercostal space, right edge of the breastbone',
              'Fifth intercostal space, below the middle of the collarbone',
            ],
            answer: 0,
            explain: 'V1 sits in the fourth space at the right sternal border. The same space on the left is V2. The second space is the classic mistake of placing it too high, and the fifth space below the mid-collarbone is where V4 goes.',
          },
        },
        {
          title: 'V4 next, then V3, V5 and V6',
          text: [
            'Place V4 before V3. V4 goes in the fifth intercostal space on the mid-clavicular line, an imaginary line straight down from the middle of the left collarbone. V3 then goes midway between V2 and V4.',
            'V5 and V6 follow V4 around the chest at the same level. V5 goes on the anterior axillary line (the front fold of the armpit) and V6 on the mid-axillary line (straight down from the center of the armpit). Keep them in a straight horizontal line with V4. Do not follow the rib space as it curves upward.',
            'On a patient with large breasts, V4, V5 and V6 are usually placed on the chest wall under the breast, not on top of it.',
          ],
          look: 'Tap V4, then V5 and V6. All three sit at the same level around the left side of the chest, and V3 sits midway between V2 and V4.',
          check: {
            kind: 'choice',
            question: 'In what order are the chest electrodes easiest to place correctly?',
            options: [
              'V1, V2, then V4, then V3, V5 and V6',
              'V1 through V6 in number order',
              'V6 first, working back toward the breastbone',
              'V4 first, then V1 and V2 measured from it',
            ],
            answer: 0,
            explain: 'V1 and V2 come from counting rib spaces. V4 has its own landmarks. V3 has none: it goes midway between V2 and V4, so V4 must be placed first. V5 and V6 are then set level with V4.',
          },
        },
        {
          title: 'The four limb electrodes',
          text: [
            'The limb electrodes are RA (right arm), LA (left arm), RL (right leg) and LL (left leg). For a standard resting 12-lead they go on the arms and legs themselves, anywhere below the shoulders and hips, on flesh and not over bone.',
            'For monitoring, in the ambulance and in the cath lab, they are often moved onto the torso to cut down movement artifact (false signals), as on this patient. Torso placement changes the limb leads (lead I gets smaller, the inferior leads taller), so note it on the tracing and do not compare it directly with a standard ECG.',
            'US cable colors: white for the right arm, black for the left arm, green for the right leg, red for the left leg. The memory aid is "white on the right, smoke over fire": black above red on the left. The right leg is an electrical ground and is not part of any lead.',
          ],
          look: 'On this patient RA and LA sit below the collarbones and RL and LL on the lower abdomen, in the US cable colors. Tap RL: the lab tells you it is the ground and makes no lead.',
          roleNote: {
            3: 'In the cath lab the limb electrodes go on the torso, and the cables must stay out of the X-ray field and off the sterile field. Check that the baseline tracing is clean before the drapes go on.',
            4: 'Record or confirm a baseline 12-lead before sedation and note where the electrodes were placed, so later tracings are compared like with like.',
          },
        },
        {
          title: 'Swapped arm cables',
          text: [
            'The most common cable error is swapping the two arm cables. Lead I then turns completely upside down: P wave, QRS and T wave. aVR and aVL trade places, so aVR, which should point down, looks upright. Leads II and III trade places too.',
            'The chest leads do not change, and that is the clue. A heart problem that flipped lead I would show in V5 and V6 as well, because they face the same wall. An upside-down lead I with normal chest leads is a cable problem until proven otherwise.',
          ],
          look: 'Tap "LA ↔ RA" in the electrode lab (on a small screen, scroll down in the lab to find it). An amber box lists what changes, and on a wide screen lead I flips beside the lab. The next step reads the swapped tracing.',
          check: {
            kind: 'choice',
            question: 'After the two arm cables are swapped, which leads still look exactly as they did?',
            options: [
              'The six chest leads, V1 to V6',
              'Lead I and aVR',
              'Leads II and III',
              'None: every lead changes',
            ],
            answer: 0,
            explain: 'The chest leads are measured against the average of the three limb electrodes, and swapping two of them leaves that average unchanged. Lead I flips, aVR and aVL trade places, and II and III trade places. Normal chest leads beside an upside-down lead I point to the cables, not the heart.',
          },
        },
        {
          title: 'Read the swapped tracing',
          text: [
            'The lab is closed, and this is the tracing the swapped cables produce. The machine has drawn it as neatly as any other. Nothing on a real printout says it is wrong: you have to notice.',
            'Run the clues. Lead I: everything upside down, P wave included. aVR: upright. V1 to V6: the same as before. A change in the heart itself almost never does all three. Fix the cables and record again before anyone reads the heart.',
          ],
          look: 'The arm cables are swapped on this tracing: an amber ⚠ above it says so. Compare lead I with aVR, then look along V1 to V6.',
          show: { ecg: 'ecg', placement: 'la-ra' },
          check: {
            kind: 'lead',
            question: 'Tap a lead that points down on this tracing only because the arm cables are swapped.',
            targets: ['I', 'aVL'],
            explain: 'Lead I is drawn upside down: P wave, QRS and T wave. aVL now shows the pattern that belongs to aVR, so it points down too, while aVR looks upright. V1 and V2 point down on every normal tracing, so they do not count. The chest leads have not changed at all.',
          },
        },
        {
          title: 'Other swaps, then put the cables back',
          text: [
            'Two more patterns are worth knowing. If the right-leg (ground) cable is swapped with an arm cable, one limb lead becomes almost a flat line while the others still show beats. A flat limb lead is a cable problem, not a quiet heart.',
            'If two neighboring chest cables are swapped, the chest leads stop changing step by step. Normally the upward part of the QRS, the R wave, grows from V1 toward V5 while the downward part shrinks. One lead out of step means two cables to check.',
            'Then put everything back. The rest of this course assumes standard placement.',
          ],
          look: 'Try "RA ↔ RL": the amber box explains the flat lead II. Try "V1 ↔ V2". Then tap "Reset placement": the amber box disappears and the tracing is correct again.',
          show: { ecg: 'lab' },
          check: {
            kind: 'choice',
            question: 'Lead II is almost a flat line, but the other leads show clear beats and the patient is awake and talking. What is the likely cause?',
            options: [
              'The right-leg (ground) cable is swapped with the right-arm cable',
              'The heart has stopped firing',
              'The gain is set too low',
              'The patient is shivering',
            ],
            answer: 0,
            explain: 'Lead II compares the right-arm cable with the left-leg cable. With the right-arm cable on the right leg, it compares one leg with the other. The two legs sit at almost the same voltage, so lead II draws next to nothing. A stopped heart would flatten every lead, and low gain would shrink every lead. Check the cables and record again.',
          },
        },
        {
          title: 'Chest electrodes in the wrong place',
          text: [
            'This is a new patient, with every cable where it belongs. Cables can be right and the electrodes still wrong. The most common chest error is placing V1 and V2 too high, in the second or third intercostal space. That can make a healthy heart look as if it has an old heart attack in the front wall or a fault in its wiring.',
            'V5 and V6 drift too high as well, when they follow the ribs upward. No warning on the machine catches a misplaced electrode: only landmarks do. Find the sternal angle, count to the fourth space, and keep V4, V5 and V6 level.',
          ],
          look: 'A new, correctly wired tracing: no amber ⚠ above it. Follow V1 to V6: the upward part of the QRS grows from V1 to V5 while the downward part shrinks.',
          // every cable back where it belongs, even if the learner did not tap "Reset placement"
          show: { ecg: 'ecg', rhythm: 'normal-sinus', hr: 75, placement: 'standard' },
          check: {
            kind: 'choice',
            question: 'In which direction are V1 and V2 most often misplaced?',
            options: [
              'Too high: in the second or third intercostal space',
              'Too low: in the fifth or sixth intercostal space',
              'Too far apart: out toward the nipples',
              'Swapped with V5 and V6',
            ],
            answer: 0,
            explain: 'It happens when the level is judged by eye and not counted from the sternal angle. Electrodes placed too high can copy an old heart attack or a wiring fault. Start from the sternal angle, which marks the second rib, and count down to the fourth space.',
          },
        },
        {
          title: 'A clean tracing',
          text: [
            'Good contact starts with the skin: dry it, clip thick hair and rub lightly with gauze where each electrode will sit. Use fresh electrodes, because dried-out gel gives a poor signal.',
            'Then the patient: lying back, still, warm, arms and legs supported and relaxed, not talking. Tense or shivering muscle makes its own electricity, and the ECG records that too.',
            'Know three kinds of artifact (false signal). A baseline that wanders up and down comes from breathing or a loose electrode. A fine, jagged fuzz is muscle tremor. A thick, perfectly regular fuzz is electrical interference from nearby equipment. Fix the cause and record again.',
          ],
          look: 'This is the printout layout of a clean 12-lead: a steady, flat baseline between beats and thin, sharp lines.',
          show: { layout: 'standard' },
          check: {
            kind: 'choice',
            question: 'The baseline is jagged and fuzzy and the patient is shivering. What is the best next step?',
            options: [
              'Warm and settle the patient, support the limbs and record again',
              'Turn the gain down until the fuzz disappears',
              'Report the rhythm as atrial fibrillation',
              'Move the limb electrodes next to the chest electrodes',
            ],
            answer: 0,
            explain: 'That is muscle tremor artifact. A fuzzy baseline can hide P waves and imitate atrial fibrillation, so remove the cause and repeat the recording. Turning the gain down shrinks the real waves along with the noise.',
          },
          roleNote: {
            2: 'Record the 12-lead with the ambulance stopped whenever you can: road vibration and a patient braced against the movement are artifact too.',
          },
        },
        {
          title: 'Three checks before you hand it over',
          text: [
            'Before a 12-lead leaves your hands, check three things. One: the patient\'s name, the date and the time are on it. Two: the calibration mark is 10 mm tall and the speed reads 25 mm/s. Three: the tracing passes a ten-second sanity check.',
            'The sanity check: aVR points down, lead I points up, the R wave grows from V1 toward V5, and no lead is a flat line. If any of these fails, look at the electrodes before anyone reads the heart.',
          ],
          look: 'Run the sanity check on this tracing: aVR down, lead I up, R waves growing across V1 to V5, no flat leads.',
          check: {
            kind: 'lead',
            question: 'Tap the lead that should point down on every normal tracing.',
            targets: ['aVR'],
            explain: 'aVR looks from the right shoulder, so its P wave, QRS and T wave all point down. If aVR is upright and lead I is upside down, the arm cables are probably swapped.',
          },
        },
      ],
    },

    // ─── 6 ───────────────────────────────────────────────────────────────
    {
      id: 'axis',
      title: 'The electrical axis',
      goal: 'Find the axis from leads I, aVF and II, and name common causes of left and right axis deviation.',
      minutes: 8,
      steps: [
        {
          title: 'One arrow for the whole heartbeat',
          text: [
            'As the ventricles fire, the electrical wave moves through them in many directions at once. Add all of it together and you get one average direction: the electrical axis. In a normal heart it points down and to the patient\'s left, toward the thick left ventricle.',
            'The axis is judged in the frontal plane, so it uses the limb leads only. Finding it takes a few seconds once you know which leads to look at.',
          ],
          look: 'A yellow arrow at the center of the heart shows the direction of the electrical wave from instant to instant. It is longest in the middle of the QRS. The way it points then is the axis.',
          show: { heart: 'external', camera: 'Front', labels: false, vector: true, ecg: 'ecg', layout: 'simultaneous', rhythm: 'normal-sinus', hr: 70, speed: 0.25, focus: 'heart' },
        },
        {
          title: 'Lead I answers: left or right?',
          text: [
            'Lead I looks across the chest from the patient\'s left side. If the QRS in lead I is mostly upward, the wave is traveling toward the left, which is normal. If it is mostly downward, the wave is traveling toward the right.',
            '"Mostly upward" means the part of the QRS above the baseline is bigger than the part below it.',
          ],
          look: 'Lead I\'s cyan line crosses the heart from the patient\'s left. During the QRS the bead on the line turns green and slides toward the (+) end, and lead I on the 12-lead points up.',
          show: { lead: 'I', focus: 'heart' },
        },
        {
          title: 'Lead aVF answers: up or down?',
          text: [
            'Lead aVF looks straight up from the feet. If the QRS in aVF is mostly upward, the wave is traveling down toward the feet, which is normal. If it is mostly downward, the wave is traveling up toward the head.',
            'Put the two answers together. Lead I up and aVF up: the wave travels left and down. That is a normal axis, and you are finished.',
          ],
          look: 'aVF\'s cyan line comes up from below. During the QRS the bead turns green and slides down toward the (+) end, and aVF on the 12-lead points up.',
          show: { lead: 'aVF', focus: 'heart' },
        },
        {
          title: 'Four quarters',
          text: [
            'Two leads give four possible answers. Lead I up, aVF up: normal axis. Lead I up, aVF down: the wave has swung up toward the left shoulder, a left axis. Lead I down, aVF up: it has swung toward the right, right axis deviation. Both down: extreme axis.',
            'In degrees, lead I\'s direction is called 0° and aVF\'s is +90°. The normal axis lies between −30° and +90°. Beyond −30° is left axis deviation, and beyond +90° is right axis deviation.',
          ],
          look: 'Find lead I at the top of the first column and aVF at the bottom of the second. On this normal tracing both point up.',
          show: { speed: 1, focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'Lead I points down and aVF points up. What is the axis?',
            options: ['Right axis deviation', 'Left axis deviation', 'Normal axis', 'Extreme axis'],
            answer: 0,
            explain: 'Lead I down means the wave is heading to the patient\'s right. aVF up means it is still heading down. Right and down is right axis deviation. Left axis deviation is the reverse: lead I up, aVF down.',
          },
        },
        {
          title: 'The borderline: ask lead II',
          text: [
            'There is one catch. The normal range reaches a little above horizontal, to −30°. So lead I up with aVF down is not always abnormal: the axis may sit between 0° and −30°.',
            'Lead II settles it. If the QRS in lead II is still mostly upward, the axis is inside the normal range. If lead II is mostly downward as well, the axis is beyond −30°: true left axis deviation.',
          ],
          look: 'A new patient. Check lead I, then aVF, then lead II (outlined) on the 12-lead. On the heart, watch which way the yellow arrow swings during the QRS.',
          show: { rhythm: 'bifascicular', lead: 'II', speed: 0.25, focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'Read leads I, aVF and II on this tracing. What is the axis?',
            options: ['Left axis deviation', 'Normal axis', 'Right axis deviation', 'Extreme axis'],
            answer: 0,
            explain: 'Lead I is mostly upward (its tall spike outweighs the wide dip after it), aVF is downward and lead II is downward as well, so the axis is beyond −30°: left axis deviation. Had lead II still been upward, the axis would have counted as normal.',
          },
        },
        {
          title: 'What left axis deviation suggests',
          text: [
            'Axis deviation is a clue, not a diagnosis. It says something has changed the route or the balance of the electrical wave, and you go looking for the reason.',
            'The left bundle branch splits into two smaller branches called fascicles, one to the front of the left ventricle and one to the back. When the front one is blocked (left anterior fascicular block), the wave reaches the left ventricle from below and sweeps upward. That is the usual cause of an axis far to the left.',
            'Other causes: left bundle branch block, an old heart attack in the inferior wall, a pacemaker driving the ventricles, and sometimes a thickened left ventricle. This patient also has a blocked right bundle branch. That widens the QRS but hardly moves the axis.',
          ],
          look: 'Same patient, with the wiring showing. With each beat, red × marks appear on two blocked branches. The tags LAF and LPF mark the front and back fascicles of the left bundle.',
          show: { heart: 'conduction', camera: 'Front', labels: true, focus: 'heart' },
          check: {
            kind: 'tap',
            question: 'Tap the name tag of the fascicle that is still carrying the signal into the left ventricle.',
            targets: ['left-posterior-fascicle'],
            explain: 'The left posterior fascicle (LPF) is the only branch still working: the right bundle branch and the left anterior fascicle both carry a red ×. Firing the left ventricle from the back and below sends the wave upward, which is why the axis points up and to the left.',
          },
          more: ['bifascicular-block', 'left-anterior-fascicle', 'left-posterior-fascicle'],
        },
        {
          title: 'Right axis deviation',
          text: [
            'Now the other direction. In right axis deviation the wave is pulled toward the right ventricle or pushed away from part of the left.',
            'Causes: a thickened or strained right ventricle (long-standing lung disease, high pressure in the lung arteries, a large clot in the lungs), an old heart attack in the lateral wall, and a block in the back fascicle of the left bundle. It can be normal in children and in tall, thin young adults.',
            'This patient has a narrowed mitral valve, the valve between the left atrium and the left ventricle. For years the pressure has backed up through the lungs, and the right ventricle has thickened to push against it.',
          ],
          look: 'In lead I the QRS is small, and what there is points down. aVL, which looks from the same side, is clearly downward. aVF and III point up. On the heart, the yellow arrow points almost straight down, tipped a little to the patient\'s right.',
          show: { rhythm: 'mitral-stenosis', heart: 'external', camera: 'Front', labels: false, focus: 'ecg' },
          check: {
            kind: 'lead',
            question: 'Tap a limb lead that looks from the patient\'s left and whose QRS now points down.',
            targets: ['I', 'aVL'],
            explain: 'Lead I and aVL both look from the patient\'s left. In lead I the QRS is small, but all of it lies below the baseline, and in aVL it is clearly downward: the wave is heading a little to the patient\'s right. aVF is still upward, so the axis points down and to the right. This is right axis deviation, here only a little past the +90° limit.',
          },
          more: ['mitral-stenosis', 'pulmonary-embolism', 'right-ventricle'],
        },
        {
          title: 'Say it in one phrase',
          text: [
            'The whole method: look at lead I, look at aVF, and bring in lead II only when lead I is up and aVF is down. Then say it in one phrase: normal axis, left axis deviation, right axis deviation or extreme axis.',
            'A change from an earlier tracing matters more than an axis that has always been the same. And before you believe a strange axis, check the electrodes: swapped arm cables turn lead I upside down and fake right axis deviation.',
          ],
          look: 'Back to the normal heart. Lead I up, aVF up, and the yellow arrow points down and to the patient\'s left during the QRS.',
          show: { rhythm: 'normal-sinus', hr: 70, focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'Since yesterday\'s ECG everything in lead I has turned upside down, P wave included, and aVR is now upright. The chest leads have not changed. What is the most likely explanation?',
            options: [
              'The arm cables are swapped',
              'A new heart attack in the lateral wall',
              'A newly blocked fascicle',
              'A right ventricle that thickened overnight',
            ],
            answer: 0,
            explain: 'Swapping the arm cables flips everything in lead I, P wave included, and makes aVR upright, which imitates sudden right axis deviation. A heart attack in the lateral wall would change V5 and V6 too, a blocked fascicle leaves the P wave upright, and a ventricle does not thicken overnight. Check the cables and repeat the ECG.',
          },
        },
      ],
    },

    // ─── 7 ───────────────────────────────────────────────────────────────
    {
      id: 'systematic-read',
      title: 'Reading in a fixed order',
      goal: 'Read any 12-lead in the same six steps and report it in one sentence.',
      minutes: 9,
      steps: [
        {
          title: 'The same six steps, every time',
          text: [
            'Readers miss things when they jump to whatever catches the eye. The cure is to read every ECG in the same order, even when the answer looks obvious: rate, rhythm, intervals, axis, QRS shape, then ST segments and T waves.',
            'Before step one, two quick checks: the tracing belongs to this patient, and the calibration mark and speed are standard. Then look at the patient. An ECG is read in the light of who it came from.',
            'Most machines print their own interpretation at the top. Treat it as a second opinion, never as the reading: it misses real findings and reports false ones.',
          ],
          look: 'This is the printout layout: the four columns are recorded one after another, as on paper, with a lead II rhythm strip along the bottom.',
          show: { heart: false, ecg: 'ecg', layout: 'standard', rhythm: 'normal-sinus', hr: 70 },
          roleNote: {
            1: 'Reading a 12-lead is outside the EMT scope. Your part is a clean, correctly placed tracing, acquired early and transmitted per protocol, so that someone who can read it sees it sooner.',
            3: 'You do not interpret for clinical decisions, but you watch the monitor all case long. Know each patient\'s baseline rhythm and ST level so you can tell the operator the moment either changes.',
            4: 'Document the baseline rhythm, rate and intervals before sedation or medications, and report any rhythm or ST change to the physician.',
          },
        },
        {
          title: 'Steps 1 and 2: rate and rhythm',
          text: [
            'Rate first. On the rhythm strip, count the large boxes between two R waves and divide into 300, or count the QRS complexes in 6 seconds and multiply by 10.',
            'Then rhythm. Is the spacing regular? Is there a P wave before every QRS and a QRS after every P wave? Are the P waves upright in lead II? Three times yes means sinus rhythm.',
          ],
          look: 'Use the lead II rhythm strip along the bottom. Count the large boxes between two R waves, then look in front of each QRS for its P wave.',
          check: {
            kind: 'choice',
            question: 'What are the rate and rhythm on this tracing?',
            options: [
              'About 70 a minute, regular, a P wave before every QRS: sinus rhythm',
              'About 70 a minute, irregular, no P waves: atrial fibrillation',
              'About 45 a minute, regular: sinus bradycardia',
              'About 150 a minute, regular: sinus tachycardia',
            ],
            answer: 0,
            hideRate: true,
            explain: 'The R waves are a little over 4 large boxes apart (300 ÷ 4 = 75, so about 70), evenly spaced, and each QRS follows a P wave: sinus rhythm. At 150 the R waves would be 2 boxes apart, and at 45 nearly 7.',
          },
        },
        {
          title: 'Step 3: intervals',
          text: [
            'Three measurements, each against its limit. PR interval: 0.12 to 0.20 s (3 to 5 small boxes). QRS width: under 0.12 s (3 small boxes). QT: less than half the R-R interval at normal rates, or a QTc under 450 ms in men and 460 ms in women.',
            'Measure in the lead where the start and end of each wave are clearest. Lead II is the usual first choice.',
          ],
          look: 'Lead II is enlarged. The three brackets give the PR, QRS and QT in milliseconds: 200 ms is 0.20 s, one large box.',
          show: { inspect: 'II' },
          check: {
            kind: 'choice',
            question: 'Which statement fits the intervals on this tracing?',
            options: [
              'All three are within their limits',
              'The PR interval is too long',
              'The QRS is wide',
              'The QTc is prolonged',
            ],
            answer: 0,
            explain: 'The PR is about 0.16 s, the QRS about 0.09 s and the QTc a little over 400 ms: all normal. A long PR would be more than one large box, and a wide QRS three small boxes or more.',
          },
        },
        {
          title: 'Step 4: axis',
          text: [
            'Lead I, then aVF. Both upward means a normal axis and you move on. If lead I is up and aVF is down, check lead II. If lead I is down, think right axis deviation and check the arm cables.',
          ],
          look: 'All twelve leads are back. Find lead I at the top of the first column and aVF at the bottom of the second. Both point up here.',
          check: {
            kind: 'lead',
            question: 'Tap one of the two leads you look at first to find the axis.',
            targets: ['I', 'aVF'],
            explain: 'Lead I answers left or right, and aVF answers up or down. Both are upward on this tracing, so the axis is normal. Lead II is only needed when lead I is up and aVF is down.',
          },
        },
        {
          title: 'Steps 5 and 6: QRS shape, ST segments, T waves',
          text: [
            'QRS shape: the R wave should grow from V1 toward V5. Tiny Q waves in I, aVL, V5 and V6 are normal. A Q wave about 1 small box wide or more, in two neighboring leads, can be the scar of an old heart attack.',
            'ST segments: in every lead, compare the ST segment with the baseline just before the QRS. It should be level. Check all twelve, group by group. T waves: upright in I, II and V3 to V6, and downward in aVR.',
            'Everything on this tracing passes. Report it in one sentence: "Sinus rhythm at about 70, normal intervals, normal axis, no ST or T wave changes." One caution: a normal ECG does not rule out a heart attack. In the first minutes the tracing can still look normal, so it is repeated if symptoms continue.',
          ],
          look: 'Go lead by lead across the printout. The R wave grows from V1 to V5, and each ST segment sits level with the baseline.',
          check: {
            kind: 'lead',
            question: 'Tap the lead whose T wave points down on this normal tracing.',
            targets: ['aVR'],
            explain: 'aVR looks from the far side of the heart, so its T wave is normally downward along with everything else in it. A T wave can also be flat or downward in III, aVL and V1 in a healthy adult. In I, II and V3 to V6 it should be upright.',
          },
        },
        {
          title: 'Tracing A: rate and rhythm',
          text: [
            'A new patient, the same order. Start with the rhythm strip. The spacing changes from beat to beat, so the 300 rule gives no single answer. It still gives a range: see whether most R waves are closer together than 3 large boxes (faster than 100) or further apart.',
            'Then look in front of each QRS for a P wave.',
          ],
          look: 'Follow the lead II rhythm strip along the bottom and compare the gaps between R waves. Then look at V1, where the baseline between beats is easiest to judge.',
          show: { rhythm: 'atrial-fibrillation', hr: 120 },
          check: {
            kind: 'choice',
            question: 'What are the rate and rhythm on tracing A?',
            options: [
              'Fast (over 100), irregularly irregular, no P waves: atrial fibrillation',
              'Fast (over 100), regular, a P wave before every QRS: sinus tachycardia',
              'Normal rate, regular: normal sinus rhythm',
              'Slow, regular, no P waves: a backup rhythm from lower in the heart',
            ],
            answer: 0,
            hideRate: true,
            explain: 'The spacing never repeats and no QRS has a P wave in front of it: atrial fibrillation, here with a fast ventricular rate. Sinus tachycardia is fast too, but it is regular and every QRS follows a P wave.',
          },
        },
        {
          title: 'Tracing A: finish the read',
          text: [
            'Do not stop at the rhythm. Intervals: there is no PR interval to measure without P waves, and the QRS is narrow. Axis: lead I and aVF are both upward, so it is normal.',
            'ST segments and T waves: harder to judge on a wobbling baseline, but no lead shows the ST segment clearly lifted. The one-sentence report: "Atrial fibrillation with a fast ventricular rate, narrow QRS, normal axis, no ST elevation."',
          ],
          look: 'Check the width of the QRS in any lead, then lead I and aVF for the axis.',
          check: {
            kind: 'choice',
            question: 'The QRS complexes on tracing A are narrow. What does that tell you?',
            options: [
              'Each beat still reaches the ventricles through the normal fast wiring',
              'The atria are firing normally',
              'The rate must be under 100',
              'The ventricles are starting the beats themselves',
            ],
            answer: 0,
            explain: 'A narrow QRS means the signal came down the bundle of His and its branches, so the beats start above the ventricles. The trouble here is in the atria. Beats that start in the ventricles spread through muscle and are wide.',
          },
          more: ['atrial-fibrillation'],
        },
        {
          title: 'Tracing B: do not stop early',
          text: [
            'One more patient, this one with chest pain. Rate: the R waves are almost 5 large boxes apart, a little over 60 a minute. Rhythm: regular, with a P wave before every QRS. Intervals: PR about 0.18 s, QRS narrow. Axis: lead I and aVF both upward.',
            'So far everything is normal, and this is where readers go wrong: "sinus rhythm, rate 64" is true and it misses the point. Finish the list. Compare the ST segment with the baseline in every lead.',
          ],
          look: 'Go through the leads group by group: inferior (II, III, aVF), lateral (I, aVL, V5, V6), septal (V1, V2), anterior (V3, V4).',
          show: { rhythm: 'inferior-stemi' },
          check: {
            kind: 'lead',
            question: 'Tap a lead where the ST segment is lifted above the baseline.',
            targets: ['II', 'III', 'aVF'],
            explain: 'The ST segment is raised in II, III and aVF, the three inferior leads, most of all in lead III. Three contiguous leads agree, so this is a real finding in the inferior wall.',
          },
        },
        {
          title: 'Tracing B: name the wall',
          text: [
            'ST elevation in II, III and aVF points to the inferior wall. Now look at aVL: its ST segment is pushed below the baseline. aVL faces nearly the opposite side of the heart, so it shows the mirror image. That reciprocal change makes a heart attack much more likely than a harmless cause.',
            'ST elevation of 1 mm or more in two contiguous leads, in a patient with symptoms, is treated as a STEMI: a heart attack from a blocked coronary artery, where every minute counts. (In V2 and V3 the cut-off is higher, 1.5 to 2.5 mm depending on age and sex, because healthy people often show a little elevation there.)',
            'The report: "Sinus rhythm at 64, normal intervals, normal axis, ST elevation in II, III and aVF with reciprocal ST depression in aVL: inferior STEMI." You found it only because you finished the list.',
          ],
          look: 'The heart is seen from below. The pulsing purple area is the injured wall: the underside of the heart, in the territory of the right coronary artery.',
          show: { heart: 'territories', camera: 'Bottom', focus: 'heart' },
          check: {
            kind: 'choice',
            question: 'On tracing B, what does the ST depression in aVL tell you?',
            options: [
              'It is the mirror image of the inferior injury, and it makes a heart attack more likely',
              'There is a second, separate injury in the lateral wall',
              'The arm cables are swapped',
              'Nothing: the ST segment in aVL is often pushed down in a healthy heart',
            ],
            answer: 0,
            explain: 'aVL faces the high lateral wall, nearly opposite the inferior wall, so it draws the inferior ST elevation upside down. That reciprocal change supports a real heart attack and is not a second problem. Swapped arm cables would flip all of lead I and turn aVR upright.',
          },
          roleNote: {
            1: 'Recognizing this pattern is a paramedic and physician skill. What you can do is get this tracing recorded and transmitted early, per protocol.',
            2: 'This is the tracing that changes the destination: transmit it and activate the STEMI pathway per protocol. In an inferior STEMI a right-sided lead (V4R) is the next recording.',
            3: 'If these changes appear on the monitor during a case, tell the operator at once and note the time.',
            4: 'New ST elevation with chest pain is reported to the physician immediately, with a 12-lead and a set of vital signs.',
            5: 'Reciprocal ST depression in aVL is often the earliest sign of an inferior STEMI; ST elevation greater in III than in II favors the RCA over the circumflex.',
          },
          more: ['inferior-stemi', 'stemi-activation', 'cl-stemi-system'],
        },
      ],
    },
  ],
};
