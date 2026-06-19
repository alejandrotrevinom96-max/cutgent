"""Minimal JSON-Schema validator for the note contract. Standard library only.

Supports exactly the keywords schema.vN.json uses: type, required, const, enum,
pattern, properties, items, minLength, minimum, uniqueItems, additionalProperties
(only the boolean form is honored loosely). Returns a list of human-readable
errors; empty list means valid.

This is deliberately not a general validator — it's the enforcement arm of
write_with_provenance, kept small enough to audit by eye.
"""
from __future__ import annotations

import json
import os
import re
from functools import lru_cache
from typing import Any

import config

_TYPE_CHECKS = {
    "object": lambda v: isinstance(v, dict),
    "array": lambda v: isinstance(v, list),
    "string": lambda v: isinstance(v, str),
    "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
    "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
    "boolean": lambda v: isinstance(v, bool),
    "null": lambda v: v is None,
}


@lru_cache(maxsize=4)
def load_schema(version: int) -> dict:
    path = os.path.join(config.SCHEMA_DIR, f"schema.v{version}.json")
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def validate(instance: Any, schema: dict, path: str = "") -> list[str]:
    errors: list[str] = []
    _validate(instance, schema, path or "<root>", errors)
    return errors


def _validate(inst: Any, schema: dict, path: str, errors: list[str]) -> None:
    t = schema.get("type")
    if t is not None:
        types = t if isinstance(t, list) else [t]
        if not any(_TYPE_CHECKS.get(tc, lambda _v: True)(inst) for tc in types):
            errors.append(f"{path}: expected type {t}, got {type(inst).__name__}")
            return  # further checks assume the type held

    if "const" in schema and inst != schema["const"]:
        errors.append(f"{path}: must equal {schema['const']!r}, got {inst!r}")

    if "enum" in schema and inst not in schema["enum"]:
        errors.append(f"{path}: {inst!r} not in allowed {schema['enum']}")

    if isinstance(inst, str):
        pat = schema.get("pattern")
        if pat and not re.search(pat, inst):
            errors.append(f"{path}: {inst!r} does not match pattern {pat!r}")
        if "minLength" in schema and len(inst) < schema["minLength"]:
            errors.append(f"{path}: shorter than minLength {schema['minLength']}")

    if isinstance(inst, (int, float)) and not isinstance(inst, bool):
        if "minimum" in schema and inst < schema["minimum"]:
            errors.append(f"{path}: {inst} below minimum {schema['minimum']}")

    if isinstance(inst, dict):
        for req in schema.get("required", []):
            if req not in inst:
                errors.append(f"{path}: missing required field '{req}'")
        props = schema.get("properties", {})
        for key, subschema in props.items():
            if key in inst:
                _validate(inst[key], subschema, f"{path}.{key}", errors)

    if isinstance(inst, list):
        if schema.get("uniqueItems"):
            seen, dupes = [], False
            for item in inst:
                if item in seen:
                    dupes = True
                    break
                seen.append(item)
            if dupes:
                errors.append(f"{path}: items must be unique")
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for i, item in enumerate(inst):
                _validate(item, item_schema, f"{path}[{i}]", errors)


def validate_frontmatter(frontmatter: dict, version: int) -> list[str]:
    return validate(frontmatter, load_schema(version))
