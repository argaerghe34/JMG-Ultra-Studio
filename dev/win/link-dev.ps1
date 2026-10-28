# Development only (Windows): points Premiere at this source folder (instead of an installed copy) and installs the
# dev helper that opens the panel on launch, so dev\win\restart-premiere.ps1, dev\e2e and dev\cep.js work.
# Windows version of dev/link-dev.sh. Junctions need no admin rights. Undo with dev\win\unlink-dev.ps1.
# Usage: powershell -ExecutionPolicy Bypass -File dev\win\link-dev.ps1
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$ext = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
New-Item -ItemType Directory -Force $ext | Out-Null
$park = Join-Path $env:APPDATA 'JMG Ultra Studio dev\installed-copy'

function Test-Junction($p) { (Test-Path $p) -and ((Get-Item $p -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) }

# park any installed copy OUTSIDE the extensions folder (two copies with the same id stop the panel opening)
$installed = Join-Path $ext 'JMGUltraStudio'
if ((Test-Path $installed) -and -not (Test-Junction $installed)) {
  New-Item -ItemType Directory -Force (Split-Path $park) | Out-Null
  if (Test-Path $park) { Remove-Item $park -Recurse -Force }
  Move-Item $installed $park
  Write-Output "Parked the installed copy in $park"
}
foreach ($pair in @(@('JMGUltraStudio', $root), @('JMGUltraStudioDevHelper', (Join-Path $root 'dev\helper')))) {
  $link = Join-Path $ext $pair[0]
  # a junction is removed with .Delete() so its target is never touched
  if (Test-Junction $link) { (Get-Item $link -Force).Delete() }
  New-Item -ItemType Junction -Path $link -Target $pair[1] | Out-Null
}
# Premiere only loads extensions that aren't from the Adobe marketplace when this switch is on (the installer sets it too)
$off = 9..14 | Where-Object { (Get-ItemProperty "HKCU:\Software\Adobe\CSXS.$_" -ErrorAction SilentlyContinue).PlayerDebugMode -ne '1' }
if ($off) { Write-Output "PlayerDebugMode is off for CSXS $($off -join ', '): run 'Install on Windows.bat' once (it turns it on), then run this again."; exit 1 }
Write-Output "Linked for development (debug port 8890, helper 8891). Restart Premiere to pick it up."
