# chat-supervisor

Watch several Claude Code sessions that are building, keep them going through
routine stalls, and only interrupt you when a decision actually needs a human.

The goal is not zero interruptions. It's turning forty interruptions into the
three that are genuinely yours to answer — from wherever you are, instead of
from a chair in front of the screen.

## Why this and not computer use

Claude Code fires a **Stop hook** the instant a session finishes responding.
That is a real, deterministic "it stopped building" event delivered as JSON,
including the last thing the session said.

So there is nothing to watch. No screenshots, no polling, no vision model
squinting at a spinner to guess whether a build is still running. Computer use
could drive the same loop, but it would be slower, cost more, break when the UI
moves, and occasionally misread the screen. This is a shell script that reads a
JSON object.

The Stop hook can also *refuse to let the session stop*, returning an
instruction instead. That refusal is the entire "keep it building" mechanism.

## How a stop is handled

```
session stops
     │
     ├── deny-list hit? ─────────────────► escalate   (never auto-answered)
     ├── budget spent / stuck? ──────────► escalate
     │
     └── classify (haiku, cheap)
              ├── complete ──────────────► stop + "done" notification
              ├── routine + low risk ────► reply and keep building
              └── anything else ─────────► escalate
```

**Escalate** means: let the session stop, put the question in your inbox, and
push it to your phone. It is not a dead end — `cs reply` resumes that exact
session with your answer via `claude --resume`, and it picks up where it left
off with the hook still armed.

## Install

```bash
tools/chat-supervisor/install.sh          # watch every session on this machine
tools/chat-supervisor/install.sh --project # or just sessions started in this repo

ln -sf "$PWD/tools/chat-supervisor/cs" /usr/local/bin/cs
```

Get the escalations on your phone. Install the free [ntfy](https://ntfy.sh) app,
pick a topic nobody would guess, subscribe to it there:

```bash
export CHAT_SUPERVISOR_NTFY_TOPIC=claude-builds-$(openssl rand -hex 4)
```

Any other channel works too — the message arrives on stdin:

```bash
export CHAT_SUPERVISOR_NOTIFY_CMD='xargs -0 notify-send'          # desktop
export CHAT_SUPERVISOR_NOTIFY_CMD='xargs -0 -I{} curl -s -d "{}" $SLACK_WEBHOOK'
```

Check the wiring without touching a real session:

```bash
cs test
```

## Running four builds

Start each one as usual, with permissions relaxed enough that it won't stall on
every file write:

```bash
cd ~/projects/one && claude --permission-mode acceptEdits
```

Then walk away.

```
$ cs status
SESSION    PROJECT            STATE          AUTO   LAST       WHAT
a3f81b20   memo               building       2/9d   40s ago    Wiring the auth endpoint
7c02de41   landing-page       NEEDS YOU      0/4d   6m ago     Two plausible schemas, wants a pick
b81f0a93   api-gateway        building       1/6d   2m ago     Fixing the failing rate-limit test
e40c7712   mobile             idle           0/12d  1h ago     Finished, all tests pass
```

```
$ cs inbox
[1] landing-page  (7c02de41)  6m ago
    why: needs_decision (risk: low)
    Two plausible schemas for saved views, wants a pick before migrating
    ---
    I can either store saved views as a JSON column on `user`, or as their
    own table with a foreign key. The second is cleaner if views are ever
    shared between users. Which do you want?
    answer: cs reply 1 "..."

$ cs reply 1 "Own table — we'll want sharing later."
Sent to landing-page (7c02de41). It is building again.
```

Other commands: `cs log` for recent decisions, `cs pause` to stop
auto-continuing entirely, `cs on` to resume.

## "Done" has to be earned

A session saying it's finished is a claim, not a fact. Before an item is marked
done and the next one starts, the work has to survive a gate:

1. **The project's own checks** — build, tests, lint. Auto-detected from
   `package.json`, or set explicitly in `.claude/done.json`.
2. **A browser smoke test** *(optional)* — loads the running app, fails on
   console errors, uncaught exceptions, failed requests, or an HTTP error. Needs
   `npm i -D playwright` and a `url` in `done.json`; skipped silently otherwise.
3. **A reviewer with fresh eyes** — a separate agent that never saw the building
   session's reasoning, given only the backlog item and the diff, asked whether
   this is genuinely finished or a first pass. It reports stubs, TODOs, missing
   error and empty states, and work that doesn't match what was asked.

Anything that fails comes back as a specific list, and the session is sent to fix
it. Only a clean pass advances the backlog.

That loop is capped (`max_rounds`, default 3). If the work can't get through the
gate in three rounds, it stops and asks you rather than polishing forever.

```json
// .claude/done.json
{
  "checks": [
    {"name": "build", "command": "npm run build"},
    {"name": "tests", "command": "npm test"},
    {"name": "lint",  "command": "npm run lint"}
  ],
  "url": "http://localhost:5173",
  "max_rounds": 3,
  "budget_seconds": 600
}
```

What the gate catches: broken builds, failing tests, stubbed functions, half-built
features, console errors, missing states. What it does not catch: whether the
feature was worth building, and whether the result is any good to use. Those are
still yours.

## The guards

Auto-continuing is the dangerous half, so the classifier is never the only
thing standing between an agent and a bad idea.

| Guard | Default | What it stops |
|---|---|---|
| Deny-list | see `policy.json` | Force pushes, migrations, deletes, deploys, secrets, spending. Checked **before** the model runs; a match always escalates. |
| Consecutive auto-continues | 5 | Long unattended runs. Resets when you reply or the work completes. |
| No-progress detection | 2 stops | An agent stopping repeatedly without changing a single file is spinning, whatever its messages say. |
| Daily cap | 40 | Runaway token burn across all sessions. |
| Fail-closed classifier | — | If the classifier times out or returns junk, the session escalates. It never guesses. |
| Recursion guard | — | The classifier is itself a `claude` call; an env flag makes its own Stop hook no-op. |

The classifier is prompted to prefer escalating when unsure, and it takes that
seriously — expect it to hand back borderline calls like "shall I also do the
footer?" rather than assume. That bias is deliberate: a needless interruption
costs a moment, a wrong auto-answer can cost the work. Loosen it by editing the
prompt in `supervisor.py`; tighten or widen the deny-list in `policy.json`.

## Tuning

Drop a partial `policy.json` in `~/.claude/chat-supervisor/` to override any
default without editing the repo:

```json
{ "auto_continue_max_consecutive": 8, "stuck_threshold": 3 }
```

State, audit log, and inbox live in `~/.claude/chat-supervisor/` (override with
`CHAT_SUPERVISOR_HOME`). Every decision is appended to `audit.jsonl`, so you can
always reconstruct what was auto-answered while you were away.

## Limits worth knowing

- **The hook fires on stop, not on crash.** If a session dies outright, no Stop
  event arrives and nothing escalates. `cs status` showing a session idle far
  longer than expected is your signal.
- **`cs reply` starts a fresh headless run** on that session's history. It
  continues the work, but it is not the same as typing into an attached
  terminal — if you have that terminal open, answer there instead.
- **The classifier reads the last message only.** It has no view of the diff, so
  a session that describes its plan inaccurately will be triaged on the
  description, not the reality. The no-progress guard is the backstop.
- **This does not make an unattended agent safe to leave running for days.**
  It makes a day of babysitting into a handful of phone notifications. Read the
  audit log.
