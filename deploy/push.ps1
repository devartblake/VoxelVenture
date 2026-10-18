<#
.SYNOPSIS
  Copies the committed project from this Windows machine to the Linode, and optionally deploys it (deploy/STAGING.md, deploy/README.md).

.DESCRIPTION
  Packs a commit with `git archive`, so only committed, tracked files go (no node_modules, .next, databases or uncommitted edits),
  copies it with scp and unpacks it on the server with ssh. Windows 10 and 11 have ssh and scp built in; rsync is not needed.

    staging     unpacks into /srv/voxelventure-staging/incoming/ (emptied first). With -Deploy: deploy/staging.sh deploy, which builds a
                new release, switches to it and switches back by itself if it does not come up.
    production  unpacks over /srv/voxelventure/ (nothing is deleted there: the database, node_modules and settings stay). With -Deploy:
                a database backup, npm ci, the build with web.env, and a restart of the three services, as "Updating" in deploy/README.md.

  The server is -Server, or the VV_SERVER environment variable (e.g. root@203.0.113.10).

.EXAMPLE
  .\deploy\push.ps1 staging -Server root@203.0.113.10
.EXAMPLE
  $env:VV_SERVER = "root@203.0.113.10"; .\deploy\push.ps1 staging -Deploy
.EXAMPLE
  .\deploy\push.ps1 production -Deploy -Ref main
#>
param(
  [Parameter(Mandatory = $true, Position = 0)][ValidateSet('staging', 'production')][string]$Target,
  [string]$Server = $env:VV_SERVER,
  [string]$Ref = 'HEAD',
  [switch]$Deploy
)
# Not 'Stop': in Windows PowerShell 5.1 that turns anything git or ssh writes to stderr into a crash. Each step checks its exit code instead.
$ErrorActionPreference = 'Continue'

function Fail([string]$message) { Write-Host "push: $message" -ForegroundColor Red; exit 1 }
function Run([string]$what, [scriptblock]$command) {
  Write-Host "== $what" -ForegroundColor Cyan
  & $command
  if ($LASTEXITCODE -ne 0) { Fail "$what failed (exit $LASTEXITCODE)" }
}

if (-not $Server) { Fail 'which server? Pass -Server root@<the Linode''s IP>, or set $env:VV_SERVER' }
foreach ($tool in 'git', 'scp', 'ssh') { if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { Fail "$tool is not installed (ssh and scp: Settings > Apps > Optional features > OpenSSH Client)" } }

$repo = (git rev-parse --show-toplevel 2>$null)
if (-not $repo) { Fail 'run this from inside the project' }
Set-Location $repo
$commit = (git rev-parse --verify --quiet --short "$Ref^{commit}")
if (-not $commit) { Fail "no commit '$Ref'" }
if ($Ref -eq 'HEAD' -and (git status --porcelain --untracked-files=no)) {
  Write-Host 'Note: you have uncommitted changes. They are NOT sent: only the commit is.' -ForegroundColor Yellow
}

$dest = if ($Target -eq 'staging') { '/srv/voxelventure-staging/incoming' } else { '/srv/voxelventure' }
$archive = Join-Path $env:TEMP "voxelventure-$commit.tar.gz"
$remote = "/tmp/voxelventure-$commit.tar.gz"

# LF line endings whatever this machine's Git does on checkout: on Windows git archive would otherwise write CRLF, and on the server
# bash stops at the first line ("set: pipefail: invalid option") and every settings value ends in a stray carriage return
Run "pack $commit ($(git log -1 --format=%s $Ref))" { git -c core.autocrlf=false -c core.eol=lf archive --format=tar.gz -o $archive $Ref }
try {
  Run "copy to $Server" { scp -q $archive "${Server}:$remote" }
} finally {
  Remove-Item $archive -ErrorAction SilentlyContinue
}

if ($Target -eq 'staging') {
  # incoming is only ever a copy of a commit: empty it, so files deleted in the project do not linger
  $unpack = "set -e; rm -rf $dest; mkdir -p $dest; tar -xzf $remote -C $dest --no-same-owner; rm -f $remote; echo $commit > $dest/.commit"
} else {
  # in place: the database, node_modules, .next and the Python environment live in this folder, so nothing is removed
  $unpack = "set -e; test -f $dest/package.json || { echo 'no project at ${dest}: see deploy/README.md, First deployment'; exit 1; }; tar -xzf $remote -C $dest --no-same-owner; rm -f $remote; echo $commit > $dest/.commit; chown -R voxel:voxel $dest"
  # (the unpacked files would otherwise belong to root, and npm ci and the build run as voxel, which owns the rest of the folder)
}
Run "unpack into $dest" { ssh $Server $unpack }

if (-not $Deploy) {
  Write-Host "`nCopied $commit to ${Server}:$dest." -ForegroundColor Green
  if ($Target -eq 'staging') { Write-Host "Deploy it with:  .\deploy\push.ps1 staging -Deploy   (or on the server: bash $dest/deploy/staging.sh deploy)" }
  else { Write-Host 'Deploy it with:  .\deploy\push.ps1 production -Deploy   (or the "Updating" steps in deploy/README.md)' }
  exit 0
}

if ($Target -eq 'staging') {
  Run 'deploy staging' { ssh $Server "bash $dest/deploy/staging.sh deploy" }
} else {
  $steps = @(
    'set -e',
    'cd /srv/voxelventure',
    'sudo -u voxel voxelventure-backup',
    'sudo -u voxel npm ci --no-audit --no-fund',
    'bash deploy/build-web.sh /etc/voxelventure/web.env',
    'systemctl restart voxelventure-api voxelventure-presence voxelventure-web',
    'for i in $(seq 1 30); do curl -fsS http://127.0.0.1:3002/health >/dev/null 2>&1 && curl -fsS -o /dev/null http://127.0.0.1:3000/legal 2>/dev/null && break; sleep 2; done',
    'curl -fsS http://127.0.0.1:3002/health >/dev/null && echo "the API and the site are answering"'
  ) -join '; '
  Run 'deploy production (backup, npm ci, build, restart)' { ssh $Server $steps }
}

Write-Host "`nDeployed $commit to $Target." -ForegroundColor Green
$site = if ($Target -eq 'staging') { 'staging.voxelventure.app' } else { 'voxelventure.app' }
$etc = if ($Target -eq 'staging') { '/etc/voxelventure/staging' } else { '/etc/voxelventure' }
Write-Host 'Check it on the server:'
Write-Host "  cd $(if ($Target -eq 'staging') { '/srv/voxelventure-staging/current' } else { '/srv/voxelventure' })"
Write-Host "  VERIFY_ADMIN_TOKEN=`"`$(grep ^ADMIN_TOKEN= $etc/api.env | cut -d= -f2)`" npm run verify:live -- --api https://api.$site --site https://$site"
