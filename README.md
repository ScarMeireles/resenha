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
- Compartilhar tela (ou janela) em até 1080p/60fps, **com o áudio do PC** no Windows (todo, ou todo menos os apps que você marcar).
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
                        ┌────────── PC de quem hospeda (Docker Desktop) ──────────────┐
[App do amigo A] ──┐    │                                                             │
[App do amigo B] ──┼────┼─► LiveKit (SFU)     ← áudio/vídeo/tela, ao vivo, nada gravado│
[App do amigo C] ──┘    │      ▲ valida token                                          │
        │               │      │                                                      │
        └── HTTP + ─────┼─► API .NET ──► SQLite (contas, amigos, grupos, mensagens)    │
            SignalR     │       └──────► disco (fotos e imagens do chat)              │
                        └─────────────────────────────────────────────────────────────┘
   (os apps chegam ao PC pela rede virtual da Radmin VPN, que já criptografa o tráfego)
```

| Peça | Tecnologia | Por quê |
|------|------------|---------|
| App desktop | **Electron + React + TypeScript** (Vite) | Usa o Chromium por dentro, que tem o melhor WebRTC que existe (o mesmo do Discord, que também é Electron). Captura de tela com áudio do sistema no Windows funciona de fábrica. |
| Mídia | **LiveKit** (SFU, self-host) | Cada pessoa manda o vídeo **uma vez** para o servidor e ele redistribui. Escala bem para 3–10 amigos e cuida de qualidade adaptativa. Self-host = sem limite de minutos. |
| API | **ASP.NET Core Minimal API** | Contas, amigos, grupos, chat, upload de imagens e emissão de tokens do LiveKit. Em C#. |
| Tempo real | **SignalR** (vem no ASP.NET) | Mensagens novas, status online, pedidos de amizade e "fulano está te ligando" chegam na hora. |
| Banco | **SQLite + EF Core** | Um arquivo só, sem servidor de banco para manter. Sobra para um grupo de amigos. |
| Arquivos | Disco do servidor (imagens convertidas para WebP) | Grátis e sem serviço extra. |

### O que fica armazenado

- **Guardado:** contas (senha com hash, nunca em texto), amizades, grupos, mensagens, imagens enviadas e fotos de perfil.
- **Não guardado:** áudio, câmera e tela. Passam pelo LiveKit ao vivo e são descartados.
- **Logs:** com rotação automática e tamanho máximo fixo.

### Onde roda

1. **Desenvolvimento:** `docker compose up` local (LiveKit) + API rodando no PC. Sem conta nenhuma.
2. **Uso real:** o PC de quem hospeda, tudo no Docker Desktop. **Os amigos conectam por VPN** (usamos a
   Radmin VPN, que é grátis), o que funciona mesmo quando o provedor usa CGNAT. Quem clonar pode usar outra VPN,
   ou liberar as portas no roteador se tiver IP público. Guia em [docs/HOSPEDAGEM.md](docs/HOSPEDAGEM.md).
   - Na mesma rede da VPN, os amigos podem ver o IP uns dos outros. Isso é aceito porque o grupo é fechado.
   - Por estar tudo em Docker, dá para levar o servidor para outra máquina sem reescrever nada.

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
- [x] **Passo 7 — Câmera** e grade de vídeos.
- [x] **Passo 8 — Compartilhar tela** com seletor de janela/monitor e áudio do sistema.
- [x] **Passo 9 — Qualidade:** presets de bitrate, simulcast, supressão de ruído, seleção de microfone/fone.
- [ ] **Passo 10 — Hospedagem real** no PC de quem hospeda, com os amigos pela Radmin VPN, e teste com um amigo. Arquivos prontos em `deploy/`; guia em [docs/HOSPEDAGEM.md](docs/HOSPEDAGEM.md).
- [ ] **Passo 11 — Instalador** `.exe` com electron-builder, publicado em Releases do GitHub (build local, sem CI). O instalador já sai com `npm run dist`; falta publicar em Releases, o que depende do passo 10 (endereços reais do servidor) e de um push autorizado.

## Pré-requisitos (já instalados nesta máquina)

Node 22, .NET 10 SDK, Docker, Git.

## Clonou o projeto?

Este repositório tem só o código. Não vem banco, chave, segredo nem dado de ninguém. Você hospeda o seu próprio servidor:
gere o seu `infra/.env` (`infra/new-env.ps1`) e o seu `server/api/appsettings.Development.json` (a partir do `.example`).
O banco SQLite é criado vazio na primeira execução da API.

Ative a verificação de segredos (uma vez por clone):

```powershell
git config core.hooksPath .githooks
```

Ela roda `scripts/check-secrets.mjs` antes de cada commit e, antes de cada push, também confere o histórico inteiro.
O commit é bloqueado se aparecer `.env`, banco, chave privada, IP público ou o valor real de algum segredo local.

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

**Status e chamadas perdidas:** clicar no próprio avatar (rodapé da barra lateral) escolhe Online, Ausente ou Offline (`GET`/`PUT /me/status`). "Offline" é invisível: os outros veem offline, mas o app segue conectado e as ligações tocam. O status escolhido não vai no `UserDto`, para ninguém descobrir quem está invisível. Dá para ligar para quem aparece offline; se o app da pessoa estiver fechado, quem liga vê "Fulano não está disponível" e ela recebe um aviso de chamada perdida ao entrar (`GET`/`DELETE /calls/missed`).

**Mensagens diretas (só API por enquanto; a tela vem depois):** conversa 1:1 entre amigos, com as mesmas regras do chat de grupo (texto até 2000 caracteres, até 4 imagens, cada um apaga a própria mensagem, que vira "mensagem apagada"). Só amigos abrem conversa e enviam. Se a amizade acabar, o histórico continua visível, só para leitura (`canSend: false`), até voltarem a ser amigos. As mensagens ficam na mesma tabela do chat de grupo, ligadas a uma conversa (`DirectConversations`, uma por par de pessoas). Rotas: `GET /dms` (conversas com mensagem, mais recente primeiro, com a última mensagem), `POST /dms` (`{ userId }`: abre ou devolve a conversa com o amigo), `GET /dms/{id}`, `GET /dms/{id}/messages?before=&limit=` (paginação igual à do grupo), `POST /dms/{id}/messages` (multipart `text` + `images`) e `DELETE /dms/{id}/messages/{messageId}`. Quem não participa recebe 404. Tempo real: `directMessageCreated` (a mensagem) e `directMessageDeleted` (`{ conversationId, messageId }`), só para os dois da conversa.

**Trocar o próprio @:** `PUT /me/username` (`{ username }`), livre e sem limite. Valida igual ao cadastro, responde 409 se o @ estiver em uso e o antigo fica livre na hora. Devolve um token novo com o @ atualizado (o antigo continua valendo, porque a sessão é pelo Id da conta). Amigos, grupos e mensagens são ligados ao Id, então nada se perde.

**Câmera:** botão na barra da chamada; o vídeo aparece no lugar do avatar (o seu, espelhado). Captura em 720p 30 fps (~1,7 Mbps) com simulcast em 180p e 360p: o LiveKit manda a camada do tamanho em que cada um vê o vídeo (`adaptiveStream`) e para de enviar camadas que ninguém está vendo (`dynacast`). Codec VP8, leve na CPU. Ajustes finos no passo 9.

**Compartilhar tela:** botão de monitor na barra abre o seletor do próprio app (abas Telas e Janelas, com miniaturas; a janela do Resenha não aparece). O main do Electron guarda a escolha por 15 s e entrega exatamente essa fonte quando o Chromium pede a captura (`setDisplayMediaRequestHandler`). Envia 1080p 30 fps (até ~5 Mbps) em VP8 com `contentHint: 'motion'`: com rede ruim cai a resolução antes de travar o movimento, bom para jogo e vídeo. A tela vira o palco e as pessoas ficam numa faixa embaixo; quem assiste pequeno ou com rede fraca recebe uma camada menor (simulcast). O som tem três opções (a última escolha fica salva):
- **Sem áudio** (o padrão).
- **Todo o áudio do PC:** o `loopback` do Electron pega o som do sistema inteiro, inclusive as vozes da chamada. Quem está na chamada ouve a própria voz de volta, mesmo que você use fone.
- **Todo o áudio, menos:** uma lista com o Resenha (marcado por padrão, evita o eco) e os apps que estão tocando som (Discord, Spotify...). Quem captura é o ajudante `resenha-audio.exe` (`apps/audio-helper`, em C#), que usa a API de captura por processo do Windows 10 2004+. O Windows só exclui um processo por captura. Com só o Resenha marcado, basta uma captura "tudo menos o Resenha". Com mais apps marcados, o ajudante captura um a um os apps que ficam e mistura o som, e a lista é conferida a cada 2 s. O PCM (float, estéreo, 48 kHz) vai pelo stdout até o main, que repassa para a janela, onde um AudioWorklet monta a faixa publicada no LiveKit.

O som da tela sai em Opus **estéreo** (jogo, filme e música usam os dois lados) a 64, 96 ou 128 kbps (Economia, Normal e Alta). DTX fica desligado, porque ele corta trechos baixos e em música dá falhas nos fade-outs. RED também fica desligado, porque a redundância dobraria um fluxo que já é grande.

| Rota | O que faz |
|------|-----------|
| `POST /auth/register` | Cria conta (`username`, `displayName`, `password`) e já devolve o token |
| `POST /auth/login` | Entra com @ e senha |
| `POST /auth/refresh` | Troca o token por um novo de 30 dias (o app chama ao abrir) |
| `GET /me` · `PATCH /me` | Ver a própria conta · trocar o nome |
| `PUT /me/avatar` · `DELETE /me/avatar` | Enviar (campo `file`) ou remover a foto. Vira WebP 256×256 |
| `PUT /me/banner` · `DELETE /me/banner` | Enviar ou remover o banner. Vira WebP 960×320 |
| `PUT /me/username` | Trocar o próprio @ (`username`). Devolve token novo e a conta |
| `GET /users/{username}` | Perfil público de alguém |
| `GET /dms` · `POST /dms` | Minhas conversas diretas · abrir a conversa com um amigo (`userId`) |
| `GET /dms/{id}/messages` · `POST /dms/{id}/messages` · `DELETE /dms/{id}/messages/{messageId}` | Ler (paginado), enviar e apagar mensagens da DM |

Imagens: JPG, PNG, GIF ou WebP de até 10 MB e 4096 px de lado; GIFs/WebPs animados continuam animados (até 300 quadros). Cadastro e login aceitam 10 tentativas por minuto por IP.

## Rodando o app desktop

Com a API rodando (seção acima), em outro terminal:

```powershell
cd apps/desktop
npm install       # só na primeira vez
npm run build:audio  # só na primeira vez (e quando mudar apps/audio-helper): gera resources/audio/resenha-audio.exe
npm run dev       # abre o app com recarregamento ao vivo
npm test          # testes do app (Vitest)
npm run build     # confere os tipos e gera o app em apps/desktop/out
```

O app procura a API em `http://localhost:5280`. Para outro endereço, copie `apps/desktop/.env.example` para `.env` e troque `VITE_API_URL` e, se o LiveKit não estiver em `ws://localhost:7880`, `VITE_LIVEKIT_URL` (igual ao `LiveKit:Url` da API; a política de segurança do app empacotado só deixa conectar nesses dois endereços).

