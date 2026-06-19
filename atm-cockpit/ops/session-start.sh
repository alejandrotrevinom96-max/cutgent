#!/bin/bash
# SessionStart hook for atm-cockpit (Claude Code on the web) — TEMPLATE.
# This file is INERT here. To enable it in the atm-cockpit repo:
#   mkdir -p .claude/hooks
#   cp ops/session-start.sh .claude/hooks/session-start.sh
#   chmod +x .claude/hooks/session-start.sh
#   # then merge ops/session-start.settings.json into .claude/settings.json
#
# What it does on session start:
#   1) installs Node deps so `npm run dev` / `npm run typecheck` work in-session
#      (container state is cached after the hook, so the cost is paid once), and
#   2) runs the zero-install headless gate `npm run validate`
#      (tools/selftest.mjs + tools/integration.mjs).
# Idempotent, non-interactive, web-only. Never aborts session startup on a red
# gate — it reports and continues so you can fix it inside the session.
set -uo pipefail

# Web sessions only; on a local machine this is a no-op.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# 1) Dependencies (best-effort; the headless gate below needs none).
if [ -f package.json ]; then
  echo "[session-start] installing node deps…"
  npm install --no-audit --no-fund || echo "[session-start] npm install failed — continuing (the headless gate is zero-install)"
fi

# 2) Zero-install headless gate. integration.mjs auto-SKIPs if the sibling brain
#    (../Atm_second-brain) isn't present, so this stays green in a cockpit-only repo.
echo "[session-start] running npm run validate…"
npm run validate || echo "[session-start] validate reported issues (see output above)"

echo "[session-start] done."
