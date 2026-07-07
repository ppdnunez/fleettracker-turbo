<#
Supervises `php artisan mqtt:worker`, restarting it automatically if the PHP process itself exits.

mqtt:worker already retries MQTT connection failures internally (see the reconnect loop in
MqttWorker::handle) — that covers dropped sockets, broker restarts, etc. without the process ever
exiting. This script is the second layer: it guards against the PHP process itself dying (fatal
error, out-of-memory, someone killing it) by relaunching it whenever it exits, for any reason,
until this script is stopped (Ctrl+C).

Usage: powershell -File scripts\mqtt-worker-supervisor.ps1
#>
param(
    [int]$RestartDelaySeconds = 5
)

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

while ($true) {
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Starting mqtt:worker..." -ForegroundColor Cyan
    & php artisan mqtt:worker
    $exitCode = $LASTEXITCODE
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] mqtt:worker exited (code $exitCode). Restarting in ${RestartDelaySeconds}s... (Ctrl+C to stop)" -ForegroundColor Yellow
    Start-Sleep -Seconds $RestartDelaySeconds
}
