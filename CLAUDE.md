# Resenha — instruções do projeto

App desktop de voz, câmera, compartilhamento de tela e chat entre amigos. Visão, arquitetura e roteiro estão no `README.md`.

- **Custo zero:** só planos gratuitos (servidor no PC do usuário com Docker Desktop, amigos pela Radmin VPN). Nunca adicione serviço, plano ou recurso que possa gerar cobrança; se algo exigir isso, pare e avise.
- Stack: Electron + React + TypeScript (`apps/desktop`), ASP.NET Core Minimal API + SignalR + EF Core/SQLite (`server/api`), LiveKit via Docker (`infra`).
- Contas simples (@ único, nome, foto, senha curta, sem e-mail). Senha sempre com hash. Segurança proporcional a um app entre amigos.
- **Segredos (API key/secret do LiveKit, chave de assinatura de JWT) nunca vão para o Git**: use `.env`/`appsettings.Development.json` ignorados e mantenha um `*.example` versionado.
- **Repositório público, só código:** quem clonar hospeda o próprio servidor, banco e chaves. Nunca versionar banco, uploads (`.data/`), `.env`, chaves, IPs públicos ou do Radmin (vão no `deploy/.env`) ou dado pessoal do usuário. A verificação automática é `scripts/check-secrets.mjs` (hooks em `.githooks/`, ativados com `git config core.hooksPath .githooks`): se bloquear, corrija a causa e não use `--no-verify`.
- **Privacidade dos usuários:** senha nunca aparece em log, resposta da API nem mensagem de erro. A API não devolve IPs e a mídia passa pelo LiveKit (o app não conecta direto no IP do amigo). Exceção aceita pelo usuário: na rede da Radmin VPN os amigos podem ver o IP uns dos outros.
- Visual segue os mockups aprovados (link no README). Paleta: grafite `#111318`/`#181B21`/`#1F232A`, laranja `#FF8A3D`, verde de fala `#3DDC97`; fontes Inter e Space Grotesk.
- Sem CI do GitHub por enquanto: builds e testes rodam localmente.
- Branches: `main` (produção) e `hml` (homologação). Todo trabalho sai de uma branch criada a partir de `hml` (ex.: `feature/passo-2-api-base`), volta para `hml` e só depois `hml` vai para `main`.
- **Exceção às regras globais, só neste projeto:** pode fazer commit e merge (`feature/*` → `hml`) sem pedir autorização e instalar software gratuito necessário, avisando no `docs/DIARIO.md`. Push, merge em `main` e qualquer custo continuam proibidos. Outros projetos (ex.: eatlink) seguem as regras globais.
- **Automação (`resenha-continuar`):** trabalha das 07:01 de 20/11/2026 até o fim desse bloco de limite (5 h, ~12:00, Brasília). Dentro da janela, ao terminar uma tarefa já emenda a próxima na mesma execução, sem esperar o próximo horário agendado; só para pelos limites de uso. Fora da janela, sai na hora. Dúvidas: na sessão interativa, pergunte no chat com opções (ferramenta de perguntas); na automação, registre em `docs/DUVIDAS.md` e a próxima sessão interativa as apresenta assim.
- Prioridade é qualidade de áudio/vídeo; ao mexer em mídia, explique as escolhas de codec/bitrate.
- **Economia de tokens na automação:** siga a seção "Economia de tokens" de `docs/AUTOMACAO.md` (uma tarefa por subagente com contexto limpo, estado no `DIARIO.md`, leitura de trechos, saída de comandos resumida).
