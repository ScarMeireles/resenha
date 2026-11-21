import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'electron-vite'
import type { Plugin } from 'vite'
import { buildCsp } from './src/build/csp'
import { serverUrls } from './src/build/env'

const repoRoot = resolve(import.meta.dirname, '../..')
// Versão do app (package.json): vai em toda chamada à API, que barra versão velha (atualização obrigatória).
const appVersion: string = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8')).version

export default defineConfig(({ mode }) => {
  // Endereço da API. Padrão: a API local do `dotnet run` (perfil http). Para trocar, crie apps/desktop/.env
  // a partir do .env.example. Não é segredo: o app instalado precisa saber onde a API está.
  // Servidor de mídia: o endereço real vem da API junto com o token, mas a CSP precisa conhecê-lo no build.
  // Deve ser o mesmo de LiveKit:Url no appsettings da API. A mesma regra vale no electron-builder.ts.
  const { apiUrl, livekitUrl } = serverUrls(loadEnv(mode, import.meta.dirname))

  return {
    main: {},
    preload: {},
    renderer: {
      plugins: [react(), contentSecurityPolicy(buildCsp(apiUrl, livekitUrl))],
      define: {
        'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl),
        'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
      },
      resolve: { alias: { '@shared': resolve(repoRoot, 'shared') } },
      // As regras de conta ficam em <repo>/shared, fora da pasta do app.
      server: { fs: { allow: [import.meta.dirname, resolve(repoRoot, 'shared')] } },
    },
  }
})

/**
 * Injeta a política de segurança do conteúdo (regras em src/build/csp.ts). Vale no app empacotado.
 * No `npm run dev` fica de fora porque o recarregamento ao vivo do React usa script inline.
 */
function contentSecurityPolicy(policy: string): Plugin {
  return {
    name: 'resenha-csp',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' },
    ],
  }
}
