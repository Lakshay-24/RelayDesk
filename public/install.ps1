param(
  [string]$BaseUrl = "https://relay-desk-mjq6.vercel.app/agent-dist",
  [string]$InstallRoot = "",
  [string]$DeviceName = "",
  [switch]$SkipPair,
  [switch]$SkipService
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Download-File([string]$Url, [string]$Destination) {
  $dir = Split-Path -Parent $Destination
  if ($dir) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Destination
}

if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
  $InstallRoot = Join-Path $env:LOCALAPPDATA "RelayDesk"
}

$NodeVersion = "22.22.0"
$arch = $env:PROCESSOR_ARCHITECTURE
if ($arch -eq "ARM64") {
  $NodeArchive = "node-v$NodeVersion-win-arm64.zip"
  $NodeSha256 = "5b44fd410df7b4cd0a1891a05a7b606f8fb7d8786a94997b996a372e82478d7a"
} elseif ($arch -eq "AMD64" -or $arch -eq "x86") {
  $NodeArchive = "node-v$NodeVersion-win-x64.zip"
  $NodeSha256 = "c97fa376d2becdc8863fcd3ca2dd9a83a9f3468ee7ccf7a6d076ec66a645c77a"
} else {
  throw "Unsupported Windows architecture: $arch"
}

$RuntimeRoot = Join-Path $InstallRoot "runtime"
$NodeDir = Join-Path $RuntimeRoot ($NodeArchive -replace "\.zip$","")
$NodeExe = Join-Path $NodeDir "node.exe"
$NpmCmd = Join-Path $NodeDir "npm.cmd"
$AgentRoot = Join-Path $InstallRoot "agent"
$DistDir = Join-Path $AgentRoot "dist"

New-Item -ItemType Directory -Force -Path $InstallRoot,$RuntimeRoot,$AgentRoot,$DistDir | Out-Null

if (!(Test-Path $NodeExe)) {
  Write-Step "Installing the private RelayDesk Node runtime"
  $tmp = Join-Path $env:TEMP $NodeArchive
  Download-File "https://nodejs.org/dist/v$NodeVersion/$NodeArchive" $tmp
  $actual = (Get-FileHash -Algorithm SHA256 -Path $tmp).Hash.ToLowerInvariant()
  if ($actual -ne $NodeSha256) {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    throw "Node runtime checksum verification failed."
  }
  Expand-Archive -Path $tmp -DestinationPath $RuntimeRoot -Force
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
}

if (!(Test-Path $NodeExe) -or !(Test-Path $NpmCmd)) {
  throw "RelayDesk runtime installation failed."
}

Write-Step "Downloading the current RelayDesk agent"
Download-File "$BaseUrl/package.json" (Join-Path $AgentRoot "package.json")
foreach ($file in @("config.js","credentials.js","index.js","pair.js","service.js")) {
  Download-File "$BaseUrl/$file" (Join-Path $DistDir $file)
}

Write-Step "Installing RelayDesk runtime dependencies"
Push-Location $AgentRoot
try {
  & $NpmCmd install --omit=dev --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
}

$CredentialFile = Join-Path $HOME ".relaydesk\credentials.json"
if (!$SkipPair) {
  if (Test-Path $CredentialFile) {
    Write-Step "Existing RelayDesk device credential found; keeping the current pairing"
  } else {
    Write-Step "Pairing this device with RelayDesk"
    $pairArgs = @((Join-Path $DistDir "pair.js"))
    if (![string]::IsNullOrWhiteSpace($DeviceName)) {
      $pairArgs += @("--name",$DeviceName)
    }
    & $NodeExe @pairArgs
    if ($LASTEXITCODE -ne 0) { throw "RelayDesk pairing failed." }
  }
}

if (!$SkipService) {
  Write-Step "Installing the persistent RelayDesk background agent"
  & $NodeExe (Join-Path $DistDir "service.js") install
  if ($LASTEXITCODE -ne 0) { throw "RelayDesk background service installation failed." }
}

Write-Step "RelayDesk installation complete"
Write-Host "Install root: $InstallRoot"
Write-Host "Runtime:      $NodeExe"
if (!$SkipPair) { Write-Host "Pairing:      ready" }
if (!$SkipService) { Write-Host "Background:   installed" }
Write-Host ""
Write-Host "RelayDesk only needs outbound HTTPS. No inbound port, SSH tunnel, Git, or global Node installation is required."
