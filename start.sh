#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "========================================================================"
echo "       PredicTEE - NEAR HACKATHON 2026 LAUNCHER (Linux / macOS)         "
echo "  Verifiable TEE AI Oracle on NEAR (Intel TDX + NEAR Chain Signatures)  "
echo "========================================================================"

echo "[1/3] Running NEAR Smart Contract & Agent Verification Suite..."
npm test

echo "[2/3] Starting Confidential Agent API on http://127.0.0.1:8000 ..."
(cd packages/agent && python3 agent.py) &
AGENT_PID=$!

trap "kill $AGENT_PID 2>/dev/null || true" EXIT

echo "[3/3] Starting Frontend Web UI on http://localhost:5173 ..."
cd packages/frontend && npm run dev
