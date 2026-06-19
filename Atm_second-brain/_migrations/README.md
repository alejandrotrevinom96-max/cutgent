# _migrations/

Schema migrations — the **only** path from schema vN to vN+1 (durability D1).
Run them with `python3 scripts/brain.py migrate` (dry-run) / `--apply`.

## Authoring a migration

1. Publish the new schema, immutably: add `_schema/schema.vN.{md,json}` (never edit
   old versions) and bump `_schema/CURRENT` to `N`.
2. Add ONE file here named `m{NNNN}_{slug}.py` exposing:

   ```python
   FROM_VERSION = 1
   TO_VERSION = 2            # must be FROM_VERSION + 1
   # DROPS = ["old_field"]   # OPTIONAL — authorize removing these keys; anything
   #                         # else removed is treated as LOSSY and refused.

   def migrate_frontmatter(fm: dict) -> dict:
       # pure transform of one note's frontmatter; the runner sets schema_version.
       return fm
   ```

3. Dry-run first: `python3 scripts/brain.py migrate` (writes nothing; shows changes).
4. Apply + commit: `python3 scripts/brain.py migrate --apply` then commit **this one
   migration** as a single commit. `git revert` of that commit is the rollback.

## Guarantees (enforced by the runner + selftest P12)

- **Dry-run by default** — nothing is written unless `--apply`.
- **Idempotent** — notes already at the target are skipped; re-running is a no-op.
- **Re-validated** — each migrated note must pass the target schema, or it's aborted.
- **Lossy-forbidden** — dropping a field not listed in `DROPS` is refused.
- **No downgrades** — a note ahead of the target version is refused.
