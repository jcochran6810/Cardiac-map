# Fix list

Outstanding fixes, TODOs, and known issues for CardioSim. The SessionStart hook tells every session
to read this file; the end-session protocol updates it (CLAUDE.md, step 4).

Add new items at the top of their group. Use the format:

- [ ] YYYY-MM-DD — short description (file_path:line if relevant)

## Open

### Owner actions (dashboard steps — code can't do these)

- [ ] 2026-10-16 — **Say "end session" to put this session's work live.** The phone/tablet layout,
  the installable app (PWA) with the new logo, and this session protocol are on
  `claude/magical-allen-qsnowt` but not yet merged into `main`, so
  https://cardiacmap.stationinsight.com does not have them yet. Merging also matters for the
  protocol itself: new sessions start from production, so until it is merged they won't get the hook.
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

- [ ] 2026-10-16 — **PR #2 (`codex/ui-foundation-topbar`, now targeting `main`) conflicts with the
  phone / tablet layout.** It was started before Claude's responsive work and both change
  `TopBar.tsx`, `SceneOverlay.tsx`, `globals.css` and `tailwind.config.ts`. Once Claude's work is in
  `main`: merge `main` into the branch, keep the phone behaviour (search behind an icon, role + scope menu under 640 px wide,
  condensed 3D overlay, ECG tabs, touch-sized controls, phone-on-its-side layout) and re-apply the new
  design tokens and `Button` on top. Check 375, 390, 820 and 1366 px wide and a phone on its side.

### Requests for Claude (from Codex)

_(none yet)_

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
