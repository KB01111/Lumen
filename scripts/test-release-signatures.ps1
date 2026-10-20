param([string]$EvidenceDirectory)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$verifier = Join-Path $PSScriptRoot 'sign-release.ps1'
$vendor = Join-Path $root 'src-tauri/binaries/windows-ai/createdump.exe'
function File-Sha256([string]$File) {
    $digest = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($digest.ComputeHash([IO.File]::ReadAllBytes($File))).Replace('-','') }
    finally { $digest.Dispose() }
}
$originalHash = File-Sha256 $vendor
$valid = & powershell.exe -NoProfile -File $verifier -Action Verify -Path $vendor
if ($LASTEXITCODE -ne 0) { throw 'Existing Microsoft helper signature must verify with the real SDK tool.' }
$report = $valid | ConvertFrom-Json
$policy = Get-Content -LiteralPath (Join-Path $root 'packaging/windows/retained-signers.json') -Raw | ConvertFrom-Json
if (-not @($policy | Where-Object { $_.prefix -eq 'windows-ai/' -and $_.thumbprint -ceq $report.thumbprint -and $_.subject -ceq $report.subject }).Count) { throw 'Real vendor signature differs from the explicit retained identity policy.' }
$winsearchReports = @{}
foreach ($name in @('concrt140.dll','msvcp140.dll','msvcp140_1.dll','msvcp140_2.dll','msvcp140_atomic_wait.dll','msvcp140_codecvt_ids.dll','vccorlib140.dll','vcruntime140.dll','vcruntime140_1.dll','vcruntime140_threads.dll')) {
    $installed = 'binaries/winsearch/' + $name
    $path = Join-Path $root ('src-tauri/' + $installed)
    $before = File-Sha256 $path
    $verified = & powershell.exe -NoProfile -File $verifier -Action Verify -Path $path
    if ($LASTEXITCODE -ne 0) { throw "Pinned WinSearch CRT signature did not verify: $name" }
    $signature = $verified | ConvertFrom-Json
    foreach ($signer in @($signature) + @($signature.signers)) {
        if (-not @($policy | Where-Object { $_.prefix -ceq $installed -and $_.thumbprint -ceq $signer.thumbprint -and $_.subject -ceq $signer.subject }).Count) { throw "Unapproved retained WinSearch signer: $name" }
    }
    if ((File-Sha256 $path) -cne $before) { throw 'Signature verification modified pinned WinSearch bytes.' }
    $winsearchReports[$name] = $signature
}
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('lumen-release-signature-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture | Out-Null
try {
    $copy = Join-Path $fixture 'tampered.exe'
    $bytes = [IO.File]::ReadAllBytes($vendor); $bytes[1024] = $bytes[1024] -bxor 1
    [IO.File]::WriteAllBytes($copy,$bytes)
    $ErrorActionPreference = 'Continue'
    $negative = & powershell.exe -NoProfile -File $verifier -Action Verify -Path $copy 2>&1
    $rejected = $LASTEXITCODE -ne 0
    $ErrorActionPreference = 'Stop'
    if (-not $rejected) { throw 'Tampered signed PE was accepted.' }
    if ((File-Sha256 $vendor) -cne $originalHash) { throw 'Source vendor bytes were changed.' }
    $result = [ordered]@{vendor=$report;winsearch=$winsearchReports;sourceSha256=$originalHash;tamperedRejected=$true;negativeOutput=($negative|Out-String);signingAttempted=$false}
    if ($EvidenceDirectory) {
        $directory = (Resolve-Path -LiteralPath $EvidenceDirectory).Path
        $result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $directory 'real-signature-negative.json')
    }
    $result | ConvertTo-Json -Depth 6
} finally {
    $resolved = [IO.Path]::GetFullPath($fixture)
    $temporary = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if (-not $resolved.StartsWith($temporary,[StringComparison]::OrdinalIgnoreCase) -or -not ([IO.Path]::GetFileName($resolved)).StartsWith('lumen-release-signature-')) { throw 'Unsafe signature fixture cleanup.' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
