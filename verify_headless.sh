#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "========================================================================"
echo "  PREDICTEE HEADLESS VERIFICATION PROTOCOL (CLAUDE CODE / CODEX / CI)   "
echo "========================================================================"

python3 packages/agent/verify_headless.py || python packages/agent/verify_headless.py
