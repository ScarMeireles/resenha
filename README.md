# Resenha

App desktop (não é site) para chamadas de voz, câmera, compartilhamento de tela e chat entre amigos.
Inspirado no Discord, mas bem menor: só amigos, grupos pequenos, sem servidores públicos, sem moderação.

**Regra de ouro: custo zero.** Tudo roda em planos gratuitos ou no próprio PC. Nada que gere cobrança entra no projeto.

## Objetivo do MVP

**Contas e amigos**
- Criar conta com **@ único** (3 a 20 caracteres: a-z, 0-9, `_` e `.`), nome, foto e banner opcionais (podem ser animados) e senha de 6 a 15 caracteres com maiúscula, minúscula e caractere especial. Sem e-mail.
- O app lembra o login por 30 dias, renovando a cada uso.
- Adicionar amigo pelo @. O outro precisa **aceitar o pedido**.
- Status: online, em chamada, offline.

**Grupos**
- Criar grupo e adicionar amigos.
- Cada grupo tem **um chat de texto** (com imagens) e **uma sala de voz**.

**Chamadas**
- Voz com boa qualidade (Opus, supressão de ruído e cancelamento de eco).
- Câmera ligar/desligar.
- Compartilhar tela (ou janela) em até 1080p/60fps, **com o áudio do PC** no Windows.
- Indicador de quem está falando, mute/unmute.
- **Ligação direta 1:1** entre amigos, sem precisar de grupo.

**Distribuição**
- Instalador `.exe` para mandar aos amigos.

Fora do MVP (talvez depois): vários canais por grupo, atualização automática, versão Linux/macOS.

## Visual

Mockups aprovados (estilo Discord, paleta própria grafite + laranja):
https://claude.ai/artifact/Gam7gRxXZjqXLii41on8Wf

## Arquitetura

```
                        ┌──────────────── VM gratuita (Oracle Cloud) ─────────────────┐
[App do amigo A] ──┐    │                                                             │
[App do amigo B] ──┼────┼─► LiveKit (SFU)     ← áudio/vídeo/tela, ao vivo, nada gravado│
[App do amigo C] ──┘    │      ▲ valida token                                          │
        │               │      │                                                      │
        └── HTTPS + ────┼─► API .NET ──► SQLite (contas, amigos, grupos, mensagens)    │
            SignalR     │       └──────► disco (fotos e imagens do chat)              │
                        └─────────────────────────────────────────────────────────────┘
```

| Peça | Tecnologia | Por quê |
|------|------------|---------|
| App desktop | **Electron + React + TypeScript** (Vite) | Usa o Chromium por dentro, que tem o melhor WebRTC que existe (o mesmo do Discord, que também é Electron). Captura de tela com áudio do sistema no Windows funciona de fábrica. |
| Mídia | **LiveKit** (SFU, self-host) | Cada pessoa manda o vídeo **uma vez** para o servidor e ele redistribui. Escala bem para 3–10 amigos e cuida de qualidade adaptativa. Self-host = sem limite de minutos. |
| API | **ASP.NET Core Minimal API** | Contas, amigos, grupos, chat, upload de imagens e emissão de tokens do LiveKit. Em C#. |
| Tempo real | **SignalR** (vem no ASP.NET) | Mensagens novas, status online, pedidos de amizade e "fulano está te ligando" chegam na hora. |
| Banco | **SQLite + EF Core** | Um arquivo só, sem servidor de banco para manter. Sobra para um grupo de amigos. |
| Arquivos | Disco da VM (imagens convertidas para WebP) | Grátis e sem serviço extra. |

### O que fica armazenado

- **Guardado:** contas (senha com hash, nunca em texto), amizades, grupos, mensagens, imagens enviadas e fotos de perfil.
- **Não guardado:** áudio, câmera e tela. Passam pelo LiveKit ao vivo e são descartados.
- **Logs:** com rotação automática e tamanho máximo fixo.

### Onde roda

1. **Desenvolvimento:** `docker compose up` local (LiveKit) + API rodando no PC. Sem conta nenhuma.
2. **Uso real:** VM **Always Free da Oracle Cloud**, região São Paulo, tudo em Docker.
   Limites do plano gratuito, conferidos na
   [página oficial](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm) em 20/11/2026:
   - 2 núcleos ARM e 12 GB de RAM
   - 200 GB de disco
   - 10 TB/mês de tráfego de saída
   - **Atenção:** a Oracle pode recolher VMs ociosas (CPU, rede e memória abaixo de 20% por 7 dias). Dimensionar a VM para o uso real no Passo 10.
   - Por estar tudo em Docker, dá para trocar de servidor sem reescrever nada se a Oracle mudar o plano.

## Estrutura planejada

```
resenha/
├─ apps/desktop/        # Electron + React (o app que os amigos instalam)
├─ server/api/          # ASP.NET Core: contas, amigos, grupos, chat, tokens
├─ server/tests/        # testes xUnit da API (unidade e integração)
├─ shared/              # regras de conta usadas pela API e pelo app (um teste garante que batem)
├─ infra/               # docker-compose e livekit.yaml
└─ docs/
```

