# Fix list

Outstanding fixes, TODOs, and known issues for CardioSim. The SessionStart hook tells every session
to read this file; the end-session protocol updates it (CLAUDE.md, step 4).

Add new items at the top of their group. Use the format:

- [ ] YYYY-MM-DD — short description (file_path:line if relevant)

## Open

### Owner actions (dashboard steps — code can't do these)

- [ ] 2026-10-22 — **Try Give meds on your phone:** Menu → **Give a medication** (opens SVT with the 12-lead up)
  → Adenosine → 6 mg → **Push**, then watch the 12-lead pause and return to sinus (**Skip ⏩** speeds it up). Any
  condition's **Give meds** section works the same way. Tested only in an emulated phone browser.
- [ ] 2026-10-22 — **Delete the branch `ccr-fcd6b419-beq5mr`** (optional tidy-up): all of its work has now shipped.
  GitHub → `jcochran6810/Cardiac-map` → Branches → trash icon next to it.
- [ ] 2026-10-22 — **Try the 3D heart and the topic pages on your phone:** one finger turns the heart, pinch zooms,
  two fingers pan, a tap opens a part's card; on a condition page scroll to the bottom, use the section buttons
  under "All conditions", and fold the summary / Focus boxes. Tested only in an emulated phone browser.
- [ ] 2026-10-22 — **Try the new navigation on your phone:** Menu (top left) → a section → a topic; tap
  **12-lead EKG** at the bottom (slides up) and again (slides down); tap **3D heart** at the top (slides down) and
  again; use your phone's Back button — it slides an open drawer away first. Turn the phone on its side with both
  open (they sit side by side). Tested only in emulated phone, tablet and desktop browsers.

- [ ] 2026-10-18 — **Narrow the environment's network access again (recommended).** It is set to **Full**
  (any website), which was used to fetch the cath lab images. Allowing only what this project needs is
  safer: in the Claude app open this session's cloud environment menu (the environment name in the session's
  title bar) → **Edit** → **Network access** → **Limited** (called **Custom** in older versions of the app) →
  keep "Allow package managers" ticked → under **Allowed domains** add `commons.wikimedia.org`, `upload.wikimedia.org`, `openi.nlm.nih.gov`,
  `pmc.ncbi.nlm.nih.gov`, `pubmed.ncbi.nlm.nih.gov`, `eutils.ncbi.nlm.nih.gov`,
  `pmc-oa-opendata.s3.amazonaws.com` (full-size PMC figures), `www.ebi.ac.uk` (licence checks) and
  `api.crossref.org` → save. Steps: https://code.claude.com/docs/en/cloud-environments#network-access.
- [ ] 2026-10-18 — **Try the cath lab cases and catalog on your phone:** Simulator → pick Cath Lab Tech, RN or
  Cardiologist → play the six lab cases; Library → **Cath lab** tab (open a view: the heart turns to it).

- [ ] 2026-10-18 — **Try the new screens on your phone:** the Home page, the case simulator (play a case
  to the end, give your 12-lead reads, read the review) and the Learn screen (tap the heart, open a
  condition, then a drug). Use your **phone's Back button/gesture** throughout: it should step back through
  the app and, on Home, say "press Back again to leave". Tested only in emulated phone, tablet and desktop
  browsers.

- [ ] 2026-10-17 — **Delete the old production branch** `claude/create-heart-3d-model-6mtrW`
  (optional tidy-up; nothing uses it any more): GitHub → `jcochran6810/Cardiac-map` → Branches →
  trash icon next to it. Its Vercel domain `cardiac-map-git-claude-create-he-…vercel.app` goes with it;
  the live site is unaffected.
- [ ] 2026-10-16 — **Set up Codex's environment** (ChatGPT → Codex → Environments → Cardiac-map):
  set the **setup script** to `cd heart-simulator && npm ci` (Codex tasks have no internet after
  setup, so packages must be installed there), and start Codex tasks from branch `main`.
- [ ] 2026-10-18 — **Check Monitor / Defib on your phone:** the ECG, SpO₂ and EtCO₂ waveforms should now
  draw as solid lines (fixed for fast phone screens, tested only in a simulated browser).
