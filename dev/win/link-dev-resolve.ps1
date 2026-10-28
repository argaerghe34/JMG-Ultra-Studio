# Development only (Windows): points DaVinci Resolve Studio at this source folder (instead of an installed copy), with
# the DevTools port 8892 on, so dev\cep.js 8892 ... and node dev\e2e\run.js --resolve work. Windows version of
# dev/resolve/link-dev.sh: the plugin folder's contents are junctions to this repository (js, css, assets, resolve,
# CSXS, dev), index.html is a symbolic link where Windows allows one (Developer Mode or an administrator) and a copy
# otherwise; main.js, preload.js, manifest.xml/package.json (version filled in) and WorkflowIntegration.node are copies.
# Undo with dev\win\unlink-dev-resolve.ps1. Run this again after changing index.html (if it was copied),
# resolve\plugin\* or the version. Resolve's plugin folder is in ProgramData: if it can't be written, run PowerShell
# as administrator.
# Usage: powershell -ExecutionPolicy Bypass -File dev\win\link-dev-resolve.ps1
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$id = 'com.jmgphotography.ultrastudio'
$bmd = Join-Path $env:ProgramData 'Blackmagic Design\DaVinci Resolve\Support'
$plugins = Join-Path $bmd 'Workflow Integration Plugins'
$dest = Join-Path $plugins $id
$wi = Join-Path $bmd 'Developer\Workflow Integrations\Examples\SamplePlugin\WorkflowIntegration.node'
$park = Join-Path $env:APPDATA 'JMG Ultra Studio dev\installed-resolve-copy'
$ver = [regex]::Match((Get-Content (Join-Path $root 'CSXS\manifest.xml') -Raw), 'ExtensionBundleVersion="([^"]+)"').Groups[1].Value

if (-not (Test-Path $wi)) { Write-Output "No WorkflowIntegration.node at $wi - is DaVinci Resolve Studio installed?"; exit 1 }
if (Get-Process -Name 'Resolve' -ErrorAction SilentlyContinue) { Write-Output 'Resolve is open: quit it first (it only reads plugins when it starts).'; exit 1 }
try { New-Item -ItemType Directory -Force $plugins | Out-Null; [IO.File]::WriteAllText((Join-Path $plugins '.ultra-studio-write-test'), 'ok'); Remove-Item (Join-Path $plugins '.ultra-studio-write-test') }
catch { Write-Output "Can't write to $plugins - run PowerShell as administrator and try again."; exit 1 }

function Remove-DevFolder($p) {
  # junctions and links are removed with .Delete() so what they point at is never touched
  Get-ChildItem $p -Force | ForEach-Object { if ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) { $_.Delete() } else { Remove-Item $_.FullName -Recurse -Force } }
  Remove-Item $p -Force
}
# park an installed copy OUTSIDE the plugins folder (two plugins with the same id confuse Resolve)
if ((Test-Path $dest) -and -not (Test-Path (Join-Path $dest '.ultra-studio-dev'))) {
  New-Item -ItemType Directory -Force (Split-Path $park) | Out-Null
  if (Test-Path $park) { Remove-Item $park -Recurse -Force }
  Move-Item $dest $park
  Write-Output "Parked the installed copy in $park"
}
if (Test-Path $dest) { Remove-DevFolder $dest }
New-Item -ItemType Directory -Force $dest | Out-Null
foreach ($d in 'js', 'css', 'assets', 'resolve', 'CSXS', 'dev') { New-Item -ItemType Junction -Path (Join-Path $dest $d) -Target (Join-Path $root $d) | Out-Null }
try { New-Item -ItemType SymbolicLink -Path (Join-Path $dest 'index.html') -Target (Join-Path $root 'index.html') | Out-Null }
catch { Copy-Item (Join-Path $root 'index.html') $dest; Write-Output 'index.html is a copy (symbolic links need Developer Mode): run this again after changing it.' }
Copy-Item (Join-Path $root 'resolve\plugin\main.js'), (Join-Path $root 'resolve\plugin\preload.js') $dest
foreach ($f in 'manifest.xml', 'package.json') {
  $text = (Get-Content (Join-Path $root "resolve\plugin\$f") -Raw) -replace '__VERSION__', $ver
  [IO.File]::WriteAllText((Join-Path $dest $f), $text)
}
Copy-Item $wi (Join-Path $dest 'WorkflowIntegration.node')
[IO.File]::WriteAllText((Join-Path $dest 'debug'), 'debug')            # opens the DevTools port 8892
[IO.File]::WriteAllText((Join-Path $dest '.ultra-studio-dev'), $root)  # marks this as the dev copy
Write-Output "Linked for development: $dest -> $root (version $ver, DevTools port 8892)."
Write-Output 'Restart Resolve, then Workspace > Workflow Integrations > JMG Ultra Studio. Use only the test project "JMG Ultra Studio Test".'
