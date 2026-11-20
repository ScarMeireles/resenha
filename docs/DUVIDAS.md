# Dúvidas pendentes

A automação anota aqui o que precisa da sua decisão e segue com outras partes enquanto isso.

**Como responder:** escreva embaixo de `Resposta:` e troque o status para `respondida`.
Na próxima execução, a automação aplica a resposta e move o item para "Resolvidas".
Também dá para responder no chat; nesse caso, peça para registrar aqui.

Status possíveis: `aberta` (ainda não bloqueia), `bloqueante` (trava um passo), `respondida`.

## Abertas

### D6 — Hospedagem na Oracle e publicação do instalador
- Status: bloqueante
- Passo: 10 e o fim do 11
- Contexto: os passos que sobraram precisam de coisas que a automação não pode fazer: criar a conta e a VM na Oracle Cloud (Always Free), configurar domínio/HTTPS e chaves do LiveKit, fazer `git push` e subir o `.exe` em Releases do GitHub.
- Opções: A) você cria a conta e a VM na Oracle numa sessão interativa, com a automação guiando passo a passo e preparando os arquivos de deploy (recomendado) · B) a automação prepara agora só os arquivos de deploy (Docker Compose, Caddy, script de instalação) sem tocar em conta nenhuma, e você sobe depois.
- Enquanto isso: nada mais do roteiro está livre; o instalador já sai com `npm run dist`.
- Resposta:

<!-- Modelo:
### D1 — Título curto
- Status: aberta | bloqueante
- Passo: 4
- Contexto: o que encontrei e por que preciso de você.
- Opções: A) ... (recomendado) · B) ...
- Enquanto isso: o que fiz / deixei pendente.
- Resposta:
-->

## Resolvidas

### R6 — Pedidos enviados e desfazer amizade (era D1, passo 4)
- Respondido no chat em 20/11/2026: opção A aprovada, como já está (seção "PEDIDOS ENVIADOS — N" com "Cancelar pedido"; desfazer amizade depois, num menu "⋯").

### R7 — Telas de grupo fora do mockup (era D2, passo 5)
- Respondido no chat em 20/11/2026: opção A aprovada, como já está. Não lidas ficam para depois.

### R8 — Regras de chamada e status (era D3, passo 6)
- Respondido no chat em 20/11/2026:
  - Pode ligar para amigo que aparece offline. O status "offline" escolhido pela pessoa funciona como invisível: se ela está com o app aberto, toca normalmente. Se está desconectada de verdade, quem liga vê "Fulano não está disponível" e a pessoa recebe um aviso de **chamada perdida** quando entrar.
  - Clicar no próprio status permite escolher **Online, Ausente ou Offline**.
  - O resto da opção A vale: toca 30 s e cancela; toca mesmo se o amigo já está em chamada; uma chamada por vez; 1:1 usa a tela da sala de voz; card "Chamando Fulano…" com Cancelar.
  - **Foco agora:** conseguir ligar e compartilhar tela. Ajustes de regra ficam para depois.
  - **Segurança mínima:** não vazar senhas nem IPs dos usuários (o app vai rodar junto com outros programas).
  - **Repositório público no GitHub só com o código:** nada de segredos, banco ou dados pessoais. Quem clonar precisa hospedar e criar o próprio banco e as próprias chaves.

### R9 — Compartilhamento de tela e áudio (era D4, passo 8)
- Respondido no chat em 20/11/2026:
  - Cada pessoa pode compartilhar uma tela ao mesmo tempo (layout da opção A: uma grande, as outras em miniatura).
  - Áudio da tela com três opções: **Sem áudio**, **Todo o áudio do PC** e **Todo o áudio, menos: [lista de apps]**. O próprio Resenha vem marcado para sair (evita eco); dá para marcar o Discord e outros.
  - Exige módulo nativo do Windows (API de captura por processo, Windows 10 2004+, gratuita). Atenção técnica: essa API exclui só um processo por captura, então excluir vários apps provavelmente precisa capturar os demais apps um a um e misturar o som; validar antes de implementar.

### R10 — Tela "Voz e vídeo" e presets (era D5, passo 9)
- Respondido no chat em 20/11/2026: opção A aprovada, como já está.

### R5 — Regras de grupos e chat (passo 5)
- Respondido no chat em 20/11/2026: qualquer membro adiciona pessoas, mas só os próprios amigos. Só o dono renomeia e remove pessoas. Se o dono sair, o membro mais antigo vira dono; se sair o último, o grupo é apagado. Máximo de 10 pessoas. Até 4 imagens por mensagem. A pessoa pode apagar a própria mensagem, que vira "mensagem apagada"; editar fica para depois. Constantes em `server/api/Groups/GroupRules.cs`.

### R1 — Regra de senha no cadastro (passo 3)
- O mockup dizia "mínimo de 4 caracteres". Resposta: manter a regra real (6 a 15, com maiúscula, minúscula e caractere especial). Já está assim no app.

### R2 — Commits, merges e instalações neste projeto
- Resposta: no Resenha (só neste projeto) pode fazer commit e merge sem pedir; instalar software necessário também, só avisando no DIARIO. O eatlink e qualquer outro projeto seguem as regras normais. Registrado no CLAUDE.md do projeto.

### R3 — Janela da automação
- Resposta: das 07:01 de 20/11/2026 até o fim do bloco de 5 h, emendando tarefas sem esperar o próximo horário. Dúvidas aparecem no chat como pergunta com opções.

### R4 — Mostrar "@ disponível" em tempo real no cadastro (passo 3, fazer junto com o passo 4)
- Resposta: opção A. @ único como no Discord; pode avisar em tempo real. Criar `GET /auth/username-available?u=` sem login, com o mesmo limite por IP do cadastro, e mostrar "Disponível"/"Em uso" ~400 ms após parar de digitar (com testes).
