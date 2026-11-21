/**
 * Endereços do servidor gravados no app na hora do build (VITE_API_URL e VITE_LIVEKIT_URL, do .env /
 * .env.production). Fica num arquivo próprio porque dois lugares precisam da mesma regra: o electron.vite.config.mts
 * (tela e CSP) e o electron-builder.ts (endereço das atualizações automáticas).
 */

export interface ServerUrls {
  apiUrl: string
  livekitUrl: string
}

/** Padrão: a API e o LiveKit do ambiente de desenvolvimento (dotnet run + infra/). */
export function serverUrls(env: Record<string, string | undefined>): ServerUrls {
  return {
    apiUrl: (env['VITE_API_URL'] || 'http://localhost:5280').replace(/\/+$/, ''),
    livekitUrl: env['VITE_LIVEKIT_URL'] || 'ws://localhost:7880',
  }
}

/** A API serve latest.yml e o instalador em /updates (server/api/Updates). */
export const updatesUrl = (apiUrl: string): string => `${apiUrl.replace(/\/+$/, '')}/updates`
