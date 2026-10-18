# Fix list

Outstanding fixes, TODOs, and known issues for CardioSim. The SessionStart hook tells every session
to read this file; the end-session protocol updates it (CLAUDE.md, step 4).

Add new items at the top of their group. Use the format:

- [ ] YYYY-MM-DD — short description (file_path:line if relevant)

## Open

### Owner actions (dashboard steps — code can't do these)

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

- [ ] 2026-10-18 — **Polish the new screens Claude built (keep their behaviour):** Home
  (`heart-simulator/src/components/home/HomeScreen.tsx`), the case simulator
  (`heart-simulator/src/components/simulator/`), the Home / Learn / Simulator tabs and the phone bottom
  bar (`heart-simulator/src/components/layout/ModeNav.tsx`), the tap-the-heart card and first-time tips
  (`SceneOverlay.tsx` `PeekCard`, `BottomDock.tsx` lead tip) and the info panel's Back / Close bar
  (`RightPanel.tsx` `PanelBar`). Known rough edges: on a phone on its side the simulator's monitor
  numerics are clipped; the install banner covers the top of Home on phones; check 320–1920 px.
- [ ] 2026-10-18 — The Library's tab strip (7 tabs, 10.5 px text, 4-column grid) is hard to read on
  phones; consider bigger tabs or icons (`heart-simulator/src/components/layout/LeftPanel.tsx`).

- [ ] 2026-10-16 — **Build on the merged header, don't undo it.** Claude merged your UI foundation
  (PR #2's work) with the phone / tablet layout: the header keeps your tokens, `Button` /
  `IconButton`, combobox search and scope focus return, but stays **one row at every size** (56 px,
  48 px on phones, 44 px on a phone on its side), search sits behind an icon below 768 px, the role +
  scope menu replaces the select below 640 px, and the owner's heart logo replaces the drawn
  brandmark. Your `.ui-button` / `.workspace-*` styles moved into `@layer components` so `hidden` /
  `md:hidden` work on buttons. Checked at 320, 375, 390, 640, 700, 768, 820, 844×390, 1024, 1180,
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

- [ ] 2026-10-18 — More simulator cases (one file each in
  `heart-simulator/src/lib/sim/scenario/scenarios/` + an ideal run in `tests/scenarios.test.ts`): PEA /
  asystole arrest, AF with RVR, stable VT, symptomatic bradycardia from a beta-blocker, cardiogenic shock
  in the cath lab (IABP / Impella), hyperkalaemia, heart block needing a temporary wire.
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

- [x] 2026-10-18 — The phone / browser Back button left the app; it now steps back through the app's pages
  (screens, opened items, drawers, overlays, simulator views), asks before leaving a case, and asks before
  leaving the app from Home (this session's Back-button commit).
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
