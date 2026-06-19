"""Minimal YAML loader for note frontmatter — standard library only.

This is NOT a general YAML implementation. It supports exactly the subset our
frontmatter contract uses:

  - block mappings (key: value), nested by indentation
  - block sequences (- item), including sequences of mappings (- key: value)
  - inline flow sequences ([a, b, c]) and flow mappings ({k: v})
  - scalars: quoted/unquoted strings, ints, floats, booleans, null
  - dates (YYYY-MM-DD) are intentionally kept as strings

Keeping this tiny and explicit beats pulling in PyYAML and breaking the
zero-dependency invariant. If a note needs YAML beyond this subset, that's a
signal the frontmatter is doing too much.
"""
from __future__ import annotations

import re
from typing import Any


class YamlError(ValueError):
    pass


def load(text: str) -> dict:
    """Parse a frontmatter YAML document into a Python dict."""
    lines = _logical_lines(text)
    value, idx = _parse_block(lines, 0, 0)
    if idx != len(lines):
        raise YamlError(f"unparsed content at line {lines[idx][2]}: {lines[idx][1]!r}")
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise YamlError("frontmatter must be a mapping at the top level")
    return value


def _logical_lines(text: str) -> list[tuple[int, str, int]]:
    """Return [(indent, content, lineno)] skipping blanks and comment-only lines."""
    out: list[tuple[int, str, int]] = []
    for n, raw in enumerate(text.splitlines(), start=1):
        stripped = _strip_comment(raw)
        if stripped.strip() == "":
            continue
        indent = len(raw) - len(raw.lstrip(" "))
        out.append((indent, stripped.strip(), n))
    return out


def _strip_comment(line: str) -> str:
    """Drop a trailing ' #...' comment when the '#' is outside quotes."""
    in_single = in_double = False
    for i, ch in enumerate(line):
        if ch == "'" and not in_double:
            in_single = not in_single
        elif ch == '"' and not in_single:
            in_double = not in_double
        elif ch == "#" and not in_single and not in_double:
            if i == 0 or line[i - 1] in " \t":
                return line[:i]
    return line


def _parse_block(lines, idx: int, indent: int):
    """Parse a block (mapping or sequence) at >= `indent`. Returns (value, next_idx)."""
    if idx >= len(lines):
        return None, idx
    cur_indent = lines[idx][0]
    if cur_indent < indent:
        return None, idx
    if lines[idx][1].startswith("- "):
        return _parse_sequence(lines, idx, cur_indent)
    return _parse_mapping(lines, idx, cur_indent)


def _parse_mapping(lines, idx: int, indent: int):
    result: dict[str, Any] = {}
    while idx < len(lines):
        line_indent, content, lineno = lines[idx]
        if line_indent < indent:
            break
        if line_indent > indent:
            raise YamlError(f"unexpected indent at line {lineno}: {content!r}")
        if content.startswith("- "):
            break
        key, sep, rest = content.partition(":")
        if not sep:
            raise YamlError(f"expected 'key: value' at line {lineno}: {content!r}")
        key = _unquote(key.strip())
        rest = rest.strip()
        idx += 1
        if rest == "":
            # Nested block follows (mapping or sequence) — or empty value.
            if idx < len(lines) and lines[idx][0] > indent:
                child, idx = _parse_block(lines, idx, lines[idx][0])
                result[key] = child
            elif idx < len(lines) and lines[idx][0] == indent and lines[idx][1].startswith("- "):
                child, idx = _parse_sequence(lines, idx, indent)
                result[key] = child
            else:
                result[key] = None
        else:
            result[key] = _parse_scalar(rest)
    return result, idx


def _parse_sequence(lines, idx: int, indent: int):
    result: list[Any] = []
    while idx < len(lines):
        line_indent, content, lineno = lines[idx]
        if line_indent < indent or not content.startswith("- "):
            break
        if line_indent > indent:
            raise YamlError(f"unexpected indent at line {lineno}: {content!r}")
        item = content[2:].strip()
        idx += 1
        if ":" in item and not _looks_scalar(item):
            # Sequence of mappings: first pair is inline, rest are indented deeper.
            first_key, _, first_rest = item.partition(":")
            mapping: dict[str, Any] = {}
            fr = first_rest.strip()
            if fr:
                mapping[_unquote(first_key.strip())] = _parse_scalar(fr)
            else:
                if idx < len(lines) and lines[idx][0] > indent:
                    child, idx = _parse_block(lines, idx, lines[idx][0])
                    mapping[_unquote(first_key.strip())] = child
                else:
                    mapping[_unquote(first_key.strip())] = None
            # Continuation keys of this mapping are indented past the dash.
            while idx < len(lines) and lines[idx][0] > indent and not lines[idx][1].startswith("- "):
                more, idx = _parse_mapping(lines, idx, lines[idx][0])
                mapping.update(more)
            result.append(mapping)
        else:
            result.append(_parse_scalar(item))
    return result, idx


def _looks_scalar(item: str) -> bool:
    """A '- [a,b]' or '- "x: y"' item is a scalar, not a mapping."""
    return item.startswith(("[", "{", '"', "'"))


