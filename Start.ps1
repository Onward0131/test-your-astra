#requires -Version 7.0
param([ValidateRange(1024, 65535)][int]$Port = 4317)
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSEdition -ne 'Core') { throw '请在PowerShell 7中运行此脚本。' }
$probeNodePath = Join-Path $PSScriptRoot 'runtime/node.exe'
if (-not (Test-Path -LiteralPath $probeNodePath)) {
  $probeNode = Get-Command node -ErrorAction SilentlyContinue
  if (-not $probeNode) { throw '未找到Node.js。请使用含运行时的便携包，或安装Node.js 22或更高版本。' }
  $probeNodePath = $probeNode.Source
}
Write-Host '请在浏览器中打开下面显示的本机地址。关闭此终端即可停止服务。'
& $probeNodePath (Join-Path $PSScriptRoot 'probe.cjs') serve --port $Port
