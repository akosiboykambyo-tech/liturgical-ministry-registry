<#
PR55 Windows local recovery prerequisite check.
READ-ONLY, OFFLINE: does not install WSL, enable virtualization, invoke
Docker images, download files, read backup contents, or contact Supabase.
Run in ordinary PowerShell (no admin rights required).
#>
[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
Write-Output "PR55 WINDOWS RESTORE READINESS (READ-ONLY)"
try {
  $os = Get-CimInstance Win32_OperatingSystem
  $machine = Get-CimInstance Win32_ComputerSystem
  $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
  $ramGB = [math]::Round($machine.TotalPhysicalMemory / 1GB, 1)
  Write-Output ("Windows: {0}, build {1}, {2}" -f $os.Caption, $os.BuildNumber, $os.OSArchitecture)
  Write-Output ("Physical RAM: {0} GiB (Docker Desktop requires 8 GB installed)" -f $ramGB)
  Write-Output ("Logical processors: {0}" -f $cpu.NumberOfLogicalProcessors)
  Write-Output ("Firmware virtualization enabled: {0} (False may also reflect hypervisor reporting)" -f $cpu.VirtualizationFirmwareEnabled)
  Write-Output ("SLAT exposed by CIM: {0} (not definitive with an active hypervisor)" -f $cpu.SecondLevelAddressTranslationExtensions)
  $disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3"
  foreach ($disk in $disks) {
    $free = [math]::Round($disk.FreeSpace / 1GB, 1)
    Write-Output ("Local drive {0}: {1} GiB free" -f $disk.DeviceID, $free)
  }
  $has40 = @($disks | Where-Object { $_.FreeSpace -ge 40GB }).Count -gt 0
  Write-Output ("40 GiB free on one local drive: {0}" -f $has40)
} catch {
  Write-Output "BLOCKED: Windows hardware/disk inspection unavailable (no host settings changed)"
}
$wsl = Get-Command wsl.exe -ErrorAction SilentlyContinue
if ($wsl) {
  try {
    $null = & $wsl.Source --status 2>&1
    Write-Output ("WSL --status: {0} (does not prove a running WSL2 distribution)" -f $(if($LASTEXITCODE -eq 0){"command succeeded"}else{"not ready"}))
  } catch {
    Write-Output "WSL --status: unavailable"
  }
} else {
  Write-Output "WSL: command unavailable"
}
$docker = Get-Command docker.exe -ErrorAction SilentlyContinue
Write-Output ("Docker CLI: {0}" -f $(if($docker){"present (daemon not tested)"}else{"not found"}))
Write-Output "NEXT: review RAM, free space and firmware virtualization before installing anything"
Write-Output "LIMIT: no database restore was attempted or certified"
