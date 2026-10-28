@echo off
setlocal EnableExtensions
title JMG Ultra Studio for DaVinci Resolve - installer
set "ID=com.jmgphotography.ultrastudio"
set "SRC=%~dp0%ID%"
set "BMD=%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support"
set "PLUGINS=%BMD%\Workflow Integration Plugins"
set "DEST=%PLUGINS%\%ID%"
set "WI=%BMD%\Developer\Workflow Integrations\Examples\SamplePlugin\WorkflowIntegration.node"
echo JMG Ultra Studio for DaVinci Resolve - installer
echo ================================================
echo.
if not exist "%SRC%\manifest.xml" goto nosource

rem Resolve Studio: Ultra Studio needs its plugin support - the free DaVinci Resolve can't run plugins
if exist "%ProgramFiles%\Blackmagic Design\DaVinci Resolve\Resolve.exe" goto haveresolve
if exist "%BMD%" goto haveresolve
goto noresolve
:haveresolve
if not exist "%WI%" goto nostudio
rem a Studio licence file is the usual sign of Resolve Studio; a USB key licence has none, so this is only a note
dir /b /a "%BMD%\.license" 2>nul | findstr /i studio >nul
if errorlevel 1 (
  echo Note: if this PC has the free DaVinci Resolve, Ultra Studio won't appear in it - plugins need Resolve Studio.
  echo.
)

rem Resolve must be closed while the plugin is replaced - it only reads plugins when it starts
:waitresolve
tasklist /FI "IMAGENAME eq Resolve.exe" 2>nul | find /I "Resolve.exe" >nul
if not errorlevel 1 (
  echo DaVinci Resolve is open. Please save your work and quit Resolve, then press a key.
  pause >nul
  goto waitresolve
)

rem Resolve's plugin folder is shared by everyone on this PC: ask Windows for permission only if it can't be written
if not exist "%PLUGINS%" mkdir "%PLUGINS%" >nul 2>&1
(echo ok> "%PLUGINS%\.ultra-studio-write-test") >nul 2>&1
if not exist "%PLUGINS%\.ultra-studio-write-test" goto elevate
del /F /Q "%PLUGINS%\.ultra-studio-write-test" >nul 2>&1

rem replace any earlier version - your settings and analysis results are kept, they live elsewhere
if exist "%DEST%.previous" rmdir /S /Q "%DEST%.previous"
if exist "%DEST%" move "%DEST%" "%DEST%.previous" >nul
if exist "%DEST%" goto inuse
xcopy "%SRC%" "%DEST%\" /E /I /Q /Y >nul
if errorlevel 1 goto copyfailed
copy /Y "%WI%" "%DEST%\WorkflowIntegration.node" >nul
if errorlevel 1 goto copyfailed
rem macOS metadata files (._name) that some zips carry, and the development switch, are not part of the plugin
del /S /Q /F "%DEST%\._*" >nul 2>&1
if exist "%DEST%\debug" del /F /Q "%DEST%\debug" >nul 2>&1
if exist "%DEST%.previous" rmdir /S /Q "%DEST%.previous"
echo.
echo JMG Ultra Studio is installed in DaVinci Resolve Studio.
echo.
echo Next: open Resolve, then choose Workspace ^> Workflow Integrations ^> JMG Ultra Studio.
echo On Home, press "Check my setup" to make sure everything works on this PC.
echo.
pause
exit /b 0

:nosource
echo Can't find the plugin next to this installer.
echo Unzip the whole download first - right-click the zip, Extract All - then run this again.
pause & exit /b 1

:noresolve
echo DaVinci Resolve Studio isn't installed on this PC.
echo Ultra Studio runs inside DaVinci Resolve Studio - the paid version, 19.1 or later.
echo Install it from blackmagicdesign.com, then run this installer again.
pause & exit /b 1

:nostudio
echo Couldn't find Resolve Studio's plugin support on this PC.
echo Ultra Studio needs DaVinci Resolve Studio 19.1 or later - the free DaVinci Resolve can't run plugins.
echo Install or update DaVinci Resolve Studio, then run this installer again.
pause & exit /b 1

:elevate
net session >nul 2>&1
if not errorlevel 1 (
  echo Couldn't write to Resolve's plugin folder:
  echo %PLUGINS%
  pause & exit /b 1
)
echo Windows needs your permission to install into Resolve's plugin folder - it's shared by everyone on this PC.
echo A window asking to allow changes will open: click Yes. The installer then carries on in a new window.
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
exit /b 0

:inuse
echo Couldn't replace the old version: something is still using its folder.
echo Close Resolve and any File Explorer window showing that folder, then run this again.
pause & exit /b 1

:copyfailed
echo Couldn't copy the files. Your previous version - if any - has been put back.
if exist "%DEST%" rmdir /S /Q "%DEST%"
if exist "%DEST%.previous" move "%DEST%.previous" "%DEST%" >nul
pause & exit /b 1
