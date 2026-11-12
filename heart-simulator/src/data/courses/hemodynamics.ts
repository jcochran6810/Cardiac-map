import type { Course } from '@/types/course';

/**
 * Course: pressure, volume and heart sounds — reading the Wiggers diagram and the pressure–volume loop, then
 * what valve disease, heart failure, shock and abnormal rhythms each do to them. Written first for the cath
 * lab (tech, nurse, cardiologist); it builds on "How the heart works".
 *
 * The app's hemodynamic model is a teaching model whose values are retuned from time to time, so most steps
 * describe the pattern on screen and quote standard physiology values. A few quote what the model shows, as
 * measured on 2026-11-12 (re-check them after any retune): SVT at 240/min (stroke volume ~19 mL, cardiac
 * output ~4.6 L/min against ~4.9 at rest), complete heart block at 36/min (56–66 mL a beat, ~2.2 L/min) and
 * sinus tachycardia at 150/min (output well above the resting value). Thresholds follow the 2020 ACC/AHA
 * valvular heart disease guideline, the 2022 AHA/ACC/HFSA heart failure guideline and the 2024 AHA/ACC
 * hypertrophic cardiomyopathy guideline, and agree with the app's own library pages. Two statements rest on
 * single papers: tall v waves are neither sensitive nor specific for severe mitral regurgitation (Fuchs et al.,
 * Am J Cardiol 1982;49:849), and in complete heart block the stroke volume depends on where the atrial
 * contraction falls (Harley et al., J Clin Invest 1969;48:895). Educational content only.
 */
