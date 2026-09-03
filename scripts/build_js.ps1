$env:FORCE_COLOR = "0"
$env:CONCURRENTLY_FORCE_COLOR = "false"

$psi = [System.Diagnostics.ProcessStartInfo]::new("cmd.exe", "/c npm run build:prod")
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.UseShellExecute = $false
$psi.WorkingDirectory = (Get-Location).Path

$proc = [System.Diagnostics.Process]::Start($psi)
$stdoutTask = $proc.StandardOutput.ReadToEndAsync()
$stderrTask = $proc.StandardError.ReadToEndAsync()
$proc.WaitForExit()
$exitCode = $proc.ExitCode

$lines = @()
$lines += $stdoutTask.Result -split "`r?`n"
$lines += $stderrTask.Result -split "`r?`n"
$lines = $lines | Where-Object { $_.Trim() -ne "" }

$lines | Select-Object -Last 20 | ForEach-Object { Write-Output $_ }
$color = if ($exitCode -eq 0) { "Green" } else { "Red" }
Write-Host "Exit Code: $exitCode" -ForegroundColor $color