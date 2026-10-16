#!/usr/bin/env bash
# SessionStart hook — same design as the MyTradeCrate (Pressure-washing) and Station Insight
# (Bunker-gear) repos, adapted for CardioSim. See CLAUDE.md "Start-session protocol".
#
# Always (every environment):
#   - Injects the "read CLAUDE.md / heart-simulator/README.md / fix_list.md first" policy.
#   - Creates a stub fix_list.md if it is missing (never overwrites).
#
# Web/remote only ($CLAUDE_CODE_REMOTE == "true"):
#   - Brings the session branch up to date with the production branch named in
#     .claude/production-branch, WITHOUT ever discarding commits or uncommitted work:
#       behind only          → fast-forward (git merge --ff-only)
#       ahead only           → leave it (unmerged session work); NOTICE on a fresh start
#       ahead and behind     → BLOCKER (diverged; the assistant asks how to proceed)
#       on production / detached HEAD / fetch failure / dirty tree that blocks the
#       fast-forward → BLOCKER
#   - Warns when GitHub's default branch is not the production branch (new web sessions
#     start from the default branch, so they would miss newer work and this hook).
#   - Runs the baseline checks in heart-simulator/: npm ci (skipped when the installed
#     packages already match package-lock.json), typecheck, lint, test.
#   - Injects the newest entry from SESSION_LOG.md so the session sees what the last one shipped.
#
# Output: one JSON `hookSpecificOutput` object on stdout; all other output goes to stderr.
# The hook always exits 0 — it reports problems, it never aborts the session.
#
# Testing: .claude/hooks/session-start.test.sh runs it against throwaway git repos.
# SESSION_START_SKIP_CHECKS=1 skips the npm steps (used by that test).

set -uo pipefail

INPUT="$(cat)"

read_source() {
  printf '%s' "$INPUT" | python3 -c 'import json,sys
try:
    print(json.load(sys.stdin).get("source",""))
except Exception:
    print("")' 2>/dev/null || true
}

emit_context() {
  printf '%s' "$1" | python3 -c 'import json,sys
print(json.dumps({"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":sys.stdin.read()}}))'
}

REPO_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$REPO_ROOT" || exit 0
APP_DIR="$REPO_ROOT/heart-simulator"
LIVE_URL="https://cardiacmap.stationinsight.com"

log() { printf '[session-start] %s\n' "$*" >&2; }

PROD="$(head -n 1 "$REPO_ROOT/.claude/production-branch" 2>/dev/null | tr -d '[:space:]')"
[ -z "$PROD" ] && PROD="main"

# === Always-on: auto-create fix_list.md if missing (never overwrites) ===
if [ ! -f "$REPO_ROOT/fix_list.md" ]; then
  cat > "$REPO_ROOT/fix_list.md" <<'STUB'
# Fix list

Outstanding fixes, TODOs, and known issues for CardioSim.

Add new items at the top. Use the format:

- [ ] YYYY-MM-DD — short description (file_path:line if relevant)

## Open

_(none yet)_

## Done

_(none yet)_
STUB
fi

# === Always-on: required-reading policy ===
POLICY_BLOCK="SESSION STARTUP — REQUIRED FIRST STEP

Before taking any action, doing any work, or answering any question in this
session, read the following three files in this order:

  1. CLAUDE.md                  — project instructions, start/end-session protocols
  2. heart-simulator/README.md  — product overview, features, architecture
  3. fix_list.md                — outstanding fixes / TODOs / owner actions

This is mandatory project policy. Do this BEFORE any other tool calls,
investigation, or response. If any of these files is missing, note it and
continue. (The full session history is in SESSION_LOG.md; its newest entry
is included below on web sessions.)"

# === Local (non-remote): emit just the policy and exit ===
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  emit_context "$POLICY_BLOCK

