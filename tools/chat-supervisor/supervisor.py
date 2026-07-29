#!/usr/bin/env python3
"""Stop hook that decides whether a finished Claude Code session should be
auto-continued or handed back to the human.

Claude Code fires the Stop hook the moment a session finishes responding. That
is a deterministic "it stopped building" signal, so nothing here polls, watches
a screen, or guesses. On each stop we classify why the session stopped and then
either:

  * let it stop and notify you             (work is complete)
  * feed it an instruction and keep going  (routine stall, low risk)
  * let it stop and escalate to you        (decision needed, or risky, or stuck)

Escalation is not a dead end: `cs reply` resumes the session headlessly with
your answer, so you can unblock a build from a phone.

Reads the hook payload as JSON on stdin, writes a hook decision as JSON on
stdout. See tools/chat-supervisor/README.md.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
import backlog  # noqa: E402  (must follow the sys.path line above)

# Set in the classifier subprocess so its own Stop hook no-ops instead of
# recursing into another classifier call.
GUARD_ENV = "CHAT_SUPERVISOR_CLASSIFIER"

COMPLETE = "complete"
STALLED_ROUTINE = "stalled_routine"
NEEDS_DECISION = "needs_decision"
BLOCKED_EXTERNAL = "blocked_external"


# --------------------------------------------------------------------------
# paths, config, state
# --------------------------------------------------------------------------


def home() -> Path:
    """Where state lives. Outside the repo: sessions span many projects."""
    override = os.environ.get("CHAT_SUPERVISOR_HOME")
    root = Path(override) if override else Path.home() / ".claude" / "chat-supervisor"
    root.mkdir(parents=True, exist_ok=True)
    return root


def load_policy() -> dict[str, Any]:
    defaults = json.loads((SCRIPT_DIR / "policy.json").read_text())
    local = home() / "policy.json"
    if local.exists():
        try:
            defaults.update(json.loads(local.read_text()))
        except json.JSONDecodeError as exc:
            log_audit({"event": "policy_parse_error", "path": str(local), "error": str(exc)})
    return defaults


def state_path(session_id: str) -> Path:
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", session_id) or "unknown"
    d = home() / "state"
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{safe}.json"


def load_state(session_id: str) -> dict[str, Any]:
    path = state_path(session_id)
    if path.exists():
        try:
            return json.loads(path.read_text())
        except json.JSONDecodeError:
            pass
    return {
        "session_id": session_id,
        "consecutive_auto_continues": 0,
        "consecutive_no_progress": 0,
        "auto_continues_today": 0,
        "day": date.today().isoformat(),
        "fingerprint": None,
    }


def save_state(state: dict[str, Any]) -> None:
    state["updated_at"] = now()
    state_path(state["session_id"]).write_text(json.dumps(state, indent=2))


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def append_jsonl(name: str, record: dict[str, Any]) -> None:
    record.setdefault("at", now())
    with (home() / name).open("a") as fh:
        fh.write(json.dumps(record) + "\n")


def log_audit(record: dict[str, Any]) -> None:
    append_jsonl("audit.jsonl", record)


# --------------------------------------------------------------------------
# progress fingerprint
# --------------------------------------------------------------------------


def fingerprint(cwd: str) -> str | None:
    """A cheap signature of the working tree, used to notice a spinning agent.

    An agent that stops repeatedly without changing a single file is not making
    progress, whatever its messages claim.
    """
    def git(*args: str) -> str | None:
        try:
            proc = subprocess.run(["git", "-C", cwd, *args],
                                  capture_output=True, text=True, timeout=15)
        except (OSError, subprocess.SubprocessError):
            return None
        return proc.stdout if proc.returncode == 0 else None

    head = git("rev-parse", "HEAD")
    if head is None:
        return None

    # -uall lists untracked files individually; without it git collapses a whole
    # new directory to one line and an agent writing new files looks frozen.
    # The diff covers edits to tracked files, which the status alone misses.
    status = git("status", "--porcelain", "-uall") or ""
    diff = git("diff") or ""

    # hashlib, not hash(): str hashing is salted per process, so hash() would
    # produce a different value every run and never detect a stuck session.
    digest = hashlib.sha1((status + diff).encode()).hexdigest()[:12]
    return f"{head.strip()}:{digest}"


# --------------------------------------------------------------------------
# classification
# --------------------------------------------------------------------------


CLASSIFIER_PROMPT = """\
You are triaging an autonomous coding agent that just stopped mid-project.
Below is the last thing it said. Decide why it stopped and whether a supervisor
can safely answer on the human's behalf.

