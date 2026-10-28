# Development only (Windows): saves the test project, quits Premiere, relaunches it on the test project and opens
# the JMG Ultra Studio panel. Needs the dev helper extension (port 8891, see dev\win\link-dev.ps1).
# Windows version of dev/restart-premiere.sh. Premiere is only ever stopped by its exact process id.
# Usage: powershell -ExecutionPolicy Bypass -File dev\win\restart-premiere.ps1 [-Project <path.prproj>]
param([string]$Project = (Join-Path $PSScriptRoot '..\test-project-win\UltraStudioTest-win.prproj'))
$dev = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$cep = Join-Path $dev 'cep.js'
$tmp = New-Item -ItemType Directory -Force (Join-Path $env:TEMP "jmg-restart-$PID")

function Get-Premiere { Get-Process -Name 'Adobe Premiere Pro' -ErrorAction SilentlyContinue }
function Test-Port($p) { [bool](Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue) }
function Invoke-Cep($port, $mode, $src, $timeout = 15000) {
  $f = Join-Path $tmp "cmd.$mode"; Set-Content -Path $f -Value $src -Encoding UTF8
  $env:CEP_TIMEOUT = $timeout; $r = & node $cep $port $mode $f 2>$null; Remove-Item Env:\CEP_TIMEOUT; return $r
}

$pp = @(Get-Premiere)
if ($pp.Count) {
  Invoke-Cep 8891 jsx '(function(){ try { if (app.project) app.project.save(); } catch (e) {} app.quit(); return "quitting"; })()' | Out-Null
  for ($i = 0; $i -lt 60 -and (Get-Premiere); $i++) { Start-Sleep 2 }
  if (Get-Premiere) {
    # no answer (the helper isn't loaded, or a dialog is up): stop the main program by its exact process id
    foreach ($p in $pp) { Stop-Process -Id $p.Id -ErrorAction SilentlyContinue }
    for ($i = 0; $i -lt 20 -and (Get-Premiere); $i++) { Start-Sleep 1 }
    foreach ($p in $pp) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
    Start-Sleep 2
  }
  if (Get-Premiere) { Write-Output 'Premiere did not quit'; exit 1 }
}
# the old panels can hold their debug ports for a moment; a new Premiere that finds them taken never opens them
for ($i = 0; $i -lt 30 -and ((Test-Port 8890) -or (Test-Port 8891)); $i++) { Start-Sleep 1 }

$exe = Get-ChildItem 'C:\Program Files\Adobe' -Directory -Filter 'Adobe Premiere Pro 20*' | Sort-Object Name -Descending |
  ForEach-Object { Join-Path $_.FullName 'Adobe Premiere Pro.exe' } | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $exe) { Write-Output 'Adobe Premiere Pro.exe not found under C:\Program Files\Adobe'; exit 1 }
if (Test-Path $Project) { Start-Process -FilePath $exe -ArgumentList "`"$((Resolve-Path $Project).Path)`"" } else { Start-Process -FilePath $exe }
for ($i = 0; $i -lt 90 -and -not (Test-Port 8891); $i++) { Start-Sleep 2 }
if (-not (Test-Port 8891)) { Write-Output 'The dev helper (port 8891) never started – is dev\win\link-dev.ps1 done?'; exit 1 }

if (Test-Path $Project) {
  # wait until the project is really open before opening the panel
  for ($i = 0; $i -lt 60; $i++) { $r = Invoke-Cep 8891 jsx '(function(){ return app.project && app.project.path ? "ready" : "wait"; })()' 5000; if ($r -eq 'ready') { break }; Start-Sleep 2 }
  Write-Output "project: $r"
}
Invoke-Cep 8891 js 'return window.openPanel();' | Out-Null
for ($i = 0; $i -lt 30; $i++) { if (Test-Port 8890) { Write-Output 'panel up'; Remove-Item $tmp -Recurse -Force; exit 0 }; Start-Sleep 1 }
Write-Output 'panel did not open'; exit 1
