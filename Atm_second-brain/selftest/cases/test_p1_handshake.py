"""P1 gate: a minimal MCP client that handshakes with atm_mcp.py over stdio and
lists tools. Standard library only. Run:  python3 selftest/cases/test_p1_handshake.py
"""
from __future__ import annotations

import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SERVER = os.path.join(ROOT, "server", "atm_mcp.py")

EXPECTED_TOOLS = {
    "recall",
    "write_with_provenance",
    "reindex",
    "resolve_tier",
    "citation_verify",
    "mech_status",
}


def main() -> int:
    proc = subprocess.Popen(
        [sys.executable, SERVER],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )
    assert proc.stdin and proc.stdout

    def send(obj: dict) -> None:
        proc.stdin.write(json.dumps(obj) + "\n")
        proc.stdin.flush()

    def recv() -> dict:
        line = proc.stdout.readline()
        return json.loads(line)

    ok = True

    def check(name: str, cond: bool, detail: str = "") -> None:
        nonlocal ok
        print(f"[{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
        if not cond:
            ok = False

    try:
        # 1. initialize handshake
        send({"jsonrpc": "2.0", "id": 1, "method": "initialize",
              "params": {"protocolVersion": "2025-06-18", "capabilities": {}}})
        init = recv()
        check("initialize returns a result", "result" in init, json.dumps(init)[:200])
        res = init.get("result", {})
        check("protocolVersion present", "protocolVersion" in res)
        check("serverInfo.name is atm-second-brain",
              res.get("serverInfo", {}).get("name") == "atm-second-brain")
        check("declares tools capability", "tools" in res.get("capabilities", {}))

        # 2. initialized notification (no response expected)
        send({"jsonrpc": "2.0", "method": "notifications/initialized"})

        # 3. tools/list
        send({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
        listed = recv()
        tools = {t["name"] for t in listed.get("result", {}).get("tools", [])}
        check("tools/list returns the canonical set", tools == EXPECTED_TOOLS,
              f"got={sorted(tools)}")
        check("every tool has an inputSchema",
              all("inputSchema" in t for t in listed.get("result", {}).get("tools", [])))

        # 4. unknown method => METHOD_NOT_FOUND error, loop survives
        send({"jsonrpc": "2.0", "id": 3, "method": "does/notexist"})
        err = recv()
        check("unknown method returns error -32601",
              err.get("error", {}).get("code") == -32601, json.dumps(err)[:160])

        # 5. tools/call on a stub => clean NOT_IMPLEMENTED, server stays alive
        send({"jsonrpc": "2.0", "id": 4, "method": "tools/call",
              "params": {"name": "recall", "arguments": {"query": "x"}}})
        callres = recv()
        check("stub tool returns NOT_IMPLEMENTED (-32001)",
              callres.get("error", {}).get("code") == -32001, json.dumps(callres)[:160])

    finally:
        proc.stdin.close()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()

    print()
    print("P1 GATE:", "ALL PASS ✅" if ok else "FAILURES ❌")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
