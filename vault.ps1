#requires -Version 7.0
param([ValidateSet('encrypt','decrypt')][string]$Mode)
$ErrorActionPreference = 'Stop'
$probeSecretText = [Console]::In.ReadToEnd()
try {
    if ($Mode -eq 'encrypt') {
        $probeSecure = ConvertTo-SecureString -String $probeSecretText -AsPlainText -Force
        [Console]::Out.Write((ConvertFrom-SecureString -SecureString $probeSecure))
    } else {
        $probeSecure = ConvertTo-SecureString -String $probeSecretText
        $probeCredential = [System.Management.Automation.PSCredential]::new('probe', $probeSecure)
        [Console]::Out.Write($probeCredential.GetNetworkCredential().Password)
    }
} catch {
    [Console]::Error.Write('本机密钥加密或解密失败。')
    exit 1
} finally { $probeSecretText = $null; $probeSecure = $null; $probeCredential = $null }
