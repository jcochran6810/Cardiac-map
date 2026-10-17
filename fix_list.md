# Fix list

Outstanding fixes, TODOs, and known issues for CardioSim. The SessionStart hook tells every session
to read this file; the end-session protocol updates it (CLAUDE.md, step 4).

Add new items at the top of their group. Use the format:

- [ ] YYYY-MM-DD — short description (file_path:line if relevant)

## Open

### Owner actions (dashboard steps — code can't do these)

- [ ] 2026-10-16 — **Finish switching production to `main`** (two dashboard settings). The repo
  protocol already merges every "end session" into `main`; until these are done, a temporary
  "bridge" (CLAUDE.md, end-session step 7) also moves the old branch so the live site keeps updating.
  1. **Vercel** → project `cardiac-map` → Settings → Environments → Production → Branch Tracking →
     `main` → Save (older dashboards: Settings → Git → Production Branch).
  2. **GitHub** → `jcochran6810/Cardiac-map` → Settings → General → Default branch → the ⇄ switch
     button → `main` → Update (the GitHub mobile app's branch picker does not change this).
  3. Tell Claude it's done: it checks that a push to `main` deploys as Production, then removes the
     bridge. After that you may delete the old branch `claude/create-heart-3d-model-6mtrW`
     (GitHub → Branches) — not before.
  Until step 2 is done, every session start will show a notice about the default branch.
- [ ] 2026-10-16 — **Set up Codex's environment** (ChatGPT → Codex → Environments → Cardiac-map):
  set the **setup script** to `cd heart-simulator && npm ci` (Codex tasks have no internet after
  setup, so packages must be installed there), and start Codex tasks from branch `main`.
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

- [ ] 2026-10-16 — Welcome screen "Pressure & volume" card selects the Wiggers view, then
  `openCondition` resets the bottom dock to the ECG; decide the intended order and fix it.
- [ ] 2026-10-16 — Welcome screen "Watch one heartbeat" card says it slows to 0.25× but only changes
  the view; make it set the speed or change the wording.
- [ ] 2026-10-16 — Review the remaining presentation-to-state wiring: the six view modes (now
  arrow-key navigable), 3D label keyboard reachability and the projector (`/monitor`) behaviour.
  (Header controls, search and scope focus return were reviewed during the merge.)

### Code

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
