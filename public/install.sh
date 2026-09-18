#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${RELAYDESK_DOWNLOAD_BASE:-https://relay-desk-mjq6.vercel.app/agent-dist}"
DEVICE_NAME="${RELAYDESK_DEVICE_NAME:-}"
NODE_VERSION="22.22.0"

command -v curl >/dev/null 2>&1 || { echo "RelayDesk installer requires curl." >&2; exit 1; }

os="$(uname -s)"
arch="$(uname -m)"
case "$os" in
  Linux) platform="linux"; default_root="${HOME}/.local/share/relaydesk" ;;
  Darwin) platform="darwin"; default_root="${HOME}/Library/Application Support/RelayDesk" ;;
  *) echo "Unsupported operating system: $os" >&2; exit 1 ;;
esac
case "$arch" in
  x86_64|amd64) node_arch="x64" ;;
  arm64|aarch64) node_arch="arm64" ;;
  *) echo "Unsupported architecture: $arch" >&2; exit 1 ;;
esac

archive="node-v${NODE_VERSION}-${platform}-${node_arch}.tar.gz"
case "$archive" in
  node-v22.22.0-linux-x64.tar.gz) expected_node="c33c39ed9c80deddde77c960d00119918b9e352426fd604ba41638d6526a4744" ;;
  node-v22.22.0-linux-arm64.tar.gz) expected_node="25ba95dfb96871fa2ef977f11f95ea90818c8fa15c0f2110771db08d4ba423be" ;;
  node-v22.22.0-darwin-x64.tar.gz) expected_node="5ea50c9d6dea3dfa3abb66b2656f7a4e1c8cef23432b558d45fb538c7b5dedce" ;;
  node-v22.22.0-darwin-arm64.tar.gz) expected_node="5ed4db0fcf1eaf84d91ad12462631d73bf4576c1377e192d222e48026a902640" ;;
  *) echo "Unsupported Node runtime archive: $archive" >&2; exit 1 ;;
esac

INSTALL_ROOT="${RELAYDESK_INSTALL_ROOT:-$default_root}"
RUNTIME_ROOT="$INSTALL_ROOT/runtime"
NODE_DIR="$RUNTIME_ROOT/${archive%.tar.gz}"
NODE="$NODE_DIR/bin/node"
NPM="$NODE_DIR/bin/npm"
AGENT_ROOT="$INSTALL_ROOT/agent"
RELEASES_ROOT="$AGENT_ROOT/releases"
LAUNCHER="$AGENT_ROOT/launcher.js"
CURRENT="$AGENT_ROOT/current.json"

step(){ printf "\n==> %s\n" "$1"; }
sha256(){
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
  else echo "No SHA-256 utility found." >&2; exit 1
  fi
}

mkdir -p "$RUNTIME_ROOT" "$RELEASES_ROOT"
if [ ! -x "$NODE" ]; then
  step "Installing the private RelayDesk Node runtime"
  tmp="${TMPDIR:-/tmp}/$archive"
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/$archive" -o "$tmp"
  [ "$(sha256 "$tmp")" = "$expected_node" ] || { echo "Node runtime checksum verification failed." >&2; exit 1; }
  tar -xzf "$tmp" -C "$RUNTIME_ROOT"
  rm -f "$tmp"
fi
[ -x "$NODE" ] && [ -x "$NPM" ] || { echo "RelayDesk runtime installation failed." >&2; exit 1; }
export PATH="$NODE_DIR/bin:$PATH"

step "Downloading and verifying the RelayDesk release manifest"
manifest_tmp="${TMPDIR:-/tmp}/relaydesk-manifest-$$.json"
curl -fsSL "$BASE_URL/manifest.json" -o "$manifest_tmp"
version="$("$NODE" -e "const m=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(String(m.version||''))" "$manifest_tmp")"
launcher_expected="$("$NODE" -e "const m=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(String(m.launcher_sha256||''))" "$manifest_tmp")"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Invalid RelayDesk release version." >&2; exit 1; }
[[ "$launcher_expected" =~ ^[a-f0-9]{64}$ ]] || { echo "RelayDesk launcher checksum missing or invalid." >&2; exit 1; }

