# Hospedagem do servidor (passo 10)

O servidor roda **no PC de quem hospeda**, com Docker Desktop: **API** (contas, chat, SignalR) e **LiveKit** (mídia).
Os amigos chegam até ele pela **Radmin VPN** (grátis), que cria uma rede virtual entre os PCs. Por isso funciona
mesmo quando o provedor usa CGNAT e não dá para abrir portas no roteador. Arquivos em [`deploy/`](../deploy).
Custo: zero.

```
app do amigo ──Radmin VPN──▶ PC de quem hospeda
                              ├─ TCP 8080       ─▶ API + SignalR
                              ├─ TCP 7890       ─▶ LiveKit (sinalização)
                              └─ UDP 7892 / TCP 7891 ─▶ LiveKit (áudio, vídeo e tela)
```

- O tráfego vai em HTTP/WS simples porque a Radmin VPN já criptografa tudo entre os PCs. Não precisa de domínio
  nem de certificado.
- **Privacidade:** todos ficam na mesma rede do Radmin, então os amigos conseguem ver o IP uns dos outros
  (o virtual do Radmin e, em conexão direta, o real). Isso foi aceito para um grupo fechado de amigos.
- Se o seu provedor te dá IP público e você prefere não usar VPN, dá para liberar as mesmas portas no roteador e
  usar o IP público (ou um nome grátis como o DuckDNS) no lugar do IP do Radmin.

## 1. Radmin VPN (quem hospeda)

1. Instale a Radmin VPN (radmin-vpn.com).
2. **Rede → Criar rede**, com nome e senha. Passe nome e senha só para os amigos.
3. O IP do seu PC na rede aparece no topo da janela (começa com `26.`). Ele é fixo para esta instalação.

## 2. Subir o servidor (quem hospeda, uma vez)

Com o Docker Desktop instalado e aberto:

```powershell
powershell -File deploy/new-env.ps1    # cria deploy/.env com o IP do Radmin e segredos aleatórios
```

Num PowerShell **como administrador**, libere as portas só na placa do Radmin (rede local e internet continuam fechadas):

```powershell
powershell -File deploy/firewall.ps1
```

Suba os contêineres (a primeira compilação leva alguns minutos):

```powershell
cd deploy
docker compose up -d --build
curl.exe http://localhost:8080/health    # deve responder "ok"
```

- **Ligar junto com o Windows:** no Docker Desktop, **Settings → General → Start Docker Desktop when you sign in**.
  Os contêineres têm `restart: unless-stopped`, então sobem sozinhos com o Docker. O Radmin já inicia com o Windows.
- **Atualizar** depois de mudar o código: `docker compose up -d --build` de novo, na pasta `deploy`. Os dados ficam.
- Banco e imagens ficam no volume Docker `resenha-servidor_api_data`. Faça backup dele de vez em quando.
- Logs: `docker compose logs -f api` (ou `livekit`).
- As portas são diferentes das do desenvolvimento (`infra/` + `dotnet run`), então dá para programar com o servidor ligado.

## 3. Instalador apontando para o servidor

Crie `apps/desktop/.env.production` (fora do Git, vale só para o `npm run dist`), trocando pelo seu IP do Radmin:

```
VITE_API_URL=http://SEU-IP-DO-RADMIN:8080
VITE_LIVEKIT_URL=ws://SEU-IP-DO-RADMIN:7890
```

Gere o instalador com `npm run dist` em `apps/desktop` (ou já publique com `npm run release:local`, seção 5) e mande
para os amigos. O `npm run dev` continua usando o servidor local. O endereço da API também vira o endereço das
atualizações automáticas (`/updates`).

## 4. Amigos

1. Instalar a Radmin VPN e **Rede → Entrar em uma rede existente**, com o nome e a senha que você passou.
2. Instalar o Resenha pelo instalador.
3. Deixar o Radmin ligado sempre que for usar o Resenha.

