# Stops Windows from going to sleep while the backend is running on port 8000; exits (and lets the laptop sleep
# normally again) when the backend stops. Started by start-server.ps1.

$kernel = Add-Type -PassThru -Name Power -Namespace AgenticCall -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags);
'@
$ES_CONTINUOUS = [uint32]'0x80000000'
$ES_SYSTEM_REQUIRED = [uint32]'0x00000001'

$kernel::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED) | Out-Null
try {
    while (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue) { Start-Sleep -Seconds 60 }
} finally {
    $kernel::SetThreadExecutionState($ES_CONTINUOUS) | Out-Null
}
