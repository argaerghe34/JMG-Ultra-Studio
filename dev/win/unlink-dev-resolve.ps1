# Development only (Windows): removes the dev plugin folder made by dev\win\link-dev-resolve.ps1 (only junctions,
# links and copies - the repository is never touched) and puts back an installed copy if there was one.
# Windows version of dev/resolve/unlink-dev.sh. Restart Resolve afterwards.
# Usage: powershell -ExecutionPolicy Bypass -File dev\win\unlink-dev-resolve.ps1
$ErrorActionPreference = 'Stop'
$dest = Join-Path $env:ProgramData 'Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.jmgphotography.ultrastudio'
$park = Join-Path $env:APPDATA 'JMG Ultra Studio dev\installed-resolve-copy'
if (Get-Process -Name 'Resolve' -ErrorAction SilentlyContinue) { Write-Output 'Resolve is open: quit it first.'; exit 1 }
if (Test-Path (Join-Path $dest '.ultra-studio-dev')) {
  # .Delete() removes only a junction or link, never the folder it points at
  Get-ChildItem $dest -Force | ForEach-Object { if ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) { $_.Delete() } else { Remove-Item $_.FullName -Recurse -Force } }
  Remove-Item $dest -Force
  Write-Output 'Removed the development plugin.'
} elseif (Test-Path $dest) {
  Write-Output "$dest is an installed copy, not the development one - left as it is."
}
if ((Test-Path $park) -and -not (Test-Path $dest)) {
  Move-Item $park $dest
  Remove-Item (Split-Path $park) -ErrorAction SilentlyContinue
  Write-Output 'Put the installed copy back.'
}
Write-Output 'Restart Resolve.'
