import { BrowserWindow, ipcMain, type BrowserWindowConstructorOptions } from 'electron'

import { isPopoutName } from './popoutName'

/**
 * Janela separada da transmissão de tela. Quem desenha nela é a própria janela principal: window.open('about:blank')
 * e um portal do React. Por isso ela não carrega código nem preload e não conecta no LiveKit de novo; o vídeo é a
 * mesma faixa que já chega na janela principal, e o som continua tocando por lá.
 */

let popout: BrowserWindow | null = null

/** Opções da janela: normal (não fica por cima), redimensionável, sem menu e sem acesso a nada além da página. */
export function popoutWindowOptions(): BrowserWindowConstructorOptions {
  return {
    width: 960,
    height: 560,
    minWidth: 360,
    minHeight: 220,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    // Sem `parent`: no Windows a janela filha fica sempre acima da mãe, e a regra é janela normal por padrão.
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  }
}

/** Liga a janela principal à janela separada que ela abrir. */
export function trackPopout(main: BrowserWindow): void {
  main.webContents.on('did-create-window', (win, { frameName }) => {
    if (!isPopoutName(frameName)) return
    popout = win
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (event) => event.preventDefault())
    win.on('closed', () => {
      if (popout === win) popout = null
    })
  })
  // Sem a janela principal não há vídeo para mostrar (e a separada não pode segurar o app aberto).
  main.on('closed', () => popout?.close())
}

export function registerPopoutHandlers(): void {
  // Alfinete da barra: alterna "sempre por cima".
  ipcMain.handle('popout:always-on-top', (_event, on: unknown): void => {
    if (typeof on !== 'boolean') throw new Error('Valor inválido.')
    popout?.setAlwaysOnTop(on)
  })
}