- **Login lembrado:** o token fica em `%APPDATA%\resenha-desktop\session.bin`, criptografado com a proteção da conta do Windows. Copiado para outro PC ou usuário, não abre.
- **Segurança da janela:** a tela não acessa o Node nem o disco, só o que o preload expõe. No app compilado, uma política de conteúdo (CSP) só deixa carregar código do próprio app e falar com a API.
- Se o app não abrir dizendo que falta o Electron, rode `node node_modules/electron/install.js` dentro de `apps/desktop`.
- **Ajudante de áudio:** o `build:audio` precisa do SDK do .NET 10 (o mesmo da API). Ele gera um `.exe` único de ~36 MB, com o runtime junto, então quem instala o app não precisa ter o .NET. Testes: `dotnet test apps/audio-helper/ResenhaAudio.slnx`. Sem o `.exe`, a opção "Todo o áudio, menos" avisa que não deu para capturar e a tela segue sem som.

### Gerando o instalador

```powershell
cd apps/desktop
npm run dist      # typecheck + build + ajudante de áudio + instalador (precisa do SDK do .NET 10)
```

Sai em `apps/desktop/release/Resenha-Setup-<versão>.exe` (~146 MB, quase tudo Electron e o ajudante de áudio; a pasta `release/` fica fora do Git). A configuração está em `apps/desktop/electron-builder.ts` (TypeScript para o endereço das atualizações sair do mesmo `VITE_API_URL` do app). Além do `.exe`, saem `latest.yml` e `.blockmap`, usados pela atualização automática.

