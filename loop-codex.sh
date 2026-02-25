#!/usr/bin/env nix-shell
#! nix-shell -i bash -p jq

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPT_FILE="${SCRIPT_DIR}/LOOP_PROMPT.md"
LOG_DIR="${SCRIPT_DIR}/.loop-logs"

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "Error: ${PROMPT_FILE} not found" >&2
  exit 1
fi

mkdir -p "$LOG_DIR"

echo "=== Tasks Codex Loop ==="
echo "Prompt: ${PROMPT_FILE}"
echo "Logs:   ${LOG_DIR}/"
echo "Press Ctrl+C to stop"
echo ""

iteration=0

while true; do
  iteration=$((iteration + 1))
  timestamp=$(date '+%Y%m%d-%H%M%S')
  log_file="${LOG_DIR}/codex-${timestamp}-iter${iteration}.ndjson"

  echo "--- Iteration ${iteration} | $(date '+%H:%M:%S') | log: ${log_file} ---"

  set +e
  nix run nixpkgs#bun -- x @openai/codex exec \
    --dangerously-bypass-approvals-and-sandbox \
    --json \
    "$(cat "$PROMPT_FILE")" \
    2>"${log_file}.stderr" \
    | tee "$log_file" \
    | while IFS= read -r line; do
        type=$(echo "$line" | jq -r '.type // empty' 2>/dev/null) || continue

        case "$type" in
          # Lifecycle events
          thread.started)
            tid=$(echo "$line" | jq -r '.thread_id // empty' 2>/dev/null) || true
            echo "[THREAD] $tid"
            ;;
          turn.completed)
            tokens=$(echo "$line" | jq -r '
              .usage // {} | "in=\(.input_tokens // "?") out=\(.output_tokens // "?")"
            ' 2>/dev/null) || true
            echo "[TURN DONE] $tokens"
            ;;
          turn.failed)
            echo "[TURN FAILED]"
            echo "$line" | jq -r '.error // empty' 2>/dev/null || true
            ;;

          # Item events — extract useful content
          item.completed)
            item_type=$(echo "$line" | jq -r '.item.type // empty' 2>/dev/null) || true
            case "$item_type" in
              agent_message)
                text=$(echo "$line" | jq -r '.item.text // empty' 2>/dev/null) || true
                if [[ -n "$text" ]]; then
                  echo "$text"
                fi
                ;;
              command_execution)
                cmd=$(echo "$line" | jq -r '.item.command // empty' 2>/dev/null) || true
                exit_status=$(echo "$line" | jq -r '.item.exit_code // empty' 2>/dev/null) || true
                echo "[CMD] $cmd"
                if [[ -n "$exit_status" && "$exit_status" != "0" ]]; then
                  echo "[EXIT $exit_status]"
                fi
                ;;
              file_change)
                file=$(echo "$line" | jq -r '.item.file // empty' 2>/dev/null) || true
                echo "[FILE] $file"
                ;;
              reasoning)
                echo "[REASONING]"
                ;;
              *)
                echo "[ITEM] $item_type"
                ;;
            esac
            ;;
          item.started)
            # Log starts silently — the .completed event has the content
            ;;

          # Catch-all for unknown events — don't swallow them
          *)
            echo "[EVENT:${type}]"
            ;;
        esac
      done
  exit_code=${PIPESTATUS[0]}
  set -e

  echo ""

  if [[ $exit_code -ne 0 ]]; then
    echo "!!! Codex exited with code ${exit_code} — see ${log_file}.stderr"
    echo "Pausing 5s before retry..."
    sleep 5
  else
    echo "--- Iteration ${iteration} complete ---"
  fi

  echo ""
  sleep 2
done
