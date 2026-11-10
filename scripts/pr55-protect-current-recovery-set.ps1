# Local-only recovery protection for the operator's already-downloaded 2026-10-30 snapshot.
# This script NEVER connects to production, Supabase, rclone, Vercel, or GitHub.
# It verifies DB archive encryption; validates 37 downloaded objects against their
# existing private manifest; creates and verifies a Storage ZIP; encrypts and
# authenticates it; and creates SHA256-confirmed encrypted copies on Drive D:.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$DatabaseArchive,
  [Parameter(Mandatory=$true)][string]$ExpectedDatabaseSha256,
  [Parameter(Mandatory=$true)][string]$StorageDirectory,
  [string]$SecondCopyRoot = 'D:\COWL-DOK-PRIVATE-BACKUPS'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$privateRoot = [IO.Path]::GetFullPath((Join-Path $HOME 'COWL-DOK-PRIVATE-BACKUPS'))
$db = [IO.Path]::GetFullPath($DatabaseArchive)
$storage = [IO.Path]::GetFullPath($StorageDirectory)
$secondRoot = [IO.Path]::GetFullPath($SecondCopyRoot)
$expectedHash = $ExpectedDatabaseSha256.ToLowerInvariant()
$sourceManifest = Join-Path $storage 'manifest-private.csv'
$storageZip = $null
$createdZip = $false
$storageArchiveHash = $null
$zipEncrypted = $null
$success = $false

