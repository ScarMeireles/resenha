import { type ChildProcessWithoutNullStreams, execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, ipcMain, type WebContents } from 'electron'
import { captureArgs, createFrameAligner } from './screenAudioFrames'
import { isValidExe, MAX_EXCLUDED_APPS } from './screenChoice'

/**
 * Áudio da tela no modo "todo o áudio, menos...": o ajudante resenha-audio.exe (apps/audio-helper, em C#)
 * captura o som do Windows por processo e escreve PCM no stdout; aqui ele é repassado para a tela,
 * que monta a faixa e publica no LiveKit.
 */

/** No app instalado o .exe vai em resources/audio; em dev, `npm run build:audio` gera em apps/desktop/resources/audio. */
function helperPath(): string {
  const base = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
  return join(base, 'audio', 'resenha-audio.exe')
}

interface Running {
  child: ChildProcessWithoutNullStreams
  owner: WebContents
  stopping: boolean
}

let running: Running | null = null

function stopCapture(): void {
  const current = running
  running = null
  if (!current) return
  current.stopping = true
  // Fechar o stdin é o sinal combinado para o ajudante sair; se não sair, encerra à força.
  current.child.stdin.end()
  setTimeout(() => { if (current.child.exitCode === null) current.child.kill() }, 1000).unref()
}

function startCapture(owner: WebContents, resenha: boolean, exes: string[]): Promise<void> {
  stopCapture()
  const exe = helperPath()
  if (!existsSync(exe)) return Promise.reject(new Error('Ajudante de áudio não encontrado.'))

  const child = spawn(exe, captureArgs(resenha ? process.pid : null, exes), { windowsHide: true, stdio: 'pipe' })
  const current: Running = { child, owner, stopping: false }
  running = current
  const align = createFrameAligner()
  let errors = ''

  return new Promise<void>((resolve, reject) => {
    let started = false
    child.stdout.on('data', (chunk: Buffer) => {
      if (!started) { started = true; resolve() }
      const frames = align(chunk)
      if (frames && !owner.isDestroyed() && running === current) owner.send('screen-audio:data', frames)
    })
    child.stderr.on('data', (chunk: Buffer) => { errors = (errors + chunk.toString()).slice(-500) })
    child.on('error', (error) => {
      if (!started) reject(error)
    })
    child.on('exit', (code) => {
      if (running === current) running = null
      if (!started) return reject(new Error(errors.trim() || `O ajudante de áudio saiu com código ${code}.`))
      if (!current.stopping && !owner.isDestroyed()) owner.send('screen-audio:ended')
    })
    owner.once('destroyed', () => { if (running === current) stopCapture() })
  })
}

function listApps(): Promise<string[]> {
  const exe = helperPath()
  if (!existsSync(exe)) return Promise.reject(new Error('Ajudante de áudio não encontrado.'))
  return new Promise((resolve, reject) => {
    execFile(exe, ['list', '--exclude-pid', String(process.pid)], { windowsHide: true, timeout: 5000 }, (error, stdout) => {
      if (error) return reject(error)
      try {
        const parsed: unknown = JSON.parse(stdout)
        resolve(Array.isArray(parsed) ? parsed.filter(isValidExe) : [])
      } catch (e) {
        reject(e)
      }
    })
  })
}

export function registerScreenAudioHandlers(): void {
  ipcMain.handle('screen-audio:apps', () => listApps())

  ipcMain.handle('screen-audio:start', (event, value: unknown) => {
    const { resenha, exes } = (value ?? {}) as Record<string, unknown>
    if (typeof resenha !== 'boolean' || !Array.isArray(exes) || exes.length > MAX_EXCLUDED_APPS || !exes.every(isValidExe))
      throw new Error('Pedido de áudio inválido.')
    if (!resenha && exes.length === 0) throw new Error('Nada para excluir do áudio.')
    return startCapture(event.sender, resenha, exes)
  })

  ipcMain.handle('screen-audio:stop', (event) => {
    if (running?.owner === event.sender) stopCapture()
  })

  app.on('will-quit', stopCapture)
}
