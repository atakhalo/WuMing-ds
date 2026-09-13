# 启动本地静态服务器（ES Module 需要 http 协议；开发时禁用缓存）
# 用法: powershell -ExecutionPolicy Bypass -File z-TempForAI/serve.ps1 [-Port 8123]

param(
    [int]$Port = 8123
)

$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'serve.py'

$py = 'python'
if (Test-Path 'C:/3WorkTool/Python312/python.exe') {
    $py = 'C:/3WorkTool/Python312/python.exe'
}

& $py $script $Port
