#!/usr/bin/env bash
# Tests for session-start.sh: runs the hook against throwaway git repos in every branch state it
# handles and checks the message it emits, that its output is valid JSON, and that it never
# loses a commit or an uncommitted change.
#
#   bash .claude/hooks/session-start.test.sh
#
# The npm baseline checks are skipped here (SESSION_START_SKIP_CHECKS=1); they are plain npm scripts.

set -uo pipefail

HOOK="$(cd "$(dirname "$0")" && pwd)/session-start.sh"
PROD="prod-branch"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
PASS=0
FAIL=0

export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.com GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.com
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1

ok() { PASS=$((PASS + 1)); printf '  ✓ %s\n' "$1"; }
bad() { FAIL=$((FAIL + 1)); printf '  ✗ %s\n' "$1"; }

# A fresh "GitHub" (bare origin whose default branch is $PROD) and a clone on session branch claude/test
setup() {
  rm -rf "$WORK/origin.git" "$WORK/clone" "$WORK/seed"
  git init -q --bare -b "$PROD" "$WORK/origin.git"
  git init -q -b "$PROD" "$WORK/seed"
  (
    cd "$WORK/seed"
    mkdir -p .claude heart-simulator
    printf '%s\n' "$PROD" > .claude/production-branch
    printf 'shared\n' > shared.txt
    printf '# Fix list\n\n## Open\n\n- [ ] keep me\n' > fix_list.md
    printf '# Session log\n\n```\n### template heading inside a fence\n```\n\n### 2026-01-02 — newest (second)\nnewest body\n\n### 2026-01-01 — older (first)\nolder body\n' > SESSION_LOG.md
    git add -A && git commit -qm "base"
    git remote add origin "$WORK/origin.git"
    git push -q origin "$PROD"
  )
  git clone -q "$WORK/origin.git" "$WORK/clone"
  git -C "$WORK/clone" checkout -q --no-track -b claude/test "origin/$PROD"
}

# Commit on production (as if another session had merged work)
advance_prod() {
  (
    cd "$WORK/seed"
    printf 'prod %s\n' "$1" >> "prod-$1.txt"
    git add -A && git commit -qm "prod $1" && git push -q origin "$PROD"
  )
}

commit_local() {
  (cd "$WORK/clone" && printf 'local %s\n' "$1" > "local-$1.txt" && git add -A && git commit -qm "local $1")
}

# Runs the hook; sets OUT (raw stdout) and CTX (additionalContext). Args: source, remote, agent
run_hook() {
  local source="${1:-startup}" remote="${2:-true}" agent="${3:-claude}"
  OUT="$(cd "$WORK/clone" && printf '{"source":"%s"}' "$source" | PATH="${HOOK_PATH:-$PATH}" CLAUDE_PROJECT_DIR="$WORK/clone" CLAUDE_CODE_REMOTE="$remote" SESSION_START_AGENT="$agent" SESSION_START_SKIP_CHECKS=1 "$BASH" "$HOOK" 2>/dev/null)"
  CTX="$(printf '%s' "$OUT" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["hookSpecificOutput"]["hookEventName"]=="SessionStart"; print(d["hookSpecificOutput"]["additionalContext"])' 2>/dev/null)" || CTX="__INVALID_JSON__"
}

expect_ctx() { if [[ "$CTX" == *"$1"* ]]; then ok "$2"; else bad "$2 (missing: $1)"; fi; }
expect_no_ctx() { if [[ "$CTX" != *"$1"* ]]; then ok "$2"; else bad "$2 (unexpected: $1)"; fi; }
expect_head() { local h; h="$(git -C "$WORK/clone" rev-parse HEAD)"; if [ "$h" = "$1" ]; then ok "$2"; else bad "$2 (HEAD $h, expected $1)"; fi; }
expect_json() { if [ "$CTX" != "__INVALID_JSON__" ]; then ok "stdout is one valid SessionStart JSON object"; else bad "stdout is not valid JSON: $OUT"; fi; }

