# Hospedagem do servidor (passo 10)

Um servidor só (VM grátis da Oracle) roda tudo com Docker: **Caddy** (HTTPS automático), **API** e **LiveKit** (mídia).
Arquivos em [`deploy/`](../deploy). Custo: zero, desde que a conta fique no plano **Always Free**.

```
app ──HTTPS/WSS 443──▶ Caddy ─┬─ /rtc*  ─▶ LiveKit (sinalização)
                              └─ resto  ─▶ API (+ SignalR)
app ──UDP 7882 / TCP 7881──────────────▶ LiveKit (áudio, vídeo e tela)
```

> **Nunca** clique em "Upgrade to Pay As You Go" na Oracle. É isso que garante que nada é cobrado.

## 1. Conta na Oracle Cloud

1. Acesse oracle.com/cloud/free → **Start for free**.
2. **Home Region: Brazil East (São Paulo)**. Não dá para trocar depois.
3. O cartão serve só para verificar a identidade (pode aparecer uma cobrança temporária, que é estornada).

## 2. Criar a VM

No console: **☰ → Compute → Instances → Create instance**.

| Campo | Valor |
|---|---|
| Name | `resenha` |
| Image | **Canonical Ubuntu 24.04** |
| Shape | **Ampere → VM.Standard.A1.Flex**, 2 OCPU e 12 GB (o grátis vai até 4 OCPU/24 GB). Precisa aparecer "Always Free-eligible". |
| Networking | criar VCN e sub-rede **pública**, com **IPv4 público** |
| SSH keys | **Generate a key pair for me → Save private key** |
| Boot volume | padrão (o grátis vai até 200 GB no total) |

- Salve a chave privada como `C:\Users\<você>\.ssh\resenha-oracle` (sem extensão) e restrinja o acesso
  (o SSH do Windows recusa chave que outros usuários conseguem ler):
  ```powershell
  icacls "$HOME\.ssh\resenha-oracle" /inheritance:r /grant:r "$($env:USERNAME):R"
  ```
- Se aparecer **"Out of capacity"**, tente outro *Availability Domain* ou tente mais tarde. O plano B é
  `VM.Standard.E2.1.Micro` (1 GB de RAM, também grátis), mas nele a compilação da API fica lenta.
- Anote o **IP público** da VM. Ele **não vai para o Git** nem para nenhum arquivo do projeto.

## 3. Liberar as portas na Oracle

**☰ → Networking → Virtual cloud networks →** a VCN → a sub-rede → **Default Security List → Add Ingress Rules**,
com origem `0.0.0.0/0`:

| Protocolo | Porta | Para quê |
|---|---|---|
| TCP | 80 | Let's Encrypt (validar o domínio) |
| TCP | 443 | API, chat e sinalização (HTTPS) |
| TCP | 7881 | mídia, quando a rede bloqueia UDP |
| UDP | 7882 | mídia (o caminho normal) |

O firewall de dentro do Ubuntu é liberado pelo `setup-vm.sh`.

## 4. Domínio grátis (DuckDNS)

O HTTPS precisa de um nome. Em duckdns.org, entre com GitHub ou Google, crie um subdomínio (ex.: `minharesenha`)
e coloque o IP público da VM. O endereço fica `minharesenha.duckdns.org`.

## 5. Subir o servidor

No seu PC, com tudo commitado:

```powershell
powershell -File deploy/publish.ps1 -Server ubuntu@minharesenha.duckdns.org
```

Na primeira vez ele só copia os arquivos. Entre na VM e prepare tudo (uma vez só):

```powershell
ssh -i $HOME\.ssh\resenha-oracle ubuntu@minharesenha.duckdns.org
bash ~/resenha/deploy/setup-vm.sh minharesenha.duckdns.org
exit
```

Entre de novo e suba os contêineres (a primeira compilação leva alguns minutos):

```bash
cd ~/resenha/deploy && docker compose up -d --build
curl https://minharesenha.duckdns.org/health    # deve responder "ok"
```

Depois disso, cada atualização é só rodar o `publish.ps1`.

- Os segredos (chaves do LiveKit e do login) foram gerados na VM, em `~/resenha/deploy/.env`, e só existem lá.
- Banco e imagens ficam no volume Docker `resenha_api_data`. Atualizar não apaga nada.
- Logs: `docker compose logs -f api` (ou `livekit`, `caddy`).

## 6. App apontando para o servidor

Crie `apps/desktop/.env.production` (fora do Git), que vale só para o `npm run dist`:

```
VITE_API_URL=https://minharesenha.duckdns.org
VITE_LIVEKIT_URL=wss://minharesenha.duckdns.org
```

Gere o instalador com `npm run dist` em `apps/desktop`. O `npm run dev` continua usando o servidor local.

## Cuidados

- A Oracle pode recuperar VMs grátis que ficam ociosas por 7 dias seguidos (uso muito baixo de CPU, rede e memória).
  Se acontecer, os dados do volume se perdem. Faça backup do volume de vez em quando.
- O IP de quem usa o app não chega aos amigos: toda a mídia passa pelo LiveKit, e a API não devolve IPs.
