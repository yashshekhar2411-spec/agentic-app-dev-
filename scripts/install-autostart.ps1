# One-time setup so the server keeps working with the laptop closed:
#   1. closing the lid no longer puts the laptop to sleep (plugged in and on battery);
#   2. the backend + tunnel start by themselves every time you log in.
#   powershell -ExecutionPolicy Bypass -File "scripts\install-autostart.ps1"
# Undo: powershell -ExecutionPolicy Bypass -File "scripts\install-autostart.ps1" -Undo

param([switch]$Undo)

$taskName = 'Agentic Call server'
$buttons = '4f971e89-eebd-4455-a8de-9e59040e7347'  # power settings: buttons and lid
$lidAction = '5ca83367-6e45-459f-a27b-476b1d01c936'  # 0 = do nothing, 1 = sleep

if ($Undo) {
    powercfg /setacvalueindex SCHEME_CURRENT $buttons $lidAction 1
    powercfg /setdcvalueindex SCHEME_CURRENT $buttons $lidAction 1
    powercfg /setactive SCHEME_CURRENT
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Output 'Closing the lid sleeps the laptop again, and the server no longer starts at log-in.'
    return
}

powercfg /setacvalueindex SCHEME_CURRENT $buttons $lidAction 0
powercfg /setdcvalueindex SCHEME_CURRENT $buttons $lidAction 0
powercfg /setactive SCHEME_CURRENT

$script = Join-Path $PSScriptRoot 'start-server.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Starts the Agentic Call backend and its tunnel' -Force | Out-Null

Write-Output 'Done: closing the lid keeps the laptop (and the server) running, and the server starts at every log-in.'
