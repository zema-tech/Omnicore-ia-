#!/usr/bin/env bash
# Omnicore (Bash) — router + fusione brain->hands->face, dipendenze: bash + curl + python3.
# Uso:
#   bash scripts/omnicore.sh "fix login bug"          -> route singola
#   bash scripts/omnicore.sh --fuse "fix login bug"   -> fusione completa
set -u
OPENCODE_URL="${OPENCODE_URL:-http://127.0.0.1:4096}"
OPENCLAW_URL="${OPENCLAW_URL:-http://127.0.0.1:18789}"
HERMES_DIR="${HERMES_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../vendors/hermes" 2>/dev/null && pwd || echo vendors/hermes)}"
HERMES_PYTHON="${HERMES_PYTHON:-python3}"

FUSE=0; TEXT=""
for a in "$@"; do
  [ "$a" = "--fuse" ] && FUSE=1 && continue
  TEXT="${TEXT} ${a}"
done
TEXT="$(echo "$TEXT" | xargs)"; [ -z "$TEXT" ] && TEXT="ciao"
LOWER="$(echo " $TEXT " | tr '[:upper:]' '[:lower:]')"

classify() {
  local t="$1"
  case "$t" in
    *fix*|*bug*|*refactor*|*implementa*|*implement*|*commit*|*test*|*build*|*codice*|*code*|*file*|*repo*|*"pr "*|*diff*) echo "code"; return;;
  esac
  case "$t" in
    *ricordi*|*remember*|*skill*|*cron*|*" eri "*|*avevi\ detto*|*riepiloga*|*summar*|*past*|*ieri*) echo "memory"; return;;
  esac
  case "$t" in
    /*|*deploy*|*gateway*) echo "ops"; return;;
  esac
  echo "chat"
}

INTENT="$(classify "$LOWER")"
case "$INTENT" in
  code) HANDLER="opencode";; memory) HANDLER="hermes";; ops) HANDLER="openclaw";; *) HANDLER="hermes";;
esac

if [ "$FUSE" = "0" ]; then
  printf '{"intent":"%s","handler":"%s","text":"%s"}\n' "$INTENT" "$HANDLER" "$TEXT"
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE="$SCRIPT_DIR/hermes_bridge.py"
# 1) BRAIN — hermes_bridge.py one-shot (import diretto handler, stdlib). Esce sempre.
BRAIN_OK=false; BRAIN_RES=""
if PAYLOAD=$(timeout 30 "$HERMES_PYTHON" "$BRIDGE" conversations_list "{\"search\":\"$TEXT\",\"limit\":5}" 2>/dev/null | tail -n 20); then
  [ -n "$PAYLOAD" ] && BRAIN_OK=true && BRAIN_RES="$PAYLOAD"
else
  BRAIN_RES="hermes non raggiungibile (BRIDGE=$BRIDGE HERMES_DIR=$HERMES_DIR)"
fi

# 2) HANDS — OpenCode solo se code (best-effort: serve -> run CLI)
if [ "$INTENT" = "code" ]; then
  if SERVE_RES=$(curl -s -m 120 -X POST "$OPENCODE_URL/session/prompt" -H 'Content-Type: application/json' \
      -d "{\"prompt\":\"$TEXT\"}" 2>/dev/null) && [ -n "$SERVE_RES" ]; then
    HANDS_VIA="opencode(serve /session) [bash→curl]"; HANDS_OK=true; HANDS_RES="$SERVE_RES"
  elif CLI_RES=$(timeout 120 opencode run "$TEXT" --format json 2>/dev/null | head -c 2000) && [ -n "$CLI_RES" ]; then
    HANDS_VIA="opencode(run --format json) [bash→cli]"; HANDS_OK=true; HANDS_RES="$CLI_RES"
  else
    HANDS_VIA="opencode [bash→curl+cli]"; HANDS_OK=false; HANDS_RES="serve+cli non raggiungibili (OPENCODE_URL=$OPENCODE_URL)"
  fi
else
  HANDS_VIA="opencode [skip: intent!=code]"; HANDS_OK=true; HANDS_RES="skipped"
fi

# 3) FACE — OpenClaw status via admin-http-rpc (best-effort, mai fatale)
if FACE_RES=$(curl -s -m 10 -X POST "$OPENCLAW_URL/api/v1/admin/rpc" -H 'Content-Type: application/json' \
    -d '{"id":"omnicore-sh-1","method":"status","params":{}}' 2>/dev/null) && [ -n "$FACE_RES" ]; then
  FACE_OK=true
else
  FACE_OK=false; FACE_RES="gateway non raggiungibile (OPENCLAW_URL=$OPENCLAW_URL)"
fi

esc() { printf '%s' "$1" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read())[1:-1])'; }
printf '{"intent":"%s","handler":"%s","text":"%s","steps":[{"step":"brain","via":"hermes(mcp_serve.py) [bash→python]","ok":%s,"result":"%s"},{"step":"hands","via":"%s","ok":%s,"result":"%s"},{"step":"face","via":"openclaw(POST /api/v1/admin/rpc status) [bash→curl]","ok":%s,"result":"%s"}]}\n' \
  "$INTENT" "$HANDLER" "$(esc "$TEXT")" "$BRAIN_OK" "$(esc "$BRAIN_RES")" \
  "$HANDS_VIA" "$HANDS_OK" "$(esc "$HANDS_RES")" "$FACE_OK" "$(esc "$FACE_RES")"
