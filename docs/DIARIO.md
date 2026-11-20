# Diário da automação

Uma entrada por execução automática, a mais recente no topo: o que foi feito, commits/merges e onde parou.

---

## 20/11/2026 08:14–08:45 — automação agendada (passo 6, voz)
- Passo 6 pronto e mergeado em `hml` (`cab85ee`). Branch `feature/passo-6-voz`, commits `d9664ce`, `b36d564`, `311b20a` (API e infra), `6c121a8` (D3), `c68af82`, `deae947`, `bc3b17a`, `84c5a07` (app) e `239c1cb` (README).
- API: token do LiveKit, voz do grupo (`/groups/{id}/voice`), ligação 1:1 (`/calls/{amigoId}` e accept/decline/cancel/hangup), webhook `POST /livekit/webhook` com assinatura conferida, presença `in-call`. Em dev a API lê as chaves do `infra/.env`. Testes: 141.
- App: `livekit-client` 2.24.1 (instalado), tela da chamada, sala de voz na barra lateral, "NA CHAMADA" nos membros, botão Ligar, cards de ligação recebida e "Chamando…", mic e ensurdecer. Áudio Opus mono 48 kbps com DTX e RED, cancelamento de eco, supressão de ruído e ganho automático. Testes: 116. O aviso "Failed to start the connection" foi corrigido: o `stop` agora espera o `start` terminar.
- Teste real: LiveKit no Docker recriado com o webhook (`docker compose up -d`), API local e Electron com microfone falso. Funcionaram entrar e sair da sala, a presença `in-call`, a ligação recebida (recusar, atender e desligar) e o "Chamando…" com o tempo de 30 s acabando. **Não testado:** duas pessoas se ouvindo de verdade, porque só havia um cliente real. Vale testar com dois apps no passo 7.
- Dúvida nova: D3 (regras e telas de chamada), aberta e não bloqueante. Fiz a opção recomendada.
- Parada pela regra 9 (5 tarefas nesta execução), com uso de 5 h em 50%. Próximo: passo 7 (câmera e grade de vídeos). O token do LiveKit hoje só libera `microphone` em `canPublishSources` (`server/api/Calls/LiveKitTokenService.cs`); acrescente `camera`.

## 20/11/2026 07:03–07:50 — sessão interativa rodando o roteiro da automação
- A automação agendada não disparou às 07:01, então o usuário pediu para rodar o procedimento na sessão interativa.
- Passo 3: commit `d4147be` e merge em `hml` (`a9bcce2`).
- Passo 4 (Amigos): API com pedidos, aceitar/recusar/cancelar, desfazer amizade, hub SignalR `/hubs/app` com presença e `GET /auth/username-available` (R4). No app: tela Amigos do mockup, badge de pedidos, "Disponível"/"Em uso" no cadastro. Bug achado no teste real: o SignalR do navegador mandava cookies e o CORS "*" recusava; corrigido com `withCredentials: false`, coberto por teste. Merge em `hml` (`3ab729a`).
- Passo 5 (Grupos e chat): API de grupos, membros, mensagens com até 4 imagens (WebP, até 1920 px), apagar a própria mensagem e eventos em tempo real. No app: trilho de grupos, chat, painel de membros e modais de criar, adicionar e renomear. Teste real com 7 itens OK; o menu do grupo estava espremido por um conflito de CSS, corrigido. Testes: API 118, app 73.
- Dúvidas novas: D1 e D2 (telas fora do mockup), ambas abertas e não bloqueantes. Regras do passo 5 respondidas no chat (R5).
- Parada pela regra 9 (conversa longa). Próximo: passo 6 (voz com LiveKit). Ler `infra/` e o `.env.example` do LiveKit antes de começar.
- Observação: o console mostra "Failed to start the connection" ao abrir o app (provável StrictMode montando duas vezes e parando a conexão no meio da negociação). Não atrapalha; investigar no passo 6.

## 20/11/2026 ~06:10 — sessão interativa (não automática)
- Passo 3 (app Electron: layout, criar conta/entrar, login lembrado, CORS na API, regras em `shared/`) está PRONTO na branch `feature/passo-3-app-electron`, SEM commit. Testes: 24 do app (`npm test` em apps/desktop, rodar pelo PowerShell — no Git Bash o Vitest falha por conversão de caminho) e 53 da API, todos passando; fluxo completo testado no Electron.
- Próxima execução: revisar `git status`, commitar o passo 3, merge em `hml` e seguir para o passo 4. O README já marca o passo 3 como feito.
- Sem dúvidas abertas. Fazer R4 (@ disponível em tempo real). Respostas R1–R4 em `docs/DUVIDAS.md`.
- Observação: ao rodar o Electron a partir do Claude, remova `ELECTRON_RUN_AS_NODE` do ambiente e use `--no-sandbox` só para teste; feche a janela com `window.close()` (matar o processo à força perde a chave do `safeStorage`).
