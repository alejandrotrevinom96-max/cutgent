"""Schema migration runner — the ONLY path from schema vN to vN+1. Stdlib only.

Design (durability D1):
- Migrations live in `_migrations/` as `m{NNNN}_{slug}.py`, each exposing
  FROM_VERSION, TO_VERSION, and `migrate_frontmatter(fm) -> fm`. A migration may
  declare `DROPS = [keys]` to authorize removing fields; dropping anything else is
  LOSSY and forbidden (the runner refuses).
- Dry-run by DEFAULT: nothing is written unless `apply=True`.
- Idempotent: a note already at the target version is skipped; re-running when all
  notes are current is a no-op.
- One migration step = one commit: add one `m{N}` file, run it, commit. `git revert`
  of that commit is the rollback (no separate down-migration needed).
- Writes are re-validated against the target schema before being persisted; an
  invalid result aborts that note (fail-closed).
"""
from __future__ import annotations

import glob
import importlib.util
import os
from typing import Optional

import config
import parser as note_parser
import validate
from miniyaml import dump


def _load_migrations(migrations_dir: Optional[str] = None) -> dict:
    """Return {from_version: module} for all m*.py migrations, validated for sanity."""
    mdir = migrations_dir or os.path.join(config.VAULT_ROOT, "_migrations")
    out: dict[int, object] = {}
    for path in sorted(glob.glob(os.path.join(mdir, "m*.py"))):
        spec = importlib.util.spec_from_file_location(os.path.basename(path)[:-3], path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)  # type: ignore
        fv, tv = getattr(mod, "FROM_VERSION", None), getattr(mod, "TO_VERSION", None)
        if fv is None or tv is None or tv != fv + 1:
            raise ValueError(f"{path}: migrations must declare FROM_VERSION and TO_VERSION=FROM+1")
        if fv in out:
            raise ValueError(f"duplicate migration from version {fv}")
        out[fv] = mod
    return out


def _iter_notes():
    for root, _d, files in os.walk(config.VAULT_DIR):
        for name in files:
            if name.endswith(".md") and not name.endswith(".template.md"):
                abs_path = os.path.join(root, name)
                yield abs_path, os.path.relpath(abs_path, config.VAULT_ROOT)


def run(apply: bool = False, target: Optional[int] = None,
        migrations_dir: Optional[str] = None) -> dict:
    target = target if target is not None else config.current_schema_version()
    migrations = _load_migrations(migrations_dir)
    changed, skipped, errors = [], [], []

    for abs_path, rel in _iter_notes():
        note = note_parser.parse_file(abs_path, rel)
        fm = dict(note.frontmatter)
        v = fm.get("schema_version")
        if not isinstance(v, int):
            errors.append({"path": rel, "error": f"missing/invalid schema_version: {v!r}"})
            continue
        if v == target:
            skipped.append(rel)
            continue
        if v > target:
            errors.append({"path": rel, "error": f"note at v{v} is ahead of target v{target} (no downgrade)"})
            continue

        # apply the chain v -> target, one step per migration
        cur = v
        failed = False
        while cur < target:
            mig = migrations.get(cur)
            if mig is None:
                errors.append({"path": rel, "error": f"no migration from v{cur} to v{cur + 1}"})
                failed = True
                break
            new_fm = mig.migrate_frontmatter(dict(fm))  # type: ignore
            allowed_drops = set(getattr(mig, "DROPS", []))
            dropped = (set(fm) - set(new_fm)) - allowed_drops
            if dropped:
                errors.append({"path": rel, "error": f"lossy migration would drop {sorted(dropped)}"})
                failed = True
                break
            new_fm["schema_version"] = mig.TO_VERSION  # type: ignore
            fm, cur = new_fm, mig.TO_VERSION  # type: ignore
        if failed:
            continue

        errs = validate.validate_frontmatter(fm, target)
        if errs:
            errors.append({"path": rel, "error": "result fails target schema", "details": errs[:3]})
            continue

        if apply:
            body = note.body.strip("\n")
            content = "---\n" + dump(fm) + "---\n\n" + (body + "\n" if body else "")
            with open(abs_path, "w", encoding="utf-8") as fh:
                fh.write(content)
        changed.append({"path": rel, "from": v, "to": target})

    return {
        "target": target, "applied": apply,
        "changed": changed, "skipped": skipped, "errors": errors,
        "summary": {"changed": len(changed), "skipped": len(skipped), "errors": len(errors)},
    }
