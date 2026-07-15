[CmdletBinding()]
param(
  [string]$Server = "180.76.145.83",
  [string]$User = "root",
  [string]$IdentityFile = "$HOME\.ssh\solara_tencent",
  [string]$RemoteRoot = "/opt/perler-beads",
  [string]$DataDir = "/data/perler",
  [int]$Port = 5000,
  [switch]$SkipLocalBuild,
  [switch]$AllowDirty
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$identityPath = (Resolve-Path $IdentityFile).Path

function Invoke-Checked {
  param([string]$Command, [string[]]$Arguments)

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command failed with exit code $LASTEXITCODE"
  }
}

Push-Location $projectRoot
try {
  $status = git status --porcelain --untracked-files=no
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to read Git status."
  }
  if ($status -and -not $AllowDirty) {
    throw "The worktree has tracked changes. Commit them first, or pass -AllowDirty for a test deployment."
  }

  if (-not $SkipLocalBuild) {
    Write-Host "[1/5] Running the local production build..." -ForegroundColor Cyan
    Invoke-Checked "npm.cmd" @("run", "build")
  }

  $shortSha = (git rev-parse --short HEAD).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to resolve the current commit."
  }
  $releaseId = "$(Get-Date -Format 'yyyyMMdd-HHmmss')-$shortSha"
  if ($AllowDirty -and $status) {
    $releaseId += "-dirty"
  }

  $archivePath = Join-Path ([System.IO.Path]::GetTempPath()) "perler-beads-$releaseId.tar.gz"
  if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
  }

  Write-Host "[2/5] Packing release $releaseId..." -ForegroundColor Cyan
  if ($AllowDirty -and $status) {
    Invoke-Checked "tar.exe" @(
      "--exclude=.git", "--exclude=.next", "--exclude=node_modules",
      "--exclude=data", "--exclude=.codex-remote-attachments",
      "-czf", $archivePath, "."
    )
  } else {
    Invoke-Checked "git.exe" @("archive", "--format=tar.gz", "-o", $archivePath, "HEAD")
  }

  $target = "$User@$Server"
  $remoteArchive = "/tmp/perler-beads-$releaseId.tar.gz"
  $releasePath = "$RemoteRoot/releases/$releaseId"
  $remoteStatus = "$releasePath/.deploy-status"
  $remoteLog = "/tmp/perler-beads-$releaseId.log"
  $sshArgs = @("-i", $identityPath, "-o", "BatchMode=yes", "-o", "ConnectTimeout=15")

  Write-Host "[3/5] Uploading to $target..." -ForegroundColor Cyan
  Invoke-Checked "scp.exe" @($sshArgs + @($archivePath, "${target}:$remoteArchive"))

  Write-Host "[4/5] Starting the server build..." -ForegroundColor Cyan
  $remoteCommand = @(
    "set -e",
    "mkdir -p '$releasePath'",
    "tar -xzf '$remoteArchive' -C '$releasePath'",
    "rm -f '$remoteArchive'",
    "chmod +x '$releasePath/scripts/deploy-server.sh'",
    "rm -f '$remoteStatus' '$remoteLog'",
    "nohup env PERLER_REMOTE_ROOT='$RemoteRoot' PERLER_DATA_DIR='$DataDir' PORT='$Port' '$releasePath/scripts/deploy-server.sh' '$releasePath' > '$remoteLog' 2>&1 < /dev/null &"
  ) -join " && "
  Invoke-Checked "ssh.exe" @($sshArgs + @($target, $remoteCommand))

  $deploymentDeadline = (Get-Date).AddMinutes(12)
  $deploymentState = "running"
  while ((Get-Date) -lt $deploymentDeadline) {
    Start-Sleep -Seconds 4
    $deploymentState = (& ssh.exe @($sshArgs + @($target, "cat '$remoteStatus' 2>/dev/null || printf running"))).Trim()
    if ($LASTEXITCODE -ne 0) {
      Write-Host "  waiting for server reconnect..." -ForegroundColor DarkYellow
      continue
    }
    if ($deploymentState -eq "success") {
      break
    }
    if ($deploymentState -eq "failed") {
      $remoteOutput = & ssh.exe @($sshArgs + @($target, "tail -n 40 '$remoteLog' 2>/dev/null || true"))
      throw "Server deployment failed.`n$remoteOutput"
    }
    Write-Host "  server build in progress..." -ForegroundColor DarkGray
  }

  if ($deploymentState -ne "success") {
    $remoteOutput = & ssh.exe @($sshArgs + @($target, "tail -n 40 '$remoteLog' 2>/dev/null || true"))
    throw "Server deployment timed out.`n$remoteOutput"
  }

  Write-Host "[5/5] Deployment complete: $releasePath" -ForegroundColor Green
} finally {
  Pop-Location
  if ($archivePath -and (Test-Path -LiteralPath $archivePath)) {
    Remove-Item -LiteralPath $archivePath -Force
  }
}
