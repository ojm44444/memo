#!/usr/bin/env python3
"""Per-project backlogs, shared by the Stop hook and the `cs` CLI.

A backlog is a plain markdown checklist at `.claude/backlog.md` inside each
project. You own it, you can edit it by hand, and it lives in git:

    # Backlog
    - [ ] Add saved views
    - [~] Rebuild the empty state      <- handed to a session, in progress
    - [x] Fix the mobile nav overlap   <- done

When a session finishes something, the supervisor marks its item done and hands
over the next unchecked one *verbatim*. It never invents work. Empty backlog
means the session stops and tells you.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

TODO = re.compile(r"^\s*-\s*\[ \]\s*(.+?)\s*$")
DOING = re.compile(r"^\s*-\s*\[~\]\s*(.+?)\s*$")


def home() -> Path:
    override = os.environ.get("CHAT_SUPERVISOR_HOME")
    root = Path(override) if override else Path.home() / ".claude" / "chat-supervisor"
    root.mkdir(parents=True, exist_ok=True)
    return root


# --- project registry -----------------------------------------------------


def registry() -> dict[str, str]:
    path = home() / "projects.json"
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return {}


def link(name: str, path: str) -> None:
    reg = registry()
    reg[name] = str(Path(path).resolve())
    (home() / "projects.json").write_text(json.dumps(reg, indent=2))


def resolve(name: str | None, cwd: str | None = None) -> Path | None:
    """A project name, or the project containing cwd."""
    if name:
        found = registry().get(name)
        return Path(found) if found else None
    here = Path(cwd or os.getcwd()).resolve()
    for root in registry().values():
        if here == Path(root) or Path(root) in here.parents:
            return Path(root)
    return here if (here / ".claude").exists() else here


# --- backlog file ---------------------------------------------------------


def backlog_path(project: Path) -> Path:
    d = project / ".claude"
    d.mkdir(parents=True, exist_ok=True)
    path = d / "backlog.md"
    if not path.exists():
        path.write_text("# Backlog\n\nOne line per item, top of the list is next.\n\n")
    return path


def add(project: Path, item: str) -> None:
    path = backlog_path(project)
    text = path.read_text().rstrip("\n")
    path.write_text(f"{text}\n- [ ] {item.strip()}\n")


def items(project: Path) -> list[tuple[str, str]]:
    """Every checklist line as (status, text) where status is todo/doing/done."""
    path = project / ".claude" / "backlog.md"
    if not path.exists():
        return []
    out = []
    for line in path.read_text().splitlines():
        if match := TODO.match(line):
            out.append(("todo", match.group(1)))
        elif match := DOING.match(line):
            out.append(("doing", match.group(1)))
        elif re.match(r"^\s*-\s*\[x\]\s*", line, re.IGNORECASE):
            out.append(("done", re.sub(r"^\s*-\s*\[x\]\s*", "", line, flags=re.I)))
    return out


def _rewrite(project: Path, text: str, marker: str) -> bool:
    path = project / ".claude" / "backlog.md"
    if not path.exists():
        return False
    lines, changed = [], False
    for line in path.read_text().splitlines():
        match = TODO.match(line) or DOING.match(line)
        if not changed and match and match.group(1) == text:
            indent = line[: len(line) - len(line.lstrip())]
            lines.append(f"{indent}- [{marker}] {text}")
            changed = True
        else:
            lines.append(line)
    if changed:
        path.write_text("\n".join(lines) + "\n")
    return changed


def take_next(project: Path) -> str | None:
    """Claim the next unstarted item and mark it in progress."""
    for status, text in items(project):
        if status == "todo":
            _rewrite(project, text, "~")
            return text
    return None


def mark_done(project: Path, text: str) -> bool:
    return _rewrite(project, text, "x")


# --- the human-only parking list -----------------------------------------


def park(project: Path, note: str) -> None:
    """Record something only the human can do, so the session can skip it."""
    path = project / ".claude" / "NEEDS-YOU.md"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("# Needs you\n\nThings a session could not do itself.\n\n")
    text = path.read_text().rstrip("\n")
    note = " ".join(note.split())
    if note in text:  # don't stack the same request every time it comes up
        return
    path.write_text(f"{text}\n- [ ] {note}\n")


def parked(project: Path) -> list[str]:
    path = project / ".claude" / "NEEDS-YOU.md"
    if not path.exists():
        return []
    return [m.group(1) for m in (TODO.match(l) for l in path.read_text().splitlines()) if m]
