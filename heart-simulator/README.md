# CardioSim — Cardiac Education, Simulation & Training Platform

A browser-based cardiac simulator: an interactive 3D heart, a physiologically driven 12-lead ECG, live hemodynamics, and knowledge bases for anatomy, conditions, procedures, medications and clinical cases — all synchronised to one shared cardiac cycle and adapted to five learning levels (EMT → Interventional).

## Run it

```bash
cd heart-simulator
npm install
npm run dev        # http://localhost:3000
```

Production build:

```bash
npm run build && npm start
```

### Optional: Claude-powered tutor

The 🎓 Tutor answers from the built-in knowledge base by default (fully offline). To let Claude generate answers grounded in that knowledge base, copy `.env.example` to `.env.local` and set:

```
ANTHROPIC_API_KEY=sk-ant-...
```

The tutor header shows **Claude** when the key is active and **offline** otherwise.

## What's in the app

| Area | What it does |
|---|---|
| **3D heart** | Realistic model with hover identification, selectable structures, camera presets (anatomic and angiographic views), dissection/view modes, conduction arrows, lead-axis lines. Contraction, activation glow and conduction arrows are driven by the same beat clock as the ECG. |
| **12-lead ECG** | Synthesised beat-by-beat at 25 mm/s and 10 mm/mV on a real ECG grid. Rhythm scheduler reproduces irregular AF, Wenckebach PR prolongation with dropped beats, Mobitz II, complete AV dissociation, PVCs with compensatory pauses, flutter waves, VF and torsades. Regional STEMI/ischaemia patterns appear in the correct leads with reciprocal changes. Click a lead to see its axis on the heart; drag to scrub; double-click to resync. |
| **Hemodynamics panel** | Live LV/aortic/LA pressure and LV volume curves for the current beat with a cursor synced to the ECG playhead, valve open/closed states, EF, stroke volume and cardiac output. Presets change with the selected condition (aortic stenosis gradient, MR, heart failure, tamponade, shock...). |
| **Conditions (36)** | Rhythm disorders, AV blocks, bundle branch blocks, ventricular arrhythmias, ischaemia/MI, cardiomyopathies, heart failure, valvular, pericardial and congenital disease. Each has 13 tabs (overview → teaching), a per-level summary, affected anatomy highlighted in 3D, and links to related procedures and drugs. Selecting a condition sets the ECG rhythm, heart rate and hemodynamic preset. |
| **Procedures (42)** | Cath lab, EP, structural, vascular, surgical and emergency procedures with indications, anatomy, equipment, ECG considerations, complications and a **step player** — each step highlights its anatomy target and flies the camera to the relevant view. |
| **Medications (38)** | Antiplatelets through myosin inhibitors: mechanism, indications, ACLS use, dosing, contraindications, side effects, ECG and hemodynamic effects, monitoring and interactions. |
| **Cases (9)** | Clinical scenarios with vitals, history and exam. The **Simulate** tab turns each case into a scored, step-by-step decision exercise with feedback on pitfalls and a debrief. |
| **Compare mode** | Toggle **Compare**, pick a second condition, and its ECG overlays the first in blue. |
| **AI tutor** | Context-aware: knows what you have selected and answers "explain this", "treatment?", "dose?" etc. at your learning level. Includes a quiz mode. Claude-backed when a key is configured. |
| **Learning level** | EMT, Paramedic, ED/ICU, Cardiology, Interventional. Tab order and summaries adapt; progress across the catalogue is saved in the browser. |

## Project layout

```
app/                      Next.js app router (page, layout, API routes)
  api/tutor/route.ts      Claude tutor backend (optional)
src/components/
  scene/                  3D heart (HeartScene), view toolbar, dissection controls, hemodynamics overlay
  ecg/                    ECG canvas renderer
  layout/                 TopBar, LeftPanel (navigation), RightPanel (info), BottomDock (ECG + controls)
  cases/                  Interactive case simulator
  tutor/                  Tutor panel
src/lib/
  physiology/cycleTiming  Shared cardiac cycle timing (single source of truth)
  physiology/cardiacCycle Pressure/volume hemodynamics engine
  ecg/waveformEngine      Beat morphology + rhythm scheduler
  tutor/tutorEngine       Offline knowledge-base tutor
src/data/                 Knowledge bases (conditions, procedures, medications, cases, structures, navigation)
src/store/                Zustand stores (app, scene, timeline, ECG, condition, procedure, pharmacology, case, learning, tutor)
public/models/            Heart GLB models
```

## Notes

- Educational simulation only — not for clinical diagnosis or treatment. Doses are reference values; local protocols apply.
- Progress (viewed topics, case scores, quiz attempts) is stored in `localStorage` under `cardiosim-progress`.
