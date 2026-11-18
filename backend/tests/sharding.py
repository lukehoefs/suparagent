"""Split the backend suite into CI shards, whole test files at a time.

    PYTEST_SHARD=2/4 uv run pytest -q     # the second of four shards

Every shard collects the whole suite and keeps only the files assigned to it.
Assignment is the same on every shard: files, slowest first, each go to the
least loaded shard, using the seconds per file in ci_durations.json (a file not
listed there counts as the median). So the shards partition the suite and every
test runs in exactly one of them. Files are kept whole so module fixtures, and
the order of tests within a file, stay as in a full run.

With PYTEST_SHARD_REPORT=<path> a shard also writes what it collected, kept and
ran. CI checks those reports together (`python tests/sharding.py check <dir>`)
and they refresh ci_durations.json (`python tests/sharding.py durations <dir>`).

This module imports only the standard library at the top: the check runs
without the backend installed.
"""

from __future__ import annotations

import hashlib
import json
import os
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

DURATIONS_FILE = Path(__file__).with_name("ci_durations.json")


def parse_shard(value: str) -> tuple[int, int]:
    """'2/4' -> (2, 4); shards count from 1."""
    try:
        index, total = (int(part) for part in value.split("/"))
    except ValueError:
        raise ValueError(f"PYTEST_SHARD must look like 2/4, not {value!r}") from None
    if not 1 <= index <= total:
        raise ValueError(f"PYTEST_SHARD {value!r}: the shard must be between 1 and {total}")
    return index, total


def assign(files: list[str], seconds: dict[str, float], total: int) -> dict[str, int]:
    """Map each file to a shard (1..total), balancing the known seconds."""
    known = [seconds[name] for name in files if name in seconds]
    default = statistics.median(known) if known else 1.0
    weight = {name: seconds.get(name, default) for name in files}
    load = [0.0] * total
    shard_of = {}
    # Slowest first; ties by name so every shard computes the same answer.
    for name in sorted(files, key=lambda n: (-weight[n], n)):
        target = min(range(total), key=lambda i: (load[i], i))
        shard_of[name] = target + 1
        load[target] += weight[name]
    return shard_of


def file_of(nodeid: str) -> str:
    return nodeid.split("::", 1)[0]


def digest(nodeids) -> str:
    return hashlib.sha256("\n".join(sorted(nodeids)).encode()).hexdigest()


class ShardPlugin:
    """Keeps this shard's files and records what ran, for the CI check."""

    def __init__(self, config, index: int, total: int, kind: str):
        self.config = config
        self.index, self.total, self.kind = index, total, kind
        self.report_path = os.environ.get("PYTEST_SHARD_REPORT")
        self.collected: list[str] = []
        self.selected: list[str] = []
        self.outcomes: dict[str, str] = {}
        self.seconds: dict[str, float] = defaultdict(float)

    def pytest_collection_modifyitems(self, config, items):
        self.collected = [item.nodeid for item in items]
        durations = {}
        if DURATIONS_FILE.exists():
            durations = json.loads(DURATIONS_FILE.read_text()).get(self.kind, {})
        files = sorted({file_of(nodeid) for nodeid in self.collected})
        shard_of = assign(files, durations, self.total)
        keep = [item for item in items if shard_of[file_of(item.nodeid)] == self.index]
        drop = [item for item in items if shard_of[file_of(item.nodeid)] != self.index]
        if drop:
            config.hook.pytest_deselected(items=drop)
        items[:] = keep
        self.selected = [item.nodeid for item in keep]

    def pytest_runtest_logreport(self, report):
        self.seconds[file_of(report.nodeid)] += report.duration
        if report.when == "call" or report.outcome != "passed":
            # The call decides, unless setup or teardown failed or skipped.
            if report.failed and report.when != "call":
                self.outcomes[report.nodeid] = "error"
            elif self.outcomes.get(report.nodeid) != "error":
                self.outcomes[report.nodeid] = "xfailed" if hasattr(report, "wasxfail") else report.outcome

    def pytest_report_header(self, config):
        return f"shard {self.index}/{self.total} ({self.kind}), split by file"

    def pytest_sessionfinish(self, session, exitstatus):
        if not self.report_path:
            return
        report = {
            "kind": self.kind,
            "shard": self.index,
            "shards": self.total,
            "exitstatus": int(exitstatus),
            "collected": len(self.collected),
            "collected_sha256": digest(self.collected),
            "selected": self.selected,
            "outcomes": self.outcomes,
            "seconds": {name: round(value, 2) for name, value in sorted(self.seconds.items())},
        }
        path = Path(self.report_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(report, indent=1))


