# Avvia il poker toolkit: importa le mani nuove, alza i due server, apre il
# browser, e alla chiusura spegne tutto.
#
# Il tool ha bisogno di due processi (API sulla 5181, interfaccia sulla 5180)
# perche' il database vive su Node e l'interfaccia in un browser. Questo script
# esiste solo per non doverli lanciare a mano ogni volta.
#
# Niente caratteri accentati nell'output: Windows PowerShell 5.1 li rompe.

$ErrorActionPreference = 'Stop'

# The console defaults to a legacy codepage, which turns the euro sign in the
# file names into mojibake.
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

# node:sqlite prints an experimental warning on every run. It is expected and
# documented, but PowerShell paints anything a native command sends to stderr
# as a red error, which makes a normal start look broken.
$env:NODE_NO_WARNINGS = '1'

$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $root

$apiPort = 5181
$webPort = 5180
$logDir = Join-Path $env:TEMP 'poker-toolkit'
$apiLog = Join-Path $logDir 'api.log'
$webLog = Join-Path $logDir 'web.log'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$started = @()

function Write-Step($number, $text) {
  Write-Host ''
  Write-Host "  [$number] $text" -ForegroundColor Cyan
}

function Get-PortOwners($port) {
  $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($null -eq $conns) { return @() }
  return @($conns | Select-Object -ExpandProperty OwningProcess -Unique)
}

function Stop-Tree($processId) {
  # /T because pnpm sits between cmd and node: killing only the parent orphans
  # the server. The output is suppressed: it is a wall of Italian success
  # messages nobody needs to read.
  & taskkill.exe /PID $processId /T /F 2>&1 | Out-Null
}

function Stop-Port($port) {
  foreach ($processId in Get-PortOwners $port) { Stop-Tree $processId }
  # Verify rather than assume: a port we failed to free is the difference
  # between "the server is starting" and "the server can never start", and the
  # two look identical from the outside.
  Start-Sleep -Milliseconds 300
  return ((Get-PortOwners $port).Count -eq 0)
}

function Show-Log($log, $lines = 12) {
  Write-Host ''
  foreach ($file in @($log, "$log.err")) {
    if (-not (Test-Path $file)) { continue }
    $text = Get-Content $file -Tail $lines
    if ($null -eq $text -or $text.Count -eq 0) { continue }
    Write-Host "  $file" -ForegroundColor DarkGray
    $text | ForEach-Object { Write-Host "        $_" -ForegroundColor DarkGray }
  }
}

function Start-Server($name, $command, $log) {
  # cmd /c so pnpm's shim resolves, and a process tree that can be killed as a
  # unit. The redirection is Start-Process's own rather than `> file` inside the
  # command string: PowerShell re-quotes an argument containing spaces, which
  # mangles quotes embedded in it, and cmd then dies before it ever opens the
  # log — leaving a stale log from a previous run as the only evidence, which
  # is worse than no evidence at all.
  Remove-Item $log, "$log.err" -Force -ErrorAction SilentlyContinue
  $process = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/c', $command `
    -PassThru -NoNewWindow `
    -RedirectStandardOutput $log `
    -RedirectStandardError "$log.err"
  $script:started += $process
  return $process
}

function Wait-Port($port, $process, $timeoutSeconds = 60) {
  # Asking the OS which ports are listening rather than dialling one address:
  # Express binds dual-stack, but Vite listens on ::1 only, so a connect to
  # 127.0.0.1 would report a healthy server as down.
  #
  # The process is watched alongside the port. A server that died on startup
  # never opens the port, and waiting the full minute for that is a minute
  # spent learning nothing: give up the moment it exits.
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if ((Get-PortOwners $port).Count -gt 0) { return $true }
    if ($null -ne $process -and $process.HasExited) { return $false }
    Start-Sleep -Milliseconds 300
  }
  return $false
}

function Stop-Everything {
  Write-Host ''
  Write-Host '  Chiudo...' -ForegroundColor DarkGray
  foreach ($process in $script:started) {
    if ($null -ne $process -and -not $process.HasExited) { Stop-Tree $process.Id }
  }
  Stop-Port $apiPort | Out-Null
  Stop-Port $webPort | Out-Null
  Write-Host '  Fatto.' -ForegroundColor DarkGray
  Write-Host ''
}

try {
  Write-Host ''
  Write-Host '  Poker toolkit' -ForegroundColor Green
  Write-Host '  =============' -ForegroundColor DarkGray

  if (-not (Test-Path (Join-Path $root 'node_modules'))) {
    Write-Step '1/4' 'Prima volta: installo le dipendenze (ci vuole un minuto)'
    & pnpm install
    if ($LASTEXITCODE -ne 0) { throw 'pnpm install non e'' andato a buon fine.' }
  }

  Write-Step '1/4' 'Importo le mani nuove'
  & pnpm ingest
  if ($LASTEXITCODE -ne 0) { throw 'L''importazione non e'' andata a buon fine.' }

  Write-Step '2/4' 'Libero le porte'
  foreach ($port in @($apiPort, $webPort)) {
    if (-not (Stop-Port $port)) {
      throw "La porta $port resta occupata da un altro programma e non riesco a liberarla."
    }
  }

  Write-Step '3/4' 'Avvio i server'

  # `serve`, not `dev:api`: the latter is `tsx watch`, which listens on stdin
  # for its interactive commands and exits when stdin closes. Launched detached
  # it therefore binds the port, prints its ready line, and dies a moment later
  # — which looks exactly like a server that started fine. Watch mode is for
  # editing the code, and this script is for using the app.
  $api = Start-Server 'api' 'pnpm --filter @poker/dashboard serve' $apiLog
  if (-not (Wait-Port $apiPort $api)) {
    Show-Log $apiLog
    throw "L'API non e'' partita sulla porta $apiPort."
  }
  Write-Host "        API pronta sulla $apiPort" -ForegroundColor DarkGray

  # `dev` runs both halves through concurrently; here the API is already up, so
  # this starts the front end alone. Using `dev` would bind 5181 twice and
  # concurrently would then kill Vite along with the failed API.
  $web = Start-Server 'web' 'pnpm --filter @poker/dashboard dev:web' $webLog
  if (-not (Wait-Port $webPort $web)) {
    Show-Log $webLog
    throw "L'interfaccia non e'' partita sulla porta $webPort."
  }
  Write-Host "        Interfaccia pronta sulla $webPort" -ForegroundColor DarkGray

  Write-Step '4/4' 'Apro il browser'
  Start-Process "http://localhost:$webPort"

  Write-Host ''
  Write-Host '  Dashboard aperta su http://localhost:5180' -ForegroundColor Green
  Write-Host ''
  Write-Host '  Lascia questa finestra aperta mentre la usi.' -ForegroundColor DarkGray
  Write-Host "  Log: $logDir" -ForegroundColor DarkGray
  Write-Host ''
  Read-Host '  Premi INVIO per chiudere tutto'
} catch {
  Write-Host ''
  Write-Host "  Errore: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host ''
  Read-Host '  Premi INVIO per uscire'
} finally {
  Stop-Everything
}
