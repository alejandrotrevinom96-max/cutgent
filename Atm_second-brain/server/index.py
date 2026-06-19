"""Derived SQLite index + the `reindex` operation. Standard library only.

The markdown is canonical; this index is disposable and rebuildable. WAL mode,
json1, and (when available) FTS5 are all in stdlib sqlite3.

`reindex` is incremental and idempotent: a file whose content hash is unchanged is
skipped, files removed from disk are pruned, and re-running with no source changes
reports zero work and leaves the DB byte-stable.
"""
from __future__ import annotations

import datetime
import json
import os
import sqlite3
from typing import Optional

import config
from capabilities import has_fts5
from parser import Note, parse_file

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS notes (
    id            TEXT PRIMARY KEY,
    path          TEXT UNIQUE NOT NULL,
    title         TEXT,
    type          TEXT,
    created       TEXT,
    updated       TEXT,
    trust_tier    TEXT,
    author        TEXT,
    domain        TEXT,
    schema_version INTEGER,
    body_hash     TEXT,
    file_hash     TEXT,
    body_len      INTEGER,
    body          TEXT,
    frontmatter   TEXT,
    parse_error   TEXT
);
CREATE TABLE IF NOT EXISTS links (
    src_id    TEXT NOT NULL,
    target    TEXT NOT NULL,
    dst_id    TEXT,
    link_type TEXT,
    alias     TEXT,
    heading   TEXT
);
CREATE INDEX IF NOT EXISTS idx_links_src ON links(src_id);
CREATE INDEX IF NOT EXISTS idx_links_dst ON links(dst_id);
CREATE TABLE IF NOT EXISTS tags (
    note_id TEXT NOT NULL,
    tag     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);
CREATE TABLE IF NOT EXISTS aliases (
    note_id TEXT NOT NULL,
    alias   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_aliases_alias ON aliases(alias);
CREATE TABLE IF NOT EXISTS manifest (
    path       TEXT PRIMARY KEY,
    file_hash  TEXT NOT NULL,
    indexed_at TEXT NOT NULL,
    mtime      REAL
);
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
);
CREATE TABLE IF NOT EXISTS embeddings (
    id        TEXT PRIMARY KEY,
    model     TEXT NOT NULL,
    dim       INTEGER NOT NULL,
    body_hash TEXT NOT NULL,
    vec       BLOB NOT NULL
);
"""

FTS_SQL = """
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    id UNINDEXED, title, body, tags, tokenize='unicode61'
);
"""


def connect(db_path: Optional[str] = None) -> sqlite3.Connection:
    path = db_path or config.DB_PATH
    os.makedirs(os.path.dirname(path), exist_ok=True)
    con = sqlite3.connect(path)
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA foreign_keys=ON")
    con.row_factory = sqlite3.Row
    con.executescript(SCHEMA_SQL)
    # Back-compat for indexes created before the mtime fast-path column existed.
    try:
        con.execute("ALTER TABLE manifest ADD COLUMN mtime REAL")
    except sqlite3.OperationalError:
        pass  # column already present
    if has_fts5():
        con.executescript(FTS_SQL)
    con.commit()
    return con


def _iter_markdown(vault_dir: str):
    for root, _dirs, files in os.walk(vault_dir):
        for name in files:
            if name.endswith(".md") and not name.endswith(".template.md"):
                abs_path = os.path.join(root, name)
                rel = os.path.relpath(abs_path, config.VAULT_ROOT)
                yield abs_path, rel


def _upsert_note(con: sqlite3.Connection, note: Note) -> None:
    fm = note.frontmatter
    nid = note.id or note.path  # fall back to path so broken notes are still tracked
    con.execute("DELETE FROM notes WHERE path=?", (note.path,))
    con.execute(
        """INSERT OR REPLACE INTO notes
           (id, path, title, type, created, updated, trust_tier, author, domain,
            schema_version, body_hash, file_hash, body_len, body, frontmatter, parse_error)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            nid, note.path, fm.get("title"), fm.get("type"), str(fm.get("created") or ""),
            str(fm.get("updated") or ""), fm.get("trust_tier"), fm.get("author"),
            fm.get("domain"), fm.get("schema_version"), note.body_hash, note.file_hash,
            len(note.body), note.body, json.dumps(fm, ensure_ascii=False, sort_keys=True),
            note.parse_error,
        ),
    )
    con.execute("DELETE FROM links WHERE src_id=?", (nid,))
    for ln in note.links:
        con.execute(
            "INSERT INTO links (src_id, target, dst_id, link_type, alias, heading) VALUES (?,?,?,?,?,?)",
            (nid, ln.target, None, ln.link_type, ln.alias, ln.heading),
        )
    con.execute("DELETE FROM tags WHERE note_id=?", (nid,))
    for tag in note.tags:
        con.execute("INSERT INTO tags (note_id, tag) VALUES (?,?)", (nid, tag))
    con.execute("DELETE FROM aliases WHERE note_id=?", (nid,))
    for al in note.aliases:
        con.execute("INSERT INTO aliases (note_id, alias) VALUES (?,?)", (nid, str(al)))
    if has_fts5():
        con.execute("DELETE FROM notes_fts WHERE id=?", (nid,))
        con.execute(
            "INSERT INTO notes_fts (id, title, body, tags) VALUES (?,?,?,?)",
            (nid, fm.get("title") or "", note.body, " ".join(note.tags)),
        )


