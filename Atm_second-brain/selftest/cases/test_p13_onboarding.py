"""P13 gate: onboarding/setup config (Section 2).

- the .obsidian config files parse and point at the right vault-relative folders
- the daily-notes config references the real daily template (which exists)
- SETUP.md exists
- `brain.py doctor` runs healthy (exit 0) on the real vault

Run:  python3 selftest/cases/test_p13_onboarding.py
"""
from __future__ import annotations

import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OBS = os.path.join(ROOT, "vault", ".obsidian")

ok = True


def check(name, cond, detail=""):
    global ok
    print(f"[{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    if not cond:
        ok = False


def main() -> int:
    # 1. .obsidian config parses
    cfgs = {}
    for f in ["app.json", "core-plugins.json", "templates.json", "daily-notes.json"]:
        p = os.path.join(OBS, f)
        if not os.path.exists(p):
            check(f".obsidian/{f} exists", False)
            continue
        try:
            cfgs[f] = json.load(open(p))
            check(f".obsidian/{f} parses", True)
        except Exception as e:  # noqa: BLE001
            check(f".obsidian/{f} parses", False, str(e))

    # 2. vault-relative correctness + wikilinks preserved
    app = cfgs.get("app.json", {})
    check("wikilinks preserved (useMarkdownLinks=false)", app.get("useMarkdownLinks") is False)
    check("attachments path is vault-relative", app.get("attachmentFolderPath") == "attachments")
    check("new notes default to 00-inbox", app.get("newFileFolderPath") == "00-inbox")

    core = cfgs.get("core-plugins.json", [])
    check("core-plugins is the array form with daily-notes + templates",
          isinstance(core, list) and "daily-notes" in core and "templates" in core)

    daily = cfgs.get("daily-notes.json", {})
    check("daily notes folder = journal", daily.get("folder") == "journal")
    tmpl = daily.get("template", "")
    check("daily template path points at the real template",
          tmpl == "templates/daily.template.md"
          and os.path.exists(os.path.join(ROOT, "vault", "templates", "daily.template.md")), tmpl)

    tpl = cfgs.get("templates.json", {})
    check("core Templates folder = templates", tpl.get("folder") == "templates")

    # 3. SETUP doc
    check("SETUP.md exists", os.path.exists(os.path.join(ROOT, "SETUP.md")))

    # 4. doctor runs healthy
    proc = subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "brain.py"), "doctor"],
                          capture_output=True, text=True)
    check("brain.py doctor exits 0 (healthy)", proc.returncode == 0,
          (proc.stdout.strip().splitlines() or [""])[-1])

    print()
    print("P13 GATE:", "ALL PASS ✅" if ok else "FAILURES ❌")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
