#!/usr/bin/env python3
"""ATM Second Brain — MCP server (standard library only).

Entry point. Speaks MCP over stdio (newline-delimited JSON-RPC 2.0). Run directly:

    python3 server/atm_mcp.py

The script's own directory is on sys.path, so sibling modules import plainly.

Surface B of the design: a thin server exposing the canonical, server-enforced
operations. The heavy lifting (retrieval reasoning, synthesis) happens on Surface A
(Claude Code over the vault). Here we only enforce invariants.
"""
from __future__ import annotations

import os
import sys

# Make sibling modules importable when launched as a script from any cwd.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from capabilities import sqlite_features  # noqa: E402
from protocol import (  # noqa: E402
    INTERNAL_ERROR,
    INVALID_PARAMS,
    METHOD_NOT_FOUND,
    PROTOCOL_VERSION,
    RpcError,
    log,
    make_error,
    make_result,
    read_message,
    write_message,
)
from tools import TOOLS, list_tools  # noqa: E402

SERVER_INFO = {"name": "atm-second-brain", "version": "0.1.0"}


def handle_initialize(_params: dict) -> dict:
    feats = sqlite_features()
    log(f"initialize — sqlite {feats['sqlite_version']}, fts5={feats['fts5']}")
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "capabilities": {"tools": {"listChanged": False}},
        "serverInfo": SERVER_INFO,
        # Non-standard but harmless: surface our runtime mode for diagnostics.
        "instructions": (
            "Canonical ops only; the model proposes, the server disposes. "
            f"Index mode: {'fts5' if feats['fts5'] else 'like-fallback'}."
        ),
    }


def handle_tools_list(_params: dict) -> dict:
    return {"tools": list_tools()}


def handle_tools_call(params: dict) -> dict:
    name = params.get("name")
    args = params.get("arguments") or {}
    if name not in TOOLS:
        raise RpcError(INVALID_PARAMS, f"Unknown tool: {name!r}", data={"tool": name})
    if not isinstance(args, dict):
        raise RpcError(INVALID_PARAMS, "arguments must be an object")
    result = TOOLS[name]["handler"](args)
    # MCP tool results are content blocks; we return text by default.
    if isinstance(result, dict) and "content" in result:
        return result
    return {"content": [{"type": "text", "text": str(result)}]}


# method -> (handler, is_notification)
METHODS = {
    "initialize": (handle_initialize, False),
    "tools/list": (handle_tools_list, False),
    "tools/call": (handle_tools_call, False),
}

# Notifications we accept and intentionally ignore (no response allowed).
NOTIFICATIONS = {"notifications/initialized", "initialized"}


def dispatch(msg: dict) -> dict | None:
    """Return a response object, or None for notifications."""
    method = msg.get("method")
    req_id = msg.get("id")

    if method in NOTIFICATIONS:
        return None
    if req_id is None and method not in METHODS:
        # An unknown notification: ignore silently per JSON-RPC.
        return None

    if method not in METHODS:
        return make_error(req_id, RpcError(METHOD_NOT_FOUND, f"Method not found: {method!r}"))

    handler, _ = METHODS[method]
    try:
        result = handler(msg.get("params") or {})
        return make_result(req_id, result)
    except RpcError as err:
        return make_error(req_id, err)
    except Exception as exc:  # noqa: BLE001 — last-resort guard keeps the loop alive
        log("internal error:", repr(exc))
        return make_error(req_id, RpcError(INTERNAL_ERROR, f"Internal error: {exc}"))


def serve() -> None:
    log("starting; protocol", PROTOCOL_VERSION)
    while True:
        try:
            msg = read_message()
        except RpcError as err:
            write_message(make_error(None, err))
            continue
        if msg is None:
            log("eof; shutting down")
            return
        response = dispatch(msg)
        if response is not None:
            write_message(response)


if __name__ == "__main__":
    serve()
