# Claudio como "serviço" do usuário: uma tarefa agendada que sobe ao iniciar sessão e reinicia o servidor se ele cair.
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\servico.ps1 <instalar|remover|iniciar|parar|status|rodar>
param([Parameter(Position = 0)][string]$Acao = "status")

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$Raiz = Split-Path -Parent $PSScriptRoot
$Tarefa = "Claudio"
$Dados = Join-Path $Raiz "dados"
$Logs = Join-Path $Dados "logs"
$ArquivoPid = Join-Path $Dados "servidor.pid"
$ArquivoParar = Join-Path $Dados "servidor.parar"
$Porta = if ($env:CLAUDIO_PORTA) { $env:CLAUDIO_PORTA } else { "3737" }
$Node = (Get-Command node).Source
$Tsx = Join-Path $Raiz "node_modules\tsx\dist\cli.mjs"
$Entrada = Join-Path $Raiz "server\src\index.ts"

New-Item -ItemType Directory -Force $Logs | Out-Null

function Processo-Vivo {
  if (-not (Test-Path $ArquivoPid)) { return $null }
  $id = Get-Content $ArquivoPid | Select-Object -First 1
  if (-not $id) { return $null }
  $p = Get-Process -Id ([int]$id) -ErrorAction SilentlyContinue
  if ($p -and $p.ProcessName -eq "node") { return $p } else { return $null }
}

function Rodar {
  # Laço de supervisão: chamado pela tarefa agendada, fica vivo enquanto o servidor deve rodar.
  if (Test-Path $ArquivoParar) { Remove-Item $ArquivoParar -Force }
  while ($true) {
    if (Test-Path $ArquivoParar) { Remove-Item $ArquivoParar -Force; break }
    Get-ChildItem $Logs -Filter "servidor-*.log" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-14) } | Remove-Item -Force -ErrorAction SilentlyContinue
    $carimbo = Get-Date -Format "yyyyMMdd-HHmmss"
    $log = Join-Path $Logs "servidor-$carimbo.log"
    $logErro = Join-Path $Logs "servidor-$carimbo.err.log"
    $p = Start-Process -FilePath $Node -ArgumentList @("`"$Tsx`"", "`"$Entrada`"") -WorkingDirectory $Raiz `
      -RedirectStandardOutput $log -RedirectStandardError $logErro -WindowStyle Hidden -PassThru
    $p.Id | Set-Content $ArquivoPid
    $p.WaitForExit()
    if (Test-Path $ArquivoParar) { Remove-Item $ArquivoParar -Force; break }
    Start-Sleep -Seconds 5
  }
  Remove-Item $ArquivoPid -Force -ErrorAction SilentlyContinue
}

function Instalar {
  $ps = (Get-Command powershell.exe).Source
  $acao = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSCommandPath`" rodar" -WorkingDirectory $Raiz
  # Ao iniciar sessão deste usuário; sem -User/-Password a tarefa roda com a sessão dele (o login do Claude Code é por usuário).
  $gatilho = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $config = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $Tarefa -Action $acao -Trigger $gatilho -Settings $config -RunLevel Limited -Force | Out-Null
  Write-Output "Tarefa '$Tarefa' instalada (sobe ao iniciar sessão)."
  Iniciar
}

function Remover {
  Parar
  Unregister-ScheduledTask -TaskName $Tarefa -Confirm:$false -ErrorAction SilentlyContinue
  Write-Output "Tarefa '$Tarefa' removida."
}

function Iniciar {
  if (Processo-Vivo) { Write-Output "Servidor já está rodando."; return }
  if (Test-Path $ArquivoParar) { Remove-Item $ArquivoParar -Force }
  Start-ScheduledTask -TaskName $Tarefa
  $tentativas = 0
  while ($tentativas -lt 60) {
    Start-Sleep -Seconds 1
    try { Invoke-RestMethod "http://127.0.0.1:$Porta/api/estado" -TimeoutSec 2 | Out-Null; Write-Output "Servidor no ar em http://127.0.0.1:$Porta"; return } catch {}
    $tentativas++
  }
  Write-Output "Tarefa disparada, mas o servidor ainda não respondeu. Veja os logs em $Logs"
}

function Parar {
  New-Item -ItemType File -Force $ArquivoParar | Out-Null
  $p = Processo-Vivo
  if ($p) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue; Write-Output "Servidor parado (pid $($p.Id))." } else { Write-Output "Servidor não estava rodando." }
  Stop-ScheduledTask -TaskName $Tarefa -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
  Remove-Item $ArquivoParar -Force -ErrorAction SilentlyContinue
  Remove-Item $ArquivoPid -Force -ErrorAction SilentlyContinue
}

function Status {
  $existe = $null -ne (Get-ScheduledTask -TaskName $Tarefa -ErrorAction SilentlyContinue)
  Write-Output ("Tarefa agendada: " + $(if ($existe) { "instalada" } else { "não instalada" }))
  $p = Processo-Vivo
  Write-Output ("Processo: " + $(if ($p) { "rodando (pid $($p.Id), desde $($p.StartTime))" } else { "parado" }))
  try {
    $e = Invoke-RestMethod "http://127.0.0.1:$Porta/api/estado" -TimeoutSec 3
    Write-Output "API: respondendo · escalonador: $($e.escalonador.ultima.texto) · rodando: $($e.rodando -join ', ')"
    if ($e.limites) { Write-Output "Limites: 5h $($e.limites.h5_pct)% · semana $($e.limites.d7_pct)%" }
  } catch { Write-Output "API: sem resposta em http://127.0.0.1:$Porta" }
}

switch ($Acao) {
  "instalar" { Instalar }
  "remover" { Remover }
  "iniciar" { Iniciar }
  "parar" { Parar }
  "status" { Status }
  "rodar" { Rodar }
  default { Write-Output "Ação desconhecida: $Acao (use instalar|remover|iniciar|parar|status|rodar)" }
}
