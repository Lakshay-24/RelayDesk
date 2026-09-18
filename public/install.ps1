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
function Test-Release([string]$Root, $Manifest) {
  foreach ($property in $Manifest.files.psobject.Properties) {
    $file = $property.Name
    $expected = [string]$property.Value
    $path = if ($file -eq "package.json") { Join-Path $Root $file } else { Join-Path (Join-Path $Root "dist") $file }
    if (!(Test-Path $path)) { return $false }
    $actual = (Get-FileHash -Algorithm SHA256 -Path $path).Hash.ToLowerInvariant()
    if ($actual -ne $expected) { return $false }
  }
  return $true
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
$ReleasesRoot = Join-Path $AgentRoot "releases"
$LauncherPath = Join-Path $AgentRoot "launcher.js"
$CurrentPath = Join-Path $AgentRoot "current.json"

New-Item -ItemType Directory -Force -Path $InstallRoot,$RuntimeRoot,$AgentRoot,$ReleasesRoot | Out-Null

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
if (!(Test-Path $NodeExe) -or !(Test-Path $NpmCmd)) { throw "RelayDesk runtime installation failed." }

Write-Step "Downloading and verifying the RelayDesk release manifest"
$ManifestTemp = Join-Path $env:TEMP "relaydesk-manifest-$PID.json"
Download-File "$BaseUrl/manifest.json" $ManifestTemp
$ManifestRaw = Get-Content $ManifestTemp -Raw
$Manifest = $ManifestRaw | ConvertFrom-Json
$Version = [string]$Manifest.version
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "Invalid RelayDesk release version." }
if ([string]::IsNullOrWhiteSpace([string]$Manifest.launcher_sha256)) { throw "RelayDesk launcher checksum missing." }

Write-Step "Installing the verified RelayDesk launcher"
$LauncherTemp = "$LauncherPath.new-$PID"
Download-File "$BaseUrl/launcher.js" $LauncherTemp
$LauncherHash = (Get-FileHash -Algorithm SHA256 -Path $LauncherTemp).Hash.ToLowerInvariant()
if ($LauncherHash -ne ([string]$Manifest.launcher_sha256).ToLowerInvariant()) {
  Remove-Item $LauncherTemp -Force -ErrorAction SilentlyContinue
  throw "RelayDesk launcher checksum verification failed."
}
if (Test-Path $LauncherPath) {
  $ExistingLauncherHash = (Get-FileHash -Algorithm SHA256 -Path $LauncherPath).Hash.ToLowerInvariant()
  if ($ExistingLauncherHash -ne $LauncherHash) {
    throw "RelayDesk launcher differs from this release. Stop the existing RelayDesk service before upgrading the launcher."
  }
  Remove-Item $LauncherTemp -Force
} else {
  Move-Item -Force $LauncherTemp $LauncherPath
}

$ReleaseRoot = Join-Path $ReleasesRoot $Version
$DistDir = Join-Path $ReleaseRoot "dist"
$StageRoot = Join-Path $AgentRoot ".install-$Version-$PID"
$StageDist = Join-Path $StageRoot "dist"
Remove-Item $StageRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $StageDist | Out-Null

Write-Step "Downloading and verifying RelayDesk $Version"
foreach ($property in $Manifest.files.psobject.Properties) {
  $file = $property.Name
  $expected = ([string]$property.Value).ToLowerInvariant()
  if ($file -notin @("package.json","config.js","credentials.js","index.js","pair.js","service.js")) {
    throw "Unexpected RelayDesk release file: $file"
  }
  $destination = if ($file -eq "package.json") { Join-Path $StageRoot $file } else { Join-Path $StageDist $file }
  Download-File "$BaseUrl/$file" $destination
  $actual = (Get-FileHash -Algorithm SHA256 -Path $destination).Hash.ToLowerInvariant()
  if ($actual -ne $expected) { throw "Checksum verification failed for $file." }
}
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)\n[System.IO.File]::WriteAllText((Join-Path $StageDist "manifest.json"), $ManifestRaw, $Utf8NoBom)

Write-Step "Installing RelayDesk runtime dependencies"
Push-Location $StageRoot
try {
  & $NpmCmd install --omit=dev --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }
} finally { Pop-Location }

if (Test-Path $ReleaseRoot) {
  if (Test-Release $ReleaseRoot $Manifest) {
    Remove-Item $StageRoot -Recurse -Force
  } else {
    throw "Existing RelayDesk release $Version is incomplete or corrupt. Stop RelayDesk before repairing this release."
  }
} else {
  Move-Item $StageRoot $ReleaseRoot
}

$Previous = $null
if (Test-Path $CurrentPath) {
  try { $Previous = (Get-Content $CurrentPath -Raw | ConvertFrom-Json).version } catch {}
}
$CurrentTemp = "$CurrentPath.new-$PID"
$CurrentJson = @{ version = $Version; previous = $Previous } | ConvertTo-Json\n[System.IO.File]::WriteAllText($CurrentTemp, $CurrentJson + [Environment]::NewLine, $Utf8NoBom)
Move-Item -Force $CurrentTemp $CurrentPath
Remove-Item $ManifestTemp -Force -ErrorAction SilentlyContinue

$CredentialFile = Join-Path $HOME ".relaydesk\credentials.json"
if (!$SkipPair) {
  if (Test-Path $CredentialFile) {
    Write-Step "Existing RelayDesk device credential found; keeping the current pairing"
  } else {
    Write-Step "Pairing this device with RelayDesk"
    $pairArgs = @((Join-Path $DistDir "pair.js"))
    if (![string]::IsNullOrWhiteSpace($DeviceName)) { $pairArgs += @("--name",$DeviceName) }
    & $NodeExe @pairArgs
    if ($LASTEXITCODE -ne 0) { throw "RelayDesk pairing failed." }
  }
}
if (!$SkipService) {
  Write-Step "Installing the persistent RelayDesk launcher"
  $env:RELAYDESK_LAUNCHER_PATH = $LauncherPath
  & $NodeExe (Join-Path $DistDir "service.js") install
  if ($LASTEXITCODE -ne 0) { throw "RelayDesk background service installation failed." }
}

Write-Step "RelayDesk installation complete"
Write-Host "Install root: $InstallRoot"
Write-Host "Release:      $Version"
Write-Host "Runtime:      $NodeExe"
if (!$SkipPair) { Write-Host "Pairing:      ready" }
if (!$SkipService) { Write-Host "Background:   installed" }
Write-Host ""
Write-Host "RelayDesk only needs outbound HTTPS. No inbound port, SSH tunnel, Git, or global Node installation is required."
