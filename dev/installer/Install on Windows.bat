@echo off
setlocal
title JMG Ultra Studio installer
set "SRC=%~dp0JMG Ultra Studio extension"
set "DEST=%APPDATA%\Adobe\CEP\extensions\JMGUltraStudio"
echo JMG Ultra Studio - installer
echo ============================
echo.
if not exist "%SRC%\CSXS\manifest.xml" (
  echo Can't find the extension next to this installer.
  echo Unzip the whole download first ^(right-click the zip, Extract All^), then run this again.
  pause & exit /b 1
)
:inplace
rem An update while Premiere is open: only the panel's files change, so they're replaced where they are and the panel's
rem Reload button picks them up. If the manifest changed (anything but the version), Premiere has to be quit after all.
tasklist /FI "IMAGENAME eq Adobe Premiere Pro.exe" 2>nul | find /I "Adobe Premiere Pro.exe" >nul
if errorlevel 1 goto waitppro
if not exist "%DEST%\CSXS\manifest.xml" goto waitppro
powershell -NoProfile -Command "$a=(Get-Content -Raw '%SRC%\CSXS\manifest.xml') -replace 'Version=\"[^\"]*\"',''; $b=(Get-Content -Raw '%DEST%\CSXS\manifest.xml') -replace 'Version=\"[^\"]*\"',''; if ($a -eq $b) { exit 0 } else { exit 1 }"
if errorlevel 1 goto waitppro
robocopy "%SRC%" "%DEST%" /MIR /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 (
  echo Couldn't update in place - quit Premiere and run this again.
  goto waitppro
)
del /S /Q /F "%DEST%\._*" >nul 2>&1
echo.
echo JMG Ultra Studio is installed ^(updated while Premiere is open^).
echo.
echo Next: in the panel, press the Reload button in the top bar - no need to quit Premiere.
echo.
pause
exit /b 0
:waitppro
tasklist /FI "IMAGENAME eq Adobe Premiere Pro.exe" 2>nul | find /I "Adobe Premiere Pro.exe" >nul
if not errorlevel 1 (
  echo Premiere Pro is open. Please save your work and quit Premiere, then press a key.
  pause >nul
  goto waitppro
)
if exist "%DEST%.previous" rmdir /S /Q "%DEST%.previous"
if exist "%DEST%" move "%DEST%" "%DEST%.previous" >nul
if exist "%DEST%" (
  echo Couldn't replace the old version: something is still using its folder.
  echo Close Premiere and any File Explorer window showing that folder, then run this again.
  pause & exit /b 1
)
xcopy "%SRC%" "%DEST%\" /E /I /Q /Y >nul
if errorlevel 1 (
  echo Couldn't copy the files. Your previous version ^(if any^) has been put back.
  if exist "%DEST%" rmdir /S /Q "%DEST%"
  if exist "%DEST%.previous" move "%DEST%.previous" "%DEST%" >nul
  pause & exit /b 1
)
rem macOS metadata files (._name) that some zips carry are not part of the extension
del /S /Q /F "%DEST%\._*" >nul 2>&1
if exist "%DEST%.previous" rmdir /S /Q "%DEST%.previous"
rem Premiere only loads extensions that aren't from the Adobe marketplace when this switch is on
for %%v in (9 10 11 12 13 14) do reg add "HKCU\Software\Adobe\CSXS.%%v" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
echo.
echo JMG Ultra Studio is installed.
echo.
echo Next: open Premiere Pro, then choose Window ^> Extensions ^> JMG Ultra Studio.
echo On Home, press "Check my setup" to make sure everything works on this PC.
echo.
pause
