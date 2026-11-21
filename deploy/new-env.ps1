# Gera deploy/.env com segredos aleatórios e o IP deste PC na rede do Radmin VPN.
# Uso: powershell -File deploy/new-env.ps1   (use -Force para gerar de novo; trocar o JWT desloga todo mundo)
param(
    [switch]$Force,
    [string]$Adapter = 'Radmin VPN'   # nome da placa de rede virtual que o Radmin cria
)

$ErrorActionPreference = 'Stop'
$envPath = Join-Path $PSScriptRoot '.env'

if ((Test-Path $envPath) -and -not $Force) {
    Write-Host "deploy/.env já existe. Nada foi alterado (use -Force para gerar de novo)."
    exit 0
}

$ip = Get-NetIPAddress -InterfaceAlias $Adapter -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty IPAddress
if (-not $ip) {
    throw "Não achei a placa '$Adapter'. O Radmin VPN está instalado e ligado? (Get-NetAdapter mostra os nomes)"
}

function New-RandomText([int]$bytes) {
    $buffer = New-Object byte[] $bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
    # Base64 "seguro para URL", sem caracteres que atrapalham em YAML/.env
    return [Convert]::ToBase64String($buffer).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

$content = @"
# Gerado por deploy/new-env.ps1. NUNCA versionar este arquivo.
RESENHA_HOST_IP=$ip
LIVEKIT_API_KEY=API$(New-RandomText 9)
LIVEKIT_API_SECRET=$(New-RandomText 36)
JWT_SIGNING_KEY=$(New-RandomText 48)
"@

# UTF-8 sem BOM e com LF, para o Docker Compose ler sem surpresas
[System.IO.File]::WriteAllText($envPath, $content.Replace("`r`n", "`n") + "`n", (New-Object System.Text.UTF8Encoding $false))
Write-Host "deploy/.env criado com o IP do Radmin ($ip) e segredos novos."
