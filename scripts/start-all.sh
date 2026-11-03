#!/usr/bin/env bash
# @file scripts/start-all.sh
# @description Orchestrates TypeScript runtime and Python IPC worker concurrently.

set -euo pipefail

SOCKET_PATH="/tmp/botnest_ipc.sock"
cleanup() {
  echo ""
  echo "[Orchestrator] Shutting down subprocesses..."
  kill $(jobs -p) 2>/dev/null || true
  rm -f "${SOCKET_PATH}"
  echo "[Orchestrator] Finished cleanup."
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

echo "[Orchestrator] Starting Python AI worker..."
python3 workers/ai_worker.py &

# Espera a que el socket UNIX esté listo
while [ ! -S "${SOCKET_PATH}" ]; do
  sleep 0.1
done

echo "[Orchestrator] IPC socket verified. Launching BotNest TS engine..."
pnpm dev
