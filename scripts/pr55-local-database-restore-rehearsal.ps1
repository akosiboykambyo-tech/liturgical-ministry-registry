<#
Offline local-only PostgreSQL 18 restore rehearsal for PR55.
-Preflight: validates known archive/tools. -Run: creates NEW disposable isolated cluster.
Never connects to production or staging. Not a complete Supabase service restore.
#>
[CmdletBinding()]
param([switch]$Preflight,[switch]$Run)
$ErrorActionPreference="Stop"
if (([int]$Preflight.IsPresent+[int]$Run.IsPresent) -ne 1) {
    throw "Use exactly one of -Preflight or -Run."
}
$bin="C:\Program Files\PostgreSQL\18\bin"
foreach($name in @("pg_restore","pg_dump","psql","postgres","initdb","pg_ctl")){
    if(-not (Test-Path -LiteralPath (Join-Path $bin "$name.exe") -PathType Leaf)){
        throw "Missing local PostgreSQL 18 executable: $name"
    }
}
# initdb requires server-side catalog bootstrap files in the install's share tree.
# A copied bin directory with working pg_dump/pg_restore is NOT a usable server.
$pgRoot=Split-Path -Parent $bin
$shareDir=Join-Path $pgRoot "share"
$bootstrap=Join-Path $shareDir "postgres.bki"
$sampleConfig=Join-Path $shareDir "postgresql.conf.sample"
if(-not (Test-Path -LiteralPath $bootstrap -PathType Leaf)){
    throw "LOCAL INSTALLATION INCOMPLETE: PostgreSQL 18 share/postgres.bki missing; initdb cannot run. Reinstall complete PostgreSQL 18 server or restore its matching share directory. No restore attempted."
}
if(-not (Test-Path -LiteralPath $sampleConfig -PathType Leaf)){
    throw "LOCAL INSTALLATION INCOMPLETE: PostgreSQL 18 share/postgresql.conf.sample missing. No restore attempted."
}
$private=Join-Path $HOME "COWL-DOK-PRIVATE-BACKUPS"
$archive=Join-Path $private "cowl-dok-prod-2026-10-26T23-21-15-064Z-7e5251.backup"
$expectedHash="1bcc80f8c672282649b82c552e6b366ce31f1772bb56e790d184cb5292d1a992"
$info=Get-Item -LiteralPath $archive -ErrorAction Stop
if($info.PSIsContainer -or $info.Length -ne 18156510){throw "Original private backup absent or unexpected size."}
if((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ine $expectedHash){
    throw "Original backup SHA-256 mismatch."
}
$pgRestore=Join-Path $bin "pg_restore.exe"
$catalog=& $pgRestore --list $archive 2>$null
if($LASTEXITCODE -ne 0){throw "Backup archive catalog cannot be read."}
foreach($item in @("TABLE DATA public members","TABLE DATA public member_ministries","TABLE DATA auth users","TABLE DATA storage buckets","TABLE DATA storage objects")){
    if(-not ($catalog -match [regex]::Escape($item))){throw "Missing expected archive catalog section."}
}
$drive=[IO.DriveInfo]::new([IO.Path]::GetPathRoot($archive))
if($drive.AvailableFreeSpace -lt 2GB){throw "At least 2 GiB local disk space required."}
Write-Host "PASS: PostgreSQL 18 binaries present."
Write-Host "PASS: Original PostgreSQL archive SHA256 and required catalog entries verified."
Write-Host "PASS: At least 2 GiB free for disposable restore."
if($Preflight){
    Write-Host "PASS: LOCAL RESTORE PREFLIGHT COMPLETE; no database connection or writes made."
    exit 0
}
$workspaceRoot=Join-Path $private "PR55-LOCAL-RESTORE-REHEARSALS"
New-Item -ItemType Directory -Path $workspaceRoot -Force | Out-Null
$trial="trial-"+(Get-Date -Format "yyyyMMdd-HHmmss")+"-"+([guid]::NewGuid().ToString("N").Substring(0,8))
$work=Join-Path $workspaceRoot $trial
if(Test-Path -LiteralPath $work){throw "Unexpected trial workspace collision."}
New-Item -ItemType Directory -Path $work | Out-Null
$data=Join-Path $work "data"
$passFile=Join-Path $work "initdb-password.tmp"
$initLog=Join-Path $work "initdb-private.log"
$controlLog=Join-Path $work "pgctl-private.log"
$serverLog=Join-Path $work "postgres-private.log"
$restoreLog=Join-Path $work "pg-restore-private.log"
$restoreUser="pr55_local_restore"
$dbName="pr55_restore_rehearsal"
$listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Parse("127.0.0.1"),0)
$listener.Start()
$port=[int]$listener.LocalEndpoint.Port
$listener.Stop()
if($port -le 1024 -or $port -eq 5432 -or $port -eq 6543){throw "Unexpected local test port."}
$rng=[Security.Cryptography.RandomNumberGenerator]::Create()
$random=New-Object byte[] 32
try{$rng.GetBytes($random)}finally{$rng.Dispose()}
$password=[Convert]::ToBase64String($random)
[Array]::Clear($random,0,$random.Length)
Set-Content -LiteralPath $passFile -Value $password -Encoding ASCII -NoNewline
foreach($key in @("PGHOSTADDR","PGSERVICE","PGSERVICEFILE","PGOPTIONS","PGPASSFILE","PGTARGETSESSIONATTRS")){
    Remove-Item "Env:\$key" -ErrorAction SilentlyContinue
}
$env:PGHOST="127.0.0.1"
$env:PGPORT=[string]$port
$env:PGUSER=$restoreUser
$env:PGPASSWORD=$password
$env:PGSSLMODE="disable"
$env:PGCONNECT_TIMEOUT="5"
# Windows PowerShell 5.1 promotes native stderr to ErrorRecord. Capture it in
# private logs without aborting before checking the process exit code.
function Invoke-RehearsalCommand {
    param([string]$Exe,[string[]]$Arguments,[string]$Log)
    $previous=$ErrorActionPreference
    try {
        $ErrorActionPreference="Continue"
        & $Exe @Arguments *> $Log
        return [int]$LASTEXITCODE
    } finally {
        $ErrorActionPreference=$previous
    }
}
$started=$false
$stopped=$false
$restored=$false
try{
    Write-Host "CHECK: Initializing new disposable local PostgreSQL cluster..."
    $initExit=Invoke-RehearsalCommand -Exe (Join-Path $bin "initdb.exe") -Arguments @("-D",$data,"-U",$restoreUser,"--auth-host=scram-sha-256","--auth-local=scram-sha-256","--pwfile=$passFile","--encoding=UTF8","--no-instructions") -Log $initLog
    if($initExit -ne 0){throw "Local initdb failed; no restore attempted (private log retained)."}
    Remove-Item -LiteralPath $passFile -Force -ErrorAction SilentlyContinue
    Add-Content -LiteralPath (Join-Path $data "postgresql.conf") -Value @(
        "# COWL-DOK PR55 disposable loopback-only test"
        "listen_addresses = '127.0.0.1'"
        "port = $port"
        "password_encryption = 'scram-sha-256'"
        "max_connections = 12"
    )
    Write-Host "CHECK: Starting new local loopback-only PostgreSQL instance..."
    # pg_ctl starts a long-lived postgres child. Capturing the pg_ctl stdout
    # through PowerShell's *> pipeline can wait forever for the inherited pipe
    # to close although the server has already become ready. Let pg_ctl write
    # short status lines directly to console; -l keeps server logs PRIVATE.
    $oldPreference=$ErrorActionPreference
    try {
        $ErrorActionPreference="Continue"
        & (Join-Path $bin "pg_ctl.exe") -D $data -l $serverLog -w start
        $startExit=[int]$LASTEXITCODE
    } finally {
        $ErrorActionPreference=$oldPreference
    }
    if($startExit -ne 0){throw "Local PostgreSQL failed to start (private server log retained)."}
    $started=$true
    $psql=Join-Path $bin "psql.exe"
    $createdExit=Invoke-RehearsalCommand -Exe $psql -Arguments @("--host=127.0.0.1","--port=$port","--username=$restoreUser","--dbname=postgres","--no-password","-X","-q","-v","ON_ERROR_STOP=1","--command=CREATE DATABASE pr55_restore_rehearsal WITH TEMPLATE template0 ENCODING 'UTF8';") -Log (Join-Path $work "create-db-private.log")
    if($createdExit -ne 0){throw "Local disposable database creation failed."}
    Write-Host "CHECK: Restoring full archive into NEW LOCAL database; no external endpoint..."
    $restoreExit=Invoke-RehearsalCommand -Exe $pgRestore -Arguments @("--host=127.0.0.1","--port=$port","--username=$restoreUser","--dbname=$dbName","--no-password","--no-owner","--no-privileges","--single-transaction","--exit-on-error",$archive) -Log $restoreLog
    if($restoreExit -ne 0){
        Write-Host "BLOCKED: Full restore encountered missing local prerequisites or incompatible SQL."
        Write-Host "LIMIT: PostgreSQL restore is NOT certified; private log retained for diagnosis."
        throw "pg_restore returned nonzero status. Do not skip errors or rerun blindly."
    }
    foreach($check in @(
        @{Name="public.members";Query="select count(*) from public.members";Expected=7971}
        @{Name="public.member_ministries";Query="select count(*) from public.member_ministries";Expected=8009}
        @{Name="auth.users";Query="select count(*) from auth.users";Expected=1}
        @{Name="storage.buckets";Query="select count(*) from storage.buckets";Expected=2}
        @{Name="storage.objects";Query="select count(*) from storage.objects";Expected=154}
    )){
        $result=& $psql "--host=127.0.0.1" "--port=$port" "--username=$restoreUser" "--dbname=$dbName" --no-password -X -t -A -v ON_ERROR_STOP=1 "--command=$($check.Query)" 2>$null
        if($LASTEXITCODE -ne 0 -or "$result".Trim() -ne [string]$check.Expected){
            throw "Local restored row count mismatch for $($check.Name)."
        }
        Write-Host "PASS: Local $($check.Name) rows $($check.Expected)"
    }
    $restored=$true
    Write-Host "PASS: LOCAL DATABASE-ONLY RESTORE AND BASELINE COUNTS."
    Write-Host "LIMIT: Auth service, Storage file serving, global roles/permissions and application recovery NOT proven."
}catch{
    Write-Host "FAIL: Local database-only rehearsal remains incomplete; no production/staging changes made."
    throw
}finally{
    # A startup error may still have started the server in the background.
    # Only examine the disposable, uniquely-created data directory.
    if(-not $started -and (Test-Path -LiteralPath (Join-Path $data "postmaster.pid") -PathType Leaf)){
        $started=$true
    }
    if($started){
        $oldPreference=$ErrorActionPreference
        try {
            $ErrorActionPreference="Continue"
            & (Join-Path $bin "pg_ctl.exe") -D $data -m fast -w stop
            $stopExit=[int]$LASTEXITCODE
        } finally {
            $ErrorActionPreference=$oldPreference
        }
        if($stopExit -eq 0){
            $stopped=$true
            Write-Host "PASS: Disposable local PostgreSQL server stopped."
        }else{
            Write-Host "WARNING: Local trial server shutdown not confirmed. Do not delete its data directory."
        }
    }
    Remove-Item -LiteralPath $passFile -Force -ErrorAction SilentlyContinue
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    $password=$null
    if($stopped -and (Test-Path -LiteralPath $data -PathType Container)){
        Remove-Item -LiteralPath $data -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "CHECK: Disposable trial data directory cleanup requested."
    }
    if(-not $restored){Write-Host "PRIVATE DIAGNOSTIC DIRECTORY: $work"}
}
