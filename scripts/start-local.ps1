$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$PidFile = Join-Path $Root "tmp\lingtu-local.pid"
$OutLogFile = Join-Path $Root "tmp\lingtu-local.out.log"
$ErrLogFile = Join-Path $Root "tmp\lingtu-local.err.log"

function Say($Text) {
  Write-Host "[灵图] $Text"
}

Set-Location $Root
New-Item -ItemType Directory -Force -Path (Join-Path $Root "tmp") | Out-Null

Say "正在检查本地环境..."
node scripts/doctor-local.mjs

Say "正在生成 Prisma Client..."
npx prisma generate

Say "正在执行安全数据库迁移，不会 reset 或删除数据..."
npx prisma migrate deploy

$busy = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($busy) {
  throw "端口 3000 已被占用。请关闭占用该端口的程序，或先停止之前启动的灵图本地服务。"
}

Say "正在启动本地应用..."
if (-not $env:APP_MODE) { $env:APP_MODE = "local" }
if (-not $env:NEXT_PUBLIC_APP_MODE) { $env:NEXT_PUBLIC_APP_MODE = "local" }
$process = Start-Process -FilePath "npm.cmd" -ArgumentList "run","dev","--","-p","3000" -WorkingDirectory $Root -RedirectStandardOutput $OutLogFile -RedirectStandardError $ErrLogFile -PassThru -WindowStyle Hidden
$process.Id | Set-Content -LiteralPath $PidFile -Encoding ascii

$ready = $false
for ($i = 0; $i -lt 60; $i += 1) {
  try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -lt 500) {
      $ready = $true
      break
    }
  } catch {
    Start-Sleep -Seconds 1
  }
}

if (-not $ready) {
  throw "应用未能在 60 秒内启动。请查看 tmp\lingtu-local.out.log 和 tmp\lingtu-local.err.log。"
}

Say "启动成功，正在打开 http://localhost:3000"
Start-Process "http://localhost:3000"
Say "本地服务已启动。进程号已记录到 tmp\lingtu-local.pid。"
