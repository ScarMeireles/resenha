# Diário da automação

Uma entrada por execução automática, a mais recente no topo: o que foi feito, commits/merges e onde parou.

---

## 20/11/2026 — sessão interativa (status e chamada perdida, do R8)
- Branch `feature/status-e-chamada-perdida`, mergeada em `hml`.
- API:
  - Cada conta guarda o status escolhido (`User.Status`: online, away ou offline) e há uma tabela nova `MissedCalls` (migração `StatusEChamadaPerdida`).
  - O `PresenceTracker` calcula o que os outros veem. Quem escolhe "offline" fica invisível: aparece offline até em chamada, e ninguém é avisado quando essa pessoa conecta.
  - Rotas novas: `GET`/`PUT /me/status` (fora do `UserDto` de propósito) e `GET`/`DELETE /calls/missed` (só mostra chamada de quem ainda é amigo, até 50).
  - Ligar agora só depende de o app da pessoa estar aberto. Se estiver fechado: 409 "Fulano não está disponível" e uma chamada perdida registrada.
  - A lista de amigos passou a ordenar como "não offline" primeiro (antes, quem estava em chamada ia para o fim).
- App:
  - Os três tipos de presença repetidos viraram um só (`lib/presence.ts`).
  - Clicar no próprio avatar abre o menu Online/Ausente/Offline. Ausente usa a cor nova `--yellow #f5c04a`, que não está no mockup.
  - O botão Ligar fica sempre habilitado.
  - Card "Chamada(s) perdida(s)" com agrupamento por pessoa, ligar de volta e Fechar. Ligar de volta também fecha o aviso.
- Testes: API 149, app 156; build OK. Teste real com dois Electron (@st_a7650/@st_b7650): os 6 itens passaram e nenhum erro apareceu no console.
- Fica para depois:
  - Uma ligação que toca 30 s sem resposta (app aberto) não vira chamada perdida.
  - Trocar o status num aparelho não atualiza os outros aparelhos da mesma pessoa na hora.

## 20/11/2026 — sessão interativa (teste real do passo 9)
- Teste com dois Electron numa ligação 1:1 (contas locais @q9_a2421/@q9_b2421, mídia falsa). Passaram: áudio nos dois sentidos, troca de microfone e saída durante a chamada, supressão de ruído liga/desliga, tela em Normal (camadas 720p e 1080p; quem assiste recebe 1080p com palco grande ou 720p na janela padrão, pelo `adaptiveStream`; antes eram 540p) e Economia (720p 15 fps). Nenhum erro no console.
- Bug corrigido (`e5cdd14`): voltar a câmera para "Padrão do sistema" encerrava a faixa de vídeo, porque o LiveKit pedia o aparelho `default` como obrigatório (`exact`). Agora `deviceArgs` em `voice.ts` manda `default` sem `exact`. Testes do app: 151.
- **Ainda sem prova:** os 60 fps do nível Alta. O encoder está em 60 fps, mas esta máquina só captura 20 fps, mesmo sem LiveKit. Causa provável: o monitor virtual do Parsec. Reconferir numa máquina sem ele.
- Fica para depois: se o aparelho escolhido for desconectado, a faixa morre e o app só avisa "Não foi possível trocar o aparelho".
- O roteiro do teste com dois apps agora está em `docs/AUTOMACAO.md`.

## 20/11/2026 — sessão interativa (dúvidas e verificação de segredos)
- D1 a D5 respondidas no chat e movidas para "Resolvidas" (R6 a R10 em `docs/DUVIDAS.md`). Trabalho novo que saiu delas:
  - Status clicável com Online, Ausente e Offline. "Offline" funciona como invisível.
  - Ligar para quem aparece offline; se a pessoa estiver desconectada de verdade, ela recebe aviso de chamada perdida quando entrar.
  - Áudio da tela com três opções: sem áudio, todo o áudio do PC, ou todo menos uma lista de apps (o Resenha vem marcado). Isso exige módulo nativo e precisa ser validado antes.
