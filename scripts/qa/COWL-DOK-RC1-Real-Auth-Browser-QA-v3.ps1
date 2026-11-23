# COWL-DOK RC1 — REAL TEST Auth, PostgREST, local Chromium acceptance
# Runs PR #93 exact commit in a detached worktree. NEVER targets Production.
# Auth sign-ins update TEST session/lockout metadata; NO Registry CRUD is performed.
# No TEST passwords/keys are written to the report or the repository.
# Need Node 22+, npm, git, working Internet, and access to TEST API keys.
# PowerShell 5.1+; ordinary user account; no Docker reset/migration.
# SmokeOnly: credential-free Windows CI checks same Next.js launch + Chromium before live QA.
[CmdletBinding()]
param([string]$RepoPath = (Join-Path $env:USERPROFILE 'Documents\LiteLLM\liturgical-ministry-registry'), [switch]$SmokeOnly)

& {
    $ErrorActionPreference = 'Stop'
    $expectedSha = '09f65a72993c7d59c421f03e9b6ba01759c65f58'
    $testUrl = 'https://rtptybxugjhvpfjvcvgw.supabase.co'
    $stage = 'PREFLIGHT'
    $runId = [guid]::NewGuid().ToString('N').Substring(0,12)
    $tempRoot = Join-Path $env:TEMP ('cowl-dok-rc1-live-qa-' + $runId)
    $worktree = Join-Path $tempRoot 'source'
    $tools = Join-Path $tempRoot 'browser-tools'
    $scriptFile = Join-Path $tempRoot 'qa.cjs'
    $outDir = Join-Path $env:USERPROFILE 'Documents\COWL-DOK-RC1-Acceptance'
    $reportFile = Join-Path $outDir ('COWL-DOK-RC1-LIVE-TEST-QA-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')
    $serverOut = Join-Path $tempRoot 'next-stdout.txt'
    $serverErr = Join-Path $tempRoot 'next-stderr.txt'
    $server = $null
    $worktreeMade = $false
    $exitCode = 1
    $names = @(
      'NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY','ADMIN_LOCKOUT_HMAC_SECRET',
      'COWL_QA_SUPABASE_URL','COWL_QA_APP_URL','COWL_QA_WORKTREE',
      'COWL_QA_REPORT','COWL_QA_ANON_KEY', 'COWL_QA_COMMIT',
      'COWL_QA_REGISTRY_EMAIL','COWL_QA_REGISTRY_PASSWORD',
      'COWL_QA_PLAYWRIGHT_PATH','COWL_QA_ORDINARY_EMAIL',
      'COWL_QA_ORDINARY_PASSWORD','COWL_QA_COWL_EMAIL',
      'COWL_QA_COWL_PASSWORD','COWL_QA_CURIA_EMAIL',
      'COWL_QA_CURIA_PASSWORD','COWL_QA_REVOKED_EMAIL',
      'COWL_QA_REVOKED_PASSWORD'
    )
    function Read-Private([string]$label) {
      $secret = Read-Host $label -AsSecureString
      $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
      try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
      finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    }
    function Require([bool]$ok,[string]$msg) { if(-not $ok) { throw $msg } }
    function Get-Executable([string]$name) {
      $exe = Get-Command $name -ErrorAction SilentlyContinue
      if (-not $exe) { throw ("Required tool not found: " + $name) }
      return $exe.Source
    }
    function Stage([string]$label) { $script:stage=$label; Write-Host ('=== ' + $label + ' ===') }
    try {
      Stage 'Strict TEST-only preflight'
      Require (Test-Path -LiteralPath $RepoPath) 'Local repository folder not found. Pass -RepoPath to its folder.'
      $git = Get-Executable 'git'
      $node = Get-Executable 'node'
      $npm = Get-Executable 'npm.cmd'
      $ver = & $node --version
      Require ($LASTEXITCODE -eq 0 -and [int]($ver -replace '^v(\d+).*','$1') -ge 22) 'Node.js 22+ is required.'
      $origin = [string]((& $git -C $RepoPath remote get-url origin 2>$null) -join '')
      Require ($LASTEXITCODE -eq 0 -and $origin -match '(?i)(github\.com[:/])akosiboykambyo-tech/liturgical-ministry-registry(?:\.git)?$') 'Wrong repository origin. Absolutely no test will proceed.'
      # Never connect this test runner to Production, even accidentally.
      Require ($testUrl -eq 'https://rtptybxugjhvpfjvcvgw.supabase.co') 'Invalid TEST project.'
      $portBusy=$false
      $tcp = New-Object System.Net.Sockets.TcpClient
      try {
        $iar=$tcp.BeginConnect('127.0.0.1',3399,$null,$null)
        $portBusy = $iar.AsyncWaitHandle.WaitOne(400)
        if ($portBusy) { $tcp.EndConnect($iar) }
      } catch {} finally { $tcp.Close() }
      Require (-not $portBusy) 'Local port 3399 is in use. Stop the other service; this script will not overwrite it.'
      New-Item -ItemType Directory -Path $tempRoot,$tools,$outDir -Force | Out-Null
      [IO.File]::WriteAllBytes($scriptFile,[Convert]::FromBase64String('J3VzZSBzdHJpY3QnOwovKioKICogQ09XTC1ET0sgUkMxIFRFU1Qtb25seSByZWFsIEdvVHJ1ZSAvIFBvc3RnUkVTVCAvIGxvY2FsaG9zdC1icm93c2VyIFFBLgogKiBObyBBZG1pbiB1c2VyIGNyZWF0aW9uLCBubyBSZWdpc3RyeSBJTlNFUlQvVVBEQVRFL0RFTEVURSBhbmQgbm8gbWlncmF0aW9uLgogKiBDcmVkZW50aWFsLWJlYXJpbmcgb3V0cHV0IGlzIGZvcmJpZGRlbi4gSW50ZW5kZWQgdG8gcnVuIGZyb20gdGhlIGNvbXBhbmlvbgogKiBQb3dlclNoZWxsIHdyYXBwZXIgYWZ0ZXIgdmFsaWRhdGluZyBQUiAjOTMgd29ya3RyZWUgYW5kIGV4YWN0IFRFU1QgaG9zdC4KICovCmNvbnN0IGFzc2VydCA9IHJlcXVpcmUoJ25vZGU6YXNzZXJ0L3N0cmljdCcpOwpjb25zdCBmcyA9IHJlcXVpcmUoJ25vZGU6ZnMnKTsKY29uc3QgcGF0aCA9IHJlcXVpcmUoJ25vZGU6cGF0aCcpOwpjb25zdCBNb2R1bGUgPSByZXF1aXJlKCdub2RlOm1vZHVsZScpOwpjb25zdCB7IHBhdGhUb0ZpbGVVUkwgfSA9IHJlcXVpcmUoJ25vZGU6dXJsJyk7Cgpjb25zdCBFWFBFQ1RFRF9SRUYgPSAncnRwdHlieHVnamh2cGZqdmN2Z3cnOwpjb25zdCBFWFBFQ1RFRF9TSEEgPSAnMDlmNjVhNzI5OTNjN2Q1OWM0MjFmMDNlOWI2YmEwMTc1OWM2NWY1OCc7CmNvbnN0IEFQSSA9IGBodHRwczovLyR7RVhQRUNURURfUkVGfS5zdXBhYmFzZS5jb2A7CmNvbnN0IEhPU1RfVVJMID0gcHJvY2Vzcy5lbnYuQ09XTF9RQV9BUFBfVVJMIHx8ICdodHRwOi8vMTI3LjAuMC4xOjMzOTknOwpjb25zdCByb290ID0gcHJvY2Vzcy5lbnYuQ09XTF9RQV9XT1JLVFJFRSB8fCAnJzsKY29uc3QgcmVwb3J0RmlsZSA9IHByb2Nlc3MuZW52LkNPV0xfUUFfUkVQT1JUIHx8ICcnOwpjb25zdCBhbm9uS2V5ID0gcHJvY2Vzcy5lbnYuQ09XTF9RQV9BTk9OX0tFWSB8fCAnJzsKY29uc3QgYWRtaW5FbWFpbCA9IHByb2Nlc3MuZW52LkNPV0xfUUFfUkVHSVNUUllfRU1BSUwgfHwgJyc7CmNvbnN0IGFkbWluUGFzc3dvcmQgPSBwcm9jZXNzLmVudi5DT1dMX1FBX1JFR0lTVFJZX1BBU1NXT1JEIHx8ICcnOwpjb25zdCByZXN1bHRzID0gW107CmxldCBpbnZhbGlkQ291bnQgPSAwOwpsZXQgd3JpdGVBdHRlbXB0cyA9IDA7CmNvbnN0IHN0YXJ0ZWQgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7CgpmdW5jdGlvbiBhc3NlcnRTYWZldHkoKSB7CiAgYXNzZXJ0LmVxdWFsKHByb2Nlc3MuZW52LkNPV0xfUUFfU1VQQUJBU0VfVVJMLCBBUEksICdXcm9uZyBvciBtaXNzaW5nIFRFU1QgU3VwYWJhc2UgVVJMJyk7CiAgYXNzZXJ0Lm1hdGNoKEhPU1RfVVJMLCAvXmh0dHA6XC9cLzEyN1wuMFwuMFwuMTozMzk5JC8sICdBcHAgVVJMIG11c3QgYmUgZXhhY3QgbG9jYWxob3N0IHBvcnQnKTsKICBhc3NlcnQub2socm9vdCAmJiBmcy5leGlzdHNTeW5jKHBhdGguam9pbihyb290LCAncGFja2FnZS5qc29uJykpLCAnUFIgIzkzIGRldGFjaGVkIHdvcmt0cmVlIG1pc3NpbmcnKTsKICBhc3NlcnQuZXF1YWwocHJvY2Vzcy5lbnYuQ09XTF9RQV9DT01NSVQsIEVYUEVDVEVEX1NIQSwgJ1dyb25nIFBSICM5MyBzb3VyY2UgU0hBJyk7CiAgYXNzZXJ0Lm9rKGFub25LZXkubGVuZ3RoID4gMjAgJiYgYWRtaW5FbWFpbC5pbmNsdWRlcygnQCcpICYmIGFkbWluUGFzc3dvcmQubGVuZ3RoID4gMCwgJ01pc3NpbmcgVEVTVCBjcmVkZW50aWFscycpOwogIGFzc2VydC5vayhyZXBvcnRGaWxlICYmIHBhdGguaXNBYnNvbHV0ZShyZXBvcnRGaWxlKSwgJ1JlcG9ydCBkZXN0aW5hdGlvbiByZXF1aXJlZCcpOwogIGNvbnN0IHJlcG9HaXQgPSBwYXRoLmpvaW4ocm9vdCwgJy5naXQnKTsKICBhc3NlcnQub2soZnMuZXhpc3RzU3luYyhyZXBvR2l0KSwgJ0RldGFjaGVkIHdvcmt0cmVlIG1hcmtlciBtaXNzaW5nJyk7Cn0KZnVuY3Rpb24gcmVjb3JkKG5hbWUsIHN0YXRlLCBub3RlPScnKSB7CiAgLy8gU3RyaXAgVVJMcywgYmVhcmVyIHRva2VucywgYWRkcmVzc2VzIGFuZCBpbnRlcm5hbCBlcnJvciBkYXRhIGZyb20gcmVwb3J0LgogIGNvbnN0IHNhZmUgPSBTdHJpbmcobm90ZSkucmVwbGFjZSgvXFMrQFxTKy9nLCAnW2VtYWlsLXJlZGFjdGVkXScpLnJlcGxhY2UoL2V5SltBLVphLXowLTkuXy1dezQwLH0vZywgJ1t0b2tlbi1yZWRhY3RlZF0nKS5zbGljZSgwLCAyMjApOwogIHJlc3VsdHMucHVzaCh7IG5hbWUsIHN0YXRlLCBkZXRhaWw6IHNhZmUgfSk7CiAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoYCR7c3RhdGV9OiAke25hbWV9JHtzYWZlID8gJyDigJQgJyArIHNhZmUgOiAnJ31cbmApOwp9CmFzeW5jIGZ1bmN0aW9uIGNoZWNrKG5hbWUsIGNiLCBvcHRzPXt9KSB7CiAgdHJ5IHtjb25zdCBkZXRhaWw9YXdhaXQgY2IoKTtyZWNvcmQobmFtZSwnUEFTUycsZGV0YWlsfHwnJyk7fQogIGNhdGNoKGUpe3JlY29yZChuYW1lLG9wdHMuYmxvY2tlZD8nQkxPQ0tFRCc6J0ZBSUwnLGU/Lm1lc3NhZ2V8fCdjaGVjayBmYWlsZWQnKTtpZighb3B0cy5ibG9ja2VkKWludmFsaWRDb3VudCsrO30KfQpmdW5jdGlvbiBtb2R1bGVGcm9tV29ya3RyZWUobmFtZSkgeyByZXR1cm4gcmVxdWlyZShyZXF1aXJlLnJlc29sdmUobmFtZSwgeyBwYXRoczogW3Jvb3RdIH0pKTsgfQoKYXN5bmMgZnVuY3Rpb24gYnJvd3NlclRlc3QoKSB7CiAgY29uc3QgbW9kdWxlUGF0aCA9IHByb2Nlc3MuZW52LkNPV0xfUUFfUExBWVdSSUdIVF9QQVRIOwogIGFzc2VydC5vayhtb2R1bGVQYXRoICYmIGZzLmV4aXN0c1N5bmMobW9kdWxlUGF0aCksICdUZW1wb3JhcnkgUGxheXdyaWdodCBwYWNrYWdlIGlzIG1pc3NpbmcnKTsKICBjb25zdCBwdyA9IHJlcXVpcmUobW9kdWxlUGF0aCk7CiAgY29uc3QgYnJvd3NlciA9IGF3YWl0IHB3LmNocm9taXVtLmxhdW5jaCh7aGVhZGxlc3M6dHJ1ZX0pOwogIHRyeSB7CiAgICBjb25zdCBjb250ZXh0ID0gYXdhaXQgYnJvd3Nlci5uZXdDb250ZXh0KHsgdmlld3BvcnQ6IHt3aWR0aDoxMjgwLGhlaWdodDo4MDB9LCBhY2NlcHREb3dubG9hZHM6IGZhbHNlIH0pOwogICAgY29uc3QgcGFnZSA9IGF3YWl0IGNvbnRleHQubmV3UGFnZSgpOwogICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBwYWdlLmdvdG8oSE9TVF9VUkwrJy9hZG1pbicsIHt3YWl0VW50aWw6J2RvbWNvbnRlbnRsb2FkZWQnLHRpbWVvdXQ6NDUwMDB9KTsKICAgIGFzc2VydC5vayhyZXNwb25zZT8ub2soKSwgJ0FkbWluIHNpZ24taW4gcGFnZSBkaWQgbm90IGxvYWQnKTsKICAgIGF3YWl0IHBhZ2UubG9jYXRvcignaW5wdXRbdHlwZT0iZW1haWwiXScpLmZpcnN0KCkuZmlsbChhZG1pbkVtYWlsLCB7dGltZW91dDoxNTAwMH0pOwogICAgYXdhaXQgcGFnZS5sb2NhdG9yKCdpbnB1dFt0eXBlPSJwYXNzd29yZCJdJykuZmlyc3QoKS5maWxsKGFkbWluUGFzc3dvcmQsIHt0aW1lb3V0OjE1MDAwfSk7CiAgICBhd2FpdCBwYWdlLmxvY2F0b3IoJ2J1dHRvblt0eXBlPSJzdWJtaXQiXScpLmZpcnN0KCkuY2xpY2soe3RpbWVvdXQ6MTUwMDB9KTsKICAgIGF3YWl0IHBhZ2Uud2FpdEZvclVSTCh1cmwgPT4gdXJsLnBhdGhuYW1lLnN0YXJ0c1dpdGgoJy9hZG1pbi9kYXNoYm9hcmQnKSwge3RpbWVvdXQ6NDUwMDB9KTsKICAgIGNvbnN0IGRhc2hib2FyZCA9IGF3YWl0IHBhZ2UuZ290byhIT1NUX1VSTCsnL2FkbWluL2Rhc2hib2FyZCcse3dhaXRVbnRpbDonZG9tY29udGVudGxvYWRlZCcsdGltZW91dDo0NTAwMH0pOwogICAgYXNzZXJ0Lm9rKGRhc2hib2FyZD8ub2soKSwgJ0F1dGhlbnRpY2F0ZWQgZGFzaGJvYXJkIHJvdXRlIGZhaWxlZCcpOwogICAgYXdhaXQgcGFnZS53YWl0Rm9yVGltZW91dCgyMDAwKTsKICAgIGFzc2VydC5vayghcGFnZS51cmwoKS5pbmNsdWRlcygnL2FjY2Vzcy1wZW5kaW5nJyksICdBZG1pbiB3YXMgcm91dGVkIHRvIGFjY2Vzcy1wZW5kaW5nJyk7CiAgICBjb25zdCBuYXJyb3cgPSBhd2FpdCBicm93c2VyLm5ld0NvbnRleHQoeyB2aWV3cG9ydDp7d2lkdGg6MzkwLGhlaWdodDo4NDR9LGlzTW9iaWxlOnRydWUsaGFzVG91Y2g6dHJ1ZSB9KTsKICAgIHRyeSB7CiAgICAgIGNvbnN0IG1vYmlsZSA9IGF3YWl0IG5hcnJvdy5uZXdQYWdlKCk7CiAgICAgIGNvbnN0IG0gPSBhd2FpdCBtb2JpbGUuZ290byhIT1NUX1VSTCsnL2FkbWluJyx7d2FpdFVudGlsOidkb21jb250ZW50bG9hZGVkJyx0aW1lb3V0OjQ1MDAwfSk7CiAgICAgIGFzc2VydC5vayhtPy5vaygpLCAnTW9iaWxlIHNpZ24taW4gcm91dGUgZmFpbGVkJyk7CiAgICAgIGFzc2VydC5vayhhd2FpdCBtb2JpbGUubG9jYXRvcignaW5wdXRbdHlwZT0iZW1haWwiXScpLmZpcnN0KCkuaXNWaXNpYmxlKCksICdNb2JpbGUgc2lnbi1pbiBpbnB1dCBub3QgdmlzaWJsZScpOwogICAgfSBmaW5hbGx5IHthd2FpdCBuYXJyb3cuY2xvc2UoKTt9CiAgICBhd2FpdCBjb250ZXh0LmNsb3NlKCk7CiAgICByZXR1cm4gJ0FjdHVhbCBQUiAjOTMgbG9jYWxob3N0IGJyb3dzZXIgbG9naW4sIGRhc2hib2FyZCBhbmQgbW9iaWxlIHNpZ24taW4gc2hlbGwnOwogIH0gZmluYWxseSB7YXdhaXQgYnJvd3Nlci5jbG9zZSgpO30KfQoKZnVuY3Rpb24gcmVhbER1cGxpY2F0ZVBpcGVsaW5lKGNsaWVudCkgewogIC8vIFRyYW5zcGlsZSB0aGUgQUNUVUFMIGludGVncmF0ZWQgc291cmNlLiBPbmx5IGltcG9ydHMgZm9yIFN1cGFiYXNlIGFuZAogIC8vIHdyaXRlIG9wZXJhdGlvbnMgYXJlIGludGVyY2VwdGVkOyByZWdpc3RyYXRpb24tbWF0Y2hpbmcgY29kZSBpcyByZWFsLgogIGNvbnN0IHRzID0gbW9kdWxlRnJvbVdvcmt0cmVlKCd0eXBlc2NyaXB0Jyk7CiAgY29uc3QgZmlsZSA9IHBhdGguam9pbihyb290LCdsaWInLCdkdXBsaWNhdGUtY2hlY2sudHMnKTsKICBjb25zdCBzb3VyY2UgPSB0cy50cmFuc3BpbGVNb2R1bGUoZnMucmVhZEZpbGVTeW5jKGZpbGUsJ3V0ZjgnKSx7CiAgICBjb21waWxlck9wdGlvbnM6e21vZHVsZTp0cy5Nb2R1bGVLaW5kLkNvbW1vbkpTLHRhcmdldDp0cy5TY3JpcHRUYXJnZXQuRVMyMDIyfQogIH0pLm91dHB1dFRleHQ7CiAgY29uc3QgbSA9IG5ldyBNb2R1bGUoZmlsZSxtb2R1bGUpO20uZmlsZW5hbWU9ZmlsZTttLnBhdGhzPU1vZHVsZS5fbm9kZU1vZHVsZVBhdGhzKHBhdGguZGlybmFtZShmaWxlKSk7CiAgY29uc3QgcHVyZSA9IChmaWxlUmVsKSA9PiB7CiAgICBjb25zdCBmaWxlbmFtZT1wYXRoLmpvaW4ocm9vdCxmaWxlUmVsKTsKICAgIGNvbnN0IG1vZD1uZXcgTW9kdWxlKGZpbGVuYW1lLG0pO21vZC5maWxlbmFtZT1maWxlbmFtZTttb2QucGF0aHM9TW9kdWxlLl9ub2RlTW9kdWxlUGF0aHMocGF0aC5kaXJuYW1lKGZpbGVuYW1lKSk7CiAgICBtb2QuX2NvbXBpbGUodHMudHJhbnNwaWxlTW9kdWxlKGZzLnJlYWRGaWxlU3luYyhmaWxlbmFtZSwndXRmOCcpLHsKICAgICAgY29tcGlsZXJPcHRpb25zOnttb2R1bGU6dHMuTW9kdWxlS2luZC5Db21tb25KUyx0YXJnZXQ6dHMuU2NyaXB0VGFyZ2V0LkVTMjAyMn0KICAgIH0pLm91dHB1dFRleHQsZmlsZW5hbWUpO3JldHVybiBtb2QuZXhwb3J0czsKICB9OwogIG0ucmVxdWlyZT0oc3BlYyk9PnsKICAgIGlmKHNwZWM9PT0nQC9saWIvc3VwYWJhc2UvY2xpZW50JylyZXR1cm4ge2dldFN1cGFiYXNlQnJvd3NlckNsaWVudDooKT0+Y2xpZW50fTsKICAgIGlmKHNwZWM9PT0nQC9saWIvcmVnaXN0cnktYWRtaW4td3JpdGVzJylyZXR1cm4ge3JlZ2lzdHJ5QWRtaW5Xcml0ZTphc3luYygpPT57d3JpdGVBdHRlbXB0cysrO3Rocm93IEVycm9yKCdRQSB3cml0ZSBib3VuZGFyeScpO319OwogICAgaWYoc3BlYz09PSdAL2xpYi9jb25zdGFudHMnKXJldHVybiBwdXJlKCdsaWIvY29uc3RhbnRzLnRzJyk7CiAgICBpZihzcGVjPT09J0AvbGliL3JlZ2lzdHJhdGlvbi1tYXRjaGluZycpcmV0dXJuIHB1cmUoJ2xpYi9yZWdpc3RyYXRpb24tbWF0Y2hpbmcudHMnKTsKICAgIGlmKHNwZWM9PT0nQC9saWIvdHlwZXMnKXJldHVybiB7fTsKICAgIHJldHVybiByZXF1aXJlKHNwZWMpOwogIH07CiAgbS5fY29tcGlsZShzb3VyY2UsZmlsZSk7CiAgcmV0dXJuIG0uZXhwb3J0czsKfQoKYXN5bmMgZnVuY3Rpb24gbWFpbigpIHsKICBhc3NlcnRTYWZldHkoKTsKICBjb25zdCB7Y3JlYXRlQ2xpZW50fSA9IG1vZHVsZUZyb21Xb3JrdHJlZSgnQHN1cGFiYXNlL3N1cGFiYXNlLWpzJyk7CiAgY29uc3QgY3JlYXRlZCA9ICgpID0+IGNyZWF0ZUNsaWVudChBUEksYW5vbktleSx7YXV0aDp7cGVyc2lzdFNlc3Npb246ZmFsc2UsYXV0b1JlZnJlc2hUb2tlbjpmYWxzZX19KTsKICBsZXQgcmVnaXN0cnk9bnVsbDsKICBhd2FpdCBjaGVjaygnUkVBTF9HT1RSVUVfUkVHSVNUUllfTE9HSU4nLGFzeW5jKCk9PnsKICAgIHJlZ2lzdHJ5PWNyZWF0ZWQoKTsKICAgIGNvbnN0IHI9YXdhaXQgcmVnaXN0cnkuYXV0aC5zaWduSW5XaXRoUGFzc3dvcmQoe2VtYWlsOmFkbWluRW1haWwscGFzc3dvcmQ6YWRtaW5QYXNzd29yZH0pOwogICAgYXNzZXJ0LmlmRXJyb3Ioci5lcnJvcik7CiAgICBhc3NlcnQub2soci5kYXRhPy5zZXNzaW9uPy5hY2Nlc3NfdG9rZW4gJiYgci5kYXRhPy51c2VyPy5pZCwnTm8gdmVyaWZpZWQgU3VwYWJhc2Ugc2Vzc2lvbicpOwogICAgY29uc3QgdmVyaWZ5PWF3YWl0IHJlZ2lzdHJ5LmF1dGguZ2V0VXNlcihyLmRhdGEuc2Vzc2lvbi5hY2Nlc3NfdG9rZW4pOwogICAgYXNzZXJ0LmlmRXJyb3IodmVyaWZ5LmVycm9yKTthc3NlcnQuZXF1YWwodmVyaWZ5LmRhdGEudXNlci5pZCxyLmRhdGEudXNlci5pZCk7CiAgICByZXR1cm4gJ1RFU1QgQXV0aCB2ZXJpZmllZCB2aWEgR29UcnVlOyB0b2tlbiBhbmQgZW1haWwgb21pdHRlZCc7CiAgfSk7CiAgaWYoIXJlZ2lzdHJ5IHx8ICEoYXdhaXQgcmVnaXN0cnkuYXV0aC5nZXRTZXNzaW9uKCkpLmRhdGEuc2Vzc2lvbil7CiAgICByZWNvcmQoJ0ZPTExPV19PTl9URVNUUycsJ0JMT0NLRUQnLCdSZWdpc3RyeSBURVNUIGxvZ2luIGlzIHJlcXVpcmVkJyk7cmV0dXJuOwogIH0KICBhd2FpdCBjaGVjaygnUkVBTF9SRUdJU1RSWV9BRE1JTl9SUEMnLGFzeW5jKCk9PnsKICAgIGNvbnN0IHI9YXdhaXQgcmVnaXN0cnkucnBjKCdyZWdpc3RyYXRpb25faXNfYWRtaW4nKTthc3NlcnQuaWZFcnJvcihyLmVycm9yKTthc3NlcnQuZXF1YWwoci5kYXRhLHRydWUpOwogICAgcmV0dXJuICdMaXZlIHNpZ25lZCBSZWdpc3RyeS1hZG1pbiBSUEMgcmV0dXJuZWQgdHJ1ZSc7CiAgfSk7CiAgbGV0IGJhc2VDb3VudD0tMTsKICBhd2FpdCBjaGVjaygnUkVBTF9SRUdJU1RSWV9NRU1CRVJfQ09VTlRfQU5EX1BBR0lOQVRJT04nLGFzeW5jKCk9PnsKICAgIGNvbnN0IGNvdW50PWF3YWl0IHJlZ2lzdHJ5LmZyb20oJ21lbWJlcnMnKS5zZWxlY3QoJ2lkJyx7aGVhZDp0cnVlLGNvdW50OidleGFjdCd9KTsKICAgIGFzc2VydC5pZkVycm9yKGNvdW50LmVycm9yKTtiYXNlQ291bnQ9Y291bnQuY291bnQ7CiAgICBhc3NlcnQub2soYmFzZUNvdW50Pj0xMDAxLCdURVNUIGRvZXMgbm90IGhhdmUgMSwwMDEgdmlzaWJsZSBSZWdpc3RyeSBtZW1iZXJzJyk7CiAgICBjb25zdCBwYWdlMT1hd2FpdCByZWdpc3RyeS5mcm9tKCdtZW1iZXJzJykuc2VsZWN0KCdpZCcpLm9yZGVyKCdpZCcpLnJhbmdlKDAsOTk5KTsKICAgIGFzc2VydC5pZkVycm9yKHBhZ2UxLmVycm9yKTthc3NlcnQuZXF1YWwocGFnZTEuZGF0YT8ubGVuZ3RoLDEwMDAsJ0ZpcnN0IFJlZ2lzdHJ5IHBhZ2UgbXVzdCBjb250YWluIDEwMDAgcmVjb3JkcycpOwogICAgY29uc3QgcGFnZTI9YXdhaXQgcmVnaXN0cnkuZnJvbSgnbWVtYmVycycpLnNlbGVjdCgnaWQnKS5vcmRlcignaWQnKS5yYW5nZSgxMDAwLDE5OTkpOwogICAgYXNzZXJ0LmlmRXJyb3IocGFnZTIuZXJyb3IpO2Fzc2VydC5vayhwYWdlMi5kYXRhPy5sZW5ndGg+PTEsJ1NlY29uZCBSZWdpc3RyeSBwYWdlIGVtcHR5Jyk7CiAgICByZXR1cm4gYENvdW50ID49MTAwMSBhbmQgc2Vjb25kIHBhZ2UgcmVhY2hhYmxlICgke2Jhc2VDb3VudH0gdmlzaWJsZSlgOwogIH0pOwogIGF3YWl0IGNoZWNrKCdSRUFMX1JFR0lTVFJZX1NUQUdFX1JFQURfT05MWScsYXN5bmMoKT0+ewogICAgY29uc3QgcD1yZWFsRHVwbGljYXRlUGlwZWxpbmUocmVnaXN0cnkpOwogICAgY29uc3QgcmVzdWx0PWF3YWl0IHAuc3RhZ2VCYXRjaFJlY29yZHMoW3sKICAgICAgZmlyc3RfbmFtZTonUUFTeW50aGV0aWNVbmlxdWVaWicsbGFzdF9uYW1lOidRQVJvbGxiYWNrTm9taW5hbCcscGFyaXNoOidRQSBmaWN0aXRpb3VzIHBhcmlzaCcsbWluaXN0cnk6J01pbmlzdHJ5IG9mIExpdHVyZ2ljYWwgTXVzaWMnCiAgICB9XSx1bmRlZmluZWQsMjAyNik7CiAgICBhc3NlcnQub2socmVzdWx0ICYmIEFycmF5LmlzQXJyYXkocmVzdWx0LnVuaXF1ZSkgJiYgQXJyYXkuaXNBcnJheShyZXN1bHQuZHVwbGljYXRlcykpOwogICAgYXNzZXJ0LmVxdWFsKHJlc3VsdC51bmlxdWUubGVuZ3RoLDEsJ1NhZmUgc3ludGhldGljIHJvdyBzaG91bGQgc3RhZ2UgYXMgdW5pcXVlJyk7CiAgICBhc3NlcnQuZXF1YWwod3JpdGVBdHRlbXB0cywwLCdTdGFnaW5nIGNhdXNlZCBwcml2aWxlZ2VkIFJlZ2lzdHJ5IHdyaXRlJyk7CiAgICByZXR1cm4gJ0FjdHVhbCBQUiAjOTMgZHVwbGljYXRlIHBpcGVsaW5lIHJlYWQgMSwwMTArIFRFU1Qgcm93czsgemVybyB3cml0ZXMnOwogIH0pOwogIGF3YWl0IGNoZWNrKCdSRUFMX1JFR0lTVFJZX0ZBSUxVUkVfTk9fV1JJVEUnLGFzeW5jKCk9PnsKICAgIGNvbnN0IHtjcmVhdGVDbGllbnR9PW1vZHVsZUZyb21Xb3JrdHJlZSgnQHN1cGFiYXNlL3N1cGFiYXNlLWpzJyk7CiAgICBjb25zdCB0b2s9KGF3YWl0IHJlZ2lzdHJ5LmF1dGguZ2V0U2Vzc2lvbigpKS5kYXRhLnNlc3Npb24uYWNjZXNzX3Rva2VuOwogICAgY29uc3Qgb3V0YWdlPWNyZWF0ZUNsaWVudChBUEksYW5vbktleSx7YXV0aDp7cGVyc2lzdFNlc3Npb246ZmFsc2UsYXV0b1JlZnJlc2hUb2tlbjpmYWxzZX0sZ2xvYmFsOntoZWFkZXJzOntBdXRob3JpemF0aW9uOidCZWFyZXIgJyt0b2t9LGZldGNoOmFzeW5jKGlucHV0LGluaXQpPT57CiAgICAgIGNvbnN0IHVybD1uZXcgVVJMKHR5cGVvZiBpbnB1dD09PSdzdHJpbmcnP2lucHV0OmlucHV0LnVybCk7CiAgICAgIGlmKHVybC5wYXRobmFtZT09PScvcmVzdC92MS9tZW1iZXJzJylyZXR1cm4gbmV3IFJlc3BvbnNlKEpTT04uc3RyaW5naWZ5KHtjb2RlOidQR1JTVDUwNCcsbWVzc2FnZTonUUEtaW5qZWN0ZWQgZmFpbHVyZSd9KSx7c3RhdHVzOjUwMyxoZWFkZXJzOnsnY29udGVudC10eXBlJzonYXBwbGljYXRpb24vanNvbid9fSk7CiAgICAgIHJldHVybiBmZXRjaChpbnB1dCxpbml0KTsKICAgIH19fSk7CiAgICBjb25zdCBwPXJlYWxEdXBsaWNhdGVQaXBlbGluZShvdXRhZ2UpOwogICAgYXdhaXQgYXNzZXJ0LnJlamVjdHMocC5zdGFnZUJhdGNoUmVjb3Jkcyhbe2ZpcnN0X25hbWU6J1FBU3ludGhldGljVW5pcXVlWlonLGxhc3RfbmFtZTonUUFSb2xsYmFja05vbWluYWwnLHBhcmlzaDonUUEgZmljdGl0aW91cyBwYXJpc2gnLG1pbmlzdHJ5OidNaW5pc3RyeSBvZiBMaXR1cmdpY2FsIE11c2ljJ31dLHVuZGVmaW5lZCwyMDI2KSwvUUEtaW5qZWN0ZWQgZmFpbHVyZS8pOwogICAgYXNzZXJ0LmVxdWFsKHdyaXRlQXR0ZW1wdHMsMCk7cmV0dXJuICdSZWFsIHNpZ25lZCBKV1Q7IGludGVyY2VwdGVkIHJlYWQgZmFpbHVyZSBibG9ja3Mgc3RhZ2luZyBiZWZvcmUgd3JpdGVzJzsKICB9KTsKICBhd2FpdCBjaGVjaygnUkVBTF9BTk9OX1JFR0lTVFJZX1dSSVRFX0RFTklBTCcsYXN5bmMoKT0+ewogICAgLy8gTmV2ZXIgc2VuZCB2YWxpZCBkYXRhLiBWZXJpZnkgdGhlIGRpcmVjdCBSUEMgZGVuaWVzIHVuc2lnbmVkIGNhbGxlcnMKICAgIC8vIGJlZm9yZSBldmFsdWF0aW5nIGludmFsaWQgcGF5bG9hZHMsIHdpdGhvdXQgY3JlYXRpbmcgcmVjb3Jkcy4KICAgIGNvbnN0IHJlcz1hd2FpdCBmZXRjaChBUEkrJy9yZXN0L3YxL3JwYy9yZWdpc3RyeV9hZG1pbl9tZW1iZXJfd3JpdGVfdjEnLHttZXRob2Q6J1BPU1QnLGhlYWRlcnM6e2FwaWtleTphbm9uS2V5LEF1dGhvcml6YXRpb246J0JlYXJlciAnK2Fub25LZXksJ2NvbnRlbnQtdHlwZSc6J2FwcGxpY2F0aW9uL2pzb24nfSxib2R5OkpTT04uc3RyaW5naWZ5KHtwX2FjdGlvbjonY3JlYXRlJyxwX2RhdGE6e319KX0pOwogICAgYXNzZXJ0Lm9rKFs0MDEsNDAzLDQwNF0uaW5jbHVkZXMocmVzLnN0YXR1cyksYFVuZXhwZWN0ZWQgYW5vbiBSUEMgcmVzcG9uc2U6ICR7cmVzLnN0YXR1c31gKTsKICAgIHJldHVybiBgQW5vbnltb3VzIGRpcmVjdCBSZWdpc3RyeSB3cml0ZSByZWplY3RlZCAoSFRUUCAke3Jlcy5zdGF0dXN9KWA7CiAgfSk7CiAgYXdhaXQgY2hlY2soJ1JFQUxfQU5PTl9BVURJVF9SRUFEX0RFTklBTCcsYXN5bmMoKT0+ewogICAgY29uc3QgYW5vbj1jcmVhdGVkKCk7Y29uc3Qgcj1hd2FpdCBhbm9uLmZyb20oJ2F1ZGl0X2xvZ3MnKS5zZWxlY3QoJ2lkJyx7Y291bnQ6J2V4YWN0JyxoZWFkOnRydWV9KTsKICAgIGFzc2VydC5vayhyLmVycm9yIHx8IHIuY291bnQ9PT0wLCdBbm9ueW1vdXMgdXNlcnMgbXVzdCBub3Qgc2VlIGF1ZGl0IGxvZ3MnKTsKICAgIHJldHVybiAnQW5vbnltb3VzIGF1ZGl0LWxvZyByZWFkIGRlbmllZC9lbXB0eSc7CiAgfSk7CiAgY29uc3Qgb3B0aW9uYWxSb2xlcz1bCiAgICBbJ09SRElOQVJZJywgJ0NPV0xfUUFfT1JESU5BUllfRU1BSUwnLCdDT1dMX1FBX09SRElOQVJZX1BBU1NXT1JEJyxudWxsXSwKICAgIFsnQ09XTF9WSUVXRVInLCdDT1dMX1FBX0NPV0xfRU1BSUwnLCdDT1dMX1FBX0NPV0xfUEFTU1dPUkQnLCdjb3dsJ10sCiAgICBbJ0NVUklBX1ZJRVdFUicsJ0NPV0xfUUFfQ1VSSUFfRU1BSUwnLCdDT1dMX1FBX0NVUklBX1BBU1NXT1JEJywnY3VyaWEnXSwKICAgIFsnUkVWT0tFRF9BRE1JTicsJ0NPV0xfUUFfUkVWT0tFRF9FTUFJTCcsJ0NPV0xfUUFfUkVWT0tFRF9QQVNTV09SRCcsbnVsbF0sCiAgXTsKICBmb3IoY29uc3QgW3JvbGUsbWFpbEtleSxwYXNzS2V5LHdvcmtzcGFjZV0gb2Ygb3B0aW9uYWxSb2xlcyl7CiAgICBjb25zdCBlbWFpbD1wcm9jZXNzLmVudlttYWlsS2V5XSxwYXNzd29yZD1wcm9jZXNzLmVudltwYXNzS2V5XTsKICAgIGlmKCFlbWFpbHx8IXBhc3N3b3JkKXtyZWNvcmQoJ1JFQUxfJytyb2xlKydfTUFUUklYJywnQkxPQ0tFRCcsJ05vIGRlZGljYXRlZCBURVNUIGNyZWRlbnRpYWxzIHByb3ZpZGVkJyk7Y29udGludWU7fQogICAgYXdhaXQgY2hlY2soJ1JFQUxfJytyb2xlKydfTUFUUklYJyxhc3luYygpPT57CiAgICAgIGNvbnN0IGM9Y3JlYXRlZCgpO2NvbnN0IHI9YXdhaXQgYy5hdXRoLnNpZ25JbldpdGhQYXNzd29yZCh7ZW1haWwscGFzc3dvcmR9KTthc3NlcnQuaWZFcnJvcihyLmVycm9yKTsKICAgICAgYXNzZXJ0Lm9rKHIuZGF0YS5zZXNzaW9uPy5hY2Nlc3NfdG9rZW4sJ05vIEdvVHJ1ZSBiZWFyZXInKTsKICAgICAgY29uc3QgYT1hd2FpdCBjLnJwYygncmVnaXN0cmF0aW9uX2lzX2FkbWluJyk7YXNzZXJ0LmlmRXJyb3IoYS5lcnJvcik7YXNzZXJ0LmVxdWFsKGEuZGF0YSxmYWxzZSxgJHtyb2xlfSBoYXMgUmVnaXN0cnkgYWRtaW4gcmlnaHRzYCk7CiAgICAgIGNvbnN0IGRlbmllZD1hd2FpdCBjLnJwYygncmVnaXN0cnlfYWRtaW5fbWVtYmVyX3dyaXRlX3YxJyx7cF9hY3Rpb246J2NyZWF0ZScscF9kYXRhOnt9fSk7CiAgICAgIGFzc2VydC5vayhkZW5pZWQuZXJyb3IsJ0RpcmVjdCBSZWdpc3RyeSB3cml0ZSB3YXMgbm90IGRlbmllZCcpOwogICAgICBpZih3b3Jrc3BhY2UpewogICAgICAgIGNvbnN0IHg9YXdhaXQgZmV0Y2goSE9TVF9VUkwrJy9hcGkvZmluYW5jaWFsLXN0ZXdhcmRzaGlwL2FjY2Vzcz93b3Jrc3BhY2U9YWxsJyx7aGVhZGVyczp7QXV0aG9yaXphdGlvbjonQmVhcmVyICcrci5kYXRhLnNlc3Npb24uYWNjZXNzX3Rva2VufX0pOwogICAgICAgIGFzc2VydC5lcXVhbCh4LnN0YXR1cywyMDAsYFZpZXdlciBmaW5hbmNlIGVuZHBvaW50IHJldHVybmVkICR7eC5zdGF0dXN9YCk7CiAgICAgICAgY29uc3QgaW5mbz1hd2FpdCB4Lmpzb24oKTthc3NlcnQub2soaW5mbz8uYWNjZXNzPy5bd29ya3NwYWNlXT8ubGVuZ3RoPjAsYCR7cm9sZX0gbGFja3MgZXhwZWN0ZWQgZmluYW5jZSBncmFudGApOwogICAgICB9CiAgICAgIGF3YWl0IGMuYXV0aC5zaWduT3V0KCk7CiAgICAgIHJldHVybiBgQXV0aGVudGljYXRlZCBURVNUICR7cm9sZX0gYmxvY2tlZCBmcm9tIFJlZ2lzdHJ5IHdyaXRlc2A7CiAgICB9KTsKICB9CiAgYXdhaXQgY2hlY2soJ1JFQUxfQlJPV1NFUl9BRE1JTl9BTkRfTU9CSUxFJyxicm93c2VyVGVzdCk7CiAgYXdhaXQgY2hlY2soJ1JFQUxfUkVHSVNUUllfTUVNQkVSX0NPVU5UX1VOQ0hBTkdFRCcsYXN5bmMoKT0+ewogICAgY29uc3Qgcj1hd2FpdCByZWdpc3RyeS5mcm9tKCdtZW1iZXJzJykuc2VsZWN0KCdpZCcse2hlYWQ6dHJ1ZSxjb3VudDonZXhhY3QnfSk7CiAgICBhc3NlcnQuaWZFcnJvcihyLmVycm9yKTthc3NlcnQuZXF1YWwoci5jb3VudCxiYXNlQ291bnQpOwogICAgYXNzZXJ0LmVxdWFsKHdyaXRlQXR0ZW1wdHMsMCk7CiAgICByZXR1cm4gYEJlZm9yZS9hZnRlciBjb3VudCB1bmNoYW5nZWQgKCR7YmFzZUNvdW50fSk7IG5vIGNsaWVudCB3cml0ZSByZXF1ZXN0c2A7CiAgfSk7CiAgdHJ5IHsgYXdhaXQgcmVnaXN0cnkuYXV0aC5zaWduT3V0KCk7IH1jYXRjaHt9Cn0KKGFzeW5jKCk9PnsKICB0cnl7YXdhaXQgbWFpbigpO31jYXRjaChlKXtyZWNvcmQoJ0hBUk5FU1NfUFJFRkxJR0hUJywnRkFJTCcsZS5tZXNzYWdlKTtpbnZhbGlkQ291bnQrKzt9CiAgZmluYWxseXsKICAgIGNvbnN0IHN1bW1hcnk9e3NjZW5hcmlvOidDT1dMLURPSyBSQzEgVEVTVCByZWFsIEdvVHJ1ZSAvIFBvc3RnUkVTVCArIGxvY2FsaG9zdCBicm93c2VyJyxzb3VyY2VTaGE6RVhQRUNURURfU0hBLHRlc3RQcm9qZWN0UmVmOkVYUEVDVEVEX1JFRixzdGFydGVkLGZpbmlzaGVkOm5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxzdGF0dXM6aW52YWxpZENvdW50PydGQUlMJzpyZXN1bHRzLnNvbWUoeD0+eC5zdGF0ZT09PSdCTE9DS0VEJyk/J1BBUlRJQUwnOidQQVNTJyxwYXNzZWQ6cmVzdWx0cy5maWx0ZXIoeD0+eC5zdGF0ZT09PSdQQVNTJykubGVuZ3RoLGZhaWxlZDpyZXN1bHRzLmZpbHRlcih4PT54LnN0YXRlPT09J0ZBSUwnKS5sZW5ndGgsYmxvY2tlZDpyZXN1bHRzLmZpbHRlcih4PT54LnN0YXRlPT09J0JMT0NLRUQnKS5sZW5ndGgsbm90ZXM6WydObyBSZWdpc3RyeSBtdXRhdGlvbnMgYXJlIHJlcXVlc3RlZCBieSB0aGlzIHJ1bm5lci4gVEVTVCBzaWduLWluIHVwZGF0ZXMgbm9ybWFsIEF1dGggc2Vzc2lvbiBtZXRhZGF0YS4nLCdFeGlzdGluZyBURVNUIGRpZmZlcnMgZnJvbSBQcm9kdWN0aW9uIChzY2hlbWEvaW5kZXhlcy90cmlnZ2Vycy9STFMpLicsJ1BSICM5MCBwcm9wb3NlZCBQcm9kdWN0aW9uIGF1ZGl0IFNRTCBpcyBub3QgZXhlY3V0ZWQgYnkgdGhpcyBzY3JpcHQuJywnTm8gY2xhaW0gb2YgUHJvZHVjdGlvbiByZWxlYXNlIGFjY2VwdGFuY2UuJ10sY2hlY2tzOnJlc3VsdHN9OwogICAgaWYocmVwb3J0RmlsZSl7ZnMubWtkaXJTeW5jKHBhdGguZGlybmFtZShyZXBvcnRGaWxlKSx7cmVjdXJzaXZlOnRydWV9KTtmcy53cml0ZUZpbGVTeW5jKHJlcG9ydEZpbGUsSlNPTi5zdHJpbmdpZnkoc3VtbWFyeSxudWxsLDIpLCd1dGY4Jyk7fQogICAgY29uc29sZS5sb2coYFJFU1VMVDogJHtzdW1tYXJ5LnN0YXR1c30gKCR7c3VtbWFyeS5wYXNzZWR9IFBBU1MgLyAke3N1bW1hcnkuZmFpbGVkfSBGQUlMIC8gJHtzdW1tYXJ5LmJsb2NrZWR9IEJMT0NLRUQpYCk7CiAgICBjb25zb2xlLmxvZygnUmVwb3J0OiAnKyhyZXBvcnRGaWxlPydzYXZlZCB0byBsb2NhbCBEb2N1bWVudHMgZm9sZGVyJzonbm90IHdyaXR0ZW4nKSk7CiAgICAvLyBGYWlsIGNsb3NlZCBpZiBpbmNvbXBsZXRlIHJvbGUgY292ZXJhZ2U7IHRoZSBvcGVyYXRvciBtYXkgcmVwb3J0IHBhcnRpYWwgZXZpZGVuY2UuCiAgICBwcm9jZXNzLmV4aXRDb2RlPXN1bW1hcnkuc3RhdHVzPT09J1BBU1MnPzA6c3VtbWFyeS5zdGF0dXM9PT0nUEFSVElBTCc/MzoxOwogIH0KfSkoKTsK'))

      Stage 'Build configuration: PUBLIC TEST key only (no private credentials in npm/build)'
      if ($SmokeOnly) {
        $anon = 'local-fake-key-windows-smoke-no-cloud-access-1234567890'
        $testBuildUrl = 'http://127.0.0.1:54321'
        Write-Host 'SMOKE MODE: uses loopback-only placeholders; no TEST or Production login.'
      } else {
        Write-Host 'ONLY keys from the TEST Supabase project rtptybxugjhvpfjvcvgw.'
        $anon = Read-Private 'Enter TEST publishable/anon API key (PUBLIC key only)'
        Require ($anon.Length -gt 20) 'Missing TEST publishable/anon key.'
        $testBuildUrl = $testUrl
      }
      [Environment]::SetEnvironmentVariable('NEXT_PUBLIC_SUPABASE_URL',$testBuildUrl,'Process')
      [Environment]::SetEnvironmentVariable('NEXT_PUBLIC_SUPABASE_ANON_KEY',$anon,'Process')
      [Environment]::SetEnvironmentVariable('COWL_QA_ANON_KEY',$anon,'Process')
      $anon=$null

      Stage 'Fetch exact, pinned PR #93 source in separate worktree'
      & $git -C $RepoPath fetch --no-tags origin 'refs/pull/93/head'
      Require ($LASTEXITCODE -eq 0) 'Fetching PR #93 failed; no local branch has been changed.'
      $actual = [string]((& $git -C $RepoPath rev-parse FETCH_HEAD) -join '')
      Require ($actual.Trim() -eq $expectedSha) 'PR #93 SHA changed. Stop and re-review rather than silently testing a different version.'
      & $git -C $RepoPath worktree add --detach $worktree $expectedSha
      Require ($LASTEXITCODE -eq 0) 'Detached Git worktree creation failed.'
      $worktreeMade=$true
      [Environment]::SetEnvironmentVariable('COWL_QA_WORKTREE',$worktree,'Process')
      Write-Host ('PASS: Verified RC1 integration commit ' + $expectedSha.Substring(0,9))

      Stage 'Install exact source dependencies and local browser (no repo changes)'
      Push-Location $worktree
      try {
        & $npm ci --no-audit --no-fund
        Require ($LASTEXITCODE -eq 0) 'npm ci failed.'
        & $npm run build
        Require ($LASTEXITCODE -eq 0) 'PR #93 build or its tests failed.'
      } finally { Pop-Location }
      & $npm install --prefix $tools --no-audit --no-fund --no-save --package-lock=false 'playwright@1.55.0'
      Require ($LASTEXITCODE -eq 0) 'Playwright package installation failed.'
      $playwrightCli = Join-Path $tools 'node_modules\playwright\cli.js'
      $playwrightModule = Join-Path $tools 'node_modules\playwright\index.js'
      Require ((Test-Path -LiteralPath $playwrightCli) -and (Test-Path -LiteralPath $playwrightModule)) 'Playwright package not found.'
      & $node $playwrightCli install chromium
      Require ($LASTEXITCODE -eq 0) 'Chromium browser install failed.'
      [Environment]::SetEnvironmentVariable('COWL_QA_PLAYWRIGHT_PATH',$playwrightModule,'Process')

      if (-not $SmokeOnly) {
        Stage 'TEST-only PRIVATE credentials — after npm/install/build (never paste into chat)'
        Write-Host 'Sign-in activity in TEST updates Auth session and sign-in throttle metadata. No Registry CRUD.'
        $service = Read-Private 'Enter TEST service_role/secret API key (server runtime only)'
        $adminMail = Read-Host 'Enter TEST active Registry Administrator email'
        $adminPass = Read-Private 'Enter password for that TEST Registry Administrator'
        Require ($service.Length -gt 20 -and $adminMail.Contains('@') -and $adminPass.Length -gt 0) 'Required TEST credentials missing.'
        $optional=@(
          @('ORDINARY','ordinary signed-in non-admin'),
          @('COWL','COWL finance viewer'),
          @('CURIA','Curia finance viewer'),
          @('REVOKED','revoked Registry admin, if such an account exists')
        )
        foreach ($role in $optional) {
          $label=$role[0];$mail=Read-Host ('Optional TEST email for ' + $role[1] + ' (Enter to skip)')
          if (-not [string]::IsNullOrWhiteSpace($mail)) {
            Require ($mail.Contains('@')) 'Invalid TEST role email.'
            [Environment]::SetEnvironmentVariable('COWL_QA_'+$label+'_EMAIL',$mail,'Process')
            [Environment]::SetEnvironmentVariable('COWL_QA_'+$label+'_PASSWORD',(Read-Private ('Password for TEST '+$label)),'Process')
          }
        }
        [Environment]::SetEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY',$service,'Process')
        [Environment]::SetEnvironmentVariable('COWL_QA_SUPABASE_URL',$testUrl,'Process')
        [Environment]::SetEnvironmentVariable('COWL_QA_APP_URL','http://127.0.0.1:3399','Process')
        [Environment]::SetEnvironmentVariable('COWL_QA_REGISTRY_EMAIL',$adminMail.Trim(),'Process')
        [Environment]::SetEnvironmentVariable('COWL_QA_REGISTRY_PASSWORD',$adminPass,'Process')
        [Environment]::SetEnvironmentVariable('COWL_QA_REPORT',$reportFile,'Process')
        [Environment]::SetEnvironmentVariable('COWL_QA_COMMIT',$expectedSha,'Process')
        $rng=New-Object byte[] 48
        $gen=[Security.Cryptography.RandomNumberGenerator]::Create()
        try { $gen.GetBytes($rng) } finally { $gen.Dispose() }
        [Environment]::SetEnvironmentVariable('ADMIN_LOCKOUT_HMAC_SECRET',[Convert]::ToBase64String($rng),'Process')
        $service=$null;$adminPass=$null
      }


      Stage 'Start exact RC1 app on localhost only; connect to TEST only'
      $nextCli = [System.IO.Path]::Combine($worktree,'node_modules','next','dist','bin','next')
      Require (Test-Path -LiteralPath $nextCli) 'Next.js executable was not installed.'
      $quotedNextCli = ('"' + $nextCli + '"')
      $server = Start-Process -FilePath $node -WorkingDirectory $worktree `
        -ArgumentList @($quotedNextCli,'start','-p','3399','-H','127.0.0.1') `
        -RedirectStandardOutput $serverOut -RedirectStandardError $serverErr -PassThru -WindowStyle Hidden
      $up=$false
      for($i=0;$i -lt 50;$i++) {
        if ($server.HasExited) { break }
        try {
          $res=Invoke-WebRequest -Uri 'http://127.0.0.1:3399/admin' -UseBasicParsing -TimeoutSec 2
          if($res.StatusCode -eq 200) { $up=$true;break }
        } catch {}
        Start-Sleep -Seconds 1
      }
      Require $up 'Local app did not become ready on port 3399. Check local Next logs in temporary folder.'

      if ($SmokeOnly) {
        Stage 'Windows CI smoke: actual Chromium desktop/mobile and local Next.js'
        $smokeFile=Join-Path $tempRoot 'smoke.cjs'
        @'
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const playwrightPath=process.env.COWL_QA_PLAYWRIGHT_PATH;
  assert.ok(playwrightPath && fs.existsSync(playwrightPath),'Playwright installation missing');
  const {chromium}=require(playwrightPath);
  const browser=await chromium.launch({headless:true});
  try {
    for(const viewport of [{width:1280,height:800},{width:390,height:844}]) {
      const context=await browser.newContext({viewport});
      try {
        const page=await context.newPage();
        const response=await page.goto('http://127.0.0.1:3399/admin',{waitUntil:'domcontentloaded',timeout:45000});
        assert.equal(response?.status(),200,'Admin login HTTP status');
        await page.locator('input[type="email"]').first().waitFor({state:'visible',timeout:20000});
        await page.locator('input[type="password"]').first().waitFor({state:'visible',timeout:20000});
        console.log('PASS: Chromium rendered login on '+viewport.width+'px viewport');
      } finally {await context.close();}
    }
  } finally {await browser.close();}
})().catch(error=>{console.error('SMOKE FAILED:',error.message);process.exitCode=1;});
'@ | Set-Content -LiteralPath $smokeFile -Encoding UTF8
        & $node $smokeFile
        Require ($LASTEXITCODE -eq 0) 'Windows Chromium/Next smoke failed.'
        $exitCode=0
        Write-Host 'PASS: Windows CI startup and browser smoke (NO TEST credentials, no Auth claims).'
      } else {
        Stage 'Real GoTrue, PostgREST, zero-write Registry and Chromium acceptance'
        & $node $scriptFile
        $exitCode=$LASTEXITCODE
        if($exitCode -eq 0) {Write-Host 'PASS: Real TEST Auth + browser acceptance (all provided roles).'}
        elseif($exitCode -eq 3) {Write-Host 'PARTIAL: Runnable checks finished; required role identities missing.'}
        else {Write-Host 'FAIL: One or more runnable checks failed. Review sanitized JSON report.'}
        Write-Host ('Report: '+$reportFile)
      }
    } catch {
      Write-Host ('QA STOP ['+$script:stage+']: '+$_.Exception.Message)
      $exitCode=1
    } finally {
      Stage 'Cleanup local browser and worktree (never Production / TEST data)'
      if ($server -and -not $server.HasExited) {
        try { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue } catch {}
        Start-Sleep -Seconds 2
      }
      if ($worktreeMade) {
        try { & $git -C $RepoPath worktree remove --force $worktree 2>$null | Out-Null } catch {}
      }
      foreach($name in $names) { [Environment]::SetEnvironmentVariable($name,$null,'Process') }
      try { if(Test-Path $tempRoot) {Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue } } catch {}
      Write-Host ('FINAL: '+$(if($exitCode -eq 0){'PASS'}elseif($exitCode -eq 3){'PARTIAL'}else{'FAIL/BLOCKED'}))
      Write-Host 'LIMIT: TEST differs from Production; this does not apply PR #90 audit SQL or authorize PR #93 Production merge.'
      # Propagate real outcome to PowerShell, CI and the calling terminal.
      exit $exitCode
    }
}