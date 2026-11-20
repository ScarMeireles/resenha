# Automação de continuidade

Uma tarefa agendada do app Claude (`resenha-continuar`) roda **a cada hora** e segue o roteiro do `README.md` quando há limite de uso sobrando.

## O que ela faz em cada execução

1. Sai na hora (gastando quase nada) se: outra execução estiver rodando (trava em `C:\Users\spiar\.claude\resenha-automacao.lock`), o limite de 5 h estiver acima de 80%, o semanal acima de 80%, ou tudo que falta depender de dúvidas sem resposta.
2. Lê `docs/DUVIDAS.md` e aplica as respostas.
3. Continua o passo atual em `feature/passo-N-...`, criada a partir de `hml`, com commits pequenos.
4. Com o passo pronto e os testes passando, faz o merge em `hml` e marca o passo no README.
5. Para de puxar trabalho novo quando o limite de 5 h passa de 92%, fecha com um commit e registra tudo em `docs/DIARIO.md`.

## Janela de funcionamento

- Trabalha das 07:01 de 20/11/2026 até o fim desse bloco de limite (5 h, ~12:00, Brasília). Dentro da janela, ao terminar uma tarefa já emenda a próxima na mesma execução, sem esperar o próximo horário agendado; só para pelos limites de uso. Fora da janela, sai na hora. Quem estiver na sessão interativa pode desativar a tarefa `resenha-continuar` no app.

## O que ela tem autorização para fazer

- Commits em `feature/*` e merges de `feature/*` em `hml` (autorização permanente do usuário, só neste projeto).
- Instalar software necessário (gratuito), registrando no DIARIO.

## O que ela NÃO faz

- `push`, PR, merge em `main`, `force`, apagar branches.
- Criar conta, chave ou serviço (Oracle, GitHub etc.), nem nada que possa gerar custo.
- Decidir regras de negócio que você não pediu: vira dúvida em `docs/DUVIDAS.md`.

## Como pausar

- No app: aba de tarefas agendadas → `resenha-continuar` → desativar.
- Ou peça no chat de qualquer sessão: "pause a automação do resenha".
- Dentro de uma execução em andamento: escreva "pare" no chat dela.

## Economia de tokens (obrigatório para todo agente da automação)

O consumo cresce porque cada mensagem reenvia todo o histórico da conversa. Por isso, o custo de uma sessão longa sobe
cada vez mais rápido. As regras abaixo mantêm o gasto **linear** (cada tarefa custa mais ou menos o mesmo), em vez de
exponencial.

1. **Uma tarefa = um contexto limpo.** Ao terminar uma tarefa, não emende a próxima carregando todo o histórico: delegue
   cada tarefa a um subagente novo (ferramenta `Agent`), que começa do zero e devolve só um resumo curto (até 10 linhas).
   A sessão principal fica só como "orquestradora": lê o roteiro, escolhe a próxima tarefa, dispara o subagente, confere o
   resultado (`git log -1 --stat`, `git status`) e segue.
2. **Quem decide e quem executa:** decisões e arquitetura são sempre do Opus (sessão principal); os modelos mais simples
   nunca decidem, só seguem à risca o que o Opus definiu.
   - **Opus:** escreve o plano de cada tarefa, bem específico: arquivos a mexer, nomes e assinaturas, comportamento
     esperado e critério de pronto (ex.: "estes testes passam"). No fim, confere o diff e o resumo contra o plano antes
     do commit.
   - **`sonnet`:** implementa código e testes seguindo o plano. **Regra de parada:** se surgir algo que o plano não
     cobre (decisão de design, regra de negócio, mudança de escopo), ele para e devolve a pergunta ao Opus, sem improvisar.
   - **`haiku`:** só trabalho mecânico: buscas, leitura de logs e commits/merges com branch, arquivos e mensagem já
     definidos. Não implementa código.
3. **Estado mora em arquivo, não na conversa.** O que precisa sobreviver entre tarefas vai para `docs/DIARIO.md`
   (o que foi feito, 3–5 linhas por tarefa) e `docs/DUVIDAS.md`. A próxima tarefa lê só as últimas entradas do diário
   (`tail -n 40`), nunca o arquivo inteiro.
4. **Leia trechos, não arquivos inteiros:** use `grep -n` para achar o ponto e leia só as linhas necessárias
   (`sed -n 'X,Yp'` ou `Read` com `offset/limit`). Não releia arquivo que acabou de editar.
5. **Saída de comandos enxuta:** builds e testes com saída resumida (`dotnet test --nologo -v q`,
   `npm test -- --reporter=dot`, `| tail -n 30`). Nunca despeje logs completos, `package-lock.json` ou arquivos gerados.
6. **Sem capturas de tela no contexto principal.** Se for preciso conferir visual, um subagente olha e descreve em texto.
7. **Sem exploração "por curiosidade":** não varra o repositório inteiro; o `README.md` (roteiro) e o diário dizem onde
   mexer.
8. **Falhou duas vezes do mesmo jeito? Pare essa tarefa.** Registre o erro em `docs/DUVIDAS.md` e passe para a próxima,
   em vez de gastar tokens tentando às cegas.
9. **Limite por execução:** se a conversa principal já passou de umas 5 tarefas, ou ficou longa, registre o ponto em que
   parou no diário e encerre; a próxima execução agendada começa com contexto limpo e continua dali.
10. **Respostas curtas:** sem recapitulações longas entre passos; o resumo final da execução tem no máximo 10 linhas.

## Teste real com dois apps Electron

Roteiro que funcionou no teste do passo 9 (20/11/2026). Scripts temporários ficam no scratchpad, nunca no repositório.

1. Suba a API em segundo plano: `dotnet run --project server/api --launch-profile http` (LiveKit no Docker já rodando).
2. Em `apps/desktop`, rode `npx electron-vite build`.
3. Crie as contas e a amizade pela API: `POST /auth/register` duas vezes, `POST /friends/requests` e depois `.../accept`. Senha com 6 a 15 caracteres, maiúscula, minúscula e caractere especial.
4. Abra cada instância pelo PowerShell, depois de `Remove-Item Env:ELECTRON_RUN_AS_NODE`:
   `electron.exe . --remote-debugging-port=9301 --user-data-dir=<scratchpad>\profA --no-sandbox --use-fake-device-for-media-stream --use-fake-ui-for-media-stream`.
   Na segunda, use a porta 9302 e `profB`. O `--user-data-dir` libera o `requestSingleInstanceLock`, e a sessão continua salva entre reinícios.
5. Controle as janelas por CDP com um script Node. Para usar `getStats`, injete um wrapper de `RTCPeerConnection` que guarda as conexões em `window.__pcs`. Para forçar a camada 1080p da tela em quem assiste, use `Emulation.setDeviceMetricsOverride`, porque o `adaptiveStream` escolhe a camada pelo tamanho do vídeo na janela.
6. Feche com `window.close()`, nunca matando o processo, porque isso perde a chave do `safeStorage`. Pare a API.

Cuidados no PowerShell: JSON passado direto para o `node` perde as aspas, então passe por arquivo. E use `-Encoding utf8` no `Set-Content`.