echo "local session: policy only, no git changes"
setup
BEFORE="$(git -C "$WORK/clone" rev-parse HEAD)"; advance_prod 1
run_hook startup false
expect_json
expect_ctx "SESSION STARTUP — REQUIRED FIRST STEP" "policy injected"
expect_ctx "Local environment" "local note shown"
expect_head "$BEFORE" "no sync in a local session"

echo "level with production"
setup
run_hook startup
expect_json
expect_ctx "is at production HEAD" "reports level"
expect_no_ctx "SESSION-START BLOCKER" "no blocker"
expect_ctx "newest body" "injects the newest SESSION_LOG entry"
expect_no_ctx "older body" "injects only the newest entry"
expect_no_ctx "template heading inside a fence" "ignores headings inside code fences"

echo "behind only → fast-forward"
setup; advance_prod 1; advance_prod 2
run_hook startup
expect_ctx "fast-forwarded to production" "fast-forwards"
expect_head "$(git -C "$WORK/origin.git" rev-parse "$PROD")" "HEAD is production HEAD"

echo "behind only + unrelated uncommitted change → fast-forward keeps the change"
setup; advance_prod 1
printf 'edited\n' >> "$WORK/clone/shared.txt"
run_hook resume
expect_ctx "fast-forwarded to production" "fast-forwards"
expect_ctx "Uncommitted changes are present" "mentions the uncommitted change"
if grep -q edited "$WORK/clone/shared.txt"; then ok "uncommitted change kept"; else bad "uncommitted change lost"; fi

echo "behind only + uncommitted change to a file production changed → blocker, nothing touched"
setup
BEFORE="$(git -C "$WORK/clone" rev-parse HEAD)"
(cd "$WORK/seed" && printf 'prod edit\n' >> shared.txt && git commit -qam "prod edits shared" && git push -q origin "$PROD")
printf 'local edit\n' >> "$WORK/clone/shared.txt"
run_hook resume
expect_ctx "SESSION-START BLOCKER" "blocker"
expect_ctx "could not be fast-forwarded" "explains why"
expect_head "$BEFORE" "HEAD unchanged"
if grep -q "local edit" "$WORK/clone/shared.txt"; then ok "uncommitted change kept"; else bad "uncommitted change lost"; fi

echo "ahead only, fresh session → keeps commits and raises a notice"
setup; commit_local 1; commit_local 2
BEFORE="$(git -C "$WORK/clone" rev-parse HEAD)"
run_hook startup
expect_ctx "plus 2 unmerged commit(s)" "reports unmerged commits"
expect_ctx "SESSION-START NOTICE" "notice on a fresh session"
expect_no_ctx "SESSION-START BLOCKER" "no blocker"
expect_head "$BEFORE" "commits kept"

echo "ahead only, resumed session → keeps commits quietly"
run_hook resume
expect_no_ctx "SESSION-START NOTICE" "no notice on resume"
expect_no_ctx "SESSION-START BLOCKER" "no blocker"
expect_head "$BEFORE" "commits kept"

echo "diverged → blocker, nothing touched"
setup; commit_local 1; advance_prod 1
BEFORE="$(git -C "$WORK/clone" rev-parse HEAD)"
for src in startup resume compact; do
  run_hook "$src"
  expect_ctx "SESSION-START BLOCKER" "blocker on $src"
  expect_ctx "has diverged from production (ahead=1, behind=1" "explains divergence on $src"
  expect_head "$BEFORE" "HEAD unchanged on $src"
done

echo "on the production branch → blocker"
setup
git -C "$WORK/clone" checkout -q "$PROD"
run_hook startup
expect_ctx "On the production branch" "blocks work on production"
expect_ctx "SESSION-START BLOCKER" "blocker header"

echo "detached HEAD → blocker"
setup
git -C "$WORK/clone" checkout -q --detach
run_hook startup
expect_ctx "Detached HEAD" "blocks detached HEAD"

echo "fetch fails → blocker"
setup
git -C "$WORK/clone" remote set-url origin "$WORK/does-not-exist.git"
run_hook startup
expect_ctx "fetch origin $PROD failed" "blocks when production can't be fetched"

