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
  nix run nixpkgs#bun -- x @openai/codex \
    --dangerously-bypass-approvals-and-sandbox \
    --json \
    "$(cat "$PROMPT_FILE")" \
    2>"${log_file}.stderr" \
    | tee "$log_file" \
    | while IFS= read -r line; do
        type=$(echo "$line" | jq -r '.type // empty' 2>/dev/null) || continue

        case "$type" in
          message)
            role=$(echo "$line" | jq -r '.role // empty' 2>/dev/null) || true
            if [[ "$role" == "assistant" ]]; then
              text=$(echo "$line" | jq -r '
                .content // [] | map(select(.type == "text") | .text) | join("")
              ' 2>/dev/null) || true
              if [[ -n "$text" ]]; then
                echo "$text"
              fi
            fi
            ;;
          command)
            cmd=$(echo "$line" | jq -r '.command // empty' 2>/dev/null) || true
            if [[ -n "$cmd" ]]; then
              echo "[CMD] $cmd"
            fi
            ;;
          command_output)
            exit_status=$(echo "$line" | jq -r '.exit_code // empty' 2>/dev/null) || true
            stdout=$(echo "$line" | jq -r '.stdout // empty' 2>/dev/null) || true
            if [[ -n "$stdout" ]]; then
              echo "$stdout" | head -20
            fi
            if [[ -n "$exit_status" && "$exit_status" != "0" ]]; then
              echo "[EXIT $exit_status]"
            fi
            ;;
          error)
            msg=$(echo "$line" | jq -r '.message // .error // empty' 2>/dev/null) || true
            echo "[ERROR] $msg"
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
