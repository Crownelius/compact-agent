#!/bin/bash
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../.." 2>/dev/null && pwd || true)"

if command -v cawdex >/dev/null 2>&1; then
  cawdex --print-terminal-bench-adapter >/dev/null
  exit 0
fi
if command -v ventipus >/dev/null 2>&1; then
  ventipus --print-terminal-bench-adapter >/dev/null
  exit 0
fi

ensure_node_npm() {
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    return 0
  fi

  if ! command -v curl >/dev/null 2>&1; then
    apt-get update
    apt-get install -y ca-certificates curl
  fi

  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.2/install.sh | bash
  fi
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm install 22
  nvm use 22
}

install_from_bundle_root() {
  root="$1"
  if [ -z "$root" ] || [ ! -d "$root/dist" ]; then
    return 1
  fi
  entry="$root/bin/cawdex.js"
  if [ ! -f "$entry" ]; then
    entry="$root/bin/ventipus.js"
  fi
  if [ ! -f "$entry" ]; then
    return 1
  fi
  if [ -d "$root/node_modules" ] && command -v node >/dev/null 2>&1; then
    mkdir -p /usr/local/bin
    cat > /usr/local/bin/cawdex <<EOF
#!/bin/sh
exec node "$entry" "\$@"
EOF
    chmod +x /usr/local/bin/cawdex
    cat > /usr/local/bin/ventipus <<EOF
#!/bin/sh
exec cawdex "\$@"
EOF
    chmod +x /usr/local/bin/ventipus
    return 0
  fi
  if command -v npm >/dev/null 2>&1 && [ -f "$root/package.json" ]; then
    npm install -g "$root" --no-audit --no-fund
    return 0
  fi
  return 1
}

install_from_tarball() {
  tarball="$1"
  if [ -z "$tarball" ] || [ ! -f "$tarball" ]; then
    return 1
  fi
  npm install -g "$tarball" --no-audit --no-fund
  return 0
}

try_offline_install() {
  if command -v node >/dev/null 2>&1; then
    if install_from_bundle_root "${VENTIPUS_BUNDLE_ROOT:-}"; then
      return 0
    fi
    if install_from_bundle_root "$PACKAGE_ROOT"; then
      return 0
    fi
  fi

  ensure_node_npm

  if install_from_tarball "${VENTIPUS_BUNDLE_TARBALL:-}"; then
    return 0
  fi
  if install_from_bundle_root "${VENTIPUS_BUNDLE_ROOT:-}"; then
    return 0
  fi
  if install_from_bundle_root "$PACKAGE_ROOT"; then
    return 0
  fi
  for candidate in "$SCRIPT_DIR"/cawdex*.tgz "$PACKAGE_ROOT"/cawdex*.tgz "$SCRIPT_DIR"/ventipus*.tgz "$PACKAGE_ROOT"/ventipus*.tgz; do
    if install_from_tarball "$candidate"; then
      return 0
    fi
  done
  return 1
}

if try_offline_install; then
  cawdex --print-terminal-bench-adapter >/dev/null
  exit 0
fi

if ! command -v curl >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl
fi

ensure_node_npm

npm install -g "${VENTIPUS_INSTALL_SPEC:-cawdex@latest}" --no-audit --no-fund

cawdex --print-terminal-bench-adapter >/dev/null
