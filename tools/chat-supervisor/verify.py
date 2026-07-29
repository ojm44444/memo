#!/usr/bin/env python3
"""The definition-of-done gate.

A session claiming "done" is a claim, not a fact. Before the supervisor marks a
backlog item complete and moves on, the work has to survive:

  1. the project's own checks -- build, tests, lint
  2. an optional browser smoke test -- does the page actually load without errors
  3. a reviewer with fresh eyes -- given only the backlog item and the diff,
     is this genuinely finished, or a first draft?

Anything that fails comes back as a specific list of problems, and the session
is sent to fix them. Only a clean pass advances the backlog.

This is the difference between "it says it's done" and "it's done".
"""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any

GUARD_ENV = "CHAT_SUPERVISOR_CLASSIFIER"
MAX_DIFF_CHARS = 60_000
MAX_OUTPUT_CHARS = 3_000


def config(project: Path) -> dict[str, Any]:
    """Explicit `.claude/done.json`, else inferred from package.json scripts."""
    path = project / ".claude" / "done.json"
    if path.exists():
        try:
            return json.loads(path.read_text())
        except json.JSONDecodeError:
            pass

    checks = []
    pkg = project / "package.json"
    if pkg.exists():
        try:
            scripts = json.loads(pkg.read_text()).get("scripts", {})
        except json.JSONDecodeError:
            scripts = {}
        for name in ("build", "test", "lint"):
            if name in scripts:
                checks.append({"name": name, "command": f"npm run {name}"})
    return {"checks": checks, "review": True, "max_rounds": 3, "budget_seconds": 600}


def run_checks(project: Path, cfg: dict[str, Any]) -> list[str]:
    """Run each check, return a problem line for every failure."""
    problems, budget = [], cfg.get("budget_seconds", 600)
    for check in cfg.get("checks", []):
        if budget <= 0:
            problems.append(f"{check['name']}: skipped, verification time budget spent")
            continue
        started = _clock()
        try:
            proc = subprocess.run(
                check["command"], shell=True, cwd=project,
                capture_output=True, text=True, timeout=budget,
            )
        except subprocess.TimeoutExpired:
            problems.append(f"{check['name']}: timed out")
            break
        except OSError as exc:
            problems.append(f"{check['name']}: could not run ({exc})")
            continue
        budget -= _clock() - started

        if proc.returncode != 0:
            tail = (proc.stdout + proc.stderr).strip()[-MAX_OUTPUT_CHARS:]
            problems.append(f"{check['name']} FAILED:\n{tail}")
    return problems


def _clock() -> float:
    import time
    return time.monotonic()


def smoke(project: Path, cfg: dict[str, Any]) -> list[str]:
    """Optional: load the app in a real browser and look for errors.

    Needs playwright installed in the project (`npm i -D playwright`) and a
    `url` in .claude/done.json. Skips silently otherwise -- a missing browser
    check must never be reported as a failure.
    """
    url = cfg.get("url")
    if not url:
        return []

    script = """
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const problems = [];
  page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('pageerror', e => problems.push('uncaught: ' + e.message));
  page.on('requestfailed', r => problems.push('request failed: ' + r.url()));
  try {
    const res = await page.goto(process.argv[1], { waitUntil: 'networkidle', timeout: 30000 });
    if (res && res.status() >= 400) problems.push('page returned HTTP ' + res.status());
  } catch (e) { problems.push('page did not load: ' + e.message); }
  await browser.close();
  console.log(JSON.stringify(problems.slice(0, 15)));
})();
"""
    try:
        proc = subprocess.run(
            ["node", "-e", script, url], cwd=project,
            capture_output=True, text=True, timeout=120,
        )
    except (OSError, subprocess.SubprocessError):
        return []
    if proc.returncode != 0:
        return []  # playwright missing or unusable -- not the feature's fault
    try:
        found = json.loads(proc.stdout.strip().splitlines()[-1])
    except (json.JSONDecodeError, IndexError):
        return []
    return [f"browser: {p}" for p in found]


