/**
 * Política de segurança do conteúdo do app empacotado: a janela só carrega código do próprio app e só conversa
 * com a API (HTTP + WebSocket do SignalR) e com o servidor de mídia LiveKit (WebSocket + HTTP de validação).
 * Fica num arquivo próprio para ter teste; quem usa é o electron.vite.config.mts.
 */

const trim = (url: string) => url.replace(/\/+$/, '')

/** "http://x" → ["http://x", "ws://x"]; "wss://y" → ["https://y", "wss://y"]. */
export function httpAndWs(url: string): string[] {
  const u = trim(url)
  const rest = u.replace(/^(https?|wss?):\/\//, '')
  const secure = /^(https|wss):/.test(u)
  return secure ? [`https://${rest}`, `wss://${rest}`] : [`http://${rest}`, `ws://${rest}`]
}

export function buildCsp(apiUrl: string, livekitUrl: string): string {
  const api = trim(apiUrl)
  const connect = [...new Set(["'self'", ...httpAndWs(api), ...httpAndWs(livekitUrl)])]
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    `img-src 'self' data: blob: ${api}`,
    `connect-src ${connect.join(' ')}`,
  ].join('; ')
}
