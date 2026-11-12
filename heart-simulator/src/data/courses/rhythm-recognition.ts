import type { Course } from '@/types/course';

/**
 * Course: recognizing rhythms — the sinus rhythms as the reference (and the escape rhythm that covers
 * for a slow SA node), atrial fibrillation, flutter and SVT, the AV blocks, wide beats (bundle branch
 * blocks, pacing, PVCs), the ventricular rhythms, the four arrest rhythms, and a mixed set of strips to
 * name. Every rhythm is shown on the tracing and on the beating heart. Follows "Reading an ECG from
 * scratch" (ecg-foundations), which teaches the waves, the grid and the rate rules.
 * Educational content only.
 */
export const RHYTHM_RECOGNITION: Course = {
  id: 'rhythm-recognition',
  title: 'Recognizing rhythms',
  summary: 'Read a rhythm strip the same way every time: the sinus rhythms, atrial fibrillation, flutter and SVT, the AV blocks, wide beats and the rhythms of cardiac arrest, each one on the tracing and on the beating heart.',
  roles: [2, 3, 4, 5],
  level: 'core',
  lessons: [
    // ─── 1 ───────────────────────────────────────────────────────────────
    {
      id: 'sinus',
      title: 'Sinus rhythms: the reference',
      goal: 'Recognize normal sinus rhythm, sinus bradycardia, sinus tachycardia and a junctional escape rhythm, and decide what each one means for the patient.',
      minutes: 8,
      steps: [
        {
          title: 'Five questions for every strip',
          text: [
            'This course builds on "Reading an ECG from scratch". You should already know the three waves of a heartbeat: the P wave (the atria fire), the QRS (the ventricles fire) and the T wave (the ventricles reset).',
            'A rhythm strip is read the same way every time, in the same order. Is the rate fast, slow or normal? Is it regular? Are there P waves? Does a QRS follow every P wave, and after how long? Is the QRS narrow or wide?',
            'On standard ECG paper one small box is 0.04 seconds and one large box is 0.20 seconds. For a regular rhythm, 300 divided by the number of large boxes between two R waves (the peaks of the QRS) gives the rate. For an irregular one, count the QRS complexes in 6 seconds and multiply by 10.',
          ],
          look: 'Three leads sweep across the panel: II, V1 and V5. The bright vertical line is "now", the same instant the 3D heart is showing.',
          show: { heart: 'external', camera: 'Front', ecg: 'ecg', layout: 'monitor', rhythm: 'normal-sinus', hr: 72, focus: 'ecg' },
        },
        {
          title: 'Normal sinus rhythm',
          text: [
            'In sinus rhythm every beat starts in the sinoatrial (SA) node, the heart\'s own pacemaker at the top of the right atrium. It is the rhythm every other rhythm is compared with.',
            'On the strip: a rate of 60–100 a minute, evenly spaced beats, and an upright P wave in lead II before every QRS. The PR interval (start of the P wave to start of the QRS) is 0.12–0.20 seconds, 3 to 5 small boxes, and the same on every beat. The QRS is narrow: less than 0.12 seconds, 3 small boxes.',
          ],
          look: 'Lead II is enlarged. The labels mark the P wave, the PR interval, the QRS and the QT interval on the latest complete beat.',
          show: { inspect: 'II', focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'Which finding on this strip tells you the beats start in the SA node?',
            options: [
              'An upright P wave before every QRS, with the same PR interval each time',
              'The QRS complexes are narrow',
              'The rate is between 60 and 100 a minute',
              'The beats are evenly spaced',
            ],
            answer: 0,
            explain: 'A sinus beat is recognized by its P wave: upright in lead II, one before every QRS, at a constant PR interval. A narrow QRS, a normal rate and even spacing are also found in rhythms that start lower down, near the AV node.',
          },
          more: ['normal-sinus-rhythm', 'sa-node'],
        },
        {
          title: 'The strip is the heart\'s electricity',
          text: [
            'Each wave on the strip is something happening in the heart. The P wave is the signal spreading from the SA node across both atria. The flat stretch after it is the signal held at the atrioventricular (AV) node. The QRS is the signal racing down the bundle branches and through both ventricles.',
            'So the five questions are questions about the heart: where did the beat start, did it get through the AV node, and how did it spread through the ventricles?',
          ],
          look: 'The heart is see-through and slowed to a quarter of real speed. Each beat starts at the SA node, runs to the AV node, waits there, then races down the two bundle branches.',
          show: { heart: 'conduction', speed: 0.25, focus: 'heart' },
          check: {
            kind: 'tap',
            question: 'Tap the place where every sinus beat starts.',
            targets: ['sa-node'],
            explain: 'The SA node sits high in the right atrium, where the superior vena cava enters. When a beat starts anywhere else, the P wave changes shape, disappears or loses its link to the QRS.',
          },
        },
        {
          title: 'Sinus bradycardia',
          text: [
            'Sinus bradycardia is a sinus rhythm slower than 60 a minute (the 2018 US bradycardia guideline uses less than 50). Nothing else changes: a P wave before every QRS, a normal PR interval, a narrow QRS.',
            'It is normal in sleep and in fit people. It can also come from drugs that slow the SA node (beta-blockers, some calcium channel blockers, digoxin), a heart attack of the inferior wall, low oxygen, a cold body or rising pressure inside the skull.',
            'The number alone decides nothing. What matters is perfusion: whether enough blood is reaching the brain and the other organs. Check the blood pressure, alertness and skin, and ask about chest pain and shortness of breath.',
          ],
          look: 'The R waves are more than five large boxes apart: under 60 a minute. Each one still has its P wave in front. On the heart, the pause between beats is longer.',
          show: { rhythm: 'sinus-bradycardia', hr: 46, speed: 1, heart: 'external', camera: 'Front', focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'A slow rhythm can also be a heart block. What makes this one sinus bradycardia?',
            options: [
              'Every P wave is followed by a QRS, at a normal and constant PR interval',
              'The QRS complexes are narrow',
              'The beats are evenly spaced',
              'The rate is under 60 a minute',
            ],
            answer: 0,
            explain: 'In sinus bradycardia the SA node is slow, but every signal still reaches the ventricles. Complete heart block can also be slow, regular and narrow; there the P waves and the QRS complexes have nothing to do with each other.',
          },
          roleNote: {
            1: 'You do not interpret the rhythm. A slow pulse with low blood pressure, confusion, chest pain or shock needs ALS early. Give oxygen only if the patient is hypoxemic, and acquire and transmit a 12-lead where your protocols allow.',
          },
          more: ['sinus-bradycardia'],
        },
        {
          title: 'When the SA node is too slow: an escape rhythm',
          text: [
            'The SA node is not the heart\'s only pacemaker. If it slows too far or stops, the tissue around the AV node (the AV junction) starts beats of its own at 40–60 a minute. If that fails too, the ventricles can fire at 20–40 a minute. These backup rhythms are called escape rhythms.',
            'A junctional escape rhythm is regular with a narrow QRS, because each beat still runs down the normal wiring. What is missing is the normal P wave. The atria are fired backward, from below, so the P wave is upside down in lead II. It can sit just before the QRS, hide inside it or follow it.',
            'An escape rhythm is a safety net, not the problem. The question is why the SA node is not doing its job: drugs that slow it, a heart attack of the inferior wall, or a strong pull from the vagus nerve, the nerve that slows the heart. Care is aimed at that cause and at perfusion, never at stopping the escape beats.',
          ],
          look: 'Lead II is enlarged: narrow QRS complexes at 48 a minute, evenly spaced. No upright P wave comes before them, only a small downward dip right in front of each QRS. On the see-through heart each beat starts at the AV node, not the SA node.',
          show: { rhythm: 'junctional', hr: 48, heart: 'conduction', inspect: 'II', focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'A patient who takes a beta-blocker has this rhythm at 48 a minute and feels well. How should you think about it?',
            options: [
              'A backup pacemaker is covering for a slow SA node: look for the cause and leave the escape beats alone',
              'An abnormal focus has taken over: it should be suppressed with an antiarrhythmic drug',
              'Atrial fibrillation: there are no normal P waves',
              'Complete heart block: the rate is slow',
            ],
            answer: 0,
            explain: 'An escape rhythm is a rescue, not a rival. The junction fires only because nothing faster reached it, and suppressing it could leave the patient with no rhythm at all. Atrial fibrillation is irregular, and complete heart block shows upright P waves that keep their own pace.',
          },
          roleNote: {
            2: 'Never give lidocaine or amiodarone to suppress a slow escape rhythm. If perfusion is poor, treat it as symptomatic bradycardia per protocol: atropine, then pacing or an infusion. Look for an inferior STEMI and ask about digoxin.',
            4: 'Report a new junctional rhythm, check the latest potassium and magnesium, and ask the physician whether drugs that slow the SA or AV node should be held. Digoxin toxicity is a classic cause.',
          },
          more: ['junctional-rhythm', 'av-node'],
        },
        {
          title: 'Sinus tachycardia',
          text: [
            'Sinus tachycardia is a sinus rhythm faster than 100 a minute. The P wave is still there before every QRS, but at fast rates it moves up against the T wave of the beat before.',
            'It is a sign, not a diagnosis. The SA node is doing what the body asks: pain, fever, anxiety, bleeding, dehydration, low oxygen, infection, a clot in the lungs, heart failure, stimulants. It speeds up and slows down gradually and rarely goes above about 220 minus the patient\'s age.',
            'The treatment is to find and treat the cause. Slowing a heart that is racing to hold the blood pressure up can make the patient collapse, and a shock will not stop it: the SA node fires again at once.',
          ],
          look: 'Find the P wave in front of each QRS in lead II. At this rate it sits close behind the T wave of the previous beat.',
          show: { rhythm: 'sinus-tachycardia', hr: 122, heart: 'external', focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'A patient hit by a car has this rhythm at 130 a minute and a falling blood pressure. What is the rhythm telling you?',
            options: [
              'The rhythm is the problem and must be slowed',
              'The heart is compensating: look for bleeding',
              'The heart\'s wiring has a short circuit',
              'The monitor is counting T waves as beats',
            ],
            answer: 1,
            explain: 'Sinus tachycardia with a falling blood pressure after trauma is blood loss until proven otherwise. The fast rate is what is keeping the patient alive, so the target is the cause, not the rate.',
          },
          more: ['sinus-tachycardia'],
        },
        {
          title: 'Breathing changes the rate',
          text: [
            'A sinus rhythm is never perfectly even. The rate rises a little as you breathe in and falls as you breathe out, because breathing changes the pull of the vagus nerve on the SA node.',
            'When the longest and shortest gaps between P waves differ by more than 0.12 seconds (3 small boxes), it is called sinus arrhythmia. It is normal, and strongest in children and fit young adults. Every beat still has the same P wave and the same PR interval.',
          ],
          look: 'On this tracing the gaps change by about one small box. In a healthy child they can change by several, speeding and slowing in step with each breath.',
          show: { rhythm: 'normal-sinus', hr: 60, focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'A healthy 9-year-old\'s heart rate rises and falls with every breath. Each beat has a normal P wave and PR interval. What is this?',
            options: [
              'Atrial fibrillation',
              'Respiratory sinus arrhythmia: a normal finding',
              'A second-degree AV block',
              'Early beats that need treatment',
            ],
            answer: 1,
            explain: 'The rate changes smoothly with breathing and every beat is a sinus beat. Atrial fibrillation has no P waves and no pattern to its gaps; in an AV block some P waves have no QRS after them.',
          },
        },
        {
          title: 'Treat the patient, not the monitor',
          text: [
            'The monitor shows electricity, not pumping. A perfect sinus rhythm does not prove that the heart is moving blood, and a fast or slow sinus rhythm may be the right response to what the patient is going through.',
            'So every rhythm you read ends with the same step: look at the patient. Awake? Breathing normally? A pulse you can feel? Warm skin and a blood pressure? The strip tells you where to look next; the patient tells you how urgent it is.',
          ],
          look: 'Normal sinus rhythm again. Keep this picture in mind: every rhythm in the next lessons is some part of it gone wrong.',
          show: { rhythm: 'normal-sinus', hr: 72, focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'The monitor shows sinus rhythm at 80 a minute. The patient does not respond, is not breathing and has no pulse. What now?',
            options: [
              'Start CPR: a rhythm on the monitor without a pulse is cardiac arrest',
              'Watch the rhythm: it is normal',
              'Change the lead to get a better look',
              'Give oxygen and recheck in two minutes',
            ],
            answer: 0,
            explain: 'An organized rhythm with no pulse is pulseless electrical activity (PEA), a cardiac arrest. The monitor cannot tell you this; only checking the patient can.',
          },
          roleNote: {
            1: 'You are not asked to interpret the rhythm. You act on the patient: no response, no normal breathing and no pulse mean CPR and the AED, whatever the screen shows.',
            3: 'In the lab you have the arterial pressure waveform as well as the ECG. If the pressure wave goes flat while the rhythm continues, call it out at once.',
          },
          more: ['normal-sinus-rhythm'],
        },
      ],
    },

    // ─── 2 ───────────────────────────────────────────────────────────────
    {
      id: 'atrial',
      title: 'Fast and narrow: fibrillation, flutter and SVT',
      goal: 'Tell atrial fibrillation, atrial flutter and SVT apart on a strip, and describe what the atria are doing in each.',
      minutes: 9,
      steps: [
        {
          title: 'Above the ventricles, but not the SA node',
          text: [
            'Three common fast rhythms start above the ventricles but outside the SA node: atrial fibrillation, atrial flutter and supraventricular tachycardia (SVT). Because the ventricles are still reached through the normal wiring, the QRS is usually narrow in all three.',
            'Two questions sort them. Is the rhythm regular or irregular? And what do you see between the QRS complexes: P waves, a sawtooth, a wobbling line or nothing at all?',
          ],
          look: 'Run your eye along lead II. The QRS complexes are narrow, but the gaps between them keep changing and no two stretches of baseline look the same.',
          show: { heart: 'external', camera: 'Front', ecg: 'ecg', layout: 'monitor', rhythm: 'atrial-fibrillation', hr: 112, focus: 'ecg' },
        },
        {
          title: 'Atrial fibrillation: irregularly irregular',
          text: [
            'In atrial fibrillation (AF) the atria have no organized beat. Many small waves of electricity wander through them at more than 350 a minute, and the AV node lets some of them through at random.',
            'On the strip there are no P waves. The baseline between beats wobbles finely (fibrillatory waves, often clearest in V1), and the QRS complexes come at gaps with no pattern at all: "irregularly irregular". A ventricular rate over 100 a minute is called a rapid ventricular response.',
          ],
          look: 'Compare any three gaps between R waves in lead II: none match. Then look at V1 between the beats: a fine, restless wobble where the P waves should be.',
          show: { focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'Which pair of findings makes this atrial fibrillation?',
            options: [
              'Wide QRS complexes at regular gaps',
              'A P wave before every QRS, and a rate over 100',
              'No P waves, and QRS complexes at gaps with no pattern',
              'P waves that are not followed by a QRS',
            ],
            answer: 2,
            explain: 'AF is the only common rhythm that is completely irregular with no P waves. Sinus tachycardia has a P wave before each QRS; P waves without a QRS belong to the AV blocks.',
          },
          roleNote: {
            2: 'Fast AF with low blood pressure, shock, chest pain or acute heart failure is unstable: synchronized cardioversion per protocol. A very fast, irregular rhythm with wide QRS complexes that keep changing shape may be AF crossing an extra pathway (WPW): give no drug that blocks the AV node.',
          },
          more: ['atrial-fibrillation'],
        },
        {
          title: 'AF: what the atria are doing',
          text: [
            'Atria that fibrillate do not squeeze; they quiver. The top-up they normally give the ventricles at the end of filling, the atrial kick, is lost. A healthy heart copes. A stiff or failing heart, or one beating very fast, can drop its output sharply.',
            'Blood also sits still in the quivering atria, above all in a small pouch called the left atrial appendage. Clots form there and can travel to the brain: AF is a leading cause of stroke.',
          ],
          look: 'Slowed to half speed. Amber sparks flicker all over both atria and no signal leaves the SA node. The bundle branches fire only when a signal slips through the AV node. The Cardiac cycle box never shows atrial systole.',
          show: { heart: 'conduction', speed: 0.5, focus: 'heart' },
          check: {
            kind: 'tap',
            question: 'Tap the structure that decides how many of these signals reach the ventricles.',
            targets: ['av-node'],
            explain: 'The AV node is the only electrical path to the ventricles, and it filters the storm above it. That is why the ventricular rate in AF is irregular, and why the drugs used to slow AF act on the AV node.',
          },
          roleNote: {
            4: 'Before a planned cardioversion, check which anticoagulant the patient takes and when the last dose was given, and report how long the AF has lasted. The physician needs both to judge the risk of a clot.',
          },
          more: ['left-atrial-appendage', 'av-node'],
        },
        {
          title: 'Atrial flutter: the sawtooth',
          text: [
            'In atrial flutter one wave of electricity runs round and round a fixed loop in the right atrium, about 300 times a minute. Every lap draws one flutter wave, so the baseline becomes a continuous sawtooth with no flat stretch between the teeth.',
            'The AV node cannot pass 300 signals a minute. Most often it lets every second one through (2:1 conduction), and the ventricles beat at a steady 150 a minute. At that rate half the flutter waves hide in the QRS and the T wave, and the strip is easily mistaken for sinus tachycardia.',
          ],
          look: 'This is the full 12-lead at 150 a minute. Look between the QRS complexes in the leads that view the heart from below (II, III and aVF) for a baseline that never lies flat.',
          show: { rhythm: 'atrial-flutter', hr: 150, layout: 'simultaneous', heart: false, speed: 1 },
          check: {
            kind: 'lead',
            question: 'Tap a lead where flutter waves show best.',
            targets: ['II', 'III', 'aVF', 'V1', 'V2', 'V3'],
            explain: 'Flutter waves are usually clearest in the inferior leads II, III and aVF, and often in V1. A regular narrow tachycardia fixed at about 150 a minute should always make you search these leads for flutter.',
          },
          more: ['atrial-flutter'],
        },
        {
          title: 'Slow the ventricles and the flutter shows',
          text: [
            'Here the AV node is letting only every fourth flutter wave through (4:1 conduction), so the ventricles beat at 75 a minute. The atria have not changed: still 300 a minute.',
            'This is what you see for a few seconds when the AV node is briefly slowed in a patient with flutter, by a drug or by a vagal maneuver (bearing down as if straining, which slows the node through the vagus nerve). The ventricles pause, the sawtooth marches on in plain view, and the diagnosis is made. The flutter itself does not stop.',
          ],
          look: 'Lead II is enlarged. Count the teeth from one QRS to the next: four flutter waves for every beat, and no flat baseline anywhere.',
          show: { hr: 75, inspect: 'II' },
          check: {
            kind: 'choice',
            question: 'The atria are fluttering at 300 a minute. With 2:1 conduction, what is the ventricular rate?',
            options: ['75 a minute', '100 a minute', '150 a minute', '300 a minute'],
            answer: 2,
            fixed: true,
            explain: '300 ÷ 2 = 150. With 3:1 conduction it is 100 and with 4:1 it is 75, as on this strip. If all 300 got through (1:1), the rate would be dangerously fast.',
          },
        },
        {
          title: 'Flutter: the loop in the right atrium',
          text: [
            'The loop of typical flutter runs around the ring of the tricuspid valve, passing through a narrow strip of muscle between the valve and the inferior vena cava. Because the path never changes, every flutter wave looks the same and the rate hardly varies.',
            'That fixed path is also its weakness. A catheter passed up from a vein in the leg can burn a line across the narrow strip (catheter ablation). That breaks the loop and cures typical flutter in most patients. Until then the atria beat too fast to pump well, and the risk of clots and stroke is managed as in AF.',
          ],
          look: 'The view is from the patient\'s right, slowed to a quarter speed. A bright wave chases its tail around a ring in the right atrium. Conduction is still 4:1, so only one lap in four sends a signal down to the ventricles.',
          show: { heart: 'conduction', camera: 'Right', speed: 0.25, focus: 'heart' },
          roleNote: {
            5: 'Typical flutter is cavotricuspid isthmus-dependent and usually counterclockwise: negative flutter waves in II, III and aVF, positive in V1. Clockwise typical flutter reverses both.',
          },
          more: ['atrial-flutter', 'catheter-ablation'],
        },
        {
          title: 'SVT: regular, narrow and very fast',
          text: [
            'Strictly, every fast rhythm that starts above the ventricles is supraventricular. In everyday use, SVT means a regular, narrow tachycardia that starts and stops in an instant. The most common kind in adults is AV nodal reentrant tachycardia (AVNRT): the signal circles a tiny loop in and around the AV node.',
            'Each lap sends one signal down to the ventricles and one back up to the atria at almost the same moment. So the strip shows narrow QRS complexes, perfectly evenly spaced, usually at 150–250 a minute (it can be as slow as 140), with no P wave in front of them. The P wave is there, but buried in the end of the QRS.',
          ],
          look: 'Lead II at 180 a minute: narrow complexes like a metronome. Between the T wave and the next QRS there is no P wave to find.',
          show: { rhythm: 'avnrt', hr: 180, heart: 'external', camera: 'Front', layout: 'monitor', speed: 1, focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'This rhythm is regular and narrow, like sinus tachycardia. What tells you it is SVT?',
            options: [
              'The beats are evenly spaced',
              'The QRS complexes are narrow',
              'The rate is over 100 a minute',
              'No P wave comes before the QRS, and the rate does not vary',
            ],
            answer: 3,
            explain: 'Sinus tachycardia has a P wave before every QRS, drifts up and down with the patient\'s condition and rarely passes about 220 minus age. SVT switches on and off suddenly and holds one fixed rate with no P wave in front.',
          },
          more: ['avnrt'],
        },
        {
          title: 'SVT: break the loop',
          text: [
            'The loop of AVNRT needs the AV node. Block the node for a moment and the loop breaks: the rhythm stops as suddenly as it started, and sinus rhythm returns.',
            'That is how the usual treatments work: a vagal maneuver first, then the drug adenosine, which blocks the AV node for a few seconds. If the patient is unstable (low blood pressure, shock, chest pain, confusion), the treatment is synchronized cardioversion instead: a shock timed to the QRS.',
          ],
          look: 'Slowed to a quarter speed. The AV node is ringed, with a blue name tag. Each lap sends a signal down the bundle branches and another backward into the atria. The SA node never gets a turn.',
          show: { heart: 'conduction', speed: 0.25, structure: 'av-node', focus: 'heart' },
          check: {
            kind: 'choice',
            question: 'A brief block of the AV node stops this rhythm. What does the same block do in atrial flutter?',
            options: [
              'It slows the ventricles for a few seconds and uncovers the flutter waves',
              'It stops the flutter for good',
              'It makes the atria flutter faster',
              'It has no effect on the strip',
            ],
            answer: 0,
            explain: 'Flutter and AF live in the atria and do not need the AV node, so blocking it only slows the ventricles for a moment. A rhythm that stops with a vagal maneuver or adenosine was almost certainly using the AV node as part of its loop.',
          },
          roleNote: {
            2: 'Run a continuous strip during any vagal maneuver or adenosine dose: how the rhythm responds is itself the diagnosis. Follow your protocol for the drug and for synchronized cardioversion.',
            3: 'Start a continuous recording before the maneuver or the drug, and call out the moment the rhythm changes. The drug is given by the nurse or the physician.',
            4: 'Give adenosine only on order, as a rapid push followed at once by a flush, with a continuous strip running. Warn the patient about the brief flushing and chest pressure.',
          },
          more: ['adenosine', 'cardioversion', 'unstable-svt'],
        },
        {
          title: 'Sort them in two questions',
          text: [
            'Irregular with no P waves: atrial fibrillation. Regular at about 150 with a sawtooth baseline: flutter with 2:1 conduction. Regular at 150–250 with nothing between the beats: SVT. Regular with a P wave before every QRS and a rate that drifts: sinus tachycardia.',
            'Fast AF is the trap. The faster it goes, the more even it looks at a glance. Measure several gaps before you call a narrow tachycardia regular.',
          ],
          look: 'Lead II at about 150 a minute. Compare the gaps between R waves along the whole strip before you decide.',
          show: { rhythm: 'atrial-fibrillation', hr: 150, heart: false, layout: 'monitor', speed: 1 },
          check: {
            kind: 'choice',
            question: 'Name the rhythm on this strip.',
            options: [
              'Atrial flutter with 2:1 conduction',
              'Sinus tachycardia',
              'SVT (AVNRT)',
              'Atrial fibrillation with a rapid ventricular response',
            ],
            answer: 3,
            explain: 'The gaps between beats keep changing with no pattern and there are no P waves: atrial fibrillation. Flutter with 2:1 conduction and SVT are as regular as a metronome, and sinus tachycardia has a P wave before every QRS.',
          },
          more: ['atrial-fibrillation', 'atrial-flutter', 'avnrt'],
        },
      ],
    },

    // ─── 3 ───────────────────────────────────────────────────────────────
    {
      id: 'av-blocks',
      title: 'AV blocks: when the gateway fails',
      goal: 'Name the four AV blocks from what follows each P wave, and say which ones are dangerous.',
      minutes: 8,
      steps: [
        {
          title: 'One path from atria to ventricles',
          text: [
            'The atria and ventricles are electrically insulated from each other. The only way through is the AV node and, directly below it, the bundle of His. An AV block is a signal delayed or stopped somewhere on that path.',
            'To name a block, start with the P waves. Find every one, then ask what follows it. In a normal rhythm each P wave is followed by a QRS after 0.12–0.20 seconds (3 to 5 small boxes), every time.',
          ],
          look: 'Slowed to half speed. The AV node and the bundle of His carry amber tags. Each beat runs from the SA node to the AV node, waits there, then passes down the bundle of His into both bundle branches.',
          show: { heart: 'conduction', camera: 'Front', ecg: 'ecg', layout: 'monitor', rhythm: 'normal-sinus', hr: 70, speed: 0.5, highlight: ['av-node', 'bundle-of-his'], focus: 'heart' },
        },
        {
          title: 'First degree: every beat gets through, late',
          text: [
            'In first-degree AV block the PR interval is longer than 0.20 seconds (one large box) and the same on every beat. Every P wave is still followed by a QRS, so this is a delay more than a block.',
            'The delay is usually in the AV node. Common causes are drugs that slow the node, a strong pull from the vagus nerve and aging of the wiring. It rarely causes symptoms on its own; what matters is the cause, and whether it gets worse.',
          ],
          look: 'Lead II is enlarged with the PR interval labeled: well over 200 ms, and identical beat after beat. On the heart the signal lingers at the AV node before it moves on.',
          show: { rhythm: 'first-degree-avb', hr: 68, speed: 1, inspect: 'II', focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'A long PR interval tells you there is an AV block. What tells you it is only first degree?',
            options: [
              'Every P wave is followed by a QRS',
              'The QRS complexes are narrow',
              'The rate is normal',
              'The P waves are upright',
            ],
            answer: 0,
            explain: 'First degree means delayed but never dropped: one QRS for every P wave. As soon as a P wave stands alone with no QRS after it, the block is at least second degree.',
          },
          more: ['first-degree-av-block'],
        },
        {
          title: 'Mobitz I (Wenckebach): longer, longer, drop',
          text: [
            'In second-degree AV block some P waves reach the ventricles and some do not. In the first type, Mobitz I or Wenckebach, the AV node tires: each PR interval is longer than the one before, until a P wave is not followed by a QRS at all.',
            'The missed beat gives the node a rest, and the cycle starts again with a short PR. The beats come in groups with a pause between them. This block almost always sits in the AV node itself. It is common in sleep, in athletes and with inferior heart attacks, and it is usually harmless and short-lived.',
          ],
          look: 'Lead II, enlarged. The PR label grows from beat to beat. Then find a P wave with no QRS after it, followed by a pause. After the pause the PR is short again.',
          show: { rhythm: 'mobitz-i', hr: 80, inspect: 'II', focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'In each group of beats on this strip, which PR interval is the shortest?',
            options: [
              'The middle one',
              'The last one before the dropped beat',
              'The first one after the dropped beat',
              'They are all the same',
            ],
            answer: 2,
            explain: 'After the dropped beat the AV node has rested, so it conducts fastest. The PR then lengthens with each beat, and the longest one comes right before the next drop.',
          },
          more: ['mobitz-type-i'],
        },
        {
          title: 'Mobitz II: a dropped beat without warning',
          text: [
            'In Mobitz II the PR interval does not change. It is the same on every conducted beat, and then, with no warning, a P wave has no QRS after it.',
            'This block usually sits below the AV node, in the bundle of His or the bundle branches, where conduction is all or nothing. The QRS is often wide because one bundle branch is already blocked.',
            'Mobitz II is dangerous. It can turn into complete heart block from one beat to the next, and the backup pacemaker below this level is slow and unreliable. Pacing pads go on early, and most patients need a pacemaker even if they feel well.',
          ],
          look: 'Lead II, enlarged. The PR label reads the same on every conducted beat. Then a P wave stands alone. The QRS is wide: this patient also has a right bundle branch block.',
          show: { rhythm: 'mobitz-ii', hr: 80, inspect: 'II', focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'Both kinds of second-degree block drop beats. What tells you this one is Mobitz II?',
            options: [
              'The beats come in groups',
              'There are more P waves than QRS complexes',
              'The PR interval is the same before and after the dropped beat',
              'The rate is slow',
            ],
            answer: 2,
            explain: 'A constant PR with a sudden drop is Mobitz II. In Wenckebach the PR stretches before the drop and is shortest after it. More P waves than QRS complexes, grouped beats and a slow rate are found in both.',
          },
          roleNote: {
            2: 'Apply pacing pads early, even when the patient looks stable. Atropine often fails in a block below the AV node and must not delay pacing per protocol.',
            3: 'Keep pacing pads connected and have the temporary pacing wire, sheath and generator ready. Report new dropped beats to the operator at once.',
            4: 'Keep pads on, watch perfusion and alertness closely, and give chronotropic drugs only on order. Prepare the patient for temporary or permanent pacing.',
            5: 'Mobitz II without a reversible cause is a Class 1 indication for permanent pacing even without symptoms (2018 ACC/AHA/HRS).',
          },
          more: ['mobitz-type-ii', 'temporary-pacing'],
        },
        {
          title: 'Where each block sits',
          text: [
            'Where the block is decides how safe the patient is. If the AV node fails, the tissue directly below it can take over as pacemaker at 40–60 a minute with a narrow QRS. If the bundle of His or both bundle branches fail, the only backup is in the ventricles: 20–40 a minute, wide and unreliable.',
            'Wenckebach belongs to the AV node; Mobitz II belongs below it. When every second P wave is dropped (2:1 block), the strip cannot tell you which type it is. A wide QRS makes the dangerous kind more likely.',
          ],
          look: 'Slowed to a quarter speed. A red ✕ sits on the right bundle branch with every beat: that branch is blocked for good. On the dropped beat the impulse crosses the AV node, then a second ✕ appears just below it, on the His bundle.',
          show: { heart: 'conduction', speed: 0.25, focus: 'heart' },
          check: {
            kind: 'tap',
            question: 'Tap a part of the wiring where the block of Mobitz II usually sits.',
            targets: ['bundle-of-his', 'right-bundle-branch', 'left-bundle-branch', 'left-anterior-fascicle', 'left-posterior-fascicle'],
            explain: 'Mobitz II is usually a block in the bundle of His or in the bundle branches, below the AV node. The AV node itself is where Wenckebach sits.',
          },
          more: ['bundle-of-his', 'av-node'],
        },
        {
          title: 'Complete heart block: two rhythms, no connection',
          text: [
            'In third-degree (complete) AV block no P wave reaches the ventricles. The atria follow the SA node. The ventricles are driven by a backup pacemaker below the block: an escape rhythm, as in the first lesson.',
            'On the strip the P waves are regular and the QRS complexes are regular, but nothing ties them together. The PR interval is different every time, P waves land before, on and after the QRS, and there are more P waves than QRS complexes.',
            'A narrow escape at 40–60 a minute comes from directly below the AV node. A wide escape at 20–40 a minute, as here, comes from the ventricles and can stop without warning.',
          ],
          look: 'In lead II the wide QRS complexes are slow and evenly spaced. Now find the small P waves: they keep their own faster pace and walk straight through the QRS complexes and T waves.',
          show: { rhythm: 'third-degree-avb', hr: 36, layout: 'monitor', speed: 1, focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'What proves this is complete heart block and not a slow sinus rhythm?',
            options: [
              'The QRS complexes are wide',
              'The rate is below 40 a minute',
              'There are P waves on the strip',
              'The P waves and QRS complexes each keep their own rhythm, with no fixed PR',
            ],
            answer: 3,
            explain: 'In complete block the atria and ventricles are dissociated: regular P waves, regular QRS complexes, no relationship. A slow rate and a wide QRS can also be found when every beat is conducted.',
          },
          more: ['third-degree-av-block'],
        },
        {
          title: 'Complete heart block on the heart',
          text: [
            'The atria and ventricles now beat out of step. The atrial kick lands at random, sometimes against closed valves, and the output of the heart rests on a slow escape rhythm. Patients faint, or go into heart failure or shock.',
            'If the escape pacemaker stops, there is no heartbeat at all. That is why complete heart block with symptoms is paced: first through pads on the chest, then with a wire inside the heart, then with a permanent pacemaker if the block does not recover.',
          ],
          look: 'Slowed to half speed. The atria fire from the SA node at their own pace, and every signal stops at the red ✕. Lower down, a purple flash marks each beat of the backup pacemaker in the ventricles, far less often.',
          show: { heart: 'conduction', speed: 0.5, focus: 'heart' },
          check: {
            kind: 'tap',
            question: 'Tap the pacemaker that the atria are still following.',
            targets: ['sa-node'],
            explain: 'The SA node is working normally. The fault is on the path, not at the source: none of its signals get past the block, so the ventricles rely on their own slow backup.',
          },
          roleNote: {
            2: 'With poor perfusion, pace through the pads or start a chronotropic infusion per protocol. Atropine may help a narrow escape but must not delay pacing for a wide one. Confirm that each paced beat makes a pulse.',
            3: 'Prepare for a temporary pacing wire: sheath, wire and generator. Report the escape rate, the blood pressure and, once pacing starts, whether every spike captures.',
            4: 'Keep pads on and reassess perfusion and alertness often. Give atropine or infusions only on order, and pain relief or sedation on order during pacing through the pads.',
          },
          more: ['temporary-pacing', 'pacemaker-implantation', 'cl-temp-wire', 'bradycardia-with-shock'],
        },
        {
          title: 'Name the block',
          text: [
            'Four patterns, one question each time: what follows the P wave? A long PR on every beat is first degree. A PR that stretches until a beat drops is Mobitz I. A constant PR with a sudden drop is Mobitz II. P waves and QRS complexes that ignore each other are complete block.',
            'First degree and Mobitz I are usually problems of the AV node and often need only watching. Mobitz II and complete block are the ones that can stop the heart.',
          ],
          look: 'A second-degree block is on the strip again. Follow the PR interval up to the dropped beat before you answer.',
          show: { rhythm: 'mobitz-i', hr: 80, heart: false, layout: 'monitor', speed: 1 },
          check: {
            kind: 'choice',
            question: 'Which block is on this strip?',
            options: [
              'Second-degree AV block, Mobitz I (Wenckebach)',
              'Second-degree AV block, Mobitz II',
              'First-degree AV block',
              'Complete heart block',
            ],
            answer: 0,
            explain: 'The PR interval lengthens beat by beat until one P wave is not conducted, then starts short again: Wenckebach. Mobitz II keeps the same PR, first degree never drops a beat, and complete block has no fixed PR at all.',
          },
          more: ['mobitz-type-i', 'mobitz-type-ii'],
        },
      ],
    },

    // ─── 4 ───────────────────────────────────────────────────────────────
    {
      id: 'wide-beats',
      title: 'Wide beats: bundle branch blocks, pacing and PVCs',
      goal: 'Explain why a QRS is wide, and recognize right and left bundle branch block, a paced rhythm and PVCs.',
      minutes: 8,
      steps: [
        {
          title: 'Why a QRS is wide',
          text: [
            'In a normal beat the signal runs down the right and left bundle branches at once, and both ventricles fire within 0.12 seconds (3 small boxes). The QRS is narrow.',
            'A QRS of 0.12 seconds or more means part of the ventricles was reached the slow way, from muscle cell to muscle cell. That happens for two reasons: the beat came down from above but one bundle branch is blocked, or the beat started in the ventricles themselves.',
          ],
          look: 'Slowed to a quarter speed. From the bundle of His the signal reaches the far ends of both bundle branches at almost the same moment.',
          show: { heart: 'conduction', camera: 'Front', ecg: 'ecg', layout: 'simultaneous', rhythm: 'normal-sinus', hr: 72, speed: 0.25, focus: 'heart' },
        },
        {
          title: 'Right bundle branch block',
          text: [
            'In right bundle branch block (RBBB) the left ventricle fires on time, but the right ventricle has to wait for the signal to cross from the left through muscle. Its late firing adds an extra wave to the end of every QRS.',
            'V1 sits over the right ventricle and sees that late wave coming toward it: a small r, an S, then a second, taller wave called R′ ("R prime"). This M-shaped complex is written rSR′. Leads that look from the left, I and V6, see the late wave going away: a wide, slurred S wave. The QRS is 0.12 seconds or more.',
            'The P waves and the PR interval are untouched. A bundle branch block is not a rhythm; it is how each beat travels.',
          ],
          look: 'Compare V1 and V6 on the 12-lead. One ends in a tall late wave, giving an M shape. The other ends in a wide, slow S wave.',
          show: { rhythm: 'rbbb', hr: 72, heart: false, speed: 1 },
          check: {
            kind: 'lead',
            question: 'Tap a lead that shows the M-shaped rSR′ complex.',
            targets: ['V1', 'V2', 'V3'],
            explain: 'The rSR′ of RBBB appears in the chest leads over the right ventricle, V1 and V2 above all. I, aVL and V6 show the other half of the picture: a wide S wave at the end of the QRS.',
          },
          more: ['right-bundle-branch-block', 'right-bundle-branch'],
        },
        {
          title: 'RBBB: the late ventricle',
          text: [
            'This is an activation map, like the ones made in an electrophysiology lab. It colors each part of the ventricles by when the signal arrives: red first, then yellow, green and blue, and purple last. The atria are colored the same way, on a clock of their own.',
            'In RBBB the left ventricle, fed by the healthy left bundle, fires first. The signal then crawls across to the right ventricle, whose outer wall is the last to fire. That late patch of muscle is the R′ you saw in V1.',
          ],
          look: 'Slowed to a quarter speed. A white band sweeps over the surface with each beat, and the legend at the bottom left names the pattern.',
          show: { heart: 'activation', camera: 'Front', speed: 0.25, focus: 'heart' },
          check: {
            kind: 'tap',
            question: 'Tap the ventricle that fires last.',
            targets: ['right-ventricle'],
            explain: 'With the right bundle blocked, the right ventricle is reached late and slowly from the left side. The front of the heart, which is mostly right ventricle, shows the late colors.',
          },
        },
        {
          title: 'Left bundle branch block',
          text: [
            'In left bundle branch block (LBBB) it is the left ventricle that waits. The septum is activated backward, from right to left, and the thick left ventricle is then reached slowly through muscle.',
            'All the late electricity now points to the left. The lateral leads, which look at the heart from the left (I, aVL, V5 and V6), show a broad, often notched, all-upright R wave. V1 shows the opposite: a deep, wide, negative complex. The ST segment and T wave point away from the QRS; in LBBB that is expected.',
            'Unlike RBBB, LBBB usually means underlying heart disease. It also hides the usual ECG signs of a heart attack, so chest pain with LBBB needs extra care.',
          ],
          look: 'On the 12-lead, V1 to V3 are deep and negative. Find the lateral leads and compare: wide, upright and blunt or notched at the top, with the T wave pointing down.',
          show: { rhythm: 'lbbb', hr: 72, heart: false, speed: 1 },
          check: {
            kind: 'lead',
            question: 'Tap a lateral lead that shows the broad, upright R wave of LBBB.',
            targets: ['I', 'aVL', 'V5', 'V6'],
            explain: 'I, aVL, V5 and V6 view the heart from the left, the direction the late signal is heading, so they record a broad upright R wave. V1 looks from the right front and records a deep negative complex.',
          },
          roleNote: {
            5: 'For suspected infarction in LBBB or a ventricular paced rhythm, use the Smith-modified Sgarbossa criteria: concordant ST elevation, concordant ST depression in V1–V3, or excessively discordant ST elevation.',
          },
          more: ['left-bundle-branch-block', 'left-bundle-branch'],
        },
        {
          title: 'LBBB: a ventricle out of step',
          text: [
            'On the map the right ventricle now fires first, and the side wall of the left ventricle fires last, well after the septum.',
            'That costs pumping power. The septum squeezes while the side wall is still relaxed, then the side wall squeezes while the septum is letting go, so part of each beat is wasted. In a weak heart this matters enough to treat: a pacemaker with an extra lead on the late wall fires both sides together (cardiac resynchronization therapy).',
          ],
          look: 'The view is from the patient\'s left, slowed to a quarter speed. Early colors come around from the right ventricle; the side wall of the left ventricle shows the late colors.',
          show: { heart: 'activation', camera: 'Left', speed: 0.25, focus: 'heart' },
          check: {
            kind: 'choice',
            question: 'In LBBB the side wall of the left ventricle fires late. What does that do to each beat?',
            options: [
              'Nothing: timing does not affect pumping',
              'The ventricle squeezes harder to make up for it',
              'The walls squeeze out of step, so the ventricle ejects less',
              'The right ventricle stops pumping',
            ],
            answer: 2,
            explain: 'A ventricle pumps best when its walls squeeze together. LBBB spreads the squeeze out in time (dyssynchrony), which lowers the output and can worsen a weak heart. Resynchronization pacing is built on correcting that timing.',
          },
          more: ['left-bundle-branch-block', 'crt-implantation'],
        },
        {
          title: 'A paced rhythm',
          text: [
            'A pacemaker lead in the right ventricle starts each beat there. On the strip you see a thin vertical line, the pacing spike, with a wide QRS right after it. The beat spreads through muscle from the tip of the right ventricle, so it looks much like LBBB.',
            'This pacemaker watches the atria. It senses each of the patient\'s own P waves, waits a set delay, then paces the ventricle: P wave, spike, wide QRS.',
            'Two things to check: every spike is followed by a QRS (capture), and every paced QRS makes a pulse. A spike with nothing after it is failure to capture.',
          ],
          look: 'Lead II, enlarged: a P wave, a sharp thin spike, then a wide QRS that points downward. On the heart a purple flash at the tip of the right ventricle marks each paced beat.',
          show: { rhythm: 'paced', hr: 72, heart: 'conduction', camera: 'Front', layout: 'monitor', inspect: 'II', speed: 1, focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'A pacing spike appears on time, but no QRS follows it. What is this called?',
            options: ['Failure to pace', 'Failure to sense', 'Failure to capture', 'A normal paced beat'],
            answer: 2,
            explain: 'Capture means the spike made the ventricle fire. A spike with no QRS is failure to capture. Failure to sense is a spike fired at the wrong time because the pacemaker missed the heart\'s own beat; failure to pace is no spike when one is due.',
          },
          roleNote: {
            1: 'An AED pad goes beside a pacemaker bulge under the collarbone, not on top of it. Feel for a real pulse: a paced rhythm on a screen does not prove the heart is pumping.',
            3: 'During pacing in the lab, confirm capture on both the ECG and the pressure waveform, and report loss of capture at once.',
          },
          more: ['paced-rhythm', 'pacemaker-implantation'],
        },
        {
          title: 'PVCs: an early beat from the ventricle',
          text: [
            'A premature ventricular contraction (PVC) is a single beat that starts in the ventricular muscle before the next sinus beat is due. It has three marks: it comes early, it is wide and oddly shaped with its T wave pointing the opposite way, and it has no P wave in front of it.',
            'After a PVC there is a pause. The SA node kept perfect time, but its next signal found the AV node and the ventricles still recovering from the early beat and was lost. The gap from the beat before the PVC to the beat after it equals two normal beats: a compensatory pause.',
            'PVCs are common and often harmless. They matter more when they are frequent, come in runs, appear during a heart attack or land on the T wave of the beat before.',
          ],
          look: 'In lead II every fourth beat arrives early, wide and tall with no P wave before it, and a pause follows. On the heart a purple flash high at the front of the right ventricle marks its start; a red ✕ at the AV node then marks the lost sinus beat.',
          show: { rhythm: 'pvcs', hr: 76, focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'Why is there a pause after each PVC?',
            options: [
              'The PVC reset the SA node, which started its count again',
              'The next sinus signal came on time but found the AV node and ventricles still recovering',
              'The monitor skips the beat after any wide complex',
              'Heart muscle has to rest after an extra beat',
            ],
            answer: 1,
            explain: 'The SA node is not reset by a PVC. Its next P wave comes on schedule but cannot be conducted, so one sinus beat is skipped and the following one arrives exactly on time.',
          },
          more: ['pvcs'],
        },
        {
          title: 'Wide beat or wide rhythm?',
          text: [
            'When you meet a wide QRS, look in front of it. In a bundle branch block every beat is wide, but each one still follows a P wave at a normal PR interval. In a paced rhythm each one follows a spike. A PVC is a single wide beat with no P wave, in the middle of an otherwise normal rhythm.',
            'Three or more wide beats in a row with no P waves in front, faster than 100 a minute, is ventricular tachycardia. That is the next lesson.',
          ],
          look: 'Every beat on this 12-lead is wide, and each one follows a P wave. Compare V1 with I and V6 to name the pattern.',
          show: { rhythm: 'lbbb', hr: 72, heart: false, layout: 'simultaneous' },
          check: {
            kind: 'choice',
            question: 'What does this 12-lead show?',
            options: [
              'Ventricular tachycardia',
              'Sinus rhythm with left bundle branch block',
              'Sinus rhythm with right bundle branch block',
              'Sinus rhythm with PVCs',
            ],
            answer: 1,
            explain: 'V1 is deep and negative, and I and V6 are broad and upright with no late S wave: LBBB. RBBB would show an M shape in V1 and a wide S in I and V6. The rate is normal and every QRS follows a P wave, so this is not a ventricular rhythm.',
          },
          more: ['right-bundle-branch-block', 'left-bundle-branch-block'],
        },
      ],
    },

    // ─── 5 ───────────────────────────────────────────────────────────────
    {
      id: 'ventricular',
      title: 'Ventricular rhythms: VT, torsades, VF and asystole',
      goal: 'Recognize ventricular tachycardia, torsades de pointes, ventricular fibrillation and asystole, and check the patient first.',
      minutes: 7,
      steps: [
        {
          title: 'When the ventricles run the heart',
          text: [
            'A beat that starts in the ventricles skips the heart\'s fast wiring, so it is wide. One such beat is a PVC. Three or more in a row, faster than 100 a minute, is ventricular tachycardia (VT).',
            'The rhythms in this lesson pump badly or not at all. With every one of them the first act is the same: look at the patient and feel for a pulse.',
          ],
          look: 'Lead II shows wide complexes one after another, evenly spaced, with hardly any flat baseline between them.',
          show: { heart: 'external', camera: 'Front', ecg: 'ecg', layout: 'monitor', rhythm: 'vt', hr: 170, focus: 'ecg' },
        },
        {
          title: 'Ventricular tachycardia',
          text: [
            'VT is regular, wide and fast: a QRS of 0.12 seconds or more (often much wider) at more than 100 a minute, and usually far faster. When every complex has the same shape it is called monomorphic. Most often the signal is circling a scar left by an old heart attack.',
            'The atria usually carry on at their own slower pace. P waves that have nothing to do with the QRS complexes prove VT, but they are hard to find.',
            'The working rule: a regular wide tachycardia is VT until proven otherwise, above all in a patient with a past heart attack or heart failure. Mistaking it for SVT is dangerous: verapamil or diltiazem given to a patient in VT can cause collapse.',
          ],
          look: 'The complexes are wide, identical and evenly spaced at about 170 a minute. Beside the heart rate, a small "A" shows the atria beating at their own slower rate.',
          show: { focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'A patient with this rhythm is awake and talking, with a blood pressure of 118/70. What should you assume?',
            options: [
              'Ventricular tachycardia: a good blood pressure does not rule it out',
              'SVT, because the patient is stable',
              'Sinus tachycardia with a bundle branch block',
              'A monitor artifact',
            ],
            answer: 0,
            explain: 'How well the patient tolerates a wide tachycardia says nothing about where it comes from. Most regular wide tachycardias are VT, and a stable patient can become pulseless at any moment: pads on, 12-lead, help on the way.',
          },
          roleNote: {
            5: 'AV dissociation, fusion and capture beats, precordial concordance and a northwest axis favor VT; the Brugada and Vereckei (aVR) algorithms formalize the approach.',
          },
          more: ['monomorphic-vt'],
        },
        {
          title: 'VT: check for a pulse',
          text: [
            'In VT each beat starts in the wrong place and spreads slowly, so the walls squeeze out of step. The fast rate leaves little time to fill, and the atria no longer top up the ventricles on time. Output falls: sometimes a little, sometimes to nothing.',
            'The same strip can belong to a patient who is talking to you or to one in cardiac arrest. The pulse decides. With a pulse and a stable patient there is time for a 12-lead and drugs. With a pulse but shock, chest pain or confusion, the treatment is a synchronized shock (one timed to the QRS). With no pulse it is CPR and defibrillation.',
          ],
          look: 'Slowed to a quarter speed. Each beat starts as a purple flash low in the left ventricle; the bundle branches stay dark. The atria still fire from the SA node, and their signals stop at the red ✕.',
          show: { heart: 'conduction', speed: 0.25, focus: 'heart' },
          check: {
            kind: 'choice',
            question: 'VT is on the monitor. The patient is unresponsive with no pulse. What is this now?',
            options: [
              'Pulseless VT: a cardiac arrest, treated with CPR and defibrillation',
              'Stable VT: get a 12-lead first',
              'Pulseless electrical activity (PEA)',
              'SVT with a bundle branch block',
            ],
            answer: 0,
            explain: 'VT without a pulse is a shockable cardiac arrest and is treated like ventricular fibrillation. PEA is the name for other organized rhythms without a pulse; VT is kept out of that group because a shock can fix it.',
          },
          roleNote: {
            2: 'Unstable with a pulse: synchronized cardioversion per protocol, with sedation if time allows. Stable: 12-lead, pads on, IV access and an antiarrhythmic per protocol. Pulseless: the VF / pulseless VT algorithm.',
            3: 'Call VT out to the operator at once, and look at the arterial waveform to see whether each beat makes a pressure wave. Have the defibrillator and pads ready.',
            4: 'Check pulse, perfusion and alertness first. Keep pads on, give antiarrhythmics as ordered, and assist with synchronized cardioversion; sedation only on the practitioner\'s order.',
          },
          more: ['monomorphic-vt', 'cardioversion', 'vt-storm'],
        },
        {
          title: 'Torsades de pointes',
          text: [
            'When the QRS changes shape from beat to beat, VT is called polymorphic. Torsades de pointes ("twisting of the points") is the polymorphic VT that arises from a long QT interval. Its complexes grow, shrink and flip over, as if twisting around the baseline, at about 160–250 a minute.',
            'The QT interval, from the start of the QRS to the end of the T wave, is the time the ventricles take to fire and reset. It is lengthened by many drugs, by low potassium or magnesium, by very slow heart rates and by inherited conditions. A corrected QT (QTc, the QT adjusted for heart rate) above 500 ms is high risk.',
            'Torsades often stops on its own after a few seconds, causing a faint or what looks like a seizure, but it can turn into ventricular fibrillation. An episode that does not stop is shocked at once with an unsynchronized shock (defibrillation), even if there is still a pulse. Magnesium given into a vein, and fixing the cause, keep it from coming back.',
          ],
          look: 'The complexes swell and shrink every couple of seconds and tip from pointing up to pointing down. No two are alike, and there is no flat baseline.',
          show: { rhythm: 'torsades', heart: 'external', camera: 'Front', speed: 1, focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'Torsades has stopped and the patient is back in sinus rhythm. What must you look for on the ECG?',
            options: ['A tall R wave in V1', 'A short PR interval', 'A wide P wave', 'A long QT interval'],
            answer: 3,
            explain: 'Torsades grows out of a long QT, and it will come back until the QT is shortened: stop the drug, correct potassium and magnesium, speed up a slow heart. Polymorphic VT with a normal QT is a different problem, usually a heart short of blood.',
          },
          roleNote: {
            2: 'Sustained torsades gets an unsynchronized shock at once, pulse or no pulse (2025 AHA): the defibrillator cannot lock onto a QRS that keeps changing. Give magnesium per protocol, avoid amiodarone and procainamide (both lengthen the QT) and capture a 12-lead between episodes.',
            3: 'Call polymorphic VT out immediately, report long pauses and frequent PVCs, and have the defibrillator ready.',
            4: 'Give magnesium and potassium as ordered or per ACLS protocol, flag QT-prolonging drugs for the physician, keep pads on and watch the QT on telemetry.',
          },
          more: ['torsades-de-pointes', 'magnesium-sulfate'],
        },
        {
          title: 'Ventricular fibrillation',
          text: [
            'In ventricular fibrillation (VF) there is no beat at all. Many waves of electricity wander through the ventricles at once. The strip is a chaotic wavy line with no P waves, no QRS complexes and nothing that repeats.',
            'The ventricles quiver and pump nothing. The patient has no pulse and loses consciousness within seconds: this is cardiac arrest. Large waves (coarse VF) shrink over minutes to small ones (fine VF) and then to a flat line as the muscle runs out of energy.',
            'Only a shock ends VF. CPR keeps the brain and heart supplied until the shock, and makes the shock more likely to work.',
          ],
          look: 'The tracing has no repeating shape and the heart rate reads ---. On the heart the ventricles shiver instead of squeezing, and the Cardiac cycle box reads "Fibrillation — no effective contraction".',
          show: { rhythm: 'vf', focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'A line like this appears on the monitor of a patient who is awake and talking to you. What is it?',
            options: [
              'Fine VF',
              'Artifact: check the patient and the electrodes',
              'Coarse VF: shock at once',
              'Asystole',
            ],
            answer: 1,
            explain: 'A patient in VF is never awake. Movement, shivering or a loose electrode can draw a line that looks like VF, so the patient is always checked before the monitor is believed.',
          },
          more: ['ventricular-fibrillation', 'defibrillation'],
        },
        {
          title: 'Asystole',
          text: [
            'Asystole is the absence of electrical activity: a flat or nearly flat line. Nothing fires and nothing squeezes. It is where untreated VF ends, and where any long cardiac arrest ends.',
            'Before you accept a flat line, check the patient, the electrodes and cables, the size (gain) setting, and a second lead. Fine VF or a loose lead can look flat in one lead.',
            'A shock does not help asystole: there is no electrical activity to reset. Care is CPR, epinephrine and a search for a cause that can be reversed.',
          ],
          look: 'A flat line with only a faint wander in every lead. The heart is still, and the Cardiac cycle box reads "No electrical or mechanical activity".',
          show: { rhythm: 'asystole', focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'A flat line appears during a resuscitation. What do you check before calling it asystole?',
            options: [
              'Whether a shock changes it',
              'Nothing: a flat line is always asystole',
              'The blood pressure cuff',
              'The patient, the leads, the gain and a second lead, while CPR continues',
            ],
            answer: 3,
            explain: 'A disconnected lead, a low gain setting or fine VF seen in one lead can all draw a flat line. Checking takes seconds and CPR does not stop for it. Shocking a flat line "in case" is not recommended.',
          },
          more: ['defibrillation'],
        },
        {
          title: 'Four rhythms, one first step',
          text: [
            'VT is regular, wide and fast, and may or may not make a pulse. Torsades is a twisting VT born of a long QT. VF is chaos with no pulse. Asystole is a flat line with no pulse.',
            'On the screen they look very different. At the bedside they start the same way: is the patient responsive, breathing and with a pulse? The answer, not the strip, sets how fast you move.',
          ],
          look: 'VT is on the strip again. On the heart the ventricles still squeeze with each beat, but less fully than in sinus rhythm.',
          show: { rhythm: 'vt', hr: 170, focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'Which of these rhythms can still have a pulse?',
            options: ['Ventricular tachycardia', 'Ventricular fibrillation', 'Asystole', 'None of them'],
            answer: 0,
            explain: 'VT can pump enough to make a pulse, at least for a while. VF and asystole never do: with either on the monitor and no response from the patient, CPR starts at once.',
          },
          more: ['monomorphic-vt', 'ventricular-fibrillation', 'torsades-de-pointes'],
        },
      ],
    },

    // ─── 6 ───────────────────────────────────────────────────────────────
    {
      id: 'pulseless',
      title: 'No pulse: the four arrest rhythms',
      goal: 'Sort the four cardiac arrest rhythms into shockable and non-shockable, and say what comes first for each.',
      minutes: 7,
      steps: [
        {
          title: 'Cardiac arrest is found at the patient',
          text: [
            'Cardiac arrest means the heart is not pumping: the patient does not respond, is not breathing normally (gasping does not count as breathing) and has no pulse. You find it by checking the patient, not by reading a monitor.',
            'CPR starts at once, whatever the rhythm. The monitor then answers one question that changes the treatment: can a shock fix this rhythm? Four rhythms can be on the screen in cardiac arrest. Two are shockable and two are not.',
          ],
          look: 'Lead II shows one of the four: a chaotic line with no complexes. The heart rate reads ---.',
          show: { heart: 'external', camera: 'Front', ecg: 'ecg', layout: 'monitor', rhythm: 'vf', focus: 'ecg' },
        },
        {
          title: 'Shockable: ventricular fibrillation',
          text: [
            'In ventricular fibrillation (VF) the ventricles are full of disorganized electricity and only quiver. A defibrillator sends one large shock through the heart that stops all of it at the same instant, so that the heart\'s own pacemaker can start again.',
            'The sooner the shock, the better it works; every minute of delay lowers the chance of survival. So the order is: compressions until the defibrillator is charged, the shock, then compressions again right away.',
          ],
          look: 'On the heart the ventricles shiver instead of squeezing, and the Cardiac cycle box reads "Fibrillation — no effective contraction". The strip is the same as before: no P waves, no QRS complexes, nothing that repeats.',
          show: { focus: 'heart' },
          check: {
            kind: 'choice',
            question: 'VF is on the monitor and the defibrillator is charging. What should the team be doing?',
            options: [
              'Chest compressions, right up to the shock',
              'Checking for a pulse',
              'Standing clear and waiting for the charge',
              'Giving breaths only',
            ],
            answer: 0,
            explain: 'Compressions keep blood moving to the brain and the heart and make the shock more likely to work. Every pause costs perfusion, so hands come off the chest only for the shock itself.',
          },
          more: ['ventricular-fibrillation', 'defibrillation'],
        },
        {
          title: 'Shockable: pulseless VT',
          text: [
            'Ventricular tachycardia can be so fast, or squeeze so poorly, that it makes no pulse. On the strip it looks like any VT: wide, regular and fast. The difference is at the patient.',
            'Pulseless VT is treated exactly like VF: CPR and defibrillation. The shock is unsynchronized, delivered the moment the button is pressed. A synchronized shock, timed to the QRS, is for unstable regular VT that still has a pulse.',
          ],
          look: 'On the heart a glow still sweeps the ventricles with every beat, but they hardly move. The Cardiac cycle box goes on naming the phases of a beat: it follows the electricity, not the pulse. On the strip: wide, regular complexes at about 200 a minute.',
          show: { rhythm: 'pvt', hr: 200, focus: 'heart' },
          check: {
            kind: 'choice',
            question: 'What makes this "pulseless VT" rather than "VT"?',
            options: [
              'The rate: it is over 180 a minute',
              'The patient: no response and no pulse',
              'The QRS: it is wider than in other VT',
              'The monitor: it sounds an alarm',
            ],
            answer: 1,
            explain: 'The strip cannot tell you whether a rhythm makes a pulse. The same VT can be found in a patient who is talking or in one who is in cardiac arrest, so the name comes from the pulse check.',
          },
          more: ['monomorphic-vt', 'defibrillation'],
        },
        {
          title: 'Not shockable: asystole',
          text: [
            'Asystole is a flat line: no electrical activity and no squeeze. A shock works by stopping disorganized electricity, and here there is none to stop, so defibrillation does not help.',
            'What comes first is CPR without pauses, epinephrine as soon as it can be given, and a search for a cause that can be reversed. Confirm the flat line in a second lead and check the cables and the gain, so that fine VF is not missed.',
          ],
          look: 'A flat line in every lead. The heart does not move, and the Cardiac cycle box reads "No electrical or mechanical activity".',
          show: { rhythm: 'asystole', focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'Why is asystole not shocked?',
            options: [
              'Asystole usually corrects itself',
              'The energy needed is more than a defibrillator can give',
              'A shock stops chaotic electrical activity, and here there is none',
              'A shock is kept for after three rounds of CPR',
            ],
            answer: 2,
            explain: 'Defibrillation does not start a heart; it stops a chaotic one so the normal pacemaker can take over. With no electrical activity there is nothing for it to act on, and the pause for a shock only takes time away from CPR.',
          },
        },
        {
          title: 'Not shockable: PEA',
          text: [
            'Pulseless electrical activity (PEA) is an organized rhythm on the monitor with no pulse in the patient. The electricity is there; the pumping is not. The strip can look like sinus rhythm, a slow wide rhythm or almost anything except VF, VT or a flat line.',
            'PEA cannot be read from a strip. It is found with your fingers on a pulse. A shock does not help, because the electricity is already organized.',
            'The problem lies elsewhere: too little blood to pump, a blockage such as a clot in the lungs or fluid squeezing the heart, or a heart muscle starved of oxygen or poisoned. What comes first is CPR, epinephrine and a hunt for that cause.',
          ],
          look: 'On the heart a glow still spreads with each beat, but the ventricles barely move: electricity without a pump. The Cardiac cycle box follows the electricity, so it still names each phase. On the strip: P waves and wide QRS complexes, slow and steady.',
          show: { rhythm: 'pea', hr: 48, focus: 'heart' },
          check: {
            kind: 'choice',
            question: 'The monitor shows this slow, organized rhythm. The patient is unresponsive with no pulse. What is it, and what comes first?',
            options: [
              'PEA: start CPR',
              'Sinus bradycardia: speed it up with a drug',
              'Complete heart block: pace it',
              'VF: shock it',
            ],
            answer: 0,
            explain: 'An organized rhythm without a pulse is PEA, and the first treatment is CPR. Speeding up or pacing the rhythm treats the monitor: the electricity is not what has failed.',
          },
          more: ['epinephrine'],
        },
        {
          title: 'Sort the four',
          text: [
            'Shockable: ventricular fibrillation and pulseless VT. First CPR, then a shock as early as possible, then CPR again.',
            'Not shockable: asystole and PEA. First CPR, then epinephrine and a search for the cause. No shock.',
            'The rhythm is checked again every two minutes, because it can move from one group to the other: VF can decay into asystole, and PEA can break down into VF.',
          ],
          look: 'VF is back on the screen: a rhythm a shock can fix.',
          show: { rhythm: 'vf', focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'Which pair of rhythms is shockable?',
            options: ['Pulseless VT and PEA', 'Asystole and PEA', 'VF and asystole', 'VF and pulseless VT'],
            answer: 3,
            explain: 'A shock helps only when the ventricles are full of fast, disorganized or circling electricity: VF and pulseless VT. Asystole has no electricity to stop, and PEA already has an organized rhythm.',
          },
          roleNote: {
            1: 'You do not read the rhythm; the AED does. "Shock advised" means it has found VF or a fast VT. "No shock advised" does not mean the patient has a pulse: carry on with CPR and follow the prompts.',
          },
          more: ['defibrillation', 'ventricular-fibrillation'],
        },
        {
          title: 'After the shock: rhythm, then pulse',
          text: [
            'A shock can leave VF, a flat line or an organized rhythm. An organized rhythm is good news only if it comes with a pulse.',
            'So a rhythm check during a resuscitation is two questions. What is the rhythm? And if it is organized: is there a pulse? An organized rhythm with a pulse is a return of spontaneous circulation (ROSC). The same rhythm without one is PEA, and CPR goes on.',
          ],
          look: 'A regular narrow rhythm at 70 a minute, with P waves. From the strip alone you cannot tell whether this heart is pumping.',
          show: { rhythm: 'normal-sinus', hr: 70, heart: false },
          check: {
            kind: 'choice',
            question: 'Two minutes after a shock, the rhythm check shows this regular rhythm at 70 a minute. What next?',
            options: [
              'Stop CPR: the shock has worked',
              'Wait and watch the monitor for a minute',
              'Shock again to make sure',
              'Check for a pulse: an organized rhythm may or may not be pumping',
            ],
            answer: 3,
            explain: 'Only a pulse, or another sign of circulation such as a pressure waveform, shows that the heart is pumping. With a pulse, care moves on to the period after the arrest. Without one this is PEA, and compressions restart at once.',
          },
          roleNote: {
            3: 'In the cath lab the arterial pressure line answers the pulse question at a glance: say out loud whether the rhythm on the ECG is making a pressure wave.',
          },
          more: ['normal-sinus-rhythm'],
        },
      ],
    },

    // ─── 7 ───────────────────────────────────────────────────────────────
    {
      id: 'mixed-practice',
      title: 'Mixed practice: name the rhythm',
      goal: 'Name eleven rhythms from the strip alone, and state the features that decide each one.',
      minutes: 12,
      steps: [
        {
          title: 'How to work through a strip',
          text: [
            'Eleven strips follow, in no particular order. For each one, go through the five questions before you look at the choices: rate, regular or not, P waves, what follows each P wave, and the width of the QRS.',
            'The app keeps its own reading of the rhythm hidden until you answer. Leads II, V1 and V5 are shown for each strip; use whichever makes the P waves clearest.',
            'One number can still help you: with some rhythms a small "A" appears beside the heart rate. It is the app\'s count of the atrial rate. Find the P waves or flutter waves yourself before you read it.',
          ],
          look: 'This first strip is normal sinus rhythm, for comparison: a P wave, a narrow QRS and a T wave, evenly spaced at 72 a minute.',
          show: { heart: false, ecg: 'ecg', layout: 'monitor', rhythm: 'normal-sinus', hr: 72 },
        },
        {
          title: 'Strip 1',
          text: ['A 74-year-old woman feels her heart "jumping about". She is alert, with a blood pressure of 132/78.'],
          look: 'Measure several gaps between R waves in lead II, then search the baseline for P waves.',
          show: { rhythm: 'atrial-fibrillation', hr: 90 },
          check: {
            kind: 'choice',
            question: 'Strip 1: what is this rhythm?',
            options: ['Sinus arrhythmia', 'Atrial flutter with 4:1 conduction', 'Atrial fibrillation', 'Second-degree AV block, Mobitz I'],
            answer: 2,
            explain: 'The gaps between beats change with no pattern and there are no P waves, only a fine wobbling baseline: atrial fibrillation. Sinus arrhythmia has a P wave before every beat; flutter is regular with a sawtooth; Wenckebach has P waves and beats in repeating groups.',
          },
          more: ['atrial-fibrillation'],
        },
        {
          title: 'Strip 2',
          text: ['A 58-year-old man had an inferior heart attack yesterday. He feels well; his nurse notices an uneven rhythm on the monitor.'],
          look: 'Find every P wave in lead II. Follow the PR interval from beat to beat, and look for a P wave with no QRS after it.',
          show: { rhythm: 'mobitz-i', hr: 80 },
          check: {
            kind: 'choice',
            question: 'Strip 2: name the rhythm.',
            options: [
              'Sinus rhythm with PVCs',
              'Atrial fibrillation',
              'Second-degree AV block, Mobitz II',
              'Second-degree AV block, Mobitz I (Wenckebach)',
            ],
            answer: 3,
            explain: 'The PR interval lengthens beat by beat until a P wave is not conducted, then the cycle restarts with a short PR. The beats come in groups, so the rhythm is irregular with a pattern, unlike atrial fibrillation.',
          },
          more: ['mobitz-type-i'],
        },
        {
          title: 'Strip 3',
          text: ['A 66-year-old man with an old heart attack feels faint. He is pale and sweating, but awake.'],
          look: 'Judge the width of the QRS and the spacing of the beats. Is there a P wave in front of each complex?',
          show: { rhythm: 'vt', hr: 170 },
          check: {
            kind: 'choice',
            question: 'Strip 3: which rhythm is this?',
            options: ['Ventricular fibrillation', 'Ventricular tachycardia', 'Sinus tachycardia', 'SVT (AVNRT)'],
            answer: 1,
            explain: 'Wide, regular and fast, with no P wave leading each complex: ventricular tachycardia until proven otherwise, all the more with an old heart attack. SVT and sinus tachycardia are narrow; VF has no complexes at all. He has a pulse, but he is faint, pale and sweating: this is unstable VT, and it calls for a synchronized shock.',
          },
          more: ['monomorphic-vt'],
        },
        {
          title: 'Strip 4',
          text: ['A 70-year-old woman with lung disease has palpitations. Her heart rate has sat at exactly 150 a minute for an hour, whatever is done.'],
          look: 'The QRS is narrow and regular. Study the baseline between the beats in lead II: is it ever flat?',
          show: { rhythm: 'atrial-flutter', hr: 150 },
          check: {
            kind: 'choice',
            question: 'Strip 4: what is the rhythm?',
            options: ['Atrial flutter with 2:1 conduction', 'Sinus tachycardia', 'Atrial fibrillation', 'SVT (AVNRT)'],
            answer: 0,
            explain: 'A narrow, regular tachycardia fixed at 150 a minute with a sawtooth baseline is atrial flutter with 2:1 conduction. Sinus tachycardia drifts with the patient\'s condition and has one clear P wave per beat; SVT has nothing between the beats; AF is irregular.',
          },
          more: ['atrial-flutter'],
        },
        {
          title: 'Strip 5',
          text: ['An 81-year-old man fainted at home. His pulse is 36 a minute and his blood pressure is 84/50.'],
          look: 'Mark the P waves in lead II, then the QRS complexes. Does each keep a steady pace? Is the PR interval ever the same twice?',
          show: { rhythm: 'third-degree-avb', hr: 36 },
          check: {
            kind: 'choice',
            question: 'Strip 5: name this rhythm.',
            options: [
              'Sinus bradycardia',
              'Second-degree AV block, Mobitz II',
              'Third-degree (complete) AV block',
              'First-degree AV block',
            ],
            answer: 2,
            explain: 'P waves at a steady faster rate, wide QRS complexes at a steady slow rate, and no fixed relationship between them: complete heart block with a ventricular escape rhythm. In sinus bradycardia and in first- or second-degree block, at least some QRS complexes follow a P wave at a constant PR.',
          },
          more: ['third-degree-av-block'],
        },
        {
          title: 'Strip 6',
          text: ['A 34-year-old woman has a cough and a fever of 39.4 °C (103 °F). Her blood pressure is 104/62.'],
          look: 'Look in front of each QRS in lead II, in the short gap after the T wave of the beat before.',
          show: { rhythm: 'sinus-tachycardia', hr: 115 },
          check: {
            kind: 'choice',
            question: 'Strip 6: which rhythm do you see?',
            options: ['Sinus tachycardia', 'Atrial flutter with 2:1 conduction', 'Atrial fibrillation', 'SVT (AVNRT)'],
            answer: 0,
            explain: 'There is an upright P wave before every QRS at a constant PR, at a rate that fits a patient with a fever: sinus tachycardia. The treatment is for the infection, not the rate. SVT has no P wave in front; flutter shows a sawtooth at about 150.',
          },
          more: ['sinus-tachycardia'],
        },
        {
          title: 'Strip 7',
          text: ['A 45-year-old man is having a routine check before knee surgery. He says his heart "skips a beat" many times a minute.'],
          look: 'Most beats look alike. Find the one that does not: is it early or late, narrow or wide, and is there a P wave in front of it?',
          show: { rhythm: 'pvcs', hr: 76 },
          check: {
            kind: 'choice',
            question: 'Strip 7: what does it show?',
            options: [
              'Second-degree AV block, Mobitz II',
              'Atrial fibrillation',
              'Sinus rhythm with PVCs',
              'Ventricular tachycardia',
            ],
            answer: 2,
            blind: true,
            explain: 'Sinus rhythm with a single early, wide beat that has no P wave in front and a pause after it: a PVC, here every fourth beat. A dropped beat in Mobitz II leaves a P wave standing alone with no QRS at all. One PVC at a time is not VT.',
          },
          more: ['pvcs'],
        },
        {
          title: 'Strip 8',
          text: ['A 77-year-old woman has had two dizzy spells today. Her pulse is slow and uneven.'],
          look: 'Find every P wave in lead II and measure each PR interval. What happens right before, and right after, the missing QRS?',
          show: { rhythm: 'mobitz-ii', hr: 80 },
          check: {
            kind: 'choice',
            question: 'Strip 8: name the block.',
            options: [
              'Second-degree AV block, Mobitz I (Wenckebach)',
              'Second-degree AV block, Mobitz II',
              'Sinus rhythm with PVCs',
              'Third-degree (complete) AV block',
            ],
            answer: 1,
            explain: 'The PR interval is the same on every conducted beat, then a P wave is not followed by a QRS: Mobitz II. The QRS is also wide, a sign of disease below the AV node. This rhythm can become complete heart block without warning: pacing pads on.',
          },
          more: ['mobitz-type-ii'],
        },
        {
          title: 'Strip 9',
          text: ['A 72-year-old woman who takes digoxin and a beta-blocker feels tired. Her pulse is 48 a minute and regular, and her blood pressure is 108/64.'],
          look: 'Check the rate, the spacing and the QRS width in lead II. Then look right in front of each QRS: is there an upright P wave?',
          show: { rhythm: 'junctional', hr: 48 },
          check: {
            kind: 'choice',
            question: 'Strip 9: what is driving this heart?',
            options: [
              'Sinus bradycardia',
              'A junctional escape rhythm',
              'Third-degree (complete) AV block',
              'Second-degree AV block, Mobitz II',
            ],
            answer: 1,
            explain: 'Slow, regular and narrow, with no upright P wave before the QRS, only a small upside-down one right in front of it: a junctional escape rhythm. Sinus bradycardia has an upright P wave at a normal PR. In the AV blocks, upright P waves march on at the faster sinus rate. Ask why the SA node is slow: here, look at her drugs.',
          },
          more: ['junctional-rhythm'],
        },
        {
          title: 'Strip 10',
          text: ['A 29-year-old woman\'s heart began racing suddenly ten minutes ago while she sat at her desk. Her blood pressure is 110/70.'],
          look: 'Check the QRS width and the spacing. Then search between the T wave and the next QRS for a P wave.',
          show: { rhythm: 'avnrt', hr: 180 },
          check: {
            kind: 'choice',
            question: 'Strip 10: which rhythm is on the strip?',
            options: [
              'Ventricular tachycardia',
              'SVT (AVNRT)',
              'Sinus tachycardia',
              'Atrial fibrillation with a rapid ventricular response',
            ],
            answer: 1,
            explain: 'Narrow, perfectly regular, about 180 a minute, sudden onset and no P wave before the QRS: SVT, most likely AVNRT. Sinus tachycardia this fast in a resting adult would be unusual and would show P waves; VT is wide; AF is irregular.',
          },
          more: ['avnrt', 'unstable-svt'],
        },
        {
          title: 'Strip 11',
          text: ['A 61-year-old man collapses in a waiting room. He does not respond and is not breathing normally.'],
          look: 'Look for anything that repeats: a P wave, a QRS, a T wave.',
          show: { rhythm: 'vf' },
          check: {
            kind: 'choice',
            question: 'Strip 11: what is this rhythm, and what comes first?',
            options: [
              'Ventricular fibrillation: CPR and a shock',
              'Torsades de pointes: magnesium',
              'Asystole: CPR, no shock',
              'Atrial fibrillation: slow the rate',
            ],
            answer: 0,
            explain: 'A chaotic line with no P waves, QRS complexes or T waves, in a patient with no pulse: ventricular fibrillation. CPR now, and a shock as soon as the defibrillator is ready. Asystole is flat, torsades has wide complexes that twist in a pattern, and AF has normal QRS complexes.',
          },
          roleNote: {
            1: 'This is the patient you treat without reading any strip: no response and no normal breathing mean CPR now and the AED as soon as it arrives.',
          },
          more: ['ventricular-fibrillation', 'defibrillation'],
        },
      ],
    },
  ],
};