- Foco definido pelo usuário: ligar e compartilhar tela funcionando. Segurança mínima: não vazar senhas nem IPs. O repositório público tem só o código.
- Nova verificação automática: `scripts/check-secrets.mjs` com hooks `.githooks/pre-commit` (arquivos no stage) e `.githooks/pre-push` (todos os arquivos e o histórico). Ativada nesta máquina com `git config core.hooksPath .githooks`. Bloqueia `.env`, `appsettings.Development.json`, banco, `.data/`, chaves, IP público e o valor real dos segredos de `infra/.env` e `appsettings.Development.json`. Rodada em todo o código e no histórico: limpos. Teste com segredo, IP e `.db` falsos: bloqueou os três.
- Regras novas no `CLAUDE.md` (repositório público e privacidade) e seção "Clonou o projeto?" no README.

## 20/11/2026 11:14–11:30 — automação agendada (passo 9, qualidade)
- Passo 9 pronto e mergeado em `hml` (`ac1e7c3`). Branch `feature/passo-9-qualidade`, commits `cfdd953` (D5), `fea0a2f` (preferências de mídia e lista de aparelhos, com testes), `2ebac24` (voz e `useCall`), `335db9f` (tela "Voz e vídeo") e `3c23bc8` (README).
- App: `lib/mediaSettings.ts` com 3 níveis de qualidade (Economia: voz 32 kbps, câmera 360p, tela 720p 15 fps · Normal, o padrão: voz 48 kbps, câmera 720p, tela 1080p 30 fps · Alta: voz 64 kbps, câmera 1080p, tela 1080p 60 fps a 8 Mbps). Todos em VP8, com camadas de simulcast também na tela (720p), o que deve evitar os 540p vistos no passo 8. Escolha de microfone, saída de som e câmera (`switchActiveDevice`) e supressão de ruído (`restartTrack`) valem na hora. A qualidade vale na próxima vez que a câmera ou a tela forem ligadas. Tudo fica salvo no `localStorage` (`resenha.mediaSettings`). A tela abre pelo item "Voz e vídeo" no menu da engrenagem do painel do usuário.
- Testes: app 149, API 141; build OK. **Não testado com dois apps reais:** a troca de aparelho durante a chamada, os 60 fps e a camada de 720p da tela. O `applySettings` não tem teste unitário (exigiria mockar o `Room`), e a tela não tem teste de componente porque o projeto não tem Testing Library.
- Dúvida nova: D5 (tela de voz e vídeo e presets), aberta e não bloqueante. Fiz a opção recomendada.
- Parada pelo fim da janela da automação (~12:00), com uso de 5 h em 74%. Próximo: teste real do passo 9 com dois Electron. Depois vem o passo 10 (hospedagem na Oracle), que exige conta e chaves e por isso depende do usuário.

