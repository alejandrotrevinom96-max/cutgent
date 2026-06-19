"""P6 gate: valid MCP/hook config, MECH-mode reporting, and model-free capture.

Run:  python3 selftest/cases/test_p6_config_capture.py
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "server"))

ok = True


def check(name: str, cond: bool, detail: str = "") -> None:
    global ok
    print(f"[{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    if not cond:
        ok = False


def main() -> int:
    # 1. .mcp.json valid + points at the server
    with open(os.path.join(ROOT, ".mcp.json")) as fh:
        mcp = json.load(fh)
    srv = mcp.get("mcpServers", {}).get("atm-second-brain", {})
    check(".mcp.json is valid and registers atm-second-brain",
          srv.get("command") == "python3" and srv.get("args") == ["server/atm_mcp.py"], str(srv))

    # 2. .claude/settings.json valid + has hooks
    with open(os.path.join(ROOT, ".claude", "settings.json")) as fh:
        settings = json.load(fh)
    hooks = settings.get("hooks", {})
    check("hooks config is valid JSON with SessionStart + PostToolUse",
          "SessionStart" in hooks and "PostToolUse" in hooks, str(list(hooks)))

    # 3. MECH status reports offline / no-model availability
    import mech
    st = mech.status()
    check("MECH status: no model and no network required",
          st["model_required"] is False and st["network_required"] is False and st["cost"] == "$0",
          str({k: st[k] for k in ("model_required", "network_required", "cost")}))

    # 4. capture works with NO model and NO network — pure shell into a temp inbox.
    with tempfile.TemporaryDirectory() as tmp:
        env = dict(os.environ, ATM_INBOX=tmp)
        proc = subprocess.run(
            ["sh", os.path.join(ROOT, "scripts", "capture.sh"), "Remember to test MECH capture"],
            capture_output=True, text=True, env=env,
        )
        check("capture.sh exits 0", proc.returncode == 0, proc.stderr.strip())
        created = proc.stdout.strip()
        check("capture.sh created a note in the inbox",
              created and os.path.exists(created), created)

        if created and os.path.exists(created):
            import parser as note_parser
            import validate
            note = note_parser.parse_file(created, os.path.relpath(created, tmp))
            errs = validate.validate_frontmatter(note.frontmatter, 1)
            check("captured note has schema-valid frontmatter", errs == [], str(errs))
            check("captured note id matches id pattern",
                  bool(re.match(r"^[0-9]{14}-[a-z0-9-]+$", str(note.frontmatter.get("id")))),
                  str(note.frontmatter.get("id")))
            check("captured body preserved", "MECH capture" in note.body, note.body[:60])

        # 5. python capture path mirrors it
        proc2 = subprocess.run(
            [sys.executable, os.path.join(ROOT, "scripts", "brain.py"), "capture", "Second thought"],
            capture_output=True, text=True, env=env,
        )
        check("brain.py capture exits 0 and writes a file",
              proc2.returncode == 0 and os.path.exists(proc2.stdout.strip()), proc2.stderr.strip())

    print()
    print("P6 GATE:", "ALL PASS ✅" if ok else "FAILURES ❌")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
