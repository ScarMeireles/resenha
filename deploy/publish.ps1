<#
  Envia o código do último commit para a VM e atualiza o servidor (passo 10).
  Só vai o que está commitado (git archive), então nada de .env, banco ou arquivo local.
  Uso:  powershell -File deploy/publish.ps1 -Server ubuntu@seu-nome.duckdns.org
  A chave SSH padrão é ~/.ssh/resenha-oracle (a que você baixou ao criar a VM).
#>
param(
    [Parameter(Mandatory)][string]$Server,
    [string]$Key = (Join-Path $HOME '.ssh\resenha-oracle')
)
$ErrorActionPreference = 'Stop'

$root = (git rev-parse --show-toplevel).Trim()
if (git -C $root status --porcelain -- server/api deploy) {
    Write-Warning 'Há mudanças não commitadas em server/api ou deploy; elas NÃO vão para o servidor.'
}

$tar = Join-Path ([IO.Path]::GetTempPath()) 'resenha-deploy.tar'
git -C $root archive --format=tar -o $tar HEAD server/api deploy
if ($LASTEXITCODE -ne 0) { throw 'git archive falhou' }

Write-Host '==> Enviando para a VM'
scp -i $Key $tar "${Server}:resenha-deploy.tar"
if ($LASTEXITCODE -ne 0) { throw 'scp falhou' }
Remove-Item $tar

Write-Host '==> Atualizando os contêineres'
ssh -i $Key $Server 'mkdir -p ~/resenha && tar -xf ~/resenha-deploy.tar -C ~/resenha && rm ~/resenha-deploy.tar && cd ~/resenha/deploy && if [ -f .env ]; then docker compose up -d --build && docker compose ps; else echo "Primeira vez: entre na VM e rode  bash ~/resenha/deploy/setup-vm.sh SEU-DOMINIO"; fi'
if ($LASTEXITCODE -ne 0) { throw 'atualização na VM falhou' }
