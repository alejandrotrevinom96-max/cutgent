"""Note parser: a markdown file -> structured record. Standard library only.

Extracts frontmatter (via miniyaml), wikilinks (with alias/heading + typed-link
prefix), inline #tags, and content hashes. No SQLite here — pure parsing so it's
trivially testable.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from typing import Any, Optional

import miniyaml

_FRONTMATTER = re.compile(r"^---[ \t]*\n(.*?)\n---[ \t]*\n?(.*)\Z", re.S)
# [[target]], [[target|alias]], [[target#heading]], [[target#heading|alias]]
_WIKILINK = re.compile(r"\[\[([^\]\|#]+)(?:#([^\]\|]+))?(?:\|([^\]]+))?\]\]")
# typed-link prefix immediately before a wikilink, e.g.  supports:: [[X]]
_TYPED = re.compile(r"([a-z][a-z0-9_-]*)::\s*$")
# inline tag: #tag or #area/health (not inside a word, not a markdown heading)
_INLINE_TAG = re.compile(r"(?<![\w/#])#([a-z0-9][a-z0-9/_-]*)")
# fenced code blocks are excluded from tag/link scanning
_FENCE = re.compile(r"^```", re.M)


@dataclass
class Link:
    target: str
    alias: Optional[str] = None
    heading: Optional[str] = None
    link_type: Optional[str] = None


@dataclass
class Note:
    path: str  # vault-relative
    frontmatter: dict
    body: str
    links: list[Link] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    body_hash: str = ""
    file_hash: str = ""
    parse_error: Optional[str] = None

    @property
    def id(self) -> Optional[str]:
        v = self.frontmatter.get("id")
        return str(v) if v is not None else None

    @property
    def aliases(self) -> list[str]:
        a = self.frontmatter.get("aliases") or []
        return [str(x) for x in a] if isinstance(a, list) else []


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def split_frontmatter(text: str) -> tuple[Optional[str], str]:
    m = _FRONTMATTER.match(text)
    if not m:
        return None, text
    return m.group(1), m.group(2)


def _strip_code_fences(body: str) -> str:
    """Blank out fenced code so we don't harvest tags/links from code samples."""
    out, inside = [], False
    for line in body.splitlines():
        if line.lstrip().startswith("```"):
            inside = not inside
            out.append("")
            continue
        out.append("" if inside else line)
    return "\n".join(out)


def parse_text(rel_path: str, text: str) -> Note:
    fm_raw, body = split_frontmatter(text)
    note = Note(path=rel_path, frontmatter={}, body=body)
    note.file_hash = sha256(text)
    note.body_hash = sha256(body)

    if fm_raw is None:
        note.parse_error = "missing frontmatter"
        return note
    try:
        fm = miniyaml.load(fm_raw)
    except miniyaml.YamlError as exc:
        note.parse_error = f"yaml: {exc}"
        return note
    note.frontmatter = fm

    # frontmatter tags
    tags: list[str] = []
    for t in fm.get("tags") or []:
        tags.append(str(t))

    scan = _strip_code_fences(body)
    # inline tags
    for m in _INLINE_TAG.finditer(scan):
        tags.append(m.group(1))
    note.tags = sorted(dict.fromkeys(tags))  # dedupe, stable

    # wikilinks (+ optional typed-link prefix on the same line)
    for m in _WIKILINK.finditer(scan):
        target = m.group(1).strip()
        heading = (m.group(2) or "").strip() or None
        alias = (m.group(3) or "").strip() or None
        line_start = scan.rfind("\n", 0, m.start()) + 1
        prefix = scan[line_start:m.start()]
        tm = _TYPED.search(prefix)
        link_type = tm.group(1) if tm else None
        note.links.append(Link(target=target, alias=alias, heading=heading, link_type=link_type))

    return note


def parse_file(abs_path: str, rel_path: str) -> Note:
    with open(abs_path, encoding="utf-8") as fh:
        return parse_text(rel_path, fh.read())