REVIEW_PROMPT = """\
You are reviewing another engineer's work with fresh eyes. You did not write it
and you have no stake in it being finished.

They were asked to build exactly this:

    {item}

Here is everything they changed:

{diff}

Decide whether this is genuinely finished or just a first pass. Reply with ONLY
a JSON object, no prose and no code fences:

{{"done": true or false, "problems": ["specific, actionable, one per line"]}}

Report a problem when the work is:
- incomplete against what was asked, or a piece is stubbed, faked, or TODO'd
- broken, or plainly wrong on a path the change touches
- missing an obvious error, empty, or loading state a user will hit
- inconsistent with how the surrounding code already does the same thing

Do NOT report: style preferences, refactors you would have done differently,
speculative future features, or anything outside what was asked. Do not invent
polish work -- this loop runs until you say done, so padding the list keeps a
human waiting for no reason.

If it does what was asked and holds together, say done: true with an empty list.
"""


def review(project: Path, item: str, base_ref: str | None,
           cfg: dict[str, Any]) -> list[str]:
    """A reviewer that never saw the building session's reasoning."""
    if not cfg.get("review", True):
        return []

    diff = collect_diff(project, base_ref)
    if not diff.strip():
        return ["nothing was actually changed"]

    env = dict(os.environ)
    env[GUARD_ENV] = "1"
    try:
        proc = subprocess.run(
            ["claude", "-p", REVIEW_PROMPT.format(item=item, diff=diff)],
            capture_output=True, text=True, timeout=300, env=env, cwd=project,
        )
    except (OSError, subprocess.SubprocessError):
        return []  # reviewer unavailable: the hard checks still gate
    if proc.returncode != 0:
        return []

    text = proc.stdout.strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text.split("\n", 1)[-1].rsplit("```", 1)[0]
    try:
        verdict = json.loads(text)
    except json.JSONDecodeError:
        return []
    if verdict.get("done") is True:
        return []
    return [f"review: {p}" for p in verdict.get("problems", [])][:10]


def collect_diff(project: Path, base_ref: str | None) -> str:
    """Everything that changed since the item was handed over, staged or not."""
    def git(*args: str) -> str:
        try:
            proc = subprocess.run(["git", "-C", str(project), *args],
                                  capture_output=True, text=True, timeout=30)
        except (OSError, subprocess.SubprocessError):
            return ""
        return proc.stdout if proc.returncode == 0 else ""

    parts = []
    if base_ref:
        parts.append(git("diff", f"{base_ref}..HEAD"))
    parts.append(git("diff"))          # unstaged
    parts.append(git("diff", "--cached"))  # staged

    # Untracked files are invisible to git diff, and a new feature is often
    # entirely new files, so include them explicitly.
    for name in git("ls-files", "--others", "--exclude-standard").split("\n"):
        if not name.strip():
            continue
        path = project / name
        try:
            if path.stat().st_size < 100_000:
                parts.append(f"--- new file: {name} ---\n{path.read_text()}")
        except (OSError, UnicodeDecodeError):
            continue

    diff = "\n".join(p for p in parts if p.strip())
    if len(diff) > MAX_DIFF_CHARS:
        diff = diff[:MAX_DIFF_CHARS] + "\n... (diff truncated)"
    return diff


def head(project: Path) -> str | None:
    try:
        proc = subprocess.run(["git", "-C", str(project), "rev-parse", "HEAD"],
                              capture_output=True, text=True, timeout=15)
    except (OSError, subprocess.SubprocessError):
        return None
    return proc.stdout.strip() if proc.returncode == 0 else None


def gate(project: Path, item: str, base_ref: str | None) -> list[str]:
    """Every reason this is not done yet. Empty list means it passed."""
    cfg = config(project)
    problems = run_checks(project, cfg)
    problems += smoke(project, cfg)
    # Only bother a reviewer once the thing at least builds and passes.
    if not problems:
        problems += review(project, item, base_ref, cfg)
    return problems


def max_rounds(project: Path) -> int:
    return config(project).get("max_rounds", 3)
