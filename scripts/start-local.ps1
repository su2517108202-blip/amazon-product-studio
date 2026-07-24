$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$PidFile = Join-Path $Root "tmp\lingtu-local.pid"
$OutLogFile = Join-Path $Root "tmp\lingtu-local.out.log"
$ErrLogFile = Join-Path $Root "tmp\lingtu-local.err.log"

function Zh($Text) {
  return [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($Text))
}

function Say($Text) {
  Write-Host "[Lingtu] $Text"
}

Set-Location $Root
New-Item -ItemType Directory -Force -Path (Join-Path $Root "tmp") | Out-Null

Say (Zh "5q2j5Zyo5qOA5p+l5pys5Zyw546v5aKDLi4u")
node scripts/doctor-local.mjs

Say (Zh "5q2j5Zyo55Sf5oiQIFByaXNtYSBDbGllbnQuLi4=")
npx prisma generate

Say (Zh "5q2j5Zyo5omn6KGM5a6J5YWo5pWw5o2u5bqT6L+B56e777yM5LiN5LyaIHJlc2V0IOaIluWIoOmZpOaVsOaNri4uLg==")
npx prisma migrate deploy

$busy = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($busy) {
  throw (Zh "56uv5Y+jIDMwMDAg5bey6KKr5Y2g55So44CC6K+35YWz6Zet5Y2g55So6K+l56uv5Y+j55qE56iL5bqP77yM5oiW5YWI5YGc5q2i5LmL5YmN5ZCv5Yqo55qE54G15Zu+5pys5Zyw5pyN5Yqh44CC")
}

Say (Zh "5q2j5Zyo5ZCv5Yqo5pys5Zyw5bqU55SoLi4u")
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
  throw (Zh "5bqU55So5pyq6IO95ZyoIDYwIOenkuWGheWQr+WKqOOAguivt+afpeeciyB0bXBcbGluZ3R1LWxvY2FsLm91dC5sb2cg5ZKMIHRtcFxsaW5ndHUtbG9jYWwuZXJyLmxvZ+OAgg==")
}

Say (Zh "5ZCv5Yqo5oiQ5Yqf77yM5q2j5Zyo5omT5byAIGh0dHA6Ly9sb2NhbGhvc3Q6MzAwMA==")
Start-Process "http://localhost:3000"
Say (Zh "5pys5Zyw5pyN5Yqh5bey5ZCv5Yqo44CC6L+b56iL5Y+35bey6K6w5b2V5YiwIHRtcFxsaW5ndHUtbG9jYWwucGlk44CC")
