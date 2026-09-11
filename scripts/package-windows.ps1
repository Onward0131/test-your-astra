#requires -Version 7.0
param(
    [Parameter(Mandatory=$true)][string]$RuntimeDirectory
)
$ErrorActionPreference='Stop'
if (-not $IsWindows -or $PSVersionTable.PSEdition -ne 'Core') { throw '请在Windows的PowerShell7中打包。' }
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtimeRoot=(Resolve-Path -LiteralPath $RuntimeDirectory).Path
foreach ($name in @('node.exe','LICENSE')) {
    if (-not (Test-Path -LiteralPath (Join-Path $runtimeRoot $name))) { throw ('运行时目录缺少'+$name) }
}
Push-Location -LiteralPath $projectRoot
try {
    node scripts/check.cjs
    if ($LASTEXITCODE -ne 0) { throw '发布检查失败' }
    $tracked=@(git ls-files)
    if ($LASTEXITCODE -ne 0 -or -not $tracked.Count) { throw '请先把源码加入Git索引' }
    $manifest=Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json
    $packageName='test-your-astra-'+$manifest.version+'-windows-x64'
    $dist=Join-Path $projectRoot 'dist'
    $stage=Join-Path $dist ($packageName+'-'+[Guid]::NewGuid().ToString('N'))
    $packageRoot=Join-Path $stage 'test-your-astra'
    New-Item -ItemType Directory -Path $packageRoot -Force | Out-Null
    foreach ($file in $tracked) {
        if ($file -match '(^|/)(settings\.json|portable-state\.json|records\.json|queue\.json)$|^(artifacts|archive|node_modules|runtime|dist|data)/') { throw ('禁止打包本机数据：'+$file) }
        if ($file.StartsWith('.github/')) { continue }
        $target=Join-Path $packageRoot $file
        New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination $target
    }
    New-Item -ItemType Directory -Path (Join-Path $packageRoot 'runtime') -Force | Out-Null
    foreach ($name in @('node.exe','LICENSE')) { Copy-Item -LiteralPath (Join-Path $runtimeRoot $name) -Destination (Join-Path $packageRoot 'runtime') }
    $bundleNode=Join-Path $packageRoot 'runtime/node.exe'
    $architecture=& $bundleNode -p 'process.platform+":"+process.arch'
    if ($architecture -ne 'win32:x64') { throw '运行时须为Windows x64版Node.js' }
    if (-not (Test-Path -LiteralPath 'node_modules')) { throw '请先运行npm ci' }
    Copy-Item -LiteralPath 'node_modules' -Destination $packageRoot -Recurse
    $entries=@(Get-ChildItem -LiteralPath $packageRoot -File -Recurse | ForEach-Object {
        [pscustomobject]@{
            path=[IO.Path]::GetRelativePath($packageRoot,$_.FullName).Replace('\','/')
            bytes=$_.Length
            sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        }
    })
    [pscustomobject]@{version=$manifest.version;files=$entries} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $packageRoot 'manifest.json') -Encoding utf8
    $zip=Join-Path $dist ($packageName+'.zip')
    if (Test-Path -LiteralPath $zip) { throw ('产物已存在，请先检查：'+$zip) }
    [IO.Compression.ZipFile]::CreateFromDirectory($stage,$zip,[IO.Compression.CompressionLevel]::Optimal,$false)
    $hash=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText(($zip+'.sha256'),$hash+'  '+[IO.Path]::GetFileName($zip)+[Environment]::NewLine)
    Write-Output ('已打包：'+$zip)
    Write-Output ('文件数量：'+$entries.Count+'；无Key、成绩库或后台计划')
} finally { Pop-Location }