export const HEMODYNAMICS: Course = {
  id: 'hemodynamics',
  title: 'Pressure, volume and heart sounds',
  summary: 'Read the pressures inside the beating heart: the Wiggers diagram and the pressure–volume loop, then what valve disease, heart failure, shock and abnormal rhythms each do to them.',
  roles: [3, 4, 5],
  level: 'advanced',
  lessons: [
    // ─── 1 ───────────────────────────────────────────────────────────────
    {
      id: 'wiggers',
      title: 'Reading the Wiggers diagram',
      goal: 'Read a Wiggers diagram: name each phase, find the four valve events and the a, c and v waves, and place S1 and S2.',
      minutes: 9,
      steps: [
        {
          title: 'One heartbeat on one chart',
          text: [
            'The Wiggers diagram stacks everything that happens in one heartbeat on a single time axis. Time runs from left to right, and the newest moment is at the right edge.',
            'From the top: the ECG (lead II, in green). Then three pressures in mmHg: the aorta in red, the left ventricle in yellow and the left atrium in blue. Then the volume of the left ventricle in mL, in purple. Along the bottom are the heart sounds, drawn as a microphone on the chest would record them. All of it is the left side of the heart; the right side goes through the same steps at about a fifth of the pressure.',
            'Beside the chart, or under it on a narrow screen, is the pressure–volume loop. Leave it for the next lesson.',
          ],
          look: 'The chart runs at a quarter of real speed. Find the four rows: the green ECG; the red, yellow and blue pressure lines; the purple volume line; and the pale sound trace along the bottom.',
          show: { ecg: 'wiggers', heart: false, rhythm: 'normal-sinus', hr: 70, speed: 0.25 },
        },
        {
          title: 'A valve moves where two lines cross',
          text: [
            'Heart valves are passive flaps. A valve opens when the pressure behind it is higher than the pressure in front of it, and it shuts when that is reversed.',
            'So on this chart every valve event sits where two pressure lines cross. Yellow against blue is the mitral valve, which lies between the left atrium and the left ventricle. Yellow against red is the aortic valve, between the left ventricle and the aorta.',
            'The dashed lines mark the four crossings in each beat: MC (mitral closes), AO (aortic opens), AC (aortic closes) and MO (mitral opens). They always come in that order.',
          ],
          look: 'Pick one dashed line marked AO and look at the pressure lines on it: the rising yellow line is meeting the red line at that instant.',
          check: {
            kind: 'choice',
            question: 'The yellow line (left ventricle) has dropped below the blue line (left atrium). Which valve event is that?',
            options: ['The mitral valve opens', 'The mitral valve closes', 'The aortic valve opens', 'The aortic valve closes'],
            answer: 0,
            explain: 'Atrial pressure is now the higher of the two, so blood pushes the mitral valve open (MO) and filling begins. The mitral valve closes at the opposite crossing, when the yellow line climbs back above the blue one.',
          },
        },
        {
          title: 'MC: the mitral valve closes',
          text: [
            'Start at the QRS on the ECG. It is the signal for the ventricle to contract, and the pressure answers a moment later: the yellow line turns upward.',
            'As soon as it rises above the blue line the mitral valve shuts. That is MC, and it starts systole, the part of the beat in which the ventricle contracts. The mitral and tricuspid valves closing together make the first heart sound, S1.',
            'At this instant the ventricle is as full as it will get. Its volume is the end-diastolic volume (EDV), about 120 mL. Its pressure is the left ventricular end-diastolic pressure (LVEDP), normally 12 mmHg or less.',
          ],
          look: 'At each MC line look down the chart. The purple line is at its highest, and S1 is written on the sound trace. A faint red band starts here: it shades systole, from MC to AC.',
          more: ['cl-lvedp'],
        },
        {
          title: 'Isovolumetric contraction: MC to AO',
          text: [
            'Between MC and AO both valves of the left ventricle are closed. The muscle tightens around a fixed volume of blood, so the pressure shoots up while the volume cannot change. This is isovolumetric contraction ("iso" means same).',
            'It is short, about 0.05 s. In that time the pressure climbs from about 10 mmHg to about 80 mmHg, the pressure waiting on the other side of the aortic valve.',
            'The moment the yellow line reaches the red line, the aortic valve opens. That is AO.',
          ],
          look: 'Between MC and AO the yellow line is at its steepest, and the purple line below it stays flat.',
          check: {
            kind: 'choice',
            question: 'Between MC and AO, which valves of the left ventricle are open?',
            options: [
              'Neither: the mitral and aortic valves are closed',
              'The mitral valve only',
              'The aortic valve only',
              'The mitral and the aortic valve',
            ],
            answer: 0,
            explain: 'The mitral valve has shut and the aortic valve has not yet opened, so no blood can enter or leave: the pressure rises at a constant volume. The aortic valve opens only when ventricular pressure reaches aortic pressure, at AO.',
          },
        },
        {
          title: 'Ejection: AO to AC',
          text: [
            'With the aortic valve open, the ventricle and the aorta act as one chamber. The yellow and red lines rise together to a peak of about 120 mmHg, the systolic blood pressure, and the purple line falls as blood leaves.',
            'Ejection is fast at first and then slows: most of the blood leaves early. The T wave on the ECG appears during the slower second part, as the muscle begins to relax.',
            'A normal left ventricle ejects about 70 mL, the stroke volume, and keeps about 50 mL. What stays behind is the end-systolic volume (ESV).',
          ],
          look: 'Follow the purple line down from AO to AC: steep at first, then flatter. Above it the yellow and red lines travel together over the top.',
        },
        {
          title: 'AC: the aortic valve closes',
          text: [
            'As the ventricle relaxes, its pressure drops below the pressure in the aorta. Blood starts to fall back toward the ventricle and snaps the aortic valve shut. That is AC. It ends systole and starts diastole, the part of the beat in which the ventricle relaxes and fills. With the pulmonary valve closing at almost the same moment, it makes the second heart sound, S2.',
            'The closing valve leaves a small notch on the red line, the dicrotic notch. After it the aortic pressure drains away slowly toward about 80 mmHg, the diastolic blood pressure, while the yellow line plunges.',
            'From AC to MO both valves are closed again and the volume holds at the ESV. This is isovolumetric relaxation, about 0.08 s.',
          ],
          look: 'At each AC line find the small notch in the red line, with S2 written below it on the sound trace. After it the lines part: red drifts down, yellow drops steeply.',
          check: {
            kind: 'choice',
            question: 'On an arterial pressure tracing, what does the dicrotic notch mark?',
            options: ['The aortic valve closing', 'The aortic valve opening', 'The peak of ejection', 'The atria contracting'],
            answer: 0,
            explain: 'The notch is the brief dip as the aortic valve snaps shut, so it marks the end of ejection and the start of diastole. The valve opens earlier, at the foot of the upstroke. On a catheter tracing, a rounded wave that has lost its notch suggests damping: something at the catheter tip or in the line is blunting the signal.',
          },
          more: ['cl-aortic-waveform', 'cl-damped'],
        },
        {
          title: 'MO: filling and the volume curve',
          text: [
            'When the yellow line falls below the blue line, the mitral valve opens (MO), and the blood that has collected in the atrium pours into the ventricle.',
            'Read the purple line from MO onward. It climbs steeply (rapid filling), then almost levels off (slow filling, also called diastasis), then takes one last small step up after the P wave. That step is the atrial kick: the atrium contracting to top up the ventricle. At rest it adds roughly 20–30% of the filling.',
            'The top of the purple curve is the EDV and the bottom is the ESV. The drop between them is the stroke volume.',
          ],
          look: 'On the purple line find three parts between MO and the next MC: a steep climb, a nearly flat stretch, then a last small rise right after the P wave on the ECG.',
          check: {
            kind: 'choice',
            question: 'If the atria stopped contracting, which part of the purple curve would be lost?',
            options: [
              'The last small rise before MC',
              'The steep climb right after MO',
              'The nearly flat stretch in mid-diastole',
              'The fall between AO and AC',
            ],
            answer: 0,
            explain: 'The last rise is the atrial kick. The steep climb after MO is passive: blood that was already waiting in the atrium runs in as the ventricle relaxes. Atrial fibrillation takes the kick away, as you will see in the last lesson.',
          },
        },
        {
          title: 'The atrial line: a, c and v',
          text: [
            'The blue line is the pressure in the left atrium. It stays low, around 10 mmHg, and it makes three small waves in every beat.',
            'The a wave is the atrium contracting, right after the P wave. The c wave is a small bump at MC, as the closed mitral valve bulges back toward the atrium. The v wave is the slow rise through systole: blood keeps arriving from the lungs while the mitral valve is shut. It peaks at MO, then the pressure falls away as the atrium empties into the ventricle.',
            'In the cath lab the wedge pressure, taken with a balloon catheter in a branch of the pulmonary artery, is a slightly delayed and smoothed copy of this blue line.',
          ],
          look: 'Follow the blue line through one beat: a bump after the P wave (a), a small bump or shoulder at MC (c), then a slow climb to a peak at MO (v) and a quick fall.',
          check: {
            kind: 'choice',
            question: 'What makes the v wave on the atrial pressure line?',
            options: [
              'Blood from the lungs filling the atrium while the mitral valve is shut',
              'The atrium contracting',
              'The closed mitral valve bulging back as the ventricle starts to contract',
              'The aortic valve closing',
            ],
            answer: 0,
            explain: 'During systole the mitral valve is shut and blood keeps arriving from the lungs, so the atrial pressure climbs until the valve opens at MO. The atrium contracting makes the a wave, which is why atrial fibrillation has none. The bulging valve makes the c wave.',
          },
          roleNote: {
            3: 'Time the waves against the ECG. On a left atrial trace the a wave follows the P wave and the v wave peaks at the end of the T wave; on a wedge trace both come later, the a wave near the QRS and the v wave after the T wave. Record at end-expiration and report tall v waves to the operator.',
            5: 'The mean wedge pressure stands in for the LVEDP only when nothing lies between them: mitral stenosis and large v waves both make the wedge read higher than the LVEDP.',
          },
          more: ['left-atrium', 'cl-rhc'],
        },
        {
          title: 'Where S1 and S2 fall',
          text: [
            'The bottom trace turns the valve closures into sound. S1 falls at MC, the start of systole. S2 falls at AC, the end of it. At a resting rate the gap from S1 to S2 is shorter than the gap from S2 to the next S1, which is how you tell the two apart at the bedside.',
            'Valves opening are normally silent. So any extra sound, or any murmur (the noise of turbulent blood flow), can be placed with one question: does it fall between S1 and S2 (in systole), or between S2 and the next S1 (in diastole)?',
            'The heart is now on screen, cut open and beating at real speed. Its valves open and close at the same instants as the lines cross on the chart.',
          ],
          look: 'Switch on the sound: Heart sounds above the heart, or Listen next to the loop. On the heart, the cycle box shows the mitral and aortic valves changing between open and closed.',
          show: { heart: 'sectioned', flow: true, speed: 1, focus: 'heart' },
          check: {
            kind: 'tap',
            question: 'Tap a valve that makes S2 when it closes.',
            targets: ['aortic-valve', 'pulmonary-valve'],
            explain: 'S2 is the aortic and pulmonary valves closing at the end of ejection, at AC on the chart. The mitral and tricuspid valves closing make S1, at MC.',
          },
          more: ['aortic-valve', 'mitral-valve'],
        },
      ],
    },

    // ─── 2 ───────────────────────────────────────────────────────────────
    {
      id: 'pv-loop',
      title: 'The pressure–volume loop',
      goal: 'Read a pressure–volume loop: name its sides and corners, measure stroke volume and ejection fraction, and predict how preload, afterload and contractility move it.',
      minutes: 9,
      steps: [
        {
          title: 'The same beat, drawn as a loop',
          text: [
            'The Wiggers chart plots pressure and volume against time. The pressure–volume loop (PV loop) leaves time out and plots them against each other: the volume of the left ventricle along the bottom, its pressure up the side.',
            'One heartbeat is one lap of the loop, traveled counterclockwise. The white dot is the ventricle at this instant. Every point on the loop is a moment you already know from the chart.',
            'The loop has four sides and four corners. Each side is a phase of the beat. Each corner is a valve opening or closing.',
          ],
          look: 'The loop is beside the chart, or under it on a narrow screen. Follow the white dot for one lap: along the bottom to the right, up the right side, back across the top to the left, and down the left side.',
          show: { ecg: 'wiggers', heart: false, rhythm: 'normal-sinus', hr: 70, speed: 0.25 },
        },
        {
          title: 'The bottom side: filling',
          text: [
            'Start at the bottom-left corner. The mitral valve has opened (MO on the chart) and the volume is at its lowest: the end-systolic volume (ESV), about 50 mL.',
            'The dot now moves to the right along the bottom as the ventricle fills. The volume rises a lot. The pressure hardly rises at all, because a healthy, relaxed ventricle stretches easily. How easily a chamber stretches is its compliance.',
            'At the bottom-right corner the mitral valve closes (MC). This corner is end-diastole. How far across it sits is the end-diastolic volume (EDV), about 120 mL. How high it sits is the LVEDP, the filling pressure.',
          ],
          look: 'Watch the dot crawl along the bottom of the loop from left to right while the purple line climbs on the chart. The bottom side is long and nearly flat.',
          check: {
            kind: 'choice',
            question: 'In another patient the bottom-right corner sits higher than normal, but no further to the right. What does that tell you?',
            options: [
              'The ventricle is stiff: it needs more pressure to take in the same volume',
              'The ventricle is holding more blood than normal',
              'The ventricle is ejecting more blood than normal',
              'The pressure in the aorta is higher than normal',
            ],
            answer: 0,
            explain: 'The height of this corner is the pressure at the end of filling (LVEDP). The same volume at a higher pressure means a stiffer, less compliant ventricle. More blood in the ventricle would move the corner to the right. Aortic pressure shows at the top of the loop, not at the bottom.',
          },
        },
        {
          title: 'The right side: pressure without flow',
          text: [
            'At the bottom-right corner the ventricle starts to contract with both of its valves shut. The volume cannot change, so the dot climbs straight up. This vertical side is isovolumetric contraction.',
            'The climb ends at the top-right corner, where the pressure in the ventricle reaches the pressure in the aorta, about 80 mmHg, and the aortic valve opens (AO).',
          ],
          look: 'The dot runs up the right side quickly. On the chart this is the short gap between the MC and AO lines.',
        },
        {
          title: 'The top and the left side',
          text: [
            'With the aortic valve open the dot travels to the left across the top. The volume falls as blood is ejected, while the pressure rises to its peak, about 120 mmHg, and then starts to fall.',
            'At the top-left corner the aortic valve closes (AC). This corner is end-systole: the ventricle is as empty as it will get, at the ESV.',
            'Then the dot drops straight down the left side, isovolumetric relaxation, back to the bottom-left corner. The mitral valve opens and the next lap begins.',
          ],
          look: 'Top side: the dot moves from right to left over a rounded hump. Left side: it falls straight down. One full lap is one heartbeat.',
          check: {
            kind: 'choice',
            question: 'Which side of the loop is ejection?',
            options: [
              'The top, traveled from right to left',
              'The bottom, traveled from left to right',
              'The right side, traveled upward',
              'The left side, traveled downward',
            ],
            answer: 0,
            explain: 'During ejection the volume falls while the pressure stays high, so the dot moves left across the top. The bottom is filling. The two vertical sides are the isovolumetric phases, when the pressure changes and the volume does not.',
          },
        },
        {
          title: 'Four corners, four valve events',
          text: [
            'Put the corners together in the order the dot meets them. Bottom-right: the mitral valve closes. Top-right: the aortic valve opens. Top-left: the aortic valve closes. Bottom-left: the mitral valve opens.',
            'Between the corners, one valve of the left ventricle is open along the top and one along the bottom. Along the two vertical sides both are shut.',
          ],
          look: 'The cut-open heart beats at a quarter of real speed. In the cycle box on the heart, the two valve rows between them change from open to closed or back four times in each beat: once for each corner of the loop.',
          show: { heart: 'sectioned', flow: true, focus: 'heart' },
          check: {
            kind: 'tap',
            question: 'Tap the valve that opens at the top-right corner of the loop.',
            targets: ['aortic-valve'],
            explain: 'The top-right corner is AO: the pressure in the ventricle has reached the pressure in the aorta, the aortic valve opens and ejection begins. The mitral valve closed one corner earlier, at the bottom right.',
          },
        },
        {
          title: 'Width is stroke volume',
          text: [
            'The width of the loop runs from the ESV at its left edge to the EDV at its right edge. That width is the stroke volume: the blood ejected in one beat, about 70 mL.',
            'Divide it by the EDV and you have the ejection fraction (EF): the share of the full ventricle that is ejected. 70 ÷ 120 is about 58%. Normal is 55–70%, and 40% or less is reduced.',
            'The area inside the loop is the work the ventricle does in one beat. A taller or wider loop costs the muscle more oxygen.',
          ],
          look: 'The numbers next to the loop give EDV / ESV and EF, averaged over the beats of the last few seconds. Check them against the right and left edges of the loop on its volume scale.',
          show: { heart: false },
          check: {
            kind: 'choice',
            question: 'A loop has its right edge at 150 mL and its left edge at 60 mL. What is the ejection fraction?',
            options: ['40%', '60%', '67%', '90%'],
            answer: 1,
            fixed: true,
            explain: 'Stroke volume is 150 − 60 = 90 mL, and EF = 90 ÷ 150 = 60%, which is normal. 40% is the share that stays behind (60 ÷ 150), and 90 is the stroke volume in mL, not a percentage. EF is always the stroke volume as a fraction of the full ventricle, the EDV.',
          },
        },
        {
          title: 'Preload: how full',
          text: [
            'Three things set the shape of the loop. The first is preload: how much the ventricle is stretched at the end of filling. The EDV, or the LVEDP, stands in for it.',
            'More filling moves the bottom-right corner to the right. A stretched ventricle contracts harder (the Frank–Starling law), so it ejects the extra blood: the loop widens and the stroke volume rises. Less filling does the opposite.',
            'Here the model has raised the heart rate to 180 a minute and changed nothing else (in a real patient a fast rate usually comes with a stronger squeeze as well). There is less time to fill, so there is less preload.',
          ],
          look: 'Compare with the loop a moment ago: the right side has moved to the left and the loop is narrower. The left side has hardly moved. In the numbers, EDV has fallen and ESV has not.',
          show: { rhythm: 'sinus-tachycardia', hr: 180 },
          check: {
            kind: 'choice',
            question: 'A patient loses blood, so the ventricle fills less. If nothing else changes, what happens to the loop?',
            options: [
              'Its right side moves left and it narrows: the stroke volume falls',
              'Its left side moves right and it narrows: the ventricle empties less',
              'It grows taller at the same width',
              'Its bottom rises at the same volumes',
            ],
            answer: 0,
            explain: 'Less preload means a smaller EDV, so the right side moves left, and by the Frank–Starling law the stroke volume falls. A left side that moves right means the ventricle cannot empty: a weak muscle or a high afterload. A raised bottom means a stiff ventricle.',
          },
        },
        {
          title: 'Afterload: how hard to eject',
          text: [
            'The second is afterload: the load the ventricle has to push against to get blood out. In practice it is the pressure in the aorta, plus anything that narrows the way out.',
            'More afterload makes the loop taller, because the ventricle must reach a higher pressure to eject. It also cannot empty as far, so the left side moves right and the stroke volume falls, unless the muscle answers with more force.',
            'This ventricle faces a narrowed aortic valve, the subject of the next lesson. The valve opens at the usual pressure, but the top of the loop then bulges far above it. The muscle has thickened to keep the stroke volume up, and it pays in work: look at the area of the loop.',
          ],
          look: 'Read the pressure scale at the side of the loop: the top now climbs far above the 120 mmHg of a normal ventricle. The width is about the same. Every beat takes much more work.',
          show: { rhythm: 'aortic-stenosis' },
          check: {
            kind: 'choice',
            question: 'A patient\'s blood pressure rises sharply, and the heart cannot contract any harder. What happens to the stroke volume?',
            options: [
              'It falls: the ventricle cannot empty as far against the higher pressure',
              'It rises: a higher pressure drives more blood out',
              'It stays the same: stroke volume depends only on filling',
              'It rises: the ventricle fills more',
            ],
            answer: 0,
            explain: 'More afterload leaves more blood behind at the end of systole: the ESV rises and the stroke volume falls. The pressure that rose is the one the ventricle works against, not one that helps it. This is why lowering the blood pressure lets a weak ventricle eject more.',
          },
        },
        {
          title: 'Contractility: how strong',
          text: [
            'The third is contractility: the strength of the muscle itself, at any given filling and load. Epinephrine and other inotropes (drugs that strengthen contraction) raise it. A heart attack, cardiomyopathy (disease of the heart muscle) and some drugs lower it.',
            'Contractility sets how far the ventricle can empty, so it moves the top-left corner. A stronger ventricle empties further: the left side moves left and the loop widens. A weaker one leaves more behind: the left side moves right, and the stroke volume and EF fall.',
            'A weak ventricle then holds on to more blood and enlarges, and the whole loop slides to the right. This is a failing, dilated left ventricle. You will meet it again in the lesson on heart failure.',
          ],
          look: 'The loop is back at real speed. It has moved far to the right and it is narrow. Read EDV / ESV and EF next to it: both volumes are large and the EF is low.',
          show: { rhythm: 'hfref', speed: 1 },
          check: {
            kind: 'choice',
            question: 'Four loops are compared with a normal one. Which one shows reduced contractility?',
            options: [
              'Its left side has moved right: a larger ESV and a lower EF',
              'Its right side has moved left: a smaller EDV',
              'It is taller, with the same width',
              'Its bottom is higher at the same volumes',
            ],
            answer: 0,
            explain: 'A weak muscle cannot empty the ventricle, so the end-systolic corner moves right and the EF falls. A right side that has moved left is low preload. A taller loop of normal width is a high afterload met by a strong muscle. A raised bottom is a stiff ventricle.',
          },
          roleNote: {
            5: 'Two curves bound every loop: the end-diastolic pressure–volume relation along the bottom (stiffness) and the end-systolic relation through the top-left corner. The slope of the second, end-systolic elastance, measures contractility largely independently of load.',
          },
          more: ['left-ventricle', 'left-heart-cath'],
        },
      ],
    },

    // ─── 3 ───────────────────────────────────────────────────────────────
    {
      id: 'valves',
      title: 'Narrowed valves, leaking valves and HCM',
      goal: 'Recognize aortic stenosis, mitral regurgitation, mitral stenosis and obstructive hypertrophic cardiomyopathy from their pressure tracings and murmurs.',
      minutes: 10,
      steps: [
        {
          title: 'Aortic stenosis: the gradient',
          text: [
            'An open, healthy valve is no obstacle: the pressure is the same on both sides of it. A narrowed (stenotic) valve resists flow, so pressure builds up behind it. The pressure difference across the valve is called the gradient, and it is how narrowing is measured.',
            'In aortic stenosis the aortic valve is stiff and narrow, in older adults most often from calcium. All through ejection the left ventricle (yellow) has to run far above the aorta (red). The gap between the two lines is the gradient.',
            'Stenosis is severe when the mean gradient is 40 mmHg or more, or the jet through the valve reaches 4 m/s on echocardiography (ultrasound of the heart). The valve area is then usually 1.0 cm² or less; a normal valve opens to 3–4 cm².',
          ],
          look: 'Between AO and AC the yellow line now towers over the red line. In a normal heart the two travel together. The gap opens at the start of ejection and lasts to the end of it.',
          show: { ecg: 'wiggers', heart: false, rhythm: 'aortic-stenosis', speed: 0.5 },
          roleNote: {
            3: 'Record left ventricular and aortic pressure at the same time and on the same scale, with both lines zeroed and leveled. The mean gradient is the average gap across ejection; with the cardiac output it gives the valve area (Gorlin formula).',
            5: 'The peak-to-peak gradient compares two peaks that occur at different instants; the mean gradient is the one that matches Doppler. When flow is low (stroke volume index under 35 mL/m²), severe stenosis can produce a mean gradient under 40 mmHg.',
          },
          more: ['aortic-stenosis', 'left-heart-cath'],
        },
        {
          title: 'Aortic stenosis: a slow pulse and a systolic murmur',
          text: [
            'Now look at the red line by itself. Blood squeezes through the narrow valve slowly, so the aortic pressure rises slowly and peaks late. At the carotid artery in the neck this is felt as a weak, slow-rising pulse: pulsus parvus et tardus, Latin for small and late.',
            'The jet through the valve is turbulent and noisy. The murmur starts after S1, swells to a peak and fades before S2: a crescendo–decrescendo systolic murmur, harsh, loudest at the upper right edge of the breastbone and carried up into the neck.',
            'As the stenosis gets worse the murmur peaks later and S2 gets softer. An S4, a soft extra sound right before S1, can appear as the atrium pushes blood into the thick, stiff ventricle.',
          ],
          look: 'Red line: a slow climb to a low, rounded, late peak; the two BP numbers sit close together. Sound trace: a diamond-shaped burst of noise between S1 and S2, and an S4 (in amber) before S1. Press Listen next to the loop to hear them.',
          check: {
            kind: 'choice',
            question: 'At what point in the beat does the gradient of aortic stenosis exist?',
            options: [
              'During ejection only, from AO to AC',
              'During filling only, from MO to MC',
              'Throughout the whole beat',
              'Only in the second half of systole',
            ],
            answer: 0,
            explain: 'The aortic valve carries flow only while it is open, from AO to AC, and the gradient is there for all of that time. A gradient during filling belongs to the mitral valve. One that is missing at the start of ejection and grows late in systole points to an obstruction below the valve. That pattern comes later in this lesson.',
          },
        },
        {
          title: 'What the pressure does to the wall',
          text: [
            'A ventricle that works against a high pressure for years thickens its wall, like any trained muscle. This is left ventricular hypertrophy (LVH), and it shows on the ECG.',
            'More muscle draws taller QRS complexes in the leads that face the left ventricle, and deeper ones in V1 and V2. Later the ST segment sags and the T wave turns over in the lateral leads (I, aVL, V5 and V6). That is the strain pattern.',
            'The thick wall is stiff. It needs a well-filled ventricle and an atrial kick at the right moment. That is why a patient with severe aortic stenosis tolerates fluid loss, a vasodilator (a drug that widens the blood vessels, such as nitroglycerin) or new atrial fibrillation so badly.',
          ],
          look: 'This is the 12-lead of the same patient. Compare the height of the QRS in V5 and V6 with its depth in V1 and V2, then look at the ST segment and the T wave in the lateral leads.',
          show: { ecg: 'ecg', layout: 'simultaneous', speed: 1 },
          check: {
            kind: 'lead',
            question: 'Tap a lateral lead that shows the strain pattern: a sagging ST segment with an inverted T wave.',
            targets: ['I', 'aVL', 'V5', 'V6'],
            explain: 'I, aVL, V5 and V6 face the thick left ventricle. In LVH with strain they show a tall R wave followed by a downsloping ST segment and an inverted T wave. V1 and V2 show the mirror image: a deep S wave with an upright T wave.',
          },
          roleNote: {
            1: 'A patient with a known tight aortic valve who faints or has chest pain on effort: keep them at rest, and do not assist with nitroglycerin unless medical direction approves.',
            2: 'Severe aortic stenosis depends on preload: nitrates, sedatives and fluid loss can drop the pressure sharply. Follow protocol and medical direction on nitroglycerin.',
            4: 'Sedation and vasodilators can drop the pressure quickly in severe aortic stenosis. Give them only as ordered, watch the arterial pressure closely and report a fall early.',
          },
          more: ['aortic-stenosis', 'aortic-valve', 'tavr'],
        },
        {
          title: 'Mitral regurgitation: the tall v wave',
          text: [
            'In mitral regurgitation (MR) the mitral valve does not seal. Each time the ventricle contracts, part of the blood goes backward into the left atrium instead of forward into the aorta.',
            'During systole the atrium is already filling from the lungs. The extra blood arriving from below drives its pressure up steeply, and the v wave becomes tall and peaked.',
            'A tall v wave suggests MR. It does not prove it or grade it. A large, stretched atrium in long-standing MR can take up the leak with hardly any v wave, and a stiff atrium can make a tall one with no leak at all.',
          ],
          look: 'Watch the blue line during systole. Instead of a gentle rise it climbs to a tall peak at MO, then collapses as the mitral valve opens.',
          show: { ecg: 'wiggers', rhythm: 'mitral-regurgitation', speed: 0.5 },
          check: {
            kind: 'choice',
            question: 'A wedge pressure tracing shows tall v waves. What is the soundest conclusion?',
            options: [
              'Mitral regurgitation is suspected; it has to be confirmed and graded another way',
              'Severe mitral regurgitation is proven',
              'Mitral regurgitation is ruled out',
              'The transducer was not zeroed',
            ],
            answer: 0,
            explain: 'Mitral regurgitation is the most common cause of tall v waves, but they are neither sensitive nor specific for a severe leak. A compliant atrium can hide one. A stiff atrium, heart failure, mitral stenosis or a hole in the ventricular septum can produce tall v waves without one. Echocardiography grades the leak.',
          },
          roleNote: {
            3: 'Tall v waves on a wedge or left atrial trace: record them, measure the height of the v wave and the mean, and report them to the operator. During edge-to-edge repair, record left atrial pressure before and after each clip.',
          },
          more: ['mitral-regurgitation', 'mitraclip-teer'],
        },
        {
          title: 'Mitral regurgitation: a volume load',
          text: [
            'Aortic stenosis is a pressure load. Mitral regurgitation is a volume load: the blood that leaked back returns on the next beat, on top of the normal inflow. The ventricle has to hold more, and over months to years it enlarges.',
            'Look at the loop. It is wide: its right side has moved far to the right. That side also leans to the left, because the ventricle starts to empty into the atrium the moment it contracts, before the aortic valve has opened. The left side leans too: the leak goes on as the ventricle relaxes, until the mitral valve opens. There is no true isovolumetric contraction or relaxation.',
            'The ejection fraction looks healthy, but part of it goes the wrong way. Only the forward stroke volume reaches the body. When a severe leak comes from disease of the valve itself (primary MR), an EF of 60% or less already means the muscle is weakening.',
          ],
          look: 'Next to the loop, compare the total stroke volume (EDV minus ESV) with the forward stroke volume (Fwd SV). The difference is the blood that leaked back. The sound trace shows a murmur from S1 right through to S2.',
          check: {
            kind: 'choice',
            question: 'A patient with severe primary mitral regurgitation has an EF of 55%. How should that number be read?',
            options: [
              'As a warning: with a severe leak the EF should be above 60%',
              'As normal: 55% is inside the normal range',
              'As meaningless: EF cannot be measured when a valve leaks',
              'As high: a leak always pushes the EF above 70%',
            ],
            answer: 0,
            explain: 'A leaking mitral valve gives the ventricle an easy, low-pressure way out, so a healthy muscle empties very well and the EF runs high. In severe primary MR an EF of 60% or less means the ventricle is already failing, and it is one of the triggers for valve surgery.',
          },
        },
        {
          title: 'Mitral stenosis: a gradient in diastole',
          text: [
            'Mitral stenosis (MS) is a narrowed mitral valve, most often a late result of rheumatic fever. A normal mitral valve opens to 4–6 cm². At 1.5 cm² or less the stenosis is severe.',
            'The obstruction is now on the way into the ventricle, so the gradient appears in diastole. Normally the blue and yellow lines run together while the ventricle fills. Here the atrium (blue) stays well above the ventricle (yellow) from MO right through to MC.',
            'The ventricle itself is spared: it is small or normal, and its filling pressure is normal or low. The high pressure is behind the valve, in the left atrium and the lungs. The tethered leaflets open with a sharp sound shortly after S2, the opening snap, followed by a low rumbling murmur through diastole.',
          ],
          look: 'From MO to MC the blue line stays above the yellow line and the gap never closes. The purple line climbs slowly, with no fast early filling, until the atrial kick adds a last rise. OS (opening snap) is marked after S2. LA mean reads high, LVEDP low.',
          show: { rhythm: 'mitral-stenosis', hr: 70 },
          check: {
            kind: 'choice',
            question: 'In mitral stenosis, where is the pressure high?',
            options: [
              'In the left atrium and the lungs, behind the narrowed valve',
              'In the left ventricle at the end of filling',
              'In the aorta during ejection',
              'In all four chambers equally',
            ],
            answer: 0,
            explain: 'Pressure builds up behind an obstruction, so it is high in the left atrium and the lungs. The left ventricle, beyond the valve, fills at a normal or low pressure. This is one of the few times the wedge pressure and the LVEDP disagree: the difference between them is the gradient.',
          },
        },
        {
          title: 'Why a fast rate makes mitral stenosis worse',
          text: [
            'A narrow valve needs time. At rest there is a long diastole for blood to pass through. When the heart speeds up, diastole shortens far more than systole, and the same blood has to cross in less time.',
            'To push blood through faster the atrial pressure must rise, and steeply: the gradient goes up with the square of the flow rate. The pressure backs up into the lungs and the patient becomes breathless.',
            'So anything that raises the heart rate can tip a stable patient into pulmonary edema (fluid in the lungs): exercise, fever, pregnancy, and above all atrial fibrillation with a fast ventricular rate, which also takes away the atrial kick.',
          ],
          look: 'The rate has gone from 70 to 130 a minute. The gap between the blue and yellow lines in diastole is wider, the blue line sits higher all through the beat (read LA mean), and the purple line reaches a lower peak before MC.',
          show: { hr: 130 },
          check: {
            kind: 'choice',
            question: 'Why does a fast heart rate raise the left atrial pressure in mitral stenosis?',
            options: [
              'Diastole is too short for blood to cross the narrow valve, so pressure builds up in the atrium',
              'The left ventricle becomes stiffer at fast rates',
              'Systole becomes shorter, so the mitral valve leaks',
              'The aortic pressure rises and backs up into the atrium',
            ],
            answer: 0,
            explain: 'A fast rate takes its time out of diastole, the only part of the beat in which blood can cross the mitral valve. The same flow in less time needs a much higher driving pressure. The ventricle and the aorta are not the problem, which is why slowing the rate brings the pressure down.',
          },
          roleNote: {
            2: 'Mitral stenosis with fast atrial fibrillation can cause sudden pulmonary edema. Avoid fluid loading, follow protocol or medical direction for rate control, and cardiovert if the patient is unstable.',
            3: 'Record the wedge (or left atrial) pressure and the left ventricular pressure together for the mean mitral gradient, and note the heart rate with it: the gradient means little without the rate.',
            4: 'Give rate-control drugs and diuretics only as ordered. Report a rising heart rate, new breathlessness or a falling saturation early: in mitral stenosis a fast rate is what brings on pulmonary edema.',
            5: 'By the Gorlin relation the gradient varies with the square of the flow per second of diastole, so report it with the heart rate and cardiac output. Severity is defined by valve area (1.5 cm² or less), not by the gradient.',
          },
          more: ['mitral-stenosis', 'bmv'],
        },
        {
          title: 'Obstructive HCM: a gradient that grows',
          text: [
            'Hypertrophic cardiomyopathy (HCM) is an inherited thickening of the heart muscle, usually greatest in the septum. In the obstructive form the thick septum and the front leaflet of the mitral valve crowd the path out of the ventricle, below the aortic valve.',
            'The aortic valve itself is normal, so ejection starts freely: yellow and red rise together. Then, as the ventricle empties and the path narrows, the leaflet is drawn against the septum. The yellow line pulls away from the red, and the gradient peaks late in systole. The pulse has an early spike, then a lower dome.',
            'This gradient is dynamic. It grows when the ventricle is smaller or contracts harder: with dehydration, vasodilators, standing up or straining. A gradient of 30 mmHg or more, at rest or provoked, defines obstruction.',
          ],
          look: 'Slowed to a quarter of real speed. At AO the yellow and red lines leave together. Then the red line peaks early and sags, while the yellow line keeps climbing to a late peak far above it.',
          show: { rhythm: 'hcm', speed: 0.25 },
          check: {
            kind: 'choice',
            question: 'Aortic stenosis and obstructive HCM both make a systolic gradient. What separates them on simultaneous pressures?',
            options: [
              'In HCM the two lines start together and separate later; in aortic stenosis they are apart from the start',
              'In HCM the gradient appears in diastole',
              'In HCM the aortic pressure is higher than the ventricular pressure',
              'Nothing: the two tracings are identical',
            ],
            answer: 0,
            explain: 'A fixed, narrowed valve obstructs from the first instant of ejection. In HCM the obstruction develops as the ventricle empties, so the gradient appears late and the aortic pressure peaks early and then dips. Both gradients are systolic; a diastolic gradient is mitral stenosis.',
          },
          roleNote: {
            2: 'Known or suspected obstructive HCM: avoid nitroglycerin and other vasodilators, and treat low blood pressure with fluid per protocol.',
            3: 'For a gradient study, record left ventricular and aortic pressure together and keep recording through any extra beat: the beat after a PVC is the one the operator wants to see.',
            4: 'Dehydration, vasodilators, sedation and a fast heart rate all make the obstruction worse. Keep the ordered IV fluids running, clarify any nitrate or inotrope order with the physician, and report a falling pressure early.',
            5: 'Brockenbrough–Braunwald–Morrow sign: on the beat after a PVC the gradient rises and the aortic pulse pressure falls, where in fixed stenosis the pulse pressure rises. Septal reduction is considered at 50 mmHg or more with drug-refractory symptoms.',
          },
          more: ['hcm', 'interventricular-septum', 'alcohol-septal-ablation'],
        },
        {
          title: 'Two questions for any gradient',
          text: [
            'Ask two things of any pressure gradient. Between which two pressures is it? And when in the beat?',
            'Ventricle above aorta, all through ejection: aortic stenosis. Ventricle above aorta, growing late in systole: obstructive HCM. Atrium above ventricle, all through diastole: mitral stenosis. A tall v wave with no gradient across the open valve: think of mitral regurgitation.',
            'One valve problem has no tracing in this app: a leaking aortic valve (aortic regurgitation). Its mark is on the aortic line in diastole. Blood runs back into the ventricle, so the pressure falls fast to a low diastolic value, and the gap between systolic and diastolic pressure is wide.',
          ],
          look: 'The heart is on screen now, cut open and beating normally. Use the name tags, or turn the heart, to find the valve.',
          show: { rhythm: 'normal-sinus', hr: 70, heart: 'sectioned', flow: true, speed: 1, focus: 'heart' },
          check: {
            kind: 'tap',
            question: 'Tap the valve that is narrowed when left atrial pressure stays above left ventricular pressure all through diastole.',
            targets: ['mitral-valve'],
            explain: 'The mitral valve lies between the left atrium and the left ventricle and is open in diastole. A pressure difference across it while it is open means it is narrowed: mitral stenosis. A gradient across the aortic valve would appear in systole.',
          },
          more: ['mitral-valve', 'aortic-valve', 'valve-surgery'],
        },
      ],
    },

    // ─── 4 ───────────────────────────────────────────────────────────────
    {
      id: 'failure-and-shock',
      title: 'Heart failure, shock and a squeezed heart',
      goal: 'Tell reduced from preserved ejection fraction heart failure, and cardiogenic shock from tamponade and a large pulmonary embolism, by volume, filling pressure and heart sounds.',
      minutes: 9,
      steps: [
        {
          title: 'Two questions: how full, at what pressure',
          text: [
            'Every heart in this lesson can be sorted with two questions about the left ventricle at the end of filling. How much blood does it hold (the EDV)? And at what pressure (the LVEDP, the filling pressure)?',
            'Those are the two coordinates of the bottom-right corner of the PV loop. In a healthy heart the corner sits near 120 mL, at 12 mmHg or less.',
            'A high filling pressure backs up through the left atrium into the lungs and makes the patient breathless. A low stroke volume leaves the body short of blood. Heart failure is one of these, or both.',
          ],
          look: 'A normal heart. Find the bottom-right corner of the loop: how far across it sits is the EDV, and how high it sits is the LVEDP. Both have their own number next to the loop. Every loop in this lesson is compared with this one.',
          show: { ecg: 'wiggers', heart: false, rhythm: 'normal-sinus', hr: 70, speed: 0.5 },
        },
        {
          title: 'Reduced ejection fraction: large, weak and full',
          text: [
            'In heart failure with reduced ejection fraction (HFrEF) the muscle is weak: after a large heart attack, in a dilated cardiomyopathy (a stretched, weak heart muscle), or after years of overload. The EF is 40% or less.',
            'A weak ventricle leaves most of its blood behind, so the ESV is large. It then fills on top of that, so the EDV is larger still, and over time the chamber enlarges. The loop is narrow and far to the right, and its bottom-right corner sits high: the filling pressure is raised.',
            'The stretched ventricle often pulls the mitral valve apart as well, so that it leaks. This is functional mitral regurgitation: the leaflets are normal and the ventricle is the cause.',
          ],
          look: 'Loop: narrow, far to the right, bottom-right corner raised. Numbers: large volumes, a low EF and a high LVEDP, both in red. On the chart the purple line rides high and gives up only a small part of its height with each beat.',
          show: { rhythm: 'hfref' },
          check: {
            kind: 'choice',
            question: 'Compare the EDV and ESV next to the loop with a normal 120 mL and 50 mL. What has happened to them?',
            options: [
              'Both are larger, and the ESV has risen more',
              'Both are smaller',
              'The EDV is larger and the ESV is normal',
              'The ESV is larger and the EDV is normal',
            ],
            answer: 0,
            explain: 'A weak ventricle cannot empty, so the ESV rises first. The EDV rises as well as the chamber enlarges, but by less, so the stroke volume and the EF fall. A large EDV with a normal ESV would be a strong ventricle handling extra volume, not a failing one.',
          },
          roleNote: {
            3: 'For a right heart study in heart failure, zero and level with care and record the right atrial, pulmonary artery and wedge pressures with the cardiac output. Tell the operator at once about hypotension, falling saturation or ventricular tachycardia.',
            4: 'These patients may not tolerate lying flat. Assess breathlessness before positioning, give diuretics only as ordered, and escalate a falling saturation, a falling pressure or a new arrhythmia.',
          },
          more: ['hfref', 'dilated-cardiomyopathy'],
        },
        {
          title: 'S3: the sound of a full ventricle',
          text: [
            'Listen early in diastole, shortly after S2. As the mitral valve opens, blood rushes into a ventricle that is already full and comes up hard against its limit. That makes a low thud, the third heart sound, S3.',
            'S1, S2 and S3 together have the rhythm of the word Ken-tuc-ky. In an adult over about 40 an S3 points to an enlarged, overloaded ventricle with a high filling pressure. In children and young adults it can be normal.',
            'It is soft and low-pitched: heard best at the apex with the bell of the stethoscope, with the patient turned onto the left side.',
          ],
          look: 'On the sound trace an amber S3 marks a small low burst shortly after each S2, a little past the MO line. Press Listen next to the loop: the text under the button names each sound you hear, including the murmur of the leaking mitral valve.',
          check: {
            kind: 'choice',
            question: 'Where in the cycle does an S3 fall?',
            options: [
              'Early in diastole, shortly after S2, during rapid filling',
              'Late in diastole, right before S1, with the atrial kick',
              'In mid-systole, between S1 and S2',
              'At the same instant as S1',
            ],
            answer: 0,
            explain: 'S3 is made by rapid early filling into a ventricle that is already full, so it follows S2 closely. A sound late in diastole, right before S1, is an S4, which comes from the atrial kick. Sounds between S1 and S2 belong to systole.',
          },
        },
        {
          title: 'Preserved ejection fraction: small, stiff and tight',
          text: [
            'About half of all patients with heart failure have an ejection fraction of 50% or more: heart failure with preserved ejection fraction (HFpEF). The contraction is not the problem. The filling is. (An EF of 41–49% lies between the two groups and is called mildly reduced.)',
            'The wall is thick and stiff, often after years of high blood pressure. It will not stretch to take in blood at a low pressure. The volume is normal or small, but the pressure needed to reach it is high, and that pressure backs up into the lungs.',
            'On the loop, stiffness shows along the bottom. The filling side curves upward, and the bottom-right corner sits high without being pushed to the right.',
          ],
          look: 'Width, position and EF are close to normal. The loop is tall because this patient has high blood pressure. The telling difference is the bottom-right corner, which sits high: LVEDP is in red. The a wave on the blue line is taller than normal.',
          show: { rhythm: 'hfpef' },
          check: {
            kind: 'choice',
            question: 'Read the EF next to the loop, and the height of the loop\'s bottom-right corner. Which pair describes this heart?',
            options: [
              'EF normal, filling pressure high',
              'EF low, filling pressure high',
              'EF normal, filling pressure normal',
              'EF low, filling pressure low',
            ],
            answer: 0,
            explain: 'A normal EF with a high filling pressure is the signature of a stiff ventricle. A low EF with a high filling pressure is HFrEF. A normal EF does not mean a normal heart: these patients are every bit as breathless.',
          },
          roleNote: {
            3: 'HFpEF is often confirmed in the lab. Record the wedge pressure at end-expiration, at rest and, for an exercise study, at every stage.',
            5: 'Invasive confirmation: a wedge pressure of 15 mmHg or more at rest, or 25 mmHg or more on exercise.',
          },
          more: ['hfpef', 'right-heart-cath'],
        },
        {
          title: 'S4: the atrium against a stiff wall',
          text: [
            'A stiff ventricle fills poorly without help, so it leans on the atrial kick. The atrium contracts hard and drives blood into a wall that will not give. That makes the fourth heart sound, S4, late in diastole, right before S1.',
            'S4, S1 and S2 together have the rhythm of the word Ten-nes-see. An S4 means a stiff ventricle: long-standing high blood pressure, aortic stenosis, hypertrophic cardiomyopathy, or the first hours of a heart attack.',
            'An S4 needs an atrial contraction, so it cannot exist in atrial fibrillation. And when one of these patients goes into atrial fibrillation, the lost kick can bring on sudden pulmonary edema.',
          ],
          look: 'On the sound trace an amber S4 marks a small low burst right before each S1, after the P wave on the ECG. Press Listen next to the loop to hear it.',
          check: {
            kind: 'choice',
            question: 'A patient with a loud S4 goes into atrial fibrillation. What happens to the S4?',
            options: [
              'It disappears: there is no atrial contraction to make it',
              'It gets louder: the atrium is working harder',
              'It moves to early diastole and becomes an S3',
              'Nothing: an S4 does not depend on the rhythm',
            ],
            answer: 0,
            explain: 'S4 is the sound of atrial contraction filling a stiff ventricle. In atrial fibrillation the atria do not contract, so there is nothing to make it. An S3 has a different cause, rapid early filling of an overloaded ventricle, and can be heard in any rhythm.',
          },
        },
        {
          title: 'Cardiogenic shock: the pump cannot keep up',
          text: [
            'Cardiogenic shock is pump failure so severe that the organs are no longer supplied. The usual cause is a large heart attack or the last stage of chronic heart failure.',
            'The picture is HFrEF taken to the limit, with one new feature: the blood pressure has fallen. The stroke volume is so small that the pulse pressure (systolic minus diastolic) is narrow, and the heart races to make up the output. The filling pressure is very high, so the lungs flood while the body goes short: cold and wet.',
            'The working definition: a systolic pressure under 90 mmHg for 30 minutes, or drugs or a pump needed to hold it there, with signs that the organs are short of blood (cold skin, confusion, little urine, a rising lactate). Measured, the cardiac index (the output per minute, scaled to body size) is under 2.2 L/min/m² and the wedge pressure is over 15 mmHg.',
          ],
          look: 'The red line sits low and its swing from trough to peak is smaller than normal. The rate is fast. Next to the loop the values past a danger line are in red: the blood pressure, the MAP, the cardiac output, the EF, the LVEDP and the LA mean.',
          show: { rhythm: 'cardiogenic-shock' },
          check: {
            kind: 'choice',
            question: 'Which finding separates cardiogenic shock from shock caused by blood or fluid loss?',
            options: [
              'The filling pressure: high in cardiogenic shock, low after blood or fluid loss',
              'The blood pressure: low only in cardiogenic shock',
              'The heart rate: fast only after blood or fluid loss',
              'The cardiac output: low only in cardiogenic shock',
            ],
            answer: 0,
            explain: 'Both have a low blood pressure, a fast heart rate and a low output. The difference is in front of the pump: a failing ventricle is overfilled (cold and wet), an empty circulation is underfilled (cold and dry). That decides whether fluid helps or harms.',
          },
          roleNote: {
            2: 'Cardiogenic shock: withhold nitrates, give small fluid boluses only if the lungs are clear, start a vasopressor per protocol, and notify a PCI center early.',
            3: 'In a shock case record the full set together: right atrial, pulmonary artery and wedge pressures, cardiac output and the pulmonary artery saturation. Report a falling pressure or a new arrhythmia at once.',
            4: 'Trend the mean arterial pressure, urine output, mental state and lactate, and titrate vasopressors or inotropes only as ordered to the prescribed target. Escalate a rising pressor need immediately.',
            5: 'Cardiac power output (MAP × CO ÷ 451) under 0.6 W carries a poor prognosis. Stage with SCAI A–E and phenotype with invasive hemodynamics.',
          },
          more: ['cardiogenic-shock', 'cl-shock-profiles', 'cl-cardiac-output', 'impella-placement'],
        },
        {
          title: 'Tamponade: high pressure, little volume',
          text: [
            'In cardiac tamponade, fluid or blood collects in the pericardium, the sac around the heart, and squeezes the heart from outside. The chambers cannot expand to fill.',
            'The result looks like a contradiction. The filling pressure reads high, yet the ventricle is small and underfilled. The pressure comes from the fluid outside the wall, not from blood stretching it. The loop is tiny, pushed to the left and lifted off the floor, and the output is low.',
            'With so little room the two ventricles compete. On each breath in, the right side fills more and the left side less, so the systolic pressure dips with inspiration. A fall of more than 10 mmHg is called pulsus paradoxus. In a large collection the heart also swings to and fro from beat to beat, so the height of the QRS alternates: electrical alternans.',
          ],
          look: 'A small loop, far to the left, raised off the bottom: a high LVEDP with a small EDV. A fast rate, a narrow pulse. Over several beats the red peaks sink and rise again with breathing, by more than 10 mmHg. On the ECG every other QRS is smaller.',
          show: { rhythm: 'tamponade', speed: 1 },
          check: {
            kind: 'choice',
            question: 'A loop is small, shifted to the left, and its bottom sits at a high pressure. Which condition fits?',
            options: [
              'Cardiac tamponade',
              'Heart failure with reduced EF',
              'Heart failure with preserved EF',
              'Blood loss',
            ],
            answer: 0,
            explain: 'A small volume at a high pressure means the heart is being squeezed from outside. HFrEF has a high pressure with a large volume. HFpEF has a high pressure with a normal volume and a normal stroke volume. Blood loss gives a small volume at a low pressure.',
          },
          roleNote: {
            1: 'Low blood pressure, distended neck veins and a fast pulse after chest trauma or a recent heart procedure: request ALS and transport rapidly. If you must ventilate, use gentle, low-volume breaths.',
            2: 'Suspect tamponade with hypotension, distended neck veins and a fast pulse. A fluid bolus per protocol is a bridge only, and positive-pressure ventilation can make it worse.',
            3: 'During a procedure, a falling arterial pressure with a rising right atrial pressure and a heart border that stops moving on fluoroscopy: tell the operator at once and open the pericardiocentesis tray.',
            4: 'Hypotension, a rising heart rate or restlessness during or after a procedure: escalate immediately. Give fluids and reversal agents only as ordered.',
          },
          more: ['cardiac-tamponade', 'pericardiocentesis', 'cl-comp-tamponade'],
        },
        {
          title: 'Pulmonary embolism: the left heart runs dry',
          text: [
            'A large pulmonary embolism (PE) is a clot blocking the arteries of the lungs. The damage is on the right side: the thin-walled right ventricle suddenly faces a high resistance, strains and swells.',
            'This chart shows only the left heart, and the left heart is a bystander. Little blood gets through the lungs to reach it, and the swollen right ventricle pushes the septum over into its space. The left ventricle is underfilled.',
            'So the loop is small and shifted to the left, as in tamponade, and the output is about as low, but the loop lies on the floor: the left-sided filling pressure is low. All the high pressure is upstream of the clot, in the pulmonary artery, the right ventricle and the right atrium.',
          ],
          look: 'A small loop, shifted to the left, with a fast rate. Compare the height of its bottom side with the last heart: this time the loop sits on the floor of the chart, and the LVEDP reads low.',
          show: { rhythm: 'pulmonary-embolism' },
          check: {
            kind: 'choice',
            question: 'Tamponade and a large PE both leave the left ventricle small and underfilled. What separates them on the left-sided pressures?',
            options: [
              'The filling pressure: high in tamponade, low in a large PE',
              'The heart rate: fast only in tamponade',
              'The stroke volume: low only in a large PE',
              'Nothing: the left-sided pressures are the same',
            ],
            answer: 0,
            explain: 'In tamponade the fluid around the heart raises every diastolic pressure, left and right. In a large PE the block is in the lungs, so the pressure is high only upstream of it and the left heart is empty at a low pressure. Both are fast, and both have a low stroke volume.',
          },
          roleNote: {
            2: 'A large PE: small, cautious fluid boluses only, a vasopressor per protocol for persistent hypotension, and avoid intubation if possible.',
            3: 'For catheter-directed treatment, record the pulmonary artery and right ventricular pressures before and after, and report hypotension, desaturation, bradycardia or arrhythmia immediately.',
          },
          more: ['pulmonary-embolism', 'right-ventricle', 'catheter-directed-thrombolysis'],
        },
        {
          title: 'Five hearts on one map',
          text: [
            'Place each condition by the bottom-right corner of its loop. Far to the right and high: a weak, enlarged ventricle (HFrEF and, at its worst, cardiogenic shock). Normal volume but high: a stiff ventricle (HFpEF).',
            'To the left and high: a heart squeezed from outside (tamponade). To the left and low: a heart that is not being supplied, because of a block upstream in the lungs (a large PE) or because the body is short of blood.',
            'The filling pressure tells you how the lungs are doing. The stroke volume and the blood pressure tell you how the body is doing.',
          ],
          look: 'The heart is on screen now, cut open, in a normal rhythm. Use the name tags, or turn the heart, to find the chamber.',
          show: { rhythm: 'normal-sinus', hr: 70, heart: 'sectioned', flow: true, focus: 'heart' },
          check: {
            kind: 'tap',
            question: 'Tap the chamber that strains and swells first in a large pulmonary embolism.',
            targets: ['right-ventricle'],
            explain: 'The clot raises the resistance in the lung arteries, and the right ventricle is the chamber that has to pump against it. Its thin wall is built for low pressure, so it dilates and fails. The left ventricle suffers second, from lack of filling.',
          },
          more: ['cl-shock-profiles', 'cl-rhc'],
        },
      ],
    },

    // ─── 5 ───────────────────────────────────────────────────────────────
    {
      id: 'rhythm-and-pressure',
      title: 'What rhythm does to pressure',
      goal: 'Predict what atrial fibrillation, a fast rate, a PVC and complete heart block do to filling, stroke volume and the pulse.',
      minutes: 8,
      steps: [
        {
          title: 'Three things every beat needs',
          text: [
            'In a regular sinus rhythm every beat gets the same deal: the same time to fill, an atrial kick at the right moment, and a signal that spreads through the ventricle by the fast conduction system. So every beat ejects the same stroke volume and every pulse feels the same.',
            'Change the rhythm and you change one or more of those three. This lesson takes four rhythms and shows what each one does to the pressures.',
          ],
          look: 'A normal rhythm at 70 a minute. Notice how alike the beats are: the same peak on the red line, the same top and bottom on the purple line, and a small a wave on the blue line before every beat.',
          show: { ecg: 'wiggers', heart: false, rhythm: 'normal-sinus', hr: 70, speed: 0.5 },
        },
        {
          title: 'Atrial fibrillation: no a wave, no kick',
          text: [
            'In atrial fibrillation (AF) the atria quiver and do not contract. On the ECG there are no P waves. On the pressure chart the a wave is gone from the blue line, and the last small step up on the volume curve, the atrial kick, is gone with it.',
            'A healthy ventricle fills well enough without the kick. A stiff ventricle (aortic stenosis, HCM, HFpEF) or one behind a narrowed mitral valve does not: its filling pressure rises and its output falls.',
          ],
          look: 'Blue line: no bump before the QRS, only the c and v waves. Purple line: after a long gap it rises after MO and then flattens, with no last step up before MC. ECG: no P waves, and uneven gaps between the beats.',
          show: { rhythm: 'atrial-fibrillation', hr: 110 },
          check: {
            kind: 'choice',
            question: 'Why does new atrial fibrillation hit a patient with a stiff left ventricle so hard?',
            options: [
              'A stiff ventricle depends on the atrial kick to finish filling',
              'Atrial fibrillation weakens the contraction of the ventricle itself',
              'Atrial fibrillation narrows the aortic valve',
              'Atrial fibrillation always slows the heart rate',
            ],
            answer: 0,
            explain: 'A stiff ventricle takes in little blood passively, so the atrial kick supplies a large share of its filling. Lose the kick and the stroke volume drops while pressure backs up into the lungs. The ventricle contracts as well as before; the trouble is what reaches it, and the rate is usually faster, not slower.',
          },
        },
        {
          title: 'Atrial fibrillation: every beat a different size',
          text: [
            'The AV node lets the chaotic atrial signals through at irregular intervals, so every beat has a different time to fill. After a long gap the ventricle is well filled and ejects a large stroke volume. After a short gap it is half full and ejects a small one.',
            'The pulse therefore varies in strength as well as in timing. The weakest beats may not reach the wrist at all. Then the heart rate counted at the chest or on the monitor is higher than the pulse counted at the wrist. The difference is the pulse deficit.',
          ],
          look: 'Compare neighboring beats. After a long gap the purple line starts higher and falls further, and the red line makes a bigger jump from trough to peak. After a short gap both are small.',
          check: {
            kind: 'choice',
            question: 'On this tracing, which beats eject the largest stroke volume?',
            options: [
              'Beats that follow a long gap',
              'Beats that follow a short gap',
              'Beats with the tallest QRS',
              'None: every beat ejects the same',
            ],
            answer: 0,
            explain: 'A long gap gives more time to fill, a larger EDV and, by the Frank–Starling law, a larger stroke volume. After a short gap the ventricle has hardly refilled. The height of the QRS says nothing about how much blood the beat moves.',
          },
          roleNote: {
            1: 'With an irregular pulse, count for a full minute and report it as irregular. The pulse at the wrist can be slower than the heart is beating.',
            2: 'In fast atrial fibrillation the monitor rate and the pulse you feel can differ: report both. An unstable patient is cardioverted per protocol.',
            4: 'In atrial fibrillation every beat has a different pressure, so a single cuff reading can mislead. Repeat it, and follow the trend.',
          },
          more: ['atrial-fibrillation', 'cardioversion'],
        },
        {
          title: 'A fast rate takes its time from diastole',
          text: [
            'Cardiac output is heart rate times stroke volume. Speeding up is the quickest way for the heart to pump more, and up to a point it works.',
            'But a faster beat does not shorten evenly. Systole shortens somewhat; diastole takes most of the cut. At 70 a minute about 60% of each beat is diastole. At 150 it is about half.',
            'The first part to go is the slow middle of filling, which adds little. So in a healthy heart the stroke volume falls a little and the output still rises. The coronary arteries also feed the left ventricle mainly in diastole, so a heart with narrowed coronary arteries feels the loss sooner.',
          ],
          look: 'Sinus tachycardia at 150 a minute. On the purple line the flat stretch is gone: fast filling runs straight into the atrial kick. The peak before MC is a little lower than it was at 70, but CO next to the loop is far higher.',
          show: { rhythm: 'sinus-tachycardia', hr: 150 },
          check: {
            kind: 'choice',
            question: 'When the heart rate rises from 70 to 150 a minute, which part of the beat shortens the most?',
            options: [
              'Diastole, the time for filling',
              'Systole, the time for ejection',
              'Isovolumetric contraction',
              'None: every part shortens by the same share',
            ],
            answer: 0,
            explain: 'Ejection needs a certain time whatever the rate, so systole shortens less and diastole gives up most of the time. That costs filling time and, because the left ventricle is fed mainly in diastole, coronary flow as well.',
          },
        },
        {
          title: 'Too fast to fill',
          text: [
            'Go faster still and rapid filling itself is cut short. Each beat now starts with a ventricle that is far from full, and the stroke volume drops faster than the rate rises. The output stops rising, then falls.',
            'This is a supraventricular tachycardia (a fast rhythm that starts above the ventricles) at 240 a minute. Each beat ejects so little that the aortic pressure barely moves: a narrow pulse pressure and a weak, thready pulse. The atria also contract at the wrong moment, against closed valves, so there is no atrial kick.',
            'At 150 a minute this heart pumped far more than at rest; at 240 it pumps a little less than at rest. Hearts with a stiff ventricle, a narrowed mitral or aortic valve or coronary disease reach the turning point at much lower rates.',
          ],
          look: 'Purple line: small, shallow swings; the ventricle never gets near full. Red line: a narrow ripple in place of a full pulse. Blue line: a spike in every systole, the atrium contracting against a closed valve. Read CO next to the loop.',
          show: { rhythm: 'avnrt', hr: 240 },
          check: {
            kind: 'choice',
            question: 'At rest a heart beats 70 times a minute and ejects 70 mL per beat. In this tachycardia at 240 a minute it ejects about 19 mL per beat. What has happened to the cardiac output?',
            options: [
              'It is a little lower than at rest: about 4.6 L/min against 4.9',
              'It has more than tripled, because the rate has more than tripled',
              'It has risen by about half',
              'It has fallen to almost nothing',
            ],
            answer: 0,
            explain: '70 × 70 mL is 4.9 L/min. 240 × 19 mL is about 4.6 L/min, as the CO next to the loop shows. More than three times the rate does not help when each beat carries barely a quarter as much. With so little in each beat the pulse is weak, and in a patient the blood pressure often falls with the output.',
          },
          roleNote: {
            2: 'A tachycardia with hypotension, altered mental status, signs of shock, ischemic chest pain or acute heart failure is unstable: synchronized cardioversion per protocol.',
          },
          more: ['sinus-tachycardia', 'avnrt'],
        },
        {
          title: 'A PVC: a weak beat, then a strong one',
          text: [
            'A premature ventricular contraction (PVC) is a beat that starts early, from a spot in the ventricle. It is weak for two reasons. It comes before the ventricle has refilled. And its signal spreads slowly through muscle, not through the fast conduction system, so the walls contract out of step.',
            'After the PVC there is a pause. The next sinus P wave still comes on time, but it finds the conduction system and the ventricle still recovering and is not conducted, so nothing happens until the one after it. The ventricle has extra time to fill, and the muscle contracts harder after an early beat. The beat that ends the pause is stronger than normal: a bigger stroke volume and a bigger pulse.',
            'Patients often feel that strong beat, not the PVC, as a thump or a skipped beat. At the wrist the PVC itself may not be felt at all.',
          ],
          look: 'Every fourth beat is an early, wide QRS. Under it the red line makes only a small bump and the purple line dips far less than usual. The beat after the pause starts highest on the purple line, falls furthest and makes the tallest red peak.',
          show: { rhythm: 'pvcs' },
          check: {
            kind: 'choice',
            question: 'A patient has a PVC after every normal beat (bigeminy). The monitor counts 80 a minute. What might you count at the wrist?',
            options: ['About 20 a minute', 'About 40 a minute', 'About 80 a minute', 'About 160 a minute'],
            answer: 1,
            fixed: true,
            explain: 'If the PVCs are too weak to reach the wrist, only every second beat is felt: about 40 a minute. The monitor counts electrical complexes, not beats that move blood. When the two disagree, the pulse tells you what the body is receiving.',
          },
          roleNote: {
            3: 'Catheters cause PVCs. A pressure taken on a PVC, or on the beat after it, does not represent the patient: mark extra beats and measure from regular sinus beats.',
            5: 'The beat after a PVC is a free provocation: in fixed aortic stenosis the gradient and the pulse pressure both rise; in obstructive HCM the gradient rises and the pulse pressure falls.',
          },
          more: ['pvcs'],
        },
        {
          title: 'Complete heart block: the atrium against a closed valve',
          text: [
            'In complete (third-degree) heart block no atrial signal reaches the ventricles. The atria keep their own pace, about 75 a minute. A backup pacemaker below the block drives the ventricles much more slowly: 40–60 a minute from the AV junction, or 20–40 from the ventricle itself, as here. The two are no longer coordinated.',
            'So the atrial contraction lands anywhere in the ventricle\'s cycle. When it falls late in diastole it helps filling, as it should, and that beat ejects a little more: the stroke volume and the pulse change from beat to beat. When it falls during systole the atrium contracts against a closed mitral valve: nothing moves forward, and the atrial pressure spikes.',
            'The same happens on the right side against the tricuspid valve. There the spike travels back into the neck veins, where it can be seen as an occasional large pulsation: a cannon a wave.',
          ],
          look: 'The P waves march on at about twice the rate of the wide QRS complexes. A P wave in diastole leaves a small bump on the blue line; one between MC and MO throws up a tall spike. A QRS that follows a P wave at about the usual PR distance peaks higher.',
          show: { rhythm: 'third-degree-avb' },
          check: {
            kind: 'choice',
            question: 'A tall spike appears on the atrial pressure trace during ventricular systole, on some beats and not on others. What made it?',
            options: [
              'The atrium contracted while the mitral valve was closed',
              'The mitral valve leaked',
              'The ventricle contracted twice',
              'The atrium failed to contract',
            ],
            answer: 0,
            explain: 'With the valve shut, the blood the atrium squeezes has nowhere to go, so the pressure spikes: a cannon a wave. It comes and goes as the P waves drift through the cycle. The v wave of a leaking mitral valve is different: it builds through systole on every beat.',
          },
        },
        {
          title: 'Slow beats cannot carry the output',
          text: [
            'Now think about what the slow rate does. The long pause lets the ventricle fill completely, so each beat could be a large one. But a backup beat, called an escape beat, that starts in the ventricle spreads slowly through muscle, like a PVC, and wastes part of that filling. (A narrow escape from the AV junction uses the normal wiring and squeezes like a normal beat.) And the aorta drains for a long time between beats, so the diastolic pressure runs low.',
            'Even a near-normal stroke volume cannot make up for so few beats. At 36 a minute, about 60 mL per beat gives only about 2.2 L/min (36 × 60 mL), less than half of normal. The patient is weak, dizzy or faint, and the answer is to restore the rate, usually with pacing.',
          ],
          look: 'The cut-open heart is on screen at real speed. Watch the atria and the ventricles contract on separate schedules. In the cycle box the mitral and tricuspid valves stay open all through the long pause.',
          show: { heart: 'sectioned', flow: true, speed: 1, focus: 'heart' },
          check: {
            kind: 'tap',
            question: 'Tap the valve the left atrium is contracting against when a cannon wave appears on the left atrial trace.',
            targets: ['mitral-valve'],
            explain: 'The mitral valve is the door between the left atrium and the left ventricle, and it is shut all through ventricular systole. An atrial contraction that falls in that time meets a closed door. On the right side the same thing happens at the tricuspid valve.',
          },
          roleNote: {
            2: 'Complete heart block with poor perfusion: transcutaneous pacing per protocol. Confirm that each paced beat makes a pulse, at the femoral artery or on the pulse-oximeter waveform, not from the monitor alone.',
            3: 'Have the temporary pacing wire and generator ready and tested. Once pacing starts, watch the arterial pressure trace to confirm that every paced beat produces a pulse.',
            4: 'Keep the pacing pads on, trend the blood pressure and level of consciousness, and give atropine or start an infusion only as ordered.',
          },
          more: ['third-degree-av-block', 'temporary-pacing', 'pacemaker-implantation'],
        },
      ],
    },
  ],
};
