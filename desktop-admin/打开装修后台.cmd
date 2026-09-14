@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-admin.ps1" %*
if errorlevel 1 (
  echo Failed to open the admin. See the error above.
  pause
  exit /b 1
)
exit /b 0
