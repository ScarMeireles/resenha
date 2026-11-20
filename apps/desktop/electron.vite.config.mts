import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'electron-vite'
import type { Plugin } from 'vite'

const repoRoot = resolve(import.meta.dirname, '../..')

export default defineConfig(({ mode }) => {
  // Endereço da API. Padrão: a API local do `dotnet run` (perfil http). Para trocar, crie apps/desktop/.env
  // a partir do .env.example. Não é segredo: o app instalado precisa saber onde a API está.
  const apiUrl = (loadEnv(mode, import.meta.dirname).VITE_API_URL || 'http://localhost:5280').replace(/\/+$/, '')

  return {
    main: {},
    preload: {},
    renderer: {
      plugins: [react(), contentSecurityPolicy(apiUrl)],
      define: { 'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl) },
      resolve: { alias: { '@shared': resolve(repoRoot, 'shared') } },
      // As regras de conta ficam em <repo>/shared, fora da pasta do app.
      server: { fs: { allow: [import.meta.dirname, resolve(repoRoot, 'shared')] } },
    },
  }
})

/**
 * Política de segurança do conteúdo: a janela só carrega código do próprio app e só conversa com a API.
 * Vale no app empacotado. No `npm run dev` fica de fora porque o recarregamento ao vivo do React usa script inline.
 */
function contentSecurityPolicy(apiUrl: string): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    `img-src 'self' data: blob: ${apiUrl}`,
    `connect-src 'self' ${apiUrl}`,
  ].join('; ')

  return {
    name: 'resenha-csp',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' },
    ],
  }
}
