"""Self-test harness: runs the full guardrail regression corpus and the invariant
coverage check. Zero dependencies. Exit code 0 iff everything passes.

    python3 selftest/harness.py
"""
from __future__ import annotations

import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CASES = os.path.join(HERE, "cases")
sys.path.insert(0, HERE)

import invariants  # noqa: E402
import runner  # noqa: E402


def _run_cases() -> tuple[int, int]:
    """Run each cases/test_*.py as a subprocess; return (passed, total)."""
    scripts = sorted(f for f in os.listdir(CASES) if f.startswith("test_") and f.endswith(".py"))
    passed = 0
    for s in scripts:
        proc = subprocess.run([sys.executable, os.path.join(CASES, s)],
                              capture_output=True, text=True)
        line = (proc.stdout.strip().splitlines() or ["<no output>"])[-1]
        status = "PASS" if proc.returncode == 0 else "FAIL"
        print(f"  [{status}] {s} — {line}")
        if proc.returncode == 0:
            passed += 1
        elif proc.stderr.strip():
            print("     stderr:", proc.stderr.strip().splitlines()[-1])
    return passed, len(scripts)


def main() -> int:
    failures = 0

    print("== write fixtures (red/green) ==")
    fixtures = runner.all_fixtures()
    for fx in fixtures:
        ok, detail = runner.run_fixture(fx)
        tag = "✓" if ok else "✗"
        print(f"  [{ 'PASS' if ok else 'FAIL'}] {fx['name']} [{fx['invariant']}] {tag} {detail}")
        if not ok:
            failures += 1

    print("\n== programmatic cases ==")
    passed, total = _run_cases()
    failures += (total - passed)

    print("\n== invariant coverage ==")
    cov = invariants.coverage_report()
    print(f"  invariants: {cov['total']} | uncovered: {cov['uncovered']} | "
          f"missing fixtures: {cov['missing_fixtures']}")
    if not cov["ok"]:
        failures += 1
        print("  [FAIL] coverage incomplete")
    else:
        print(f"  [PASS] 100% invariant coverage ({cov['total']}/{cov['total']})")

    print("\n" + ("=" * 48))
    if failures == 0:
        print("SELFTEST: ALL GREEN ✅")
        return 0
    print(f"SELFTEST: {failures} FAILURE(S) ❌")
    return 1


if __name__ == "__main__":
    sys.exit(main())
