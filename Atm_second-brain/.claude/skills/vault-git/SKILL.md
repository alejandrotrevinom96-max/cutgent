---
name: vault-git
description: Commit and version vault changes with clean, reversible history. Use when saving a batch of note changes, after a maintenance pass, after a schema migration, or when the user asks to commit, snapshot, or sync the vault. Treats git as the durability and rollback mechanism.
---

# Vault git discipline

Markdown + git is the source of truth. The derived index (`.atm/`) is never
committed — it rebuilds from the notes.

## Commit hygiene

- Group related note changes into one logical commit with a descriptive message
  (what changed and why, not "update").
- One migration = one commit, so `git revert` of that commit is a clean rollback
  (see `docs/adr/` and `_migrations/`).
- Don't commit `.atm/`, `__pycache__/`, or editor cruft — `.gitignore` covers
  these; verify with `git status` before committing.

## Before committing

- Run `python3 scripts/brain.py selftest`. A red selftest means a guardrail or
  durability property broke — fix before committing, don't commit around it.
- For schema changes, confirm the new `schema.vN.*` files are append-only (the
  old versions are untouched) and a migration exists.

## Reversibility is the point

Every commit should leave the vault in a plain-markdown-survivable state: a human
with only a text editor can still read every note. If a change would break that,
it's the wrong change.
