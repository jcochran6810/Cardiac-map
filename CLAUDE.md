# Cardiac-map project instructions

Applies to Claude Code, Codex, and other agents for every session and task.
The owner explicitly adopted the start/end session protocol from
`jcochran6810/Pressure-washing/CLAUDE.md` on 2026-10-16. This version preserves
that workflow and adapts only the application directory, available checks, and
agent entry points. Do not import the other project's private session history or
deployment settings.

## Branch model

- `main` is the canonical integration source of truth. It was created from
  `claude/create-heart-3d-model-6mtrW` at `6033603` with the owner's approval.
- Work on dedicated `codex/<slug>` or `claude/<slug>` session branches.
- Branch work is not landed until merged and pushed to `main`.
- Do not infer production deployment from the branch name. Hosting settings and
  GitHub's default branch are separate configuration; no deployment claim is made.
- Keep session branches after merging. Never force-push main.

## Start-session protocol (EVERY new session)

**Hard rule:** start new work at the latest `origin/main` HEAD. Do not start from
a stale branch, silently discard prior work, or assume a previous fetch is current.

1. Read `CLAUDE.md`, `README.md`, and `fix_list.md`, including the newest Session
   log entry. Read `AGENTS.md` when using Codex.
2. Before edits, run:
   ```sh
   git fetch origin --prune
   git status --porcelain
   git branch --show-current
   git rev-list --count HEAD..origin/main
   git rev-list --count origin/main..HEAD
   ```
3. If fetch fails, HEAD is detached, the tree is dirty, the session branch is
   ahead/behind, or main is missing: stop and surface the drift before doing work.
   Resolve with the owner's direction. Preserve session work; do not reset it away.
   A clean branch with no unique commits can be brought forward with
   `git merge --ff-only origin/main`. Create new session branches from origin/main.
   For ahead work the owner wants to retain, merge current origin/main and resolve
   conflicts. Do not reset unwanted work without a verified backup and direction.
4. Do not develop directly on main. Confirm the working branch starts at
   `origin/main` (zero ahead/behind, clean tree) before starting a fresh task,
   unless the owner explicitly directs continuing an existing session's work.
5. Establish the baseline from `heart-simulator/`: install dependencies, run
   `npm run lint`, `npx tsc --noEmit`, the available automated test suite, and
   `npm run build`. Report failures before adding new implementation. Fix within
   authorized scope or surface the owner/Claude Code dependency.
6. Currently no `typecheck` or `test` npm script exists. Use `npx tsc --noEmit`
   for type checking; explicitly report automated tests as unavailable until a
   real suite is added. Do not add a dummy passing test or claim a missing check ran.
   The known lockfile issue and temporary install workaround are in `fix_list.md`.

### Hooks, resume, and compaction

No SessionStart hook has been installed in this repository. Do not claim automatic
enforcement. Perform the manual verification in Claude Code and Codex. A future
hook must preserve work and still be checked by the assistant on turn 1.

On resume/compaction, recheck current branch state against freshly fetched main,
retain in-progress commits, and report drift. Compaction does not begin a fresh
task or authorize resetting session work. If a hook reports a session-start
blocker, stop and relay it rather than proceeding with edits.

## End-session protocol (EVERY "end session")

"End session", "wrap up", "merge this", and "ship it" authorize completing this
workflow. Stopping a server, saving local files, or opening a draft PR is not an
ended session. The goal is committed, logged, validated work merged and pushed
to `main`, unless the owner explicitly says not to merge.

1. Commit all uncommitted session work on the working branch with descriptive
   messages. Do not defer work into an unnamed stash.
2. Update `## Session log` below, newest first, with a dated branch entry covering
   every meaningful change, important files, checks and their actual results,
   unresolved issues, and any explicit owner exceptions. Distinguish missing
   validation from passing validation.
3. Commit that update separately: `Update CLAUDE.md with session log`.
4. Push the working branch to origin before merging: `git push -u origin <branch>`.
   Verify the remote SHA. An authorized GitHub connector is an acceptable transport
   fallback when shell push cannot authenticate; verify identical file trees.
5. Fetch again, check out main, fast-forward it to origin, and merge the working
   branch with a merge commit:
   ```sh
   git fetch origin --prune
   git checkout main
   git pull --ff-only origin main
   git merge --no-ff <working-branch> -m "Merge <working-branch> into main — <summary>"
   ```
   Preserve both sides of non-overlapping work. Stop and surface genuinely
   ambiguous conflicts; never silently choose one agent's changes over another's.
6. Before pushing main, run lint, type check, available automated tests, and build
   on the merged tree from `heart-simulator/`. Fix failures within authorized scope.
   Record missing test infrastructure accurately using the current adaptation
   above. Visual updates also require responsive, keyboard and screenshot checks
   where available; report concrete tooling limits rather than claiming success.
7. Push main without force. If it advanced, fetch/integrate, validate again, and
   retry. A GitHub merge PR with method `merge` is acceptable after locally validating
   the same integration tree and checking the expected remote head/base. Do not
   substitute squash/rebase for the required merge commit.
8. Switch back to the working branch. Keep the branch. Verify remote main includes
   all session commits, and confirm the remote merge SHA plus a one-sentence summary.

If the owner says "don't merge yet", still commit, log and push, then explicitly
report the pending merge. If validation, permissions or an external service blocks
completion, report the exact unfinished step. Never say "session ended" when the
required merge/push has not happened. Do not bypass branch protection or reviews
required by repository rules.

## Development boundaries

Codex owns UI/UX, layouts, CSS/tokens, icons/assets and visualization presentation.
Claude Code owns architecture, backend, APIs, authentication/authorization, database,
clinical calculations/algorithms, data contracts and functional integrations.
Document changes needing Claude Code; do not independently implement them without
explicit owner approval. Coordinate overlapping component work. Preserve anatomy,
clinical meaning, existing behavior and educational-use notices. This session
protocol does not grant permission to rewrite medical logic or deployment settings.

## Session log

<!-- Newest first. Commit a dated entry on every end-session request. -->
