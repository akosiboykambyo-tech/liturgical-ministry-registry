#requires -Version 5.1
# PR55: ONE-COMMAND local read-only STAGING HTTP/JWT authorization test.
# Credentials are entered privately and exist only in this PowerShell process.
# Never run with PRODUCTION Auth accounts. Nothing is printed except PASS/FAIL/LIMIT.
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Runner = Join-Path $Root 'scripts\pr55-staging-nonadmin-readonly-http.cjs'
$vars = @(
  'PR55_STAGING_PUBLISHABLE_KEY',
  'PR55_STAGING_AUTH_EMAIL',
  'PR55_STAGING_AUTH_PASSWORD',
  'PR55_STAGING_NONADMIN_AUTH_EMAIL',
  'PR55_STAGING_NONADMIN_AUTH_PASSWORD',
  'PR55_ALLOW_NEGATIVE_HTTP'
)
try {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js is unavailable. Install Node.js first.'
  }
  if (-not (Test-Path -LiteralPath $Runner -PathType Leaf)) {
    throw 'Expected PR55 read-only test script is missing. Update the PR55 checkout.'
  }
  if (-not $env:PR55_STAGING_PUBLISHABLE_KEY) {
    $env:PR55_STAGING_PUBLISHABLE_KEY = Read-Host 'Enter the STAGING publishable key (sb_publishable_...)'
  }
  if (-not $env:PR55_STAGING_AUTH_EMAIL -or -not $env:PR55_STAGING_AUTH_PASSWORD) {
    $admin = Get-Credential -Message 'Supabase TEST project: STAGING administrator Auth credentials ONLY'
    if ($null -eq $admin) { throw 'Staging administrator credentials were not entered.' }
    $env:PR55_STAGING_AUTH_EMAIL = $admin.UserName
    $env:PR55_STAGING_AUTH_PASSWORD = $admin.GetNetworkCredential().Password
  }
  if (-not $env:PR55_STAGING_NONADMIN_AUTH_EMAIL -or -not $env:PR55_STAGING_NONADMIN_AUTH_PASSWORD) {
    $guest = Get-Credential -Message 'Supabase TEST project: separate NON-ADMIN Auth credentials ONLY'
    if ($null -eq $guest) { throw 'Staging non-administrator credentials were not entered.' }
    $env:PR55_STAGING_NONADMIN_AUTH_EMAIL = $guest.UserName
    $env:PR55_STAGING_NONADMIN_AUTH_PASSWORD = $guest.GetNetworkCredential().Password
  }
  $env:PR55_ALLOW_NEGATIVE_HTTP = 'I_ACCEPT_READONLY_STAGING_REAL_JWT'
  & node $Runner --validate-config
  if ($LASTEXITCODE -ne 0) { throw 'STAGING read-only JWT configuration rejected; no HTTP requests made.' }
  & node $Runner --run
  if ($LASTEXITCODE -ne 0) { throw 'STAGING read-only JWT test failed. Review PASS/FAIL output; no credentials should be sent in chat.' }
  Write-Output 'PASS: real staging non-administrator HTTP/JWT test completed.'
} catch {
  Write-Error ('NO-GO: ' + $_.Exception.Message)
  exit 1
} finally {
  foreach ($name in $vars) {
    Remove-Item -Path ('Env:' + $name) -ErrorAction SilentlyContinue
  }
  Remove-Variable admin,guest -ErrorAction SilentlyContinue
}
