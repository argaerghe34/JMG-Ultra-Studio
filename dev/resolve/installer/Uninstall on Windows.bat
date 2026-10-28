@echo off
setlocal EnableExtensions
rem JMG Ultra Studio - removes the plugin from DaVinci Resolve Studio. Settings and analysis results stay in
rem %APPDATA%\JMG Ultra Studio - shared with Premiere; delete that folder too if you want them gone.
set "DEST=%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.jmgphotography.ultrastudio"
if not exist "%DEST%" (
  echo JMG Ultra Studio isn't installed in Resolve.
  pause & exit /b 0
)
rmdir /S /Q "%DEST%" >nul 2>&1
if not exist "%DEST%" (
  echo JMG Ultra Studio has been removed from Resolve. Restart Resolve.
  pause & exit /b 0
)
net session >nul 2>&1
if errorlevel 1 (
  echo Windows needs your permission to remove it from Resolve's plugin folder. Click Yes in the window that opens.
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b 0
)
echo Couldn't remove it. Quit Resolve and try again.
pause & exit /b 1
