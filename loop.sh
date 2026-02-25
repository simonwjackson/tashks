#!/usr/bin/env nix-shell
#! nix-shell -i bash -p bun jq

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPT_FILE="${SCRIPT_DIR}/LOOP_PROMPT.md"
LOG_DIR="${SCRIPT_DIR}/.loop-logs"

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "Error: ${PROMPT_FILE} not found" >&2
  exit 1
fi

mkdir -p "$LOG_DIR"

echo "=== Tasks Ralph Loop ==="
echo "Prompt: ${PROMPT_FILE}"
echo "Logs:   ${LOG_DIR}/"
echo "Press Ctrl+C to stop"
echo ""

iteration=0

while true; do
  iteration=$((iteration + 1))
  timestamp=$(date '+%Y%m%d-%H%M%S')
  log_file="${LOG_DIR}/${timestamp}-iter${iteration}.ndjson"

  echo "--- Iteration ${iteration} | $(date '+%H:%M:%S') | log: ${log_file} ---"

  set +e
  bun x @anthropic-ai/claude-code \
    --print \
    --dangerously-skip-permissions \
    --output-format stream-json \
    --verbose \
    --include-partial-messages \
    "$(cat "$PROMPT_FILE")" \
    2>"${log_file}.stderr" \
    | tee "$log_file" \
    | while IFS= read -r line; do
        type=$(echo "$line" | jq -r '.type // empty' 2>/dev/null) || continue

        case "$type" in
          stream_event)
            # Extract text deltas for live output
            text=$(echo "$line" | jq -r '
              select(.event.delta.type? == "text_delta")
              | .event.delta.text // empty
            ' 2>/dev/null) || true
            if [[ -n "$text" ]]; then
              printf '%s' "$text"
            fi
            ;;
          result)
            echo ""
            echo "=== RESULT ==="
            echo "$line" | jq -r '.result // empty' 2>/dev/null || true
            ;;
        esac
      done
  exit_code=${PIPESTATUS[0]}
  set -e

  echo ""

  if [[ $exit_code -ne 0 ]]; then
    echo "!!! Claude exited with code ${exit_code} — see ${log_file}.stderr"
    echo "Pausing 5s before retry..."
    sleep 5
  else
    echo "--- Iteration ${iteration} complete ---"
  fi

  echo ""
  sleep 2
done
