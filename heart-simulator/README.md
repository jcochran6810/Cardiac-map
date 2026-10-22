# CardioSim

An interactive cardiac teaching simulator: a 3D heart, a live 12-lead ECG and a
pressure–volume (Wiggers) model that all run from **one shared clock**, so the
P wave, atrial contraction, valve clicks, pressures and the 3D heartbeat stay in
step — plus a **case simulator** where you treat a patient and get a scored review.

## Navigation: one main menu, two sliding drawers

Everything starts from the **main menu**; the **Menu** button (top left) brings you back to it from anywhere.

| Screen | What it is |
| --- | --- |
| **Main menu** | Your role (and its scope of practice), search, **continue** where you left off (the item you were reading, a case in progress), the **case simulator**, every **library section** (conditions & rhythms, anatomy, coronary arteries, conduction system, drugs, procedures, cath lab catalog, case studies — each with how much you have studied), the **tools** (3D heart, 12-lead ECG, electrode lab, defibrillator, pressure & volume), guided starts (**Try this**), the quiz, the tutor, help and install. |
| **Reading** | The section's list and the item you picked (side by side on desktops; on tablets and phones the list and the item are separate pages, with **All …** back to the list). **12-lead EKG** at the bottom slides the ECG panel up (12-lead, Wiggers / PV, defibrillator, electrode lab, all their options) and **Hide EKG** slides it back down; **3D heart** at the top slides the heart down the same way. Drag a drawer's grip to resize it; ⤢ gives it the whole screen. A tool opened from the menu starts full screen; opening an item shrinks it so the reading shows. |
| **Case simulator** | Treat a patient case from first contact to hand-off (below). |

**A topic's page scrolls as one:** under **All …** come its section buttons (Overview, Signs & symptoms, ECG, Field
care, …; pinned while you scroll, one swipeable row on phones — a button jumps to its section), then the title with
its summary and the **Focus for your role** box — both fold away with a tap and stay folded on every page
(`useFold` in `RightPanel.tsx`) — then the section's text.

The top bar holds only **Menu**, **←** (Back), where you are, and search. Buttons in the reading open what they need
("Show the EKG", "Inspect lead V1", "Hemodynamics" slide the ECG up; "Show in 3D", "Culprit territory", a cath lab view
slide the heart down). Tapping the heart while the reading is out of sight shows a short card with **Read more**.
Opening a condition, a case study or a quiz strip shows its rhythm on every tracing at once — even while paused —
instead of sweeping in after the old one (`showRhythm` in `src/lib/rhythm.ts` rewrites the last 30 s); live changes
on a patient in the simulator or on the defibrillator still sweep in, as on a real monitor.
State: `heart` / `ecg` (`closed | open | full`) and `listOpen` in `src/store/useAppStore.ts`; menu and drawer actions
(`openCategory`, `openTool`, `showEcg`, `showHeart`, `showReading`) in `src/lib/actions.ts`; layout in
`src/components/AppShell.tsx` and `src/components/layout/DrawerBar.tsx`; the menu in `src/components/home/HomeScreen.tsx`.

**The phone's Back button stays inside the app** (`src/lib/backNav.ts`): every page — the screen, the library section and
the item being read, the list page on small screens, each drawer opening, the electrode lab, quiz / tutor / help, and the
simulator's case list → case → action list → review — is a browser history entry. Back returns to the previous page (so
it also slides a drawer you just opened away); closing something with its own button steps over its entry, so Back never
stalls; leaving a case in progress asks first; on the main menu the first Back says "press Back again to leave". The top
bar's **←** is the same button.

## Give a medication

`src/lib/sim/meds.ts` (drugs, doses, effects) · `src/store/useMedStore.ts` (the session on the clock) ·
`src/lib/ecg/mods.ts` (drug effects on each beat) · `src/components/meds/`

Every condition page has a **Give meds** section (also **Give a medication** under its title, and in the main
menu's Tools and Try this): set the
patient's weight, choose one of 18 drugs (antiarrhythmics and rate control, bradycardia and arrest drugs,
electrolytes, coronary care), choose or type a dose — weight-based doses show their mg/kg — and **Push**. The
12-lead slides up (if it is not showing) and the drug acts on the shared clock: adenosine in AVNRT reaches the heart in
~12 s, blocks the AV node (P waves, no QRS) and the SVT gives way to sinus rhythm; diltiazem slows AF over
minutes; procainamide widens the QRS and lengthens the QT as it loads; magnesium stops torsades but leaves the
long QT; calcium narrows a hyperkalaemic QRS; tenecteplase reperfuses a STEMI (AIVR, then ST resolution); 1 mg of
epinephrine IV with a pulse causes VT. Each dose and effect is marked on the strip, a bar above the ECG shows
what is happening and when the next change comes (**Skip ahead** brings slow effects forward in drug time while
the tracing keeps running in real time), the PR / QRS / QT readouts follow the drug, and the interpretation box
lists the changes. The tab then judges the choice of drug for this rhythm and the dose (low, usual, high,
overdose) with the reason. **Details** on the bar above the ECG brings the Give meds section back into view. The model is deterministic and shows the classic response (notes say where real patients differ);
doses follow the drug cards and current guidelines, adult only. Opening another condition starts a new patient.

