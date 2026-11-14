import type { Course } from '@/types/course';

/**
 * Course: finding a heart attack on the 12-lead — what ST elevation means and the STEMI criteria, the anterior,
 * inferior, lateral and posterior patterns with the artery behind each, the look-alikes, what reperfusion looks
 * like, and a set of mixed tracings to localize.
 * Criteria: Fourth Universal Definition of MI (2018). Time targets: 2025 ACC/AHA/ACEP/NAEMSP/SCAI ACS guideline.
 * Every "look" hint describes what the app really draws for that rhythm profile (see lib/ecg/profiles.ts and
 * lib/anatomy/landmarks.ts → PROFILE_TERRITORY). Educational content only.
 */
export const STEMI: Course = {
  id: 'stemi',
  title: 'Finding a heart attack on the 12-lead',
  summary: 'How a blocked coronary artery shows on the 12-lead: what ST elevation means, which leads point to which wall and artery, the patterns that imitate or hide a STEMI, and what the tracing shows once the artery is open.',
  roles: [2, 3, 4, 5, 6, 7],
  level: 'core',
  lessons: [
    // ─── 1 ───────────────────────────────────────────────────────────────
    {
      id: 'injury-on-the-ecg',
      title: 'What a blocked artery does to the ECG',
      goal: 'Explain what ST elevation means, apply the STEMI criteria to a 12-lead and say why every minute counts.',
      minutes: 10,
      steps: [
        {
          title: 'A blocked artery, a wall in trouble',
          text: [
            'A heart attack (myocardial infarction, MI) starts when a coronary artery suddenly blocks. Most often a fatty plaque in the artery wall cracks open and a blood clot forms on it. The muscle that artery feeds is cut off from its blood supply.',
            'Each artery feeds its own part of the heart, so a blocked artery puts one wall in trouble. That wall changes the ECG in the leads that face it. Read the leads and you know which wall, which artery, and how urgent it is.',
          ],
          look: 'The heart is painted by artery: green for the left anterior descending (LAD), blue for the circumflex (LCx), orange for the right coronary artery (RCA). The tracing is normal: every ST segment is level with the baseline.',
          show: { heart: 'territories', camera: 'Front', flow: false, ecg: 'ecg', layout: 'simultaneous', rhythm: 'normal-sinus', focus: 'heart' },
          check: {
            kind: 'tap',
            question: 'Tap the artery that feeds the front wall of the left ventricle (any of its name tags).',
            targets: ['lad-proximal', 'lad-mid', 'lad-distal', 'd1'],
            explain: 'The left anterior descending artery (LAD) runs down the front of the heart. A block there changes V1 to V4, the leads that sit over the front of the chest. Each artery has its own wall and its own group of leads.',
          },
        },
        {
          title: 'Ischemia, injury, infarction',
          text: [
            'Three words describe muscle that is short of blood. Ischemia means the muscle is starved of oxygen but alive, and it recovers if flow returns. Injury means the starvation is severe enough to disturb the muscle\'s electrical charge, and infarction means the muscle has died.',
            'Each leaves its own mark. Ischemia changes the T wave or pushes the ST segment down, and injury through the full thickness of a wall lifts the ST segment. Dead muscle makes no electricity, so the leads facing it lose their R wave and draw a deep Q wave.',
            'ST elevation is the one that starts the clock. It means an artery is probably completely blocked right now, and that there is still muscle to save.',
          ],
          look: 'The heart is cut open and the muscle of the left ventricle\'s wall (the myocardium) is ringed. The arteries run on the outer surface, so the inner layer, next to the cavity, is the last to be fed.',
          show: { heart: 'sectioned', structure: 'myocardium', focus: 'heart' },
          check: {
            kind: 'choice',
            question: 'Which finding says that a wall is being starved through its full thickness right now, and can still be saved?',
            options: ['ST elevation', 'A deep Q wave', 'ST depression', 'A wide QRS'],
            answer: 0,
            explain: 'ST elevation marks acute injury through the whole wall, usually from a completely blocked artery. A deep Q wave marks muscle that has already died. ST depression points to ischemia limited to the inner layer of the wall.',
          },
        },
        {
          title: 'The injured wall speaks',
          text: [
            'In healthy muscle every cell sits at the same electrical level during the ST segment, so no current flows and the segment is flat. Injured cells cannot reach or hold that level. For as long as the injury lasts, a current flows between the injured wall and the healthy muscle around it.',
            'That current has a direction: it points toward the injured wall. A lead that faces the wall records it as an ST segment lifted off the baseline. A lead that looks from the opposite side records the same current as an ST segment pushed down.',
          ],
          look: 'The heart is slowed to a quarter of real speed and seen from the patient\'s left. A yellow arrow shows its electrical force from instant to instant. In a healthy heart the arrow vanishes after each QRS. Watch what it does here.',
          show: { heart: 'external', camera: 'Left', vector: true, speed: 0.25, rhythm: 'anterior-stemi', focus: 'heart' },
          check: {
            kind: 'choice',
            question: 'After each QRS, during the ST segment, what does the yellow arrow do on this heart?',
            options: [
              'It stays, pointing out through the front wall',
              'It disappears until the T wave, as in a healthy heart',
              'It points up toward the right shoulder',
              'It points straight back toward the spine',
            ],
            answer: 0,
            explain: 'The arrow holds steady toward the front of the chest, where the injured wall pulses purple. That is the injury current. The leads over the front of the heart see it coming toward them and draw ST elevation; leads on the far side would draw ST depression.',
          },
        },
        {
          title: 'Measuring ST elevation',
          text: [
            'The ST segment runs from the end of the QRS to the start of the T wave. The point where the QRS ends is called the J point. Normally the J point sits level with the flat line before the QRS.',
            'ST elevation is measured at the J point: how far it sits above that line, in millimeters. At the standard setting one small box is 1 mm high.',
          ],
          look: 'Lead V3 is enlarged. The ST segment leaves the QRS about 3 mm above the baseline and climbs into a tall T wave. The dashed line marks the J point, where the ST segment is measured, and its label gives the height.',
          show: { heart: 'territories', camera: 'Front', vector: false, speed: 1, inspect: 'V3', focus: 'ecg' },
        },
        {
          title: 'How much is enough: the STEMI criteria',
          text: [
            'A little ST elevation can be normal, above all in V2 and V3. So the definition of a STEMI (ST-elevation myocardial infarction) sets a minimum: new ST elevation at the J point of 1 mm or more in two contiguous leads, meaning two leads that face the same wall.',
            'V2 and V3 have higher limits, because healthy people often show some elevation there: 2 mm or more in men aged 40 and over, 2.5 mm or more in men under 40, and 1.5 mm or more in women of any age.',
            'The numbers are a guide for a patient with symptoms. They do not replace the whole picture: some blocked arteries never reach them, and some harmless patterns exceed them. Both come later in this course.',
          ],
          look: 'All twelve leads again. In V2 and V3, compare the start of the ST segment with the flat line before the QRS. On the grid one large box is 5 mm high.',
          show: { focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'A 35-year-old man with chest pain has 2 mm of ST elevation in V2 and V3 and none anywhere else. Does that meet the STEMI criteria?',
            options: [
              'No: in V2 and V3 a man under 40 needs 2.5 mm or more',
              'Yes: 2 mm is enough in V2 and V3 for any man',
              'Yes: 1 mm in two contiguous leads is always enough',
              'No: V2 and V3 are not contiguous leads',
            ],
            answer: 0,
            explain: 'In V2 and V3 the limit is 2.5 mm for men under 40, 2 mm for men of 40 and over and 1.5 mm for women. Everywhere else it is 1 mm. V2 and V3 sit side by side and are contiguous. He still has chest pain, so the 12-lead is repeated: criteria not met does not mean no heart attack.',
          },
        },
        {
          title: 'Two leads that agree',
          text: [
            'Contiguous leads face the same wall. The groups are inferior (II, III, aVF), lateral (I, aVL, V5, V6), and septal and anterior (V1 to V4). The chest leads also count in order round the chest: each one is contiguous with its neighbors.',
            'Asking for two contiguous leads guards against one odd lead: a loose electrode, a misplaced cable, a normal variant. When two cameras pointed at the same wall both show ST elevation, the wall is in trouble.',
          ],
          look: 'Go across the chest leads from V1 to V6 and decide for each one: is the ST segment above the baseline?',
          show: { focus: 'ecg' },
          check: {
            kind: 'lead',
            question: 'Tap a chest lead with clear ST elevation on this tracing.',
            targets: ['V3', 'V2', 'V4', 'V1', 'V5'],
            explain: 'V1 to V4 are clearly raised, and V5 a little less: a run of neighboring leads that face the septum and the front wall. V6 is almost level. That is ST elevation in far more than two contiguous leads: an anterior STEMI.',
          },
        },
        {
          title: 'Reciprocal change: the view from the other side',
          text: [
            'A lead that faces the injured wall draws ST elevation. A lead that looks at the same wall from the opposite side draws the mirror image: ST depression. This is called a reciprocal change.',
            'Here the inferior wall, the underside of the heart, is injured. II, III and aVF face it and show ST elevation. aVL looks down from the left shoulder, nearly opposite lead III.',
            'Reciprocal change matters because the look-alikes of a STEMI rarely produce it. ST elevation in one group of leads with ST depression in the opposite group makes a blocked artery far more likely.',
          ],
          look: 'Lead III is outlined, and on the heart its line of sight comes up from below toward the underside. Now find a limb lead whose ST segment is pushed down instead.',
          show: { rhythm: 'inferior-stemi', lead: 'III', camera: 'Front', focus: 'ecg' },
          check: {
            kind: 'lead',
            question: 'Tap a limb lead that shows the reciprocal ST depression.',
            targets: ['aVL', 'I'],
            explain: 'aVL shows it most clearly: ST depression with an upside-down T wave. Lead I, which looks from the same side, shows a smaller version. III and aVL face nearly opposite ways, so what lifts one pushes the other down.',
          },
        },
        {
          title: 'The first minutes, and the hours after',
          text: [
            'ST elevation is not the first sign. In the first minutes after an artery blocks, the T waves over the affected wall grow tall and broad. These are hyperacute T waves, and at that moment the ST segments may still be nearly level.',
            'Then the picture changes in a set order: ST elevation within minutes to hours, then a shrinking R wave and new Q waves over hours as muscle dies. Over hours to days the T waves turn upside down and the ST segments drift back to the baseline. The Q waves usually stay for life.',
            'One tracing is a single frame of that film. If the first 12-lead does not give the answer and the symptoms continue, it is repeated at short intervals, and each one is compared with the one before.',
          ],
          look: 'Lead V2 of the anterior STEMI is enlarged. Its T wave is tall and broad at the base: hyperacute. The QRS is one deep downward wave: the small R wave that V2 normally starts with has gone, the first step toward a Q wave.',
          show: { rhythm: 'anterior-stemi', inspect: 'V2', focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'Ten minutes after crushing chest pain began, a 12-lead shows tall, broad T waves in V2 to V4 and no ST elevation. The pain continues. What happens next with the ECG?',
            options: [
              'A physician sees it now, and it is repeated within minutes',
              'Nothing more is needed: without ST elevation this is not a heart attack',
              'It is repeated tomorrow, when Q waves will confirm the diagnosis',
              'It is recorded again at double paper speed to stretch out the T waves',
            ],
            answer: 0,
            explain: 'Hyperacute T waves can be the only sign in the first minutes of a blocked artery. With ongoing pain they count as a STEMI equivalent (2022 ACC chest pain pathway): the tracing goes to a physician at once, and repeat 12-leads catch the ST elevation as it develops. Q waves take hours and mean muscle has already been lost.',
          },
          roleNote: {
            1: 'You do not interpret the tracing. If the pain continues, a repeat 12-lead acquired and transmitted per protocol lets the receiving team see the change.',
            2: 'Tall, broad T waves with ongoing pain are reported as a possible early occlusion. Repeat the 12-lead during transport and transmit each one.',
          },
        },
        {
          title: 'Why minutes matter',
          text: [
            'The coronary arteries run on the outside of the heart, so the inner layer of the wall is the last to be fed and the first to die. From there the damage moves outward like a wave. In the classic animal experiments, muscle death had begun in the inner layer within 40 minutes and had crossed most of the wall by 6 hours.',
            'Whatever is still alive when the artery is opened is saved. That is the whole reason for speed: time is muscle. Less dead muscle means a stronger pump, fewer dangerous rhythms and a better chance of survival.',
            'So the system is built around the clock. The first 12-lead is to be recorded and read within 10 minutes of first medical contact: the moment an EMS crew or the emergency department first reaches the patient.',
          ],
          look: 'The heart is cut open again and the inner lining of the left ventricle (the endocardium) is ringed. Muscle dies here first, and the damage then spreads outward through the wall toward the surface.',
          show: { heart: 'sectioned', structure: 'endocardium', focus: 'heart' },
          check: {
            kind: 'choice',
            question: 'Why does the system aim for a first 12-lead within 10 minutes of first medical contact?',
            options: [
              'The 12-lead is what sets off opening the artery, and muscle is dying meanwhile',
              'ST elevation fades within about 10 minutes, so a later tracing would miss it',
              'Recording the ECG eases the pain, so it should be done as early as possible',
              'Blood tests cannot be drawn until the first ECG has been recorded and read',
            ],
            answer: 0,
            explain: 'The 12-lead is the trigger for everything that follows: the STEMI alert, the choice of hospital, the team that opens the artery. Each minute it is delayed is a minute of muscle lost. ST elevation does not fade in minutes while the artery stays blocked.',
          },
          roleNote: {
            1: 'Your part of the 10 minutes: a clean 12-lead acquired and transmitted early, where your protocols allow. Reading it belongs to the paramedic or physician who receives it.',
            2: 'Acquire the 12-lead at the patient\'s side, before moving them, and transmit it. A STEMI recognized in the field lets the cath lab be activated before you arrive.',
            4: 'New chest pain on your unit: a 12-lead within 10 minutes and the physician told at once, with the time the pain began.',
          },
          more: ['anterior-stemi', 'inferior-stemi', 'cl-stemi-system'],
        },
      ],
    },

    // ─── 2 ───────────────────────────────────────────────────────────────
    {
      id: 'anterior',
      title: 'The front wall: a blocked LAD',
      goal: 'Recognize an anterior STEMI, judge how high in the LAD the block sits, and name the complications to prepare for.',
      minutes: 8,
      steps: [
        {
          title: 'The artery down the front',
          text: [
            'The left anterior descending artery (LAD) runs down the front of the heart, in the groove between the two ventricles, to the apex. It feeds the front (anterior) wall of the left ventricle, the front two-thirds of the septum and the apex: more muscle than either of the other two arteries.',
            'A heart attack from a blocked LAD is an anterior STEMI. Because so much muscle is at risk, it is the most dangerous of the common patterns. The blocked artery in any heart attack is called the culprit.',
          ],
          look: 'The LAD\'s territory, normally green on this map, is pulsing purple: the muscle that has lost its blood supply. The legend beside the heart names the culprit artery.',
          show: { heart: 'territories', camera: 'Front', rhythm: 'anterior-stemi', ecg: 'ecg', layout: 'simultaneous', focus: 'heart' },
        },
        {
          title: 'ST elevation in V1 to V4',
          text: [
            'The chest leads V1 to V4 sit over the front of the heart. V1 and V2 face the septum, and V3 and V4 face the anterior wall. When the LAD blocks, these are the leads that show ST elevation.',
            'Often the elevation spreads into V5 and V6, because the LAD\'s branches reach round toward the side wall. The more leads involved, the more muscle is at risk.',
          ],
          look: 'V3 is outlined on the 12-lead, and on the heart its line of sight comes in from the front of the chest to meet the pulsing anterior wall. On this tracing V5 is raised too, a little less.',
          show: { lead: 'V3', focus: 'ecg' },
          check: {
            kind: 'lead',
            question: 'V3 shows ST elevation. Tap another chest lead that shows it too.',
            targets: ['V2', 'V4', 'V1', 'V5'],
            explain: 'V1, V2 and V4 are clearly raised along with V3, and V5 a little less. V6, round at the side, is almost level. ST elevation centered on V1 to V4 is the signature of a blocked LAD.',
          },
        },
        {
          title: 'Tall T waves, missing R waves',
          text: [
            'Look at the whole shape of each beat in these leads, not only at the ST segment. The T waves are tall and broad: hyperacute. And the R wave, which normally grows step by step from V1 to V4, is almost absent in V1 to V3.',
            'A lost R wave means the muscle under that electrode has stopped adding its electricity to the beat. If the artery stays blocked, these leads are left with deep Q waves: the lasting mark of an anterior infarct.',
          ],
          look: 'Follow the R wave, the first upward spike of each QRS, from V1 to V6. It is missing or tiny in V1 to V3, small in V4, and reaches full height only in V5 and V6.',
          show: { focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'What does the loss of R waves in V1 to V3 on this tracing tell you?',
            options: [
              'Muscle in the septum and front wall has stopped producing its electrical signal',
              'The chest electrodes have been placed one rib space too high on the chest',
              'The heart rate is too fast for the R waves to reach their normal height',
              'The LAD has reopened, and the returning R waves are still small',
            ],
            answer: 0,
            explain: 'The R wave in V1 to V3 is drawn by the septum and the front wall. When that muscle stops firing, the R wave goes and a Q wave takes its place. Misplaced electrodes can also flatten R waves, but they do not add ST elevation and tall T waves.',
          },
        },
        {
          title: 'How high is the block?',
          text: [
            'Where the LAD is blocked decides how much muscle is lost. Its first branches leave near the top: the septal branches dive into the septum, and the first diagonal (D1) runs to the upper side wall, the area that leads I and aVL face.',
            'A block above those branches, a proximal occlusion, takes out everything: septum, front wall, apex and part of the side wall. On the ECG the clue is ST elevation in I and aVL added to V1 to V4, usually with ST depression in the inferior leads.',
            'A block further down spares the first branches. The ST elevation then centers on V3 to V5, I and aVL are not raised, and the inferior leads show no ST depression.',
          ],
          look: 'The first diagonal (D1) is ringed, leaving the LAD near its top and heading for the side wall. On this tracing I and aVL are lifted by about half a millimeter: a hint that the block sits above this branch.',
          show: { structure: 'd1', focus: 'heart' },
          check: {
            kind: 'tap',
            question: 'Tap the segment of the LAD where a block puts the most muscle at risk.',
            targets: ['lad-proximal'],
            explain: 'The proximal LAD, above the septal branches and the first diagonal. A block there cuts off the whole territory at once, which is why it has been nicknamed the widow-maker. Mid and distal blocks spare the muscle fed by the branches above them.',
          },
          more: ['lad-proximal', 'd1'],
        },
        {
          title: 'The mirror in the inferior leads',
          text: [
            'The upper front wall and the underside of the heart face roughly opposite ways. So when a proximal LAD block injures the upper front wall, the inferior leads (II, III, aVF) often show the reciprocal change: ST depression.',
            'It can be small. Here it is about half a millimeter, and easy to pass over. But in a patient with ST elevation in V1 to V4 it supports the diagnosis and points to a block high in the artery.',
          ],
          look: 'Lead III is enlarged. Its ST segment runs a little below the baseline, the ST label shows a negative number, and the T wave is almost flat.',
          show: { inspect: 'III', focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'Leads III and aVF show slight ST depression during this anterior STEMI. What is the best reading?',
            options: [
              'The mirror image of the injury in the front wall',
              'A second heart attack in the inferior wall',
              'Proof that the LAD has reopened',
              'An artifact: the inferior leads cannot be trusted here',
            ],
            answer: 0,
            explain: 'III and aVF look at the heart from below, nearly opposite the upper anterior wall, so they draw its ST elevation upside down. A second infarct in the inferior wall would lift those ST segments, not lower them.',
          },
        },
        {
          title: 'The wiring runs through the injured septum',
          text: [
            'The septum carries the heart\'s fast wiring: the right bundle branch and the front part of the left bundle (the left anterior fascicle). Their blood comes from the LAD\'s septal branches.',
            'So an anterior STEMI can damage the wiring itself. A new right bundle branch block, or a block low in the wiring with a slow, wide-QRS backup rhythm, means a large part of the septum is ischemic. Atropine often does not help a block this low, and pacing may be needed.',
          ],
          look: 'The heart is see-through, showing the wiring. The right bundle branch and the left anterior fascicle carry amber tags: both run down the septum, inside the LAD\'s territory.',
          show: { heart: 'conduction', camera: 'Front', highlight: ['right-bundle-branch', 'left-anterior-fascicle'], focus: 'heart' },
          check: {
            kind: 'choice',
            question: 'During an anterior STEMI the QRS suddenly becomes wide, with a right bundle branch block pattern. What does that suggest?',
            options: [
              'A large, proximal LAD occlusion: the septum that carries the wiring is ischemic',
              'The right coronary artery has blocked as well, taking the right bundle with it',
              'The artery has reopened, and the wiring is recovering from the injury',
              'Nothing important: bundle branch block is common and harmless in heart attacks',
            ],
            answer: 0,
            explain: 'The right bundle branch runs in the septum and is fed by the LAD\'s first septal branches. Losing it during an anterior STEMI marks a block high in the artery and a patient at high risk of shock and complete heart block. It is reported at once.',
          },
          roleNote: {
            2: 'A QRS that widens during an anterior STEMI is reported to the receiving team with the time, and the pads go on if they are not on already.',
            3: 'A QRS that widens on the monitor during an LAD case is called out to the operator immediately, with the time.',
          },
        },
        {
          title: 'Prepare for the worst',
          text: [
            'An anterior STEMI can take away a large share of the left ventricle\'s pumping muscle at once. If the pump fails, the result is cardiogenic shock: low blood pressure, a fast heart rate, cool clammy skin, and fluid backing up into the lungs.',
            'The other early killer is ventricular fibrillation (VF), which is most likely in the first hours. That is why defibrillator pads go on early and stay on.',
          ],
          look: 'The same heart attack with the pump failing. The ST elevation in V1 to V5 is still there, and the heart rate has climbed to about 120 a minute as the heart tries to make up for a weak squeeze.',
          show: { heart: 'external', camera: 'Front', rhythm: 'cardiogenic-shock', focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'A patient with an anterior STEMI turns pale and sweaty. Blood pressure 78/50, heart rate 122, crackles in both lungs. What is happening?',
            options: [
              'Cardiogenic shock: too much of the left ventricle has stopped pumping',
              'A vagal reaction to the pain: the nerves have dropped the pressure',
              'A right ventricular infarction: the right side is failing to fill the left',
              'An ordinary response to severe chest pain that will settle with pain relief',
            ],
            answer: 0,
            explain: 'Low pressure with a fast rate and wet lungs after a large anterior infarct is pump failure. A vagal reaction slows the heart. A right ventricular infarct goes with inferior STEMI and leaves the lungs clear. Shock makes opening the artery even more urgent.',
          },
          roleNote: {
            1: 'Report low blood pressure, a fast pulse and breathlessness early: they change where and how fast the patient goes. Keep the AED at the patient\'s side, ready to use.',
            2: 'Pads on, IV access, and early notification of shock or a new conduction block. Nitroglycerin is withheld when systolic pressure is below 90 mmHg.',
            3: 'Have the defibrillator connected before the wire crosses, and the support console the operator may ask for ready to run.',
            4: 'Hypotension, new crackles or cool skin after a large anterior MI are reported to the physician at once, with a full set of vital signs.',
            5: 'In shock: emergency PCI of the culprit vessel only. A microaxial flow pump is reasonable in selected STEMI with severe shock; routine IABP and routine VA-ECMO are not recommended (2025 ACS guideline).',
          },
          more: ['anterior-stemi', 'cardiogenic-shock', 'ventricular-fibrillation'],
        },
      ],
    },

    // ─── 3 ───────────────────────────────────────────────────────────────
    {
      id: 'inferior',
      title: 'The underside: a blocked right coronary artery',
      goal: 'Recognize an inferior STEMI, pick out the clues to a blocked RCA and a right ventricular infarct, and anticipate a slow heart rate.',
      minutes: 9,
      steps: [
        {
          title: 'The wall that rests on the diaphragm',
          text: [
            'The inferior wall is the underside of the left ventricle, the part that rests on the diaphragm. In about 8 out of 10 people it is fed by the right coronary artery (RCA). In the rest, the circumflex feeds it, alone or shared with the RCA.',
            'An inferior STEMI usually threatens less muscle than an anterior one. Its dangers are different: the RCA also feeds the right ventricle and, in most people, the heart\'s two electrical nodes.',
          ],
          look: 'The heart is seen from below. The RCA\'s territory, normally orange on this map, is pulsing purple: the underside of the left ventricle and the right ventricle next to it.',
          show: { heart: 'territories', camera: 'Bottom', flow: true, rhythm: 'inferior-stemi', ecg: 'ecg', layout: 'simultaneous', focus: 'heart' },
        },
        {
          title: 'II, III and aVF',
          text: [
            'Three leads look up at the inferior wall from the left leg: II, III and aVF. An inferior STEMI lifts the ST segment in these three.',
            'The opposite view belongs to aVL, high on the left. Its ST depression is the reciprocal change, and it often appears before the inferior ST elevation is obvious. In a patient with chest pain, a sagging ST segment in aVL is a reason to look hard at lead III.',
          ],
          look: 'Lead III is outlined, and its line of sight comes up from below to meet the underside of the heart. Find the other two leads with ST elevation, then check aVL.',
          show: { lead: 'III', camera: 'Front', focus: 'ecg' },
          check: {
            kind: 'lead',
            question: 'III is one of the three. Tap another lead that shows ST elevation.',
            targets: ['aVF', 'II'],
            explain: 'II, III and aVF all show ST elevation, and aVL shows the mirror image: ST depression with an inverted T wave. Three contiguous leads and a reciprocal change: an inferior STEMI.',
          },
        },
        {
          title: 'RCA or circumflex?',
          text: [
            'Two arteries can cause an inferior STEMI, and the limb leads usually tell them apart. The RCA\'s share of the inferior wall lies toward the patient\'s right, the side lead III looks from. The circumflex\'s share lies toward the left, the side of lead II.',
            'So a blocked RCA lifts III more than II and pushes aVL and lead I down. A blocked circumflex lifts II at least as much as III, leaves I and aVL level or raised, and often adds ST elevation in V5 and V6.',
          ],
          look: 'Only the 12-lead is showing. Compare the height of the ST segment in III with II, then look at aVL and lead I.',
          show: { heart: false },
          check: {
            kind: 'choice',
            question: 'On this tracing the ST elevation is taller in III than in II, and aVL and lead I show ST depression. Which artery is most likely blocked?',
            options: ['The right coronary artery', 'The circumflex artery', 'The left anterior descending artery', 'The left main coronary artery'],
            answer: 0,
            blind: true,
            explain: 'ST elevation greater in III than in II, with ST depression in aVL and I, points to the RCA. A circumflex block would lift II at least as much as III and would not push I and aVL down. The LAD shows itself in V1 to V4.',
          },
        },
        {
          title: 'The right ventricle shares the artery',
          text: [
            'The branches that feed the right ventricle (RV) leave the RCA near its start. A block above them causes a right ventricular infarction on top of the inferior one.',
            'The standard 12 leads hardly see the right ventricle. So every inferior STEMI gets one extra lead, V4R: the V4 electrode moved to the same spot on the right side of the chest (fifth space between the ribs, in line with the middle of the collarbone).',
            'ST elevation of 0.5 mm or more in V4R points to right ventricular involvement (1 mm or more in men under 30).',
          ],
          look: 'The start of the RCA is ringed, in the groove between the right atrium and the right ventricle. The muscle below it is pulsing along with the inferior wall.',
          show: { heart: 'territories', structure: 'rca-proximal', focus: 'heart' },
          check: {
            kind: 'tap',
            question: 'Tap the chamber that a block here puts at risk, in addition to the inferior wall of the left ventricle.',
            targets: ['right-ventricle'],
            explain: 'The right ventricle. Its branches leave the first part of the RCA, so a proximal block starves it along with the inferior wall. V4R is the lead that shows it.',
          },
          roleNote: {
            2: 'Record V4R on every inferior STEMI before giving nitroglycerin, and label the tracing so the receiving team knows which lead was moved.',
          },
          more: ['right-ventricle', 'rca-proximal'],
        },
        {
          title: 'Why a right ventricular infarct depends on preload',
          text: [
            'The two ventricles pump in series: everything the left ventricle sends to the body must first be pushed through the lungs by the right. A weakened right ventricle delivers less, the left ventricle runs short of blood to pump, and the blood pressure falls.',
            'The picture is low blood pressure with clear lungs and swollen neck veins. Such a patient depends on preload: how well the right ventricle is filled by the blood returning to it. A weak right ventricle can pump out only what flows into it.',
            'Nitroglycerin widens the veins and lowers preload, so it can drop the pressure sharply. The 2025 guideline says to avoid it when a right ventricular infarct is suspected. Low pressure here is usually treated with careful IV fluid.',
          ],
          look: 'The heart is cut open. Blue dots cross the right ventricle on their way to the lungs, and red dots return to the left side. Nothing reaches the left ventricle unless the right ventricle has pumped it first.',
          show: { heart: 'sectioned', camera: 'Front', focus: 'heart' },
          check: {
            kind: 'choice',
            question: 'An inferior STEMI patient has a blood pressure of 84/52, clear lungs and swollen neck veins. Which treatment is most likely to make things worse?',
            options: ['Nitroglycerin', 'A fluid bolus', 'Aspirin', 'Oxygen for a saturation of 88%'],
            answer: 0,
            explain: 'Low pressure, clear lungs and full neck veins in an inferior STEMI mean a right ventricular infarct until proven otherwise. Nitroglycerin lowers the preload this patient depends on, and it is also avoided whenever systolic pressure is below 90 mmHg. Fluid supports the pressure. Aspirin is still right, and so is oxygen here, because the saturation is below 90%; it is not given routinely above that.',
          },
          roleNote: {
            1: 'Do not assist with the patient\'s nitroglycerin if systolic pressure is below 90 mmHg or medical direction suspects a right ventricular infarct. Aspirin per protocol is still given.',
            2: 'Inferior STEMI: V4R and a blood pressure before any nitroglycerin. Hypotension with clear lungs is treated with fluid boluses per protocol, reassessing after each one.',
            4: 'Before giving an ordered nitrate in inferior MI, confirm that right ventricular involvement has been checked and the pressure is adequate. Report hypotension with clear lungs.',
            5: 'RV infarction: keep preload and AV synchrony, avoid nitrates and diuretics, add an inotrope if hypotension persists after fluid, and reperfuse early.',
          },
          more: ['inferior-stemi', 'nitroglycerin'],
        },
        {
          title: 'The same artery feeds the nodes',
          text: [
            'The RCA usually supplies both of the heart\'s electrical nodes: the SA node in about 6 of 10 people and the AV node in 8 or 9 of 10. The inferior wall also has nerve endings that, when irritated, slow the heart through the vagus nerve.',
            'So inferior STEMI and a slow heart go together: sinus bradycardia, a long PR interval, dropped beats or complete heart block. Nausea, sweating and low pressure from the same vagal reflex are common.',
          ],
          look: 'The AV nodal artery is ringed at the back of the heart, where it leaves the RCA. On the tracing the rate is in the 60s: already on the slow side for someone in pain.',
          show: { heart: 'external', structure: 'av-nodal-artery', focus: 'heart' },
          more: ['av-nodal-artery', 'sinus-bradycardia'],
        },
        {
          title: 'Inferior STEMI with complete heart block',
          text: [
            'Here the AV node has stopped conducting altogether: complete (third-degree) heart block. The atria keep their own pace. The ventricles are driven by a backup pacemaker a little below the AV node, at about 40 beats a minute.',
            'Because the backup sits high in the wiring, each beat still travels down the normal fast pathways and the QRS stays narrow. That is the usual pattern in inferior STEMI: the block is in the AV node, it often responds to atropine, and it usually clears within days of the artery being opened.',
          ],
          look: 'The heart is see-through and slowed to half speed; a red × marks the block at the AV node. On the lead II strip the P waves keep their own rate while narrow QRS complexes arrive slowly, unlinked to them. II, III and aVF are still raised.',
          show: { rhythm: 'inferior-stemi-chb', heart: 'conduction', camera: 'Front', speed: 0.5, focus: 'heart' },
          check: {
            kind: 'choice',
            question: 'The backup beats on this tracing have a narrow QRS. What does that tell you?',
            options: [
              'The block is in the AV node, and the backup pacemaker sits a little below it',
              'The block is low in the bundle branches, and the backup is unreliable',
              'The SA node is still driving the ventricles through a slower pathway',
              'The ventricles are being driven by an implanted pacemaker',
            ],
            answer: 0,
            explain: 'A narrow QRS means the beat starts above the bundle branches, at the AV junction, and uses the normal wiring: the usual backup in inferior STEMI. A block low in the wiring, as in a large anterior STEMI, leaves a slow, wide-QRS backup that is far less reliable. A paced beat would be wide too, with a spike in front of it.',
          },
          roleNote: {
            2: 'Symptomatic bradycardia in inferior STEMI: atropine 1 mg IV, repeated every 3 to 5 minutes up to 3 mg, then transcutaneous pacing if it fails, per protocol. Pads go on early.',
            3: 'Have the temporary pacing wire and a venous sheath ready for an RCA case, and call out any fall in rate or pressure at once.',
            4: 'Keep pacing pads on, give atropine or fluid as ordered or per approved protocol, and report every change in rate and rhythm.',
          },
          more: ['third-degree-av-block', 'atropine', 'temporary-pacing'],
        },
        {
          title: 'Three habits for every inferior STEMI',
          text: [
            'One: record V4R and check the blood pressure before any nitroglycerin. Two: expect a slow heart, with pads on and pacing within reach. Three: look at V1 to V3.',
            'The third habit is for the back of the heart. The artery that feeds the inferior wall often feeds the posterior wall too, and on the standard 12 leads that wall shows itself only as ST depression in V1 to V3. The next lesson explains why.',
          ],
          look: 'Back to the first tracing at normal speed. II, III and aVF are raised and aVL is down. In V2 and V3 the ST segment sits slightly below the baseline.',
          show: { rhythm: 'inferior-stemi', heart: 'territories', camera: 'Bottom', speed: 1, focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'Which extra lead belongs with every inferior STEMI, before nitroglycerin is given?',
            options: ['V4R, on the right side of the chest', 'V7, on the back of the chest', 'A second lead II at double size', 'aVR, recorded again after 10 minutes'],
            answer: 0,
            explain: 'V4R looks at the right ventricle, which shares the RCA with the inferior wall. If the right ventricle is involved, nitroglycerin can collapse the blood pressure. V7 to V9 look at the posterior wall: useful, but they do not answer the nitroglycerin question.',
          },
          more: ['inferior-stemi', 'cl-comp-bezold'],
        },
      ],
    },

    // ─── 4 ───────────────────────────────────────────────────────────────
    {
      id: 'lateral-and-posterior',
      title: 'The side and the back: lateral and posterior',
      goal: 'Recognize a lateral STEMI from small changes, and suspect a posterior STEMI from ST depression in V1 to V3.',
      minutes: 8,
      steps: [
        {
          title: 'The circumflex and the side wall',
          text: [
            'The lateral wall is the left side wall of the left ventricle. It is fed mainly by the circumflex artery through its obtuse marginal branches, with help from the diagonal branches of the LAD.',
            'A heart attack here is a lateral STEMI. It is the easiest of the three to miss: its changes are often small, and much of the circumflex territory lies on the side and back of the heart, where few electrodes look.',
          ],
          look: 'The heart is seen from the patient\'s left. The circumflex territory, normally blue on this map, is pulsing purple: the side wall of the left ventricle.',
          show: { heart: 'territories', camera: 'Left', rhythm: 'lateral-stemi', ecg: 'ecg', layout: 'simultaneous', focus: 'heart' },
        },
        {
          title: 'I, aVL, V5 and V6',
          text: [
            'Four leads face the lateral wall. I and aVL look from the left arm at its upper part, the high lateral wall. V5 and V6 look from the left side of the chest at the lower part.',
            'ST elevation can appear in all four or in one pair only. Elevation limited to I and aVL usually comes from a diagonal or a marginal branch. Elevation in V5 and V6 points lower, to the circumflex itself or the far end of the LAD.',
          ],
          look: 'aVL is outlined, and its line of sight comes down from the left shoulder onto the upper side wall. Now find the chest leads that face the same wall lower down.',
          show: { lead: 'aVL', camera: 'Front', focus: 'ecg' },
          check: {
            kind: 'lead',
            question: 'aVL shows ST elevation. Tap a chest lead that shows it too.',
            targets: ['V6', 'V5'],
            explain: 'V5 and V6 are raised along with I and aVL: all four lateral leads. V1 to V3 are not. ST elevation in the lateral group points to the circumflex or one of its marginal branches.',
          },
        },
        {
          title: 'Small changes count',
          text: [
            'In a lateral STEMI the ST elevation is often only a millimeter or so, and in aVL it can be less. What gives it away is the mirror image. Lead III looks from below and from the right, opposite the high lateral wall, and shows ST depression.',
            'So read the two together: slight ST elevation in aVL with ST depression in III, in a patient with chest pain, is a blocked artery until proven otherwise. The ST depression in III is the reflection of the lateral injury, not a second problem in the inferior wall.',
          ],
          look: 'Lead III is enlarged. The ST segment runs about a millimeter below the baseline and the T wave is upside down: the mirror image of what aVL shows.',
          show: { inspect: 'III', focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'A patient with chest pain has 1 mm of ST elevation in I and aVL and ST depression in III. What is the best reading?',
            options: [
              'A lateral STEMI with a reciprocal change in III',
              'Inferior ischemia: the main problem is where the ST depression is',
              'A normal variant: 1 mm is too little to matter',
              'Pericarditis: the changes are in several leads',
            ],
            answer: 0,
            explain: 'I and aVL are contiguous and reach the 1 mm limit, and III shows their mirror image. Reciprocal ST depression makes a blocked artery much more likely. Pericarditis lifts the ST segment almost everywhere and does not push III down.',
          },
        },
        {
          title: 'The quiet artery',
          text: [
            'The circumflex is sometimes called the electrically silent artery. It runs round the back of the heart, away from every electrode, and it can block completely while the 12-lead shows little or nothing.',
            'This is why ongoing chest pain with an unimpressive ECG is never the end of the search. Repeat the 12-lead, compare it with the first, and look at the back of the heart.',
          ],
          look: 'The heart is seen from behind. The pulsing circumflex territory wraps from the side wall round onto the back, where no standard electrode sits.',
          show: { camera: 'Back', focus: 'heart' },
          check: {
            kind: 'choice',
            question: 'A patient has ongoing chest pain. The first 12-lead shows no ST elevation. What is the safest conclusion?',
            options: [
              'A blocked artery is still possible: repeat the 12-lead and add the posterior leads',
              'A heart attack has been ruled out, because every STEMI shows on the first 12-lead',
              'The pain must come from the lungs or the stomach, since the heart tracing is clear',
              'One more 12-lead is needed, but only after the pain has passed and the patient is calm',
            ],
            answer: 0,
            explain: 'A first 12-lead without ST elevation does not rule out a blocked artery, least of all in the circumflex. Serial 12-leads during the pain, and the posterior leads, find what the first tracing missed. Waiting until the pain has passed throws away the chance to catch the change.',
          },
          roleNote: {
            1: 'Chest pain that may be cardiac is treated as cardiac whatever the first tracing shows. Transmit the 12-lead, and repeat it per protocol if the pain persists.',
            2: 'Ongoing pain with a tracing that does not give the answer: repeat the 12-lead, add V7 to V9 if V1 to V3 show ST depression, and contact medical direction.',
          },
        },
        {
          title: 'The posterior wall has no lead of its own',
          text: [
            'The posterior wall is the back of the left ventricle, facing the spine. It is fed by the circumflex or by the RCA. None of the twelve standard leads looks at it directly.',
            'V1, V2 and V3 see it from the front, through the whole heart. So they draw a posterior injury back to front: ST depression in place of ST elevation, a tall R wave in place of a Q wave, and an upright T wave in place of an inverted one.',
            'In practice: horizontal ST depression that is deepest in V1 to V3, in a patient with chest pain, is a posterior STEMI until proven otherwise.',
          ],
          look: 'V2 is outlined, and on this tracing its ST segment is pushed below the baseline. On the heart, seen from the front and the patient\'s left, its line of sight enters at the front of the chest and leaves through the back wall.',
          show: { lead: 'V2', camera: 'Left', focus: 'ecg' },
          check: {
            kind: 'lead',
            question: 'V2 shows ST depression. Tap another chest lead that shows it too.',
            targets: ['V1'],
            explain: 'V1 shows the same ST depression; V3 is close to level. V1 and V2 look from the front straight through to the back wall, so this circumflex block is reaching round toward the back. The tall R waves of a complete posterior infarct are not drawn on this tracing; the ST depression is the early clue.',
          },
        },
        {
          title: 'V7, V8 and V9',
          text: [
            'To see the posterior wall directly, three electrodes are moved round to the back, at the same level as V6. V7 goes on the back fold of the armpit (the posterior axillary line), V8 below the tip of the shoulder blade, and V9 beside the spine.',
            'ST elevation of 0.5 mm or more in these leads confirms a posterior STEMI (1 mm or more in men under 40). The limit is low because the electrodes sit far from the heart.',
            'A posterior STEMI has the same urgency as any other. It is treated as a STEMI, with emergency reopening of the artery, even though the standard 12 leads show only ST depression.',
          ],
          look: 'The heart is seen from behind again: this is the wall V7, V8 and V9 face. The app\'s 12-lead does not draw these extra leads. On a real patient they are recorded as a second tracing and labeled by hand.',
          show: { camera: 'Back', focus: 'heart' },
          check: {
            kind: 'choice',
            question: 'A patient with chest pain has horizontal ST depression in V1 to V3 with tall R waves, and no ST elevation in the standard leads. What should be recorded next?',
            options: ['V7, V8 and V9, on the back of the chest', 'V4R, on the right side of the chest', 'The same 12 leads at double paper speed', 'Nothing more: ST depression can wait'],
            answer: 0,
            explain: 'ST depression deepest in V1 to V3 with tall R waves is the front view of a posterior injury. V7 to V9 look at that wall directly: 0.5 mm of ST elevation there makes it a posterior STEMI. V4R looks at the right ventricle, the question in inferior STEMI.',
          },
          roleNote: {
            2: 'ST depression in V1 to V3 with ongoing pain: record V7 to V9 if your protocol includes posterior leads, label them, transmit, and tell the receiving physician what you suspect.',
            5: 'Isolated posterior MI is most often a circumflex occlusion and is easily triaged as NSTE-ACS. Posterior ST elevation of 0.5 mm or more warrants emergency angiography.',
          },
          more: ['lateral-stemi', 'lcx-proximal'],
        },
        {
          title: 'One artery, more than one wall',
          text: [
            'Walls do not always fail one at a time. The RCA and the circumflex both curl round to the back of the heart, so inferior, lateral and posterior injury often come together. The ECG then shows two or three groups at once: for example ST elevation in II, III and aVF with ST depression in V1 to V3.',
            'More walls mean more muscle at risk. So after naming the first wall, check the others: V1 to V3 for the back, V5 and V6 for the side, V4R for the right ventricle.',
          ],
          look: 'The map shows all three territories and the name tags of their arteries. Turn the heart to follow each artery round to the back.',
          show: { camera: 'Front', focus: 'heart' },
          check: {
            kind: 'tap',
            question: 'Tap the main artery that does NOT usually reach the posterior wall (any of its name tags).',
            targets: ['lad-proximal', 'lad-mid', 'lad-distal', 'd1'],
            explain: 'The LAD. It stays on the front of the heart and ends near the apex. The circumflex and the RCA both run in the groove round to the back, so either can cause a posterior infarct, alone or together with an inferior or a lateral one.',
          },
          more: ['lcx-proximal', 'rca-proximal', 'pda'],
        },
      ],
    },

    // ─── 5 ───────────────────────────────────────────────────────────────
    {
      id: 'look-alikes',
      title: 'Look-alikes and hidden dangers',
      goal: 'Tell a STEMI from ST elevation with another cause, and spot dangerous patterns that have no classic ST elevation.',
      minutes: 10,
      steps: [
        {
          title: 'Three questions for any ST elevation',
          text: [
            'Not every raised ST segment is a blocked artery, and not every blocked artery raises the ST segment. Both mistakes cost: a false alarm sends a patient for an emergency procedure they do not need, and a miss costs heart muscle.',
            'Three questions sort most tracings. Does the ST elevation fit one artery\'s territory, and is there reciprocal ST depression in the opposite leads? Is the QRS narrow, or is it wide from a bundle branch block or a pacemaker?',
            'Other common causes of raised ST segments are early repolarization in healthy young adults, a thickened left ventricle (LVH) and a bulge left in the wall by an old heart attack (an aneurysm). An old tracing to compare with helps with all of them.',
          ],
          look: 'An inferior STEMI for reference: ST elevation in II, III and aVF only, ST depression in aVL and I, a narrow QRS. On the heart, seen from below, one territory pulses purple.',
          show: { heart: 'territories', camera: 'Bottom', rhythm: 'inferior-stemi', ecg: 'ecg', layout: 'simultaneous', focus: 'ecg' },
        },
        {
          title: 'Pericarditis: ST elevation everywhere',
          text: [
            'Pericarditis is inflammation of the sac around the heart. It irritates the whole outer surface of the heart, so the ST segment rises in most leads at once, across the territories of all three arteries.',
            'With every wall involved, no lead is left looking at an injured wall from behind, so there is no reciprocal ST depression. The one exception is aVR, which looks from the far side of everything.',
            'The patient usually differs too: sharp pain that is worse lying flat or breathing in and eases on sitting forward. But the story does not replace the tracing, and when in doubt the tracing is handled as a possible STEMI.',
          ],
          look: 'ST segments are lifted in I, II, III, aVF and V2 to V6: limb leads and chest leads together. On the heart nothing pulses: no single wall is being starved.',
          show: { rhythm: 'pericarditis', hr: 80, heart: 'external', camera: 'Front', focus: 'ecg' },
          check: {
            kind: 'lead',
            question: 'Tap the one lead where the ST segment is pushed down.',
            targets: ['aVR'],
            explain: 'aVR. It looks into the heart from the right shoulder, the far side of every wall, so it shows the mirror image of all the others. Apart from aVR (and sometimes V1), pericarditis has no reciprocal ST depression. A STEMI does: aVL goes down when the inferior leads go up.',
          },
        },
        {
          title: 'The PR segment joins in',
          text: [
            'Pericarditis inflames the surface of the atria as well. That shifts the PR segment, the short flat stretch between the P wave and the QRS: it sinks below the baseline in most leads and rises in aVR.',
            'PR depression is small, often half a millimeter, and worth hunting for because a STEMI rarely produces it. Two more differences: pericarditis does not form Q waves, and its ST elevation is usually taller in lead II than in lead III. A blocked RCA does the reverse.',
          ],
          look: 'Lead II is enlarged. Compare the flat stretch after the P wave with the line before the P wave: it sits about half a millimeter lower. That is PR depression.',
          show: { inspect: 'II', focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'Which finding would make you doubt pericarditis and suspect a STEMI?',
            options: ['ST depression in aVL', 'ST elevation in limb and chest leads', 'PR depression in lead II', 'ST depression in aVR'],
            answer: 0,
            explain: 'ST depression in aVL is a reciprocal change, and reciprocal change means one wall is injured: here the inferior wall. Widespread ST elevation, PR depression and a depressed aVR are all part of pericarditis itself.',
          },
          roleNote: {
            2: 'Widespread ST elevation with PR depression suggests pericarditis, but when you are not sure, transmit and follow the STEMI protocol. Watch for low pressure with swollen neck veins: fluid around the heart.',
          },
          more: ['acute-pericarditis'],
        },
        {
          title: 'Left bundle branch block: ST elevation that belongs',
          text: [
            'In left bundle branch block (LBBB) the left ventricle is reached late, by the slow route through muscle. The QRS is wide: 0.12 s (3 small boxes) or more.',
            'A ventricle that fires abnormally also resets abnormally. In LBBB the ST segment and T wave point away from the main direction of the QRS. This is called discordance, and in LBBB it is expected.',
            'So V1 to V3, where the QRS is deep and downward, show ST elevation and upright T waves. I, aVL, V5 and V6, where the QRS is tall and upright, show ST depression and inverted T waves. That is LBBB itself, with no blocked artery needed.',
          ],
          look: 'On the see-through heart a red × flashes on the blocked left bundle with each beat. On the tracing every QRS is wide. V1 to V3: deep downward QRS, ST segment above the baseline. V5 and V6: upright QRS, ST segment below it.',
          show: { rhythm: 'lbbb', heart: 'conduction', camera: 'Front', focus: 'ecg' },
          check: {
            kind: 'lead',
            question: 'Tap a lead in which the QRS points up and the ST segment and T wave point down.',
            targets: ['V6', 'V5', 'I', 'aVL', 'II', 'aVF'],
            explain: 'I, aVL, V5 and V6 show it best: a broad upright QRS followed by ST depression and an inverted T wave. In V1 to V3 the same rule runs the other way. In LBBB, ST and T opposite to the QRS is the normal state of affairs.',
          },
          more: ['left-bundle-branch-block'],
        },
        {
          title: 'Finding a STEMI behind LBBB',
          text: [
            'LBBB hides the usual signs, but a blocked artery can still be found. The Sgarbossa criteria turn the rule of discordance round: what is expected is safe, and what breaks the rule is the warning.',
            'Three findings break it. The first two are concordant changes, in the same direction as the QRS: ST elevation of 1 mm or more in a lead where the QRS points up, or ST depression of 1 mm or more in V1, V2 or V3. The third is ST elevation in the expected direction that is far too large: a quarter or more of the depth of the S wave before it.',
            'Any one of the three in a patient with symptoms is handled as a STEMI. A new LBBB with none of them no longer counts as one.',
          ],
          look: 'V1 is enlarged. The S wave is deep, and the ST segment is raised by only a small fraction of that depth, in the opposite direction to the QRS. This is the expected picture: no sign of a blocked artery on this tracing.',
          show: { inspect: 'V1', focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'A patient with LBBB and chest pain has 2 mm of ST elevation in V5, where the QRS points up. What does that mean?',
            options: [
              'Concordant ST elevation: handle it as a STEMI',
              'Nothing: ST elevation is expected in LBBB',
              'It cannot be judged: LBBB makes the ECG unreadable',
              'It matters only if the LBBB is new',
            ],
            answer: 0,
            explain: 'In LBBB the ST segment should point away from the QRS. ST elevation in the same direction as an upright QRS breaks that rule and signals an acute occlusion. Expected ST elevation is found where the QRS points down, in V1 to V3. Whether the LBBB is new or old does not change this.',
          },
          roleNote: {
            2: 'LBBB alone is not a STEMI alert. Look for the three findings. If one is present, or the patient is in shock or has pain that will not settle, activate or contact medical direction per protocol.',
            5: 'The Smith-modified rule (ST/S ratio of −0.25 or more negative) is unweighted: any one criterion is positive. In its derivation study, sensitivity for occlusion was 91% against 52% for the weighted original score.',
          },
        },
        {
          title: 'A paced rhythm follows the same rule',
          text: [
            'A pacemaker lead in the right ventricle starts each beat at the tip of that ventricle. The signal then spreads through muscle from right to left, much as in LBBB, so the QRS is wide and the ST segment and T wave point away from it.',
            'The same three findings apply: ST elevation where the QRS points up, ST depression in V1 to V3, or ST elevation out of proportion to the S wave. And the same caution: a paced rhythm with ordinary discordant ST segments is not a STEMI.',
          ],
          look: 'A thin vertical spike stands in front of every wide QRS: the pacemaker firing. On the heart each beat starts with a flash near the tip, where the pacing lead sits.',
          show: { rhythm: 'paced', focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'What on this tracing tells you the wide QRS comes from a pacemaker and not from LBBB?',
            options: [
              'A sharp spike immediately before each QRS',
              'The QRS is wider than 0.12 s',
              'The ST segments point away from the QRS',
              'There is a P wave before each QRS',
            ],
            answer: 0,
            explain: 'The pacing spike. A wide QRS and discordant ST segments are shared by LBBB and right ventricular pacing, and both can have P waves. Here the pacemaker senses each P wave and then paces the ventricle, so a P wave, a spike and a wide QRS follow in order.',
          },
          more: ['paced-rhythm'],
        },
        {
          title: 'High potassium: tall T waves of another kind',
          text: [
            'A high potassium level (hyperkalemia) changes the ECG in ways that can pass for a heart attack. The best-known sign is tall T waves, which can be mistaken for the hyperacute T waves of an early STEMI.',
            'The shape is different. Potassium T waves are narrow, pointed and symmetrical, like a tent, and they appear across all territories; hyperacute T waves are broad and bulky and sit over one wall. As potassium climbs, the P waves flatten, the PR interval lengthens and the QRS widens.',
            'Severe hyperkalemia can even lift the ST segment in V1 and V2. Think of it in a patient on dialysis or with kidney failure, and whenever tall T waves come with a wide QRS.',
          ],
          look: 'T waves are tall and needle-sharp in most leads, the P waves are almost flat, and the QRS is wide. The ST segments themselves are level.',
          show: { rhythm: 'hyperkalemia', heart: 'external', camera: 'Front', focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'What separates these T waves from the hyperacute T waves of an early STEMI?',
            options: [
              'They are narrow and pointed, and they appear in every territory',
              'They are much taller than any T wave a heart attack can produce',
              'They are inverted in the chest leads and upright in the limb leads',
              'They always come with ST depression in the opposite leads',
            ],
            answer: 0,
            explain: 'Shape, spread and company. Potassium T waves are narrow and tented and show in limb and chest leads alike, alongside flat P waves and a widening QRS. Hyperacute T waves are broad, limited to one territory, and soon joined by ST elevation and reciprocal change.',
          },
          roleNote: {
            2: 'Peaked T waves with a wide QRS or lost P waves in a dialysis patient point to hyperkalemia. Treat per protocol and report it, because it changes what the hospital does first.',
          },
          more: ['hyperkalemia'],
        },
        {
          title: 'Wellens: a warning with no ST elevation',
          text: [
            'Now the opposite problem: a dangerous artery without ST elevation. This patient had chest pain earlier and is now pain-free, and the ST segments are level. But the T waves in V2 and V3 are deeply and symmetrically inverted (in about a quarter of patients they are biphasic instead: up, then sharply down).',
            'This is the Wellens pattern. It means the LAD blocked for a while near its start and has reopened, leaving a critical narrowing. The muscle is alive, the R waves are intact, and a large anterior STEMI may follow within days or weeks.',
            'It is not a STEMI and not a reason for fibrinolysis, the clot-dissolving drug treatment. It is a reason for urgent coronary angiography, an X-ray study of the arteries, and never for an exercise stress test, which can bring on the heart attack it is looking for.',
          ],
          look: 'T waves in V1 to V4 point steeply down, deepest in V2 and V3, with level ST segments and normal R waves. On the heart the LAD\'s territory pulses purple: the muscle that depends on the narrowed artery.',
          show: { rhythm: 'wellens', heart: 'territories', camera: 'Front', focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'This patient feels well and asks to go home. What does the pattern call for?',
            options: [
              'Admission and urgent coronary angiography, with no stress test',
              'An exercise stress test to see whether the pain comes back',
              'Immediate fibrinolysis, because the LAD is involved',
              'Discharge with follow-up: there is no ST elevation and no pain',
            ],
            answer: 0,
            explain: 'The inverted T waves say the proximal LAD is critically narrowed and unstable. Angiography finds and treats it before it closes for good. A stress test can provoke the heart attack it is meant to detect, and fibrinolysis is for ST elevation, not for this.',
          },
          roleNote: {
            1: 'A patient whose chest pain has stopped can still be about to have a large heart attack. Acquire and transmit the 12-lead per protocol even when pain-free, and report the earlier pain clearly.',
            2: 'Report deeply inverted or biphasic T waves in V2 and V3 in a now pain-free patient as a possible Wellens pattern. Transport to a PCI-capable center and repeat the 12-lead if pain returns.',
            4: 'If pain returns in a patient with this pattern, treat it as the artery closing: a 12-lead and the physician at once. Question any order for a stress test.',
          },
          more: ['wellens-pattern', 'lad-proximal'],
        },
        {
          title: 'ST depression and the aVR warning',
          text: [
            'ST depression means ischemia of the inner layer of the wall. With chest pain, new flat (horizontal) or down-sloping ST depression in two contiguous leads marks a high-risk patient. If the blood test (troponin) then shows muscle damage, the name is NSTEMI: a heart attack without ST elevation.',
            'NSTEMI is not treated with fibrinolysis: the patient goes to angiography at a time set by risk. One pattern raises that risk sharply: ST depression in many leads with ST elevation in aVR. It suggests that the left main artery, or several arteries, are severely narrowed.',
            'Two exceptions are handled as a STEMI: ST depression deepest in V1 to V3, which may be a posterior STEMI, and the de Winter pattern, up-sloping ST depression with tall, symmetrical T waves across the chest leads, which marks a blocked LAD.',
          ],
          look: 'ST segments sag in I, II, aVF and V4 to V6, and the T waves in those leads point down. One limb lead, aVR, goes the other way.',
          show: { rhythm: 'nstemi', heart: 'external', camera: 'Front', focus: 'ecg' },
          check: {
            kind: 'lead',
            question: 'Tap a chest lead that shows ST depression.',
            targets: ['V5', 'V4', 'V6', 'V3'],
            explain: 'V4, V5 and V6 show it clearly, and V3 a little. The same sag is in I, II and aVF, while aVR alone is raised. aVR looks into the cavity of the heart: when the inner layer of the whole left ventricle is ischemic, it is the one lead that sees ST elevation.',
          },
          more: ['nstemi', 'lmca'],
        },
      ],
    },

    // ─── 6 ───────────────────────────────────────────────────────────────
    {
      id: 'opening-the-artery',
      title: 'Opening the artery',
      goal: 'Recognize reperfusion on the ECG, expect the rhythms it brings, and state the time targets your system works to.',
      minutes: 9,
      steps: [
        {
          title: 'Two ways to restore flow',
          text: [
            'Reperfusion means getting blood flowing through the blocked artery again, and there are two ways to do it. Primary PCI (percutaneous coronary intervention) is done in the catheterization laboratory, the cath lab: a thin wire is passed up an artery, usually from the wrist, and through the clot. A balloon opens the blockage and a stent holds it open.',
            'Fibrinolysis is a clot-dissolving drug given into a vein. It needs no cath lab, but it opens fewer arteries and carries a risk of bleeding.',
            'Primary PCI is preferred whenever it can be done quickly enough. Which one a patient gets is decided by the clock.',
          ],
          look: 'An anterior STEMI again. The LAD\'s territory is pulsing purple and V1 to V5 show ST elevation. Everything in this lesson is about stopping that pulsing as early as possible.',
          show: { heart: 'territories', camera: 'Front', rhythm: 'anterior-stemi', ecg: 'ecg', layout: 'simultaneous', focus: 'heart' },
          more: ['pci-stent', 'tenecteplase', 'cl-radial-access'],
        },
        {
          title: 'What an open artery looks like',
          text: [
            'When flow returns, three things change. The pain eases and the ST segments fall back toward the baseline, often within minutes. Then, over the next hours, the T waves in the affected leads turn upside down: reperfusion T waves.',
            'Whatever muscle died before the artery opened stays dead. Here V1 to V3 have lost their R waves for good, so this patient keeps Q waves in the front leads. The earlier the artery opens, the less of this there is.',
          ],
          look: 'The same patient after the LAD was opened. The purple pulsing has gone from the heart. In V1 to V4 the ST segments are back near the baseline and the T waves now point down.',
          show: { rhythm: 'anterior-stemi-reperfused', focus: 'ecg' },
          check: {
            kind: 'lead',
            question: 'Tap a lead that shows a reperfusion T wave.',
            targets: ['V2', 'V3', 'V1', 'V4', 'V5'],
            explain: 'V1 to V4 now have inverted T waves where they stood tall before, and V5 is turning too. With the fall in the ST segments, this says the muscle is being fed again. aVR has a downward T wave on every normal tracing and does not count.',
          },
        },
        {
          title: 'Has it worked? Measure the ST segment',
          text: [
            'After fibrinolysis nobody can see the artery, so the ECG is the test. Take the lead that had the most ST elevation and measure it again 60 to 90 minutes after the drug.',
            'A fall of at least half, with the pain easing, means the artery has probably opened. A smaller fall means reperfusion has failed, and the patient needs the cath lab at once: rescue PCI.',
            'Either way the patient is moved to a PCI-capable hospital straight after the drug. When it has worked, angiography follows between 2 and 24 hours later.',
          ],
          look: 'V3 is enlarged. The label beside the dashed line gives the ST level now: a small fraction of what this lead showed while the artery was blocked.',
          show: { inspect: 'V3', focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'Before fibrinolysis, V3 showed 4 mm of ST elevation. Ninety minutes later it shows 3 mm and the pain continues. What does that mean?',
            options: [
              'Reperfusion has failed: the patient needs rescue PCI',
              'Success: any fall in the ST segment counts as reperfusion',
              'Too early to say: the ST segment is measured again tomorrow',
              'The drug needs another 90 minutes before it can be judged',
            ],
            answer: 0,
            explain: 'A fall from 4 mm to 3 mm is a quarter, well short of the half that marks success, and the pain has not eased. The artery is probably still blocked. Waiting costs muscle, so the patient goes for rescue PCI without delay.',
          },
          roleNote: {
            2: 'On a transfer after fibrinolysis, repeat the 12-lead and report the ST level and the pain to the receiving team: they are deciding between rescue PCI now and angiography later.',
            4: 'After fibrinolysis, a 12-lead at 60 to 90 minutes and a pain score are what the physician needs to judge success. Watch for bleeding and for any change in speech, strength or alertness.',
          },
          more: ['tenecteplase', 'coronary-angiography'],
        },
        {
          title: 'Rhythms at the moment of reflow',
          text: [
            'Muscle that has been starved is irritable for the first minutes after blood returns. Extra beats and short runs from the ventricles are common, and two rhythms matter.',
            'The harmless one is accelerated idioventricular rhythm (AIVR): a regular, wide-QRS rhythm near the patient\'s own heart rate, faster than an escape rhythm and slower than ventricular tachycardia, with the patient awake and the pressure holding. It suggests that the artery has opened. It is watched, not treated, and it usually stops on its own.',
            'The dangerous one is ventricular fibrillation: a chaotic line with no QRS complexes. It needs a shock at once, which is why the pads are on before the artery is opened.',
          ],
          look: 'This is AIVR: wide, regular beats at about 84 a minute, while small P waves keep their own slightly slower beat, not tied to the QRS. The heart is still pumping.',
          show: { rhythm: 'aivr', hr: 84, heart: 'external', camera: 'Front', focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'Seconds after the artery opens, the monitor shows a regular wide-QRS rhythm at 84 a minute. The patient is awake and the arterial pressure is unchanged. What is this?',
            options: [
              'AIVR, a reperfusion rhythm: watch it and do not suppress it',
              'Ventricular tachycardia: it needs an immediate shock',
              'Complete heart block: transcutaneous pacing should start',
              'Ventricular fibrillation: start CPR and defibrillate',
            ],
            answer: 0,
            explain: 'A wide regular rhythm near the sinus rate, with a good pressure, at the moment of reflow is AIVR. Drugs that suppress it can leave the patient with no rhythm at all. Ventricular tachycardia is faster, and VF has no organized beats and no pressure.',
          },
          roleNote: {
            3: 'Pads on and the defibrillator connected before the wire crosses. Call out any new rhythm at once, with the arterial pressure that goes with it.',
            4: 'During AIVR confirm that the patient is awake and perfusing. For VF: an immediate shock, then CPR and ACLS per protocol and the operator\'s orders; document shocks and times.',
            5: 'AIVR marks reperfusion and is left alone. In APEX-AMI, VT or VF before the end of the procedure was linked to an occluded artery (TIMI 0 flow) and an inferior infarct.',
          },
          more: ['cl-comp-reperfusion-arrhythmia', 'ventricular-fibrillation', 'defibrillation'],
        },
        {
          title: 'Opening the RCA: expect a slow heart',
          text: [
            'When the RCA is opened, the reperfused inferior wall can fire a strong vagal reflex, the Bezold–Jarisch reflex. Within seconds the heart slows and the blood vessels relax, so the pressure falls with the rate.',
            'It usually passes within minutes. The team is ready for it in every inferior STEMI: pads on, atropine and fluid to hand, pacing within reach.',
          ],
          look: 'This tracing is from after the RCA was opened: no pulsing on the heart, the ST segments in II, III and aVF settled, their T waves turned down. Its rate is set to 44 a minute to show the slowing.',
          show: { rhythm: 'inferior-stemi-reperfused', hr: 44, heart: 'territories', camera: 'Bottom', focus: 'ecg' },
          check: {
            kind: 'choice',
            question: 'The moment the RCA opens, a patient\'s heart rate falls from 72 to 44 and the pressure drops. They feel sick and sweaty. What is the most likely cause?',
            options: [
              'A vagal reflex from the reperfused inferior wall',
              'A new blockage: the stent has closed the artery again',
              'AIVR, the wide-QRS rhythm of reperfusion',
              'An allergic reaction to the X-ray contrast',
            ],
            answer: 0,
            explain: 'Sudden slowing with low pressure, nausea and sweating right at reflow is the Bezold–Jarisch reflex. It is short-lived and responds to atropine and fluid. The operator still checks the artery, because a new blockage can look the same on the monitor.',
          },
          roleNote: {
            3: 'Call out the fall in rate and pressure immediately and have the pacing equipment ready to hand.',
            4: 'Give atropine and the fluid bolus on the operator\'s order, raise the legs, and reassess rate and pressure every minute.',
          },
          more: ['cl-comp-bezold', 'inferior-stemi'],
        },
        {
          title: 'The clock: first medical contact to device',
          text: [
            'The system is timed from first medical contact (FMC) to device: from the moment EMS or the emergency department reaches the patient to the moment the first device, a balloon, an aspiration catheter or a stent, is used to restore flow in the blocked artery.',
            'The 2025 guideline sets two goals. For a patient taken straight to a PCI-capable hospital: FMC to device within 90 minutes. For a patient who must be transferred from a hospital without a cath lab: within 120 minutes.',
            'Every step eats into that time: the first 12-lead (within 10 minutes), the alert, the drive, the team coming in. That is why EMS takes a recognized STEMI straight to a PCI-capable hospital and warns it on the way.',
          ],
          look: 'The clock is running again: the LAD\'s territory is pulsing, and it keeps pulsing until a device crosses the blockage.',
          show: { rhythm: 'anterior-stemi', heart: 'territories', camera: 'Front', focus: 'heart' },
          check: {
            kind: 'choice',
            question: 'Paramedics reach a STEMI patient at 10:00 and drive straight to a PCI-capable hospital. By the system goal, the artery should be open by…',
            options: ['10:30', '11:00', '11:30', '12:00'],
            answer: 2,
            fixed: true,
            explain: '90 minutes from first medical contact: 11:30. The 120-minute goal (12:00) is for a patient who first arrives at a hospital without PCI and has to be transferred. The first 12-lead belongs in the first 10 minutes of that time.',
          },
          more: ['cl-stemi-system', 'stemi-activation'],
        },
        {
          title: 'When PCI is too far away',
          text: [
            'Some patients cannot reach a cath lab in time. The 2025 guideline says: if symptoms began less than 12 hours ago and the expected time from first medical contact to device is more than 120 minutes, give fibrinolysis, unless the patient has a reason not to receive it.',
            'Those reasons are mostly about bleeding: a previous bleed in the brain, a recent stroke, active bleeding, or a suspected tear in the aorta (aortic dissection), which can imitate a heart attack.',
            'Fibrinolysis is the start of the plan. The patient is transferred to a PCI-capable hospital straight away, for rescue PCI if the drug fails or angiography 2 to 24 hours later if it works. And it is only for ST elevation: ST depression alone is not treated with it, apart from a true posterior STEMI.',
          ],
          look: 'Same patient, different place: a hospital with no cath lab, and the purple still pulsing. The question is which treatment reaches this artery first.',
          show: { focus: 'heart' },
          check: {
            kind: 'choice',
            question: 'A patient reaches a rural hospital with no cath lab 2 hours after chest pain began. The 12-lead shows a STEMI. The nearest PCI center cannot open the artery until about 3 hours after first contact. There is no bleeding risk. What does the guideline favor?',
            options: [
              'Fibrinolysis now, then immediate transfer to the PCI center',
              'Transfer for primary PCI and accept the 3-hour delay',
              'Fibrinolysis, then keep the patient locally if the pain settles',
              'Wait for the troponin result before choosing',
            ],
            answer: 0,
            explain: 'Symptoms under 12 hours and an expected delay to PCI of more than 120 minutes: fibrinolysis is recommended when nothing rules it out. The patient is then transferred at once, because the drug fails in a share of patients and those who respond still need angiography within 2 to 24 hours.',
          },
          roleNote: {
            2: 'Fibrinolysis in the field is given only where your EMS system\'s protocol authorizes it. Everywhere, your early 12-lead and notification are what let the hospital choose quickly.',
            4: 'Before a fibrinolytic is given, the bleeding questions are asked and documented, and the answers go to the physician who decides.',
            5: 'With fibrinolysis the P2Y12 inhibitor is clopidogrel (300 mg; 75 mg with no loading dose over 75 years), and a pharmaco-invasive plan with angiography at 2 to 24 hours is standard (2025 ACS guideline).',
          },
          more: ['tenecteplase', 'aortic-dissection'],
        },
        {
          title: 'Your part in the chain',
          text: [
            'No single person opens the artery fast. A chain does: someone recognizes the heart attack, a 12-lead is recorded and read, the alert goes out, the patient is taken to the right place, the lab is ready, and the artery is opened.',
            'The link that saves the most time for a patient at home is the first: a 12-lead in the field, transmitted, with the cath lab activated before the ambulance arrives. Each link also writes down its times as they happen, because a system can only fix the delays it can see.',
          ],
          look: 'The artery is open and the wall has stopped pulsing. The tracing shows what the delay cost: R waves lost in V1 to V3 that will not come back.',
          show: { heart: 'external', camera: 'Front', rhythm: 'anterior-stemi-reperfused', focus: 'heart' },
          check: {
            kind: 'choice',
            question: 'A patient with chest pain is at home, 25 minutes from a PCI-capable hospital. Which action shortens the time to an open artery the most?',
            options: [
              'A 12-lead on scene, transmitted, with the cath lab activated from the field',
              'Driving to the nearest hospital of any kind and recording the ECG there',
              'Waiting on scene to see whether the pain settles with rest',
              'Starting an IV line and oxygen on scene before any ECG is recorded',
            ],
            answer: 0,
            explain: 'A prehospital 12-lead with early activation means the cath lab team is assembling while the patient is still on the road, and the ambulance can pass hospitals without PCI. Recording the first ECG after arrival starts all of that later.',
          },
          roleNote: {
            1: 'Your links: recognize possible cardiac chest pain, give aspirin per protocol, acquire and transmit a 12-lead where your protocols allow, and call for ALS early. You do not interpret the tracing; getting it to someone who can is the job.',
            2: 'Your links: a 12-lead within 10 minutes of contact, STEMI recognition, activation from the field and transport straight to a PCI-capable hospital, per protocol. Report the leads involved and the time of first contact.',
            3: 'Your links: a lab that is open and set up when the patient arrives, pads on, monitoring running, and the times logged as they happen. Call out ST or rhythm changes to the operator at once.',
            4: 'Your links: receive the patient, confirm allergies and what has already been given, start monitoring, and give the antiplatelet, anticoagulant and sedation drugs as ordered. Document each time.',
            5: 'Your links: confirm the STEMI, choose primary PCI or fibrinolysis by the timeline, open the culprit artery by radial access when feasible, with ticagrelor or prasugrel as the P2Y12 inhibitor, and plan the other lesions: complete revascularization in stable patients, culprit only in shock.',
          },
          more: ['cl-stemi-system', 'stemi-activation', 'pci-stent'],
        },
      ],
    },

    // ─── 7 ───────────────────────────────────────────────────────────────
    {
      id: 'localize-it',
      title: 'Localize it: nine tracings',
      goal: 'Find the ST changes on a 12-lead without the app\'s reading, and name the wall and the artery behind them.',
      minutes: 9,
      steps: [
        {
          title: 'Tracing 1: the routine',
          text: [
            'Nine tracings in mixed order, with the heart put away so that nothing gives the answer. Use the same routine on each: scan every lead for an ST segment above or below the baseline, group what you find by wall, look for the mirror image in the opposite leads, and check the width of the QRS.',
            'Tracing 1: a 58-year-old man with 40 minutes of chest pressure and nausea.',
          ],
          look: 'Only the 12-lead is on screen, and the app keeps its own reading hidden until you answer. Start with the limb leads in the two left-hand columns.',
          show: { heart: false, ecg: 'ecg', layout: 'simultaneous', rhythm: 'inferior-stemi' },
          check: {
            kind: 'lead',
            question: 'Tap a lead that shows ST elevation.',
            targets: ['III', 'aVF', 'II'],
            explain: 'II, III and aVF: the inferior leads, with the mirror image in aVL. This is an inferior STEMI. The ST elevation is taller in III than in II, which points to the right coronary artery. Next recording: V4R.',
          },
          roleNote: {
            1: 'Reading 12-leads is outside EMT scope. Work through these for awareness: they show why an early, clean, transmitted tracing matters so much.',
          },
        },
        {
          title: 'Tracing 2',
          text: [
            'Tracing 2: a 24-year-old woman who has had a cold for two days and now has sharp chest pain that is worse when she lies down.',
          ],
          look: 'Count the leads with ST elevation, and note whether they belong to one wall or to several. Then find the lead that goes the other way.',
          show: { rhythm: 'pericarditis' },
          check: {
            kind: 'choice',
            question: 'What is the best reading of tracing 2?',
            options: [
              'Widespread ST elevation that fits no single territory: likely pericarditis',
              'An inferior STEMI: ST elevation in II, III and aVF with a reciprocal change',
              'An anterior STEMI: ST elevation in the chest leads from a blocked LAD',
              'A normal tracing: every ST segment is within normal limits',
            ],
            answer: 0,
            explain: 'The ST segment is raised in I, II, III, aVF and V2 to V6, crossing the territories of all three arteries, and only aVR is pushed down. No single blocked artery produces that. An inferior STEMI would spare the chest leads and push aVL down.',
          },
        },
        {
          title: 'Tracing 3',
          text: [
            'Tracing 3: a 66-year-old woman with sudden heavy chest pain and sweating for 25 minutes.',
          ],
          look: 'Scan the chest leads from V1 to V6, then come back to the limb leads.',
          show: { rhythm: 'anterior-stemi' },
          check: {
            kind: 'choice',
            question: 'Which wall is injured on tracing 3, and which artery is the likely culprit?',
            options: [
              'The anterior wall and septum: the LAD',
              'The inferior wall: the right coronary artery',
              'The lateral wall: the circumflex',
              'Every wall: this is pericarditis',
            ],
            answer: 0,
            explain: 'ST elevation runs from V1 to V5, highest in V2 to V4, with tall T waves and lost R waves: the septum and the anterior wall, fed by the LAD. I and aVL are lifted a little and III is slightly depressed: one territory with a mirror image, not a widespread pattern.',
          },
        },
        {
          title: 'Tracing 4',
          text: [
            'Tracing 4: a 49-year-old man with chest tightness that came on while climbing stairs 15 minutes ago and has not gone.',
          ],
          look: 'Go through the whole routine before you decide: ST segments, walls, mirror image, QRS width.',
          show: { rhythm: 'normal-sinus' },
          check: {
            kind: 'choice',
            question: 'What does tracing 4 show, and what follows?',
            options: [
              'No ST elevation or depression: repeat the 12-lead while the pain lasts',
              'An inferior STEMI: ST elevation in II, III and aVF calls for the cath lab',
              'A posterior STEMI: ST depression in V1 to V3 calls for V7 to V9',
              'No ST elevation, so the heart can be ruled out as the cause of the pain',
            ],
            answer: 0,
            explain: 'Every ST segment is level, the T waves are upright where they should be, and the QRS is narrow: a normal tracing. That does not clear the patient. Early in a heart attack, and with a blocked circumflex, the first 12-lead can be normal, so it is repeated at short intervals, and compared, while symptoms continue.',
          },
        },
        {
          title: 'Tracing 5',
          text: [
            'Tracing 5: a 61-year-old man with pain in the chest and left arm for an hour.',
          ],
          look: 'The changes here are smaller. Check the first column, then aVL, then the last two chest leads.',
          show: { rhythm: 'lateral-stemi' },
          check: {
            kind: 'lead',
            question: 'Tap a lead that shows ST elevation.',
            targets: ['I', 'aVL', 'V5', 'V6'],
            explain: 'I, aVL, V5 and V6: the lateral leads, with a reciprocal ST depression in III. A lateral STEMI, most often from the circumflex or one of its marginal branches. V1 and V2 are pushed down as well, so the back wall may be involved: V7 to V9 are the next recording.',
          },
        },
        {
          title: 'Tracing 6',
          text: [
            'Tracing 6: a 72-year-old woman with diabetes, breathless and sweaty, with a pressure in her chest.',
          ],
          look: 'Most leads move in one direction here, and one limb lead moves in the other.',
          show: { rhythm: 'nstemi' },
          check: {
            kind: 'choice',
            question: 'What is the best reading of tracing 6?',
            options: [
              'ST depression in many leads with ST elevation in aVR: a high-risk pattern',
              'A lateral STEMI: ST elevation in I, aVL, V5 and V6 calls for reperfusion',
              'Pericarditis: the ST segments have moved in nearly every lead',
              'A normal tracing: ST segments this close to the baseline are acceptable',
            ],
            answer: 0,
            explain: 'ST depression in I, II, aVF and V4 to V6 with ST elevation only in aVR is ischemia of the inner layer of the whole left ventricle. It warns of left main or multivessel disease and calls for urgent angiography. It is not a STEMI, and fibrinolysis is not used for it.',
          },
        },
        {
          title: 'Tracing 7',
          text: [
            'Tracing 7: a 70-year-old man with known heart failure and an hour of chest discomfort.',
          ],
          look: 'Measure the width of the QRS first. Then compare the direction of each ST segment with the direction of its QRS.',
          show: { rhythm: 'lbbb' },
          check: {
            kind: 'choice',
            question: 'V1 to V3 show ST elevation on tracing 7. Is this a STEMI?',
            // the name ("Sinus rhythm with left bundle branch block … appropriate discordance") is the answer
            blind: true,
            options: [
              'Not on this evidence: it is LBBB, and each ST segment points away from its QRS',
              'Yes: ST elevation in three contiguous chest leads meets the STEMI criteria',
              'Yes: any LBBB in a patient with chest pain is treated as a STEMI',
              'It cannot be judged at all, because LBBB makes the ECG unreadable',
            ],
            answer: 0,
            explain: 'The QRS is wide with the LBBB shape, and every ST segment is opposite to its QRS and small beside it. None of the three warning findings is present. The patient still has chest pain, so the 12-lead is repeated and compared, and shock or pain that will not settle raises the urgency whatever the ECG shows.',
          },
        },
        {
          title: 'Tracing 8',
          text: [
            'Tracing 8: a 55-year-old man. He had 20 minutes of chest pain at rest this morning. It has gone and he feels well.',
          ],
          look: 'The ST segments will not help you here. Look at the T waves in the chest leads.',
          show: { rhythm: 'wellens' },
          check: {
            kind: 'lead',
            question: 'Tap a lead with a deeply inverted T wave.',
            targets: ['V2', 'V3', 'V1', 'V4'],
            explain: 'V1 to V4, deepest in V2 and V3, with level ST segments and intact R waves in a pain-free patient: the Wellens pattern. The proximal LAD is critically narrowed. He needs urgent angiography and must not have a stress test.',
          },
        },
        {
          title: 'Tracing 9',
          text: [
            'Tracing 9: a 63-year-old woman, three hours after a stent was placed for a heart attack. She is comfortable.',
            'One more use of the same routine: checking that an opened artery has stayed open.',
          ],
          look: 'Compare V1 to V4 with what you saw on tracing 3: the ST segments, the T waves and the R waves.',
          show: { rhythm: 'anterior-stemi-reperfused' },
          check: {
            kind: 'choice',
            question: 'What does tracing 9 show?',
            options: [
              'A reperfused anterior infarct: ST settled, T waves inverted, Q waves left behind',
              'A new anterior STEMI: the stent has blocked and the ST segments have risen',
              'The Wellens pattern: inverted T waves with no muscle lost so far',
              'A normal tracing: inverted T waves in V1 to V4 are of no concern',
            ],
            answer: 0,
            explain: 'The ST segments in V1 to V4 are near the baseline and the T waves are inverted: reperfusion. The missing R waves in V1 to V3 separate this from Wellens, where no muscle has died. If the ST segments rise again or the pain returns, the artery may have closed again, and that is reported at once.',
          },
          roleNote: {
            3: 'After the case, ST segments rising again in the treated leads on the monitor are called out at once: the stent may have blocked.',
            4: 'After PCI, returning chest pain or ST segments rising again in the treated leads is reported to the physician immediately, with a 12-lead.',
          },
          more: ['anterior-stemi', 'inferior-stemi', 'lateral-stemi', 'stemi-activation', 'cl-comp-stent-thrombosis'],
        },
      ],
    },
  ],
};