- [ ] 2026-10-16 — **Try it on your own phone.** The phone/tablet layout and the install flow were
  tested in an emulated browser, not on a real device. On an iPhone open the site in Safari → Share
  → Add to Home Screen; on Android, Chrome menu ⋮ → Install app. Then turn on airplane mode and open
  it from the home screen. Tell Claude anything that looks wrong.
- [ ] 2026-10-16 — **Let Claude change Vercel settings** (optional). The Vercel connector can read
  but gets "403 forbidden" on project changes (e.g. adding a domain or switching the production
  branch). To allow it: open https://claude.ai/customize/connectors → Vercel → sign in again if
  asked → under tool permissions, allow the project-changing tools. If that option is missing, an
  organisation admin has to allow it.
- [ ] 2026-10-16 — **Delete the stale branch** `claude/project-refinement-prior-hghmfo`
  (2026-09-04; 2 commits that never shipped, 23 behind production). Review it first if you remember
  what it was for: GitHub → Branches. Sessions can't delete remote branches.

### For Codex (UI / graphics — set by Claude)

- [ ] 2026-10-22 — **Polish the Give meds screens (keep their behaviour):** the section in
  `heart-simulator/src/components/meds/GiveMedication.tsx` (weight stepper, drug select, dose chips + input with the
  mg/kg readout, Push, the verdict card, the timeline), the bar above the ECG in `MedEffectBar.tsx`, and the dashed
  dose / effect markers drawn on the strip (`drawMarks` in `ECGRenderer.tsx`, labels on the rhythm strip). Keep: Push
  slides the 12-lead up; the verdict and dose class appear only after Push; Skip ahead moves drug time, not the clock.
  Check 320–1920 px and the paper ECG theme.

- [ ] 2026-10-18 — **Polish the real-image UI (keep its behaviour):** `CathFigure` / `ImageZoom` /
  `ImageCredit` in `heart-simulator/src/components/cathlab/CathFigure.tsx` (catalog figures, the full-screen
  view, the linked credit and licence — both links must stay visible) and the image runs in the simulator's
  Imaging tab (`ImagingPanel.tsx`). On phones the run header ("Run 1 · 8:30" + title) wraps onto two lines;
  tall angiograms show small at `max-h-[320px]` on desktop. The caption must stay hidden while a read on that
  run is pending (`asked` in `ImagingPanel.tsx`).

- [ ] 2026-10-18 — **Polish the cath lab screens (keep their behaviour):** the simulator's **Imaging** tab
  (`heart-simulator/src/components/simulator/ImagingPanel.tsx`), the C-arm diagram
  (`heart-simulator/src/components/cathlab/CArmDiagram.tsx` — a clearer patient, table and C-arm drawing would
  help), the catalog item page (`CathLabView` / `PractiseLab` in `heart-simulator/src/components/layout/RightPanel.tsx`),
  the "study the catalog" banner in `ScenarioPicker.tsx` and the monitor's new **ART** box
  (`MonitorDisplay.tsx`).

- [ ] 2026-10-22 — **Polish the new navigation (keep its behaviour):** the main menu
  (`heart-simulator/src/components/home/HomeScreen.tsx` — sections, tiles, "continue" cards, role + scope), the
  slim top bar (`TopBar.tsx`: Menu, Back, title, search), the drawer bars (`DrawerBar.tsx`: "3D heart" at the top,
  "12-lead EKG" at the bottom, ⤢) and the drawers' slide and grips (`AppShell.tsx`), the list header
  (`LeftPanel.tsx`) and the "All …" bar and "pick a topic" page in `RightPanel.tsx`. Keep: drawers slide (height
  transition), the reading stays visible with a drawer open, a phone on its side puts heart and ECG side by side.
  Known rough edges: with both drawers open on a phone the reading is a thin strip; the heart's overlay controls
  crowd a short drawer; the install banner covers the top of the menu on phones; check 320–1920 px.
- [ ] 2026-10-18 — **Polish the screens Claude built (keep their behaviour):** the case simulator
  (`heart-simulator/src/components/simulator/`), the tap-the-heart card and first-time tips (`SceneOverlay.tsx`
  `PeekCard`, `BottomDock.tsx` lead tip). Known rough edge: on a phone on its side the simulator's monitor numerics
  are clipped.