echo "GitHub default branch differs from production → notice"
setup
git -C "$WORK/seed" push -q origin "$PROD:old-default"
git -C "$WORK/origin.git" symbolic-ref HEAD refs/heads/old-default
run_hook startup
expect_ctx "default branch is \`old-default\`" "warns about the default branch"

echo "fix_list.md stub"
setup
run_hook startup
if grep -q "keep me" "$WORK/clone/fix_list.md"; then ok "existing fix_list.md not overwritten"; else bad "fix_list.md overwritten"; fi
rm "$WORK/clone/fix_list.md"
run_hook startup false
if grep -q "^## Open" "$WORK/clone/fix_list.md"; then ok "missing fix_list.md recreated"; else bad "fix_list.md not recreated"; fi

echo "Codex on a fresh copy of production → no blocker, told to branch"
setup
git -C "$WORK/clone" checkout -q "$PROD"
run_hook startup true codex
expect_no_ctx "SESSION-START BLOCKER" "no blocker for Codex on production"
expect_ctx "create your branch before changing anything" "tells Codex to branch"
expect_ctx "1. AGENTS.md" "Codex reading list starts with AGENTS.md"
expect_ctx "Agent: codex" "reports the agent"

echo "Codex without internet → compares with its local copy of production, no blocker"
setup; commit_local 1
git -C "$WORK/clone" remote set-url origin "$WORK/does-not-exist.git"
run_hook startup true codex
expect_no_ctx "SESSION-START BLOCKER" "no blocker when GitHub is unreachable"
expect_ctx "GitHub was not reachable" "says the comparison may be stale"
git -C "$WORK/clone" remote remove origin
git -C "$WORK/clone" update-ref -d "refs/remotes/origin/$PROD"
run_hook startup true codex
expect_ctx "Could not reach GitHub and this checkout has no copy of production" "handles a checkout with no remote at all"
expect_no_ctx "SESSION-START BLOCKER" "still no blocker"

echo "other agents' unmerged branches"
setup
(cd "$WORK/seed" && git checkout -q -b codex/ui-polish && printf 'codex\n' >> shared.txt && printf 'new\n' > codex-only.txt && git add -A && git commit -qm "codex polish" && git push -q origin codex/ui-polish && git checkout -q "$PROD")
(cd "$WORK/seed" && git checkout -q -b claude/old-idea && printf 'old\n' > old.txt && git add -A && GIT_COMMITTER_DATE="2020-01-01T00:00:00Z" git commit -qm "old idea" && git push -q origin claude/old-idea && git checkout -q "$PROD")
run_hook startup
expect_ctx "\`codex/ui-polish\` (Codex, 1 unmerged commit(s)" "lists Codex's unmerged branch"
expect_ctx "\`codex-only.txt\`" "lists the files it touches"
expect_no_ctx "claude/old-idea" "skips branches untouched for 14+ days"
expect_no_ctx "also changed on this branch" "no overlap warning when files differ"
(cd "$WORK/clone" && printf 'mine\n' >> shared.txt && git commit -qam "claude edits shared")
run_hook resume
expect_ctx "also changed on this branch: \`shared.txt\`" "flags files changed on both branches"
expect_ctx "SESSION-START NOTICE" "raises a notice for the overlap"
git -C "$WORK/seed" push -q origin --delete codex/ui-polish
run_hook resume
expect_no_ctx "codex/ui-polish" "drops branches deleted on GitHub"

echo "scripts/session-start.sh (Codex entry point) prints plain text"
setup
mkdir -p "$WORK/clone/scripts" "$WORK/clone/.claude/hooks"
cp "$HOOK" "$WORK/clone/.claude/hooks/session-start.sh"
cp "$(dirname "$HOOK")/../../scripts/session-start.sh" "$WORK/clone/scripts/session-start.sh"
PLAIN="$(cd "$WORK/clone" && SESSION_START_SKIP_CHECKS=1 bash scripts/session-start.sh 2>/dev/null)"
if [[ "$PLAIN" == *"Agent: codex"* && "$PLAIN" != *'"hookSpecificOutput"'* ]]; then ok "prints the Codex report as plain text"; else bad "wrapper output wrong: ${PLAIN:0:200}"; fi

