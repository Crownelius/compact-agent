#!/bin/bash
set -euo pipefail

if command -v ventipus >/dev/null 2>&1; then
    echo "ventipus already available on PATH"
    exit 0
fi

if ! command -v npm >/dev/null 2>&1; then
    echo "Error: npm is required to install ventipus for Exgentic." >&2
    exit 1
fi

INSTALL_SPEC="${VENTIPUS_INSTALL_SPEC:-ventipus@latest}"
npm install -g "$INSTALL_SPEC"
echo "ventipus Exgentic setup complete: $INSTALL_SPEC"
