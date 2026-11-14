$ErrorActionPreference = 'Stop'
$kubectl = (Get-Command kubectl.exe -ErrorAction Stop).Source
$password = Read-Host 'Initial administrator password (8–128 characters)' -AsSecureString
$pointer = [IntPtr]::Zero
try {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if ($plain.Length -lt 8 -or $plain.Length -gt 128) {
        throw 'Password must be 8–128 characters.'
    }
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $kubectl
    $start.Arguments = '--context=docker-desktop -n regchula exec -i deployment/regchula-api -- bun run apps/api/src/cli/staff-bootstrap.ts --stdin'
    $start.UseShellExecute = $false
    $start.RedirectStandardInput = $true
    $process = [Diagnostics.Process]::Start($start)
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes($plain)
        $process.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
        $process.StandardInput.Close()
        $process.WaitForExit()
        if ($process.ExitCode -ne 0) { throw "Administrator setup failed (exit $($process.ExitCode))." }
    } finally {
        $process.Dispose()
    }
} finally {
    if ($bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
    $plain = $null
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    $password.Dispose()
}
