# ops/ — operational templates

## SessionStart hook (Claude Code on the web)

`session-start.sh` makes a web session self-verifying: it installs Node deps (so
`npm run dev`/`npm run typecheck` work) and runs the zero-install headless gate
`npm run validate` (selftest + integration). These files are **inert templates**
here — enabling a hook is a deliberate, opt-in step, so they don't live in the
active `.claude/` path until you put them there.

### Enable it in the atm-cockpit repo

```sh
mkdir -p .claude/hooks
cp ops/session-start.sh .claude/hooks/session-start.sh
chmod +x .claude/hooks/session-start.sh
# then merge ops/session-start.settings.json into .claude/settings.json
```

Once `.claude/settings.json` + `.claude/hooks/session-start.sh` are committed to
the repo's default branch, every future web session runs it on start.

### Trade-off (synchronous)

As written the hook is **synchronous**: the session waits until it finishes.
- Pro: deps + gate are ready before the agent acts (no race conditions).
- Con: slightly slower session start.
To make it async, prepend `echo '{"async": true, "asyncTimeout": 300000}'` as the
first line and let it run in the background.

### Verify it locally

```sh
CLAUDE_CODE_REMOTE=true ./.claude/hooks/session-start.sh
```
