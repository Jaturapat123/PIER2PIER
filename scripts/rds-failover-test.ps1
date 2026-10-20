param(
    [Parameter(Mandatory = $true)][string]$BaseUrl,
    [string]$DbIdentifier = 'pier2pier-dev-mysql',
    [int]$MaxSeconds = 600
)

$ErrorActionPreference = 'Stop'
if ($DbIdentifier -ne 'pier2pier-dev-mysql') { throw 'อนุญาตให้ทดสอบเฉพาะ RDS ของ Pier2Pier' }

$resultDir = Join-Path $PSScriptRoot '..\results\task5'
New-Item -ItemType Directory -Path $resultDir -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$rawPath = Join-Path $resultDir "rds-failover-$stamp.csv"
$reportPath = Join-Path $resultDir "rds-failover-$stamp.txt"
$healthUrl = "$($BaseUrl.TrimEnd('/'))/health"

function Get-DbState {
    $json = aws rds describe-db-instances --db-instance-identifier $DbIdentifier --output json
    if ($LASTEXITCODE -ne 0) { throw 'อ่านสถานะ RDS ไม่สำเร็จ' }
    return ($json | ConvertFrom-Json).DBInstances[0]
}

function Probe([string]$phase) {
    $now = (Get-Date).ToUniversalTime().ToString('o')
    $code = 0
    $dbOk = $false
    $hostName = ''
    try {
        $res = Invoke-WebRequest -Uri $healthUrl -TimeoutSec 4 -SkipHttpErrorCheck
        $code = [int]$res.StatusCode
        $body = $res.Content | ConvertFrom-Json
        $dbOk = $code -eq 200 -and $body.db.ok -eq $true
        $hostName = [string]$body.instance.hostname
    } catch {
        # เก็บเป็น code 0 เพื่อแยก network/timeout ออกจาก HTTP error
    }
    $sample = [pscustomobject]@{ timeUtc = $now; phase = $phase; httpCode = $code; dbOk = $dbOk; host = $hostName }
    $sample | Export-Csv -Path $rawPath -Append -NoTypeInformation
    return $sample
}

$before = Get-DbState
if (-not $before.MultiAZ -or $before.DBInstanceStatus -ne 'available') {
    throw 'RDS ต้องเป็น Multi-AZ และ available ก่อนเริ่มทดสอบ'
}
$oldAz = $before.AvailabilityZone
Write-Output "ก่อน failover: primary=$oldAz, standby=$($before.SecondaryAvailabilityZone)"

$baselineUntil = (Get-Date).AddSeconds(10)
while ((Get-Date) -lt $baselineUntil) {
    $null = Probe 'before'
    Start-Sleep -Milliseconds 500
}

$triggeredAt = (Get-Date).ToUniversalTime()
aws rds reboot-db-instance --db-instance-identifier $DbIdentifier --force-failover --query '[DBInstance.DBInstanceIdentifier,DBInstance.DBInstanceStatus]' --output text
if ($LASTEXITCODE -ne 0) { throw 'สั่ง RDS failover ไม่สำเร็จ' }
Write-Output "สั่ง failover เมื่อ $($triggeredAt.ToString('o'))"

$deadline = (Get-Date).AddSeconds($MaxSeconds)
$lastStateCheck = [datetime]::MinValue
$newAz = $oldAz
$available = $false
$successAfterSwitch = 0
while ((Get-Date) -lt $deadline) {
    $sample = Probe 'during'
    if ((Get-Date) - $lastStateCheck -ge [timespan]::FromSeconds(5)) {
        $state = Get-DbState
        $newAz = $state.AvailabilityZone
        $available = $state.DBInstanceStatus -eq 'available'
        $lastStateCheck = Get-Date
        Write-Output "RDS $($state.DBInstanceStatus): primary=$newAz; HTTP=$($sample.httpCode)"
    }
    if ($available -and $newAz -ne $oldAz -and $sample.dbOk) {
        $successAfterSwitch++
    } else {
        $successAfterSwitch = 0
    }
    if ($successAfterSwitch -ge 10) { break }
    Start-Sleep -Milliseconds 500
}

$samples = @(Import-Csv $rawPath)
$failures = @($samples | Where-Object { $_.dbOk -ne 'True' })
$afterFailures = @($samples | Where-Object { $_.phase -eq 'during' -and $_.dbOk -ne 'True' })
$recovered = $null
if ($afterFailures.Count -gt 0) {
    $lastFailureTime = [datetime]$afterFailures[-1].timeUtc
    $recovered = $samples | Where-Object {
        $_.phase -eq 'during' -and $_.dbOk -eq 'True' -and [datetime]$_.timeUtc -gt $lastFailureTime
    } | Select-Object -First 1
}
$outageSeconds = if ($afterFailures.Count -gt 0 -and $recovered) {
    [math]::Round((([datetime]$recovered.timeUtc) - ([datetime]$afterFailures[0].timeUtc)).TotalSeconds, 1)
} elseif ($afterFailures.Count -eq 0) { 0 } else { 'ยังไม่ฟื้นตัวในช่วงที่วัด' }
$passed = $newAz -ne $oldAz -and $available -and $successAfterSwitch -ge 10

@(
    'ผลการทดสอบ RDS Multi-AZ failover',
    "เวลาเริ่ม (UTC): $($triggeredAt.ToString('o'))",
    "ปลายทาง: $healthUrl",
    "RDS: $DbIdentifier",
    "Primary AZ ก่อน: $oldAz",
    "Primary AZ หลัง: $newAz",
    "จำนวนคำขอทั้งหมด: $($samples.Count)",
    "คำขอที่ล้มเหลว: $($failures.Count)",
    "ช่วงสะดุดที่สังเกตได้ (วินาที): $outageSeconds",
    "สถานะ: $(if ($passed) { 'ผ่าน — primary เปลี่ยน AZ และ health ฟื้นต่อเนื่อง' } else { 'ไม่ผ่าน/ยังไม่ยืนยัน — ตรวจ raw และ RDS' })",
    "ไฟล์ข้อมูลดิบ: $rawPath"
) | Set-Content -Path $reportPath -Encoding utf8
Get-Content $reportPath