- **Atualização automática e obrigatória:** toda versão nova publicada no servidor é obrigatória. Ao abrir, o app confere `<VITE_API_URL>/updates/latest.yml`; se houver versão mais nova, mostra só a tela "Atualizando…" com o progresso, baixa, instala em silêncio e reabre. A API recusa (426) app com versão mais velha que a publicada, e isso também dispara a atualização. Para publicar: `npm run release:local` (sobe a versão, gera o instalador e copia para a pasta de atualizações do servidor). Passo a passo em [docs/HOSPEDAGEM.md](docs/HOSPEDAGEM.md#5-publicar-uma-versão-nova). Em `npm run dev` o app não se atualiza.
- **Instalar por cima à mão** também funciona: o instalador novo reconhece a instalação existente (mesmo `appId`), usa a mesma pasta e mantém login e preferências.
- **Instalação:** assistente em que dá para escolher a pasta; por padrão é só para o usuário atual e sem pedir administrador (só pede se a pasta escolhida exigir). A pasta sugerida é `%LOCALAPPDATA%\Programs\resenha-desktop`, com atalhos na Área de Trabalho e no Menu Iniciar. Desinstala pelo "Adicionar ou remover programas" e mantém o login lembrado e as preferências (`%APPDATA%\resenha-desktop`, a mesma pasta do modo de desenvolvimento).
- **Endereços do servidor:** `VITE_API_URL` e `VITE_LIVEKIT_URL` ficam gravados no app na hora do build. Para um instalador que os amigos vão usar, gere com o `.env` apontando para o seu servidor (`https://` e `wss://`, passo 10). Sem `.env`, o instalador só funciona com a API e o LiveKit na própria máquina.
- **Aviso do Windows:** o instalador não é assinado (o certificado custa dinheiro), então o SmartScreen mostra "O Windows protegeu o computador" na primeira vez. É só clicar em "Mais informações" → "Executar assim mesmo".
- **Ícone:** `apps/desktop/build/icon.png`, gerado a partir da marca do app por `npm run make:icon`. Só precisa rodar de novo se a marca mudar.
- **Releases do GitHub:** o build não envia nada para lugar nenhum (o `publish` `generic` só gera o `latest.yml` e grava o endereço no app). Subir o `.exe` em Releases é manual.
- O pacote leva só o app compilado (`out/`). React, LiveKit e SignalR já vão embutidos pelo Vite, por isso ficam em `devDependencies` e o `node_modules` não entra no instalador.
