/**
 * Versão deste app (a "version" do package.json, gravada no build) e o aviso de "versão velha".
 * Toda chamada à API leva a versão; se o servidor tiver uma mais nova publicada, responde 426 e o App.tsx
 * troca a tela pela de "Atualizando…" (R13).
 */

export const appVersion: string = import.meta.env.VITE_APP_VERSION ?? '0.0.0'

/** Mesmo nome que server/api/Updates/UpdateEndpoints.cs. */
export const VERSION_HEADER = 'X-Resenha-Version'
/** O WebSocket do SignalR não manda cabeçalho próprio; a versão vai na URL do hub. */
export const VERSION_QUERY = 'resenha-version'

export const UPGRADE_REQUIRED = 426

type Listener = () => void
const listeners = new Set<Listener>()

/** Avisa quem estiver ouvindo (o App) que a API recusou esta versão. */
export function notifyUpgradeRequired(): void {
  for (const listener of listeners) listener()
}

/** Ouve o aviso de versão velha. Devolve a função que cancela. */
export function onUpgradeRequired(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** URL do hub com a versão: "http://x/hubs/app" → "http://x/hubs/app?resenha-version=1.2.3". */
export const withVersionQuery = (url: string): string =>
  `${url}${url.includes('?') ? '&' : '?'}${VERSION_QUERY}=${encodeURIComponent(appVersion)}`