- [ ] 2026-10-16 — **Build on the merged header, don't undo it.** Claude merged your UI foundation
  (PR #2's work) with the phone / tablet layout: the header keeps your tokens, `Button` /
  `IconButton`, combobox search and scope focus return, but stays **one row at every size** (56 px,
  48 px on phones, 44 px on a phone on its side), search sits behind an icon below 768 px, the role +
  scope menu replaces the select below 640 px, and the owner's heart logo replaces the drawn
  brandmark. Your `.ui-button` / `.workspace-*` styles moved into `@layer components` so `hidden` /
  `md:hidden` work on buttons. (2026-10-22: the bar now holds only Menu, Back, the title and search — the
  role selector, Scope, Quiz, Tutor, Install and Help moved to the main menu.) Checked at 320, 375, 390, 640, 700, 768, 820, 844×390, 1024, 1180,
  1366 and 1920 px: no overflow, nothing clipped (`heart-simulator/app/globals.css`,
  `heart-simulator/src/components/layout/TopBar.tsx`).
- [ ] 2026-10-16 — Finish the UI regression pass you started: **200 % browser zoom** and
  **keyboard-only use** (neither checked yet), and before/after screenshots of the rest of the app.
- [ ] 2026-10-16 — Accessibility follow-ups from your assessment: resizer keyboard support, dialog
  focus lifecycle (tutor, quiz, help, install sheet), complete tab patterns, content error / retry
  states, chart access, electrode keyboard controls, and eventually full light-theme coverage.

### Requests for Claude (from Codex)

- [ ] 2026-10-16 — Review the remaining presentation-to-state wiring: the six view modes (now
  arrow-key navigable), 3D label keyboard reachability and the projector (`/monitor`) behaviour.
  (Header controls, search and scope focus return were reviewed during the merge.)

### Code

- [ ] 2026-10-22 — The start hook lists only `claude/*` and `codex/*` branches, but web sessions now get `ccr-*`
  branches, so unmerged work there goes unreported (it missed `ccr-fcd6b419-beq5mr`). Add `ccr-*` to the fetch
  refspec and listing (`.claude/hooks/session-start.sh:275`) and a case to `session-start.test.sh`.
- [ ] 2026-10-19 — **Give meds: more drugs for the common cases** (`heart-simulator/src/lib/sim/meds.ts`; each needs
  a Library drug card first): insulin 10 units + dextrose 25 g and nebulised salbutamol 10–20 mg for hyperkalaemia,
  a P2Y12 loading dose (ticagrelor 180 mg / clopidogrel 300–600 mg) for STEMI, sotalol 1.5 mg/kg for stable VT.
- [ ] 2026-10-19 — **Check the drug doses and algorithms against the AHA 2025 guidelines** (the app's drug cards,
  defibrillator trainer and Give meds model follow ACLS 2020 + the 2023 focused update).

- [ ] 2026-10-18 — **Better-fitting images where the catalog uses a near match** (every item has a real
  image; captions say when the setting differs): damping at a coronary ostium (now: innominate artery), a
  reperfusion VF strip from primary PCI, Bezold–Jarisch during RCA reperfusion, a vasovagal drop during
  sheath removal, a cath lab time-out and closed-loop exchange, a Hemochron ACT analyzer, vial photos of
  protamine, bivalirudin, cangrelor, verapamil, nitroglycerin and fentanyl (bivalirudin and cangrelor show
  the molecule), an ipsilateral-oblique femoral sheath angiogram, an AL1 (not AL 0.75) guide. Rules: only
  CC BY / CC BY-SA / CC0 / public domain — check the article's own licence **text** (one "CC BY"-linked
  article said NonCommercial), credit and link it, mark crops. Wikimedia: ask for standard thumbnail widths
  (960 / 1280 px), not original files — originals were throttled (HTTP 429, 10-minute waits).
- [ ] 2026-10-18 — Spelling: the app mixes UK (simulator text: haemostasis, hyperaemia, equalise) and US
  (library content) spelling; pick US throughout (the users train for US certifications). Read-option ids
  such as `ischaemia` can stay.
- [ ] 2026-10-18 — More simulator cases (one file each in
  `heart-simulator/src/lib/sim/scenario/scenarios/` + an ideal run in `tests/scenarios.test.ts`): PEA /
  asystole arrest, AF with RVR, stable VT, symptomatic bradycardia from a beta-blocker, hyperkalaemia; in the
  lab, no-reflow, a left main case, an EP / pacing case.
