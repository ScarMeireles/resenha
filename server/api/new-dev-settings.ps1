# Gera server/api/appsettings.Development.json com uma chave de assinatura JWT aleatória.
# Uso: powershell -File server/api/new-dev-settings.ps1   (use -Force para gerar de novo; isso desloga todo mundo)
param([switch]$Force)

$ErrorActionPreference = 'Stop'
$path = Join-Path $PSScriptRoot 'appsettings.Development.json'

if ((Test-Path $path) -and -not $Force) {
    Write-Host "appsettings.Development.json já existe. Nada foi alterado (use -Force para gerar de novo)."
    exit 0
}

$bytes = New-Object byte[] 48
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$key = [Convert]::ToBase64String($bytes)   # 64 caracteres

$template = Get-Content (Join-Path $PSScriptRoot 'appsettings.Development.example.json') -Raw
$content = $template.Replace('troque-por-uma-chave-aleatoria-de-pelo-menos-32-caracteres', $key)

[System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding $false))
Write-Host "appsettings.Development.json criado com uma chave JWT nova."
