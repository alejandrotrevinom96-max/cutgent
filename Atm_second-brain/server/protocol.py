"""JSON-RPC 2.0 framing + MCP constants — standard library only.

MCP's stdio transport carries newline-delimited JSON-RPC 2.0 messages: one
message per line, no embedded newlines. This module hand-rolls exactly that, with
no third-party dependency.
"""
from __future__ import annotations

import json
import sys
from typing import Any, Optional, TextIO

# The MCP protocol revision this server speaks. Clients negotiate during
# `initialize`; we echo back the version we support.
PROTOCOL_VERSION = "2025-06-18"

JSONRPC_VERSION = "2.0"

# JSON-RPC 2.0 standard error codes.
PARSE_ERROR = -32700
INVALID_REQUEST = -32600
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602
INTERNAL_ERROR = -32603
# MCP/application reserved range (server-defined): -32000 .. -32099
NOT_IMPLEMENTED = -32001
GUARDRAIL_REJECTED = -32002


class RpcError(Exception):
    """An error that maps cleanly onto a JSON-RPC error object."""

    def __init__(self, code: int, message: str, data: Any = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.data = data

    def to_obj(self) -> dict:
        obj: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.data is not None:
            obj["data"] = self.data
        return obj


def read_message(stream: TextIO = sys.stdin) -> Optional[dict]:
    """Read one newline-delimited JSON-RPC message. Returns None at EOF.

    Blank lines are skipped. A line that isn't valid JSON raises RpcError so the
    caller can emit a proper parse-error response.
    """
    while True:
        line = stream.readline()
        if line == "":  # EOF
            return None
        line = line.strip()
        if not line:
            continue
        try:
            return json.loads(line)
        except json.JSONDecodeError as exc:
            raise RpcError(PARSE_ERROR, f"Invalid JSON: {exc}") from exc


def write_message(obj: dict, stream: TextIO = sys.stdout) -> None:
    """Write one JSON-RPC message as a single line and flush."""
    stream.write(json.dumps(obj, ensure_ascii=False, separators=(",", ":")))
    stream.write("\n")
    stream.flush()


def make_result(req_id: Any, result: Any) -> dict:
    return {"jsonrpc": JSONRPC_VERSION, "id": req_id, "result": result}


def make_error(req_id: Any, err: RpcError) -> dict:
    return {"jsonrpc": JSONRPC_VERSION, "id": req_id, "error": err.to_obj()}


def log(*args: Any) -> None:
    """Diagnostics go to stderr; stdout is reserved for protocol traffic."""
    print("[atm_mcp]", *args, file=sys.stderr, flush=True)