- [ ] 2026-10-18 — Simulator 12-lead is live (always the current rhythm, with a "the patient has
  changed — repeat it" note); a frozen tracing per recording would be more realistic.

- [ ] 2026-10-16 — Role permissions used by the monitor/defibrillator and tutor can't be unit-tested
  directly: `MANUAL_OK` / `DRUG_AUTHORITY` live inside the DefibPanel component
  (`heart-simulator/src/components/monitor/DefibPanel.tsx:16`) and `careField` is a private helper in
  `heart-simulator/src/lib/tutor.ts:148`.
  Move them into `heart-simulator/src/lib/scope.ts` and test that each role only gets its scope.
- [ ] 2026-10-16 — No component or end-to-end tests yet; unit tests cover `src/lib` only. A
  Playwright smoke test of the main layouts (phone, tablet, desktop) would catch layout regressions.
- [ ] 2026-10-16 — `next lint` is removed in Next.js 16. Before upgrading Next, switch
  `heart-simulator` to the ESLint CLI with a flat config (`eslint.config.mjs`).
- [ ] 2026-10-16 — `heart-3d-model/index.html` is an unused legacy page from the first commit.
  Remove it, or keep it deliberately and say so in the README.

## Done

- [x] 2026-10-22 — Give meds from any condition (19 drugs, effects on the live 12-lead, verdicts on drug and dose)
  with the 2026-10-19 clinical review fixes, ported onto the new layout (`ac752a0`, `2ca8e53`; from `06b9370`,
  `1c083da`). All of `ccr-fcd6b419-beq5mr` has now shipped.

- [x] 2026-10-22 — EKG: the newly drawn trace (behind the sweep line) came out thin and dashed on phones while the
  rest was thick; each frame no longer erases over the newest trace (`df1d669`).

- [x] 2026-10-22 — 3D heart: standard one- / two-finger gestures (turn, pinch zoom, pan), smooth dragging, taps that
  don't fly the camera, the whole heart in view on an upright phone (`1b4c0ea`, ported from `4f9200f`). Topic pages
  scroll as one with pinned section buttons above the title and foldable summary / Focus boxes (`82ae263`).

- [x] 2026-10-22 — Opening a condition or rhythm left the old rhythm on the EKG until the sweep painted over it
  (and never changed it while paused); it now fills every tracing at once. Phones open the EKG on the 12-lead
  (`2e3c9ee`).

- [x] 2026-10-22 — Navigation revamp: one main menu handles everything (role, search, continue, simulator, every
  library section, tools, guided starts, quiz, tutor, help, install); the top bar is Menu / Back / title / search;
  the EKG slides up from a bottom bar and the 3D heart slides down from a top bar; the phone tab bar, mode tabs,
  Library / Info buttons and the Library's tab strip (hard to read on phones) are gone (`9568e80`).

- [x] 2026-10-18 — Cath lab simulator for the tech, the nurse and the cardiologist: six lab cases worked step
  by step (devices, views, drugs; reads of pressures, FFR, stent sizing and angiograms) and a cath lab
  catalog of 78 entries in the Library (`005340b`, `7310763`, `0ca5166`, `307c250`, `b2a5c18`).
- [x] 2026-10-18 — Electrode lab: a 3D patient with correctly placed electrodes (limb electrodes on the
  shoulders and lower abdomen) and a line through the 3D heart showing where each lead looks from
  (`7fcb663`, `7151011`).
- [x] 2026-10-18 — Real images for every cath lab catalog item (114 in all) and same-patient before / after
  angiograms for all five lab cases, read by the learner (`e38e062`, `48cd2eb`, `c5cb439`, `e1151a4`,
  `a7db0f7`). Reads are checked by the app itself ("Feedback") — no preceptor / FTO wording (`41bc679`).

- [x] 2026-10-18 — Real cath lab images: 27 figures from open-access articles (CC BY 4.0 / 3.0, licence text
  checked, credited and linked) in `public/cath-images/`; the anterior, inferior, FFR and shock cases show
  the real culprit angiogram — and the FFR case the real pressure-wire console — for the tech, nurse or
  cardiologist to read before treating; 21 catalog items show real images (`3490631`, `61ea7f2`). The owner
  opened the environment's network access, which this needed.

- [x] 2026-10-18 — The phone / browser Back button left the app; it now steps back through the app's pages
  (screens, opened items, drawers, overlays, simulator views), asks before leaving a case, and asks before
  leaving the app from Home (`ae5bf42`).
- [x] 2026-10-18 — Simulator 12-lead: the app no longer reads the tracing for the learner; they choose their
  read from all interpretations and the FTO / preceptor confirms or corrects it at once (`92315a6`).

- [x] 2026-10-18 — Navigation made easier to learn: Home page, Home / Learn / Simulator tabs (bottom
  bar on phones), labelled Library / Info buttons, Back in the info panel, a card when you tap the
  heart, first-time tips, Electrode lab always visible, clearer dock labels (`5581410`, `2afbd0b`).
- [x] 2026-10-18 — Codex requests: the "Pressure & volume" welcome card now lands on the Wiggers view
  and "Watch one heartbeat" slows to 0.25× (`2afbd0b`).
- [x] 2026-10-18 — Case simulator as its own screen: six condition cases with role-scoped actions that
  change the monitor, 12-lead and story, ending in a scored review (`2e62dd1`, `5581410`, `2afbd0b`).
- [x] 2026-10-18 — Electrode lab mannequin replaced with a realistic human body built from the CC0
  MakeHuman mesh (`7151011`).

- [x] 2026-10-18 — Monitor / Defib waveforms (ECG, SpO₂ pleth, capnogram) showed as dots on phones and
  the row dividers turned solid white; both fixed (`01b51d4`).
- [x] 2026-10-17 — Production fully on `main`: the owner switched GitHub's default branch and Vercel's
  production branch; the temporary bridge push was removed from `CLAUDE.md`, `AGENTS.md` and the
  start hook, and the merge of this change deployed from `main` as Production.
- [x] 2026-10-17 — Live 12-lead is the default ECG view (every lead sweeps at once, one sweep line per
  column, like a monitor); the paper format stays as "Printout" (`3a1ed71`).
- [x] 2026-10-17 — Straight line drawn across the ECG rhythm strip at the start of about half the
  sweeps (floating-point wrap in the sweep maths) fixed, with a regression test (`5400102`).
- [x] 2026-10-16 — Codex's UI foundation (PR #2 work, landed on `main` as `4c345d1`) merged with the
  phone / tablet layout, PWA and session protocol; Codex's own protocol files folded into
  `CLAUDE.md` / `AGENTS.md` / `SESSION_LOG.md`, root `README.md` corrected.
- [x] 2026-10-16 — Codex's validation items resolved: `npm ci` works (lockfile regenerated with
  npm 11), a Vitest suite (129 tests) and GitHub Actions CI exist, and the logo is the owner's own
  heart logo (`heart-simulator/public/logo.webp`), now also in the header.
