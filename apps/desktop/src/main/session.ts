import { rm, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, ipcMain, safeStorage } from 'electron'

/**
 * Guarda o token de login para o app lembrar da pessoa por 30 dias.
 * O arquivo é criptografado com o safeStorage do Electron, que no Windows usa a proteção da própria
 * conta do usuário (DPAPI): copiado para outro PC ou outro usuário, ele não abre.
 */
const sessionFile = (): string => join(app.getPath('userData'), 'session.bin')

export function registerSessionHandlers(): void {
  ipcMain.handle('session:load', async (): Promise<string | null> => {
    let data: Buffer
    try {
      data = await readFile(sessionFile())
    } catch {
      return null // ainda não fez login neste PC
    }
    try {
      return safeStorage.decryptString(data)
    } catch {
      // Arquivo de outro usuário/PC, ou a chave do Chromium se perdeu (app morto à força no 1º uso).
      // Não tem como recuperar: apaga e pede login de novo.
      await rm(sessionFile(), { force: true })
      return null
    }
  })

  ipcMain.handle('session:save', async (_event, token: unknown): Promise<void> => {
    if (typeof token !== 'string' || token.length === 0 || token.length > 4096) throw new Error('Token inválido.')
    if (!safeStorage.isEncryptionAvailable()) return // sem criptografia não grava em disco; só pede login ao reabrir
    await writeFile(sessionFile(), safeStorage.encryptString(token))
  })

  ipcMain.handle('session:clear', async (): Promise<void> => {
    await rm(sessionFile(), { force: true })
  })
}