def configure(config, kind: str) -> None:
    """Called from conftest: turns sharding on when PYTEST_SHARD is set."""
    value = os.environ.get("PYTEST_SHARD")
    if not value:
        return
    index, total = parse_shard(value)
    config.pluginmanager.register(ShardPlugin(config, index, total, kind), "ci-shard")


# --- CI side: check the shards' reports together -----------------------------


def load_reports(folder: str) -> dict[str, list[dict]]:
    by_kind = defaultdict(list)
    for path in sorted(Path(folder).rglob("*.json")):
        report = json.loads(path.read_text())
        by_kind[report["kind"]].append(report)
    return by_kind


def check(folder: str, expected_kinds: list[str]) -> int:
    """Every test collected ran in exactly one shard. Prints a summary table."""
    problems = []
    lines = ["| suite | shard | files | tests | passed | failed | skipped | other | test seconds |",
             "|---|---|---|---|---|---|---|---|---|"]
    by_kind = load_reports(folder)
    for kind in expected_kinds:
        reports = sorted(by_kind.get(kind, []), key=lambda r: r["shard"])
        if not reports:
            problems.append(f"{kind}: no shard reports")
            continue
        total = reports[0]["shards"]
        shards = [r["shard"] for r in reports]
        if sorted(shards) != list(range(1, total + 1)):
            problems.append(f"{kind}: expected shards 1..{total}, got {shards}")
        if len({(r["collected"], r["collected_sha256"]) for r in reports}) != 1:
            problems.append(f"{kind}: the shards collected different suites")
        seen = Counter(nodeid for r in reports for nodeid in r["selected"])
        twice = [nodeid for nodeid, count in seen.items() if count > 1]
        if twice:
            problems.append(f"{kind}: {len(twice)} tests in more than one shard, e.g. {twice[:3]}")
        if len(seen) != reports[0]["collected"] or digest(seen) != reports[0]["collected_sha256"]:
            problems.append(f"{kind}: shards kept {len(seen)} tests, the suite has {reports[0]['collected']}")
        for r in reports:
            not_run = set(r["selected"]) - set(r["outcomes"])
            if not_run:
                problems.append(f"{kind} shard {r['shard']}: {len(not_run)} kept tests never ran, e.g. {sorted(not_run)[:3]}")
            counts = Counter(r["outcomes"].values())
            other = sum(counts.values()) - counts["passed"] - counts["failed"] - counts["skipped"]
            lines.append(
                f"| {kind} | {r['shard']}/{total} | {len({file_of(n) for n in r['selected']})} "
                f"| {len(r['selected'])} | {counts['passed']} | {counts['failed']} | {counts['skipped']} "
                f"| {other} | {sum(r['seconds'].values()):.0f} |"
            )
        ran = sum(len(r["outcomes"]) for r in reports)
        lines.append(f"| **{kind}** | **all** | | **{len(seen)}** of {reports[0]['collected']} collected | | | | | ran {ran} |")
    summary = "\n".join(lines)
    print(summary)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as out:
            out.write("### Backend test shards\n\n" + summary + "\n")
    for problem in problems:
        print(f"::error::{problem}")
    return 1 if problems else 0


def durations(folder: str) -> int:
    """Print a fresh ci_durations.json from the shards' reports."""
    merged = {}
    for kind, reports in sorted(load_reports(folder).items()):
        seconds = defaultdict(float)
        for r in reports:
            for name, value in r["seconds"].items():
                seconds[name] += value
        merged[kind] = {name: round(value, 1) for name, value in sorted(seconds.items())}
    print(json.dumps(merged, indent=1, sort_keys=True))
    return 0


if __name__ == "__main__":
    command, folder, *rest = sys.argv[1:]
    if command == "check":
        raise SystemExit(check(folder, rest or ["sqlite", "postgres"]))
    if command == "durations":
        raise SystemExit(durations(folder))
    raise SystemExit(f"unknown command {command!r}: use check or durations")
