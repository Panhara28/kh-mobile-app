# Runs the read-only phone tests in order. See e2e/README.md. Needs APP_ID, LINK_BASE, KH_USER, KH_PASS in the environment.
. "$PSScriptRoot\env.ps1"
foreach ($v in 'APP_ID', 'LINK_BASE', 'KH_USER', 'KH_PASS') {
  if (-not (Get-Item "env:$v" -ErrorAction SilentlyContinue)) { Write-Error "Set `$env:$v first (see e2e/README.md)"; exit 2 }
}
$devices = (adb devices | Select-String "device$").Count
if ($devices -lt 1) { Write-Error "No phone found. Plug it in with USB debugging on, then run 'adb devices'."; exit 2 }
$out = Join-Path $PSScriptRoot "out"
New-Item -ItemType Directory -Force $out | Out-Null
maestro test --format junit --output "$out\report.xml" --test-output-dir $out `
  -e APP_ID=$env:APP_ID -e LINK_BASE=$env:LINK_BASE -e KH_USER=$env:KH_USER -e KH_PASS=$env:KH_PASS `
  "$PSScriptRoot\flows\00-login.yaml" "$PSScriptRoot\flows\10-sync-saved.yaml" "$PSScriptRoot\flows\20-offline-modules.yaml"
exit $LASTEXITCODE
