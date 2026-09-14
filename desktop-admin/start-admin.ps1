param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$adminRoot = $PSScriptRoot
$adminUrl = 'http://localhost:5188/'
$adminRunning = $false
try { $adminResponse = Invoke-WebRequest -Uri $adminUrl -UseBasicParsing -TimeoutSec 3; $adminRunning = $adminResponse.StatusCode -eq 200 -and $adminResponse.Content.Contains('TOPUYI') } catch {}
if (-not $adminRunning) {
    $adminNode = (Get-Command node.exe).Source
    $adminCli = Join-Path $adminRoot 'node_modules\vinext\dist\cli.js'
    if (-not (Test-Path -LiteralPath $adminCli)) { throw 'Dependencies missing. Run npm install in the desktop-admin folder first.' }
    $adminArgs = @(('"' + $adminCli + '"'), 'dev', '--host', '127.0.0.1', '--port', '5188', '--strictPort')
    $adminProcess = Start-Process -FilePath $adminNode -ArgumentList $adminArgs -WorkingDirectory $adminRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $adminRoot 'local-server.log') -RedirectStandardError (Join-Path $adminRoot 'local-server-error.log')
    for ($adminAttempt = 0; $adminAttempt -lt 35; $adminAttempt++) {
        Start-Sleep -Milliseconds 500
        if ($adminProcess.HasExited) { throw 'The local server stopped. See local-server-error.log in this folder.' }
        try { $adminResponse = Invoke-WebRequest -Uri $adminUrl -UseBasicParsing -TimeoutSec 2; if ($adminResponse.StatusCode -eq 200 -and $adminResponse.Content.Contains('TOPUYI')) { $adminRunning = $true; break } } catch {}
    }
}
if (-not $adminRunning) { throw 'Local server is still starting. Please try again shortly.' }
if (-not $NoBrowser) { Start-Process $adminUrl }