- [x] 2026-10-16 — Production switched to `main` in the protocol (owner's decision): every
  "end session" merges into `main`; `.claude/production-branch`, `CLAUDE.md`, `AGENTS.md` updated,
  with a temporary bridge to the old branch until the Vercel / GitHub switch; PR #2 retargeted to `main`.
- [x] 2026-10-16 — Codex added as the UI / graphics agent with Claude as lead: `AGENTS.md`,
  `scripts/session-start.sh`, "Working with Codex" in `CLAUDE.md`, and the start report now lists both
  agents' unmerged branches and flags files changed on both.
- [x] 2026-10-16 — Start/end-session protocol adopted from the sibling repos (MyTradeCrate,
  Station Insight, Response-Insight), adapted for this repo: `CLAUDE.md`,
  `.claude/hooks/session-start.sh` (+ `session-start.test.sh`, 58 checks), `.claude/settings.json`,
  `.claude/production-branch`, `SESSION_LOG.md`, this file; `typecheck`, `test` and `check` npm
  scripts and a Vitest suite (122 tests) so the session-start baseline has real checks.
- [x] 2026-10-16 — Installable app (PWA) with the new heart logo: manifest, icons, offline service
  worker, install button and iPhone instructions (`c8212a5`).
- [x] 2026-10-16 — Layout adapted to phones, tablets and desktops (`6e9f55d`).
- [x] 2026-10-16 — https://cardiacmap.stationinsight.com connected to Vercel project `cardiac-map`
  (owner added the domain; verified serving).