## 20/11/2026 10:14–10:30 — automação agendada (passo 8, compartilhar tela)
- Passo 8 pronto e mergeado em `hml` (`c24eadc`). Branch `feature/passo-8-tela`, commits `1b58da4` (token libera `screen_share`/`screen_share_audio`), `bdbe0d3` (main/preload/voz/hook), `c5b7089` (D4), `da7d7fd` (seletor e palco), `ac5aefa` (correção) e `0c69614` (README).
- Electron: `src/main/screen.ts` lista telas/janelas (sem a do Resenha) e entrega a escolhida pelo `setDisplayMediaRequestHandler`; escolha de uso único com validade de 15 s (`screenChoice.ts`, com teste). Áudio do sistema com `loopback`. App: seletor `ScreenPicker` (abas Telas/Janelas), palco com a tela grande e faixa de tiles, rótulo "Tela de X · 1080p · com áudio", botão laranja quando ativo. Mídia: 1080p 30 fps VP8, `ScreenSharePresets.h1080fps30`, `contentHint: 'motion'`. Testes: API 141, app 136; build OK.
- Teste real com dois Electron (contas locais novas @tela_a31418/@tela_b31418, grupo "Grupo Tela"): os 6 itens passaram (seletor, palco, áudio extra, parar, cancelar). Quem assiste recebeu 540p pela camada simulcast (quem compartilha manda 1080p); vale revisar as camadas da tela no passo 9.
- Bug achado e corrigido: o `<audio>` oculto da faixa remota sobrava no `body` quando quem publica parava (o `detach()` voltava vazio). Agora `voice.ts` guarda o elemento por faixa num `Map`. Esse ajuste não foi testado de novo com dois apps, só com testes, typecheck e build.
- Achado sem correção: o `RealtimeTests.Quem_e_adicionado_recebe_groupAdded…` da API falhou uma vez e passou ao rodar de novo, então parece instável. Ver depois.
- Dúvida nova: D4 (seletor, áudio do computador desmarcado por padrão, várias telas ao mesmo tempo), aberta e não bloqueante. Fiz a opção recomendada.
- Parada pela regra 9 (5 tarefas), com uso de 5 h em 68%. Próximo: passo 9 (qualidade: presets de bitrate, simulcast, supressão de ruído, seleção de microfone/fone). Os pontos de partida são `connectVoice` em `apps/desktop/src/renderer/src/lib/voice.ts` (opções do `Room` e `setScreenShare`) e as camadas de simulcast da tela.

## 20/11/2026 09:14–09:35 — automação agendada (passo 7, câmera)
- Passo 7 pronto e mergeado em `hml` (`28eebff`). Branch `feature/passo-7-camera`, commits `939cc9d` (token libera `camera`), `be0583a` (voice/hook), `2a22b71` (tela), `7e51812` (ajustes), `6985d4d` (CSP) e `7bb5a25` (README).
- App: botão de câmera na barra (neutro quando desligada), vídeo no lugar do avatar (o seu espelhado), tiles 16:9 de 240 a 480 px centralizados. Captura em 720p 30 fps, VP8, simulcast 180p/360p, `adaptiveStream` e `dynacast`. Nova ação `notice` no `callReducer` mostra "Não foi possível ligar a câmera." sem derrubar a chamada. Ícones novos `VideoIcon`/`VideoOffIcon` (já existia um `CameraIcon` de foto). Testes: API 141, app 121.
- Teste real com dois Electron (câmera e mic falsos, contas @teste_cam_a/@teste_cam_b, grupo "Grupo Cam"): os dois se veem (remoto 640x360 pela camada simulcast, próprio 1280x720 espelhado), e ao desligar a câmera o tile volta ao avatar. O navegador embutido não serve para isso: ele nega a câmera.
- Bug achado e corrigido: no app empacotado a CSP só liberava HTTP da API, então o SignalR e o LiveKit eram bloqueados ("A conexão de voz caiu."). A política foi para `apps/desktop/src/build/csp.ts` (com teste). Nova variável `VITE_LIVEKIT_URL` (padrão `ws://localhost:7880`) no `.env.example`. **Não testado de novo no build empacotado**, mas a CSP gerada no `out/` foi conferida. No passo 10, o `VITE_LIVEKIT_URL` precisa apontar para o `wss://` da Oracle.
- Sem dúvidas novas. Docker do LiveKit ficou rodando.
- Parada pela regra 9 (5 tarefas), com uso de 5 h em 58%. Próximo: passo 8 (compartilhar tela com seletor de janela/monitor e áudio do sistema). Inclua `screen_share` e `screen_share_audio` em `canPublishSources` (`server/api/Calls/LiveKitTokenService.cs`). No Electron, o seletor usa `desktopCapturer` + `session.setDisplayMediaRequestHandler` no main (o áudio do sistema no Windows vem com `audio: 'loopback'`). O mockup `Chamada.dc.html` mostra a tela grande em cima, os tiles numa faixa embaixo e o rótulo "Tela de Ana · 1080p 60 fps · com áudio".


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
