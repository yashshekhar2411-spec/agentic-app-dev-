# Puts the backend on Fly.io (always on), so the app keeps working when the laptop is off or asleep.
# One-time: fly auth login   (opens the browser; Fly asks for a card, the server costs about $3-5/month)
# Then, and after every backend change:
#   powershell -ExecutionPolicy Bypass -File "scripts\deploy-cloud.ps1"
# The app's server address becomes https://<app>.fly.dev and never changes.

param([string]$App = 'agentic-call', [string]$Region = 'bom')

$ErrorActionPreference = 'Stop'
$fly = Join-Path $env:USERPROFILE '.fly\bin\flyctl.exe'
$backend = Join-Path (Split-Path -Parent $PSScriptRoot) 'backend'
$url = "https://$App.fly.dev"
Set-Location $backend

& $fly auth whoami | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Not logged in to Fly.io: run  fly auth login  first' }

# 1. The app and its disk (first run only)
& $fly status --app $App *> $null
$first = $LASTEXITCODE -ne 0
if ($first) {
    & $fly apps create $App
    if ($LASTEXITCODE -ne 0) { throw "Couldn't create '$App' (name taken?): run again with -App <another-name>" }
    & $fly volumes create agentic_data --app $App --region $Region --size 1 --yes
    if ($LASTEXITCODE -ne 0) { throw "Couldn't create the data volume" }
}

# 2. Secrets from backend\.env. The laptop-only settings are left out: no Postgres/Redis (data is saved on the volume),
#    and the public address is the Fly one.
$skip = 'DATABASE_URL', 'REDIS_URL', 'PUBLIC_BASE_URL', 'HUMANS_FILE', 'DATA_DIR', 'PORT'
$lines = Get-Content (Join-Path $backend '.env') | Where-Object { $_ -match '^\s*([A-Z0-9_]+)\s*=(.*)$' -and $skip -notcontains $Matches[1] -and $Matches[2].Trim() -ne '' }
$lines += "PUBLIC_BASE_URL=$url"
$lines -join "`n" | & $fly secrets import --app $App --stage
if ($LASTEXITCODE -ne 0) { throw "Couldn't save the secrets" }

# 3. Build (on Fly's builders: Docker Desktop isn't needed) and start
& $fly deploy --app $App --primary-region $Region --remote-only --ha=false
if ($LASTEXITCODE -ne 0) { throw 'Deploy failed: see the output above' }

# 4. First run: copy the laptop's data (team, roles, contacts, scheduled calls...) to the server, then restart it
if ($first) {
    $files = 'humans.json', 'roles.json', 'super_admins.json', 'invites.json', 'rbac_audit.json', 'contacts.json', 'scheduled_calls.json', 'agent_settings.json'
    foreach ($f in $files) {
        if (Test-Path (Join-Path $backend $f)) {
            "put $f /data/$f" | & $fly ssh sftp shell --app $App
        }
    }
    & $fly apps restart $App
}

Write-Output "Server running: $url  (health: $url/health)"