## Roteiro

- [x] **Passo 1 — Fundação:** repositório, estrutura de pastas, LiveKit rodando no Docker local.
- [x] **Passo 2 — API base:** contas (@, nome, foto, senha), login e testes.
- [x] **Passo 3 — App Electron** com o layout dos mockups e telas de criar conta/entrar.
- [x] **Passo 4 — Amigos:** pedidos, aceitar/recusar, status online (SignalR).
- [x] **Passo 5 — Grupos e chat:** criar grupo, adicionar amigos, mensagens e imagens.
- [x] **Passo 6 — Voz** na sala do grupo e ligação 1:1.
- [ ] **Passo 7 — Câmera** e grade de vídeos.
- [ ] **Passo 8 — Compartilhar tela** com seletor de janela/monitor e áudio do sistema.
- [ ] **Passo 9 — Qualidade:** presets de bitrate, simulcast, supressão de ruído, seleção de microfone/fone.
- [ ] **Passo 10 — Hospedagem real** na Oracle e teste com um amigo pela internet.
- [ ] **Passo 11 — Instalador** `.exe` com electron-builder, publicado em Releases do GitHub (build local, sem CI).

## Pré-requisitos (já instalados nesta máquina)

Node 22, .NET 10 SDK, Docker, Git.

## Rodando o LiveKit local

```powershell
powershell -File infra/new-env.ps1   # só na primeira vez: gera infra/.env com chave e segredo aleatórios
docker compose -f infra/docker-compose.yml up -d
curl http://localhost:7880           # deve responder "OK"
```

Portas: `7880` (sinalização), `7881/tcp` e `7882/udp` (mídia). Para parar: `docker compose -f infra/docker-compose.yml down`.

## Rodando a API

```powershell
powershell -File server/api/new-dev-settings.ps1   # só na primeira vez: gera a chave de assinatura dos logins
dotnet run --project server/api                    # sobe em http://localhost:5280
dotnet test server                                 # roda todos os testes
```

O banco SQLite e as imagens ficam em `server/api/.data/`, que não vai para o Git.

A API precisa da chave e do segredo do LiveKit para assinar os tokens de voz. Em desenvolvimento ela lê sozinha o `infra/.env` (o mesmo do Docker); fora dele, use as variáveis `LIVEKIT_API_KEY` e `LIVEKIT_API_SECRET`. Sem eles a API não sobe. O LiveKit avisa a API de quem entrou ou saiu das salas pelo webhook `POST /livekit/webhook` (configurado em `infra/livekit.yaml`).

**Voz e ligações:** `POST /groups/{id}/voice/token` (entrar na sala do grupo), `GET /groups/{id}/voice` (quem está na sala), `POST /calls/{amigoId}` (ligar) e `/accept`, `/decline`, `/cancel`, `/hangup`. O áudio é Opus mono a 48 kbps com DTX (não gasta banda no silêncio) e RED (redundância contra perda de pacote), com cancelamento de eco, supressão de ruído e ganho automático do navegador.

| Rota | O que faz |
|------|-----------|
| `POST /auth/register` | Cria conta (`username`, `displayName`, `password`) e já devolve o token |
| `POST /auth/login` | Entra com @ e senha |
| `POST /auth/refresh` | Troca o token por um novo de 30 dias (o app chama ao abrir) |
| `GET /me` · `PATCH /me` | Ver a própria conta · trocar o nome |
| `PUT /me/avatar` · `DELETE /me/avatar` | Enviar (campo `file`) ou remover a foto. Vira WebP 256×256 |
| `PUT /me/banner` · `DELETE /me/banner` | Enviar ou remover o banner. Vira WebP 960×320 |
| `GET /users/{username}` | Perfil público de alguém |

Imagens: JPG, PNG, GIF ou WebP de até 10 MB e 4096 px de lado; GIFs/WebPs animados continuam animados (até 300 quadros). Cadastro e login aceitam 10 tentativas por minuto por IP.

## Rodando o app desktop

Com a API rodando (seção acima), em outro terminal:

```powershell
cd apps/desktop
npm install       # só na primeira vez
npm run dev       # abre o app com recarregamento ao vivo
npm test          # testes do app (Vitest)
npm run build     # confere os tipos e gera o app em apps/desktop/out
```

O app procura a API em `http://localhost:5280`. Para outro endereço, copie `apps/desktop/.env.example` para `.env` e troque `VITE_API_URL`.

- **Login lembrado:** o token fica em `%APPDATA%\resenha-desktop\session.bin`, criptografado com a proteção da conta do Windows. Copiado para outro PC ou usuário, não abre.
- **Segurança da janela:** a tela não acessa o Node nem o disco, só o que o preload expõe. No app compilado, uma política de conteúdo (CSP) só deixa carregar código do próprio app e falar com a API.
- Se o app não abrir dizendo que falta o Electron, rode `node node_modules/electron/install.js` dentro de `apps/desktop`.
