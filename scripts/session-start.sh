#!/usr/bin/env bash
# Start-of-session check for agents without Claude Code hooks — Codex runs this as its first
# command (see AGENTS.md). It runs the same checks as Claude's SessionStart hook
# (.claude/hooks/session-start.sh): sync with production without discarding anything, other
# agents' unmerged branches, npm ci / typecheck / lint / test, and the newest SESSION_LOG.md entry.
#
#   bash scripts/session-start.sh            # start of a task
#   bash scripts/session-start.sh resume     # picking a task back up
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
printf '{"source":"%s"}' "${1:-startup}" \
  | CLAUDE_PROJECT_DIR="$ROOT" CLAUDE_CODE_REMOTE=true SESSION_START_AGENT="${SESSION_START_AGENT:-codex}" \
    bash "$ROOT/.claude/hooks/session-start.sh" 2>/dev/null \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["hookSpecificOutput"]["additionalContext"])'
