# Starts the backend and its public Cloudflare tunnel in the background, keeps the laptop awake while the server
# runs (even with the lid closed), and saves the public URL to backend\public-url.txt.
# Runs automatically when you log in (see install-autostart.ps1); safe to run again by hand: whatever is already
# running is left alone.
#   powershell -ExecutionPolicy Bypass -File "scripts\start-server.ps1"

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'backend'
$logs = Join-Path $backend 'logs'
$cloudflared = 'C:\Users\ABC\cloudflared\cloudflared.exe'
$urlFile = Join-Path $backend 'public-url.txt'
New-Item -ItemType Directory -Force $logs | Out-Null

function Test-Backend { [bool](Get-NetTCPConnection -LocalPort 8001 -State Listen -ErrorAction SilentlyContinue) }

# 1. The backend (FastAPI on port 8001)
if (-not (Test-Backend)) {
    $env:PYTHONDONTWRITEBYTECODE = '1'
    Start-Process -FilePath (Join-Path $backend '.venv\Scripts\python.exe') `
        -ArgumentList '-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', '8001' `
        -WorkingDirectory $backend -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logs 'backend.log') -RedirectStandardError (Join-Path $logs 'backend.err.log')
    for ($i = 0; $i -lt 30 -and -not (Test-Backend); $i++) { Start-Sleep -Seconds 1 }
    if (-not (Test-Backend)) { throw "The backend didn't start: see $logs\backend.err.log" }
}

# 2. The public tunnel (its trycloudflare.com address changes every time it starts)
$tunnelLog = Join-Path $logs 'tunnel.log'
if (-not (Get-Process cloudflared -ErrorAction SilentlyContinue)) {
    Remove-Item $tunnelLog -ErrorAction SilentlyContinue
    # cloudflared prints the address on stderr
    Start-Process -FilePath $cloudflared -ArgumentList 'tunnel', '--url', 'http://localhost:8001', '--no-autoupdate' -WindowStyle Hidden `
        -RedirectStandardError $tunnelLog -RedirectStandardOutput (Join-Path $logs 'tunnel.out.log')
}
$url = $null
for ($i = 0; $i -lt 60 -and -not $url; $i++) {
    if (Test-Path $tunnelLog) {
        $m = Select-String -Path $tunnelLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -Last 1
        if ($m) { $url = $m.Matches[0].Value }
    }
    if (-not $url) { Start-Sleep -Seconds 1 }
}
if ($url) { Set-Content -Path $urlFile -Value $url -Encoding ascii }

# 3. Keep the laptop awake while the backend runs (the lid action itself is set once, in install-autostart.ps1)
$awake = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match 'keep-awake\.ps1' }
if (-not $awake) {
    # Quoted: the project folder ("agentic app") has a space in it
    Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', "`"$(Join-Path $PSScriptRoot 'keep-awake.ps1')`"" -WindowStyle Hidden
}

if ($url) {
    Write-Output "Server running: $url  (also saved in backend\public-url.txt)"
    Write-Output "If the app can't connect, put this address in the app under Settings > Server."
} else {
    Write-Output "Backend running on http://localhost:8001, but the tunnel address didn't show up: see $tunnelLog"
}
