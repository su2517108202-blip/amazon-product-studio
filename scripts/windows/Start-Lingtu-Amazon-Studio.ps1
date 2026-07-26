$ErrorActionPreference = "Stop"

$Repo = "F:\codex\amazon-product-studio"
$AppDataDir = Join-Path $env:APPDATA "LingtuAmazonStudio"
$LogDir = Join-Path $AppDataDir "logs"
$PgBin = "F:\codex-data\amazon-product-studio\.local\pgsql\pgsql\bin"
$PgCtl = Join-Path $PgBin "pg_ctl.exe"
$PgIsReady = Join-Path $PgBin "pg_isready.exe"
$Psql = Join-Path $PgBin "psql.exe"
$PgData = "F:\codex-data\amazon-product-studio\.local\postgres\data"
$PgLog = "F:\codex-data\amazon-product-studio\.local\postgres\server.log"
$Url = "http://localhost:3000"
$PidFile = Join-Path $AppDataDir "next.pid"
$OutLog = Join-Path $LogDir "next.out.log"
$ErrLog = Join-Path $LogDir "next.err.log"
$SetupLog = Join-Path $LogDir "setup.log"
$FailureLog = Join-Path $LogDir "failure.log"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-Log($Text) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Text"
  Add-Content -LiteralPath $SetupLog -Value $line -Encoding UTF8
}

function Read-DotEnv($Path) {
  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $values }
  foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
    if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') { continue }
    $key = $Matches[1]
    $value = $Matches[2].Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $values[$key] = $value
  }
  return $values
}

function Set-EnvFromDotEnv($Values) {
  foreach ($key in $Values.Keys) {
    [Environment]::SetEnvironmentVariable($key, [string]$Values[$key], "Process")
  }
}

function Hide-Secret($Text, $Secret) {
  if (-not $Secret) { return $Text }
  return ($Text -replace [regex]::Escape($Secret), "***")
}

function ConvertTo-MaskedDatabaseUrl($DatabaseUrl) {
  return ($DatabaseUrl -replace '(://[^:/@]+:)[^@]+(@)', '$1***$2')
}

function Resolve-DatabaseConfig($DatabaseUrl) {
  if (-not $DatabaseUrl) { throw "DATABASE_URL was not found in .env." }
  $uri = [System.Uri]::new($DatabaseUrl)
  if ($uri.Port -le 0) { throw "DATABASE_URL must include an explicit database port." }

  $user = "postgres"
  $password = ""
  if ($uri.UserInfo) {
    $parts = $uri.UserInfo.Split(":", 2)
    if ($parts.Count -ge 1 -and $parts[0]) { $user = [System.Uri]::UnescapeDataString($parts[0]) }
    if ($parts.Count -eq 2) { $password = [System.Uri]::UnescapeDataString($parts[1]) }
  }
  $database = $uri.AbsolutePath.TrimStart("/")
  if (-not $database) { throw "DATABASE_URL must include a database name." }

  return [pscustomobject]@{
    Url = $DatabaseUrl
    MaskedUrl = ConvertTo-MaskedDatabaseUrl $DatabaseUrl
    Host = $uri.Host
    Port = [int]$uri.Port
    Database = $database
    User = $user
    Password = $password
  }
}

function Test-TcpPort($HostName, $Port) {
  try {
    $client = [System.Net.Sockets.TcpClient]::new()
    $async = $client.BeginConnect($HostName, $Port, $null, $null)
    $ok = $async.AsyncWaitHandle.WaitOne(1000)
    if ($ok) { $client.EndConnect($async) }
    $client.Close()
    return $ok
  } catch {
    return $false
  }
}

