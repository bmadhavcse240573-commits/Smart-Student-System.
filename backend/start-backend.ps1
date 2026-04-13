# Kill any process using port 5000 (common conflict when restarting backend)
$port = 5000
$tcp = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }
if ($tcp) {
    $pids = $tcp | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $pids) {
        Write-Host "Killing process $procId using port $port..."
        try {
            Stop-Process -Id $procId -Force -ErrorAction Stop
            Write-Host "Process $procId terminated."
        } catch {
            Write-Warning ("Failed to kill process " + $procId + ": " + $_.Exception.Message)
        }
    }
} else {
    Write-Host "No process found on port $port."
}

Write-Host "Starting backend server..."
node server.js
