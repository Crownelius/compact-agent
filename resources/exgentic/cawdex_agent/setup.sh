#!/bin/bash
set -euo pipefail

if command -v cawdex >/dev/null 2>&1; then
    echo "cawdex already available on PATH"
    exit 0
fi

if command -v cawdex >/dev/null 2>&1; then
    echo "legacy cawdex alias already available on PATH"
    exit 0
fi

if ! command -v npm >/dev/null 2>&1; then
    echo "Error: npm is required to install Cawdex for Exgentic." >&2
    exit 1
fi

INSTALL_SPEC="${CAWDEX_INSTALL_SPEC:-cawdex@latest}"
npm install -g "$INSTALL_SPEC"
echo "Cawdex Exgentic setup complete: $INSTALL_SPEC"
