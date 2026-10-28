# Development only (Windows): removes the junctions made by dev\win\link-dev.ps1 and puts back the installed copy
# if there was one. Windows version of dev/unlink-dev.sh.
# Usage: powershell -ExecutionPolicy Bypass -File dev\win\unlink-dev.ps1
$ErrorActionPreference = 'Stop'
$ext = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
$park = Join-Path $env:APPDATA 'JMG Ultra Studio dev\installed-copy'
foreach ($name in 'JMGUltraStudio', 'JMGUltraStudioDevHelper') {
  $link = Join-Path $ext $name
  # .Delete() removes only the junction, never the source folder it points at
  if ((Test-Path $link) -and ((Get-Item $link -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { (Get-Item $link -Force).Delete() }
}
if (Test-Path $park) {
  Move-Item $park (Join-Path $ext 'JMGUltraStudio')
  Remove-Item (Split-Path $park) -ErrorAction SilentlyContinue
}
Write-Output "Development links removed. Restart Premiere."