function Test-Web() {
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Show-Error($Message) {
  try {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show($Message, "Lingtu Amazon Studio startup failed", "OK", "Error") | Out-Null
  } catch {
    Write-Host $Message
  }
}

function Invoke-CmdStep($Command, $FailMessage) {
  Write-Log $Command
  $stepOut = Join-Path $LogDir "step.out.log"
  $stepErr = Join-Path $LogDir "step.err.log"
  Remove-Item -LiteralPath $stepOut, $stepErr -Force -ErrorAction SilentlyContinue
  $process = Start-Process -FilePath $env:ComSpec -ArgumentList @("/c", $Command) -WorkingDirectory $Repo -RedirectStandardOutput $stepOut -RedirectStandardError $stepErr -Wait -PassThru -WindowStyle Hidden
  if (Test-Path $stepOut) { Get-Content -LiteralPath $stepOut -ErrorAction SilentlyContinue | Add-Content -LiteralPath $SetupLog -Encoding UTF8 }
  if (Test-Path $stepErr) { Get-Content -LiteralPath $stepErr -ErrorAction SilentlyContinue | Add-Content -LiteralPath $SetupLog -Encoding UTF8 }
  if ($process.ExitCode -ne 0) { throw $FailMessage }
}

function Invoke-PgCommand($Config, $DatabaseName, $Sql) {
  if ($Config.Password) {
    [Environment]::SetEnvironmentVariable("PGPASSWORD", $Config.Password, "Process")
  } else {
    [Environment]::SetEnvironmentVariable("PGPASSWORD", $null, "Process")
  }
  $output = & $Psql -h $Config.Host -p $Config.Port -U $Config.User -d $DatabaseName -tAc $Sql 2>&1
  return [pscustomobject]@{
    ExitCode = $LASTEXITCODE
    Output = (($output | Out-String).Trim())
  }
}

function Get-PostgresLogTail {
  if (Test-Path -LiteralPath $PgLog) {
    return (Get-Content -LiteralPath $PgLog -Tail 80 -ErrorAction SilentlyContinue | Out-String).Trim()
  }
  return "PostgreSQL log not found: $PgLog"
}

function Wait-DatabaseReady($Config) {
  $ready = $false
  for ($i = 1; $i -le 60; $i += 1) {
    $readyOutput = & $PgIsReady -h $Config.Host -p $Config.Port -U $Config.User -d $Config.Database 2>&1
    $readyText = Hide-Secret (($readyOutput | Out-String).Trim()) $Config.Password
    $readyExit = $LASTEXITCODE
    Write-Log "pg_isready attempt=$i exit=$readyExit status=$readyText"

    if ($readyExit -eq 0) {
      $select = Invoke-PgCommand $Config $Config.Database "SELECT 1"
      $selectText = Hide-Secret $select.Output $Config.Password
      Write-Log "psql SELECT 1 attempt=$i exit=$($select.ExitCode) result=$selectText"
      if ($select.ExitCode -eq 0 -and $select.Output.Trim() -eq "1") {
        $ready = $true
        break
      }
      if ($select.Output -notmatch "starting up|rejecting connections|the database system is starting up") {
        throw "Database answered, but SELECT 1 failed: $selectText"
      }
    }
    Start-Sleep -Seconds 1
  }

  if (-not $ready) {
    $tail = Get-PostgresLogTail
    Write-Log "postgres log tail after readiness timeout:`n$tail"
    throw "PostgreSQL was not ready within 60 seconds. See log: $PgLog"
  }
}

function Assert-ProjectPostgres($Config) {
  $dir = Invoke-PgCommand $Config $Config.Database "SHOW data_directory"
  $dirText = Hide-Secret $dir.Output $Config.Password
  Write-Log "data_directory exit=$($dir.ExitCode) value=$dirText"
  if ($dir.ExitCode -ne 0) { throw "Could not confirm PostgreSQL data_directory: $dirText" }

  $expected = [System.IO.Path]::GetFullPath($PgData).TrimEnd("\")
  $actual = [System.IO.Path]::GetFullPath($dir.Output.Trim()).TrimEnd("\")
  if ($actual -ne $expected) {
    throw "The configured database port is not running this project's PostgreSQL. expected=$expected actual=$actual"
  }
}

try {
  Set-Content -LiteralPath $SetupLog -Value "" -Encoding UTF8
  Remove-Item -LiteralPath $FailureLog -Force -ErrorAction SilentlyContinue
  Write-Log "start launcher"

  $envValues = Read-DotEnv (Join-Path $Repo ".env")
  Set-EnvFromDotEnv $envValues
  $db = Resolve-DatabaseConfig $env:DATABASE_URL
  Write-Log "resolved DATABASE_URL=$($db.MaskedUrl)"
  Write-Log "resolved host=$($db.Host)"
  Write-Log "resolved port=$($db.Port)"
  Write-Log "resolved database=$($db.Database)"
  Write-Log "resolved user=$($db.User)"
  Write-Log "PostgreSQL data directory=$PgData"

  if (-not (Test-Path $PgCtl)) { throw "PostgreSQL launcher not found: $PgCtl" }
  if (-not (Test-Path $PgIsReady)) { throw "pg_isready not found: $PgIsReady" }
  if (-not (Test-Path $Psql)) { throw "psql not found: $Psql" }

  if (Test-TcpPort $db.Host $db.Port) {
    Write-Log "target database port already has a listener; checking project PostgreSQL"
  } else {
    Write-Log "starting postgres"
    & $PgCtl start -D $PgData -l $PgLog -o "-p $($db.Port)"
    $pgExit = $LASTEXITCODE
    Write-Log "pg_ctl start exit=$pgExit"
    if ($pgExit -ne 0) {
      $tail = Get-PostgresLogTail
      Write-Log "postgres log tail after pg_ctl failure:`n$tail"
      throw "PostgreSQL failed to start. See log: $PgLog"
    }
  }

  Wait-DatabaseReady $db
  Assert-ProjectPostgres $db

  Set-Location $Repo
  $env:APP_MODE = if ($env:APP_MODE) { $env:APP_MODE } else { "local" }
  $env:NEXT_PUBLIC_APP_MODE = if ($env:NEXT_PUBLIC_APP_MODE) { $env:NEXT_PUBLIC_APP_MODE } else { "local" }
  $env:DEFAULT_LOCAL_USER_ID = if ($env:DEFAULT_LOCAL_USER_ID) { $env:DEFAULT_LOCAL_USER_ID } else { "local-user" }
  $env:NEXTAUTH_URL = if ($env:NEXTAUTH_URL) { $env:NEXTAUTH_URL } else { $Url }
  $env:WEBHOOK_URL = if ($env:WEBHOOK_URL) { $env:WEBHOOK_URL } else { $Url }

  if (Test-Web) {
    Write-Log "web already running"
    Start-Process $Url
    exit 0
  }

  if (Test-TcpPort "127.0.0.1" 3000) {
    throw "Port 3000 is already used by another program. Close it and double-click the launcher again."
  }

  Write-Log "generating prisma client"
  Invoke-CmdStep "npx prisma generate --config prisma.config.ts" "Prisma generate failed."

  Write-Log "applying migrations"
  Invoke-CmdStep "npx prisma migrate deploy --config prisma.config.ts" "Database migration failed."

  Write-Log "starting next dev"
  $process = Start-Process -FilePath "$env:ComSpec" -ArgumentList @("/c", "npm run dev -- -p 3000") -WorkingDirectory $Repo -RedirectStandardOutput $OutLog -RedirectStandardError $ErrLog -PassThru -WindowStyle Hidden
  $process.Id | Set-Content -LiteralPath $PidFile -Encoding ascii

  for ($i = 1; $i -le 90 -and -not (Test-Web); $i += 1) {
    Write-Log "web readiness attempt=$i"
    Start-Sleep -Seconds 1
  }
  if (-not (Test-Web)) { throw "Web app was not ready within 90 seconds. Logs: $LogDir" }

  Write-Log "ready"
  Start-Process $Url
} catch {
  $message = $_.Exception.Message
  Set-Content -LiteralPath $FailureLog -Value ($_.Exception.ToString()) -Encoding UTF8
  Show-Error ($message + "`n`nLogs: " + $LogDir)
  exit 1
} finally {
  [Environment]::SetEnvironmentVariable("PGPASSWORD", $null, "Process")
}
