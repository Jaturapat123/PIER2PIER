param(
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [string]$Url,
    [int]$WaitSeconds = 5
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ChromeCaptureNative {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr window);
}
'@

if ($Url) {
    $chromePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
    Start-Process -FilePath $chromePath -ArgumentList $Url
}

Start-Sleep -Seconds $WaitSeconds
$chrome = Get-Process chrome | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $chrome) { throw 'ไม่พบหน้าต่าง Chrome สำหรับเก็บหลักฐาน' }
if (-not [ChromeCaptureNative]::SetForegroundWindow($chrome.MainWindowHandle)) {
    throw 'นำหน้าต่าง Chrome มาด้านหน้าไม่สำเร็จ'
}
Start-Sleep -Seconds 1

$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = [System.Drawing.Bitmap]::new($bounds.Width, $bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
    $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    $directory = Split-Path -Parent $OutputPath
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
    $graphics.Dispose()
    $bitmap.Dispose()
}
Write-Output "บันทึกภาพ: $OutputPath"
