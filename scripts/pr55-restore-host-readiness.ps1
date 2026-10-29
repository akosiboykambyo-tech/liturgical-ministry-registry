<#
PR55 disaster-recovery host preflight. READ-ONLY and OFFLINE.
Does NOT start servers, download files, connect to database, copy PII,
restore archives, create folders, change Windows features, or print secrets.
A PASS means prerequisites appear present; never means restore certified.
#>
[CmdletBinding()]
param(
 [string]$Postgres17Root = "C:\Program Files\PostgreSQL\17",
 [string]$ArchivePath = (Join-Path $HOME "COWL-DOK-PRIVATE-BACKUPS\cowl-dok-prod-2026-10-26T23-21-15-064Z-7e5251.backup")
)
$ErrorActionPreference="Stop"
$failures = New-Object System.Collections.Generic.List[string]
$bin=Join-Path $Postgres17Root "bin"
$share=Join-Path $Postgres17Root "share"
$required=@("postgres.exe","initdb.exe","pg_ctl.exe","pg_restore.exe","pg_dump.exe","psql.exe")
foreach($name in $required){
 if(-not (Test-Path -LiteralPath (Join-Path $bin $name) -PathType Leaf)){
  $failures.Add("PostgreSQL 17 tool missing: $name")
 }
}
foreach($name in @("postgres.bki","postgresql.conf.sample")){
 if(-not (Test-Path -LiteralPath (Join-Path $share $name) -PathType Leaf)){
  $failures.Add("PostgreSQL 17 bootstrap file missing: $name")
 }
}
foreach($name in @("supabase_vault.control","pg_stat_statements.control","pgcrypto.control","uuid-ossp.control")){
 if(-not (Test-Path -LiteralPath (Join-Path (Join-Path $share "extension") $name) -PathType Leaf)){
  $failures.Add("Extension control file missing: $name")
 }
}
if(Test-Path -LiteralPath (Join-Path $bin "postgres.exe") -PathType Leaf){
 $version = & (Join-Path $bin "postgres.exe") --version 2>$null
 if($LASTEXITCODE -ne 0 -or $version -notmatch 'PostgreSQL[)] 17[.]'){
  $failures.Add("PostgreSQL server binary is not major version 17")
 }
}
$expectedHash="1bcc80f8c672282649b82c552e6b366ce31f1772bb56e790d184cb5292d1a992"
if(-not (Test-Path -LiteralPath $ArchivePath -PathType Leaf)){
 $failures.Add("Original archived production snapshot not present at private path")
}else{
 $file=Get-Item -LiteralPath $ArchivePath
 if($file.Length -ne 18156510){$failures.Add("Original backup archive length mismatch")}
 else{
  $actual=(Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash
  if($actual -ine $expectedHash){$failures.Add("Original backup archive SHA256 mismatch")}
 }
}
Write-Host "CHECK: PostgreSQL major version 17 and Supabase extension controls"
Write-Host "CHECK: Original encrypted-backup source archive hash (offline only)"
Write-Host "LIMIT: Original October 26 archive predates subsequent production reset/new entries"
Write-Host "LIMIT: No database or Auth/Storage restore has been performed by this preflight"
Write-Host "LIMIT: Windows WSL/Docker capacity and full service/role/secret compatibility still require approved host"
if($failures.Count -eq 0){
 Write-Host "PASS: listed local file prerequisites; restore is STILL NOT CERTIFIED"
 exit 0
}
foreach($f in $failures){Write-Host "BLOCKED: $f"}
Write-Host "NO-GO: full restore must use a separately approved isolated, secure compatible host"
exit 2
