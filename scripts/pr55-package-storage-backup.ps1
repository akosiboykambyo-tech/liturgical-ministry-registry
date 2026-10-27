# Offline package, check and encrypt the production Supabase Storage download.
# Never connects to production; all input and output remain in HOME/COWL-DOK-PRIVATE-BACKUPS.
[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
$root = Join-Path $HOME "COWL-DOK-PRIVATE-BACKUPS\storage-download-diagnostic"
$private = Join-Path $HOME "COWL-DOK-PRIVATE-BACKUPS"
$manifestFile = Join-Path $root "manifest-private.csv"
$expected = @(
    @{ Name = "certificate-templates"; Count = 35; Bytes = [long]36838287 }
    @{ Name = "member-documents"; Count = 119; Bytes = [long]256939642 }
)
if (-not (Test-Path -LiteralPath $manifestFile -PathType Leaf)) {
    throw "Private Storage manifest missing. No archive created."
}
$rows = @(Import-Csv -LiteralPath $manifestFile)
if ($rows.Count -ne 154) {
    throw "Manifest does not contain exactly 154 objects. No archive created."
}
$lookup = New-Object 'System.Collections.Generic.Dictionary[string,object]' ([StringComparer]::Ordinal)
$allFiles = New-Object 'System.Collections.Generic.List[object]'
foreach ($bucket in $expected) {
    $folder = Join-Path $root $bucket.Name
    if (-not (Test-Path -LiteralPath $folder -PathType Container)) {
        throw "Expected bucket folder missing. No archive created."
    }
    $files = @(Get-ChildItem -LiteralPath $folder -File -Recurse -Force)
    $bytes = [long](($files | Measure-Object -Property Length -Sum).Sum)
    if ($files.Count -ne $bucket.Count -or $bytes -ne $bucket.Bytes) {
        throw "Bucket file count or size does not match production baseline."
    }
    foreach ($file in $files) {
        if (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "Refusing file reparse point."
        }
        $relative = $file.FullName.Substring($folder.Length).TrimStart('\').Replace('\','/')
        $entryName = $bucket.Name + "/" + $relative
        $allFiles.Add([PSCustomObject]@{File=$file;Entry=$entryName})
    }
}
foreach ($row in $rows) {
    if ($row.Bucket -notin @("certificate-templates", "member-documents")) {
        throw "Manifest contains unknown bucket."
    }
    $normalized = ([string]$row.RelativePath).Replace('\','/')
    if ([string]::IsNullOrWhiteSpace($normalized) -or $normalized.StartsWith("/") -or $normalized.Split('/') -contains "..") {
        throw "Manifest contains unexpected relative path."
    }
    $entryName = $row.Bucket + "/" + $normalized
    if ($lookup.ContainsKey($entryName)) { throw "Duplicate manifest path." }
    if ([string]$row.SHA256 -notmatch '^[A-Fa-f0-9]{64}$') { throw "Invalid manifest SHA-256." }
    $lookup.Add($entryName,$row)
}
if ($lookup.Count -ne $allFiles.Count) {throw "Manifest and files have different counts."}
Write-Host "CHECK: Verifying 154 source files against local SHA256 manifest..."
foreach ($item in $allFiles) {
    if (-not $lookup.ContainsKey($item.Entry)) {throw "A file is missing from the manifest."}
    $row = $lookup[$item.Entry]
    if ([long]$row.Bytes -ne $item.File.Length) {throw "Manifest file length mismatch."}
    $actual = (Get-FileHash -LiteralPath $item.File.FullName -Algorithm SHA256).Hash
    if ($actual -ine $row.SHA256) {throw "Manifest file SHA-256 mismatch."}
}
Write-Host "PASS: All 154 local files match private manifest."

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipPath = Join-Path $private ("cowl-dok-storage-prod-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".zip")
if (Test-Path -LiteralPath $zipPath) {throw "ZIP destination already exists."}
$stream=$null
$archive=$null
$created=$false
try {
    $stream=[IO.File]::Open($zipPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
    $created=$true
    $archive=[IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create,$false)
    foreach ($item in $allFiles) {
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive,$item.File.FullName,$item.Entry,[IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
    }
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $archive,$manifestFile,"manifest-private.csv",[IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
    $archive.Dispose()
    $archive=$null
    $stream=$null
} catch {
    if ($archive) { $archive.Dispose() }
    elseif ($stream) { $stream.Dispose() }
    if ($created) {Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue}
    throw
}
# Reopen ZIP, decompress and hash every entry; do not extract plaintext onto disk.
$check=[IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    if ($check.Entries.Count -ne 155) {throw "ZIP entry count mismatch."}
    $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
    $total=[long]0
    foreach ($entry in $check.Entries) {
        if (-not $seen.Add($entry.FullName)) {throw "Duplicate ZIP entry."}
        if ($entry.FullName -eq "manifest-private.csv") {
            if ($entry.Length -ne (Get-Item -LiteralPath $manifestFile).Length) {
                throw "ZIP manifest length mismatch."
            }
            continue
        }
        if (-not $lookup.ContainsKey($entry.FullName)) {throw "Unexpected ZIP entry."}
        $row=$lookup[$entry.FullName]
        if ([long]$entry.Length -ne [long]$row.Bytes) {throw "ZIP entry length mismatch."}
        $inputStream=$entry.Open()
        $sha=[Security.Cryptography.SHA256]::Create()
        try {
            $actualHash=[BitConverter]::ToString($sha.ComputeHash($inputStream)).Replace("-","")
        } finally {
            $inputStream.Dispose()
            $sha.Dispose()
        }
        if ($actualHash -ine $row.SHA256) {throw "ZIP entry integrity mismatch."}
        $total += [long]$entry.Length
    }
    if ($total -ne 293777929 -or $seen.Count -ne 155) {
        throw "ZIP total or entries mismatch."
    }
} finally {
    $check.Dispose()
}
Write-Host "PASS: ZIP archive includes all 154 objects plus manifest; contents rehashed."
$zipHash=(Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash
Write-Host "ZIP BYTES: $((Get-Item -LiteralPath $zipPath).Length)"
Write-Host "ZIP SHA256: $zipHash"
Write-Host "CHECK: Offline encrypted archive protection..."
$scriptPath = Join-Path $PSScriptRoot "pr55-protect-storage-backup.cjs"
& node $scriptPath --self-test
if ($LASTEXITCODE -ne 0) {throw "Storage encryption self-test failed."}
$credential=Get-Credential -UserName "COWL-DOK-Storage-Backup" -Message "Enter a new independent 20+ character Storage backup encryption passphrase"
try {
    $env:PR55_STORAGE_ZIP=$zipPath
    $env:PR55_STORAGE_ZIP_SHA256=$zipHash
    $env:PR55_STORAGE_PASSPHRASE=$credential.GetNetworkCredential().Password
    & node $scriptPath --encrypt
    if ($LASTEXITCODE -ne 0) {throw "Storage backup encryption failed."}
    & node $scriptPath --verify
    if ($LASTEXITCODE -ne 0) {throw "Storage backup authentication check failed."}
} finally {
    Remove-Item Env:\PR55_STORAGE_ZIP,Env:\PR55_STORAGE_ZIP_SHA256,Env:\PR55_STORAGE_PASSPHRASE -ErrorAction SilentlyContinue
    Remove-Variable credential -ErrorAction SilentlyContinue
}
Write-Host "PASS: STORAGE BACKUP ZIP + ENCRYPTION + VERIFICATION COMPLETE."
Write-Host "ENCRYPTED FILE (PRIVATE): $($zipPath).enc"
Write-Host "KEEP original Storage files and ZIP until a separate encrypted backup copy and independent restore are proven."
