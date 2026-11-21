import { app, ipcMain, type WebContents } from 'electron'
import { autoUpdater } from 'electron-updater'
import { describeUpdateError, NOTHING_TO_DOWNLOAD, type UpdateOutcome, type UpdateProgress, type UpdateReason } from './updateRules'

/**
 * Atualização obrigatória (R13). O endereço vem do app-update.yml que o electron-builder grava no instalador
 * (`${VITE_API_URL}/updates`, ver electron-builder.ts). Sem perguntar nada: se o servidor tem versão mais nova,
 * baixa, fecha, instala em silêncio e reabre. A tela só mostra "Atualizando…" com o progresso.
 */
export function registerUpdateHandlers(): void {
  autoUpdater.autoDownload = false // quem decide a hora é o run(), para o erro de download voltar para a tela
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowDowngrade = false

  let running: Promise<UpdateOutcome> | null = null
  ipcMain.handle('updates:run', (event, reason: UpdateReason) => {
    // Vários 426 seguidos (ou o 426 chegando junto com a checagem de abertura) viram uma atualização só.
    running ??= run(reason, event.sender).finally(() => { running = null })
    return running
  })
}

async function run(reason: UpdateReason, sender: WebContents): Promise<UpdateOutcome> {
  if (!app.isPackaged) return reason === 'required' ? { kind: 'dev' } : { kind: 'upToDate' }

  try {
    const result = await autoUpdater.checkForUpdates()
    if (!result?.isUpdateAvailable) {
      return reason === 'required' ? { kind: 'error', stage: 'check', message: NOTHING_TO_DOWNLOAD } : { kind: 'upToDate' }
    }
  } catch (error) {
    return { kind: 'error', stage: 'check', message: describeUpdateError('check', error) }
  }

  const send = (progress: UpdateProgress) => { if (!sender.isDestroyed()) sender.send('updates:progress', progress) }
  const onProgress = (info: { percent: number; transferred: number; total: number }) =>
    send({ percent: info.percent, transferred: info.transferred, total: info.total })
  send({ percent: 0, transferred: 0, total: 0 })
  autoUpdater.on('download-progress', onProgress)
  try {
    await autoUpdater.downloadUpdate()
  } catch (error) {
    return { kind: 'error', stage: 'download', message: describeUpdateError('download', error) }
  } finally {
    autoUpdater.off('download-progress', onProgress)
  }

  // Silencioso (/S, sem assistente) e reabre o app no fim. O instalador usa a mesma pasta da instalação atual.
  setImmediate(() => autoUpdater.quitAndInstall(true, true))
  return { kind: 'installing' }
}
