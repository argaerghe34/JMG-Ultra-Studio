@echo off
setlocal EnableExtensions
title JMG Ultra Studio for DaVinci Resolve - installer
set "ID=com.jmgphotography.ultrastudio"
set "SRC=%~dp0%ID%"
set "HELP=%~dp0START HERE - How to install.html"
set "BMD=%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support"
set "PLUGINS=%BMD%\Workflow Integration Plugins"
set "DEST=%PLUGINS%\%ID%"
set "WI=%BMD%\Developer\Workflow Integrations\Examples\SamplePlugin\WorkflowIntegration.node"
set "APP=%ProgramFiles%\Blackmagic Design\DaVinci Resolve\Resolve.exe"
cls
echo JMG Ultra Studio for DaVinci Resolve - installer
echo ================================================
echo This puts JMG Ultra Studio into DaVinci Resolve Studio. It takes under a minute.

echo.
echo Step 1 of 5 - Checking the download
if not exist "%SRC%\manifest.xml" goto nosource
echo   [OK] The plugin is here

echo.
echo Step 2 of 5 - Checking DaVinci Resolve Studio
rem Resolve Studio: Ultra Studio needs its plugin support - the free DaVinci Resolve can't run plugins
if exist "%APP%" goto haveresolve
if exist "%BMD%" goto haveresolve
goto noresolve
:haveresolve
if not exist "%WI%" goto nostudio
echo   [OK] DaVinci Resolve Studio found, with plugin support
rem a Studio licence file is the usual sign of Resolve Studio; a USB key licence has none, so this is only a note
dir /b /a "%BMD%\.license" 2>nul | findstr /i studio >nul
if errorlevel 1 echo   Note: if this is the free DaVinci Resolve, Ultra Studio won't appear in it - plugins need Resolve Studio.

echo.
echo Step 3 of 5 - Making sure Resolve is closed
rem Resolve must be closed while the plugin is replaced - it only reads plugins when it starts
tasklist /FI "IMAGENAME eq Resolve.exe" 2>nul | find /I "Resolve.exe" >nul
if errorlevel 1 goto closed
echo   DaVinci Resolve is open. Save your work and quit Resolve - File ^> Quit.
echo   The installer carries on by itself as soon as Resolve has closed...
:waitresolve
timeout /t 2 /nobreak >nul
tasklist /FI "IMAGENAME eq Resolve.exe" 2>nul | find /I "Resolve.exe" >nul
if not errorlevel 1 goto waitresolve
:closed
echo   [OK] Resolve is closed

echo.
echo Step 4 of 5 - Getting permission to write to Resolve's plugin folder
rem Resolve's plugin folder is shared by everyone on this PC: ask Windows for permission only if it can't be written
if not exist "%PLUGINS%" mkdir "%PLUGINS%" >nul 2>&1
(echo ok> "%PLUGINS%\.ultra-studio-write-test") >nul 2>&1
if not exist "%PLUGINS%\.ultra-studio-write-test" goto elevate
del /F /Q "%PLUGINS%\.ultra-studio-write-test" >nul 2>&1
echo   [OK] Permission granted

echo.
echo Step 5 of 5 - Copying JMG Ultra Studio into Resolve
rem replace any earlier version - your settings and analysis results are kept, they live elsewhere
if exist "%DEST%" echo   Replacing the version already installed - your settings and analysis results are kept.
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
echo   [OK] Files copied

echo.
echo ================================================
echo   INSTALLED: JMG Ultra Studio is now in DaVinci Resolve Studio.
echo ================================================
echo.
echo How to open it:
echo   1. Open DaVinci Resolve Studio and open a project - any project, the plugin menu needs one open.
echo   2. In the menu bar choose:  Workspace ^> Workflow Integrations ^> JMG Ultra Studio
echo   3. It opens in its own window - drag it beside Resolve or onto a second screen.
echo   4. On the Home tab press "Check my setup" - it checks everything works on this PC.
echo.
echo Then: open a timeline and pick a tool on the left - Story, Selects and Silence Cut are good first tries.
echo Not in the menu? Quit Resolve completely and open it again - it only looks for plugins when it starts.
echo.
choice /c OHX /n /m "Press O to open DaVinci Resolve now, H for the step-by-step help page, or X to close: "
if errorlevel 3 exit /b 0
if errorlevel 2 (start "" "%HELP%" & exit /b 0)
if exist "%APP%" (start "" "%APP%") else (echo Open DaVinci Resolve from the Start menu.)
echo Opening DaVinci Resolve... then choose Workspace ^> Workflow Integrations ^> JMG Ultra Studio.
timeout /t 8 >nul
exit /b 0

:nosource
call :fail "Can't find the plugin next to this installer." "Unzip the whole download first - right-click the zip, Extract All - then run this again from the unzipped folder."
exit /b 1

:noresolve
call :fail "DaVinci Resolve Studio isn't installed on this PC." "Ultra Studio runs inside DaVinci Resolve Studio - the paid version, 19.1 or later. Install it from blackmagicdesign.com, then run this installer again."
exit /b 1

:nostudio
call :fail "Couldn't find Resolve Studio's plugin support on this PC." "Ultra Studio needs DaVinci Resolve Studio 19.1 or later - the free DaVinci Resolve can't run plugins. Install or update it, then run this installer again."
exit /b 1

:elevate
net session >nul 2>&1
if not errorlevel 1 (
  call :fail "Couldn't write to Resolve's plugin folder: %PLUGINS%" "Close Resolve and any File Explorer window showing that folder, then run this again."
  exit /b 1
)
echo   Windows needs your permission: Resolve's plugin folder is shared by everyone on this PC.
echo   A box asking "Do you want to allow this app to make changes?" will open - click Yes.
echo   The installer then carries on in a new window.
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
timeout /t 5 >nul
exit /b 0

:inuse
call :fail "Couldn't replace the old version: something is still using its folder." "Close Resolve and any File Explorer window showing that folder, then run this again."
exit /b 1

:copyfailed
if exist "%DEST%" rmdir /S /Q "%DEST%"
if exist "%DEST%.previous" move "%DEST%.previous" "%DEST%" >nul
call :fail "Couldn't copy the files - your previous version, if any, has been put back." "Make sure Resolve is closed, then run the installer again."
exit /b 1

:fail
echo.
echo   [X] %~1
echo       %~2
echo.
echo Step-by-step help: "START HERE - How to install.html" in this folder.
choice /c HX /n /m "Press H to open that help page, or X to close: "
if errorlevel 2 exit /b 0
start "" "%HELP%"
exit /b 0