## 5. Publicar uma versão nova

Toda versão nova é **obrigatória**: quem estiver com versão mais velha não consegue usar o Resenha até atualizar.
Mas ninguém precisa fazer nada: ao abrir, o app baixa e instala a versão nova sozinho (tela "Atualizando…" com
barra de progresso) e reabre já atualizado. Login e preferências continuam.

**Primeira vez com esse sistema:** quem já tem o Resenha instalado de antes (versão sem atualização automática)
precisa instalar **uma vez** à mão o instalador gerado abaixo. O app antigo só mostra a mensagem "Há uma versão nova
do Resenha". Depois disso, todas as próximas versões chegam sozinhas.

Para publicar (no PC de quem hospeda, com o `apps/desktop/.env.production` do passo 3 e o servidor ligado):

```powershell
cd apps/desktop
npm run release:local                # 0.1.0 -> 0.1.1 (correção)
npm run release:local -- --minor     # 0.1.0 -> 0.2.0 (novidade)
```

O script (`scripts/publicar-versao.mjs`):

1. Sobe a `version` do `apps/desktop/package.json`.
2. Roda o `npm run dist` (leva alguns minutos). O instalador sai em `apps/desktop/release/`.
3. Copia o instalador, o `.blockmap` e, por último, o `latest.yml` para a pasta de atualizações do servidor
   (`deploy/updates`, fora do Git). Assim que o `latest.yml` chega, a API passa a cobrar a versão nova, sem
   reiniciar nada. Instaladores antigos da pasta são apagados (os `.blockmap` ficam: servem para baixar só o que mudou).

Depois, faça commit da versão nova (`package.json` e `package-lock.json`). Os instaladores nunca vão para o Git.

- **Outra pasta:** defina `RESENHA_UPDATES_DIR` no `deploy/.env` (o script e o Docker leem dali) e rode
  `docker compose up -d` de novo na pasta `deploy`. Também dá para passar `--destino <pasta>` no script.
- **Conferir:** `curl.exe http://localhost:8080/version` mostra a versão publicada (`null` = nenhuma, nada é cobrado).
- **Voltar atrás:** apagar o `latest.yml` da pasta de atualizações para de cobrar a versão. Não dá para "descer" a
  versão de quem já atualizou; para corrigir, publique uma versão ainda mais nova.
- **O que a API deixa passar mesmo com app velho:** `/updates`, `/version`, `/health`, as imagens (`/media`) e o
  aviso do LiveKit. Todo o resto responde **426** com a mensagem de atualizar. Chamada sem a versão (app de antes
  deste sistema, navegador, curl) conta como desatualizada.
- **Aviso do Windows:** o app não é assinado (certificado custa dinheiro). A atualização automática não passa pelo
  SmartScreen e confere o arquivo pelo código `sha512` do `latest.yml`, baixado do seu próprio servidor. O aviso
  "O Windows protegeu o computador" só aparece quando alguém roda o instalador à mão.
- Quem estiver com o app aberto na hora da publicação é levado para a atualização na próxima ação que falar com a API.

## Se algo não conectar

- No PC do amigo, `ping SEU-IP-DO-RADMIN` precisa responder. Se não responder, o problema está no Radmin (os dois
  estão na mesma rede e com o ícone verde?).
- Ping responde mas o app não conecta: confira se as regras existem (`Get-NetFirewallRule -Group Resenha`) e se o
  firewall do Windows não tem regra de **bloqueio** para o Docker (`com.docker.backend`). Bloqueio vence liberação.
- Voz conecta mas cai ou não sai som: a porta UDP 7892 está bloqueada. O LiveKit tenta pela TCP 7891, com qualidade
  um pouco pior.
- No Docker Desktop a API não enxerga o IP de cada amigo, então o limite de tentativas de login (30 por minuto) vale
  para o grupo todo. Num grupo pequeno isso não atrapalha.