function Assert-True([bool]$condition, [string]$message) {
  if (-not $condition) { throw "NO-GO: $message" }
}
function File-Hash([string]$path) {
  return (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
}
function Secure-Passphrase([string]$message) {
  $cred = Get-Credential -UserName 'COWL-DOK-Backup' -Message $message
  if ($null -eq $cred) { throw 'NO-GO: passphrase entry cancelled' }
  return $cred
}
function Check-Exit([string]$label) {
  if ($LASTEXITCODE -ne 0) { throw "NO-GO: $label (exit $LASTEXITCODE)" }
}
function Copy-And-Verify([string]$src,[string]$target) {
  Assert-True (-not (Test-Path -LiteralPath $target)) 'second-copy destination already exists; refusing overwrite'
  Copy-Item -LiteralPath $src -Destination $target -ErrorAction Stop
  $sourceHash = File-Hash $src
  Assert-True ((File-Hash $target) -eq $sourceHash) 'encrypted second-copy checksum mismatch'
}

try {
  Assert-True ($expectedHash -match '^[0-9a-f]{64}$') 'expected database checksum must be SHA-256'
  Assert-True ((Split-Path -Parent $db) -ieq $privateRoot) 'database archive must be in the private backup directory'
  Assert-True ((Split-Path -Parent $storage) -ieq $privateRoot) 'Storage directory must be within the private backup root'
  Assert-True ((Split-Path -Leaf $db) -match '^cowl-dok-prod-\d{4}-\d{2}-\d{2}T[\w-]+\.backup$') 'unexpected database archive name'
  Assert-True ((Split-Path -Leaf $storage) -match '^storage-prod-\d{8}-\d{6}$') 'unexpected Storage directory name'
  Assert-True (Test-Path -LiteralPath $db -PathType Leaf) 'original database backup missing'
  Assert-True (Test-Path -LiteralPath "$db.enc" -PathType Leaf) 'encrypted database backup missing'
  Assert-True (Test-Path -LiteralPath $sourceManifest -PathType Leaf) 'private Storage manifest missing'
  Assert-True (Test-Path -LiteralPath (Join-Path $storage 'certificate-templates') -PathType Container) 'certificate-templates folder missing'
  Assert-True (Test-Path -LiteralPath (Join-Path $storage 'member-documents') -PathType Container) 'member-documents folder missing'
  Assert-True ((File-Hash $db) -eq $expectedHash) 'original database backup checksum mismatch'
  Assert-True (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'pr55-protect-local-backup.cjs')) 'existing DB encryption utility missing'
  Assert-True (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'pr55-protect-storage-backup.cjs')) 'existing Storage encryption utility missing'
  Write-Host 'PASS: original production archive checksum matched'

  # First verify the previously created encrypted DB archive by authenticated decryption.
  $dbCred = Secure-Passphrase 'Enter your EXISTING database-backup encryption passphrase'
  try {
    $env:PR55_BACKUP_FILE = $db
    $env:PR55_BACKUP_EXPECTED_SHA256 = $expectedHash
    $env:PR55_BACKUP_ENCRYPTION_PASSPHRASE = $dbCred.GetNetworkCredential().Password
    & node (Join-Path $PSScriptRoot 'pr55-protect-local-backup.cjs') --verify
    Check-Exit 'database encrypted backup verification failed'
    Write-Host 'PASS: database encrypted archive authenticated and verified'
  } finally {
    Remove-Item Env:\PR55_BACKUP_FILE -ErrorAction SilentlyContinue
    Remove-Item Env:\PR55_BACKUP_EXPECTED_SHA256 -ErrorAction SilentlyContinue
    Remove-Item Env:\PR55_BACKUP_ENCRYPTION_PASSPHRASE -ErrorAction SilentlyContinue
    Remove-Variable dbCred -ErrorAction SilentlyContinue
  }

  # Verify every source file against the private SHA-256 manifest, not just counts.
  $entries = @(Import-Csv -LiteralPath $sourceManifest)
  Assert-True ($entries.Count -eq 37) 'manifest must have exactly 37 records'
  $expectedByPath = @{}
  $counts = @{ 'certificate-templates' = 0; 'member-documents' = 0 }
  $bytes = @{ 'certificate-templates' = [long]0; 'member-documents' = [long]0 }
  foreach ($entry in $entries) {
    $relative = [string]$entry.RelativePath
    $normalized = $relative.Replace('/','\')
    Assert-True ($normalized -match '^(certificate-templates|member-documents)\\[^\\].+$') 'manifest contains an unexpected relative path'
    Assert-True (-not $normalized.Contains('..\')) 'manifest contains path traversal'
    Assert-True (-not $expectedByPath.ContainsKey($normalized.ToLowerInvariant())) 'manifest contains a duplicate path'
    Assert-True (([string]$entry.SHA256) -match '^[a-fA-F0-9]{64}$') 'manifest contains an invalid checksum'
    $file = [IO.Path]::GetFullPath((Join-Path $storage $normalized))
    Assert-True ($file.StartsWith($storage + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) 'manifest path escapes source folder'
    Assert-True (Test-Path -LiteralPath $file -PathType Leaf) 'a manifest file is missing'
    Assert-True ((Get-Item -LiteralPath $file).Length -eq [long]$entry.Bytes) 'manifest byte count mismatch'
    Assert-True ((File-Hash $file) -eq ([string]$entry.SHA256).ToLowerInvariant()) 'manifest file SHA-256 mismatch'
    $bucket = $normalized.Substring(0, $normalized.IndexOf('\'))
    $counts[$bucket]++
    $bytes[$bucket] += [long]$entry.Bytes
    $expectedByPath[$normalized.ToLowerInvariant()] = ([string]$entry.SHA256).ToLowerInvariant()
  }
  $actualFiles = @(Get-ChildItem -LiteralPath $storage -File -Recurse -Force | Where-Object { $_.FullName -ne $sourceManifest })
  Assert-True ($actualFiles.Count -eq 37) 'source folder contains extra files beyond the manifest'
  Assert-True ($counts['certificate-templates'] -eq 36 -and $bytes['certificate-templates'] -eq 36863212) 'certificate-template inventory changed'
  Assert-True ($counts['member-documents'] -eq 1 -and $bytes['member-documents'] -eq 171973) 'member-document inventory changed'
  Write-Host 'PASS: 37 local Storage files individually matched their private SHA-256 manifest'

  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $storageZip = Join-Path $privateRoot "cowl-dok-storage-prod-$stamp.zip"
  Assert-True (-not (Test-Path -LiteralPath $storageZip)) 'Storage ZIP already exists'
  Assert-True (-not (Test-Path -LiteralPath "$storageZip.enc")) 'encrypted Storage ZIP already exists'
  [IO.Compression.ZipFile]::CreateFromDirectory($storage, $storageZip, [IO.Compression.CompressionLevel]::Optimal, $false)
  $createdZip = $true
  $archive = [IO.Compression.ZipFile]::OpenRead($storageZip)
  try {
    $seen = @{}
    $zipCount = 0
    $manifestInside = $false
    foreach ($item in $archive.Entries) {
      if ([string]::IsNullOrEmpty($item.Name)) { continue }
      $key = $item.FullName.Replace('/','\').ToLowerInvariant()
      if ($key -eq 'manifest-private.csv') {
        Assert-True (-not $manifestInside) 'ZIP contains duplicate manifest entries'
        $manifestStream = $item.Open()
        $manifestDigest = [Security.Cryptography.SHA256]::Create()
        try {
          $manifestHash = [BitConverter]::ToString($manifestDigest.ComputeHash($manifestStream)).Replace('-','').ToLowerInvariant()
        } finally { $manifestStream.Dispose(); $manifestDigest.Dispose() }
        Assert-True ($manifestHash -eq (File-Hash $sourceManifest)) 'ZIP manifest checksum mismatch'
        $manifestInside = $true
        continue
      }
      Assert-True ($expectedByPath.ContainsKey($key)) 'ZIP contains an unexpected file'
      Assert-True (-not $seen.ContainsKey($key)) 'ZIP contains a duplicate file'
      $stream = $item.Open()
      $algorithm = [Security.Cryptography.SHA256]::Create()
      try {
        $digest = [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-','').ToLowerInvariant()
      } finally { $stream.Dispose(); $algorithm.Dispose() }
      Assert-True ($digest -eq $expectedByPath[$key]) 'ZIP extraction hash mismatch'
      $seen[$key] = $true
      $zipCount++
    }
    Assert-True ($zipCount -eq 37 -and $manifestInside) 'ZIP does not include exactly 37 files plus private manifest'
  } finally { $archive.Dispose() }
  $storageArchiveHash = File-Hash $storageZip
  Write-Host 'PASS: Storage ZIP contains 37 hash-verified objects and the private manifest'

  $storageCred = Secure-Passphrase 'Enter a NEW 20+ character Storage-backup encryption passphrase'
  try {
    Assert-True ($storageCred.GetNetworkCredential().Password.Length -ge 20) 'Storage passphrase must contain at least 20 characters'
    $env:PR55_STORAGE_ZIP = $storageZip
    $env:PR55_STORAGE_ZIP_SHA256 = $storageArchiveHash
    $env:PR55_STORAGE_PASSPHRASE = $storageCred.GetNetworkCredential().Password
    & node (Join-Path $PSScriptRoot 'pr55-protect-storage-backup.cjs') --encrypt
    Check-Exit 'Storage archive encryption failed'
    $env:PR55_STORAGE_PASSPHRASE = $storageCred.GetNetworkCredential().Password
    & node (Join-Path $PSScriptRoot 'pr55-protect-storage-backup.cjs') --verify
    Check-Exit 'Storage encrypted archive verification failed'
    Write-Host 'PASS: Storage encrypted archive authenticated and verified'
  } finally {
    Remove-Item Env:\PR55_STORAGE_ZIP -ErrorAction SilentlyContinue
    Remove-Item Env:\PR55_STORAGE_ZIP_SHA256 -ErrorAction SilentlyContinue
    Remove-Item Env:\PR55_STORAGE_PASSPHRASE -ErrorAction SilentlyContinue
    Remove-Variable storageCred -ErrorAction SilentlyContinue
  }

  # Second encrypted copies on D: provide local redundancy; NOT offsite independence.
  Assert-True ($secondRoot.StartsWith('D:\', [StringComparison]::OrdinalIgnoreCase)) 'second local copy must be on Drive D:'
  if (-not (Test-Path -LiteralPath $secondRoot)) {
    New-Item -Path $secondRoot -ItemType Directory -ErrorAction Stop | Out-Null
  }
  $targetDir = Join-Path $secondRoot ("protected-set-" + $stamp)
  Assert-True (-not (Test-Path -LiteralPath $targetDir)) 'target backup directory already exists'
  New-Item -Path $targetDir -ItemType Directory -ErrorAction Stop | Out-Null
  Copy-And-Verify "$db.enc" (Join-Path $targetDir ((Split-Path -Leaf $db) + '.enc'))
  Copy-And-Verify "$storageZip.enc" (Join-Path $targetDir ((Split-Path -Leaf $storageZip) + '.enc'))
  Write-Host 'PASS: second LOCAL encrypted copies on D: matched SHA-256 checksums'
  Write-Host 'LIMIT: D: copy is on the same PC, not an independent/offsite disaster-recovery copy'
  Write-Host 'LIMIT: Supabase Auth service, role/ACL parity and live Storage restore remain untested'
  Write-Host 'LIMIT: plaintext Storage ZIP and original downloaded folder remain; do not delete until recovery is independently validated'
  $success = $true
} finally {
  Remove-Item Env:\PR55_BACKUP_FILE,Env:\PR55_BACKUP_EXPECTED_SHA256,Env:\PR55_BACKUP_ENCRYPTION_PASSPHRASE -ErrorAction SilentlyContinue
  Remove-Item Env:\PR55_STORAGE_ZIP,Env:\PR55_STORAGE_ZIP_SHA256,Env:\PR55_STORAGE_PASSPHRASE -ErrorAction SilentlyContinue
  if (-not $success) { Write-Warning 'NO-GO: backup protection is incomplete. Do not delete any existing backup, copy, or ZIP.' }
}