## Case simulator

`src/lib/sim/scenario/` (engine, interventions, scenarios) · `src/store/useSimStore.ts` · `src/components/simulator/`

- **Every action in your scope is offered — right or wrong** (`interventions.ts`: ~130 actions tagged by role
  and setting, including the cath lab's views, catheters, guides, wires, balloons, stents, support devices,
  physiology and imaging, and lab drugs). Each one takes case time and changes the patient: the rhythm on the monitor and the live
  12-lead, the vitals, and the story (patient, partner, team, monitor, hospital).
- **The monitor starts unplugged**: the ECG, SpO₂ and capnography appear only once you attach them; the
  NIBP box shows the last blood pressure you took. Nothing reads the tracings for you: the monitor reports
  numbers, and rhythm changes come as a "monitor alarm".
- **You read every 12-lead, and the app checks it at once** (`reads.ts`): the app is self-paced — no
  instructor or preceptor is needed. After a paramedic, tech, nurse or cardiologist records a 12-lead, the
  case waits for their read, chosen from every interpretation the app can show (43, in four groups). The
  **Feedback** line in the case story answers at once: correct, partly right or not quite, with the
  explanation of the tracing. A misread costs 5 points (2 if partly right) and the review lists every read.
  EMTs acquire and transmit without reading.
- **In the cath lab you read more than the 12-lead:** pressures (a damped guide, LVEDP, right heart numbers
  in shock or RV infarction), FFR, stent sizing from QCA / IVUS, sudden changes (reperfusion reflex, radial
  spasm, perforation, tamponade, contrast reaction) and **real images**: every lab case shows its culprit
  artery **before and after it is opened** — both angiograms from the same patient's article (anterior and
  inferior STEMI, shock with an Impella, the FFR lesion and its stent, the perforation and its covered stent),
  and the FFR case the real pressure-wire console. You read each on the Imaging tab before you go on; what it
  shows (its caption) stays hidden until you have.
- **The cath lab works as a team** (`labKit.ts`): as the **tech**, the (computer) cardiologist asks for each
  catheter, guide, view, wire, balloon and stent and waits for the right one — a wrong one gets a word and
  costs points, one opened ahead of the request counts; as the **nurse**, the cardiologist orders drugs and
  you choose them (e.g. "something for the rate" → atropine, the hyperaemia dose of adenosine, IV cangrelor
  in shock); as the **cardiologist**, every choice is yours. The monitor draws the arterial pressure trace
  (ART) once the sheath is in and the transducers are zeroed — it flattens while a guide is wedged — and an
  **Imaging** tab lists every cine run
  with a C-arm diagram, its angles, what the view shows best and, where the app has one, the real image (tap to
  enlarge).
- **Events happen on time or because of what you did** (VF en route, heart block, a wedged catheter,
  reperfusion VF), built-in safety rules catch dangerous choices (shocking a patient with a pulse, arrest-dose
  epinephrine with a pulse, …), and teammates do the other roles' jobs in the cath lab.
- **The case ends by itself** once every critical step for your role is done (or the patient dies, or you end
  it). The review shows the score and grade, what to fix (harmful choices, missed and late steps — late
  counts half), what went well, your times against the goals and the teaching points. A **Hint** names the
  next critical step for 2 points. Best scores are kept on the device.
- **Cases:** field — anterior STEMI (EMT, paramedic) · inferior STEMI with RV infarction and heart block (EMT,
  paramedic) · complete heart block · unstable SVT · VF cardiac arrest (EMT, paramedic). Cath lab (tech, nurse,
  cardiologist) — anterior STEMI (damped guide, reperfusion VF) · inferior STEMI from the groin (Bezold–Jarisch
  reflex) · FFR- and IVUS-guided PCI (radial spasm) · cardiogenic shock (right heart numbers, Impella) ·
  coronary perforation and tamponade · contrast reaction. Tests play every case's ideal run for each role
  and its main traps (`tests/scenarios.test.ts`).
- The engine is pure and deterministic (`engine.ts`: `start`, `perform`, `takeHint`, `stop`, `review`), so a new
  case is one file in `scenarios/` plus a line in `scenarios/index.ts` and an ideal run in the tests.

## Cath lab catalog

`src/data/content/cathlab*.ts` (content) · `src/lib/cathlab/views.ts` (view angles) · main menu → **Cath lab catalog**

