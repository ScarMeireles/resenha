/**
 * Instalador do Resenha para Windows (passo 11). Gere com: npm run dist (saída em release/).
 * É TypeScript (e não .yml) para o endereço das atualizações sair do mesmo VITE_API_URL gravado no app
 * (.env.production), sem repetir o IP aqui.
 */
import type { Configuration } from 'electron-builder'
import { loadEnv } from 'vite'
import { serverUrls, updatesUrl } from './src/build/env'

// O electron-vite compila em modo "production": lê .env, .env.local, .env.production e .env.production.local.
const { apiUrl } = serverUrls(loadEnv('production', import.meta.dirname))

const config: Configuration = {
  appId: 'app.resenha.desktop',
  productName: 'Resenha',
  copyright: 'Resenha',
  directories: { output: 'release', buildResources: 'build' },
  // Só o app compilado entra no pacote; o código-fonte, os testes e os scripts ficam de fora.
  files: ['out/**', 'package.json'],
  // O ajudante de áudio da tela fica fora do asar porque é um .exe que o app abre (main/screenAudio.ts).
  extraResources: [{ from: 'resources/audio', to: 'audio', filter: ['**/*'] }],
  win: {
    target: [{ target: 'nsis', arch: 'x64' }],
    icon: 'build/icon.png',
    // Sem assinatura digital: certificado custa dinheiro. O Windows mostra o aviso do SmartScreen na primeira vez.
    signAndEditExecutable: true,
    // Sem certificado não há "publisher" para conferir: a atualização automática confia no sha512 do latest.yml,
    // baixado do próprio servidor. Por isso não definimos publisherName.
    verifyUpdateCodeSignature: false,
  },
  nsis: {
    // Assistente de instalação (não é mais "um clique"): o usuário pode escolher a pasta.
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    // Por padrão instala só para o usuário atual, sem pedir administrador.
    perMachine: false,
    // Mantido no padrão (true): o Windows só pede administrador se a pasta escolhida exigir.
    allowElevation: true,
    // O appId (no topo) é o que faz o instalador novo reconhecer e substituir a instalação antiga.
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Resenha',
    artifactName: 'Resenha-Setup-${version}.${ext}',
    // Desinstalar mantém a pasta de dados (login lembrado e preferências).
    deleteAppDataOnUninstall: false,
  },
  // Atualização obrigatória (R13): o build gera latest.yml + .blockmap e grava este endereço no app
  // (app-update.yml). Nada é enviado para lugar nenhum: o scripts/publicar-versao.mjs copia os arquivos para a
  // pasta de atualizações do servidor, que a API serve em /updates. Subir o .exe nos Releases segue manual.
  publish: { provider: 'generic', url: updatesUrl(apiUrl) },
}

export default config
