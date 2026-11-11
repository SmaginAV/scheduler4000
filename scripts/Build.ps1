#Requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$PlatformExe,
    [Parameter(Mandatory)][string]$InfoBasePath,
    [string]$UserName = '',
    [System.Security.SecureString]$Password,
    [string]$OutputFile = (Join-Path $PSScriptRoot '../dist/scheduler4000.epf')
)

$ErrorActionPreference = 'Stop'
$platformFile = (Get-Item -LiteralPath $PlatformExe).FullName
$baseDirectory = (Get-Item -LiteralPath $InfoBasePath).FullName
if (-not (Test-Path -LiteralPath $platformFile -PathType Leaf)) {
    throw 'Не найден исполняемый файл платформы.'
}
if (-not (Test-Path -LiteralPath (Join-Path $baseDirectory '1Cv8.1CD') -PathType Leaf)) {
    throw 'Не найдена файловая информационная база 1Cv8.1CD.'
}
$sourceFile = (Get-Item -LiteralPath (Join-Path $PSScriptRoot '../EPF/scheduler4000.xml')).FullName
$outputPath = [IO.Path]::GetFullPath($OutputFile)
$logPath = "$outputPath.build.log"
if ((Test-Path -LiteralPath $outputPath) -or (Test-Path -LiteralPath $logPath)) {
    throw 'Результат или журнал уже существует. Укажите новое имя через -OutputFile.'
}
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($outputPath)) | Out-Null

$startInfo = [Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = $platformFile
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
$startInfo.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
foreach ($argument in @('DESIGNER', '/F', $baseDirectory)) {
    $startInfo.ArgumentList.Add($argument)
}
if ($UserName) {
    $startInfo.ArgumentList.Add('/N')
    $startInfo.ArgumentList.Add($UserName)
}
$passwordPointer = [IntPtr]::Zero
try {
    if ($Password) {
        $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Password)
        $startInfo.ArgumentList.Add('/P')
        $startInfo.ArgumentList.Add([Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer))
    }
    foreach ($argument in @('/LoadExternalDataProcessorOrReportFromFiles', $sourceFile,
            $outputPath, '/DisableStartupDialogs', '/Out', $logPath)) {
        $startInfo.ArgumentList.Add($argument)
    }
    $process = [Diagnostics.Process]::Start($startInfo)
    $startInfo.ArgumentList.Clear()
    try {
        $process.WaitForExit()
        $exitCode = $process.ExitCode
    }
    finally {
        $process.Dispose()
    }
}
finally {
    $startInfo.ArgumentList.Clear()
    if ($passwordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
}
if ($exitCode -ne 0 -or -not (Test-Path -LiteralPath $outputPath -PathType Leaf)) {
    throw "Сборка не выполнена (код $exitCode). Журнал: $logPath"
}
if ((Get-Item -LiteralPath $outputPath).Length -eq 0) {
    throw "Создан пустой файл. Журнал: $logPath"
}
Get-FileHash -LiteralPath $outputPath -Algorithm SHA256