# Replace the clone with one made by `git clone <args>` and put it on claude/test
reclone() {
  rm -rf "$WORK/clone"
  git clone -q "$@" "file://$WORK/origin.git" "$WORK/clone" 2>/dev/null
}
push_session_branch() { git -C "$WORK/clone" push -q origin claude/test; }

echo "single-branch clone of the session branch → still compared with real production"
setup; push_session_branch; advance_prod 1
reclone --single-branch -b claude/test
run_hook startup
expect_ctx "fast-forwarded to production" "fast-forwards instead of a false ✅"
expect_head "$(git -C "$WORK/origin.git" rev-parse "$PROD")" "HEAD is production HEAD"

echo "shallow clone of an ahead-only session branch → not mistaken for diverged"
setup; commit_local 1; commit_local 2; commit_local 3; push_session_branch
reclone --depth 1 -b claude/test
run_hook resume
expect_ctx "plus 3 unmerged commit(s)" "counts the real 3 unmerged commits"
expect_no_ctx "SESSION-START BLOCKER" "no false divergence"

echo "uncommitted changes already there at a fresh start → notice (ask the user)"
setup
printf 'someone else\n' >> "$WORK/clone/shared.txt"
run_hook startup
expect_ctx "already in the working tree at session start" "asks before touching changes it didn't make"

echo "blocked fast-forward → git's reason and working advice"
setup
(cd "$WORK/seed" && printf 'prod edit\n' >> shared.txt && git commit -qam "prod edits shared" && git push -q origin "$PROD")
printf 'local edit\n' >> "$WORK/clone/shared.txt"
run_hook resume
expect_ctx "git stash push -u && git merge --ff-only" "suggests stash -u then fast-forward"
expect_ctx "git merge origin/$PROD" "or commit and merge"

echo "untracked file that production adds → blocker that names the real reason"
setup
(cd "$WORK/seed" && printf 'prod\n' > newfile.txt && git add newfile.txt && git commit -qm "prod adds newfile" && git push -q origin "$PROD")
printf 'mine\n' > "$WORK/clone/newfile.txt"
run_hook resume
expect_ctx "untracked working tree files would be overwritten" "quotes git's reason"
if grep -q mine "$WORK/clone/newfile.txt"; then ok "untracked file kept"; else bad "untracked file lost"; fi

echo "diverged with uncommitted changes → mentioned, and option (b) never discards them"
setup; commit_local 1; advance_prod 1
printf 'precious\n' >> "$WORK/clone/shared.txt"
run_hook compact
expect_ctx "Uncommitted changes are present" "mentions the uncommitted change"
expect_ctx "start fresh from production" "option (b) starts a fresh branch"
expect_no_ctx "reset --hard" "no destructive reset offered"

echo "merge left in progress → notice, nothing touched"
setup
(cd "$WORK/clone" && printf 'mine\n' >> shared.txt && git commit -qam "mine")
(cd "$WORK/seed" && printf 'theirs\n' >> shared.txt && git commit -qam "theirs" && git push -q origin "$PROD")
git -C "$WORK/clone" fetch -q origin
git -C "$WORK/clone" merge -q "origin/$PROD" >/dev/null 2>&1
run_hook compact
expect_ctx "A git merge is in progress" "reports the merge in progress"
expect_no_ctx "SESSION-START BLOCKER" "no blocker for its own unfinished merge"
if [ -f "$WORK/clone/.git/MERGE_HEAD" ]; then ok "merge state untouched"; else bad "merge state changed"; fi

echo "interrupted end-session merge on production → finish it (notice), blocker only on a fresh start"
setup; commit_local 1
(cd "$WORK/clone" && git checkout -q "$PROD" && git merge -q --no-ff claude/test -m "Merge claude/test into $PROD")
run_hook compact
expect_ctx "end-session merge was interrupted" "explains the unpushed merge"
expect_no_ctx "SESSION-START BLOCKER" "no blocker mid end-session"
run_hook startup
expect_ctx "SESSION-START BLOCKER" "still a blocker on a fresh start on production"

