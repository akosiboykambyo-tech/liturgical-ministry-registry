# Read-only proof of the private encrypted second-copy backup set on Drive D:.
# Runs locally on Windows; no production, internet, Docker, or secret-bearing files written.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$setRoot = 'D:\COWL-DOK-PRIVATE-BACKUPS'
if (-not (Test-Path -LiteralPath $setRoot -PathType Container)) {
    throw 'NO-GO: private backup copy directory on Drive D: missing'
}
$sets = @(Get-ChildItem -LiteralPath $setRoot -Directory -Filter 'protected-set-*')
if ($sets.Count -ne 1) {
    throw 'NO-GO: expected exactly one protected-set directory; multiple copies require review'
}
$credentialsDb = $null
$credentialsStorage = $null
try {
    $credentialsDb = Get-Credential -UserName 'COWL-DOK-Backup' -Message 'Enter the EXISTING database-backup encryption passphrase'
    if ($null -eq $credentialsDb) { throw 'NO-GO: database passphrase entry cancelled' }
    $credentialsStorage = Get-Credential -UserName 'COWL-DOK-Storage' -Message 'Enter the EXISTING Storage-backup encryption passphrase'
    if ($null -eq $credentialsStorage) { throw 'NO-GO: Storage passphrase entry cancelled' }
    $env:PR55_RECOVERY_COPY_DIR = $sets[0].FullName
    $env:PR55_RECOVERY_DB_PASSPHRASE = $credentialsDb.GetNetworkCredential().Password
    $env:PR55_RECOVERY_STORAGE_PASSPHRASE = $credentialsStorage.GetNetworkCredential().Password
    & node (Join-Path $PSScriptRoot 'pr55-verify-encrypted-recovery-copy.cjs')
    if ($LASTEXITCODE -ne 0) { throw 'NO-GO: encrypted-copy proof failed' }
} finally {
    Remove-Item Env:\PR55_RECOVERY_COPY_DIR -ErrorAction SilentlyContinue
    Remove-Item Env:\PR55_RECOVERY_DB_PASSPHRASE -ErrorAction SilentlyContinue
    Remove-Item Env:\PR55_RECOVERY_STORAGE_PASSPHRASE -ErrorAction SilentlyContinue
    Remove-Variable credentialsDb,credentialsStorage -ErrorAction SilentlyContinue
}
