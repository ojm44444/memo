#!/usr/bin/env bash
# Send supervisor notifications to a Slack channel.
#
# One-time setup:
#   1. https://api.slack.com/apps -> Create New App -> From scratch
#   2. Incoming Webhooks -> On -> Add New Webhook to Workspace
#   3. Pick your #claude-builds channel, copy the URL, then:
#
#        export CHAT_SUPERVISOR_SLACK_WEBHOOK='https://hooks.slack.com/services/...'
#        export CHAT_SUPERVISOR_NOTIFY_CMD="$PWD/tools/chat-supervisor/notify-slack.sh"
#
# Put both lines in your shell profile so they survive a reboot.
#
# The supervisor pipes "title\nbody" on stdin.
set -euo pipefail

[[ -n "${CHAT_SUPERVISOR_SLACK_WEBHOOK:-}" ]] || { echo "CHAT_SUPERVISOR_SLACK_WEBHOOK not set" >&2; exit 1; }

payload="$(cat)"
title="$(head -n1 <<<"$payload")"
body="$(tail -n +2 <<<"$payload")"

json="$(python3 -c '
import json, sys
title, body = sys.argv[1], sys.argv[2]
print(json.dumps({"text": f"*{title}*\n{body}"}))
' "$title" "$body")"

curl -sS -X POST -H 'Content-Type: application/json' \
     --data "$json" "$CHAT_SUPERVISOR_SLACK_WEBHOOK" > /dev/null