echo "production renamed → an older branch follows the name recorded on production"
setup
(cd "$WORK/seed" && printf 'new-prod\n' > .claude/production-branch && git commit -qam "production is new-prod" && git push -q origin "$PROD" \
  && git checkout -q -b new-prod && printf 'newer\n' > newer.txt && git add newer.txt && git commit -qm "newer" && git push -q origin new-prod)
run_hook resume
expect_ctx "Production is now \`new-prod\`" "notices the rename"
expect_head "$(git -C "$WORK/origin.git" rev-parse new-prod)" "fast-forwarded to the new production branch"

echo "no python3 → still valid JSON (node fallback)"
setup
NOPY="$WORK/nopy-bin"; rm -rf "$NOPY"; mkdir -p "$NOPY"
for c in git node cat grep sed tr awk timeout date sort comm head sha256sum cut dirname mkdir; do
  p="$(command -v "$c")" && ln -sf "$p" "$NOPY/$c"
done
HOOK_PATH="$NOPY" run_hook startup
expect_json
expect_ctx "is at production HEAD" "full report without python3"

echo "SESSION_LOG.md parsing"
setup
printf '# Log\n\n### 2026-02-01 — top\nline one\n#### a sub-heading\nline two\n~~~\n### inside tilde fence\n~~~\nline three\n\n### 2026-01-01 — next\nnext body\n' > "$WORK/clone/SESSION_LOG.md"
run_hook resume
expect_ctx "line two" "keeps #### sub-headings inside an entry"
expect_ctx "line three" "skips headings inside ~~~ fences"
expect_no_ctx "next body" "stops at the next entry"
{ printf '# Log\n\n### top\n```\n'; for i in $(seq 1 400); do printf 'leak %s\n' "$i"; done; printf '### older\nolder body\n'; } > "$WORK/clone/SESSION_LOG.md"
run_hook resume
expect_ctx "entry truncated" "caps an entry with an unclosed fence"
expect_no_ctx "leak 300" "does not flood the context"

echo "SESSION_LOG.md: earlier entries listed; conflict markers ignored"
setup
run_hook resume
expect_ctx "- 2026-01-01 — older (first)" "lists the heading of the earlier entry"
printf '# Log\n\n<<<<<<< HEAD\n### mine\nmine body\n=======\n### theirs\ntheirs body\n>>>>>>> other\n' > "$WORK/clone/SESSION_LOG.md"
run_hook resume
expect_ctx "newest body" "reads the committed log while the file has conflict markers"
expect_no_ctx "<<<<<<<" "never injects conflict markers"

echo "stalled network → gives up quickly"
setup
git -C "$WORK/clone" config protocol.ext.allow always
git -C "$WORK/clone" remote set-url origin 'ext::sleep 120'
START="$(date +%s)"
GIT_NET_TIMEOUT=3 run_hook startup
if [ $(( $(date +%s) - START )) -lt 30 ]; then ok "finished within the time limit"; else bad "hook hung on the network"; fi
expect_ctx "failed (or timed out)" "reports the fetch failure"

echo "settings.json command works from a folder with a space in its name"
setup
SP="$WORK/with space"; rm -rf "$SP"; mkdir -p "$SP/.claude/hooks"
cp "$HOOK" "$SP/.claude/hooks/session-start.sh"
CMD="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["hooks"]["SessionStart"][0]["hooks"][0]["command"])' "$(dirname "$HOOK")/../settings.json")"
SOUT="$(printf '{"source":"startup"}' | CLAUDE_PROJECT_DIR="$SP" CLAUDE_CODE_REMOTE=false sh -c "$CMD" 2>/dev/null)"
if [[ "$SOUT" == *'"hookSpecificOutput"'* ]]; then ok "hook starts from a path with a space"; else bad "hook did not start from a path with a space"; fi

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" = "0" ]