def _parse_scalar(token: str) -> Any:
    token = token.strip()
    if token.startswith("[") and token.endswith("]"):
        return _parse_flow_seq(token)
    if token.startswith("{") and token.endswith("}"):
        return _parse_flow_map(token)
    if (token.startswith('"') and token.endswith('"')) or (
        token.startswith("'") and token.endswith("'")
    ):
        return _unquote(token)
    low = token.lower()
    if low in ("true", "yes"):
        return True
    if low in ("false", "no"):
        return False
    if low in ("null", "~", ""):
        return None
    # Keep date-like and version-like strings as strings; only pure ints/floats convert.
    if _is_int(token):
        return int(token)
    if _is_float(token) and "-" not in token:
        return float(token)
    return token


def _parse_flow_seq(token: str) -> list:
    inner = token[1:-1].strip()
    if not inner:
        return []
    return [_parse_scalar(p) for p in _split_flow(inner)]


def _parse_flow_map(token: str) -> dict:
    inner = token[1:-1].strip()
    out: dict[str, Any] = {}
    if not inner:
        return out
    for part in _split_flow(inner):
        k, _, v = part.partition(":")
        out[_unquote(k.strip())] = _parse_scalar(v.strip())
    return out


def _split_flow(inner: str) -> list[str]:
    """Split a flow collection body on top-level commas, respecting quotes/brackets."""
    parts, buf, depth = [], [], 0
    in_single = in_double = False
    for ch in inner:
        if ch == "'" and not in_double:
            in_single = not in_single
        elif ch == '"' and not in_single:
            in_double = not in_double
        if not in_single and not in_double:
            if ch in "[{":
                depth += 1
            elif ch in "]}":
                depth -= 1
            elif ch == "," and depth == 0:
                parts.append("".join(buf).strip())
                buf = []
                continue
        buf.append(ch)
    if buf:
        parts.append("".join(buf).strip())
    return [p for p in parts if p != ""]


def _unquote(s: str) -> str:
    s = s.strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in "\"'":
        body = s[1:-1]
        if s[0] == '"':
            body = body.replace('\\"', '"').replace("\\\\", "\\")
        return body
    return s


def dump(data: dict) -> str:
    """Serialize a frontmatter dict back to YAML in our supported subset.

    Deterministic and round-trippable for the shapes notes use: scalars, flow
    sequences of scalars, block sequences of mappings, and nested mappings.
    """
    if not isinstance(data, dict):
        raise YamlError("top-level frontmatter must be a mapping")
    lines: list[str] = []
    _dump_map(data, 0, lines)
    return "\n".join(lines) + ("\n" if lines else "")


def _dump_map(d: dict, indent: int, out: list[str]) -> None:
    pad = " " * indent
    for key, value in d.items():
        k = _dump_key(str(key))
        if isinstance(value, dict):
            if value:
                out.append(f"{pad}{k}:")
                _dump_map(value, indent + 2, out)
            else:
                out.append(f"{pad}{k}: {{}}")
        elif isinstance(value, list):
            _dump_list(k, value, indent, out)
        else:
            out.append(f"{pad}{k}: {_dump_scalar(value)}")


def _dump_list(key: str, value: list, indent: int, out: list[str]) -> None:
    pad = " " * indent
    if not value:
        out.append(f"{pad}{key}: []")
        return
    if all(not isinstance(v, (dict, list)) for v in value):
        inner = ", ".join(_dump_scalar(v) for v in value)
        out.append(f"{pad}{key}: [{inner}]")
        return
    out.append(f"{pad}{key}:")
    item_pad = " " * indent
    for v in value:
        if isinstance(v, dict):
            items = list(v.items())
            if not items:
                out.append(f"{item_pad}- {{}}")
                continue
            first_k, first_v = items[0]
            fk = _dump_key(str(first_k))
            if isinstance(first_v, (dict, list)):
                out.append(f"{item_pad}- {fk}:")
                tmp: list[str] = []
                if isinstance(first_v, dict):
                    _dump_map(first_v, indent + 4, tmp)
                else:
                    _dump_list(fk, first_v, indent + 2, tmp)
                out.extend(tmp)
            else:
                out.append(f"{item_pad}- {fk}: {_dump_scalar(first_v)}")
            for k2, v2 in items[1:]:
                _dump_map({k2: v2}, indent + 2, out)
        else:
            out.append(f"{item_pad}- {_dump_scalar(v)}")


def _dump_key(k: str) -> str:
    return k if re.match(r"^[A-Za-z_][A-Za-z0-9_-]*$", k) else _quote(k)


def _dump_scalar(v) -> str:
    if v is None:
        return "null"
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        return repr(v)
    s = str(v)
    if s == "":
        return '""'
    needs_quote = (
        s.strip() != s
        or any(c in s for c in ':#[]{}",\'')
        or s.lower() in ("true", "false", "yes", "no", "null", "~")
        or _is_int(s)
        or _is_float(s)
    )
    return _quote(s) if needs_quote else s


def _quote(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _is_int(s: str) -> bool:
    try:
        int(s)
        return True
    except ValueError:
        return False


def _is_float(s: str) -> bool:
    try:
        float(s)
        return True
    except ValueError:
        return False
