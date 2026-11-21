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

Gere o instalador com `npm run dist` em `apps/desktop` e mande para os amigos. O `npm run dev` continua usando o
servidor local.

## 4. Amigos

1. Instalar a Radmin VPN e **Rede → Entrar em uma rede existente**, com o nome e a senha que você passou.
2. Instalar o Resenha pelo instalador.
3. Deixar o Radmin ligado sempre que for usar o Resenha.

## Se algo não conectar

- No PC do amigo, `ping SEU-IP-DO-RADMIN` precisa responder. Se não responder, o problema está no Radmin (os dois
  estão na mesma rede e com o ícone verde?).
- Ping responde mas o app não conecta: confira se as regras existem (`Get-NetFirewallRule -Group Resenha`) e se o
  firewall do Windows não tem regra de **bloqueio** para o Docker (`com.docker.backend`). Bloqueio vence liberação.
- Voz conecta mas cai ou não sai som: a porta UDP 7892 está bloqueada. O LiveKit tenta pela TCP 7891, com qualidade
  um pouco pior.
- No Docker Desktop a API não enxerga o IP de cada amigo, então o limite de tentativas de login (30 por minuto) vale
  para o grupo todo. Num grupo pequeno isso não atrapalha.
