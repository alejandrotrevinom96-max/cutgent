"""Path/config resolution — standard library only.

The vault root is the directory that contains both `vault/` and `_schema/`. We
find it from $ATM_VAULT_ROOT, else by walking up from this file, else cwd. The
derived index lives under `.atm/` (gitignored) so the markdown stays canonical.
"""
from __future__ import annotations

import os


def _looks_like_root(path: str) -> bool:
    return os.path.isdir(os.path.join(path, "vault")) and os.path.isdir(
        os.path.join(path, "_schema")
    )


def find_vault_root() -> str:
    env = os.environ.get("ATM_VAULT_ROOT")
    if env and _looks_like_root(env):
        return os.path.abspath(env)

    here = os.path.dirname(os.path.abspath(__file__))
    candidate = here
    for _ in range(6):
        if _looks_like_root(candidate):
            return candidate
        parent = os.path.dirname(candidate)
        if parent == candidate:
            break
        candidate = parent

    cwd = os.getcwd()
    if _looks_like_root(cwd):
        return cwd
    # Fall back to the parent of server/ even if incomplete, so errors are clear.
    return os.path.dirname(here)


VAULT_ROOT = find_vault_root()
VAULT_DIR = os.path.join(VAULT_ROOT, "vault")
SCHEMA_DIR = os.path.join(VAULT_ROOT, "_schema")
INDEX_DIR = os.path.join(VAULT_ROOT, ".atm")
DB_PATH = os.path.join(INDEX_DIR, "index.db")


def current_schema_version() -> int:
    with open(os.path.join(SCHEMA_DIR, "CURRENT"), encoding="utf-8") as fh:
        return int(fh.read().strip())
