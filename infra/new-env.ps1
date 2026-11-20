# Gera infra/.env com chave e segredo aleatórios para o LiveKit.
# Uso: powershell -File infra/new-env.ps1   (use -Force para sobrescrever um .env existente)
param([switch]$Force)

$ErrorActionPreference = 'Stop'
$envPath = Join-Path $PSScriptRoot '.env'

if ((Test-Path $envPath) -and -not $Force) {
    Write-Host "infra/.env já existe. Nada foi alterado (use -Force para gerar de novo)."
    exit 0
}

function New-RandomText([int]$bytes) {
    $buffer = New-Object byte[] $bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
    # Base64 "seguro para URL", sem caracteres que atrapalham em YAML/.env
    return [Convert]::ToBase64String($buffer).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

$key = 'API' + (New-RandomText 9)
$secret = New-RandomText 36   # ~48 caracteres (o LiveKit exige pelo menos 32)

$content = @"
# Gerado por infra/new-env.ps1. NUNCA versionar este arquivo.
LIVEKIT_API_KEY=$key
LIVEKIT_API_SECRET=$secret
LIVEKIT_NODE_IP=127.0.0.1
"@

# UTF-8 sem BOM e com LF, para o Docker Compose ler sem surpresas
[System.IO.File]::WriteAllText($envPath, $content.Replace("`r`n", "`n") + "`n", (New-Object System.Text.UTF8Encoding $false))
Write-Host "infra/.env criado com chave e segredo novos."
