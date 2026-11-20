# Dúvidas pendentes

A automação anota aqui o que precisa da sua decisão e segue com outras partes enquanto isso.

**Como responder:** escreva embaixo de `Resposta:` e troque o status para `respondida`.
Na próxima execução, a automação aplica a resposta e move o item para "Resolvidas".
Também dá para responder no chat; nesse caso, peça para registrar aqui.

Status possíveis: `aberta` (ainda não bloqueia), `bloqueante` (trava um passo), `respondida`.

## Abertas

### D1 — Pedidos enviados e desfazer amizade (fora do mockup)
- Status: aberta
- Passo: 4
- Contexto: o mockup de Amigos mostra só pedidos recebidos. Não mostra pedidos que você enviou nem como desfazer uma amizade.
- Opções: A) na aba "Pedidos", uma seção "PEDIDOS ENVIADOS — N" com botão "Cancelar pedido", no mesmo estilo dos recebidos; desfazer amizade fica para depois, num menu "⋯" na linha do amigo (recomendado) · B) não mostrar pedidos enviados.
- Enquanto isso: fiz a opção A. A API já tem `DELETE /friends/{userId}`, mas ainda não existe botão para desfazer amizade.
- Resposta:

### D2 — Telas de grupo fora do mockup (passo 5)
- Status: aberta
- Passo: 5
- Contexto: o mockup não tem as janelas de "Criar grupo", "Adicionar pessoas" e "Renomear grupo", nem o jeito de remover alguém ou de apagar uma mensagem. Também não tem aviso de mensagens não lidas nos grupos.
- Opções: A) janelas simples no visual do app (campo de nome + lista de amigos com caixinhas), com os botões de remover membro e apagar mensagem aparecendo ao passar o mouse e confirmação antes; não lidas ficam para depois (recomendado) · B) desenhar essas telas no mockup antes.
- Enquanto isso: fiz a opção A. Dá para ajustar o visual depois.
- Resposta:

### D3 — Regras e telas de chamada fora do pedido (passo 6)
- Status: aberta
- Passo: 6
- Contexto: o roteiro não define o que acontece em alguns casos de chamada, e o mockup não tem a tela de "chamando" (quem liga) nem uma tela própria da ligação 1:1.
- Opções: A) ligar só para amigo online (offline dá aviso "está offline"); toca por 30 s e depois cancela sozinho; ligar para quem já está em chamada toca mesmo assim; entrar numa sala sai da anterior (uma chamada por vez); a ligação 1:1 usa a mesma tela da sala de voz, com o nome do amigo no topo; quem liga vê um card "Chamando Fulano…" com botão "Cancelar", no mesmo estilo do card de ligação recebida (recomendado) · B) outras regras (diga quais).
- Enquanto isso: fiz a opção A.
- Resposta:

_Respondidas no chat em 20/11/2026 ~06:10 (registradas abaixo em Resolvidas)._

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
