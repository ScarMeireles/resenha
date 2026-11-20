# Resenha — instruções do projeto

App desktop de voz, câmera, compartilhamento de tela e chat entre amigos. Visão, arquitetura e roteiro estão no `README.md`.

- **Custo zero:** só planos gratuitos (Oracle Always Free, Docker local). Nunca adicione serviço, plano ou recurso que possa gerar cobrança; se algo exigir isso, pare e avise.
- Stack: Electron + React + TypeScript (`apps/desktop`), ASP.NET Core Minimal API + SignalR + EF Core/SQLite (`server/api`), LiveKit via Docker (`infra`).
- Contas simples (@ único, nome, foto, senha curta, sem e-mail). Senha sempre com hash. Segurança proporcional a um app entre amigos.
- **Segredos (API key/secret do LiveKit, chave de assinatura de JWT) nunca vão para o Git**: use `.env`/`appsettings.Development.json` ignorados e mantenha um `*.example` versionado.
- Visual segue os mockups aprovados (link no README). Paleta: grafite `#111318`/`#181B21`/`#1F232A`, laranja `#FF8A3D`, verde de fala `#3DDC97`; fontes Inter e Space Grotesk.
- Sem CI do GitHub por enquanto: builds e testes rodam localmente.
- Branches: `main` (produção) e `hml` (homologação). Todo trabalho sai de uma branch criada a partir de `hml` (ex.: `feature/passo-2-api-base`), volta para `hml` e só depois `hml` vai para `main`.
- Prioridade é qualidade de áudio/vídeo; ao mexer em mídia, explique as escolhas de codec/bitrate.
