#!/bin/sh
# capture.sh — model-free, network-free, never-blocked capture into the inbox.
#
# Writes a schema-valid note to vault/00-inbox/ using only POSIX sh + date.
# This is the MECH-tier capture path: it works with no model, no network, and
# no Python. Refine captured notes later (the agent/reindex enrich them).
#
#   scripts/capture.sh "a thought worth keeping"
#   echo "piped thought" | scripts/capture.sh
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
INBOX="${ATM_INBOX:-$ROOT/vault/00-inbox}"

TEXT="$*"
if [ -z "$TEXT" ]; then
    TEXT=$(cat)
fi
[ -n "$TEXT" ] || TEXT="(empty capture)"

TS=$(date -u +%Y%m%d%H%M%S)
DAY=$(date -u +%Y-%m-%d)
mkdir -p "$INBOX"

# Title = first line, trimmed; escape double quotes for YAML.
TITLE=$(printf '%s' "$TEXT" | head -n1 | cut -c1-72 | sed 's/"/\\"/g')
[ -n "$TITLE" ] || TITLE="Captured note"

FILE="$INBOX/${TS}-capture.md"
cat > "$FILE" <<EOF
---
schema_version: 1
id: "${TS}-capture"
title: "$TITLE"
type: note
created: $DAY
updated: $DAY
trust_tier: self-authored
author: human
tags: [inbox, capture]
---

$TEXT
EOF

printf '%s\n' "$FILE"
