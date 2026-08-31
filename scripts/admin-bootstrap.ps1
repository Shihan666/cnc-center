param(
    [switch]
    $DryRun
)

$ErrorActionPreference =
    "Stop"

Set-StrictMode `
    -Version 2.0

function Test-SecureStringEqual {
    param(
        [Parameter(Mandatory = $true)]
        [System.Security.SecureString]
        $Left,

        [Parameter(Mandatory = $true)]
        [System.Security.SecureString]
        $Right
    )

    if (
        $Left.Length -ne
        $Right.Length
    ) {
        return $false
    }

    $leftPointer =
        [IntPtr]::Zero

    $rightPointer =
        [IntPtr]::Zero

    try {
        $leftPointer =
            [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR(
                $Left
            )

        $rightPointer =
            [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR(
                $Right
            )

        $leftText =
            [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR(
                $leftPointer
            )

        $rightText =
            [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR(
                $rightPointer
            )

        return $leftText -ceq
            $rightText
    }
    finally {
        $leftText =
            $null

        $rightText =
            $null

        if (
            $leftPointer -ne
            [IntPtr]::Zero
        ) {
            [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR(
                $leftPointer
            )
        }

        if (
            $rightPointer -ne
            [IntPtr]::Zero
        ) {
            [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR(
                $rightPointer
            )
        }
    }
}

function ConvertFrom-SecureStringForPipe {
    param(
        [Parameter(Mandatory = $true)]
        [System.Security.SecureString]
        $Value
    )

    $pointer =
        [IntPtr]::Zero

    try {
        $pointer =
            [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR(
                $Value
            )

        return [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR(
            $pointer
        )
    }
    finally {
        if (
            $pointer -ne
            [IntPtr]::Zero
        ) {
            [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR(
                $pointer
            )
        }
    }
}

$projectRoot =
    [System.IO.Path]::GetFullPath(
        (
            Join-Path `
                $PSScriptRoot `
                ".."
        )
    )

$email =
    Read-Host `
        -Prompt "Admin email"

if (
    [string]::IsNullOrWhiteSpace(
        $email
    )
) {
    Write-Error `
        "Admin email is required."

    exit 1
}

$preConfirmation =
    Read-Host `
        -Prompt "Prepare first Admin creation? Type CREATE to continue"

if (
    $preConfirmation -cne
    "CREATE"
) {
    Write-Error `
        "Admin bootstrap cancelled."

    exit 1
}

$passwordSecure =
    $null

$passwordConfirmationSecure =
    $null

$password =
    $null

$child =
    $null

$childExitCode =
    1

try {
    $passwordSecure =
        Read-Host `
            -Prompt "Password" `
            -AsSecureString

    $passwordConfirmationSecure =
        Read-Host `
            -Prompt "Confirm password" `
            -AsSecureString

    if (
        $passwordSecure.Length -eq
        0
    ) {
        throw "Password is required."
    }

    if (
        -not (
            Test-SecureStringEqual `
                -Left $passwordSecure `
                -Right $passwordConfirmationSecure
        )
    ) {
        throw "Passwords do not match. No Admin was created."
    }

    Write-Host ""
    Write-Host "Password confirmation matched."
    Write-Host "Admin email: $email"
    Write-Host "No database write has occurred yet."

    if ($DryRun) {
        Write-Host ""
        Write-Host "DRY RUN: Node bootstrap will not be started."
        Write-Host "DRY RUN: No Admin was created."

        $childExitCode =
            0

        return
    }

    Write-Host ""
    Write-Host "FINAL WRITE GATE"
    Write-Host "The next confirmation can create the first Admin."

    $finalConfirmation =
        Read-Host `
            -Prompt "Type CREATE ADMIN NOW exactly"

    if (
        $finalConfirmation -cne
        "CREATE ADMIN NOW"
    ) {
        throw "Final Admin creation confirmation was not accepted."
    }

    $password =
        ConvertFrom-SecureStringForPipe `
            -Value $passwordSecure

    $startInfo =
        New-Object `
            System.Diagnostics.ProcessStartInfo

    $startInfo.FileName =
        "node"

    $startInfo.Arguments =
        "--env-file-if-exists=.env.local ./scripts/admin-bootstrap.mjs"

    $startInfo.WorkingDirectory =
        $projectRoot

    $startInfo.UseShellExecute =
        $false

    $startInfo.RedirectStandardInput =
        $true

    $startInfo.CreateNoWindow =
        $false

    $child =
        New-Object `
            System.Diagnostics.Process

    $child.StartInfo =
        $startInfo

    if (-not $child.Start()) {
        throw "Unable to start Admin bootstrap process."
    }

    $child.StandardInput.WriteLine(
        $email
    )

    $child.StandardInput.WriteLine(
        $password
    )

    $child.StandardInput.Close()

    $child.WaitForExit()

    $childExitCode =
        $child.ExitCode
}
catch {
    Write-Error `
        $_.Exception.Message

    $childExitCode =
        1
}
finally {
    $password =
        $null

    if (
        $passwordSecure -ne
        $null
    ) {
        $passwordSecure.Dispose()
    }

    if (
        $passwordConfirmationSecure -ne
        $null
    ) {
        $passwordConfirmationSecure.Dispose()
    }

    if (
        $child -ne
        $null
    ) {
        $child.Dispose()
    }
}

exit $childExitCode
