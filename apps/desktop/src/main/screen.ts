import { desktopCapturer, ipcMain, session } from 'electron'
import { createChoiceStore, isValidChoice } from './screenChoice'

/**
 * Compartilhar tela: a tela (React) lista as fontes e manda a escolha; quando o Chromium pede a captura
 * (getDisplayMedia), o handler abaixo entrega exatamente a fonte escolhida, sem o seletor nativo.
 * `getOwnSourceId` devolve o id de captura da janela do Resenha, para ela não aparecer na lista.
 */
export function registerScreenHandlers(getOwnSourceId: () => string | null): void {
  const store = createChoiceStore()

  ipcMain.handle('screen:sources', async () => {
    const own = getOwnSourceId()
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 } })
    return sources
      .filter((s) => s.id !== own && !s.thumbnail.isEmpty())
      .map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.id.startsWith('screen:') ? ('screen' as const) : ('window' as const),
        thumbnail: s.thumbnail.toDataURL(),
      }))
  })

  ipcMain.handle('screen:choose', (_event, value: unknown): void => {
    if (!isValidChoice(value)) throw new Error('Escolha de tela inválida.')
    store.set(value)
  })

  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const choice = store.take()
      if (!choice) return callback({}) // sem escolha feita no seletor: nega
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] })
      const source = sources.find((s) => s.id === choice.sourceId)
      if (!source) return callback({})
      // No Windows, 'loopback' captura o áudio do sistema inteiro (não só da janela escolhida), inclusive o do Resenha.
      // O modo "menos estes apps" não passa por aqui: o som vem do ajudante (screenAudio.ts).
      callback({ video: source, ...(choice.audio.mode === 'all' ? { audio: 'loopback' as const } : {}) })
    } catch {
      callback({})
    }
  })
}