step "Installing the verified RelayDesk launcher"
launcher_tmp="$LAUNCHER.new-$$"
curl -fsSL "$BASE_URL/launcher.js" -o "$launcher_tmp"
[ "$(sha256 "$launcher_tmp")" = "$launcher_expected" ] || { rm -f "$launcher_tmp"; echo "RelayDesk launcher checksum verification failed." >&2; exit 1; }
if [ -f "$LAUNCHER" ]; then
  if [ "$(sha256 "$LAUNCHER")" != "$launcher_expected" ]; then
    if [ "${RELAYDESK_SKIP_SERVICE:-0}" = "1" ]; then
      rm -f "$launcher_tmp"
      echo "RelayDesk launcher upgrade requires service management. Re-run without RELAYDESK_SKIP_SERVICE=1." >&2
      exit 1
    fi
    step "Upgrading the stable RelayDesk launcher"
    if [ "$platform" = "linux" ]; then
      if [ "$(id -u)" = "0" ]; then systemctl stop relaydesk-agent.service >/dev/null 2>&1 || true
      else systemctl --user stop relaydesk-agent.service >/dev/null 2>&1 || true
      fi
    else
      launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.relaydesk.agent.plist" >/dev/null 2>&1 || true
    fi
    sleep 2
    mv "$launcher_tmp" "$LAUNCHER"
  else
    rm -f "$launcher_tmp"
  fi
else
  mv "$launcher_tmp" "$LAUNCHER"
fi

release_root="$RELEASES_ROOT/$version"
dist_dir="$release_root/dist"
stage_root="$AGENT_ROOT/.install-$version-$$"
stage_dist="$stage_root/dist"
rm -rf "$stage_root"
mkdir -p "$stage_dist"

step "Downloading and verifying RelayDesk $version"
"$NODE" -e "const m=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));for(const [n,h] of Object.entries(m.files||{})) console.log(n+' '+h)" "$manifest_tmp" |
while read -r file expected; do
  case "$file" in
    package.json) destination="$stage_root/$file" ;;
    config.js|credentials.js|index.js|pair.js|service.js) destination="$stage_dist/$file" ;;
    *) echo "Unexpected RelayDesk release file: $file" >&2; exit 1 ;;
  esac
  curl -fsSL "$BASE_URL/$file" -o "$destination"
  [ "$(sha256 "$destination")" = "$expected" ] || { echo "Checksum verification failed for $file." >&2; exit 1; }
done
cp "$manifest_tmp" "$stage_dist/manifest.json"

step "Installing RelayDesk runtime dependencies"
( cd "$stage_root"; "$NPM" install --omit=dev --no-audit --no-fund )

if [ -d "$release_root" ]; then
  if "$NODE" - "$release_root" "$manifest_tmp" <<'NODE'
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=process.argv[2],m=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const [n,h] of Object.entries(m.files)){
  const p=n==='package.json'?path.join(root,n):path.join(root,'dist',n);
  if(!fs.existsSync(p)||hash(p)!==h) process.exit(1);
}
NODE
  then rm -rf "$stage_root"
  else echo "Existing RelayDesk release $version is incomplete or corrupt. Stop RelayDesk before repairing it." >&2; exit 1
  fi
else
  mv "$stage_root" "$release_root"
fi

previous=""
if [ -f "$CURRENT" ]; then
  previous="$("$NODE" -e "try{const x=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));const incoming=process.argv[2];process.stdout.write(String(x.version===incoming?(x.previous||''):(x.version||'')))}catch{}" "$CURRENT" "$version")"
fi
current_tmp="$CURRENT.new-$"
"$NODE" -e "require('fs').writeFileSync(process.argv[1],JSON.stringify({version:process.argv[2],previous:process.argv[3]||null},null,2)+'\n')" "$current_tmp" "$version" "$previous"
mv "$current_tmp" "$CURRENT"
rm -f "$manifest_tmp"

stable_credential_file="$AGENT_ROOT/credentials.json"
legacy_credential_file="$HOME/.relaydesk/credentials.json"
if [ ! -f "$stable_credential_file" ] && [ -f "$legacy_credential_file" ]; then
  cp "$legacy_credential_file" "$stable_credential_file"
  chmod 600 "$stable_credential_file" 2>/dev/null || true
fi
export RELAYDESK_CREDENTIALS_FILE="$stable_credential_file"
credential_file="$stable_credential_file"
if [ "${RELAYDESK_SKIP_PAIR:-0}" != "1" ]; then
  if [ -f "$credential_file" ]; then
    step "Existing RelayDesk device credential found; keeping the current pairing"
  else
    step "Pairing this device with RelayDesk"
    if [ -n "$DEVICE_NAME" ]; then "$NODE" "$dist_dir/pair.js" --name "$DEVICE_NAME"
    else "$NODE" "$dist_dir/pair.js"
    fi
  fi
fi

if [ "${RELAYDESK_SKIP_SERVICE:-0}" != "1" ]; then
  step "Installing the persistent RelayDesk launcher"
  export RELAYDESK_LAUNCHER_PATH="$LAUNCHER"
  "$NODE" "$dist_dir/service.js" install
fi

step "RelayDesk installation complete"
printf "Install root: %s\nRelease:      %s\nRuntime:      %s\n" "$INSTALL_ROOT" "$version" "$NODE"
printf "RelayDesk only needs outbound HTTPS. No inbound port, SSH tunnel, Git, or global Node installation is required.\n"
