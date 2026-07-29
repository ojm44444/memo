#!/usr/bin/env bash
# Wire the supervisor's Stop hook into Claude Code settings.
#
#   ./install.sh            -> ~/.claude/settings.json   (watches every session)
#   ./install.sh --project  -> ./.claude/settings.json    (this repo only)
#
# Idempotent: re-running updates the entry instead of adding a duplicate.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="$DIR/supervisor.py"

TARGET="$HOME/.claude/settings.json"
SCOPE="every Claude Code session on this machine"
if [[ "${1:-}" == "--project" ]]; then
  TARGET="$(git -C "$DIR" rev-parse --show-toplevel)/.claude/settings.json"
  SCOPE="sessions started in this repo"
fi

command -v python3 >/dev/null || { echo "python3 is required"; exit 1; }
command -v claude  >/dev/null || { echo "the claude CLI is required"; exit 1; }
chmod +x "$HOOK" "$DIR/cs"

mkdir -p "$(dirname "$TARGET")"
[[ -f "$TARGET" ]] || echo '{}' > "$TARGET"
cp "$TARGET" "$TARGET.bak"

HOOK_PATH="$HOOK" python3 - "$TARGET" <<'PY'
import json, os, sys

target, hook = sys.argv[1], os.environ["HOOK_PATH"]
settings = json.load(open(target))
entry = {"type": "command", "command": f"python3 {hook}", "timeout": 90}

groups = settings.setdefault("hooks", {}).setdefault("Stop", [])
for group in groups:
    hooks = group.get("hooks", [])
    for i, existing in enumerate(hooks):
        if "supervisor.py" in existing.get("command", ""):
            hooks[i] = entry
            break
    else:
        continue
    break
else:
    groups.append({"hooks": [entry]})

json.dump(settings, open(target, "w"), indent=2)
PY

cat <<EOF

Installed. The Stop hook now watches $SCOPE.
  settings: $TARGET  (previous version saved as $TARGET.bak)

Put the CLI on your PATH:
  ln -sf "$DIR/cs" /usr/local/bin/cs

Get escalations on your phone (pick a topic nobody will guess, then
subscribe to it in the free ntfy app):
  export CHAT_SUPERVISOR_NTFY_TOPIC=claude-builds-\$(openssl rand -hex 4)

Or route them anywhere you like -- the message arrives on stdin:
  export CHAT_SUPERVISOR_NOTIFY_CMD='xargs -0 notify-send'

Check the wiring:
  $DIR/cs test

EOF