Reply with ONLY a JSON object, no prose and no code fences:

{{
  "state": one of "complete" | "stalled_routine" | "needs_decision" | "blocked_external",
  "risk": one of "none" | "low" | "high",
  "summary": one sentence, under 140 characters, describing what it wants,
  "reply": the instruction to send back so it resumes, or "" if a human must answer
}}

Definitions:
- "complete": the task is finished and nothing is being asked. reply must be "".
- "stalled_routine": it paused but the next step is obvious and mechanical
  (asked permission to continue, finished a sub-step, hit a trivial choice with
  a clear best answer, asked whether to run tests or fix an error it described).
- "needs_decision": it needs a judgement only the human can make -- product or
  design direction, ambiguous requirements, trade-offs, anything about money,
  credentials, deleting data, deploying, or work outside the stated task.
- "blocked_external": it cannot proceed without something outside its control
  (a missing secret, a down service, an access grant).

Set "risk" to "high" whenever acting on the wrong answer would be hard to undo:
deletions, force pushes, schema or data migrations, production deploys, spending
money, touching credentials, or rewriting files not mentioned in the task.

Only "stalled_routine" with risk "none" or "low" is ever auto-answered, so when
you are unsure, prefer "needs_decision". A needless interruption costs a moment;
a wrong auto-answer can cost the work.

Write "reply" as a direct instruction to the agent, in the imperative, telling it
exactly what to do next. Never invent facts the agent did not provide.

