# Libera no firewall do Windows as portas do servidor, SÓ na placa do Radmin VPN (rede local e internet continuam
# fechadas). Rode uma vez, num PowerShell aberto como administrador:
#   powershell -File deploy/firewall.ps1
# Para desfazer: Remove-NetFirewallRule -Group 'Resenha'
param([string]$Adapter = 'Radmin VPN')

$ErrorActionPreference = 'Stop'

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Abra o PowerShell como administrador para mexer no firewall.'
}
if (-not (Get-NetAdapter -Name $Adapter -ErrorAction SilentlyContinue)) {
    throw "Não achei a placa '$Adapter'. O Radmin VPN está instalado? (Get-NetAdapter mostra os nomes)"
}

Remove-NetFirewallRule -Group 'Resenha' -ErrorAction SilentlyContinue   # recria do zero, sem duplicar

$rules = @(
    @{ Name = 'Resenha API e chat (TCP 8080)';        Protocol = 'TCP'; Port = 8080 },
    @{ Name = 'Resenha LiveKit sinalização (TCP 7890)'; Protocol = 'TCP'; Port = 7890 },
    @{ Name = 'Resenha LiveKit mídia (TCP 7891)';     Protocol = 'TCP'; Port = 7891 },
    @{ Name = 'Resenha LiveKit mídia (UDP 7892)';     Protocol = 'UDP'; Port = 7892 }
)
foreach ($r in $rules) {
    New-NetFirewallRule -Group 'Resenha' -DisplayName $r.Name -Direction Inbound -Action Allow `
        -Protocol $r.Protocol -LocalPort $r.Port -InterfaceAlias $Adapter -Profile Any | Out-Null
}
Write-Host "Portas liberadas só na placa '$Adapter'."