(Local environment — automatic git sync + npm ci/typecheck/lint/test are
skipped. Run them manually per CLAUDE.md's start-session protocol.)"
  exit 0
fi

# === Web-only from here on: sync + baseline checks ===
SOURCE="$(read_source)"
CURRENT_BRANCH="$(git branch --show-current 2>/dev/null || echo '')"
SYNC_STATUS=""
BLOCKER=""
NOTICES=""

add_notice() { NOTICES="${NOTICES}- $1
"; }

if [ -z "$CURRENT_BRANCH" ]; then
  SYNC_STATUS="⛔ Detached HEAD — STOP. Check out a session branch from origin/$PROD before doing anything else: \`git fetch origin && git checkout --no-track -b claude/<slug> origin/$PROD\`."
  BLOCKER="yes"
elif [ "$CURRENT_BRANCH" = "$PROD" ]; then
  SYNC_STATUS="⛔ On the production branch \`$PROD\` directly — STOP. Every push to it deploys to $LIVE_URL; sessions belong on their own branch. Create one: \`git fetch origin && git checkout --no-track -b claude/<slug> origin/$PROD\`."
  BLOCKER="yes"
elif ! git fetch origin "$PROD" --quiet 2>/dev/null; then
  SYNC_STATUS="‼️ git fetch origin $PROD failed — cannot verify sync state. Surface this to the user before continuing."
  BLOCKER="yes"
else
  UPSTREAM="origin/$PROD"
  DIRTY="no"
  if ! git diff --quiet HEAD 2>/dev/null; then DIRTY="yes"; fi
  if ! git diff --cached --quiet 2>/dev/null; then DIRTY="yes"; fi
  AHEAD="$(git rev-list --count "$UPSTREAM..HEAD" 2>/dev/null || echo 0)"
  BEHIND="$(git rev-list --count "HEAD..$UPSTREAM" 2>/dev/null || echo 0)"
  SHORT="$(git rev-parse --short HEAD)"
  DIRTY_NOTE=""
  [ "$DIRTY" = "yes" ] && DIRTY_NOTE=" Uncommitted changes are present (kept as they are) — commit them as part of this session's work."

  if [ "$AHEAD" = "0" ] && [ "$BEHIND" = "0" ]; then
    SYNC_STATUS="✅ \`$CURRENT_BRANCH\` is at production HEAD (\`$PROD\` @ $SHORT).$DIRTY_NOTE"
  elif [ "$AHEAD" = "0" ]; then
    # Behind only: a fast-forward. --ff-only never discards commits, and git refuses (rather than
    # overwriting) if uncommitted changes touch the same files.
    if git merge --ff-only --quiet "$UPSTREAM" >&2 2>&1; then
      SYNC_STATUS="✅ \`$CURRENT_BRANCH\` fast-forwarded to production (\`$PROD\` @ $(git rev-parse --short HEAD); was $BEHIND commit(s) behind).$DIRTY_NOTE"
    else
      SYNC_STATUS="⛔ \`$CURRENT_BRANCH\` is $BEHIND commit(s) behind production and could not be fast-forwarded (uncommitted changes touch the same files). Nothing was changed. STOP and surface to the user: commit or stash the changes, then \`git merge --ff-only origin/$PROD\`."
      BLOCKER="yes"
    fi
  elif [ "$BEHIND" = "0" ]; then
    # Ahead only: the branch already contains all of production plus unmerged work. Never discard it.
    SYNC_STATUS="✅ \`$CURRENT_BRANCH\` contains all of production (\`$PROD\`) plus $AHEAD unmerged commit(s) — they go live at \"end session\".$DIRTY_NOTE"
    if [ "$SOURCE" = "startup" ]; then
      add_notice "This new session found $AHEAD commit(s) on \`$CURRENT_BRANCH\` that never reached production (an earlier session did not finish with \"end session\"). Tell the user in your first reply — these changes are NOT live yet. Newest: $(git log -1 --format='%h %s' HEAD)"
    fi
  else
    SYNC_STATUS="⛔ \`$CURRENT_BRANCH\` has diverged from production (ahead=$AHEAD, behind=$BEHIND vs origin/$PROD; source=$SOURCE). Nothing was changed. STOP and ask the user: (a) RECOMMENDED — keep the session work and bring production in: \`git merge origin/$PROD\`; (b) discard this branch's work: \`git reset --hard origin/$PROD\` (the commits stay in \`git reflog\`; a pushed branch then needs \`git push --force-with-lease\`); (c) end the session now via the end-session protocol so the work merges into production."
    BLOCKER="yes"
  fi
fi
log "$SYNC_STATUS"

# GitHub's default branch must be the production branch: web sessions are created from it.
DEFAULT_BRANCH="$(git ls-remote --symref origin HEAD 2>/dev/null | awk '/^ref:/ { sub("refs/heads/", "", $2); print $2; exit }')"
if [ -n "$DEFAULT_BRANCH" ] && [ "$DEFAULT_BRANCH" != "$PROD" ]; then
  add_notice "GitHub's default branch is \`$DEFAULT_BRANCH\` but production is \`$PROD\` (.claude/production-branch). New web sessions start from the default branch, so they can miss newer work and this protocol. Tell the user: GitHub → Settings → General → Default branch → \`$PROD\` (and keep Vercel's production branch the same)."
fi

# Newest entry of SESSION_LOG.md: the first "### " block (outside code fences), up to the next heading
LAST_SESSION_LOG=""
if [ -f SESSION_LOG.md ]; then
  LAST_SESSION_LOG="$(awk '
    /^```/ { fence = !fence }
    !fence && /^### / && !started { started=1; print; next }
    started && !fence && /^#+ / { exit }
    started { print }
  ' SESSION_LOG.md)"
fi
[ -z "$LAST_SESSION_LOG" ] && LAST_SESSION_LOG="(no previous entry found in SESSION_LOG.md)"

# === Baseline checks (run even when blocked, so the report is complete) ===
INSTALL_STATUS="⚠️  skipped"; TYPECHECK_STATUS="⚠️  skipped"; LINT_STATUS="⚠️  skipped"; TEST_STATUS="⚠️  skipped"
if [ "${SESSION_START_SKIP_CHECKS:-}" = "1" ]; then
  log "baseline checks skipped (SESSION_START_SKIP_CHECKS=1)"
elif [ ! -f "$APP_DIR/package.json" ]; then
  INSTALL_STATUS="‼️ heart-simulator/package.json not found — checks not run"
else
  cd "$APP_DIR" || true
  export CI=1 NEXT_TELEMETRY_DISABLED=1
  LOCK_HASH="$(sha256sum package-lock.json 2>/dev/null | cut -d' ' -f1)"
  STAMP="node_modules/.session-start-lock-hash"
  if [ -n "$LOCK_HASH" ] && [ -f "$STAMP" ] && [ "$(cat "$STAMP" 2>/dev/null)" = "$LOCK_HASH" ]; then
    INSTALL_STATUS="✅ dependencies already match package-lock.json (npm ci not needed)"
  else
    log "npm ci..."
    # npm ci installs exactly what the lockfile says and never rewrites it
    if npm ci --no-audit --no-fund --loglevel=error >&2 2>&1; then
      INSTALL_STATUS="✅ npm ci"
      [ -n "$LOCK_HASH" ] && printf '%s' "$LOCK_HASH" > "$STAMP"
    else
      INSTALL_STATUS="‼️ npm ci FAILED (is package-lock.json in sync with package.json? Regenerate it with npm 11: \`npx -y npm@11 install\`)"
    fi
  fi

  log "npm run typecheck..."
  if npm run typecheck >&2 2>&1; then TYPECHECK_STATUS="✅ npm run typecheck"; else TYPECHECK_STATUS="‼️ npm run typecheck FAILED"; fi

  log "npm run lint..."
  if npm run lint </dev/null >&2 2>&1; then LINT_STATUS="✅ npm run lint"; else LINT_STATUS="‼️ npm run lint FAILED"; fi

  log "npm test..."
  if npm test --silent >&2 2>&1; then TEST_STATUS="✅ npm test"; else TEST_STATUS="‼️ npm test FAILED"; fi
  cd "$REPO_ROOT" || true
fi

# === Emit unified context ===
HEADER=""
if [ "$BLOCKER" = "yes" ]; then
  HEADER="⛔ SESSION-START BLOCKER — the working branch is not up to date with production (\`$PROD\`) and the hook could not safely fix it. Per CLAUDE.md, no session may work from a branch that is missing production commits. Before doing ANY other work, surface the sync status below to the user and resolve it. Do not start the user's task until it is resolved.

"
fi
if [ -n "$NOTICES" ]; then
  HEADER="${HEADER}⚠️ SESSION-START NOTICE — mention the following to the user in your first reply:
${NOTICES}
"
fi

CONTEXT="${HEADER}${POLICY_BLOCK}

## Session start — automatic baseline

Branch: \`$CURRENT_BRANCH\` · production branch: \`$PROD\` ($LIVE_URL)
Sync: $SYNC_STATUS

Baseline checks in heart-simulator/ (already executed by the SessionStart hook — no need to rerun):
- $INSTALL_STATUS
- $TYPECHECK_STATUS
- $LINT_STATUS
- $TEST_STATUS

Reminder: \`$PROD\` is the live production branch — Vercel deploys every push to it to $LIVE_URL. All work happens on \`$CURRENT_BRANCH\` and only goes live when the user types \"end session\" and CLAUDE.md's end-session protocol merges this branch into \`$PROD\`.

## Previous session (newest entry in SESSION_LOG.md)

$LAST_SESSION_LOG"

emit_context "$CONTEXT"
exit 0
