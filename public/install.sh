#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${RELAYDESK_DOWNLOAD_BASE:-https://relay-desk-mjq6.vercel.app/agent-dist}"
DEVICE_NAME="${RELAYDESK_DEVICE_NAME:-}"
NODE_VERSION="22.22.0"

if ! command -v curl >/dev/null 2>&1; then
  echo "RelayDesk installer requires curl." >&2
  exit 1
fi

os="$(uname -s)"
arch="$(uname -m)"
case "$os" in
  Linux)
    platform="linux"
    default_root="${HOME}/.local/share/relaydesk"
    ;;
  Darwin)
    platform="darwin"
    default_root="${HOME}/Library/Application Support/RelayDesk"
    ;;
  *)
    echo "Unsupported operating system: $os" >&2
    exit 1
    ;;
esac

case "$arch" in
  x86_64|amd64) node_arch="x64" ;;
  arm64|aarch64) node_arch="arm64" ;;
  *)
    echo "Unsupported architecture: $arch" >&2
    exit 1
    ;;
esac

archive="node-v${NODE_VERSION}-${platform}-${node_arch}.tar.gz"
case "$archive" in
  node-v22.22.0-linux-x64.tar.gz) expected="c33c39ed9c80deddde77c960d00119918b9e352426fd604ba41638d6526a4744" ;;
  node-v22.22.0-linux-arm64.tar.gz) expected="25ba95dfb96871fa2ef977f11f95ea90818c8fa15c0f2110771db08d4ba423be" ;;
  node-v22.22.0-darwin-x64.tar.gz) expected="5ea50c9d6dea3dfa3abb66b2656f7a4e1c8cef23432b558d45fb538c7b5dedce" ;;
  node-v22.22.0-darwin-arm64.tar.gz) expected="5ed4db0fcf1eaf84d91ad12462631d73bf4576c1377e192d222e48026a902640" ;;
  *) echo "Unsupported Node runtime archive: $archive" >&2; exit 1 ;;
esac

INSTALL_ROOT="${RELAYDESK_INSTALL_ROOT:-$default_root}"
RUNTIME_ROOT="$INSTALL_ROOT/runtime"
NODE_DIR="$RUNTIME_ROOT/${archive%.tar.gz}"
AGENT_ROOT="$INSTALL_ROOT/agent"
DIST_DIR="$AGENT_ROOT/dist"
NODE="$NODE_DIR/bin/node"
NPM="$NODE_DIR/bin/npm"

step(){ printf "\n==> %s\n" "$1"; }
verify_sha(){
  local file="$1" actual
  if command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "$file" | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    actual="$(shasum -a 256 "$file" | awk '{print $1}')"
  else
    echo "No SHA-256 utility found (sha256sum or shasum)." >&2
    exit 1
  fi
  [ "$actual" = "$expected" ] || { echo "Node runtime checksum verification failed." >&2; exit 1; }
}

mkdir -p "$RUNTIME_ROOT" "$DIST_DIR"

if [ ! -x "$NODE" ]; then
  step "Installing the private RelayDesk Node runtime"
  tmp="${TMPDIR:-/tmp}/$archive"
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/$archive" -o "$tmp"
  verify_sha "$tmp"
  tar -xzf "$tmp" -C "$RUNTIME_ROOT"
  rm -f "$tmp"
fi

[ -x "$NODE" ] || { echo "RelayDesk runtime installation failed." >&2; exit 1; }
export PATH="$NODE_DIR/bin:$PATH"

step "Downloading the current RelayDesk agent"
curl -fsSL "$BASE_URL/package.json" -o "$AGENT_ROOT/package.json"
for file in config.js credentials.js index.js pair.js service.js; do
  curl -fsSL "$BASE_URL/$file" -o "$DIST_DIR/$file"
done

step "Installing RelayDesk runtime dependencies"
(
  cd "$AGENT_ROOT"
  "$NPM" install --omit=dev --no-audit --no-fund
)

credential_file="$HOME/.relaydesk/credentials.json"
if [ "${RELAYDESK_SKIP_PAIR:-0}" != "1" ]; then
  if [ -f "$credential_file" ]; then
    step "Existing RelayDesk device credential found; keeping the current pairing"
  else
    step "Pairing this device with RelayDesk"
    if [ -n "$DEVICE_NAME" ]; then
      "$NODE" "$DIST_DIR/pair.js" --name "$DEVICE_NAME"
    else
      "$NODE" "$DIST_DIR/pair.js"
    fi
  fi
fi

if [ "${RELAYDESK_SKIP_SERVICE:-0}" != "1" ]; then
  step "Installing the persistent RelayDesk background agent"
  "$NODE" "$DIST_DIR/service.js" install
fi

step "RelayDesk installation complete"
printf "Install root: %s\nRuntime:      %s\n" "$INSTALL_ROOT" "$NODE"
printf "RelayDesk only needs outbound HTTPS. No inbound port, SSH tunnel, Git, or global Node installation is required.\n"
