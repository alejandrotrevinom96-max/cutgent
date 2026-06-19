# Getting Started — ATM Second Brain (+ Cockpit)

Your second brain is a plain-Markdown vault you own forever, plus an optional
desktop companion (**Cockpit**) that gives it a face and voice. This gets both
running from zero in ~15 minutes. Everything here is copy-paste.

---

## 0. Prerequisites

| Tool | Version | Why |
|------|---------|-----|
| **Python** | 3.11+ | Runs the brain (MCP server, selftest, doctor). **Zero pip deps** — stdlib only. |
| **Node.js** | 22+ | Runs the Cockpit desktop app (optional). |
| **Obsidian** | latest | Reads/edits the vault as linked notes. |
| **Claude Code** | latest | Talks to the brain via the MCP server. |

```bash
python3 --version    # >= 3.11
node --version       # >= 22  (only if you want the app)
```

> The Cockpit spawns the brain with Python, so Python 3.11+ must be on PATH even
> if you only use the app.

---

## 1. Brain setup (Atm_second-brain)

```bash
git clone <ATM_SECOND_BRAIN_URL> Atm_second-brain
cd Atm_second-brain

python3 scripts/brain.py doctor      # environment + integrity health check
python3 scripts/brain.py selftest    # full guardrail corpus (end-to-end)
```

Both should end in **healthy / ALL GREEN**. If `doctor` flags FTS5 or the Python
version, fix that first (see Troubleshooting).

### 1b. Register the MCP server in Claude Code

The repo ships `.mcp.json`, which registers the stdlib server `server/atm_mcp.py`.

```bash
claude            # run from the repo root; approve the server when prompted
/mcp              # verify: the 'atm-second-brain' server is connected
```

You should see its tools: `recall`, `write_with_provenance`, `reindex`,
`graph_export`, `resolve_tier`, `citation_verify`, `mech_status`.

### 1c. Open the vault in Obsidian

1. Obsidian → **Open folder as vault** → select **`Atm_second-brain/vault`**
   (open `vault/`, **not** the repo root).
2. Shipped defaults load from `vault/.obsidian/`: wikilinks on, attachments →
   `attachments/`, daily notes → `journal/`, new notes → `00-inbox/`.

### 1d. Install Templater (required for the daily template)

The daily-note template uses **date math** (yesterday/tomorrow links). Core
plugins can't do math, so install Templater once:

1. Settings → **Community plugins** → turn on → **Browse** → **Templater** →
   Install → Enable.
2. Settings → **Templater**: Template folder = `templates`; enable **Trigger
   Templater on new file creation**.
3. (Optional) Install **Dataview** the same way for live frontmatter queries.

> Community plugins are third-party binaries and aren't shipped in the repo — you
> install them. Only the declarative config (`app.json`, `core-plugins.json`,
> `daily-notes.json`, `templates.json`) is committed.

### 1e. First run

Open **`vault/meta/first-run.md`** and follow it. It walks you through filling your
`personal/` layer, the CONFIRM ritual, capture, and the MOCs **[[Home]]** and
**[[Expertise Packs]]**.

---

## 2. App setup (atm-cockpit) — optional

```bash
git clone <ATM_COCKPIT_URL> atm-cockpit
cd atm-cockpit
npm install
npm run validate        # zero-install gate (selftest + integration) — must pass
```

Point the app at your brain, supply an avatar, run it:

```bash
export ATM_BRAIN="/absolute/path/to/Atm_second-brain"   # PowerShell: $env:ATM_BRAIN="C:\path\to\Atm_second-brain"
# drop a VRM at public/avatar.vrm (you provide it; a placeholder head renders until you do)
npm run dev
```

(Optional `ANTHROPIC_API_KEY` enables the full agent loop; without it a
recall-grounded fallback runs.)

---

## 3. Verify it works

| Check | How | Expected |
|-------|-----|----------|
| Environment | `python3 scripts/brain.py doctor` | all checks OK |
| Brain smoke test | `python3 scripts/brain.py selftest` | ALL GREEN |
| MCP connected | Claude Code → `/mcp` | `atm-second-brain` connected |
| Capture | `scripts/capture.sh "hello"` | a note appears in `vault/00-inbox/` |
| Obsidian links | open `[[Home]]` | wikilinks + backlinks resolve |
| Daily note | command palette → "Daily notes: open today" | new note in `journal/`, prev/next links correct |
| App (optional) | `npm run dev` | window opens, avatar loads, no spawn errors |

---

## Troubleshooting

- **`doctor` says FTS5 missing** → your Python's bundled SQLite lacks FTS5. Install
  Python from python.org (its SQLite includes FTS5) or `brew install python`. The
  brain still works (LIKE fallback), but FTS is faster at scale.
- **MCP server not listed** → run `claude` from the repo root so `.mcp.json` is
  discovered; approve the server.
- **Wikilinks became `[markdown](links)`** → `vault/.obsidian/app.json`
  `useMarkdownLinks` must be `false`; reopen the vault.
- **Daily note shows literal `{{...}}`** → Templater isn't processing it; recheck 1d.
- **App can't find the brain** → `ATM_BRAIN` must be the absolute path to the repo
  root (the folder containing `scripts/brain.py`).
- **Schema out of date** → `python3 scripts/brain.py migrate` (dry-run), then
  `--apply`, then re-run `doctor`.

---

## What's where

- `vault/` — your notes (PARA + concepts + mocs + personal + journal + templates).
- `server/` — the stdlib MCP server. `scripts/brain.py` — CLI (doctor/selftest/
  reindex/recall/capture/migrate). `.claude/skills/` — agent skills + expertise packs.
- `_schema/` + `_migrations/` — the durable note contract and its migration path.
- `selftest/` — the guardrail corpus (`python3 scripts/brain.py selftest`).
- The Cockpit app lives in its own repo (`atm-cockpit`) and depends on this one.