--- LAST MESSAGE FROM THE AGENT ---
{message}
--- END ---
"""


def strip_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n", "", text)
        text = re.sub(r"\n```$", "", text.strip())
    return text.strip()


def classify(message: str, policy: dict[str, Any]) -> dict[str, Any] | None:
    """Ask a small model why the session stopped. None means 'could not tell'."""
    env = dict(os.environ)
    env[GUARD_ENV] = "1"

    cmd = [
        "claude",
        "-p", CLASSIFIER_PROMPT.format(message=message[: policy["max_message_chars"]]),
        "--model", policy["classifier_model"],
    ]
    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True,
            timeout=policy["classifier_timeout_seconds"], env=env,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        log_audit({"event": "classifier_failed", "error": str(exc)})
        return None

    if proc.returncode != 0:
        log_audit({"event": "classifier_nonzero", "code": proc.returncode,
                   "stderr": proc.stderr[-500:]})
        return None

    try:
        verdict = json.loads(strip_fences(proc.stdout))
    except json.JSONDecodeError:
        log_audit({"event": "classifier_unparseable", "stdout": proc.stdout[-500:]})
        return None

    if verdict.get("state") not in {COMPLETE, STALLED_ROUTINE, NEEDS_DECISION, BLOCKED_EXTERNAL}:
        log_audit({"event": "classifier_bad_state", "verdict": verdict})
        return None
    return verdict


def hard_denied(message: str, policy: dict[str, Any]) -> str | None:
    """Deny-list veto applied before and above the classifier.

    The model can only ever downgrade an auto-continue to an escalation; it can
    never talk its way past this list. Returns a human-readable label.
    """
    for rule in policy["deny_patterns"]:
        if re.search(rule["pattern"], message, re.IGNORECASE):
            return rule["label"]
    return None


# --------------------------------------------------------------------------
# notification
# --------------------------------------------------------------------------


def notify(title: str, body: str, priority: str = "default") -> None:
    custom = os.environ.get("CHAT_SUPERVISOR_NOTIFY_CMD")
    if custom:
        try:
            subprocess.run(custom, shell=True, input=f"{title}\n{body}",
                           text=True, timeout=20)
            return
        except (OSError, subprocess.SubprocessError) as exc:
            log_audit({"event": "notify_cmd_failed", "error": str(exc)})

    topic = os.environ.get("CHAT_SUPERVISOR_NTFY_TOPIC")
    if topic:
        try:
            req = urllib.request.Request(
                f"https://ntfy.sh/{topic}",
                data=body.encode(),
                headers={"Title": title, "Priority": priority},
            )
            urllib.request.urlopen(req, timeout=15).close()
        except (urllib.error.URLError, OSError) as exc:
            log_audit({"event": "notify_ntfy_failed", "error": str(exc)})


# --------------------------------------------------------------------------
# hook decisions
# --------------------------------------------------------------------------


def emit(payload: dict[str, Any]) -> None:
    json.dump(payload, sys.stdout)
    sys.stdout.write("\n")
    sys.exit(0)


def allow_stop(system_message: str | None = None) -> None:
    emit({"systemMessage": system_message} if system_message else {})


def keep_going(instruction: str) -> None:
    emit({"decision": "block", "reason": instruction})


def supersede_inbox(session_id: str) -> str | None:
    """Retire any question already pending for this session.

    A session can only be blocked on one thing at a time, so a new escalation
    replaces the old one rather than stacking another line in the inbox.
    Returns the reason of the entry it replaced, if there was one.
    """
    path = home() / "inbox.jsonl"
    if not path.exists():
        return None
    entries, replaced = [], None
    for line in path.read_text().splitlines():
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        if entry.get("session_id") == session_id and not entry.get("resolved"):
            entry["resolved"] = True
            entry["superseded"] = True
            replaced = entry.get("reason")
        entries.append(entry)
    path.write_text("".join(json.dumps(e) + "\n" for e in entries))
    return replaced


def escalate(state: dict[str, Any], ctx: dict[str, Any], reason: str,
             summary: str, question: str) -> None:
    """Hand the session back to the human and put it in the inbox."""
    state["consecutive_auto_continues"] = 0
    state["pending"] = {"reason": reason, "summary": summary, "at": now()}
    save_state(state)

    replaced = supersede_inbox(ctx["session_id"])

    append_jsonl("inbox.jsonl", {
        "session_id": ctx["session_id"],
        "cwd": ctx["cwd"],
        "project": Path(ctx["cwd"]).name,
        "reason": reason,
        "summary": summary,
        "question": question[:4000],
        "resolved": False,
    })
    log_audit({"event": "escalate", "session_id": ctx["session_id"],
               "reason": reason, "summary": summary, "superseded": replaced})

    # Don't buzz the phone again for a question that is already waiting.
    if replaced != reason:
        notify(f"needs you: {Path(ctx['cwd']).name}", summary, priority="high")
    allow_stop(f"chat-supervisor: escalated to you ({reason}). Answer with: "
               f"cs reply {ctx['session_id'][:8]} \"...\"")


# --------------------------------------------------------------------------


def read_last_message(payload: dict[str, Any]) -> str:
    """Prefer the payload field; fall back to the transcript for older builds."""
    message = (payload.get("last_assistant_message") or "").strip()
    if message:
        return message

    path = payload.get("transcript_path")
    if not path or not Path(path).exists():
        return ""
    try:
        lines = Path(path).read_text().splitlines()
    except OSError:
        return ""
    for line in reversed(lines):
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        if entry.get("type") != "assistant":
            continue
        content = entry.get("message", {}).get("content", [])
        texts = [c.get("text", "") for c in content
                 if isinstance(c, dict) and c.get("type") == "text"]
        if any(t.strip() for t in texts):
            return "\n".join(texts).strip()
    return ""


def main() -> None:
    # A classifier subprocess must never trigger another classifier.
    if os.environ.get(GUARD_ENV):
        allow_stop()

    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        allow_stop()

    policy = load_policy()
    if not policy.get("enabled", True) or os.environ.get("CHAT_SUPERVISOR_DISABLE"):
        allow_stop()

    ctx = {
        "session_id": payload.get("session_id") or "unknown",
        "cwd": payload.get("cwd") or os.getcwd(),
    }
    message = read_last_message(payload)
    if not message:
        allow_stop()

    state = load_state(ctx["session_id"])
    state["cwd"] = ctx["cwd"]
    state["last_message"] = message[:2000]

    today = date.today().isoformat()
    if state.get("day") != today:
        state["day"] = today
        state["auto_continues_today"] = 0

    # --- guards that run before any model call -----------------------------

    denied = hard_denied(message, policy)
    if denied:
        escalate(state, ctx, "needs your sign-off",
                 f"Wants to touch {denied} -- that needs you.", message)

    if state["consecutive_auto_continues"] >= policy["auto_continue_max_consecutive"]:
        escalate(state, ctx, "auto-continue budget spent",
                 f"Auto-continued {state['consecutive_auto_continues']}x without "
                 f"you. Pausing for a look.", message)

    if state["auto_continues_today"] >= policy["daily_auto_continue_cap"]:
        escalate(state, ctx, "daily cap reached",
                 f"Hit the daily cap of {policy['daily_auto_continue_cap']} "
                 f"auto-continues.", message)

    current = fingerprint(ctx["cwd"])
    if current is not None and current == state.get("fingerprint"):
        state["consecutive_no_progress"] += 1
    else:
        state["consecutive_no_progress"] = 0
    state["fingerprint"] = current

    if state["consecutive_no_progress"] >= policy["stuck_threshold"]:
        escalate(state, ctx, "no progress",
                 f"Stopped {state['consecutive_no_progress']}x with no file "
                 f"changes. Looks stuck.", message)

    # --- classify ----------------------------------------------------------

    verdict = classify(message, policy)
    if verdict is None:
        # Fail closed: if we cannot tell why it stopped, we do not guess.
        escalate(state, ctx, "classifier unavailable",
                 "Could not classify why this stopped.", message)

    summary = str(verdict.get("summary", ""))[:200]
    risk = verdict.get("risk", "high")
    kind = verdict["state"]

    project = backlog.resolve(None, ctx["cwd"])

    if kind == COMPLETE:
        # Finished the thing it was on. Mark it done and hand over the next item
        # from the list -- verbatim, never invented. Empty list means stop.
        if project and state.get("current_item"):
            backlog.mark_done(project, state["current_item"])
        log_audit({"event": "complete", "session_id": ctx["session_id"],
                   "summary": summary, "finished_item": state.get("current_item")})

        nxt = backlog.take_next(project) if project else None
        if nxt:
            state["current_item"] = nxt
            state["consecutive_auto_continues"] = 0  # new task, fresh budget
            state["auto_continues_today"] += 1
            state.pop("pending", None)
            save_state(state)
            log_audit({"event": "next_item", "session_id": ctx["session_id"], "item": nxt})
            notify(f"{Path(ctx['cwd']).name}: next up", nxt)
            keep_going(f"Done. Next item from the backlog:\n\n{nxt}\n\n"
                       f"Build it. If it turns out to need a decision only a "
                       f"human can make, stop and say so rather than guessing.")

        state["consecutive_auto_continues"] = 0
        state.pop("current_item", None)
        state.pop("pending", None)
        save_state(state)
        notify(f"done: {Path(ctx['cwd']).name}",
               f"{summary} Backlog is empty." if summary else "Finished, backlog empty.")
        allow_stop("chat-supervisor: work complete and backlog empty.")

    if kind == BLOCKED_EXTERNAL and project:
        # Something only you can do. Park it, skip it, keep building the rest
        # rather than sitting idle until you happen to look.
        backlog.park(project, summary or message[:200])
        nxt = backlog.take_next(project)
        if nxt:
            state["current_item"] = nxt
            state["consecutive_auto_continues"] = 0
            state["auto_continues_today"] += 1
            save_state(state)
            log_audit({"event": "parked_and_advanced", "session_id": ctx["session_id"],
                       "parked": summary, "item": nxt})
            notify(f"{Path(ctx['cwd']).name}: parked one for you", summary or "See NEEDS-YOU.md")
            keep_going(f"Note that in .claude/NEEDS-YOU.md for the human, then "
                       f"leave it and move on to the next backlog item:\n\n{nxt}")
        escalate(state, ctx, "blocked, backlog empty",
                 summary or "Blocked on something only you can do.", message)

    if kind != STALLED_ROUTINE or risk not in ("none", "low"):
        escalate(state, ctx, f"{kind} (risk: {risk})", summary or "Needs your call.", message)

    instruction = str(verdict.get("reply", "")).strip()
    if not instruction:
        escalate(state, ctx, "no usable reply", summary or "Needs your call.", message)

    # --- auto-continue -----------------------------------------------------

    state["consecutive_auto_continues"] += 1
    state["auto_continues_today"] += 1
    state.pop("pending", None)
    save_state(state)
    log_audit({
        "event": "auto_continue",
        "session_id": ctx["session_id"],
        "project": Path(ctx["cwd"]).name,
        "summary": summary,
        "instruction": instruction,
        "consecutive": state["consecutive_auto_continues"],
    })
    keep_going(
        f"{instruction}\n\n(Auto-continued by chat-supervisor, "
        f"{state['consecutive_auto_continues']}/{policy['auto_continue_max_consecutive']} "
        f"before it pauses for a human. Stop and ask if this is wrong.)"
    )


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:  # never let a hook bug wedge a session
        log_audit({"event": "hook_crash", "error": repr(exc)})
        print(json.dumps({"systemMessage": f"chat-supervisor crashed: {exc}"}))
        sys.exit(0)