def _remove_note(con: sqlite3.Connection, path: str) -> None:
    row = con.execute("SELECT id FROM notes WHERE path=?", (path,)).fetchone()
    if row:
        nid = row["id"]
        con.execute("DELETE FROM links WHERE src_id=?", (nid,))
        con.execute("DELETE FROM tags WHERE note_id=?", (nid,))
        con.execute("DELETE FROM aliases WHERE note_id=?", (nid,))
        if has_fts5():
            con.execute("DELETE FROM notes_fts WHERE id=?", (nid,))
    con.execute("DELETE FROM notes WHERE path=?", (path,))
    con.execute("DELETE FROM manifest WHERE path=?", (path,))


def _resolve_links(con: sqlite3.Connection) -> int:
    """Resolve link targets to dst_id by id, then alias, then title. Returns #resolved."""
    by_id = {r["id"]: r["id"] for r in con.execute("SELECT id FROM notes")}
    by_alias = {r["alias"]: r["note_id"] for r in con.execute("SELECT alias, note_id FROM aliases")}
    by_title = {}
    for r in con.execute("SELECT id, title FROM notes WHERE title IS NOT NULL"):
        by_title.setdefault(r["title"], r["id"])
    resolved = 0
    for r in con.execute("SELECT rowid, target FROM links").fetchall():
        t = r["target"]
        dst = by_id.get(t) or by_alias.get(t) or by_title.get(t)
        if dst:
            con.execute("UPDATE links SET dst_id=? WHERE rowid=?", (dst, r["rowid"]))
            resolved += 1
    return resolved


def reindex(full: bool = False, db_path: Optional[str] = None) -> dict:
    con = connect(db_path)
    try:
        manifest = {r["path"]: (r["file_hash"], r["mtime"])
                    for r in con.execute("SELECT path, file_hash, mtime FROM manifest")}
        seen: set[str] = set()
        indexed = skipped = errors = 0
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()

        for abs_path, rel in _iter_markdown(config.VAULT_DIR):
            seen.add(rel)
            prev = manifest.get(rel)
            try:
                cur_mtime = os.path.getmtime(abs_path)
            except OSError:
                cur_mtime = None
            # Fast path: unchanged mtime => assume unchanged content, skip parse+hash.
            # This keeps recall O(stat) instead of O(read+hash) per query at scale; a
            # full rebuild (full=True) is always the authoritative fallback.
            if not full and prev is not None and prev[1] is not None and prev[1] == cur_mtime:
                skipped += 1
                continue
            note = parse_file(abs_path, rel)
            # mtime moved but content identical (e.g. git checkout): refresh mtime only.
            if not full and prev is not None and prev[0] == note.file_hash:
                con.execute("UPDATE manifest SET mtime=? WHERE path=?", (cur_mtime, rel))
                skipped += 1
                continue
            _upsert_note(con, note)
            con.execute(
                "INSERT OR REPLACE INTO manifest (path, file_hash, indexed_at, mtime) VALUES (?,?,?,?)",
                (rel, note.file_hash, now, cur_mtime),
            )
            indexed += 1
            if note.parse_error:
                errors += 1

        deleted = 0
        for path in list(manifest):
            if path not in seen:
                _remove_note(con, path)
                deleted += 1

        resolved = _resolve_links(con)
        total_links = con.execute("SELECT COUNT(*) c FROM links").fetchone()["c"]
        broken = con.execute("SELECT COUNT(*) c FROM links WHERE dst_id IS NULL").fetchone()["c"]
        total_notes = con.execute("SELECT COUNT(*) c FROM notes").fetchone()["c"]
        total_tags = con.execute("SELECT COUNT(DISTINCT tag) c FROM tags").fetchone()["c"]
        con.execute(
            "INSERT OR REPLACE INTO meta (key, value) VALUES ('last_reindex', ?)", (now,)
        )
        con.commit()
        return {
            "indexed": indexed, "skipped": skipped, "deleted": deleted, "errors": errors,
            "notes": total_notes, "links": total_links, "links_resolved": resolved,
            "links_broken": broken, "tags": total_tags,
            "fts5": has_fts5(), "full": full,
        }
    finally:
        con.close()


def reindex_tool(args: dict) -> dict:
    summary = reindex(full=bool(args.get("full", False)))
    return {"content": [{"type": "text", "text": json.dumps(summary, indent=2)}]}


def graph_export(limit: int = 5000, db_path: Optional[str] = None) -> dict:
    """Static whole-vault graph for the map view (graph.export/1). Plain stdlib
    SELECTs over the index; clustering/layout are the client's job."""
    import config

    reindex(full=False, db_path=db_path)
    con = connect(db_path)
    try:
        tags_by_note: dict[str, list[str]] = {}
        for r in con.execute("SELECT note_id, tag FROM tags"):
            tags_by_note.setdefault(r["note_id"], []).append(r["tag"])

        nodes = []
        for r in con.execute(
            "SELECT id, title, type FROM notes WHERE parse_error IS NULL ORDER BY id LIMIT ?",
            (limit,),
        ):
            nodes.append({
                "id": r["id"], "title": r["title"], "type": r["type"],
                "tags": tags_by_note.get(r["id"], []),
            })
        node_ids = {n["id"] for n in nodes}

        edges = []
        for r in con.execute(
            "SELECT src_id, dst_id, link_type FROM links WHERE dst_id IS NOT NULL"
        ):
            if r["src_id"] in node_ids and r["dst_id"] in node_ids:
                edges.append({"src": r["src_id"], "dst": r["dst_id"], "type": r["link_type"] or "wikilink"})

        return {
            "schema": "graph.export/1",
            "rev": config.current_rev(),
            "nodes": nodes,
            "edges": edges,
        }
    finally:
        con.close()


def graph_export_tool(args: dict) -> dict:
    result = graph_export(limit=int(args.get("limit", 5000)))
    return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}