78 items in eleven groups — angiographic views, access and closure, catheters and guides, wires,
balloons and stents, physiology and intravascular imaging, mechanical support and pacing, pressures and
hemodynamics, lab drugs, complications, team and safety. Each item says what it is, the numbers to know,
pearls and pitfalls, and **what the tech, the nurse and the cardiologist each do with it** (your own role is
highlighted). A view shows the C-arm position, turns the 3D heart to that angle and lights up the arteries it
shows best. Each item links to the simulator cases that use it ("Practise it"). The simulator's case list
points lab roles to the catalog first. **Every item shows real images** (one to three) — angiograms in
labelled C-arm views, catheters, wires, balloons and stents on fluoroscopy, pressure tracings and consoles,
IVUS and OCT, echo and X-rays, complications, devices, the lab team and safety gear, drug vials (or what the
drug does on an angiogram or ECG) — each with what it shows, tap to enlarge, and its credit and licence
linked; captions say when an image comes from outside the cath lab. A test checks every link, every
simulator action and every standard view is covered (`tests/cathlab-catalog.test.ts`).

**Real images** (`public/cath-images/`, registered in `src/data/cathImages.ts`): 114 images — figures from
open-access journal articles (CC BY 4.0 / 3.0, each licence checked against the article's own licence text)
and Wikimedia Commons photos (CC BY / CC BY-SA / public domain, licence checked on the file page) — cropped
where noted, with author, source, licence link and source link. `alt` names only the
kind of image (it is read out while a learner is asked what the image shows). A test checks every file
exists at its stated size, is openly licensed and credited, and that every image a case or item uses exists.

## Roles and scope of practice

Pick a role on the main menu; all guidance, recommended tabs, quiz questions, case decisions and
monitor/defibrillator permissions stay inside that role's scope (`src/lib/scope.ts`):

| Role | Scope framework |
| --- | --- |
| EMT (NREMT, BLS) | National EMS Scope of Practice Model 2019 (NHTSA) + state/local protocols and medical direction |
| Paramedic (NREMT, ALS) | National EMS Scope of Practice Model 2019 (NHTSA) + state/local protocols and medical direction |
| Cath Lab Tech (RCIS) | RCIS credential, SCAI best-practices consensus (2021), state law and facility policy |
| Cath Lab Nurse (RN) | State Nurse Practice Act, Board of Nursing rulings and facility policy |
| Cardiologist | Licensure and hospital privileges — full technical depth |

## Run it

```bash
npm ci
npm run dev        # http://localhost:3000
npm run build && npm start   # production build
```

Checks (run before committing — `npm run check` runs all four):

```bash
npm run typecheck  # TypeScript
npm run lint       # ESLint (next lint)
npm test           # Vitest unit tests in tests/ — ECG lead maths, electrodes, rhythms, engine, hemodynamics, anatomy, scope
npm run build      # production build
```

Working with AI agents: the repo root has `CLAUDE.md` (the start/end-session protocol; Claude Code is
the lead), `AGENTS.md` (Codex, the UI / graphics agent), `fix_list.md` (open items, owner actions and
"For Codex" priorities) and `SESSION_LOG.md` (what each session shipped). Production is the
`main` branch ("end session" merges into it), live at https://cardiacmap.stationinsight.com.

## What's inside

| Area | Where | Notes |
| --- | --- | --- |
| ECG engine | `src/lib/ecg/` | Vector (dipole) model projected onto all 12 leads + right-sided/posterior leads, so axis, reciprocal ST change and R-wave progression come out of the physics rather than being drawn per lead. 49 rhythm/condition profiles (incl. PEA, pulseless VT, transcutaneous pacing, inferior STEMI with heart block and reperfused STEMI), Fridericia QTc. |
| Hemodynamics | `src/lib/physiology/hemodynamics.ts` | Beat-by-beat LV/aortic/LA pressure, LV volume and heart sounds (Frank–Starling filling, atrial kick, Windkessel aorta). Drives the Wiggers chart and PV loop. |
| Simulation clock | `src/lib/sim/simulation.ts`, `src/components/sim/SimulationDriver.tsx` | Single animation loop; pause, scrub and 0.1–1× speed. |
| 3D heart | `src/components/scene/`, `src/lib/scene/orbit.ts` | Standard gestures: one finger (left mouse button) turns it, pinch (wheel) zooms, two fingers (right button) pan; the same turn per pixel on every screen, smoothing per second, a tap picks a part without moving the camera (BVH hit-tests keep dragging smooth), the whole heart fits a tall phone view. Exterior, four-chamber section with blood flow, x-ray, conduction system and coronary territories. Contraction, depolarization wave and ischemia are shaded on the GPU from the live ECG. Selecting a lead (12-lead or electrode lab) draws its view line: from the (+) side, into the wall it faces and through the heart. |
| Anatomy map | `src/lib/anatomy/landmarks.ts` | Landmarks snapped to the model surface; clicking the heart opens the matching structure. |
| Teaching content | `src/data/content/`, `src/data/caseData.ts` | 62 structures, 42 conditions, 42 procedures, 38 medications, 9 branching cases, 66 quiz questions. Loaded on demand. |
| UI | `src/components/home/`, `src/components/layout/`, `src/components/ecg/`, `src/components/physiology/` | Main menu, top bar, library list and reading, the heart / EKG drawers, ECG (live 12-lead, printout, monitor, paper, inspect, calipers), Wiggers/PV loop, tutor, quiz. |
| Electrode lab | `src/lib/ecg/electrodes.ts`, `src/lib/ecg/leadViews.ts`, `src/lib/anatomy/humanBody.ts`, `src/components/ecg/ElectrodeLab.tsx`, `src/components/ecg/TorsoModel.tsx` | 10 electrodes on a 3D patient (an adult male body built from the CC0 MakeHuman mesh by `scripts/build-human-model.py`; limb electrodes on the shoulders and lower abdomen, Mason–Likar; the heart beats behind a window in the chest) → 12 leads (Einthoven / Goldberger / Wilson). Tap a lead or an electrode to see where that lead looks from; swap cables or try a "mystery reversal" and watch the live 12-lead change. |
| Activation map | `src/lib/anatomy/activation.ts` | Epicardial isochronal map of each beat (normal per Durrer 1970, LBBB, RBBB, WPW, pacing, PVC/VT), like an EP mapping system. The 3D wavefront follows it in every view. |
| Coronary territories | `src/lib/anatomy/aha17.ts`, `src/components/anatomy/Bullseye.tsx` | AHA 17-segment bull's-eye linked to the culprit artery; the angio panel shows the C-arm angle (LAO/RAO, CRA/CAU) of any view. |
| Monitor / defibrillator trainer | `src/lib/sim/defib.ts`, `src/components/monitor/` | Generic monitor with ECG, SpO₂ pleth, capnography and NIBP. Includes AED, manual defibrillation, synchronised cardioversion, transcutaneous pacing, CPR, ACLS drugs, a code record, scenarios, and trainee/instructor modes. Press **Projector** to mirror it at `/monitor` on a second screen. |

## Phones, tablets and desktops

The layout adapts to the screen (`src/lib/device.ts`, Tailwind `phone:` / `touch:` / `short:` variants):

| Screen | Layout |
| --- | --- |
| Desktop / laptop (≥ 1024 px) | The list and the reading side by side (drag the divider); the heart and EKG drawers span the width |
| Tablet | The list and the reading are separate pages; rarer ECG options under **More** |
| Phone, upright | As a tablet, with compact controls; the EKG drawer opens on the live 12-lead (3-lead one tap away) with ECG / Wiggers / Defibrillator tabs; interpretation slides over the tracing; the electrode lab and the defibrillator take the whole screen; in the simulator one button opens the action list |
| Phone, on its side | A drawer opens full screen; with both open the heart and the ECG sit side by side; the simulator shows the patient and the action list side by side |

On touch screens buttons get bigger, each drawer has a grip bar and an enlarge (⤢) button, a double-tap on
a lead inspects it, and Help lists the touch gestures.

## Install as an app (PWA)

CardioSim installs like a native app and keeps working offline after the first visit.

- **Android / Chrome / Edge:** tap **Install** (banner, main menu → **Install the app**, Help, or the browser menu → *Install app*).
- **iPhone / iPad:** in Safari tap **Share → Add to Home Screen** (the app shows these steps when you tap Install).
- **Desktop:** main menu → **Install the app**, or the install icon in the address bar.

Pieces: `public/manifest.webmanifest` (name, colours, icons, install screenshots), `public/sw.js` (offline cache:
pages network-first, build files and 3D models cache-first, one cache per release), `src/lib/pwa.ts` +
`src/components/ui/InstallApp.tsx` (registration and install buttons). Icons in `public/icons/`, `app/icon.png`
and `app/apple-icon.png` are generated from `assets/logo-source.webp`.

## Keyboard shortcuts

`Space` play/pause · `←/→` step · `[ ]` speed · `H` 3D heart drawer · `K` EKG drawer · `1–6` 3D view ·
`L` labels · `F` blood flow · `V` ECG vector · `E` ECG/Wiggers · `M` defibrillator · `Q` quiz ·
`T` tutor · `/` search · `?` help · `Esc` close. (The 3D and ECG keys work on the reading screen only.)

## Credits

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the open-source projects and publications
used to check accuracy, and for their licences.

## Accuracy note

Content was written and then reviewed against current AHA/ACC, ESC and ACLS
guidance. It is a teaching aid, not a clinical reference — always follow local
protocols and current guidelines for patient care.
